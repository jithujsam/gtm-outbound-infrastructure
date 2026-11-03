// Instantly provider adapter: Instantly HTTP layer + mapper → Klaroh's
// provider-neutral campaign and stat concepts. Server-only (receives API keys).

import {
  fetchInstantlyAccountDaily,
  fetchInstantlyAccounts,
  fetchInstantlyAnalyticsDetailed,
  fetchInstantlyCampaignListDetailed,
  fetchInstantlyCampaignOutcomes,
  fetchInstantlyDomainVitals,
  fetchInstantlyLeads,
  fetchInstantlyReceivedEmailPage,
  fetchInstantlyStepAnalytics,
  fetchInstantlyWarmup,
  userSafeInstantlyError,
  type EmailRequestOptions,
} from '../../instantly-api.ts';
import type { ProviderAdapter, ReceivedMessage } from '../types.ts';
import {
  normalizeInstantlyAccount,
  normalizeInstantlyAccountDays,
  normalizeInstantlyCampaign,
  normalizeInstantlyDomains,
  normalizeInstantlyEmail,
  normalizeInstantlyLead,
  normalizeInstantlyOutcomes,
  normalizeInstantlyStats,
  normalizeInstantlySteps,
  normalizeInstantlyWarmup,
} from './normalize.ts';

export function createInstantlyAdapter(options: EmailRequestOptions = {}): ProviderAdapter {
  return {
    provider: 'instantly',
    label: 'Instantly',

    async validateCredentials(apiKey) {
      const result = await fetchInstantlyCampaignListDetailed(apiKey, options);
      return result.ok ? { ok: true, data: null } : result;
    },

    async listCampaigns(apiKey) {
      const result = await fetchInstantlyCampaignListDetailed(apiKey, options);
      if (!result.ok) return result;
      return { ok: true, data: result.data.map((c) => normalizeInstantlyCampaign(c.item, c.raw)) };
    },

    async fetchStats(apiKey) {
      const result = await fetchInstantlyAnalyticsDetailed(apiKey, undefined, options);
      if (!result.ok) return result;
      return { ok: true, data: result.data.map((a) => normalizeInstantlyStats(a.item, a.raw)) };
    },

    userSafeError(error, fallback) {
      return userSafeInstantlyError(error, fallback);
    },

    async fetchCampaignOutcomes(apiKey, externalId) {
      const result = await fetchInstantlyCampaignOutcomes(apiKey, externalId, options);
      return result.ok ? { ok: true, data: normalizeInstantlyOutcomes(result.data) } : result;
    },

    async fetchStepStats(apiKey, externalId) {
      const result = await fetchInstantlyStepAnalytics(apiKey, externalId, options);
      return result.ok ? { ok: true, data: normalizeInstantlySteps(externalId, result.data) } : result;
    },

    async listAccounts(apiKey) {
      const result = await fetchInstantlyAccounts(apiKey, options);
      if (!result.ok) return result;
      return { ok: true, data: result.data.map((a) => normalizeInstantlyAccount(a.item, a.raw)) };
    },

    async fetchAccountDaily(apiKey, emails, startDate, endDate) {
      const result = await fetchInstantlyAccountDaily(apiKey, emails, startDate, endDate, options);
      return result.ok ? { ok: true, data: normalizeInstantlyAccountDays(result.data) } : result;
    },

    async fetchWarmup(apiKey, emails) {
      const result = await fetchInstantlyWarmup(apiKey, emails, options);
      return result.ok ? { ok: true, data: normalizeInstantlyWarmup(result.data) } : result;
    },

    async checkDomains(apiKey, emails) {
      const result = await fetchInstantlyDomainVitals(apiKey, emails, options);
      return result.ok ? { ok: true, data: normalizeInstantlyDomains(result.data) } : result;
    },

    async fetchReplyPage(apiKey, params) {
      const result = await fetchInstantlyReceivedEmailPage(apiKey, params, options);
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          messages: result.data.emails.map(normalizeInstantlyEmail).filter((m): m is ReceivedMessage => m !== null),
          rows: result.data.rows,
          nextCursor: result.data.nextCursor,
        },
      };
    },

    async fetchLeads(apiKey, leadIds) {
      const result = await fetchInstantlyLeads(apiKey, leadIds, options);
      return result.ok ? { ok: true, data: result.data.map(normalizeInstantlyLead) } : result;
    },
  };
}

export const instantlyAdapter = createInstantlyAdapter();
