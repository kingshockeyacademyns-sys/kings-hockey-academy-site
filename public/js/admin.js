import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const adminPage = document.body.dataset.adminPage || 'login';
const isDashboardPage = adminPage === 'dashboard';
const isProgramsPage = adminPage === 'programs';
const isLoginPage = adminPage === 'login';
const isAuthenticatedAdminPage = isDashboardPage || isProgramsPage;
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
      return waiver ? `<br><small><strong>Agreed:</strong> ${esc(waiver.title)} waiver</small>` : '';
    }).join('');
    return `<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td>${esc(row.program_type)}</td><td>${esc(row.player_first)} ${esc(row.player_last)}</td><td>${esc(row.birth_year)}</td><td>${esc(row.guardian_name)}<br><small>${esc(row.town)}</small></td><td><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br>${esc(row.phone)}</td><td>${esc(row.experience)}<br><small>${esc(row.notes)}</small>${answers}${waiverApprovals}</td><td><button class="admin-delete-button" data-delete="${esc(row.id)}" type="button">Delete</button></td></tr>`;
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
  document.querySelectorAll('[data-program-waiver-add]').forEach(button => button.addEventListener('click', () => {
    addWaiverRow(document.querySelector(`[data-existing-waiver-list="${CSS.escape(button.dataset.programWaiverAdd)}"]`));
  }));
  document.querySelectorAll('[data-program-waiver-save]').forEach(button => button.addEventListener('click', async () => {
    const programId = button.dataset.programWaiverSave;
    const status = document.querySelector(`[data-waiver-status="${CSS.escape(programId)}"]`);
    const list = document.querySelector(`[data-existing-waiver-list="${CSS.escape(programId)}"]`);
    try {
      const rows = readWaiverRows(list);
      if (!rows.length) throw new Error('Add at least one waiver first.');
      const program = data.find(item => item.id === programId);
      const { waivers: added, uploadedPaths } = await uploadWaiverRows(programId, rows);
      const { error: updateError } = await client.from('programs').update({ waivers: [...(program.waivers || []), ...added] }).eq('id', programId);
      if (updateError) {
        if (uploadedPaths.length) await client.storage.from('program-waivers').remove(uploadedPaths);
        throw updateError;
      }
      await loadPrograms();
      setProgramMessage('Waivers added. Parents must agree to each one before submitting this form.');
    } catch (error) {
      if (status) {
        status.textContent = error.message || 'The waiver documents could not be saved. Confirm the program waivers database update has been applied.';
        status.hidden = false;
      }
    }
  }));
  document.querySelectorAll('[data-existing-waiver-list]').forEach(list => list.addEventListener('click', event => {
    if (event.target.closest('[data-remove-waiver]')) event.target.closest('.waiver-upload-row')?.remove();
  }));
}

function programCard(program, submissionCount) {
  const action = program.is_open
    ? `<a class="program-submissions-link" href="admin-dashboard.html?program_id=${encodeURIComponent(program.id)}">VIEW SUBMISSIONS${submissionCount === null ? '' : ` (${submissionCount})`} ↗</a>`
    : `<span class="program-closed-label">CLOSED</span>`;
  const waivers = Array.isArray(program.waivers) ? program.waivers : [];
  const attachedWaivers = waivers.length ? `<ul>${waivers.map(waiver => `<li>${esc(waiver.title)}</li>`).join('')}</ul>` : '<p class="waiver-empty">No waivers attached yet.</p>';
  return `<article class="admin-program-card"><div><span class="admin-program-status ${program.is_open ? 'is-open' : ''}">${program.is_open ? 'OPEN' : 'CLOSED'}</span><h3>${esc(program.title)}</h3><p>${esc(program.season || 'Program')}${program.dates ? ` · ${esc(program.dates)}` : ''}</p><p class="admin-program-meta">${[program.location, program.age_groups, program.fee].filter(Boolean).map(esc).join(' · ')}</p>${program.jersey_size_enabled ? '<small>Jersey size field included</small>' : ''}${program.questions?.length ? `<small class="program-question-count">${program.questions.length} extra question${program.questions.length === 1 ? '' : 's'} on the form</small>` : ''}</div><div class="admin-program-actions">${action}<a href="program-registration.html?id=${encodeURIComponent(program.id)}" target="_blank" rel="noopener">Preview form ↗</a><button class="admin-delete-button" type="button" data-program-toggle="${esc(program.id)}" data-next-state="${program.is_open ? 'false' : 'true'}">${program.is_open ? 'Close registration' : 'Open registration'}</button></div><details class="program-waiver-manager"><summary>Manage waivers (${waivers.length})</summary><div class="program-waiver-manager-content">${attachedWaivers}<p>PDFs uploaded here are viewable by families on the public registration page.</p><div class="waiver-upload-list" data-existing-waiver-list="${esc(program.id)}"></div><button class="button button-light waiver-add-button" type="button" data-program-waiver-add="${esc(program.id)}">Add a waiver</button><button class="button button-gold waiver-save-button" type="button" data-program-waiver-save="${esc(program.id)}">Save added waivers</button><p class="waiver-save-message" data-waiver-status="${esc(program.id)}" role="status" hidden></p></div></details></article>`;
}

