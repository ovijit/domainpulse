import { Resend } from "resend";

export function createEmailService() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  const frontendUrl = (process.env.FRONTEND_URL || "https://domainpulsehq.com").replace(/\/$/, "");
  const resend = apiKey ? new Resend(apiKey) : null;

  async function sendNameserverChange({ to, name, domain, previousNameservers, currentNameservers }) {
    if (!resend || !from) {
      return {
        status: "skipped",
        error: "RESEND_API_KEY or ALERT_FROM_EMAIL is not configured",
      };
    }

    const greeting = name ? `Hi ${name},` : "Hello,";
    const previous = previousNameservers.length
      ? previousNameservers.join(", ")
      : "No previous nameservers";
    const current = currentNameservers.length
      ? currentNameservers.join(", ")
      : "No nameservers resolved";

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
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

    if (error) {
      throw new Error(error.message || "Resend rejected the alert email");
    }

    return { status: "sent", providerId: data?.id || null };
  }

  return { sendNameserverChange };
}
