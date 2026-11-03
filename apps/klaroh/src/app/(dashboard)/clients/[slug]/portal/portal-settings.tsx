'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Lock, RefreshCw } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { FormError } from '@/components/ui/Field';
import { StatusChip } from '@/components/ui/StatusChip';
import { metricSet } from '@/lib/analytics/metrics';
import {
  COMMON_CURRENCIES,
  PORTAL_METRIC_KEYS,
  PORTAL_METRICS,
  UNAVAILABLE_PORTAL_METRICS,
  campaignPhase,
  parseAmount,
  portalSummary,
  type Economics,
  type PortalCampaign,
  type PortalMetricKey,
  type PortalMode,
} from '@/lib/analytics/portal';
import type { PortalConfig } from '@/lib/data/portal';

interface Props {
  clientId: string;
  clientSlug: string;
  clientName: string;
  clientActive: boolean;
  campaigns: PortalCampaign[];
  initial: PortalConfig;
}

interface EconomicsDraft {
  currency: string;
  cost: string;
  valuePerPositive: string;
}

const toDraft = (e: Economics | undefined, fallback: string): EconomicsDraft => ({
  currency: e?.currency ?? fallback,
  cost: e?.cost === null || e?.cost === undefined ? '' : String(e.cost),
  valuePerPositive: e?.valuePerPositive === null || e?.valuePerPositive === undefined ? '' : String(e.valuePerPositive),
});

let allCurrencies: string[] | null = null;
/** Every ISO code the browser knows, common ones first (after hydration; the server renders the common ones). */
function currencyOptions(): string[] {
  if (!allCurrencies) {
    let all: string[] = [];
    try {
      all = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('currency');
    } catch {
      /* older runtime: common codes only */
    }
    allCurrencies = [...COMMON_CURRENCIES, ...all.filter((c) => !COMMON_CURRENCIES.includes(c))];
  }
  return allCurrencies;
}
const serverCurrencies = () => COMMON_CURRENCIES;

