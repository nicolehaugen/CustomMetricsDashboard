---
name: copilot-metrics-watchdog
description: "Weekly scan of Copilot metrics announcements. Fetches VS Code release notes, GitHub Changelog, and GitHub Copilot CLI changelog for the past 7 days, filters for Copilot usage metrics / telemetry / reporting content, and opens a PR with a summary if anything relevant is found. WHEN: 'scan for Copilot metrics updates', 'check for new Copilot metrics announcements', 'run metrics watchdog', 'any new Copilot metrics changes this week'."
---

# Copilot Metrics Watchdog

Scan official announcement sources for the past 7 days, identify any additions or changes related to Copilot usage metrics, and open a PR summarizing findings.

## Sources to Scan

| Source | URL |
|---|---|
| VS Code release notes | https://code.visualstudio.com/updates |
| GitHub Changelog | https://github.blog/changelog/ |
| GitHub Copilot CLI changelog | https://github.com/github/copilot-cli/blob/main/changelog.md |

## Procedure

### 1. Determine the current date

Record today's date as `YYYY-MM-DD`. Compute the cutoff date as 7 days before today. All date filtering in subsequent steps uses this 7-day window.

### 2. Fetch and parse each source

Use the `web_fetch` tool to retrieve page content from each source listed above. For each source:

1. Fetch the URL.
2. Parse the returned markdown/HTML for individual entries (release notes, changelog items, or commit entries).
3. Identify the date of each entry and discard anything older than the 7-day window.
4. If a source is unreachable (network error, non-200 status, or empty response), log a warning like `⚠️ Could not fetch [source name] — skipping` and continue with the remaining sources. Do **not** stop the entire scan.

### 3. Filter for Copilot metrics relevance

From the entries collected in step 2, keep **only** those that mention any of the following topics (case-insensitive):

- Copilot usage metrics
- Copilot telemetry
- Copilot analytics
- Copilot reporting endpoints
- Copilot dashboard data
- Copilot seat usage
- Copilot adoption metrics
- Copilot code generation metrics
- Copilot API metrics changes
- Metrics Reports API

Discard entries that mention Copilot only in a general feature context (e.g., "Copilot chat improvements") but have no relevance to **metrics, telemetry, or reporting**.

### 4. Decide: no updates vs. updates found

**If no relevant entries remain** across all three sources after filtering:

- Respond with: `No updates found — no Copilot metrics announcements in the past 7 days.`
- Stop. Do not create a branch, file, or PR.

**If one or more relevant entries exist**, continue to step 5.

### 5. Generate the summary file

Create a markdown file at `docs/metrics-updates/YYYY-MM-DD.md` (where `YYYY-MM-DD` is today's date) with this format:

```markdown
# Copilot Metrics Announcement Scan — YYYY-MM-DD

## VS Code Updates
- [entry summary with link if available]
- ...

## GitHub Changelog
- [entry summary with link if available]
- ...

## GitHub Copilot CLI
- [entry summary with link if available]
- ...

## Sources with no updates
- [source name] — no relevant changes in the past 7 days
```

Rules for the summary file:
- Only sources with relevant entries get bullet points under their heading.
- Sources with **no** relevant entries are listed under the `## Sources with no updates` section.
- Each bullet point should be a concise one-line summary with a link to the original entry when possible.
- Create the `docs/metrics-updates/` directory if it does not already exist.

### 6. Create a branch and open a PR

1. Create a new branch named `metrics-watchdog/YYYY-MM-DD`.
2. Add and commit the summary file with message: `chore: Copilot metrics announcement scan — YYYY-MM-DD`.
3. Push the branch.
4. Open a pull request:
   - **Title:** `chore: Copilot metrics announcement scan — YYYY-MM-DD`
   - **Body:** A brief description listing which sources had relevant updates and which did not. Example:

     ```
     Automated Copilot metrics announcement scan for YYYY-MM-DD.

     Sources with updates:
     - GitHub Changelog (2 entries)

     Sources with no relevant updates:
     - VS Code release notes
     - GitHub Copilot CLI changelog
     ```

### 7. Report completion

Summarize what was found and provide a link to the opened PR (or confirm that no updates were found).

## Error Handling

- **Source unreachable:** Log a warning and skip the source. Continue scanning remaining sources.
- **All sources unreachable:** Respond with `⚠️ Could not reach any announcement sources. Please check network connectivity and try again.`
- **Branch already exists:** If `metrics-watchdog/YYYY-MM-DD` already exists, append a counter (e.g., `metrics-watchdog/YYYY-MM-DD-2`) or inform the user that a scan was already performed today.
