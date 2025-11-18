# Troubleshooting Guide

This guide covers common issues you might encounter when using create-polyglot and their solutions.

## Installation Issues

### Cannot find module 'create-polyglot'

**Problem**: After global installation, the command is not found.

**Solution**:
```bash
# Verify npm global path is in PATH
npm config get prefix

# Add to PATH if needed (add to ~/.bashrc or ~/.zshrc)
export PATH="$PATH:$(npm config get prefix)/bin"

# Or reinstall globally
npm install -g create-polyglot --force
```

### Permission errors during installation

**Problem**: `EACCES` or permission denied errors.

**Solution**:
```bash
# Option 1: Use a node version manager (recommended)
# Install nvm: https://github.com/nvm-sh/nvm
nvm install node
npm install -g create-polyglot

# Option 2: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm install -g create-polyglot
```

### Incompatible Node.js version

**Problem**: CLI fails with version errors.

**Solution**:
```bash
# Check your Node.js version
node --version

# Upgrade to Node.js 18 or higher
# Using nvm:
nvm install 18
nvm use 18

# Or download from https://nodejs.org/
```

## Project Initialization Issues

### Directory already exists

**Problem**: Target directory already exists and prevents initialization.

**Solution**:
```bash
# Use --force to overwrite
create-polyglot init my-org --force

# Or manually remove/rename the directory
rm -rf my-org
# Then try again
create-polyglot init my-org
```

### Port conflicts

**Problem**: Services fail to start due to port conflicts.

**Solution**:
```bash
# Check what's using the port
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill the process or change ports in polyglot.json
{
  "services": [
    { "name": "node", "port": 4001 }  // Changed from 3001
  ]
}
```

### Template download fails

**Problem**: Network errors when downloading templates.

**Solution**:
```bash
# Check your internet connection
ping github.com

# Try with different npm registry
npm config set registry https://registry.npmjs.org/

# Or use local templates (for contributors)
git clone https://github.com/kaifcoder/create-polyglot.git
cd create-polyglot
npm link
```

### Git initialization fails

**Problem**: Git command not found or fails.

**Solution**:
```bash
# Install git if missing
# macOS: brew install git
# Ubuntu: sudo apt-get install git
# Windows: Download from https://git-scm.com/

# Skip git initialization
create-polyglot init my-org --no-git

# Or initialize manually later
cd my-org
git init
git add .
git commit -m "Initial commit"
```

## Development Issues

### Services won't start

**Problem**: `create-polyglot dev` fails or services don't start.

**Solution**:

1. **Check logs**:
```bash
create-polyglot logs <service-name>
```

2. **Verify dependencies are installed**:
```bash
cd services/node
npm install

cd ../python
pip install -r requirements.txt
```

3. **Check for port conflicts** (see above)

4. **Verify service configuration**:
```bash
# Check polyglot.json for correct paths and ports
cat polyglot.json
```

### Hot reload not working

**Problem**: File changes don't trigger restarts.

**Solution**:

1. **Ensure hot reload is running**:
```bash
create-polyglot hot
```

2. **Check file watchers**:
```bash
# macOS: Increase file watcher limit
echo kern.maxfiles=65536 | sudo tee -a /etc/sysctl.conf
echo kern.maxfilesperproc=65536 | sudo tee -a /etc/sysctl.conf
sudo sysctl -w kern.maxfiles=65536
sudo sysctl -w kern.maxfilesperproc=65536

# Linux: Increase inotify watchers
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

3. **Verify service has dev script**:
```json
// services/node/package.json
{
  "scripts": {
    "dev": "nodemon src/index.js"
  }
}
```

### Admin dashboard won't open

**Problem**: Dashboard fails to start or shows errors.

**Solution**:

1. **Check if port 3100 is available**:
```bash
lsof -i :3100  # macOS/Linux
```

2. **Try a different port**:
```bash
PORT=4100 create-polyglot admin
```

3. **Check browser console** for WebSocket errors

4. **Verify logs directory exists**:
```bash
ls -la logs/
# Should contain service log files
```

## Docker Issues

### Docker build fails

**Problem**: Docker build command fails.

**Solution**:

1. **Verify Docker is installed and running**:
```bash
docker --version
docker ps
```

2. **Check Dockerfile syntax**:
```bash
# Validate Dockerfile
docker build --no-cache -t test services/node/
```

3. **Clear Docker cache**:
```bash
docker system prune -a
```

4. **Check for port conflicts in compose.yaml**

### Cannot connect to Docker daemon

**Problem**: Docker commands fail with daemon errors.

**Solution**:
```bash
# Start Docker Desktop (macOS/Windows)
# Or start Docker service (Linux)
sudo systemctl start docker

# Add user to docker group (Linux)
sudo usermod -aG docker $USER
# Log out and back in
```

### Compose services fail to start

**Problem**: `docker compose up` fails.

**Solution**:

1. **Check compose.yaml syntax**:
```bash
docker compose config
```

2. **View service logs**:
```bash
docker compose logs <service-name>
```

3. **Remove volumes and rebuild**:
```bash
docker compose down -v
docker compose up --build
```

## Service-Specific Issues

### Node.js service errors

**Problem**: Express server won't start or crashes.

**Solution**:
```bash
# Check Node.js version
node --version  # Should be 18+

# Clear node_modules and reinstall
cd services/node
rm -rf node_modules package-lock.json
npm install

# Check for syntax errors
npm run lint
```

### Python service errors

**Problem**: FastAPI service fails to start.

**Solution**:
```bash
# Check Python version
python --version  # Should be 3.8+

