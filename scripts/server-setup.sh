#!/bin/bash
# =====================================================
# Server Initial Setup Script for HVAC Deployment
# =====================================================
# Run this script once on a fresh Ubuntu server to prepare
# it for automated CI/CD deployments.
#
# Usage: sudo bash server-setup.sh
# =====================================================

set -e

echo "========================================"
echo "HVAC Server Setup Script"
echo "========================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (sudo)"
    exit 1
fi

# Update system packages
echo ">>> Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo ">>> Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Enable Docker service
    systemctl enable docker
    systemctl start docker
else
    echo ">>> Docker already installed"
fi

# Install Docker Compose plugin if not installed
if ! docker compose version &> /dev/null; then
    echo ">>> Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin
else
    echo ">>> Docker Compose already installed"
fi

# Create deployment directory
echo ">>> Creating deployment directory at /opt/hvac..."
mkdir -p /opt/hvac

# Create .env template if it doesn't exist
if [ ! -f /opt/hvac/.env ]; then
    echo ">>> Creating .env template..."
    cat > /opt/hvac/.env << 'EOF'
# =====================================================
# HVAC Production Environment Variables
# =====================================================
# Update these values with your actual credentials

# GitLab Container Registry
CI_REGISTRY=registry.gitlab.com
CI_REGISTRY_IMAGE=registry.gitlab.com/YOUR_GROUP/YOUR_PROJECT
CI_REGISTRY_USER=gitlab-ci-token
CI_REGISTRY_PASSWORD=YOUR_DEPLOY_TOKEN

# Image tag (leave as 'latest' for auto-deployment)
IMAGE_TAG=latest

# Domain Configuration
DOMAIN=live-ac.tech
ACME_EMAIL=admin@live-ac.tech

# Database Configuration
DB_NAME=hvac_db
DB_USERNAME=postgres
DB_PASSWORD=CHANGE_THIS_SECURE_PASSWORD

# MQTT Broker Configuration
MOSQUITTO_HOST=trolley.proxy.rlwy.net
MOSQUITTO_PORT=26703
MOSQUITTO_USERNAME=hvac-monitoring-system
MOSQUITTO_PASSWORD=YOUR_MQTT_PASSWORD

# JWT Authentication
JWT_SECRET=YOUR_SUPER_SECURE_JWT_SECRET_MINIMUM_256_BITS
JWT_EXPIRATION=21600000

# Email Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password

# Google OAuth2 (Optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Traefik Dashboard Auth (generate with: htpasswd -nb admin password)
TRAEFIK_AUTH=admin:$$apr1$$H6uskkkW$$IgXLP6ewTrSuBkTrqE8wj/
EOF
    echo ">>> IMPORTANT: Edit /opt/hvac/.env with your actual credentials!"
fi

# Download docker-compose.deploy.yml
echo ">>> Downloading docker-compose.deploy.yml..."
# Note: In production, this will be pulled from your repo or copied by CI/CD

# Set permissions
chmod 600 /opt/hvac/.env

# Create a systemd service for auto-restart on reboot
echo ">>> Creating systemd service for auto-start..."
cat > /etc/systemd/system/hvac-docker.service << 'EOF'
[Unit]
Description=HVAC Docker Compose Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/hvac
ExecStart=/usr/bin/docker compose -f docker-compose.deploy.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.deploy.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable hvac-docker.service

# Configure firewall
echo ">>> Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw --force enable
fi

# Print completion message
echo ""
echo "========================================"
echo "Server Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Edit /opt/hvac/.env with your actual credentials"
echo "2. Copy docker-compose.deploy.yml to /opt/hvac/"
echo "3. Configure GitLab CI/CD variables (see DEPLOYMENT.md)"
echo "4. Push to main branch to trigger deployment"
echo ""
echo "Manual commands:"
echo "  Start:   cd /opt/hvac && docker compose -f docker-compose.deploy.yml up -d"
echo "  Stop:    cd /opt/hvac && docker compose -f docker-compose.deploy.yml down"
echo "  Logs:    cd /opt/hvac && docker compose -f docker-compose.deploy.yml logs -f"
echo "  Status:  cd /opt/hvac && docker compose -f docker-compose.deploy.yml ps"
echo ""
