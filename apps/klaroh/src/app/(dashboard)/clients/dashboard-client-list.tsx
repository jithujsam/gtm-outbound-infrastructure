'use client';

import { useState, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Search, LayoutGrid, List, Plus, Pencil, Trash2, CirclePause } from 'lucide-react';
import CreateClientModal from '@/components/CreateClientModal';
import DeleteClientModal from '@/components/DeleteClientModal';
import EditClientModal from '@/components/EditClientModal';
import Toggle from '@/components/Toggle';
import { PageContainer } from '@/components/ui/PageContainer';
import { StatusChip } from '@/components/ui/StatusChip';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';
import { fmtCount } from '@/lib/analytics/format';
import type { Client, ClientStatus } from '@/lib/types';
import { domainHealthText, MANUAL_HELP, MANUAL_LABEL } from '@/lib/infra-signals';

interface DashboardClientListProps {
  clients: Client[];
}

type ViewType = 'grid' | 'list';
type StatusFilter = 'all' | 'live' | 'paused';

const VIEW_KEY = 'dashboard_view_type';

// The saved view lives in localStorage; useSyncExternalStore keeps the server render and the
// first client render identical (table), then switches to a saved "grid" without a mismatch.
const viewListeners = new Set<() => void>();
const subscribeView = (cb: () => void) => {
  viewListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    viewListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const readView = (): ViewType => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};
const writeView = (v: ViewType) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
  viewListeners.forEach((l) => l());
};

