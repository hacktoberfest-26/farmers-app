'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, ExternalLink, MapPin, MessageCircle, Search, Send, Shield, Users } from 'lucide-react';
import { matchPeople, visibleSessions } from '@/lib/policy';
import { liveMode } from '@/lib/client';
import { dateLabel } from '@/lib/time';
import type { Profile, Skill, Sport } from '@/lib/model';
import { useCommunity } from './provider';
import { Avatar, Dialog, Empty, Field, SportBadge } from './primitives';

type PersonAction = (person: Profile) => void;
const skillKeys: Record<Skill, 'neverTried' | 'beginner' | 'intermediate' | 'advanced'> = {
  new: 'neverTried', beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced',
};
const secureBookingUrl = (value: string): string | null => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : null; }
  catch { return null; }
};
const selectedSportKey = 'hcommunity:selected-sport';

function useViewer() {
  const { state } = useCommunity();
  return state?.profiles.find(person => person.id === state.viewerId) ?? null;
}

function ConnectionControls({ person, onMessage }: { person: Profile; onMessage: (id: string) => void }) {
  const t = useTranslations();
  const { state, execute, busy } = useCommunity();
  const viewerId = state?.viewerId;
  const edge = state?.connections.find(item =>
    (item.from === viewerId && item.to === person.id) || (item.to === viewerId && item.from === person.id));
  const disabled = busy;
  if (!viewerId) return null;
  if (edge?.status === 'accepted') return <button className="button button-small" onClick={() => onMessage(person.id)}><MessageCircle size={15} />{t('message')}</button>;
  if (edge?.status === 'pending' && edge.to === viewerId) return <span className="chips"><button className="button button-small" disabled={disabled} onClick={() => void execute({ type: 'connection.respond', id: edge.id, accept: true })}>{t('accept')}</button><button className="button button-secondary button-small" disabled={disabled} onClick={() => void execute({ type: 'connection.respond', id: edge.id, accept: false })}>{t('reject')}</button></span>;
  if (edge?.status === 'pending') return <span className="badge">{t('requestSent')}</span>;
  return <button className="button button-small" disabled={disabled} onClick={() => void execute({ type: 'connection.request', userId: person.id })}>{t('connect')}</button>;
}

