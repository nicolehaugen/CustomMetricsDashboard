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
| GitHub Changelog (RSS) | https://github.blog/changelog/feed/ |
| GitHub Copilot CLI changelog | https://github.com/github/copilot-cli/blob/main/changelog.md |

> **⚠️ Do NOT use `https://github.blog/changelog/` as the GitHub Changelog URL.** That page is JavaScript-rendered and returns only a newsletter form to the fetcher. Always use the RSS feed URL above.

## Procedure

### 1. Determine the current date

Record today's date as `YYYY-MM-DD`. Compute the cutoff date as 7 days before today. All date filtering in subsequent steps uses this 7-day window.

### 2. Fetch and parse each source

Use the `web_fetch` tool to retrieve page content from each source. Follow the source-specific instructions below.

#### GitHub Changelog — two-pass RSS strategy

The RSS feed (`github.blog/changelog/feed/`) returns XML with 10 items per page. Each item includes a large `content:encoded` block (3,000–8,000 chars). **Never rely on a single fetch with a low `max_length` to capture all items** — this silently truncates entries mid-page.

Instead, use a two-pass approach:

**Pass 1 — Title discovery.** For each RSS page:

1. Fetch `https://github.blog/changelog/feed/?paged=N` with `max_length=20000`.
2. Extract **only** the `<title>` and `<link>` values from each `<item>`. Ignore `content:encoded`.
3. Note the `<pubDate>` of each item. Stop paginating when all items on a page are older than the cutoff date.
4. If the current `paged=N` response is truncated (the `Content truncated` note appears in the response), fetch that same page again using `start_index` as many times as needed to read the remaining `<item>` entries.
5. Collect all titles and links within the date window, including items recovered from any continuation fetches for that page.

**Pass 2 — Full content fetch.** For every title that matches any step 3 keyword (case-insensitive):

1. Fetch the individual post URL (e.g. `https://github.blog/changelog/2026-04-08-...`) directly with `max_length=10000`.
2. Read the full post body to confirm relevance and extract the details for the summary.

This guarantees **complete coverage** of all items in the date window regardless of RSS item verbosity.

#### VS Code release notes

1. Fetch `https://code.visualstudio.com/updates`.
2. Parse for release entries within the date window.

#### GitHub Copilot CLI changelog

1. Fetch `https://github.com/github/copilot-cli/blob/main/changelog.md`.
2. Parse for entries within the date window.

#### General error handling

If a source is unreachable (network error, non-200 status, or empty response), log a warning like `⚠️ Could not fetch [source name] — skipping` and continue with the remaining sources. Do **not** stop the entire scan.

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
