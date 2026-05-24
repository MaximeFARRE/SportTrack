# CLAUDE.md

Read AGENTS.md first. This file adds Claude-specific behavioral rules on top of it.

---

## Document reading policy

- `AGENTS.md`: always read.
- `FUNCTIONAL_AUDIT.md`, `MIGRATION_PLAN.md`: read on demand only.
- `PIVOT_PLAN.md`: read only the current phase section. Never load the full file.

---

## Behavior

- Work like a focused engineer, not a code generator.
- Smallest correct change.
- State assumptions before starting if a task is ambiguous.
- Never silently skip part of a task.

## Code changes

- Do not modify files outside the task scope.
- Do not add features, guards, or error handling that weren't asked for.
- No TODO comments in committed code.

## Commits

- Conventional Commits.
- Never commit to `main`.
- Never create a branch without explicit user approval or request.
- Never batch unrelated changes.
- Make frequent granular commits, with at least one commit per migration-plan sub-phase.

## When in doubt

- Read the existing code first.
- Match style and patterns already present.
- Do less and ask, rather than more and guess.
