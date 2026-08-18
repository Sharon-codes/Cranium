# Cranium

Cranium is a production-ready Next.js + Supabase application that turns uploaded documents into AI-generated mind maps, then layers on summaries, explanations, flashcards, MCQs, and subjective evaluation.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- React Flow (`@xyflow/react`)
- Supabase Auth, Postgres, Storage
- xAI Grok API via the OpenAI-compatible SDK
- `pdf-parse`, `mammoth`, `jszip` for file parsing

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Fill these values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GROK_API_KEY=your-grok-key
GROK_MODEL=grok-4-0709
GROK_BASE_URL=https://api.x.ai/v1
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. In Supabase SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql).

5. Start the app:

```bash
npm run dev
```

6. Open `http://localhost:3000`.

## Supabase setup

1. Create a new Supabase project.
2. Enable Email/Password auth in Authentication > Providers.
3. Run the schema SQL.
4. Confirm the `documents` storage bucket exists.
5. Add the site URL and redirect URL:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/api/auth/callback`

## Vercel deployment

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local`.
4. Set `NEXT_PUBLIC_SITE_URL` to your Vercel production URL.
5. Deploy.
6. Update Supabase redirect URLs to include:
   - `https://your-domain.vercel.app/api/auth/callback`

## Architecture

- `app/`: pages and route handlers
- `components/`: reusable UI and interactive workspace modules
- `lib/`: auth, Supabase clients, Grok integration, parsers, persistence logic
- `supabase/`: SQL schema and database setup
- `styles/`: shared CSS tokens
- `utils/`: lightweight shared fetch utility

## Core flows

- Upload a document from the dashboard
- Parse source text on the server
- Generate structured topics with Grok
- Convert topics into persisted map nodes
- Render the graph with React Flow
- Generate revision sets on demand from map scope
- Evaluate subjective answers with grounded AI feedback
