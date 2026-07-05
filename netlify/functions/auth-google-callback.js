// Step 2 of Google connect flow: exchange the code for a refresh token, then list
// every Google Ads account this customer can access, so they can pick which one(s)
// to track - same pattern as the Meta callback.
const fetch = require('node-fetch');
const { getUser, saveUser } = require('./_store');

exports.handler = async (event) => {
  const { code, state: email } = event.queryStringParameters || {};
  if (!code || !email) return { statusCode: 400, body: 'Missing code or state from Google redirect.' };

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
    return { statusCode: 400, body: 'Could not connect Google account: ' + JSON.stringify(tokenData) };
  }

  // List every Google Ads account this customer can access.
  let adAccounts = [];
  try {
    const listRes = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      }
    });
    const listData = await listRes.json();
    adAccounts = (listData.resourceNames || []).map((rn) => {
      const id = rn.split('/')[1];
      return { id, name: `Google Ads account ${id}` };
    });
  } catch {
    adAccounts = [];
  }

  const user = await getUser(email);
  if (!user) return { statusCode: 401, body: 'Session expired. Please log in again.' };

  user.accounts.google = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    adAccounts,
    selectedAdAccountId: adAccounts.length === 1 ? adAccounts[0].id : null,
    connectedAt: new Date().toISOString()
  };
  await saveUser(user);

  const needsPicker = adAccounts.length > 1;
  return {
    statusCode: 302,
    headers: { Location: needsPicker ? '/select-account.html?provider=google' : '/dashboard.html?connected=google' },
    body: ''
  };
};
