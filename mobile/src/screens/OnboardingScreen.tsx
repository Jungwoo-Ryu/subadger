import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { STORAGE } from "../storageKeys";

import { colors, radii, space, type as t } from "../theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    key: "1",
    title: "Set your preference",
    body: "Budget, dates, and room type — we’ll surface listings that actually fit.",
  },
  {
    key: "2",
    title: "Swipe",
    body: "Browse sublets quickly. Pass what doesn’t work, like what does.",
  },
  {
    key: "3",
    title: "Match",
    body: "Send a short note with your like. When it’s mutual, chat opens.",
  },
];

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export function OnboardingScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  };

  const next = async () => {
    if (index < SLIDES.length - 1) {
      const ni = index + 1;
      listRef.current?.scrollToOffset({ offset: ni * width, animated: true });
      setIndex(ni);
    } else {
      await AsyncStorage.setItem(STORAGE.onboardingDone, "1");
      navigation.replace("Login");
    }
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.illus} />
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={next}>
          <Text style={styles.btnText}>{index === SLIDES.length - 1 ? "Get started" : "Next"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 48 },
  slide: { paddingHorizontal: space.lg, alignItems: "center" },
  illus: {
    width: width * 0.62,
    height: width * 0.62,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    marginBottom: space.xl,
  },
  title: {
    ...t.headline,
    color: colors.primary,
    textAlign: "center",
    marginBottom: space.md,
  },
  body: { ...t.body, textAlign: "center", maxWidth: 320 },
  footer: { padding: space.lg, paddingBottom: 36 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 22 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  btnPressed: { backgroundColor: colors.primaryPressed },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
