"""Add INCLUDE clips re-extracted from the original videos to an existing split set.

The OpenHands pose release and the original INCLUDE videos are the same recordings. Each
re-extracted clip takes the split, group and label of its pose-release twin
(matched on ``<category>/<word folder>/<file stem>``), so a test clip can never reach
training through its second copy.

    python training/scripts/align_include_video.py --manifest data/metadata/manifest_include_video.csv \
        --base <existing split set> --name <new split set>
"""

from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import replace
from pathlib import PurePosixPath

from mudra_ml.config import load_config, project_path
from mudra_ml.data.manifest import read_manifest, write_manifest
from mudra_ml.data.splits import check_no_leakage

SPLITS = ("train", "val", "test")


def clip_key(path: str) -> str:
    p = PurePosixPath(path.replace("\\", "/"))
    return f"{p.parts[-3]}/{p.parts[-2]}/{p.stem}".lower()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--base", required=True, help="existing split set, e.g. include")
    parser.add_argument("--name", required=True, help="new split set name")
    parser.add_argument("--config", default="data.yaml")
    parser.add_argument("--include-flagged", action="store_true")
    args = parser.parse_args()

    cfg = load_config(args.config)
    split_root = project_path(cfg["paths"]["metadata_root"]) / "splits"
    base_dir, out_dir = split_root / args.base, split_root / args.name

    base = {s: read_manifest(base_dir / f"{s}.csv") for s in SPLITS}
    twins = {clip_key(r.raw_path): r for s in SPLITS for r in base[s] if r.source == "include"}

    added = {s: [] for s in SPLITS}
    unmatched, flagged = [], 0
    for row in read_manifest(project_path(args.manifest)):
        if row.quality_flag and not args.include_flagged:
            flagged += 1
            continue
        twin = twins.get(clip_key(row.raw_path))
        if twin is None:
            unmatched.append(row.raw_path)
            continue
        added[twin.split].append(replace(row, label=twin.label, group_id=twin.group_id, split=twin.split))

    out_dir.mkdir(parents=True, exist_ok=True)
    for s in SPLITS:
        write_manifest(base[s] + added[s], out_dir / f"{s}.csv")
    shutil.copy(base_dir / "classes.json", out_dir / "classes.json")
    check_no_leakage([r for s in SPLITS for r in base[s] + added[s]])

    report = {
        "base": args.base,
        "added": {s: len(added[s]) for s in SPLITS},
        "skipped_flagged": flagged,
        "unmatched": len(unmatched),
        "unmatched_examples": unmatched[:10],
        "totals": {s: len(base[s]) + len(added[s]) for s in SPLITS},
    }
    (out_dir / "split_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
