# Client `dev` ladder

Canonical board: sibling [`knowshowgo/docs/DEVELOPMENT-PLAN.md`](../knowshowgo/docs/DEVELOPMENT-PLAN.md) (v6.6).

This SDK is plane **K** / **K0**. Surfaces on `dev`:

- **R0:** `evaluatePrototypeMatch` / `evaluate_prototype_match`
- **R1:** persist Logic IR through `upsert_object` / `get_object`
- **R2:** `evaluateLogicInference` / `evaluate_logic_inference`; `get_object(..., { infer: true })`
- **R0-r:** `logicIrPrototypes` / `logic_ir_prototypes` — read the seeded Logic IR
  prototype uuids by name. Seeding is the only other way to learn them and
  seeding is a write, so under `KSG_REQUIRE_WRITE_TOKEN=1` (on for the public
  API) a read-only caller could not cast or match at all. Verified against a
  live `v0.2.21` server, not only against the transport mock.

Do not tag until CH0 (DEV live-smoke). Next IR rungs ship in the same PR pair into `dev`.