# Create virtual environment
cd services/python
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Check for import errors
python -c "import fastapi; print(fastapi.__version__)"
```

### Go service errors

**Problem**: Go service won't compile or run.

**Solution**:
```bash
# Check Go version
go version  # Should be 1.18+

# Clean and rebuild
cd services/go
go clean
go mod tidy
go build

# Check for syntax errors
go vet ./...
```

### Java service errors

**Problem**: Spring Boot service fails to start.

**Solution**:
```bash
# Check Java version
java -version  # Should be 17+

# Clean and rebuild
cd services/java
mvn clean install

# Skip tests if needed
mvn clean install -DskipTests

# Check for compilation errors
mvn compile
```

### Frontend service errors

**Problem**: Next.js frontend won't start.

**Solution**:
```bash
# Clear Next.js cache
cd services/frontend
rm -rf .next node_modules
npm install

# Check for port conflicts
# Default is 3000

# Run with verbose logging
npm run dev -- --verbose
```

## Plugin System Issues

### Plugins not loading

**Problem**: Plugins don't execute or aren't recognized.

**Solution**:

1. **Verify plugin structure**:
```javascript
// plugins/my-plugin/index.js must export default
export default {
  name: 'my-plugin',
  version: '1.0.0',
  hooks: {
    'after:init': function(ctx) {
      // Hook code
    }
  }
};
```

2. **Check polyglot.json**:
```json
{
  "plugins": {
    "my-plugin": {
      "enabled": true
    }
  }
}
```

3. **Enable debug mode**:
```bash
DEBUG_PLUGINS=true create-polyglot init test-project
```

### Plugin hooks not executing

**Problem**: Hooks are defined but don't run.

**Solution**:

1. **Verify hook name spelling** - Must match exactly
2. **Check that plugin is enabled** in polyglot.json
3. **Add console.log** to verify hook is reached
4. **Check for errors** in plugin code

## Shared Library Issues

### Python library import fails

**Problem**: Cannot import shared Python library.

**Solution**:
```bash
# Install in editable mode
cd packages/libs/my-lib
pip install -e .

# Or add to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:/path/to/packages/libs/my-lib"
```

### Go module not found

**Problem**: Go can't find shared module.

**Solution**:
```bash
# In your service's go.mod, add replace directive
replace mylib => ../../packages/libs/mylib

# Then run
go mod tidy
```

### Java library dependency errors

**Problem**: Maven can't resolve shared library.

**Solution**:
```bash
# Install library to local Maven repository
cd packages/libs/my-lib
mvn clean install

# Then in your service, ensure dependency is correct
# in pom.xml
```

## Configuration Issues

### polyglot.json corrupted

**Problem**: Invalid JSON or configuration.

**Solution**:
```bash
# Validate JSON
cat polyglot.json | jq .

# Restore from backup if available
cp polyglot.json.backup polyglot.json

# Or manually fix the JSON syntax
```

### Environment variables not loading

**Problem**: Services don't read .env files.

**Solution**:

1. **Ensure .env file exists** in service directory
2. **Use dotenv package** (Node.js):
```javascript
require('dotenv').config();
```
3. **Check .env syntax** - no spaces around `=`

## Performance Issues

### Slow initialization

**Problem**: Project creation takes too long.

**Solution**:
```bash
# Skip dependency installation initially
create-polyglot init my-org --no-install

# Install dependencies later
cd my-org
npm install
```

### High memory usage

**Problem**: Development tools consume too much memory.

**Solution**:

1. **Increase Node.js memory**:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
```

2. **Disable unused services** in polyglot.json

3. **Use Docker mode** to isolate services:
```bash
create-polyglot dev --docker
```

## Getting Help

If you're still experiencing issues:

1. **Check GitHub Issues**: [github.com/kaifcoder/create-polyglot/issues](https://github.com/kaifcoder/create-polyglot/issues)
2. **Search Discussions**: [github.com/kaifcoder/create-polyglot/discussions](https://github.com/kaifcoder/create-polyglot/discussions)
3. **Enable Debug Mode**:
```bash
DEBUG=* create-polyglot init test
```
4. **Collect logs**:
```bash
create-polyglot logs --all > debug.log
```
5. **Report Bug** with:
   - create-polyglot version
   - Node.js version
   - Operating system
   - Complete error message
   - Steps to reproduce

## Common Error Messages

### `EADDRINUSE`
**Meaning**: Port is already in use  
**Solution**: Change port in polyglot.json or stop conflicting process

### `MODULE_NOT_FOUND`
**Meaning**: Dependency not installed  
**Solution**: Run `npm install` in the service directory

### `ENOENT: no such file or directory`
**Meaning**: Required file is missing  
**Solution**: Verify file paths in configuration

### `ERR_INVALID_ARG_TYPE`
**Meaning**: Invalid argument type passed to function  
**Solution**: Check command syntax and parameters

### `spawn EACCES`
**Meaning**: Permission denied executing command  
**Solution**: Make file executable with `chmod +x`

## Best Practices

To avoid common issues:

1. ✅ Keep create-polyglot updated: `npm update -g create-polyglot`
2. ✅ Use supported Node.js versions (18+)
3. ✅ Run from project root directory
4. ✅ Check logs before asking for help
5. ✅ Use version control to track changes
6. ✅ Document custom modifications
7. ✅ Test services individually before integration
8. ✅ Keep dependencies updated regularly
