'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 4173);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'setechub-state.json');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function sendCsv(res, filename, text) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
  });
  res.end(`\uFEFF${text}`);
}

function assertSharePointUrl(parsed) {
  if (!/\.sharepoint\.com$/i.test(parsed.hostname)) {
    throw new Error('Somente listas SharePoint sao aceitas.');
  }
}

function fallbackSharedListViewUrl(parsed, listName = 'ReservasVeiculos') {
  const match = parsed.pathname.match(/^\/:l:\/[^/]+\/personal\/([^/]+)\//i);
  if (!match) return '';
  const sitePath = `/personal/${match[1]}`;
  return `${parsed.origin}${sitePath}/Lists/${encodeURIComponent(listName)}/AllItems.aspx`;
}

function sharePointListApiUrl(url) {
  const parsed = new URL(url);
  assertSharePointUrl(parsed);
  const sourceUrl = fallbackSharedListViewUrl(parsed) || parsed.toString();
  const source = new URL(sourceUrl);
  const match = source.pathname.match(/^(.*)\/Lists\/([^/]+)\/AllItems\.aspx$/i);
  if (!match) return source.toString();
  const sitePath = match[1];
  const listName = decodeURIComponent(match[2]);
  const listPath = `${decodeURIComponent(sitePath)}/Lists/${listName}`.replace(/'/g, "''");
  const query = new URLSearchParams({ '$top': '5000' });
  return `${source.origin}${sitePath}/_api/web/GetList('${listPath}')/items?${query}`;
}

async function resolveSharePointListApiUrl(url) {
  const parsed = new URL(url);
  assertSharePointUrl(parsed);
  if (!/^\/:l:\//i.test(parsed.pathname)) return sharePointListApiUrl(parsed.toString());

  try {
    const response = await fetch(parsed.toString(), { redirect: 'manual' });
    const location = response.headers.get('location');
    if (location) {
      const resolved = new URL(location, parsed);
      assertSharePointUrl(resolved);
      return sharePointListApiUrl(resolved.toString());
    }
  } catch {}

  return sharePointListApiUrl(parsed.toString());
}

function unwrapSharePointItems(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.d)) return payload.d;
  return [];
}

function extractJsonObjectAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return '';
  const start = source.indexOf('{', markerIndex);
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

function unwrapSharePointHtmlItems(html) {
  const objectText = extractJsonObjectAfter(String(html || ''), 'var g_listData =');
  if (!objectText) return [];
  try {
    const payload = JSON.parse(objectText);
    return Array.isArray(payload?.ListData?.Row) ? payload.ListData.Row : [];
  } catch {
    return [];
  }
}

async function fetchSharedSharePointListItems(url) {
  let nextUrl = url;
  const cookies = new Map();
  let response = null;
  for (let redirectCount = 0; redirectCount < 10; redirectCount += 1) {
    response = await fetch(nextUrl, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0',
        ...(cookies.size ? { Cookie: Array.from(cookies.values()).join('; ') } : {})
      }
    });
    const setCookie = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : String(response.headers.get('set-cookie') || '').split(/,(?=\s*[^;,=]+=[^;,]+)/);
    setCookie.filter(Boolean).forEach((item) => {
      const pair = item.split(';')[0].trim();
      const name = pair.split('=')[0];
      if (name && pair.includes('=')) cookies.set(name, pair);
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) break;
    nextUrl = new URL(location, nextUrl).toString();
  }
  if (!response.ok) return [];
  return unwrapSharePointHtmlItems(await response.text());
}

