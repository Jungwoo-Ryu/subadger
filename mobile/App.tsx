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

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  const [, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
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

  // Detail modal state
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [detailPropertyVisible, setDetailPropertyVisible] = useState(false);
  const [detailSeeker, setDetailSeeker] = useState<SeekerCard | null>(null);
  const [detailSeekerVisible, setDetailSeekerVisible] = useState(false);

  // Ref for imperative swipe from action buttons
  const topCardRef = useRef<SwipeCardRef>(null);

  const resetDashboardState = useCallback(() => {
    setActiveTab('explore');
    setProperties([...MOCK_PROPERTIES]);
    setSeekers([...MOCK_SEEKER_CARDS]);
  }, []);

  const applyAuthenticatedUser = useCallback(
    (user: AuthUser, resetDecks = true) => {
      selectedRoleRef.current = user.role;
      setCurrentUser(user);
      setAuthScreen('dashboard');

      if (resetDecks) {
        resetDashboardState();
      }
    },
    [resetDashboardState],
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

  const renderTabContent = () => {
    if (activeTab === 'likes') {
      return (
        <TabPlaceholder
          title="Likes"
          subtitle="Who liked you and who you liked will appear here."
          icon="heart-outline"
        />
      );
    }

    if (activeTab === 'chat') {
      return (
        <TabPlaceholder
          title="Chat"
          subtitle="Conversations with matched users will appear here."
          icon="chatbubble-ellipses-outline"
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
