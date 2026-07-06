import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5001").replace(/\/$/, "");

function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState("");
  const [message, setMessage] = useState("");
  const [backendStatus, setBackendStatus] = useState("Checking");

  const totalDomains = domains.length;

  const latestDomain = useMemo(() => {
    if (!domains.length) return "No domains yet";
    return domains[0]?.domain || "No domains yet";
  }, [domains]);

  async function loadDomains() {
    try {
      const res = await fetch(`${API_URL}/api/domains`);

      if (!res.ok) {
        throw new Error("Backend error");
      }

      const data = await res.json();
      setDomains(Array.isArray(data) ? data.reverse() : []);
      setBackendStatus("Connected");
    } catch (error) {
      setBackendStatus("Not connected");
      setMessage("Backend is not connected. Start backend or check VITE_API_URL.");
    }
  }

  useEffect(() => {
    loadDomains();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    const cleanDomain = domain.trim().toLowerCase();

    if (!cleanDomain) {
      setMessage("Please enter a domain name.");
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
        throw new Error(data.message || "Could not add domain");
      }

      setDomain("");
      setMessage(`${cleanDomain} added successfully.`);
      await loadDomains();
    } catch (error) {
      setMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(domainName) {
    setChecking(domainName);
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/api/check/${domainName}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Could not check domain");
      }

      const nsText = data.nameservers?.length
        ? data.nameservers.join(", ")
        : "No nameservers found";

      setMessage(
        `${domainName} checked. Nameservers: ${nsText}. Changed: ${
          data.changed ? "Yes" : "No"
        }`
      );
    } catch (error) {
      setMessage(error.message || "Could not check domain.");
    } finally {
      setChecking("");
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <nav className="navbar">
          <div className="brand">
            <div className="logo">DP</div>
            <span>DomainPulse</span>
          </div>

          <div className={`status ${backendStatus === "Connected" ? "online" : "offline"}`}>
            <span></span>
            Backend {backendStatus}
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Domain monitoring for investors</p>
            <h1>Track nameserver changes before they cost you money.</h1>
            <p className="subtitle">
              Add your domains, monitor DNS changes, and keep your portfolio under control from one clean dashboard.
            </p>

            <form className="add-card" onSubmit={addDomain}>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
              />
              <button disabled={loading}>
                {loading ? "Adding..." : "Add Domain"}
              </button>
            </form>

            {message && <div className="message">{message}</div>}
          </div>

          <div className="stats-card">
            <p>Portfolio Overview</p>

            <div className="stat">
              <span>Total Domains</span>
              <strong>{totalDomains}</strong>
            </div>

            <div className="stat">
              <span>Latest Added</span>
              <strong>{latestDomain}</strong>
            </div>

            <div className="stat">
              <span>Monitoring</span>
              <strong>{backendStatus === "Connected" ? "Active" : "Paused"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard">
        <div className="section-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>Your domain watchlist</h2>
          </div>

          <button className="refresh-btn" onClick={loadDomains}>
            Refresh
          </button>
        </div>

        {domains.length === 0 ? (
          <div className="empty">
            <h3>No domains added yet</h3>
            <p>Add your first domain above to start monitoring nameserver changes.</p>
          </div>
        ) : (
          <div className="domain-list">
            {domains.map((item) => (
              <div className="domain-row" key={item.id}>
                <div>
                  <h3>{item.domain}</h3>
                  <p>
                    Added{" "}
                    {item.created_at
                      ? new Date(item.created_at).toLocaleString()
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
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;