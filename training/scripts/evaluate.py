"""Re-evaluate saved runs from their checkpoints (val calibration + test report).

    python training/scripts/evaluate.py experiments/runs/mudra_words_*
"""

from __future__ import annotations

import argparse
from pathlib import Path

from mudra_ml.evaluation.evaluate import evaluate_run


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run_dirs", nargs="+", type=Path)
    args = parser.parse_args()
    for run_dir in args.run_dirs:
        if not (run_dir / "best.pt").exists():
            print(f"skip {run_dir}: no best.pt")
            continue
        s = evaluate_run(run_dir)
        t = s["test"]
        print(
            f"{s['experiment']:45s} acc {t['accuracy']:.4f} top5 {t['top5_accuracy']:.4f} macroF1 {t['macro_f1']:.4f} "
            f"ECE {t['ece']:.3f} T={s['temperature']:.2f} calibration={'ok' if s['calibration_reliable'] else 'UNRELIABLE'}"
        )


if __name__ == "__main__":
    main()
