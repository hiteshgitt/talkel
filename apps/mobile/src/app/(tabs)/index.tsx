import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PersonaAvatar, ScenarioArt, ScenarioBanner } from '@/components/art';
import { Gradient } from '@/components/gradient';
import { Badge, Button, Card, ErrorText, ListRow, ProgressBar, Screen, SectionHeader } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { configProblem } from '@/lib/config';
import { MISTAKE_LABEL } from '@/lib/labels';
import { CONVERSATIONS_KEY, createdConversationKey, formatMinutes, useCatalog, useMe, useQuota } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { levelName, useMissions } from '@/lib/missions';
import { LevelDots } from '@/components/mission-ui';
import { preferredPersonaSlug } from '@/lib/voice';
import { makeStyles, radius, useColors } from '@/theme';

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const s = useStyles();
  const c = useColors();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const catalog = useCatalog();
  const quota = useQuota();
  const progress = useQuery({ queryKey: ['progress'], queryFn: api.progress });
  const missions = useMissions();
  const latest = useQuery({ queryKey: [...CONVERSATIONS_KEY, 'latest'], queryFn: () => api.conversations() });

  const friendly = catalog.data?.scenarios.find((x) => x.slug === 'friendly-conversation');
  const canChoose = me?.entitlements.choosePartner ?? false;
  const persona = canChoose && me?.settings.preferredVoiceGender ? catalog.data?.personas.find((p) => p.slug === preferredPersonaSlug(me)) : undefined;
  const remaining = quota.data?.remainingSec ?? 0;
  const problem = configProblem() ?? nativeCallingProblem();

  // One tap: a relaxed catch-up call with the preferred partner, using the saved defaults.
  const quickStart = useMutation({
    mutationFn: () => api.createConversation({ scenarioId: friendly!.id, ...(persona ? { personaId: persona.id } : {}), voice: 'RANDOM' }),
    onSuccess: (created) => {
      qc.setQueryData(createdConversationKey(created.id), created);
      router.push({ pathname: '/brief/[id]', params: { id: created.id } });
    },
  });

  const name = me?.profile.displayName ?? me?.user.name ?? '';
  const firstName = name.split(' ')[0];
  const used = quota.data ? quota.data.dailyLimitSec - quota.data.remainingSec : 0;
  const streak = progress.data?.streak.current ?? 0;
  const focus = progress.data?.commonMistakes[0];
  const last = latest.data?.items[0];
  // Next mission: the one in progress, else the first not yet completed.
  const all = missions.data?.missions ?? [];
  const nextMission =
    all.filter((m) => m.progress.attempts > 0 && m.progress.passedLevels.length < 5).sort((a, b) => b.progress.attempts - a.progress.attempts)[0] ??
    all.find((m) => m.progress.passedLevels.length < 5);

  return (
    <Screen edges={['top']}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.greeting}>{greeting()}</Text>
          <Text style={s.hello}>{firstName ? `Hi, ${firstName}` : 'Hi there'}</Text>
        </View>
        <View style={[s.streak, streak > 0 && s.streakOn]} accessibilityLabel={`${streak} day streak`}>
          <Ionicons name="flame" size={18} color={streak > 0 ? c.warning : c.textFaint} />
          <Text style={[s.streakText, streak > 0 && { color: c.warning }]}>{streak}</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
          <Gradient colors={[c.accent, c.accent2]} style={s.me}>
            <Text style={s.meInitial}>{(firstName || '?').charAt(0).toUpperCase()}</Text>
          </Gradient>
        </Pressable>
      </View>

      <ScenarioBanner slug="friendly-conversation" height={196}>
        <Text style={s.heroEyebrow}>Quick chat</Text>
        <Text style={s.heroTitle}>{persona ? `Talk with ${persona.name}` : 'Talk with a friend'}</Text>
        <Text style={s.heroBody}>A relaxed catch-up. Just talk — feedback comes after the call.</Text>
      </ScenarioBanner>
      <ErrorText>{problem ?? (quickStart.error ? friendlyError(quickStart.error) : null)}</ErrorText>
      <Button
        label={remaining < 30 ? 'Come back tomorrow' : 'Start talking'}
        icon="mic"
        onPress={() => quickStart.mutate()}
        loading={quickStart.isPending}
        disabled={Boolean(problem) || !friendly || remaining < 30}
      />

      {nextMission ? (
        <>
          <SectionHeader title="Your next mission" icon="flag" action={{ label: 'All missions', onPress: () => router.push('/missions') }} />
          <Card onPress={() => router.push({ pathname: '/mission/[id]', params: { id: nextMission.id } })} accessibilityLabel={nextMission.title}>
            <View style={s.inline}>
              <ScenarioArt slug={nextMission.slug} size={52} />
              <View style={s.flex}>
                <Text style={s.cardTitle}>{nextMission.title}</Text>
                <Text style={s.mutedSmall} numberOfLines={1}>
                  Level {nextMission.progress.unlockedLevel} · {levelName(nextMission.progress.unlockedLevel)}
                </Text>
              </View>
              <LevelDots passed={nextMission.progress.passedLevels} unlocked={nextMission.progress.unlockedLevel} size={8} />
            </View>
          </Card>
        </>
      ) : null}

      {quota.data ? (
        <Card>
          <View style={s.rowBetween}>
            <View style={s.inline}>
              <Ionicons name="time-outline" size={18} color={c.accent} />
              <Text style={s.cardTitle}>Today’s practice</Text>
            </View>
            <Text style={s.cardValue}>{formatMinutes(remaining)} left</Text>
          </View>
          <ProgressBar value={used / quota.data.dailyLimitSec} color={c.success} />
          <Text style={s.muted}>
            {remaining > 0
              ? `${formatMinutes(used)} of ${formatMinutes(quota.data.dailyLimitSec)} used today`
              : 'You’ve used today’s free time. It resets at midnight.'}
          </Text>
        </Card>
      ) : null}

      {focus ? (
        <Card onPress={() => router.push({ pathname: '/mistakes/[category]', params: { category: focus.category } })} accessibilityLabel="Your focus">
          <View style={s.inline}>
            <View style={s.focusIcon}>
              <Ionicons name="locate" size={20} color={c.warning} />
            </View>
            <View style={s.flex}>
              <Text style={s.mutedSmall}>Your focus right now</Text>
              <Text style={s.cardTitle}>{MISTAKE_LABEL[focus.category]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </View>
        </Card>
      ) : null}

      <SectionHeader title="Practise a situation" action={{ label: 'See all', onPress: () => router.push('/practice') }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel} style={s.carouselWrap}>
        {(catalog.data?.scenarios ?? []).map((x) => (
          <Pressable
            key={x.id}
            onPress={() => router.push({ pathname: '/scenario/[id]', params: { id: x.id } })}
            accessibilityRole="button"
            accessibilityLabel={x.title}
            style={({ pressed }) => [s.tile, pressed && s.pressed]}
          >
            <ScenarioArt slug={x.slug} size={48} />
            <Text style={s.tileTitle} numberOfLines={2}>
              {x.title}
            </Text>
            <Text style={s.mutedSmall}>~{x.estimatedMinutes} min</Text>
          </Pressable>
        ))}
      </ScrollView>

      {last ? (
        <>
          <SectionHeader title="Last conversation" action={{ label: 'History', onPress: () => router.push('/history') }} />
          <Card>
            <ListRow
              leading={<PersonaAvatar name={last.personaName} />}
              title={last.scenarioTitle}
              subtitle={`with ${last.personaName}${last.durationMs !== null ? ` · ${formatMinutes(Math.round(last.durationMs / 1000))}` : ''}`}
              trailing={last.overallScore !== null ? <Badge label={String(last.overallScore)} tone="accent" icon="star" /> : null}
              onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: last.id } })}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    headerText: { flex: 1 },
    greeting: { color: c.textMuted, fontSize: 15 },
    hello: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    streak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceRaised },
    streakOn: { backgroundColor: c.warningSoft },
    streakText: { color: c.textFaint, fontSize: 15, fontWeight: '800' },
    me: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    meInitial: { color: c.onAccent, fontSize: 17, fontWeight: '800' },
    heroEyebrow: { color: c.text, opacity: 0.7, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
    heroTitle: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
    heroBody: { color: c.textMuted, fontSize: 15, lineHeight: 21, maxWidth: '85%' },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    flex: { flex: 1 },
    cardTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
    cardValue: { color: c.text, fontSize: 15, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 14 },
    mutedSmall: { color: c.textMuted, fontSize: 13 },
    focusIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.warningSoft, alignItems: 'center', justifyContent: 'center' },
    carouselWrap: { marginHorizontal: -20 },
    carousel: { paddingHorizontal: 20, paddingVertical: 6, gap: 12 },
    tile: { width: 140, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, gap: 10, ...c.elevation },
    tileTitle: { color: c.text, fontSize: 15, fontWeight: '700', minHeight: 38 },
    pressed: { opacity: 0.8 },
  }),
);
