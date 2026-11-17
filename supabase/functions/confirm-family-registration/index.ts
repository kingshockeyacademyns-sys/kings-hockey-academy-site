import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('SITE_ORIGIN') || 'https://kingshockeyacademyns-sys.github.io';
const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

function paymentSummary(program: Record<string, any>) {
  const raw = String(program.fee ?? '').trim();
  const numeric = raw.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const total = numeric && Number.isFinite(Number(numeric)) ? Number(numeric) : null;
  const sessions = Number(program.session_count);
  const singlePayment = program.single_session_available && total !== null && Number.isInteger(sessions) && sessions > 0
    ? Math.round((total / sessions + Number.EPSILON) * 100) / 100
    : null;
  const minimum = program.single_session_available ? singlePayment : 100;
  const money = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
  const fullText = total === null ? (raw || 'Contact the academy') : money(total);
  const minimumText = minimum === null ? 'Contact the academy to confirm the required minimum payment' : money(minimum);
  const balanceText = total === null || minimum === null ? 'Contact the academy to confirm' : money(Math.max(0, total - minimum));
  const paymentCopy = minimum === null
    ? 'Contact the academy to confirm the required minimum payment'
    : minimum === 100
      ? 'Send the CAD $100 deposit by e-transfer'
      : `Send a minimum payment of ${money(minimum)} by e-transfer`;
  return `Full program cost: ${fullText}. Minimum payment to reserve a spot: ${minimumText}. Remaining balance after minimum payment: ${balanceText}. ${paymentCopy} to kingshockeyacademyns@gmail.com. The remaining balance may be paid by e-transfer or cash no later than the second session.`;
}

async function tokenHash(value: unknown) {
  const token = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  if (request.headers.get('Origin') !== origin) return json({ error: 'This page is not allowed to confirm registrations.' }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'The registration approval service is unavailable.' }, 503);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const body = await request.json();
    const hash = await tokenHash(body?.token);
    if (!hash) return json({ error: 'This approval link is invalid or expired. Contact the academy if you need a new one.' }, 400);
    if (body?.action === 'details') {
      const { data: approval, error } = await service.from('registration_approval_requests')
        .select('parent_id,player_id,program_id,status,expires_at,program_snapshot,waiver_snapshot')
        .eq('token_hash', hash).maybeSingle();
      if (error) throw error;
      if (!approval || approval.status !== 'pending') return json({ error: 'This approval request is no longer available. Contact the academy if you need a new one.' }, 404);
      if (new Date(approval.expires_at).getTime() <= Date.now()) {
        await service.from('registration_approval_requests').update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('token_hash', hash).eq('status', 'pending');
        return json({ error: 'This approval request has expired. Contact the academy for a new request.' }, 410);
      }
      const [{ data: player, error: playerError }, { data: account, error: accountError }] = await Promise.all([
        service.from('parent_children').select('id,parent_id,first_name,last_name').eq('id', approval.player_id).maybeSingle(),
        service.auth.admin.getUserById(approval.parent_id),
      ]);
      if (playerError) throw playerError;
      if (accountError) throw accountError;
      if (!player || player.parent_id !== approval.parent_id || !account.user?.email_confirmed_at || (account.user.banned_until && new Date(account.user.banned_until).getTime() > Date.now())) {
        return json({ error: 'This family account can no longer approve the request. Contact the academy for help.' }, 410);
      }
      const program = approval.program_snapshot || {};
      const waivers = Array.isArray(approval.waiver_snapshot) ? approval.waiver_snapshot : [];
      return json({
        player_name: `${player.first_name} ${player.last_name}`,
        program_title: program.title || 'Program',
        season: program.season || '',
        location: program.location || '',
        payment_summary: paymentSummary(program),
        waivers: waivers.map((item: Record<string, any>) => ({ id: String(item.id), title: item.title, body: item.body })),
      });
    }

    if (body?.action === 'approve') {
      const { data, error } = await service.rpc('approve_family_registration_request', {
        p_token_hash: hash,
        p_registration_consent: body?.registration_consent === true,
        p_payment_terms_accepted: body?.payment_terms_accepted === true,
        p_waiver_consents: body?.waiver_consents && typeof body.waiver_consents === 'object' ? body.waiver_consents : {},
      });
      if (error) {
        const message = /no longer available|expired|waivers|terms|changed|completed|closed|eligible|family account/i.test(error.message)
          ? error.message
          : 'The registration could not be confirmed. Contact the academy for help.';
        return json({ error: message }, 400);
      }
      return json({ ok: true, registration_id: data?.registration_id });
    }
    return json({ error: 'Unsupported approval action.' }, 400);
  } catch (error) {
    console.error('Family registration confirmation failed:', error);
    return json({ error: 'The approval request could not be completed. Contact the academy for help.' }, 500);
  }
});
