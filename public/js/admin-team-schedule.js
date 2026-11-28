import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const teams = {'nova-scotia-kings':'Nova Scotia Kings','nova-scotia-vipers':'Nova Scotia Vipers','quebec-predators':'Quebec Predators','montreal-sentinels':'Montreal Sentinels'};
const configured=window.KHA_SUPABASE_URL?.startsWith('https://')&&window.KHA_SUPABASE_PUBLISHABLE_KEY&&!window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client=configured?createClient(window.KHA_SUPABASE_URL,window.KHA_SUPABASE_PUBLISHABLE_KEY):null;
const form=document.querySelector('[data-team-event-form]');
const list=document.querySelector('[data-team-admin-events]');
const notice=document.querySelector('[data-team-admin-message]');
const filterTeam=document.querySelector('[data-event-filter-team]');
const filterAge=document.querySelector('[data-event-filter-age]');
const scheduleParams=new URLSearchParams(location.search);
const requestedTeam=scheduleParams.get('team');
const requestedAge=(scheduleParams.get('age')||'').toUpperCase();
const validAge=['U9','U11','U13','U15'].includes(requestedAge);
// A team+age URL is a private, isolated schedule view.
const scopedSchedule=Boolean(teams[requestedTeam]&&validAge);
if(filterTeam&&teams[requestedTeam])filterTeam.value=requestedTeam;
if(filterAge&&validAge)filterAge.value=requestedAge;
if(form&&teams[requestedTeam])form.elements.team_slug.value=requestedTeam;
if(form&&validAge)form.elements.age_group.value=requestedAge;
if(scopedSchedule){
  // Keep the scoped page from offering other teams or age groups.
  const keepOnly=(select,value,label)=>{if(!select)return;select.innerHTML='';const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);select.value=value;};
  keepOnly(form?.elements.team_slug,requestedTeam,teams[requestedTeam]);
  keepOnly(form?.elements.age_group,requestedAge,requestedAge);
  keepOnly(filterTeam,requestedTeam,teams[requestedTeam]);
  keepOnly(filterAge,requestedAge,requestedAge);
  const filterPanel=document.querySelector('.team-admin-filter');if(filterPanel)filterPanel.hidden=true;
  const heading=document.querySelector('.team-schedule-admin h1');if(heading)heading.innerHTML=`${teams[requestedTeam].toUpperCase()}<br><em>${requestedAge} SCHEDULE.</em>`;
  // On a team-specific schedule, team and age are fixed by the page URL.
  // Keep the form controls in the DOM for FormData, but don't show dropdowns.
  document.querySelectorAll('[data-team-event-form] label').forEach(label=>{
    if(label.querySelector('[name=team_slug],[name=age_group]'))label.hidden=true;
  });
  const fixedMessage=document.querySelector('[data-schedule-fixed-message]');
  if(fixedMessage){
    fixedMessage.textContent=`This calendar is for ${teams[requestedTeam]} ${requestedAge} only. New and edited events are automatically assigned to this team and age group.`;
    fixedMessage.hidden=false;
  }
}
const cancel=document.querySelector('[data-event-cancel]');
let events=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=(text,error=false)=>{notice.textContent=text;notice.className=`alert${error?' error':' success'} admin-message`;notice.hidden=!text;};
const dateText=value=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en-CA',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'});
const timeText=value=>{if(!value)return '';const [h,m]=value.slice(0,5).split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;};
function resetForm(){form.reset();form.elements.id.value='';if(teams[requestedTeam])form.elements.team_slug.value=requestedTeam;if(['U9','U11','U13','U15'].includes(requestedAge))form.elements.age_group.value=requestedAge;cancel.hidden=true;form.querySelector('[data-event-save]').textContent='SAVE EVENT ↗';}
function render(){
 const team=filterTeam.value,age=filterAge.value;
 const rows=events.filter(e=>(team==='all'||e.team_slug===team)&&(age==='all'||e.age_group===age));
 if(!rows.length){list.innerHTML='<p class="admin-program-empty">No events match these filters.</p>';return;}
 list.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date / Time</th><th>Team</th><th>Age</th><th>Event</th><th>Location</th><th>Actions</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(dateText(e.event_date))}<br><small>${esc(timeText(e.start_time))}${e.end_time?`–${esc(timeText(e.end_time))}`:''}</small></td><td>${esc(teams[e.team_slug])}</td><td>${esc(e.age_group)}</td><td><strong>${esc(e.title)}</strong><br><small>${esc(e.event_type)}${e.details?` · ${esc(e.details)}`:''}</small></td><td>${esc(e.location||'—')}</td><td><button type="button" class="parent-text-button" data-event-edit="${esc(e.id)}">EDIT</button> <button type="button" class="admin-delete-button" data-event-delete="${esc(e.id)}">DELETE</button></td></tr>`).join('')}</tbody></table></div>`;
 list.querySelectorAll('[data-event-edit]').forEach(button=>button.addEventListener('click',()=>editEvent(events.find(e=>e.id===button.dataset.eventEdit))));
 list.querySelectorAll('[data-event-delete]').forEach(button=>button.addEventListener('click',async()=>{
  const event=events.find(e=>e.id===button.dataset.eventDelete);if(!event||!confirm(`Delete "${event.title}" from this team schedule?`))return;
  let deletion=client.from('team_schedule_events').delete().eq('id',event.id);if(scopedSchedule)deletion=deletion.eq('team_slug',requestedTeam).eq('age_group',requestedAge);const {error}=await deletion;
  if(error){msg('Event could not be deleted. Confirm you are an approved admin.',true);return;}
  msg('Event deleted.');await loadEvents();
 }));
}
function editEvent(event){if(!event)return;Object.entries({id:event.id,team_slug:event.team_slug,age_group:event.age_group,event_type:event.event_type,title:event.title,event_date:event.event_date,start_time:event.start_time?.slice(0,5)||'',end_time:event.end_time?.slice(0,5)||'',location:event.location||'',details:event.details||''}).forEach(([key,value])=>form.elements.namedItem(key).value=value);cancel.hidden=false;form.querySelector('[data-event-save]').textContent='UPDATE EVENT ↗';form.scrollIntoView({behavior:'smooth',block:'start'});}
async function loadEvents(){
 list.innerHTML='<p>Loading schedule events…</p>';
 let query=client.from('team_schedule_events').select('*');if(scopedSchedule)query=query.eq('team_slug',requestedTeam).eq('age_group',requestedAge);const {data,error}=await query.order('event_date',{ascending:true}).order('start_time',{ascending:true});
 if(error){list.innerHTML='<p class="admin-program-empty">Could not load team events. This page requires an approved KHA admin account and the team schedule migration.</p>';msg('Admin access or database setup is missing.',true);return;}
 events=data||[];render();
}
form.addEventListener('submit',async event=>{
 event.preventDefault();const values=new FormData(form);const id=String(values.get('id')||'');
 const record={team_slug:String(values.get('team_slug')),age_group:String(values.get('age_group')),event_type:String(values.get('event_type')),title:String(values.get('title')).trim(),event_date:String(values.get('event_date')),start_time:values.get('start_time')||null,end_time:values.get('end_time')||null,location:String(values.get('location')||'').trim()||null,details:String(values.get('details')||'').trim()||null,updated_at:new Date().toISOString()};
 // The scoped URL is authoritative: never let a scoped schedule save to another team/age.
 if(scopedSchedule){record.team_slug=requestedTeam;record.age_group=requestedAge;}
 if(record.start_time&&record.end_time&&record.end_time<=record.start_time){msg('End time must be later than start time. For an event crossing midnight, leave the end time blank and explain it in Details.',true);return;}
 let saveResult;if(id){let update=client.from('team_schedule_events').update(record).eq('id',id);if(scopedSchedule)update=update.eq('team_slug',requestedTeam).eq('age_group',requestedAge);saveResult=await update;}else{saveResult=await client.from('team_schedule_events').insert(record);}const {error}=saveResult;
 if(error){msg(error.message||'Event could not be saved. Only approved admins can manage schedules.',true);return;}
 msg(id?'Event updated.':'Event added to the team schedule.');resetForm();await loadEvents();
});
cancel.addEventListener('click',resetForm);
filterTeam.addEventListener('change',render);filterAge.addEventListener('change',render);
document.querySelector('[data-admin-logout]')?.addEventListener('click',async()=>{await client?.auth.signOut();location.replace('parent-account.html');});
async function initialize(){
 if(!client){msg('Supabase is not configured.',true);return;}
 const {data,error}=await client.auth.getSession();if(error||!data.session){location.replace('parent-account.html');return;}
 const {data:isAdmin,error:adminError}=await client.rpc('kha_is_admin');
 if(adminError||isAdmin!==true){msg('This page is restricted to approved academy administrators.',true);form.hidden=true;return;}
 document.querySelector('[data-team-admin-email]').textContent=data.session.user.email||'';
 const context=document.querySelector('[data-schedule-context]');if(context&&teams[requestedTeam]&&['U9','U11','U13','U15'].includes(requestedAge)){context.hidden=false;const teamLink=context.querySelector('[data-schedule-context-team]');const ageLink=context.querySelector('[data-schedule-context-age]');teamLink.textContent=teams[requestedTeam].toUpperCase();teamLink.href=`admin-team.html?team=${encodeURIComponent(requestedTeam)}`;ageLink.textContent=requestedAge;ageLink.href=`admin-team-age-group.html?team=${encodeURIComponent(requestedTeam)}&age=${encodeURIComponent(requestedAge)}`;}
 await loadEvents();
}
initialize();
