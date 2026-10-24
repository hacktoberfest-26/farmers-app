'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Bell, Bookmark, ChevronDown, Compass, Home, LogIn, MapPin, Menu, MessageCircle, Plus, Search, Settings2, Shield, Sparkles, Users, UserRound, WifiOff, X, Download } from 'lucide-react';
import { Logo } from './logo';
import { useCommunity } from './provider';
import { Avatar, Dialog, Empty } from './primitives';
import { Feed, SessionDialog, CreateSessionDialog } from './sessions';
import { ExploreScreen, PeopleScreen, InboxScreen, PersonDialog, SearchDialog, AuthDialog } from './discovery';
import { ProfileScreen, OnboardingDialog, AdminScreen } from './profile';
import { liveMode } from '@/lib/client';
import { communityConfig } from '@/lib/model';
import type { Profile } from '@/lib/model';
import { matchPeople, visibleSessions } from '@/lib/policy';

type Page = 'home'|'explore'|'people'|'play'|'profile'|'inbox'|'admin'|'saved';
type Modal = {kind:'none'}|{kind:'session';id:string}|{kind:'person';person:Profile}|{kind:'create'}|{kind:'onboarding'}|{kind:'search'}|{kind:'auth'}|{kind:'notifications'}|{kind:'community'}|{kind:'install'};
export function Application() {
 const t=useTranslations();
 const {state,locale,setLocale,online,client,refresh,error,execute,toast}=useCommunity();
 const [page,setPage]=useState<Page>('home');
 const [modal,setModal]=useState<Modal>({kind:'none'});
 const [sportFilter,setSportFilter]=useState('all');
 const [chat,setChat]=useState<string|null>(null);
 const close=useCallback(()=>setModal({kind:'none'}),[]);
 const navigate=(next:Page)=>{setPage(next);setSportFilter('all');window.location.hash=next;window.scrollTo({top:0,behavior:'smooth'});};
 useEffect(()=>{const handle=()=>{const hash=window.location.hash.slice(1);if(hash.startsWith('session=')){setModal({kind:'session',id:decodeURIComponent(hash.slice(8))});return;}if(['home','explore','people','play','profile','inbox','admin','saved'].includes(hash)){const next=hash as Page;setPage(next);}};handle();window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[]);
 useEffect(()=>{if('serviceWorker' in navigator&&process.env.NODE_ENV==='production'){void navigator.serviceWorker.register(`${communityConfig.basePath}/sw.js`,{scope:`${communityConfig.basePath}/`}).catch(()=>{});}},[]);
 const viewer=state?.profiles.find(p=>p.id===state.viewerId) || null;
 const isMember=Boolean(viewer?.adult&&viewer.onboarded&&viewer.role!=='pending');
 const requireMember=(action:()=>void)=>{if(!viewer)setModal({kind:'auth'});else if(!viewer.onboarded)setModal({kind:'onboarding'});else if(!isMember)toast(t('pendingApproval'));else action();};
 const nav=[{id:'home',icon:Home},{id:'explore',icon:Compass},{id:'people',icon:Users},{id:'play',icon:Sparkles},{id:'profile',icon:UserRound}] as const;
 const suggestions=state&&viewer?matchPeople(state,viewer).slice(0,3):[];
 const upcoming=state?visibleSessions(state,viewer).filter(s=>s.participants.includes(viewer?.id||'')&&Date.parse(s.date)>Date.now()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0,2):[];
 const openSession=(id:string)=>setModal({kind:'session',id});
 const newSession=()=>requireMember(()=>setModal({kind:'create'}));
 const heading=page==='saved'?t('savedSessions'):t(page);
 return <div className="app-shell">
 <a href="#main-content" className="skip-link">{t('skipContent')}</a>
 <aside className="left-sidebar"><a className="brand" href="#home" onClick={()=>navigate('home')}><span className="brand-symbol"><Logo/></span><span>Farmers</span></a>
 <button className="community-switch" onClick={()=>setModal({kind:'community'})}><span className="community-icon">H</span><span><strong>{communityConfig.name}</strong><small>{t('campusCommunity')}</small></span><ChevronDown size={15}/></button>
 <nav aria-label={t('mainNavigation')}>{nav.map(({id,icon:Icon})=><button key={id} className={`nav-item ${page===id?'active':''}`} onClick={()=>navigate(id)} aria-current={page===id?'page':undefined}><Icon size={23} strokeWidth={page===id?2.4:1.7}/><span>{t(id)}</span>{page===id&&<span className="nav-dot"/>}</button>)}</nav>
 <button className="button create-button" onClick={newSession}><Plus size={20}/>{t('createSession')}</button>
 <div className="secondary-nav"><button className={`nav-item ${page==='inbox'?'active':''}`} onClick={()=>requireMember(()=>navigate('inbox'))}><MessageCircle size={21}/>{t('inbox')}<span className="nav-count">{state?.messages.filter(m=>m.to===viewer?.id).length || 0}</span></button><button className={`nav-item ${page==='saved'?'active':''}`} onClick={()=>requireMember(()=>navigate('saved'))}><Bookmark size={21}/>{t('savedSessions')}</button>{viewer?.role==='admin'&&<button className={`nav-item ${page==='admin'?'active':''}`} onClick={()=>navigate('admin')}><Shield size={21}/>{t('admin')}</button>}</div>
 <div className="sidebar-bottom"><button className="your-profile" onClick={()=>viewer?navigate('profile'):setModal({kind:'auth'})}><Avatar person={viewer||undefined}/><span><strong>{viewer?.name||t('signIn')}</strong><small>{viewer?t(viewer.role==='admin'?'communityAdmin':viewer.role==='pending'?'pendingApproval':'verifiedMember'):t('joinCommunity')}</small></span><Settings2 size={17}/></button><div className="sidebar-footer"><span>© Farmers 2026</span><button onClick={()=>setLocale(locale==='en'?'it':'en')}>{locale==='en'?'EN':'IT'} <ChevronDown size={10}/></button></div><a href="https://github.com/johnou/HCommunity" target="_blank" rel="noreferrer" className="open-source">{t('openSource')} <ArrowUpRight size={11}/></a></div>
 </aside>
 <main id="main-content" className="main-column"><header className="topbar"><div className="mobile-brand"><span className="brand-symbol"><Logo/></span></div><h1>{heading}</h1><div className="topbar-actions"><button className="icon-button" onClick={()=>setModal({kind:'search'})} aria-label={t('search')}><Search size={21}/></button><button className="icon-button notification-button" onClick={()=>requireMember(()=>setModal({kind:'notifications'}))} aria-label={t('notifications')}><Bell size={21}/>{state?.notifications.some(n=>!n.read)&&<i/>}</button><button className="language-mobile" onClick={()=>setLocale(locale==='en'?'it':'en')} aria-label={t('language')}>{locale.toUpperCase()}</button></div></header>
 {!online&&<div className="offline-banner" role="alert"><WifiOff size={16}/>{t('offline')} · {t('offlineAction')}</div>}
 {!liveMode&&<div className="demo-strip"><span className="status-dot"/>{t('demoPreview')}<span className="demo-description">{t('fictionalData')}</span><button onClick={()=>setModal({kind:'community'})}>{t('learnMore')}<ArrowUpRight size={11}/></button></div>}
 {error?<Empty title={t('loadError')} description={error}><button className="button" onClick={()=>void refresh()}>{t('tryAgain')}</button></Empty>:!state?<div className="loading-state"><span className="brand-symbol"><Logo/></span><p>{t('loading')}</p></div>:<>
 {viewer&&!viewer.onboarded&&<div className="setup-banner"><span>{t('completeProfile')}</span><button className="button button-small" onClick={()=>setModal({kind:'onboarding'})}>{t('continue')}</button></div>}
 {viewer?.role==='pending'&&viewer.onboarded&&<div className="setup-banner"><Shield size={18}/><span>{t('awaitingApprovalInfo')}</span></div>}
 {(page==='home'||page==='play'||page==='saved')&&<Feed page={page} sportFilter={sportFilter} onFilter={setSportFilter} onSession={openSession} onCreate={newSession} onSport={()=>navigate('explore')} onPerson={person=>setModal({kind:'person',person})} onAuth={()=>setModal({kind:'auth'})}/>}
 {page==='explore'&&<ExploreScreen onSession={openSession} onPeople={(sportId)=>{navigate('people');setSportFilter(sportId);}} onCreate={newSession}/>}
 {page==='people'&&(isMember?<PeopleScreen sportFilter={sportFilter} onFilter={setSportFilter} onPerson={person=>setModal({kind:'person',person})} onMessage={id=>{setChat(id);navigate('inbox');}}/>:<Empty title={t('findYourPeople')} description={t('membersOnlyInfo')}><button className="button" onClick={()=>requireMember(()=>{})}>{viewer?t('completeProfile'):t('joinCommunity')}</button></Empty>)}
 {page==='profile'&&(viewer?<ProfileScreen onEdit={()=>setModal({kind:'onboarding'})}/>:<Empty title={t('joinCommunity')} description={t('tagline')}><button className="button" onClick={()=>setModal({kind:'auth'})}>{t('signIn')}</button></Empty>)}
 {page==='inbox'&&<InboxScreen selectedId={chat} onSelect={setChat}/>}
 {page==='admin'&&(viewer?.role==='admin'?<AdminScreen/>:<Empty title={t('membersOnly')} description={t('adminOnly')}/>)}
 </>}
 <footer className="mobile-footer">{t('tagline')}</footer></main>
 <aside className="right-sidebar"><div className="right-sticky"><div className="community-label"><span className="status-dot"/>{communityConfig.name.toUpperCase()} COMMUNITY</div><h2 className="right-heading">{t('harvestYourFuture')}<br/><span className="identity-tagline">{t('byShapingYourIdentity')}</span></h2><p className="right-intro">{t('communityIntro')}</p>
 <div className="right-section"><div className="section-heading"><h3>{t('yourNextSessions')}</h3><button onClick={()=>navigate('play')}>{t('seeAll')}<ArrowUpRight size={12}/></button></div>{upcoming.length?upcoming.map(s=>{const sport=state?.sports.find(x=>x.id===s.sportId);return <button className="upcoming-mini" key={s.id} onClick={()=>openSession(s.id)}><span className="date-box"><small>{new Intl.DateTimeFormat(locale,{month:'short',timeZone:communityConfig.timezone}).format(new Date(s.date))}</small><strong>{new Intl.DateTimeFormat(locale,{day:'2-digit',timeZone:communityConfig.timezone}).format(new Date(s.date))}</strong></span><span><strong>{sport?.emoji} {sport?.name[locale]}</strong><small>{new Intl.DateTimeFormat(locale,{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:communityConfig.timezone}).format(new Date(s.date))}</small><small className="muted">{s.format} · {t('noBookingShort')}</small></span><ChevronDown className="rotate-left" size={16}/></button>}):<p className="muted small">{t('noUpcomingJoined')}</p>}</div>
 <div className="right-section"><div className="section-heading"><h3>{t('peopleToPlayWith')}</h3><button onClick={()=>navigate('people')}>{t('seeAll')}<ArrowUpRight size={12}/></button></div>{suggestions.map(match=><button key={match.profile.id} className="person-mini" onClick={()=>setModal({kind:'person',person:match.profile})}><Avatar person={match.profile}/><span><strong>{match.profile.name}</strong><small>{match.sharedSports.map(id=>state?.sports.find(s=>s.id===id)?.name[locale]).join(' · ')||t('campusCommunity')}</small></span><Plus size={18}/></button>)}</div>
 <div className="campus-note"><span className="little-spark">✳</span><p>{t('betterTogether')}</p><span>{t('inviteToPlay')}</span><button onClick={newSession}>{t('makeAPlan')} <ArrowUpRight size={16}/></button></div>
 <div className="right-footer"><button onClick={()=>setModal({kind:'install'})}><Download size={12}/>{t('installApp')}</button><span>{t('builtForCommunity')}</span><span>{t('adultsOnly')} · {t('generalAreaOnly')}</span></div></div></aside>
 <nav className="bottom-nav" aria-label={t('mobileNavigation')}>{nav.map(({id,icon:Icon})=><button key={id} onClick={()=>navigate(id)} className={page===id?'active':''} aria-label={t(id)} aria-current={page===id?'page':undefined}><Icon size={24}/><span>{t(id)}</span></button>)}</nav>
 <button className="mobile-compose" onClick={newSession} aria-label={t('createSession')}><Plus size={25}/></button>
 {state&&modal.kind==='session'&&<SessionDialog id={modal.id} onClose={close} onPerson={person=>setModal({kind:'person',person})}/>}
 {modal.kind==='create'&&<CreateSessionDialog onClose={close} onCreated={id=>{navigate('play');setModal({kind:'session',id});}}/>}
 {modal.kind==='person'&&<PersonDialog person={modal.person} onClose={close} onMessage={id=>{setChat(id);navigate('inbox');close();}}/>}
 {modal.kind==='onboarding'&&<OnboardingDialog onClose={close}/>}
 {modal.kind==='search'&&<SearchDialog onClose={close} onSession={openSession} onPerson={person=>setModal({kind:'person',person})} onExplore={()=>{navigate('explore');close();}}/>}
 {modal.kind==='auth'&&<AuthDialog onClose={close} onSuccess={()=>{void refresh();close();navigate('profile');}}/>}
 {modal.kind==='notifications'&&<Dialog title={t('notifications')} onClose={close}><div className="section-pad stack">{state?.notifications.length?state.notifications.map(n=><div key={n.id} className="notification-row"><span className={`status-dot ${n.read?'gray':''}`}/><p>{n.body}</p></div>):<p className="muted">{t('allCaughtUp')}</p>}<button className="button button-secondary" onClick={()=>void execute({type:'notifications.read'})}>{t('markRead')}</button><button className="button button-ghost" onClick={()=>{navigate('people');close();}}>{t('connections')}</button></div></Dialog>}
 {modal.kind==='community'&&<Dialog title={t('aboutCommunity')} onClose={close}><div className="section-pad stack"><span className="brand-symbol"><Logo size={64}/></span><h3>{communityConfig.name}</h3><p>{t('tagline')}</p><p className="muted"><MapPin size={15}/> {communityConfig.location} · {communityConfig.timezone}</p>{!liveMode&&<div className="info-box"><strong>{t('demoMode')}</strong><p>{t('demoNotice')}</p><p>{t('demoPersistence')}</p></div>}<p>{t('adultsOnlyInfo')}</p><button className="button" onClick={()=>{navigate('explore');close();}}>{t('explore')}</button></div></Dialog>}
 {modal.kind==='install'&&<Dialog title={t('installApp')} onClose={close}><div className="section-pad stack"><Download size={32}/><p>{t('installInstructions')}</p><p className="muted">{t('offlineGuides')}</p></div></Dialog>}
 </div>;
}
