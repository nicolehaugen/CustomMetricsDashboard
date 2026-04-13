---
name: address-pr-feedback
description: "**WORKFLOW SKILL** — Review, validate, and address pull request feedback for the current branch. WHEN: \"address PR comments\", \"fix PR feedback\", \"respond to review\", \"resolve PR threads\", \"address code review\". INVOKES: GitHub MCP tools for PR reads and replies, git for branch and commit. FOR SINGLE OPERATIONS: Use GitHub MCP tools directly for reading PR comments only."
---

## Confirmation Mode Detection

Before starting, determine if the user wants **confirmation mode** — where you pause for approval before making changes and posting replies. Enable confirmation mode if the user's message contains language suggesting they want to review your plan first, such as:
- "confirm first", "confirm before", "check with me first"
- "verify before", "approve before", "let me review"
- "step by step", "one at a time", "pause before"
- "don't make changes yet", "plan first", "show me first"
- Any similar phrasing that implies the user wants to approve actions before they happen

If confirmation mode is **not** detected, follow the Standard Flow below. If it **is** detected, follow the Confirmation Flow.

---

## Standard Flow

1. Determine the currently checked out Git branch.
2. Find the open pull request associated with that branch using the GitHub MCP server tools.
3. Review new and unresolved feedback on the pull request, including PR comments, PR review comments, and top-level PR review bodies. In threads with multiple replies, focus on the reviewer's feedback — ignore the PR author's own prior replies.
4. **Carefully** consider if the feedback is valid and should be addressed — **DO NOT** just assume it is correct. Validate its accuracy first by reviewing the relevant code and context. Keep in mind that the reviewer — especially AI and bot reviewers like Copilot — does not have all of the context from the session that you do. Before making changes, ensure that the feedback doesn't contradict decisions made based on actual research, facts, and conclusions reached during the session.
5. Address the feedback that is valid by making the necessary code changes — only if the changes are proportionate to the original objective of the pull request and do not introduce unnecessary scope creep.
6. Make sure to update any docs, doc strings, and tests associated with your changes.
7. Run linters, formatters, and relevant tests to ensure your changes are correct.
8. Commit your changes.
9. Reply to each piece of feedback (PR comment, PR review comment, or top-level PR review body) that was addressed or considered. Each reply should be concise. For addressed feedback, include the commit hash containing the corresponding changes. For feedback you chose not to address, briefly explain why.
10. For each thread from AI/bot reviewers (e.g., Copilot): resolve it **only if the feedback was fully addressed** by a code change or was already fixed prior to this session. If you chose not to act on a piece of feedback (e.g., it was invalid, out of scope, or already handled elsewhere), leave that thread **unresolved** — your reply in that thread is explanation enough. Do **not** resolve human reviewer feedback — just reply to it.
11. Post a single summary comment on the PR listing every piece of feedback that was reviewed, the action taken for each (fixed in commit X / skipped because Y / already resolved), and which threads were resolved vs. left open.
12. Provide a summary to the user of what feedback was addressed and why, and note any feedback that was not addressed with an explanation.

---

## Confirmation Flow

### Phase 1: Review & Plan (no changes yet)

1. Determine the currently checked out Git branch.
2. Find the open pull request associated with that branch using the GitHub MCP server tools.
3. Review new and unresolved feedback on the pull request, including PR comments, PR review comments, and top-level PR review bodies. In threads with multiple replies, focus on the reviewer's feedback — ignore the PR author's own prior replies.
4. **Carefully** consider if the feedback is valid and should be addressed — **DO NOT** just assume it is correct. Validate its accuracy first by reviewing the relevant code and context. Keep in mind that the reviewer — especially AI and bot reviewers like Copilot — does not have all of the context from the session that you do. Before making changes, ensure that the feedback doesn't contradict decisions made based on actual research, facts, and conclusions reached during the session.
5. **Present a plan to the user** using `ask_user` summarizing:
   - Each piece of feedback, who left it, and where (file/line if applicable)
   - Your assessment: will you address it, skip it, or partially address it, and why
   - A brief description of the code changes you intend to make for each item
   - **DO NOT make any code changes or post any PR replies yet**
6. Wait for the user to approve, adjust, or reject the plan. If the user requests changes to the plan, revise and re-confirm.

### Phase 2: Implement Changes (after plan approval)

7. Make the approved code changes.
8. Update any docs, doc strings, and tests associated with your changes.
9. Run linters, formatters, and relevant tests to ensure your changes are correct.
10. Commit your changes.

### Phase 3: Confirm & Post Replies (after changes committed)

11. **Present each proposed PR reply to the user** using `ask_user` — show the exact reply text you intend to post for each piece of feedback (including the commit hash where applicable). Ask the user to approve, edit, or skip each reply.
12. Post only the approved replies.
13. For each thread from AI/bot reviewers (e.g., Copilot): resolve it **only if the feedback was fully addressed** by a code change or was already fixed prior to this session. If you chose not to act on a piece of feedback (e.g., it was invalid, out of scope, or already handled elsewhere), leave that thread **unresolved** — your reply in that thread is explanation enough. Do **not** resolve human reviewer feedback — just reply to it.
14. Post a single summary comment on the PR listing every piece of feedback that was reviewed, the action taken for each (fixed in commit X / skipped because Y / already resolved), and which threads were resolved vs. left open.
15. Provide a summary to the user of what feedback was addressed and why, and note any feedback that was not addressed with an explanation.
