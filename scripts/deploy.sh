#!/bin/bash
# =====================================================
# Deployment Script for HVAC Application
# =====================================================
# This script is called by GitLab CI/CD or can be run manually
#
# Usage: ./deploy.sh [options]
# Options:
#   --tag TAG    Deploy specific image tag (default: latest)
#   --pull-only  Only pull images, don't restart containers
#   --restart    Force restart all containers
# =====================================================

set -e

DEPLOY_DIR="/opt/hvac"
COMPOSE_FILE="docker-compose.deploy.yml"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PULL_ONLY=false
FORCE_RESTART=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --pull-only)
            PULL_ONLY=true
            shift
            ;;
        --restart)
            FORCE_RESTART=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "HVAC Deployment Script"
echo "========================================"
echo "Deploy directory: $DEPLOY_DIR"
echo "Image tag: $IMAGE_TAG"
echo "========================================"

# Change to deploy directory
cd "$DEPLOY_DIR"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found at $DEPLOY_DIR/.env"
    exit 1
fi

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Error: $COMPOSE_FILE not found at $DEPLOY_DIR"
    exit 1
fi

# Export IMAGE_TAG for docker compose
export IMAGE_TAG

# Login to GitLab Container Registry
echo ">>> Logging into GitLab Container Registry..."
if [ -n "$CI_REGISTRY" ] && [ -n "$CI_REGISTRY_USER" ] && [ -n "$CI_REGISTRY_PASSWORD" ]; then
    echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
else
    # Source from .env file
    source .env
    if [ -n "$CI_REGISTRY" ] && [ -n "$CI_REGISTRY_USER" ] && [ -n "$CI_REGISTRY_PASSWORD" ]; then
        echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
    else
        echo "Warning: Registry credentials not found, assuming already logged in"
    fi
fi

# Pull latest images
echo ">>> Pulling latest images..."
docker compose -f "$COMPOSE_FILE" pull

if [ "$PULL_ONLY" = true ]; then
    echo ">>> Pull complete (--pull-only mode)"
    exit 0
fi

# Get currently running containers
RUNNING_CONTAINERS=$(docker compose -f "$COMPOSE_FILE" ps -q 2>/dev/null | wc -l)

if [ "$FORCE_RESTART" = true ] || [ "$RUNNING_CONTAINERS" -eq 0 ]; then
    # Full restart
    echo ">>> Starting/Restarting all containers..."
    docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
else
    # Rolling update - recreate only containers with new images
    echo ">>> Performing rolling update..."
    docker compose -f "$COMPOSE_FILE" up -d --remove-orphans --no-deps backend customer-portal
fi

# Wait for health checks
echo ">>> Waiting for services to become healthy..."
sleep 10

# Check service status
echo ">>> Service status:"
docker compose -f "$COMPOSE_FILE" ps

# Cleanup old images
echo ">>> Cleaning up old images..."
docker image prune -f

# Verify deployment
echo ""
echo ">>> Verifying deployment..."
HEALTHY=true

# Check backend health
if docker compose -f "$COMPOSE_FILE" ps backend | grep -q "healthy"; then
    echo "  Backend: HEALTHY"
else
    echo "  Backend: STARTING (may take up to 60s)"
fi

# Check customer-portal health
if docker compose -f "$COMPOSE_FILE" ps customer-portal | grep -q "healthy"; then
    echo "  Customer Portal: HEALTHY"
else
    echo "  Customer Portal: STARTING (may take up to 30s)"
fi

echo ""
echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "Application URLs:"
echo "  Frontend:  https://live-ac.tech"
echo "  Backend:   https://api.live-ac.tech"
echo ""
