---
name: merge-main
description: "**WORKFLOW SKILL** — Merge or rebase PR branch onto the latest main/master, resolve conflicts, and push. WHEN: 'merge main into my branch', 'rebase onto main', 'sync with main', 'main was updated need it in PR', 'bring main changes into PR'. INVOKES: git fetch, git merge/rebase, git push. FOR SINGLE OPERATIONS: use git merge origin/main or git rebase origin/main directly."
---

Follow these steps to sync the current PR branch with the latest default branch using either **merge** or **rebase**.

> **Note:** This skill supports repositories whose default branch is named either `main` or `master`. The instructions below use the placeholder `<default>` to refer to whichever name applies.

## 0. Choose strategy

Determine whether to **merge** or **rebase**:

- If the user explicitly says "rebase", use **rebase**.
- If the user explicitly says "merge", use **merge**.
- If the user says "sync", "update", or is ambiguous, default to **merge** (safer for shared branches; fewer force-push risks).

Remember the chosen strategy and substitute it for `<strategy>` in the steps below.

## 1. Detect the default branch

Try the local ref first (fast, no network):

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'
```

If that returns `main` or `master`, use it. Otherwise fall back to querying the remote:

```bash
git remote show origin | sed -n 's/.*HEAD branch: //p'
```

Store the result and substitute it for every occurrence of `<default>` in the remaining steps.

If neither command returns `main` or `master`, check whether `origin/main` or `origin/master` exists:

```bash
git branch -r | grep -E 'origin/(main|master)$'
```

Use whichever exists. If both exist, prefer `main`. If neither exists, stop and inform the user.

## 2. Preflight checks

a. Determine the currently checked out branch. If it is `<default>`, stop and inform the user — do not merge `<default>` into itself.

b. Check for uncommitted changes (staged or unstaged) by running `git status --porcelain`. If the output is non-empty, stash them with `git stash push -m "merge-main: auto-stash"` and remember to pop them at the end.

## 3. Fetch and sync

a. Run `git fetch origin <default>` to get the latest remote changes.

**If strategy = merge:**

b. Run `git merge origin/<default> --no-edit`.

c. If the merge completes cleanly with no conflicts, skip to step 5.

**If strategy = rebase:**

b. Run `git rebase origin/<default>`.

c. If the rebase completes cleanly with no conflicts, skip to step 5.

## 4. Resolve conflicts (only if the sync produced conflicts)

**If strategy = merge:**

a. List all conflicted files with `git diff --name-only --diff-filter=U`.

b. For each conflicted file:
   - Read the file and understand both sides of the conflict.
   - Determine the correct resolution by understanding the intent of both changes.
   - Edit the file to resolve the conflict, removing all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
   - Stage the resolved file with `git add <file>`.

c. After all conflicts are resolved, finalize the merge with `git commit --no-edit`.

**If strategy = rebase:**

a. List all conflicted files with `git diff --name-only --diff-filter=U`.

b. For each conflicted file:
   - Read the file and understand both sides of the conflict.
   - Determine the correct resolution, favouring the branch's intent where applicable.
   - Edit the file to resolve the conflict, removing all conflict markers.
   - Stage the resolved file with `git add <file>`.

c. After all conflicts in the current commit are resolved, continue with `git rebase --continue`.

d. Repeat steps a–c for each subsequent conflicting commit until the rebase completes.

e. If a commit becomes empty after conflict resolution, run `git rebase --skip` to skip it.

## 5. Review default branch changes for applicability

a. Get the list of files changed on the current branch vs `origin/<default>` using `git diff --name-only origin/<default>...HEAD` (the three-dot diff shows what the branch introduced).

b. Get the list of files changed on `<default>` since the branch's merge-base using `git diff --name-only $(git merge-base HEAD origin/<default>)..origin/<default>`.

c. Look for overlap or related files between these two lists — for example, if the branch modified a function and `<default>` changed how that function is called elsewhere, or if `<default>` introduced patterns/conventions that the branch's new files should follow.

d. If you find changes on `<default>` that are relevant to the branch's files (e.g., API changes, renamed imports, updated patterns, new shared utilities), apply those adjustments to the branch's files. Commit these as a separate commit with a descriptive message.

e. If nothing needs adjustment, move on.

## 6. Restore and push

a. If changes were stashed in step 2b, run `git stash pop` to restore them. If the pop fails due to conflicts, run `git checkout --theirs .` or manually resolve the stash conflicts, then run `git stash drop` to clean up the stash entry. Do **not** commit the restored stash — leave those as uncommitted working changes.

b. Push the branch to the remote:

- **If strategy = merge:** Run `git push`.
- **If strategy = rebase:** Run `git push --force-with-lease`. The rebase rewrites history so a force push is required. `--force-with-lease` is safer than `--force` because it rejects the push if someone else has pushed to the branch in the meantime.

c. If the push is rejected and the strategy was **merge**, do **not** force push. Inform the user and ask how to proceed.

## 7. Summary

a. Provide a brief summary: strategy used, how many commits were merged/rebased, whether conflicts were resolved, and whether any applicability adjustments were made.
