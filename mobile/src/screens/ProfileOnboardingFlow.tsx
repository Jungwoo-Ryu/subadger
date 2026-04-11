/**
 * Post-sign-in onboarding: marketing carousel + house rules + seeker preference wizard.
 * Matches SwipeLease-style flows; persists to API (seeker_profiles) when EXPO_PUBLIC_API_URL is set.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
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

import { BuckyLoading } from '../components/BuckyLoading';
import type { AuthUser } from '../lib/auth';
import { ensureProfileRecord } from '../lib/profile';
import {
  getExpoPublicApiUrl,
  patchProfileMe,
  patchSeekerPrefsMe,
} from '../api/subadgerApi';
import { profileOnboardingKey } from '../storageKeys';
import { colors, radii, space, type as t } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    key: '1',
    title: 'Set your preference',
    body: 'Budget, dates, and room type — we’ll surface listings that actually fit.',
  },
  {
    key: '2',
    title: 'Swipe',
    body: 'Browse sublets quickly. Pass what doesn’t work, like what does.',
  },
  {
    key: '3',
    title: 'Match',
    body: 'Send a short note with your like. When it’s mutual, chat opens.',
  },
];

const RULES = [
  { title: 'Be honest', body: 'Accurate dates and budget help everyone save time.' },
  { title: 'Do not ghost', body: 'If plans change, a quick message goes a long way.' },
  { title: 'Be friendly', body: 'Treat others the way you’d want roommates to treat you.' },
];

const YEARS = [2026, 2027, 2028];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const ROOMS = ['Studio', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;
const BATHS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;
const GENDERS = ['Men only', 'Women only', 'Do not matter', 'Gender free'] as const;
const LOCATION_PRESETS = [
  'State Street',
  'Memorial Union',
  'Science Hall',
  'Library Mall',
  'Bascom Hall',
  'Camp Randall',
];

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function roomToApiLabel(room: (typeof ROOMS)[number]): string {
  const map: Record<string, string> = {
    Studio: 'Studio',
    One: '1BR',
    Two: '2BR',
    Three: '3BR',
    Four: '4BR',
    Five: '5BR',
    Six: '6BR',
  };
  return map[room] ?? 'Studio';
}

function genderToApi(g: (typeof GENDERS)[number]): string {
  if (g === 'Men only') return 'Male';
  if (g === 'Women only') return 'Female';
  return 'Any';
}

function stayEndFromStart(year: number, month: number): string {
  const end = new Date(year, month - 1 + 6, 0);
  return `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
}

type Intent = 'sublease' | 'rent';

export type ProfileOnboardingFlowProps = {
  user: AuthUser;
  onFinished: () => void;
};

export default function ProfileOnboardingFlow({ user, onFinished }: ProfileOnboardingFlowProps) {
  const isSeeker = user.role === 'seeker';
  const listRef = useRef<FlatList>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [intent, setIntent] = useState<Intent>('sublease');
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(1);
  const [room, setRoom] = useState<(typeof ROOMS)[number]>('Studio');
  const [bath, setBath] = useState<(typeof BATHS)[number]>('One');
  const [gender, setGender] = useState<(typeof GENDERS)[number]>('Do not matter');
  const [locSearch, setLocSearch] = useState('');
  const [locations, setLocations] = useState<string[]>(['State Street']);
  const [budgetMin, setBudgetMin] = useState('300');
  const [budgetMax, setBudgetMax] = useState('1500');

  const storageKey = profileOnboardingKey(
    user.id,
    user.role === 'seeker' ? 'seeker' : 'owner',
  );

  const onCarouselScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setCarouselIndex(i);
  }, []);

  const carouselNext = () => {
    if (carouselIndex < SLIDES.length - 1) {
      const ni = carouselIndex + 1;
      listRef.current?.scrollToOffset({ offset: ni * SCREEN_W, animated: true });
      setCarouselIndex(ni);
    } else {
      setStep(1);
    }
  };

  const toggleLocation = (label: string) => {
    setLocations(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label],
    );
  };

  const addSearchLocation = () => {
    const t = locSearch.trim();
    if (!t) return;
    if (!locations.includes(t)) setLocations(prev => [...prev, t]);
    setLocSearch('');
  };

  /** Last step index: seeker budget (7); owner “all set” (2). */
  const maxStep = isSeeker ? 7 : 2;

  const skipSeekerStep = () => {
    if (!isSeeker) return;
    if (step < maxStep) setStep(s => s + 1);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await ensureProfileRecord(user);
      const api = getExpoPublicApiUrl();
      if (api && isSeeker) {
        const bmin = parseInt(budgetMin.replace(/\D/g, ''), 10) || 300;
        const bmax = parseInt(budgetMax.replace(/\D/g, ''), 10) || 1500;
        const lo = Math.min(bmin, bmax);
        const hi = Math.max(bmin, bmax);
        const start = `${year}-${pad2(month)}-01`;
        const end = stayEndFromStart(year, month);
        const neighborhoods = locations.length ? locations : ['Madison'];

        await patchProfileMe({
          user_id: user.id,
          display_name: user.name,
          roommate_prefs: {
            listing_intent: intent,
            bath_count: bath,
            onboarding_version: 1,
          },
        });
        await patchSeekerPrefsMe({
          user_id: user.id,
          budget_min: lo,
          budget_max: hi,
          stay_start_date: start,
          stay_end_date: end,
          room_type_pref: roomToApiLabel(room),
          gender_pref: genderToApi(gender),
          prefs: { preferred_neighborhoods: neighborhoods },
        });
      } else if (api && !isSeeker) {
        await patchProfileMe({
          user_id: user.id,
          display_name: user.name,
          roommate_prefs: { onboarding_version: 1 },
        });
      }
      /* Without EXPO_PUBLIC_API_URL, Supabase ensureProfileRecord still creates public.profiles. */
      await AsyncStorage.setItem(storageKey, '1');
      onFinished();
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error
          ? e.message
          : 'Check EXPO_PUBLIC_API_URL and try again, or use Retry after fixing the API.',
      );
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (isSeeker && step === maxStep) {
      void finish();
      return;
    }
    setStep(s => s + 1);
  };

  const topPad = Platform.OS === 'ios' ? 56 : StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 24;

  if (step === 0) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.key}
          onMomentumScrollEnd={onCarouselScroll}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: SCREEN_W }]}>
              <View style={styles.illus} />
              <Text style={styles.slideTitle}>{item.title}</Text>
              <Text style={styles.slideBody}>{item.body}</Text>
            </View>
          )}
        />
        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === carouselIndex && styles.dotActive]} />
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={carouselNext}
          >
            <Text style={styles.btnText}>
              {carouselIndex === SLIDES.length - 1 ? 'Get started' : 'Next'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 1) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.scrollPad, { paddingTop: topPad }]}>
        <Text style={styles.welcomeTitle}>Welcome to SubLease Match</Text>
        <Text style={styles.sectionLabel}>House rules</Text>
        {RULES.map(r => (
          <View key={r.title} style={styles.ruleCard}>
            <Text style={styles.ruleTitle}>{r.title}</Text>
            <Text style={styles.ruleBody}>{r.body}</Text>
          </View>
        ))}
        <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={next}>
          <Text style={styles.btnText}>I agree</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isSeeker) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: topPad, paddingHorizontal: space.lg }]}>
        <Text style={styles.welcomeTitle}>You’re all set</Text>
        <Text style={styles.slideBody}>
          Host tools use the Explore tab. You can add listing details from your dashboard flows.
        </Text>
        {saving ? (
          <BuckyLoading size={88} swing={24} />
        ) : (
          <Pressable
            style={({ pressed }) => [styles.btn, { marginTop: 28 }, pressed && styles.btnPressed]}
            onPress={() => void finish()}
          >
            <Text style={styles.btnText}>Enter app</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const footer = (showSkip: boolean) => (
    <View style={styles.rowFooter}>
      {showSkip ? (
        <Pressable onPress={skipSeekerStep} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      ) : (
        <View style={{ width: 72 }} />
      )}
      <Pressable
        style={({ pressed }) => [styles.btn, styles.btnFlex, pressed && styles.btnPressed]}
        onPress={next}
        disabled={saving}
      >
        <Text style={styles.btnText}>
          {isSeeker && step === maxStep ? 'Finish' : 'Next'}
        </Text>
      </Pressable>
    </View>
  );

  if (step === 2) {
    return (
      <View style={[styles.root, styles.fill, { paddingTop: topPad }]}>
        <Text style={styles.question}>What are you looking for?</Text>
        <View style={styles.intentRow}>
          <Pressable
            style={[styles.intentCard, intent === 'sublease' && styles.intentCardOn]}
            onPress={() => setIntent('sublease')}
          >
            <Text style={styles.intentEmoji}>👤</Text>
            <Text style={styles.intentLabel}>Sublease</Text>
          </Pressable>
          <Pressable
            style={[styles.intentCard, intent === 'rent' && styles.intentCardOn]}
            onPress={() => setIntent('rent')}
          >
            <Text style={styles.intentEmoji}>🏠</Text>
            <Text style={styles.intentLabel}>Rent</Text>
          </Pressable>
        </View>
        {footer(true)}
      </View>
    );
  }

  if (step === 3) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.scrollPad, { paddingTop: topPad }]}>
        <Text style={styles.question}>When do you expect to move in?</Text>
        <Text style={styles.subq}>Year</Text>
        <View style={styles.pillRow}>
          {YEARS.map(y => (
            <Pressable key={y} style={[styles.pill, year === y && styles.pillOn]} onPress={() => setYear(y)}>
              <Text style={[styles.pillText, year === y && styles.pillTextOn]}>{y}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.subq}>Month</Text>
        <View style={styles.pillWrap}>
          {MONTHS.map(m => (
            <Pressable key={m} style={[styles.pillSm, month === m && styles.pillOn]} onPress={() => setMonth(m)}>
              <Text style={[styles.pillText, month === m && styles.pillTextOn]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        {footer(true)}
      </ScrollView>
    );
  }

  if (step === 4) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.scrollPad, { paddingTop: topPad }]}>
        <Text style={styles.question}>What are you looking for?</Text>
        <Text style={styles.subq}>Bedrooms</Text>
        <View style={styles.pillWrap}>
          {ROOMS.map(r => (
            <Pressable key={r} style={[styles.pillSm, room === r && styles.pillOn]} onPress={() => setRoom(r)}>
              <Text style={[styles.pillText, room === r && styles.pillTextOn]}>{r}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.subq}>Bathrooms</Text>
        <View style={styles.pillWrap}>
          {BATHS.map(b => (
            <Pressable key={b} style={[styles.pillSm, bath === b && styles.pillOn]} onPress={() => setBath(b)}>
              <Text style={[styles.pillText, bath === b && styles.pillTextOn]}>{b}</Text>
            </Pressable>
          ))}
        </View>
        {footer(true)}
      </ScrollView>
    );
  }

  if (step === 5) {
    return (
      <View style={[styles.root, styles.fill, { paddingTop: topPad }]}>
        <Text style={styles.question}>What is your gender preference?</Text>
        <View style={styles.pillCol}>
          {GENDERS.map(g => (
            <Pressable
              key={g}
              style={[styles.pillWide, gender === g && styles.pillOn]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.pillText, gender === g && styles.pillTextOn]}>{g}</Text>
            </Pressable>
          ))}
        </View>
        {footer(true)}
      </View>
    );
  }

  if (step === 6) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[styles.scrollPad, { paddingTop: topPad }]}>
        <Text style={styles.question}>Where do you want to be?</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Find a location"
            placeholderTextColor={colors.subtle}
            value={locSearch}
            onChangeText={setLocSearch}
            onSubmitEditing={addSearchLocation}
          />
          <Pressable style={styles.addLocBtn} onPress={addSearchLocation}>
            <Text style={styles.addLocBtnText}>Add</Text>
          </Pressable>
        </View>
        <View style={styles.pillWrap}>
          {LOCATION_PRESETS.map(p => (
            <Pressable
              key={p}
              style={[styles.pillSm, locations.includes(p) && styles.pillOn]}
              onPress={() => toggleLocation(p)}
            >
              <Text style={[styles.pillText, locations.includes(p) && styles.pillTextOn]}>{p}</Text>
            </Pressable>
          ))}
        </View>
        {footer(true)}
      </ScrollView>
    );
  }

  if (step === 7) {
    return (
      <View style={[styles.root, { paddingTop: topPad, paddingHorizontal: space.lg }]}>
        <Text style={styles.question}>What is your budget?</Text>
        <View style={styles.budgetRow}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            style={styles.budgetInput}
            keyboardType="number-pad"
            value={budgetMin}
            onChangeText={setBudgetMin}
          />
          <Text style={styles.budgetTo}>to</Text>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            style={styles.budgetInput}
            keyboardType="number-pad"
            value={budgetMax}
            onChangeText={setBudgetMax}
          />
        </View>
        {saving ? (
          <BuckyLoading size={92} swing={26} />
        ) : (
          footer(false)
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  fill: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scrollPad: { paddingHorizontal: space.lg, paddingBottom: 40 },
  slide: { paddingHorizontal: space.lg, alignItems: 'center' },
  illus: {
    width: SCREEN_W * 0.62,
    height: SCREEN_W * 0.62,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    marginBottom: space.xl,
  },
  slideTitle: {
    ...t.headline,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: space.md,
  },
  slideBody: { ...t.body, textAlign: 'center', maxWidth: 320 },
  footer: { padding: space.lg, paddingBottom: 36 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 22 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  btnFlex: { flex: 1 },
  btnPressed: { backgroundColor: colors.primaryPressed },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  welcomeTitle: {
    ...t.title,
    textAlign: 'center',
    marginBottom: space.lg,
    color: colors.ink,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  ruleCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  ruleBody: { ...t.body, fontSize: 15 },
  question: {
    ...t.title,
    fontSize: 22,
    textAlign: 'center',
    marginBottom: space.lg,
    paddingHorizontal: space.sm,
    color: colors.ink,
  },
  subq: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: space.sm,
  },
  intentRow: {
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    flex: 1,
  },
  intentCard: {
    flex: 1,
    maxWidth: 160,
    aspectRatio: 1,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  intentCardOn: { borderColor: colors.primary, backgroundColor: '#FEF2F2' },
  intentEmoji: { fontSize: 40, marginBottom: 8 },
  intentLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillSm: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillWide: {
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 10,
    backgroundColor: colors.surface,
  },
  pillOn: { borderColor: colors.primary, backgroundColor: '#FEF2F2' },
  pillText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  pillTextOn: { color: colors.primary },
  pillCol: { paddingHorizontal: space.lg, marginBottom: space.lg },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.lg,
    paddingBottom: 32,
    marginTop: 'auto',
  },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 8, minWidth: 72 },
  skipText: { fontSize: 16, fontWeight: '600', color: colors.muted },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: space.md },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  addLocBtn: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  addLocBtnText: { color: '#fff', fontWeight: '700' },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: space.lg,
  },
  dollar: { fontSize: 20, fontWeight: '700', color: colors.ink },
  budgetInput: {
    minWidth: 88,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    fontSize: 22,
    fontWeight: '700',
    paddingVertical: 8,
    color: colors.ink,
    textAlign: 'center',
  },
  budgetTo: { fontSize: 16, color: colors.muted, marginHorizontal: 4 },
});
