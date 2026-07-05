const { getEmailFromRequest, getUser } = require('./_store');

exports.handler = async (event) => {
  const email = getEmailFromRequest(event.headers);
  if (!email) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loggedIn: false })
    };
  }

  const user = await getUser(email);
  const meta = user.accounts.meta;
  const google = user.accounts.google;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loggedIn: true,
      email: user.email,
      metaConnected: !!meta,
      metaNeedsPick: !!meta && meta.adAccounts.length > 1 && !meta.selectedAdAccountId,
      googleConnected: !!google,
      googleNeedsPick: !!google && google.adAccounts.length > 1 && !google.selectedAdAccountId
    })
  };
};
