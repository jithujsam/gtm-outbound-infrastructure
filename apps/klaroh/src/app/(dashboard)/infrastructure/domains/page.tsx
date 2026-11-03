export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { domainViews, sortDomainsByRisk, type DeliverabilityHealth } from '@/lib/analytics/infrastructure';
import { fmtDay } from '@/lib/analytics/format';
import { Panel, ToneLabel, type Tone } from '@/components/analytics/ui';
import { InfraPage, type SearchParams } from '../frame';
import { InfrastructureSkeleton } from '@/components/ui/PageSkeletons';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';

const HEALTH: Record<DeliverabilityHealth, { tone: Tone; label: string }> = {
  pass: { tone: 'good', label: 'All checks pass' },
  warning: { tone: 'warning', label: 'Warning' },
  fail: { tone: 'critical', label: 'Failing' },
  unknown: { tone: 'unknown', label: 'Not checked' },
};

const CHECKS: { key: 'spf' | 'dkim' | 'dmarc' | 'mx'; label: string; what: string }[] = [
  { key: 'spf', label: 'SPF', what: 'Which servers may send for the domain' },
  { key: 'dkim', label: 'DKIM', what: 'Messages are signed by the domain' },
  { key: 'dmarc', label: 'DMARC', what: 'Policy for mail failing SPF/DKIM' },
  { key: 'mx', label: 'MX', what: 'The domain can receive mail' },
];

export default function DomainsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InfrastructureSkeleton />}>
      <InfraPage searchParams={searchParams} title="Domains" subtitle="DNS, tracking domains and sending errors of your sending infrastructure." parts={['accounts', 'domains']}>
        {({ data, current }) => {
          const domains = sortDomainsByRisk(domainViews(data.domains, current));
          const failing = domains.filter((d) => d.health === 'fail').length;
          const tracking = [...new Map(current.filter((v) => v.trackingDomain).map((v) => [v.trackingDomain, v])).values()];
          const errors = current.filter((v) => v.status === 'error');
          return (
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant">
                {domains.length} sending domain{domains.length === 1 ? '' : 's'} ·{' '}
                {failing ? <ToneLabel tone="critical">{failing} failing a DNS check</ToneLabel> : <ToneLabel tone="good">no failing DNS checks</ToneLabel>}
              </p>
              <Panel title="DNS checks" subtitle="Failing domains first" bodyClassName="overflow-hidden rounded-b-lg">
                {domains.length ? (
                  <DataTable label="Sending domain DNS checks" minWidth={900}>
                    <thead>
                      <tr>
                        <Th sticky>Domain</Th>
                        <Th align="right">Mailboxes</Th>
                        <Th>Campaigns</Th>
                        <Th>Overall</Th>
                        {CHECKS.map((c) => (
                          <Th key={c.key} title={c.what}>
                            {c.label}
                          </Th>
                        ))}
                        <Th align="right">Checked</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {domains.map((d) => (
                        <Tr key={d.domain}>
                          <Td sticky className="max-w-[260px] truncate font-medium">
                            <span title={d.domain}>{d.domain}</span>
                          </Td>
                          <Td align="right">{d.mailboxes}</Td>
                          <Td className="max-w-[220px]">
                            <span className="block truncate text-xs text-on-surface-variant" title={d.campaigns.map((c) => c.name).join(', ')}>
                              {d.campaigns.length ? d.campaigns.map((c) => c.name).join(', ') : '—'}
                            </span>
                          </Td>
                          <Td>
                            <ToneLabel tone={HEALTH[d.health].tone}>{HEALTH[d.health].label}</ToneLabel>
                          </Td>
                          {CHECKS.map((c) => {
                            const v = d[c.key];
                            return (
                              <Td key={c.key}>
                                <ToneLabel tone={v === true ? 'good' : v === false ? 'critical' : 'unknown'}>{v === true ? 'Pass' : v === false ? 'Fail' : 'Unknown'}</ToneLabel>
                              </Td>
                            );
                          })}
                          <Td align="right" muted className="text-xs">
                            {d.checked_at ? fmtDay(d.checked_at) : 'Not yet'}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-on-surface-variant md:px-5">No sending domains yet.</p>
                )}
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Tracking domains" subtitle="Custom domains used for open/click tracking">
                  {tracking.length ? (
                    <ul className="divide-y divide-outline-variant/30">
                      {tracking.map((v) => (
                        <li key={v.trackingDomain} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm md:px-5">
                          <span className="truncate">{v.trackingDomain}</span>
                          <span className="text-xs text-on-surface-variant">{v.trackingDomainStatus ?? 'status not reported'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-4 text-sm text-on-surface-variant md:px-5">None reported</p>
                  )}
                </Panel>
                <Panel title="Sending errors" subtitle="Mailboxes the provider reports in an error state">
                  {errors.length ? (
                    <ul className="divide-y divide-outline-variant/30">
                      {errors.map((v) => (
                        <li key={v.id} className="px-4 py-2.5 text-sm md:px-5">
                          <ToneLabel tone="critical">{v.email}</ToneLabel>
                          {v.providerStatus && <span className="ml-2 text-xs text-on-surface-variant">provider status {v.providerStatus}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-4 text-sm md:px-5"><ToneLabel tone="good">No mailbox in an error state</ToneLabel></p>
                  )}
                </Panel>
              </div>
              <p className="text-xs text-on-surface-variant">DNS checks are the SPF, DKIM, DMARC and MX results Instantly returns for the sending domains. Blacklist and inbox placement tests are not available from the integration.</p>
            </div>
          );
        }}
      </InfraPage>
    </Suspense>
  );
}
