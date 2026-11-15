import type { Language } from '../types/study.ts';

export interface TranslationStrings {
  appTitle: string;
  studySubtitle: string;
  rwTranslationNotice: string;
  nav: {
    interview: string;
    myEntries: string;
    dashboard: string;
    openText: string;
    questionnaire: string;
    governance: string;
  };
  auth: {
    signInTitle: string;
    signInBody: string;
    signInButton: string;
    signOut: string;
    sessionLockWarning: string;
    unlockSession: string;
    twoFactorLabel: string;
  };
  consent: {
    title: string;
    intro: string;
    privacyBullet1: string;
    privacyBullet2: string;
    privacyBullet3: string;
    siteLabel: string;
    ageLabel: string;
    confirmConsent: string;
    confirmPrivacy: string;
    guardianRequired: string;
    confirmGuardian: string;
    startInterview: string;
    dataHandlingReminder: string;
  };
  interview: {
    stepOf: string;
    next: string;
    previous: string;
    saveDraft: string;
    submit: string;
    savedOffline: string;
    syncPending: string;
    synced: string;
    whereToGetHelp: string;
    resumeDrafts: string;
    newInterview: string;
    agreementLabels: [string, string, string, string, string];
    frequencyLabels: [string, string, string, string, string];
  };
  safety: {
    alertTitle: string;
    alertLead: string;
    step1: string;
    step2: string;
    step3: string;
    referralSiteContact: string;
    protocolLabel: string;
    acknowledgeButton: string;
    flaggedNotice: string;
  };
}

