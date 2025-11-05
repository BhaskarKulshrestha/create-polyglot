# Service Logs Feature

A comprehensive logging solution for polyglot microservices that provides both CLI and web-based log viewing capabilities.

## Features

### 📋 CLI Log Viewer
View logs directly from the command line with powerful filtering and export options:

```bash
# View all service logs
create-polyglot logs

# View logs for a specific service
create-polyglot logs my-service

# Follow logs in real-time
create-polyglot logs --follow

# Show last 100 lines
create-polyglot logs --tail 100

# Filter by log level
create-polyglot logs --level error

# Show logs from the last hour
create-polyglot logs --since 1h

# Search logs with regex
create-polyglot logs --filter "database|connection"

# Export logs to JSON
create-polyglot logs --export json

# Clear all logs
create-polyglot logs --clear
```

### 🌐 Web Dashboard
Enhanced admin dashboard with integrated log viewer:

- **Real-time log streaming** via WebSocket connection
- **Service filtering** - view logs from specific services
- **Log level filtering** - filter by error, warn, info, debug
- **Text search** - search through log messages
- **Auto-refresh** - automatically update logs every few seconds
- **Export functionality** - download logs in various formats

Access the dashboard:
```bash
create-polyglot admin
```

### 🗂️ File-based Storage
Logs are stored in each service directory under `.logs/`:

```
apps/
  my-service/
    .logs/
      2025-11-05.log    # Daily log files
      2025-11-04.log
      logger.js         # Helper utility for services
```

### 📊 Log Format
All logs use a consistent JSON format:

```json
{
  "timestamp": "2025-11-05T14:30:00.000Z",
  "level": "info",
  "service": "my-service",
  "message": "GET /api/users",
  "data": {
    "method": "GET",
    "path": "/api/users",
    "ip": "127.0.0.1"
  }
}
```

### 🔄 Log Rotation
- Files automatically rotate when they exceed 10MB
- Keeps the last 10 log files per service
- Old files are cleaned up automatically

## Service Integration

### Node.js Services
Services automatically include request logging and error handling:

```javascript
import { Logger } from './.logs/logger.js';
const logger = new Logger('my-service');

logger.info('Server started', { port: 3001 });
logger.error('Database connection failed', { error: err.message });
```

### Python Services (FastAPI)
Built-in logging with automatic request tracking:

```python
file_logger.info("Processing request", {"user_id": 123})
file_logger.error("Validation failed", {"field": "email"})
```

### Go Services
Structured logging with request middleware:

```go
logger.Info("User authenticated", map[string]interface{}{
    "user_id": userID,
    "role": "admin",
})
```

### Java Services (Spring Boot)
Integrated with SLF4J and automatic request logging:

```java
logInfo("Processing payment", Map.of("amount", 100.50));
logError("Payment failed", Map.of("error", ex.getMessage()));
```

## API Endpoints

Each service automatically exposes log endpoints:

```bash
# Get recent logs for a service
GET http://localhost:3001/logs?tail=50&level=error

# Parameters:
# - tail: number of recent lines (default: 50)
# - level: filter by log level
# - since: ISO timestamp or relative time
```

## Dashboard Features

### Service Logs Section
- **Service Filter**: View logs from specific services or all services
- **Level Filter**: Show only errors, warnings, info, or debug logs
- **Search**: Real-time text search through log messages
- **Live Stream**: WebSocket-based real-time log updates
- **Auto-refresh**: Periodic polling for new logs
- **Export**: Download logs in JSON, CSV, or text format

### Controls
- **Refresh**: Manually update logs
- **Auto-Refresh**: Toggle automatic updates every 3 seconds
- **Live Stream**: Enable real-time WebSocket streaming
- **Export**: Download filtered logs
- **Clear**: Remove all logs (with confirmation)

## Configuration

### Log Levels
- `error`: Critical errors and exceptions
- `warn`: Warning messages and deprecations
- `info`: General information and request logs
- `debug`: Detailed debugging information

### Time Filters
- Relative: `1h`, `30m`, `2d`, `1w`
- Absolute: ISO timestamps like `2025-11-05T10:00:00Z`

### Export Formats
- **JSON**: Structured data with all fields
- **CSV**: Comma-separated values for spreadsheets
- **TXT**: Human-readable plain text format

## Architecture

### Storage
- Daily log files: `{service}/.logs/YYYY-MM-DD.log`
- JSON Lines format for easy parsing
- Automatic rotation and cleanup

### Real-time Updates
- WebSocket connection for live streaming
- File watching for follow mode in CLI
- Periodic polling for auto-refresh

### Performance
- Efficient tail operations for large log files
- Lazy loading and streaming for web interface
- Configurable limits to prevent memory issues

## Troubleshooting

### No logs appearing
1. Check if services are running and generating logs
2. Verify `.logs` directory exists in service folders
3. Check file permissions for log directories

### Dashboard not updating
1. Ensure WebSocket connection is established
2. Check browser console for JavaScript errors
3. Verify admin dashboard is running on correct port

### Large log files
- Log rotation happens automatically at 10MB
- Use `--tail` option to limit output
- Consider using `--since` for time-based filtering

## Security Considerations

- Log files are stored locally in service directories
- No authentication required for local development
- Production deployments should secure admin dashboard
- Sensitive data should not be logged in production

---

This logging system provides comprehensive observability for your polyglot microservices while maintaining simplicity and performance.