"use client";

interface BarItem {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  items: BarItem[];
  height?: number;
}

export function BarChart({ items, height = 120 }: BarChartProps) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const pct = (item.value / max) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-16 sm:w-24 text-right text-muted-foreground truncate">{item.label}</span>
            <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-500 flex items-center pl-1.5 min-w-[2px]"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              >
                {item.value > 0 && (
                  <span className="text-[10px] font-medium text-white tabular-nums drop-shadow-sm">
                    {item.value}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
