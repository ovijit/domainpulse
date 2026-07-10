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
    .split("/")[0]
    .split("?")[0];
}

function getDomainName(domainItem) {
  if (typeof domainItem === "string") {
    return domainItem;
  }

  return domainItem.domain || domainItem.name || "";
}

function getNameservers(domainItem) {
  if (!domainItem || typeof domainItem === "string") {
    return [];
  }

  return Array.isArray(domainItem.nameservers)
    ? domainItem.nameservers
    : [];
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Not checked yet";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Not checked yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [search, setSearch] = useState("");
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [checkResults, setCheckResults] = useState({});

  const filteredDomains = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return domains;
    }

    return domains.filter((item) =>
      getDomainName(item).toLowerCase().includes(keyword)
    );
  }, [domains, search]);

  const domainCount = domains.length;

  const monitoredNameserverCount = useMemo(() => {
    const nameservers = new Set();

    domains.forEach((item) => {
      getNameservers(item).forEach((nameserver) => {
        nameservers.add(nameserver);
      });
    });

    return nameservers.size;
  }, [domains]);

  const changedDomainsCount = useMemo(
    () =>
      Object.values(checkResults).filter(
        (result) => result?.changed === true
      ).length,
    [checkResults]
  );

  function showMessage(text, type = "success") {
    setMessage(text);
    setMessageType(type);

    window.clearTimeout(showMessage.timeout);

    showMessage.timeout = window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4500);
  }

  async function loadDomains(showLoader = true) {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const response = await fetch(`${API_URL}/api/domains`);

      if (!response.ok) {
        throw new Error("Could not load domains.");
      }

      const data = await response.json();

      const domainList = Array.isArray(data)
        ? data
        : Array.isArray(data.domains)
        ? data.domains
        : [];

      setDomains(domainList);
      setBackendConnected(true);
    } catch (error) {
      console.error("Load domains error:", error);
      setBackendConnected(false);

      if (showLoader) {
        showMessage(
          "Backend is not connected. Check VITE_API_URL or start the backend.",
          "error"
        );
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadDomains();
  }, []);

  async function addDomain(event) {
    event.preventDefault();

    const cleanDomain = normalizeDomain(domain);

    if (!cleanDomain || !cleanDomain.includes(".")) {
      showMessage("Enter a valid domain such as example.com.", "error");
      return;
    }

    const alreadyExists = domains.some(
      (item) => getDomainName(item) === cleanDomain
    );

    if (alreadyExists) {
      showMessage("This domain is already being monitored.", "error");
      return;
    }

    try {
      setAdding(true);

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
        throw new Error(data.error || data.message || "Could not add domain.");
      }

      setDomain("");
      setBackendConnected(true);
      showMessage(`${cleanDomain} was added successfully.`);
      await loadDomains(false);
    } catch (error) {
      console.error("Add domain error:", error);
      showMessage(error.message || "Could not add the domain.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function checkDomain(domainName, silent = false) {
    try {
      setCheckingDomain(domainName);

      const response = await fetch(
        `${API_URL}/api/check/${encodeURIComponent(domainName)}`,
        {
          method: "POST",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || data.message || `Could not check ${domainName}.`
        );
      }

      setBackendConnected(true);

      setCheckResults((currentResults) => ({
        ...currentResults,
        [domainName]: {
          nameservers: Array.isArray(data.nameservers)
            ? data.nameservers
            : [],
          changed: Boolean(data.changed),
          checkedAt: new Date().toISOString(),
        },
      }));

      setDomains((currentDomains) =>
        currentDomains.map((item) => {
          if (getDomainName(item) !== domainName) {
            return item;
          }

          if (typeof item === "string") {
            return {
              domain: item,
              nameservers: Array.isArray(data.nameservers)
                ? data.nameservers
                : [],
            };
          }

          return {
            ...item,
            nameservers: Array.isArray(data.nameservers)
              ? data.nameservers
              : item.nameservers,
            updated_at: new Date().toISOString(),
          };
        })
      );

      if (!silent) {
        showMessage(
          data.changed
            ? `${domainName} nameservers have changed.`
            : `${domainName} is up to date.`,
          data.changed ? "warning" : "success"
        );
      }

      return data;
    } catch (error) {
      console.error("Check domain error:", error);

      if (!silent) {
        showMessage(error.message || "Nameserver check failed.", "error");
      }

      return null;
    } finally {
      setCheckingDomain("");
    }
  }

  async function checkAllDomains() {
    if (domains.length === 0) {
      showMessage("Add a domain before running a check.", "error");
      return;
    }

    try {
      setCheckingAll(true);

      let successfulChecks = 0;
      let changedChecks = 0;

      for (const item of domains) {
        const domainName = getDomainName(item);

        if (!domainName) {
          continue;
        }

        const result = await checkDomain(domainName, true);

        if (result) {
          successfulChecks += 1;

          if (result.changed) {
            changedChecks += 1;
          }
        }
      }

      if (successfulChecks === 0) {
        showMessage("Domain checks could not be completed.", "error");
      } else if (changedChecks > 0) {
        showMessage(
          `${successfulChecks} domains checked. ${changedChecks} change${
            changedChecks === 1 ? "" : "s"
          } detected.`,
          "warning"
        );
      } else {
        showMessage(`${successfulChecks} domains checked. No changes detected.`);
      }
    } finally {
      setCheckingAll(false);
      setCheckingDomain("");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <a className="brand" href="/">
            <span className="brand-mark">D</span>

            <span>
              <strong>DomainPulse</strong>
              <small>Domain monitoring</small>
            </span>
          </a>

          <nav className="navigation">
            <button className="nav-item nav-item-active" type="button">
              <span className="nav-icon">⌂</span>
              Dashboard
            </button>

            <button className="nav-item" type="button">
              <span className="nav-icon">◉</span>
              Domains
              <span className="nav-count">{domainCount}</span>
            </button>

            <button className="nav-item" type="button">
              <span className="nav-icon">↗</span>
              Activity
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="connection-card">
            <span
              className={`connection-dot ${
                backendConnected ? "connection-online" : "connection-offline"
              }`}
            />

            <div>
              <strong>
                {backendConnected ? "Backend online" : "Backend offline"}
              </strong>
              <small>
                {backendConnected
                  ? "Monitoring service connected"
                  : "Check your API configuration"}
              </small>
            </div>
          </div>

          <p>DomainPulse v1.0</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Domain dashboard</h1>
          </div>

          <button
            className="secondary-button"
            type="button"
            onClick={checkAllDomains}
            disabled={checkingAll || domains.length === 0}
          >
            <span className={checkingAll ? "spin" : ""}>↻</span>
            {checkingAll ? "Checking domains" : "Check all domains"}
          </button>
        </header>

        {message && (
          <div className={`alert alert-${messageType}`} role="alert">
            <span className="alert-symbol">
              {messageType === "error"
                ? "!"
                : messageType === "warning"
                ? "↯"
                : "✓"}
            </span>

            <span>{message}</span>

            <button
              type="button"
              aria-label="Close notification"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-card-header">
              <span>Total domains</span>
              <span className="stat-icon">◉</span>
            </div>

            <strong>{domainCount}</strong>
            <p>Domains currently monitored</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-header">
              <span>Nameservers</span>
              <span className="stat-icon">⌘</span>
            </div>

            <strong>{monitoredNameserverCount}</strong>
            <p>Unique nameservers detected</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-header">
              <span>Changes detected</span>
              <span className="stat-icon">↯</span>
            </div>

            <strong>{changedDomainsCount}</strong>
            <p>Changes from this session</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-header">
              <span>Service status</span>
              <span className="stat-icon">●</span>
            </div>

            <strong className="status-stat">
              {backendConnected ? "Online" : "Offline"}
            </strong>
            <p>
              {backendConnected
                ? "API connection is healthy"
                : "Backend connection unavailable"}
            </p>
          </article>
        </section>

        <section className="add-domain-section">
          <div>
            <p className="section-label">Add monitoring</p>
            <h2>Monitor a new domain</h2>
            <p>
              Add a domain and DomainPulse will monitor its authoritative
              nameservers.
            </p>
          </div>

          <form className="domain-form" onSubmit={addDomain}>
            <div className="domain-input-wrapper">
              <span>https://</span>

              <input
                type="text"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                aria-label="Domain name"
                disabled={adding}
              />
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={adding}
            >
              {adding ? "Adding domain..." : "Add domain"}
            </button>
          </form>
        </section>

        <section className="domains-section">
          <div className="section-header">
            <div>
              <p className="section-label">Portfolio</p>
              <h2>Monitored domains</h2>
            </div>

            <div className="search-wrapper">
              <span>⌕</span>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search domains"
                aria-label="Search monitored domains"
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-state">
              <span className="loader" />
              <p>Loading your domains...</p>
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◎</div>

              <h3>
                {search ? "No matching domains" : "No domains monitored yet"}
              </h3>

              <p>
                {search
                  ? "Try searching with a different domain name."
                  : "Add your first domain to begin monitoring nameservers."}
              </p>
            </div>
          ) : (
            <div className="domain-list">
              <div className="domain-list-heading">
                <span>Domain</span>
                <span>Nameservers</span>
                <span>Last checked</span>
                <span>Status</span>
                <span />
              </div>

              {filteredDomains.map((item, index) => {
                const domainName = getDomainName(item);
                const checkResult = checkResults[domainName];

                const nameservers =
                  checkResult?.nameservers || getNameservers(item);

                const checkedAt =
                  checkResult?.checkedAt ||
                  item.updated_at ||
                  item.checked_at ||
                  item.created_at;

                const isChecking = checkingDomain === domainName;
                const hasChanged = checkResult?.changed === true;

                return (
                  <article
                    className="domain-row"
                    key={item.id || `${domainName}-${index}`}
                  >
                    <div className="domain-name-cell">
                      <div className="domain-favicon">
                        {domainName.charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <strong>{domainName}</strong>
                        <span>DNS monitoring enabled</span>
                      </div>
                    </div>

                    <div className="nameserver-cell">
                      {nameservers.length > 0 ? (
                        <>
                          <strong>{nameservers[0]}</strong>

                          {nameservers.length > 1 && (
                            <span>
                              +{nameservers.length - 1} additional nameserver
                              {nameservers.length - 1 === 1 ? "" : "s"}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="muted-text">
                          Run a check to retrieve nameservers
                        </span>
                      )}
                    </div>

                    <div className="date-cell">
                      <span>{formatDate(checkedAt)}</span>
                    </div>

                    <div>
                      <span
                        className={`status-badge ${
                          hasChanged
                            ? "status-changed"
                            : nameservers.length > 0
                            ? "status-stable"
                            : "status-pending"
                        }`}
                      >
                        <span />

                        {hasChanged
                          ? "Changed"
                          : nameservers.length > 0
                          ? "Stable"
                          : "Pending"}
                      </span>
                    </div>

                    <div className="domain-actions">
                      <button
                        type="button"
                        className="check-button"
                        onClick={() => checkDomain(domainName)}
                        disabled={isChecking || checkingAll}
                      >
                        <span className={isChecking ? "spin" : ""}>↻</span>
                        {isChecking ? "Checking" : "Check now"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;