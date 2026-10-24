'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import it from '@/messages/it.json';
import { CommunityClient } from '@/lib/client';
import { communityConfig, localeSchema, type Command, type CommunityState, type Locale } from '@/lib/model';

type Store = { state: CommunityState | null; refresh: () => Promise<void>; execute: (command:Command) => Promise<boolean>; client: CommunityClient; locale: Locale; setLocale: (locale:Locale) => void; toast: (message:string) => void; online: boolean; busy: boolean; error:string };
const Context = createContext<Store | null>(null);
export function useCommunity() { const value = useContext(Context); if (!value) throw new Error('Missing community provider'); return value; }
export function CommunityProvider({children}:{children:ReactNode}) {
 const [client] = useState(() => new CommunityClient());
 const [state,setState] = useState<CommunityState|null>(null);
 const [locale,setLocaleState] = useState<Locale>('en');
 const [online,setOnline] = useState(true);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const [notice,setNotice] = useState('');
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const toast = useCallback((message:string) => { const dictionary=locale==='it'?it:en; setNotice(message in dictionary?Reflect.get(dictionary,message):message); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(''),5000); },[locale]);
 const refresh = useCallback(async () => { try { setState(await client.snapshot()); setError(''); } catch(error) { setError(error instanceof Error ? error.message : 'Unable to load community'); } },[client]);
 useEffect(() => {
  const parsed = localeSchema.safeParse(localStorage.getItem('hcommunity-locale'));
  if (parsed.success) setLocaleState(parsed.data);
  void refresh();
  const update = () => setOnline(navigator.onLine); update();
  window.addEventListener('online', update); window.addEventListener('offline', update);
  const unsubscribe = client.subscribe(() => void refresh());
  return () => { unsubscribe(); window.removeEventListener('online',update); window.removeEventListener('offline',update); if (timer.current) clearTimeout(timer.current); };
 },[client,refresh]);
 const setLocale = (next:Locale) => { setLocaleState(next); localStorage.setItem('hcommunity-locale',next); document.documentElement.lang = next; };
 const execute = async(command:Command) => {
  setBusy(true);
  try { setState(await client.execute(command)); return true; }
  catch(error) { const message = error instanceof Error ? error.message : 'Something went wrong'; const dictionary = locale === 'it' ? it : en; toast(message in dictionary ? Reflect.get(dictionary,message) : message); return false; }
  finally { setBusy(false); }
 };
 return <NextIntlClientProvider locale={locale} messages={locale==='it'?it:en} timeZone={communityConfig.timezone}><Context.Provider value={{state,refresh,execute,client,locale,setLocale,toast,online,busy,error}}>{children}<div className={`toast ${notice?'visible':''}`} role="status" aria-live="polite">{notice}</div></Context.Provider></NextIntlClientProvider>;
}
