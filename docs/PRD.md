# Talkel — Product Requirements Document

> **Source of truth for product intent.** This is the master PRD (v1.0) as supplied by the product owner, preserved verbatim below.
> Where engineering has refined or deviated from a requirement, the change is recorded in the **Engineering Amendments** table at the top and explained in the linked doc. The PRD text itself is not edited, so the original intent stays auditable.

## Engineering Amendments (approved 2026-09-29)

| # | PRD section | Amendment | Rationale | Details |
|---|---|---|---|---|
| A1 | §11 AI Provider Abstraction | Split the single `AIProvider` into `RealtimeVoiceProvider` (session/media control) and `EvaluationProvider` (post-session analysis). Remove `sendAudio()` / `receiveAudio()` from the backend interface. | Audio flows device ⇄ provider over WebRTC; it never passes through our backend, so those methods would be dead code or would force a latency-adding relay. | [AI-ARCHITECTURE.md §2](AI-ARCHITECTURE.md) |
| A2 | §10, §90 Voice architecture | **Media path direct, control path server-side**: the phone streams audio to the realtime provider over WebRTC. The backend holds a parallel "sideband" control connection to the *same* provider session for instructions, tools, transcripts and timing. | Gives the lowest latency without giving up server-authoritative session state (§12) or transcript capture (§26). | [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md) |
| A3 | §28 Skill scores | Deterministic metrics (fillers, WPM, pauses, latency) are computed **in code** from the transcript and timestamps. The LLM only handles judgments (grammar, vocabulary, coherence), and scores are banded with a rationale. | Stops the model inventing numbers and meets the "avoid fake precision" requirement. | [AI-ARCHITECTURE.md §6](AI-ARCHITECTURE.md) |
| A4 | §66 Repo structure | Prisma lives in `packages/db` instead of the root `prisma/`. `packages/types` and `packages/validation` merge into `packages/contracts`, where Zod schemas are the types. | One place per concern, with no drift between types and validators. | [ARCHITECTURE.md §4](ARCHITECTURE.md) |
| A5 | §9 Queues | The BullMQ worker is a **second entrypoint of `apps/api`**, not a separate app. | It shares NestJS modules and Prisma, and you still deploy it as its own process. | [ARCHITECTURE.md §3](ARCHITECTURE.md) |
| A6 | §31 Filler analysis | This depends on a **verbatim** user transcript. Default ASR models tend to drop "um/uh" and silently fix grammar. The fix is gated on Spike S3. | If this is not handled, filler and grammar feedback would be quietly wrong. | [VOICE-ARCHITECTURE.md §7](VOICE-ARCHITECTURE.md) |
| A7 | §16 Accent | Accent is a **best-effort persona hint**, not a guaranteed feature. | Realtime voices have fixed timbres. You can nudge accent through instructions, but you cannot guarantee it. | [AI-ARCHITECTURE.md §4](AI-ARCHITECTURE.md) |

---

# AI ENGLISH CONVERSATION COACH

## Master Product Requirements Document + Technical Architecture

**Version:** 1.0
**Status:** Initial Product Specification
**Target:** Android-first mobile application + Web dashboard
**Primary Goal:** Help users improve spoken English through realistic AI voice conversations.

---

# 1. PRODUCT VISION

Build an AI-powered English speaking practice platform where users can have realistic, spontaneous voice conversations with AI characters.

The product should NOT feel like a traditional English-learning application.

The primary experience should feel like:

> "I am talking to a real person."

The AI should behave according to the selected scenario rather than behaving like a teacher during the conversation.

Examples:

* Job interview
* Friend conversation
* Client meeting
* Debate
* Bargaining
* Salary negotiation
* Customer support
* Hotel
* Restaurant
* Airport
* Manager conversation
* Networking
* Presentation
* Sales call
* Difficult customer
* Casual conversation

After the conversation, the AI becomes the teacher and analyzes:

* Grammar
* Vocabulary
* Fluency
* Pronunciation
* Response speed
* Filler words
* Sentence structure
* Conversation continuity
* Ability to ask questions
* Ability to explain
* Ability to disagree
* Ability to clarify
* Overall communication effectiveness

---

# 2. PRODUCT PRINCIPLE

The application should optimize for:

## THINK → SPEAK → RESPOND → CONTINUE

