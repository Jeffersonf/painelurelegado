'use strict';

let state = loadState();
let redePreview = [];
let currentPage = 'dashboard';
let privacyHidden = false;
let currentTaskFilter = 'todas';
let currentCallFilter = 'todos';
let currentCallSchoolContext = '';
let currentSchoolFilter = 'todas';
let currentDirectoryFilter = 'todos';
let currentSchoolZoneFilter = 'todas';
let currentSchoolSort = 'prioridade';
let currentSupervisorFilter = 'todos';
let currentAssetFilter = 'todos';
let currentImportFilter = 'todos';
let currentImportSchoolContext = '';
let currentInventorySchool = 'todas';
let currentInventoryZone = 'todas';
let currentInventorySupervisor = 'todos';
let currentInventoryStatus = 'todos';
let currentInventoryCategory = 'todas';
let currentInventorySearch = '';
let currentSchoolSearch = '';
let currentSchoolDetail = '';
let currentSupervisorDetail = '';
let currentNetworkSchool = '';
let currentSearchQuery = '';
let currentViewDate = new Date();
let serverStatus = { available: false, message: 'Servidor local nao verificado.' };
let serverSnapshots = [];
let supabaseStatus = { configured: false, message: 'Supabase nao configurado.' };
let supabaseAutoSaveReady = false;
let supabaseAutoSaveSuspended = false;
let supabaseAutoSaveTimer = null;
let supabaseAutoSaveBusy = false;
let supabaseAutoSavePending = false;
let searchTimer = null;
let commandSearchTimer = null;
let derivedCache = null;
let commandPaletteOpen = false;
let dashboardDeferredTimer = null;

const PAGE_KEY = 'setechub_page';
const CONTEXT_KEY = 'setechub_context';
const ACTIVE_USER_KEY = 'setechub_active_user';
const SCHOOL_RENDER_LIMIT = 96;
const INVENTORY_RENDER_LIMIT = 80;
const VIEWER_MODE_V1 = true;
const PERF_LOG = localStorage.getItem('setechub_perf') === '1';
const PAUSED_NAV_PAGES = new Set(['calls']);
const DORMANT_NAV_PAGES = new Set(['pecs']);
const DISABLED_NAV_PAGES = new Set(['reports']);
const DIRECTORY_FILTERS = [
  { value: 'todos', label: 'Todos', color: '#b8c2d8' },
  { value: 'tecnologia', label: 'Tecnologia', color: '#5af5c8' },
  { value: 'gabinete', label: 'Gabinete', color: '#f5a85a' },
  { value: 'obras', label: 'Obras', color: '#f5c85a' },
  { value: 'compras', label: 'Compras', color: '#78b4ff' },
  { value: 'pagamento', label: 'Pagamento', color: '#5ac8f5' },
  { value: 'rh', label: 'RH', color: '#a78bfa' },
  { value: 'pedagogico', label: 'Pedagógico', color: '#c8f55a' }
];

function measurePerf(label, fn, threshold = 12) {
  if (!PERF_LOG || typeof performance === 'undefined') return fn();
  const startedAt = performance.now();
  const result = fn();
  const elapsed = performance.now() - startedAt;
  if (elapsed >= threshold) {
    console.info(`[PainelURE perf] ${label}: ${elapsed.toFixed(1)}ms`);
  }
  return result;
}

const ROLE_LABELS = {
  admin: 'Administrador',
  dirigente: 'Dirigente',
  seintec: 'SEINTEC',
  seom: 'SEOM',
  ctc: 'Técnicos CTC',
  pec: 'PEC',
  supervisor: 'Supervisor'
};

const ROLE_EMOJIS = {
  admin: '\u{1F6E1}\uFE0F',
  dirigente: '\u{1F3DB}\uFE0F',
  seintec: '\u{1F4BB}',
  seom: '\u{1F3D7}\uFE0F',
  ctc: '\u{1F697}',
  pec: '\u{1F393}',
  supervisor: '\u{1F9ED}'
};

function roleLabel(role) {
  return ROLE_LABELS[role] || badgeText(role || 'operacao');
}

function roleEmoji(role) {
  return ROLE_EMOJIS[role] || '\u{1F464}';
}

function roleDisplay(role) {
  return `${roleEmoji(role)} ${roleLabel(role)}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function listLimitNotice(total, limit, label) {
  if (total <= limit) return '';
  return `<div class="sync-empty compact">Mostrando ${esc(String(limit))} de ${esc(String(total))} ${esc(label)}. Use filtros ou busca para refinar.</div>`;
}

function resetDerivedCache() {
  derivedCache = null;
}

function getDerivedCache() {
  if (derivedCache) return derivedCache;
  const assetsBySchool = new Map();
  (state.schoolAssets || []).forEach((item) => {
    const bucket = assetsBySchool.get(item.school) || [];
    bucket.push(item);
    assetsBySchool.set(item.school, bucket);
  });
  const openCallsBySchool = new Map();
  (state.calls || []).forEach((item) => {
    if (item.status === 'resolvido') return;
    openCallsBySchool.set(item.school, (openCallsBySchool.get(item.school) || 0) + 1);
  });
  const pendingTasksBySchool = new Map();
  (state.tasks || []).forEach((item) => {
    if (item.done) return;
    if (item.place) pendingTasksBySchool.set(item.place, (pendingTasksBySchool.get(item.place) || 0) + 1);
  });
  const profilesBySchool = new Map();
  (state.schoolProfiles || []).forEach((item) => profilesBySchool.set(item.school, item));
  const networksBySchool = new Map();
  (state.schoolNetworks || []).forEach((item) => networksBySchool.set(item.school, item));
  const importsBySchool = new Map();
  (state.schoolImports || []).forEach((item) => {
    importsBySchool.set(item.school, (importsBySchool.get(item.school) || 0) + 1);
  });
  const supervisorsBySchool = new Map();
  (state.supervisors || []).forEach((supervisor) => {
    (supervisor.schools || []).forEach((school) => {
      const bucket = supervisorsBySchool.get(school) || [];
      bucket.push(supervisor.name);
      supervisorsBySchool.set(school, bucket);
    });
  });
  const visitsBySupervisor = new Map();
  (state.supervisorVisits || []).forEach((visit) => {
    const bucket = visitsBySupervisor.get(visit.supervisor) || [];
    bucket.push(visit);
    visitsBySupervisor.set(visit.supervisor, bucket);
  });
  derivedCache = {
    assetsBySchool,
    openCallsBySchool,
    pendingTasksBySchool,
    profilesBySchool,
    networksBySchool,
    importsBySchool,
    supervisorsBySchool,
    visitsBySupervisor,
    profileCompletionBySchool: new Map(),
    missingProfileFieldsBySchool: new Map(),
    operationalSnapshotBySchool: new Map(),
    topInventoryAlerts: null,
    operationalCoverage: null,
    dashboardHealth: null,
    topSchoolSignals: null,
    operationalSuggestions: null,
    summaryPreview: null,
    pendingQueueItems: null,
    supervisorStats: null
  };
  return derivedCache;
}

function schoolSlug(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function supervisorSlug(value) {
  return schoolSlug(value);
}

function toneByPriority(priority) {
  return priority === 'alta' ? 'pill-danger' : priority === 'media' ? 'pill-warn' : 'pill-ok';
}

function toneByCall(status) {
  return status === 'aberto' ? 'pill-danger' : status === 'em_rota' ? 'pill-info' : 'pill-ok';
}

function toneBySchool(status) {
  return status === 'critico' ? 'pill-danger' : status === 'atencao' ? 'pill-warn' : 'pill-ok';
}

function toneByAsset(status) {
  return status === 'defeito' ? 'pill-danger' : status === 'manutencao' ? 'pill-warn' : 'pill-ok';
}

function badgeText(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function timestampLabel(date = new Date()) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function viewMonthValue(date = currentViewDate) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthControlMarkup() {
  return `
    <div class="month-view-control" data-month-view-control>
      <button class="month-arrow" type="button" data-focus-shift="-1" aria-label="Mes anterior" title="Mes anterior">&#8249;</button>
      <span class="month-current" data-month-current>${esc(monthName())}</span>
      <button class="month-arrow" type="button" data-focus-shift="1" aria-label="Proximo mes" title="Proximo mes">&#8250;</button>
    </div>
  `;
}

function ensureMonthControls() {
  document.querySelectorAll('.page > .ph').forEach((header) => {
    const existing = header.querySelector('.month-view-control');
    if (existing) {
      existing.dataset.monthViewControl = '';
      existing.innerHTML = `
        <button class="month-arrow" type="button" data-focus-shift="-1" aria-label="Mes anterior" title="Mes anterior">&#8249;</button>
        <span class="month-current" data-month-current>${esc(monthName())}</span>
        <button class="month-arrow" type="button" data-focus-shift="1" aria-label="Proximo mes" title="Proximo mes">&#8250;</button>
      `;
      return;
    }
    let actions = header.querySelector(':scope > .page-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'page-actions';
      header.appendChild(actions);
    }
    actions.insertAdjacentHTML('afterbegin', monthControlMarkup());
  });
}

function setAvatarNode(node, user) {
  if (!node || !user) return;
  const initials = String(user.name || user.login || 'U').slice(0, 2).toUpperCase();
  const photo = user.photo || user.avatar || '';
  node.dataset.photo = photo;
  if (photo) {
    node.textContent = '';
    node.style.backgroundImage = `url("${photo}")`;
    node.classList.add('has-photo');
    return;
  }
  node.textContent = initials;
  node.style.backgroundImage = '';
  node.classList.remove('has-photo');
}

function setViewMonth(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return;
  currentViewDate = new Date(year, month - 1, 1);
  refreshAll();
}

function monthName() {
  return currentViewDate.toLocaleDateString('pt-BR', { month: 'long' });
}

function syncMonthControls() {
  ensureMonthControls();
  document.querySelectorAll('[data-month-view-control]').forEach((control) => {
    const current = control.querySelector('[data-month-current]');
    if (current) current.textContent = monthName();
  });
}

function toastIcon(type) {
  if (type === 'success') return 'OK';
  if (type === 'error') return '!';
  if (type === 'syncing') return '<span class="conn-spin"></span>';
  return 'i';
}

function ensureToastWrap() {
  let wrap = document.querySelector('.twrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'twrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

function showToast(message, type = 'info', options = {}) {
  const wrap = ensureToastWrap();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-ico">${toastIcon(type)}</span><span>${esc(message)}</span>`;
  wrap.appendChild(toast);

  let timer = null;
  const close = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(14px)';
    setTimeout(() => toast.remove(), 180);
  };
  const schedule = (delay = options.duration ?? 2600) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(close, delay);
  };
  const update = (nextMessage, nextType = type, nextOptions = {}) => {
    if (timer) clearTimeout(timer);
    toast.className = `toast ${nextType}`;
    toast.innerHTML = `<span class="toast-ico">${toastIcon(nextType)}</span><span>${esc(nextMessage)}</span>`;
    if (!nextOptions.persist) schedule(nextOptions.duration ?? 2600);
  };

  if (!options.persist) schedule();
  return { close, update, node: toast };
}

