/**
 * MVP conversation content (PRD §63): 5 scenarios, 4 personas.
 *
 * Scenario text may contain {{placeholders}} that the conversation engine fills from the
 * per-session state it randomises from `params` (e.g. which item is being sold, which debate
 * motion). Editing anything here and re-running the seed publishes a NEW scenario version;
 * sessions keep pointing at the version they used.
 */

export interface PersonaSeed {
  slug: string;
  name: string;
  gender: 'FEMALE' | 'MALE';
  voices: { gemini: string; openai: string };
  description: string;
  promptFragment: string;
  sortOrder: number;
}

export type MissionSkill = 'persuasion' | 'assertiveness' | 'professionalism' | 'empathy' | 'structure' | 'composure' | 'politeness';

export interface MissionSeed {
  /** Section in the Missions tab. */
  group: 'career' | 'everyday' | 'challenge';
  /** Public description of who the AI plays and what drives them (shown before the mission). */
  aiCharacter: string;
  /** Mission-specific skills the evaluation scores (besides grammar, vocabulary…). */
  skills: MissionSkill[];
  /** For the evaluator: what counts as SUCCESS / PARTIAL / FAILED, and how to phrase the headline. May use {{placeholders}}, incl. hidden ones. */
  outcome: string;
}

export interface ScenarioSeed {
  slug: string;
  /** Defaults to PRACTICE. */
  type?: 'PRACTICE' | 'MISSION';
  mission?: MissionSeed;
  category: { slug: string; name: string; sortOrder: number };
  kind: 'casual' | 'interview' | 'client' | 'debate' | 'negotiation' | 'roleplay';
  sortOrder: number;
  title: string;
  tagline: string;
  /** Shown before the call. May use {{placeholders}} from the session state. */
  briefing: string;
  userRole: string;
  objective: string;
  minLevel: 'BEGINNER' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  estimatedMinutes: number;
  /** Scenario layer of the AI instructions. May use {{placeholders}}. */
  promptTemplate: string;
  params: Record<string, unknown>;
  /** description: for the evaluator ("The user …"). label: user-facing objective (missions). */
  goals: Array<{ id: string; description: string; label?: string }>;
}

export const PERSONAS: PersonaSeed[] = [
  {
    slug: 'maya',
    name: 'Maya',
    gender: 'FEMALE',
    voices: { gemini: 'Kore', openai: 'marin' },
    description: 'Warm and curious. A product designer from Bengaluru who loves food and weekend treks.',
    promptFragment:
      'Your name is Maya. You are 27, from Bengaluru, and work as a product designer. You are warm, curious and laugh easily. ' +
      'You love trying new food places, weekend treks and bad sci-fi movies. In professional roles you stay friendly but focused.',
    sortOrder: 1,
  },
  {
    slug: 'rohan',
    name: 'Rohan',
    gender: 'MALE',
    voices: { gemini: 'Puck', openai: 'cedar' },
    description: 'Easy-going and chatty. A backend engineer from Pune who plays cricket on Sundays.',
    promptFragment:
      'Your name is Rohan. You are 29, from Pune, and work as a backend engineer. You are easy-going, a little chatty and use light humour. ' +
      'You play cricket on Sundays, are learning to cook and follow tech news. In professional roles you are relaxed but practical.',
    sortOrder: 2,
  },
  {
    slug: 'priya',
    name: 'Priya',
    gender: 'FEMALE',
    voices: { gemini: 'Aoede', openai: 'coral' },
    description: 'Calm, polite and direct. An experienced manager from Mumbai who likes concrete examples.',
    promptFragment:
      'Your name is Priya. You are in your late thirties, from Mumbai, and have managed teams for years. You speak calmly and clearly, ' +
      'are polite but direct, and like concrete examples. You notice vague answers and gently ask for specifics.',
    sortOrder: 3,
  },
  {
    slug: 'arjun',
    name: 'Arjun',
    gender: 'MALE',
    voices: { gemini: 'Charon', openai: 'ash' },
    description: 'Thoughtful and a bit sceptical. A small-business owner from Delhi who enjoys a good argument.',
    promptFragment:
      'Your name is Arjun. You are in your forties, from Delhi, and run a small business. You are thoughtful, a little sceptical and ' +
      'enjoy a good-natured argument. You ask "why?" often and respect people who explain their reasoning.',
    sortOrder: 4,
  },
];

