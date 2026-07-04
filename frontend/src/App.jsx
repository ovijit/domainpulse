import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:5001";

function App() {
  const [domains, setDomains] = useState([]);
  const [domainInput, setDomainInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [checks, setChecks] = useState({});
  const [message, setMessage] = useState("");

  const changedCount = useMemo(() => {
    return Object.values(checks).filter((item) => item?.changed).length;
  }, [checks]);

  async function loadDomains() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch(`${API_BASE}/api/domains`);

      if (!res.ok) {
        throw new Error("Backend connection failed");
      }

      const data = await res.json();
      setDomains(data);
    } catch (error) {
      setMessage(
        "Could not connect to backend. Check your Render URL or local backend."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDomains();
  }, []);

  function cleanDomain(value) {
    return value
      .trim()
      .toLowerCase()
      .replace("https://", "")
      .replace("http://", "")
      .replace("www.", "")
      .replace(/\/$/, "");
  }

  async function addDomain(e) {
    e.preventDefault();

    const clean = cleanDomain(domainInput);

    if (!clean) {
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
        body: JSON.stringify({ domain: clean }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Could not add domain");
      }

      setDomainInput("");
      setMessage(`${clean} added successfully.`);
      await loadDomains();
    } catch (error) {
      setMessage(error.message || "Something went wrong.");
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
        throw new Error(data?.message || "Could not check domain");
      }

      setChecks((prev) => ({
        ...prev,
        [domain]: data,
      }));

      setMessage(
        data.changed
          ? `${domain} nameservers changed.`
          : `${domain} has no nameserver change.`
      );
    } catch (error) {
      setMessage(error.message || "Check failed.");
    } finally {
      setCheckingDomain("");
    }
  }

  async function checkAllDomains() {
    for (const item of domains) {
      await checkDomain(item.domain);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <nav className="nav">
          <div className="brand">
            <div className="logo">DP</div>
            <div>
              <h1>DomainPulse</h1>
              <p>Nameserver monitoring for domain investors</p>
            </div>
          </div>

          <div className="api-pill">
            <span></span>
            API Connected
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Domain Intelligence Dashboard</p>
            <h2>Track nameserver changes before opportunities disappear.</h2>
            <p className="hero-text">
              Add domains, monitor DNS changes, and catch movement across your
              portfolio from one clean dashboard.
            </p>

            <form className="domain-form" onSubmit={addDomain}>
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="Enter domain, example: kinetum.com"
              />
              <button disabled={loading}>
                {loading ? "Working..." : "Add Domain"}
              </button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>

          <div className="glass-card hero-card">
            <p className="card-label">Portfolio Snapshot</p>
            <div className="big-number">{domains.length}</div>
            <p>Total domains being monitored</p>

            <div className="mini-stats">
              <div>
                <strong>{changedCount}</strong>
                <span>Changes found</span>
              </div>
              <div>
                <strong>{Object.keys(checks).length}</strong>
                <span>Checked today</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard">
        <div className="section-header">
          <div>
            <p className="eyebrow">Live Monitor</p>
            <h3>Your Domain Watchlist</h3>
          </div>

          <button
            className="secondary-btn"
            onClick={checkAllDomains}
            disabled={!domains.length || checkingDomain}
          >
            {checkingDomain ? "Checking..." : "Check All"}
          </button>
        </div>

        {loading && !domains.length ? (
          <div className="empty-state">Loading domains...</div>
        ) : domains.length === 0 ? (
          <div className="empty-state">
            <h4>No domains added yet</h4>
            <p>Add your first domain above to start monitoring nameservers.</p>
          </div>
        ) : (
          <div className="domain-list">
            {domains.map((item) => {
              const result = checks[item.domain];

              return (
                <article className="domain-card" key={item.id}>
                  <div className="domain-main">
                    <div>
                      <h4>{item.domain}</h4>
                      <p>
                        Added{" "}
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString()
                          : "recently"}
                      </p>
                    </div>

                    <div
                      className={`status-badge ${
                        result?.changed ? "danger" : "safe"
                      }`}
                    >
                      {result
                        ? result.changed
                          ? "Changed"
                          : "Stable"
                        : "Not checked"}
                    </div>
                  </div>

                  {result?.nameservers?.length > 0 && (
                    <div className="nameservers">
                      {result.nameservers.map((ns) => (
                        <span key={ns}>{ns}</span>
                      ))}
                    </div>
                  )}

                  <button
                    className="check-btn"
                    onClick={() => checkDomain(item.domain)}
                    disabled={checkingDomain === item.domain}
                  >
                    {checkingDomain === item.domain
                      ? "Checking..."
                      : "Check Nameservers"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;