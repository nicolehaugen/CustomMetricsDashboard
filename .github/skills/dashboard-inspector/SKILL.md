---
name: dashboard-inspector
description: "**ANALYSIS SKILL** — Inspect GitHub dashboards via browser to surface metrics, charts, and filters. Covers Copilot insights, security overview, Actions metrics, and org settings. WHEN: \"what metrics are on the dashboard\", \"insights page content\", \"copilot metrics dashboard\", \"security overview metrics\", \"available metrics\". INVOKES: browser tools (open_browser_page, navigate_page, read_page, screenshot_page, click_element). FOR SINGLE OPERATIONS: Provide the dashboard URL directly."
---

# Dashboard Inspector

## When to Use
- User asks what metrics, charts, or filters are on a GitHub dashboard
- User asks about Copilot insights, security overview, or any GitHub UI page content
- Verifying that a documented dashboard exists and what it shows
- User asks about "available metrics", "what can I measure", or "what dashboards exist"

## Known Dashboard Catalog

Use this catalog to resolve user questions without guessing URLs. Replace `{org}` with the target org (default: `octodemo`). When the user asks a vague question like "what metrics are available" or "show me the dashboards", use this catalog to navigate systematically.

### Insights Hub — `/orgs/{org}/insights`
> Note: `/orgs/{org}/insights` redirects to Copilot usage. The old path `/orgs/{org}/insights/copilot` returns 404 — always use the full sub-page path.

| Dashboard | URL Pattern | 
|-----------|-------------|
| **Copilot Usage** | `/orgs/{org}/insights/copilot/usage` |
| **Code Generation** | `/orgs/{org}/insights/copilot/code-generation` |
| **Actions Usage** | `/orgs/{org}/actions/metrics/usage` |
| **Actions Performance** | `/orgs/{org}/actions/metrics/performance` |
| **Dependencies** | `/orgs/{org}/insights/dependencies` |
| **REST API** | `/orgs/{org}/insights/api` |

#### Embedded Tabs & Filters — Insights
- **Copilot Usage**: Timeframe dropdown (Last 28 days, etc.), Export NDJSON button, per-chart Customization settings
- **Code Generation**: Timeframe dropdown, Export NDJSON button, per-chart Customization settings
- **Actions Usage**: Period dropdown (Current month), tabs: Workflows / Jobs / Repositories / Runtime OS / Runner type, Filter combobox, Download report (CSV)
- **Actions Performance**: Period dropdown (Current month), tabs: Workflows / Jobs / Repositories / Runtime OS / Runner type, Filter combobox, Download report (CSV)

### Security & Quality Hub — `/orgs/{org}/security/overview`

| Dashboard | URL Pattern |
|-----------|-------------|
| **Overview** | `/orgs/{org}/security/overview` | Open alerts over time (by severity), Age of alerts, Reopened alerts, Secrets bypassed, Impact analysis — top 10 repos/advisories/SAST vulns (table with Critical/High/Medium/Low) |
| **Risk** | `/orgs/{org}/security/risk` | Risk assessment across repositories |
| **Coverage** | `/orgs/{org}/security/coverage` | Security feature enablement coverage |
| **Assessments** | `/orgs/{org}/security/assessments` | Security assessments |
| **Campaigns** | `/orgs/{org}/security/campaigns` | Security remediation campaigns |

#### Security Insights Sub-pages
| Dashboard | URL Pattern | Known Metrics |
|-----------|-------------|---------------|
| **Enablement** | `/orgs/{org}/security/metrics/enablement` | Feature enablement metrics |
| **Code quality** | `/orgs/{org}/security/quality` |
| **Dependabot** | `/orgs/{org}/security/metrics/dependabot` |
| **CodeQL PRs** | `/orgs/{org}/security/metrics/codeql` | 
| **Secret scanning** | `/orgs/{org}/security/metrics/secret-scanning` |

#### Security Findings (sidebar alert counts)
| Finding | URL Pattern |
|---------|-------------|
| Dependabot — Malware | `/orgs/{org}/security/alerts/malware` |
| Dependabot — Vulnerabilities | `/orgs/{org}/security/alerts/dependabot` |
| Code scanning | `/orgs/{org}/security/alerts/code-scanning` |
| Secret scanning — Default | `/orgs/{org}/security/alerts/secret-scanning` |
| Secret scanning — Generic | `/orgs/{org}/security/alerts/secret-scanning?query=is%3Aopen+results%3Ageneric` |

