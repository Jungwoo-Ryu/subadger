import React from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, radii, space, type as t } from "../theme";

export function MapScreen() {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <LinearGradient colors={[colors.primary, colors.primaryPressed]} style={styles.header}>
        <Ionicons name="location" size={22} color="#fff" />
        <Text style={styles.headerTitle}>Madison</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="heart-outline" size={22} color="#fff" />
        <Ionicons name="settings-outline" size={22} color="#fff" style={{ marginLeft: 16 }} />
      </LinearGradient>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.subtle} />
        <TextInput style={styles.search} placeholder="Search neighborhood, address…" placeholderTextColor={colors.subtle} />
      </View>
      <View style={styles.map}>
        <Text style={styles.mapLabel}>Map preview</Text>
        <Text style={styles.mapSub}>Pins + listing sheet — wire Mapbox / Google later</Text>
      </View>
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Near campus</Text>
        <View style={styles.row}>
          <View style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={t.headline}>Badger Housing</Text>
            <Text style={t.caption}>$1,200/mo · Studio</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: 12,
    gap: 8,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: space.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  search: { flex: 1, fontSize: 16, color: colors.ink },
  map: {
    flex: 1,
    marginHorizontal: space.md,
    borderRadius: radii.lg,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  mapLabel: { ...t.headline },
  mapSub: { ...t.caption, marginTop: 6, textAlign: "center", paddingHorizontal: 24 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: space.md,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  sheetTitle: { ...t.caption, marginBottom: space.sm, fontWeight: "700", color: colors.muted },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 72, borderRadius: radii.sm, backgroundColor: colors.border },
});
