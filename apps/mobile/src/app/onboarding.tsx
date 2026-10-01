import {
  CONSENT_VERSION,
  type EnglishLevel,
  type FeedbackLanguage,
  type LearningGoal,
} from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '@/components/art';
import { PrivacyNotice } from '@/components/privacy-notice';
import { Body, Button, Choice, ErrorText, ProgressBar, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { ME_KEY } from '@/lib/queries';
import type { IconName } from '@/lib/visuals';

const LEVELS: { id: EnglishLevel; label: string; description: string; icon: IconName }[] = [
  { id: 'BEGINNER', label: 'Beginner', description: 'I understand simple English but find it hard to speak.', icon: 'leaf-outline' },
  { id: 'INTERMEDIATE', label: 'Intermediate', description: 'I can talk about everyday topics, with some pauses.', icon: 'walk-outline' },
  { id: 'UPPER_INTERMEDIATE', label: 'Upper intermediate', description: 'I speak fairly well but want to sound more natural.', icon: 'bicycle-outline' },
  { id: 'ADVANCED', label: 'Advanced', description: 'I speak confidently and want to handle tough conversations.', icon: 'rocket-outline' },
  { id: 'EXPERT', label: 'Expert', description: 'Near-native. I want challenging, fast conversations.', icon: 'trophy-outline' },
];

const GOALS: { id: LearningGoal; label: string; icon: IconName }[] = [
  { id: 'daily_conversation', label: 'Everyday conversation', icon: 'cafe-outline' },
  { id: 'job_interviews', label: 'Job interviews', icon: 'briefcase-outline' },
  { id: 'work_meetings', label: 'Work meetings', icon: 'people-outline' },
  { id: 'client_calls', label: 'Client calls', icon: 'call-outline' },
  { id: 'presentations', label: 'Presentations', icon: 'easel-outline' },
  { id: 'travel', label: 'Travel', icon: 'airplane-outline' },
  { id: 'exams_migration', label: 'Exams / migration', icon: 'school-outline' },
  { id: 'confidence', label: 'Speaking confidence', icon: 'happy-outline' },
];

const LANGUAGES: { id: FeedbackLanguage; label: string; description: string; icon: IconName }[] = [
  { id: 'en', label: 'English', description: 'Explanations in English', icon: 'text-outline' },
  { id: 'hi', label: 'हिन्दी (Hindi)', description: 'Explanations in Hindi — conversations stay in English', icon: 'language-outline' },
];

const STEPS = ['level', 'goals', 'language', 'consent'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingScreen() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('level');
  const [level, setLevel] = useState<EnglishLevel | null>(null);
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [language, setLanguage] = useState<FeedbackLanguage>('en');
  const [consent, setConsent] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api.completeOnboarding({ level: level!, goals, feedbackLanguage: language, consentVersion: CONSENT_VERSION }),
    onSuccess: (me) => qc.setQueryData(ME_KEY, me), // root layout switches to the tabs
  });

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[index + 1] ?? step);
  const back = () => setStep(STEPS[index - 1] ?? step);
  const toggleGoal = (g: LearningGoal) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const back_ = <Button label="Back" variant="ghost" onPress={back} />;
  const footer =
    step === 'level' ? (
      <>
        {!level ? <Text style={styles.hint}>Choose one to continue.</Text> : null}
        <Button label="Continue" icon="arrow-forward" onPress={next} disabled={!level} />
      </>
    ) : step === 'goals' ? (
      <>
        {goals.length === 0 ? <Text style={styles.hint}>Choose at least one to continue.</Text> : null}
        <Button label="Continue" icon="arrow-forward" onPress={next} disabled={goals.length === 0} />
        {back_}
      </>
    ) : step === 'language' ? (
      <>
        <Button label="Continue" icon="arrow-forward" onPress={next} />
        {back_}
      </>
    ) : (
      <>
        {!consent ? <Text style={styles.hint}>Tick “I agree” to continue.</Text> : null}
        <Button label="Start practising" icon="mic" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!consent || !level} />
        {back_}
      </>
    );

  return (
    <Screen style={{ paddingTop: 20 }} footer={footer}>
      <View style={styles.progress}>
        {index === 0 ? <BrandMark size={44} /> : null}
        <Body muted>
          Step {index + 1} of {STEPS.length}
        </Body>
        <ProgressBar value={(index + 1) / STEPS.length} height={6} />
      </View>

      {step === 'level' && (
        <>
          <Title>How is your spoken English?</Title>
          <Body muted>This sets how the AI talks to you. You can change it any time.</Body>
          {LEVELS.map((l) => (
            <Choice key={l.id} icon={l.icon} label={l.label} description={l.description} selected={level === l.id} onPress={() => setLevel(l.id)} />
          ))}
        </>
      )}

      {step === 'goals' && (
        <>
          <Title>What do you want to practise?</Title>
          <Body muted>Pick as many as you like.</Body>
          <View style={styles.chips}>
            {GOALS.map((g) => (
              <Choice key={g.id} compact role="checkbox" icon={g.icon} label={g.label} selected={goals.includes(g.id)} onPress={() => toggleGoal(g.id)} />
            ))}
          </View>
        </>
      )}

      {step === 'language' && (
        <>
          <Title>Feedback language</Title>
          <Body muted>After each conversation you get feedback. Which language should we explain it in?</Body>
          {LANGUAGES.map((l) => (
            <Choice key={l.id} icon={l.icon} label={l.label} description={l.description} selected={language === l.id} onPress={() => setLanguage(l.id)} />
          ))}
        </>
      )}

      {step === 'consent' && (
        <>
          <Title>Your voice and privacy</Title>
          <PrivacyNotice />
          <Choice
            role="checkbox"
            label="I agree"
            description="I understand how my voice and transcripts are used."
            selected={consent}
            onPress={() => setConsent((c) => !c)}
          />
          <ErrorText>{submit.error instanceof Error ? submit.error.message : null}</ErrorText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  progress: { gap: 10, marginBottom: 4 },
  hint: { color: '#8A909C', fontSize: 13, textAlign: 'center', marginBottom: 4 },
});
