import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");

function normalizeDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function formatDate(value) {
  if (!value) return "Not checked yet";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not checked yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function App() {
  const [domains, setDomains] = useState([]);
  const [domainInput, setDomainInput] = useState("");
  const [backendConnected, setBackendConnected] = useState(null);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [addingDomain, setAddingDomain] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [checkResults, setCheckResults] = useState({});

  const fetchDomains = async () => {
    setLoadingDomains(true);

    try {
      const response = await fetch(`${API_URL}/api/domains`);

      if (!response.ok) {
        throw new Error("Could not load domains");
      }

      const data = await response.json();

      setDomains(Array.isArray(data) ? data : []);
      setBackendConnected(true);
      setError("");
    } catch (requestError) {
      console.error(requestError);
      setBackendConnected(false);
      setError("Backend is not connected. Start backend or check VITE_API_URL.");
    } finally {
      setLoadingDomains(false);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const filteredDomains = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return domains;

    return domains.filter((item) =>
      String(item.domain || "")
        .toLowerCase()
        .includes(term)
    );
  }, [domains, search]);

  const monitoredCount = domains.length;

  const changedCount = Object.values(checkResults).filter(
    (result) => result?.changed === true
  ).length;

  const stableCount = Object.values(checkResults).filter(
    (result) => result?.changed === false
  ).length;

  const handleAddDomain = async (event) => {
    event.preventDefault();

    const cleanDomain = normalizeDomain(domainInput);

    if (!cleanDomain || !cleanDomain.includes(".")) {
      setError("Enter a valid domain, for example example.com.");
      setMessage("");
      return;
    }

    const alreadyExists = domains.some(
      (item) => item.domain?.toLowerCase() === cleanDomain
    );

    if (alreadyExists) {
      setError("This domain is already being monitored.");
      setMessage("");
      return;
    }

    setAddingDomain(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: cleanDomain,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || "Could not add domain");
      }

      setDomainInput("");
      setBackendConnected(true);
      setMessage(`${cleanDomain} was added successfully.`);
      await fetchDomains();
    } catch (requestError) {
      console.error(requestError);
      setBackendConnected(false);
      setError(requestError.message || "Could not add domain.");
    } finally {
      setAddingDomain(false);
    }
  };

  const handleCheckDomain = async (domainName) => {
    setCheckingDomain(domainName);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/check/${encodeURIComponent(domainName)}`,
        {
          method: "POST",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Nameserver check failed"
        );
      }

      const nameservers =
        data.nameservers ||
        data.nameServers ||
        data.ns ||
        data.current_nameservers ||
        [];

      setCheckResults((current) => ({
        ...current,
        [domainName]: {
          nameservers: Array.isArray(nameservers) ? nameservers : [],
          changed: Boolean(data.changed),
          checkedAt: new Date().toISOString(),
        },
      }));

      setBackendConnected(true);
      setMessage(
        data.changed
          ? `Nameserver change detected for ${domainName}.`
          : `${domainName} is stable. No nameserver change detected.`
      );
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.message || "Could not check this domain.");
    } finally {
      setCheckingDomain("");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="DomainPulse home">
          <span className="brand-mark">D</span>

          <span>
            <strong>DomainPulse</strong>
            <small>Nameserver monitoring</small>
          </span>
        </a>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <button className="nav-item active" type="button">
            <span className="nav-icon">◫</span>
            Dashboard
          </button>

          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">↻</span>
            History
            <span className="coming-soon">Soon</span>
          </button>

          <button className="nav-item" type="button" disabled>
            <span className="nav-icon">◇</span>
            Alerts
            <span className="coming-soon">Soon</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-card">
            <span
              className={`status-dot ${
                backendConnected === true
                  ? "connected"
                  : backendConnected === false
                    ? "disconnected"
                    : ""
              }`}
            />

            <div>
              <strong>
                {backendConnected === true
                  ? "Backend connected"
                  : backendConnected === false
                    ? "Backend offline"
                    : "Checking backend"}
              </strong>

              <small>
                {backendConnected
                  ? "Monitoring is available"
                  : "Check your API configuration"}
              </small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">DOMAIN MONITORING</p>
            <h1>Dashboard</h1>
          </div>

          <button
            className="refresh-button"
            type="button"
            onClick={fetchDomains}
            disabled={loadingDomains}
          >
            <span className={loadingDomains ? "spin" : ""}>↻</span>
            {loadingDomains ? "Refreshing" : "Refresh"}
          </button>
        </header>

        <section className="hero-section">
          <div>
            <h2>Monitor every domain from one place.</h2>
            <p>
              Add your domains, check their nameservers and detect unexpected
              DNS changes before they become a problem.
            </p>
          </div>

          <form className="add-domain-form" onSubmit={handleAddDomain}>
            <label htmlFor="domain-input">Add a domain</label>

            <div className="input-row">
              <div className="domain-input-wrapper">
                <span>https://</span>

                <input
                  id="domain-input"
                  type="text"
                  placeholder="example.com"
                  value={domainInput}
                  onChange={(event) => setDomainInput(event.target.value)}
                  disabled={addingDomain}
                  autoComplete="off"
                />
              </div>

              <button
                className="primary-button"
                type="submit"
                disabled={addingDomain}
              >
                {addingDomain ? "Adding..." : "Add domain"}
              </button>
            </div>
          </form>
        </section>

        {message && (
          <div className="notice success-notice" role="status">
            <span>✓</span>
            <p>{message}</p>
            <button type="button" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="notice error-notice" role="alert">
            <span>!</span>
            <p>{error}</p>
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-card-header">
              <span>Total domains</span>
              <span className="stat-icon">◫</span>
            </div>

            <strong>{monitoredCount}</strong>
            <p>Domains currently monitored</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-header">
              <span>Stable</span>
              <span className="stat-icon">✓</span>
            </div>

            <strong>{stableCount}</strong>
            <p>No nameserver change detected</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-header">
              <span>Changes</span>
              <span className="stat-icon">↗</span>
            </div>

            <strong>{changedCount}</strong>
            <p>Changes found in this session</p>
          </article>
        </section>

        <section className="domains-section">
          <div className="section-header">
            <div>
              <h2>Monitored domains</h2>
              <p>Check the current nameserver status of your portfolio.</p>
            </div>

            <div className="search-wrapper">
              <span>⌕</span>

              <input
                type="search"
                placeholder="Search domains"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="domains-table-wrapper">
            {loadingDomains ? (
              <div className="empty-state">
                <div className="loader" />
                <h3>Loading domains</h3>
                <p>Connecting to your DomainPulse backend.</p>
              </div>
            ) : filteredDomains.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">+</div>
                <h3>
                  {search ? "No matching domains" : "No domains added yet"}
                </h3>
                <p>
                  {search
                    ? "Try searching with a different domain name."
                    : "Add your first domain above to begin monitoring it."}
                </p>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Status</th>
                      <th>Nameservers</th>
                      <th>Last checked</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>

                  <tbody>
                    {filteredDomains.map((item) => {
                      const domainName = item.domain;
                      const result = checkResults[domainName];
                      const isChecking = checkingDomain === domainName;

                      return (
                        <tr key={item.id || domainName}>
                          <td>
                            <div className="domain-cell">
                              <div className="domain-avatar">
                                {domainName?.charAt(0).toUpperCase()}
                              </div>

                              <div>
                                <strong>{domainName}</strong>
                                <small>
                                  Added {formatDate(item.created_at)}
                                </small>
                              </div>
                            </div>
                          </td>

                          <td>
                            {!result ? (
                              <span className="status-badge neutral">
                                <span />
                                Not checked
                              </span>
                            ) : result.changed ? (
                              <span className="status-badge changed">
                                <span />
                                Changed
                              </span>
                            ) : (
                              <span className="status-badge stable">
                                <span />
                                Stable
                              </span>
                            )}
                          </td>

                          <td>
                            <div className="nameserver-list">
                              {result?.nameservers?.length ? (
                                result.nameservers.slice(0, 2).map((server) => (
                                  <code key={server}>{server}</code>
                                ))
                              ) : (
                                <span className="muted-text">
                                  Run a check to view
                                </span>
                              )}

                              {result?.nameservers?.length > 2 && (
                                <small>
                                  +{result.nameservers.length - 2} more
                                </small>
                              )}
                            </div>
                          </td>

                          <td>
                            <span className="checked-time">
                              {result
                                ? formatDate(result.checkedAt)
                                : "Not checked yet"}
                            </span>
                          </td>

                          <td className="action-cell">
                            <button
                              className="check-button"
                              type="button"
                              onClick={() => handleCheckDomain(domainName)}
                              disabled={isChecking}
                            >
                              <span className={isChecking ? "spin" : ""}>↻</span>
                              {isChecking ? "Checking" : "Check now"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <footer className="page-footer">
          <p>DomainPulse · Simple nameserver monitoring</p>
          <span>API: {API_URL}</span>
        </footer>
      </main>
    </div>
  );
}

export default App;