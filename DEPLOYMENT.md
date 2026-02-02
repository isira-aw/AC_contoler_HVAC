# HVAC IoT System - Deployment Guide

## Domain Configuration
- **Domain**: `live-ac.tech`
- **Server IP**: `64.227.144.94`
- **DNS Records**:
  - `live-ac.tech` → `64.227.144.94` (A Record)
  - `www.live-ac.tech` → `64.227.144.94` (A Record)

---

## Option 1: Deploy with Dokploy (Recommended)

### Step 1: Install Dokploy on Your VPS

SSH into your server and run:

```bash
ssh root@64.227.144.94

# Install Dokploy
curl -sSL https://dokploy.com/install.sh | sh
```

After installation, access Dokploy at: `http://64.227.144.94:3000`

### Step 2: Configure Dokploy

1. **Create Admin Account**: First time access will prompt you to create admin credentials

2. **Add Domain Settings**:
   - Go to **Settings** → **Server**
   - Add your domain: `live-ac.tech`

3. **Setup SSL**:
   - Go to **Settings** → **Certificates**
   - Add Let's Encrypt certificate for `live-ac.tech` and `api.live-ac.tech`

### Step 3: Create Projects in Dokploy

#### A. Create PostgreSQL Database

1. Go to **Projects** → **Create Project** → Name it "HVAC System"
2. Click **Add Service** → **Database** → **PostgreSQL**
3. Configure:
   - Name: `hvac-postgres`
   - Database: `hvac_db`
   - User: `postgres`
   - Password: *Generate secure password*
4. Deploy and note the internal connection URL

#### B. Deploy Backend (Spring Boot)

1. In the same project, click **Add Service** → **Application**
2. Configure:
   - **Name**: `hvac-backend`
   - **Source**: Git Repository
   - **Repository URL**: Your GitLab repo URL
   - **Branch**: `main`
   - **Build Path**: `/backend`
   - **Dockerfile Path**: `backend/Dockerfile`

3. **Environment Variables** (Settings → Environment):
```
SPRING_DATASOURCE_URL=jdbc:postgresql://hvac-postgres:5432/hvac_db
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=<your_db_password>
MOSQUITTO_HOST=trolley.proxy.rlwy.net
MOSQUITTO_PORT=26703
MOSQUITTO_USERNAME=hvac-monitoring-system
MOSQUITTO_PASSWORD=<your_mqtt_password>
JWT_SECRET=<generate_secure_256bit_key>
JWT_EXPIRATION=21600000
SPRING_MAIL_HOST=smtp.gmail.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=<your_email>
SPRING_MAIL_PASSWORD=<your_app_password>
GOOGLE_CLIENT_ID=<your_google_client_id>
GOOGLE_CLIENT_SECRET=<your_google_secret>
CORS_ALLOWED_ORIGINS=https://live-ac.tech,https://www.live-ac.tech
```

4. **Domain Configuration** (Settings → Domains):
   - Add domain: `api.live-ac.tech`
   - Port: `8080`
   - Enable HTTPS

5. Click **Deploy**

#### C. Deploy Customer Portal (Next.js)

1. Click **Add Service** → **Application**
2. Configure:
   - **Name**: `hvac-customer-portal`
   - **Source**: Git Repository
   - **Repository URL**: Your GitLab repo URL
   - **Branch**: `main`
   - **Build Path**: `/customer_portal`
   - **Dockerfile Path**: `customer_portal/Dockerfile`

3. **Build Arguments** (Settings → Build):
```
NEXT_PUBLIC_API_URL=https://api.live-ac.tech
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your_google_client_id>
```

4. **Domain Configuration** (Settings → Domains):
   - Add domains: `live-ac.tech` and `www.live-ac.tech`
   - Port: `3000`
   - Enable HTTPS

5. Click **Deploy**

### Step 4: Configure DNS (Already Done)

Your A records are already pointing to the server. You need to add one more:

| Type | Name | Value |
|------|------|-------|
| A | api | 64.227.144.94 |

This creates `api.live-ac.tech` for the backend API.

---

## Option 2: Deploy with Docker Compose (Manual)

### Step 1: Prepare Server

```bash
ssh root@64.227.144.94

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

### Step 2: Clone Repository

```bash
mkdir -p /opt/hvac
cd /opt/hvac

# Clone from GitLab
git clone https://gitlab.com/YOUR_USERNAME/AC_contoler_HVAC.git .
```

### Step 3: Create Environment File

```bash
cp .env.example .env
nano .env
```

Update all values in `.env`:
```env
# Database
DB_NAME=hvac_db
DB_USERNAME=postgres
DB_PASSWORD=<strong_password_here>

