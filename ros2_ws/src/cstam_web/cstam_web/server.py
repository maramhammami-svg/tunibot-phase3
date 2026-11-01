"""
FastAPI application for the CSTAM web interface.

  /            -> Client ordering page (mobile first)  — also /client
  /admin       -> Admin monitoring page (robot status, battery, queue, map)
  /api/...     -> REST API
  /ws/telemetry-> WebSocket stream of the full telemetry snapshot (2 Hz)

The app is given a TelemetryStore (what the robot reports) and a command sink
(how to talk to the robot). In normal use the sink is the ROS 2 bridge; in
--mock mode it is a small simulator so the UI can be shown without Gazebo.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional, Protocol

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .store import TelemetryStore
from .world import STATIC_DIR, WORLD_TITLES, load_layout, load_menu, normalize_world

OBSTACLE_MODES = {"patrol", "cross", "block", "clear"}
MAX_ITEMS_PER_ORDER = 12


class RobotCommands(Protocol):
    def send_delivery(self, target: str, item: str, order_ref: str) -> None: ...
    def cancel_task(self, task_id: str) -> None: ...
    def dock_now(self, reason: str = "ADMIN") -> None: ...
    def cancel_dock(self) -> None: ...
    def set_battery(self, percentage: float) -> None: ...
    def set_obstacle_mode(self, mode: str) -> None: ...


class OrderLine(BaseModel):
    id: str = Field(..., max_length=64)
    name: str = Field(..., max_length=80)
    qty: int = Field(1, ge=1, le=9)


class OrderRequest(BaseModel):
    target: str = Field(..., max_length=40)
    items: List[OrderLine]  # 1..MAX_ITEMS_PER_ORDER, checked in place_order (works with pydantic v1 and v2)
    note: Optional[str] = Field(None, max_length=120)


class BatteryRequest(BaseModel):
    percentage: float = Field(..., ge=0.0, le=100.0)


class ObstacleRequest(BaseModel):
    mode: str


class DispatchRequest(BaseModel):
    target: str = Field(..., max_length=40)
    item: str = Field("Admin dispatch", max_length=120)


def _order_label(items: List[OrderLine], note: Optional[str]) -> str:
    label = ", ".join(f"{i.qty}x {i.name}" for i in items)
    if note:
        label += f" ({note.strip()})"
    return label[:200]


def create_app(store: TelemetryStore, commands: RobotCommands, broadcast_hz: float = 2.0) -> FastAPI:
    clients: set = set()

    async def broadcaster():
        period = 1.0 / max(0.5, broadcast_hz)
        while True:
            await asyncio.sleep(period)
            if not clients:
                continue
            snap = store.snapshot()
            for ws in list(clients):
                try:
                    await ws.send_json(snap)
                except Exception:
                    clients.discard(ws)

    @asynccontextmanager
    async def lifespan(_app):
        task = asyncio.create_task(broadcaster())
        yield
        task.cancel()

    app = FastAPI(title="CSTAM TuniBot Web Interface", version="3.0.0", lifespan=lifespan)

    def _require_target(target: str) -> str:
        if target not in store.waypoints:
            raise HTTPException(status_code=400, detail=f"Unknown destination '{target}'.")
        return target

    # ---------------------------------------------------------------- pages
    @app.get("/", include_in_schema=False)
    @app.get("/client", include_in_schema=False)
    def client_page():
        return FileResponse(os.path.join(STATIC_DIR, "client.html"))

    @app.get("/admin", include_in_schema=False)
    def admin_page():
        return FileResponse(os.path.join(STATIC_DIR, "admin.html"))

    # ---------------------------------------------------------------- info
    @app.get("/api/health")
    def health():
        return {"status": "ok", "mode": store.mode, "robot_online": store.is_online("battery") or store.is_online("queue")}

    @app.get("/api/config")
    def config():
        world = normalize_world(store.world)
        tables = sorted(
            [{"id": n, "label": n} for n, wp in store.waypoints.items() if n.lower().startswith("table")],
            key=lambda t: int("".join(c for c in t["id"] if c.isdigit()) or 0),
        )
        return {
            "world": world,
            "title": WORLD_TITLES.get(world, world),
            "mode": store.mode,
            "tables": tables,
            "waypoints": store.waypoints,
            "menu": load_menu(world),
        }

    @app.get("/api/map/layout")
    def map_layout():
        return load_layout(store.world)

    @app.get("/api/status")
    def status():
        return store.snapshot()

    @app.get("/api/availability")
    def availability():
        return store.availability()

    # ---------------------------------------------------------------- client
    @app.post("/api/orders")
    def place_order(req: OrderRequest):
        if not 1 <= len(req.items) <= MAX_ITEMS_PER_ORDER:
            raise HTTPException(status_code=422, detail=f"An order needs between 1 and {MAX_ITEMS_PER_ORDER} items.")
        target = _require_target(req.target)
        if not target.lower().startswith("table"):
            raise HTTPException(status_code=400, detail="Orders can only be delivered to a table.")
        avail = store.availability()
        if not avail["accepting"]:
            raise HTTPException(status_code=503, detail=avail["message"])
        order_ref = uuid.uuid4().hex[:10]
        label = _order_label(req.items, req.note)
        store.register_order(order_ref, target, [{"id": i.id, "name": i.name, "qty": i.qty} for i in req.items], label)
        commands.send_delivery(target, label, order_ref)
        return {"success": True, "order": store.get_order(order_ref), "availability": avail}

    @app.get("/api/orders/{order_ref}")
    def get_order(order_ref: str):
        order = store.get_order(order_ref)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found.")
        return order

    @app.delete("/api/orders/{order_ref}")
    def cancel_order(order_ref: str):
        order = store.get_order(order_ref)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found.")
        if order["status"] not in ("submitted", "queued"):
            raise HTTPException(status_code=409, detail="This order is already on its way and can no longer be cancelled here.")
        if order.get("task_id"):
            commands.cancel_task(order["task_id"])
        store.mark_order_cancelled(order_ref)
        store.add_event("info", f"Order for {order['target']} cancelled by the customer.")
        return {"success": True}

    # ---------------------------------------------------------------- admin
    @app.post("/api/admin/tasks/{task_id}/cancel")
    def admin_cancel_task(task_id: str):
        commands.cancel_task(task_id)
        store.add_event("info", f"Admin cancelled {task_id}.")
        return {"success": True}

    @app.post("/api/admin/dispatch")
    def admin_dispatch(req: DispatchRequest):
        target = _require_target(req.target)
        commands.send_delivery(target, req.item, "")
        store.add_event("info", f"Admin sent the robot to {target}.")
        return {"success": True}

    @app.post("/api/admin/dock")
    def admin_dock():
        commands.dock_now("ADMIN")
        store.add_event("info", "Admin requested return to dock.")
        return {"success": True}

    @app.post("/api/admin/dock/cancel")
    def admin_cancel_dock():
        commands.cancel_dock()
        store.add_event("info", "Admin cancelled docking.")
        return {"success": True}

    @app.post("/api/admin/battery")
    def admin_battery(req: BatteryRequest):
        commands.set_battery(req.percentage)
        store.add_event("warn", f"Test: battery set to {req.percentage:.0f}%.")
        return {"success": True}

    @app.post("/api/admin/obstacle")
    def admin_obstacle(req: ObstacleRequest):
        mode = req.mode.lower().strip()
        if mode not in OBSTACLE_MODES:
            raise HTTPException(status_code=400, detail=f"Mode must be one of {sorted(OBSTACLE_MODES)}.")
        commands.set_obstacle_mode(mode)
        store.add_event("info", f"Test: pedestrian mode '{mode}'.")
        return {"success": True}

    # ---------------------------------------------------------------- live
    @app.websocket("/ws/telemetry")
    async def telemetry_ws(ws: WebSocket):
        await ws.accept()
        clients.add(ws)
        try:
            await ws.send_json(store.snapshot())
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            clients.discard(ws)

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    return app
