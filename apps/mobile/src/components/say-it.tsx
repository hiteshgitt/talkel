import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, friendlyError } from '@/lib/api';
import type { IconName } from '@/lib/visuals';
import { makeStyles, radius, useColors } from '@/theme';

const LABELS = {
  en: { open: 'Say it 3 ways', natural: 'Natural', professional: 'Professional', casual: 'Casual', loading: 'Preparing…' },
  hi: { open: '3 तरीक़ों से कहें', natural: 'स्वाभाविक', professional: 'प्रोफ़ेशनल', casual: 'कैज़ुअल', loading: 'तैयार हो रहा है…' },
} as const;

/** Natural / professional / casual versions of a sentence, fetched when first opened (cached by the server). */
export function SayItWays({ conversationId, text, lang }: { conversationId: string; text: string; lang: 'en' | 'hi' }) {
  const s = useStyles();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const t = LABELS[lang];
  const q = useQuery({ queryKey: ['say-it', conversationId, text], queryFn: () => api.sayIt(conversationId, text), enabled: open, staleTime: Infinity, retry: 1 });

  const rows: { key: 'natural' | 'professional' | 'casual'; icon: IconName; tint: string }[] = [
    { key: 'natural', icon: 'chatbubble-outline', tint: c.accent },
    { key: 'professional', icon: 'briefcase-outline', tint: c.success },
    { key: 'casual', icon: 'happy-outline', tint: c.warning },
  ];

  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={({ pressed }) => [s.link, pressed && s.pressed]}>
        <Ionicons name="color-wand-outline" size={16} color={c.accent} />
        <Text style={s.linkText}>{t.open}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={c.accent} />
      </Pressable>
      {open ? (
        <View style={s.panel}>
          {q.isPending ? (
            <View style={s.loading}>
              <ActivityIndicator color={c.accent} size="small" />
              <Text style={s.muted}>{t.loading}</Text>
            </View>
          ) : q.isError ? (
            <Pressable onPress={() => void q.refetch()} accessibilityRole="button">
              <Text style={s.error}>{friendlyError(q.error)} ↻</Text>
            </Pressable>
          ) : (
            <>
              {rows.map((r) => (
                <View key={r.key} style={s.row}>
                  <Ionicons name={r.icon} size={17} color={r.tint} style={s.icon} />
                  <View style={s.flex}>
                    <Text style={[s.label, { color: r.tint }]}>{t[r.key]}</Text>
                    <Text style={s.text}>{q.data[r.key]}</Text>
                  </View>
                </View>
              ))}
              <Text style={s.tip}>💡 {q.data.tip}</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    link: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 4 },
    linkText: { color: c.accent, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.6 },
    panel: { backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 12, gap: 10, marginTop: 4 },
    loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    icon: { marginTop: 2 },
    flex: { flex: 1, gap: 1 },
    label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
    text: { color: c.text, fontSize: 15, lineHeight: 21 },
    tip: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    muted: { color: c.textMuted, fontSize: 14 },
    error: { color: c.danger, fontSize: 14 },
  }),
);