export default function PortalSettingsForm({ clientId, clientSlug, clientName, clientActive, campaigns, initial }: Props) {
  const [token, setToken] = useState(initial.token);
  const [mode, setMode] = useState<PortalMode>(initial.settings.mode);
  const [metrics, setMetrics] = useState<PortalMetricKey[]>(initial.settings.metrics);
  const [allCampaigns, setAllCampaigns] = useState(initial.settings.campaignIds === null);
  const [selected, setSelected] = useState<string[]>(initial.settings.campaignIds ?? campaigns.map((c) => c.id));
  const [showInfrastructure, setShowInfrastructure] = useState(initial.settings.showInfrastructure);
  const [showEconomics, setShowEconomics] = useState(initial.settings.showEconomics);
  const [showConversations, setShowConversations] = useState(initial.settings.showConversations);
  const firstCurrency = Object.values(initial.economics)[0]?.currency ?? 'USD';
  const [economics, setEconomics] = useState<Record<string, EconomicsDraft>>(() =>
    Object.fromEntries(campaigns.map((c) => [c.id, toDraft(initial.economics[c.id], firstCurrency)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const dirty = () => {
    setSaved(false);
    setError(null);
  };

  const path = `/c/${encodeURIComponent(clientSlug)}/${token}`;
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => '');
  const currencies = useSyncExternalStore(noop, currencyOptions, serverCurrencies);
  const link = `${origin}${path}`;

  // Live preview of the automatic summary with the current choices.
  const included = allCampaigns ? campaigns : campaigns.filter((c) => selected.includes(c.id));
  const summary = useMemo(() => portalSummary(metricSet(included.map((c) => c.counts)), included, metrics), [included, metrics]);

  const ordered = [...metrics, ...PORTAL_METRIC_KEYS.filter((k) => !metrics.includes(k))];
  const toggleMetric = (k: PortalMetricKey) => {
    dirty();
    setMetrics((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));
  };
  const move = (k: PortalMetricKey, dir: -1 | 1) => {
    dirty();
    setMetrics((m) => {
      const i = m.indexOf(k);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= m.length) return m;
      const next = [...m];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const setEcon = (id: string, patch: Partial<EconomicsDraft>) => {
    dirty();
    setEconomics((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  };
  const econErrors = Object.fromEntries(
    Object.entries(economics).map(([id, d]) => [
      id,
      parseAmount(d.cost) === undefined || parseAmount(d.valuePerPositive) === undefined ? 'Enter a positive amount, or leave it empty' : null,
    ])
  );

  const save = async () => {
    setError(null);
    if (!allCampaigns && selected.length === 0) return setError('Choose at least one campaign for the report.');
    if (Object.values(econErrors).some(Boolean)) return setError('Fix the highlighted campaign economics first.');
    setSaving(true);
    try {
      const res = await fetch('/api/client-portal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          settings: { mode, metrics, campaignIds: allCampaigns ? null : selected, showInfrastructure, showEconomics, showConversations },
          economics: campaigns.map((c) => ({ campaignId: c.id, ...economics[c.id] })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is selectable */
    }
  };

  const resetLink = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/client-portal/rotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || typeof d.token !== 'string') throw new Error(d.error || 'Could not reset the link');
      setToken(d.token);
      setConfirmReset(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the link');
      setConfirmReset(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
        {/* ── what the client sees ── */}
        <Panel title="What your client sees" subtitle="Only these figures appear in the report.">
          <div className="space-y-5 px-4 py-4 md:px-5">
            <fieldset className="min-w-0">
              <legend className="label">The report opens on</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['simple', 'At a glance', 'Status, the headline numbers and a plain-language summary.'],
                    ['advanced', 'Detailed report', 'Key figures, progress over time, investment, campaigns and infrastructure.'],
                  ] as const
                ).map(([value, title, text]) => (
                  <label
                    key={value}
                    className={clsx(
                      'flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition-colors',
                      mode === value ? 'border-primary bg-primary-fixed/20' : 'border-outline-variant/60 hover:bg-surface-container-low'
                    )}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => {
                        dirty();
                        setMode(value);
                      }}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-on-surface">{title}</span>
                      <span className="block text-xs text-on-surface-variant">{text}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="field-hint">Your client can switch between both views.</p>
            </fieldset>

            <fieldset className="min-w-0">
              <legend className="label">Key figures</legend>
              <ul className="divide-y divide-outline-variant/40 rounded-lg border border-outline-variant/60">
                {ordered.map((k) => {
                  const on = metrics.includes(k);
                  const i = metrics.indexOf(k);
                  return (
                    <li key={k} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        id={`metric-${k}`}
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleMetric(k)}
                        className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                      />
                      <label htmlFor={`metric-${k}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-sm text-on-surface">{PORTAL_METRICS[k].label}</span>
                        <span className="block truncate text-xs text-on-surface-variant">{PORTAL_METRICS[k].definition}</span>
                      </label>
                      {on && (
                        <span className="flex shrink-0 gap-1">
                          <button type="button" className="btn btn-ghost btn-sm px-1.5!" onClick={() => move(k, -1)} disabled={i === 0} aria-label={`Move ${PORTAL_METRICS[k].label} up`}>
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm px-1.5!"
                            onClick={() => move(k, 1)}
                            disabled={i === metrics.length - 1}
                            aria-label={`Move ${PORTAL_METRICS[k].label} down`}
                          >
                            <ArrowDown size={14} />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
                {UNAVAILABLE_PORTAL_METRICS.map((u) => (
                  <li key={u.label} className="flex items-center gap-3 bg-surface-container-low/60 px-3 py-2.5">
                    <Lock size={14} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-on-surface-variant">{u.label}</span>
                      <span className="block text-xs text-on-surface-variant">{u.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="field-hint">Ticked figures appear in this order. The summary only quotes figures your client can see.</p>
            </fieldset>

            <fieldset className="min-w-0 space-y-2">
              <legend className="label">Sections</legend>
              <Check2 checked={showEconomics} onChange={(v) => { dirty(); setShowEconomics(v); }} label="Investment" hint="Campaign cost and cost per positive response — only where you enter a cost below." />
              <Check2
                checked={showConversations}
                onChange={(v) => { dirty(); setShowConversations(v); }}
                label="Conversations with interested prospects"
                hint="Prospects marked positive, with their replies. Automatic replies and other replies are never shown."
              />
              <Check2 checked={showInfrastructure} onChange={(v) => { dirty(); setShowInfrastructure(v); }} label="Sending infrastructure status" hint="One line on whether the sending accounts are working — no mailbox details." />
            </fieldset>
          </div>
        </Panel>

        {/* ── campaigns ── */}
        <Panel title="Campaigns in the report" subtitle={`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} on this client`}>
          <div className="space-y-3 px-4 py-4 md:px-5">
            {campaigns.length === 0 ? (
              <p className="text-sm text-on-surface-variant">This client has no campaigns yet. The report will say so until one is added.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                  <Radio checked={allCampaigns} onChange={() => { dirty(); setAllCampaigns(true); }} label="All campaigns, including ones added later" />
                  <Radio checked={!allCampaigns} onChange={() => { dirty(); setAllCampaigns(false); }} label="Only the campaigns I choose" />
                </div>
                {!allCampaigns && (
                  <ul className="divide-y divide-outline-variant/40 rounded-lg border border-outline-variant/60">
                    {campaigns.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                        <input
                          id={`camp-${c.id}`}
                          type="checkbox"
                          checked={selected.includes(c.id)}
                          onChange={() => {
                            dirty();
                            setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]));
                          }}
                          className="h-4 w-4 accent-[var(--color-primary)]"
                        />
                        <label htmlFor={`camp-${c.id}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm text-on-surface">
                          {c.name}
                        </label>
                        <StatusChip tone={campaignPhase(c).tone}>{campaignPhase(c).label}</StatusChip>
                      </li>
                    ))}
                  </ul>
                )}
                {included.length > 1 && <p className="field-hint">Totals add up the included campaigns; each campaign is counted once.</p>}
              </>
            )}
          </div>
        </Panel>

        {/* ── economics ── */}
        <Panel title="Campaign economics" subtitle="What the client pays — entered here, never taken from the sending platform.">
          {campaigns.length === 0 ? (
            <p className="px-4 py-4 text-sm text-on-surface-variant md:px-5">Add a campaign to record its cost.</p>
          ) : (
            <ul className="divide-y divide-outline-variant/40">
              {campaigns.map((c) => {
                const d = economics[c.id];
                const err = econErrors[c.id];
                return (
                  <li key={c.id} className="px-4 py-4 md:px-5">
                    <p className="mb-2 truncate text-sm font-semibold text-on-surface">{c.name}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_1fr]">
                      <label className="block">
                        <span className="label">Currency</span>
                        <select className="input" value={d.currency} onChange={(e) => setEcon(c.id, { currency: e.target.value })}>
                          {(currencies.includes(d.currency) ? currencies : [d.currency, ...currencies]).map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="label">Campaign cost</span>
                        <input
                          className={clsx('input', err && parseAmount(d.cost) === undefined && 'input-error')}
                          inputMode="decimal"
                          placeholder="Not set"
                          value={d.cost}
                          onChange={(e) => setEcon(c.id, { cost: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="label">
                          Value per positive response <span className="font-normal text-on-surface-variant">(optional)</span>
                        </span>
                        <input
                          className={clsx('input', err && parseAmount(d.valuePerPositive) === undefined && 'input-error')}
                          inputMode="decimal"
                          placeholder="Not set"
                          value={d.valuePerPositive}
                          onChange={(e) => setEcon(c.id, { valuePerPositive: e.target.value })}
                        />
                      </label>
                    </div>
                    {err && <p className="field-error">{err}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-outline-variant/40 px-4 py-3 text-xs text-on-surface-variant md:px-5">
            Cost per positive response is shown only when a cost is set. The value per positive response is your estimate; with it the client sees an
            estimated return, labelled as an estimate. Amounts are never converted between currencies.
          </p>
        </Panel>
      </div>

      {/* ── side: link + summary preview ── */}
      <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
        <Panel title="Client link" subtitle="Private: anyone with this link can view the report.">
          <div className="space-y-3 px-4 py-4 md:px-5">
            {!clientActive && (
              <p className="rounded-lg bg-warning-container px-3 py-2 text-xs text-on-warning-container">
                This client is offline, so the link shows that the report is unavailable.
              </p>
            )}
            <input className="input font-mono text-xs" readOnly value={link || path} onFocus={(e) => e.currentTarget.select()} aria-label="Report link" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className="btn btn-secondary btn-sm" href={`${path}?preview=true`} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> Preview
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>
                <RefreshCw size={14} /> Reset link
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Client summary" subtitle="Written automatically from the numbers">
          <div className="space-y-2 px-4 py-4 md:px-5">
            <StatusChip tone={summary.tone}>{summary.label}</StatusChip>
            {summary.sentences.map((s) => (
              <p key={s} className="text-sm text-on-surface">
                {s}
              </p>
            ))}
            <p className="pt-1 text-xs text-on-surface-variant">Updates by itself as results come in. It never claims more than the numbers show.</p>
          </div>
        </Panel>
      </div>

      {/* ── save bar ── */}
      <div className="sticky bottom-20 z-30 rounded-lg border border-outline-variant/60 bg-surface-container-lowest/95 shadow-modal backdrop-blur lg:bottom-4 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3">
          <div className="mr-auto min-w-0">
            {error ? <FormError>{error}</FormError> : saved ? <p className="text-sm text-on-surface-variant">Saved — {clientName}&apos;s report is up to date.</p> : null}
          </div>
          <a className="btn btn-secondary" href={`${path}?preview=true`} target="_blank" rel="noopener noreferrer">
            Preview
          </a>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the report link?"
        variant="alert"
        busy={resetting}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmReset(false)} data-autofocus disabled={resetting}>
              Cancel
            </button>
            <button type="button" className="btn btn-destructive" onClick={resetLink} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Reset link'}
            </button>
          </>
        }
      >
        <p className="text-sm text-on-surface">
          The current link stops working immediately. Send {clientName} the new link afterwards.
        </p>
      </Modal>
    </div>
  );
}

const noop = () => () => {};

function Check2({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
      <span>
        <span className="block text-sm text-on-surface">{label}</span>
        <span className="block text-xs text-on-surface-variant">{hint}</span>
      </span>
    </label>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
      <input type="radio" checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}
