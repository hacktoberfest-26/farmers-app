import { communityConfig, type Locale } from './model';
export function dateLabel(value:string,locale:Locale,options:Intl.DateTimeFormatOptions={weekday:'short',day:'numeric',month:'short'}) {return new Intl.DateTimeFormat(locale,{...options,timeZone:communityConfig.timezone}).format(new Date(value));}
export function localDateInput(date:Date,timezone=communityConfig.timezone) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===type)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function wallTimeToISO(local:string,timezone=communityConfig.timezone):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Invalid date');
 const parsed=new Date(local+'Z');
 if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,16)!==local) throw new Error('Invalid date');
 const wall=parsed.getTime();
 let utc=wall;
 for(let i=0;i<3;i++){const formatted=localDateInput(new Date(utc),timezone);const delta=new Date(formatted+'Z').getTime()-wall;if(delta===0)return new Date(utc).toISOString();utc-=delta;}
 throw new Error('This time does not exist in the selected timezone');
}
