import React, { useRef, useState, useEffect } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    SafeAreaView,
    Platform,
    StatusBar,
    Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

interface Props {
    onNext: (role: 'seeker' | 'owner') => void;
    onBack: () => void;
}

export default function RoleSelectionScreen({ onNext, onBack }: Props) {
    const [selectedRole, setSelectedRole] = useState<'seeker' | 'owner' | null>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, []);

    const handleNext = () => {
        if (selectedRole) {
            onNext(selectedRole);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={onBack}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={styles.backButton}
                >
                    <Ionicons name="chevron-back" size={28} color="#000" />
                </TouchableOpacity>
            </View>

            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <Text style={styles.title}>What are you{'\n'}looking for?</Text>
                <Text style={styles.subtitle}>
                    This will help improve your{'\n'}experience in Swipelease
                </Text>

                <View style={styles.cardsRow}>
                    <TouchableOpacity
                        style={[
                            styles.roleCard,
                            selectedRole === 'seeker' && styles.roleCardSelected,
                        ]}
                        onPress={() => setSelectedRole('seeker')}
                        activeOpacity={0.8}
                    >
                        <View style={styles.iconWrapper}>
                            <Ionicons 
                                name="accessibility-outline" 
                                size={48} 
                                color={selectedRole === 'seeker' ? colors.primary : '#333'} 
                            />
                        </View>
                        <Text style={[
                            styles.roleCardText,
                            selectedRole === 'seeker' && styles.roleCardTextSelected
                        ]}>
                            Sublease
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.roleCard,
                            selectedRole === 'owner' && styles.roleCardSelected,
                        ]}
                        onPress={() => setSelectedRole('owner')}
                        activeOpacity={0.8}
                    >
                        <View style={styles.iconWrapper}>
                            <Ionicons 
                                name="home-outline" 
                                size={48} 
                                color={selectedRole === 'owner' ? colors.primary : '#333'} 
                            />
                        </View>
                        <Text style={[
                            styles.roleCardText,
                            selectedRole === 'owner' && styles.roleCardTextSelected
                        ]}>
                            Rent
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {/* Footer Buttons */}
            <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
                <TouchableOpacity
                    style={[styles.nextButton, !selectedRole && styles.nextButtonDisabled]}
                    onPress={handleNext}
                    disabled={!selectedRole}
                    activeOpacity={0.8}
                >
                    <Text style={styles.nextButtonText}>Next</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.skipButton}
                    onPress={() => onNext('seeker')} // Default fallback if they skip
                    activeOpacity={0.8}
                >
                    <Text style={styles.skipButtonText}>Skip</Text>
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
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    content: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 16,
    },
    title: {
        fontSize: 34,
        fontWeight: '900',
        color: '#000000',
        letterSpacing: -0.5,
        lineHeight: 40,
    },
    subtitle: {
        fontSize: 18,
        color: '#717171',
        marginTop: 12,
        marginBottom: 40,
        lineHeight: 24,
        fontWeight: '400',
    },
    cardsRow: {
        flexDirection: 'row',
        gap: 16,
        justifyContent: 'center',
    },
    roleCard: {
        flex: 1,
        aspectRatio: 0.9,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#CCCCCC',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    roleCardSelected: {
        borderColor: '#000000',
        borderWidth: 2,
    },
    iconWrapper: {
        marginBottom: 16,
    },
    roleCardText: {
        fontSize: 17,
        fontWeight: '500',
        color: '#333333',
    },
    roleCardTextSelected: {
        color: '#000000',
        fontWeight: '600',
    },
    footer: {
        paddingHorizontal: 32,
        paddingBottom: Platform.OS === 'ios' ? 34 : 24,
        paddingTop: 16,
        backgroundColor: '#FFFFFF',
        gap: 12,
    },
    nextButton: {
        backgroundColor: '#C50A15',
        borderRadius: 24,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nextButtonDisabled: {
        backgroundColor: '#EBEBEB',
    },
    nextButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    skipButton: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#A0A0A0',
    },
    skipButtonText: {
        color: '#A0A0A0',
        fontSize: 17,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
});
