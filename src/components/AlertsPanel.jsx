import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import ErrorState from './ErrorState';
import './AlertsPanel.css';

function AlertRow({ rule, onToggle, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <li className="alert-row">
      <div className="alert-row-main">
        <div className="alert-row-copy">
          <span className={`alert-row-desc${rule.enabled ? '' : ' is-off'}`}>{rule.description}</span>
          <span className="alert-row-sub">{rule.enabled ? 'On' : 'Off'}</span>
        </div>
        <div className="alert-row-actions">
          <button
            type="button"
            role="switch"
            aria-checked={rule.enabled}
            aria-label={`Alert: ${rule.description}`}
            className={`toggle${rule.enabled ? ' toggle-on' : ''}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onToggle(rule, !rule.enabled);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="toggle-knob" />
          </button>
          <button
            type="button"
            className="alert-row-delete"
            aria-label={`Delete alert: ${rule.description}`}
            disabled={busy}
            onClick={() => setConfirming((c) => !c)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      {confirming && (
        <div className="alert-row-confirm">
          <span>Delete this alert?</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete(rule);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

// The My Alerts list, unchanged from the standalone Assistant page. Bump
// reloadToken (any changing value) to make it refetch - Pulse does this
// when the chat creates a rule.
export default function AlertsPanel({ reloadToken = 0 }) {
  const [rules, setRules] = useState(null);
  const [rulesError, setRulesError] = useState(null);

  const loadRules = useCallback(async () => {
    setRulesError(null);
    try {
      const result = await api.listAlerts();
      setRules(result.rules);
    } catch (err) {
      setRulesError(err.message);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules, reloadToken]);

  async function toggleRule(rule, enabled) {
    await api.updateAlert(rule.id, enabled);
    setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
  }

  async function deleteRule(rule) {
    await api.deleteAlert(rule.id);
    setRules((rs) => rs.filter((r) => r.id !== rule.id));
  }

  return (
    <section className="alerts-panel" aria-label="My alerts">
      <h2>My Alerts</h2>
      <p className="alerts-panel-note">
        Alert delivery is coming soon — rules you save here are ready and will go live when it ships.
      </p>

      {rulesError && <ErrorState message={rulesError} onRetry={loadRules} />}

      {!rulesError && rules === null && (
        <div className="card alerts-loading" aria-hidden="true">
          <div className="skeleton alerts-skeleton-row" />
          <div className="skeleton alerts-skeleton-row" />
        </div>
      )}

      {!rulesError && rules && rules.length === 0 && (
        <div className="card alerts-empty">
          <p>No alerts yet.</p>
          <p className="alerts-empty-sub">Ask the assistant to watch a number for you.</p>
        </div>
      )}

      {!rulesError && rules && rules.length > 0 && (
        <ul className="card alerts-list">
          {rules.map((rule) => (
            <AlertRow key={rule.id} rule={rule} onToggle={toggleRule} onDelete={deleteRule} />
          ))}
        </ul>
      )}
    </section>
  );
}
