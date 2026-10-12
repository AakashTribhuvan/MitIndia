"""Run every variant of an ablation config on the same split and write a comparison table.

Only measured results go into the table; failed runs are reported as failed, never filled in.

    python training/scripts/run_ablation.py --config ablation_landmarks.yaml --tag include
    python training/scripts/run_ablation.py --config ablation_landmarks.yaml --tag include \
        --set data.split_dir=data/metadata/splits/include
"""

from __future__ import annotations

import argparse
import csv
import json
import traceback
from datetime import datetime

from mudra_ml.config import project_path
from mudra_ml.training.experiment_config import ablation_base, deep_merge, load_yaml, parse_overrides
from mudra_ml.training.trainer import run_experiment

COLUMNS = ["variant", "temporal", "params", "test_accuracy", "test_top5", "test_macro_f1", "test_ece", "val_macro_f1", "best_epoch", "minutes", "run_dir"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default="ablation_landmarks.yaml")
    parser.add_argument("--tag", required=True, help="label for this ablation, e.g. include")
    parser.add_argument("--only", nargs="*", default=None, help="run only these variant names")
    parser.add_argument("--set", nargs="*", default=[], metavar="KEY=VALUE", help="overrides applied to every variant")
    args = parser.parse_args()

    spec = load_yaml(args.config)
    base = deep_merge(ablation_base(spec), parse_overrides(args.set))
    variants = [v for v in spec["variants"] if not args.only or v["name"] in args.only]

    rows = []
    for variant in variants:
        overrides = {k: v for k, v in variant.items() if k != "name"}
        cfg = deep_merge(base, overrides)
        cfg["name"] = f"{args.tag}_{variant['name']}"
        try:
            s = run_experiment(cfg)
            rows.append(
                {
                    "variant": variant["name"],
                    "temporal": s["temporal"],
                    "params": s["params"],
                    "test_accuracy": round(s["test"]["accuracy"], 4),
                    "test_top5": round(s["test"]["top5_accuracy"], 4),
                    "test_macro_f1": round(s["test"]["macro_f1"], 4),
                    "test_ece": round(s["test"]["ece"], 4),
                    "val_macro_f1": round(s["val"]["macro_f1"], 4),
                    "best_epoch": s["best_epoch"],
                    "minutes": round(s["train_seconds"] / 60, 1),
                    "run_dir": s["run_dir"],
                }
            )
        except Exception as exc:  # noqa: BLE001 - record the failure, keep running other variants
            traceback.print_exc()
            rows.append({"variant": variant["name"], "temporal": "FAILED", "run_dir": f"{type(exc).__name__}: {exc}"})

    out_dir = project_path("experiments/ablations")
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    csv_path = out_dir / f"{args.tag}_{stamp}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    split_dir = base["data"]["split_dir"]
    md = [
        f"# Ablation: {args.tag}",
        "",
        f"Split: `{split_dir}` · seed {base.get('seed')} · T={base['features']['seq_len']} · generated {stamp}",
        "",
        "| Variant | Temporal | Params | Test acc | Test top-5 | Test macro-F1 | Test ECE | Val macro-F1 | Best epoch | Minutes |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        if r["temporal"] == "FAILED":
            md.append(f"| {r['variant']} | FAILED | | | | | | | | |")
            continue
        md.append(
            f"| {r['variant']} | {r['temporal']} | {r['params']:,} | {r['test_accuracy']:.4f} | {r['test_top5']:.4f} | "
            f"{r['test_macro_f1']:.4f} | {r['test_ece']:.4f} | {r['val_macro_f1']:.4f} | {r['best_epoch']} | {r['minutes']} |"
        )
    md += ["", "Single seed; differences of about 1-2 points may be noise. ECE is after temperature scaling on validation."]
    md_path = out_dir / f"{args.tag}_{stamp}.md"
    md_path.write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    print(json.dumps({"csv": str(csv_path), "markdown": str(md_path)}))


if __name__ == "__main__":
    main()
