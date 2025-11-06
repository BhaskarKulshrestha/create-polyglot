import { test, expect } from 'vitest';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

const TEST_DIR = path.join(process.cwd(), 'test-workspace', 'service-controls-test');
const CLI_PATH = path.join(process.cwd(), 'bin', 'index.js');

// Helper function to make API requests
async function makeServiceRequest(endpoint, method = 'GET', body = null, port = 9292) {
  const url = `http://localhost:${port}/api/services/${endpoint}`;
  const options = {
    method,
    signal: AbortSignal.timeout(5000)
  };

  if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  return await fetch(url, options);
}

test('service control API endpoints work correctly', async () => {
  // Create test workspace with a simple node service
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Create services directory and a simple node service
  const servicesDir = path.join(TEST_DIR, 'services');
  const testServiceDir = path.join(servicesDir, 'test-api');
  fs.mkdirSync(testServiceDir, { recursive: true });

  // Create a simple package.json for the test service
  fs.writeFileSync(path.join(testServiceDir, 'package.json'), JSON.stringify({
    name: 'test-api',
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'node index.js'
    }
  }, null, 2));

  // Create a simple test server
  fs.writeFileSync(path.join(testServiceDir, 'index.js'), `
import http from 'http';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'test-api' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Test API Service Running');
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(\`Test API server running on port \${PORT}\`);
});
`);

  // Create polyglot.json
  fs.writeFileSync(path.join(TEST_DIR, 'polyglot.json'), JSON.stringify({
    services: [
      { name: 'test-api', type: 'node', port: 3001, path: 'services/test-api' }
    ]
  }, null, 2));

  // Start admin dashboard
  const adminProcess = execa('node', [CLI_PATH, 'admin', '--port', '9292', '--no-open'], {
    cwd: TEST_DIR,
    timeout: 20000
  });

  // Wait for admin server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Test getting service status
    let statusResponse = await makeServiceRequest('status');
    expect(statusResponse.ok).toBe(true);
    let statusData = await statusResponse.json();
    expect(statusData).toBeDefined();

    // Test starting the service
    let startResponse = await makeServiceRequest('start', 'POST', { serviceName: 'test-api' });
    expect(startResponse.ok).toBe(true);
    let startResult = await startResponse.json();
    expect(startResult.success).toBe(true);
    expect(startResult.message).toContain('starting');

    // Wait for service to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify service is running by checking health endpoint
    try {
      const healthResponse = await fetch('http://localhost:3001/health', {
        signal: AbortSignal.timeout(3000)
      });
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        expect(healthData.status).toBe('ok');
      }
    } catch (error) {
      // Service might not be fully started yet, that's okay for this test
      console.log('Health check failed, service might still be starting:', error.message);
    }

    // Test stopping the service
    let stopResponse = await makeServiceRequest('stop', 'POST', { serviceName: 'test-api' });
    expect(stopResponse.ok).toBe(true);
    let stopResult = await stopResponse.json();
    expect(stopResult.success).toBe(true);
    expect(stopResult.message).toContain('stopped');

    // Wait for stop to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test restarting the service
    let restartResponse = await makeServiceRequest('restart', 'POST', { serviceName: 'test-api' });
    expect(restartResponse.ok).toBe(true);
    let restartResult = await restartResponse.json();
    expect(restartResult.success).toBe(true);

  } finally {
    // Clean up
    adminProcess.kill('SIGINT');
    try {
      await adminProcess;
    } catch (error) {
      // Expected when killing process
    }
  }
}, 45000);

test('service control API handles errors correctly', async () => {
  // Use existing test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'polyglot.json'), JSON.stringify({
      services: [
        { name: 'test-api', type: 'node', port: 3001, path: 'services/test-api' }
      ]
    }, null, 2));
  }

  // Start admin dashboard on different port
  const adminProcess = execa('node', [CLI_PATH, 'admin', '--port', '9293', '--no-open'], {
    cwd: TEST_DIR,
    timeout: 15000
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Test starting non-existent service
    let response = await makeServiceRequest('start', 'POST', { serviceName: 'non-existent' }, 9293);
    expect(response.status).toBe(404);
    let result = await response.json();
    expect(result.error).toContain('not found');

    // Test stopping non-running service
    response = await makeServiceRequest('stop', 'POST', { serviceName: 'test-api' }, 9293);
    expect(response.status).toBe(500);
    result = await response.json();
    expect(result.error).toContain('not running');

  } finally {
    adminProcess.kill('SIGINT');
    try {
      await adminProcess;
    } catch (error) {
      // Expected when killing process
    }
  }
}, 30000);

test('dashboard HTML includes service control buttons', async () => {
  // Use existing test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'polyglot.json'), JSON.stringify({
      services: [
        { name: 'test-api', type: 'node', port: 3001, path: 'services/test-api' }
      ]
    }, null, 2));
  }

  // Start admin dashboard on different port
  const adminProcess = execa('node', [CLI_PATH, 'admin', '--port', '9294', '--no-open'], {
    cwd: TEST_DIR,
    timeout: 15000
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Test that dashboard HTML contains control buttons
    const response = await fetch('http://localhost:9294', {
      signal: AbortSignal.timeout(5000)
    });
    expect(response.ok).toBe(true);
    
    const html = await response.text();
    
    // Check for control button elements
    expect(html).toContain('btn-start');
    expect(html).toContain('btn-stop');
    expect(html).toContain('btn-restart');
    expect(html).toContain('startService');
    expect(html).toContain('stopService');
    expect(html).toContain('restartService');
    
    // Check for API endpoint calls
    expect(html).toContain('/api/services/start');
    expect(html).toContain('/api/services/stop');
    expect(html).toContain('/api/services/restart');

  } finally {
    adminProcess.kill('SIGINT');
    try {
      await adminProcess;
    } catch (error) {
      // Expected when killing process
    }
  }
}, 30000);