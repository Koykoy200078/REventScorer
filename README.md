This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Storage

EventScorer now uses a normalized MySQL schema instead of `data/events.json` for runtime persistence.

Configure MySQL credentials in the root `.env` file (`C:\Projects\ShareME\.env`) with:

- `EVENTSCORER_DB_HOST`
- `EVENTSCORER_DB_PORT`
- `EVENTSCORER_DB_USER`
- `EVENTSCORER_DB_PASSWORD`
- `EVENTSCORER_DB_NAME`
- `EVENTSCORER_DB_POOL_SIZE`

Compatibility aliases are also supported: `MYSQL_*` and `DB_*` variants.

On first startup, if MySQL has zero events and `data/events.json` exists, EventScorer auto-imports legacy JSON data into MySQL.

## API Ownership

EventScorer API routes are owned by the root Express server (`server.js`) under:

- `/api/eventscorer/events`
- `/api/eventscorer/admin/events/:eventId`
- `/api/eventscorer/judge/:token`
- `/api/eventscorer/broadcast`

The EventScorer Next.js app uses a rewrite so client calls to `/api/eventscorer/*` are forwarded to the root backend origin.

## DB Migration and Rollback

Run from the workspace root (`C:\Projects\ShareME`):

```bash
npm run eventscorer:db:migrate
```

`eventscorer:db:migrate` now applies schema and imports `data/events.json` when the target database has no events yet.

Rollback requires explicit confirmation:

```bash
npm run eventscorer:db:rollback -- --yes
```

SQL files used by these scripts:

- `scripts/sql/eventscorer-migration.sql`
- `scripts/sql/eventscorer-rollback.sql`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
