// Data for the landing-page product mockup. Mirrors the figures in real Klaroh screenshots
// (Overview, Campaigns, Infrastructure, Clients) so the mockup matches what a user sees.

import type { CampaignStatus } from '@/lib/types';

export const WORKSPACE = { name: 'Clospect', initials: 'CL' };
export const LAST_SYNCED = 'Last synced 10 Oct, 10:18 AM';

export interface AppCampaign {
  name: string;
  status: CampaignStatus;
  emailsSent: number;
  prospects: number;
  replies: number;
  positive: number;
  bounces: number;
  updated: string;
}

// Ordered as the Clients page lists them.
export const APP_CAMPAIGNS: AppCampaign[] = [
  { name: 'Fintech, BFSI', status: 'active', emailsSent: 931, prospects: 478, replies: 1, positive: 3, bounces: 12, updated: '4d ago' },
  { name: 'Defence and Aviation', status: 'completed', emailsSent: 320, prospects: 161, replies: 1, positive: 1, bounces: 2, updated: '4d ago' },
  { name: 'Pharma', status: 'paused', emailsSent: 865, prospects: 439, replies: 9, positive: 5, bounces: 7, updated: 'Oct 1' },
  { name: 'D2C', status: 'completed', emailsSent: 385, prospects: 195, replies: 0, positive: 0, bounces: 4, updated: '3d ago' },
  { name: 'Semicon', status: 'completed', emailsSent: 795, prospects: 405, replies: 2, positive: 1, bounces: 12, updated: 'Sep 30' },
];

export const APP_TOTALS = {
  emailsSent: APP_CAMPAIGNS.reduce((n, c) => n + c.emailsSent, 0), // 3,296
  prospects: APP_CAMPAIGNS.reduce((n, c) => n + c.prospects, 0), // 1,678
  replies: APP_CAMPAIGNS.reduce((n, c) => n + c.replies, 0), // 13
  positive: APP_CAMPAIGNS.reduce((n, c) => n + c.positive, 0), // 10
  bounces: APP_CAMPAIGNS.reduce((n, c) => n + c.bounces, 0), // 37
};

export const rate = (n: number, d: number) => {
  const v = d ? (n / d) * 100 : 0;
  return `${v === 0 ? '0' : v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
};
export const fmt = (n: number) => n.toLocaleString('en-US');

/** Campaigns page order: positive rate, descending. */
export const BY_POSITIVE_RATE = [...APP_CAMPAIGNS].sort((a, b) => b.positive / b.prospects - a.positive / a.prospects || b.replies / b.prospects - a.replies / a.prospects);
