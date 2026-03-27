import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import {
  type AuthRole,
  type AuthUser,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from '../lib/auth';

const COLORS = {
  bg: '#FFFFFF',
  accent: '#FF5A5F',
  accentDark: '#E04850',
  accentLight: 'rgba(255,90,95,0.15)',
  cardBorder: '#EBEBEB',
  white: '#FFFFFF',
  text: '#222222',
  muted: '#717171',
  inputBg: '#F7F7F7',
  inputBorder: '#EBEBEB',
  error: '#FF5252',
  success: '#169B62',
};

interface Props {
  role: AuthRole;
  title: string;
  fallbackName: string;
  icon: keyof typeof Ionicons.glyphMap;
  loginSubtitle: string;
  signUpSubtitle: string;
  onAuthenticated: (user: AuthUser) => void;
  onBack: () => void;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export default function AuthFormScreen({
  role,
  title,
  fallbackName,
  icon,
  loginSubtitle,
  signUpSubtitle,
  onAuthenticated,
  onBack,
}: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  React.useEffect(() => {
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
  }, [fadeAnim, slideAnim]);

  const clearFeedback = () => {
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const resetForm = (nextIsLogin: boolean) => {
    setIsLogin(nextIsLogin);
    setName('');
    setPassword('');
    setConfirmPassword('');
    clearFeedback();
  };

  const validateForm = () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedEmail) {
      return 'Email is required.';
    }

    if (!trimmedEmail.includes('@')) {
      return 'Enter a valid email address.';
    }

    if (!password) {
      return 'Password is required.';
    }

    if (!isLogin) {
      if (!trimmedName) {
        return 'Full name is required.';
      }

      if (password.length < 6) {
        return 'Password must be at least 6 characters.';
      }

      if (password !== confirmPassword) {
        return 'Passwords do not match.';
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      setStatusMessage(null);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim() || fallbackName;

    clearFeedback();
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const user = await signInWithEmailPassword({
          email: trimmedEmail,
          password,
          fallbackRole: role,
        });

        onAuthenticated(user);
        return;
      }

      const result = await signUpWithEmailPassword({
        name: trimmedName,
        email: trimmedEmail,
        password,
        role,
      });

      if (result.requiresEmailConfirmation || !result.user) {
        setStatusMessage('Account created. Check your email to confirm it, then log in.');
        setPassword('');
        setConfirmPassword('');
        setIsLogin(true);
        return;
      }

      onAuthenticated(result.user);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.bgCircle} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.formSection,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={icon} size={32} color={COLORS.accent} />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {isLogin ? loginSubtitle : signUpSubtitle}
            </Text>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, isLogin && styles.tabActive]}
                onPress={() => resetForm(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
                  Log In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, !isLogin && styles.tabActive]}
                onPress={() => resetForm(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              {!isLogin && (
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={COLORS.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={COLORS.muted}
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      clearFeedback();
                    }}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={COLORS.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor={COLORS.muted}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    clearFeedback();
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={COLORS.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, styles.flexInput]}
                  placeholder="Password"
                  placeholderTextColor={COLORS.muted}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    clearFeedback();
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((value) => !value)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={COLORS.muted}
                  />
                </TouchableOpacity>
              </View>

              {!isLogin && (
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={COLORS.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm Password"
                    placeholderTextColor={COLORS.muted}
                    value={confirmPassword}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      clearFeedback();
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              )}

              {isLogin && (
                <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}

              {errorMessage ? (
                <Text style={[styles.feedbackText, styles.feedbackError]}>
                  {errorMessage}
                </Text>
              ) : null}

              {statusMessage ? (
                <Text style={[styles.feedbackText, styles.feedbackSuccess]}>
                  {statusMessage}
                </Text>
              ) : null}

              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={isSubmitting}
              >
                <LinearGradient
                  colors={[COLORS.accent, COLORS.accentDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <Text style={styles.submitText}>
                        {isLogin ? 'Log In' : 'Create Account'}
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color="#FFF" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
                <Ionicons name="logo-google" size={20} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
                <Ionicons name="logo-apple" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 32) + 10 : 60,
    paddingBottom: 40,
  },
  bgCircle: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,90,95,0.05)',
  },
  backBtn: {
    marginLeft: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F7F7F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    padding: 3,
    marginBottom: 24,
    width: '100%',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  form: {
    width: '100%',
    gap: 14,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  flexInput: {
    flex: 1,
  },
  eyeBtn: {
    padding: 6,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  feedbackError: {
    color: COLORS.error,
  },
  feedbackSuccess: {
    color: COLORS.success,
  },
  submitBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.8,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
    minHeight: 56,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.cardBorder,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 16,
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
