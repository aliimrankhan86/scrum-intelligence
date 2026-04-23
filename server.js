const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8787);
const SCOPE_KEY = 'default';
const BUILD_DIR = path.join(process.cwd(), 'build');
const DB_PATH = process.env.SCRUM_SYNC_DB_PATH || path.join(process.cwd(), 'data', 'scrum-intelligence.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const database = new DatabaseSync(DB_PATH);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS dashboard_state (
    scope_key TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    revision INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    client_saved_at INTEGER NOT NULL
  );
`);

const selectStateStmt = database.prepare(`
  SELECT scope_key, state_json, revision, updated_at, client_saved_at
  FROM dashboard_state
  WHERE scope_key = ?
`);

const upsertStateStmt = database.prepare(`
  INSERT INTO dashboard_state (scope_key, state_json, revision, updated_at, client_saved_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(scope_key) DO UPDATE SET
    state_json = excluded.state_json,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    client_saved_at = excluded.client_saved_at
`);

const streamClients = new Set();

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  });
  res.end(body);
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  });
  res.end();
}

function parseStoredState(row) {
  if (!row) return null;

  return {
    state: JSON.parse(row.state_json),
    revision: row.revision,
    updatedAt: row.updated_at,
    clientSavedAt: row.client_saved_at,
  };
}

function loadSharedState() {
  return parseStoredState(selectStateStmt.get(SCOPE_KEY));
}

function broadcastStateUpdate(payload) {
  const chunk = `event: state-updated\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of streamClients) {
    client.write(chunk);
  }
}

function saveSharedState(nextState) {
  const current = loadSharedState();
  const updatedAt = Date.now();
  const clientSavedAt = Number(nextState?.savedAt) || updatedAt;
  const currentSavedAt = Number(current?.clientSavedAt) || 0;

  if (current && clientSavedAt < currentSavedAt) {
    return {
      ...current,
      applied: false,
    };
  }

  const revision = (current?.revision || 0) + 1;

  upsertStateStmt.run(
    SCOPE_KEY,
    JSON.stringify(nextState),
    revision,
    updatedAt,
    clientSavedAt,
  );

  const payload = {
    state: nextState,
    revision,
    updatedAt,
    clientSavedAt,
    applied: true,
  };

  broadcastStateUpdate({
    revision,
    updatedAt,
    clientSavedAt,
  });

  return payload;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function proxyOpenRouterChat(body, requestUrl) {
  const openrouterKey = typeof body?.openrouterKey === 'string' ? body.openrouterKey.trim() : '';
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (!openrouterKey) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include openrouterKey.' } },
    };
  }

  if (!model) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include model.' } },
    };
  }

  if (!messages.length) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include messages.' } },
    };
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': `${requestUrl.origin}/`,
        'X-OpenRouter-Title': 'Scrum Intelligence',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: body?.temperature,
        max_completion_tokens: body?.max_completion_tokens,
        response_format: body?.response_format,
      }),
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: { message: text || 'OpenRouter returned a non-JSON response.' } };
    }

    return {
      status: upstream.status,
      payload,
    };
  } catch (error) {
    return {
      status: 502,
      payload: { error: { message: error?.message || 'OpenRouter proxy request failed.' } },
    };
  }
}

async function proxyGeminiGenerate(body) {
  const geminiKey = typeof body?.geminiKey === 'string' ? body.geminiKey.trim() : '';
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt : '';
  const userContent = typeof body?.userContent === 'string' ? body.userContent : '';

  if (!geminiKey) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include geminiKey.' } },
    };
  }

  if (!model) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include model.' } },
    };
  }

  if (!systemPrompt || !userContent) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include systemPrompt and userContent.' } },
    };
  }

  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userContent }],
          },
        ],
        generationConfig: {
          temperature: body?.temperature,
          maxOutputTokens: body?.maxOutputTokens,
          responseMimeType: body?.responseMimeType,
        },
      }),
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: { message: text || 'Gemini returned a non-JSON response.' } };
    }

    return {
      status: upstream.status,
      payload,
    };
  } catch (error) {
    return {
      status: 502,
      payload: { error: { message: error?.message || 'Gemini proxy request failed.' } },
    };
  }
}

