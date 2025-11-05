import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import http from 'http';
import crypto from 'crypto';
import { spawn } from 'node:child_process';
import { getLogsForAPI } from './logs.js';
 
// Simple WebSocket implementation for real-time log streaming
function handleWebSocketUpgrade(request, socket, head) {
  const key = request.headers['sec-websocket-key'];
  if (!key) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ].join('\r\n');
  
  socket.write(responseHeaders);
  
  // Handle WebSocket frames (simplified - only handles text frames)
  socket.on('data', (buffer) => {
    // Simple frame parsing for text messages
    if (buffer.length > 2) {
      const opcode = buffer[0] & 0x0f;
      if (opcode === 0x01) { // Text frame
        let payloadLength = buffer[1] & 0x7f;
        let maskStart = 2;
        
        if (payloadLength === 126) {
          payloadLength = buffer.readUInt16BE(2);
          maskStart = 4;
        } else if (payloadLength === 127) {
          payloadLength = buffer.readBigUInt64BE(2);
          maskStart = 10;
        }
        
        const mask = buffer.slice(maskStart, maskStart + 4);
        const payload = buffer.slice(maskStart + 4, maskStart + 4 + Number(payloadLength));
        
        // Unmask payload
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
        
        try {
          const message = JSON.parse(payload.toString());
          handleWebSocketMessage(socket, message);
        } catch (e) {
          console.error('Invalid WebSocket message:', e.message);
        }
      }
    }
  });
  
  socket.on('close', () => {
    // Clean up any active log watchers for this socket
    if (socket.logWatcher) {
      socket.logWatcher.cleanup();
    }
  });
}

function sendWebSocketMessage(socket, message) {
  const payload = JSON.stringify(message);
  const payloadBuffer = Buffer.from(payload);
  const frame = Buffer.alloc(2 + payloadBuffer.length);
  
  frame[0] = 0x81; // FIN + text frame
  frame[1] = payloadBuffer.length;
  payloadBuffer.copy(frame, 2);
  
  socket.write(frame);
}

function handleWebSocketMessage(socket, message) {
  if (message.type === 'start_log_stream') {
    // Start streaming logs for specified service
    const serviceName = message.service;
    // For now, just send initial logs - real streaming would require file watching
    getLogsForAPI(serviceName, { tail: 50 })
      .then(logs => {
        sendWebSocketMessage(socket, {
          type: 'log_data',
          service: serviceName,
          logs: logs
        });
      })
      .catch(err => {
        sendWebSocketMessage(socket, {
          type: 'error',
          message: 'Failed to fetch logs: ' + err.message
        });
      });
  }
}
async function checkServiceStatus(service) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ status: 'down', error: 'Timeout' });
    }, 3000);
 
    const req = http.get(`http://localhost:${service.port}/health`, (res) => {
      clearTimeout(timeout);
      resolve({
        status: res.statusCode < 400 ? 'up' : 'error',
        statusCode: res.statusCode
      });
      req.destroy();
    });
 
    req.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        status: 'down',
        error: error.code || error.message
      });
    });
  });
}
 
// Check status of all services
export async function getServicesStatus(services) {
  const statusPromises = services.map(async (service) => {
    const status = await checkServiceStatus(service);
    return {
      ...service,
      ...status,
      lastChecked: new Date().toISOString()
    };
  });
 
  return Promise.all(statusPromises);
}
 
