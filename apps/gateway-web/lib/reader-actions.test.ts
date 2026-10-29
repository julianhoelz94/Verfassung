import { expect,it } from 'vitest';
import { passageChoices,readerActionIndex,originalEntriesText } from './reader-actions';
import { continuousReaderOutline,continuousReaderUnits } from '../e2e/fixtures/continuous-reader.mjs';
const id='01900000-0000-4000-8000-000000000004',articles=continuousReaderUnits(id);
const index=readerActionIndex(articles,'/countries/DE/versions/'+id,'Constitution',continuousReaderOutline);
it('offers only the clicked unit and its actual ancestors, with snapshot-pinned links',()=>{
 const root=document.createElement('div'),paragraph=articles[0].content[0].node,sentence=paragraph.content[0].node;
 root.innerHTML=`<section id="${paragraph.occurrenceId}"><span id="${sentence.occurrenceId}"><strong>Every</strong></span></section>`;
 const choices=passageChoices(index,root.querySelector('strong'));expect(choices.map(p=>p.kind)).toEqual(['sentence','paragraph','article','constitution']);
 expect(choices[0].href).toBe('/countries/DE/versions/'+id+'#'+sentence.occurrenceId);
 expect(passageChoices(index,root.querySelector('section')).map(p=>p.kind)).toEqual(['paragraph','article','constitution']);
 expect(passageChoices(index,null)).toEqual([index.constitution]);
});
it('copies the original words, labels, authored breaks, table cells and literal footnotes without UI',()=>{
 const text=index.constitution.text;expect(text).toContain('Article 20');expect(text).toContain('The legislature meets in public.\nThe executive remains accountable.');
 expect(text).toContain('Public body\tAccountability');expect(text).toContain('* A constitution-wide source note.');expect(text).not.toContain('Permalink');
 expect(index.passages.get(articles[0].content[0].node.content[0].node.occurrenceId)?.text).toBe('Every person has equal rights.');
 expect(originalEntriesText([{type:'text',text:'A'},{type:'text',text:'B',lineBreaksBefore:3}])).toBe('A\n\n\nB');
});
it('does not split unstructured paragraphs into invented sentence links',()=>{
 const source=[{...articles[0],content:[{type:'text' as const,occurrenceId:'first',text:'One. '},{type:'text' as const,occurrenceId:'second',text:'Two.'}]}];
 const plain=readerActionIndex(source,'/v','Constitution',continuousReaderOutline);const node=document.createElement('span');node.id='second';
 expect(passageChoices(plain,node).map(p=>p.kind)).toEqual(['paragraph','article','constitution']);expect(passageChoices(plain,node)[0].text).toBe('One. Two.');expect(passageChoices(plain,node)[0].href).toBe('/v#first');
});
it('indexes human-readable locations for each reference to a shared note',()=>{
 const labels=[...index.references.values()];expect(labels).toHaveLength(2);expect(labels[0]).toContain('Article 1');expect(labels[1]).toContain('Article 20');
});
it('keeps legacy unit identifiers and text available to the same menu',()=>{
 const legacy=readerActionIndex([{...articles[0],content:undefined,children:[{id:'legacy',kind:'paragraph',label:'(a)',number:null,title:null,body:'Exact body.',children:[]}]}],'/v','C',continuousReaderOutline);
 const node=document.createElement('p');node.id='legacy';expect(passageChoices(legacy,node).map(p=>p.kind)).toEqual(['paragraph','article','constitution']);expect(passageChoices(legacy,node)[0].text).toContain('Exact body.');
});

it('copies stored zero-width note labels and separates endnotes once from article bodies',()=>{
 const source=[{...articles[0],content:[{type:'text' as const,occurrenceId:'body',text:'Legal text.',references:[{logicalId:'mark',start:11,end:11,target:{type:'footnote' as const,footnoteId:'note'}}]},
  {type:'text' as const,format:'footnote' as const,logicalId:'note',occurrenceId:'note-occ',footnoteLabel:'†',text:'Source one.'},
  {type:'text' as const,format:'footnote' as const,logicalId:'other',occurrenceId:'other-occ',footnoteLabel:'12',text:'Source two.'}]}];
 const actions=readerActionIndex(source,'/v','Constitution',continuousReaderOutline);
 expect(actions.passages.get(source[0].id)?.text).toContain('Legal text.†');expect(actions.passages.get(source[0].id)?.text).not.toContain('Source one.');
 expect(actions.constitution.text).toContain('† Source one.\n12 Source two.');expect(actions.constitution.text.match(/Source one/g)).toHaveLength(1);
 expect(originalEntriesText([{type:'text',text:'Text12',references:[{logicalId:'mark',start:4,end:6,target:{type:'footnote',footnoteId:'other'}}]}],undefined,new Map([['other','12']]))).toBe('Text12');
});
