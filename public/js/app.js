import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') &&
  window.KHA_SUPABASE_PUBLISHABLE_KEY &&
  !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
document.querySelectorAll('input[name="birth_year"]').forEach(input => {
  input.min = String(new Date().getFullYear() - 25);
  input.max = String(new Date().getFullYear());
  input.placeholder = `e.g. ${new Date().getFullYear() - 12}`;
});
const message = (form, text, kind) => {
  const box = form.querySelector('[data-form-message]');
  box.textContent = text;
  box.className = `alert ${kind}`;
  box.hidden = false;
};

document.querySelectorAll('[data-registration-form]').forEach(form => {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.elements.website.value) { message(form, 'Thanks — your registration inquiry has been received. We’ll be in touch soon.', 'success'); form.reset(); return; }
    if (!client) { message(form, 'The form is being set up. Please email kingshockeyacademyns@gmail.com for help.', 'error'); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    const birthYear = Number(data.birth_year);
    if (birthYear < new Date().getFullYear() - 25 || birthYear > new Date().getFullYear()) {
      message(form, 'Please enter a valid player birth year.', 'error'); return;
    }
    let error;
    try {
      ({ error } = await client.from('registrations').insert({
        program_type: data.program_type, player_first: data.player_first.trim(), player_last: data.player_last.trim(),
        birth_year: birthYear, guardian_name: data.guardian_name.trim(), email: data.email.trim(), phone: data.phone.trim(),
        town: data.town.trim() || null, experience: data.experience || '', notes: data.notes.trim() || null, consent: data.consent === '1'
      }));
    } catch { error = true; }
    if (error) { message(form, 'We couldn’t save your form just now. Please email kingshockeyacademyns@gmail.com for help.', 'error'); return; }
    form.reset();
    message(form, 'Thanks — your registration inquiry has been received. We’ll be in touch soon.', 'success');
  });
});

document.querySelectorAll('[data-question-form]').forEach(form => {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.elements.website.value) { message(form, 'Thank you. Your question has been sent to Kings Hockey Academy.', 'success'); form.reset(); return; }
    if (!client) { message(form, 'The form is being set up. Please email kingshockeyacademyns@gmail.com directly.', 'error'); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    let error;
    try {
      ({ error } = await client.functions.invoke('send-question', { body: {
        full_name: data.full_name.trim(), email: data.email.trim(), question: data.question.trim()
      }}));
    } catch { error = true; }
    if (error) { message(form, 'Your question could not be sent right now. Please email kingshockeyacademyns@gmail.com directly.', 'error'); return; }
    form.reset();
    message(form, 'Thank you. Your question has been sent to Kings Hockey Academy.', 'success');
  });
});
