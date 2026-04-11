import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, space, type as t } from "../theme";
import { fetchFeed, getFallbackUserId, type FeedListing } from "../api";
import { useAuth } from "../context/AuthContext";

export function ListScreen() {
  const { userId: authUid } = useAuth();
  const userId = authUid ?? getFallbackUserId() ?? "";
  const [items, setItems] = useState<FeedListing[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetchFeed(userId).then(setItems).catch(() => setItems([]));
  }, [userId]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Text style={styles.title}>Browse</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.listing_id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.photos[0] ? (
              <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.border }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={t.headline}>{item.address.split(",")[0]}</Text>
              <Text style={t.caption}>
                ${item.price_monthly}/mo · {item.room_type}
              </Text>
              <View style={styles.tags}>
                <Text style={styles.tag}>Active</Text>
                {item.utilities ? <Text style={styles.tag}>Utils</Text> : null}
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[t.body, { textAlign: "center", marginTop: 48 }]}>No listings yet.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md },
  title: { ...t.headline, marginVertical: space.md },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 88, height: 88, borderRadius: radii.sm },
  tags: { flexDirection: "row", gap: 6, marginTop: 6 },
  tag: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
    backgroundColor: "rgba(21,128,61,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
});
