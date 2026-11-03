'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { Client } from '@/lib/types';
import LimitReachedModal from './LimitReachedModal';
import Modal from '@/components/ui/Modal';
import { Field, FormError } from '@/components/ui/Field';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreateClientModalProps {
  open: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
}

export default function CreateClientModal({
  open,
  onClose,
  onClientCreated,
}: CreateClientModalProps) {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [limitData, setLimitData] = useState<{
    reason: 'LIMIT_REACHED' | 'TRIAL_EXPIRED';
    plan: string;
    limit: number;
    current: number;
  } | null>(null);

  const resetForm = () => {
    setClientName('');
    setClientEmail('');
    setError('');
    setErrors({});
    setLimitData(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const next: { name?: string; email?: string } = {};
    if (!clientName.trim()) next.name = 'Enter a client name.';
    if (clientEmail.trim() && !EMAIL_RE.test(clientEmail.trim())) next.email = 'Enter a valid email address, or leave it empty.';
    setErrors(next);
    if (next.name || next.email) {
      (next.name ? nameRef : emailRef).current?.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientName.trim(),
          ...(clientEmail.trim() ? { client_email: clientEmail.trim() } : {}),
        }),
      });

      if (response.status === 403) {
        const errorData = await response.json();
        const reason = errorData.error === 'TRIAL_EXPIRED' ? 'TRIAL_EXPIRED' : 'LIMIT_REACHED';
        setLimitData({
          reason,
          plan: errorData.plan ?? 'basic',
          limit: errorData.limit ?? 3,
          current: errorData.current ?? 0,
        });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create client');
      }

      const client = (await response.json()) as Client;
      onClientCreated(client);
      resetForm();
      onClose();
      // Straight into the new client, where onboarding (Connect your ESP) starts.
      router.push(`/clients/${encodeURIComponent(client.slug)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  if (limitData) {
    return (
      <LimitReachedModal
        open={true}
        reason={limitData.reason}
        plan={limitData.plan}
        limit={limitData.limit}
        current={limitData.current}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create New Client"
      busy={loading}
      dismissOnBackdrop={false}
      footer={
        <>
          <button type="button" onClick={handleClose} disabled={loading} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" form="create-client-form" disabled={loading} className="btn btn-primary">
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {loading ? 'Creating...' : 'Create Client'}
          </button>
        </>
      }
    >
      <form id="create-client-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Client Name" error={errors.name}>
          {(p) => (
            <input
              {...p}
              ref={nameRef}
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Enter client name..."
              disabled={loading}
              data-autofocus
              className={clsx('input', errors.name && 'input-error')}
            />
          )}
        </Field>

        <Field label="Client Email" optional error={errors.email} hint="If provided, we'll send them a link to their dashboard">
          {(p) => (
            <input
              {...p}
              ref={emailRef}
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@company.com"
              disabled={loading}
              className={clsx('input', errors.email && 'input-error')}
            />
          )}
        </Field>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
