/**
 * FastAPI client (EXPO_PUBLIC_API_URL). All routes use `user_id` query/body until JWT middleware exists.
 */

import type { PreferredGender, Property, RoomType } from '../data';

export type FeedListingDto = {
  listing_id: string;
  host_id: string;
  host_name: string;
  title: string;
  photos: string[];
  price_monthly: number;
  start_date: string;
  end_date: string;
  address: string;
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
  room_type: string;
  furnished: boolean;
  rules: string;
  utilities?: string | null;
  utilities_included?: boolean;
  amenities?: Record<string, unknown>;
  gender_pref?: string | null;
  floor_plan_url?: string | null;
  deposit?: number | null;
  application_fee?: number | null;
  dist_mi?: number | null;
};

function asRoomType(s: string): RoomType {
  const x = s.trim();
  const map: Record<string, RoomType> = {
    Studio: 'Studio',
    '1BR': '1BR',
    '2BR': '2BR',
    'Shared Room': 'Shared Room',
    'Private Room': 'Private Room',
  };
  return map[x] ?? (x.includes('share') ? 'Shared Room' : x.includes('1') ? '1BR' : 'Studio');
}

function asGender(s?: string | null): PreferredGender {
  if (!s) return 'Any';
  const l = s.toLowerCase();
  if (l.includes('female')) return 'Female';
  if (l.includes('male')) return 'Male';
  return 'Any';
}

/** Maps API row → in-app Property (mock shape). */
export function mapFeedListingToProperty(f: FeedListingDto): Property {
  const rulesText = (f.rules || '').trim();
  const rules = rulesText
    ? rulesText.split(/\n|;/).map(r => r.trim()).filter(Boolean)
    : ['—'];
  return {
    id: f.listing_id,
    hostId: f.host_id,
    apartmentName: f.title?.trim() || f.address.split(',')[0] || 'Listing',
    address: f.address,
    originalRentPrice: f.price_monthly,
    subletPrice: f.price_monthly,
    avgUtilityFee: f.utilities_included ? 0 : 50,
    availableStartDate: f.start_date,
    availableEndDate: f.end_date,
    preferredGender: asGender(f.gender_pref),
    description: f.neighborhood ? `${f.neighborhood}\n${f.utilities || ''}` : f.utilities || '',
    imageUrls: f.photos.length ? f.photos : ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80'],
    coordinates: {
      latitude: f.lat ?? 43.0731,
      longitude: f.lng ?? -89.4012,
    },
    roomType: asRoomType(f.room_type),
    furnished: f.furnished,
    rules,
  };
}

/** Resolved API base URL, or null if unset (does not throw). */
export function getExpoPublicApiUrl(): string | null {
  const u = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '').trim();
  return u || null;
}

const base = () => {
  const u = getExpoPublicApiUrl();
  if (!u) throw new Error('EXPO_PUBLIC_API_URL is not set');
  return u;
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type FeedResponseDto = { items: FeedListingDto[]; next_offset: number };

export function feedQueryString(
  userId: string,
  offset: number,
  filters: Record<string, string | number | boolean | undefined>,
): string {
  const q = new URLSearchParams({ user_id: userId, offset: String(offset), limit: '20' });
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return `/v1/feed?${q.toString()}`;
}

export async function fetchFeed(userId: string, offset: number, filters: Record<string, string | undefined>) {
  return http<FeedResponseDto>(feedQueryString(userId, offset, filters));
}

export async function postSwipe(payload: {
  user_id: string;
  listing_id: string;
  action: 'like' | 'pass';
  body?: string | null;
  /** Host → seeker swipe: seeker profile id (listing must belong to swiper). */
  recipient_user_id?: string | null;
}) {
  return http<{ ok: boolean }>('/v1/swipe', { method: 'POST', body: JSON.stringify(payload) });
}

export async function postSuperLike(payload: { user_id: string; listing_id: string; body: string }) {
  return http<{ ok: boolean; message?: string | null }>('/v1/swipe/super-like', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function pushFeedStack(userId: string, listingId: string) {
  return http<{ ok: boolean }>('/v1/feed/stack/push', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, listing_id: listingId }),
  });
}

