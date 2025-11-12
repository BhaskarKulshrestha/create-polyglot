import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { pluginSystem, initializePlugins, callHook, HOOK_POINTS } from '../bin/lib/plugin-system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let testDirCounter = 0;

describe('Plugin System', () => {
  let testDir;
  
  beforeEach(async () => {
    // Create unique test directory for each test
    testDirCounter++;
    testDir = path.join(__dirname, `temp-plugin-test-${testDirCounter}-${Date.now()}`);
    
    // Always reset plugin system state completely
    pluginSystem.plugins.clear();
    pluginSystem.pluginOrder = [];
    pluginSystem.isInitialized = false;
    pluginSystem.projectDir = null;
    pluginSystem.config = null;
    
    // Reset the hooks system by creating a new instance
    const { createHooks } = await import('hookable');
    pluginSystem.hooks = createHooks();
    
    // Create test directory
    await fs.mkdirp(testDir);
    
    // Create basic polyglot.json
    const config = {
      name: 'test-project',
      services: [
        { name: 'api', type: 'node', port: 3001 },
        { name: 'web', type: 'frontend', port: 3000 }
      ],
      plugins: {}
    };
    await fs.writeJson(path.join(testDir, 'polyglot.json'), config);
  });
  
  afterEach(async () => {
    // Clean up test directory
    await fs.remove(testDir);
  });

  describe('Core Plugin System', () => {
    it('should initialize with empty state', () => {
      expect(pluginSystem.isInitialized).toBe(false);
      expect(pluginSystem.plugins.size).toBe(0);
      expect(pluginSystem.pluginOrder).toEqual([]);
    });

    it('should initialize for a project directory', async () => {
      await initializePlugins(testDir);
      
      expect(pluginSystem.isInitialized).toBe(true);
      expect(pluginSystem.projectDir).toBe(testDir);
      expect(pluginSystem.config).toBeDefined();
      expect(pluginSystem.config.name).toBe('test-project');
    });

    it('should handle missing polyglot.json gracefully', async () => {
      await fs.remove(path.join(testDir, 'polyglot.json'));
      
      await initializePlugins(testDir);
      
      expect(pluginSystem.isInitialized).toBe(true);
      expect(pluginSystem.config).toEqual({ plugins: {} });
    });
  });

  describe('Plugin Discovery and Loading', () => {
    it('should discover local plugins', async () => {
      // Create a test plugin
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'test-plugin');
      await fs.mkdirp(pluginDir);
      
      const pluginCode = `
        export default {
          name: 'test-plugin',
          version: '1.0.0',
          hooks: {
            'after:init': function(ctx) {
              this.testHookCalled = true;
            }
          }
        };
      `;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
      
      await initializePlugins(testDir);
      
      expect(pluginSystem.pluginOrder).toHaveLength(1);
      expect(pluginSystem.pluginOrder[0].name).toBe('test-plugin');
      expect(pluginSystem.pluginOrder[0].type).toBe('local');
      expect(pluginSystem.pluginOrder[0].enabled).toBe(true);
    });

    it('should respect plugin enabled/disabled state', async () => {
      // Create disabled plugin
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'disabled-plugin');
      await fs.mkdirp(pluginDir);
      
      const pluginCode = `
        export default {
          name: 'disabled-plugin',
          hooks: {}
        };
      `;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
      
      // Update config to disable plugin
      const config = await fs.readJson(path.join(testDir, 'polyglot.json'));
      config.plugins = {
        'disabled-plugin': { enabled: false }
      };
      await fs.writeJson(path.join(testDir, 'polyglot.json'), config);
      
      await initializePlugins(testDir);
      
      expect(pluginSystem.plugins.size).toBe(0); // Should not load disabled plugin
    });

    it('should load plugins with priority ordering', async () => {
      // Create multiple plugins
      const plugin1Dir = path.join(testDir, '.polyglot', 'plugins', 'plugin-1');
      const plugin2Dir = path.join(testDir, '.polyglot', 'plugins', 'plugin-2');
      await fs.mkdirp(plugin1Dir);
      await fs.mkdirp(plugin2Dir);
      
      await fs.writeFile(path.join(plugin1Dir, 'index.js'), 'export default { name: "plugin-1" };');
      await fs.writeFile(path.join(plugin2Dir, 'index.js'), 'export default { name: "plugin-2" };');
      
      // Set priorities
      const config = await fs.readJson(path.join(testDir, 'polyglot.json'));
      config.plugins = {
        'plugin-1': { priority: 1 },
        'plugin-2': { priority: 10 } // Higher priority should load first
      };
      await fs.writeJson(path.join(testDir, 'polyglot.json'), config);
      
      await initializePlugins(testDir);
      
      expect(pluginSystem.pluginOrder[0].name).toBe('plugin-2'); // Higher priority first
      expect(pluginSystem.pluginOrder[1].name).toBe('plugin-1');
    });

    it('should handle plugin loading errors gracefully', async () => {
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'broken-plugin');
      await fs.mkdirp(pluginDir);
      
      // Create invalid plugin code
      await fs.writeFile(path.join(pluginDir, 'index.js'), 'this is not valid javascript');
      
      await initializePlugins(testDir);
      
      expect(pluginSystem.plugins.size).toBe(0);
      expect(pluginSystem.isInitialized).toBe(true);
    });
  });

  describe('Hook Execution', () => {
    let testResults;

    beforeEach(() => {
      testResults = [];
    });

    it('should execute hooks in loaded plugins', async () => {
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'hook-test');
      await fs.mkdirp(pluginDir);
      
      const pluginCode = `
        export default {
          name: 'hook-test',
          hooks: {
            'after:init': function(ctx) {
              global.testResults = global.testResults || [];
              global.testResults.push('hook-executed');
            }
          }
        };
      `;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
      await initializePlugins(testDir);
      
      global.testResults = [];
      await callHook('after:init', { projectName: 'test' });
      
      expect(global.testResults).toContain('hook-executed');
    });

    it('should provide correct context to hooks', async () => {
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'context-test');
      await fs.mkdirp(pluginDir);
      
      const pluginCode = `
        export default {
          name: 'context-test',
          hooks: {
            'before:init': function(ctx) {
              global.testContext = ctx;
            }
          }
        };
      `;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
      await initializePlugins(testDir);
      
      const testContext = { 
        projectName: 'test-project',
        customData: 'test-value' 
      };
      
      await callHook('before:init', testContext);
      
      expect(global.testContext).toBeDefined();
      expect(global.testContext.projectName).toBe('test-project');
      expect(global.testContext.customData).toBe('test-value');
      expect(global.testContext.projectDir).toBe(testDir);
      expect(global.testContext.timestamp).toBeDefined();
      expect(global.testContext.hookName).toBe('before:init');
    });

    it('should handle hook execution errors gracefully', async () => {
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'error-test');
      await fs.mkdirp(pluginDir);
      
      const pluginCode = `
        export default {
          name: 'error-test',
          hooks: {
            'after:init': function(ctx) {
              throw new Error('Test error');
            }
          }
        };
      `;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
      await initializePlugins(testDir);
      
      // Should not throw
      await expect(callHook('after:init', { projectName: 'test' })).resolves.toBeUndefined();
    });

    it('should execute multiple hooks in order', async () => {
      const plugin1Dir = path.join(testDir, '.polyglot', 'plugins', 'plugin-1');
      const plugin2Dir = path.join(testDir, '.polyglot', 'plugins', 'plugin-2');
      await fs.mkdirp(plugin1Dir);
      await fs.mkdirp(plugin2Dir);
      
      const plugin1Code = `
        export default {
          name: 'plugin-1',
          hooks: {
            'after:init': function(ctx) {
              global.testOrder = global.testOrder || [];
              global.testOrder.push('plugin-1');
            }
          }
        };
      `;
      
      const plugin2Code = `
        export default {
          name: 'plugin-2',
          hooks: {
            'after:init': function(ctx) {
              global.testOrder = global.testOrder || [];
              global.testOrder.push('plugin-2');
            }
          }
        };
      `;
      
      await fs.writeFile(path.join(plugin1Dir, 'index.js'), plugin1Code);
      await fs.writeFile(path.join(plugin2Dir, 'index.js'), plugin2Code);
      
      await initializePlugins(testDir);
      
      // Verify plugins are loaded
      expect(pluginSystem.plugins.size).toBe(2);
      expect(pluginSystem.isPluginLoaded('plugin-1')).toBe(true);
      expect(pluginSystem.isPluginLoaded('plugin-2')).toBe(true);
      
      global.testOrder = [];
      await callHook('after:init', { projectName: 'test' });
      
      expect(global.testOrder).toHaveLength(2);
      expect(global.testOrder).toContain('plugin-1');
      expect(global.testOrder).toContain('plugin-2');
    });
  });

  describe('Plugin Management', () => {
    beforeEach(async () => {
      // Create test plugin
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'management-test');
      await fs.mkdirp(pluginDir);
      
      const pluginCode = `
        export default {
          name: 'management-test',
          version: '1.0.0',
          hooks: {}
        };
      `;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
    });

    it('should enable a plugin', async () => {
      // Start with disabled plugin
      const config = await fs.readJson(path.join(testDir, 'polyglot.json'));
      config.plugins = {
        'management-test': { enabled: false }
      };
      await fs.writeJson(path.join(testDir, 'polyglot.json'), config);
      
      await initializePlugins(testDir);
      expect(pluginSystem.isPluginLoaded('management-test')).toBe(false);
      
      await pluginSystem.enablePlugin('management-test');
      expect(pluginSystem.isPluginLoaded('management-test')).toBe(true);
      
      // Check config was updated
      const updatedConfig = await fs.readJson(path.join(testDir, 'polyglot.json'));
      expect(updatedConfig.plugins['management-test'].enabled).toBe(true);
    });

    it('should disable a plugin', async () => {
      await initializePlugins(testDir);
      expect(pluginSystem.isPluginLoaded('management-test')).toBe(true);
      
      await pluginSystem.disablePlugin('management-test');
      expect(pluginSystem.isPluginLoaded('management-test')).toBe(false);
      
      // Check config was updated
      const updatedConfig = await fs.readJson(path.join(testDir, 'polyglot.json'));
      expect(updatedConfig.plugins['management-test'].enabled).toBe(false);
    });

    it('should configure a plugin', async () => {
      await initializePlugins(testDir);
      
      const newConfig = {
        priority: 5,
        customSetting: 'test-value'
      };
      
      await pluginSystem.configurePlugin('management-test', newConfig);
      
      // Check config was updated
      const updatedConfig = await fs.readJson(path.join(testDir, 'polyglot.json'));
      expect(updatedConfig.plugins['management-test'].priority).toBe(5);
      expect(updatedConfig.plugins['management-test'].customSetting).toBe('test-value');
    });

    it('should get plugin information', async () => {
      await initializePlugins(testDir);
      
      const plugin = pluginSystem.getPlugin('management-test');
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('management-test');
      expect(plugin.type).toBe('local');
      expect(plugin.enabled).toBe(true);
      expect(plugin.plugin.version).toBe('1.0.0');
    });

    it('should get all plugins', async () => {
      await initializePlugins(testDir);
      
      const plugins = pluginSystem.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('management-test');
    });

    it('should get system statistics', async () => {
      await initializePlugins(testDir);
      
      const stats = pluginSystem.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.projectDir).toBe(testDir);
      expect(stats.totalPlugins).toBe(1);
      expect(stats.enabledPlugins).toBe(1);
      expect(stats.hookPoints).toBe(Object.keys(HOOK_POINTS).length);
    });
  });

  describe('Hook Points', () => {
    it('should define all expected hook points', () => {
      expect(HOOK_POINTS).toBeDefined();
      expect(typeof HOOK_POINTS).toBe('object');
      
      const expectedHooks = [
        'before:init',
        'after:init',
        'before:template:copy',
        'after:template:copy',
        'before:dependencies:install',
        'after:dependencies:install',
        'before:service:add',
        'after:service:add',
        'before:service:remove',
        'after:service:remove',
        'before:dev:start',
        'after:dev:start',
        'before:dev:stop',
        'after:dev:stop',
        'before:docker:build',
        'after:docker:build',
        'before:compose:up',
        'after:compose:up',
        'before:hotreload:start',
        'after:hotreload:start',
        'before:hotreload:restart',
        'after:hotreload:restart',
        'before:admin:start',
        'after:admin:start',
        'before:logs:view',
        'after:logs:view',
        'before:logs:clear',
        'after:logs:clear',
        'before:plugin:load',
        'after:plugin:load',
        'before:plugin:unload',
        'after:plugin:unload'
      ];
      
      for (const hook of expectedHooks) {
        expect(HOOK_POINTS[hook]).toBeDefined();
        expect(typeof HOOK_POINTS[hook]).toBe('string');
      }
    });
  });

  describe('External Plugins', () => {
    it('should handle external plugin configuration', async () => {
      const config = await fs.readJson(path.join(testDir, 'polyglot.json'));
      config.plugins = {
        'external-plugin': {
          external: 'some-npm-package',
          enabled: true,
          priority: 10
        }
      };
      await fs.writeJson(path.join(testDir, 'polyglot.json'), config);
      
      await initializePlugins(testDir);
      
      // Should discover but not load (since package doesn't exist)
      expect(pluginSystem.pluginOrder).toHaveLength(1);
      expect(pluginSystem.pluginOrder[0].type).toBe('external');
      expect(pluginSystem.pluginOrder[0].path).toBe('some-npm-package');
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization without crashing', async () => {
      // Test with invalid directory
      await expect(initializePlugins('/nonexistent/directory')).resolves.toBeUndefined();
    });

    it('should handle hook calls before initialization', async () => {
      // Should not crash when plugin system not initialized
      await expect(callHook('after:init', {})).resolves.toBeUndefined();
    });

    it('should handle invalid plugin structure', async () => {
      const pluginDir = path.join(testDir, '.polyglot', 'plugins', 'invalid-plugin');
      await fs.mkdirp(pluginDir);
      
      // Plugin that exports non-object
      await fs.writeFile(path.join(pluginDir, 'index.js'), 'export default "not an object";');
      
      await initializePlugins(testDir);
      
      // Should continue working despite invalid plugin
      expect(pluginSystem.isInitialized).toBe(true);
      expect(pluginSystem.plugins.size).toBe(0);
    });
  });
});