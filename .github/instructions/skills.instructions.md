---
applyTo: ".github/skills/**/SKILL.md"
---

# Skill Authoring — Sensei Auto-Invocation

After **creating or modifying** any `SKILL.md` file under `.github/skills/`, you must
automatically run the Sensei skill to validate and improve frontmatter compliance.

## When to Invoke Sensei

Invoke Sensei immediately after:
- Creating a new skill (`SKILL.md`)
- Editing an existing `SKILL.md` (description, triggers, or body content)
- Moving or renaming a skill directory

Do **not** invoke Sensei for changes to `references/*.md`, test files, or other
non-`SKILL.md` files inside a skill directory.

## How to Invoke

Use the Sensei skill (already installed at `~/.copilot/skills/sensei/`):

```
Run sensei on <skill-name>
```

Or for faster iteration when tests are not yet written:

```
Run sensei on <skill-name> --fast
```

Sensei will execute the Ralph Loop — scoring the frontmatter, improving triggers,
checking token budget — and iterate until the skill reaches **Medium-High** compliance.

## Handling the "Prompt User" Step (Step 10) in Cloud Agent Mode

Sensei's Step 10 asks the user to choose: Commit (C), Create Issue (I), or Skip (S).

In the cloud agent context:
1. **Post a GitHub comment** on the issue/PR summarizing the before/after score:
   - Before score (Low/Medium/etc.), after score, token delta, trigger count
2. **Ask the user** to reply with C, I, or S
3. **If you cannot wait for a reply** (e.g., running in a fully automated context):
   - If score >= Medium-High: **Commit** with message `sensei: improve <skill-name> frontmatter`
   - If score < Medium-High after 5 iterations: **Create Issue** with the suggestions

## Target Score

Aim for **Medium-High** or higher:
- Description ≥ 150 chars, ≤ 60 words
- Contains `WHEN:` trigger phrases (preferred) or `USE FOR:`
- No `DO NOT USE FOR:` (risky in multi-skill environments)
- `SKILL.md` < 500 tokens
