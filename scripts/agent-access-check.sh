#!/usr/bin/env bash
# Client-repo access check for cloud agents.
# Non-destructive: no remote writes.

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UPSTREAM_PRIVATE_REPO="${UPSTREAM_PRIVATE_REPO:-}"
CHECK_GIT_CLEAN="${CHECK_GIT_CLEAN:-0}"
CHECK_FAIL=0

run_check() {
  local name="$1"
  shift
  if "$@"; then
    echo "[ok] $name"
  else
    echo "[fail] $name"
    CHECK_FAIL=1
  fi
}

warn() {
  echo "[warn] $1"
}

is_git_clean() {
  git diff --quiet && git diff --cached --quiet
}

check_gh_auth() {
  gh auth status -h github.com >/dev/null 2>&1
}

check_origin_read() {
  git ls-remote --heads origin >/dev/null 2>&1
}

check_origin_push() {
  git push --dry-run origin HEAD >/dev/null 2>&1
}

echo "Client agent access check"
echo "Repo: $(git rev-parse --show-toplevel)"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Origin: $(git remote get-url origin 2>/dev/null || echo 'none')"
echo

if [ "$CHECK_GIT_CLEAN" = "1" ]; then
  run_check "git status clean" is_git_clean
else
  if is_git_clean; then
    echo "[ok] git status clean"
  else
    warn "git status is dirty (set CHECK_GIT_CLEAN=1 to require clean state)"
  fi
fi

echo
if command -v gh >/dev/null 2>&1; then
  run_check "gh auth status" check_gh_auth
else
  warn "gh not installed"
fi

echo
run_check "origin read access (git ls-remote)" check_origin_read
run_check "origin write access (git push --dry-run)" check_origin_push

echo
if [ -n "$UPSTREAM_PRIVATE_REPO" ]; then
  echo "[info] checking upstream private repo: $UPSTREAM_PRIVATE_REPO"
  if git ls-remote --heads "$UPSTREAM_PRIVATE_REPO" >/dev/null 2>&1; then
    echo "[ok] upstream private repo read access"
  else
    echo "[fail] upstream private repo read access"
    CHECK_FAIL=1
  fi
else
  echo "[info] set UPSTREAM_PRIVATE_REPO to validate private core repo access"
fi

echo
if [ "$CHECK_FAIL" -eq 0 ]; then
  echo "All critical access checks passed."
  exit 0
fi

echo "Access check failed."
echo "Fixes:"
echo "1) Cursor Dashboard > Integrations > GitHub: grant private repo access."
echo "2) Cursor Cloud Agent Environment: use multi-repo for cross-repo work."
echo "3) Start a new cloud-agent run after changing access."
exit 1
