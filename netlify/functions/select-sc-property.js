// Saves which Search Console property the SEO tab tracks - same pattern as
// select-account. Only a property from the customer's own stored list can
// be chosen.
const { getEmailFromRequest, getUser, saveUser } = require('./_store');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const email = getEmailFromRequest(event.headers);
  if (!email) return json(401, { error: 'Not logged in.' });

  const { siteUrl } = JSON.parse(event.body || '{}');
  if (typeof siteUrl !== 'string' || !siteUrl) return json(400, { error: 'Invalid request.' });

  const user = await getUser(email);
  const google = user && user.accounts.google;
  if (!google) return json(400, { error: 'Google is not connected.' });

  const known = (google.scProperties || []).some((p) => p.siteUrl === siteUrl);
  if (!known) return json(400, { error: "That property isn't in your Search Console list." });

  google.selectedScSiteUrl = siteUrl;
  await saveUser(user);
  return json(200, { ok: true });
};
