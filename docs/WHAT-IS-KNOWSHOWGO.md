# What is KnowShowGo?

*A plain-language introduction for people who have never heard of it. No code
here. When you want to try it, go to [Getting started](GETTING-STARTED.md).*

---

## The problem it solves

Software that uses AI has a memory problem, and it has three parts.

1. **It forgets.** A language model remembers nothing between conversations.
   Whatever your assistant learned about you yesterday is gone today unless
   something outside the model wrote it down.
2. **It makes things up.** When a model does not know, it still answers, and
   the wrong answer reads exactly like a right one. Nothing in the answer tells
   you whether it came from a fact or from fluency.
3. **It cannot explain itself.** Ask "why do you believe that?" and you get
   another fluent paragraph, not a trail back to who said what, when.

The usual fix is to bolt a database onto the model: a vector store for
"similar text", a SQL table for structured fields, a document store for notes.
Each fixes a corner. None of them knows what a *concept* is, none keeps track
of *who said* a fact and whether someone later contradicted it, and none can
check a claim as logic.

**KnowShowGo (KSG) is a memory service built for this.** It remembers facts
with their source, organizes them into concepts, keeps every correction as
history, and lets a program check a claim against what is actually stored. An
AI model can read from it and write to it, but the model is not the memory.
The memory is a graph you can inspect.

The name is the idea: **know** (facts and concepts), **show** (every fact can
show where it came from), **go** (procedures: how to do things, stored so an
agent can do them again).

---

## What it is, in one paragraph

KnowShowGo is a **knowledge graph with a REST API**. Everything stored in it is
a *concept*: a person, a company, a category like "Dog", a single property
value like a phone number, a claim like "Ada is a mathematician", a step in a
procedure, a conversation turn. Every concept has a permanent ID, a version
history, and a record of where it came from. Concepts are linked by typed
relationships, searchable by meaning (embeddings), typed by resemblance
(prototypes), and checkable as logic. This package, `knowshowgo-client`, is
how a JavaScript or Python program talks to it.

---

## Five ideas that make it different

You can use KnowShowGo without understanding these, but they explain why it
behaves the way it does.

### 1. Everything is a concept

In a normal database a customer is a row, their city is a column, and
"customer" is a table name. In KnowShowGo the customer is a concept, their
city is a concept, the *idea* of a city is a concept, and the fact that this
customer lives in that city is a concept too. Each has its own ID and history.

That sounds heavier than a row. It buys three things: any fact can be linked
to any other, any fact can carry its own source, and nothing is ever "just a
string" that the system cannot reason about.

### 2. Record, never overwrite

When you correct a fact, KnowShowGo does not erase the old one. It adds a new
version and marks the old one superseded. When two sources disagree, both
claims are kept and the disagreement is visible. When you retract something,
it is marked retracted, not deleted.

This is what makes "why do you believe that?" answerable. The answer is a walk
through the stored claims, their sources, and their history. It is also what
makes the memory safe for automation: a program that writes a wrong fact
cannot destroy the right one.

### 3. Categories are prototypes, not boxes

People do not categorize with rigid definitions. A robin is a very typical
bird, a penguin is a bird too but a strange one, and you knew that without
checking a rule. KnowShowGo categorizes the same way. A category is a
*prototype*: a center of gravity in meaning-space plus examples. An object
matches a prototype with a *score*, can match several at once, and nothing in
the system has a single rigid "type" field.

For you this means you can store a contact card without first designing a
schema, ask "what kind of thing is this?", and get a ranked answer rather than
an error.

### 4. A stored claim is not the truth

KnowShowGo stores what was said, by whom, with what confidence. It does not
collapse that into a single "is this true" number, because a claim from a
reliable source, a claim from a stranger, a claim contradicted by two others,
and a claim nobody has ever disputed are different situations that one number
would hide. When you ask, you get a *belief*: the current best reading, with
the competing evidence attached. And when nothing is stored, the answer is
**unknown**, never a confident guess.

### 5. The language model extracts; the graph answers

A language model is good at one thing here: turning messy human text into
structure. "My dentist is Dr. Lee, Tuesdays at 3" becomes a person, a role, a
schedule. KnowShowGo lets a model do that once, at write time, and keeps the
result as inspectable graph. Questions are then answered from the graph by
ordinary deterministic code, not by asking the model again. The model's
fluency never gets a chance to invent an answer.

---

## Three kinds of memory

KnowShowGo keeps three kinds of memory in one graph, because an agent needs
all three and they refer to each other.

