import clientReporting from './client-reporting-instantly-workspaces';
import replyRates from './reply-rate-positive-reply-rate-numbers-dont-match';
import chooseSetup from './choosing-a-client-reporting-setup';
import type { Resource } from './types';

// Newest first. Add an article by creating a file in this folder and listing it here.
export const RESOURCES: Resource[] = [clientReporting, replyRates, chooseSetup].sort((a, b) => b.published.localeCompare(a.published));

export const getResource = (slug: string): Resource | undefined => RESOURCES.find((r) => r.slug === slug);

export type { Resource } from './types';