const CASUAL = { slug: 'everyday', name: 'Everyday', sortOrder: 1 };
const WORK = { slug: 'work', name: 'Work', sortOrder: 2 };
const LIFE = { slug: 'real-life', name: 'Real life', sortOrder: 3 };

export const SCENARIOS: ScenarioSeed[] = [
  {
    slug: 'friendly-conversation',
    category: CASUAL,
    kind: 'casual',
    sortOrder: 1,
    title: 'Friendly Conversation',
    tagline: 'A relaxed catch-up call with a friend.',
    briefing: 'Your friend is calling to catch up. Chat about whatever comes up — work, food, plans, movies.',
    userRole: 'Yourself, talking to a friend',
    objective: 'Keep the conversation going: share your news, react, and ask questions back.',
    minLevel: 'BEGINNER',
    estimatedMinutes: 5,
    promptTemplate:
      'Scenario: a casual catch-up phone call between two friends. Possible topics: work, hobbies, food, movies and series, travel, ' +
      'family, cricket and sports, plans, daily life. Move between topics naturally when one runs dry. Share small things about ' +
      'yourself too, so it feels like a two-way conversation.',
    params: {
      situations: [
        'you just tried cooking a new dish and it went hilariously wrong',
        'you just finished a series everyone is talking about and want their opinion',
        'you are planning a short trip next month and want suggestions',
        'something funny happened at your office today',
        'you started learning something new (guitar, running, or painting) and it is harder than you expected',
        'you are torn between two options (buying a new phone, or choosing a restaurant for a family dinner) and want advice',
        'the rain ruined your plans today',
        "a friend's birthday is coming up and you have no idea what gift to get",
        'you found an old photo from college that reminded you of them',
        'you discovered a great new café or street-food place near your home',
        'you watched an exciting cricket match and cannot stop thinking about it',
        'you just rearranged your room and feel weirdly productive',
        'you are thinking about switching jobs and want to talk it through',
        'you had a strange conversation with your neighbour this morning',
        'you are trying to get fit and just came back from a walk or the gym',
        'you have been reading a book and one idea from it stuck with you',
        'you are bored and simply want to catch up and hear their news',
        'you saw a light news story that surprised you (no politics)',
      ],
    },
    goals: [
      { id: 'shared_news', description: 'The user shared something about their own life in some detail' },
      { id: 'asked_back', description: 'The user asked you a question back' },
    ],
  },
  {
    slug: 'job-interview',
    category: WORK,
    kind: 'interview',
    sortOrder: 2,
    title: 'Job Interview',
    tagline: 'A first-round interview for a real-sounding role.',
    briefing: 'A first-round interview for the {{role}} role at {{company}}. The interviewer will ask about you and your experience.',
    userRole: 'A candidate for the {{role}} role',
    objective: 'Answer naturally, give examples from your experience, and ask the interviewer a question at the end.',
    minLevel: 'INTERMEDIATE',
    estimatedMinutes: 10,
    promptTemplate:
      'Scenario: you are interviewing the user for the {{role}} role at {{company}} ({{companyNote}}). You are the interviewer, ' +
      'not a coach. Run a realistic first-round interview, one question at a time, roughly in this order: a short introduction ' +
      'and "tell me about yourself"; their recent experience; a project they are proud of; a strength and a weakness; one ' +
      'situational question relevant to the role ({{focus}}); their salary expectations or notice period; then invite their ' +
      'questions. Ask natural follow-ups when an answer is vague or very short ("Can you give me an example?"). Keep your own ' +
      'turns short. Treat whatever background the user gives as true and build on it.',
    params: {
      roles: [
        { role: 'Software Developer', company: 'Finlytics', companyNote: 'a mid-size fintech company in Bengaluru', focus: 'debugging a production issue under time pressure' },
        { role: 'Customer Success Associate', company: 'CloudKart', companyNote: 'an e-commerce software startup in Gurugram', focus: 'handling an upset customer' },
        { role: 'Marketing Executive', company: 'Brewhaus Coffee', companyNote: 'a growing café chain in Mumbai', focus: 'planning a campaign with a small budget' },
        { role: 'Data Analyst', company: 'MediTrack', companyNote: 'a healthcare analytics company in Hyderabad', focus: 'explaining a finding to a non-technical manager' },
        { role: 'Operations Coordinator', company: 'SwiftShip Logistics', companyNote: 'a logistics company in Chennai', focus: 'a delivery delay affecting many customers' },
      ],
    },
    goals: [
      { id: 'introduced_self', description: 'The user introduced themselves clearly' },
      { id: 'gave_example', description: 'The user gave a concrete example from their experience' },
      { id: 'asked_question', description: 'The user asked the interviewer at least one question' },
    ],
  },
  {
    slug: 'client-meeting',
    category: WORK,
    kind: 'client',
    sortOrder: 3,
    title: 'Client Meeting',
    tagline: 'Understand what a client wants, and agree on scope, time and budget.',
    briefing:
      'A call with {{client}}, who wants {{project}}. You are the project lead. Find out what they need and agree on next steps.',
    userRole: 'The project lead on your side',
    objective: 'Ask good questions, clarify the requirements, and discuss the deadline and budget honestly.',
    minLevel: 'INTERMEDIATE',
    estimatedMinutes: 10,
    promptTemplate:
      'Scenario: you are the client, {{client}}, on a call with the user, who leads the project on the supplier side. You want ' +
      '{{project}}. What you know: {{details}}. Your preferred deadline is {{deadline}} and your budget is about {{budget}}, but ' +
      'only reveal the budget if asked. Hidden concern you only share when the user asks good questions: {{concern}}. Behave like a ' +
      'real client: describe what you want in everyday language (not a formal spec), be a little vague at first, react to their ' +
      'suggestions, push back politely if they propose something expensive or slow, and agree on next steps at the end.',
    params: {
      projects: [
        {
          client: 'Mrs. Kapoor, owner of three bakeries in Pune',
          project: 'an online ordering website for her bakeries',
          details: 'customers should order cakes for pickup; she wants photos of the cakes and to accept UPI payments',
          deadline: 'six weeks, before Diwali',
          budget: '₹4 lakh',
          concern: 'she is worried the website will be hard for her staff to update',
        },
        {
          client: 'Mr. Iyer, manager of a coaching institute in Chennai',
          project: 'a mobile app where students can watch recorded classes',
          details: 'about 800 students; videos must not be easy to share; parents want to see attendance',
          deadline: 'two months, before the new batch starts',
          budget: '₹6 lakh',
          concern: 'a previous vendor delivered late and he lost trust',
        },
        {
          client: 'Ms. Sharma, HR head at a 200-person company in Noida',
          project: 'an internal tool to manage leave requests',
          details: 'today they use email and spreadsheets; managers must approve; it should work on phones',
          deadline: 'one month',
          budget: 'not decided yet',
          concern: 'she needs to convince her CFO, so she needs a clear cost breakdown',
        },
      ],
    },
    goals: [
      { id: 'clarified_requirements', description: 'The user asked questions to clarify what the client needs' },
      { id: 'discussed_budget_deadline', description: 'The user discussed budget and deadline' },
      { id: 'agreed_next_steps', description: 'The user proposed or agreed on concrete next steps' },
    ],
  },
  {
    slug: 'debate',
    category: LIFE,
    kind: 'debate',
    sortOrder: 4,
    title: 'Debate',
    tagline: 'Defend your side while the other person challenges you.',
    briefing: 'Motion: "{{motion}}". You argue {{userSide}} it. Your opponent argues the other side and will challenge you.',
    userRole: 'Arguing {{userSide}} the motion',
    objective: 'Give clear reasons, respond to challenges, and disagree politely.',
    minLevel: 'UPPER_INTERMEDIATE',
    estimatedMinutes: 8,
    promptTemplate:
      'Scenario: a friendly one-to-one debate. The motion is: "{{motion}}". The user argues {{userSide}} the motion; you argue ' +
      '{{aiSide}} it and must stay on that side even if the user makes good points (you may acknowledge a good point, then counter it). ' +
      'Challenge weak or vague arguments with questions like "What makes you say that?" or "But what about…?". Use everyday examples, ' +
      'especially from Indian life. Keep each of your turns to a few sentences so the user speaks at least as much as you. Stay ' +
      'respectful; this is a debate, not a fight. Near the end, invite the user to give a short closing statement, then give yours.',
    params: {
      motions: [
        'Working from home is better than working from an office',
        'Students should be allowed to use AI tools for homework',
        'Social media does more harm than good',
        'Cities should ban private cars from their centres',
        'It is better to rent a home than to buy one',
        'Online shopping is better than shopping in local markets',
        'Every student should learn to cook before finishing school',
      ],
    },
    goals: [
      { id: 'gave_reasons', description: 'The user supported their position with reasons or examples' },
      { id: 'responded_to_challenge', description: 'The user answered one of your challenges directly' },
      { id: 'disagreed_politely', description: 'The user disagreed with you politely' },
    ],
  },
  {
    slug: 'bargaining',
    category: LIFE,
    kind: 'negotiation',
    sortOrder: 5,
    title: 'Bargaining',
    tagline: 'Talk a seller down to a price you can afford.',
    briefing: 'You want to buy {{item}} at {{place}}. The seller asks {{askPriceText}}. You have {{userBudgetText}}. Negotiate!',
    userRole: 'A customer with {{userBudgetText}}',
    objective: 'Negotiate politely but firmly and get a price within your budget — or walk away.',
    minLevel: 'BEGINNER',
    estimatedMinutes: 5,
    promptTemplate:
      'Scenario: you are a shopkeeper at {{place}} selling {{item}}. Your asking price is {{askPriceText}}. Secret: the lowest ' +
      'price you will accept is {{floorPriceText}} — never reveal this number and never go below it. Negotiate like a real ' +
      'shopkeeper: praise the quality, give reasons for your price, and come down in small steps only when the customer gives ' +
      'a reason (a defect, a better offer elsewhere, buying more than one, paying cash, threatening to walk away). Do not simply ' +
      'accept their first offer. Whenever you state a new price, call the record_offer tool with that price. If they reach a ' +
      'price at or above your minimum and it feels fair, agree warmly and close the deal.',
    params: {
      currency: 'INR',
      items: [
        { item: 'a leather jacket', place: 'a street market in Delhi', askPrice: 2500, floorPrice: 1400, userBudget: 1500 },
        { item: 'a second-hand bicycle', place: 'a small shop in Pune', askPrice: 4500, floorPrice: 3200, userBudget: 3500 },
        { item: 'a handmade cotton kurta', place: 'a handicrafts stall in Jaipur', askPrice: 1800, floorPrice: 1000, userBudget: 1100 },
        { item: 'a used smartphone', place: 'an electronics market in Mumbai', askPrice: 9000, floorPrice: 6800, userBudget: 7000 },
        { item: 'a set of steel cooking pots', place: 'a weekly market in Chennai', askPrice: 3000, floorPrice: 2100, userBudget: 2200 },
      ],
    },
    goals: [
      { id: 'made_counter_offer', description: 'The user made a counter-offer' },
      { id: 'gave_reason', description: 'The user gave a reason why the price should be lower' },
      { id: 'deal_within_budget', description: 'You agreed a price within the user’s budget' },
    ],
  },
];

