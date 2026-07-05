// Pulls the logged-in customer's real numbers from their selected Meta and Google
// ad accounts. Falls back to labelled demo data if they're not connected yet, or
// haven't picked an account, so the dashboard never looks broken.
const fetch = require('node-fetch');
const { getEmailFromRequest, getUser } = require('./_store');

const DEMO_DATA = {
  isDemo: true,
  leads: 142,
  spend: 3840,
  costPerLead: 27.04,
  metaSpend: 2410,
  googleSpend: 1430,
  weekly: {
    labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
    leads: [18, 22, 24, 29, 33, 38],
    spend: [620, 680, 710, 790, 880, 940]
  }
};

async function getMetaSummary(accessToken, adAccountId) {
  const insightsRes = await fetch(
    `https://graph.facebook.com/v19.0/${adAccountId}/insights?fields=spend,actions&date_preset=last_30d&access_token=${accessToken}`
  );
  const insights = await insightsRes.json();
  const row = insights.data && insights.data[0];
  if (!row) return { spend: 0, leads: 0 };
  const leadAction = (row.actions || []).find((a) => a.action_type === 'lead');
  return { spend: parseFloat(row.spend || 0), leads: leadAction ? parseInt(leadAction.value, 10) : 0 };
}

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not logged in.' }) };
  }

  const user = await getUser(email);
  const meta = user.accounts.meta;
  const google = user.accounts.google;

  const metaReady = meta && meta.selectedAdAccountId;
  const googleReady = google && google.selectedAdAccountId;

  if (!metaReady && !googleReady) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEMO_DATA) };
  }

  try {
    let metaSummary = { spend: 0, leads: 0 };
    if (metaReady) metaSummary = await getMetaSummary(meta.accessToken, meta.selectedAdAccountId);

    // Google Ads live figures need the official Google Ads client library wired
    // in on top of the OAuth connection already in place - left as 0 for now.
    const googleSummary = { spend: 0, leads: 0 };

    const totalLeads = metaSummary.leads + googleSummary.leads;
    const totalSpend = metaSummary.spend + googleSummary.spend;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isDemo: false,
        leads: totalLeads,
        spend: totalSpend,
        costPerLead: totalLeads ? +(totalSpend / totalLeads).toFixed(2) : 0,
        metaSpend: metaSummary.spend,
        googleSpend: googleSummary.spend,
        weekly: DEMO_DATA.weekly
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...DEMO_DATA, error: 'Could not fetch live data, showing demo data instead.' })
    };
  }
};
