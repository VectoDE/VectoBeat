<div align="center">
  <h2>VectoBeat Pull Request Checklist</h2>
  <p>Provide crisp context, reproduce the verification steps, and keep reviewers unblocked.</p>
</div>

---

### Summary

- [ ] Link the primary issue(s) and describe the user-facing problem.
- [ ] Outline your approach (architecture, major modules touched, notable trade-offs).
- [ ] Call out follow-up work or TODOs explicitly if this PR is part of a series.

### Risk & Impact

- [ ] Identified the risk level: `low / medium / high` (explain why).
- [ ] Listed potential blast radius (playback, diagnostics, infrastructure, docs, etc.).
- [ ] Added migration/rollback notes if schema or config changes occur.

### Testing Evidence

| Area | Command / Scenario | Result |
| ---- | ------------------ | ------ |
| Unit / integrations | `pytest`, `scripts/run_lint.sh`, etc. | |
| Manual verification | `/play`, `/queueinfo`, `/status`, etc. | |
| Deployment / ops | `docker compose up`, staging deploy, etc. | |

> Add additional rows as needed. Attach screenshots, logs, or links to dashboards where relevant.

### Checklist

- [ ] Docs (`README`, `docs/`, runbooks) updated when behaviour changes.
- [ ] New or updated automated tests cover success and failure paths.
- [ ] Secrets/config reviewed; no tokens or credentials appear in the diff.
- [ ] CI workflows (build/test/deploy/security) pass locally or in GitHub Actions.
- [ ] Issue templates, label automation, or release notes updated if necessary.

### Reviewer Notes

- [ ] Mention code owners for impacted areas (see `.github/CODEOWNERS`).
- [ ] Include any background context reviewers should know (links to Slack/Discord threads, design docs, etc.).
- [ ] Confirm no Codacy/static analysis warnings remain (if applicable).
