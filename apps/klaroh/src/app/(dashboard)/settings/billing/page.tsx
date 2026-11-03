import { Check } from 'lucide-react';

const PLANS = [
  {
    name: 'Solo',
    price: '$29',
    limit: 3,
    features: ['Up to 3 dashboards', 'Email support', 'Basic analytics'],
  },
  {
    name: 'Growth',
    price: '$79',
    limit: 10,
    features: ['Up to 10 dashboards', 'Priority email support', 'Advanced analytics'],
    recommended: true,
  },
  {
    name: 'Agency',
    price: '$149',
    limit: 20,
    features: ['Up to 20 dashboards', '24/7 phone support', 'Custom integrations'],
  },
];

export default function BillingPage() {
  return (
    <div className="px-8 pb-16 pt-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <h1 className="type-page-title text-on-surface">Billing</h1>
          <p className="mt-1 text-base text-on-surface-variant">Manage your plan and billing.</p>
        </div>

        {/* Plans */}
        <div>
          <h2 className="mb-8 type-section text-on-surface">Upgrade Your Plan</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-lg border p-6 transition-all border-outline-variant/50 ${plan.recommended ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.recommended && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-4 py-1 text-sm font-medium text-on-primary">
                    Recommended
                  </div>
                )}

                <h3 className="type-section text-on-surface">{plan.name}</h3>
                <p className="mb-1 mt-2 font-serif text-4xl text-on-surface">
                  {plan.price}
                  <span className="text-lg font-normal text-on-surface-variant">/mo</span>
                </p>
                <p className="mb-6 text-sm text-on-surface-variant">Up to {plan.limit} dashboards</p>

                <ul className="mb-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check size={18} className="flex-shrink-0 text-primary" />
                      <span className="text-sm text-on-surface-variant">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="py-2 text-center text-sm text-on-surface-variant">
                  To upgrade, contact us at{' '}
                  <a href="mailto:hello@klaroh.app" className="font-medium text-primary hover:underline">
                    hello@klaroh.app
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
