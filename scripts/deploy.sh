#!/bin/bash

# =============================================================================
# HVAC IoT System - Deployment Script
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

cd /opt/hvac

# Check if .env exists
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    log_info "Please copy .env.example to .env and configure it:"
    log_info "  cp .env.example .env"
    log_info "  nano .env"
    exit 1
fi

log_info "========================================"
log_info "Starting HVAC IoT System Deployment"
log_info "========================================"

# Step 1: Pull latest code
log_step "1/6 - Pulling latest code from GitLab..."
git pull origin main || log_warn "Could not pull from remote (might be local only)"

# Step 2: Build images
log_step "2/6 - Building Docker images..."
docker compose build --no-cache

# Step 3: Stop existing containers
log_step "3/6 - Stopping existing containers..."
docker compose down --remove-orphans || true

# Step 4: Start database first
log_step "4/6 - Starting database..."
docker compose up -d postgres
log_info "Waiting for database to be ready..."
sleep 10

# Check database health
until docker compose exec -T postgres pg_isready -U postgres -d hvac_db; do
    log_warn "Database is not ready yet, waiting..."
    sleep 5
done
log_info "Database is ready!"

# Step 5: Start all services
log_step "5/6 - Starting all services..."
docker compose up -d

# Step 6: Verify deployment
log_step "6/6 - Verifying deployment..."
sleep 30

# Check service health
log_info "Checking service status..."
docker compose ps

# Test endpoints
log_info "Testing backend health..."
if curl -s http://localhost:8080/actuator/health | grep -q "UP"; then
    log_info "Backend is healthy!"
else
    log_warn "Backend health check failed, checking logs..."
    docker compose logs --tail=50 backend
fi

log_info "Testing frontend..."
if curl -s http://localhost:3000 > /dev/null; then
    log_info "Frontend is running!"
else
    log_warn "Frontend check failed, checking logs..."
    docker compose logs --tail=50 customer_portal
fi

# Clean up old images
log_info "Cleaning up old Docker images..."
docker image prune -f

log_info "========================================"
log_info "Deployment Complete!"
log_info "========================================"
log_info ""
log_info "Services running at:"
log_info "  - Frontend: https://live-ac.tech"
log_info "  - Backend API: https://live-ac.tech/api"
log_info ""
log_info "Useful commands:"
log_info "  - View logs: docker compose logs -f"
log_info "  - View specific service: docker compose logs -f backend"
log_info "  - Restart all: docker compose restart"
log_info "  - Stop all: docker compose down"
log_info ""