function SportDetail({ sport, onBack, onSession, onPeople, onCreate }: {
  sport: Sport; onBack: () => void; onSession: (id: string) => void; onPeople: (sportId: string) => void; onCreate: () => void;
}) {
  const t = useTranslations();
  const { state, locale } = useCommunity();
  const viewer = useViewer();
  const venues = state?.venues.filter(venue => venue.sports.includes(sport.id)) ?? [];
  const sessions = state && viewer ? visibleSessions(state, viewer).filter(session => session.sportId === sport.id && Date.parse(session.date) > Date.now()).slice(0, 4) : [];
  return <div className="section-pad stack sport-detail">
    <button className="button button-secondary button-small" onClick={onBack}><ArrowLeft size={15} />{t('allSports')}</button>
    <div className="detail-title"><span className="sport-hero-icon" style={{ background: sport.color }}>{sport.emoji}</span><div><span className="muted small">{t('sportGuide')}</span><h2>{sport.name[locale]}</h2><p>{sport.overview[locale]}</p></div></div>
    <div className="chips">{sport.formats.map(format => <span className="chip" key={format}>{format}</span>)}<span className="chip">{t('playersRange', { min: sport.minPlayers, max: sport.maxPlayers })}</span></div>
    <div className="sport-guide-grid"><article className="info-box"><h3>{t('howToPlay')}</h3><p>{sport.rules[locale]}</p></article><article className="info-box"><h3>{t('gettingStarted')}</h3><p>{sport.equipment[locale]}</p></article><article className="info-box"><h3>{t('safety')}</h3><p>{sport.safety[locale]}</p></article><article className="info-box"><h3>{t('skillLevels')}</h3><p>{t('levelsHelp')}</p><div className="chips">{(['new','beginner','intermediate','advanced'] as const).map(level => <span className="chip" key={level}>{t(skillKeys[level])}</span>)}</div></article></div>
    <div className="section-heading"><h3>{t('venues')}</h3><span className="muted small">{venues.length}</span></div>
    {venues.length ? venues.map(venue => <article className="venue-card" key={venue.id}><div><span className="badge">{venue.campus ? t('onCampus') : t('nearby')}</span><h4>{venue.name}</h4><p className="muted"><MapPin size={14} /> {venue.area[locale]} · {venue.address}</p></div><div className="venue-facts"><p><strong>{t('costs')}</strong> {venue.price[locale]}</p><p><strong>{t('access')}</strong> {venue.access[locale]}</p><p><strong>{t('openingHours')}</strong> {venue.hours[locale]}</p><p><strong>{t('accessibility')}</strong> {venue.accessibility[locale]}</p><small className="muted">{venue.verifiedAt ? t('lastVerified') + ': ' + dateLabel(venue.verifiedAt, locale) : t('unverifiedInfo')}</small></div><div className="chips"><a className="button button-secondary button-small" href={`https://www.openstreetmap.org/?mlat=${venue.lat}&mlon=${venue.lng}#map=16/${venue.lat}/${venue.lng}`} target="_blank" rel="noreferrer"><MapPin size={14} />{t('viewOnMap')}<ExternalLink size={13} /></a>{secureBookingUrl(venue.bookingUrl) && <a className="button button-secondary button-small" href={secureBookingUrl(venue.bookingUrl) ?? undefined} target="_blank" rel="noreferrer">{t('venueBookingLink')}<ExternalLink size={13} /></a>}</div></article>) : <p className="muted">{t('noVenuesForSport')}</p>}
    <div className="section-heading"><h3>{t('sessions')}</h3><button className="button button-small" onClick={onCreate}>{t('createSession')}</button></div>
    {sessions.length ? sessions.map(session => <button className="conversation-item" key={session.id} onClick={() => onSession(session.id)}><span><strong>{session.title}</strong><small>{dateLabel(session.date, locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {session.participants.length}/{session.capacity}</small></span><ArrowRight size={17} /></button>) : <p className="muted">{t('noSessionsForSport')}</p>}
    <button className="button button-secondary" onClick={() => onPeople(sport.id)}><Users size={17} />{t('findSportPeople')}</button>
  </div>;
}

export function ExploreScreen({ onSession, onPeople, onCreate }: { onSession: (id: string) => void; onPeople: (sportId: string) => void; onCreate: () => void }) {
  const t = useTranslations();
  const { state, locale } = useCommunity();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const takeSelection = () => { const id = sessionStorage.getItem(selectedSportKey); if (id) { setSelectedId(id); sessionStorage.removeItem(selectedSportKey); } };
    takeSelection();
    window.addEventListener('hcommunity-select-sport', takeSelection);
    return () => window.removeEventListener('hcommunity-select-sport', takeSelection);
  }, []);
  const selected = state?.sports.find(sport => sport.id === selectedId && sport.active);
  if (selected) return <SportDetail sport={selected} onBack={() => setSelectedId(null)} onSession={onSession} onPeople={onPeople} onCreate={onCreate} />;
  const sports = state?.sports.filter(sport => sport.active) ?? [];
  return <div className="section-pad stack"><div className="page-intro"><span className="eyebrow">{t('discoverSports')}</span><h2>{t('findYourSport')}</h2><p>{t('exploreIntro')}</p></div><div className="sport-grid">{sports.map(sport => <button key={sport.id} className="sport-tile" onClick={() => setSelectedId(sport.id)}><span className="sport-tile-icon" style={{ backgroundColor: sport.color }}>{sport.emoji}</span><strong>{sport.name[locale]}</strong><small>{sport.formats.slice(0, 2).join(' · ')}</small><ArrowRight size={17} /></button>)}</div></div>;
}

