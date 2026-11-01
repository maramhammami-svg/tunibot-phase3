"""Starts the web interface alongside an already running cstam_system.launch.py.

    ros2 launch cstam_web web.launch.py port:=8000
"""
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    port = LaunchConfiguration('port')
    world = LaunchConfiguration('world')
    return LaunchDescription([
        DeclareLaunchArgument('port', default_value='8000'),
        DeclareLaunchArgument('world', default_value='restaurant.world'),
        Node(
            package='cstam_web',
            executable='web_server',
            name='cstam_web_bridge',
            output='screen',
            arguments=['--port', port, '--world', world],
        ),
    ])
