import type { Metadata } from 'next';
import { getCountry, getVersion } from '../../../../../lib/api';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../../lib/page-meta';
import { publicSnapshotContext } from '../../../../../lib/reading';
import { CountryConstitutionReader } from './CountryConstitutionReader';

type VersionPageProps = { params: Promise<{ code: string; versionId: string }>; searchParams: Promise<{ error?: string }> };

export async function generateMetadata(props: VersionPageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const [country, snapshot] = await Promise.all([getCountry(params.code), getVersion(params.versionId)]);
    const version = publicSnapshotContext(country, snapshot);
    if (!country || !version) return { title: atlasTitle('Version') };
    return pageMetadata({ title: atlasTitle(version.version.versionLabel, version.constitution.title, country.name),
      description: metaDescription(`Read ${version.constitution.title} version ${version.version.versionLabel} for ${country.name}.`),
      path: `/countries/${country.isoCode}/versions/${params.versionId}` });
  } catch { return { title: atlasTitle('Version') }; }
}

export default async function VersionPage(props: VersionPageProps) {
  const { code, versionId } = await props.params;
  const { error } = await props.searchParams;
  return CountryConstitutionReader({ code, versionId, error });
}
