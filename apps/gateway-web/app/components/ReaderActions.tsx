'use client';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type HTMLAttributes, type RefAttributes } from 'react';
import { createPortal } from 'react-dom';
import type { Passage, ReaderActionIndex } from '../../lib/reader-actions';
import { passageChoices } from '../../lib/reader-actions';
import { useTranslation } from './TranslationProvider';
import { ReaderMenu } from './ReaderMenu';
import styles from './ReaderMenu.module.css';
import { ReaderIcon } from './ReaderIcon';
import { ConstitutionDocument } from './ConstitutionDocument';
const copy = {
  actions:{en:'Copy text or permalink',de:'Text oder dauerhaften Link kopieren'},
  link:{en:'Copy permalink',de:'Dauerhaften Link kopieren'}, text:{en:'Copy original text',de:'Originaltext kopieren'},
  constitution:{en:'Constitution',de:'Verfassung'}, article:{en:'Article',de:'Artikel'}, paragraph:{en:'Paragraph',de:'Absatz'}, sentence:{en:'Sentence',de:'Satz'}, unit:{en:'Unit',de:'Einheit'},
  copiedLink:{en:'Permalink copied',de:'Dauerhafter Link kopiert'},copiedText:{en:'Original text copied',de:'Originaltext kopiert'},
  manual:{en:'Select and copy this field.',de:'Markieren und kopieren Sie dieses Feld.'},close:{en:'Close',de:'Schließen'},
};
type Open = (element?: Element | null, point?: {x:number;y:number}, origin?: HTMLElement | null) => void;
const Actions=createContext<Open>(()=>{});
export function useReaderActions(){return useContext(Actions);}
export function ReaderCopyButton({className,labelClassName}:{className:string;labelClassName:string}){const open=useReaderActions(),t=useTranslation();return <button type="button" className={className} aria-label={t(copy.actions)} aria-haspopup="menu" onClick={event=>open(undefined,undefined,event.currentTarget)}><ReaderIcon name="copy" /><span className={labelClassName}>{t({en:'Copy',de:'Kopieren'})}</span></button>;}
export function ReaderDocument(props: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>) {
  const open=useReaderActions();
  return <ConstitutionDocument {...props} data-reader-document tabIndex={-1} onContextMenu={event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target||target.closest('a,button,input,textarea,select,[contenteditable=true],[role=note]')||(target.closest('[data-reader-chrome]')&&!target.closest('h1')))return;
    event.preventDefault();open(target,{x:event.clientX,y:event.clientY});
  }} onKeyDown={event=>{
    if(event.key!=='ContextMenu'&&!(event.key==='F10'&&event.shiftKey))return;
    const target=event.target instanceof Element?event.target:null;
    if(!target||target.closest('a,button,input,textarea,select,[contenteditable=true]'))return;
    event.preventDefault();event.stopPropagation();open(target);
  }} />;
}
export function ReaderActions({index,currentId,children}:{index:ReaderActionIndex;currentId:string;children:ReactNode}){
  const t=useTranslation(), id=useId();
  const [opened,setOpened]=useState<{choices:Passage[];position:{x:number;y:number};origin:HTMLElement|null}|null>(null);
  const [feedback,setFeedback]=useState(''),[fallback,setFallback]=useState<{value:string;title:string;origin:HTMLElement|null}|null>(null);
  const field=useRef<HTMLTextAreaElement>(null),fallbackClose=useRef<HTMLButtonElement>(null);
  const open=useCallback<Open>((element,point,origin)=>{
    const selection=window.getSelection();
    const selected=selection?.anchorNode?.nodeType===Node.ELEMENT_NODE?selection.anchorNode as Element:selection?.anchorNode?.parentElement;
    const target=element??(!selection?.isCollapsed&&selected?.closest('[data-reader-document]')?selected:document.getElementById(currentId));
    const anchor=origin??target?.closest<HTMLElement>('[tabindex],button,a[href]')??(target instanceof HTMLElement?target:null),box=anchor?.getBoundingClientRect();
    setFeedback('');setOpened({choices:passageChoices(index,target??null),position:point??{x:box?.left??16,y:box?.bottom??100},origin:anchor});
  },[index,currentId]);
  const close=useCallback((restore:boolean)=>{setOpened(previous=>{if(restore)previous?.origin?.focus({preventScroll:true});return null;});},[]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),3500);return()=>clearTimeout(timer);},[feedback]);
  useEffect(()=>{if(!fallback)return;field.current?.focus({preventScroll:true});field.current?.select();},[fallback]);
  async function perform(passage:Passage,type:'link'|'text'){
    const value=type==='link'?new URL(passage.href,window.location.href).href:passage.text;
    const origin=opened?.origin??null;close(true);
    try{if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');await navigator.clipboard.writeText(value);setFeedback(t(type==='link'?copy.copiedLink:copy.copiedText));}
    catch{setFallback({value,title:t(type==='link'?copy.link:copy.text),origin});}
  }
  function dismissFallback(){const origin=fallback?.origin;setFallback(null);origin?.focus({preventScroll:true});}
  return <Actions.Provider value={open}>{children}{opened?<ReaderMenu title={t(copy.actions)} position={opened.position} origin={opened.origin} onClose={close} items={(['link','text'] as const).flatMap(type=>opened.choices.map(passage=>({id:type+':'+passage.id,group:t(copy[type]),label:passage.kindLabel??t(copy[passage.kind]),description:passage.label,onSelect:()=>{void perform(passage,type);}})))} />:null}
    {feedback?createPortal(<div role="status" className={styles.feedback}>{feedback}</div>,document.body):null}
    {fallback?createPortal(<section role="dialog" aria-modal="false" aria-labelledby={id} className={styles.fallback} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismissFallback();}
      if(event.key==='Tab'){event.preventDefault();(document.activeElement===field.current?fallbackClose.current:field.current)?.focus();}
    }}><h2 id={id}>{fallback.title}</h2><p>{t(copy.manual)}</p><textarea ref={field} readOnly value={fallback.value} aria-label={fallback.title} /><button ref={fallbackClose} type="button" onClick={dismissFallback}>{t(copy.close)}</button></section>,document.body):null}
  </Actions.Provider>;
}
