import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ageGroupForBirthDate } from './age-groups.js';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const adminPage = document.body.dataset.adminPage || 'login';
const isDashboardPage = adminPage === 'dashboard';
const isProgramsPage = adminPage === 'programs';
const isWaiversPage = adminPage === 'waivers';
const isLoginPage = adminPage === 'login';
const isAuthenticatedAdminPage = isDashboardPage || isProgramsPage || isWaiversPage;
const submissionProgramId = new URLSearchParams(window.location.search).get('program_id');
const login = document.querySelector('[data-admin-login]');
const notice = document.querySelector('[data-admin-message]');
const setMessage = text => {
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = !text;
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadExportPrograms() {
  const select = document.querySelector('[data-export-program]');
  const button = document.querySelector('[data-admin-export]');
  if (!select || !button) return;

  const { data, error } = await client.from('registrations')
    .select('program_id,program_type,programs(title)')
    .order('created_at', { ascending: false });
  if (error) {
    setMessage('Could not load the program list for CSV export.');
    return;
  }

  const choices = new Map();
  (data || []).forEach(row => {
    const key = row.program_id ? `program:${row.program_id}` : `legacy:${row.program_type || 'other'}`;
    if (!choices.has(key)) {
      choices.set(key, {
        title: row.programs?.title || row.program_type || (row.program_id ? 'Registration program' : 'Legacy submissions'),
        count: 0
      });
    }
    choices.get(key).count += 1;
  });

  const sorted = [...choices.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
  select.innerHTML = '<option value="">Select one program…</option>' + sorted.map(([key, item]) =>
    `<option value="${esc(key)}">${esc(item.title)} (${item.count} submission${item.count === 1 ? '' : 's'})</option>`
  ).join('');

  if (submissionProgramId) select.value = `program:${submissionProgramId}`;
  button.disabled = !select.value;
  select.addEventListener('change', () => { button.disabled = !select.value; });
}

async function loadRows() {
  let query = client.from('registrations')
    .select('id,program_id,program_type,player_first,player_last,date_of_birth,birth_year,guardian_first,guardian_last,guardian_name,email,created_at,programs(title,season)')
    .order('created_at', { ascending: false });
  if (submissionProgramId) query = query.eq('program_id', submissionProgramId);
  const { data, error } = await query;
  if (error) {
    setMessage('This account is not approved to see registrations. Contact the site administrator.');
    return;
  }

  setMessage('');
  const renderRow = row => {
    const guardianName = [row.guardian_first, row.guardian_last].filter(Boolean).join(' ') || row.guardian_name || '';
    const ageGroup = row.date_of_birth ? ageGroupForBirthDate(row.date_of_birth) : (row.birth_year ? 'Full DOB needed' : '—');
    return `<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td>${esc(`${row.player_first || ''} ${row.player_last || ''}`.trim())}</td><td>${esc(row.date_of_birth || row.birth_year || '')}</td><td>${esc(ageGroup || '—')}</td><td>${esc(guardianName)}</td><td><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></td><td><button class="admin-delete-button" data-delete="${esc(row.id)}" type="button">Delete</button></td></tr>`;
  };
  document.querySelector('[data-registration-count]').textContent = `${data.length} submission${data.length === 1 ? '' : 's'} received`;
  const seasonNames = new Map([
    ['fall-winter', 'FALL / WINTER'],
    ['spring-summer', 'SPRING / SUMMER'],
    ['other', 'OTHER SUBMISSIONS']
  ]);
  const seasonGroups = new Map([...seasonNames.keys()].map(key => [key, new Map()]));
  data.forEach(row => {
    const seasonText = `${row.programs?.season || ''} ${row.program_type || ''}`.toLowerCase();
    const season = /fall|winter/.test(seasonText) ? 'fall-winter' : /spring|summer/.test(seasonText) ? 'spring-summer' : 'other';
    const programs = seasonGroups.get(season);
    const key = row.program_id || `legacy:${row.program_type || 'other'}`;
    if (!programs.has(key)) programs.set(key, { title: row.programs?.title || row.program_type || 'Other submissions', rows: [] });
    programs.get(key).rows.push(row);
  });
  const groupRoot = document.querySelector('[data-registration-groups]');
  groupRoot.innerHTML = [...seasonGroups.entries()].filter(([key, programs]) => key !== 'other' || programs.size).map(([season, programs]) => {
    const count = [...programs.values()].reduce((total, program) => total + program.rows.length, 0);
    const content = programs.size ? [...programs.values()].map(program => `
      <section class="submission-program">
        <div class="submission-group-heading"><div><p class="eyebrow red">PROGRAM SUBMISSIONS</p><h3>${esc(program.title)}</h3></div><span>${program.rows.length} submission${program.rows.length === 1 ? '' : 's'}</span></div>
        <div class="table-wrap"><table><thead><tr><th>Received</th><th>Player</th><th>Date of birth</th><th>Age group<br><small>July 31 cutoff</small></th><th>Parent / guardian name</th><th>Contact email</th><th>Action</th></tr></thead><tbody>${program.rows.map(renderRow).join('')}</tbody></table></div>
      </section>`).join('') : '<p class="empty">No submissions in this season yet.</p>';
    return `<section class="submission-season"><div class="submission-season-heading"><h2>${seasonNames.get(season)}</h2><span>${count} submission${count === 1 ? '' : 's'}</span></div>${content}</section>`;
  }).join('') || '<p class="empty">No registration submissions have been received yet.</p>';
  groupRoot.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this registration inquiry? This cannot be undone.')) return;
    const { error: deleteError } = await client.from('registrations').delete().eq('id', button.dataset.delete);
    if (deleteError) {
      setMessage('This inquiry could not be deleted.');
      return;
    }
    await loadRows();
  }));
}

