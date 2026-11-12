#!/usr/bin/env node
// CS1: refresh js/capabilities.json from the server's manifest.
//   node scripts/sync-capabilities.mjs [path/to/knowshowgo]   (default: ../knowshowgo)
// The contract test (js/capabilities_contract.test.mjs) then says which methods,
// doc lines or README rows the new manifest needs.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.resolve(process.argv[2] || path.join(root, '..', 'knowshowgo'));
const source = path.join(server, 'src', 'capabilities.json');
const target = path.join(root, 'js', 'capabilities.json');
const text = readFileSync(source, 'utf8');
JSON.parse(text);
const before = (() => { try { return readFileSync(target, 'utf8'); } catch { return ''; } })();
writeFileSync(target, text);
console.log(before === text ? `js/capabilities.json already matches ${source}` : `js/capabilities.json updated from ${source}`);
