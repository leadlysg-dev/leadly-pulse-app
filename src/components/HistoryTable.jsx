import { fmtDate, money, number, percent } from '../lib/format';
import './HistoryTable.css';

// "Leads" -> "lead"; multi-word labels keep their natural plural.
const costPerLabel = (label) => {
  const lower = label.toLowerCase();
  return lower.split(' ').length === 1 ? lower.replace(/s$/, '') : lower;
};

// Week-by-week core metrics, newest first - scannable past performance
// without touching the date picker.
export default function HistoryTable({ history }) {
  const metrics = history.metrics || [];
  const primary = metrics[0] || null;
  const weeks = [...(history.weeks || [])].reverse();

  return (
    <div className="card history-table-card">
      <div className="history-table-scroll">
        <table className="history-table">
          <caption className="visually-hidden">Weekly performance history</caption>
          <thead>
            <tr>
              <th scope="col" className="history-col-week">Week</th>
              <th scope="col">Spend</th>
              <th scope="col">Impressions</th>
              <th scope="col">Clicks</th>
              <th scope="col">CTR</th>
              {metrics.map((m) => (
                <th scope="col" key={m.id}>{m.label}</th>
              ))}
              {primary && <th scope="col">Cost / {costPerLabel(primary.label)}</th>}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const ctr = w.impressions > 0 ? (w.clicks / w.impressions) * 100 : null;
              const primaryCount = primary ? w.values?.[primary.id] || 0 : 0;
              const costPer = primary && primaryCount > 0 ? w.spend / primaryCount : null;
              return (
                <tr key={w.start}>
                  <th scope="row" className="history-col-week">
                    {fmtDate(w.start)} – {fmtDate(w.end)}
                  </th>
                  <td>{money(w.spend)}</td>
                  <td>{number(w.impressions || 0)}</td>
                  <td>{number(w.clicks || 0)}</td>
                  <td>{ctr === null ? '—' : percent(ctr)}</td>
                  {metrics.map((m) => (
                    <td key={m.id}>{number(w.values?.[m.id] || 0)}</td>
                  ))}
                  {primary && <td>{costPer === null ? '—' : money(costPer)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
