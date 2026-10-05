# Procedures and logic

*The two "advanced" primitives: how-to knowledge stored as executable graphs,
and formal propositions that can be checked against what the graph knows and
audited afterwards.*

Both are ordinary ConceptObjects. A procedure is a graph of step nodes; a
proposition is an object whose properties are a formula. Nothing here is a
second store.

---

## Part 1: procedures (DAGs)

### What a procedure is

A **procedure** is how to do something, written down as a directed acyclic
graph: steps, the dependencies between them, guards that must hold before a
step runs, and the tool each step calls. It is the kind of knowledge an
assistant needs to *do* things rather than *know* things: submit an expense
report on this portal, onboard a vendor, apply for a job on that site.

Storing it as a graph of concepts, rather than as a script, buys three things:

- it is **searchable by meaning** like everything else, so "file my expenses"
  finds the right procedure;
- it is **versioned and repairable step by step**, so a broken selector on step
  4 is a new version of step 4 with provenance, not a rewrite of the whole thing;
- it can be **generalized**: a concrete recording of one session becomes a
  template with the specifics abstracted out.

A **run** of a procedure is a different object: an episode recording which
steps executed, with which parameters, where it blocked and why. Runs are
stored so that a failure can be replayed and the procedure repaired from what
actually happened. The run is never mistaken for the skill.

### Create one

Steps are an ordered list; dependencies are pairs of indexes `[prerequisite,
step]`. The server rejects a cycle.

```js
const created = await client.create_procedure({
  title: 'Submit monthly expense report',
  description: 'Expenses portal, one receipt per line',
  steps: [
    { title: 'Open the expenses portal', tool: 'web.open',  payload: { url: 'https://expenses.example.test' } },
    { title: 'Start a new report',       tool: 'web.click', payload: { selector: '#new-report' } },
    { title: 'Add each receipt',         tool: 'web.fill',  payload: { selector: '.receipt-row' },
      guard_text: 'at least one receipt is attached' },
    { title: 'Submit',                   tool: 'web.click', payload: { selector: '#submit' },
      on_fail: 'stop and report' },
  ],
  dependencies: [[0, 1], [1, 2], [2, 3]],
});
// created.procedure_uuid, created.step_uuids[], created.dagJson
```

```python
created = client.create_procedure(
    title="Submit monthly expense report",
    steps=[
        {"title": "Open the expenses portal", "tool": "web.open", "payload": {"url": "https://expenses.example.test"}},
        {"title": "Start a new report", "tool": "web.click", "payload": {"selector": "#new-report"}},
        {"title": "Add each receipt", "tool": "web.fill", "payload": {"selector": ".receipt-row"},
         "guard_text": "at least one receipt is attached"},
        {"title": "Submit", "tool": "web.click", "payload": {"selector": "#submit"}, "on_fail": "stop and report"},
    ],
    dependencies=[[0, 1], [1, 2], [2, 3]],
)
```

Each step accepts `title`, `tool`, `payload`, `guard_text` (or `guard`),
`on_fail`, and `order`. The tool names are yours: KnowShowGo stores the
procedure, your runner interprets it.

### Read it back

```js
const proc = await client.get_procedure(created.procedure_uuid);
// the compiled DAG: steps in order with their `next` links, guards and payloads
```

`get_procedure(uuid, { source: 'dagJson' | 'graph' | 'both' })` chooses between
the canonical JSON the procedure was written with and the graph compiled from
step edges; `both` (the default) prefers the JSON and reports differences.

### Change it without losing history

```js
// Insert a step with provenance; the existing steps are relinked.
await client.add_procedure_step(created.procedure_uuid, {
  title: 'Attach the policy acknowledgement',
  tool: 'web.upload',
  payload: { selector: '#policy' },
  after_step_uuid: created.step_uuids[2],
  provenance: { source: 'operator', reason: 'policy changed 2026-10' },
});

// Replace the whole canonical DAG (and optionally re-materialize next edges).
await client.put_procedure_dag(created.procedure_uuid, { dag_json: newDag, rematerialize: true });

// A selector broke on one step: record the repair, keep the failed one.
await client.repair_procedure_selector(created.procedure_uuid, {
  step_uuid: created.step_uuids[3],
  form_element_uuid: submitButtonUuid,
  failed_selector: '#submit',
  repaired_selector: 'button[type=submit]',
});
```

### From a recording to a template

```js
await client.generalize_procedure(created.procedure_uuid, {
  title: 'Submit an expense report (any portal)',
  mode: 'schema_only',
});
```

### Find one

```js
const hits = await client.search_procedures('file my expenses', { top_k: 5 });
// each hit carries the procedure and its steps
```

### Import a simple definition

```js
await client.import_procedure_json({ procedure: { title, steps: [...] } });
```

---

## Part 2: logic

### Why formal logic in a knowledge graph

A knowledge graph that stores "Socrates is a human" and "all humans are
mortal" should be able to say that Socrates is mortal, say *why*, and say
`unknown` for things it was never told rather than guessing. That needs three
separate things that are usually blurred together:

| Question | Endpoint | Reads the graph? | Answers |
|---|---|---|---|
| Is this formula **well-formed and fully bound**? | validation (part of storing a proposition) | no | valid / invalid |
| Does this conclusion **follow from these premises**? | `evaluate_logic_inference` | no | valid / invalid / unresolved |
| Is this formula **true of what is stored**? | `evaluate_logic_ir` | yes | true / false / unknown, with the claims consulted |

