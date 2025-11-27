## Summary
- [ ] Link the primary issue(s) and describe the user-facing problem.
- [ ] Note the surface area touched (bot / control panel / docs / infra).
- [ ] Call out follow-up work if this is part of a series.

## Risk & Impact
- [ ] Risk level: `low / medium / high` (why?).
- [ ] Blast radius: playback, queue sync, telemetry, billing, docs, infra.
- [ ] Migration/rollback notes if schema, env, or API shapes changed.

## Testing Evidence
| Area | Command / Scenario | Result |
| ---- | ------------------ | ------ |
| Bot | `python -m compileall src`, `pytest -q`, `python scripts/run_scenarios.py bot/tests/scenarios/basic_queue.yaml` | |
| Frontend | `npm run lint`, `npm run test:server-settings` | |
| Docs/diagrams | `python scripts/generate_command_reference.py`, `npx -y @mermaid-js/mermaid-cli -i docs/system_architecture.mmd -o assets/images/architecture.png ...` | |
| Ops | `docker compose up -d --build`, staging deploy | |

> Add rows for manual checks (`/play`, `/status`, concierge/success pod flows) and attach logs/screenshots as needed.

## Checklist
- [ ] README, docs, and runbooks updated for behaviour/config changes.
- [ ] Slash-command catalogue regenerated if commands changed.
- [ ] No secrets or tokens in the diff; env keys documented.
- [ ] CI workflows updated if pipelines or build contexts changed.
- [ ] Code owners mentioned for impacted paths (see `.github/CODEOWNERS`).