function workedDuration() {
  const start = state.ponto.entrada;
  const end = state.ponto.saida;
  if (!start || !end) return '0h00';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return '0h00';
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function bankHours() {
  const total = workedDuration();
  if (total === '0h00') return '0h';
  const [hoursPart, minutesPart] = total.replace('h', ':').split(':');
  const minutes = Number(hoursPart) * 60 + Number(minutesPart);
  const delta = minutes - (8 * 60);
  const prefix = delta >= 0 ? '+' : '-';
  const abs = Math.abs(delta);
  return `${prefix}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

function nextFocusTask() {
  return state.tasks
    .filter((item) => !item.done)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))[0];
}

function timelineItems() {
  const tasks = state.tasks.map((item) => ({
    time: item.time || 'Sem horario',
    title: item.title,
    detail: `${item.place} | ${item.category}`,
    done: item.done
  }));
  const calls = state.calls
    .filter((item) => item.status !== 'resolvido')
    .map((item) => ({
      time: item.status === 'em_rota' ? 'Em rota' : 'Aberto',
      title: item.title,
      detail: item.school,
      done: false
    }));
  return [...tasks, ...calls].slice(0, 8);
}

function showPage(page, options = {}) {
  if (!canAccessPage(page)) {
    page = defaultPageForUser();
  }
  const shouldRender = options.render !== false;
  currentPage = page;
  document.body.dataset.page = page;
  sessionStorage.setItem(PAGE_KEY, page);
  document.querySelectorAll('.page').forEach((node) => node.classList.toggle('active', node.id === `page-${page}`));
  document.querySelectorAll('.nav-item, .fn-item').forEach((node) => {
    const targetPage = page === 'school-record' ? 'schools' : page === 'supervisor-record' ? 'supervisors' : page;
    const isActive = node.dataset.page === targetPage;
    node.classList.toggle('active', isActive);
    if (node.dataset.page) {
      if (isActive) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    }
  });
  const hash = page === 'school-record' && currentSchoolDetail
    ? `school/${schoolSlug(currentSchoolDetail)}`
    : page === 'supervisor-record' && currentSupervisorDetail
      ? `supervisor/${supervisorSlug(currentSupervisorDetail)}`
      : page;
  if (window.location.hash !== `#${hash}`) {
    window.__setecInternalHashChange = true;
    window.location.hash = hash;
  }
  saveUiContext();
  applyAccessControl();
  if (shouldRender) {
    renderCurrentPage(page);
    applySystemIcons();
    applyPrivacy();
  }
}

function currentUser() {
  const activeId = sessionStorage.getItem(ACTIVE_USER_KEY);
  const users = state.users || [];
  if (activeId) {
    return users.find((item) => item.id === activeId && item.active !== false) || null;
  }
  return users.find((item) => item.role === 'admin' && item.active !== false) || null;
}

function currentUserRole() {
  return currentUser()?.role || 'admin';
}

function isSupervisorUser() {
  return currentUserRole() === 'supervisor';
}

function isPecUser() {
  return currentUserRole() === 'pec';
}

function isPecLeadUser() {
  const user = currentUser();
  return isPecUser() && normalizeKey(user?.login || user?.name) === normalizeKey('jaqueline.borelli');
}

function isRestrictedCtcUser() {
  const user = currentUser();
  return user?.role === 'ctc' && ['bruno', 'danilo'].includes(normalizeKey(user.login || user.name));
}

function isLegacyReadOnlyMode() {
  const explicit = window.SETECHUB_LEGACY_READONLY === true || localStorage.getItem('setechub_legacy_readonly') === '1';
  const locationText = `${location.hostname || ''} ${location.pathname || ''}`.toLowerCase();
  return explicit || locationText.includes('painelurelegado') || locationText.includes('setechublegado');
}

function canEditData() {
  if (isLegacyReadOnlyMode()) return false;
  if (VIEWER_MODE_V1) return canManageUsers();
  return ['admin', 'seintec', 'ctc'].includes(currentUserRole());
}

function canManageUsers() {
  if (isLegacyReadOnlyMode()) return false;
  return sessionStorage.getItem(SESSION_KEY) === 'ok' && currentUserRole() === 'admin';
}

function canImportData() {
  return canManageUsers();
}

function visibleNavigationPages() {
  const pages = isPecUser()
    ? new Set(['info', 'settings'])
    : isSupervisorUser()
      ? new Set(['dashboard', 'agenda', 'cars', 'schools', 'school-record', 'supervisors', 'supervisor-record', 'info', 'settings'])
      : currentUserRole() === 'seom'
        ? new Set(['dashboard', 'agenda', 'cars', 'schools', 'school-record', 'assets', 'info', 'settings'])
      : currentUserRole() === 'ctc'
        ? new Set(['dashboard', 'agenda', 'cars', 'ctc', 'info', 'settings'])
      : currentUserRole() === 'dirigente'
        ? new Set(['dashboard', 'agenda', 'cars', 'ctc', 'schools', 'school-record', 'supervisors', 'supervisor-record', 'assets', 'reports', 'info', 'settings'])
      : isRestrictedCtcUser()
        ? new Set(['dashboard', 'agenda', 'cars', 'ctc', 'schools', 'school-record', 'assets', 'reports', 'info', 'settings'])
      : canEditData()
      ? new Set(['dashboard', 'agenda', 'cars', 'ctc', 'schools', 'school-record', 'supervisors', 'supervisor-record', 'assets', 'reports', 'info', 'settings'])
        : new Set(['dashboard', 'agenda', 'cars', 'schools', 'school-record', 'supervisors', 'supervisor-record', 'assets', 'reports', 'info', 'settings']);
  DORMANT_NAV_PAGES.forEach((page) => pages.delete(page));
  if (['admin', 'seintec', 'ctc', 'dirigente'].includes(currentUserRole())) {
    pages.add('networks');
  }
  if (canManageUsers()) pages.add('admin');
  return pages;
}

function identityKeys(values = [], includeFirstName = true) {
  return [...new Set(values.flatMap((value) => {
    const key = normalizeKey(value);
    if (!key) return [];
    const emailName = key.includes('@') ? key.split('@')[0] : '';
    const firstName = key.split(/\s+/)[0] || '';
    return [key, emailName, includeFirstName ? firstName : ''].filter(Boolean);
  }))];
}

function supervisorIdentityKeys(supervisor, includeFirstName = false) {
  return identityKeys([
    supervisor?.name,
    supervisor?.email,
    supervisor?.login,
    supervisor?.username,
    ...(supervisor?.sourceAliases || [])
  ], includeFirstName);
}

function uniqueSupervisorFirstNameMatch(supervisors, userKeys) {
  const firstNames = userKeys.filter((key) => key && !key.includes('.') && !key.includes('@') && !key.includes(' '));
  if (!firstNames.length) return null;
  const matches = supervisors.filter((supervisor) =>
    firstNames.includes(normalizeKey(supervisor.name).split(/\s+/)[0])
  );
  return matches.length === 1 ? matches[0] : null;
}

function supervisorForUser(user = currentUser()) {
  if (!user || user.role !== 'supervisor') return null;
  const supervisors = state.supervisors || [];
  const userKeys = identityKeys([user.supervisorName, user.name, user.login, user.email, user.username]);
  if (!userKeys.length) return null;
  return supervisors.find((supervisor) =>
    supervisorIdentityKeys(supervisor, false).some((key) => userKeys.includes(key))
  ) || uniqueSupervisorFirstNameMatch(supervisors, userKeys);
}

function assignedSchoolsForCurrentUser() {
  const user = currentUser();
  if (!user || user.role !== 'supervisor') return state.schools.map((item) => item.name);
  const supervisor = supervisorForUser(user);
  return supervisor?.schools || [];
}

function visibleSchools() {
  if (!isSupervisorUser()) return state.schools || [];
  const allowed = new Set(assignedSchoolsForCurrentUser());
  return (state.schools || []).filter((school) => allowed.has(school.name));
}

function sortSupervisorsByName(supervisors) {
  return (supervisors || []).slice().sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { sensitivity: 'base' })
  );
}

function visibleSupervisors() {
  if (!isSupervisorUser()) return sortSupervisorsByName(state.supervisors);
  const supervisor = supervisorForUser();
  return supervisor ? [supervisor] : [];
}

function canViewSchool(name) {
  if (!isSupervisorUser()) return true;
  return assignedSchoolsForCurrentUser().includes(name);
}

function canViewSupervisor(name) {
  if (!isSupervisorUser()) return true;
  const supervisor = supervisorForUser();
  return Boolean(supervisor && normalizeKey(name) === normalizeKey(supervisor.name));
}

function defaultPageForUser() {
  if (isPecUser()) return 'info';
  return 'dashboard';
}

function canAccessPage(page) {
  return visibleNavigationPages().has(page) && !DISABLED_NAV_PAGES.has(page);
}

