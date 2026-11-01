"""Unit tests for the web interface (no ROS 2 needed)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cstam_web.store import TelemetryStore, ORDER_ACK_TIMEOUT_S  # noqa: E402
from cstam_web.world import load_waypoints, load_layout, load_menu  # noqa: E402

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402
from cstam_web.server import create_app  # noqa: E402


class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class FakeCommands:
    def __init__(self):
        self.calls = []

    def send_delivery(self, target, item, order_ref):
        self.calls.append(("delivery", target, item, order_ref))

    def cancel_task(self, task_id):
        self.calls.append(("cancel", task_id))

    def dock_now(self, reason="ADMIN"):
        self.calls.append(("dock", reason))

    def cancel_dock(self):
        self.calls.append(("undock",))

    def set_battery(self, pct):
        self.calls.append(("battery", pct))

    def set_obstacle_mode(self, mode):
        self.calls.append(("obstacle", mode))


BATTERY_OK = {"percentage": 90.0, "is_low": False, "is_critical": False, "is_docked": False}


def make_store():
    clock = FakeClock()
    store = TelemetryStore(world="restaurant", waypoints=load_waypoints("restaurant"), clock=clock)
    return store, clock


def queue_status(state="idle", current=None, pending=(), completed=0, lock=False):
    """Same shape as DeliveryTaskManager.get_status_summary() (Phase 1/2, unchanged)."""
    return {"robot_state": state, "current_task": current, "pending_tasks": list(pending),
            "queue_length": len(pending), "completed_count": completed,
            "battery_docking_lock": lock}


# ------------------------------------------------------------------ world data
def test_world_files_load():
    for world, n_tables in (("restaurant", 24), ("resto_arbi", 10)):
        wps = load_waypoints(world)
        assert "Dock" in wps and "Kitchen/Pickup" in wps
        assert sum(1 for k in wps if k.startswith("Table")) == n_tables
        layout = load_layout(world)
        assert len(layout["tables"]) == n_tables
        assert load_menu(world)["categories"]


# ------------------------------------------------------------------ store
def test_offline_until_battery_heartbeat():
    store, clock = make_store()
    assert store.availability()["level"] == "offline"
    store.update_battery(BATTERY_OK)
    assert store.availability()["level"] == "ready"
    clock.t += 10
    assert store.availability()["level"] == "offline"


def test_order_lifecycle_follows_task_manager():
    store, clock = make_store()
    store.update_battery(BATTERY_OK)
    store.register_order("abc", "Table 3", [{"id": "x", "name": "Soup", "qty": 1}], "1x Soup")
    assert store.get_order("abc")["status"] == "submitted"

    other = {"id": "TASK-0001", "target": "Table 1", "item": "y"}
    mine = {"id": "TASK-0002", "target": "Table 3", "item": "1x Soup"}
    store.update_queue_status(queue_status("navigating", current=other, pending=[mine]))
    o = store.get_order("abc")
    assert o["status"] == "queued" and o["queue_position"] == 2 and o["task_id"] == "TASK-0002"

    store.update_queue_status(queue_status("navigating", current=mine))
    assert store.get_order("abc")["status"] == "en_route"
    store.update_queue_status(queue_status("at_table", current=mine))
    assert store.get_order("abc")["status"] == "arrived"
    store.update_queue_status(queue_status("idle", completed=1))
    assert store.get_order("abc")["status"] == "delivered"


def test_order_matched_by_table_and_item_not_older_tasks():
    store, _ = make_store()
    store.update_battery(BATTERY_OK)
    old = {"id": "TASK-0001", "target": "Table 3", "item": "1x Soup"}
    store.update_queue_status(queue_status(pending=[old]))
    store.register_order("abc", "Table 3", [], "1x Soup")
    admin = {"id": "TASK-0002", "target": "Table 3", "item": "Admin dispatch"}
    mine = {"id": "TASK-0003", "target": "Table 3", "item": "1x Soup"}
    store.update_queue_status(queue_status(pending=[old, admin, mine]))
    assert store.get_order("abc")["task_id"] == "TASK-0003"


def test_order_disappearing_from_queue_is_cancelled():
    store, _ = make_store()
    store.update_battery(BATTERY_OK)
    store.register_order("abc", "Table 3", [], "x")
    store.update_queue_status(queue_status(pending=[{"id": "TASK-0001", "target": "Table 3", "item": "x"}]))
    store.update_queue_status(queue_status())
    assert store.get_order("abc")["status"] == "cancelled"


def test_order_never_acknowledged_is_rejected():
    store, clock = make_store()
    store.register_order("abc", "Table 3", [], "x")
    clock.t += ORDER_ACK_TIMEOUT_S + 1
    store.update_battery(BATTERY_OK)
    assert store.get_order("abc")["status"] == "rejected"


def test_failed_delivery_reported():
    store, _ = make_store()
    store.update_battery(BATTERY_OK)
    store.register_order("abc", "Table 3", [], "x")
    task = {"id": "TASK-0001", "target": "Table 3", "item": "x"}
    store.update_queue_status(queue_status("navigating", current=task))
    store.update_queue_status(queue_status("idle", completed=0))
    assert store.get_order("abc")["status"] == "failed"


def test_battery_lock_shows_charging_and_events():
    store, _ = make_store()
    store.update_battery({"percentage": 20.0, "is_low": True, "is_critical": False})
    store.update_queue_status(queue_status("docked", lock=True))
    assert store.availability()["level"] == "charging"
    assert store.availability()["accepting"] is True
    messages = [e["message"] for e in store.snapshot()["events"]]
    assert any("Battery low" in m for m in messages)
    assert any("Battery lock" in m for m in messages)


# ------------------------------------------------------------------ API
@pytest.fixture
def api():
    store, clock = make_store()
    cmds = FakeCommands()
    client = TestClient(create_app(store, cmds))
    return client, store, cmds


def test_pages_served(api):
    client, _, _ = api
    assert "Your table" in client.get("/").text
    assert "Delivery queue" in client.get("/admin").text
    assert client.get("/static/client.js").status_code == 200


def test_config_lists_tables_in_order(api):
    client, _, _ = api
    data = client.get("/api/config").json()
    assert [t["id"] for t in data["tables"]][:3] == ["Table 0", "Table 1", "Table 2"]


def test_order_rejected_when_robot_offline(api):
    client, _, cmds = api
    res = client.post("/api/orders", json={"target": "Table 2", "items": [{"id": "a", "name": "Tea", "qty": 1}]})
    assert res.status_code == 503
    assert cmds.calls == []


def test_order_validation(api):
    client, store, cmds = api
    store.update_battery(BATTERY_OK)
    items = [{"id": "a", "name": "Tea", "qty": 1}]
    assert client.post("/api/orders", json={"target": "Table 99", "items": items}).status_code == 400
    assert client.post("/api/orders", json={"target": "Dock", "items": items}).status_code == 400
    assert client.post("/api/orders", json={"target": "Table 2", "items": []}).status_code == 422
    assert client.post("/api/orders", json={"target": "Table 2", "items": [dict(items[0], qty=50)]}).status_code == 422
    assert cmds.calls == []


def test_order_publishes_delivery_with_ref(api):
    client, store, cmds = api
    store.update_battery(BATTERY_OK)
    res = client.post("/api/orders", json={"target": "Table 2", "items": [{"id": "a", "name": "Tea", "qty": 2}], "note": "no sugar"})
    assert res.status_code == 200
    ref = res.json()["order"]["order_ref"]
    assert cmds.calls == [("delivery", "Table 2", "2x Tea (no sugar)", ref)]
    assert client.get(f"/api/orders/{ref}").json()["status"] == "submitted"
    assert client.get("/api/orders/nope").status_code == 404


def test_cancel_order_only_while_waiting(api):
    client, store, cmds = api
    store.update_battery(BATTERY_OK)
    ref = client.post("/api/orders", json={"target": "Table 2", "items": [{"id": "a", "name": "Tea", "qty": 1}]}).json()["order"]["order_ref"]
    task = {"id": "TASK-0007", "target": "Table 2", "item": "1x Tea"}
    store.update_queue_status(queue_status("navigating", current=task))
    assert client.delete(f"/api/orders/{ref}").status_code == 409

    ref2 = client.post("/api/orders", json={"target": "Table 4", "items": [{"id": "a", "name": "Tea", "qty": 1}]}).json()["order"]["order_ref"]
    task2 = {"id": "TASK-0008", "target": "Table 4", "item": "1x Tea"}
    store.update_queue_status(queue_status("navigating", current=task, pending=[task2]))
    assert client.delete(f"/api/orders/{ref2}").status_code == 200
    assert ("cancel", "TASK-0008") in cmds.calls
    assert client.get(f"/api/orders/{ref2}").json()["status"] == "cancelled"


def test_admin_commands(api):
    client, _, cmds = api
    assert client.post("/api/admin/dock").status_code == 200
    assert client.post("/api/admin/dock/cancel").status_code == 200
    assert client.post("/api/admin/battery", json={"percentage": 14}).status_code == 200
    assert client.post("/api/admin/battery", json={"percentage": 140}).status_code == 422
    assert client.post("/api/admin/obstacle", json={"mode": "cross"}).status_code == 200
    assert client.post("/api/admin/obstacle", json={"mode": "dance"}).status_code == 400
    assert client.post("/api/admin/tasks/TASK-0003/cancel").status_code == 200
    assert client.post("/api/admin/dispatch", json={"target": "Kitchen/Pickup"}).status_code == 200
    assert cmds.calls == [("dock", "ADMIN"), ("undock",), ("battery", 14.0), ("obstacle", "cross"),
                          ("cancel", "TASK-0003"), ("delivery", "Kitchen/Pickup", "Admin dispatch", "")]


def test_websocket_sends_snapshot(api):
    client, store, _ = api
    store.update_battery(BATTERY_OK)
    with client.websocket_connect("/ws/telemetry") as ws:
        snap = ws.receive_json()
    assert snap["battery"]["percentage"] == 90.0
    assert snap["online"]["robot"] is True
