# Instructions for AI agents working on MUDRA

1. **Read `HANDOVER.md` first.** It is the single source of truth: architecture, interfaces, data,
   models, results, open problems and the decision history.
2. **Update `HANDOVER.md` in every push** (its Section 0 lists which sections to touch for which
   change). Add a change-log entry at the top of Section 21 with date, commits, what changed, why,
   and the measured effect with the split it was measured on. The pre-push hook in `.githooks/`
   enforces this; enable it with `git config core.hooksPath .githooks`.
3. **Never invent or round up numbers.** Report only results produced by the scripts in this repo,
   name the split, and never tune thresholds or settings on test data.
4. **Keep the live path shared.** Feature, segmenter and decision code lives in
   `training/src/mudra_ml` and is used by both the API and the benchmarks; change it there.
5. **Privacy:** landmarks only. Never commit videos, real people's landmark files or
   `data/metadata/manifest_app.csv`, and never identify people from faces.
6. **Before deploying a model**, compare it with the deployed one on the same validation and test
   streams (`training/scripts/eval_continuous.py --scenarios normal,closeup --fps-cap 12`).
7. Run `pytest training app/backend/tests` and `npx vite build` (in `app/frontend`) before pushing.