async function fetchSharePointListItems(sourceUrl) {
  const response = await fetch(await resolveSharePointListApiUrl(sourceUrl), {
    headers: { Accept: 'application/json;odata=nometadata' }
  });
  if (!response.ok) {
    const sharedItems = await fetchSharedSharePointListItems(sourceUrl);
    if (sharedItems.length) return { items: sharedItems, source: 'sharepoint-public-html' };
    const error = new Error(`SharePoint retornou HTTP ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }
  const items = unwrapSharePointItems(await response.json());
  if (items.length) return { items, source: 'sharepoint-rest' };
  const sharedItems = await fetchSharedSharePointListItems(sourceUrl);
  if (sharedItems.length) return { items: sharedItems, source: 'sharepoint-public-html' };
  return { items, source: 'sharepoint-rest' };
}

function csvCell(value) {
  if (value == null) return '';
  let text = '';
  if (Array.isArray(value)) {
    text = value.map(csvCell).filter(Boolean).join('; ');
  } else if (typeof value === 'object') {
    text = csvCell(value.lookupValue || value.Title || value.LookupValue || value.Email || value.Name || value.Value || value.Label || '');
  } else {
    text = String(value);
  }
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sharePointItemsToCsv(items) {
  const rows = Array.isArray(items) ? items : [];
  const ignored = new Set(['PermMask', 'FSObjType', 'UniqueId', 'ContentTypeId', 'FileRef', 'Attachments', 'SMTotalSize', 'ScopeId', 'owshiddenversion', 'Restricted', 'PreviewThumbnailsQualitySets']);
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!ignored.has(key) && !key.startsWith('_') && !key.endsWith('.FriendlyDisplay')) set.add(key);
    });
    return set;
  }, new Set()));
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row?.[header])).join(','))
  ].join('\r\n');
}

function validateStateShape(candidate) {
  if (!isPlainObject(candidate)) {
    throw new Error('Estado invalido: payload precisa ser um objeto.');
  }
  const arrayKeys = [
    'municipalities',
    'sectors',
    'directoryContacts',
    'officialLinks',
    'checklist',
    'tasks',
    'calls',
    'schools',
    'supervisors',
    'supervisorVisits',
    'schoolProfiles',
    'schoolImports',
    'schoolAssets',
    'schoolNetworks',
    'assets',
    'notes'
  ];
  arrayKeys.forEach((key) => {
    if (candidate[key] != null && !Array.isArray(candidate[key])) {
      throw new Error(`Estado invalido: ${key} precisa ser uma lista.`);
    }
  });
  if (candidate.profile != null && !isPlainObject(candidate.profile)) {
    throw new Error('Estado invalido: profile precisa ser um objeto.');
  }
  if (candidate.officialContacts != null && !isPlainObject(candidate.officialContacts)) {
    throw new Error('Estado invalido: officialContacts precisa ser um objeto.');
  }
  if (candidate.histories != null && !isPlainObject(candidate.histories)) {
    throw new Error('Estado invalido: histories precisa ser um objeto.');
  }
  if (candidate.ponto != null && !isPlainObject(candidate.ponto)) {
    throw new Error('Estado invalido: ponto precisa ser um objeto.');
  }
  if (candidate.redes != null && !isPlainObject(candidate.redes)) {
    throw new Error('Estado invalido: redes precisa ser um objeto.');
  }
  return true;
}

function safeResolve(urlPath) {
  const normalized = decodeURIComponent(urlPath.split('?')[0]);
  const requested = ['/', '/login'].includes(normalized)
    ? '/index.html'
    : normalized.endsWith('/')
      ? `${normalized}index.html`
      : normalized;
  const resolved = path.resolve(ROOT_DIR, `.${requested}`);
  if (!resolved.startsWith(ROOT_DIR)) return null;
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendText(res, 404, 'Arquivo nao encontrado');
        return;
      }
      sendText(res, 500, error.message);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (['.html', '.css', '.js'].includes(ext)) {
      headers['Cache-Control'] = 'no-store, max-age=0';
      headers.Pragma = 'no-cache';
      headers.Expires = '0';
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

function readStateFile() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) return null;
  const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  validateStateShape(parsed.state || parsed);
  return parsed;
}

function writeStateFile(payload) {
  ensureDataDir();
  validateStateShape(payload.state || payload);
  fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function snapshotId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function listSnapshots() {
  ensureDataDir();
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const fullPath = path.join(SNAPSHOT_DIR, file);
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      return {
        id: path.basename(file, '.json'),
        label: parsed.label || path.basename(file, '.json'),
        savedAt: parsed.savedAt || fs.statSync(fullPath).mtime.toISOString()
      };
    })
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

function createSnapshot(payload) {
  ensureDataDir();
  const id = snapshotId();
  const filePath = path.join(SNAPSHOT_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    id,
    label: `Snapshot ${id}`,
    savedAt: new Date().toISOString(),
    state: payload.state || payload
  }, null, 2), 'utf8');
  return id;
}

function readSnapshot(id) {
  const filePath = path.join(SNAPSHOT_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runRedeProcessor(config = {}) {
  return new Promise((resolve, reject) => {
    const sourceFolder = String(config.folderPath || '').trim();
    if (!sourceFolder) {
      reject(new Error('Informe o caminho da pasta com as redes.'));
      return;
    }
    const resolvedFolder = path.resolve(sourceFolder);
    if (!fs.existsSync(resolvedFolder) || !fs.statSync(resolvedFolder).isDirectory()) {
      reject(new Error(`Pasta nao encontrada: ${resolvedFolder}`));
      return;
    }
    const scriptPath = path.join(ROOT_DIR, 'tools', 'processar_redes.ps1');
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-SourceFolder',
      resolvedFolder,
      '-YearSuffix',
      String(config.yearSuffix || '26'),
      '-NumberPlaceholder',
      String(config.numberPlaceholder || '{{REDE_NUMERO}}'),
      '-DatePlaceholder',
      String(config.datePlaceholder || '{{REDE_DATA}}'),
      '-HeadingPlaceholder',
      String(config.headingPlaceholder || '{{REDE_CABECALHO}}'),
      '-AssuntoLabel',
      String(config.assuntoLabel || 'Assunto:')
    ];
    const child = spawn('powershell.exe', args, {
      cwd: ROOT_DIR,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `PowerShell saiu com codigo ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      mode: 'arquivo-local',
      stateFile: fs.existsSync(STATE_FILE),
      updatedAt: fs.existsSync(STATE_FILE) ? fs.statSync(STATE_FILE).mtime.toISOString() : null,
      snapshotCount: listSnapshots().length
    });
    return;
  }

  if (requestUrl.pathname === '/api/state' && req.method === 'GET') {
    const state = readStateFile();
    if (!state) {
      sendJson(res, 404, { error: 'Nenhum estado salvo no servidor local.' });
      return;
    }
    sendJson(res, 200, state);
    return;
  }

  if (requestUrl.pathname === '/api/state' && req.method === 'PUT') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      const state = parsed.state || parsed;
      validateStateShape(state);
      writeStateFile({
        savedAt: new Date().toISOString(),
        state
      });
      const id = createSnapshot({ state });
      sendJson(res, 200, { ok: true, savedAt: new Date().toISOString(), snapshotId: id });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (requestUrl.pathname === '/api/snapshots' && req.method === 'GET') {
    sendJson(res, 200, { items: listSnapshots() });
    return;
  }

  if (requestUrl.pathname.startsWith('/api/snapshots/') && req.method === 'POST') {
    const id = requestUrl.pathname.split('/').pop();
    const snapshot = readSnapshot(id);
    if (!snapshot) {
      sendJson(res, 404, { error: 'Snapshot nao encontrado.' });
      return;
    }
    writeStateFile({
      savedAt: new Date().toISOString(),
      restoredFrom: id,
      state: snapshot.state || snapshot
    });
    sendJson(res, 200, {
      ok: true,
      restoredFrom: id,
      state: snapshot.state || snapshot
    });
    return;
  }

  if (requestUrl.pathname === '/api/redes/process' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      const result = await runRedeProcessor(parsed.config || parsed);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (requestUrl.pathname === '/api/sharepoint-list' && req.method === 'GET') {
    try {
      const sourceUrl = requestUrl.searchParams.get('url') || '';
      if (!sourceUrl) {
        sendJson(res, 400, { error: 'URL da lista nao informada.' });
        return;
      }
      sendJson(res, 200, await fetchSharePointListItems(sourceUrl));
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        error: error.message,
        hint: 'Se a lista for restrita, o servidor local nao recebe seu login do navegador.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/sharepoint-list.csv' && req.method === 'GET') {
    try {
      const sourceUrl = requestUrl.searchParams.get('url') || '';
      if (!sourceUrl) {
        sendJson(res, 400, { error: 'URL da lista nao informada.' });
        return;
      }
      const { items } = await fetchSharePointListItems(sourceUrl);
      sendCsv(res, 'sharepoint-list.csv', sharePointItemsToCsv(items));
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        error: error.message,
        hint: 'Nao foi possivel gerar CSV da lista SharePoint.'
      });
    }
    return;
  }

  if (req.method !== 'GET') {
    sendText(res, 405, 'Metodo nao suportado');
    return;
  }

  const filePath = safeResolve(requestUrl.pathname);
  if (!filePath) {
    sendText(res, 403, 'Caminho nao permitido');
    return;
  }

  serveFile(res, filePath);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`SETECHUB local server em http://localhost:${PORT}`);
  });
}

module.exports = {
  safeResolve,
  sharePointListApiUrl,
  validateStateShape
};
