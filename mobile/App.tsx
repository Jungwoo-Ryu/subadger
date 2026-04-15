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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

import {
  AppMode,
  Property,
  SeekerCard,
  MOCK_PROPERTIES,
  MOCK_SEEKER_CARDS,
} from './src/data';

import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import SeekerAuthScreen from './src/screens/SeekerAuthScreen';
import OwnerAuthScreen from './src/screens/OwnerAuthScreen';
import ProfileOnboardingFlow from './src/screens/ProfileOnboardingFlow';
import { profileOnboardingKey } from './src/storageKeys';
import { BuckyLoading } from './src/components/BuckyLoading';
import { FullscreenBuckyLoading } from './src/components/FullscreenBuckyLoading';
import { type AuthRole, type AuthUser, mapSupabaseUser, signOut as signOutUser } from './src/lib/auth';
import { ensureProfileRecord } from './src/lib/profile';
import { supabase } from './src/lib/supabase';
import {
  fetchChatMessages,
  fetchConversations,
  fetchFeed,
  fetchLikesReceived,
  fetchLikesSent,
  fetchProfileCompleteness,
  fetchProfileMe,
  getExpoPublicApiUrl,
  patchProfileMe,
  patchSeekerPrefsMe,
  fetchSuperLikesReceived,
  fetchSuperLikesSent,
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
  type SuperLikeItemDto,
} from './src/api/subadgerApi';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH;
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 70;
const CARD_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT - 12;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

const USE_API_FEED = Boolean((process.env.EXPO_PUBLIC_API_URL || '').trim());

/**
 * When true: guest preview skips auth prompts and tab/swipe locks (mock deck + Likes/Chat).
 * Branch `demo/full-access`: `true` (teammate demos). Branch `main`: `false`.
 */
const DEMO_DISABLE_GUEST_BARRIER = true;

// ─── Auth types ──────────────────────────────────────────────────────────────
type AuthScreen =
  | 'role-select'
  | 'guest-dashboard'
  | 'seeker-auth'
  | 'owner-auth'
  | 'profile-onboarding'
  | 'dashboard';
type DashboardTab = 'explore' | 'likes' | 'chat' | 'profile';
type LikeSectionKey = 'received' | 'sent' | 'offer';

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

/** Fade chrome in when this card becomes the top of the deck (after swipe or first load). */
function useDeckChromeEntrance(active: boolean, cardKey: string) {
  const entrance = useRef(new Animated.Value(0)).current;
  useLayoutEffect(() => {
    if (!active) return;
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]} />
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A1A1A' }]} />
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
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  const [, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function createLikesSections(mode: AppMode): LikeSection[] {
  if (mode === 'seeker') {
    return [
      {
        key: 'received',
        title: 'Like Received',
        items: MOCK_PROPERTIES.slice(0, 2).map((property, index) => ({
          id: `received-${property.id}`,
          name: HOST_CONTACTS[index],
          imageUrl: property.imageUrls[0],
          headline: `${HOST_CONTACTS[index]} liked your profile`,
          detail: `${property.apartmentName} · ${formatDate(property.availableStartDate)} to ${formatDate(property.availableEndDate)}`,
          badge: `$${property.subletPrice}/mo`,
          timeLabel: index === 0 ? '2m ago' : '58m ago',
        })),
      },
      {
        key: 'sent',
        title: 'Like Sent',
        items: MOCK_PROPERTIES.slice(2, 4).map((property, index) => ({
          id: `sent-${property.id}`,
          name: property.apartmentName,
          imageUrl: property.imageUrls[0],
          headline: `You liked ${property.apartmentName}`,
          detail: `${HOST_CONTACTS[index + 2]} · ${property.address}`,
          badge: `${property.roomType}`,
          timeLabel: index === 0 ? 'Yesterday' : '2d ago',
        })),
      },
      {
        key: 'offer',
        title: 'Sent offers',
        items: MOCK_PROPERTIES.slice(0, 2).map((property, index) => ({
          id: `offer-${property.id}`,
          name: HOST_CONTACTS[index],
          imageUrl: property.imageUrls[0],
          headline: `${HOST_CONTACTS[index]} sent you a stay offer`,
          detail: `${property.apartmentName} · Move-in window closes Apr ${14 + index}`,
          badge: 'Offer ready',
          timeLabel: index === 0 ? '5m ago' : '3h ago',
        })),
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
        headline: `${card.user.name} liked your listing`,
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
        headline: `You liked ${card.user.name}`,
        detail: `${card.user.bio ?? 'Open to summer sublets'} · Budget ${card.profile.targetPriceMin}-${card.profile.targetPriceMax}/mo`,
        badge: 'Profile saved',
        timeLabel: index === 0 ? 'Yesterday' : '3d ago',
      })),
    },
    {
      key: 'offer',
      title: 'Received offers',
      items: MOCK_SEEKER_CARDS.slice(0, 2).map((card, index) => ({
        id: `offer-${card.user.id}`,
        name: card.user.name,
        imageUrl: card.user.imageUrls[0],
        headline: `${card.user.name} sent a sublet offer`,
        detail: `Ready to review terms for ${formatDate(card.profile.desiredStartDate)} to ${formatDate(card.profile.desiredEndDate)}`,
        badge: 'Review now',
        timeLabel: index === 0 ? '9m ago' : '2h ago',
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
        title: 'The James Madison',
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
                { flex: 1, backgroundColor: i === currentIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' },
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
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={styles.topGradient} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', '#000']} style={styles.gradient} />
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
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={styles.topGradient} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', '#000']} style={styles.gradient} />
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
        if (direction === 'right') onSwipedRight();
        else onSwipedLeft();
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
          }).start(() => onSwipedRight());
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
          }).start(() => onSwipedLeft());
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
        <View style={styles.headerIconBtn} />
      )}
      {!isGuest ? (
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={onLogout}
          activeOpacity={0.8}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Ionicons name="log-out-outline" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.headerIconBtn} />
      )}
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
function EmptyState({ mode }: { mode: AppMode }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={mode === 'seeker' ? 'home-outline' : 'people-outline'} size={72} color="#CCC" />
      <Text style={styles.emptyTitle}>You've seen them all!</Text>
      <Text style={styles.emptySubtitle}>
        Check back later for more {mode === 'seeker' ? 'listings' : 'seekers'}.
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

function UtilityTabHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.utilityHeader}>
      <Text style={styles.utilityHeaderTitle}>{title}</Text>
      <Text style={styles.utilityHeaderSubtitle}>{subtitle}</Text>
    </View>
  );
}

