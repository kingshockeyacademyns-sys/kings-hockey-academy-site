import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const page = (text: string, status = 200) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Email preferences | Kings Hockey Academy</title><body style="font:16px Arial,sans-serif;max-width:620px;margin:12vh auto;padding:24px;color:#201d19"><h1>Kings Hockey Academy</h1><p>${text}</p></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async request => {
  if (request.method !== 'GET' && request.method !== 'POST') return page('This link is not available.', 405);
  const url = new URL(request.url);
  let token = url.searchParams.get('token') || '';
  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = new URLSearchParams(await request.text());
      token = form.get('token') || token;
    } else {
      const body = await request.json().catch(() => ({}));
      token = String(body?.token || token);
    }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return page('This unsubscribe link is invalid or expired.', 400);
  if (request.method === 'GET') {
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Email preferences | Kings Hockey Academy</title><body style="font:16px Arial,sans-serif;max-width:620px;margin:12vh auto;padding:24px;color:#201d19"><h1>Kings Hockey Academy</h1><p>Stop receiving academy program updates at this email address?</p><form method="post"><input type="hidden" name="token" value="${token}"><button style="padding:12px 18px;background:#111;color:#fff;border:0;cursor:pointer" type="submit">Unsubscribe from updates</button></form></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !serviceKey) return page('Email preferences are temporarily unavailable. Please contact kingshockeyacademyns@gmail.com.', 503);
  const service = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await service.from('parent_email_preferences').update({ marketing_opt_in: false, updated_at: new Date().toISOString() }).eq('unsubscribe_token', token).select('user_id').maybeSingle();
  if (error) {
    console.error('Unsubscribe update failed:', error);
    return page('Email preferences are temporarily unavailable. Please try again later.', 503);
  }
  if (!data) return page('This unsubscribe link is invalid or has already been used.', 404);
  return page('You have been unsubscribed from academy program updates. You may still receive messages about registrations you have submitted.');
});
