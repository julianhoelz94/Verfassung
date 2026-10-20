import { redirect } from 'next/navigation';

export default async function ImportJobPage({ params, searchParams }: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { jobId } = await params;
  const { error } = await searchParams;
  redirect(`/editor?importJobId=${encodeURIComponent(jobId)}${error ? `&error=${encodeURIComponent(error)}` : ''}`);
}
