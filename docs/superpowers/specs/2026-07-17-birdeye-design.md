# BirdEye — Design Spec

**Date:** 2026-07-17
**Status:** Approved by user (full autonomous build authorized)
**Repo:** `zanni098/BirdEye` (public, MIT)

## Problem

People who use multiple AI agent harnesses (Claude Code, Claude Desktop, Codex, opencode, openclaw, Zcode, Gemini CLI, Cursor, Continue, …) suffer from fragmentation:

1. Each harness has its own sessions, memories, MCP servers, plugins, skills, and routines. Nothing is shared.
2. Memory import/export, where it exists at all, is per-harness and incompatible.
3. Giving agents access to services (GitHub, etc.) means configuring auth per harness — N copies of every credential.
4. No visibility into which harness has access to what, or how much usage/tokens each consumes.
5. No single place to assign work to different harnesses and have them cooperate on a task.

## Solution

BirdEye is a **free, open-source, local-first hub**: one daemon on `127.0.0.1` + one interactive dashboard + one MCP gateway that every harness joins. The flagship feature is **collective memory** with an interactive **memory graph**.

### Decisions locked in (user-approved)

| Decision | Choice |
|---|---|
| Architecture | Local-first hub. No cloud. Secrets never leave the machine. |
| Auth model | MCP gateway + encrypted local vault, plus `sync-env` writer for non-MCP needs. |
| v1 adapters | Claude Code, Claude Desktop, Codex, opencode, openclaw, Zcode, Gemini, Cursor, Continue (+ generic detector). |
| Orchestration | Headless CLI dispatch (`claude -p`, `codex exec`, `opencode run`, `gemini -p`, …) with streaming output; copy-paste briefing for GUI-only harnesses. |
| Publish | Public GitHub repo `zanni098/BirdEye`, MIT license, end-to-end without further gates. |

## Architecture

TypeScript monorepo (npm workspaces), zero native dependencies.

```
packages/core        domain model, JSON-file store (~/.birdeye), memory graph builder,
                     vault (AES-256-GCM), dedup, marker-block sync-back engine
packages/adapters    9 harness adapters + generic detector; each read-only + isolated
packages/server      Hono daemon: REST API, WebSocket live updates, static dashboard,
                     dispatcher (spawns harness CLIs), MCP gateway (HTTP transport)
packages/mcp         stdio MCP entry (birdeye-mcp) via @modelcontextprotocol/sdk
packages/cli         `birdeye` CLI: up | scan | sync-env | register <harness> | dispatch
apps/dashboard       Vite + React SPA: Aviary, Memory Graph (d3-force), Sessions,
                     Arsenal, Access, Usage, Missions
```

### Data flow

1. `birdeye scan` → each adapter reads its harness's config dir → normalized records → core store at `~/.birdeye/`.
2. Memory importers normalize native memories into canonical `MemoryRecord`s (content-hash + fuzzy dedup) → graph builder derives nodes/edges.
3. Sync-back renders a merged memory pack and writes it inside `<!-- BIRDEYE:START/END -->` marker blocks in each harness's context file (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, …). Idempotent; never touches content outside markers.
4. MCP gateway exposes: `memory_search`, `memory_save`, `task_list`, `task_claim`, `task_update`, plus vault-backed connector tools. Any harness registers with one config line.
5. Dashboard talks to the daemon over REST + WebSocket; Missions dispatches tasks through the dispatcher which spawns harness CLIs and streams stdout.

### Domain model (core records)

- `Harness` — id, name, kind, configPath, detected, health, warnings
- `SessionRecord` — harness, id, title, startedAt, lastActiveAt, messageCount?, project?
- `MemoryRecord` — id, title, body, type, sourceHarness, sourceFile, createdAt, tags[], links[], contentHash
- `SkillRecord` / `PluginRecord` / `McpServerRecord` / `AgentRecord`
- `EnvKeyRecord` — key NAME + which harness config holds it (values never stored in inventory)
- `UsageRecord` — harness, period, tokens?, costUsd?, source ("logged" | "estimated" | "unknown")
- `TaskRecord` — id, title, briefing, status, assignedHarness?, runs[] (dispatch output)
- Graph: `GraphNode` (memory | entity | tag | harness), `GraphEdge` (link | mentions | topic | source)

### Security

- Vault encrypted at rest (AES-256-GCM, scrypt-derived key from passphrase; machine-key fallback).
- Daemon binds `127.0.0.1` only. Secret values redacted in every API response.
- Adapters are read-only; the only writers are sync-back (marker blocks) and `sync-env`/`register` (explicit commands).
- No telemetry, no network calls except user-invoked connector tools.

### Error handling

- Every adapter returns `{ ok, records, warnings[] }`; a throwing adapter is caught by the scanner and reported as a failed card — one broken harness never breaks the scan.
- Dispatcher surfaces CLI-not-found / non-zero exits on the task run with full stderr.
- Store writes are atomic (write temp + rename).

### Testing

Vitest. Fixture directories simulating each harness's layout drive adapter unit tests. Core tests: dedup, graph builder, marker-block sync (idempotency + preservation of user content), vault round-trip. API integration tests against the daemon. CI via GitHub Actions.

## Honest v1 limits (documented in README)

- Usage stats are best-effort: rich where the harness logs locally (Claude Code, Codex), honest "unknown" elsewhere.
- Cursor/Continue adapters are shallower (app-internal storage).
- Dispatch requires the harness CLI on PATH.
- Cross-harness collaboration is via shared memory + shared task queue, not automatic result-chaining (v2).
