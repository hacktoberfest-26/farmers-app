import type { CampusEvent } from './campus-model';

// Stable IDs let both demo modes share a calendar without duplicating entries.
const fixtures: { id: string; title: string; place: string; topics: CampusEvent['topics'] }[] = [
  {id:'coffee',title:'Ideas over coffee',place:'Campus café',topics:['business','community','design']},
  {id:'ai-lab',title:'Build with AI: hands-on lab',place:'Innovation lab',topics:['technology','design']},
  {id:'founders',title:'Find your co-founder',place:'Startup lounge',topics:['business','technology']},
  {id:'design',title:'Design jam: rethink campus life',place:'Design studio',topics:['design','arts','community']},
  {id:'climate',title:'Climate-tech ideas exchange',place:'Innovation hub',topics:['sustainability','business','technology']},
  {id:'music',title:'Open mic and music night',place:'Campus common room',topics:['music','arts','community']},
  {id:'tennis',title:'Friendly doubles after class',place:'Campus court',topics:['sport','community']},
  {id:'padel',title:'Padel practice for beginners',place:'Padel court',topics:['sport','community']},
  {id:'basketball',title:'Campus 3v3 pickup',place:'Multi-sport court',topics:['sport','community']},
  {id:'volleyball',title:'Evening volleyball',place:'Campus court',topics:['sport','community']},
  {id:'gym',title:'After-class training partners',place:'Training room',topics:['sport','community']},
  {id:'soccer',title:'Five-a-side, looking for players',place:'Campus field',topics:['sport','community']},
  {id:'climbing',title:'Intro climbing meetup',place:'Climbing centre',topics:['sport','community']},
  {id:'bmx',title:'Easy weekend BMX ride',place:'Activity park',topics:['sport','sustainability']},
  {id:'skate',title:'Relaxed skate meetup',place:'Activity park',topics:['sport','arts']},
];

export function demoCampusEvents(now = Date.now()): CampusEvent[] {
  return fixtures.map((fixture,index)=>{
    const date=new Date(now);
    date.setUTCDate(date.getUTCDate()+1+Math.floor(index/2));
    date.setUTCHours(index%2?16:11,0,0,0);
    return {...fixture,id:`shared-demo-${fixture.id}`,date:date.toISOString(),place:`${fixture.place} · fictional demo`,source:'demo'};
  });
}
