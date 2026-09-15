import { IssueDetail } from '@/components/engineering/IssueDetail';
import type { IssueId } from '@/domain/types';

export default async function Page({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  return <IssueDetail issueId={issueId as IssueId} />;
}
