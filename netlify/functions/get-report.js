// Report data for the Reporting tab, scoped per platform. Each connected
// platform reports its OWN selected conversion metrics (selected_metrics
// rows on its connection) - Meta metrics are action types read from the
// insights actions array, Google metrics are conversion-action resource
// names read via segments.conversion_action. The two are never merged into
// one number: the frontend renders conversion cards per platform.
//
// Delivery numbers (spend / impressions / clicks) are the same unit on
// both platforms, so the frontend may blend those freely.
const { getEmailFromRequest, getUser, saveUser } = require('./_store');
const { VALID_RANGES, resolveRange, resolveCustomRange, listDays } = require('./_dates');
const { metaGet, readRow, sumRows } = require('./_meta');
const { getSelectedMetrics, extractValues } = require('./_metrics');
const { fetchGoogleCampaignDaily, fetchGoogleConversionsDaily } = require('./_googleAds');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const round2 = (v) => +v.toFixed(2);
const costPer = (spend, count) => (count > 0 ? round2(spend / count) : null);

// One platform's slice of the response.
const emptyChannel = (status) => ({
  status, // ok | not-connected | no-account | no-metrics | error
  metrics: [],
  totals: { spend: 0, impressions: 0, clicks: 0 },
  previous: { spend: 0, impressions: 0, clicks: 0 },
  daily: { spend: [], impressions: [], clicks: [] }
});

function metricEntry(m, spendNow, spendPrev, valueNow, valuePrev, daily) {
  return {
    id: m.id,
    label: m.label,
    targetCostPer: m.targetCostPer != null ? m.targetCostPer : null,
    value: valueNow,
    previous: valuePrev,
    costPer: costPer(spendNow, valueNow),
    prevCostPer: costPer(spendPrev, valuePrev),
    daily
  };
}

