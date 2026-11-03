// Client limits per plan. The production database CHECK constraint allows
// trial | solo | growth | agency (matching the billing page); basic | standard | pro
// come from the legacy migration files. Both sets are listed so a plan stored
// under either name gets its real limit instead of silently falling back to 3.
export const PLAN_LIMITS: Record<string, number> = {
  trial: 3,
  solo: 3,
  growth: 10,
  agency: 20,
  basic: 3,
  standard: 10,
  pro: 25,
};

export function isTrialExpired(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 14;
}

export function getEffectivePlan(plan: string, createdAt: string): string {
  if (plan === 'trial' && isTrialExpired(createdAt)) return 'basic';
  return plan;
}

export function getDaysRemaining(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(14 - diffDays));
}
