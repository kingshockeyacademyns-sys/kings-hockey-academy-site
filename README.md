# Kings Hockey Academy site: GitHub Pages + Supabase

This folder contains the converted static website. The pages keep the design and copy from the supplied PHP site. GitHub Pages serves the public pages; Supabase stores registration inquiries and controls the private admin view. A Supabase Edge Function forwards general questions to the academy email using Resend.

## What is in the project

- `public/` — website pages, existing logo/artwork, stylesheet, browser scripts, and the safe-to-publish Supabase project URL/publishable key placeholders.
- `supabase/migrations/` — database setup. Public visitors can submit a registration inquiry; only a user explicitly added to `private.admin_users` can view or delete registrations.
- `supabase/functions/send-question/` — private email-forwarding code. The Resend API key stays in Supabase secrets, never in the website.
- `.github/workflows/pages.yml` — publishes only `public/` to GitHub Pages when the `main` branch changes.

The original PHP package is not included in this repository. GitHub Pages publishes only the static files in `public/`.

## Account setup guide

Do these steps in order. Do not place a password, Resend API key, Supabase secret key, or database password in a website file or a GitHub commit.

1. Create a **public** GitHub repository and upload this project. GitHub Free requires a public repository to publish a Pages site. The public site code will be visible, so this project keeps passwords, private registration records, and email-service keys out of it. Choose **Add file → Upload files** on the repository page, drag in the project files, and commit them to the `main` branch.
2. In the GitHub repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**. The included workflow then publishes the `public/` folder.
3. Create a Supabase project on the Free plan. In **SQL Editor**, run `supabase/migrations/202611130001_private_registrations.sql` first, then run `supabase/migrations/202611130002_dynamic_programs.sql`. These set up private inquiries and admin-created programs with public registration forms.
4. In Supabase **Authentication → Users**, add the academy administrator's email and a strong password. Disable public sign-ups in **Authentication → Settings**. Copy the new user's **ID**. In **SQL Editor**, run `insert into private.admin_users (user_id) values ('PASTE-USER-ID-HERE');` after replacing the placeholder with that ID. This explicit approval is what grants access to registrations.
5. In Supabase **Project Settings → API**, copy the **Project URL** and **publishable key** into `public/supabase-config.js`. These two values are meant to be public; never copy a `secret` or `service_role` key there. Commit the change to GitHub.
6. In Supabase, open **Edge Functions → Deploy a new function → Via Editor**, create a function named `send-question`, and paste in `supabase/functions/send-question/index.ts`. Turn off JWT verification for this public form function; it validates the submitted fields and only accepts requests from the website origin. In **Edge Function Secrets**, save `RESEND_API_KEY`, `QUESTION_FROM_EMAIL` (a sender address on a domain verified with Resend), and `SITE_ORIGIN` (the final website origin, such as `https://example.github.io`). Resend must verify the sender domain before messages can be delivered. The source copy is also in this repository for safekeeping.
7. Open `https://YOUR-GITHUB-PAGES-ADDRESS/admin.html` and sign in with the admin account. Successful sign-in takes you to the separate `admin-dashboard.html` page, which redirects back to sign-in if there is no active session. Create and open programs in **Programs & Forms**; parents can find them on the Camps & Programs page. Submit a test registration and ask someone to confirm the entry appears in the admin dashboard before sharing the form.

## Backups and free-plan limits

Supabase's Free plan currently includes a 500 MB database and 5 GB each of cached and uncached egress. Free projects may pause after a week of inactivity, and the Free plan does not include automatic database backups. Export a database backup regularly and keep it somewhere private and separate from the public website repository. Check the current [Supabase plan details](https://supabase.com/pricing) before relying on a quota or changing plans.

Registration inquiries contain information about children. Only create admin accounts for people who need access, keep the admin password private, export CSVs only to a secure location, and delete inquiries when they are no longer needed. GitHub Pages is static and cannot run the old PHP files; do not upload the old SQLite database or any registration CSV to the repository.

## Domain

The domain can remain with its current registrar. First confirm the GitHub Pages address and HTTPS work; connect the existing domain in GitHub Pages settings afterward. Do not register or transfer the domain as part of this setup.
