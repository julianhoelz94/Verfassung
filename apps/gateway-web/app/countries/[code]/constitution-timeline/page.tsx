import { redirect } from 'next/navigation';
import { historyQueryValue } from '../../../../lib/history';

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ on?: string | string[]; events?: string | string[] }> };

/** Existing constitution-history links resolve to the combined country timeline. */
export default async function ConstitutionTimelineRedirect({ params, searchParams }: Props) {
  const { code } = await params;
  const queryValues = await searchParams;
  const on = historyQueryValue(queryValues.on);
  const events = historyQueryValue(queryValues.events);
  const query = new URLSearchParams();
  if (on) query.set('on', on);
  if (events) query.set('events', events);
  redirect(`/countries/${encodeURIComponent(code)}/timeline${query.size ? `?${query}` : ''}`);
}
