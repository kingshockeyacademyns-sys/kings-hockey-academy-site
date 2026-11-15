import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('SITE_ORIGIN') || 'https://kingshockeyacademyns-sys.github.io';
const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async request => {
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
    const action = String(body?.action ?? 'send');
    const messageType = String(body?.message_type ?? 'announcement');
    if (!['program_update', 'announcement'].includes(messageType)) return json({ error: 'Choose a valid message type.' }, 400);
    const subject = String(body?.subject ?? '').trim().replace(/[\r\n]+/g, ' ');
    const message = String(body?.message ?? '').trim();
    const mailingAddress = String(body?.mailing_address ?? '').trim();
    const programId = String(body?.program_id ?? '');
    if (action === 'send' && (subject.length < 3 || subject.length > 160 || !message || message.length > 8000 || mailingAddress.length < 8 || mailingAddress.length > 300)) return json({ error: 'Enter a subject, message, and academy mailing address.' }, 400);

    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    let recipients: Array<{ email: string; unsubscribe?: string }> = [];
    let programTitle = '';

    if (messageType === 'program_update') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(programId)) return json({ error: 'Choose a program.' }, 400);
      const [{ data: program, error: programError }, { data: registrations, error: registrationError, count }] = await Promise.all([
        service.from('programs').select('title').eq('id', programId).maybeSingle(),
        service.from('registrations').select('email,second_guardian_email', { count: 'exact' }).eq('program_id', programId).range(0, 999),
      ]);
      if (programError) throw programError;
      if (registrationError) throw registrationError;
      if (!program) return json({ error: 'That program could not be found.' }, 404);
      programTitle = program.title;
      if ((count || 0) > 1000) return json({ error: 'This program has more than 1,000 registered email addresses. Narrow the recipient list before sending.' }, 413);
      const unique = new Set<string>();
      (registrations || []).flatMap(row => [row.email, row.second_guardian_email]).forEach(value => {
        const email = String(value || '').trim().toLowerCase();
        if (emailPattern.test(email)) unique.add(email);
      });
      recipients = [...unique].map(email => ({ email }));
    } else {
      const [{ data: preferences, error: prefError }, { data: admins, error: adminsError }] = await Promise.all([
        service.from('parent_email_preferences').select('user_id,unsubscribe_token').eq('marketing_opt_in', true),
        caller.rpc('kha_admin_account_ids'),
      ]);
      if (prefError) throw prefError;
      if (adminsError) throw adminsError;
      const adminIds = new Set((admins || []).map((id: string) => id));
      const optedIn = new Map((preferences || []).map(item => [item.user_id, item.unsubscribe_token]));
      const userEmails = new Map<string, string>();
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        (data.users || []).forEach(user => {
          if (user.email && user.email_confirmed_at && !user.banned_until && !adminIds.has(user.id) && optedIn.has(user.id)) userEmails.set(user.id, user.email);
        });
        if (data.users.length < 50) break;
      }
      recipients = [...userEmails.entries()].flatMap(([userId, email]) => {
        const unsubscribeToken = optedIn.get(userId);
        if (!unsubscribeToken) return [];
        const unsubscribe = `${url}/functions/v1/unsubscribe-family-updates?token=${encodeURIComponent(unsubscribeToken)}`;
        return [{ email, unsubscribe }];
      });
    }

    if (action === 'audience') return json({ count: recipients.length, message_type: messageType, program_title: programTitle });
    if (action !== 'send') return json({ error: 'Unsupported message action.' }, 400);
    if (!recipients.length) return json({ error: messageType === 'program_update' ? 'There are no valid parent email addresses on registrations for this program.' : 'No active families have opted in to academy news and new-program announcements.' }, 409);
    if (recipients.length > 1000) return json({ error: 'This message exceeds the 1,000-recipient limit.' }, 413);

    const messages = recipients.map(recipient => {
      const footer = messageType === 'program_update'
        ? `This factual program notice is being sent because this email address is on a registration for ${programTitle}.`
        : `To stop receiving academy news and new-program announcements, unsubscribe here: ${recipient.unsubscribe}`;
      const headers = recipient.unsubscribe ? {
        'List-Unsubscribe': `<${recipient.unsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      } : undefined;
      return {
        from: `Kings Hockey Academy <${from}>`,
        to: [recipient.email],
        subject,
        text: `${message}\n\n${footer}\n\nKings Hockey Academy\nkingshockeyacademyns@gmail.com\n${mailingAddress}${recipient.unsubscribe ? `\n\n${recipient.unsubscribe}` : ''}`,
        ...(headers ? { headers } : {}),
      };
    });
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
    return json({ ok: failed === 0, accepted, failed, message_type: messageType });
  } catch (error) {
    console.error('Family update email failed:', error);
    return json({ error: 'The email could not be sent. Check the email service and try again.' }, 500);
  }
});
