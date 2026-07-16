import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { money, number, percent } from '../lib/format';
import TopNav from '../components/TopNav';
import DateRangePicker, { REPORT_RANGES } from '../components/DateRangePicker';
import Banner from '../components/Banner';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import './Manage.css';

const CHANNELS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google', label: 'Google' }
];
const TYPE_LABEL = { campaign: 'Campaign', adset: 'Ad set', adgroup: 'Ad group', ad: 'Ad' };
const fmtTime = (iso) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

// Flatten the tree respecting expansion, filters and per-level sorting.
function flatten(campaigns, expanded, statusFilter, hideZeroSpend, sort) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const valueOf = (n) =>
    sort.key === 'name' ? n.name || '' : sort.key === 'budget' ? n.budget?.amount ?? -1 : n.metrics?.[sort.key] ?? -1;
  const order = (list) =>
    [...list].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      return typeof av === 'string' ? av.localeCompare(bv) * dir : ((av ?? -1) - (bv ?? -1)) * dir;
    });
  const keep = (n) =>
    (statusFilter === 'all' || n.status === statusFilter) && (!hideZeroSpend || (n.metrics?.spend || 0) > 0);

  const rows = [];
  order(campaigns).forEach((c) => {
    if (!keep(c)) return;
    rows.push({ node: c, depth: 0 });
    if (expanded.has(c.id)) {
      order(c.children).forEach((g) => {
        if (!keep(g)) return;
        rows.push({ node: g, depth: 1 });
        if (expanded.has(g.id)) {
          order(g.children).forEach((ad) => {
            if (keep(ad)) rows.push({ node: ad, depth: 2 });
          });
        }
      });
    }
  });
  return rows;
}

