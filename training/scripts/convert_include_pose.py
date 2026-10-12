"""Convert the OpenHands INCLUDE pose release into MUDRA's landmark schema.

Source: Zenodo record 6674324 (CC-BY-4.0), ``INCLUDE.zip`` -> ``Pose_Signs/<Category>/<N. word>/<clip>.pkl``.
Each pickle holds MediaPipe Holistic output in pixels: ``keypoints`` [T, 75, 3]
(33 pose, 21 signer-left hand, 21 signer-right hand), ``confidences`` [T, 75], ``vid_shape`` (H, W).
Hand-block order was verified against pose wrists (left block nearest pose landmark 15 in ~97% of frames).

Axis scaling quirk (verified 2026-10-04): although ``vid_shape`` is (1080, 1920), the release
stores ``x = x_norm * 1080`` and ``y = y_norm * 1920`` for landscape 1920x1080 video. Only this
reading gives human proportions (median torso/shoulder-width 1.57 vs 4.92 for the naive reading),
so x is divided by vid_shape[0] and y by vid_shape[1], and the true frame is width=1920, height=1080.

The official train/test split is preserved (test rows are pre-assigned to "test").
INCLUDE has no signer IDs, so groups are per clip and the split is not signer-independent.

    python training/scripts/convert_include_pose.py --variant include
"""

from __future__ import annotations

import argparse
import csv
import pickle
from pathlib import Path

import numpy as np
from tqdm import tqdm

from mudra_ml import schema
from mudra_ml.config import load_config, project_path
from mudra_ml.data.manifest import ManifestRow, normalize_label, stable_id, write_manifest
from mudra_ml.preprocessing.sequence import LandmarkSequence

DEFAULT_ROOT = Path("data/external/include_pose/INCLUDE")
POSE = slice(0, 33)
LEFT_HAND = slice(33, 54)
RIGHT_HAND = slice(54, 75)
MIN_ANY_HAND_RATE_KEY = "min_any_hand_rate"


def convert_pickle(path: Path) -> tuple[LandmarkSequence, int, int]:
    with path.open("rb") as f:
        data = pickle.load(f)  # trusted file from the official Zenodo release (checksum verified)
    kp = np.asarray(data["keypoints"], dtype=np.float32)
    conf = np.asarray(data["confidences"], dtype=np.float32)
    x_scale, y_scale = data["vid_shape"]  # see module docstring: (x multiplier, y multiplier)
    width, height = y_scale, x_scale  # true landscape frame size

    kp = kp / np.array([x_scale, y_scale, 1.0], dtype=np.float32)  # -> image-normalised like MediaPipe Tasks

    hands = np.stack([kp[:, LEFT_HAND], kp[:, RIGHT_HAND]], axis=1)
    hand_present = np.stack([conf[:, LEFT_HAND].max(axis=1) > 0, conf[:, RIGHT_HAND].max(axis=1) > 0], axis=1)
    hands = np.where(hand_present[..., None, None], hands, 0.0)

    pose = np.concatenate([kp[:, POSE], conf[:, POSE, None]], axis=-1)
    pose_present = conf[:, POSE].max(axis=1) > 0

    T = kp.shape[0]
    seq = LandmarkSequence(
        hands=hands.astype(np.float32),
        hand_present=hand_present,
        hand_score=hand_present.astype(np.float32),
        pose=pose.astype(np.float32),
        pose_present=pose_present,
        timestamps_ms=np.arange(T, dtype=np.int64),
        meta={
            "source_path": str(path),
            "kind": "video",
            "fps": 0.0,  # not provided by the release
            "timestamps_are_frame_indices": True,
            "width": int(width),
            "height": int(height),
            "schema_version": schema.SCHEMA_VERSION,
            "extractor_version": "openhands-holistic",
        },
    )
    return seq, int(width), int(height)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--variant", choices=["include", "include50"], default="include")
    parser.add_argument("--config", default="data.yaml")
    args = parser.parse_args()

    cfg = load_config(args.config)
    root = project_path(args.root)
    source = args.variant
    out_root = project_path(cfg["paths"]["processed_root"]) / source
    min_hand_rate = cfg["quality"][MIN_ANY_HAND_RATE_KEY]

    rows: list[ManifestRow] = []
    missing = 0
    for split_name, official in (("train", ""), ("test", "test")):
        csv_path = root / "Train_Test_Split" / f"{split_name}_{args.variant}.csv"
        with csv_path.open(newline="", encoding="utf-8") as f:
            entries = list(csv.DictReader(f))
        for entry in tqdm(entries, desc=f"{source} {split_name}"):
            rel_video = Path(entry["FilePath"])
            pkl = root / "Pose_Signs" / rel_video.parent / f"{rel_video.stem}.pkl"
            # Folder names are canonical; the CSV "Word" column is inconsistent (e.g. "goodmorning").
            # Path is <Category>/<N. word>/[Extra/]<clip>, so the word folder is always parts[1].
            label = normalize_label(rel_video.parts[1])
            sample_id = stable_id("include", rel_video.as_posix())
            row = ManifestRow(
                sample_id=sample_id,
                label=label,
                source=source,
                kind="video",
                signer_id="",
                group_id=f"include:clip:{sample_id}",
                raw_path=str(pkl),
                split=official,
            )
            if not pkl.exists():
                missing += 1
                row.quality_flag = "failed:missing_pose_file"
                rows.append(row)
                continue

            seq, _, _ = convert_pickle(pkl)
            seq.meta.update({"label": label, "source": source, "sample_id": sample_id, "category": entry["Category"]})
            out = out_root / label / f"{sample_id}.npz"
            seq.save(out)
            rates = seq.detection_rates()
            row.landmarks_path = str(out)
            row.num_frames = seq.num_frames
            row.any_hand_rate = round(rates["any_hand"], 4)
            row.pose_rate = round(rates["pose"], 4)
            row.quality_flag = "low_hand_detection" if rates["any_hand"] < min_hand_rate else ""
            rows.append(row)

    manifest_path = project_path(cfg["paths"]["metadata_root"]) / f"manifest_{source}.csv"
    write_manifest(rows, manifest_path)
    labels = {r.label for r in rows}
    print(f"Converted {len(rows) - missing}/{len(rows)} clips, {len(labels)} classes -> {out_root}")
    print(f"Missing pose files: {missing} | Low hand detection: {sum(r.quality_flag == 'low_hand_detection' for r in rows)}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
