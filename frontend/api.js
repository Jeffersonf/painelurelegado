'use strict';

function canUseLocalApi() {
  return /^https?:$/i.test(window.location.protocol);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Falha em ${path}`);
  }
  return response.json();
}

async function refreshServerHealth() {
  if (!canUseLocalApi()) {
    serverStatus = { available: false, message: 'Abra pelo servidor local para usar a API.' };
    renderDiagnostics();
    return serverStatus;
  }
  try {
    const payload = await apiRequest('/api/health');
    serverStatus = {
      available: true,
      message: `Online em ${payload.mode || 'local'} | estado ${payload.stateFile ? 'pronto' : 'sem arquivo'} | snapshots ${payload.snapshotCount || 0}`
    };
  } catch (error) {
    serverStatus = { available: false, message: `Falha na API local: ${error.message}` };
  }
  renderDiagnostics();
  return serverStatus;
}

async function saveStateToServer() {
  if (!canManageUsers()) return;
  if (!canUseLocalApi()) {
    alert('Abra o SETECHUB pelo servidor local para salvar estado na API.');
    return;
  }
  try {
    await apiRequest('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ state })
    });
    await loadServerSnapshots();
    await refreshServerHealth();
    alert('Estado salvo no servidor local.');
  } catch (error) {
    alert(`Nao foi possivel salvar no servidor local: ${error.message}`);
  }
}

async function loadStateFromServer() {
  if (!canManageUsers()) return;
  if (!canUseLocalApi()) {
    alert('Abra o SETECHUB pelo servidor local para carregar estado da API.');
    return;
  }
  try {
    const payload = await apiRequest('/api/state');
    state = mergeState(payload.state || payload);
    refreshAll();
    await loadServerSnapshots();
    await refreshServerHealth();
    alert('Estado carregado do servidor local.');
  } catch (error) {
    alert(`Nao foi possivel carregar do servidor local: ${error.message}`);
  }
}

async function loadServerSnapshots() {
  if (!canManageUsers()) {
    serverSnapshots = [];
    renderDiagnostics();
    return serverSnapshots;
  }
  if (!canUseLocalApi()) {
    serverSnapshots = [];
    renderDiagnostics();
    return serverSnapshots;
  }
  try {
    const payload = await apiRequest('/api/snapshots');
    serverSnapshots = payload.items || [];
  } catch {
    serverSnapshots = [];
  }
  renderDiagnostics();
  return serverSnapshots;
}

async function restoreServerSnapshot(id) {
  if (!canManageUsers()) return;
  if (!canUseLocalApi()) {
    alert('Abra o SETECHUB pelo servidor local para restaurar snapshots.');
    return;
  }
  try {
    const payload = await apiRequest(`/api/snapshots/${encodeURIComponent(id)}`, { method: 'POST' });
    state = mergeState(payload.state || payload);
    refreshAll();
    await loadServerSnapshots();
    await refreshServerHealth();
    alert('Snapshot restaurado com sucesso.');
  } catch (error) {
    alert(`Nao foi possivel restaurar snapshot: ${error.message}`);
  }
}

async function processRedesOnServer() {
  if (!canUseLocalApi()) {
    alert('Abra o PainelURE pelo servidor local para processar as redes direto pelo site.');
    return;
  }
  const button = document.getElementById('processRedeBtn');
  const status = document.getElementById('redeProcessStatus');
  try {
    if (button) button.disabled = true;
    if (status) status.textContent = 'Processando DOCX no Word e gerando PDFs...';
    const payload = await apiRequest('/api/redes/process', {
      method: 'POST',
      body: JSON.stringify({ config: state.redes })
    });
    if (status) status.textContent = payload.stdout || 'Redes processadas. PDFs gerados na mesma pasta.';
    alert('Redes processadas. PDFs gerados na mesma pasta.');
  } catch (error) {
    if (status) status.textContent = `Falha ao processar: ${error.message}`;
    alert(`Nao foi possivel processar as redes: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function syncFromServerIfUseful() {
  if (!canUseLocalApi()) return;
  const hasLocalState = !!localStorage.getItem(STORAGE_KEY);
  try {
    const payload = await apiRequest('/api/state');
    if (!hasLocalState) {
      state = mergeState(payload.state || payload);
      refreshAll();
    }
  } catch {
    return;
  }
}

function normalizeSupabaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function supabaseConfig() {
  const config = loadSupabaseConfig();
  return {
    url: normalizeSupabaseUrl(config.url),
    anonKey: String(config.anonKey || '').trim()
  };
}

function supabaseConfigured() {
  const config = supabaseConfig();
  return !!(config.url && config.anonKey);
}

function updateSupabaseStatus(message, configured = false) {
  supabaseStatus = { configured, message };
  const node = document.getElementById('supabaseStatusMeta');
  if (node) node.textContent = message;
  const urlInput = document.getElementById('supabaseUrl');
  const keyInput = document.getElementById('supabaseAnonKey');
  const config = supabaseConfig();
  if (urlInput && !urlInput.value) urlInput.value = config.url || '';
  if (keyInput && !keyInput.value) keyInput.value = config.anonKey || '';
}

async function supabaseRequest(path, options = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new Error('Configure URL e anon key do Supabase na tela Conta.');
  }
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Falha Supabase HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

const RELATIONAL_STATE_TABLES = [
  { key: 'users', table: 'setechub_users', label: (item) => item.name, ref: (item) => item.role, status: (item) => item.active === false ? 'inactive' : 'active' },
  { key: 'municipalities', table: 'setechub_municipalities', label: (item) => item.name },
  { key: 'sectors', table: 'setechub_sectors', label: (item) => item.name, ref: (item) => item.code },
  { key: 'directoryContacts', table: 'setechub_directory_contacts', label: (item) => item.name, ref: (item) => item.sector },
  { key: 'officialLinks', table: 'setechub_official_links', label: (item) => item.label, ref: (item) => item.category, period: (item) => item.monthKey },
  { key: 'checklist', table: 'setechub_checklist_items', label: (item) => item.text, status: (item) => item.done ? 'done' : 'open' },
  { key: 'tasks', table: 'setechub_tasks', label: (item) => item.text || item.title, ref: (item) => item.place || item.scope, status: (item) => item.done ? 'done' : 'open' },
  { key: 'calls', table: 'setechub_calls', label: (item) => item.title || item.problem, ref: (item) => item.school, status: (item) => item.status },
  { key: 'schools', table: 'setechub_schools', label: (item) => item.name, ref: (item) => item.cie, ref2: (item) => item.zone, status: (item) => item.status },
  { key: 'supervisors', table: 'setechub_supervisors', label: (item) => item.name, ref: (item) => item.email, status: (item) => item.monthlyIndicator || item.indicator },
  { key: 'supervisorVisits', table: 'setechub_supervisor_visits', label: (item) => item.supervisor, ref: (item) => item.school, period: (item) => item.date, status: (item) => item.type },
  { key: 'schoolProfiles', table: 'setechub_school_profiles', label: (item) => item.school, ref: (item) => item.municipality },
  { key: 'schoolImports', table: 'setechub_school_imports', label: (item) => item.label || item.filename, ref: (item) => item.school, status: (item) => item.reviewStatus },
  { key: 'schoolAssets', table: 'setechub_school_assets', label: (item) => item.name, ref: (item) => item.school, status: (item) => item.status },
  { key: 'schoolNetworks', table: 'setechub_school_networks', label: (item) => item.school, ref: (item) => item.adminNetwork, ref2: (item) => item.pedNetwork },
  { key: 'assets', table: 'setechub_assets', label: (item) => item.name, ref: (item) => item.place, status: (item) => item.status },
  { key: 'notes', table: 'setechub_notes', label: (item) => item.title || item.text, ref: (item) => item.owner || item.createdBy }
];

const RELATIONAL_SETTINGS_TABLE = 'setechub_settings';

function relationalRowId(key, item, index) {
  return String(item?.id || normalizeKey(`${key}-${item?.name || item?.school || item?.label || item?.text || index}`) || `${key}-${index}`);
}

function uniqueRelationalRowId(id, usedIds) {
  let candidate = String(id || 'item');
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${id}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function relationalValue(getter, item) {
  if (!getter) return null;
  const value = getter(item);
  return value === undefined || value === null || value === '' ? null : String(value);
}

function stateArrayRows(definition) {
  const list = Array.isArray(state[definition.key]) ? state[definition.key] : [];
  const now = new Date().toISOString();
  const usedIds = new Set();
  return list.map((item, index) => {
    const id = uniqueRelationalRowId(relationalRowId(definition.key, item, index), usedIds);
    return {
      id,
      label: relationalValue(definition.label, item),
      ref: relationalValue(definition.ref, item),
      ref2: relationalValue(definition.ref2, item),
      period: relationalValue(definition.period, item),
      status: relationalValue(definition.status, item),
      payload: { ...item, id },
      updated_at: now
    };
  });
}

function stateSettingsRows() {
  const now = new Date().toISOString();
  return [
    { id: 'profile', payload: state.profile || {}, updated_at: now },
    { id: 'officialContacts', payload: state.officialContacts || {}, updated_at: now },
    { id: 'histories', payload: state.histories || {}, updated_at: now },
    { id: 'ponto', payload: state.ponto || {}, updated_at: now },
    { id: 'redes', payload: state.redes || {}, updated_at: now },
    {
      id: 'metadata',
      payload: {
        stateVersion: state.stateVersion,
        lastUpdatedAt: state.lastUpdatedAt,
        lastBackupAt: state.lastBackupAt,
        inventoryUpdatedAt: state.inventoryUpdatedAt,
        inventoryUpdatedBySchool: state.inventoryUpdatedBySchool || {},
        inventoryReplacementSchools: state.inventoryReplacementSchools || []
      },
      updated_at: now
    }
  ];
}

async function replaceSupabaseTable(table, rows) {
  await supabaseRequest(`${table}?id=not.is.null`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += 500) {
    await supabaseRequest(table, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(index, index + 500))
    });
  }
}

