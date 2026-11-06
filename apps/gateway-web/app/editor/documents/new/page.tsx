import { redirect } from 'next/navigation';
import { documentLibraryLocation } from '../legacy-document-location';

export default async function NewDocumentPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  redirect(documentLibraryLocation(await props.searchParams, { new: '1' }));
}