function waiverRowMarkup() {
  return `<div class="waiver-upload-row"><label>Waiver name <input type="text" data-waiver-title maxlength="120" placeholder="Medical waiver" required></label><label>PDF document <input type="file" data-waiver-file accept="application/pdf,.pdf" required></label><button class="admin-delete-button" type="button" data-remove-waiver>Remove</button></div>`;
}

function addWaiverRow(list) {
  if (!list) return;
  if (list.querySelectorAll('[data-waiver-title]').length >= 8) {
    setProgramMessage('A program can have up to 8 waivers.', 'error');
    return;
  }
  list.insertAdjacentHTML('beforeend', waiverRowMarkup());
}

function readWaiverRows(list) {
  const rows = [...(list?.querySelectorAll('.waiver-upload-row') || [])];
  if (rows.length > 8) throw new Error('Add no more than 8 waivers.');
  return rows.map(row => {
    const title = row.querySelector('[data-waiver-title]').value.trim();
    const file = row.querySelector('[data-waiver-file]').files?.[0];
    if (!title || !file) throw new Error('Enter a name and choose a PDF for each waiver.');
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) throw new Error('Waivers must be PDF files.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Each waiver PDF must be 10 MB or smaller.');
    return { title, file };
  });
}

async function uploadWaiverRows(programId, rows) {
  const uploadedPaths = [];
  const waivers = [];
  try {
    for (const row of rows) {
      const id = crypto.randomUUID();
      const path = `${programId}/${id}.pdf`;
      const { error } = await client.storage.from('program-waivers').upload(path, row.file, {
        cacheControl: '3600', contentType: 'application/pdf', upsert: false
      });
      if (error) throw error;
      uploadedPaths.push(path);
      waivers.push({ id, title: row.title, path });
    }
    return { waivers, uploadedPaths };
  } catch (error) {
    if (uploadedPaths.length) await client.storage.from('program-waivers').remove(uploadedPaths);
    throw error;
  }
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

document.querySelector('[data-add-waiver]')?.addEventListener('click', () => addWaiverRow(programForm?.querySelector('[data-admin-waiver-list]')));
document.querySelector('[data-admin-waiver-list]')?.addEventListener('click', event => {
  if (event.target.closest('[data-remove-waiver]')) event.target.closest('.waiver-upload-row')?.remove();
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
  let uploadedPaths = [];
  try {
    const waiverRows = readWaiverRows(form.querySelector('[data-admin-waiver-list]'));
    const programId = crypto.randomUUID();
    const { waivers, uploadedPaths: paths } = await uploadWaiverRows(programId, waiverRows);
    uploadedPaths = paths;
    const { error } = await client.from('programs').insert({
      id: programId, title: values.title.trim(), season: values.season.trim() || null, description: values.description.trim() || null,
      dates: values.dates.trim() || null, location: values.location.trim() || null,
      age_groups: values.age_groups.trim() || null, fee: values.fee.trim() || null, questions, waivers,
      jersey_size_enabled: values.jersey_size_enabled === '1', is_open: true
    });
    if (error) throw error;
  } catch (error) {
    if (uploadedPaths.length) await client.storage.from('program-waivers').remove(uploadedPaths);
    setProgramMessage(error.message || 'The program could not be saved. Confirm the program waivers database update has been applied.', 'error');
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

  const columns = ['id','program_id','program_type','custom_answers','waiver_consents','player_first','player_last','birth_year','guardian_name','email','phone','town','experience','notes','created_at'];
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
