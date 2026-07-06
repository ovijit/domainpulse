import { useEffect, useState } from "react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5001").replace(/\/$/, "");

function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadDomains() {
    try {
      setError("");
      const res = await fetch(`${API_URL}/api/domains`);

      if (!res.ok) {
        throw new Error("Backend not responding");
      }

      const data = await res.json();
      setDomains(data);
    } catch (err) {
      setError("Backend is not connected. Start backend or check VITE_API_URL.");
    }
  }

  useEffect(() => {
    loadDomains();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    const cleanDomain = domain.trim().toLowerCase();

    if (!cleanDomain) return;

    try {
      setLoading(true);
      setMessage("");
      setError("");

      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: cleanDomain }),
      });

      if (!res.ok) {
        throw new Error("Could not add domain");
      }

      setDomain("");
      setMessage("Domain added successfully.");
      await loadDomains();
    } catch (err) {
      setError("Could not add domain. Check your backend connection.");
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(domainName) {
    try {
      setChecking(domainName);
      setMessage("");
      setError("");

      const res = await fetch(`${API_URL}/api/check/${domainName}`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Could not check domain");
      }

      const data = await res.json();

      const nameservers =
        data.nameservers && data.nameservers.length > 0
          ? data.nameservers.join(", ")
          : "No nameservers found";

      setMessage(`${domainName}: ${nameservers}`);
    } catch (err) {
      setError("Could not check this domain. Backend may be offline.");
    } finally {
      setChecking("");
    }
  }

  return (
    <main className="page">
      <nav className="nav">
        <div className="logo">DomainPulse</div>
        <a href="#domains">Dashboard</a>
      </nav>

      <section className="hero">
        <p className="eyebrow">Domain monitoring made simple</p>
        <h1>Track your domains without the noise.</h1>
        <p className="subtitle">
          Add domains, monitor nameservers, and keep your portfolio organized in one clean dashboard.
        </p>

        <form onSubmit={addDomain} className="domain-form">
          <input
            type="text"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add domain"}
          </button>
        </form>

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
      </section>

      <section id="domains" className="dashboard">
        <div className="section-header">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2>Your domains</h2>
          </div>
          <span>{domains.length} total</span>
        </div>

        {domains.length === 0 ? (
          <div className="empty-card">
            <h3>No domains yet</h3>
            <p>Add your first domain to start monitoring nameserver changes.</p>
          </div>
        ) : (
          <div className="domain-list">
            {domains.map((item) => (
              <div className="domain-card" key={item.id}>
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
                  className="secondary-btn"
                  onClick={() => checkDomain(item.domain)}
                  disabled={checking === item.domain}
                >
                  {checking === item.domain ? "Checking..." : "Check NS"}
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