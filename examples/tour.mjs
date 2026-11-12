#!/usr/bin/env node
/**
 * A tour of KnowShowGo through the client SDK, end to end:
 *
 *   1. objects  — instances of schema.org prototypes (Person, Organization)
 *                 with typed properties, written as KG-P1 propositions;
 *   2. bind     — ?p instance_of Person ∧ ?p works_for ?o, answered from the
 *                 graph with the claim behind each binding;
 *   3. closure  — manager_of, transitively, each fact citing its path;
 *   4. joins    — manager_of ∘ manager_of → skip_manager_of, in memory;
 *   5. classify — unlabeled objects matched to prototypes with
 *                 match_prototypes(object): typicality + property evidence.
 *
 * Fake data only (Avery Example, Contoso). Every write is private to the
 * caller and marked `provenance.test = true`, so it never reads as a real fact.
 *
 *   KSG_API_URL=http://127.0.0.1:3000 KSG_API_TOKEN=… node examples/tour.mjs
 *
 * `runTour(client)` returns a summary; the CLI prints it as JSON.
 */
import { KnowShowGoClient } from '../js/client.js';

const ref = (uuid) => ({ kind: 'ConceptRef', uuid });
const V = (name) => ({ kind: 'Variable', name });
const atom = (predUuid, ...args) => ({ kind: 'Predicate', predicate: ref(predUuid), args });

/** The unlabeled objects the tour classifies, with the prototype each should land on. */
export const TOUR_UNLABELED = [
  { expect: 'Person', object: { label: 'Dana Example', properties: { birthDate: '1985-01-01', worksFor: 'Contoso', jobTitle: 'Engineer', email: 'dana@example.test' } } },
  { expect: 'Organization', object: { label: 'Fabrikam', properties: { foundingDate: '1999', legalName: 'Fabrikam Inc.', employee: 'Avery Example', founder: 'Blake Example' } } },
  { expect: 'Place', object: { label: 'Contoso Plaza', properties: { containedInPlace: 'Contoso City', geo: '0.0, 0.0', address: '1 Example Way' } } }
];

export async function runTour(client, { scope = 'private', provenance = {}, log = () => {} } = {}) {
  const prov = { statedBy: 'knowshowgo-client tour', test: true, ...provenance };
  const say = (subject, subjectPrototype, predicate, rest) =>
    client.assert_proposition({ subject, subject_prototype: subjectPrototype, predicate, scope, provenance: prov, ...rest });

  // 1. Objects as instances of schema.org prototypes, with typed values.
  log('1. objects');
  const facts = {
    birth: await say('Avery Example', 'Person', 'birthDate', { value: '1990-04-02', value_prototype: 'Date' }),
    email: await say('Avery Example', 'Person', 'email', { value: 'avery@example.test' }),
    averyWorks: await say('Avery Example', 'Person', 'worksFor', { object: 'Contoso', object_prototype: 'Organization' }),
    blakeWorks: await say('Blake Example', 'Person', 'worksFor', { object: 'Contoso', object_prototype: 'Organization' }),
    founded: await say('Contoso', 'Organization', 'foundingDate', { value: '2001', value_prototype: 'Date' }),
    ab: await say('Avery Example', 'Person', 'manager_of', { object: 'Blake Example', object_prototype: 'Person' }),
    bc: await say('Blake Example', 'Person', 'manager_of', { object: 'Casey Example', object_prototype: 'Person' })
  };
  const objects = {
    avery: facts.birth.subject.uuid,
    blake: facts.blakeWorks.subject.uuid,
    casey: facts.bc.object.uuid,
    contoso: facts.averyWorks.object.uuid
  };

  // 2. Bind: who works where, answered from claims (not similarity).
  log('2. bind');
  const bind = await client.bind_pattern({
    pattern: [
      { subject: '?p', predicate: 'instance_of', object: { prototype: 'Person' } },
      { subject: '?p', predicate: 'worksFor', object: '?o' }
    ],
    describe: true
  });
  const worksFor = (bind.bindings || []).map((b) => ({
    person: b.vars.p?.label ?? b.vars.p?.uuid,
    org: b.vars.o?.label ?? b.vars.o?.uuid,
    claim: b.constraints?.find((c) => c?.evidence?.claimUuid)?.evidence?.claimUuid ?? null
  }));

  // 3. Closure: manager_of, transitively.
  log('3. closure');
  const closure = await client.close_relation({ predicate: 'manager_of' });
  const chain = (closure.facts || []).find((f) => f.subject === objects.avery && f.object === objects.casey) || null;

  // 4. Joins: two manager_of hops make a skip_manager_of, nothing written.
  log('4. joins');
  const head = await client.ensure_predicate({ name: 'skip_manager_of' });
  const m = facts.ab.predicate.uuid;
  const joins = await client.evaluate_joins({
    rules: [{
      name: 'skip_manager_of',
      ir: {
        logicIrVersion: '0.0.1',
        kind: 'ForAll', variable: V('x'), body: { kind: 'ForAll', variable: V('y'), body: { kind: 'ForAll', variable: V('z'), body: {
          kind: 'Implies',
          if: { kind: 'And', args: [atom(m, V('x'), V('y')), atom(m, V('y'), V('z'))] },
          then: atom(head.uuid, V('x'), V('z'))
        } } }
      }
    }]
  });
  const skip = (joins.facts || []).find((f) => f.subject === objects.avery && f.object === objects.casey) || null;

  // 5. Classify unlabeled objects against the prototypes.
  log('5. classify');
  const classified = [];
  for (const { expect, object } of TOUR_UNLABELED) {
    const ranked = await client.match_prototypes({ object, top_k: 8 });
    const top = ranked[0] || null;
    classified.push({
      label: object.label,
      expect,
      top: top?.name ?? null,
      // A subtype counts: City is a Place.
      correct: Boolean(top && (top.name === expect || (top.evidence?.isA || []).includes(expect))),
      isA: top?.evidence?.isA ?? [],
      typicality: top?.typicality ?? null,
      rankScore: top?.rankScore ?? null,
      matched: top?.evidence?.matched ?? [],
      runnersUp: ranked.slice(1, 3).map((r) => r.name)
    });
  }

  return {
    objects,
    claims: Object.fromEntries(Object.entries(facts).map(([k, f]) => [k, f.claim.uuid])),
    bind: { count: bind.count, worksFor },
    closure: { complete: closure.complete, factCount: (closure.facts || []).length, averyToCasey: chain ? { claims: chain.claims } : null },
    joins: { factCount: (joins.facts || []).length, skipManager: skip ? { predicate: skip.predicate } : null },
    classified
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const client = new KnowShowGoClient({
    baseUrl: process.env.KSG_API_URL,
    authToken: process.env.KSG_API_TOKEN || null,
    defaultOwnerUserId: process.env.KSG_OWNER || null
  });
  runTour(client, { log: (s) => process.stderr.write(`${s}\n`) })
    .then((out) => process.stdout.write(`${JSON.stringify(out, null, 2)}\n`))
    .catch((e) => { process.stderr.write(`tour failed: ${e.status ?? ''} ${e.message}\n`); process.exitCode = 1; });
}