Not:

## READ → MEMORIZE → TEST

The user should spend most of their session speaking.

---

# 3. TARGET USERS

## Primary users

People who understand English but struggle with speaking.

Examples:

* Students
* Working professionals
* Software developers
* Job seekers
* People preparing for interviews
* People preparing for migration
* Customer-facing professionals
* People wanting better conversational confidence

## Secondary users

Corporate employees who need English communication training.

---

# 4. PLATFORM STRATEGY

## Primary platform

Android mobile application.

Reason:

The core product is voice conversation and Android provides a better microphone, headset, notification, background and phone-like experience.

## Secondary platform

Web application.

The web application should focus on:

* Analytics
* Progress
* Conversation history
* Vocabulary
* Grammar history
* Account management
* Subscription
* Corporate administration

---

# 5. RECOMMENDED TECHNOLOGY STACK

## Android

React Native

Expo

TypeScript

Expo Router

React Query / TanStack Query

Zustand for local application state

Native WebSocket/WebRTC support where required

Secure storage for authentication tokens

Push notifications using Firebase Cloud Messaging / Expo Notifications

---

# 6. WEB STACK

Next.js 16+

React 19+

TypeScript strict mode

App Router

Tailwind CSS

CSS Modules where component-specific styling is needed

TanStack Query

Zustand where client state is needed

Responsive design

---

# 7. BACKEND

Use:

Node.js

NestJS

TypeScript

Reason:

The system requires:

* realtime communication
* WebSocket support
* AI orchestration
* background jobs
* REST APIs
* authentication
* event processing

NestJS should provide a modular backend architecture.

---

# 8. DATABASE

PostgreSQL

ORM:

Prisma

PostgreSQL should be the source of truth for application data.

---

# 9. CACHE / QUEUE

Redis

BullMQ

Use Redis/BullMQ for:

* post-conversation analysis
* audio processing
* analytics generation
* notifications
* scheduled learning plans
* report generation
* asynchronous AI processing

Do NOT use queues for realtime conversation responses.

---

# 10. AI VOICE ARCHITECTURE

The live conversation should use a realtime voice model/API.

Preferred architecture:

User microphone
↓
Realtime voice connection
↓
Speech/audio processing
↓
Realtime AI model
↓
AI response audio
↓
User speaker/headphones

Avoid:

User speaks
↓
Upload complete audio
↓
Speech-to-text
↓
LLM
↓
Text-to-speech
↓
Download audio

for the main conversation experience.

That architecture creates unnecessary latency.

---

# 11. AI PROVIDER ABSTRACTION

Do not tightly couple the application to one AI provider.

Create an abstraction:

AIProvider

with capabilities such as:

* startConversation()
* sendAudio()
* receiveAudio()
* interrupt()
* endConversation()
* analyzeConversation()
* generateFeedback()
* generateVocabulary()
* evaluatePronunciation()

The initial provider can be OpenAI.

Future providers should be replaceable.

---

# 12. AI CONVERSATION ENGINE

Create a dedicated Conversation Engine.

It is responsible for:

* scenario rules
* AI personality
* conversation state
* difficulty
* user level
* scenario objective
* conversation objectives
* interruptions
* follow-up questions
* escalation
* ending conditions

The LLM should not independently control the entire application.

The backend should maintain the authoritative session state.

---

# 13. SCENARIO MODEL

Each scenario should contain:

```text
Scenario
├── id
├── title
├── description
├── category
├── difficulty
├── AI role
├── user role
├── personality
├── objective
├── constraints
├── conversation goals
├── vocabulary
├── evaluation criteria
├── possible branches
└── completion conditions
```

---

# 14. INITIAL SCENARIOS

MVP should contain at least:

## 1. Friendly Conversation

AI = Friend

Topics:

* weekend
* work
* hobbies
* movies
* travel
* family
* daily life

---

## 2. Job Interview

AI = Interviewer

Topics:

* introduction
* experience
* strengths
* weaknesses
* projects
* technical questions
* salary
* career goals

---

## 3. Client Conversation

AI = Client

Scenario:

Discuss a project, requirements, deadline and budget.

---

## 4. Debate

AI = Debate opponent.

The system assigns:

* topic
* user's position
* AI's position

AI must challenge the user.

