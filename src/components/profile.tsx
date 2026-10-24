'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, LogOut, Plus, Shield, Trash2 } from 'lucide-react';
import { useCommunity } from '@/components/provider';
import { Avatar, Dialog, Field, SportBadge } from '@/components/primitives';
import { emptyProfile } from '@/lib/client';
import { localeSchema, skillSchema, type CommunityState, type Locale, type Profile, type Skill, type Sport, type Venue } from '@/lib/model';

const weekdays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
const goals = ['casual','learn','regularTraining','competitive','meetPeople','fitness'] as const;
const skills: Skill[] = ['new','beginner','intermediate','advanced'];
const goalTranslation: Record<string,string> = { 'casual activity':'casual', 'learning a new sport':'learn', 'regular training':'regularTraining', 'competitive games':'competitive', 'meeting new people':'meetPeople', 'improving fitness':'fitness' };
const goalKey = (value: string) => goalTranslation[value] ?? value;
const colors = ['#22c55e','#f97316','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#16a34a','#ec4899','#0ea5e9'];

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function safeAvatar(value: string): boolean {
  if (!value.trim()) return true;
  try { const url = new URL(value, window.location.origin); return url.protocol === 'https:'; } catch { return false; }
}
function getViewer(state: CommunityState | null): Profile | undefined { return state?.profiles.find(person => person.id === state.viewerId); }

