import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

import { colors, radii, space, type as t } from "../theme";
import { DUMMY_LISTINGS, fetchFeed, getFallbackUserId, postSwipe, type FeedListing } from "../api";
import { useAuth } from "../context/AuthContext";

const { height, width: W } = Dimensions.get("window");
const cardH = height * 0.68;
const SWIPE_THRESH = 110;

type SwipeCardProps = {
  listing: FeedListing;
  onPass: () => void;
  onLike: () => void;
};

function SwipeCard({ listing, onPass, onLike }: SwipeCardProps) {
  const tx = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = e.translationX;
    })
    .onEnd((e) => {
      const x = e.translationX;
      const vx = e.velocityX;
      if (x > SWIPE_THRESH || vx > 500) {
        tx.value = withTiming(W * 1.35, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onLike)();
        });
      } else if (x < -SWIPE_THRESH || vx < -500) {
        tx.value = withTiming(-W * 1.35, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onPass)();
        });
      } else {
        tx.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const animStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: tx.value }, { rotate: `${tx.value / 24}deg` }],
      shadowOpacity: 0.16,
      elevation: 10,
      borderColor: tx.value > 8 ? "#22C55E" : tx.value < -8 ? "#EF4444" : colors.border,
      borderWidth: 1,
      overflow: "hidden",
    };
  });

  const likeBadge = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, tx.value / 90)) }));
  const nopeBadge = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, -tx.value / 90)) }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animStyle]}>
        {listing.photos[0] ? (
          <Image source={{ uri: listing.photos[0] }} style={styles.img} resizeMode="cover" />
        ) : (
          <View style={[styles.img, styles.ph]} />
        )}

        <Animated.View style={[styles.badge, styles.badgeLike, likeBadge]}>
          <Text style={styles.badgeText}>LIKE</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.badgeNope, nopeBadge]}>
          <Text style={styles.badgeText}>NOPE</Text>
        </Animated.View>

        <View style={styles.infoPanel}>
          <Text style={styles.price}>${listing.price_monthly}/month</Text>
          <Text style={styles.address}>{listing.address}</Text>

          <View style={styles.chips}>
            <Text style={styles.chip}>{listing.room_type}</Text>
            <Text style={styles.chip}>{listing.furnished ? "Furnished" : "Unfurnished"}</Text>
            {listing.utilities ? <Text style={styles.chip}>Utilities</Text> : null}
          </View>

          <View style={styles.promptBox}>
            <Text style={styles.promptTitle}>From host {listing.host_name}</Text>
            <Text style={styles.promptBody}>{listing.rules || "Clean, respectful roommate preferred."}</Text>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export function MatchingScreen() {
  const { userId: authUid, ready: authReady } = useAuth();
  const userId = authUid ?? getFallbackUserId() ?? "";

  const [items, setItems] = useState<FeedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [usingDummy, setUsingDummy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setItems(DUMMY_LISTINGS);
      setUsingDummy(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchFeed(userId);
      if (data.length === 0) {
        setItems(DUMMY_LISTINGS);
        setUsingDummy(true);
      } else {
        setItems(data);
        setUsingDummy(false);
      }
      setIdx(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load feed");
      setItems(DUMMY_LISTINGS);
      setUsingDummy(true);
      setIdx(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authReady) load();
  }, [load, authReady]);

  const current = items[idx];
  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const onPass = useCallback(async () => {
    if (!current) return;
    if (usingDummy || !userId) {
      advance();
      return;
    }
    try {
      await postSwipe(userId, current.listing_id, "pass");
      advance();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Pass failed");
    }
  }, [current, userId, advance, usingDummy]);

  const onLike = useCallback(
    async (withNote?: string) => {
      if (!current) return;
      if (usingDummy || !userId) {
        setNote("");
        setNoteOpen(false);
        advance();
        return;
      }
      try {
        await postSwipe(userId, current.listing_id, "like", withNote);
        setNote("");
        setNoteOpen(false);
        advance();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Like failed");
      }
    },
    [current, userId, advance, usingDummy]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.topBar}>
        <Ionicons name="flame" size={26} color={colors.primary} />
        <Text style={styles.brand}>Subadger Match</Text>
      </View>

      {usingDummy ? (
        <Text style={styles.dummyNotice}>No feed data found. Showing 4 demo listings.</Text>
      ) : null}

      {!authReady || loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[t.caption, { marginTop: 12 }]}>Loading listings…</Text>
        </View>
      ) : err && !current ? (
        <View style={styles.center}>
          <Text style={styles.err}>{err}</Text>
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !current ? (
        <View style={styles.center}>
          <Text style={t.headline}>You’re all caught up</Text>
          <Text style={[t.body, { textAlign: "center", marginTop: 8 }]}>Come back for newly listed homes.</Text>
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Reload</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardWrap}>
          <SwipeCard key={`${current.listing_id}-${idx}`} listing={current} onPass={onPass} onLike={() => onLike()} />
          <View style={styles.actions}>
            <Pressable style={[styles.circle, styles.passBtn]} onPress={onPass}>
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
            <Pressable style={[styles.circle, styles.noteBtn]} onPress={() => setNoteOpen(true)}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.ink} />
            </Pressable>
            <Pressable style={[styles.circle, styles.likeBtn]} onPress={() => onLike()}>
              <Ionicons name="heart" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={noteOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={t.headline}>메시지와 함께 좋아요 보내기</Text>
            <Text style={[t.caption, { marginBottom: space.sm }]}>50자 이내</Text>
            <TextInput
              style={styles.noteIn}
              placeholder="예: 입주 가능일이 궁금해요!"
              placeholderTextColor={colors.subtle}
              maxLength={50}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.modalGhost} onPress={() => setNoteOpen(false)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>취소</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => onLike(note)}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>보내기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: space.md,
    paddingBottom: 10,
  },
  brand: { fontSize: 24, fontWeight: "800", color: colors.primary, letterSpacing: -0.4 },
  dummyNotice: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: space.lg },
  err: { color: colors.pass, textAlign: "center", marginBottom: 10 },
  retry: {
    marginTop: space.md,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  cardWrap: { flex: 1, paddingHorizontal: space.md },
  card: {
    borderRadius: 26,
    height: cardH,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  img: { width: "100%", height: "67%" },
  ph: { backgroundColor: colors.border },
  badge: {
    position: "absolute",
    top: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 3,
    transform: [{ rotate: "-9deg" }],
  },
  badgeLike: { right: 18, borderColor: "#22C55E" },
  badgeNope: { left: 18, borderColor: "#EF4444", transform: [{ rotate: "9deg" }] },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 22, letterSpacing: 1 },
  infoPanel: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  price: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  address: { color: colors.muted, fontSize: 14, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: {
    fontSize: 11,
    color: colors.ink,
    backgroundColor: "#F5F5F4",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  promptBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFBEB",
  },
  promptTitle: { fontSize: 12, color: colors.primary, fontWeight: "700", marginBottom: 4 },
  promptBody: { fontSize: 13, color: colors.ink },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    marginTop: space.md,
    marginBottom: space.md,
  },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  passBtn: { backgroundColor: "#EF4444" },
  noteBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  likeBtn: { backgroundColor: "#22C55E" },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: space.lg,
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
  },
  noteIn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: space.md,
  },
  modalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  modalGhost: { paddingVertical: 10, paddingHorizontal: 12 },
  modalPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
  },
});