---

## 5. Bargaining

AI = Seller.

User must negotiate price.

Example:

Initial price:

₹2,500

User budget:

₹1,500

The AI should negotiate realistically.

---

# 15. FUTURE SCENARIOS

Add:

* Salary negotiation
* Manager discussion
* Team meeting
* Networking
* Presentation
* Sales call
* Customer complaint
* Customer support
* Airport
* Hotel
* Restaurant
* Taxi
* Shopping
* Doctor appointment
* Landlord
* Job promotion
* Asking for leave
* Difficult coworker
* Angry customer
* Cold calling
* Business meeting
* Project requirement gathering

---

# 16. AI PERSONALITY SYSTEM

Allow configuration of:

### Personality

* Friendly
* Professional
* Strict
* Talkative
* Quiet
* Impatient
* Difficult
* Supportive
* Confident
* Serious

### Voice

* Male
* Female
* Random

### Age style

* Young
* Adult
* Senior

### Accent

Potentially:

* American
* British
* Indian
* Australian

Do not make accents the primary scoring criterion.

Focus on understandable English and communication.

---

# 17. DIFFICULTY SYSTEM

Difficulty should not simply change vocabulary.

It should change conversation behavior.

## Beginner

* slower speech
* shorter sentences
* simple vocabulary
* more supportive

## Intermediate

* normal speaking speed
* natural vocabulary
* follow-up questions

## Upper Intermediate

* spontaneous conversation
* topic changes
* occasional interruption

## Advanced

* fast conversation
* complex topics
* disagreement
* indirect communication
* idioms

## Expert

* native-like conversation
* unexpected topics
* interruptions
* subtle meanings
* negotiation
* challenging responses

---

# 18. REALTIME CONVERSATION RULE

During normal conversation:

DO NOT continuously correct grammar.

The AI should behave like the role.

Example:

User:

"I am agree with you."

AI should normally continue the conversation.

After the session:

"I agree with you."

The system should explain the correction.

---

# 19. EXCEPTION

If the AI cannot understand the user:

AI can say:

"Sorry, could you say that again?"

This itself becomes useful English practice.

---

# 20. LIVE CORRECTION MODE

Optional user setting:

## OFF

Natural conversation.

## ON

AI may occasionally correct major errors.

Do not interrupt every sentence.

---

# 21. REAL PHONE CALL MODE

Future feature.

User provides phone number.

System initiates a real telephone call.

Architecture:

Phone
↓
Telephony provider
↓
Voice streaming
↓
AI realtime engine
↓
AI response
↓
Phone

The telephony provider must be abstracted behind:

TelephonyProvider

Potential providers can include:

* Twilio
* Exotel
* other regional providers

Do not implement this in MVP unless required.

---

# 22. CALL SCREEN

The mobile conversation screen should feel like a phone call.

Display:

* AI avatar
* AI name
* scenario
* microphone state
* listening indicator
* speaking indicator
* call duration
* mute
* speaker/headset
* end call

Avoid excessive text.

The user should be able to speak without looking at the screen.

---

# 23. CONVERSATION FLOW

## Start

User selects:

Scenario

AI personality

Voice

Difficulty

Conversation duration

Example:

```text
Scenario:
Job Interview

AI:
Female

Difficulty:
Intermediate

Duration:
10 minutes
```

Then:

Start Conversation

---

# 24. PRE-CONVERSATION BRIEF

Show:

Scenario:

"Job interview for a senior web developer position."

Objective:

"Answer questions naturally and explain your experience."

Do not show all AI questions.

The user should not be able to memorize answers.

---

# 25. DURING CONVERSATION

AI maintains:

* scenario context
* conversation state
* user answers
* goals
* difficulty
* previous mistakes
* conversation history

AI should dynamically ask follow-up questions.

---

# 26. CONVERSATION END

End when:

* time limit reached
* scenario objective completed
* user ends call
* AI detects natural completion

Then process the conversation.

---

# 27. POST-CONVERSATION ANALYSIS

Generate:

## Overall score

Example:

78/100

But never make this score the only feedback.

---

# 28. SKILL SCORES

Track:

* Fluency
* Grammar
* Vocabulary
* Pronunciation
* Listening
* Response speed
* Conversation flow
* Confidence indicators
* Clarity
* Relevance

