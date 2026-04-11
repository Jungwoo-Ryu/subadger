import type { User } from '@supabase/supabase-js';

import { getEmailConfirmationRedirectUrl } from './authRedirect';
import { getSupabaseClient } from './supabase';

export type AuthRole = 'seeker' | 'owner';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
}

interface SignInParams {
  email: string;
  password: string;
  fallbackRole: AuthRole;
}

interface SignUpParams {
  name: string;
  email: string;
  password: string;
  role: AuthRole;
}

interface SignUpResult {
  user: AuthUser | null;
  requiresEmailConfirmation: boolean;
}

function roleToMetadata(role: AuthRole): 'seeker' | 'host' {
  return role === 'owner' ? 'host' : 'seeker';
}

function roleFromMetadata(rawRole: unknown, fallbackRole: AuthRole): AuthRole {
  if (rawRole === 'host' || rawRole === 'owner') {
    return 'owner';
  }

  if (rawRole === 'seeker') {
    return 'seeker';
  }

  return fallbackRole;
}

function getDisplayName(user: User) {
  const metadata = user.user_metadata ?? {};
  const emailPrefix = user.email?.split('@')[0] ?? 'User';

  return (
    metadata.display_name ??
    metadata.name ??
    metadata.full_name ??
    emailPrefix
  );
}

export function mapSupabaseUser(user: User, fallbackRole: AuthRole): AuthUser {
  const metadata = user.user_metadata ?? {};
  const metadataRole = metadata.role ?? metadata.current_app_mode;

  return {
    id: user.id,
    name: String(getDisplayName(user)),
    email: user.email ?? '',
    role: roleFromMetadata(metadataRole, fallbackRole),
  };
}

export async function signInWithEmailPassword({
  email,
  password,
  fallbackRole,
}: SignInParams): Promise<AuthUser> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Sign-in succeeded without a user session.');
  }

  return mapSupabaseUser(data.user, fallbackRole);
}

export async function signUpWithEmailPassword({
  name,
  email,
  password,
  role,
}: SignUpParams): Promise<SignUpResult> {
  const metadataRole = roleToMetadata(role);
  const emailRedirectTo = getEmailConfirmationRedirectUrl();
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: name,
        role: metadataRole,
        current_app_mode: metadataRole,
      },
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user ? mapSupabaseUser(data.user, role) : null,
    requiresEmailConfirmation: !data.session,
  };
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error) {
    throw error;
  }
}
