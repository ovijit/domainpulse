import { Resend } from "resend";

export function createEmailService(options = {}) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const from = options.from ?? process.env.ALERT_FROM_EMAIL;
  const frontendUrl = (
    options.frontendUrl ??
    process.env.FRONTEND_URL ??
    "https://domainpulsehq.com"
  ).replace(/\/$/, "");
  const resend = options.resendClient ?? (apiKey ? new Resend(apiKey) : null);

  async function sendEmail({ to, subject, text }) {
    if (!resend || !from) {
      return {
        status: "skipped",
        error: "RESEND_API_KEY or ALERT_FROM_EMAIL is not configured",
      };
    }

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      text,
    });

    if (error) {
      throw new Error(error.message || "Resend rejected the email");
    }

    return { status: "sent", providerId: data?.id || null };
  }

  async function sendDomainAdded({ to, name, domain }) {
    const greeting = name ? `Hi ${name},` : "Hello,";

    return sendEmail({
      to,
      subject: `Monitoring started for ${domain}`,
      text: `${greeting}

${domain} has been added to your DomainPulse account.

DomainPulse will monitor its authoritative nameservers and alert you if an unexpected change is detected.

Open your dashboard: ${frontendUrl}

— DomainPulse`,
    });
  }

  async function sendNameserverChange({
    to,
    name,
    domain,
    previousNameservers,
    currentNameservers,
  }) {
    const greeting = name ? `Hi ${name},` : "Hello,";
    const previous = previousNameservers.length
      ? previousNameservers.join(", ")
      : "No previous nameservers";
    const current = currentNameservers.length
      ? currentNameservers.join(", ")
      : "No nameservers resolved";

    return sendEmail({
      to,
      subject: `Nameserver change detected for ${domain}`,
      text: `${greeting}

DomainPulse detected a nameserver change for ${domain}.

Previous nameservers:
${previous}

Current nameservers:
${current}

Review your portfolio: ${frontendUrl}

If you expected this change, no action is required. If not, check your registrar account immediately.

— DomainPulse`,
    });
  }

  return { sendDomainAdded, sendNameserverChange };
}
