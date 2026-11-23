# Private Team Roster and Schedule Pages

This update adds private, read-only roster and schedule pages for each team age group, plus an admin-only team schedule manager.

## Included
- `public/team-roster.html` and `public/team-schedule.html`
- `public/js/private-team-page.js`
- `public/admin-team-schedule.html` and `public/js/admin-team-schedule.js`
- Updated age-group hub page, admin dashboard navigation, and stylesheet
- Supabase migration: `202611230001_private_team_rosters_and_schedules.sql`

## Deployment order
1. Back up the current repository and Supabase database.
2. Apply the new SQL migration in the Supabase SQL Editor (or your normal migration workflow).
3. Deploy the website files to the same GitHub Pages repository.
4. In the admin area, use **TEAM SCHEDULES** to add events.
5. Test with one parent account that has a player assigned to a team age group, and separately test an unassigned parent account.

## Access behavior
- Parents must be signed in and have a player assigned to the exact team and age group.
- Parents can view the roster and calendar but cannot modify either.
- The roster function returns only basic player names for the assigned team; it does not expose child medical or contact details.
- Only approved KHA admins can create, update, or delete schedule events. The admin UI also checks the admin status, and Supabase RLS enforces write permissions.
- All schedule times are entered and displayed as Atlantic Time. The event date and time are stored separately in the database.

## Roster fields
Each assigned player has an admin-managed jersey number (0–99) and position. Jersey numbers must be unique within the same team and age group. Parents can view these fields on their private roster but cannot edit them. Apply migration `202611230002_team_roster_jersey_positions.sql` after `202611230001_private_team_rosters_and_schedules.sql`.