Keeping them apart is the point. "Valid" means well-shaped, not true. A
stored claim is not truth. Absence of a claim is `unknown`, never `false`.

### Logic IR

Propositions are written in a small, backend-independent intermediate
representation: `Predicate`, `Variable`, `Not`, `And`, `Or`, `Implies`,
`ForAll`, `Exists`, with symbols bound to **exact concept UUIDs** through
`ConceptRef` and `EntityRef`. Natural language, other logic syntaxes and
UIs compile *into* this; it is the canonical form.

"All humans are mortal":

```json
{
  "logicIrVersion": "0.0.1",
  "kind": "ForAll",
  "variable": { "kind": "Variable", "name": "x" },
  "body": {
    "kind": "Implies",
    "if":   { "kind": "Predicate", "predicate": { "kind": "ConceptRef", "uuid": "<Human>" },  "args": [{ "kind": "Variable", "name": "x" }] },
    "then": { "kind": "Predicate", "predicate": { "kind": "ConceptRef", "uuid": "<Mortal>" }, "args": [{ "kind": "Variable", "name": "x" }] }
  }
}
```

A proposition is stored as an object in the `Proposition` category with its
IR as properties, so it has versions, provenance and ownership like anything
else. The seeded categories for this (`Proposition`, `Claim`, `Argument`, …)
come with the server; read their UUIDs with `logic_ir_prototypes()` or seed
them on a fresh local server with `seed_logic_ir_primitives()`.

### Truth: evaluate a ground formula against stored claims

```js
const result = await client.evaluate_logic_ir({
  ir: {
    logicIrVersion: '0.0.1',            // required on the root
    kind: 'Predicate',
    predicate: { kind: 'ConceptRef', uuid: livesInUuid },
    args: [{ kind: 'EntityRef', uuid: aliceUuid }, { kind: 'EntityRef', uuid: bostonUuid }],
  },
});
// result.truth   → 'true' | 'false' | 'unknown'
// result.atoms[] → per predicate: rendering, the claims supporting / opposing / competing, consulted uuids
```

```python
result = client.evaluate_logic_ir(ir={...})
print(result["truth"], result["claimsConsulted"])
```

What to expect:

- A two-place predicate `P(s, o)` is looked up as the stored triple
  `(s, P, o)`; a one-place `P(s)` as `(s, is_a, P)`.
- Logic is three-valued (Kleene): `not unknown` is `unknown`, `false and
  unknown` is `false`, `true or unknown` is `true`.
- A malformed formula is `decision: 'blocked'` with diagnostics (for example
  `E006` when `logicIrVersion` is missing) and nothing is evaluated.
- Quantifiers (`ForAll`, `Exists`) and free variables are **refused**
  (`decision: 'unsupported'`, with a diagnostic naming why) rather than
  answered from a sample of the graph. A
  reasoner must enumerate, never sample, and exhaustive enumeration is a
  later rung of the server's roadmap.
- Every answer names the claim UUIDs it consulted per atom, so you can show
  the evidence.

### Shape: does the conclusion follow?

```js
const inf = await client.evaluate_logic_inference({
  premiseRevisionUuids: [allHumansMortalUuid, socratesIsHumanUuid],
  conclusionRevisionUuid: socratesIsMortalUuid,
});
// inf.decision → 'valid' | 'invalid' | 'unresolved'
```

Four rules are recognized: universal modus ponens, propositional modus ponens,
hypothetical syllogism, and reiteration. This never consults stored claims; it
checks the argument's structure over the propositions you name.

### Audit: record the derivation

Add `record: true` to either call and a `true`/`false` evaluation or a `valid`
inference becomes a **Derivation** object linked to its premises, to the rule
that fired (with the engine revision), and to the conclusion. `unknown`,
`invalid` and `unresolved` record nothing; a derivation is a positive finding
or it is not written.

```js
const inf = await client.evaluate_logic_inference({ ...same, record: true });
// inf.derivation → { ok: true, created: true, derivationUuid, rule, conclusionHash }

const why = await client.explain_derivation(inf.derivation.derivationUuid);
// { derivation, rule: { name, engineRevision }, premises: [{ uuid, kind, claimUuid, order }], conclusion: { uuid, hash } }

const all = await client.list_derivations({ conclusionUuid: socratesIsMortalUuid });
```

The walk-back goes through graph edges only, so it answers the same after a
restart. A derivation is never written back as a plain claim, so derived facts
stay distinguishable from stated ones.

### Simpler: syllogisms as DAGs

For the common case of premises and a conclusion without full IR,
`create_syllogism({ title, premises, conclusion })` stores a predicate-logic
DAG you can read back with `get_syllogism(uuid)`.

---

## How the two parts meet

A procedure step can be guarded by a condition; a run records how each
condition was decided (observed on a page, derived by the evaluator, matched by
a prototype, given by a person). When a decision was derived, the step's run
record can carry the derivation UUID, so "why did the agent take this branch"
walks from the run, to the step, to the derivation, to the claims. That is the
shape the server is building toward; the pieces described on this page are the
ones already in the API.

---

## Reading list

- [Concepts](CONCEPTS.md): where procedures and propositions sit among the primitives.
- [Prototypes and casting](PROTOTYPES-AND-CASTING.md): how a sentence becomes a `Claim` by contract.
- [API reference](API.md): every method.
