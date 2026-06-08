export interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  apiToken?: string;
  timeoutMs?: number;
}

export interface PrototypeInput {
  name: string;
  description?: string | null;
  context?: string | null;
  labels?: string[];
  embedding?: number[] | null;
  parentPrototypeUuids?: string[] | null;
  schema?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface ConceptInput {
  prototypeUuid: string;
  jsonObj: Record<string, unknown>;
  embedding?: number[] | null;
  previousVersionUuid?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NodeInput {
  uuid?: string | null;
  label: string;
  summary?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  associations?: Array<Record<string, unknown>>;
  prototypeUuid?: string | null;
}

export interface VectorSearchInput {
  embedding?: number[];
  text?: string;
  topK?: number;
  filters?: Record<string, unknown>;
  prototypeFilter?: string | null;
}

export interface GraphSearchInput {
  startUuid?: string;
  query?: string | null;
  relationTypes?: string[];
  maxDepth?: number;
  direction?: "in" | "out" | "both";
  limit?: number;
}

export class KnowShowGoError extends Error { // pragma: allowlist secret
  status?: number;
  body?: unknown;
  method?: string;
  endpoint?: string;
}

export class KnowShowGoClient { // pragma: allowlist secret
  constructor(options?: ClientOptions);

  health_check(): Promise<unknown>;
  healthCheck(): Promise<unknown>;

  create_prototype(input: PrototypeInput): Promise<string | undefined>;
  createPrototype(input: PrototypeInput): Promise<string | undefined>;
  get_prototype(uuid: string): Promise<unknown>;
  getPrototype(uuid: string): Promise<unknown>;
  upsert_prototype(uuid: string, prototype: Record<string, unknown>): Promise<unknown>;
  upsertPrototype(uuid: string, prototype: Record<string, unknown>): Promise<unknown>;
  list_prototypes(params?: Record<string, unknown>): Promise<unknown>;
  listPrototypes(params?: Record<string, unknown>): Promise<unknown>;
  create_prototype_from_concept(conceptUuid: string, options?: Record<string, unknown>): Promise<string | undefined>;
  createPrototypeFromConcept(conceptUuid: string, options?: Record<string, unknown>): Promise<string | undefined>;
  fuzzy_duck_type_concept(jsonObj: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  fuzzyDuckTypeConcept(jsonObj: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;

  create_concept(input: ConceptInput): Promise<string | undefined>;
  createConcept(input: ConceptInput): Promise<string | undefined>;
  create_concept_from_prototype(prototypeUuid: string, jsonObj: Record<string, unknown>, options?: Record<string, unknown>): Promise<string | undefined>;
  createConceptFromPrototype(prototypeUuid: string, jsonObj: Record<string, unknown>, options?: Record<string, unknown>): Promise<string | undefined>;
  get_concept(uuid: string): Promise<unknown>;
  getConcept(uuid: string): Promise<unknown>;
  upsert_concept(uuid: string, concept: Record<string, unknown>): Promise<unknown>;
  upsertConcept(uuid: string, concept: Record<string, unknown>): Promise<unknown>;
  query_concepts(query?: Record<string, unknown>): Promise<unknown>;
  queryConcepts(query?: Record<string, unknown>): Promise<unknown>;
  search_concepts(query: string, options?: { top_k?: number; similarity_threshold?: number; prototype_filter?: string | null }): Promise<unknown>;
  searchConcepts(query: string, options?: { top_k?: number; similarity_threshold?: number; prototype_filter?: string | null }): Promise<unknown>;

  create_node_with_document(input: NodeInput): Promise<string | undefined>;
  createNodeWithDocument(input: NodeInput): Promise<string | undefined>;
  create_node(input: NodeInput): Promise<string | undefined>;
  createNode(input: NodeInput): Promise<string | undefined>;
  get_node(uuid: string): Promise<unknown>;
  getNode(uuid: string): Promise<unknown>;
  upsert_node(uuid: string, node: Record<string, unknown>): Promise<unknown>;
  upsertNode(uuid: string, node: Record<string, unknown>): Promise<unknown>;
  query_nodes(query?: Record<string, unknown>): Promise<unknown>;
  queryNodes(query?: Record<string, unknown>): Promise<unknown>;
  update_node_embedding(uuid: string): Promise<unknown>;
  updateNodeEmbedding(uuid: string): Promise<unknown>;

  vector_search(input?: VectorSearchInput): Promise<unknown>;
  vectorSearch(input?: VectorSearchInput): Promise<unknown>;
  embedding_search(embedding: number[], options?: Omit<VectorSearchInput, "embedding">): Promise<unknown>;
  embeddingSearch(embedding: number[], options?: Omit<VectorSearchInput, "embedding">): Promise<unknown>;
  graph_search(input?: GraphSearchInput): Promise<unknown>;
  graphSearch(input?: GraphSearchInput): Promise<unknown>;
  graph_neighbors(uuid: string, options?: { direction?: "in" | "out" | "both"; relationTypes?: string[]; limit?: number }): Promise<unknown>;
  graphNeighbors(uuid: string, options?: { direction?: "in" | "out" | "both"; relationTypes?: string[]; limit?: number }): Promise<unknown>;

  add_association(input: { from_concept_uuid: string; to_concept_uuid: string; relation_type: string; strength?: number }): Promise<unknown>;
  addAssociation(input: { from_concept_uuid: string; to_concept_uuid: string; relation_type: string; strength?: number }): Promise<unknown>;
  get_associations(uuid: string, options?: { direction?: "in" | "out" | "both" }): Promise<unknown>;
  getAssociations(uuid: string, options?: { direction?: "in" | "out" | "both" }): Promise<unknown>;

  register_prototype(prototypeName: string, options?: Record<string, unknown>): Promise<unknown>;
  registerPrototype(prototypeName: string, options?: Record<string, unknown>): Promise<unknown>;
  create_instance(prototypeName: string, properties: Record<string, unknown>): Promise<unknown>;
  createInstance(prototypeName: string, properties: Record<string, unknown>): Promise<unknown>;
  get_instance(prototypeName: string, uuid: string): Promise<unknown>;
  getInstance(prototypeName: string, uuid: string): Promise<unknown>;

  create_assertion(input: { subject: string; predicate: string; object: unknown; truth?: number; source?: string }): Promise<unknown>;
  createAssertion(input: { subject: string; predicate: string; object: unknown; truth?: number; source?: string }): Promise<unknown>;
  get_assertions(input?: { subject?: string; predicate?: string; object?: unknown }): Promise<unknown>;
  getAssertions(input?: { subject?: string; predicate?: string; object?: unknown }): Promise<unknown>;
  get_snapshot(entityId: string): Promise<unknown>;
  getSnapshot(entityId: string): Promise<unknown>;
  get_evidence(entityId: string, options?: { predicate?: string }): Promise<unknown>;
  getEvidence(entityId: string, options?: { predicate?: string }): Promise<unknown>;
  store_fact(input: { subject: string; predicate: string; object: unknown; status?: string; confidence?: number; source?: Record<string, unknown> | null }): Promise<unknown>;
  storeFact(input: { subject: string; predicate: string; object: unknown; status?: string; confidence?: number; source?: Record<string, unknown> | null }): Promise<unknown>;
  store_facts_bulk(facts: Array<[string, string, unknown] | Record<string, unknown>>): Promise<unknown>;
  storeFactsBulk(facts: Array<[string, string, unknown] | Record<string, unknown>>): Promise<unknown>;
  verify(claim: string, options?: { threshold?: number }): Promise<unknown>;
  get_fact_stats(): Promise<unknown>;
  getFactStats(): Promise<unknown>;

  match_concept(concept: unknown, observation: unknown): Promise<unknown>;
  matchConcept(concept: unknown, observation: unknown): Promise<unknown>;
  match_concept_explain(concept: unknown, observation: unknown): Promise<unknown>;
  matchConceptExplain(concept: unknown, observation: unknown): Promise<unknown>;
  match_pattern(pattern: unknown, concepts: unknown[], observation: unknown): Promise<unknown>;
  matchPattern(pattern: unknown, concepts: unknown[], observation: unknown): Promise<unknown>;
  detect_form(input?: Record<string, unknown>): Promise<unknown>;
  detectForm(input?: Record<string, unknown>): Promise<unknown>;
  cpms_create_concept(concept: unknown): Promise<unknown>;
  cpmsCreateConcept(concept: unknown): Promise<unknown>;
  cpms_upsert_concept(id: string, patch: Record<string, unknown>): Promise<unknown>;
  cpmsUpsertConcept(id: string, patch: Record<string, unknown>): Promise<unknown>;
  cpms_get_concept(id: string): Promise<unknown>;
  cpmsGetConcept(id: string): Promise<unknown>;
  cpms_create_pattern(pattern: unknown): Promise<unknown>;
  cpmsCreatePattern(pattern: unknown): Promise<unknown>;
  cpms_upsert_pattern(id: string, patch: Record<string, unknown>): Promise<unknown>;
  cpmsUpsertPattern(id: string, patch: Record<string, unknown>): Promise<unknown>;
  cpms_get_pattern(id: string): Promise<unknown>;
  cpmsGetPattern(id: string): Promise<unknown>;
}

export default KnowShowGoClient; // pragma: allowlist secret
