'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { MoreVertical, Plus, Plug, ArrowRight } from 'lucide-react';
import CampaignDropdown from '@/components/CampaignDropdown';
import DeleteCampaignModal from '@/components/DeleteCampaignModal';
import CampaignSectionSkeleton from '@/components/CampaignSectionSkeleton';
import IntegrationSkeleton from '@/components/IntegrationSkeleton';
import { createClient } from '@/lib/supabase/client';
import CampaignSection from './campaign-section';
import ClientDashboard from './client-dashboard';
import IntegrationSection from './integration-section';
import ConnectEspModal from '@/components/integrations/ConnectEspModal';
import type { ImportResponse } from '@/lib/integrations-client';
import type { CampaignView } from '@/lib/types';
import { getClientCampaigns } from '@/lib/data/campaigns';
import type { InfraSignals } from '@/components/EmailInfrastructureSignals';
import { useSidebar } from '@/components/SidebarContext';

interface DashboardLayoutProps {
  userId: string;
  clientId: string | null;
  clientName: string | null;
  clientSlug?: string | null;
  clientStatus?: string | null;
  initialAgencyName?: string;
  initialCampaigns?: CampaignView[];
  initialInfraSignals?: InfraSignals;
  portalToken?: string | null;
}

interface Campaign {
  id: string;
  name: string;
  provider: string | null;
}

const toCampaignOption = (c: CampaignView): Campaign => ({ id: c.id, name: c.name, provider: c.provider });

