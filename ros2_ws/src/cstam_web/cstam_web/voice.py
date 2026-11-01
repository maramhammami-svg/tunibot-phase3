"""
Voice ordering: turns a spoken (or typed) sentence into a table + cart.

The browser does the speech-to-text (Web Speech API); this module only parses
the transcript, so it works offline, is fast and is easy to unit test.

Understands French, English and Tunisian derja written in Latin letters, e.g.
  "deux thés à la menthe et un brik pour la table 4"
  "two coffees and a couscous, table seven"
  "zouz kahwa w brik, tawla tletha"

Plain Python, no ROS import.
"""
from __future__ import annotations

import difflib
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

NUMBER_WORDS = {
    # French
    "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7,
    "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14,
    "quinze": 15, "seize": 16, "vingt": 20,
    # English
    "one": 1, "a": 1, "an": 1, "two": 2, "three": 3, "four": 4, "five": 5, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "twenty": 20,
    # Tunisian derja (Latin script, common spellings)
    "wahed": 1, "wa7ed": 1, "wahda": 1, "wa7da": 1, "zouz": 2, "zouj": 2, "zoz": 2,
    "thletha": 3, "tletha": 3, "tlatha": 3, "arba": 4, "arb3a": 4, "arbaa": 4,
    "khamsa": 5, "setta": 6, "sab3a": 7, "sabaa": 7, "sab3": 7, "thmanya": 8, "tmanya": 8,
    "tes3a": 9, "tesaa": 9, "achra": 10, "ashra": 10, "3achra": 10,
}
# "six" is French and English, already listed once.

TABLE_WORDS = ("table", "tables", "tawla", "tawlah", "tabla", "tabel")
# Words skipped between a number and the item ("deux tasses de thé", "two cups of tea")
FILLER = {"de", "d", "des", "du", "of", "x", "fois", "times", "tasse", "tasses", "cup", "cups",
          "verre", "verres", "glass", "glasses", "portion", "portions", "assiette", "assiettes",
          "plate", "plates", "le", "la", "les", "l", "mta3", "mtaa"}
# Small words allowed inside a dish name ("thé à la menthe", "brik à l'oeuf")
GLUE = {"a", "l", "la", "le", "au", "aux", "d", "de", "du", "des", "en", "et", "w"}
# Words that never name a dish (avoid fuzzy matches on them)
STOP = FILLER | {"et", "and", "w", "pour", "for", "avec", "with", "please", "svp", "stp", "merci",
                 "je", "veux", "voudrais", "voudrions", "i", "want", "would", "like", "id", "nous",
                 "on", "prend", "prendre", "commande", "order", "nheb", "n7eb", "bech", "bich",
                 "aatini", "a3tini", "jibli", "jible", "s", "il", "vous", "plait", "numero", "no",
                 "number", "a", "an", "un", "une", "sil", "yaatik", "ya3tik", "saha", "chokran"}


def normalize(text: str) -> str:
    """Lowercase, strip accents and punctuation: 'Thé à la menthe !' -> 'the a la menthe'."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("’", "'").replace("œ", "oe")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _singular(tok: str) -> str:
    if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def _tok_eq(a: str, b: str) -> bool:
    a, b = _singular(a), _singular(b)
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4:
        return difflib.SequenceMatcher(None, a, b).ratio() >= 0.8
    return False


def _number(tok: str) -> Optional[int]:
    if tok.isdigit():
        return int(tok)
    return NUMBER_WORDS.get(tok)


def _aliases(item: Dict[str, Any]) -> List[List[str]]:
    """All the ways a dish can be called, as token lists (longest first)."""
    names = [item.get("name", ""), item.get("id", "").replace("-", " ")] + list(item.get("aliases", []))
    out, seen = [], set()
    for n in names:
        toks = [t for t in normalize(n).split() if t not in GLUE]
        key = " ".join(toks)
        if toks and key not in seen:
            seen.add(key)
            out.append(toks)
    return sorted(out, key=len, reverse=True)


def _find_table(tokens: List[str], tables: List[str]) -> Tuple[Optional[str], set]:
    """Returns ('Table 4', positions used) when the sentence names a table."""
    table_ids = {normalize(t): t for t in tables}
    for i, tok in enumerate(tokens):
        if tok not in TABLE_WORDS:
            continue
        for j in range(i + 1, min(i + 4, len(tokens))):
            n = _number(tokens[j])
            if n is not None and tokens[j] not in ("a", "an"):
                hit = table_ids.get(f"table {n}")
                if hit:
                    return hit, set(range(i, j + 1))
                break
            if tokens[j] not in ("n", "no", "numero", "number", "nr", "num", "raqm", "ra9m"):
                break
    return None, set()


def parse_order(text: str, menu: Dict[str, Any], tables: List[str], lang: str = "fr") -> Dict[str, Any]:
    """Parses a voice transcript against the venue menu and its table names.

    lang is the speech-recognition language; in English "the" is an article,
    not "thé" (tea), so that one-word alias is ignored.
    """
    tokens = normalize(text).split()
    table, used = _find_table(tokens, tables)

    items_by_id: Dict[str, Dict[str, Any]] = {}
    candidates = []  # (alias tokens, item)
    for cat in menu.get("categories", []):
        for it in cat.get("items", []):
            items_by_id[it["id"]] = it
            for alias in _aliases(it):
                if alias == ["the"] and str(lang).lower().startswith("en"):
                    continue
                candidates.append((alias, it))
    candidates.sort(key=lambda c: len(c[0]), reverse=True)

    def match_at(i: int, alias: List[str]) -> Optional[int]:
        """End index (exclusive) if alias matches from token i, skipping glue words inside."""
        k, j = 0, i
        while k < len(alias):
            if j >= len(tokens) or j in used:
                return None
            if _tok_eq(tokens[j], alias[k]):
                k += 1
                j += 1
            elif k > 0 and tokens[j] in GLUE and j + 1 < len(tokens):
                j += 1
            else:
                return None
        return j

    found: List[Tuple[int, str, int]] = []  # (position, item id, qty)
    for alias, it in candidates:
        i = 0
        while i < len(tokens):
            end = None
            if not (len(alias) == 1 and tokens[i] in STOP):
                end = match_at(i, alias)
            if end is None:
                i += 1
                continue
            qty, qty_pos = 1, None
            j = i - 1
            while j >= 0 and j >= i - 3 and j not in used:
                num = _number(tokens[j])
                if num is not None:
                    qty, qty_pos = num, j
                    break
                if tokens[j] not in FILLER:
                    break
                j -= 1
            used.update(range(i, end))
            if qty_pos is not None:
                used.add(qty_pos)
            found.append((i, it["id"], max(1, min(qty, 9))))
            i = end

    found.sort()
    merged: Dict[str, int] = {}
    for _, item_id, qty in found:
        merged[item_id] = min(9, merged.get(item_id, 0) + qty)
    items = [{"id": k, "name": items_by_id[k]["name"], "qty": v} for k, v in merged.items()]

    leftovers = [t for i, t in enumerate(tokens) if i not in used and t not in STOP and _number(t) is None
                 and t not in TABLE_WORDS and not (t == "the" and str(lang).lower().startswith("en"))]
    return {"text": text, "table": table, "items": items, "unmatched": leftovers}
