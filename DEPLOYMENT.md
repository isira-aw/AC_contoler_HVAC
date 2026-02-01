# HVAC IoT System - Deployment Guide

Deploy the HVAC IoT System on your VPS with Docker, Nginx, and SSL.

## Prerequisites

- **VPS**: Ubuntu 24.04 LTS (64.227.144.94)
- **Domain**: live-ac.tech (A records pointing to VPS IP)
- **GitLab**: Repository uploaded with CI/CD variables configured

---

## Quick Deployment (5 Steps)

### Step 1: SSH into your VPS

```bash
ssh root@64.227.144.94
```

### Step 2: Run the server setup script

```bash
# Download and run setup script (or clone repo first)
apt update && apt install -y git

# Clone your GitLab repository
git clone https://gitlab.com/YOUR_USERNAME/AC_contoler_HVAC.git /opt/hvac

# Run setup
cd /opt/hvac
chmod +x scripts/*.sh
./scripts/setup-server.sh
```

### Step 3: Configure environment variables

```bash
cd /opt/hvac

# Copy example env file
cp .env.example .env

# Edit with your values
nano .env
```

**Required values to change in .env:**

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | Strong database password |
| `JWT_SECRET` | Generate with `openssl rand -base64 64` |
| `MOSQUITTO_PASSWORD` | Your MQTT broker password |
| `MAIL_USERNAME` | Your Gmail address |
| `MAIL_PASSWORD` | Gmail App Password |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret |

### Step 4: Initialize SSL certificates

```bash
./scripts/init-ssl.sh
```

### Step 5: Deploy the application

```bash
./scripts/deploy.sh
```

---

## Detailed Setup Guide

### 1. Server Preparation

The `setup-server.sh` script automatically:
- Updates system packages
- Installs Docker and Docker Compose
- Configures UFW firewall (ports 22, 80, 443)
- Creates application directory structure

### 2. Environment Configuration

#### Database
```env
DB_NAME=hvac_db
DB_USERNAME=postgres
DB_PASSWORD=<strong-password>  # Change this!
```

#### JWT Secret
Generate a secure key:
```bash
openssl rand -base64 64
```

#### Gmail App Password
1. Go to https://myaccount.google.com/apppasswords
2. Create an App Password for "Mail"
3. Use this 16-character password in `MAIL_PASSWORD`

#### Google OAuth2
1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://live-ac.tech`
   - `https://www.live-ac.tech`
4. Copy Client ID and Secret to `.env`

### 3. SSL Certificate

The `init-ssl.sh` script:
1. Creates a temporary self-signed certificate
2. Starts Nginx for Let's Encrypt challenge
3. Obtains real certificates from Let's Encrypt
4. Configures auto-renewal

### 4. Application Deployment

The `deploy.sh` script:
1. Pulls latest code from GitLab
2. Builds Docker images
3. Starts services in order (DB -> Backend -> Frontend -> Nginx)
4. Verifies health checks
5. Cleans up old images

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         INTERNET                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │   Nginx   │  Port 80/443
                    │   (SSL)   │
                    └─────┬─────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                │
┌─────────────┐   ┌─────────────┐          │
│  Frontend   │   │   Backend   │          │
│  (Next.js)  │   │(Spring Boot)│          │
│  Port 3000  │   │  Port 8080  │          │
└─────────────┘   └──────┬──────┘          │
                         │                 │
                    ┌────▼────┐            │
                    │PostgreSQL│           │
                    │Port 5432 │           │
                    └─────────┘            │
                                           │
                    ┌─────────────┐        │
                    │   Certbot   │◄───────┘
                    │ (SSL Renew) │
                    └─────────────┘
```

---

## URL Routing

| URL | Service |
|-----|---------|
| `https://live-ac.tech/` | Customer Portal (Next.js) |
| `https://live-ac.tech/api/*` | Backend API (Spring Boot) |
| `https://live-ac.tech/api/actuator/health` | Health Check |

---

## Useful Commands

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f customer_portal
docker compose logs -f postgres
docker compose logs -f nginx
```

### Restart Services
```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart backend
```

### Stop/Start
```bash
# Stop all
docker compose down

# Start all
docker compose up -d
```

### Database Access
```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U postgres -d hvac_db

# Backup database
docker compose exec postgres pg_dump -U postgres hvac_db > backup.sql

# Restore database
cat backup.sql | docker compose exec -T postgres psql -U postgres -d hvac_db
```

### Update Deployment
```bash
cd /opt/hvac
git pull origin main
./scripts/deploy.sh
```

---

## GitLab CI/CD Setup

### Required CI/CD Variables

Go to GitLab > Settings > CI/CD > Variables and add:

| Variable | Type | Protected |
|----------|------|-----------|
| `SSH_PRIVATE_KEY` | File | Yes |
| `SSH_KNOWN_HOSTS` | Variable | No |
| `SSH_USER` | Variable | No |
| `SSH_HOST` | Variable | No |
| `NEXT_PUBLIC_API_URL` | Variable | No |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Variable | No |

### Generate SSH Key for Deployment

```bash
# On your local machine
ssh-keygen -t ed25519 -C "gitlab-ci" -f gitlab-deploy-key

# Copy public key to server
ssh-copy-id -i gitlab-deploy-key.pub root@64.227.144.94

# Get known_hosts entry
ssh-keyscan 64.227.144.94

# Add private key content to GitLab as SSH_PRIVATE_KEY
cat gitlab-deploy-key
```

---

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker compose logs backend

# Common issues:
# - Database not ready: wait and restart
# - Wrong DB credentials: check .env
# - Port already in use: check for existing services
```

### SSL certificate issues
```bash
# Check certbot logs
docker compose logs certbot

# Force certificate renewal
docker compose run --rm certbot renew --force-renewal
docker compose exec nginx nginx -s reload
```

### Database connection refused
```bash
# Check if postgres is running
docker compose ps postgres

# Restart postgres
docker compose restart postgres

# Check postgres logs
docker compose logs postgres
```

### Frontend shows "Internal Server Error"
```bash
# Check if API URL is correct
# Ensure NEXT_PUBLIC_API_URL ends with /api

# Rebuild frontend with correct env
docker compose build --no-cache customer_portal
docker compose up -d customer_portal
```

---

## Security Checklist

- [ ] Change default database password
- [ ] Generate strong JWT secret
- [ ] Configure Gmail App Password (not regular password)
- [ ] Set up Google OAuth2 credentials
- [ ] Firewall allows only ports 22, 80, 443
- [ ] SSL certificate is valid and auto-renewing
- [ ] Regular database backups configured

---

## Performance Tuning

### For high traffic, consider:

1. **Increase Docker resources** in `docker-compose.yml`:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
```

2. **PostgreSQL tuning** - create `postgres.conf`:
```
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
```

3. **Enable Docker Swarm** for horizontal scaling

---

## Support

For issues or questions:
1. Check the logs: `docker compose logs`
2. Review this guide
3. Check GitLab Issues
