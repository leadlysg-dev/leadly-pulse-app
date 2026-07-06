// Shared helpers for calling the Meta Graph API insights endpoints. Every
// caller already holds a long-lived user access token saved by the OAuth
// callback; these helpers only read reporting data (ads_read scope).
const fetch = require('node-fetch');
const { extractValues } = require('./_metrics');

const GRAPH = 'https://graph.facebook.com/v19.0';

// Calls an insights-style edge and returns the data array. Throws with the
// API's own error message so callers can surface something meaningful.
async function metaGet(path, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}/${path}?${qs.toString()}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || 'Meta API request failed.');
  }
  return json.data || [];
}

// Purchase value lives in action_values under the same aliases the metrics
// catalog uses for purchase counts. omni_purchase already aggregates the
// pixel/app/shop variants, so we take the highest-priority alias the row
// actually has - never summed, which would double-count.
const PURCHASE_VALUE_ALIASES = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_conversion.purchase',
  'app_custom_event.fb_mobile_purchase'
];

function readRevenue(row) {
  const actionValues = row.action_values || [];
  for (const alias of PURCHASE_VALUE_ALIASES) {
    const entry = actionValues.find((a) => a.action_type === alias);
    if (entry) return Number(entry.value) || 0;
  }
  return 0;
}

// Pulls spend, delivery figures, purchase value, and each requested metric's
// value out of one insights row. Rows fetched without the impressions/clicks/
// action_values fields just read as 0.
function readRow(row, metricIds) {
  return {
    spend: parseFloat(row.spend || 0),
    impressions: parseInt(row.impressions || 0, 10),
    clicks: parseInt(row.clicks || 0, 10),
    revenue: readRevenue(row),
    values: extractValues(row, metricIds)
  };
}

function sumRows(rows, metricIds) {
  const totals = { spend: 0, impressions: 0, clicks: 0, revenue: 0, values: {} };
  metricIds.forEach((id) => {
    totals.values[id] = 0;
  });
  rows.forEach((row) => {
    const r = readRow(row, metricIds);
    totals.spend += r.spend;
    totals.impressions += r.impressions;
    totals.clicks += r.clicks;
    totals.revenue += r.revenue;
    metricIds.forEach((id) => {
      totals.values[id] += r.values[id];
    });
  });
  return totals;
}

function costPer(spend, count) {
  return count ? +(spend / count).toFixed(2) : 0;
}

module.exports = { metaGet, readRow, sumRows, costPer };
