"""Few-shot benchmark: can words the model never saw be added from k recorded examples?

Uses a model trained with some words held out entirely (split set with ``novel.csv`` and
``heldout_words.json``). For each held-out word, k examples from the novel training split form
its prototype; novel validation/test clips must then be recognised as that word, while known
words' clips must not be "stolen" by a custom word.

Limits (similarity, model-confidence ceiling, margin) are tuned on validation with k=3 and
saved; test numbers are reported for k = 1, 3, 5, averaged over several random draws.

    python training/scripts/eval_fewshot.py --model app/backend/models/fewshot_holdout25 \
        --split-dir data/metadata/splits/combined_words_v2_fewshot
"""

from __future__ import annotations

import argparse
import itertools
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from mudra_ml.config import project_path
from mudra_ml.data.manifest import read_manifest
from mudra_ml.fewshot import CustomWordBank, FewShotConfig
from mudra_ml.preprocessing.sequence import load_sequence
from mudra_ml.streaming import ModelBundle, SegmenterConfig


def encode_rows(bundle: ModelBundle, rows) -> tuple[np.ndarray, np.ndarray]:
    probs, embs = [], []
    for i in range(0, len(rows), 64):
        seqs = [load_sequence(project_path(r.landmarks_path)) for r in rows[i : i + 64]]
        p, e = [], []
        for s in seqs:  # clips differ in resolution, so one call per clip
            pp, ee = bundle.probs_and_embeddings([s], int(s.meta.get("width", 0)), int(s.meta.get("height", 0)))
            p.append(pp[0]); e.append(ee[0])
        probs += p; embs += e
    return np.stack(probs), np.stack(embs)


def evaluate(bundle, cfg, threshold, protos, novel, known):
    """Rates for one prototype draw. novel/known: (labels, probs, embs)."""
    bank = CustomWordBank(cfg)
    bank.set_examples(protos)
    c = defaultdict(int)
    for labels, probs, embs, kind in ((*novel, "novel"), (*known, "known")):
        for lab, p, e in zip(labels, probs, embs):
            model = bundle.decide(p, threshold=threshold)
            out = bank.decide(e, model) or model
            c[f"{kind}_n"] += 1
            if out.get("custom"):
                c[f"{kind}_custom_{'correct' if out['sign'] == lab else 'wrong'}"] += 1
            elif out["status"] == "ok":
                c[f"{kind}_model_{'correct' if out['sign'] == lab else 'wrong'}"] += 1
    nn, kn = max(c["novel_n"], 1), max(c["known_n"], 1)
    return {
        "novel_correct": c["novel_custom_correct"] / nn,
        "novel_wrong": (c["novel_custom_wrong"] + c["novel_model_wrong"]) / nn,  # wrong custom word or a known word
        "novel_wrong_custom": c["novel_custom_wrong"] / nn,
        "novel_wrong_known": c["novel_model_wrong"] / nn,
        "novel_missed": 1 - (c["novel_custom_correct"] + c["novel_custom_wrong"] + c["novel_model_wrong"]) / nn,
        "known_stolen": (c["known_custom_correct"] + c["known_custom_wrong"]) / kn,
        "known_correct": c["known_model_correct"] / kn,
    }


def draw_protos(train_labels, train_embs, k, rng):
    out = {}
    for lab in sorted(set(train_labels)):
        idx = np.flatnonzero(train_labels == lab)
        out[lab] = train_embs[rng.choice(idx, size=min(k, len(idx)), replace=False)]
    return out


def averaged(bundle, cfg, threshold, train, k, draws, novel, known, seed=0):
    rng = np.random.default_rng(seed)
    runs = [evaluate(bundle, cfg, threshold, draw_protos(*train, k, rng), novel, known) for _ in range(draws)]
    return {key: float(np.mean([r[key] for r in runs])) for key in runs[0]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--split-dir", required=True)
    ap.add_argument("--shots", nargs="+", type=int, default=[1, 3, 5])
    ap.add_argument("--draws", type=int, default=5)
    ap.add_argument("--config-out", default="training/configs/fewshot.json")
    ap.add_argument("--out", default="experiments/reports/fewshot.json")
    args = ap.parse_args()

    bundle = ModelBundle(project_path(args.model))
    seg = SegmenterConfig.load(project_path("training/configs/streaming.json"))
    threshold = seg.commit_threshold if seg.commit_threshold is not None else bundle.threshold
    split = project_path(args.split_dir)
    novel_rows = read_manifest(split / "novel.csv")

    def pack(rows):
        p, e = encode_rows(bundle, rows)
        return np.array([r.label for r in rows]), p, e

    train_labels, _, train_embs = pack([r for r in novel_rows if r.split == "train"])
    train = (train_labels, train_embs)
    data = {s: (pack([r for r in novel_rows if r.split == s]), pack(read_manifest(split / f"{s}.csv"))) for s in ("val", "test")}
    print(f"novel words {len(set(train[0]))}; novel train {len(train[0])}, val {len(data['val'][0][0])}, "
          f"test {len(data['test'][0][0])}; known val {len(data['val'][1][0])}, test {len(data['test'][1][0])}")

    grid = itertools.product([0.6, 0.7, 0.75, 0.8, 0.85, 0.9], [0.5, 0.8, 0.95, 1.01], [0.0, 0.05, 0.1])
    best, best_obj = None, -1e9
    for sim, conf, margin in grid:
        cfg = FewShotConfig(sim, conf, margin)
        m = averaged(bundle, cfg, threshold, train, 3, args.draws, *data["val"])
        obj = m["novel_correct"] - 3 * m["novel_wrong"] - 10 * m["known_stolen"]
        if obj > best_obj:
            best, best_obj, best_m = cfg, obj, m
    print(f"chosen on validation (k=3): {best.to_dict()} -> {json.dumps({k: round(v, 3) for k, v in best_m.items()})}")
    Path(project_path(args.config_out)).write_text(json.dumps(best.to_dict(), indent=2))

    report = {"model": bundle.name, "config": best.to_dict(), "threshold": threshold, "validation_k3": best_m, "test": {}}
    base = averaged(bundle, FewShotConfig(min_similarity=2.0), threshold, train, 1, 1, *data["test"])
    print(f"test without custom words: known correct {base['known_correct']:.1%}")
    report["test_no_custom"] = base
    for k in args.shots:
        m = averaged(bundle, best, threshold, train, k, args.draws, *data["test"], seed=1)
        report["test"][str(k)] = m
        print(f"test k={k}: novel correct {m['novel_correct']:5.1%} wrong {m['novel_wrong']:5.1%} "
              f"(custom {m['novel_wrong_custom']:.1%}, known {m['novel_wrong_known']:.1%}) missed {m['novel_missed']:5.1%} "
              f"| known correct {m['known_correct']:5.1%} stolen {m['known_stolen']:5.2%}")
    Path(project_path(args.out)).write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
