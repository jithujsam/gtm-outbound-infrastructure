"use client";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  centerLabel: string;
  size?: number;
}

export function DonutChart({ slices, centerLabel, size = 140 }: DonutChartProps) {
  const total = slices.reduce((s, c) => s + c.value, 0);
  const radius = size / 2 - 8;
  const strokeWidth = 14;
  const innerRadius = radius - strokeWidth;
  const circumference = 2 * Math.PI * innerRadius;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={innerRadius}
            fill="none" stroke="currentColor" strokeWidth={strokeWidth}
            className="text-muted/20" />
        </svg>
        <p className="text-xs text-muted-foreground font-medium">{centerLabel}</p>
        <p className="text-[10px] text-muted-foreground">No data</p>
      </div>
    );
  }

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((slice, i) => {
            const dashArray = (slice.value / total) * circumference;
            const dashOffset = -offset;
            offset += dashArray;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={innerRadius}
                fill="none"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashArray} ${circumference - dashArray}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          className="fill-foreground font-bold text-lg">
          {centerLabel}
        </text>
      </svg>
      <div className="flex flex-wrap gap-2 justify-center">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
