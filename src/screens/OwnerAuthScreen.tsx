import React, { useState, useRef } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Dimensions,
    Platform,
    StatusBar,
    Animated,
    KeyboardAvoidingView,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
    primary: '#FF5A5F',
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
    inputFocus: 'rgba(255,90,95,0.4)',
    error: '#FF5252',
};

interface Props {
    onLogin: (name: string, email: string) => void;
    onBack: () => void;
}

export default function OwnerAuthScreen({ onLogin, onBack }: Props) {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

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
    }, []);

    const handleSubmit = () => {
        const displayName = isLogin ? (name || email || 'Owner') : (name || 'Owner');
        onLogin(displayName, email || 'owner@submatch.com');
    };

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Background accent circle */}
            <View style={styles.bgCircle} />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Back button */}
                    <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
                        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
                    </TouchableOpacity>

                    <Animated.View
                        style={[
                            styles.formSection,
                            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                        ]}
                    >
                        {/* Icon */}
                        <View style={styles.iconCircle}>
                            <Ionicons name="home" size={32} color={COLORS.accent} />
                        </View>

                        <Text style={styles.title}>Room Owner</Text>
                        <Text style={styles.subtitle}>
                            {isLogin ? 'Welcome back! Sign in to manage listings' : 'Create an account to list your property'}
                        </Text>

                        {/* Tabs */}
                        <View style={styles.tabRow}>
                            <TouchableOpacity
                                style={[styles.tab, isLogin && styles.tabActive]}
                                onPress={() => toggleMode()}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Log In</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, !isLogin && styles.tabActive]}
                                onPress={() => toggleMode()}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign Up</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Form */}
                        <View style={styles.form}>
                            {!isLogin && (
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="person-outline" size={18} color={COLORS.muted} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Full Name"
                                        placeholderTextColor={COLORS.muted}
                                        value={name}
                                        onChangeText={setName}
                                        autoCapitalize="words"
                                    />
                                </View>
                            )}

                            <View style={styles.inputWrapper}>
                                <Ionicons name="mail-outline" size={18} color={COLORS.muted} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Email Address"
                                    placeholderTextColor={COLORS.muted}
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <View style={styles.inputWrapper}>
                                <Ionicons name="lock-closed-outline" size={18} color={COLORS.muted} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="Password"
                                    placeholderTextColor={COLORS.muted}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                                    <Ionicons
                                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                        size={18}
                                        color={COLORS.muted}
                                    />
                                </TouchableOpacity>
                            </View>

                            {!isLogin && (
                                <View style={styles.inputWrapper}>
                                    <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.muted} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Confirm Password"
                                        placeholderTextColor={COLORS.muted}
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry={!showPassword}
                                    />
                                </View>
                            )}

                            {isLogin && (
                                <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
                                    <Text style={styles.forgotText}>Forgot Password?</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
                                <LinearGradient
                                    colors={[COLORS.accent, COLORS.accentDark]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.submitGradient}
                                >
                                    <Text style={styles.submitText}>{isLogin ? 'Log In' : 'Create Account'}</Text>
                                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>

                        {/* Or divider */}
                        <View style={styles.dividerRow}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or continue with</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {/* Social buttons */}
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

    // Back
    backBtn: {
        marginLeft: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F7F7F7',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Form section
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

    // Tabs
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

    // Form
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

    // Submit
    submitBtn: {
        borderRadius: 14,
        overflow: 'hidden',
        marginTop: 4,
    },
    submitGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    submitText: {
        fontSize: 16,
        fontWeight: '800',
        color: COLORS.white,
    },

    // Divider
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

    // Social
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