async function loadPrograms() {
  const list = document.querySelector('[data-program-list]');
  if (!list) return;
  const { data, error } = await client.from('programs').select('*').order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = '<p class="admin-program-empty">Program management is ready after the dynamic programs database update is applied.</p>';
    return;
  }

  const openPrograms = data.filter(isProgramOpen);
  const closedPrograms = data.filter(program => !isProgramOpen(program));
  if (!openPrograms.length) list.innerHTML = '<p class="admin-program-empty">There are no open program registrations yet. Create a form to get started.</p>';
  else {
    const cards = await Promise.all(openPrograms.map(async program => {
      const { count } = await client.from('registrations').select('id', { count: 'exact', head: true }).eq('program_id', program.id);
      return programCard(program, count ?? 0);
    }));
    list.innerHTML = cards.join('');
  }

  const closedSection = document.querySelector('[data-closed-programs]');
  const closedList = document.querySelector('[data-closed-program-list]');
  if (closedSection && closedList) {
    closedSection.hidden = !closedPrograms.length;
    closedList.innerHTML = closedPrograms.map(program => programCard(program, null)).join('');
  }

  document.querySelectorAll('[data-program-toggle]').forEach(button => button.addEventListener('click', async () => {
    const update = { is_open: button.dataset.nextState === 'true' };
    if (update.is_open && button.dataset.closedByDeadline === 'true') update.registration_closes_on = null;
    const { error: updateError } = await client.from('programs').update(update).eq('id', button.dataset.programToggle);
    if (updateError) {
      setProgramMessage('The program status could not be changed.', 'error');
      return;
    }
    setProgramMessage('Program registration status updated.');
    await loadPrograms();
  }));
}

const waiverMessage = text => {
  const box = document.querySelector('[data-waiver-message]');
  if (!box) return;
  box.textContent = text;
  box.hidden = !text;
};

