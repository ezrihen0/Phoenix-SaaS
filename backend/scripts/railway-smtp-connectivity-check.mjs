import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST?.trim();
const user =
  process.env.SMTP_USER?.trim()
  || (host === "smtp.mx.cloudflare.net" ? "api_token" : undefined);
const pass = process.env.SMTP_PASS?.trim() || process.env.CF_API_TOKEN?.trim();
const from = process.env.SMTP_FROM?.trim();

async function tryPort(port) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
  await transporter.verify();
  return { port, secure: port === 465, ok: true };
}

const ports = [465, 587];
const results = [];
for (const port of ports) {
  try {
    results.push(await tryPort(port));
  } catch (error) {
    results.push({
      port,
      ok: false,
      code: error?.code ?? null,
      message: String(error?.message ?? error).slice(0, 120),
    });
  }
}

console.log(JSON.stringify({ host, from_configured: Boolean(from), results }, null, 2));