async function writeStateToRelationalSupabase() {
  for (const definition of RELATIONAL_STATE_TABLES) {
    await replaceSupabaseTable(definition.table, stateArrayRows(definition));
  }
  await replaceSupabaseTable(RELATIONAL_SETTINGS_TABLE, stateSettingsRows());
}

async function readRelationalRows(table) {
  return supabaseRequest(`${table}?select=id,payload&order=id.asc`);
}

async function loadStateFromRelationalSupabase() {
  const next = {};
  let rowCount = 0;
  for (const definition of RELATIONAL_STATE_TABLES) {
    const rows = await readRelationalRows(definition.table);
    rowCount += rows.length;
    next[definition.key] = rows.map((row) => row.payload).filter(Boolean);
  }
  const settingsRows = await readRelationalRows(RELATIONAL_SETTINGS_TABLE);
  rowCount += settingsRows.length;
  if (!rowCount) throw new Error('Banco relacional ainda vazio.');
  const settings = Object.fromEntries(settingsRows.map((row) => [row.id, row.payload || {}]));
  const metadata = settings.metadata || {};
  return mergeState({
    ...next,
    stateVersion: metadata.stateVersion,
    lastUpdatedAt: metadata.lastUpdatedAt,
    lastBackupAt: metadata.lastBackupAt,
    inventoryUpdatedAt: metadata.inventoryUpdatedAt,
    inventoryUpdatedBySchool: metadata.inventoryUpdatedBySchool,
    inventoryReplacementSchools: metadata.inventoryReplacementSchools,
    profile: settings.profile,
    officialContacts: settings.officialContacts,
    histories: settings.histories,
    ponto: settings.ponto,
    redes: settings.redes
  });
}

