# Deployment checklist — private team pages and full rosters

This release adds private roster and schedule pages for team age groups, admin schedule management, and admin-managed jersey numbers/positions.

## Do not publish the website first

Apply the database changes and update the existing `manage-family-accounts` Edge Function before the GitHub Pages deployment. Otherwise, the new pages/admin roster fields will fail against the old database/function.

## 1. Supabase database

Use the existing Kings Hockey Academy Supabase project. In **SQL Editor**, create a query and run these files in order, one at a time:

1. `supabase/migrations/202611230001_private_team_rosters_and_schedules.sql`
2. `supabase/migrations/202611230002_team_roster_jersey_positions.sql`

Open each file from this project folder, copy its complete contents, paste into the SQL Editor, and click **Run**. Wait for success before running the next file.

These are the two new migrations only. Do not rerun the older migrations already used to set up the current site. If migration 1 reports that `team_age_group_access`, `parent_children`, or `private.is_kha_admin()` is missing, stop and resolve the existing schema/migration state before continuing; do not improvise SQL changes.

## 2. Supabase Edge Function

The existing `manage-family-accounts` function must be updated so the admin roster list includes jersey number and position.

1. In Supabase, open **Edge Functions** → `manage-family-accounts`.
2. Open its editor.
3. Replace the editor contents with the complete file `supabase/functions/manage-family-accounts/index.ts` from this project.
4. Click **Deploy updates** and wait for success.

Do not create a second function with a different name. Do not change or paste any API keys/secrets. The schedule manager uses the database directly with RLS and does not require a new Edge Function.

## 3. GitHub Pages website

Recommended method: GitHub Desktop.

1. Back up the current repository and clone `https://github.com/kingshockeyacademyns-sys/kings-hockey-academy-site.git` in GitHub Desktop.
2. Extract this release ZIP. Its project folder is `kings-hockey-academy-site-main`.
3. Copy the contents of that folder into the cloned repository folder, allowing files to be replaced. Keep the cloned repository's hidden `.git` folder. Do not delete it and do not upload the ZIP itself.
4. In GitHub Desktop, review the changed files. Confirm there are no `.env` files, service-role keys, database passwords, or Resend API keys.
5. Commit with message `Add private team rosters and schedules`.
6. Push to the `main` branch.

The repository's existing GitHub Actions workflow publishes the `public/` folder when a commit is pushed to `main`. In GitHub, open **Actions** and wait for the **Publish website** workflow to finish successfully.

## 4. Test before announcing it to parents

- Sign in as an approved admin.
- Open **Accounts → Age Group Permissions & Rosters**. Assign a jersey number and position to a test player and save.
- Open `admin-team-schedule.html` and create a test event for a test team/age group.
- Sign in as a parent assigned to that exact team age group. Confirm they can view the roster and schedule but cannot edit either.
- Sign in as a parent not assigned to that team age group. Confirm access is denied.
- Confirm the admin can edit/delete the test event, then remove the test event if appropriate.

## Safety notes

- Do not change domain nameservers or DNS as part of this deployment.
- The Supabase URL and publishable key in `public/supabase-config.js` are browser-public values. Never put a Supabase secret/service-role key, Resend API key, or database password in `public/` or GitHub.
- This deployment guide does not mean anything has been published. The changes go live only after you run the steps above.
