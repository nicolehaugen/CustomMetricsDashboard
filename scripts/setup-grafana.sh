#!/bin/bash
# Setup Grafana provisioning for DORA Metrics Dashboard
# Usage: bash scripts/setup-grafana.sh

GRAFANA_HOME="${GRAFANA_HOME:-/etc/grafana}"
GRAFANA_DASHBOARDS="${GRAFANA_DASHBOARDS:-/var/lib/grafana/dashboards}"

echo "Setting up Grafana provisioning..."

# Copy datasource config
sudo mkdir -p "$GRAFANA_HOME/provisioning/datasources"
sudo cp grafana/provisioning/datasources/postgres.yml "$GRAFANA_HOME/provisioning/datasources/"

# Copy dashboard provider config
sudo mkdir -p "$GRAFANA_HOME/provisioning/dashboards"
sudo cp grafana/provisioning/dashboards/dashboard.yml "$GRAFANA_HOME/provisioning/dashboards/"

# Copy dashboard JSON
sudo mkdir -p "$GRAFANA_DASHBOARDS"
sudo cp grafana/dashboards/dora-metrics.json "$GRAFANA_DASHBOARDS/"

echo "Grafana provisioning complete!"
echo "Restart Grafana: sudo systemctl restart grafana-server"
