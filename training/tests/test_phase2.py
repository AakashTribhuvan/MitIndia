"""Dataset, model and training-loop tests on small synthetic data (no downloads needed)."""

import json

import numpy as np
import pytest
import torch

from mudra_ml import schema
from mudra_ml.data.manifest import ManifestRow, write_manifest
from mudra_ml.datasets.augment import AugmentConfig
from mudra_ml.datasets.isl_dataset import FeatureConfig, ISLLandmarkDataset, add_velocity
from mudra_ml.evaluation.metrics import compute_metrics, expected_calibration_error, fit_temperature
from mudra_ml.models.sequence_model import ModelConfig, build_model
from mudra_ml.preprocessing.sequence import LandmarkSequence
from mudra_ml.training.experiment_config import deep_merge, parse_overrides
from mudra_ml.training.trainer import run_experiment


def synthetic_sequence(label_idx: int, n_frames: int, rng: np.random.Generator) -> LandmarkSequence:
    """Class-dependent hand height and wiggle so a model can learn it."""
    hands = np.zeros((n_frames, 2, 21, 3), np.float32)
    base = np.random.default_rng(123).normal(0, 0.03, size=(21, 3)).astype(np.float32)  # shared hand shape
    base += rng.normal(0, 0.003, size=(21, 3)).astype(np.float32)  # small per-clip variation
    base[[8, 12, 16, 20], 1] -= 0.04 * label_idx  # class-dependent finger extension, like real handshapes
    base[schema.MIDDLE_MCP] = [0, -0.06, 0]
    t = np.linspace(0, 1, n_frames)
    for f in range(n_frames):
        hands[f, schema.RIGHT] = base + [0.4, 0.3 + 0.15 * label_idx + 0.03 * np.sin(6 * t[f] * (label_idx + 1)), 0]
    pose = np.zeros((n_frames, 33, 4), np.float32)
    pose[:, schema.POSE_LEFT_SHOULDER] = [0.6, 0.6, 0, 1]
    pose[:, schema.POSE_RIGHT_SHOULDER] = [0.4, 0.6, 0, 1]
    return LandmarkSequence(
        hands=hands,
        hand_present=np.tile([False, True], (n_frames, 1)),
        hand_score=np.zeros((n_frames, 2), np.float32),
        pose=pose,
        pose_present=np.ones(n_frames, bool),
        timestamps_ms=np.arange(n_frames, dtype=np.int64) * 33,
        meta={"width": 640, "height": 480},
    )


@pytest.fixture
def split_dir(tmp_path):
    rng = np.random.default_rng(0)
    classes = ["A", "B", "C"]
    split_root = tmp_path / "splits"
    for split, per_class in (("train", 24), ("val", 6), ("test", 6)):
        rows = []
        for ci, label in enumerate(classes):
            for k in range(per_class):
                sid = f"{split}_{label}_{k}"
                path = tmp_path / "lm" / f"{sid}.npz"
                synthetic_sequence(ci, int(rng.integers(20, 50)), rng).save(path)
                rows.append(
                    ManifestRow(sid, label, "syn", "video", "", f"syn:{sid}", str(path), str(path), split=split)
                )
        write_manifest(rows, split_root / f"{split}.csv")
    (split_root / "classes.json").write_text(json.dumps(classes))
    return split_root


def test_velocity_is_zero_when_hand_appears():
    feats = np.zeros((3, schema.FRAME_FEATURE_DIM), np.float32)
    feats[1:, :5] = 1.0  # left hand values present from frame 1
    feats[1:, -3] = 1.0  # left mask
    out = add_velocity(feats)
    vel = out[:, schema.FRAME_FEATURE_DIM :]
    assert out.shape[1] == FeatureConfig().feature_dim
    assert np.all(vel[1] == 0)  # appearance is not a movement
    assert np.all(vel[2] == 0)  # no change between frames 1 and 2


def test_dataset_shapes_and_augmentation(split_dir):
    classes = json.loads((split_dir / "classes.json").read_text())
    cfg = FeatureConfig(seq_len=16)
    ds = ISLLandmarkDataset(split_dir / "train.csv", classes, cfg, AugmentConfig(), seed=1)
    mean, std = ds.compute_stats()
    ds.set_stats(mean, std)
    x, y = ds[0]
    assert x.shape == (16, cfg.feature_dim)
    assert x.dtype == torch.float32 and torch.isfinite(x).all()
    assert 0 <= y < 3
    x2, _ = ds[0]
    assert not torch.equal(x, x2)  # augmentation is random
    eval_ds = ISLLandmarkDataset(split_dir / "val.csv", classes, cfg)
    eval_ds.set_stats(mean, std)
    assert torch.equal(eval_ds[0][0], eval_ds[0][0])  # evaluation is deterministic


