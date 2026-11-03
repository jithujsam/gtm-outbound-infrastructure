"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface SupabaseContextValue {
  supabase: SupabaseClient<Database>;
  user: User | null;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabaseRef = useRef<SupabaseClient<Database>>(createClient());
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const client = supabaseRef.current;

    client.auth.getUser().then(
      ({ data }) => setUser(data.user),
      () => setUser(null)
    );

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SupabaseContext.Provider value={{ supabase: supabaseRef.current, user }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within SupabaseProvider");
  return ctx;
}
