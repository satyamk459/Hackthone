# ClaimWise

ClaimWise is a responsive insurance document intelligence workspace built with Next.js, TypeScript, Tailwind CSS, Supabase, and a provider-agnostic AI layer.

The current foundation includes a responsive workspace UI, real browser PDF validation, and a Supabase schema for policy versions, private documents, structured analysis, vector chunks, chat, claims, activity history, RLS, and private storage.

## Environment

Copy `.env.example` to `.env.local` and configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `GEMINI_API_KEY`. The app does not currently use a Supabase service-role key. Run `supabase/schema.sql` in the Supabase SQL editor or through the Supabase CLI.

The public Supabase key is safe to expose in browser code because database and storage access are protected by the RLS policies in `supabase/schema.sql`. Keep `GEMINI_API_KEY` server-side and never commit `.env.local`.

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

The schema is version-aware: renewals create `policy_versions` rows instead of overwriting prior documents. Embeddings are scoped by policy and version to prevent cross-policy retrieval.

Run `npm run lint` and `npm run build` before shipping. The UI currently uses clearly marked workspace preview values until authenticated Supabase queries and processing routes are connected.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy with automatic updates

Use GitHub and Vercel so every push is deployed automatically:

1. Create a Git repository for this project and push the `Hackthone` folder to GitHub.
2. In Vercel, choose **Add New Project**, import the GitHub repository, and keep the detected Next.js settings.
3. Add these environment variables in Vercel for **Preview** and **Production**:
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	- `GEMINI_API_KEY`
4. Deploy once. Future pushes to the production branch update the live site; other branches get preview URLs.

### Supabase production setup

Run `supabase/schema.sql` once against the production Supabase project. In Supabase **Authentication > URL Configuration**, set the Vercel production URL as the Site URL and add these redirect URLs:

```text
https://YOUR-DOMAIN.vercel.app/auth/callback
https://*-YOUR-TEAM.vercel.app/auth/callback
```

Configure the Google provider in Supabase if Google sign-in is enabled, and add the production callback URL shown by Supabase to the Google OAuth client.

The app uses `gemini-3.6-flash`, which is required for the current Gemini API key. Remove any `GEMINI_MODEL` variable from Vercel so an old model setting cannot override it. The document processing route is synchronous and has a 60-second serverless limit. Files upload directly from the browser to private Supabase Storage, avoiding Vercel request-body limits.

Run these checks locally before pushing changes:

```bash
npm ci
npm run lint
npm run build
```
