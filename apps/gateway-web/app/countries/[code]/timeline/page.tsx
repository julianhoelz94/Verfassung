import type { Metadata } from 'next';
import { getCountry } from '../../../../lib/api';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../lib/page-meta';
import { renderCountryHistory } from './CountryHistoryContent';

type TimelinePageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ on?: string; events?: string }>;
};

export async function generateMetadata(props: TimelinePageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const country = await getCountry(params.code);
    if (!country) {
      return { title: atlasTitle('History') };
    }
    return pageMetadata({
      title: atlasTitle('History', country.name),
      description: metaDescription(`Constitutional history and amendments of ${country.name}.`),
      path: `/countries/${country.isoCode}/timeline`,
    });
  } catch {
    return { title: atlasTitle('History') };
  }
}

export default async function TimelinePage({ params, searchParams }: TimelinePageProps) {
  const { code } = await params;
  const { on, events } = await searchParams;
  return renderCountryHistory(code, on, events);
}
