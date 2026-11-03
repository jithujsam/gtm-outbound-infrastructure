'use client';

import React, { useState } from 'react';
import { RefreshCw, Mail, ShieldCheck, Pencil } from 'lucide-react';
import clsx from 'clsx';
import Modal from '@/components/ui/Modal';
import { Field, FormError } from '@/components/ui/Field';
import { domainHealthText, MANUAL_HELP, MANUAL_LABEL } from '@/lib/infra-signals';

export interface InfraSignals {
  sending_capacity: number | null;
  active_inboxes: number | null;
  domain_health_score: number | null;
  domain_health_status: string | null;
}

interface Props {
  signals: InfraSignals;
  onSave: (updated: InfraSignals) => Promise<void>;
  hideHeading?: boolean;
  stacked?: boolean;
  readOnly?: boolean;
}

interface FieldConfig {
  key: keyof InfraSignals;
  label: string;
  type: 'number' | 'text';
  placeholder: string;
}

interface CardConfig {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  fields: FieldConfig[];
  renderValue: (s: InfraSignals) => React.ReactNode;
  renderSub: (s: InfraSignals) => React.ReactNode;
  shortLabel: string;
  renderShortSub: (s: InfraSignals) => React.ReactNode;
  renderShortValue: (s: InfraSignals) => React.ReactNode;
}

const cards: CardConfig[] = [
  {
    icon: RefreshCw,
    iconBg: 'bg-primary-container',
    iconColor: 'text-on-primary-container',
    label: 'Total Sending Capacity',
    fields: [
      { key: 'sending_capacity', label: 'Sending Capacity', type: 'number', placeholder: '12500' },
    ],
    renderValue: (s) =>
      s.sending_capacity != null
        ? s.sending_capacity >= 1000
          ? `${(s.sending_capacity / 1000).toFixed(1).replace(/\.0$/, '')}k`
          : String(s.sending_capacity)
        : '—',
    renderSub: () => MANUAL_LABEL,
    shortLabel: 'CAPACITY',
    renderShortSub: () => MANUAL_LABEL,
    renderShortValue: (s) => s.sending_capacity != null ? s.sending_capacity.toLocaleString() : '—',
  },
  {
    icon: Mail,
    iconBg: 'bg-secondary-container',
    iconColor: 'text-on-secondary-container',
    label: 'Active Inboxes',
    fields: [
      { key: 'active_inboxes', label: 'Active Inboxes', type: 'number', placeholder: '48' },
    ],
    renderValue: (s) => (s.active_inboxes != null ? String(s.active_inboxes) : '—'),
    renderSub: () => MANUAL_LABEL,
    shortLabel: 'INBOXES',
    renderShortSub: () => MANUAL_LABEL,
    renderShortValue: (s) => (s.active_inboxes != null ? String(s.active_inboxes) : '—'),
  },
  {
    icon: ShieldCheck,
    iconBg: 'bg-primary',
    iconColor: 'text-on-primary',
    label: 'Domain Health',
    fields: [
      { key: 'domain_health_score', label: 'Health Score (%)', type: 'number', placeholder: '98' },
      { key: 'domain_health_status', label: 'Status Label', type: 'text', placeholder: 'Healthy' },
    ],
    renderValue: (s) => domainHealthText(s.domain_health_score, s.domain_health_status) ?? '—',
    renderSub: () => MANUAL_LABEL,
    shortLabel: 'HEALTH',
    renderShortSub: () => MANUAL_LABEL,
    renderShortValue: (s) => s.domain_health_score != null ? `${s.domain_health_score}%` : '—',
  },
];

