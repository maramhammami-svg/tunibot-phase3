"""
Thread-safe telemetry store for the CSTAM web interface.

The store only mirrors what the ROS 2 nodes publish (task manager, battery
simulator, dynamic obstacle, AMCL / Nav2). It never runs its own copy of the
queue or battery model, so the web UI always shows the same state as the robot.

It is plain Python (no rclpy import) so it can be unit tested without ROS.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

# A source is considered offline when nothing was received for this long.
# The battery simulator publishes at 1 Hz and the task manager on every change,
# so the battery topic is used as the heartbeat of the robot stack.
ONLINE_TIMEOUT_S = 3.0

# An order that never shows up in the task manager queue after this delay was
# most likely rejected (unknown table, task manager not running...).
ORDER_ACK_TIMEOUT_S = 8.0

# Robot states published on /robot_system_state by delivery_task_manager
MOVING_STATES = {"navigating", "recovering", "docking"}

BATTERY_HISTORY_LEN = 300  # 5 minutes at 1 sample/s


class TelemetryStore:
    def __init__(self, world: str = "restaurant", waypoints: Optional[Dict[str, Dict[str, float]]] = None,
                 clock=time.time):
        self._lock = threading.RLock()
        self._clock = clock
        self.world = world
        self.waypoints: Dict[str, Dict[str, float]] = dict(waypoints or {})
        self.mode = "ros"  # "ros" or "mock"

        self.robot_state = "unknown"
        self.queue_status: Dict[str, Any] = {
            "robot_state": "unknown",
            "current_task": None,
            "queue_length": 0,
            "pending_tasks": [],
            "completed_count": 0,
            "battery_docking_lock": False,
        }
        self.battery: Dict[str, Any] = {}
        self.pose: Optional[Dict[str, float]] = None
        self.plan: List[Dict[str, float]] = []
        self.obstacle: Dict[str, Any] = {}

        self._last_seen: Dict[str, float] = {}
        self.battery_history: deque = deque(maxlen=BATTERY_HISTORY_LEN)
        self._last_history_sample = 0.0

        # Orders placed from the web UI, keyed by order_ref (a web-side id only)
        self.orders: Dict[str, Dict[str, Any]] = {}
        self._seen_task_ids: set = set()

        # Short event feed for the admin view
        self.events: deque = deque(maxlen=60)
        self._event_seq = 0

    # ------------------------------------------------------------------ inputs
    def _touch(self, source: str):
        self._last_seen[source] = self._clock()

    def set_world(self, world: str, waypoints: Optional[Dict[str, Dict[str, float]]] = None):
        with self._lock:
            if world != self.world:
                self.add_event("info", f"World changed to '{world}'.")
            self.world = world
            if waypoints:
                self.waypoints = dict(waypoints)

    def update_queue_status(self, status: Dict[str, Any]):
        with self._lock:
            prev_state = self.queue_status.get("robot_state")
            prev_lock = self.queue_status.get("battery_docking_lock", False)
            merged = dict(self.queue_status)
            merged.update(status or {})
            self.queue_status = merged
            self._touch("queue")
            new_state = merged.get("robot_state", prev_state)
            if new_state and new_state != prev_state:
                self._on_state_change(prev_state, new_state)
            if merged.get("battery_docking_lock") and not prev_lock:
                self.add_event("warn", "Battery lock engaged: new orders wait until the robot has recharged.")
            elif prev_lock and not merged.get("battery_docking_lock"):
                self.add_event("info", "Battery recharged: order dispatch unlocked.")
            self._refresh_orders()

    def update_robot_state(self, state: str):
        with self._lock:
            state = (state or "").strip()
            if not state:
                return
            prev = self.robot_state
            self.robot_state = state
            self._touch("state")
            if state != prev and state != self.queue_status.get("robot_state"):
                self._on_state_change(prev, state)
            self.queue_status["robot_state"] = state
            self._refresh_orders()

    def update_battery(self, battery: Dict[str, Any]):
        with self._lock:
            prev = self.battery
            self.battery = dict(battery or {})
            self._touch("battery")
            now = self._clock()
            if now - self._last_history_sample >= 1.0 and "percentage" in self.battery:
                self.battery_history.append({"t": round(now, 1), "pct": self.battery.get("percentage")})
                self._last_history_sample = now
            if self.battery.get("is_critical") and not prev.get("is_critical"):
                self.add_event("alert", f"Battery critical ({self.battery.get('percentage')}%): emergency return to dock.")
            elif self.battery.get("is_low") and not prev.get("is_low"):
                self.add_event("warn", f"Battery low ({self.battery.get('percentage')}%): robot will return to dock.")

    def update_pose(self, x: float, y: float, yaw: float):
        with self._lock:
            self.pose = {"x": round(float(x), 3), "y": round(float(y), 3), "yaw": round(float(yaw), 3)}
            self._touch("pose")

    def update_plan(self, points: List[Dict[str, float]]):
        with self._lock:
            self.plan = list(points)
            self._touch("plan")

    def update_obstacle(self, obstacle: Dict[str, Any]):
        with self._lock:
            prev_blocking = bool(self.obstacle.get("is_blocking"))
            self.obstacle = dict(obstacle or {})
            self._touch("obstacle")
            if self.obstacle.get("is_blocking") and not prev_blocking:
                self.add_event("warn", "Person close to the robot: slowing down / yielding.")

    # ------------------------------------------------------------------ events
    def add_event(self, level: str, message: str):
        with self._lock:
            self._event_seq += 1
            self.events.append({"id": self._event_seq, "t": round(self._clock(), 1), "level": level, "message": message})

    def _on_state_change(self, prev: Optional[str], new: str):
        labels = {
            "idle": "Robot idle, ready for orders.",
            "navigating": "Robot on its way.",
            "at_table": "Robot arrived at the table.",
            "recovering": "Navigation problem: running recovery maneuver.",
            "docking": "Robot returning to the dock.",
            "docked": "Robot docked and charging.",
        }
        level = "warn" if new == "recovering" else "info"
        self.add_event(level, labels.get(new, f"Robot state: {new}."))

    # ------------------------------------------------------------------ orders
    def register_order(self, order_ref: str, target: str, items: List[Dict[str, Any]], label: str):
        with self._lock:
            self.orders[order_ref] = {
                "order_ref": order_ref,
                "target": target,
                "items": items,
                "label": label,
                "created_at": self._clock(),
                "status": "submitted",
                "task_id": None,
                "queue_position": None,
                "seen": False,
            }
            self.add_event("info", f"New order for {target}: {label}")
            self._refresh_orders()

    def get_order(self, order_ref: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            self._refresh_orders()
            order = self.orders.get(order_ref)
            if order is None:
                return None
            out = {k: v for k, v in order.items() if k not in ("seen", "completed_seen")}
            return out

    def _match_new_tasks(self, tasks: List[Dict[str, Any]]):
        """Links web orders to the task ids the task manager created for them.

        The Phase 1/2 task manager is left untouched, so it knows nothing about
        web orders. A task that appears for the first time, for the same table
        and with the same item text as a waiting web order, is that order.
        """
        for task in tasks:
            tid = task.get("id")
            if not tid or tid in self._seen_task_ids:
                continue
            self._seen_task_ids.add(tid)
            waiting = [o for o in self.orders.values()
                       if o["task_id"] is None and o["status"] == "submitted"
                       and str(o["target"]).lower() == str(task.get("target", "")).lower()
                       and o["label"] == task.get("item")]
            if not waiting:
                continue
            order = min(waiting, key=lambda o: o["created_at"])
            order["task_id"] = tid

    def _refresh_orders(self):
        """Derives each web order's status from the task manager's own queue status."""
        qs = self.queue_status
        pending = qs.get("pending_tasks") or []
        current = qs.get("current_task")
        completed = int(qs.get("completed_count") or 0)
        robot_state = qs.get("robot_state") or self.robot_state
        now = self._clock()

        self._match_new_tasks(([current] if current else []) + list(pending))

        for order in self.orders.values():
            if order["status"] in ("delivered", "failed", "cancelled", "rejected"):
                continue
            tid = order["task_id"]

            if tid is None:
                if now - order["created_at"] > ORDER_ACK_TIMEOUT_S and self.is_online():
                    order.update(status="rejected")
                continue

            idx = next((i for i, t in enumerate(pending) if t.get("id") == tid), None)
            if idx is not None:
                order.update(status="queued", queue_position=idx + 1 + (1 if current else 0),
                             completed_seen=completed, seen=True)
            elif current and current.get("id") == tid:
                status = "arrived" if robot_state == "at_table" else "en_route"
                order.update(status=status, queue_position=0, completed_seen=completed, seen=True)
            elif order["seen"]:
                # The task left the queue. The task manager's success counter tells
                # a delivery apart from a failure / cancellation.
                if completed > order.get("completed_seen", completed):
                    order.update(status="delivered", queue_position=None)
                elif order["status"] in ("en_route", "arrived"):
                    order.update(status="failed", queue_position=None)
                else:
                    order.update(status="cancelled", queue_position=None)

    def mark_order_cancelled(self, order_ref: str):
        with self._lock:
            if order_ref in self.orders:
                self.orders[order_ref].update(status="cancelled", queue_position=None)

    # ------------------------------------------------------------------ outputs
    def is_online(self, source: str = "battery") -> bool:
        with self._lock:
            ts = self._last_seen.get(source)
            return ts is not None and (self._clock() - ts) < ONLINE_TIMEOUT_S

    def availability(self) -> Dict[str, Any]:
        """Client-facing summary: can the robot take an order, and how long is the wait."""
        with self._lock:
            online = self.is_online("battery") or self.is_online("queue")
            qs = self.queue_status
            state = qs.get("robot_state") or self.robot_state
            ahead = int(qs.get("queue_length") or 0) + (1 if qs.get("current_task") else 0)
            pct = self.battery.get("percentage")
            locked = bool(qs.get("battery_docking_lock")) or bool(self.battery.get("is_low") and state in ("docking", "docked"))
            if not online:
                return {"accepting": False, "level": "offline", "orders_ahead": ahead,
                        "message": "The robot is offline. Please ask the staff."}
            if locked:
                return {"accepting": True, "level": "charging", "orders_ahead": ahead,
                        "message": f"The robot is recharging ({pct}%). Your order will leave as soon as it is ready."}
            if ahead == 0:
                return {"accepting": True, "level": "ready", "orders_ahead": 0, "message": "Robot available."}
            return {"accepting": True, "level": "busy", "orders_ahead": ahead,
                    "message": f"Robot busy: {ahead} order(s) before yours."}

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            qs = self.queue_status
            return {
                "timestamp": round(self._clock(), 2),
                "mode": self.mode,
                "world": self.world,
                "online": {
                    "robot": self.is_online("battery") or self.is_online("queue"),
                    "battery": self.is_online("battery"),
                    "task_manager": self.is_online("queue") or self.is_online("state"),
                    "localization": self.is_online("pose"),
                    "obstacle": self.is_online("obstacle"),
                },
                "robot_state": qs.get("robot_state") or self.robot_state,
                "current_task": qs.get("current_task"),
                "pending_tasks": list(qs.get("pending_tasks") or []),
                "queue_length": qs.get("queue_length", 0),
                "completed_count": qs.get("completed_count", 0),
                "battery_docking_lock": bool(qs.get("battery_docking_lock")),
                "battery": dict(self.battery),
                "battery_history": list(self.battery_history),
                "pose": dict(self.pose) if self.pose else None,
                "plan": list(self.plan),
                "obstacle": dict(self.obstacle),
                "availability": self.availability(),
                "events": list(self.events)[-25:],
            }
