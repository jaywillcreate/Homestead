import {
  reportSummary, yearOverYear, spendByCategory, spendByContractor,
  laborPartsSplit, plannedVsReactive, spendHeatmap, biggestMovers,
} from "@/lib/queries";
import { ReportsView } from "@/components/ReportsView";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [summary, yoy, byCategory, byContractor, laborParts, planned, heatmap, movers] =
    await Promise.all([
      reportSummary("2026-07"),
      yearOverYear("2026"),
      spendByCategory("2026"),
      spendByContractor("2026"),
      laborPartsSplit("2026"),
      plannedVsReactive("2026"),
      spendHeatmap("2026"),
      biggestMovers("2026"),
    ]);
  return (
    <ReportsView
      summary={summary}
      yoy={yoy}
      byCategory={byCategory}
      byContractor={byContractor}
      laborParts={laborParts}
      planned={planned}
      heatmap={heatmap}
      movers={movers}
      budget={22000}
    />
  );
}
