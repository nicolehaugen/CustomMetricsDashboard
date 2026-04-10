---
name: merge-main
description: "Merges the latest changes from main into the current branch, resolves any conflicts, reviews main's recent changes for applicability to branch files, and pushes. Use this when asked to merge main, update from main, or sync with main."
---

Follow these steps to merge the latest changes from the default branch into the current branch.

> **Note:** This skill supports repositories whose default branch is named either `main` or `master`. The instructions below use the placeholder `<default>` to refer to whichever name applies.

## 0. Detect the default branch

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

## 1. Preflight checks

a. Determine the currently checked out branch. If it is `<default>`, stop and inform the user — do not merge `<default>` into itself.

b. Check for uncommitted changes (staged or unstaged) by running `git status --porcelain`. If the output is non-empty, stash them with `git stash push -m "merge-main: auto-stash"` and remember to pop them at the end.

## 2. Fetch and merge

a. Run `git fetch origin <default>` to get the latest remote changes.

b. Run `git merge origin/<default> --no-edit`.

c. If the merge completes cleanly with no conflicts, skip to step 4.

## 3. Resolve conflicts (only if the merge produced conflicts)

a. List all conflicted files with `git diff --name-only --diff-filter=U`.

b. For each conflicted file:
   - Read the file and understand both sides of the conflict.
   - Determine the correct resolution by understanding the intent of both changes.
   - Edit the file to resolve the conflict, removing all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
   - Stage the resolved file with `git add <file>`.

c. After all conflicts are resolved, finalize the merge with `git commit --no-edit`.

## 4. Review default branch changes for applicability

a. Get the list of files changed on the current branch vs `origin/<default>` using `git diff --name-only origin/<default>...HEAD` (the three-dot diff shows what the branch introduced).

b. Get the list of files changed on `<default>` since the branch's merge-base using `git diff --name-only $(git merge-base HEAD origin/<default>)..origin/<default>`.

c. Look for overlap or related files between these two lists — for example, if the branch modified a function and `<default>` changed how that function is called elsewhere, or if `<default>` introduced patterns/conventions that the branch's new files should follow.

d. If you find changes on `<default>` that are relevant to the branch's files (e.g., API changes, renamed imports, updated patterns, new shared utilities), apply those adjustments to the branch's files. Commit these as a separate commit with a descriptive message.

e. If nothing needs adjustment, move on.

## 5. Restore and push

a. If changes were stashed in step 1b, run `git stash pop` to restore them. If the pop fails due to conflicts, run `git checkout --theirs .` or manually resolve the stash conflicts, then run `git stash drop` to clean up the stash entry. Do **not** commit the restored stash — leave those as uncommitted working changes.

b. Push the branch to the remote with `git push`.

c. If the push is rejected (e.g., due to a force-push or diverged history), do **not** force push. Inform the user and ask how to proceed.

## 6. Summary

a. Provide a brief summary: how many commits were merged, whether conflicts were resolved, and whether any applicability adjustments were made.
