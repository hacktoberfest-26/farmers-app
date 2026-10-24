import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { demoCampusEvents } from '../src/lib/campus-demo-events';
import { refreshDemoEvents } from '../server/src/campus-demo-events';
import { interests } from '../src/lib/campus-model';

it('covers every campus interest with future events and preserves the original sports examples',()=>{
 const now=Date.parse('2026-10-24T21:00:00Z');const events=demoCampusEvents(now);
 expect(events).toHaveLength(15);
 expect(new Set(events.map(e=>e.id)).size).toBe(15);
 for(const interest of interests)expect(events.some(e=>e.topics.includes(interest.id))).toBe(true);
 expect(events.every(e=>Date.parse(e.date)>now&&e.source==='demo')).toBe(true);
 expect(events.some(e=>e.title==='Friendly doubles after class')).toBe(true);
});
it('refreshes expired built-in demo events without duplicates or altering uploaded/live events',()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec('CREATE TABLE campus_events(id TEXT PRIMARY KEY,document TEXT NOT NULL)');
 const now=Date.parse('2026-10-24T21:00:00Z');
 const custom={...demoCampusEvents(now)[0],id:'uploaded-demo',title:'Uploaded demo',date:'2020-01-01T12:00:00Z'};
 db.prepare('INSERT INTO campus_events VALUES(?,?)').run(custom.id,JSON.stringify(custom));
 refreshDemoEvents(db,now);
 const snapshot=db.prepare('SELECT * FROM campus_events ORDER BY id').all();
 refreshDemoEvents(db,now+1000);
 expect(db.prepare('SELECT * FROM campus_events ORDER BY id').all()).toEqual(snapshot);
 refreshDemoEvents(db,now+30*86400000);
 expect(db.prepare('SELECT count(*) AS n FROM campus_events').get()).toMatchObject({n:16});
 expect(db.prepare('SELECT document FROM campus_events WHERE id=?').get(custom.id)).toMatchObject({document:JSON.stringify(custom)});
 const expired=db.prepare("SELECT count(*) AS n FROM campus_events WHERE id LIKE 'shared-demo-%' AND julianday(json_extract(document,'$.date'))<=julianday(?)").get(new Date(now+30*86400000).toISOString());
 expect(expired).toMatchObject({n:0});
 }finally{db.close();}
});
