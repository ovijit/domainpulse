import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

console.log("API_BASE:", API_BASE);

function cleanDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function App() {
  const [domain, setDomain] = useState("");
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState(null);
  const [backendOnline, setBackendOnline] = useState(false);

  const stats = useMemo(() => {
    return {
      total: domains.length,
      monitored: domains.length,
      alerts: result?.changed ? 1 : 0,
    };
  }, [domains, result]);

  async function fetchDomains() {
    try {
      setError("");

      const res = await fetch(`${API_BASE}/api/domains`);

      if (!res.ok) {
        throw new Error("Backend not connected");
      }

      const data = await res.json();

      setDomains(Array.isArray(data) ? data : []);
      setBackendOnline(true);
      setNotice("Backend connected");
    } catch (err) {
      setBackendOnline(false);
      setError("Backend not connected yet. UI preview is still working.");
    }
  }

  useEffect(() => {
    fetchDomains();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    const finalDomain = cleanDomain(domain);

    if (!finalDomain) {
      setError("Enter a domain first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");

      const res = await fetch(`${API_BASE}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: finalDomain }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || "Could not add domain");
      }

      setDomain("");
      setBackendOnline(true);
      setNotice(`${finalDomain} added successfully`);

      await fetchDomains();
    } catch (err) {
      setBackendOnline(false);
      setError(err.message || "Could not add domain");
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(targetDomain) {
    try {
      setChecking(targetDomain);
      setError("");
      setNotice("");

      const res = await fetch(`${API_BASE}/api/check/${targetDomain}`, {
        method: "POST",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || "Could not check domain");
      }

      setResult(data);
      setBackendOnline(true);
      setNotice(`${targetDomain} checked successfully`);
    } catch (err) {
      setBackendOnline(false);
      setError(err.message || "Could not check domain");
    } finally {
      setChecking("");
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <nav className="nav">
          <div className="brand">
            <div className="logo">D</div>
            <span>DomainPulse</span>
          </div>

          <div className="status">
            <span className={backendOnline ? "dot" : "dot offline"}></span>
            {backendOnline ? "Live" : "Backend offline"}
          </div>
        </nav>

        <div className="heroGrid">
          <div className="heroCopy">
            <p className="eyebrow">Domain monitoring for investors</p>

            <h1>Track nameserver changes before you lose control.</h1>

            <p className="subtext">
              Add domains, monitor DNS changes, and keep your portfolio under
              control from one clean dashboard.
            </p>

            <form onSubmit={addDomain} className="domainForm">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
              />

              <button disabled={loading}>
                {loading ? "Adding..." : "Add domain"}
              </button>
            </form>

            {notice && <p className="notice">{notice}</p>}
            {error && <p className="error">{error}</p>}
          </div>

          <div className="panel">
            <div className="panelHeader">
              <span>Portfolio health</span>
              <strong>{stats.total} domains</strong>
            </div>

            <div className="statGrid">
              <div>
                <small>Total</small>
                <strong>{stats.total}</strong>
              </div>

              <div>
                <small>Monitored</small>
                <strong>{stats.monitored}</strong>
              </div>

              <div>
                <small>Alerts</small>
                <strong>{stats.alerts}</strong>
              </div>
            </div>

            {result && (
              <div className="resultBox">
                <small>Last check</small>

                <h3>{result.domain}</h3>

                <p>
                  {result.changed
                    ? "Nameservers changed"
                    : "No nameserver change detected"}
                </p>

                {Array.isArray(result.nameservers) &&
                  result.nameservers.length > 0 && (
                    <ul>
                      {result.nameservers.map((ns) => (
                        <li key={ns}>{ns}</li>
                      ))}
                    </ul>
                  )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="domainsSection">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>Your domains</h2>
          </div>

          <button className="ghostButton" onClick={fetchDomains}>
            Refresh
          </button>
        </div>

        <div className="domainList">
          {domains.length === 0 ? (
            <div className="emptyState">
              <h3>No domains yet</h3>
              <p>Add your first domain above to start monitoring.</p>
            </div>
          ) : (
            domains.map((item) => (
              <div className="domainCard" key={item.id || item.domain}>
                <div>
                  <h3>{item.domain}</h3>

                  <p>
                    Added{" "}
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString()
                      : "recently"}
                  </p>
                </div>

                <button
                  onClick={() => checkDomain(item.domain)}
                  disabled={checking === item.domain}
                >
                  {checking === item.domain ? "Checking..." : "Check DNS"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default App;