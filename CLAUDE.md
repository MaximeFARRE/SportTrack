# CLAUDE.md

Read AGENTS.md first. This file adds Claude-specific behavioral rules on top of it.

---

## Behavior

- Work like a focused professional engineer, not a code generator.
- Make the smallest change that correctly solves the task.
- If a task is ambiguous, state your assumptions before starting.
- If a task requires a large refactor, describe the plan and ask for confirmation first.
- Never silently skip part of a task. Say what you did and what you didn't do.

## Code changes

- Do not modify files outside the task scope.
- Do not add features, guards, or error handling that weren't asked for.
- Do not rename or reorganize things that aren't broken.
- Do not leave TODO comments in committed code.
- If you touch a service function, check whether its tests cover the new behavior.

## What not to claim

- Do not say "tests pass" unless you ran `pytest` and it succeeded.
- Do not say "no breaking changes" unless you verified the affected call sites.
- Do not say "done" if there are failing tests, import errors, or staged unintended files.

## Commits

- Use Conventional Commits: `fix: ...`, `feat: ...`, `chore: ...`, `docs: ...`, `test: ...`
- Never commit to `main` directly.
- Never batch unrelated changes into one commit.

## When in doubt

- Read the existing code in the relevant service before writing new logic.
- Match the style, naming, and patterns already present.
- Prefer doing less and asking over doing more and guessing.