Scores should be explainable.

Avoid fake precision.

For example, do not claim:

"Your confidence is exactly 74%."

Instead:

"Your responses were generally clear and decisive."

If a numeric score is used, explain its basis.

---

# 29. GRAMMAR ANALYSIS

For every important mistake:

Store:

```text
Original sentence
Corrected sentence
Grammar category
Explanation
Severity
```

Example:

Original:

"Yesterday I go to office."

Correction:

"Yesterday I went to the office."

Category:

Past tense

---

# 30. VOCABULARY ANALYSIS

Identify:

* repeated words
* basic vocabulary
* advanced vocabulary
* useful alternatives

Example:

User repeatedly says:

"very good"

Suggestions:

* excellent
* impressive
* effective
* outstanding

Do not overwhelm the learner with dozens of alternatives.

---

# 31. FILLER ANALYSIS

Track:

* um
* uh
* actually
* basically
* like
* you know

Show:

"You used filler words frequently during pauses."

Then provide examples and practice.

---

# 32. RESPONSE SPEED

Measure:

* time to first response
* average response latency
* long pauses

Do not interpret every pause negatively.

Natural thinking pauses are normal.

---

# 33. CONVERSATION QUALITY

Measure:

* follow-up questions
* relevant responses
* topic continuity
* clarification
* ability to elaborate
* ability to disagree
* ability to continue conversation

---

# 34. PERSONAL LEARNING PROFILE

Create:

UserLearningProfile

Fields:

```text
english_level
fluency_level
grammar_level
vocabulary_level
pronunciation_level
common_errors
common_fillers
weak_topics
strong_topics
preferred_scenarios
speaking_time
conversation_count
```

This profile should evolve after every session.

---

# 35. ADAPTIVE LEARNING

The system should use previous performance.

Example:

If user repeatedly struggles with past tense:

Future conversations should naturally create opportunities to use past tense.

Do not explicitly say:

"Now practice past tense."

Instead, ask:

"What did you do last weekend?"

Then analyze the response.

---

# 36. PERSONALIZED PRACTICE

After a session:

Recommended practice:

1. 5-minute friendly conversation
2. Past-tense practice
3. Vocabulary challenge
4. Shadowing exercise

---

# 37. SHADOWING MODE

AI says a sentence.

User repeats it.

Analyze:

* pronunciation
* timing
* rhythm
* clarity
* pauses

Store results.

---

# 38. RETRY CONVERSATION

Allow:

"Try Again"

The same scenario can be replayed with:

* different questions
* same objective
* previous weakness targeted

Example:

First interview:

Weakness = concise answers.

Second interview:

AI encourages longer explanations.

---

# 39. RANDOM MODE

Create:

## Surprise Conversation

The user doesn't know the scenario in advance.

AI starts naturally.

The user must understand the context.

This tests spontaneous speaking.

---

# 40. REAL LIFE CHALLENGE MODE

Instead of simply selecting a topic, provide a mission.

Example:

"You have ₹1,500. The seller wants ₹2,500. Negotiate the price."

The user must complete the mission through English.

---

# 41. "I DON'T KNOW THE WORD" SUPPORT

If user says:

"I don't know how to say..."

AI should help them continue.

Example:

User:

"I don't know the word for..."

AI:

"Do you mean screwdriver?"

User:

"Yes."

Continue conversation.

---

# 42. MULTILINGUAL SUPPORT

Conversation remains English.

Feedback/explanation language can be:

* English
* Hindi
* Marathi
* Tamil
* Telugu
* Bengali
* etc.

This should be configurable.

---

# 43. THINK-IN-ENGLISH MODE

Advanced feature.

Detect patterns suggesting direct translation.

Provide feedback such as:

"Try building shorter English phrases directly instead of translating the complete sentence."

Do not claim to know exactly what language the user thought in.

---

# 44. USER DASHBOARD

Mobile dashboard:

* today's practice
* streak
* speaking time
* recent sessions
* current level
* recommended practice

---

# 45. WEB DASHBOARD

Detailed analytics:

## Overview

* total conversations
* speaking time
* average session
* improvement trend

## Skills

* fluency
* grammar
* vocabulary
* pronunciation

## Mistakes

* common grammar mistakes
* recurring vocabulary issues
* fillers

