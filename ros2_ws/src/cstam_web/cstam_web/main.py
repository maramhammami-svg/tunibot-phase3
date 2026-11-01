#!/usr/bin/env python3
"""
Entry point: `ros2 run cstam_web web_server` (or `python3 -m cstam_web.main --mock`).

  --host / --port   where to serve the UI (default 0.0.0.0:8000, reachable from a phone on the same Wi-Fi)
  --world           restaurant | resto_arbi  (auto-detected from /delivery_waypoints when ROS is running)
  --mock            demo mode without ROS 2 (simulated robot, see mock.py)
"""
from __future__ import annotations

import argparse
import os
import sys

import uvicorn

from .server import create_app
from .store import TelemetryStore
from .world import load_waypoints, normalize_world


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="CSTAM TuniBot web interface")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--world", default=os.environ.get("CSTAM_WORLD", "restaurant"))
    p.add_argument("--mock", action="store_true", help="run without ROS 2 using a simulated robot")
    # ros2 run / launch append --ros-args ...: ignore anything we do not know
    args, _unknown = p.parse_known_args(argv)
    return args


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    world = normalize_world(args.world)
    store = TelemetryStore(world=world, waypoints=load_waypoints(world))

    if args.mock:
        from .mock import MockRobot
        commands = MockRobot(store).start()
        print("Demo mode: simulated robot (no ROS 2).")
    else:
        from .ros_bridge import start_ros_bridge
        commands = start_ros_bridge(store)

    app = create_app(store, commands)
    print(f"Client page: http://localhost:{args.port}/   Admin page: http://localhost:{args.port}/admin")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