#### Security Dismissal Requests
| Page | URL Pattern |
|------|-------------|
| Code scanning | `/orgs/{org}/security/bypass-requests/code-scanning` |
| Secret scanning | `/orgs/{org}/security/closure-requests/secret-scanning` |
| Push protection bypass | `/orgs/{org}/security/bypass-requests/secret-scanning` |

#### Embedded Tabs & Filters — Security Overview
- **Overview page**: tabs: Detection / Remediation / Prevention; Period dropdown (Last 30 days); Filter bar (archived, tool); Export CSV; Impact analysis sub-tabs: Repositories / Advisories / SAST vulnerabilities

### Repo-Level Insights — `/{owner}/{repo}/...`
| Dashboard | URL Pattern |
|-----------|-------------|
| Pulse | `/{owner}/{repo}/pulse` |
| Contributors | `/{owner}/{repo}/graphs/contributors` |
| Community | `/{owner}/{repo}/community` |
| Traffic | `/{owner}/{repo}/graphs/traffic` |
| Commits | `/{owner}/{repo}/graphs/commit-activity` |
| Code frequency | `/{owner}/{repo}/graphs/code-frequency` |
| Dependency graph | `/{owner}/{repo}/network/dependencies` |
| Network | `/{owner}/{repo}/network` |
| Forks | `/{owner}/{repo}/forks` |

## Procedure

### 1. Resolve the target URL
If the user specifies a dashboard by name (e.g., "Copilot usage", "security overview"), look it up in the **Known Dashboard Catalog** above and construct the full URL. If no org is specified, ask the user or default to the org configured in the workspace `.env` (`GITHUB_ORG`).

If the user asks a broad question like "what dashboards are available", start by navigating to `/orgs/{org}/insights` and `/orgs/{org}/security/overview` and systematically walk through each sub-page listed in the catalog.

### 2. Check for existing browser session
Check your context for "Browser Pages" — if a browser page is already open on github.com, use `navigate_page` to navigate it to the target URL (do NOT open a new browser with `open_browser_page`). Then use `read_page` to check if it shows authenticated content. If yes, skip to step 4. If it shows a login form, proceed to step 3.

Only use `open_browser_page` if NO browser page is currently open.

### 3. Authenticate the user
1. Use `open_browser_page` to open `https://github.com/login`
2. Use `vscode_askQuestions` to pause and wait for the user to log in:
   - Header: "GitHub Authentication Required"
   - Question: "I've opened a browser showing a GitHub login page. Please log in there and select 'Done' when ready."
   - Options: [{label: "Done", description: "I've logged into GitHub"}, {label: "Cancel", description: "I can't log in right now"}]
3. After the user responds, use `read_page` to verify — if it still shows "Sign in", repeat from step 1
4. **NEVER** enter credentials. **NEVER** use `type_in_page` for username, password, or 2FA.

### 4. Navigate to the dashboard
Use `navigate_page` to go to the target dashboard URL.

### 5. Read and identify metrics
1. Use `read_page` to get page content. Identify: **metrics** (numbers, percentages), **charts** (graph types and data), **filters** (time periods, dropdowns), **tabs** (sub-navigation), **export options** (CSV/JSON/NDJSON)
2. Use `screenshot_page` to capture a visual for the user

### 6. Explore sub-pages and embedded tabs
For each dashboard, check the catalog for known tabs and sub-pages. Click through them systematically:
- Use `click_element` on each tab (e.g., Detection → Remediation → Prevention on Security Overview)
- Use `navigate_page` for each sub-page URL listed in the catalog
- Use `read_page` after each navigation to capture the content
- Note any NEW tabs or sub-pages not in the catalog (dashboards evolve — flag additions)

### 7. Report findings
List every metric found: name as displayed, current value (if visible), section/tab, and applicable filters. Flag any differences from the catalog (new metrics, removed metrics, URL changes).

## Error Handling
- **404**: Check the catalog for the correct URL pattern. Common mistake: `/orgs/{org}/insights/copilot` is invalid — use `/orgs/{org}/insights/copilot/usage` instead
- **Login form after auth**: Session didn't persist — ask user to log in again
- **Empty/loading page**: Dashboards are JS-rendered. `read_page` handles this. If still empty, try `screenshot_page`
- **Table shows "Loading"**: The data is still loading async. Wait a moment and `read_page` again
