#!/usr/bin/env node
// One version for both SDKs. Usage: node scripts/bump-version.mjs 0.2.21-dev
// Writes package.json + package-lock.json (npm), python/pyproject.toml and
// python/knowshowgo_client/__init__.py (PEP 440: X.Y.Z-dev -> X.Y.Z.dev0).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-dev)?$/.test(version)) {
  console.error('usage: bump-version.mjs X.Y.Z | X.Y.Z-dev');
  process.exit(1);
}
const py = version.replace(/-dev$/, '.dev0');

execFileSync('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { stdio: 'inherit' });

const toml = 'python/pyproject.toml';
writeFileSync(toml, readFileSync(toml, 'utf8').replace(/^version = ".*"$/m, `version = "${py}"`));
const init = 'python/knowshowgo_client/__init__.py';
writeFileSync(init, readFileSync(init, 'utf8').replace(/^__version__ = ".*"$/m, `__version__ = "${py}"`));
console.log(`npm ${version}  python ${py}`);
