<div align="center">

# create-polyglot

[![npm version](https://img.shields.io/npm/v/create-polyglot.svg)](https://www.npmjs.com/package/create-polyglot)
[![npm downloads](https://img.shields.io/npm/dw/create-polyglot.svg)](https://www.npmjs.com/package/create-polyglot)
[![License](https://img.shields.io/github/license/kaifcoder/create-polyglot.svg)](https://github.com/kaifcoder/create-polyglot/blob/main/LICENSE)

**Scaffold a modern polyglot microservices monorepo in seconds.**

Build complete applications using multiple programming languages (Node.js, Python, Go, Java, Next.js) in one organized workspace with Docker support, hot reload, and shared libraries.

[Quick Start](#quick-start) • [Features](#features) • [Commands](#commands) • [Documentation](./docs/index.md)

</div>

---

## What is create-polyglot?

**create-polyglot** is a CLI tool that scaffolds production-ready polyglot microservice projects. It automates the tedious setup work of creating a multi-language development environment, letting you focus on building features instead of configuring boilerplate.

### Why Use It?

Building a polyglot architecture normally requires:
- Creating consistent folder structures across services
- Writing Dockerfiles for each language
- Configuring docker-compose with proper networking
- Setting up monorepo tooling (Turborepo/Nx)
- Creating shared package structures
- Managing port allocations and health checks

**create-polyglot does all of this automatically** with a single command.

### Perfect For:
- 🚀 **Rapid prototyping** - Test architectural ideas quickly
- 🎓 **Learning projects** - Explore multiple languages in a structured environment
- 👥 **Team onboarding** - Give developers a standardized starting point
- 🏗️ **Microservices** - Scaffold complete service-oriented architectures

---

## Features

- 🚀 **Rapid Scaffolding** - Generate complete polyglot monorepos with Node.js, Python (FastAPI), Go, Java (Spring Boot), Next.js, Remix, Astro, and SvelteKit
- 🧩 **Flexible Presets** - Choose between Turborepo, Nx, or a basic runner for task orchestration
- 🐳 **Docker Integration** - Auto-generated Dockerfiles and docker-compose.yaml with proper networking and port mappings
- 🔥 **Unified Hot Reload** - Single command (`create-polyglot hot`) for auto-restart/HMR across all services
- 📦 **Shared Libraries** - Language-specific shared packages (Python modules, Go packages, Java libraries)
- 🛠️ **Extensible** - Add/remove services, plugins, and libraries post-initialization
- 📝 **Configuration-Driven** - Central `polyglot.json` manifest for all project settings
- 🎨 **Developer Experience** - Colorized logs, health checks, and real-time monitoring
- 🔌 **Plugin System** - Extensible lifecycle hooks for custom scaffolding logic
- ✅ **Safety Checks** - Port collision detection, reserved name validation, graceful error handling

---

## Quick Start

### Step 1: Install create-polyglot

Open your terminal (command line) and run:

```bash
npm install -g create-polyglot
```

*Don't have npm? You'll need to [install Node.js](https://nodejs.org/) first.*

### Step 2: Create Your Project

Create a new project called "my-project" with Node.js and Python services:

```bash
create-polyglot init my-project --services node,python --yes
```

That's it! Your project is ready.

### Step 3: Start Your Project

Go into your project folder and start everything:

```bash
cd my-project
create-polyglot dev
```

Your services are now running! 🎉

---

## Supported Languages & Frameworks

| Technology | Type | Template Includes | Typical Use Cases |
|------------|------|-------------------|-------------------|
| **Node.js** | Backend | Express server, hot reload | REST APIs, microservices, real-time apps |
| **Python** | Backend | FastAPI, uvicorn, async support | ML services, data processing, scientific computing |
| **Go** | Backend | net/http, high-performance setup | High-throughput services, system tools |
| **Java** | Backend | Spring Boot, Maven, production-ready | Enterprise applications, legacy integration |
| **Next.js** | Frontend | App router, React 18+, TypeScript | Full-stack web applications, SSR/SSG |
| **Remix** | Frontend | Loaders, actions, nested routing | Progressive web apps, enhanced forms |
| **Astro** | Frontend | Island architecture, content focus | Documentation sites, marketing pages |
| **SvelteKit** | Frontend | Svelte 4+, file-based routing | Interactive UIs, lightweight apps |

### Mix and Match Example:
```bash
# Create a complete stack: API gateway (Node), ML service (Python), data service (Go), UI (Next.js)
create-polyglot init my-app --services node,python,go,frontend --preset turborepo --git --yes
```

---

## Basic Commands

Once you've created your project, here are the main commands you'll use:

### Starting Your Project
```bash
create-polyglot dev
```
*Starts all your services and shows their logs*

### Adding a New Service
```bash
create-polyglot add service payments --type node
```
*Adds a new Node.js service called "payments"*

### Removing a Service
```bash
create-polyglot remove service payments
```
*Removes the "payments" service from your project*

### Listing Your Services
```bash
create-polyglot services
```
*Shows all services in your project*

---

## Generated Project Structure

```
my-project/
├── services/                    # Microservices directory
│   ├── node/                   # Express REST API
│   │   ├── src/index.js       # Entry point with health check endpoint
│   │   ├── package.json       # Dependencies + dev script
│   │   └── Dockerfile         # Multi-stage production build
│   ├── python/                # FastAPI service
│   │   ├── app/main.py       # Async endpoints with uvicorn
│   │   ├── requirements.txt  # Python dependencies
│   │   └── Dockerfile        # Optimized Python image
│   ├── go/                    # Go HTTP server
│   │   ├── main.go           # High-performance handler
│   │   ├── go.mod            # Go modules
│   │   └── Dockerfile        # Distroless production image
│   ├── java/                  # Spring Boot application
│   │   ├── src/              # Java source tree
│   │   ├── pom.xml           # Maven configuration
│   │   └── Dockerfile        # JVM optimized build
│   └── frontend/              # Next.js application
│       ├── app/              # App router pages
│       ├── package.json      # Frontend dependencies
│       └── Dockerfile        # Node.js container
├── packages/
│   ├── shared/                # Node.js shared utilities
│   └── libs/                  # Language-specific libraries
│       ├── python/           # Shared Python package
│       ├── go/               # Go module
│       └── java/             # Maven library
├── plugins/                   # Custom lifecycle hooks
├── gateway/                   # API gateway (optional)
├── infra/                     # Infrastructure configs
├── compose.yaml              # Docker Compose orchestration
├── polyglot.json             # Project manifest & configuration
├── turbo.json / nx.json      # Monorepo tooling (if preset chosen)
└── package.json              # Root workspace configuration
```

**Key Files:**
- `polyglot.json` - Single source of truth for services, ports, and configuration
- `compose.yaml` - Production-ready Docker setup with health checks and networking
- `turbo.json` or `nx.json` - Build cache and task pipelines (optional)

---

## Common Use Cases

### 1. Learning Multiple Languages
Perfect for students or developers learning new programming languages. Each service is a working example you can study and modify.

### 2. Building a Full Application
Create a complete app with:
- A Python service for data processing
- A Node.js service for your API
- A Next.js frontend for your website

### 3. Team Projects
Give your team a standardized starting point where everyone knows where to find things.

### 4. Quick Prototypes
Test ideas quickly without spending hours on setup.

---

## CLI Options & Flags

### Interactive vs Non-Interactive

**Interactive Mode** (recommended for first-time users):
```bash
create-polyglot init my-project
```
The wizard prompts for:
- Number of services to create
- Type for each service (Node/Python/Go/Java/Frontend)
- Custom names and port overrides
- Preset selection (Turborepo/Nx/Basic)

**Non-Interactive Mode** (CI/CD, scripting):
```bash
create-polyglot init my-project \
  --services node,python,go,frontend \
  --preset turborepo \
  --git \
  --yes
```

### Init Flags

| Flag | Description | Example |
|------|-------------|---------|
| `-s, --services <list>` | Comma-separated service types | `--services node,python,go,java,frontend` |
| `--preset <name>` | Monorepo tool: `turborepo`, `nx`, or `basic` | `--preset turborepo` |
| `--package-manager <pm>` | npm, pnpm, yarn, or bun | `--package-manager pnpm` |
| `--git` | Initialize git repository with initial commit | `--git` |
| `--no-install` | Skip dependency installation | `--no-install` |
| `--frontend-generator` | Use `create-next-app` for Next.js (fallback to template) | `--frontend-generator` |
| `--with-actions` | Generate GitHub Actions CI workflow | `--with-actions` |
| `--force` | Overwrite existing directory | `--force` |
| `--yes` | Accept all defaults, no prompts | `--yes` |

### Examples

```bash
# Full stack with Turborepo and GitHub Actions
create-polyglot init my-app --services node,python,frontend --preset turborepo --with-actions --git --yes

# Minimal setup with pnpm
create-polyglot init api-services --services node,go --package-manager pnpm --yes

# All languages, interactive port selection
create-polyglot init polyglot-demo --services node,python,go,java,frontend,remix,astro,sveltekit
```

---

## Development Workflow

### Local Development
Start all Node.js and frontend services with colorized logs and health checks:
```bash
create-polyglot dev
```

**How it works:**
- Reads `polyglot.json` to discover services with `dev` scripts
- Spawns concurrent processes with prefixed logs (color-coded)
- Probes `/health` endpoints with 15s timeout
- Displays status: ✓ (ready), ⏳ (starting), ✗ (failed)

**Default ports:**
- Node.js services: 3001, 3002, 3003...
- Python (FastAPI): 3004
- Go: 3005
- Java (Spring Boot): 3006
- Frontend: 3000

### Hot Reload (Unified HMR/Auto-Restart)
```bash
create-polyglot hot [--services <subset>] [--dry-run]
```

Aggregates hot reload across all languages:
- **Node.js**: Watches with nodemon, auto-restarts on file changes
- **Next.js/Remix**: Native HMR (Fast Refresh)
- **Python**: uvicorn auto-reload on .py changes
- **Go**: go run with file watcher, recompile on changes
- **Java**: Spring Boot DevTools hot swap

**Options:**
```bash
# Watch specific services only
create-polyglot hot --services node,python

# Dry run (see commands without executing)
create-polyglot hot --dry-run

# All services with full reload
create-polyglot hot
```

### Docker Compose Mode
Run all services (including Python/Go/Java) via containers:
```bash
create-polyglot dev --docker
```

Executes `docker compose up --build` with:
- Multi-stage Dockerfiles for optimal image sizes
- Shared `app-net` network for inter-service communication
- Volume mounts for development (source code sync)
- Health checks and restart policies

**Stop services:**
```bash
docker compose down
```

---

## Shared Libraries & Cross-Service Code

### Node.js Shared Package
Default `packages/shared` for JavaScript/TypeScript utilities:
```javascript
// packages/shared/index.js
export const greet = (name) => `Hello, ${name}!`;

// services/node/src/index.js
import { greet } from '../../packages/shared';
```

### Language-Specific Libraries

Create shared code for Python, Go, or Java services:

```bash
# Python package (importable across FastAPI services)
create-polyglot add lib common-utils --type python

# Go module (reusable across Go services)
create-polyglot add lib shared-models --type go

# Java library (Maven dependency)
create-polyglot add lib data-types --type java
```

**Generated structures:**

**Python:**
```python
# packages/libs/common-utils/__init__.py
# packages/libs/common-utils/models.py
# packages/libs/common-utils/pyproject.toml
```

**Go:**
```go
// packages/libs/shared-models/shared-models.go
// packages/libs/shared-models/go.mod
```

**Java:**
```java
// packages/libs/data-types/src/main/java/com/example/DataTypes.java
// packages/libs/data-types/pom.xml
```

See [Shared Libraries Guide](./docs/guide/shared-libraries.md) for usage patterns.

---

## Troubleshooting

### "Command not found"
Make sure you installed create-polyglot globally:
```bash
npm install -g create-polyglot
```

### "Port already in use"
Another program is using that port. Either:
- Stop the other program
- Use a different port: `--port 4000`

### Services won't start
Check that you have the language installed:
- Node.js: `node --version`
- Python: `python --version`
- Go: `go version`
- Java: `java -version`

---

## Next Steps

1. **Explore the structure** - Look at the generated files to understand the layout
2. **Modify a service** - Edit files in `services/<name>/` to customize behavior
3. **Add more services** - Use `create-polyglot add service` as your project grows
4. **Read the docs** - Check the [documentation](./docs/index.md) for advanced features

---

## Getting Help

- 📚 **Documentation**: See the [docs folder](./docs/index.md) for detailed guides
- 🐛 **Found a bug?** Open an issue on [GitHub](https://github.com/kaifcoder/create-polyglot/issues)
- 💡 **Have an idea?** We welcome suggestions and contributions!

---

## Advanced Topics

### Plugin System
Extend create-polyglot with custom lifecycle hooks:
```bash
create-polyglot add plugin postgres
```

Generates `plugins/postgres/index.js` with hook skeleton:
```javascript
module.exports = {
  afterInit: async (config) => {
    // Custom logic after project initialization
  }
};
```

See [Plugin System Documentation](./docs/plugin-system.md).

### polyglot.json Configuration
Central manifest driving all operations:
```json
{
  "name": "my-project",
  "preset": "turborepo",
  "packageManager": "pnpm",
  "services": [
    {
      "name": "api",
      "type": "node",
      "port": 3001,
      "path": "services/api"
    }
  ],
  "sharedLibs": [
    {
      "name": "common-utils",
      "type": "python",
      "path": "packages/libs/common-utils",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "plugins": {}
}
```

See [Configuration Reference](./docs/configuration/polyglot-json.md).

### CI/CD Integration
Generated GitHub Actions workflow (with `--with-actions`):
- Triggers on push/PR to main
- Matrix testing across Node versions
- Dependency caching (npm/pnpm/yarn/bun)
- Runs test suite and builds

Extend for Docker publishing, multi-language testing, or deployment.

### Extending Services
Modify generated templates:
- Add middleware, database connections, authentication
- Configure environment variables
- Integrate logging, monitoring, tracing
- Customize Dockerfiles for production optimization

See [Guide: Extending Services](./docs/guide/extending-service.md).

---

## License

This project is open source under the MIT License. Feel free to use it however you like!

---

<div align="center">

**Made with ❤️ to make multi-language development easier**

[GitHub](https://github.com/kaifcoder/create-polyglot) • [NPM](https://www.npmjs.com/package/create-polyglot)
