# Client Agent Bootstrap

If a client agent cannot sync with a private upstream repo, run this from repo root:

```bash
./scripts/agent-access-check.sh
```

To explicitly check private upstream access:

```bash
UPSTREAM_PRIVATE_REPO=git@github.com:lehelkovach/<core-repo>.git ./scripts/agent-access-check.sh
```

If checks fail:

1. Cursor Dashboard -> Integrations -> GitHub: grant the private upstream repo.
2. Cursor Cloud Agent Environments -> use a multi-repo environment.
3. Start a new cloud-agent run so updated permissions are picked up.
