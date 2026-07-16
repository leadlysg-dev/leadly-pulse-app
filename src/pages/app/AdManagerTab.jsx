import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useShell } from '../../components/Shell';

const money = (v) => 'S$' + (v || 0).toLocaleString('en-SG', { maximumFractionDigits: v >= 100 ? 0 : 2 });
const LOCK_TIP = 'Managed by Leadly — ask Pulse to request a change';
const THUMBS = ['t1', 't2', 't3', 't4', 't5', 't6'];

// One campaign row: creative thumb tile, status pill, inline-editable daily
// budget (dashed hover affordance), per-row on/off switch. Clients see the
// controls disabled with the "ask Pulse" tooltip.
function Row({ c, i, locked, checked, onCheck, onBudget, onToggle, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isOn = c.status === 'active';
  const counts = c.children?.length
    ? `${c.children.length} ad set${c.children.length > 1 ? 's' : ''} · ${c.children.reduce((a, s) => a + (s.children?.length || 0), 0)} ads`
    : '';

  const commit = () => {
    setEditing(false);
    const v = parseFloat(draft);
    if (isFinite(v) && v > 0 && v !== c.budget?.amount) onBudget(c, v);
  };

  return (
    <tr>
      <td style={{ width: 36 }}>
        <button
          type="button"
          className={`cb${checked ? ' on' : ''}`}
          aria-label={`Select ${c.name}`}
          disabled={locked}
          onClick={() => onCheck(c)}
        />
      </td>
      <td>
        <div className="adm-name-cell">
          <div className={`adm-thumb ${THUMBS[i % THUMBS.length]}`}>{c.channel === 'google' ? 'RSA' : i % 2 ? 'IMG' : '▶'}</div>
          <div>
            <div className="tname">{c.name}</div>
            <div className="tsub">
              <span className="plat">
                <span className={`dot ${c.channel}`} />
                {c.channel === 'meta' ? 'Meta' : 'Google'}
              </span>
              {counts ? ` · ${counts}` : ''}
            </div>
          </div>
        </div>
      </td>
      <td>
        <span className={`pill ${isOn ? 'live' : 'paused'}`}>{isOn ? 'Live' : 'Paused'}</span>
      </td>
      <td className="num">
        {c.budget && c.editableBudget ? (
          editing && !locked ? (
            <input
              className="budget-input"
              autoFocus
              inputMode="decimal"
              defaultValue={c.budget.amount}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              aria-label={`Daily budget for ${c.name}`}
            />
          ) : (
            <span className={locked ? 'locktip' : ''} data-tip={locked ? LOCK_TIP : undefined}>
              <button type="button" className="budget-edit" disabled={locked || busy} onClick={() => { setDraft(String(c.budget.amount)); setEditing(true); }}>
                {money(c.budget.amount)}
                {c.budget.type === 'daily' ? '' : ' total'} ✎
              </button>
            </span>
          )
        ) : (
          <span className="section-sub">—</span>
        )}
      </td>
      <td className="num">{money(c.metrics?.spend || 0)}</td>
      <td className="num">{c.metrics?.ctr != null ? `${c.metrics.ctr.toFixed(2)}%` : '—'}</td>
      <td className="num">{c.metrics?.conversions ?? '—'}</td>
      <td className="num">{c.metrics?.cpa != null ? money(c.metrics.cpa) : '—'}</td>
      <td>
        <span className={locked ? 'locktip' : ''} data-tip={locked ? LOCK_TIP : undefined}>
          <button
            type="button"
            className={`switch rowswitch${isOn ? ' on' : ''}`}
            role="switch"
            aria-checked={isOn}
            aria-label={`${c.name} on or off`}
            disabled={locked || busy}
            onClick={() => onToggle(c)}
          />
        </span>
      </td>
    </tr>
  );
}

export default function AdManagerTab() {
  const { range, role, toast } = useShell();
  const locked = role === 'client';

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    setSelected(new Set());
    try {
      const [meta, google] = await Promise.all([
        api.getManageTree(range, 'meta').catch(() => null),
        api.getManageTree(range, 'google').catch(() => null)
      ]);
      const all = [];
      for (const [channel, tree] of [['meta', meta], ['google', google]]) {
        if (tree?.state === 'ok') {
          for (const c of tree.campaigns || []) all.push({ ...c, channel, canManage: tree.canManage });
        }
      }
      setRows(all);
    } catch (err) {
      setError(err.message);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    return rows.filter(
      (c) =>
        (platform === 'all' || c.channel === platform) &&
        (statusFilter === 'all' || c.status === statusFilter) &&
        (!search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
    );
  }, [rows, platform, statusFilter, search]);

  const write = async (c, action, value) => {
    setBusy(true);
    try {
      let r = await api.manageEntity({ channel: c.channel, entityType: 'campaign', entityId: c.id, entityName: c.name, action, value });
      if (r.needsAck) {
        // the server-side guardrail: big budget moves need an explicit yes
        if (window.confirm(`${r.reason}\n\nGo ahead?`)) {
          r = await api.manageEntity({ channel: c.channel, entityType: 'campaign', entityId: c.id, entityName: c.name, action, value, acknowledged: true });
        } else {
          setBusy(false);
          return;
        }
      }
      if (r.error) throw new Error(r.error);
      toast(action === 'set_status' ? (value === 'paused' ? `${c.name} paused.` : `${c.name} is live.`) : `${c.name} budget → ${money(value)}/day.`);
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action, value) => {
    const entities = rows.filter((c) => selected.has(`${c.channel}:${c.id}`));
    // bulk runs per channel through the same validated write path
    setBusy(true);
    try {
      for (const channel of ['meta', 'google']) {
        const list = entities.filter((c) => c.channel === channel);
        if (!list.length) continue;
        const r = await api.manageBulk({
          channel,
          entityType: 'campaign',
          action,
          value,
          acknowledged: true,
          entities: list.map((c) => ({ id: c.id, name: c.name }))
        });
        if (r.error) throw new Error(r.error);
      }
      toast(action === 'set_status' ? `${entities.length} paused.` : `${entities.length} budgets updated.`);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const bulkBudgets = () => {
    const v = window.prompt('Set the daily budget for every selected campaign to (S$):');
    const n = parseFloat(v);
    if (isFinite(n) && n > 0) bulk('set_budget', n);
  };

  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Platform">
          {[['all', 'All'], ['meta', 'Meta'], ['google', 'Google']].map(([id, label]) => (
            <button key={id} type="button" className={platform === id ? 'on' : ''} onClick={() => setPlatform(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Status">
          {[['all', 'Status: All'], ['active', 'Live'], ['paused', 'Paused']].map(([id, label]) => (
            <button key={id} type="button" className={statusFilter === id ? 'on' : ''} onClick={() => setStatusFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="pb-input" style={{ flex: '0 1 260px' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" />
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button type="button" className="sbtn sbtn-primary" onClick={() => setNewOpen((v) => !v)}>
            + New campaign
          </button>
          {newOpen && (
            <div className="scard" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 'var(--z-dropdown)', minWidth: 230, boxShadow: 'var(--shadow-pop)' }}>
              <a className="nav-item" style={{ color: 'var(--ink)' }} href="https://adsmanager.facebook.com" target="_blank" rel="noreferrer">
                <span className="dot meta" /> Create in Meta Ads Manager ↗
              </a>
              <a className="nav-item" style={{ color: 'var(--ink)' }} href="https://ads.google.com" target="_blank" rel="noreferrer">
                <span className="dot google" /> Create in Google Ads ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {selected.size > 0 && !locked && (
        <div className="bulkbar">
          <span>{selected.size} selected</span>
          <button type="button" className="sbtn sbtn-ghost sbtn-sm" disabled={busy} onClick={() => bulk('set_status', 'paused')}>
            Pause
          </button>
          <button type="button" className="sbtn sbtn-ghost sbtn-sm" onClick={() => toast('Duplicate is coming soon.')}>
            Duplicate
          </button>
          <button type="button" className="sbtn sbtn-ghost sbtn-sm" disabled={busy} onClick={bulkBudgets}>
            Edit budgets
          </button>
        </div>
      )}

      {error && (
        <div className="scard" style={{ padding: 16 }}>
          <span className="section-sub">Couldn’t load campaigns: {error}</span>
        </div>
      )}
      {!rows && !error && (
        <div className="scard" style={{ padding: 24 }}>
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}

      {rows && (
        <div className="scard" style={{ overflow: 'hidden' }}>
          <table className="spec-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Campaign / top creative</th>
                <th>Status</th>
                <th className="num">Daily budget</th>
                <th className="num">Spend</th>
                <th className="num">CTR</th>
                <th className="num">Leads</th>
                <th className="num">CPL</th>
                <th>On/Off</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan="9">
                    <span className="section-sub">No campaigns match these filters.</span>
                  </td>
                </tr>
              )}
              {visible.map((c, i) => (
                <Row
                  key={`${c.channel}:${c.id}`}
                  c={c}
                  i={i}
                  locked={locked || !c.canManage}
                  busy={busy}
                  checked={selected.has(`${c.channel}:${c.id}`)}
                  onCheck={(row) =>
                    setSelected((cur) => {
                      const next = new Set(cur);
                      const k = `${row.channel}:${row.id}`;
                      next.has(k) ? next.delete(k) : next.add(k);
                      return next;
                    })
                  }
                  onBudget={(row, v) => write(row, 'set_budget', v)}
                  onToggle={(row) => write(row, 'set_status', row.status === 'active' ? 'paused' : 'active')}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {locked && (
        <p className="section-sub" style={{ marginTop: 10 }}>
          Your campaigns are managed by Leadly. Ask Pulse (on the Pulse tab) to request any change — budgets, pausing,
          new ads — and the team is notified instantly.
        </p>
      )}
    </>
  );
}
