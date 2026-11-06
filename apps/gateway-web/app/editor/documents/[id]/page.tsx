import { redirect } from 'next/navigation';
import { documentLibraryLocation } from '../legacy-document-location';

export default async function DocumentDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, params] = await Promise.all([props.params, props.searchParams]);
  redirect(documentLibraryLocation(params, { documentId: id }));
}