async function loadWaivers() {
  if (!waiverAdminList) return;
  const { data, error } = await client.from('waivers').select('*').order('created_at', { ascending: true });
  if (error) {
    waiverAdminList.innerHTML = '<p class="admin-program-empty">Waiver management is ready after the reusable waivers database update is applied.</p>';
    return;
  }
  if (!data?.length) {
    waiverAdminList.innerHTML = '<p class="admin-program-empty">No waivers yet. Create a waiver above and it will appear on all open registration forms.</p>';
    return;
  }
  waiverAdminList.innerHTML = data.map(waiver => `<article class="waiver-admin-card"><form class="waiver-editor" data-waiver-edit="${esc(waiver.id)}"><div class="waiver-admin-card-heading"><h3>${esc(waiver.title)}</h3><span class="admin-program-status ${waiver.is_active ? 'is-open' : ''}">${waiver.is_active ? 'ACTIVE ON OPEN FORMS' : 'INACTIVE'}</span></div><label>Waiver name <b>*</b><input name="title" maxlength="120" value="${esc(waiver.title)}" required></label><label>Waiver wording <b>*</b><textarea name="body" rows="8" maxlength="6000" required>${esc(waiver.body)}</textarea></label><label class="waiver-active-toggle"><input name="is_active" type="checkbox" ${waiver.is_active ? 'checked' : ''}><span>Include on open registration forms</span></label><button class="button button-gold" type="submit">SAVE CHANGES <b>↗</b></button><p class="waiver-save-message" data-waiver-status="${esc(waiver.id)}" role="status" hidden></p></form></article>`).join('');
  waiverAdminList.querySelectorAll('[data-waiver-edit]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const id = form.dataset.waiverEdit;
    const status = form.querySelector('[data-waiver-status]');
    const { error: updateError } = await client.from('waivers').update({
      title: String(values.get('title') || '').trim(),
      body: String(values.get('body') || '').trim(),
      is_active: values.get('is_active') === 'on',
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (updateError) {
      if (status) { status.textContent = updateError.message || 'The waiver could not be updated.'; status.hidden = false; }
      return;
    }
    waiverMessage('Waiver updated. The change now appears on open registration forms.');
    await loadWaivers();
  }));
}

function programCard(program, submissionCount) {
  const isOpen = isProgramOpen(program);
  const closedByDeadline = program.registration_closes_on && program.registration_closes_on < localDateString();
  const action = isOpen
    ? `<a class="program-submissions-link" href="admin-dashboard.html?program_id=${encodeURIComponent(program.id)}">VIEW SUBMISSIONS${submissionCount === null ? '' : ` (${submissionCount})`} ↗</a>`
    : `<span class="program-closed-label">CLOSED</span>`;
  const startDate = program.program_start_date ? `Starts ${formatProgramDate(program.program_start_date)}` : '';
  const closes = program.registration_closes_on ? `Registration closes ${formatProgramDate(program.registration_closes_on)}` : '';
  const perSession = singleSessionPrice(program);
  const facts = [program.dates, startDate, closes, program.session_schedule, program.session_count ? `${program.session_count} sessions` : '', program.single_session_available ? `Single sessions available${perSession === null ? ' · Add session count to calculate price' : ` · ${formatCAD(perSession)} per session`}` : '', program.location, program.age_groups, program.fee ? `Full program CAD $${Number(program.fee).toFixed(2)}` : ''].filter(Boolean);
  return `<article class="admin-program-card"><div><span class="admin-program-status ${isOpen ? 'is-open' : ''}">${isOpen ? 'OPEN' : 'CLOSED'}</span><h3>${esc(program.title)}</h3><p>${esc(program.season || 'Program')}</p><p class="admin-program-meta">${facts.map(esc).join(' · ')}</p>${program.jersey_size_enabled ? '<small>Jersey size field included</small>' : ''}${program.jersey_number_enabled ? '<small>Jersey number field included</small>' : ''}${program.questions?.length ? `<small class="program-question-count">${program.questions.length} extra question${program.questions.length === 1 ? '' : 's'} on the form</small>` : ''}</div><div class="admin-program-actions">${action}<a href="program-registration.html?id=${encodeURIComponent(program.id)}" target="_blank" rel="noopener">Preview form ↗</a><button class="admin-delete-button" type="button" data-program-toggle="${esc(program.id)}" data-next-state="${isOpen ? 'false' : 'true'}" data-closed-by-deadline="${closedByDeadline ? 'true' : 'false'}">${isOpen ? 'Close registration' : 'Open registration'}</button></div></article>`;
}

function localDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Halifax', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function formatProgramDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCAD(value) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function singleSessionPrice(program) {
  const fee = Number(String(program?.fee ?? '').replace(/,/g, ''));
  const count = Number(program?.session_count);
  return program?.single_session_available && Number.isFinite(fee) && Number.isFinite(count) && count > 0
    ? Math.round((fee / count + Number.EPSILON) * 100) / 100
    : null;
}

function isProgramOpen(program) {
  return Boolean(program.is_open) && (!program.registration_closes_on || program.registration_closes_on >= localDateString());
}

function setProgramMessage(text, kind = 'success') {
  const box = document.querySelector('[data-program-message]');
  if (!box) return;
  box.textContent = text;
  box.className = `alert ${text ? kind : ''}`;
  box.hidden = !text;
}

async function initializePage() {
  if (!client) {
    setMessage('Admin sign-in is not connected to Supabase yet.');
    return;
  }

  const { data: { session }, error } = await client.auth.getSession();
  if (error) {
    setMessage('Could not verify your sign-in. Please reload and try again.');
    return;
  }

  if (isLoginPage) {
    if (session) window.location.replace('admin-dashboard.html');
    return;
  }

  if (!isAuthenticatedAdminPage || !session) {
    window.location.replace('admin.html');
    return;
  }

  document.querySelector('[data-admin-email]').textContent = session.user.email;
  if (isProgramsPage) await loadPrograms();
  if (isWaiversPage) await loadWaivers();
  if (isDashboardPage) {
    if (submissionProgramId) {
      const { data: program } = await client.from('programs').select('title').eq('id', submissionProgramId).maybeSingle();
      const filter = document.querySelector('[data-registration-filter]');
      const filterName = document.querySelector('[data-registration-filter-name]');
      if (filter && filterName) {
        filterName.textContent = program?.title || 'Selected program';
        filter.hidden = false;
      }
    }
    await loadExportPrograms();
    await loadRows();
  }
}

const programWizard = document.querySelector('[data-program-wizard]');
const programForm = document.querySelector('[data-program-form]');
const waiverAdminList = document.querySelector('[data-waiver-admin-list]');
function showProgramStep(step) {
  programWizard?.querySelectorAll('[data-program-step]').forEach(section => {
    section.hidden = section.dataset.programStep !== step;
  });
}

document.querySelector('[data-show-program-wizard]')?.addEventListener('click', () => {
  setProgramMessage('');
  if (programWizard) programWizard.hidden = false;
  showProgramStep('season');
  programWizard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  programWizard?.querySelector('input[name="season"]')?.focus({ preventScroll: true });
});

document.querySelector('[data-waiver-create]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const { error } = await client.from('waivers').insert({
    title: String(values.get('title') || '').trim(),
    body: String(values.get('body') || '').trim(),
    is_active: true
  });
  if (error) { waiverMessage(error.message || 'The waiver could not be created.'); return; }
  form.reset();
  waiverMessage('Waiver created and added to all open registration forms.');
  await loadWaivers();
});

document.querySelector('[data-next-program-step]')?.addEventListener('click', () => {
  const season = programForm?.querySelector('input[name="season"]:checked');
  if (!season) {
    setProgramMessage('Choose Fall / Winter or Spring / Summer to continue.', 'error');
    return;
  }
  programForm.querySelector('[data-selected-season]').value = season.value;
  setProgramMessage('');
  showProgramStep('details');
  programForm.querySelector('[name="title"]')?.focus({ preventScroll: true });
});

