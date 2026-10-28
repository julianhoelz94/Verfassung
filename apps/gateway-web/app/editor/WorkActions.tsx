import { workflowUi } from '../../lib/workflow-messages';
import { T } from '../components/TranslationProvider';
import { Button } from '../components/ui';
import { Disclosure } from '../components/Disclosure';
import { NavigatingActionForm } from '../components/NavigatingActionForm';
import { manageWorkAction } from './work-actions';

export function WorkActions({ id, kind, status, archived, workStatus }: {
  id: string; kind: 'session' | 'import'; status: string; archived: boolean; workStatus: string;
}) {
  const fields = <>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="workStatus" value={workStatus} />
    <input type="hidden" name="archived" value={String(archived)} />
  </>;
  if (kind === 'session' && status === 'open') return <Disclosure summary={<T value={workflowUi.deleteDraft} />}>
    <NavigatingActionForm action={manageWorkAction}>
      {fields}<input type="hidden" name="action" value="discard" />
      <p><T value={workflowUi.deleteDraftHint} /></p>
      <Button size="sm"><T value={workflowUi.confirmDelete} /></Button>
    </NavigatingActionForm>
  </Disclosure>;
  if (!(kind === 'session' ? status === 'published' : ['completed', 'rejected', 'failed'].includes(status))) return null;
  return <NavigatingActionForm action={manageWorkAction}>
    {fields}<input type="hidden" name="action" value={archived ? 'restore' : 'archive'} />
    <Button size="sm"><T value={archived ? workflowUi.restore : workflowUi.archive} /></Button>
  </NavigatingActionForm>;
}
