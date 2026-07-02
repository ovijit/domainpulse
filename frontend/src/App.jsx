import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

function App() {
  const [domain, setDomain] = useState("");
  const [domains, setDomains] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadData() {
    try {
      const domainsRes = await fetch(`${API_URL}/api/domains`);
      const alertsRes = await fetch(`${API_URL}/api/alerts`);

      const domainsData = await domainsRes.json();
      const alertsData = await alertsRes.json();

      setDomains(domainsData);
      setAlerts(alertsData);
    } catch (error) {
      setMessage("Could not load data. Is backend running?");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function addDomain(e) {
    e.preventDefault();

    if (!domain.trim()) {
      setMessage("Please enter a domain");
      return;
    }

    setLoading(true);
    setMessage("Checking nameservers...");

    try {
      const res = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Could not add domain");
      } else {
        setMessage("Domain added successfully");
        setDomain("");
        loadData();
      }
    } catch (error) {
      setMessage("Backend error. Please check server.");
    }

    setLoading(false);
  }

  async function checkAllDomains() {
    setLoading(true);
    setMessage("Checking all domains...");

    try {
      const res = await fetch(`${API_URL}/api/check-all`, {
        method: "POST",
      });

      const data = await res.json();

      const changedCount = data.results.filter((item) => item.changed).length;

      if (changedCount > 0) {
        setMessage(`${changedCount} nameserver change detected`);
      } else {
        setMessage("No nameserver changes found");
      }

      loadData();
    } catch (error) {
      setMessage("Could not check domains");
    }

    setLoading(false);
  }

  async function deleteDomain(domainName) {
    try {
      await fetch(`${API_URL}/api/domains/${domainName}`, {
        method: "DELETE",
      });

      setMessage("Domain deleted");
      loadData();
    } catch (error) {
      setMessage("Could not delete domain");
    }
  }

  return (
    <div className="page">
      <div className="container">
        <header className="hero">
          <p className="badge">DomainPulse</p>
          <h1>Nameserver Change Tracker</h1>
          <p>
            Add a domain, save its current nameservers, and check later if the
            nameservers changed.
          </p>
        </header>

        <form onSubmit={addDomain} className="domain-form">
          <input
            type="text"
            placeholder="Enter domain, e.g. kinetum.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />

          <button disabled={loading}>
            {loading ? "Working..." : "Add Domain"}
          </button>
        </form>

        <div className="actions">
          <button onClick={checkAllDomains} disabled={loading}>
            Check All Domains
          </button>
        </div>

        {message && <p className="message">{message}</p>}

        <section className="section">
          <h2>Tracked Domains</h2>

          {domains.length === 0 ? (
            <p className="empty">No domains added yet.</p>
          ) : (
            <div className="grid">
              {domains.map((item) => (
                <div className="card" key={item.id}>
                  <div className="card-top">
                    <h3>{item.domain}</h3>
                    <button
                      className="delete-btn"
                      onClick={() => deleteDomain(item.domain)}
                    >
                      Delete
                    </button>
                  </div>

                  <p className="small">
                    Last checked:{" "}
                    {item.lastCheckedAt
                      ? new Date(item.lastCheckedAt).toLocaleString()
                      : "Never"}
                  </p>

                  <div className="ns-list">
                    {item.nameservers?.map((ns) => (
                      <span key={ns}>{ns}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <h2>Alerts</h2>

          {alerts.length === 0 ? (
            <p className="empty">No alerts yet.</p>
          ) : (
            <div className="alerts">
              {alerts.map((alert) => (
                <div className="alert" key={alert.id}>
                  <h3>{alert.message}</h3>
                  <p>{new Date(alert.createdAt).toLocaleString()}</p>

                  <div className="change-box">
                    <div>
                      <strong>Old NS</strong>
                      {alert.oldNameservers.map((ns) => (
                        <span key={ns}>{ns}</span>
                      ))}
                    </div>

                    <div>
                      <strong>New NS</strong>
                      {alert.newNameservers.map((ns) => (
                        <span key={ns}>{ns}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;