## History

All conversations.

---

# 46. DATA MODEL

Core tables:

```text
users
profiles
user_settings

scenarios
scenario_categories
scenario_versions

ai_personas
ai_voices

conversation_sessions
conversation_turns
conversation_events

session_analysis
grammar_errors
vocabulary_items
pronunciation_results
fluency_metrics

learning_profiles
learning_goals
practice_recommendations

achievements
user_achievements
streaks

subscriptions
usage_records

notifications
```

---

# 47. CONVERSATION SESSION

Example structure:

```text
ConversationSession
├── id
├── userId
├── scenarioId
├── personaId
├── voiceId
├── difficulty
├── startedAt
├── endedAt
├── duration
├── status
├── transcript
├── analysisStatus
└── analysisId
```

---

# 48. CONVERSATION TURN

```text
ConversationTurn
├── id
├── sessionId
├── speaker
├── timestamp
├── text
├── audioReference
├── duration
└── metadata
```

Speaker:

* USER
* AI

---

# 49. API STRUCTURE

Use REST for standard application operations.

Example:

```text
POST /auth/login
POST /auth/register

GET /scenarios
GET /scenarios/:id

POST /conversations
GET /conversations
GET /conversations/:id

POST /conversations/:id/end

GET /conversations/:id/analysis

GET /profile
PATCH /profile

GET /progress
GET /recommendations

GET /vocabulary
GET /mistakes

POST /practice/shadowing

GET /subscriptions
```

Realtime voice should use the realtime transport rather than normal REST requests.

---

# 50. AUTHENTICATION

Support:

* email/password
* Google login
* optionally phone authentication

Use secure sessions/tokens.

Never store plaintext passwords.

---

# 51. SECURITY

Required:

* HTTPS
* secure token storage
* rate limiting
* API authentication
* authorization checks
* input validation
* request logging
* abuse prevention
* audio access control

Users must only access their own conversations.

---

# 52. PRIVACY

Voice conversations are potentially sensitive.

The system should clearly explain:

* whether audio is stored
* how long it is stored
* whether transcripts are stored
* how users can delete sessions
* how AI providers process data

Implement deletion support.

---

# 53. AUDIO STORAGE

Do not store audio permanently by default unless necessary.

Possible approach:

* realtime audio processed
* transcript stored
* audio optionally retained
* user controls retention

Use object storage for retained recordings.

---

# 54. OBSERVABILITY

Use:

Sentry

Structured backend logging

Metrics:

* voice session failures
* realtime latency
* AI response latency
* API errors
* transcription failures
* analysis failures
* token usage
* AI cost/session

---

# 55. COST CONTROL

Track AI usage per user.

Store:

```text
input_audio_duration
output_audio_duration
input_tokens
output_tokens
estimated_cost
```

Implement usage limits.

Do not allow uncontrolled AI usage on free accounts.

---

# 56. SUBSCRIPTION MODEL

Potential future plans:

## Free

Limited daily conversations.

## Pro

Higher/unlimited usage subject to fair-use limits.

## Premium

Advanced scenarios

Detailed analytics

Pronunciation

Personalized learning

Real phone calls

## Corporate

Seat-based pricing.

---

# 57. NOTIFICATIONS

Examples:

"Your 10-minute English practice is waiting."

"You're on a 7-day speaking streak."

"You improved your speaking time this week."

Do not make notifications manipulative or excessive.

Allow users to control them.

---

# 58. GAMIFICATION

Optional:

* XP
* levels
* streak
* badges
* challenges

Examples:

First Conversation

10-Minute Speaker

Debate Challenge

Interview Complete

Negotiation Challenge

100 Minutes Spoken

---

# 59. DESIGN SYSTEM

Design should feel:

* modern
* premium
* calm
* voice-first
* minimal
* approachable

Avoid making it look like a children's education application.

Primary action:

START CONVERSATION

Large voice interaction controls.

---

# 60. MOBILE NAVIGATION

Recommended:

```text
Home
Practice
History
Progress
Profile
```

Home:

Start Conversation

Practice:

Scenario library

History:

Past conversations

Progress:

Analytics

Profile:

Settings/account

---

# 61. CONVERSATION UX

Before call:

Scenario selection

↓

AI/personality selection

↓

