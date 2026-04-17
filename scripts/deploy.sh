#!/bin/bash

# BeaverWorks Deployment Script
# Usage: ./deploy.sh [environment]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment
ENVIRONMENT=${1:-production}
echo -e "${GREEN}Deploying BeaverWorks to ${ENVIRONMENT} environment...${NC}"

# Load environment variables
if [ -f ".env.${ENVIRONMENT}" ]; then
    source ".env.${ENVIRONMENT}"
    echo -e "${GREEN}Loaded .env.${ENVIRONMENT}${NC}"
else
    echo -e "${RED}Error: .env.${ENVIRONMENT} not found${NC}"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}Node.js is not installed${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}npm is not installed${NC}"
    exit 1
fi

if ! command_exists pm2; then
    echo -e "${YELLOW}PM2 is not installed. Installing...${NC}"
    npm install -g pm2
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm ci --production

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
npm run migrate:up

# Run seeders (only for non-production)
if [ "$ENVIRONMENT" != "production" ]; then
    echo -e "${YELLOW}Running database seeders...${NC}"
    npm run seed
fi

# Build the application (if needed)
if [ -f "webpack.config.js" ]; then
    echo -e "${YELLOW}Building application...${NC}"
    npm run build
fi

# Create necessary directories
echo -e "${YELLOW}Creating necessary directories...${NC}"
mkdir -p logs uploads backups

# Set proper permissions
echo -e "${YELLOW}Setting permissions...${NC}"
chmod -R 755 logs uploads

# Backup current version
if [ -d "dist" ]; then
    echo -e "${YELLOW}Backing up current version...${NC}"
    BACKUP_DIR="backups/backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    cp -r dist $BACKUP_DIR/
    cp -r node_modules $BACKUP_DIR/ 2>/dev/null || true
    echo -e "${GREEN}Backup created at ${BACKUP_DIR}${NC}"
fi

# Start/Restart application with PM2
echo -e "${YELLOW}Starting application with PM2...${NC}"
if pm2 list | grep -q "beaverworks-api"; then
    pm2 reload beaverworks-api
    echo -e "${GREEN}Application reloaded${NC}"
else
    pm2 start ecosystem.config.js --env $ENVIRONMENT
    echo -e "${GREEN}Application started${NC}"
fi

# Save PM2 configuration
pm2 save

# Health check
echo -e "${YELLOW}Performing health check...${NC}"
sleep 5
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT}/health)

if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}Health check passed!${NC}"
else
    echo -e "${RED}Health check failed! Status: ${HEALTH_CHECK}${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment completed successfully!${NC}"