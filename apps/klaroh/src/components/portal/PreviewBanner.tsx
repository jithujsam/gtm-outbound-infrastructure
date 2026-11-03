'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';

/** Shown to the agency when it opens the client's link from Klaroh. */
export default function PreviewBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="border-b border-outline-variant/40 bg-primary-fixed/30">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-2.5 md:px-6 lg:px-8">
        <p className="flex min-w-0 items-center gap-2 text-sm text-primary">
          <Eye size={16} className="shrink-0" aria-hidden="true" />
          <span className="truncate">
            <span className="font-semibold">Preview</span>
            <span className="hidden sm:inline"> — this is exactly what your client sees with their link.</span>
          </span>
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary/10"
          aria-label="Dismiss preview banner"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
