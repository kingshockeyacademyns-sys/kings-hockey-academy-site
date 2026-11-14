import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

async function loadRows() {
  let query = client.from('registrations').select('*, programs(title, questions, waivers)').order('created_at', { ascending: false });
  if (submissionProgramId) query = query.eq('program_id', submissionProgramId);
  const { data, error } = await query;
  if (error) {
    setMessage('This account is not approved to see registrations. Contact the site administrator.');
    return;
  }

  const { data: waiverRecords } = await client.from('waivers').select('id,title');
  const waiverTitles = new Map((waiverRecords || []).map(waiver => [waiver.id, waiver.title]));
  setMessage('');
  const tbody = document.querySelector('[data-registration-rows]');
  tbody.innerHTML = data.map(row => {
    const questions = row.programs?.questions || [];
    const answers = Object.entries(row.custom_answers || {}).map(([index, answer]) => {
      const question = /^\d+$/.test(index) ? (questions[Number(index)] || `Extra question ${Number(index) + 1}`) : index;
      return `<br><small><strong>${esc(question)}</strong>: ${esc(answer)}</small>`;
    }).join('');
    const waiverApprovals = Object.entries(row.waiver_consents || {}).filter(([, approved]) => approved).map(([id]) => {
      const waiver = row.programs?.waivers?.find(item => item.id === id);
      const title = waiverTitles.get(id) || waiver?.title;
      return title ? `<br><small><strong>Agreed:</strong> ${esc(title)} waiver</small>` : '';
    }).join('');
    const guardianName = [row.guardian_first, row.guardian_last].filter(Boolean).join(' ') || row.guardian_name;
    const secondGuardian = [row.second_guardian_first, row.second_guardian_last].filter(Boolean).join(' ');
    const guardianAddress = [row.guardian_address, row.guardian_postal_code, row.guardian_province].filter(Boolean).length ? `<br><small>Address: ${esc([row.guardian_address, row.guardian_postal_code, row.guardian_province].filter(Boolean).join(', '))}</small>` : '';
    const secondGuardianAddress = [row.second_guardian_address, row.second_guardian_postal_code, row.second_guardian_province].filter(Boolean).join(', ');
    const secondGuardianInfo = secondGuardian ? `<br><small>Second parent: ${esc(secondGuardian)} · ${esc(row.second_guardian_email)} · ${esc(row.second_guardian_phone)}${secondGuardianAddress ? ` · ${esc(secondGuardianAddress)}` : ''}</small>` : '';
    const emergency = row.emergency_name ? `<br><small>Emergency contact: ${esc(row.emergency_name)} (${esc(row.emergency_relationship)}) · ${esc(row.emergency_phone)}</small>` : '';
    const playerAddress = [row.player_address, row.player_postal_code, row.player_province].filter(Boolean).join(', ');
    const playerDetails = [row.jersey_number ? `Jersey #${row.jersey_number}` : null, playerAddress ? `Player address: ${playerAddress}` : null, row.allergies ? `Medical / allergies: ${row.allergies}` : null, row.experience, row.notes].filter(Boolean).map(item => `<small>${esc(item)}</small>`).join('<br>');
    const paymentTerms = row.payment_terms_accepted ? '<br><small>Payment terms acknowledged</small>' : '';
    return `<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td>${esc(row.program_type)}</td><td>${esc(row.player_first)} ${esc(row.player_last)}</td><td>${esc(row.date_of_birth || row.birth_year)}</td><td>${esc(guardianName)}${guardianAddress}${secondGuardianInfo}</td><td><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br>${esc(row.phone)}${emergency}</td><td>${playerDetails}${answers}${waiverApprovals}${paymentTerms}</td><td><button class="admin-delete-button" data-delete="${esc(row.id)}" type="button">Delete</button></td></tr>`;
  }).join('');
  document.querySelector('[data-registration-count]').textContent = `${data.length} submission${data.length === 1 ? '' : 's'} received`;
  tbody.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
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

  const openPrograms = data.filter(program => program.is_open);
  const closedPrograms = data.filter(program => !program.is_open);
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
    const { error: updateError } = await client.from('programs').update({ is_open: button.dataset.nextState === 'true' }).eq('id', button.dataset.programToggle);
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
  const action = program.is_open
    ? `<a class="program-submissions-link" href="admin-dashboard.html?program_id=${encodeURIComponent(program.id)}">VIEW SUBMISSIONS${submissionCount === null ? '' : ` (${submissionCount})`} ↗</a>`
    : `<span class="program-closed-label">CLOSED</span>`;
  return `<article class="admin-program-card"><div><span class="admin-program-status ${program.is_open ? 'is-open' : ''}">${program.is_open ? 'OPEN' : 'CLOSED'}</span><h3>${esc(program.title)}</h3><p>${esc(program.season || 'Program')}${program.dates ? ` · ${esc(program.dates)}` : ''}</p><p class="admin-program-meta">${[program.location, program.age_groups, program.fee ? `CAD $${program.fee}` : null].filter(Boolean).map(esc).join(' · ')}</p>${program.jersey_size_enabled ? '<small>Jersey size field included</small>' : ''}${program.jersey_number_enabled ? '<small>Jersey number field included</small>' : ''}${program.questions?.length ? `<small class="program-question-count">${program.questions.length} extra question${program.questions.length === 1 ? '' : 's'} on the form</small>` : ''}</div><div class="admin-program-actions">${action}<a href="program-registration.html?id=${encodeURIComponent(program.id)}" target="_blank" rel="noopener">Preview form ↗</a><button class="admin-delete-button" type="button" data-program-toggle="${esc(program.id)}" data-next-state="${program.is_open ? 'false' : 'true'}">${program.is_open ? 'Close registration' : 'Open registration'}</button></div></article>`;
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

programForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const questions = values.questions.split('\n').map(question => question.trim()).filter(Boolean);
  if (questions.length > 12) {
    setProgramMessage('Add no more than 12 extra questions.', 'error');
    return;
  }
  try {
    const { error } = await client.from('programs').insert({
      title: values.title.trim(), season: values.season.trim() || null, description: values.description.trim() || null,
      dates: values.dates.trim() || null, location: values.location.trim() || null,
      age_groups: values.age_groups.trim() || null, fee: values.fee.trim() || null, questions,
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
  let query = client.from('registrations').select('*').order('created_at', { ascending: false });
  if (submissionProgramId) query = query.eq('program_id', submissionProgramId);
  const { data, error } = await query;
  if (error) {
    setMessage('The CSV file could not be created.');
    return;
  }

  const columns = ['id','program_id','program_type','custom_answers','waiver_consents','player_first','player_last','date_of_birth','birth_year','jersey_number','player_address','player_postal_code','player_province','allergies','guardian_first','guardian_last','guardian_name','guardian_address','guardian_postal_code','guardian_province','email','phone','second_guardian_first','second_guardian_last','second_guardian_email','second_guardian_phone','second_guardian_address','second_guardian_postal_code','second_guardian_province','emergency_name','emergency_relationship','emergency_phone','payment_terms_accepted','town','experience','notes','created_at'];
  const csv = [columns, ...data.map(row => columns.map(key => row[key] ?? ''))].map(row => row.map(value => {
    const safe = String(value).replace(/^[=+\-@]/, "'$&").replaceAll('"','""');
    return `"${safe}"`;
  }).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `kha-registrations${submissionProgramId ? '-program' : ''}-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

if (client) {
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && isAuthenticatedAdminPage) window.location.replace('admin.html');
    if (event === 'SIGNED_IN' && isLoginPage) window.location.replace('admin-dashboard.html');
  });
}

initializePage();
