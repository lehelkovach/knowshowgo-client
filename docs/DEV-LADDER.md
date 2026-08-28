# Client `logic-ir-dev` ladder

Same-named branch as knowshowgo `logic-ir-dev`, cut from client `dev`.

- **R0:** `evaluatePrototypeMatch` / `evaluate_prototype_match` → `POST /api2.0/prototype-matches/evaluate`
- **R1:** persist Logic IR through existing `upsert_object` / `get_object` (no extra HTTP). Pure IR lives in the server repo (`src/logic_ir/`).

Server ladder: `knowshowgo/docs/DEV-LADDER.md`.

Do not merge to client `main` for prod until the server rung is on a watched deploy.
