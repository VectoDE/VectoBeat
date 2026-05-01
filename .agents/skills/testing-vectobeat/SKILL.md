# VectoBeat Frontend Testing

## Local Development Setup

1. Install dependencies:
   ```bash
   cd frontend && npm install
   ```

2. Generate Prisma client (required even without a database):
   ```bash
   npx prisma generate
   ```

3. Create `.env.local` with minimum required vars:
   ```
   DATA_ENCRYPTION_KEY=dev-local-encryption-key-for-testing-only-32chars
   DATABASE_URL=mysql://user:password@localhost:3306/vectobeat
   ```

4. Start the dev server:
   ```bash
   npm run dev
   # Runs on http://localhost:3050 (Turbopack)
   ```

## Testing Without a Database

The app gracefully degrades without MySQL/Redis:
- All public pages render (Home, Features, Commands, Pricing, Blog, Forum, Stats, About, Contact)
- Metrics/stats show fallback zeros
- Status bars show "Cached" state
- Empty states render with appropriate icons and messages
- Console shows Prisma errors — these are expected and harmless

Pages requiring auth (Control Panel, Account) may partially render or redirect.
The Plugin Marketplace at `/control-panel/plugins` renders without login and shows empty state.

## Key Pages and Routes

| Page | Route | Auth Required |
|------|-------|---------------|
| Home | `/` | No |
| Features | `/features` | No |
| Commands | `/commands` | No |
| Pricing | `/pricing` | No |
| Blog | `/blog` | No |
| Forum | `/forum` | No |
| Stats | `/stats` | No |
| About | `/about` | No |
| Contact | `/contact` | No |
| Plugin Marketplace | `/control-panel/plugins` | No (partial) |
| Control Panel | `/control-panel` | Yes (Discord OAuth) |
| Account | `/account` | Yes (Discord OAuth) |

## Lint and Type Check

```bash
npm run lint          # ESLint
npm run type-check    # TypeScript noEmit
npm test              # Node test runner
```

## UI Testing Tips

- Navigation active state: Uses `usePathname()` — verify by checking CSS classes on nav links. Active link gets `text-primary`, inactive get `text-foreground/70`.
- Status bars: Use flexbox with `gap-1.5` and dot separators (·). Check for `flex` and `gap` in class names.
- Empty states: Components conditionally render different messages based on context (e.g., plugin marketplace shows different text for "no search results" vs "no plugins published").
- The app uses dark theme with orange primary color (`text-primary`).

## CI Notes

- CI might fail with missing secrets (e.g., `DISCORD_CLIENT_ID`, database URLs) — these are expected in PR event context.
- Compare CI results with Dependabot PRs to confirm failures are pre-existing.
- Local lint/typecheck should pass even without secrets.

## Devin Secrets Needed

No secrets are strictly required for local frontend testing without a database.
For full-stack testing, the following would be needed:
- `DATABASE_URL` — MySQL connection string
- `REDIS_URL` — Redis connection string
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — for OAuth login testing
