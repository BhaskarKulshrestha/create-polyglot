# Getting Started

## Install
```bash
npm install -g create-polyglot
```

## Scaffold a Project
```bash
create-polyglot init my-org -s node,python,go,java,frontend --git --yes
```
If you omit flags (or drop `--yes`), the wizard prompts for missing values and lets you rename services + adjust ports.

## Directory Layout
```
my-org/
  services/
    node/ python/ go/ java/ frontend/
  packages/shared
  polyglot.json
  compose.yaml
  package.json
```

## Dev Workflow
```bash
cd my-org
npm run dev     # starts Node-based dev scripts (scans services/)
```

Non-Node services (Python/Go/Java) start manually or via Docker compose:
```bash
docker compose up --build
```

## Add a Service Later
```bash
create-polyglot add service reporting --type python --port 5050
```

## Add a Plugin
```bash
create-polyglot add plugin auth
```

## Hot Reload

Enable automatic restart on file changes:

```bash
create-polyglot hot
```

This monitors all services and automatically restarts them when files change.

## Admin Dashboard

Launch the admin dashboard to manage services:

```bash
create-polyglot admin
```

The dashboard provides:
- Real-time log streaming
- Service start/stop/restart controls
- Health monitoring
- WebSocket updates

## Next Steps

- Learn about [Presets](/guide/presets) (Turborepo, Nx, Basic)
- Explore [Docker & Compose](/guide/docker) workflows
- Create [Shared Libraries](/guide/shared-libraries) for code reuse
- Extend with [Plugins](/plugin-system)
- Read the [CLI Reference](/cli/) for all commands

## Common Commands

```bash
# List all services
create-polyglot services

# View service logs
create-polyglot logs <service-name>

# Start specific service
create-polyglot start <service-name>

# Stop specific service
create-polyglot stop <service-name>

# Remove a service
create-polyglot remove service <service-name>

# Add a shared library
create-polyglot add lib <name> --type python

# List all libraries
create-polyglot libraries
```

## Troubleshooting

If you encounter issues:

1. Check the [Troubleshooting Guide](/guide/troubleshooting)
2. Verify Node.js version: `node --version` (should be 18+)
3. Check for port conflicts: `lsof -i :<port>`
4. View logs: `create-polyglot logs --all`
5. Enable debug mode: `DEBUG=* create-polyglot init test`

## Get Help

- 📖 Read the [complete documentation](/guide/)
- 💬 Ask in [GitHub Discussions](https://github.com/kaifcoder/create-polyglot/discussions)
- 🐛 Report bugs in [GitHub Issues](https://github.com/kaifcoder/create-polyglot/issues)
