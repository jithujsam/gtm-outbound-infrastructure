import { StatusChip } from '@/components/ui/StatusChip';
import { CLIENT_INTEREST_LABEL, INTEREST_LABEL, interestTone } from '@/lib/analytics/replies';
import type { LeadInterest } from '@/lib/providers/types';

/** The lead's status as marked in the sending platform; nothing when none is set. */
export default function InterestChip({ interest, audience = 'agency' }: { interest: LeadInterest | null; audience?: 'agency' | 'client' }) {
  if (!interest) return null;
  const label = audience === 'client' ? CLIENT_INTEREST_LABEL[interest] : INTEREST_LABEL[interest];
  if (!label) return null;
  return (
    <StatusChip tone={interestTone(interest)} icon={false}>
      {label}
    </StatusChip>
  );
}
