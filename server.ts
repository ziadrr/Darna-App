import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
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
  const [{ createDarnaApiApp }, viteModule] = await Promise.all([
    import('./src/server/apiApp.ts'),
    !isProduction ? import('vite') : Promise.resolve(null),
  ]);
  const { app, db } = createDarnaApiApp();

  if (!isProduction && viteModule) {
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.locals.viteServer = vite;
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist'), { index: false }));
    app.use(express.static(path.join(__dirname, 'public'), { index: false }));
    app.get('*', (req, res) => {
      if (/\.(png|jpe?g|webp|gif|svg|ico|webmanifest|json|js|css|map|txt|xml)$/i.test(req.path)) {
        return res.status(404).send('Fichier statique introuvable');
      }
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Expose app immediately so /api/health never blocks during boot hydration
  innerHandler = app;

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      Promise.all([db.ensureCloudSqlSchemaChecked(), db.hydrateOnce()]),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('Timeout (15s) lors de l’hydratation initiale Cloud SQL')),
          15_000
        );
        if (typeof timeoutHandle.unref === 'function') {
          timeoutHandle.unref();
        }
      }),
    ]);
  } catch (err) {
    console.error('[CloudSQL] Échec de l’hydratation initiale au démarrage:', err);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
})();

initPromise.catch((err) => {
  console.error('Failed to initialize Darna server:', err);
});

bootApp.use(async (req, res, next) => {
  try {
    if (!innerHandler) {
      const isRootProbe =
        (req.method === 'GET' || req.method === 'HEAD') &&
        (req.path === '/' || req.path === '/index.html') &&
        !req.query?.annonce;

      if (isRootProbe) {
        await Promise.race([
          initPromise,
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
        if (!innerHandler) {
          const fallbackHtmlPath = isProduction
            ? path.join(__dirname, 'dist', 'index.html')
            : path.join(__dirname, 'index.html');
          if (fs.existsSync(fallbackHtmlPath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(fs.readFileSync(fallbackHtmlPath, 'utf8'));
          }
        }
      } else {
        await initPromise;
      }
    }
    if (innerHandler) {
      return innerHandler(req, res, next);
    }
    next();
  } catch (err) {
    next(err);
  }
});

