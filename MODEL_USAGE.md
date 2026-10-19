# Using the packaged models on another PC

The model weights required for inference are stored in `app/backend/models/`. A fresh clone does not
need this PC's ignored `data/processed/` artifacts to load them. Install the Python and frontend
dependencies using the **Fresh clone** steps in `HANDOVER.md` Section 17, then start the app with
`start_all.bat` on Windows or the manual commands there.

## Packaged artifacts

| Model | Files | Use |
|---|---|---|
| 314-word sequence model (default) | `isl_mudra_combined_v8_desk_bilstm/model.pt`, `model_card.json` | Default live word recognition |
| 314-word rollback model | `isl_mudra_combined_v6_bilstm/model.pt`, `model_card.json` | Previous sequence model |
| Common-word video model | `common_word_video_baseline/model.pt`, `model_card.json` | Selectable 17-word video model |
| ISL500 video pilot | `isl500_video_pilot/model.joblib` | Selectable 14-word SVM |
| SignLine intro video | `signline_intro_video/model.joblib` | 26-word experimental SVM; hidden from the model picker |
| Fingerspelling | `isl_letters_v1/weights.npz`, `model_card.json` | A-Z letter model |
| Phrases | `isl_phrases_v1_bilstm/model.pt`, `model_card.json` | 99-phrase model |
| Static intro prototype | `mudra_intro_static_pose_medoids_v1.npz`, `.json` | Experimental held static poses |
| Static top-10 SVM | `static_top10_v2/model.joblib` | Experimental static-word model |

The backend loads available models from these defaults. To override a path, use the corresponding
`MUDRA_*` environment variable documented in `app/backend/mudra_api/settings.py` and
`app/backend/.env.example`.

## Dataset terms

The ISL500-derived 14-word and 26-word model files are provided for research and academic use. The
[ISL500/ISL-DATA dataset card](https://huggingface.co/datasets/ISL500/ISL-DATA) directs commercial-use
inquiries to its authors. Carry this restriction with copies of these model files. Raw videos,
landmarks, split manifests, and evaluation video examples are not included; these features need the
separately available local dataset files.

The packaged weights make inference portable; they do not include training data or make the measured
offline clip scores a live-webcam accuracy guarantee. See each model card and `HANDOVER.md` Section 13
for the evaluation setup and limitations.
