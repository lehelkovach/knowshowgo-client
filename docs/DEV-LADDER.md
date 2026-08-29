# Client Logic IR

Canonical rungs: sibling [`knowshowgo/docs/DEVELOPMENT-PLAN.md`](../knowshowgo/docs/DEVELOPMENT-PLAN.md) § Engage #0.

SDK surfaces (this repo, on `dev`):

- **R0:** `evaluatePrototypeMatch` / `evaluate_prototype_match` → `POST /api2.0/prototype-matches/evaluate`
- **R1:** persist Logic IR through `upsert_object` / `get_object` (no extra HTTP)
- **R2:** `evaluateLogicInference` / `evaluate_logic_inference` → `POST /api2.0/logic-ir/infer`; `get_object(..., { infer: true })`

Do not tag `vX.Y.Z-client` until the server rung is live-smoked on the DEV VM.
