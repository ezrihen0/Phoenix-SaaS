/** Mirrors EmailService.isConfigured() (no secrets logged). */
const transport = (process.env.EMAIL_TRANSPORT?.trim() || "smtp").toLowerCase();
const from =
  process.env.SMTP_FROM?.trim()
  || (process.env.PHOENIX_OWNER_EMAIL?.trim()
    ? `Phoenix Fireplace <${process.env.PHOENIX_OWNER_EMAIL.trim()}>`
    : "");
const token =
  process.env.CLOUDFLARE_API_TOKEN?.trim()
  || process.env.CF_API_TOKEN?.trim()
  || process.env.SMTP_PASS?.trim();
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.CF_ACCOUNT_ID?.trim();

let email_configured = false;
if (transport === "cloudflare_api") {
  email_configured = Boolean(from && token && accountId);
} else {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user =
    process.env.SMTP_USER?.trim()
    || (host === "smtp.mx.cloudflare.net" ? "api_token" : undefined);
  email_configured = Boolean(host && port && from && user && token);
}

console.log(
  JSON.stringify({
    email_configured,
    email_transport: transport,
    has_from: Boolean(from),
    has_account_id: Boolean(accountId),
    smtp_configured: email_configured,
  }),
);
