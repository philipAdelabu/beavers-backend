#!/bin/bash

# BeaverWorks Database Backup Script
# Usage: ./backup.sh

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables
source .env

# Configuration
BACKUP_DIR=${BACKUP_DIR:-"./backups"}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/beaverworks_backup_${TIMESTAMP}.sql.gz"
S3_BACKUP=${S3_BACKUP:-false}

echo -e "${GREEN}Starting database backup...${NC}"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

# Perform database backup
echo -e "${YELLOW}Creating backup: ${BACKUP_FILE}${NC}"

if [ -n "$DB_PASSWORD" ]; then
    export PGPASSWORD=$DB_PASSWORD
fi

pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -Fc | gzip > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Backup created successfully: ${BACKUP_FILE}${NC}"
else
    echo -e "${RED}Backup failed!${NC}"
    exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h ${BACKUP_FILE} | cut -f1)
echo -e "${GREEN}Backup size: ${BACKUP_SIZE}${NC}"

# Upload to S3 if configured
if [ "$S3_BACKUP" = "true" ] && command -v aws >/dev/null 2>&1; then
    echo -e "${YELLOW}Uploading backup to S3...${NC}"
    aws s3 cp ${BACKUP_FILE} s3://${S3_BUCKET}/backups/beaverworks/ --region ${AWS_REGION}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Backup uploaded to S3 successfully${NC}"
    else
        echo -e "${RED}Failed to upload backup to S3${NC}"
    fi
fi

# Clean up old backups
echo -e "${YELLOW}Cleaning up backups older than ${RETENTION_DAYS} days...${NC}"
find ${BACKUP_DIR} -name "beaverworks_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

# Create backup log
echo "${TIMESTAMP} - Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})" >> ${BACKUP_DIR}/backup.log

echo -e "${GREEN}Backup completed successfully!${NC}"