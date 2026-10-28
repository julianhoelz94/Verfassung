/** Reserve inline room only where compact markers would share a coarse target. */
export function updateFootnoteHitTargets(root:ParentNode=document):void {
  const markers=Array.from(root.querySelectorAll<HTMLElement>('[data-footnote-marker]'));
  // Measure natural positions on every pass, before adding any reserved width.
  // This keeps clustering stable across rerenders and responsive line wrapping.
  markers.forEach(marker=>marker.removeAttribute('data-dense'));
  if(!window.matchMedia?.('(pointer: coarse)').matches)return;
  const visible=markers.map(marker=>({marker,rect:marker.getBoundingClientRect()})).filter(({rect})=>rect.width>0&&rect.height>0);
  for(let index=1;index<visible.length;index++){
    const previous=visible[index-1],current=visible[index],a=previous.rect,b=current.rect;
    const sameLine=Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<Math.max(a.height,b.height)/2;
    if(sameLine&&Math.abs((a.left+a.right)/2-(b.left+b.right)/2)<44){previous.marker.dataset.dense='true';current.marker.dataset.dense='true';}
  }
}
