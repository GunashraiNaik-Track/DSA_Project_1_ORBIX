import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createFallbackApiRouter } from './server_fallback.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PYTHON_PORT = 8001;
const PYTHON_HOST = '127.0.0.1';

async function tryStartPythonBackend(): Promise<boolean> {
  return new Promise<boolean>((resolveStartup) => {
    let settled = false;
    let pythonProc: ChildProcess;

    try {
      pythonProc = spawn(
        'python3',
        ['-u', '-m', 'backend.api', '--host', PYTHON_HOST, '--port', String(PYTHON_PORT)],
        {
          cwd: __dirname,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      resolveStartup(false);
      return;
    }

    const cleanup = () => {
      if (!pythonProc.killed) {
        pythonProc.kill('SIGTERM');
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);

    pythonProc.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
    });
    pythonProc.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
    });

    pythonProc.on('error', (err) => {
      console.warn(`[server] Python API unavailable (${err.message}); using built-in Node engine.`);
      if (!settled) {
        settled = true;
        resolveStartup(false);
      }
    });

    pythonProc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`[server] Python API exited with code ${code}`);
      }
      if (!settled) {
        settled = true;
        resolveStartup(false);
      }
    });

    const deadline = Date.now() + 8000;
    const poll = () => {
      if (settled) return;
      if (Date.now() >= deadline) {
        settled = true;
        cleanup();
        resolveStartup(false);
        return;
      }
      const req = http.get(`http://${PYTHON_HOST}:${PYTHON_PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200 && !settled) {
          settled = true;
          resolveStartup(true);
        } else if (!settled) {
          setTimeout(poll, 150);
        }
      });
      req.on('error', () => {
        if (!settled) setTimeout(poll, 150);
      });
      req.setTimeout(500, () => {
        req.destroy();
      });
    };

    poll();
  });
}

async function main() {
  const pythonReady = await tryStartPythonBackend();
  const app = express();

  if (pythonReady) {
    // Proxy /api/* traffic to the Python NetworkEngine REST API
    app.use('/api', (req, res) => {
      const proxyReq = http.request(
        {
          hostname: PYTHON_HOST,
          port: PYTHON_PORT,
          path: req.originalUrl,
          method: req.method,
          headers: {
            ...req.headers,
            host: `${PYTHON_HOST}:${PYTHON_PORT}`,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: `Python API unavailable: ${err.message}` });
        }
      });

      req.pipe(proxyReq, { end: true });
    });
  } else {
    // Node-only deployment fallback (e.g. Cloud Run Node runtime without python3)
    app.use('/api', createFallbackApiRouter());
  }

  const distDir = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (hasDist && process.env.npm_lifecycle_event === 'start');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use('/src/assets', express.static(path.resolve(__dirname, 'dist/src/assets')));
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[server] Chanakya Commons listening on http://0.0.0.0:${PORT} (engine=${pythonReady ? 'python' : 'node'})`,
    );
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