@pytest.mark.parametrize("temporal", ["none", "bilstm", "transformer"])
def test_model_output_shapes(temporal):
    model = build_model(ModelConfig(input_dim=40, num_classes=7, temporal=temporal, tf_dim=32, tf_ff=64, lstm_hidden=32))
    logits = model(torch.randn(5, 24, 40))
    assert logits.shape == (5, 7)


def test_old_model_cards_still_load():
    cfg = ModelConfig.from_dict({"input_dim": 40, "num_classes": 4, "appearance_dim": 0, "lstm_hidden": 16})
    assert build_model(cfg)(torch.randn(2, 8, 40)).shape == (2, 4)


def test_metrics_and_temperature():
    rng = np.random.default_rng(0)
    predicted = rng.integers(0, 5, 1000)
    logits = rng.normal(size=(1000, 5))
    logits[np.arange(1000), predicted] += 8.0  # ~100% confident
    labels = np.where(rng.random(1000) < 0.7, predicted, rng.integers(0, 5, 1000))  # but ~75% correct
    m = compute_metrics(logits, labels)
    t = fit_temperature(logits, labels)
    assert t > 1.5  # temperature should soften overconfident logits
    assert compute_metrics(logits, labels, t)["ece"] < m["ece"]
    perfect = np.eye(5)[labels]
    assert expected_calibration_error(perfect, labels) == pytest.approx(0.0)


def test_config_merge_and_overrides():
    merged = deep_merge({"a": {"b": 1, "c": 2}, "augment": {"x": 1}}, {"a": {"b": 3}, "augment": None})
    assert merged == {"a": {"b": 3, "c": 2}, "augment": None}
    assert parse_overrides(["train.epochs=5", "model.temporal=none"]) == {
        "train": {"epochs": 5},
        "model": {"temporal": "none"},
    }


def test_training_end_to_end_learns_synthetic_task(split_dir, tmp_path):
    cfg = {
        "name": "smoke",
        "seed": 0,
        "data": {"split_dir": str(split_dir)},
        "features": {"seq_len": 12},
        "augment": None,
        "model": {"temporal": "bilstm", "lstm_hidden": 32, "lstm_layers": 1, "mlp_hidden": 64, "mlp_out": 32},
        "train": {"epochs": 40, "batch_size": 12, "lr": 0.003, "patience": 40, "warmup_epochs": 1, "label_smoothing": 0.0},
    }
    summary = run_experiment(cfg, output_root=tmp_path / "runs")
    assert summary["test"]["accuracy"] >= 0.9
    ckpt = torch.load(f"{summary['run_dir']}/best.pt", weights_only=False)
    for key in ("model_state", "classes", "feature_config", "feature_mean", "feature_std", "temperature"):
        assert key in ckpt
    assert (tmp_path / "runs").exists()


def test_mirror_augmentation_changes_features_and_is_off_by_default(split_dir):
    classes = json.loads((split_dir / "classes.json").read_text())
    cfg = FeatureConfig(seq_len=8)
    assert AugmentConfig().mirror_prob == 0.0
    always = AugmentConfig(rotation_deg=0, scale=0, shear=0, shift=0, jitter=0, hand_dropout=0, temporal_crop_min=1.0, mirror_prob=1.0)
    never = AugmentConfig(rotation_deg=0, scale=0, shear=0, shift=0, jitter=0, hand_dropout=0, temporal_crop_min=1.0)
    a = ISLLandmarkDataset(split_dir / "train.csv", classes, cfg, always, seed=0)
    b = ISLLandmarkDataset(split_dir / "train.csv", classes, cfg, never, seed=0)
    xa, xb = a[0][0], b[0][0]
    # synthetic signer uses the right hand; mirrored copy must show it in the left-hand slot (mask column -3)
    left_mask = schema.FRAME_FEATURE_DIM - 3
    assert xb[:, left_mask].max() == 0 and xa[:, left_mask].min() > 0


def test_ablation_shared_settings_are_applied():
    from mudra_ml.training.experiment_config import ablation_base, load_yaml

    base = ablation_base(load_yaml("mudra_words.yaml"))
    assert base["data"]["split_dir"].endswith("combined_words_v3")
    assert "lr" in base["train"]  # still inherits base.yaml
    assert base["features"]["use_velocity"] is False
    assert base["augment"]["closeup_prob"] == 0.4 and base["background"]["prob"] == 0.25


def test_init_from_copies_encoder_but_not_head(tmp_path):
    from mudra_ml.training.trainer import init_from_checkpoint

    src = build_model(ModelConfig(input_dim=40, num_classes=7, lstm_hidden=16))
    torch.save({"model_state": src.state_dict()}, tmp_path / "best.pt")
    dst = build_model(ModelConfig(input_dim=40, num_classes=3, lstm_hidden=16))
    n = init_from_checkpoint(dst, tmp_path)
    assert n > 0
    for k, v in src.state_dict().items():
        if k.startswith("head.2"):
            assert dst.state_dict()[k].shape != v.shape  # different class count: head not copied
        elif not k.startswith("head."):
            assert torch.equal(dst.state_dict()[k], v)


