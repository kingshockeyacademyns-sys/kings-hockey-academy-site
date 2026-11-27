import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = (Deno.env.get('SITE_ORIGIN') || 'https://kingshockeyacademyns-sys.github.io').replace(/\/$/, '');
const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const teams = new Set(['nova-scotia-kings', 'nova-scotia-vipers', 'quebec-predators', 'montreal-sentinels']);
const roles = new Set(['head_coach', 'assistant_coach', 'team_manager', 'team_staff']);
const ageGroups = new Set(['U9', 'U11', 'U13', 'U15']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthUser = {
  id: string;
  email?: string;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
};

function displayName(user?: AuthUser | null) {
  const meta = user?.user_metadata || {};
  const full = String(meta.full_name || meta.name || '').trim();
  const first = String(meta.first_name || '').trim();
  const last = String(meta.last_name || '').trim();
  return full || [first, last].filter(Boolean).join(' ') || '';
}

function parseAgeGroup(value: unknown): string | null | undefined {
  const group = String(value ?? 'all').trim().toUpperCase();
  if (group === 'ALL' || group === 'ALL AGE GROUPS' || group === '') return null;
  return ageGroups.has(group) ? group : undefined;
}

async function findUserByEmail(service: ReturnType<typeof createClient>, email: string): Promise<AuthUser | null> {
  for (let page = 1; page <= 500; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(user => String(user.email || '').trim().toLowerCase() === email);
    if (found) return found as AuthUser;
    if (data.users.length < 100) return null;
  }
  throw new Error('Could not complete the account lookup. Please try again or contact support.');
}

async function getUserMap(service: ReturnType<typeof createClient>, ids: string[]) {
  const wanted = new Set(ids);
  const map = new Map<string, AuthUser>();
  if (!wanted.size) return map;
  for (let page = 1; page <= 500; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    for (const user of data.users) if (wanted.has(user.id)) map.set(user.id, user as AuthUser);
    if (data.users.length < 100 || map.size === wanted.size) break;
  }
  return map;
}

async function upsertMembership(
  service: ReturnType<typeof createClient>,
  userId: string,
  teamSlug: string,
  ageGroup: string | null,
  staffRole: string,
  adminId: string,
) {
  let existingQuery = service.from('team_staff_memberships').select('id')
    .eq('user_id', userId).eq('team_slug', teamSlug);
  existingQuery = ageGroup ? existingQuery.eq('age_group', ageGroup) : existingQuery.is('age_group', null);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await service.from('team_staff_memberships').update({
      staff_role: staffRole, is_active: true, updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await service.from('team_staff_memberships').insert({
      user_id: userId, team_slug: teamSlug, age_group: ageGroup, staff_role: staffRole,
      is_active: true, created_by: adminId,
    });
    if (error) throw error;
  }
}

Deno.serve(async request => {
  if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'The staff management service is not configured.' }, 500);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'A valid JSON request is required.' }, 400); }
  const action = String(body?.action || '');
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // Public team-page listing deliberately returns display names and roles only.
    // It never returns email addresses, auth IDs, or inactive memberships.
    if (action === 'public_list') {
      const teamSlug = String(body?.team_slug || '').trim();
      const groupValue = body?.age_group === undefined ? 'all' : body.age_group;
      const group = parseAgeGroup(groupValue);
      if (!teams.has(teamSlug)) return json({ error: 'Choose a valid team.' }, 400);
      if (group === undefined) return json({ error: 'Choose a valid age group.' }, 400);
      let query = service.from('team_staff_memberships')
        .select('user_id,team_slug,age_group,staff_role')
        .eq('team_slug', teamSlug).eq('is_active', true)
        .order('age_group').order('staff_role');
      if (group) query = query.or(`age_group.eq.${group},age_group.is.null`);
      const { data: memberships, error } = await query;
      if (error) throw error;
      const userMap = await getUserMap(service, [...new Set((memberships || []).map(row => row.user_id))]);
      return json({ staff: (memberships || []).map(row => ({
        display_name: displayName(userMap.get(row.user_id)) || 'Team Staff',
        staff_role: row.staff_role,
        age_group: row.age_group,
      })) });
    }

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sign in as an administrator to continue.' }, 401);
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
    const { data: isAdmin, error: roleError } = await caller.rpc('kha_is_admin');
    if (roleError || isAdmin !== true) return json({ error: 'Only an approved administrator can manage team staff.' }, 403);

    if (action === 'search_accounts') {
      const search = String(body?.query || '').trim().toLowerCase();
      if (search.length < 2) return json({ accounts: [] });
      const accounts: Array<{ user_id: string; email: string; display_name: string }> = [];
      for (let page = 1; page <= 500 && accounts.length < 15; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        for (const user of data.users) {
          const email = String(user.email || '').trim();
          if (!email) continue;
          const name = displayName(user as AuthUser);
          if (email.toLowerCase().includes(search) || name.toLowerCase().includes(search)) {
            accounts.push({ user_id: user.id, email, display_name: name });
            if (accounts.length >= 15) break;
          }
        }
        if (data.users.length < 100) break;
      }
      return json({ accounts });
    }

    if (action === 'list') {
      const teamSlug = String(body?.team_slug || '').trim();
      if (teamSlug && !teams.has(teamSlug)) return json({ error: 'Choose a valid team.' }, 400);
      let query = service.from('team_staff_memberships')
        .select('id,user_id,team_slug,age_group,staff_role,is_active,created_by,created_at,updated_at')
        .order('team_slug').order('age_group').order('created_at', { ascending: false });
      if (teamSlug) query = query.eq('team_slug', teamSlug);
      const { data: memberships, error } = await query;
      if (error) throw error;
      const userMap = await getUserMap(service, [...new Set((memberships || []).map(row => row.user_id))]);
      return json({ staff: (memberships || []).map(row => ({
        ...row,
        email: userMap.get(row.user_id)?.email || '',
        display_name: displayName(userMap.get(row.user_id)),
        account_disabled: Boolean(userMap.get(row.user_id)?.banned_until && new Date(userMap.get(row.user_id)!.banned_until!).getTime() > Date.now()),
      })) });
    }

    if (action === 'assign' || action === 'invite') {
      const teamSlug = String(body?.team_slug || '').trim();
      const group = parseAgeGroup(body?.age_group);
      const staffRole = String(body?.staff_role || '').trim();
      if (!teams.has(teamSlug)) return json({ error: 'Choose a valid team.' }, 400);
      if (group === undefined) return json({ error: 'Choose a valid age group.' }, 400);
      if (!roles.has(staffRole)) return json({ error: 'Choose a valid staff position.' }, 400);

      let user: AuthUser | null = null;
      let invited = false;
      if (action === 'assign') {
        const userId = String(body?.user_id || '').trim();
        if (!uuidPattern.test(userId)) return json({ error: 'Choose an existing account from the search results.' }, 400);
        const { data, error } = await service.auth.admin.getUserById(userId);
        if (error) throw error;
        user = data.user as AuthUser | null;
        if (!user) return json({ error: 'That account could not be found. Search again.' }, 404);
      } else {
        const email = String(body?.email || '').trim().toLowerCase();
        if (!emailPattern.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400);
        user = await findUserByEmail(service, email);
        if (!user) {
          const siteBase = `${origin}/kings-hockey-academy-site`;
          const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteBase}/parent-account.html` });
          if (error) {
            if (/already|registered|exists/i.test(error.message)) {
              user = await findUserByEmail(service, email);
              if (!user) return json({ error: 'An account may already exist, but it could not be found. Please retry shortly.' }, 409);
            } else throw error;
          } else {
            user = data.user as AuthUser;
            invited = true;
          }
        }
      }

      if (!user?.id) return json({ error: 'The account could not be resolved.' }, 500);
      if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
        return json({ error: 'This account is currently disabled. An administrator must enable it before assigning staff access.' }, 409);
      }
      await upsertMembership(service, user.id, teamSlug, group, staffRole, authData.user.id);
      return json({
        ok: true, user_id: user.id, email: user.email || '', team_slug: teamSlug,
        age_group: group, staff_role: staffRole, existing_account: !invited, invitation_sent: invited,
      });
    }

    if (action === 'set_active') {
      const id = String(body?.membership_id || '').trim();
      const isActive = body?.is_active;
      if (!uuidPattern.test(id) || typeof isActive !== 'boolean') return json({ error: 'A valid staff membership and status are required.' }, 400);
      const { error } = await service.from('team_staff_memberships').update({
        is_active: isActive, updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      return json({ ok: true, is_active: isActive });
    }

    if (action === 'remove') {
      const id = String(body?.membership_id || '').trim();
      if (!uuidPattern.test(id)) return json({ error: 'A valid staff membership is required.' }, 400);
      const { error } = await service.from('team_staff_memberships').delete().eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('manage-team-staff error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to manage team staff right now.' }, 500);
  }
});
