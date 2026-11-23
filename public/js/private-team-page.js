import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const teams = {
  'nova-scotia-kings': { name: 'Nova Scotia Kings', city: 'Pictou County' },
  'nova-scotia-vipers': { name: 'Nova Scotia Vipers', city: 'Greater Halifax' },
  'quebec-predators': { name: 'Quebec Predators', city: 'Quebec City' },
  'montreal-sentinels': { name: 'Montreal Sentinels', city: 'Montreal' }
};
const allowedGroups = ['U9','U11','U13','U15'];
const params = new URLSearchParams(location.search);
const teamSlug = params.get('team');
const ageGroup = (params.get('age_group') || '').toUpperCase();
const team = teams[teamSlug];
const pageType = document.body.dataset.privateTeamPage;
const message = document.querySelector('[data-team-message]');
const privateContent = document.querySelector('[data-team-private]');
const loginLink = document.querySelector('[data-team-login]');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const showMessage = (text, kind='') => { message.textContent=text; message.className=`alert${kind ? ` ${kind}` : ''}`; message.hidden=!text; };

function links() {
  const query = `team=${encodeURIComponent(teamSlug)}&age_group=${encodeURIComponent(ageGroup)}`;
  document.querySelector('[data-team-roster-tab]').href = `team-roster.html?${query}`;
  document.querySelector('[data-team-schedule-tab]').href = `team-schedule.html?${query}`;
  document.querySelector('[data-team-back]').href = `teams/${teamSlug}.html`;
}

async function initialize() {
  if (!team || !allowedGroups.includes(ageGroup)) {
    showMessage('This team or age group could not be found.', 'error');
    return;
  }
  document.title = `${team.name} ${ageGroup} ${pageType} | Kings Hockey Academy`;
  document.querySelector('[data-team-heading]').innerHTML = `${esc(team.name)}<br><em>${ageGroup} ${pageType === 'roster' ? 'ROSTER' : 'SCHEDULE'}.</em>`;
  document.querySelector('[data-team-subtitle]').textContent = `${team.city} · ${ageGroup} · Private family access`;
  links();

  const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY;
  if (!configured) { showMessage('The family access system is not connected. Please contact the academy.', 'error'); return; }
  const client = createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY);
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) { showMessage('Your sign-in could not be checked. Refresh or sign in again.', 'error'); return; }
  if (!sessionData.session) {
    showMessage('Sign in with your family account to view this private team page.');
    loginLink.hidden = false;
    return;
  }
  const { data: rosterProbe, error: accessError } = await client.rpc('get_team_roster', { p_team_slug: teamSlug, p_age_group: ageGroup });
  if (accessError) {
    showMessage('This family account has not been granted access to this team age group. Contact the academy administrator.');
    return;
  }
  privateContent.hidden = false;
  if (pageType === 'roster') await renderRoster(rosterProbe || []);
  else await loadSchedule(client);
}

