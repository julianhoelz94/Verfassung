import { redirect } from 'next/navigation';

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ on?: string; events?: string }> };

/** Existing constitution-history links resolve to the combined country timeline. */
export default async function ConstitutionTimelineRedirect({ params, searchParams }: Props) {
  const { code } = await params;
  const { on, events } = await searchParams;
  const query = new URLSearchParams();
  if (on) query.set('on', on);
  if (events) query.set('events', events);
  redirect(`/countries/${encodeURIComponent(code)}/timeline${query.size ? `?${query}` : ''}`);
}
