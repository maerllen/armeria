import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'Armeria - Gestão de Armas e Munições' });
  });

  // Handle favicon.ico requests gracefully
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).send('<html><body><h2>Aplica&ccedil;&atilde;o inicializando...</h2><p>O build da aplica&ccedil;&atilde;o ainda n&atilde;o foi gerado no servidor. Execute <code>npm run build</code> no terminal da Hostinger.</p></body></html>');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Armeria] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
