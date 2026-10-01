import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import type { IconName } from '@/lib/visuals';
import { makeStyles, useColors } from '@/theme';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'mic-outline', text: 'Your voice is sent to our AI provider (Google Gemini) during calls so it can reply.' },
  { icon: 'recording-outline', text: 'We don’t store your audio — unless you tap “Record” during a call. Recordings are private to you, and you can delete them any time.' },
  { icon: 'document-text-outline', text: 'We store the text transcript of each conversation so we can give you feedback and track your progress.' },
  { icon: 'trash-outline', text: 'You can delete conversations, recordings or your whole account at any time.' },
];

/** The privacy notice users agree to (version CONSENT_VERSION in @speakai/contracts). */
export function PrivacyNotice() {
  const s = useStyles();
  const c = useColors();
  return (
    <Card style={s.card}>
      {POINTS.map((p) => (
        <View key={p.icon} style={s.row}>
          <View style={s.icon}>
            <Ionicons name={p.icon} size={18} color={c.accent} />
          </View>
          <Text style={s.text}>{p.text}</Text>
        </View>
      ))}
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: { gap: 14 },
    row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    text: { color: c.text, fontSize: 15, lineHeight: 22, flex: 1 },
  }),
);