function applyAccessControl() {
  const role = currentUserRole();
  document.body.dataset.role = role;
  document.body.classList.remove('app-stage-v2');
  document.body.classList.add('app-stage-v3');
  document.body.classList.toggle('viewer-mode-v1', VIEWER_MODE_V1);
  document.body.classList.toggle('is-read-only', !canEditData());
  document.querySelectorAll('.nav-item, .fn-item').forEach((node) => {
    if (node.dataset.page) {
      const allowed = canAccessPage(node.dataset.page);
      node.hidden = PAUSED_NAV_PAGES.has(node.dataset.page) || (isRestrictedCtcUser() && !visibleNavigationPages().has(node.dataset.page));
      node.classList.toggle('nav-disabled', !allowed);
      node.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      node.disabled = !allowed;
      node.title = allowed ? '' : 'Página indisponível para este perfil';
    }
  });
  document.querySelectorAll('.sidebar-icon-btn, .sidebar-mini-btn').forEach((node) => {
    node.hidden = !canEditData();
  });
  document.querySelectorAll('.sidebar-utility').forEach((node) => {
    node.hidden = !canEditData();
  });
  const sidebarSearch = document.querySelector('.sb-search');
  if (sidebarSearch) sidebarSearch.hidden = isPecUser();
  document.querySelectorAll('[data-edit-scope]').forEach((node) => {
    node.hidden = !canEditData();
  });
  document.querySelectorAll('[data-admin-only]').forEach((node) => {
    const devOnly = node.hasAttribute('data-fun-ads-dev');
    const devAllowed = !devOnly || (typeof funAdsDeveloperMode === 'function' && funAdsDeveloperMode());
    node.hidden = !canManageUsers() || !devAllowed;
  });
  document.querySelectorAll('[data-v1-admin-import]').forEach((node) => {
    node.hidden = !canImportData();
  });
  document.querySelectorAll('[data-v1-hide]').forEach((node) => {
    node.hidden = VIEWER_MODE_V1;
  });
  document.querySelectorAll('[data-v1-admin-edit]').forEach((node) => {
    node.hidden = VIEWER_MODE_V1 ? !canManageUsers() : !canEditData();
  });
  const accountAdminButton = document.getElementById('accountAdminBtn');
  if (accountAdminButton) {
    const allowed = canManageUsers();
    accountAdminButton.hidden = !allowed;
    accountAdminButton.style.display = allowed ? '' : 'none';
  }
  [
    'taskForm',
    'callForm',
    'schoolForm',
    'schoolProfileForm',
    'schoolImportForm',
    'supervisorVisitForm',
    'supervisorRecordVisitFormElement',
    'assetForm',
    'schoolAssetForm',
    'schoolAssetBulkForm',
    'noteForm',
    'redeAutomationForm'
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = VIEWER_MODE_V1 ? true : !canEditData();
  });
  [
    'schoolImportForm',
    'fleetScheduleInput',
    'schoolAssetExcelInput',
    'syncSupervisorSourcesBtn',
    'refreshSupervisorSheetBtn',
    'monthlySupervisorSheetForm'
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = !canImportData();
  });
  [
    'backupBtn',
    'restoreInput',
    'resetBtn',
    'saveServerBtn',
    'loadServerBtn',
    'refreshSnapshotsBtn',
    'saveSupabaseBtn',
    'loadSupabaseBtn',
    'checkSupabaseBtn',
    'importLegacyBtn',
    'officialForm',
    'sectorForm'
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = !canManageUsers();
  });
  [
    'seedSupervisorVisitsBtn'
  ].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = !canEditData();
  });
  const directoryBox = document.getElementById('directoryContactsBox');
  if (directoryBox) directoryBox.hidden = isPecUser();
}

function updateIdentity() {
  const user = currentUser() || state.users?.[0] || { name: state.profile.name, role: 'admin', pin: state.profile.pin };
  const supervisor = supervisorForUser(user);
  const displayUser = supervisor ? { ...user, name: supervisor.name, email: user.email || supervisor.email } : user;
  document.getElementById('uName').textContent = displayUser.name;
  document.getElementById('uRole').textContent = roleDisplay(user.role);
  setAvatarNode(document.getElementById('uAvatar'), displayUser);
  setAvatarNode(document.getElementById('profilePhotoPreview'), displayUser);
  document.getElementById('profileName').value = displayUser.name;
  document.getElementById('profilePin').value = user.pin || '';
  syncMonthControls();
  applyAccessControl();
}

function filteredTasks() {
  if (currentTaskFilter === 'todas') return state.tasks;
  if (currentTaskFilter === 'minhas') {
    const user = currentUser();
    const userKey = normalizeKey(user?.name || user?.login || '');
    return state.tasks.filter((item) => normalizeKey(item.owner || item.createdBy || '') === userKey);
  }
  if (currentTaskFilter === 'ure') return state.tasks.filter((item) => item.scope === 'ure' || item.category === 'Evento URE');
  if (currentTaskFilter === 'carro') return state.tasks.filter((item) => item.scope === 'carro' || item.category === 'Carro oficial');
  if (currentTaskFilter === 'abertas') return state.tasks.filter((item) => !item.done);
  if (currentTaskFilter === 'alta') return state.tasks.filter((item) => item.priority === 'alta');
  if (currentTaskFilter === 'visita') return state.tasks.filter((item) => item.category.toLowerCase() === 'visita');
  if (currentTaskFilter === 'ctc') return state.tasks.filter((item) => normalizeKey(item.category).includes('ctc'));
  return state.tasks;
}

function openCtcAgenda() {
  showPage('ctc');
  renderCtcAgenda();
}

function openAgendaWithScope(scope = 'ure') {
  showPage('agenda');
  const scopeInput = document.getElementById('taskScope');
  const categoryInput = document.getElementById('taskCategory');
  const titleInput = document.getElementById('taskTitle');
  if (scopeInput) scopeInput.value = scope;
  if (categoryInput) categoryInput.value = scope === 'carro' ? 'Carro oficial' : scope === 'ure' ? 'Evento URE' : 'Evento URE';
  currentTaskFilter = scope === 'pessoal' ? 'minhas' : scope === 'carro' ? 'carro' : 'ure';
  syncFilterButtons('task');
  renderTasks();
  titleInput?.focus();
}

async function openCarSchedule() {
  currentTaskFilter = 'carro';
  showPage('cars');
  syncFilterButtons('task');
  renderCars();
  await syncCarScheduleSource();
}

function filteredCalls() {
  return state.calls.filter((item) => {
    if (currentCallSchoolContext && item.school !== currentCallSchoolContext) return false;
    if (currentCallFilter === 'todos') return true;
    return item.status === currentCallFilter;
  });
}

function filteredSchools() {
  return visibleSchools().filter((item) => {
    const zoneMatch = currentSchoolZoneFilter === 'todas' || item.zone === currentSchoolZoneFilter;
    if (!zoneMatch) return false;
    if (currentSchoolSearch) {
      const haystack = normalizeKey(`${item.name} ${item.cie || ''} ${item.zone} ${item.notes || ''}`);
      if (!haystack.includes(normalizeKey(currentSchoolSearch))) return false;
    }
    if (currentSchoolFilter === 'todas') return true;
    if (currentSchoolFilter === 'oficiais') return item.fixedName;
    if (currentSchoolFilter === 'com_dados') return schoolHasOperationalData(item.name);
    if (currentSchoolFilter === 'sem_ficha') return schoolProfileCompletion(item.name) < 35;
    if (currentSchoolFilter === 'sem_inventario') return schoolAssetTotals(item.name).units === 0;
    if (currentSchoolFilter === 'sem_rede') return !schoolNetworkRecord(item.name);
    if (currentSchoolFilter === 'com_rede') return !!schoolNetworkRecord(item.name);
    if (currentSchoolFilter === 'com_cameras') {
      const network = schoolNetworkRecord(item.name);
      return !!network && (Number(network.cameraInstalled || 0) > 0 || Boolean(network.cameraInstalledLabel));
    }
    if (currentSchoolFilter === 'com_alerta') return schoolAlertUnits(item.name) > 0;
    if (currentSchoolFilter === 'com_importacao') return schoolImportCount(item.name) > 0;
    if (currentSchoolFilter === 'com_chamado') return state.calls.some((call) => call.school === item.name && call.status !== 'resolvido');
    return item.status === currentSchoolFilter;
  });
}

function filteredDirectoryContacts(scopeToCurrentPec = true) {
  if (scopeToCurrentPec && isPecUser()) {
    const user = currentUser();
    const pecContacts = state.directoryContacts.filter((item) => /pec|curriculo|currículo|especialista/i.test(`${item.role} ${item.name}`));
    if (isPecLeadUser()) return pecContacts;
    return pecContacts.filter((item) => normalizeKey(item.name) === normalizeKey(user?.name));
  }
  if (currentDirectoryFilter === 'todos') return state.directoryContacts;
  if (DIRECTORY_FILTERS.some((filter) => filter.value === currentDirectoryFilter)) {
    return state.directoryContacts.filter((item) => directoryCategoryForContact(item) === currentDirectoryFilter);
  }
  if (currentDirectoryFilter.startsWith('sector:')) {
    const selectedSector = currentDirectoryFilter.slice('sector:'.length);
    return state.directoryContacts.filter((item) => normalizeKey(item.sector || 'sem setor') === selectedSector);
  }
  if (currentDirectoryFilter === 'supervisao') {
    return state.directoryContacts.filter((item) => /supervisor/i.test(item.role));
  }
  if (currentDirectoryFilter === 'tecnologia') {
    return state.directoryContacts.filter((item) => /prodesp|seintec|setec|tecnologia|ctc/i.test(`${item.role} ${item.sector}`));
  }
  if (currentDirectoryFilter === 'obras') {
    return state.directoryContacts.filter((item) => /seom|obras|manutencao|manut/i.test(normalizeKey(`${item.role} ${item.sector} ${item.name} ${item.email || ''}`)));
  }
  if (currentDirectoryFilter === 'financas') {
    return state.directoryContacts.filter((item) => /seafin|sefin|secomse|sefisc|financas|financeiro|compras|servicos|fiscalizacao|protocolo/i.test(normalizeKey(`${item.role} ${item.sector} ${item.name} ${item.email || ''}`)));
  }
  if (currentDirectoryFilter === 'rh') {
    return state.directoryContacts.filter((item) => /crh|sepes|seape|sefrep|pessoas|pessoal|frequencia|pagamento|recursos humanos|rh/i.test(normalizeKey(`${item.role} ${item.sector} ${item.name} ${item.email || ''}`)));
  }
  if (currentDirectoryFilter === 'pedagogico') {
    return state.directoryContacts.filter((item) => /pec|eec|curriculo|pedagogico|especialista/i.test(normalizeKey(`${item.role} ${item.sector} ${item.name} ${item.email || ''}`)));
  }
  if (currentDirectoryFilter === 'gestao') {
    return state.directoryContacts.filter((item) => /chefe|diretor|dirigente|executiva|assistente|gab|asure|seafin|sepes|segre/i.test(`${item.role} ${item.sector}`));
  }
  if (currentDirectoryFilter === 'pecs') {
    return state.directoryContacts.filter((item) => /pec|curriculo|currículo|especialista/i.test(`${item.role} ${item.name}`));
  }
  return state.directoryContacts;
}

