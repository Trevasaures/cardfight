import { PageHeader } from "../components/layout/PageHeader";

export function Analytics() {
  return (
    <PageHeader
      eyebrow="Analytics"
      title="Deck performance"
      description="Soon this page will use /api/stats/table for charts, rankings, and first-player analysis."
    />
  );
}