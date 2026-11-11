"""
Offline demo mode (--mock): lets you open and test the web UI without ROS 2,
Gazebo or Nav2 (e.g. on a laptop, or to design the UI).

It reuses the real queue (TaskQueueManager) and battery model (BatterySimulator)
from cstam_core and feeds the TelemetryStore with the same message formats the
ROS nodes publish. The robot moves in a straight line between waypoints: this is
NOT the navigation stack, and the UI shows a "Demo mode" banner while it runs.

The admin "Pedestrian" buttons also work here: a simulated person walks or
stands on the robot's route, and the robot goes around them (a simple side
detour that imitates what Nav2 does with the real obstacle), without stopping.
"""
from __future__ import annotations

import math
import os
import sys
import threading
import time

from .store import TelemetryStore

try:
    from cstam_core.delivery_task_manager import TaskQueueManager
    from cstam_core.battery_simulator import BatterySimulator
except ImportError:  # running from a source checkout without the workspace sourced
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "cstam_core")))
    from cstam_core.delivery_task_manager import TaskQueueManager
    from cstam_core.battery_simulator import BatterySimulator

LOW_PCT, CRITICAL_PCT, RECHARGE_PCT = 25.0, 15.0, 80.0
SPEED = 0.6       # m/s
DWELL_S = 4.0     # time spent at the table
DT = 0.2
PED_SPEED = 0.5    # m/s, simulated pedestrian
DETOUR_SIDE = 1.3  # m, lateral clearance when going around the pedestrian
DETOUR_SPEED = 0.4


