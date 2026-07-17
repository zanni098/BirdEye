# Contributing to BirdEye

Thanks for helping unify the aviary. 🦅

## Setup

```bash
git clone https://github.com/zanni098/BirdEye.git
cd BirdEye
npm install
npm test              # 62 tests should pass
npm run typecheck
npm run demo          # dashboard at http://127.0.0.1:4477 with demo data
```

Node ≥ 23.6 required (native TypeScript execution — no build step for packages).

## Code rules

- **Erasable TypeScript only** (`erasableSyntaxOnly` is enforced): no enums, no constructor parameter properties, no namespaces.
- Relative imports include the `.ts` extension (Node type-stripping needs it).
- Adapters are **read-only** and must never throw on weird input — use the helpers in `packages/adapters/src/fs-utils.ts`.
- Credential **values never enter any record** — key names only. Tests should assert this.
- Every change ships with tests (`packages/*/test`), driven by synthetic fixtures — never real personal data.

## Adding a harness adapter (the most wanted PR)

1. Copy `packages/adapters/src/adapters/claude-code.ts` as your template.
2. Implement `candidatePaths(ctx)` (home-relative probe dirs) and `scan(ctx, configPath)`.
3. Add a synthetic fixture tree under `packages/adapters/test/fixtures/<kind>/home/…`.
4. Add a test mirroring `packages/adapters/test/adapters.test.ts` — assert counts *and* key field values, and that no secret values leak.
5. Register it in `packages/adapters/src/index.ts` and add the kind to `HarnessKind` in `packages/core/src/types.ts` (plus a signature color in the dashboard's `types.ts`/`theme.css`).
6. If the harness has a headless CLI, wire `dispatch` and add a registration snippet in `packages/mcp/src/register-snippets.ts`.

Run `npm test && npm run typecheck` and open a PR with a short note on how you verified the layout (docs link or a redacted listing of the real config dir).

## Commit style

Conventional commits: `feat(adapters): add windsurf adapter`, `fix(server): …`, `docs: …`.
