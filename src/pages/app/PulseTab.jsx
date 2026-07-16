import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useShell } from '../../components/Shell';

const money = (v) => 'S$' + (v || 0).toLocaleString('en-SG', { maximumFractionDigits: v >= 100 ? 0 : 2 });

// Rotating status messages per chip — copied verbatim from the spec's gen
// object. Unknown / generated questions fall back to the "today" set.
const STEPS = {
  today: ['Adding up today’s numbers…', 'Checking Facebook and Google…', 'Comparing with your usual week…'],
  cpl: ['Working out your cost per lead…', 'Checking each ad…', 'Comparing this week to last…'],
  best: ['Lining up all your ads…', 'Checking cost and results…', 'Picking the winner…'],
  alert: ['Looking at where things usually go wrong…', 'Setting up the watch…']
};

// The four defaults — labels and colour classes verbatim from the spec;
// used whenever the morning generation hasn't produced today's set.
const DEFAULT_CHIPS = [
  { key: 'today', color: 'c-green', label: 'How did my ads do today?' },
  { key: 'cpl', color: 'c-cobalt', label: 'What’s my cost per lead?' },
  { key: 'best', color: 'c-purple', label: 'Which ad is doing best?' },
  { key: 'alert', color: 'c-amber', label: 'Warn me if something goes wrong' }
];

// **bold** → <b>, with everything else escaped — answers stay plain text
// with tabular-nums numbers, never raw HTML from the model.
function RichText({ text }) {
  const parts = String(text || '').split(/\*\*/);
  return <p>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</p>;
}