def test_background_samples_use_background_label(split_dir):
    from mudra_ml.datasets.isl_dataset import BACKGROUND_LABEL, BackgroundConfig

    classes = [*json.loads((split_dir / "classes.json").read_text()), BACKGROUND_LABEL]
    cfg = FeatureConfig(seq_len=8)
    ds = ISLLandmarkDataset(split_dir / "train.csv", classes, cfg, AugmentConfig(), seed=0,
                            background=BackgroundConfig(prob=1.0))
    labels = {ds[i][1] for i in range(10)}
    assert labels == {classes.index(BACKGROUND_LABEL)}
    assert ds[0][0].shape == (8, cfg.feature_dim)
    with pytest.raises(ValueError):
        ISLLandmarkDataset(split_dir / "train.csv", classes[:-1], cfg, background=BackgroundConfig(prob=0.5))


def test_segment_crop_uses_active_span(split_dir):
    classes = json.loads((split_dir / "classes.json").read_text())
    cfg = FeatureConfig(seq_len=8)
    ds = ISLLandmarkDataset(split_dir / "train.csv", classes, cfg, AugmentConfig(segment_crop_prob=1.0), seed=0)
    bounds = ds.segment_bounds()
    assert len(bounds) == len(ds)
    for i, b in enumerate(bounds):
        n = ds.sequences[i].num_frames
        if b is not None:
            assert 0 <= b[0] <= b[1] < n and b[2] > 0
            win = ds._segment_window(i)
            assert win is not None and 0 <= win[0] and win[0] + win[1] <= n and win[1] >= 4
    assert ds[0][0].shape == (8, cfg.feature_dim)


def test_closeup_view_keeps_geometry_and_hides_low_hands():
    from mudra_ml.datasets.camera import WEBCAM, CloseupParams, closeup_view
    from mudra_ml.preprocessing.sequence import LandmarkSequence

    n = 4
    pose = np.zeros((n, 33, 4), np.float32); pose[..., 3] = 1
    pose[:, 0, :2] = [0.5, 0.3]  # nose
    pose[:, 11, :2], pose[:, 12, :2] = [0.6, 0.45], [0.4, 0.45]  # shoulders, 0.2 wide
    hands = np.zeros((n, 2, 21, 3), np.float32)
    hands[:, 0, :, :2] = [0.5, 0.40]  # left hand at the chin: stays in view
    hands[:, 1, :, :2] = [0.5, 0.90]  # right hand at the hips: below a close-up frame
    present = np.ones((n, 2), bool)
    seq = LandmarkSequence(hands, present, present.astype(np.float32), pose, np.ones(n, bool), np.arange(n),
                           {"width": 1000, "height": 1000})
    view = closeup_view(seq, CloseupParams(above_nose=0.5, below_shoulders=0.5, shift=0.0))
    assert (view.meta["width"], view.meta["height"]) == WEBCAM
    assert view.hand_present[:, 0].all() and not view.hand_present[:, 1].any()
    sx = view.pose[0, 11, 0] - view.pose[0, 12, 0]
    sy = view.pose[0, 11, 1] - view.pose[0, 0, 1]
    assert abs(sx * WEBCAM[0] / (sy * WEBCAM[1]) - 0.2 / 0.15) < 1e-3  # proportions unchanged


def test_closeup_augmentation_runs(split_dir):
    classes = json.loads((split_dir / "classes.json").read_text())
    cfg = FeatureConfig(seq_len=8)
    ds = ISLLandmarkDataset(split_dir / "train.csv", classes, cfg, AugmentConfig(closeup_prob=1.0, segment_crop_prob=1.0), seed=0)
    assert all(ds[i][0].shape == (8, cfg.feature_dim) for i in range(len(ds)))


def test_fill_hand_gaps_bridges_short_gaps_only():
    from mudra_ml.preprocessing.sequence import LandmarkSequence, fill_hand_gaps

    n = 20
    hands = np.zeros((n, 2, 21, 3), np.float32)
    present = np.zeros((n, 2), bool)
    for t in (0, 4, 15):  # gap of 3 frames (0.12 s at 25 fps), then a gap of 10 frames (0.4 s)
        present[t, 0] = True
        hands[t, 0] = t
    seq = LandmarkSequence(hands, present, present.astype(np.float32), np.zeros((n, 33, 4), np.float32),
                           np.ones(n, bool), np.arange(n) * 40, {"fps": 25.0})
    out = fill_hand_gaps(seq, 0.2)
    assert out.hand_present[:5, 0].all() and abs(float(out.hands[2, 0, 0, 0]) - 2.0) < 1e-5
    assert not out.hand_present[5:15, 0].any()  # longer than 0.2 s: left alone
    assert not out.hand_present[:, 1].any()
