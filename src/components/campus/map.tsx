'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { locationFixSchema, type CampusMapState } from '@/lib/campus-model';
import type { CampusClient } from '@/lib/campus-client';
import type { Locale } from './copy';

const messageSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('farmers-position'),fix:locationFixSchema.nullable()}),
  z.object({type:z.literal('farmers-ready')}),
]);
export function CampusMap({client,locale}:{client:CampusClient;locale:Locale}){
 const frame=useRef<HTMLIFrameElement>(null);
 const queue=useRef<Promise<CampusMapState>>(Promise.resolve({own:null,people:[]}));
 const [sharing,setSharing]=useState(false);
 const [state,setState]=useState<CampusMapState>({own:null,people:[]});
 const [error,setError]=useState('');
 const it=locale==='it';
 useEffect(()=>{
  let active=true;
  let sending=false;
  let lastSent=0;
  const post=(data:CampusMapState)=>frame.current?.contentWindow?.postMessage({type:'farmers-people',people:data.people},window.location.origin);
  const refresh=async()=>{try{const data=await client.map();if(active){setState(data);post(data);}}catch(e){if(active)setError(e instanceof Error?e.message:'Map unavailable');}};
  const receive=async(event:MessageEvent<unknown>)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
   const result=messageSchema.safeParse(event.data);if(!result.success)return;
   if(result.data.type==='farmers-ready'){void refresh();return;}
   if(!sharing||sending)return;
   const fix=result.data.fix;
   if(fix&&Date.now()-lastSent<5000)return;
   sending=true;lastSent=Date.now();
   try{queue.current=queue.current.catch(()=>({own:null,people:[]})).then(()=>client.shareLocation(fix));const data=await queue.current;if(active){setState(data);setError('');post(data);if(!fix)setSharing(false);}}
   catch(e){if(active){setSharing(false);setError(e instanceof Error?e.message:'Location update failed');}}
   finally{sending=false;}
  };
  void refresh();const timer=window.setInterval(()=>{setState(previous=>({...previous,people:previous.people.filter(person=>Date.now()-person.location.updatedAt<120000)}));void refresh();},5000);
  window.addEventListener('message',receive);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('message',receive);};
 },[client,sharing]);
 const stop=async()=>{setSharing(false);try{queue.current=queue.current.catch(()=>({own:null,people:[]})).then(()=>client.shareLocation(null));setState(await queue.current);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to stop sharing. Position expires after two minutes.');}};
 return <section className="cp-campus-map">
  <div className="cp-map-consent"><h2>{it?'Incontriamoci nel campus':'Meet on campus'}</h2><p>{it?'La posizione è visibile solo dopo due sì. Scompare dopo 2 minuti senza aggiornamenti.':'Your position is visible only to mutual matches. It expires after 2 minutes without updates.'}</p>
  {client.mode==='demo'?<p>{it?'Per condividere tra dispositivi usa la demo condivisa.':'Use the shared demo to share positions across devices.'}</p>:<button className={`cp-btn ${sharing?'cp-secondary':''}`} onClick={()=>sharing?void stop():setSharing(true)}>{sharing?(it?'Interrompi condivisione':'Stop sharing with matches'):(it?'Condividi con i miei match':'Share with my matches')}</button>}
  <small role="status">{sharing?(it?'Condivisione attiva · avvia GPS o una passeggiata demo sotto':'Sharing enabled · start GPS or a demo walk below'):(it?'GPS privato · condivisione disattivata':'Private GPS · sharing off')}{!sharing&&state.own?' · A previous shared fix is still visible until expiry.':''}</small>
  {!sharing&&state.own&&<button className="cp-text-button" onClick={()=>void stop()}>{it?'Rimuovi posizione precedente':'Remove previous shared position'}</button>}
  {error&&<p role="alert" className="cp-error">{error}</p>}</div>
  <iframe ref={frame} src={`${process.env.NEXT_PUBLIC_BASE_PATH||''}/campus-map/index.html`} title={it?'Mappa interattiva del campus':'Interactive campus map'} allow="geolocation" className="cp-map-frame"/>
  <div className="cp-map-people"><h3>{it?'I tuoi match sulla mappa':'Your matches on the map'}</h3>{state.people.length?state.people.map(person=><button className="cp-map-person" key={person.matchId} onClick={()=>frame.current?.contentWindow?.postMessage({type:'farmers-focus',matchId:person.matchId},window.location.origin)}><strong>{person.name}</strong><span>{person.location.simulated?(it?'Posizione simulata':'Simulated position'):`GPS ±${Math.round(person.location.accuracy)} m`} · {new Date(person.location.updatedAt).toLocaleTimeString(locale)}</span></button>):<p>{it?'I match appariranno qui quando condividono una posizione recente.':'Mutual matches appear here when they share a recent position.'}</p>}</div>
 </section>;
}
