import Link from 'next/link';
import { ArrowLeft, Bot } from 'lucide-react';
import LocalTime from '@/components/ui/LocalTime';
import { companyLabel, isPositiveInterest, prospectLabel } from '@/lib/analytics/replies';
import type { ThreadDetail } from '@/lib/data/inbox';
import InterestChip from './InterestChip';

/**
 * One conversation: who, company, address, campaign, status, subject and the
 * prospect's messages (oldest first). Read-only — replies are sent from the
 * sending platform.
 */
export default function ConversationDetail({ detail, backHref }: { detail: ThreadDetail; backHref: string }) {
  const { thread: t, messages } = detail;
  const company = companyLabel(t);
  return (
    <article className="flex min-w-0 flex-col" aria-label={`Conversation with ${prospectLabel(t)}`}>
      <header className="border-b border-outline-variant/40 px-4 py-4 md:px-6">
        <Link href={backHref} scroll={false} className="mb-3 inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface lg:hidden">
          <ArrowLeft size={14} aria-hidden="true" /> All conversations
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-on-surface">{prospectLabel(t)}</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              {[company, t.leadEmail && t.leadEmail !== prospectLabel(t) ? t.leadEmail : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <InterestChip interest={t.interest} />
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs md:gap-x-6">
          <dt className="text-on-surface-variant">Campaign</dt>
          <dd className="text-on-surface">{t.campaignName}</dd>
          {t.subject && (
            <>
              <dt className="text-on-surface-variant">Subject</dt>
              <dd className="break-words text-on-surface">{t.subject}</dd>
            </>
          )}
          <dt className="text-on-surface-variant">Status</dt>
          <dd className="text-on-surface">
            {isPositiveInterest(t.interest)
              ? 'Positive — counted in positive responses'
              : t.interest
                ? 'Replied — not marked positive'
                : 'Replied — no status set yet'}
          </dd>
        </dl>
      </header>

      <ol className="space-y-3 px-4 py-4 md:px-6">
        {messages.map((m) =>
          m.isAutoReply ? (
            <li key={m.id} className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
              <Bot size={14} aria-hidden="true" />
              <span>Automatic reply</span>
              <span aria-hidden="true">·</span>
              <LocalTime iso={m.sentAt} format="dateTime" />
              {m.subject && <span className="truncate">· {m.subject}</span>}
            </li>
          ) : (
            <li key={m.id} className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/40 px-4 py-2">
                <span className="text-sm font-medium text-on-surface">{m.fromName || prospectLabel(t)}</span>
                <LocalTime iso={m.sentAt} format="dateTime" className="text-xs text-on-surface-variant" />
              </div>
              <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-on-surface">
                {m.body?.trim() || <span className="text-on-surface-variant">(No text)</span>}
              </p>
            </li>
          )
        )}
      </ol>
      <p className="mt-auto border-t border-outline-variant/40 px-4 py-3 text-xs text-on-surface-variant md:px-6">
        Klaroh shows the prospect’s replies; answer them from your sending platform (Instantly).
      </p>
    </article>
  );
}