function directoryContactText(item) {
  return normalizeKey(`${item?.name || ''} ${item?.role || ''} ${item?.sector || ''} ${item?.email || ''} ${item?.sectorEmail || ''}`);
}

function directoryCategoryForContact(item) {
  const text = directoryContactText(item);
  if (/site|suporte|prodesp|seintec|setec|tecnologia|ctc/.test(text)) return 'tecnologia';
  if (/gab|gabinete|asure|dirigente|executiva|assistente/.test(text)) return 'gabinete';
  if (/seom|obras|manutencao|manut/.test(text)) return 'obras';
  if (/sefrep|frequencia|pagamento/.test(text)) return 'pagamento';
  if (/crh|sepes|seape|pessoas|pessoal|recursos humanos|rh/.test(text)) return 'rh';
  if (/pec|eec|curriculo|pedagogico|especialista/.test(text)) return 'pedagogico';
  if (/seafin|sefin|secomse|sefisc|financas|financeiro|compras|servicos|fiscalizacao|protocolo/.test(text)) return 'compras';
  return 'gabinete';
}

function filteredAssets() {
  if (currentAssetFilter === 'todos') return state.assets;
  if (currentAssetFilter === 'alerta') return state.assets.filter((item) => item.status !== 'ok');
  if (currentAssetFilter === 'criticos') return state.assets.filter((item) => item.status === 'defeito');
  if (currentAssetFilter === 'infra') return state.assets.filter((item) => /switch|rack|modem|roteador|access point|wifi|rede/i.test(`${item.name} ${item.notes || ''}`));
  return state.assets;
}

function inventoryCategory(name) {
  const text = normalizeKey(name);
  if (/pc adm|pcs adm|administrativo|administracao|desktop adm|computador adm/.test(text)) return 'pc_adm';
  if (/pc peda|pedagogico|pedagogica|sala acessa|laboratorio|lab/.test(text)) return 'pc_pedagogico';
  if (/desktop|pc|computador|lenovo|positivo|multilaser|semp toshiba|itautec/.test(text)) return 'pc_pedagogico';
  if (/smartphone|celular|celulares/.test(text)) return 'smartphone';
  if (/tablet/.test(text)) return 'tablets';
  if (/netbook/.test(text)) return 'netbooks';
  if (/notebook/.test(text)) return 'notebooks';
  if (/switch|rack|modem|roteador|wifi|antena|firewall|dvr/.test(text)) return 'infra';
  if (/recarga|carreg/.test(text)) return 'energia';
  return 'outros';
}

function simplifiedEquipmentName(item) {
  const text = normalizeKey(`${item?.name || ''} ${item?.sourceName || ''} ${item?.canonicalName || ''} ${item?.model || ''} ${item?.notes || ''}`);
  if (/pc adm|pcs adm|administrativo|administracao|desktop adm|computador adm/.test(text)) return 'PC adm';
  if (/pc peda|pedagogico|pedagogica|sala acessa|laboratorio|lab/.test(text)) return 'PC pedagogico';
  if (/desktop|pc|computador|lenovo|positivo|multilaser|semp toshiba|itautec/.test(text) && !/netbook|notebook|tablet/.test(text)) return 'PC pedagogico';
  if (/smartphone|celular|celulares/.test(text)) return 'smartphone';
  if (/tablet/.test(text)) return 'tablet';
  if (/netbook/.test(text)) {
    if (/1210|preto|pretos|novo|novos/.test(text)) return 'Netbook 1210';
    return 'Netbook 1110';
  }
  if (/notebook|chromebook/.test(text)) return 'notebook';
  return 'outros';
}

function normalizeEquipmentText(value) {
  return String(value || '');
}

function equipmentTypeLabel(value) {
  return ({
    pc_adm: 'PC adm',
    pc_pedagogico: 'PC pedagogico',
    netbooks: 'Netbooks',
    notebooks: 'Notebooks',
    tablets: 'Tablets',
    smartphone: 'Smartphone',
    infra: 'Infra / rede',
    energia: 'Recarga / energia',
    outros: 'Outros'
  }[value]) || badgeText(value);
}

function simplifiedEquipmentOrder(name) {
  return ({
    'PC adm': 0,
    'PC pedagogico': 1,
    'Netbook 1110': 2,
    'Netbook 1210': 3,
    tablet: 4,
    smartphone: 5,
    notebook: 6,
    outros: 99
  }[name]) ?? 50;
}

function inventorySourceDetails(item) {
  const rows = Array.isArray(item.sourceItems) ? item.sourceItems : [];
  if (!rows.length) return '';
  return `
    <details class="inventory-source-details">
      <summary>Ver lista (${esc(String(rows.length))})</summary>
      <div class="inventory-source-list">
        ${rows.map((source) => `
          <div class="inventory-source-row">
            <strong>${esc(normalizeEquipmentText(source.name))}</strong>
            <span>${esc(String(source.units))} unid. | ${esc(badgeText(source.status))}</span>
            ${source.notes ? `<small>${esc(normalizeEquipmentText(source.notes))}</small>` : ''}
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function inventoryBrand(name, notes = '') {
  if (typeof name === 'object' && name?.brand) return name.brand;
  const text = normalizeKey(`${name} ${notes}`);
  if (/positivo/.test(text)) return 'Positivo';
  if (/lenovo/.test(text)) return 'Lenovo';
  if (/multilaser/.test(text)) return 'Multilaser';
  if (/semp toshiba|itautec/.test(text)) return 'Misto';
  return 'Nao definida';
}

function inventoryModel(name, notes = '') {
  if (typeof name === 'object' && name?.model) return name.model;
  const text = normalizeKey(`${name} ${notes}`);
  if (/1110/.test(text)) return '1110';
  if (/1210/.test(text)) return '1210';
  if (/ultra/.test(text)) return 'Ultra';
  if (/legado/.test(text)) return 'Legado';
  return '';
}

function inventoryOriginalStatus(notes = '') {
  const match = String(notes).match(/status original:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function inventoryBlueMonitorCount(notes = '') {
  const match = String(notes).match(/BlueMonitor:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function inventoryDataQuality(name, notes = '') {
  const text = normalizeKey(`${name} ${notes}`);
  if (/nao informado|sem marca|sem status|^tablet$|^notebook$|^netbooks?$|^desktop$/.test(text)) return 'fraco';
  if (/adquirido pela escola|mix de marcas|legado|equipamento lenovo|equipamento positivo|tv \/ monitor|bateria \/ pilha/.test(text)) return 'medio';
  return 'bom';
}

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatSchoolAssetNotes(notes = '', quantity = 1) {
  const cleanNotes = String(notes || '').trim();
  if (quantity <= 1) return cleanNotes;
  return cleanNotes ? `${quantity} unidades | ${cleanNotes}` : `${quantity} unidades`;
}

function parseBulkSchoolAssets(text, defaultStatus = 'ok') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;|\t]/).map((item) => item.trim());
      const [name = '', quantityRaw = '', statusRaw = '', ...noteParts] = parts;
      const quantity = parsePositiveInteger(quantityRaw, 1);
      const status = ['ok', 'manutencao', 'defeito'].includes(normalizeKey(statusRaw).replace(/\s+/g, '_'))
        ? normalizeKey(statusRaw).replace(/\s+/g, '_')
        : defaultStatus;
      return {
        name,
        quantity,
        status,
        notes: formatSchoolAssetNotes(noteParts.join(' | '), quantity)
      };
    })
    .filter((item) => item.name);
}

function orphanedReferenceSummary() {
  const schoolNames = new Set(state.schools.map((item) => item.name));
  return {
    tasks: state.tasks.filter((item) => item.place && !schoolNames.has(item.place)).length,
    calls: state.calls.filter((item) => item.school && !schoolNames.has(item.school)).length,
    profiles: state.schoolProfiles.filter((item) => item.school && !schoolNames.has(item.school)).length,
    imports: state.schoolImports.filter((item) => item.school && !schoolNames.has(item.school)).length,
    assets: state.schoolAssets.filter((item) => item.school && !schoolNames.has(item.school)).length,
    networks: state.schoolNetworks.filter((item) => item.school && !schoolNames.has(item.school)).length
  };
}

function duplicateSchoolCies() {
  const map = new Map();
  state.schools.forEach((school) => {
    const cie = String(school.cie || '').trim();
    if (!cie) return;
    const bucket = map.get(cie) || [];
    bucket.push(school.name);
    map.set(cie, bucket);
  });
  return Array.from(map.entries())
    .filter(([, names]) => names.length > 1)
    .map(([cie, names]) => ({ cie, names }));
}

function schoolEventHistory(schoolName, limit = 8) {
  return (state.histories.schoolEvents || [])
    .filter((item) => item.school === schoolName)
    .slice(0, limit);
}

function pendingQueueItems(limit = 20) {
  const cache = getDerivedCache();
  if (!cache.pendingQueueItems) {
    const items = [];
    visibleSchools().forEach((school) => {
      const missingFields = schoolMissingProfileFields(school.name);
      const network = schoolNetworkRecord(school.name);
      const networkGap = network ? Math.max(0, Number(network.cameraInstalled || 0) - Number(network.cameraWorking || 0)) : 0;
      const alerts = schoolAlertUnits(school.name);
      if (missingFields.length) {
        items.push({ school: school.name, type: 'ficha', tone: 'pill-info', text: `Ficha incompleta: faltam ${missingFields.slice(0, 3).join(', ')}${missingFields.length > 3 ? '...' : ''}.` });
      }
      if (!network) {
        items.push({ school: school.name, type: 'rede', tone: 'pill-warn', text: 'Sem importação de rede e câmeras.' });
      } else if (networkGap > 0) {
        items.push({ school: school.name, type: 'rede', tone: 'pill-danger', text: `${networkGap} câmera(s) abaixo da cobertura esperada.` });
      }
      if (alerts > 0) {
        items.push({ school: school.name, type: 'inventario', tone: 'pill-danger', text: `${alerts} unidade(s) em manutenção/defeito no inventário.` });
      }
    });
    const priority = { inventario: 0, rede: 1, ficha: 2 };
    cache.pendingQueueItems = items
      .sort((a, b) => (priority[a.type] ?? 99) - (priority[b.type] ?? 99) || a.school.localeCompare(b.school));
  }
  return cache.pendingQueueItems.slice(0, limit);
}

