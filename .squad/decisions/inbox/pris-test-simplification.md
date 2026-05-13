# Pris Test Simplification

## Decision
Keep the v3 Playwright dashboard suite as a smoke test only: cover the six shipped dashboards, use the `overview` UID, require Grafana login, and assert only successful loads, non-error titles, and visible panels.

## Rationale
The dashboard stack does not require seeded data to be healthy, so the E2E suite should validate routing and rendering against an empty database instead of asserting specific panel content.
