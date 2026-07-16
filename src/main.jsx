import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import './styles/global.css';
import { api } from './lib/api';
import Login from './pages/Login';
import Invite from './pages/Invite';
import Shell from './components/Shell';
import PulseTab from './pages/app/PulseTab';
import AdManagerTab from './pages/app/AdManagerTab';
import StudioTab from './pages/app/StudioTab';
import CrmTab from './pages/app/CrmTab';
import AutomationsTab from './pages/app/AutomationsTab';
import Settings from './pages/Settings';
import Seo from './pages/Seo';
import SelectAccount from './pages/SelectAccount';
import SelectMetrics from './pages/SelectMetrics';
import Upgrade from './pages/Upgrade';

// "/" routes into the app: logged-in visitors go to Pulse, everyone else to
// login (the marketing site is the public front door).
function RootRedirect() {
  useEffect(() => {
    let cancelled = false;
    api
      .getStatus()
      .then((s) => {
        if (!cancelled) window.location.replace(s.loggedIn ? '/pulse.html' : '/login.html');
      })
      .catch(() => {
        if (!cancelled) window.location.replace('/login.html');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

// Old tab URLs forward to their homes in the five-tab dashboard, keeping the
// query string - the backend (login, OAuth callbacks) still redirects to
// /dashboard.html and must keep working without backend changes.
function LegacyRedirect({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

const tab = (title, node) => <Shell title={title}>{node}</Shell>;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        {/* Paths keep the .html suffix because the Netlify Functions backend
            (auth callbacks, login) redirects to these exact hardcoded paths. */}
        <Route path="/login.html" element={<Login />} />
        <Route path="/invite.html" element={<Invite />} />

        {/* The five-tab dashboard (leadly-pulse-ui-spec-v5) */}
        <Route path="/pulse.html" element={tab('Pulse', <PulseTab />)} />
        <Route path="/admanager.html" element={tab('Ad Manager', <AdManagerTab />)} />
        <Route path="/studio.html" element={tab('Studio', <StudioTab />)} />
        <Route path="/crm.html" element={tab('CRM', <CrmTab />)} />
        <Route path="/automations.html" element={tab('Automations', <AutomationsTab />)} />

        {/* Account plumbing that predates the five-tab shell */}
        <Route path="/settings.html" element={<Settings />} />
        <Route path="/seo.html" element={<Seo />} />
        <Route path="/select-account.html" element={<SelectAccount />} />
        <Route path="/select-metrics.html" element={<SelectMetrics />} />
        <Route path="/upgrade.html" element={<Upgrade />} />

        {/* Legacy routes */}
        <Route path="/dashboard.html" element={<LegacyRedirect to="/pulse.html" />} />
        <Route path="/reports.html" element={<LegacyRedirect to="/pulse.html" />} />
        <Route path="/reporting.html" element={<LegacyRedirect to="/pulse.html" />} />
        <Route path="/assistant.html" element={<LegacyRedirect to="/pulse.html" />} />
        <Route path="/manage.html" element={<LegacyRedirect to="/admanager.html" />} />
        <Route path="/creative.html" element={<LegacyRedirect to="/pulse.html" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