export function ProfileScreen({ onEdit }: { onEdit: () => void }) {
  const t = useTranslations();
  const { state, client, execute, refresh, locale, setLocale, toast, busy } = useCommunity();
  const viewer = getViewer(state);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [changing, setChanging] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [newSlot, setNewSlot] = useState({ day: 0, start: '17:00', end: '19:00' });
  const [exception, setException] = useState('');
  const allSports = state?.sports ?? [];

  if (!state || !viewer) return <section className="section-pad"><div className="panel stack"><span className="eyebrow">{t('profile')}</span><h1>{t('account')}</h1><p className="muted">{t('profileSignInRequired')}</p><button className="button" onClick={onEdit}>{t('onboarding')}</button></div></section>;
  const current = viewer;
  const connections = state.connections.filter(item => item.status === 'accepted' && (item.from === viewer.id || item.to === viewer.id)).length;
  const currentSkills = Object.entries(current.sports);
  const updateProfile = async (patch: Partial<Profile>) => { await execute({ type: 'profile.save', profile: { ...current, ...patch } }); };
  const addAvailability = () => {
    if (newSlot.start >= newSlot.end) { toast('availabilityInvalid'); return; }
    if (current.availability.some(slot => slot.day === newSlot.day && slot.start === newSlot.start && slot.end === newSlot.end)) return;
    void updateProfile({ availability: [...current.availability, newSlot].sort((a,b) => a.day-b.day || a.start.localeCompare(b.start)) });
  };
  const downloadOwnData = () => downloadJson('hcommunity-my-data.json', {
    profile: current,
    connections: state.connections.filter(item => item.from === current.id || item.to === current.id),
    messages: state.messages.filter(item => item.from === current.id || item.to === current.id),
    sessions: state.sessions.filter(item => item.organizerId === current.id || item.participants.includes(current.id) || item.pending.includes(current.id)),
    comments: state.comments.filter(item => item.authorId === current.id),
    saved: state.saved.filter(id => state.sessions.some(session => session.id === id) || state.sports.some(sport => sport.id === id)),
    exportedAt: new Date().toISOString()
  });
  const submitAvatar = () => {
    if (!safeAvatar(avatar)) { setAvatarError(true); return; }
    setAvatarError(false); void updateProfile({ avatar: avatar.trim() }); setChanging(false);
  };
  const signOut = async () => { await client.signOut(); await refresh(); toast('signedOut'); };
  const deleteAccount = async () => {
    if (deleteName.trim() !== viewer.name) return;
    const ok = await execute({ type: 'account.delete' });
    if (ok) { setConfirmDelete(false); setDeleteName(''); await refresh(); }
  };
  const setFavorite = (id: string) => {
    const favorites = current.favorites.includes(id) ? current.favorites.filter(item => item !== id) : [...current.favorites, id];
    void updateProfile({ favorites });
  };

  return <section className="section-pad stack">
    <header className="profile-hero panel">
      <div className="profile-identity"><Avatar person={viewer} size="large"/><div><span className="eyebrow">{t('profile')}</span><h1>{viewer.name}</h1><p className="muted">{viewer.area} · {t(viewer.role === 'admin' ? 'admin' : viewer.role === 'guest' ? 'guest' : 'member')}</p></div></div>
      <div className="profile-actions"><button className="button-secondary" onClick={onEdit}>{t('edit')}</button><button className="button" onClick={downloadOwnData}><ArrowDownToLine size={17}/>{t('dataExport')}</button></div>
      <p className="profile-bio">{viewer.bio || t('bioPlaceholder')}</p>
    </header>

    <div className="form-grid">
      <article className="panel stack"><header className="settings-row"><div><h2>{t('mySports')}</h2><p className="muted small">{t('profileSportsHelp')}</p></div><button className="button-ghost" onClick={onEdit}>{t('edit')}</button></header>
        {currentSkills.length ? <div className="stack">{currentSkills.map(([id, skill]) => { const sport = allSports.find(item => item.id === id); return sport ? <div className="settings-row" key={id}><SportBadge emoji={sport.emoji} name={sport.name[locale]}/><span className="badge">{skill==='new'?t('newSkill'):t(skill)}</span><button className={`icon-button ${viewer.favorites.includes(id) ? 'active' : ''}`} title={t('favoriteSports')} aria-label={`${t('favoriteSports')}: ${sport.name[locale]}`} onClick={() => setFavorite(id)}>★</button></div> : null; })}</div> : <button className="button-secondary" onClick={onEdit}>{t('addSport')}</button>}
      </article>
      <article className="panel stack"><h2>{t('availability')}</h2><p className="muted small">{t('profileAvailabilityHelp')}</p>
        {weekdays.map((key, day) => { const slots = viewer.availability.filter(slot => slot.day === day); return slots.length ? <div className="settings-row" key={day}><strong>{t(key)}</strong><span>{slots.map(slot => `${slot.start}–${slot.end}`).join(' · ')}</span></div> : null; })}
        <div className="settings-row"><strong>{t('timeZone')}</strong><span>{viewer.timezone}</span></div>
        <div className="form-grid"><Field label={t('day')}><select value={newSlot.day} onChange={e=>setNewSlot({...newSlot,day:Number(e.target.value)})}>{weekdays.map((day,index)=><option key={day} value={index}>{t(day)}</option>)}</select></Field><Field label={t('startTime')}><input type="time" value={newSlot.start} onChange={e=>setNewSlot({...newSlot,start:e.target.value})}/></Field><Field label={t('endTime')}><input type="time" value={newSlot.end} onChange={e=>setNewSlot({...newSlot,end:e.target.value})}/></Field></div>
        <button className="button-secondary" onClick={addAvailability}><Plus size={16}/>{t('addTimeSlot')}</button>
        <div className="form-grid"><Field label={t('exceptionDate')}><input type="date" min={new Date().toISOString().slice(0,10)} value={exception} onChange={e=>setException(e.target.value)}/></Field><button className="button-secondary" onClick={()=>{if(exception){void updateProfile({exceptions:[...viewer.exceptions,{date:exception,unavailable:true}]});setException('');}}}><Plus size={16}/>{t('addException')}</button></div>
        {viewer.exceptions.length>0&&<div className="chips">{viewer.exceptions.map((item,index)=><button key={`${item.date}-${index}`} className="chip" onClick={()=>void updateProfile({exceptions:viewer.exceptions.filter((_,i)=>i!==index)})}>{item.date} · {item.unavailable?t('unavailable'):t('available')} ×</button>)}</div>}
      </article>
    </div>
    <article className="panel stack"><header><h2>{t('preferences')}</h2><p className="muted small">{t('privacy')}</p></header>
      <div className="settings-row"><div><strong>{t('profileVisibility')}</strong><p className="muted small">{t('privateByDefault')}</p></div><button className={`switch ${viewer.discoverable?'active':''}`} role="switch" aria-checked={viewer.discoverable} aria-label={t('discoverable')} onClick={()=>void updateProfile({discoverable:!viewer.discoverable})}><span/></button></div>
      <div className="settings-row"><div><strong>{t('language')}</strong><p className="muted small">{t('languageHelp')}</p></div><div className="chips">{(['en','it'] as Locale[]).map(item=><button key={item} className={`chip ${locale===item?'active':''}`} onClick={()=>{setLocale(item);void updateProfile({locale:item});}}>{item==='en'?'English':'Italiano'}</button>)}</div></div>
      <div className="chips">{viewer.goals.map(goal=><span className="chip" key={goal}>{t.has(goalKey(goal))?t(goalKey(goal)):goal}</span>)}</div>
      <p className="muted small"><Shield size={14}/> {t('privateByDefault')}</p>
    </article>
    <article className="panel stack"><h2>{t('account')}</h2><p className="muted">{t('accountHelp')}</p><div className="profile-actions"><button className="button-secondary" disabled={busy} onClick={()=>{setAvatar(viewer.avatar);setChanging(true);}}>{t('changeAvatar')}</button><button className="button-secondary" onClick={()=>void signOut()}><LogOut size={16}/>{t('signOut')}</button><button className="button-secondary danger" onClick={()=>setConfirmDelete(true)}><Trash2 size={16}/>{t('deleteAccount')}</button></div></article>
    {changing&&<Dialog title={t('changeAvatar')} onClose={()=>setChanging(false)}><div className="stack"><Field label={t('avatarUrl')} hint={t('avatarUrlHelp')}><input type="url" value={avatar} onChange={e=>setAvatar(e.target.value)} placeholder="https://…"/></Field>{avatarError&&<p className="danger">{t('avatarUrlInvalid')}</p>}<div className="profile-actions"><button className="button-secondary" onClick={()=>setChanging(false)}>{t('cancel')}</button><button className="button" onClick={submitAvatar}>{t('save')}</button></div></div></Dialog>}
    {confirmDelete&&<Dialog title={t('deleteAccount')} onClose={()=>{setConfirmDelete(false);setDeleteName('');}}><div className="stack"><p>{t('deleteAccountConfirm')}</p><Field label={t('confirmName', {name:viewer.name})}><input autoComplete="off" value={deleteName} onChange={e=>setDeleteName(e.target.value)}/></Field><p className="muted small">{t('deleteAccountWarning')}</p><div className="profile-actions"><button className="button-secondary" onClick={()=>{setConfirmDelete(false);setDeleteName('');}}>{t('cancel')}</button><button className="button danger" disabled={deleteName.trim()!==viewer.name||busy} onClick={()=>void deleteAccount()}>{t('deleteAccount')}</button></div></div></Dialog>}
  </section>;
}

