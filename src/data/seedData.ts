import { computeDerivedScores, isSafetyTriggered } from '../lib/scoring.ts';
import type {
  AnswerValue,
  InterviewResponse,
  QuestionnaireVersion,
  Site,
  StudyConfig,
} from '../types/study.ts';

export const LEGACY_SEED_SITE_IDS = [
  'site_muhima',
  'site_remera',
  'site_kacyiru',
  'site_rwamagana',
  'site_nyamata',
] as const;

export const SEED_SITES: Site[] = [
  {
    id: 'site_kanombe_hospital',
    name: 'Kanombe Hospital',
    district: 'Kicukiro',
    urbanRural: 'urban',
    referralContactName: 'Mental Health & Psychosocial Unit — Kanombe Hospital',
    referralContactPhone: 'Hospital Triage Desk · Rwanda Mental Health Line: 114',
    referralProtocolEn:
      'Stop the interview immediately. Stay calmly with the mother and escort her the same day to the Kanombe Hospital Mental Health & Psychosocial Unit or Emergency Triage.',
    referralProtocolRw:
      '[Needs professional translation and back-translation] Hagarika ikiganiro ako kanya, ugumane n’umubyeyi mu ituze umuherekeze ku ishami ry’ubuzima bwo mu mutwe ku Bitaro bya Kanombe uwo munsi.',
    active: true,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'site_kacyiru_hospital',
    name: 'Kacyiru Hospital',
    district: 'Gasabo',
    urbanRural: 'urban',
    referralContactName: 'Mental Health & Isange One Stop Centre — Kacyiru Hospital',
    referralContactPhone: 'Isange Helpline: 3029 · Mental Health Line: 114',
    referralProtocolEn:
      'Stop the interview immediately. Stay with the mother in a private room and escort her the same day to the Kacyiru Hospital Mental Health / Isange One Stop Centre team.',
    referralProtocolRw:
      '[Needs professional translation and back-translation] Hagarika ikiganiro ako kanya, ugumane n’umubyeyi ahantu hiherereye umugeze kuri Isange One Stop Centre cyangwa serivisi y’ubuzima bwo mu mutwe ku Bitaro bya Kacyiru.',
    active: true,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'site_muhima_hospital',
    name: 'Muhima Hospital',
    district: 'Nyarugenge',
    urbanRural: 'urban',
    referralContactName: 'Maternal & Mental Health Nurse on Duty — Muhima Hospital',
    referralContactPhone: 'Hospital Desk · Rwanda Mental Health Line: 114',
    referralProtocolEn:
      'Pause the interview and stay with the mother. Escort her calmly the same day to the Muhima Hospital Mental Health & Psychosocial Desk or Emergency Triage.',
    referralProtocolRw:
      '[Needs professional translation and back-translation] Hagarika ikiganiro, ugumane n’umubyeyi umuherekeze mu ituze ku ishami ry’ubuzima bwo mu mutwe ku Bitaro bya Muhima uwo munsi.',
    active: true,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'site_kibagabaga_hospital',
    name: 'Kibagabaga Hospital',
    district: 'Gasabo',
    urbanRural: 'urban',
    referralContactName: 'Mental Health Clinic Focal Nurse — Kibagabaga Hospital',
    referralContactPhone: 'Maternal Unit Desk · Emergency: 112 / RBC: 114',
    referralProtocolEn:
      'Do not leave the mother alone. Stay with her and escort her the same day to the Kibagabaga Hospital Mental Health Clinic for immediate support.',
    referralProtocolRw:
      '[Needs professional translation and back-translation] Ntusige umubyeyi wenyine; gumana na we umuherekeze ku ivuriro ry’ubuzima bwo mu mutwe ku Bitaro bya Kibagabaga uwo munsi.',
    active: true,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
  {
    id: 'site_king_faisal_hospital',
    name: 'King Faisal Hospital',
    district: 'Gasabo',
    urbanRural: 'urban',
    referralContactName: 'Psychiatry & Behavioral Health Desk — King Faisal Hospital',
    referralContactPhone: 'Hospital Emergency Desk · RBC Helpline: 114',
    referralProtocolEn:
      'Stop the interview immediately, remain with the mother, and coordinate same-day escort to the King Faisal Hospital Psychiatry & Behavioral Health team or Emergency Department.',
    referralProtocolRw:
      '[Needs professional translation and back-translation] Hagarika ikiganiro ako kanya, ugumane n’umubyeyi umuherekeze ku ishami ry’ubuzima bwo mu mutwe ku Bitaro bya King Faisal uwo munsi.',
    active: true,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z',
  },
];

export const SEED_STUDY_CONFIG: StudyConfig = {
  targetSampleSize: 385,
  preparednessCutoff: 3.0,
  strainCutoff: 3.0,
  cutoffsLocked: false,
  cutoffChangeLog: [
    {
      changedAt: '2026-11-01T08:00:00.000Z',
      changedByUid: 'system-seed',
      changedByName: 'Study Protocol v1',
      field: 'preparednessCutoff',
      previousValue: 3.0,
      newValue: 3.0,
      reason: 'Initial protocol baseline: mean readiness < 3.0 classified as emotionally/relationally unprepared.',
    },
  ],
  dataRetentionDays: 1825,
  updatedAt: '2026-11-01T08:00:00.000Z',
};

export const SEED_QUESTIONNAIRE_V1: QuestionnaireVersion = {
  id: 'qv_1',
  version: 1,
  titleEn: 'Matrescence & Maternal Readiness Survey (v1)',
  titleRw: 'Ubushakashatsi ku kwitegura ububyeyi (v1) [Draft RW]',
  status: 'published',
  createdByUid: 'system-seed',
  createdByName: 'Data Detectives Protocol',
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
  licensedScaleSlots: [
    {
      id: 'slot_epds',
      name: 'Edinburgh Postnatal Depression Scale (EPDS)',
      domain: 'Postnatal depressive symptoms',
      status: 'awaiting_license',
      licenseReference: 'Not yet imported — requires licensed & validated Kinyarwanda version',
      validatedKinyarwandaReady: false,
      notes: 'Placeholder slot only. Never hard-code copyrighted items prior to ethics & license approval.',
    },
    {
      id: 'slot_psi',
      name: 'Parenting Stress Index (PSI-SF)',
      domain: 'Parenting stress',
      status: 'awaiting_license',
      licenseReference: 'PAR Inc. license pending',
      validatedKinyarwandaReady: false,
      notes: 'Import validated Kinyarwanda items once formal permission and back-translation are complete.',
    },
    {
      id: 'slot_mspss',
      name: 'Multidimensional Scale of Perceived Social Support (MSPSS)',
      domain: 'Perceived social support',
      status: 'awaiting_license',
      licenseReference: 'Pending cultural adaptation & permission',
      validatedKinyarwandaReady: false,
      notes: 'Slot reserved for adding validated items in Questionnaire v2+.',
    },
  ],
  sections: [
    {
      id: 'sec_background',
      order: 1,
      titleEn: '1. Background',
      titleRw: '1. Amakuru y’ibanze [Needs back-translation]',
      descriptionEn: 'General non-identifying background about the mother and her child under 2.',
      descriptionRw: 'Amakuru rusange atagaragaza umwirondoro w’umubyeyi.',
    },
    {
      id: 'sec_before_birth',
      order: 2,
      titleEn: '2. Before the Birth',
      titleRw: '2. Mbere yo kubyara [Needs back-translation]',
      descriptionEn: 'How the pregnancy began and how prepared you felt emotionally and practically.',
      descriptionRw: 'Uko wiyumvaga n’uburyo witeguye mbere yo kubyara.',
    },
    {
      id: 'sec_wellbeing',
      order: 3,
      titleEn: '3. Current Wellbeing (Past 2 Weeks)',
      titleRw: '3. Imibereho yo mu mutwe mu byumweru 2 bishize [Needs back-translation]',
      descriptionEn: 'Study-specific reflections on how you have been feeling over the past two weeks.',
      descriptionRw: 'Uko wiyumvise mu byumweru bibiri bishize.',
    },
    {
      id: 'sec_support',
      order: 4,
      titleEn: '4. Support & Partner',
      titleRw: '4. Ubufasha n’umufasha [Needs back-translation]',
      descriptionEn: 'People around you who help and listen, and partner support where applicable.',
      descriptionRw: 'Abantu bagufasha n’imikoranire n’umufasha wawe.',
    },
    {
      id: 'sec_hardship',
      order: 5,
      titleEn: '5. Daily Hardship',
      titleRw: '5. Ibibazo by’ubuzima bwa buri munsi [Needs back-translation]',
      descriptionEn: 'Everyday household pressures around food and money.',
      descriptionRw: 'Ibirebana n’ibiribwa n’amikoro mu rugo.',
    },
    {
      id: 'sec_matrescence',
      order: 6,
      titleEn: '6. Matrescence & Identity',
      titleRw: '6. Impinduka mu buzima bw’ububyeyi [Needs back-translation]',
      descriptionEn: 'How becoming a mother has changed your sense of identity and self.',
      descriptionRw: 'Uko kuba umubyeyi byahinduye uko wibona.',
    },
    {
      id: 'sec_open_safety',
      order: 7,
      titleEn: '7. Reflections & Safety Check',
      titleRw: '7. Ibitekerezo & Umutekano [Needs back-translation]',
      descriptionEn: 'Open reflections in your own words, followed by a gentle wellbeing safety check.',
      descriptionRw: 'Ibitekerezo byawe bwite n’ikibazo kireba umutekano wawe.',
    },
  ],
  questions: [
    // Section 1: Background
    {
      id: 'bg_age',
      sectionId: 'sec_background',
      order: 1,
      type: 'number',
      labelEn: 'How old are you (in years)?',
      labelRw: 'Ufite imyaka ingahe? [Needs back-translation]',
      required: true,
      min: 13,
      max: 55,
      scoreDomain: 'none',
    },
    {
      id: 'bg_education',
      sectionId: 'sec_background',
      order: 2,
      type: 'single_choice',
      labelEn: 'Highest level of schooling completed',
      labelRw: 'Ikiciro cy’amashuri warangije [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'none_primary', labelEn: 'No formal school / Primary', labelRw: 'Ntayo / Amashuri abanza' },
        { value: 'secondary', labelEn: 'Secondary school', labelRw: 'Amashuri yisumbuye' },
        { value: 'vocational_university', labelEn: 'Vocational / University', labelRw: 'Imyuga / Kaminuza' },
      ],
    },
    {
      id: 'bg_relationship',
      sectionId: 'sec_background',
      order: 3,
      type: 'single_choice',
      labelEn: 'Current relationship status',
      labelRw: 'Irangamimerere ry’umubano wawe ubu [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'married_cohabiting', labelEn: 'Married or living with partner', labelRw: 'Ndubatse / Tubana' },
        { value: 'partner_not_cohabiting', labelEn: 'In a relationship, living apart', labelRw: 'Mfite umukunzi ariko ntitubana' },
        { value: 'single_separated_widowed', labelEn: 'Single, separated, or widowed', labelRw: 'Ndi njyenyine / Twaratandukanye' },
      ],
    },
    {
      id: 'bg_num_children',
      sectionId: 'sec_background',
      order: 4,
      type: 'number',
      labelEn: 'How many living children do you have in total?',
      labelRw: 'Ufite abana bangahe bose hamwe? [Needs back-translation]',
      required: true,
      min: 1,
      max: 15,
      scoreDomain: 'none',
    },
    {
      id: 'bg_first_child',
      sectionId: 'sec_background',
      order: 5,
      type: 'single_choice',
      labelEn: 'Is this your first child?',
      labelRw: 'Uyu ni we mwana wawe wa mbere? [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'yes', labelEn: 'Yes, first child', labelRw: 'Yego, ni uwa mbere' },
        { value: 'no', labelEn: 'No, I have older children', labelRw: 'Oya, mfite abandi bakuru' },
      ],
    },
    {
      id: 'bg_urban_rural',
      sectionId: 'sec_background',
      order: 6,
      type: 'single_choice',
      labelEn: 'Do you live in an urban or rural area?',
      labelRw: 'Utuye mu mujyi cyangwa mu cyaro? [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'urban', labelEn: 'Urban / City neighbourhood', labelRw: 'Mu mujyi' },
        { value: 'rural', labelEn: 'Rural / Village', labelRw: 'Mu cyaro' },
      ],
    },
    {
      id: 'bg_own_income',
      sectionId: 'sec_background',
      order: 7,
      type: 'single_choice',
      labelEn: 'Do you currently earn your own income?',
      labelRw: 'Ubu hari amafaranga winjiza ku giti cyawe? [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'regular', labelEn: 'Yes, regular income', labelRw: 'Yego, buri gihe' },
        { value: 'occasional', labelEn: 'Occasionally / irregular', labelRw: 'Rimwe na rimwe' },
        { value: 'none', labelEn: 'No independent income', labelRw: 'Oya, nta na macye' },
      ],
    },

    // Section 2: Before the Birth
    {
      id: 'pre_pregnancy_planned',
      sectionId: 'sec_before_birth',
      order: 8,
      type: 'single_choice',
      labelEn: 'Before becoming pregnant with this child, was the pregnancy:',
      labelRw: 'Mbere yo gusama uyu mwana, iyi nda yari: [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'planned', labelEn: 'Planned for that time', labelRw: 'Yari yarateguwe icyo gihe' },
        { value: 'wanted_later', labelEn: 'Unplanned, but wanted', labelRw: 'Ntiyari yateguwe ariko nayifuzaga' },
        { value: 'unwanted', labelEn: 'Unwanted at that time', labelRw: 'Sinayifuzaga icyo gihe' },
      ],
    },
    {
      id: 'pre_feelings_finding_out',
      sectionId: 'sec_before_birth',
      order: 9,
      type: 'single_choice',
      labelEn: 'How did you mostly feel when you first found out you were pregnant?',
      labelRw: 'Wiyumvise ute bwa mbere umenye ko utwite? [Needs back-translation]',
      required: true,
      scoreDomain: 'none',
      options: [
        { value: 'joy_peace', labelEn: 'Happy or peaceful', labelRw: 'Wishimye cyangwa utuje' },
        { value: 'mixed', labelEn: 'Mixed feelings (happy and worried)', labelRw: 'Umutima uhagaze ariko wishimye' },
        { value: 'shock_fear', labelEn: 'Shocked, afraid, or overwhelmed', labelRw: 'Watunguwe, ufite ubwoba cyangwa uhangayitse' },
      ],
    },
    {
      id: 'pre_emo_readiness',
      sectionId: 'sec_before_birth',
      order: 10,
      type: 'agreement_5',
      labelEn: 'Before the birth, I felt emotionally ready for the daily reality of caring for a newborn.',
      labelRw: 'Mbere yo kubyara, numvaga niteguye mu marangamutima kwita ku ruhinja. [Needs back-translation]',
      required: true,
      scoreDomain: 'preparedness',
    },
    {
      id: 'pre_knowledge',
      sectionId: 'sec_before_birth',
      order: 11,
      type: 'agreement_5',
      labelEn: 'I had clear, practical knowledge about what happens to a mother’s body and emotions after birth.',
      labelRw: 'Nari nzi neza ibiba ku mubiri no mu marangamutima nyuma yo kubyara. [Needs back-translation]',
      required: true,
      scoreDomain: 'preparedness',
    },
    {
      id: 'pre_advice',
      sectionId: 'sec_before_birth',
      order: 12,
      type: 'agreement_5',
      labelEn: 'Someone I trusted gave me honest, helpful guidance before my baby arrived.',
      labelRw: 'Hari umuntu nizeye wangiriye inama z’ukuri kandi zifasha mbere yo kubyara. [Needs back-translation]',
      required: true,
      scoreDomain: 'preparedness',
    },
    {
      id: 'pre_calm',
      sectionId: 'sec_before_birth',
      order: 13,
      type: 'agreement_5',
      labelEn: 'During late pregnancy, I felt calm and confident about becoming a mother to this baby.',
      labelRw: 'Mu gihe cyo gusoza inda, numvaga ntuye kandi nifitiye icyizere. [Needs back-translation]',
      required: true,
      scoreDomain: 'preparedness',
    },
    {
      id: 'pre_partner_support',
      sectionId: 'sec_before_birth',
      order: 14,
      type: 'agreement_5',
      labelEn: 'Before the birth, my partner or close family made me feel supported and not alone.',
      labelRw: 'Mbere yo kubyara, umufasha wanjye cyangwa umuryango banyeretse ko batansize njyenyine. [Needs back-translation]',
      required: true,
      scoreDomain: 'preparedness',
    },
    {
      id: 'pre_worry',
      sectionId: 'sec_before_birth',
      order: 15,
      type: 'agreement_5',
      labelEn: 'Before the birth, I felt deeply worried or unprepared for how my life would change.',
      labelRw: 'Mbere yo kubyara, nari mpangayikishijwe cyane n’uburyo ubuzima bwanjye buzahinduka. [Needs back-translation]',
      helpEn: 'Reverse-scored in Preparedness composite.',
      required: true,
      reverseScored: true,
      scoreDomain: 'preparedness',
    },
    {
      id: 'pre_overall_preparedness',
      sectionId: 'sec_before_birth',
      order: 16,
      type: 'slider_10',
      labelEn: 'Overall, from 0 (not prepared at all) to 10 (completely prepared), how prepared did you feel before birth?',
      labelRw: 'Muri rusange, kuva kuri 0 kugeza kuri 10, wari witeguye ku kihe kigero mbere yo kubyara? [Needs back-translation]',
      required: true,
      min: 0,
      max: 10,
      scoreDomain: 'preparedness',
    },

    // Section 3: Current Wellbeing (Past 2 Weeks)
    {
      id: 'wb_low_mood',
      sectionId: 'sec_wellbeing',
      order: 17,
      type: 'frequency_5',
      labelEn: 'Over the past 2 weeks, how often have you felt persistently sad, heavy, or low in mood?',
      labelRw: 'Mu byumweru 2 bishize, ni kangahe wumvise ubabaye cyangwa ufite agahinda gakomeye? [Needs back-translation]',
      required: true,
      scoreDomain: 'strain',
    },
    {
      id: 'wb_lost_enjoyment',
      sectionId: 'sec_wellbeing',
      order: 18,
      type: 'frequency_5',
      labelEn: 'Over the past 2 weeks, how often have you lost enjoyment in things or moments you usually care about?',
      labelRw: 'Mu byumweru 2 bishize, ni kangahe wabuze ibyishimo mu byo wakundaga? [Needs back-translation]',
      required: true,
      scoreDomain: 'strain',
    },
    {
      id: 'wb_anxiety',
      sectionId: 'sec_wellbeing',
      order: 19,
      type: 'frequency_5',
      labelEn: 'Over the past 2 weeks, how often have you felt anxious, tense, or afraid without a clear reason?',
      labelRw: 'Mu byumweru 2 bishize, ni kangahe wumvise uhangayitse cyangwa ufite ubwoba? [Needs back-translation]',
      required: true,
      scoreDomain: 'strain',
    },
    {
      id: 'wb_overwhelm',
      sectionId: 'sec_wellbeing',
      order: 20,
      type: 'frequency_5',
      labelEn: 'Over the past 2 weeks, how often have daily baby and household responsibilities felt overwhelming?',
      labelRw: 'Mu byumweru 2 bishize, ni kangahe inshingano z’uruhinja n’urugo zakurenze? [Needs back-translation]',
      required: true,
      scoreDomain: 'strain',
    },
    {
      id: 'wb_not_coping',
      sectionId: 'sec_wellbeing',
      order: 21,
      type: 'frequency_5',
      labelEn: 'Over the past 2 weeks, how often have you felt unable to cope with everything expected of you?',
      labelRw: 'Mu byumweru 2 bishize, ni kangahe wumvise unaniwe kwihanganira ibyo usabwa byose? [Needs back-translation]',
      required: true,
      scoreDomain: 'strain',
    },
    {
      id: 'wb_rest',
      sectionId: 'sec_wellbeing',
      order: 22,
      type: 'frequency_5',
      labelEn: 'Over the past 2 weeks, how often have you been able to get enough rest to recover your strength?',
      labelRw: 'Mu byumweru 2 bishize, ni kangahe washoboye kuruhuka bihagije ngo ugarure imbaraga? [Needs back-translation]',
      helpEn: 'Reverse-scored in Strain composite.',
      required: true,
      reverseScored: true,
      scoreDomain: 'strain',
    },

    // Section 4: Support & Partner
    {
      id: 'sup_who_helps',
      sectionId: 'sec_support',
      order: 23,
      type: 'multi_choice',
      labelEn: 'Who currently helps you with caring for the baby or household tasks? (Select all that apply)',
      labelRw: 'Ni bande bagufasha kwita ku ruhinja cyangwa imirimo yo mu rugo ubu? [Needs back-translation]',
      required: true,
      scoreDomain: 'support',
      options: [
        { value: 'partner', labelEn: 'Partner / Husband', labelRw: 'Umufasha / Umugabo' },
        { value: 'mother_inlaw', labelEn: 'Mother / Mother-in-law / Aunt', labelRw: 'Mama / Nyirabukwe / Nyirasenge' },
        { value: 'siblings_friends', labelEn: 'Siblings or friends', labelRw: 'Abavandimwe cyangwa inshuti' },
        { value: 'neighbours_chw', labelEn: 'Neighbours or Community Health Worker', labelRw: 'Abaturanyi cyangwa Umujyanama w’ubuzima' },
        { value: 'no_one', labelEn: 'No one regularly helps me', labelRw: 'Nta muntu umfasha buri gihe' },
      ],
    },
    {
      id: 'sup_someone_to_talk',
      sectionId: 'sec_support',
      order: 24,
      type: 'agreement_5',
      labelEn: 'I have at least one trusted person I can talk to honestly without being judged.',
      labelRw: 'Mfite nibura umuntu umwe nizeye nshobora kubwira ukuri nta bwoba bwo kunnyegwa. [Needs back-translation]',
      required: true,
      scoreDomain: 'support',
    },
    {
      id: 'sup_partner_listens',
      sectionId: 'sec_support',
      order: 25,
      type: 'agreement_5',
      labelEn: 'My partner listens patiently when I share how exhausted or stressed I feel.',
      labelRw: 'Umufasha wanjye antega amatwi iyo mubwiye ko naniwe cyangwa mpangayitse. [Needs back-translation]',
      required: false,
      scoreDomain: 'partner',
      conditionalRule: {
        dependsOnQuestionId: 'bg_relationship',
        operator: 'neq',
        value: 'single_separated_widowed',
      },
    },
    {
      id: 'sup_partner_shares_care',
      sectionId: 'sec_support',
      order: 26,
      type: 'agreement_5',
      labelEn: 'My partner actively shares hands-on care of the baby or housework.',
      labelRw: 'Umufasha wanjye afatanya nanjye imirimo yo kwita ku mwana no mu rugo. [Needs back-translation]',
      required: false,
      scoreDomain: 'partner',
      conditionalRule: {
        dependsOnQuestionId: 'bg_relationship',
        operator: 'neq',
        value: 'single_separated_widowed',
      },
    },
    {
      id: 'sup_partner_safe_respected',
      sectionId: 'sec_support',
      order: 27,
      type: 'agreement_5',
      labelEn: 'I feel emotionally safe and respected in my relationship with my partner.',
      labelRw: 'Numva ntekanye kandi nubashywe mu mubano wanjye n’umufasha wanjye. [Needs back-translation]',
      required: false,
      scoreDomain: 'partner',
      conditionalRule: {
        dependsOnQuestionId: 'bg_relationship',
        operator: 'neq',
        value: 'single_separated_widowed',
      },
    },

    // Section 5: Daily Hardship
    {
      id: 'hard_food_worry',
      sectionId: 'sec_hardship',
      order: 28,
      type: 'frequency_5',
      labelEn: 'In the past month, how often did you worry that your household would not have enough food?',
      labelRw: 'Mu kwezi gushize, ni kangahe wahangayitse ko ibiribwa bitari buhagije mu rugo? [Needs back-translation]',
      required: true,
      scoreDomain: 'hardship',
    },
    {
      id: 'hard_money_worry',
      sectionId: 'sec_hardship',
      order: 29,
      type: 'frequency_5',
      labelEn: 'In the past month, how often did lack of money for clinic transport, soap, or baby essentials cause distress?',
      labelRw: 'Mu kwezi gushize, ni kangahe kubura amafaranga y’urugendo cyangwa ibikenerwa by’uruhinja byaguhangayikishije? [Needs back-translation]',
      required: true,
      scoreDomain: 'hardship',
    },

    // Section 6: Matrescence & Identity
    {
      id: 'mat_identity_shift',
      sectionId: 'sec_matrescence',
      order: 30,
      type: 'agreement_5',
      labelEn: 'Becoming a mother has reshaped who I feel I am in ways nobody warned me about.',
      labelRw: 'Kuba umubyeyi byahinduye uwo ndi we mu buryo nta muntu wari warambwiye. [Needs back-translation]',
      required: true,
      scoreDomain: 'matrescence',
    },
    {
      id: 'mat_grief_for_old_self',
      sectionId: 'sec_matrescence',
      order: 31,
      type: 'agreement_5',
      labelEn: 'At times I miss my freedom or the person I was before having this baby, even though I love my child.',
      labelRw: 'Hari igihe nkumbura ubwisanzure nari mfite mbere yo kubyara, nubwo nkunda umwana wanjye. [Needs back-translation]',
      required: true,
      scoreDomain: 'matrescence',
    },
    {
      id: 'mat_growing_into_role',
      sectionId: 'sec_matrescence',
      order: 32,
      type: 'agreement_5',
      labelEn: 'Even when motherhood is exhausting, I feel I am gradually growing into this new chapter.',
      labelRw: 'Nubwo ububyeyi buruhije, numva buhoro buhoro ngenda menyera iki cyiciro gishya. [Needs back-translation]',
      required: true,
      scoreDomain: 'matrescence',
    },

    // Section 7: Open-Ended & Safety
    {
      id: 'open_unexpected',
      sectionId: 'sec_open_safety',
      order: 33,
      type: 'long_text',
      labelEn: 'What surprised you most about motherhood—emotionally or in your relationships—that you did not expect?',
      labelRw: 'Ni iki cyagutunguye cyane mu bubyeyi (mu marangamutima cyangwa mu mibanire) utari witeze? [Needs back-translation]',
      helpEn: 'De-identified only: do not write any person’s name, phone number, or village.',
      helpRw: 'Ntuzandike amazina y’umuntu cyangwa aho atuye.',
      required: false,
      scoreDomain: 'none',
    },
    {
      id: 'open_wish_knew',
      sectionId: 'sec_open_safety',
      order: 34,
      type: 'long_text',
      labelEn: 'What do you wish clinic staff, partners, or families had told or done to prepare you before birth?',
      labelRw: 'Ni iki wifuza ko abaganga, umufasha wawe cyangwa umuryango bakubwira cyangwa bagukorera mbere yo kubyara? [Needs back-translation]',
      helpEn: 'De-identified only: do not write any person’s name, phone number, or village.',
      helpRw: 'Ntuzandike amazina y’umuntu cyangwa aho atuye.',
      required: false,
      scoreDomain: 'none',
    },
    {
      id: 'safety_self_harm',
      sectionId: 'sec_open_safety',
      order: 35,
      type: 'single_choice',
      labelEn: 'Safety check: Over the past 2 weeks, have you had any thoughts of hurting yourself or wishing you were not here?',
      labelRw: 'Ikibazo cy’umutekano: Mu byumweru 2 bishize, wigeze ugira ibitekerezo byo kwigirira nabi cyangwa kwifuza ko utariho? [Needs back-translation]',
      helpEn: 'Ask calmly with warmth. Answering "Yes" immediately activates the clinic same-day support protocol.',
      helpRw: 'Baza mu ituze. Igisubizo "Yego" gitangiza ako kanya ubufasha ku kigo nderabuzima.',
      required: true,
      scoreDomain: 'safety',
      isSafetyQuestion: true,
      options: [
        { value: 'no', labelEn: 'No', labelRw: 'Oya' },
        { value: 'yes', labelEn: 'Yes (activate immediate clinic support)', labelRw: 'Yego (tangiza ubufasha ako kanya)' },
      ],
    },
  ],
};

