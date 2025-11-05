package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type LogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Level     string                 `json:"level"`
	Service   string                 `json:"service"`
	Message   string                 `json:"message"`
	Data      map[string]interface{} `json:"data"`
}

type Logger struct {
	ServiceName string
	LogsDir     string
}

func NewLogger(serviceName string) *Logger {
	logsDir := filepath.Join(".", ".logs")
	os.MkdirAll(logsDir, 0755)
	
	return &Logger{
		ServiceName: serviceName,
		LogsDir:     logsDir,
	}
}

func (l *Logger) getLogFile() string {
	today := time.Now().Format("2006-01-02")
	return filepath.Join(l.LogsDir, fmt.Sprintf("%s.log", today))
}

func (l *Logger) writeLog(level, message string, data map[string]interface{}) {
	if data == nil {
		data = make(map[string]interface{})
	}
	
	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Level:     strings.ToLower(level),
		Service:   l.ServiceName,
		Message:   message,
		Data:      data,
	}
	
	jsonData, err := json.Marshal(entry)
	if err != nil {
		log.Printf("Failed to marshal log entry: %v", err)
		return
	}
	
	logFile := l.getLogFile()
	file, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Failed to open log file: %v", err)
		return
	}
	defer file.Close()
	
	_, err = file.WriteString(string(jsonData) + "\n")
	if err != nil {
		log.Printf("Failed to write to log file: %v", err)
	}
}

func (l *Logger) Info(message string, data map[string]interface{}) {
	l.writeLog("info", message, data)
	log.Printf("[INFO] %s", message)
}

func (l *Logger) Error(message string, data map[string]interface{}) {
	l.writeLog("error", message, data)
	log.Printf("[ERROR] %s", message)
}

func (l *Logger) Warn(message string, data map[string]interface{}) {
	l.writeLog("warn", message, data)
	log.Printf("[WARN] %s", message)
}

func (l *Logger) Debug(message string, data map[string]interface{}) {
	l.writeLog("debug", message, data)
	log.Printf("[DEBUG] %s", message)
}

var logger *Logger

func logMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger.Info(fmt.Sprintf("%s %s", r.Method, r.URL.Path), map[string]interface{}{
			"method":    r.Method,
			"path":      r.URL.Path,
			"remote_addr": r.RemoteAddr,
			"user_agent": r.UserAgent(),
		})
		next(w, r)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	logger.Info("Health check requested", nil)
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok","service":"go"}`))
}

func logsHandler(w http.ResponseWriter, r *http.Request) {
	tail := 50
	if t := r.URL.Query().Get("tail"); t != "" {
		if parsed, err := strconv.Atoi(t); err == nil {
			tail = parsed
		}
	}
	
	level := r.URL.Query().Get("level")
	since := r.URL.Query().Get("since")
	
	// Get today's log file
	today := time.Now().Format("2006-01-02")
	logFile := filepath.Join(".logs", fmt.Sprintf("%s.log", today))
	
	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}
	
	content, err := ioutil.ReadFile(logFile)
	if err != nil {
		logger.Error("Failed to read log file", map[string]interface{}{"error": err.Error()})
		http.Error(w, "Failed to read logs", http.StatusInternalServerError)
		return
	}
	
	lines := strings.Split(string(content), "\n")
	var logs []LogEntry
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		
		var entry LogEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		
		// Apply filters
		if level != "" && entry.Level != strings.ToLower(level) {
			continue
		}
		
		if since != "" {
			sinceTime, err := time.Parse(time.RFC3339, since)
			if err == nil {
				entryTime, err := time.Parse(time.RFC3339, entry.Timestamp)
				if err != nil || entryTime.Before(sinceTime) {
					continue
				}
			}
		}
		
		logs = append(logs, entry)
	}
	
	// Apply tail limit
	if len(logs) > tail {
		logs = logs[len(logs)-tail:]
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

func main() {
	logger = NewLogger("go")
	
	http.HandleFunc("/health", logMiddleware(healthHandler))
	http.HandleFunc("/logs", logMiddleware(logsHandler))
	
	port := os.Getenv("PORT")
	if port == "" {
		port = "3002"
	}
	
	logger.Info(fmt.Sprintf("Go service started on port %s", port), map[string]interface{}{"port": port})
	fmt.Println("[go] service listening on :" + port)
	
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Error("Server failed to start", map[string]interface{}{"error": err.Error()})
		log.Fatal(err)
	}
}
