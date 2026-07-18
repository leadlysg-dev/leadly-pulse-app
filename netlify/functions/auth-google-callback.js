// Step 2 of Google connect flow: exchange the code for a refresh token, then
// list every Google Ads account this customer can report on, so they can pick
// which one to track - same pattern as the Meta callback.
//
// This function logs what Google actually answered at each step (scopes
// granted, accounts listed) because its failures have
// historically been invisible: a sunset API version returned errors here for
// months and nothing recorded it. Tokens are never logged.
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const { getUser, saveUser, clearAiInsightCache, getEmailFromRequest } = require('./_store');
const { listClientAccounts } = require('./_googleAds');

// The OAuth state is a short-lived signed token minted at step 1, and the
// connection only ever attaches to the LOGGED-IN session user - a copied,
// forwarded or forged callback URL can never write to someone else's
// account (the exact failure this replaces: raw emails rode in state).
function resolveConnectEmail(event, purpose) {
  const qs = event.queryStringParameters || {};
  if (!qs.code || !qs.state) return { error: 'Missing code or state from the redirect.' };
  let payload;
  try {
    payload = jwt.verify(qs.state, process.env.SESSION_SECRET);
    if (payload.purpose !== purpose) throw new Error('wrong purpose');
  } catch {
    return { error: 'This connect link has expired - open Settings and press Connect again.' };
  }
  const sessionEmail = getEmailFromRequest(event.headers);
  if (!sessionEmail) return { error: 'Please log in, then press Connect again.' };
  if (sessionEmail !== payload.email) {
    return { error: 'This connect link belongs to a different login. Press Connect from your own Settings.' };
  }
  return { email: sessionEmail };
}

exports.handler = async (event) => {
  const resolved = resolveConnectEmail(event, 'connect-google');
  if (resolved.error) return { statusCode: 400, body: resolved.error };
  const email = resolved.email;
  const { code } = event.queryStringParameters || {};

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error(
      `[auth-google-callback] token exchange failed: ${tokenData.error || 'unknown'} ${tokenData.error_description || ''}`
    );
    return { statusCode: 400, body: 'Could not connect Google account: ' + JSON.stringify(tokenData) };
  }
  // Google lists the granted scopes on the token response - logged for
  // debugging consent issues.
  console.log(
    `[auth-google-callback] scopes granted: ${tokenData.scope || '(none reported)'} | refresh_token: ${tokenData.refresh_token ? 'yes' : 'NO'}`
  );
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    console.error('[auth-google-callback] GOOGLE_ADS_DEVELOPER_TOKEN is not set - account listing will fail');
  }

  const user = await getUser(email);
  if (!user) return { statusCode: 401, body: 'Session expired. Please log in again.' };

  // List the real, reportable ad accounts (managers expanded to their client
  // accounts). Failure is logged with Google's own words - an unapproved
  // developer token fails exactly here with a self-explanatory message.
  const googleConn = { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token };
  let adAccounts = [];
  try {
    adAccounts = await listClientAccounts(googleConn);
    console.log(
      `[auth-google-callback] reportable ad accounts: ${
        adAccounts.length ? adAccounts.map((a) => `${a.id} (${a.name})`).join(', ') : '(none)'
      }`
    );
  } catch (err) {
    console.error(`[auth-google-callback] could not list Google Ads accounts: ${err.message}`);
    adAccounts = [];
  }

  const previous = user.accounts.google || {};
  user.accounts.google = {
    accessToken: googleConn.accessToken,
    // Google only re-issues a refresh token when the consent screen was
    // actually shown; if this response omitted it, keep the one we have
    // instead of wiping it (which would break all token refreshes).
    refreshToken: tokenData.refresh_token || previous.refreshToken,
    adAccounts,
    selectedAdAccountId: adAccounts.length === 1 ? adAccounts[0].id : null,
    connectedAt: new Date().toISOString()
  };

  try {
    await saveUser(user);
    // A (re)connected platform changes what the insights cover.
    await clearAiInsightCache(email).catch(() => {});
  } catch (err) {
    console.error(`[auth-google-callback] saving the connection failed: ${err.message}`);
    return {
      statusCode: 500,
      body: 'Google authorized the connection but saving it failed - check the function logs (a database migration may be missing).'
    };
  }

  // More than one account: pick one first. Otherwise straight back to the
  // dashboard - the master metrics setup (Pulse) covers conversions now.
  const next = adAccounts.length > 1 ? '/select-account.html?provider=google' : '/pulse.html?connected=google';
  return { statusCode: 302, headers: { Location: next }, body: '' };
};
