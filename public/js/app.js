import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') &&
  window.KHA_SUPABASE_PUBLISHABLE_KEY &&
  !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

function wireRegistrationForm(form) {
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
      const submission = {
        program_type: data.program_type, player_first: data.player_first.trim(), player_last: data.player_last.trim(),
        birth_year: birthYear, guardian_name: data.guardian_name.trim(), email: data.email.trim(), phone: data.phone.trim(),
        town: data.town.trim() || null, experience: data.experience || '', notes: data.notes.trim() || null, consent: data.consent === '1'
      };
      if (data.program_id) {
        submission.program_id = data.program_id;
        submission.custom_answers = Object.fromEntries([...form.querySelectorAll('[data-program-answer]')].map(input => [input.dataset.programAnswer, input.value.trim()]));
      }
      ({ error } = await client.from('registrations').insert(submission));
    } catch { error = true; }
    if (error) { message(form, 'We couldn’t save your form just now. Please email kingshockeyacademyns@gmail.com for help.', 'error'); return; }
    form.reset();
    message(form, 'Thanks — your registration inquiry has been received. We’ll be in touch soon.', 'success');
  });
}

document.querySelectorAll('[data-registration-form]').forEach(wireRegistrationForm);

async function loadPublicPrograms() {
  const list = document.querySelector('[data-dynamic-programs]');
  if (!list) return;
  if (!client) { list.hidden = true; return; }
  const { data, error } = await client.from('programs').select('id,title,season,description,dates,location,age_groups,fee,jersey_size_enabled').eq('is_open', true).order('created_at', { ascending: false });
  if (error || !data?.length) { list.hidden = true; return; }
  list.innerHTML = data.map((program, index) => {
    const details = [program.dates, program.location, program.age_groups, program.fee, program.jersey_size_enabled ? 'Optional jersey size' : null].filter(Boolean).map(escapeHtml).join(' · ');
    return `<article class="program-card ${index % 2 ? 'program-card-blue' : 'program-card-gold'}"><span class="number">${escapeHtml(program.season || 'NOW REGISTERING')}</span><div class="path-icon">✳</div><h3>${escapeHtml(program.title)}</h3><p>${escapeHtml(program.description || 'Registration is open. Submit the form and the academy will follow up.')}</p>${details ? `<p class="dynamic-program-card-details">${details}</p>` : ''}<a class="button button-gold" href="program-registration.html?id=${encodeURIComponent(program.id)}">REGISTER <b>↗</b></a></article>`;
  }).join('');
}

function renderDynamicForm(program) {
  const root = document.querySelector('[data-dynamic-form-root]');
  if (!root) return;
  const questions = Array.isArray(program.questions) ? program.questions : [];
  const additional = questions.map((question, index) => `<label>${escapeHtml(question)}<textarea name="extra_${index}" data-program-answer="${index}" rows="2" maxlength="1000"></textarea></label>`).join('');
  const jerseySize = program.jersey_size_enabled ? `<label>Jersey size (optional)<select name="jersey_size" data-program-answer="Jersey size (optional)"><option value="">Choose a size (optional)</option><option>Youth XS</option><option>Youth S</option><option>Youth M</option><option>Youth L</option><option>Youth XL</option><option>Adult XS</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option></select></label>` : '';
  root.innerHTML = `<div class="alert" data-form-message hidden role="status"></div><form data-registration-form class="registration-form"><div class="trap" aria-hidden="true"><label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div><input type="hidden" name="program_id" value="${escapeHtml(program.id)}"><input type="hidden" name="program_type" value="${escapeHtml(program.title)}"><div class="form-title"><span>PLAYER / FAMILY DETAILS</span><span>* REQUIRED</span></div><label>I'm interested in <b>*</b><input value="${escapeHtml(program.title)}" readonly></label><div class="form-row"><label>Player first name <b>*</b><input name="player_first" maxlength="80" autocomplete="given-name" required></label><label>Player last name <b>*</b><input name="player_last" maxlength="80" autocomplete="family-name" required></label></div><div class="form-row"><label>Player birth year <b>*</b><input name="birth_year" type="number" min="${new Date().getFullYear()-25}" max="${new Date().getFullYear()}" placeholder="e.g. ${new Date().getFullYear()-12}" required></label><label>Parent / guardian name <b>*</b><input name="guardian_name" maxlength="120" autocomplete="name" required></label></div><div class="form-row"><label>Email <b>*</b><input name="email" type="email" maxlength="254" autocomplete="email" required></label><label>Phone <b>*</b><input name="phone" type="tel" maxlength="40" autocomplete="tel" required></label></div><div class="form-row"><label>Town / community<input name="town" maxlength="120" autocomplete="address-level2"></label><label>Playing experience<select name="experience"><option value="">Choose one (optional)</option><option>New to hockey</option><option>Learn to skate / play</option><option>Recreational</option><option>Competitive</option></select></label></div>${jerseySize}${additional}<label>Anything else you’d like us to know?<textarea name="notes" rows="3" maxlength="3000"></textarea></label><label class="consent"><input type="checkbox" name="consent" value="1" required><span>I am the parent/guardian or adult participant, and I agree Kings Hockey Academy may use these details to respond to this inquiry. <b>*</b></span></label><button class="button button-gold submit" type="submit">SEND REGISTRATION REQUEST <b>↗</b></button><small class="form-security">Your information is sent to Kings Hockey Academy for registration follow-up.</small></form>`;
  wireRegistrationForm(root.querySelector('[data-registration-form]'));
}

async function loadDynamicRegistration() {
  if (!document.querySelector('[data-dynamic-registration]')) return;
  const root = document.querySelector('[data-dynamic-form-root]');
  if (!client) { root.textContent = 'The registration form is not available right now. Please email kingshockeyacademyns@gmail.com for help.'; return; }
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { root.textContent = 'This program link is missing its registration details. Return to Camps & Programs and choose a program.'; return; }
  const { data, error } = await client.from('programs').select('*').eq('id', id).eq('is_open', true).maybeSingle();
  if (error || !data) { root.textContent = 'This registration is closed or unavailable. Return to Camps & Programs to see open programs.'; return; }
  document.querySelector('[data-program-title]').textContent = data.title.toUpperCase();
  document.querySelector('[data-program-season]').textContent = data.season || 'PROGRAM REGISTRATION';
  document.querySelector('[data-program-description]').textContent = data.description || 'Submit the form below and the academy will follow up with details and next steps.';
  const facts = [data.dates, data.location, data.age_groups, data.fee].filter(Boolean);
  document.querySelector('[data-program-facts]').textContent = facts.join(' · ');
  renderDynamicForm(data);
}

loadPublicPrograms();
loadDynamicRegistration();

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
