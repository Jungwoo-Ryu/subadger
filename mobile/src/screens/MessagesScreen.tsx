import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, space, type as t } from "../theme";

const MOCK = [
  { id: "1", name: "Alex", preview: "Sounds good — when can you tour?" },
  { id: "2", name: "Jordan", preview: "Is utilities included?" },
];

export function MessagesScreen() {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Text style={styles.title}>Messages</Text>
      <Text style={[t.caption, { marginBottom: space.md }]}>
        Realtime chat after match — Supabase Realtime on `messages`.
      </Text>
      <FlatList
        data={MOCK}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar} />
            <View>
              <Text style={t.headline}>{item.name}</Text>
              <Text style={t.caption} numberOfLines={1}>
                {item.preview}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md },
  title: { ...t.headline, marginVertical: space.md },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.border },
});
