#!/bin/bash
# Trigger a data sync via the HTTP API
echo "Triggering sync..."
curl -s -X POST http://localhost:3005/sync | jq .
echo ""
echo "Check Grafana Overview dashboard for sync status: http://localhost:3006"