Difficulty

↓

Duration

↓

Start

↓

Voice conversation

↓

End

↓

Processing

↓

Analysis

↓

Recommendations

---

# 62. MVP SCOPE

DO NOT build the entire platform initially.

MVP must include:

### Authentication

* Google/email login

### Mobile

* Android app
* onboarding
* home
* scenario selection
* voice call
* call controls
* session history

### AI

* realtime voice conversation
* scenario prompts
* personality
* male/female voice
* dynamic follow-up

### Analysis

* transcript
* grammar feedback
* vocabulary
* fluency
* filler words
* basic score

### Backend

* NestJS
* PostgreSQL
* Prisma
* authentication
* session management

### Web

Basic admin/analytics dashboard.

---

# 63. MVP SCENARIOS

Only:

1. Friendly Conversation
2. Job Interview
3. Client Meeting
4. Debate
5. Bargaining

Do not build 50 scenarios before validating the core voice experience.

---

# 64. MVP SUCCESS METRICS

Track:

* conversation completion rate
* average conversation duration
* sessions/user/week
* speaking minutes/user
* retry rate
* retention
* percentage of users completing second session
* AI voice failure rate
* average realtime latency

The most important product metric should be:

## Speaking minutes per active user

---

# 65. DEVELOPMENT PHASES

## Phase 1 — Foundation

* repository
* monorepo
* TypeScript
* database
* authentication
* API
* mobile shell
* web shell

## Phase 2 — Voice

* realtime voice
* microphone
* audio playback
* interruption
* session lifecycle

## Phase 3 — Conversation Engine

* scenario engine
* persona
* difficulty
* conversation state
* objectives

## Phase 4 — Analysis

* transcript
* grammar
* vocabulary
* fluency
* fillers

## Phase 5 — Dashboard

* history
* progress
* analytics

## Phase 6 — Polish

* UX
* error handling
* performance
* monitoring
* cost optimization

---

# 66. REPOSITORY STRUCTURE

Prefer a monorepo:

