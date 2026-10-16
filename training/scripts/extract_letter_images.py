"""Extract hand landmarks from the ISL alphabet photos (C:\\ISL\\dataset_ISL, one folder per letter).

The photos are 100x100 px close-ups, so each one is enlarged 3x and given a border before MediaPipe
HandLandmarker runs (this found hands in ~52% of a 260-photo sample versus ~44% unchanged). Only
landmarks are written, one .npz per letter, never images:

    data/processed/landmarks/letters/<LETTER>.npz
        files [N]              photo file names (for grouping and audit)
        hands [N, 2, 21, 3]    normalized image coordinates of the photo as given (before enlarging)
        present [N, 2]         hand slot filled
        handedness [N, 2]      MediaPipe label ("Left"/"Right"/"")
        score [N, 2]           handedness score

Usage: python training/scripts/extract_letter_images.py [--src C:\\ISL\\dataset_ISL] [--out data/processed/landmarks/letters]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "training" / "assets" / "mediapipe" / "hand_landmarker.task"
SCALE, PAD = 3, 1.0  # enlarge 3x, then add a replicated border of 1x the enlarged size on every side
MIN_CONF = 0.1


def prepare(bgr: np.ndarray) -> tuple[np.ndarray, int, int]:
    img = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    p = int(img.shape[0] * PAD)
    return cv2.copyMakeBorder(img, p, p, p, p, cv2.BORDER_REPLICATE), p, img.shape[0]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=Path(r"C:\ISL\dataset_ISL"))
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "processed" / "landmarks" / "letters")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    lm = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(ASSET)), running_mode=vision.RunningMode.IMAGE,
        num_hands=2, min_hand_detection_confidence=MIN_CONF, min_hand_presence_confidence=MIN_CONF))
    report = {}
    t0 = time.time()
    for folder in sorted(p for p in args.src.iterdir() if p.is_dir()):
        letter = folder.name.upper()
        files = sorted(folder.glob("*.jpg"), key=lambda f: (len(f.stem), f.stem))
        n = len(files)
        hands = np.zeros((n, 2, 21, 3), np.float32)
        present = np.zeros((n, 2), bool)
        handed = np.full((n, 2), "", dtype="<U5")
        score = np.zeros((n, 2), np.float32)
        for i, f in enumerate(files):
            bgr = cv2.imread(str(f))
            if bgr is None:
                continue
            img, p, size = prepare(bgr)
            full = img.shape[0]
            res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
            for h, (pts, cat) in enumerate(zip(res.hand_landmarks[:2], res.handedness[:2])):
                xyz = np.array([(q.x, q.y, q.z) for q in pts], np.float32)
                xyz[:, :2] = (xyz[:, :2] * full - p) / size  # back to the photo's own 0..1 coordinates
                xyz[:, 2] *= full / size
                hands[i, h], present[i, h] = xyz, True
                handed[i, h], score[i, h] = cat[0].category_name, cat[0].score
        np.savez_compressed(args.out / f"{letter}.npz", files=np.array([f.name for f in files]), hands=hands,
                            present=present, handedness=handed, score=score)
        counts = present.sum(axis=1)
        report[letter] = {"photos": n, "no_hand": int((counts == 0).sum()), "one_hand": int((counts == 1).sum()),
                          "two_hands": int((counts == 2).sum())}
        print(letter, report[letter], f"{time.time() - t0:.0f}s", flush=True)
    lm.close()
    (args.out / "extraction_report.json").write_text(json.dumps(
        {"source": str(args.src), "scale": SCALE, "pad": PAD, "min_conf": MIN_CONF, "letters": report}, indent=1))


if __name__ == "__main__":
    main()
