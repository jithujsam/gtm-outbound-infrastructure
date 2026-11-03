'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import {
  Settings as SettingsIcon,
  User,
  CreditCard,
  X,
  Check,
  Eye,
  EyeOff,
  Upload,
  AlertCircle,
  Loader2,
  Plug,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import IntegrationsSettings from './integrations/IntegrationsSettings';
import { useDialogBehavior } from './ui/useDialogBehavior';
type SectionId = 'general' | 'integrations' | 'account' | 'billing';

const SECTIONS: { id: SectionId; label: string; icon: typeof SettingsIcon }[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'account', label: 'Account', icon: User },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const CONTACT_EMAIL = 'hello@klaroh.app';

const BILLING_PLANS = [
  { id: 'basic', name: 'Basic', clients: 3, integrations: '1' },
  { id: 'standard', name: 'Standard', clients: 10, integrations: '5' },
  { id: 'pro', name: 'Pro', clients: 25, integrations: 'Unlimited' },
];

const PLAN_DISPLAY: Record<string, string> = {
  trial: 'Free Trial',
  basic: 'Basic',
  standard: 'Standard',
  pro: 'Pro',
};


const labelClass = 'font-sans mb-1.5 block text-sm font-medium text-on-surface-variant';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = () => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  };

  // ── Animation ─────────────────────────────────────────────────────────
  const prefersReducedMotion = useReducedMotion();

  // Focus trap, Escape, scroll lock and focus return (shared with every dialog).
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ open, panelRef, onClose });

  const [section, setSection] = useState<SectionId>('general');

  // ── Identity (read-only here) ─────────────────────────────────────────
  const [userId, setUserId] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [agencyDisplayName, setAgencyDisplayName] = useState('Your Agency');

  // ── General ───────────────────────────────────────────────────────────
  const [agencyName, setAgencyName] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Account ───────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Billing (live from /api/plan-status) ─────────────────────────────
  const [planStatus, setPlanStatus] = useState<{
    plan: string;
    effectivePlan: string;
    limit: number;
    clientCount: number;
    trialExpired: boolean;
    daysRemaining: number;
    limitReached: boolean;
  } | null>(null);
  const [planStatusLoading, setPlanStatusLoading] = useState(false);

  // ── Snapshots for dirty-tracking ──────────────────────────────────────
  const [initial, setInitial] = useState({
    agencyName: '',
    website: '',
    timezone: 'UTC',
    fullName: '',
    email: '',
  });

  // ── Footer state ──────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      const meta = user.user_metadata ?? {};
      const fName = (meta.full_name as string) || '';
      const mail = user.email || '';

      // The workspace profile (agency name, website, logo, timezone).
      const workspaceRes = await fetch('/api/workspace');
      const workspace = workspaceRes.ok
        ? ((await workspaceRes.json()) as {
            name: string | null;
            website: string | null;
            logo_url: string | null;
            timezone: string | null;
          })
        : null;

      const aName = workspace?.name || '';
      const tz = workspace?.timezone || 'UTC';
      const web = workspace?.website || '';

      setAgencyName(aName);
      setWebsite(web);
      setTimezone(tz);
      setLogoUrl(workspace?.logo_url || null);
      setFullName(fName);
      setEmail(mail);
      setCurrentEmail(mail);
      setAgencyDisplayName(aName || 'Your Agency');
      setInitial({ agencyName: aName, website: web, timezone: tz, fullName: fName, email: mail });

    } catch {
      /* unauthenticated — leave defaults */
    }
  }, []);

  // Load fresh whenever the modal opens.
  useEffect(() => {
    if (open) {
      setSection('general');
      setSaved(false);
      setSaveError('');
      loadData();
    }
  }, [open, loadData]);

  // Fetch live plan status whenever the billing tab is opened.
  useEffect(() => {
    if (section !== 'billing') return;
    setPlanStatusLoading(true);
    fetch('/api/plan-status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPlanStatus(data); })
      .catch(() => {})
      .finally(() => setPlanStatusLoading(false));
  }, [section]);

  // ── Dirty tracking (active section only) ──────────────────────────────
  const passwordDirty = newPassword.length > 0 || confirmPassword.length > 0;
  const isDirty = (() => {
    switch (section) {
      case 'general':
        return (
          agencyName !== initial.agencyName ||
          website !== initial.website ||
          timezone !== initial.timezone ||
          logoFile !== null
        );
      case 'account':
        return fullName !== initial.fullName || email !== initial.email || passwordDirty;
      default:
        return false;
    }
  })();

  // ── Logo handling ─────────────────────────────────────────────────────
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ['image/png', 'image/jpeg', 'image/webp'];
    if (!valid.includes(file.type)) {
      setSaveError('Logo must be a PNG, JPG, or WEBP file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Logo must be 2MB or smaller.');
      return;
    }
    setSaveError('');
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  // ── Save (active section only) ────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const supabase = getSupabase();

      if (section === 'general') {
        let nextLogoUrl = logoUrl;
        if (logoFile && userId) {
          const formData = new FormData();
          formData.append('file', logoFile);
          const uploadRes = await fetch('/api/upload-logo', {
            method: 'POST',
            body: formData,
          });
          if (!uploadRes.ok) {
            const errData = await uploadRes.json();
            throw new Error(errData.error || 'Upload failed');
          }
          const { url } = await uploadRes.json();
          nextLogoUrl = url;
        }
        const saveRes = await fetch('/api/workspace', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: agencyName, website, timezone, logo_url: nextLogoUrl }),
        });
        if (!saveRes.ok) {
          const errData = await saveRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to save settings');
        }

        setLogoUrl(nextLogoUrl);
        setLogoFile(null);
        setLogoPreview(null);
        setAgencyDisplayName(agencyName || 'Your Agency');
        setInitial((p) => ({ ...p, agencyName, website, timezone }));
      }

      if (section === 'account') {
        if (passwordDirty) {
          if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.');
          if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
        }
        const data: Record<string, unknown> = { full_name: fullName };
        const payload: { data: typeof data; email?: string; password?: string } = { data };
        if (email !== currentEmail) payload.email = email;
        if (passwordDirty) payload.password = newPassword;

        const { error } = await supabase.auth.updateUser(payload);
        if (error) throw new Error(error.message);

        setNewPassword('');
        setConfirmPassword('');
        setInitial((p) => ({ ...p, fullName, email }));
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const showFooter = section !== 'billing' && section !== 'integrations';
  const initials = (agencyDisplayName || 'K').slice(0, 2).toUpperCase();

  // ── Mobile swipe to switch sections ───────────────────────────────────
  const swipeTouchStart = useRef<{ x: number; y: number } | null>(null);
  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeTouchStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleSwipeTouchEnd = (e: React.TouchEvent) => {
    if (!swipeTouchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeTouchStart.current.x;
    const dy = t.clientY - swipeTouchStart.current.y;
    swipeTouchStart.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    const idx = SECTIONS.findIndex((s) => s.id === section);
    if (dx < 0 && idx < SECTIONS.length - 1) {
      setSection(SECTIONS[idx + 1].id);
      setSaved(false);
      setSaveError('');
    } else if (dx > 0 && idx > 0) {
      setSection(SECTIONS[idx - 1].id);
      setSaved(false);
      setSaveError('');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings-backdrop"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-on-surface/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            className={clsx(
              'relative flex h-full w-full flex-col overflow-hidden bg-surface-container-lowest shadow-modal outline-none',
              'sm:h-[680px] sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:rounded-xl'
            )}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
        >
          <X size={20} />
        </button>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* ── Sidebar / Tab row ───────────────────────────────────── */}
          <aside className="flex shrink-0 flex-col border-outline-variant/40 sm:w-[240px] sm:border-r">
            {/* Mobile: horizontal scrollable tabs. Desktop: vertical nav. */}
            <nav className="flex gap-1 overflow-x-auto px-3 py-3 sm:flex-1 sm:flex-col sm:gap-1 sm:overflow-visible sm:px-3 sm:py-4">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = section === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSection(s.id);
                      setSaved(false);
                      setSaveError('');
                    }}
                    className={clsx(
                      'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors sm:w-full',
                      active
                        ? 'bg-primary font-semibold text-on-primary'
                        : 'text-on-surface-variant hover:bg-primary-fixed/10'
                    )}
                  >
                    <Icon size={18} className="shrink-0" />
                    {s.label}
                  </button>
                );
              })}
            </nav>

            {/* Identity — desktop only, pinned to bottom */}
            <div className="hidden border-t border-outline-variant/30 p-3 sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-fixed text-xs font-semibold text-primary">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-semibold text-on-surface">
                    {agencyDisplayName}
                  </span>
                  <span className="truncate text-xs text-on-surface-variant">
                    {currentEmail}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Content area ────────────────────────────────────────── */}
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-7"
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            {section === 'general' && (
              <SectionShell
                title="General Settings"
                subtitle="Manage your agency identity and core workspace assets."
              >
                <Field label="Agency Name" htmlFor="agency-name">
                  <input
                    id="agency-name"
                    type="text"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Your agency name"
                    className="input"
                  />
                </Field>

                <Field label="Website" htmlFor="agency-website">
                  <input
                    id="agency-website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="input"
                  />
                </Field>

                <Field label="Default Timezone" htmlFor="timezone">
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="input"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </Field>

                <div>
                  <span className={labelClass}>Brand Logo</span>
                  <div className="flex items-center gap-4 rounded-lg border border-dashed border-outline-variant bg-surface-container-low/50 p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
                      {logoPreview || logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoPreview || logoUrl || ''}
                          alt="Brand logo"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Upload size={20} className="text-on-surface-variant" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-secondary"
                      >
                        {logoUrl || logoPreview ? 'Replace Logo' : 'Upload Logo'}
                      </button>
                      <p className="mt-1.5 text-xs text-on-surface-variant">
                        PNG, JPG, or WEBP, up to 2MB.
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </SectionShell>
            )}

            {section === 'integrations' && (
              <SectionShell
                title="Integrations"
                subtitle="Connect your email service provider once and use it for every client. API keys are encrypted and never shown again after saving."
              >
                <IntegrationsSettings />
              </SectionShell>
            )}

            {section === 'account' && (
              <SectionShell title="Account" subtitle="Update your personal details and password.">
                <Field label="Full Name" htmlFor="full-name">
                  <input
                    id="full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="input"
                  />
                </Field>

                <Field label="Email" htmlFor="email">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                  <p className="mt-1.5 text-xs text-on-surface-variant">
                    A confirmation will be sent to your new email address.
                  </p>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New Password" htmlFor="new-password">
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant transition-colors hover:text-primary"
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>

                  <Field label="Confirm Password" htmlFor="confirm-password">
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant transition-colors hover:text-primary"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                </div>
                {passwordDirty && newPassword.length > 0 && newPassword.length < 8 && (
                  <p className="font-sans text-xs text-error">Password must be at least 8 characters.</p>
                )}
                {passwordDirty &&
                  confirmPassword.length > 0 &&
                  newPassword !== confirmPassword && (
                    <p className="font-sans text-xs text-error">Passwords do not match.</p>
                  )}
              </SectionShell>
            )}

            {section === 'billing' && (
              <SectionShell title="Billing & Plan" subtitle="Review your current plan and available options.">
                {planStatusLoading || !planStatus ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-on-surface-variant" />
                  </div>
                ) : (
                  <>
                    {/* Current plan summary */}
                    <div className="rounded-lg border border-outline-variant/60 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-sans text-xs text-on-surface-variant">Current plan</p>
                          <p className="font-sans mt-0.5 text-sm font-semibold text-on-surface">
                            {PLAN_DISPLAY[planStatus.effectivePlan] ?? planStatus.effectivePlan}
                          </p>
                        </div>
                        <span className="rounded-full bg-primary-fixed/40 px-2.5 py-1 text-xs font-semibold text-primary">
                          {PLAN_DISPLAY[planStatus.plan] ?? planStatus.plan}
                        </span>
                      </div>

                      {/* Usage progress */}
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="font-sans text-xs text-on-surface-variant">Clients used</span>
                          <span className="font-sans text-xs font-medium text-on-surface">
                            {planStatus.clientCount} of {planStatus.limit}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                          <div
                            className={`h-full rounded-full transition-all ${
                              planStatus.limitReached
                                ? 'bg-error'
                                : planStatus.clientCount / planStatus.limit >= 0.8
                                ? 'bg-warning'
                                : 'bg-primary'
                            }`}
                            style={{
                              width: `${Math.min(100, Math.round((planStatus.clientCount / planStatus.limit) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Trial days remaining */}
                      {planStatus.plan === 'trial' && (
                        <p className={`font-sans mt-3 text-xs ${planStatus.trialExpired ? 'text-error' : 'text-on-surface-variant'}`}>
                          {planStatus.trialExpired
                            ? 'Your free trial has expired.'
                            : `${planStatus.daysRemaining} day${planStatus.daysRemaining === 1 ? '' : 's'} remaining on your free trial.`}
                        </p>
                      )}
                    </div>

                    {/* Plan comparison */}
                    <div className="space-y-2">
                      {BILLING_PLANS.map((p) => {
                        const isCurrent = p.id === planStatus.effectivePlan;
                        return (
                          <div
                            key={p.id}
                            className={`rounded-lg border p-4 ${
                              isCurrent
                                ? 'border-primary/30 bg-primary-fixed/20'
                                : 'border-outline-variant/60 bg-surface-container-lowest'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-sans text-sm font-semibold text-on-surface">{p.name}</p>
                                <p className="font-sans mt-0.5 text-xs text-on-surface-variant">
                                  {p.clients} clients · {p.integrations} integration{p.integrations === '1' ? '' : 's'}
                                </p>
                              </div>
                              {isCurrent && (
                                <span className="rounded-full bg-primary-fixed/40 px-2.5 py-1 text-xs font-semibold text-primary">
                                  Current
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="font-sans text-sm text-on-surface-variant">
                      To upgrade your plan, contact us at{' '}
                      <a
                        href={`mailto:${CONTACT_EMAIL}?subject=Upgrade%20Klaroh%20Plan`}
                        className="font-sans font-medium text-primary hover:underline"
                      >
                        {CONTACT_EMAIL}
                      </a>
                    </p>
                  </>
                )}
              </SectionShell>
            )}

          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        {showFooter && (
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/40 px-4 py-3 sm:px-8">
            {saveError && (
              <span className="mr-auto flex items-center gap-1.5 text-sm text-error">
                <AlertCircle size={15} /> {saveError}
              </span>
            )}
            {!saveError && isDirty && (
              <span className="mr-auto text-sm text-warning">You have unsaved changes.</span>
            )}
            {!saveError && !isDirty && saved && (
              <span className="mr-auto flex items-center gap-1.5 text-sm font-medium text-primary">
                <Check size={16} /> Saved
              </span>
            )}

            <button
              onClick={handleCancel}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary min-w-[120px]"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Small presentational helpers ────────────────────────────────────────
function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-sans text-base font-semibold text-on-surface">{title}</h2>
      <p className="font-sans mt-1 text-sm text-on-surface-variant">{subtitle}</p>
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}
