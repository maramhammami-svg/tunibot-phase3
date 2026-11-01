"""
Voice ordering: turns a spoken (or typed) sentence into a table + cart.

The browser does the speech-to-text (Web Speech API); this module only parses
the transcript, so it works offline, is fast and is easy to unit test.

Understands French, English and Tunisian derja, in Latin or Arabic letters, e.g.
  "deux thés à la menthe et un brik pour la table 4"
  "two coffees and a couscous, table seven"
  "zouz kahwa w brik, tawla tletha"
  "زوز قهوة و بريك طاولة ثلاثة"   (what Chrome returns in Darija / ar-TN mode)

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

TABLE_WORDS = ("table", "tables", "tawla", "tawlah", "tabla", "tabel", "tableau", "tablee", "tabl", "tabler",
               "towla", "tauila", "taula")
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
                 "number", "a", "an", "un", "une", "sil", "yaatik", "ya3tik", "saha", "chokran",
                 "min", "aslema", "rani", "nheb", "brabi"}


# ---- Darija in Arabic script (speech recognition in ar-TN returns Arabic letters).
# Known words are mapped to the Latin spellings the parser already understands;
# anything else is transliterated letter by letter so fuzzy matching can still work.
AR_WORDS = {
    # numbers
    "واحد": "wahed", "وحدة": "wahda", "واحدة": "wahda", "زوز": "zouz", "زوج": "zouj", "جوج": "zouj",
    "اثنين": "zouz", "إثنين": "zouz", "اثنان": "zouz", "ثلاثة": "tletha", "تلاثة": "tletha", "ثلاث": "tletha",
    "تلاتة": "tletha", "أربعة": "arba", "اربعة": "arba", "ربعة": "arba", "خمسة": "khamsa", "ستة": "setta",
    "سبعة": "sabaa", "ثمانية": "tmanya", "ثمنية": "tmanya", "تمنية": "tmanya", "تسعة": "tesaa", "عشرة": "achra",
    # table
    "طاولة": "tawla", "طاوله": "tawla", "طابلة": "tawla", "تابلة": "tawla", "طاولا": "tawla", "رقم": "raqm", "نمرو": "numero",
    # dishes and drinks
    "بريك": "brik", "بريكة": "brik", "بريكه": "brik", "كسكسي": "couscous", "كسكسو": "couscous", "كسكس": "couscous",
    "عجة": "ojja", "عجه": "ojja", "مرقاز": "merguez", "شكشوكة": "chakchouka", "سلاطة": "salade", "سلطة": "salade",
    "سلاطه": "salade", "بمبالوني": "bambalouni", "بنبالوني": "bambalouni", "بامبالوني": "bambalouni",
    "مقروض": "makroudh", "مقروظ": "makroudh", "قهوة": "kahwa", "قهوه": "kahwa", "ديراكت": "direct", "دیرکت": "direct",
    "تاي": "tay", "شاي": "tay", "أتاي": "tay", "اتاي": "tay", "نعناع": "menthe", "سيترونادة": "citronnade",
    "سيتروناد": "citronnade", "ليمونادة": "citronnade", "ليموناضة": "citronnade", "ليمون": "citron",
    "تونسية": "tunisienne", "تونسي": "tunisienne", "اسبريسو": "espresso", "إسبريسو": "espresso", "ماء": "water", "ما": "water", "ميه": "water", "مياه": "water",
    "برقر": "burger", "برڨر": "burger", "بيرغر": "burger", "برغر": "burger", "باستا": "pasta", "مقرونة": "pasta",
    "كرواسون": "croissant", "كرواسان": "croissant", "تيراميسو": "tiramisu",
    # little words
    "و": "w", "من": "min", "متاع": "mtaa", "متع": "mtaa", "عطيني": "aatini", "اعطيني": "aatini", "أعطيني": "aatini",
    "جيبلي": "jibli", "نحب": "nheb", "نحبو": "nheb", "بش": "bech", "باش": "bech", "يعيشك": "yaatik", "عيشك": "yaatik",
    "عسلامة": "aslema", "سلام": "aslema", "شكرا": "chokran", "يرحم": "", "والديك": "", "فضلك": "", "سمحت": "", "لو": "",
    "كاس": "verre", "كأس": "verre", "كاسات": "verre", "فنجان": "tasse", "صحن": "assiette", "طبق": "assiette",
    "لي": "", "ليا": "", "عندي": "", "حاجة": "",
}
_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_AR_LETTERS = {
    "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh", "د": "d",
    "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "ch", "ص": "s", "ض": "d", "ط": "t", "ظ": "dh", "ع": "a", "غ": "gh",
    "ف": "f", "ڨ": "g", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "a", "و": "ou", "ي": "i",
    "ى": "a", "ئ": "i", "ؤ": "ou", "ء": "", "ـ": "",
}
_AR_PREFIXES = ("وال", "بال", "لل", "ال", "و", "ب", "ل")


def _is_arabic(text: str) -> bool:
    return any("\u0600" <= c <= "\u06ff" for c in text)


def arabic_to_latin(text: str) -> str:
    """'زوز قهوة و بريك للطاولة ٣' -> 'zouz kahwa w brik tawla 3'."""
    text = re.sub(r"[\u064b-\u0652\u0640]", "", (text or "").translate(_AR_DIGITS))  # vowel marks, tatweel
    out = []
    for word in re.split(r"[\s،؟!?.,:;]+", text):
        if not word:
            continue
        if not _is_arabic(word):
            out.append(word)
            continue
        latin = AR_WORDS.get(word)
        if latin is None:
            for pre in _AR_PREFIXES:
                rest = word[len(pre):]
                if word.startswith(pre) and len(rest) >= 2 and rest in AR_WORDS:
                    latin = (("w " if pre.startswith("و") else "") + AR_WORDS[rest]).strip()
                    break
        if latin is None:
            rest = word[2:] if word.startswith("ال") and len(word) > 3 else word
            latin = "".join(_AR_LETTERS.get(c, "") for c in rest)
        if latin:
            out.append(latin)
    return " ".join(out)


def normalize(text: str) -> str:
    """Lowercase, strip accents and punctuation: 'Thé à la menthe !' -> 'the a la menthe'."""
    if _is_arabic(text or ""):
        text = arabic_to_latin(text)
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("’", "'").replace("œ", "oe")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"([a-z])(\d)", r"\1 \2", text)  # "table4" -> "table 4"
    text = re.sub(r"(\d)([a-z])", r"\1 \2", text)  # "2brik" -> "2 brik"
    return text.strip()


_PHON_RULES = [
    (r"ph", "f"), (r"qu", "k"), (r"ck", "k"), (r"q", "k"), (r"c(?=[aoukrl]|$)", "k"), (r"c", "s"),
    (r"kh", "k"), (r"th", "t"), (r"dh", "d"), (r"gh", "g"), (r"ou", "u"), (r"oo", "u"), (r"w", "u"),
    (r"ee", "i"), (r"y", "i"), (r"z", "s"), (r"9", "k"), (r"3", "a"), (r"7", "h"), (r"h", ""),
    (r"(.)\1+", r"\1"), (r"(?<=..)(es|e|s|x)$", ""),
]


def phonetic(tok: str) -> str:
    """Rough sound-alike key, so speech-to-text spellings still match:
    'brique' / 'bric' / 'brick' -> 'brik', 'makrout' ~ 'makroudh', 'kousksi' ~ 'couscous'."""
    for pat, rep in _PHON_RULES:
        tok = re.sub(pat, rep, tok)
    return tok


def _singular(tok: str) -> str:
    if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def _tok_eq(a: str, b: str) -> bool:
    a, b = _singular(a), _singular(b)
    if a == b:
        return True
    if a.isdigit() or b.isdigit():
        return False
    pa, pb = phonetic(a), phonetic(b)
    if pa == pb and len(pa) >= 2:
        return True
    if len(a) >= 4 and len(b) >= 4:
        return (difflib.SequenceMatcher(None, a, b).ratio() >= 0.8
                or (min(len(pa), len(pb)) >= 4 and difflib.SequenceMatcher(None, pa, pb).ratio() >= 0.75))
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
            elif j + 1 < len(tokens) and j + 1 not in used and len(alias[k]) >= 6 \
                    and _number(tokens[j]) is None and tokens[j] not in STOP \
                    and _tok_eq(tokens[j] + tokens[j + 1], alias[k]):
                k += 1
                j += 2
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


def _score(res: Dict[str, Any]) -> float:
    return 2.0 * sum(i["qty"] > 0 for i in res["items"]) + (1.5 if res["table"] else 0.0) - 0.5 * len(res["unmatched"])


def parse_best(texts: List[str], menu: Dict[str, Any], tables: List[str], lang: str = "fr") -> Dict[str, Any]:
    """Speech engines return several guesses for one sentence: keep the one that
    makes the most sense for this menu (most dishes recognised, a table, fewest leftovers)."""
    results = [parse_order(t, menu, tables, lang) for t in texts if t and t.strip()]
    if not results:
        return {"text": "", "table": None, "items": [], "unmatched": []}
    return max(results, key=_score)  # max keeps the first (most confident) guess on ties
