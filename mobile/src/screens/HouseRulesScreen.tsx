import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type as t } from '../theme';

interface Props {
  onAgree: () => void;
  onClose?: () => void;
}

const { width } = Dimensions.get('window');

const RULES = [
  {
    title: 'Be honest',
    description: 'Description. bbbbbbbbbbbbbbbbbbbbbb',
  },
  {
    title: 'Do not ghost',
    description: 'Description. bbbbbbbbbbbbbbbbbbbbbb',
  },
  {
    title: 'Be friendly',
    description: 'Description. bbbbbbbbbbbbbbbbbbbbbb',
  },
];

export default function HouseRulesScreen({ onAgree, onClose }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          style={styles.closeButton}
        >
          <Ionicons name="close-outline" size={32} color="#000" />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
      >
        <Text style={styles.title}>Welcome to{'\n'}SwipeLease</Text>
        <Text style={styles.subtitle}>Please follow these House{'\n'}Rules</Text>

        <View style={styles.rulesContainer}>
          {RULES.map((rule, index) => (
            <View key={index} style={styles.ruleItem}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>
              <Text style={styles.ruleDescription}>{rule.description}</Text>
            </View>
          ))}
        </View>
      </Animated.ScrollView>

      {/* Footer */}
      <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.agreeButton} onPress={onAgree} activeOpacity={0.8}>
          <Text style={styles.agreeButtonText}>I agree</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  content: {
    paddingHorizontal: 32,
    paddingBottom: 100, // padding for absolute footer
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
    marginTop: 16,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 18,
    color: '#717171',
    marginTop: 16,
    marginBottom: 40,
    lineHeight: 24,
    fontWeight: '500',
  },
  rulesContainer: {
    gap: 24,
  },
  ruleItem: {
    gap: 4,
  },
  ruleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  ruleDescription: {
    fontSize: 15,
    color: '#717171',
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
  },
  agreeButton: {
    backgroundColor: '#C50A15', // Similar to primary red
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  agreeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
