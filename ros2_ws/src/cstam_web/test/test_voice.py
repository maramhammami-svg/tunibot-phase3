"""Voice ordering parser (cstam_web.voice) and its API endpoint."""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cstam_web.voice import normalize, parse_order  # noqa: E402
from cstam_web.world import load_menu, load_waypoints  # noqa: E402
from cstam_web.store import TelemetryStore  # noqa: E402

ARBI = load_menu("resto_arbi")
LOUNGE = load_menu("restaurant")
TABLES_10 = [f"Table {i}" for i in range(1, 11)]
TABLES_24 = [f"Table {i}" for i in range(0, 24)]


def cart(res):
    return {i["id"]: i["qty"] for i in res["items"]}


def test_normalize_strips_accents_and_punctuation():
    assert normalize("Thé à la menthe, s'il vous plaît !") == "the a la menthe s il vous plait"


@pytest.mark.parametrize("text, lang, table, items", [
    ("Deux thés à la menthe et un brik pour la table 4", "fr", "Table 4", {"the-menthe": 2, "brik": 1}),
    ("two coffees and a couscous, table seven", "en", "Table 7", {"cafe-direct": 2, "couscous": 1}),
    ("zouz kahwa w brik, tawla tletha", "fr", "Table 3", {"cafe-direct": 2, "brik": 1}),
    ("je voudrais trois bambalounis s'il vous plaît, table numéro 10", "fr", "Table 10", {"bambalouni": 3}),
    ("un café direct et deux citronnades table 1", "fr", "Table 1", {"cafe-direct": 1, "citronnade": 2}),
    ("deux tasses de thé, table deux", "fr", "Table 2", {"the-menthe": 2}),
    ("3 ojja et 1 makroud", "fr", None, {"ojja": 3, "makroudh": 1}),
    ("un thé, un thé et encore un thé", "fr", None, {"the-menthe": 3}),
])
def test_parse_examples(text, lang, table, items):
    res = parse_order(text, ARBI, TABLES_10, lang)
    assert res["table"] == table
    assert cart(res) == items


def test_english_article_the_is_not_tea():
    res = parse_order("I would like the couscous for table 2", ARBI, TABLES_10, "en")
    assert cart(res) == {"couscous": 1}
    assert res["unmatched"] == []


def test_unknown_dish_reported_not_guessed():
    res = parse_order("une pizza pour la table 3", ARBI, TABLES_10, "fr")
    assert res["items"] == [] and res["table"] == "Table 3"
    assert res["unmatched"] == ["pizza"]


def test_table_must_exist_in_world():
    res = parse_order("un brik table 15", ARBI, TABLES_10, "fr")
    assert res["table"] is None


def test_table_zero_and_other_menu():
    res = parse_order("two espressos and a tiramisu, table 0", LOUNGE, TABLES_24, "en")
    assert res["table"] == "Table 0"
    assert cart(res) == {"espresso": 2, "tiramisu": 1}


def test_quantity_capped_at_nine():
    res = parse_order("20 brik", ARBI, TABLES_10, "fr")
    assert cart(res) == {"brik": 9}


def test_voice_endpoint():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from cstam_web.server import create_app
    store = TelemetryStore(world="resto_arbi", waypoints=load_waypoints("resto_arbi"))
    client = TestClient(create_app(store, commands=None))
    res = client.post("/api/voice/parse", json={"text": "two mint teas for table 5", "lang": "en"})
    assert res.status_code == 200
    body = res.json()
    assert body["table"] == "Table 5" and body["items"] == [{"id": "the-menthe", "name": "Thé à la menthe", "qty": 2}]
    assert any("Voice order understood" in e["message"] for e in store.events)
    assert client.post("/api/voice/parse", json={"text": "x" * 301}).status_code == 422
