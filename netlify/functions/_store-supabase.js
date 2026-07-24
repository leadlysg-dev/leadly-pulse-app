// Supabase (Postgres) storage backend. Replaces the one-JSON-blob-per-user
// model with four normalized tables (users, connected_accounts, ad_accounts,
// selected_metrics - see supabase-schema.sql at the repo root), while
// assembling and accepting the exact same nested user object the rest of
// the functions have always used:
//
//   { id, email, passwordHash, createdAt,
//     accounts: { meta: { accessToken, adAccounts: [{id, name}],
//                         selectedAdAccountId, connectedAt,
//                         selectedMetrics: [{id, label}] },
//                 google: { ...same, plus refreshToken } } }
//
// Connects with the service/secret key (SUPABASE_SECRET_KEY), which
// bypasses RLS - the tables themselves are RLS-locked against the public
// anon key.
const { createClient } = require('@supabase/supabase-js');
const { hashPassword } = require('./_password');

const PROVIDERS = ['meta', 'google'];

let client;
function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set.');
    }
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false }
    });
  }
  return client;
}

function fail(error, doing) {
  throw new Error(`Database error while ${doing}: ${error.message}`);
}

function byPosition(a, b) {
  return a.position - b.position;
}

// One connected_accounts row (with its embedded child rows) back into the
// provider object shape the rest of the code expects.
function assembleProvider(row) {
  const provider = {
    accessToken: row.access_token,
    adAccounts: (row.ad_accounts || []).sort(byPosition).map((a) => {
      const account = { id: a.external_id, name: a.name };
      // Google accounts reached through a manager (MCC) carry the manager
      // id reporting calls must authenticate through.
      if (a.login_customer_id) account.loginCustomerId = a.login_customer_id;
      return account;
    }),
    selectedAdAccountId: row.selected_ad_account_id,
    connectedAt: row.connected_at
  };
  if (row.can_manage !== null && row.can_manage !== undefined) provider.canManage = row.can_manage;
  if (row.refresh_token) provider.refreshToken = row.refresh_token;
  const metrics = (row.selected_metrics || [])
    .sort(byPosition)
    .map((m) => {
      const metric = { id: m.metric_id, label: m.label };
      if (m.target_cost_per != null) metric.targetCostPer = Number(m.target_cost_per);
      return metric;
    });
  if (metrics.length) provider.selectedMetrics = metrics;
  return provider;
}

async function getUser(email) {
  const { data: u, error } = await db()
    .from('users')
    .select('id, email, password_hash, password_set_at, created_at, ai_prefs')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) fail(error, 'loading user');
  if (!u) return null;

  const { data: accounts, error: accError } = await db()
    .from('connected_accounts')
    .select(
      // Base columns select * so not-yet-migrated columns (login_customer_id,
      // can_manage, ...) can't break every getUser call app-wide.
      '*, ' +
        'ad_accounts ( * ), ' +
        'selected_metrics ( metric_id, label, position, target_cost_per )'
    )
    .eq('user_id', u.id);
  if (accError) fail(accError, 'loading connected accounts');

  const user = {
    id: u.id,
    email: u.email,
    passwordHash: u.password_hash,
    passwordSetAt: u.password_set_at,
    createdAt: u.created_at,
    aiPrefs: u.ai_prefs,
    accounts: {}
  };
  (accounts || []).forEach((row) => {
    user.accounts[row.provider] = assembleProvider(row);
  });
  return user;
}

// opts.passwordSet=false marks the password as a placeholder (accounts
// auto-created by Google sign-in), so Settings offers "Set password".
async function createUser(email, password, opts = {}) {
  const { data, error } = await db()
    .from('users')
    .insert({
      email: email.toLowerCase(),
      password_hash: hashPassword(password),
      password_set_at: opts.passwordSet === false ? null : new Date().toISOString()
    })
    .select('id, email, password_hash, password_set_at, created_at, ai_prefs')
    .single();
  if (error) {
    // 23505 = Postgres unique violation; same message the Blobs backend threw.
    if (error.code === '23505') throw new Error('An account with that email already exists.');
    fail(error, 'creating user');
  }
  return {
    id: data.id,
    email: data.email,
    passwordHash: data.password_hash,
    passwordSetAt: data.password_set_at,
    createdAt: data.created_at,
    aiPrefs: data.ai_prefs,
    accounts: {}
  };
}

// The two Settings writes target the users row directly - saveUser only
// manages the connection tables and never touches users.
async function setPassword(email, password) {
  const { error } = await db()
    .from('users')
    .update({ password_hash: hashPassword(password), password_set_at: new Date().toISOString() })
    .eq('email', email.toLowerCase());
  if (error) fail(error, 'saving password');
}

