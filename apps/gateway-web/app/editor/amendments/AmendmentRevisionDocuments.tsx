'use client';

import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';

import { useEffect, useState } from 'react';
import type { DocumentLink } from '../../../lib/document-api';
import { useTranslation } from '../../components/TranslationProvider';
import { DocumentManagerTemplate } from '../documents/DocumentManagerTemplate';

export function AmendmentRevisionDocuments({amendmentId,revisionId}:{amendmentId:string;revisionId:string}) {
  const [state,setState]=useState<{revision?:string;links:DocumentLink[];error?:string}>({links:[]}),t=useTranslation();
  useEffect(()=>{
    const controller=new AbortController();
    const query=new URLSearchParams({targetType:'amendment',targetId:amendmentId,scopeRevisionId:revisionId});
    void fetchWithTimeout('/editor/documents/command?'+query,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();setState({revision:revisionId,links:data.links});}).catch(()=>{if(!controller.signal.aborted)setState({revision:revisionId,links:[],error:t({en:'Documents for this revision could not be loaded.',de:'Die Dokumente dieser Revision konnten nicht geladen werden.'})});});
    return ()=>controller.abort();
    // The request is tied to the selected immutable revision, not presentation rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[amendmentId,revisionId]);
  return state.revision!==revisionId?<p role="status">{t({en:'Loading revision documents…',de:'Revisionsdokumente werden geladen…'})}</p>:<DocumentManagerTemplate links={state.links} documents={[]} revisions={{}} canEdit={false} pending={false} error={state.error} onCreate={async()=>false} onAttach={async()=>false} onDetach={async()=>false}/>;
}
