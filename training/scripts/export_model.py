"""Package a trained run for the inference API.

Writes ``<out>/model.pt`` (state dict only, loadable with ``weights_only=True``) and
``<out>/model_card.json`` (everything else inference needs, plus provenance and limits).

The "uncertain" threshold is chosen on the VALIDATION split: the lowest calibrated
confidence (never below ``--min-threshold``) at which predictions kept on validation reach
``--target-accuracy``. Validation clips are complete signs; live sliding windows often are
not, which is why the floor exists.

    python training/scripts/export_model.py --run experiments/runs/mudra_words_<time> --data-source combined \
        --name isl_mudra_combined_v6_bilstm
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
import yaml
from torch.utils.data import DataLoader

from mudra_ml.config import project_path
from mudra_ml.datasets.isl_dataset import FeatureConfig, ISLLandmarkDataset
from mudra_ml.evaluation.evaluate import load_checkpoint_model, predict
from mudra_ml.evaluation.metrics import softmax

DATA_SOURCES = {
    "include": {
        "name": "INCLUDE (Sridhar et al., ACM Multimedia 2020)",
        "pose_release": "OpenHands v1 labelled ISLR poses, Zenodo record 6674324",
        "license": "CC-BY-4.0",
        "attribution": "Sridhar, Ganesan, Kumar, Khapra. INCLUDE: A Large Scale Dataset for Indian Sign Language "
        "Recognition. ACM MM 2020. Pose data via AI4Bharat OpenHands.",
    },
    "combined": {
        "name": "INCLUDE (263 words) + MUDRA isolated-word videos (61 words, C:\\ISL\archive)",
        "pose_release": "INCLUDE via OpenHands (Zenodo 6674324); MUDRA words extracted locally with MediaPipe Tasks",
        "license": "INCLUDE: CC-BY-4.0. MUDRA word videos: provided by the team; source and licence to be confirmed",
        "attribution": "Sridhar et al., INCLUDE, ACM MM 2020; MUDRA team recordings.",
    },
}


def choose_threshold(probs: np.ndarray, labels: np.ndarray, target: float, minimum: float = 0.5) -> dict:
    conf = probs.max(axis=1)
    correct = probs.argmax(axis=1) == labels
    grid = np.round(np.arange(0.05, 0.96, 0.05), 2)
    table = []
    chosen = None
    for t in grid:
        keep = conf >= t
        acc = float(correct[keep].mean()) if keep.any() else None
        table.append({"threshold": float(t), "coverage": float(keep.mean()), "accuracy_on_kept": acc})
        if chosen is None and t >= minimum and acc is not None and acc >= target:
            chosen = float(t)
    if chosen is None:
        chosen = float(grid[-1])
    return {"threshold": chosen, "target_accuracy": target, "minimum_threshold": minimum, "validation_curve": table}


def per_word_test_accuracy(run_dir: Path) -> dict:
    """{word: {"correct": c, "clips": n}} from the run's held-out test predictions (empty if missing)."""
    import csv

    path = run_dir / "reports" / "test_predictions.csv"
    if not path.exists():
        return {}
    out: dict = {}
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            entry = out.setdefault(row["true"], {"correct": 0, "clips": 0})
            entry["clips"] += 1
            entry["correct"] += int(row["true"] == row["predicted"])
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--out-root", default="app/backend/models", type=Path)
    parser.add_argument("--target-accuracy", type=float, default=0.985)
    parser.add_argument(
        "--min-threshold", type=float, default=0.5,
        help="floor: validation clips are complete signs, live windows often are not, so never accept below this",
    )
    parser.add_argument("--data-source", default="include", choices=sorted(DATA_SOURCES))
    args = parser.parse_args()

    run_dir = project_path(args.run)
    cfg = yaml.safe_load((run_dir / "config.yaml").read_text(encoding="utf-8"))
    summary = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
    device = torch.device("cpu")
    model, ckpt = load_checkpoint_model(run_dir / "best.pt", device)
    feature_cfg = FeatureConfig.from_dict(ckpt["feature_config"])
    temperature = float(ckpt["temperature"])

    val = ISLLandmarkDataset(project_path(cfg["data"]["split_dir"]) / "val.csv", ckpt["classes"], feature_cfg)
    val.set_stats(np.asarray(ckpt["feature_mean"]), np.asarray(ckpt["feature_std"]))
    logits, labels = predict(model, DataLoader(val, batch_size=128), device, amp=False)
    threshold = choose_threshold(softmax(logits, temperature), labels, args.target_accuracy, args.min_threshold)

    out = project_path(args.out_root) / args.name
    out.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), out / "model.pt")
    card = {
        "name": args.name,
        "created": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_run": run_dir.name,
        "task": "Isolated Indian Sign Language word recognition from MediaPipe hand + pose landmarks",
        "classes": ckpt["classes"],
        "model_config": ckpt["model_config"],
        "feature_config": ckpt["feature_config"],
        "feature_mean": np.asarray(ckpt["feature_mean"]).round(6).tolist(),
        "feature_std": np.asarray(ckpt["feature_std"]).round(6).tolist(),
        "temperature": temperature,
        "uncertain_threshold": threshold["threshold"],
        "threshold_selection": threshold,
        "metrics": {"validation": summary["val"], "test": summary["test"], "test_samples": summary["test_samples"]},
        "data": DATA_SOURCES[args.data_source],
        "limitations": [
            f"Vocabulary is {len(ckpt['classes'])} words; MUDRA app words such as NAMASTE, WATER and HELP are not included.",
            "INCLUDE has no signer IDs, so the test score is not signer-independent; expect lower accuracy on new people.",
            "Trained on isolated signs recorded from rest to rest; continuous signing is approximated with a sliding window.",
            "Confidence is calibrated on INCLUDE validation data and may be over-confident on very different cameras or lighting.",
        ],
    }
    per_word = per_word_test_accuracy(run_dir)
    if per_word:
        card["per_word_test"] = per_word
    (out / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    kept = next(r for r in threshold["validation_curve"] if r["threshold"] == threshold["threshold"])
    print(
        f"Exported {args.name} -> {out}\n"
        f"  classes {len(card['classes'])}, temperature {temperature:.3f}, uncertain below {threshold['threshold']:.2f} "
        f"(validation: keeps {kept['coverage']:.1%} of clips at {kept['accuracy_on_kept']:.1%} accuracy)"
    )


if __name__ == "__main__":
    main()
