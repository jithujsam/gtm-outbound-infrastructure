import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, DEFAULT_FROM_EMAIL } from '@/lib/email/send-email';
import { onboardingEmailHtml } from '@/lib/email/templates/onboarding';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const { user_id, email } = await request.json();

    if (!user_id || !email) {
      return NextResponse.json({ error: 'Missing user_id or email' }, { status: 400 });
    }

    // 5 onboarding emails per IP per hour (prevents email-loop abuse on signup)
    if (!(await checkRateLimit(`onboard:${clientIp(request)}`, 5, 3600))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Verify the user actually exists with this id+email via admin client
    // (avoids relying on session cookies which may not be set right after signUp)
    const admin = createAdminClient();
    const { data: { user }, error } = await admin.auth.admin.getUserById(user_id);

    if (error || !user || user.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Idempotent: never send the welcome email twice to the same user.
    const { count: alreadySent } = await admin
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('email_type', 'onboarding')
      .eq('status', 'sent');
    if ((alreadySent ?? 0) > 0) {
      return NextResponse.json({ success: true, alreadySent: true });
    }

    const result = await sendEmail({
      to_email: user.email!,
      from_email: DEFAULT_FROM_EMAIL,
      from_name: 'Klaroh',
      subject: 'Welcome to Klaroh',
      html: onboardingEmailHtml(),
      email_type: 'onboarding',
      user_id: user.id,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Error sending onboarding email:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
