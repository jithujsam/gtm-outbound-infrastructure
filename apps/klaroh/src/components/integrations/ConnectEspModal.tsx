'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDialogBehavior } from '@/components/ui/useDialogBehavior';
import clsx from 'clsx';
import { AlertCircle, Check, ChevronLeft, Eye, EyeOff, Loader2, Mail, RefreshCw, Search, X } from 'lucide-react';
import { campaignStatusInfo } from '@/lib/campaign-view';
import type { ProviderCatalogEntry } from '@/lib/providers/catalog';
import type { IntegrationSummary, ProviderCampaignOption } from '@/lib/types';
import {
  ApiError,
  connectIntegration,
  fetchIntegrations,
  fetchProviderCampaigns,
  importClientCampaigns,
  type ImportResponse,
  type IntegrationsState,
} from '@/lib/integrations-client';

interface ConnectEspModalProps {
  open: boolean;
  clientId: string;
  clientName: string | null;
  onClose: () => void;
  onImported: (result: ImportResponse) => void;
}

type Step = 'provider' | 'connect' | 'campaigns' | 'importing';

const STEPS: { id: Exclude<Step, 'importing'>; label: string }[] = [
  { id: 'provider', label: 'Provider' },
  { id: 'connect', label: 'Connect' },
  { id: 'campaigns', label: 'Campaigns' },
];

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString();
}

