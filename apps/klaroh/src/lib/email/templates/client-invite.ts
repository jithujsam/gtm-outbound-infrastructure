/** `reportPath` is the client's private portal path (/c/<slug>/<token>): the token is what opens the report. */
export function clientInviteEmailHtml(clientName: string, agencyName: string, reportPath: string): string {
  const dashboardUrl = `https://klaroh.app${reportPath}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your campaign dashboard is ready</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;padding:0 24px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:40px;">
              <span style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:24px;font-weight:700;color:#003E2A;letter-spacing:-0.5px;">Klaroh</span>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom:16px;">
              <h1 style="margin:0;font-size:28px;font-weight:600;color:#111827;line-height:1.3;">
                Hi ${clientName},
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#4B5563;">
                I've set up a live dashboard for your campaigns so you can see exactly how things are performing in real time — no waiting for reports.
              </p>
              <p style="margin:0;font-size:16px;line-height:1.6;color:#4B5563;">
                Click below to view your dashboard and track results as they come in.
              </p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding-bottom:16px;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;background:#003E2A;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.1px;">
                View your dashboard
              </a>
            </td>
          </tr>

          <!-- URL hint -->
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:13px;color:#9CA3AF;">
                Or copy this link: <a href="${dashboardUrl}" style="color:#003E2A;">${dashboardUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#4B5563;">
                Looking forward to sharing the results with you.
              </p>
              <p style="margin:8px 0 0;font-size:16px;font-weight:600;color:#111827;">
                ${agencyName}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="border-top:1px solid #E5E7EB;padding-top:24px;">
              <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.5;">
                This dashboard was set up for you by ${agencyName} using Klaroh.
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
