import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const message = document.querySelector('[data-confirmation-message]');
const card = document.querySelector('[data-confirmation-card]');
const form = document.querySelector('[data-family-approval-form]');
let requestToken = new URLSearchParams(window.location.search).get('token') || '';
window.history.replaceState(null, '', window.location.pathname);
const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY;
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `alert${kind ? ` ${kind}` : ''}`;
  message.hidden = !text;
}

async function invoke(body) {
  const { data, error } = await client.functions.invoke('confirm-family-registration', { body });
  if (error || data?.error) throw new Error(data?.error || 'The approval request could not be loaded.');
  return data;
}

async function loadRequest() {
  if (!requestToken || !client) {
    showMessage('This approval link is invalid or expired. Contact the academy if you need a new one.', 'error');
    return;
  }
  try {
    const request = await invoke({ action: 'details', token: requestToken });
    document.querySelector('[data-confirmation-title]').textContent = `Registration for ${request.player_name}`;
    document.querySelector('[data-confirmation-program]').textContent = [request.program_title, request.season, request.location].filter(Boolean).join(' · ');
    document.querySelector('[data-confirmation-payment]').textContent = request.payment_summary;
    const waivers = Array.isArray(request.waivers) ? request.waivers : [];
    document.querySelector('[data-confirmation-waivers]').innerHTML = waivers.length ? waivers.map(waiver => `<article class="family-approval-waiver"><h3>${escapeHtml(waiver.title)}</h3><div>${escapeHtml(waiver.body).replace(/\r?\n/g, '<br>')}</div><label class="family-approval-checkbox"><input type="checkbox" name="waiver_${escapeHtml(waiver.id)}" value="1" required><span>I have read and agree to the ${escapeHtml(waiver.title)}.</span></label></article>`).join('') : '<p>No additional waivers are required for this program.</p>';
    card.hidden = false;
    showMessage('Review every item and check the boxes to approve the registration.', 'success');
  } catch (error) { showMessage(error.message, 'error'); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = new FormData(form);
  const waiverConsents = Object.fromEntries([...form.querySelectorAll('[name^="waiver_"]')].map(input => [input.name.slice(7), input.checked]));
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await invoke({
      action: 'approve',
      token: requestToken,
      registration_consent: values.get('registration_consent') === 'on',
      payment_terms_accepted: values.get('payment_terms_accepted') === 'on',
      waiver_consents: waiverConsents,
    });
    card.hidden = true;
    showMessage('Thank you. The player registration is confirmed, and the academy will follow up by email.', 'success');
    requestToken = '';
  } catch (error) {
    showMessage(error.message, 'error');
    submit.disabled = false;
  }
});

loadRequest();
