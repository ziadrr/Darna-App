import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createDarnaApiApp } from './src/server/apiApp.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const { app } = createDarnaApiApp();

  // Bind port 3000 immediately so container cold-boot health checks succeed right away
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Darna Real Estate Server running at http://0.0.0.0:${PORT}`);
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
