import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sign_speech import Pyttsx3Speaker, StablePredictionGate


class StablePredictionGateTests(unittest.TestCase):
    def test_emits_after_label_is_held_for_configured_duration(self):
        gate = StablePredictionGate(hold_s=0.5)

        self.assertIsNone(gate.update(1.0, "THANK"))
        self.assertIsNone(gate.update(1.49, "THANK"))
        self.assertEqual(gate.update(1.5, "THANK"), "THANK")

    def test_emits_a_stable_label_only_once_until_it_changes_or_resets(self):
        gate = StablePredictionGate(hold_s=0.5)

        gate.update(2.0, "FOOD")
        self.assertEqual(gate.update(2.5, "FOOD"), "FOOD")
        self.assertIsNone(gate.update(3.0, "FOOD"))
        self.assertIsNone(gate.update(3.1, "THANK"))
        self.assertEqual(gate.update(3.6, "THANK"), "THANK")

    def test_unknown_prediction_resets_the_hold(self):
        gate = StablePredictionGate(hold_s=0.5)

        gate.update(4.0, "THANK")
        self.assertIsNone(gate.update(4.3, None))
        self.assertIsNone(gate.update(4.4, "THANK"))
        self.assertEqual(gate.update(4.9, "THANK"), "THANK")

    def test_hold_duration_must_be_positive_and_finite(self):
        for hold_s in (0.0, -0.1, float("nan"), float("inf")):
            with self.subTest(hold_s=hold_s), self.assertRaises(ValueError):
                StablePredictionGate(hold_s)

    def test_speaker_uses_pyttsx3_off_the_calling_thread(self):
        engine = MagicMock()
        pyttsx3 = SimpleNamespace(init=MagicMock(return_value=engine))
        with patch.dict("sys.modules", {"pyttsx3": pyttsx3}):
            speaker = Pyttsx3Speaker()
            speaker.speak("I_ME_MINE_MY")
            speaker.close()

        engine.say.assert_called_once_with("I ME MINE MY")
        engine.runAndWait.assert_called_once_with()

    def test_speaker_surfaces_engine_initialization_failures(self):
        pyttsx3 = SimpleNamespace(init=MagicMock(side_effect=OSError("no audio device")))
        with patch.dict("sys.modules", {"pyttsx3": pyttsx3}):
            speaker = Pyttsx3Speaker()
            speaker.close()

        with self.assertRaisesRegex(RuntimeError, "no audio device"):
            speaker.raise_if_failed()


if __name__ == "__main__":
    unittest.main()
