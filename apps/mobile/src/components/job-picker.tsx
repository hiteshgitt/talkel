import type { JobDetails } from '@speakai/contracts';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Body, Choice, Field } from '@/components/ui';

export interface JobChoice {
  mine: boolean;
  role: string;
  company: string;
  about: string;
}

const STORE_KEY = 'talkel.lastJob';
const EMPTY: JobChoice = { mine: false, role: '', company: '', about: '' };

/**
 * "Surprise me" or "My own job" for interviews and salary talks. The last job typed is remembered
 * on this device, so it's there next time.
 */
export function useJobChoice() {
  const [choice, setChoice] = useState<JobChoice>(EMPTY);
  const loaded = useRef(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then((saved) => {
        if (saved && !loaded.current) setChoice({ ...EMPTY, ...(JSON.parse(saved) as Partial<JobChoice>) });
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => void SecureStore.setItemAsync(STORE_KEY, JSON.stringify(choice)).catch(() => undefined), 500);
    return () => clearTimeout(t);
  }, [choice]);

  const update = (patch: Partial<JobChoice>) => {
    loaded.current = true; // typing wins over a slow read
    setChoice((c) => ({ ...c, ...patch }));
  };
  const role = choice.role.trim();
  /** What to send: undefined means a random job. */
  const job: JobDetails | undefined =
    choice.mine && role.length >= 2
      ? { role, ...(choice.company.trim() ? { company: choice.company.trim() } : {}), ...(choice.about.trim() ? { about: choice.about.trim() } : {}) }
      : undefined;
  /** "My own job" needs at least a job title. */
  const incomplete = choice.mine && !job;
  return { choice, update, job, incomplete };
}

export function JobPicker({ choice, update, kind }: { choice: JobChoice; update: (patch: Partial<JobChoice>) => void; kind: 'applying' | 'current' }) {
  const interview = kind === 'applying';
  return (
    <>
      <Choice
        icon="shuffle-outline"
        label="Surprise me"
        description={interview ? 'A random role at a made-up company.' : 'A made-up job and company.'}
        selected={!choice.mine}
        onPress={() => update({ mine: false })}
      />
      <Choice
        icon="briefcase-outline"
        label="My own job"
        description={interview ? 'Practise for the job you’re actually applying for.' : 'Practise with your real job.'}
        selected={choice.mine}
        onPress={() => update({ mine: true })}
      />
      {choice.mine ? (
        <>
          <Field
            label={interview ? 'Job title you’re applying for' : 'Your job title'}
            icon="briefcase-outline"
            placeholder={interview ? 'e.g. Frontend Developer' : 'e.g. Senior Accountant'}
            value={choice.role}
            onChangeText={(role) => update({ role })}
            maxLength={80}
          />
          <Field
            label="Company (optional)"
            icon="business-outline"
            placeholder="e.g. Infosys"
            value={choice.company}
            onChangeText={(company) => update({ company })}
            maxLength={80}
          />
          <Field
            label={interview ? 'Your experience (optional)' : 'What you achieved this year (optional)'}
            icon="document-text-outline"
            placeholder={interview ? 'e.g. 3 years of React, built a payments dashboard' : 'e.g. trained 4 new joiners, cut month-end close by 2 days'}
            value={choice.about}
            onChangeText={(about) => update({ about })}
            maxLength={400}
            multiline
          />
          <Body muted>{interview ? 'The interviewer will ask the questions this role really gets.' : 'Your manager will talk about your real work.'}</Body>
        </>
      ) : null}
    </>
  );
}
