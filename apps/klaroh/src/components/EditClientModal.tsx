'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { generateSlug, isValidSlug, getSlugError } from '@/lib/slug-utils';
import { createClient } from '@/lib/supabase/client';
import Modal from '@/components/ui/Modal';
import { Field, FormError } from '@/components/ui/Field';

interface EditClientModalProps {
  open: boolean;
  clientId: string | null;
  clientName: string | null;
  clientSlug?: string | null;
  onClose: () => void;
  onClientUpdated: (clientId: string, newName: string, newSlug?: string) => void;
}

export default function EditClientModal({
  open,
  clientId,
  clientName,
  clientSlug,
  onClose,
  onClientUpdated,
}: EditClientModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [initialEmail, setInitialEmail] = useState('');
  const [slugError, setSlugError] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (open && clientName) {
      setName(clientName);
      setSlug(clientSlug || generateSlug(clientName));
      setError('');
      setSlugError('');
      setNameError('');
    }
  }, [open, clientName, clientSlug]);

  // Prefill the current client_email (RLS-scoped read of the caller's own client).
  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    (async () => {
      const next = await (async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from('clients')
            .select('client_email')
            .eq('id', clientId)
            .maybeSingle();
          return data?.client_email ?? '';
        } catch {
          return '';
        }
      })();
      if (cancelled) return;
      setEmail(next);
      setInitialEmail(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    setNameError('');
    if (!slug || slug === generateSlug(clientName || '')) {
      setSlug(generateSlug(newName));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSlug = e.target.value.toLowerCase();
    setSlug(newSlug);
    const error = getSlugError(newSlug);
    setSlugError(error || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;
    const nameProblem = name.trim() ? '' : 'Enter a client name.';
    const slugProblem = isValidSlug(slug) ? '' : getSlugError(slug) || 'Enter a valid URL slug.';
    setNameError(nameProblem);
    setSlugError(slugProblem);
    if (nameProblem || slugProblem) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/update-client-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name, slug, client_email: email.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update client');
      }

      const updated = await response.json();
      onClientUpdated(clientId, updated.name, updated.slug);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update client');
    } finally {
      setLoading(false);
    }
  };

  const unchanged = name === clientName && slug === clientSlug && email.trim() === initialEmail;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Client Name"
      busy={loading}
      dismissOnBackdrop={false}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" form="edit-client-form" disabled={loading || unchanged} className="btn btn-primary">
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form id="edit-client-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Client Name" error={nameError}>
          {(p) => (
            <input {...p} type="text" value={name} onChange={handleNameChange} disabled={loading} placeholder="Enter client name" data-autofocus className={clsx('input', nameError && 'input-error')} />
          )}
        </Field>

        <Field label="Client Email" optional>
          {(p) => <input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} placeholder="client@company.com" className="input" />}
        </Field>

        <Field label="URL Slug" error={slugError} hint="Letters and numbers only, no spaces or symbols">
          {(p) => (
            <input {...p} type="text" value={slug} onChange={handleSlugChange} disabled={loading} placeholder="client-slug" className={clsx('input', slugError && 'input-error')} />
          )}
        </Field>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
