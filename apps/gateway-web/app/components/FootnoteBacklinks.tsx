'use client';
import { useCallback, useState } from 'react';
import { useTranslation } from './TranslationProvider';
import { ReaderMenu } from './ReaderMenu';
import { LocalizedFootnoteBacklink } from './LocalizedRegion';
import { useFootnoteReferences } from './Footnotes';
import styles from './ReaderMenu.module.css';
export function FootnoteBacklinks({noteId,referenceIds,idPrefix}:{noteId:string;referenceIds:string[];idPrefix:string}){
  const t=useTranslation(), locations=useFootnoteReferences(noteId);
  const [opened,setOpened]=useState<{x:number;y:number;origin:HTMLElement}|null>(null);
  const close=useCallback((restore:boolean)=>setOpened(previous=>{if(restore)previous?.origin.focus({preventScroll:true});return null;}),[]);
  const ids=[...new Set(referenceIds)];
  if(!ids.length)return null;
  const href=(id:string)=>'#'+idPrefix+'ref-'+id;
  if(ids.length===1)return <span data-reader-chrome><LocalizedFootnoteBacklink href={href(ids[0])} index={1} /></span>;
  return <span data-reader-chrome><a className={styles.backlink} href={href(ids[0])} role="button" aria-haspopup="menu" aria-expanded={Boolean(opened)} onClick={event=>{event.preventDefault();const box=event.currentTarget.getBoundingClientRect();setOpened({x:box.left,y:box.bottom,origin:event.currentTarget});}} onKeyDown={event=>{if(event.key===' '){event.preventDefault();event.currentTarget.click();}}}>{t({en:'Back to references',de:'Zurück zu den Verweisen'})} ({ids.length}) ↑</a>
    {opened?<ReaderMenu title={t({en:'Choose a footnote reference',de:'Fußnotenverweis auswählen'})} position={opened} origin={opened.origin} onClose={close} items={ids.map((id,index)=>({id,href:href(id),label:t({en:'Reference',de:'Verweis'})+' '+(index+1),description:locations.find(item=>item.id===id)?.label||undefined}))} />:null}</span>;
}
