'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { FormError } from '@/components/ui/Field';

interface DeleteCampaignModalProps {
  open: boolean;
  clientId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  onClose: () => void;
  onCampaignDeleted: (campaignId: string) => void;
}

export default function DeleteCampaignModal({
  open,
  clientId,
  campaignId,
  campaignName,
  onClose,
  onCampaignDeleted,
}: DeleteCampaignModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirmDelete = async () => {
    if (!campaignId || !clientId) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/delete-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, clientId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove campaign');
      }

      onCampaignDeleted(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="alert"
      title="Remove Campaign"
      description="The campaign stays in your connected account."
      icon={<AlertTriangle size={20} aria-hidden="true" />}
      busy={loading}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={loading} data-autofocus className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleConfirmDelete} disabled={loading} className="btn btn-danger">
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {loading ? 'Removing...' : 'Remove Campaign'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-outline-variant/50 p-4 text-sm text-on-surface">
          Remove <span className="font-semibold">{campaignName}</span> from this client? Klaroh deletes the campaign and its statistics history
          unless another client still uses it. The campaign stays in your sending platform, so you can import it again (its history starts
          over).
        </p>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
