package com.example;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@SpringBootApplication
@RestController
public class DemoApplication {
    
    private static final Logger logger = LoggerFactory.getLogger(DemoApplication.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String serviceName = "spring-boot";
    
    public DemoApplication() {
        // Ensure logs directory exists
        try {
            Files.createDirectories(Paths.get(".logs"));
        } catch (IOException e) {
            logger.error("Failed to create logs directory", e);
        }
    }
    
    private void writeLog(String level, String message, Map<String, Object> data) {
        try {
            ObjectNode logEntry = objectMapper.createObjectNode();
            logEntry.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "Z");
            logEntry.put("level", level.toLowerCase());
            logEntry.put("service", serviceName);
            logEntry.put("message", message);
            logEntry.set("data", objectMapper.valueToTree(data != null ? data : new HashMap<>()));
            
            String logLine = objectMapper.writeValueAsString(logEntry) + "\n";
            String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
            Path logFile = Paths.get(".logs", today + ".log");
            
            Files.write(logFile, logLine.getBytes(), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (Exception e) {
            logger.error("Failed to write log", e);
        }
    }
    
    private void logInfo(String message, Map<String, Object> data) {
        writeLog("info", message, data);
        logger.info(message);
    }
    
    private void logError(String message, Map<String, Object> data) {
        writeLog("error", message, data);
        logger.error(message);
    }
    
    private void logWarn(String message, Map<String, Object> data) {
        writeLog("warn", message, data);
        logger.warn(message);
    }
    
    private void logRequest(HttpServletRequest request) {
        Map<String, Object> data = new HashMap<>();
        data.put("method", request.getMethod());
        data.put("path", request.getRequestURI());
        data.put("remoteAddr", request.getRemoteAddr());
        data.put("userAgent", request.getHeader("User-Agent"));
        
        logInfo(request.getMethod() + " " + request.getRequestURI(), data);
    }

    @GetMapping("/health")
    public Map<String, String> health(HttpServletRequest request) {
        logRequest(request);
        logInfo("Health check requested", null);
        return Map.of("status", "ok", "service", "spring-boot");
    }
    
    @GetMapping("/logs")
    public List<Map<String, Object>> getLogs(
            HttpServletRequest request,
            @RequestParam(defaultValue = "50") int tail,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String since) {
        
        logRequest(request);
        
        try {
            String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
            Path logFile = Paths.get(".logs", today + ".log");
            
            if (!Files.exists(logFile)) {
                return new ArrayList<>();
            }
            
            List<String> lines = Files.readAllLines(logFile);
            List<Map<String, Object>> logs = new ArrayList<>();
            
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty()) continue;
                
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> logEntry = objectMapper.readValue(line, Map.class);
                    
                    // Apply filters
                    if (level != null && !level.isEmpty()) {
                        String entryLevel = (String) logEntry.get("level");
                        if (!level.toLowerCase().equals(entryLevel)) {
                            continue;
                        }
                    }
                    
                    if (since != null && !since.isEmpty()) {
                        // Simple since filtering - in production you'd want proper date parsing
                        String timestamp = (String) logEntry.get("timestamp");
                        if (timestamp != null && timestamp.compareTo(since) < 0) {
                            continue;
                        }
                    }
                    
                    logs.add(logEntry);
                } catch (Exception e) {
                    // Skip malformed log entries
                    continue;
                }
            }
            
            // Apply tail limit
            if (logs.size() > tail) {
                logs = logs.subList(logs.size() - tail, logs.size());
            }
            
            return logs;
            
        } catch (Exception e) {
            logError("Failed to fetch logs: " + e.getMessage(), Map.of("error", e.getMessage()));
            return List.of(Map.of("error", "Failed to fetch logs"));
        }
    }

    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