document.querySelector('[data-back-program-step]')?.addEventListener('click', () => {
  setProgramMessage('');
  showProgramStep('season');
});

document.querySelector('[data-cancel-program]')?.addEventListener('click', () => {
  programForm?.reset();
  if (programWizard) programWizard.hidden = true;
  showProgramStep('season');
  setProgramMessage('');
});

const ageGroupDropdown = document.querySelector('[data-age-group-dropdown]');
const ageGroupSummary = document.querySelector('[data-age-group-summary]');
const ageGroupError = document.querySelector('[data-age-group-error]');
const updateAgeGroupSummary = () => {
  const selected = [...(ageGroupDropdown?.querySelectorAll('input[name="age_groups"]:checked') || [])].map(input => input.value);
  if (ageGroupSummary) ageGroupSummary.textContent = selected.length ? selected.join(', ') : 'Select age groups';
  if (selected.length && ageGroupError) ageGroupError.hidden = true;
};
ageGroupDropdown?.querySelectorAll('input[name="age_groups"]').forEach(input => input.addEventListener('change', updateAgeGroupSummary));
programForm?.addEventListener('reset', () => setTimeout(updateAgeGroupSummary));

const singleSessionToggle = programForm?.querySelector('[name="single_session_available"]');
const sessionCountInput = programForm?.querySelector('[name="session_count"]');
const programFeeInput = programForm?.querySelector('[name="fee"]');
const sessionCountHelp = programForm?.querySelector('[data-session-count-help]');
const sessionPricePreview = programForm?.querySelector('[data-session-price-preview]');
const updateSessionPricePreview = () => {
  const enabled = Boolean(singleSessionToggle?.checked);
  if (sessionCountInput) sessionCountInput.required = enabled;
  if (sessionCountHelp) sessionCountHelp.textContent = enabled ? 'Required when single-session registration is available.' : 'Optional.';
  const fee = Number(programFeeInput?.value);
  const count = Number(sessionCountInput?.value);
  if (!sessionPricePreview) return;
  if (!enabled) {
    sessionPricePreview.textContent = 'Minimum payment to reserve a spot is CAD $100.';
  } else if (Number.isFinite(fee) && fee >= 0 && Number.isInteger(count) && count > 0) {
    const price = Math.round((fee / count + Number.EPSILON) * 100) / 100;
    sessionPricePreview.textContent = `Single-session price and minimum payment: ${formatCAD(price)} (${formatCAD(fee)} ÷ ${count} sessions).`;
  } else {
    sessionPricePreview.textContent = 'Enter the session count and full program cost to calculate the single-session price.';
  }
};
[singleSessionToggle, sessionCountInput, programFeeInput].forEach(input => input?.addEventListener('input', updateSessionPricePreview));
singleSessionToggle?.addEventListener('change', updateSessionPricePreview);
programForm?.addEventListener('reset', () => setTimeout(updateSessionPricePreview));
updateSessionPricePreview();

programForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const ageGroups = [...form.querySelectorAll('input[name="age_groups"]:checked')].map(input => input.value);
  if (!ageGroups.length) {
    if (ageGroupError) ageGroupError.hidden = false;
    if (ageGroupDropdown) ageGroupDropdown.open = true;
    ageGroupDropdown?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (singleSessionToggle?.checked && (!sessionCountInput?.value || Number(sessionCountInput.value) < 1)) {
    sessionCountInput?.setCustomValidity('Enter the total number of sessions to calculate the single-session price.');
    sessionCountInput?.reportValidity();
    return;
  }
  sessionCountInput?.setCustomValidity('');
  const questions = values.questions.split('\n').map(question => question.trim()).filter(Boolean);
  if (questions.length > 12) {
    setProgramMessage('Add no more than 12 extra questions.', 'error');
    return;
  }
  try {
    const { error } = await client.from('programs').insert({
      title: values.title.trim(), season: values.season.trim() || null, description: values.description.trim() || null,
      dates: values.dates.trim() || null, location: values.location.trim() || null,
      age_groups: ageGroups.join(', '), program_start_date: values.program_start_date || null,
      registration_closes_on: values.registration_closes_on || null,
      session_schedule: values.session_schedule.trim() || null,
      session_count: values.session_count ? Number.parseInt(values.session_count, 10) : null,
      single_session_available: values.single_session_available === '1', fee: values.fee.trim() || null, questions,
      jersey_size_enabled: values.jersey_size_enabled === '1', jersey_number_enabled: values.jersey_number_enabled === '1', is_open: true
    });
    if (error) throw error;
  } catch (error) {
    setProgramMessage(error.message || 'The program could not be saved.', 'error');
    return;
  }
  form.reset();
  if (programWizard) programWizard.hidden = true;
  setProgramMessage('Registration form created and now open on the Camps & Programs page.');
  await loadPrograms();
});

login?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) {
    setMessage('Admin sign-in is not connected to Supabase yet.');
    return;
  }

  const { error } = await client.auth.signInWithPassword({
    email: login.elements.email.value,
    password: login.elements.password.value
  });
  if (error) {
    setMessage('The email or password did not match.');
    return;
  }

  window.location.assign('admin-dashboard.html');
});

document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
  await client.auth.signOut();
  window.location.replace('admin.html');
});

document.querySelector('[data-admin-export]')?.addEventListener('click', async () => {
  const select = document.querySelector('[data-export-program]');
  const selected = select?.value || '';
  if (!selected) {
    setMessage('Select one program before downloading the CSV.');
    return;
  }

  let query = client.from('registrations').select('*').order('created_at', { ascending: false });
  if (selected.startsWith('program:')) {
    query = query.eq('program_id', selected.slice('program:'.length));
  } else if (selected.startsWith('legacy:')) {
    query = query.is('program_id', null).eq('program_type', selected.slice('legacy:'.length));
  } else {
    setMessage('Select one valid program before downloading the CSV.');
    return;
  }

  const { data, error } = await query;
  if (error) {
    setMessage('The selected program CSV could not be created.');
    return;
  }
  if (!data?.length) {
    setMessage('There are no submissions for the selected program.');
    return;
  }

  const columns = ['id','program_id','program_type','custom_answers','waiver_consents','player_first','player_last','date_of_birth','current_age_group','birth_year','jersey_number','player_address','player_postal_code','player_province','allergies','guardian_first','guardian_last','guardian_name','guardian_address','guardian_postal_code','guardian_province','email','phone','second_guardian_first','second_guardian_last','second_guardian_email','second_guardian_phone','second_guardian_address','second_guardian_postal_code','second_guardian_province','emergency_name','emergency_relationship','emergency_phone','payment_terms_accepted','town','experience','notes','created_at'];
  const csv = [columns, ...data.map(row => columns.map(key => key === 'current_age_group' ? (ageGroupForBirthDate(row.date_of_birth) || '') : row[key] ?? ''))].map(row => row.map(value => {
    const safe = String(value).replace(/^[=+\-@]/, "'$&").replaceAll('"','""');
    return `"${safe}"`;
  }).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const selectedLabel = select.options[select.selectedIndex]?.textContent || 'selected-program';
  const slug = selectedLabel.replace(/\s*\(\d+ submissions?\)\s*$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'selected-program';
  link.download = `kha-registration-${slug}-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  setMessage(`Downloaded ${data.length} submission${data.length === 1 ? '' : 's'} for ${selectedLabel.replace(/\s*\(\d+ submissions?\)\s*$/i, '')}.`);
});

if (client) {
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && isAuthenticatedAdminPage) window.location.replace('admin.html');
    if (event === 'SIGNED_IN' && isLoginPage) window.location.replace('admin-dashboard.html');
  });
}

initializePage();
