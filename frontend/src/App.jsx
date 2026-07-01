import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5001";

function App() {
  const [domain, setDomain] = useState("");
  const [domains, setDomains] = useState([]);
  const [backendStatus, setBackendStatus] = useState("checking");

  async function fetchDomains() {
    try {
      const res = await fetch(`${API_URL}/api/domains`);
      const data = await res.json();

      setDomains(Array.isArray(data) ? data : []);
      setBackendStatus("running");
    } catch (error) {
      setBackendStatus("offline");
    }
  }

  useEffect(() => {
    fetchDomains();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    if (!domain.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain }),
      });

      if (!res.ok) {
        alert("Could not add domain");
        return;
      }

      setDomain("");
      fetchDomains();
    } catch (error) {
      alert("Backend is not running. Start backend on port 5001.");
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">∿</div>
          <h2>DomainPulse</h2>
        </div>

        <nav className="nav">
          <a className="active">⌂ Dashboard</a>
          <a>◎ Domains</a>
          <a>♢ Alerts <span>3</span></a>
          <a>◴ History</a>
          <a>▥ Reports</a>
          <a>⚙ Settings</a>
        </nav>

        <div className="plan-card">
          <p className="small-title">Pro Plan</p>
          <h3>{domains.length} / 1,000 domains</h3>
          <div className="progress">
            <div style={{ width: `${Math.min(domains.length, 100)}%` }}></div>
          </div>
          <button>Upgrade Plan</button>
        </div>

        <div className="help-card">
          <h4>Need help?</h4>
          <p>View documentation or contact support.</p>
          <button>Visit Help Center →</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Dashboard</h1>
            <p>Monitor nameserver changes across your domain portfolio.</p>
          </div>

          <div className="top-actions">
            <input placeholder="Search domains..." />
            <button className="primary-btn">+ Add Domain</button>
          </div>
        </header>

        <section className="stats-grid">
          <StatCard
            icon="◎"
            title="Domains Monitored"
            value={domains.length}
            subtitle="Active portfolio"
          />
          <StatCard
            icon="✓"
            title="Changes Detected"
            value="0"
            subtitle="Last 24 hours"
          />
          <StatCard
            icon="↻"
            title="Checks Run Today"
            value="0"
            subtitle="Across all domains"
          />
          <StatCard
            icon="◴"
            title="Last Check"
            value={domains.length ? "Just now" : "Not yet"}
            subtitle="All domains are healthy"
          />
        </section>

        <div
          className={
            backendStatus === "running"
              ? "status-banner success"
              : "status-banner warning"
          }
        >
          <div className="shield">◇</div>
          <div>
            <h4>
              {backendStatus === "running"
                ? "Backend is running on port 5001"
                : "Backend is not running"}
            </h4>
            <p>
              {backendStatus === "running"
                ? "Everything looks good. We are monitoring your domains."
                : "Start your backend server before adding or loading domains."}
            </p>
          </div>
          <button>View System Status →</button>
        </div>

        <section className="content-grid">
          <div className="table-card">
            <div className="card-header">
              <div>
                <h2>Domain Monitoring</h2>
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

            <table>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Nameserver Status</th>
                  <th>Last Checked</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty">
                      No domains added yet.
                    </td>
                  </tr>
                ) : (
                  domains.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>◎ {item.domain}</strong>
                      </td>
                      <td className="healthy-text">✓ No changes</td>
                      <td>Just now</td>
                      <td>
                        <span className="badge healthy">Healthy</span>
                      </td>
                      <td>
                        <button className="icon-btn">▥</button>
                        <button className="icon-btn">⋮</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <aside className="right-panel">
            <div className="alerts-card">
              <div className="card-header small">
                <h3>Recent Alerts</h3>
                <a>View all</a>
              </div>

              <Alert domain="example.com" text="No recent changes" time="Now" />
              <Alert domain="kinetum.com" text="Back to healthy" time="1 hr ago" />
              <Alert domain="brandly.co" text="No changes detected" time="3 hr ago" />
            </div>

            <form className="add-card" onSubmit={addDomain}>
              <div className="add-icon">◎</div>
              <h3>Add New Domain</h3>
              <p>Start monitoring a domain for nameserver changes.</p>

              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Enter domain e.g. example.com"
              />

              <button type="submit">Add Domain →</button>
            </form>
          </aside>
        </section>
      </main>
    </div>
  );
}

function StatCard({ icon, title, value, subtitle }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
        <span>{subtitle}</span>
      </div>
      <div className="sparkline"></div>
    </div>
  );
}

function Alert({ domain, text, time }) {
  return (
    <div className="alert-item">
      <div className="dot"></div>
      <div>
        <strong>{domain}</strong>
        <p>{text}</p>
      </div>
      <span>{time}</span>
    </div>
  );
}

export default App;