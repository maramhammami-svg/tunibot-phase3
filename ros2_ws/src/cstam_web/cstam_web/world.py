"""World metadata for the web UI: waypoint coordinates, floor layout and menu."""
from __future__ import annotations

import json
import os
from typing import Dict, Optional

try:
    import yaml
    HAVE_YAML = True
except ImportError:  # pragma: no cover
    HAVE_YAML = False

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

WAYPOINT_FILES = {
    "restaurant": "waypoints.yaml",
    "resto_arbi": "resto_arbi_waypoints.yaml",
}

WORLD_TITLES = {
    "restaurant": "Restaurant Lounge",
    "resto_arbi": "Dar Tunibot",
}


def normalize_world(name: Optional[str]) -> str:
    n = (name or "").lower()
    if "resto" in n or "arbi" in n or "dar" in n:
        return "resto_arbi"
    return "restaurant"


def _candidate_config_dirs():
    try:
        from ament_index_python.packages import get_package_share_directory
        yield os.path.join(get_package_share_directory("cstam_navigation"), "config")
    except Exception:
        pass
    # Source checkout fallback: ros2_ws/src/cstam_web/cstam_web -> ros2_ws/src/cstam_navigation/config
    here = os.path.dirname(os.path.abspath(__file__))
    yield os.path.abspath(os.path.join(here, "..", "..", "cstam_navigation", "config"))


def load_waypoints(world: str) -> Dict[str, Dict[str, float]]:
    """Returns {name: {"x", "y", "label"}} for the given world."""
    world = normalize_world(world)
    fname = WAYPOINT_FILES[world]
    if HAVE_YAML:
        for d in _candidate_config_dirs():
            path = os.path.join(d, fname)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                wps = data.get("waypoints", data)
                return {
                    name: {"x": float(v.get("x", 0.0)), "y": float(v.get("y", 0.0)), "label": v.get("name", name),
                           "type": v.get("type", "table")}
                    for name, v in wps.items() if isinstance(v, dict)
                }
    return {}


def load_layout(world: str) -> dict:
    path = os.path.join(STATIC_DIR, "layouts", f"{normalize_world(world)}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"walls": [], "tables": []}


def load_menu(world: str) -> dict:
    with open(os.path.join(STATIC_DIR, "menu.json"), "r", encoding="utf-8") as f:
        menus = json.load(f)
    return menus.get(normalize_world(world), menus["restaurant"])
