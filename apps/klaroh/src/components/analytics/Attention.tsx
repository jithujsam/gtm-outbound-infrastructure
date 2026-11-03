import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ATTENTION_LIMIT, type AttentionItem } from '@/lib/analytics/attention';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';

/**
 * "What needs attention?" — the first thing on the Overview. Each row says what is
 * wrong and links to where to fix it. When there is nothing, it says what was checked.
 */
export function AttentionPanel({ items, total, mailboxesChecked, campaignsHref }: { items: AttentionItem[]; total: number; mailboxesChecked: boolean; campaignsHref: string }) {
  return (
    <Panel title="Needs attention" subtitle={total ? `${total} item${total === 1 ? '' : 's'}, most urgent first` : undefined} bodyClassName="overflow-hidden rounded-b-lg">
      {items.length === 0 ? (
        <div className="flex items-start gap-3 px-4 py-3 md:px-5">
          <StatusChip tone="good">All clear</StatusChip>
          <p className="text-sm text-on-surface-variant">
            No campaign is in an error state at the provider
            {mailboxesChecked ? ' and no mailbox has a sending, warmup or DNS issue' : ''}.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant/30">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container-low md:px-5">
                <StatusChip tone={i.tone}>{i.tone === 'critical' ? 'Critical' : 'Warning'}</StatusChip>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-on-surface group-hover:text-primary">{i.title}</span>
                  <span className="block truncate text-xs text-on-surface-variant">{i.detail}</span>
                </span>
                <ArrowRight size={14} className="text-on-surface-variant" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > ATTENTION_LIMIT && (
        <div className="border-t border-outline-variant/30 px-4 py-2 text-right md:px-5">
          <Link href={campaignsHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {total - ATTENTION_LIMIT} more — open Campaigns <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      )}
    </Panel>
  );
}