# MQTT
MOSQUITTO_HOST=trolley.proxy.rlwy.net
MOSQUITTO_PORT=26703
MOSQUITTO_USERNAME=hvac-monitoring-system
MOSQUITTO_PASSWORD=<your_mqtt_password>

# JWT
JWT_SECRET=<generate_with_openssl_rand_base64_32>

# Email
MAIL_USERNAME=<your_email>
MAIL_PASSWORD=<your_app_password>

# Google OAuth
GOOGLE_CLIENT_ID=<your_client_id>
GOOGLE_CLIENT_SECRET=<your_secret>

# Frontend
NEXT_PUBLIC_API_URL=https://api.live-ac.tech
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your_client_id>

# CORS
CORS_ALLOWED_ORIGINS=https://live-ac.tech,https://www.live-ac.tech
```

### Step 4: Install Nginx & Certbot

```bash
apt install nginx certbot python3-certbot-nginx -y
```

### Step 5: Configure Nginx

Create `/etc/nginx/sites-available/hvac`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.live-ac.tech;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Customer Portal
server {
    listen 80;
    server_name live-ac.tech www.live-ac.tech;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/hvac /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

### Step 6: Get SSL Certificates

```bash
certbot --nginx -d live-ac.tech -d www.live-ac.tech -d api.live-ac.tech
```

### Step 7: Deploy with Docker Compose

```bash
cd /opt/hvac

# Build and start all services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Step 8: Verify Deployment

```bash
# Check backend health
curl https://api.live-ac.tech/actuator/health

# Check frontend
curl https://live-ac.tech
```

---

## Troubleshooting

### Check Container Logs
```bash
docker compose logs backend
docker compose logs customer-portal
docker compose logs postgres
```

### Restart Services
```bash
docker compose restart
```

### Rebuild After Code Changes
```bash
docker compose down
docker compose up -d --build
```

### Database Access
```bash
docker compose exec postgres psql -U postgres -d hvac_db
```

### Check Nginx Logs
```bash
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

---

## CI/CD with GitLab (Automatic Deployment)

This repository includes a GitLab CI/CD pipeline that automatically:
1. **Builds** Docker images for both applications when code changes
2. **Pushes** images to GitLab Container Registry
3. **Deploys** to production server when code is merged to `main`

### Pipeline Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    BUILD    │────▶│    TEST     │────▶│   DEPLOY    │
│             │     │  (optional) │     │             │
│ - Backend   │     │             │     │ SSH to      │
│ - Portal    │     │             │     │ server      │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Required GitLab CI/CD Variables

Go to **Settings** → **CI/CD** → **Variables** and add:

| Variable | Value | Protected | Masked | Description |
|----------|-------|-----------|--------|-------------|
| `SERVER_IP` | `64.227.144.94` | Yes | No | Production server IP |
| `SSH_PRIVATE_KEY` | SSH private key content | Yes | Yes | For SSH deployment |
| `SSH_KNOWN_HOSTS` | Server SSH fingerprint | Yes | No | Prevents MITM |
| `NEXT_PUBLIC_API_URL` | `https://api.live-ac.tech` | No | No | Backend API URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Your Google Client ID | No | No | OAuth client ID |

### Step 1: Generate SSH Deployment Key

```bash
# On your local machine
ssh-keygen -t ed25519 -C "gitlab-deploy" -f ~/.ssh/gitlab-deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/gitlab-deploy.pub root@64.227.144.94

# Get the private key content (add this to GitLab CI/CD variables)
cat ~/.ssh/gitlab-deploy

# Get known_hosts entry (add this to GitLab CI/CD variables)
ssh-keyscan -H 64.227.144.94
```

### Step 2: Prepare Production Server

Run the server setup script on your production server:

```bash
ssh root@64.227.144.94

# Download and run setup script
curl -sSL https://raw.githubusercontent.com/YOUR_REPO/scripts/server-setup.sh | bash

# Or manually:
mkdir -p /opt/hvac
cd /opt/hvac

# Create environment file
nano .env
# (Add all required environment variables)

# Copy docker-compose.deploy.yml from this repository
# Then login to GitLab Container Registry
docker login registry.gitlab.com
```

### Step 3: Configure Server Environment

Edit `/opt/hvac/.env` on the production server:

```env
# GitLab Container Registry
CI_REGISTRY=registry.gitlab.com
CI_REGISTRY_IMAGE=registry.gitlab.com/YOUR_GROUP/YOUR_PROJECT
CI_REGISTRY_USER=gitlab-ci-token
CI_REGISTRY_PASSWORD=YOUR_DEPLOY_TOKEN_OR_PAT

# Domain
DOMAIN=live-ac.tech

# Database
DB_NAME=hvac_db
DB_USERNAME=postgres
DB_PASSWORD=YOUR_SECURE_DB_PASSWORD

# Add all other variables from .env.example
```

