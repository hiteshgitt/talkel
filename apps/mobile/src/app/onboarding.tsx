import {
  CONSENT_VERSION,
  type EnglishLevel,
  type FeedbackLanguage,
  type LearningGoal,
} from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PrivacyNotice } from '@/components/privacy-notice';
import { Body, Button, Choice, ErrorText, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { ME_KEY } from '@/lib/queries';

const LEVELS: { id: EnglishLevel; label: string; description: string }[] = [
  { id: 'BEGINNER', label: 'Beginner', description: 'I understand simple English but find it hard to speak.' },
  { id: 'INTERMEDIATE', label: 'Intermediate', description: 'I can talk about everyday topics, with some pauses.' },
  { id: 'UPPER_INTERMEDIATE', label: 'Upper intermediate', description: 'I speak fairly well but want to sound more natural.' },
  { id: 'ADVANCED', label: 'Advanced', description: 'I speak confidently and want to handle tough conversations.' },
  { id: 'EXPERT', label: 'Expert', description: 'Near-native. I want challenging, fast conversations.' },
];

const GOALS: { id: LearningGoal; label: string }[] = [
  { id: 'daily_conversation', label: 'Everyday conversation' },
  { id: 'job_interviews', label: 'Job interviews' },
  { id: 'work_meetings', label: 'Work meetings' },
  { id: 'client_calls', label: 'Client calls' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'travel', label: 'Travel' },
  { id: 'exams_migration', label: 'Exams / migration' },
  { id: 'confidence', label: 'Speaking confidence' },
];

const LANGUAGES: { id: FeedbackLanguage; label: string; description: string }[] = [
  { id: 'en', label: 'English', description: 'Explanations in English' },
  { id: 'hi', label: 'हिन्दी (Hindi)', description: 'Explanations in Hindi — conversations stay in English' },
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

  return (
    <Screen style={{ paddingTop: 32 }}>
      <Body muted>
        Step {index + 1} of {STEPS.length}
      </Body>

      {step === 'level' && (
        <>
          <Title>How is your spoken English?</Title>
          <Body muted>This sets how the AI talks to you. You can change it any time.</Body>
          {LEVELS.map((l) => (
            <Choice key={l.id} label={l.label} description={l.description} selected={level === l.id} onPress={() => setLevel(l.id)} />
          ))}
          {!level ? <Body muted>Choose one to continue.</Body> : null}
          <Button label="Continue" onPress={next} disabled={!level} />
        </>
      )}

      {step === 'goals' && (
        <>
          <Title>What do you want to practise?</Title>
          <Body muted>Pick as many as you like.</Body>
          <View style={styles.chips}>
            {GOALS.map((g) => (
              <Choice key={g.id} compact role="checkbox" label={g.label} selected={goals.includes(g.id)} onPress={() => toggleGoal(g.id)} />
            ))}
          </View>
          {goals.length === 0 ? <Body muted>Choose at least one to continue.</Body> : null}
          <Button label="Continue" onPress={next} disabled={goals.length === 0} />
          <Button label="Back" variant="ghost" onPress={back} />
        </>
      )}

      {step === 'language' && (
        <>
          <Title>Feedback language</Title>
          <Body muted>After each conversation you get feedback. Which language should we explain it in?</Body>
          {LANGUAGES.map((l) => (
            <Choice key={l.id} label={l.label} description={l.description} selected={language === l.id} onPress={() => setLanguage(l.id)} />
          ))}
          <Button label="Continue" onPress={next} />
          <Button label="Back" variant="ghost" onPress={back} />
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
          {!consent ? <Body muted>Tick “I agree” to continue.</Body> : null}
          <ErrorText>{submit.error instanceof Error ? submit.error.message : null}</ErrorText>
          <Button label="Start practising" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!consent || !level} />
          <Button label="Back" variant="ghost" onPress={back} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
