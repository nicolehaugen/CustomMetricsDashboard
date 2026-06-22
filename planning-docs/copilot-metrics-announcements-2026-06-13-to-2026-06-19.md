# Copilot Usage Metrics Announcements — June 13–19, 2026

> **Review period:** June 13–19, 2026  
> **Sources:** [GitHub Changelog](https://github.blog/changelog/), [VS Code Updates](https://code.visualstudio.com/updates), [GitHub Copilot CLI Changelog](https://github.com/github/copilot-cli/blob/main/changelog.md)

---

## GitHub Changelog

### 🆕 AI credits consumed per user now in the Copilot usage metrics API
**Date:** June 19, 2026  
**Link:** https://github.blog/changelog/2026-06-19-ai-credits-consumed-per-user-now-in-the-copilot-usage-metrics-api

A new `ai_credits_used` field is now included for each user in the [Copilot usage metrics API](https://docs.github.com/enterprise-cloud@latest/rest/copilot/copilot-usage-metrics?apiVersion=2026-03-10) user-level reports. It reports the total AI credits a user consumed per day, derived from the same data used in the [usage-based billing API](https://docs.github.com/rest/billing/usage?apiVersion=2026-03-10).

| Field | Scope | Report Types |
|---|---|---|
| `ai_credits_used` | Per user, per day | `users-1-day`, `users-28-day` |

Available at both **enterprise** and **organization** levels. Accessible to enterprise administrators and organization owners with Copilot usage metrics API access.

**Important notes:**
- `ai_credits_used` is an overall per-user total — it is **not** broken down by feature, model, or surface.
- This is a metrics signal for consumption analysis, **not** a billed total; refer to the billing API for invoicing.

**Why it matters for this dashboard:**  
This new field enables the dashboard to show AI credit consumption alongside existing usage signals (completions, chat activity, agent usage), connecting developer activity to cost. It can power new panels tracking per-user credit burn rates, day-over-day trends, and distribution of consumption across the organization or enterprise — directly supporting usage-based billing planning.

---

## VS Code Updates (v1.125 — June 17, 2026)

### 📊 View your additional spend usage in VS Code
**Link:** https://code.visualstudio.com/updates/v1_125

The **Copilot status dashboard** in VS Code now displays the **percentage of the additional Copilot budget consumed**, giving users real-time visibility into overage before hitting their configured limit.

> _"To make sure you stay ahead of overage charges, the Copilot status dashboard now shows the percentage of your additional Copilot budget that you've consumed, so you can adjust your usage before you hit your configured limit."_

Detailed usage and additional spend management is available at [github.com/settings/copilot/features](https://github.com/settings/copilot/features).

**Why it matters for this dashboard:**  
This is a VS Code UX change — no API changes are involved. The underlying spend data surfaces through the usage-based billing API and is not a new field for dashboard panels, but it confirms that budget consumption is a growing area of focus for Copilot observability.

### 🏢 Native MDM delivery for managed Copilot settings
**Link:** https://code.visualstudio.com/updates/v1_125

Administrators can now deliver managed GitHub Copilot settings through native **MDM (Mobile Device Management)** channels on Windows and macOS, in addition to account-based enterprise settings. Settings delivered via MDM appear as policy-enforced and cannot be overridden locally.

**Why it matters for this dashboard:**  
No metrics API changes. This is an enterprise policy management improvement that reinforces how organizations enforce Copilot configuration, which may affect which features are enabled and therefore what shows up in usage metrics.

---

## GitHub Copilot CLI Changelog

> **Note:** The Copilot CLI changelog is a flat, undated list. The items below are metrics- and usage-related entries present in the changelog as of June 19, 2026. Specific release dates are not available.

### 📊 Cache write tokens shown alongside cache read tokens in `/usage` display

The `/usage` command now shows **cache write tokens** alongside the existing cache read token counts, giving users a complete picture of token consumption including caching overhead.

---

### 📊 Quota footer shows remaining requests as a rounded percentage

The session footer now displays remaining API requests as a **rounded percentage**, making quota status easier to read at a glance without requiring users to interpret raw counts.

---

### 📊 Add `billing` help topic with overview of AI credit usage features

A new `billing` help topic (`copilot help billing`) has been added, providing an overview of AI credit usage features including how credits are consumed and how to track usage.

---

### 📊 Remaining requests percentage no longer shows a negative value for over-limit users

A display bug was fixed where users who exceeded their request quota saw a **negative percentage** in the remaining requests indicator. The value now correctly reflects an over-limit state.

---

## Summary

| Source | Item | Impact |
|---|---|---|
| GitHub API | `ai_credits_used` field in user-level Copilot usage metrics reports | New per-user daily credit consumption field; powers cost-vs-adoption panels |
| VS Code 1.125 | Additional spend percentage in Copilot status dashboard | VS Code UX improvement; no new API fields |
| VS Code 1.125 | Native MDM delivery for managed Copilot settings | Enterprise policy management; may affect feature enablement in metrics |
| Copilot CLI | Cache write tokens in `/usage` display | More granular token cost visibility in CLI |
| Copilot CLI | Quota footer shows remaining requests as rounded percentage | UX fix; no API change |
| Copilot CLI | New `billing` help topic | Documentation for AI credit usage features |
| Copilot CLI | Fix: negative remaining requests % for over-limit users | Bug fix; no API change |
