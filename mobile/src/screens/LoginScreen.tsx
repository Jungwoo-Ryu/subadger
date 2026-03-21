import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";

import { colors, radii, space, type as t } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("system");
  const [password, setPassword] = useState("system");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    try {
      await login(email, password);
      navigation.replace("Main");
    } catch (e) {
      Alert.alert("Login failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Sublease</Text>
        <Text style={styles.hint}>Default: id & password both `system` (server maps to demo profile).</Text>

        <Text style={styles.label}>Email or ID</Text>
        <TextInput
          style={styles.input}
          placeholder="system or system@wisc.edu"
          placeholderTextColor={colors.subtle}
          autoCapitalize="none"
          keyboardType="default"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="system"
          placeholderTextColor={colors.subtle}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable>
          <Text style={styles.forgot}>Forgot password?</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Log in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: space.lg, paddingTop: 72, justifyContent: "flex-start" },
  logo: {
    ...t.brand,
    textAlign: "center",
    marginBottom: space.sm,
  },
  hint: { ...t.caption, textAlign: "center", marginBottom: space.xl },
  label: { ...t.caption, marginBottom: space.xs, fontWeight: "600", color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: colors.surface,
    marginBottom: space.md,
  },
  forgot: { color: colors.primary, fontSize: 14, marginBottom: space.xl },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnPressed: { backgroundColor: colors.primaryPressed },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
