# Use cases

*What people build on KnowShowGo, and which parts of the client each one
leans on. Each sketch is a shape, not a finished app.*

KnowShowGo is often introduced as "memory for AI agents". That is one use,
and the one its flagship client makes. The thing itself is more general: a
**semantic knowledge graph** where concepts have stable identities, categories
are fuzzy prototypes, every fact carries its source and history, procedures
are data, and claims can be checked as logic. Anything that needs that shape
is a use case.

---

## 1. Durable memory for an assistant or agent

The assistant forgets nothing you told it, across sessions, devices and model
vendors, and it can say where each memory came from.

```text
user says something  ──► semantic_remember   (sentence kept, claims extracted)
                     ──► upsert_object       (a card, a contact, a preference)
later, by meaning    ──► semantic_recall / search_knowledge
a direct question    ──► get_snapshot / semantic_ask
a correction         ──► semantic_correct    (old claim superseded, kept)
```

- Everything is written under the user's owner identity, so it is private.
- The model never answers from its own context; it reads the graph and the
  graph has provenance.

## 2. Shared memory across many agents

Several agents, or one agent across many processes, read and write one graph
with no shared context window. Agent A learns a fact at noon; Agent B uses it
at one. Each write carries the agent's name as speaker, so disagreements are
attributable.

```text
agent A ─► semantic_remember({ text, speaker: 'researcher-a' })
agent B ─► semantic_ask({ subject, predicate })   → supported | refuted | conflicted | unknown
                                                     with the claims and their speakers
```

A `conflicted` answer is a feature: two agents said different things, both
are kept, a human or a policy decides.

## 3. A hallucination check in front of an AI feature

Before your app shows a claim a model produced, ask the graph.

```text
model output: "Ada Lovelace wrote the first published algorithm"
   ├─ exact subject known?  get_snapshot('Ada Lovelace').wrote
   ├─ fuzzy match on stored verified facts?  verify(claim) → status, confidence, matchingFact
   └─ formal?  evaluate_logic_ir({ ir }) → true | false | unknown, claims consulted
```

Three different strengths of check, and the honest answer when nothing is
stored is `unknown`, never a confident yes.

## 4. A knowledge base with sources

Customer facts, product data, research notes, internal policy. Every entry
carries who added it and when. A correction is a new version with the old one
still visible. Search works by meaning, so "who handles refunds" finds the
note titled "returns process".

```text
upsert_object({ title, category_name: 'Policy', properties, tags })
search_knowledge({ query: 'who handles refunds' })
get_object(uuid)            // the record, with lineage
hydrate(uuid).explain(name) // where each field came from
```

## 5. Structured data from unstructured text

Meeting notes, chat transcripts, emails, support tickets. Keep the original
text as the source; extract entities and claims; ask structured questions
later.

```text
semantic_remember({ text: transcriptChunk, speaker, source: 'meeting-2026-10-05' })
semantic_ask({ subject: 'Acme renewal', predicate: 'owner' })
semantic_recall({ query: 'decisions about pricing' })
```

The extractor is configured on the server. On the hosted service a language
model does the extraction; the result is graph, and the model is not consulted
again when you ask.

## 6. A library of procedures an agent can run

Teach a workflow once (submit an expense, apply on a portal, onboard a vendor)
and store it as a graph of steps with dependencies and guards. An agent finds
the right procedure by meaning, runs it, and records the run as an episode.
When a step breaks, repair that step; the procedure keeps its history.

```text
create_procedure({ title, steps: [{ title, tool, payload }], dependencies: [[0, 1], [1, 2]] })
search_procedures('expense report')
get_procedure(uuid)                      // compiled DAG
add_procedure_step(uuid, { ... })        // insert, with provenance
generalize_procedure(uuid, { mode })     // concrete recording → reusable template
```

## 7. Form filling and field mapping

A web form, a CSV header row, an API payload: observed labels that need to be
matched to the fields you actually hold. The graph ranks property definitions
by meaning and assigns one-to-one, so "Card number" does not grab the CVV.

```text
resolve_slots({ labels: ['Cardholder name', 'Card number', 'Email'],
                candidates: ['name_on_card', 'number', 'expiry', 'cvv'] })
// → slots: label → property with score; unresolved: ['Email']
```

A closed candidate set means an unknown label resolves to nothing rather than
to the nearest vector.

## 8. A domain ontology without a schema committee

Start storing objects with a category name. Categories form from examples.
Name a parent and you have a subtype tree. When two names mean one thing, say
so once. When the world changes, version the category.

```text
upsert_object({ title: 'Hermione', category_name: 'BorderCollie', parent_category_name: 'Dog' })
generalize_from_exemplar({ text, threshold })        // let examples form a category
hydrate(uuid).type()                                  // which category this most resembles, with a score
get_entity_types(uuid, { top_k: 5 })                  // all of them, ranked
```

Typicality and membership are separate. A penguin is a bird that matches the
bird prototype weakly; the graph keeps both facts.

## 9. Duck-typed objects for application code

Read an entity like a plain object, synchronously, with the uncertainty
preserved rather than hidden. For JavaScript and Python programmers this is
the most immediately useful thing in the SDK.

```js
const person = await client.hydrate(uuid);
person.middleName             // winner value
person.isContested('city')    // two sources disagree?
person.explain('city')        // which category defined it, and who else could have
person.as('Employee').role    // the same entity read through a weaker match
```

Detail: [Prototypes and casting](PROTOTYPES-AND-CASTING.md).

## 10. Auditable reasoning

Store propositions as Logic IR bound to concept UUIDs. Ask whether a
conclusion follows from premises (shape) and whether a formula is true of what
is stored (truth). Record the derivation so that "why do you believe that?"
walks back through the graph to the claims and the rule that fired.

```text
evaluate_logic_inference({ premiseRevisionUuids, conclusionRevisionUuid, record: true })
evaluate_logic_ir({ ir, bindings, record: true })
explain_derivation(derivationUuid)   // premises → rule@revision → conclusion
```

Detail: [Procedures and logic](PROCEDURES-AND-LOGIC.md).

## 11. Private vaults and sensitive data

Cards, credentials, personal documents: stored under an owner, encrypted at
rest on the server, redacted before embedding so a secret never enters vector
space, and kept findable through safe derived values (last four digits, brand,
holder name). Written through the ordinary object path with a sensitivity
flag; no special endpoint.

---

## What these have in common

Every one of them is built from the same handful of primitives
([Concepts](CONCEPTS.md)): concepts, categories, objects with property values,
assertions resolved into beliefs, episodes, procedures, and Logic IR. New
kinds of data do not get new endpoints. They get a category.
