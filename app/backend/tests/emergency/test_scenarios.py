"""Demo scenarios A-I end to end through the API."""


def test_a_medical_chest_pain_and_breathing(em):
    s = em("A_MEDICAL")
    s.play()
    ctx = s.view["context"]
    assert ctx["category"] == "MEDICAL"
    assert ctx["summary"] == "You reported chest pain. You reported difficulty breathing."
    assert s.view["status"] == "POSSIBLE_EMERGENCY_DETECTED"
    assert [e["sign"] for e in s.view["sequence"]] == ["HELP", "CHEST", "PAIN", "BREATHING", "DIFFICULT"]
    assert "WHO_AFFECTED" in s.pending() and "LOCATION" in s.pending()
    assert "ANYONE_UNCONSCIOUS" not in s.pending()  # only asked when it is about someone else
    s.answer("WHO_AFFECTED", "OTHER")
    assert "ANYONE_UNCONSCIOUS" in s.pending()
    s.answer("ANYONE_UNCONSCIOUS", "NO")
    s.confirm_and_share()
    assert s.view["status"] == "SENT_TO_CONFIGURED_DESTINATION"
    inc = s.view["incident"]
    assert inc["sharing_status"] == "DELIVERED" and inc["user_confirmed"] and inc["priority"] is None
    provenance = {(f["kind"], f["provenance"]) for f in inc["facts"]}
    assert ("SUMMARY", "USER_CONFIRMED") in provenance and ("SIGN", "USER_REPORTED") in provenance
    assert ("INTERPRETATION", "AI_INFERRED") in provenance and ("ANSWER", "USER_REPORTED") in provenance
    assert inc["dispatch_attempts"][0]["simulated"] is True


def test_b_road_accident_skips_injury_question(em):
    s = em("B_ROAD_ACCIDENT")
    s.play()
    ctx = s.view["context"]
    assert ctx["category"] == "GENERAL_ACCIDENT"
    assert ctx["interpretations"][0]["alternatives"] == ["ROAD_ACCIDENT"]
    assert "Injury reported." in ctx["summary"]
    assert "ANYONE_INJURED" not in s.pending()  # the injury was already reported


def test_c_fire(em):
    s = em("C_FIRE")
    s.play()
    assert s.view["context"]["category"] == "FIRE"
    assert s.pending()[0] == "PEOPLE_TRAPPED"
    s.answer("PEOPLE_TRAPPED", "YES")
    s.confirm_and_share()
    assert s.view["incident"]["priority"] == "HIGH"  # explicit answer rule


def test_d_safety_location_only_if_safe(em):
    s = em("D_SAFETY")
    s.play()
    ctx = s.view["context"]
    assert ctx["category"] == "FOLLOWING_STALKING"
    assert ctx["summary"] == "You reported being followed and feeling unsafe."
    assert set(s.pending()) == {"IMMEDIATE_DANGER", "LOCATION_SAFE"}
    assert "POLICE_SAFETY" in [i["category"] for i in ctx["interpretations"]]


def test_e_custom_gesture(em):
    s = em("E_GESTURE", mode="GESTURE")
    s.play()
    ctx = s.view["context"]
    assert ctx["category"] == "MEDICAL"
    assert ctx["summary"] == "I need medical assistance. Please communicate with me using text."
    assert s.view["sequence"][0]["event_type"] == "GESTURE_DETECTED"
    s.confirm_and_share()
    msgs = [f for f in s.view["incident"]["facts"] if f["kind"] == "MESSAGE"]
    assert msgs and msgs[0]["provenance"] == "USER_REPORTED"


def test_f_help_only_asks_kind_of_help(em):
    s = em("F_HELP_ONLY")
    s.play()
    assert s.view["context"]["category"] == "GENERAL_HELP"
    assert s.pending() == ["HELP_TYPE"]
    s.answer("HELP_TYPE", "FIRE")
    assert s.view["context"]["category"] == "FIRE"
    assert "HELP_TYPE" not in s.pending()


def test_g_correction_updates_summary(em):
    s = em("G_CORRECTION")
    s.play()
    ctx = s.view["context"]
    assert ctx["summary"] == "You reported chest pain."
    assert ctx["uncertain"] and ctx["uncertain"][0]["sign"] == "CHEST"
    assert ctx["interpretations"][0]["uncertain"] is True
    chest = s.view["sequence"][0]
    s.post("/sequence/correct", {"event_id": chest["event_id"], "sign": "stomach"})
    ctx = s.view["context"]
    assert ctx["summary"] == "You reported pain in the stomach."
    assert s.view["sequence"][0]["original_sign"] == "CHEST"
    # the raw sequence is never edited
    assert s.view["raw_events"][0]["sign"] == "CHEST"
    s.post("/sequence/undo")
    assert s.view["context"]["summary"] == "You reported chest pain."


def test_h_no_emergency(em):
    s = em("H_NO_EMERGENCY")
    s.play()
    assert s.view["context"]["category"] is None
    assert s.view["status"] == "COMMUNICATING"
    assert s.view["general_message"] == "No emergency was detected. You communicated: water, thirsty."
    s.post("/review")
    s.post("/confirm", expect=422)  # nothing to report unless the user chooses a kind of help


def test_i_dispatch_failure_and_retry(em):
    s = em("I_DISPATCH_FAILURE")
    s.play()
    s.confirm_and_share()
    assert s.view["status"] == "DELIVERY_FAILED"
    assert s.view["incident"]["sharing_status"] == "FAILED"
    assert "Nothing was received" in s.view["incident"]["dispatch_attempts"][0]["error"]
    s.post("/share")
    assert s.view["status"] == "SENT_TO_CONFIGURED_DESTINATION"
    assert [d["status"] for d in s.view["incident"]["dispatch_attempts"]] == ["FAILED", "DELIVERED"]


def test_incident_lists_every_matched_rule(em):
    s = em("A_MEDICAL")
    s.play()
    s.confirm_and_share()
    rules = {f["key"] for f in s.view["incident"]["facts"] if f["kind"] == "INTERPRETATION"}
    assert {"R-MED-CHEST-PAIN", "R-MED-BREATHING"} <= rules
