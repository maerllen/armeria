import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { testConnection, initializeDatabaseSchema, dbConfig } from './src/db/mysql';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'Armeria - Gestão de Armas e Munições',
      database: {
        type: 'MySQL',
        name: dbConfig.database,
        user: dbConfig.user,
        host: dbConfig.host,
        port: dbConfig.port
      }
    });
  });

  // MySQL Database Status Endpoint
  app.get('/api/db/status', async (req, res) => {
    const status = await testConnection();
    res.status(status.success ? 200 : 500).json(status);
  });

  // MySQL Database Schema Initialization Endpoint
  app.post('/api/db/init', async (req, res) => {
    const result = await initializeDatabaseSchema();
    res.status(result.success ? 200 : 500).json(result);
  });

  // MySQL Non-sensitive Config Endpoint
  app.get('/api/db/config', (req, res) => {
    res.json({
      type: 'MySQL',
      database: dbConfig.database,
      user: dbConfig.user,
      host: dbConfig.host,
      port: dbConfig.port
    });
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