export function PeopleScreen({ sportFilter, onFilter, onPerson, onMessage }: {
  sportFilter: string; onFilter: (id: string) => void; onPerson: PersonAction; onMessage: (id: string) => void;
}) {
  const t = useTranslations();
  const { state, locale } = useCommunity();
  const viewer = useViewer();
  const [skill, setSkill] = useState('all');
  const [available, setAvailable] = useState(false);
  const matches = useMemo(() => state && viewer ? matchPeople(state, viewer).filter(match =>
    (sportFilter === 'all' || sportFilter in match.profile.sports) &&
    (skill === 'all' || (sportFilter === 'all' ? Object.values(match.profile.sports).some(level => level === skill) : match.profile.sports[sportFilter] === skill)) &&
    (!available || match.overlap > 0)) : [], [state, viewer, sportFilter, skill, available]);
  return <div className="section-pad stack"><div className="page-intro"><span className="eyebrow">{t('peopleTitle')}</span><h2>{t('findYourPeople')}</h2><p>{t('peopleIntro')}</p></div>
    <div className="filter-row"><Field label={t('sport')}><select value={sportFilter} onChange={event => onFilter(event.target.value)}><option value="all">{t('allSports')}</option>{state?.sports.filter(sport => sport.active).map(sport => <option key={sport.id} value={sport.id}>{sport.name[locale]}</option>)}</select></Field><Field label={t('skill')}><select value={skill} onChange={event => setSkill(event.target.value)}><option value="all">{t('allLevels')}</option>{(['new','beginner','intermediate','advanced'] as const).map(level => <option value={level} key={level}>{t(skillKeys[level])}</option>)}</select></Field><label className="checkbox-row"><input type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)} />{t('sharedAvailabilityOnly')}</label></div>
    <div className="section-heading"><h3>{t('matches')}</h3><span className="muted small">{t('resultCount', { count: matches.length })}</span></div>
    {matches.length ? matches.map(match => <article className="person-card" key={match.profile.id}><div className="person-card-top"><button className="person-card-person" onClick={() => onPerson(match.profile)}><Avatar person={match.profile} size="large" /><span><strong>{match.profile.name}</strong><small>{match.profile.area}</small></span></button><span className="match-badge">{match.score}% {t('match')}</span></div><p className="muted">{match.profile.bio}</p><div className="chips">{match.sharedSports.length ? match.sharedSports.map(id => { const sport = state?.sports.find(item => item.id === id); return sport ? <SportBadge key={id} emoji={sport.emoji} name={sport.name[locale]} /> : null; }) : <span className="small muted">{t('newPeopleReason')}</span>}</div><p className="small muted">{match.overlap > 0 ? t('availabilityMinutes', { count: match.overlap }) : t('differentSchedules')}</p><div className="person-card-actions"><button className="button button-secondary button-small" onClick={() => onPerson(match.profile)}>{t('viewProfile')}</button><ConnectionControls person={match.profile} onMessage={onMessage} /></div></article>) : <Empty title={t('noPeople')} description={t('adjustPeopleFilters')} />}
  </div>;
}

export function PersonDialog({ person, onClose, onMessage }: { person: Profile; onClose: () => void; onMessage: (id: string) => void }) {
  const t = useTranslations();
  const { state, locale, execute, busy, toast } = useCommunity();
  const viewer = useViewer();
  const [safetyAction, setSafetyAction] = useState<'none' | 'block' | 'report'>('none');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const match = state && viewer ? matchPeople(state, viewer).find(item => item.profile.id === person.id) : undefined;
  const submitReport = async (event: FormEvent) => { event.preventDefault(); if (reason.trim().length < 3) return; setSending(true); const done = await execute({ type: 'user.report', targetId: person.id, reason: reason.trim() }); setSending(false); if (done) { toast(t('reportSubmitted')); onClose(); } };
  return <Dialog title={person.name} onClose={onClose}><div className="section-pad stack"><div className="person-card-top"><Avatar person={person} size="large" /><div><h3>{person.name}</h3><p className="muted">{person.area} · {t(person.role === 'guest' ? 'approvedGuest' : 'verifiedMember')}</p></div></div><p>{person.bio}</p><div className="chips">{Object.entries(person.sports).map(([id, level]) => { const sport = state?.sports.find(item => item.id === id); return sport ? <span className="chip" key={id}>{sport.emoji} {sport.name[locale]} · {t(skillKeys[level])}</span> : null; })}</div><div className="info-box"><strong>{t('matchingReason')}</strong><p>{match ? t('matchSummary', { sports: match.sharedSports.length, minutes: match.overlap }) : t('communityMemberReason')}</p></div><ConnectionControls person={person} onMessage={onMessage} /><div className="divider" /><h4>{t('safetyTools')}</h4>
    {safetyAction === 'none' && <div className="chips"><button className="button button-secondary button-small" onClick={() => setSafetyAction('report')}>{t('reportUser')}</button><button className="button button-secondary button-small" onClick={() => setSafetyAction('block')}>{t('blockUser')}</button></div>}
    {safetyAction === 'block' && <div className="info-box stack"><p>{t('blockExplanation', { name: person.name })}</p><div className="chips"><button className="button button-secondary button-small" onClick={() => setSafetyAction('none')}>{t('cancel')}</button><button className="button button-small" disabled={busy} onClick={async () => { if (await execute({ type: 'user.block', userId: person.id })) onClose(); }}>{t('confirmBlock')}</button></div></div>}
    {safetyAction === 'report' && <form className="stack" onSubmit={submitReport}><Field label={t('reportReason')}><textarea value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} required /></Field><div className="chips"><button type="button" className="button button-secondary button-small" onClick={() => setSafetyAction('none')}>{t('cancel')}</button><button className="button button-small" disabled={sending || busy}>{t('submitReport')}</button></div></form>}
  </div></Dialog>;
}