const CAREER = { slug: 'mission-career', name: 'Career', sortOrder: 11 };
const EVERYDAY = { slug: 'mission-everyday', name: 'Everyday', sortOrder: 12 };
const CHALLENGE = { slug: 'mission-challenge', name: 'Challenge', sortOrder: 13 };

/**
 * Missions: a situation, objectives for the user, an AI character with its own (hidden) objective,
 * five pressure levels and a result. They run on the same engine as practice scenarios.
 */
export const MISSIONS: ScenarioSeed[] = [
  {
    slug: 'mission-get-the-job',
    type: 'MISSION',
    category: CAREER,
    kind: 'interview',
    sortOrder: 1,
    title: 'Get the Job',
    tagline: 'Convince the hiring manager you are the one to hire.',
    briefing: 'Final-round interview for the {{role}} role at {{company}}. The hiring manager decides today.',
    userRole: 'A candidate for the {{role}} role',
    objective: 'Convince the hiring manager to hire you. You won’t know their questions in advance.',
    minLevel: 'INTERMEDIATE',
    estimatedMinutes: 10,
    promptTemplate:
      'Scenario: you are the hiring manager interviewing the user for the {{role}} role at {{company}} ({{companyNote}}). ' +
      'Your secret objective: decide honestly whether this candidate is strong enough to hire. Specific examples, results and ' +
      'clear reasoning convince you; generic answers do not. Interview them one question at a time: tell me about yourself; ' +
      'their most relevant experience; a difficult problem they solved and how ({{focus}}); one tough follow-up that probes the ' +
      'weakest part of their answers so far; why they want this job; and finally their salary expectation — push back once on ' +
      'their number. Then invite their questions and close the interview politely without telling them your decision. ' +
      'Treat whatever background the user gives as true.',
    params: {
      roles: [
        { role: 'Senior Full Stack Developer', company: 'Finlytics', companyNote: 'a fintech company in Bengaluru', focus: 'a production outage or a hard technical decision' },
        { role: 'Product Manager', company: 'CloudKart', companyNote: 'an e-commerce software company in Gurugram', focus: 'choosing what to build when two teams disagree' },
        { role: 'Marketing Manager', company: 'Brewhaus Coffee', companyNote: 'a café chain in Mumbai', focus: 'a campaign that did not go as planned' },
        { role: 'Data Analyst', company: 'MediTrack', companyNote: 'a healthcare analytics company in Hyderabad', focus: 'convincing a manager with data they did not like' },
        { role: 'Operations Lead', company: 'SwiftShip Logistics', companyNote: 'a logistics company in Chennai', focus: 'handling a big delivery failure' },
      ],
    },
    goals: [
      { id: 'introduced_self', label: 'Introduce yourself clearly and confidently', description: 'The user introduced themselves clearly and confidently' },
      { id: 'gave_specific_example', label: 'Back up your experience with a specific example', description: 'The user gave a specific example with concrete details or results' },
      { id: 'handled_tough_question', label: 'Handle the tough follow-up calmly', description: 'The user answered the tough follow-up question directly and calmly' },
      { id: 'defended_salary', label: 'State and defend a salary expectation', description: 'The user gave a salary expectation and defended it when pushed back' },
      { id: 'asked_question', label: 'Ask the interviewer a smart question', description: 'The user asked the interviewer a relevant question' },
    ],
    mission: {
      group: 'career',
      aiCharacter: 'A sharp hiring manager who wants specific examples, not general answers.',
      skills: ['structure', 'professionalism', 'composure'],
      outcome:
        'SUCCESS: the hiring manager would clearly move the candidate forward — specific examples, clear answers, composure under ' +
        'the tough question, and a reasonable salary discussion. PARTIAL: mixed — some strong answers but vague or weak in places. ' +
        'FAILED: mostly vague, very short or off-topic answers. Headline examples: "You’d get the job offer", "Close — they want ' +
        'more specific examples", "Not this time".',
    },
  },
  {
    slug: 'mission-negotiate-raise',
    type: 'MISSION',
    category: CAREER,
    kind: 'roleplay',
    sortOrder: 2,
    title: 'Negotiate Your Raise',
    tagline: 'Your manager offers a small raise. Get what you deserve.',
    briefing: 'Your annual review at {{company}}. {{managerTitle}} is about to offer you a {{offer}} raise. You think you deserve {{target}} — this year {{achievement}}.',
    userRole: 'An employee asking for a fair raise',
    objective: 'Get a raise as close to {{target}} as you can — politely, and with evidence.',
    minLevel: 'INTERMEDIATE',
    estimatedMinutes: 6,
    promptTemplate:
      'Scenario: you are {{managerTitle}} at {{company}}, in the user’s annual salary review. Your secret objective: keep the raise ' +
      'as low as possible. The absolute maximum you may approve is {{ceiling}} — never reveal this number and never go above it. ' +
      'React like a real manager: mention budget limits and company policy, and ask the user to justify a higher number. Raise ' +
      'your offer only in small steps, and only when they give concrete evidence of their impact (results, numbers, extra ' +
      'responsibility) or a credible reason. If they are rude or make empty threats, become firmer. You may offer non-salary ' +
      'options (a bonus, a training budget, a review in six months) instead of more money. Close the conversation once you reach ' +
      'an agreement or a clear "no".',
    params: {
      opening:
        'Welcome the user to their annual review in a friendly but businesslike way, say one positive thing about their year, ' +
        'and tell them the company can offer a {{offer}} raise this year. Then ask what they think.',
      hidden: ['ceiling'],
      variants: [
        { company: 'a software company in Bengaluru', managerTitle: 'Your manager, the engineering head', offer: '7%', ceiling: '12%', target: '15%', achievement: 'you led a project that cut customer complaints by 30%' },
        { company: 'a marketing agency in Mumbai', managerTitle: 'Your manager, the agency director', offer: '6%', ceiling: '11%', target: '14%', achievement: 'you brought in two new clients' },
        { company: 'a logistics company in Pune', managerTitle: 'Your manager, the operations head', offer: '5%', ceiling: '10%', target: '12%', achievement: 'you trained four new team members and reduced delivery delays' },
      ],
    },
    goals: [
      { id: 'made_case', label: 'Make your case with concrete results', description: 'The user justified a higher raise with concrete results or numbers' },
      { id: 'asked_specific_number', label: 'Ask for a specific number above the offer', description: 'The user asked for a specific raise above the first offer' },
      { id: 'handled_pushback', label: 'Respond to the budget pushback without giving up', description: 'The user responded to the manager’s pushback with a new argument instead of giving up' },
      { id: 'stayed_professional', label: 'Stay polite and professional', description: 'The user stayed polite and professional throughout' },
      { id: 'reached_agreement', label: 'Reach a clear agreement', description: 'The conversation ended with a clear agreement on the raise or package' },
    ],
    mission: {
      group: 'career',
      aiCharacter: 'Your manager — friendly, but under budget pressure and wants to keep the raise low.',
      skills: ['persuasion', 'assertiveness', 'professionalism'],
      outcome:
        'The first offer was {{offer}}; the manager’s secret maximum was {{ceiling}}; the user hoped for {{target}}. SUCCESS: the ' +
        'manager agreed to {{ceiling}} or close to it (or a clearly better package), won with evidence. PARTIAL: some improvement ' +
        'over {{offer}} or a non-salary benefit, but well below {{ceiling}}. FAILED: the user accepted {{offer}} without negotiating, ' +
        'or the talk broke down. The headline must state the final result, e.g. "Raise agreed at 10% (first offer 7%)".',
    },
  },
  {
    slug: 'mission-angry-customer',
    type: 'MISSION',
    category: CHALLENGE,
    kind: 'roleplay',
    sortOrder: 3,
    title: 'Calm an Angry Customer',
    tagline: 'A customer is furious. Turn the call around.',
    briefing: 'You work in customer support at {{company}}. A customer is calling, and they are upset: {{problem}}.',
    userRole: 'A customer support agent at {{company}}',
    objective: 'Calm the customer down and solve the problem in a way they accept.',
    minLevel: 'INTERMEDIATE',
    estimatedMinutes: 6,
    promptTemplate:
      'Scenario: you are a customer calling the support line of {{company}}; the user is the support agent. Your problem: ' +
      '{{problem}}. You are angry and impatient at first. Your objective: get {{wants}}. Secret: you would actually be satisfied ' +
      'with {{acceptable}}, but you only soften once the agent apologises sincerely, shows they understand your frustration and ' +
      'offers a concrete solution. Stay difficult while they make excuses, blame policy or sound robotic — repeat your complaint, ' +
      'and ask for a manager once. Calm down step by step as they handle it well. Never be abusive. End the call when the problem ' +
      'is resolved, or when it is clear the agent cannot help.',
    params: {
      opening: 'You are calling the support line, already frustrated. Briefly explain the problem ({{problem}}) and demand {{wants}}.',
      hidden: ['acceptable'],
      variants: [
        { company: 'an online electronics store', problem: 'your new laptop arrived with a cracked screen, and it is the second faulty delivery this month', wants: 'a full refund today', acceptable: 'a free replacement delivered within two days plus a discount voucher' },
        { company: 'a food delivery app', problem: 'your dinner order arrived ninety minutes late and cold, for a family get-together', wants: 'your money back and compensation', acceptable: 'a full refund plus credit for the next order' },
        { company: 'an internet provider', problem: 'your home internet has been down for three days and you work from home', wants: 'it fixed today and no bill this month', acceptable: 'a technician visit tomorrow morning and a discount on this month’s bill' },
      ],
    },
    goals: [
      { id: 'apologised', label: 'Apologise sincerely', description: 'The user apologised sincerely (not just "sorry for the inconvenience")' },
      { id: 'showed_empathy', label: 'Show you understand their frustration', description: 'The user showed empathy for the customer’s situation' },
      { id: 'asked_details', label: 'Ask questions to understand the problem', description: 'The user asked questions to understand the problem' },
      { id: 'offered_solution', label: 'Offer a concrete solution', description: 'The user offered a concrete solution with clear next steps' },
      { id: 'closed_politely', label: 'Close the call politely', description: 'The user closed the call politely and checked the customer was satisfied' },
    ],
    mission: {
      group: 'challenge',
      aiCharacter: 'An angry, impatient customer who wants to be heard before anything else.',
      skills: ['empathy', 'composure', 'professionalism'],
      outcome:
        'SUCCESS: the customer calmed down and accepted a solution. PARTIAL: the customer became less angry but nothing was agreed. ' +
        'FAILED: the customer stayed angry, escalated, or hung up unhappy. Headline examples: "Customer calmed — replacement ' +
        'accepted", "Calmer, but no solution agreed".',
    },
  },
  {
    slug: 'mission-hotel-problem',
    type: 'MISSION',
    category: EVERYDAY,
    kind: 'roleplay',
    sortOrder: 4,
    title: 'Fix Your Hotel Problem',
    tagline: 'Your room isn’t what you paid for. Get it sorted tonight.',
    briefing: 'You just checked into {{hotel}}, but {{issue}}. You go to the front desk to sort it out.',
    userRole: 'A hotel guest',
    objective: 'Get the problem fixed tonight — and fair compensation if they can’t.',
    minLevel: 'BEGINNER',
    estimatedMinutes: 5,
    promptTemplate:
      'Scenario: you are the duty manager at the front desk of {{hotel}}. The user is a guest who just checked in; their problem: ' +
      '{{issue}}. Your objective: solve it as cheaply as possible. First offer to send maintenance tomorrow, and say the hotel is ' +
      'nearly full. Secret: you can offer {{concession}}, but only if the guest politely insists, explains why the problem matters ' +
      'to them, or asks clearly for compensation. Stay courteous and professional; be a little bureaucratic at first. Close the ' +
      'conversation once something is agreed.',
    params: {
      opening: 'Greet the guest at the front desk politely and ask how you can help.',
      hidden: ['concession'],
      variants: [
        { hotel: 'a beach hotel in Goa', issue: 'the air-conditioning doesn’t work and the room smells damp', concession: 'a free upgrade to a sea-facing room tonight' },
        { hotel: 'a business hotel in Delhi', issue: 'the room is right next to a noisy construction site and you have an important meeting tomorrow', concession: 'a quiet room on a higher floor and free breakfast' },
        { hotel: 'a hill-station hotel in Manali', issue: 'there is no hot water and the heater is broken', concession: 'a different room now and 20% off the stay' },
      ],
    },
    goals: [
      { id: 'explained_problem', label: 'Explain the problem clearly', description: 'The user explained the problem clearly' },
      { id: 'refused_delay', label: 'Politely refuse to wait until tomorrow', description: 'The user politely pushed back on waiting until tomorrow' },
      { id: 'asked_alternative', label: 'Ask for a specific solution or compensation', description: 'The user asked for a specific solution or compensation' },
      { id: 'stayed_polite', label: 'Stay polite but firm', description: 'The user stayed polite but firm throughout' },
    ],
    mission: {
      group: 'everyday',
      aiCharacter: 'A courteous but bureaucratic duty manager who would rather fix it tomorrow.',
      skills: ['assertiveness', 'politeness', 'persuasion'],
      outcome:
        'The manager could offer {{concession}}. SUCCESS: the guest got that (or an equally good fix) tonight. PARTIAL: some fix or ' +
        'promise, but not tonight or less than that. FAILED: the guest accepted waiting until tomorrow with nothing else. Headline ' +
        'examples: "Upgraded to a sea-facing room", "Maintenance tomorrow — nothing more".',
    },
  },
  {
    slug: 'mission-win-the-debate',
    type: 'MISSION',
    category: CHALLENGE,
    kind: 'debate',
    sortOrder: 5,
    title: 'Win the Debate',
    tagline: 'Hold your ground against a sharp opponent.',
    briefing: 'Motion: "{{motion}}". You argue {{userSide}} it. Your opponent argues the other side — and wants to win.',
    userRole: 'Arguing {{userSide}} the motion',
    objective: 'Win the debate: argue clearly, answer every challenge, and finish strong.',
    minLevel: 'UPPER_INTERMEDIATE',
    estimatedMinutes: 8,
    promptTemplate:
      'Scenario: a one-to-one debate. The motion is: "{{motion}}". The user argues {{userSide}} the motion; you argue {{aiSide}} ' +
      'it. Your objective: win. Never switch sides; acknowledge a strong point only briefly, then counter it. Challenge every ' +
      'vague or unsupported claim ("Do you have an example?", "That’s an assumption — why?"). Use everyday examples, especially ' +
      'from Indian life. Keep your turns to a few sentences. Near the end, ask the user for a closing statement, then give yours.',
    params: {
      motions: [
        'Working from home is better than working from an office',
        'Students should be allowed to use AI tools for homework',
        'Social media does more harm than good',
        'Cities should ban private cars from their centres',
        'It is better to rent a home than to buy one',
        'A four-day work week should be the norm',
      ],
    },
    goals: [
      { id: 'clear_opening', label: 'Open with a clear position and reason', description: 'The user opened with a clear position and at least one reason' },
      { id: 'used_example', label: 'Support a point with an example', description: 'The user supported a point with a concrete example' },
      { id: 'rebutted', label: 'Answer a challenge directly', description: 'The user answered one of the opponent’s challenges directly' },
      { id: 'closing_statement', label: 'Finish with a strong closing statement', description: 'The user gave a closing statement summarising their case' },
    ],
    mission: {
      group: 'challenge',
      aiCharacter: 'A sharp debater who never switches sides and attacks vague claims.',
      skills: ['persuasion', 'structure', 'composure'],
      outcome:
        'Judge as a neutral debate judge. SUCCESS: the user’s case was clearer and better supported than the opponent’s, and they ' +
        'answered the challenges. PARTIAL: a fair fight — good points but some challenges left unanswered. FAILED: the user’s case ' +
        'was mostly unsupported or they gave up their position. Headline examples: "You won on reasoning", "A close debate".',
    },
  },
  {
    slug: 'mission-bargain',
    type: 'MISSION',
    category: EVERYDAY,
    kind: 'negotiation',
    sortOrder: 6,
    title: 'Bargain Like a Local',
    tagline: 'Get a fair price from a seller who knows every trick.',
    briefing: 'You want to buy {{item}} at {{place}}. The seller asks {{askPriceText}}. You only have {{userBudgetText}}.',
    userRole: 'A customer with {{userBudgetText}}',
    objective: 'Buy it for {{userBudgetText}} or less — or walk away.',
    minLevel: 'BEGINNER',
    estimatedMinutes: 5,
    promptTemplate:
      'Scenario: you are a shopkeeper at {{place}} selling {{item}}. Your asking price is {{askPriceText}}. Your objective: sell ' +
      'for as much as possible. Secret: the lowest price you will accept is {{floorPriceText}} — never reveal it and never go ' +
      'below it. Use real shopkeeper tactics: praise the quality, mention other interested buyers, offer a "special price just ' +
      'for you", and come down in small steps only when the customer gives a reason (a defect, a better offer elsewhere, paying ' +
      'cash, walking away). Do not accept their first offer. Whenever you state a new price, call the record_offer tool with ' +
      'that price. If they reach a price at or above your minimum, agree and close the deal.',
    params: {
      currency: 'INR',
      items: [
        { item: 'a leather jacket', place: 'a street market in Delhi', askPrice: 2500, floorPrice: 1400, userBudget: 1500 },
        { item: 'a second-hand bicycle', place: 'a small shop in Pune', askPrice: 4500, floorPrice: 3200, userBudget: 3500 },
        { item: 'a handmade cotton kurta', place: 'a handicrafts stall in Jaipur', askPrice: 1800, floorPrice: 1000, userBudget: 1100 },
        { item: 'a used smartphone', place: 'an electronics market in Mumbai', askPrice: 9000, floorPrice: 6800, userBudget: 7000 },
      ],
    },
    goals: [
      { id: 'made_counter_offer', label: 'Make a counter-offer', description: 'The user made a counter-offer' },
      { id: 'gave_reason', label: 'Give a reason for a lower price', description: 'The user gave a reason why the price should be lower' },
      { id: 'stayed_firm', label: 'Stay firm on your budget', description: 'The user did not agree to a price above their budget' },
      { id: 'deal_within_budget', label: 'Close the deal within budget', description: 'A deal was agreed at or below the user’s budget' },
    ],
    mission: {
      group: 'everyday',
      aiCharacter: 'A charming shopkeeper who knows every sales trick.',
      skills: ['persuasion', 'assertiveness', 'politeness'],
      outcome:
        'Asking price {{askPriceText}}; the user’s budget {{userBudgetText}}; the seller’s secret minimum {{floorPriceText}}; the ' +
        'last price the seller stated was ₹{{currentOffer}}. SUCCESS: a deal at or below {{userBudgetText}}. PARTIAL: the price came ' +
        'down a lot but stayed above budget, or the user walked away politely after a good negotiation. FAILED: the user paid ' +
        'above budget easily or barely negotiated. The headline must state the final price, e.g. "Bought for ₹1,450 (asked ₹2,500)".',
    },
  },
];

