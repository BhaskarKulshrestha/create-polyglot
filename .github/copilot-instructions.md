# Copilot Instructions for create-polyglot

Purpose: This repo is a CLI (`bin/index.js`) that scaffolds a polyglot monorepo (Node.js, Python/FastAPI, Go, Spring Boot Java, Next.js frontend) with optional Turborepo or Nx presets, docker assets, and a basic concurrent dev runner.

## Core Architecture
- Single entrypoint: `bin/index.js` (ESM). All behavior (prompting, parsing, filesystem generation, process execution) lives here—there is no internal module layering yet.
- Templates live under `templates/<service>` (node, python, go, spring-boot, frontend). These are copied verbatim; only Spring Boot renames `application.properties.txt` to `application.properties` post-copy.
- Service selection -> array of objects: `{ type, name, port }`. Ports have defaults: frontend 3000, node 3001, go 3002, java 3003, python 3004. Uniqueness is enforced; conflicts abort.
- `--services` flag accepts comma separated specs: `type`, or `type:name`, or `type:name:port`. Example: `--services node api:python:5001 go:web:4000`.
- Preset affects root `package.json` dev script + adds config file (`turbo.json` or `nx.json`). No preset => basic runner (`scripts/dev-basic.cjs`).
- Docker + `compose.yaml` are generated after templates: each service gets a Dockerfile if missing; compose exposes the same internal and external port.

## Key Flows
1. Parse CLI args (commander) -> gather missing info via `prompts` (unless `--yes`).
2. Build `services` list; validate names (reject reserved), ensure port uniqueness.
3. Create directory skeleton: `<project>/apps/*`, `packages/shared`, optional preset config.
4. Write root artifacts: `package.json`, `.eslintrc.cjs`, `.prettierrc`, README, optional git init.
5. Conditionally run `create-next-app` if frontend + `--frontend-generator` (fallback to internal template on failure).
6. Generate Dockerfiles + `compose.yaml` (simple internal YAML function, not an external lib).
7. Install deps unless `--no-install`.

## Project Conventions
- ESM at root (`type: module`). Test runner: Vitest (`npm test` => `vitest run`). Keep tests in `tests/` with `.test.js` naming.
- Single large CLI file is intentional for now; when adding features prefer extracting small helper modules under `bin/` (e.g. `lib/ports.js`) but update imports accordingly.
- All user-visible output uses `chalk` with emoji prefixes; follow existing style for consistency (info cyan/yellow, success green, errors red with leading symbol).
- Interactive defaults when `--yes`: projectName 'app', services ['node'], preset none, packageManager npm, git false.

## Edge Case Handling Already Implemented
- Aborts on invalid service type, duplicate service name, reserved names, invalid port range, or port collision.
- Graceful fallback if `create-next-app` fails (logs warning then copies template).
- Git init failure is non-fatal.
- Dependency install failures log a warning but do not abort scaffold.

## Adding / Modifying Behavior (Examples)
- New service template: create `templates/<newtype>`; add to `allServiceChoices` + defaultPorts + (optional) Dockerfile generation switch + compose mapping.
- Custom flags: Extend commander chain; ensure interactive question only added when flag absent. Add to summary + README if user-relevant.
- Compose enhancements: modify the `composeServices` object; keep network name `app-net` unless a breaking change is intended.

## Dev & Testing Workflow
- Local development: `npm install`, then run CLI directly: `node bin/index.js demo --services node,python --no-install --yes`.
- Run tests: `npm test` (non-watch). To add tests, mirror `tests/smoke.test.js` pattern; use `execa` to run the CLI inside a temp directory. Keep per-test timeout generous (≥30s) for create-next-app scenarios.
- When editing templates, no build step—files are copied verbatim. Ensure new template files are included via `files` array in root `package.json` if adding new top-level folders.

## External Tools & Commands
- `execa` is used for: `create-next-app`, git commands, and root dependency installation. Maintain `stdio: 'inherit'` for scaffold steps that should stream output.
- Avoid spawning raw `child_process` unless streaming multi-process dev tasks (already done in `scripts/dev-basic.cjs`). Prefer `execa` for promise-based control.

## Common Pitfalls to Avoid
- Forgetting to update defaultPorts or Dockerfile switch when adding a service causes incorrect compose or missing Dockerfile.
- Mutating `services` after port uniqueness check without re-validating can introduce collisions—re-run validation if you add dynamic adjustments.
- Adding large binary/template assets outside `templates/` may break packaging (root `files` whitelist).

## Style & Error Messaging
- Use concise, user-facing error messages followed by `process.exit(1)` for hard failures before writing scaffolded output.
- Non-critical failures (git init, install, external generator) should warn and continue.

## Quick Reference
- Entry CLI: `bin/index.js`
- Basic dev runner template: `scripts/dev-basic.cjs`
- Templates root: `templates/`
- Tests: `tests/`
- Workflow pipeline (publish): `.github/workflows/npm-publish.yml` (runs `npm ci && npm test` on release creation, then publishes)

If adding major refactors (e.g., splitting CLI), document new module boundaries here.

## Admin Dashboard & Log Streaming (Updated)
The admin dashboard (`startAdminDashboard` in `bin/lib/admin.js`) now uses a chokidar-powered file watcher for real-time service logs.

