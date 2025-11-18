# Introduction

`create-polyglot` is a powerful CLI tool for scaffolding modern polyglot microservice monorepos. It automates the creation of production-ready development environments with support for multiple programming languages, containerization, and advanced monorepo tooling.

## What is create-polyglot?

create-polyglot generates a complete microservices workspace that includes:

- **Multi-language services**: Node.js (Express), Python (FastAPI), Go (net/http), Java (Spring Boot), and frontend frameworks (Next.js, Remix, Astro, SvelteKit)
- **Monorepo orchestration**: Optional Turborepo or Nx presets for optimized build pipelines
- **Docker support**: Auto-generated Dockerfiles and docker-compose.yaml for each service
- **Shared libraries**: Language-specific shared code packages (Python, Go, Java)
- **Hot reload system**: Unified hot reload across all service types
- **Plugin architecture**: Extensible lifecycle hooks for custom workflows
- **Admin dashboard**: Real-time log streaming and service management
- **Configuration management**: Centralized `polyglot.json` for project settings

## Key Features

### 🚀 Rapid Scaffolding
Generate a complete polyglot workspace in seconds with interactive or non-interactive modes. No more copying boilerplate or manual configuration.

### 🔄 Hot Reload Aggregator
Automatically restart services on file changes. Supports Node.js, Python (uvicorn), Go, Java Spring Boot, and HMR for frontend frameworks.

### 📦 Shared Code Libraries
Create reusable libraries that can be shared across services:
- Python packages with pyproject.toml
- Go modules with go.mod
- Java libraries with Maven

### 🐳 Docker Integration
Every service gets a Dockerfile and is included in docker-compose.yaml. Start all services with a single command, or run them locally.

### 🔌 Extensible Plugins
Create plugins to hook into the CLI lifecycle. Customize project initialization, service creation, development workflows, and more.

### 📊 Service Management
- Add/remove services post-initialization
- Start, stop, restart individual services
- View logs with filtering and search
- Health check monitoring

## Architecture Overview

create-polyglot follows these principles:

1. **Convention over Configuration**: Sensible defaults that work out of the box
2. **Language Agnostic**: Each service uses native tooling for its language
3. **Flexible Orchestration**: Choose the monorepo tool that fits your needs
4. **Docker Native**: Built with containerization in mind from day one
5. **Extensible Core**: Plugin system for customization without forking

## Use Cases

### Rapid Prototyping
Quickly spin up a multi-service architecture to test ideas and validate concepts without spending hours on boilerplate.

### Learning & Education
Perfect for learning microservices, polyglot development, or teaching teams about distributed systems.

### Production Foundations
Start new projects with a solid foundation that scales from prototype to production.

### Demos & PoCs
Create reproducible environments for demos, proof-of-concepts, and client presentations.

### Team Onboarding
Standardize development environments across teams. New developers can get started in minutes.

## Project Layout

The generated workspace follows a clear, organized structure:

```
my-org/
├── services/              # All microservices
│   ├── node/             # Node.js/Express
│   ├── python/           # Python/FastAPI  
│   ├── go/               # Go net/http
│   ├── java/             # Java Spring Boot
│   └── frontend/         # Next.js/Remix/Astro
├── packages/
│   ├── shared/           # Shared Node.js utilities
│   └── libs/             # Language-specific libraries
│       ├── python/
│       ├── go/
│       └── java/
├── plugins/              # Custom plugins
├── gateway/              # API gateway (optional)
├── infra/                # Infrastructure configs
├── polyglot.json         # Project configuration
├── compose.yaml          # Docker Compose file
├── package.json          # Root package.json
└── turbo.json / nx.json  # Monorepo config (if preset chosen)
```

## How It Works

1. **Initialization**: Run `create-polyglot init` to start the wizard
2. **Service Selection**: Choose which services to create (or let the wizard ask)
3. **Configuration**: Set up presets, package manager, and options
4. **Scaffolding**: Templates are copied and customized for your project
5. **Dependency Installation**: Dependencies are installed automatically
6. **Ready to Code**: Your workspace is ready with all services configured

## Next Steps

- [Getting Started Guide](/guide/getting-started) - Detailed installation and first steps
- [Presets](/guide/presets) - Learn about Turborepo, Nx, and Basic presets
- [Docker & Compose](/guide/docker) - Working with containers
- [CLI Reference](/cli/) - Complete command documentation
- [Plugin System](/plugin-system) - Extend functionality with plugins

## Philosophy

create-polyglot is built on these core beliefs:

- **Developer Experience First**: Tools should make development easier, not harder
- **Opinionated but Flexible**: Strong defaults with escape hatches
- **Language Best Practices**: Each service uses idiomatic patterns for its language
- **Modern Tooling**: Leverage the best tools available in the ecosystem
- **Community Driven**: Open source with contributions welcome

## Requirements

- Node.js 18+ (for the CLI itself)
- Language-specific runtimes (Node, Python, Go, Java) for respective services
- Docker (optional, for containerized development)
- Git (optional, for version control)

## Browser Compatibility

The admin dashboard works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Getting Help

- 📖 Browse the complete [documentation](/guide/getting-started)
- 💬 Ask questions in [GitHub Discussions](https://github.com/kaifcoder/create-polyglot/discussions)
- 🐛 Report bugs on [GitHub Issues](https://github.com/kaifcoder/create-polyglot/issues)
- ⭐ Star the project to show support

## Contributing

We welcome contributions! See the [Contributing Guide](https://github.com/kaifcoder/create-polyglot/blob/main/CONTRIBUTING.md) to get started.

## License

MIT - Free and open source forever.
