import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import http from 'http';
import { spawn } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { getLogsForAPI, LogFileWatcher } from './logs.js';
import { startService, stopService, restartService, getServiceStatus, getAllServiceStatuses, validateServiceCanRun } from './service-manager.js';
import { initializePlugins, callHook } from './plugin-system.js';
 
// ws helper
function sendWebSocketMessage(ws, message) {
  // Use WebSocket.OPEN constant (instance does not expose OPEN reliably)
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      // Silently ignore send failures; connection will be cleaned by heartbeat
    }
  }
}

// Global log watcher instance
let globalLogWatcher = null;
let wsServer = null;

async function handleWebSocketMessage(ws, message) {
  if (message.type === 'start_log_stream') {
    ws.serviceFilter = message.service || null;
    if (!globalLogWatcher) {
      sendWebSocketMessage(ws, { type: 'error', message: 'Log watcher not initialized' });
      return;
    }
    let logs = globalLogWatcher.getCurrentLogs(ws.serviceFilter, { tail: 100 });
    // Fallback: if no logs found but service specified, attempt direct file read
    if (logs.length === 0) {
      try {
        logs = await getLogsForAPI(ws.serviceFilter, { tail: 100 });
      } catch (e) {
        // ignore fallback failure
      }
    }
    sendWebSocketMessage(ws, { type: 'log_data', service: ws.serviceFilter, logs });
  } else if (message.type === 'stop_log_stream') {
    ws.serviceFilter = null;
  }
}

