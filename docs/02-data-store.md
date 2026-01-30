# Data Store Documentation

This document explains how the HVAC system stores, processes, and manages data in PostgreSQL, including schema design, data flow, retention policies, and concurrent access handling.

## Table of Contents

1. [Database Overview](#database-overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Table Schemas](#table-schemas)
4. [Data Flow Architecture](#data-flow-architecture)
5. [Data Retention Policies](#data-retention-policies)
6. [Concurrency & Locking](#concurrency--locking)
7. [Indexes & Performance](#indexes--performance)
8. [Backup & Recovery](#backup--recovery)

---

## Database Overview

| Property | Value |
|----------|-------|
| Database Type | PostgreSQL 15+ |
| ORM | Spring Data JPA / Hibernate |
| DDL Mode | `update` (auto-creates/updates tables) |
| Connection Pool | HikariCP (default) |
| Default Port | 5432 |
| Database Name | `hvac_db` |

**Configuration File:** `/backend/src/main/resources/application.properties`

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/hvac_db
spring.datasource.username=${DB_USERNAME:postgres}
spring.datasource.password=${DB_PASSWORD:123456789}
spring.jpa.hibernate.ddl-auto=update
```

---

## Entity Relationship Diagram

```
+------------------+       +--------------------+       +------------------+
|      users       |       | device_assignments |       |     devices      |
+------------------+       +--------------------+       +------------------+
| id (PK)          |<----->| user_id (FK)       |<----->| id (PK)          |
| username         |       | device_id (FK)     |       | device_id        |
| email            |       | assigned_at        |       | device_name      |
| password         |       +--------------------+       | location         |
| role             |                                    | is_online        |
| google_id        |                                    | is_licensed      |
| is_active        |                                    | system_on        |
| created_at       |                                    | mode             |
| updated_at       |       +--------------------+       | fan_speed        |
+------------------+       |     telemetry      |       | temperature_set  |
                           +--------------------+       | last_heartbeat   |
                           | id (PK)            |       | created_at       |
                           | device_id (FK)     |<------| updated_at       |
                           | timestamp          |       +------------------+
                           | supply_air_temp    |              |
                           | return_air_temp    |              |
                           | room_temp          |       +------------------+
                           | humidity           |       |    fault_logs    |
                           | power_watts        |       +------------------+
                           | energy_kwh         |       | id (PK)          |
                           | ...                |       | device_id (FK)   |<--+
                           +--------------------+       | fault_type       |   |
                                                        | severity         |   |
+------------------+       +--------------------+       | description      |   |
| verification_code|       |     schedules      |       | is_resolved      |   |
+------------------+       +--------------------+       | created_at       |   |
| id (PK)          |       | id (PK)            |       +------------------+   |
| email            |       | device_id (FK)     |<----------------------------|
| code             |       | name               |
| expires_at       |       | start_time         |
| is_used          |       | end_time           |
| created_at       |       | days_of_week       |
+------------------+       | is_active          |
                           +--------------------+
```

---

## Table Schemas

### 1. Users Table

Stores customer and admin accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Login username |
| `email` | VARCHAR(100) | UNIQUE, NOT NULL | User email address |
| `password` | VARCHAR(255) | NOT NULL | BCrypt hashed password |
| `role` | VARCHAR(20) | NOT NULL | `ADMIN` or `CUSTOMER` |
| `google_id` | VARCHAR(255) | UNIQUE | Google OAuth ID |
| `is_active` | BOOLEAN | DEFAULT true | Account active status |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation time |
| `updated_at` | TIMESTAMP | ON UPDATE | Last modification time |

**Entity File:** `/backend/src/main/java/com/hvac/model/User.java`

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    google_id VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Devices Table

Stores HVAC device configurations and current state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `device_id` | VARCHAR(50) | UNIQUE, NOT NULL | Device identifier (e.g., "YORK-001") |
| `device_name` | VARCHAR(100) | NOT NULL | Human-readable name |
| `location` | VARCHAR(255) | | Physical location |
| `access_password` | VARCHAR(255) | | Optional password for device assignment |
| `is_licensed` | BOOLEAN | DEFAULT false | License status |
| `is_online` | BOOLEAN | DEFAULT false | Current online status |
| `system_on` | BOOLEAN | DEFAULT false | System power state |
| `mode` | VARCHAR(20) | | `COOLING`, `HEATING`, `FAN_ONLY` |
| `fan_speed` | VARCHAR(10) | | `OFF`, `LOW`, `MED`, `HIGH` |
| `temperature_setpoint` | DECIMAL(4,1) | | Target temperature |
| `config_version` | INTEGER | DEFAULT 1 | Configuration version |
| `require_email_verification` | BOOLEAN | DEFAULT false | 2FA for device access |
| `allowed_emails` | TEXT | | Comma-separated allowed emails |
| `allowed_email_domain` | VARCHAR(100) | | Allowed email domain |
| `last_heartbeat` | TIMESTAMP | | Last device communication |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Device registration time |
| `updated_at` | TIMESTAMP | ON UPDATE | Last modification time |

**Entity File:** `/backend/src/main/java/com/hvac/model/Device.java`

```sql
CREATE TABLE devices (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    access_password VARCHAR(255),
    is_licensed BOOLEAN DEFAULT false,
    is_online BOOLEAN DEFAULT false,
    system_on BOOLEAN DEFAULT false,
    mode VARCHAR(20),
    fan_speed VARCHAR(10),
    temperature_setpoint DECIMAL(4,1),
    config_version INTEGER DEFAULT 1,
    require_email_verification BOOLEAN DEFAULT false,
    allowed_emails TEXT,
    allowed_email_domain VARCHAR(100),
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Telemetry Table

Stores time-series sensor data from devices.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `device_id` | BIGINT | FK → devices(id) | Parent device |
| `timestamp` | TIMESTAMP | NOT NULL | Measurement time |
| `supply_air_temp` | DECIMAL(5,2) | | Supply air temperature (C) |
| `return_air_temp` | DECIMAL(5,2) | | Return air temperature (C) |
| `room_temp` | DECIMAL(5,2) | | Room temperature (C) |
| `humidity` | DECIMAL(5,2) | | Relative humidity (%) |
| `outdoor_temp` | DECIMAL(5,2) | | Outdoor temperature (C) |
| `line_voltage` | DECIMAL(6,2) | | Input voltage (V) |
| `current_amps` | DECIMAL(6,2) | | Current draw (A) |
| `power_watts` | DECIMAL(8,2) | | Power consumption (W) |
| `energy_kwh` | DECIMAL(10,3) | | Cumulative energy (kWh) |
| `compressor_on` | BOOLEAN | | Compressor state |
| `fan_speed` | VARCHAR(10) | | Fan speed setting |
| `airflow_status` | VARCHAR(20) | | `NORMAL`, `RESTRICTED` |
| `filter_condition` | VARCHAR(20) | | `CLEAN`, `DIRTY`, `CLOGGED` |

**Index:** Composite index on `(device_id, timestamp)` for efficient time-range queries.

**Entity File:** `/backend/src/main/java/com/hvac/model/Telemetry.java`

```sql
CREATE TABLE telemetry (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    supply_air_temp DECIMAL(5,2),
    return_air_temp DECIMAL(5,2),
    room_temp DECIMAL(5,2),
    humidity DECIMAL(5,2),
    outdoor_temp DECIMAL(5,2),
    line_voltage DECIMAL(6,2),
    current_amps DECIMAL(6,2),
    power_watts DECIMAL(8,2),
    energy_kwh DECIMAL(10,3),
    compressor_on BOOLEAN,
    fan_speed VARCHAR(10),
    airflow_status VARCHAR(20),
    filter_condition VARCHAR(20)
);

CREATE INDEX idx_telemetry_device_timestamp ON telemetry(device_id, timestamp);
```

### 4. Fault Logs Table

Stores detected system faults.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `device_id` | BIGINT | FK → devices(id) | Affected device |
| `fault_type` | VARCHAR(30) | NOT NULL | Fault type enum |
| `severity` | VARCHAR(10) | NOT NULL | `MEDIUM`, `HIGH` |
| `description` | TEXT | | Fault description |
| `value` | DECIMAL(10,2) | | Actual measured value |
| `threshold` | DECIMAL(10,2) | | Threshold that was exceeded |
| `is_resolved` | BOOLEAN | DEFAULT false | Resolution status |
| `resolved_at` | TIMESTAMP | | Resolution time |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Fault detection time |

**Fault Types:**
- `OVERCURRENT` - Current exceeds 20A
- `LOW_VOLTAGE` - Voltage below 200V
- `HIGH_VOLTAGE` - Voltage above 250V
- `OVERHEATING` - Supply temp above 40C
- `FILTER_CHOKE` - Filter clogged
- `SENSOR_FAILURE` - Invalid sensor reading
- `DEVICE_OFFLINE` - No heartbeat for 5+ minutes

**Entity File:** `/backend/src/main/java/com/hvac/model/FaultLog.java`

```sql
CREATE TABLE fault_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
    fault_type VARCHAR(30) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    description TEXT,
    value DECIMAL(10,2),
    threshold DECIMAL(10,2),
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fault_logs_device_resolved ON fault_logs(device_id, is_resolved);
```

### 5. Device Assignments Table

Maps users to their assigned devices (many-to-many).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `user_id` | BIGINT | FK → users(id) | Assigned user |
| `device_id` | BIGINT | FK → devices(id) | Assigned device |
| `assigned_at` | TIMESTAMP | DEFAULT NOW() | Assignment time |

**Entity File:** `/backend/src/main/java/com/hvac/model/DeviceAssignment.java`

```sql
CREATE TABLE device_assignments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_id)
);
```

### 6. Schedules Table

Stores automated control schedules.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `device_id` | BIGINT | FK → devices(id) | Target device |
| `name` | VARCHAR(100) | NOT NULL | Schedule name |
| `start_time` | TIME | NOT NULL | Daily start time |
| `end_time` | TIME | NOT NULL | Daily end time |
| `days_of_week` | VARCHAR(50) | | e.g., "MON,TUE,WED" |
| `system_on` | BOOLEAN | | Target system state |
| `mode` | VARCHAR(20) | | Target mode |
| `temperature_setpoint` | DECIMAL(4,1) | | Target temperature |
| `fan_speed` | VARCHAR(10) | | Target fan speed |
| `is_active` | BOOLEAN | DEFAULT true | Schedule enabled |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |

**Entity File:** `/backend/src/main/java/com/hvac/model/Schedule.java`

```sql
CREATE TABLE schedules (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week VARCHAR(50),
    system_on BOOLEAN,
    mode VARCHAR(20),
    temperature_setpoint DECIMAL(4,1),
    fan_speed VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7. Verification Codes Table

Stores 2FA email verification codes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Auto-increment ID |
| `email` | VARCHAR(100) | NOT NULL | Target email |
| `code` | VARCHAR(6) | NOT NULL | 6-digit code |
| `expires_at` | TIMESTAMP | NOT NULL | Expiration time |
| `is_used` | BOOLEAN | DEFAULT false | Usage status |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |

**Entity File:** `/backend/src/main/java/com/hvac/model/VerificationCode.java`

```sql
CREATE TABLE verification_codes (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_verification_email ON verification_codes(email);
```

---

## Data Flow Architecture

### 1. Telemetry Data Ingestion

```
ESP32 Device
    |
    | MQTT Publish (every 10 seconds)
    | Topic: hvac/{device_id}/telemetry
    |
    v
+---------------------+
|    MQTT Broker      |
| (Mosquitto/Railway) |
+---------------------+
    |
    | MQTT Subscribe
    | Topic: hvac/+/telemetry
    |
    v
+---------------------+
|    MqttService      |
| handleTelemetry()   |
+---------------------+
    |
    +---> Parse JSON payload
    |
    +---> Create Telemetry entity
    |
    +---> Save to database (TelemetryRepository.save())
    |
    +---> Update device.lastHeartbeat
    |
    +---> Update device.isOnline = true
    |
    +---> Run FaultDetectionService.checkForFaults()
    |
    v
+---------------------+
|    PostgreSQL       |
|   telemetry table   |
+---------------------+
```

### 2. Control Command Flow

```
Customer Portal / Admin Panel
    |
    | HTTP POST /api/customer/devices/{id}/control
    | { "systemOn": true, "mode": "COOLING", ... }
    |
    v
+---------------------+
|  CustomerController |
+---------------------+
    |
    +---> Validate user owns device
    |
    +---> DeviceService.sendControlCommand()
    |
    v
+---------------------+
|    MqttService      |
| sendControlCommand()|
+---------------------+
    |
    | MQTT Publish (QoS=1)
    | Topic: hvac/{device_id}/control
    |
    v
+---------------------+
|    MQTT Broker      |
+---------------------+
    |
    v
+---------------------+
|    ESP32 Device     |
| Executes command    |
+---------------------+
    |
    | MQTT Publish (confirmation)
    | Topic: hvac/{device_id}/status
    |
    v
+---------------------+
|    MqttService      |
|   handleStatus()    |
+---------------------+
    |
    +---> Update Device table with confirmed state
    |
    v
+---------------------+
|    PostgreSQL       |
|   devices table     |
+---------------------+
```

### 3. User Authentication Flow

```
User Login Request
    |
    | POST /api/auth/login
    | { "email": "...", "password": "..." }
    |
    v
+---------------------+
|    AuthService      |
|      login()        |
+---------------------+
    |
    +---> Find user by email (UserRepository)
    |
    +---> Verify BCrypt password
    |
    +---> Generate 6-digit verification code
    |
    +---> Save code to verification_codes table (10 min expiry)
    |
    +---> Send code via email (EmailService)
    |
    v
+---------------------+
| Response: "Check    |
| your email for code"|
+---------------------+

    ... User receives email ...

    |
    | POST /api/auth/verify
    | { "email": "...", "code": "123456" }
    |
    v
+---------------------+
|    AuthService      |
|    verifyCode()     |
+---------------------+
    |
    +---> Find valid code (not used, not expired)
    |
    +---> Mark code as used
    |
    +---> Generate JWT token (6 hour expiry)
    |
    v
+---------------------+
| Response:           |
| { "token": "..." }  |
+---------------------+
```

---

## Data Retention Policies

### Telemetry Data Retention

| Policy | Value | Reason |
|--------|-------|--------|
| Retention Period | 7 days | Balance storage vs. analysis needs |
| Cleanup Frequency | Daily at midnight | Scheduled job |
| Cleanup Method | DELETE WHERE timestamp < NOW() - 7 days | Batch delete |

**Scheduler File:** `/backend/src/main/java/com/hvac/scheduler/HvacScheduler.java`

```java
@Scheduled(cron = "0 0 0 * * *")  // Daily at midnight
public void cleanOldTelemetry() {
    LocalDateTime cutoff = LocalDateTime.now().minusDays(7);
    telemetryRepository.deleteByTimestampBefore(cutoff);
    log.info("Cleaned telemetry data older than {}", cutoff);
}
```

### Verification Code Retention

| Policy | Value | Reason |
|--------|-------|--------|
| Expiration | 10 minutes | Security best practice |
| Cleanup Frequency | Every hour | Scheduled job |
| Cleanup Method | DELETE WHERE expires_at < NOW() OR is_used = true | Batch delete |

```java
@Scheduled(cron = "0 0 * * * *")  // Every hour
public void cleanExpiredVerificationCodes() {
    LocalDateTime now = LocalDateTime.now();
    verificationCodeRepository.deleteExpiredOrUsed(now);
}
```

### Fault Log Retention

| Policy | Value | Reason |
|--------|-------|--------|
| Retention Period | Indefinite | Audit trail for maintenance history |
| Recommendation | Archive after 1 year | Move to cold storage |

---

## Concurrency & Locking

### Optimistic Locking

The system uses JPA's `@Version` annotation for optimistic locking on entities that may have concurrent updates:

```java
@Entity
public class Device {
    @Version
    private Long version;  // Auto-incremented on each update
    // ...
}
```

**How it works:**
1. Read entity (version = 1)
2. Modify entity
3. Save entity → Hibernate adds `WHERE version = 1`
4. If another transaction modified it, version mismatch → `OptimisticLockException`

### Device State Updates

To prevent race conditions when updating device state:

```java
@Transactional
public void updateDeviceState(String deviceId, DeviceState newState) {
    Device device = deviceRepository.findByDeviceId(deviceId)
        .orElseThrow(() -> new NotFoundException("Device not found"));

    device.setSystemOn(newState.isSystemOn());
    device.setMode(newState.getMode());
    device.setFanSpeed(newState.getFanSpeed());
    device.setTemperatureSetpoint(newState.getTemperatureSetpoint());

    deviceRepository.save(device);  // Version check happens here
}
```

### Telemetry Insertion

Telemetry data is insert-only (no updates), so no locking needed:

```java
// Thread-safe: Each telemetry record is a new INSERT
@Transactional
public void saveTelemetry(Telemetry telemetry) {
    telemetryRepository.save(telemetry);
}
```

### Fault Log Duplicate Prevention

To prevent duplicate faults, use database-level uniqueness:

```java
public void logFault(Device device, FaultType type, ...) {
    // Check for existing unresolved fault of same type
    Optional<FaultLog> existing = faultLogRepository
        .findByDeviceAndFaultTypeAndIsResolvedFalse(device, type);

    if (existing.isEmpty()) {
        // Only create if no existing fault
        FaultLog fault = new FaultLog();
        // ...
        faultLogRepository.save(fault);
    }
}
```

### Connection Pool Configuration

HikariCP default settings (can be tuned in application.properties):

```properties
# Connection pool settings
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.idle-timeout=300000
spring.datasource.hikari.connection-timeout=20000
spring.datasource.hikari.max-lifetime=1200000
```

---

## Indexes & Performance

### Current Indexes

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| telemetry | idx_telemetry_device_timestamp | device_id, timestamp | Time-range queries |
| fault_logs | idx_fault_logs_device_resolved | device_id, is_resolved | Active faults lookup |
| verification_codes | idx_verification_email | email | Email lookup |
| users | (unique) | email | Login lookup |
| users | (unique) | username | Username lookup |
| devices | (unique) | device_id | Device lookup |

### Query Optimization Tips

1. **Telemetry Queries**: Always include device_id AND timestamp range
   ```sql
   -- Good: Uses index
   SELECT * FROM telemetry
   WHERE device_id = 1 AND timestamp > NOW() - INTERVAL '24 hours';

   -- Bad: Full table scan
   SELECT * FROM telemetry WHERE power_watts > 1000;
   ```

2. **Pagination**: Use LIMIT/OFFSET with ORDER BY indexed columns
   ```sql
   SELECT * FROM telemetry
   WHERE device_id = 1
   ORDER BY timestamp DESC
   LIMIT 100 OFFSET 0;
   ```

3. **Aggregations**: Consider materialized views for dashboards
   ```sql
   -- Create materialized view for daily energy summary
   CREATE MATERIALIZED VIEW daily_energy AS
   SELECT device_id,
          DATE(timestamp) as date,
          AVG(power_watts) as avg_power,
          MAX(energy_kwh) - MIN(energy_kwh) as daily_consumption
   FROM telemetry
   GROUP BY device_id, DATE(timestamp);
   ```

---

## Backup & Recovery

### Recommended Backup Strategy

| Backup Type | Frequency | Retention | Method |
|-------------|-----------|-----------|--------|
| Full Backup | Daily | 7 days | pg_dump |
| WAL Archiving | Continuous | 7 days | pg_basebackup |
| Point-in-Time | As needed | - | WAL replay |

### Backup Commands

```bash
# Full backup
pg_dump -h localhost -U postgres -d hvac_db -F c -f hvac_backup_$(date +%Y%m%d).dump

# Restore from backup
pg_restore -h localhost -U postgres -d hvac_db hvac_backup_20240115.dump

# Export specific table
pg_dump -h localhost -U postgres -d hvac_db -t telemetry -F c -f telemetry_backup.dump
```

### Docker Compose Backup

```yaml
# Add to docker-compose.yml
services:
  backup:
    image: postgres:15
    volumes:
      - ./backups:/backups
    command: >
      bash -c "while true; do
        pg_dump -h db -U postgres hvac_db > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql
        sleep 86400
      done"
    depends_on:
      - db
```

---

## Database Maintenance Tasks

### Regular Maintenance

```sql
-- Analyze tables for query optimizer
ANALYZE telemetry;
ANALYZE devices;
ANALYZE fault_logs;

-- Vacuum to reclaim space (run during low-traffic periods)
VACUUM ANALYZE telemetry;

-- Reindex if performance degrades
REINDEX TABLE telemetry;
```

### Monitoring Queries

```sql
-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Check index usage
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public';

-- Check slow queries
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```
