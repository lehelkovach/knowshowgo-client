#!/usr/bin/env python3
"""Smoke-test the .AGENT persistence and audit layout for this repository."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / ".AGENT"

REQUIRED = [
    "README.md",
    "package.json",
    ".AGENT/agent.md",
    ".AGENT/agent-action-log.md",
    ".AGENT/agent-run.md",
    ".AGENT/agent-run-once.md",
    ".AGENT/dev-notes.md",
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    for path in REQUIRED:
        assert_true((ROOT / path).is_file(), f"missing required file: {path}")

    agent_prompt = read(AGENT_DIR / "agent.md")
    assert_true("## Base-Agent Section" in agent_prompt, "agent.md missing base section")
    assert_true(
        "#### Below: Repository-Specific Directions" in agent_prompt,
        "agent.md missing repo-specific section",
    )
    assert_true(
        "KSG client SDK" in agent_prompt,
        "agent.md missing KSG repo-specific directions",
    )

    runbook = read(AGENT_DIR / "agent-run.md")
    assert_true("Release Readiness Checks" in runbook, "runbook missing release checks")

    dev_notes = read(AGENT_DIR / "dev-notes.md")
    assert_true("Observed Release Stats" in dev_notes, "dev notes missing release stats")

    action_log = read(AGENT_DIR / "agent-action-log.md")
    assert_true("Import agent boilerplate" in action_log, "action log missing import entry")

    print("PASS: .AGENT architecture smoke test")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
