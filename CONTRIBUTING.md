# Contributing

## Branches

| Prefix | Use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Tooling, config, cleanup |
| `docs/` | Documentation only |
| `test/` | Tests only |

Never push directly to `main`.

## Commits

Format: `type: short description in imperative mood`

```
feat: add weekly comparison endpoint
fix: handle missing athlete token on sync
chore: add httpx to requirements
```

One logical change per commit. Do not batch unrelated changes.

## Pull requests

- Keep PRs small and focused on one concern.
- Describe what changed and why, not how.
- Run `pytest` before opening a PR. All tests must pass.
- If your change affects setup or usage, update README.md.

## Architecture

See [AGENTS.md](AGENTS.md) for the layer rules and engineering constraints.
