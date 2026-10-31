# ClaimShield AI — Frontend

Next.js 15 (App Router) + Tailwind. Confirmed to `npm install` and
`next build` clean before packaging.

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # points at the local backend by default
npm run dev
```

Visit `http://localhost:3000`, click through to `/dashboard`.

## How it talks to the backend

`next.config.js` rewrites any request to `/api/backend/*` to
`${NEXT_PUBLIC_API_URL}/api/*`. So the dashboard fetches
`/api/backend/appeal`, and Next.js proxies that server-side to your FastAPI
backend at `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).
This avoids CORS headaches in dev and gives you one place to change the
backend URL when you deploy (set `NEXT_PUBLIC_API_URL` in Vercel's env vars
to your Render URL).

## What's here

```
app/
  page.tsx                landing page
  dashboard/page.tsx       the working dashboard route
  components/
    AppealWorkbench.tsx    the actual dynamic piece: intake form,
                            loading skeleton, error state, editable
                            result panel with a human-approval checkbox
  layout.tsx
  globals.css
```

`AppealWorkbench.tsx` is a client component (`"use client"`) that:
- posts the denial text + clinical notes to the backend
- shows a loading skeleton while the 3-agent pipeline runs
- surfaces backend errors instead of failing silently
- lets staff edit the generated letter inline before approving it
- gates a "Mark Approved" action behind an explicit review checkbox — this
  is the human-in-the-loop layer the original doc calls for. It doesn't
  send anything yet; wire the button to a `/api/backend/claims/:id/approve`
  endpoint once you add claim persistence on the backend.

## Deploying

Push to GitHub, import into Vercel, set `NEXT_PUBLIC_API_URL` to your
deployed backend URL. Vercel's free tier covers this without config changes.
