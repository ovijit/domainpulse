import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";

function App() {
  const [domains, setDomains] = useState([]);
  const [domainInput, setDomainInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [checkResults, setCheckResults] = useState({});
  const [history, setHistory] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchDomains();
  }, []);

  async function fetchDomains() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/domains`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load domains");
      }

      setDomains(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function cleanDomain(value) {
    return value
      .trim()
      .toLowerCase()
      .replace("https://", "")
      .replace("http://", "")
      .replace("www.", "")
      .split("/")[0];
  }

  async function addDomain(e) {
    e.preventDefault();

    const domain = cleanDomain(domainInput);

    if (!domain) {
      setMessage("Please enter a domain name.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(`${API_BASE}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Could not add domain");
      }

      setDomainInput("");
      setMessage(`${domain} added successfully.`);
      await fetchDomains();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(domain) {
    try {
      setCheckingDomain(domain);
      setMessage("");

      const res = await fetch(`${API_BASE}/api/check/${domain}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Could not check ${domain}`);
      }

      setCheckResults((prev) => ({
        ...prev,
        [domain]: data,
      }));

      if (data.changed) {
        setMessage(`Nameserver change detected for ${domain}.`);
      } else {
        setMessage(`${domain} checked. No change detected.`);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCheckingDomain("");
    }
  }

  async function checkAllDomains() {
    for (const item of domains) {
      await checkDomain(item.domain);
    }
  }

  async function loadHistory(domain) {
    try {
      setSelectedDomain(domain);
      setHistory([]);

      const res = await fetch(`${API_BASE}/api/history/${domain}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Could not load history");
      }

      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  const stats = useMemo(() => {
    const checkedCount = Object.keys(checkResults).length;
    const changedCount = Object.values(checkResults).filter(
      (item) => item.changed
    ).length;

    return {
      total: domains.length,
      checked: checkedCount,
      changed: changedCount,
      stable: checkedCount - changedCount,
    };
  }, [domains, checkResults]);

  return (
    <div className="app">
      <nav className="navbar">
        <div className="brand">
          <div className="logo">DP</div>
          <div>
            <h1>DomainPulse</h1>
            <p>Nameserver monitoring for domain investors</p>
          </div>
        </div>

        <div className="nav-actions">
          <span className="status-dot"></span>
          <span>Live Monitoring</span>
        </div>
      </nav>

      <main className="main">
        <section className="hero">
          <div className="hero-content">
            <span className="badge">Domain SaaS Dashboard</span>
            <h2>Track nameserver changes before your domains go silent.</h2>
            <p>
              Add domains, monitor DNS movements, and catch important
              nameserver changes from one clean dashboard.
            </p>

            <form className="domain-form" onSubmit={addDomain}>
              <input
                type="text"
                placeholder="Enter domain, example: bitzen.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
              />
              <button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Domain"}
              </button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>

          <div className="hero-card">
            <div className="scan-circle">
              <span></span>
            </div>
            <h3>DNS Pulse Scanner</h3>
            <p>Monitor domains for nameserver shifts and ownership signals.</p>

            <div className="mini-list">
              <div>
                <span>Afternic NS</span>
                <strong>Active</strong>
              </div>
              <div>
                <span>Sedo Parking</span>
                <strong>Tracked</strong>
              </div>
              <div>
                <span>Registrar DNS</span>
                <strong>Watching</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span>Total Domains</span>
            <strong>{stats.total}</strong>
          </div>

          <div className="stat-card">
            <span>Checked</span>
            <strong>{stats.checked}</strong>
          </div>

          <div className="stat-card danger">
            <span>Changes Found</span>
            <strong>{stats.changed}</strong>
          </div>

          <div className="stat-card success">
            <span>Stable</span>
            <strong>{stats.stable}</strong>
          </div>
        </section>

        <section className="dashboard">
          <div className="panel domains-panel">
            <div className="panel-header">
              <div>
                <h3>Domain Watchlist</h3>
                <p>Your monitored domains and latest DNS status.</p>
              </div>

              <button
                className="secondary-btn"
                onClick={checkAllDomains}
                disabled={!domains.length || checkingDomain}
              >
                {checkingDomain ? "Checking..." : "Check All"}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Nameservers</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {domains.length === 0 && (
                    <tr>
                      <td colSpan="5" className="empty">
                        No domains added yet. Add your first domain above.
                      </td>
                    </tr>
                  )}

                  {domains.map((item) => {
                    const result = checkResults[item.domain];

                    return (
                      <tr key={item.id || item.domain}>
                        <td>
                          <div className="domain-name">
                            <span>{item.domain}</span>
                            <small>Tracked domain</small>
                          </div>
                        </td>

                        <td>
                          {result?.nameservers?.length ? (
                            <div className="ns-list">
                              {result.nameservers.map((ns) => (
                                <span key={ns}>{ns}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">Not checked yet</span>
                          )}
                        </td>

                        <td>
                          {result ? (
                            result.changed ? (
                              <span className="pill danger-pill">Changed</span>
                            ) : (
                              <span className="pill success-pill">Stable</span>
                            )
                          ) : (
                            <span className="pill neutral-pill">Pending</span>
                          )}
                        </td>

                        <td>
                          <span className="muted">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString()
                              : "—"}
                          </span>
                        </td>

                        <td>
                          <div className="actions">
                            <button
                              onClick={() => checkDomain(item.domain)}
                              disabled={checkingDomain === item.domain}
                            >
                              {checkingDomain === item.domain
                                ? "Checking..."
                                : "Check"}
                            </button>

                            <button
                              className="ghost-btn"
                              onClick={() => loadHistory(item.domain)}
                            >
                              History
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="panel history-panel">
            <div className="panel-header">
              <div>
                <h3>DNS History</h3>
                <p>
                  {selectedDomain
                    ? `Recent records for ${selectedDomain}`
                    : "Select a domain to view history."}
                </p>
              </div>
            </div>

            <div className="history-box">
              {!selectedDomain && (
                <div className="empty-state">
                  <div>📡</div>
                  <h4>No domain selected</h4>
                  <p>Click History beside any domain to inspect DNS movement.</p>
                </div>
              )}

              {selectedDomain && history.length === 0 && (
                <div className="empty-state">
                  <div>✅</div>
                  <h4>No history yet</h4>
                  <p>
                    Run a few checks over time to build nameserver history for
                    this domain.
                  </p>
                </div>
              )}

              {history.map((entry, index) => (
                <div className="history-item" key={index}>
                  <div>
                    <strong>
                      {entry.changed ? "Nameserver changed" : "Check recorded"}
                    </strong>
                    <p>
                      {entry.checked_at
                        ? new Date(entry.checked_at).toLocaleString()
                        : "Date not available"}
                    </p>
                  </div>

                  <div className="ns-list">
                    {(entry.nameservers || []).map((ns) => (
                      <span key={ns}>{ns}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default App;