```text
english-ai/
│
├── apps/
│   ├── mobile/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── shared/
│   ├── types/
│   ├── validation/
│   ├── ai/
│   └── config/
│
├── prisma/
│
├── docs/
│
├── scripts/
│
├── .github/
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Use pnpm.

---

# 67. TYPESCRIPT RULES

Use strict TypeScript.

Avoid:

```typescript
any
```

unless genuinely unavoidable and documented.

Use shared types where appropriate.

Validate external data at boundaries.

Recommended:

Zod

---

# 68. CODE QUALITY

Rules:

* small modules
* single responsibility
* typed interfaces
* reusable components
* no duplicated business logic
* no secrets in source code
* environment variables for credentials
* meaningful naming
* automated linting
* automated formatting
* unit tests for critical logic

---

# 69. TESTING

Backend:

* unit tests
* integration tests

Frontend:

* component tests
* basic E2E

Critical tests:

* authentication
* conversation creation
* authorization
* session lifecycle
* AI provider failures
* analysis pipeline

---

# 70. ERROR HANDLING

Voice conversation failures must be graceful.

If AI connection fails:

Show:

"Connection lost. Reconnecting..."

Attempt reconnection.

If unsuccessful:

"Your conversation could not continue. Your session has been saved."

Never silently lose the session.

---

# 71. AI PROMPT ARCHITECTURE

Separate:

## System instructions

Permanent behavior.

## Scenario instructions

Current role/objective.

## User profile

English level and known weaknesses.

## Session state

Current conversation context.

## Safety rules

Always enforced.

Do not put everything into one enormous prompt.

---

# 72. AI ROLE RULE

The AI must stay in character during the conversation.

Example:

Interview mode:

AI should behave like an interviewer.

It should NOT say:

"Your grammar is wrong."

unless live correction mode is enabled.

---

# 73. AI SAFETY

The AI should avoid:

* harmful advice
* abusive interactions
* inappropriate sexual content
* harassment
* manipulation
* impersonation of real people
* sensitive personal data requests

Difficult personalities should remain within reasonable boundaries.

---

# 74. SCENARIO CONFIGURATION

Scenarios should be database-driven.

Do NOT hard-code each scenario into application logic.

Example:

```json
{
  "name": "Salary Negotiation",
  "difficulty": "advanced",
  "role": "hiring_manager",
  "objective": "negotiate_salary",
  "initialOffer": 800000,
  "maxOffer": 1100000
}
```

---

# 75. AI EVALUATION

Evaluation should happen AFTER the conversation.

Input:

* transcript
* timestamps
* audio metadata where available
* scenario
* user level

Output structured JSON:

```json
{
  "fluency": 78,
  "grammar": 72,
  "vocabulary": 81,
  "conversation_flow": 76,
  "errors": [],
  "vocabularySuggestions": [],
  "recommendations": []
}
```

Validate this output with Zod.

Never trust raw LLM JSON without validation.

---

# 76. IMPORTANT: SEPARATE CONVERSATION AI FROM EVALUATION AI

Do not use the same prompt for both.

### Conversation AI

Optimized for:

* naturalness
* speed
* role-play
* realtime

### Evaluation AI

Optimized for:

* accuracy
* detailed analysis
* structured feedback

This separation is important.

---

# 77. ADMIN PANEL

Admin should manage:

* users
* scenarios
* personas
* voices
* difficulty
* prompt versions
* subscriptions
* usage
* reported issues

Admin should be able to activate/deactivate scenarios.

---

# 78. PROMPT VERSIONING

Every scenario should have a prompt version.

Example:

```text
Interview v1
Interview v2
Interview v3
```

Store which version was used for every conversation.

This makes AI behavior reproducible and debuggable.

---

# 79. ANALYTICS EVENTS

Track events:

```text
app_opened
scenario_viewed
scenario_started
conversation_started
conversation_completed
conversation_abandoned
analysis_completed
feedback_viewed
retry_started
subscription_started
```

Do not collect unnecessary personal data.

---

# 80. FUTURE FEATURES

After MVP:

### Real phone calls

### AI calling user automatically

### Wake-up English calls

### Morning conversation

### AI English tutor

### Pronunciation coach

### Shadowing

### Advanced accent training

### Corporate English

### Teacher dashboard

### Group conversations

### AI + human teacher hybrid

### Multiplayer English debate

### AI role-play marketplace

---

# 81. CORPORATE VERSION

Potential future architecture:

Company

↓

Departments

↓

Employees

↓

Learning plans

↓

Scenarios

↓

Analytics

Managers could see aggregated training progress while respecting employee privacy.

---

# 82. KEY PRODUCT DIFFERENTIATOR

The product should not compete primarily on:

"AI can speak English."

Many products can do that.

The differentiation should be:

## REAL CONVERSATION + REAL SCENARIOS + PERSONALIZED FEEDBACK

The user should feel:

> "I practiced something I might actually have to say tomorrow."

---

# 83. MVP ACCEPTANCE CRITERIA

MVP is considered successful when:

1. User can create account.
2. User can install Android app.
3. User can select a scenario.
4. User can select AI voice.
5. User can start realtime conversation.
6. User can speak naturally.
7. AI responds with low perceived latency.
8. AI stays in scenario character.
9. AI can ask dynamic follow-up questions.
10. User can interrupt AI appropriately.
11. User can end conversation.
12. Transcript is saved.
13. Analysis is generated.
14. Grammar mistakes are identified.
15. Vocabulary suggestions are generated.
16. Fluency feedback is generated.
17. User can review history.
18. User can start another conversation.
19. User data is securely isolated.
20. AI failures do not lose the session.

---

# 84. CLAUDE CODE DEVELOPMENT INSTRUCTIONS

Claude Code should NOT immediately start generating the entire application.

First:

1. Analyze this PRD.
2. Identify technical ambiguities.
3. Produce architecture proposal.
4. Produce database schema.
5. Produce API specification.
6. Produce folder structure.
7. Produce realtime voice architecture.
8. Identify external services required.
9. Identify environment variables.
10. Identify MVP risks.
11. Ask only essential clarification questions.

Then create:

```text
/docs/PRD.md
/docs/ARCHITECTURE.md
/docs/DATABASE.md
/docs/API.md
/docs/AI-ARCHITECTURE.md
/docs/VOICE-ARCHITECTURE.md
/docs/DEVELOPMENT-PLAN.md
/docs/SECURITY.md
/docs/README.md
```

Only after the architecture is approved should implementation begin.

---

# 85. CLAUDE CODE RULES

Claude must:

* use TypeScript
* use strict typing
* avoid unnecessary dependencies
* avoid placeholder implementations presented as complete
* never hard-code API keys
* never commit secrets
* use environment variables
* validate external API responses
* create reusable components
* write tests for critical functionality
* document important architectural decisions
* preserve existing functionality when modifying code
* run lint/typecheck/tests after meaningful changes

---

# 86. DEVELOPMENT ORDER

Implement in this order:

```text
1. Repository
2. Monorepo
3. Shared types
4. Database
5. Authentication
6. Backend foundation
7. Mobile foundation
8. Web foundation
9. Scenario engine
10. AI provider abstraction
11. Realtime voice
12. Conversation lifecycle
13. Transcript
14. Evaluation engine
15. Feedback UI
16. History
17. Progress
18. Monitoring
19. Testing
20. Production deployment
```

Do NOT start with advanced gamification.

The realtime conversation experience is the core product.

---

# 87. FIRST DEVELOPMENT MILESTONE

The first usable prototype should achieve only this:

```text
Open Android app
      ↓
