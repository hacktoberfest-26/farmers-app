import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Sparkles } from 'lucide-react';
import { campusProfileSchema, colours, goalId, interests, skillId, sportId, type CampusProfileInput } from '@/lib/campus-model';
import type { CampusClient } from '@/lib/campus-client';
import { InterestAvatar } from './avatar';
import type { Locale, Translate } from './copy';

export function Onboarding({ initial, client, locale, t, onSave, onCancel, busy }: { initial: CampusProfileInput; client: CampusClient; locale: Locale; t: Translate; onSave: (profile: CampusProfileInput) => Promise<void>; onCancel?: () => void; busy: boolean }) {
  const [profile, setProfile] = useState(initial);
  const [step, setStep] = useState(0);
  const [custom, setCustom] = useState('');
  const [notice, setNotice] = useState('');
  const [normalising, setNormalising] = useState(false);
  const [normaliseConsent, setNormaliseConsent] = useState(false);
  const sport = profile.sports[0] ?? { sport: 'padel', level: 'beginner', days: [1, 3], slots: ['afternoon'] };
  const update = (change: Partial<CampusProfileInput>) => setProfile(current => ({ ...current, ...change }));
  const toggleInterest = (id: CampusProfileInput['interests'][number]) => update({ interests: profile.interests.includes(id) ? profile.interests.filter(value => value !== id) : profile.interests.length < 6 ? [...profile.interests, id] : profile.interests });
  const sportsEnabled = profile.sports.length > 0;
  const setSport = (change: Partial<typeof sport>) => update({ sports: [{ ...sport, ...change }] });
  const valid = step === 0 ? profile.interests.length >= 3 && profile.interests.length <= 6 : step === 1 ? !sportsEnabled || sport.days.length > 0 && sport.slots.length > 0 : step === 2 ? profile.lookingFor.length > 0 : campusProfileSchema.safeParse(profile).success;
  const normalise = async () => {
    setNotice(''); setNormalising(true);
    try { const result = await client.normaliseInterest(custom.trim()); if (result.categoryId) { if (!profile.interests.includes(result.categoryId)) toggleInterest(result.categoryId); setCustom(''); } else setNotice(t('noCategory')); }
    catch (error) { setNotice(error instanceof Error ? error.message : t('unknownError')); }
    finally { setNormalising(false); }
  };
  const titles = [t('interests'), t('sports'), t('goals'), t('avatar')];
  const descriptions = [t('interestsHelp'), t('sportsHelp'), t('goalsHelp'), t('avatarHelp')];
  return <section className="cp-onboarding">
    <div className="cp-onboard-top"><span className="cp-kicker">{t('step')} {step + 1} / 4</span>{onCancel && <button type="button" className="cp-text-button" onClick={onCancel}>{t('cancel')}</button>}</div>
    <div className="cp-progress" aria-label={`${t('step')} ${step + 1} / 4`}>{titles.map((title, index) => <span key={title} className={index <= step ? 'done' : ''}/>)}</div>
    <h2>{titles[step]}</h2><p className="cp-muted">{descriptions[step]}</p>
    {step === 0 && <div className="cp-stack">
      <div className="cp-interests">{interests.map(interest => <button type="button" key={interest.id} aria-pressed={profile.interests.includes(interest.id)} disabled={!profile.interests.includes(interest.id) && profile.interests.length >= 6} onClick={() => toggleInterest(interest.id)} className={`cp-interest ${profile.interests.includes(interest.id) ? 'selected' : ''}`}><span className="cp-interest-icon">{interest.icon}</span><strong>{interest[locale]}</strong>{profile.interests.includes(interest.id) && <Check size={15}/>}</button>)}</div>
      <small className="cp-muted">{profile.interests.length} / 6 {t('selected')} · {t('provisional')}</small>
      <div className="cp-inline-field"><label className="cp-field"><span>{t('addOther')}</span><input value={custom} onChange={event => setCustom(event.target.value)} maxLength={200}/></label><button type="button" className="cp-btn cp-secondary" onClick={normalise} disabled={normalising || !custom.trim() || profile.interests.length >= 6 || client.mode === 'live' && !normaliseConsent}><Sparkles size={15}/>{t('normalise')}</button></div>
      {client.mode === 'live' && <label className="cp-check"><input type="checkbox" checked={normaliseConsent} onChange={event => setNormaliseConsent(event.target.checked)}/><span>{locale === 'it' ? 'Consento di inviare questo testo a Gemma ospitato tramite Backboard per trovare una categoria. Non includere dati personali.' : 'I agree to send this text to hosted Gemma through Backboard to find a category. Do not include personal information.'}</span></label>}
      {client.mode === 'demo' && <small className="cp-muted">{t('normaliseDemo')}</small>}
    </div>}
    {step === 1 && <div className="cp-stack">
      <div className="cp-choice-row"><button type="button" className={`cp-choice ${sportsEnabled ? 'selected' : ''}`} onClick={() => update({ sports: [sport] })}>{t('sportYes')}</button><button type="button" className={`cp-choice ${!sportsEnabled ? 'selected' : ''}`} onClick={() => update({ sports: [] })}>{t('sportNo')}</button></div>
      {sportsEnabled && <><div className="cp-form-grid"><label className="cp-field"><span>{t('sport')}</span><select value={sport.sport} onChange={event => { const parsed = sportId.safeParse(event.target.value); if (parsed.success) setSport({ sport: parsed.data }); }}>{sportId.options.map(id => <option value={id} key={id}>{id[0]?.toLocaleUpperCase()}{id.slice(1)}</option>)}</select></label><label className="cp-field"><span>{t('level')}</span><select value={sport.level} onChange={event => { const value = event.target.value; if (value === 'beginner' || value === 'intermediate' || value === 'advanced') setSport({ level: value }); }}>{(['beginner', 'intermediate', 'advanced'] as const).map(level => <option key={level} value={level}>{t(level)}</option>)}</select></label></div>
      <fieldset className="cp-fieldset"><legend>{t('days')}</legend><div className="cp-chips">{Array.from({ length: 7 }, (_, day) => <button type="button" key={day} aria-pressed={sport.days.includes(day)} className={`cp-chip ${sport.days.includes(day) ? 'selected' : ''}`} onClick={() => setSport({ days: sport.days.includes(day) ? sport.days.filter(value => value !== day) : [...sport.days, day] })}>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 19 + day)))}</button>)}</div></fieldset>
      <fieldset className="cp-fieldset"><legend>{t('slots')}</legend><div className="cp-chips">{(['morning', 'afternoon', 'evening'] as const).map(slot => <button type="button" key={slot} aria-pressed={sport.slots.includes(slot)} className={`cp-chip ${sport.slots.includes(slot) ? 'selected' : ''}`} onClick={() => setSport({ slots: sport.slots.includes(slot) ? sport.slots.filter(value => value !== slot) : [...sport.slots, slot] })}>{t(slot)}</button>)}</div></fieldset></>}
    </div>}
    {step === 2 && <div className="cp-stack">
      <div className="cp-goals">{goalId.options.map(goal => <button type="button" key={goal} aria-pressed={profile.lookingFor.includes(goal)} className={`cp-choice ${profile.lookingFor.includes(goal) ? 'selected' : ''}`} onClick={() => update({ lookingFor: profile.lookingFor.includes(goal) ? profile.lookingFor.filter(value => value !== goal) : [...profile.lookingFor, goal] })}>{t(goal === 'sport' ? 'goalSport' : goal)}{profile.lookingFor.includes(goal) && <Check size={15}/>}</button>)}</div>
      <fieldset className="cp-fieldset"><legend>{t('skills')}</legend><div className="cp-chips">{skillId.options.map(skill => <button type="button" key={skill} aria-pressed={profile.skills.includes(skill)} className={`cp-chip ${profile.skills.includes(skill) ? 'selected' : ''}`} onClick={() => update({ skills: profile.skills.includes(skill) ? profile.skills.filter(value => value !== skill) : [...profile.skills, skill] })}>{t(skill)}</button>)}</div></fieldset>
      <label className="cp-field"><span><LockKeyhole size={13}/> {t('idea')}</span><textarea rows={4} maxLength={2000} value={profile.privateIdea} onChange={event => update({ privateIdea: event.target.value })}/><small>{t(client.mode === 'demo' ? 'ideaDemo' : 'ideaHint')}</small></label>
    </div>}
    {step === 3 && <div className="cp-stack">
      <div className="cp-avatar-picker"><InterestAvatar avatar={{ colour: profile.colour, interests: profile.interests }} size={150}/><div className="cp-colours" aria-label={t('colour')}>{colours.map(colour => <button type="button" aria-label={`${t('colour')} ${colour}`} aria-pressed={profile.colour === colour} style={{ background: colour }} className={profile.colour === colour ? 'selected' : ''} key={colour} onClick={() => update({ colour })}>{profile.colour === colour && <Check size={16}/>}</button>)}</div></div>
      <label className="cp-field"><span>{t('name')}</span><input required minLength={2} maxLength={60} value={profile.name} onChange={event => update({ name: event.target.value })}/></label>
      <div className="cp-form-grid"><label className="cp-field"><span>{t('course')}</span><input maxLength={100} value={profile.course} onChange={event => update({ course: event.target.value })}/></label><label className="cp-field"><span>{t('year')}</span><input maxLength={20} value={profile.year} onChange={event => update({ year: event.target.value })}/></label></div>
      <div className="cp-consents">{(['matching', 'hostedAi', 'events', 'resources'] as const).filter(key => client.mode !== 'demo' || key !== 'hostedAi').map(key => <label className="cp-check" key={key}><input type="checkbox" checked={profile.consent[key]} onChange={event => update({ consent: { ...profile.consent, [key]: event.target.checked } })}/><span>{t(key === 'matching' ? 'matchingConsent' : key === 'hostedAi' ? 'aiConsent' : key === 'events' ? 'eventsConsent' : 'resourcesConsent')}</span></label>)}{client.mode === 'demo' && <p className="cp-note">{t('demoAgentCopy')}</p>}</div>
    </div>}
    {notice && <p className="cp-inline-notice" role="status">{notice}</p>}
    <div className="cp-onboard-actions"><button type="button" className="cp-text-button" onClick={() => { setStep(current => current - 1); setNotice(''); }} disabled={step === 0 || busy}><ArrowLeft size={15}/>{t('back')}</button><button type="button" className="cp-btn" disabled={!valid || busy} onClick={() => { if (step < 3) { setStep(current => current + 1); setNotice(''); } else void onSave(campusProfileSchema.parse(profile)); }}>{step === 3 ? t(onCancel ? 'save' : 'finish') : t('next')}<ArrowRight size={15}/></button></div>
  </section>;
}
