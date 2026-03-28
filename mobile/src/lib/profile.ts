import type { AuthUser } from './auth';
import { getSupabaseClient } from './supabase';

type ProfileTable = 'users' | 'profiles';

function toDatabaseRole(role: AuthUser['role']): 'seeker' | 'host' {
  return role === 'owner' ? 'host' : 'seeker';
}

async function ensureUsersRow(user: AuthUser): Promise<ProfileTable> {
  const client = getSupabaseClient();
  const currentAppMode = toDatabaseRole(user.role);
  const { data, error } = await client
    .from('users')
    .select('id, name, current_app_mode')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    const updates: Record<string, string> = {};

    if (!data.name && user.name) {
      updates.name = user.name;
    }

    if (data.current_app_mode !== currentAppMode) {
      updates.current_app_mode = currentAppMode;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await client
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }
    }

    return 'users';
  }

  const { error: insertError } = await client.from('users').insert({
    id: user.id,
    name: user.name,
    gender: 'Other',
    image_urls: [],
    current_app_mode: currentAppMode,
  });

  if (insertError) {
    throw insertError;
  }

  return 'users';
}

async function ensureProfilesRow(user: AuthUser): Promise<ProfileTable> {
  const client = getSupabaseClient();
  const role = toDatabaseRole(user.role);
  const { data, error } = await client
    .from('profiles')
    .select('id, email, role, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    const updates: Record<string, string> = {};

    if (data.email !== user.email) {
      updates.email = user.email;
    }

    if (data.role !== role) {
      updates.role = role;
    }

    if (data.display_name !== user.name) {
      updates.display_name = user.name;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await client
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }
    }

    return 'profiles';
  }

  const { error: insertError } = await client.from('profiles').insert({
    id: user.id,
    email: user.email,
    role,
    display_name: user.name,
  });

  if (insertError) {
    throw insertError;
  }

  return 'profiles';
}

export async function ensureProfileRecord(user: AuthUser): Promise<ProfileTable> {
  const attempts = [ensureUsersRow, ensureProfilesRow];
  const errors: unknown[] = [];

  for (const attempt of attempts) {
    try {
      return await attempt(user);
    } catch (error) {
      errors.push(error);
    }
  }

  throw new Error(
    `Could not ensure an app profile row for ${user.email}. ${errors
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join(' | ')}`,
  );
}
