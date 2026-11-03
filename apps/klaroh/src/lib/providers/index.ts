// Server-only registry of campaign provider adapters. Adding a provider means
// adding an adapter here (and marking it available in ./catalog.ts) — the
// database writer, sync orchestration and UI stay unchanged.

import type { ProviderAdapter } from './types.ts';
import { instantlyAdapter } from './instantly/adapter.ts';

const ADAPTERS: Record<string, ProviderAdapter> = {
  instantly: instantlyAdapter,
};

export function getProviderAdapter(provider: string): ProviderAdapter | null {
  return ADAPTERS[provider] ?? null;
}

/** Providers that can actually connect and sync. */
export function connectableProviders(): string[] {
  return Object.keys(ADAPTERS);
}

export type { ProviderAdapter } from './types.ts';
