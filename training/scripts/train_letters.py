"""Train the fingerspelling-letter classifier (A-Z) from the alphabet-photo landmarks.

Leakage control: the photos have no signer IDs, about half look like frames of one video, and some
are rotated copies of others. Photos are therefore grouped by colour (an 8x8 colour thumbnail, k-means
over all letters: clothing, background and lighting, never faces), and whole colour groups go to
train, validation or test. The largest groups always go to training, so the test set measures other
people / settings. This is a proxy for signer independence, not a guarantee.

    python training/scripts/train_letters.py [--out app/backend/models/isl_letters_v1]
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import torch
from sklearn.cluster import KMeans
from torch import nn

from mudra_ml.letters import FEATURE_DIM, FEATURE_VERSION, LETTERS, letter_features, mirror

ROOT = Path(__file__).resolve().parents[2]
SEED = 42
N_CLUSTERS = 40
LARGEST_TO_TRAIN = 3
TARGET_VAL, TARGET_TEST = 0.15, 0.15


def load(landmark_dir: Path, photo_dir: Path):
    items = []  # (letter index, [hands], photo path)
    for li, letter in enumerate(LETTERS):
        z = np.load(landmark_dir / f"{letter}.npz")
        for name, hands, present in zip(z["files"], z["hands"], z["present"]):
            hs = [hands[h] for h in range(2) if present[h]]
            items.append((li, hs, photo_dir / letter.lower() / str(name)))
    return items


def colour_groups(paths: list[Path]) -> np.ndarray:
    thumbs = []
    for p in paths:
        img = cv2.imread(str(p))
        lab = cv2.cvtColor(cv2.resize(img, (8, 8), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2LAB)
        thumbs.append(lab.reshape(-1).astype(np.float32) / 255.0)
    return KMeans(n_clusters=N_CLUSTERS, n_init=4, random_state=SEED).fit_predict(np.stack(thumbs))


def split_groups(groups: np.ndarray, usable: np.ndarray) -> np.ndarray:
    rng = np.random.default_rng(SEED)
    sizes = {g: int(((groups == g) & usable).sum()) for g in np.unique(groups)}
    order = sorted(sizes, key=lambda g: -sizes[g])
    split = {g: "train" for g in order[:LARGEST_TO_TRAIN]}
    rest = list(order[LARGEST_TO_TRAIN:])
    rng.shuffle(rest)
    total = sum(sizes.values())
    filled = {"val": 0, "test": 0}
    for g in rest:
        need = {"test": TARGET_TEST * total - filled["test"], "val": TARGET_VAL * total - filled["val"]}
        target = max(need, key=need.get)
        if need[target] > 0:
            split[g] = target
            filled[target] += sizes[g]
        else:
            split[g] = "train"
    return np.array([split[g] for g in groups])


def rotate(hands: list[np.ndarray], deg: float) -> list[np.ndarray]:
    a = np.deg2rad(deg)
    rot = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]], np.float32)
    out = []
    for h in hands:
        r = np.array(h, np.float32, copy=True)
        r[:, :2] = (r[:, :2] - 0.5) @ rot.T + 0.5
        out.append(r)
    return out


def augmented(hands: list[np.ndarray], rng) -> np.ndarray:
    hs = mirror(hands) if rng.random() < 0.5 else hands
    hs = rotate(hs, rng.uniform(-15, 15))
    hs = [h + rng.normal(0, 0.004, h.shape).astype(np.float32) for h in hs]
    return letter_features(hs)


class MLP(nn.Module):
    def __init__(self, hidden=256, n_out=26, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(FEATURE_DIM, hidden), nn.ReLU(), nn.Dropout(dropout),
                                 nn.Linear(hidden, hidden), nn.ReLU(), nn.Dropout(dropout), nn.Linear(hidden, n_out))

    def forward(self, x):
        return self.net(x)


def evaluate(logits: np.ndarray, y: np.ndarray, threshold: float) -> dict:
    p = torch.softmax(torch.from_numpy(logits), 1).numpy()
    pred, conf = p.argmax(1), p.max(1)
    top3 = (np.argsort(-p, 1)[:, :3] == y[:, None]).any(1)
    acc = conf >= threshold
    return {"n": len(y), "top1": round(float((pred == y).mean()), 4), "top3": round(float(top3.mean()), 4),
            "accepted_share": round(float(acc.mean()), 4),
            "accepted_precision": round(float((pred[acc] == y[acc]).mean()), 4) if acc.any() else None}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--landmarks", type=Path, default=ROOT / "data/processed/landmarks/letters")
    ap.add_argument("--photos", type=Path, default=Path(r"C:\ISL\dataset_ISL"))
    ap.add_argument("--out", type=Path, default=ROOT / "app/backend/models/isl_letters_v1")
    ap.add_argument("--epochs", type=int, default=200)  # 200 > 80 on validation (62.2% vs 59.3% top-1)
    args = ap.parse_args()
    torch.manual_seed(SEED)
    rng = np.random.default_rng(SEED)
    t0 = time.time()

    items = load(args.landmarks, args.photos)
    y_all = np.array([i[0] for i in items])
    usable = np.array([len(i[1]) > 0 for i in items])
    groups = colour_groups([i[2] for i in items])
    split = split_groups(groups, usable)
    idx = {s: np.where((split == s) & usable)[0] for s in ("train", "val", "test")}
    print({s: len(v) for s, v in idx.items()}, "usable of", len(items), f"({time.time() - t0:.0f}s)", flush=True)

    X = {s: np.stack([letter_features(items[i][1]) for i in v]) for s, v in idx.items()}
    Y = {s: y_all[v] for s, v in idx.items()}
    mean, std = X["train"].mean(0), X["train"].std(0) + 1e-4
    norm = lambda a: torch.from_numpy(((a - mean) / std).astype(np.float32))

    model = MLP()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
    best, best_state = -1.0, None
    train_hands = [items[i][1] for i in idx["train"]]
    for epoch in range(args.epochs):
        model.train()
        Xa = norm(np.stack([augmented(h, rng) for h in train_hands]))
        ya = torch.from_numpy(Y["train"])
        perm = torch.randperm(len(ya))
        for b in range(0, len(perm), 128):
            j = perm[b:b + 128]
            opt.zero_grad()
            loss = loss_fn(model(Xa[j]), ya[j])
            loss.backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            val_acc = float((model(norm(X["val"])).argmax(1).numpy() == Y["val"]).mean())
        if val_acc > best:
            best, best_state = val_acc, {k: v.clone() for k, v in model.state_dict().items()}
        if epoch % 10 == 0:
            print(f"epoch {epoch} loss {loss.item():.3f} val top1 {val_acc:.3f}", flush=True)
    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        logits = {s: model(norm(X[s])).numpy() for s in X}

    # temperature and acceptance threshold: chosen on validation only
    temps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]
    nll = [float(nn.functional.cross_entropy(torch.from_numpy(logits["val"] / t), torch.from_numpy(Y["val"]))) for t in temps]
    temperature = temps[int(np.argmin(nll))]
    lv = logits["val"] / temperature
    pv = torch.softmax(torch.from_numpy(lv), 1).numpy()
    threshold = 0.9
    for th in np.arange(0.3, 0.95, 0.05):
        acc = pv.max(1) >= th
        if acc.any() and (pv.argmax(1)[acc] == Y["val"][acc]).mean() >= 0.9:
            threshold = round(float(th), 2)
            break
    metrics = {s: evaluate(logits[s] / temperature, Y[s], threshold) for s in ("val", "test")}
    two = np.array([len(items[i][1]) == 2 for i in idx["test"]])
    metrics["test_two_hands_detected"] = evaluate(logits["test"][two] / temperature, Y["test"][two], threshold)
    metrics["test_one_hand_detected"] = evaluate(logits["test"][~two] / temperature, Y["test"][~two], threshold)
    pred = logits["test"].argmax(1)
    per_letter = {L: {"n": int((Y["test"] == i).sum()),
                      "top1": round(float((pred[Y["test"] == i] == i).mean()), 3) if (Y["test"] == i).any() else None}
                  for i, L in enumerate(LETTERS)}
    print(json.dumps(metrics, indent=1))

    args.out.mkdir(parents=True, exist_ok=True)
    sd = best_state
    linear = [k[:-len(".weight")] for k in sd if k.endswith(".weight")]
    weights = {}
    for i, k in enumerate(linear):
        weights[f"W{i}"] = sd[f"{k}.weight"].numpy()
        weights[f"b{i}"] = sd[f"{k}.bias"].numpy()
    np.savez(args.out / "weights.npz", mean=mean.astype(np.float32), std=std.astype(np.float32), **weights)
    counts = {s: len(v) for s, v in idx.items()}
    card = {
        "name": args.out.name, "created": datetime.now().astimezone().isoformat(timespec="seconds"),
        "task": "ISL fingerspelling letters A-Z from one frame of hand landmarks",
        "feature_version": FEATURE_VERSION, "classes": LETTERS, "temperature": temperature, "threshold": threshold,
        "threshold_selection": "lowest threshold with >= 90% precision on accepted validation frames",
        "data": {"source": str(args.photos), "photos": len(items), "with_hands": int(usable.sum()), "split_samples": counts,
                 "grouping": f"k-means colour groups (k={N_CLUSTERS}); the {LARGEST_TO_TRAIN} largest always train"},
        "metrics": metrics, "per_letter_test": per_letter,
        "limitations": [
            "Trained on 100x100 photos; hands were found in only part of them, both hands in fewer.",
            "No signer IDs: colour groups only approximate new people; the test set may share people with training.",
            "Static photos: letters that move (J, Z in some conventions) are learned from a still pose.",
            "Not yet measured on live webcam frames.",
        ],
    }
    (args.out / "model_card.json").write_text(json.dumps(card, indent=1), encoding="utf-8")
    print("saved", args.out, f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
