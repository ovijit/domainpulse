import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

function App() {
  const [domains, setDomains] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [domainInput, setDomainInput] = useState("");
  const [backendOnline, setBackendOnline] = useState(false);

  async function loadData() {
    try {
      const domainRes = await fetch(`${API_URL}/api/domains`);
      const alertRes = await fetch(`${API_URL}/api/alerts`);

      if (!domainRes.ok || !alertRes.ok) {
        throw new Error("Backend error");
      }

      const domainData = await domainRes.json();
      const alertData = await alertRes.json();

      setDomains(domainData);
      setAlerts(alertData);
      setBackendOnline(true);
    } catch (error) {
      setBackendOnline(false);
      setDomains([]);
      setAlerts([
        {
          id: 1,
          domain: "example.com",
          message: "Backend is not connected",
          time: "Now",
        },
        {
          id: 2,
          domain: "kinetum.com",
          message: "Connect deployed backend",
          time: "1 hr ago",
        },
        {
          id: 3,
          domain: "brandly.co",
          message: "Demo alert",
          time: "3 hr ago",
        },
      ]);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    if (!domainInput.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: domainInput }),
      });

      if (!res.ok) {
        throw new Error("Could not add domain");
      }

      setDomainInput("");
      loadData();
    } catch (error) {
      alert("Backend is not running. Start backend or deploy backend first.");
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandLogo">⌁</div>
          <h1>DomainPulse</h1>
        </div>

        <nav className="nav">
          <button className="navItem active">⌂ Dashboard</button>
          <button className="navItem">◎ Domains</button>
          <button className="navItem">
            ◇ Alerts <span>{alerts.length}</span>
          </button>
          <button className="navItem">◴ History</button>
          <button className="navItem">▥ Reports</button>
          <button className="navItem">⚙ Settings</button>
        </nav>

        <div className="planCard">
          <h3>Pro Plan</h3>
          <p>{domains.length} / 1,000 domains</p>
          <div className="progress">
            <div style={{ width: `${Math.min(domains.length / 10, 100)}%` }} />
          </div>
          <button>Upgrade Plan</button>
        </div>

        <div className="helpCard">
          <h3>Need help?</h3>
          <p>View documentation or contact support.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Domain Monitoring Dashboard</p>
            <h2>Monitor nameserver changes easily</h2>
          </div>

          <div className={backendOnline ? "status online" : "status offline"}>
            <span></span>
            {backendOnline ? "Backend online" : "Backend offline"}
          </div>
        </header>

        <section className="stats">
          <div className="statCard">
            <p>Total Domains</p>
            <h3>{domains.length}</h3>
            <span>Active portfolio</span>
          </div>

          <div className="statCard">
            <p>Recent Alerts</p>
            <h3>{alerts.length}</h3>
            <span>Last 24 hours</span>
          </div>

          <div className="statCard">
            <p>Changes Found</p>
            <h3>0</h3>
            <span>Across all domains</span>
          </div>

          <div className="statCard">
            <p>Healthy Domains</p>
            <h3>{domains.length}</h3>
            <span>All domains healthy</span>
          </div>
        </section>

        {!backendOnline && (
          <section className="warning">
            <div className="warningIcon">◇</div>
            <div>
              <h3>Backend is not running</h3>
              <p>
                Your frontend is live, but it cannot connect to your backend API.
                Deploy backend and add the backend URL in Vercel.
              </p>
            </div>
            <button>View System Status →</button>
          </section>
        )}

        <section className="contentGrid">
          <div className="panel large">
            <div className="panelHeader">
              <div>
                <h3>Domain Monitoring</h3>
                <p>{domains.length} domains</p>
              </div>

              <div className="filters">
                <select>
                  <option>All Status</option>
                  <option>Healthy</option>
                  <option>Changed</option>
                </select>

                <input placeholder="Search domains..." />
              </div>
            </div>

            <div className="table">
              <div className="tableHead">
                <span>Domain</span>
                <span>Nameserver Status</span>
                <span>Last Checked</span>
                <span>Status</span>
              </div>

              {domains.length === 0 ? (
                <div className="emptyState">
                  <h4>No domains added yet.</h4>
                  <p>Add your first domain to start monitoring nameservers.</p>
                </div>
              ) : (
                domains.map((item) => (
                  <div className="tableRow" key={item.id}>
                    <span>{item.domain}</span>
                    <span>Stable</span>
                    <span>Just now</span>
                    <span className="badge healthy">Healthy</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sideColumn">
            <div className="panel">
              <div className="panelHeader">
                <h3>Recent Alerts</h3>
                <button className="linkBtn">View all</button>
              </div>

              <div className="alertList">
                {alerts.map((alert) => (
                  <div className="alertItem" key={alert.id}>
                    <div className="dot"></div>
                    <div>
                      <h4>{alert.domain}</h4>
                      <p>{alert.message || "No recent changes"}</p>
                    </div>
                    <span>{alert.time || "Now"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel addPanel">
              <div className="addIcon">◎</div>
              <h3>Add New Domain</h3>
              <p>Start monitoring a domain for nameserver changes.</p>

              <form onSubmit={addDomain}>
                <input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="example.com"
                />
                <button type="submit">Add Domain</button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;