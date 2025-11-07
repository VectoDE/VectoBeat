# Development Guide

## Type Checking
We require pyright to pass before merging. Install it globally via npm:

```bash
npm install -g pyright
```

Then run:

```bash
scripts/typecheck.sh
```

This runs pyright in strict mode using `pyrightconfig.json`.

## Pre-Commit Checklist
- `python3 -m compileall src`
- `scripts/typecheck.sh`
- `python3 -m pytest` (when tests are added)

