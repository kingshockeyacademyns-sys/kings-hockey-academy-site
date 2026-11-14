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
  const box = form.closest('.form-wrap')?.querySelector('[data-form-message]') || form.querySelector('[data-form-message]');
  box.textContent = text;
  box.className = `alert ${kind}`;
  box.hidden = false;
};

function wireRegistrationForm(form) {
  if (form.hasAttribute('data-multistep-registration')) {
    wireMultistepRegistrationForm(form);
    return;
  }
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
        submission.waiver_consents = Object.fromEntries([...form.querySelectorAll('[data-waiver-consent]')].map(input => [input.dataset.waiverConsent, input.checked]));
      }
      ({ error } = await client.from('registrations').insert(submission));
    } catch { error = true; }
    if (error) { message(form, 'We couldn’t save your form just now. Please email kingshockeyacademyns@gmail.com for help.', 'error'); return; }
    form.reset();
    message(form, 'Thanks — your registration inquiry has been received. We’ll be in touch soon.', 'success');
  });
}

function wireMultistepRegistrationForm(form) {
  const steps = [...form.querySelectorAll('[data-registration-step]')];
  const stepLabel = form.querySelector('[data-registration-step-label]');
  let activeStep = 0;
  const resetForm = () => {
    form.reset();
    form.querySelectorAll('[data-second-guardian-field]').forEach(field => { field.required = false; });
    showStep(0);
  };
  const showStep = index => {
    activeStep = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => { step.hidden = stepIndex !== activeStep; });
    stepLabel.textContent = `STEP ${activeStep + 1} OF ${steps.length} · ${steps[activeStep].dataset.stepName}`;
    form.querySelector('[data-step-back]').hidden = activeStep === 0;
    form.querySelector('[data-step-next]').hidden = activeStep === steps.length - 1;
    form.querySelector('[data-step-submit]').hidden = activeStep !== steps.length - 1;
    if (activeStep === steps.length - 1) renderRegistrationReview(form);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  form.querySelector('[data-step-next]').addEventListener('click', () => {
    const activeFields = [...steps[activeStep].querySelectorAll('input,select,textarea')];
    if (activeFields.some(field => !field.checkValidity())) {
      activeFields.find(field => !field.checkValidity())?.reportValidity();
      return;
    }
    showStep(activeStep + 1);
  });
  form.querySelector('[data-step-back]').addEventListener('click', () => showStep(activeStep - 1));
  const secondGuardianFields = [...form.querySelectorAll('[data-second-guardian-field]')];
  const syncSecondGuardianRequirements = () => {
    const started = secondGuardianFields.some(field => field.value.trim());
    secondGuardianFields.forEach(field => { field.required = started; });
  };
  secondGuardianFields.forEach(field => {
    field.addEventListener('input', syncSecondGuardianRequirements);
    field.addEventListener('change', syncSecondGuardianRequirements);
  });
  form.querySelectorAll('input,select,textarea').forEach(field => field.addEventListener('input', () => {
    if (activeStep === steps.length - 1) renderRegistrationReview(form);
  }));
  form.querySelectorAll('input[type=checkbox],select').forEach(field => field.addEventListener('change', () => {
    if (activeStep === steps.length - 1) renderRegistrationReview(form);
  }));
  showStep(0);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (activeStep !== steps.length - 1) return;
    if (form.elements.website.value) { resetForm(); message(form, 'Thanks — your registration request has been received. We’ll be in touch soon.', 'success'); return; }
    if (!client) { message(form, 'The form is being set up. Please email kingshockeyacademyns@gmail.com for help.', 'error'); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    const dob = new Date(`${data.date_of_birth}T00:00:00`);
    const birthYear = dob.getFullYear();
    if (!data.date_of_birth || Number.isNaN(dob.getTime()) || dob > new Date() || dob < new Date(new Date().getFullYear() - 25, new Date().getMonth(), new Date().getDate())) {
      message(form, 'Enter a valid date of birth for the player.', 'error');
      showStep(0);
      form.elements.date_of_birth.focus();
      return;
    }
    let error;
    try {
      const guardianName = `${data.guardian_first.trim()} ${data.guardian_last.trim()}`.trim();
      const submission = {
        program_id: data.program_id, program_type: data.program_type,
        player_first: data.player_first.trim(), player_last: data.player_last.trim(), birth_year: birthYear,
        date_of_birth: data.date_of_birth, player_address: data.player_address.trim(), player_postal_code: data.player_postal_code.trim(), player_province: data.player_province.trim(), allergies: data.allergies.trim() || null,
        jersey_number: data.jersey_number?.trim() || null,
        guardian_first: data.guardian_first.trim(), guardian_last: data.guardian_last.trim(),
        guardian_name: guardianName, guardian_address: data.guardian_address.trim(), guardian_postal_code: data.guardian_postal_code.trim(), guardian_province: data.guardian_province.trim(),
        email: data.email.trim(), phone: data.phone.trim(),
        second_guardian_first: data.second_guardian_first?.trim() || null,
        second_guardian_last: data.second_guardian_last?.trim() || null,
        second_guardian_email: data.second_guardian_email?.trim() || null,
        second_guardian_phone: data.second_guardian_phone?.trim() || null,
        second_guardian_address: data.second_guardian_address?.trim() || null,
        second_guardian_postal_code: data.second_guardian_postal_code?.trim() || null,
        second_guardian_province: data.second_guardian_province?.trim() || null,
        emergency_name: data.emergency_name.trim(), emergency_relationship: data.emergency_relationship.trim(), emergency_phone: data.emergency_phone.trim(),
        town: null, experience: data.experience || '', notes: data.notes.trim() || null,
        consent: data.consent === '1', payment_terms_accepted: data.payment_terms_accepted === '1',
        custom_answers: Object.fromEntries([...form.querySelectorAll('[data-program-answer]')].map(input => [input.dataset.programAnswer, input.value.trim()])),
        waiver_consents: Object.fromEntries([...form.querySelectorAll('[data-waiver-consent]')].map(input => [input.dataset.waiverConsent, input.checked]))
      };
      ({ error } = await client.from('registrations').insert(submission));
    } catch { error = true; }
    if (error) { message(form, 'We couldn’t save your form just now. Please email kingshockeyacademyns@gmail.com for help.', 'error'); return; }
    resetForm();
    message(form, 'Registration request received. Your spot is confirmed once the CAD $100 deposit is received by e-transfer.', 'success');
  });
}

