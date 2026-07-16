// CRM: the GHL instance at login.leadly.sg, embedded inside the spec's
// browser-chrome frame. GHL sessions don't federate with ours, so the
// iframe may land on its login screen - "Open full CRM ↗" is the escape
// hatch until SSO is solved.
const CRM_URL = 'https://login.leadly.sg';

export default function CrmTab() {
  return (
    <>
      <div className="toolbar">
        <span className="section-sub">Your CRM runs on login.leadly.sg — embedded here for contacts and messaging.</span>
        <a className="sbtn sbtn-ghost" style={{ marginLeft: 'auto' }} href={CRM_URL} target="_blank" rel="noreferrer">
          Open full CRM ↗
        </a>
      </div>
      <div className="embed-frame">
        <div className="embed-chrome">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          <span className="embed-url">login.leadly.sg</span>
          <a className="pill live" style={{ marginLeft: 'auto', textDecoration: 'none' }} href={CRM_URL} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </div>
        <iframe className="crm-iframe" src={CRM_URL} title="Leadly CRM" loading="lazy" />
      </div>
      <p className="section-sub" style={{ marginTop: 10 }}>
        Seeing a login screen? Your CRM sign-in is separate for now — use “Open full CRM ↗” to work in a full tab.
      </p>
    </>
  );
}
