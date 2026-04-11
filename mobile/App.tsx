import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
  Text,
  Image,
  Dimensions,
  TouchableOpacity,
  Platform,
  StatusBar,
  PanResponder,
  Animated,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
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
import { type AuthRole, type AuthUser, mapSupabaseUser, signOut as signOutUser } from './src/lib/auth';
import { ensureProfileRecord } from './src/lib/profile';
import { supabase } from './src/lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH;
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 80 : 70;
const CARD_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT - 12;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

// ─── Auth types ──────────────────────────────────────────────────────────────
type AuthScreen = 'role-select' | 'seeker-auth' | 'owner-auth' | 'dashboard';
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
        title: 'Offer Sent From Other Users',
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
      title: 'Offer Sent From Other Users',
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
function PropertyCardContent({ property, onShowDetail, onNope, onLike }: { property: Property; onShowDetail?: () => void; onNope?: () => void; onLike?: () => void }) {
  return (
    <View style={styles.cardInner}>
      <ImageCarousel imageUrls={property.imageUrls} />
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={styles.topGradient} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', '#000']} style={styles.gradient} />
      <View style={styles.cardInfo}>
        <Text style={styles.apartmentName} numberOfLines={1}>{property.apartmentName}</Text>
        <Text style={styles.address} numberOfLines={1}>
          📍 {property.address}
        </Text>
        <Text style={styles.subletPrice}>${property.subletPrice}/mo</Text>
      </View>
      {/* Detail expand button */}
      {onShowDetail && (
        <TouchableOpacity style={styles.detailBtn} onPress={onShowDetail} activeOpacity={0.8}>
          <Ionicons name="chevron-up" size={18} color="#FFF" />
        </TouchableOpacity>
      )}
      {/* Action buttons inside card */}
      {onNope && onLike && (
        <View style={styles.actions} pointerEvents="box-none">
          <TouchableOpacity style={[styles.actionBtn, styles.actionNope]} onPress={onNope} activeOpacity={0.85}>
            <Ionicons name="close" size={38} color={COLORS.danger} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionLike]} onPress={onLike} activeOpacity={0.85}>
            <Ionicons name="heart" size={34} color={COLORS.success} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Seeker Card Content ──────────────────────────────────────────────────────
function SeekerCardContent({ card, onShowDetail, onNope, onLike }: { card: SeekerCard; onShowDetail?: () => void; onNope?: () => void; onLike?: () => void }) {
  const { user, profile } = card;
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
      {/* Detail expand button */}
      {onShowDetail && (
        <TouchableOpacity style={styles.detailBtn} onPress={onShowDetail} activeOpacity={0.8}>
          <Ionicons name="chevron-up" size={18} color="#FFF" />
        </TouchableOpacity>
      )}
      {/* Action buttons inside card */}
      {onNope && onLike && (
        <View style={styles.actions} pointerEvents="box-none">
          <TouchableOpacity style={[styles.actionBtn, styles.actionNope]} onPress={onNope} activeOpacity={0.85}>
            <Ionicons name="close" size={38} color={COLORS.danger} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionLike]} onPress={onLike} activeOpacity={0.85}>
            <Ionicons name="heart" size={34} color={COLORS.success} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Swipe-Down Detail Modal ─────────────────────────────────────────────────
const MODAL_DISMISS_THRESHOLD = 120;

// ─── Property Detail Modal ───────────────────────────────────────────────────
function PropertyDetailModal({ property, visible, onClose }: { property: Property | null; visible: boolean; onClose: () => void }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const closingRef = useRef(false);

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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
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
}

export interface SwipeCardRef {
  triggerSwipe: (direction: 'left' | 'right') => void;
}

const SwipeCard = forwardRef<SwipeCardRef, SwipeCardProps>(({ index, onSwipedLeft, onSwipedRight, children }, ref) => {
  const isTop = index === 0;
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;

  const position = useRef(new Animated.ValueXY()).current;
  const likeOpacity = useRef(new Animated.Value(0)).current;
  const nopeOpacity = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    triggerSwipe: (direction: 'left' | 'right') => {
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
      onMoveShouldSetPanResponder: (_, g) => isTopRef.current && Math.abs(g.dx) > 8,
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
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH * 1.5, y: g.dy + 50 },
            duration: 320,
            useNativeDriver: true,
          }).start(() => onSwipedRight());
        } else if (g.dx < -SWIPE_THRESHOLD) {
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

  // Back cards: same size, no gesture — ready to show instantly
  if (!isTop) {
    return (
      <View style={styles.card}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
      {...panResponder.panHandlers}
    >
      {children}
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
function DashboardHeader({ onLogout, isLoggingOut }: { onLogout: () => void; isLoggingOut: boolean }) {
  return (
    <View style={styles.header}>
      <View />
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
    </View>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>{label}</Text>
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
      <View style={styles.utilityHeaderBadge}>
        <Text style={styles.utilityHeaderBadgeText}>Roomie</Text>
      </View>
      <Text style={styles.utilityHeaderTitle}>{title}</Text>
      <Text style={styles.utilityHeaderSubtitle}>{subtitle}</Text>
    </View>
  );
}

function LikesTabContent({ sections }: { sections: LikeSection[] }) {
  const totalCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <ScrollView
      style={styles.utilityScroll}
      contentContainerStyle={styles.utilityScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <UtilityTabHeader
        title="Likes"
        subtitle="Track interest, keep tabs on outbound likes, and review new offers in one place."
      />

      <LinearGradient
        colors={['rgba(255,90,95,0.28)', 'rgba(255,90,95,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.likesSummaryCard}
      >
        <View style={styles.likesSummaryTextWrap}>
          <Text style={styles.likesSummaryEyebrow}>Activity Snapshot</Text>
          <Text style={styles.likesSummaryTitle}>{totalCount} active touchpoints</Text>
          <Text style={styles.likesSummarySubtitle}>Everything here is grouped so you can scan the newest movement quickly.</Text>
        </View>
        <View style={styles.likesSummaryStats}>
          {sections.map(section => (
            <View key={section.key} style={styles.likesSummaryStat}>
              <Text style={styles.likesSummaryStatValue}>{section.items.length}</Text>
              <Text style={styles.likesSummaryStatLabel}>{section.title}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {sections.map(section => (
        <View key={section.key} style={styles.likesSectionCard}>
          <View style={styles.likesSectionHeader}>
            <Text style={styles.likesSectionTitle}>{section.title}</Text>
            <View style={styles.likesSectionCountBadge}>
              <Text style={styles.likesSectionCountText}>{section.items.length}</Text>
            </View>
          </View>

          <View style={styles.likesSectionList}>
            {section.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.likeItemRow,
                  index < section.items.length - 1 && styles.likeItemRowBorder,
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
      ))}
    </ScrollView>
  );
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
    <View style={styles.chatScreen}>
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

  const applyAuthenticatedUser = useCallback(
    (user: AuthUser, resetDecks = true) => {
      const nextMode: AppMode = user.role === 'seeker' ? 'seeker' : 'host';
      selectedRoleRef.current = user.role;
      setCurrentUser(user);
      setAuthScreen('dashboard');

      if (resetDecks) {
        resetDashboardState(nextMode);
      } else {
        resetChatState(nextMode);
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
          applyAuthenticatedUser(
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
        applyAuthenticatedUser(
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
  }, [applyAuthenticatedUser]);

  useEffect(() => {
    if (!currentUser) {
      bootstrappedProfileUserIdRef.current = null;
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
    setAuthScreen(role === 'seeker' ? 'seeker-auth' : 'owner-auth');
  };

  const handleAuthenticated = (user: AuthUser) => {
    applyAuthenticatedUser(user);
  };

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

  // ─── Dashboard ───────────────────────────────────────────────────────────
  if (!currentUser) {
    return <LoadingScreen label="Loading your account..." />;
  }

  const mode: AppMode = currentUser.role === 'seeker' ? 'seeker' : 'host';
  const currentDeck = mode === 'seeker' ? properties : seekers;
  const likeSections = createLikesSections(mode);

  const removeTop = () => {
    if (mode === 'seeker') setProperties(p => p.slice(1));
    else setSeekers(s => s.slice(1));
  };

  const handleButtonSwipe = (direction: 'left' | 'right') => {
    if (topCardRef.current) {
      topCardRef.current.triggerSwipe(direction);
    } else {
      removeTop();
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
      return <LikesTabContent sections={likeSections} />;
    }

    if (activeTab === 'chat') {
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
        <View style={styles.deckContainer} pointerEvents="box-none">
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
                  onSwipedLeft={removeTop}
                  onSwipedRight={removeTop}
                >
                  {mode === 'seeker'
                    ? <PropertyCardContent
                      property={item as Property}
                      onShowDetail={() => showPropertyDetail(item as Property)}
                      onNope={isTopCard ? () => handleButtonSwipe('left') : undefined}
                      onLike={isTopCard ? () => handleButtonSwipe('right') : undefined}
                    />
                    : <SeekerCardContent
                      card={item as SeekerCard}
                      onShowDetail={() => showSeekerDetail(item as SeekerCard)}
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
        <DashboardHeader onLogout={handleLogout} isLoggingOut={isLoggingOut} />

        {renderTabContent()}

        <View style={styles.tabBar}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabBarItem}
                activeOpacity={0.8}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={22}
                  color={isActive ? COLORS.primary : '#A0A0A0'}
                />
                <Text style={[styles.tabBarLabel, isActive && styles.tabBarLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
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
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 8 : 54,
    paddingBottom: 10,
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
  // Tap zones for image navigation (full height)
  tapZoneLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '45%',
    zIndex: 20,
  },
  tapZoneRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
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
    right: 0,
    paddingHorizontal: 20,
    gap: 4,
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

  // Detail expand button
  detailBtn: {
    position: 'absolute',
    bottom: 115,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
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
    gap: 50,
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
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: -0.1,
  },
  tabBarLabelActive: {
    color: COLORS.primary,
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
});
