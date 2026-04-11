import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { BuckyLoading } from './BuckyLoading';

type Props = {
  visible: boolean;
  size?: number;
  swing?: number;
  /** Dim strength 0–1 (default ~0.4) */
  dimOpacity?: number;
  message?: string;
};

/**
 * Full-screen semi-transparent dim with Bucky centered on the device (Modal → true viewport center).
 */
export function FullscreenBuckyLoading({
  visible,
  size = 104,
  swing = 28,
  dimOpacity = 0.4,
  message,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.fill, { backgroundColor: `rgba(0,0,0,${dimOpacity})` }]} pointerEvents="box-none">
        <View style={styles.center} pointerEvents="box-none">
          <BuckyLoading size={size} swing={swing} />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    marginTop: 20,
    paddingHorizontal: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '500',
  },
});
