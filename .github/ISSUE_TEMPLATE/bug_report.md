name: Bug Report
about: File a bug report for the VectoBeat Discord bot or its tooling.
title: "[Bug]: "
labels: bug, needs triage
assignees: ''

---

Thanks for helping us keep VectoBeat stable. Please provide as much context as possible so we can reproduce the issue quickly.

## What happened? (required)
Provide a concise description of the bug. Example: `When I ran /play ... the bot replied with ...`

## Steps to reproduce (required)
Detail the minimal steps needed to reproduce the issue. Include slash commands, configuration, or API calls.
1. ...
2. ...
3. ...

## Expected behaviour (required)
Tell us what you expected to happen.

## Severity (required)
Estimate the operational impact. Choose one:
- Critical – outage, security breach, or data loss
- High – major feature unusable for many guilds
- Medium – degraded experience or incorrect results
- Low – cosmetic or documentation issue

## Impact details
Share how many guilds/users are affected, and whether a workaround exists.

## Regression?
Did this work previously with the same configuration? Choose one:
- Yes, it used to work and recently regressed
- Unsure
- No, it has never worked

## Relevant logs, stack traces, or screenshots
Paste console output, Lavalink logs, or attach screenshots. Remove secrets before sharing.

## Attachments
Links to screenshots, videos, dashboards, or Grafana traces if helpful.

## Environment (required)
OS, Python version, Lavalink version, deployment method (docker, bare metal, etc.).
Example: `Ubuntu 22.04 · Python 3.11.6 · Lavalink 4.0.6 · docker-compose`

## Checklist
- [ ] I am using the latest commit of VectoBeat's `main` branch.
- [ ] I searched open and closed issues to avoid duplicates.
- [ ] I removed sensitive tokens or guild identifiers from logs.
