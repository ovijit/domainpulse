import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadDomains();
  }, []);

  async function loadDomains() {
    try {
      const res = await fetch(`${API_URL}/api/domains`);
      const data = await res.json();
      setDomains(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage("Backend is not responding. Start your server first.");
    }
  }

  async function addDomain(e) {
    e.preventDefault();

    const cleanDomain = domain
      .trim()
      .toLowerCase()
      .replace("https://", "")
      .replace("http://", "")
      .replace("www.", "")
      .replace("/", "");

    if (!cleanDomain) {
      setMessage("Enter a domain first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: cleanDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Could not add domain.");
        return;
      }

      setDomain("");
      setMessage(`${cleanDomain} is now under watch.`);
      await loadDomains();
    } catch (error) {
      setMessage("Failed to add domain. Check backend connection.");
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(domainName) {
    setCheckingDomain(domainName);
    setMessage("");
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/check/${domainName}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Could not check domain.");
        return;
      }

      setResult(data);
      setSelectedDomain(domainName);
      await loadHistory(domainName);

      if (data.changed) {
        setMessage(`Alert: ${domainName} nameservers changed.`);
      } else {
        setMessage(`${domainName} is stable. No nameserver change detected.`);
      }
    } catch (error) {
      setMessage("Check failed. Backend may be offline.");
    } finally {
      setCheckingDomain("");
    }
  }

  async function loadHistory(domainName) {
    try {
      const res = await fetch(`${API_URL}/api/history/${domainName}`);
      const data = await res.json();
      setHistory(Array.isArray(data.history) ? data.history : []);
      setSelectedDomain(domainName);
    } catch (error) {
      setHistory([]);
    }
  }

  const filteredDomains = useMemo(() => {
    return domains.filter((item) =>
      item.domain.toLowerCase().includes(search.toLowerCase())
    );
  }, [domains, search]);

  const totalDomains = domains.length;
  const totalHistory = history.length;
  const changedStatus = result?.changed ? "Change detected" : "Stable";

  return (
    <div className="app">
      <section className="hero">
        <nav className="navbar">
          <div className="logo">
            <span className="logo-mark">DP</span>
            <span>DomainPulse</span>
          </div>

          <div className="nav-pill">Nameserver Intelligence</div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Domain monitoring for serious operators</p>
            <h1>
              Catch nameserver moves before the market wakes up.
            </h1>
            <p className="hero-text">
              Track domain nameserver changes, watch buyer activity signals,
              and move faster than lazy investors staring at spreadsheets.
            </p>

            <div className="hero-actions">
              <a href="#tracker" className="primary-btn">
                Start Tracking
              </a>
              <a href="#dashboard" className="secondary-btn">
                View Dashboard
              </a>
            </div>
          </div>

          <div className="threat-card">
            <div className="threat-header">
              <span>LIVE SIGNAL</span>
              <strong>DNS Watch</strong>
            </div>

            <div className="radar">
              <div className="radar-ring ring-one"></div>
              <div className="radar-ring ring-two"></div>
              <div className="radar-dot"></div>
            </div>

            <div className="threat-footer">
              <p>Nameserver changes can mean sale, transfer, parking change, or acquisition movement.</p>
              <strong>React before others even notice.</strong>
            </div>
          </div>
        </div>
      </section>

      <main className="main" id="dashboard">
        <section className="stats-grid">
          <div className="stat-card danger">
            <span>Total Watchlist</span>
            <strong>{totalDomains}</strong>
            <p>Domains under active monitoring</p>
          </div>

          <div className="stat-card">
            <span>Last Status</span>
            <strong>{result ? changedStatus : "Waiting"}</strong>
            <p>Latest checked domain result</p>
          </div>

          <div className="stat-card">
            <span>History Records</span>
            <strong>{totalHistory}</strong>
            <p>{selectedDomain || "Select a domain"}</p>
          </div>
        </section>

        <section className="tracker-panel" id="tracker">
          <div className="panel-left">
            <p className="eyebrow red">Add target</p>
            <h2>Put a domain on the radar.</h2>
            <p>
              Add your domain, check its nameservers, and build a history of
              movement over time.
            </p>
          </div>

          <form className="domain-form" onSubmit={addDomain}>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
            />
            <button disabled={loading}>
              {loading ? "Adding..." : "Track Domain"}
            </button>
          </form>
        </section>

        {message && <div className="message">{message}</div>}

        {result && (
          <section className={result.changed ? "result-card alert" : "result-card"}>
            <div>
              <span className="result-label">Latest check</span>
              <h3>{result.domain}</h3>
              <p>
                Status:{" "}
                <strong>
                  {result.changed ? "Nameserver changed" : "No change detected"}
                </strong>
              </p>
            </div>

            <div className="nameserver-box">
              <span>Current nameservers</span>
              {result.nameservers?.length > 0 ? (
                result.nameservers.map((ns) => <p key={ns}>{ns}</p>)
              ) : (
                <p>No nameservers found</p>
              )}
            </div>
          </section>
        )}

        <section className="domain-section">
          <div className="section-header">
            <div>
              <p className="eyebrow red">Watchlist</p>
              <h2>Your monitored domains</h2>
            </div>

            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search domains..."
            />
          </div>

          <div className="domain-table">
            {filteredDomains.length === 0 ? (
              <div className="empty-state">
                <h3>No domains yet.</h3>
                <p>Add your first domain and start tracking nameserver movement.</p>
              </div>
            ) : (
              filteredDomains.map((item) => (
                <div className="domain-row" key={item.id || item.domain}>
                  <div>
                    <strong>{item.domain}</strong>
                    <span>
                      Added{" "}
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : "recently"}
                    </span>
                  </div>

                  <div className="row-actions">
                    <button
                      onClick={() => checkDomain(item.domain)}
                      disabled={checkingDomain === item.domain}
                    >
                      {checkingDomain === item.domain ? "Checking..." : "Check"}
                    </button>

                    <button
                      className="ghost"
                      onClick={() => loadHistory(item.domain)}
                    >
                      History
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="history-section">
          <div className="section-header">
            <div>
              <p className="eyebrow red">Movement log</p>
              <h2>{selectedDomain ? selectedDomain : "Domain history"}</h2>
            </div>
          </div>

          <div className="history-list">
            {history.length === 0 ? (
              <div className="empty-state">
                <h3>No history found.</h3>
                <p>Check a domain to create nameserver history.</p>
              </div>
            ) : (
              history.map((item, index) => (
                <div className="history-item" key={index}>
                  <div>
                    <strong>
                      {item.changed ? "Change detected" : "Stable check"}
                    </strong>
                    <span>
                      {item.checked_at
                        ? new Date(item.checked_at).toLocaleString()
                        : "Recently checked"}
                    </span>
                  </div>

                  <div className="history-ns">
                    {Array.isArray(item.nameservers)
                      ? item.nameservers.join(", ")
                      : item.nameservers || "No nameserver data"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;