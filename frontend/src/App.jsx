import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
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
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5001"
).replace(/\/$/, "");
const DOMAIN_PATTERN = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;
const PRICING_PLANS = [
  {
    key: "free",
    name: "Free",
    price: 0,
    domainLimit: 5,
    description: "Start monitoring a small portfolio.",
    features: ["5 monitored domains", "Automated checks", "Email alerts"],
  },
  {
    key: "starter",
    name: "Starter",
    price: 9,
    domainLimit: 25,
    description: "For a focused, growing portfolio.",
    features: ["25 monitored domains", "Bulk import", "Nameserver history"],
  },
  {
    key: "pro",
    name: "Pro",
    price: 19,
    domainLimit: 100,
    description: "For active domain investors.",
    features: ["100 monitored domains", "Bulk import", "Nameserver history"],
    recommended: true,
  },
  {
    key: "portfolio",
    name: "Portfolio",
    price: 49,
    domainLimit: 1000,
    description: "For serious portfolio operators.",
    features: ["1,000 monitored domains", "Bulk import", "Full history"],
  },
];

let razorpayScriptPromise;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Razorpay Checkout could not load"));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

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

function parseBulkEntries(value) {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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

function formatDateTime(dateValue) {
  if (!dateValue) return "Unknown time";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function PublicBrand({ onClick }) {
  return (
    <button className="public-brand" type="button" onClick={onClick}>
      <span className="public-brand-mark" aria-hidden="true">
        <Activity size={20} strokeWidth={2.5} />
      </span>
      <span>
        <strong>DomainPulse</strong>
        <small>Domain intelligence</small>
      </span>
    </button>
  );
}

function LandingPage({ onLogin }) {
  const previewDomains = [
    { domain: "example.com", nameserver: "ns1.example-dns.com", status: "Healthy" },
    { domain: "portfolio.xyz", nameserver: "ns2.cloudflare.com", status: "Healthy" },
    { domain: "product.ai", nameserver: "Change detected", status: "Review" },
  ];

  return (
    <main className="landing-shell">
      <header className="public-header">
        <PublicBrand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        <nav className="public-navigation" aria-label="Public navigation">
          <a href="#features">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <button className="public-login-button" type="button" onClick={onLogin}>
          Log in
          <ArrowUpRight size={15} />
        </button>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-kicker">
            <span className="landing-live-dot" />
            Portfolio monitoring for domain investors
          </span>
          <h1>Know when your domains change. Before it becomes a problem.</h1>
          <p>
            DomainPulse watches nameservers across your portfolio, keeps a
            history of every change, and emails you when something needs your
            attention.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-primary-action" type="button" onClick={onLogin}>
              Start monitoring
              <ArrowUpRight size={17} />
            </button>
            <a href="#features">Explore features</a>
          </div>
          <div className="landing-assurances">
            <span><CheckCircle2 size={14} /> Google-secured accounts</span>
            <span><CheckCircle2 size={14} /> No credit card required</span>
          </div>
        </div>

        <div className="landing-preview" aria-label="DomainPulse dashboard preview">
          <div className="landing-preview-topbar">
            <div>
              <span className="preview-logo"><Activity size={15} /></span>
              <strong>Portfolio overview</strong>
            </div>
            <span className="preview-online"><span /> Live</span>
          </div>
          <div className="landing-preview-metrics">
            <div><span>Domains</span><strong>645</strong></div>
            <div><span>Healthy</span><strong>638</strong></div>
            <div><span>Attention</span><strong>7</strong></div>
          </div>
          <div className="landing-preview-table">
            <div className="preview-table-heading">
              <span>Domain</span><span>Nameserver</span><span>Status</span>
            </div>
            {previewDomains.map((item) => (
              <div className="preview-domain-row" key={item.domain}>
                <span className="preview-domain-name">
                  <small>{getDomainInitial(item.domain)}</small>
                  <strong>{item.domain}</strong>
                </span>
                <code>{item.nameserver}</code>
                <span className={item.status === "Review" ? "preview-review" : "preview-healthy"}>
                  <i /> {item.status}
                </span>
              </div>
            ))}
          </div>
          <div className="landing-preview-footer">
            <ShieldCheck size={15} /> Automatic checks running every six hours
          </div>
        </div>
      </section>

      <section className="landing-proof" aria-label="DomainPulse capabilities">
        <div><strong>24/7</strong><span>Portfolio visibility</span></div>
        <div><strong>100</strong><span>Domains per bulk import</span></div>
        <div><strong>6h</strong><span>Automated check cycle</span></div>
        <div><strong>Instant</strong><span>Email change alerts</span></div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-heading">
          <p className="eyebrow">Built for valuable portfolios</p>
          <h2>Everything important, without the noise.</h2>
          <p>Simple monitoring tools designed around how domain investors actually work.</p>
        </div>
        <div className="landing-feature-grid">
          <article>
            <span><Activity size={20} /></span>
            <h3>Nameserver monitoring</h3>
            <p>Establish a baseline and catch unexpected infrastructure changes automatically.</p>
          </article>
          <article>
            <span><Copy size={20} /></span>
            <h3>Bulk portfolio import</h3>
            <p>Paste up to 100 domains at once with validation and duplicate protection.</p>
          </article>
          <article>
            <span><Zap size={20} /></span>
            <h3>Actionable email alerts</h3>
            <p>Receive a clear alert when a domain moves away from its known nameservers.</p>
          </article>
        </div>
      </section>

      <section className="landing-pricing" id="pricing">
        <div className="landing-section-heading">
          <p className="eyebrow">Simple monthly pricing</p>
          <h2>Choose the coverage your portfolio needs.</h2>
          <p>Start free, then upgrade as the number of domains you protect grows.</p>
        </div>
        <div className="pricing-grid">
          {PRICING_PLANS.map((plan) => (
            <article
              className={`pricing-card ${plan.recommended ? "pricing-card-featured" : ""}`}
              key={plan.key}
            >
              {plan.recommended && <span className="pricing-recommended">Most popular</span>}
              <p className="pricing-name">{plan.name}</p>
              <div className="pricing-price">
                <strong>${plan.price}</strong>
                <span>{plan.price ? "/ month" : "forever"}</span>
              </div>
              <p className="pricing-description">{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}><Check size={14} /> {feature}</li>
                ))}
              </ul>
              <button type="button" onClick={onLogin}>
                {plan.key === "free" ? "Start free" : `Choose ${plan.name}`}
              </button>
            </article>
          ))}
        </div>
        <p className="pricing-note">Paid plans are billed monthly. Cancel at the end of any billing cycle.</p>
      </section>

      <section className="landing-workflow" id="workflow">
        <div>
          <p className="eyebrow">How it works</p>
          <h2>Protection in three small steps.</h2>
        </div>
        <ol>
          <li><span>01</span><div><strong>Add your portfolio</strong><p>Add one domain or paste a bulk list.</p></div></li>
          <li><span>02</span><div><strong>Build the baseline</strong><p>DomainPulse records authoritative nameservers.</p></div></li>
          <li><span>03</span><div><strong>Get alerted</strong><p>Unexpected changes arrive in your inbox.</p></div></li>
        </ol>
      </section>

      <section className="landing-cta">
        <div>
          <p className="eyebrow">Your portfolio deserves a pulse</p>
          <h2>Start monitoring your domains today.</h2>
        </div>
        <button type="button" onClick={onLogin}>
          Continue with Google <ArrowUpRight size={17} />
        </button>
      </section>

      <footer className="public-footer">
        <PublicBrand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        <span>© 2026 DomainPulse. Monitor with confidence.</span>
      </footer>
    </main>
  );
}

