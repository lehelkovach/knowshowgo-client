# Mock data usage

This folder contains seed fixtures for KSG semantic/procedural memory prototyping.

## Files

- `semantic-procedural-memory-seed.json`
  - topics
  - object category prototypes
  - semantic objects
  - assertions
  - procedure DAGs
- `cpms-prototypes.json`
  - CPMS concept and pattern prototypes
  - observation payloads
  - expected match thresholds

## Suggested import order

1. Create topic entries from `topics`.
2. Create or upsert category prototypes from `objectCategoryPrototypes`.
3. Upsert semantic objects from `objects`.
4. Append assertions from `assertions`.
5. Create procedures from `procedures`.
6. Load CPMS concept and pattern prototypes.
7. Run `match`, `match_explain`, and `match_pattern` with observations.

## Notes

- IDs are deterministic strings for reproducible tests.
- The dataset is scenario-focused ("invoice submission assistant"), but model fields are generic.
- If your server generates UUIDs, keep these IDs as external references in metadata.

