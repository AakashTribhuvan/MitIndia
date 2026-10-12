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

## Sources

| Source | Manifest | Clips | Words | How to rebuild the landmarks |
|---|---|---|---|---|
| INCLUDE pose release (AI4Bharat OpenHands, Zenodo 6674324, CC-BY-4.0) | `manifest_include.csv` | 4,292 | 263 | download to `data/external/include_pose`, then `convert_include_pose.py --variant include` |
| INCLUDE original videos (Zenodo 4010759, CC-BY-4.0; 10 of 15 categories) | `manifest_include_video.csv` | 2,795 | 181 | unzip to `data/raw/include_video`, then `extract_landmarks.py --source include_video --input data/raw/include_video` |
| Team word recordings (MUDRA team; licence to be confirmed) | `manifest_islwords.csv` | 1,210 | 61 | `extract_landmarks.py --source islwords --input <Video_Dataset folder> --group-strip "_(left\|right)_tilt$"` |
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
