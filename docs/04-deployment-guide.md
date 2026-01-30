# Deployment Guide

This document provides a comprehensive guide for deploying the HVAC Control System to production, including pre-deployment checklist, environment setup, and deployment procedures.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [ESP32 Firmware Deployment](#esp32-firmware-deployment)
7. [MQTT Broker Setup](#mqtt-broker-setup)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Code Review & Testing

| Task | Status | Notes |
|------|--------|-------|
| [ ] All unit tests passing | Required | Run `./mvnw test` |
| [ ] Integration tests passing | Required | Test API endpoints |
| [ ] Code review completed | Required | Peer review all changes |
| [ ] Security scan completed | Required | Check for vulnerabilities |
| [ ] No hardcoded credentials | Required | Use environment variables |
| [ ] API documentation updated | Required | OpenAPI/Swagger |
| [ ] Database migrations tested | Required | Test on staging first |

### Infrastructure Preparation

| Task | Status | Notes |
|------|--------|-------|
| [ ] Production server provisioned | Required | See server requirements |
| [ ] Domain name configured | Required | DNS A/CNAME records |
| [ ] SSL certificates obtained | Required | Let's Encrypt or purchased |
| [ ] Database instance ready | Required | PostgreSQL 15+ |
| [ ] MQTT broker accessible | Required | Test connection |
| [ ] Firewall rules configured | Required | See port requirements |
| [ ] Backup system in place | Required | Database backups |
| [ ] Monitoring configured | Recommended | Prometheus/Grafana |

### Security Checklist

| Task | Status | Notes |
|------|--------|-------|
| [ ] JWT secret is strong (32+ chars) | Required | Generate new for production |
| [ ] Database password is strong | Required | 16+ characters, mixed |
| [ ] CORS origins restricted | Required | Only allow production domains |
| [ ] Rate limiting enabled | Recommended | Prevent DoS |
| [ ] Admin accounts secured | Required | Change default passwords |
| [ ] Environment variables secured | Required | Use secrets manager |
| [ ] SSL/TLS enforced | Required | HTTPS only |
| [ ] MQTT credentials secured | Required | Unique credentials |

### Environment Variables Checklist

| Variable | Required | Example |
|----------|----------|---------|
| `DB_USERNAME` | Yes | `hvac_admin` |
| `DB_PASSWORD` | Yes | `<strong-password>` |
| `JWT_SECRET` | Yes | `<64-char-random-string>` |
| `MAIL_USERNAME` | Yes | `noreply@yourdomain.com` |
| `MAIL_PASSWORD` | Yes | `<app-password>` |
| `MOSQUITTO_HOST` | Yes | `mqtt.yourdomain.com` |
| `MOSQUITTO_PORT` | Yes | `1883` or `8883` (TLS) |
| `MOSQUITTO_USERNAME` | Yes | `hvac-backend` |
| `MOSQUITTO_PASSWORD` | Yes | `<mqtt-password>` |
| `GOOGLE_CLIENT_ID` | Optional | For Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | For Google OAuth |

---

## Environment Configuration

### Production Environment Variables

Create a `.env.production` file (never commit to git):

```bash
# Database Configuration
DB_HOST=your-db-host.com
DB_PORT=5432
DB_NAME=hvac_db
DB_USERNAME=hvac_admin
DB_PASSWORD=your-secure-database-password-here

# JWT Configuration
JWT_SECRET=your-64-character-super-secure-jwt-secret-key-change-in-production

# MQTT Broker Configuration
MOSQUITTO_HOST=mqtt.yourdomain.com
MOSQUITTO_PORT=8883
MOSQUITTO_USERNAME=hvac-backend
MOSQUITTO_PASSWORD=your-secure-mqtt-password

# Email Configuration (Gmail example)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# CORS Configuration
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com

# Server Configuration
SERVER_PORT=8080
SPRING_PROFILES_ACTIVE=production
```

### Application Properties for Production

Create `/backend/src/main/resources/application-production.properties`:

```properties
# Server
server.port=${SERVER_PORT:8080}

# Database
spring.datasource.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=false

# Connection Pool
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000

# JWT
jwt.secret=${JWT_SECRET}
jwt.expiration=21600000

# MQTT
mqtt.broker.url=ssl://${MOSQUITTO_HOST}:${MOSQUITTO_PORT}
mqtt.broker.username=${MOSQUITTO_USERNAME}
mqtt.broker.password=${MOSQUITTO_PASSWORD}
mqtt.client.id=hvac-backend-prod-${random.uuid}

# Email
spring.mail.host=${MAIL_HOST}
spring.mail.port=${MAIL_PORT}
spring.mail.username=${MAIL_USERNAME}
spring.mail.password=${MAIL_PASSWORD}
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true

# CORS
cors.allowed.origins=${CORS_ALLOWED_ORIGINS}

# Logging
logging.level.root=WARN
logging.level.com.hvac=INFO
logging.file.name=/var/log/hvac/application.log

# Actuator
management.endpoints.web.exposure.include=health,info,prometheus
management.endpoint.health.show-details=when-authorized
```

---

## Database Setup

### Step 1: Create PostgreSQL Database

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database and user
CREATE DATABASE hvac_db;
CREATE USER hvac_admin WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE hvac_db TO hvac_admin;

# Grant schema permissions
\c hvac_db
GRANT ALL ON SCHEMA public TO hvac_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hvac_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hvac_admin;

\q
```

### Step 2: Configure PostgreSQL for Production

Edit `/etc/postgresql/15/main/postgresql.conf`:

```conf
# Performance tuning
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 128MB
work_mem = 4MB

# Connection settings
max_connections = 100
listen_addresses = 'localhost'  # Or specific IP for remote access

# Logging
log_statement = 'mod'
log_duration = on
log_min_duration_statement = 1000  # Log queries > 1 second
```

Edit `/etc/postgresql/15/main/pg_hba.conf` for authentication:

```conf
# Local connections
local   all   all                 peer
# IPv4 connections
host    all   all   127.0.0.1/32  scram-sha-256
# Remote connections (if needed)
host    hvac_db   hvac_admin   10.0.0.0/8   scram-sha-256
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Step 3: Run Database Migration

For first deployment:
```bash
# Let Hibernate create tables (only first time)
# Set ddl-auto=update temporarily, then change to validate

cd /home/user/AC_contoler_HVAC/backend
./mvnw spring-boot:run -Dspring.profiles.active=production
# Wait for tables to be created, then stop and change ddl-auto to validate
```

### Step 4: Create Default Admin Account

```sql
-- Connect to database
psql -U hvac_admin -d hvac_db

-- Insert default admin (password: change-me-immediately)
-- BCrypt hash for 'change-me-immediately'
INSERT INTO users (username, email, password, role, is_active, created_at, updated_at)
VALUES (
    'admin',
    'admin@yourdomain.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrL8Usy5SKJ0VOIi5vV5VmVV.cKBPy',
    'ADMIN',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
```

---

## Backend Deployment

### Option 1: JAR Deployment (Recommended)

#### Step 1: Build the Application

```bash
cd /home/user/AC_contoler_HVAC/backend

# Clean and build with production profile
./mvnw clean package -DskipTests -Pproduction

# JAR will be created at: target/hvac-backend-0.0.1-SNAPSHOT.jar
```

#### Step 2: Create System Service

Create `/etc/systemd/system/hvac-backend.service`:

```ini
[Unit]
Description=HVAC Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=hvac
Group=hvac
WorkingDirectory=/opt/hvac
ExecStart=/usr/bin/java -jar -Dspring.profiles.active=production /opt/hvac/hvac-backend.jar
EnvironmentFile=/opt/hvac/.env
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/hvac

[Install]
WantedBy=multi-user.target
```

#### Step 3: Deploy and Start

```bash
# Create user and directories
sudo useradd -r -s /bin/false hvac
sudo mkdir -p /opt/hvac /var/log/hvac
sudo chown hvac:hvac /opt/hvac /var/log/hvac

# Copy files
sudo cp target/hvac-backend-0.0.1-SNAPSHOT.jar /opt/hvac/hvac-backend.jar
sudo cp .env.production /opt/hvac/.env
sudo chown hvac:hvac /opt/hvac/*
sudo chmod 600 /opt/hvac/.env

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable hvac-backend
sudo systemctl start hvac-backend

# Check status
sudo systemctl status hvac-backend
sudo journalctl -u hvac-backend -f
```

### Option 2: Docker Deployment

#### Dockerfile

Create `/backend/Dockerfile`:

```dockerfile
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S hvac && adduser -S hvac -G hvac

# Copy JAR
COPY target/hvac-backend-0.0.1-SNAPSHOT.jar app.jar

# Set ownership
RUN chown -R hvac:hvac /app

USER hvac

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=production", "app.jar"]
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=hvac_db
      - DB_USERNAME=hvac_admin
      - DB_PASSWORD=${DB_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - MOSQUITTO_HOST=${MOSQUITTO_HOST}
      - MOSQUITTO_PORT=${MOSQUITTO_PORT}
      - MOSQUITTO_USERNAME=${MOSQUITTO_USERNAME}
      - MOSQUITTO_PASSWORD=${MOSQUITTO_PASSWORD}
      - MAIL_HOST=${MAIL_HOST}
      - MAIL_PORT=${MAIL_PORT}
      - MAIL_USERNAME=${MAIL_USERNAME}
      - MAIL_PASSWORD=${MAIL_PASSWORD}
    depends_on:
      - db
    restart: always
    networks:
      - hvac-network

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=hvac_db
      - POSTGRES_USER=hvac_admin
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    restart: always
    networks:
      - hvac-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - backend
    restart: always
    networks:
      - hvac-network

volumes:
  postgres_data:

networks:
  hvac-network:
    driver: bridge
```

#### Deploy with Docker

```bash
# Build and start
docker-compose build
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

### Option 3: Railway Deployment

#### Step 1: Connect Repository

1. Go to [Railway.app](https://railway.app)
2. Create new project
3. Connect GitHub repository
4. Select `backend` folder as root

#### Step 2: Configure Environment Variables

In Railway dashboard, add all environment variables from the checklist.

#### Step 3: Add PostgreSQL

1. Click "New" → "Database" → "PostgreSQL"
2. Railway auto-injects `DATABASE_URL`
3. Update application.properties to use `DATABASE_URL` if needed

#### Step 4: Deploy

Railway auto-deploys on git push. Monitor in dashboard.

---

## Frontend Deployment

### Customer Portal (Next.js)

#### Step 1: Build for Production

```bash
cd /home/user/AC_contoler_HVAC/customer_portal

# Create .env.production
echo "NEXT_PUBLIC_API_URL=https://api.yourdomain.com" > .env.production

# Build
npm run build

# Output in .next folder
```

#### Step 2: Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Follow prompts to configure project
```

#### Step 3: Deploy to Self-Hosted (Alternative)

```bash
# Build static export (if supported)
npm run build
npm run export

# Copy to web server
sudo cp -r out/* /var/www/customer-portal/

# Or run with PM2
npm install -g pm2
pm2 start npm --name "customer-portal" -- start
pm2 save
pm2 startup
```

### Admin Panel (Next.js)

Follow same steps as Customer Portal, using `/admin_panel` directory.

---

## ESP32 Firmware Deployment

### Step 1: Update Configuration

Edit `/esp32/hvac_controller.ino`:

```cpp
// WiFi Configuration
const char* WIFI_SSID = "Your-Production-WiFi";
const char* WIFI_PASSWORD = "Your-WiFi-Password";

// MQTT Configuration
const char* MQTT_BROKER = "mqtt.yourdomain.com";
const int MQTT_PORT = 8883;  // TLS port
const char* MQTT_USER = "device-user";
const char* MQTT_PASSWORD = "device-password";

// Device Configuration
const char* DEVICE_ID = "HVAC-UNIT-001";  // Unique per device
```

### Step 2: Flash Firmware

Using Arduino IDE or PlatformIO:

```bash
# PlatformIO
cd /home/user/AC_contoler_HVAC/esp32
pio run -t upload
```

### Step 3: Register Device in Backend

```bash
# Call admin API to register device
curl -X POST https://api.yourdomain.com/api/admin/devices \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "HVAC-UNIT-001",
    "deviceName": "Main Building HVAC",
    "location": "Building A, Floor 1",
    "isLicensed": true
  }'
```

---

## MQTT Broker Setup

### Option 1: Self-Hosted Mosquitto

```bash
# Install Mosquitto
sudo apt install mosquitto mosquitto-clients

# Create password file
sudo mosquitto_passwd -c /etc/mosquitto/passwd hvac-backend
sudo mosquitto_passwd /etc/mosquitto/passwd device-user

# Configure Mosquitto
sudo nano /etc/mosquitto/conf.d/hvac.conf
```

```conf
# /etc/mosquitto/conf.d/hvac.conf
listener 1883 localhost
listener 8883
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key

allow_anonymous false
password_file /etc/mosquitto/passwd

# Access Control
acl_file /etc/mosquitto/acl
```

```bash
# Create ACL file
sudo nano /etc/mosquitto/acl
```

```conf
# Backend can publish/subscribe to all hvac topics
user hvac-backend
topic readwrite hvac/#

# Devices can only access their own topics
pattern readwrite hvac/%u/#
```

```bash
# Restart Mosquitto
sudo systemctl restart mosquitto
```

### Option 2: Cloud MQTT (HiveMQ Cloud)

1. Sign up at [HiveMQ Cloud](https://www.hivemq.com/mqtt-cloud-broker/)
2. Create cluster
3. Add credentials
4. Update environment variables with HiveMQ credentials

---

## Post-Deployment Verification

### Verification Checklist

```bash
# 1. Health Check
curl https://api.yourdomain.com/actuator/health
# Expected: {"status":"UP"}

# 2. Test Authentication
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-password"}'
# Expected: Success message about verification code

# 3. Test Database Connection
# Check logs for successful Hibernate startup

# 4. Test MQTT Connection
# Check logs for "MQTT Connected" message

# 5. Test Device Communication
# Power on ESP32, check for telemetry in database

# 6. Test Frontend
curl https://yourdomain.com
# Expected: HTML response from Next.js
```

### Monitoring Commands

```bash
# View backend logs
sudo journalctl -u hvac-backend -f

# Check service status
sudo systemctl status hvac-backend

# Check database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='hvac_db';"

# Check disk usage
df -h

# Check memory usage
free -h
```

---

## Rollback Procedures

### Backend Rollback

```bash
# Keep previous JAR versions
/opt/hvac/
  ├── hvac-backend.jar          # Current
  ├── hvac-backend.jar.backup1  # Previous
  └── hvac-backend.jar.backup2  # Older

# Rollback command
sudo systemctl stop hvac-backend
sudo cp /opt/hvac/hvac-backend.jar /opt/hvac/hvac-backend.jar.failed
sudo cp /opt/hvac/hvac-backend.jar.backup1 /opt/hvac/hvac-backend.jar
sudo systemctl start hvac-backend
```

### Database Rollback

```bash
# Restore from backup
pg_restore -h localhost -U postgres -d hvac_db_restore hvac_backup.dump

# Rename databases
psql -U postgres -c "ALTER DATABASE hvac_db RENAME TO hvac_db_failed;"
psql -U postgres -c "ALTER DATABASE hvac_db_restore RENAME TO hvac_db;"
```

### Docker Rollback

```bash
# Use specific image tags
docker-compose down
docker-compose up -d --no-build  # Uses cached images

# Or specify version
docker pull hvac-backend:v1.0.0
docker-compose up -d
```

---

## Troubleshooting

### Common Issues

#### 1. Backend Won't Start

```bash
# Check logs
sudo journalctl -u hvac-backend -n 100

# Common causes:
# - Database connection failed: Check DB_HOST, credentials
# - Port already in use: Check with `netstat -tlnp | grep 8080`
# - Missing environment variables: Check .env file
```

#### 2. MQTT Connection Failed

```bash
# Test MQTT connection
mosquitto_sub -h mqtt.yourdomain.com -p 8883 -u hvac-backend -P password --capath /etc/ssl/certs -t "test"

# Common causes:
# - Wrong credentials
# - Firewall blocking port
# - TLS certificate issues
```

#### 3. Database Queries Slow

```sql
-- Check slow queries
SELECT query, calls, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check missing indexes
EXPLAIN ANALYZE SELECT * FROM telemetry WHERE device_id = 1 AND timestamp > NOW() - INTERVAL '1 day';
```

#### 4. ESP32 Not Connecting

```cpp
// Enable debug output in firmware
#define DEBUG_MQTT true

// Check serial output for:
// - WiFi connection status
// - MQTT broker connection
// - Certificate errors (if using TLS)
```

#### 5. Frontend Not Loading

```bash
# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Common causes:
# - Wrong API URL in .env
# - CORS issues
# - SSL certificate problems
```

### Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| System Admin | admin@yourdomain.com | Server issues |
| Database Admin | dba@yourdomain.com | Database issues |
| On-Call Engineer | oncall@yourdomain.com | After-hours issues |
