import { CaseDetail } from '@/components/agent/CaseDetail';
import type { CaseId } from '@/domain/types';

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetail caseId={caseId as CaseId} />;
}
