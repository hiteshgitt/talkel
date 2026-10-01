import type { GrammarCategory } from '@speakai/contracts';

/** Plain-English names for mistake types, with a hint where the name alone is unclear. */
export const MISTAKE_LABEL: Record<GrammarCategory, string> = {
  VERB_TENSE: 'Verb tenses',
  SUBJECT_VERB_AGREEMENT: 'Subject–verb agreement (he goes / they go)',
  ARTICLES: 'Articles (a / an / the)',
  PREPOSITIONS: 'Prepositions (in / on / at / for)',
  WORD_ORDER: 'Word order',
  PLURALS: 'Plurals',
  PRONOUNS: 'Pronouns',
  QUESTION_FORM: 'Forming questions',
  VERB_FORM: 'Verb forms',
  WORD_CHOICE: 'Word choice',
  OTHER: 'Other',
};
