import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, Users, CheckCircle, Target } from "lucide-react";

interface StatsCardsProps {
  stats: {
    totalProjects: number;
    totalLeads: number;
    validatedLeads: number;
    icpMatchRate: number;
  } | null;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const items = [
    {
      title: "Total Projects",
      value: stats?.totalProjects,
      icon: LayoutDashboard,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Total Leads",
      value: stats?.totalLeads,
      icon: Users,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Validated",
      value: stats?.validatedLeads,
      icon: CheckCircle,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "ICP Match Rate",
      value: stats ? `${stats.icpMatchRate}%` : null,
      icon: Target,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.title}
            </CardTitle>
            <div className={`${item.bg} rounded-md p-1.5`}>
              <item.icon className={`size-4 ${item.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="text-2xl font-bold">{item.value}</div>
            ) : (
              <Skeleton className="h-8 w-20" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
