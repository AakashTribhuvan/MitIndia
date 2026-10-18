"""Extract hand + pose landmarks for every video/image in a raw source folder.

Writes one ``.npz`` per clip (see mudra_ml.schema) plus a manifest CSV with quality
metrics. Re-running skips clips that were already extracted (resumable).

    python training/scripts/extract_landmarks.py --source own --input data/raw/own
"""

from __future__ import annotations

import argparse
import re
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import replace
from pathlib import Path

from tqdm import tqdm

from mudra_ml.config import load_config, project_path
from mudra_ml.data.manifest import ManifestRow, discover_media, write_manifest
from mudra_ml.preprocessing.landmark_extractor import LandmarkExtractor, load_sequence

_EXTRACTOR: LandmarkExtractor | None = None


def _init_worker(extraction_cfg: dict, asset_dir: str | None = None) -> None:
    global _EXTRACTOR
    _EXTRACTOR = LandmarkExtractor(
        **({"asset_dir": Path(asset_dir)} if asset_dir else {}),
        pose_model=extraction_cfg["pose_model"],
        min_hand_detection_confidence=extraction_cfg["min_hand_detection_confidence"],
        min_pose_detection_confidence=extraction_cfg["min_pose_detection_confidence"],
        max_fps=extraction_cfg["max_fps"],
        mirrored_input=extraction_cfg["mirrored_input"],
    )


def _quality_flag(rates: dict, min_hand_rate: float) -> str:
    if rates["any_hand"] < min_hand_rate:
        return "low_hand_detection"
    if rates["pose"] == 0:
        return "no_pose"
    return ""


def _process(row: ManifestRow, out_path: str, min_hand_rate: float, overwrite: bool) -> ManifestRow:
    out = Path(out_path)
    try:
        if out.exists() and not overwrite:
            seq = load_sequence(out)
        else:
            assert _EXTRACTOR is not None
            raw = Path(row.raw_path)
            seq = _EXTRACTOR.extract_video(raw) if row.kind == "video" else _EXTRACTOR.extract_image(raw)
            seq.meta.update({"label": row.label, "source": row.source, "sample_id": row.sample_id})
            seq.save(out)
    except Exception as exc:  # noqa: BLE001 - keep going; failures are recorded in the manifest
        return replace(row, quality_flag=f"failed:{type(exc).__name__}: {exc}"[:200])

    rates = seq.detection_rates()
    fps = float(seq.meta.get("fps") or 0.0)
    return replace(
        row,
        landmarks_path=str(out),
        num_frames=seq.num_frames,
        fps=round(fps, 3),
        duration_s=round(seq.num_frames / fps, 3) if fps > 0 else 0.0,
        any_hand_rate=round(rates["any_hand"], 4),
        pose_rate=round(rates["pose"], 4),
        quality_flag=_quality_flag(rates, min_hand_rate),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--config", default="data.yaml")
    parser.add_argument("--asset-dir", type=Path, default=None, help="directory containing the MediaPipe .task models")
    parser.add_argument("--workers", type=int, default=None)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="process only the first N files (smoke test)")
    parser.add_argument("--labels", nargs="*", default=None, help="only these labels (normalised, e.g. HELLO THANK_YOU)")
    parser.add_argument("--exclude", default=None, help="regex; skip files whose name matches (e.g. _tilt$)")
    parser.add_argument("--group-strip", default=None, help="regex removed from file stems to group copies of one recording")
    args = parser.parse_args()

    cfg = load_config(args.config)
    rows = discover_media(project_path(args.input), args.source, group_strip=args.group_strip)
    if args.labels:
        wanted = set(args.labels)
        rows = [r for r in rows if r.label in wanted]
    if args.exclude:
        pattern = re.compile(args.exclude)
        rows = [r for r in rows if not pattern.search(Path(r.raw_path).stem)]
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        raise SystemExit(f"No videos or images found under {args.input}")

    out_root = project_path(cfg["paths"]["processed_root"]) / args.source
    min_hand_rate = cfg["quality"]["min_any_hand_rate"]
    workers = args.workers or cfg["extraction"]["workers"]

    results: list[ManifestRow] = []
    asset_dir = str(project_path(args.asset_dir)) if args.asset_dir else None
    with ProcessPoolExecutor(
        max_workers=workers, initializer=_init_worker, initargs=(cfg["extraction"], asset_dir)
    ) as pool:
        futures = [
            pool.submit(_process, row, str(out_root / row.label / f"{row.sample_id}.npz"), min_hand_rate, args.overwrite)
            for row in rows
        ]
        for fut in tqdm(as_completed(futures), total=len(futures), desc=f"Extracting {args.source}"):
            results.append(fut.result())

    results.sort(key=lambda r: (r.label, r.raw_path))
    manifest_path = project_path(cfg["paths"]["metadata_root"]) / f"manifest_{args.source}.csv"
    write_manifest(results, manifest_path)

    failed = [r for r in results if r.quality_flag.startswith("failed")]
    flagged = [r for r in results if r.quality_flag and not r.quality_flag.startswith("failed")]
    print(f"Extracted {len(results) - len(failed)}/{len(results)} clips -> {out_root}")
    print(f"Flagged for review: {len(flagged)} | Failed: {len(failed)}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