function renderRoster(data) {
  const list = document.querySelector('[data-roster-list]');
  if (!data?.length) list.innerHTML = '<p class="private-team-empty">No players have been assigned to this roster yet.</p>';
  else list.innerHTML = data.map((player,index) => `<article class="private-roster-card"><span class="private-roster-number">${player.jersey_number ? `#${esc(player.jersey_number)}` : '—'}</span><div><h3>${esc(player.first_name)} ${esc(player.last_name)}</h3><p>${esc(player.position || 'POSITION TBC')}</p></div></article>`).join('');
  showMessage('Private roster · read-only family access.', 'success');
}

let currentMonth = new Date();
currentMonth = new Date(currentMonth.getFullYear(),currentMonth.getMonth(),1);
let allEvents = [];
const monthTitle = document.querySelector('[data-calendar-month]');
const calendarGrid = document.querySelector('[data-calendar-grid]');
const eventList = document.querySelector('[data-team-event-list]');
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const formatDate = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-CA',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'});
const formatTime = value => { if(!value) return ''; const [h,m]=value.slice(0,5).split(':').map(Number); const hour=h%12||12; return `${hour}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };

async function loadSchedule(client) {
  const first = dateKey(currentMonth);
  const lastDate = new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,0);
  const last = dateKey(lastDate);
  const { data, error } = await client.from('team_schedule_events').select('id,title,event_type,event_date,start_time,end_time,location,details')
    .eq('team_slug',teamSlug).eq('age_group',ageGroup).gte('event_date',first).lte('event_date',last).order('event_date').order('start_time');
  if (error) {
    privateContent.hidden=true;
    showMessage('The team schedule could not be loaded. Please contact the academy administrator.', 'error');
    return;
  }
  allEvents = data || [];
  renderCalendar();
  const today = dateKey(new Date());
  const { data: upcoming, error: upcomingError } = await client.from('team_schedule_events').select('id,title,event_type,event_date,start_time,end_time,location,details')
    .eq('team_slug',teamSlug).eq('age_group',ageGroup).gte('event_date',today).order('event_date').order('start_time').limit(30);
  renderEvents(upcomingError ? allEvents : (upcoming || []));
  showMessage('Private team schedule · read-only family access.', 'success');
}

function renderCalendar() {
  monthTitle.textContent = currentMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const start = new Date(currentMonth.getFullYear(),currentMonth.getMonth(),1);
  const offset = (start.getDay()+6)%7;
  const gridStart = new Date(start); gridStart.setDate(start.getDate()-offset);
  const headers = ['MON','TUE','WED','THU','FRI','SAT','SUN'].map(day=>`<div class="team-calendar-weekday">${day}</div>`).join('');
  let days='';
  for(let i=0;i<42;i++){
    const date=new Date(gridStart); date.setDate(gridStart.getDate()+i);
    const key=dateKey(date);
    const events=allEvents.filter(event=>event.event_date===key);
    days+=`<div class="team-calendar-day ${date.getMonth()!==currentMonth.getMonth()?'is-outside':''} ${key===dateKey(new Date())?'is-today':''}"><span>${date.getDate()}</span>${events.slice(0,2).map(event=>`<small title="${esc(event.title)}">${esc(event.title)}</small>`).join('')}${events.length>2?`<small>+${events.length-2} more</small>`:''}</div>`;
  }
  calendarGrid.innerHTML=headers+days;
}
function renderEvents(events) {
  if(!events.length){eventList.innerHTML='<p class="private-team-empty">No upcoming events have been posted for this team.</p>';return;}
  eventList.innerHTML=events.map(event=>`<article class="team-event-card"><div class="team-event-date"><strong>${esc(new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString('en-CA',{timeZone:'UTC',day:'2-digit'}))}</strong><span>${esc(new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString('en-CA',{timeZone:'UTC',month:'short'}).toUpperCase())}</span></div><div class="team-event-copy"><p class="eyebrow dark">${esc(event.event_type)}</p><h3>${esc(event.title)}</h3><p>${esc(formatDate(event.event_date))}${event.start_time?` · ${esc(formatTime(event.start_time))}`:''}${event.end_time?`–${esc(formatTime(event.end_time))}`:''}</p>${event.location?`<p>${esc(event.location)}</p>`:''}${event.details?`<p>${esc(event.details)}</p>`:''}</div></article>`).join('');
}
document.querySelector('[data-calendar-prev]')?.addEventListener('click',()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);loadSchedule(clientRef);});
document.querySelector('[data-calendar-next]')?.addEventListener('click',()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);loadSchedule(clientRef);});
document.querySelector('[data-calendar-today]')?.addEventListener('click',()=>{currentMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);loadSchedule(clientRef);});
let clientRef;
const originalInitialize=initialize;
const initWithClient=async()=>{const configured=window.KHA_SUPABASE_URL?.startsWith('https://')&&window.KHA_SUPABASE_PUBLISHABLE_KEY; if(configured) clientRef=createClient(window.KHA_SUPABASE_URL,window.KHA_SUPABASE_PUBLISHABLE_KEY); await originalInitialize();};
initialize = initWithClient;
initialize();