async function proxyGroqChat(body) {
  const groqKey = typeof body?.groqKey === 'string' ? body.groqKey.trim() : '';
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (!groqKey) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include groqKey.' } },
    };
  }

  if (!model) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include model.' } },
    };
  }

  if (!messages.length) {
    return {
      status: 400,
      payload: { error: { message: 'Request body must include messages.' } },
    };
  }

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: body?.temperature,
        max_completion_tokens: body?.max_completion_tokens,
      }),
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: { message: text || 'Groq returned a non-JSON response.' } };
    }

    return {
      status: upstream.status,
      payload,
    };
  } catch (error) {
    return {
      status: 502,
      payload: { error: { message: error?.message || 'Groq proxy request failed.' } },
    };
  }
}

function serveStaticAsset(req, res, pathname) {
  if (!fs.existsSync(BUILD_DIR)) {
    jsonResponse(res, 404, { error: 'Shared sync server is running, but no build output was found.' });
    return;
  }

  const normalisedPath = pathname === '/' ? '/index.html' : pathname;
  const requestedPath = path.join(BUILD_DIR, normalisedPath);
  const resolvedPath = requestedPath.startsWith(BUILD_DIR) ? requestedPath : BUILD_DIR;

  let filePath = resolvedPath;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(BUILD_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = requestUrl;

  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  if (pathname === '/api/health') {
    jsonResponse(res, 200, {
      ok: true,
      mode: 'sqlite',
      databasePath: DB_PATH,
    });
    return;
  }

  if (pathname === '/api/dashboard-state/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(': connected\n\n');
    streamClients.add(res);
    const current = loadSharedState();
    if (current) {
      res.write(`event: state-updated\ndata: ${JSON.stringify({
        revision: current.revision,
        updatedAt: current.updatedAt,
        clientSavedAt: current.clientSavedAt,
      })}\n\n`);
    }

    req.on('close', () => {
      streamClients.delete(res);
    });
    return;
  }

  if (pathname === '/api/dashboard-state') {
    if (req.method === 'GET') {
      const current = loadSharedState();
      jsonResponse(res, 200, current || { state: null, revision: 0, updatedAt: null, clientSavedAt: null });
      return;
    }

    if (req.method === 'PUT') {
      try {
        const body = await readJsonBody(req);
        if (!body?.state || typeof body.state !== 'object') {
          jsonResponse(res, 400, { error: 'Request body must include a state object.' });
          return;
        }

        const saved = saveSharedState(body.state);
        jsonResponse(res, 200, saved);
      } catch (error) {
        jsonResponse(res, 400, { error: error.message || 'Could not save dashboard state.' });
      }
      return;
    }

    jsonResponse(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (pathname === '/api/openrouter/chat') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const proxied = await proxyOpenRouterChat(body, requestUrl);
      jsonResponse(res, proxied.status, proxied.payload);
    } catch (error) {
      jsonResponse(res, 400, { error: { message: error.message || 'Could not proxy the OpenRouter request.' } });
    }
    return;
  }

  if (pathname === '/api/gemini/generate') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const proxied = await proxyGeminiGenerate(body);
      jsonResponse(res, proxied.status, proxied.payload);
    } catch (error) {
      jsonResponse(res, 400, { error: { message: error.message || 'Could not proxy the Gemini request.' } });
    }
    return;
  }

  if (pathname === '/api/groq/chat') {
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const proxied = await proxyGroqChat(body);
      jsonResponse(res, proxied.status, proxied.payload);
    } catch (error) {
      jsonResponse(res, 400, { error: { message: error.message || 'Could not proxy the Groq request.' } });
    }
    return;
  }

  serveStaticAsset(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Shared dashboard server listening on http://${HOST}:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
