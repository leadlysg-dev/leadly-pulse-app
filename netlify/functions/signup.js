const { createUser, createSessionCookie } = require('./_store');

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

  try {
    await createUser(email, password);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': createSessionCookie(email) },
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
