# HVAC Control System Documentation

This documentation provides comprehensive technical details about the HVAC IoT Control System architecture, algorithms, data management, and deployment procedures.

## Documentation Index

| Document | Description |
|----------|-------------|
| [1. Analysis & Predictions](./01-analysis-and-predictions.md) | Prediction algorithms, fault detection logic, efficiency scoring |
| [2. Data Store](./02-data-store.md) | Database schema, data flow, retention policies, lock mechanisms |
| [3. Performance Analysis](./03-performance-analysis.md) | API endpoints, rate limits, server requirements, performance metrics |
| [4. Deployment Guide](./04-deployment-guide.md) | Pre-deployment checklist, deployment procedures, environment setup |

## System Overview

```
+------------------+     +------------------+     +------------------+
|   ESP32 Device   |---->|   MQTT Broker    |---->|  Spring Boot     |
|   (IoT Sensor)   |<----|  (Message Bus)   |<----|  Backend API     |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
+------------------+     +------------------+     +------------------+
| Customer Portal  |<--->|   REST API       |<--->|   PostgreSQL     |
| (Next.js)        |     |   (HTTP/JSON)    |     |   Database       |
+------------------+     +------------------+     +------------------+
        |
        v
+------------------+
|   Admin Panel    |
|   (Next.js)      |
+------------------+
```

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Backend | Spring Boot | 3.2.x |
| Database | PostgreSQL | 15+ |
| Frontend | Next.js | 14.x |
| IoT Device | ESP32 | Arduino Framework |
| Message Broker | MQTT | Mosquitto |
| Authentication | JWT + 2FA | - |

## Quick Links

- **Backend Source**: `/backend/src/main/java/com/hvac/`
- **Customer Portal**: `/customer_portal/`
- **Admin Panel**: `/admin_panel/`
- **ESP32 Firmware**: `/esp32/hvac_controller.ino`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial documentation |
