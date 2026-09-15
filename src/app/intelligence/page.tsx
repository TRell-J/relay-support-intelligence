import { Suspense } from 'react';
import { ProductIntelligence } from '@/components/intelligence/ProductIntelligence';

/**
 * The workspace reads `?tab=` so escalation can hand off straight into the
 * backlog. `useSearchParams` opts a client component out of static prerendering
 * unless it sits behind a Suspense boundary, so it gets one.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProductIntelligence />
    </Suspense>
  );
}
