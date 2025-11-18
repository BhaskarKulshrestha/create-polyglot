---
layout: home
hero:
  name: create-polyglot
  text: Polyglot Monorepo Scaffolder
  tagline: Generate Node, Python, Go, Java Spring Boot & Next.js services in one workspace with hot reload, shared libraries, and Docker support.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: CLI Reference
      link: /cli/
    - theme: alt
      text: View on GitHub
      link: https://github.com/kaifcoder/create-polyglot
features:
  - icon: 🚀
    title: Multi-Language Support
    details: Spin up services across Node.js, Python/FastAPI, Go, Java Spring Boot & Next.js frontend with support for modern frameworks like Remix, Astro, and SvelteKit.
  - icon: 🔄
    title: Hot Reload Aggregator
    details: Unified hot reload system that automatically restarts Node, Python (uvicorn), Go, Java Spring Boot services, and provides HMR for Next.js and other frontends.
  - icon: 📦
    title: Shared Libraries
    details: Create and manage shared code across services with language-specific libraries for Python packages, Go modules, and Java JARs.
  - icon: 🎯
    title: Preset Aware
    details: Choose between Turborepo or Nx for advanced monorepo orchestration, or use the zero-config basic runner for simple projects.
  - icon: 🐳
    title: Docker Ready
    details: Auto-generated Dockerfiles & docker-compose.yaml for rapid container workflows. Start all services with a single command.
  - icon: 🔌
    title: Extensible Plugin System
    details: Powerful plugin architecture with lifecycle hooks to customize and extend the CLI workflow. Create plugins to integrate with external tools.
  - icon: 📊
    title: Admin Dashboard
    details: Real-time log streaming dashboard with file watching and WebSocket updates. Monitor all your services from a single interface.
  - icon: ⚙️
    title: Service Management
    details: Add, remove, and manage services post-initialization. Start, stop, restart, and view logs for individual services with granular control.
---

## Quick Start

```bash
# Install globally
npm install -g create-polyglot

# Create a new project with interactive wizard
create-polyglot init my-org

# Or skip prompts with flags
create-polyglot init my-org -s node,python,go,frontend --preset turborepo --git --yes

# Start development
cd my-org
create-polyglot dev

# Enable hot reload for all services
create-polyglot hot

# Launch admin dashboard
create-polyglot admin
```

## Why create-polyglot?

Building a production-ready polyglot microservice environment typically requires:
- ✅ Repetitive boilerplate across multiple languages
- ✅ Manual Docker configuration and orchestration
- ✅ Complex monorepo tooling setup
- ✅ Service discovery and management infrastructure
- ✅ Shared code patterns and utilities

**create-polyglot automates all of this**, giving you:
- 🎯 Consistent folder layout & service naming
- 📝 Battle-tested language starter templates
- 🔧 Pre-configured monorepo orchestration (Turborepo/Nx)
- 🐳 Auto-generated Dockerfiles & compose configurations
- 🔌 Extensible plugin system for custom workflows
- 📊 Centralized configuration via `polyglot.json`

Perfect for prototyping architectures, onboarding teams faster, or creating reproducible demos and PoCs.

## What's New in v1.19

- 🔥 **Unified Hot Reload System** - Automatic restart/HMR across all service types
- 📊 **Admin Dashboard** - Real-time log streaming with WebSocket support
- 🔌 **Enhanced Plugin System** - Comprehensive lifecycle hooks and external plugin support
- 📦 **Shared Libraries** - Language-specific library generation (Python, Go, Java)
- 🎛️ **Service Controls** - Granular start/stop/restart/logs commands
- 🚀 **Modern Frontend Support** - Remix, Astro, and SvelteKit templates
- ⚡ **Performance Improvements** - Faster scaffolding and better error handling

## Documentation Structure

<div class="vp-doc">

### 📚 [Guide](/guide/)
Learn the fundamentals and best practices:
- [Getting Started](/guide/getting-started) - Installation and first steps
- [Presets](/guide/presets) - Turborepo, Nx, or Basic runner
- [Docker & Compose](/guide/docker) - Container workflows
- [Shared Libraries](/guide/shared-libraries) - Cross-service code reuse
- [Frontend Frameworks](/guide/frontend-frameworks) - Remix, Astro, SvelteKit

### 💻 [CLI Reference](/cli/)
Complete command documentation:
- [Usage](/cli/) - All available commands
- [Admin Dashboard](/cli/admin) - Dashboard features and usage
- [Flags](/cli/flags) - Command-line options

### 🔧 [Configuration](/configuration/polyglot-json)
Project configuration reference:
- [polyglot.json](/configuration/polyglot-json) - Schema and options

### 📝 [Templates](/templates/)
Language-specific template details:
- [Node.js](/templates/node) - Express API template
- [Python](/templates/python) - FastAPI template
- [Go](/templates/go) - net/http template
- [Java](/templates/java) - Spring Boot template
- [Frontend](/templates/frontend) - Next.js template

### ⚡ [Features](/logs-feature)
Advanced features:
- [Service Logs](/logs-feature) - Log management
- [Plugin System](/plugin-system) - Extensibility
- [Service Controls](/service-controls-feature) - Process management
- [Hot Reload](/guide/getting-started#hot-reload) - Auto-restart/HMR

</div>

## Community & Support

- 💬 [GitHub Discussions](https://github.com/kaifcoder/create-polyglot/discussions) - Ask questions and share ideas
- 🐛 [Issue Tracker](https://github.com/kaifcoder/create-polyglot/issues) - Report bugs and request features
- 📖 [Contributing Guide](https://github.com/kaifcoder/create-polyglot/blob/main/CONTRIBUTING.md) - Help improve the project
- ⭐ [Star on GitHub](https://github.com/kaifcoder/create-polyglot) - Show your support

## License

MIT Licensed - Free and open source forever.
