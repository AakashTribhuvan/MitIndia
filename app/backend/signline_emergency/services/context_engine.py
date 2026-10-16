"""Deterministic emergency context engine (no LLM, no randomness).

Input: the normalized sequence (signs, button selections, gesture intents), answers and the user's own
corrections. Output: ranked possible interpretations, each with the rule that produced it, the signals
it matched, the lowest confidence among them, what is missing, and which questions would help.
Summaries only repeat what was reported ("You reported chest pain"); nothing is diagnosed.
"""

from __future__ import annotations

import json
from functools import lru_cache

from ..config import CONFIG_DIR

LOW_CONFIDENCE = 0.6  # interpretations resting on a sign below this are marked uncertain


@lru_cache
def rules_config() -> dict:
    return json.loads((CONFIG_DIR / "emergency_rules.json").read_text(encoding="utf-8"))


def category_label(category: str | None) -> str:
    return rules_config()["category_labels"].get(category or "UNKNOWN", category or "Not clear yet")


def _default_questions(category: str) -> list[str]:
    for r in rules_config()["rules"]:
        if r["category"] == category:
            return list(r["questions"])
    return ["LOCATION"]


def signals_from(sequence: list[dict], answers: dict[str, object]) -> tuple[dict[str, float | None], list[dict]]:
    """{signal: lowest confidence (None = user selection)} and the uncertain entries."""
    signals: dict[str, float | None] = {}
    uncertain: list[dict] = []
    for e in sequence:
        if e["event_type"] == "UNKNOWN_SIGN":
            uncertain.append({"event_id": e["event_id"], "sign": e["sign"], "confidence": e["confidence"],
                              "reason": "Not recognised clearly"})
            continue
        conf = e["confidence"]
        if conf is not None and conf < LOW_CONFIDENCE:
            uncertain.append({"event_id": e["event_id"], "sign": e["sign"], "confidence": conf,
                              "reason": "Low recognition confidence"})
        prev = signals.get(e["sign"], "absent")
        signals[e["sign"]] = conf if prev == "absent" else (None if prev is None or conf is None else min(prev, conf))
    help_type = answers.get("HELP_TYPE")
    if isinstance(help_type, str):
        signals[f"CHOICE:{help_type}"] = None
    return signals, uncertain


def _match(rule: dict, signals: dict) -> list[str] | None:
    if not all(s in signals for s in rule["all"]):
        return None
    any_hit = [s for s in rule["any"] if s in signals]
    if rule["any"] and not any_hit:
        return None
    if any(s in signals for s in rule["none"]):
        return None
    return list(dict.fromkeys(rule["all"] + any_hit))


def _confidence(matched: list[str], signals: dict) -> float | None:
    values = [signals[s] for s in matched if signals.get(s) is not None]
    return round(min(values), 3) if values else None


def evaluate(sequence: list[dict], answers: dict[str, object] | None = None,
             gesture_messages: dict[str, str] | None = None) -> dict:
    cfg = rules_config()
    answers = answers or {}
    signals, uncertain = signals_from(sequence, answers)
    interpretations: list[dict] = []

    for sig in signals:  # explicit user choices and configured gestures come first
        if sig.startswith("CHOICE:"):
            cat = sig.split(":", 1)[1]
            if cat in cfg["categories"]:
                interpretations.append({
                    "rule_id": "USER-CHOICE", "version": 1, "category": cat, "alternatives": [],
                    "summary": f"You asked for {category_label(cat).lower()}.", "matched": [sig], "confidence": None,
                    "uncertain": False, "missing": [], "questions": _default_questions(cat), "priority": 100,
                    "provenance": "USER_REPORTED", "explanation": "Selected by the user."})
        elif sig.startswith("INTENT:"):
            intent = sig.split(":", 1)[1]
            cat = cfg["intent_categories"].get(intent)
            if cat:
                message = (gesture_messages or {}).get(intent) or f"Configured gesture: {intent.replace('_', ' ').lower()}."
                interpretations.append({
                    "rule_id": "GESTURE-INTENT", "version": 1, "category": cat, "alternatives": [],
                    "summary": message, "matched": [sig], "confidence": None, "uncertain": False, "missing": [],
                    "questions": _default_questions(cat), "priority": 100, "provenance": "USER_REPORTED",
                    "explanation": "From the user's own configured emergency gesture."})

    for rule in cfg["rules"]:
        matched = _match(rule, signals)
        if matched is None:
            continue
        conf = _confidence(matched, signals)
        part = next((p for p in cfg["body_parts"] if p in signals), None)
        summary = rule["summary"].replace("{body_part}", f" in the {part.lower()}" if part and part != "CHEST" else "")
        interpretations.append({
            "rule_id": rule["id"], "version": rule["version"], "category": rule["category"],
            "alternatives": rule["alternatives"], "summary": summary, "matched": matched, "confidence": conf,
            "uncertain": conf is not None and conf < LOW_CONFIDENCE, "missing": rule["missing"],
            "questions": rule["questions"], "priority": rule["priority"], "provenance": "AI_INFERRED",
            "explanation": f"Matched {', '.join(matched)} (rule {rule['id']} v{rule['version']})."})

    # "HELP" alone only stands when nothing more specific was reported; a more specific pain rule
    # already covers the generic one
    if any(i["rule_id"] != "R-HELP-ONLY" for i in interpretations):
        interpretations = [i for i in interpretations if i["rule_id"] != "R-HELP-ONLY"]
    if any(i["rule_id"] == "R-MED-CHEST-PAIN" for i in interpretations):
        interpretations = [i for i in interpretations if i["rule_id"] != "R-MED-PAIN"]
    interpretations.sort(key=lambda i: (-i["priority"], -len(i["matched"])))

    top = interpretations[0] if interpretations else None
    facts = [cfg["fact_phrases"][s] for s in signals if s in cfg["fact_phrases"] and cfg["fact_phrases"][s].endswith(".")]
    summary = None
    if top:
        same = list(dict.fromkeys(i["summary"] for i in interpretations if i["category"] == top["category"]))
        summary = " ".join(same + [f for f in facts if f.split(" ")[0].lower() not in " ".join(same).lower()])
    general = None
    if not interpretations and sequence:
        words = ", ".join(e["sign"].replace("_", " ").lower() for e in sequence if e["event_type"] != "UNKNOWN_SIGN")
        general = f"No emergency was detected. You communicated: {words}." if words else None

    by_cat: list[dict] = []
    for i in interpretations:  # one entry per category, best first
        if all(b["category"] != i["category"] for b in by_cat):
            by_cat.append(i)
    return {
        "interpretations": by_cat,
        "matched_rules": interpretations,  # every rule that matched (by_cat keeps the best one per category)
        "top_category": top["category"] if top else None,
        "summary": summary,
        "uncertain": uncertain,
        "missing": top["missing"] if top else [],
        "questions": top["questions"] if top else [],
        "general_message": general,
        "signals": sorted(signals),
    }
