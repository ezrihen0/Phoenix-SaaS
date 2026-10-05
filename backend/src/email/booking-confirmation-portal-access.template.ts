export type BookingConfirmationEmailContent = {
  businessName: string;
  customerName: string;
  serviceSummary: string;
  addressLine: string;
  scheduledSummary: string | null;
  portalLoginUrl: string;
  accessCode: string | null;
  codeExpiresAtLabel: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildBookingConfirmationPortalAccessHtml(content: BookingConfirmationEmailContent) {
  const businessName = escapeHtml(content.businessName.trim() || "Phoenix Chimney & Fireplace");
  const codeBlock = content.accessCode
    ? `
      <p style="margin:24px 0 8px;font-size:15px;line-height:1.6;color:#1f2937;">
        Your temporary portal access code (expires ${escapeHtml(content.codeExpiresAtLabel || "soon")}):
      </p>
      <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#b45309;">${escapeHtml(content.accessCode)}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">
        Enter this code on the portal login page. It works once and expires automatically.
      </p>`
    : `
      <p style="margin:16px 0;font-size:14px;line-height:1.6;color:#4b5563;">
        When you are ready, sign in from the portal login page with the email on your account.
      </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px 28px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#b45309;">Booking received</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111827;">Thank you, ${escapeHtml(content.customerName)}</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">
                ${businessName} has received your service request. Your booking details are available in the Phoenix customer portal.
              </p>
              <div style="margin:20px 0;padding:16px 18px;background:#fafafa;border-radius:12px;border:1px solid #e5e7eb;">
                <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Service:</strong> ${escapeHtml(content.serviceSummary)}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Address:</strong> ${escapeHtml(content.addressLine)}</p>
                ${content.scheduledSummary ? `<p style="margin:0;font-size:14px;color:#374151;"><strong>When:</strong> ${escapeHtml(content.scheduledSummary)}</p>` : ""}
              </div>
              ${codeBlock}
              <p style="margin:24px 0 0;text-align:center;">
                <a href="${escapeHtml(content.portalLoginUrl)}" style="display:inline-block;padding:14px 28px;background:#b45309;color:#ffffff;text-decoration:none;font-weight:600;border-radius:999px;">Open customer portal</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildBookingConfirmationPortalAccessPlain(content: BookingConfirmationEmailContent) {
  const lines = [
    `Thank you, ${content.customerName}.`,
    "",
    `${content.businessName} has received your service request.`,
    "",
    `Service: ${content.serviceSummary}`,
    `Address: ${content.addressLine}`,
  ];
  if (content.scheduledSummary) {
    lines.push(`When: ${content.scheduledSummary}`);
  }
  lines.push("", "Your booking details are available in the Phoenix customer portal.");
  if (content.accessCode) {
    lines.push(
      "",
      `Temporary access code (expires ${content.codeExpiresAtLabel || "soon"}): ${content.accessCode}`,
      "",
      `Open portal: ${content.portalLoginUrl}`,
    );
  } else {
    lines.push("", `Sign in when ready: ${content.portalLoginUrl}`);
  }
  return lines.join("\n");
}
