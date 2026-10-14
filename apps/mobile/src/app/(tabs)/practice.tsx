import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScenarioArt } from '@/components/art';
import { LEVEL_LABEL } from '@/components/pickers';
import { Badge, Button, Card, Choice, ErrorText, Loading, Screen, SectionHeader, Title } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { formatMinutes, useCatalog, useQuota, useTopics } from '@/lib/queries';
import { makeStyles, useColors } from '@/theme';

export default function PracticeScreen() {
  const s = useStyles();
  const c = useColors();
  const catalog = useCatalog();
  const quota = useQuota();
  const topics = useTopics();
  const [category, setCategory] = useState<string | null>(null);

  if (catalog.isPending) return <Loading />;
  if (catalog.isError) {
    return (
      <Screen>
        <Title>Practice</Title>
        <ErrorText>{friendlyError(catalog.error)}</ErrorText>
        <Button label="Try again" icon="refresh" onPress={() => void catalog.refetch()} />
      </Screen>
    );
  }

  // Categories in catalog order (scenarios arrive sorted by category).
  const categories = [...new Map(catalog.data.scenarios.map((x) => [x.category.slug, x.category] as const)).values()];
  const shown = catalog.data.scenarios.filter((x) => !category || x.category.slug === category);

  return (
    <Screen edges={['top']}>
      <View style={s.header}>
        <Title>Practice</Title>
        {quota.data ? (
          <View style={s.quota}>
            <Ionicons name="time-outline" size={16} color={quota.data.remainingSec > 0 ? c.success : c.textMuted} />
            <Text style={s.quotaText}>
              {quota.data.remainingSec > 0 ? `${formatMinutes(quota.data.remainingSec)} of free practice left today` : 'Today’s free time is used up. It resets at midnight.'}
            </Text>
          </View>
        ) : null}
      </View>

      <SectionHeader
        title="My topics"
        icon="sparkles-outline"
        action={topics.data?.canCreate && topics.data.topics.length > 0 ? { label: 'New', onPress: () => router.push('/topic/edit') } : undefined}
      />
      {(topics.data?.topics ?? []).map((t) => (
        <Card key={t.id} onPress={() => router.push({ pathname: '/scenario/[id]', params: { id: t.id } })} accessibilityLabel={t.title}>
          <View style={s.cardRow}>
            <ScenarioArt slug={t.slug} size={60} />
            <View style={s.cardText}>
              <Text style={s.title}>{t.title}</Text>
              <Text style={s.tagline} numberOfLines={2}>
                {t.tagline}
              </Text>
            </View>
          </View>
          <View style={s.meta}>
            <Badge label="Your topic" tone="accent" icon="sparkles" />
            <Badge label={`with ${t.aiCharacter}`} icon="person-outline" />
            {t.practised > 0 ? <Badge label={`Practised ${t.practised}×`} icon="checkmark-done-outline" /> : null}
          </View>
        </Card>
      ))}
      {topics.data && topics.data.topics.length === 0 ? (
        <Card onPress={() => router.push('/topic/edit')} accessibilityLabel="Create your own topic">
          <View style={s.cardRow}>
            <ScenarioArt slug="topic-new" size={60} />
            <View style={s.cardText}>
              <Text style={s.title}>Create your own topic</Text>
              <Text style={s.tagline}>Practise a real conversation from your life — with your manager, landlord, a client or a new friend.</Text>
            </View>
          </View>
        </Card>
      ) : null}
      {topics.data && !topics.data.canCreate && topics.data.limit !== null ? (
        <View style={s.quota}>
          <Ionicons name="lock-closed" size={14} color={c.warning} />
          <Text style={s.quotaText}>
            The free plan includes {topics.data.limit} custom topic. Edit it any time, or go Pro for unlimited topics.
          </Text>
        </View>
      ) : null}

      <SectionHeader title="Situations" icon="albums-outline" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsWrap} contentContainerStyle={s.chips}>
        <Choice compact label="All" selected={category === null} onPress={() => setCategory(null)} />
        {categories.map((cat) => (
          <Choice key={cat.slug} compact label={cat.name} selected={category === cat.slug} onPress={() => setCategory(cat.slug)} />
        ))}
      </ScrollView>

      {shown.map((x) => (
        <Card key={x.id} onPress={() => router.push({ pathname: '/scenario/[id]', params: { id: x.id } })} accessibilityLabel={x.title}>
          <View style={s.cardRow}>
            <ScenarioArt slug={x.slug} size={60} />
            <View style={s.cardText}>
              <Text style={s.title}>{x.title}</Text>
              <Text style={s.tagline} numberOfLines={2}>
                {x.tagline}
              </Text>
            </View>
          </View>
          <View style={s.meta}>
            <Badge label={x.category.name} tone="accent" />
            <Badge label={`~${x.estimatedMinutes} min`} icon="time-outline" />
            <Badge label={`from ${LEVEL_LABEL[x.minLevel]}`} icon="bar-chart-outline" />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    header: { gap: 6 },
    quota: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    quotaText: { color: c.textMuted, fontSize: 14, flexShrink: 1 },
    chipsWrap: { marginHorizontal: -20 },
    chips: { paddingHorizontal: 20, gap: 8 },
    cardRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
    cardText: { flex: 1, gap: 4 },
    title: { color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
    tagline: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
    meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  }),
);
