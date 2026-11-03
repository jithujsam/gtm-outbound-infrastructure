// The email service providers Klaroh knows about, as the UI presents them.
// Client-safe (no adapters, no secrets). A provider is `available` only when a
// server adapter exists for it in ./index.ts — the UI never offers a provider
// that cannot actually connect.

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  description: string;
  available: boolean;
  /** How to find the credential at the provider (shown under the input). */
  credentialHelp: string;
  /** Shortest credential the provider issues; anything shorter is rejected before a network call. */
  minCredentialLength: number;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'instantly',
    label: 'Instantly',
    description: 'Import campaigns and their performance from Instantly.',
    available: true,
    credentialHelp: 'Find it in Instantly → Settings → Integrations → API Keys (API v2).',
    minCredentialLength: 20,
  },
  {
    id: 'smartlead',
    label: 'Smartlead',
    description: 'Smartlead support is on the way.',
    available: false,
    credentialHelp: '',
    minCredentialLength: 20,
  },
];

export function getProviderCatalogEntry(id: string): ProviderCatalogEntry | null {
  return PROVIDER_CATALOG.find((p) => p.id === id) ?? null;
}

export function isSupportedProvider(id: string): boolean {
  return PROVIDER_CATALOG.some((p) => p.id === id && p.available);
}
