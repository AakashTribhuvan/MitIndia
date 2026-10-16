"""Manifest for the sentence videos already extracted to data/processed/landmarks/islsentences/<LABEL>/*.npz.

The landmarks were made from C:\\ISL\\Videos_Sentence_Level (101 sentences, 687 videos) with the same
MediaPipe pipeline as the webcam. There are no signer IDs, so every video is its own group.

    python training/scripts/build_sentence_manifest.py   ->  data/metadata/manifest_islsentences.csv
"""

from __future__ import annotations

from mudra_ml.config import project_path
from mudra_ml.data.manifest import ManifestRow, write_manifest
from mudra_ml.preprocessing.sequence import load_sequence

LOW_HAND_RATE = 0.3  # same flag rule as the word manifests


def main() -> None:
    root = project_path("data/processed/landmarks/islsentences")
    rows = []
    for f in sorted(root.glob("*/*.npz")):
        seq = load_sequence(f)
        m = seq.meta
        hand_rate = float(seq.hand_present.any(axis=1).mean()) if seq.num_frames else 0.0
        fps = float(m.get("fps") or 0.0)
        rows.append(ManifestRow(
            sample_id=f.stem, label=f.parent.name, source="islsentences", kind="video", signer_id="",
            group_id=f"islsentences:clip:{f.stem}", raw_path=str(m.get("source_path", "")),
            landmarks_path=f.relative_to(project_path(".")).as_posix(), num_frames=seq.num_frames, fps=fps,
            duration_s=seq.num_frames / fps if fps else 0.0, any_hand_rate=hand_rate,
            pose_rate=float(seq.pose_present.mean()) if seq.num_frames else 0.0,
            quality_flag="low_hand_detection" if hand_rate < LOW_HAND_RATE else "",
        ))
    out = project_path("data/metadata/manifest_islsentences.csv")
    write_manifest(rows, out)
    print(f"{len(rows)} rows, {len({r.label for r in rows})} labels, "
          f"{sum(1 for r in rows if r.quality_flag)} flagged -> {out}")


if __name__ == "__main__":
    main()
