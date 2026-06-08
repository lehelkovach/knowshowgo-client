import assert from "node:assert/strict";
import test from "node:test";
import { createNoShogoRuntime, toPlainConcept } from "../src/index.js";

test("hydrates concepts as plain objects with runtime prototype behavior", () => {
  const runtime = createNoShogoRuntime();
  runtime.definePrototype("Person", {
    match: { has: ["name", "email"] },
    methods: {
      displayName() {
        return this.name;
      }
    }
  });

  const concept = runtime.hydrateConcept({ jsonObj: { name: "Ada", email: "ada@example.test" } });

  assert.equal(concept.kind, "Object");
  assert.equal(typeof concept.displayName, "undefined");
  assert.equal(Object.hasOwn(concept, "name"), true);
  assert.equal(Object.hasOwn(concept, "displayName"), false);
});

test("fuzzy duck typing rematches to the best prototype and exposes methods dynamically", async () => {
  const runtime = createNoShogoRuntime();
  runtime.definePrototype("Person", {
    match: { has: ["name", "email"] },
    methods: {
      displayName() {
        return `${this.name} <${this.email}>`;
      }
    }
  });
  runtime.definePrototype("Document", {
    match: { has: ["title", "body"] },
    methods: {
      summary() {
        return this.title;
      }
    }
  });

  const concept = runtime.hydrateConcept({
    uuid: "concept-1",
    jsonObj: { name: "Ada", email: "ada@example.test", title: "Notes" }
  });

  await concept.rematch({ remote: false });

  assert.equal(concept.kind, "Person");
  assert.equal(concept.displayName(), "Ada <ada@example.test>");
  assert.equal(concept.is("Person"), true);
  assert.equal(concept.matches[0].kind, "Person");
  assert.equal(concept.matches[0].score, 1);
});

test("casts matched concepts polymorphically without changing the source object", async () => {
  const runtime = createNoShogoRuntime();
  runtime.definePrototype("Person", {
    match: { has: ["name", "email"] },
    methods: { displayName() { return this.name; } }
  });
  runtime.definePrototype("Document", {
    match: { has: ["title"] },
    methods: { summary() { return this.title; } }
  });

  const concept = runtime.hydrateConcept({
    jsonObj: { name: "Ada", email: "ada@example.test", title: "Research notes" }
  });
  await concept.rematch({ remote: false });

  const documentView = concept.as("Document");

  assert.equal(concept.kind, "Person");
  assert.equal(documentView.kind, "Document");
  assert.equal(documentView.summary(), "Research notes");
  assert.equal(documentView.sourceConcept, concept);
  assert.equal(typeof concept.summary, "undefined");
});

test("persists kind and match metadata through the configured client", async () => {
  const calls = [];
  const client = {
    upsertConcept(uuid, payload) {
      calls.push({ uuid, payload });
      return Promise.resolve({ ok: true });
    }
  };
  const runtime = createNoShogoRuntime({ client });
  runtime.definePrototype("Person", {
    id: "prototype-person",
    match: { has: ["name"] }
  });

  const concept = runtime.hydrateConcept({
    uuid: "concept-1",
    jsonObj: { name: "Ada" }
  });
  await concept.rematch({ remote: false, persist: true });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].uuid, "concept-1");
  assert.equal(calls[0].payload.kind, "Person");
  assert.equal(calls[0].payload.prototypeId, "prototype-person");
  assert.equal(calls[0].payload.matches[0].kind, "Person");
  assert.deepEqual(calls[0].payload.jsonObj.name, "Ada");
});

