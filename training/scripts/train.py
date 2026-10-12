"""Train and evaluate one experiment.

    python training/scripts/train.py --config mudra_words.yaml --name mudra_words
    python training/scripts/train.py --config base.yaml --name include_bilstm \
        --set data.split_dir=data/metadata/splits/include model.temporal=bilstm
"""

from __future__ import annotations

import argparse

from mudra_ml.training.experiment_config import deep_merge, parse_overrides, resolve
from mudra_ml.training.trainer import run_experiment


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default="base.yaml")
    parser.add_argument("--name", required=True)
    parser.add_argument("--set", nargs="*", default=[], metavar="KEY=VALUE", help="dotted overrides")
    args = parser.parse_args()

    cfg = deep_merge(resolve(args.config), parse_overrides(args.set))
    cfg["name"] = args.name
    run_experiment(cfg)


if __name__ == "__main__":
    main()