### Log Watching Implementation
- Class: `LogFileWatcher` in `bin/lib/logs.js`.
- Dependency added: `chokidar` (installed in root `package.json`).
- Watches each service's `.logs/*.log` files (supports both legacy `apps/<service>` and new `services/<service>` paths).
- Maintains an in-memory cache (`serviceLogsCache`) with latest logs per service (capped to 1000 per service when merging updates).
- Emits events to listeners: `logsUpdated` (with `event: add|change`), `logsCleared` (on file deletion).

### WebSocket Protocol (Simplified)
- Endpoint: `/ws` (still a minimal custom implementation—no external WS library).
- Client sends `{ type: 'start_log_stream', service: <optionalServiceName|null> }` to (re)subscribe.
- Server pushes messages:
	- `log_data`: initial batch (tail 100) for requested service or all services.
	- `log_update`: incremental updates (new lines) as files change.
	- `logs_cleared`: emitted when a log file is deleted (e.g., rotation/cleanup).
	- `error`: watcher or processing failures.

### Removed UI Elements / Behavior
- Manual "Refresh" and "Live Stream" buttons removed; streaming starts automatically on page load.
- No explicit "Start/Stop" toggling—connection auto-reconnects with exponential backoff on disconnect.
- Filtering (service, level, search text) is applied client-side against the cached `allLogsCache`.
- Re-sending `start_log_stream` with a new service filter requests a narrower set without page reload.

### Server-Side Changes
- `globalLogWatcher` initialized when dashboard starts; falls back gracefully if initialization fails.
- `/api/logs` now serves from watcher cache if available (still present for manual export and any non-WS consumers).

### Client-Side Changes (`admin.js` embedded script)
- Removed functions: `fetchLogs`, `toggleLogStream`, `stopLogStream`, `updateStreamButton`, incremental DOM `appendLogs` logic.
- Added in-memory `allLogsCache` and `applyClientFilters()` for dynamic filtering without refetch.
- Reconnect logic retains filters by re-sending latest `start_log_stream` payload on open.

### Considerations / Future Enhancements
- Potential optimization: send only new log line(s) instead of array (currently small overhead acceptable).
- Add backend endpoint for clearing logs (currently UI shows confirmation but warns unimplemented).
- Could expose a `since` param in WebSocket start message for time-based tailing.
- Log rotation: `cleanupOldLogs` keeps most recent 10 daily files; watcher handles file add/delete events transparently.

### Pitfalls to Avoid When Extending
- If introducing batching: ensure not to stall UI; prefer immediate push for smaller latency.
- When adjusting max cache size, reflect limits both server-side (merge logic) and client-side (slice for rendering).
- Avoid blocking operations in watcher event handler; heavy parsing should be deferred if logs grow large.

### Testing Notes
- Existing Vitest suite did not reference removed buttons; no test changes required.
- For new tests: simulate writing to `.logs/<date>.log` and assert WebSocket `log_update` is received (could add an integration test harness later).

Update this section if log streaming protocol or watcher boundaries change.

## CLI Usage Summary (Reference)
For detailed, user-facing examples see the README (search for "Quick Start", "Commands"). This section is a concise operator guide.

Primary commands:
- `create-polyglot init <name> [flags]` – Scaffold a new workspace. Flags: `-s, --services`, `--preset <turbo|nx|none>`, `--package-manager <npm|pnpm|yarn|bun>`, `--git`, `--yes`, `--frontend-generator`.
- `create-polyglot add service <name> --type <node|python|go|java|frontend> [--port <p>] [--yes]` – Append a service to an existing workspace.
- `create-polyglot dev [--docker]` – Local dev runner (frontend + node by default). With `--docker` delegates to Docker Compose for all services.
- `create-polyglot hot [--services a,b] [--dry-run]` – Unified hot reload orchestrator across selected services.
- `create-polyglot admin [--port <p>] [--open false]` – Start admin dashboard (status + real-time logs).
- `create-polyglot logs [<service>] [--tail <n>] [--level <error|warn|info|debug>] [--filter <regex>] [--since <relative|ISO>] [--clear]` – CLI log viewing / maintenance.

Behavior notes:
- `init` writes `polyglot.json` manifest which powers all subsequent commands.
- Port uniqueness enforced during `init` and `add service`; collisions abort early.
- `hot` uses language-specific runners (e.g. Node via `nodemon` or custom; Python via `uvicorn`; Go recompile; Java Spring Boot restart) aggregated in a single multiplexed output.
- `admin` now auto-streams logs (no refresh or manual toggle) leveraging `LogFileWatcher` + WebSocket events described above.
- `logs --clear` performs per-service log directory cleanup (invokes helper in `logs.js`). Non-critical failures warn.
- `dev --docker` assumes generated Dockerfiles; if one is missing for a service, generation logic from scaffold covers it.

Error handling conventions:
- Hard validation failures → red emoji + `process.exit(1)` prior to partial writes.
- Soft failures (git init, dependency install, external generators) log yellow warning and continue.

Testing guidance:
- Prefer `execa` for invoking CLI within tests; set generous timeouts (≥30s) for Next.js or Java operations.
- For admin log stream tests, you can simulate writes to `.logs/<date>.log` then assert WebSocket `log_update` message.

When extending:
- Add new command flags in `bin/index.js` commander chain; reflect in README and this summary.
- Keep README examples authoritative; this section should remain concise.

---
Feedback: Let me know if any sections need more depth (e.g., Docker generation, prompt flow, adding new presets) or if emerging conventions should be captured.