test("records ambiguity when equal matches collapse by deterministic WTA", async () => {
  const runtime = createNoShogoRuntime();
  runtime.definePrototype("Person", {
    match: { has: ["name"] },
    methods: { label() { return `person:${this.name}`; } }
  });
  runtime.definePrototype("Agent", {
    match: { has: ["name"] },
    methods: { label() { return `agent:${this.name}`; } }
  });

  const concept = runtime.hydrateConcept({ jsonObj: { name: "Ada" } });
  await concept.rematch({ remote: false });

  assert.equal(concept.kind, "Person");
  assert.equal(concept.label(), "person:Ada");
  assert.equal(concept.ambiguity.ambiguous, true);
  assert.equal(concept.ambiguity.state, "collapsed");
  assert.equal(concept.ambiguity.candidates.length, 2);
  assert.equal(concept.matches[0].strength, 0.5);
  assert.equal(concept.matches[1].strength, 0.5);
  assert.equal(concept.collapse.kind, "Person");
});

test("can defer collapse when ambiguity should be resolved by later context", async () => {
  const runtime = createNoShogoRuntime({ collapsePolicy: "defer" });
  runtime.definePrototype("Person", {
    match: { has: ["name"] },
    methods: { displayName() { return this.name; } }
  });
  runtime.definePrototype("Agent", {
    match: { has: ["name"] },
    methods: { callsign() { return this.name.toUpperCase(); } }
  });

  const concept = runtime.hydrateConcept({ jsonObj: { name: "Ada" } });
  await concept.rematch({ remote: false });

  assert.equal(concept.kind, "Object");
  assert.equal(concept.collapse, null);
  assert.equal(concept.ambiguity.ambiguous, true);
  assert.equal(concept.ambiguity.state, "deferred");
  assert.equal(typeof concept.displayName, "undefined");
});

test("uses context preferences to collapse otherwise equal matches", async () => {
  const runtime = createNoShogoRuntime({ collapsePolicy: "defer" });
  runtime.definePrototype("Person", {
    match: { has: ["name"] },
    methods: { displayName() { return this.name; } }
  });
  runtime.definePrototype("Agent", {
    match: { has: ["name"] },
    methods: { callsign() { return this.name.toUpperCase(); } }
  });

  const concept = runtime.hydrateConcept({ jsonObj: { name: "Ada" } });
  await concept.rematch({
    remote: false,
    collapsePolicy: "wta",
    context: { prefer: "Agent" }
  });

  assert.equal(concept.kind, "Agent");
  assert.equal(concept.callsign(), "ADA");
  assert.equal(concept.ambiguity.ambiguous, false);
  assert.equal(concept.ambiguity.reason, "clear-winner");
  assert.equal(concept.collapse.kind, "Agent");
  assert.ok(concept.matches[0].adjustedScore > concept.matches[1].adjustedScore);
});

test("persists ambiguity and collapse metadata", async () => {
  const calls = [];
  const client = {
    upsertConcept(uuid, payload) {
      calls.push({ uuid, payload });
      return Promise.resolve({ ok: true });
    }
  };
  const runtime = createNoShogoRuntime({ client });
  runtime.definePrototype("Person", { match: { has: ["name"] } });
  runtime.definePrototype("Agent", { match: { has: ["name"] } });

  const concept = runtime.hydrateConcept({ uuid: "concept-1", jsonObj: { name: "Ada" } });
  await concept.rematch({ remote: false, persist: true });

  assert.equal(calls[0].payload.ambiguity.ambiguous, true);
  assert.equal(calls[0].payload.ambiguity.state, "collapsed");
  assert.equal(calls[0].payload.collapse.kind, "Person");
});

test("plain concept serialization excludes behavior and unsafe prototype keys", () => {
  const runtime = createNoShogoRuntime();
  runtime.definePrototype("Person", {
    methods: { displayName() { return this.name; } }
  });
  const concept = runtime.hydrateConcept({
    jsonObj: {
      name: "Ada",
      constructor: "unsafe",
      prototype: "unsafe"
    }
  }, { kind: "Person" });

  const plain = toPlainConcept(concept);

  assert.equal(plain.name, "Ada");
  assert.equal(plain.displayName, undefined);
  assert.equal(plain.constructor, undefined);
  assert.equal(plain.prototype, undefined);
});
