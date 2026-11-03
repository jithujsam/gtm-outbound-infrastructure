import type { ReactNode } from 'react';

export interface ResourceSource {
  label: string;
  url: string;
  /** What the source is and what we used it for. */
  note: string;
}

export interface ResourceSection {
  /** Anchor id; also used in the table of contents. */
  id: string;
  title: string;
  body: ReactNode;
}

export interface Resource {
  slug: string;
  title: string;
  /** Used for the meta description and the hub card. */
  description: string;
  category: 'Client reporting' | 'Metrics' | 'Choosing tools';
  /** ISO dates. `updated` changes only when the content changes. */
  published: string;
  updated: string;
  readingMinutes: number;
  /** The short answer, shown above the table of contents. */
  summary: ReactNode;
  sections: ResourceSection[];
  sources: ResourceSource[];
  /** Slugs of other resources. */
  related: string[];
}
