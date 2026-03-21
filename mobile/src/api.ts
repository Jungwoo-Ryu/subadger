import Constants from "expo-constants";

export function getApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromConfig = (
    Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
  )?.apiBaseUrl?.trim();
  if (fromConfig) return fromConfig.replace(/\/$/, "");
  return "http://127.0.0.1:8000";
}

/** Fallback if env set (before login); prefer `useAuth().userId` */
export function getFallbackUserId(): string | undefined {
  return process.env.EXPO_PUBLIC_DEMO_USER_ID;
}

export type FeedListing = {
  listing_id: string;
  host_id: string;
  host_name: string;
  photos: string[];
  price_monthly: number;
  start_date: string;
  end_date: string;
  address: string;
  lat: number | null;
  lng: number | null;
  room_type: string;
  furnished: boolean;
  rules: string;
  utilities?: string | null;
};

export async function fetchFeed(userId: string): Promise<FeedListing[]> {
  const base = getApiBase();
  const url = `${base}/v1/feed?user_id=${encodeURIComponent(userId)}&limit=20&offset=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Feed ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function postSwipe(
  userId: string,
  listingId: string,
  action: "like" | "pass",
  body?: string
): Promise<void> {
  const base = getApiBase();
  const res = await fetch(`${base}/v1/swipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      listing_id: listingId,
      action,
      body: body?.trim() || null,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Swipe ${res.status}`);
  }
}