export default function DashboardLayout({
  userId,
  clientId,
  clientName,
  clientSlug,
  clientStatus: clientStatusProp,
  initialAgencyName,
  initialCampaigns,
  initialInfraSignals,
  portalToken = null,
}: DashboardLayoutProps) {
  const [agencyName] = useState(initialAgencyName ?? '');
  const [campaigns, setCampaigns] = useState<Campaign[]>(
    initialCampaigns?.map(toCampaignOption) ?? []
  );
  // Full campaign rows handed to the dashboards; replaced after an import and
  // the dashboards remounted (dataVersion) so they render the new data at once.
  const [campaignViews, setCampaignViews] = useState<CampaignView[]>(initialCampaigns ?? []);
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState('All');
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectEspOpen, setConnectEspOpen] = useState(false);
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);
  const [deleteCampaignName, setDeleteCampaignName] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Desktop-first so server render matches the initial client render (no hydration mismatch).
  const [isDesktop, setIsDesktop] = useState(true);

  const { setHeaderActions } = useSidebar();
  const [clientStatus, setClientStatus] = useState<'active' | 'paused' | 'ended'>(
    (clientStatusProp as 'active' | 'paused' | 'ended') ?? 'active'
  );

  useEffect(() => {
    if (clientStatusProp) {
      setClientStatus(clientStatusProp as 'active' | 'paused' | 'ended');
    }
  }, [clientStatusProp]);

  useEffect(() => {
    if (clientId && clientSlug) {
      setHeaderActions({
        clientId,
        clientSlug,
        clientStatus,
        setClientStatus,
        portalToken,
      });
    }
    return () => setHeaderActions(null);
  }, [clientId, clientSlug, clientStatus, portalToken, setHeaderActions]);

  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 1024);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);



  const handleDeleteCampaign = (campaignId: string, campaignName: string) => {
    setDeleteCampaignId(campaignId);
    setDeleteCampaignName(campaignName);
    setShowDeleteModal(true);
  };

  const handleCampaignDeleted = async (campaignId: string) => {
    setShowDeleteModal(false);
    setDeleteCampaignId(null);
    setDeleteCampaignName(null);
    if (selectedCampaign === deleteCampaignName) {
      setSelectedCampaign('All');
    }
    if (clientId) {
      try {
        const rows = await getClientCampaigns(createClient(), clientId);
        setCampaigns(rows.map(toCampaignOption));
        setCampaignViews(rows);
      } catch {
        /* ignore */
      }
    }
  };

  const handleImported = (result: ImportResponse) => {
    setConnectEspOpen(false);
    setCampaignViews(result.campaigns);
    setCampaigns(result.campaigns.map(toCampaignOption));
    setSelectedCampaign('All');
    setDataVersion((v) => v + 1);
    const parts = [
      result.linked > 0
        ? `${result.linked} campaign${result.linked === 1 ? '' : 's'} imported`
        : 'Those campaigns are already on this client',
    ];
    if (result.notFound.length) parts.push(`${result.notFound.length} no longer found at the provider`);
    if (result.warning) parts.push(result.warning);
    setToast(parts.join(' · '));
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const needsOnboarding = !!clientId && campaigns.length === 0;

  // Provider badge for the selected campaign (none for the "All" view).
  const selectedProvider =
    selectedCampaign === 'All' ? null : (campaigns.find((c) => c.name === selectedCampaign)?.provider ?? null);

  const campaignOptions = [
    { id: 'all', name: 'All' },
    ...campaigns.map((c) => ({ id: c.id, name: c.name })),
  ];

  return (
    <div className="px-4 py-5 md:px-6 lg:px-8 lg:pb-16">
      <div className="mx-auto max-w-page">
        {/* ---------- MOBILE/TABLET HEADER (< lg) ---------- */}
        <div className="lg:hidden">
          {/* Row 1: title */}
          <h1 className="type-page-title text-on-surface">
            {clientName ? `${clientName} Performance Dashboard` : 'Performance Dashboard'}
          </h1>

          {/* Row 2: subtitle */}
          <p className="mt-1 text-sm text-on-surface-variant">
            Progress across all campaigns currently being executed by {agencyName || 'your agency'}.
          </p>

          {/* Row 3: campaign selector + three-dot menu */}
          {!needsOnboarding && (
          <div className="mb-4 mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1">
                <CampaignDropdown
                  value={selectedCampaign}
                  onChange={setSelectedCampaign}
                  options={campaignOptions}
                  onDelete={handleDeleteCampaign}
                />
              </div>
              <button
                onClick={() => setConnectEspOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface transition-colors hover:bg-surface-container active:scale-[0.96]"
                title="Add campaign"
                aria-label="Add campaign"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface transition-colors hover:bg-surface-container active:scale-[0.96]"
              >
                <MoreVertical size={18} />
              </button>

              {menuOpen && (
                <>
                  {/* Tap-outside backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                  />

                  <div
                    role="menu"
                    className="dropdown-panel absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 shadow-modal"
                  >
                    <div className="px-2 py-1.5">
                      <Suspense fallback={<IntegrationSkeleton />}>
                        <IntegrationSection provider={selectedProvider} />
                      </Suspense>
                    </div>


                  </div>
                </>
              )}
            </div>
          </div>
          )}
        </div>

        {/* ---------- DESKTOP HEADER (lg+) ---------- */}
        <header className="hidden flex-col justify-between gap-4 lg:flex lg:flex-row lg:items-end">
          <div>
            <h1 className="type-page-title text-on-surface">
              {clientName ? `${clientName} Performance Dashboard` : 'Performance Dashboard'}
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Progress across all campaigns currently being executed by {agencyName || 'your agency'}.
            </p>
          </div>

        </header>

        {/* ---------- DESKTOP CONTROLS (lg+) ---------- */}
        {!needsOnboarding && (
        <div className="mb-4 mt-4 hidden flex-col gap-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-40">
                <CampaignDropdown
                  value={selectedCampaign}
                  onChange={setSelectedCampaign}
                  options={campaignOptions}
                  onDelete={handleDeleteCampaign}
                />
              </div>
              <button
                onClick={() => setConnectEspOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface transition-colors hover:bg-surface-container active:scale-[0.96]"
                title="Add campaign"
                aria-label="Add campaign"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <Suspense fallback={<IntegrationSkeleton />}>
              <IntegrationSection provider={selectedProvider} />
            </Suspense>


          </div>
        </div>
        )}

        {/* Stat cards + Campaign Performance chart */}
        <div className={needsOnboarding ? 'mt-6' : undefined}>
          {needsOnboarding ? (
            <ConnectEspEmptyState clientName={clientName} onConnect={() => setConnectEspOpen(true)} />
          ) : selectedCampaign === 'All' ? (
            <ClientDashboard
              key={dataVersion}
              userId={userId}
              clientId={clientId}
              clientName={clientName}
              clientStatus={clientStatus}
              campaigns={campaigns}
              initialCampaigns={campaignViews}
              initialInfraSignals={initialInfraSignals}
              onSelectCampaign={setSelectedCampaign}
            />
          ) : (
            <Suspense fallback={<CampaignSectionSkeleton />}>
              <CampaignSection
                key={dataVersion}
                userId={userId}
                clientId={clientId}
                clientName={clientName}
                clientSlug={clientSlug}
                campaigns={campaigns}
                selectedCampaign={selectedCampaign}
                initialCampaigns={campaignViews}
                initialInfraSignals={initialInfraSignals}
              />
            </Suspense>
          )}
        </div>

        {clientId && connectEspOpen && (
          <ConnectEspModal
            open
            clientId={clientId}
            clientName={clientName}
            onClose={() => setConnectEspOpen(false)}
            onImported={handleImported}
          />
        )}

        {toast && (
          <div
            role="status"
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-on-surface px-4 py-2.5 text-sm text-surface shadow-modal md:bottom-4"
          >
            {toast}
          </div>
        )}

        <DeleteCampaignModal
          open={showDeleteModal}
          clientId={clientId}
          campaignId={deleteCampaignId}
          campaignName={deleteCampaignName}
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteCampaignId(null);
            setDeleteCampaignName(null);
          }}
          onCampaignDeleted={handleCampaignDeleted}
        />
      </div>
    </div>
  );
}

/** Shown in place of the dashboard until the client has campaigns. */
function ConnectEspEmptyState({ clientName, onConnect }: { clientName: string | null; onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-fixed/20">
        <Plug size={22} className="text-primary" />
      </div>
      <h2 className="mb-2 font-sans text-base font-semibold text-on-surface">Connect your ESP</h2>
      <p className="max-w-md font-sans text-sm text-on-surface-variant">
        Connect your email service provider to import campaign data and start tracking
        {clientName ? ` ${clientName}'s` : " this client's"} outbound performance.
      </p>
      <button onClick={onConnect} className="btn btn-primary mt-6">
        Connect ESP <ArrowRight size={16} />
      </button>
      <ol className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-sans text-xs text-on-surface-variant">
        <li>1. Choose your provider</li>
        <li aria-hidden="true">→</li>
        <li>2. Connect (once per workspace)</li>
        <li aria-hidden="true">→</li>
        <li>3. Pick this client&apos;s campaigns</li>
      </ol>
    </div>
  );
}
