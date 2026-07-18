// Step 2 of Meta connect flow: exchange the code for a token, fetch the list of
// ad accounts this customer manages, and save it against their account. If they
// manage more than one, they'll be sent to pick which one(s) to track.
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const { getUser, saveUser, clearAiInsightCache, getEmailFromRequest } = require('./_store');

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
  const resolved = resolveConnectEmail(event, 'connect-meta');
  if (resolved.error) return { statusCode: 400, body: resolved.error };
  const email = resolved.email;
  const { code } = event.queryStringParameters || {};

  const tokenParams = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: process.env.META_REDIRECT_URI,
    code
  });
  const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`);
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return { statusCode: 400, body: 'Could not connect Meta account: ' + JSON.stringify(tokenData) };
  }

  const longLivedParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: tokenData.access_token
  });
  const longLivedRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${longLivedParams.toString()}`);
  const longLivedData = await longLivedRes.json();
  const accessToken = longLivedData.access_token || tokenData.access_token;

  // Fetch every ad account this customer manages, so they can pick which one(s) matter.
  const acctRes = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&access_token=${accessToken}`);
  const acctData = await acctRes.json();
  const adAccounts = (acctData.data || []).map((a) => ({ id: a.id, name: a.name }));

  // Write capability: the Manage tab needs the ads_management permission.
  // Users who decline it (or connected before it was requested) stay
  // read-only - detected here and stored, so the UI can disable controls
  // instead of failing on the first write.
  let canManage = false;
  try {
    const permRes = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${accessToken}`);
    const permData = await permRes.json();
    canManage = (permData.data || []).some((p) => p.permission === 'ads_management' && p.status === 'granted');
    console.log(`[auth-meta-callback] ads_management granted: ${canManage}`);
  } catch (err) {
    console.error(`[auth-meta-callback] permission check failed: ${err.message}`);
  }

  const user = await getUser(email);
  if (!user) return { statusCode: 401, body: 'Session expired. Please log in again.' };

  user.accounts.meta = {
    accessToken,
    canManage,
    adAccounts,
    selectedAdAccountId: adAccounts.length === 1 ? adAccounts[0].id : null,
    connectedAt: new Date().toISOString()
  };
  await saveUser(user);
  await clearAiInsightCache(email).catch(() => {});

  const needsPicker = adAccounts.length > 1;
  return {
    statusCode: 302,
    headers: { Location: needsPicker ? '/select-account.html?provider=meta' : '/dashboard.html?connected=meta' },
    body: ''
  };
};