// Set up listener for real-time log updates
function broadcastLogEvent(event, payload) {
  if (!wsServer) return;
  wsServer.clients.forEach(ws => {
    if (ws.readyState !== WebSocket.OPEN) return;
    // Filter by service if client requested specific service
    if (ws.serviceFilter && payload.service !== ws.serviceFilter) return;
    if (event === 'logsUpdated') {
      sendWebSocketMessage(ws, {
        type: 'log_update',
        service: payload.service,
        logs: (payload.logs || []).map(log => ({
          timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
          level: log.level,
          service: log.service,
          message: log.message,
          data: log.data
        })),
        event: payload.event || 'change'
      });
    } else if (event === 'logsCleared') {
      sendWebSocketMessage(ws, { type: 'logs_cleared', service: payload.service });
    }
  });
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
    const healthStatus = await checkServiceStatus(service);
    const processStatus = getServiceStatus(service.name);
    
    // Combine health check and process management status
    const combinedStatus = {
      ...service,
      ...healthStatus,
      processStatus: processStatus.status,
      pid: processStatus.pid,
      uptime: processStatus.uptime,
      processStartTime: processStatus.startTime,
      lastChecked: new Date().toISOString()
    };
    
    // Override status if we know the process is managed locally
    if (processStatus.status === 'running' && healthStatus.status === 'down') {
      combinedStatus.status = 'starting'; // Process running but not responding yet
    } else if (processStatus.status === 'stopped' && healthStatus.status === 'up') {
      combinedStatus.status = 'up'; // Running externally but show as up
      combinedStatus.processStatus = 'external'; // Keep track that it's external
    }
    
    return combinedStatus;
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
    
    /* Service control buttons */
    .service-controls { display:flex; gap:4px; flex-wrap:wrap; }
    .btn-sm { padding:3px 8px; font-size:0.7rem; border:none; border-radius:3px; cursor:pointer; color:#fff; transition:opacity 0.2s; }
    .btn-sm:disabled { opacity:0.5; cursor:not-allowed; }
    .btn-start { background:#10b981; }
    .btn-start:hover:not(:disabled) { background:#059669; }
    .btn-stop { background:#ef4444; }
    .btn-stop:hover:not(:disabled) { background:#dc2626; }
    .btn-restart { background:#f59e0b; }
    .btn-restart:hover:not(:disabled) { background:#d97706; }
    
    /* Additional status styles */
    .status-badge.starting { background:#f59e0b; color:#fff; }
    .status-badge.external { background:#8b5cf6; color:#fff; }
    .dot.starting { background:#f59e0b; }
    .dot.external { background:#8b5cf6; }
    
    @media (max-width: 920px) { .layout { flex-direction:column; } .sidebar { width:100%; flex-direction:row; flex-wrap:wrap; } .service-list { display:flex; flex-wrap:wrap; gap:8px; } .service-list li { margin:0; } }
  </style>
  <script>
    var REFRESH_MS = ${refreshInterval};
    var nextRefreshLabel;
    
    function startService(serviceName) {
      // Show loading state
      updateButtonState(serviceName, 'starting');
      
      fetch('/api/services/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName: serviceName })
      })
      .then(function(response) { 
        if (!response.ok) {
          throw new Error('Network error: ' + response.status);
        }
        return response.json(); 
      })
      .then(function(result) {
        if (result.error) {
          showUserFriendlyError('start', serviceName, result.error);
        } else {
          showUserFriendlySuccess('Started', serviceName);
          setTimeout(fetchStatus, 1000);
        }
      })
      .catch(function(error) {
        showUserFriendlyError('start', serviceName, error.message);
      })
      .finally(function() {
        // Reset button state after operation
        setTimeout(fetchStatus, 500);
      });
    }

    function stopService(serviceName) {
      // Show loading state
      updateButtonState(serviceName, 'stopping');
      
      fetch('/api/services/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName: serviceName })
      })
      .then(function(response) { 
        if (!response.ok) {
          throw new Error('Network error: ' + response.status);
        }
        return response.json(); 
      })
      .then(function(result) {
        if (result.error) {
          showUserFriendlyError('stop', serviceName, result.error);
        } else {
          showUserFriendlySuccess('Stopped', serviceName);
          setTimeout(fetchStatus, 1000);
        }
      })
      .catch(function(error) {
        showUserFriendlyError('stop', serviceName, error.message);
      })
      .finally(function() {
        // Reset button state after operation
        setTimeout(fetchStatus, 500);
      });
    }

    function restartService(serviceName) {
      // Show loading state
      updateButtonState(serviceName, 'restarting');
      
      fetch('/api/services/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName: serviceName })
      })
      .then(function(response) { 
        if (!response.ok) {
          throw new Error('Network error: ' + response.status);
        }
        return response.json(); 
      })
      .then(function(result) {
        if (result.error) {
          showUserFriendlyError('restart', serviceName, result.error);
        } else {
          showUserFriendlySuccess('Restarted', serviceName);
          setTimeout(fetchStatus, 1000);
        }
      })
      .catch(function(error) {
        showUserFriendlyError('restart', serviceName, error.message);
      })
      .finally(function() {
        // Reset button state after operation
        setTimeout(fetchStatus, 1000);
      });
    }
    
    // Helper functions for better user feedback
    function showUserFriendlyError(action, serviceName, errorMessage) {
      let userMessage = '';
      let suggestions = '';
      
      // Parse common error patterns and provide helpful messages
      if (errorMessage.includes('already running')) {
        userMessage = serviceName + ' is already running';
        suggestions = 'Try refreshing the page or restart the service instead.';
      } else if (errorMessage.includes('not running')) {
        userMessage = serviceName + ' is not currently running';
        suggestions = 'Try starting the service first.';
      } else if (errorMessage.includes('Service directory not found')) {
        userMessage = serviceName + ' directory not found';
        suggestions = 'Check if the service exists in the services/ folder.';
      } else if (errorMessage.includes('Unsupported service type')) {
        userMessage = serviceName + ' has an unsupported service type';
        suggestions = 'This service type cannot be managed through the dashboard.';
      } else if (errorMessage.includes('Network error')) {
        userMessage = 'Connection problem';
        suggestions = 'Check if the admin dashboard is running properly and try again.';
      } else if (errorMessage.includes('Port') && errorMessage.includes('in use')) {
        userMessage = serviceName + ' cannot start - port is already in use';
        suggestions = 'Another process might be using the same port. Check for conflicts.';
      } else if (errorMessage.includes('permission') || errorMessage.includes('EACCES')) {
        userMessage = 'Permission denied';
        suggestions = 'Check file permissions or try running with appropriate privileges.';
      } else if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        userMessage = 'Required files or commands not found';
        suggestions = 'Make sure all dependencies are installed (npm install, python packages, etc).';
      } else {
        userMessage = 'Failed to ' + action + ' ' + serviceName;
        suggestions = 'Check the service logs for more details.';
      }
      
      showNotification('❌ ' + userMessage, suggestions, 'error');
    }
    
    function showUserFriendlySuccess(action, serviceName) {
      const messages = {
        'Started': '✅ ' + serviceName + ' started successfully',
        'Stopped': '🛑 ' + serviceName + ' stopped successfully', 
        'Restarted': '🔄 ' + serviceName + ' restarted successfully'
      };
      showNotification(messages[action] || action + ' ' + serviceName, '', 'success');
    }
    
    function updateButtonState(serviceName, state) {
      const row = document.querySelector('#row-' + serviceName);
      if (!row) return;
      
      const buttons = row.querySelectorAll('.service-controls button');
      buttons.forEach(function(btn) {
        if (state === 'starting' && btn.classList.contains('btn-start')) {
          btn.disabled = true;
          btn.textContent = 'Starting...';
        } else if (state === 'stopping' && btn.classList.contains('btn-stop')) {
          btn.disabled = true;
          btn.textContent = 'Stopping...';
        } else if (state === 'restarting' && btn.classList.contains('btn-restart')) {
          btn.disabled = true;
          btn.textContent = 'Restarting...';
        }
      });
    }
    
    function showNotification(message, suggestion, type) {
      // Remove any existing notifications
      const existing = document.querySelector('#service-notification');
      if (existing) existing.remove();
      
      // Create notification element
      const notification = document.createElement('div');
      notification.id = 'service-notification';
      notification.style.cssText = 
        'position: fixed; top: 20px; right: 20px; max-width: 400px; padding: 16px; ' +
        'border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; ' +
        'font-family: system-ui, -apple-system, sans-serif; line-height: 1.4;' +
        (type === 'error' 
          ? 'background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;' 
          : 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d;');
      
      let content = '<div style="font-weight: 600; margin-bottom: 4px;">' + message + '</div>';
      if (suggestion) {
        content += '<div style="font-size: 0.9em; opacity: 0.8;">' + suggestion + '</div>';
      }
      notification.innerHTML = content;
      
      document.body.appendChild(notification);
      
      // Auto-hide after 5 seconds
      setTimeout(function() {
        if (notification.parentNode) {
          notification.style.opacity = '0';
          notification.style.transform = 'translateX(100%)';
          setTimeout(function() { notification.remove(); }, 300);
        }
      }, 5000);
      
      // Add transition for smooth appearance
      notification.style.transform = 'translateX(100%)';
      notification.style.transition = 'all 0.3s ease';
      setTimeout(function() {
        notification.style.transform = 'translateX(0)';
      }, 50);
    }
    
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
      const rows = services.map(s => {
        const processInfo = s.processStatus && s.processStatus !== 'stopped' ? 
          '<div style="font-size:0.6rem;color:#6b7280;margin-top:2px;">' + 
          (s.processStatus === 'external' ? 'External Process' : 'PID: ' + (s.pid || 'N/A') + ' | Uptime: ' + (s.uptime ? Math.floor(s.uptime / 60) + 'm' : '0m')) +
          '</div>' : '';
        
        return '<tr id="row-'+s.name+'">'
        + '<td><strong>'+s.name+'</strong></td>'
        + '<td>'+s.type+'</td>'
        + '<td>'+s.port+'</td>'
        + '<td><span class="status-badge '+s.status+'"><span class="dot '+s.status+'" style="box-shadow:none;width:8px;height:8px;"></span>'+s.status.toUpperCase()+'</span>' + processInfo + '</td>'
        + '<td><span class="path">'+(s.path || 'services/'+s.name)+'</span></td>'
        + '<td><div class="service-controls">'
        + '<button class="btn-sm btn-start" data-service="'+s.name+'" '+(s.processStatus === 'running' || s.processStatus === 'external' ? 'disabled' : '')+'>Start</button>'
        + '<button class="btn-sm btn-stop" data-service="'+s.name+'" '+(s.processStatus === 'stopped' || s.processStatus === 'external' ? 'disabled' : '')+'>Stop</button>'
        + '<button class="btn-sm btn-restart" data-service="'+s.name+'" '+(s.processStatus === 'external' ? 'disabled' : '')+'>Restart</button>'
        + '</div></td>'
        + '<td><a href="http://localhost:'+s.port+'" target="_blank">Open</a></td>'
        + '</tr>';
      }).join('');
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
      initializeMetricsCharts();
      
      // Start metrics updates
      setInterval(updateMetricsCharts, 5000); // Update every 5 seconds
      
      // Event delegation for service control buttons
      document.addEventListener('click', function(event) {
        var target = event.target;
        var serviceName = target.getAttribute('data-service');
        
        if (!serviceName || target.disabled) return;
        
        if (target.classList.contains('btn-start')) {
          startService(serviceName);
        } else if (target.classList.contains('btn-stop')) {
          stopService(serviceName);
        } else if (target.classList.contains('btn-restart')) {
          restartService(serviceName);
        }
      });
    });
    
    // Logs functionality (auto-stream)
    let currentLogsFilter = {};
    let wsConnection = null;
    let allLogsCache = [];
    
    function initializeLogs() {
      const clearBtn = document.querySelector('#logs-clear');
      const exportBtn = document.querySelector('#logs-export');
      const serviceFilter = document.querySelector('#logs-service-filter');
      const levelFilter = document.querySelector('#logs-level-filter');
      const searchInput = document.querySelector('#logs-search');
      
      clearBtn?.addEventListener('click', clearLogs);
      exportBtn?.addEventListener('click', exportLogs);
      serviceFilter?.addEventListener('change', updateLogsFilter);
      levelFilter?.addEventListener('change', updateLogsFilter);
      searchInput?.addEventListener('input', debounce(updateLogsFilter, 500));
      
      startLogStream();
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
        scheduleReconnect();
      };
      
      wsConnection.onerror = function(error) {
        console.error('WebSocket error:', error);
        // Attempt reconnect after error
        scheduleReconnect();
      };
      
      return wsConnection;
    }
    
    function handleWebSocketMessage(data) {
      if (data.type === 'log_data') {
        allLogsCache = data.logs.slice();
        renderLogs(applyClientFilters(allLogsCache));
      } else if (data.type === 'log_update') {
        allLogsCache = allLogsCache.concat(data.logs);
        if (allLogsCache.length > 5000) allLogsCache = allLogsCache.slice(-5000);
        renderLogs(applyClientFilters(allLogsCache));
      } else if (data.type === 'logs_cleared') {
        allLogsCache = allLogsCache.filter(l => l.service !== data.service);
        renderLogs(applyClientFilters(allLogsCache));
      } else if (data.type === 'error') {
        renderLogsError(data.message);
      }
    }
    
    function startLogStream() {
      const ws = initWebSocket();
      const serviceFilter = document.querySelector('#logs-service-filter');
      const service = serviceFilter?.value || null;
      const sendStart = () => ws.send(JSON.stringify({ type: 'start_log_stream', service }));
      if (ws.readyState === WebSocket.OPEN) sendStart(); else ws.onopen = sendStart;
    }
    
    // Removed stop/toggle/update stream button functions (always streaming)
    
    function updateLogsFilter() {
      const serviceFilter = document.querySelector('#logs-service-filter');
      const levelFilter = document.querySelector('#logs-level-filter');
      const searchInput = document.querySelector('#logs-search');
      
      currentLogsFilter = {
        service: serviceFilter?.value || '',
        level: levelFilter?.value || '',
        filter: searchInput?.value || ''
      };
      
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({ type: 'start_log_stream', service: currentLogsFilter.service || null }));
      }
      renderLogs(applyClientFilters(allLogsCache));
    }
    
    // Client-side filtering of cached logs
    function applyClientFilters(logs) {
      let filtered = logs.slice();
      if (currentLogsFilter.service) filtered = filtered.filter(l => l.service === currentLogsFilter.service);
      if (currentLogsFilter.level) filtered = filtered.filter(l => l.level === currentLogsFilter.level);
      if (currentLogsFilter.filter) {
        const re = new RegExp(currentLogsFilter.filter, 'i');
        filtered = filtered.filter(l => re.test(l.message) || re.test(JSON.stringify(l.data || {})));
      }
      return filtered.slice(-1000);
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
    
    // appendLogs removed; updates re-render entire filtered set
    
    function renderLogsError(message) {
      const container = document.querySelector('#logs-container');
      if (container) {
        container.innerHTML = '<div class="logs-empty" style="color:#f87171;">' + escapeHtml(message) + '</div>';
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

    // --- Reconnection logic ---
    let reconnectAttempts = 0;
    const MAX_RECONNECT_DELAY = 30000; // 30s cap
    function scheduleReconnect() {
      // Don't reconnect if page is unloading
      if (document.visibilityState === 'unloading') return;
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
      console.log('Scheduling WebSocket reconnect in', delay, 'ms');
      setTimeout(() => {
        initWebSocket();
        // restart stream with current filter
        const service = (currentLogsFilter.service || '');
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({ type: 'start_log_stream', service: service || null }));
        } else if (wsConnection) {
          wsConnection.onopen = () => wsConnection.send(JSON.stringify({ type: 'start_log_stream', service: service || null }));
        }
      }, delay);
    }

    function showServiceAction(message, type) {
      // Create or update action message element
      let actionMsg = document.querySelector('#service-action-msg');
      if (!actionMsg) {
        actionMsg = document.createElement('div');
        actionMsg.id = 'service-action-msg';
        actionMsg.style.cssText = 'position:fixed;top:70px;right:20px;padding:10px 15px;border-radius:4px;font-weight:500;z-index:1000;transition:opacity 0.3s;';
        document.body.appendChild(actionMsg);
      }
      
      // Set message and styling
      actionMsg.textContent = message;
      actionMsg.style.backgroundColor = type === 'success' ? '#10b981' : '#ef4444';
      actionMsg.style.color = 'white';
      actionMsg.style.opacity = '1';
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        actionMsg.style.opacity = '0';
        setTimeout(() => {
          if (actionMsg.parentNode) {
            actionMsg.parentNode.removeChild(actionMsg);
          }
        }, 300);
      }, 3000);
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    // Metrics visualization with Chart.js
    let metricsCharts = {};
    
    function initializeMetricsCharts() {
      // CPU Chart
      const cpuCtx = document.getElementById('cpu-chart');
      if (cpuCtx) {
        metricsCharts.cpu = new Chart(cpuCtx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'CPU Usage %',
              data: [],
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 100 } }
          }
        });
      }
      
      // Memory Chart  
      const memoryCtx = document.getElementById('memory-chart');
      if (memoryCtx) {
        metricsCharts.memory = new Chart(memoryCtx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'Memory Usage %',
              data: [],
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 100 } }
          }
        });
      }
      
      // Network Chart
      const networkCtx = document.getElementById('network-chart');
      if (networkCtx) {
        metricsCharts.network = new Chart(networkCtx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'Network RX (MB/s)',
              data: [],
              borderColor: 'rgb(54, 162, 235)',
              backgroundColor: 'rgba(54, 162, 235, 0.1)',
              tension: 0.1
            }, {
              label: 'Network TX (MB/s)',
              data: [],
              borderColor: 'rgb(255, 206, 86)',
              backgroundColor: 'rgba(255, 206, 86, 0.1)',
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
          }
        });
      }
      
      // Disk Chart
      const diskCtx = document.getElementById('disk-chart');
      if (diskCtx) {
        metricsCharts.disk = new Chart(diskCtx, {
          type: 'doughnut',
          data: {
            labels: ['Used', 'Available'],
            datasets: [{
              data: [0, 100],
              backgroundColor: ['rgb(255, 99, 132)', 'rgb(75, 192, 192)']
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom' }
            }
          }
        });
      }
    }
    
    async function updateMetricsCharts() {
      try {
        const response = await fetch('/api/metrics');
        if (!response.ok) return;
        
        const data = await response.json();
        const timestamp = new Date().toLocaleTimeString();
        
        // Update CPU chart
        if (metricsCharts.cpu && data.metrics.cpu) {
          const chart = metricsCharts.cpu;
          chart.data.labels.push(timestamp);
          chart.data.datasets[0].data.push(data.metrics.cpu.percent || 0);
          if (chart.data.labels.length > 20) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
          }
          chart.update('none');
        }
        
        // Update Memory chart
        if (metricsCharts.memory && data.metrics.memory) {
          const chart = metricsCharts.memory;
          chart.data.labels.push(timestamp);
          chart.data.datasets[0].data.push(data.metrics.memory.percent || 0);
          if (chart.data.labels.length > 20) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
          }
          chart.update('none');
        }
        
        // Update Network chart
        if (metricsCharts.network && data.metrics.network) {
          const chart = metricsCharts.network;
          chart.data.labels.push(timestamp);
          chart.data.datasets[0].data.push((data.metrics.network.rx_sec || 0) / (1024 * 1024)); // MB/s
          chart.data.datasets[1].data.push((data.metrics.network.tx_sec || 0) / (1024 * 1024)); // MB/s
          if (chart.data.labels.length > 20) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
          }
          chart.update('none');
        }
        
        // Update Disk chart
        if (metricsCharts.disk && data.metrics.disk) {
          const chart = metricsCharts.disk;
          const used = data.metrics.disk.used || 0;
          const total = data.metrics.disk.total || 1;
          const available = total - used;
          chart.data.datasets[0].data = [used, available];
          chart.update('none');
        }
      } catch (e) {
        console.warn('Failed to update metrics charts:', e);
      }
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
            <th>Controls</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          ${servicesWithStatus.map(s => `
            <tr id="row-${s.name}">
              <td><strong>${s.name}</strong></td>
              <td>${s.type}</td>
              <td>${s.port}</td>
              <td>
                <span class="status-badge ${s.status}">
                  <span class="dot ${s.status}" style="box-shadow:none;width:8px;height:8px;"></span>
                  ${s.status.toUpperCase()}
                </span>
                ${s.processStatus && s.processStatus !== 'stopped' ? `
                  <div style="font-size:0.6rem;color:#6b7280;margin-top:2px;">
                    ${s.processStatus === 'external' ? 'External Process' : `PID: ${s.pid || 'N/A'} | Uptime: ${s.uptime ? Math.floor(s.uptime / 60) + 'm' : '0m'}`}
                  </div>
                ` : ''}
              </td>
              <td><span class="path">${s.path || `services/${s.name}`}</span></td>
              <td>
                <div class="service-controls">
                  <button class="btn-sm btn-start" data-service="${s.name}" 
                          ${s.processStatus === 'running' || s.processStatus === 'external' ? 'disabled' : ''}>
                    Start
                  </button>
                  <button class="btn-sm btn-stop" data-service="${s.name}" 
                          ${s.processStatus === 'stopped' || s.processStatus === 'external' ? 'disabled' : ''}>
                    Stop
                  </button>
                  <button class="btn-sm btn-restart" data-service="${s.name}"
                          ${s.processStatus === 'external' ? 'disabled' : ''}>
                    Restart
                  </button>
                </div>
              </td>
              <td><a href="http://localhost:${s.port}" target="_blank">Open</a></td>
            </tr>`).join('')}
        </tbody>
      </table>`}
      
      <!-- Metrics Section -->
      <div class="metrics-section" style="margin-top:30px;">
        <div style="margin-bottom:20px;">
          <h2 style="font-size:1rem; font-weight:600; color:#334155; margin:0 0 16px;">Resource Monitoring</h2>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px;">
            <div style="background:#fff; padding:16px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="font-size:0.9rem; margin:0 0 12px; color:#374151;">CPU Usage</h3>
              <canvas id="cpu-chart" width="400" height="200"></canvas>
            </div>
            <div style="background:#fff; padding:16px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="font-size:0.9rem; margin:0 0 12px; color:#374151;">Memory Usage</h3>
              <canvas id="memory-chart" width="400" height="200"></canvas>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div style="background:#fff; padding:16px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="font-size:0.9rem; margin:0 0 12px; color:#374151;">Network I/O</h3>
              <canvas id="network-chart" width="400" height="200"></canvas>
            </div>
            <div style="background:#fff; padding:16px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="font-size:0.9rem; margin:0 0 12px; color:#374151;">Disk I/O</h3>
              <canvas id="disk-chart" width="400" height="200"></canvas>
            </div>
          </div>
        </div>
      </div>
      
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
              <!-- Live Stream button removed: streaming now always on -->
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
  
  // Initialize plugins
  await initializePlugins(cwd);
  
  // Call before:admin:start hook
  await callHook('before:admin:start', {
    projectDir: cwd,
    options
  });
  
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const port = options.port || 8080;
  const refreshInterval = options.refresh || 5000;
  
  console.log(chalk.cyan('🚀 Starting Admin Dashboard...'));
  console.log(chalk.gray(`   Monitoring ${cfg.services.length} services`));
  console.log(chalk.gray(`   Dashboard URL: http://localhost:${port}`));
  console.log(chalk.gray(`   Refresh interval: ${refreshInterval / 1000}s`));
  console.log(chalk.yellow('   Press Ctrl+C to stop\n'));

  // Initialize log file watcher
