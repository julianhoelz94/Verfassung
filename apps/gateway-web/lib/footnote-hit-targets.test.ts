import {afterEach,expect,it,vi} from 'vitest';
import {updateFootnoteHitTargets} from './footnote-hit-targets';
afterEach(()=>{document.body.replaceChildren();vi.unstubAllGlobals();});
it('reserves room only for natural same-row marker clusters and remains stable on repeated measurement',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  document.body.innerHTML='<p><button data-footnote-marker>A</button>x<button data-footnote-marker>B</button> distant text <button data-footnote-marker>C</button></p>';
  const markers=[...document.querySelectorAll<HTMLElement>('[data-footnote-marker]')];
  markers.forEach((marker,index)=>{marker.getBoundingClientRect=()=>{expect(marker.hasAttribute('data-dense')).toBe(false);return new DOMRect([0,20,200][index],0,12,14);};});
  updateFootnoteHitTargets();expect(markers.map(marker=>marker.dataset.dense)).toEqual(['true','true',undefined]);
  updateFootnoteHitTargets();expect(markers.map(marker=>marker.dataset.dense)).toEqual(['true','true',undefined]);
  vi.stubGlobal('matchMedia',()=>({matches:false}));updateFootnoteHitTargets();expect(markers.some(marker=>marker.hasAttribute('data-dense'))).toBe(false);
});
it('ignores hidden markers and markers on separate lines',()=>{vi.stubGlobal('matchMedia',()=>({matches:true}));document.body.innerHTML='<button data-footnote-marker>A</button><button data-footnote-marker>B</button><button data-footnote-marker hidden>C</button>';const markers=[...document.querySelectorAll<HTMLElement>('[data-footnote-marker]')];markers[0].getBoundingClientRect=()=>new DOMRect(0,0,12,14);markers[1].getBoundingClientRect=()=>new DOMRect(0,32,12,14);markers[2].getBoundingClientRect=()=>new DOMRect();updateFootnoteHitTargets();expect(markers.some(marker=>marker.hasAttribute('data-dense'))).toBe(false);});
