import type { DocumentBrandingSnapshot } from "../documents/pdf/pdf-render.types";

export type InvoiceCustomerEmailContent = {
  branding: Pick<
    DocumentBrandingSnapshot,
    "businessName" | "logoUrl" | "accentColor" | "displayInitials"
  >;
  invoiceNumber: string;
  messagePlain: string;
  magicLinkUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function messagePlainToHtmlParagraphs(messagePlain: string) {
  const trimmed = messagePlain.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const withBreaks = escapeHtml(paragraph).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${withBreaks}</p>`;
    })
    .join("");
}

function resolveAccentColor(accentColor: string | null) {
  const normalized = accentColor?.trim();
  if (normalized && /^#[0-9a-fA-F]{3,8}$/.test(normalized)) {
    return normalized;
  }
  return "#b45309";
}

function buildLogoMarkup(branding: InvoiceCustomerEmailContent["branding"]) {
  const businessName = branding.businessName?.trim() || "Your service provider";
  const logoUrl = branding.logoUrl?.trim();

  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(businessName)}" width="160" style="display:block;max-width:160px;height:auto;border:0;" />`;
  }

  const initials =
    branding.displayInitials?.trim()
    || businessName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");

  return `<div style="display:inline-block;width:56px;height:56px;border-radius:14px;background:#111827;color:#f9fafb;font-size:20px;font-weight:700;line-height:56px;text-align:center;">${escapeHtml(initials)}</div>`;
}

export function buildInvoiceCustomerPlainTextEmail(input: InvoiceCustomerEmailContent) {
  const businessName = input.branding.businessName?.trim() || "Your service provider";
  const message = input.messagePlain.trim();
  const lines = [
    message,
    "",
    `View your invoice securely: ${input.magicLinkUrl}`,
    "",
    businessName,
  ].filter((line, index, array) => !(line === "" && index === array.length - 1));

  return lines.join("\n");
}

export function buildInvoiceCustomerHtmlEmail(input: InvoiceCustomerEmailContent) {
  const businessName = escapeHtml(input.branding.businessName?.trim() || "Your service provider");
  const accent = resolveAccentColor(input.branding.accentColor);
  const messageHtml = messagePlainToHtmlParagraphs(input.messagePlain);
  const magicLinkUrl = escapeHtml(input.magicLinkUrl);
  const invoiceNumber = escapeHtml(input.invoiceNumber);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice ${invoiceNumber}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:28px 28px 12px;text-align:center;background:linear-gradient(180deg,#fafafa,#ffffff);">
                ${buildLogoMarkup(input.branding)}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0;text-align:center;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Invoice ${invoiceNumber}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;">
                ${messageHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 28px 28px;">
                <a href="${magicLinkUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:999px;">VIEW INVOICE</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;text-align:center;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">If you have questions about your service or invoice, reply to this email and our team will assist you.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
                <p style="margin:0;font-size:13px;color:#374151;font-weight:600;">${businessName}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function splitCustomerFirstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return "there";
  }
  return trimmed.split(/\s+/)[0] || "there";
}
