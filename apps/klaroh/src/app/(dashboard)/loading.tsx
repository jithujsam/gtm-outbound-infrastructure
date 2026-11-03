import { GenericSkeleton } from '@/components/ui/PageSkeletons';

/** Fallback for dashboard routes without a more specific loading state. */
export default function Loading() {
  return <GenericSkeleton />;
}
