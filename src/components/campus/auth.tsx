import { useState } from 'react';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import type { CampusClient } from '@/lib/campus-client';
import type { CampusHome } from '@/lib/campus-model';
import { sharedDemoAccounts } from '@/lib/campus-demo-accounts';
import type { Translate } from './copy';

export function CampusAuth({ client, auth, t, onSuccess, onDemo, operatorOnly=false }: { client: CampusClient; auth: CampusHome['auth']; t: Translate; onSuccess: () => Promise<void>; onDemo: () => void; operatorOnly?:boolean }) {
  const [tab, setTab] = useState<'shared' | 'student' | 'operator'>(operatorOnly ? 'operator' : auth.sharedDemo ? 'shared' : 'student');
  const [alias, setAlias] = useState('alex');
  const [passcode, setPasscode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="cp-auth">
    {!operatorOnly&&<div className="cp-auth-tabs">{auth.sharedDemo && <button type="button" className={tab === 'shared' ? 'active' : ''} onClick={() => { setTab('shared'); setError(''); }}>{t('sharedDemo')}</button>}<button type="button" className={tab === 'student' ? 'active' : ''} onClick={() => { setTab('student'); setError(''); }}>{t('student')}</button><button type="button" className={tab === 'operator' ? 'active' : ''} onClick={() => { setTab('operator'); setError(''); }}>{t('operator')}</button></div>}
    {tab === 'shared' && <div className="cp-note"><ShieldCheck size={18}/><p>{t('sharedNotice')}</p></div>}
    {tab === 'student' && !auth.emailEnabled && <div className="cp-note"><Mail size={18}/><p>{t('authDisabled')}</p></div>}
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { if (tab === 'shared') { await client.signInSharedDemo(passcode, alias); setPasscode(''); await onSuccess(); } else if (tab === 'operator') { await client.signIn(email, password); await onSuccess(); } else if (challenge) { await client.verifyCode(challenge, code); await onSuccess(); } else { const receipt = await client.requestCode(email); setChallenge(receipt.challengeId); } } catch (cause) { setError(cause instanceof Error ? cause.message : t('unknownError')); } finally { setBusy(false); } }}>
      {tab === 'shared' ? <><label className="cp-field"><span>{t('demoPerson')}</span><select value={alias} onChange={event => setAlias(event.target.value)}>{sharedDemoAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="cp-field"><span>{t('sharedPasscode')}</span><input type="password" required autoComplete="off" value={passcode} onChange={event => setPasscode(event.target.value)}/></label></> : <label className="cp-field"><span>{t('email')}</span><input type="email" required autoComplete="email" placeholder={tab === 'operator' ? 'admin@farmers.johno.it' : auth.domains[0] ? `you@${auth.domains[0]}` : 'you@university.example'} value={email} onChange={event => setEmail(event.target.value)} disabled={tab === 'student' && Boolean(challenge)}/></label>}
      {tab === 'operator' && <label className="cp-field"><span>{t('password')}</span><input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>}
      {tab === 'student' && challenge && <><p className="cp-muted">{t('codeSent')}</p><label className="cp-field"><span>{t('code')}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}/></label></>}
      {error && <p role="alert" className="cp-error">{error}</p>}
      <button className="cp-btn cp-wide" disabled={busy || tab === 'student' && !auth.emailEnabled} type="submit">{t(tab === 'shared' ? 'enterSharedDemo' : tab === 'operator' ? 'signIn' : challenge ? 'verify' : 'sendCode')}<ArrowRight size={15}/></button>
    </form>
    {tab === 'operator' && <p className="cp-fine"><ShieldCheck size={13}/>{t('bootstrapNote')}</p>}
    {!operatorOnly&&<><div className="cp-divider"><span>Farmers</span></div>
    <button type="button" className="cp-btn cp-secondary cp-wide" onClick={onDemo}>{t('tryDemo')}<ArrowRight size={15}/></button>
    <p className="cp-fine cp-center">{t('demoDetail')}</p></>}
  </div>;
}
