'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'https://seesp-my.sharepoint.com/:l:/g/personal/itv_seintec_educacao_sp_gov_br/JACaDeD8XkaHRaX2WSJPMXJ6ARg_YVMIXarwCYu78XAnEOs?e=9Dn1Da';
const SOURCE_URL = process.env.CAR_SCHEDULE_URL || DEFAULT_URL;
const OUT_DIR = path.resolve(__dirname, '..', 'frontend', 'data');
const JSON_FILE = path.join(OUT_DIR, 'car-schedule.json');
const CSV_FILE = path.join(OUT_DIR, 'car-schedule.csv');

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
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
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
  const payload = JSON.parse(objectText);
  return Array.isArray(payload?.ListData?.Row) ? payload.ListData.Row : [];
}

async function fetchWithCookies(url) {
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
  if (!response?.ok) throw new Error(`SharePoint retornou HTTP ${response?.status || 'desconhecido'}.`);
  return response.text();
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

function itemsToCsv(items) {
  const ignored = new Set(['PermMask', 'FSObjType', 'UniqueId', 'ContentTypeId', 'FileRef', 'Attachments', 'SMTotalSize', 'ScopeId', 'owshiddenversion', 'Restricted', 'PreviewThumbnailsQualitySets']);
  const headers = Array.from(items.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!ignored.has(key) && !key.startsWith('_') && !key.endsWith('.FriendlyDisplay')) set.add(key);
    });
    return set;
  }, new Set()));
  return [
    headers.map(csvCell).join(','),
    ...items.map((row) => headers.map((header) => csvCell(row?.[header])).join(','))
  ].join('\r\n');
}

async function main() {
  const html = await fetchWithCookies(SOURCE_URL);
  const items = unwrapSharePointHtmlItems(html);
  if (!items.length) throw new Error('Nenhuma linha encontrada no payload publico do SharePoint.');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_FILE, `${JSON.stringify({
    source: 'sharepoint-public-html',
    sourceUrl: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    items
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(CSV_FILE, `\uFEFF${itemsToCsv(items)}\n`, 'utf8');
  console.log(`Car schedule synced: ${items.length} item(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
