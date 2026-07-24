// Internal-tool signup: creates the operator's account with email +
// password. If ALLOWED_LOGIN_EMAILS is set (comma-separated), only those
// emails may create an account - recommended for any public deployment.
const { createUser, createSessionCookie } = require('./_store');
const { emailAllowed } = require('./_allowlist');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const { email, password } = JSON.parse(event.body || '{}');
  if (!email || !password || password.length < 8) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Enter an email and a password of at least 8 characters.' })
    };
  }

  if (!emailAllowed(email)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'This email is not on the allowed list for this internal tool.' })
    };
  }

  try {
    await createUser(email.toLowerCase(), password);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': createSessionCookie(email.toLowerCase()) },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