class MockRobot:
    def __init__(self, store: TelemetryStore, time_scale: float = 40.0):
        self.store = store
        self.store.mode = "mock"
        self.mgr = TaskQueueManager(waypoints={k: dict(v) for k, v in store.waypoints.items()})
        self.battery = BatterySimulator(initial_percentage=100.0, time_scale=time_scale)
        dock = store.waypoints.get("Dock", {"x": 0.0, "y": 0.0})
        self.x, self.y, self.yaw = dock["x"], dock["y"], 0.0
        self.mgr.robot_state = "docked"
        self.target = None
        self.dwell_until = None
        self.lock_orders = False
        self._lock = threading.Lock()
        self._obstacle_mode = "clear"
        self.ped = None          # [x, y] of the simulated pedestrian, None when cleared
        self.ped_goal = None     # where the pedestrian is walking to
        self.ped_patrol = None   # (a, b) end points for the patrol mode
        self.detour = None       # list of (x, y) points while going around the pedestrian

    # --------------------------------------------------------------- commands
    def send_delivery(self, target: str, item: str, order_ref: str) -> None:
        with self._lock:
            self.mgr.add_delivery_request(target, item)

    def cancel_task(self, task_id: str) -> None:
        with self._lock:
            if not self.mgr.delete_task(task_id) and self.mgr.cancel_current_task(task_id):
                self.target, self.dwell_until = None, None
                self.mgr.robot_state = "idle"

    def dock_now(self, reason: str = "ADMIN") -> None:
        with self._lock:
            self._go_dock()

    def cancel_dock(self) -> None:
        with self._lock:
            if self.mgr.robot_state == "docking":
                self.target = None
                self.mgr.robot_state = "idle"

    def set_battery(self, percentage: float) -> None:
        with self._lock:
            self.battery.set_percentage(percentage)

    def set_obstacle_mode(self, mode: str) -> None:
        with self._lock:
            self._obstacle_mode = mode
            self._place_pedestrian(mode)

    # --------------------------------------------------------------- pedestrian
    def _route_frame(self, ahead: float):
        """Point `ahead` m in front of the robot on its route, plus the unit and normal vectors."""
        if self.target and self.target in self.mgr.waypoints:
            wp = self.mgr.waypoints[self.target]
            dx, dy = wp["x"] - self.x, wp["y"] - self.y
            d = math.hypot(dx, dy) or 1.0
            ux, uy = dx / d, dy / d
            a = min(ahead, max(0.0, d - 1.2))
        else:
            ux, uy, a = math.cos(self.yaw), math.sin(self.yaw), ahead
        return (self.x + ux * a, self.y + uy * a), (ux, uy), (-uy, ux)

    def _place_pedestrian(self, mode: str) -> None:
        self.ped_patrol = None
        if mode == "clear":
            self.ped, self.ped_goal = None, None
            return
        (cx, cy), _u, (nx, ny) = self._route_frame(3.5)
        if mode == "block":      # steps onto the route and stands there
            self.ped, self.ped_goal = [cx + nx * 0.6, cy + ny * 0.6], (cx, cy)
        elif mode == "cross":    # walks across the route in front of the robot
            self.ped, self.ped_goal = [cx + nx * 1.6, cy + ny * 1.6], (cx - nx * 1.6, cy - ny * 1.6)
        else:                    # patrol: walks back and forth across the route
            a, b = (cx + nx * 1.5, cy + ny * 1.5), (cx - nx * 1.5, cy - ny * 1.5)
            self.ped, self.ped_goal, self.ped_patrol = [a[0], a[1]], b, (a, b)

    def _move_pedestrian(self) -> None:
        if not self.ped or not self.ped_goal:
            return
        dx, dy = self.ped_goal[0] - self.ped[0], self.ped_goal[1] - self.ped[1]
        d = math.hypot(dx, dy)
        if d < 0.05:
            if self.ped_patrol:
                a, b = self.ped_patrol
                self.ped_goal = a if self.ped_goal == b else b
            return
        step = min(d, PED_SPEED * DT)
        self.ped[0] += dx / d * step
        self.ped[1] += dy / d * step

    def _plan_detour(self, gx: float, gy: float):
        """Waypoints around the pedestrian when it is on the straight route, else None."""
        if not self.ped:
            return None
        dx, dy = gx - self.x, gy - self.y
        d = math.hypot(dx, dy)
        if d < 0.5:
            return None
        ux, uy = dx / d, dy / d
        px, py = self.ped[0] - self.x, self.ped[1] - self.y
        along, lateral = px * ux + py * uy, -px * uy + py * ux
        if not (0.2 < along < min(3.0, d - 0.3)) or abs(lateral) > 1.0:
            return None
        side = -1.0 if lateral > 0 else 1.0       # pass on the side away from the person
        nx, ny = -uy * side, ux * side
        c = DETOUR_SIDE
        return [(self.ped[0] - ux * 0.5 + nx * c, self.ped[1] - uy * 0.5 + ny * c),
                (self.ped[0] + ux * 0.7 + nx * c, self.ped[1] + uy * 0.7 + ny * c)]

    # --------------------------------------------------------------- loop
    def _go_dock(self):
        if self.mgr.current_task and self.mgr.robot_state == "navigating":
            self.mgr.requeue_current_task(front=True)
        elif self.mgr.current_task:
            self.mgr.complete_current_task(success=True)
        self.dwell_until = None
        self.target = "Dock"
        self.mgr.robot_state = "docking"

    def step(self):
        with self._lock:
            now = time.time()
            state = self.mgr.robot_state
            pct = self.battery.percentage

            # Battery policy (same thresholds as cstam_system.launch.py)
            if pct <= CRITICAL_PCT and state not in ("docking", "docked"):
                self.lock_orders = True
                self._go_dock()
            elif pct <= LOW_PCT and state == "idle":
                self.lock_orders = True
                self._go_dock()
            if self.lock_orders and pct >= RECHARGE_PCT:
                self.lock_orders = False

            state = self.mgr.robot_state
            if state in ("idle", "docked") and self.mgr.queue and not self.lock_orders:
                task = self.mgr.get_next_task()
                self.target = task["target"]
                self.mgr.robot_state = "navigating"
            elif state == "idle" and not self.mgr.queue and not self.mgr.current_task:
                self._go_dock()

            # Motion
            moving = self.mgr.robot_state in ("navigating", "docking") and self.target
            if moving:
                wp = self.mgr.waypoints[self.target]
                dx, dy = wp["x"] - self.x, wp["y"] - self.y
                dist = math.hypot(dx, dy)
                if dist < 0.1:
                    if self.mgr.robot_state == "docking":
                        self.mgr.robot_state = "docked"
                        self.target = None
                    else:
                        self.mgr.robot_state = "at_table"
                        self.dwell_until = now + DWELL_S
                else:
                    if self.detour is None:
                        pts = self._plan_detour(wp["x"], wp["y"])
                        if pts:
                            self.detour = pts
                            self.store.add_event("warn", "Person on the route: new path around them, no stop.")
                    speed = SPEED
                    if self.detour:
                        tx, ty = self.detour[0]
                        if math.hypot(tx - self.x, ty - self.y) < 0.15:
                            self.detour.pop(0)
                            if not self.detour:
                                self.detour = None
                                self.store.add_event("info", "Person passed: back on the direct route.")
                        speed = DETOUR_SPEED
                    if self.detour:
                        tx, ty = self.detour[0]
                    else:
                        tx, ty = wp["x"], wp["y"]
                    ddx, ddy = tx - self.x, ty - self.y
                    step = min(math.hypot(ddx, ddy), speed * DT)
                    self.yaw = math.atan2(ddy, ddx)
                    self.x += step * math.cos(self.yaw)
                    self.y += step * math.sin(self.yaw)
            if self.mgr.robot_state == "at_table" and self.dwell_until and now >= self.dwell_until:
                self.mgr.complete_current_task(success=True)
                self.dwell_until, self.target = None, None
                self.mgr.robot_state = "idle"

            if not moving:
                self.detour = None
            self._move_pedestrian()
            ped = list(self.ped) if self.ped else None
            detour = list(self.detour or [])

            self.battery.is_moving = bool(moving)
            self.battery.is_docked = self.mgr.robot_state == "docked"
            self.battery.update(dt=DT)

            summary = self.mgr.get_status_summary()
            summary["battery_docking_lock"] = self.lock_orders

        self.store.update_battery(self.battery.get_status_summary())
        self.store.update_queue_status(summary)
        self.store.update_robot_state(summary["robot_state"])
        self.store.update_pose(self.x, self.y, self.yaw)
        if moving:
            wp = self.mgr.waypoints[self.target]
            pts = [(self.x, self.y)] + detour + [(wp["x"], wp["y"])]
            self.store.update_plan([{"x": round(px, 2), "y": round(py, 2)} for px, py in pts])
        else:
            self.store.update_plan([])
        if ped:
            dist = math.hypot(ped[0] - self.x, ped[1] - self.y)
            self.store.update_obstacle({"mode": self._obstacle_mode, "x": round(ped[0], 2), "y": round(ped[1], 2),
                                        "speed": PED_SPEED, "distance_to_robot": round(dist, 2),
                                        "is_blocking": dist < 1.2})
        elif self._obstacle_mode == "clear" and self.store.obstacle:
            self.store.update_obstacle({})

    def start(self):
        def run():
            while True:
                try:
                    self.step()
                except Exception as e:  # keep the demo alive
                    print(f"[mock] step error: {e}")
                time.sleep(DT)
        threading.Thread(target=run, daemon=True).start()
        return self