document.querySelectorAll('[data-registration-form]').forEach(wireRegistrationForm);

async function loadPublicPrograms() {
  const list = document.querySelector('[data-dynamic-programs]');
  if (!list) return;
  if (!client) { list.hidden = true; return; }
  const { data, error } = await client.from('programs').select('id,title,season,description,dates,location,age_groups,fee,jersey_size_enabled,jersey_number_enabled').eq('is_open', true).order('created_at', { ascending: false });
  const openPrograms = error ? [] : (data || []);
  document.querySelectorAll('[data-season-card]').forEach(card => {
    const key = card.dataset.seasonCard;
    const program = openPrograms.find(item => {
      const season = String(item.season || '').toLowerCase();
      return key === 'fall-winter' ? /fall|winter/.test(season) : /spring|summer/.test(season);
    });
    const link = card.querySelector('[data-season-link]');
    if (!link) return;
    if (!program) {
      const button = document.createElement('button');
      button.className = 'button button-light';
      button.type = 'button';
      button.disabled = true;
      button.textContent = 'NO REGISTRATIONS AVAILABLE';
      link.replaceWith(button);
      return;
    }
    const seasonLabel = key === 'fall-winter' ? 'REGISTER FOR A FALL OR WINTER CAMP' : 'REGISTER FOR A SPRING OR SUMMER CAMP';
    const button = document.createElement('a');
    button.className = 'button button-gold';
    button.href = `program-registration.html?id=${encodeURIComponent(program.id)}`;
    button.innerHTML = `${seasonLabel} <b>↗</b>`;
    link.replaceWith(button);
  });
  if (!openPrograms.length) { list.hidden = true; return; }
  list.innerHTML = openPrograms.map((program, index) => {
    const details = [program.dates, program.location, program.age_groups, program.fee, program.jersey_size_enabled ? 'Optional jersey size' : null, program.jersey_number_enabled ? 'Optional jersey number' : null].filter(Boolean).map(escapeHtml).join(' · ');
    return `<article class="program-card ${index % 2 ? 'program-card-blue' : 'program-card-gold'}"><span class="number">${escapeHtml(program.season || 'NOW REGISTERING')}</span><div class="path-icon">✳</div><h3>${escapeHtml(program.title)}</h3><p>${escapeHtml(program.description || 'Registration is open. Submit the form and the academy will follow up.')}</p>${details ? `<p class="dynamic-program-card-details">${details}</p>` : ''}<a class="button button-gold" href="program-registration.html?id=${encodeURIComponent(program.id)}">REGISTER <b>↗</b></a></article>`;
  }).join('');
}

