"""
ROS 2 side of the web interface.

Subscribes to the topics already published by the Phase 1/2 nodes and writes
them into the TelemetryStore; publishes the commands coming from the web UI on
the topics those nodes already listen to. No robot logic lives here.

  Subscribed                      Published
  /delivery_queue_status (JSON)   /delivery_request      {"target","item","order_ref"}
  /robot_system_state             /delivery_task_action  {"action":"delete","task_id"}
  /battery_status (JSON)          /dock_command          DOCK_NOW:<reason> | STOP
  /amcl_pose + TF map->base       /battery_set_percentage "<pct>"   (test tool)
  /plan (Nav2 global path)        /dynamic_obstacle/control <mode>  (test tool)
  /dynamic_obstacle/status (JSON)
  /delivery_waypoints (latched)
"""
from __future__ import annotations

import json
import math
import threading

import rclpy
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile
from rclpy.time import Time
from geometry_msgs.msg import PoseWithCovarianceStamped
from nav_msgs.msg import Path
from std_msgs.msg import String

try:
    from tf2_ros import Buffer, TransformListener
    HAVE_TF = True
except ImportError:  # pragma: no cover
    HAVE_TF = False

from .store import TelemetryStore
from .world import load_waypoints, normalize_world


def _yaw(q) -> float:
    return math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z))


class WebBridgeNode(Node):
    def __init__(self, store: TelemetryStore):
        super().__init__("cstam_web_bridge")
        self.store = store

        self.req_pub = self.create_publisher(String, "/delivery_request", 10)
        self.action_pub = self.create_publisher(String, "/delivery_task_action", 10)
        self.dock_pub = self.create_publisher(String, "/dock_command", 10)
        self.battery_pub = self.create_publisher(String, "/battery_set_percentage", 10)
        self.obstacle_pub = self.create_publisher(String, "/dynamic_obstacle/control", 10)

        latched = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL)
        self.create_subscription(String, "/delivery_queue_status", self._queue_cb, 10)
        self.create_subscription(String, "/robot_system_state", self._state_cb, 10)
        self.create_subscription(String, "/battery_status", self._battery_cb, 10)
        self.create_subscription(PoseWithCovarianceStamped, "/amcl_pose", self._amcl_cb, 10)
        self.create_subscription(Path, "/plan", self._plan_cb, 10)
        self.create_subscription(String, "/dynamic_obstacle/status", self._obstacle_cb, 10)
        self.create_subscription(String, "/delivery_waypoints", self._waypoints_cb, latched)

        if HAVE_TF:
            self.tf_buffer = Buffer()
            self.tf_listener = TransformListener(self.tf_buffer, self)
            self.create_timer(0.2, self._tf_poll)

        self.get_logger().info("CSTAM web bridge connected to ROS 2 topics.")

    # ---------------------------------------------------------- subscriptions
    @staticmethod
    def _json(msg: String):
        try:
            return json.loads(msg.data)
        except (ValueError, TypeError):
            return None

    def _queue_cb(self, msg: String):
        data = self._json(msg)
        if isinstance(data, dict):
            self.store.update_queue_status(data)

    def _state_cb(self, msg: String):
        state = (msg.data or "").strip()
        if state and state != getattr(self, "_last_state", None):
            self.get_logger().info(f"Robot state: {state}")
            self._last_state = state
        self.store.update_robot_state(msg.data)

    def _battery_cb(self, msg: String):
        data = self._json(msg)
        if isinstance(data, dict):
            self.store.update_battery(data)

    def _amcl_cb(self, msg: PoseWithCovarianceStamped):
        p = msg.pose.pose
        self.store.update_pose(p.position.x, p.position.y, _yaw(p.orientation))

    def _tf_poll(self):
        for frame in ("base_footprint", "base_link"):
            try:
                t = self.tf_buffer.lookup_transform("map", frame, Time())
            except Exception:
                continue
            tr = t.transform
            self.store.update_pose(tr.translation.x, tr.translation.y, _yaw(tr.rotation))
            return

    def _plan_cb(self, msg: Path):
        poses = msg.poses
        if not poses:
            self.store.update_plan([])
            return
        step = max(1, len(poses) // 60)
        pts = [{"x": round(p.pose.position.x, 2), "y": round(p.pose.position.y, 2)} for p in poses[::step]]
        last = poses[-1].pose.position
        pts.append({"x": round(last.x, 2), "y": round(last.y, 2)})
        self.store.update_plan(pts)

    def _obstacle_cb(self, msg: String):
        data = self._json(msg)
        if isinstance(data, dict):
            self.store.update_obstacle(data)

    def _waypoints_cb(self, msg: String):
        data = self._json(msg)
        if isinstance(data, dict) and data.get("world"):
            world = normalize_world(data["world"])
            self.get_logger().info(f"World detected from task manager: {world}")
            self.store.set_world(world, load_waypoints(world))

    # ---------------------------------------------------------- commands
    def _pub(self, pub, data: str):
        # One line per web command so the terminal shows what the UI sent
        self.get_logger().info(f"Web -> {pub.topic_name}: {data}")
        msg = String()
        msg.data = data
        pub.publish(msg)

    def send_delivery(self, target: str, item: str, order_ref: str) -> None:
        payload = {"target": target, "item": item}
        if order_ref:
            payload["order_ref"] = order_ref
        self._pub(self.req_pub, json.dumps(payload))

    def cancel_task(self, task_id: str) -> None:
        self._pub(self.action_pub, json.dumps({"action": "delete", "task_id": task_id}))

    def dock_now(self, reason: str = "ADMIN") -> None:
        self._pub(self.dock_pub, f"DOCK_NOW:{reason}")

    def cancel_dock(self) -> None:
        self._pub(self.dock_pub, "STOP")

    def set_battery(self, percentage: float) -> None:
        self._pub(self.battery_pub, f"{float(percentage):.1f}")

    def set_obstacle_mode(self, mode: str) -> None:
        self._pub(self.obstacle_pub, mode)


def start_ros_bridge(store: TelemetryStore) -> WebBridgeNode:
    """Creates the node and spins it in a background thread (FastAPI owns the main thread)."""
    if not rclpy.ok():
        rclpy.init()
    node = WebBridgeNode(store)
    threading.Thread(target=rclpy.spin, args=(node,), daemon=True).start()
    return node
