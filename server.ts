import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

const bootApp = express();
let innerHandler: express.Express | null = null;

// Bind port 3000 immediately (<50ms) before loading heavy dependencies so cold-boot checks never time out
bootApp.listen(PORT, '0.0.0.0', () => {
  console.log(`Darna Real Estate Server running at http://0.0.0.0:${PORT}`);
});

const initPromise = (async () => {
  const { createDarnaApiApp } = await import('./src/server/apiApp.ts');
  const { app } = createDarnaApiApp();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.locals.viteServer = vite;
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist'), { index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  innerHandler = app;
})();

initPromise.catch((err) => {
  console.error('Failed to initialize Darna server:', err);
});

bootApp.use(async (req, res, next) => {
  try {
    if (!innerHandler) {
      await initPromise;
    }
    if (innerHandler) {
      return innerHandler(req, res, next);
    }
    next();
  } catch (err) {
    next(err);
  }
});
