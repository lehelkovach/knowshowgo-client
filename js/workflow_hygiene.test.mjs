/**
 * CI starts only by hand (2026-10-26). GitHub runs nothing by itself in this
 * stack any more; the suites run locally before a merge. On 2026-10-26 every
 * job of ci.yml failed in two seconds with no log, on the PR and on the `dev`
 * push alike — the runner never started — and marked a green change red.
 * The two publish workflows still fire on a `v*` tag (that chain starts from
 * the hand-dispatched release-tag workflow); whether they should is the
 * founder's call and is not asserted here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('ci.yml runs only when started by hand', () => {
  const raw = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
  const text = raw.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const on = text.slice(text.indexOf('\non:'), text.indexOf('\njobs:'));
  assert.match(on, /^\s{2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /^\s{2}(push|pull_request|pull_request_target|schedule|workflow_run):/m);
});

// The 0.2.32 release commit tracked a `node_modules` symlink to an absolute
// local path (`.gitignore` had only `node_modules/`, which matches a directory
// and not a symlink, so `git add -A` took it). Wherever that path loops or is
// missing, every `npm run` script exits before it starts.
test('node_modules is not tracked, and .gitignore covers it as a directory and as a symlink', () => {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '--', 'node_modules'], { cwd: process.cwd(), encoding: 'utf8' });
  } catch {
    return; // not a git checkout (an installed package): nothing to check
  }
  assert.equal(tracked.trim(), '', 'node_modules must not be tracked');
  const rules = readFileSync(join(process.cwd(), '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(rules.includes('node_modules'), '.gitignore needs a `node_modules` line with no trailing slash');
});