// Helper function to get system metrics
async function getSystemMetrics() {
  try {
    // Import systeminformation dynamically to avoid dependency issues in tests
    const si = await import('systeminformation');
    
    const [cpuInfo, cpuLoad, memory, networkStats, disk] = await Promise.all([
      si.cpu().catch(() => ({})),
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({})),
      si.networkStats().catch(() => ([])),
      si.fsSize().catch(() => ([]))
    ]);
    
    // Calculate network totals
    const networkTotals = networkStats.reduce((totals, iface) => {
      if (iface.iface && !iface.iface.startsWith('lo')) { // Skip loopback
        totals.rx_bytes += iface.rx_bytes || 0;
        totals.tx_bytes += iface.tx_bytes || 0;
        totals.rx_sec += iface.rx_sec || 0;
        totals.tx_sec += iface.tx_sec || 0;
      }
      return totals;
    }, { rx_bytes: 0, tx_bytes: 0, rx_sec: 0, tx_sec: 0 });
    
    // Calculate disk totals
    const diskTotals = disk.reduce((totals, volume) => {
      if (volume.mount === '/' || volume.mount.startsWith('/')) {
        totals.total += volume.size || 0;
        totals.used += volume.used || 0;
        totals.available += volume.available || 0;
      }
      return totals;
    }, { total: 0, used: 0, available: 0 });
    
    return {
      cpu: {
        cores: cpuInfo.cores || 0,
        model: cpuInfo.model || 'Unknown',
        speed: cpuInfo.speed || 0,
        percent: Math.round(cpuLoad.currentLoad || 0)
      },
      memory: {
        total: memory.total || 0,
        used: memory.used || 0,
        available: memory.available || memory.total - memory.used || 0,
        percent: memory.total ? ((memory.used / memory.total) * 100) : 0
      },
      network: {
        interfaces: networkStats.map(iface => iface.iface).filter(name => name && !name.startsWith('lo')),
        total_rx: networkTotals.rx_bytes,
        total_tx: networkTotals.tx_bytes,
        rx_sec: networkTotals.rx_sec,
        tx_sec: networkTotals.tx_sec
      },
      disk: {
        total: diskTotals.total,
        used: diskTotals.used,
        available: diskTotals.available,
        percent: diskTotals.total ? ((diskTotals.used / diskTotals.total) * 100) : 0
      }
    };
  } catch (error) {
    console.warn('Failed to get system metrics:', error.message);
    return {
      cpu: { cores: 0, model: 'Unknown', speed: 0, percent: 0 },
      memory: { total: 0, used: 0, available: 0, percent: 0 },
      network: { interfaces: [], total_rx: 0, total_tx: 0, rx_sec: 0, tx_sec: 0 },
      disk: { total: 0, used: 0, available: 0, percent: 0 }
    };
  }
}

  globalLogWatcher = new LogFileWatcher(cwd);
  try {
    await globalLogWatcher.startWatching();
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Failed to start log file watcher:', error.message));
    console.log(chalk.gray('   Logs will be read from files on demand'));
  }
  
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
      // API endpoint for logs using log watcher cache
      try {
        const serviceName = url.searchParams.get('service');
        const tail = url.searchParams.get('tail') || '100';
        const level = url.searchParams.get('level');
        const since = url.searchParams.get('since');
        const filter = url.searchParams.get('filter');
        
        let logs = [];
        if (globalLogWatcher) {
          logs = globalLogWatcher.getCurrentLogs(serviceName, {
            tail: parseInt(tail),
            level,
            since,
            filter
          });
        } else {
          // Fallback to file reading if watcher not available
          logs = await getLogsForAPI(serviceName, {
            tail: parseInt(tail),
            level,
            since,
            filter
          });
        }
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(logs, null, 2));
      } catch (e) {
        console.error('❌ Logs API error:', e.message);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    
    if (url.pathname === '/api/metrics') {
      // API endpoint for system and service metrics
      try {
        const metrics = await getSystemMetrics();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          metrics: {
            timestamp: new Date().toISOString(),
            cpu: metrics.cpu || {},
            memory: metrics.memory || {},
            network: metrics.network || {},
            disk: metrics.disk || {}
          },
          systemInfo: {
            cpu: { cores: metrics.cpu?.cores || 0, model: metrics.cpu?.model || 'Unknown' },
            memory: { total: metrics.memory?.total || 0 },
            disk: { total: metrics.disk?.total || 0, available: metrics.disk?.available || 0 },
            network: { interfaces: metrics.network?.interfaces || [] }
          }
        }, null, 2));
      } catch (e) {
        console.error('❌ Metrics API error:', e.message);
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    
    // Service management endpoints
    if (url.pathname === '/api/services/start' && req.method === 'POST') {
      try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          const { serviceName } = JSON.parse(body);
          const service = cfg.services.find(s => s.name === serviceName);
          
          if (!service) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service not found' }));
            return;
          }
          
          try {
            const result = await startService(service);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to parse request' }));
      }
      return;
    }
    
    if (url.pathname === '/api/services/stop' && req.method === 'POST') {
      try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          const { serviceName } = JSON.parse(body);
          
          try {
            const result = await stopService(serviceName);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to parse request' }));
      }
      return;
    }
    
    if (url.pathname === '/api/services/restart' && req.method === 'POST') {
      try {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          const { serviceName } = JSON.parse(body);
          const service = cfg.services.find(s => s.name === serviceName);
          
          if (!service) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service not found' }));
            return;
          }
          
          try {
            const result = await restartService(service);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to parse request' }));
      }
      return;
    }
    
    if (url.pathname === '/api/services/status') {
      const statuses = getAllServiceStatuses();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(statuses, null, 2));
      return;
    }
    
    // Serve dashboard HTML
    const servicesWithStatus = await getServicesStatus(cfg.services);
    const html = generateDashboardHTML(servicesWithStatus, refreshInterval);
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  
  server.listen(port, async () => {
    console.log(chalk.green(`✅ Admin Dashboard running at http://localhost:${port}`));
    
    // Call after:admin:start hook
    await callHook('after:admin:start', {
      projectDir: cwd,
      port,
      dashboardUrl: `http://localhost:${port}`,
      options,
      services: cfg.services
    });
    
    // Auto-open browser if requested
    if (options.open !== false) {
      const url = `http://localhost:${port}`;
      if (process.platform === 'win32') {
        // Use cmd start to open default browser on Windows; needs shell invocation
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
      } else {
        const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(openCmd, [url], { detached: true, stdio: 'ignore' });
      }
    }
  });
  
  // Handle WebSocket upgrades
  // Initialize ws server for /ws path
  wsServer = new WebSocketServer({ server, path: '/ws' });
  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wsServer.clients.forEach(ws => {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch {}
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);

  wsServer.on('connection', (ws) => {
    ws.serviceFilter = null; // default: all services
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleWebSocketMessage(ws, msg);
      } catch (e) {
        sendWebSocketMessage(ws, { type: 'error', message: 'Invalid JSON payload' });
      }
    });
    // Auto-start stream for all logs if client hasn't sent a start message within short delay
    setTimeout(() => {
      if (!ws.serviceFilter && ws.readyState === WebSocket.OPEN) {
        handleWebSocketMessage(ws, { type: 'start_log_stream' });
      }
    }, 250);
  });
  
  // Graceful shutdown
  let shuttingDown = false;
  const gracefulShutdown = (signal = 'SIGINT') => {
    if (shuttingDown) return; // prevent duplicate invocation
    shuttingDown = true;
    console.log(chalk.yellow(`\n🛑 (${signal}) Shutting down Admin Dashboard...`));

    // Stop log watcher if active
    if (globalLogWatcher) {
      try {
        globalLogWatcher.stopWatching();
      } catch (e) {
        console.warn(chalk.yellow('⚠️  Error stopping log watcher:'), e.message);
      }
      globalLogWatcher = null;
    }

    if (wsServer) {
      try {
        wsServer.clients.forEach(c => c.close());
        wsServer.close();
      } catch (e) {
        console.warn(chalk.yellow('⚠️  Error closing WebSocket server:'), e.message);
      }
      wsServer = null;
    }

    // Close HTTP server
    try {
      server.close(() => {
        console.log(chalk.green('✅ Dashboard stopped'));
        process.exit(0);
      });
    } catch (e) {
      console.error(chalk.red('❌ Error during server shutdown:'), e.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  // Fallback: if event loop is about to exit naturally, ensure resources cleaned
  process.on('beforeExit', () => {
    if (!shuttingDown) gracefulShutdown('beforeExit');
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
  
  // Hook watcher events -> broadcast
  if (globalLogWatcher) {
    globalLogWatcher.addListener((event, data) => broadcastLogEvent(event, data));
  }
  return server;
}