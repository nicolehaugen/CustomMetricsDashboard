---
name: safe-branch
description: "**WORKFLOW SKILL** — Creates an isolated Git worktree from origin/<default> before any code changes. Fetches remote first to avoid inheriting unpushed local commits. WHEN: \"start any coding task\", \"before making code changes\", \"beginning implementation\", \"autopilot session start\", \"create branch for task\". INVOKES: git fetch, git worktree add. FOR SINGLE OPERATIONS: use git worktree add directly if already on a clean isolated worktree."
---

# Safe Worktree

Create a **linked worktree** from `origin/<default>` — never the local default ref — to keep each agent session isolated.

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

## 3. Check if already isolated

```bash
CURRENT=$(git branch --show-current)
AHEAD=$(git rev-list --count origin/<default>..HEAD)
```

If `CURRENT` is not `<default>` **and** `AHEAD` is `0`, you are already in an isolated worktree — skip to step 6.

## 4. Create worktree from `origin/<default>`

```bash
BRANCH=<fix|feat|chore|refactor>/<short-description>
SLUG=$(echo "$BRANCH" | tr '/' '-')
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
WT_PATH="../${REPO_NAME}-${SLUG}"

git worktree add "$WT_PATH" -b "$BRANCH" origin/<default>
```

**Never** create the worktree from local `<default>` — it may have unpushed commits.

## 5. Change into the worktree

```bash
cd "$WT_PATH"
```

All file edits and commands must run from inside this directory.

## 6. Confirm

```bash
git rev-list --count origin/<default>..HEAD   # must output 0
```

## 7. Complete task, then push

```bash
git push -u origin <branch-name>
```

Never force-push. If rejected by branch protection, create a new branch name.
