# Plugin System

The create-polyglot plugin system provides a robust, extensible architecture for customizing and extending the CLI workflow through lifecycle hooks.

## Overview

The plugin system allows developers to:

- **Hook into lifecycle events** during project scaffolding, development, and management
- **Customize project structure** and templates
- **Add custom functionality** to existing commands
- **Integrate with external tools** and services
- **Extend the CLI** with new capabilities

## Architecture

The plugin system is built on several key components:

### 1. Plugin Registry (`PluginSystem` class)
- Manages plugin discovery, loading, and execution
- Handles plugin configuration and dependencies
- Provides error handling and graceful degradation

### 2. Hook System (powered by `hookable`)
- Defines standardized lifecycle hook points
- Executes hooks with proper context and error handling
- Supports asynchronous hook execution

### 3. Plugin Configuration
- Stored in `polyglot.json` under the `plugins` section
- Supports priority ordering, enable/disable, and custom config
- Automatically saved and loaded per project

## Quick Start

### 1. Create a Plugin

```bash
# Create a new plugin scaffold
create-polyglot add plugin my-awesome-plugin

# This creates plugins/my-awesome-plugin/ with:
# - index.js (main plugin file)
# - package.json (plugin metadata)
# - README.md (plugin documentation)
```

### 2. Implement Hook Handlers

```javascript
// plugins/my-awesome-plugin/index.js
export default {
  name: 'my-awesome-plugin',
  version: '1.0.0',
  description: 'Adds awesome features to create-polyglot',
  
  hooks: {
    'after:init': function(ctx) {
      console.log(`[${this.name}] Project ${ctx.projectName} created!`);
      // Add custom logic here
    },
    
    'before:dev:start': function(ctx) {
      console.log(`[${this.name}] Starting development mode`);
      // Pre-development setup
    }
  }
};
```

### 3. Manage Plugins

```bash
# List all plugins
create-polyglot plugin list

# Enable/disable plugins
create-polyglot plugin enable my-awesome-plugin
create-polyglot plugin disable my-awesome-plugin

# Get plugin information
create-polyglot plugin info my-awesome-plugin

# Configure plugin
create-polyglot plugin configure my-awesome-plugin --priority 10
```

## Hook Lifecycle

The plugin system provides hooks at key points in the create-polyglot workflow:

### Project Initialization
- `before:init` - Before project scaffolding starts
- `after:init` - After project scaffolding completes
- `before:template:copy` - Before copying service templates
- `after:template:copy` - After copying service templates
- `before:dependencies:install` - Before installing dependencies
- `after:dependencies:install` - After installing dependencies

### Service Management
- `before:service:add` - Before adding a new service
- `after:service:add` - After adding a new service
- `before:service:remove` - Before removing a service
- `after:service:remove` - After removing a service

### Development Workflow
- `before:dev:start` - Before starting dev server(s)
- `after:dev:start` - After dev server(s) have started
- `before:dev:stop` - Before stopping dev server(s)
- `after:dev:stop` - After dev server(s) have stopped

### Docker & Compose
- `before:docker:build` - Before building Docker images
- `after:docker:build` - After building Docker images
- `before:compose:up` - Before running docker compose up
- `after:compose:up` - After docker compose up completes

### Hot Reload
- `before:hotreload:start` - Before starting hot reload
- `after:hotreload:start` - After hot reload is active
- `before:hotreload:restart` - Before restarting a service
- `after:hotreload:restart` - After a service restarts

### Admin Dashboard
- `before:admin:start` - Before starting admin dashboard
- `after:admin:start` - After admin dashboard is running

### Log Management
- `before:logs:view` - Before viewing logs
- `after:logs:view` - After log viewing session
- `before:logs:clear` - Before clearing logs
- `after:logs:clear` - After clearing logs

### Plugin Lifecycle
- `before:plugin:load` - Before loading a plugin
- `after:plugin:load` - After loading a plugin
- `before:plugin:unload` - Before unloading a plugin
- `after:plugin:unload` - After unloading a plugin

## Plugin Structure

### Basic Plugin

```javascript
export default {
  name: 'plugin-name',
  version: '1.0.0',
  description: 'Plugin description',
  
  // Hook handlers
  hooks: {
    'hookName': function(context) {
      // Hook implementation
    }
  },
  
  // Plugin configuration
  config: {
    enabled: true,
    customOption: 'value'
  },
  
  // Plugin methods (optional)
  methods: {
    customMethod() {
      // Custom functionality
    }
  },
  
  // Lifecycle callbacks (optional)
  onLoad() {
    console.log('Plugin loaded');
  },
  
  onUnload() {
    console.log('Plugin unloaded');
  }
};
```

### Hook Context

Each hook receives a context object with relevant information:

```javascript
{
  projectName,     // Project name
  projectDir,      // Absolute path to project directory
  services,        // Array of service configurations
  config,          // Project configuration from polyglot.json
  timestamp,       // Hook execution timestamp
  hookName,        // Name of the current hook
  // ... additional context specific to the hook
}
```

