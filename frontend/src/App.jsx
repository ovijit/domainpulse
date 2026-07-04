import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState("Checking backend...");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState("");

  async function loadDomains() {
    try {
      const res = await fetch(`${API_URL}/api/domains`);

      if (!res.ok) {
        throw new Error("Backend error");
      }

      const data = await res.json();
      setDomains(data);
      setStatus("Backend connected");
    } catch (error) {
      setStatus("Backend not connected");
      setDomains([]);
    }
  }

  useEffect(() => {
    loadDomains();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    if (!domain.trim()) return;

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain: domain.trim() }),
      });

      if (!res.ok) {
        throw new Error("Could not add domain");
      }

      setDomain("");
      await loadDomains();
    } catch (error) {
      alert("Could not add domain. Check backend.");
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(domainName) {
    setChecking(domainName);

    try {
      const res = await fetch(`${API_URL}/api/check/${domainName}`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Could not check domain");
      }

      const data = await res.json();

      alert(
        `${data.domain}\n\nNameservers:\n${
          data.nameservers?.join("\n") || "No nameservers found"
        }\n\nChanged: ${data.changed ? "Yes" : "No"}`
      );
    } catch (error) {
      alert("Could not check domain.");
    } finally {
      setChecking("");
    }
  }

  return (
    <main className="page">
      <nav className="nav">
        <div className="brand">
          <div className="logo">D</div>
          <span>DomainPulse</span>
        </div>

        <div
          className={
            status === "Backend connected"
              ? "backend-status online"
              : "backend-status offline"
          }
        >
          <span></span>
          {status}
        </div>
      </nav>

      <section className="hero">
        <p className="tagline">Domain monitoring made simple</p>

        <h1>
          Track DNS changes before they become expensive surprises.
        </h1>

        <p className="description">
          Add domains, monitor nameserver changes, and keep your portfolio under
          control from one clean dashboard.
        </p>

        <form onSubmit={addDomain} className="form">
          <input
            type="text"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <button disabled={loading}>
            {loading ? "Adding..." : "Add domain"}
          </button>
        </form>
      </section>

      <section className="stats">
        <div className="stat-card">
          <h2>{domains.length}</h2>
          <p>Domains tracked</p>
        </div>

        <div className="stat-card">
          <h2>{status === "Backend connected" ? "Live" : "Offline"}</h2>
          <p>API status</p>
        </div>

        <div className="stat-card">
          <h2>DNS</h2>
          <p>Nameserver checks</p>
        </div>
      </section>

      <section className="domains-section">
        <div className="section-header">
          <div>
            <h2>Your domains</h2>
            <p>Monitor all added domains here.</p>
          </div>
        </div>

        {domains.length === 0 ? (
          <div className="empty">
            <h3>No domains yet</h3>
            <p>Add your first domain above.</p>
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

                <button onClick={() => checkDomain(item.domain)}>
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