function pendingQueueItemsLegacy(limit = 20) {
  const items = [];
  visibleSchools().forEach((school) => {
    const missingFields = schoolMissingProfileFields(school.name);
    const network = schoolNetworkRecord(school.name);
    const networkGap = network ? Math.max(0, Number(network.cameraInstalled || 0) - Number(network.cameraWorking || 0)) : 0;
    const alerts = schoolAlertUnits(school.name);
    if (missingFields.length) {
      items.push({ school: school.name, type: 'ficha', tone: 'pill-info', text: `Ficha incompleta: faltam ${missingFields.slice(0, 3).join(', ')}${missingFields.length > 3 ? '...' : ''}.` });
    }
    if (!network) {
      items.push({ school: school.name, type: 'rede', tone: 'pill-warn', text: 'Sem importacao de rede e cameras.' });
    } else if (networkGap > 0) {
      items.push({ school: school.name, type: 'rede', tone: 'pill-danger', text: `${networkGap} camera(s) abaixo da cobertura esperada.` });
    }
    if (alerts > 0) {
      items.push({ school: school.name, type: 'inventario', tone: 'pill-danger', text: `${alerts} unidade(s) em manutenção/defeito no inventário.` });
    }
  });
  const priority = { inventario: 0, rede: 1, ficha: 2 };
  return items
    .sort((a, b) => (priority[a.type] ?? 99) - (priority[b.type] ?? 99) || a.school.localeCompare(b.school))
    .slice(0, limit);
}

function filteredSchoolAssets() {
  return state.schoolAssets.filter((item) => {
    if (currentInventorySchool !== 'todas' && item.school !== currentInventorySchool) return false;
    if (currentInventoryStatus === 'alerta' && item.status === 'ok') return false;
    if (currentInventoryStatus === 'criticos' && item.status !== 'defeito') return false;
    if (currentInventoryStatus === 'ok' && item.status !== 'ok') return false;
    if (currentInventoryCategory !== 'todas' && inventoryCategory(item.name) !== currentInventoryCategory) return false;
    if (currentInventorySearch) {
      const haystack = normalizeKey(`${item.school} ${item.name} ${item.notes || ''}`);
      if (!haystack.includes(normalizeKey(currentInventorySearch))) return false;
    }
    return true;
  });
}

function aggregateInventoryItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const itemName = simplifiedEquipmentName(item);
    const key = `${item.school}|${normalizeKey(itemName)}`;
    const current = groups.get(key) || {
      school: item.school,
      name: itemName,
      rawNames: new Set(),
      category: inventoryCategory(itemName),
      brand: item.brand || inventoryBrand(item.name, item.notes || ''),
      model: item.model || inventoryModel(item.name, item.notes || ''),
      quality: inventoryDataQuality(item.name, item.notes || ''),
      lines: 0,
      units: 0,
      okUnits: 0,
      alertUnits: 0,
      defectUnits: 0,
      originalStatuses: new Set(),
      blueMonitorUnits: 0,
      statuses: new Set(),
      notes: [],
      sourceItems: []
    };
    const units = schoolAssetUnits(item);
    current.lines += 1;
    current.units += units;
    current.rawNames.add(item.sourceName || item.name);
    current.statuses.add(item.status);
    current.notes.push(item.notes || '');
    current.sourceItems.push({
      name: item.sourceName || item.name || itemName,
      status: item.status,
      units,
      notes: item.notes || ''
    });
    const originalStatus = inventoryOriginalStatus(item.notes || '');
    if (originalStatus) current.originalStatuses.add(originalStatus);
    current.blueMonitorUnits += inventoryBlueMonitorCount(item.notes || '');
    if (inventoryDataQuality(item.name, item.notes || '') === 'fraco') current.quality = 'fraco';
    else if (inventoryDataQuality(item.name, item.notes || '') === 'medio' && current.quality !== 'fraco') current.quality = 'medio';
    if (item.status === 'ok') current.okUnits += units;
    if (item.status !== 'ok') current.alertUnits += units;
    if (item.status === 'defeito') current.defectUnits += units;
    groups.set(key, current);
  });
  return Array.from(groups.values()).map((item) => ({
    ...item,
    statusLabel: item.defectUnits > 0 ? 'defeito' : item.alertUnits > 0 ? 'manutencao' : 'ok',
    rawNameCount: item.rawNames.size,
    originalStatusCount: item.originalStatuses.size,
    notePreview: item.notes.filter(Boolean).slice(0, 2).join(' | ')
  }));
}

function schoolInventoryRows(schoolName) {
  return aggregateInventoryItems(state.schoolAssets.filter((item) => item.school === schoolName))
    .sort((a, b) => simplifiedEquipmentOrder(a.name) - simplifiedEquipmentOrder(b.name) || b.units - a.units || a.name.localeCompare(b.name));
}

function schoolInventoryCategorySummary(schoolName) {
  return schoolInventoryRows(schoolName).reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = { category: item.category, units: 0, alertUnits: 0, items: 0 };
    }
    acc[item.category].units += item.units;
    acc[item.category].alertUnits += item.alertUnits;
    acc[item.category].items += 1;
    return acc;
  }, {});
}

function inventorySchoolRows() {
  const rows = filteredSchoolAssets().reduce((acc, item) => {
    if (!acc[item.school]) {
      acc[item.school] = { school: item.school, totalLines: 0, totalUnits: 0, alertUnits: 0, defectUnits: 0, categories: new Set() };
    }
    const bucket = acc[item.school];
    const units = schoolAssetUnits(item);
    bucket.totalLines += 1;
    bucket.totalUnits += units;
    bucket.categories.add(inventoryCategory(item.name));
    if (item.status !== 'ok') bucket.alertUnits += units;
    if (item.status === 'defeito') bucket.defectUnits += units;
    return acc;
  }, {});
  return Object.values(rows)
    .map((item) => ({ ...item, categories: item.categories.size }))
    .sort((a, b) => b.alertUnits - a.alertUnits || b.totalUnits - a.totalUnits || a.school.localeCompare(b.school));
}

function inventoryFocusSchool() {
  if (currentInventorySchool !== 'todas') return currentInventorySchool;
  return inventorySchoolRows()[0]?.school || visibleSchools()[0]?.name || '';
}

function inventoryQualitySummary() {
  const rows = aggregateInventoryItems(state.schoolAssets);
  return {
    families: rows.length,
    lowQuality: rows.filter((item) => item.quality === 'fraco').length,
    mergedFamilies: rows.filter((item) => item.rawNameCount > 1).length,
    defectiveTypes: rows.filter((item) => item.defectUnits > 0).length,
    mixedStatuses: rows.filter((item) => item.originalStatusCount > 1).length
  };
}

function inventoryIssuesForSchool(schoolName) {
  return schoolInventoryRows(schoolName)
    .filter((item) => item.quality !== 'bom' || item.defectUnits > 0 || item.rawNameCount > 1 || item.originalStatusCount > 1)
    .sort((a, b) => {
      const scoreA = (a.quality === 'fraco' ? 4 : a.quality === 'medio' ? 2 : 0) + a.defectUnits + a.rawNameCount + a.originalStatusCount;
      const scoreB = (b.quality === 'fraco' ? 4 : b.quality === 'medio' ? 2 : 0) + b.defectUnits + b.rawNameCount + b.originalStatusCount;
      return scoreB - scoreA || b.alertUnits - a.alertUnits || a.name.localeCompare(b.name);
    });
}

function filteredSchoolImports() {
  const allowedSchools = new Set(visibleSchools().map((item) => item.name));
  const source = currentImportSchoolContext
    ? state.schoolImports.filter((item) => item.school === currentImportSchoolContext && allowedSchools.has(item.school))
    : state.schoolImports.filter((item) => allowedSchools.has(item.school));
  if (currentImportFilter === 'todos') return source;
  if (currentImportFilter === 'documentos') return source.filter((item) => /doc|pdf|text/i.test(item.type || item.filename || ''));
  if (currentImportFilter === 'planilhas') return source.filter((item) => /excel|csv|xlsx|xls|tsv/i.test(item.type || item.filename || ''));
  if (currentImportFilter === 'imagens') return source.filter((item) => /image|png|jpg|jpeg|webp|bmp/i.test(item.type || item.filename || ''));
  if (currentImportFilter === 'com_preview') return source.filter((item) => (item.preview || '').trim().length > 0);
  return source;
}

function commandPaletteItems(query = '') {
  const normalizedQuery = normalizeKey(query);
  const match = (text) => !normalizedQuery || normalizeKey(text).includes(normalizedQuery);
  const items = [];
  visibleSchools().forEach((school) => {
    const profile = state.schoolProfiles.find((item) => item.school === school.name);
    const haystack = `${school.name} ${school.cie || ''} ${school.zone} ${profile?.director || ''} ${profile?.phone || ''}`;
    if (!match(haystack)) return;
    items.push({
      type: 'school',
      title: school.name,
      meta: `Escola | ${school.zone} | CIE ${school.cie || '--'}`,
      tone: toneBySchool(school.status),
      value: school.name
    });
  });
  visibleSupervisors().forEach((supervisor) => {
    if (!match(`${supervisor.name} ${(supervisor.schools || []).join(' ')}`)) return;
    items.push({
      type: 'supervisor',
      title: supervisor.name,
      meta: `Supervisor | ${(supervisor.schools || []).length} escola(s)`,
      tone: 'pill-info',
      value: supervisor.name
    });
  });
  aggregateInventoryItems(state.schoolAssets || []).forEach((item) => {
    if (!match(`${item.school} ${item.name} ${item.notePreview || ''}`)) return;
    items.push({
      type: 'inventory',
      title: item.name,
      meta: `Inventario | ${item.school} | ${item.units} unid.`,
      tone: item.defectUnits > 0 ? 'pill-danger' : item.alertUnits > 0 ? 'pill-warn' : 'pill-ok',
      value: item.school
    });
  });
  (state.tasks || []).filter((task) => !task.done).forEach((task) => {
    if (!match(`${task.title} ${task.place || ''} ${task.owner || ''} ${task.category || ''}`)) return;
    items.push({
      type: 'task',
      title: task.title,
      meta: `Agenda | ${task.place || 'sem local'} | ${badgeText(task.priority)}`,
      tone: toneByPriority(task.priority),
      value: task.id
    });
  });
  filteredDirectoryContacts(false).forEach((contact) => {
    if (!match(`${contact.name} ${contact.role || ''} ${contact.sector || ''} ${contact.email || ''}`)) return;
    items.push({
      type: 'contact',
      title: contact.name,
      meta: `Contato | ${contact.role || contact.sector || 'diretorio'}`,
      tone: 'pill-info',
      value: contact.id || contact.name
    });
  });
  const order = { school: 0, supervisor: 1, inventory: 2, task: 3, contact: 4 };
  return items
    .sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99) || a.title.localeCompare(b.title))
    .slice(0, 24);
}

