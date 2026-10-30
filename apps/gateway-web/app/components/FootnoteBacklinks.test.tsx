import {afterEach,expect,it} from 'vitest';
import {getByRole,queryByRole,within} from '@testing-library/dom';
import {mount,click} from '../../test/dom';
import {FootnoteBacklinks} from './FootnoteBacklinks';
import {FootnoteProvider,FootnoteMarker} from './Footnotes';
import {OrderedContentTree} from './ConstitutionText';
let view:Awaited<ReturnType<typeof mount>>;
afterEach(async()=>{if(view)await view.close();});
it('keeps exactly one direct return link for a single mark, including duplicate index entries',async()=>{
 view=await mount(<FootnoteBacklinks noteId="note" referenceIds={['one','one']} idPrefix="published-"/>);
 expect(getByRole(view.host,'link').getAttribute('href')).toBe('#published-ref-one');expect(queryByRole(view.host,'button')).toBeNull();
});
it('shows one chooser for multiple marks, with distinct locations and exact target links',async()=>{
 view=await mount(<FootnoteProvider notes={[{logicalId:'note',label:'†',text:'Literal note.',href:'#fn-note',references:[{id:'one',label:'Article 1 · Paragraph (1)'},{id:'two',label:'Article 20 · Paragraph (1)'}]}]}><FootnoteBacklinks noteId="note" referenceIds={['one','two']} idPrefix="published-"/></FootnoteProvider>);
 expect(view.host.querySelectorAll('a')).toHaveLength(1);await click(getByRole(view.host,'button',{name:/Back to references/}));
 const choices=within(getByRole(document.body,'menu',{name:'Choose a footnote reference'})).getAllByRole('menuitem');expect(choices).toHaveLength(2);expect(choices[0].textContent).toContain('Article 1');expect(choices[1].textContent).toContain('Article 20');expect(choices[1].getAttribute('href')).toBe('#published-ref-two');
 await click(choices[1]);expect(queryByRole(document.body,'menu')).toBeNull();
});
it.each(['†','12','*'])('preserves the stored %s label in markers, endnotes and the drawer',async label=>{
 const note={type:'text' as const,logicalId:'note',occurrenceId:'note-occ',format:'footnote' as const,footnoteLabel:label,text:'Literal note.'};
 view=await mount(<FootnoteProvider notes={[{logicalId:'note',label,text:note.text,href:'#fn-note-occ'}]}><FootnoteMarker noteId="note"/><OrderedContentTree entries={[note]}/></FootnoteProvider>);
 expect(getByRole(view.host,'button',{name:'Show footnote '+label}).textContent).toBe(label);expect(getByRole(view.host,'note').textContent).toContain(label+'Literal note.');
 await click(getByRole(view.host,'button',{name:'Show footnote '+label}));expect(getByRole(document.body,'dialog',{name:'Footnote '+label})).toBeTruthy();
});
