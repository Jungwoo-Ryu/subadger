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

export const DUMMY_LISTINGS: FeedListing[] = [
  {
    listing_id: "dummy-apt-1",
    host_id: "host-demo-1",
    host_name: "Mina",
    photos: ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80"],
    price_monthly: 820,
    start_date: "2026-05-01",
    end_date: "2026-08-20",
    address: "421 W Gorham St, Madison, WI",
    lat: 43.0767,
    lng: -89.3953,
    room_type: "Private room",
    furnished: true,
    rules: "No smoking, quiet hours after 11PM",
    utilities: "Water + WiFi included",
  },
  {
    listing_id: "dummy-apt-2",
    host_id: "host-demo-2",
    host_name: "Jun",
    photos: ["https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80"],
    price_monthly: 970,
    start_date: "2026-06-01",
    end_date: "2026-12-31",
    address: "15 N Broom St, Madison, WI",
    lat: 43.0749,
    lng: -89.392,
    room_type: "1B1B Studio",
    furnished: false,
    rules: "No pets",
    utilities: "Trash + internet included",
  },
  {
    listing_id: "dummy-apt-3",
    host_id: "host-demo-3",
    host_name: "Alex",
    photos: ["https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80"],
    price_monthly: 730,
    start_date: "2026-04-10",
    end_date: "2026-07-31",
    address: "302 E Johnson St, Madison, WI",
    lat: 43.0821,
    lng: -89.3801,
    room_type: "Shared room",
    furnished: true,
    rules: "Cat friendly",
    utilities: "All utilities included",
  },
  {
    listing_id: "dummy-apt-4",
    host_id: "host-demo-4",
    host_name: "Sora",
    photos: ["https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1200&q=80"],
    price_monthly: 1100,
    start_date: "2026-08-15",
    end_date: "2027-01-31",
    address: "778 Regent St, Madison, WI",
    lat: 43.0685,
    lng: -89.4106,
    room_type: "Entire unit",
    furnished: true,
    rules: "No parties",
    utilities: "Electricity excluded",
  },
];

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
