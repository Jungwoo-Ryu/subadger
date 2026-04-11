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

/**
 * Ensures `public.profiles` exists for the signed-in user (required by the FastAPI API).
 * Tries `profiles` first — this repo's Supabase schema has no `public.users` table.
 */
export async function ensureProfileRecord(user: AuthUser): Promise<ProfileTable> {
  try {
    return await ensureProfilesRow(user);
  } catch (profilesErr) {
    try {
      return await ensureUsersRow(user);
    } catch {
      throw new Error(
        `Could not create profiles row for ${user.email}. ${profilesErr instanceof Error ? profilesErr.message : String(profilesErr)}`,
      );
    }
  }
}
