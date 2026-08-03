import {
  reportSummary, yearOverYear, spendByCategory, spendByContractor,
  laborPartsSplit, plannedVsReactive, spendHeatmap, biggestMovers,
} from "@/lib/queries";
import { ReportsView } from "@/components/ReportsView";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <ReportsView
      summary={reportSummary("2026-07")}
      yoy={yearOverYear("2026")}
      byCategory={spendByCategory("2026")}
      byContractor={spendByContractor("2026")}
      laborParts={laborPartsSplit("2026")}
      planned={plannedVsReactive("2026")}
      heatmap={spendHeatmap("2026")}
      movers={biggestMovers("2026")}
      budget={22000}
    />
  );
}
