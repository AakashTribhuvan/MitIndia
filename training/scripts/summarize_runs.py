"""Build a comparison table from saved runs' summary.json files (measured values only).

    python training/scripts/summarize_runs.py --glob "include_*" --title "INCLUDE landmark ablation"
"""

from __future__ import annotations

import argparse
import json

from mudra_ml.config import project_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--glob", required=True, help="run directory pattern inside experiments/runs")
    parser.add_argument("--title", required=True)
    parser.add_argument("--out", default=None, help="markdown output path (default experiments/ablations/<glob>.md)")
    args = parser.parse_args()

    runs = sorted(project_path("experiments/runs").glob(args.glob))
    rows = []
    for run in runs:
        path = run / "summary.json"
        if not path.exists():
            rows.append((run.name, None))
            continue
        rows.append((run.name, json.loads(path.read_text(encoding="utf-8"))))

    lines = [
        f"# {args.title}",
        "",
        "| Run | Temporal | Params | Test acc | Test top-5 | Test macro-F1 | Test ECE | Val macro-F1 | Calibration | Best epoch | Minutes |",
        "|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|",
    ]
    for name, s in rows:
        if s is None or "test" not in s:
            lines.append(f"| {name} | not finished | | | | | | | | | |")
            continue
        t = s["test"]
        lines.append(
            f"| {s['experiment']} | {s['temporal']} | {s.get('params', 0):,} | {t['accuracy']:.4f} | {t['top5_accuracy']:.4f} | "
            f"{t['macro_f1']:.4f} | {t['ece']:.4f} | {s['val']['macro_f1']:.4f} | "
            f"{'ok' if s.get('calibration_reliable') else 'unreliable'} | {s.get('best_epoch')} | "
            f"{round(s.get('train_seconds', 0) / 60, 1)} |"
        )
    lines += [
        "",
        "Single seed per row: differences of 1-2 points may be noise.",
        "INCLUDE has no signer IDs, so these test sets are not signer-independent.",
        "Calibration 'unreliable' = fewer than 5 validation errors, so temperature (and ECE) cannot be trusted.",
    ]
    out = project_path(args.out) if args.out else project_path("experiments/ablations") / f"{args.glob.strip('*_')}_summary.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWritten to {out}")


if __name__ == "__main__":
    main()
