# Service Controls Feature

This document describes the service start/stop/restart controls feature in the create-polyglot admin dashboard.

## Overview

The service controls feature provides a web-based interface for managing service lifecycle operations (start, stop, restart) directly from the admin dashboard. This complements the existing service logs feature to provide comprehensive service management capabilities.

## Features

### Web UI Controls

- **Start Button**: Start a stopped service
- **Stop Button**: Stop a running service  
- **Restart Button**: Restart a running service
- **Intelligent Button States**: Buttons are enabled/disabled based on current service status
- **Real-time Feedback**: Visual feedback with temporary status messages
- **Auto-refresh**: Service status automatically updates after operations

### Backend API

- **RESTful Endpoints**: Standard HTTP endpoints for service operations
- **Process Management**: Spawns and manages service processes using Node.js child_process
- **Service Detection**: Automatically detects service types and uses appropriate start commands
- **Status Monitoring**: Tracks process IDs, uptime, and health status

## Architecture

### Frontend Components

The admin dashboard (`/admin`) includes:

1. **Service Status Table**: Enhanced with control buttons for each service
2. **Action Buttons**: Start/Stop/Restart buttons with conditional visibility
3. **Status Indicators**: Visual indicators for service state (running/stopped/error)
4. **Feedback System**: Temporary messages showing operation results

### Backend Components

1. **Service Manager** (`bin/lib/service-manager.js`):
   - `startService(serviceName)`: Start a service process
   - `stopService(serviceName)`: Stop a running service
   - `restartService(serviceName)`: Restart a service
   - `getServiceStatus(serviceName)`: Get detailed service status

2. **Admin API** (`bin/lib/admin.js`):
   - `POST /api/services/start`: Start a service
   - `POST /api/services/stop`: Stop a service  
   - `POST /api/services/restart`: Restart a service
   - `GET /api/services/status`: Get service status

## Service Type Support

The service manager supports all create-polyglot service types:

### Node.js Services

- **Start Command**: `npm start` or `node src/index.js`
- **Working Directory**: Service root directory
- **Environment**: Inherits parent environment with service-specific variables

### Python Services

- **Start Command**: `uvicorn app.main:app --reload --host 0.0.0.0 --port {port}`
- **Working Directory**: Service root directory
- **Environment**: Python path and service-specific variables

### Go Services

- **Start Command**: `go run main.go`
- **Working Directory**: Service root directory
- **Environment**: Go-specific environment variables

### Java Services (Spring Boot)

- **Start Command**: `./mvnw spring-boot:run` or `mvn spring-boot:run`
- **Working Directory**: Service root directory
- **Environment**: Java and Maven environment variables

## Usage

### Via Admin Dashboard

1. Start the admin dashboard:

   ```bash
   create-polyglot admin
   ```

2. Navigate to `http://localhost:8080` (or your configured port)

3. Use the control buttons in the service status table:
   - Click **Start** to start a stopped service
   - Click **Stop** to stop a running service
   - Click **Restart** to restart a running service

### API Usage

You can also control services programmatically via the REST API:

```bash
# Start a service
curl -X POST http://localhost:8080/api/services/start \
  -H "Content-Type: application/json" \
  -d '{"service": "api"}'

# Stop a service  
curl -X POST http://localhost:8080/api/services/stop \
  -H "Content-Type: application/json" \
  -d '{"service": "api"}'

# Restart a service
curl -X POST http://localhost:8080/api/services/restart \
  -H "Content-Type: application/json" \
  -d '{"service": "api"}'

# Get service status
curl http://localhost:8080/api/services/status
```

## Error Handling

### Common Scenarios

1. **Service Not Found**: Returns 404 if service doesn't exist in polyglot.json
2. **Already Running**: Start operation returns success if service already running
3. **Not Running**: Stop operation returns success if service already stopped
4. **Permission Errors**: Returns 500 with error details for permission issues
5. **Command Failures**: Returns 500 with stderr output for command failures

### Frontend Error Display

- **Failed Operations**: Red error messages with specific failure reasons
- **Success Operations**: Green success messages with operation confirmation
- **Automatic Cleanup**: Status messages auto-hide after 3 seconds

## Configuration

### Default Ports

Services use ports from polyglot.json configuration. The service manager reads port information to properly configure service startup.

### Process Management

- **Process Tracking**: PIDs stored in memory for stop/restart operations
- **Cleanup**: Processes are properly terminated on service stop
- **Health Checks**: Status endpoints verify service health

## Integration with Logs Feature

The service controls work seamlessly with the existing logs feature:

1. **Log Generation**: Started services automatically generate logs
2. **Real-time Streaming**: Log streaming continues during service operations
3. **Operation Logging**: Service start/stop operations are logged
4. **Status Correlation**: Service status affects log display and streaming

## Security Considerations

### Process Isolation

- Services run as separate processes with isolated environments
- No privileged operations required
- Standard user permissions sufficient

### API Security

- Admin dashboard runs on localhost only by default
- No authentication required for local development
- Consider adding authentication for production deployments

## Development and Extension

### Adding New Service Types

To add support for a new service type:

1. Update `getServiceCommands()` in `service-manager.js`
2. Add service type detection logic
3. Define appropriate start commands and environment
4. Test with sample service of that type

### Customizing Commands

Service start commands can be customized by:

1. Modifying the command mapping in `service-manager.js`
2. Adding environment-specific logic
3. Supporting custom npm scripts or package.json configurations

## Testing

### Manual Testing

1. Create test workspace with multiple service types
2. Start admin dashboard
3. Verify all control buttons work correctly
4. Test error scenarios (invalid services, permission issues)
5. Verify status updates and log integration

### Integration Testing

The feature integrates with existing test suites in:

- `tests/admin-command.test.js`: Admin dashboard functionality
- `tests/dev-command.test.js`: Service process management

## Future Enhancements

Potential improvements for this feature:

1. **Bulk Operations**: Start/stop multiple services simultaneously
2. **Service Dependencies**: Respect service startup order and dependencies
3. **Health Monitoring**: Advanced health checks beyond process existence
4. **Resource Monitoring**: CPU/memory usage for running services
5. **Service Logs Integration**: Direct log tailing from control interface
6. **Configuration Management**: Edit service configuration from UI
7. **Deployment Controls**: Build, test, and deploy operations

## Related Documentation

- [Service Logs Feature](./service-logs-feature.md) - Log viewing and streaming
- [Admin Command](./cli/admin.md) - Admin dashboard usage
- [Getting Started Guide](./guide/getting-started.md) - Basic create-polyglot usage

## Changelog

- **v1.11.1**: Initial service controls implementation
  - Added service start/stop/restart functionality
  - Enhanced admin dashboard with control buttons
  - Integrated with existing service status monitoring
  - Added comprehensive error handling and user feedback