/**
 * Supabase email confirmation redirect. Must be listed in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 * Default path is `/email-confirmed` (backend also serves `/auth/email-confirmed` as an alias).
 */
export function getEmailConfirmationRedirectUrl(): string | undefined {
  const explicit = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.replace(/\/$/, '').trim();
  if (explicit) {
    return explicit;
  }
  const api = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '').trim();
  if (api) {
    // Short path + redirect_slashes=False on API: fewer edge/proxy issues than nested /auth/...
    return `${api}/email-confirmed`;
  }
  return undefined;
}
