# Team roster jersey number and position update

This update extends the private team roster pages with admin-managed jersey numbers and playing positions.

## Admin workflow

1. Sign in to the academy admin account.
2. Open **Accounts → Age Group Permissions & Rosters**.
3. For each player row, enter a jersey number (0–99) and choose a position.
4. Click **Save** on that row.
5. The saved number and position appear on the player's private team roster page.

Supported positions: Centre, Left Wing, Right Wing, Defence, Goalie, Forward.

Jersey numbers must be unique within a team age group. Parents can view roster details but cannot edit them.

## Deployment order — do not skip

1. Apply `supabase/migrations/202611230002_team_roster_jersey_positions.sql` after the previous private team pages migration (`202611230001_private_team_rosters_and_schedules.sql`).
2. Deploy the updated Supabase Edge Function `manage-family-accounts` from `supabase/functions/manage-family-accounts/index.ts`. It now returns jersey number and position to the admin roster screen.
3. Publish the updated `public/` files to GitHub Pages.

No credentials or API keys are included in this package. Nothing has been published online by this update.
