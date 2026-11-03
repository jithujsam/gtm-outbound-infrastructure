'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { FormError } from '@/components/ui/Field';

interface DeleteClientModalProps {
  open: boolean;
  clientId: string | null;
  clientName: string | null;
  onClose: () => void;
  onClientDeleted: (clientId: string) => void;
}

export default function DeleteClientModal({
  open,
  clientId,
  clientName,
  onClose,
  onClientDeleted,
}: DeleteClientModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirmDelete = async () => {
    if (!clientId) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/delete-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete client');
      }

      onClientDeleted(clientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="alert"
      title="Delete Client"
      description="This action cannot be undone."
      icon={<AlertTriangle size={20} aria-hidden="true" />}
      busy={loading}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading} data-autofocus className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleConfirmDelete} disabled={loading} className="btn btn-danger">
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {loading ? 'Deleting...' : 'Delete Client'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-outline-variant/50 p-4 text-sm text-on-surface">
          Are you sure you want to delete <span className="font-semibold">{clientName}</span>? Its report link stops working, and every campaign only this client
          uses (with its statistics history), will be permanently deleted. Campaigns are not touched in your sending platform.
        </p>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
