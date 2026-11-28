import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const teams = {
  'nova-scotia-kings': 'Nova Scotia Kings',
  'nova-scotia-vipers': 'Nova Scotia Vipers',
  'quebec-predators': 'Quebec Predators',
  'montreal-sentinels': 'Montreal Sentinels'
};
const roles = { head_coach: 'Head Coach', assistant_coach: 'Assistant Coach', team_manager: 'Team Manager', team_staff: 'Other Team Staff' };
const params = new URLSearchParams(location.search);
const teamSelect = document.querySelector('[data-staff-team]');
const ageGroupSelect = document.querySelector('[data-staff-age-group]');
const roleSelect = document.querySelector('[data-staff-role]');
const form = document.querySelector('[data-staff-invite-form]');
const submitButton = document.querySelector('[data-staff-invite-submit]');
const list = document.querySelector('[data-staff-list]');
const count = document.querySelector('[data-staff-count]');
const message = document.querySelector('[data-staff-message]');
const accountSearch = document.querySelector('[data-staff-account-search]');
const accountResults = document.querySelector('[data-staff-account-results]');
const selectedAccountText = document.querySelector('[data-staff-selected-account]');
const existingAssignButton = document.querySelector('[data-staff-existing-assign]');
const existingPanel = document.querySelector('[data-staff-existing-panel]');
const invitePanel = document.querySelector('[data-staff-invite-panel]');
let staff = [], selectedAccount = null, searchTimer = null, searchRequest = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text, isError=false) { if (!message) return; message.textContent=text; message.className=`staff-feedback ${isError?'error':'success'}`; message.hidden=!text; }
function errorText(error,data) { return data?.error || error?.message || 'The request could not be completed. Please try again.'; }
async function callStaffFunction(body) { const {data,error}=await client.functions.invoke('manage-team-staff',{body}); if(error||data?.error) throw new Error(errorText(error,data)); return data||{}; }
function selectedAgeGroup(){ return ageGroupSelect?.value || 'all'; }
function updateContext(){
  const t=teams[teamSelect.value]||'Selected team'; const a=selectedAgeGroup()==='all'?'All age groups':selectedAgeGroup();
  const teamText=document.querySelector('[data-staff-context-team]'); const ageText=document.querySelector('[data-staff-context-age]');
  if(teamText) teamText.textContent=t; if(ageText) ageText.textContent=a;
  const assignText=`ASSIGN TO ${t.toUpperCase()} · ${a.toUpperCase()}`;
  if(existingAssignButton) existingAssignButton.innerHTML=`${assignText} <b>↗</b>`;
  if(submitButton) submitButton.innerHTML=`INVITE TO ${t.toUpperCase()} · ${a.toUpperCase()} <b>↗</b>`;
}
function renderStaff(){
  const teamSlug=teamSelect.value; const age=selectedAgeGroup();
  const visible=staff.filter(m=>age==='all'||!m.age_group||m.age_group==='all'||String(m.age_group).toUpperCase()===age);
  if(count) count.textContent=`${visible.length} staff assignment${visible.length===1?'':'s'} for ${teams[teamSlug]||'this team'} · ${age==='all'?'all age groups':age}.`;
  if(!visible.length){list.innerHTML='<tr><td colspan="6">No staff assignments match this team and age group.</td></tr>';return;}
  list.innerHTML=visible.map(m=>{
    const active=m.is_active===true, disabled=m.account_disabled===true, status=disabled?'Account disabled':active?'Active':'Inactive';
    const date=m.created_at?new Date(m.created_at).toLocaleDateString():'—';
    return `<tr><td><strong>${esc(m.email||'Account email unavailable')}</strong><small>${esc(m.display_name||m.user_id||'')}</small></td><td>${esc(roles[m.staff_role]||m.staff_role||'Unassigned')}</td><td>${esc(m.age_group||'All age groups')}</td><td><span class="staff-status${active&&!disabled?'':' inactive'}">${esc(status)}</span></td><td>${esc(date)}</td><td><div class="staff-actions"><button type="button" class="staff-action" data-staff-active="${esc(m.id)}" data-next-active="${active?'false':'true'}" ${disabled?'disabled':''}>${active?'Deactivate':'Activate'}</button><button type="button" class="staff-action remove" data-staff-remove="${esc(m.id)}">Remove</button></div></td></tr>`;
  }).join('');
  list.querySelectorAll('[data-staff-active]').forEach(b=>b.addEventListener('click',()=>void setActive(b)));
  list.querySelectorAll('[data-staff-remove]').forEach(b=>b.addEventListener('click',()=>void removeStaff(b)));
}
async function loadStaff(showNotice=false){
  const teamSlug=teamSelect.value;if(!teams[teamSlug])return;
  if(count)count.textContent=`Loading staff for ${teams[teamSlug]}…`;list.innerHTML='<tr><td colspan="6">Loading staff…</td></tr>';
  try{const result=await callStaffFunction({action:'list',team_slug:teamSlug});staff=Array.isArray(result.staff)?result.staff:[];renderStaff();if(showNotice)notice(`Staff refreshed for ${teams[teamSlug]}.`);}
  catch(e){staff=[];list.innerHTML=`<tr><td colspan="6">${esc(e.message)}</td></tr>`;if(count)count.textContent='Staff list could not be loaded.';notice(e.message,true);}
}
function clearSelected(){selectedAccount=null;if(selectedAccountText)selectedAccountText.textContent='No account selected.';if(existingAssignButton)existingAssignButton.disabled=true;}
function setMode(mode){document.querySelectorAll('[data-staff-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.staffMode===mode)));existingPanel.hidden=mode!=='existing';invitePanel.hidden=mode!=='invite';}
function renderResults(accounts,query){
  if(!accountResults)return;
  if(!accounts.length){accountResults.innerHTML=`<p class="staff-note">No account matched “${esc(query)}”. Use Invite by email only if this person does not already have an account.</p>`;return;}
  accountResults.innerHTML=`<ul class="staff-account-results">${accounts.map(a=>`<li><button type="button" class="staff-account-result" data-select-account="${esc(a.user_id)}" aria-pressed="${selectedAccount?.user_id===a.user_id?'true':'false'}"><span><strong>${esc(a.display_name||'Account holder')}</strong><small>${esc(a.email)}</small></span><span>${selectedAccount?.user_id===a.user_id?'SELECTED':'SELECT'}</span></button></li>`).join('')}</ul>`;
  accountResults.querySelectorAll('[data-select-account]').forEach(b=>b.addEventListener('click',()=>{selectedAccount=accounts.find(a=>a.user_id===b.dataset.selectAccount)||null;if(selectedAccountText)selectedAccountText.textContent=selectedAccount?`Selected: ${selectedAccount.display_name||selectedAccount.email} (${selectedAccount.email})`:'No account selected.';if(existingAssignButton)existingAssignButton.disabled=!selectedAccount;renderResults(accounts,query);}));
}
async function searchAccounts(){
  const query=String(accountSearch.value||'').trim(), id=++searchRequest;clearSelected();
  if(query.length<2){accountResults.innerHTML='<p class="staff-note">Enter at least two characters to search existing accounts.</p>';return;}
  accountResults.innerHTML='<p class="staff-note">Searching existing accounts…</p>';
  try{const result=await callStaffFunction({action:'search_accounts',query});if(id!==searchRequest)return;renderResults(Array.isArray(result.accounts)?result.accounts:[],query);}
  catch(e){if(id===searchRequest)accountResults.innerHTML=`<p class="staff-note">${esc(e.message)}</p>`;}
}
async function assignExisting(){
  if(!selectedAccount){notice('Search for and select an existing account first.',true);return;}
  const teamSlug=teamSelect.value, age=selectedAgeGroup(), role=roleSelect.value;existingAssignButton.disabled=true;existingAssignButton.textContent='ASSIGNING…';
  try{await callStaffFunction({action:'assign',user_id:selectedAccount.user_id,team_slug:teamSlug,age_group:age,staff_role:role});const name=selectedAccount.display_name||selectedAccount.email;notice(`${name} assigned to ${teams[teamSlug]} · ${age==='all'?'all age groups':age} as ${roles[role]}.`);accountSearch.value='';accountResults.innerHTML='<p class="staff-note">Account assigned. Search again to add another person.</p>';clearSelected();await loadStaff();}
  catch(e){notice(e.message,true);}finally{existingAssignButton.disabled=!selectedAccount;updateContext();}
}
async function inviteStaff(event){
  event.preventDefault();const email=String(new FormData(form).get('email')||'').trim().toLowerCase(),teamSlug=teamSelect.value,age=selectedAgeGroup(),role=roleSelect.value;
  if(!email||!teams[teamSlug]||!roles[role]){notice('Enter a valid email address and confirm the team, age group and position.',true);return;}
  submitButton.disabled=true;submitButton.textContent='SENDING INVITATION…';
  try{const result=await callStaffFunction({action:'invite',email,team_slug:teamSlug,age_group:age,staff_role:role});form.reset();notice(result.invitation_sent?`Invitation sent to ${email} for ${teams[teamSlug]} · ${age==='all'?'all age groups':age} as ${roles[role]}.`:`Existing account ${email} assigned to ${teams[teamSlug]} · ${age==='all'?'all age groups':age} as ${roles[role]}.`);await loadStaff();}
  catch(e){notice(e.message,true);}finally{submitButton.disabled=false;updateContext();}
}
async function setActive(button){const id=button.dataset.staffActive,active=button.dataset.nextActive==='true',m=staff.find(x=>x.id===id),label=m?.email||'this staff member';if(!confirm(`${active?'Activate':'Deactivate'} ${label} for ${teams[teamSelect.value]}?`))return;button.disabled=true;try{await callStaffFunction({action:'set_active',membership_id:id,is_active:active});notice(`${label} ${active?'activated':'deactivated'} for ${teams[teamSelect.value]}.`);await loadStaff();}catch(e){notice(e.message,true);button.disabled=false;}}
async function removeStaff(button){const id=button.dataset.staffRemove,m=staff.find(x=>x.id===id),email=m?.email||'this staff member';if(!confirm(`Remove ${email} from ${teams[teamSelect.value]}? This removes only the team assignment.`))return;button.disabled=true;try{await callStaffFunction({action:'remove',membership_id:id});notice(`${email} removed from ${teams[teamSelect.value]}.`);await loadStaff();}catch(e){notice(e.message,true);button.disabled=false;}}
async function init(){
  if(!client){notice('Supabase configuration is missing. Check public/supabase-config.js.',true);return;}
  const {data,error}=await client.auth.getSession();if(error||!data.session){location.replace('parent-account.html');return;}
  const {data:isAdmin,error:adminError}=await client.rpc('kha_is_admin');if(adminError||isAdmin!==true){notice('This page is restricted to approved academy administrators.',true);document.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);return;}
  const requestedTeam=params.get('team');const requestedAge=(params.get('age_group')||params.get('age')||'').toUpperCase();
  if(requestedTeam&&teams[requestedTeam]){teamSelect.value=requestedTeam;teamSelect.disabled=true;}
  if(['U9','U11','U13','U15'].includes(requestedAge)){ageGroupSelect.value=requestedAge;ageGroupSelect.disabled=true;}
  const email=document.querySelector('[data-staff-admin-email]');if(email)email.textContent=data.session.user.email||'';
  document.querySelector('[data-staff-admin-logout]')?.addEventListener('click',async()=>{await client.auth.signOut();location.replace('parent-account.html');});
  document.querySelectorAll('[data-staff-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.staffMode)));
  teamSelect.addEventListener('change',()=>{updateContext();notice('');void loadStaff();});ageGroupSelect.addEventListener('change',()=>{updateContext();renderStaff();});
  accountSearch.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void searchAccounts(),300);});
  existingAssignButton.addEventListener('click',()=>void assignExisting());form.addEventListener('submit',inviteStaff);
  document.querySelector('[data-staff-refresh]')?.addEventListener('click',()=>void loadStaff(true));
  updateContext();setMode('existing');await loadStaff();accountResults.innerHTML='<p class="staff-note">Enter at least two characters to search existing accounts.</p>';
}
init();
