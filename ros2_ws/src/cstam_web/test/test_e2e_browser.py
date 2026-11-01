"""End-to-end browser test: real web server + simulated robot (mock mode) + headless Chromium.

Skipped automatically when Playwright or a browser is not installed.
Run:  python3 -m pytest test/test_e2e_browser.py
"""
import os
import socket
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

pytest.importorskip("fastapi")
uvicorn = pytest.importorskip("uvicorn")
sync_api = pytest.importorskip("playwright.sync_api")

from cstam_web.mock import MockRobot  # noqa: E402
from cstam_web.server import create_app  # noqa: E402
from cstam_web.store import TelemetryStore  # noqa: E402
from cstam_web.world import load_waypoints  # noqa: E402


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def server():
    store = TelemetryStore(world="resto_arbi", waypoints=load_waypoints("resto_arbi"))
    robot = MockRobot(store).start()
    port = _free_port()
    srv = uvicorn.Server(uvicorn.Config(create_app(store, robot), host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    srv.should_exit = True
    th.join(timeout=5)


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as p:
        exe = os.environ.get("CHROMIUM_PATH")  # optional: use an already installed Chromium
        try:
            b = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        except Exception as e:  # browser binary missing
            pytest.skip(f"Chromium not available: {e}")
        yield b
        b.close()


def test_voice_order_delivered_end_to_end(server, browser):
    page = browser.new_page(locale="fr-FR")
    page.goto(server + "/")
    page.wait_for_selector(".table-btn")
    assert page.locator("#lang-btn").inner_text() == "EN"  # page is in French

    # Voice panel with the typed fallback (no microphone in CI)
    page.click("#voice-btn")
    page.fill("#voice-input", "deux thés à la menthe et un brik pour la table 4")
    page.click("#voice-form button[type=submit]")
    page.wait_for_selector("#voice-result.ok")
    assert "Thé à la menthe" in page.inner_text("#voice-result")
    assert page.inner_text("#table-selected") == "Table 4"
    assert page.inner_text("#checkout-count") == "3 articles"

    page.click("#order-btn")
    page.wait_for_selector("#track-screen:not(.hidden)")
    page.wait_for_function("document.querySelector('#track-title').textContent === 'En route !'", timeout=30000)
    page.wait_for_selector("#eta:not(.hidden)", timeout=5000)
    assert "Arrivée dans" in page.inner_text("#eta")
    page.wait_for_function("document.querySelector('#track-title').textContent === 'Livrée'", timeout=90000)
    assert page.is_visible("#new-order-btn")
    page.close()


def test_language_switch_and_admin(server, browser):
    page = browser.new_page(locale="fr-FR")
    page.goto(server + "/")
    page.wait_for_selector(".table-btn")
    page.click("#lang-btn")
    assert page.locator("[data-i18n=your_table]").inner_text() == "Your table"
    assert "drinks" in page.inner_text("#menu").lower()
    page.reload()
    page.wait_for_selector(".table-btn")
    assert page.locator("#lang-btn").inner_text() == "FR"  # choice remembered

    page.goto(server + "/admin")
    page.wait_for_function("document.querySelector('#conn-text').textContent === 'Live'")
    assert "Voice order understood" in page.inner_text("#events")
    page.close()
