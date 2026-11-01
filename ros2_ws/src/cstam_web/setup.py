import os
from glob import glob

from setuptools import setup

package_name = 'cstam_web'

setup(
    name=package_name,
    version='3.0.0',
    packages=[package_name],
    package_data={package_name: ['static/*.html', 'static/*.css', 'static/*.js', 'static/*.json', 'static/layouts/*.json']},
    include_package_data=True,
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools', 'fastapi', 'uvicorn', 'PyYAML'],
    zip_safe=False,
    maintainer='CSTAM TuniBot Software Team',
    maintainer_email='dev@cstam.tunibot.org',
    description='Web interface (client ordering + admin monitoring) for the CSTAM delivery robot',
    license='Apache-2.0',
    extras_require={'test': ['pytest', 'httpx']},
    entry_points={
        'console_scripts': [
            'web_server = cstam_web.main:main',
        ],
    },
)
