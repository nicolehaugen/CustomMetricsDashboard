---
name: dashboard-inspector
description: "**ANALYSIS SKILL** — Inspect GitHub dashboard pages using the browser to identify available metrics, charts, and filters. Use when a question involves dashboard content, UI metrics, reporting metrics, Copilot insights, security overview, DORA metrics, code scanning metrics, or what is visible on a GitHub settings/insights/security page. WHEN: \"dashboard\", \"UI metrics\", \"insights page\", \"what metrics are on\", \"what does the dashboard show\", \"reporting\", \"copilot metrics\", \"security metrics\", \"DORA\", \"measure impact\", \"available metrics\". INVOKES: browser tools (open_browser_page, navigate_page, read_page, screenshot_page, click_element). FOR SINGLE OPERATIONS: If user just needs a dashboard URL, provide it directly without opening the browser."
---

# Dashboard Inspector

## When to Use
- User asks what metrics, charts, or filters are on a GitHub dashboard
- User asks about Copilot insights, security overview, or any GitHub UI page content
- Verifying that a documented dashboard exists and what it shows

## Procedure

### 1. Check for existing browser session
Check your context for "Browser Pages" — if a browser page is already open on github.com, use `navigate_page` to navigate it to the target URL (do NOT open a new browser with `open_browser_page`). Then use `read_page` to check if it shows authenticated content. If yes, skip to step 3. If it shows a login form, proceed to step 2.

Only use `open_browser_page` if NO browser page is currently open.

### 2. Authenticate the user
1. Use `open_browser_page` to open `https://github.com/login`
2. Use `vscode_askQuestions` to pause and wait for the user to log in:
   - Header: "GitHub Authentication Required"
   - Question: "I've opened a browser showing a GitHub login page. Please log in there and select 'Done' when ready."
   - Options: [{label: "Done", description: "I've logged into GitHub"}]
3. After the user responds, use `read_page` to verify — if it still shows "Sign in", repeat from step 1
4. **NEVER** enter credentials. **NEVER** use `type_in_page` for username, password, or 2FA.

### 3. Navigate to the dashboard
Use `navigate_page` to go to the target dashboard URL.

### 4. Read and identify metrics
1. Use `read_page` to get page content. Identify: **metrics** (numbers, percentages), **charts** (graph types and data), **filters** (time periods, dropdowns), **tabs** (sub-navigation), **export options** (CSV/JSON)
2. Use `screenshot_page` to capture a visual for the user

### 5. Explore sub-pages (if needed)
Use `click_element` on tabs or nav links, then `read_page` again for each sub-page.

### 6. Report findings
List every metric found: name as displayed, current value (if visible), section/tab, and applicable filters.

## Error Handling
- **404**: URL may be wrong or user lacks access — suggest checking permissions
- **Login form after auth**: Session didn't persist — ask user to log in again
- **Empty/loading page**: Dashboards are JS-rendered. `read_page` handles this. If still empty, try `screenshot_page`.
