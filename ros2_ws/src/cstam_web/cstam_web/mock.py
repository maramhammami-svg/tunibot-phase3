"""
Offline demo mode (--mock): lets you open and test the web UI without ROS 2,
Gazebo or Nav2 (e.g. on a laptop, or to design the UI).

It reuses the real queue (TaskQueueManager) and battery model (BatterySimulator)
from cstam_core and feeds the TelemetryStore with the same message formats the
ROS nodes publish. The robot moves in a straight line between waypoints: this is
NOT the navigation stack, and the UI shows a "Demo mode" banner while it runs.
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
        self._obstacle_mode = mode

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
                    step = min(dist, SPEED * DT)
                    self.yaw = math.atan2(dy, dx)
                    self.x += step * math.cos(self.yaw)
                    self.y += step * math.sin(self.yaw)
            if self.mgr.robot_state == "at_table" and self.dwell_until and now >= self.dwell_until:
                self.mgr.complete_current_task(success=True)
                self.dwell_until, self.target = None, None
                self.mgr.robot_state = "idle"

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
            self.store.update_plan([{"x": round(self.x, 2), "y": round(self.y, 2)}, {"x": wp["x"], "y": wp["y"]}])
        else:
            self.store.update_plan([])

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