// Deterministic sample so the tab reads correctly before anything connects.
function demoReport(window, dates) {
  const n = dates.length;
  const wave = (i, base, amp, f) => Math.max(0, Math.round(base + amp * Math.sin(i / f)));
  const spend = dates.map((_, i) => wave(i, 58, 15, 4));
  const impressions = spend.map((s) => s * 41);
  const clicks = spend.map((s) => Math.round(s * 0.45));
  const leadsDaily = dates.map((_, i) => wave(i, 3, 2, 3));
  const total = (a) => a.reduce((x, y) => x + y, 0);
  const meta = {
    status: 'ok',
    totals: { spend: total(spend), impressions: total(impressions), clicks: total(clicks) },
    previous: {
      spend: Math.round(total(spend) * 0.93),
      impressions: Math.round(total(impressions) * 0.95),
      clicks: Math.round(total(clicks) * 0.9)
    },
    daily: { spend, impressions, clicks },
    landingPageViews: { value: Math.round(total(clicks) * 0.72), previous: Math.round(total(clicks) * 0.66), daily: clicks.map((c) => Math.round(c * 0.72)) },
    metrics: [
      metricEntry(
        { id: 'lead', label: 'Leads', targetCostPer: 50 },
        total(spend),
        total(spend) * 0.93,
        total(leadsDaily),
        Math.round(total(leadsDaily) * 0.85),
        leadsDaily
      )
    ]
  };
  return {
    isDemo: true,
    ...window,
    dates,
    channels: { meta, google: emptyChannel('not-connected') },
    campaigns: [
      { name: 'Spring offer — leads', channel: 'meta', spend: round2(meta.totals.spend * 0.7), results: Math.round(meta.metrics[0].value * 0.75), costPer: costPer(meta.totals.spend * 0.7, Math.round(meta.metrics[0].value * 0.75)), metricLabel: 'Leads' },
      { name: 'Retargeting — warm traffic', channel: 'meta', spend: round2(meta.totals.spend * 0.3), results: Math.round(meta.metrics[0].value * 0.25), costPer: costPer(meta.totals.spend * 0.3, Math.round(meta.metrics[0].value * 0.25)), metricLabel: 'Leads' }
    ]
  };
}

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) return json(401, { error: 'Not logged in.' });

  const qs = event.queryStringParameters || {};
  const custom = resolveCustomRange(qs.since, qs.until);
  const range = custom ? 'custom' : VALID_RANGES.includes(qs.range) ? qs.range : 'last_7d';
  const { since, until, prevSince, prevUntil } = custom || resolveRange(range);
  const dates = listDays(since, until);
  const dateIndex = Object.fromEntries(dates.map((d, i) => [d, i]));
  const window = { range, since, until, prevSince, prevUntil };

  const user = await getUser(email);
  const meta = user.accounts.meta;
  const google = user.accounts.google;
  if (!meta || !meta.selectedAdAccountId) {
    return json(200, demoReport(window, dates));
  }

  const campaigns = [];

  // ---------------- Meta: its own selected metrics ----------------
  const metaChannel = emptyChannel('ok');
  const metaMetrics = getSelectedMetrics(meta); // defaults to Leads pre-picker
  const LPV = 'landing_page_view';
  const metaIds = [...metaMetrics.map((m) => m.id), LPV];
  try {
    const [dailyRows, prevRows, campaignRows] = await Promise.all([
      metaGet(`${meta.selectedAdAccountId}/insights`, {
        fields: 'spend,actions,impressions,clicks',
        time_range: JSON.stringify({ since, until }),
        time_increment: 1,
        limit: 100,
        access_token: meta.accessToken
      }),
      metaGet(`${meta.selectedAdAccountId}/insights`, {
        fields: 'spend,actions,impressions,clicks',
        time_range: JSON.stringify({ since: prevSince, until: prevUntil }),
        access_token: meta.accessToken
      }),
      metaGet(`${meta.selectedAdAccountId}/insights`, {
        fields: 'campaign_name,spend,actions',
        level: 'campaign',
        time_range: JSON.stringify({ since, until }),
        limit: 500,
        access_token: meta.accessToken
      })
    ]);

    const byDate = {};
    dailyRows.forEach((row) => {
      byDate[row.date_start] = readRow(row, metaIds);
    });
    const totals = sumRows(dailyRows, metaIds);
    const prev = sumRows(prevRows, metaIds);

    metaChannel.totals = { spend: round2(totals.spend), impressions: totals.impressions, clicks: totals.clicks };
    metaChannel.previous = { spend: round2(prev.spend), impressions: prev.impressions, clicks: prev.clicks };
    metaChannel.daily = {
      spend: dates.map((d) => (byDate[d] ? round2(byDate[d].spend) : 0)),
      impressions: dates.map((d) => (byDate[d] ? byDate[d].impressions : 0)),
      clicks: dates.map((d) => (byDate[d] ? byDate[d].clicks : 0))
    };
    metaChannel.landingPageViews = {
      value: totals.values[LPV],
      previous: prev.values[LPV],
      daily: dates.map((d) => (byDate[d] ? byDate[d].values[LPV] : 0))
    };
    metaChannel.metrics = metaMetrics.map((m) =>
      metricEntry(
        m,
        totals.spend,
        prev.spend,
        totals.values[m.id],
        prev.values[m.id],
        dates.map((d) => (byDate[d] ? byDate[d].values[m.id] : 0))
      )
    );

    // Campaign summaries on Meta's primary metric, for the highlight card.
    const primary = metaMetrics[0];
    campaignRows.forEach((row) => {
      const spend = parseFloat(row.spend || 0);
      const results = extractValues(row, [primary.id])[primary.id];
      if (spend <= 0) return;
      campaigns.push({
        name: row.campaign_name,
        channel: 'meta',
        spend: round2(spend),
        results,
        costPer: costPer(spend, results),
        metricLabel: primary.label
      });
    });
  } catch (err) {
    return json(200, {
      ...demoReport(window, dates),
      error: 'Could not fetch live data, showing demo data instead.'
    });
  }

  // ---------------- Google: its own selected metrics ----------------
  let googleChannel;
  if (!google) {
    googleChannel = emptyChannel('not-connected');
  } else if (!google.selectedAdAccountId) {
    googleChannel = emptyChannel('no-account');
  } else {
    const googleMetrics = google.selectedMetrics || []; // NO Leads default - Google picks its own
    googleChannel = emptyChannel(googleMetrics.length ? 'ok' : 'no-metrics');
    try {
      const account = (google.adAccounts || []).find((a) => a.id === google.selectedAdAccountId);
      const opts = { loginCustomerId: account && account.loginCustomerId };
      const actionIds = googleMetrics.map((m) => m.id);
      const [cur, prev, convCur, convPrev] = await Promise.all([
        fetchGoogleCampaignDaily(google, google.selectedAdAccountId, since, until, opts),
        fetchGoogleCampaignDaily(google, google.selectedAdAccountId, prevSince, prevUntil, opts),
        fetchGoogleConversionsDaily(google, google.selectedAdAccountId, since, until, actionIds, opts),
        fetchGoogleConversionsDaily(google, google.selectedAdAccountId, prevSince, prevUntil, actionIds, opts)
      ]);
      if (cur.tokenRefreshed || prev.tokenRefreshed) await saveUser(user).catch(() => {});

      const totals = { spend: 0, impressions: 0, clicks: 0 };
      const daily = { spend: dates.map(() => 0), impressions: dates.map(() => 0), clicks: dates.map(() => 0) };
      const campaignSpend = {};
      cur.rows.forEach((r) => {
        totals.spend += r.spend;
        totals.impressions += r.impressions;
        totals.clicks += r.clicks;
        const i = dateIndex[r.date];
        if (i != null) {
          daily.spend[i] = round2(daily.spend[i] + r.spend);
          daily.impressions[i] += r.impressions;
          daily.clicks[i] += r.clicks;
        }
        campaignSpend[r.campaign] = (campaignSpend[r.campaign] || 0) + r.spend;
      });
      const previous = { spend: 0, impressions: 0, clicks: 0 };
      prev.rows.forEach((r) => {
        previous.spend += r.spend;
        previous.impressions += r.impressions;
        previous.clicks += r.clicks;
      });
      googleChannel.totals = { spend: round2(totals.spend), impressions: totals.impressions, clicks: totals.clicks };
      googleChannel.previous = { spend: round2(previous.spend), impressions: previous.impressions, clicks: previous.clicks };
      googleChannel.daily = daily;

      // Per selected action: daily series + totals now and before.
      const perAction = {};
      actionIds.forEach((id) => {
        perAction[id] = { now: 0, before: 0, daily: dates.map(() => 0), byCampaign: {} };
      });
      convCur.rows.forEach((r) => {
        const slot = perAction[r.action];
        if (!slot) return;
        slot.now += r.conversions;
        const i = dateIndex[r.date];
        if (i != null) slot.daily[i] = +(slot.daily[i] + r.conversions).toFixed(1);
        slot.byCampaign[r.campaign] = (slot.byCampaign[r.campaign] || 0) + r.conversions;
      });
      convPrev.rows.forEach((r) => {
        if (perAction[r.action]) perAction[r.action].before += r.conversions;
      });
      googleChannel.metrics = googleMetrics.map((m) => {
        const slot = perAction[m.id];
        return metricEntry(
          m,
          totals.spend,
          previous.spend,
          +slot.now.toFixed(1),
          +slot.before.toFixed(1),
          slot.daily
        );
      });

      // Campaign summaries on Google's primary metric.
      const gPrimary = googleMetrics[0];
      if (gPrimary) {
        Object.entries(campaignSpend).forEach(([name, spend]) => {
          if (spend <= 0) return;
          const results = +(perAction[gPrimary.id].byCampaign[name] || 0).toFixed(1);
          campaigns.push({
            name,
            channel: 'google',
            spend: round2(spend),
            results,
            costPer: costPer(spend, results),
            metricLabel: gPrimary.label
          });
        });
      }
    } catch (err) {
      console.error(`[get-report] Google Ads fetch failed: ${err.message}`);
      googleChannel = emptyChannel('error');
      googleChannel.error = err.message;
    }
  }

  return json(200, {
    isDemo: false,
    ...window,
    dates,
    channels: { meta: metaChannel, google: googleChannel },
    campaigns: campaigns.sort((a, b) => b.spend - a.spend)
  });
};
