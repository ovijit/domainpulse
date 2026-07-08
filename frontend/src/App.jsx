import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "https://domainpulse.onrender.com"
).replace(/\/$/, "");

const icons = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),

  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </>
  ),

  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),

  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),

  server: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01" />
      <path d="M7 17h.01" />
    </>
  ),

  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),

  plus: <path d="M12 5v14M5 12h14" />,

  refresh: (
    <>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M5.8 9a7 7 0 0 1 11.5-2.6L20 9" />
      <path d="M4 15l2.7 2.6A7 7 0 0 0 18.2 15" />
    </>
  ),

  check: <path d="m5 12 4 4L19 6" />,

  warning: (
    <>
      <path d="M10.3 3.6 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),

  external: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

function normalizeDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

function isValidDomain(domain) {
  return (
    domain.length > 3 &&
    domain.length <= 253 &&
    domain.includes(".") &&
    !domain.includes(" ") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".")
  );
}

function formatDate(value) {
  if (!value) {
    return "Not checked";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not checked";
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
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [addingDomain, setAddingDomain] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [backendConnected, setBackendConnected] = useState(null);
  const [checkingDomains, setCheckingDomains] = useState({});
  const [checkResults, setCheckResults] = useState({});

  const [notice, setNotice] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
  };

  const loadDomains = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch(`${API_URL}/api/domains`);
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(data.message || "Could not load domains.");
      }

      setDomains(Array.isArray(data) ? data : []);
      setBackendConnected(true);
    } catch (error) {
      console.error("Domain loading error:", error);

      setBackendConnected(false);

      showNotice(
        "error",
        "Backend is not connected. Check VITE_API_URL or wake the Render service."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const filteredDomains = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return domains;
    }

    return domains.filter((item) =>
      String(item.domain || "").toLowerCase().includes(query)
    );
  }, [domains, search]);

  const checkedCount = Object.keys(checkResults).length;

  const healthyCount = Object.values(checkResults).filter(
    (result) => result.changed === false
  ).length;

  const changedCount = Object.values(checkResults).filter(
    (result) => result.changed === true
  ).length;

  const handleAddDomain = async (event) => {
    event.preventDefault();

    const cleanDomain = normalizeDomain(domainInput);

    if (!isValidDomain(cleanDomain)) {
      showNotice("error", "Enter a valid domain, for example bitzen.com.");
      return;
    }

    const alreadyExists = domains.some(
      (item) => item.domain?.toLowerCase() === cleanDomain
    );

    if (alreadyExists) {
      showNotice("error", `${cleanDomain} is already in your portfolio.`);
      return;
    }

    setAddingDomain(true);
    setNotice(null);

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
        throw new Error(
          data.message || data.error || "Could not add this domain."
        );
      }

      setDomainInput("");
      setBackendConnected(true);

      await loadDomains({ silent: true });

      showNotice("success", `${cleanDomain} is now being monitored.`);
    } catch (error) {
      console.error("Domain creation error:", error);

      showNotice(
        "error",
        error.message || "Could not add this domain."
      );
    } finally {
      setAddingDomain(false);
    }
  };

  const handleCheckDomain = async (domainName) => {
    setCheckingDomains((current) => ({
      ...current,
      [domainName]: true,
    }));

    setNotice(null);

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
          data.message ||
            data.error ||
            `Could not check ${domainName}.`
        );
      }

      const nameservers = Array.isArray(data.nameservers)
        ? data.nameservers
        : Array.isArray(data.nameServers)
          ? data.nameServers
          : [];

      const result = {
        nameservers,
        changed: Boolean(data.changed),
        checkedAt: new Date().toISOString(),
      };

      setCheckResults((current) => ({
        ...current,
        [domainName]: result,
      }));

      setBackendConnected(true);

      showNotice(
        result.changed ? "warning" : "success",
        result.changed
          ? `Nameserver change detected for ${domainName}.`
          : `${domainName} is healthy and unchanged.`
      );
    } catch (error) {
      console.error("Domain check error:", error);

      showNotice(
        "error",
        error.message || `Could not check ${domainName}.`
      );
    } finally {
      setCheckingDomains((current) => ({
        ...current,
        [domainName]: false,
      }));
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <a className="brand" href="#top">
            <span className="brand-logo">DP</span>

            <span className="brand-text">
              <strong>DomainPulse</strong>
              <small>Nameserver monitoring</small>
            </span>
          </a>

          <nav className="sidebar-nav" aria-label="Main navigation">
            <button className="nav-item active" type="button">
              <Icon name="dashboard" />
              <span>Overview</span>
            </button>

            <button className="nav-item" type="button">
              <Icon name="globe" />
              <span>Domains</span>
              <span className="nav-count">{domains.length}</span>
            </button>

            <button className="nav-item" type="button" disabled>
              <Icon name="history" />
              <span>History</span>
              <span className="soon-badge">Soon</span>
            </button>

            <button className="nav-item" type="button" disabled>
              <Icon name="bell" />
              <span>Alerts</span>
              <span className="soon-badge">Soon</span>
            </button>
          </nav>
        </div>

        <div className="backend-card">
          <span className="backend-icon">
            <Icon name="server" size={17} />
          </span>

          <div>
            <small>Monitoring API</small>

            <strong>
              <span
                className={`connection-dot ${
                  backendConnected === true
                    ? "online"
                    : backendConnected === false
                      ? "offline"
                      : "checking"
                }`}
              />

              {backendConnected === true
                ? "Connected"
                : backendConnected === false
                  ? "Disconnected"
                  : "Connecting"}
            </strong>
          </div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div>
            <p className="page-label">Workspace / Overview</p>
            <h1>Domain portfolio</h1>
          </div>

          <div className="topbar-actions">
            <span
              className={`connection-pill ${
                backendConnected === true ? "online" : "offline"
              }`}
            >
              <span />

              {backendConnected === true
                ? "Live monitoring"
                : "API offline"}
            </span>

            <button
              className="refresh-button"
              type="button"
              onClick={() => loadDomains({ silent: true })}
              disabled={refreshing}
              aria-label="Refresh domains"
            >
              <Icon
                name="refresh"
                className={refreshing ? "spinning" : ""}
              />
            </button>
          </div>
        </header>

        <section className="hero-section">
          <div className="hero-content">
            <span className="hero-eyebrow">
              Domain intelligence
            </span>

            <h2>Monitor every domain from one dashboard.</h2>

            <p>
              Detect nameserver changes, check domain health and keep
              your complete portfolio organized.
            </p>
          </div>

          <a className="hero-button" href="#add-domain">
            <Icon name="plus" size={17} />
            Add domain
          </a>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-header">
              <span>Total domains</span>
              <Icon name="globe" />
            </div>

            <strong>{domains.length}</strong>
            <p>Domains in your portfolio</p>
          </article>

          <article className="stat-card">
            <div className="stat-header">
              <span>Checked</span>
              <Icon name="check" />
            </div>

            <strong>{checkedCount}</strong>
            <p>Checked during this session</p>
          </article>

          <article className="stat-card">
            <div className="stat-header">
              <span>Healthy</span>
              <Icon name="server" />
            </div>

            <strong>{healthyCount}</strong>
            <p>No nameserver change detected</p>
          </article>

          <article className="stat-card">
            <div className="stat-header">
              <span>Changes</span>
              <Icon name="warning" />
            </div>

            <strong>{changedCount}</strong>
            <p>Nameserver changes detected</p>
          </article>
        </section>

        {notice && (
          <div
            className={`notice notice-${notice.type}`}
            role="status"
          >
            <span className="notice-symbol">
              <Icon
                name={
                  notice.type === "error" ||
                  notice.type === "warning"
                    ? "warning"
                    : "check"
                }
                size={16}
              />
            </span>

            <p>{notice.message}</p>

            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}

        <section className="add-domain-section" id="add-domain">
          <div className="section-heading">
            <span className="section-heading-icon">
              <Icon name="plus" />
            </span>

            <div>
              <h2>Add a domain</h2>
              <p>Start monitoring another domain.</p>
            </div>
          </div>

          <form className="add-domain-form" onSubmit={handleAddDomain}>
            <div className="domain-input">
              <span>https://</span>

              <input
                type="text"
                placeholder="yourdomain.com"
                value={domainInput}
                onChange={(event) =>
                  setDomainInput(event.target.value)
                }
                disabled={addingDomain}
                autoComplete="off"
              />
            </div>

            <button type="submit" disabled={addingDomain}>
              {addingDomain ? "Adding..." : "Add domain"}
              {!addingDomain && <Icon name="plus" size={16} />}
            </button>
          </form>
        </section>

        <section className="domains-section">
          <div className="domains-header">
            <div>
              <h2>Monitored domains</h2>
              <p>Nameserver status across your portfolio.</p>
            </div>

            <div className="search-field">
              <Icon name="search" size={17} />

              <input
                type="search"
                placeholder="Search domains"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon
                  name="refresh"
                  className="spinning"
                />
              </span>

              <h3>Loading your domains</h3>
              <p>Connecting to the DomainPulse backend.</p>
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name={search ? "search" : "globe"} />
              </span>

              <h3>
                {search
                  ? "No matching domains"
                  : "No domains added yet"}
              </h3>

              <p>
                {search
                  ? "Try searching with a different domain."
                  : "Add your first domain to begin monitoring it."}
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="domains-table">
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
                    const isChecking = Boolean(
                      checkingDomains[domainName]
                    );

                    const nameservers = result?.nameservers || [];

                    let status = "pending";
                    let statusText = "Not checked";

                    if (isChecking) {
                      status = "checking";
                      statusText = "Checking";
                    } else if (result?.changed) {
                      status = "changed";
                      statusText = "Changed";
                    } else if (result) {
                      status = "healthy";
                      statusText = "Healthy";
                    }

                    return (
                      <tr key={item.id || domainName}>
                        <td data-label="Domain">
                          <div className="domain-details">
                            <span className="domain-letter">
                              {domainName
                                ?.charAt(0)
                                .toUpperCase()}
                            </span>

                            <div>
                              <strong>{domainName}</strong>

                              <small>
                                Added {formatDate(item.created_at)}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td data-label="Status">
                          <span
                            className={`status-badge status-${status}`}
                          >
                            <span />
                            {statusText}
                          </span>
                        </td>

                        <td data-label="Nameservers">
                          <div className="nameserver-list">
                            {nameservers.length ? (
                              <>
                                {nameservers
                                  .slice(0, 2)
                                  .map((nameserver) => (
                                    <code key={nameserver}>
                                      {nameserver}
                                    </code>
                                  ))}

                                {nameservers.length > 2 && (
                                  <small>
                                    +{nameservers.length - 2} more
                                  </small>
                                )}
                              </>
                            ) : (
                              <span className="muted-text">
                                Run a check to view
                              </span>
                            )}
                          </div>
                        </td>

                        <td data-label="Last checked">
                          <span className="last-checked">
                            {result
                              ? formatDate(result.checkedAt)
                              : "Not checked"}
                          </span>
                        </td>

                        <td
                          className="action-cell"
                          data-label="Action"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleCheckDomain(domainName)
                            }
                            disabled={isChecking}
                          >
                            <Icon
                              name="refresh"
                              size={15}
                              className={
                                isChecking ? "spinning" : ""
                              }
                            />

                            {isChecking
                              ? "Checking"
                              : "Check now"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="footer">
          <span>
            DomainPulse · Nameserver monitoring for domain investors
          </span>

          <a href={API_URL} target="_blank" rel="noreferrer">
            API endpoint
            <Icon name="external" size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}

export default App;