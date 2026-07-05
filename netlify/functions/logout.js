const { clearSessionCookie } = require('./_store');

exports.handler = async () => {
  return {
    statusCode: 302,
    headers: { Location: '/login.html', 'Set-Cookie': clearSessionCookie() },
    body: ''
  };
};