/**
 * Generates a realistic, completely de-identified pilot dataset so the research team
 * can test hypothesis testing (n>=30), correlations, charts, and comparisons.
 */
export function buildPilotResponses(
  count: number,
  actorUid: string,
  actorName: string
): InterviewResponse[] {
  const quotesUnexpected = [
    'I thought loving my baby would stop me from feeling lonely, yet the nights feel so quiet and heavy.',
    'Everyone checks on the baby weight, almost nobody asks how the mother’s heart is coping.',
    'My partner loves our child, but did not realize how much sleep loss changes patience.',
    'I felt guilty grieving my old student routine while holding my newborn.',
    'Breastfeeding pain and lack of rest caught me completely off guard in the first month.',
    'Neighbors give conflicting advice, which made me doubt every decision I made.',
  ];
  const quotesWishKnew = [
    'Antenatal classes should talk honestly about sadness and exhaustion after birth, not only danger signs.',
    'Husbands should be invited once before delivery to learn how to share night care and listen.',
    'I wish someone told me it is normal to ask for help and still be a good mother.',
    'Practical planning for food and transport in the first six weeks matters as much as baby clothes.',
    'Nurses checking in on emotional wellbeing at the 6-week immunization visit would help so much.',
  ];

  const teamNames = [
    'Aline Uwimana',
    'Eric Mugisha',
    'Diane Mukamana',
    'Jean-Claude Habimana',
    'Chantal Ingabire',
    'Patrick Niyonzima',
    'Solange Uwase',
    actorName,
  ];

  const result: InterviewResponse[] = [];
  for (let i = 0; i < count; i++) {
    const site = SEED_SITES[i % SEED_SITES.length];
    const interviewerName = teamNames[i % teamNames.length];
    const interviewerUid = i % teamNames.length === 7 ? actorUid : `pilot_student_${(i % 7) + 1}`;
    const age = [17, 19, 21, 23, 25, 27, 29, 31, 34, 37][i % 10];
    const isUnpreparedProfile = i % 10 < 6; // ~60% unprepared pattern
    const planned = isUnpreparedProfile
      ? i % 3 === 0
        ? 'unwanted'
        : 'wanted_later'
      : i % 4 === 0
      ? 'wanted_later'
      : 'planned';

    const basePrep = isUnpreparedProfile ? 2 : 4;
    const baseStrain = isUnpreparedProfile ? 4 : 2;
    const clamp = (n: number) => Math.max(1, Math.min(5, n));
    const jitter = (i % 3) - 1;

    const relationship =
      i % 5 === 0
        ? 'single_separated_widowed'
        : i % 4 === 0
        ? 'partner_not_cohabiting'
        : 'married_cohabiting';

    const answers: Record<string, AnswerValue> = {
      bg_age: age,
      bg_education: i % 3 === 0 ? 'none_primary' : i % 3 === 1 ? 'secondary' : 'vocational_university',
      bg_relationship: relationship,
      bg_num_children: i % 2 === 0 ? 1 : (i % 3) + 1,
      bg_first_child: i % 2 === 0 ? 'yes' : 'no',
      bg_urban_rural: site.urbanRural === 'rural' ? 'rural' : 'urban',
      bg_own_income: i % 3 === 0 ? 'none' : i % 3 === 1 ? 'occasional' : 'regular',
      pre_pregnancy_planned: planned,
      pre_feelings_finding_out: isUnpreparedProfile ? (i % 2 === 0 ? 'shock_fear' : 'mixed') : 'joy_peace',
      pre_emo_readiness: clamp(basePrep + (i % 2)),
      pre_knowledge: clamp(basePrep + jitter),
      pre_advice: clamp(basePrep + (i % 2 === 0 ? 0 : 1)),
      pre_calm: clamp(basePrep),
      pre_partner_support: relationship === 'single_separated_widowed' ? 2 : clamp(basePrep + jitter),
      pre_worry: clamp(6 - basePrep),
      pre_overall_preparedness: isUnpreparedProfile ? 3 + (i % 3) : 7 + (i % 3),
      wb_low_mood: clamp(baseStrain + (i % 2 === 0 ? 0 : -1)),
      wb_lost_enjoyment: clamp(baseStrain - 1 + (i % 2)),
      wb_anxiety: clamp(baseStrain + jitter),
      wb_overwhelm: clamp(baseStrain),
      wb_not_coping: clamp(baseStrain - (i % 2)),
      wb_rest: clamp(6 - baseStrain),
      sup_who_helps:
        isUnpreparedProfile && i % 2 === 0
          ? ['no_one']
          : relationship === 'single_separated_widowed'
          ? ['mother_inlaw', 'neighbours_chw']
          : ['partner', 'mother_inlaw'],
      sup_someone_to_talk: isUnpreparedProfile ? 2 + (i % 2) : 4 + (i % 2),
      hard_food_worry: isUnpreparedProfile ? 3 + (i % 2) : 1 + (i % 2),
      hard_money_worry: isUnpreparedProfile ? 4 : 2,
      mat_identity_shift: 4,
      mat_grief_for_old_self: isUnpreparedProfile ? 4 : 3,
      mat_growing_into_role: isUnpreparedProfile ? 3 : 4,
      open_unexpected: quotesUnexpected[i % quotesUnexpected.length],
      open_wish_knew: quotesWishKnew[i % quotesWishKnew.length],
      safety_self_harm: 'no',
    };

    if (relationship !== 'single_separated_widowed') {
      answers.sup_partner_listens = clamp(basePrep + (i % 2));
      answers.sup_partner_shares_care = clamp(basePrep);
      answers.sup_partner_safe_respected = clamp(basePrep + 1);
    }

    const derivedScores = computeDerivedScores(answers, SEED_STUDY_CONFIG, SEED_QUESTIONNAIRE_V1);
    const dayOffset = i % 14;
    const createdDate = new Date(Date.UTC(2026, 10, 1 + dayOffset, 9 + (i % 7), 15, 0)).toISOString();

    result.push({
      id: `pilot_${String(i + 1).padStart(4, '0')}`,
      respondentCode: `DS-${String(i + 1).padStart(4, '0')}`,
      siteId: site.id,
      siteName: site.name,
      interviewerUid,
      interviewerName,
      questionnaireVersionId: SEED_QUESTIONNAIRE_V1.id,
      questionnaireVersion: SEED_QUESTIONNAIRE_V1.version,
      language: i % 3 === 0 ? 'rw' : 'en',
      consentConfirmed: true,
      respondentAge: age,
      guardianConsentConfirmed: age < 18,
      answers,
      derivedScores,
      safetyFlagged: isSafetyTriggered(answers),
      durationSeconds: 360 + (i % 8) * 45,
      completionStatus: 'complete',
      softDeleted: false,
      deleteApprovalStatus: 'none',
      createdAt: createdDate,
      updatedAt: createdDate,
      syncedAt: createdDate,
    });
  }
  return result;
}
