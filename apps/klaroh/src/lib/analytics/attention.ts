// "What needs attention?" for the Overview: a short, prioritised list built
// only from states Instantly reports. Pure. No thresholds on metrics Klaroh
// cannot verify (bounce rate) and nothing that needs a date range.
//
// Rules (each states what it checked, so "all clear" never over-claims):
//   1. campaign in error / suspended at the provider           → critical
//   2. mailboxes with issues (sending error / warmup / DNS …)  → critical if any
//      is in a sending error, otherwise warning
//   3. campaign no longer returned by the provider             → warning

import type { CampaignStatus } from '../types.ts';
import type { InfraSummary } from './infrastructure.ts';

export type AttentionTone = 'critical' | 'warning';

export interface AttentionItem {
  key: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  href: string;
}

export interface AttentionCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  unavailableSince: string | null;
}

export const ATTENTION_LIMIT = 5;

const TONE_RANK: Record<AttentionTone, number> = { critical: 0, warning: 1 };

export function attentionItems(input: { campaigns: AttentionCampaign[]; infra: InfraSummary | null; query?: string }): { items: AttentionItem[]; total: number } {
  const q = input.query ? `?${input.query}` : '';
  const campaignHref = (id: string) => `/campaigns/${id}${q}`;
  const found: (AttentionItem & { order: number })[] = [];

  for (const c of input.campaigns) {
    if (c.status === 'error' || c.status === 'suspended') {
      found.push({
        key: `status:${c.id}`,
        tone: 'critical',
        title: c.name,
        detail: c.status === 'suspended' ? 'Suspended by the provider' : 'The provider reports an error',
        href: campaignHref(c.id),
        order: 0,
      });
    } else if (c.unavailableSince) {
      found.push({
        key: `gone:${c.id}`,
        tone: 'warning',
        title: c.name,
        detail: 'No longer returned by the provider — figures are from the last sync',
        href: campaignHref(c.id),
        order: 3,
      });
    }
  }

  const infra = input.infra;
  if (infra && infra.issues > 0) {
    found.push({
      key: 'mailboxes',
      tone: infra.errors > 0 ? 'critical' : 'warning',
      title: `${infra.issues} of ${infra.total} mailbox${infra.total === 1 ? '' : 'es'} ${infra.issues === 1 ? 'has' : 'have'} issues`,
      detail: infra.errors > 0 ? `${infra.errors} in a sending error — see Infrastructure` : 'Warmup, DNS or sending — see Infrastructure',
      href: `/infrastructure${q}`,
      order: 1,
    });
  }

  found.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.order - b.order || a.title.localeCompare(b.title));
  return { items: found.slice(0, ATTENTION_LIMIT).map((f) => ({ key: f.key, tone: f.tone, title: f.title, detail: f.detail, href: f.href })), total: found.length };
}