function GuestProfileTabContent({
  onLogInSignUp,
  rolePreview,
}: {
  onLogInSignUp: () => void;
  rolePreview: 'seeker' | 'host';
}) {
  const roleLine =
    rolePreview === 'seeker'
      ? "You're previewing as a seeker. Create an account to save likes, message hosts, and edit your profile."
      : "You're previewing as a host. Create an account to manage listings, chat with seekers, and edit your profile.";

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
        <Text style={styles.guestProfileCardBody}>{roleLine}</Text>
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
  const title = variant === 'received' ? 'Super Like received' : 'Super Like sent';
  return (
    <View style={styles.superLikeHighlightBlock}>
      <Text style={styles.superLikeHighlightTitle}>{title}</Text>
      {items.map(it => (
        <View key={it.super_like_id} style={styles.superLikeHighlightCard}>
          <Text style={styles.superLikeHighlightListing} numberOfLines={1}>
            {it.title}
          </Text>
          <Text style={styles.superLikeHighlightFrom} numberOfLines={1}>
            {variant === 'received' ? `from ${it.counterparty_name}` : `to ${it.counterparty_name}`}
          </Text>
          <Text style={styles.superLikeHighlightBody} numberOfLines={3}>
            {it.body}
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

type LikesSubTabKey = 'received' | 'sent' | 'offers';

function LikesFromApi({
  userId,
  role,
  onOpenChat,
}: {
  userId: string;
  role: 'seeker' | 'host';
  onOpenChat?: (conversationId: string) => void;
}) {
  const [subTab, setSubTab] = React.useState<LikesSubTabKey>('received');
  const [receivedItems, setReceivedItems] = React.useState<LikeItemDto[]>([]);
  const [sentItems, setSentItems] = React.useState<LikeItemDto[]>([]);
  const [superSent, setSuperSent] = React.useState<SuperLikeItemDto[]>([]);
  const [superReceived, setSuperReceived] = React.useState<SuperLikeItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [busyInterestId, setBusyInterestId] = React.useState<string | null>(null);

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
  }, [userId, refreshKey]);

  const offerCount = role === 'seeker' ? superSent.length : superReceived.length;
  const likesHeaderSubtitle: Record<LikesSubTabKey, string> = {
    received:
      role === 'seeker'
        ? 'Hosts who liked your profile. Accept to start a chat.'
        : 'Seekers who liked your listing. Accept or decline each interest.',
    sent:
      role === 'seeker'
        ? 'Listings you liked. Hosts may respond from their inbox.'
        : 'Seekers you liked. They can accept from their Likes tab.',
    offers:
      role === 'seeker'
        ? 'Super likes include a message and stand out to hosts.'
        : 'Super likes from seekers include a message about your listing.',
  };

  const items = subTab === 'received' ? receivedItems : sentItems;
  const isReceivedTab = subTab === 'received';

  return (
    <>
      <ScrollView
        style={styles.utilityScroll}
        contentContainerStyle={styles.utilityScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <UtilityTabHeader title="Likes" subtitle={likesHeaderSubtitle[subTab]} />
        <View style={styles.likesSegmentRow}>
          <TouchableOpacity
            style={[styles.likesSegmentBtn, subTab === 'received' && styles.likesSegmentBtnActive]}
            onPress={() => setSubTab('received')}
          >
            <Text
              style={[styles.likesSegmentLabel, subTab === 'received' && styles.likesSegmentLabelActive]}
              numberOfLines={1}
            >
              Received{!loading ? ` (${receivedItems.length})` : ''}
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
              Sent{!loading ? ` (${sentItems.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.likesSegmentBtn, subTab === 'offers' && styles.likesSegmentBtnActive]}
            onPress={() => setSubTab('offers')}
          >
            <Text
              style={[styles.likesSegmentLabel, subTab === 'offers' && styles.likesSegmentLabelActive]}
              numberOfLines={1}
            >
              Offers{!loading ? ` (${offerCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        {loading ? null : subTab === 'offers' ? (
          role === 'seeker' ? (
            superSent.length === 0 ? (
              <Text style={styles.likesEmptyApi}>No Super likes sent yet.</Text>
            ) : (
              <SuperLikeHighlightList items={superSent} variant="sent" />
            )
          ) : superReceived.length === 0 ? (
            <Text style={styles.likesEmptyApi}>No Super likes received yet.</Text>
          ) : (
            <SuperLikeHighlightList items={superReceived} variant="received" />
          )
        ) : items.length === 0 ? (
          <Text style={styles.likesEmptyApi}>No items yet.</Text>
        ) : (
          <View style={styles.likesSectionCard}>
            {items.map((it, index) => (
              <View
                key={it.interest_id}
                style={[styles.likeItemRow, index < items.length - 1 && styles.likeItemRowBorder]}
              >
                <Image
                  source={{ uri: it.photo_url || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=200' }}
                  style={styles.likeAvatar}
                />
                <View style={styles.likeItemBody}>
                  <Text style={styles.likeItemName} numberOfLines={1}>
                    {isReceivedTab ? it.counterparty_name : it.title}
                  </Text>
                  <Text style={styles.likeItemDetail} numberOfLines={2}>
                    {isReceivedTab ? `${it.title} · ${it.address}` : it.address}
                  </Text>
                  <Text style={styles.likeItemHeadline} numberOfLines={3}>
                    {isReceivedTab
                      ? likeNotePreview(it.note)
                      : `${likeNotePreview(it.note)} → ${it.counterparty_name}`}
                  </Text>
                  {isReceivedTab && it.state === 'pending' ? (
                    <View style={styles.likeItemActions}>
                      <TouchableOpacity
                        style={[styles.likeActionPill, styles.likeActionDecline]}
                        disabled={busyInterestId === it.interest_id}
                        onPress={async () => {
                          setBusyInterestId(it.interest_id);
                          try {
                            await postInterestRespond(it.interest_id, { user_id: userId, action: 'decline' });
                            setRefreshKey(k => k + 1);
                          } catch (e) {
                            Alert.alert('Decline', e instanceof Error ? e.message : 'Failed');
                          } finally {
                            setBusyInterestId(null);
                          }
                        }}
                      >
                        <Text style={styles.likeActionPillText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.likeActionPill, styles.likeActionAccept]}
                        disabled={busyInterestId === it.interest_id}
                        onPress={async () => {
                          setBusyInterestId(it.interest_id);
                          try {
                            const r = await postInterestRespond(it.interest_id, {
                              user_id: userId,
                              action: 'accept',
                            });
                            setRefreshKey(k => k + 1);
                            if (r.conversation_id && onOpenChat) {
                              onOpenChat(r.conversation_id);
                            } else {
                              Alert.alert('Match', 'Chat is open. Check the Chat tab.');
                            }
                          } catch (e) {
                            Alert.alert('Accept', e instanceof Error ? e.message : 'Failed');
                          } finally {
                            setBusyInterestId(null);
                          }
                        }}
                      >
                        <Text style={[styles.likeActionPillText, styles.likeActionAcceptText]}>Accept</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {isReceivedTab && it.state === 'accepted' && it.conversation_id && onOpenChat ? (
                    <TouchableOpacity
                      style={styles.likeOpenChatBtn}
                      onPress={() => onOpenChat(it.conversation_id!)}
                    >
                      <Text style={styles.likeOpenChatBtnText}>Open chat</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.likeItemBadge}>
                  <Text style={styles.likeItemBadgeText}>${it.price_monthly}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <FullscreenBuckyLoading visible={loading} size={96} swing={26} />
    </>
  );
}

const PROFILE_HINT_EN: Record<string, string> = {
  display_name: 'Display name',
  avatar_url: 'Profile photo URL',
  email: 'Email',
  school_email_verified: 'School email verified',
  grade_or_affiliation: 'Year / affiliation',
  seeker_budget: 'Budget range',
  seeker_stay_window: 'Stay dates',
  preferred_area: 'Preferred area',
  seeker_profile: 'Seeker preferences',
  roommate_prefs: 'Roommate preferences',
  role_or_seeker_prefs: 'Role / preferences',
};

function ProfileTabWithApi({
  userId,
  authRole,
  syncProfileFromAuth,
}: {
  userId: string;
  authRole: 'seeker' | 'owner';
  /** Creates public.profiles via Supabase when the API returns 404 (existing accounts before trigger). */
  syncProfileFromAuth?: () => Promise<void>;
}) {
  const isSeeker = authRole === 'seeker';
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [pct, setPct] = React.useState<number | null>(null);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [profileMissing, setProfileMissing] = React.useState(false);
  const [schoolVerified, setSchoolVerified] = React.useState(false);

  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [schoolEmail, setSchoolEmail] = React.useState('');
  const [gradeOrYear, setGradeOrYear] = React.useState('');
  const [affiliation, setAffiliation] = React.useState('');
  const [roommateNotes, setRoommateNotes] = React.useState('');

  const [budgetMin, setBudgetMin] = React.useState('');
  const [budgetMax, setBudgetMax] = React.useState('');
  const [stayStart, setStayStart] = React.useState('');
  const [stayEnd, setStayEnd] = React.useState('');
  const [roomTypePref, setRoomTypePref] = React.useState('');
  const [genderPref, setGenderPref] = React.useState('');
  const [neighborhoodsCsv, setNeighborhoodsCsv] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setProfileMissing(false);
    try {
      const [me, comp] = await Promise.all([
        fetchProfileMe(userId),
        fetchProfileCompleteness(userId),
      ]);
      setPct(comp.percent);
      setMissing(comp.missing);
      setEmail(me.email);
      setDisplayName(me.display_name ?? '');
      setAvatarUrl(me.avatar_url ?? '');
      setSchoolEmail(me.school_email ?? '');
      setSchoolVerified(Boolean(me.school_email_verified_at));
      setGradeOrYear(me.grade_or_year ?? '');
      setAffiliation(me.affiliation ?? '');
      const rm = me.roommate_prefs as { notes?: string };
      setRoommateNotes(typeof rm?.notes === 'string' ? rm.notes : '');
      if (me.seeker) {
        setBudgetMin(String(me.seeker.budget_min));
        setBudgetMax(String(me.seeker.budget_max));
        setStayStart(me.seeker.stay_start_date.slice(0, 10));
        setStayEnd(me.seeker.stay_end_date.slice(0, 10));
        setRoomTypePref(me.seeker.room_type_pref ?? '');
        setGenderPref(me.seeker.gender_pref ?? '');
        const pn = me.seeker.prefs?.preferred_neighborhoods;
        setNeighborhoodsCsv(Array.isArray(pn) ? (pn as string[]).join(', ') : '');
      }
    } catch (e) {
      setPct(null);
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
  }, [userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const roommate_prefs =
        roommateNotes.trim().length > 0 ? { notes: roommateNotes.trim() } : {};
      await patchProfileMe({
        user_id: userId,
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        school_email: schoolEmail.trim() || null,
        grade_or_year: gradeOrYear.trim() || null,
        affiliation: affiliation.trim() || null,
        roommate_prefs,
      });

      if (isSeeker) {
        const bmin = parseInt(budgetMin.trim(), 10);
        const bmax = parseInt(budgetMax.trim(), 10);
        if (Number.isNaN(bmin) || Number.isNaN(bmax) || bmin < 0 || bmax < bmin) {
          Alert.alert('Validation', 'Enter valid monthly budget min and max (numbers).');
          setSaving(false);
          return;
        }
        const start = stayStart.trim();
        const end = stayEnd.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
          Alert.alert('Validation', 'Stay dates must be YYYY-MM-DD.');
          setSaving(false);
          return;
        }
        const nh = neighborhoodsCsv.split(',').map(s => s.trim()).filter(Boolean);
        await patchSeekerPrefsMe({
          user_id: userId,
          budget_min: bmin,
          budget_max: bmax,
          stay_start_date: start,
          stay_end_date: end,
          room_type_pref: roomTypePref.trim() || null,
          gender_pref: genderPref.trim() || null,
          prefs: nh.length ? { preferred_neighborhoods: nh } : { preferred_neighborhoods: [] },
        });
      }

      await load();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.utilityScroll} contentContainerStyle={styles.utilityScrollContent}>
        <UtilityTabHeader
          title="Profile"
          subtitle="Edit your profile and preferences. Completeness helps others trust your account."
        />
        {loading ? null : pct == null ? (
        <View style={{ marginTop: 16, gap: 16 }}>
          <Text style={styles.profileErrorText}>{loadError ?? 'Could not load profile.'}</Text>
          {profileMissing && syncProfileFromAuth ? (
            <TouchableOpacity
              style={[styles.profileSaveBtn, { marginTop: 0, backgroundColor: '#2A5CAA' }]}
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
              <Text style={styles.profileSaveBtnText}>Sync profile</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.profileSaveBtn} onPress={() => void load()} activeOpacity={0.85}>
            <Text style={styles.profileSaveBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.profileCompletenessCard}>
            <Text style={styles.profileCompletenessTitle}>Profile completeness</Text>
            <Text style={styles.profileCompletenessPct}>{pct}%</Text>
            {missing.length > 0 ? (
              <Text style={styles.profileCompletenessMissing}>
                Suggested next fields: {missing.map(k => PROFILE_HINT_EN[k] ?? k).join(', ')}
              </Text>
            ) : (
              <Text style={styles.profileCompletenessMissing}>Your profile looks complete.</Text>
            )}
          </View>

          <Text style={styles.profileFormSectionTitle}>Account</Text>
          <Text style={styles.profileFieldLabel}>Email</Text>
          <Text style={styles.profileReadonlyField}>{email || '—'}</Text>

          <Text style={styles.profileFormSectionTitle}>Public profile</Text>
          <Text style={styles.profileFieldLabel}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="How you appear to others"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.profileFieldInput}
          />
          <Text style={styles.profileFieldLabel}>Avatar image URL</Text>
          <TextInput
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://… (Supabase Storage public URL)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.profileFieldInput}
            autoCapitalize="none"
          />
          <Text style={styles.profileFieldLabel}>School email (verification)</Text>
          <TextInput
            value={schoolEmail}
            onChangeText={setSchoolEmail}
            placeholder="name@school.edu"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.profileFieldInput}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {schoolVerified ? (
            <Text style={styles.profileVerifiedNote}>School email verified</Text>
          ) : null}
          <Text style={styles.profileFieldLabel}>Year or class</Text>
          <TextInput
            value={gradeOrYear}
            onChangeText={setGradeOrYear}
            placeholder="e.g. Junior, Grad student"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.profileFieldInput}
          />
          <Text style={styles.profileFieldLabel}>Affiliation</Text>
          <TextInput
            value={affiliation}
            onChangeText={setAffiliation}
            placeholder="College / program"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.profileFieldInput}
          />
          <Text style={styles.profileFieldLabel}>Roommate preferences (notes)</Text>
          <TextInput
            value={roommateNotes}
            onChangeText={setRoommateNotes}
            placeholder="Quiet, no smoking, etc."
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={[styles.profileFieldInput, styles.profileFieldInputMultiline]}
            multiline
          />

          {isSeeker ? (
            <>
              <Text style={styles.profileFormSectionTitle}>Seeking a place</Text>
              <Text style={styles.profileFieldLabel}>Budget min / max (per month, USD)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={budgetMin}
                  onChangeText={setBudgetMin}
                  placeholder="Min"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={[styles.profileFieldInput, { flex: 1 }]}
                  keyboardType="number-pad"
                />
                <TextInput
                  value={budgetMax}
                  onChangeText={setBudgetMax}
                  placeholder="Max"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={[styles.profileFieldInput, { flex: 1 }]}
                  keyboardType="number-pad"
                />
              </View>
              <Text style={styles.profileFieldLabel}>Stay window (YYYY-MM-DD)</Text>
              <TextInput
                value={stayStart}
                onChangeText={setStayStart}
                placeholder="Start"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.profileFieldInput}
                autoCapitalize="none"
              />
              <TextInput
                value={stayEnd}
                onChangeText={setStayEnd}
                placeholder="End"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={[styles.profileFieldInput, { marginTop: 8 }]}
                autoCapitalize="none"
              />
              <Text style={styles.profileFieldLabel}>Room type preference</Text>
              <TextInput
                value={roomTypePref}
                onChangeText={setRoomTypePref}
                placeholder="Studio, 1BR, Shared…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.profileFieldInput}
              />
              <Text style={styles.profileFieldLabel}>Gender preference</Text>
              <TextInput
                value={genderPref}
                onChangeText={setGenderPref}
                placeholder="Any, same gender, …"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.profileFieldInput}
              />
              <Text style={styles.profileFieldLabel}>Preferred neighborhoods (comma-separated)</Text>
              <TextInput
                value={neighborhoodsCsv}
                onChangeText={setNeighborhoodsCsv}
                placeholder="Campus, State St, …"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.profileFieldInput}
              />
            </>
          ) : (
            <Text style={styles.profileHostNote}>
              Hosts: create and manage your listing from the web dashboard or listings API when available.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.profileSaveBtn, saving && styles.profileSaveBtnDisabled]}
            onPress={() => void saveProfile()}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.profileSaveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        </>
      )}
      </ScrollView>
      <FullscreenBuckyLoading visible={loading || saving} size={100} swing={28} />
    </>
  );
}

const LIKES_MOCK_SUBTITLES: Record<LikeSectionKey, string> = {
  received: 'People who showed interest in you—newest activity first.',
  sent: 'Places or people you liked—follow up when you are ready.',
  offer: 'Offers and standout messages tied to your matches.',
};

function LikesTabContent({ sections }: { sections: LikeSection[] }) {
  const [subTab, setSubTab] = React.useState<LikeSectionKey>('received');
  const sectionMap = React.useMemo(
    () => Object.fromEntries(sections.map(s => [s.key, s])) as Record<LikeSectionKey, LikeSection>,
    [sections],
  );
  const active = sectionMap[subTab];
  const shortTabLabel = (key: LikeSectionKey) => {
    if (key === 'received') return 'Received';
    if (key === 'sent') return 'Sent';
    return 'Offers';
  };

  return (
    <ScrollView
      style={styles.utilityScroll}
      contentContainerStyle={styles.utilityScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <UtilityTabHeader title="Likes" subtitle={LIKES_MOCK_SUBTITLES[subTab]} />

      <View style={styles.likesSegmentRow}>
        {(['received', 'sent', 'offer'] as const).map(key => {
          const sec = sectionMap[key];
          const count = sec?.items.length ?? 0;
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
                {`${shortTabLabel(key)} (${count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {active ? (
        <View style={styles.likesSectionCard}>
          <View style={styles.likesSectionHeader}>
            <Text style={styles.likesSectionTitle}>{active.title}</Text>
            <View style={styles.likesSectionCountBadge}>
              <Text style={styles.likesSectionCountText}>{active.items.length}</Text>
            </View>
          </View>

          <View style={styles.likesSectionList}>
            {active.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.likeItemRow,
                  index < active.items.length - 1 && styles.likeItemRowBorder,
                ]}
              >
                <Image source={{ uri: item.imageUrl }} style={styles.likeAvatar} />
                <View style={styles.likeItemBody}>
                  <View style={styles.likeItemTitleRow}>
                    <Text style={styles.likeItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.likeItemTime}>{item.timeLabel}</Text>
                  </View>
                  <Text style={styles.likeItemHeadline}>{item.headline}</Text>
                  <Text style={styles.likeItemDetail} numberOfLines={2}>
                    {item.detail}
                  </Text>
                </View>
                <View style={styles.likeItemBadge}>
                  <Text style={styles.likeItemBadgeText}>{item.badge}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
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
}: {
  threads: ChatThread[];
  selectedChatId: string;
  draftMessage: string;
  onSelectThread: (threadId: string) => void;
  onChangeDraft: (value: string) => void;
  onSendMessage: () => void;
}) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isThreadOpen, setIsThreadOpen] = React.useState(false);
  const kbInset = useKeyboardBottomInset();

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredThreads = threads.filter(thread => {
    const lastMessage = thread.messages[thread.messages.length - 1];
    const haystacks = [thread.title, thread.subtitle, lastMessage?.text ?? ''];

    return haystacks.some(value => value.toLowerCase().includes(normalizedQuery));
  });

  const selectedThread = threads.find(thread => thread.id === selectedChatId) ?? threads[0] ?? null;

  if (!selectedThread) {
    return (
      <TabPlaceholder
        title="Chat"
        subtitle="Conversations with matched users will appear here."
        icon="chatbubble-ellipses-outline"
      />
    );
  }

  const openThread = (threadId: string) => {
    onSelectThread(threadId);
    setIsThreadOpen(true);
  };

  if (!isThreadOpen) {
    return (
      <View style={styles.chatScreen}>
        <View style={styles.chatInboxHeader}>
          <View>
            <Text style={styles.chatInboxTitle}>Chats</Text>
            <Text style={styles.chatInboxSubtitle}>{threads.length} conversations</Text>
          </View>
          <View style={styles.chatInboxAction}>
            <Ionicons name="create-outline" size={18} color="#FFF" />
          </View>
        </View>

        <View style={styles.chatSearchBar}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.55)" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.chatSearchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSearchQuery('')}
              style={styles.chatSearchClear}
            >
              <Ionicons name="close" size={14} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredThreads.length === 0 ? (
            <View style={styles.chatEmptySearch}>
              <Text style={styles.chatEmptySearchTitle}>No chats found</Text>
              <Text style={styles.chatEmptySearchSubtitle}>Try a different name or clear the search.</Text>
            </View>
          ) : (
            filteredThreads.map(thread => {
              const lastMessage = thread.messages[thread.messages.length - 1];
              const previewPrefix = lastMessage?.sender === 'self' ? 'You: ' : '';
              const previewText = `${previewPrefix}${lastMessage?.text ?? 'Start the conversation'}`;
              const isActive = thread.id === selectedChatId;

              return (
                <TouchableOpacity
                  key={thread.id}
                  activeOpacity={0.85}
                  onPress={() => openThread(thread.id)}
                  style={[styles.chatListRow, isActive && styles.chatListRowActive]}
                >
                  <Image source={{ uri: thread.avatarUrl }} style={styles.chatListAvatar} />

                  <View style={styles.chatListTextWrap}>
                    <View style={styles.chatListTopRow}>
                      <Text style={styles.chatListName} numberOfLines={1}>
                        {thread.title}
                      </Text>
                      <Text style={styles.chatListTime}>{lastMessage?.timestamp ?? ''}</Text>
                    </View>

                    <Text style={styles.chatListPreview} numberOfLines={1}>
                      {previewText}
                    </Text>

                    <View style={styles.chatListMetaRow}>
                      <Text style={styles.chatListMeta} numberOfLines={1}>
                        {thread.subtitle}
                      </Text>
                      {thread.unreadCount > 0 ? (
                        <View style={styles.chatListUnread}>
                          <Text style={styles.chatListUnreadText}>{thread.unreadCount}</Text>
                        </View>
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="rgba(255,255,255,0.3)"
                          style={styles.chatListChevron}
                        />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.chatScreen, kbInset > 0 && { paddingBottom: kbInset }]}>
      <View style={styles.chatConversationHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setIsThreadOpen(false)}
          style={styles.chatConversationBack}
        >
          <Ionicons name="chevron-back" size={20} color="#FFF" />
        </TouchableOpacity>

        <Image source={{ uri: selectedThread.avatarUrl }} style={styles.chatConversationAvatar} />

        <View style={styles.chatConversationHeaderText}>
          <Text style={styles.chatConversationTitle}>{selectedThread.title}</Text>
          <Text style={styles.chatConversationStatus}>{selectedThread.status}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.chatConversationMessages}
        contentContainerStyle={styles.chatConversationMessagesContent}
        showsVerticalScrollIndicator={false}
      >
        {selectedThread.messages.map(message => {
          const isSelf = message.sender === 'self';
          return (
            <View
              key={message.id}
              style={[
                styles.chatMessageRow,
                isSelf ? styles.chatMessageRowSelf : styles.chatMessageRowOther,
              ]}
            >
              <View
                style={[
                  styles.chatBubble,
                  isSelf ? styles.chatBubbleSelf : styles.chatBubbleOther,
                ]}
              >
                <Text style={[styles.chatBubbleText, isSelf && styles.chatBubbleTextSelf]}>
                  {message.text}
                </Text>
              </View>
              <Text style={[styles.chatMessageTime, isSelf && styles.chatMessageTimeSelf]}>
                {message.timestamp}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.chatComposer}>
        <TextInput
          value={draftMessage}
          onChangeText={onChangeDraft}
          placeholder="Message..."
          placeholderTextColor="rgba(255,255,255,0.42)"
          style={styles.chatComposerInput}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onSendMessage}
          disabled={!draftMessage.trim()}
          style={[
            styles.chatComposerSend,
            !draftMessage.trim() && styles.chatComposerSendDisabled,
          ]}
        >
          <Text
            style={[
              styles.chatComposerSendText,
              !draftMessage.trim() && styles.chatComposerSendTextDisabled,
            ]}
          >
            Send
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
  const [msgLoading, setMsgLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const kbInset = useKeyboardBottomInset();

  React.useEffect(() => {
    let c = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await fetchConversations(userId);
        if (!c) {
          setList(rows);
          setSelectedId(prev => {
            if (prev && rows.some(r => r.conversation_id === prev)) return prev;
            return rows[0]?.conversation_id ?? '';
          });
        }
      } catch {
        if (!c) setList([]);
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
        const rows = await fetchConversations(userId);
        setList(rows);
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
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredList = list.filter(row => {
    const hay = [row.other_display_name, row.listing_id ?? ''].join(' ').toLowerCase();
    return hay.includes(normalizedQuery);
  });

  if (loading && list.length === 0) {
    return (
      <>
        <View style={[styles.chatScreen, { backgroundColor: '#0a0a0a' }]} />
        <FullscreenBuckyLoading visible size={100} swing={28} />
      </>
    );
  }

  if (!selected && !threadOpen) {
    return (
      <TabPlaceholder
        title="Chat"
        subtitle="Conversations appear here after you accept a like."
        icon="chatbubble-ellipses-outline"
      />
    );
  }

  if (!threadOpen) {
    return (
      <View style={styles.chatScreen}>
        <View style={styles.chatInboxHeader}>
          <View>
            <Text style={styles.chatInboxTitle}>Chats</Text>
            <Text style={styles.chatInboxSubtitle}>{list.length} conversations</Text>
          </View>
        </View>
        <View style={styles.chatSearchBar}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.55)" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={styles.chatSearchInput}
          />
        </View>
        <ScrollView style={styles.chatList} contentContainerStyle={styles.chatListContent}>
          {filteredList.length === 0 ? (
            <Text style={styles.likesEmptyApi}>No conversations.</Text>
          ) : (
            filteredList.map(row => (
              <TouchableOpacity
                key={row.conversation_id}
                style={styles.chatListRow}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedId(row.conversation_id);
                  setThreadOpen(true);
                }}
              >
                <View style={[styles.chatListAvatar, { backgroundColor: '#333' }]} />
                <View style={styles.chatListTextWrap}>
                  <Text style={styles.chatListName} numberOfLines={1}>
                    {row.other_display_name}
                  </Text>
                  <Text style={styles.chatListPreview} numberOfLines={1}>
                    {row.last_message_at ? 'Recent message' : 'Start chatting'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const threadTitle = selected?.other_display_name ?? 'Chat';

  return (
    <View style={[styles.chatScreen, kbInset > 0 && { paddingBottom: kbInset }]}>
      <View style={styles.chatConversationHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setThreadOpen(false)}
          style={styles.chatConversationBack}
        >
          <Ionicons name="chevron-back" size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={[styles.chatConversationAvatar, { backgroundColor: '#444' }]} />
        <View style={styles.chatConversationHeaderText}>
          <Text style={styles.chatConversationTitle}>{threadTitle}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.chatConversationMessages}
        contentContainerStyle={styles.chatConversationMessagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map(m => {
          const isSelf = m.sender_id === userId;
          const text = chatBubbleTextFromApi(m.body);
          return (
            <View
              key={m.id}
              style={[
                styles.chatMessageRow,
                isSelf ? styles.chatMessageRowSelf : styles.chatMessageRowOther,
              ]}
            >
              <View
                style={[
                  styles.chatBubble,
                  isSelf ? styles.chatBubbleSelf : styles.chatBubbleOther,
                ]}
              >
                <Text style={[styles.chatBubbleText, isSelf && styles.chatBubbleTextSelf]}>{text}</Text>
              </View>
              <Text style={[styles.chatMessageTime, isSelf && styles.chatMessageTimeSelf]}>
                {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.chatComposer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message..."
          placeholderTextColor="rgba(255,255,255,0.42)"
          style={styles.chatComposerInput}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            const t = draft.trim();
            if (!t || !selectedId) return;
            void postChatMessage(selectedId, userId, { body: t })
              .then(m => {
                setMessages(prev => [...prev, m]);
                setDraft('');
                void fetchConversations(userId).then(setList).catch(() => {});
              })
              .catch(e => Alert.alert('Chat', e instanceof Error ? e.message : 'Send failed'));
          }}
          disabled={!draft.trim()}
          style={[styles.chatComposerSend, !draft.trim() && styles.chatComposerSendDisabled]}
        >
          <Text
            style={[styles.chatComposerSendText, !draft.trim() && styles.chatComposerSendTextDisabled]}
          >
            Send
          </Text>
        </TouchableOpacity>
      </View>
      <FullscreenBuckyLoading visible={msgLoading} size={92} swing={24} />
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Auth state
  const [authScreen, setAuthScreen] = useState<AuthScreen>('role-select');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const selectedRoleRef = useRef<AuthRole>('seeker');
  const bootstrappedProfileUserIdRef = useRef<string | null>(null);

  // Dashboard state
  const [properties, setProperties] = useState<Property[]>([...MOCK_PROPERTIES]);
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
  const [likeCommentOpen, setLikeCommentOpen] = useState(false);
  const [likeCommentDraft, setLikeCommentDraft] = useState('');
  const [apiChatFocusId, setApiChatFocusId] = useState<string | null>(null);
  const clearApiChatFocus = useCallback(() => setApiChatFocusId(null), []);

  // Detail modal state
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [detailPropertyVisible, setDetailPropertyVisible] = useState(false);
  const [detailSeeker, setDetailSeeker] = useState<SeekerCard | null>(null);
  const [detailSeekerVisible, setDetailSeekerVisible] = useState(false);

  // Ref for imperative swipe from action buttons
  const topCardRef = useRef<SwipeCardRef>(null);

  const resetChatState = useCallback((mode: AppMode) => {
    const nextThreads = createChatThreads(mode);
    setChatThreads(nextThreads);
    setSelectedChatId(nextThreads[0]?.id ?? '');
    setDraftMessage('');
  }, []);

  const resetDashboardState = useCallback((mode: AppMode) => {
    setActiveTab('explore');
    setProperties([...MOCK_PROPERTIES]);
    setSeekers([...MOCK_SEEKER_CARDS]);
    resetChatState(mode);
  }, [resetChatState]);

  const finalizeSeekerSwipe = useCallback(
    (action: 'like' | 'pass', likeBody?: string | null) => {
      setProperties(prev => {
        const top = prev[0];
        if (!top) return prev;
        if (USE_API_FEED && currentUser?.id) {
          const trimmed = likeBody?.trim();
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
            .then(() => pushFeedStack(currentUser.id!, top.id))
            .catch(err => console.warn('Swipe API failed', err));
        }
        return prev.slice(1);
      });
    },
    [currentUser?.id],
  );

  React.useEffect(() => {
    if (!currentUser || currentUser.role !== 'seeker' || !USE_API_FEED) return;
    if (authScreen !== 'dashboard') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchFeed(currentUser.id, 0, feedFilters);
        if (!cancelled) setProperties(r.items.map(mapFeedListingToProperty));
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
      if (done === '1') {
        setAuthScreen('dashboard');
        if (resetDecks) {
          resetDashboardState(nextMode);
        } else {
          resetChatState(nextMode);
        }
      } else {
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
      setAuthScreen('role-select');
      setActiveTab('explore');
      setDetailPropertyVisible(false);
      setDetailSeekerVisible(false);
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
    const nextMode: AppMode = currentUser.role === 'seeker' ? 'seeker' : 'host';
    resetDashboardState(nextMode);
  }, [currentUser, resetDashboardState]);

  const handleBackToRoleSelect = () => {
    setAuthScreen('role-select');
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
        setProperties(prev => [mapFeedListingToProperty(listing), ...prev]);
      }
    } catch {
      Alert.alert('Back', 'Could not load the previous card.');
    }
  }, [isGuest, currentUser?.id, mode]);

  // ─── Auth screens ────────────────────────────────────────────────────────
  if (!isAuthReady) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (authScreen === 'role-select') {
    return <RoleSelectionScreen onSelectRole={handleSelectRole} />;
  }

  if (authScreen === 'seeker-auth') {
    return (
      <SeekerAuthScreen
        onAuthenticated={handleAuthenticated}
        onBack={handleBackToRoleSelect}
      />
    );
  }

  if (authScreen === 'owner-auth') {
    return (
      <OwnerAuthScreen
        onAuthenticated={handleAuthenticated}
        onBack={handleBackToRoleSelect}
      />
    );
  }

  if (authScreen === 'profile-onboarding' && currentUser) {
    return (
      <ProfileOnboardingFlow user={currentUser} onFinished={handleProfileOnboardingFinished} />
    );
  }

  // ─── Dashboard (logged-in or guest preview) ──────────────────────────────
  if (!currentUser && authScreen !== 'guest-dashboard') {
    return <LoadingScreen label="Loading your account..." />;
  }

  const currentDeck = mode === 'seeker' ? properties : seekers;
  const likeSections = createLikesSections(mode);

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

    if (!trimmed || !selectedChatId) {
      return;
    }

    setChatThreads(prevThreads =>
      prevThreads.map(thread =>
        thread.id === selectedChatId
          ? {
            ...thread,
            status: 'Just now',
            messages: [
              ...thread.messages,
              {
                id: `${thread.id}-${Date.now()}`,
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
  };

  const renderTabContent = () => {
    if (activeTab === 'likes') {
      if (!isGuest && currentUser && USE_API_FEED) {
        return (
          <LikesFromApi
            userId={currentUser.id}
            role={mode === 'seeker' ? 'seeker' : 'host'}
            onOpenChat={cid => {
              setApiChatFocusId(cid);
              setActiveTab('chat');
            }}
          />
        );
      }
      return <LikesTabContent sections={likeSections} />;
    }

    if (activeTab === 'chat') {
      if (!isGuest && currentUser && USE_API_FEED) {
        return (
          <ChatTabFromApi
            userId={currentUser.id}
            focusConversationId={apiChatFocusId}
            onConsumedFocusConversation={clearApiChatFocus}
          />
        );
      }
      return (
        <ChatTabContent
          threads={chatThreads}
          selectedChatId={selectedChatId}
          draftMessage={draftMessage}
          onSelectThread={handleSelectThread}
          onChangeDraft={setDraftMessage}
          onSendMessage={handleSendMessage}
        />
      );
    }

    if (activeTab === 'profile') {
      if (isGuest) {
        return (
          <GuestProfileTabContent
            rolePreview={mode === 'seeker' ? 'seeker' : 'host'}
            onLogInSignUp={() =>
              setAuthScreen(selectedRoleRef.current === 'seeker' ? 'seeker-auth' : 'owner-auth')
            }
          />
        );
      }
      if (currentUser && USE_API_FEED) {
        return (
          <ProfileTabWithApi
            userId={currentUser.id}
            authRole={currentUser.role}
            syncProfileFromAuth={async () => {
              await ensureProfileRecord(currentUser);
            }}
          />
        );
      }
      return (
        <TabPlaceholder
          title="Profile"
          subtitle="Manage your account and preferences."
          icon="person-circle-outline"
        />
      );
    }

    return (
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
            <EmptyState mode={mode} />
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
  };

  const tabs: Array<{ key: DashboardTab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'explore', label: 'Explore', icon: 'compass-outline', activeIcon: 'compass' },
    { key: 'likes', label: 'Likes', icon: 'heart-outline', activeIcon: 'heart' },
    { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
    { key: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        <DashboardHeader
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          showBack={!isGuest && activeTab === 'explore' && mode === 'seeker' && USE_API_FEED}
          onBack={handleFeedBack}
          isGuest={isGuest}
          onGuestBack={() => setAuthScreen('role-select')}
        />

        {renderTabContent()}

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
            <Text style={styles.superLikeTitle}>Super like (once per day)</Text>
            <Text style={styles.superLikeHint}>Add an offer or a short question.</Text>
            <TextInput
              value={superLikeDraft}
              onChangeText={setSuperLikeDraft}
              placeholder="Message (1–500 characters)"
              placeholderTextColor="#888"
              multiline
              style={styles.superLikeInput}
            />
            <View style={styles.superLikeActions}>
              <TouchableOpacity style={styles.superLikeCancel} onPress={() => setSuperLikeOpen(false)}>
                <Text style={styles.superLikeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.superLikeSend}
                onPress={async () => {
                  const text = superLikeDraft.trim();
                  const lid = superLikeListingIdRef.current;
                  if (!text || !lid) {
                    Alert.alert('Super like', 'Please enter a message.');
                    return;
                  }
                  if (!USE_API_FEED || !currentUser?.id) {
                    Alert.alert(
                      'Offer (preview)',
                      'Set EXPO_PUBLIC_API_URL in mobile/.env and restart Expo with npx expo start -c to send real offers.',
                    );
                    setSuperLikeOpen(false);
                    return;
                  }
                  try {
                    const r = await postSuperLike({
                      user_id: currentUser.id,
                      listing_id: lid,
                      body: text,
                    });
                    if (!r.ok) {
                      Alert.alert('Super like', r.message || 'Already used today.');
                    } else {
                      Alert.alert('Super like', 'Sent.');
                    }
                  } catch (e) {
                    Alert.alert('Super like', e instanceof Error ? e.message : 'Failed');
                  } finally {
                    setSuperLikeOpen(false);
                  }
                }}
              >
                <Text style={styles.superLikeSendText}>Send</Text>
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
        <View style={styles.superLikeOverlay}>
          <View style={styles.filterSheet}>
            <Text style={styles.superLikeTitle}>Filters</Text>
            <Text style={styles.filterLabel}>Min price</Text>
            <TextInput
              style={styles.filterField}
              keyboardType="number-pad"
              value={filterDraft.min_price}
              onChangeText={t => setFilterDraft(d => ({ ...d, min_price: t }))}
            />
            <Text style={styles.filterLabel}>Max price</Text>
            <TextInput
              style={styles.filterField}
              keyboardType="number-pad"
              value={filterDraft.max_price}
              onChangeText={t => setFilterDraft(d => ({ ...d, max_price: t }))}
            />
            <Text style={styles.filterLabel}>Neighborhood keyword</Text>
            <TextInput
              style={styles.filterField}
              value={filterDraft.neighborhood}
              onChangeText={t => setFilterDraft(d => ({ ...d, neighborhood: t }))}
            />
            <Text style={styles.filterLabel}>Amenities (comma-separated, e.g. gym,parking)</Text>
            <TextInput
              style={styles.filterField}
              value={filterDraft.amenities}
              onChangeText={t => setFilterDraft(d => ({ ...d, amenities: t }))}
            />
            <Text style={styles.filterLabel}>Max distance from campus (miles)</Text>
            <TextInput
              style={styles.filterField}
              keyboardType="decimal-pad"
              value={filterDraft.max_distance_miles}
              onChangeText={t => setFilterDraft(d => ({ ...d, max_distance_miles: t }))}
            />
            <Text style={styles.filterLabel}>Sort (newest | price_asc | price_desc | distance_asc)</Text>
            <TextInput
              style={styles.filterField}
              value={filterDraft.sort}
              onChangeText={t => setFilterDraft(d => ({ ...d, sort: t }))}
            />
            <TouchableOpacity
              style={styles.superLikeSend}
              onPress={() => {
                const next: Record<string, string> = {};
                if (filterDraft.min_price.trim()) next.min_price = filterDraft.min_price.trim();
                if (filterDraft.max_price.trim()) next.max_price = filterDraft.max_price.trim();
                if (filterDraft.neighborhood.trim()) next.neighborhood = filterDraft.neighborhood.trim();
                if (filterDraft.amenities.trim()) next.amenities = filterDraft.amenities.trim();
                if (filterDraft.max_distance_miles.trim()) {
                  next.max_distance_miles = filterDraft.max_distance_miles.trim();
                }
                if (filterDraft.sort.trim()) next.sort = filterDraft.sort.trim();
                setFeedFilters(next);
                setFilterOpen(false);
              }}
            >
              <Text style={styles.superLikeSendText}>Apply & reload feed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterReset} onPress={() => setFeedFilters({})}>
              <Text style={styles.filterResetText}>Reset filters</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingScreenDim: {
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
  },
  loadingTextOnDim: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
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
    backgroundColor: '#000',
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
    height: 3,
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
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  address: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
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
    color: 'rgba(255,255,255,0.7)',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  subletPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ADE80',
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
    color: 'rgba(255,255,255,0.6)',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  dateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    backgroundColor: '#1A1A1A',
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
    backgroundColor: '#1A1A1A',
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
    color: '#FFF',
    letterSpacing: -0.8,
  },
  utilityHeaderSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.7)',
    maxWidth: '92%',
  },

  likesSummaryCard: {
    borderRadius: 28,
    padding: 20,
    gap: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#141414',
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
    color: '#FFF',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  likesSummaryStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
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
    backgroundColor: '#101010',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
    gap: 12,
  },
  likesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  likesSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
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
    color: '#FFF',
  },
  likesSectionList: {
    gap: 2,
  },
  likeItemRow: {
    flexDirection: 'row',
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
    backgroundColor: '#2A2A2A',
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
    color: '#FFF',
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
  likeItemBadge: {
    maxWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  likeActionAccept: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  likeActionPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EEE',
  },
  likeActionAcceptText: {
    color: '#FFF',
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
    paddingBottom: TAB_BAR_HEIGHT + 18,
    paddingHorizontal: 16,
  },
  chatInboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chatInboxTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.6,
  },
  chatInboxSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.52)',
    marginTop: 4,
  },
  chatInboxAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatSearchBar: {
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatSearchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  chatSearchClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    paddingBottom: 8,
  },
  chatEmptySearch: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    gap: 8,
  },
  chatEmptySearchTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  chatEmptySearchSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  chatListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  chatListRowActive: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    borderBottomColor: 'transparent',
  },
  chatListAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#242424',
  },
  chatListTextWrap: {
    flex: 1,
    gap: 4,
  },
  chatListTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chatListName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  chatListTime: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
  },
  chatListPreview: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
  },
  chatListMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chatListMeta: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.48)',
  },
  chatListUnread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A5F',
  },
  chatListUnreadText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },
  chatListChevron: {
    marginLeft: 8,
  },
  chatConversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  chatConversationBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chatConversationAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#242424',
  },
  chatConversationHeaderText: {
    flex: 1,
    gap: 2,
  },
  chatConversationTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  chatConversationStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.52)',
  },
  chatConversationMessages: {
    flex: 1,
  },
  chatConversationMessagesContent: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  chatMessageRow: {
    maxWidth: '82%',
    gap: 5,
  },
  chatMessageRowSelf: {
    alignSelf: 'flex-end',
  },
  chatMessageRowOther: {
    alignSelf: 'flex-start',
  },
  chatBubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatBubbleSelf: {
    backgroundColor: '#FF5A5F',
    borderBottomRightRadius: 6,
  },
  chatBubbleOther: {
    backgroundColor: '#171717',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chatBubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#F4F4F4',
  },
  chatBubbleTextSelf: {
    color: '#FFF',
  },
  chatMessageTime: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 4,
  },
  chatMessageTimeSelf: {
    textAlign: 'right',
  },
  chatComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 10,
  },
  chatComposerInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
  },
  chatComposerSend: {
    minWidth: 64,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A5F',
    paddingHorizontal: 14,
  },
  chatComposerSendDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chatComposerSendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  chatComposerSendTextDisabled: {
    color: 'rgba(255,255,255,0.45)',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    color: '#888',
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
    color: '#AAA',
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
    color: '#AAA',
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
  likesSegmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  likesSegmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
  },
  likesSegmentBtnActive: {
    backgroundColor: 'rgba(255,90,95,0.25)',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  likesSegmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#AAA',
    textAlign: 'center',
  },
  likesSegmentLabelActive: {
    color: '#FFF',
  },
  likesEmptyApi: {
    marginTop: 20,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  profileCompletenessCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
  },
  profileCompletenessTitle: {
    fontSize: 14,
    color: '#AAA',
    fontWeight: '600',
  },
  profileCompletenessPct: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 8,
  },
  profileCompletenessMissing: {
    marginTop: 12,
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  profileFormSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 22,
    marginBottom: 10,
  },
  profileFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  profileFieldInput: {
    backgroundColor: '#151515',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFF',
  },
  profileFieldInputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  profileReadonlyField: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    paddingVertical: 10,
  },
  profileVerifiedNote: {
    fontSize: 13,
    color: COLORS.success,
    marginTop: 6,
    marginBottom: 4,
  },
  profileHostNote: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 12,
  },
  profileErrorText: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,200,200,0.95)',
  },
  profileSaveBtn: {
    marginTop: 28,
    marginBottom: 40,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  profileSaveBtnDisabled: {
    opacity: 0.55,
  },
  profileSaveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  superLikeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  superLikeSheet: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
  },
  superLikeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  superLikeHint: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
  },
  superLikeInput: {
    marginTop: 14,
    minHeight: 100,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#111',
    color: '#FFF',
    textAlignVertical: 'top',
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
    color: '#AAA',
    fontSize: 16,
    fontWeight: '600',
  },
  superLikeSend: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  superLikeSendText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  filterSheet: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  filterLabel: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 10,
    fontWeight: '600',
  },
  filterField: {
    marginTop: 6,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
  },
  filterReset: {
    marginTop: 12,
    alignItems: 'center',
  },
  filterResetText: {
    color: '#888',
    fontSize: 14,
  },

  guestProfileCard: {
    borderRadius: 28,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#141414',
  },
  guestProfileAvatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  guestProfileCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  guestProfileCardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
  },
  guestProfilePrimaryBtn: {
    marginTop: 4,
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
    color: '#FFF',
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
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,213,79,0.85)',
    backgroundColor: 'rgba(255,213,79,0.08)',
  },
  superLikeHighlightListing: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  superLikeHighlightFrom: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  superLikeHighlightBody: {
    fontSize: 14,
    color: '#EEE',
    marginTop: 8,
    lineHeight: 20,
  },
  superLikeHighlightMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
  },
});
