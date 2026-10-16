"""The sign library beyond the word model: fingerspelling letters and whole phrases.

- Letters (LETTER_A ... LETTER_Z): a per-frame classifier (mudra_ml.letters, models/isl_letters_v1) and one
  example hand shape per letter from the alphabet-photo landmarks (data/processed/landmarks/letters, local).
- Phrases (e.g. ARE_YOU_FREE_TODAY): a whole-clip classifier (models/isl_phrases_v1_bilstm) and one
  training video's landmarks per phrase as the example.

Examples are landmark points only, never photos or video.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from mudra_ml.letters import LETTERS, LetterModel, letter_features

from mudra_api.recognizer import SignRecognizer, readable
from mudra_api.references import ReferenceClips

log = logging.getLogger("mudra_api")

LETTER_PREFIX = "LETTER_"
LETTER_HOLD_FRAMES = 15  # a still hand shape is served as a 1 s clip at 15 fps
TWO_HANDED_SHARE = 0.5   # a letter is shown two-handed when most of its photos with hands show two hands


def letter_id(letter: str) -> str:
    return f"{LETTER_PREFIX}{letter}"


class LetterReferences:
    """One example hand shape per letter: the photo the letter model finds most typical of that letter
    (falls back to the strongest hand detection without a model)."""

    def __init__(self, landmark_dir: Path, model: LetterModel | None = None):
        self._frames: dict[str, dict] = {}
        for letter in LETTERS:
            path = Path(landmark_dir) / f"{letter}.npz"
            if not path.exists():
                continue
            z = np.load(path)
            counts = z["present"].sum(axis=1)
            with_hands = counts > 0
            if not with_hands.any():
                continue
            want = 2 if (counts[with_hands] == 2).mean() >= TWO_HANDED_SHARE else 1
            candidates = np.where(counts == want)[0]
            if model is not None:
                feats = np.stack([letter_features([z["hands"][i, h] for h in range(2) if z["present"][i, h]])
                                  for i in candidates])
                own = model.probabilities(feats)[:, model.classes.index(letter)]
                best = int(candidates[np.argmax(own)])
            else:
                best = int(candidates[np.argmax(z["score"][candidates].sum(axis=1))])
            hands = [z["hands"][best, h] for h in range(2) if z["present"][best, h]]
            hands.sort(key=lambda h: -float(h[0, 0]))  # player slots are signer-left / right of a mirrored view
            slots = [np.round(h, 4).tolist() for h in hands] + [None] * (2 - len(hands))
            self._frames[letter_id(letter)] = {"hands": slots, "pose": None}
        self.available = set(self._frames)

    def get(self, sign: str) -> dict | None:
        frame = self._frames.get(sign)
        if frame is None:
            return None
        return {"sign": sign, "fps": 15.0, "width": 100, "height": 100, "frames": [frame] * LETTER_HOLD_FRAMES, "kind": "letter"}


class Library:
    def __init__(self, letters_model_dir: Path, letters_landmarks: Path, phrases_model_dir: Path,
                 phrases_split: Path, device: str = "cpu"):
        self.letter_model: LetterModel | None = None
        self.phrase_model: SignRecognizer | None = None
        try:
            self.letter_model = LetterModel(letters_model_dir)
            log.info("Loaded letter model %s", letters_model_dir.name)
        except FileNotFoundError:
            log.warning("No letter model in %s", letters_model_dir)
        try:
            self.phrase_model = SignRecognizer(phrases_model_dir, device)
            log.info("Loaded phrase model %s (%d phrases)", self.phrase_model.name, len(self.phrase_model.classes))
        except FileNotFoundError:
            log.warning("No phrase model in %s", phrases_model_dir)
        self.letter_refs = LetterReferences(letters_landmarks, self.letter_model)
        self.phrase_refs = ReferenceClips(phrases_split, sources=("islsentences",))

    def reference(self, sign: str) -> dict | None:
        if sign.startswith(LETTER_PREFIX):
            return self.letter_refs.get(sign)
        found = self.phrase_refs.get(sign) if self.phrase_model and sign in self.phrase_model.classes else None
        return {**found, "kind": "phrase"} if found else None

    def listing(self) -> dict:
        letters = [{"sign": letter_id(L), "label": L, "has_reference": letter_id(L) in self.letter_refs.available}
                   for L in LETTERS] if self.letter_model else []
        phrases = [{"sign": c, "label": readable(c), "has_reference": c in self.phrase_refs.available}
                   for c in (self.phrase_model.classes if self.phrase_model else []) if not c.startswith("_")]
        info = {}
        if self.letter_model:
            m = self.letter_model.card["metrics"]["test"]
            info["letters"] = {"model": self.letter_model.card["name"], "test_top1": m["top1"], "test_top3": m["top3"],
                               "threshold": self.letter_model.threshold}
        if self.phrase_model:
            m = self.phrase_model.card["metrics"]["test"]
            info["phrases"] = {"model": self.phrase_model.name, "test_top1": m.get("accuracy"), "test_top5": m.get("top5_accuracy"),
                               "threshold": self.phrase_model.threshold}
        return {"letters": letters, "phrases": phrases, "models": info}
