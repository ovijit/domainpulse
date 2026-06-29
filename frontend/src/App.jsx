import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5001/api";

function App() {
  const [domain, setDomain] = useState("");
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState("");

  async function fetchDomains() {
    try {
      const res = await fetch(`${API_URL}/domains`);
      const data = await res.json();
      setDomains(data);
    } catch (error) {
      setMessage("Could not load domains");
    }
  }

  async function addDomain(e) {
    e.preventDefault();

    if (!domain.trim()) {
      setMessage("Please enter a domain");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          domain: domain.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Could not add domain");
        return;
      }

      setMessage(`Added ${data.domain}`);
      setDomain("");
      fetchDomains();
    } catch (error) {
      setMessage("Backend is not running");
    }
  }

  async function viewHistory(item) {
    try {
      setSelectedDomain(item);

      const res = await fetch(`${API_URL}/domains/${item.id}/history`);
      const data = await res.json();

      setHistory(data);
    } catch (error) {
      setMessage("Could not load history");
    }
  }

  async function checkDomain(item) {
    try {
      const res = await fetch(`${API_URL}/domains/${item.id}/check`, {
        method: "POST"
      });

      const data = await res.json();

      setMessage(data.message);

      if (selectedDomain && selectedDomain.id === item.id) {
        viewHistory(item);
      }
    } catch (error) {
      setMessage("Could not check domain");
    }
  }

  useEffect(() => {
    fetchDomains();
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <h1>DomainPulse</h1>
        <p>Monitor nameserver changes for your domain portfolio.</p>
      </header>

      <main className="container">
        <section className="card">
          <h2>Add Domain</h2>

          <form onSubmit={addDomain} className="form">
            <input
              type="text"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />

            <button type="submit">Add Domain</button>
          </form>

          {message && <p className="message">{message}</p>}
        </section>

        <section className="card">
          <h2>Saved Domains</h2>

          {domains.length === 0 ? (
            <p className="empty">No domains added yet.</p>
          ) : (
            <div className="domain-list">
              {domains.map((item) => (
                <div className="domain-row" key={item.id}>
                  <div>
                    <strong>{item.domain}</strong>
                    <p>Added: {item.created_at}</p>
                  </div>

                  <div className="actions">
                    <button onClick={() => viewHistory(item)}>
                      View History
                    </button>

                    <button onClick={() => checkDomain(item)}>
                      Check Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {selectedDomain && (
          <section className="card">
            <h2>Nameserver History: {selectedDomain.domain}</h2>

            {history.length === 0 ? (
              <p className="empty">No history found.</p>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div className="history-card" key={item.id}>
                    <div className="history-top">
                      <strong>
                        {item.changed ? "Changed" : "No Change"}
                      </strong>
                      <span>{item.checked_at}</span>
                    </div>

                    <ul>
                      {item.nameservers.map((ns) => (
                        <li key={ns}>{ns}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;