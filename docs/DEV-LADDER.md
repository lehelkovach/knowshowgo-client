# Client `logic-ir-dev` ladder

Same-named branch as knowshowgo `logic-ir-dev`, cut from client `dev`.

- **R0:** `evaluatePrototypeMatch` / `evaluate_prototype_match` → `POST /api2.0/prototype-matches/evaluate`
- **R1:** persist Logic IR through existing `upsert_object` / `get_object` (no extra HTTP). Pure IR lives in the server repo (`src/logic_ir/`).
- **R2:** `evaluateLogicInference` / `evaluate_logic_inference` → `POST /api2.0/logic-ir/infer`; `get_object(..., { infer: true })` attaches query-time validity. Matching Argument is not the same as VALID inference.

Server ladder: `knowshowgo/docs/DEV-LADDER.md`.

Do not merge to client `main` for prod until the server rung is on a watched deploy.
