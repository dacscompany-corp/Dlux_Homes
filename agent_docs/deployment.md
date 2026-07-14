# Deployment

Deployed on Vercel (production: dlux-homes.vercel.app). Vercel fails the deploy on any TypeScript or lint error, so run `npm run build` locally before pushing — it's the real gate, not just `next dev`.

Environment variables and SQL migrations are **not** synced automatically:
- Env vars (DATABASE_URL, NEXTAUTH_*, Cloudinary, Google OAuth, email) must be set in the Vercel project settings separately from local `.env`.
- SQL files under `src/backend/migrations/` must be applied to the Supabase database by hand — Vercel does not run them on deploy.
