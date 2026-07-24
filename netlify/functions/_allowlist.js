// Who may create an account on this internal deployment. Set
// ALLOWED_LOGIN_EMAILS to a comma-separated list of addresses to restrict
// account creation (recommended); leave it unset to allow any email.
function emailAllowed(email) {
  const raw = process.env.ALLOWED_LOGIN_EMAILS;
  if (!raw || !raw.trim()) return true;
  const allowed = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(String(email || '').toLowerCase());
}

module.exports = { emailAllowed };