export async function popFeedStack(userId: string) {
  return http<{ listing: FeedListingDto | null }>(`/v1/feed/stack/pop?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
  });
}

export type LikeItemDto = {
  interest_id: string;
  listing_id: string;
  title: string;
  address: string;
  price_monthly: number;
  photo_url?: string | null;
  counterparty_name: string;
  state: string;
  note?: string | null;
  created_at: string;
  conversation_id?: string | null;
};

export async function fetchLikesSent(userId: string) {
  return http<{ items: LikeItemDto[] }>(`/v1/likes/sent?user_id=${encodeURIComponent(userId)}`);
}

export async function fetchLikesReceived(userId: string) {
  return http<{ items: LikeItemDto[] }>(`/v1/likes/received?user_id=${encodeURIComponent(userId)}`);
}

export async function postInterestRespond(
  interestId: string,
  payload: { user_id: string; action: 'accept' | 'decline' },
) {
  return http<{ ok: boolean; conversation_id?: string | null; match_id?: string | null }>(
    `/v1/likes/${encodeURIComponent(interestId)}/respond`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export type SuperLikeItemDto = {
  super_like_id: string;
  listing_id: string;
  title: string;
  address: string;
  price_monthly: number;
  body: string;
  counterparty_name: string;
  created_at: string;
};

export async function fetchSuperLikesReceived(userId: string) {
  return http<{ items: SuperLikeItemDto[] }>(
    `/v1/super-likes/received?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function fetchSuperLikesSent(userId: string) {
  return http<{ items: SuperLikeItemDto[] }>(
    `/v1/super-likes/sent?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function fetchProfileCompleteness(userId: string) {
  return http<{ percent: number; missing: string[] }>(
    `/v1/profiles/completeness?user_id=${encodeURIComponent(userId)}`,
  );
}

export type ProfileMeDto = {
  id: string;
  email: string;
  role: string;
  display_name?: string | null;
  avatar_url?: string | null;
  school_email?: string | null;
  school_email_verified_at?: string | null;
  grade_or_year?: string | null;
  affiliation?: string | null;
  roommate_prefs: Record<string, unknown>;
  seeker?: {
    budget_min: number;
    budget_max: number;
    stay_start_date: string;
    stay_end_date: string;
    room_type_pref?: string | null;
    furnished_pref?: boolean | null;
    gender_pref?: string | null;
    prefs: Record<string, unknown>;
  } | null;
};

export async function fetchProfileMe(userId: string) {
  return http<ProfileMeDto>(`/v1/profiles/me?user_id=${encodeURIComponent(userId)}`);
}

export async function patchProfileMe(payload: {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  school_email?: string | null;
  grade_or_year?: string | null;
  affiliation?: string | null;
  roommate_prefs?: Record<string, unknown> | null;
}) {
  return http<{ ok: boolean; updated: boolean }>('/v1/profiles/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function patchSeekerPrefsMe(payload: {
  user_id: string;
  budget_min?: number;
  budget_max?: number;
  stay_start_date?: string;
  stay_end_date?: string;
  room_type_pref?: string | null;
  furnished_pref?: boolean | null;
  gender_pref?: string | null;
  prefs?: Record<string, unknown> | null;
}) {
  return http<{ ok: boolean; updated: boolean }>('/v1/profiles/me/seeker', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type ChatMessageDto = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_url?: string | null;
  created_at: string;
};

export type ConversationSummaryDto = {
  conversation_id: string;
  match_id: string;
  listing_id: string | null;
  other_user_id: string;
  other_display_name: string;
  last_message_at: string | null;
};

export async function fetchConversations(userId: string) {
  return http<ConversationSummaryDto[]>(
    `/v1/chat/conversations?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function fetchChatMessages(conversationId: string, userId: string) {
  return http<ChatMessageDto[]>(
    `/v1/chat/conversations/${conversationId}/messages?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function postChatMessage(
  conversationId: string,
  userId: string,
  body: { body?: string; image_url?: string | null },
) {
  return http<ChatMessageDto>(`/v1/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...body }),
  });
}
