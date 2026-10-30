'use client';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './ReaderMenu.module.css';
export type ReaderMenuItem = { id: string; label: string; description?: string; group?: string; href?: string; onSelect?: () => void };
export function ReaderMenu({ title, items, position, origin, onClose, compact = false }: { title: string; items: ReaderMenuItem[]; position: { x: number; y: number }; origin?: HTMLElement | null; onClose: (restoreFocus: boolean) => void; compact?: boolean }) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function place() {
      const node=menu.current; if(!node)return; const box=node.getBoundingClientRect();
      node.style.left=Math.max(12,Math.min(position.x,window.innerWidth-box.width-12))+'px';
      node.style.top=Math.max(12,Math.min(position.y,window.innerHeight-box.height-12))+'px';
    }
    place(); menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({preventScroll:true});
    window.addEventListener('resize',place); return()=>window.removeEventListener('resize',place);
  },[position]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))onClose(false);};
    const scroll=(event:Event)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))onClose(false);};
    document.addEventListener('pointerdown',outside,true);window.addEventListener('wheel',scroll,true);window.addEventListener('touchmove',scroll,true);
    return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('wheel',scroll,true);window.removeEventListener('touchmove',scroll,true);};
  },[onClose]);
  return createPortal(<div ref={menu} className={[styles.menu,compact?styles.compact:''].join(' ')} role="menu" aria-label={title} data-reader-menu onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose(true);origin?.focus({preventScroll:true});return;}
    if(event.key===' '&&event.target instanceof HTMLElement&&event.target.matches('[role=menuitem]')){event.preventDefault();event.target.click();return;}
    if(event.key==='Tab'){onClose(true);origin?.focus({preventScroll:true});return;}
    const options=[...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')],at=options.indexOf(document.activeElement as HTMLElement);
    const next=event.key==='ArrowDown'?(at+1)%options.length:event.key==='ArrowUp'?(at-1+options.length)%options.length:event.key==='Home'?0:event.key==='End'?options.length-1:-1;
    if(next>=0){event.preventDefault();event.stopPropagation();options[next]?.focus({preventScroll:true});options[next]?.scrollIntoView?.({block:'nearest'});}
  }}>{items.map((item,i)=><Fragment key={item.id}>{item.group&&item.group!==items[i-1]?.group?<>{i>0?<div role="separator" className={styles.separator}/>:null}<p className={styles.group} role="presentation">{item.group}</p></>:null}<div role="none">{item.href?<a role="menuitem" className={styles.item} href={item.href} onClick={()=>{item.onSelect?.();onClose(false);}}>{item.label}{item.description?<small title={item.description}>{item.description}</small>:null}</a>:<button role="menuitem" type="button" className={styles.item} onClick={item.onSelect}>{item.label}{item.description?<small title={item.description}>{item.description}</small>:null}</button>}</div></Fragment>)}</div>,document.querySelector('main')??document.body);
}
