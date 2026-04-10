#!/bin/bash
# Cron wrapper for DORA Metrics sync
# Add to crontab: 0 */6 * * * /path/to/scripts/sync-cron.sh
curl -s -X POST http://localhost:3001/api/sync