| Memory | What it holds | Human analogy |
|---|---|---|
| **Semantic** | Facts and concepts: who, what, which category, which relationships | Knowing that Paris is in France |
| **Episodic** | What happened: conversation turns, actions taken, when, with whom, with the source attached | Remembering last Tuesday's meeting |
| **Procedural** | How to do things: step-by-step procedures as graphs, plus a record of each time one was run and where it stopped | Knowing how to ride a bike |

An assistant that fills in a form for you uses all three: the procedure for
that site, your facts to fill the fields, and an episode recording that it did
so, with what result.

---

## What you can build with it

**A personal assistant that actually remembers.** Everything you tell it,
every form it filled, every preference, stored under your identity and
recalled by meaning. Switch devices, switch models, switch assistants: the
memory is yours and it persists. This is how the OSLO agent (the flagship
KnowShowGo client) works.

**A hallucination check for any AI feature.** Before your app shows a claim
the model produced, ask KnowShowGo whether it is supported by stored facts.
Supported, contradicted, or unknown, with the evidence. You decide what to do
with each.

**Shared memory for a team of agents.** Several agents working on one task,
or one agent across many sessions, read and write the same graph. Agent A
learns something; Agent B can use it an hour later with no shared context
window and no copy-paste.

**A knowledge base that shows its sources.** Customer facts, product facts,
research notes, policy. Every entry carries who added it and when; every
correction is history; search works by meaning, not by exact words.

**A library of procedures.** Teach a workflow once (how to submit an expense,
how to apply on a particular portal, how to onboard a vendor) and store it as
a graph an agent can run, pause at a blocker, and resume. Each run is
recorded, so a failed run can be replayed and the procedure repaired.

**A domain ontology without a schema committee.** Start storing objects.
Categories form from examples. When two names mean one thing, say so once and
both resolve to the same concept. When the world changes, version the concept
instead of migrating a table.

**Structured facts from unstructured conversation.** Point the semantic
memory at a chat transcript, a meeting note, an email. It extracts entities
and claims, keeps the original text as the source, and lets you ask
structured questions afterwards.

---

## What it is not

- **Not a chatbot.** KnowShowGo has no conversational interface of its own. The
  agent that talks to you is a separate program that uses KnowShowGo as its
  memory.
- **Not a language model, and it does not need one to run.** You can use it as a
  pure knowledge graph. The optional language-model features (extracting facts
  from text, embeddings for search) are configured on the server.
- **Not only a vector database.** It uses embeddings to find things by meaning,
  but similarity is a *hint*, never an identity decision. Two things being near
  each other in meaning-space does not make them the same thing.
- **Not a document store.** It can keep a document, but it keeps it as a
  concept with extracted structure around it, not as an opaque file.
- **Not an embedded library.** It is a service. The client in this repository
  talks to it over HTTPS, either the hosted API at `api.knowshowgo.com` or a
  server you run yourself.

---

## Public and private

KnowShowGo separates a **public commons**, concepts anyone can read such as
"Dog" or "Mathematician", from **private data** owned by a person or an app.
Private facts are only readable by the identity that owns them. You identify
yourself with an API token. The hosted service requires a token for writes.

---

## Small glossary

| Word | Meaning in KnowShowGo |
|---|---|
| **Concept** | Anything stored. Has a permanent ID, versions, and a source. |
| **Object** | A concept that is an individual thing with properties: this contact card, this event. |
| **Category / prototype** | A kind of thing, defined by a center in meaning-space and examples, matched by score. |
| **Assertion / claim** | "Subject, predicate, object", with a source and confidence: `Ada`, `is_a`, `Mathematician`. |
| **Belief** | The current best reading of competing claims about something, with the evidence. |
| **Provenance** | Who or what wrote a fact, when, and from what. |
| **Episode** | A record of something that happened: a conversation turn, an action. |
| **Procedure** | A how-to, stored as a graph of steps an agent can execute. |
| **Embedding** | A numeric fingerprint of meaning, used to find similar things. |
| **Logic IR** | A small formal language for stating propositions so they can be checked against stored claims and the check can be audited. |
| **Owner / namespace** | The identity private data belongs to. |

---

## Where next

- **Try it in ten minutes:** [Getting started](GETTING-STARTED.md), JavaScript
  and Python side by side.
- **Every method:** [API reference](API.md).
- **Reading objects like plain JavaScript objects:** [The duck-typed ORM](DUCK-TYPED-ORM.md).
- **The full design, for engineers:** the server's
  [`ARCHITECTURE.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/ARCHITECTURE.md).
- **See it working:** the live demos at <https://knowshowgo.com/demo/>.
