import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('SITE_ORIGIN');
const corsHeaders = {
  'Access-Control-Allow-Origin': origin ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async request => {
  if (!origin) return json({ error: 'Email updates are not configured.' }, 503);
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
  if (roleError || isAdmin !== true) return json({ error: 'This account is not approved to email family accounts.' }, 403);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('QUESTION_FROM_EMAIL');
  if (!apiKey || !from) return json({ error: 'The academy email service is not configured.' }, 503);

  try {
    const body = await request.json();
    const subject = String(body?.subject ?? '').trim().replace(/[\r\n]+/g, ' ');
    const message = String(body?.message ?? '').trim();
    const mailingAddress = String(body?.mailing_address ?? '').trim();
    if (subject.length < 3 || subject.length > 160 || !message || message.length > 8000 || mailingAddress.length < 8 || mailingAddress.length > 300) return json({ error: 'Enter a subject, message, and academy mailing address.' }, 400);
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: preferences, error: prefError } = await service.from('parent_email_preferences').select('user_id,unsubscribe_token').eq('marketing_opt_in', true);
    if (prefError) throw prefError;
    if (!preferences?.length) return json({ error: 'No family accounts have opted in to academy updates yet.' }, 409);

    const { data: admins, error: adminsError } = await caller.rpc('kha_admin_account_ids');
    if (adminsError) throw adminsError;
    const adminIds = new Set((admins || []).map((id: string) => id));
    const userEmails = new Map<string, string>();
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 50 });
      if (error) throw error;
      (data.users || []).forEach(user => {
        if (user.email && user.email_confirmed_at && !user.banned_until && !adminIds.has(user.id)) userEmails.set(user.id, user.email);
      });
      if (data.users.length < 50) break;
    }
    const recipients = preferences.flatMap(item => {
      const email = userEmails.get(item.user_id);
      if (!email) return [];
      const unsubscribe = `${url}/functions/v1/unsubscribe-family-updates?token=${encodeURIComponent(item.unsubscribe_token)}`;
      return [{ email, unsubscribe }];
    });
    if (!recipients.length) return json({ error: 'No confirmed, active family accounts have opted in to academy updates.' }, 409);
    if (recipients.length > 1000) return json({ error: 'This campaign exceeds the 1,000-recipient limit.' }, 413);

    const messages = recipients.map(recipient => ({
      from: `Kings Hockey Academy <${from}>`,
      to: [recipient.email],
      subject,
      text: `${message}\n\nKings Hockey Academy\nkingshockeyacademyns@gmail.com\n${mailingAddress}\n\nTo stop receiving academy program updates, unsubscribe here: ${recipient.unsubscribe}`,
      headers: {
        'List-Unsubscribe': `<${recipient.unsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));
    let accepted = 0;
    let failed = 0;
    for (let offset = 0; offset < messages.length; offset += 100) {
      const sent = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(offset, offset + 100)),
      });
      const count = Math.min(100, messages.length - offset);
      if (sent.ok) accepted += count;
      else {
        failed += count;
        console.error('Academy update batch rejected:', sent.status);
      }
    }
    return json({ ok: failed === 0, accepted, failed });
  } catch (error) {
    console.error('Family update email failed:', error);
    return json({ error: 'The email campaign could not be sent. Check the email service and try again.' }, 500);
  }
});
