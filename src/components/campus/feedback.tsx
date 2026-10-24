'use client';
import { useState } from 'react';
import { Star, Check } from 'lucide-react';
import { feedbackInputSchema,type FeedbackInput,type MatchFeedback } from '@/lib/campus-model';

export function MatchFeedbackForm({saved,locale,onSave}:{saved:MatchFeedback|null|undefined;locale:'en'|'it';onSave:(input:FeedbackInput)=>Promise<void>}) {
 const it=locale==='it';const [open,setOpen]=useState(false),[rating,setRating]=useState(saved?.rating??0),[outcome,setOutcome]=useState<FeedbackInput['outcome']>(saved?.outcome??'met'),[comment,setComment]=useState(saved?.comment??''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const edit=()=>{setRating(saved?.rating??0);setOutcome(saved?.outcome??'met');setComment(saved?.comment??'');setOpen(true);setMessage('');};
 return <div className="cp-feedback">
  <h4>{it?'Com’è andata?':'How did it go?'}</h4>
  {!open?<><p className="cp-muted">{saved?`${saved.rating}/5 · ${it?'Feedback salvato':'Feedback saved'}`:it?'Raccontaci se questa connessione è stata utile.':'Tell us whether this connection was useful.'}</p><button className="cp-btn cp-secondary" onClick={edit}>{saved?(it?'Modifica feedback':'Edit feedback'):(it?'Lascia un feedback':'Give feedback')}</button></>:<form onSubmit={async event=>{event.preventDefault();setBusy(true);setMessage('');try{await onSave(feedbackInputSchema.parse({rating,outcome,comment}));setOpen(false);setMessage(it?'Feedback salvato. Grazie!':'Feedback saved. Thank you!');}catch(error){setMessage(error instanceof Error?error.message:'Unable to save feedback.');}finally{setBusy(false);}}}>
   <fieldset disabled={busy}><legend>{it?'Quanto è stato utile questo match?':'How useful was this match?'}</legend><div className="cp-rating" role="group" aria-label={it?'Valutazione da 1 a 5':'Rating from 1 to 5'}>{[1,2,3,4,5].map(value=><button type="button" key={value} aria-label={`${value} / 5`} aria-pressed={rating===value} className={value<=rating?'selected':''} onClick={()=>setRating(value)}><Star size={24} fill={value<=rating?'currentColor':'none'}/></button>)}</div>
   <label className="cp-field"><span>{it?'Vi siete incontrati?':'Did you meet?'}</span><select value={outcome} onChange={event=>setOutcome(feedbackInputSchema.shape.outcome.parse(event.target.value))}><option value="met">{it?'Sì, ci siamo incontrati':'Yes, we met'}</option><option value="planned">{it?'Incontro programmato':'Planning to meet'}</option><option value="did-not-meet">{it?'Non ci siamo incontrati':'We did not meet'}</option></select></label>
   <label className="cp-field"><span>{it?'Commento facoltativo':'Optional comment'}</span><textarea value={comment} maxLength={1000} rows={3} onChange={event=>setComment(event.target.value)}/></label>
   <p className="cp-fine">{it?'Visibile a te e all’operatore, non all’altra persona. Non viene inviato a Gemma.':'Visible to you and the operator, not the other person. It is not sent to Gemma.'}</p>
   <button className="cp-btn" disabled={!rating||busy} type="submit"><Check size={18}/>{it?'Salva feedback':'Save feedback'}</button><button className="cp-text-button" type="button" onClick={()=>setOpen(false)}>{it?'Annulla':'Cancel'}</button></fieldset>
  </form>}{message&&<p role="status">{message}</p>}
 </div>;
}
