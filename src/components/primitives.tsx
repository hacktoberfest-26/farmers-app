'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Logo } from './logo';
import { X, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Profile } from '@/lib/model';
export function Avatar({person,size='normal'}:{person?:Profile;size?:'small'|'normal'|'large'}) {
 return <span className={`avatar avatar-${size}`} style={{background:person?.color || '#7b877b'}} aria-label={person?.name}>{person?.avatar ? <img src={person.avatar} alt="" /> : (person?.name || 'FM').split(' ').map(x=>x[0]).slice(0,2).join('')}</span>;
}
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
 const t=useTranslations(); const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current;node?.showModal();const close=()=>onClose();node?.addEventListener('cancel',close);return()=>node?.removeEventListener('cancel',close);},[onClose]);
 return <dialog ref={ref} className={`dialog ${wide?'dialog-wide':''}`} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-label={title}><div className="dialog-content"><header className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('close')}><X size={21}/></button></header>{children}</div></dialog>;
}
export function Empty({title,description,children}:{title:string;description?:string;children?:ReactNode}) { return <div className="empty"><span className="empty-symbol"><Logo size={55}/></span><h3>{title}</h3>{description&&<p>{description}</p>}{children}</div>; }
export function SportBadge({emoji,name}:{emoji:string;name:string}) {return <span className="sport-badge"><span>{emoji}</span>{name}</span>;}
export function Verified() {const t=useTranslations();return <span className="verified" title={t('verifiedMember')}><Check size={9} strokeWidth={4}/></span>;}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
