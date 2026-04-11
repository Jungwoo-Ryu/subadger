/**
 * Supabase email confirmation redirect. Must be listed in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
export function getEmailConfirmationRedirectUrl(): string | undefined {
  const explicit = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.replace(/\/$/, '').trim();
  if (explicit) {
    return explicit;
  }
  const api = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '').trim();
  if (api) {
    return `${api}/auth/email-confirmed`;
  }
  return undefined;
}
