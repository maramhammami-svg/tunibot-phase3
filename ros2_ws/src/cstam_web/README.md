# cstam_web — Phase 3 web interface

Client ordering page (`/`) and admin monitoring page (`/admin`) for the CSTAM delivery robot.

```
 phone / browser ──HTTP + WebSocket──►  FastAPI (server.py)
                                           │  reads              │  commands
                                           ▼                     ▼
                                   TelemetryStore (store.py)   WebBridgeNode (ros_bridge.py)
                                           ▲                     │
                                           └──── ROS 2 topics ◄──┘
```

| File | Role |
|------|------|
| `store.py` | Thread-safe mirror of what the robot publishes; derives each web order's status from `/delivery_queue_status` (via `order_ref`) |
| `ros_bridge.py` | rclpy node: subscribes to `/delivery_queue_status`, `/robot_system_state`, `/battery_status`, `/amcl_pose` + TF, `/plan`, `/dynamic_obstacle/status`, `/delivery_waypoints`; publishes `/delivery_request`, `/delivery_task_action`, `/dock_command`, `/battery_set_percentage`, `/dynamic_obstacle/control` |
| `server.py` | REST API + `/ws/telemetry` (2 Hz snapshot) + static pages |
| `mock.py` | `--mock` demo mode: real `TaskQueueManager` + `BatterySimulator`, straight-line motion, simulated pedestrian that the robot goes around (admin Pedestrian buttons), no ROS needed |
| `world.py` | Waypoints (from `cstam_navigation/config`), floor layouts and menus |
| `static/` | `client.*`, `admin.*`, `map.js` (floor map), `common.*`, `layouts/`, `menu.json` |

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | world, tables, waypoints, menu |
| GET | `/api/status` | full telemetry snapshot (same as the WebSocket) |
| GET | `/api/availability` | can the robot take an order, orders ahead |
| POST | `/api/orders` | `{"target":"Table 3","items":[{"id","name","qty"}],"note"}` → `order_ref` |
| GET | `/api/orders/{ref}` | `submitted / queued / en_route / arrived / delivered / failed / cancelled / rejected` |
| DELETE | `/api/orders/{ref}` | cancel while `submitted` or `queued` |
| POST | `/api/admin/dock`, `/api/admin/dock/cancel` | return to dock / cancel docking |
| POST | `/api/admin/dispatch` | `{"target":"Kitchen/Pickup"}` |
| POST | `/api/admin/tasks/{id}/cancel` | remove a task from the queue |
| POST | `/api/admin/battery` | `{"percentage": 14}` test tool |
| POST | `/api/admin/obstacle` | `{"mode": "patrol"|"cross"|"block"|"clear"}` test tool |

Orders are refused (HTTP 503) only when the robot is offline. When the battery is low the order is accepted and waits in the queue, and the client page says the robot is recharging.

## Run

```bash
ros2 run cstam_web web_server                   # with the robot running
ros2 launch cstam_web web.launch.py port:=8000
python3 -m cstam_web.main --mock --world resto_arbi   # from this folder, no ROS needed
python3 -m pytest test                           # tests
```
