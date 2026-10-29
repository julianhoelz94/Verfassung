import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import {act} from 'react';
import {fireEvent,getByRole,queryByRole,within} from '@testing-library/dom';
import { mount,click } from '../../test/dom';
import {ReaderActions,ReaderCopyButton,ReaderDocument} from './ReaderActions';
import {readerActionIndex} from '../../lib/reader-actions';
import {continuousReaderOutline,continuousReaderUnits} from '../../e2e/fixtures/continuous-reader.mjs';
const units=continuousReaderUnits('01900000-0000-4000-8000-000000000004'),paragraph=units[0].content[0].node,sentence=paragraph.content[0].node;
const index=readerActionIndex(units,'/countries/DE/versions/pinned','Constitution',continuousReaderOutline);
let view:Awaited<ReturnType<typeof mount>>;
beforeEach(()=>{vi.stubGlobal('scrollBy',vi.fn());Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});});
afterEach(async()=>{if(view)await view.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function show(){view=await mount(<ReaderActions index={index} currentId={units[0].id}><ReaderCopyButton className="tool" labelClassName="label"/><ReaderDocument><h1>Constitution</h1><section id={paragraph.occurrenceId} tabIndex={-1}><p id={sentence.occurrenceId} tabIndex={-1}><strong>Every person</strong></p></section><a href="/reference">Source</a></ReaderDocument></ReaderActions>);}
async function context(node:Element){await act(async()=>fireEvent.contextMenu(node,{clientX:99999,clientY:99999}));}
it('opens the exact scopes on right-click and copies a pinned absolute permalink',async()=>{
 await show();await context(view.host.querySelector('strong')!);const menu=getByRole(document.body,'menu');
 expect(within(menu).getAllByRole('menuitem')).toHaveLength(8);
 const link=within(menu).getAllByRole('menuitem',{name:/Sentence/})[0];await click(link);
 expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/countries/DE/versions/pinned#'+sentence.occurrenceId);
 expect(getByRole(document.body,'status').textContent).toBe('Permalink copied');
});
it('does not offer sentence actions for a paragraph and keeps original text independent of DOM translations',async()=>{
 await show();await context(view.host.querySelector('section')!);const menu=getByRole(document.body,'menu');expect(within(menu).queryByRole('menuitem',{name:/Sentence/})).toBeNull();
 const item=within(menu).getAllByRole('menuitem',{name:/Paragraph/})[1];await click(item);expect(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]).toContain('Every person has equal rights.');
});
it('supports Shift+F10, arrows, Escape and the toolbar without adding permalink icons',async()=>{
 await show();const target=view.host.querySelector<HTMLElement>('p')!;target.focus();await act(async()=>fireEvent.keyDown(target,{key:'F10',shiftKey:true}));
 const options=within(getByRole(document.body,'menu')).getAllByRole('menuitem');expect(document.activeElement).toBe(options[0]);
 await act(async()=>fireEvent.keyDown(options[0],{key:'ArrowDown'}));expect(document.activeElement).toBe(options[1]);
 await act(async()=>fireEvent.keyDown(options[1],{key:'Escape'}));expect(queryByRole(document.body,'menu')).toBeNull();expect(document.activeElement).toBe(target);
 await click(getByRole(view.host,'button',{name:'Copy text or permalink'}));expect(getByRole(document.body,'menu')).toBeTruthy();
});
it('preserves the native context menu on source links and dismisses an open menu outside',async()=>{
 await show();await context(view.host.querySelector('a')!);expect(queryByRole(document.body,'menu')).toBeNull();
 await context(view.host.querySelector('strong')!);await act(async()=>fireEvent.pointerDown(view.host.querySelector('h1')!));expect(queryByRole(document.body,'menu')).toBeNull();
});
it('provides a selectable field when clipboard access is unavailable instead of reporting a false success',async()=>{
 await show();vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));await context(view.host.querySelector('strong')!);
 await click(within(getByRole(document.body,'menu')).getAllByRole('menuitem',{name:/Sentence/})[1]);
 const dialog=getByRole(document.body,'dialog');expect(within(dialog).getByRole('textbox').textContent).toBe('Every person has equal rights.');expect(queryByRole(document.body,'status')).toBeNull();
 await click(within(dialog).getByRole('button',{name:'Close'}));expect(queryByRole(document.body,'dialog')).toBeNull();
});