export function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations(); const { state, execute, busy, setLocale } = useCommunity();
  const existing = getViewer(state);
  const [draft,setDraft] = useState<Profile>(()=>existing ?? emptyProfile(state?.viewerId ?? 'you'));
  const [step,setStep] = useState(0);
  const [adult,setAdult] = useState(Boolean(existing?.adult));
  const [avatarError,setAvatarError] = useState(false);
  const [error,setError] = useState('');
  const { locale } = useCommunity();
  const activeSports = state?.sports.filter(sport=>sport.active) ?? [];
  const valid = useMemo(()=>draft.name.trim().length>=2 && adult && Object.keys(draft.sports).length>0 && draft.availability.length>0, [draft,adult]);
  const change = (patch: Partial<Profile>) => setDraft(current=>({...current,...patch}));
  const toggleSport = (id:string) => {
    const sports={...draft.sports}; if(id in sports) delete sports[id]; else sports[id]='new';
    change({sports,favorites:draft.favorites.filter(value=>value!==id)});
  };
  const toggleGoal = (goal:string) => change({goals:draft.goals.includes(goal)?draft.goals.filter(value=>value!==goal):[...draft.goals,goal]});
  const toggleDay = (day:number) => { const selected=draft.availability.some(slot=>slot.day===day);change({availability:selected?draft.availability.filter(slot=>slot.day!==day):[...draft.availability,{day,start:'17:00',end:'20:00'}]}); };
  const finish = async () => {
    if(!safeAvatar(draft.avatar)){setAvatarError(true);setStep(0);return;}
    setAvatarError(false);setError('');
    const saved=await execute({type:'profile.save',profile:{...draft,adult:true,onboarded:true,locale:draft.locale}});
    if(saved){setLocale(draft.locale);onClose();}
  };
  const content = step===0 ? <div className="stack"><p className="muted">{t('onboardingIntro')}</p><div className="form-grid"><Field label={t('displayName')}><input autoFocus maxLength={60} value={draft.name} onChange={e=>change({name:e.target.value})}/></Field><Field label={t('locationGeneral')}><input maxLength={100} value={draft.area} onChange={e=>change({area:e.target.value})}/></Field></div><Field label={t('bio')}><textarea maxLength={300} rows={3} value={draft.bio} onChange={e=>change({bio:e.target.value})}/></Field><Field label={t('avatarUrl')} hint={t('avatarUrlHelp')}><input type="url" value={draft.avatar} onChange={e=>change({avatar:e.target.value})}/></Field>{avatarError&&<small className="danger">{t('avatarUrlInvalid')}</small>}<label className="settings-row"><span>{t('adultConfirm')}</span><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/></label></div>
    : step===1 ? <div className="stack"><p>{t('onboardingSportsHelp')}</p><div className="sport-grid">{activeSports.map(sport=><button key={sport.id} className={`sport-tile ${sport.id in draft.sports?'active':''}`} onClick={()=>toggleSport(sport.id)}><span className="sport-tile-emoji">{sport.emoji}</span><span>{sport.name[locale]}</span>{sport.id in draft.sports&&<Check size={16}/>}</button>)}</div></div>
    : step===2 ? <div className="stack"><p>{t('onboardingSkillHelp')}</p>{Object.keys(draft.sports).map(id=>{const sport=activeSports.find(item=>item.id===id);if(!sport)return null;return <Field key={id} label={`${sport.emoji} ${sport.name[locale]}`}><select value={draft.sports[id]} onChange={e=>(()=>{const parsed=skillSchema.safeParse(e.target.value);if(parsed.success)change({sports:{...draft.sports,[id]:parsed.data}});})()}>{skills.map(skill=><option key={skill} value={skill}>{skill==='new'?t('newSkill'):t(skill)}</option>)}</select></Field>;})}</div>
    : step===3 ? <div className="stack"><p>{t('onboardingAvailabilityHelp')}</p><div className="chips">{weekdays.map((day,index)=>{const selected=draft.availability.some(slot=>slot.day===index);return <button key={day} className={`chip ${selected?'active':''}`} onClick={()=>toggleDay(index)}>{t(day)}</button>;})}</div><p className="muted small">{t('onboardingDefaultTime')}</p><Field label={t('timeZone')}><input value={draft.timezone} onChange={e=>change({timezone:e.target.value})}/></Field></div>
    : <div className="stack"><p>{t('onboardingGoalsHelp')}</p><div className="chips">{goals.map(goal=><button key={goal} className={`chip ${draft.goals.includes(goal)?'active':''}`} onClick={()=>toggleGoal(goal)}>{t(goal)}</button>)}</div><Field label={t('language')}><select value={draft.locale} onChange={e=>(()=>{const parsed=localeSchema.safeParse(e.target.value);if(parsed.success)change({locale:parsed.data});})()}><option value="en">English</option><option value="it">Italiano</option></select></Field></div>;
  return <Dialog title={t('onboarding')} onClose={onClose} wide><div className="stack"><p className="eyebrow">{t('step',{current:step+1,total:5})}</p>{content}{error&&<p className="danger">{error}</p>}<div className="profile-actions">{step>0&&<button className="button-secondary" onClick={()=>setStep(step-1)}><ChevronLeft size={17}/>{t('back')}</button>}<span className="small muted">{t('stepCount',{current:step+1,total:5})}</span>{step<4?<button className="button" disabled={step===0&&(!draft.name.trim()||!adult)} onClick={()=>setStep(step+1)}>{t('continue')}<ChevronRight size={17}/></button>:<button className="button" disabled={!valid||busy} onClick={()=>void finish()}>{t('finish')}</button>}</div></div></Dialog>;
}

