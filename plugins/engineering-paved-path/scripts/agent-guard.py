#!/usr/bin/env python3
"""PreToolUse guard for plugin subagents.

Plugin agents ignore frontmatter `hooks`, so a plugin enforces what its agents may do from its
own hooks/hooks.json. That hook fires for every agent and for the main session; this script acts
only for the agents named on its command line and exits silently for everything else.

Usage (from hooks.json):
  python3 "${CLAUDE_PLUGIN_ROOT}/scripts/agent-guard.py" --agent plan-verifier=readonly ...

An agent matches when the hook input's `agent_type` equals `<name>` or ends with `:<name>`
(plugin agents are reported as `<plugin>:<name>`).

Profiles:
  readonly  no Write/Edit/MultiEdit/NotebookEdit; Bash limited to read-only git and the
            project's check commands from .claude/agent-guard.json
  specs     writes only to Markdown under a `specs/` directory; no Bash
  planner   no writes, no Bash

A denial is printed as a PreToolUse JSON decision. Malformed input for a guarded agent denies.
No network access, no writes.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path

WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
PROFILES = {"readonly", "specs", "planner"}

# Characters that chain, pipe, redirect or expand in a shell. A guarded agent runs one plain
# command per call.
SHELL_META = re.compile(r"[;&|`<>]|\$\(|\$\{|\n")

GIT_READ = {
    "diff", "log", "show", "status", "blame", "merge-base", "rev-parse", "ls-files",
    "grep", "cat-file", "branch", "describe", "shortlog",
}
# -O / --open-files-in-pager make `git grep` run a program.
GIT_WRITE_FLAGS = {"--output", "-o", "-O", "--open-files-in-pager", "--delete", "-d", "-D", "-m", "-M", "-c", "-C", "--set-upstream-to"}


def emit_deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": f"agent-guard: {reason}",
        }
    }))


def parse_agents(argv: list[str]) -> dict[str, str]:
    agents: dict[str, str] = {}
    it = iter(argv)
    for arg in it:
        if arg == "--agent":
            pair = next(it, "")
            name, _, profile = pair.partition("=")
            if name and profile in PROFILES:
                agents[name] = profile
    return agents


def match_profile(agent_type: str, agents: dict[str, str]) -> str | None:
    for name, profile in agents.items():
        if agent_type == name or agent_type.endswith(":" + name):
            return profile
    return None


def project_root(data: dict) -> Path:
    root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or "."
    return Path(root).resolve()


def check_commands(root: Path) -> list[list[str]]:
    cfg = root / ".claude" / "agent-guard.json"
    try:
        raw = json.loads(cfg.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    cmds = raw.get("checkCommands", []) if isinstance(raw, dict) else []
    out: list[list[str]] = []
    for c in cmds:
        if isinstance(c, str):
            try:
                toks = shlex.split(c)
            except ValueError:
                continue
            if toks:
                out.append(toks)
    return out


def git_read_only(tokens: list[str]) -> bool:
    args = tokens[1:]
    # Skip `-C <dir>` style global options.
    while args and args[0] in ("-C", "--no-pager"):
        args = args[2:] if args[0] == "-C" else args[1:]
    if not args or args[0] not in GIT_READ:
        return False
    sub, rest = args[0], args[1:]
    if sub == "branch":
        # Listing only: a positional argument would create a branch.
        return all(a in ("--list", "-a", "-r", "--show-current", "-v", "-vv") for a in rest)
    return not any(a.split("=", 1)[0] in GIT_WRITE_FLAGS or a.startswith("-O") for a in rest)


def bash_allowed(command: str, root: Path) -> tuple[bool, str]:
    if SHELL_META.search(command):
        return False, "chained, piped, redirected or substituted commands are not allowed; run one plain command"
    try:
        tokens = shlex.split(command)
    except ValueError:
        return False, "command could not be parsed"
    if not tokens:
        return False, "empty command"
    if tokens[0] == "git":
        if git_read_only(tokens):
            return True, ""
        return False, "only read-only git subcommands are allowed"
    for prefix in check_commands(root):
        if tokens[: len(prefix)] == prefix:
            return True, ""
    return False, (
        "command is not a read-only git command or one of the project's check commands "
        "(declare them in .claude/agent-guard.json as checkCommands)"
    )


def spec_path_allowed(file_path: str, root: Path) -> bool:
    if not file_path:
        return False
    p = Path(file_path)
    if not p.is_absolute():
        p = root / p
    try:
        rel = p.resolve().relative_to(root)
    except ValueError:
        return False
    parts = rel.parts
    return rel.suffix == ".md" and "specs" in parts[:-1] and ".." not in parts


def decide(data: dict, agents: dict[str, str]) -> str | None:
    """Return a denial reason, or None to stay silent."""
    agent_type = data.get("agent_type") or ""
    if not isinstance(agent_type, str) or not agent_type:
        return None
    profile = match_profile(agent_type, agents)
    if profile is None:
        return None
    tool = data.get("tool_name")
    tool_input = data.get("tool_input")
    if not isinstance(tool, str) or not isinstance(tool_input, dict):
        return "malformed hook input"
    root = project_root(data)

    if tool in WRITE_TOOLS:
        if profile == "specs":
            path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
            if spec_path_allowed(str(path), root):
                return None
            return f"{agent_type} may write only Markdown files under a specs/ directory"
        return f"{agent_type} is read-only"

    if tool == "Bash":
        if profile in ("specs", "planner"):
            return f"{agent_type} may not run shell commands"
        command = tool_input.get("command")
        if not isinstance(command, str):
            return "malformed Bash input"
        ok, reason = bash_allowed(command, root)
        return None if ok else reason

    return None


def main() -> int:
    agents = parse_agents(sys.argv[1:])
    try:
        data = json.load(sys.stdin)
    except ValueError:
        data = None
    if not isinstance(data, dict):
        # Cannot tell who is calling; only deny when every caller is guarded, which never holds.
        return 0
    reason = decide(data, agents)
    if reason:
        emit_deny(reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
