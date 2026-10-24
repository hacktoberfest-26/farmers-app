'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { LiveCampusClient } from '@/lib/campus-client';
import { pushSubscriptionSchema, type PushStatus } from '@/lib/push-model';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
export async function registerCampusWorker() {
  return navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, updateViaCache: 'none' });
}

export function CampusNotifications({ client, locale }: { client: LiveCampusClient; locale: 'en' | 'it' }) {
  const it = locale === 'it';
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const available = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(available);
    if (available) void (async () => {
      await registerCampusWorker();
      const worker = await navigator.serviceWorker.ready;
      const sub = await worker.pushManager.getSubscription();
      const result = await client.pushStatus(sub?.endpoint ?? null);
      if (active) { setRegistration(worker); setSubscription(sub); setStatus(result); }
    })().catch(() => { if (active) setMessage(it ? 'Impossibile caricare le notifiche. Riapri il profilo per riprovare.' : 'Unable to load notifications. Reopen your profile to retry.'); });
    return () => { active = false; };
  }, [client, it]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update notifications.'); }
    finally { setBusy(false); }
  };
  const enable = async () => {
    // Called directly from the tap so Safari retains user activation for its permission prompt.
    setMessage(it ? 'Attendi la richiesta del browser. Se non compare, usa l’app installata o un browser esterno.' : 'Waiting for your browser’s permission prompt. If none appears, use the installed app or an external browser.');
    let timer = 0;
    const permission = await Promise.race([Notification.requestPermission(), new Promise<never>((_,reject) => { timer = window.setTimeout(() => reject(new Error(it ? 'Il browser non ha completato la richiesta. Apri Farmers dall’app installata o da un browser esterno.' : 'The browser did not complete the permission request. Open Farmers in the installed app or an external browser.')), 20000); })]).finally(() => window.clearTimeout(timer));
    if (permission !== 'granted') {
      setMessage(it ? 'Consenti le notifiche nelle impostazioni del dispositivo o del browser, poi riprova.' : 'Allow notifications in your device or browser settings, then try again.'); return;
    }
    if (!registration || !status?.publicKey) return;
    const bytes = Uint8Array.from(atob(status.publicKey.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    setSubscription(sub);
    setStatus(await client.enablePush(pushSubscriptionSchema.parse(sub.toJSON()), locale));
    setMessage(it ? 'Notifiche attive per questo account e dispositivo.' : 'Notifications enabled for this account on this device.');
  };
  return <section className="cp-section cp-stack cp-notifications" aria-labelledby="push-title">
    <span className="cp-kicker">{it ? 'Resta in contatto' : 'Stay connected'}</span>
    <h2 id="push-title"><Bell size={23}/> {it ? 'Notifiche' : 'Notifications'}</h2>
    <p className="cp-muted">{it ? 'Ricevi nuovi suggerimenti e match reciproci anche quando Farmers è chiuso. Le anteprime non mostrano nomi o dettagli personali.' : 'Get new suggestions and mutual matches even when Farmers is closed. Previews contain no names or personal details.'}</p>
    <p className="cp-muted">{it ? 'Su iPhone: Condividi → Aggiungi alla schermata Home, poi apri Farmers dall’icona e abilita le notifiche (iOS 16.4 o successivo).' : 'On iPhone: Share → Add to Home Screen, then open Farmers from its icon and enable notifications (iOS 16.4 or later).'}</p>
    {supported === false ? <p role="status">{it ? 'Le notifiche non sono disponibili in questa finestra. Apri l’app installata o un browser compatibile.' : 'Notifications are unavailable in this window. Open the installed app or a supported browser.'}</p>
      : status?.publicKey === null ? <p role="status">{it ? 'Il servizio notifiche non è ancora configurato.' : 'The notification service is not configured yet.'}</p>
      : status?.enabled ? <>
        <p className="cp-kicker">{it ? 'Attive su questo dispositivo' : 'Enabled on this device'}</p>
        <button type="button" className="cp-btn" disabled={busy} onClick={() => void run(async () => { if (!subscription) return; await client.testPush(subscription.endpoint); setMessage(it ? 'Test accettato dal servizio push. Controlla le notifiche del dispositivo.' : 'Test accepted by the push service. Check your device notifications.'); })}>{it ? 'Invia notifica di prova' : 'Send test notification'}</button>
        <button type="button" className="cp-text-button" disabled={busy} onClick={() => void run(async () => { if (!subscription) return; setStatus(await client.disablePush(subscription.endpoint)); await subscription.unsubscribe(); setSubscription(null); })}>{it ? 'Disattiva su questo dispositivo' : 'Disable on this device'}</button>
      </> : <button type="button" className="cp-btn" disabled={busy || !registration || !status?.publicKey} onClick={() => void run(enable)}><Bell size={18}/>{it ? 'Abilita notifiche' : 'Enable notifications'}</button>}
    <small className="cp-muted">{it ? 'Dopo il logout, la scadenza della sessione o un cambio di persona demo, abilita di nuovo le notifiche per l’account scelto.' : 'After signing out, session expiry, or switching demo personas, enable notifications again for the chosen account.'}</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
