import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

function cleanDomain(value) {
  return value
    .replace("https://", "")
    .replace("http://", "")
    .replace("www.", "")
    .split("/")[0]
    .trim()
    .toLowerCase();
}

export default function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState("");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  async function loadDomains() {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/domains`);
      const data = await res.json();
      setDomains(Array.isArray(data) ? data : []);
    } catch {
      setMessage("Backend not connected. Check your API URL.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDomains();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    const finalDomain = cleanDomain(domain);

    if (!finalDomain) {
      setMessage("Please enter a domain.");
      return;
    }

    try {
      setMessage("");

      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: finalDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Could not add domain.");
        return;
      }

      setDomain("");
      setMessage("Domain added.");
      await loadDomains();
    } catch {
      setMessage("Could not connect to backend.");
    }
  }

  async function checkDomain(domainName) {
    try {
      setChecking(domainName);
      setMessage("");
      setResult(null);

      const res = await fetch(`${API_URL}/api/check/${domainName}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Check failed.");
        return;
      }

      setResult(data);
    } catch {
      setMessage("Could not check domain.");
    } finally {
      setChecking("");
    }
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">DomainPulse</div>
        <div className="navText">Minimal DNS monitoring</div>
      </header>

      <main className="container">
        <section className="hero">
          <p className="label">Domain monitoring</p>
          <h1>Track nameserver changes without noise.</h1>
          <p className="subtext">
            Add domains, check nameservers, and keep your watchlist clean.
          </p>

          <form className="form" onSubmit={addDomain}>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
            />
            <button type="submit">Add domain</button>
          </form>

          {message && <p className="message">{message}</p>}
        </section>

        {result && (
          <section className="card resultCard">
            <div>
              <p className="smallLabel">Latest check</p>
              <h2>{result.domain}</h2>
            </div>

            <div className={result.changed ? "status changed" : "status stable"}>
              {result.changed ? "Changed" : "No change"}
            </div>

            <div className="nameservers">
              {(result.nameservers || []).length > 0 ? (
                result.nameservers.map((ns) => <span key={ns}>{ns}</span>)
              ) : (
                <span>No nameservers found</span>
              )}
            </div>
          </section>
        )}

        <section className="card">
          <div className="cardHeader">
            <div>
              <p className="smallLabel">Watchlist</p>
              <h2>Your domains</h2>
            </div>
            <span className="count">{domains.length}</span>
          </div>

          {loading ? (
            <p className="empty">Loading domains...</p>
          ) : domains.length === 0 ? (
            <p className="empty">No domains yet. Add your first domain above.</p>
          ) : (
            <div className="domainList">
              {domains.map((item) => (
                <div className="domainRow" key={item.id || item.domain}>
                  <div>
                    <strong>{item.domain}</strong>
                    <p>Added to watchlist</p>
                  </div>

                  <button
                    className="ghostButton"
                    onClick={() => checkDomain(item.domain)}
                    disabled={checking === item.domain}
                  >
                    {checking === item.domain ? "Checking..." : "Check"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}