function formatCAD(value) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function programCost(program) {
  const raw = String(program.fee ?? '').trim();
  const numeric = raw.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const parsed = Number(numeric);
  return numeric && Number.isFinite(parsed) ? parsed : null;
}

function renderRegistrationReview(form) {
  const review = form.querySelector('[data-registration-review]');
  if (!review) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const program = form._selectedProgram;
  const value = (label, item) => item ? `<div class="review-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(item)}</dd></div>` : '';
  const section = (title, rows) => `<section class="review-section"><h3>${escapeHtml(title)}</h3><dl>${rows.join('') || '<div class="review-item"><dd>None provided</dd></div>'}</dl></section>`;
  const playerRows = [
    value('Player', `${data.player_first || ''} ${data.player_last || ''}`.trim()),
    value('Date of birth', data.date_of_birth), value('Jersey number', data.jersey_number),
    value('Street & number', data.player_address), value('Post code', data.player_postal_code), value('Province', data.player_province), value('Allergies / medical notes', data.allergies),
    value('Jersey size', data.jersey_size), value('Playing experience', data.experience), value('Additional notes', data.notes)
  ];
  const questions = [...form.querySelectorAll('[data-program-answer]')].map(input => {
    const label = input.dataset.programAnswer;
    const question = /^\d+$/.test(label) ? (program?.questions?.[Number(label)] || `Extra question ${Number(label) + 1}`) : label;
    return value(question, input.value);
  });
  playerRows.push(...questions);
  const parentRows = [
    value('Parent / guardian', `${data.guardian_first || ''} ${data.guardian_last || ''}`.trim()),
    value('Email', data.email), value('Phone', data.phone),
    value('Street & number', data.guardian_address), value('Post code', data.guardian_postal_code), value('Province', data.guardian_province)
  ];
  if (data.second_guardian_first || data.second_guardian_last || data.second_guardian_email || data.second_guardian_phone || data.second_guardian_address || data.second_guardian_postal_code || data.second_guardian_province) {
    parentRows.push(value('Second parent / guardian', `${data.second_guardian_first || ''} ${data.second_guardian_last || ''}`.trim()));
    parentRows.push(value('Second parent email', data.second_guardian_email), value('Second parent phone', data.second_guardian_phone));
    parentRows.push(value('Second parent street & number', data.second_guardian_address), value('Second parent post code', data.second_guardian_postal_code), value('Second parent province', data.second_guardian_province));
  }
  const emergencyRows = [
    value('Contact', data.emergency_name), value('Relationship', data.emergency_relationship), value('Phone', data.emergency_phone)
  ];
  const waivers = [...form.querySelectorAll('[data-waiver-consent]')].map(input => {
    const title = input.closest('.registration-waiver')?.querySelector('h3')?.textContent || 'Waiver';
    return value(title, input.checked ? 'Agreed' : 'Not agreed');
  });
  const total = program ? programCost(program) : null;
  const cost = total === null ? (program?.fee || 'Contact the academy') : formatCAD(total);
  const balance = total === null ? 'See full cost above' : formatCAD(Math.max(0, total - 100));
  const programFacts = [program?.dates, program?.location, program?.age_groups].filter(Boolean).join(' · ');
  review.innerHTML = `<div class="review-program"><span>SELECTED PROGRAM</span><strong>${escapeHtml(program?.title || '')}</strong><span>${escapeHtml(program?.season || '')}</span>${programFacts ? `<small>${escapeHtml(programFacts)}</small>` : ''}</div>${section('PLAYER DETAILS', playerRows)}${section('PARENT / GUARDIAN DETAILS', parentRows)}${section('EMERGENCY CONTACT', emergencyRows)}${waivers.length ? section('WAIVER APPROVALS', waivers) : ''}<section class="review-payment"><p class="eyebrow dark">PROGRAM COST & PAYMENT</p><div><span>Full program cost</span><strong>${escapeHtml(cost)}</strong></div><div><span>Deposit to reserve a spot</span><strong>${formatCAD(100)}</strong></div><div><span>Remaining balance after deposit</span><strong>${escapeHtml(balance)}</strong></div><p>Send the CAD $100 deposit by e-transfer to <a href="mailto:kingshockeyacademyns@gmail.com">kingshockeyacademyns@gmail.com</a>. The remaining balance may be paid by e-transfer or cash no later than the second session.</p></section>`;
}

