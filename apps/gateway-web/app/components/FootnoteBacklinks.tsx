'use client';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from './TranslationProvider';
import { ReaderMenu } from './ReaderMenu';
import { useFootnoteReferences } from './Footnotes';
import styles from './ReaderMenu.module.css';
export function FootnoteBacklinks({noteId,referenceIds,idPrefix}:{noteId:string;referenceIds:string[];idPrefix:string}){
  const t=useTranslation(), locations=useFootnoteReferences(noteId);
  const [opened,setOpened]=useState<{x:number;y:number;origin:HTMLElement}|null>(null);
  const [tooltipVisible,setTooltipVisible]=useState(false);
  const tooltipId=useId();
  const close=useCallback((restore:boolean)=>setOpened(previous=>{if(restore)previous?.origin.focus({preventScroll:true});return null;}),[]);
  const ids=[...new Set(referenceIds)];
  if(!ids.length)return null;
  const href=(id:string)=>'#'+idPrefix+'ref-'+id;
  const multiple=ids.length>1;
  const label=multiple?t({en:'Back to references',de:'Zurück zu den Verweisen'})+' ('+ids.length+')':t({en:'Back to reference',de:'Zurück zum Verweis'});
  return <span className={styles.backlinkControl} data-reader-chrome onMouseEnter={()=>setTooltipVisible(true)} onMouseLeave={()=>setTooltipVisible(false)}><a className={styles.backlink} href={href(ids[0])} aria-label={label} aria-describedby={tooltipVisible&&!opened?tooltipId:undefined} role={multiple?'button':undefined} aria-haspopup={multiple?'menu':undefined} aria-expanded={multiple?Boolean(opened):undefined} onFocus={()=>setTooltipVisible(true)} onBlur={()=>setTooltipVisible(false)} onClick={event=>{setTooltipVisible(false);if(!multiple)return;event.preventDefault();const box=event.currentTarget.getBoundingClientRect();setOpened({x:box.left,y:box.bottom,origin:event.currentTarget});}} onKeyDown={event=>{if(event.key==='Escape'){setTooltipVisible(false);}if(multiple&&event.key===' '){event.preventDefault();event.currentTarget.click();}}}><span aria-hidden="true">↑</span></a>
    {tooltipVisible&&!opened?<span id={tooltipId} role="tooltip" className={styles.backlinkTooltip}>{label}</span>:null}
    {opened?<ReaderMenu title={t({en:'Choose a footnote reference',de:'Fußnotenverweis auswählen'})} position={opened} origin={opened.origin} onClose={close} items={ids.map((id,index)=>({id,href:href(id),label:t({en:'Reference',de:'Verweis'})+' '+(index+1),description:locations.find(item=>item.id===id)?.label||undefined}))} />:null}</span>;
}