async function saveAiPrefs(email, prefs) {
  const { error } = await db()
    .from('users')
    .update({ ai_prefs: prefs })
    .eq('email', email.toLowerCase());
  if (error) fail(error, 'saving AI preferences');
}

// Per-view insight cache: one row per (user, dashboard range), upserted.
async function getAiInsightCache(email, range) {
  const userId = await userIdFor(email);
  const { data, error } = await db()
    .from('ai_insight_cache')
    .select('prefs_hash, data_hash, summary, generated_at')
    .eq('user_id', userId)
    .eq('range', range)
    .maybeSingle();
  if (error) fail(error, 'loading insight cache');
  if (!data) return null;
  return {
    prefsHash: data.prefs_hash,
    dataHash: data.data_hash,
    summary: data.summary,
    generatedAt: data.generated_at
  };
}

// Wipe every cached insight for a user - called when a platform connects
// or the tracked metrics change, so the next view regenerates fresh.
async function clearAiInsightCache(email) {
  const userId = await userIdFor(email);
  const { error } = await db().from('ai_insight_cache').delete().eq('user_id', userId);
  if (error) fail(error, 'clearing insight cache');
}

async function saveAiInsightCache(email, range, entry) {
  const userId = await userIdFor(email);
  const { error } = await db()
    .from('ai_insight_cache')
    .upsert(
      {
        user_id: userId,
        range,
        prefs_hash: entry.prefsHash,
        data_hash: entry.dataHash,
        summary: entry.summary,
        generated_at: entry.generatedAt
      },
      { onConflict: 'user_id,range' }
    );
  if (error) fail(error, 'saving insight cache');
}

// --- Ad-management audit log ---

// --- Workspaces (multi-tenant, invite-only) ---
// A workspace owns the ad connections; members are 'owner' (agency) or
// 'client' (invited). Clients read their workspace's data through the
// owner's connections and never OAuth themselves.

function assembleMembership(row) {
  return {
    id: row.workspace_id,
    role: row.role,
    name: row.workspaces ? row.workspaces.name : null,
    billingExempt: row.workspaces ? row.workspaces.billing_exempt : false
  };
}

async function listMemberships(email) {
  const userId = await userIdFor(email);
  const { data, error } = await db()
    .from('workspace_members')
    .select('workspace_id, role, workspaces ( name, billing_exempt )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) fail(error, 'loading workspaces');
  return (data || []).map(assembleMembership);
}

// The first owner of a workspace is the account whose OAuth connections the
// workspace's clients read through.
async function workspaceOwnerEmail(workspaceId) {
  const { data, error } = await db()
    .from('workspace_members')
    .select('users ( email )')
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) fail(error, 'looking up the workspace owner');
  return data && data.users ? data.users.email : null;
}

// ---- Studio: platform keys, budgets, spend ledger, jobs ----

const monthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

const jobRow = (d) =>
  d && {
    id: d.id,
    workspaceId: d.workspace_id,
    status: d.status,
    cost: Number(d.cost || 0),
    model: d.model,
    templateId: d.template_id,
    spec: d.spec,
    inputs: d.inputs,
    placements: d.placements || {},
    createdAt: d.created_at,
    updatedAt: d.updated_at
  };

async function createWorkspace(name, managed) {
  const { data, error } = await db()
    .from('workspaces')
    .insert({ name: String(name).slice(0, 80), managed: managed !== false })
    .select('id, name, managed')
    .single();
  if (error) fail(error, 'creating the workspace');
  return { id: data.id, name: data.name, managed: data.managed !== false };
}

async function addWorkspaceMember(workspaceId, email, role) {
  const user = await getUser(email.toLowerCase());
  if (!user) throw new Error('No Pulse account with that email yet — send them an invite link instead.');
  const { error } = await db()
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: user.id, role }, { onConflict: 'workspace_id,user_id' });
  if (error) fail(error, 'adding the member');
}

async function getMetricsConfig(workspaceId) {
  const { data, error } = await db().from('workspaces').select('metrics_config').eq('id', workspaceId).maybeSingle();
  if (error) fail(error, 'loading metrics config');
  return (data && data.metrics_config) || null;
}

async function saveMetricsConfig(workspaceId, config) {
  const { error } = await db().from('workspaces').update({ metrics_config: config }).eq('id', workspaceId);
  if (error) fail(error, 'saving metrics config');
}

// --- Leadly Studio records (jobs, chains, motion runs, uploads, docs, brands) ---
// One generic JSON-document table (see migration 010): every Studio concept
// is a small blob read back whole, by id or newest-first, always per-user.

async function getStudioRecord(email, kind, id) {
  const userId = await userIdFor(email);
  const { data, error } = await db()
    .from('studio_records')
    .select('data')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error, `loading studio ${kind}`);
  return data ? data.data : null;
}

