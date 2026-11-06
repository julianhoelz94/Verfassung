import { redirect } from 'next/navigation';
import { documentLibraryLocation } from './legacy-document-location';

export default async function DocumentsPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  redirect(documentLibraryLocation(await props.searchParams));
}
