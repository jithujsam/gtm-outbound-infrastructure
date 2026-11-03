'use client';

import Modal from '@/components/ui/Modal';

const CONTACT_EMAIL = 'hello@klaroh.app';

const PLAN_DISPLAY: Record<string, string> = {
  trial: 'Free Trial',
  basic: 'Basic',
  standard: 'Standard',
  pro: 'Pro',
};

interface LimitReachedModalProps {
  open: boolean;
  reason: 'LIMIT_REACHED' | 'TRIAL_EXPIRED';
  plan: string;
  limit: number;
  current: number;
}

export default function LimitReachedModal({
  open,
  reason,
  plan,
  limit,
  current,
}: LimitReachedModalProps) {
  if (!open) return null;

  const isExpired = reason === 'TRIAL_EXPIRED';
  const planLabel = PLAN_DISPLAY[plan] ?? plan;

  return (
    <Modal
      open={open}
      onClose={() => {}}
      variant="alert"
      dismissible={false}
      title={isExpired ? 'Your trial has expired' : "You've reached your limit"}
      footer={
        <a href={`mailto:${CONTACT_EMAIL}?subject=Upgrade%20Klaroh%20Plan`} data-autofocus className="btn btn-primary w-full justify-center">
          Contact us to upgrade
        </a>
      }
    >
      <p className="text-sm text-on-surface-variant">
        {isExpired
          ? `Your 14-day free trial has ended. Your account is now on the ${planLabel} plan, which includes up to ${limit} client${limit === 1 ? '' : 's'}.`
          : `You're on the ${planLabel} plan, which includes up to ${limit} client${limit === 1 ? '' : 's'}. You currently have ${current}.`}
      </p>

      {/* Progress bar — always at 100% since they've hit the limit */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs text-on-surface-variant">Clients used</span>
          <span className="text-xs font-medium text-on-surface">
            {current} / {limit}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
          <div className="h-full w-full rounded-full bg-error" />
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-on-surface-variant">Your existing clients are not affected.</p>
    </Modal>
  );
}
