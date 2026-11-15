import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { AggregateInsightsPayloadSchema } from '../src/types/study.ts';

function resolveFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    if (parsed.projectId) return parsed.projectId;
  } catch {
    // Fallback below
  }
  return 'gen-lang-client-0750045159';
}

export function getAdminAuth() {
  if (!getApps().length) {
    initializeApp({
      projectId: resolveFirebaseProjectId(),
    });
  }
  return getAuth();
}

export async function verifyBearerHeader(
  authHeader: string | null | undefined
): Promise<{ ok: true; user: DecodedIdToken } | { ok: false; status: number; error: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing bearer token' };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { ok: true, user: decoded };
  } catch (err) {
    console.error('Token verification failed:', err);
    return { ok: false, status: 401, error: 'Unauthorized: Invalid or expired session token' };
  }
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Strip accidental phone numbers or email-like strings before sending open-text snippets for theme clustering
export function scrubPotentialIdentifiers(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?250|0)\s*7\d{2}[\s-]?\d{3}[\s-]?\d{3}/g, '[redacted-phone]')
    .slice(0, 500)
    .trim();
}

export const ThemeRequestSchema = z.object({
  snippets: z
    .array(
      z.object({
        respondentCode: z.string().max(32),
        text: z.string().min(3).max(600),
      })
    )
    .min(1)
    .max(40),
});

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleInsightsRequest(payload: unknown): Promise<ApiResult> {
  const parsed = AggregateInsightsPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: 'Invalid aggregate payload', details: parsed.error.flatten() },
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 503,
      body: {
        error: 'Gemini AI insights are not configured in this environment (missing GEMINI_API_KEY).',
      },
    };
  }

  const stats = parsed.data;
  const prompt = [
    'You are advising a university public-health research team in Rwanda studying maternal preparedness ("matrescence") and postpartum strain.',
    'Analyze ONLY the de-identified, aggregated statistics provided below. Do NOT claim causality, do NOT extrapolate beyond this convenience sample, and explicitly note when n < 30 or confidence intervals are wide.',
    JSON.stringify(stats, null, 2),
  ].join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Be rigorous, humble, plain-spoken, and methodologically cautious. Never overclaim causal effects from cross-sectional survey aggregates.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Plain-language 2-3 sentence summary of the aggregated patterns.',
            },
            keyPatterns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 4 cautious, evidence-grounded observations.',
            },
            limitations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 methodological limitations (sample size, recall bias, clinic sampling).',
            },
            nextDataToCollect: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 3 concrete field data collection priorities for the 8 researchers.',
            },
          },
          required: ['summary', 'keyPatterns', 'limitations', 'nextDataToCollect'],
        },
      },
    });

    const parsedJson = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
    return {
      status: 200,
      body: {
        ...parsedJson,
        generatedAt: new Date().toISOString(),
        model: 'gemini-4-hydrogen',
        disclaimer: 'AI-generated from aggregated de-identified statistics only. Review by research lead required.',
      },
    };
  } catch (err) {
    console.error('Gemini /api/insights error:', err);
    return {
      status: 502,
      body: { error: 'Unable to generate AI insights right now. Please try again shortly.' },
    };
  }
}

export async function handleThemesRequest(payload: unknown): Promise<ApiResult> {
  const parsed = ThemeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: 'Invalid open-text theme request' },
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      status: 503,
      body: {
        error: 'Gemini AI theme assistant is unavailable (missing GEMINI_API_KEY). Manual tagging remains fully available.',
      },
    };
  }

  const sanitized = parsed.data.snippets.map((s) => ({
    respondentCode: s.respondentCode,
    text: scrubPotentialIdentifiers(s.text),
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Identify recurring qualitative themes across these de-identified maternal interview excerpts:\n${JSON.stringify(sanitized)}`,
      config: {
        systemInstruction:
          'Suggest concise, respectful qualitative codes for a Rwanda matrescence study. Output must be marked for human researcher verification.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            themes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  respondentCodes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['name', 'description', 'respondentCodes'],
              },
            },
          },
          required: ['themes'],
        },
      },
    });

    const parsedJson = JSON.parse((response.text ?? '{"themes":[]}').trim()) as { themes?: unknown[] };
    return {
      status: 200,
      body: {
        themes: parsedJson.themes ?? [],
        generatedAt: new Date().toISOString(),
        aiGenerated: true,
        reviewNotice: 'AI-proposed themes require manual researcher verification before publication.',
      },
    };
  } catch (err) {
    console.error('Gemini /api/themes error:', err);
    return {
      status: 502,
      body: { error: 'Unable to cluster qualitative themes right now.' },
    };
  }
}