// Generate HTML dashboard
function generateDashboardHTML(servicesWithStatus, refreshInterval = 5000) {
  const statusColor = (status) => {
    switch (status) {
      case 'up': return '#0d9488'; // teal
      case 'down': return '#dc2626'; // red
      case 'error': return '#d97706'; // amber
      default: return '#64748b'; // slate
    }
  };
 
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Polyglot Admin Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, sans-serif; background:#f1f5f9; color:#0f172a; }
    a { text-decoration:none; color:#0369a1; }
    header { background:#0f172a; color:#fff; padding:16px 28px; display:flex; align-items:center; justify-content:space-between; }
    header h1 { font-size:1.25rem; font-weight:600; letter-spacing:.5px; margin:0; }
    header .meta { font-size:.75rem; opacity:.8; }
    .layout { display:flex; min-height:calc(100vh - 56px); }
    .sidebar { width:240px; background:#1e293b; color:#e2e8f0; padding:20px 16px; display:flex; flex-direction:column; gap:18px; }
    .sidebar h2 { font-size:.75rem; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin:0 0 4px; color:#94a3b8; }
    .service-list { list-style:none; margin:0; padding:0; }
    .service-list li { margin:0 0 6px; }
    .svc-link { display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:6px; font-size:.85rem; line-height:1.2; background:#334155; transition:background .15s ease; }
    .svc-link:hover { background:#475569; }
    .dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; box-shadow:0 0 0 2px rgba(0,0,0,0.15) inset; }
    .dot.up { background:#0d9488; }
    .dot.down { background:#dc2626; }
    .dot.error { background:#d97706; }
    main { flex:1; padding:28px 34px; overflow:auto; }
    .toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
    .toolbar .refresh { font-size:.75rem; color:#475569; background:#e2e8f0; padding:6px 10px; border-radius:4px; }
    table { width:100%; border-collapse:separate; border-spacing:0 6px; }
    thead th { text-align:left; font-size:.70rem; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:.75px; padding:10px 12px; }
    tbody td { background:#fff; padding:12px 12px; font-size:.8rem; vertical-align:middle; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; }
    tbody tr td:first-child { border-left:1px solid #e2e8f0; border-top-left-radius:6px; border-bottom-left-radius:6px; }
    tbody tr td:last-child { border-right:1px solid #e2e8f0; border-top-right-radius:6px; border-bottom-right-radius:6px; }
    tbody tr { transition:transform .12s ease, box-shadow .12s ease; }
    tbody tr:hover { transform:translateY(-2px); box-shadow:0 4px 24px -4px rgba(0,0,0,0.10); }
    .status-badge { display:inline-flex; align-items:center; gap:6px; font-size:.65rem; font-weight:600; letter-spacing:.5px; padding:4px 8px; border-radius:4px; background:#e2e8f0; color:#0f172a; }
    .status-badge.up { background:#0d9488; color:#fff; }
    .status-badge.down { background:#dc2626; color:#fff; }
    .status-badge.error { background:#d97706; color:#fff; }
    .path { font-family:monospace; font-size:.7rem; color:#334155; }
    .footer { margin-top:40px; font-size:.65rem; color:#64748b; text-align:center; }
    .empty { margin-top:80px; text-align:center; font-size:1rem; color:#475569; }
    
    /* Logs section styles */
    .logs-section { margin-top:40px; }
    .logs-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .logs-controls { display:flex; gap:8px; align-items:center; }
    .logs-controls select, .logs-controls input { padding:4px 8px; border:1px solid #d1d5db; border-radius:4px; font-size:.75rem; }
    .logs-controls button { padding:4px 12px; background:#0369a1; color:#fff; border:none; border-radius:4px; font-size:.75rem; cursor:pointer; }
    .logs-controls button:hover { background:#0284c7; }
    .logs-controls button.secondary { background:#6b7280; }
    .logs-controls button.secondary:hover { background:#4b5563; }
    .logs-container { background:#1e293b; color:#e2e8f0; border-radius:6px; padding:16px; height:400px; overflow-y:auto; font-family:monospace; font-size:.75rem; line-height:1.4; }
    .log-entry { margin-bottom:4px; padding:2px 0; }
    .log-entry.error { color:#f87171; }
    .log-entry.warn { color:#fbbf24; }
    .log-entry.info { color:#60a5fa; }
    .log-entry.debug { color:#9ca3af; }
    .log-timestamp { color:#6b7280; }
    .log-service { color:#a78bfa; font-weight:600; }
    .log-level { font-weight:600; margin-right:8px; }
    .logs-empty { text-align:center; color:#6b7280; padding:60px 20px; }
    
    @media (max-width: 920px) { .layout { flex-direction:column; } .sidebar { width:100%; flex-direction:row; flex-wrap:wrap; } .service-list { display:flex; flex-wrap:wrap; gap:8px; } .service-list li { margin:0; } }
  </style>
  <script>
    const REFRESH_MS = ${refreshInterval};
    let nextRefreshLabel;
    function scheduleCountdown() {
      const el = document.querySelector('.refresh');
      if (!el) return;
      let remaining = REFRESH_MS/1000;
      el.textContent = 'Next refresh in ' + remaining.toFixed(1) + 's';
      clearInterval(nextRefreshLabel);
      nextRefreshLabel = setInterval(()=>{
        remaining -= 0.5;
        if (remaining <= 0) { clearInterval(nextRefreshLabel); }
        else { el.textContent = 'Next refresh in ' + remaining.toFixed(1) + 's'; }
      }, 500);
    }
 
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        updateUI(data);
        hideError();
      } catch (e) {
        showError('Failed to refresh: ' + e.message);
      } finally {
        scheduleCountdown();
        setTimeout(fetchStatus, REFRESH_MS);
      }
    }
 
    function updateUI(services) {
      const tbody = document.querySelector('tbody');
      if (!tbody) return;
      // Update sidebar count
      const meta = document.querySelector('header .meta');
      if (meta) meta.textContent = 'Auto-refresh: ' + (REFRESH_MS/1000).toFixed(1) + 's | Services: ' + services.length;
 
      // Build rows HTML
      const rows = services.map(s => (
        '<tr id="row-'+s.name+'">'
        + '<td><strong>'+s.name+'</strong></td>'
        + '<td>'+s.type+'</td>'
        + '<td>'+s.port+'</td>'
        + '<td><span class="status-badge '+s.status+'"><span class="dot '+s.status+'" style="box-shadow:none;width:8px;height:8px;"></span>'+s.status.toUpperCase()+'</span></td>'
        + '<td><span class="path">'+(s.path || 'services/'+s.name)+'</span></td>'
        + '<td>'+new Date(s.lastChecked).toLocaleTimeString()+'</td>'
        + '<td><a href="http://localhost:'+s.port+'" target="_blank">Open</a></td>'
        + '</tr>'
      )).join('');
      tbody.innerHTML = rows;
 
      // Update sidebar dots
      services.forEach(s => {
        const link = document.querySelector('.svc-link[href="#row-'+s.name+'"] .dot');
        if (link) {
          link.className = 'dot ' + s.status; // replace classes
        }
      });
    }
 
    function showError(msg) {
      let bar = document.querySelector('#error-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'error-bar';
        bar.style.cssText = 'position:fixed;left:0;right:0;top:56px;background:#dc2626;color:#fff;padding:6px 14px;font-size:12px;font-weight:500;z-index:50;box-shadow:0 2px 6px -2px rgba(0,0,0,0.3);';
        document.body.appendChild(bar);
      }
      bar.textContent = msg;
    }
    function hideError() {
      const bar = document.querySelector('#error-bar');
      if (bar) bar.remove();
    }
 
    window.addEventListener('DOMContentLoaded', () => {
      scheduleCountdown();
      setTimeout(fetchStatus, REFRESH_MS); // initial schedule
      initializeLogs();
    });
    
    // Logs functionality
    let currentLogsFilter = {};
    let logsAutoRefresh = false;
    let logsRefreshInterval;
    let wsConnection = null;
    
    function initializeLogs() {
      const refreshBtn = document.querySelector('#logs-refresh');
      const autoRefreshBtn = document.querySelector('#logs-auto-refresh');
      const clearBtn = document.querySelector('#logs-clear');
      const exportBtn = document.querySelector('#logs-export');
      const streamBtn = document.querySelector('#logs-stream');
      const serviceFilter = document.querySelector('#logs-service-filter');
      const levelFilter = document.querySelector('#logs-level-filter');
      const searchInput = document.querySelector('#logs-search');
      
      refreshBtn?.addEventListener('click', fetchLogs);
      autoRefreshBtn?.addEventListener('click', toggleAutoRefresh);
      streamBtn?.addEventListener('click', toggleLogStream);
      clearBtn?.addEventListener('click', clearLogs);
      exportBtn?.addEventListener('click', exportLogs);
      serviceFilter?.addEventListener('change', updateLogsFilter);
      levelFilter?.addEventListener('change', updateLogsFilter);
      searchInput?.addEventListener('input', debounce(updateLogsFilter, 500));
      
      fetchLogs(); // Initial load
    }
    
    function initWebSocket() {
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        return wsConnection;
      }
      
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + location.host + '/ws';
      
      wsConnection = new WebSocket(wsUrl);
      
      wsConnection.onopen = function() {
        console.log('WebSocket connected');
      };
      
      wsConnection.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
      
      wsConnection.onclose = function() {
        console.log('WebSocket disconnected');
        wsConnection = null;
      };
      
      wsConnection.onerror = function(error) {
        console.error('WebSocket error:', error);
      };
      
      return wsConnection;
    }
    
    function handleWebSocketMessage(data) {
      if (data.type === 'log_data') {
        renderLogs(data.logs);
      } else if (data.type === 'error') {
        renderLogsError(data.message);
      }
    }
    
    function toggleLogStream() {
      const btn = document.querySelector('#logs-stream');
      if (!btn) return;
      
      if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        initWebSocket();
        btn.textContent = 'Stop Stream';
        btn.style.background = '#dc2626';
        
        // Start streaming for current service filter
        const serviceFilter = document.querySelector('#logs-service-filter');
        const service = serviceFilter?.value || null;
        
        wsConnection.onopen = function() {
          wsConnection.send(JSON.stringify({
            type: 'start_log_stream',
            service: service
          }));
        };
      } else {
        wsConnection.close();
        btn.textContent = 'Live Stream';
        btn.style.background = '#0369a1';
      }
    }
    
    function updateLogsFilter() {
      const serviceFilter = document.querySelector('#logs-service-filter');
      const levelFilter = document.querySelector('#logs-level-filter');
      const searchInput = document.querySelector('#logs-search');
      
      currentLogsFilter = {
        service: serviceFilter?.value || '',
        level: levelFilter?.value || '',
        filter: searchInput?.value || ''
      };
      
      fetchLogs();
    }
    
    async function fetchLogs() {
      try {
        const params = new URLSearchParams();
        params.set('tail', '100');
        
        if (currentLogsFilter.service) params.set('service', currentLogsFilter.service);
        if (currentLogsFilter.level) params.set('level', currentLogsFilter.level);
        if (currentLogsFilter.filter) params.set('filter', currentLogsFilter.filter);
        
        const res = await fetch('/api/logs?' + params.toString());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        
        const logs = await res.json();
        renderLogs(logs);
      } catch (e) {
        console.error('Failed to fetch logs:', e);
        renderLogsError('Failed to fetch logs: ' + e.message);
      }
    }
    
    function renderLogs(logs) {
      const container = document.querySelector('#logs-container');
      if (!container) return;
      
      if (logs.length === 0) {
        container.innerHTML = '<div class="logs-empty">No logs found matching the current filters.</div>';
        return;
      }
      
      const html = logs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const levelClass = log.level.toLowerCase();
        return '<div class="log-entry ' + levelClass + '">' +
               '<span class="log-timestamp">' + timestamp + '</span> ' +
               '<span class="log-service">' + log.service.padEnd(10) + '</span> ' +
               '<span class="log-level ' + levelClass + '">' + log.level.toUpperCase().padEnd(5) + '</span> ' +
               '<span class="log-message">' + escapeHtml(log.message) + '</span>' +
               '</div>';
      }).join('');
      
      container.innerHTML = html;
      container.scrollTop = container.scrollHeight; // Auto-scroll to bottom
    }
    
    function renderLogsError(message) {
      const container = document.querySelector('#logs-container');
      if (container) {
        container.innerHTML = '<div class="logs-empty" style="color:#f87171;">' + escapeHtml(message) + '</div>';
      }
    }
    
    function toggleAutoRefresh() {
      const btn = document.querySelector('#logs-auto-refresh');
      if (!btn) return;
      
      logsAutoRefresh = !logsAutoRefresh;
      
      if (logsAutoRefresh) {
        btn.textContent = 'Stop Auto-Refresh';
        btn.style.background = '#dc2626';
        logsRefreshInterval = setInterval(fetchLogs, 3000);
      } else {
        btn.textContent = 'Auto-Refresh';
        btn.style.background = '#0369a1';
        clearInterval(logsRefreshInterval);
      }
    }
    
    function clearLogs() {
      if (!confirm('Are you sure you want to clear all logs? This action cannot be undone.')) return;
      
      // Note: This would need a backend endpoint to actually clear logs
      alert('Clear logs functionality would need to be implemented on the backend.');
    }
    
    function exportLogs() {
      // Create export URL with current filters
      const params = new URLSearchParams();
      params.set('tail', '1000'); // Export more logs
      
      if (currentLogsFilter.service) params.set('service', currentLogsFilter.service);
      if (currentLogsFilter.level) params.set('level', currentLogsFilter.level);
      if (currentLogsFilter.filter) params.set('filter', currentLogsFilter.filter);
      
      window.open('/api/logs?' + params.toString(), '_blank');
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }
  </script>
</head>
<body>
  <header>
    <h1>Polyglot Admin Dashboard</h1>
    <div class="meta">Auto-refresh: ${(refreshInterval/1000).toFixed(1)}s | Services: ${servicesWithStatus.length}</div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div>
        <h2>Services</h2>
        <ul class="service-list">
          ${servicesWithStatus.map(s => `<li><a class="svc-link" href="#row-${s.name}"><span class="dot ${s.status}"></span><span>${s.name}</span></a></li>`).join('') || '<li style="font-size:.8rem;color:#64748b;">No services</li>'}
        </ul>
      </div>
      <div>
        <h2>Status Legend</h2>
        <ul class="service-list" style="font-size:.65rem;">
          <li class="svc-link" style="background:#334155"><span class="dot up"></span>UP</li>
          <li class="svc-link" style="background:#334155"><span class="dot down"></span>DOWN</li>
          <li class="svc-link" style="background:#334155"><span class="dot error"></span>ERROR</li>
        </ul>
      </div>
    </aside>
    <main>
      <div class="toolbar">
        <div style="font-size:.8rem; font-weight:500; color:#334155;">Service Overview</div>
        <div class="refresh">Next refresh in ${(refreshInterval/1000).toFixed(1)}s</div>
      </div>
      ${servicesWithStatus.length === 0 ? `<div class="empty">No services found. Run inside a generated polyglot workspace.</div>` : `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Port</th>
            <th>Status</th>
            <th>Path</th>
            <th>Last Checked</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          ${servicesWithStatus.map(s => `
            <tr id="row-${s.name}">
              <td><strong>${s.name}</strong></td>
              <td>${s.type}</td>
              <td>${s.port}</td>
              <td><span class="status-badge ${s.status}"><span class="dot ${s.status}" style="box-shadow:none;width:8px;height:8px;"></span>${s.status.toUpperCase()}</span></td>
              <td><span class="path">${s.path || `services/${s.name}`}</span></td>
              <td>${new Date(s.lastChecked).toLocaleTimeString()}</td>
              <td><a href="http://localhost:${s.port}" target="_blank">Open</a></td>
            </tr>`).join('')}
        </tbody>
      </table>`}
      
      <!-- Logs Section -->
      <div class="logs-section">
        <div class="logs-header">
          <h2 style="font-size:1rem; font-weight:600; color:#334155; margin:0;">Service Logs</h2>
          <div class="logs-controls">
            <select id="logs-service-filter">
              <option value="">All Services</option>
              ${servicesWithStatus.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
            </select>
            <select id="logs-level-filter">
              <option value="">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
            <input type="text" id="logs-search" placeholder="Search logs..." style="width:150px;">
            <button id="logs-refresh">Refresh</button>
            <button id="logs-auto-refresh" class="secondary">Auto-Refresh</button>
            <button id="logs-stream" class="secondary">Live Stream</button>
            <button id="logs-export" class="secondary">Export</button>
            <button id="logs-clear" class="secondary">Clear</button>
          </div>
        </div>
        <div id="logs-container" class="logs-container">
          <div class="logs-empty">Loading logs...</div>
        </div>
      </div>
      
      <div class="footer">Polyglot Admin · Generated by create-polyglot</div>
    </main>
  </div>
</body>
</html>`;
}
 
// Start admin dashboard server
export async function startAdminDashboard(options = {}) {
  const cwd = process.cwd();
  const configPath = path.join(cwd, 'polyglot.json');
  
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red('❌ polyglot.json not found. Run inside a generated workspace.'));
    process.exit(1);
  }
  
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const port = options.port || 8080;
  const refreshInterval = options.refresh || 5000;
  
  console.log(chalk.cyan('🚀 Starting Admin Dashboard...'));
  console.log(chalk.gray(`   Monitoring ${cfg.services.length} services`));
  console.log(chalk.gray(`   Dashboard URL: http://localhost:${port}`));
  console.log(chalk.gray(`   Refresh interval: ${refreshInterval / 1000}s`));
  console.log(chalk.yellow('   Press Ctrl+C to stop\n'));
  
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    
    if (url.pathname === '/api/status') {
      // API endpoint for service status
      const servicesWithStatus = await getServicesStatus(cfg.services);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(servicesWithStatus, null, 2));
      return;
    }
    
    if (url.pathname === '/api/logs') {
      // API endpoint for logs
      try {
        const serviceName = url.searchParams.get('service');
        const tail = url.searchParams.get('tail') || '100';
        const level = url.searchParams.get('level');
        const since = url.searchParams.get('since');
        const filter = url.searchParams.get('filter');
        
        const logs = await getLogsForAPI(serviceName, {
          tail: parseInt(tail),
          level,
          since,
          filter
        });
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(logs, null, 2));
      } catch (e) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    
    // Serve dashboard HTML
    const servicesWithStatus = await getServicesStatus(cfg.services);
    const html = generateDashboardHTML(servicesWithStatus, refreshInterval);
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  
  server.listen(port, () => {
    console.log(chalk.green(`✅ Admin Dashboard running at http://localhost:${port}`));
    
    // Auto-open browser if requested
    if (options.open !== false) {
      const openCmd = process.platform === 'darwin' ? 'open' :
                     process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(openCmd, [`http://localhost:${port}`], { detached: true, stdio: 'ignore' });
    }
  });
  
  // Handle WebSocket upgrades
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      handleWebSocketUpgrade(request, socket, head);
    } else {
      socket.end();
    }
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Shutting down Admin Dashboard...'));
    server.close(() => {
      console.log(chalk.green('✅ Dashboard stopped'));
      process.exit(0);
    });
  });
  
  // Log service status updates periodically
  setInterval(async () => {
    const servicesWithStatus = await getServicesStatus(cfg.services);
    const upCount = servicesWithStatus.filter(s => s.status === 'up').length;
    const downCount = servicesWithStatus.filter(s => s.status === 'down').length;
    const errorCount = servicesWithStatus.filter(s => s.status === 'error').length;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.gray(`[${timestamp}] Services: ${chalk.green(upCount + ' up')}, ${chalk.red(downCount + ' down')}, ${chalk.yellow(errorCount + ' error')}`));
  }, refreshInterval);
  
  return server;
}