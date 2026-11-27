import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const configured=window.KHA_SUPABASE_URL?.startsWith('https://')&&window.KHA_SUPABASE_PUBLISHABLE_KEY&&!window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client=configured?createClient(window.KHA_SUPABASE_URL,window.KHA_SUPABASE_PUBLISHABLE_KEY):null;
const message=document.querySelector('[data-teams-admin-message]');
function notice(text,error=false){if(!message)return;message.textContent=text;message.className=`alert ${error?'error':'success'} admin-message`;message.hidden=!text;}
async function init(){
  if(!client){notice('Supabase configuration is missing. Check public/supabase-config.js.',true);return;}
  const {data,error}=await client.auth.getSession();
  if(error||!data.session){location.replace('admin.html');return;}
  const {data:admin, error:adminError}=await client.rpc('kha_is_admin');
  if(adminError||admin!==true){notice('This page is restricted to approved academy administrators.',true);document.querySelector('.admin-team-grid')?.setAttribute('aria-disabled','true');return;}
  const email=document.querySelector('[data-teams-admin-email]');if(email)email.textContent=data.session.user.email||'';
  document.querySelector('[data-teams-admin-logout]')?.addEventListener('click',async()=>{await client.auth.signOut();location.replace('admin.html');});
}
init();
