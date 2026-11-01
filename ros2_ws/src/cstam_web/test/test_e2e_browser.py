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
    # Review sheet: the cart can still be changed before confirming
    page.wait_for_selector("#review-sheet:not(.hidden)")
    assert "Table 4" in page.inner_text("#review-table")
    page.click("#review-items li[data-id=brik] .add")
    assert page.inner_text("#review-confirm") == "Confirmer · 4 articles"
    page.click("#review-confirm")
    page.wait_for_selector("#track-screen:not(.hidden)")
    page.wait_for_function("document.querySelector('#track-title').textContent === 'En route !'", timeout=30000)
    page.wait_for_selector("#eta:not(.hidden)", timeout=5000)
    assert "Arrivée dans" in page.inner_text("#eta")
    page.wait_for_function("document.querySelector('#track-title').textContent === 'Livrée'", timeout=90000)
    assert page.is_visible("#new-order-btn")
    assert "2 × Brik" in page.inner_text("#track-items")
    page.close()


def test_category_tabs_and_floating_mic(server, browser):
    page = browser.new_page(locale="fr-FR", viewport={"width": 390, "height": 844})
    page.goto(server + "/")
    page.wait_for_selector(".cat-tab")
    assert [t.strip() for t in page.locator(".cat-tab").all_inner_texts()] == ["Boissons", "Plats", "Desserts"]
    page.click(".cat-tab[data-cat='2']")
    page.wait_for_function("document.querySelector(\".cat-tab[data-cat='2']\").classList.contains('active')", timeout=3000)
    page.click(".menu-item[data-id=bambalouni] .add")
    assert page.inner_text("#cat-count-2") == "1"
    page.click("#mic-fab")
    assert page.is_visible("#voice-panel")
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


# A fake speech engine injected in the page: it "hears" a sentence with two
# guesses, like Chrome does, so the real client code path is exercised.
FAKE_SPEECH = """
class FakeRecognition {
  start() {
    window.__speechLang = this.lang;
    setTimeout(() => this.onstart && this.onstart(), 10);
    setTimeout(() => {
      const alt = (t) => ({ transcript: t, confidence: 0.8 });
      const r1 = Object.assign([alt('deux briques et un bric à brac'), alt('deux briques et un thé à la menthe')], { isFinal: true });
      const r2 = Object.assign([alt('pour la table 6')], { isFinal: true });
      this.onresult({ resultIndex: 0, results: [r1, r2] });
    }, 50);
  }
  stop() { setTimeout(() => this.onend && this.onend(), 10); }
  abort() { this.stop(); }
}
window.webkitSpeechRecognition = FakeRecognition;
window.SpeechRecognition = FakeRecognition;
"""


def test_microphone_flow_with_alternatives(server, browser):
    ctx = browser.new_context(locale="fr-FR")
    ctx.add_init_script(FAKE_SPEECH)
    page = ctx.new_page()
    page.goto(server + "/")
    page.wait_for_selector(".table-btn")
    page.click("#voice-btn")
    # Stops by itself after the silence delay, then sends both guesses
    page.wait_for_selector("#voice-result.ok", timeout=10000)
    text = page.inner_text("#voice-result")
    assert "2 × Brik à l'oeuf" in text and "1 × Thé à la menthe" in text
    assert page.inner_text("#table-selected") == "Table 6"
    assert page.evaluate("window.__speechLang") == "fr-FR"

    # English page: speech stays French unless "English" is picked in the voice panel
    page.click("#lang-btn")
    page.click("#voice-btn")
    page.wait_for_timeout(300)
    assert page.evaluate("window.__speechLang") == "fr-FR"
    page.click("[data-voice-lang=en]")
    page.wait_for_timeout(100)
    page.click("#voice-btn")
    page.wait_for_timeout(300)
    assert page.evaluate("window.__speechLang") == "en-US"
    ctx.close()
