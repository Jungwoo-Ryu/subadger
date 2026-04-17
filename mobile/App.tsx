import React, {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useContext,
  createContext,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
  Text,
  Image,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  StatusBar,
  PanResponder,
  Animated,
  Modal,
  ScrollView,
  TextInput,
  Keyboard,
  useWindowDimensions,
  Pressable,
  GestureResponderEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import MapView, { Marker } from 'react-native-maps';

import {
  AppMode,
  Property,
  SeekerCard,
  MOCK_PROPERTIES,
  MOCK_SEEKER_CARDS,
} from './src/data';

import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import HouseRulesScreen from './src/screens/HouseRulesScreen';
import { SplashScreen } from './src/screens/SplashScreen';
import SeekerAuthScreen from './src/screens/SeekerAuthScreen';
import OwnerAuthScreen from './src/screens/OwnerAuthScreen';
import ProfileOnboardingFlow from './src/screens/ProfileOnboardingFlow';
import { profileOnboardingKey } from './src/storageKeys';
import { BuckyLoading } from './src/components/BuckyLoading';
import { FullscreenBuckyLoading } from './src/components/FullscreenBuckyLoading';
import { type AuthRole, type AuthUser, mapSupabaseUser, signOut as signOutUser } from './src/lib/auth';
import { getEmailConfirmationRedirectUrl } from './src/lib/authRedirect';
import { ensureProfileRecord } from './src/lib/profile';
import { supabase } from './src/lib/supabase';
import {
  fetchChatMessages,
  fetchConversations,
  fetchFeed,
  fetchLikesReceived,
  fetchLikesSent,
  fetchProfileMe,
  getExpoPublicApiUrl,
  fetchSuperLikesReceived,
  fetchSuperLikesSent,
  fetchSuperLikesRemaining,
  mapFeedListingToProperty,
  popFeedStack,
  postChatMessage,
  postInterestRespond,
  postSuperLike,
  postSwipe,
  pushFeedStack,
  type ChatMessageDto,
  type ConversationSummaryDto,
  type LikeItemDto,
  type ProfileMeDto,
  type SuperLikeItemDto,
} from './src/api/subadgerApi';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH;
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 70;
const CARD_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT - 12;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const SUPER_LIKE_DAILY_LIMIT = 3;

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}
const FILTER_PRICE_MIN = 300;
const FILTER_PRICE_MAX = 2500;
const FILTER_PRICE_STEP = 50;
const FILTER_SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Lowest price', value: 'price_asc' },
  { label: 'Highest price', value: 'price_desc' },
  { label: 'Closest', value: 'distance_asc' },
] as const;
const FILTER_DISTANCE_OPTIONS = [
  { label: 'Any', value: '' },
  { label: '1 mi', value: '1' },
  { label: '2 mi', value: '2' },
  { label: '5 mi', value: '5' },
] as const;
const FILTER_AMENITY_OPTIONS = ['Studio', 'Private Room', 'Shared Room', '1BR', '2BR', 'Furnished', 'Unfurnished'] as const;
const FILTER_NEIGHBORHOOD_OPTIONS = ['State Street', 'Langdon', 'University Ave', 'Mifflin', 'Monroe St', 'Regent St', 'Johnson St', 'Breese Terrace', 'Willy Street', 'Observatory'] as const;
const EXPLORE_PRIORITY_LISTING_IDS = ['p8', 'p7', 'p6', 'p5', 'p3', 'p1'] as const;

const USE_API_FEED = Boolean((process.env.EXPO_PUBLIC_API_URL || '').trim());

/**
 * When true: guest preview skips auth prompts and tab/swipe locks (mock deck + Likes/Chat).
 * Branch `demo/full-access`: `true` (teammate demos). Branch `main`: `false`.
 */
const DEMO_DISABLE_GUEST_BARRIER = false;

// ─── Auth types ──────────────────────────────────────────────────────────────
type AuthScreen =
  | 'house-rules'
  | 'role-select'
  | 'guest-dashboard'
  | 'seeker-auth'
  | 'owner-auth'
  | 'profile-onboarding'
  | 'dashboard';
type DashboardTab = 'explore' | 'likes' | 'chat' | 'profile';
type LikeSectionKey = 'received' | 'sent';
type ProfileOnboardingEntry = 'required' | 'edit';

interface LikeActivityItem {
  id: string;
  name: string;
  imageUrl: string;
  headline: string;
  detail: string;
  badge: string;
  timeLabel: string;
}

interface LikeSection {
  key: LikeSectionKey;
  title: string;
  items: LikeActivityItem[];
}

interface LocalSentLikeEntry {
  property: Property;
  note?: string | null;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  sender: 'self' | 'other';
  text: string;
  timestamp: string;
}

interface ChatThread {
  id: string;
  title: string;
  subtitle: string;
  avatarUrl: string;
  detail: string;
  status: string;
  unreadCount: number;
  messages: ChatMessage[];
  isAiChat?: boolean;
  systemPrompt?: string;
}

// ─── Colour tokens ────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#FF5A5F',
  success: '#00C853',
  danger: '#FF1744',
  bg: '#F7F7F7',
  card: '#FFFFFF',
  muted: '#888888',
  white: '#FFFFFF',
};

/** Drives bottom action buttons (Tinder-style) from the same pan progress as LIKE/NOPE stamps. */
type SwipeDeckPan = { likeProgress: Animated.Value; nopeProgress: Animated.Value };
const SwipeDeckPanContext = createContext<SwipeDeckPan | null>(null);

/** Tinder-style: only the control matching swipe direction stays visible; others fade out, then return when the gesture ends. */
function useSwipeDeckActionInterpolation() {
  const ctx = useContext(SwipeDeckPanContext);
  if (!ctx) return null;
  const { likeProgress, nopeProgress } = ctx;
  const hideOnLikeDrag = likeProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const hideOnNopeDrag = nopeProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  /** X, super — hidden while swiping (detail/chevron uses entrance only). */
  const auxiliaryOpacity = Animated.multiply(hideOnLikeDrag, hideOnNopeDrag);
  return {
    nopeOpacity: hideOnLikeDrag,
    likeOpacity: hideOnNopeDrag,
    superOpacity: auxiliaryOpacity,
  };
}

