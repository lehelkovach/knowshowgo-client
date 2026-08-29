# Client `dev` ladder

Canonical board: sibling [`knowshowgo/docs/DEVELOPMENT-PLAN.md`](../knowshowgo/docs/DEVELOPMENT-PLAN.md) (v6.6).

This SDK is plane **K** / **K0**. Surfaces on `dev`:

- **R0:** `evaluatePrototypeMatch` / `evaluate_prototype_match`
- **R1:** persist Logic IR through `upsert_object` / `get_object`
- **R2:** `evaluateLogicInference` / `evaluate_logic_inference`; `get_object(..., { infer: true })`

Do not tag until CH0 (DEV live-smoke). Next IR rungs ship in the same PR pair into `dev`.
