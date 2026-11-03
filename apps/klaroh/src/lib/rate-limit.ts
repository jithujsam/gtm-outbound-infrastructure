import { createAdminClient } from '@/lib/supabase/admin';

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn('rate-limit check failed open:', error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.warn('rate-limit error, failing open:', e);
    return true;
  }
}

export function clientIp(req: { headers: { get(key: string): string | null } }): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
