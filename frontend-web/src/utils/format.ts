export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0.0%";
  }

  return `${(value * 100).toFixed(1)}%`;
}

export function formatRecord(wins: number, losses: number) {
  return `${wins}-${losses}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unknown date";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}