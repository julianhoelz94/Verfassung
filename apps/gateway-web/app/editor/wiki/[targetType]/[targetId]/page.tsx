import { WikiWorkspace, type WikiQuery } from '../../WikiWorkspace';

export default async function WikiEditor({ params, searchParams }: {
  params: Promise<{ targetType: string; targetId: string }>;
  searchParams: Promise<WikiQuery>;
}) {
  const { targetType, targetId } = await params;
  return <WikiWorkspace targetType={targetType} targetId={targetId} query={await searchParams} />;
}
