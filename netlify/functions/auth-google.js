// Step 1 of Google connect flow. Requires the customer to already be logged in.
const jwt = require('jsonwebtoken');
const { getEmailFromRequest } = require('./_store');

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) {
    return { statusCode: 302, headers: { Location: '/login.html?next=connect-google' }, body: '' };
  }

  const state = jwt.sign({ purpose: 'connect-google', email }, process.env.SESSION_SECRET, { expiresIn: '15m' });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/adwords',
    state
  });

  return {
    statusCode: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` },
    body: ''
  };
};