async function checkSupabaseConnection() {
  if (!canManageUsers()) return;
  try {
    await supabaseRequest('app_state?select=id,updated_at&id=eq.setechub_state&limit=1');
    try {
      await readRelationalRows(RELATIONAL_SETTINGS_TABLE);
      updateSupabaseStatus('Supabase conectado. Banco relacional acessivel.', true);
    } catch {
      updateSupabaseStatus('Supabase conectado. JSON online ativo; aplique a migration relacional.', true);
    }
  } catch (error) {
    updateSupabaseStatus(`Falha no Supabase: ${error.message}`, false);
  }
}

async function writeStateToSupabase(options = {}) {
  let relationalSynced = false;
  try {
    await supabaseRequest('app_state?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'setechub_state', state, updated_at: new Date().toISOString() })
    });
    try {
      await writeStateToRelationalSupabase();
      relationalSynced = true;
    } catch (error) {
      console.warn('Banco relacional Supabase indisponivel; mantendo JSON online.', error);
    }
    updateSupabaseStatus(
      relationalSynced
        ? (options.auto ? 'Banco relacional sincronizado.' : 'Estado salvo no banco relacional.')
        : (options.auto ? 'Banco JSON sincronizado. Migration relacional pendente.' : 'Estado salvo no JSON do Supabase.'),
      true
    );
    return true;
  } catch (error) {
    updateSupabaseStatus(`Nao foi possivel salvar no Supabase: ${error.message}`, false);
    return false;
  }
}

function scheduleSupabaseAutoSave() {
  if (!supabaseAutoSaveReady || supabaseAutoSaveSuspended || !supabaseConfigured()) return;
  window.clearTimeout(supabaseAutoSaveTimer);
  supabaseAutoSaveTimer = window.setTimeout(flushSupabaseAutoSave, 5000);
}

async function flushSupabaseAutoSave() {
  if (!supabaseAutoSaveReady || supabaseAutoSaveSuspended || !supabaseConfigured()) return;
  if (supabaseAutoSaveBusy) {
    supabaseAutoSavePending = true;
    return;
  }
  supabaseAutoSaveBusy = true;
  supabaseAutoSavePending = false;
  await writeStateToSupabase({ auto: true });
  supabaseAutoSaveBusy = false;
  if (supabaseAutoSavePending) scheduleSupabaseAutoSave();
}

async function saveStateToSupabase() {
  if (!canManageUsers()) return;
  await writeStateToSupabase();
}

function stateDateValue(value) {
  const date = new Date(value || 0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

async function fetchSupabaseStateRow() {
  const rows = await supabaseRequest('app_state?select=state,updated_at&id=eq.setechub_state&limit=1');
  return rows?.[0] || null;
}

async function initializeSupabaseState() {
  if (!supabaseConfigured()) {
    updateSupabaseStatus('Supabase nao configurado.', false);
    return false;
  }
  try {
    const localRaw = localStorage.getItem(STORAGE_KEY);
    const localState = localRaw ? mergeState(JSON.parse(localRaw)) : state;
    const localTime = stateDateValue(localState?.lastUpdatedAt);
    try {
      const relationalState = await loadStateFromRelationalSupabase();
      const relationalTime = stateDateValue(relationalState?.lastUpdatedAt);
      if (!localRaw || relationalTime >= localTime) {
        supabaseAutoSaveSuspended = true;
        state = relationalState;
        saveState();
        supabaseAutoSaveSuspended = false;
        updateSupabaseStatus('Banco relacional carregado.', true);
        return true;
      }
      state = localState;
      updateSupabaseStatus('Cache deste navegador mais recente; atualizando banco relacional.', true);
      await writeStateToSupabase({ auto: true });
      return true;
    } catch (error) {
      console.warn('Banco relacional Supabase indisponivel; usando app_state JSON.', error);
    }
    const row = await fetchSupabaseStateRow();
    const remoteState = row?.state ? mergeState(row.state) : null;
    const remoteTime = Math.max(stateDateValue(row?.updated_at), stateDateValue(remoteState?.lastUpdatedAt));

    if (remoteState && (!localRaw || remoteTime >= localTime)) {
      supabaseAutoSaveSuspended = true;
      state = remoteState;
      saveState();
      supabaseAutoSaveSuspended = false;
      updateSupabaseStatus(`Banco online carregado. Atualizado em ${row.updated_at || 'data nao informada'}.`, true);
      return true;
    }

    state = localState;
    updateSupabaseStatus(
      remoteState
        ? 'Cache deste navegador mais recente; atualizando banco online.'
        : 'Banco online vazio; criando estado inicial.',
      true
    );
    await writeStateToSupabase({ auto: true });
    return true;
  } catch (error) {
    supabaseAutoSaveSuspended = false;
    updateSupabaseStatus(`Falha ao iniciar banco online: ${error.message}. Usando cache local.`, false);
    return false;
  }
}

async function loadStateFromSupabase(options = {}) {
  if (!options.allowAnyUser && !canManageUsers()) return;
  try {
    try {
      supabaseAutoSaveSuspended = true;
      state = await loadStateFromRelationalSupabase();
      refreshAll();
      supabaseAutoSaveSuspended = false;
      updateSupabaseStatus('Estado carregado do banco relacional.', true);
      return;
    } catch (error) {
      supabaseAutoSaveSuspended = false;
      console.warn('Banco relacional Supabase indisponivel; carregando app_state JSON.', error);
    }
    const row = await fetchSupabaseStateRow();
    const remoteState = row?.state;
    if (!remoteState) {
      updateSupabaseStatus('Nenhum estado setechub_state encontrado no Supabase.', true);
      return;
    }
    supabaseAutoSaveSuspended = true;
    state = mergeState(remoteState);
    refreshAll();
    supabaseAutoSaveSuspended = false;
    updateSupabaseStatus(`Estado carregado do Supabase. Atualizado em ${row.updated_at || 'data nao informada'}.`, true);
  } catch (error) {
    supabaseAutoSaveSuspended = false;
    updateSupabaseStatus(`Nao foi possivel carregar do Supabase: ${error.message}`, false);
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = String(text || '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => String(cell || '').trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => String(cell || '').trim())) rows.push(row);
  return rows;
}

function normalizeCsvHeader(value) {
  return normalizeKey(repairMojibakeString(value)).replace(/[^a-z0-9]+/g, '');
}

function csvValue(record, names) {
  const wanted = names.map(normalizeCsvHeader);
  const entries = Object.entries(record).filter(([key]) => wanted.includes(key));
  const valueText = (value) => {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      return valueText(value.Title || value.LookupValue || value.Email || value.Name || value.Value || value.Label || value.results || '');
    }
    return repairMojibakeString(value).trim();
  };
  const filled = entries.find(([, value]) => valueText(value));
  return valueText((filled || entries[0])?.[1] || '');
}

function csvRecords(headers, dataRows) {
  return dataRows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      const key = normalizeCsvHeader(header);
      const value = row[index] || '';
      if (!key) return;
      if (record[key] && value) record[key] = `${record[key]} | ${value}`;
      else if (value || !(key in record)) record[key] = value;
    });
    return record;
  });
}

function parseBrazilianDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseSourceDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const brazilian = parseBrazilianDate(text);
  if (brazilian) return brazilian;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return localIsoDate(parsed);
  return '';
}

function parseSourceTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const time = text.match(/(\d{1,2}):(\d{2})/);
  if (time) return `${time[1].padStart(2, '0')}:${time[2]}`;
  return text;
}

function sharePointListApiUrl(url) {
  const parsed = new URL(url, window.location.href);
  const sharedMatch = parsed.pathname.match(/^\/:l:\/[^/]+\/personal\/([^/]+)\//i);
  const source = sharedMatch
    ? new URL(`${parsed.origin}/personal/${sharedMatch[1]}/Lists/ReservasVeiculos/AllItems.aspx`)
    : parsed;
  const match = source.pathname.match(/^(.*)\/Lists\/([^/]+)\/AllItems\.aspx$/i);
  if (!match) return source.toString();
  const sitePath = match[1];
  const listName = decodeURIComponent(match[2]);
  const listPath = `${decodeURIComponent(sitePath)}/Lists/${listName}`.replace(/'/g, "''");
  const query = new URLSearchParams({ '$top': '5000' });
  return `${source.origin}${sitePath}/_api/web/GetList('${listPath}')/items?${query}`;
}

function normalizeSourceRecord(row) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    const normalized = normalizeCsvHeader(key);
    if (normalized) acc[normalized] = value;
    return acc;
  }, {});
}

function sharePointItems(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.d)) return payload.d;
  return [];
}

