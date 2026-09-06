import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Button, Card, Input, TextArea } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { requireAdminPage } from '../../../lib/admin';
import { createImportAction } from './actions';

type AdminImportPageProps = {
  searchParams: { error?: string };
};

export default async function AdminImportPage({ searchParams }: AdminImportPageProps) {
  if (!(await requireAdminPage())) {
    return <AdminForbidden title="Import" />;
  }
  return (
    <PageMain>
      <h1>Import a constitution</h1>
      <p className="lede">
        Paste or upload import JSON. The payload must include country, constitution, version, and at least one article.
        Nested <code>nodes</code> and an <code>outline</code> are optional. The US fixture used in tests is a valid
        example.
      </p>
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error">Administrator role required.</Alert>
      ) : searchParams.error === 'json' ? (
        <Alert tone="error">That file is not valid JSON.</Alert>
      ) : searchParams.error === 'invalid' ? (
        <Alert tone="error">The JSON is missing required import fields.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">The import could not be started.</Alert>
      ) : null}
      <Card>
        <form action={createImportAction}>
          <TextArea label="Import JSON" id="payload" name="payload" rows={16} spellCheck={false} />
          <Input label="JSON file" id="file" name="file" type="file" accept="application/json,.json" />
          <Button variant="primary">Start import</Button>
        </form>
      </Card>
    </PageMain>
  );
}
