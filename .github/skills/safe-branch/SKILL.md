---
name: safe-branch
description: "**WORKFLOW SKILL** — Creates an isolated Git branch from origin/<default> before any code changes. Fetches remote first to avoid inheriting unpushed local commits. WHEN: \"start any coding task\", \"before making code changes\", \"beginning implementation\", \"autopilot session start\", \"create branch for task\". INVOKES: git fetch, git checkout. FOR SINGLE OPERATIONS: use git checkout -b directly if already on a clean isolated branch."
---

# Safe Branch

Branch from `origin/<default>` — never the local default ref — to avoid inheriting unpushed commits that would pollute the PR.

## 1. Detect default branch

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'
# fallback:
git remote show origin | sed -n 's/.*HEAD branch: //p'
```

## 2. Fetch

```bash
git fetch origin
```

Always fetch first so `origin/<default>` reflects true remote state.

## 3. Check if already isolated

```bash
git rev-list --count origin/<default>..HEAD
```

If output is `0` and current branch is not `<default>`, skip to step 5.

## 4. Create branch from `origin/<default>`

```bash
git checkout -b <fix|feat|chore|refactor>/<short-description> origin/<default>
```

**Never** branch from local `<default>` — it may have unpushed commits.

## 5. Confirm

```bash
git rev-list --count origin/<default>..HEAD   # must output 0
```

## 6. Complete task, then push

```bash
git push -u origin <branch-name>
```

Never force-push. If rejected by branch protection, create a new branch name.