function Spark({ values }) {
  const pts = useMemo(() => {
    const v = values && values.length > 1 ? values : [0, 0];
    const max = Math.max(...v, 1);
    const min = Math.min(...v, 0);
    const span = max - min || 1;
    return v.map((y, i) => `${((i / (v.length - 1)) * 88).toFixed(1)},${(24 - ((y - min) / span) * 19 + 1).toFixed(1)}`);
  }, [values]);
  return (
    <svg className="spark" viewBox="0 0 88 26" aria-hidden="true">
      <polygon className="fill" points={`${pts.join(' ')} 88,26 0,26`} />
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

function Delta({ pct, goodUp }) {
  if (pct === null || !isFinite(pct)) return <span className="delta flat">—</span>;
  const good = goodUp === null ? null : pct >= 0 === goodUp;
  const cls = good === null ? 'flat' : good ? 'up' : 'down';
  return (
    <span className={`delta ${cls}`}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* ── The Pulse AI bar — exists on this tab only ────────────────── */
function PulseBar({ context }) {
  const { role, toast } = useShell();
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  const [phase, setPhase] = useState('idle'); // idle | loading | done
  const [statusMsg, setStatusMsg] = useState('Reading today’s numbers…');
  const [answer, setAnswer] = useState(null); // { reply, actions, alert, changeRequest }
  const [typed, setTyped] = useState('');
  const [question, setQuestion] = useState('');
  const timers = useRef([]);
  const clearTimers = () => {
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
  };

  useEffect(() => {
    let cancelled = false;
    api
      .pulseChips()
      .then((r) => {
        if (!cancelled && Array.isArray(r.chips) && r.chips.length === 4) setChips(r.chips);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, []);

  const run = useCallback(
    async (key, text) => {
      if (phase === 'loading') return;
      clearTimers();
      setPhase('loading');
      setAnswer(null);
      setTyped('');
      const steps = STEPS[key] || STEPS.today;
      let i = 0;
      setStatusMsg(steps[0]);
      timers.current.push(setInterval(() => {
        i = (i + 1) % steps.length;
        setStatusMsg(steps[i]);
      }, 850));

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const minWait = reduced ? 400 : 2100;
      const started = Date.now();
      let result;
      try {
        result = await api.pulseChat({ message: text, chip: key, context, role });
      } catch (err) {
        result = { reply: `I couldn't reach your numbers just now (${err.message}). Try again in a moment.`, actions: [] };
      }
      const remaining = Math.max(0, minWait - (Date.now() - started));
      setTimeout(() => {
        clearTimers();
        setAnswer(result);
        setPhase('done');
        // stream the answer into the card
        const full = String(result.reply || '');
        if (reduced) return setTyped(full);
        let n = 0;
        timers.current.push(setInterval(() => {
          n = Math.min(full.length, n + 3);
          setTyped(full.slice(0, n));
          if (n >= full.length) clearTimers();
        }, 12));
      }, remaining);
    },
    [phase, context, role]
  );

  const act = async (a) => {
    if (a.kind === 'admanager') return (window.location.href = '/admanager.html');
    if (a.kind === 'studio') return (window.location.href = '/studio.html');
    if (a.kind === 'create_alert' && answer?.alert) {
      try {
        await api.createAlert(answer.alert);
        toast('Done — I’ll warn you the moment it happens.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    if (a.kind === 'change_request') {
      try {
        await api.changeRequestCreate({ request: a.request || question || typed.slice(0, 200) });
        toast('Sent to Leadly — they’ll action it shortly.');
      } catch (err) {
        toast(err.message);
      }
    }
  };

  return (
    <div className="pulse-bar" role="complementary" aria-label="Pulse assistant">
      <div className="pb-top">
        <div className="pb-mark">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M1 9h3l2-5 3 8 2-5h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="pb-input">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && question.trim() && run(null, question.trim())}
            placeholder="Ask about your ads — “why did CPL jump this week?”"
            aria-label="Ask Pulse about your ads"
          />
          <button
            type="button"
            className="sbtn sbtn-primary sbtn-sm"
            disabled={phase === 'loading'}
            onClick={() => question.trim() && run(null, question.trim())}
          >
            Ask
          </button>
        </div>
      </div>
      <div className="pb-hint">Pulse answers on your ad data — insights, chart explanations, and setting alerts.</div>
      <div className="pb-tidbits">
        {chips.map((c) => (
          <button key={c.label} type="button" className={`qchip ${c.color}`} disabled={phase === 'loading'} onClick={() => run(c.key, c.label)}>
            ✦ {c.label}
          </button>
        ))}
      </div>

      {phase !== 'idle' && (
        <div className="pb-answer">
          {phase === 'loading' && (
            <div className="pb-loading">
              <svg className="ekg" viewBox="0 0 120 24" aria-hidden="true">
                <path d="M0 12h28l6-8 8 16 7-12 5 4h66" fill="none" />
              </svg>
              <span className="pb-status">{statusMsg}</span>
            </div>
          )}
          {phase === 'done' && answer && (
            <div className="pb-result">
              <div className="pb-result-head">
                <span className="ai-reply-label">✦ Pulse</span>
                <span className="cache-note">Generated just now</span>
              </div>
              <RichText text={typed} />
              {typed.length >= String(answer.reply || '').length && (
                <div className="insight-act">
                  {(answer.actions || []).map((a, i) => (
                    <button key={i} type="button" className={`sbtn ${i === 0 ? 'sbtn-primary' : 'sbtn-ghost'} sbtn-sm`} onClick={() => act(a)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── The tab ───────────────────────────────────────────────────── */
export default function PulseTab() {
  const { range, toast } = useShell();
  const [platform, setPlatform] = useState('all');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    api
      .getReport(range)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const view = useMemo(() => {
    if (!report) return null;
    const meta = report.channels.meta;
    const google = report.channels.google;
    const googleOk = google.status === 'ok';
    const chans = platform === 'meta' ? [meta] : platform === 'google' ? (googleOk ? [google] : []) : [meta, ...(googleOk ? [google] : [])];
    const sum = (key) => chans.reduce((a, c) => a + (c.totals[key] || 0), 0);
    const sumPrev = (key) => chans.reduce((a, c) => a + (c.previous[key] || 0), 0);
    const daily = (key) => {
      const n = report.dates.length;
      return Array.from({ length: n }, (_, i) => chans.reduce((a, c) => a + ((c.daily?.[key] || [])[i] || 0), 0));
    };
    const primary = meta.metrics[0] || google.metrics?.[0] || null;
    const label = primary ? primary.label : 'Results';
    const leadsDaily = chans.reduce((acc, c) => {
      const m = c.metrics[0];
      (m?.daily || []).forEach((v, i) => (acc[i] = (acc[i] || 0) + v));
      return acc;
    }, Array(report.dates.length).fill(0));
    const leads = chans.reduce((a, c) => a + (c.metrics[0]?.value || 0), 0);
    const leadsPrev = chans.reduce((a, c) => a + (c.metrics[0]?.previous || 0), 0);
    const spend = sum('spend');
    const spendPrev = sumPrev('spend');
    const cpl = leads > 0 ? spend / leads : null;
    const cplPrev = leadsPrev > 0 ? spendPrev / leadsPrev : null;
    const pct = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
    return {
      label,
      kpis: [
        { label: 'Spend', value: money(spend), pct: pct(spend, spendPrev), goodUp: null, spark: daily('spend') },
        { label: label, value: String(Math.round(leads)), pct: pct(leads, leadsPrev), goodUp: true, spark: leadsDaily },
        {
          label: `Cost per ${label.toLowerCase().replace(/s$/, '')}`,
          value: cpl === null ? '—' : money(cpl),
          pct: cpl !== null && cplPrev !== null ? pct(cpl, cplPrev) : null,
          goodUp: false,
          spark: daily('spend').map((s, i) => (leadsDaily[i] > 0 ? s / leadsDaily[i] : 0))
        },
        { label: 'Clicks', value: sum('clicks').toLocaleString(), pct: pct(sum('clicks'), sumPrev('clicks')), goodUp: true, spark: daily('clicks') }
      ],
      spendDaily: daily('spend'),
      leadsDaily,
      campaigns: (report.campaigns || []).filter((c) => platform === 'all' || c.channel === platform).slice(0, 6)
    };
  }, [report, platform]);

  // real numbers for the assistant: KPIs, series, campaigns, range
  const chatContext = useMemo(() => {
    if (!report || !view) return null;
    return {
      range: { id: report.range, since: report.since, until: report.until },
      kpis: view.kpis.map((k) => ({ label: k.label, value: k.value, changePct: k.pct })),
      dailySpend: view.spendDaily.map((v) => Math.round(v * 100) / 100),
      dailyResults: view.leadsDaily,
      campaigns: (report.campaigns || []).map((c) => ({
        name: c.name,
        platform: c.channel,
        spend: c.spend,
        results: c.results,
        costPer: c.costPer,
        metric: c.metricLabel
      }))
    };
  }, [report, view]);

  const chart = useMemo(() => {
    if (!view) return null;
    const W = 1120;
    const H = 220;
    const plot = (vals, top, bottom) => {
      const max = Math.max(...vals, 1);
      return vals
        .map((v, i) => `${((i / Math.max(1, vals.length - 1)) * W).toFixed(0)},${(bottom - (v / max) * (bottom - top)).toFixed(0)}`)
        .join(' ');
    };
    const spendPts = plot(view.spendDaily, 45, 200);
    const leadPts = plot(view.leadsDaily, 90, 205);
    return { spendPts, leadPts, area: `${spendPts} ${W},200 0,200`, H, W };
  }, [view]);

  const fmtAxis = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
  };

  return (
    <>
      <PulseBar context={chatContext} />

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Platform">
          {[['all', 'All platforms'], ['meta', 'Meta'], ['google', 'Google']].map(([id, label]) => (
            <button key={id} type="button" className={platform === id ? 'on' : ''} onClick={() => setPlatform(id)}>
              {label}
            </button>
          ))}
        </div>
        {report && (
          <span className="section-sub" style={{ marginLeft: 'auto' }}>
            {fmtAxis(report.since)} – {fmtAxis(report.until)} · vs previous period
          </span>
        )}
      </div>

      {error && (
        <div className="scard" style={{ padding: 16 }}>
          <span className="section-sub">Couldn’t load your numbers: {error}</span>
        </div>
      )}

      {!view && !error && (
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="scard kpi" key={i}>
              <div className="skeleton" style={{ height: 58 }} />
            </div>
          ))}
        </div>
      )}

      {view && (
        <>
          <div className="kpi-grid">
            {view.kpis.map((k) => (
              <div className="scard kpi" key={k.label}>
                <span className="kpi-label">{k.label}</span>
                <span className="kpi-value">{k.value}</span>
                <div className="kpi-meta">
                  <Delta pct={k.pct} goodUp={k.goodUp} />
                  <Spark values={k.spark} />
                </div>
              </div>
            ))}
          </div>

          <div className="scard chart-card">
            <div className="chart-head">
              <h2>Spend vs. {view.label.toLowerCase()}</h2>
              <div className="legend">
                <span>
                  <i style={{ background: 'var(--cobalt)' }} />
                  Spend (S$)
                </span>
                <span>
                  <i style={{ background: 'var(--green)' }} />
                  {view.label}
                </span>
              </div>
            </div>
            {chart && (
              <svg className="bigchart" viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" aria-label={`Spend versus ${view.label}`}>
                <defs>
                  <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2447F5" stopOpacity=".16" />
                    <stop offset="100%" stopColor="#2447F5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[45, 90, 135, 180].map((y) => (
                  <line key={y} className="grid-l" x1="0" y1={y} x2={chart.W} y2={y} />
                ))}
                <polygon className="a-spend" points={chart.area} />
                <polyline className="l-spend" points={chart.spendPts} />
                <polyline className="l-leads" points={chart.leadPts} />
                <text className="axis" x="0" y="215">
                  {fmtAxis(report.since)}
                </text>
                <text className="axis" x={chart.W - 60} y="215">
                  {fmtAxis(report.until)}
                </text>
              </svg>
            )}
          </div>

          <div className="section-head">
            <span className="section-title">Top campaigns</span>
            <Link className="sbtn sbtn-ghost sbtn-sm" to="/admanager.html">
              Open Ad Manager →
            </Link>
          </div>
          <div className="scard" style={{ overflow: 'hidden' }}>
            <table className="spec-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Platform</th>
                  <th className="num">Spend</th>
                  <th className="num">{view.label}</th>
                  <th className="num">Cost per</th>
                </tr>
              </thead>
              <tbody>
                {view.campaigns.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      <span className="section-sub">No campaigns delivered in this period.</span>
                    </td>
                  </tr>
                )}
                {view.campaigns.map((c) => (
                  <tr key={`${c.channel}:${c.name}`}>
                    <td>
                      <div className="tname">{c.name}</div>
                    </td>
                    <td>
                      <span className="plat">
                        <span className={`dot ${c.channel}`} />
                        {c.channel === 'meta' ? 'Meta' : 'Google'}
                      </span>
                    </td>
                    <td className="num">{money(c.spend)}</td>
                    <td className="num">{c.results ?? '—'}</td>
                    <td className="num">{c.costPer === null ? '—' : money(c.costPer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