async function fetchSharePointList(url) {
  const localUrl = `/api/sharepoint-list?url=${encodeURIComponent(url)}`;
  const attempts = [
    () => fetch(localUrl, { cache: 'no-store' }),
    () => fetch(sharePointListApiUrl(url), {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json;odata=nometadata' }
    })
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await attempt();
      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.clone().json();
          detail = payload?.hint || payload?.error || '';
        } catch {}
        throw new Error(`HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
      }
      const payload = await response.json();
      const rows = Array.isArray(payload?.items) ? payload.items : sharePointItems(payload);
      return rows.map(normalizeSourceRecord);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Falha ao ler lista SharePoint.');
}

function officialCarScheduleLink() {
  return (state.officialLinks || []).find((item) => item.category === 'car-schedule' && item.url);
}

function carScheduleRowToTask(row, source) {
  const vehicle = csvValue(row, ['Carro', 'Carro Oficial', 'Veiculo', 'Veículo', 've_x00ed_culo', 'Vehicle', 'Recurso', 'Placa', 'Title']) || 'Carro oficial';
  const dateSource = csvValue(row, [
    'Data',
    'Data da Reserva',
    'data_x0020_da_x0020_reserva',
    'Data Reserva',
    'Data Saida',
    'Data da Saida',
    'Data de Saida',
    'Saida',
    'Data do Agendamento',
    'Quando',
    'EventDate',
    'Inicio',
    'Início'
  ]);
  const date = parseSourceDate(csvValue(row, [
    'Data',
    'Data da Reserva',
    'data_x0020_da_x0020_reserva',
    'Data Reserva',
    'Data Saida',
    'Data da Saida',
    'Data de Saida',
    'Saida',
    'Data do Agendamento',
    'Quando',
    'EventDate',
    'Inicio',
    'Início'
  ]));
  const time = parseSourceTime(csvValue(row, [
    'Hora',
    'Horario',
    'Horário',
    'Horario da Reserva',
    'Horário da Reserva',
    'horario_x0020_da_x0020_reserva',
    'Hora da Saida',
    'Hora da Saída',
    'Hora de Saida',
    'Saida Horario'
  ])) || parseSourceTime(dateSource);
  const requester = csvValue(row, ['Solicitante', 'Requisitante', 'Setor', 'Responsavel', 'Responsável', 'Responsavel pela Reserva', 'responsavel_x0020_pela_x0020_reserva', 'Author', 'Owner']);
  const destination = csvValue(row, ['Destino', 'Local', 'Destination', 'Place', 'Local Destino', 'LocalExterno', 'Escolas', 'Itinerario', 'Roteiro']) || 'Destino nao informado';
  const driver = csvValue(row, ['Motorista', 'Condutor', 'Driver']);
  const status = csvValue(row, ['Status', 'Situacao', 'Situação', 'situa_x00e7__x00e3_o', 'Autorizacao', 'Autorização', 'Aprovacao', 'Aprovação']) || 'reservado';
  const note = csvValue(row, ['Observacao', 'Observação', 'Descricao', 'Descrição', 'descri_x00e7__x00e3_o', 'Motivo', 'MotivoVisita', 'Finalidade', 'ComentárioGestor', 'Coment_x00e1_rioGestor', 'Note']);
  const title = csvValue(row, ['Titulo', 'Título', 'Title', 'Motivo', 'MotivoVisita']) || `Reserva de ${vehicle}`;
  const rawId = csvValue(row, ['ID', 'Id']) || `${date}|${time}|${vehicle}|${requester}|${destination}`;
  return {
    id: `sharepoint-cars-${normalizeKey(rawId).replace(/[^a-z0-9]+/g, '-')}`,
    title,
    date,
    time,
    priority: normalizeKey(status).includes('pend') ? 'media' : 'baixa',
    place: destination,
    category: 'Carro oficial',
    scope: 'carro',
    owner: requester || driver || 'Frota URE',
    createdBy: 'Agenda de carros',
    vehicle,
    driver,
    authorization: status,
    notes: note,
    done: /cancelad|concluid|finalizad/i.test(status),
    source: 'SharePoint - ReservasVeiculos',
    sourceId: source.id,
    sourceLabel: source.label,
    sourceUrl: source.url,
    sourceSyncedAt: new Date().toISOString()
  };
}

function isCarScheduleTask(item) {
  return item?.scope === 'carro' || item?.category === 'Carro oficial' || normalizeKey(item?.source || '').startsWith('frota excel');
}

function mergeCarScheduleRows(source, rows) {
  const imported = rows
    .map((row) => carScheduleRowToTask(row, source))
    .filter((item) => item.date || item.rawDate || item.title);
  state.tasks = [
    ...imported,
    ...(state.tasks || []).filter((item) => !isCarScheduleTask(item))
  ];
  return imported.length;
}

async function syncCarScheduleSource(options = {}) {
  const source = officialCarScheduleLink();
  if (!source?.url) return { importedCount: 0, errorCount: 0 };
  const silent = options.silent === true;
  const status = document.getElementById('fleetImportStatus');
  const carStatus = document.getElementById('carSourceStatus');
  if (status && !silent) status.textContent = 'Lendo ReservasVeiculos no SharePoint...';
  if (carStatus && !silent) carStatus.textContent = 'Atualizando a lista ReservasVeiculos no SharePoint...';
  const toast = silent ? null : showToast('Atualizando agenda de carros...', 'syncing', { persist: true });
  try {
    const rows = await fetchSharePointList(source.url);
    const importedCount = mergeCarScheduleRows(source, rows);
    if (options.refresh !== false) {
      currentTaskFilter = 'carro';
      refreshAll();
    }
    if (status) status.textContent = `${importedCount} reserva(s) carregada(s) da lista oficial ReservasVeiculos.`;
    if (carStatus) carStatus.textContent = `${importedCount} reserva(s) carregada(s) da lista oficial ReservasVeiculos.`;
    if (toast) toast.update(`${importedCount} reserva(s) carregada(s) da agenda de carros.`, 'success');
    return { importedCount, errorCount: 0 };
  } catch (error) {
    console.warn('Nao foi possivel sincronizar a agenda de carros.', error);
    if (status && !silent) status.textContent = 'Nao foi possivel ler ReservasVeiculos. Verifique acesso ao SharePoint.';
    if (carStatus && !silent) carStatus.textContent = 'Nao foi possivel ler ReservasVeiculos. Verifique acesso ao SharePoint.';
    if (toast) toast.update('Nao foi possivel ler a agenda de carros.', 'error', { duration: 4200 });
    return { importedCount: 0, errorCount: 1, error };
  }
}

function supervisorVisitSourceFor(source) {
  return (state.supervisors || []).find((supervisor) =>
    normalizeKey(supervisor.name) === normalizeKey(source.supervisor) ||
    (source.aliases || []).some((alias) => normalizeKey(alias) === normalizeKey(supervisor.name)) ||
    (supervisor.sourceAliases || []).some((alias) => normalizeKey(alias) === normalizeKey(source.supervisor))
  );
}

function supervisorForSourceRow(rowSupervisor, source = {}) {
  const rowKey = normalizeKey(rowSupervisor);
  if (!rowKey) return null;
  const rowFirstName = rowKey.split(/\s+/)[0];
  return (state.supervisors || []).find((supervisor) => {
    const names = [
      source.supervisor,
      supervisor.name,
      ...(source.aliases || []),
      ...(supervisor.sourceAliases || [])
    ].filter(Boolean);
    return names.some((name) => {
      const key = normalizeKey(name);
      const firstName = key.split(/\s+/)[0];
      return key === rowKey ||
        key.startsWith(`${rowKey} `) ||
        rowKey.startsWith(`${key} `) ||
        (rowFirstName && firstName === rowFirstName);
    });
  }) || null;
}

function sourceRowBelongsToSupervisor(rowSupervisor, source, supervisor) {
  const names = [source.supervisor, supervisor?.name, ...(source.aliases || []), ...(supervisor?.sourceAliases || [])];
  const firstNames = names.map((name) => String(name || '').trim().split(/\s+/)[0]);
  names.push(...firstNames);
  return names.filter(Boolean).some((name) => normalizeKey(name) === normalizeKey(rowSupervisor));
}

function googleSheetCsvUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  if (/output=csv|format=csv/i.test(text)) return text;
  const match = text.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (!match) return text;
  const gidMatch = text.match(/[?&#]gid=(\d+)/i);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

function googleSheetGidFromUrl(url) {
  const match = String(url || '').match(/[?&#]gid=(\d+)/i);
  return match ? match[1] : '';
}

function googleSheetGidCsvUrl(url, gid) {
  const text = String(url || '').trim();
  if (!gid) return googleSheetCsvUrl(text);
  if (/docs\.google\.com\/spreadsheets\/d\/e\//i.test(text)) {
    const base = text.split('?')[0];
    return `${base}?output=csv&gid=${encodeURIComponent(gid)}`;
  }
  const regularMatch = text.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (regularMatch) {
    return `https://docs.google.com/spreadsheets/d/${regularMatch[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }
  return googleSheetCsvUrl(text);
}

function supervisorMonthlySheetSource(link) {
  if (!link?.url) return null;
  return {
    id: `supervisor-monthly-${link.monthKey || 'sem-mes'}-${link.id}`,
    url: link.url,
    label: link.label || `Planilha supervisores - ${supervisorSheetMonthLabel(link.monthKey)}`,
    primary: true,
    aggregate: true,
    requireSupervisorColumn: true,
    panelGid: link.panelGid || googleSheetGidFromUrl(link.url),
    tabPrefix: 'DADOS_',
    monthKey: link.monthKey
  };
}

function supervisorMonthlySheetSources() {
  return (state.officialLinks || [])
    .filter((item) => item.category === 'supervisor-sheet' && item.url)
    .map(supervisorMonthlySheetSource)
    .filter(Boolean);
}

function supervisorSheetTabName(supervisorName, source = {}) {
  const prefix = source.tabPrefix || 'DADOS_';
  const firstName = String(supervisorName || '').trim().split(/\s+/)[0] || '';
  return `${prefix}${firstName}`;
}

function supervisorSheetTabNames(supervisorName, source = {}) {
  const prefix = source.tabPrefix || 'DADOS_';
  const fullName = String(supervisorName || '').trim();
  return [...new Set([
    supervisorSheetTabName(supervisorName, source),
    fullName ? `${prefix}${fullName}` : ''
  ].filter(Boolean))];
}

function rowSupervisorName(row) {
  return csvValue(row, [
    'Nome do Supervisor',
    'Primeiro nome do Supervisor',
    'Dados primeiro nome do Supervisor',
    'dados_primeiro nome do supervisor',
    'Supervisor'
  ]);
}

function rowVisitedSchools(row) {
  const text = csvValue(row, ['Escola Visitada', 'Escola', 'Escolas Visitadas']);
  return [...new Set(String(text || '')
    .split(/\s+\|\s+|[;]+/)
    .map(canonicalSchoolName)
    .filter(Boolean))];
}

function parseVisitCount(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function indicatorTone(value) {
  const text = String(value || '').trim();
  if (!text) return 'aviso';
  const key = normalizeKey(text);
  if (key.includes('verde')) return 'verde';
  if (key.includes('amarelo')) return 'amarelo';
  if (key.includes('vermelho')) return 'vermelho';
  return text;
}

function mergeSupervisorPanelRows(source, rows) {
  const importedAt = new Date().toISOString();
  let updatedCount = 0;
  state.supervisors = (state.supervisors || []).map((supervisor) => {
    const row = rows.find((item) => supervisorForSourceRow(rowSupervisorName(item) || csvValue(item, ['Supervisor']), source)?.name === supervisor.name);
    if (!row) return supervisor;
    updatedCount += 1;
    const assignedSchoolCount = parseVisitCount(csvValue(row, ['Escolas Atribuidas', 'Escolas Atribuídas']));
    const weeklyGoalLabel = '3';
    const weeklyGoal = 3;
    const monthlyGoal = parseVisitCount(csvValue(row, ['Meta Mensal']));
    const monthlyGoalLabel = monthlyGoal ? String(monthlyGoal) : '--';
    const currentWeek = parseVisitCount(csvValue(row, ['Semana do Mes', 'Semana do Mês']));
    const weeklyVisits = parseVisitCount(csvValue(row, ['Visitas na Semana']));
    const monthlyVisits = parseVisitCount(csvValue(row, ['Visitas no Mes', 'Visitas no Mês']));
    const weeklyIndicator = indicatorTone(csvValue(row, ['Indicador Semana']));
    const monthlyIndicator = indicatorTone(csvValue(row, ['Indicador Mensal']));
    return {
      ...supervisor,
      assignedSchoolCount,
      weeklyGoal,
      weeklyGoalLabel,
      monthlyGoal,
      monthlyGoalLabel,
      currentWeek,
      weeklyVisits,
      monthlyVisits,
      weeklyIndicator: weeklyIndicator || supervisor.weeklyIndicator,
      monthlyIndicator: monthlyIndicator || supervisor.monthlyIndicator,
      visitSourceId: source.id,
      visitSourceUrl: source.url,
      visitSourceLabel: source.label,
      visitSourcePrimary: source.primary,
      source: 'google-sheet',
      sourceSyncedAt: importedAt
    };
  });
  return updatedCount;
}

async function syncSupervisorPanelSource(source) {
  if (!source.panelGid) return 0;
  const response = await fetch(googleSheetGidCsvUrl(source.url, source.panelGid), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = parseCsvRows(await response.text());
  const [headers, ...dataRows] = rows;
  if (!headers?.length) return 0;
  const records = csvRecords(headers, dataRows);
  return mergeSupervisorPanelRows(source, records);
}

function googleSheetTabCsvUrl(url, tabName) {
  const text = String(url || '').trim();
  const encodedTab = encodeURIComponent(tabName);
  const regularMatch = text.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (regularMatch) {
    return `https://docs.google.com/spreadsheets/d/${regularMatch[1]}/gviz/tq?tqx=out:csv&sheet=${encodedTab}`;
  }
  const publishedMatch = text.match(/docs\.google\.com\/spreadsheets\/d\/e\/([^/]+)/i);
  if (publishedMatch) {
    return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pub?output=csv&single=true&sheet=${encodedTab}`;
  }
  return googleSheetCsvUrl(text);
}

function mergeSupervisorVisitSourceRows(source, rows) {
  const importedAt = new Date().toISOString();
  const incoming = rows
    .flatMap((row) => {
      const rowSupervisor = rowSupervisorName(row) || (source.requireSupervisorColumn ? '' : source.supervisor);
      const supervisor = source.supervisor
        ? supervisorVisitSourceFor(source)
        : supervisorForSourceRow(rowSupervisor, source);
      const schools = rowVisitedSchools(row);
      const date = parseBrazilianDate(csvValue(row, ['Data Da Visita', 'Data da Visita', 'Data']));
      if (!supervisor || !rowSupervisor || !schools.length || !date) return [];
      if (source.supervisor && !sourceRowBelongsToSupervisor(rowSupervisor, source, supervisor)) return [];
      const submittedAt = csvValue(row, ['Carimbo de data/hora', 'Timestamp']);
      const confirmation = csvValue(row, ['Confirmacao de Visita', 'Confirmacao', 'Confirmação de Visita']);
      return schools.map((school) => ({
        id: `${source.id}-${normalizeKey(supervisor.name)}-${normalizeKey(school)}-${date}`,
        supervisor: supervisor.name,
        school,
        date,
        type: 'Planilha Google',
        notes: confirmation || `Importado de ${source.label}.`,
        source: 'google-sheet',
        sourceId: source.id,
        sourceLabel: source.label,
        importedAt,
        submittedAt,
        confirmation
      }));
    })
    .filter(Boolean);
  if (!incoming.length) return 0;

  const incomingKeys = new Set(incoming.map((item) => normalizeKey(`${item.supervisor}|${item.school}|${item.date}|${item.type}`)));
  const importedSupervisors = new Set(incoming.map((item) => item.supervisor));
  state.supervisorVisits = [
    ...(state.supervisorVisits || []).filter((item) => {
      if (source.monthKey && String(item.date || '').startsWith(`${source.monthKey}-`)) return false;
      if (item.sourceId === source.id) return !incomingKeys.has(normalizeKey(`${item.supervisor}|${item.school}|${item.date}|${item.type}`));
      if (!importedSupervisors.has(item.supervisor)) return true;
      return !(item.source === 'teste' || /^visit-\d+-\d+$/.test(String(item.id || '')) || /registro de teste/i.test(item.notes || ''));
    }),
    ...incoming
  ];

  state.supervisors = (state.supervisors || []).map((item) => {
    if (!importedSupervisors.has(item.name)) return item;
    return {
      ...item,
      visitSourceId: source.id,
      visitSourceUrl: source.url,
      visitSourceLabel: source.label,
      visitSourcePrimary: source.primary,
      sourceAliases: [...new Set([...(item.sourceAliases || []), ...(source.aliases || [])])],
      source: 'google-sheet',
      sourceSyncedAt: importedAt
    };
  });
  return incoming.length;
}

async function syncSupervisorVisitSource(source) {
  const tabNames = Array.isArray(source.tabNames)
    ? source.tabNames
    : source.tabName ? [source.tabName] : [];
  let response = null;
  let lastError = null;
  let fallbackToSourceCsv = false;
  const urls = [
    ...tabNames.map((tabName) => ({ url: googleSheetTabCsvUrl(source.url, tabName), requireSupervisorColumn: false })),
    { url: googleSheetCsvUrl(source.url), requireSupervisorColumn: source.requireSupervisorColumn ?? tabNames.length > 0 }
  ];

  for (const item of urls) {
    try {
      response = await fetch(item.url, { cache: 'no-store' });
      if (response.ok) {
        fallbackToSourceCsv = item.requireSupervisorColumn;
        break;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!response?.ok) throw lastError || new Error('Falha ao ler planilha Google');
  const rows = parseCsvRows(await response.text());
  const [headers, ...dataRows] = rows;
  if (!headers?.length) return 0;
  const records = csvRecords(headers, dataRows);
  return mergeSupervisorVisitSourceRows({ ...source, requireSupervisorColumn: fallbackToSourceCsv }, records);
}

async function syncSupervisorSourceList(sources, options = {}) {
  if (!Array.isArray(sources) || !sources.length) return 0;
  let importedCount = 0;
  let errorCount = 0;
  for (const source of sources) {
    if (source.aggregate) {
      try {
        if (source.panelGid) importedCount += await syncSupervisorPanelSource(source);
        importedCount += await syncSupervisorVisitSource(source);
      } catch (error) {
        errorCount += 1;
        console.warn(`Nao foi possivel sincronizar ${source.label}:`, error);
      }
      continue;
    }
    const sourceSupervisors = source.workbookTabs
      ? (state.supervisors || [])
      : [supervisorVisitSourceFor(source)].filter(Boolean);
    for (const supervisor of sourceSupervisors) {
      try {
        importedCount += await syncSupervisorVisitSource({
          ...source,
          supervisor: supervisor.name,
          aliases: supervisor.sourceAliases || source.aliases || [],
          tabNames: source.workbookTabs ? supervisorSheetTabNames(supervisor.name, source) : source.tabName ? [source.tabName] : []
        });
      } catch (error) {
        errorCount += 1;
        console.warn(`Nao foi possivel sincronizar ${source.label} / ${supervisor.name}:`, error);
      }
    }
  }
  if (options.refresh !== false && importedCount) refreshAll();
  return { importedCount, errorCount };
}

async function syncSupervisorVisitSources(options = {}) {
  if (!canImportData() && options.silent !== true) return;
  const sources = Array.isArray(SUPERVISOR_VISIT_SOURCES) ? SUPERVISOR_VISIT_SOURCES : [];
  if (!sources.length) return;
  const silent = options.silent === true;
  const toast = silent ? null : showToast('Lendo planilha dos supervisores...', 'syncing', { persist: true });
  const { importedCount, errorCount } = await syncSupervisorSourceList(sources, { refresh: false });
  if (importedCount) refreshAll();
  if (toast) {
    if (importedCount) {
      toast.update(`${importedCount} visita(s) importada(s) da planilha.`, 'success');
    } else if (errorCount) {
      toast.update('Nao foi possivel ler a planilha dos supervisores.', 'error', { duration: 4200 });
    } else {
      toast.update('Planilha lida, mas nenhum registro novo foi encontrado.', 'success');
    }
  }
}

async function syncSupervisorMonthlySheet(linkId, options = {}) {
  if (!canImportData() && options.silent !== true) return;
  const link = (state.officialLinks || []).find((item) =>
    item.category === 'supervisor-sheet' && String(item.id) === String(linkId)
  );
  const source = supervisorMonthlySheetSource(link);
  if (!source) {
    if (!options.silent) showToast('Planilha mensal nao encontrada.', 'error');
    return;
  }
  const toast = options.silent ? null : showToast(`Atualizando ${source.label}...`, 'syncing', { persist: true });
  try {
    const { importedCount, errorCount } = await syncSupervisorSourceList([source], { refresh: false });
    if (!options.preserveView && /^\d{4}-\d{2}$/.test(link.monthKey || '')) {
      const [year, month] = link.monthKey.split('-').map(Number);
      currentViewDate = new Date(year, month - 1, 1);
    }
    if (options.refresh !== false) refreshAll();
    if (importedCount) {
      toast?.update(`${importedCount} visita(s) importada(s) de ${source.label}.`, 'success');
    } else if (errorCount) {
      toast?.update('Nao foi possivel ler esta planilha mensal.', 'error', { duration: 4200 });
    } else {
      toast?.update('Planilha lida, mas nenhum registro novo foi encontrado.', 'success');
    }
  } catch (error) {
    toast?.update('Nao foi possivel atualizar esta planilha.', 'error', { duration: 4200 });
    console.warn(`Nao foi possivel sincronizar ${source.label}:`, error);
  }
}

async function syncCurrentSupervisorVisitSource() {
  if (!canImportData()) return;
  const supervisor = supervisorByName(currentSupervisorDetail);
  if (!supervisor?.visitSourceUrl) {
    showToast('Supervisor sem planilha vinculada.', 'error');
    return;
  }
  const button = document.getElementById('refreshSupervisorSheetBtn');
  const toast = showToast('Atualizando planilha...', 'syncing', { persist: true });
  if (button) {
    button.disabled = true;
    button.textContent = 'Atualizando...';
  }
  try {
    const source = {
      id: supervisor.visitSourceId || `supervisor-google-${normalizeKey(supervisor.name).replace(/[^a-z0-9]+/g, '-')}`,
      supervisor: supervisor.name,
      aliases: supervisor.sourceAliases || [],
      url: supervisor.visitSourceUrl,
      label: supervisor.visitSourceLabel || 'Planilha Google',
      primary: supervisor.visitSourcePrimary ?? true,
      panelGid: SUPERVISOR_VISIT_SOURCES[0]?.panelGid,
      tabNames: supervisorSheetTabNames(supervisor.name),
      requireSupervisorColumn: true
    };
    await syncSupervisorPanelSource(source);
    await syncSupervisorVisitSource(source);
    refreshAll();
    showPage('supervisor-record');
    toast.update('Planilha atualizada.', 'success');
  } catch (error) {
    toast.update('Nao foi possivel atualizar a planilha.', 'error', { duration: 3600 });
    console.warn('Nao foi possivel atualizar pela planilha Google:', error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Atualizar planilha';
    }
  }
}
