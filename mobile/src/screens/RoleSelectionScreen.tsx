import React, { useRef } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    Platform,
    StatusBar,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = {
    primary: '#FF5A5F',
    primaryDark: '#E04850',
    bg: '#FFFFFF',
    card: '#FFFFFF',
    cardBorder: '#EBEBEB',
    white: '#FFFFFF',
    text: '#222222',
    muted: '#717171',
    seekerAccent: '#FF5A5F',
    ownerAccent: '#FF5A5F',
};

interface Props {
    onSelectRole: (role: 'seeker' | 'owner') => void;
}

function RoleCard({
    title,
    subtitle,
    icon,
    accentColor,
    onPress,
    delay,
}: {
    title: string;
    subtitle: string;
    icon: string;
    accentColor: string;
    onPress: () => void;
    delay: number;
}) {
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                delay,
                tension: 60,
                friction: 8,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                delay,
                duration: 400,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
            <TouchableOpacity
                style={styles.roleCard}
                onPress={onPress}
                activeOpacity={0.85}
            >
                <View style={styles.roleCardInner}>
                    <View style={[styles.iconCircle, { backgroundColor: accentColor + '15' }]}>
                        <Ionicons name={icon as any} size={36} color={accentColor} />
                    </View>
                    <Text style={styles.roleCardTitle}>{title}</Text>
                    <Text style={styles.roleCardSubtitle}>{subtitle}</Text>
                    <View style={[styles.arrowCircle, { backgroundColor: accentColor }]}>
                        <Ionicons name="arrow-forward" size={20} color="#FFF" />
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function RoleSelectionScreen({ onSelectRole }: Props) {
    const titleOpacity = useRef(new Animated.Value(0)).current;
    const titleTranslate = useRef(new Animated.Value(-20)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(titleOpacity, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(titleTranslate, {
                toValue: 0,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Background decorative circles */}
            <View style={styles.bgCircle1} />
            <View style={styles.bgCircle2} />

            <Animated.View
                style={[
                    styles.headerSection,
                    { opacity: titleOpacity, transform: [{ translateY: titleTranslate }] },
                ]}
            >
                <Text style={styles.logoText}>Roomie</Text>
                <Text style={styles.tagline}>Find your perfect space</Text>
            </Animated.View>

            <View style={styles.cardsSection}>
                <Text style={styles.chooseText}>I am a...</Text>

                <RoleCard
                    title="Room Seeker"
                    subtitle="Browse available rooms and find your perfect sublease"
                    icon="search"
                    accentColor={COLORS.primary}
                    onPress={() => onSelectRole('seeker')}
                    delay={200}
                />

                <RoleCard
                    title="Room Owner"
                    subtitle="List your property and find reliable subtenants"
                    icon="home"
                    accentColor={COLORS.primary}
                    onPress={() => onSelectRole('owner')}
                    delay={400}
                />
            </View>

            <Animated.View style={[styles.footerSection, { opacity: titleOpacity }]}>
                <Text style={styles.footerText}>
                    By continuing, you agree to our Terms & Privacy Policy
                </Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 32 : 60,
    },

    // Background decorative elements
    bgCircle1: {
        position: 'absolute',
        top: -80,
        right: -60,
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: 'rgba(255,90,95,0.05)',
    },
    bgCircle2: {
        position: 'absolute',
        bottom: -40,
        left: -80,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(255,90,95,0.05)',
    },

    // Header
    headerSection: {
        alignItems: 'center',
        paddingTop: 20,
        paddingBottom: 10,
    },
    logoText: {
        fontSize: 38,
        fontWeight: '900',
        color: COLORS.primary,
        letterSpacing: -1,
    },
    tagline: {
        fontSize: 15,
        color: COLORS.muted,
        marginTop: 6,
        fontWeight: '500',
    },

    // Cards section
    cardsSection: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 18,
    },
    chooseText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.muted,
        textTransform: 'uppercase',
        letterSpacing: 2,
        textAlign: 'center',
        marginBottom: 8,
    },

    // Role card
    roleCard: {
        borderRadius: 20,
        backgroundColor: COLORS.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    roleCardInner: {
        padding: 28,
        alignItems: 'center',
        gap: 10,
    },
    iconCircle: {
        width: 68,
        height: 68,
        borderRadius: 34,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    roleCardTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: COLORS.text,
        letterSpacing: -0.3,
    },
    roleCardSubtitle: {
        fontSize: 14,
        color: COLORS.muted,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 10,
    },
    arrowCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },

    // Footer
    footerSection: {
        alignItems: 'center',
        paddingBottom: 36,
        paddingHorizontal: 40,
    },
    footerText: {
        fontSize: 12,
        color: COLORS.muted,
        textAlign: 'center',
    },
});
