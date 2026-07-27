# Feynman Learn

A web app that pairs students studying the same subject so they can take turns explaining concepts to each other. Based on the Feynman Technique: if you cannot explain something in simple terms, you have not understood it yet.

## What it does

- Create or join study groups for any subject
- Schedule sessions with your group members
- Each session, members take turns teaching a topic while the others ask questions and give feedback
- Rate how well someone explained a concept to track improvement over time

## Tech

Next.js (App Router), Supabase (auth + database), Tailwind CSS, shadcn/ui.

## Running locally

```bash
pnpm install
pnpm dev
```

Set up a Supabase project and add your environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Deploy

This project is set up on Vercel and syncs from the repo. Push to main to deploy.
