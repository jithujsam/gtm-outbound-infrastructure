import Link from 'next/link';
import clsx from 'clsx';
import LocalTime from '@/components/ui/LocalTime';
import { companyLabel, prospectLabel, type ThreadSummary } from '@/lib/analytics/replies';
import InterestChip from './InterestChip';

/** Compact conversation rows: who, company, status, subject, their latest words, when, campaign. */
export default function ConversationList({
  threads,
  selectedId,
  hrefFor,
  showCampaign = true,
}: {
  threads: ThreadSummary[];
  selectedId?: string | null;
  hrefFor: (id: string) => string;
  showCampaign?: boolean;
}) {
  return (
    <ul className="divide-y divide-outline-variant/40" aria-label="Conversations">
      {threads.map((t) => {
        const company = companyLabel(t);
        const active = t.id === selectedId;
        return (
          <li key={t.id}>
            <Link
              href={hrefFor(t.id)}
              scroll={false}
              aria-current={active ? 'true' : undefined}
              className={clsx(
                'block border-l-2 px-4 py-3 transition-colors',
                active ? 'border-l-primary bg-primary-fixed/15' : 'border-l-transparent hover:bg-surface-container-low'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{prospectLabel(t)}</p>
                  {company && <p className="truncate text-xs text-on-surface-variant">{company}</p>}
                </div>
                <InterestChip interest={t.interest} />
              </div>
              {t.subject && <p className="mt-1.5 truncate text-[13px] text-on-surface">{t.subject.replace(/^(re|aw|sv|fw|fwd):\s*/i, '')}</p>}
              {t.snippet && <p className="mt-0.5 line-clamp-2 text-[13px] text-on-surface-variant">“{t.snippet}”</p>}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-on-surface-variant">
                <span>
                  {t.humanReplies} {t.humanReplies === 1 ? 'reply' : 'replies'}
                </span>
                {t.lastHumanReplyAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <LocalTime iso={t.lastHumanReplyAt} />
                  </>
                )}
                {showCampaign && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{t.campaignName}</span>
                  </>
                )}
                {t.autoReplies > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span title="Automatic responses are not counted as replies">
                      +{t.autoReplies} auto-repl{t.autoReplies === 1 ? 'y' : 'ies'}
                    </span>
                  </>
                )}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
