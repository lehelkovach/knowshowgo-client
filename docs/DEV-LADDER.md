# Client `dev` ladder

Order (what runs next) for KSG, OSLO and this client: the Sprint queue in osl-oc-agent [`docs/IDEAS-BACKLOG.md`](https://github.com/lehelkovach/osl-oc-agent/blob/dev/docs/IDEAS-BACKLOG.md) (2026-11-12). Rung IDs and product detail: [`knowshowgo/docs/DEVELOPMENT-PLAN.md`](https://github.com/lehelkovach/knowshowgo/blob/dev/docs/DEVELOPMENT-PLAN.md).

Shipped since this list was written: 0.2.32 rules, events/episodes, procedure runs, versions, evaluation, verified facts; 0.2.34 propositions (`assert_proposition`) and logic for agents (`bind_pattern`, `close_relation`, `evaluate_joins`, `ensure_predicate`, `check_membership`); 0.2.35 `match_prototypes({ object })`, the taxonomy and concept-lookup reads, the CE3d inferred-candidate stats, and [`examples/tour.mjs`](../examples/tour.mjs), which knowshowgo runs end to end against an in-memory server (AC1). Method-by-method detail lives in [`API.md`](API.md).

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