export function InboxScreen({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const t = useTranslations();
  const { state, locale, execute, busy } = useCommunity();
  const viewer = useViewer();
  const [body, setBody] = useState('');
  const people = useMemo(() => state && viewer ? state.connections.filter(item => item.status === 'accepted' && (item.from === viewer.id || item.to === viewer.id)).map(item => state.profiles.find(person => person.id === (item.from === viewer.id ? item.to : item.from))).filter((person): person is Profile => Boolean(person)) : [], [state, viewer]);
  const selected = people.find(person => person.id === selectedId) ?? people[0];
  const messages = selected && viewer ? state?.messages.filter(item => (item.from === viewer.id && item.to === selected.id) || (item.to === viewer.id && item.from === selected.id)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) ?? [] : [];
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!selected || !body.trim()) return; if (await execute({ type: 'message.send', userId: selected.id, body: body.trim() })) setBody(''); };
  if (!viewer) return <Empty title={t('signIn')} description={t('membersOnlyInfo')} />;
  return <div className="chat-layout"><div className="conversation-list"><div className="section-pad"><h2>{t('inbox')}</h2><p className="muted small">{t('privateMessagesInfo')}</p></div>{people.map(person => { const last = state?.messages.filter(item => (item.from === viewer.id && item.to === person.id) || (item.to === viewer.id && item.from === person.id)).at(-1); return <button key={person.id} className={`conversation-item ${selected?.id === person.id ? 'active' : ''}`} onClick={() => onSelect(person.id)}><Avatar person={person} /><span><strong>{person.name}</strong><small>{last?.body ?? t('noMessages')}</small></span></button>; })}{!people.length && <p className="section-pad muted">{t('noConnectionsInfo')}</p>}</div><div className="chat-panel">{selected ? <><header className="chat-header"><Avatar person={selected} /><span><strong>{selected.name}</strong><small>{t('privateConversation')}</small></span></header><div className="chat-messages" aria-live="polite">{messages.length ? messages.map(message => <div className={`message-bubble ${message.from === viewer.id ? 'mine' : ''}`} key={message.id}><p>{message.body}</p><small>{dateLabel(message.createdAt, locale, { hour: '2-digit', minute: '2-digit' })}</small></div>) : <p className="muted">{t('noMessages')}</p>}</div><form className="message-form" onSubmit={submit}><label className="sr-only" htmlFor="message-body">{t('message')}</label><input id="message-body" value={body} onChange={event => setBody(event.target.value)} placeholder={t('messagePlaceholder')} maxLength={2000} required /><button className="button" disabled={busy || !body.trim()} aria-label={t('sendMessage')}><Send size={17} /></button></form></> : <Empty title={t('noMessages')} description={t('noConnectionsInfo')} />}</div></div>;
}

