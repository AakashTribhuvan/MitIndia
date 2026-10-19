"""Word-matched video examples for models whose source datasets include clips."""

from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".webm", ".m4v"}


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


class ModelVideoExamples:
    """Index local common-word and phrase source clips without exposing filesystem paths."""

    def __init__(self, common_train_split: Path, phrase_video_dir: Path, signline_intro_train_split: Path | None = None):
        self.common_by_label: dict[str, list[dict]] = {}
        self.signline_intro_by_label: dict[str, list[dict]] = {}
        self.phrase_by_label: dict[str, list[dict]] = {}
        self._clips: dict[tuple[str, str], Path] = {}

        if signline_intro_train_split and signline_intro_train_split.is_file():
            try:
                with signline_intro_train_split.open(newline="", encoding="utf-8-sig") as stream:
                    for row in csv.DictReader(stream):
                        if row.get("split") != "train":
                            continue
                        media = Path(row.get("raw_path", ""))
                        if not media.is_absolute():
                            media = Path(__file__).resolve().parents[3] / media
                        self._add(
                            self.signline_intro_by_label,
                            str(row.get("label", "")),
                            media.resolve(),
                            str(row.get("source", "ISL500/ISL-DATA")),
                            "training reference",
                            "Training clip from this model's signer-held-out training split; not an evaluation clip.",
                        )
            except (OSError, csv.Error):
                pass

        if common_train_split.is_file():
            try:
                with common_train_split.open(newline="", encoding="utf-8-sig") as stream:
                    for row in csv.DictReader(stream):
                        if row.get("split") != "train":
                            continue
                        media = Path(row.get("raw_path", ""))
                        if not media.is_absolute():
                            media = Path(__file__).resolve().parents[3] / media
                        self._add(
                            self.common_by_label,
                            str(row.get("label", "")),
                            media.resolve(),
                            str(row.get("source", "common-word dataset")),
                            "reference",
                            "Training reference for the common-word video model; not an evaluation clip for this selected model.",
                        )
            except (OSError, csv.Error):
                pass

        if phrase_video_dir.is_dir():
            try:
                for folder in phrase_video_dir.iterdir():
                    if not folder.is_dir():
                        continue
                    for media in sorted(folder.iterdir()):
                        if media.is_file() and media.suffix.lower() in VIDEO_SUFFIXES:
                            self._add(
                                self.phrase_by_label,
                                folder.name,
                                media.resolve(),
                                "team phrase-video collection",
                                "source",
                                "Source phrase clip; the original phrase train/test manifest is not available here, so its split is unknown.",
                            )
            except OSError:
                pass

    def _add(self, target: dict[str, list[dict]], label: str, media: Path, source: str, role: str, note: str) -> None:
        if not label or not media.is_file() or media.suffix.lower() not in VIDEO_SUFFIXES:
            return
        clip_id = hashlib.sha256(f"{label}\0{media}".encode()).hexdigest()[:24]
        target.setdefault(_key(label), []).append({
            "id": clip_id,
            "label": label,
            "source": source,
            "role": role,
            "note": note,
            "_path": media,
        })

    @staticmethod
    def _matching_labels(labels: list[str], catalog: dict[str, list[dict]]) -> list[dict]:
        result = []
        for label in labels:
            clips = catalog.get(_key(label), [])
            if clips:
                result.append({"sign": label, "label": label.replace("_", " "), "clips": min(len(clips), 8)})
        return result

    def available(self, model_id: str, labels: list[str]) -> dict:
        catalog = self._catalog(model_id)
        if model_id == "letters":
            return {
                "model": model_id,
                "available_words": [],
                "message": "The alphabet model was trained on still photos, so no source videos are available.",
            }
        if model_id in {"intro_static", "top10_v2"}:
            message = "This pose model was trained on still images. Matching word videos are practice references, not examples used to train or score this model."
        elif model_id == "phrases":
            message = "Phrase source clips are shown for practice. The original split manifest is unavailable, so these clips are not identified as train or test examples."
        elif model_id == "signline_intro_video":
            message = "Matching ISL500 training clips used by the selected 26-word model; held-out evaluation clips are shown separately below."
        else:
            message = "Matching clips are practice references from the common-word video dataset, not evaluation clips for this model."
        return {"model": model_id, "available_words": self._matching_labels(labels, catalog), "message": message}

    def list_for(self, model_id: str, sign: str, labels: list[str]) -> dict:
        canonical = next((label for label in labels if _key(label) == _key(sign)), None)
        if canonical is None:
            raise HTTPException(status_code=404, detail="That sign is not part of the selected model.")
        catalog = self._catalog(model_id)
        clips = catalog.get(_key(canonical), [])[:8]
        output = []
        for clip in clips:
            clip_id = clip["id"]
            self._clips[(model_id, clip_id)] = clip["_path"]
            output.append({
                key: value for key, value in clip.items() if not key.startswith("_")
            } | {"video_url": f"/model-video-examples/{model_id}/{clip_id}/video"})
        info = self.available(model_id, [canonical])
        return {"model": model_id, "sign": canonical, "clips": output, "message": info["message"]}

    def _catalog(self, model_id: str) -> dict[str, list[dict]]:
        if model_id == "phrases":
            return self.phrase_by_label
        if model_id == "signline_intro_video":
            return self.signline_intro_by_label
        return self.common_by_label

    def video(self, model_id: str, clip_id: str) -> FileResponse:
        media = self._clips.get((model_id, clip_id))
        if media is None:
            raise HTTPException(status_code=404, detail="Example video not found.")
        return FileResponse(media)