function renderCommandPalette(query = '') {
  const results = document.getElementById('commandResults');
  if (!results) return;
  const items = commandPaletteItems(query);
  results.innerHTML = items.map((item) => `
    <button type="button" class="command-result" data-command-action="${esc(item.type)}" data-command-value="${esc(item.value)}">
      <span>
        <strong>${esc(item.title)}</strong>
        <small>${esc(item.meta)}</small>
      </span>
      <span class="diag-pill ${esc(item.tone)}">${esc(badgeText(item.type))}</span>
    </button>
  `).join('') || '<div class="sync-empty">Nada encontrado. Tente escola, supervisor, inventario, agenda ou contato.</div>';
}

function openCommandPalette(seed = '') {
  const overlay = document.getElementById('commandOverlay');
  const input = document.getElementById('commandInput');
  if (!overlay || !input) return;
  commandPaletteOpen = true;
  overlay.classList.add('open');
  input.value = seed;
  renderCommandPalette(seed);
  setTimeout(() => input.focus(), 0);
}

function closeCommandPalette() {
  const overlay = document.getElementById('commandOverlay');
  if (!overlay) return;
  commandPaletteOpen = false;
  overlay.classList.remove('open');
}

function runCommandAction(type, value) {
  closeCommandPalette();
  if (type === 'school') {
    openSchoolRecord(value);
    return;
  }
  if (type === 'supervisor') {
    openSupervisorRecord(value);
    return;
  }
  if (type === 'inventory') {
    setInventorySchool(value);
    return;
  }
  if (type === 'task') {
    showPage('agenda');
    return;
  }
  if (type === 'contact') {
    currentDirectoryFilter = 'todos';
    showPage('info');
    renderDirectoryContacts();
  }
}

function saveUiContext() {
  try {
    const payload = JSON.stringify({
      page: currentPage,
      taskFilter: currentTaskFilter,
      callFilter: currentCallFilter,
      callSchoolContext: currentCallSchoolContext,
      schoolFilter: currentSchoolFilter,
      schoolZoneFilter: currentSchoolZoneFilter,
      schoolSort: currentSchoolSort,
      supervisorFilter: currentSupervisorFilter,
      supervisorMonth: `${currentViewDate.getFullYear()}-${String(currentViewDate.getMonth() + 1).padStart(2, '0')}`,
      schoolSearch: currentSchoolSearch,
      assetFilter: currentAssetFilter,
      importFilter: currentImportFilter,
      importSchoolContext: currentImportSchoolContext,
      inventorySchool: currentInventorySchool,
      inventoryZone: currentInventoryZone,
      inventorySupervisor: currentInventorySupervisor,
      inventoryStatus: currentInventoryStatus,
      inventoryCategory: currentInventoryCategory,
      inventorySearch: currentInventorySearch,
      schoolDetail: currentSchoolDetail,
      supervisorDetail: currentSupervisorDetail,
      directoryFilter: currentDirectoryFilter,
      searchQuery: currentSearchQuery
    });
    sessionStorage.setItem(CONTEXT_KEY, payload);
    localStorage.setItem(CONTEXT_KEY, payload);
  } catch {
    // Ignore persistence failures.
  }
}

function restoreUiContext() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY) || localStorage.getItem(CONTEXT_KEY);
    if (!raw) return;
    const context = JSON.parse(raw);
    currentPage = context.page || currentPage;
    currentTaskFilter = context.taskFilter || currentTaskFilter;
    currentCallFilter = context.callFilter || currentCallFilter;
    currentCallSchoolContext = context.callSchoolContext || '';
    currentSchoolFilter = context.schoolFilter || currentSchoolFilter;
    currentSchoolZoneFilter = context.schoolZoneFilter || currentSchoolZoneFilter;
    currentSchoolSort = context.schoolSort || currentSchoolSort;
    currentSupervisorFilter = context.supervisorFilter || currentSupervisorFilter;
    if (/^\d{4}-\d{2}$/.test(context.supervisorMonth || '')) {
      const [year, month] = context.supervisorMonth.split('-').map(Number);
      currentViewDate = new Date(year, month - 1, 1);
    }
    currentSchoolSearch = context.schoolSearch || '';
    currentAssetFilter = context.assetFilter || currentAssetFilter;
    currentImportFilter = context.importFilter || currentImportFilter;
    currentImportSchoolContext = context.importSchoolContext || '';
    currentInventorySchool = context.inventorySchool || currentInventorySchool;
    currentInventoryZone = context.inventoryZone || currentInventoryZone;
    currentInventorySupervisor = context.inventorySupervisor || currentInventorySupervisor;
    currentInventoryStatus = context.inventoryStatus || currentInventoryStatus;
    currentInventoryCategory = context.inventoryCategory || currentInventoryCategory;
    currentInventorySearch = context.inventorySearch || '';
    currentSchoolDetail = context.schoolDetail || currentSchoolDetail;
    currentSupervisorDetail = context.supervisorDetail || currentSupervisorDetail;
    currentDirectoryFilter = context.directoryFilter || currentDirectoryFilter;
    currentSearchQuery = context.searchQuery || '';
  } catch {
    // Ignore malformed session context.
  }
}

function restorePageFromHash() {
  const hash = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!hash) return;
  if (hash.startsWith('school/')) {
    const slug = hash.slice('school/'.length);
    const school = visibleSchools().find((item) => schoolSlug(item.name) === slug);
    if (school && canViewSchool(school.name)) {
      currentSchoolDetail = school.name;
      currentPage = 'school-record';
    }
    return;
  }
  if (hash.startsWith('supervisor/')) {
    const slug = hash.slice('supervisor/'.length);
    const supervisor = visibleSupervisors().find((item) => supervisorSlug(item.name) === slug);
    if (supervisor && canViewSupervisor(supervisor.name)) {
      currentSupervisorDetail = supervisor.name;
      currentSupervisorFilter = normalizeKey(supervisor.name);
      currentPage = 'supervisor-record';
    }
    return;
  }
  currentPage = hash;
}

function currentSchoolProfile() {
  const school = currentSchoolDetail || visibleSchools()[0]?.name || '';
  return getDerivedCache().profilesBySchool.get(school) || null;
}

function schoolByName(schoolName) {
  return state.schools.find((item) => item.name === schoolName) || null;
}

function supervisorByName(supervisorName) {
  return (state.supervisors || []).find((item) => item.name === supervisorName) || null;
}

