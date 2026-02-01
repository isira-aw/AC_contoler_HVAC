#!/bin/bash

# =============================================================================
# HVAC IoT System - VPS Setup Script
# Domain: live-ac.tech
# Server: Ubuntu 24.04
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (use sudo)"
    exit 1
fi

log_info "Starting HVAC IoT System Setup..."

# =============================================================================
# 1. Update System
# =============================================================================
log_info "Updating system packages..."
apt update && apt upgrade -y

# =============================================================================
# 2. Install Docker
# =============================================================================
log_info "Installing Docker..."

# Remove old versions
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install prerequisites
apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    ufw

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

log_info "Docker installed successfully!"
docker --version
docker compose version

# =============================================================================
# 3. Configure Firewall
# =============================================================================
log_info "Configuring firewall..."

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

log_info "Firewall configured!"

# =============================================================================
# 4. Create Application Directory
# =============================================================================
log_info "Creating application directory..."

mkdir -p /opt/hvac
mkdir -p /opt/hvac/certbot/conf
mkdir -p /opt/hvac/certbot/www

# =============================================================================
# 5. Clone Repository (if not exists)
# =============================================================================
log_info "Setting up application..."

if [ -d "/opt/hvac/.git" ]; then
    log_info "Repository already exists, pulling latest changes..."
    cd /opt/hvac
    git pull origin main
else
    log_info "Please clone your GitLab repository to /opt/hvac"
    log_warn "Run: git clone <your-gitlab-repo-url> /opt/hvac"
fi

log_info "========================================"
log_info "Server setup complete!"
log_info "========================================"
log_info ""
log_info "Next steps:"
log_info "1. Clone your repository to /opt/hvac"
log_info "2. Copy .env.example to .env and configure"
log_info "3. Run: cd /opt/hvac && ./scripts/init-ssl.sh"
log_info "4. Run: cd /opt/hvac && ./scripts/deploy.sh"
log_info ""