### Step 4: Create GitLab Deploy Token (for server to pull images)

1. Go to GitLab → **Settings** → **Repository** → **Deploy tokens**
2. Create a token with `read_registry` scope
3. Use this token as `CI_REGISTRY_PASSWORD` on the server

### Step 5: Copy docker-compose.deploy.yml to Server

```bash
scp docker-compose.deploy.yml root@64.227.144.94:/opt/hvac/
```

### How It Works

1. **On Push to `main`**: Pipeline automatically triggers
2. **Build Stage**: Builds Docker images and pushes to GitLab Container Registry
3. **Deploy Stage**:
   - SSHs into production server
   - Pulls latest images from registry
   - Restarts containers with zero-downtime
   - Cleans up old images

### Manual Deployment Commands

```bash
# On production server
cd /opt/hvac

# Pull latest images
docker compose -f docker-compose.deploy.yml pull

# Restart services
docker compose -f docker-compose.deploy.yml up -d --remove-orphans

# View logs
docker compose -f docker-compose.deploy.yml logs -f
```

### Rollback to Previous Version

```bash
# On production server - deploy specific tag
export IMAGE_TAG=abc123sha
docker compose -f docker-compose.deploy.yml up -d
```

Or trigger manual rollback job in GitLab CI/CD pipeline.

---

## Future: Separate Repositories

When the applications are moved to separate GitLab repositories, each repo will need its own `.gitlab-ci.yml`:

### Backend Repository `.gitlab-ci.yml`

```yaml
stages:
  - build
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: ""

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA -t $CI_REGISTRY_IMAGE:latest .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker push $CI_REGISTRY_IMAGE:latest
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  tags:
    - docker

deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    - echo "$SSH_KNOWN_HOSTS" >> ~/.ssh/known_hosts
  script:
    - |
      ssh root@$SERVER_IP << 'EOF'
        cd /opt/hvac
        docker compose -f docker-compose.deploy.yml pull backend
        docker compose -f docker-compose.deploy.yml up -d --no-deps backend
        docker image prune -f
      EOF
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  environment:
    name: production
  tags:
    - docker
```

### Customer Portal Repository `.gitlab-ci.yml`

```yaml
stages:
  - build
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: ""

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - |
      docker build \
        --build-arg NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
        --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
        -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA \
        -t $CI_REGISTRY_IMAGE:latest .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker push $CI_REGISTRY_IMAGE:latest
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  tags:
    - docker

deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    - echo "$SSH_KNOWN_HOSTS" >> ~/.ssh/known_hosts
  script:
    - |
      ssh root@$SERVER_IP << 'EOF'
        cd /opt/hvac
        docker compose -f docker-compose.deploy.yml pull customer-portal
        docker compose -f docker-compose.deploy.yml up -d --no-deps customer-portal
        docker image prune -f
      EOF
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  environment:
    name: production
  tags:
    - docker
```

### Updated docker-compose.deploy.yml for Separate Repos

Update the image references on the production server:

```yaml
services:
  backend:
    image: registry.gitlab.com/YOUR_GROUP/backend:${BACKEND_TAG:-latest}
    # ... rest of config

  customer-portal:
    image: registry.gitlab.com/YOUR_GROUP/customer-portal:${PORTAL_TAG:-latest}
    # ... rest of config
```

---

## Architecture Overview

```
                    ┌──────────────────────┐
                    │   live-ac.tech       │
                    │   (Customer Portal)  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │      Nginx/Traefik   │
                    │   (Reverse Proxy)    │
                    │   + SSL Termination  │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼─────────┐ ┌───────▼───────┐  ┌────────▼────────┐
│  Customer Portal  │ │    Backend    │  │   PostgreSQL    │
│   (Next.js:3000)  │ │ (Spring:8080) │  │    (:5432)      │
└───────────────────┘ └───────┬───────┘  └─────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   MQTT Broker     │
                    │  (External)       │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   ESP32 Devices   │
                    │   (HVAC Units)    │
                    └───────────────────┘
```

---

## Security Checklist

- [ ] Change default database password
- [ ] Generate strong JWT secret (`openssl rand -base64 32`)
- [ ] Enable firewall (ufw)
- [ ] Configure fail2ban
- [ ] Regular security updates
- [ ] Backup database regularly

```bash
# Enable firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Install fail2ban
apt install fail2ban -y
systemctl enable fail2ban
```
