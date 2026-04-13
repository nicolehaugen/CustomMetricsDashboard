# Copilot Usage Metrics Announcements — April 7–13, 2026

> **Review period:** April 7–13, 2026  
> **Sources:** [GitHub Changelog](https://github.blog/changelog/), [VS Code Updates](https://code.visualstudio.com/updates), [GitHub Copilot CLI Changelog](https://github.com/github/copilot-cli/blob/main/changelog.md)

---

## GitHub Changelog

### 🆕 Copilot usage metrics now aggregate Copilot cloud agent active user counts
**Date:** April 10, 2026  
**Link:** https://github.blog/changelog/2026-04-10-copilot-usage-metrics-now-aggregate-copilot-cloud-agent-active-user-counts

Three new aggregate fields are now available in the [Copilot usage metrics API](https://docs.github.com/enterprise-cloud@latest/rest/copilot/copilot-usage-metrics?apiVersion=2026-03-10) at both the enterprise and organization level (1-day and 28-day reports):

| Field | Description |
|---|---|
| `daily_active_copilot_cloud_agent_users` | Unique users who used Copilot cloud agent on that day |
| `weekly_active_copilot_cloud_agent_users` | Unique users in the trailing 7-day window |
| `monthly_active_copilot_cloud_agent_users` | Unique users in the trailing 28-day window |

Fields are nullable — they return a count (including zero) when data is available, or `null` when no cloud agent data exists for the period.

**Why it matters for this dashboard:**  
These new fields complement the existing `monthly_active_agent_users` (IDE agent mode) and `used_copilot_coding_agent` (per-user flag). The dashboard's Copilot adoption panels can surface daily/weekly/monthly cloud agent adoption trends without manually aggregating user-level data.

> **Note:** Copilot coding agent was recently renamed to Copilot cloud agent. Data schema fields for existing "coding agent" references will be updated in the coming weeks.

---

### 🆕 Copilot CLI activity now included in usage metrics totals and feature breakdowns
**Date:** April 10, 2026  
**Link:** https://github.blog/changelog/2026-04-10-copilot-cli-activity-now-included-in-usage-metrics-totals-and-feature-breakdowns

CLI activity is now integrated into the top-level totals and dimensional breakdowns in the Copilot usage metrics API, instead of being reported only in the standalone `totals_by_cli` section.

**Top-level fields now include IDE + CLI combined:**
- `code_generation_activity_count`
- `code_acceptance_activity_count`
- `user_initiated_interaction_count`
- `loc_added_sum` / `loc_deleted_sum`

**CLI appears in dimensional breakdowns as `feature=copilot_cli` in:**
- `totals_by_feature`
- `totals_by_model_feature`
- `totals_by_language_feature`
- `totals_by_language_model`

CLI is excluded from `totals_by_ide`. The existing `totals_by_cli` section and per-user CLI fields remain unchanged.

**⚠️ Breaking change for existing dashboards:**  
If any SQL panels assume top-level total fields represent IDE-only activity, the numbers will now be higher due to the addition of CLI contributions. Review any thresholds or comparisons that depend on these values.

---

## VS Code Updates (v1.115 — April 8, 2026)

No metrics-specific changes found in this release. The main Copilot-related change was **Bring Your Own Key (BYOK)** support for Copilot Business and Enterprise (access to third-party language model providers) — not related to usage metrics.

---

## GitHub Copilot CLI Changelog

### 📊 Display reasoning token usage in per-model token breakdown
**Version:** 1.0.23 — April 10, 2026

Reasoning token usage is now shown in the per-model token breakdown in the CLI when nonzero. This gives users more granular visibility into token consumption for models that use reasoning tokens (e.g., `o3`, Claude thinking modes).

---

### 📊 OpenTelemetry monitoring: new `time_to_first_chunk` attribute
**Version:** 1.0.19 — April 6, 2026  
**Link:** https://github.com/github/copilot-cli/blob/main/changelog.md

Two OpenTelemetry monitoring improvements:
- Subagent spans now use `INTERNAL` span kind (correcting span semantics for tracing tools)
- Chat spans now include a `github.copilot.time_to_first_chunk` attribute for streaming responses — enabling latency/responsiveness tracking in OpenTelemetry-compatible observability platforms

---

### 📖 New `copilot help monitoring` topic
**Version:** 1.0.20 — April 7, 2026

Added a built-in `copilot help monitoring` topic documenting OpenTelemetry configuration details and examples. Useful for teams setting up observability pipelines to collect CLI telemetry.

---

### 🎨 Redesigned exit screen with usage summary
**Version:** 1.0.24 — April 10, 2026

The CLI exit screen was redesigned with a cleaner **usage summary layout**, making per-session token and activity counts more readable at a glance.

---

## Summary

| Source | Item | Impact |
|---|---|---|
| GitHub API | Cloud agent active user counts (daily/weekly/monthly) | New fields available for adoption dashboards |
| GitHub API | CLI activity merged into top-level totals | **Breaking:** top-level totals now include CLI; review existing panels |
| VS Code 1.115 | No metrics changes | No action needed |
| Copilot CLI 1.0.23 | Reasoning token usage in breakdown | New granularity in CLI token metrics |
| Copilot CLI 1.0.19 | `time_to_first_chunk` OTel attribute | New latency metric for observability pipelines |
| Copilot CLI 1.0.20 | `copilot help monitoring` topic | Documentation for OTel configuration |
| Copilot CLI 1.0.24 | Cleaner usage summary on exit | UX improvement, no API changes |