export const TRANSLATIONS: Record<Language, TranslationStrings> = {
  en: {
    appTitle: 'Data Detectives',
    studySubtitle: 'Matrescence & Maternal Readiness Study · Rwanda',
    rwTranslationNotice: '',
    nav: {
      interview: 'Collect Interview',
      myEntries: 'My Entries',
      dashboard: 'Dashboard',
      openText: 'Open Text',
      questionnaire: 'Questionnaire',
      governance: 'Team & Governance',
    },
    auth: {
      signInTitle: 'Research Team Sign In',
      signInBody:
        'Authorized university researchers and clinical study staff only. All entries, edits, and exports are attributed to your verified account.',
      signInButton: 'Sign in with Google',
      signOut: 'Sign out',
      sessionLockWarning: 'Session paused after inactivity to protect sensitive maternal health responses.',
      unlockSession: 'Re-verify & Resume',
      twoFactorLabel: 'Google 2-Step Verification active on institutional account',
    },
    consent: {
      title: 'Informed Consent & Privacy Confirmation',
      intro:
        'Before asking any study questions, please read the consent script aloud calmly and confirm the mother understands her rights.',
      privacyBullet1:
        'No names, phone numbers, national IDs, or home locations are ever recorded.',
      privacyBullet2:
        'She may skip any question or pause/stop the interview at any moment without affecting her clinic care.',
      privacyBullet3:
        'If she shares thoughts of harming herself, the interviewer will stay with her and connect her with clinic mental health staff today.',
      siteLabel: 'Health Centre Site',
      ageLabel: 'Mother’s Age (years, for consent & age-group analysis)',
      confirmConsent: 'The mother verbally gave informed consent to participate voluntarily.',
      confirmPrivacy: 'Confirmed: No identifying information (name, phone, village) has been or will be entered.',
      guardianRequired: 'Participant is under 18. Legal guardian or adult caregiver assent/consent is required.',
      confirmGuardian: 'Guardian/caregiver consent obtained alongside the young mother’s assent.',
      startInterview: 'Begin Interview',
      dataHandlingReminder:
        'Data-handling reminder: Never write the mother’s name, phone number, or exact village in open-text fields. Lock your screen immediately if you step away.',
    },
    interview: {
      stepOf: 'Section',
      next: 'Continue',
      previous: 'Back',
      saveDraft: 'Save Draft',
      submit: 'Complete & Save Interview',
      savedOffline: 'Saved securely offline on this device (encrypted)',
      syncPending: 'Waiting to sync when connection returns',
      synced: 'Synced to study database',
      whereToGetHelp: 'Where to Get Help (Site Referral)',
      resumeDrafts: 'Incomplete Drafts',
      newInterview: 'Start New Interview',
      agreementLabels: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
      frequencyLabels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Almost always'],
    },
    safety: {
      alertTitle: 'Pause Interview — Immediate Support Needed',
      alertLead:
        'The mother shared thoughts of self-harm. Your only priority right now is her safety and dignity.',
      step1: 'Stop the survey calmly and thank her warmly for trusting you with how she feels.',
      step2: 'Stay with her—do not leave her alone while arranging clinic support.',
      step3: 'Accompany her today to the health centre’s mental health staff using the referral contact below.',
      referralSiteContact: 'Health Centre Same-Day Referral Contact',
      protocolLabel: 'Site Clinical Protocol',
      acknowledgeButton: 'I understand & have initiated same-day accompaniment',
      flaggedNotice: 'De-identified safety flag logged for research lead follow-up (no mother PII stored).',
    },
  },
  rw: {
    appTitle: 'Data Detectives',
    studySubtitle: 'Ubushakashatsi ku kwitegura ububyeyi (Matrescence) · Rwanda',
    rwTranslationNotice:
      'Placeholder Kinyarwanda strings — needs professional translation and back-translation before field ethics submission.',
    nav: {
      interview: 'Kora Ikiganiro',
      myEntries: 'Ibyo Nakusanyije',
      dashboard: 'Imbonerahamwe',
      openText: 'Ibitekerezo Byanditse',
      questionnaire: 'Ibibazo',
      governance: 'Itsinda & Amategeko',
    },
    auth: {
      signInTitle: 'Injira nk’Umushakashatsi',
      signInBody:
        'Abashakashatsi bemewe gusa. Buri gikorwa cyose gikurikiranwa ku izina ry’ukoresha.',
      signInButton: 'Injira ukoresheje Google',
      signOut: 'Sohoka',
      sessionLockWarning: 'Sisitemu yafunzwe by’agateganyo kubera kutagira igikorwa mu rwego rwo kurinda amakuru.',
      unlockSession: 'Ongera wemeze ukomeze',
      twoFactorLabel: 'Umutekano w’inyongera wa Google',
    },
    consent: {
      title: 'Kwemera ku bushake & Kurinda ibanga',
      intro:
        'Mbere yo kubaza ikibazo na kimwe, somera umubyeyi aya magambo mu ituze wemeze ko abyumva neza.',
      privacyBullet1: 'Nta mazina, nimero ya telefoni, indangamuntu cyangwa aho atuye byandikwa.',
      privacyBullet2: 'Ashobora gusimbuka ikibazo cyose cyangwa agahagarika ikiganiro igihe icyo ari cyo cyose.',
      privacyBullet3:
        'Niba afite ibitekerezo byo kwiyagirira nabi, umubaza agumana na we akamugeza ku mukozi w’ubuzima bwo mu mutwe uwo munsi.',
      siteLabel: 'Ikigo Nderabuzima',
      ageLabel: 'Imyaka y’umubyeyi (mu myaka)',
      confirmConsent: 'Umubyeyi yemeye ku bushake kugira uruhare muri iki kiganiro.',
      confirmPrivacy: 'Byemejwe: Nta makuru aranga umuntu azashyirwa muri sisitemu.',
      guardianRequired: 'Afite munsi y’imyaka 18. Uruhushya rw’umubyeyi cyangwa umurezi rurasabwa.',
      confirmGuardian: 'Umurezi yemeye kandi umubyeyi muto na we yemeye ku bushake.',
      startInterview: 'Tangira Ikiganiro',
      dataHandlingReminder:
        'Icyitonderwa: Ntuzigere wandika amazina cyangwa telefoni mu bisubizo. Funga telefoni igihe uhagurutse.',
    },
    interview: {
      stepOf: 'Igice',
      next: 'Komeza',
      previous: 'Subira inyuma',
      saveDraft: 'Bika by’agateganyo',
      submit: 'Ohereza Ikiganiro',
      savedOffline: 'Byabitswe mu mutekano kuri iyi telefoni (bidafite interineti)',
      syncPending: 'Birategereje interineti ngo byoherezwe',
      synced: 'Byoherejwe neza mu bubiko',
      whereToGetHelp: 'Aho Wabona Ubufasha (Ikigo Nderabuzima)',
      resumeDrafts: 'Ibiganiro bitararangira',
      newInterview: 'Tangira ikiganiro gishya',
      agreementLabels: ['Simbyemera na gato', 'Simbyemera', 'Hagati', 'Ndabyemera', 'Ndabyemera cyane'],
      frequencyLabels: ['Na rimwe', 'Gake cyane', 'Rimwe na rimwe', 'Kenshi', 'Hafi buri gihe'],
    },
    safety: {
      alertTitle: 'Hagarika Ikiganiro — Ubufasha Bwihutirwa Burakenewe',
      alertLead:
        'Umubyeyi yagaragaje ibitekerezo byo kwigirira nabi. Icy’ingenzi ubu ni umutekano we n’icyubahiro cye.',
      step1: 'Hagarika ikiganiro mu ituze umushimire cyane kukwizera akakubwira uko amerewe.',
      step2: 'Gumana na we — ntumusize wenyine mu gihe ushaka umukozi w’ikigo nderabuzima.',
      step3: 'Mujyane uyu munsi ku mukozi ushinzwe ubuzima bwo mu mutwe ukoresheje amakuru ari hasi.',
      referralSiteContact: 'Umukozi Ushinzwe Ubufasha ku Kigo Nderabuzima',
      protocolLabel: 'Amabwiriza y’Ikigo Nderabuzima',
      acknowledgeButton: 'Ndabyumva kandi natangiye kumugeza ku mukozi w’ubuzima',
      flaggedNotice: 'Ikimenyetso kitagaragaza umwirondoro cyanditswe kugira ngo umuyobozi akurikirane.',
    },
  },
};
