import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

function App() {
  const [domains, setDomains] = useState([]);
  const [domainInput, setDomainInput] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState("Not checked yet");

  useEffect(() => {
    fetchDomains();
  }, []);

  async function fetchDomains() {
    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/api/domains`);
      const data = await res.json();

      setDomains(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage("Backend is not running. Start backend on port 5001.");
    } finally {
      setLoading(false);
    }
  }

  async function addDomain(e) {
    e.preventDefault();

    const cleanDomain = domainInput.trim().toLowerCase();

    if (!cleanDomain) {
      setMessage("Please enter a domain name.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: cleanDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || data.message || "Could not add domain.");
        return;
      }

      setDomainInput("");
      setMessage(data.message || "Domain added successfully.");
      fetchDomains();
    } catch (error) {
      setMessage("Could not connect to backend.");
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(domainItem) {
    try {
      setCheckingId(domainItem.id);
      setMessage("");

      const res = await fetch(`${API_URL}/api/domains/${domainItem.id}/check`, {
        method: "POST",
      });

      if (!res.ok) {
        setMessage("Check endpoint is not connected yet in backend.");
        return;
      }

      const data = await res.json();

      setLastCheck("Just now");
      setMessage(data.message || `${domainItem.domain} checked successfully.`);
      fetchDomains();
    } catch (error) {
      setMessage("Could not check domain. Backend endpoint may be missing.");
    } finally {
      setCheckingId(null);
    }
  }

  async function viewHistory(domainItem) {
    try {
      setHistoryLoading(true);
      setHistoryModal({
        domain: domainItem.domain,
        records: [],
      });

      const res = await fetch(`${API_URL}/api/domains/${domainItem.id}/history`);

      if (!res.ok) {
        setHistoryModal({
          domain: domainItem.domain,
          records: [],
          error: "History endpoint is not connected yet in backend.",
        });
        return;
      }

      const data = await res.json();

      setHistoryModal({
        domain: domainItem.domain,
        records: Array.isArray(data) ? data : data.history || [],
      });
    } catch (error) {
      setHistoryModal({
        domain: domainItem.domain,
        records: [],
        error: "Could not load history.",
      });
    } finally {
      setHistoryLoading(false);
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return "Unknown";

    return String(dateValue).replace("T", " ").slice(0, 19);
  }

  const stats = useMemo(() => {
    return [
      {
        label: "Domains Monitored",
        value: domains.length,
        helper: "Active portfolio",
        icon: "◎",
        tone: "blue",
      },
      {
        label: "Changes Detected",
        value: 0,
        helper: "Last 24 hours",
        icon: "✓",
        tone: "green",
      },
      {
        label: "Checks Run Today",
        value: domains.length,
        helper: "Across all domains",
        icon: "↻",
        tone: "purple",
      },
      {
        label: "Last Check",
        value: lastCheck,
        helper: "All domains are healthy",
        icon: "◷",
        tone: "orange",
      },
    ];
  }, [domains, lastCheck]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">∿</div>

          <div>
            <h1>DomainPulse</h1>
            <p>Monitor nameserver changes for your domain portfolio.</p>
          </div>
        </div>

        <nav className="nav">
          <button className="nav-btn active">Dashboard</button>
          <button className="nav-btn">History</button>
          <button className="nav-btn">Settings</button>
        </nav>
      </header>

      <main className="dashboard">
        <section className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className={`stat-icon ${stat.tone}`}>{stat.icon}</div>

              <div>
                <p className="stat-label">{stat.label}</p>
                <h2>{stat.value}</h2>
                <p className="stat-helper">{stat.helper}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="panel add-panel">
          <div className="section-title">
            <span className="section-icon">◎</span>
            <div>
              <h2>Add Domain</h2>
              <p>Start monitoring a new domain for nameserver changes.</p>
            </div>
          </div>

          <form className="add-form" onSubmit={addDomain}>
            <input
              type="text"
              placeholder="example.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
            />

            <button disabled={loading}>
              <span>＋</span>
              {loading ? "Saving..." : "Add Domain"}
            </button>
          </form>
        </section>

        {message && <div className="message">{message}</div>}

        <section className="panel domains-panel">
          <div className="domains-header">
            <div className="section-title">
              <span className="section-icon">▱</span>
              <div>
                <h2>Saved Domains</h2>
                <p>Your monitored domains and their status.</p>
              </div>
            </div>

            <select>
              <option>Recently Added</option>
              <option>Oldest First</option>
              <option>A to Z</option>
            </select>
          </div>

          {loading && domains.length === 0 ? (
            <div className="empty-state">Loading domains...</div>
          ) : domains.length === 0 ? (
            <div className="empty-state">
              <h3>No domains yet</h3>
              <p>Add your first domain to start monitoring nameservers.</p>
            </div>
          ) : (
            <div className="domain-list">
              {domains.map((item) => (
                <div className="domain-row" key={item.id}>
                  <div className="domain-main">
                    <div className="domain-icon">◎</div>

                    <div>
                      <h3>{item.domain}</h3>
                      <span className="status">
                        <span></span>
                        Active
                      </span>
                    </div>
                  </div>

                  <div className="domain-date">
                    <span>Added</span>
                    <strong>{formatDate(item.created_at)}</strong>
                  </div>

                  <div className="domain-actions">
                    <button
                      className="outline-btn"
                      onClick={() => viewHistory(item)}
                    >
                      View History
                    </button>

                    <button
                      className="solid-btn"
                      onClick={() => checkDomain(item)}
                      disabled={checkingId === item.id}
                    >
                      {checkingId === item.id ? "Checking..." : "Check Now"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="footer">
          DomainPulse is actively monitoring your domains 24/7
        </footer>
      </main>

      {historyModal && (
        <div className="modal-backdrop" onClick={() => setHistoryModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{historyModal.domain}</h2>
                <p>Nameserver history</p>
              </div>

              <button onClick={() => setHistoryModal(null)}>×</button>
            </div>

            {historyLoading ? (
              <p className="modal-message">Loading history...</p>
            ) : historyModal.error ? (
              <p className="modal-message">{historyModal.error}</p>
            ) : historyModal.records.length === 0 ? (
              <p className="modal-message">No history found yet.</p>
            ) : (
              <div className="history-list">
                {historyModal.records.map((record, index) => (
                  <div className="history-item" key={index}>
                    <strong>{formatDate(record.checked_at || record.created_at)}</strong>
                    <p>
                      Old: {record.old_nameservers || "Unknown"}
                    </p>
                    <p>
                      New: {record.new_nameservers || "Unknown"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;