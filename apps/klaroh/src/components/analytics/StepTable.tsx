import { Trophy } from 'lucide-react';
import { bestStep, MIN_STEP_SAMPLE, type StepView } from '@/lib/analytics/steps';
import { fmtCount, fmtPct } from '@/lib/analytics/format';
import { DataTable, Td, Th, Tr } from '@/components/ui/DataTable';

/** "Which follow-up is actually working?" — per step, with variants beneath. */
export default function StepTable({ steps }: { steps: StepView[] }) {
  const best = bestStep(steps);
  const maxRate = Math.max(0, ...steps.map((s) => s.replyRate ?? 0));
  return (
    <div>
      {best && (
        <p className="flex items-center gap-2 border-b border-outline-variant/40 px-4 py-2.5 text-sm md:px-5">
          <Trophy size={15} className="text-primary-container" aria-hidden="true" />
          <span>
            Most replies per email: <span className="font-semibold">Step {best.step}</span> — {fmtPct(best.replyRate)} of its emails got a reply
            {best.replyShare !== null && <> · {fmtPct(best.replyShare)} of all step replies</>}
          </span>
        </p>
      )}
      <DataTable label="Sequence steps" minWidth={640} maxHeight="none">
        <thead>
          <tr>
            <Th>Step</Th>
            <Th align="right">Sent</Th>
            <Th align="right">Replies</Th>
            <Th title="Unique replies ÷ emails sent at this step (not the campaign reply rate)">Replies / sent</Th>
            <Th align="right">Share of replies</Th>
            <Th align="right" title="Positive prospects attributed to this step by Instantly">Positive</Th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <StepRows key={s.step} step={s} maxRate={maxRate} />
          ))}
        </tbody>
      </DataTable>
      <p className="px-4 py-2 text-xs text-on-surface-variant md:px-5">
        Replies / sent = unique replies ÷ emails sent at that step, as reported per step by Instantly. It is not the campaign reply rate (replies ÷ prospects contacted). Steps or variants with fewer than {MIN_STEP_SAMPLE} sends are not ranked.
      </p>
    </div>
  );
}

function RateBar({ value, max }: { value: number | null; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-right">{fmtPct(value)}</span>
      <div className="h-1.5 w-20 rounded-full bg-surface-container">
        {value !== null && max > 0 && <div className="h-1.5 rounded-full bg-primary-container" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />}
      </div>
    </div>
  );
}

function StepRows({ step, maxRate }: { step: StepView; maxRate: number }) {
  return (
    <>
      <Tr>
        <Td className="font-medium">Step {step.step}</Td>
        <Td align="right">{fmtCount(step.sent)}</Td>
        <Td align="right">{fmtCount(step.replies)}</Td>
        <Td>
          <RateBar value={step.replyRate} max={maxRate} />
        </Td>
        <Td align="right">{fmtPct(step.replyShare)}</Td>
        <Td align="right">{fmtCount(step.opportunities)}</Td>
      </Tr>
      {step.variants.map((v) => (
        <tr key={v.variant} className="text-on-surface-variant">
          <Td muted className="pl-8 text-xs">
            Variant {v.variant || '—'}
            {step.bestVariant === v.variant && <span className="ml-2 rounded bg-primary-fixed/40 px-1.5 py-0.5 text-xs font-medium text-on-primary-fixed-variant">Best</span>}
          </Td>
          <Td align="right" muted className="text-xs">{fmtCount(v.sent)}</Td>
          <Td align="right" muted className="text-xs">{fmtCount(v.replies)}</Td>
          <Td muted className="text-xs">
            <RateBar value={v.replyRate} max={maxRate} />
          </Td>
          <Td />
          <Td align="right" muted className="text-xs">{fmtCount(v.opportunities)}</Td>
        </tr>
      ))}
    </>
  );
}
