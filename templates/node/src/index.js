import express from 'express';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';

// Initialize logger
let logger;
try {
  const loggerPath = path.join(process.cwd(), '.logs', 'logger.js');
  if (fs.existsSync(loggerPath)) {
    const { Logger } = require(loggerPath);
    logger = new Logger('node');
  }
} catch (e) {
  console.warn('Logger not available:', e.message);
}

// Helper function to log with fallback to console
function log(level, message, data = {}) {
  if (logger) {
    logger[level](message, data);
  }
  console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`);
}

const app = express();
const port = process.env.PORT || 3001;

// Set up rate limiter for the /logs endpoint (max 5 requests per minute)
const logsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many requests, please try again later.' }
});

// Middleware for request logging
app.use((req, res, next) => {
  log('info', `${req.method} ${req.path}`, { 
    method: req.method, 
    path: req.path, 
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

app.get('/health', (_req, res) => {
  log('info', 'Health check requested');
  res.json({ status: 'ok', service: 'node' });
});

app.get('/logs', logsLimiter, (req, res) => {
  try {
    const { tail = 50, level, since } = req.query;
    
    // Simple logs endpoint - in a real app you'd want proper pagination
    const logsDir = path.join(process.cwd(), '.logs');
    if (!fs.existsSync(logsDir)) {
      return res.json([]);
    }
    
    // Get today's log file
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `${today}.log`);
    
    if (!fs.existsSync(logFile)) {
      return res.json([]);
    }
    
    const content = fs.readFileSync(logFile, 'utf-8');
    let logs = content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
    
    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level.toLowerCase());
    }
    
    if (since) {
      const sinceDate = new Date(since);
      logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
    }
    
    // Apply tail limit
    logs = logs.slice(-parseInt(tail));
    
    res.json(logs);
  } catch (e) {
    log('error', 'Failed to fetch logs', { error: e.message });
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  log('error', 'Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path 
  });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  log('info', `Node service started on port ${port}`, { port });
  console.log(`[node] service listening on :${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection', { reason: String(reason), promise: String(promise) });
});

// test node change 2025-10-05 19:51:20
