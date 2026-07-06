export const money = (v) => {
  const n = Number(v || 0);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
};

export const number = (v) => Number(v || 0).toLocaleString();

const shortDate = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
});

// "2026-06-12" -> "Jun 12"
export const fmtDate = (iso) => shortDate.format(new Date(`${iso}T00:00:00Z`));

// Percentage change vs a prior value; null when there's no meaningful base.
export const pctChange = (current, previous) => {
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
};

// "3.4200000000000004" -> "3.42%" (CTR and other rates)
export const percent = (v) => `${(+Number(v || 0).toFixed(2)).toLocaleString()}%`;

// "2.5" -> "2.5x" (ROAS)
export const multiple = (v) => `${+Number(v || 0).toFixed(2)}x`;

