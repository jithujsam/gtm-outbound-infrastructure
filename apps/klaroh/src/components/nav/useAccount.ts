'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** The signed-in agency (name, logo) and sign-out, shared by the desktop and mobile navs. */
export function useAccount(enabled = true) {
  const router = useRouter();
  const [name, setName] = useState('Agency Admin');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/workspace');
        if (!res.ok || cancelled) return;
        const workspace = (await res.json()) as { name: string | null; logo_url: string | null };
        setName(workspace.name || 'Your Agency');
        setLogoUrl(workspace.logo_url || null);
      } catch {
        /* unauthenticated or offline — keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.push('/auth/login');
  }, [router]);

  return { name, initials: name.slice(0, 2).toUpperCase(), logoUrl, loggingOut, logout };
}
