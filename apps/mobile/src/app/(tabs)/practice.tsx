import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScenarioArt } from '@/components/art';
import { LEVEL_LABEL } from '@/components/pickers';
import { Badge, Button, Card, Choice, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { formatMinutes, useCatalog, useQuota } from '@/lib/queries';
import { makeStyles, useColors } from '@/theme';

export default function PracticeScreen() {
  const s = useStyles();
  const c = useColors();
  const catalog = useCatalog();
  const quota = useQuota();
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
