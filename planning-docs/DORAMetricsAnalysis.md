# DORA Metrics Reporting Plan — Measuring Copilot's Impact

## Measurement Goal

Identify all available GitHub metrics (APIs, dashboards) and Claude Code reporting surfaces that help measure Copilot's impact on the four DORA pillars: **Deployment Frequency**, **Lead Time for Changes**, **Change Failure Rate**, and **Mean Time to Recovery (MTTR)**.

---

## Available Metrics

### 1. Deployment Frequency

> *How often code is deployed to production.*

| Metric | Description | Copilot Impact | Comparison Strategy | Best-Fit Source | Why Selected | Alternatives Considered | Dashboard? | API? | API Documentation | Octodemo Dashboard URL |
|--------|-------------|----------------|---------------------|-----------------|--------------|-------------------------|:----------:|:----:|-------------------|------------------------|
| Deployment count per period | Number of deployments to a specific environment (e.g., production) over time | Copilot accelerates code authoring → more PRs merged → more deployments triggered | Segment by Copilot-active users (join `/copilot/metrics/reports/users-1-day` with `/repos/{owner}/{repo}/deployments` via commit author) | **Deployments API** (`GET /repos/{owner}/{repo}/deployments`) | Directly lists every deployment with `created_at`, `environment`, and `sha`; filter to `production` for DORA-standard measurement | Workflow Runs API (indirect — requires identifying deploy workflows); Actions Performance dashboard (shows job metrics but not deployment counts) | ❌ | ✅ | [Deployments API](https://docs.github.com/en/rest/deployments/deployments) | N/A — no native deployment frequency dashboard |
| Workflow run frequency | Count of successful CI/CD workflow runs over time | Copilot-generated code triggers CI runs; faster PR cycles → more workflow runs | Compare workflow run frequency before vs after Copilot rollout (time-based) | **Workflow Runs API** (`GET /repos/{owner}/{repo}/actions/runs`) | Supplementary signal — count runs with `conclusion=success` filtered by deploy workflows | Deployments API (preferred for actual deployments) | ✅ | ✅ | [Workflow Runs API](https://docs.github.com/en/rest/actions/workflow-runs) | [Actions Performance Metrics](https://github.com/orgs/octodemo/actions/metrics/performance) |

### 2. Lead Time for Changes

> *Time from code commit to production deployment.*

| Metric | Description | Copilot Impact | Comparison Strategy | Best-Fit Source | Why Selected | Alternatives Considered | Dashboard? | API? | API Documentation | Octodemo Dashboard URL |
|--------|-------------|----------------|---------------------|-----------------|--------------|-------------------------|:----------:|:----:|-------------------|------------------------|
| PR cycle time (created → merged) | Time from PR creation to merge | Copilot accelerates code writing and reviews → shorter PR cycle times | Segment by Copilot-active authors: join `/copilot/metrics/reports/users-1-day` user list with PR `user.login` from `/repos/{owner}/{repo}/pulls` | **Pull Requests API** (`GET /repos/{owner}/{repo}/pulls?state=closed`) | Provides `created_at` and `merged_at` per PR; the difference is PR cycle time, which is the largest measurable component of lead time | Workflow Runs API (gives CI duration but not PR-to-merge time); Check Runs API (gives per-check timing) | ❌ | ✅ | [Pull Requests API](https://docs.github.com/en/rest/pulls/pulls) | N/A |
| Merge-to-deploy time | Time from PR merge to production deployment | Copilot doesn't directly affect post-merge pipeline speed, but faster/smaller PRs may improve deployment reliability | Join PR `merged_at` timestamp with deployment `created_at` for the same `sha` | **Deployments API** + **Pull Requests API** (joined on SHA) | Requires correlating the merge commit SHA from the PR with the deployment SHA; gives the post-merge pipeline delay | Workflow Runs API (gives workflow duration but not the full merge-to-deploy window) | ❌ | ✅ | [Deployments API](https://docs.github.com/en/rest/deployments/deployments) | N/A |
| CI job duration | Average time for CI jobs to complete | Copilot-generated code may produce smaller, more focused changes → faster CI | Time-based comparison: compare avg job run time before vs after Copilot adoption | **Actions Performance Metrics Dashboard** | Directly shows "Avg job run time" and "Avg job queue time" on the dashboard; verified at 1m 3s run time, 4s queue time | Workflow Runs API (`run_started_at` to completion); Check Runs API (`started_at` to `completed_at`) | ✅ | ✅ | [Workflow Runs API](https://docs.github.com/en/rest/actions/workflow-runs) | [Actions Performance Metrics](https://github.com/orgs/octodemo/actions/metrics/performance) |
| Lines of code per change | Volume of code changed with AI assistance | Copilot enables larger, more productive code changes per session | Compare LOC metrics for Copilot users vs non-users on the code generation dashboard | **Copilot Code Generation Dashboard** | Shows "Lines of code changed with AI" (3.7M in last 28 days) and per-mode breakdown; indicates throughput increase | Copilot Usage Metrics API (provides `loc_added_sum` per user in downloadable reports) | ✅ | ✅ | [Copilot Usage Metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | [Copilot Code Generation](https://github.com/orgs/octodemo/insights/copilot/code-generation?period=28d) |

### 3. Change Failure Rate

> *Percentage of deployments causing failures.*

| Metric | Description | Copilot Impact | Comparison Strategy | Best-Fit Source | Why Selected | Alternatives Considered | Dashboard? | API? | API Documentation | Octodemo Dashboard URL |
|--------|-------------|----------------|---------------------|-----------------|--------------|-------------------------|:----------:|:----:|-------------------|------------------------|
| Deployment failure ratio | Ratio of `error`/`failure` deployment statuses to total deployments | Copilot may improve code quality → fewer deployment failures; or faster iteration may introduce risk | Segment deployments by whether the associated PR author is a Copilot-active user (join deployment SHA → PR → author → Copilot user list) | **Deployment Statuses API** (`GET /repos/{owner}/{repo}/deployments/{id}/statuses`) | Provides deployment outcome states (`success`, `failure`, `error`); the ratio of failures to total gives Change Failure Rate | Workflow Runs API (gives `conclusion=failure` for workflow runs, but workflows ≠ deployments); Actions Performance dashboard (shows "Job failure rate" at 11%, but this is CI job failures, not production deployment failures) | ❌ | ✅ | [Deployment Statuses API](https://docs.github.com/en/rest/deployments/statuses) | N/A |
| CI job failure rate | Percentage of CI jobs that fail | Copilot-generated code quality → fewer CI failures | Time-based comparison: track job failure rate trend over Copilot adoption period | **Actions Performance Metrics Dashboard** | Directly shows "Job failure rate" (verified at 11%); breakdowns by Workflow, Job, Repository, Runtime OS, Runner type | Workflow Runs API (compute `conclusion=failure` ratio manually); Check Runs API (per-check failure data) | ✅ | ✅ | [Workflow Runs API](https://docs.github.com/en/rest/actions/workflow-runs) | [Actions Performance Metrics](https://github.com/orgs/octodemo/actions/metrics/performance) |
| Code scanning alerts post-merge | Security vulnerabilities found after code merges | Copilot may produce code with fewer security issues → fewer post-merge alerts; Copilot Autofix can resolve alerts faster | Compare alert creation rates for repos with high vs low Copilot adoption | **Code Scanning API** (`GET /repos/{owner}/{repo}/code-scanning/alerts`) | Provides alert `created_at`, `state`, `severity`, `fixed_at`; count new alerts per deployment period | Security Overview dashboard (shows open alerts over time, age of alerts, impact analysis) | ✅ | ✅ | [Code Scanning API](https://docs.github.com/en/rest/code-scanning/code-scanning) | [Security Overview](https://github.com/orgs/octodemo/security/overview) |

### 4. Mean Time to Recovery (MTTR)

> *Time to recover from a production failure.*

| Metric | Description | Copilot Impact | Comparison Strategy | Best-Fit Source | Why Selected | Alternatives Considered | Dashboard? | API? | API Documentation | Octodemo Dashboard URL |
|--------|-------------|----------------|---------------------|-----------------|--------------|-------------------------|:----------:|:----:|-------------------|------------------------|
| Deployment recovery time | Time from failed deployment status to next successful deployment status | Copilot accelerates writing fix code → faster recovery deploys | Segment by whether the fix PR author is a Copilot-active user | **Deployment Statuses API** (`GET /repos/{owner}/{repo}/deployments/{id}/statuses`) | Each status has `created_at`; measure time from `state=failure` to next `state=success` for the same environment | Issues API (if incidents tracked as issues); Workflow Runs API (workflow-level recovery) | ❌ | ✅ | [Deployment Statuses API](https://docs.github.com/en/rest/deployments/statuses) | N/A |
| Incident issue resolution time | Time from incident issue creation to closure | Copilot helps developers write fixes faster → shorter incident resolution | Segment by Copilot-active assignees | **Issues API** (`GET /repos/{owner}/{repo}/issues?labels=incident`) | Provides `created_at` and `closed_at` for incident-labeled issues; requires convention of labeling incidents | Deployment Statuses API (preferred for deployment-focused MTTR) | ❌ | ✅ | [Issues API](https://docs.github.com/en/rest/issues/issues) | N/A |
| Security alert remediation time | Time from alert creation to fix | Copilot Autofix can auto-generate security fixes → faster remediation | Compare `created_at` → `fixed_at` duration for repos with high vs low Copilot adoption | **Code Scanning API** (`GET /repos/{owner}/{repo}/code-scanning/alerts`) | Provides `created_at` and `fixed_at` per alert; also filterable by tool (e.g., CodeQL) | Security Overview dashboard Remediation tab (shows remediation trends visually) | ✅ | ✅ | [Code Scanning API](https://docs.github.com/en/rest/code-scanning/code-scanning) | [Security Overview – Remediation](https://github.com/orgs/octodemo/security/overview) |

### Copilot Adoption Metrics (Segmentation Layer)

These metrics **don't directly measure DORA pillars** but are essential for segmenting the above metrics by Copilot usage (with-Copilot vs without-Copilot analysis).

| Metric | Description | Best-Fit Source | Dashboard? | API? | API Documentation | Octodemo Dashboard URL |
|--------|-------------|-----------------|:----------:|:----:|-------------------|------------------------|
| IDE active users | Monthly active Copilot users (verified: 651) | Copilot Usage Dashboard | ✅ | ✅ | [Copilot Usage Metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | [Copilot Usage](https://github.com/orgs/octodemo/insights/copilot/usage) |
| IDE daily active users | Users who used Copilot on a given day (verified: 84–273 range) | Copilot Usage Dashboard | ✅ | ✅ | [Copilot Usage Metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | [Copilot Usage](https://github.com/orgs/octodemo/insights/copilot/usage) |
| Agent adoption | % of active users using agent features (verified: 90%) | Copilot Usage Dashboard | ✅ | ✅ | [Copilot Usage Metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | [Copilot Usage](https://github.com/orgs/octodemo/insights/copilot/usage) |
| Per-user usage breakdown | User-level metrics: interactions, LOC, models used | Copilot Usage Metrics API (user-level reports) | ❌ | ✅ | [Copilot Usage Metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) | N/A |

---

## Dashboard Metrics Found (Verified via Browser Inspection)

### Copilot Usage Dashboard
**URL**: [https://github.com/orgs/octodemo/insights/copilot/usage](https://github.com/orgs/octodemo/insights/copilot/usage)

| Metric | Value (as inspected) | DORA Relevance |
|--------|---------------------|----------------|
| IDE active users | 651 | Segmentation: identify Copilot users for with/without comparison |
| Agent adoption | 90% (589/651 users) | Segmentation: agent users may show different DORA outcomes |
| Most used chat model | Claude Opus 4.6 | Context: which AI model drives productivity |
| IDE daily active users | 84–273 (chart, 28 days) | Segmentation: daily user list for joining with DORA data |
| IDE weekly active users | 84–474 (chart, 28 days) | Segmentation: weekly user list |
| Export: NDJSON | Available | Programmatic access for analysis |

### Copilot Code Generation Dashboard
**URL**: [https://github.com/orgs/octodemo/insights/copilot/code-generation?period=28d](https://github.com/orgs/octodemo/insights/copilot/code-generation?period=28d)

| Metric | Value (as inspected) | DORA Relevance |
|--------|---------------------|----------------|
| Lines of code changed with AI | 3.7M | Lead Time: measures throughput acceleration |
| Agent Contribution | 98.67% | Lead Time: shows agent-driven code velocity |
| Avg lines deleted by agent | 978 | Lead Time: automated refactoring/cleanup speed |
| Daily total of lines added/deleted | Chart (9.5k–168k/day) | Lead Time: daily throughput trends |
| User-initiated code changes by mode | Completions, Ask, Inline, Edit, Agent, Custom | Lead Time: breakdown of how Copilot contributes |
| Agent-initiated code changes | Added: 3.09M; Deleted: 576K | Lead Time: agent productivity contribution |
| Changes per model | Claude Haiku 4.5, Opus 4.6, Sonnet 4.6, GPT-5.4 | Context: model effectiveness |
| Export: NDJSON | Available | Programmatic access for analysis |

### Actions Performance Metrics Dashboard
**URL**: [https://github.com/orgs/octodemo/actions/metrics/performance](https://github.com/orgs/octodemo/actions/metrics/performance)

| Metric | Value (as inspected) | DORA Relevance |
|--------|---------------------|----------------|
| Avg job run time | 1m 3s | **Lead Time**: CI component of lead time |
| Avg job queue time | 4s | **Lead Time**: pipeline wait time |
| Job failure rate | 11% | **Change Failure Rate**: CI failure proxy |
| Failed job usage | 841 minutes | **Change Failure Rate**: cost of failures |
| Breakdown tabs | Workflows, Jobs, Repositories, Runtime OS, Runner type | Drill-down for root cause analysis |
| Period filter | Current month (configurable) | Time-based comparison |

### Security Overview Dashboard
**URL**: [https://github.com/orgs/octodemo/security/overview](https://github.com/orgs/octodemo/security/overview)

| Metric | Value (as inspected) | DORA Relevance |
|--------|---------------------|----------------|
| Open alerts over time (by severity) | Chart (Detection tab) | **Change Failure Rate**: quality dimension |
| Age of alerts | Summary metric | **MTTR**: how long alerts remain open |
| Reopened alerts | Summary metric | **Change Failure Rate**: incomplete fixes |
| Secrets bypassed | Summary metric | **Change Failure Rate**: security bypass rate |
| Impact analysis | Top 10 repos/advisories/SAST vulns | Prioritization for MTTR improvement |
| Tabs | Detection, Remediation, Prevention | MTTR (Remediation tab), CFR (Prevention tab) |
| Sub-pages | Enablement, Code quality, Dependabot, CodeQL PRs, Secret scanning | Deep-dive security metrics |
| Export: CSV | Available | Programmatic access for analysis |
| Period filter | Last 30 days (configurable) | Time-based comparison |

---

## Gaps & Workarounds

| Gap | DORA Pillar | Description | Workaround |
|-----|-------------|-------------|------------|
| **No native DORA dashboard** | All | GitHub does not provide a built-in DORA metrics dashboard. Each DORA pillar must be computed by correlating data from multiple APIs. | Build a custom dashboard using `gh api` calls to Deployments, PRs, and Workflow Runs APIs. Tools like [GitHub DORA metrics action](https://github.com/marketplace) or third-party platforms (LinearB, Sleuth, Swarmia) can automate this. |
| **No Copilot-to-DORA attribution API** | All | No API directly correlates individual Copilot usage with DORA metric improvements. | **Data join strategy**: Download Copilot user-level metrics (from `/copilot/metrics/reports/users-1-day`), then join with PR authors (from `/repos/{owner}/{repo}/pulls`) and deployment data (from `/repos/{owner}/{repo}/deployments`) using commit SHA and user login as join keys. |
| **Deployment Frequency requires environment filtering** | Deployment Frequency | The Deployments API returns all deployments across all environments. You must filter to `environment=production` for DORA compliance. | Use `GET /repos/{owner}/{repo}/environments` to identify production environment names, then filter deployment results. |
| **Lead Time is multi-hop** | Lead Time | No single API returns end-to-end lead time (first commit → production deploy). It must be assembled from: PR `created_at` → PR `merged_at` → Deployment `created_at`. | Script the join: for each deployment SHA, look up the PR that produced it, then compute `deployment.created_at - pr.created_at`. |
| **Change Failure Rate requires incident definition** | Change Failure Rate | GitHub has no native "incident" concept. Deployment statuses show `failure/error` but may not capture all production incidents (e.g., performance degradation). | Use deployment status `failure/error` as a proxy, supplement with incident-labeled issues (`issues?labels=incident`), or integrate with external incident management (PagerDuty, Opsgenie). |
| **MTTR requires incident lifecycle tracking** | MTTR | Deployment statuses show when a deployment fails and when the next succeeds, but this may not capture the full incident lifecycle (detection → triage → fix → deploy → verify). | Use deployment status timestamps as a deployment-level MTTR proxy. For full incident MTTR, integrate with incident management tools or use Issues API with incident labels + `created_at`/`closed_at`. |
| **No per-PR Copilot attribution in new Metrics API** | All | The new `/copilot/metrics/reports/*` endpoints don't include PR-level Copilot attribution (which PRs were assisted by Copilot). | Alternative: Claude Code's `claude-code-assisted` PR label provides direct attribution. For GitHub Copilot, use the Copilot user list + PR author matching as a proxy. |

**Sources confirming gaps**: [GitHub REST API docs](https://docs.github.com/rest) — no `/dora` endpoint exists; [Copilot Usage Metrics API docs](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) — no PR-level attribution fields; [Deployments API docs](https://docs.github.com/en/rest/deployments/deployments) — no aggregated frequency metric.

---

## Claude Code Comparison

For the same DORA measurement goal, here is what Claude Code provides across all its reporting surfaces.

### Metric Availability by Reporting Surface

| Metric | Analytics Dashboard (claude.ai) | OpenTelemetry | GitHub PR Labels | CSV Export | Console Dashboard | Documentation |
|--------|:-------------------------------:|:-------------:|:----------------:|:----------:|:-----------------:|---------------|
| **Deployment Frequency** — deployment count | ❌ | ❌ | ❌ | ❌ | ❌ | Not available — Claude Code does not track deployments |
| **Lead Time** — PR cycle time proxy (PRs merged per user) | ✅ PRs with CC, PRs per user chart | ✅ `claude_code.pull_request.count` | ✅ `claude-code-assisted` label on merged PRs | ✅ Per-user PR data exportable | ❌ | [Analytics](https://code.claude.com/docs/en/analytics) |
| **Lead Time** — code throughput (LOC) | ✅ Lines of code with CC, Lines accepted | ✅ `claude_code.lines_of_code.count` (added/removed) | ❌ | ✅ Lines per user in CSV export | ✅ Lines of code accepted, suggestion accept rate | [Analytics](https://code.claude.com/docs/en/analytics), [Monitoring](https://code.claude.com/docs/en/monitoring-usage) |
| **Lead Time** — commit frequency | ❌ | ✅ `claude_code.commit.count` | ❌ | ❌ | ❌ | [Monitoring](https://code.claude.com/docs/en/monitoring-usage) |
| **Change Failure Rate** — deployment failures | ❌ | ❌ | ❌ | ❌ | ❌ | Not available — Claude Code does not track deployment outcomes |
| **Change Failure Rate** — code quality proxy | ❌ | ✅ `claude_code.code_edit_tool.decision` (accept/reject rates by language) | ❌ | ❌ | ✅ Suggestion accept rate | [Monitoring](https://code.claude.com/docs/en/monitoring-usage) |
| **MTTR** — incident recovery | ❌ | ❌ | ❌ | ❌ | ❌ | Not available — Claude Code does not track incidents |
| **MTTR** — session efficiency (time to fix) | ❌ | ✅ `claude_code.active_time.total` (user + CLI time) | ❌ | ❌ | ❌ | [Monitoring](https://code.claude.com/docs/en/monitoring-usage) |
| **Copilot adoption** — active users | ✅ Daily active users, sessions chart | ✅ `claude_code.session.count` | ❌ | ✅ All users in CSV | ✅ Activity chart (DAU + sessions) | [Analytics](https://code.claude.com/docs/en/analytics) |
| **Copilot adoption** — cost per user | ❌ | ✅ `claude_code.cost.usage` (per model) | ❌ | ❌ | ✅ Spend per user, spend chart | [Costs](https://code.claude.com/docs/en/costs) |

### Claude Code Unique Strengths for DORA

1. **Direct PR Attribution**: Merged PRs are automatically labeled `claude-code-assisted` in GitHub, enabling direct segmentation of DORA metrics by AI-assisted vs non-assisted PRs. Query via: `gh api /repos/{owner}/{repo}/pulls?state=closed` and filter by label.
2. **OpenTelemetry Real-Time Metrics**: All metrics exportable to Grafana, Datadog, Prometheus, etc. via standard OTel protocol. Enables real-time dashboards combining Claude Code metrics with DORA data from other sources.
3. **Per-User Granularity**: OTel metrics include `user.account_uuid`, `organization.id`, `session.id` — enabling fine-grained per-developer DORA segmentation.
4. **ROI Measurement Guide**: Anthropic provides a [Claude Code ROI Measurement Guide](https://github.com/anthropics/claude-code-monitoring-guide) with Docker Compose, Prometheus, and OTel setups for productivity reporting.

### Claude Code Gaps for DORA

- **No deployment tracking**: Claude Code does not instrument or track deployments, deployment frequency, or deployment outcomes. These must come from GitHub APIs.
- **No incident/failure tracking**: Claude Code does not track production incidents or failures. MTTR and Change Failure Rate must be sourced externally.
- **No native DORA dashboard**: Like GitHub, Claude Code does not provide a pre-built DORA metrics view. However, OTel export + PR labels provide strong building blocks.
- **Contribution metrics require GitHub app installation**: The analytics dashboard's PR attribution requires installing the Claude GitHub app and enabling GitHub analytics.
- **Contribution metrics not available with Zero Data Retention**: Organizations with ZDR enabled cannot access contribution metrics.

**Sources checked**: [Claude Code Analytics](https://code.claude.com/docs/en/analytics), [Claude Code Monitoring](https://code.claude.com/docs/en/monitoring-usage), [Claude Code Costs](https://code.claude.com/docs/en/costs).

---

## Appendix

### Example API Commands

```bash
# 1. DEPLOYMENT FREQUENCY — List production deployments for a repo
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/deployments?environment=production&per_page=100"

# 2. DEPLOYMENT STATUSES — Get status history for a specific deployment
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/deployments/{deployment_id}/statuses"

# 3. LEAD TIME — List merged PRs (compute created_at → merged_at)
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/pulls?state=closed&sort=updated&direction=desc&per_page=100"

# 4. CHANGE FAILURE RATE — List workflow runs (compute failure ratio)
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/actions/runs?per_page=100"

# 5. MTTR — List incident-labeled issues (compute created_at → closed_at)
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/issues?labels=incident&state=closed&per_page=100"

# 6. SECURITY ALERTS — List code scanning alerts with fix times
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/code-scanning/alerts?state=fixed&per_page=100"

# 7. COPILOT USER SEGMENTATION — Get user-level Copilot metrics (new API)
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/orgs/octodemo/copilot/metrics/reports/users-1-day?day=2026-03-31"

# 8. COPILOT ORG AGGREGATE — Get org-level Copilot metrics (28-day)
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/orgs/octodemo/copilot/metrics/reports/organization-28-day/latest"

# 9. DEPLOYMENT ENVIRONMENTS — List environments to identify production
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/environments"

# 10. CLAUDE CODE PR ATTRIBUTION — Find Claude Code-assisted PRs
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2026-03-10" \
  "/repos/octodemo/bootstrap/pulls?state=closed&per_page=100" \
  --jq '.[] | select(.labels[].name == "claude-code-assisted") | {number, title, merged_at, user: .user.login}'
```

### DORA Computation Recipes

**Deployment Frequency** (per week):
```
Count of deployments WHERE environment = "production"
GROUP BY week(deployment.created_at)
```

**Lead Time for Changes** (median, in hours):
```
FOR EACH merged PR:
  lead_time = deployment.created_at - pr.created_at
  WHERE deployment.sha matches pr.merge_commit_sha
COMPUTE median(lead_time)
```

**Change Failure Rate** (%):
```
failed_deployments = COUNT(deployment_statuses WHERE state IN ('failure', 'error'))
total_deployments = COUNT(all deployment_statuses)
CFR = failed_deployments / total_deployments * 100
```

**MTTR** (median, in hours):
```
FOR EACH failed deployment status:
  recovery_time = next_success_status.created_at - failure_status.created_at
  WHERE both statuses are in the same environment
COMPUTE median(recovery_time)
```

### Sources Used in This Analysis

- [Deployments API](https://docs.github.com/en/rest/deployments/deployments) — deployment listing, SHA, environment, timestamps
- [Deployment Statuses API](https://docs.github.com/en/rest/deployments/statuses) — deployment outcome states (success/failure/error)
- [Deployment Environments API](https://docs.github.com/en/rest/deployments/environments) — environment listing and protection rules
- [Workflow Runs API](https://docs.github.com/en/rest/actions/workflow-runs) — CI/CD run data, timing, conclusions
- [Pull Requests API](https://docs.github.com/en/rest/pulls/pulls) — PR lifecycle timestamps
- [Check Runs API](https://docs.github.com/en/rest/checks/runs) — per-check timing and conclusions
- [Repository Statistics API](https://docs.github.com/en/rest/metrics/statistics) — commit activity and code frequency
- [Issues API](https://docs.github.com/en/rest/issues/issues) — incident tracking via labeled issues
- [Code Scanning API](https://docs.github.com/en/rest/code-scanning/code-scanning) — security alert timestamps and remediation
- [Copilot Usage Metrics API](https://docs.github.com/en/rest/copilot/copilot-usage-metrics) — new user-level and org-level Copilot metrics (replacing legacy `/copilot/metrics`)
- [Copilot metrics data reference](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics) — field definitions for usage metrics
- [Legacy Copilot Metrics API sunset notice](https://github.blog/changelog/2026-01-29-closing-down-notice-of-legacy-copilot-metrics-apis/) — migration guidance
- [Security Overview documentation](https://docs.github.com/en/code-security/security-overview/about-security-overview) — dashboard views and metrics
- [VS Code Copilot Monitoring](https://code.visualstudio.com/docs/copilot/guides/monitoring-agents) — OpenTelemetry metrics from VS Code Copilot Chat
- [Claude Code Analytics](https://code.claude.com/docs/en/analytics) — analytics dashboard, PR attribution, CSV export
- [Claude Code Monitoring](https://code.claude.com/docs/en/monitoring-usage) — OpenTelemetry metrics and events
- [Claude Code Costs](https://code.claude.com/docs/en/costs) — spend tracking and cost management
- [Copilot Usage dashboard](https://github.com/orgs/octodemo/insights/copilot/usage) — **inspected live**: IDE active users (651), Agent adoption (90%), DAU/WAU charts
- [Copilot Code Generation dashboard](https://github.com/orgs/octodemo/insights/copilot/code-generation?period=28d) — **inspected live**: 3.7M lines changed with AI, 98.67% agent contribution
- [Actions Performance Metrics dashboard](https://github.com/orgs/octodemo/actions/metrics/performance) — **inspected live**: Avg job run time (1m 3s), Job failure rate (11%)
- [Security Overview dashboard](https://github.com/orgs/octodemo/security/overview) — **inspected live**: Open alerts, Age of alerts, Remediation/Prevention tabs, Impact analysis