function topOpenCalls(limit = 5) {
  return state.calls
    .filter((item) => item.status !== 'resolvido')
    .slice()
    .sort((a, b) => a.school.localeCompare(b.school) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function topInventoryAlerts(limit = 5) {
  const cache = getDerivedCache();
  if (!cache.topInventoryAlerts) {
    cache.topInventoryAlerts = aggregateInventoryItems(state.schoolAssets)
      .filter((item) => item.alertUnits > 0)
      .sort((a, b) => b.alertUnits - a.alertUnits || b.defectUnits - a.defectUnits || a.school.localeCompare(b.school));
  }
  return cache.topInventoryAlerts.slice(0, limit);
}

function recentSchoolImports(limit = 5) {
  return state.schoolImports
    .slice()
    .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')))
    .slice(0, limit);
}

function schoolImportCount(schoolName) {
  return getDerivedCache().importsBySchool.get(schoolName) || 0;
}

function schoolNetworkRecord(schoolName) {
  return getDerivedCache().networksBySchool.get(schoolName) || null;
}

function schoolAssetLines(schoolName) {
  return getDerivedCache().assetsBySchool.get(schoolName) || [];
}

function schoolAssetTotals(schoolName) {
  const assets = schoolAssetLines(schoolName);
  return {
    lines: assets.length,
    units: assets.reduce((sum, item) => sum + schoolAssetUnits(item), 0)
  };
}

function schoolAlertUnits(schoolName) {
  return schoolAssetLines(schoolName)
    .filter((item) => item.status !== 'ok')
    .reduce((sum, item) => sum + schoolAssetUnits(item), 0);
}

function schoolProfileCompletion(schoolName) {
  const cache = getDerivedCache();
  if (cache.profileCompletionBySchool.has(schoolName)) return cache.profileCompletionBySchool.get(schoolName);
  const profile = cache.profilesBySchool.get(schoolName);
  if (!profile) return 0;
  const fields = ['director', 'viceDirector', 'proati', 'goe', 'phone', 'mobile', 'email', 'address', 'notes'];
  const filled = fields.filter((field) => String(profile[field] || '').trim()).length;
  const completion = Math.round((filled / fields.length) * 100);
  cache.profileCompletionBySchool.set(schoolName, completion);
  return completion;
}

function schoolMissingProfileFields(schoolName) {
  const cache = getDerivedCache();
  if (cache.missingProfileFieldsBySchool.has(schoolName)) return cache.missingProfileFieldsBySchool.get(schoolName);
  const profile = cache.profilesBySchool.get(schoolName);
  if (!profile) return ['direção', 'telefone', 'email', 'endereço'];
  const labels = {
    director: 'direção',
    viceDirector: 'vice-direção',
    proati: 'PROATI',
    goe: 'GOE',
    phone: 'telefone',
    mobile: 'celular',
    email: 'email',
    address: 'endereço',
    notes: 'observações'
  };
  const missing = Object.entries(labels)
    .filter(([field]) => !String(profile[field] || '').trim())
    .map(([, label]) => label);
  cache.missingProfileFieldsBySchool.set(schoolName, missing);
  return missing;
}

function schoolHasOperationalData(schoolName) {
  return schoolImportCount(schoolName) > 0 || schoolAssetLines(schoolName).length > 0 || schoolProfileCompletion(schoolName) > 0 || !!schoolNetworkRecord(schoolName);
}

function schoolOperationalSnapshot(school) {
  const cache = getDerivedCache();
  const cached = cache.operationalSnapshotBySchool.get(school.name);
  if (cached) return cached;
  const imports = schoolImportCount(school.name);
  const assetTotals = schoolAssetTotals(school.name);
  const alertUnits = schoolAlertUnits(school.name);
  const completion = schoolProfileCompletion(school.name);
  const openCalls = cache.openCallsBySchool.get(school.name) || 0;
  const pendingTasks = (cache.pendingTasksBySchool.get(school.name) || 0) +
    state.tasks.filter((item) => !item.done && item.place !== school.name && item.title.includes(school.name)).length;
  const network = schoolNetworkRecord(school.name);
  const snapshot = {
    imports,
    assetLines: assetTotals.lines,
    assetUnits: assetTotals.units,
    alertUnits,
    completion,
    openCalls,
    pendingTasks,
    networkStatus: network?.status || '',
    networkGap: network ? Math.max(0, Number(network.cameraInstalled || 0) - Number(network.cameraWorking || 0)) : 0
  };
  cache.operationalSnapshotBySchool.set(school.name, snapshot);
  return snapshot;
}

function schoolDataScore(schoolName) {
  const profile = schoolProfileCompletion(schoolName);
  const inventory = schoolAssetTotals(schoolName).units > 0 ? 25 : 0;
  const imports = schoolImportCount(schoolName) > 0 ? 20 : 0;
  const network = schoolNetworkRecord(schoolName) ? 20 : 0;
  return Math.min(100, Math.round((profile * 0.35) + inventory + imports + network));
}

function sortSchoolsByCurrentView(schools) {
  return schools.slice().sort((a, b) => {
    const signalA = schoolOperationalSnapshot(a);
    const signalB = schoolOperationalSnapshot(b);
    if (currentSchoolSort === 'nome') return a.name.localeCompare(b.name);
    if (currentSchoolSort === 'municipio') return a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name);
    if (currentSchoolSort === 'inventario') return signalB.assetUnits - signalA.assetUnits || a.name.localeCompare(b.name);
    if (currentSchoolSort === 'alertas') return signalB.alertUnits - signalA.alertUnits || a.name.localeCompare(b.name);
    if (currentSchoolSort === 'dados') return schoolDataScore(b.name) - schoolDataScore(a.name) || a.name.localeCompare(b.name);
    return signalB.alertUnits - signalA.alertUnits || signalB.openCalls - signalA.openCalls || a.name.localeCompare(b.name);
  });
}

function filteredSupervisors() {
  const source = visibleSupervisors();
  if (currentSupervisorFilter === 'todos') return source;
  return source.filter((item) => normalizeKey(item.name) === currentSupervisorFilter);
}

function supervisorVisitRows() {
  const selectedNames = new Set(filteredSupervisors().map((item) => item.name));
  return (state.supervisorVisits || []).filter((item) =>
    currentSupervisorFilter === 'todos' || selectedNames.has(item.supervisor)
  );
}

function supervisorStats() {
  const cache = getDerivedCache();
  if (cache.supervisorStats) return cache.supervisorStats;
  const visits = state.supervisorVisits || [];
  const visibleSchoolNames = new Set(visibleSchools().map((school) => school.name));
  const callsBySchool = (state.calls || []).reduce((acc, call) => {
    if (call.status === 'resolvido') return acc;
    acc.set(call.school, (acc.get(call.school) || 0) + 1);
    return acc;
  }, new Map());
  cache.supervisorStats = visibleSupervisors().map((supervisor) => {
    const assignedSchools = supervisor.schools || [];
    const supervisorVisits = cache.visitsBySupervisor.get(supervisor.name) || [];
    const visitedSchools = new Set(supervisorVisits.map((visit) => visit.school));
    const openCalls = assignedSchools.reduce((sum, school) => sum + (callsBySchool.get(school) || 0), 0);
    const alerts = assignedSchools.reduce((sum, school) => sum + schoolAlertUnits(school), 0);
    const knownSchools = assignedSchools.filter((name) => visibleSchoolNames.has(name)).length;
    return {
      supervisor,
      assignedSchools,
      knownSchools,
      visits: supervisorVisits.length,
      visitedSchools: visitedSchools.size,
      coverage: assignedSchools.length ? Math.round((visitedSchools.size / assignedSchools.length) * 100) : 0,
      openCalls,
      alerts
    };
  });
  return cache.supervisorStats;
}

function operationalCoverage() {
  const cache = getDerivedCache();
  if (cache.operationalCoverage) return cache.operationalCoverage;
  const schools = visibleSchools();
  const totalSchools = schools.length || 1;
  let schoolsWithImports = 0;
  let schoolsWithAssets = 0;
  let schoolsWithProfile = 0;
  schools.forEach((school) => {
    const snapshot = schoolOperationalSnapshot(school);
    if (snapshot.imports > 0) schoolsWithImports += 1;
    if (snapshot.assetLines > 0) schoolsWithAssets += 1;
    if (snapshot.completion >= 35) schoolsWithProfile += 1;
  });
  const activeAlerts = state.schoolAssets.filter((item) => item.status !== 'ok').length + state.assets.filter((item) => item.status !== 'ok').length;
  cache.operationalCoverage = {
    totalSchools,
    schoolsWithImports,
    schoolsWithAssets,
    schoolsWithProfile,
    importCoverage: Math.round((schoolsWithImports / totalSchools) * 100),
    assetCoverage: Math.round((schoolsWithAssets / totalSchools) * 100),
    profileCoverage: Math.round((schoolsWithProfile / totalSchools) * 100),
    activeAlerts
  };
  return cache.operationalCoverage;
}

function schoolCoverageSummary() {
  const filtered = filteredSchools();
  const total = filtered.length || 1;
  const withInventory = filtered.filter((school) => schoolAssetTotals(school.name).units > 0).length;
  const withNetwork = filtered.filter((school) => !!schoolNetworkRecord(school.name)).length;
  const withAlerts = filtered.filter((school) => schoolAlertUnits(school.name) > 0).length;
  const withProfile = filtered.filter((school) => schoolProfileCompletion(school.name) >= 35).length;
  return {
    total,
    withInventory,
    withNetwork,
    withAlerts,
    withProfile,
    inventoryPct: Math.round((withInventory / total) * 100),
    networkPct: Math.round((withNetwork / total) * 100),
    profilePct: Math.round((withProfile / total) * 100)
  };
}

function dashboardHealth() {
  const cache = getDerivedCache();
  if (cache.dashboardHealth) return cache.dashboardHealth;
  const coverage = operationalCoverage();
  const doneTasks = state.tasks.filter((item) => item.done).length;
  const totalTasks = state.tasks.length || 1;
  const openCalls = state.calls.filter((item) => item.status !== 'resolvido').length;
  const score = Math.max(0, Math.min(100,
    Math.round(
      (coverage.importCoverage * 0.2) +
      (coverage.assetCoverage * 0.25) +
      (coverage.profileCoverage * 0.25) +
      (((doneTasks / totalTasks) * 100) * 0.1) +
      (Math.max(0, 100 - (openCalls * 8)) * 0.2)
    )
  ));
  let tone = 'pill-ok';
  let label = 'Base consistente';
  if (score < 70) {
    tone = 'pill-warn';
    label = 'Base em consolidacao';
  }
  if (score < 45) {
    tone = 'pill-danger';
    label = 'Base pedindo organizacao';
  }
  cache.dashboardHealth = { score, tone, label, openCalls };
  return cache.dashboardHealth;
}

function topSchoolSignals(limit = 5) {
  const cache = getDerivedCache();
  if (!cache.topSchoolSignals) {
    cache.topSchoolSignals = visibleSchools()
      .map((school) => ({ school, signal: schoolOperationalSnapshot(school) }))
      .sort((a, b) => b.signal.alertUnits - a.signal.alertUnits || b.signal.openCalls - a.signal.openCalls || a.school.name.localeCompare(b.school.name));
  }
  return cache.topSchoolSignals.slice(0, limit);
}

function operationalSuggestions() {
  const cache = getDerivedCache();
  if (cache.operationalSuggestions) return cache.operationalSuggestions;
  const suggestions = [];
  const coverage = operationalCoverage();
  const health = dashboardHealth();
  const weakestProfile = visibleSchools()
    .map((school) => ({ school, completion: schoolProfileCompletion(school.name) }))
    .filter((item) => item.completion < 35)
    .slice(0, 3);
  if (health.openCalls > 0) {
    suggestions.push(`${health.openCalls} chamado(s) ativo(s): vale fechar a fila antes de abrir nova frente.`);
  }
  if (coverage.profileCoverage < 65) {
    suggestions.push(`So ${coverage.profileCoverage}% das escolas tem ficha minimamente preenchida. Priorize telefone, email e endereco.`);
  }
  if (coverage.activeAlerts > 0) {
    suggestions.push(`${coverage.activeAlerts} item(ns) em manutenção/defeito estão visíveis. Use a tela de ativos para separar manutenção de defeito.`);
  }
  weakestProfile.forEach((item) => {
    suggestions.push(`${item.school.name} esta com ficha em ${item.completion}%: faltam ${schoolMissingProfileFields(item.school.name).slice(0, 3).join(', ')}.`);
  });
  cache.operationalSuggestions = suggestions.slice(0, 5);
  return cache.operationalSuggestions;
}

function buildSummaryPreview() {
  const cache = getDerivedCache();
  if (cache.summaryPreview) return cache.summaryPreview;
  const done = state.tasks.filter((item) => item.done).length;
  const openCalls = state.calls.filter((item) => item.status !== 'resolvido').length;
  const alertAssets = state.assets.filter((item) => item.status !== 'ok').length + state.schoolAssets.filter((item) => item.status !== 'ok').length;
  const focus = nextFocusTask();
  const health = dashboardHealth();
  cache.summaryPreview = [
    `${done}/${state.tasks.length} tarefas concluidas`,
    `${openCalls} chamados ativos`,
    health.label,
    `${alertAssets} ativos em manutenção/defeito`,
    focus ? `proximo foco: ${focus.title}` : 'sem tarefa aberta'
  ].join(' | ');
  return cache.summaryPreview;
}

function syncFilterButtons(kind) {
  if (kind === 'task') {
    document.querySelectorAll('[data-task-filter]').forEach((button) => {
      button.classList.toggle('active-filter', button.dataset.taskFilter === currentTaskFilter);
    });
    return;
  }
  document.querySelectorAll('[data-call-filter]').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.callFilter === currentCallFilter);
  });
  document.querySelectorAll('[data-school-filter]').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.schoolFilter === currentSchoolFilter);
  });
  document.querySelectorAll('[data-directory-filter]').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.directoryFilter === currentDirectoryFilter);
  });
  document.querySelectorAll('[data-asset-filter]').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.assetFilter === currentAssetFilter);
  });
  document.querySelectorAll('[data-import-filter]').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.importFilter === currentImportFilter);
  });
  document.querySelectorAll('[data-inventory-status]').forEach((button) => {
    button.classList.toggle('active-filter', button.dataset.inventoryStatus === currentInventoryStatus);
  });
}

