import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple file-based logger that matches the Node.js format
class FileLogger:
    def __init__(self, service_name: str = "python"):
        self.service_name = service_name
        self.logs_dir = Path.cwd() / ".logs"
        self.logs_dir.mkdir(exist_ok=True)
    
    def _get_log_file(self):
        today = datetime.now().strftime("%Y-%m-%d")
        return self.logs_dir / f"{today}.log"
    
    def _write_log(self, level: str, message: str, data: Dict[str, Any] = None):
        try:
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "level": level.lower(),
                "service": self.service_name,
                "message": str(message),
                "data": data or {}
            }
            
            with open(self._get_log_file(), "a") as f:
                f.write(json.dumps(log_entry) + "\n")
        except Exception as e:
            print(f"Failed to write log: {e}")
    
    def info(self, message: str, data: Dict[str, Any] = None):
        self._write_log("info", message, data)
        logger.info(message)
    
    def error(self, message: str, data: Dict[str, Any] = None):
        self._write_log("error", message, data)
        logger.error(message)
    
    def warn(self, message: str, data: Dict[str, Any] = None):
        self._write_log("warn", message, data)
        logger.warning(message)
    
    def debug(self, message: str, data: Dict[str, Any] = None):
        self._write_log("debug", message, data)
        logger.debug(message)

file_logger = FileLogger()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    file_logger.info(f"{request.method} {request.url.path}", {
        "method": request.method,
        "path": str(request.url.path),
        "query_params": dict(request.query_params),
        "client_host": getattr(request.client, 'host', 'unknown') if request.client else 'unknown'
    })
    
    response = await call_next(request)
    return response

@app.get("/health")
async def health():
    file_logger.info("Health check requested")
    return {"status": "ok", "service": "python"}

@app.get("/logs")
async def get_logs(
    tail: int = Query(50, description="Number of recent lines to show"),
    level: Optional[str] = Query(None, description="Filter by log level"),
    since: Optional[str] = Query(None, description="Show logs since timestamp")
):
    try:
        logs_dir = Path.cwd() / ".logs"
        if not logs_dir.exists():
            return []
        
        # Get today's log file
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = logs_dir / f"{today}.log"
        
        if not log_file.exists():
            return []
        
        with open(log_file, "r") as f:
            lines = f.readlines()
        
        logs = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                log_entry = json.loads(line)
                logs.append(log_entry)
            except json.JSONDecodeError:
                continue
        
        # Apply filters
        if level:
            logs = [log for log in logs if log.get("level") == level.lower()]
        
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
                logs = [log for log in logs if datetime.fromisoformat(log["timestamp"].replace('Z', '+00:00')) >= since_dt]
            except ValueError:
                pass  # Invalid since format, ignore filter
        
        # Apply tail limit
        logs = logs[-tail:]
        
        return logs
    
    except Exception as e:
        file_logger.error(f"Failed to fetch logs: {str(e)}")
        return {"error": "Failed to fetch logs"}

@app.on_event("startup")
async def startup_event():
    file_logger.info("Python service started", {"service": "python"})

@app.on_event("shutdown")
async def shutdown_event():
    file_logger.info("Python service shutting down")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "3004"))
    file_logger.info(f"Starting Python service on port {port}", {"port": port})
    uvicorn.run(app, host="0.0.0.0", port=port)