function LoginPage({ onBack, onGoogleSuccess, authError, setAuthError }) {
  return (
    <main className="login-page">
      <header className="public-header login-header">
        <PublicBrand onClick={onBack} />
        <button className="login-back-button" type="button" onClick={onBack}>
          Back to home
        </button>
      </header>

      <section className="login-layout">
        <div className="login-story">
          <p className="eyebrow">Welcome to DomainPulse</p>
          <h1>Your domains. Your private workspace.</h1>
          <p>
            Sign in to monitor nameservers, import your portfolio, and keep
            every domain separate from every other user.
          </p>
          <div className="login-benefits">
            <span><ShieldCheck size={17} /> Secure HTTP-only session</span>
            <span><Activity size={17} /> Automated portfolio monitoring</span>
            <span><Zap size={17} /> Email alerts when nameservers change</span>
          </div>
        </div>

        <section className="login-card">
          <span className="login-card-mark" aria-hidden="true">
            <Activity size={26} strokeWidth={2.5} />
          </span>
          <p className="eyebrow">Secure account access</p>
          <h2>Log in to your workspace</h2>
          <p className="login-card-intro">
            Use the Google account connected to your DomainPulse portfolio.
          </p>
          <div className="google-login-wrap">
            <GoogleLogin
              onSuccess={onGoogleSuccess}
              onError={() => setAuthError("Google sign-in was cancelled or failed.")}
              useOneTap
              theme="outline"
              size="large"
              shape="rectangular"
              text="continue_with"
            />
          </div>
          {authError && <p className="auth-error">{authError}</p>}
          <div className="login-security-note">
            <ShieldCheck size={14} />
            <span>Your password is never shared with DomainPulse.</span>
          </div>
        </section>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [publicRoute, setPublicRoute] = useState(() =>
    window.location.hash === "#login" ? "login" : "home"
  );
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [checkResults, setCheckResults] = useState({});
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState(false);
  const [domainHistory, setDomainHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [billing, setBilling] = useState(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState("");
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const messageTimer = useRef(null);
  const domainInput = useRef(null);

  const domainCount = domains.length;
  const bulkEntries = useMemo(() => parseBulkEntries(bulkInput), [bulkInput]);
  const bulkPreview = useMemo(() => {
    const existing = new Set(domains.map((item) => getDomainName(item)));
    const seen = new Set();
    const preview = { valid: 0, duplicate: 0, invalid: 0 };

    bulkEntries.forEach((entry) => {
      const normalized = normalizeDomain(entry);

      if (!DOMAIN_PATTERN.test(normalized)) {
        preview.invalid += 1;
      } else if (seen.has(normalized) || existing.has(normalized)) {
        preview.duplicate += 1;
      } else {
        seen.add(normalized);
        preview.valid += 1;
      }
    });

    return preview;
  }, [bulkEntries, domains]);

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

  async function loadSession() {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = await response.json();
      setUser(data.user || null);
    } catch (error) {
      console.error("Session check error:", error);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    try {
      setAuthLoading(true);
      setAuthError("");

      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Google sign-in failed.");
      }

      setUser(data.user);
      window.location.hash = "overview";
    } catch (error) {
      console.error("Google sign-in error:", error);
      setAuthError(error.message || "Google sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      setDomains([]);
      setCheckResults({});
      setSelectedDomain(null);
      setBackendConnected(false);
      setBilling(null);
      setBillingOpen(false);
      window.history.replaceState(null, "", window.location.pathname);
      setPublicRoute("home");
    }
  }

  function openLoginPage() {
    setAuthError("");
    window.location.hash = "login";
    setPublicRoute("login");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openLandingPage() {
    setAuthError("");
    window.history.replaceState(null, "", window.location.pathname);
    setPublicRoute("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadDomains(showLoader = true) {
    try {
      if (showLoader) setLoading(true);

      const response = await fetch(`${API_URL}/api/domains`, {
        credentials: "include",
      });
      if (response.status === 401) {
        setUser(null);
        throw new Error("Your session expired. Please sign in again.");
      }
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

  async function loadBilling() {
    try {
      setBillingLoading(true);
      const response = await fetch(`${API_URL}/api/billing/subscription`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not load billing details.");
      }

      setBilling(data);
    } catch (error) {
      console.error("Load billing error:", error);
    } finally {
      setBillingLoading(false);
    }
  }

  async function verifySubscription(checkoutResponse) {
    const response = await fetch(`${API_URL}/api/billing/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(checkoutResponse),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Subscription verification failed.");
    }

    setBilling(data.billing);
    setBillingOpen(false);
    showMessage(`${data.billing.plan.name} plan activated.`);
  }

  async function startSubscription(planKey) {
    if (planKey === "free") return;

    try {
      setCheckoutPlan(planKey);
      const response = await fetch(`${API_URL}/api/billing/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_key: planKey }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not start checkout.");
      }

      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "DomainPulse",
        description: `${data.plan.name} monthly plan`,
        prefill: data.customer,
        notes: { plan_key: data.plan.key },
        theme: { color: "#181b19" },
        handler: async (checkoutResponse) => {
          try {
            await verifySubscription(checkoutResponse);
          } catch (error) {
            console.error("Subscription verification error:", error);
            showMessage(error.message, "error");
          }
        },
      });
      checkout.on("payment.failed", (event) => {
        showMessage(
          event.error?.description || "Payment authorisation failed.",
          "error"
        );
      });
      checkout.open();
    } catch (error) {
      console.error("Start subscription error:", error);
      showMessage(error.message || "Could not start checkout.", "error");
    } finally {
      setCheckoutPlan("");
    }
  }

  async function cancelSubscription() {
    const confirmed = window.confirm(
      "Cancel this subscription at the end of the current billing cycle?"
    );
    if (!confirmed) return;

    try {
      setCancelingSubscription(true);
      const response = await fetch(`${API_URL}/api/billing/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not cancel the subscription.");
      }

      setBilling(data.billing);
      showMessage(data.message);
    } catch (error) {
      console.error("Cancel subscription error:", error);
      showMessage(error.message || "Could not cancel the subscription.", "error");
    } finally {
      setCancelingSubscription(false);
    }
  }

  useEffect(() => {
    loadSession();
    return () => window.clearTimeout(messageTimer.current);
  }, []);

  useEffect(() => {
    function syncPublicRoute() {
      setPublicRoute(window.location.hash === "#login" ? "login" : "home");
    }

    window.addEventListener("hashchange", syncPublicRoute);
    return () => window.removeEventListener("hashchange", syncPublicRoute);
  }, []);

  useEffect(() => {
    if (user) {
      loadDomains();
      loadBilling();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        if (!deletingDomain) setSelectedDomain(null);
        setMobileMenuOpen(false);
        if (!bulkImporting) setBulkOpen(false);
        if (!checkoutPlan) setBillingOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bulkImporting, checkoutPlan, deletingDomain]);

  useEffect(() => {
    setDeleteConfirming(false);
  }, [selectedDomain]);

  useEffect(() => {
    const domainName = selectedDomain ? getDomainName(selectedDomain) : "";

    if (!domainName) {
      setDomainHistory([]);
      setHistoryLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        setHistoryLoading(true);
        const response = await fetch(
          `${API_URL}/api/history/${encodeURIComponent(domainName)}`,
          { credentials: "include", signal: controller.signal }
        );

        if (!response.ok) throw new Error("Could not load monitoring history.");
        const data = await response.json();
        setDomainHistory(Array.isArray(data) ? data : []);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Load history error:", error);
          setDomainHistory([]);
        }
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => controller.abort();
  }, [selectedDomain]);

  async function addDomain(event) {
    event.preventDefault();
    const cleanDomain = normalizeDomain(domain);

    if (!DOMAIN_PATTERN.test(cleanDomain)) {
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
        credentials: "include",
        body: JSON.stringify({ domain: cleanDomain }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || "Could not add domain.");
      }

      setDomain("");
      setBackendConnected(true);
      showMessage(
        data.email_status === "sent"
          ? `${cleanDomain} is now monitored. Confirmation email sent to ${user.email}.`
          : `${cleanDomain} is now being monitored.`
      );
      await loadDomains(false);
    } catch (error) {
      console.error("Add domain error:", error);
      showMessage(error.message || "Could not add the domain.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function importDomains(event) {
    event.preventDefault();

    if (bulkEntries.length === 0) {
      showMessage("Paste at least one domain to import.", "error");
      return;
    }

    if (bulkEntries.length > 100) {
      showMessage("Import up to 100 domains at a time.", "error");
      return;
    }

    try {
      setBulkImporting(true);
      const response = await fetch(`${API_URL}/api/domains/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domains: bulkEntries }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not import domains.");
      }

      const addedCount = Array.isArray(data.added) ? data.added.length : 0;
      const duplicateCount = Array.isArray(data.duplicates)
        ? data.duplicates.length
        : 0;
      const invalidCount = Array.isArray(data.invalid) ? data.invalid.length : 0;
      const failedBaselines = data.baseline?.failed || 0;
      const summary = `${addedCount} added · ${duplicateCount} duplicate${
        duplicateCount === 1 ? "" : "s"
      } · ${invalidCount} invalid`;

      showMessage(
        data.email_status === "sent"
          ? `${summary} · Summary email sent.`
          : summary,
        failedBaselines > 0 || addedCount === 0 ? "warning" : "success"
      );
      setBulkInput("");
      setBulkOpen(false);
      setBackendConnected(true);
      await loadDomains(false);
    } catch (error) {
      console.error("Bulk import error:", error);
      showMessage(error.message || "Could not import domains.", "error");
    } finally {
      setBulkImporting(false);
    }
  }

  async function checkDomain(domainName, silent = false) {
    try {
      setCheckingDomain(domainName);
      const response = await fetch(
        `${API_URL}/api/check/${encodeURIComponent(domainName)}`,
        { method: "POST", credentials: "include" }
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
      const checkedAt = data.checked_at || new Date().toISOString();

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

  async function removeDomain() {
    if (!selectedName) return;

    try {
      setDeletingDomain(true);
      const response = await fetch(
        `${API_URL}/api/domains/${encodeURIComponent(selectedName)}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Could not remove ${selectedName}.`);
      }

      setDomains((current) =>
        current.filter((item) => getDomainName(item) !== selectedName)
      );
      setCheckResults((current) => {
        const next = { ...current };
        delete next[selectedName];
        return next;
      });
      setSelectedDomain(null);
      setDeleteConfirming(false);
      setLastSyncedAt(new Date());
      showMessage(`${selectedName} was removed from monitoring.`);
    } catch (error) {
      console.error("Remove domain error:", error);
      showMessage(error.message || "Could not remove the domain.", "error");
    } finally {
      setDeletingDomain(false);
    }
  }

  const billingPlan = billing?.plan || {
    key: "free",
    name: "Free",
    domain_limit: 5,
  };
  const billingUsage = billing?.usage || {
    domains: domainCount,
    domain_limit: billingPlan.domain_limit,
    remaining_domains: Math.max(billingPlan.domain_limit - domainCount, 0),
  };
  const usagePercentage = Math.min(
    (billingUsage.domains / Math.max(billingUsage.domain_limit, 1)) * 100,
    100
  );
  const selectedName = selectedDomain ? getDomainName(selectedDomain) : "";
  const selectedResult = selectedName ? checkResults[selectedName] : null;
  const selectedNameservers = selectedResult?.nameservers || getNameservers(selectedDomain);
  const selectedStatus = selectedDomain
    ? getDomainStatus(selectedDomain, checkResults)
    : "pending";

  if (!user) {
    return publicRoute === "login" ? (
      <LoginPage
        onBack={openLandingPage}
        onGoogleSuccess={handleGoogleSuccess}
        authError={authError}
        setAuthError={setAuthError}
      />
    ) : (
      <LandingPage onLogin={openLoginPage} />
    );
  }

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
          <button
            className="nav-item"
            type="button"
            onClick={() => setBillingOpen(true)}
          >
            <Zap size={17} />
            <span>Plans & billing</span>
          </button>

        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-plan-card">
            <div className="sidebar-plan-heading">
              <span>{billingLoading ? "Loading plan" : `${billingPlan.name} plan`}</span>
              <strong>{billingUsage.domains}/{billingUsage.domain_limit}</strong>
            </div>
            <div className="sidebar-plan-meter" aria-hidden="true">
              <span style={{ width: `${usagePercentage}%` }} />
            </div>
            <button type="button" onClick={() => setBillingOpen(true)}>
              {billingPlan.key === "portfolio" ? "Manage billing" : "View plans"}
            </button>
          </div>

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
            {user.picture ? (
              <img className="avatar avatar-image" src={user.picture} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar">{user.name?.charAt(0).toUpperCase() || "U"}</span>
            )}
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <button className="profile-logout" type="button" onClick={logout} title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
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
            <button
              className="button button-dark-secondary"
              type="button"
              onClick={() => setBulkOpen(true)}
              disabled={adding}
            >
              <Copy size={16} />
              Bulk add
            </button>
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

      {billingOpen && (
        <>
          <button
            className="billing-modal-scrim"
            type="button"
            aria-label="Close plans and billing"
            disabled={Boolean(checkoutPlan)}
            onClick={() => setBillingOpen(false)}
          />
          <section
            className="billing-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="billing-modal-title"
          >
            <header className="billing-modal-header">
              <div>
                <p className="section-label">Plans & billing</p>
                <h2 id="billing-modal-title">Protect the right-sized portfolio.</h2>
                <p>
                  Current usage: {billingUsage.domains} of {billingUsage.domain_limit} domains.
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close plans and billing"
                disabled={Boolean(checkoutPlan)}
                onClick={() => setBillingOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            {!billing?.enforcement_enabled && (
              <div className="billing-test-banner">
                <Zap size={16} />
                <span>
                  Test rollout: plan limits are visible but not enforced yet.
                </span>
              </div>
            )}

            {billing?.subscription && (
              <div className="current-subscription-card">
                <div>
                  <span>Current subscription</span>
                  <strong>{billingPlan.name} · {billing.subscription.status}</strong>
                  {billing.subscription.current_end && (
                    <small>
                      Current cycle ends {formatDate(billing.subscription.current_end)}
                    </small>
                  )}
                </div>
                {billing.subscription.cancel_at_cycle_end ? (
                  <span className="cancellation-scheduled">Cancellation scheduled</span>
                ) : billingPlan.key !== "free" ? (
                  <button
                    type="button"
                    disabled={cancelingSubscription}
                    onClick={cancelSubscription}
                  >
                    {cancelingSubscription ? "Cancelling..." : "Cancel at cycle end"}
                  </button>
                ) : null}
              </div>
            )}

            <div className="billing-plan-grid">
              {PRICING_PLANS.map((plan) => {
                const isCurrent = billingPlan.key === plan.key;
                const isPaid = plan.key !== "free";
                const checkoutDisabled =
                  isCurrent ||
                  !isPaid ||
                  !billing?.checkout_configured ||
                  Boolean(checkoutPlan) ||
                  (billing?.subscription && billingPlan.key !== "free");

                return (
                  <article
                    className={`billing-plan-card ${plan.recommended ? "billing-plan-featured" : ""}`}
                    key={plan.key}
                  >
                    <div className="billing-plan-topline">
                      <span>{plan.name}</span>
                      {plan.recommended && <small>Popular</small>}
                    </div>
                    <div className="billing-plan-price">
                      <strong>${plan.price}</strong>
                      <span>{plan.price ? "/mo" : "forever"}</span>
                    </div>
                    <p>Up to {plan.domainLimit.toLocaleString()} domains</p>
                    <button
                      type="button"
                      disabled={checkoutDisabled}
                      onClick={() => startSubscription(plan.key)}
                    >
                      {checkoutPlan === plan.key
                        ? "Opening checkout..."
                        : isCurrent
                          ? "Current plan"
                          : !billing?.checkout_configured
                            ? "Setup required"
                            : `Choose ${plan.name}`}
                    </button>
                  </article>
                );
              })}
            </div>

            <footer className="billing-modal-footer">
              Razorpay securely processes payment details. DomainPulse never stores card data.
            </footer>
          </section>
        </>
      )}

      {bulkOpen && (
        <>
          <button
            className="bulk-modal-scrim"
            type="button"
            aria-label="Close bulk domain import"
            onClick={() => !bulkImporting && setBulkOpen(false)}
          />
          <section
            className="bulk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-import-title"
          >
            <header className="bulk-modal-header">
              <div>
                <p className="section-label">Portfolio onboarding</p>
                <h2 id="bulk-import-title">Bulk add domains</h2>
                <p>Paste up to 100 domains, one per line or separated by commas.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close bulk domain import"
                disabled={bulkImporting}
                onClick={() => setBulkOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <form className="bulk-form" onSubmit={importDomains}>
              <label htmlFor="bulk-domains">Domains to monitor</label>
              <textarea
                id="bulk-domains"
                autoFocus
                value={bulkInput}
                onChange={(event) => setBulkInput(event.target.value)}
                placeholder={"example.com\nportfolio.org\nbrand.xyz\nstartup.io\nproduct.ai"}
                disabled={bulkImporting}
              />

              <div className="bulk-import-meta">
                <span className={bulkEntries.length > 100 ? "bulk-limit-error" : ""}>
                  {bulkEntries.length} / 100 entries
                </span>
                <span>Duplicates and invalid entries are skipped safely.</span>
              </div>

              <div className="bulk-preview" aria-label="Bulk import preview">
                <span className="bulk-preview-valid">
                  <Check size={13} /> {bulkPreview.valid} valid
                </span>
                <span className="bulk-preview-duplicate">
                  <Copy size={13} /> {bulkPreview.duplicate} duplicate
                </span>
                <span className="bulk-preview-invalid">
                  <AlertTriangle size={13} /> {bulkPreview.invalid} invalid
                </span>
              </div>

              <div className="bulk-modal-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={bulkImporting}
                  onClick={() => setBulkOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={
                    bulkImporting ||
                    bulkPreview.valid === 0 ||
                    bulkEntries.length > 100
                  }
                >
                  {bulkImporting ? (
                    <RefreshCw className="spin" size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {bulkImporting
                    ? "Importing and checking..."
                    : bulkPreview.valid > 0
                      ? `Import ${bulkPreview.valid} domain${
                          bulkPreview.valid === 1 ? "" : "s"
                        }`
                      : "Import domains"}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {selectedDomain && (
        <>
          <button
            className="drawer-scrim"
            type="button"
            aria-label="Close domain details"
            disabled={deletingDomain}
            onClick={() => setSelectedDomain(null)}
          />
          <aside className="domain-drawer" aria-label={`${selectedName} details`}>
            <div className="drawer-header">
              <div>
                <p className="section-label">Domain details</p>
                <h2>{selectedName}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close domain details"
                disabled={deletingDomain}
                onClick={() => setSelectedDomain(null)}
              >
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

            <div className="drawer-section">
              <div className="drawer-section-title">
                <span>Monitoring history</span>
                <small>{domainHistory.length}</small>
              </div>
              {historyLoading ? (
                <div className="history-loading">
                  <span className="state-loader" />
                  Loading history
                </div>
              ) : domainHistory.length ? (
                <div className="history-list">
                  {domainHistory.map((event) => (
                    <article className={`history-event history-${event.event_type}`} key={event.id}>
                      <span className="history-event-dot" />
                      <div>
                        <strong>
                          {event.event_type === "change"
                            ? "Nameservers changed"
                            : "Monitoring baseline created"}
                        </strong>
                        <small>
                          {formatDateTime(event.checked_at)} · {event.source}
                        </small>
                        {event.event_type === "change" && (
                          <p>
                            {(event.previous_nameservers || []).join(", ") || "None"}
                            <span>→</span>
                            {(event.current_nameservers || []).join(", ") || "None"}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="drawer-empty">
                  Run the first check to create a monitoring baseline.
                </div>
              )}
            </div>

            <div className="drawer-meta">
              <div><span>Monitoring</span><strong>Enabled</strong></div>
              <div><span>Added</span><strong>{formatDate(selectedDomain.created_at)}</strong></div>
              <div><span>Last checked</span><strong>{selectedResult?.checkedAt ? formatDate(selectedResult.checkedAt) : "No recent check"}</strong></div>
            </div>

            {deleteConfirming ? (
              <div className="delete-confirmation" role="alert">
                <span className="delete-confirmation-icon">
                  <Trash2 size={18} />
                </span>
                <div>
                  <strong>Remove {selectedName}?</strong>
                  <p>
                    This permanently deletes its monitoring history and alerts
                    from your account.
                  </p>
                </div>
                <div className="delete-confirmation-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={deletingDomain}
                    onClick={() => setDeleteConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={deletingDomain}
                    onClick={removeDomain}
                  >
                    {deletingDomain ? (
                      <RefreshCw className="spin" size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    {deletingDomain ? "Removing..." : "Yes, remove domain"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="drawer-actions">
                <button
                  className="button button-primary drawer-check"
                  type="button"
                  disabled={checkingDomain === selectedName || checkingAll}
                  onClick={() => checkDomain(selectedName)}
                >
                  <RefreshCw
                    className={checkingDomain === selectedName ? "spin" : ""}
                    size={16}
                  />
                  {checkingDomain === selectedName
                    ? "Checking nameservers..."
                    : "Run fresh check"}
                </button>
                <button
                  className="button button-danger-outline"
                  type="button"
                  disabled={checkingDomain === selectedName || checkingAll}
                  onClick={() => setDeleteConfirming(true)}
                >
                  <Trash2 size={16} />
                  Remove from monitor
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}

export default App;
