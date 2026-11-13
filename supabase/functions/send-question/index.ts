const allowedOrigin = Deno.env.get('SITE_ORIGIN');
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (!allowedOrigin) return new Response('Email service is not configured.', { status: 503 });
  if (request.headers.get('Origin') !== allowedOrigin) return new Response('Origin not allowed.', { status: 403, headers: corsHeaders });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const { full_name, email, question } = await request.json();
    const name = String(full_name ?? '').trim().replace(/[\r\n]+/g, ' ');
    const replyTo = String(email ?? '').trim();
    const message = String(question ?? '').trim();
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) || replyTo.length > 254 || !message || message.length > 5000) {
      return new Response(JSON.stringify({ error: 'Invalid question details.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('QUESTION_FROM_EMAIL');
    if (!apiKey || !from) return new Response('Email service is not configured.', { status: 503, headers: corsHeaders });

    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Kings Hockey Academy Website <${from}>`,
        to: ['kingshockeyacademyns@gmail.com'],
        reply_to: replyTo,
        subject: 'Website question for Kings Hockey Academy',
        text: `A question was sent through the Kings Hockey Academy website.\n\nFull name: ${name}\nEmail address: ${replyTo}\n\nQuestion:\n${message}\n`,
      }),
    });
    if (!sent.ok) {
      console.error('Email provider rejected a website question:', sent.status);
      return new Response('Email could not be sent.', { status: 502, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Question handler failed:', error);
    return new Response('Invalid request.', { status: 400, headers: corsHeaders });
  }
});
