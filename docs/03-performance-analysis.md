# Performance Analysis Documentation

This document provides a comprehensive analysis of API endpoints, rate limits, performance metrics, server requirements, and potential bottlenecks in the HVAC control system.

## Table of Contents

1. [API Endpoints Reference](#api-endpoints-reference)
2. [Request Weight Analysis](#request-weight-analysis)
3. [Performance Metrics](#performance-metrics)
4. [Server Requirements](#server-requirements)
5. [Bottleneck Analysis](#bottleneck-analysis)
6. [Scaling Recommendations](#scaling-recommendations)
7. [Monitoring & Alerts](#monitoring--alerts)

---

## API Endpoints Reference

### Authentication Endpoints (No Auth Required)

| Method | Endpoint | Weight | Payload Size | Response Size | Description |
|--------|----------|--------|--------------|---------------|-------------|
| POST | `/api/auth/register` | 3 | ~150 bytes | ~200 bytes | Create new customer account |
| POST | `/api/auth/login` | 5 | ~100 bytes | ~50 bytes | Initiate login (sends 2FA email) |
| POST | `/api/auth/verify` | 2 | ~50 bytes | ~500 bytes | Verify 2FA code, get JWT |
| POST | `/api/auth/google` | 4 | ~1KB | ~500 bytes | Google OAuth login |

### Customer Endpoints (JWT Required)

| Method | Endpoint | Weight | Payload Size | Response Size | Description |
|--------|----------|--------|--------------|---------------|-------------|
| GET | `/api/customer/profile` | 1 | - | ~300 bytes | Get user profile |
| GET | `/api/customer/devices` | 2 | - | ~500 bytes/device | List assigned devices |
| POST | `/api/customer/devices/assign` | 3 | ~100 bytes | ~500 bytes | Assign device to user |
| DELETE | `/api/customer/devices/{id}/unassign` | 2 | - | ~100 bytes | Unassign device |
| PUT | `/api/customer/devices/{id}` | 2 | ~200 bytes | ~500 bytes | Update device metadata |
| GET | `/api/customer/devices/{id}/status` | 2 | - | ~800 bytes | Get device status + telemetry |
| GET | `/api/customer/devices/{id}/telemetry` | 4 | - | ~5KB (100 records) | Get recent telemetry |
| GET | `/api/customer/devices/{id}/telemetry/history` | 6 | - | ~50KB (1000 records) | Get telemetry by date range |
| POST | `/api/customer/devices/{id}/control` | 5 | ~100 bytes | ~200 bytes | Send control command |
| GET | `/api/customer/devices/{id}/predictions` | 3 | - | ~400 bytes | Get predictions |
| GET | `/api/customer/devices/{id}/faults` | 3 | - | ~2KB | Get fault logs |
| GET | `/api/customer/devices/{id}/schedules` | 2 | - | ~1KB | Get schedules |
| POST | `/api/customer/devices/{id}/schedules` | 3 | ~200 bytes | ~300 bytes | Create schedule |
| DELETE | `/api/customer/schedules/{id}` | 2 | - | ~100 bytes | Delete schedule |

### Admin Endpoints (JWT + ADMIN Role Required)

| Method | Endpoint | Weight | Payload Size | Response Size | Description |
|--------|----------|--------|--------------|---------------|-------------|
| GET | `/api/admin/dashboard` | 5 | - | ~1KB | Get dashboard statistics |
| POST | `/api/admin/devices` | 3 | ~300 bytes | ~500 bytes | Register new device |
| GET | `/api/admin/devices` | 4 | - | ~2KB (paginated) | List all devices |
| GET | `/api/admin/devices/{id}` | 2 | - | ~800 bytes | Get device details |
| PUT | `/api/admin/devices/{id}` | 3 | ~300 bytes | ~500 bytes | Update device config |
| DELETE | `/api/admin/devices/{id}` | 4 | - | ~100 bytes | Delete device |
| PATCH | `/api/admin/devices/{id}/license` | 2 | ~50 bytes | ~200 bytes | Toggle license status |
| POST | `/api/admin/admins` | 3 | ~200 bytes | ~300 bytes | Create admin user |
| GET | `/api/admin/admins` | 3 | - | ~1KB | List admin users |
| DELETE | `/api/admin/admins/{id}` | 3 | - | ~100 bytes | Delete admin |
| GET | `/api/admin/users` | 4 | - | ~2KB (paginated) | List all customers |
| GET | `/api/admin/faults` | 4 | - | ~3KB (paginated) | Get all faults |
| GET | `/api/admin/faults/unresolved` | 3 | - | ~2KB | Get unresolved faults |

---

## Request Weight Analysis

### Weight System Explanation

Request weights are calculated based on:
- **Database queries**: 1 point per query
- **External calls** (MQTT, Email): 2 points each
- **Computation**: 1 point for complex calculations
- **Data size**: 1 point per 10KB response

### Weight Categories

| Weight | Category | Description | Max Recommended/Second |
|--------|----------|-------------|------------------------|
| 1-2 | Light | Simple reads, single query | 100 requests/sec |
| 3-4 | Medium | Multiple queries, small computation | 50 requests/sec |
| 5-6 | Heavy | External calls, large data, complex logic | 20 requests/sec |
| 7+ | Very Heavy | Batch operations, reports | 5 requests/sec |

### Endpoint Weight Breakdown

#### `/api/auth/login` (Weight: 5)
```
+1  User lookup by email (database query)
+1  Password verification (BCrypt comparison)
+1  Code generation and save (database write)
+2  Send verification email (external SMTP call)
---
 5  Total Weight
```

#### `/api/customer/devices/{id}/telemetry/history` (Weight: 6)
```
+1  Device lookup (database query)
+1  User authorization check (database query)
+2  Telemetry query with date range (potentially large result set)
+1  Data serialization (JSON conversion)
+1  Large response size (50KB+)
---
 6  Total Weight
```

#### `/api/customer/devices/{id}/control` (Weight: 5)
```
+1  Device lookup (database query)
+1  User authorization check (database query)
+1  Command validation
+2  MQTT publish (external broker call)
---
 5  Total Weight
```

---

## Performance Metrics

### Current Benchmarks (Estimated)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| API Response Time (p50) | 50ms | <100ms | Good |
| API Response Time (p95) | 200ms | <500ms | Good |
| API Response Time (p99) | 500ms | <1000ms | Good |
| Database Query Time (avg) | 10ms | <50ms | Good |
| MQTT Publish Latency | 30ms | <100ms | Good |
| Telemetry Ingestion Rate | 6/min/device | 6/min | Good |
| Max Concurrent Users | ~100 | 500+ | Needs Testing |

### Throughput Calculations

#### Telemetry Ingestion

```
Per Device:
  - Telemetry interval: 10 seconds
  - Records per minute: 6
  - Records per hour: 360
  - Records per day: 8,640
  - Bytes per record: ~500 bytes
  - Daily storage: ~4.3 MB/device

For 100 Devices:
  - Records per minute: 600
  - Records per hour: 36,000
  - Records per day: 864,000
  - Daily storage: ~430 MB

For 1,000 Devices:
  - Records per minute: 6,000
  - Records per hour: 360,000
  - Records per day: 8,640,000
  - Daily storage: ~4.3 GB
```

#### API Request Capacity

```
Assumptions:
  - Average request weight: 3
  - Server processing capacity: 1000 weight units/second
  - Database connection pool: 10 connections

Calculated Capacity:
  - Max requests/second: 1000 / 3 = ~333 requests/second
  - Max concurrent users (with 1 req/sec each): ~333 users
  - Peak handling (5 req/sec per user): ~66 concurrent users
```

---

## Server Requirements

### Minimum Requirements (Development/Small Scale)

| Component | Specification | Notes |
|-----------|--------------|-------|
| **CPU** | 2 vCPUs | Sufficient for <10 devices |
| **RAM** | 4 GB | 2GB for JVM, 1GB for PostgreSQL |
| **Storage** | 20 GB SSD | ~1 month telemetry retention |
| **Network** | 100 Mbps | Basic IoT traffic |
| **OS** | Ubuntu 22.04 LTS | Or similar Linux distribution |

**Suitable for:** Development, testing, POC with <10 devices

### Recommended Requirements (Production/Medium Scale)

| Component | Specification | Notes |
|-----------|--------------|-------|
| **CPU** | 4 vCPUs | Handle 50-100 devices |
| **RAM** | 8 GB | 4GB JVM, 2GB PostgreSQL, 2GB system |
| **Storage** | 100 GB SSD | 6 months telemetry, room for growth |
| **Network** | 500 Mbps | Handle concurrent API + MQTT traffic |
| **OS** | Ubuntu 22.04 LTS | Production-hardened |
| **Database** | Dedicated PostgreSQL instance | Separate from application |

**Suitable for:** Production deployment with 50-100 devices, 100+ users

### High-Scale Requirements (Enterprise)

| Component | Specification | Notes |
|-----------|--------------|-------|
| **CPU** | 8+ vCPUs | Handle 500+ devices |
| **RAM** | 16+ GB | Room for caching, heavy queries |
| **Storage** | 500 GB+ SSD | 1+ year retention |
| **Network** | 1 Gbps | High throughput |
| **Load Balancer** | HAProxy / AWS ALB | Distribute traffic |
| **Database** | PostgreSQL with read replicas | Separate read/write |
| **Message Broker** | Dedicated MQTT cluster | EMQX or HiveMQ |

**Suitable for:** Enterprise deployment with 500+ devices, 1000+ users

### Cloud Provider Recommendations

#### AWS

| Scale | EC2 Instance | RDS Instance | Estimated Cost/Month |
|-------|--------------|--------------|---------------------|
| Small | t3.small | db.t3.micro | ~$50 |
| Medium | t3.medium | db.t3.small | ~$150 |
| Large | t3.large | db.m5.large | ~$400 |
| Enterprise | m5.xlarge + ALB | db.m5.xlarge (Multi-AZ) | ~$1,200+ |

#### DigitalOcean

| Scale | Droplet | Managed DB | Estimated Cost/Month |
|-------|---------|------------|---------------------|
| Small | Basic 2GB | Basic 1GB | ~$30 |
| Medium | Basic 4GB | Basic 2GB | ~$80 |
| Large | General 8GB | General 4GB | ~$200 |

#### Railway (Current Setup)

| Service | Plan | Estimated Cost/Month |
|---------|------|---------------------|
| Backend (Spring Boot) | Starter | ~$5-20 |
| PostgreSQL | Starter | ~$5-20 |
| MQTT Broker | External | Included |
| **Total** | | ~$10-40 |

---

## Bottleneck Analysis

### Identified Bottlenecks

#### 1. Database - Telemetry Table Growth

**Issue:** Telemetry table grows rapidly (8,640 records/device/day)

**Impact:**
- Slower queries over time
- Increased storage costs
- Index maintenance overhead

**Mitigation:**
- ✅ 7-day retention policy (implemented)
- Consider: Table partitioning by date
- Consider: TimescaleDB for time-series optimization

```sql
-- Partition by day (recommended for >100 devices)
CREATE TABLE telemetry (
    id BIGSERIAL,
    device_id BIGINT,
    timestamp TIMESTAMP NOT NULL,
    ...
) PARTITION BY RANGE (timestamp);

CREATE TABLE telemetry_2024_01 PARTITION OF telemetry
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

#### 2. MQTT Broker - Single Point of Failure

**Issue:** External MQTT broker dependency

**Impact:**
- Control commands fail if broker is down
- Telemetry ingestion stops
- No automatic failover

**Mitigation:**
- Self-host MQTT broker (Mosquitto/EMQX)
- Implement broker clustering
- Add offline command queue

#### 3. Email Service - 2FA Delays

**Issue:** SMTP delivery can be slow/unreliable

**Impact:**
- Login delays for users
- Email rate limits from provider

**Mitigation:**
- Use transactional email service (SendGrid, SES)
- Implement SMS as backup 2FA
- Add push notification option

#### 4. No Rate Limiting

**Issue:** No API rate limiting implemented

**Impact:**
- Vulnerable to DoS attacks
- Single user can consume all resources
- No fair usage enforcement

**Mitigation (Recommended Implementation):**

```java
// Add to application.properties
rate.limit.requests.per.minute=60
rate.limit.requests.per.hour=1000

// Add RateLimitFilter.java
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) {

        String key = getClientIP(request);
        Bucket bucket = buckets.computeIfAbsent(key, k -> createBucket());

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            response.setStatus(429);
            response.getWriter().write("Rate limit exceeded");
        }
    }

    private Bucket createBucket() {
        return Bucket.builder()
            .addLimit(Bandwidth.classic(60, Refill.intervally(60, Duration.ofMinutes(1))))
            .build();
    }
}
```

#### 5. Synchronous Fault Detection

**Issue:** Fault detection runs synchronously on telemetry receipt

**Impact:**
- Delays telemetry processing
- Blocks MQTT message handler

**Mitigation:**
```java
// Use async processing
@Async
public CompletableFuture<Void> checkForFaultsAsync(Device device, Telemetry telemetry) {
    checkForFaults(device, telemetry);
    return CompletableFuture.completedFuture(null);
}
```

---

## Scaling Recommendations

### Horizontal Scaling Strategy

```
                    +------------------+
                    |  Load Balancer   |
                    |  (HAProxy/Nginx) |
                    +------------------+
                           |
          +----------------+----------------+
          |                |                |
    +----------+     +----------+     +----------+
    | Backend  |     | Backend  |     | Backend  |
    | Node 1   |     | Node 2   |     | Node 3   |
    +----------+     +----------+     +----------+
          |                |                |
          +----------------+----------------+
                           |
                    +------------------+
                    |   PostgreSQL     |
                    |   (Primary)      |
                    +------------------+
                           |
                    +------------------+
                    |   PostgreSQL     |
                    |   (Read Replica) |
                    +------------------+
```

### Scaling Checklist

| Devices | Users | Recommended Actions |
|---------|-------|---------------------|
| 1-50 | 1-100 | Single server, current setup |
| 50-200 | 100-500 | Add read replica, increase server specs |
| 200-500 | 500-1000 | Add load balancer, 2 backend nodes |
| 500+ | 1000+ | Full horizontal scaling, dedicated services |

### Database Optimization Path

1. **Short-term:** Add indexes, optimize queries
2. **Medium-term:** Add read replica, connection pooling
3. **Long-term:** Consider TimescaleDB or InfluxDB for telemetry

---

## Monitoring & Alerts

### Recommended Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| API Response Time (p95) | >500ms | >2000ms | Scale up / optimize |
| Database Connections | >80% pool | >95% pool | Increase pool size |
| Telemetry Lag | >30 seconds | >60 seconds | Check MQTT broker |
| Error Rate | >1% | >5% | Investigate logs |
| Memory Usage | >70% | >90% | Scale up / optimize |
| CPU Usage | >70% | >90% | Scale up |
| Disk Usage | >70% | >90% | Clean up / expand |
| Unresolved Faults | >10 | >50 | Alert admin |

### Prometheus Metrics (Recommended Addition)

```java
// Add to pom.xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>

// Enable in application.properties
management.endpoints.web.exposure.include=prometheus,health,info
management.metrics.export.prometheus.enabled=true
```

### Health Check Endpoint

The system should expose:
```
GET /actuator/health

{
    "status": "UP",
    "components": {
        "db": { "status": "UP" },
        "mqtt": { "status": "UP" },
        "diskSpace": { "status": "UP" }
    }
}
```

---

## Performance Testing Recommendations

### Load Testing with k6

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '1m', target: 50 },   // Ramp up to 50 users
        { duration: '3m', target: 50 },   // Stay at 50 users
        { duration: '1m', target: 100 },  // Ramp up to 100 users
        { duration: '3m', target: 100 },  // Stay at 100 users
        { duration: '1m', target: 0 },    // Ramp down
    ],
};

export default function() {
    let res = http.get('http://localhost:8080/api/customer/devices', {
        headers: { 'Authorization': `Bearer ${__ENV.JWT_TOKEN}` }
    });

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
}
```

Run with:
```bash
k6 run -e JWT_TOKEN=your_token load-test.js
```

### Expected Results

| Scenario | Expected p95 | Expected Throughput |
|----------|--------------|---------------------|
| 50 concurrent users | <200ms | 100+ req/sec |
| 100 concurrent users | <500ms | 150+ req/sec |
| 200 concurrent users | <1000ms | 200+ req/sec |
