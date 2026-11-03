import { getResend } from '@/lib/resend';
import { createAdminClient } from '@/lib/supabase/admin';

// Sender address. Production delivery requires a domain verified in Resend;
// set EMAIL_FROM_ADDRESS once klaroh.app is verified (falls back to Resend's sandbox sender).
export const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

interface SendEmailParams {
  to_email: string;
  to_name?: string;
  from_email: string;
  from_name?: string;
  subject: string;
  html: string;
  text?: string;
  email_type: 'onboarding' | 'client_invite' | 'weekly_summary';
  user_id?: string;
  client_id?: string;
}

interface SendEmailResult {
  success: boolean;
  resend_id?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const {
    to_email,
    to_name,
    from_email,
    from_name,
    subject,
    html,
    text,
    email_type,
    user_id,
    client_id,
  } = params;

  const from = from_name ? `${from_name} <${from_email}>` : from_email;
  const admin = createAdminClient();

  let resendId: string | undefined;
  let status: 'sent' | 'failed' = 'sent';
  let errorMessage: string | undefined;
  let metadata: Record<string, unknown> | undefined;

  try {
    const result = await getResend().emails.send({
      from,
      to: to_name ? `${to_name} <${to_email}>` : to_email,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    resendId = result.data?.id;
    metadata = result.data as unknown as Record<string, unknown>;
  } catch (err: unknown) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await admin.from('email_logs').insert({
    user_id: user_id ?? null,
    to_email,
    to_name: to_name ?? null,
    from_email,
    from_name: from_name ?? null,
    subject,
    email_type,
    client_id: client_id ?? null,
    resend_id: resendId ?? null,
    status,
    error_message: errorMessage ?? null,
    body_html: html,
    body_text: text ?? null,
    metadata: metadata ?? null,
  });

  if (status === 'failed') {
    return { success: false, error: errorMessage };
  }

  return { success: true, resend_id: resendId };
}