export function SearchDialog({ onClose, onSession, onPerson, onExplore }: { onClose: () => void; onSession: (id: string) => void; onPerson: PersonAction; onExplore: () => void }) {
  const t = useTranslations();
  const { state, locale } = useCommunity();
  const viewer = useViewer();
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase(locale);
  const sports = q ? state?.sports.filter(item => item.active && Object.values(item.name).some(name => name.toLocaleLowerCase(locale).includes(q))) ?? [] : [];
  const venues = q ? state?.venues.filter(item => `${item.name} ${item.address} ${item.area[locale]}`.toLocaleLowerCase(locale).includes(q)) ?? [] : [];
  const people = q && state && viewer ? matchPeople(state, viewer).map(item => item.profile).filter(item => `${item.name} ${item.area}`.toLocaleLowerCase(locale).includes(q)) : [];
  const sessions = q && state && viewer ? visibleSessions(state, viewer).filter(item => `${item.title} ${item.description}`.toLocaleLowerCase(locale).includes(q)) : [];
  const total = sports.length + venues.length + people.length + sessions.length;
  const openSport = (id: string) => { sessionStorage.setItem(selectedSportKey, id); onExplore(); window.setTimeout(() => window.dispatchEvent(new Event('hcommunity-select-sport')), 0); };
  return <Dialog title={t('search')} onClose={onClose} wide><div className="section-pad stack"><Field label={t('search')}><div className="search-field"><Search size={18} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} /></div></Field>{q && !total && <Empty title={t('noResults')} description={t('searchTryAnother')} />}{sports.length > 0 && <div className="stack"><h3>{t('sports')}</h3>{sports.map(item => <button key={item.id} className="conversation-item" onClick={() => openSport(item.id)}><span>{item.emoji} {item.name[locale]}</span><ArrowRight size={16} /></button>)}</div>}{venues.length > 0 && <div className="stack"><h3>{t('venues')}</h3>{venues.map(item => <div key={item.id} className="venue-card"><strong>{item.name}</strong><small className="muted">{item.area[locale]} · {t('unverifiedInfo')}</small><a className="small" href={`https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=16/${item.lat}/${item.lng}`} target="_blank" rel="noreferrer">{t('viewOnMap')}</a></div>)}</div>}{people.length > 0 && <div className="stack"><h3>{t('people')}</h3>{people.map(item => <button key={item.id} className="conversation-item" onClick={() => onPerson(item)}><Avatar person={item} /><span><strong>{item.name}</strong><small>{item.area}</small></span><ArrowRight size={16} /></button>)}</div>}{sessions.length > 0 && <div className="stack"><h3>{t('sessions')}</h3>{sessions.map(item => <button key={item.id} className="conversation-item" onClick={() => onSession(item.id)}><span><strong>{item.title}</strong><small>{dateLabel(item.date, locale)}</small></span><ArrowRight size={16} /></button>)}</div>}</div></Dialog>;
}

export function AuthDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations();
  const { client, refresh, state } = useCommunity();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setWorking(true); setError('');
    try { await action(); await refresh(); onSuccess(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setWorking(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'register' && !adult) { setError(t('adultRequired')); return; }
    if (liveMode) {
      void run(() => mode === 'login' ? client.signIn(email.trim(), password) : client.signUp(email.trim(), password, name.trim()));
      return;
    }
    void run(() => client.createProfile(name.trim(), adult));
  };
  return <Dialog title={liveMode ? t('communityAccount') : t('localProfileTitle')} onClose={onClose}><div className="section-pad stack">
    <div className="info-box"><strong>{liveMode ? t('liveAccountTitle') : t('localOnlyTitle')}</strong><p>{liveMode ? t('liveAccountInfo') : t('localOnlyInfo')}</p></div>
    {liveMode && <div className="tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>{t('signIn')}</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>{t('createAccount')}</button></div>}
    <form className="stack" onSubmit={submit}>{(!liveMode || mode === 'register') && <Field label={t('displayName')}><input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={60} autoComplete="name" required /></Field>}{liveMode && <><Field label={t('emailAddress')}><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></Field><Field label={t('password')}><input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></Field></>}{(!liveMode || mode === 'register') && <label className="checkbox-row"><input type="checkbox" checked={adult} onChange={event => setAdult(event.target.checked)} required />{t('adultConfirm')}</label>}<button className="button" disabled={working || (mode === 'register' && !adult) || (!liveMode && name.trim().length < 2)}>{working ? t('loading') : liveMode ? t(mode === 'login' ? 'signIn' : 'createAccount') : t('createLocalProfile')}</button></form>
    {liveMode && <p className="small muted">{t('liveAccountPrivacy')}</p>}
    {!liveMode && <>
    <div className="divider" /><h3>{t('switchProfile')}</h3><p className="small muted">{t('switchProfileInfo')}</p><div className="conversation-list">{state?.profiles.map(person => <button key={person.id} className="conversation-item" disabled={working} onClick={() => void run(() => client.switchProfile(person.id))}><Avatar person={person} /><span><strong>{person.name}</strong><small>{person.area}</small></span><ArrowRight size={16} /></button>)}</div>
    <button className="button button-secondary" disabled={working} onClick={() => void run(() => client.tryDemo())}>{t('returnToDemoViewer')}</button>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div></Dialog>;
}