function runGlobalSearch(query) {
  const term = normalizeKey(query);
  if (!term) {
    currentSearchQuery = '';
    currentSchoolSearch = '';
    currentInventorySearch = '';
    currentCallSchoolContext = '';
    currentImportSchoolContext = '';
    renderCurrentPage();
    saveUiContext();
    return;
  }

  const exactSchool = visibleSchools().find((item) =>
    normalizeKey(item.name) === term || normalizeKey(item.cie || '') === term
  );
  if (exactSchool) {
    currentSearchQuery = query.trim();
    currentSchoolSearch = query.trim();
    openSchoolRecord(exactSchool.name);
    saveUiContext();
    return;
  }

  const schoolMatches = visibleSchools().filter((item) =>
    normalizeKey(`${item.name} ${item.cie || ''} ${item.zone} ${item.notes || ''}`).includes(term)
  );
  const inventoryMatches = aggregateInventoryItems(state.schoolAssets).filter((item) =>
    normalizeKey(`${item.school} ${item.name} ${item.brand} ${item.model} ${item.notePreview || ''}`).includes(term)
  );
  const callMatches = state.calls.filter((item) =>
    normalizeKey(`${item.title} ${item.school} ${item.status}`).includes(term)
  );
  const taskMatches = state.tasks.filter((item) =>
    normalizeKey(`${item.title} ${item.place} ${item.category}`).includes(term)
  );
  const generalAssetMatches = state.assets.filter((item) =>
    normalizeKey(`${item.name} ${item.place} ${item.status}`).includes(term)
  );

  currentSearchQuery = query.trim();
  currentSchoolSearch = query.trim();
  currentInventorySearch = '';
  currentCallSchoolContext = '';
  currentImportSchoolContext = '';

  if (schoolMatches.length) {
    showPage('schools');
    renderSchools();
    saveUiContext();
    return;
  }

  if (inventoryMatches.length) {
    const schools = [...new Set(inventoryMatches.map((item) => item.school))];
    currentInventorySearch = query.trim();
    currentInventorySchool = schools.length === 1 ? schools[0] : 'todas';
    showPage('assets');
    renderAssets();
    saveUiContext();
    return;
  }

  if (callMatches.length) {
    const schools = [...new Set(callMatches.map((item) => item.school))];
    currentCallSchoolContext = schools.length === 1 ? schools[0] : '';
    showPage('calls');
    renderCalls();
    saveUiContext();
    return;
  }

  if (taskMatches.length) {
    currentTaskFilter = 'todas';
    syncFilterButtons('task');
    showPage('agenda');
    renderTasks(taskMatches);
    saveUiContext();
    return;
  }

  if (generalAssetMatches.length) {
    showPage('assets');
    renderAssets();
    saveUiContext();
  }
}

function handleSearch(query) {
  currentSearchQuery = query.trim();
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runGlobalSearch(query), 140);
}

function shiftFocusCard(direction) {
  currentViewDate = new Date(currentViewDate.getFullYear(), currentViewDate.getMonth() + direction, 1);
  refreshAll();
}

function applyPrivacy() {
  document.documentElement.dataset.privacy = privacyHidden ? 'hidden' : 'visible';
  document.querySelectorAll('.private').forEach((node) => node.classList.toggle('private-hidden', privacyHidden));
  const button = document.getElementById('privBtn');
  if (button) button.innerHTML = privacyHidden ? '&#128584;' : '&#128065;';
  localStorage.setItem(PRIVACY_KEY, privacyHidden ? '1' : '0');
}

function togglePrivacy() {
  privacyHidden = !privacyHidden;
  applyPrivacy();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const themeButton = document.getElementById('thmBtn');
  if (themeButton) {
    themeButton.innerHTML = theme === 'dark' ? '&#x2600;&#xFE0F;' : '&#x1F319;';
    themeButton.title = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  }
  document.getElementById('themeColorMeta').setAttribute('content', theme === 'dark' ? '#08090d' : '#f4f7ef');
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

function refreshAll() {
  return measurePerf('refreshAll', () => {
    resetDerivedCache();
    measurePerf('saveState', saveState, 8);
    measurePerf('updateIdentity', updateIdentity, 8);
    syncFilterButtons('task');
    syncFilterButtons('call');
    syncFilterButtons('school');
    syncFilterButtons('directory');
    measurePerf('renderSetupStats', renderSetupStats, 8);
    renderCurrentPage();
    measurePerf('applySystemIcons', applySystemIcons, 8);
    measurePerf('applyPrivacy', applyPrivacy, 8);
    if (typeof applyFunAdsMode === 'function') measurePerf('applyFunAdsMode', applyFunAdsMode, 8);
    const searchInput = document.getElementById('sidebarSearch');
    if (searchInput && searchInput.value !== currentSearchQuery) {
      searchInput.value = currentSearchQuery;
    }
    saveUiContext();
  }, 16);
}

function renderCurrentPage(page = currentPage) {
  return measurePerf(`renderCurrentPage:${page}`, () => {
    if (page === 'dashboard') {
      clearTimeout(dashboardDeferredTimer);
      measurePerf('renderDashboardHero', renderDashboardHero, 8);
      measurePerf('renderDashboardAccess', renderDashboardAccess, 8);
      measurePerf('renderPendingQueue', renderPendingQueue, 8);
      measurePerf('renderDashboardOperationalLists', renderDashboardOperationalLists, 8);
      return;
    }
    clearTimeout(dashboardDeferredTimer);
    if (page === 'agenda') {
      renderTimeline();
      renderChecklist();
      renderPonto();
      renderRoutes();
      renderTasks();
      return;
    }
    if (page === 'ctc') {
      renderCtcAgenda();
      return;
    }
    if (page === 'cars') {
      renderCars();
      return;
    }
    if (page === 'calls') {
      renderCalls();
      renderCallHistory();
      return;
    }
    if (page === 'schools') {
      renderSchools();
      return;
    }
    if (page === 'networks') {
      renderNetworksPage();
      return;
    }
    if (page === 'school-record') {
      renderSchoolDetail();
      return;
    }
    if (page === 'supervisors') {
      renderSupervisors();
      return;
    }
    if (page === 'supervisor-record') {
      renderSupervisorRecord();
      return;
    }
    if (page === 'assets') {
      renderAssets();
      return;
    }
    if (page === 'reports') {
      renderReports();
      return;
    }
    if (page === 'info' || page === 'settings') {
      renderMunicipalities();
      renderOfficialData();
      renderSectors();
      renderDirectoryContacts();
      return;
    }
    if (page === 'admin') {
      renderAdminPage();
    }
  }, 16);
}

const SYSTEM_TITLE_ICONS = {
  'Painel': '📊',
  'Agenda compartilhada': '🗓️',
  'Agenda pessoal': '⭐',
  'Nova visita Técnicos CTC': '🚗',
  'Agenda': '📅',
  'Novo agendamento': '➕',
  'Escolas': '🏫',
  'Dados da escola': '🏫',
  'Dados principais': '🪪',
  'Contatos': '☎️',
  'O que olhar agora': '🎯',
  'Resumo técnico': '🧰',
  'Atualizacao da ficha': '✏️',
  'Atualização da ficha': '✏️',
  'Histórico da escola': '🕘',
  'Supervisores': '👥',
  'Painel de supervisores': '📈',
  'Meta mensal': '🎯',
  'Indicadores do supervisor': '📌',
  'Calendário de visitas': '🗓️',
  'Escolas visitadas': '✅',
  'Faltam visitas': '⏳',
  'Todas as escolas vinculadas': '🧭',
  'Registrar visita': '📝',
  'Histórico de visitas': '🕘',
  'Inventário': '💻',
  'Inventário regional': '💻',
  'Recorte': '🔎',
  'Tipos': '🧩',
  'Equipamentos': '🖥️',
  'Manutenção e defeitos': '🛠️',
  'Manutenção do inventário': '🧰',
  'Relatórios e Automação': '📌',
  'Resumo e histórico': '📝',
  'Automacao de redes': '📄',
  'Automação de redes': '📄',
  'Minha conta': '👤',
  'Configurações gerais': '⚙️',
  'Contatos': '☎️',
  'Links oficiais': '🔗',
  'Organograma e setores': '🏢',
  'Ramais e contatos': '☎️',
  'Painel admin': '🔐',
  'Categorias ocultas': '🗂️',
  'Usuários e permissões': '👥',
  'Escolas e vínculos': '🏫',
  'Banco local': '💾',
  'Servidor local': '🖥️',
  'Migração do protótipo': '🚚',
  'Diagnóstico local': '🧪',
  'Importações da base': '📥'
};

SYSTEM_TITLE_ICONS['Contatos'] = '👥';
SYSTEM_TITLE_ICONS['Ramais e contatos'] = '👥';
SYSTEM_TITLE_ICONS['Supervisores'] = '🧭';
SYSTEM_TITLE_ICONS['Painel de supervisores'] = '🧭';

function applySystemIcons() {
  document.querySelectorAll('.pt, .ct, #inventoryHeroTitle').forEach((node) => {
    const raw = String(node.textContent || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const icon = SYSTEM_TITLE_ICONS[raw];
    if (!icon || String(node.textContent || '').trim().startsWith(icon)) return;
    node.textContent = `${icon} ${raw}`;
  });
}