// The one confirmation gate every write passes through. `pending` is
// { title, account, lines: [{name, old, next}], warn?, onConfirm }.
function ConfirmModal({ pending, onClose }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pending) return null;
  const needAck = !!pending.warn;
  return (
    <div className="manage-modal-backdrop" role="dialog" aria-modal="true" aria-label={pending.title}>
      <div className="card manage-modal">
        <h3>{pending.title}</h3>
        <p className="manage-modal-account">
          Account: <strong>{pending.account}</strong>
        </p>
        <ul className="manage-modal-lines">
          {pending.lines.map((l, i) => (
            <li key={i}>
              <span className="manage-modal-name">{l.name}</span>
              <span className="manage-modal-change">
                {l.old != null && <s>{l.old}</s>} <strong>→ {l.next}</strong>
              </span>
            </li>
          ))}
        </ul>
        {needAck && (
          <label className="manage-modal-warn">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              <strong>Large change:</strong> {pending.warn}. I understand and want to apply it.
            </span>
          </label>
        )}
        <div className="manage-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || (needAck && !ack)}
            onClick={async () => {
              setBusy(true);
              try {
                // onConfirm may replace this modal with a follow-up stage
                // (the guardrail acknowledgement) - it returns 'keep' so the
                // close here doesn't wipe it.
                const outcome = await pending.onConfirm();
                if (outcome !== 'keep') onClose();
              } finally {
                setBusy(false);
                setAck(false);
              }
            }}
          >
            {busy ? 'Applying…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Manage() {
  const [channel, setChannel] = useState('meta');
  const [view, setView] = useState('last_7d');
  const [status, setStatus] = useState(null);
  const [redirecting, setRedirecting] = useState(false);

  const [data, setData] = useState(null);
  const [dataError, setDataError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(new Map()); // id -> {id, name, type}
  const [statusFilter, setStatusFilter] = useState('all');
  const [hideZeroSpend, setHideZeroSpend] = useState(false);
  const [sort, setSort] = useState({ key: 'spend', dir: 'desc' });

  const [pending, setPending] = useState(null); // confirm modal payload
  const [editing, setEditing] = useState(null); // {id, kind:'budget'|'bid', value}
  const [toast, setToast] = useState('');
  const [audit, setAudit] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  const requestId = useRef(0);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.getStatus();
      if (!s.loggedIn) {
        setRedirecting(true);
        window.location.href = '/login.html';
        return;
      }
      setStatus(s);
    } catch {
      /* tree load carries its own error state */
    }
  }, []);

  const load = useCallback(async (nextView, nextChannel) => {
    const id = ++requestId.current;
    setDataError(null);
    setRefreshing(true);
    try {
      const result = await api.getManageTree(nextView, nextChannel);
      if (id !== requestId.current) return;
      setData(result);
      setSelected(new Map());
    } catch (err) {
      if (id === requestId.current) setDataError(err.message);
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);

  const loadAudit = useCallback(() => {
    api.getAuditLog().then(setAudit, () => setAudit({ entries: [], unavailable: true }));
  }, []);

  useEffect(() => {
    loadStatus();
    loadAudit();
  }, [loadStatus, loadAudit]);
  useEffect(() => {
    load(view, channel);
  }, [view, channel, load]);

  const rows = useMemo(
    () => (data?.state === 'ok' ? flatten(data.campaigns, expanded, statusFilter, hideZeroSpend, sort) : []),
    [data, expanded, statusFilter, hideZeroSpend, sort]
  );

  if (redirecting) return null;

  const canManage = data?.canManage === true;
  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  // Optimistic status flip with revert on failure.
  function patchStatus(id, next) {
    setData((d) => {
      const walk = (nodes) =>
        nodes.map((n) => ({ ...n, status: n.id === id ? next : n.status, children: walk(n.children || []) }));
      return { ...d, campaigns: walk(d.campaigns) };
    });
  }

  function confirmStatus(node) {
    const next = node.status === 'active' ? 'paused' : 'active';
    setPending({
      title: next === 'paused' ? `Pause ${TYPE_LABEL[node.type].toLowerCase()}` : `Enable ${TYPE_LABEL[node.type].toLowerCase()}`,
      account: data.accountName,
      lines: [{ name: node.name, old: node.status, next }],
      onConfirm: async () => {
        patchStatus(node.id, next);
        try {
          await api.manageEntity({ channel, entityType: node.type, entityId: node.id, action: 'set_status', value: next });
          flash(`${node.name} is now ${next}.`);
        } catch (err) {
          patchStatus(node.id, node.status);
          flash(`Failed: ${err.message}`);
        }
      }
    });
  }

  function confirmValueEdit(node, kind, newValue) {
    const old = kind === 'budget' ? node.budget?.amount : node.bid;
    const action = kind === 'budget' ? 'set_budget' : 'set_bid';
    const send = async (acknowledged) => {
      const res = await api.manageEntity({
        channel,
        entityType: node.type,
        entityId: node.id,
        action,
        value: newValue,
        acknowledged
      });
      if (res.needsAck) {
        // The server wants an explicit acknowledgement - swap this modal
        // for the warning stage and keep it open.
        setPending({
          title: kind === 'budget' ? 'Confirm large budget change' : 'Confirm bid change',
          account: data.accountName,
          warn: res.reason,
          lines: [{ name: node.name, old: money(res.oldValue ?? old ?? 0), next: money(newValue) }],
          onConfirm: () => send(true)
        });
        return 'keep';
      }
      flash(`${node.name}: ${res.oldValue} → ${res.newValue}${res.auditFailed ? ' (audit log failed — check function logs)' : ''}`);
      load(view, channel);
      loadAudit();
    };
    setPending({
      title: kind === 'budget' ? `Change ${node.budget?.type || 'daily'} budget` : 'Change bid / target',
      account: data.accountName,
      lines: [{ name: node.name, old: old != null ? money(old) : '—', next: money(newValue) }],
      onConfirm: () => send(false)
    });
  }

  function confirmBulk(action, opts = {}) {
    const entities = [...selected.values()];
    if (!entities.length) return;
    const types = new Set(entities.map((e) => e.type));
    if (types.size > 1) {
      flash('Select rows of one level at a time (all campaigns, or all ad sets…) for bulk actions.');
      return;
    }
    const entityType = entities[0].type;
    const title =
      action === 'set_status'
        ? opts.value === 'paused'
          ? `Pause ${entities.length} ${TYPE_LABEL[entityType].toLowerCase()}s`
          : `Enable ${entities.length} ${TYPE_LABEL[entityType].toLowerCase()}s`
        : opts.percent != null
          ? `Change ${entities.length} budgets by ${opts.percent > 0 ? '+' : ''}${opts.percent}%`
          : `Set ${entities.length} budgets to ${money(opts.value)}`;
    const send = async (acknowledged) => {
      const res = await api.manageBulk({
        channel,
        entityType,
        action,
        value: opts.value,
        percent: opts.percent,
        entities: entities.map((e) => ({ id: e.id, name: e.name })),
        acknowledged
      });
      const needAck = res.results.filter((r) => r.needsAck);
      const failed = res.results.filter((r) => r.error);
      const okCount = res.results.filter((r) => r.ok).length;
      if (needAck.length && !acknowledged) {
        setPending({
          title: 'Confirm large budget changes',
          account: data.accountName,
          warn: needAck[0].reason,
          lines: needAck.map((r) => {
            const name = (entities.find((e) => String(e.id) === String(r.id)) || {}).name || r.id;
            return { name, old: money(r.oldValue ?? 0), next: money(r.newValue ?? opts.value ?? 0) };
          }),
          onConfirm: () => send(true)
        });
        if (okCount) flash(`${okCount} applied; ${needAck.length} need an extra confirmation.`);
        return 'keep';
      }
      flash(failed.length ? `${okCount} applied, ${failed.length} failed (first: ${failed[0].error})` : `${okCount} change${okCount === 1 ? '' : 's'} applied.`);
      setSelected(new Map());
      load(view, channel);
      loadAudit();
    };
    setPending({
      title,
      account: data.accountName,
      lines: entities.map((e) => ({
        name: e.name,
        old: action === 'set_status' ? e.status : e.budget != null ? money(e.budget) : null,
        next: action === 'set_status' ? opts.value : opts.percent != null ? `${opts.percent > 0 ? '+' : ''}${opts.percent}%` : money(opts.value)
      })),
      onConfirm: () => send(false)
    });
  }

  function bulkBudgetPrompt() {
    const raw = window.prompt('Set budgets. Enter an amount (e.g. 50) or a percent change (e.g. +20% or -30%):', '');
    if (raw == null) return;
    const text = raw.trim();
    const pctMatch = text.match(/^([+-]?\d+(?:\.\d+)?)\s*%$/);
    if (pctMatch) {
      confirmBulk('set_budget', { percent: Number(pctMatch[1]) });
      return;
    }
    const amount = Number(text.replace(/^\$/, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      flash('Enter a positive amount like 50, or a percent like +20%.');
      return;
    }
    confirmBulk('set_budget', { value: amount });
  }

  const arrow = (key) => (sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '');
  const setSortKey = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  return (
    <div className="manage-page">
      <TopNav email={status?.email} />
      <main className="manage-main">
        <h1 className="visually-hidden">Manage</h1>

        <div className="card report-controls">
          <div className="report-control-row">
            <span className="report-control-label">Channel</span>
            <div className="range-picker" role="group" aria-label="Channel">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`range-picker-option${channel === c.value ? ' selected' : ''}`}
                  aria-pressed={channel === c.value}
                  onClick={() => setChannel(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="report-control-row">
            <span className="report-control-label">Period</span>
            <DateRangePicker value={view} onChange={setView} allowCustom presets={REPORT_RANGES} />
          </div>
        </div>

        {dataError && <ErrorState message={dataError} onRetry={() => load(view, channel)} />}
        {data?.state === 'not-connected' && (
          <EmptyState
            title={`${channel === 'meta' ? 'Meta' : 'Google'} isn't connected`}
            message="Connect the account in Settings to manage its campaigns here."
          />
        )}
        {data?.state === 'needs-reconnect' && (
          <Banner tone="warning">
            This connection has expired — reconnect {channel === 'meta' ? 'Meta' : 'Google'} in Settings to manage ads.
          </Banner>
        )}
        {data?.state === 'unavailable' && (
          <ErrorState message={`Couldn't load the account: ${data.error}`} onRetry={() => load(view, channel)} />
        )}
        {data?.state === 'ok' && !canManage && (
          <Banner tone="warning">
            This account is connected read-only — reconnect with a user who can manage ads to enable pause, budget and
            bid controls.
          </Banner>
        )}

        {data?.state === 'ok' && (
          <div className={`manage-body${refreshing ? ' is-refreshing' : ''}`}>
            <div className="manage-toolbar">
              <span className="manage-account">
                {data.accountName} <span className="manage-account-id">{data.accountId}</span>
              </span>
              <select
                className="manage-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Status filter"
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="paused">Paused only</option>
              </select>
              <label className="manage-zero">
                <input type="checkbox" checked={hideZeroSpend} onChange={(e) => setHideZeroSpend(e.target.checked)} />
                Hide zero-spend
              </label>
            </div>

            {selected.size > 0 && (
              <div className="manage-bulkbar card" role="toolbar" aria-label="Bulk actions">
                <span>{selected.size} selected</span>
                <button type="button" className="btn btn-secondary" onClick={() => confirmBulk('set_status', { value: 'paused' })}>
                  Pause
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => confirmBulk('set_status', { value: 'active' })}>
                  Enable
                </button>
                <button type="button" className="btn btn-secondary" onClick={bulkBudgetPrompt}>
                  Budget…
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Map())}>
                  Clear
                </button>
              </div>
            )}

            <div className="card manage-table-card">
              <div className="manage-table-scroll">
                <table className="manage-table">
                  <caption className="visually-hidden">Campaigns, ad sets and ads</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="manage-col-check" aria-label="Select" />
                      <th scope="col" className="manage-col-name">
                        <button type="button" onClick={() => setSortKey('name')}>Name{arrow('name')}</button>
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <button type="button" onClick={() => setSortKey('budget')}>Budget{arrow('budget')}</button>
                      </th>
                      <th scope="col">Bid</th>
                      <th scope="col"><button type="button" onClick={() => setSortKey('spend')}>Spend{arrow('spend')}</button></th>
                      <th scope="col"><button type="button" onClick={() => setSortKey('impressions')}>Impr.{arrow('impressions')}</button></th>
                      <th scope="col"><button type="button" onClick={() => setSortKey('clicks')}>Clicks{arrow('clicks')}</button></th>
                      <th scope="col">CTR</th>
                      <th scope="col">CPC</th>
                      <th scope="col"><button type="button" onClick={() => setSortKey('conversions')}>Conv.{arrow('conversions')}</button></th>
                      <th scope="col"><button type="button" onClick={() => setSortKey('cpa')}>CPA{arrow('cpa')}</button></th>
                      <th scope="col"><button type="button" onClick={() => setSortKey('roas')}>ROAS{arrow('roas')}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ node, depth }) => {
                      const m = node.metrics || {};
                      const hasChildren = (node.children || []).length > 0;
                      const isOpen = expanded.has(node.id);
                      const isEditingBudget = editing?.id === node.id && editing.kind === 'budget';
                      const isEditingBid = editing?.id === node.id && editing.kind === 'bid';
                      return (
                        <tr key={`${node.type}:${node.id}`} className={`manage-row depth-${depth}`}>
                          <td className="manage-col-check">
                            <input
                              type="checkbox"
                              aria-label={`Select ${node.name}`}
                              checked={selected.has(node.id)}
                              onChange={(e) => {
                                const next = new Map(selected);
                                if (e.target.checked) {
                                  next.set(node.id, { id: node.id, name: node.name, type: node.type, status: node.status, budget: node.budget?.amount });
                                } else {
                                  next.delete(node.id);
                                }
                                setSelected(next);
                              }}
                            />
                          </td>
                          <th scope="row" className="manage-col-name" style={{ paddingLeft: `${8 + depth * 22}px` }}>
                            {hasChildren ? (
                              <button
                                type="button"
                                className="manage-expander"
                                aria-expanded={isOpen}
                                onClick={() => {
                                  const next = new Set(expanded);
                                  if (isOpen) next.delete(node.id);
                                  else next.add(node.id);
                                  setExpanded(next);
                                }}
                              >
                                {isOpen ? '▾' : '▸'}
                              </button>
                            ) : (
                              <span className="manage-expander-spacer" />
                            )}
                            <span className="manage-name" title={node.name}>{node.name}</span>
                            <span className="manage-type">{TYPE_LABEL[node.type]}</span>
                          </th>
                          <td>
                            <button
                              type="button"
                              className={`manage-status ${node.status}`}
                              disabled={!canManage}
                              title={canManage ? (node.status === 'active' ? 'Pause' : 'Enable') : 'Read-only connection'}
                              onClick={() => confirmStatus(node)}
                            >
                              <span className="manage-status-dot" aria-hidden="true" />
                              {node.status === 'active' ? 'Active' : 'Paused'}
                            </button>
                          </td>
                          <td className="manage-num">
                            {isEditingBudget ? (
                              <span className="manage-edit">
                                $
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editing.value}
                                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setEditing(null);
                                    if (e.key === 'Enter' && Number(editing.value) > 0) {
                                      setEditing(null);
                                      confirmValueEdit(node, 'budget', Number(editing.value));
                                    }
                                  }}
                                  onBlur={() => setEditing(null)}
                                />
                              </span>
                            ) : node.budget?.amount != null ? (
                              <button
                                type="button"
                                className="manage-value"
                                disabled={!canManage || !node.editableBudget}
                                title={node.budget.type === 'lifetime' ? 'Lifetime budget' : 'Daily budget'}
                                onClick={() => setEditing({ id: node.id, kind: 'budget', value: node.budget.amount })}
                              >
                                {money(node.budget.amount)}
                                <span className="manage-value-kind">/{node.budget.type === 'lifetime' ? 'life' : 'day'}</span>
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="manage-num">
                            {isEditingBid ? (
                              <span className="manage-edit">
                                $
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editing.value}
                                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setEditing(null);
                                    if (e.key === 'Enter' && Number(editing.value) > 0) {
                                      setEditing(null);
                                      confirmValueEdit(node, 'bid', Number(editing.value));
                                    }
                                  }}
                                  onBlur={() => setEditing(null)}
                                />
                              </span>
                            ) : node.bid != null ? (
                              <button
                                type="button"
                                className="manage-value"
                                disabled={!canManage || !node.editableBid}
                                title={node.bidKind === 'target_cpa' ? 'Target CPA' : 'Bid'}
                                onClick={() => setEditing({ id: node.id, kind: 'bid', value: node.bid })}
                              >
                                {money(node.bid)}
                                {node.bidKind === 'target_cpa' && <span className="manage-value-kind">tCPA</span>}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="manage-num">{money(m.spend || 0)}</td>
                          <td className="manage-num">{number(m.impressions || 0)}</td>
                          <td className="manage-num">{number(m.clicks || 0)}</td>
                          <td className="manage-num">{m.ctr == null ? '—' : percent(m.ctr)}</td>
                          <td className="manage-num">{m.cpc == null ? '—' : money(m.cpc)}</td>
                          <td className="manage-num">{number(m.conversions || 0)}</td>
                          <td className="manage-num">{m.cpa == null ? '—' : money(m.cpa)}</td>
                          <td className="manage-num">{m.roas == null ? '—' : `${m.roas}x`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && <p className="manage-empty">No entities match the current filters.</p>}
              </div>
            </div>

            <p className="manage-footnote">
              Conversions on Meta = your primary tracked metric ({data.primaryMetric}); on Google = the account's
              conversions column. Budget guardrails: extra confirmation over ±{data.guardrails.pct}% or above{' '}
              {money(data.guardrails.ceiling)}.
            </p>

            <section className="manage-audit">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAudit((s) => !s)} aria-expanded={showAudit}>
                {showAudit ? 'Hide change history' : `Change history${audit?.entries?.length ? ` (${audit.entries.length})` : ''}`}
              </button>
              {showAudit && (
                <div className="card manage-audit-card">
                  {audit?.unavailable && <p className="manage-empty">The audit log isn't available — run migration 009.</p>}
                  {audit?.entries?.length === 0 && !audit.unavailable && <p className="manage-empty">No changes recorded yet.</p>}
                  {audit?.entries?.length > 0 && (
                    <table className="manage-table manage-audit-table">
                      <caption className="visually-hidden">Change history</caption>
                      <thead>
                        <tr>
                          <th scope="col">When</th>
                          <th scope="col">Channel</th>
                          <th scope="col">Entity</th>
                          <th scope="col">Action</th>
                          <th scope="col">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.entries.map((e, i) => (
                          <tr key={i}>
                            <td>{fmtTime(e.createdAt)}</td>
                            <td>{e.channel === 'meta' ? 'Meta' : 'Google'}</td>
                            <td className="manage-col-name" title={`${e.entityType} ${e.entityId} on ${e.accountId}`}>
                              {e.entityName || e.entityId}
                            </td>
                            <td>{e.action.replace('set_', '')}</td>
                            <td>
                              {e.oldValue} → {e.newValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {toast && (
          <div className="manage-toast card" role="status">
            {toast}
          </div>
        )}
        <ConfirmModal pending={pending} onClose={() => setPending(null)} />
      </main>
    </div>
  );
}
