import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5001").replace(
  /\/$/,
  ""
);

function cleanDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function formatDate(dateValue) {
  if (!dateValue) return "Unknown";
  return new Date(dateValue).toLocaleString();
}

function App() {
  const [domainInput, setDomainInput] = useState("");
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [history, setHistory] = useState([]);
  const [latestCheck, setLatestCheck] = useState(null);

  const [loadingDomains, setLoadingDomains] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [message, setMessage] = useState("");

  const totalDomains = domains.length;

  const latestNameservers = useMemo(() => {
    if (latestCheck?.nameservers?.length) {
      return latestCheck.nameservers;
    }

    if (history?.length > 0) {
      const newest = history[history.length - 1];
      return newest.nameservers || newest.ns || [];
    }

    return [];
  }, [latestCheck, history]);

  async function fetchDomains() {
    try {
      setLoadingDomains(true);
      const res = await fetch(`${API_BASE}/api/domains`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load domains");
      }

      setDomains(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage("Could not connect to backend. Check if backend is running.");
    } finally {
      setLoadingDomains(false);
    }
  }

  async function addDomain(e) {
    e.preventDefault();

    const domain = cleanDomain(domainInput);

    if (!domain) {
      setMessage("Please enter a domain name.");
      return;
    }

    try {
      setAddingDomain(true);
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
      setSelectedDomain(domain);
      setMessage(`${domain} added successfully.`);
      await fetchDomains();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAddingDomain(false);
    }
  }

  async function checkDomain(domain) {
    try {
      setCheckingDomain(domain);
      setMessage("");
      setLatestCheck(null);

      const res = await fetch(`${API_BASE}/api/check/${domain}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Domain check failed");
      }

      setLatestCheck(data);
      setSelectedDomain(domain);
      setMessage(
        data.changed
          ? `Alert: ${domain} nameservers changed.`
          : `${domain} checked. No change found.`
      );

      await fetchHistory(domain);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCheckingDomain("");
    }
  }

  async function fetchHistory(domain) {
    try {
      setSelectedDomain(domain);

      const res = await fetch(`${API_BASE}/api/history/${domain}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Could not load history");
      }

      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error) {
      setHistory([]);
      setMessage(error.message);
    }
  }

  useEffect(() => {
    fetchDomains();
  }, []);

  return (
    <main className="app">
      <section className="hero">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">DP</div>
            <div>
              <h1>DomainPulse</h1>
              <p>Nameserver monitoring for domain investors</p>
            </div>
          </div>

          <button className="ghost-btn" onClick={fetchDomains}>
            Refresh
          </button>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <div className="pill">Live DNS Watchlist</div>
            <h2>Track nameserver changes before opportunities disappear.</h2>
            <p>
              Add your domains, run instant DNS checks, and review nameserver
              history from one clean dashboard.
            </p>

            <form className="domain-form" onSubmit={addDomain}>
              <input
                type="text"
                placeholder="Enter domain, e.g. kinetum.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
              />
              <button type="submit" disabled={addingDomain}>
                {addingDomain ? "Adding..." : "Add Domain"}
              </button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>

          <div className="status-card">
            <p className="card-label">Portfolio status</p>
            <h3>{totalDomains}</h3>
            <span>domains currently tracked</span>

            <div className="mini-stats">
              <div>
                <strong>{history.length}</strong>
                <small>history records</small>
              </div>
              <div>
                <strong>{latestCheck?.changed ? "Yes" : "No"}</strong>
                <small>latest change</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard">
        <div className="panel domains-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Watchlist</p>
              <h3>Your domains</h3>
            </div>
            <span>{loadingDomains ? "Loading..." : `${totalDomains} total`}</span>
          </div>

          {domains.length === 0 && !loadingDomains ? (
            <div className="empty-state">
              <h4>No domains added yet</h4>
              <p>Add your first domain above and start tracking DNS changes.</p>
            </div>
          ) : (
            <div className="domain-list">
              {domains.map((item) => (
                <div
                  className={`domain-row ${
                    selectedDomain === item.domain ? "active" : ""
                  }`}
                  key={item.id || item.domain}
                >
                  <div>
                    <h4>{item.domain}</h4>
                    <p>Added {formatDate(item.created_at)}</p>
                  </div>

                  <div className="row-actions">
                    <button
                      className="secondary-btn"
                      onClick={() => fetchHistory(item.domain)}
                    >
                      History
                    </button>

                    <button
                      className="primary-btn"
                      onClick={() => checkDomain(item.domain)}
                      disabled={checkingDomain === item.domain}
                    >
                      {checkingDomain === item.domain ? "Checking..." : "Check"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel insight-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">DNS Intelligence</p>
              <h3>{selectedDomain || "Select a domain"}</h3>
            </div>
          </div>

          <div className="result-box">
            <p className="card-label">Latest nameservers</p>

            {latestNameservers.length > 0 ? (
              <div className="ns-list">
                {latestNameservers.map((ns, index) => (
                  <span key={`${ns}-${index}`}>{ns}</span>
                ))}
              </div>
            ) : (
              <p className="muted">
                Run a check or open history to see nameserver data here.
              </p>
            )}
          </div>

          <div className="history-box">
            <div className="history-title">
              <h4>History</h4>
              <span>{history.length} records</span>
            </div>

            {history.length === 0 ? (
              <p className="muted">No history available for this domain yet.</p>
            ) : (
              <div className="timeline">
                {[...history].reverse().map((entry, index) => {
                  const nameservers = entry.nameservers || entry.ns || [];

                  return (
                    <div className="timeline-item" key={index}>
                      <div className="timeline-dot"></div>

                      <div>
                        <strong>
                          {entry.changed ? "Nameserver changed" : "Checked"}
                        </strong>
                        <p>{formatDate(entry.checked_at || entry.created_at)}</p>

                        {nameservers.length > 0 && (
                          <div className="timeline-ns">
                            {nameservers.map((ns, nsIndex) => (
                              <span key={`${ns}-${nsIndex}`}>{ns}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;