function formatAdded(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  if (day(d) === day(now)) return 'Today';
  if (day(d) === day(now) - 86400000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/**
 * The agency's own domain health entry, as plain text: it is typed in, not
 * measured, so it is not styled as a verified health status.
 */
function DomainHealth({ client }: { client: Client }) {
  const text = domainHealthText(client.domain_health_score, client.domain_health_status);
  if (!text) return <span className="text-on-surface-variant">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums text-on-surface" title={MANUAL_HELP}>
      {text}
    </span>
  );
}

/** Marks a column or field whose values are entered by hand, not synced. */
function ManualTag() {
  return (
    <span className="block text-xs font-normal text-on-surface-variant" title={MANUAL_HELP}>
      {MANUAL_LABEL}
    </span>
  );
}

export default function DashboardClientList({ clients: initialClients }: DashboardClientListProps) {
  const [clients, setClients] = useState(initialClients);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const viewType = useSyncExternalStore(subscribeView, readView, () => 'list' as ViewType);
  const [createClientModalOpen, setCreateClientModalOpen] = useState(false);
  const [editClientModal, setEditClientModal] = useState<{
    open: boolean;
    clientId: string | null;
    clientName: string | null;
    clientSlug?: string | null;
  }>({ open: false, clientId: null, clientName: null, clientSlug: null });
  const [deleteClientModal, setDeleteClientModal] = useState<{
    open: boolean;
    clientId: string | null;
    clientName: string | null;
  }>({ open: false, clientId: null, clientName: null });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleClientCreated = (newClient: Client) => {
    setClients((prev) => [newClient, ...prev]);
  };

  const handleDeleteClient = (clientId: string) => {
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    setDeleteClientModal({ open: false, clientId: null, clientName: null });
  };

  const handleClientUpdated = (clientId: string, newName: string, newSlug?: string) => {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, name: newName, ...(newSlug !== undefined ? { slug: newSlug } : {}) } : c))
    );
    setEditClientModal({ open: false, clientId: null, clientName: null, clientSlug: null });
  };

  const handleToggleStatus = async (clientId: string, currentStatus: string) => {
    const newStatus: ClientStatus = currentStatus === 'active' ? 'paused' : 'active';
    const set = (status: ClientStatus) => setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, status } : c)));
    set(newStatus); // optimistic
    try {
      const response = await fetch('/api/update-client-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, status: newStatus }),
      });
      if (!response.ok) {
        set(currentStatus as ClientStatus);
        showToast('Failed to update status. Please try again.');
      }
    } catch {
      set(currentStatus as ClientStatus);
      showToast('Failed to update status. Please try again.');
    }
  };

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesSearch = !q || client.name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'live' && client.status === 'active') || (statusFilter === 'paused' && client.status !== 'active');
      return matchesSearch && matchesStatus;
    });
  }, [clients, searchTerm, statusFilter]);

  const filtering = searchTerm.trim() !== '' || statusFilter !== 'all';

  const edit = (c: Client) => setEditClientModal({ open: true, clientId: c.id, clientName: c.name, clientSlug: c.slug });
  const remove = (c: Client) => setDeleteClientModal({ open: true, clientId: c.id, clientName: c.name });

  const StatusToggle = ({ client }: { client: Client }) => {
    const isActive = client.status === 'active';
    return <Toggle isOn={isActive} onToggle={() => handleToggleStatus(client.id, client.status)} ariaLabel={isActive ? `Pause ${client.name}` : `Activate ${client.name}`} />;
  };

  const StatusLabel = ({ client }: { client: Client }) =>
    client.status === 'active' ? <StatusChip tone="good">Live</StatusChip> : <StatusChip tone="warning" icon={CirclePause}>Paused</StatusChip>;

  const RowActions = ({ client }: { client: Client }) => (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={() => edit(client)} aria-label={`Edit ${client.name}`} title="Edit" className="btn btn-secondary btn-icon btn-sm">
        <Pencil size={15} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => remove(client)} aria-label={`Delete ${client.name}`} title="Delete" className="btn btn-destructive btn-icon btn-sm">
        <Trash2 size={15} aria-hidden="true" />
      </button>
      <Link href={`/clients/${client.slug}`} className="btn btn-primary btn-sm">
        View
      </Link>
    </div>
  );

  const viewButton = (view: ViewType, label: string, Icon: typeof List) => (
    <button
      type="button"
      onClick={() => writeView(view)}
      aria-label={label}
      aria-pressed={viewType === view}
      title={label}
      className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', viewType === view ? 'bg-primary-fixed/40 text-primary' : 'text-on-surface-variant hover:bg-surface-container')}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );

  return (
    <PageContainer>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="type-page-title text-on-surface">Clients</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Manage your clients and campaigns</p>
        </div>
        <button type="button" onClick={() => setCreateClientModalOpen(true)} className="btn btn-primary w-full md:w-auto">
          <Plus size={18} aria-hidden="true" />
          Create New Client
        </button>
      </header>

      {clients.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-xs">
            <span className="sr-only">Search clients</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true" />
            <input type="search" placeholder="Search clients…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input !pl-9" />
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="select !w-auto">
              <option value="all">All statuses</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <span className="text-xs text-on-surface-variant" role="status">
            {filteredClients.length} of {clients.length}
          </span>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest p-1" role="group" aria-label="View">
            {viewButton('list', 'Table view', List)}
            {viewButton('grid', 'Card view', LayoutGrid)}
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-14 text-center">
          <p className="text-sm font-semibold text-on-surface">No clients yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">Create a client, connect your sending platform, and import its campaigns to start reporting.</p>
          <button type="button" onClick={() => setCreateClientModalOpen(true)} className="btn btn-primary mt-4">
            <Plus size={18} aria-hidden="true" />
            Create your first client
          </button>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-14 text-center">
          <p className="text-sm font-semibold text-on-surface">No clients match{filtering ? ' these filters' : ''}</p>
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="btn btn-secondary mt-4"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : viewType === 'grid' ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <li key={client.id} className="flex flex-col rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-4 transition-colors hover:border-outline-variant">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="type-section truncate text-on-surface">
                    <Link href={`/clients/${client.slug}`} className="hover:text-primary hover:underline">
                      {client.name}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-xs text-on-surface-variant">Added {formatAdded(client.created_at)}</p>
                </div>
                <StatusToggle client={client} />
              </div>

              <div className="mt-3">
                <StatusLabel client={client} />
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-on-surface-variant">Campaigns</dt>
                  <dd className="font-semibold tabular-nums text-on-surface">{(client.campaign_count ?? 0) === 0 ? '—' : fmtCount(client.campaign_count)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-on-surface-variant" title={MANUAL_HELP}>Inboxes</dt>
                  <dd className="font-semibold tabular-nums text-on-surface">{client.active_inboxes != null ? fmtCount(client.active_inboxes) : '—'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-on-surface-variant" title={MANUAL_HELP}>Domain health</dt>
                  <dd className="mt-0.5">
                    <DomainHealth client={client} />
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-on-surface-variant" title={MANUAL_HELP}>
                Inboxes and domain health: {MANUAL_LABEL.toLowerCase()}
              </p>

              <div className="mt-auto pt-4">
                <RowActions client={client} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
          <DataTable label="Clients" minWidth={860}>
            <thead>
              <tr>
                <Th sticky>Client</Th>
                <Th>Status</Th>
                <Th align="right">Campaigns</Th>
                <Th align="right" title={MANUAL_HELP}>
                  Capacity / day
                  <ManualTag />
                </Th>
                <Th align="right" title={MANUAL_HELP}>
                  Active inboxes
                  <ManualTag />
                </Th>
                <Th title={MANUAL_HELP}>
                  Domain health
                  <ManualTag />
                </Th>
                <Th align="right">Added</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <Tr key={client.id}>
                  <Td sticky className="max-w-[240px]">
                    <Link href={`/clients/${client.slug}`} className="block truncate font-semibold text-on-surface hover:text-primary hover:underline" title={client.name}>
                      {client.name}
                    </Link>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusToggle client={client} />
                      <StatusLabel client={client} />
                    </div>
                  </Td>
                  <Td align="right">{(client.campaign_count ?? 0) === 0 ? '—' : fmtCount(client.campaign_count)}</Td>
                  <Td align="right">{client.sending_capacity != null ? fmtCount(client.sending_capacity) : '—'}</Td>
                  <Td align="right">{client.active_inboxes != null ? fmtCount(client.active_inboxes) : '—'}</Td>
                  <Td>
                    <DomainHealth client={client} />
                  </Td>
                  <Td align="right" muted>
                    {formatAdded(client.created_at)}
                  </Td>
                  <Td align="right">
                    <RowActions client={client} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-on-surface px-4 py-2.5 text-sm text-surface shadow-modal md:bottom-4">
          {toast}
        </div>
      )}

      <CreateClientModal open={createClientModalOpen} onClose={() => setCreateClientModalOpen(false)} onClientCreated={handleClientCreated} />

      <EditClientModal
        open={editClientModal.open}
        clientId={editClientModal.clientId}
        clientName={editClientModal.clientName}
        clientSlug={editClientModal.clientSlug}
        onClose={() => setEditClientModal({ open: false, clientId: null, clientName: null, clientSlug: null })}
        onClientUpdated={handleClientUpdated}
      />

      <DeleteClientModal
        open={deleteClientModal.open}
        clientId={deleteClientModal.clientId}
        clientName={deleteClientModal.clientName}
        onClose={() => setDeleteClientModal({ open: false, clientId: null, clientName: null })}
        onClientDeleted={handleDeleteClient}
      />
    </PageContainer>
  );
}