async function putStudioRecord(email, kind, id, record) {
  const userId = await userIdFor(email);
  const { error } = await db()
    .from('studio_records')
    .upsert(
      { user_id: userId, kind, id, data: record, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,kind,id' }
    );
  if (error) fail(error, `saving studio ${kind}`);
}

// --- Alert rules (created by the AI assistant) ---

async function userIdFor(email) {
  const { data: u, error } = await db()
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) fail(error, 'looking up user');
  if (!u) throw new Error('User not found.');
  return u.id;
}

function assembleRule(row) {
  return {
    id: row.id,
    metric: row.metric,
    channel: row.channel,
    comparison: row.comparison,
    threshold: Number(row.threshold),
    timeframe: row.timeframe,
    enabled: row.enabled,
    description: row.description,
    createdAt: row.created_at
  };
}

// Persists the (mutated) user object. Provider rows are upserted and their
// child rows replaced wholesale, which reproduces the Blobs semantics
// exactly - e.g. reconnecting Meta replaces the whole provider object,
// clearing any previous metric selection.
async function saveUser(user) {
  let userId = user.id;
  if (!userId) {
    const { data: u, error } = await db()
      .from('users')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    if (error) fail(error, 'looking up user');
    if (!u) throw new Error('User not found.');
    userId = u.id;
  }

  for (const provider of PROVIDERS) {
    const acc = user.accounts && user.accounts[provider];

    if (!acc) {
      const { error } = await db()
        .from('connected_accounts')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider);
      if (error) fail(error, `removing ${provider} connection`);
      continue;
    }

    const connectionRow = {
      user_id: userId,
      provider,
      access_token: acc.accessToken || null,
      refresh_token: acc.refreshToken || null,
      selected_ad_account_id: acc.selectedAdAccountId || null,
      connected_at: acc.connectedAt || null,
      can_manage: acc.canManage === undefined ? null : acc.canManage
    };
    let { data: row, error: upsertError } = await db()
      .from('connected_accounts')
      .upsert(connectionRow, { onConflict: 'user_id,provider' })
      .select('id')
      .single();
    // Migration 009 adds can_manage; until it's run, retry without it.
    if (upsertError && /can_manage/.test(upsertError.message || '')) {
      console.error(`[store] connected_accounts.can_manage missing - run migration 009: ${upsertError.message}`);
      delete connectionRow.can_manage;
      ({ data: row, error: upsertError } = await db()
        .from('connected_accounts')
        .upsert(connectionRow, { onConflict: 'user_id,provider' })
        .select('id')
        .single());
    }
    if (upsertError) fail(upsertError, `saving ${provider} connection`);

    const { error: delAdsError } = await db()
      .from('ad_accounts')
      .delete()
      .eq('connected_account_id', row.id);
    if (delAdsError) fail(delAdsError, `clearing ${provider} ad accounts`);

    if (acc.adAccounts && acc.adAccounts.length) {
      const rows = acc.adAccounts.map((a, i) => ({
        connected_account_id: row.id,
        external_id: a.id,
        name: a.name,
        position: i,
        login_customer_id: a.loginCustomerId || null
      }));
      let { error } = await db().from('ad_accounts').insert(rows);
      // Migration 007 adds login_customer_id; until it's run, retry without
      // the column so connecting still works (MCC routing just won't stick).
      if (error && /login_customer_id/.test(error.message || '')) {
        console.error(
          `[store] ad_accounts.login_customer_id missing - run migration 007. Saving without it: ${error.message}`
        );
        ({ error } = await db()
          .from('ad_accounts')
          .insert(rows.map(({ login_customer_id, ...rest }) => rest)));
      }
      if (error) fail(error, `saving ${provider} ad accounts`);
    }

    const { error: delMetricsError } = await db()
      .from('selected_metrics')
      .delete()
      .eq('connected_account_id', row.id);
    if (delMetricsError) fail(delMetricsError, `clearing ${provider} metrics`);

    if (acc.selectedMetrics && acc.selectedMetrics.length) {
      const { error } = await db()
        .from('selected_metrics')
        .insert(
          acc.selectedMetrics.map((m, i) => ({
            connected_account_id: row.id,
            metric_id: m.id,
            label: m.label,
            position: i,
            target_cost_per: m.targetCostPer != null ? m.targetCostPer : null
          }))
        );
      if (error) fail(error, `saving ${provider} metrics`);
    }
  }
}

module.exports = {
  getUser,
  createUser,
  saveUser,
  setPassword,
  saveAiPrefs,
  getAiInsightCache,
  saveAiInsightCache,
  clearAiInsightCache,
  getStudioRecord,
  putStudioRecord,
  listMemberships,
  getMetricsConfig,
  saveMetricsConfig,
  workspaceOwnerEmail,
  createWorkspace,
  addWorkspaceMember
};
