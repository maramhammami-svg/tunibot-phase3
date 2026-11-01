#!/usr/bin/env bash
# Phase 3 web interface: client ordering page + admin monitoring view.
#
#   ./run_web_interface.sh            # connect to the running robot (start ./run_autonomous_system.sh first)
#   ./run_web_interface.sh --mock     # demo mode without ROS 2 / Gazebo
#
# Then open  http://localhost:8000/        (client)
#            http://localhost:8000/admin   (admin)
# From a phone on the same Wi-Fi use the PC's IP, e.g. http://192.168.1.20:8000/?table=5
set -e
cd "$(dirname "$0")"

if [[ " $* " == *" --mock "* ]]; then
  cd ros2_ws/src/cstam_web
  exec python3 -m cstam_web.main "$@"
fi

source /opt/ros/jazzy/setup.bash
source ros2_ws/install/setup.bash
exec ros2 run cstam_web web_server "$@"
