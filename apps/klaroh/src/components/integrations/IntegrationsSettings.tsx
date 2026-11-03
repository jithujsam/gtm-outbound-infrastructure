'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, AlertTriangle, Check, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import type { ProviderCatalogEntry } from '@/lib/providers/catalog';
import type { IntegrationSummary } from '@/lib/types';
import SyncStatus from '@/components/sync/SyncStatus';
import {
  connectIntegration,
  disconnectIntegration,
  fetchIntegrations,
  type IntegrationsState,
} from '@/lib/integrations-client';

type Mode = 'idle' | 'key' | 'confirm-disconnect';

/**
 * Settings → Integrations: the workspace's ESP connections. One connection per
 * provider is shared by every client. The API key is write-only here — once
 * saved it is never shown or sent back to the browser.
 */
export default function IntegrationsSettings() {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setState(await fetchIntegrations());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load integrations');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/50 bg-error/10 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-error">
          <AlertCircle size={15} /> {loadError}
        </p>
        <button onClick={() => void load()} className="btn btn-secondary">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={20} className="animate-spin text-on-surface-variant" />
      </div>
    );
  }

  const connectedCount = state.integrations.filter((i) => i.connected).length;

  return (
    <div className="space-y-4">
      {connectedCount === 0 && (
        <p className="rounded-lg bg-surface-container-low px-4 py-3 font-sans text-sm text-on-surface-variant">
          No integrations connected. Connect your email service provider once and reuse it for every client.
        </p>
      )}
      {state.providers.map((p) => (
        <ProviderCard
          key={p.id}
          provider={p}
          integration={state.integrations.find((i) => i.provider === p.id) ?? null}
          canManage={state.canManage}
          onChanged={load}
        />
      ))}
      {!state.canManage && (
        <p className="font-sans text-xs text-on-surface-variant">
          Only workspace owners and admins can connect or disconnect integrations.
        </p>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  integration,
  canManage,
  onChanged,
}: {
  provider: ProviderCatalogEntry;
  integration: IntegrationSummary | null;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const connected = !!integration?.connected;
  const [mode, setMode] = useState<Mode>('idle');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reset = () => {
    setMode('idle');
    setKey('');
    setShowKey(false);
    setError('');
  };

  const saveKey = async () => {
    const trimmed = key.trim();
    if (trimmed.length < provider.minCredentialLength) {
      setError(`That doesn't look like a valid ${provider.label} API key.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await connectIntegration(provider.id, trimmed);
      reset();
      setNotice(connected ? 'API key updated.' : `${provider.label} connected.`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!integration) return;
    setBusy(true);
    setError('');
    try {
      const res = await disconnectIntegration(integration.id);
      reset();
      setNotice(
        res.campaignsKept > 0
          ? `Disconnected. ${res.campaignsKept} campaign${res.campaignsKept === 1 ? '' : 's'} and their history were kept.`
          : 'Disconnected.'
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect');
    } finally {
      setBusy(false);
    }
  };

  const usage =
    integration && integration.client_count > 0
      ? `Used by ${integration.client_count} client${integration.client_count === 1 ? '' : 's'} · ${integration.campaign_count} campaign${integration.campaign_count === 1 ? '' : 's'}`
      : null;

  return (
    <div className={clsx('rounded-lg border border-outline-variant/70 p-4', !provider.available && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-on-primary">
            {provider.label.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-sans font-medium text-on-surface">{provider.label}</p>
            <p className="font-sans text-sm text-on-surface-variant">{usage ?? provider.description}</p>
          </div>
        </div>
        {!provider.available ? (
          <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
            Coming soon
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-fixed/40 px-2.5 py-1 text-xs font-semibold text-primary">
            <Check size={12} /> Connected
          </span>
        ) : (
          <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
            Not connected
          </span>
        )}
      </div>

      {provider.available && (
        <div className="mt-4 space-y-3 border-t border-outline-variant/50 pt-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {notice && mode === 'idle' && <p className="font-sans text-sm text-primary">{notice}</p>}

          {mode === 'idle' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {connected ? (
                <span className="font-sans text-sm text-on-surface-variant">
                  API key: <code className="select-none font-mono tracking-wide text-on-surface">••••••••••••</code>
                </span>
              ) : (
                <span className="font-sans text-sm text-on-surface-variant">
                  {integration && integration.campaign_count > 0
                    ? 'Disconnected — reconnect to resume syncing. History is kept.'
                    : 'Connect once; every client can use it.'}
                </span>
              )}
              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setMode('key');
                      setNotice('');
                    }}
                    className={connected ? 'btn btn-secondary' : 'btn btn-primary'}
                  >
                    {connected ? 'Manage' : integration ? 'Reconnect' : 'Connect Integration'}
                  </button>
                  {connected && (
                    <button
                      onClick={() => {
                        setMode('confirm-disconnect');
                        setNotice('');
                      }}
                      className="btn btn-destructive"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'idle' && connected && integration && (
            <div className="border-t border-outline-variant/50 pt-3">
              <SyncStatus integrationId={integration.id} variant="detailed" />
            </div>
          )}

          {mode === 'key' && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveKey();
              }}
            >
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={connected ? `Paste a new ${provider.label} API key` : `Paste your ${provider.label} API key`}
                  aria-label={`${provider.label} API key`}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  className="input"
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
              <p className="font-sans text-xs text-on-surface-variant">
                {provider.credentialHelp}
                {connected && ` Use a key for the same ${provider.label} workspace so existing clients keep syncing.`}
              </p>
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !key.trim()} className="btn btn-primary">
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {busy ? 'Verifying…' : connected ? 'Update key' : 'Connect'}
                </button>
                <button type="button" onClick={reset} disabled={busy} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {mode === 'confirm-disconnect' && integration && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-outline-variant/50 p-4">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error" />
                <div className="space-y-1 font-sans text-sm text-on-surface">
                  <p className="font-medium">Disconnect {provider.label}?</p>
                  <p className="text-on-surface-variant">
                    The stored API key is deleted and syncing stops.
                    {integration.client_count > 0
                      ? ` ${integration.client_count} client${integration.client_count === 1 ? '' : 's'} will stop receiving new data. Their ${integration.campaign_count} campaign${integration.campaign_count === 1 ? '' : 's'} and all history stay visible; reconnecting resumes syncing.`
                      : ' No clients use it.'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={reset} disabled={busy} className="btn btn-secondary">
                  Keep connected
                </button>
                <button
                  onClick={() => void disconnect()}
                  disabled={busy}
                  className="btn btn-danger"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