#### Context Examples

**`after:init` context:**
```javascript
{
  projectName: 'my-app',
  projectDir: '/path/to/my-app',
  services: [
    { name: 'api', type: 'node', port: 3001 },
    { name: 'web', type: 'frontend', port: 3000 }
  ],
  config: { /* polyglot.json contents */ },
  options: { /* CLI options */ }
}
```

**`before:service:add` context:**
```javascript
{
  projectDir: '/path/to/my-app',
  service: { type: 'python', name: 'ml-api', port: 3004 },
  options: { /* CLI options */ }
}
```

**`before:dev:start` context:**
```javascript
{
  projectDir: '/path/to/my-app',
  docker: false,
  mode: 'local'
}
```

## Plugin Configuration

### Basic Configuration

Plugins are configured in `polyglot.json`:

```json
{
  "plugins": {
    "my-plugin": {
      "enabled": true,
      "priority": 0,
      "config": {
        "customOption": "value"
      }
    }
  }
}
```

### Configuration Options

- `enabled` - Whether the plugin is active (default: true)
- `priority` - Loading order (higher loads first, default: 0)
- `external` - Path to external plugin (npm package or file path)
- `config` - Plugin-specific configuration object

### External Plugins

You can use plugins from npm packages or external files:

```json
{
  "plugins": {
    "external-plugin": {
      "external": "create-polyglot-plugin-awesome",
      "enabled": true
    },
    "local-external": {
      "external": "/path/to/plugin.js",
      "enabled": true
    }
  }
}
```

## Advanced Features

### Plugin Dependencies

Plugins can specify dependencies through priority:

```javascript
export default {
  name: 'dependent-plugin',
  
  hooks: {
    'after:init': function(ctx) {
      // This runs after higher-priority plugins
      const corePlugin = this.context.plugins.get('core-plugin');
      if (corePlugin) {
        // Use core plugin functionality
      }
    }
  }
};
```

### Conditional Hook Execution

```javascript
export default {
  name: 'conditional-plugin',
  
  hooks: {
    'before:service:add': function(ctx) {
      // Only run for Node.js services
      if (ctx.service.type !== 'node') {
        return;
      }
      
      // Node.js-specific logic
      console.log('Adding Node.js service:', ctx.service.name);
    }
  }
};
```

### Async Hook Handlers

```javascript
export default {
  name: 'async-plugin',
  
  hooks: {
    'after:init': async function(ctx) {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      // Create custom files
      const customDir = path.join(ctx.projectDir, 'custom');
      await fs.mkdirp(customDir);
      
      const config = {
        plugin: this.name,
        createdAt: new Date().toISOString(),
        projectName: ctx.projectName
      };
      
      await fs.writeJson(
        path.join(customDir, 'plugin-config.json'),
        config,
        { spaces: 2 }
      );
    }
  }
};
```

### Error Handling

```javascript
export default {
  name: 'error-handling-plugin',
  
  hooks: {
    'after:init': function(ctx) {
      try {
        // Potentially risky operation
        this.performCustomAction(ctx);
      } catch (error) {
        console.warn(`[${this.name}] Warning: ${error.message}`);
        // Don't throw - allow other plugins and CLI to continue
      }
    }
  },
  
  methods: {
    performCustomAction(ctx) {
      // Custom logic that might fail
      throw new Error('Something went wrong');
    }
  }
};
```

## Plugin CLI Commands

### List Plugins

```bash
# List all plugins with status
create-polyglot plugin list

# List only enabled plugins
create-polyglot plugin list --enabled-only

# Output as JSON
create-polyglot plugin list --json
```

### Plugin Information

```bash
# Get detailed plugin information
create-polyglot plugin info my-plugin

# Output as JSON
create-polyglot plugin info my-plugin --json
```

### Enable/Disable Plugins

```bash
# Enable a plugin
create-polyglot plugin enable my-plugin

# Disable a plugin
create-polyglot plugin disable my-plugin
```

### Configure Plugins

```bash
# Set plugin priority
create-polyglot plugin configure my-plugin --priority 10

# Set custom configuration
create-polyglot plugin configure my-plugin --config '{"debug": true, "apiKey": "xxx"}'

# Set external plugin
create-polyglot plugin configure my-plugin --external "npm-plugin-package"
```

### System Statistics

```bash
# View plugin system statistics
create-polyglot plugin stats

# Output as JSON
create-polyglot plugin stats --json
```

## Best Practices

### 1. Error Handling
- Always wrap risky operations in try-catch blocks
- Don't throw errors from hooks unless critical
- Log warnings instead of failing completely

### 2. Performance
- Keep hook handlers lightweight
- Use async operations when dealing with file system or network
- Cache expensive computations

### 3. Configuration
- Make plugins configurable through the config object
- Provide sensible defaults
- Document configuration options

### 4. Logging
- Use consistent logging with plugin name prefix
- Respect debug/quiet modes
- Use appropriate log levels

