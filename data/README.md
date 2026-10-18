# Data layout

No dataset file is committed: not the videos, not the extracted landmarks, and not
`data/metadata/` (manifests: one row per clip with label, source, group, paths, quality metrics;
split CSVs; `label_fixes.json`). They live on the development machine. To train elsewhere, copy
`data/metadata/` and `data/processed/` from there, or rebuild them from the sources below.

```
data/
├── raw/<source>/                 videos or images, one folder per label (not committed)
│   └── signers.csv               optional: relative_path,signer_id (lets splits group by signer)
├── external/                     downloaded public datasets, e.g. the INCLUDE pose release (not committed)
├── processed/landmarks/<source>/ extracted .npz landmark sequences (generated, not committed)
└── metadata/
    ├── manifest_<source>.csv     one row per clip (generated, not committed)
    └── splits/<name>/            train/val/test CSVs, classes.json, split_report.json (generated, not committed)
```

## Local static-sign experiment

The still-image source was copied from the sibling `MudraPhoneWebcam` project into
`data/raw/static_signs/Frames_Word_Level/` (1,036 images in 131 label folders, about 65 MB).
Only the 32-label `intro` profile is used for the current experiment; the other source folders
remain available locally for later review. Sentence videos were not copied or used.

From the repository root, run `python training/scripts/static_sign_prototype.py prepare --profile intro`
and then `python training/scripts/static_sign_prototype.py train --profile intro`. Extraction
features and manifests are local under `data/processed/static_signs/` and
`data/metadata/static_signs/`; review sheets and evaluation reports are under
`experiments/reports/static_signs/`. The fresh model and card are under `app/backend/models/`,
and the training command refreshes `docs/STATIC_SIGN_GLOSSARY.md`.

Splits target roughly 80/20 by image count but keep inferred filename families intact to avoid
putting neighboring frames from one source clip into both sets. A label with only one inferred
source family stays in training and has no independent test result. These filename groupings are
not verified clip provenance or signer identities; the scores are exploratory, not signer-
independent validation.

## Sources

| Source | Manifest | Clips | Words | How to rebuild the landmarks |
|---|---|---|---|---|
| INCLUDE pose release (AI4Bharat OpenHands, Zenodo 6674324, CC-BY-4.0) | `manifest_include.csv` | 4,292 | 263 | download to `data/external/include_pose`, then `convert_include_pose.py --variant include` |
| INCLUDE original videos (Zenodo 4010759, CC-BY-4.0; 10 of 15 categories) | `manifest_include_video.csv` | 2,795 | 181 | unzip to `data/raw/include_video`, then `extract_landmarks.py --source include_video --input data/raw/include_video` |
| Team word recordings (MUDRA team; licence to be confirmed) | `manifest_islwords.csv` | 1,210 | 61 | `extract_landmarks.py --source islwords --input <Video_Dataset folder> --group-strip "_(left\|right)_tilt$"` |
| ISL500 14-word pilot (15 signers; academic/research terms) | `manifest_isl500_sentence_subset.csv` | 210 | 14 | `train_isl500_word_model.py prepare` then `train_isl500_word_model.py train`; raw videos are local under `data/external/isl500_sentence_subset/` |
| Signs recorded in the app | `manifest_app.csv` (not committed: holds recorders' names) | | | written by the backend's Record page |

Sample IDs are a hash of the source name and the file's path inside the source folder, so
re-extracting the same folder layout reproduces the IDs the split CSVs refer to.

## Split sets

| Split set | Used for |
|---|---|
| `include/` | INCLUDE 263 words, official train/test split (+15% validation carved from train) |
| `combined_words_v3/` | the deployed model: all three sources, INCLUDE official split locked, team words split by recording; 20 INCLUDE clips relabelled (`label_fixes.json`) |
| `combined_words_v2_fewshot/` | few-shot benchmark: 25 team words held out completely (`novel.csv`) |
| `combined_words_v2_session/` | session-independent test: 9 whole INCLUDE recording sessions held out |

The two `v2_` evaluation sets were built before the label fixes (20 of 8,123 clips differ).

## Collecting new data

At least 10 different signers x 5 repetitions per sign, varied lighting, backgrounds and
distances, both dominant hands. Get consent; store landmarks rather than video when you can.
The app's Record page does this and records the signer's name for signer-independent tests.
