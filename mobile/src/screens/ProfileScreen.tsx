import React from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, CommonActions } from "@react-navigation/native";

import { colors, radii, space, type as t } from "../theme";
import { useAuth } from "../context/AuthContext";

export function ProfileScreen() {
  const { userId, logout } = useAuth();
  const navigation = useNavigation();

  const id = userId ?? "—";

  const onLogout = async () => {
    await logout();
    const parent = navigation.getParent();
    parent?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Login" }],
      })
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.avatar} />
      <Text style={[t.headline, { textAlign: "center", marginTop: space.md }]}>Signed in</Text>
      <Text style={[t.caption, { textAlign: "center" }]}>ID: {id.slice(0, 8)}…</Text>
      <View style={styles.box}>
        <Text style={styles.boxLabel}>Rent range</Text>
        <View style={styles.row}>
          <View style={styles.pill}>
            <Text style={t.caption}>Min</Text>
          </View>
          <View style={styles.pill}>
            <Text style={t.caption}>Max</Text>
          </View>
        </View>
        <Text style={[t.caption, { marginTop: space.md }]}>
          Seeker prefs sync with backend `seeker_profiles` (next sprint).
        </Text>
      </View>
      <Pressable style={styles.outline}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Edit preferences</Text>
      </Pressable>
      <Pressable
        style={styles.logout}
        onPress={() =>
          Alert.alert("Log out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Log out", style: "destructive", onPress: onLogout },
          ])
        }
      >
        <Text style={{ color: colors.muted, fontWeight: "600" }}>Log out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  title: { ...t.headline, marginVertical: space.md, alignSelf: "flex-start" },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: space.md,
  },
  box: {
    marginTop: space.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boxLabel: { ...t.caption, fontWeight: "700", marginBottom: space.sm },
  row: { flexDirection: "row", gap: 12 },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 12,
    alignItems: "center",
  },
  outline: {
    marginTop: space.lg,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
  },
  logout: { marginTop: space.md, paddingVertical: 12, alignItems: "center" },
});
