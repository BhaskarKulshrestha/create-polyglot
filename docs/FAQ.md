# Frequently Asked Questions (FAQ)

## General Questions

### What is create-polyglot?

create-polyglot is a CLI tool that scaffolds polyglot microservice monorepos. It generates ready-to-use projects with services in multiple programming languages (Node.js, Python, Go, Java, Next.js) along with Docker configurations, monorepo tooling, and development utilities.

### Who should use create-polyglot?

create-polyglot is ideal for:
- Developers building microservices architectures
- Teams wanting to standardize their polyglot development setup
- Students learning about microservices and distributed systems
- Companies prototyping multi-language architectures
- Anyone needing a quick polyglot project scaffold

### Is create-polyglot free?

Yes! create-polyglot is open source and MIT licensed, making it free for personal and commercial use.

### What languages and frameworks does it support?

**Backend:**
- Node.js with Express
- Python with FastAPI
- Go with net/http
- Java with Spring Boot

**Frontend:**
- Next.js
- Remix
- Astro
- SvelteKit

### Can I use create-polyglot in production?

Yes, the generated code provides a solid foundation for production applications. However, you should:
- Review and customize security configurations
- Add proper authentication and authorization
- Configure environment-specific settings
- Implement proper error handling and logging
- Add monitoring and observability tools

## Installation & Setup

### What are the system requirements?

- Node.js 18 or higher (for the CLI)
- npm, pnpm, yarn, or bun
- Language-specific runtimes (Python 3.8+, Go 1.18+, Java 17+) for respective services
- Docker (optional, for containerized development)
- Git (optional, for version control)

### Do I need to install all language runtimes?

No! You only need the runtimes for the services you plan to use. For example:
- If you only create Node.js services, you just need Node.js
- Python services require Python 3.8+
- Go services require Go 1.18+
- Java services require Java 17+

### Can I use create-polyglot without Docker?

Yes! Docker is optional. You can run services directly using their native tooling (npm, pip, go run, mvn spring-boot:run).

### How do I update create-polyglot?

```bash
npm update -g create-polyglot
```

Check your version:
```bash
create-polyglot --version
```

## Project Management

### Can I add services after initial creation?

Absolutely! Use the `add service` command:
```bash
create-polyglot add service my-service --type python --port 4000
```

### Can I remove services?

Yes, use the `remove service` command:
```bash
create-polyglot remove service my-service
```

Add `--keep-files` to keep the service directory but remove it from configuration.

### How do I change service ports?

Edit the `polyglot.json` file and update the port for the service:
```json
{
  "services": [
    { "name": "node", "type": "node", "port": 4001 }
  ]
}
```

### Can I rename services?

Yes, but you'll need to:
1. Rename the directory in `services/`
2. Update `polyglot.json`
3. Update references in `compose.yaml`
4. Update any inter-service references

### How do I add custom environment variables?

Create a `.env` file in your service directory:
```bash
# services/node/.env
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your-secret-key
```

Then load them in your service code using appropriate libraries (dotenv for Node.js, python-dotenv for Python, etc.).

## Development Workflow

### How do I start all services?

```bash
# Local development (Node.js and frontend services)
create-polyglot dev

# Docker mode (all services)
create-polyglot dev --docker
```

### What's the difference between `dev` and `hot`?

- `dev`: Starts services with their native dev scripts
- `hot`: Starts services AND monitors for file changes, automatically restarting when files change

### How do I view logs?

```bash
# View logs for a specific service
create-polyglot logs node

# View all logs
create-polyglot logs --all

# Follow logs in real-time
create-polyglot logs node --follow
```

### Can I run only specific services?

Yes! Start the admin dashboard and use the service controls:
```bash
create-polyglot admin
```

Or use Docker Compose for specific services:
```bash
docker compose up node python
```

### How do I debug a service?

Each service can be debugged using its native tools:

**Node.js:**
```bash
cd services/node
node --inspect src/index.js
```

**Python:**
```bash
cd services/python
python -m debugpy --listen 5678 app/main.py
```

**Go:**
```bash
cd services/go
dlv debug
```

**Java:**
```bash
cd services/java
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005"
```

## Monorepo Presets

