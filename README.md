# Data Scavengers — Rwanda Matrescence & Maternal Readiness Platform

A field-ready, offline-first research platform built for a 8-student university research team in Rwanda studying **matrescence** (*"Do most mothers in Rwanda feel emotionally and relationally unprepared for motherhood, and does that predict later strain?"*).

---

## 1. Architecture Summary & Stack Decisions

| Layer | Implementation | Justification |
|---|---|---|
| **Frontend & PWA** | React 19 + TypeScript + Vite + Tailwind CSS v4 + `vite-plugin-pwa` (Workbox) | Configured for instant mobile clinic loading, Android home-screen installability, and full offline asset precaching. |
| **Backend API** | Express (`server.ts`) + `tsx` + `@google/genai` (`gemini-4-hydrogen`) + `firebase-admin` | Verifies Firebase ID tokens server-side, enforces rate limits, and ensures `GEMINI_API_KEY` and raw PII-free aggregates never leak to untrusted clients. |
| **Database & RBAC** | Firebase Firestore (Enterprise Edition) + Firebase Auth (`firestore.rules`) | Adapted from PostgreSQL/Supabase to AI Studio's provisioned Firebase backend while enforcing strict role-based security rules (`admin`, `interviewer`, `analyst`), immutable audit logs, and zero-PII schema allowlists. |
| **Offline Encryption** | IndexedDB (`idb`) + Web Crypto API (`AES-GCM` 256-bit) | Drafts and queued offline interviews are encrypted at rest on the device and synced idempotently by client UUID (`setDoc`) so weak clinic connectivity never creates duplicate records. |
| **Charts & Exports** | Recharts + `xlsx` + native CSV codebook generator | Interactive, color-blind-safe charts with numeric correlation labels, PNG/PDF export, and multi-sheet XLSX exports with full scoring codebook. |

---

## 2. Team Roles & Permissions

1. **Admin (Research Lead)**: Manages team invites/roles, health centre sites and referral protocols, dynamic questionnaire versions, derived score cutoffs & analysis lock, soft-delete approvals, safety flag review, shareable read-only report links, and CSV/XLSX exports.
2. **Interviewer**: Conducts informed-consent interviews online or offline, resumes encrypted drafts, views **only their own** collected entries (with audited correction & soft-delete request), and sees the aggregate study overview.
3. **Analyst**: Reads all de-identified responses, runs subgroup comparisons, correlation/regression views, and qualitative open-text theme coding—strictly blocked by Firestore security rules from modifying raw response answers.

---

## 3. Running an Interview (Field Protocol)

1. **Open Data Scavengers** (or install it to your Android home screen using **Install App**).
2. Choose **English** or **Kinyarwanda** in the top field bar before starting.
3. Tap **Start New Interview**:
   - Select the **Health Centre Site** and enter the mother's age.
   - Confirm **verbal informed consent** and **zero-PII privacy** (if age < 18, confirm **guardian/caregiver assent & consent**).
   - The system assigns a de-identified code (e.g., `DS-4821AB`). Never type a mother's name, phone number, or village anywhere.
4. Proceed section by section. Drafts autosave encrypted locally every 350ms.
5. **Safety Alert Protocol**: If the mother answers **Yes** to thoughts of self-harm:
   - A full-screen high-visibility alert opens immediately.
   - **Stop the survey**, **stay with the mother**, and **accompany her the same day** to the site's listed mental health nurse/desk.
   - Confirm accompaniment to log the de-identified safety flag for Research Lead follow-up.

---

## 4. Reading the Dashboard & Statistical Safeguards

- **Derived Scores (1–5)**:
  - **Preparedness**: Mean of 6 pre-birth readiness items with *worry* reverse-scored (`6 - raw`). Unprepared if `< 3.0` (configurable until locked).
  - **Strain**: Mean of 5 past-2-week distress items plus reverse-scored *rest* (`6 - wb_rest`). High strain if `>= 3.0`.
  - **Support, Partner Quality, Hardship, Matrescence**: Transparent composites documented in the **Codebook** tab.
- **Sample Gate (`n < 30`)**: The Hypothesis Tester refuses to emit a statistical verdict below `n = 30` valid paired responses and always surfaces convenience-sampling and retrospective recall-bias warnings.
- **Relationships**: Correlation matrices display numeric Pearson `r` in every cell (never color alone), and simple linear regressions note that observational associations do not establish causation.

---

## 5. Deployment Instructions

### Local / AI Studio Development
```bash
npm install
npm run test
npm run lint
npm run build
npm run dev
```

### Production (Cloud Run / Node or Vercel + Firebase)
1. Configure environment variables from `.env.example` (`GEMINI_API_KEY`, `VITE_SESSION_TIMEOUT_MINUTES`).
2. Ensure `firestore.rules` is deployed to your Firebase project (`firebase deploy --only firestore:rules`).
3. Build and start:
   ```bash
   npm run build
   npm start
   ```
   *(If deploying separately on Vercel with Supabase/PostgreSQL instead of AI Studio's Express + Firebase setup, migrate `server.ts` `/api/insights` and `/api/themes` to Next.js Route Handlers and map `firebase-blueprint.json` collections to Supabase tables with Row-Level Security policies by `role` and `interviewer_uid`.)*

---

## 6. Things That Still Need Humans (Before Live Field Launch)

1. **Ethics / IRB Approval**: Submit protocol, informed consent script, minor assent/guardian workflow, and data retention policy to the University / Rwanda National Ethics Committee.
2. **Professional Kinyarwanda Translation & Back-Translation**: All strings marked `[Needs professional translation and back-translation]` must be translated by bilingual maternal-health specialists and independently back-translated.
3. **Licensing of Validated Scales**: Do not add copyrighted items for EPDS, Parenting Stress Index (PSI-SF), or MSPSS until formal copyright permissions and validated Kinyarwanda versions are secured; activate them via the **Licensed Scale Slots** panel.
4. **Agreed Health Centre Referral Protocols**: Confirm the named same-day mental health contact, desk extension, and hospital escalation path with the Titulaire/leadership at each participating health centre.
