import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { STORAGE } from "../storageKeys";

import { colors, type as t } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

export function SplashScreen({ navigation }: Props) {
  const { userId, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(async () => {
      if (userId) {
        navigation.replace("Main");
        return;
      }
      const ob = await AsyncStorage.getItem(STORAGE.onboardingDone);
      if (ob === "1") {
        navigation.replace("Login");
      } else {
        navigation.replace("Onboarding");
      }
    }, 1200);
    return () => clearTimeout(id);
  }, [ready, userId, navigation]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Swip Lease</Text>
      <Text style={styles.sub}>Swipe · Match · Move in</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    ...t.brand,
    color: "#FFFFFF",
    fontSize: 34,
  },
  sub: {
    marginTop: 12,
    fontSize: 15,
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.3,
  },
});