export default function EmailInfrastructureSignals({ signals, onSave, hideHeading, stacked, readOnly }: Props) {
  const [editing, setEditing] = useState<CardConfig | null>(null);
  const [draft, setDraft] = useState<InfraSignals>(signals);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof InfraSignals, string>>>({});
  const [saveError, setSaveError] = useState('');

  function openModal(card: CardConfig) {
    setDraft(signals);
    setErrors({});
    setSaveError('');
    setEditing(card);
  }

  function closeModal() {
    setEditing(null);
  }

  // Per-field rules: counts are whole numbers from 0; the health score is 0-100.
  function validate(card: CardConfig): Partial<Record<keyof InfraSignals, string>> {
    const out: Partial<Record<keyof InfraSignals, string>> = {};
    for (const f of card.fields) {
      const raw = draft[f.key];
      if (f.type !== 'number' || raw == null) continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) out[f.key] = 'Enter a number from 0 up.';
      else if (f.key === 'domain_health_score' && v > 100) out[f.key] = 'Enter a score from 0 to 100.';
      else if (f.key !== 'domain_health_score' && !Number.isInteger(v)) out[f.key] = 'Enter a whole number.';
    }
    return out;
  }

  async function handleSave() {
    if (!editing) return;
    const found = validate(editing);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(draft);
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: keyof InfraSignals, raw: string, type: 'number' | 'text') {
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setDraft((prev: InfraSignals) => ({
      ...prev,
      [key]: type === 'number' ? (raw === '' ? null : Number(raw)) : raw || null,
    }));
  }

  return (
    <>
      <div className={hideHeading ? (stacked ? 'h-full flex flex-col' : '') : 'mb-8'}>
        {!hideHeading && (
          <h4 className="mb-4 font-sans text-sm font-semibold text-on-surface uppercase tracking-wider">
            Email Infrastructure Signals
          </h4>
        )}
        <p className="mb-3 text-xs text-on-surface-variant">
          {MANUAL_HELP}
        </p>

        {stacked ? (
          <div className="flex flex-1 flex-col gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="relative flex flex-1 flex-col justify-center rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-5 py-4"
                >
                  {!readOnly && (
                    <button
                      onClick={() => openModal(card)}
                      className="absolute right-3 top-3 rounded-md p-1 text-on-surface-variant transition-colors hover:bg-surface-container"
                      aria-label={`Edit ${card.label}`}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <div className="flex items-center gap-2 pr-6">
                    <Icon size={14} className="text-primary" />
                    <span className="font-sans text-sm font-semibold text-on-surface">{card.label}</span>
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-on-surface">{card.renderValue(signals)}</p>
                  <p className="mt-0.5 font-sans text-xs text-on-surface-variant">{card.renderSub(signals)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex w-full flex-col sm:flex-row items-center divide-y sm:divide-y-0 sm:divide-x divide-outline-variant/40 rounded-3xl sm:rounded-full border border-outline-variant/50 bg-surface-container-lowest overflow-hidden">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="group relative flex flex-1 items-center justify-center py-3 px-4 sm:px-6 w-full sm:w-auto"
                >
                  {!readOnly && (
                    <button
                      onClick={() => openModal(card)}
                      className="absolute right-3 rounded-md p-1.5 text-on-surface-variant/70 transition-colors hover:text-on-surface hover:bg-surface-container"
                      aria-label={`Edit ${card.label}`}
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-x-2 gap-y-1 text-center sm:text-left">
                    <Icon size={18} className="text-primary flex-shrink-0" />
                    <span className="font-sans text-base font-medium text-primary ml-1">
                      {card.renderShortValue(signals)}
                    </span>
                    <span className="font-sans text-xs sm:text-sm font-semibold text-on-surface">
                      {card.shortLabel}
                    </span>
                    <span className="font-sans text-xs font-medium text-on-surface-variant/70 tracking-wide uppercase sm:ml-1">
                      {card.renderShortSub(signals)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Modal
        open={!!editing}
        onClose={closeModal}
        title={editing ? `Edit ${editing.label}` : 'Edit'}
        busy={saving}
        dismissOnBackdrop={false}
        footer={
          <>
            <button type="button" onClick={closeModal} disabled={saving} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" form="infra-signal-form" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form
          id="infra-signal-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          {editing?.fields.map((field: FieldConfig, i: number) => (
            <Field key={field.key} label={field.label} error={errors[field.key]}>
              {(p) => (
                <input
                  {...p}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={draft[field.key] != null ? String(draft[field.key]) : ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(field.key, e.target.value, field.type)}
                  data-autofocus={i === 0 ? true : undefined}
                  className={clsx('input', errors[field.key] && 'input-error')}
                />
              )}
            </Field>
          ))}
          <FormError>{saveError}</FormError>
        </form>
      </Modal>
    </>
  );
}
