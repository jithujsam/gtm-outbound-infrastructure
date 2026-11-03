'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface HeaderActions {
  clientId: string;
  clientSlug: string;
  clientStatus: 'active' | 'paused' | 'ended';
  /** The client's private report token (null until loaded / unavailable). */
  portalToken: string | null;
  setClientStatus: React.Dispatch<React.SetStateAction<'active' | 'paused' | 'ended'>>;
}

interface SidebarContextType {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  headerActions: HeaderActions | null;
  setHeaderActions: React.Dispatch<React.SetStateAction<HeaderActions | null>>;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({
  children,
  initialCollapsed = false,
}: {
  children: React.ReactNode;
  initialCollapsed?: boolean;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(initialCollapsed);
  const [headerActions, setHeaderActions] = useState<HeaderActions | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('klaroh_sidebar_collapsed');
    if (saved !== null) {
      setIsSidebarCollapsed(saved === 'true');
    }
  }, []);

  // Sync state to cookie and localStorage on change
  useEffect(() => {
    document.cookie = `klaroh_sidebar_collapsed=${isSidebarCollapsed}; path=/; max-age=31536000; SameSite=Lax`;
    localStorage.setItem('klaroh_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <SidebarContext.Provider
      value={{
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        headerActions,
        setHeaderActions,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}


