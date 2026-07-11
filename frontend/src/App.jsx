import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudCog,
  Copy,
  Globe2,
  LayoutDashboard,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
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
    .split("?")[0]
    .split("#")[0];
}

function getDomainName(domainItem) {
  if (typeof domainItem === "string") return domainItem;
  return domainItem?.domain || domainItem?.name || "";
}

function getNameservers(domainItem) {
  if (!domainItem || typeof domainItem === "string") return [];
  return Array.isArray(domainItem.nameservers) ? domainItem.nameservers : [];
}

function getDomainInitial(domainName) {
  return domainName.charAt(0).toUpperCase() || "D";
}

function formatDate(dateValue) {
  if (!dateValue) return "Not checked";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Not checked";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getDomainStatus(domainItem, checkResults) {
  const domainName = getDomainName(domainItem);
  const result = checkResults[domainName];
  const nameservers = result?.nameservers || getNameservers(domainItem);

  if (result?.changed) return "changed";
  if (nameservers.length > 0) return "stable";
  return "pending";
}

function StatusBadge({ status }) {
  const labels = {
    stable: "Healthy",
    changed: "Changed",
    pending: "Unchecked",
  };

  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}

function App() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [checkResults, setCheckResults] = useState({});
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const messageTimer = useRef(null);
  const domainInput = useRef(null);

  const domainCount = domains.length;

  const monitoredNameserverCount = useMemo(() => {
    const nameservers = new Set();
    domains.forEach((item) => {
      const result = checkResults[getDomainName(item)];
      (result?.nameservers || getNameservers(item)).forEach((nameserver) =>
        nameservers.add(nameserver)
      );
    });
    return nameservers.size;
  }, [domains, checkResults]);

  const statusCounts = useMemo(() => {
    return domains.reduce(
      (counts, item) => {
        counts[getDomainStatus(item, checkResults)] += 1;
        return counts;
      },
      { stable: 0, changed: 0, pending: 0 }
    );
  }, [domains, checkResults]);

  const filteredDomains = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return domains.filter((item) => {
      const matchesSearch = getDomainName(item).toLowerCase().includes(keyword);
      const itemStatus = getDomainStatus(item, checkResults);
      const matchesStatus =
        statusFilter === "all" || statusFilter === itemStatus;
      return matchesSearch && matchesStatus;
    });
  }, [domains, search, statusFilter, checkResults]);

  function showMessage(text, type = "success") {
    setMessage(text);
    setMessageType(type);
    window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(""), 4500);
  }

  async function loadDomains(showLoader = true) {
    try {
      if (showLoader) setLoading(true);

      const response = await fetch(`${API_URL}/api/domains`);
      if (!response.ok) throw new Error("Could not load domains.");

      const data = await response.json();
      const domainList = Array.isArray(data)
        ? data
        : Array.isArray(data.domains)
          ? data.domains
          : [];

      setDomains(domainList);
      setBackendConnected(true);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error("Load domains error:", error);
      setBackendConnected(false);
      if (showLoader) {
        showMessage(
          "DomainPulse could not reach the monitoring service. Check your API configuration.",
          "error"
        );
      }
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    loadDomains();
    return () => window.clearTimeout(messageTimer.current);
  }, []);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setSelectedDomain(null);
        setMobileMenuOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function addDomain(event) {
    event.preventDefault();
    const cleanDomain = normalizeDomain(domain);

    if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/i.test(cleanDomain)) {
      showMessage("Enter a valid domain, such as example.com.", "error");
      return;
    }

    if (domains.some((item) => getDomainName(item) === cleanDomain)) {
      showMessage("This domain is already in your monitor list.", "error");
      return;
    }

    try {
      setAdding(true);
      const response = await fetch(`${API_URL}/api/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cleanDomain }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || "Could not add domain.");
      }

      setDomain("");
      setBackendConnected(true);
      showMessage(`${cleanDomain} is now being monitored.`);
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
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || data.message || `Could not check ${domainName}.`
        );
      }

      const nameservers = Array.isArray(data.nameservers)
        ? data.nameservers
        : [];
      const checkedAt = new Date().toISOString();

      setBackendConnected(true);
      setLastSyncedAt(new Date());
      setCheckResults((current) => ({
        ...current,
        [domainName]: {
          nameservers,
          changed: Boolean(data.changed),
          checkedAt,
        },
      }));
      setDomains((current) =>
        current.map((item) => {
          if (getDomainName(item) !== domainName) return item;
          return typeof item === "string"
            ? { domain: item, nameservers }
            : { ...item, nameservers };
        })
      );
      setSelectedDomain((current) =>
        current && getDomainName(current) === domainName
          ? { ...current, nameservers, checked_at: checkedAt }
          : current
      );

      if (!silent) {
        showMessage(
          data.changed
            ? `${domainName} has a nameserver change that needs attention.`
            : `${domainName} is healthy and up to date.`,
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
    if (!domains.length) {
      showMessage("Add a domain before running a check.", "error");
      return;
    }

    try {
      setCheckingAll(true);
      let completed = 0;
      let changed = 0;

      for (const item of domains) {
        const domainName = getDomainName(item);
        if (!domainName) continue;
        const result = await checkDomain(domainName, true);
        if (result) {
          completed += 1;
          if (result.changed) changed += 1;
        }
      }

      if (!completed) {
        showMessage("Domain checks could not be completed.", "error");
      } else if (changed) {
        showMessage(
          `${completed} checked · ${changed} change${changed === 1 ? "" : "s"} detected.`,
          "warning"
        );
      } else {
        showMessage(`${completed} domains checked · Everything looks healthy.`);
      }
    } finally {
      setCheckingAll(false);
      setCheckingDomain("");
    }
  }

  async function copyNameserver(nameserver) {
    try {
      await navigator.clipboard.writeText(nameserver);
      showMessage(`${nameserver} copied.`);
    } catch {
      showMessage("Could not copy the nameserver.", "error");
    }
  }

  const selectedName = selectedDomain ? getDomainName(selectedDomain) : "";
  const selectedResult = selectedName ? checkResults[selectedName] : null;
  const selectedNameservers = selectedResult?.nameservers || getNameservers(selectedDomain);
  const selectedStatus = selectedDomain
    ? getDomainStatus(selectedDomain, checkResults)
    : "pending";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#overview" aria-label="DomainPulse home">
            <span className="brand-mark" aria-hidden="true">
              <Activity size={20} strokeWidth={2.4} />
            </span>
            <span className="brand-copy">
              <strong>DomainPulse</strong>
              <small>Monitor with confidence</small>
            </span>
          </a>

          <button
            className="mobile-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <nav className="navigation" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          <a className="nav-item nav-item-active" href="#overview">
            <LayoutDashboard size={17} />
            <span>Overview</span>
          </a>
          <a className="nav-item" href="#domains">
            <Globe2 size={17} />
            <span>Domains</span>
            <span className="nav-count">{domainCount}</span>
          </a>
          <a className="nav-item" href="#activity">
            <Activity size={17} />
            <span>Activity</span>
          </a>

        </nav>

        <div className="sidebar-footer">
          <div className={`service-card ${backendConnected ? "service-online" : "service-offline"}`}>
            <div className="service-icon">
              <CloudCog size={17} />
            </div>
            <div>
              <strong>{backendConnected ? "Monitoring online" : "Service offline"}</strong>
              <span>{backendConnected ? "API is responding normally" : "Connection needs attention"}</span>
            </div>
            <span className="live-indicator" />
          </div>

          <div className="profile-card">
            <span className="avatar">AR</span>
            <span>
              <strong>Your workspace</strong>
              <small>Portfolio overview</small>
            </span>
            <ChevronRight size={16} />
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="main-content">
        <header className="mobile-header">
          <a className="mobile-brand" href="#overview">
            <span className="brand-mark"><Activity size={18} /></span>
            DomainPulse
          </a>
          <button type="button" aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)}>
            <Menu size={21} />
          </button>
        </header>

        <section className="page-header" id="overview">
          <div>
            <p className="eyebrow">Domain intelligence</p>
            <h1>Your portfolio, always in view.</h1>
            <p className="page-intro">
              Track nameservers, catch unexpected changes, and keep every domain under control.
            </p>
          </div>
          <div className="header-actions">
            <span className="sync-copy">
              <Clock3 size={14} />
              {lastSyncedAt ? "Synced just now" : "Waiting to sync"}
            </span>
            <button
              className="button button-secondary"
              type="button"
              onClick={checkAllDomains}
              disabled={checkingAll || !domains.length}
            >
              <RefreshCw className={checkingAll ? "spin" : ""} size={16} />
              {checkingAll ? "Checking..." : "Check all"}
            </button>
          </div>
        </section>

        {message && (
          <div className={`toast toast-${messageType}`} role="status" aria-live="polite">
            <span className="toast-icon">
              {messageType === "error" ? <AlertTriangle size={16} /> : messageType === "warning" ? <Zap size={16} /> : <Check size={16} />}
            </span>
            <span>{message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setMessage("")}>
              <X size={16} />
            </button>
          </div>
        )}

        <section className="metrics-grid" aria-label="Portfolio summary">
          <article className="metric-card metric-featured">
            <div className="metric-heading">
              <span className="metric-icon"><Globe2 size={18} /></span>
              <span>Total portfolio</span>
            </div>
            <div className="metric-value-row">
              <strong>{domainCount}</strong>
              <span className="metric-trend"><ArrowUpRight size={13} /> monitored</span>
            </div>
            <p>Domains protected by DomainPulse</p>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span className="metric-icon metric-icon-green"><ShieldCheck size={18} /></span>
              <span>Healthy</span>
            </div>
            <div className="metric-value-row"><strong>{statusCounts.stable}</strong></div>
            <p>Domains with resolved nameservers</p>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span className="metric-icon metric-icon-amber"><Zap size={18} /></span>
              <span>Needs attention</span>
            </div>
            <div className="metric-value-row"><strong>{statusCounts.changed + statusCounts.pending}</strong></div>
            <p>{statusCounts.changed} changed · {statusCounts.pending} unchecked</p>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span className="metric-icon metric-icon-blue"><ServerCog size={18} /></span>
              <span>Nameservers</span>
            </div>
            <div className="metric-value-row"><strong>{monitoredNameserverCount}</strong></div>
            <p>Unique infrastructure endpoints</p>
          </article>
        </section>

        <section className="add-domain-card">
          <div className="add-domain-copy">
            <span className="add-icon"><Plus size={19} /></span>
            <div>
              <h2>Add a domain</h2>
              <p>Start monitoring nameserver changes in seconds.</p>
            </div>
          </div>
          <form className="domain-form" onSubmit={addDomain}>
            <label className="domain-input">
              <Globe2 size={17} />
              <span className="input-prefix">https://</span>
              <input
                ref={domainInput}
                type="text"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="yourdomain.com"
                aria-label="Domain name"
                autoComplete="off"
                disabled={adding}
              />
            </label>
            <button className="button button-primary" type="submit" disabled={adding}>
              {adding ? <RefreshCw className="spin" size={16} /> : <Plus size={16} />}
              {adding ? "Adding..." : "Add domain"}
            </button>
          </form>
        </section>

        <section className="domains-card" id="domains">
          <div className="domains-card-header">
            <div>
              <p className="section-label">Portfolio monitor</p>
              <h2>Monitored domains</h2>
            </div>
            <div className="table-tools">
              <label className="search-field">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search portfolio..."
                  aria-label="Search monitored domains"
                />
              </label>
              <label className="filter-field">
                <span className="sr-only">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All status</option>
                  <option value="stable">Healthy</option>
                  <option value="changed">Changed</option>
                  <option value="pending">Unchecked</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div className="state-panel">
              <span className="state-loader" />
              <h3>Loading your portfolio</h3>
              <p>Connecting to the DomainPulse monitoring service.</p>
            </div>
          ) : !filteredDomains.length ? (
            <div className="state-panel">
              <span className="state-icon"><Globe2 size={22} /></span>
              <h3>{search || statusFilter !== "all" ? "No domains found" : "Your portfolio is ready"}</h3>
              <p>{search || statusFilter !== "all" ? "Try a different search or status filter." : "Add your first domain above to begin monitoring."}</p>
              {!search && statusFilter === "all" && (
                <button className="text-button" type="button" onClick={() => domainInput.current?.focus()}>
                  Add first domain <ChevronRight size={15} />
                </button>
              )}
            </div>
          ) : (
            <div className="table-scroll">
              <div className="domain-table" role="table" aria-label="Monitored domains">
                <div className="domain-table-head" role="row">
                  <span>Domain</span>
                  <span>Nameserver</span>
                  <span>Last checked</span>
                  <span>Status</span>
                  <span className="sr-only">Actions</span>
                </div>

                {filteredDomains.map((item, index) => {
                  const domainName = getDomainName(item);
                  const result = checkResults[domainName];
                  const nameservers = result?.nameservers || getNameservers(item);
                  const status = getDomainStatus(item, checkResults);
                  const checkedAt = result?.checkedAt || item.checked_at || item.updated_at;
                  const isChecking = checkingDomain === domainName;

                  return (
                    <article className="domain-table-row" role="row" key={item.id || `${domainName}-${index}`}>
                      <button className="domain-identity" type="button" onClick={() => setSelectedDomain(item)}>
                        <span className="domain-monogram">{getDomainInitial(domainName)}</span>
                        <span>
                          <strong>{domainName}</strong>
                          <small>Added {formatDate(item.created_at)}</small>
                        </span>
                      </button>

                      <div className="nameserver-summary">
                        {nameservers.length ? (
                          <>
                            <strong>{nameservers[0]}</strong>
                            <small>{nameservers.length > 1 ? `+${nameservers.length - 1} more nameserver${nameservers.length === 2 ? "" : "s"}` : "Primary nameserver"}</small>
                          </>
                        ) : (
                          <>
                            <strong>Awaiting first check</strong>
                            <small>Nameservers not recorded</small>
                          </>
                        )}
                      </div>

                      <div className="checked-cell">
                        <Clock3 size={14} />
                        <span>{checkedAt ? formatDate(checkedAt) : nameservers.length ? "Previous check" : "Not checked"}</span>
                      </div>

                      <div><StatusBadge status={status} /></div>

                      <div className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          title={`Check ${domainName}`}
                          aria-label={`Check ${domainName}`}
                          disabled={isChecking || checkingAll}
                          onClick={() => checkDomain(domainName)}
                        >
                          <RefreshCw className={isChecking ? "spin" : ""} size={16} />
                        </button>
                        <button className="details-button" type="button" onClick={() => setSelectedDomain(item)}>
                          View <ChevronRight size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && filteredDomains.length > 0 && (
            <footer className="table-footer">
              <span>Showing {filteredDomains.length} of {domainCount} domains</span>
              <span><CheckCircle2 size={14} /> Live monitoring enabled</span>
            </footer>
          )}
        </section>

        <section className="activity-strip" id="activity">
          <div>
            <span className="activity-icon"><Activity size={18} /></span>
            <div>
              <h2>Monitoring activity</h2>
              <p>Fresh checks performed in this browser session appear here.</p>
            </div>
          </div>
          <strong>{Object.keys(checkResults).length}</strong>
        </section>
      </main>

      {selectedDomain && (
        <>
          <button className="drawer-scrim" type="button" aria-label="Close domain details" onClick={() => setSelectedDomain(null)} />
          <aside className="domain-drawer" aria-label={`${selectedName} details`}>
            <div className="drawer-header">
              <div>
                <p className="section-label">Domain details</p>
                <h2>{selectedName}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close domain details" onClick={() => setSelectedDomain(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-status-card">
              <span className={`drawer-status-icon drawer-status-${selectedStatus}`}>
                {selectedStatus === "changed" ? <AlertTriangle size={21} /> : <ShieldCheck size={21} />}
              </span>
              <div>
                <StatusBadge status={selectedStatus} />
                <p>{selectedStatus === "changed" ? "The latest nameservers differ from the previous record." : selectedStatus === "stable" ? "Nameservers are resolved and being monitored." : "Run the first check to establish a baseline."}</p>
              </div>
            </div>

            <div className="drawer-section">
              <div className="drawer-section-title">
                <span>Authoritative nameservers</span>
                <small>{selectedNameservers.length}</small>
              </div>
              {selectedNameservers.length ? (
                <div className="nameserver-list">
                  {selectedNameservers.map((nameserver) => (
                    <div key={nameserver}>
                      <ServerCog size={16} />
                      <code>{nameserver}</code>
                      <button type="button" aria-label={`Copy ${nameserver}`} onClick={() => copyNameserver(nameserver)}>
                        <Copy size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="drawer-empty">No nameservers recorded yet.</div>
              )}
            </div>

            <div className="drawer-meta">
              <div><span>Monitoring</span><strong>Enabled</strong></div>
              <div><span>Added</span><strong>{formatDate(selectedDomain.created_at)}</strong></div>
              <div><span>Last checked</span><strong>{selectedResult?.checkedAt ? formatDate(selectedResult.checkedAt) : "No recent check"}</strong></div>
            </div>

            <button className="button button-primary drawer-check" type="button" disabled={checkingDomain === selectedName || checkingAll} onClick={() => checkDomain(selectedName)}>
              <RefreshCw className={checkingDomain === selectedName ? "spin" : ""} size={16} />
              {checkingDomain === selectedName ? "Checking nameservers..." : "Run fresh check"}
            </button>
          </aside>
        </>
      )}
    </div>
  );
}

export default App;
