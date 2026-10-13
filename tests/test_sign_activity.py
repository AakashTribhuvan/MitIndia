import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import numpy as np

from web_dashboard import DashboardServer, DashboardState
SCRIPT_PATH = Path(__file__).resolve().parents[1] / "test.py"
SPEC = importlib.util.spec_from_file_location("mudra_phone_webcam_test", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load sign tracker from {SCRIPT_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
SignActivityTracker = MODULE.SignActivityTracker


class SignActivityTrackerTests(unittest.TestCase):
    def test_rejects_brief_fidget(self):
        tracker = SignActivityTracker(start_hold_s=0.15, stop_hold_s=0.5)

        self.assertIsNone(tracker.update(0.0, visible=True, raised=True, moving=False))
        self.assertIsNone(tracker.update(0.05, visible=False, raised=False, moving=False))
        self.assertEqual(tracker.state, "idle")

    def test_raised_static_hold_stays_active_and_ends_at_rest_onset(self):
        tracker = SignActivityTracker(start_hold_s=0.15, stop_hold_s=0.5)

        self.assertIsNone(tracker.update(1.0, visible=True, raised=True, moving=False))
        self.assertIsNone(tracker.update(1.1, visible=True, raised=True, moving=False))
        self.assertEqual(tracker.update(1.16, visible=True, raised=True, moving=False), "started")
        self.assertEqual(tracker.sign_started_at, 1.0)
        for timestamp in (1.4, 1.8, 2.0):
            self.assertIsNone(tracker.update(timestamp, visible=True, raised=True, moving=False))
        self.assertEqual(tracker.state, "signing")

        self.assertIsNone(tracker.update(2.1, visible=True, raised=False, moving=False))
        self.assertEqual(tracker.state, "ending")
        self.assertEqual(tracker.update(2.61, visible=False, raised=False, moving=False), "stopped")
        self.assertEqual(tracker.completed_end_at, 2.1)
        self.assertAlmostEqual(tracker.completed_duration_s, 1.1)

    def test_activity_resuming_during_stop_debounce_continues_same_segment(self):
        tracker = SignActivityTracker(start_hold_s=0.1, stop_hold_s=0.5)
        tracker.update(0.0, visible=True, raised=True, moving=False)
        self.assertEqual(tracker.update(0.1, visible=True, raised=True, moving=False), "started")

        tracker.update(0.2, visible=True, raised=False, moving=False)
        self.assertIsNone(tracker.update(0.5, visible=True, raised=True, moving=False))
        self.assertEqual(tracker.state, "signing")
        self.assertIsNone(tracker.update(0.6, visible=True, raised=False, moving=False))
        self.assertEqual(tracker.update(1.11, visible=False, raised=False, moving=False), "stopped")
        self.assertAlmostEqual(tracker.completed_duration_s, 0.6)

    def test_wrist_movement_alone_starts_dynamic_segment(self):
        tracker = SignActivityTracker(start_hold_s=0.15, stop_hold_s=0.5)

        self.assertIsNone(tracker.update(4.0, visible=True, raised=False, moving=True))
        self.assertIsNone(tracker.update(4.1, visible=True, raised=False, moving=True))
        self.assertEqual(tracker.update(4.16, visible=True, raised=False, moving=True), "started")
        self.assertEqual(tracker.sign_started_at, 4.0)
        tracker.update(4.3, visible=True, raised=False, moving=False)
        self.assertEqual(tracker.update(4.81, visible=True, raised=False, moving=False), "stopped")
        self.assertEqual(tracker.completed_end_at, 4.3)
        self.assertAlmostEqual(tracker.completed_duration_s, 0.3)

    def test_sign_box_is_drawn_around_all_detected_hands(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        hand_landmarks = [
            [SimpleNamespace(x=0.3, y=0.4), SimpleNamespace(x=0.5, y=0.6)],
            [SimpleNamespace(x=0.6, y=0.3), SimpleNamespace(x=0.7, y=0.5)],
        ]

        MODULE.draw_sign_box(frame, hand_landmarks, "SIGN IN ACTION", (80, 240, 160))

        self.assertTrue(np.any(frame[18, 50]))
        self.assertTrue(np.any(frame[50, 82]))
        self.assertTrue(np.any(frame[15:75, 15:85]))

    def test_hand_overlay_draws_index_arrow_and_face_direction(self):
        landmarks = [
            SimpleNamespace(x=0.5, y=0.5, z=0.0)
            for _ in range(21)
        ]
        landmarks[0].x, landmarks[0].y = 0.5, 0.6
        landmarks[5].x, landmarks[5].y = 0.5, 0.5
        landmarks[8].x, landmarks[8].y = 0.5, 0.3
        frame = np.zeros((100, 100, 3), dtype=np.uint8)

        with (
            patch.object(MODULE.cv2, "arrowedLine") as arrow,
            patch.object(MODULE.cv2, "putText") as put_text,
        ):
            MODULE.draw_hand(frame, landmarks, face_point=(50, 20))

        self.assertEqual(arrow.call_args.args[1:3], ((50, 50), (50, 30)))
        self.assertEqual(put_text.call_args.args[1], "POINTING TOWARD FACE")

    def test_mode_label_waits_for_persistent_change(self):
        tracker = SignActivityTracker(start_hold_s=0.1, stop_hold_s=0.5, mode_hold_s=0.4)
        tracker.update(0.0, visible=True, raised=True, moving=False)
        self.assertEqual(tracker.update(0.1, visible=True, raised=True, moving=False), "started")
        self.assertEqual(tracker.update_mode(0.1, raised=True, moving=False), "static")

        self.assertEqual(tracker.update_mode(0.2, raised=True, moving=True), "static")
        self.assertEqual(tracker.update_mode(0.45, raised=True, moving=True), "static")
        self.assertEqual(tracker.update_mode(0.61, raised=True, moving=True), "dynamic")
        self.assertEqual(tracker.update_mode(0.7, raised=True, moving=False), "dynamic")

    def test_settings_reject_values_outside_supported_range(self):
        settings = DashboardState({"start_hold": 0.2})

        with self.assertRaisesRegex(ValueError, "between"):
            settings.update_settings({"stop_hold": 0.0})
        with self.assertRaisesRegex(ValueError, "Unknown setting"):
            settings.update_settings({"unrecognized": 1.0})

    def test_dashboard_serves_page_and_applies_live_setting_updates(self):
        dashboard = DashboardServer("127.0.0.1", 0, {"start_hold": 0.2})
        dashboard.start()
        try:
            host, port = dashboard.address
            base_url = f"http://{host}:{port}"
            dashboard.state.update_runtime({"state": "signing"}, b"JPEG")
            with urlopen(f"{base_url}/") as response:
                self.assertEqual(response.status, 200)
                page = response.read()
                self.assertIn(b"Boundary controls", page)
                self.assertIn(b"STATIC-POSE MATCH", page)

            with urlopen(f"{base_url}/stream.mjpg", timeout=2) as response:
                self.assertIn("multipart/x-mixed-replace", response.headers["Content-Type"])
                self.assertEqual(response.readline(), b"--frame\r\n")
                while response.readline().strip():
                    pass
                self.assertEqual(response.read(4), b"JPEG")

            request = Request(
                f"{base_url}/api/settings",
                data=json.dumps({"mode_hold": 0.8}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            with urlopen(request) as response:
                self.assertEqual(response.status, 200)
                payload = json.loads(response.read())
            self.assertEqual(payload["settings"]["mode_hold"], 0.8)
            self.assertEqual(dashboard.state.settings()["mode_hold"], 0.8)
            dashboard.state.update_runtime(
                {
                    "state": "signing",
                    "recognition": {
                        "enabled": True,
                        "state": "recognized",
                        "label": "YOU",
                    },
                },
                b"JPEG",
            )
            self.assertEqual(
                dashboard.state.snapshot()["runtime"]["recognition"]["label"],
                "YOU",
            )

            bad_request = Request(
                f"{base_url}/api/settings",
                data=json.dumps({"mode_hold": 4.0}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            with self.assertRaises(HTTPError) as error:
                urlopen(bad_request)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        finally:
            dashboard.close()

    def test_learning_api_serves_only_registered_reference_images(self):
        reference = (
            Path(__file__).resolve().parents[1]
            / "training_data"
            / "Frames_Word_Level"
            / "YOU"
            / "YOU (1).jpg"
        )
        self.assertTrue(reference.is_file())
        dashboard = DashboardServer(
            "127.0.0.1",
            0,
            {},
            learning_examples=[("YOU", reference, 2)],
        )
        dashboard.start()
        try:
            host, port = dashboard.address
            base_url = f"http://{host}:{port}"
            with urlopen(f"{base_url}/api/learning/next") as response:
                lesson = json.loads(response.read())
            self.assertEqual(lesson["label"], "YOU")
            self.assertEqual(lesson["expected_hand_count"], 2)
            self.assertEqual(lesson["total"], 1)
            self.assertEqual(dashboard.learning_target(), ("YOU", 2))
            with urlopen(f"{base_url}{lesson['image_url']}") as response:
                self.assertEqual(response.headers["Content-Type"], "image/jpeg")
                self.assertTrue(response.read().startswith(b"\xff\xd8"))

            with self.assertRaises(HTTPError) as error:
                urlopen(f"{base_url}/api/learning/images/99")
            self.assertEqual(error.exception.code, 404)
            error.exception.close()

            clear_target = Request(
                f"{base_url}/api/learning/target",
                data=json.dumps({"sample_id": None}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            with urlopen(clear_target) as response:
                self.assertIsNone(json.loads(response.read())["target"])
            self.assertIsNone(dashboard.learning_target())

            invalid_target = Request(
                f"{base_url}/api/learning/target",
                data=json.dumps({"sample_id": 99}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            with self.assertRaises(HTTPError) as error:
                urlopen(invalid_target)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        finally:
            dashboard.close()

    def test_learning_api_rejects_image_paths_outside_the_dataset(self):
        with self.assertRaisesRegex(ValueError, "inside the selected dataset"):
            DashboardServer(
                "127.0.0.1",
                0,
                {},
                learning_examples=[("YOU", Path(__file__).resolve())],
            )


if __name__ == "__main__":
    unittest.main()