function ErrorBanner({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-error/50 bg-error/10 px-4 py-3">
      <p className="flex items-start gap-2 font-sans text-sm text-error">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </p>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function ProviderMark({ label }: { label: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-on-primary">
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

/**
 * The client onboarding flow: choose a provider → use the workspace's existing
 * connection or connect one (API key validated server-side, never returned) →
 * pick the campaigns this client uses → import them. Only the selected
 * campaigns are stored and kept in sync.
 */
export default function ConnectEspModal({ open, clientId, clientName, onClose, onImported }: ConnectEspModalProps) {
  const [step, setStep] = useState<Step>('provider');
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [provider, setProvider] = useState<ProviderCatalogEntry | null>(null);

  // connect step
  const [replacingKey, setReplacingKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [justConnected, setJustConnected] = useState(false);

  // campaigns step
  const [campaigns, setCampaigns] = useState<ProviderCampaignOption[] | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [importError, setImportError] = useState('');

  const integration: IntegrationSummary | null = useMemo(
    () => (provider && state ? state.integrations.find((i) => i.provider === provider.id) ?? null : null),
    [provider, state]
  );
  const connected = !!integration?.connected;

  const loadIntegrations = useCallback(async () => {
    setLoadError('');
    try {
      setState(await fetchIntegrations());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load integrations');
    }
  }, []);

  // Mounted fresh each time it opens (the parent renders it only while open),
  // so every visit starts at the provider step.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIntegrations();
  }, [open, loadIntegrations]);

  const loadCampaigns = useCallback(
    async (integrationId: string) => {
      setCampaignsLoading(true);
      setCampaignsError(null);
      try {
        const res = await fetchProviderCampaigns(integrationId, clientId);
        setCampaigns(res.campaigns);
      } catch (err) {
        setCampaignsError(err instanceof ApiError ? err : new ApiError('Could not load campaigns', 0, 'error'));
      } finally {
        setCampaignsLoading(false);
      }
    },
    [clientId]
  );

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ open, panelRef, onClose, dismissible: !(connecting || step === 'importing') });

  if (!open) return null;

  const busy = connecting || step === 'importing';
  const close = () => {
    if (!busy) onClose();
  };

  // ── actions ───────────────────────────────────────────────────────────────
  const chooseProvider = (p: ProviderCatalogEntry) => {
    if (!p.available) return;
    setProvider(p);
    setConnectError('');
    setJustConnected(false);
    setReplacingKey(false);
    setStep('connect');
  };

  const goToCampaigns = () => {
    if (!integration) return;
    setStep('campaigns');
    setSelected(new Set());
    setImportError('');
    void loadCampaigns(integration.id);
  };

  const connect = async () => {
    if (!provider) return;
    const key = apiKey.trim();
    if (key.length < provider.minCredentialLength) {
      setConnectError(`That doesn't look like a valid ${provider.label} API key.`);
      return;
    }
    setConnecting(true);
    setConnectError('');
    try {
      await connectIntegration(provider.id, key);
      setApiKey('');
      setShowKey(false);
      setReplacingKey(false);
      setJustConnected(true);
      setState(await fetchIntegrations());
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setConnecting(false);
    }
  };

  const back = () => {
    if (step === 'campaigns') {
      setStep('connect');
      setImportError('');
    } else if (step === 'connect') {
      setStep('provider');
      setConnectError('');
    }
  };

  const importSelected = async () => {
    if (!integration) return;
    if (selected.size === 0) {
      setImportError('Select at least one campaign to import.');
      return;
    }
    setImportError('');
    setStep('importing');
    try {
      const result = await importClientCampaigns(clientId, integration.id, [...selected]);
      onImported(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import campaigns');
      setStep('campaigns');
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── derived ───────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const visible = (campaigns ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.external_id.toLowerCase().includes(q)
  );
  const selectable = visible.filter((c) => !c.linked);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.external_id));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of selectable) {
        if (allVisibleSelected) next.delete(c.external_id);
        else next.add(c.external_id);
      }
      return next;
    });

  const wide = step === 'campaigns' || step === 'importing';
  const activeIndex = STEPS.findIndex((s) => s.id === (step === 'importing' ? 'campaigns' : step));
  const title =
    step === 'provider'
      ? 'Connect your ESP'
      : step === 'connect'
        ? `Connect ${provider?.label ?? ''}`
        : `Select campaigns${clientName ? ` for ${clientName}` : ''}`;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-on-surface/40" onClick={close} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx(
          'modal-panel fixed left-1/2 top-1/2 z-[60] flex max-h-[90dvh] outline-none w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-modal transition-[max-width] duration-200',
          wide ? 'max-w-3xl' : 'max-w-md'
        )}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-outline-variant/50 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {(step === 'connect' || step === 'campaigns') && (
                <button
                  onClick={back}
                  aria-label="Back"
                  className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <h2 className="truncate font-sans text-base font-semibold text-on-surface">{title}</h2>
            </div>
            <button
              onClick={close}
              disabled={busy}
              aria-label="Close"
              className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress */}
          <ol className="mt-3 flex items-center gap-2" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span
                  className={clsx(
                    'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                    i < activeIndex
                      ? 'bg-primary text-on-primary'
                      : i === activeIndex
                        ? 'border border-primary text-primary'
                        : 'border border-outline-variant text-on-surface-variant'
                  )}
                >
                  {i < activeIndex ? <Check size={12} /> : i + 1}
                </span>
                <span
                  className={clsx(
                    'font-sans text-xs',
                    i === activeIndex ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
                  )}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-6 bg-outline-variant" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>

        {/* ── Step 1: provider ─────────────────────────────────────────── */}
        {step === 'provider' && (
          <div className="space-y-4 overflow-y-auto p-6">
            <p className="font-sans text-sm text-on-surface-variant">Select your email service provider.</p>
            {loadError && (
              <ErrorBanner message={loadError}>
                <button onClick={() => void loadIntegrations()} className="btn btn-secondary">
                  <RefreshCw size={14} /> Retry
                </button>
              </ErrorBanner>
            )}
            {!state && !loadError && (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-on-surface-variant" />
              </div>
            )}
            {state && (
              <div className="space-y-3">
                {state.providers.map((p) => {
                  const existing = state.integrations.find((i) => i.provider === p.id && i.connected);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => chooseProvider(p)}
                      disabled={!p.available}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors',
                        p.available
                          ? 'border-outline-variant hover:border-primary hover:bg-surface-container-low/60'
                          : 'cursor-not-allowed border-outline-variant/50 opacity-60'
                      )}
                    >
                      <ProviderMark label={p.label} />
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm font-medium text-on-surface">{p.label}</p>
                        <p className="font-sans text-xs text-on-surface-variant">{p.description}</p>
                      </div>
                      {existing ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed/30 px-2.5 py-1 text-xs font-semibold text-primary">
                          <Check size={12} /> Connected
                        </span>
                      ) : !p.available ? (
                        <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                          Coming soon
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: connect / use existing ───────────────────────────── */}
        {step === 'connect' && provider && state && (
          <div className="space-y-4 overflow-y-auto p-6">
            <div className="flex items-center gap-3 rounded-lg border border-outline-variant/70 p-4">
              <ProviderMark label={provider.label} />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-sm font-medium text-on-surface">{provider.label}</p>
                <p className="font-sans text-xs text-on-surface-variant">
                  {connected
                    ? justConnected
                      ? 'Connected and verified. Your API key is stored encrypted.'
                      : 'Your workspace is already connected — no API key needed.'
                    : 'Not connected yet.'}
                </p>
              </div>
              {connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed/30 px-2.5 py-1 text-xs font-semibold text-primary">
                  <Check size={12} /> Connected
                </span>
              )}
            </div>

            {connected && !replacingKey && (
              <>
                <div className="flex justify-end gap-3">
                  {state.canManage && !justConnected && (
                    <button type="button" onClick={() => setReplacingKey(true)} className="btn btn-secondary">
                      Use a different API key
                    </button>
                  )}
                  <button type="button" onClick={goToCampaigns} className="btn btn-primary" autoFocus>
                    {justConnected ? 'Continue' : 'Use existing connection'}
                  </button>
                </div>
              </>
            )}

            {(!connected || replacingKey) &&
              (state.canManage ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void connect();
                  }}
                >
                  <div>
                    <label htmlFor="esp-api-key" className="mb-1.5 block font-sans text-sm font-medium text-on-surface-variant">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        id="esp-api-key"
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={`Paste your ${provider.label} API key`}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={connecting}
                        className={clsx('input', connectError && 'input-error')}
                        style={{ paddingRight: '2.5rem' }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? 'Hide key' : 'Show key'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant transition-colors hover:text-primary"
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="mt-1 font-sans text-xs text-on-surface-variant">{provider.credentialHelp}</p>
                    {replacingKey && (
                      <p className="mt-1 font-sans text-xs text-on-surface-variant">
                        Use a key for the same {provider.label} workspace so existing clients keep syncing.
                      </p>
                    )}
                  </div>
                  {connectError && <ErrorBanner message={connectError} />}
                  <div className="flex justify-end gap-3">
                    {replacingKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingKey(false);
                          setApiKey('');
                          setConnectError('');
                        }}
                        disabled={connecting}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                    )}
                    <button type="submit" disabled={connecting || !apiKey.trim()} className="btn btn-primary">
                      {connecting && <Loader2 size={16} className="animate-spin" />}
                      {connecting ? 'Verifying…' : 'Connect'}
                    </button>
                  </div>
                </form>
              ) : (
                <ErrorBanner message={`${provider.label} isn't connected yet. Ask a workspace owner or admin to connect it.`} />
              ))}
          </div>
        )}

        {/* ── Step 3: campaigns ────────────────────────────────────────── */}
        {(step === 'campaigns' || step === 'importing') && (
          <>
            <div className="shrink-0 space-y-3 px-6 pt-4">
              <p className="font-sans text-sm text-on-surface-variant">
                Choose the {provider?.label} campaigns that belong to this client. Only these are imported and kept in
                sync.
              </p>
              {campaigns && campaigns.length > 0 && (
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search campaigns"
                    aria-label="Search campaigns"
                    className="input"
                    style={{ paddingLeft: '2.25rem' }}
                    disabled={step === 'importing'}
                  />
                </div>
              )}
              {importError && <ErrorBanner message={importError} />}
            </div>

            <div className="min-h-[200px] flex-1 overflow-auto px-6 py-4">
              {campaignsLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Loader2 size={20} className="animate-spin text-on-surface-variant" />
                  <p className="font-sans text-sm text-on-surface-variant">Fetching campaigns from {provider?.label}…</p>
                </div>
              )}

              {!campaignsLoading && campaignsError && (
                <ErrorBanner message={campaignsError.message}>
                  {campaignsError.kind === 'auth' || campaignsError.kind === 'not_connected' ? (
                    state?.canManage && (
                      <button
                        onClick={() => {
                          setReplacingKey(true);
                          setStep('connect');
                        }}
                        className="btn btn-secondary"
                      >
                        Update API key
                      </button>
                    )
                  ) : (
                    integration && (
                      <button onClick={() => void loadCampaigns(integration.id)} className="btn btn-secondary">
                        <RefreshCw size={14} /> Retry
                      </button>
                    )
                  )}
                </ErrorBanner>
              )}

              {!campaignsLoading && !campaignsError && campaigns?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed/20">
                    <Mail size={22} className="text-primary" />
                  </div>
                  <p className="mb-1 font-sans text-base font-semibold text-on-surface">No campaigns found</p>
                  <p className="max-w-sm font-sans text-sm text-on-surface-variant">
                    This {provider?.label} account has no campaigns yet. Create one in {provider?.label}, then come
                    back.
                  </p>
                  {integration && (
                    <button onClick={() => void loadCampaigns(integration.id)} className="btn btn-secondary mt-4">
                      <RefreshCw size={14} /> Check again
                    </button>
                  )}
                </div>
              )}

              {!campaignsLoading && !campaignsError && campaigns && campaigns.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="w-10 px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            aria-label="Select all shown campaigns"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                            disabled={selectable.length === 0 || step === 'importing'}
                            className="h-4 w-4 accent-[var(--color-primary)]"
                          />
                        </th>
                        <th className="px-2 py-3 text-left font-sans text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                          Campaign
                        </th>
                        <th className="hidden px-4 py-3 text-right font-sans text-xs font-semibold uppercase tracking-wide text-on-surface-variant sm:table-cell">
                          Sent
                        </th>
                        <th className="hidden px-4 py-3 text-right font-sans text-xs font-semibold uppercase tracking-wide text-on-surface-variant md:table-cell">
                          Leads
                        </th>
                        <th className="px-4 py-3 text-right font-sans text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {visible.map((c) => {
                        const status = campaignStatusInfo(c.status);
                        const checked = c.linked || selected.has(c.external_id);
                        return (
                          <tr
                            key={c.external_id}
                            onClick={() => !c.linked && step !== 'importing' && toggle(c.external_id)}
                            className={clsx(
                              'transition-colors',
                              c.linked ? 'opacity-60' : 'cursor-pointer hover:bg-surface-container-low/60',
                              selected.has(c.external_id) && 'bg-primary-fixed/10'
                            )}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${c.name}`}
                                checked={checked}
                                disabled={c.linked || step === 'importing'}
                                onChange={() => toggle(c.external_id)}
                                className="h-4 w-4 accent-[var(--color-primary)]"
                              />
                            </td>
                            <td className="px-2 py-3">
                              <p className="line-clamp-1 font-sans font-medium text-on-surface">{c.name}</p>
                              <p className="mt-0.5 max-w-[260px] truncate font-mono text-xs text-on-surface-variant">
                                {c.linked ? 'Already on this client · ' : ''}
                                {c.external_id}
                              </p>
                            </td>
                            <td className="hidden px-4 py-3 text-right font-sans tabular-nums text-on-surface sm:table-cell">
                              {fmt(c.emails_sent)}
                            </td>
                            <td className="hidden px-4 py-3 text-right font-sans tabular-nums text-on-surface md:table-cell">
                              {fmt(c.leads)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${status.color}`}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center font-sans text-sm text-on-surface-variant">
                            No campaigns match “{query}”.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant/40 px-6 py-3">
              <p className="font-sans text-xs text-on-surface-variant">
                {campaigns && campaigns.length > 0
                  ? `${selected.size} of ${campaigns.length} selected`
                  : ''}
              </p>
              <div className="flex gap-3">
                <button onClick={close} disabled={busy} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => void importSelected()}
                  disabled={busy || selected.size === 0 || campaignsLoading}
                  className="btn btn-primary"
                >
                  {step === 'importing' && <Loader2 size={16} className="animate-spin" />}
                  {step === 'importing'
                    ? `Importing ${selected.size} campaign${selected.size === 1 ? '' : 's'}…`
                    : 'Import Selected Campaigns'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