export function AdminScreen() {
  const t=useTranslations();const {state,execute,toast,locale,busy}=useCommunity();
  const [tab,setTab]=useState<'members'|'sports'|'venues'|'announcements'|'reports'|'settings'>('members');
  const [draftSport,setDraftSport]=useState<Sport|null>(null);const [draftVenue,setDraftVenue]=useState<Venue|null>(null);
  const [announcement,setAnnouncement]=useState({title:'',body:''});
  if(!state)return <section className="section-pad"><div className="panel">{t('loading')}</div></section>;
  const viewer=getViewer(state);
  if(viewer?.role!=='admin')return <section className="section-pad"><div className="panel stack"><h1>{t('adminDashboard')}</h1><p>{t('adminAccessDenied')}</p></div></section>;
  const tabs=[['members','manageMembers'],['sports','manageSports'],['venues','manageVenues'],['announcements','publishAnnouncement'],['reports','manageReports'],['settings','communitySettings']] as const;
  const submitSport=async()=>{if(!draftSport)return;const ok=await execute({type:'admin.sport',sport:draftSport});if(ok){toast('sportSaved');setDraftSport(null);}};
  const submitVenue=async()=>{if(!draftVenue)return;if(draftVenue.bookingUrl){try{if(new URL(draftVenue.bookingUrl).protocol!=='https:')throw new Error();}catch{toast('bookingUrlInvalid');return;}}const ok=await execute({type:'admin.venue',venue:draftVenue});if(ok){toast('venueSaved');setDraftVenue(null);}};
  const saveSettings=async(form:FormData)=>{const next={...state.settings,name:String(form.get('name')||''),description:String(form.get('description')||''),weights:{sports:Number(form.get('sports')),availability:Number(form.get('availability')),skill:Number(form.get('skill')),community:Number(form.get('community')),goals:Number(form.get('goals'))}};if(Object.values(next.weights).some(value=>!Number.isFinite(value)||value<0)){toast('settingsInvalid');return;}await execute({type:'admin.settings',settings:next});};
  const updateSport=(patch:Partial<Sport>)=>setDraftSport(current=>current?{...current,...patch}:null);
  const updateLocalized=(field:'name'|'overview'|'rules'|'equipment'|'safety',lang:'en'|'it',value:string)=>setDraftSport(current=>current?{...current,[field]:{...current[field], [lang]:value}}:null);
  const updateVenueLocalized=(field:'area'|'price'|'access'|'hours'|'accessibility',lang:'en'|'it',value:string)=>setDraftVenue(current=>current?{...current,[field]:{...current[field],[lang]:value}}:null);
  return <section className="section-pad stack"><header><span className="eyebrow">{t('admin')}</span><h1>{t('adminDashboard')}</h1><p className="muted">{t('adminHelp')}</p></header>
    <nav className="tabs" aria-label={t('adminDashboard')}>{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{t(label)}</button>)}</nav>
    {tab==='members'&&<article className="panel stack"><h2>{t('manageMembers')}</h2><p className="muted">{t('membersAdminHelp')}</p>{state.profiles.map(person=><div className="admin-row" key={person.id}><Avatar person={person} size="small"/><div className="admin-row-main"><strong>{person.name}</strong><small>{person.area} · {t(person.role)}</small></div><select aria-label={`${t('memberStatus')}: ${person.name}`} value={person.role==='admin'?'member':person.role} disabled={person.role==='admin'} onChange={e=>{void execute({type:'admin.member',userId:person.id,role:e.target.value==='guest'?'guest':e.target.value==='pending'?'pending':'member'});}}><option value="member">{t('member')}</option><option value="guest">{t('guest')}</option><option value="pending">{t('pending')}</option></select></div>)}</article>}
    {tab==='sports'&&<article className="panel stack"><header className="settings-row"><div><h2>{t('manageSports')}</h2><p className="muted">{t('sportsAdminHelp')}</p></div><button className="button" onClick={()=>setDraftSport({id:`sport-${Date.now()}`,name:{en:'',it:''},emoji:'🏅',color:colors[state.sports.length%colors.length],active:true,formats:['practice'],minPlayers:1,maxPlayers:12,overview:{en:'',it:''},rules:{en:'',it:''},equipment:{en:'',it:''},safety:{en:'',it:''}})}><Plus size={17}/>{t('addSport')}</button></header>{state.sports.map(sport=><div key={sport.id} className="admin-row"><span>{sport.emoji}</span><div className="admin-row-main"><strong>{sport.name[locale]}</strong><small>{sport.formats.join(' · ')} · {sport.active?t('active'):t('inactive')}</small></div><button className="button-secondary" onClick={()=>setDraftSport({...sport})}>{t('edit')}</button><button className={`switch ${sport.active?'active':''}`} role="switch" aria-checked={sport.active} aria-label={`${t('active')}: ${sport.name[locale]}`} onClick={()=>void execute({type:'admin.sport',sport:{...sport,active:!sport.active}})}><span/></button></div>)}</article>}
    {tab==='venues'&&<article className="panel stack"><header className="settings-row"><div><h2>{t('manageVenues')}</h2><p className="muted">{t('venueAdminHelp')}</p></div><button className="button" onClick={()=>setDraftVenue({id:`venue-${Date.now()}`,name:'',area:{en:'',it:''},address:'',campus:false,sports:[],price:{en:'',it:''},access:{en:'',it:''},hours:{en:'',it:''},accessibility:{en:'',it:''},bookingUrl:'',verifiedAt:null,lat:45.63,lng:12.38})}><Plus size={17}/>{t('addVenue')}</button></header>{state.venues.map(venue=><div key={venue.id} className="admin-row"><div className="admin-row-main"><strong>{venue.name}</strong><small>{venue.area[locale]} · {venue.campus?t('onCampus'):t('nearby')}</small></div><span className="badge">{venue.verifiedAt?t('verified'):t('neverVerified')}</span><button className="button-secondary" onClick={()=>setDraftVenue({...venue})}>{t('edit')}</button></div>)}</article>}
    {tab==='announcements'&&<div className="form-grid"><article className="panel stack"><h2>{t('publishAnnouncement')}</h2><p className="muted">{t('announcementAdminHelp')}</p><Field label={t('title')}><input maxLength={100} value={announcement.title} onChange={e=>setAnnouncement({...announcement,title:e.target.value})}/></Field><Field label={t('description')}><textarea rows={4} maxLength={1000} value={announcement.body} onChange={e=>setAnnouncement({...announcement,body:e.target.value})}/></Field><button className="button" disabled={busy||announcement.title.trim().length<3||announcement.body.trim().length<3} onClick={async()=>{const ok=await execute({type:'admin.announcement',...announcement});if(ok){setAnnouncement({title:'',body:''});toast('announcementPublished');}}}>{t('publishAnnouncement')}</button></article><article className="panel stack"><h2>{t('communityNews')}</h2>{state.announcements.map(item=><div className="divider stack" key={item.id}><strong>{item.title}</strong><p>{item.body}</p></div>)}</article></div>}
    {tab==='reports'&&<article className="panel stack"><h2>{t('manageReports')}</h2>{state.reports.length?state.reports.map(report=><div key={report.id} className="admin-row"><div className="admin-row-main"><strong>{report.reason}</strong><small>{t('reportTarget')}: {report.targetId} · {report.status==='resolved'?t('reportResolved'):t(report.status)}</small></div>{report.status==='open'&&<button className="button-secondary" onClick={()=>void execute({type:'admin.report',id:report.id})}>{t('resolve')}</button>}</div>):<p className="muted">{t('noReports')}</p>}</article>}
    {tab==='settings'&&<form className="panel stack" action={saveSettings}><h2>{t('communitySettings')}</h2><p className="muted">{t('settingsAdminHelp')}</p><Field label={t('communityName')}><input name="name" maxLength={80} defaultValue={state.settings.name}/></Field><Field label={t('communityDescription')}><textarea name="description" rows={3} maxLength={300} defaultValue={state.settings.description}/></Field><h3>{t('matchingWeights')}</h3>{(Object.keys(state.settings.weights) as Array<keyof typeof state.settings.weights>).map(key=><Field key={key} label={t(`weight_${key}`)}><input type="number" min="0" step="1" name={key} defaultValue={state.settings.weights[key]}/></Field>)}<button className="button" type="submit" disabled={busy}>{t('saveSettings')}</button></form>}
    {draftSport&&<Dialog title={t(draftSport.id.startsWith('sport-')?'addSport':'editSport')} onClose={()=>setDraftSport(null)} wide><div className="stack"><div className="form-grid"><Field label={t('sportId')}><input value={draftSport.id} disabled/></Field><Field label={t('emoji')}><input value={draftSport.emoji} onChange={e=>updateSport({emoji:e.target.value})}/></Field></div>{(['name','overview','rules','equipment','safety'] as const).map(field=><fieldset className="panel stack" key={field}><legend>{t(field==='name'?'sportName':field)}</legend><div className="form-grid">{(['en','it'] as const).map(lang=><Field key={lang} label={lang==='en'?'English':'Italiano'}><textarea rows={field==='name'?1:3} value={draftSport[field][lang]} onChange={e=>updateLocalized(field,lang,e.target.value)}/></Field>)}</div></fieldset>)}<div className="form-grid"><Field label={t('formatsCommaSeparated')}><input value={draftSport.formats.join(', ')} onChange={e=>updateSport({formats:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></Field><Field label={t('minPlayers')}><input type="number" min="1" value={draftSport.minPlayers} onChange={e=>updateSport({minPlayers:Number(e.target.value)})}/></Field><Field label={t('maxPlayers')}><input type="number" min="1" value={draftSport.maxPlayers} onChange={e=>updateSport({maxPlayers:Number(e.target.value)})}/></Field></div><label className="settings-row"><span>{t('active')}</span><input type="checkbox" checked={draftSport.active} onChange={e=>updateSport({active:e.target.checked})}/></label><div className="profile-actions"><button className="button-secondary" onClick={()=>setDraftSport(null)}>{t('cancel')}</button><button className="button" onClick={()=>void submitSport()} disabled={!draftSport.name.en.trim()||!draftSport.name.it.trim()||!draftSport.formats.length||busy}>{t('save')}</button></div></div></Dialog>}
    {draftVenue&&<Dialog title={t(draftVenue.name?'editVenue':'addVenue')} onClose={()=>setDraftVenue(null)} wide><div className="stack"><div className="form-grid"><Field label={t('venueName')}><input value={draftVenue.name} onChange={e=>setDraftVenue({...draftVenue,name:e.target.value})}/></Field><Field label={t('address')}><input value={draftVenue.address} onChange={e=>setDraftVenue({...draftVenue,address:e.target.value})}/></Field></div><label className="settings-row"><span>{t('onCampus')}</span><input type="checkbox" checked={draftVenue.campus} onChange={e=>setDraftVenue({...draftVenue,campus:e.target.checked})}/></label><Field label={t('sports')}><div className="chips">{state.sports.map(sport=><button key={sport.id} className={`chip ${draftVenue?.sports.includes(sport.id)?'active':''}`} onClick={()=>setDraftVenue({...draftVenue!,sports:draftVenue!.sports.includes(sport.id)?draftVenue!.sports.filter(id=>id!==sport.id):[...draftVenue!.sports,sport.id]})}>{sport.emoji} {sport.name[locale]}</button>)}</div></Field>{(['area','price','access','hours','accessibility'] as const).map(field=><fieldset className="panel stack" key={field}><legend>{t(field==='area'?'area':field==='hours'?'openingHours':field)}</legend><div className="form-grid">{(['en','it'] as const).map(lang=><Field key={lang} label={lang==='en'?'English':'Italiano'}><textarea rows={2} value={draftVenue[field][lang]} onChange={e=>updateVenueLocalized(field,lang,e.target.value)}/></Field>)}</div></fieldset>)}<Field label={t('bookingUrl')} hint={t('bookingUrlHelp')}><input type="url" value={draftVenue.bookingUrl} onChange={e=>setDraftVenue({...draftVenue,bookingUrl:e.target.value})}/></Field><div className="profile-actions"><button className="button-secondary" onClick={()=>setDraftVenue(null)}>{t('cancel')}</button><button className="button" onClick={()=>void submitVenue()} disabled={!draftVenue.name.trim()||!draftVenue.sports.length||busy}>{t('save')}</button></div></div></Dialog>}
  </section>;
}
