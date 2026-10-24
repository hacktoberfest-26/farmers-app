import { CalendarDays,MapPin } from 'lucide-react';
import { interests,type CampusEvent,type CampusProfileInput } from '@/lib/campus-model';

export function CampusEvents({events,profile,locale}:{events:CampusEvent[];profile:CampusProfileInput;locale:'en'|'it'}) {
 const it=locale==='it';
 return <section className="cp-section cp-stack"><span className="cp-kicker">{it?'VIVI IL CAMPUS':'AROUND CAMPUS'}</span><h2>{it?'Eventi per te':'Events for you'}</h2><p className="cp-muted">{it?'Attività in programma selezionate in base ai tuoi interessi.':'Upcoming activities selected to match your interests.'}</p>
 {!profile.consent.events?<p>{it?'Attiva i suggerimenti di eventi in Profilo → Modifica → Profilo e privacy.':'Enable event suggestions in Profile → Edit → Profile & privacy.'}</p>:!events.length?<p>{it?'Non ci sono eventi futuri per i tuoi interessi.':'No upcoming events match your interests yet.'}</p>:<div className="cp-event-grid">{events.map(event=><article className="cp-event-card" key={event.id}>
 <span className="cp-kicker">{event.source==='demo'?(it?'EVENTO DEMO FITTIZIO':'FICTIONAL DEMO EVENT'):(it?'NEL CAMPUS':'ON CAMPUS')}</span><h3>{event.title}</h3>
 <p><CalendarDays size={17}/><time dateTime={event.date}>{new Date(event.date).toLocaleString(locale,{timeZone:'Europe/Rome',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · Rome</time></p><p><MapPin size={17}/>{event.place}</p>
 <div className="cp-event-topics" aria-label={it?'Interessi in comune':'Matching interests'}>{event.topics.filter(topic=>profile.interests.includes(topic)).map(topic=><span className="cp-chip" key={topic}>{interests.find(interest=>interest.id===topic)?.[locale]}</span>)}</div>
 </article>)}</div>}
 </section>;
}
