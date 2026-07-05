const { getUser, verifyPassword, createSessionCookie } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const { email, password } = JSON.parse(event.body || '{}');
  const user = email ? await getUser(email) : null;

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Wrong email or password.' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': createSessionCookie(user.email) },
    body: JSON.stringify({ ok: true })
  };
};
