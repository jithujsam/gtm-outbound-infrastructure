export function onboardingEmailHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Klaroh</title>
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
                Welcome to Klaroh
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#4B5563;">
                Your account is ready. Start building transparent, real-time dashboards that give your clients complete visibility into their campaigns — and turn reporting into a competitive advantage.
              </p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding-bottom:40px;">
              <a href="https://klaroh.app/dashboard"
                 style="display:inline-block;background:#003E2A;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.1px;">
                Go to your dashboard
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="border-top:1px solid #E5E7EB;padding-top:24px;">
              <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.5;">
                You're receiving this because you created a Klaroh account. If this wasn't you, you can ignore this email.
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
