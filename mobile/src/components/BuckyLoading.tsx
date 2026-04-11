import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

const BUCKY = require('../../assets/brand/bucky.png');

type Props = {
  /** Image width/height in px */
  size?: number;
  /** Horizontal swing distance (px) */
  swing?: number;
};

/**
 * Centered mascot that oscillates left–right (Expo / RN analogue of a SlideTransition loop).
 */
export function BuckyLoading({ size = 100, swing = 28 }: Props) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-swing, swing],
  });

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Image source={BUCKY} style={{ width: size, height: size, resizeMode: 'contain' }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
});
