# Examples

`tour.mjs` walks the whole SDK against a running KnowShowGo, with fake data
only (Avery Example, Contoso), every write private and marked
`provenance.test = true`:

1. objects as instances of schema.org prototypes, written as propositions;
2. `bind_pattern`: who works where, with the claim behind each answer;
3. `close_relation`: `manager_of`, transitively;
4. `evaluate_joins`: two `manager_of` hops make a `skip_manager_of`;
5. `match_prototypes({ object })`: unlabeled objects classified, with
   typicality and the properties that say so.

```sh
KSG_API_URL=http://127.0.0.1:3000 KSG_API_TOKEN=… node examples/tour.mjs
```

The knowshowgo repo runs it against an in-memory server in
`tests/dev-ladder/ac1-client-tour.test.js`.