### 5. Testing
- Test plugin loading and execution
- Test error scenarios
- Use the provided test utilities

### 6. Documentation
- Document all hooks and methods
- Provide usage examples
- Keep README up to date

### 7. Compatibility
- Don't assume specific project structure
- Check for required dependencies/tools
- Gracefully handle missing features

## Example Plugins

### Custom Template Plugin

```javascript
export default {
  name: 'custom-template',
  
  hooks: {
    'after:template:copy': async function(ctx) {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      // Add custom templates for each service
      for (const service of ctx.services) {
        if (service.type === 'node') {
          const servicePath = path.join(ctx.projectDir, 'services', service.name);
          const customFile = path.join(servicePath, 'custom-setup.js');
          
          const template = `
            // Custom setup for ${service.name}
            console.log('Initializing ${service.name} service');
            
            module.exports = {
              init: () => {
                console.log('Service ${service.name} initialized');
              }
            };
          `;
          
          await fs.writeFile(customFile, template);
        }
      }
    }
  }
};
```

### Environment Setup Plugin

```javascript
export default {
  name: 'env-setup',
  
  hooks: {
    'after:init': async function(ctx) {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      // Create .env files for each service
      for (const service of ctx.services) {
        const servicePath = path.join(ctx.projectDir, 'services', service.name);
        const envPath = path.join(servicePath, '.env.example');
        
        const envContent = [
          `# Environment variables for ${service.name}`,
          `NODE_ENV=development`,
          `PORT=${service.port}`,
          `SERVICE_NAME=${service.name}`,
          ''
        ].join('\\n');
        
        await fs.writeFile(envPath, envContent);
      }
      
      console.log(`[${this.name}] Created .env.example files for all services`);
    }
  }
};
```

### Monitoring Plugin

```javascript
export default {
  name: 'monitoring',
  config: {
    healthCheckInterval: 30000,
    alertsEnabled: true
  },
  
  hooks: {
    'after:dev:start': function(ctx) {
      if (!this.config.healthCheckInterval) return;
      
      this.healthCheckTimer = setInterval(() => {
        this.performHealthChecks(ctx.services);
      }, this.config.healthCheckInterval);
      
      console.log(`[${this.name}] Health monitoring started`);
    },
    
    'before:dev:stop': function(ctx) {
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        console.log(`[${this.name}] Health monitoring stopped`);
      }
    }
  },
  
  methods: {
    async performHealthChecks(services) {
      for (const service of services) {
        try {
          const response = await fetch(`http://localhost:${service.port}/health`);
          if (!response.ok) {
            this.alertServiceDown(service);
          }
        } catch (error) {
          this.alertServiceDown(service, error.message);
        }
      }
    },
    
    alertServiceDown(service, error = 'Service unavailable') {
      if (this.config.alertsEnabled) {
        console.warn(`[${this.name}] 🔴 Service ${service.name} is down: ${error}`);
      }
    }
  }
};
```

## Debugging

### Enable Debug Mode

Set the `DEBUG_PLUGINS` environment variable to see detailed plugin execution logs:

```bash
DEBUG_PLUGINS=true create-polyglot init my-app
```

### Plugin Inspection

Use the plugin info command to inspect loaded plugins:

```bash
create-polyglot plugin info my-plugin
create-polyglot plugin stats
```

### Common Issues

1. **Plugin not loading**: Check file path and syntax
2. **Hooks not executing**: Verify hook name spelling
3. **Configuration not working**: Check `polyglot.json` format
4. **Import errors**: Ensure proper ES module syntax

## API Reference

### Plugin System Methods

- `pluginSystem.initialize(projectDir)` - Initialize for a project
- `pluginSystem.getPlugins()` - Get all loaded plugins
- `pluginSystem.getPlugin(name)` - Get specific plugin
- `pluginSystem.enablePlugin(name)` - Enable a plugin
- `pluginSystem.disablePlugin(name)` - Disable a plugin
- `pluginSystem.configurePlugin(name, config)` - Configure plugin
- `pluginSystem.getStats()` - Get system statistics

### Hook Utilities

- `callHook(hookName, context)` - Call a specific hook
- `initializePlugins(projectDir)` - Initialize plugin system
- `HOOK_POINTS` - Available hook points and descriptions

## Contributing

To contribute to the plugin system:

1. Follow the established patterns
2. Add tests for new functionality
3. Update documentation
4. Consider backward compatibility
5. Submit pull requests with clear descriptions

## Troubleshooting

### Plugin Loading Issues

1. Check plugin syntax and structure
2. Verify file permissions
3. Ensure proper export format (ES modules)
4. Check for conflicting plugin names

### Hook Execution Problems

1. Verify hook name spelling
2. Check context object usage
3. Handle errors properly
4. Test with minimal plugin first

### Configuration Issues

1. Validate JSON syntax in polyglot.json
2. Check plugin name matches directory/config
3. Verify external plugin paths
4. Restart after configuration changes