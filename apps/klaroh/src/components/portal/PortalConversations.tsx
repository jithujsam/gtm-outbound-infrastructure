// The client's "Conversations with interested prospects": who is showing
// genuine interest, in their own words. Only positive conversations (the same
// lead statuses as the positive metric) with a human reply; never a count that
// competes with the headline figures. Server component.

import Link from 'next/link';
import { ArrowRight, MessagesSquare } from 'lucide-react';
import LocalTime from '@/components/ui/LocalTime';
import InterestChip from '@/components/inbox/InterestChip';
import { companyLabel, EMPTY_TEXT, prospectLabel } from '@/lib/analytics/replies';
import type { PortalConversation, PortalConversations as Data } from '@/lib/data/portal';

const VISIBLE = 8;

function Freshness({ d }: { d: Data }) {
  return (
    <p className="text-xs text-on-surface-variant">
      {d.lastSyncedAt ? (
        <>
          Replies synced{' '}
          <LocalTime iso={d.lastSyncedAt} format="dateTimeShort" />
        </>
      ) : (
        'Conversations haven’t been brought in yet'
      )}
      {d.lastSyncFailed && ' · the latest update didn’t complete, so newer replies may not be here yet'}
    </p>
  );
}

const who = (c: PortalConversation) => prospectLabel({ leadName: c.leadName, leadEmail: c.leadEmail });
const company = (c: PortalConversation) => companyLabel({ leadCompany: c.leadCompany, leadEmail: c.leadEmail });
const latest = (c: PortalConversation) => c.messages.at(-1)?.body?.replace(/\s+/g, ' ').trim() ?? null;

function Item({ c }: { c: PortalConversation }) {
  const quote = latest(c);
  const co = company(c);
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-col gap-1 px-4 py-3 hover:bg-surface-container-low md:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="text-sm font-semibold text-on-surface">{who(c)}</span>
              {co && <span className="text-sm text-on-surface-variant"> — {co}</span>}
            </span>
            <InterestChip interest={c.interest} audience="client" />
          </span>
          {quote && <span className="line-clamp-2 text-sm text-on-surface">“{quote}”</span>}
          <span className="text-xs text-on-surface-variant">
            {c.replies} {c.replies === 1 ? 'reply' : 'replies'}
            {c.lastReplyAt && (
              <>
                {' · '}
                <LocalTime iso={c.lastReplyAt} />
              </>
            )}
            {' · '}
            {c.campaign}
            <span className="ml-2 text-primary group-open:hidden">Read the conversation</span>
            <span className="ml-2 hidden text-primary group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="details-body space-y-3 border-t border-outline-variant/40 bg-surface-container-low/50 px-4 py-4 md:px-5">
          <p className="text-xs text-on-surface-variant">
            {[c.leadEmail, c.subject ? `Subject: ${c.subject}` : null].filter(Boolean).join(' · ')}
          </p>
          {c.messages.map((m, i) => (
            <div key={i} className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/40 px-4 py-2">
                <span className="text-sm font-medium text-on-surface">{m.fromName || who(c)}</span>
                <LocalTime iso={m.sentAt} format="dateTime" className="text-xs text-on-surface-variant" />
              </div>
              <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-on-surface">{m.body?.trim() || '(No text)'}</p>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

/** Detailed report section. */
export function ConversationsSection({ data }: { data: Data }) {
  const list = data.conversations;
  return (
    <section id="conversations" aria-label="Conversations with interested prospects" className="scroll-mt-4 rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/40 px-4 py-3 md:px-5">
        <div>
          <h2 className="type-section text-on-surface">Conversations with interested prospects</h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">Prospects who replied and are marked as interested or further along, in their own words</p>
        </div>
        <Freshness d={data} />
      </header>
      {list.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
            <MessagesSquare size={18} aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-on-surface">{data.everSynced ? EMPTY_TEXT.no_positive.title : 'Conversations will appear here'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-on-surface-variant">
            {data.everSynced ? EMPTY_TEXT.no_positive.body : 'Replies from interested prospects will be shown here once they have been brought in.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-outline-variant/40">
            {list.slice(0, VISIBLE).map((c) => (
              <Item key={c.key} c={c} />
            ))}
          </ul>
          {list.length > VISIBLE && (
            <details className="border-t border-outline-variant/40">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-primary md:px-5 [&::-webkit-details-marker]:hidden">
                Show {list.length - VISIBLE} more
              </summary>
              <ul className="divide-y divide-outline-variant/40 border-t border-outline-variant/40">
                {list.slice(VISIBLE).map((c) => (
                  <Item key={c.key} c={c} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** "At a glance": the three most recent interested prospects. */
export function ConversationsGlance({ data, href }: { data: Data; href: string }) {
  const top = data.conversations.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <section aria-label="Interested prospects" className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/40 px-5 py-3 md:px-6">
        <h2 className="type-section text-on-surface">Prospects showing genuine interest</h2>
        <Freshness d={data} />
      </header>
      <ul className="divide-y divide-outline-variant/40">
        {top.map((c) => {
          const co = company(c);
          const quote = latest(c);
          return (
            <li key={c.key} className="px-5 py-3 md:px-6">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-on-surface">{who(c)}</span>
                {co && <span className="text-sm text-on-surface-variant">— {co}</span>}
                <InterestChip interest={c.interest} audience="client" />
              </p>
              {quote && <p className="mt-0.5 line-clamp-2 text-sm text-on-surface-variant">“{quote}”</p>}
            </li>
          );
        })}
      </ul>
      <Link href={href} className="flex items-center gap-1.5 border-t border-outline-variant/40 px-5 py-3 text-sm font-medium text-primary hover:underline md:px-6">
        Read the conversations <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
