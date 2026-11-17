import type { Metadata } from 'next';
import { atlasTitle, metaDescription, pageMetadata } from '../../lib/page-meta';
import { loadSearchWorkspace, type SearchParams } from './search-data';
import { SearchWorkspace } from './SearchWorkspace';

type SearchPageProps = { searchParams: Promise<SearchParams> };

export async function generateMetadata(props: SearchPageProps): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim() ?? '';
  const title = query ? atlasTitle('Search', query) : atlasTitle('Search');
  return pageMetadata({
    title,
    description: metaDescription(
      query
        ? `Search results for “${query}” across published constitutions.`
        : 'Search published constitutional articles.',
    ),
    path: '/search',
  });
}

export default async function SearchPage(props: SearchPageProps) {
  return <SearchWorkspace data={await loadSearchWorkspace(await props.searchParams)} />;
}
