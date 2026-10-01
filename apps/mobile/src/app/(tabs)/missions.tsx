import Ionicons from '@expo/vector-icons/Ionicons';
import type { MissionGroup, MissionSummary } from '@speakai/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScenarioArt } from '@/components/art';
import { Gradient } from '@/components/gradient';
import { LevelDots } from '@/components/mission-ui';
import { Badge, Button, Card, ErrorText, Loading, Title } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { GROUP, levelName, useMissions } from '@/lib/missions';
import { makeStyles, radius, useColors } from '@/theme';

const ORDER: MissionGroup[] = ['career', 'everyday', 'challenge'];

export default function MissionsScreen() {
  const s = useStyles();
  const c = useColors();
  const q = useMissions();
  const { refetch } = q;
  // Results arrive in the background after each call; refresh progress whenever the tab opens.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (q.isPending) return <Loading />;
  const missions = q.data?.missions ?? [];
  const levelsPassed = missions.reduce((n, m) => n + m.progress.passedLevels.length, 0);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void refetch()} tintColor={c.accent} colors={[c.accent]} />}
      >
        <Title>Missions</Title>
        <Gradient colors={[c.accent, c.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroRow}>
            <Ionicons name="flag" size={22} color="#fff" />
            <Text style={s.heroTitle}>Real situations. Real stakes.</Text>
          </View>
          <Text style={s.heroBody}>Each mission has a goal — and the other person has theirs. Win a level to unlock a tougher one.</Text>
          <View style={s.heroStats}>
            <Text style={s.heroStat}>{levelsPassed} of {missions.length * 5} levels passed</Text>
          </View>
        </Gradient>
        {q.isError ? (
          <>
            <ErrorText>{friendlyError(q.error)}</ErrorText>
            <Button label="Try again" icon="refresh" onPress={() => void refetch()} />
          </>
        ) : null}

        {ORDER.map((g) => {
          const items = missions.filter((m) => m.group === g);
          if (!items.length) return null;
          return (
            <View key={g} style={s.group}>
              <View style={s.groupHead}>
                <Ionicons name={GROUP[g].icon} size={18} color={c.accent} />
                <Text style={s.groupTitle}>{GROUP[g].title}</Text>
              </View>
              <Text style={s.groupSub}>{GROUP[g].subtitle}</Text>
              {items.map((m) => (
                <MissionCard key={m.id} m={m} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function MissionCard({ m }: { m: MissionSummary }) {
  const s = useStyles();
  const p = m.progress;
  const done = p.passedLevels.length === 5;
  const best = Math.max(0, ...Object.values(p.bestScores));
  return (
    <Card onPress={() => router.push({ pathname: '/mission/[id]', params: { id: m.id } })} accessibilityLabel={m.title}>
      <View style={s.cardRow}>
        <ScenarioArt slug={m.slug} size={58} />
        <View style={s.cardText}>
          <Text style={s.title}>{m.title}</Text>
          <Text style={s.tagline} numberOfLines={2}>
            {m.tagline}
          </Text>
        </View>
      </View>
      <View style={s.metaRow}>
        <LevelDots passed={p.passedLevels} unlocked={p.unlockedLevel} />
        <Text style={s.level}>{done ? 'All levels passed' : `Level ${p.unlockedLevel} · ${levelName(p.unlockedLevel)}`}</Text>
        {best > 0 ? <Badge label={`Best ${best}`} tone="success" icon="trophy" /> : <Badge label={`~${m.estimatedMinutes} min`} icon="time-outline" />}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, gap: 16, paddingBottom: 36 },
    hero: { borderRadius: radius.xl, padding: 20, gap: 8 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
    heroBody: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
    heroStats: { flexDirection: 'row', marginTop: 4 },
    heroStat: { color: '#fff', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
    group: { gap: 12 },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    groupTitle: { color: c.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
    groupSub: { color: c.textMuted, fontSize: 14, marginTop: -6 },
    cardRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
    cardText: { flex: 1, gap: 4 },
    title: { color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
    tagline: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
    level: { color: c.textMuted, fontSize: 13, fontWeight: '600', flex: 1 },
  }),
);
