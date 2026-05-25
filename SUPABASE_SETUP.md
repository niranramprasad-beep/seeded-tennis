# Supabase setup for Seeded

## 1. Create the project

Create a Supabase project at `https://supabase.com`.

In Project Settings → API, copy:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Service role key → `SUPABASE_SERVICE_ROLE_KEY`

The service role key is private and must only be used in server-side code.

## 2. Configure local environment

```bash
cp .env.example .env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

## 3. Run the database migration

Open Supabase → SQL Editor and run:

```sql
-- contents of supabase/migrations/001_initial_saas_schema.sql
```

Then run the follow-up migration:

```sql
-- contents of supabase/migrations/002_utr_entries.sql
```

Then run these in order:

```sql
-- contents of supabase/migrations/003_families_signup_fix.sql
-- contents of supabase/migrations/004_fix_profiles_recursion.sql
-- contents of supabase/migrations/005_feature_expansion.sql
```

This creates:

- `families`
- `profiles`
- `training_plans`
- `workout_sessions`
- `exercises`
- `session_exercises`
- `saved_templates`
- `user_settings`
- `utr_entries`
- `daily_checkins`
- `matches`
- `badges`
- `friendships`
- `family_codes`
- `parent_accounts`
- `cost_calculations`
- `parent_reports`
- `encouragement_notes`

It also adds:

- foreign keys
- indexes
- `created_at` / `updated_at`
- `updated_at` triggers
- Row Level Security
- owner-only RLS policies

## 4. Auth configuration

Supabase email/password auth works out of the box.

For production, review:

- Authentication → URL Configuration
- Site URL: your Vercel production URL
- Redirect URLs: your Vercel preview URLs if you use email confirmations

If email confirmations are enabled, users may need to confirm email before logging in.

## 5. Storage buckets

Open Supabase → Storage and create these buckets:

- `parent-reports` → private
- `match-videos` → private

The app uses the server-side service role key for parent report uploads. Match videos upload from the signed-in user account.

## 6. AI match analysis

Add this in local `.env.local` and Vercel Environment Variables:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

If the key is missing, match logging still works, but the app shows a fallback analysis instead of a real AI response.

## 7. Security notes

- Browser code uses only the publishable key.
- RLS ensures users can access only rows where `user_id = auth.uid()` or `id = auth.uid()`.
- `SUPABASE_SERVICE_ROLE_KEY` is reserved for server-only operations and is not imported by client components.