function renderProgramDetails(program) {
  document.querySelector('[data-program-title]').textContent = program.title.toUpperCase();
  document.querySelector('[data-program-season]').textContent = program.season || 'PROGRAM REGISTRATION';
  document.querySelector('[data-program-description]').textContent = program.description || 'Submit the form below and the academy will follow up with details and next steps.';
  document.querySelector('[data-program-facts]').textContent = [program.dates, program.location, program.age_groups, program.fee].filter(Boolean).join(' · ');
  const fields = document.querySelector('[data-program-specific-fields]');
  const questions = Array.isArray(program.questions) ? program.questions : [];
  const additional = questions.map((question, index) => `<label>${escapeHtml(question)}<textarea name="extra_${index}" data-program-answer="${index}" rows="2" maxlength="1000"></textarea></label>`).join('');
  const jerseySize = program.jersey_size_enabled ? `<label>Jersey size (optional)<select name="jersey_size" data-program-answer="Jersey size (optional)"><option value="">Choose a size (optional)</option><option>Youth XS</option><option>Youth S</option><option>Youth M</option><option>Youth L</option><option>Youth XL</option><option>Adult XS</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option></select></label>` : '';
  const jerseyNumber = program.jersey_number_enabled ? `<label>Player jersey number (optional)<input name="jersey_number" inputmode="numeric" maxlength="4" placeholder="e.g. 17"></label>` : '';
  fields.innerHTML = `${jerseyNumber}${jerseySize}${additional}`;
}

function renderWaiverFields(waivers) {
  const fields = document.querySelector('[data-waiver-fields]');
  fields.innerHTML = waivers.length ? `<fieldset class="waiver-consents"><legend>REQUIRED WAIVERS</legend><p>Please review each waiver and check the box to confirm your agreement. You must approve every active waiver to continue.</p>${waivers.map(waiver => `<article class="registration-waiver"><h3>${escapeHtml(waiver.title)}</h3><div class="registration-waiver-body">${escapeHtml(waiver.body).replace(/\r?\n/g, '<br>')}</div><label class="waiver-consent"><input type="checkbox" name="waiver_${escapeHtml(waiver.id)}" value="1" data-waiver-consent="${escapeHtml(waiver.id)}" required><span>I have read and agree to the ${escapeHtml(waiver.title)}. <b>*</b></span></label></article>`).join('')}</fieldset>` : '<p class="no-registration-waivers">There are no additional liability waivers for this program.</p>';
}

