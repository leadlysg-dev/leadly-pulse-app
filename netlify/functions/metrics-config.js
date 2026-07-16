// The workspace's master metrics config, set once during onboarding and
// re-run only from Settings. Shape documented in migration 013. Defaults
// (Spend, CPM, Impressions, Ad Clicks, CTR, CPC) are always on client-side
// and never stored here.
const { getEmailFromRequest, getWorkspaceFromRequest, getMetricsConfig, saveMetricsConfig } = require('./_store');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) return { statusCode: 401, body: 'Not logged in.' };
  try {
    const workspace = await getWorkspaceFromRequest(event.headers, email);
    if (event.httpMethod === 'GET') {
      const config = workspace.id ? await getMetricsConfig(workspace.id) : null;
      return json(200, { config: config || null });
    }
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed.' };
    const body = JSON.parse(event.body || '{}');
    const c = body.config;
    if (!c || typeof c !== 'object' || !c.primaryResult || !c.primaryResult.name) {
      return json(400, { error: 'Finish the setup first — a result name is required.' });
    }
    const config = {
      extras: Array.isArray(c.extras) ? c.extras.map(String).slice(0, 10) : [],
      conversions: Array.isArray(c.conversions)
        ? c.conversions.slice(0, 20).map((x) => ({ id: String(x.id), label: String(x.label || x.id), platform: x.platform === 'google' ? 'google' : 'meta' }))
        : [],
      primaryResult: {
        name: String(c.primaryResult.name).slice(0, 40),
        source: c.primaryResult.source === 'crm_verified' ? 'crm_verified' : 'platform_event',
        meta: c.primaryResult.meta ? { event: String(c.primaryResult.meta.event), label: String(c.primaryResult.meta.label || '') } : null,
        google: c.primaryResult.google ? { event: String(c.primaryResult.google.event), label: String(c.primaryResult.google.label || '') } : null
      }
    };
    if (!workspace.id) return json(400, { error: 'No workspace - run migration 011 first.' });
    await saveMetricsConfig(workspace.id, config);
    return json(200, { ok: true, config });
  } catch (err) {
    console.error(`[metrics-config] ${err.message}`);
    return json(400, { error: err.message });
  }
};
