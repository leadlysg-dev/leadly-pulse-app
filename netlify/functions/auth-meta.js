// Step 1 of Meta connect flow. Requires the customer to already be logged in,
// so we know which account to attach the connected ad account to.
const jwt = require('jsonwebtoken');
const { getEmailFromRequest } = require('./_store');

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) {
    return { statusCode: 302, headers: { Location: '/login.html?next=connect-meta' }, body: '' };
  }

  const state = jwt.sign({ purpose: 'connect-meta', email }, process.env.SESSION_SECRET, { expiresIn: '15m' });

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: process.env.META_REDIRECT_URI,
    state,
    scope: 'ads_read,ads_management,business_management',
    response_type: 'code'
  });

  return {
    statusCode: 302,
    headers: { Location: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}` },
    body: ''
  };
};
