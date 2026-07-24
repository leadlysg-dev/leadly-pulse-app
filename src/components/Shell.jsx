import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

// The dashboard shell: 232px dark sidebar, sticky blurred topbar with
// connection chips, account footer. Tabs render inside.
const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

const ICONS = {
  pulse: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
      <path d="M1 9h3l2-5 3 8 2-5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  admanager: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
      <path d="M9 2.5L14 5v6l-5 2.5L4 11V5l5-2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
};

const TABS = [
  { id: 'pulse', to: '/pulse.html', label: 'Pulse' },
  { id: 'admanager', to: '/campaigns.html', label: 'Campaigns' }
];

function NavItems({ pathname, mobile }) {
  return TABS.map((t) => (
    <Link
      key={t.id}
      to={t.to}
      className={`nav-item${pathname === t.to ? ' active' : ''}`}
      role="tab"
      aria-selected={pathname === t.to}
    >
      {ICONS[t.id]}
      {t.label}
    </Link>
  ));
}

export default function Shell({ title, children }) {
  const { pathname } = useLocation();

  const [status, setStatus] = useState(null);
  const [redirecting, setRedirecting] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getStatus()
      .then((s) => {
        if (cancelled) return;
        if (!s.loggedIn) {
          setRedirecting(true);
          window.location.href = '/login.html';
          return;
        }
        setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(toastTimer.current);
    };
  }, []);

  if (redirecting) return null;

  const email = status?.email || '';
  const initials = email
    .split('@')[0]
    .split(/[._-]/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·';

  const ctx = {
    status,
    role: 'owner',
    toast
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-mark">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 9h3l2-5 3 8 2-5h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="logo-word">
              Leadly <span>Pulse</span>
            </div>
          </div>
          <nav className="nav" role="tablist" aria-label="Main navigation">
            <div className="nav-label">Workspace</div>
            <NavItems pathname={pathname} />
          </nav>
          <div className="sidebar-foot">
            <button
              type="button"
              className="acct"
              onClick={() => (window.location.href = '/settings.html')}
              title="Account settings"
            >
              <div className="avatar">{initials}</div>
              <div>
                <div className="acct-name">{email || '…'}</div>
                <div className="acct-plan">Internal</div>
              </div>
            </button>
            <button type="button" className="ws-item" onClick={() => (window.location.href = '/settings.html')}>
              Settings
            </button>
            <a className="ws-item" href="/.netlify/functions/logout">
              Log out
            </a>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <span className="page-title">{title}</span>
            <div className="conn-dots">
              <span className="conn-chip">
                <span className={`dot ${status?.metaConnected ? 'meta' : 'off'}`} />
                Meta
              </span>
              <span className="conn-chip">
                <span className={`dot ${status?.googleConnected ? 'google' : 'off'}`} />
                Google Ads
              </span>
            </div>
            <div className="topbar-right" />
          </header>
          <main className="content">
            <div className="tab-pane">{children}</div>
          </main>
          <nav className="mobile-nav" aria-label="Main navigation">
            <NavItems pathname={pathname} mobile />
          </nav>
        </div>
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </ShellContext.Provider>
  );
}
