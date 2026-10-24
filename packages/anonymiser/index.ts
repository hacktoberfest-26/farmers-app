/** Construct prompts from a controlled vocabulary. Raw profile text is never copied. */
export type Vocabulary = { interests:readonly string[]; skills:readonly string[]; goals:readonly string[]; sports:readonly string[] };
export type FeatureSource = { interests:readonly string[]; skills:readonly string[]; lookingFor:readonly string[]; sports:readonly {sport:string;level:string;days:readonly number[];slots:readonly string[]}[] };
export type AnonymousFeatures = { interests:string[];skills:string[];looking_for:string[];sports:{sport:string;level:string;days:number[];slots:string[]}[] };
export type AnonymousPair = { type:'cofounder'|'sport'|'lunch'; person_a:AnonymousFeatures; person_b:AnonymousFeatures };
const allowed = (values:readonly string[],vocabulary:readonly string[]) => [...new Set(values.filter(value=>vocabulary.includes(value)))].slice(0,9);
export function anonymise(source:FeatureSource,vocabulary:Vocabulary):AnonymousFeatures {
  return {interests:allowed(source.interests,vocabulary.interests),skills:allowed(source.skills,vocabulary.skills),looking_for:allowed(source.lookingFor,vocabulary.goals),
    sports:source.sports.filter(item=>vocabulary.sports.includes(item.sport)&&['beginner','intermediate','advanced'].includes(item.level)).slice(0,9).map(item=>({sport:item.sport,level:item.level,days:[...new Set(item.days.filter(day=>Number.isInteger(day)&&day>=0&&day<=6))],slots:allowed(item.slots,['morning','afternoon','evening'])}))};
}
export function anonymousPair(type:AnonymousPair['type'],a:FeatureSource,b:FeatureSource,vocabulary:Vocabulary):AnonymousPair {
  return {type,person_a:anonymise(a,vocabulary),person_b:anonymise(b,vocabulary)};
}
export function scrubInterest(text:string):string {
  return text.slice(0,300).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/https?:\/\/\S+/gi,'[link]').replace(/(?:\+?\d[\s().-]*){7,}/g,'[number]').slice(0,200);
}
