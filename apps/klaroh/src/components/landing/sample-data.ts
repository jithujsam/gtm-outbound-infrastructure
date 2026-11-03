// Sample data for the landing-page product tour. Everything here is fictitious and
// internally consistent: the totals are the sums of the rows, and the rates are
// computed with the same definitions the app uses (reply rate = replies ÷ prospects
// reached; emails per positive = emails sent ÷ positive responses).

export const SAMPLE_WORKSPACE = 'Fieldwork Outbound';

export interface SampleCampaign {
  name: string;
  client: string;
  status: 'Active' | 'Paused';
  prospects: number;
  replies: number;
  positive: number;
}

export const CAMPAIGNS: SampleCampaign[] = [
  { name: 'Ops leaders, Q3', client: 'Halden Logistics', status: 'Active', prospects: 6120, replies: 331, positive: 52 },
  { name: 'General counsel outreach', client: 'Brightpath Legal', status: 'Active', prospects: 5430, replies: 249, positive: 37 },
  { name: 'Founders, SaaS', client: 'Cedar Analytics', status: 'Paused', prospects: 5290, replies: 262, positive: 29 },
];

/** Mailboxes in the sample workspace (the infrastructure table lists the first few). */
export const TOTAL_MAILBOXES = 14;

export const TOTALS = {
  emailsSent: 48210,
  prospects: CAMPAIGNS.reduce((n, c) => n + c.prospects, 0), // 16,840
  replies: CAMPAIGNS.reduce((n, c) => n + c.replies, 0), // 842
  positive: CAMPAIGNS.reduce((n, c) => n + c.positive, 0), // 118
};

export const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
export const num = (n: number) => n.toLocaleString('en-US');

/** Cumulative positive responses over 14 days; ends at TOTALS.positive. */
export const POSITIVE_TREND = [6, 14, 22, 31, 43, 52, 63, 74, 86, 95, 103, 110, 115, 118];

export interface SampleMailbox {
  email: string;
  status: 'Active' | 'Sending error' | 'Warmup paused';
  warmup: number | null;
  limit: number;
}

export const MAILBOXES: SampleMailbox[] = [
  { email: 'sam@fieldwork-mail.example', status: 'Active', warmup: 96, limit: 40 },
  { email: 'jo@fieldwork-mail.example', status: 'Active', warmup: 91, limit: 40 },
  { email: 'ana@getfieldwork.example', status: 'Active', warmup: 82, limit: 30 },
  { email: 'max@getfieldwork.example', status: 'Sending error', warmup: 64, limit: 30 },
  { email: 'lee@fieldwork-mail.example', status: 'Warmup paused', warmup: null, limit: 40 },
];

export const DOMAINS = [
  { domain: 'fieldwork-mail.example', spf: true, dkim: true, dmarc: true, mx: true },
  { domain: 'getfieldwork.example', spf: true, dkim: true, dmarc: false, mx: true },
];

export interface SampleThread {
  name: string;
  company: string;
  campaign: string;
  snippet: string;
  chip: 'Interested' | 'Meeting booked';
  when: string;
}

export const THREADS: SampleThread[] = [
  { name: 'Maria Torres', company: 'Halden Logistics', campaign: 'Ops leaders, Q3', snippet: 'Happy to talk. Can you send a couple of times for Thursday?', chip: 'Meeting booked', when: '2h ago' },
  { name: 'Daniel Okafor', company: 'Brightpath Legal', campaign: 'General counsel outreach', snippet: 'This is relevant. Who else in your network does this for firms our size?', chip: 'Interested', when: '5h ago' },
  { name: 'Priya Raman', company: 'Cedar Analytics', campaign: 'Founders, SaaS', snippet: 'Send over the details and I will loop in our head of sales.', chip: 'Interested', when: 'Yesterday' },
];

/** The client-report example (first campaign's client). Cost is a figure the agency enters. */
export const REPORT = {
  client: 'Halden Logistics',
  prospects: 6120,
  replies: 331,
  positive: 52,
  cost: 4000,
  currency: 'USD',
};
