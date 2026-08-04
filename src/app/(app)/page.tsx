import {
  dashboardMetrics,
  monthlySpend,
  recentActivity,
  topTradesBySpend,
  dueThisMonth,
  frequentContractors,
  propertyInsights,
} from "@/lib/queries";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const [metrics, spend, due, activity, topTrades, frequent, insights] = await Promise.all([
    dashboardMetrics(today),
    monthlySpend(12),
    dueThisMonth(ym, today),
    recentActivity(4),
    topTradesBySpend("2026"),
    frequentContractors(4),
    propertyInsights(today),
  ]);
  return (
    <Dashboard
      metrics={metrics}
      spend={spend}
      due={due}
      activity={activity}
      topTrades={topTrades}
      frequent={frequent}
      insights={insights}
      today={today}
    />
  );
}
