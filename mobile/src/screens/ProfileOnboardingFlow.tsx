import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { FullscreenBuckyLoading } from '../components/FullscreenBuckyLoading';
import type { AuthUser } from '../lib/auth';
import { ensureProfileRecord } from '../lib/profile';
import {
  fetchProfileMe,
  getExpoPublicApiUrl,
  patchProfileMe,
  patchSeekerPrefsMe,
  type ProfileMeDto,
} from '../api/subadgerApi';
import { profileOnboardingKey } from '../storageKeys';

const { width: SCREEN_W } = Dimensions.get('window');

const YEARS = Array.from({ length: 3 }, (_, index) => new Date().getFullYear() + index);
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const ROOMS = ['Studio', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;
const BATHS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;
const GENDERS = ['Men only', 'Women only', 'Do not matter', 'Gender free'] as const;
const LOCATION_PRESETS = [
  'State street',
  'Memorial Union',
  'Science Hall',
  'Union South',
  'Nicholas',
  'Morgridge Hall',
] as const;

const CTA_RED = '#D90416';
const CTA_RED_PRESSED = '#B80615';
const PROGRESS_ORANGE = '#FF7A00';
const PILL_BORDER = '#D9D9D9';
const PILL_SELECTED_BORDER = '#FF8A3D';
const SEEKER_ONBOARDING_VERSION = 3;
const OWNER_ONBOARDING_VERSION = 2;
const BUDGET_SLIDER_MIN = 300;
const BUDGET_SLIDER_MAX = 2200;
const BUDGET_SLIDER_STEP = 50;
const DEFAULT_BUDGET_MIN = 300;
const DEFAULT_BUDGET_MAX = 1500;

type RoomLabel = (typeof ROOMS)[number];
type BathLabel = (typeof BATHS)[number];
type GenderLabel = (typeof GENDERS)[number];
type ProfileOnboardingMode = 'required' | 'edit';

export type ProfileOnboardingFlowProps = {
  user: AuthUser;
  onFinished: () => void;
  mode?: ProfileOnboardingMode;
  onBack?: () => void;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roomToApiLabel(room: RoomLabel): string {
  const map: Record<RoomLabel, string> = {
    Studio: 'Studio',
    One: '1BR',
    Two: '2BR',
    Three: '3BR',
    Four: '4BR',
    Five: '5BR',
    Six: '6BR',
  };
  return map[room];
}

function roomFromApiLabel(raw?: string | null): RoomLabel {
  switch ((raw ?? '').trim().toUpperCase()) {
    case '1BR':
      return 'One';
    case '2BR':
      return 'Two';
    case '3BR':
      return 'Three';
    case '4BR':
      return 'Four';
    case '5BR':
      return 'Five';
    case '6BR':
      return 'Six';
    default:
      return 'Studio';
  }
}

function bathFromPrefs(raw: unknown): BathLabel {
  if (typeof raw !== 'string') return 'One';
  return (BATHS as readonly string[]).includes(raw) ? (raw as BathLabel) : 'One';
}

function genderToApi(gender: GenderLabel): string {
  if (gender === 'Men only') return 'Male';
  if (gender === 'Women only') return 'Female';
  return 'Any';
}

function genderFromProfile(me: ProfileMeDto): GenderLabel {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  const storedLabel = roommatePrefs.gender_label ?? roommatePrefs.roommate_gender;
  if (typeof storedLabel === 'string' && (GENDERS as readonly string[]).includes(storedLabel)) {
    return storedLabel as GenderLabel;
  }
  if (me.seeker?.gender_pref === 'Male') return 'Men only';
  if (me.seeker?.gender_pref === 'Female') return 'Women only';
  return 'Do not matter';
}

function stayEndFromStart(year: number, month: number): string {
  const end = new Date(year, month - 1 + 6, 0);
  return `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
}

function formatCurrencyInput(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return String(parseInt(digits, 10));
}

function parseMoveDate(me: ProfileMeDto, isSeeker: boolean) {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  const rawYear = !isSeeker && typeof roommatePrefs.move_out_year === 'number' ? roommatePrefs.move_out_year : null;
  const rawMonth =
    !isSeeker && typeof roommatePrefs.move_out_month === 'number' ? roommatePrefs.move_out_month : null;
  const fallback = { year: YEARS[0], month: 1 };

  if (typeof rawYear === 'number' && typeof rawMonth === 'number') {
    return {
      year: YEARS.includes(rawYear) ? rawYear : fallback.year,
      month: clamp(Math.round(rawMonth), 1, 12),
    };
  }

  const start = me.seeker?.stay_start_date;
  if (!start) return fallback;
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return fallback;

  const parsedYear = parsed.getFullYear();
  return {
    year: YEARS.includes(parsedYear) ? parsedYear : fallback.year,
    month: clamp(parsed.getMonth() + 1, 1, 12),
  };
}

function parseLocations(me: ProfileMeDto, isSeeker: boolean) {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  const seekerNeighborhoods = me.seeker?.prefs?.preferred_neighborhoods;
  const ownerLocations = roommatePrefs.preferred_locations;
  const source = isSeeker ? seekerNeighborhoods : ownerLocations;

  if (Array.isArray(source)) {
    const cleaned = source.filter(item => typeof item === 'string' && item.trim().length > 0);
    if (cleaned.length > 0) return cleaned as string[];
  }

  return ['State street'];
}

function parseRoom(me: ProfileMeDto, isSeeker: boolean) {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  const stored = isSeeker ? me.seeker?.room_type_pref : roommatePrefs.room_type_pref;
  return roomFromApiLabel(typeof stored === 'string' ? stored : undefined);
}

function parseBaseRent(me: ProfileMeDto) {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  const explicit = roommatePrefs.base_rent;
  if (typeof explicit === 'number' && explicit > 0) return String(explicit);
  return '1350';
}

function parseNegotiable(me: ProfileMeDto) {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  return typeof roommatePrefs.price_negotiable === 'boolean' ? roommatePrefs.price_negotiable : true;
}

function parseRoommateCount(me: ProfileMeDto) {
  const roommatePrefs = me.roommate_prefs as Record<string, unknown>;
  if (typeof roommatePrefs.roommate_count === 'number') {
    return clamp(Math.round(roommatePrefs.roommate_count), 0, 6);
  }
  return 1;
}

function snapBudgetValue(value: number) {
  const clamped = clamp(value, BUDGET_SLIDER_MIN, BUDGET_SLIDER_MAX);
  const offset = clamped - BUDGET_SLIDER_MIN;
  const snapped = BUDGET_SLIDER_MIN + Math.round(offset / BUDGET_SLIDER_STEP) * BUDGET_SLIDER_STEP;
  return clamp(snapped, BUDGET_SLIDER_MIN, BUDGET_SLIDER_MAX);
}

function normalizeBudgetRange(minCandidate: number, maxCandidate: number) {
  const nextMin = snapBudgetValue(
    clamp(minCandidate, BUDGET_SLIDER_MIN, BUDGET_SLIDER_MAX - BUDGET_SLIDER_STEP),
  );
  const nextMax = snapBudgetValue(clamp(maxCandidate, nextMin + BUDGET_SLIDER_STEP, BUDGET_SLIDER_MAX));
  return { min: nextMin, max: Math.max(nextMin + BUDGET_SLIDER_STEP, nextMax) };
}

function parseBudgetRange(me: ProfileMeDto) {
  const rawMin =
    typeof me.seeker?.budget_min === 'number' && me.seeker.budget_min > 0
      ? me.seeker.budget_min
      : DEFAULT_BUDGET_MIN;
  const rawMax =
    typeof me.seeker?.budget_max === 'number' && me.seeker.budget_max > 0
      ? me.seeker.budget_max
      : DEFAULT_BUDGET_MAX;
  return normalizeBudgetRange(rawMin, rawMax);
}

function parseBudgetValue(raw: string, fallback: number) {
  const digits = parseInt(raw.replace(/\D/g, ''), 10);
  return Number.isFinite(digits) ? digits : fallback;
}

function StepProgress({ step, totalSteps }: { step: number; totalSteps: number }) {
  const progress = useRef(new Animated.Value((step + 1) / totalSteps)).current;
  const [trackWidth, setTrackWidth] = useState(SCREEN_W);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (step + 1) / totalSteps,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, step, totalSteps]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredWidth = event.nativeEvent.layout.width;
    if (measuredWidth > 0 && measuredWidth !== trackWidth) {
      setTrackWidth(measuredWidth);
    }
  }, [trackWidth]);

  const animatedWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth],
  });

  return (
    <View style={styles.progressTrack} onLayout={handleTrackLayout}>
      <Animated.View style={[styles.progressFill, { width: animatedWidth }]} />
    </View>
  );
}

function TouchableBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]} onPress={onPress}>
      <Ionicons name="chevron-back" size={28} color="#222" />
    </Pressable>
  );
}

function StepHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View>
      <TouchableBack onPress={onBack} />
      <Text style={styles.question}>{title}</Text>
    </View>
  );
}

function PillOption({
  label,
  selected,
  compact,
  onPress,
}: {
  label: string;
  selected: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        compact ? styles.pillCompact : styles.pill,
        selected && styles.pillSelected,
        pressed && styles.pillPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FooterButtons({
  onNext,
  onSkip,
  disabled,
}: {
  onNext: () => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.footer}>
      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && styles.primaryBtnPressed,
          disabled && styles.footerBtnDisabled,
        ]}
        onPress={onNext}
        disabled={disabled}
      >
        <Text style={styles.primaryBtnText}>Next</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.secondaryBtn,
          pressed && styles.secondaryBtnPressed,
          disabled && styles.footerBtnDisabled,
        ]}
        onPress={onSkip}
        disabled={disabled}
      >
        <Text style={styles.secondaryBtnText}>Skip</Text>
      </Pressable>
    </View>
  );
}

function BudgetInputField({
  value,
  onChangeText,
  onBlur,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <View style={styles.budgetInputShell}>
      <Text style={styles.budgetInputPrefix}>$</Text>
      <TextInput
        style={styles.budgetInput}
        keyboardType="number-pad"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder="300"
        placeholderTextColor="#B0B0B0"
      />
    </View>
  );
}

function BudgetRangeSlider({
  minValue,
  maxValue,
  onChange,
  disabled,
}: {
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  disabled?: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const minValueRef = useRef(minValue);
  const maxValueRef = useRef(maxValue);
  const minStartPositionRef = useRef(0);
  const maxStartPositionRef = useRef(0);

  useEffect(() => {
    minValueRef.current = minValue;
    maxValueRef.current = maxValue;
  }, [maxValue, minValue]);

  const budgetToPosition = useCallback(
    (value: number) => {
      if (trackWidth <= 0) return 0;
      return ((value - BUDGET_SLIDER_MIN) / (BUDGET_SLIDER_MAX - BUDGET_SLIDER_MIN)) * trackWidth;
    },
    [trackWidth],
  );

  const positionToBudget = useCallback(
    (position: number) => {
      if (trackWidth <= 0) return BUDGET_SLIDER_MIN;
      const ratio = clamp(position / trackWidth, 0, 1);
      const rawValue = BUDGET_SLIDER_MIN + ratio * (BUDGET_SLIDER_MAX - BUDGET_SLIDER_MIN);
      return snapBudgetValue(rawValue);
    },
    [trackWidth],
  );

  const updateMinFromPosition = useCallback(
    (position: number) => {
      const nextValue = positionToBudget(position);
      const normalized = normalizeBudgetRange(nextValue, maxValueRef.current);
      onChange(normalized.min, normalized.max);
    },
    [onChange, positionToBudget],
  );

  const updateMaxFromPosition = useCallback(
    (position: number) => {
      const nextValue = positionToBudget(position);
      const normalized = normalizeBudgetRange(minValueRef.current, nextValue);
      onChange(normalized.min, normalized.max);
    },
    [onChange, positionToBudget],
  );

  const minResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          minStartPositionRef.current = budgetToPosition(minValueRef.current);
        },
        onPanResponderMove: (_, gestureState) => {
          updateMinFromPosition(minStartPositionRef.current + gestureState.dx);
        },
      }),
    [budgetToPosition, disabled, updateMinFromPosition],
  );

  const maxResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          maxStartPositionRef.current = budgetToPosition(maxValueRef.current);
        },
        onPanResponderMove: (_, gestureState) => {
          updateMaxFromPosition(maxStartPositionRef.current + gestureState.dx);
        },
      }),
    [budgetToPosition, disabled, updateMaxFromPosition],
  );

  const handleTrackPress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled || trackWidth <= 0) return;
      const x = event.nativeEvent.locationX;
      const minPosition = budgetToPosition(minValue);
      const maxPosition = budgetToPosition(maxValue);
      if (Math.abs(x - minPosition) <= Math.abs(x - maxPosition)) {
        updateMinFromPosition(x);
      } else {
        updateMaxFromPosition(x);
      }
    },
    [budgetToPosition, disabled, maxValue, minValue, trackWidth, updateMaxFromPosition, updateMinFromPosition],
  );

  const minHandleLeft = budgetToPosition(minValue);
  const maxHandleLeft = budgetToPosition(maxValue);
  const selectedLeft = Math.min(minHandleLeft, maxHandleLeft);
  const selectedWidth = Math.max(maxHandleLeft - minHandleLeft, 0);

  return (
    <View style={styles.sliderWrap}>
      <Pressable
        style={styles.sliderPressArea}
        onPress={handleTrackPress}
        onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderTrackSelected, { left: selectedLeft, width: selectedWidth }]} />

        <View style={[styles.sliderHandleHitbox, { left: minHandleLeft - 16 }]} {...minResponder.panHandlers}>
          <View style={styles.sliderHandle} />
        </View>

        <View style={[styles.sliderHandleHitbox, { left: maxHandleLeft - 16 }]} {...maxResponder.panHandlers}>
          <View style={styles.sliderHandle} />
        </View>
      </Pressable>
    </View>
  );
}

export default function ProfileOnboardingFlow({
  user,
  onFinished,
  mode = 'required',
  onBack,
}: ProfileOnboardingFlowProps) {
  const isSeeker = user.role === 'seeker';
  const totalSteps = 5;
  const storageKey = profileOnboardingKey(user.id, isSeeker ? 'seeker' : 'owner');
  const topPad = Platform.OS === 'ios' ? 58 : (StatusBar.currentHeight ?? 0) + 18;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(Boolean(getExpoPublicApiUrl()));
  const [saving, setSaving] = useState(false);

  const [year, setYear] = useState(YEARS[0]);
  const [month, setMonth] = useState(1);
  const [room, setRoom] = useState<RoomLabel>('Studio');
  const [bath, setBath] = useState<BathLabel>('One');
  const [roommateCount, setRoommateCount] = useState(1);
  const [gender, setGender] = useState<GenderLabel>('Do not matter');
  const [locSearch, setLocSearch] = useState('');
  const [locations, setLocations] = useState<string[]>(['State street']);
  const [baseRent, setBaseRent] = useState('1350');
  const [negotiable, setNegotiable] = useState(true);
  const [budgetMin, setBudgetMin] = useState(String(DEFAULT_BUDGET_MIN));
  const [budgetMax, setBudgetMax] = useState(String(DEFAULT_BUDGET_MAX));

  useEffect(() => {
    let cancelled = false;

    if (!getExpoPublicApiUrl()) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadExistingPreferences = async () => {
      setLoading(true);
      try {
        await ensureProfileRecord(user);
        const me = await fetchProfileMe(user.id);
        if (cancelled) return;

        const moveDate = parseMoveDate(me, isSeeker);
        const budgetRange = parseBudgetRange(me);

        setYear(moveDate.year);
        setMonth(moveDate.month);
        setRoom(parseRoom(me, isSeeker));
        setBath(bathFromPrefs((me.roommate_prefs as Record<string, unknown>).bath_count));
        setRoommateCount(parseRoommateCount(me));
        setGender(genderFromProfile(me));
        setLocations(parseLocations(me, isSeeker));
        setBaseRent(parseBaseRent(me));
        setNegotiable(parseNegotiable(me));
        setBudgetMin(String(budgetRange.min));
        setBudgetMax(String(budgetRange.max));
      } catch (error) {
        console.warn('Could not preload onboarding preferences', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadExistingPreferences();
    return () => {
      cancelled = true;
    };
  }, [isSeeker, user]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(current => current - 1);
      return;
    }
    if (mode === 'edit' && onBack) {
      onBack();
      return;
    }
    Alert.alert(
      'Set your preferences',
      isSeeker
        ? 'Finish these sublease preferences before you start swiping.'
        : 'Finish these listing preferences before you continue.',
    );
  }, [isSeeker, mode, onBack, step]);

  const toggleLocation = useCallback((label: string) => {
    setLocations(current =>
      current.includes(label) ? current.filter(item => item !== label) : [...current, label],
    );
  }, []);

  const addSearchLocation = useCallback(() => {
    const trimmed = locSearch.trim();
    if (!trimmed) return;
    setLocations(current => (current.includes(trimmed) ? current : [...current, trimmed]));
    setLocSearch('');
  }, [locSearch]);

  const next = useCallback(() => {
    if (step === totalSteps - 1) return;
    setStep(current => current + 1);
  }, [step, totalSteps]);

  const skip = useCallback(() => {
    if (step === totalSteps - 1) return;
    setStep(current => current + 1);
  }, [step, totalSteps]);

  const normalizeBudgetInputs = useCallback(() => {
    const normalized = normalizeBudgetRange(
      parseBudgetValue(budgetMin, DEFAULT_BUDGET_MIN),
      parseBudgetValue(budgetMax, DEFAULT_BUDGET_MAX),
    );
    setBudgetMin(String(normalized.min));
    setBudgetMax(String(normalized.max));
    return normalized;
  }, [budgetMax, budgetMin]);

  const handleBudgetRangeChange = useCallback((nextMin: number, nextMax: number) => {
    setBudgetMin(String(nextMin));
    setBudgetMax(String(nextMax));
  }, []);

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      await ensureProfileRecord(user);
      const api = getExpoPublicApiUrl();

      if (api && isSeeker) {
        const budgets = normalizeBudgetRange(
          parseBudgetValue(budgetMin, DEFAULT_BUDGET_MIN),
          parseBudgetValue(budgetMax, DEFAULT_BUDGET_MAX),
        );
        const neighborhoods = locations.length > 0 ? locations : ['State street'];

        setBudgetMin(String(budgets.min));
        setBudgetMax(String(budgets.max));

        await patchProfileMe({
          user_id: user.id,
          display_name: user.name,
          roommate_prefs: {
            onboarding_version: SEEKER_ONBOARDING_VERSION,
            bath_count: bath,
            gender_label: gender,
            preferred_locations: neighborhoods,
          },
        });

        await patchSeekerPrefsMe({
          user_id: user.id,
          budget_min: budgets.min,
          budget_max: budgets.max,
          stay_start_date: `${year}-${pad2(month)}-01`,
          stay_end_date: stayEndFromStart(year, month),
          room_type_pref: roomToApiLabel(room),
          gender_pref: genderToApi(gender),
          prefs: { preferred_neighborhoods: neighborhoods },
        });
      } else if (api) {
        const rentValue = parseInt(baseRent.replace(/\D/g, ''), 10);
        if (!Number.isFinite(rentValue) || rentValue <= 0) {
          throw new Error('Enter a valid monthly rent before continuing.');
        }

        const neighborhoods = locations.length > 0 ? locations : ['State street'];

        await patchProfileMe({
          user_id: user.id,
          display_name: user.name,
          roommate_prefs: {
            onboarding_version: OWNER_ONBOARDING_VERSION,
            move_out_year: year,
            move_out_month: month,
            room_type_pref: roomToApiLabel(room),
            bath_count: bath,
            roommate_count: roommateCount,
            roommate_gender: gender,
            preferred_locations: neighborhoods,
            price_negotiable: negotiable,
            base_rent: rentValue,
          },
        });
      }

      await AsyncStorage.setItem(storageKey, '1');
      onFinished();
    } catch (error) {
      Alert.alert(
        'Could not save preferences',
        error instanceof Error
          ? error.message
          : 'Please try again after checking your connection.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    baseRent,
    bath,
    budgetMax,
    budgetMin,
    gender,
    isSeeker,
    locations,
    negotiable,
    onFinished,
    roommateCount,
    room,
    storageKey,
    user,
    year,
    month,
  ]);

  const screenTitle = useMemo(() => {
    if (isSeeker) {
      if (step === 0) return 'When do you\nexpect to\nmove in?';
      if (step === 1) return 'What are you\nlooking for?';
      if (step === 2) return 'What is your\ngender\npreference?';
      if (step === 3) return 'Where do you\nwant to be?';
      return 'What is your\nbudget?';
    }

    if (step === 0) return 'When do you\nexpect to\nmove out?';
    if (step === 1) return 'What is your\nroom type?';
    if (step === 2) return 'Do you have\nroommates?';
    if (step === 3) return 'Where are you\nlocated?';
    return 'Set your price';
  }, [isSeeker, step]);

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <StepProgress step={step} totalSteps={totalSteps} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepHeader title={screenTitle} onBack={handleBack} />

        {step === 0 ? (
          <>
            <Text style={styles.sectionLabel}>Year</Text>
            <View style={styles.pillRow}>
              {YEARS.map(option => (
                <PillOption
                  key={option}
                  label={String(option)}
                  selected={year === option}
                  onPress={() => setYear(option)}
                />
              ))}
            </View>

            <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Month</Text>
            <View style={styles.pillWrap}>
              {MONTHS.map(option => (
                <PillOption
                  key={option}
                  label={String(option)}
                  selected={month === option}
                  compact
                  onPress={() => setMonth(option)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.sectionLabel}>Room</Text>
            <View style={styles.pillWrap}>
              {ROOMS.map(option => (
                <PillOption
                  key={option}
                  label={option}
                  selected={room === option}
                  compact
                  onPress={() => setRoom(option)}
                />
              ))}
            </View>

            <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Bath</Text>
            <View style={styles.pillWrap}>
              {BATHS.map(option => (
                <PillOption
                  key={option}
                  label={option}
                  selected={bath === option}
                  compact
                  onPress={() => setBath(option)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 2 && isSeeker ? (
          <View style={styles.pillColumn}>
            {GENDERS.map(option => (
              <PillOption
                key={option}
                label={option}
                selected={gender === option}
                onPress={() => setGender(option)}
              />
            ))}
          </View>
        ) : null}

        {step === 2 && !isSeeker ? (
          <>
            <Text style={styles.sectionLabel}>Roommate Count</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                onPress={() => setRoommateCount(current => Math.max(0, current - 1))}
              >
                <Ionicons name="remove" size={18} color="#8A8A8A" />
              </Pressable>
              <View style={styles.stepperValueWrap}>
                <Text style={styles.stepperValue}>{roommateCount}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                onPress={() => setRoommateCount(current => Math.min(6, current + 1))}
              >
                <Ionicons name="add" size={18} color="#8A8A8A" />
              </Pressable>
            </View>

            <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Gender</Text>
            <View style={styles.pillColumn}>
              {GENDERS.map(option => (
                <PillOption
                  key={option}
                  label={option}
                  selected={gender === option}
                  onPress={() => setGender(option)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <View style={styles.searchShell}>
              <TextInput
                style={styles.searchInput}
                placeholder="Find a location"
                placeholderTextColor="#B0B0B0"
                value={locSearch}
                onChangeText={setLocSearch}
                onSubmitEditing={addSearchLocation}
                returnKeyType="search"
              />
              <Pressable onPress={addSearchLocation} hitSlop={8}>
                <Ionicons name="search-outline" size={19} color="#A0A0A0" />
              </Pressable>
            </View>

            <View style={styles.pillWrap}>
              {LOCATION_PRESETS.map(option => (
                <PillOption
                  key={option}
                  label={option}
                  selected={locations.includes(option)}
                  compact
                  onPress={() => toggleLocation(option)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 4 && isSeeker ? (
          <>
            <View style={styles.budgetRow}>
              <BudgetInputField
                value={budgetMin}
                onChangeText={value => setBudgetMin(formatCurrencyInput(value))}
                onBlur={normalizeBudgetInputs}
              />
              <Text style={styles.budgetDash}>-</Text>
              <BudgetInputField
                value={budgetMax}
                onChangeText={value => setBudgetMax(formatCurrencyInput(value))}
                onBlur={normalizeBudgetInputs}
              />
            </View>

            <BudgetRangeSlider
              minValue={normalizeBudgetRange(
                parseBudgetValue(budgetMin, DEFAULT_BUDGET_MIN),
                parseBudgetValue(budgetMax, DEFAULT_BUDGET_MAX),
              ).min}
              maxValue={normalizeBudgetRange(
                parseBudgetValue(budgetMin, DEFAULT_BUDGET_MIN),
                parseBudgetValue(budgetMax, DEFAULT_BUDGET_MAX),
              ).max}
              onChange={handleBudgetRangeChange}
              disabled={loading || saving}
            />
          </>
        ) : null}

        {step === 4 && !isSeeker ? (
          <>
            <Text style={styles.sectionLabel}>Base Rent</Text>
            <View style={styles.priceField}>
              <Text style={styles.priceFieldPrefix}>$</Text>
              <TextInput
                style={styles.priceFieldInput}
                keyboardType="number-pad"
                value={baseRent}
                onChangeText={value => setBaseRent(formatCurrencyInput(value))}
                placeholder="1,350"
                placeholderTextColor="#B0B0B0"
              />
            </View>

            <Text style={[styles.sectionLabel, styles.sectionSpacing]}>Are you willing to negotiate?</Text>
            <Pressable
              style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
              onPress={() => setNegotiable(true)}
            >
              <View style={[styles.checkboxBox, negotiable && styles.checkboxBoxSelected]}>
                {negotiable ? <Ionicons name="checkmark" size={15} color={CTA_RED} /> : null}
              </View>
              <Text style={styles.checkboxText}>Yes. I am willing to get negotiation offers.</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.checkboxRow, pressed && styles.checkboxRowPressed]}
              onPress={() => setNegotiable(false)}
            >
              <View style={[styles.checkboxBox, !negotiable && styles.checkboxBoxSelected]}>
                {!negotiable ? <Ionicons name="checkmark" size={15} color={CTA_RED} /> : null}
              </View>
              <Text style={[styles.checkboxText, !negotiable ? styles.checkboxTextStrong : styles.checkboxTextMuted]}>
                No. I am not changing my base price
              </Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.footerSpacer} />
      </ScrollView>

      <FooterButtons
        onNext={step === totalSteps - 1 ? () => void finish() : next}
        onSkip={step === totalSteps - 1 ? () => void finish() : skip}
        disabled={loading || saving}
      />

      <FullscreenBuckyLoading visible={loading || saving} size={96} swing={26} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  progressTrack: {
    width: SCREEN_W,
    height: 4,
    backgroundColor: '#ECECEC',
  },
  progressFill: {
    height: 4,
    backgroundColor: PROGRESS_ORANGE,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 16,
  },
  backBtnPressed: {
    opacity: 0.6,
  },
  question: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '800',
    color: '#0F0F0F',
    letterSpacing: -0.9,
    marginBottom: 34,
    maxWidth: 260,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#232323',
    marginBottom: 12,
  },
  sectionSpacing: {
    marginTop: 26,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pillColumn: {
    gap: 12,
  },
  pill: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PILL_BORDER,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillCompact: {
    minHeight: 32,
    minWidth: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PILL_BORDER,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    borderColor: PILL_SELECTED_BORDER,
  },
  pillPressed: {
    opacity: 0.82,
  },
  pillText: {
    fontSize: 15,
    color: '#9A9A9A',
    fontWeight: '500',
  },
  pillTextSelected: {
    color: '#1A1A1A',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperBtn: {
    width: 28,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E3E3E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPressed: {
    opacity: 0.8,
  },
  stepperValueWrap: {
    width: 66,
    height: 32,
    borderWidth: 1,
    borderColor: '#DCDCDC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stepperValue: {
    fontSize: 20,
    fontWeight: '500',
    color: '#171717',
  },
  searchShell: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E1E1E1',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#171717',
    paddingVertical: 8,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  budgetInputShell: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DADADA',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  budgetInputPrefix: {
    fontSize: 16,
    color: '#303030',
    marginRight: 4,
  },
  budgetInput: {
    flex: 1,
    fontSize: 16,
    color: '#171717',
    paddingVertical: 8,
  },
  budgetDash: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '500',
    color: '#323232',
  },
  sliderWrap: {
    paddingTop: 28,
    paddingHorizontal: 8,
  },
  sliderPressArea: {
    height: 32,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 3,
    borderRadius: 999,
    backgroundColor: '#D9D9D9',
  },
  sliderTrackSelected: {
    position: 'absolute',
    top: 14.5,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#FF3B4D',
  },
  sliderHandleHitbox: {
    position: 'absolute',
    top: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderHandle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADADA',
  },
  priceField: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#DADADA',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceFieldPrefix: {
    fontSize: 18,
    color: '#9A9A9A',
  },
  priceFieldInput: {
    flex: 1,
    fontSize: 16,
    color: '#171717',
    paddingVertical: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 16,
  },
  checkboxRowPressed: {
    opacity: 0.8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#D8D8D8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxSelected: {
    borderColor: CTA_RED,
  },
  checkboxText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#2B2B2B',
  },
  checkboxTextStrong: {
    color: '#2B2B2B',
  },
  checkboxTextMuted: {
    color: '#9E9E9E',
  },
  footerSpacer: {
    height: 160,
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: CTA_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: CTA_RED_PRESSED,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryBtn: {
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  secondaryBtnPressed: {
    backgroundColor: '#F7F7F7',
  },
  secondaryBtnText: {
    color: '#9A9A9A',
    fontSize: 18,
    fontWeight: '700',
  },
  footerBtnDisabled: {
    opacity: 0.55,
  },
});
