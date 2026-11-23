import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('SITE_ORIGIN') || 'https://kingshockeyacademyns-sys.github.io';
const corsHeaders = {
  'Access-Control-Allow-Origin': origin ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

Deno.serve(async request => {
  if (request.headers.get('Origin') !== origin) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !url || !anonKey || !serviceKey) return json({ error: 'Sign in as an administrator to continue.' }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Your admin session has expired. Sign in again.' }, 401);
  const { data: isAdmin, error: roleError } = await caller.rpc('kha_is_admin');
  if (roleError || isAdmin !== true) return json({ error: 'This account is not approved to manage family accounts.' }, 403);

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const body = await request.json();
    const action = String(body?.action ?? '');
    if (action === 'list') {
      const users: Array<Record<string, any>> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 50) break;
      }
      const { data: admins, error: adminError } = await caller.rpc('kha_admin_account_ids');
      if (adminError) throw adminError;
      const adminIds = new Set((admins || []).map((id: string) => id));
      const counts = new Map<string, number>();
      const ids = users.map(user => String(user.id));
      for (let offset = 0; offset < ids.length; offset += 500) {
        const { data: children, error } = await service.from('parent_children').select('parent_id').in('parent_id', ids.slice(offset, offset + 500));
        if (error) throw error;
        (children || []).forEach(child => counts.set(child.parent_id, (counts.get(child.parent_id) || 0) + 1));
      }
      const { data: preferences, error: preferenceError } = await service.from('parent_email_preferences').select('user_id,marketing_opt_in');
      if (preferenceError) throw preferenceError;
      const optedIn = new Set((preferences || []).filter(item => item.marketing_opt_in).map(item => item.user_id));
      const { data: profiles, error: profileError } = await service.from('parent_profiles')
        .select('user_id,first_name,last_name,phone,street_number,postal_code,province,second_guardian_first,second_guardian_last,second_guardian_email,second_guardian_phone,second_guardian_street_number,second_guardian_postal_code,second_guardian_province,emergency_name,emergency_relationship,emergency_phone')
        .in('user_id', ids);
      if (profileError) throw profileError;
      const parentProfiles = new Map((profiles || []).map(profile => [profile.user_id, profile]));
      const now = Date.now();
      return json({ users: users.map(user => ({
        id: user.id,
        email: user.email || '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_confirmed: Boolean(user.email_confirmed_at),
        disabled: Boolean(user.banned_until && new Date(user.banned_until).getTime() > now),
        is_admin: adminIds.has(String(user.id)),
        child_count: counts.get(String(user.id)) || 0,
        news_opt_in: optedIn.has(String(user.id)),
        parent_profile: parentProfiles.get(String(user.id)) || null,
      })) });
    }

    if (action === 'invite') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!emailPattern.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400);
      const siteBase = `${origin.replace(/\/$/, '')}/kings-hockey-academy-site`;
      const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteBase}/parent-account.html` });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) return json({ error: 'An account already exists for that email.' }, 409);
        throw error;
      }
      return json({ ok: true, id: data.user?.id, email });
    }

    if (action === 'list_team_rosters') {
      const { data: grants, error: grantError } = await service.from('team_age_group_access')
        .select('id,parent_id,player_id,team_slug,age_group,jersey_number,position,granted_at')
        .not('player_id', 'is', null).order('granted_at', { ascending: false }).limit(5000);
      if (grantError) throw grantError;
      const playerIds = [...new Set((grants || []).map(grant => grant.player_id))];
      const parentIds = [...new Set((grants || []).map(grant => grant.parent_id))];
      const { data: children, error: childError } = playerIds.length
        ? await service.from('parent_children').select('id,first_name,last_name,date_of_birth').in('id', playerIds)
        : { data: [], error: null };
      if (childError) throw childError;
      const players = new Map((children || []).map(child => [child.id, child]));
      const parents = new Map<string, string>();
      for (let page = 1; page <= 20; page += 1) {
        const { data, error: usersError } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (usersError) throw usersError;
        for (const user of data.users) if (parentIds.includes(user.id)) parents.set(user.id, user.email || '');
        if (data.users.length < 50 || parentIds.every(id => parents.has(id))) break;
      }
      return json({ roster: (grants || []).map(grant => ({
        ...grant,
        player: players.get(grant.player_id) || null,
        parent_email: parents.get(grant.parent_id) || '',
      })) });
    }

    if (action === 'search_registrations') {
      const query = String(body?.query ?? '').trim().replace(/\s+/g, ' ');
      if (query.length < 2 || query.length > 100) return json({ error: 'Enter between 2 and 100 characters to search parent-submitted registrations.' }, 400);

      // Parent-submitted registrations live in public.registrations. They are linked
      // to the family account by family_user_id, then matched to that parent's saved
      // child profile by name and date of birth so roster assignments use a real player_id.
      const { data: registrationRows, error: registrationError } = await service.from('registrations')
        .select('id,family_user_id,program_id,program_type,player_first,player_last,date_of_birth,birth_year,guardian_name,email,created_at')
        .not('program_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (registrationError) throw registrationError;

      const rows: Record<string, any>[] = (registrationRows || []) as Record<string, any>[];
      const users: Array<Record<string, any>> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error: usersError } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (usersError) throw usersError;
        users.push(...data.users);
        if (data.users.length < 50) break;
      }
      const userByEmail = new Map(users.map(user => [String(user.email || '').trim().toLowerCase(), user]));
      const userById = new Map(users.map(user => [String(user.id), user]));
      const resolveParentId = (row: Record<string, any>) => {
        const savedId = String(row.family_user_id || '').trim();
        if (savedId) return savedId;
        return String(userByEmail.get(String(row.email || '').trim().toLowerCase())?.id || '');
      };
      const parentIds = [...new Set(rows.map(resolveParentId).filter(Boolean))];
      const childRows: Record<string, any>[] = [];
      for (let offset = 0; offset < parentIds.length; offset += 500) {
        const { data, error: childError } = await service.from('parent_children')
          .select('id,parent_id,first_name,last_name,date_of_birth')
          .in('parent_id', parentIds.slice(offset, offset + 500));
        if (childError) throw childError;
        childRows.push(...((data || []) as Record<string, any>[]));
      }
      const childrenByParent = new Map<string, Record<string, any>[]>();
      for (const child of childRows) {
        const key = String(child.parent_id);
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key)!.push(child);
      }
      const programIds = [...new Set(rows.map(row => String(row.program_id || '')).filter(Boolean))];
      const programRows: Record<string, any>[] = [];
      for (let offset = 0; offset < programIds.length; offset += 500) {
        const { data, error: programError } = await service.from('programs')
          .select('id,title,season')
          .in('id', programIds.slice(offset, offset + 500));
        if (programError) throw programError;
        programRows.push(...((data || []) as Record<string, any>[]));
      }
      const programById = new Map(programRows.map(program => [String(program.id), program]));
      const { data: profileRows, error: profileError } = parentIds.length
        ? await service.from('parent_profiles').select('user_id,first_name,last_name').in('user_id', parentIds.slice(0, 1000))
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profileById = new Map(((profileRows || []) as Record<string, any>[]).map(profile => [String(profile.user_id), profile]));
      const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      const normalized = normalize(query);
      const matches: Record<string, any>[] = [];
      let unmatchedCount = 0;

      for (const registration of rows) {
        const parentId = resolveParentId(registration);
        const profile = parentId ? profileById.get(parentId) : null;
        const authUser = parentId ? userById.get(parentId) : null;
        const parentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || String(registration.guardian_name || '');
        const program = programById.get(String(registration.program_id));
        const childName = `${registration.player_first || ''} ${registration.player_last || ''}`.trim();
        const haystack = [registration.id, `registration #${registration.id}`, registration.player_first, registration.player_last,
          childName, parentName, registration.email, program?.title, program?.season, registration.program_type, 'submitted']
          .map(normalize).join(' | ');
        if (!haystack.includes(normalized)) continue;

        const parentChildren = parentId ? (childrenByParent.get(parentId) || []) : [];
        const first = normalize(registration.player_first);
        const last = normalize(registration.player_last);
        const dob = String(registration.date_of_birth || '').slice(0, 10);
        const birthYear = Number(registration.birth_year || (dob ? dob.slice(0, 4) : 0));
        const candidates = parentChildren.filter(child => normalize(child.first_name) === first && normalize(child.last_name) === last &&
          (dob ? String(child.date_of_birth || '').slice(0, 10) === dob : Number(String(child.date_of_birth || '').slice(0, 4)) === birthYear));
        if (candidates.length !== 1) {
          unmatchedCount += 1;
          continue;
        }
        const child = candidates[0];
        matches.push({
          id: child.id,
          parent_id: child.parent_id,
          first_name: child.first_name,
          last_name: child.last_name,
          date_of_birth: child.date_of_birth,
          parent_name: parentName,
          parent_email: registration.email || authUser?.email || '',
          registration_id: registration.id,
          registration_request_id: null,
          registration_status: 'submitted',
          program_id: registration.program_id,
          program_type: program?.season || registration.program_type || '',
          program_title: program?.title || registration.program_type || 'Parent registration',
          registered_at: registration.created_at,
        });
      }
      return json({ players: matches.slice(0, 100), unmatched_count: unmatchedCount });
    }

    if (action === 'search_players') {
      const query = String(body?.query ?? '').trim().replace(/\s+/g, ' ');
      if (query.length < 2 || query.length > 100) return json({ error: 'Enter between 2 and 100 characters to search.' }, 400);
      const [{ data: children, error: childError }, { data: profiles, error: profileError }] = await Promise.all([
        service.from('parent_children').select('id,parent_id,first_name,last_name,date_of_birth,street_number,postal_code,province').limit(5000),
        service.from('parent_profiles').select('user_id,first_name,last_name,phone,street_number,postal_code,province,emergency_name,emergency_relationship,emergency_phone,second_guardian_email'),
      ]);
      if (childError) throw childError;
      if (profileError) throw profileError;
      const normalized = query.toLocaleLowerCase();
      const profileById = new Map((profiles || []).map(profile => [profile.user_id, profile]));
      const matches = (children || []).filter(child => {
        const profile = profileById.get(child.parent_id);
        return `${child.first_name} ${child.last_name}`.toLocaleLowerCase().includes(normalized)
          || `${profile?.first_name || ''} ${profile?.last_name || ''}`.toLocaleLowerCase().includes(normalized);
      }).slice(0, 100);
      const users: Array<Record<string, any>> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 50) break;
      }
      const userById = new Map(users.map(user => [user.id, user]));
      const ready = (profile: Record<string, any> | undefined, child: Record<string, any>, user: Record<string, any> | undefined) => Boolean(
        user?.email && user.email_confirmed_at && (!user.banned_until || new Date(user.banned_until).getTime() <= Date.now())
        && profile?.first_name && profile?.last_name && profile?.phone && profile?.street_number && profile?.postal_code && profile?.province
        && profile?.emergency_name && profile?.emergency_relationship && profile?.emergency_phone
        && child.date_of_birth && child.street_number && child.postal_code && child.province
      );
      return json({ players: matches.map(child => {
        const profile = profileById.get(child.parent_id);
        const user = userById.get(child.parent_id);
        return {
          id: child.id,
          parent_id: child.parent_id,
          first_name: child.first_name,
          last_name: child.last_name,
          date_of_birth: child.date_of_birth,
          parent_name: profile ? `${profile.first_name} ${profile.last_name}` : '',
          parent_email: user?.email || '',
          second_guardian_email: profile?.second_guardian_email || '',
          parent_profile_complete: Boolean(profile?.first_name && profile?.last_name && profile?.phone && profile?.street_number && profile?.postal_code && profile?.province && profile?.emergency_name && profile?.emergency_relationship && profile?.emergency_phone),
          can_request: ready(profile, child, user),
        };
      }) });
    }

    if (action === 'list_registration_approval_requests') {
      const { data: rows, error } = await service.from('registration_approval_requests')
        .select('id,parent_id,player_id,program_id,status,created_at,expires_at')
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      const parentIds = [...new Set((rows || []).map(row => row.parent_id))];
      const playerIds = [...new Set((rows || []).map(row => row.player_id))];
      const programIds = [...new Set((rows || []).map(row => row.program_id))];
      const [{ data: children, error: childError }, { data: programsForRequests, error: programError }] = await Promise.all([
        parentIds.length ? service.from('parent_children').select('id,parent_id,first_name,last_name').in('id', playerIds) : Promise.resolve({ data: [], error: null }),
        programIds.length ? service.from('programs').select('id,title').in('id', programIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (childError) throw childError;
      if (programError) throw programError;
      const users = new Map<string, string>();
      for (let page = 1; page <= 20; page += 1) {
        const { data, error: userError } = await service.auth.admin.listUsers({ page, perPage: 50 });
        if (userError) throw userError;
        for (const user of data.users) if (parentIds.includes(user.id)) users.set(user.id, user.email || '');
        if (data.users.length < 50 || parentIds.every(id => users.has(id))) break;
      }
      const players = new Map((children || []).map(child => [child.id, child]));
      const programNames = new Map((programsForRequests || []).map(program => [program.id, program.title]));
      return json({ requests: (rows || []).map(row => {
        const player = players.get(row.player_id);
        return {
          player_name: player ? `${player.first_name} ${player.last_name}` : 'Saved player',
          program_title: programNames.get(row.program_id) || 'Program',
          parent_email: users.get(row.parent_id) || '',
          status: row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : row.status,
          created_at: row.created_at,
        };
      }) });
    }

    if (action === 'request_registration_approval') {
      const childId = String(body?.child_id ?? '');
      const programId = String(body?.program_id ?? '');
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(childId) || !uuidPattern.test(programId)) return json({ error: 'Choose a saved player and an open program.' }, 400);
      const [{ data: child, error: childError }, { data: program, error: programError }, { data: waivers, error: waiverError }] = await Promise.all([
        service.from('parent_children').select('id,parent_id,first_name,last_name,date_of_birth,street_number,postal_code,province').eq('id', childId).maybeSingle(),
        service.from('programs').select('id,title,season,fee,session_count,single_session_available,session_schedule,program_start_date,registration_closes_on,location,dates,questions,jersey_size_enabled,jersey_number_enabled,is_open').eq('id', programId).maybeSingle(),
        service.from('waivers').select('id,title,body,is_active,created_at').eq('is_active', true).order('created_at').order('id'),
      ]);
      if (childError) throw childError;
      if (programError) throw programError;
      if (waiverError) throw waiverError;
      if (!child) return json({ error: 'That saved player could not be found.' }, 404);
      if (!program?.is_open) return json({ error: 'That program is closed or no longer available.' }, 400);
      const todayInHalifax = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Halifax', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (program.registration_closes_on && program.registration_closes_on < todayInHalifax) return json({ error: 'Registration for that program has closed.' }, 400);
      const parentId = String(child.parent_id);
      const [{ data: profile, error: profileError }, { data: userData, error: userError }] = await Promise.all([
        service.from('parent_profiles').select('user_id,first_name,last_name,phone,street_number,postal_code,province,second_guardian_email,emergency_name,emergency_relationship,emergency_phone').eq('user_id', parentId).maybeSingle(),
        service.auth.admin.getUserById(parentId),
      ]);
      if (profileError) throw profileError;
      if (userError) throw userError;
      const parent = userData.user;
      const complete = Boolean(parent?.email && parent.email_confirmed_at && (!parent.banned_until || new Date(parent.banned_until).getTime() <= Date.now())
        && profile?.first_name && profile?.last_name && profile?.phone && profile?.street_number && profile?.postal_code && profile?.province
        && profile?.emergency_name && profile?.emergency_relationship && profile?.emergency_phone
        && child.date_of_birth && child.street_number && child.postal_code && child.province);
      if (!complete) return json({ error: 'The family account needs to confirm its email and complete parent, emergency contact, and player details before a registration request can be sent.' }, 400);

      const input = body?.form_data || {};
      const experienceAllowed = new Set(['', 'New to hockey', 'Learn to skate / play', 'Recreational', 'Competitive']);
      const experience = String(input.experience ?? '').trim();
      const notes = String(input.notes ?? '').trim();
      const jerseyNumber = String(input.jersey_number ?? '').trim();
      const allowedSizes = new Set(['Youth XS', 'Youth S', 'Youth M', 'Youth L', 'Youth XL', 'Adult XS', 'Adult S', 'Adult M', 'Adult L', 'Adult XL', 'Adult 2XL']);
      const customAnswers: Record<string, string> = {};
      if (!experienceAllowed.has(experience) || notes.length > 3000 || (jerseyNumber && (!program.jersey_number_enabled || !/^\d{1,4}$/.test(jerseyNumber)))) return json({ error: 'Check the registration details and try again.' }, 400);
      if (program.jersey_size_enabled) {
        const jerseySize = String(input.custom_answers?.['Jersey size (optional)'] ?? '').trim();
        if (jerseySize && !allowedSizes.has(jerseySize)) return json({ error: 'Choose a valid jersey size.' }, 400);
        if (jerseySize) customAnswers['Jersey size (optional)'] = jerseySize;
      }
      if (!Array.isArray(program.questions) || program.questions.length > 12) return json({ error: 'This program’s registration questions are not available.' }, 400);
      for (let index = 0; index < program.questions.length; index += 1) {
        const answer = String(input.custom_answers?.[String(index)] ?? '').trim();
        if (answer.length > 1000) return json({ error: 'One or more program answers are too long.' }, 400);
        if (answer) customAnswers[String(index)] = answer;
      }
      const snapshot = {
        id: program.id, title: program.title, season: program.season ?? null, fee: program.fee ?? null,
        session_count: program.session_count ?? null, single_session_available: Boolean(program.single_session_available),
        session_schedule: program.session_schedule ?? null, program_start_date: program.program_start_date ?? null,
        registration_closes_on: program.registration_closes_on ?? null, location: program.location ?? null,
        dates: program.dates ?? null, questions: program.questions ?? [],
        jersey_size_enabled: Boolean(program.jersey_size_enabled), jersey_number_enabled: Boolean(program.jersey_number_enabled),
      };
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const approvalToken = [...tokenBytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(approvalToken));
      const tokenHash = [...new Uint8Array(tokenHashBuffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const waiverSnapshot = (waivers || []).map(waiver => ({ id: String(waiver.id), title: waiver.title, body: waiver.body }));
      const savedForm = { jersey_number: jerseyNumber, experience, notes, custom_answers: customAnswers };
      const { data: approval, error: insertError } = await service.from('registration_approval_requests').insert({
        parent_id: parentId, player_id: child.id, program_id: program.id, created_by: authData.user.id,
        token_hash: tokenHash, form_data: savedForm, program_snapshot: snapshot, waiver_snapshot: waiverSnapshot,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).select('id').single();
      if (insertError) throw insertError;
      const siteBase = `${origin.replace(/\/$/, '')}/kings-hockey-academy-site`;
      const approvalUrl = `${siteBase}/family-registration-confirmation.html?token=${approvalToken}`;
      const recipients = [...new Set([parent?.email, profile?.second_guardian_email].filter((value): value is string => Boolean(value && emailPattern.test(value))))];
      const waiverTitles = waiverSnapshot.map(waiver => `<li>${escapeHtml(String(waiver.title))}</li>`).join('') || '<li>No additional waivers are required.</li>';
      const resendKey = Deno.env.get('RESEND_API_KEY');
      const from = Deno.env.get('QUESTION_FROM_EMAIL');
      if (!recipients.length) {
        await service.from('registration_approval_requests').update({ status: 'email_failed', resolved_at: new Date().toISOString() }).eq('id', approval.id);
        return json({ error: 'No valid parent or guardian email address is saved for this player.' }, 400);
      }
      if (!resendKey || !from) {
        await service.from('registration_approval_requests').update({ status: 'email_failed', resolved_at: new Date().toISOString() }).eq('id', approval.id);
        console.error('Parent approval email setup is missing RESEND_API_KEY or QUESTION_FROM_EMAIL.');
        return json({ error: 'The academy email service is not configured to send parent approvals.' }, 503);
      }
      const emailResponse = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(recipients.map(to => ({
          from: `Kings Hockey Academy <${from}>`, to: [to],
          subject: `Parent approval needed: ${child.first_name} ${child.last_name} — ${program.title}`,
          html: `<div style="font-family:Arial,sans-serif;color:#211d14;max-width:620px;margin:auto"><div style="background:#171717;padding:22px;color:#fff"><strong style="color:#d7ad53;letter-spacing:.12em">KINGS HOCKEY ACADEMY</strong></div><div style="padding:25px;background:#f6f4ed"><p>A registration request is ready for your review.</p><p><strong>Player:</strong> ${escapeHtml(`${child.first_name} ${child.last_name}`)}<br><strong>Program:</strong> ${escapeHtml(program.title)}${program.season ? ` · ${escapeHtml(program.season)}` : ''}</p><p>Review and accept these required waivers:</p><ul>${waiverTitles}</ul><p>The registration is confirmed only after you review the waivers and accept the registration and payment terms.</p><p><a href="${approvalUrl}" style="display:inline-block;background:#bd902e;color:#171717;padding:13px 19px;text-decoration:none;font-weight:bold">REVIEW &amp; CONFIRM</a></p><p style="font-size:12px;color:#746f63">This secure link expires in 7 days. If you did not expect this email, you can ignore it.</p></div></div>`,
        }))),
      });
      if (!emailResponse.ok) {
        await service.from('registration_approval_requests').update({ status: 'email_failed', resolved_at: new Date().toISOString() }).eq('id', approval.id);
        console.error('Parent approval email was rejected by Resend:', await emailResponse.text());
        return json({ error: 'The parent approval email could not be sent. Please try again.' }, 502);
      }
      await service.from('registration_approval_requests').update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('parent_id', parentId).eq('player_id', child.id).eq('program_id', program.id).eq('status', 'pending').neq('id', approval.id);
      return json({ ok: true, sent_to: recipients.join(', '), request_id: approval.id });
    }

    const userId = String(body?.user_id ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return json({ error: 'Select a valid account.' }, 400);
    if (userId === authData.user.id) return json({ error: 'You cannot change your own administrator account here.' }, 400);
    const { data: admins, error: adminsError } = await caller.rpc('kha_admin_account_ids');
    if (adminsError) throw adminsError;
    if ((admins || []).includes(userId)) return json({ error: 'Administrator accounts are protected from family-account actions.' }, 403);
    if (action === 'disable' || action === 'enable') {
      const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: action === 'disable' ? '876000h' : 'none' });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'delete') {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: 'Unsupported account action.' }, 400);
  } catch (error) {
    console.error('Family account action failed:', error);
    return json({ error: 'The account action could not be completed. Try again or contact the site administrator.' }, 500);
  }
});
