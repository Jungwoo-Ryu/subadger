import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type as t } from '../theme';

export function SplashScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>SwipeLease</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    ...t.brand,
    color: colors.primary,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
});
