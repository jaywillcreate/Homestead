import {
  dashboardMetrics,
  monthlySpend,
  recentActivity,
  topTradesBySpend,
  dueThisMonth,
  frequentContractors,
} from "@/lib/queries";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  return (
    <Dashboard
      metrics={dashboardMetrics(today)}
      spend={monthlySpend(12)}
      due={dueThisMonth(ym, today)}
      activity={recentActivity(4)}
      topTrades={topTradesBySpend("2026")}
      frequent={JSON.parse(JSON.stringify(frequentContractors(4)))}
      today={today}
    />
  );
}