Select "Friendly Conversation"
      ↓
Select female voice
      ↓
Start
      ↓
AI speaks
      ↓
User responds
      ↓
AI responds
      ↓
User interrupts
      ↓
AI continues naturally
      ↓
End call
      ↓
Transcript appears
```

If this feels natural, continue building the rest.

If this doesn't feel natural, do not spend time building dashboards and gamification yet.

---

# 88. PRODUCT NORTH STAR

The final product should make a user comfortable enough to think:

> "I can call this AI every day and practice speaking English without feeling embarrassed."

The ultimate goal is not to teach English through lessons.

The goal is to give the user:

# A SAFE PLACE TO HAVE REAL CONVERSATIONS.

---

# 89. INITIAL PROJECT NAME

Use a temporary internal name:

**Talkel**

Do not treat this as the final brand name.

The architecture must remain independent of the product name.

---

# 90. FINAL ARCHITECTURE SUMMARY

> Superseded in detail by [ARCHITECTURE.md](ARCHITECTURE.md) and [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md) (see Amendment A2). Original diagram retained for reference.

```text
Android App (React Native, Expo + TS)
   │ Realtime Voice
   ▼
AI Voice Gateway (Realtime Provider)
   ▼
Conversation Engine (Scenario, Persona, Difficulty, Session State, Objectives)
   ▼
AI Provider Abstraction
   ▼
PostgreSQL / Prisma
   ▼
Evaluation Pipeline (Grammar, Vocabulary, Fluency, Pronunciation, Conversation Quality)
   ▼
Learning Profile (Weaknesses, Progress, Recommendations)

Web Dashboard (Next.js): Analytics, History, Progress, Admin
```

# END OF MASTER PRD

---

# AMENDMENT (2026-10-01): Positioning and Missions

**Name:** Talkel — *Your AI Conversation Partner.*

**Positioning:** competitors are AI English *tutors* (many modes, corrections, avatars). Talkel is an AI **conversation
simulator**: practise the conversations that matter, with a partner that has its own goals, adapts to your level and
mistakes, and gives an honest, evidence-based result. We compete on making each conversation feel like a real event with an
objective and a consequence — not on the number of modes.

**Core loop:** 🎯 Mission → 📞 Conversation → 🧠 Result & analysis → 🔄 Retry harder → 📈 Progress.

**Missions (new tab; Practice stays for open-ended conversations):**
- A situation, the user's objectives, and an AI character with its own hidden objective (e.g. a manager who may approve at
  most 12% but opens at 7%).
- Five pressure levels — Comfortable, Natural, Challenging, Pressure, Real world — separate from English level. Passing a
  level unlocks the next.
- Result: SUCCESS / PARTIAL / FAILED with a factual headline, objectives achieved, mission-specific skills (persuasion,
  assertiveness, empathy, composure, structure, professionalism, politeness) and a mission score (½ communication +
  ½ objectives). No invented precision (§28): every score has a stated basis.

**Deliberately not pursued now:** pronunciation scoring (needs audio analysis), animated avatars, matching competitors' mode
count. **Next:** "Try that answer again", three-register rewrites, personal memory (with consent).

