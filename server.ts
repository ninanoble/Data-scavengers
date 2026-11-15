import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  handleInsightsRequest,
  handleThemesRequest,
  verifyBearerHeader,
} from './server/apiCore.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory sliding window rate limiter for API security
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const result = await verifyBearerHeader(req.headers.authorization);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'data-detectives' });
  });

  // Aggregate-only AI Insights endpoint: NEVER receives raw individual responses
  app.post('/api/insights', rateLimit(20, 60_000), requireAuth, async (req: Request, res: Response) => {
    const result = await handleInsightsRequest(req.body);
    res.status(result.status).json(result.body);
  });

  // Reviewable qualitative theme clustering for anonymized open-text answers
  app.post('/api/themes', rateLimit(20, 60_000), requireAuth, async (req: Request, res: Response) => {
    const result = await handleThemesRequest(req.body);
    res.status(result.status).json(result.body);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Data Detectives server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
