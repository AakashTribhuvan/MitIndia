# Sign library: fingerspelling letters and phrases (2026-10-16)

Besides the 314-word model, SignLine now has two more models built only from data already on the
development machine. Both are used in Learning, Game Mode and Communication.

| | Letters A–Z | Phrases |
|---|---|---|
| Data | `C:\ISL\dataset_ISL`: 12,637 photos (486 per letter, 100×100 px, close-up hands, many people, some rotated copies) | `C:\ISL\Videos_Sentence_Level`: 101 sentences, 687 videos (492 HD + 195 phone-size) |
| Landmarks | `training/scripts/extract_letter_images.py` → `data/processed/landmarks/letters/<L>.npz` (local, git-ignored). Hands found in 6,697 photos (53%), both hands in 3,265 | already extracted: `data/processed/landmarks/islsentences/` (local) |
| Split | k-means colour groups (k=40, 8×8 colour thumbnail: clothing, background, light; never faces); whole groups go to one split; the 3 largest groups always train. Train / val / test photos with hands: 4,562 / 1,065 / 1,070 | `training/scripts/build_sentence_manifest.py` + `make_splits.py --name phrases_v1`: per video (no signer IDs), 5 byte-identical copies removed, 3 low-hand clips dropped: 486 / 97 / 96 |
| Model | `mudra_ml/letters.py`: one frame → 131 features (each hand relative to its wrist ÷ palm size, hands ordered left-to-right, second wrist offset, presence flags) → MLP 256-256 (numpy at inference). Mirror and ±15° rotation augmentation | same BiLSTM recipe as the word model (`phrases_only.yaml`), `seq_len 48`, no background class |
| Exported | `app/backend/models/isl_letters_v1` (`weights.npz`, `model_card.json`) | `app/backend/models/isl_phrases_v1_bilstm` (99 phrases; 2 had too few videos) |
| Test result | **70.9% top-1, 83.8% top-3** (1,070 photos); both hands detected 83.5%, one hand 55.4%. At the validation-chosen threshold 0.70 it answers on 54% of photos with 93.8% precision | **58.3% top-1, 81.3% top-5** (96 videos) |
| Weak items | I 0% (10 photos), H 14%, J 28%, M 37%, W 40%, T 48%, D 50% | per-phrase numbers too small to report (one test video each) |

## How each part of the app uses them

- **Communication** has a *Words / Spell / Phrase* switch.
  - *Spell*: the last 4 frames go to `POST /letters/predict` about 4 times a second; a letter is added
    when the same confident letter comes back 3 times in a row (about 0.75 s); the same letter is added
    again only after the shape changes or the hands leave the view. Guesses can be tapped. *Add word to
    sentence* puts the spelled word into the sentence.
  - *Phrase*: press *Sign a phrase*, 3-2-1, sign, *Done* (stops by itself after 6 s); the clip goes to
    `POST /phrases/predict` and the **top 3 guesses are shown for the user to choose**. The phrase model
    never adds a phrase on its own (58% first-guess accuracy is not enough for that).
- **Learning**: the sign library lists letters (topic *Fingerspelling · Alphabet A–Z*) and phrases
  (*Everyday phrases · Questions / Everyday sentences*) with their examples (`GET /reference/LETTER_A`,
  `/reference/ARE_YOU_FREE_TODAY`) and camera practice. A letter example is the alphabet photo the
  letter model finds most typical of that letter, shown as a still hand shape.
- **Game Mode**: two new paths, *Fingerspelling* (6 lessons) and *Everyday phrases* (26 lessons),
  generated in `app/frontend/src/features/game/libraryCurriculum.js`. Each path unlocks on its own
  (its first lesson is open); the word path is unchanged. Quiz options come from the same path.
- **Camera practice** ("Check my sign"): letters use `/letters/predict`; phrases record a clip and
  use `/phrases/predict`; words still use the `/stream` WebSocket.

## Honest limits

- Neither model has been measured on live webcam use yet. Both test sets come from the same kind of
  recordings as the training data.
- Letters: no signer IDs, so colour groups only approximate "new people"; the photos are tiny, so hands
  were found in about half of them; letters that move (J, and Z in some conventions) are learned from a
  still pose. Validation accuracy (62.2%) is lower than test (70.9%): the groups differ in difficulty.
- Phrases: about 5 training videos per phrase, the same signers in train and test; a phrase is
  recognised as one whole clip, the words inside it are not recognised separately.
- Selection: the phrase variant (seq_len 48, no background class) was chosen on validation (69.1% vs
  61.9% and 60.8%), but the test scores of all three variants were printed and seen. The letter epoch
  count (200 vs 80) was chosen on validation (62.2% vs 59.3%).

## Rebuild

```powershell
python training/scripts/extract_letter_images.py                 # ~14 min on CPU
python training/scripts/train_letters.py                          # -> app/backend/models/isl_letters_v1
python training/scripts/build_sentence_manifest.py
python training/scripts/make_splits.py --manifests data/metadata/manifest_islsentences.csv --name phrases_v1
python training/scripts/train.py --config phrases_only.yaml --name phrases_len48_nobg --set features.seq_len=48 background.prob=0.0 augment.desk_share=0.0
python training/scripts/export_model.py --run experiments/runs/<that run> --name isl_phrases_v1_bilstm --data-source phrases --target-accuracy 0.9
```

The API settings `MUDRA_LETTERS_MODEL_DIR`, `MUDRA_LETTERS_LANDMARKS`, `MUDRA_PHRASES_MODEL_DIR` and
`MUDRA_PHRASES_SPLIT` point elsewhere when needed. Without the local landmark folders the models still
work, but letter and phrase examples are missing (`/reference` returns 404 for them).

## Licences

The alphabet photos and sentence videos were provided by the team; their source and licence are not
confirmed (the sentence videos may be ISL-CSLTR, CC-BY-4.0). Confirm before publishing the models.
