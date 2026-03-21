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
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

import { colors, radii, space, type as t } from "../theme";
import { fetchFeed, getFallbackUserId, postSwipe, type FeedListing } from "../api";
import { useAuth } from "../context/AuthContext";

const { height, width: W } = Dimensions.get("window");
const cardH = height * 0.58;
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
        tx.value = withTiming(W * 1.35, { duration: 240 }, (finished) => {
          if (finished) runOnJS(onLike)();
        });
      } else if (x < -SWIPE_THRESH || vx < -500) {
        tx.value = withTiming(-W * 1.35, { duration: 240 }, (finished) => {
          if (finished) runOnJS(onPass)();
        });
      } else {
        tx.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { rotate: `${tx.value / 28}deg` }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animStyle]}>
        {listing.photos[0] ? (
          <Image source={{ uri: listing.photos[0] }} style={styles.img} resizeMode="cover" />
        ) : (
          <View style={[styles.img, styles.ph]} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.grad}>
          <Text style={styles.price}>${listing.price_monthly}/mo</Text>
          <Text style={styles.addr}>{listing.address}</Text>
          <Text style={styles.meta}>
            {listing.room_type} · {listing.furnished ? "Furnished" : "Unfurnished"}
          </Text>
        </LinearGradient>
        <View style={styles.hintRow} pointerEvents="none">
          <Text style={styles.hintPass}>← PASS</Text>
          <Text style={styles.hintLike}>LIKE →</Text>
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

  const load = useCallback(async () => {
    if (!userId) {
      setErr("Not logged in");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchFeed(userId);
      setItems(data);
      setIdx(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load feed");
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
    if (!current || !userId) return;
    try {
      await postSwipe(userId, current.listing_id, "pass");
      advance();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Pass failed");
    }
  }, [current, userId, advance]);

  const onLike = useCallback(
    async (withNote?: string) => {
      if (!current || !userId) return;
      try {
        await postSwipe(userId, current.listing_id, "like", withNote);
        setNote("");
        setNoteOpen(false);
        advance();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Like failed");
      }
    },
    [current, userId, advance]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Swip Lease</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="notifications-outline" size={22} color={colors.ink} />
        <Ionicons name="settings-outline" size={22} color={colors.ink} style={{ marginLeft: 14 }} />
      </View>

      {!authReady || loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[t.caption, { marginTop: 12 }]}>Loading listings…</Text>
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.err}>{err}</Text>
          <Text style={[t.caption, { marginTop: 8, textAlign: "center" }]}>
            Check API URL and AUTH_DEMO_USER_ID on server. Pull to retry.
          </Text>
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !current ? (
        <View style={styles.center}>
          <Text style={t.headline}>You’re caught up</Text>
          <Text style={[t.body, { textAlign: "center", marginTop: 8 }]}>Check back later for new sublets.</Text>
        </View>
      ) : (
        <View style={styles.cardWrap}>
          <SwipeCard key={current.listing_id} listing={current} onPass={onPass} onLike={() => onLike()} />
          <View style={styles.actions}>
            <Pressable style={[styles.circle, styles.passBtn]} onPress={onPass}>
              <Ionicons name="close" size={32} color="#fff" />
            </Pressable>
            <Pressable style={[styles.circle, styles.noteBtn]} onPress={() => setNoteOpen(true)}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.ink} />
            </Pressable>
            <Pressable style={[styles.circle, styles.likeBtn]} onPress={() => onLike()}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={noteOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={t.headline}>Add a note (optional)</Text>
            <Text style={[t.caption, { marginBottom: space.sm }]}>Up to 50 characters — Hinge style.</Text>
            <TextInput
              style={styles.noteIn}
              placeholder="Hey! Is the room still available…"
              placeholderTextColor={colors.subtle}
              maxLength={50}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.modalGhost} onPress={() => setNoteOpen(false)}>
                <Text style={{ color: colors.muted, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => onLike(note)}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Send like</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: 8,
  },
  brand: { fontSize: 22, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: space.lg },
  err: { color: colors.pass, textAlign: "center" },
  retry: { marginTop: space.md, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: radii.md },
  retryText: { color: "#fff", fontWeight: "700" },
  cardWrap: { flex: 1, paddingHorizontal: space.md },
  card: {
    borderRadius: radii.xl,
    overflow: "hidden",
    height: cardH,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  img: { width: "100%", height: "100%" },
  ph: { backgroundColor: colors.border },
  grad: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
  },
  hintRow: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hintPass: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
  hintLike: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
  price: { color: "#fff", fontSize: 26, fontWeight: "800" },
  addr: { color: "rgba(255,255,255,0.95)", fontSize: 15, marginTop: 4 },
  meta: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4 },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 28,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  passBtn: { backgroundColor: colors.pass },
  noteBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  likeBtn: { backgroundColor: colors.success },
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
