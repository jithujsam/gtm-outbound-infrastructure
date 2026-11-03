import Link from 'next/link';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import { MessagesSquare } from 'lucide-react';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { isUuid, loadInbox, loadThread } from '@/lib/data/inbox';
import { EMPTY_TEXT, emptyState, filterThreads, INBOX_FILTERS, parseInboxFilter, type InboxFilter } from '@/lib/analytics/replies';
import { PageContainer } from '@/components/ui/PageContainer';
import ConversationList from '@/components/inbox/ConversationList';
import ConversationDetail from '@/components/inbox/ConversationDetail';
import ReplySyncBar from '@/components/inbox/ReplySyncBar';
import { PageHeader } from '@/components/analytics/ui';
import ClientFilter from '@/components/inbox/ClientFilter';

interface Props {
  searchParams: Promise<{ filter?: string; client?: string; thread?: string }>;
}

/**
 * The agency's Inbox: conversations prospects started with client campaigns.
 * Positive (the leads the positive metric counts) or every human reply;
 * automatic replies are never listed as conversations. Read-only.
 */
export default async function InboxPage({ searchParams }: Props) {
  const session = await getSessionWorkspace();
  if (!session) redirect('/auth/login');
  const sp = await searchParams;
  const filter = parseInboxFilter(sp.filter);
  const clientId = isUuid(sp.client) ? sp.client : null;

  const [inbox, detail] = await Promise.all([
    loadInbox(session.supabase, session.workspaceId, clientId),
    sp.thread ? loadThread(session.supabase, session.workspaceId, sp.thread) : Promise.resolve(null),
  ]);
  const shown = filterThreads(inbox.threads, filter);
  // desktop opens the newest conversation of the view; small screens start on the list
  const preview = !detail && shown[0] ? await loadThread(session.supabase, session.workspaceId, shown[0].id) : null;
  const empty = emptyState(inbox.threads, shown, filter, inbox.sync);
  const counts: Record<InboxFilter, number> = {
    positive: filterThreads(inbox.threads, 'positive').length,
    human: filterThreads(inbox.threads, 'human').length,
  };

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { filter: filter === 'positive' ? null : filter, client: clientId, thread: detail?.thread.id ?? null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/inbox?${s}` : '/inbox';
  };
  const selected = detail ?? null;
  const open = selected ?? preview;

  return (
    <PageContainer>
      <PageHeader title="Inbox" subtitle="Replies from prospects to your clients’ campaigns. Automatic replies are left out.">
        <ReplySyncBar sync={inbox.sync} canSync />
      </PageHeader>

      <div
        className={clsx(
          'grid grid-cols-1 overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest',
          inbox.threads.length > 0 && 'min-h-[60vh] lg:grid-cols-[380px_1fr]'
        )}
      >
        {/* list (hidden on small screens while a conversation is open) */}
        <section className={clsx('min-w-0 border-outline-variant/40', inbox.threads.length > 0 && 'lg:border-r', selected && 'hidden lg:block')} aria-label="Conversation list">
          <div className="flex flex-col gap-2 border-b border-outline-variant/40 px-4 py-3">
            <nav aria-label="Show" className="flex flex-wrap gap-1.5">
              {INBOX_FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={qs({ filter: f.key === 'positive' ? null : f.key, thread: null })}
                  aria-current={f.key === filter ? 'page' : undefined}
                  className={clsx(
                    'inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs transition-colors',
                    f.key === filter
                      ? 'border-primary/40 bg-primary-fixed/30 font-medium text-on-surface'
                      : 'border-outline-variant/60 text-on-surface-variant hover:text-on-surface'
                  )}
                >
                  {f.label} <span className="tabular-nums text-on-surface-variant">{counts[f.key]}</span>
                </Link>
              ))}
            </nav>
            {inbox.clients.length > 1 && (
              <ClientFilter
                clients={inbox.clients}
                value={clientId}
                hrefFor={Object.fromEntries([['', qs({ client: null, thread: null })], ...inbox.clients.map((c) => [c.id, qs({ client: c.id, thread: null })])])}
              />
            )}
          </div>
          {empty ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
                <MessagesSquare size={18} aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-on-surface">{EMPTY_TEXT[empty].title}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-on-surface-variant">{EMPTY_TEXT[empty].body}</p>
              {empty === 'no_positive' && counts.human > 0 && (
                <Link href={qs({ filter: 'human', thread: null })} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                  See all {counts.human} human {counts.human === 1 ? 'reply' : 'replies'}
                </Link>
              )}
            </div>
          ) : (
            <ConversationList threads={shown} selectedId={open?.thread.id} hrefFor={(id) => qs({ thread: id })} />
          )}
          {inbox.threads.length > 0 && (
            <p className="border-t border-outline-variant/40 px-4 py-2 text-xs text-on-surface-variant">
              Conversations, not a count of results: headline replies and positive responses are on Overview.
            </p>
          )}
        </section>

        {/* detail (only once there is something to read) */}
        {inbox.threads.length > 0 && (
        <section className={clsx('min-w-0', !selected && 'hidden lg:flex')} aria-label="Conversation">
          {open ? (
            <ConversationDetail detail={open} backHref={qs({ thread: null })} />
          ) : (
            <div className="flex w-full items-center justify-center px-6 py-14 text-center text-sm text-on-surface-variant">Choose a conversation to read it.</div>
          )}
        </section>
        )}
      </div>
    </PageContainer>
  );
}