### What's the difference between Turborepo, Nx, and Basic?

**Turborepo:**
- Best for: Projects with many interdependent services
- Features: Intelligent caching, parallel execution, dependency graph
- Setup: More configuration, more power

**Nx:**
- Best for: Enterprise projects with complex tooling needs
- Features: Code generation, dependency graph visualization, advanced caching
- Setup: Most comprehensive, steepest learning curve

**Basic:**
- Best for: Simple projects, learning, quick prototypes
- Features: Simple concurrent execution with `create-polyglot dev`
- Setup: Minimal configuration, easy to understand

### Can I change presets after initialization?

While possible, it's not straightforward. You'd need to:
1. Add the new preset's configuration files
2. Update root `package.json` scripts
3. Potentially restructure project organization

It's easier to start a new project with the desired preset.

### Can I use create-polyglot without any preset?

Yes! Choose the "Basic" preset or none at all. You'll get a simple setup with `create-polyglot dev` to run services.

## Docker & Containers

### How do I customize Dockerfiles?

Simply edit the Dockerfile in each service directory:
```bash
# Edit Node.js service Dockerfile
nano services/node/Dockerfile
```

Changes persist and won't be overwritten.

### How do I add databases to docker-compose?

Edit `compose.yaml` at the project root:
```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_DB: myapp
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Can I use Kubernetes instead of Docker Compose?

Yes! The Dockerfiles work with any container orchestration. You'll need to:
1. Create Kubernetes manifests (Deployments, Services, etc.)
2. Build and push images to a registry
3. Apply manifests to your cluster

Consider using tools like Skaffold or Tilt for K8s development workflows.

### How do I handle secrets in containers?

**Development:**
- Use `.env` files (not committed to git)
- Docker Compose `env_file` or `environment` sections

**Production:**
- Use Docker secrets
- Environment variables from orchestration platform
- External secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)

## Shared Libraries

### When should I create a shared library?

Create shared libraries when you have:
- Common data models used across services
- Utility functions needed by multiple services
- Shared business logic
- Common API clients or interfaces

### Can I publish shared libraries to npm/PyPI/etc.?

Yes! The generated libraries are standard packages:
- **Node.js**: Publish to npm
- **Python**: Publish to PyPI
- **Go**: Host on GitHub and import
- **Java**: Publish to Maven Central or private repository

### How do services consume shared libraries?

**Python:**
```bash
cd services/python
pip install -e ../../packages/libs/my-lib
```

**Go:**
Add replace directive in `go.mod`:
```go
replace mylib => ../../packages/libs/mylib
```

**Java:**
Install to local Maven repository:
```bash
cd packages/libs/my-lib
mvn install
```

### Can I have language-specific AND language-agnostic shared code?

Yes! Use:
- `packages/shared/` for Node.js utilities
- `packages/libs/<name>/` for language-specific libraries
- Consider REST APIs or gRPC for cross-language sharing

## Plugins

### What can plugins do?

Plugins can hook into lifecycle events to:
- Modify project structure during initialization
- Add custom commands
- Integrate with external tools
- Customize development workflows
- Add automated tasks

### How do I create a plugin?

```bash
create-polyglot add plugin my-plugin
```

Then edit `plugins/my-plugin/index.js`:
```javascript
export default {
  name: 'my-plugin',
  hooks: {
    'after:init': function(ctx) {
      console.log('Project created!');
    }
  }
};
```

### Can I use plugins from npm?

Yes! Configure external plugins in `polyglot.json`:
```json
{
  "plugins": {
    "external-plugin": {
      "external": "create-polyglot-plugin-awesome",
      "enabled": true
    }
  }
}
```

### Where can I find existing plugins?

Check:
- [npm search](https://www.npmjs.com/search?q=create-polyglot-plugin)
- [GitHub discussions](https://github.com/kaifcoder/create-polyglot/discussions)
- Community showcase in the repository

## Troubleshooting

### Services aren't starting, what should I check?

1. **Port conflicts**: Another process using the port
2. **Missing dependencies**: Run `npm install` / `pip install -r requirements.txt`
3. **Check logs**: `create-polyglot logs <service-name>`
4. **Verify configuration**: Check `polyglot.json` and `compose.yaml`

See the [Troubleshooting Guide](/guide/troubleshooting) for detailed solutions.

### Hot reload isn't working

1. Ensure you're running `create-polyglot hot`, not just `dev`
2. Check file watcher limits on your OS
3. Verify service has a `dev` script in `package.json`
4. Check console for error messages

### Docker build fails

1. Check Docker is running: `docker ps`
2. Verify Dockerfile syntax
3. Clear build cache: `docker system prune -a`
4. Check for network/download issues

### How do I get help?

1. Check the [Troubleshooting Guide](/guide/troubleshooting)
2. Search [GitHub Issues](https://github.com/kaifcoder/create-polyglot/issues)
3. Ask in [GitHub Discussions](https://github.com/kaifcoder/create-polyglot/discussions)
4. Enable debug mode: `DEBUG=* create-polyglot init test`

## Advanced Usage

### Can I customize the generated templates?

Yes! After initial generation, all code is yours to modify. For contributing custom templates back to the project, fork the repository and submit a PR.

### Can I use create-polyglot with an existing project?

Not directly, but you can:
1. Create a new project with create-polyglot
2. Manually migrate your existing code into the generated structure
3. Update configurations as needed

### How do I integrate with CI/CD?

Use the `--with-actions` flag to generate a GitHub Actions workflow:
```bash
create-polyglot init my-org --with-actions --yes
```

Or manually create workflows for your CI/CD platform using the generated Dockerfiles.

### Can I use this for a production microservices platform?

Yes, but add:
- Service mesh (Istio, Linkerd)
- API gateway (Kong, Ambassador)
- Monitoring (Prometheus, Grafana)
- Distributed tracing (Jaeger, Zipkin)
- Centralized logging (ELK stack, Loki)
- Secret management
- Infrastructure as Code (Terraform, Pulumi)

### How do I scale individual services?

**Docker Compose:**
```bash
docker compose up --scale node=3
```

**Kubernetes:**
```bash
kubectl scale deployment node --replicas=3
```

**Load Balancer:**
Add nginx or a cloud load balancer in front of scaled services.

## Contributing

### How can I contribute?

- Report bugs and request features via [GitHub Issues](https://github.com/kaifcoder/create-polyglot/issues)
- Submit pull requests for fixes and enhancements
- Improve documentation
- Share your experience and help others in [Discussions](https://github.com/kaifcoder/create-polyglot/discussions)
- Create and share plugins

See [CONTRIBUTING.md](https://github.com/kaifcoder/create-polyglot/blob/main/CONTRIBUTING.md) for guidelines.

### I found a bug, where do I report it?

[Open an issue](https://github.com/kaifcoder/create-polyglot/issues/new) with:
- create-polyglot version
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages and logs

### Can I add support for a new language?

Absolutely! Here's how:
1. Fork the repository
2. Add template in `templates/<language>/`
3. Update scaffolding logic in `bin/lib/scaffold.js`
4. Add tests
5. Update documentation
6. Submit a pull request

## Comparison

### How does it compare to create-next-app or create-react-app?

create-polyglot is broader in scope:
- Supports multiple languages, not just JavaScript
- Generates a complete monorepo, not a single app
- Includes backend services, not just frontend
- Provides Docker and orchestration setup

### How does it compare to Yeoman?

create-polyglot is more opinionated and focused:
- Specifically for polyglot microservices
- Less configuration needed
- Built-in monorepo tooling integration
- Includes hot reload, admin dashboard, and service management

### How does it compare to manual setup?

**Manual setup:**
- More control over every detail
- Time-consuming (hours to days)
- Requires deep knowledge of each tool

**create-polyglot:**
- Faster (minutes)
- Best practices built-in
- Consistent structure across projects
- Easy for teams to onboard

## Still Have Questions?

- 📖 Read the [complete documentation](/guide/)
- 💬 Ask in [GitHub Discussions](https://github.com/kaifcoder/create-polyglot/discussions)
- 🐛 [Open an issue](https://github.com/kaifcoder/create-polyglot/issues) for bugs
- 📧 Contact the maintainers through GitHub