function renderDynamicForm(programs, waivers, selectedProgramId) {
  const root = document.querySelector('[data-dynamic-form-root]');
  if (!root) return;
  const selectedProgram = programs.find(program => program.id === selectedProgramId) || programs[0];
  const today = new Date();
  const dateInputValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const minDob = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());
  root.innerHTML = `<div class="alert" data-form-message hidden role="status"></div><form data-registration-form data-multistep-registration class="registration-form"><div class="trap" aria-hidden="true"><label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div><div class="registration-step-label" data-registration-step-label>STEP 1 OF 4 · PLAYER DETAILS</div><input type="hidden" name="program_type" data-program-type><section data-registration-step data-step-name="PLAYER DETAILS"><div class="form-title"><span>PLAYER DETAILS</span><span>* REQUIRED</span></div><label>I'm interested in <b>*</b><select name="program_id" data-program-select required>${programs.map(program => `<option value="${escapeHtml(program.id)}" ${program.id === selectedProgram.id ? 'selected' : ''}>${escapeHtml(program.title)}${program.season ? ` — ${escapeHtml(program.season)}` : ''}</option>`).join('')}</select></label><div class="form-row"><label>Player first name <b>*</b><input name="player_first" maxlength="80" autocomplete="given-name" required></label><label>Player last name <b>*</b><input name="player_last" maxlength="80" autocomplete="family-name" required></label></div><label>Date of birth <b>*</b><input name="date_of_birth" type="date" min="${dateInputValue(minDob)}" max="${dateInputValue(today)}" required></label><div class="address-fields"><label>Street &amp; number <b>*</b><input name="player_address" maxlength="300" autocomplete="street-address" required></label><div class="form-row"><label>Post code <b>*</b><input name="player_postal_code" maxlength="16" autocomplete="postal-code" required></label><label>Province <b>*</b><input name="player_province" maxlength="80" autocomplete="address-level1" required></label></div></div><label>Medical information / allergies<textarea name="allergies" rows="3" maxlength="3000" placeholder="List allergies or other medical information the academy should know."></textarea></label><div class="program-specific-fields" data-program-specific-fields></div><div class="form-row"><label>Playing experience<select name="experience"><option value="">Choose one (optional)</option><option>New to hockey</option><option>Learn to skate / play</option><option>Recreational</option><option>Competitive</option></select></label><label>Anything else you’d like us to know?<textarea name="notes" rows="2" maxlength="3000"></textarea></label></div><div class="registration-step-actions"><span>Player and program information</span><button class="button button-gold" data-step-next type="button">CONTINUE TO PARENT DETAILS <b>↗</b></button></div></section><section data-registration-step data-step-name="PARENT & EMERGENCY CONTACTS" hidden><div class="form-title"><span>PARENT / GUARDIAN DETAILS</span><span>* REQUIRED</span></div><div class="form-row"><label>Parent / guardian first name <b>*</b><input name="guardian_first" maxlength="59" autocomplete="given-name" required></label><label>Parent / guardian last name <b>*</b><input name="guardian_last" maxlength="59" autocomplete="family-name" required></label></div><div class="form-row"><label>Email address <b>*</b><input name="email" type="email" maxlength="254" autocomplete="email" required></label><label>Phone number <b>*</b><input name="phone" type="tel" maxlength="40" autocomplete="tel" required></label></div><div class="address-fields"><label>Street &amp; number <b>*</b><input name="guardian_address" maxlength="300" autocomplete="street-address" required></label><div class="form-row"><label>Post code <b>*</b><input name="guardian_postal_code" maxlength="16" autocomplete="postal-code" required></label><label>Province <b>*</b><input name="guardian_province" maxlength="80" autocomplete="address-level1" required></label></div></div><div class="second-guardian-fields" data-second-guardian-fields><p class="eyebrow dark">SECOND PARENT / GUARDIAN <span>(OPTIONAL)</span></p><p class="registration-step-intro">Leave these fields blank if there is no second parent or guardian to include.</p><div class="form-row"><label>First name<input name="second_guardian_first" maxlength="80" data-second-guardian-field></label><label>Last name<input name="second_guardian_last" maxlength="80" data-second-guardian-field></label></div><div class="form-row"><label>Email address<input name="second_guardian_email" type="email" maxlength="254" data-second-guardian-field></label><label>Phone number<input name="second_guardian_phone" type="tel" maxlength="40" data-second-guardian-field></label></div><div class="address-fields"><label>Street &amp; number<input name="second_guardian_address" maxlength="300" autocomplete="street-address" data-second-guardian-field></label><div class="form-row"><label>Post code<input name="second_guardian_postal_code" maxlength="16" autocomplete="postal-code" data-second-guardian-field></label><label>Province<input name="second_guardian_province" maxlength="80" autocomplete="address-level1" data-second-guardian-field></label></div></div></div><div class="emergency-contact-fields"><p class="eyebrow dark">EMERGENCY CONTACT</p><div class="form-row"><label>Contact full name <b>*</b><input name="emergency_name" maxlength="120" required></label><label>Relationship to player <b>*</b><input name="emergency_relationship" maxlength="80" placeholder="e.g. Grandparent" required></label></div><label>Emergency contact phone <b>*</b><input name="emergency_phone" type="tel" maxlength="40" required></label></div><div class="registration-step-actions"><button class="button button-light" data-step-back type="button">BACK</button><button class="button button-gold" data-step-next type="button">CONTINUE TO WAIVERS <b>↗</b></button></div></section><section data-registration-step data-step-name="LIABILITY WAIVERS" hidden><div class="form-title"><span>LIABILITY WAIVERS</span><span>* REQUIRED</span></div><p class="registration-step-intro">Read each waiver in full. Check the box under each one to confirm you agree.</p><div data-waiver-fields></div><div class="registration-step-actions"><button class="button button-light" data-step-back type="button">BACK</button><button class="button button-gold" data-step-next type="button">CONTINUE TO FINAL REVIEW <b>↗</b></button></div></section><section data-registration-step data-step-name="FINAL REVIEW & PAYMENT" hidden><div class="form-title"><span>FINAL REVIEW</span><span>CHECK BEFORE SENDING</span></div><div data-registration-review></div><label class="consent"><input type="checkbox" name="consent" value="1" required><span>I am the parent/guardian or adult participant, and I agree Kings Hockey Academy may use these details to respond to this registration request. <b>*</b></span></label><label class="consent"><input type="checkbox" name="payment_terms_accepted" value="1" required><span>I understand the CAD $100 deposit and remaining payment terms shown above. <b>*</b></span></label><div class="registration-step-actions"><button class="button button-light" data-step-back type="button">BACK</button><button class="button button-gold" data-step-submit type="submit">SEND REGISTRATION REQUEST <b>↗</b></button></div><small class="form-security">Your information is sent securely to Kings Hockey Academy for registration follow-up.</small></section></form>`;
  const form = root.querySelector('[data-registration-form]');
  form._selectedProgram = selectedProgram;
  const select = form.querySelector('[data-program-select]');
  const update = () => {
    const program = programs.find(item => item.id === select.value);
    if (!program) return;
    form._selectedProgram = program;
    form.querySelector('[data-program-type]').value = program.title;
    renderProgramDetails(program);
    renderWaiverFields(waivers);
    document.querySelector('[data-program-title]').textContent = program.title.toUpperCase();
    document.querySelector('[data-program-season]').textContent = program.season || 'PROGRAM REGISTRATION';
    document.querySelector('[data-program-description]').textContent = program.description || 'Submit the form below and the academy will follow up with details and next steps.';
    const total = programCost(program);
    document.querySelector('[data-program-facts]').textContent = [program.dates, program.location, program.age_groups, program.fee ? (total === null ? program.fee : formatCAD(total)) : null].filter(Boolean).join(' · ');
    if (form.querySelector('[data-registration-review]')) renderRegistrationReview(form);
  };
  select.addEventListener('change', update);
  update();
  wireRegistrationForm(form);
}

async function loadDynamicRegistration() {
  if (!document.querySelector('[data-dynamic-registration]')) return;
  const root = document.querySelector('[data-dynamic-form-root]');
  if (!client) { root.textContent = 'The registration form is not available right now. Please email kingshockeyacademyns@gmail.com for help.'; return; }
  const [{ data, error }, { data: waiverRows, error: waiverError }] = await Promise.all([
    client.from('programs').select('id,title,season,description,dates,location,age_groups,fee,questions,jersey_size_enabled,jersey_number_enabled').eq('is_open', true).order('created_at', { ascending: false }),
    client.from('waivers').select('id,title,body').eq('is_active', true).order('created_at', { ascending: true })
  ]);
  if (error || waiverError) { root.textContent = 'The registration form is being updated. Please contact the academy for help.'; return; }
  if (!data?.length) { root.textContent = 'No registrations are available right now. Please return to Camps & Programs later or contact the academy.'; return; }
  const requestedId = new URLSearchParams(window.location.search).get('id');
  const selectedProgramId = data.some(program => program.id === requestedId) ? requestedId : data[0].id;
  renderDynamicForm(data, waiverRows || [], selectedProgramId);
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
