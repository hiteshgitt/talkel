import Ionicons from '@expo/vector-icons/Ionicons';
import type { FeedbackLanguage, VoiceGender } from '@speakai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconBadge } from '@/components/art';
import { Gradient } from '@/components/gradient';
import { LEVEL_LABEL } from '@/components/pickers';
import { Badge, Card, Choice, ErrorText, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useMe, useUpdateSettings } from '@/lib/queries';
import { makeStyles, useColors } from '@/theme';

const LANGUAGES: { id: FeedbackLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
];

const VOICES: { id: VoiceGender | null; label: string }[] = [
  { id: null, label: 'Random' },
  { id: 'FEMALE', label: 'Female' },
  { id: 'MALE', label: 'Male' },
];

export default function ProfileScreen() {
  const s = useStyles();
  const c = useColors();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const update = useUpdateSettings();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    qc.clear(); // drop the previous user's cached data
    setSigningOut(false);
  }

  if (!me) return null;
  const name = me.profile.displayName ?? me.user.name;
  const pro = me.user.plan === 'PRO';

  return (
    <Screen edges={['top']}>
      <Title>Profile</Title>

      <Card style={s.hero}>
        <Gradient colors={[c.accent, c.accent2]} style={s.avatar}>
          <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </Gradient>
        <Text style={s.name}>{name}</Text>
        <Text style={s.email}>{me.user.email}</Text>
        <View style={s.badges}>
          <Badge label={pro ? 'Pro' : 'Free plan'} tone={pro ? 'warning' : 'neutral'} icon={pro ? 'star' : undefined} />
          {me.profile.selfReportedLevel ? <Badge label={LEVEL_LABEL[me.profile.selfReportedLevel]} tone="accent" icon="bar-chart" /> : null}
        </View>
        {!pro ? <Text style={s.note}>On the free plan your partner and accent are a surprise each time.</Text> : null}
      </Card>

      <Card>
        <View style={s.settingHead}>
          <IconBadge name="language" tint={c.accent} />
          <View style={s.flex}>
            <Text style={s.settingTitle}>Feedback language</Text>
            <Text style={s.settingHint}>Conversations always stay in English.</Text>
          </View>
        </View>
        <View style={s.row}>
          {LANGUAGES.map((l) => (
            <Choice key={l.id} compact label={l.label} selected={me.settings.feedbackLanguage === l.id} onPress={() => update.mutate({ feedbackLanguage: l.id })} />
          ))}
        </View>
      </Card>

      {me.entitlements.choosePartner ? (
        <Card>
          <View style={s.settingHead}>
            <IconBadge name="person-circle" tint={c.success} />
            <View style={s.flex}>
              <Text style={s.settingTitle}>Default voice</Text>
              <Text style={s.settingHint}>Used for quick chats; you can change it per call.</Text>
            </View>
          </View>
          <View style={s.row}>
            {VOICES.map((v) => (
              <Choice
                key={v.label}
                compact
                label={v.label}
                selected={(me.settings.preferredVoiceGender ?? null) === v.id}
                onPress={() => update.mutate({ preferredVoiceGender: v.id })}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={s.settingHead}>
          <IconBadge name={c.scheme === 'dark' ? 'moon' : 'sunny'} tint={c.warning} />
          <View style={s.flex}>
            <Text style={s.settingTitle}>Appearance</Text>
            <Text style={s.settingHint}>Follows your phone’s light / dark setting.</Text>
          </View>
        </View>
      </Card>
      <ErrorText>{update.error instanceof Error ? update.error.message : null}</ErrorText>

      <Pressable onPress={() => void signOut()} disabled={signingOut} accessibilityRole="button" style={({ pressed }) => [s.signOut, pressed && s.pressed]}>
        {signingOut ? <ActivityIndicator color={c.danger} /> : <Ionicons name="log-out-outline" size={20} color={c.danger} />}
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>
      <Text style={s.version}>Talkel {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    hero: { alignItems: 'center', paddingVertical: 24, gap: 6 },
    avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    avatarText: { color: c.onAccent, fontSize: 32, fontWeight: '800' },
    name: { color: c.text, fontSize: 21, fontWeight: '800' },
    email: { color: c.textMuted, fontSize: 14 },
    badges: { flexDirection: 'row', gap: 6, marginTop: 6 },
    note: { color: c.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
    settingHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    flex: { flex: 1, gap: 2 },
    settingTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
    settingHint: { color: c.textMuted, fontSize: 13 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 999, backgroundColor: c.dangerSoft },
    signOutText: { color: c.danger, fontSize: 16, fontWeight: '700' },
    pressed: { opacity: 0.6 },
    version: { color: c.textFaint, fontSize: 12, textAlign: 'center' },
  }),
);
