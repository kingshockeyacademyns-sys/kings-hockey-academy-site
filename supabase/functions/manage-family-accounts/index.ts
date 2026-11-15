import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('SITE_ORIGIN');
const corsHeaders = {
  'Access-Control-Allow-Origin': origin ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async request => {
  if (!origin) return json({ error: 'Account management is not configured.' }, 503);
  if (request.headers.get('Origin') !== origin) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !url || !anonKey || !serviceKey) return json({ error: 'Sign in as an administrator to continue.' }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Your admin session has expired. Sign in again.' }, 401);
  const { data: isAdmin, error: roleError } = await caller.rpc('kha_is_admin');
  if (roleError || isAdmin !== true) return json({ error: 'This account is not approved to manage family accounts.' }, 403);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const body = await request.json();
    const action = String(body?.action ?? '');
    if (action === 'list') {
      const users: Array<Record<string, any>> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 50) break;
      }
      const { data: admins, error: adminError } = await caller.rpc('kha_admin_account_ids');
      if (adminError) throw adminError;
      const adminIds = new Set((admins || []).map((id: string) => id));
      const counts = new Map<string, number>();
      const ids = users.map(user => String(user.id));
      for (let offset = 0; offset < ids.length; offset += 500) {
        const { data: children, error } = await service.from('parent_children').select('parent_id').in('parent_id', ids.slice(offset, offset + 500));
        if (error) throw error;
        (children || []).forEach(child => counts.set(child.parent_id, (counts.get(child.parent_id) || 0) + 1));
      }
      const { data: preferences, error: preferenceError } = await service.from('parent_email_preferences').select('user_id,marketing_opt_in');
      if (preferenceError) throw preferenceError;
      const optedIn = new Set((preferences || []).filter(item => item.marketing_opt_in).map(item => item.user_id));
      const now = Date.now();
      return json({ users: users.map(user => ({
        id: user.id,
        email: user.email || '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_confirmed: Boolean(user.email_confirmed_at),
        disabled: Boolean(user.banned_until && new Date(user.banned_until).getTime() > now),
        is_admin: adminIds.has(String(user.id)),
        child_count: counts.get(String(user.id)) || 0,
        email_updates: optedIn.has(String(user.id)),
      })) });
    }

    if (action === 'invite') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!emailPattern.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400);
      const siteBase = `${origin.replace(/\/$/, '')}/kings-hockey-academy-site`;
      const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteBase}/parent-account.html` });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) return json({ error: 'An account already exists for that email.' }, 409);
        throw error;
      }
      return json({ ok: true, id: data.user?.id, email });
    }

    const userId = String(body?.user_id ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return json({ error: 'Select a valid account.' }, 400);
    if (userId === authData.user.id) return json({ error: 'You cannot change your own administrator account here.' }, 400);
    const { data: admins, error: adminsError } = await caller.rpc('kha_admin_account_ids');
    if (adminsError) throw adminsError;
    if ((admins || []).includes(userId)) return json({ error: 'Administrator accounts are protected from family-account actions.' }, 403);
    if (action === 'disable' || action === 'enable') {
      const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: action === 'disable' ? '876000h' : 'none' });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'delete') {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: 'Unsupported account action.' }, 400);
  } catch (error) {
    console.error('Family account action failed:', error);
    return json({ error: 'The account action could not be completed. Try again or contact the site administrator.' }, 500);
  }
});