/** Fade chrome in when this card becomes the top of the deck. */
function useDeckChromeEntrance(active: boolean, cardKey: string) {
  const entrance = useRef(new Animated.Value(active ? 1 : 0)).current;
  useLayoutEffect(() => {
    entrance.stopAnimation();
    if (!active) {
      entrance.setValue(0);
      return;
    }
    entrance.setValue(0);
    const anim = Animated.timing(entrance, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [active, cardKey, entrance]);
  return entrance;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapFilterPrice(value: number) {
  const clamped = clamp(value, FILTER_PRICE_MIN, FILTER_PRICE_MAX);
  const offset = clamped - FILTER_PRICE_MIN;
  const snapped = FILTER_PRICE_MIN + Math.round(offset / FILTER_PRICE_STEP) * FILTER_PRICE_STEP;
  return clamp(snapped, FILTER_PRICE_MIN, FILTER_PRICE_MAX);
}

function parseFilterPriceValue(raw: string, fallback: number) {
  const digits = parseInt(raw.replace(/\D/g, ''), 10);
  return Number.isFinite(digits) ? digits : fallback;
}

function normalizeFilterPriceRange(minCandidate: number, maxCandidate: number) {
  const nextMin = snapFilterPrice(clamp(minCandidate, FILTER_PRICE_MIN, FILTER_PRICE_MAX - FILTER_PRICE_STEP));
  const nextMax = snapFilterPrice(clamp(maxCandidate, nextMin + FILTER_PRICE_STEP, FILTER_PRICE_MAX));
  return { min: nextMin, max: Math.max(nextMin + FILTER_PRICE_STEP, nextMax) };
}

function formatFilterCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

function parseAmenitiesDraft(raw: string) {
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function serializeAmenitiesDraft(values: string[]) {
  return values.join(', ');
}

const DECK_ACTION_SIZE = 76;
const DECK_NOPE_FILL = '#FF2D55';
const DECK_LIKE_FILL = '#22C55E';
const DECK_EMPHASIS_ICON = '#0D0D0D';

/** Solid red circle + black X while swiping left; reverts when gesture cancels. */
function DeckNopeSwipeButton({
  onPress,
  containerOpacity,
  emphasis,
}: {
  onPress: () => void;
  /** Combined entrance × swipe fade (native-driver safe). */
  containerOpacity: any;
  emphasis: Animated.Value;
}) {
  const iconIdle = emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const iconBold = emphasis.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const ringFade = emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={{ opacity: containerOpacity }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={deckActionEmphasisStyles.touch}
      >
        <View style={deckActionEmphasisStyles.circleClip}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: DECK_NOPE_FILL,
                opacity: emphasis,
              },
            ]}
          />
          <View style={deckActionEmphasisStyles.iconLayer}>
            <Animated.View style={{ opacity: iconIdle, position: 'absolute' }}>
              <Ionicons name="close" size={38} color={COLORS.danger} />
            </Animated.View>
            <Animated.View style={{ opacity: iconBold, position: 'absolute' }}>
              <Ionicons name="close" size={38} color={DECK_EMPHASIS_ICON} />
            </Animated.View>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: DECK_ACTION_SIZE / 2,
                borderWidth: 2,
                borderColor: 'rgba(255,23,68,0.55)',
                opacity: ringFade,
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Solid green circle + black heart while swiping right. */
function DeckLikeSwipeButton({
  onPress,
  containerOpacity,
  emphasis,
}: {
  onPress: () => void;
  /** Combined entrance × swipe fade (native-driver safe). */
  containerOpacity: any;
  emphasis: Animated.Value;
}) {
  const iconIdle = emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const iconBold = emphasis.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const ringFade = emphasis.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={{ opacity: containerOpacity }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={deckActionEmphasisStyles.touch}
      >
        <View style={deckActionEmphasisStyles.circleClip}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: DECK_LIKE_FILL,
                opacity: emphasis,
              },
            ]}
          />
          <View style={deckActionEmphasisStyles.iconLayer}>
            <Animated.View style={{ opacity: iconIdle, position: 'absolute' }}>
              <Ionicons name="heart" size={34} color={COLORS.success} />
            </Animated.View>
            <Animated.View style={{ opacity: iconBold, position: 'absolute' }}>
              <Ionicons name="heart" size={34} color={DECK_EMPHASIS_ICON} />
            </Animated.View>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: DECK_ACTION_SIZE / 2,
                borderWidth: 2,
                borderColor: 'rgba(0,200,83,0.55)',
                opacity: ringFade,
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const deckActionEmphasisStyles = StyleSheet.create({
  touch: {
    width: DECK_ACTION_SIZE,
    height: DECK_ACTION_SIZE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  circleClip: {
    width: DECK_ACTION_SIZE,
    height: DECK_ACTION_SIZE,
    borderRadius: DECK_ACTION_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    width: DECK_ACTION_SIZE,
    height: DECK_ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const HOST_CONTACTS = [
  'Olivia Carter',
  'Daniel Kim',
  'Maya Patel',
  'Ethan Brooks',
  'Claire Lee',
  'Noah Zhang',
  'Isabella Torres',
  'Ava Mitchell',
  'Luca Romano',
  'Priya Nair',
  'Jordan Hayes',
  'Zoe Anderson',
  'Ryan Müller',
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function prioritizeExploreProperties(allProps: Property[]) {
  const priority = new Map<string, number>(EXPLORE_PRIORITY_LISTING_IDS.map((id, index) => [id, index]));
  return [...allProps].sort((a, b) => {
    const aRank = priority.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bRank = priority.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });
}

function applyPropertyFilters(
  allProps: Property[],
  filters: Record<string, string>,
): Property[] {
  const minPrice = filters.min_price ? parseInt(filters.min_price, 10) : 0;
  const maxPrice = filters.max_price ? parseInt(filters.max_price, 10) : Infinity;
  return allProps.filter(property => property.subletPrice >= minPrice && property.subletPrice <= maxPrice);
}
function formatDate(iso: string) {
  const [, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

/** Fade-in/out tab scene — keeps all tabs mounted to preserve state. */
function AnimatedTabScene({
  tabKey,
  activeTab,
  children,
}: {
  tabKey: DashboardTab;
  activeTab: DashboardTab;
  children: React.ReactNode;
}) {
  const isActive = activeTab === tabKey;
  const opacity = React.useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const [mounted, setMounted] = React.useState(isActive);

  React.useEffect(() => {
    if (isActive) {
      setMounted(true);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    }
  }, [isActive, opacity]);

  if (!mounted && !isActive) return null;

  return (
    <Animated.View
      style={[styles.sceneFill, { opacity }]}
      pointerEvents={isActive ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

async function callOpenRouter(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const apiKey = (process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '').trim();
  if (!apiKey) return '';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://subadger.com',
        'X-Title': 'Subadger',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } catch {
    return '';
  }
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hostNameForProperty(property: Property) {
  const mockIndex = MOCK_PROPERTIES.findIndex(item => item.id === property.id);
  if (mockIndex >= 0 && HOST_CONTACTS[mockIndex]) {
    return HOST_CONTACTS[mockIndex];
  }
  return 'Host';
}

function mockListingDescendingRank(listingId: string) {
  const mockIndex = MOCK_PROPERTIES.findIndex(item => item.id === listingId);
  return mockIndex >= 0 ? mockIndex : -1;
}

function compareLocalSentLikesDescending(a: LocalSentLikeEntry, b: LocalSentLikeEntry) {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  const timeDiff = (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  if (timeDiff !== 0) return timeDiff;

  const mockRankDiff = mockListingDescendingRank(b.property.id) - mockListingDescendingRank(a.property.id);
  if (mockRankDiff !== 0) return mockRankDiff;

  return a.property.apartmentName.localeCompare(b.property.apartmentName);
}

function compareLikeItemsDescending(a: LikeItemDto, b: LikeItemDto) {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  const timeDiff = (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  if (timeDiff !== 0) return timeDiff;

  const mockRankDiff = mockListingDescendingRank(b.listing_id) - mockListingDescendingRank(a.listing_id);
  if (mockRankDiff !== 0) return mockRankDiff;

  return a.title.localeCompare(b.title);
}

function createSentLikeActivityItem(entry: LocalSentLikeEntry): LikeActivityItem {
  return {
    id: `local-sent-${entry.property.id}-${entry.createdAt}`,
    name: hostNameForProperty(entry.property),
    imageUrl: entry.property.imageUrls[0],
    headline: entry.property.apartmentName,
    detail: entry.note?.trim() || entry.property.address,
    badge: `${entry.property.roomType}`,
    timeLabel: formatChatListTimeLabel(entry.createdAt),
  };
}

function createLikesSections(mode: AppMode, localSentLikes: LocalSentLikeEntry[] = []): LikeSection[] {
  if (mode === 'seeker') {
    return [
      {
        key: 'received',
        title: 'Like Received',
        items: MOCK_PROPERTIES.slice(0, 2).map((property, index) => ({
          id: `received-${property.id}`,
          name: HOST_CONTACTS[index],
          imageUrl: property.imageUrls[0],
          headline: property.apartmentName,
          detail: `${property.roomType} · ${formatDate(property.availableStartDate)} to ${formatDate(property.availableEndDate)}`,
          badge: `$${property.subletPrice}/mo`,
          timeLabel: index === 0 ? '2m ago' : '58m ago',
        })),
      },
      {
        key: 'sent',
        title: 'Like Sent',
        items: [...localSentLikes].sort(compareLocalSentLikesDescending).map(createSentLikeActivityItem),
      },
    ];
  }

  return [
    {
      key: 'received',
      title: 'Like Received',
      items: MOCK_SEEKER_CARDS.slice(0, 2).map((card, index) => ({
        id: `received-${card.user.id}`,
        name: card.user.name,
        imageUrl: card.user.imageUrls[0],
        headline: `Budget $${card.profile.targetPriceMin}-${card.profile.targetPriceMax}/mo`,
        detail: `${card.profile.targetPriceMin}-${card.profile.targetPriceMax}/mo · ${formatDate(card.profile.desiredStartDate)} to ${formatDate(card.profile.desiredEndDate)}`,
        badge: card.profile.preferredGender,
        timeLabel: index === 0 ? '4m ago' : '41m ago',
      })),
    },
    {
      key: 'sent',
      title: 'Like Sent',
      items: MOCK_SEEKER_CARDS.slice(2, 4).map((card, index) => ({
        id: `sent-${card.user.id}`,
        name: card.user.name,
        imageUrl: card.user.imageUrls[0],
        headline: `Budget $${card.profile.targetPriceMin}-${card.profile.targetPriceMax}/mo`,
        detail: `${card.user.bio ?? 'Open to summer sublets'} · Budget ${card.profile.targetPriceMin}-${card.profile.targetPriceMax}/mo`,
        badge: 'Seeker profile',
        timeLabel: index === 0 ? 'Yesterday' : '3d ago',
      })),
    },
  ];
}

function createChatThreads(mode: AppMode): ChatThread[] {
  if (mode === 'seeker') {
    return [
      {
        id: 'chat-p1',
        title: 'The Hub on Campus',
        subtitle: `Host · ${HOST_CONTACTS[0]}`,
        avatarUrl: MOCK_PROPERTIES[0].imageUrls[0],
        detail: '$1350/mo · Studio · Near Campus Mall',
        status: 'Host replied 5m ago',
        unreadCount: 2,
        messages: [
          { id: 'chat-p1-m1', sender: 'other', text: 'Hi! I saw you liked my listing and wanted to reach out.', timestamp: '9:12 AM' },
          { id: 'chat-p1-m2', sender: 'self', text: 'Thanks! The studio looks great. Is the unit fully furnished?', timestamp: '9:15 AM' },
          { id: 'chat-p1-m3', sender: 'other', text: 'Yes, bed, desk, and kitchen island stools all stay for the summer.', timestamp: '9:18 AM' },
          { id: 'chat-p1-m4', sender: 'other', text: 'If you want, I can also send over a quick video walkthrough tonight.', timestamp: '9:19 AM' },
        ],
      },
      {
        id: 'chat-p2',
        title: 'The James',
        subtitle: `Host · ${HOST_CONTACTS[1]}`,
        avatarUrl: MOCK_PROPERTIES[1].imageUrls[0],
        detail: '$1750/mo · 1BR · Rooftop access',
        status: 'Waiting on your reply',
        unreadCount: 0,
        messages: [
          { id: 'chat-p2-m1', sender: 'other', text: 'Happy to hold the place for 24 hours if you are serious about the dates.', timestamp: 'Yesterday' },
          { id: 'chat-p2-m2', sender: 'self', text: 'That helps a lot. I just need to confirm my internship housing stipend today.', timestamp: 'Yesterday' },
        ],
      },
      {
        id: 'chat-p4',
        title: 'Langdon Street Lofts',
        subtitle: `Host · ${HOST_CONTACTS[3]}`,
        avatarUrl: MOCK_PROPERTIES[3].imageUrls[0],
        detail: '$1900/mo · Private Room · Furnished',
        status: 'New thread',
        unreadCount: 1,
        messages: [
          { id: 'chat-p4-m1', sender: 'other', text: 'I can be flexible on move-in if you need to start a week later.', timestamp: 'Mon' },
        ],
      },
    ];
  }

  return [
    {
      id: 'chat-u1',
      title: 'Emma Johnson',
      subtitle: 'Seeker · Summer internship',
      avatarUrl: MOCK_SEEKER_CARDS[0].user.imageUrls[0],
      detail: 'Budget $1000-$1400/mo · Quiet lifestyle',
      status: 'Active 8m ago',
      unreadCount: 1,
      messages: [
        { id: 'chat-u1-m1', sender: 'other', text: 'Hi! Your listing at The Hub looks like a strong fit for my internship dates.', timestamp: '10:02 AM' },
        { id: 'chat-u1-m2', sender: 'self', text: 'Great to hear. I can send building details and the lease transfer steps.', timestamp: '10:06 AM' },
        { id: 'chat-u1-m3', sender: 'other', text: 'Perfect. I am especially curious about laundry and parking.', timestamp: '10:08 AM' },
      ],
    },
    {
      id: 'chat-u2',
      title: 'Liam Park',
      subtitle: 'Seeker · Downtown internship',
      avatarUrl: MOCK_SEEKER_CARDS[1].user.imageUrls[0],
      detail: 'Budget $1200-$1700/mo · Furnished preferred',
      status: 'Awaiting docs',
      unreadCount: 0,
      messages: [
        { id: 'chat-u2-m1', sender: 'other', text: 'If utilities average around $100, that still works for me.', timestamp: 'Yesterday' },
        { id: 'chat-u2-m2', sender: 'self', text: 'Yes, that estimate has been pretty consistent this year.', timestamp: 'Yesterday' },
      ],
    },
    {
      id: 'chat-u3',
      title: 'Sofia Martinez',
      subtitle: 'Seeker · Flexible move-in',
      avatarUrl: MOCK_SEEKER_CARDS[2].user.imageUrls[0],
      detail: 'Budget $900-$1300/mo · Female preferred',
      status: 'New thread',
      unreadCount: 2,
      messages: [
        { id: 'chat-u3-m1', sender: 'other', text: 'Would you be open to a May 10 move-in instead of May 15?', timestamp: 'Sun' },
        { id: 'chat-u3-m2', sender: 'other', text: 'I can handle the paperwork right away if that helps.', timestamp: 'Sun' },
      ],
    },
  ];
}

// ─── Image Carousel (Tinder-style) ───────────────────────────────────────────
function ImageCarousel({ imageUrls }: { imageUrls: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const total = imageUrls.length;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        source={{ uri: imageUrls[currentIndex] }}
        style={styles.cardImage}
        resizeMode="cover"
      />
      {/* Progress bars at top (Tinder-style) */}
      {total > 1 && (
        <View style={styles.progressBarContainer} pointerEvents="none">
          {imageUrls.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressBar,
                { flex: 1, backgroundColor: i === currentIndex ? '#FF5A5F' : 'rgba(255,255,255,0.75)' },
              ]}
            />
          ))}
        </View>
      )}
      {/* Tap zones covering entire left/right edges */}
      {total > 1 && (
        <>
          <TouchableOpacity
            style={styles.tapZoneLeft}
            activeOpacity={1}
            onPress={() => setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev))}
          />
          <TouchableOpacity
            style={styles.tapZoneRight}
            activeOpacity={1}
            onPress={() => setCurrentIndex(prev => (prev < total - 1 ? prev + 1 : prev))}
          />
        </>
      )}
    </View>
  );
}

// ─── Gender Tag ───────────────────────────────────────────────────────────────
function GenderTag({ gender }: { gender: string }) {
  const iconName =
    gender === 'Female' ? 'female' :
      gender === 'Male' ? 'male' : 'transgender';
  const color =
    gender === 'Female' ? '#E91E8C' :
      gender === 'Male' ? '#1565C0' : '#7B1FA2';
  return (
    <View style={[styles.genderTag, { borderColor: color }]}>
      <Ionicons name={iconName as any} size={12} color={color} />
      <Text style={[styles.genderTagText, { color }]}>{gender}</Text>
    </View>
  );
}

// ─── Property Card Content ────────────────────────────────────────────────────
function PropertyCardContent({
  property,
  isDeckTop,
  onShowDetail,
  onNope,
  onLike,
  onSuperLike,
}: {
  property: Property;
  /** Only the front card shows controls; next card reveals chrome when promoted. */
  isDeckTop: boolean;
  onShowDetail?: () => void;
  onNope?: () => void;
  onLike?: () => void;
  onSuperLike?: () => void;
}) {
  const deckAnim = useSwipeDeckActionInterpolation();
  const entrance = useDeckChromeEntrance(isDeckTop, property.id);
  const pan = useContext(SwipeDeckPanContext);

  const nopeOp =
    deckAnim && isDeckTop ? Animated.multiply(entrance, deckAnim.nopeOpacity) : entrance;
  const likeOp =
    deckAnim && isDeckTop ? Animated.multiply(entrance, deckAnim.likeOpacity) : entrance;
  const superOp =
    deckAnim && isDeckTop ? Animated.multiply(entrance, deckAnim.superOpacity) : entrance;

  return (
    <View style={styles.cardInner}>
      <ImageCarousel imageUrls={property.imageUrls} />
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.95)', '#FFFFFF']} style={styles.gradient} />
      <View style={styles.cardInfo}>
        <Text style={styles.apartmentName} numberOfLines={2}>{property.apartmentName}</Text>
        <Text style={styles.address} numberOfLines={2}>
          {property.address}
        </Text>
        <Text style={styles.subletPrice}>${property.subletPrice}/mo</Text>
      </View>
      {isDeckTop && onNope && onLike ? (
        <View style={styles.actions} pointerEvents="box-none">
          {pan ? (
            <DeckNopeSwipeButton
              onPress={onNope}
              containerOpacity={nopeOp as any}
              emphasis={pan.nopeProgress}
            />
          ) : null}
          {onSuperLike ? (
            <Animated.View style={{ opacity: superOp }}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionSuper]}
                onPress={onSuperLike}
                activeOpacity={0.85}
              >
                <Ionicons name="star" size={30} color="#FFD54F" />
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <View style={styles.actionSuperSpacer} />
          )}
          {pan ? (
            <DeckLikeSwipeButton
              onPress={onLike}
              containerOpacity={likeOp as any}
              emphasis={pan.likeProgress}
            />
          ) : null}
        </View>
      ) : null}
      {isDeckTop && onShowDetail ? (
        <View style={styles.detailBtnLayer} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={onShowDetail}>
            <View
              style={styles.detailBtn}
              accessibilityRole="button"
              accessibilityLabel="More information"
            >
              <Ionicons name="information-circle" size={26} color="#FFF" />
            </View>
          </TouchableWithoutFeedback>
        </View>
      ) : null}
    </View>
  );
}

// ─── Seeker Card Content ──────────────────────────────────────────────────────
function SeekerCardContent({
  card,
  isDeckTop,
  onShowDetail,
  onNope,
  onLike,
}: {
  card: SeekerCard;
  isDeckTop: boolean;
  onShowDetail?: () => void;
  onNope?: () => void;
  onLike?: () => void;
}) {
  const { user, profile } = card;
  const deckAnim = useSwipeDeckActionInterpolation();
  const entrance = useDeckChromeEntrance(isDeckTop, user.id);
  const pan = useContext(SwipeDeckPanContext);

  const nopeOp =
    deckAnim && isDeckTop ? Animated.multiply(entrance, deckAnim.nopeOpacity) : entrance;
  const likeOp =
    deckAnim && isDeckTop ? Animated.multiply(entrance, deckAnim.likeOpacity) : entrance;

  return (
    <View style={styles.cardInner}>
      <ImageCarousel imageUrls={user.imageUrls} />
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.95)', '#FFFFFF']} style={styles.gradient} />
      <View style={styles.cardInfo}>
        <Text style={styles.apartmentName} numberOfLines={1}>{user.name}</Text>
        {user.bio ? <Text style={styles.address} numberOfLines={1}>{user.bio}</Text> : null}
        <Text style={styles.subletPrice}>${profile.targetPriceMin} – ${profile.targetPriceMax}/mo</Text>
      </View>
      {isDeckTop && onNope && onLike ? (
        <View style={styles.actions} pointerEvents="box-none">
          {pan ? (
            <DeckNopeSwipeButton
              onPress={onNope}
              containerOpacity={nopeOp as any}
              emphasis={pan.nopeProgress}
            />
          ) : null}
          {pan ? (
            <DeckLikeSwipeButton
              onPress={onLike}
              containerOpacity={likeOp as any}
              emphasis={pan.likeProgress}
            />
          ) : null}
        </View>
      ) : null}
      {isDeckTop && onShowDetail ? (
        <View style={styles.detailBtnLayer} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={onShowDetail}>
            <View
              style={styles.detailBtn}
              accessibilityRole="button"
              accessibilityLabel="More information"
            >
              <Ionicons name="information-circle" size={26} color="#FFF" />
            </View>
          </TouchableWithoutFeedback>
        </View>
      ) : null}
    </View>
  );
}

// ─── Swipe-Down Detail Modal ─────────────────────────────────────────────────
const MODAL_DISMISS_THRESHOLD = 120;
/** Pull past top of detail sheet (scroll “up” at top) dismisses, px into rubber-band. */
const DETAIL_SCROLL_UP_DISMISS_OVERSCROLL = 22;
/** Offset at or below this = user is at the top of the detail scroll content. */
const DETAIL_SCROLL_TOP_EPSILON = 12;
/** Past this offset = user has scrolled away from the top (must return before overscroll can dismiss). */
const DETAIL_SCROLL_AWAY_FROM_TOP = 40;

// ─── Property Detail Modal ───────────────────────────────────────────────────
function PropertyDetailModal({ property, visible, onClose }: { property: Property | null; visible: boolean; onClose: () => void }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const closingRef = useRef(false);
  /** False after user scrolls down into content; true again only when y is back in the top band. */
  const atDetailScrollTopRef = useRef(true);

  const combinedTranslateY = useRef(Animated.add(slideAnim, dragY)).current;

  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      slideAnim.setValue(SCREEN_HEIGHT);
      dragY.setValue(0);
      overlayOpacity.setValue(0);
      closingRef.current = false;
      onClose();
    });
  }, [onClose]);

  const onDetailScrollDismiss = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y <= DETAIL_SCROLL_TOP_EPSILON) {
        atDetailScrollTopRef.current = true;
      } else if (y > DETAIL_SCROLL_AWAY_FROM_TOP) {
        atDetailScrollTopRef.current = false;
      }
      if (atDetailScrollTopRef.current && y < -DETAIL_SCROLL_UP_DISMISS_OVERSCROLL) {
        dismiss();
      }
    },
    [dismiss],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          dragY.setValue(g.dy);
          const progress = Math.max(0, 1 - g.dy / (SCREEN_HEIGHT * 0.5));
          overlayOpacity.setValue(progress);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > MODAL_DISMISS_THRESHOLD) {
          dismiss();
        } else {
          Animated.parallel([
            Animated.timing(dragY, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  React.useEffect(() => {
    if (visible) {
      setModalVisible(true);
      dragY.setValue(0);
      slideAnim.setValue(SCREEN_HEIGHT);
      overlayOpacity.setValue(0);
      atDetailScrollTopRef.current = true;
    }
  }, [visible]);

  const onModalShow = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (!property) return null;

  return (
    <Modal transparent visible={modalVisible} animationType="none" onRequestClose={dismiss} onShow={onModalShow}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={styles.modalOverlayTouch} onPress={dismiss} activeOpacity={1} />
        </Animated.View>
        <Animated.View style={[styles.modalSheet, styles.modalSheetAbsolute, { transform: [{ translateY: combinedTranslateY }] }]}>
          {/* Swipe handle */}
          <View {...panResponder.panHandlers} style={styles.modalHandle}>
            <View style={styles.modalHandleBar} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalContent}
            scrollEventThrottle={16}
            bounces
            alwaysBounceVertical
            overScrollMode="always"
            onScroll={onDetailScrollDismiss}
          >
            {/* Header Map */}
            <View style={styles.modalMapContainer}>
              <MapView
                style={styles.modalMap}
                initialRegion={{
                  latitude: property.coordinates?.latitude || 43.0731,
                  longitude: property.coordinates?.longitude || -89.4012,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
              >
                {property.coordinates && (
                  <Marker coordinate={property.coordinates} />
                )}
              </MapView>
            </View>

            {/* Title */}
            <Text style={styles.modalTitle}>{property.apartmentName}</Text>
            <Text style={styles.modalAddress}>📍 {property.address}</Text>

            {/* Description */}
            <Text style={styles.modalDescription}>{property.description}</Text>

            {/* Info grid */}
            <View style={styles.modalInfoGrid}>
              <View style={styles.modalInfoItem}>
                <Ionicons name="cash-outline" size={20} color="#4ADE80" />
                <Text style={styles.modalInfoLabel}>Price</Text>
                <Text style={styles.modalInfoValue}>${property.subletPrice}/mo</Text>
                <Text style={styles.modalInfoSub}>was ${property.originalRentPrice}/mo</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="calendar-outline" size={20} color="#6C5CE7" />
                <Text style={styles.modalInfoLabel}>Dates</Text>
                <Text style={styles.modalInfoValueHighlight}>{formatDate(property.availableStartDate)}</Text>
                <Text style={styles.modalInfoSubHighlight}>to {formatDate(property.availableEndDate)}</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="bed-outline" size={20} color="#FF5A5F" />
                <Text style={styles.modalInfoLabel}>Room Type</Text>
                <Text style={styles.modalInfoValue}>{property.roomType}</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="cube-outline" size={20} color="#00B894" />
                <Text style={styles.modalInfoLabel}>Furnished</Text>
                <Text style={styles.modalInfoValue}>{property.furnished ? 'Yes' : 'No'}</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="flash-outline" size={20} color="#FDCB6E" />
                <Text style={styles.modalInfoLabel}>Utilities</Text>
                <Text style={styles.modalInfoValue}>+${property.avgUtilityFee}/mo</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="people-outline" size={20} color="#E91E8C" />
                <Text style={styles.modalInfoLabel}>Gender Pref</Text>
                <Text style={styles.modalInfoValue}>{property.preferredGender}</Text>
              </View>
            </View>

            {/* Rules */}
            <Text style={styles.modalSectionTitle}>House Rules</Text>
            <View style={styles.modalRulesList}>
              {property.rules.map((rule, i) => (
                <View key={i} style={styles.modalRuleItem}>
                  <View style={styles.modalRuleDot} />
                  <Text style={styles.modalRuleText}>{rule}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Seeker Detail Modal ─────────────────────────────────────────────────────
function SeekerDetailModal({ card, visible, onClose }: { card: SeekerCard | null; visible: boolean; onClose: () => void }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const closingRef = useRef(false);
  const atDetailScrollTopRef = useRef(true);

  const combinedTranslateY = useRef(Animated.add(slideAnim, dragY)).current;

  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      slideAnim.setValue(SCREEN_HEIGHT);
      dragY.setValue(0);
      overlayOpacity.setValue(0);
      closingRef.current = false;
      onClose();
    });
  }, [onClose]);

  const onDetailScrollDismiss = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y <= DETAIL_SCROLL_TOP_EPSILON) {
        atDetailScrollTopRef.current = true;
      } else if (y > DETAIL_SCROLL_AWAY_FROM_TOP) {
        atDetailScrollTopRef.current = false;
      }
      if (atDetailScrollTopRef.current && y < -DETAIL_SCROLL_UP_DISMISS_OVERSCROLL) {
        dismiss();
      }
    },
    [dismiss],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) {
          dragY.setValue(g.dy);
          const progress = Math.max(0, 1 - g.dy / (SCREEN_HEIGHT * 0.5));
          overlayOpacity.setValue(progress);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > MODAL_DISMISS_THRESHOLD) {
          dismiss();
        } else {
          Animated.parallel([
            Animated.timing(dragY, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  React.useEffect(() => {
    if (visible) {
      setModalVisible(true);
      dragY.setValue(0);
      slideAnim.setValue(SCREEN_HEIGHT);
      overlayOpacity.setValue(0);
      atDetailScrollTopRef.current = true;
    }
  }, [visible]);

  const onModalShow = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (!card) return null;

  const { user, profile } = card;

  return (
    <Modal transparent visible={modalVisible} animationType="none" onRequestClose={dismiss} onShow={onModalShow}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={styles.modalOverlayTouch} onPress={dismiss} activeOpacity={1} />
        </Animated.View>
        <Animated.View style={[styles.modalSheet, styles.modalSheetAbsolute, { transform: [{ translateY: combinedTranslateY }] }]}>
          {/* Swipe handle */}
          <View {...panResponder.panHandlers} style={styles.modalHandle}>
            <View style={styles.modalHandleBar} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalContent}
            scrollEventThrottle={16}
            bounces
            alwaysBounceVertical
            overScrollMode="always"
            onScroll={onDetailScrollDismiss}
          >
            {/* Header image */}
            <Image source={{ uri: user.imageUrls[0] }} style={styles.modalImage} resizeMode="cover" />

            {/* Title */}
            <Text style={styles.modalTitle}>{user.name}</Text>
            {user.bio ? <Text style={styles.modalAddress}>{user.bio}</Text> : null}

            {/* About me */}
            {profile.aboutMe ? <Text style={styles.modalDescription}>{profile.aboutMe}</Text> : null}

            {/* Info grid */}
            <View style={styles.modalInfoGrid}>
              <View style={styles.modalInfoItem}>
                <Ionicons name="cash-outline" size={20} color="#4ADE80" />
                <Text style={styles.modalInfoLabel}>Budget</Text>
                <Text style={styles.modalInfoValue}>${profile.targetPriceMin}</Text>
                <Text style={styles.modalInfoSub}>to ${profile.targetPriceMax}/mo</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="calendar-outline" size={20} color="#6C5CE7" />
                <Text style={styles.modalInfoLabel}>Dates</Text>
                <Text style={styles.modalInfoValue}>{formatDate(profile.desiredStartDate)}</Text>
                <Text style={styles.modalInfoSub}>to {formatDate(profile.desiredEndDate)}</Text>
              </View>
              <View style={styles.modalInfoItem}>
                <Ionicons name="people-outline" size={20} color="#E91E8C" />
                <Text style={styles.modalInfoLabel}>Gender Pref</Text>
                <Text style={styles.modalInfoValue}>{profile.preferredGender}</Text>
              </View>
            </View>

            {/* Lifestyle */}
            {profile.lifestyle && profile.lifestyle.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>Lifestyle</Text>
                <View style={styles.lifestyleTagsContainer}>
                  {profile.lifestyle.map((tag, i) => (
                    <View key={i} style={styles.lifestyleTag}>
                      <Text style={styles.lifestyleTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Swipe Card ───────────────────────────────────────────────────────────────
interface SwipeCardProps {
  index: number;
  onSwipedLeft: () => void;
  onSwipedRight: () => void;
  children: React.ReactNode;
  /** When true, the top card does not capture horizontal pans (e.g. nested scroll). */
  panDisabled?: boolean;
  /** Return false to spring the card back instead of completing the swipe (e.g. guest preview). */
  allowSwipeCommit?: (direction: 'left' | 'right') => boolean;
  /** Called when a swipe crossed the threshold but `allowSwipeCommit` returned false. */
  onSwipeDenied?: () => void;
}

export interface SwipeCardRef {
  triggerSwipe: (direction: 'left' | 'right') => void;
}

const SwipeCard = forwardRef<SwipeCardRef, SwipeCardProps>(
  (
    {
      index,
      onSwipedLeft,
      onSwipedRight,
      children,
      panDisabled = false,
      allowSwipeCommit,
      onSwipeDenied,
    },
    ref,
  ) => {
  const isTop = index === 0;
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;
  const panDisabledRef = useRef(panDisabled);
  panDisabledRef.current = panDisabled;
  const allowSwipeCommitRef = useRef(allowSwipeCommit);
  allowSwipeCommitRef.current = allowSwipeCommit;
  const onSwipeDeniedRef = useRef(onSwipeDenied);
  onSwipeDeniedRef.current = onSwipeDenied;
  const onSwipedLeftRef = useRef(onSwipedLeft);
  onSwipedLeftRef.current = onSwipedLeft;
  const onSwipedRightRef = useRef(onSwipedRight);
  onSwipedRightRef.current = onSwipedRight;

  const position = useRef(new Animated.ValueXY()).current;
  const likeOpacity = useRef(new Animated.Value(0)).current;
  const nopeOpacity = useRef(new Animated.Value(0)).current;

  const springBackRef = useRef(() => {});
  springBackRef.current = () => {
    Animated.parallel([
      Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
      Animated.timing(likeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(nopeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  useImperativeHandle(ref, () => ({
    triggerSwipe: (direction: 'left' | 'right') => {
      if (panDisabledRef.current) return;
      const allowed =
        allowSwipeCommitRef.current == null || allowSwipeCommitRef.current(direction);
      if (!allowed) {
        onSwipeDeniedRef.current?.();
        return;
      }
      const xTarget = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
      const stampOpacity = direction === 'right' ? likeOpacity : nopeOpacity;
      Animated.parallel([
        Animated.timing(stampOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(position, {
          toValue: { x: xTarget, y: 50 },
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (direction === 'right') onSwipedRightRef.current();
        else onSwipedLeftRef.current();
      });
    },
  }));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        isTopRef.current && !panDisabledRef.current && Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => {
        position.setValue({ x: g.dx, y: g.dy });
        const ratio = Math.abs(g.dx) / SWIPE_THRESHOLD;
        if (g.dx > 0) {
          likeOpacity.setValue(Math.min(ratio, 1));
          nopeOpacity.setValue(0);
        } else {
          nopeOpacity.setValue(Math.min(ratio, 1));
          likeOpacity.setValue(0);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          const allowed =
            allowSwipeCommitRef.current == null || allowSwipeCommitRef.current('right');
          if (!allowed) {
            onSwipeDeniedRef.current?.();
            springBackRef.current();
            return;
          }
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH * 1.5, y: g.dy + 50 },
            duration: 320,
            useNativeDriver: true,
          }).start(() => onSwipedRightRef.current());
        } else if (g.dx < -SWIPE_THRESHOLD) {
          const allowed =
            allowSwipeCommitRef.current == null || allowSwipeCommitRef.current('left');
          if (!allowed) {
            onSwipeDeniedRef.current?.();
            springBackRef.current();
            return;
          }
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH * 1.5, y: g.dy + 50 },
            duration: 320,
            useNativeDriver: true,
          }).start(() => onSwipedLeftRef.current());
        } else {
          Animated.parallel([
            Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
            Animated.timing(likeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(nopeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });

  // Back cards: same chrome as the top card (TikTok-style: controls stay glued to the preview).
  // `pointerEvents="none"` keeps touches on the animating top card until this layer is promoted.
  if (!isTop) {
    return (
      <View style={styles.card} pointerEvents="none">
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
      {...(panDisabled ? {} : panResponder.panHandlers)}
    >
      <SwipeDeckPanContext.Provider value={{ likeProgress: likeOpacity, nopeProgress: nopeOpacity }}>
        {children}
      </SwipeDeckPanContext.Provider>
      {/* LIKE stamp */}
      <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]} pointerEvents="none">
        <Text style={[styles.stampText, { color: COLORS.success }]}>LIKE</Text>
      </Animated.View>
      {/* NOPE stamp */}
      <Animated.View style={[styles.stamp, styles.stampNope, { opacity: nopeOpacity }]} pointerEvents="none">
        <Text style={[styles.stampText, { color: COLORS.danger }]}>NOPE</Text>
      </Animated.View>
    </Animated.View>
  );
});

// ─── Dashboard Header (with logout) ──────────────────────────────────────────
function DashboardHeader({
  onLogout,
  isLoggingOut,
  onBack,
  showBack,
  isGuest,
  onGuestBack,
}: {
  onLogout: () => void;
  isLoggingOut: boolean;
  onBack?: () => void;
  showBack?: boolean;
  isGuest?: boolean;
  onGuestBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      {isGuest && onGuestBack ? (
        <TouchableOpacity style={styles.headerIconBtn} onPress={onGuestBack} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TouchableOpacity>
      ) : showBack && onBack ? (
        <TouchableOpacity style={styles.headerIconBtn} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 38 }} />
      )}
      <View style={{ width: 38 }} />
    </View>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={[styles.loadingScreen, styles.loadingScreenDim]}>
      <BuckyLoading size={112} swing={32} />
      <Text style={styles.loadingTextOnDim}>{label}</Text>
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ mode, filtersApplied = false }: { mode: AppMode; filtersApplied?: boolean }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={mode === 'seeker' ? 'home-outline' : 'people-outline'} size={72} color="#CCC" />
      <Text style={styles.emptyTitle}>{filtersApplied ? 'No matches yet' : "You've seen them all!"}</Text>
      <Text style={styles.emptySubtitle}>
        {filtersApplied
          ? `Try widening or resetting your filters to see more ${mode === 'seeker' ? 'listings' : 'seekers'}.`
          : `Check back later for more ${mode === 'seeker' ? 'listings' : 'seekers'}.`}
      </Text>
    </View>
  );
}

// ─── Action Buttons ───────────────────────────────────────────────────────────
function ActionButtons({ onNope, onLike }: { onNope: () => void; onLike: () => void }) {
  return (
    <View style={styles.actions} pointerEvents="box-none">
      <TouchableOpacity style={[styles.actionBtn, styles.actionNope]} onPress={onNope} activeOpacity={0.85}>
        <Ionicons name="close" size={38} color={COLORS.danger} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.actionBtn, styles.actionLike]} onPress={onLike} activeOpacity={0.85}>
        <Ionicons name="heart" size={34} color={COLORS.success} />
      </TouchableOpacity>
    </View>
  );
}

function TabPlaceholder({ title, subtitle, icon }: { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.tabPlaceholder}>
      <View style={styles.tabPlaceholderIconWrap}>
        <Ionicons name={icon} size={42} color="#B2B2B2" />
      </View>
      <Text style={styles.tabPlaceholderTitle}>{title}</Text>
      <Text style={styles.tabPlaceholderSubtitle}>{subtitle}</Text>
    </View>
  );
}

function UtilityTabHeader({ 
  title, 
  subtitle,
  alignLeft,
  rightIcon
}: { 
  title: string; 
  subtitle?: string;
  alignLeft?: boolean;
  rightIcon?: React.ReactNode;
}) {
  if (alignLeft) {
    return (
      <View style={[styles.utilityHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 12 : 0 }]}>
        <Text style={[styles.utilityHeaderTitle, { textAlign: 'left', marginBottom: 0 }]}>{title}</Text>
        {rightIcon && <View>{rightIcon}</View>}
      </View>
    );
  }
  return (
    <View style={styles.utilityHeader}>
      <Text style={styles.utilityHeaderTitle}>{title}</Text>
      {subtitle ? <Text style={styles.utilityHeaderSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function NotificationBellIcon() {
  return (
    <View style={styles.notificationBellWrap}>
      <Ionicons name="notifications-outline" size={24} color="#222" />
      <View style={styles.notificationBellDot} />
    </View>
  );
}

function formatChatListTimeLabel(raw?: string | null) {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (/[AP]M$/i.test(value) || /^(yesterday|today|mon|tue|wed|thu|fri|sat|sun)$/i.test(value)) {
    return value.replace(' AM', 'AM').replace(' PM', 'PM');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'AM')
    .replace(' PM', 'PM');
}

function formatChatConversationDateLabel(raw?: string | null) {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (/[AP]M$/i.test(value)) {
    return `Today at ${value}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const monthDay = parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${monthDay} at ${time}`;
}

function splitChatDetail(detail?: string | null) {
  const parts = (detail ?? '')
    .split('·')
    .map(part => part.trim())
    .filter(Boolean);
  return {
    price: parts[0] ?? '',
    meta: parts.slice(1).join(' • '),
  };
}

function ChatAvatar({
  uri,
  size,
  iconSize,
}: {
  uri?: string | null;
  size: number;
  iconSize: number;
}) {
  if (uri && uri.trim()) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }

  return (
    <View style={[styles.chatAvatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={iconSize} color="#9A9A9A" />
    </View>
  );
}

function ChatInboxRow({
  avatarUrl,
  eyebrow,
  headline,
  preview,
  timeLabel,
  unreadCount,
  onPress,
}: {
  avatarUrl?: string | null;
  eyebrow: string;
  headline: string;
  preview: string;
  timeLabel?: string;
  unreadCount?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.chatThreadRow} activeOpacity={0.82} onPress={onPress}>
      <ChatAvatar uri={avatarUrl} size={70} iconSize={30} />

      <View style={styles.chatThreadBody}>
        <Text style={styles.chatThreadEyebrow} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text style={styles.chatThreadHeadline} numberOfLines={1}>
          {headline}
        </Text>
        <Text style={styles.chatThreadPreview} numberOfLines={1}>
          {preview}
        </Text>
      </View>

      <View style={styles.chatThreadSide}>
        <Text style={styles.chatThreadTime}>{timeLabel ?? ''}</Text>
        {unreadCount && unreadCount > 0 ? (
          <View style={styles.chatThreadUnreadBadge}>
            <Text style={styles.chatThreadUnreadText}>{unreadCount}</Text>
          </View>
        ) : (
          <View style={styles.chatThreadUnreadSpacer} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function ChatConversationView({
  title,
  avatarUrl,
  listingTitle,
  listingMeta,
  listingPrice,
  dateLabel,
  messages,
  inputValue,
  onChangeText,
  onSend,
  onBack,
  kbInset,
  onShowListingDetail,
}: {
  title: string;
  avatarUrl?: string | null;
  listingTitle: string;
  listingMeta?: string;
  listingPrice?: string;
  dateLabel?: string;
  messages: Array<{ id: string; sender: 'self' | 'other'; text: string }>;
  inputValue: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onBack: () => void;
  kbInset: number;
  onShowListingDetail?: () => void;
}) {
  return (
    <View style={[styles.chatScreen, { paddingBottom: kbInset > 0 ? kbInset : TAB_BAR_HEIGHT + 18 }]}>
      <View style={styles.chatConversationTopBar}>
        <TouchableOpacity activeOpacity={0.8} onPress={onBack} style={styles.chatConversationBackPlain}>
          <Ionicons name="chevron-back" size={28} color="#202020" />
        </TouchableOpacity>

        {onShowListingDetail ? (
          <TouchableOpacity
            style={styles.chatConversationIdentity}
            activeOpacity={0.75}
            onPress={onShowListingDetail}
          >
            <ChatAvatar uri={avatarUrl} size={32} iconSize={16} />
            <Text style={styles.chatConversationIdentityName} numberOfLines={1}>
              {title}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#A0A0A0" style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        ) : (
          <View style={styles.chatConversationIdentity}>
            <ChatAvatar uri={avatarUrl} size={32} iconSize={16} />
            <Text style={styles.chatConversationIdentityName} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}

        <TouchableOpacity activeOpacity={0.8} style={styles.chatConversationMoreBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color="#202020" />
        </TouchableOpacity>
      </View>

      {onShowListingDetail ? (
        <TouchableOpacity
          style={styles.chatConversationListingCard}
          activeOpacity={0.78}
          onPress={onShowListingDetail}
        >
          <Text style={styles.chatConversationListingTitle} numberOfLines={1}>
            {listingTitle}
          </Text>
          {listingMeta ? (
            <Text style={styles.chatConversationListingMeta} numberOfLines={1}>
              {listingMeta}
            </Text>
          ) : null}
          {listingPrice ? <Text style={styles.chatConversationListingPrice}>{listingPrice}</Text> : null}
          <Text style={{ fontSize: 11, color: '#FF5A5F', marginTop: 2, fontWeight: '600' }}>View listing ›</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.chatConversationListingCard}>
          <Text style={styles.chatConversationListingTitle} numberOfLines={1}>
            {listingTitle}
          </Text>
          {listingMeta ? (
            <Text style={styles.chatConversationListingMeta} numberOfLines={1}>
              {listingMeta}
            </Text>
          ) : null}
          {listingPrice ? <Text style={styles.chatConversationListingPrice}>{listingPrice}</Text> : null}
        </View>
      )}

      <ScrollView
        style={styles.chatConversationMessages}
        contentContainerStyle={styles.chatConversationMessagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {dateLabel ? <Text style={styles.chatConversationDate}>{dateLabel}</Text> : null}
        {messages.map((message, index) => (
          <AnimatedChatMessageRow
            key={message.id}
            message={message}
            avatarUrl={avatarUrl}
            index={index}
          />
        ))}
      </ScrollView>

      <View style={styles.chatComposerDock}>
        <View style={styles.chatComposerPill}>
          <TextInput
            value={inputValue}
            onChangeText={onChangeText}
            placeholder="Message"
            placeholderTextColor="#A5A5A5"
            style={styles.chatComposerInput}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (inputValue.trim()) onSend();
            }}
          />
        </View>
      </View>
    </View>
  );
}

function AnimatedChatMessageRow({
  message,
  avatarUrl,
  index,
}: {
  message: { id: string; sender: 'self' | 'other'; text: string };
  avatarUrl?: string | null;
  index: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(10)).current;

  React.useEffect(() => {
    const delay = Math.min(index, 4) * 35;
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        delay,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, opacity, translateY]);

  if (message.sender === 'self') {
    return (
      <Animated.View
        style={[
          styles.chatMessageSelfRow,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.chatBubble, styles.chatBubbleSelf]}>
          <Text style={[styles.chatBubbleText, styles.chatBubbleTextSelf]}>{message.text}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.chatMessageOtherRow,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <ChatAvatar uri={avatarUrl} size={38} iconSize={18} />
      <View style={[styles.chatBubble, styles.chatBubbleOther]}>
        <Text style={styles.chatBubbleText}>{message.text}</Text>
      </View>
    </Animated.View>
  );
}

function GuestProfileTabContent({
  onLogInSignUp,
}: {
  onLogInSignUp: () => void;
}) {
  return (
    <ScrollView style={styles.utilityScroll} contentContainerStyle={styles.utilityScrollContent}>
      <UtilityTabHeader
        title="Profile"
        subtitle="Sign in to manage your account, preferences, and messages."
      />
      <View style={styles.guestProfileCard}>
        <View style={styles.guestProfileAvatarWrap}>
          <Ionicons name="person" size={40} color="rgba(255,255,255,0.38)" />
        </View>
        <Text style={styles.guestProfileCardTitle}>Browsing as a guest</Text>
        <TouchableOpacity style={styles.guestProfilePrimaryBtn} onPress={onLogInSignUp} activeOpacity={0.85}>
          <Text style={styles.guestProfilePrimaryBtnText}>Log in or sign up</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function SuperLikeHighlightList({ items, variant }: { items: SuperLikeItemDto[]; variant: 'sent' | 'received' }) {
  if (items.length === 0) return null;
  const title = variant === 'received' ? '★  Super Likes received' : '★  Super Likes sent';
  return (
    <View style={styles.superLikeHighlightBlock}>
      <Text style={styles.superLikeHighlightTitle}>{title}</Text>
      {items.map(it => (
        <View key={it.super_like_id} style={styles.superLikeHighlightCard}>
          <View style={styles.superLikeHighlightHeader}>
            <Ionicons name="star" size={14} color="#FFD54F" />
            <Text style={styles.superLikeHighlightListing} numberOfLines={1}>
              {it.title}
            </Text>
          </View>
          <Text style={styles.superLikeHighlightFrom} numberOfLines={1}>
            {variant === 'received' ? `from ${it.counterparty_name}` : `to ${it.counterparty_name}`}
          </Text>
          <Text style={styles.superLikeHighlightBody} numberOfLines={4}>
            "{it.body}"
          </Text>
          <Text style={styles.superLikeHighlightMeta}>
            ${it.price_monthly}/mo · {it.address}
          </Text>
        </View>
      ))}
    </View>
  );
}

function likeNotePreview(note: string | null | undefined): string {
  const t = (note ?? '').trim();
  return t.length > 0 ? t : 'Like without a message';
}

function indexLikeItemsByListingId(items: LikeItemDto[]) {
  return items.reduce<Record<string, LikeItemDto>>((lookup, item) => {
    if (item.listing_id && !lookup[item.listing_id]) {
      lookup[item.listing_id] = item;
    }
    return lookup;
  }, {});
}

function createOptimisticSentLikeItem(property: Property, note?: string | null): LikeItemDto {
  const createdAt = new Date().toISOString();
  const trimmedNote = note?.trim() || null;
  return {
    interest_id: `optimistic-${property.id}-${createdAt}`,
    listing_id: property.id,
    title: property.apartmentName,
    address: property.address,
    price_monthly: property.subletPrice,
    photo_url: property.imageUrls[0] || null,
    counterparty_name: 'Host',
    state: 'pending',
    note: trimmedNote,
    created_at: createdAt,
    conversation_id: null,
  };
}

function mergeSentLikeItems(apiItems: LikeItemDto[], optimisticItems: LikeItemDto[]) {
  const apiListingIds = new Set(apiItems.map(item => item.listing_id));
  return [...optimisticItems.filter(item => !apiListingIds.has(item.listing_id)), ...apiItems].sort(compareLikeItemsDescending);
}

type LikesSubTabKey = 'received' | 'sent';

function LikesFromApi({
  userId,
  role,
  onOpenChat,
  optimisticSentItems = [],
  optimisticSuperLikeItems = [],
  optimisticReceivedItems = [],
  onRemoveDemoReceivedLike,
  refreshToken = 0,
}: {
  userId: string;
  role: 'seeker' | 'host';
  onOpenChat?: (conversationId: string) => void;
  optimisticSentItems?: LikeItemDto[];
  optimisticSuperLikeItems?: SuperLikeItemDto[];
  optimisticReceivedItems?: LikeItemDto[];
  onRemoveDemoReceivedLike?: (listingId: string) => void;
  refreshToken?: number;
}) {
  const [subTab, setSubTab] = React.useState<LikesSubTabKey>('received');
  const [receivedItems, setReceivedItems] = React.useState<LikeItemDto[]>([]);
  const [sentItems, setSentItems] = React.useState<LikeItemDto[]>([]);
  const [superSent, setSuperSent] = React.useState<SuperLikeItemDto[]>([]);
  const [superReceived, setSuperReceived] = React.useState<SuperLikeItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [busyInterestId, setBusyInterestId] = React.useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [recv, sent, supS, supR] = await Promise.all([
          fetchLikesReceived(userId),
          fetchLikesSent(userId),
          fetchSuperLikesSent(userId).catch(() => ({ items: [] as SuperLikeItemDto[] })),
          fetchSuperLikesReceived(userId).catch(() => ({ items: [] as SuperLikeItemDto[] })),
        ]);
        if (!cancelled) {
          setReceivedItems(recv.items);
          setSentItems(sent.items);
          setSuperSent(supS.items);
          setSuperReceived(supR.items);
        }
      } catch {
        if (!cancelled) {
          setReceivedItems([]);
          setSentItems([]);
          setSuperSent([]);
          setSuperReceived([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, refreshToken, userId]);

  const likesHeaderSubtitle: Record<LikesSubTabKey, string> = {
    received:
      role === 'seeker'
        ? 'Hosts who liked your profile. Accept to start a chat.'
        : 'Seekers who liked your listing. Accept or decline each interest.',
    sent:
      role === 'seeker'
        ? 'Listings you liked. Hosts may respond from their inbox.'
        : 'Seekers you liked. They can accept from their Likes tab.',
  };

  const mergedSentItems = React.useMemo(
    () => mergeSentLikeItems(sentItems, optimisticSentItems),
    [optimisticSentItems, sentItems],
  );

  // Merge API super likes with optimistic ones (deduplicate by listing_id), sort earliest first
  const mergedSuperSent = React.useMemo(() => {
    const apiListingIds = new Set(superSent.map(s => s.listing_id));
    const merged = [
      ...optimisticSuperLikeItems.filter(s => !apiListingIds.has(s.listing_id)),
      ...superSent,
    ];
    return merged.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }, [superSent, optimisticSuperLikeItems]);

  const mergedReceivedItems = React.useMemo(() => {
    const apiListingIds = new Set(receivedItems.map(r => r.listing_id));
    return [...optimisticReceivedItems.filter(r => !apiListingIds.has(r.listing_id)), ...receivedItems].sort(compareLikeItemsDescending);
  }, [receivedItems, optimisticReceivedItems]);

  const items = subTab === 'received' ? mergedReceivedItems : mergedSentItems;
  const isReceivedTab = subTab === 'received';

  return (
    <>
      <ScrollView
        style={styles.utilityScroll}
        contentContainerStyle={styles.utilityScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <UtilityTabHeader title="Like" alignLeft rightIcon={<NotificationBellIcon />} />
        <View style={styles.likesSegmentRow}>
          <TouchableOpacity
            style={[styles.likesSegmentBtn, subTab === 'received' && styles.likesSegmentBtnActive]}
            onPress={() => setSubTab('received')}
          >
            <Text
              style={[styles.likesSegmentLabel, subTab === 'received' && styles.likesSegmentLabelActive]}
              numberOfLines={1}
            >
              Likes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.likesSegmentBtn, subTab === 'sent' && styles.likesSegmentBtnActive]}
            onPress={() => setSubTab('sent')}
          >
            <Text
              style={[styles.likesSegmentLabel, subTab === 'sent' && styles.likesSegmentLabelActive]}
              numberOfLines={1}
            >
              Likes sent
            </Text>
          </TouchableOpacity>
        </View>
        {loading ? null : (
          <>
            {!isReceivedTab && mergedSuperSent.length > 0 && (
              <SuperLikeHighlightList items={mergedSuperSent} variant="sent" />
            )}
            {!isReceivedTab && role === 'host' && superReceived.length > 0 && (
              <SuperLikeHighlightList items={superReceived} variant="received" />
            )}
          </>
        )}
        {loading ? null : items.length === 0 ? (
          <Text style={styles.likesEmptyApi}>
            {isReceivedTab
              ? 'No likes here yet. New interest will show up here first.'
              : 'No likes sent yet. Swipe in Explore to start reaching out.'}
          </Text>
        ) : (
          <View style={styles.likesSectionCard}>
            {items.map((it, index) => {
              const executeAccept = async () => {
                setHiddenIds(prev => new Set(prev).add(it.interest_id));
                if (it.interest_id.startsWith('demo-received-')) {
                  if (onRemoveDemoReceivedLike) onRemoveDemoReceivedLike(it.listing_id);
                  if (onOpenChat) onOpenChat('demo:' + it.listing_id);
                  return;
                }
                setBusyInterestId(it.interest_id);
                try {
                  const r = await postInterestRespond(it.interest_id, { user_id: userId, action: 'accept' });
                  setRefreshKey(k => k + 1);
                  if (r.conversation_id && onOpenChat) onOpenChat(r.conversation_id);
                  else if (onOpenChat) onOpenChat('mock-id');
                } catch(e) {} finally { setBusyInterestId(null); }
              };

              const executeDecline = async () => {
                setHiddenIds(prev => new Set(prev).add(it.interest_id));
                // Demo items: permanently remove from parent state
                if (it.interest_id.startsWith('demo-received-')) {
                  if (onRemoveDemoReceivedLike) onRemoveDemoReceivedLike(it.listing_id);
                  return;
                }
                setBusyInterestId(it.interest_id);
                try {
                  await postInterestRespond(it.interest_id, { user_id: userId, action: 'decline' });
                  setRefreshKey(k => k + 1);
                } catch(e) {} finally { setBusyInterestId(null); }
              };

              const renderLeftActions = () => {
                if (isReceivedTab) {
                  return (
                    <View style={{ flexDirection: 'row' }}>
                      <TouchableOpacity style={{ backgroundColor: '#32D74B', justifyContent: 'center', alignItems: 'center', width: 75 }} onPress={executeAccept}>
                        <Ionicons name="checkmark-circle-outline" size={32} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  );
                }
                return null;
              };

              const renderRightActions = () => {
                if (isReceivedTab) {
                  return (
                    <View style={{ flexDirection: 'row' }}>
                      <TouchableOpacity style={{ backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 75 }} onPress={executeDecline}>
                        <Ionicons name="close-outline" size={32} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  );
                }
                return (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={{ backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 75 }} onPress={executeDecline}>
                      <Ionicons name="close-outline" size={32} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                );
              };

              if (hiddenIds.has(it.interest_id)) return null;

              return (
                <View key={it.interest_id} style={{ borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                  <Swipeable renderLeftActions={renderLeftActions} renderRightActions={renderRightActions}>
                    <View style={[styles.likeItemRow, { backgroundColor: '#FFF' }]}>
                      {/* Left: Avatar */}
                      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#CCC', marginRight: 16, overflow: 'hidden' }}>
                        <Image source={{ uri: it.photo_url || MOCK_PROPERTIES[0].imageUrls[0] }} style={{ width: '100%', height: '100%' }} />
                      </View>
                      
                      {/* Center: Texts */}
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, color: '#888', marginBottom: 2 }} numberOfLines={1}>
                          {it.counterparty_name}
                        </Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 2 }} numberOfLines={1}>
                          {it.title}
                        </Text>
                        <Text style={styles.likeItemSupportingText} numberOfLines={1}>
                          {it.note?.trim() ? likeNotePreview(it.note) : it.address}
                        </Text>
                      </View>

                      {/* Right: Time */}
                      <View style={{ alignItems: 'flex-end', justifyContent: 'center', width: 60 }}>
                        <Text style={{ fontSize: 11, color: '#888', position: 'absolute', top: 0, right: 0 }}>
                          {formatChatListTimeLabel(it.created_at)}
                        </Text>
                      </View>
                    </View>
                  </Swipeable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      <FullscreenBuckyLoading visible={loading} size={96} swing={26} />
    </>
  );
}

function hasCompletedSeekerPreferences(profile: ProfileMeDto) {
  if (profile.role !== 'seeker') return true;
  const seeker = profile.seeker;
  if (!seeker) return false;

  const prefs = typeof seeker.prefs === 'object' && seeker.prefs ? seeker.prefs : {};
  const neighborhoods = Array.isArray((prefs as Record<string, unknown>).preferred_neighborhoods)
    ? ((prefs as Record<string, unknown>).preferred_neighborhoods as unknown[])
    : [];
  const roommatePrefs =
    typeof profile.roommate_prefs === 'object' && profile.roommate_prefs ? profile.roommate_prefs : {};
  const bathCount = (roommatePrefs as Record<string, unknown>).bath_count;
  const onboardingVersion = (roommatePrefs as Record<string, unknown>).onboarding_version;

  return Boolean(
    seeker.stay_start_date &&
      seeker.stay_end_date &&
      seeker.room_type_pref &&
      seeker.gender_pref &&
      neighborhoods.some(item => typeof item === 'string' && item.trim().length > 0) &&
      typeof seeker.budget_min === 'number' &&
      seeker.budget_min > 0 &&
      typeof seeker.budget_max === 'number' &&
      seeker.budget_max > seeker.budget_min &&
      typeof bathCount === 'string' &&
      typeof onboardingVersion === 'number' &&
      onboardingVersion >= 3,
  );
}

function formatJoinedDateLabel(raw?: string) {
  if (!raw) return 'Joined recently';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Joined recently';
  return `Joined ${parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string' && item.trim().length > 0) as string[];
}

function formatBudgetRangeLabel(min?: number | null, max?: number | null) {
  if (typeof min === 'number' && typeof max === 'number' && min > 0 && max >= min) {
    return `$${min}-$${max}/mo`;
  }
  if (typeof min === 'number' && min > 0) {
    return `From $${min}/mo`;
  }
  if (typeof max === 'number' && max > 0) {
    return `Up to $${max}/mo`;
  }
  return 'Not set';
}

function formatIsoDateLabel(raw?: string | null) {
  const value = (raw ?? '').trim();
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthYearLabel(year: unknown, month: unknown) {
  if (typeof year !== 'number' || typeof month !== 'number') return 'Not set';
  const parsed = new Date(year, month - 1, 1);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatRoomPreferenceLabel(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return 'Not set';
  switch (raw.trim().toUpperCase()) {
    case '1BR':
      return '1BR';
    case '2BR':
      return '2BR';
    case '3BR':
      return '3BR';
    case '4BR':
      return '4BR';
    case '5BR':
      return '5BR';
    case '6BR':
      return '6BR';
    default:
      return raw.trim();
  }
}

function getPreferredAreas(profile: ProfileMeDto | null) {
  if (!profile) return [];
  const seekerPrefs = typeof profile.seeker?.prefs === 'object' && profile.seeker?.prefs
    ? profile.seeker.prefs
    : {};
  const seekerAreas = asStringArray((seekerPrefs as Record<string, unknown>).preferred_neighborhoods);
  if (seekerAreas.length > 0) return seekerAreas;
  return asStringArray((profile.roommate_prefs as Record<string, unknown>).preferred_locations);
}

function buildProfileSummary(profile: ProfileMeDto | null, authUser: AuthUser) {
  if (!profile) {
    return authUser.role === 'seeker'
      ? 'Your sublease preferences will appear here after you finish Edit Profile.'
      : 'Your listing setup will appear here after you finish Edit Profile.';
  }

  const roommatePrefs = profile.roommate_prefs as Record<string, unknown>;
  const areas = getPreferredAreas(profile);

  if (authUser.role === 'seeker') {
    return [
      `Budget: ${formatBudgetRangeLabel(profile.seeker?.budget_min, profile.seeker?.budget_max)}`,
      `Move-in window: ${formatIsoDateLabel(profile.seeker?.stay_start_date)} to ${formatIsoDateLabel(profile.seeker?.stay_end_date)}`,
      `Room type: ${formatRoomPreferenceLabel(profile.seeker?.room_type_pref)}`,
      `Gender preference: ${profile.seeker?.gender_pref || 'Any'}`,
      `Bath preference: ${typeof roommatePrefs.bath_count === 'string' ? roommatePrefs.bath_count : 'Not set'}`,
      `Preferred areas: ${areas.length > 0 ? areas.join(', ') : 'Not set'}`,
    ].join('\n');
  }

  return [
    `Move-out target: ${formatMonthYearLabel(roommatePrefs.move_out_year, roommatePrefs.move_out_month)}`,
    `Base rent: ${typeof roommatePrefs.base_rent === 'number' ? `$${roommatePrefs.base_rent}/mo` : 'Not set'}`,
    `Room type: ${formatRoomPreferenceLabel(roommatePrefs.room_type_pref)}`,
    `Roommate count: ${typeof roommatePrefs.roommate_count === 'number' ? roommatePrefs.roommate_count : 'Not set'}`,
    `Gender preference: ${typeof roommatePrefs.roommate_gender === 'string' ? roommatePrefs.roommate_gender : 'Not set'}`,
    `Preferred areas: ${areas.length > 0 ? areas.join(', ') : 'Not set'}`,
    `Negotiable: ${roommatePrefs.price_negotiable === false ? 'No' : 'Yes'}`,
  ].join('\n');
}

function buildWorkflowSummary(role: AuthRole) {
  const roleSpecificLine =
    role === 'seeker'
      ? 'As a seeker, you finish your move-in, room, location, and budget preferences before Explore unlocks.'
      : 'As a host, you finish your move-out, room, roommate, location, and price setup before using the app.';

  return [
    '1. Read House Rules and pick whether you are looking for a sublease or offering one.',
    '2. Sign in with your school email and create your account.',
    '3. Complete the profile setup flow so the feed knows your timing and preferences.',
    '4. Swipe in Explore, review activity in Likes, and accept a like to open chat.',
    '5. Use 1:1 chat to confirm rent, dates, and lease-transfer details before handing off.',
    '',
    roleSpecificLine,
  ].join('\n');
}

function ProfileTabWithApi({
  authUser,
  apiEnabled,
  syncProfileFromAuth,
  onEditPreferences,
  onSignOut,
  isLoggingOut,
  demoCounts,
}: {
  authUser: AuthUser;
  apiEnabled: boolean;
  /** Creates public.profiles via Supabase when the API returns 404 (existing accounts before trigger). */
  syncProfileFromAuth?: () => Promise<void>;
  onEditPreferences: () => void;
  onSignOut: () => void;
  isLoggingOut: boolean;
  /** Live session counts to display instead of API-fetched counts (for demo mode). */
  demoCounts?: { likes: number; chats: number; history: number };
}) {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [profileMissing, setProfileMissing] = React.useState(false);
  const [screen, setScreen] = React.useState<'main' | 'settings' | 'account'>('main');
  const [profile, setProfile] = React.useState<ProfileMeDto | null>(null);
  const [likesCount, setLikesCount] = React.useState(0);
  const [chatCount, setChatCount] = React.useState(0);
  const [historyCount, setHistoryCount] = React.useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!apiEnabled) {
      setLoading(false);
      setLoadError(null);
      setProfileMissing(false);
      setProfile(null);
      setLikesCount(0);
      setChatCount(0);
      setHistoryCount(0);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setProfileMissing(false);
    try {
      const [me, likesSentRes, likesReceivedRes, conversations] = await Promise.all([
        fetchProfileMe(authUser.id),
        fetchLikesSent(authUser.id).catch(() => ({ items: [] })),
        fetchLikesReceived(authUser.id).catch(() => ({ items: [] })),
        fetchConversations(authUser.id).catch(() => []),
      ]);

      setProfile(me);
      setLikesCount(likesSentRes.items.length);
      setChatCount(conversations.length);
      setHistoryCount(likesReceivedRes.items.length);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const apiUrl = getExpoPublicApiUrl();
      if (!apiUrl || raw.includes('EXPO_PUBLIC_API_URL')) {
        setLoadError(
          'EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to mobile/.env, set the FastAPI URL, then restart Expo with: npx expo start -c',
        );
      } else if (/network request failed|failed to fetch|networkerror/i.test(raw)) {
        setLoadError(
          `Cannot reach the API (${apiUrl}).\n\n` +
            '• Start the backend from the repo: cd backend && uvicorn main:app --host 0.0.0.0 --port 8000\n' +
            '• iOS Simulator: http://127.0.0.1:8000 in .env is usually correct.\n' +
            '• Physical device: use your computer Wi‑Fi IP (e.g. http://192.168.0.12:8000), not localhost.\n' +
            '• After changing .env, run: npx expo start -c',
        );
      } else if (/^404\b/.test(raw.trim()) || /profile not found/i.test(raw)) {
        setProfileMissing(true);
        setLoadError(
          'No profile row in the database for this account yet. Tap “Sync profile” to create it from your login, or apply the Supabase migration that auto-creates profiles on sign-up.',
        );
      } else if (/^5\d\d\b/.test(raw.trim())) {
        setLoadError(
          `${raw}\n\nIf logs mention a missing DB column, run the SQL from supabase/migrations in the Supabase SQL Editor (or fix schema).`,
        );
      } else {
        setLoadError(raw);
      }
    } finally {
      setLoading(false);
    }
  }, [apiEnabled, authUser.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setScreen('main');
  }, [authUser.id]);

  const displayName = (profile?.display_name || authUser.name || 'User').trim();
  const email = profile?.email || authUser.email || '—';
  const avatarUrl = profile?.avatar_url?.trim() || '';
  const joinedLabel = formatJoinedDateLabel(authUser.createdAt);
  const notificationStorageKey = `profile-notifications:${authUser.id}`;
  const appDisplayName = Constants.expoConfig?.name ?? 'SubLease Match';
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const roleLabel = authUser.role === 'seeker' ? 'Sublease seeker' : 'Sublease host';
  const schoolEmail = profile?.school_email?.trim() || email;

  React.useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(notificationStorageKey)
      .then(value => {
        if (!cancelled) {
          setNotificationsEnabled(value !== '0');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotificationsEnabled(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notificationStorageKey]);

  const renderAvatar = (size: number, iconSize: number, borderRadius: number) => {
    if (avatarUrl) {
      return (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius }}
        />
      );
    }
    return (
      <View
        style={[
          styles.profileAvatarFallback,
          { width: size, height: size, borderRadius },
        ]}
      >
        <Ionicons name="person" size={iconSize} color="#8F8F8F" />
      </View>
    );
  };

  const handleShowContactInformation = () => {
    Alert.alert(
      'Contact Information',
      [
        displayName,
        schoolEmail,
        roleLabel,
        joinedLabel,
        profile?.school_email_verified_at ? 'School email verified' : 'School email verification pending',
      ].join('\n'),
    );
  };

  const handleShowPayoutInformation = () => {
    const body =
      authUser.role === 'seeker'
        ? 'Seekers do not store payout details in this beta. Rent, deposit, and lease-transfer steps are handled directly with the host or leasing office once you match.'
        : 'Hosts set rent and negotiability in Edit Profile. This beta does not collect payouts in-app yet, so final payment and lease-transfer details should be confirmed in chat and with your building manager.';
    Alert.alert('Payout Information', body);
  };

  const handleToggleNotifications = async () => {
    const nextValue = !notificationsEnabled;
    setNotificationsEnabled(nextValue);
    try {
      await AsyncStorage.setItem(notificationStorageKey, nextValue ? '1' : '0');
      Alert.alert(
        'Notifications',
        nextValue
          ? 'Likes and chat activity notifications are on for this device.'
          : 'Likes and chat activity notifications are off for this device.',
      );
    } catch (error) {
      setNotificationsEnabled(!nextValue);
      Alert.alert(
        'Notifications',
        error instanceof Error ? error.message : 'Could not update this setting.',
      );
    }
  };

  const handleShowVersion = () => {
    Alert.alert(
      'Version',
      `${appDisplayName}\nv${appVersion}${apiEnabled ? '\nAPI-connected build' : '\nPreview build'}`,
    );
  };

  const handleShowTerms = () => {
    Alert.alert(
      'Terms of Service',
      [
        'Use a valid school email and keep your role accurate.',
        'Keep rent, dates, photos, and rules truthful before you swipe or accept a match.',
        'No spam, scams, harassment, or misleading sublease offers.',
        'Use Likes and chat for real lease-transfer conversations only.',
      ].join('\n\n'),
    );
  };

  const handleShowPrivacy = () => {
    Alert.alert(
      'Privacy Policy',
      [
        'Subadger stores your email, display name, role, preferences, likes, and chat messages so matching and account recovery work.',
        'Listing photos and profile details are shown inside the app to support swiping, likes, and matching.',
        'This beta does not run ad targeting inside the app.',
      ].join('\n\n'),
    );
  };

  const handleShowOpenSourceLicenses = () => {
    Alert.alert(
      'Open Source License',
      'Built with Expo, React Native, Ionicons, Supabase Auth, AsyncStorage, and a FastAPI backend.',
    );
  };

  const handleChangePassword = async () => {
    if (!supabase) {
      Alert.alert('Change Password', 'Supabase auth is not configured in this build.');
      return;
    }
    if (!email || email === '—') {
      Alert.alert('Change Password', 'No email address is available for this account.');
      return;
    }

    try {
      const redirectTo = getEmailConfirmationRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error) throw error;
      Alert.alert('Change Password', `Password reset instructions were sent to ${email}.`);
    } catch (error) {
      Alert.alert(
        'Change Password',
        error instanceof Error ? error.message : 'Could not send a reset email.',
      );
    }
  };

  const requestDeleteAccount = async () => {
    if (!supabase) {
      Alert.alert(
        'Delete Account',
        'Supabase auth is not configured in this build, so deletion requests cannot be recorded here.',
      );
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          deletion_requested_at: new Date().toISOString(),
          deletion_requested_role: authUser.role,
        },
      });
      if (error) throw error;
      Alert.alert(
        'Delete Account',
        'Your deletion request was recorded for this beta build. You will be signed out now.',
      );
      onSignOut();
    } catch (error) {
      Alert.alert(
        'Delete Account',
        error instanceof Error ? error.message : 'Could not record the deletion request.',
      );
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This beta records a deletion request on your account and signs you out. If you need to switch roles later, you can re-create an account after deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request deletion', style: 'destructive', onPress: () => void requestDeleteAccount() },
      ],
    );
  };

  const handleShowMyPost = () => {
    Alert.alert(
      authUser.role === 'seeker' ? 'My Preferences' : 'Listing Setup',
      buildProfileSummary(profile, authUser),
    );
  };

  const handleShowCurrency = () => {
    Alert.alert('Currency', 'All prices in this build are shown in USD per month.');
  };

  const handleShowHelp = () => {
    Alert.alert(
      'Help',
      [
        'Use your school email to sign in.',
        'Edit Profile reopens the setup flow if your timing or budget changes.',
        'Accepted likes open a 1:1 chat.',
        'If the API is unreachable, verify EXPO_PUBLIC_API_URL in mobile/.env and restart Expo.',
      ].join('\n\n'),
    );
  };

  const handleShowHowItWorks = () => {
    Alert.alert('How It Works', buildWorkflowSummary(authUser.role));
  };

  const profileNotice = loadError ? (
    <View style={styles.profileNoticeCard}>
      <Text style={styles.profileNoticeText}>{loadError}</Text>
      {profileMissing && syncProfileFromAuth ? (
        <TouchableOpacity
          style={[styles.profileNoticeBtn, styles.profileNoticeBtnPrimary]}
          onPress={async () => {
            try {
              await syncProfileFromAuth();
              await load();
            } catch (e) {
              Alert.alert('Sync failed', e instanceof Error ? e.message : 'Could not create profile.');
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.profileNoticeBtnPrimaryText}>Sync profile</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.profileNoticeBtn, styles.profileNoticeBtnSecondary]}
        onPress={() => void load()}
        activeOpacity={0.85}
      >
        <Text style={styles.profileNoticeBtnSecondaryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  if (screen === 'settings') {
    return (
      <>
        <ScrollView style={styles.utilityScroll} contentContainerStyle={styles.profileShellContent}>
          {profileNotice}

          <View style={styles.profileSectionHeaderRow}>
            <TouchableOpacity style={styles.profileBackBtn} onPress={() => setScreen('main')} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={26} color="#222" />
            </TouchableOpacity>
            <Text style={styles.profileScreenTitle}>Settings</Text>
          </View>

          <View style={styles.profileMenuSection}>
            <TouchableOpacity style={styles.profileMenuRow} activeOpacity={0.8} onPress={() => setScreen('account')}>
              <Text style={styles.profileMenuLabel}>Profile</Text>
              <Ionicons name="person-outline" size={24} color="#30323B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={handleShowContactInformation}
            >
              <Text style={styles.profileMenuLabel}>Contact Information</Text>
              <Ionicons name="card-outline" size={24} color="#30323B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={handleShowPayoutInformation}
            >
              <Text style={styles.profileMenuLabel}>Payout Information</Text>
              <Ionicons name="cash-outline" size={24} color="#30323B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={() => void handleToggleNotifications()}
            >
              <Text style={styles.profileMenuLabel}>Notifications</Text>
              <Ionicons
                name={notificationsEnabled ? 'notifications-outline' : 'notifications-off-outline'}
                size={24}
                color="#30323B"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.profileSupportBlock}>
            <Text style={styles.profileSupportTitle}>Support & More</Text>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={handleShowVersion}
            >
              <Text style={styles.profileMenuLabel}>Version</Text>
              <Ionicons name="phone-portrait-outline" size={24} color="#30323B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={handleShowTerms}
            >
              <Text style={styles.profileMenuLabel}>Terms of Service</Text>
              <Ionicons name="document-text-outline" size={24} color="#30323B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={handleShowPrivacy}
            >
              <Text style={styles.profileMenuLabel}>Privacy Policy</Text>
              <Ionicons name="shield-checkmark-outline" size={24} color="#30323B" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuRow}
              activeOpacity={0.8}
              onPress={handleShowOpenSourceLicenses}
            >
              <Text style={styles.profileMenuLabel}>Open Source License</Text>
              <Ionicons name="code-slash-outline" size={24} color="#30323B" />
            </TouchableOpacity>
          </View>
        </ScrollView>
        <FullscreenBuckyLoading visible={loading} size={100} swing={28} />
      </>
    );
  }

  if (screen === 'account') {
    return (
      <>
        <ScrollView style={styles.utilityScroll} contentContainerStyle={styles.profileShellContent}>
          {profileNotice}

          <View style={styles.profileSectionHeaderRow}>
            <TouchableOpacity style={styles.profileBackBtn} onPress={() => setScreen('settings')} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={26} color="#222" />
            </TouchableOpacity>
            <Text style={styles.profileScreenTitle}>My Account</Text>
          </View>

          <View style={styles.profileAccountHero}>
            {renderAvatar(96, 44, 48)}
            <Text style={styles.profileAccountName}>{displayName}</Text>
            <Text style={styles.profileAccountEmail}>{email}</Text>
            <Text style={styles.profileAccountJoined}>{joinedLabel}</Text>
          </View>

          <View style={styles.profileAccountCard}>
            <TouchableOpacity
              style={styles.profileAccountRow}
              activeOpacity={0.8}
              onPress={() => void handleChangePassword()}
            >
              <View style={styles.profileAccountRowLeft}>
                <Ionicons name="lock-closed-outline" size={22} color="#2C2F38" />
                <Text style={styles.profileAccountRowText}>Change Password</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#9A9A9A" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.profileDangerAction} onPress={onSignOut} activeOpacity={0.8}>
              <Text style={styles.profileDangerText}>{isLoggingOut ? 'Signing Out...' : 'Sign Out'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.profileDangerAction}
              onPress={handleDeleteAccount}
              activeOpacity={0.8}
            >
              <Text style={styles.profileDangerText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <FullscreenBuckyLoading visible={loading || isLoggingOut} size={100} swing={28} />
      </>
    );
  }

  return (
    <>
      <ScrollView style={styles.utilityScroll} contentContainerStyle={styles.profileShellContent}>
        {profileNotice}

        <View style={styles.profileTopRow}>
          <Text style={styles.profileScreenTitle}>My Page</Text>
          <TouchableOpacity style={styles.profileSettingsBtn} onPress={() => setScreen('settings')} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={28} color="#2B2E36" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileIdentityRow}>
          {renderAvatar(118, 54, 59)}
          <View style={styles.profileIdentityCopy}>
            <Text style={styles.profileIdentityName}>{displayName}</Text>
            <Text style={styles.profileIdentityEmail}>{email}</Text>
            <TouchableOpacity
              style={styles.profileEditLinkBtn}
              onPress={onEditPreferences}
              activeOpacity={0.85}
            >
              <Text style={styles.profileEditLinkText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.profileBlockTitle}>Subleasing</Text>
        <View style={styles.profileStatsCard}>
          <View style={styles.profileStatCell}>
            <Text style={styles.profileStatLabel}>Like</Text>
            <Text style={styles.profileStatValue}>{demoCounts?.likes ?? likesCount}</Text>
          </View>
          <View style={styles.profileStatCell}>
            <Text style={styles.profileStatLabel}>Chat</Text>
            <Text style={styles.profileStatValue}>{demoCounts?.chats ?? chatCount}</Text>
          </View>
          <View style={styles.profileStatCell}>
            <Text style={styles.profileStatLabel}>History</Text>
            <Text style={styles.profileStatValue}>{demoCounts?.history ?? historyCount}</Text>
          </View>
        </View>

        <View style={styles.profileLinksBlock}>
          <TouchableOpacity
            style={styles.profileLinkRow}
            activeOpacity={0.82}
            onPress={handleShowMyPost}
          >
            <Text style={styles.profileLinkLabel}>My post</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileLinkRow} activeOpacity={0.82} onPress={handleShowCurrency}>
            <Text style={styles.profileLinkLabel}>Currency</Text>
            <View style={styles.profileCurrencyPill}>
              <Text style={styles.profileCurrencyText}>$USD</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileLinkRow}
            activeOpacity={0.82}
            onPress={handleShowHelp}
          >
            <Text style={styles.profileLinkLabel}>Help</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileLinkRow}
            activeOpacity={0.82}
            onPress={handleShowHowItWorks}
            >
              <Text style={styles.profileLinkLabel}>How It Works</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.profileBottomLogoutBtn, isLoggingOut && styles.profileBottomLogoutBtnDisabled]}
            onPress={onSignOut}
            activeOpacity={0.82}
            disabled={isLoggingOut}
          >
            <Text style={styles.profileBottomLogoutText}>{isLoggingOut ? 'Signing Out...' : 'Log Out'}</Text>
          </TouchableOpacity>
      </ScrollView>
      <FullscreenBuckyLoading visible={loading || isLoggingOut} size={100} swing={28} />
    </>
  );
}

const LIKES_MOCK_SUBTITLES: Record<LikeSectionKey, string> = {
  received: 'People who showed interest in you—newest activity first.',
  sent: 'Places or people you liked—follow up when you are ready.',
};

function LikesTabContent({ sections, onChatNavigate }: { sections: LikeSection[]; onChatNavigate?: () => void }) {
  const [subTab, setSubTab] = React.useState<LikeSectionKey>('received');
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(new Set());
  const sectionMap = React.useMemo(
    () => Object.fromEntries(sections.map(s => [s.key, s])) as Record<LikeSectionKey, LikeSection>,
    [sections],
  );
  const active = sectionMap[subTab];
  const shortTabLabel = (key: LikeSectionKey) => {
    if (key === 'received') return 'Received';
    return 'Sent';
  };

  return (
    <ScrollView
      style={styles.utilityScroll}
      contentContainerStyle={styles.utilityScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <UtilityTabHeader title="Like" alignLeft rightIcon={<NotificationBellIcon />} />

      <View style={styles.likesSegmentRow}>
        {(['received', 'sent'] as const).map(key => {
          return (
            <TouchableOpacity
              key={key}
              style={[styles.likesSegmentBtn, subTab === key && styles.likesSegmentBtnActive]}
              onPress={() => setSubTab(key)}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.likesSegmentLabel, subTab === key && styles.likesSegmentLabelActive]}
                numberOfLines={2}
              >
                {key === 'received' ? 'Likes' : 'Likes sent'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {active ? (
        active.items.length === 0 ? (
          <Text style={styles.likesEmptyApi}>
            {subTab === 'received'
              ? 'No likes here yet. New interest will show up here first.'
              : 'No likes sent yet. Swipe in Explore to start reaching out.'}
          </Text>
        ) : (
        <View>
          {active.items.map((it, index) => {
            const isReceivedTab = subTab === 'received';
            const executeAccept = () => {
              setHiddenIds(prev => new Set(prev).add(it.id));
              if (onChatNavigate) onChatNavigate();
            };

            const executeDecline = () => {
              setHiddenIds(prev => new Set(prev).add(it.id));
            };

            const renderLeftActions = () => {
              if (isReceivedTab) {
                return (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={{ backgroundColor: '#32D74B', justifyContent: 'center', alignItems: 'center', width: 75 }} onPress={executeAccept}>
                      <Ionicons name="checkmark-circle-outline" size={32} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                );
              }
              return null;
            };

            const renderRightActions = () => {
              if (isReceivedTab) {
                return (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={{ backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 75 }} onPress={executeDecline}>
                      <Ionicons name="close-outline" size={32} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                );
              }
              return (
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity style={{ backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 75 }} onPress={executeDecline}>
                    <Ionicons name="close-outline" size={32} color="#FFF" />
                  </TouchableOpacity>
                </View>
              );
            };

            if (hiddenIds.has(it.id)) return null;

            return (
              <View key={it.id} style={{ borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                <Swipeable renderLeftActions={renderLeftActions} renderRightActions={renderRightActions}>
                  <View style={[styles.likeItemRow, { backgroundColor: '#FFF' }]}>
                    {/* Left: Avatar */}
                    <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#CCC', marginRight: 16, overflow: 'hidden' }}>
                      <Image source={{ uri: it.imageUrl || MOCK_PROPERTIES[0].imageUrls[0] }} style={{ width: '100%', height: '100%' }} />
                    </View>
                    
                    {/* Center: Texts */}
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#888', marginBottom: 2 }} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 2 }} numberOfLines={1}>
                        {it.headline}
                      </Text>
                      <Text style={styles.likeItemSupportingText} numberOfLines={1}>
                        {it.detail}
                      </Text>
                    </View>

                    {/* Right: Time */}
                    <View style={{ alignItems: 'flex-end', justifyContent: 'center', width: 60 }}>
                      <Text style={{ fontSize: 11, color: '#888', position: 'absolute', top: 0, right: 0 }}>
                        {it.timeLabel || ''}
                      </Text>
                    </View>
                  </View>
                </Swipeable>
              </View>
              );
            })}
        </View>
        )
      ) : null}
    </ScrollView>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.filterChipPressed,
      ]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FilterPriceRangeSlider({
  minValue,
  maxValue,
  onChange,
}: {
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const minValueRef = useRef(minValue);
  const maxValueRef = useRef(maxValue);
  const minStartPositionRef = useRef(0);
  const maxStartPositionRef = useRef(0);

  useEffect(() => {
    minValueRef.current = minValue;
    maxValueRef.current = maxValue;
  }, [maxValue, minValue]);

  const priceToPosition = useCallback(
    (value: number) => {
      if (trackWidth <= 0) return 0;
      return ((value - FILTER_PRICE_MIN) / (FILTER_PRICE_MAX - FILTER_PRICE_MIN)) * trackWidth;
    },
    [trackWidth],
  );

  const positionToPrice = useCallback(
    (position: number) => {
      if (trackWidth <= 0) return FILTER_PRICE_MIN;
      const ratio = clamp(position / trackWidth, 0, 1);
      const rawValue = FILTER_PRICE_MIN + ratio * (FILTER_PRICE_MAX - FILTER_PRICE_MIN);
      return snapFilterPrice(rawValue);
    },
    [trackWidth],
  );

  const updateMinFromPosition = useCallback(
    (position: number) => {
      const nextValue = positionToPrice(position);
      const normalized = normalizeFilterPriceRange(nextValue, maxValueRef.current);
      onChange(normalized.min, normalized.max);
    },
    [onChange, positionToPrice],
  );

  const updateMaxFromPosition = useCallback(
    (position: number) => {
      const nextValue = positionToPrice(position);
      const normalized = normalizeFilterPriceRange(minValueRef.current, nextValue);
      onChange(normalized.min, normalized.max);
    },
    [onChange, positionToPrice],
  );

  const minResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          minStartPositionRef.current = priceToPosition(minValueRef.current);
        },
        onPanResponderMove: (_, gestureState) => {
          updateMinFromPosition(minStartPositionRef.current + gestureState.dx);
        },
      }),
    [priceToPosition, updateMinFromPosition],
  );

  const maxResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          maxStartPositionRef.current = priceToPosition(maxValueRef.current);
        },
        onPanResponderMove: (_, gestureState) => {
          updateMaxFromPosition(maxStartPositionRef.current + gestureState.dx);
        },
      }),
    [priceToPosition, updateMaxFromPosition],
  );

  const handleTrackPress = useCallback(
    (event: GestureResponderEvent) => {
      if (trackWidth <= 0) return;
      const x = event.nativeEvent.locationX;
      const minPosition = priceToPosition(minValue);
      const maxPosition = priceToPosition(maxValue);
      if (Math.abs(x - minPosition) <= Math.abs(x - maxPosition)) {
        updateMinFromPosition(x);
      } else {
        updateMaxFromPosition(x);
      }
    },
    [maxValue, minValue, priceToPosition, trackWidth, updateMaxFromPosition, updateMinFromPosition],
  );

  const minHandleLeft = priceToPosition(minValue);
  const maxHandleLeft = priceToPosition(maxValue);
  const selectedLeft = Math.min(minHandleLeft, maxHandleLeft);
  const selectedWidth = Math.max(maxHandleLeft - minHandleLeft, 0);

  return (
    <View style={styles.filterSliderWrap}>
      <Pressable
        style={styles.filterSliderPressArea}
        onPress={handleTrackPress}
        onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View style={styles.filterSliderTrack} />
        <View style={[styles.filterSliderTrackSelected, { left: selectedLeft, width: selectedWidth }]} />
        <View style={[styles.filterSliderHandleHitbox, { left: minHandleLeft - 16 }]} {...minResponder.panHandlers}>
          <View style={styles.filterSliderHandle} />
        </View>
        <View style={[styles.filterSliderHandleHitbox, { left: maxHandleLeft - 16 }]} {...maxResponder.panHandlers}>
          <View style={styles.filterSliderHandle} />
        </View>
      </Pressable>
    </View>
  );
}

/** Bottom inset to sit content above the keyboard — uses screenY so we don't double-count vs. tab-bar padding. */
function useKeyboardBottomInset(): number {
  const { height: windowHeight } = useWindowDimensions();
  const [inset, setInset] = React.useState(0);
  React.useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        const { screenY, height: kbHeight } = e.endCoordinates;
        if (Platform.OS === 'ios') {
          setInset(Math.max(0, windowHeight - screenY));
        } else {
          setInset(Math.max(0, kbHeight));
        }
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setInset(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [windowHeight]);
  return inset;
}

function ChatTabContent({
  threads,
  selectedChatId,
  draftMessage,
  onSelectThread,
  onChangeDraft,
  onSendMessage,
  forceOpenThreadId,
  onExitDemoChat,
  onShowListingDetail,
}: {
  threads: ChatThread[];
  selectedChatId: string;
  draftMessage: string;
  onSelectThread: (threadId: string) => void;
  onChangeDraft: (value: string) => void;
  onSendMessage: () => void;
  forceOpenThreadId?: string | null;
  onExitDemoChat?: () => void;
  onShowListingDetail?: (property: Property) => void;
}) {
  const [isThreadOpen, setIsThreadOpen] = React.useState(false);
  const kbInset = useKeyboardBottomInset();

  React.useEffect(() => {
    if (forceOpenThreadId) {
      onSelectThread(forceOpenThreadId);
      setIsThreadOpen(true);
    }
  }, [forceOpenThreadId]);

  const effectiveId = forceOpenThreadId ?? selectedChatId;
  const selectedThread = threads.find(thread => thread.id === effectiveId) ?? threads[0] ?? null;

  const openThread = (threadId: string) => {
    onSelectThread(threadId);
    setIsThreadOpen(true);
  };

  if (!isThreadOpen) {
    return (
      <View style={styles.chatScreen}>
        <UtilityTabHeader title="Chat" alignLeft rightIcon={<NotificationBellIcon />} />

        <ScrollView
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          showsVerticalScrollIndicator={false}
        >
          {threads.length === 0 ? (
            <View style={styles.chatEmptySearch}>
              <Text style={styles.chatEmptySearchTitle}>No chats yet</Text>
              <Text style={styles.chatEmptySearchSubtitle}>Accepted likes will show up here.</Text>
            </View>
          ) : (
            threads.map(thread => {
              const lastMessage = thread.messages[thread.messages.length - 1];
              const previewText = lastMessage?.text ?? 'Accepted like · tap to open the conversation';

              return (
                <ChatInboxRow
                  key={thread.id}
                  avatarUrl={thread.avatarUrl}
                  eyebrow={thread.subtitle}
                  headline={thread.title}
                  preview={previewText}
                  timeLabel={formatChatListTimeLabel(lastMessage?.timestamp)}
                  unreadCount={thread.unreadCount}
                  onPress={() => openThread(thread.id)}
                />
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  if (!selectedThread) {
    return (
      <View style={styles.chatScreen}>
        <UtilityTabHeader title="Chat" alignLeft rightIcon={<NotificationBellIcon />} />
        <View style={styles.chatEmptySearch}>
          <Text style={styles.chatEmptySearchTitle}>No chats yet</Text>
          <Text style={styles.chatEmptySearchSubtitle}>Accepted likes will show up here.</Text>
        </View>
      </View>
    );
  }

  const detail = splitChatDetail(selectedThread.detail);
  const dateLabel = formatChatConversationDateLabel(selectedThread.messages[0]?.timestamp);

  // Derive listing id from thread id (format: "demo-chat-{listingId}")
  const threadListingId = selectedThread.id.startsWith('demo-chat-')
    ? selectedThread.id.slice('demo-chat-'.length)
    : null;
  const threadProperty = threadListingId
    ? MOCK_PROPERTIES.find(p => p.id === threadListingId) ?? null
    : null;

  return (
    <ChatConversationView
      title={selectedThread.title}
      avatarUrl={selectedThread.avatarUrl}
      listingTitle={selectedThread.title}
      listingMeta={detail.meta || selectedThread.status}
      listingPrice={detail.price}
      dateLabel={dateLabel}
      messages={selectedThread.messages}
      inputValue={draftMessage}
      onChangeText={onChangeDraft}
      onSend={onSendMessage}
      onBack={() => {
        setIsThreadOpen(false);
        if (forceOpenThreadId && onExitDemoChat) onExitDemoChat();
      }}
      kbInset={kbInset}
      onShowListingDetail={
        threadProperty && onShowListingDetail
          ? () => onShowListingDetail(threadProperty)
          : undefined
      }
    />
  );
}

function chatBubbleTextFromApi(body: string): string {
  const t = (body || '').replace(/\u200b/g, '').trim();
  return t.length > 0 ? t : 'Sent a like';
}

function ChatTabFromApi({
  userId,
  focusConversationId,
  onConsumedFocusConversation,
}: {
  userId: string;
  focusConversationId: string | null;
  onConsumedFocusConversation: () => void;
}) {
  const [list, setList] = React.useState<ConversationSummaryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [threadOpen, setThreadOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState('');
  const [messages, setMessages] = React.useState<ChatMessageDto[]>([]);
  const [listingLookup, setListingLookup] = React.useState<Record<string, LikeItemDto>>({});
  const [msgLoading, setMsgLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const kbInset = useKeyboardBottomInset();

  React.useEffect(() => {
    let c = false;
    void (async () => {
      setLoading(true);
      try {
        const [rows, likesSentRes, likesReceivedRes] = await Promise.all([
          fetchConversations(userId),
          fetchLikesSent(userId).catch(() => ({ items: [] as LikeItemDto[] })),
          fetchLikesReceived(userId).catch(() => ({ items: [] as LikeItemDto[] })),
        ]);
        if (!c) {
          setList(rows);
          setListingLookup(indexLikeItemsByListingId([...likesSentRes.items, ...likesReceivedRes.items]));
          setSelectedId(prev => {
            if (prev && rows.some(r => r.conversation_id === prev)) return prev;
            return rows[0]?.conversation_id ?? '';
          });
        }
      } catch {
        if (!c) {
          setList([]);
          setListingLookup({});
        }
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [userId]);

  React.useEffect(() => {
    if (!focusConversationId) return;
    setSelectedId(focusConversationId);
    setThreadOpen(true);
    void (async () => {
      try {
        const [rows, likesSentRes, likesReceivedRes] = await Promise.all([
          fetchConversations(userId),
          fetchLikesSent(userId).catch(() => ({ items: [] as LikeItemDto[] })),
          fetchLikesReceived(userId).catch(() => ({ items: [] as LikeItemDto[] })),
        ]);
        setList(rows);
        setListingLookup(indexLikeItemsByListingId([...likesSentRes.items, ...likesReceivedRes.items]));
      } catch {
        /* keep list */
      }
    })();
    onConsumedFocusConversation();
  }, [focusConversationId, onConsumedFocusConversation, userId]);

  React.useEffect(() => {
    if (!selectedId || !threadOpen) return;
    let c = false;
    setMsgLoading(true);
    void fetchChatMessages(selectedId, userId)
      .then(ms => {
        if (!c) setMessages(ms);
      })
      .catch(() => {
        if (!c) setMessages([]);
      })
      .finally(() => {
        if (!c) setMsgLoading(false);
      });
    return () => {
      c = true;
    };
  }, [selectedId, threadOpen, userId]);

  const selected = list.find(x => x.conversation_id === selectedId) ?? list[0] ?? null;

  if (loading && list.length === 0) {
    return (
      <>
        <View style={styles.chatScreen}>
          <UtilityTabHeader title="Chat" alignLeft rightIcon={<NotificationBellIcon />} />
        </View>
        <FullscreenBuckyLoading visible size={100} swing={28} />
      </>
    );
  }

  if (!threadOpen) {
    return (
      <View style={styles.chatScreen}>
        <UtilityTabHeader title="Chat" alignLeft rightIcon={<NotificationBellIcon />} />
        <ScrollView style={styles.chatList} contentContainerStyle={styles.chatListContent}>
          {list.length === 0 ? (
            <View style={styles.chatEmptySearch}>
              <Text style={styles.chatEmptySearchTitle}>No chats yet</Text>
              <Text style={styles.chatEmptySearchSubtitle}>Conversations appear here after you accept a like.</Text>
            </View>
          ) : (
            list.map(row => (
              (() => {
                const listing = row.listing_id ? listingLookup[row.listing_id] : undefined;
                return (
                  <ChatInboxRow
                    key={row.conversation_id}
                    avatarUrl={null}
                    eyebrow={row.other_display_name}
                    headline={listing?.title || 'Accepted match'}
                    preview={listing?.address || 'Accepted like · tap to open the conversation'}
                    timeLabel={formatChatListTimeLabel(row.last_message_at)}
                    unreadCount={0}
                    onPress={() => {
                      setSelectedId(row.conversation_id);
                      setThreadOpen(true);
                    }}
                  />
                );
              })()
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  if (!selected) {
    return (
      <View style={styles.chatScreen}>
        <UtilityTabHeader title="Chat" alignLeft rightIcon={<NotificationBellIcon />} />
        <View style={styles.chatEmptySearch}>
          <Text style={styles.chatEmptySearchTitle}>No chats yet</Text>
          <Text style={styles.chatEmptySearchSubtitle}>Conversations appear here after you accept a like.</Text>
        </View>
      </View>
    );
  }

  const threadTitle = selected?.other_display_name ?? 'Chat';
  const selectedListing = selected?.listing_id ? listingLookup[selected.listing_id] : undefined;
  const sendDraft = () => {
    const t = draft.trim();
    if (!t || !selectedId) return;
    void postChatMessage(selectedId, userId, { body: t })
      .then(m => {
        setMessages(prev => [...prev, m]);
        setDraft('');
        void fetchConversations(userId).then(setList).catch(() => {});
      })
      .catch(e => Alert.alert('Chat', e instanceof Error ? e.message : 'Send failed'));
  };
  const conversationMeta = selected.last_message_at
    ? `Conversation activity • ${formatChatListTimeLabel(selected.last_message_at)}`
    : 'Conversation activity';
  const dateLabel = messages[0]?.created_at ? formatChatConversationDateLabel(messages[0].created_at) : '';
  const normalizedMessages = messages.map(m => ({
    id: m.id,
    sender: m.sender_id === userId ? 'self' as const : 'other' as const,
    text: chatBubbleTextFromApi(m.body),
  }));

  return (
    <>
      <ChatConversationView
        title={threadTitle}
        avatarUrl={null}
        listingTitle={selectedListing?.title || 'Accepted match'}
        listingMeta={selectedListing?.address || conversationMeta}
        listingPrice={selectedListing ? `$${selectedListing.price_monthly}/mo` : ''}
        dateLabel={dateLabel}
        messages={normalizedMessages}
        inputValue={draft}
        onChangeText={setDraft}
        onSend={sendDraft}
        onBack={() => setThreadOpen(false)}
        kbInset={kbInset}
      />
      <FullscreenBuckyLoading visible={msgLoading} size={92} swing={24} />
    </>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Auth state
  const [authScreen, setAuthScreen] = useState<AuthScreen>('house-rules');
  const [profileOnboardingEntry, setProfileOnboardingEntry] = useState<ProfileOnboardingEntry>('required');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const selectedRoleRef = useRef<AuthRole>('seeker');
  const bootstrappedProfileUserIdRef = useRef<string | null>(null);

  // Dashboard state
  const [properties, setProperties] = useState<Property[]>(() => prioritizeExploreProperties(MOCK_PROPERTIES));
  const [dismissedListingIds, setDismissedListingIds] = useState<string[]>([]);
  const [seekers, setSeekers] = useState<SeekerCard[]>([...MOCK_SEEKER_CARDS]);
  const [activeTab, setActiveTab] = useState<DashboardTab>('explore');
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(() => createChatThreads('seeker'));
  const [selectedChatId, setSelectedChatId] = useState<string>(() => createChatThreads('seeker')[0]?.id ?? '');
  const [draftMessage, setDraftMessage] = useState('');
  const [feedFilters, setFeedFilters] = useState<Record<string, string>>({});
  const [superLikeOpen, setSuperLikeOpen] = useState(false);
  const [superLikeDraft, setSuperLikeDraft] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState({
    min_price: '',
    max_price: '',
    neighborhood: '',
    amenities: '',
    sort: 'newest',
    max_distance_miles: '',
  });
  const superLikeListingIdRef = useRef<string | null>(null);
  const [guestDeckNonce, setGuestDeckNonce] = useState(0);
  const superLikeInAppAlertShownRef = useRef(false);
  const [superLikeInboxCount, setSuperLikeInboxCount] = useState(0);
  const [superLikesSentToday, setSuperLikesSentToday] = useState<SuperLikeItemDto[]>([]);
  const [likeCommentOpen, setLikeCommentOpen] = useState(false);
  const [likeCommentDraft, setLikeCommentDraft] = useState('');
  const [apiChatFocusId, setApiChatFocusId] = useState<string | null>(null);
  const [optimisticSentLikes, setOptimisticSentLikes] = useState<LikeItemDto[]>([]);
  const [localSentLikes, setLocalSentLikes] = useState<LocalSentLikeEntry[]>([]);
  const [likesRefreshNonce, setLikesRefreshNonce] = useState(0);
  const [demoReceivedLikes, setDemoReceivedLikes] = useState<LikeItemDto[]>([]);
  const [demoChatOpenThreadId, setDemoChatOpenThreadId] = useState<string | null>(null);
  const clearApiChatFocus = useCallback(() => setApiChatFocusId(null), []);
  const dismissedListingIdsRef = useRef<string[]>([]);
  useEffect(() => {
    dismissedListingIdsRef.current = dismissedListingIds;
  }, [dismissedListingIds]);
  const dismissedListingIdSet = React.useMemo(() => new Set(dismissedListingIds), [dismissedListingIds]);
  const orderedMockProperties = React.useMemo(() => prioritizeExploreProperties(MOCK_PROPERTIES), []);
  const remainingMockProperties = React.useMemo(
    () => orderedMockProperties.filter(property => !dismissedListingIdSet.has(property.id)),
    [dismissedListingIdSet, orderedMockProperties],
  );
  const normalizedFilterPrice = React.useMemo(
    () =>
      normalizeFilterPriceRange(
        parseFilterPriceValue(filterDraft.min_price, FILTER_PRICE_MIN),
        parseFilterPriceValue(filterDraft.max_price, FILTER_PRICE_MAX),
      ),
    [filterDraft.max_price, filterDraft.min_price],
  );
  const selectedAmenities = React.useMemo(
    () => parseAmenitiesDraft(filterDraft.amenities),
    [filterDraft.amenities],
  );

  const handleFilterPriceChange = useCallback((min: number, max: number) => {
    setFilterDraft(d => ({ ...d, min_price: String(min), max_price: String(max) }));
  }, []);

  const handleApplyFilters = useCallback(() => {
    const next: Record<string, string> = {};
    if (filterDraft.min_price.trim()) next.min_price = filterDraft.min_price.trim();
    if (filterDraft.max_price.trim()) next.max_price = filterDraft.max_price.trim();
    setFeedFilters(next);
    setProperties(prev => applyPropertyFilters(prev, next));
    if (!USE_API_FEED || !currentUser?.id) {
      setProperties(applyPropertyFilters([...remainingMockProperties], next));
    }
    setFilterOpen(false);
  }, [filterDraft, currentUser?.id, remainingMockProperties]);

  const handleResetFilters = useCallback(() => {
    setFilterDraft({
      min_price: '',
      max_price: '',
      neighborhood: '',
      amenities: '',
      sort: 'newest',
      max_distance_miles: '',
    });
    setFeedFilters({});
    // Reset deck to all mock properties
    if (!USE_API_FEED || !currentUser?.id) {
      setProperties([...remainingMockProperties]);
    }
    setFilterOpen(false);
  }, [currentUser?.id, remainingMockProperties]);

  const handleToggleAmenity = useCallback((label: string) => {
    setFilterDraft(current => {
      const existing = parseAmenitiesDraft(current.amenities);
      const next = existing.includes(label)
        ? existing.filter(item => item !== label)
        : [...existing, label];
      return { ...current, amenities: serializeAmenitiesDraft(next) };
    });
  }, []);

  const handleSelectSort = useCallback((value: string) => {
    setFilterDraft(current => ({ ...current, sort: value }));
  }, []);

  const handleSelectDistance = useCallback((value: string) => {
    setFilterDraft(current => ({ ...current, max_distance_miles: value }));
  }, []);

  const handleSelectNeighborhood = useCallback((value: string) => {
    setFilterDraft(current => ({
      ...current,
      neighborhood: current.neighborhood.trim().toLowerCase() === value.trim().toLowerCase() ? '' : value,
    }));
  }, []);

  // Detail modal state
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [detailPropertyVisible, setDetailPropertyVisible] = useState(false);
  const [detailSeeker, setDetailSeeker] = useState<SeekerCard | null>(null);
  const [detailSeekerVisible, setDetailSeekerVisible] = useState(false);

  // Ref for imperative swipe from action buttons
  const topCardRef = useRef<SwipeCardRef>(null);

  const resetChatState = useCallback((mode: AppMode) => {
    // When API feed is enabled, start with no threads — real threads come from
    // accepting likes (demo AI threads) or from the API (ChatTabFromApi).
    // When API feed is off, pre-populate with static mock threads.
    if (USE_API_FEED) {
      setChatThreads([]);
      setSelectedChatId('');
    } else {
      const nextThreads = createChatThreads(mode);
      setChatThreads(nextThreads);
      setSelectedChatId(nextThreads[0]?.id ?? '');
    }
    setDraftMessage('');
  }, []);

  const resetDashboardState = useCallback((mode: AppMode) => {
    setActiveTab('explore');
    setDismissedListingIds([]);
    setProperties([...orderedMockProperties]);
    setSeekers([...MOCK_SEEKER_CARDS]);
    setOptimisticSentLikes([]);
    setLocalSentLikes([]);
    setLikesRefreshNonce(0);
    resetChatState(mode);
  }, [orderedMockProperties, resetChatState]);

  const finalizeSeekerSwipe = useCallback(
    (action: 'like' | 'pass', likeBody?: string | null) => {
      const top = properties[0];
      if (!top) return;

      const trimmed = likeBody?.trim();
      let optimisticInterestId: string | null = null;
      const shouldSyncToApi = Boolean(USE_API_FEED && currentUser?.id && isUuidLike(top.id));

      if (action === 'like') {
        const localEntry: LocalSentLikeEntry = {
          property: top,
          note: trimmed || null,
          createdAt: new Date().toISOString(),
        };
        setLocalSentLikes(prev => {
          const withoutSameListing = prev.filter(item => item.property.id !== top.id);
          return [localEntry, ...withoutSameListing];
        });

        // Demo listing: 50/50 chance the host likes back
        if (!isUuidLike(top.id) && Math.random() < 0.5) {
          const mockIndex = MOCK_PROPERTIES.findIndex(p => p.id === top.id);
          const hostName = mockIndex >= 0 && HOST_CONTACTS[mockIndex] ? HOST_CONTACTS[mockIndex] : 'Host';
          const demoItem: LikeItemDto = {
            interest_id: `demo-received-${top.id}`,
            listing_id: top.id,
            title: top.apartmentName,
            address: top.address,
            price_monthly: top.subletPrice,
            photo_url: top.imageUrls[0] || null,
            counterparty_name: hostName,
            state: 'pending',
            note: null,
            created_at: new Date().toISOString(),
            conversation_id: null,
          };
          setDemoReceivedLikes(prev =>
            prev.some(r => r.listing_id === top.id) ? prev : [demoItem, ...prev],
          );
        }
      }

      if (USE_API_FEED && currentUser?.id && action === 'like') {
        const optimisticItem = createOptimisticSentLikeItem(top, trimmed);
        optimisticInterestId = optimisticItem.interest_id;
        setOptimisticSentLikes(prev => {
          const withoutSameListing = prev.filter(item => item.listing_id !== optimisticItem.listing_id);
          return [optimisticItem, ...withoutSameListing];
        });
      }

      setDismissedListingIds(prev => (prev.includes(top.id) ? prev : [...prev, top.id]));

      if (shouldSyncToApi && currentUser?.id) {
        if (action === 'like') {
          // already staged optimistically above
        }

        const payload =
          action === 'pass'
            ? { user_id: currentUser.id, listing_id: top.id, action: 'pass' as const }
            : {
                user_id: currentUser.id,
                listing_id: top.id,
                action: 'like' as const,
                ...(trimmed ? { body: trimmed } : {}),
              };
        void postSwipe(payload)
          .then(() => {
            setLikesRefreshNonce(n => n + 1);
            void pushFeedStack(currentUser.id, top.id).catch(err => {
              console.warn('Feed stack push failed', err);
            });
          })
          .catch(err => {
            if (optimisticInterestId) {
              setOptimisticSentLikes(prev => prev.filter(item => item.interest_id !== optimisticInterestId));
            }
            if (action === 'like') {
              setLocalSentLikes(prev => prev.filter(item => item.property.id !== top.id));
            }
            console.warn('Swipe API failed', err);
          });
      }

      setProperties(prev => {
        if (prev.length === 0) return prev;
        if (prev[0].id === top.id) return prev.slice(1);
        return prev.filter(item => item.id !== top.id);
      });
    },
    [currentUser?.id, properties],
  );

  useEffect(() => {
    setOptimisticSentLikes([]);
    setLocalSentLikes([]);
    setLikesRefreshNonce(0);
    setDemoReceivedLikes([]);
    setDemoChatOpenThreadId(null);
    setDismissedListingIds([]);
  }, [currentUser?.id]);

  useEffect(() => {
    // Always reset super likes on every new run / user change
    setSuperLikesSentToday([]);
    if (currentUser?.id) {
      void AsyncStorage.removeItem(`superlike_today_${currentUser.id}`).catch(() => {});
    }
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!currentUser || currentUser.role !== 'seeker' || !USE_API_FEED) return;
    if (authScreen !== 'dashboard') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchFeed(currentUser.id, 0, feedFilters);
        if (!cancelled) {
          const nextProperties = applyPropertyFilters(
            r.items
              .map(mapFeedListingToProperty)
              .filter(item => !dismissedListingIdsRef.current.includes(item.id)),
            feedFilters,
          );
          setProperties(nextProperties);
        }
      } catch (e) {
        console.warn('Feed load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.role, feedFilters, authScreen]);

  React.useEffect(() => {
    if (!USE_API_FEED || !currentUser || authScreen !== 'dashboard') return;
    if (currentUser.role !== 'owner') {
      setSuperLikeInboxCount(0);
      return;
    }
    let cancelled = false;
    void fetchSuperLikesReceived(currentUser.id)
      .then(res => {
        if (cancelled) return;
        setSuperLikeInboxCount(res.items.length);
        if (res.items.length > 0 && !superLikeInAppAlertShownRef.current) {
          superLikeInAppAlertShownRef.current = true;
          Alert.alert(
            'Super Like',
            `You have ${res.items.length} new Super Like(s). See the top of the Likes tab.`,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setSuperLikeInboxCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.role, authScreen]);

  const completeAuthenticatedEntry = useCallback(
    async (user: AuthUser, resetDecks = true) => {
      const nextMode: AppMode = user.role === 'seeker' ? 'seeker' : 'host';
      selectedRoleRef.current = user.role;
      setCurrentUser(user);
      const key = profileOnboardingKey(user.id, user.role === 'seeker' ? 'seeker' : 'owner');
      const done = await AsyncStorage.getItem(key);

      let shouldShowOnboarding = done !== '1';

      if (user.role === 'seeker' && USE_API_FEED) {
        try {
          await ensureProfileRecord(user);
          const me = await fetchProfileMe(user.id);
          shouldShowOnboarding = !hasCompletedSeekerPreferences(me);
          if (!shouldShowOnboarding) {
            await AsyncStorage.setItem(key, '1');
          }
        } catch (error) {
          console.warn('Could not verify seeker preference completion, falling back to local state', error);
        }
      }

      if (!shouldShowOnboarding) {
        setAuthScreen('dashboard');
        if (resetDecks) {
          resetDashboardState(nextMode);
        } else {
          resetChatState(nextMode);
        }
      } else {
        setProfileOnboardingEntry('required');
        setAuthScreen('profile-onboarding');
      }
    },
    [resetChatState, resetDashboardState],
  );

  useEffect(() => {
    let isMounted = true;

    const handleSignedOut = () => {
      if (!isMounted) {
        return;
      }

      setCurrentUser(null);
      setProfileOnboardingEntry('required');
      setAuthScreen('house-rules');
      setActiveTab('explore');
      setDetailPropertyVisible(false);
      setDetailSeekerVisible(false);
      setDismissedListingIds([]);
      setChatThreads([]);
      setSelectedChatId('');
      setDraftMessage('');
    };

    const restoreSession = async () => {
      if (!supabase) {
        if (isMounted) {
          setIsAuthReady(true);
        }
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        if (data.session?.user) {
          await completeAuthenticatedEntry(
            mapSupabaseUser(data.session.user, selectedRoleRef.current),
            false,
          );
        } else {
          handleSignedOut();
        }
      } catch (error) {
        console.warn('Failed to restore auth session', error);
        handleSignedOut();
      } finally {
        if (isMounted) {
          setIsAuthReady(true);
        }
      }
    };

    restoreSession();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (session?.user) {
        void completeAuthenticatedEntry(
          mapSupabaseUser(session.user, selectedRoleRef.current),
          false,
        );
      } else {
        handleSignedOut();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [completeAuthenticatedEntry]);

  useEffect(() => {
    // Keep splash up for at least a beat after auth check finishes
    if (isAuthReady) {
      const timer = setTimeout(() => setShowSplash(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isAuthReady]);

  useEffect(() => {
    if (!currentUser) {
      bootstrappedProfileUserIdRef.current = null;
      superLikeInAppAlertShownRef.current = false;
      return;
    }

    if (bootstrappedProfileUserIdRef.current === currentUser.id) {
      return;
    }

    bootstrappedProfileUserIdRef.current = currentUser.id;

    ensureProfileRecord(currentUser).catch((error) => {
      console.warn('Failed to ensure app profile record', error);
    });
  }, [currentUser]);

  useEffect(() => {
    if (authScreen !== 'guest-dashboard' || DEMO_DISABLE_GUEST_BARRIER) return;
    if (activeTab === 'likes' || activeTab === 'chat') {
      setActiveTab('explore');
    }
  }, [authScreen, activeTab]);

  const showPropertyDetail = (property: Property) => {
    setDetailProperty(property);
    setDetailPropertyVisible(true);
  };

  const hidePropertyDetail = () => {
    setDetailPropertyVisible(false);
  };

  const showSeekerDetail = (card: SeekerCard) => {
    setDetailSeeker(card);
    setDetailSeekerVisible(true);
  };

  const hideSeekerDetail = () => {
    setDetailSeekerVisible(false);
  };

  // ─── Auth handlers ───────────────────────────────────────────────────────
  const handleSelectRole = (role: 'seeker' | 'owner') => {
    selectedRoleRef.current = role;
    const nextMode: AppMode = role === 'seeker' ? 'seeker' : 'host';
    resetDashboardState(nextMode);
    setGuestDeckNonce(n => n + 1);
    setAuthScreen('guest-dashboard');
  };

  const handleAuthenticated = (user: AuthUser) => {
    void completeAuthenticatedEntry(user);
  };

  const handleProfileOnboardingFinished = useCallback(() => {
    setAuthScreen('dashboard');
    if (!currentUser) {
      return;
    }
    if (profileOnboardingEntry === 'edit') {
      setActiveTab('profile');
      return;
    }
    const nextMode: AppMode = currentUser.role === 'seeker' ? 'seeker' : 'host';
    resetDashboardState(nextMode);
  }, [currentUser, profileOnboardingEntry, resetDashboardState]);

  const handleOpenPreferenceSetup = useCallback(() => {
    setProfileOnboardingEntry('edit');
    setAuthScreen('profile-onboarding');
  }, []);

  const handleBackToRoleSelect = () => {
    setAuthScreen('house-rules');
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOutUser();
    } catch (error) {
      Alert.alert(
        'Logout failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Dashboard-derived flags + callbacks MUST run every render (before any return) — Rules of Hooks.
  const isGuest = authScreen === 'guest-dashboard';
  /** Guest auth/tab/swipe restrictions (see `DEMO_DISABLE_GUEST_BARRIER`). */
  const guestBarrierActive = isGuest && !DEMO_DISABLE_GUEST_BARRIER;
  const mode: AppMode = isGuest
    ? selectedRoleRef.current === 'seeker'
      ? 'seeker'
      : 'host'
    : currentUser
      ? currentUser.role === 'seeker'
        ? 'seeker'
        : 'host'
      : 'seeker';

  const promptGuestAuth = useCallback(() => {
    Alert.alert(
      'Sign up or log in',
      'Create an account to swipe, use Likes and Chat, and save anything to your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log in / Sign up',
          onPress: () =>
            setAuthScreen(selectedRoleRef.current === 'seeker' ? 'seeker-auth' : 'owner-auth'),
        },
      ],
    );
  }, []);

  const handleSwipedLeft = useCallback(() => {
    if (guestBarrierActive) {
      promptGuestAuth();
      return;
    }
    if (mode === 'seeker') finalizeSeekerSwipe('pass');
    else setSeekers(s => s.slice(1));
  }, [guestBarrierActive, mode, finalizeSeekerSwipe, promptGuestAuth]);

  const handleSwipedRight = useCallback(() => {
    if (guestBarrierActive) {
      promptGuestAuth();
      return;
    }
    if (mode === 'seeker') finalizeSeekerSwipe('like');
    else setSeekers(s => s.slice(1));
  }, [guestBarrierActive, mode, finalizeSeekerSwipe, promptGuestAuth]);

  const handleFeedBack = useCallback(async () => {
    if (isGuest || !USE_API_FEED || !currentUser?.id || mode !== 'seeker') return;
    try {
      const { listing } = await popFeedStack(currentUser.id);
      if (listing) {
        const restored = mapFeedListingToProperty(listing);
        setDismissedListingIds(prev => prev.filter(id => id !== restored.id));
        setProperties(prev =>
          applyPropertyFilters(
            [restored, ...prev.filter(item => item.id !== restored.id)],
            feedFilters,
          ),
        );
      }
    } catch {
      Alert.alert('Back', 'Could not load the previous card.');
    }
  }, [isGuest, currentUser?.id, mode, feedFilters]);

  // ─── Auth screens ────────────────────────────────────────────────────────
  if (showSplash) {
    return <GestureHandlerRootView style={{ flex: 1 }}><SplashScreen /></GestureHandlerRootView>;
  }

  if (!isAuthReady) {
    return <GestureHandlerRootView style={{ flex: 1 }}><LoadingScreen label="Checking your session..." /></GestureHandlerRootView>;
  }

  if (authScreen === 'house-rules') {
    return <GestureHandlerRootView style={{ flex: 1 }}><HouseRulesScreen onAgree={() => setAuthScreen('role-select')} /></GestureHandlerRootView>;
  }

  if (authScreen === 'role-select') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RoleSelectionScreen 
          onNext={handleSelectRole}
          onBack={() => setAuthScreen('house-rules')}
        />
      </GestureHandlerRootView>
    );
  }

  if (authScreen === 'seeker-auth') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SeekerAuthScreen
          onAuthenticated={handleAuthenticated}
          onBack={handleBackToRoleSelect}
        />
      </GestureHandlerRootView>
    );
  }

  if (authScreen === 'owner-auth') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <OwnerAuthScreen
          onAuthenticated={handleAuthenticated}
          onBack={handleBackToRoleSelect}
        />
      </GestureHandlerRootView>
    );
  }

  if (authScreen === 'profile-onboarding' && currentUser) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ProfileOnboardingFlow
          user={currentUser}
          mode={profileOnboardingEntry}
          onBack={profileOnboardingEntry === 'edit' ? () => {
            setAuthScreen('dashboard');
            setActiveTab('profile');
          } : undefined}
          onFinished={handleProfileOnboardingFinished}
        />
      </GestureHandlerRootView>
    );
  }

  // ─── Dashboard (logged-in or guest preview) ──────────────────────────────
  if (!currentUser && authScreen !== 'guest-dashboard') {
    return <GestureHandlerRootView style={{ flex: 1 }}><LoadingScreen label="Loading your account..." /></GestureHandlerRootView>;
  }

  const currentDeck = mode === 'seeker' ? properties : seekers;
  const likeSections = createLikesSections(mode, localSentLikes);

  const trySetActiveTab = (t: DashboardTab) => {
    if (guestBarrierActive && (t === 'likes' || t === 'chat')) {
      promptGuestAuth();
      return;
    }
    setActiveTab(t);
  };

  const handleButtonSwipe = (direction: 'left' | 'right') => {
    if (guestBarrierActive) {
      promptGuestAuth();
      return;
    }
    if (topCardRef.current) {
      topCardRef.current.triggerSwipe(direction);
    } else if (direction === 'left') {
      handleSwipedLeft();
    } else {
      handleSwipedRight();
    }
  };

  const visibleCards = currentDeck.slice(0, 4);

  const handleSelectThread = (threadId: string) => {
    setSelectedChatId(threadId);
    setChatThreads(prevThreads =>
      prevThreads.map(thread =>
        thread.id === threadId
          ? { ...thread, unreadCount: 0 }
          : thread
      )
    );
  };

  const handleSendMessage = () => {
    const trimmed = draftMessage.trim();
    const activeChatId = demoChatOpenThreadId ?? selectedChatId;

    if (!trimmed || !activeChatId) {
      return;
    }

    const userMsgId = `${activeChatId}-${Date.now()}`;
    setChatThreads(prevThreads =>
      prevThreads.map(thread =>
        thread.id === activeChatId
          ? {
            ...thread,
            status: 'Just now',
            messages: [
              ...thread.messages,
              {
                id: userMsgId,
                sender: 'self',
                text: trimmed,
                timestamp: 'Now',
              },
            ],
          }
          : thread
      )
    );
    setDraftMessage('');

    // AI reply for demo chat threads
    const activeThread = chatThreads.find(t => t.id === activeChatId);
    if (activeThread?.isAiChat && activeThread.systemPrompt) {
      const history = [
        ...activeThread.messages.map(m => ({
          role: (m.sender === 'self' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        })),
        { role: 'user' as const, content: trimmed },
      ];
      void callOpenRouter(activeThread.systemPrompt, history).then(reply => {
        if (!reply) return;
        setChatThreads(prev =>
          prev.map(t =>
            t.id === activeChatId
              ? {
                  ...t,
                  messages: [
                    ...t.messages,
                    {
                      id: `${activeChatId}-ai-${Date.now()}`,
                      sender: 'other' as const,
                      text: reply,
                      timestamp: 'Now',
                    },
                  ],
                }
              : t,
          ),
        );
      });
    }
  };

  const exploreTabContent = (
    <>
      {!isGuest && USE_API_FEED && mode === 'seeker' && (
        <TouchableOpacity
          style={styles.filterFab}
          onPress={() => setFilterOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="options-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      )}
      <View style={styles.deckContainer} pointerEvents="box-none" key={`guest-deck-${guestDeckNonce}`}>
        {currentDeck.length === 0 ? (
          <EmptyState mode={mode} filtersApplied={mode === 'seeker' && Object.keys(feedFilters).length > 0} />
        ) : (
          [...visibleCards].reverse().map((item, reversedIndex) => {
            const index = visibleCards.length - 1 - reversedIndex;
            const isTopCard = index === 0;
            const key = mode === 'seeker'
              ? (item as Property).id
              : (item as SeekerCard).user.id;
            return (
              <SwipeCard
                key={key}
                ref={isTopCard ? topCardRef : undefined}
                index={index}
                allowSwipeCommit={guestBarrierActive ? () => false : undefined}
                onSwipeDenied={guestBarrierActive ? promptGuestAuth : undefined}
                onSwipedLeft={handleSwipedLeft}
                onSwipedRight={handleSwipedRight}
              >
                {mode === 'seeker'
                  ? <PropertyCardContent
                    property={item as Property}
                    isDeckTop={isTopCard}
                    onShowDetail={
                      isTopCard ? () => showPropertyDetail(item as Property) : undefined
                    }
                    onNope={isTopCard ? () => handleButtonSwipe('left') : undefined}
                    onLike={
                      isTopCard
                        ? USE_API_FEED && !isGuest
                          ? () => {
                              setLikeCommentDraft('');
                              setLikeCommentOpen(true);
                            }
                          : () => handleButtonSwipe('right')
                        : undefined
                    }
                    onSuperLike={
                      isTopCard
                        ? guestBarrierActive
                          ? () => promptGuestAuth()
                          : () => {
                              superLikeListingIdRef.current = (item as Property).id;
                              setSuperLikeDraft('');
                              setSuperLikeOpen(true);
                            }
                        : undefined
                    }
                  />
                  : <SeekerCardContent
                    card={item as SeekerCard}
                    isDeckTop={isTopCard}
                    onShowDetail={
                      isTopCard ? () => showSeekerDetail(item as SeekerCard) : undefined
                    }
                    onNope={isTopCard ? () => handleButtonSwipe('left') : undefined}
                    onLike={isTopCard ? () => handleButtonSwipe('right') : undefined}
                  />}
              </SwipeCard>
            );
          })
        )}
      </View>
    </>
  );

  const likesTabContent =
    !isGuest && currentUser && USE_API_FEED ? (
      <LikesFromApi
        userId={currentUser.id}
        role={mode === 'seeker' ? 'seeker' : 'host'}
        optimisticSentItems={mode === 'seeker' ? optimisticSentLikes : []}
        optimisticSuperLikeItems={mode === 'seeker' ? superLikesSentToday : []}
        optimisticReceivedItems={mode === 'seeker' ? demoReceivedLikes : []}
        refreshToken={likesRefreshNonce}
        onRemoveDemoReceivedLike={(listingId: string) => {
          setDemoReceivedLikes(prev => prev.filter(r => r.listing_id !== listingId));
        }}
        onOpenChat={cid => {
          if (cid.startsWith('demo:')) {
            const listingId = cid.slice(5);
            // Find the listing to build context
            const property = MOCK_PROPERTIES.find(p => p.id === listingId);
            const mockIndex = MOCK_PROPERTIES.findIndex(p => p.id === listingId);
            const hostName = mockIndex >= 0 && HOST_CONTACTS[mockIndex] ? HOST_CONTACTS[mockIndex] : 'Host';
            const chatId = `demo-chat-${listingId}`;

            // Build AI system prompt with listing context
            const systemPrompt = property
              ? `You are ${hostName}, a college student subletting your apartment "${property.apartmentName}" at ${property.address}. ` +
                `The rent is $${property.subletPrice}/mo, ${property.roomType}, ${property.furnished ? 'furnished' : 'unfurnished'}, ` +
                `available ${property.availableStartDate} to ${property.availableEndDate}. ` +
                `You are chatting with a potential subletter who liked your listing. ` +
                `Be friendly, casual, brief (1-2 sentences max), and realistic like a real college student. Stay in character. ` +
                `Ask about their move-in plans, answer questions about the place, or share relevant details.`
              : `You are ${hostName}, a college student subletting your apartment. Be friendly, casual, brief (1-2 sentences), and realistic.`;

            // Create a fresh chat thread (avoid duplicates)
            setChatThreads(prev => {
              if (prev.some(t => t.id === chatId)) return prev;
              const newThread: ChatThread = {
                id: chatId,
                title: property?.apartmentName ?? 'Chat',
                subtitle: `Host · ${hostName}`,
                avatarUrl: property?.imageUrls[0] ?? '',
                detail: property ? `$${property.subletPrice}/mo · ${property.roomType}` : '',
                status: 'Just now',
                unreadCount: 0,
                messages: [],
                isAiChat: true,
                systemPrompt,
              };
              return [newThread, ...prev];
            });

            setSelectedChatId(chatId);
            setDemoChatOpenThreadId(chatId);

            // AI sends the first message
            void callOpenRouter(systemPrompt, []).then(reply => {
              const aiText = reply || `Hey! Thanks for liking my place. When are you looking to move in?`;
              setChatThreads(prev =>
                prev.map(t =>
                  t.id === chatId
                    ? {
                        ...t,
                        unreadCount: 1,
                        messages: [
                          ...t.messages,
                          {
                            id: `${chatId}-ai-${Date.now()}`,
                            sender: 'other' as const,
                            text: aiText,
                            timestamp: 'Now',
                          },
                        ],
                      }
                    : t,
                ),
              );
            });
          } else {
            setApiChatFocusId(cid);
          }
          setActiveTab('chat');
        }}
      />
    ) : (
      <LikesTabContent sections={likeSections} onChatNavigate={() => trySetActiveTab('chat')} />
    );

  // Demo AI threads (created when user accepts a like)
  const aiChatThreads = chatThreads.filter(t => t.isAiChat);
  const hasDemoChats = aiChatThreads.length > 0;

  const chatTabContent = hasDemoChats || demoChatOpenThreadId ? (
    // Show demo AI threads — always use ChatTabContent so accepted chats persist
    <ChatTabContent
      threads={aiChatThreads}
      selectedChatId={demoChatOpenThreadId ?? selectedChatId}
      draftMessage={draftMessage}
      onSelectThread={handleSelectThread}
      onChangeDraft={setDraftMessage}
      onSendMessage={handleSendMessage}
      forceOpenThreadId={demoChatOpenThreadId}
      onExitDemoChat={() => setDemoChatOpenThreadId(null)}
      onShowListingDetail={(property) => {
        setDetailProperty(property);
        setDetailPropertyVisible(true);
      }}
    />
  ) : !isGuest && currentUser && USE_API_FEED ? (
    <ChatTabFromApi
      userId={currentUser.id}
      focusConversationId={apiChatFocusId}
      onConsumedFocusConversation={clearApiChatFocus}
    />
  ) : (
    <ChatTabContent
      threads={chatThreads}
      selectedChatId={selectedChatId}
      draftMessage={draftMessage}
      onSelectThread={handleSelectThread}
      onChangeDraft={setDraftMessage}
      onSendMessage={handleSendMessage}
    />
  );

  const profileTabContent = isGuest ? (
    <GuestProfileTabContent
      onLogInSignUp={() =>
        setAuthScreen(selectedRoleRef.current === 'seeker' ? 'seeker-auth' : 'owner-auth')
      }
    />
  ) : currentUser ? (
    <ProfileTabWithApi
      authUser={currentUser}
      apiEnabled={USE_API_FEED}
      syncProfileFromAuth={async () => {
        await ensureProfileRecord(currentUser);
      }}
      onEditPreferences={handleOpenPreferenceSetup}
      onSignOut={() => void handleLogout()}
      isLoggingOut={isLoggingOut}
      demoCounts={{
        likes: localSentLikes.length,
        chats: aiChatThreads.length,
        history: demoReceivedLikes.length,
      }}
    />
  ) : (
    <TabPlaceholder
      title="Profile"
      subtitle="Manage your account and preferences."
      icon="person-circle-outline"
    />
  );

  const tabs: Array<{ key: DashboardTab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'explore', label: 'Explore', icon: 'compass-outline', activeIcon: 'compass' },
    { key: 'likes', label: 'Likes', icon: 'heart-outline', activeIcon: 'heart' },
    { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
    { key: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.container}>
        <DashboardHeader
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          showBack={false}
          onBack={handleFeedBack}
          isGuest={isGuest}
          onGuestBack={() => setAuthScreen('role-select')}
        />

        <View style={styles.sceneHost}>
        <AnimatedTabScene tabKey="explore" activeTab={activeTab}>
          {exploreTabContent}
        </AnimatedTabScene>
        <AnimatedTabScene tabKey="likes" activeTab={activeTab}>
          {likesTabContent}
        </AnimatedTabScene>
        <AnimatedTabScene tabKey="chat" activeTab={activeTab}>
          {chatTabContent}
        </AnimatedTabScene>
        <AnimatedTabScene tabKey="profile" activeTab={activeTab}>
          {profileTabContent}
        </AnimatedTabScene>
        </View>

        <View style={styles.tabBar}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const guestLockedTab = guestBarrierActive && (tab.key === 'likes' || tab.key === 'chat');
            const showActiveIcon = isActive && !guestLockedTab;
            const iconColor = guestLockedTab
              ? '#555'
              : isActive
                ? COLORS.primary
                : '#A0A0A0';
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBarItem, guestLockedTab && styles.tabBarItemGuestLocked]}
                activeOpacity={0.8}
                onPress={() => trySetActiveTab(tab.key)}
              >
                <View style={styles.tabBarIconWrap}>
                  <Ionicons
                    name={showActiveIcon ? tab.activeIcon : tab.icon}
                    size={22}
                    color={iconColor}
                  />
                  {tab.key === 'likes' && superLikeInboxCount > 0 && !isGuest ? (
                    <View style={styles.tabBadgeDot} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.tabBarLabel,
                    showActiveIcon && styles.tabBarLabelActive,
                    guestLockedTab && styles.tabBarLabelGuestLocked,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Modal visible={superLikeOpen} transparent animationType="fade" onRequestClose={() => setSuperLikeOpen(false)}>
        <View style={styles.superLikeOverlay}>
          <View style={styles.superLikeSheet}>
            <View style={styles.superLikeTitleRow}>
              <Ionicons name="star" size={20} color="#FFD54F" />
              <Text style={styles.superLikeTitle}>Super Like</Text>
              <View style={styles.superLikeRemainingPill}>
                <Text style={styles.superLikeRemainingText}>
                  {Math.max(0, SUPER_LIKE_DAILY_LIMIT - superLikesSentToday.length)}/{SUPER_LIKE_DAILY_LIMIT} today
                </Text>
              </View>
            </View>
            <Text style={styles.superLikeHint}>
              Add a personal note — it goes straight to the top of the host's inbox.
            </Text>
            <TextInput
              value={superLikeDraft}
              onChangeText={t => setSuperLikeDraft(t.length > 500 ? t.slice(0, 500) : t)}
              placeholder="Your message (1–500 characters)"
              placeholderTextColor="#888"
              multiline
              style={styles.superLikeInput}
            />
            <Text style={styles.superLikeCharCount}>{superLikeDraft.trim().length}/500</Text>
            <View style={styles.superLikeActions}>
              <TouchableOpacity style={styles.superLikeCancel} onPress={() => setSuperLikeOpen(false)}>
                <Text style={styles.superLikeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.superLikeSend,
                  superLikesSentToday.length >= SUPER_LIKE_DAILY_LIMIT && styles.superLikeSendDisabled,
                ]}
                onPress={async () => {
                  const text = superLikeDraft.trim();
                  const lid = superLikeListingIdRef.current;
                  if (superLikesSentToday.length >= SUPER_LIKE_DAILY_LIMIT) {
                    Alert.alert('Super Like', `You've used all ${SUPER_LIKE_DAILY_LIMIT} Super Likes for today. They reset at UTC midnight.`);
                    return;
                  }
                  if (!text) {
                    Alert.alert('Super Like', 'Please enter a message.');
                    return;
                  }
                  if (!lid) {
                    Alert.alert('Super Like', 'Please enter a message.');
                    return;
                  }
                  const isDemo = !isUuidLike(lid);
                  setSuperLikeOpen(false);

                  const topCard = properties.find(p => p.id === lid);
                  const newItem: SuperLikeItemDto = {
                    super_like_id: `optimistic-${Date.now()}`,
                    listing_id: lid,
                    title: topCard?.apartmentName ?? '',
                    address: topCard?.address ?? '',
                    price_monthly: topCard?.subletPrice ?? 0,
                    body: text,
                    counterparty_name: 'Host',
                    created_at: new Date().toISOString(),
                  };

                  if (isDemo || !USE_API_FEED || !currentUser?.id) {
                    // Demo mode: skip API, apply optimistic update immediately
                    const updated = [...superLikesSentToday, newItem];
                    setSuperLikesSentToday(updated);
                    void AsyncStorage.setItem(
                      `superlike_today_${currentUser?.id ?? 'demo'}`,
                      JSON.stringify({ date: todayUtcDate(), items: updated }),
                    );
                    setProperties(prev =>
                      prev.length === 0 ? prev : prev[0].id === lid ? prev.slice(1) : prev.filter(p => p.id !== lid),
                    );
                    return;
                  }

                  try {
                    const r = await postSuperLike({ user_id: currentUser.id, listing_id: lid, body: text });
                    if (!r.ok) {
                      Alert.alert('Super Like', r.message || 'Could not send. Please try again.');
                      return;
                    }
                    // Optimistic: add to today's list and persist
                    const updated = [...superLikesSentToday, newItem];
                    setSuperLikesSentToday(updated);
                    void AsyncStorage.setItem(
                      `superlike_today_${currentUser.id}`,
                      JSON.stringify({ date: todayUtcDate(), items: updated }),
                    );
                    // Advance the deck (remove the super-liked card)
                    setProperties(prev =>
                      prev.length === 0 ? prev : prev[0].id === lid ? prev.slice(1) : prev.filter(p => p.id !== lid),
                    );
                    setLikesRefreshNonce(n => n + 1);
                  } catch (e) {
                    Alert.alert('Super Like', e instanceof Error ? e.message : 'Failed. Please try again.');
                  }
                }}
              >
                <Text style={styles.superLikeSendText}>Send ★</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={likeCommentOpen} transparent animationType="fade" onRequestClose={() => setLikeCommentOpen(false)}>
        <View style={styles.superLikeOverlay}>
          <View style={styles.superLikeSheet}>
            <Text style={styles.superLikeTitle}>Send like</Text>
            <Text style={styles.superLikeHint}>Optional note up to 50 characters, or leave blank.</Text>
            <TextInput
              value={likeCommentDraft}
              onChangeText={t => setLikeCommentDraft(t.length > 50 ? t.slice(0, 50) : t)}
              placeholder="Message (optional)"
              placeholderTextColor="#888"
              multiline
              style={styles.superLikeInput}
            />
            <View style={styles.superLikeActions}>
              <TouchableOpacity style={styles.superLikeCancel} onPress={() => setLikeCommentOpen(false)}>
                <Text style={styles.superLikeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.superLikeSend}
                onPress={() => {
                  const top = properties[0];
                  if (!top || !currentUser?.id) {
                    setLikeCommentOpen(false);
                    return;
                  }
                  const msg = likeCommentDraft.trim();
                  finalizeSeekerSwipe('like', msg || null);
                  setLikeCommentOpen(false);
                }}
              >
                <Text style={styles.superLikeSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.filterModalRoot} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.filterSheet} onPress={e => e.stopPropagation()}>
                <View style={styles.filterDragHandle} />
                <View style={styles.filterHeaderRow}>
                  <View style={styles.filterHeaderCopy}>
                    <Text style={styles.filterTitle}>Filters</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.filterCloseBtn}
                    onPress={() => setFilterOpen(false)}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="close" size={20} color="#222" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.filterScroll}
                  contentContainerStyle={styles.filterScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>Sort by</Text>
                    <View style={styles.filterChipWrap}>
                      {FILTER_SORT_OPTIONS.map(option => (
                        <FilterChip
                          key={option.value}
                          label={option.label}
                          selected={filterDraft.sort === option.value}
                          onPress={() => handleSelectSort(option.value)}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>Price range</Text>
                    <View style={styles.filterPriceSummaryRow}>
                      <View style={styles.filterPricePill}>
                        <Text style={styles.filterPricePillLabel}>Min</Text>
                        <Text style={styles.filterPricePillValue}>{formatFilterCurrency(normalizedFilterPrice.min)}</Text>
                      </View>
                      <View style={styles.filterPriceDivider} />
                      <View style={styles.filterPricePill}>
                        <Text style={styles.filterPricePillLabel}>Max</Text>
                        <Text style={styles.filterPricePillValue}>{formatFilterCurrency(normalizedFilterPrice.max)}</Text>
                      </View>
                    </View>
                    <FilterPriceRangeSlider
                      minValue={normalizedFilterPrice.min}
                      maxValue={normalizedFilterPrice.max}
                      onChange={handleFilterPriceChange}
                    />
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>Neighborhood</Text>
                    <View style={styles.filterChipWrap}>
                      {FILTER_NEIGHBORHOOD_OPTIONS.map(option => (
                        <FilterChip
                          key={option}
                          label={option}
                          selected={filterDraft.neighborhood.trim().toLowerCase() === option.toLowerCase()}
                          onPress={() => handleSelectNeighborhood(option)}
                        />
                      ))}
                    </View>
                    <TextInput
                      style={styles.filterField}
                      value={filterDraft.neighborhood}
                      onChangeText={t => setFilterDraft(d => ({ ...d, neighborhood: t }))}
                      placeholder="Search neighborhood or address"
                      placeholderTextColor="#A0A0A0"
                    />
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>Amenities</Text>
                    <View style={styles.filterChipWrap}>
                      {FILTER_AMENITY_OPTIONS.map(option => (
                        <FilterChip
                          key={option}
                          label={option}
                          selected={selectedAmenities.includes(option)}
                          onPress={() => handleToggleAmenity(option)}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionTitle}>Distance from campus</Text>
                    <View style={styles.filterChipWrap}>
                      {FILTER_DISTANCE_OPTIONS.map(option => (
                        <FilterChip
                          key={option.label}
                          label={option.label}
                          selected={filterDraft.max_distance_miles === option.value}
                          onPress={() => handleSelectDistance(option.value)}
                        />
                      ))}
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.filterFooterRow}>
                  <TouchableOpacity style={styles.filterSecondaryBtn} onPress={handleResetFilters} activeOpacity={0.82}>
                    <Text style={styles.filterSecondaryBtnText}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterPrimaryBtn} onPress={handleApplyFilters} activeOpacity={0.82}>
                    <Text style={styles.filterPrimaryBtnText}>Apply filters</Text>
                  </TouchableOpacity>
                </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Property Detail Modal */}
      <PropertyDetailModal
        property={detailProperty}
        visible={detailPropertyVisible}
        onClose={hidePropertyDetail}
      />

      {/* Seeker Detail Modal */}
      <SeekerDetailModal
        card={detailSeeker}
        visible={detailSeekerVisible}
        onClose={hideSeekerDetail}
      />
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sceneHost: {
    flex: 1,
  },
  sceneFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneHidden: {
    opacity: 0,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingScreenDim: {
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
  },
  loadingTextOnDim: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Header (just logout button, overlaid on the card)
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 8 : 54,
    paddingBottom: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Deck
  deckContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card — full width, starts from top, rounded only at bottom
  card: {
    position: 'absolute',
    top: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    left: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  cardInner: { flex: 1 },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },

  // Progress bars (Tinder-style)
  progressBarContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 16 : 66,
    alignSelf: 'center',
    width: '35%',
    flexDirection: 'row',
    gap: 2,
    zIndex: 20,
  },
  // Tap zones for image navigation — stop above deck controls so detail + actions stay tappable
  tapZoneLeft: {
    position: 'absolute',
    top: 0,
    bottom: 160,
    left: 0,
    width: '45%',
    zIndex: 20,
  },
  tapZoneRight: {
    position: 'absolute',
    top: 0,
    bottom: 160,
    right: 0,
    width: '45%',
    zIndex: 20,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },

  topGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
    zIndex: 10,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CARD_HEIGHT * 0.35,
  },
  cardInfo: {
    position: 'absolute',
    bottom: 110,
    left: 0,
    right: 72,
    paddingHorizontal: 20,
    gap: 8,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  apartmentName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  address: {
    fontSize: 14,
    color: '#444444',
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 8,
  },
  originalPrice: {
    fontSize: 16,
    color: '#444',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  subletPrice: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FF3B30',
    marginTop: 4,
  },
  saveBadge: {
    backgroundColor: 'rgba(74,222,128,0.25)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.6)',
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4ADE80',
    letterSpacing: 0.3,
  },
  utilityText: {
    fontSize: 12,
    color: '#666666',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  dateText: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },

  // Gender tag
  genderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#D6D6D6',
  },
  genderTagText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // More information — own layer above deck actions (zIndex 40) and gradients
  detailBtnLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
    zIndex: 100,
    elevation: 24,
  },
  detailBtn: {
    position: 'absolute',
    bottom: 115,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 24,
    opacity: 1,
  },

  // Stamps
  stamp: {
    position: 'absolute',
    top: '25%',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 4,
  },
  stampLike: {
    left: 24,
    borderColor: COLORS.success,
    backgroundColor: 'rgba(0,200,83,0.1)',
    transform: [{ rotate: '-20deg' }],
  },
  stampNope: {
    right: 24,
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(255,23,68,0.1)',
    transform: [{ rotate: '20deg' }],
  },
  stampText: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 3,
  },

  // Action buttons — inside the card, at the bottom
  actions: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  actionBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
  },
  actionNope: {
    borderColor: 'rgba(255,23,68,0.5)',
  },
  actionLike: {
    borderColor: 'rgba(0,200,83,0.5)',
  },
  actionSuper: {
    borderColor: 'rgba(255,213,79,0.55)',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  actionSuperSpacer: {
    width: 64,
    height: 64,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  footerText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },

  // Bottom tab bar (floating island)
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 20 : 10,
    zIndex: 30,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
  },
  tabBarItemGuestLocked: {
    opacity: 0.55,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: -0.1,
  },
  tabBarLabelActive: {
    color: COLORS.primary,
  },
  tabBarLabelGuestLocked: {
    color: '#666',
  },

  tabPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  tabPlaceholderIconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPlaceholderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#303030',
    letterSpacing: -0.3,
  },
  tabPlaceholderSubtitle: {
    fontSize: 14,
    color: '#8A8A8A',
    textAlign: 'center',
    lineHeight: 21,
  },

  utilityScroll: {
    flex: 1,
  },
  utilityScrollContent: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 72 : 118,
    paddingBottom: TAB_BAR_HEIGHT + 56,
    paddingHorizontal: 16,
    gap: 16,
  },
  utilityHeader: {
    gap: 10,
  },
  utilityHeaderBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,90,95,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,95,0.28)',
  },
  utilityHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD7D8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  utilityHeaderTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.8,
  },
  utilityHeaderSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#444',
    maxWidth: '92%',
  },
  notificationBellWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBellDot: {
    position: 'absolute',
    top: 4,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D60000',
  },

  likesSummaryCard: {
    borderRadius: 28,
    padding: 20,
    gap: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#FFFFFF',
  },
  likesSummaryTextWrap: {
    gap: 6,
  },
  likesSummaryEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD6D8',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  likesSummaryTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.5,
  },
  likesSummarySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
  },
  likesSummaryStats: {
    gap: 10,
  },
  likesSummaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#F2F2F2',
  },
  likesSummaryStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  likesSummaryStatLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'right',
    marginLeft: 16,
  },
  likesSectionCard: {
    backgroundColor: '#FFFFFF',
  },
  likesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  likesSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.3,
  },
  likesSectionCountBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,90,95,0.18)',
  },
  likesSectionCountText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  likesSectionList: {
    gap: 2,
  },
  likeItemRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  likeItemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  likeAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  likeItemBody: {
    flex: 1,
    gap: 3,
  },
  likeItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  likeItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  likeItemTime: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  likeItemHeadline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0F0F0',
    lineHeight: 20,
  },
  likeItemDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.62)',
  },
  likeItemSupportingText: {
    fontSize: 13,
    color: '#8A8A8A',
  },
  likeItemBadge: {
    maxWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#EAEAEA',
  },
  likeItemBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD7D8',
    textAlign: 'center',
  },
  likeItemActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  likeActionPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  likeActionDecline: {
    backgroundColor: '#F2F2F2',
  },
  likeActionAccept: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  likeActionPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  likeActionAcceptText: {
    color: '#000',
  },
  likeOpenChatBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,90,95,0.25)',
  },
  likeOpenChatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB4B6',
  },

  chatScreen: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 58 : 104,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    paddingTop: 8,
    paddingBottom: TAB_BAR_HEIGHT + 16,
  },
  chatEmptySearch: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 72,
    gap: 8,
  },
  chatEmptySearchTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  chatEmptySearchSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#888',
    textAlign: 'center',
  },
  chatAvatarFallback: {
    backgroundColor: '#CDCDCD',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chatThreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
  },
  chatThreadBody: {
    flex: 1,
    gap: 4,
  },
  chatThreadEyebrow: {
    fontSize: 13,
    color: '#8C8C8C',
    fontWeight: '500',
  },
  chatThreadHeadline: {
    fontSize: 15,
    fontWeight: '800',
    color: '#171717',
  },
  chatThreadPreview: {
    fontSize: 13,
    color: '#444',
  },
  chatThreadSide: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 4,
    width: 56,
  },
  chatThreadTime: {
    fontSize: 12,
    color: '#8A8A8A',
  },
  chatThreadUnreadBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D60000',
  },
  chatThreadUnreadText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  chatThreadUnreadSpacer: {
    width: 28,
    height: 28,
  },
  chatConversationTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 2,
    marginBottom: 14,
  },
  chatConversationBackPlain: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatConversationIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatConversationIdentityName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
  },
  chatConversationMoreBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatConversationListingCard: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ECECEC',
    marginBottom: 2,
  },
  chatConversationListingTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  chatConversationListingMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#8A8A8A',
  },
  chatConversationListingPrice: {
    marginTop: 3,
    fontSize: 16,
    color: '#5A5A5A',
  },
  chatConversationMessages: {
    flex: 1,
  },
  chatConversationMessagesContent: {
    paddingTop: 16,
    paddingBottom: 22,
    paddingHorizontal: 10,
    gap: 18,
  },
  chatConversationDate: {
    fontSize: 12,
    color: '#8A8A8A',
    textAlign: 'center',
    marginBottom: 2,
  },
  chatMessageSelfRow: {
    alignItems: 'flex-end',
  },
  chatMessageOtherRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  chatBubble: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: '100%',
  },
  chatBubbleSelf: {
    backgroundColor: '#D60000',
    borderBottomRightRadius: 8,
    maxWidth: '82%',
  },
  chatBubbleOther: {
    backgroundColor: '#EFEFEF',
    borderBottomLeftRadius: 8,
  },
  chatBubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#000000',
  },
  chatBubbleTextSelf: {
    color: '#FFFFFF',
  },
  chatComposerDock: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
  },
  chatComposerPill: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D8D8D8',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  chatComposerInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 0,
    color: '#000',
    fontSize: 15,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#444',
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Detail Modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalOverlayTouch: {
    flex: 1,
  },
  modalSheetAbsolute: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHandle: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalHandleBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D0D0D0',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  modalMapContainer: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 16,
  },
  modalMap: {
    width: '100%',
    height: '100%',
  },
  modalImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A2E',
    letterSpacing: -0.3,
  },
  modalAddress: {
    fontSize: 14,
    color: '#8A8A8A',
    marginTop: 4,
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  modalInfoItem: {
    width: (SCREEN_WIDTH - 40 - 24) / 3,
    backgroundColor: '#F8F8FA',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  modalInfoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  modalInfoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A2E',
    textAlign: 'center',
  },
  modalInfoValueHighlight: {
    fontSize: 16,
    fontWeight: '900',
    color: '#6C5CE7',
    textAlign: 'center',
    marginTop: 2,
  },
  modalInfoSub: {
    fontSize: 11,
    color: '#666',
  },
  modalInfoSubHighlight: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A7BEE',
    marginTop: 1,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 10,
  },
  modalRulesList: {
    gap: 8,
  },
  modalRuleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalRuleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF5A5F',
  },
  modalRuleText: {
    fontSize: 15,
    color: '#555',
    fontWeight: '500',
  },

  // Lifestyle tags (seeker detail)
  lifestyleTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lifestyleTag: {
    backgroundColor: '#F0EDFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  lifestyleTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6C5CE7',
  },

  filterFab: {
    position: 'absolute',
    right: 18,
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 52 : 98,
    zIndex: 55,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  filterDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  filterSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: SCREEN_HEIGHT * 0.88,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  filterHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  filterTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#171717',
    letterSpacing: -0.7,
  },
  filterSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#777',
  },
  filterCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F3F3',
  },
  filterScroll: {
    maxHeight: SCREEN_HEIGHT * 0.62,
  },
  filterScrollContent: {
    paddingBottom: 8,
    gap: 18,
  },
  filterSection: {
    gap: 12,
  },
  filterSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#232323',
  },
  filterPriceSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterPricePill: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#FAF3F3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  filterPricePillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterPricePillValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  filterPriceDivider: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#D9D9D9',
  },
  filterSliderWrap: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterSliderPressArea: {
    height: 38,
    justifyContent: 'center',
  },
  filterSliderTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E3E3E3',
  },
  filterSliderTrackSelected: {
    position: 'absolute',
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  filterSliderHandleHitbox: {
    position: 'absolute',
    top: 0,
    width: 32,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSliderHandle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F6F6',
    borderWidth: 1,
    borderColor: '#E4E4E4',
  },
  filterChipSelected: {
    backgroundColor: '#FFF1F1',
    borderColor: '#F26A6A',
  },
  filterChipPressed: {
    opacity: 0.78,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5A5A5A',
  },
  filterChipTextSelected: {
    color: '#B82020',
  },
  filterField: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111',
    fontSize: 15,
  },
  filterFooterRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  filterSecondaryBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DADADA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  filterSecondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
  },
  filterPrimaryBtn: {
    flex: 1.4,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  filterPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  likesSegmentRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 0,
  },
  likesSegmentBtn: {
    paddingBottom: 12,
    width: 170,
    alignItems: 'center',
  },
  likesSegmentBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#000',
  },
  likesSegmentLabel: {
    fontSize: 16,
    color: '#8A8A8A',
    fontWeight: '600',
    textAlign: 'center',
  },
  likesSegmentLabelActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  likesEmptyApi: {
    marginTop: 20,
    fontSize: 14,
    color: '#8A8A8A',
    textAlign: 'center',
  },
  profileShellContent: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 60 : 106,
    paddingBottom: TAB_BAR_HEIGHT + 54,
    paddingHorizontal: 28,
    gap: 20,
  },
  profileAvatarFallback: {
    backgroundColor: '#CFCFCF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileNoticeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F2D0D0',
    backgroundColor: '#FFF6F6',
    padding: 16,
    gap: 12,
  },
  profileNoticeText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6A3A3A',
  },
  profileNoticeBtn: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileNoticeBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  profileNoticeBtnSecondary: {
    borderWidth: 1,
    borderColor: '#D8D8D8',
    backgroundColor: '#FFFFFF',
  },
  profileNoticeBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileNoticeBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3A3A3A',
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  profileBackBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
  },
  profileScreenTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#151515',
    letterSpacing: -0.6,
  },
  profileSettingsBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 4,
  },
  profileIdentityCopy: {
    flex: 1,
    gap: 4,
  },
  profileIdentityName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#23252D',
    letterSpacing: -0.5,
  },
  profileIdentityEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2B2E36',
  },
  profileEditLinkBtn: {
    alignSelf: 'flex-start',
  },
  profileEditLinkText: {
    fontSize: 14,
    color: '#B7B0B0',
    textDecorationLine: 'underline',
  },
  profileBlockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#171717',
    marginTop: 10,
  },
  profileStatsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: 18,
    backgroundColor: '#FAF0F0',
  },
  profileStatCell: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  profileStatLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  profileStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  profileLinksBlock: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC',
    paddingTop: 22,
    gap: 8,
  },
  profileBottomLogoutBtn: {
    marginTop: 18,
    marginBottom: 8,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.24)',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBottomLogoutBtnDisabled: {
    opacity: 0.6,
  },
  profileBottomLogoutText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#E53935',
  },
  profileLinkRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLinkLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#20222B',
    letterSpacing: -0.3,
  },
  profileCurrencyPill: {
    minWidth: 82,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCurrencyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666670',
  },
  profileMenuSection: {
    gap: 8,
  },
  profileMenuRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileMenuLabel: {
    fontSize: 18,
    color: '#262932',
    letterSpacing: -0.3,
  },
  profileSupportBlock: {
    marginTop: 18,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC',
    gap: 8,
  },
  profileSupportTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#171717',
    marginBottom: 10,
  },
  profileAccountHero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 24,
    gap: 8,
  },
  profileAccountName: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '800',
    color: '#2A2D35',
  },
  profileAccountEmail: {
    fontSize: 15,
    color: '#2A2D35',
  },
  profileAccountJoined: {
    fontSize: 15,
    color: '#555A63',
  },
  profileAccountCard: {
    marginHorizontal: -28,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC',
    paddingTop: 6,
  },
  profileAccountRow: {
    minHeight: 66,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileAccountRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAccountRowText: {
    fontSize: 17,
    color: '#2A2D35',
  },
  profileDangerAction: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  profileDangerText: {
    fontSize: 17,
    color: '#E53935',
  },
  superLikeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  superLikeSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
  },
  superLikeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  superLikeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    flex: 1,
  },
  superLikeRemainingPill: {
    backgroundColor: '#FFF8E1',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FFD54F',
  },
  superLikeRemainingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B8860B',
  },
  superLikeHint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 2,
  },
  superLikeInput: {
    marginTop: 12,
    minHeight: 100,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    color: '#000',
    textAlignVertical: 'top',
    fontSize: 15,
  },
  superLikeCharCount: {
    fontSize: 11,
    color: '#ABABAB',
    textAlign: 'right',
    marginTop: 4,
  },
  superLikeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  superLikeCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  superLikeCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  superLikeSend: {
    backgroundColor: '#FFD54F',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  superLikeSendDisabled: {
    backgroundColor: '#E0E0E0',
  },
  superLikeSendText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },

  guestProfileCard: {
    borderRadius: 28,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#FFFFFF',
  },
  guestProfileAvatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: '#F2F2F2',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  guestProfileCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  guestProfilePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
  },
  guestProfilePrimaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  tabBarIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD54F',
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  superLikeHighlightBlock: {
    marginBottom: 16,
    gap: 10,
  },
  superLikeHighlightTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFD54F',
    letterSpacing: 0.5,
  },
  superLikeHighlightCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: '#FFD54F',
    backgroundColor: 'rgba(255,213,79,0.07)',
    shadowColor: '#FFD54F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  superLikeHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  superLikeHighlightListing: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  superLikeHighlightFrom: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  superLikeHighlightBody: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    lineHeight: 20,
  },
  superLikeHighlightMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 8,
  },
});
