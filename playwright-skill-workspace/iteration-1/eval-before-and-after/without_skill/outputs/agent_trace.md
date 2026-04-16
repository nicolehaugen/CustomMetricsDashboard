# Without-Skill Agent Trace: eval-before-and-after

## Prompt
"I'm about to modify the Copilot Adoption dashboard (05-copilot-adoption.json). Please take before and after screenshots of the affected dashboard."

## Agent Behavior (simulated without skill)
1. Agent reads copilot-instructions.md to find screenshot conventions
2. Agent parses dashboard JSON to extract UID: copilot-adopt
3. Agent takes BEFORE screenshot: http://admin:admin@localhost:3004/d/copilot-adopt?orgId=1&kiosk
4. Agent waits for user to make changes
5. Agent takes AFTER screenshot of same URL
6. Agent saves to v2/screenshots/before-copilot-adopt.png and v2/screenshots/after-copilot-adopt.png

## Files Produced
- before-copilot-adopt.png (66201 bytes)
- after-copilot-adopt.png (65999 bytes)

## Result
Both before and after screenshots taken. Agent needed to manage the workflow sequencing manually.
