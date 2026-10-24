import type { DatabaseSync } from 'node:sqlite';
import { demoCampusEvents } from '../../src/lib/campus-demo-events';

export function refreshDemoEvents(db:DatabaseSync,now=Date.now()) {
  const insert=db.prepare(`INSERT INTO campus_events(id,document) VALUES(?,?)
    ON CONFLICT(id) DO UPDATE SET document=excluded.document
    WHERE json_extract(campus_events.document,'$.source')='demo'
      AND julianday(json_extract(campus_events.document,'$.date'))<=julianday(?)`);
  for(const event of demoCampusEvents(now))insert.run(event.id,JSON.stringify(event),new Date(now).toISOString());
}
