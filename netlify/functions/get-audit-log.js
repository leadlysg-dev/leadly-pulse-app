// The Manage tab's audit trail: every write this user made, newest first.
const { getEmailFromRequest, listChangeLog } = require('./_store');

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) return { statusCode: 401, body: 'Not logged in.' };
  try {
    const entries = await listChangeLog(email, 100);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) };
  } catch (err) {
    console.error(`[get-audit-log] ${err.message}`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [], unavailable: true })
    };
  }
};
