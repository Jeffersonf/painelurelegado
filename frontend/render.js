'use strict';

const MUNICIPALITY_AVATAR_COLORS = {
  itapeva: ['#5af5c8', '#2f80ed'],
  'capao bonito': ['#c8f55a', '#3f7d00'],
  'ribeirao grande': ['#a78bfa', '#5b4bd8'],
  'nova campina': ['#f5c85a', '#b7791f'],
  buri: ['#f5705a', '#b93326'],
  taquarivai: ['#78b4ff', '#007a61']
};

function schoolAvatarInitials(name) {
  const ignored = new Set(['pei', 'ee', 'e', 'emef', 'em', 'prof', 'professor', 'professora', 'doutor', 'doutora', 'dr', 'dra', 'padre', 'bairro', 'escola', 'estadual', 'municipal']);
  const parts = normalizeKey(name)
    .split(/\s+/)
    .filter((part) => part && !ignored.has(part) && part.length > 1)
    .slice(0, 2);
  if (!parts.length) return 'EE';
  return parts.map((part) => part[0]).join('').toUpperCase();
}

function municipalityAvatarPalette(zone) {
  const key = normalizeKey(zone);
  if (MUNICIPALITY_AVATAR_COLORS[key]) return MUNICIPALITY_AVATAR_COLORS[key];
  let hash = 0;
  for (const char of key) hash = ((hash << 5) - hash) + char.charCodeAt(0);
  const hue = Math.abs(hash) % 360;
  return [`hsl(${hue} 78% 64%)`, `hsl(${(hue + 28) % 360} 62% 38%)`];
}

function schoolAvatarStyle(school) {
  const [from, to] = municipalityAvatarPalette(school?.zone || '');
  return `--school-avatar-a:${from};--school-avatar-b:${to};`;
}

function schoolDisplayNotes(notes) {
  const text = String(notes || '').trim();
  return normalizeKey(text) === normalizeKey('Unidade oficial da URE Itapeva.') ? '' : text;
}

function inventorySchoolSupervisorNames(schoolName) {
  return (state.supervisors || [])
    .filter((supervisor) => (supervisor.schools || []).includes(schoolName))
    .map((supervisor) => supervisor.name);
}

function inventorySchoolMatchesSupervisor(schoolName) {
  if (currentInventorySupervisor === 'todos') return true;
  return inventorySchoolSupervisorNames(schoolName)
    .some((name) => normalizeKey(name) === currentInventorySupervisor);
}

const INVENTORY_MATRIX_COLUMNS = [
  ['tablets', 'Tablet'],
  ['netbooks', 'Netbook'],
  ['pc_adm', 'PC adm'],
  ['pc_pedagogico', 'PC pedag.'],
  ['notebooks', 'Notebook'],
  ['smartphone', 'Celular'],
  ['outros', 'Outros']
];

function renderDashboardHero() {
  const title = document.getElementById('dashboardHeroTitle');
  const text = document.getElementById('dashboardHeroText');
  const actions = document.getElementById('dashboardHeroActions');
  const scoreNode = document.getElementById('dashboardHeroScore');
  const statsNode = document.getElementById('dashboardHeroStats');
  if (!title || !text || !actions || !scoreNode || !statsNode) return;

  const coverage = operationalCoverage();
  const focus = nextFocusTask();
  const template = dashboardTemplateForRole();
  const openCalls = state.calls.filter((item) => item.status !== 'resolvido').length;
  const attentionSchools = visibleSchools().filter((item) => item.status !== 'estavel').length;
  const alertAssets = state.assets.filter((item) => item.status !== 'ok').length + state.schoolAssets.filter((item) => item.status !== 'ok').length;
  const pendingItems = pendingQueueItems(99).length;

  title.textContent = template.title;
  text.textContent = focus
    ? `${template.subtitle} Proximo compromisso: ${focus.title} | ${focus.place || 'sem local'} | ${focus.time || 'sem horario'}.`
    : `${template.subtitle} Dados consolidados para escolas, inventario, supervisao e calendario da URE.`;

  const actionItems = template.actions
    .filter((item) => canAccessPage(item.page) && (!item.role || item.role === currentUserRole()) && (item.tone !== 'edit' || canEditData()));

  actions.innerHTML = actionItems.map((item) => `
    <button class="btn ${item.tone === 'primary' ? 'btn-p' : 'btn-g'} btn-sm" type="button" onclick="${item.action}">${item.label}</button>
  `).join('');

  scoreNode.hidden = true;
  scoreNode.innerHTML = '';

  statsNode.innerHTML = [
    { label: template.metrics[0]?.label || 'Escolas', value: template.metrics[0]?.value ?? String(visibleSchools().length), tone: template.metrics[0]?.tone || 'pill-info' },
    { label: template.metrics[1]?.label || 'Inventario', value: template.metrics[1]?.value ?? String(alertAssets), tone: template.metrics[1]?.tone || (alertAssets ? 'pill-danger' : 'pill-ok') },
    { label: template.metrics[2]?.label || 'Agenda URE', value: template.metrics[2]?.value ?? String(pendingItems), tone: template.metrics[2]?.tone || 'pill-info' },
    { label: template.metrics[3]?.label || 'Fichas', value: template.metrics[3]?.value ?? `${coverage.profileCoverage}%`, tone: template.metrics[3]?.tone || (coverage.profileCoverage >= 65 ? 'pill-ok' : 'pill-warn') }
  ].map((item) => `
    <div class="dashboard-hero-stat">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <i class="diag-pill ${item.tone}"></i>
    </div>
  `).join('');
}

function dashboardTemplateForRole() {
  const role = currentUserRole();
  const schools = visibleSchools();
  const supervisorRows = supervisorStats();
  const schoolAlerts = schools.filter((school) => school.status !== 'estavel' || schoolAlertUnits(school.name) > 0).length;
  const inventoryAlerts = aggregateInventoryItems(state.schoolAssets).filter((item) => canViewSchool(item.school) && item.alertUnits > 0).length;
  const ctcTasks = (state.tasks || []).filter((item) => normalizeKey(item.category).includes('ctc') && !item.done).length;
  const sharedAgenda = (state.tasks || []).filter((item) => !item.done && (item.scope === 'ure' || item.scope === 'carro')).length;
  const monthlyVisits = supervisorRows.reduce((sum, item) => sum + Number(item.supervisor.monthlyVisits || item.visits || 0), 0);
  const activeCalls = (state.calls || []).filter((item) => item.status !== 'resolvido' && canViewSchool(item.school)).length;
  const baseActions = {
    schools: { label: 'Abrir escolas', action: `showPage('schools')`, page: 'schools', tone: 'primary' },
    inventory: { label: 'Abrir inventário', action: `openInventoryCategory()`, page: 'assets', tone: 'primary' },
    supervisors: { label: 'Abrir supervisão', action: `showPage('supervisors')`, page: 'supervisors', tone: 'primary' },
    ctc: { label: 'Abrir Técnicos CTC', action: `openCtcAgenda()`, page: 'ctc', tone: 'primary', role: 'ctc' },
    agenda: { label: 'Ver calendário URE', action: `showPage('agenda')`, page: 'agenda', tone: '' },
    contacts: { label: 'Abrir contatos', action: `showPage('info')`, page: 'info', tone: '' },
    admin: { label: 'Administração', action: `showPage('admin')`, page: 'admin', tone: 'edit' }
  };
  const common = {
    title: `Painel ${roleDisplay(role)}`,
    subtitle: 'Visão operacional conforme seu perfil.',
    actions: [baseActions.schools, baseActions.inventory, baseActions.agenda],
    metrics: [
      { label: 'Escolas', value: String(schools.length), tone: 'pill-info' },
      { label: 'Supervisores', value: String(supervisorRows.length), tone: 'pill-info' },
      { label: 'Calendário URE', value: String(sharedAgenda), tone: sharedAgenda ? 'pill-info' : 'pill-ok' },
      { label: 'Inventário', value: String(inventoryAlerts), tone: inventoryAlerts ? 'pill-danger' : 'pill-ok' }
    ]
  };
  if (role === 'admin' || role === 'seintec') {
    return {
      ...common,
      title: role === 'admin' ? 'Painel de gestão regional' : 'Painel SEINTEC',
      subtitle: 'Controle amplo de escolas, inventário, supervisão, técnicos e calendário geral da URE.',
      actions: [baseActions.schools, baseActions.inventory, baseActions.supervisors, baseActions.agenda, baseActions.admin],
      metrics: [
        { label: 'Escolas', value: String(state.schools.length), tone: 'pill-info' },
        { label: 'Inventario', value: String(inventoryAlerts), tone: inventoryAlerts ? 'pill-danger' : 'pill-ok' },
        { label: 'Supervisores', value: String(supervisorRows.length), tone: 'pill-info' },
        { label: 'Agenda URE', value: String(sharedAgenda), tone: sharedAgenda ? 'pill-info' : 'pill-ok' }
      ]
    };
  }
  if (role === 'ctc') {
    return {
      ...common,
      title: 'Painel Técnicos CTC',
      subtitle: 'Agenda técnica, escolas consultáveis e calendário geral da URE no mesmo lugar.',
      actions: [baseActions.ctc, baseActions.agenda, baseActions.schools, baseActions.contacts],
      metrics: [
        { label: 'Visitas CTC', value: String(ctcTasks), tone: ctcTasks ? 'pill-warn' : 'pill-ok' },
        { label: 'Escolas', value: String(schools.length), tone: 'pill-info' },
        { label: 'Agenda URE', value: String(sharedAgenda), tone: sharedAgenda ? 'pill-info' : 'pill-ok' },
        { label: 'Inventario', value: String(inventoryAlerts), tone: inventoryAlerts ? 'pill-danger' : 'pill-ok' }
      ]
    };
  }
  if (role === 'supervisor') {
    return {
      ...common,
      title: 'Painel de supervisão',
      subtitle: 'Resumo das escolas vinculadas, visitas, metas e calendário geral da URE.',
      actions: [baseActions.supervisors, baseActions.schools, baseActions.agenda, baseActions.contacts],
      metrics: [
        { label: 'Minhas escolas', value: String(schools.length), tone: 'pill-info' },
        { label: 'Visitas mês', value: String(monthlyVisits), tone: monthlyVisits ? 'pill-ok' : 'pill-warn' },
        { label: 'Inventario', value: String(inventoryAlerts), tone: inventoryAlerts ? 'pill-danger' : 'pill-ok' },
        { label: 'Calendário URE', value: String(sharedAgenda), tone: sharedAgenda ? 'pill-info' : 'pill-ok' }
      ]
    };
  }
  if (role === 'seom') {
    return {
      ...common,
      title: 'Painel SEOM',
      subtitle: 'Foco em escolas, manutenção, inventário de infraestrutura e calendário geral da URE.',
      actions: [baseActions.schools, baseActions.inventory, baseActions.agenda, baseActions.contacts],
      metrics: [
        { label: 'Escolas', value: String(schools.length), tone: 'pill-info' },
        { label: 'Manut./defeito', value: String(inventoryAlerts), tone: inventoryAlerts ? 'pill-danger' : 'pill-ok' },
        { label: 'Chamados', value: String(activeCalls), tone: activeCalls ? 'pill-warn' : 'pill-ok' },
        { label: 'Calendário URE', value: String(sharedAgenda), tone: sharedAgenda ? 'pill-info' : 'pill-ok' }
      ]
    };
  }
  if (role === 'pec') {
    return {
      ...common,
      title: 'Painel PEC',
      subtitle: 'Acesso rápido aos contatos e calendário geral da URE.',
      actions: [baseActions.contacts, baseActions.agenda],
      metrics: [
        { label: 'Contatos', value: String(filteredDirectoryContacts(true).length), tone: 'pill-info' },
        { label: 'Calendário URE', value: String(sharedAgenda), tone: sharedAgenda ? 'pill-info' : 'pill-ok' },
        { label: 'Perfil', value: 'PEC', tone: 'pill-ok' },
        { label: 'Consulta', value: 'URE', tone: 'pill-info' }
      ]
    };
  }
  return common;
}

function renderOperationsCenter() {
  const health = dashboardHealth();
  const coverage = operationalCoverage();
  const topSignals = topSchoolSignals();
  const suggestions = operationalSuggestions();
  const healthNode = document.getElementById('opsHealthPanel');
  const coverageNode = document.getElementById('coverageGrid');
  const signalNode = document.getElementById('opsSignalList');
  const suggestionNode = document.getElementById('opsSuggestionList');
  if (healthNode) {
    healthNode.innerHTML = `
      <div class="setechub-command-score">
        <div>
          <div class="sync-meta">Índice operacional</div>
          <strong>${esc(String(health.score))}%</strong>
        </div>
        <span class="diag-pill ${health.tone}">${esc(health.label)}</span>
      </div>
      <div class="sync-meta">Base atualizada em ${esc(timestampLabel(new Date(state.lastUpdatedAt || Date.now())))} com foco em rotina e organização.</div>
    `;
  }
  if (coverageNode) {
    coverageNode.innerHTML = [
      { label: 'Escolas com inventário', value: `${coverage.assetCoverage}%`, note: `${coverage.schoolsWithAssets}/${coverage.totalSchools} unidades` },
      { label: 'Fichas preenchidas', value: `${coverage.profileCoverage}%`, note: `${coverage.schoolsWithProfile}/${coverage.totalSchools} unidades` },
      { label: 'Manutenção/defeito', value: String(coverage.activeAlerts), note: 'itens com status registrado' }
    ].map((item) => `
      <div class="setechub-monitor-card compact">
        <div class="sync-meta">${esc(item.label)}</div>
        <strong>${esc(item.value)}</strong>
        <div class="diag-pill">${esc(item.note)}</div>
      </div>
    `).join('');
  }
  if (signalNode) {
    signalNode.innerHTML = topSignals.map(({ school, signal }) => `
      <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(school.name)}')">
        <div class="setechub-head">
          <div>
            <strong>${esc(school.name)}</strong>
            <div class="sync-meta">${esc(school.zone)} | ficha ${esc(String(signal.completion))}% | ${esc(String(signal.imports))} importação(ões)</div>
          </div>
          <div class="setechub-badges">
            <span class="diag-pill ${toneBySchool(school.status)}">${esc(badgeText(school.status))}</span>
            <span class="diag-pill ${signal.alertUnits ? 'pill-danger' : 'pill-info'}">${esc(String(signal.alertUnits))} manut./defeito</span>
          </div>
        </div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhum sinal operacional relevante ainda.</div>';
  }
  if (suggestionNode) {
    suggestionNode.innerHTML = suggestions.map((text) => `
      <div class="setechub-item">
        <strong>Ação sugerida</strong>
        <div class="sync-meta">${esc(text)}</div>
      </div>
    `).join('') || '<div class="sync-empty">A base já parece organizada para o uso atual.</div>';
  }
}

function renderDashboardAccess() {
  const profileNode = document.getElementById('dashboardProfileSummary');
  const roleCardsNode = document.getElementById('dashboardRoleCards');
  const attentionNode = document.getElementById('dashboardAttentionCards');
  const categoryNode = document.getElementById('dashboardCategoryGrid');
  const linksNode = document.getElementById('dashboardQuickLinks');
  const drilldownNode = document.getElementById('dashboardDrilldownGrid');
  const categoryBox = document.getElementById('dashboardCategoryBox');
  const quickBox = document.getElementById('dashboardQuickBox');
  const drilldownBox = document.getElementById('dashboardDrilldownBox');

  if (VIEWER_MODE_V1) {
    [profileNode, roleCardsNode, attentionNode, quickBox, drilldownBox].forEach((node) => {
      if (!node) return;
      node.hidden = true;
      node.innerHTML = '';
    });
    if (linksNode) linksNode.innerHTML = '';
    if (drilldownNode) drilldownNode.innerHTML = '';

    const role = currentUserRole();
    const schools = visibleSchools();
    const schoolAlertCount = schools.filter((item) => item.status !== 'estavel').length;
    const inventoryAlertCount = state.schoolAssets.filter((item) => item.status !== 'ok').length;
    const ctcTasks = (state.tasks || []).filter((item) => normalizeKey(item.category).includes('ctc') && !item.done).length;
    const carTasks = (state.tasks || []).filter((item) => item.scope === 'carro' || item.category === 'Carro oficial').length;
    const allModules = [
      { icon: '&#127979;', title: 'Escolas', meta: `${schools.length} unidades cadastradas`, action: `showPage('schools')`, page: 'schools', key: 'schools', tone: 'lime', priority: 'primary' },
      { icon: '&#128187;', title: 'Inventário', meta: `${inventoryAlertCount} alerta(s)`, action: `openInventoryCategory()`, page: 'assets', tone: 'teal', priority: 'primary' },
      { icon: '&#127760;', title: 'Redes e Cameras', meta: `${state.schoolNetworks.length} escolas com dados`, action: `showPage('networks')`, page: 'networks', key: 'networks', tone: 'amber', priority: 'primary' },
      { icon: '&#129517;', title: 'Supervisores', meta: `${visibleSupervisors().length} no painel`, action: `showPage('supervisors')`, page: 'supervisors', tone: 'blue', priority: 'primary' },
      { icon: '&#128736;', title: 'Técnicos CTC', meta: ctcTasks ? `${ctcTasks} visita(s)` : 'agenda de visitas', action: `openCtcAgenda()`, page: 'ctc', tone: 'amber', priority: 'secondary' },
      { icon: '&#128663;', title: 'Carros', meta: carTasks ? `${carTasks} reserva(s)` : 'ReservasVeiculos', action: `openCarSchedule()`, page: 'cars', key: 'cars', tone: 'teal', priority: 'secondary' },
      { icon: '&#128197;', title: 'Agenda', meta: 'compromissos e frota', action: `showPage('agenda')`, page: 'agenda', tone: 'slate', priority: 'secondary' },
      { icon: '&#128101;', title: 'Contatos', meta: 'ramais e setores', action: `showPage('info')`, page: 'info', tone: 'slate', priority: 'secondary' },
      { icon: '&#9881;', title: 'Admin', meta: 'backup e importações', action: `showPage('admin')`, page: 'admin', tone: 'red', priority: 'secondary' }
    ];
    const rolePages = {
      admin: ['schools', 'assets', 'supervisors', 'ctc', 'cars', 'agenda', 'admin'],
      seintec: ['schools', 'assets', 'supervisors', 'cars', 'agenda', 'admin'],
      ctc: ['ctc', 'cars', 'agenda', 'schools', 'info'],
      supervisor: ['supervisors', 'schools', 'cars', 'agenda', 'info'],
      seom: ['schools', 'assets', 'cars', 'agenda', 'info'],
      dirigente: ['schools', 'assets', 'supervisors', 'ctc', 'cars', 'agenda', 'info'],
      pec: ['info', 'agenda']
    };
    const modules = allModules
      .filter((item) => (rolePages[role] || rolePages.admin).includes(item.key || item.page))
      .filter((item) => canAccessPage(item.page));

    if (categoryBox) categoryBox.hidden = !modules.length;
    if (categoryNode) {
      categoryNode.innerHTML = modules.map((item) => `
        <button class="dashboard-category-card category-${esc(item.key || item.page)} ${item.tone} ${item.priority}" type="button" onclick="${item.action}">
          <strong><span class="category-emoji">${item.icon}</span>${esc(item.title)}</strong>
          <span>${esc(item.meta)}</span>
        </button>
      `).join('') || '<div class="sync-empty">Nenhum módulo disponível para este perfil.</div>';
    }
    return;
  }

  if (profileNode || roleCardsNode || attentionNode) {
    renderRoleDashboard(profileNode, roleCardsNode, attentionNode);
  }

  const schools = visibleSchools();
  const schoolAlertCount = schools.filter((item) => item.status !== 'estavel').length;
  const inventoryAlertCount = state.schoolAssets.filter((item) => item.status !== 'ok').length;
  const networkCount = state.schoolNetworks.length;
  const cameraSchoolCount = state.schoolNetworks.filter((item) => Number(item.cameraInstalled || 0) > 0 || item.cameraInstalledLabel).length;
  const ctcUsers = (state.users || []).filter((item) => item.role === 'ctc' && item.active !== false);
  const ctcTasks = (state.tasks || []).filter((item) => normalizeKey(item.category).includes('ctc') && !item.done).length;
  const attentionSchools = schools.filter((item) => item.status !== 'estavel').length;
  const noProfileSchools = schools.filter((item) => schoolProfileCompletion(item.name) < 35).length;
  const noNetworkSchools = schools.filter((item) => !schoolNetworkRecord(item.name)).length;
  const unresolvedCalls = state.calls.filter((item) => item.status === 'aberto').length;
  const routeCalls = state.calls.filter((item) => item.status === 'em_rota').length;
  const categories = [
    { icon: '&#127979;', title: 'Escolas', meta: `${schools.length} bases cadastradas`, action: `showPage('schools')`, page: 'schools', key: 'schools', tone: 'lime', priority: 'primary' },
    { icon: '&#128187;', title: 'Inventário', meta: `${state.schoolAssets.length} linhas | ${inventoryAlertCount} manut./defeito`, action: `openInventoryCategory()`, page: 'assets', tone: 'teal', priority: 'primary' },
    { icon: '&#127760;', title: 'Redes e Cameras', meta: `${networkCount} escolas com dados | ${cameraSchoolCount} com cameras`, action: `showPage('networks')`, page: 'networks', key: 'networks', tone: 'amber', priority: 'primary' },
    { icon: '&#128736;', title: 'Técnicos CTC', meta: `${ctcUsers.length} usuários | ${ctcTasks} visita(s) programada(s)`, action: `openCtcAgenda()`, page: 'ctc', tone: 'teal', priority: 'secondary', alwaysVisible: true },
    { icon: '&#127891;', title: 'PECs', meta: 'módulo dormente', page: 'pecs', tone: 'blue', priority: 'secondary', inactive: true },
    { icon: '&#128222;', title: 'Atendimentos', meta: 'pausado por enquanto', page: 'calls', tone: 'red', priority: 'secondary', inactive: true },
    { icon: '&#9201;', title: 'Ponto', meta: 'pausado por enquanto', page: 'agenda', tone: 'slate', priority: 'secondary', inactive: true },
    { icon: '&#128221;', title: 'Relatórios', meta: `resumo, notas e redes`, action: `showPage('reports')`, page: 'reports', tone: 'slate', priority: 'secondary' }
  ].filter((item) => item.inactive || item.alwaysVisible || canAccessPage(item.page));
  if (categoryBox) categoryBox.hidden = !categories.length;
  if (categoryNode) {
    categoryNode.innerHTML = categories.map((item) => `
      <button class="dashboard-category-card category-${esc(item.key || item.page)} ${item.tone} ${item.priority} ${item.inactive ? 'is-inactive' : ''}" type="button" ${item.inactive ? 'disabled' : `onclick="${item.action}"`}>
        <strong><span class="category-emoji">${item.icon}</span>${esc(item.title)}</strong>
        <span>${esc(item.meta)}</span>
      </button>
    `).join('') || '<div class="sync-empty">Nenhuma categoria disponível para este perfil.</div>';
  }
  if (linksNode) {
    const topSchools = topSchoolSignals(3);
    const topCalls = topOpenCalls(3);
    const topAssets = topInventoryAlerts(3);
    const quickItems = [
      ...(canAccessPage('schools') ? topSchools.map(({ school, signal }) => `
        <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(school.name)}')">
          <strong>Escola</strong>
          <div class="sync-meta">${esc(school.name)} | CIE ${esc(school.cie || '--')} | ${esc(String(signal.alertUnits))} manut./defeito | ${esc(String(signal.assetUnits))} unid.</div>
        </div>
      `) : []),
      ...(canAccessPage('assets') ? topAssets.map((item) => `
        <div class="setechub-item setechub-clickable" onclick="setInventorySchool('${esc(item.school)}')">
          <strong>Inventário</strong>
          <div class="sync-meta">${esc(item.school)} | ${esc(item.name)} | ${esc(String(item.alertUnits))} manut./defeito</div>
        </div>
      `) : []),
      ...(canAccessPage('calls') ? topCalls.map((item) => `
        <div class="setechub-item setechub-clickable" onclick="openSchoolCalls('${esc(item.school)}')">
          <strong>Chamado</strong>
          <div class="sync-meta">${esc(item.school)} | ${esc(item.title)} | ${esc(badgeText(item.status))}</div>
        </div>
      `) : []),
    ];
    if (quickBox) quickBox.hidden = !quickItems.length;
    linksNode.innerHTML = quickItems.join('') || '<div class="sync-empty">Nenhum atalho rápido disponível ainda.</div>';
  }
  if (drilldownNode) {
    const cards = [
      { title: 'Base consistente', meta: `${schools.length} escola(s)`, action: `showPage('schools')`, page: 'schools', tone: 'lime' },
      { title: 'Escolas sem ficha', meta: `${noProfileSchools} escola(s)`, action: `openSchoolCategory('sem_ficha')`, page: 'schools', tone: 'amber' },
      { title: 'Escolas com alerta', meta: `${schoolAlertCount} escola(s)`, action: `openSchoolCategory('com_alerta')`, page: 'schools', tone: 'lime' },
      { title: 'Inventário com defeito', meta: `${aggregateInventoryItems(state.schoolAssets).filter((item) => item.defectUnits > 0).length} tipo(s)`, action: `openInventoryCategory('criticos')`, page: 'assets', tone: 'red' },
      { title: 'Infra de rede', meta: `${aggregateInventoryItems(state.schoolAssets).filter((item) => item.category === 'infra').length} tipo(s)`, action: `openInventoryCategory('todos', 'infra')`, page: 'assets', tone: 'blue' },
      { title: 'Chamados abertos', meta: `${unresolvedCalls} item(ns)`, action: `openCallCategory('aberto')`, page: 'calls', tone: 'red' },
      { title: 'Chamados em rota', meta: `${routeCalls} item(ns)`, action: `openCallCategory('em_rota')`, page: 'calls', tone: 'teal' },
      { title: 'Sem rede/câmeras', meta: `${noNetworkSchools} escola(s)`, action: `openSchoolCategory('sem_rede')`, page: 'schools', tone: 'amber' }
    ].filter((item) => canAccessPage(item.page));
    if (drilldownBox) drilldownBox.hidden = !cards.length;
    drilldownNode.innerHTML = cards.map((item) => `
      <button class="dashboard-drill-card ${item.tone}" type="button" onclick="${item.action}">
        <strong>${esc(item.title)}</strong>
        <span>${esc(item.meta)}</span>
      </button>
    `).join('') || '<div class="sync-empty">Nenhum recorte disponível para este perfil.</div>';
  }
}

function networkCredentialAccess() {
  return ['admin', 'seintec', 'ctc'].includes(currentUserRole()) || canManageUsers();
}

function networkValue(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').trim();
  return text || '--';
}

function networkWidget(title, value, meta = '', tone = '') {
  return `
    <div class="network-widget ${tone}">
      <span>${esc(title)}</span>
      <strong>${esc(networkValue(value))}</strong>
      ${meta ? `<small>${esc(meta)}</small>` : ''}
    </div>
  `;
}

function renderNetworksPage() {
  const summaryNode = document.getElementById('networkSummaryGrid');
  const tableNode = document.getElementById('networkTable');
  const selectNode = document.getElementById('networkSchoolSelect');
  const detailNode = document.getElementById('networkDetailGrid');
  const emptyNode = document.getElementById('networkEmptyState');
  if (!summaryNode || !tableNode || !selectNode || !detailNode || !emptyNode) return;

  const schools = visibleSchools().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  const rows = schools.map((school) => ({ school, network: schoolNetworkRecord(school.name) }));
  const withNetwork = rows.filter((row) => row.network).length;
  const withCameras = rows.filter((row) => row.network && (Number(row.network.cameraInstalled || 0) > 0 || row.network.cameraInstalledLabel)).length;
  const withIssue = rows.filter((row) => row.network && row.network.status && row.network.status !== 'ok').length;
  const canSeeCredentials = networkCredentialAccess();

  summaryNode.innerHTML = [
    { label: 'Escolas', value: String(schools.length), note: 'base visivel' },
    { label: 'Com rede', value: String(withNetwork), note: 'dados importados' },
    { label: 'Com cameras', value: String(withCameras), note: 'DVR/cameras informados' },
    { label: 'Pendencias', value: String(withIssue), note: 'status diferente de ok' }
  ].map((item) => `
    <div class="dashboard-profile-card">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <small>${esc(item.note)}</small>
    </div>
  `).join('');

  if (!currentNetworkSchool || !schools.some((school) => school.name === currentNetworkSchool)) {
    currentNetworkSchool = rows.find((row) => row.network)?.school.name || schools[0]?.name || '';
  }
  selectNode.innerHTML = schools.map((school) => `<option value="${esc(school.name)}">${esc(school.name)} | ${esc(school.zone || '--')}</option>`).join('');
  selectNode.value = currentNetworkSchool;

  const selectedSchool = schools.find((school) => school.name === currentNetworkSchool) || schools[0] || null;
  const network = selectedSchool ? schoolNetworkRecord(selectedSchool.name) : null;
  emptyNode.hidden = !!network;
  emptyNode.textContent = network ? '' : 'Esta escola ainda nao tem dados importados de redes e cameras.';
  detailNode.innerHTML = selectedSchool ? `
    <section class="network-focus-hero">
      <div>
        <span class="dashboard-command-kicker">Unidade selecionada</span>
        <h2>${esc(selectedSchool.name)}</h2>
        <p>${esc(selectedSchool.zone || '--')} | CIE ${esc(selectedSchool.cie || network?.cie || '--')}</p>
      </div>
      <span class="diag-pill ${toneBySchool(network?.status === 'defeito' ? 'critico' : network?.status === 'manutencao' ? 'atencao' : 'estavel')}">${esc(network ? badgeText(network.status || 'ok') : 'sem dados')}</span>
    </section>
    <section class="network-widget-grid">
      ${networkWidget('Rede ADM', network?.adminNetwork, `Gateway ${networkValue(network?.adminGateway)} | Mascara ${networkValue(network?.adminMask)}`, 'lime')}
      ${networkWidget('Rede PED', network?.pedNetwork, `Gateway ${networkValue(network?.pedGateway)} | Mascara ${networkValue(network?.pedMask)}`, 'teal')}
      ${networkWidget('Banda', network?.bandwidth, `Firewall ${networkValue(network?.firewallModel)}`, 'blue')}
      ${networkWidget('Wi-Fi', network?.wifi, `Tecnico ${networkValue(network?.technicians)}`, 'slate')}
    </section>
    <section class="network-info-layout">
      <div class="box network-info-card">
        <div class="bh"><div><div class="ct">Informacoes sobre IPs</div><div class="cs">Gateways, DNS e enderecos dos DVRs.</div></div></div>
        <div class="network-chip-list">
          <span>DNS primario <strong>${esc(networkValue(network?.dnsPrimary))}</strong></span>
          <span>DNS secundario <strong>${esc(networkValue(network?.dnsSecondary))}</strong></span>
          <span>DVR ADM 1 <strong>${esc(networkValue(network?.videoDvr1))}</strong></span>
          <span>DVR ADM 2 <strong>${esc(networkValue(network?.videoDvr2))}</strong></span>
          <span>DVR ADM 3 <strong>${esc(networkValue(network?.videoDvr3))}</strong></span>
          <span>Alarme ADM <strong>${esc(networkValue(network?.videoAlarm))}</strong></span>
          <span>DVR PED 1 <strong>${esc(networkValue(network?.pedVideoDvr1))}</strong></span>
          <span>DVR PED 2 <strong>${esc(networkValue(network?.pedVideoDvr2))}</strong></span>
          <span>DVR PED 3 <strong>${esc(networkValue(network?.pedVideoDvr3))}</strong></span>
          <span>Alarme PED <strong>${esc(networkValue(network?.pedVideoAlarm))}</strong></span>
        </div>
      </div>
      <div class="box network-info-card">
        <div class="bh"><div><div class="ct">Informacoes sobre cameras</div><div class="cs">DVR, funcionamento e acesso.</div></div></div>
        <div class="network-camera-panel">
          <div>
            <span>Cameras instaladas</span>
            <strong>${esc(networkValue(network?.cameraInstalledLabel || network?.cameraInstalled))}</strong>
          </div>
          <div>
            <span>Cameras funcionando</span>
            <strong>${esc(networkValue(network?.cameraWorkingLabel || network?.cameraWorking))}</strong>
          </div>
          <div>
            <span>Marca DVR</span>
            <strong>${esc(networkValue(network?.dvrBrand))}</strong>
          </div>
          ${networkCredentialAccess() ? `
            <div>
              <span>Usuario DVR</span>
              <strong>${esc(networkValue(network?.dvrUser))}</strong>
            </div>
            <div>
              <span>Senha DVR</span>
              <strong>${esc(networkValue(network?.password))}</strong>
            </div>
          ` : ''}
          <small>Espelhamento: ${esc(networkValue(network?.mirroringDate))}</small>
        </div>
      </div>
    </section>
  ` : '';

  tableNode.innerHTML = `
    <table class="supervisor-sheet-table network-sheet-table">
      <thead>
        <tr>
          <th>Escola</th>
          <th>Redes</th>
          <th>IPs</th>
          <th>Cameras</th>
          ${canSeeCredentials ? '<th>Acesso DVR</th>' : ''}
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ school, network }) => {
          const installed = network?.cameraInstalledLabel || (network?.cameraInstalled ? `${network.cameraInstalled} instaladas` : '--');
          const working = network?.cameraWorkingLabel || (network?.cameraWorking ? `${network.cameraWorking} funcionando` : '--');
          return `
            <tr>
              <td>
                <strong>${esc(school.name)}</strong>
                <div class="sync-meta">${esc(school.zone || '--')} | CIE ${esc(school.cie || network?.cie || '--')}</div>
              </td>
              <td>
                <strong>ADM ${esc(networkValue(network?.adminNetwork))}</strong>
                <div class="sync-meta">PED ${esc(networkValue(network?.pedNetwork))}</div>
                <div class="sync-meta">Banda ${esc(networkValue(network?.bandwidth))} | Firewall ${esc(networkValue(network?.firewallModel))}</div>
              </td>
              <td>
                <div class="sync-meta">Gateway ADM ${esc(networkValue(network?.adminGateway))}</div>
                <div class="sync-meta">Gateway PED ${esc(networkValue(network?.pedGateway))}</div>
                <div class="sync-meta">DNS ${esc(networkValue([network?.dnsPrimary, network?.dnsSecondary]))}</div>
                <div class="sync-meta">DVR ${esc(networkValue([network?.videoDvr1, network?.videoDvr2, network?.videoDvr3]))}</div>
              </td>
              <td>
                <strong>${esc(installed)}</strong>
                <div class="sync-meta">${esc(working)}</div>
                <div class="sync-meta">Marca ${esc(networkValue(network?.dvrBrand))}</div>
              </td>
              ${canSeeCredentials ? `
                <td>
                  <strong>${esc(networkValue(network?.dvrUser))}</strong>
                  <div class="sync-meta">${esc(networkValue(network?.password))}</div>
                </td>
              ` : ''}
              <td>
                <span class="diag-pill ${toneBySchool(network?.status === 'defeito' ? 'critico' : network?.status === 'manutencao' ? 'atencao' : 'estavel')}">${esc(network ? badgeText(network.status || 'ok') : 'sem dados')}</span>
                <div class="sync-meta">${esc(networkValue(network?.mirroringDate))}</div>
                <div class="sync-meta">${esc(networkValue(network?.technicians))}</div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderDashboardOperationalLists() {
  const inventoryNode = document.getElementById('dashboardInventoryAlerts');
  const callsNode = document.getElementById('dashboardCallQueue');
  const sharedAgendaNode = document.getElementById('dashboardSharedAgenda');
  const personalAgendaNode = document.getElementById('dashboardPersonalAgenda');
  const sharedAgendaListNode = document.getElementById('dashboardSharedAgendaList');
  const personalAgendaListNode = document.getElementById('dashboardPersonalAgendaList');
  document.querySelector('.dashboard-calendar-head')?.removeAttribute('hidden');
  document.querySelector('.dashboard-calendar-panel')?.removeAttribute('hidden');
  const inventoryRows = topInventoryAlerts(5);
  const callRows = topOpenCalls(5);
  const renderAgendaRows = (rows, emptyText) => rows.slice(0, 6).map((task) => `
    <div class="setechub-item setechub-clickable" onclick="showPage('agenda')">
      <div class="setechub-head">
        <div>
          <strong>${esc(task.scope === 'carro' ? `${task.vehicle || 'Carro oficial'} - ${task.owner || 'Frota'}` : task.title)}</strong>
          <div class="sync-meta">${esc(task.date)} | ${esc(task.time || 'Sem horário')} | ${esc(task.place || 'Sem local')}</div>
        </div>
        <span class="diag-pill ${task.scope === 'carro' ? 'pill-info' : task.scope === 'ure' ? 'pill-ok' : 'pill-warn'}">${esc(task.scope === 'carro' ? 'Carro' : task.scope === 'ure' ? 'URE' : 'Pessoal')}</span>
      </div>
    </div>
  `).join('') || `<div class="sync-empty">${esc(emptyText)}</div>`;
  const renderMiniCalendar = (rows, emptyText) => {
    const today = currentViewDate;
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const byDay = new Map();
    rows.forEach((task) => {
      const date = new Date(`${task.date}T00:00:00`);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const day = date.getDate();
      byDay.set(day, [...(byDay.get(day) || []), task]);
    });
    const blanks = Array.from({ length: firstWeekday }, () => '<div class="dashboard-mini-day empty"></div>');
    const cells = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const items = byDay.get(day) || [];
      const first = items[0];
      const label = first
        ? first.scope === 'carro'
          ? `${first.vehicle || 'Carro'} - ${first.owner || 'Frota'}`
          : `${first.title} - ${first.owner || 'URE'}`
        : '';
      return `
        <button class="dashboard-mini-day ${items.length ? 'has-event' : ''}" type="button" onclick="showPage('agenda')">
          <strong>${esc(String(day))}</strong>
          ${items.length ? `<span>${esc(label)}</span>` : ''}
          ${items.length > 1 ? `<em>+${esc(String(items.length - 1))}</em>` : ''}
        </button>
      `;
    });
    const body = [
      '<div class="dashboard-mini-week">D</div><div class="dashboard-mini-week">S</div><div class="dashboard-mini-week">T</div><div class="dashboard-mini-week">Q</div><div class="dashboard-mini-week">Q</div><div class="dashboard-mini-week">S</div><div class="dashboard-mini-week">S</div>',
      ...blanks,
      ...cells
    ].join('');
    const count = rows.filter((task) => task.date?.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length;
    return `
      <div class="dashboard-mini-calendar-head">
        <strong>${esc(today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</strong>
        <span>${count ? `${esc(String(count))} registro(s)` : esc(emptyText)}</span>
      </div>
      <div class="dashboard-mini-calendar-grid">${body}</div>
    `;
  };
  if (sharedAgendaNode || personalAgendaNode) {
    const today = currentViewDate;
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthRows = (state.tasks || [])
      .filter((task) => !task.done && task.date && task.date.startsWith(monthKey))
      .sort((a, b) => `${a.date || '9999-99-99'} ${a.time || '99:99'}`.localeCompare(`${b.date || '9999-99-99'} ${b.time || '99:99'}`));
    const userName = normalizeKey(currentUser()?.name || state.profile?.name || '');
    const sharedRows = monthRows.filter((task) => task.scope === 'carro' || task.scope === 'ure');
    const personalRows = monthRows.filter((task) => task.scope === 'pessoal' && normalizeKey(task.owner || task.createdBy) === userName);
    if (sharedAgendaNode) sharedAgendaNode.innerHTML = renderMiniCalendar(sharedRows, 'Sem compartilhados');
    if (personalAgendaNode) personalAgendaNode.innerHTML = renderMiniCalendar(personalRows, 'Sem pessoais');
    if (sharedAgendaListNode) sharedAgendaListNode.innerHTML = renderAgendaRows(sharedRows, 'Nada na agenda compartilhada deste mês.');
    if (personalAgendaListNode) personalAgendaListNode.innerHTML = renderAgendaRows(personalRows, 'Nada na sua agenda pessoal deste mês.');
  }
  if (inventoryNode) {
    inventoryNode.innerHTML = inventoryRows.map((item) => `
      <div class="setechub-item setechub-clickable" onclick="setInventorySchool('${esc(item.school)}')">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.school)}</strong>
            <div class="sync-meta">${esc(item.name)} | CIE ${esc(schoolByName(item.school)?.cie || '--')}</div>
          </div>
          <span class="diag-pill ${item.defectUnits ? 'pill-danger' : 'pill-warn'}">${esc(String(item.alertUnits))} manut./defeito</span>
        </div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhum alerta de inventario no momento.</div>';
  }
  if (callsNode) {
    callsNode.innerHTML = callRows.map((item) => `
      <div class="setechub-item setechub-clickable" onclick="openSchoolCalls('${esc(item.school)}')">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.school)}</strong>
            <div class="sync-meta">${esc(item.title)} | CIE ${esc(schoolByName(item.school)?.cie || '--')}</div>
          </div>
          <span class="diag-pill ${toneByCall(item.status)}">${esc(badgeText(item.status))}</span>
        </div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhum chamado ativo no momento.</div>';
  }
}

function renderRoleDashboard(profileNode, roleCardsNode, attentionNode) {
  const user = currentUser() || {};
  const role = currentUserRole();
  const roleLabel = roleDisplay(role);
  const schools = visibleSchools();
  const allSchools = state.schools || [];
  const schoolAlerts = schools.filter((school) => schoolAlertUnits(school.name) > 0).length;
  const inventoryAlerts = aggregateInventoryItems(state.schoolAssets)
    .filter((item) => canViewSchool(item.school) && item.alertUnits > 0);
  const ctcOpen = (state.tasks || []).filter((item) => normalizeKey(item.category).includes('ctc') && !item.done).length;
  const supervisorStatsRows = supervisorStats();
  const pendingItems = pendingQueueItems(99).length;
  const adminImports = state.schoolImports || [];

  if (profileNode) {
    const scopeText = isSupervisorUser()
      ? `${schools.length} escola(s) vinculada(s)`
      : role === 'ctc'
        ? 'agenda CTC'
        : role === 'admin'
          ? `${allSchools.length} escola(s) na base completa`
          : `${schools.length} escola(s) disponíveis`;
    profileNode.innerHTML = `
      <div class="dashboard-profile-card">
        <span>Perfil</span>
        <strong>${esc(roleLabel)}</strong>
        <small>${esc(user.name || 'Usuário')} | ${esc(scopeText)}</small>
      </div>
      <div class="dashboard-profile-card">
        <span>Pendências</span>
        <strong>${esc(String(pendingItems))}</strong>
        <small>${esc(schoolAlerts)} escola(s) com alerta</small>
      </div>
      <div class="dashboard-profile-card">
        <span>Inventário</span>
        <strong>${esc(String(inventoryAlerts.length))}</strong>
        <small>tipo(s) com manutenção/defeito</small>
      </div>
      <div class="dashboard-profile-card">
        <span>Chamados</span>
        <strong>${esc(String(activeCalls))}</strong>
        <small>ativos no seu escopo</small>
      </div>
    `;
  }

  const mainCards = [
    {
      title: isSupervisorUser() ? 'Minhas escolas' : 'Escolas',
      meta: isSupervisorUser() ? `${schools.length} unidade(s) vinculada(s)` : `${schools.length} unidade(s) visíveis`,
      value: String(schools.length),
      tone: 'lime',
      page: 'schools',
      action: `showPage('schools')`
    },
    {
      title: 'Supervisores',
      meta: `${supervisorStatsRows.length} supervisor(es) visíveis`,
      value: String(supervisorStatsRows.length),
      tone: 'blue',
      page: 'supervisors',
      action: `showPage('supervisors')`
    },
    {
      title: 'Inventário',
      meta: `${inventoryAlerts.length} tipo(s) em manutenção/defeito`,
      value: String(state.schoolAssets.filter((item) => canViewSchool(item.school)).length),
      tone: 'teal',
      page: 'assets',
      action: `openInventoryCategory()`
    },
    {
      title: 'Técnicos CTC',
      meta: ctcOpen ? `${ctcOpen} visita(s) pendente(s)` : 'agenda de visitas',
      value: String(ctcOpen),
      tone: 'teal',
      page: 'ctc',
      action: `openCtcAgenda()`
    },
    {
      title: 'Relatórios',
      meta: 'resumo e automação',
      value: String(state.notes.length),
      tone: 'slate',
      page: 'reports',
      action: `showPage('reports')`
    },
    {
      title: 'Contatos',
      meta: 'ramais e contatos',
      value: String(state.directoryContacts.length),
      tone: 'amber',
      page: 'info',
      action: `showPage('info')`
    },
    {
      title: 'Admin',
      meta: 'usuários, backup e diagnóstico',
      value: String((state.users || []).length),
      tone: 'red',
      page: 'admin',
      action: `showPage('admin')`
    }
  ].filter((card) => canAccessPage(card.page) && dashboardCardRelevantForRole(card.page));

  if (roleCardsNode) {
    roleCardsNode.innerHTML = mainCards.map((card) => dashboardRoleCard(card)).join('')
      || '<div class="sync-empty">Nenhum card disponível para este perfil.</div>';
  }

  const attentionCards = [
    {
      title: 'Escolas com manutenção/defeito',
      meta: `${schoolAlerts} unidade(s) no seu escopo`,
      value: String(schoolAlerts),
      tone: schoolAlerts ? 'red' : 'lime',
      page: 'schools',
      action: `openSchoolCategory('com_alerta')`
    },
    {
      title: 'Sem rede/câmeras',
      meta: `${schools.filter((school) => !schoolNetworkRecord(school.name)).length} unidade(s)`,
      value: String(schools.filter((school) => !schoolNetworkRecord(school.name)).length),
      tone: 'amber',
      page: 'schools',
      action: `openSchoolCategory('sem_rede')`
    },
    {
      title: 'Inventário com defeito',
      meta: `${inventoryAlerts.filter((item) => item.defectUnits > 0).length} tipo(s) com defeito`,
      value: String(inventoryAlerts.filter((item) => item.defectUnits > 0).length),
      tone: 'red',
      page: 'assets',
      action: `openInventoryCategory('criticos')`
    },
    {
      title: 'Agenda Técnicos CTC',
      meta: ctcOpen ? `${ctcOpen} visita(s) pendente(s)` : 'sem pendência CTC',
      value: String(ctcOpen),
      tone: ctcOpen ? 'amber' : 'teal',
      page: 'ctc',
      action: `openCtcAgenda()`
    },
    {
      title: 'Importações da base',
      meta: 'informação administrativa',
      value: String(adminImports.length),
      tone: 'slate',
      page: 'admin',
      action: `showPage('admin')`
    }
  ].filter((card) => canAccessPage(card.page) && dashboardCardRelevantForRole(card.page) && (Number(card.value) > 0 || card.page === 'ctc' || card.page === 'admin'));

  if (attentionNode) {
    attentionNode.innerHTML = attentionCards.map((card) => dashboardRoleCard(card, 'attention')).join('')
      || '<div class="sync-empty">Nada pendente para este perfil agora.</div>';
  }
}

function dashboardRoleCard(card, mode = 'main') {
  return `
    <button class="dashboard-role-card ${card.tone} ${mode}" type="button" onclick="${card.action}">
      <span>${esc(card.title)}</span>
      <strong>${esc(card.value)}</strong>
      <small>${esc(card.meta)}</small>
    </button>
  `;
}

function dashboardCardRelevantForRole(page) {
  const role = currentUserRole();
  if (role === 'ctc') return page === 'ctc';
  if (role === 'supervisor') return ['schools', 'supervisors'].includes(page);
  if (role === 'seom') return ['schools', 'assets'].includes(page);
  if (role === 'dirigente') return page !== 'admin';
  if (role === 'pec') return false;
  return true;
}

function renderPendingQueue() {
  const list = document.getElementById('pendingQueueList');
  if (!list) return;
  list.innerHTML = '';
}

function renderSchoolCommandCenter() {
  const filtered = sortSchoolsByCurrentView(visibleSchools());
  const focusSchool = schoolByName(currentSchoolDetail) || filtered[0] || null;
  const coverage = schoolCoverageSummary();
  const focusNode = document.getElementById('schoolFocusPanel');
  const coverageNode = document.getElementById('schoolCoverageGrid');
  const tableNode = document.getElementById('schoolMasterTable');
  const overviewNode = document.getElementById('schoolOverviewMatrix');
  if (focusNode) {
    const signal = focusSchool ? schoolOperationalSnapshot(focusSchool) : null;
    const network = focusSchool ? schoolNetworkRecord(focusSchool.name) : null;
    focusNode.innerHTML = focusSchool ? `
      <div class="setechub-command-score">
        <div>
          <div class="sync-meta">Escola em foco</div>
          <strong>${esc(focusSchool.name)}</strong>
        </div>
        <span class="diag-pill ${toneBySchool(focusSchool.status)}">${esc(badgeText(focusSchool.status))}</span>
      </div>
      <div class="sync-meta">CIE ${esc(focusSchool.cie || '--')} | ${esc(focusSchool.zone)}</div>
      <div class="setechub-inline-metrics">
        <div class="mini-stat"><span class="ms-l">Inventario</span><strong class="ms-val">${esc(String(signal?.assetUnits || 0))}</strong></div>
        <div class="mini-stat"><span class="ms-l">Manut./defeito</span><strong class="ms-val">${esc(String(signal?.alertUnits || 0))}</strong></div>
        <div class="mini-stat"><span class="ms-l">Cameras</span><strong class="ms-val">${esc(network?.cameraInstalled ? `${network.cameraWorking || 0}/${network.cameraInstalled}` : '--')}</strong></div>
      </div>
      <div class="setechub-action-row left">
        <button class="btn btn-p btn-sm" onclick="openSchoolRecord('${esc(focusSchool.name)}')">Abrir ficha</button>
        <button class="btn btn-g btn-sm" onclick="setInventorySchool('${esc(focusSchool.name)}')">Abrir inventario</button>
      </div>
    ` : '<div class="sync-empty">Nenhuma escola encontrada no filtro atual.</div>';
  }
  if (coverageNode) {
    coverageNode.innerHTML = [
      { label: 'Com inventario', value: `${coverage.inventoryPct}%`, note: `${coverage.withInventory}/${coverage.total} escolas` },
      { label: 'Com rede/cameras', value: `${coverage.networkPct}%`, note: `${coverage.withNetwork}/${coverage.total} escolas` },
      { label: 'Com ficha', value: `${coverage.profilePct}%`, note: `${coverage.withProfile}/${coverage.total} escolas` },
      { label: 'Manut./defeito', value: String(coverage.withAlerts), note: 'escolas com itens registrados' }
    ].map((item) => `
      <div class="setechub-monitor-card compact">
        <div class="sync-meta">${esc(item.label)}</div>
        <strong>${esc(item.value)}</strong>
        <div class="diag-pill">${esc(item.note)}</div>
      </div>
    `).join('');
  }
  if (overviewNode) {
    overviewNode.innerHTML = filtered.length ? filtered.map((school) => {
      const signal = schoolOperationalSnapshot(school);
      const dataScore = schoolDataScore(school.name);
      const network = schoolNetworkRecord(school.name);
      const tone = signal.alertUnits > 0 || signal.openCalls > 0 ? 'pill-warn' : 'pill-ok';
      return `
        <article class="school-overview-card">
          <button class="school-overview-main" type="button" onclick="openSchoolRecord('${esc(school.name)}')">
            <span class="diag-pill ${tone}">${esc(signal.alertUnits ? 'manut./defeito' : signal.openCalls ? 'chamado ativo' : 'sem pendência')}</span>
            <strong>${esc(school.name)}</strong>
            <small>CIE ${esc(school.cie || network?.cie || '--')} | ${esc(school.zone)}</small>
          </button>
          <div class="school-overview-kpis">
            <div><span>Dados</span><strong>${esc(String(dataScore))}%</strong></div>
            <div><span>Invent.</span><strong>${esc(String(signal.assetUnits))}</strong></div>
            <div><span>Manut.</span><strong>${esc(String(signal.alertUnits))}</strong></div>
            <div><span>Cham.</span><strong>${esc(String(signal.openCalls))}</strong></div>
          </div>
          <div class="school-overview-flags">
            <span class="diag-pill ${signal.completion >= 35 ? 'pill-ok' : 'pill-warn'}">${esc(String(signal.completion))}% ficha</span>
            <span class="diag-pill ${network ? 'pill-info' : 'pill-warn'}">${network ? 'rede ok' : 'sem rede'}</span>
            <span class="diag-pill">${esc(String(signal.imports))} import.</span>
          </div>
          <div class="school-overview-actions">
            <button class="btn btn-p btn-sm" type="button" onclick="openSchoolRecord('${esc(school.name)}')">Ficha</button>
            <button class="btn btn-g btn-sm" type="button" onclick="setInventorySchool('${esc(school.name)}')">Inventario</button>
            <button class="btn btn-g btn-sm" type="button" onclick="openSchoolCalls('${esc(school.name)}')">Chamados</button>
          </div>
        </article>
      `;
    }).join('') : '<div class="sync-empty">Nenhuma escola encontrada no filtro atual.</div>';
  }
  if (tableNode) {
    tableNode.innerHTML = filtered.length ? `
      <table class="setechub-table setechub-table-clickable">
        <thead>
          <tr>
            <th>Escola</th>
            <th>CIE</th>
            <th>Municipio</th>
            <th>Situação</th>
            <th>Dados</th>
            <th>Inventario</th>
            <th>Manut./defeito</th>
            <th>Chamados</th>
            <th>Importacoes</th>
            <th>Cameras</th>
            <th>Banda</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((school) => {
            const signal = schoolOperationalSnapshot(school);
            const network = schoolNetworkRecord(school.name);
            const dataScore = schoolDataScore(school.name);
            return `
              <tr class="setechub-row-link" onclick="openSchoolRecord('${esc(school.name)}')">
                <td><strong>${esc(school.name)}</strong><div class="sync-meta">${esc(badgeText(school.status))}</div></td>
                <td>${esc(school.cie || '--')}</td>
                <td>${esc(school.zone)}</td>
                <td><span class="diag-pill ${signal.alertUnits || signal.openCalls ? 'pill-warn' : 'pill-ok'}">${esc(signal.alertUnits ? 'manut./defeito' : signal.openCalls ? 'chamado ativo' : 'sem pendência')}</span></td>
                <td>${esc(String(dataScore))}%</td>
                <td>${esc(String(signal.assetUnits || 0))}</td>
                <td>${esc(String(signal.alertUnits || 0))}</td>
                <td>${esc(String(signal.openCalls || 0))}</td>
                <td>${esc(String(signal.imports || 0))}</td>
                <td>${esc(network?.cameraInstalled ? `${network.cameraWorking || 0}/${network.cameraInstalled}` : '--')}</td>
                <td>${esc(network?.bandwidth || '--')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '<div class="sync-empty">Nenhuma escola encontrada no filtro atual.</div>';
  }
}

function renderInventoryWorkspace() {
  const visibleSchoolRows = visibleSchools();
  const visibleSupervisorRows = visibleSupervisors();
  const filteredAssets = filteredSchoolAssets();
  const focusSchool = inventoryFocusSchool();
  const regionalView = currentInventorySchool === 'todas';
  const focusRows = aggregateInventoryItems(filteredAssets)
    .sort((a, b) => simplifiedEquipmentOrder(a.name) - simplifiedEquipmentOrder(b.name) || b.alertUnits - a.alertUnits || b.units - a.units || a.school.localeCompare(b.school));
  const categorySummary = focusRows.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = { category: item.category, units: 0, alertUnits: 0, items: 0 };
    }
    acc[item.category].units += item.units;
    acc[item.category].alertUnits += item.alertUnits;
    acc[item.category].items += 1;
    return acc;
  }, {});
  const categorySummaryRows = Object.values(categorySummary);
  const issueRows = focusRows
    .filter((item) => item.alertUnits > 0 || item.defectUnits > 0)
    .slice(0, 12);
  const totalUnits = filteredAssets.reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const alertUnits = filteredAssets.filter((item) => item.status !== 'ok').reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const defectUnits = filteredAssets.filter((item) => item.status === 'defeito').reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const coveredSchools = new Set(filteredAssets.map((item) => item.school)).size;
  const totalSchools = visibleSchoolRows.length || 1;
  const coveragePct = Math.round((coveredSchools / totalSchools) * 100);
  const issuePct = totalUnits ? Math.round((alertUnits / totalUnits) * 100) : 0;
  const updatedAtNode = document.getElementById('inventoryUpdatedAtMeta');
  if (updatedAtNode) {
    updatedAtNode.textContent = regionalView
      ? `Última atualização geral do inventário: ${state.inventoryUpdatedAt ? timestampLabel(new Date(state.inventoryUpdatedAt)) : 'não registrada'}`
      : `Última atualização desta escola: ${inventoryUpdatedLabelForSchool(focusSchool)}`;
  }
  const schoolListAssets = state.schoolAssets.filter((item) => {
    if (!canViewSchool(item.school)) return false;
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
  const assetsBySchool = schoolListAssets.reduce((acc, item) => {
    if (!acc[item.school]) acc[item.school] = [];
    acc[item.school].push(item);
    return acc;
  }, {});
  const schoolRows = visibleSchoolRows
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((school) => {
      const rows = assetsBySchool[school.name] || [];
      const total = rows.reduce((sum, item) => sum + schoolAssetUnits(item), 0);
      const alerts = rows.filter((item) => item.status !== 'ok').reduce((sum, item) => sum + schoolAssetUnits(item), 0);
      const defects = rows.filter((item) => item.status === 'defeito').reduce((sum, item) => sum + schoolAssetUnits(item), 0);
      return {
        school: school.name,
        cie: school.cie || '',
        zone: school.zone || '',
        totalLines: rows.length,
        totalUnits: total,
        alertUnits: alerts,
        defectUnits: defects,
        categories: new Set(rows.map((item) => inventoryCategory(item.name))).size,
        visible: !currentInventorySearch || rows.length || normalizeKey(school.name).includes(normalizeKey(currentInventorySearch))
      };
    })
    .filter((item) => item.visible)
    .sort((a, b) => {
      if (a.school === currentInventorySchool) return -1;
      if (b.school === currentInventorySchool) return 1;
      return b.alertUnits - a.alertUnits || b.defectUnits - a.defectUnits || b.totalUnits - a.totalUnits || a.school.localeCompare(b.school);
    });
  const heroTitle = document.getElementById('inventoryHeroTitle');
  const heroText = document.getElementById('inventoryHeroText');
  const heroStats = document.getElementById('inventoryHeroStats');
  const heroScore = document.getElementById('inventoryHeroScore');
  const typeStrip = document.getElementById('inventoryTypeStrip');
  const focusPanel = document.getElementById('inventoryFocusPanel');
  const ranking = document.getElementById('inventorySchoolRanking');
  const table = document.getElementById('inventoryDetailTable');
  const categoryTable = document.getElementById('inventoryCategoryTable');
  const schoolSelect = document.getElementById('inventorySchoolSelect');
  const zoneSelect = document.getElementById('inventoryZoneSelect');
  const supervisorSelect = document.getElementById('inventorySupervisorSelect');
  const categorySelect = document.getElementById('inventoryCategorySelect');
  const searchInput = document.getElementById('inventorySearchInput');
  const issueNode = document.getElementById('inventoryIssuesList');
  const manageCard = document.querySelector('.inventory-manage-card');
  if (manageCard) {
    manageCard.hidden = regionalView || !canImportData();
  }
  const schoolFilterSource = visibleSchoolRows
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const supervisorValues = ['todos', ...visibleSupervisorRows.map((supervisor) => normalizeKey(supervisor.name))];
  if (!supervisorValues.includes(currentInventorySupervisor)) currentInventorySupervisor = 'todos';
  const zoneValues = ['todas', ...new Set(schoolFilterSource.map((school) => school.zone).filter(Boolean))];
  if (!zoneValues.includes(currentInventoryZone)) currentInventoryZone = 'todas';
  const schoolOptions = schoolFilterSource.filter((school) =>
    (currentInventoryZone === 'todas' || school.zone === currentInventoryZone) &&
    inventorySchoolMatchesSupervisor(school.name)
  );
  if (currentInventorySchool !== 'todas' && !schoolOptions.some((school) => school.name === currentInventorySchool)) {
    currentInventorySchool = 'todas';
  }
  if (schoolSelect) {
    schoolSelect.innerHTML = [`<option value="todas">Todas as escolas</option>`]
      .concat(schoolOptions.map((school) => `<option value="${esc(school.name)}">${esc(school.name)}</option>`))
      .join('');
    schoolSelect.value = currentInventorySchool;
  }
  if (zoneSelect) {
    zoneSelect.innerHTML = zoneValues
      .map((zone) => `<option value="${esc(zone)}">${zone === 'todas' ? 'Todas as cidades' : esc(zone)}</option>`)
      .join('');
    zoneSelect.value = currentInventoryZone;
  }
  if (supervisorSelect) {
    const supervisors = ['todos', ...visibleSupervisorRows.map((supervisor) => supervisor.name)];
    if (!supervisors.some((name) => (name === 'todos' ? 'todos' : normalizeKey(name)) === currentInventorySupervisor)) {
      currentInventorySupervisor = 'todos';
    }
    supervisorSelect.innerHTML = supervisors
      .map((name) => `<option value="${esc(name === 'todos' ? 'todos' : normalizeKey(name))}">${name === 'todos' ? 'Todos os supervisores' : esc(name)}</option>`)
      .join('');
    supervisorSelect.value = currentInventorySupervisor;
  }
  if (categorySelect) {
    const categories = [
      ['todas', 'Todos os equipamentos'],
      ['pc_adm', 'PC adm'],
      ['pc_pedagogico', 'PC pedagogico'],
      ['netbooks', 'Netbooks'],
      ['tablets', 'Tablets'],
      ['smartphone', 'Smartphone'],
      ['notebooks', 'Notebooks'],
      ['infra', 'Infra / rede'],
      ['energia', 'Recarga / energia'],
      ['outros', 'Outros']
    ];
    categorySelect.innerHTML = categories.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    categorySelect.value = currentInventoryCategory;
  }
  if (searchInput) {
    searchInput.value = currentInventorySearch;
  }
  if (heroTitle) {
    heroTitle.textContent = regionalView
      ? 'Inventário regional'
      : focusSchool;
  }
  if (heroText) {
    const statusLabel = currentInventoryStatus === 'todos' ? 'todos os status' : badgeText(currentInventoryStatus);
    const categoryLabel = currentInventoryCategory === 'todas' ? 'todos os tipos' : equipmentTypeLabel(currentInventoryCategory);
    heroText.textContent = regionalView
      ? `${coveredSchools} escola(s) com inventário no recorte, ${focusRows.length} tipo(s) e ${totalUnits} unidade(s) em ${statusLabel.toLowerCase()} / ${categoryLabel.toLowerCase()}.`
      : `Inventário específico da unidade: ${totalUnits} unidade(s), ${alertUnits} em manutenção/defeito e ${defectUnits} com defeito.`;
  }
  if (heroStats) {
    heroStats.innerHTML = [
      { label: 'Unidades', value: String(totalUnits), note: `${focusRows.length} tipo(s) consolidados` },
      { label: 'Atenção', value: String(alertUnits), note: `${defectUnits} com defeito` },
      { label: regionalView ? 'Cobertura' : 'Registros', value: regionalView ? `${coveragePct}%` : String(filteredAssets.length), note: regionalView ? `${coveredSchools}/${totalSchools} escolas` : 'linhas do recorte' }
    ].map((item) => `
      <div class="inventory-hero-stat">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
        <small>${esc(item.note)}</small>
      </div>
    `).join('');
  }
  if (heroScore) {
    const scoreTone = defectUnits ? 'pill-danger' : alertUnits ? 'pill-warn' : 'pill-ok';
    heroScore.innerHTML = `
      <div class="inventory-risk-top">
        <span>${regionalView ? 'Situação regional' : 'Situação da escola'}</span>
        <strong>${esc(String(issuePct))}%</strong>
      </div>
      <div class="inventory-risk-bar"><span style="width:${esc(String(Math.min(100, issuePct)))}%"></span></div>
      <div class="inventory-risk-foot">
        <span class="diag-pill ${scoreTone}">${esc(String(alertUnits))} unidade(s) em manutenção/defeito</span>
        <span>${esc(String(defectUnits))} com defeito</span>
      </div>
    `;
  }
  if (typeStrip) {
    const types = Object.values(focusRows.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = { category: item.category, units: 0, alertUnits: 0 };
      acc[item.category].units += item.units;
      acc[item.category].alertUnits += item.alertUnits;
      return acc;
    }, {})).sort((a, b) => b.units - a.units).slice(0, 5);
    typeStrip.innerHTML = types.map((item) => `
      <button class="inventory-type-chip" type="button" onclick="openInventoryCategory('todos', '${esc(item.category)}')">
        <span>${esc(equipmentTypeLabel(item.category))}</span>
        <strong>${esc(String(item.units))}</strong>
        <small>${esc(String(item.alertUnits))} manut./defeito</small>
      </button>
    `).join('') || '<div class="sync-empty">Sem tipos no recorte atual.</div>';
  }
  if (focusPanel) {
    const focusMeta = schoolByName(focusSchool);
    const okUnits = focusRows.reduce((sum, item) => sum + item.okUnits, 0);
    focusPanel.innerHTML = `
      <div class="inventory-school-header">
        <div>
          <div class="sync-meta">${regionalView ? 'Visao geral da URE' : `CIE ${esc(focusMeta?.cie || '--')} | ${esc(focusMeta?.zone || 'Municipio nao definido')}`}</div>
          <strong>${esc(regionalView ? 'Todas as escolas' : focusSchool)}</strong>
        </div>
        <span class="diag-pill ${defectUnits ? 'pill-danger' : alertUnits ? 'pill-warn' : 'pill-ok'}">${esc(String(alertUnits))} manut./defeito</span>
      </div>
      <div class="inventory-focus-metrics">
        <div><span>Tipos</span><strong>${esc(String(focusRows.length))}</strong></div>
        <div><span>Unidades</span><strong>${esc(String(totalUnits))}</strong></div>
        <div><span>Ok</span><strong>${esc(String(okUnits))}</strong></div>
        <div><span>Defeito</span><strong>${esc(String(defectUnits))}</strong></div>
      </div>
      <div class="inventory-focus-actions">
        ${regionalView ? '' : '<button class="btn btn-g btn-sm" onclick="setInventorySchool(\'todas\')">Ver regional</button>'}
        ${regionalView ? '' : `<button class="btn btn-g btn-sm" onclick="openSchoolRecord('${esc(focusSchool)}')">Ficha da escola</button>`}
        <button class="btn btn-p btn-sm" onclick="document.getElementById('inventoryDetailTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' })">Ver equipamentos</button>
      </div>
    `;
  }
  if (issueNode) {
    issueNode.innerHTML = issueRows.map((item) => `
      <div class="inventory-issue-row">
        <div class="inventory-issue-main">
          <div>
            <strong>${esc(item.name)}</strong>
            <div class="sync-meta">${regionalView ? `${esc(item.school)} | ` : ''}${esc(equipmentTypeLabel(item.category))}</div>
          </div>
        </div>
        <div class="inventory-issue-badges">
          <span class="diag-pill">${esc(equipmentTypeLabel(item.category))}</span>
          <span class="diag-pill ${item.defectUnits ? 'pill-danger' : item.alertUnits ? 'pill-warn' : 'pill-ok'}">${esc(String(item.alertUnits))} manut./defeito</span>
        </div>
        <div class="inventory-issue-meta">
          <span>${esc(item.rawNameCount)} nome(s)</span>
          <span>${esc(item.originalStatusCount)} status</span>
          <span>${esc(String(item.defectUnits))} defeito(s)</span>
        </div>
        <div class="sync-meta">${esc(item.notePreview || 'Sem observacao')}</div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhuma inconsistencia importante na escola em foco.</div>';
  }
  if (ranking) {
    const rankingRows = schoolRows.slice(0, INVENTORY_RENDER_LIMIT);
    ranking.innerHTML = rankingRows.map((item) => {
      const active = item.school === currentInventorySchool;
      const issueTone = item.defectUnits ? 'pill-danger' : item.alertUnits ? 'pill-warn' : 'pill-ok';
      return `
      <div class="inventory-school-row setechub-clickable ${active ? 'active' : ''}" onclick="setInventorySchool('${esc(item.school)}')">
        <div class="inventory-rank">${esc(item.school.replace(/^E\.?E\.?\s+/i, '').slice(0, 2).toUpperCase())}</div>
        <div class="inventory-school-row-main">
          <div>
            <strong>${esc(item.school)}</strong>
            <div class="sync-meta">CIE ${esc(item.cie || '--')} | ${esc(item.zone || '--')} | atualizado ${esc(inventoryUpdatedLabelForSchool(item.school))}</div>
          </div>
          <div class="inventory-school-row-metrics">
            <span><strong>${esc(String(item.totalUnits))}</strong> total</span>
            <span><strong>${esc(String(item.categories))}</strong> tipos</span>
            <span class="${item.alertUnits ? 'danger' : ''}"><strong>${esc(String(item.alertUnits))}</strong> atencao</span>
          </div>
        </div>
        <span class="diag-pill ${issueTone}">${esc(item.alertUnits ? `${item.alertUnits} parado(s)` : 'ok')}</span>
      </div>
    `;
    }).join('') + listLimitNotice(schoolRows.length, INVENTORY_RENDER_LIMIT, 'escolas no inventario') || '<div class="sync-empty">Nenhum inventario encontrado nos filtros atuais.</div>';
  }
  if (table) {
    const matrixColumns = currentInventoryCategory === 'todas'
      ? INVENTORY_MATRIX_COLUMNS
      : INVENTORY_MATRIX_COLUMNS.filter(([category]) => category === currentInventoryCategory);
    const matrixSchools = schoolOptions
      .filter((school) => currentInventorySchool === 'todas' || school.name === currentInventorySchool);
    const matrixRows = matrixSchools.map((school) => {
      const rows = (state.schoolAssets || []).filter((item) => canViewSchool(item.school) && item.school === school.name);
      const cells = matrixColumns.map(([category]) => {
        const categoryRows = rows.filter((item) => inventoryCategory(item.name) === category);
        return {
          category,
          units: categoryRows.reduce((sum, item) => sum + schoolAssetUnits(item), 0),
          alertUnits: categoryRows.filter((item) => item.status !== 'ok').reduce((sum, item) => sum + schoolAssetUnits(item), 0)
        };
      });
      return {
        school,
        total: cells.reduce((sum, item) => sum + item.units, 0),
        stoppedTotal: cells.reduce((sum, item) => sum + item.alertUnits, 0),
        cells
      };
    }).filter((row) =>
      currentInventorySchool === 'todas' ||
      row.school.name === currentInventorySchool ||
      row.cells.some((cell) => cell.units > 0)
    );
    const visibleMatrixRows = matrixRows.slice(0, INVENTORY_RENDER_LIMIT);
    table.innerHTML = matrixRows.length ? `
      <div class="inventory-matrix" style="--inventory-matrix-cols:${esc(String(matrixColumns.length))};">
        <div class="inventory-matrix-head">
          <div>Escola</div>
          ${matrixColumns.map(([, label]) => `<div>${esc(label)}</div>`).join('')}
          <div>Não func.</div>
          <div>Total</div>
        </div>
        ${visibleMatrixRows.map((row) => `
          <div class="inventory-matrix-row">
            <button class="inventory-matrix-school" type="button" onclick="openSchoolRecord('${esc(row.school.name)}')">
              <span class="school-widget-avatar mini" style="${schoolAvatarStyle(row.school)}">${esc(schoolAvatarInitials(row.school.name))}</span>
              <span><strong>${esc(row.school.name)}</strong><small>Atualizado ${esc(inventoryUpdatedLabelForSchool(row.school.name))}</small></span>
            </button>
            ${row.cells.map((cell) => `
              <button class="inventory-matrix-cell ${cell.units ? 'has-value' : ''} ${cell.alertUnits ? 'has-alert' : ''}" type="button" onclick="openInventoryCategory('todos', '${esc(cell.category)}', '${esc(row.school.name)}')" ${cell.units ? '' : 'disabled'}>
                <strong>${esc(String(cell.units || 0))}</strong>
                ${cell.alertUnits ? `<span>${esc(String(cell.alertUnits))} parado</span>` : ''}
              </button>
            `).join('')}
            <button class="inventory-matrix-stopped ${row.stoppedTotal ? 'has-alert' : ''}" type="button" onclick="setInventorySchool('${esc(row.school.name)}')">${esc(String(row.stoppedTotal))}</button>
            <button class="inventory-matrix-total" type="button" onclick="setInventorySchool('${esc(row.school.name)}')">${esc(String(row.total))}</button>
          </div>
        `).join('')}
      </div>
      ${listLimitNotice(matrixRows.length, INVENTORY_RENDER_LIMIT, 'linhas da matriz')}
    ` : '<div class="sync-empty">Nenhum inventario encontrado.</div>';
  }
  if (categoryTable) {
    categoryTable.innerHTML = categorySummaryRows.length ? categorySummaryRows
      .sort((a, b) => b.units - a.units || a.category.localeCompare(b.category))
      .map((item) => `
        <button class="inventory-category-chip" type="button" onclick="openInventoryCategory('${esc(currentInventoryStatus)}', '${esc(item.category)}', '${esc(currentInventorySchool)}')">
          <span>${esc(equipmentTypeLabel(item.category))}</span>
          <strong>${esc(String(item.units))}</strong>
          <small>${esc(String(item.items))} tipo(s) | ${esc(String(item.alertUnits))} manut./defeito</small>
        </button>
      `).join('') : '<div class="sync-empty">Sem tipos para resumir neste recorte.</div>';
  }
}

function inventoryUpdatedAtForSchool(schoolName) {
  const canonical = canonicalSchoolName(schoolName) || schoolName;
  return state.inventoryUpdatedBySchool?.[canonical] || state.inventoryUpdatedAt || '';
}

function inventoryUpdatedLabelForSchool(schoolName) {
  const value = inventoryUpdatedAtForSchool(schoolName);
  return value ? timestampLabel(new Date(value)) : 'Nao registrada';
}

function renderSetupStats() {
  const values = {
    setupTaskCount: `${state.tasks.filter((item) => !item.done).length} tarefas`,
    setupCallCount: `${state.calls.filter((item) => item.status !== 'resolvido').length} em aberto`,
    setupSchoolCount: `${visibleSchools().filter((item) => item.status !== 'estavel').length} escolas`,
    setupChecklistCount: `${state.checklist.length} itens`,
    setupAssetCount: `${state.assets.filter((item) => item.status !== 'ok').length + state.schoolAssets.filter((item) => item.status !== 'ok').length} em observacao`,
    setupHours: bankHours()
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  });
}

function renderMetrics() {
  const values = {
    metricPending: state.tasks.filter((item) => !item.done).length,
    metricCalls: state.calls.filter((item) => item.status !== 'resolvido').length,
    metricSchools: visibleSchools().filter((item) => item.status !== 'estavel').length,
    metricHours: bankHours()
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  });
}

function renderFocus() {
  const focus = nextFocusTask();
  const badge = document.getElementById('focusBadge');
  const title = document.getElementById('focusTitle');
  const text = document.getElementById('focusText');
  if (badge) badge.textContent = focus ? badgeText(focus.priority) : 'Organizar';
  if (title) title.textContent = focus ? focus.title : 'Tudo principal do dia esta concluido.';
  if (text) text.textContent = focus
      ? `${focus.place} | ${focus.category} | ${focus.time || 'sem horario definido'}`
      : 'Use a agenda para abrir novas tarefas, revisar escolas ou fechar relatorios.';
}

function renderWeekBadges() {
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const today = new Date().getDay();
  const wrap = document.getElementById('weekBadges');
  if (!wrap) return;
  wrap.innerHTML = labels.map((label, index) => {
    const active = today === index + 1 ? 'pill-info' : '';
    return `<span class="diag-pill ${active}">${label}</span>`;
  }).join('');
}

function renderTimeline() {
  const list = document.getElementById('timelineList');
  if (!list) return;
  list.innerHTML = timelineItems().map((item) => `
    <div class="setechub-item">
      <div class="setechub-head">
        <strong>${esc(item.title)}</strong>
        <span class="diag-pill ${item.done ? 'pill-ok' : 'pill-info'}">${esc(item.time)}</span>
      </div>
      <div class="sync-meta">${esc(item.detail)}</div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhum item no fluxo de hoje.</div>';
}

function renderChecklist() {
  const list = document.getElementById('checklistList');
  if (!list) return;
  list.innerHTML = state.checklist.map((item) => `
    <div class="setechub-item">
      <div class="setechub-check-row">
        <label class="setechub-check">
          <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklist(${item.id})">
          <span>${esc(item.text)}</span>
        </label>
        <span class="diag-pill ${item.done ? 'pill-ok' : 'pill-warn'}">${item.done ? 'Feito' : 'Pendente'}</span>
      </div>
    </div>
  `).join('');
}

function renderPonto() {
  const entry = document.getElementById('entryTime');
  const exit = document.getElementById('exitTime');
  const worked = document.getElementById('workedToday');
  if (entry) entry.textContent = state.ponto.entrada || '--:--';
  if (exit) exit.textContent = state.ponto.saida || '--:--';
  if (worked) worked.textContent = workedDuration();
}

function renderRoutes() {
  const list = document.getElementById('routeList');
  if (!list) return;
  const order = { critico: 0, atencao: 1, estavel: 2 };
  const items = visibleSchools()
    .filter((item) => item.status !== 'estavel')
    .slice()
    .sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99) || a.name.localeCompare(b.name));
  list.innerHTML = items.map((item) => `
    <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(item.name)}')">
      <div class="setechub-head">
        <strong>${esc(item.name)}</strong>
        <span class="diag-pill ${toneBySchool(item.status)}">${esc(badgeText(item.status))}</span>
      </div>
      <div class="sync-meta">${esc(item.zone)} | CIE ${esc(item.cie || '--')} | ${esc(item.notes)}</div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhuma escola em atencao no momento.</div>';
}

function renderMunicipalities() {
  const list = document.getElementById('municipalityList');
  if (!list) return;
  list.innerHTML = state.municipalities
    .slice()
    .sort((a, b) => b.schoolCount - a.schoolCount || a.name.localeCompare(b.name))
    .map((item) => `
    <div class="setechub-item setechub-clickable" onclick="openMunicipalitySchools('${esc(item.name)}')">
      <div class="setechub-head">
        <strong>${esc(item.name)}</strong>
        <span class="diag-pill">${esc(String(item.schoolCount))} escolas</span>
      </div>
      <div class="sync-meta">${esc(item.notes || 'Municipio coberto pela URE Itapeva.')}</div>
      <div class="setechub-action-row left">
        <button class="btn btn-g btn-sm" onclick="event.stopPropagation(); openMunicipalitySchools('${esc(item.name)}')">Abrir escolas</button>
      </div>
    </div>
  `).join('');
}

function contactInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

function contactAvatarStyle(item) {
  const key = normalizeKey(item?.sector || '');
  const palettes = [
    [/setec|seintec|tecnologia|ctc/, ['#5af5c8', '#007a61']],
    [/site|suporte/, ['#b8c2d8', '#536078']],
    [/seom|obras|manut/, ['#f5c85a', '#9a6a16']],
    [/seafin|sefin|secomse|sefisc|financas|compras/, ['#78b4ff', '#1f5ea8']],
    [/sepes|seape|sefrep|crh|pessoas|rh/, ['#a78bfa', '#5b4bd8']],
    [/eec|pec|pedagogico|curriculo/, ['#c8f55a', '#4f7d12']],
    [/ese|supervis/, ['#5ac8f5', '#1f6f8f']],
    [/gab|asure|gestao|dirigente/, ['#f5a85a', '#9a5316']],
    [/segre|semat|sevesc|vida escolar|matricula/, ['#90e0b0', '#2e7d4f']]
  ];
  const match = palettes.find(([pattern]) => pattern.test(key));
  const [primary, secondary] = match ? match[1] : ['#b8c2d8', '#536078'];
  return `--directory-avatar-a:${primary};--directory-avatar-b:${secondary};`;
}

function contactDisplayName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.join(' ') || 'Contato';
}

function renderContactAvatar(item) {
  return `<div class="directory-avatar">${esc(contactInitials(item.name))}</div>`;
}

function directorySectorFilterValue(sector) {
  return `sector:${normalizeKey(sector || 'sem setor')}`;
}

function directoryFilterForContact(item) {
  return typeof directoryCategoryForContact === 'function'
    ? directoryCategoryForContact(item)
    : directorySectorFilterValue(item?.sector || '');
}

function renderDirectoryFilterBar() {
  const filterBar = document.getElementById('directoryFilterBar');
  if (!filterBar) return;
  const filters = Array.isArray(DIRECTORY_FILTERS) && DIRECTORY_FILTERS.length
    ? DIRECTORY_FILTERS
    : [{ value: 'todos', label: 'Todos', color: '#b8c2d8' }];
  const values = filters.map((filter) => filter.value);
  if (!values.includes(currentDirectoryFilter)) currentDirectoryFilter = 'todos';
  filterBar.innerHTML = filters.map((filter) =>
    `<button class="btn btn-g btn-sm ${currentDirectoryFilter === filter.value ? 'active-filter' : ''}" data-directory-filter="${esc(filter.value)}" type="button" style="--directory-filter-color:${esc(filter.color || '#b8c2d8')}">${esc(filter.label)}</button>`
  ).join('');
}

function renderSectors() {
  const preview = document.getElementById('sectorList');
  const directory = document.getElementById('sectorDirectoryList');
  const adminActions = canManageUsers();
  const html = state.sectors.map((item) => `
    <div class="setechub-item directory-sector-card">
      <div class="setechub-head">
        <div>
          <strong>${esc(item.code)} | ${esc(item.name)}</strong>
          <div class="sync-meta">${esc(item.lead)}</div>
        </div>
        <div class="setechub-badges">
          <span class="diag-pill">${esc(item.phone)}</span>
          <a class="btn btn-g btn-sm" href="mailto:${esc(item.email)}">Email</a>
          ${adminActions ? `<button class="btn btn-d btn-sm" onclick="removeSector(${item.id})">Remover</button>` : ''}
        </div>
      </div>
      <div class="sync-meta">${esc(item.email)}${item.summary ? ` | ${esc(item.summary)}` : ''}</div>
    </div>
  `).join('');
  if (preview) preview.innerHTML = state.sectors.slice(0, 5).map((item) => `
    <div class="setechub-item">
      <div class="setechub-head">
        <strong>${esc(item.code)}</strong>
        <span class="diag-pill pill-info">${esc(item.phone)}</span>
      </div>
      <div class="sync-meta">${esc(item.name)} | ${esc(item.lead)}</div>
    </div>
  `).join('');
  if (directory) directory.innerHTML = html;
}

function renderDirectoryContacts() {
  const list = document.getElementById('directoryContactsList');
  if (!list) return;
  renderDirectoryFilterBar();
  const contacts = filteredDirectoryContacts(false)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = contacts.map((item) => `
      <article class="directory-widget" style="${contactAvatarStyle(item)}">
        ${renderContactAvatar(item)}
        <div class="directory-main">
          <div class="setechub-head">
            <div>
              <div class="directory-role">${esc(item.role || 'Contato institucional')}</div>
              <strong class="directory-name" title="${esc(item.name)}">${esc(contactDisplayName(item.name))}</strong>
            </div>
            <button class="directory-sector-pill" type="button" data-directory-filter="${esc(directoryFilterForContact(item))}">${esc(item.sector || 'Setor')}</button>
          </div>
          <div class="directory-contact-list">
            <a href="mailto:${esc(item.email || '')}" class="directory-contact-line ${item.email ? '' : 'is-muted'}">
              <span>Email</span>
              <strong>${esc(item.email || 'Sem email cadastrado')}</strong>
            </a>
            ${item.whatsappUrl ? `
              <a href="${esc(item.whatsappUrl)}" target="_blank" rel="noopener" class="directory-contact-line">
                <span>WhatsApp</span>
                <strong>Abrir conversa</strong>
              </a>
            ` : `
            <a href="mailto:${esc(item.sectorEmail || '')}" class="directory-contact-line ${item.sectorEmail ? '' : 'is-muted'}">
              <span>Email setor</span>
              <strong>${esc(item.sectorEmail || 'Nao informado')}</strong>
            </a>
            `}
            <div class="directory-contact-line directory-ramal-line">
              <span>Ramal</span>
              <strong>${esc(item.ramal || 'Sem ramal cadastrado')}</strong>
            </div>
          </div>
        </div>
      </article>
    `).join('') || '<div class="sync-empty">Nenhum contato oficial importado.</div>';
  const pecList = document.getElementById('pecAccountList');
  if (pecList) {
    const pecAccountContacts = filteredDirectoryContacts(true)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    pecList.innerHTML = pecAccountContacts.map((item) => `
      <article class="directory-widget" style="${contactAvatarStyle(item)}">
        ${renderContactAvatar(item)}
        <div class="directory-main">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.name)}</strong>
            <div class="sync-meta">${esc(item.role)}</div>
          </div>
          <span class="diag-pill">Ramal ${esc(item.ramal || '--')}</span>
        </div>
        <div class="sync-meta">${esc(item.email)}</div>
        </div>
      </article>
    `).join('') || '<div class="sync-empty">Nenhum dado PEC liberado para este acesso.</div>';
  }
  const pecsPageList = document.getElementById('pecsPageList');
  if (pecsPageList) {
    const pecContacts = filteredDirectoryContacts().filter((item) => /pec|curriculo|currículo|especialista/i.test(`${item.role} ${item.name}`));
    pecsPageList.innerHTML = pecContacts
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => `
        <div class="setechub-item">
          <div class="setechub-head">
            <div>
              <strong>${esc(item.name)}</strong>
              <div class="sync-meta">${esc(item.role)}</div>
            </div>
            <span class="diag-pill">${esc(item.phone)}</span>
          </div>
          <div class="sync-meta">${esc(item.email)}</div>
        </div>
      `).join('') || '<div class="sync-empty">Nenhum PEC disponivel para este perfil.</div>';
  }
}

function renderSchoolImports() {
  const filtered = filteredSchoolImports();
  const select = document.getElementById('importSchoolSelect');
  if (select) {
    const selected = currentImportSchoolContext || currentSchoolDetail || select.value;
    select.innerHTML = visibleSchools()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((school) => `<option value="${esc(school.name)}">${esc(school.name)}</option>`)
      .join('');
    if (selected && visibleSchools().some((school) => school.name === selected)) {
      select.value = selected;
    }
  }
  const list = document.getElementById('schoolImportList');
  if (!list) return;
  list.innerHTML = filtered
    .slice()
    .sort((a, b) => {
      const reviewDiff = (a.reviewStatus === 'pending' ? 0 : 1) - (b.reviewStatus === 'pending' ? 0 : 1);
      if (reviewDiff) return reviewDiff;
      return String(b.importedAt || '').localeCompare(String(a.importedAt || ''));
    })
    .map((item) => `
      <div class="setechub-item school-detail-section">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.label || item.filename || 'Importacao')}</strong>
            <div class="sync-meta">${esc(item.school)} | ${esc(item.type)} | ${esc(item.importedAt || '')}</div>
          </div>
          <div class="setechub-badges">
            <span class="diag-pill ${item.reviewStatus === 'pending' ? 'pill-warn' : 'pill-ok'}">${item.reviewStatus === 'pending' ? 'Pendente' : 'Confirmada'}</span>
            <span class="diag-pill">${esc(item.summary || 'Lido')}</span>
          </div>
        </div>
        <div class="sync-meta">${esc(String(item.preview || '').split('\n').slice(0, 4).join(' | ') || 'Sem preview relevante')}</div>
        ${canImportData() ? `<div class="setechub-action-row left">
          ${item.reviewStatus === 'pending' ? `<button class="btn btn-p btn-sm" onclick='approveSchoolImport(${JSON.stringify(item.id)})'>Confirmar</button>` : ''}
          <button class="btn btn-d btn-sm" onclick='rejectSchoolImport(${JSON.stringify(item.id)})'>${item.reviewStatus === 'pending' ? 'Excluir dados' : 'Remover'}</button>
        </div>` : ''}
      </div>
    `).join('') || '<div class="sync-empty">Nenhuma importacao vinculada a escolas neste filtro.</div>';
  const stats = document.getElementById('schoolImportStatus');
  if (stats) {
    const bySchool = new Set(state.schoolImports.map((item) => item.school)).size;
    const pending = filtered.filter((item) => item.reviewStatus === 'pending').length;
    stats.textContent = `${filtered.length} importacao(oes) visiveis | ${pending} pendente(s) de revisao | ${bySchool} escola(s) com arquivos`;
  }
}

function renderSchoolDetail() {
  const select = document.getElementById('schoolDetailSelect');
  const sortedSchools = visibleSchools().slice().sort((a, b) => a.name.localeCompare(b.name));
  const schoolNames = sortedSchools.map((item) => item.name);
  if (!currentSchoolDetail || !schoolNames.includes(currentSchoolDetail)) {
    currentSchoolDetail = schoolNames[0] || '';
  }
  if (select) {
    select.innerHTML = sortedSchools.map((item) => `<option value="${esc(item.name)}">${esc(item.name)} | CIE ${esc(item.cie || '--')}</option>`).join('');
    select.value = currentSchoolDetail;
  }

  const school = visibleSchools().find((item) => item.name === currentSchoolDetail);
  if (!school) {
    showPage('schools');
    return;
  }
  const displayNotes = schoolDisplayNotes(school.notes);
  const profile = currentSchoolProfile();
  const imports = state.schoolImports.filter((item) => item.school === currentSchoolDetail);
  const approvedImports = imports.filter((item) => item.reviewStatus !== 'pending');
  const pendingImports = imports.filter((item) => item.reviewStatus === 'pending');
  const assets = state.schoolAssets.filter((item) => item.school === currentSchoolDetail);
  const network = schoolNetworkRecord(currentSchoolDetail);
  const responsibleSupervisors = (state.supervisors || [])
    .filter((supervisor) => (supervisor.schools || []).includes(currentSchoolDetail))
    .map((supervisor) => supervisor.name);
  const responsibleSupervisorText = responsibleSupervisors.length
    ? responsibleSupervisors.join(', ')
    : 'Sem supervisor vinculado';
  const inventoryRows = schoolInventoryRows(currentSchoolDetail);
  const inventoryCategories = Object.values(schoolInventoryCategorySummary(currentSchoolDetail)).sort((a, b) => b.units - a.units);
  const openCalls = state.calls.filter((item) => item.school === currentSchoolDetail && item.status !== 'resolvido');
  const plannedTasks = state.tasks.filter((item) => item.place === currentSchoolDetail || item.title.includes(currentSchoolDetail));
  const totalUnits = assets.reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const alertUnits = assets.filter((item) => item.status !== 'ok').reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const defectUnits = assets.filter((item) => item.status === 'defeito').reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const completion = schoolProfileCompletion(currentSchoolDetail);
  const missingFields = schoolMissingProfileFields(currentSchoolDetail);
  const situationLabel = defectUnits > 0
    ? 'Defeito registrado'
    : alertUnits > 0
      ? 'Manutenção registrada'
      : openCalls.length > 0
        ? 'Chamado ativo'
        : 'Sem pendência registrada';
  const situationTone = defectUnits > 0
    ? 'pill-danger'
    : alertUnits > 0 || openCalls.length > 0
      ? 'pill-warn'
      : 'pill-ok';
  const networkGap = network ? Math.max(0, Number(network.cameraInstalled || 0) - Number(network.cameraWorking || 0)) : 0;

  document.getElementById('schoolDetailHeader').innerHTML = school ? `
    <div class="school-record-hero-main">
      <div class="school-record-avatar" style="${schoolAvatarStyle(school)}">${esc(schoolAvatarInitials(school.name))}</div>
      <div class="school-record-title-block">
        <div class="dashboard-command-kicker">Ficha da escola</div>
        <h1>${esc(school.name)}</h1>
        <p>${esc(school.zone)} | CIE ${esc(school.cie || network?.cie || '--')}${displayNotes ? ` | ${esc(displayNotes)}` : ''}</p>
        <div class="school-record-chip-row">
          ${school.fixedName ? '<span class="diag-pill">Oficial</span>' : ''}
          <span class="diag-pill ${situationTone}">${esc(situationLabel)}</span>
          <span class="diag-pill">${esc(responsibleSupervisorText)}</span>
          <span class="diag-pill">Inventario atualizado ${esc(inventoryUpdatedLabelForSchool(currentSchoolDetail))}</span>
        </div>
      </div>
      <div class="school-record-hero-actions">
        <button class="btn btn-p btn-sm" type="button" onclick="setInventorySchool('${esc(school.name)}')">Inventario</button>
        <button class="btn btn-g btn-sm" type="button" onclick="openSchoolCalls('${esc(school.name)}')">Chamados</button>
      </div>
    </div>
  ` : '<div class="sync-empty">Nenhuma escola selecionada.</div>';

  const pageTitle = document.getElementById('schoolRecordTitle');
  const pageSubtitle = document.getElementById('schoolRecordSubtitle');
  if (pageTitle) pageTitle.textContent = school ? school.name : 'Pagina da escola';
  if (pageSubtitle) {
    pageSubtitle.textContent = school
      ? `${school.zone} | CIE ${school.cie || network?.cie || '--'} | dados principais e resumos operacionais.`
      : 'Dados principais da unidade, com resumos do inventario, rede e historico.';
  }

  document.getElementById('schoolDetailExecutive').innerHTML = school ? `
    <div class="school-record-info-list">
      <div class="school-record-info-row">
        <span>Municipio</span>
        <strong>${esc(school.zone)}</strong>
      </div>
      <div class="school-record-info-row">
        <span>Codigo CIE</span>
        <strong>${esc(school.cie || network?.cie || '--')}</strong>
      </div>
      <div class="school-record-info-row">
        <span>Status</span>
        <strong>${esc(badgeText(school.status))}</strong>
      </div>
      <div class="school-record-info-row">
        <span>Supervisao</span>
        <strong>${esc(responsibleSupervisorText)}</strong>
      </div>
      <div class="school-record-info-row">
        <span>Ficha</span>
        <strong>${esc(String(completion))}%</strong>
      </div>
    </div>
    <div class="school-record-note-card">
      <strong>Leitura rapida</strong>
      <p>${esc(openCalls.length ? `${openCalls.length} chamado(s) ativo(s).` : 'Sem chamado ativo.')} ${esc(alertUnits ? `${alertUnits} unidade(s) em manutenção/defeito no inventário.` : 'Inventário sem manutenção ou defeito no resumo.')}</p>
    </div>
  ` : '<div class="sync-empty">Nenhuma escola selecionada.</div>';
  const schoolSupervisorSelect = document.getElementById('schoolSupervisorSelect');
  if (schoolSupervisorSelect) {
    schoolSupervisorSelect.innerHTML = '<option value="">Sem supervisor vinculado</option>' + (state.supervisors || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((supervisor) => `<option value="${esc(supervisor.name)}">${esc(supervisor.name)}</option>`)
      .join('');
    schoolSupervisorSelect.value = responsibleSupervisors[0] || '';
  }

  document.getElementById('schoolDetailActions').innerHTML = school ? [
    defectUnits > 0
      ? `<div class="school-record-action-item danger"><strong>Inventário com defeito</strong><span>${esc(String(defectUnits))} unidade(s) com defeito registrado.</span><button class="btn btn-p btn-sm" type="button" onclick="setInventorySchool('${esc(school.name)}')">Abrir inventario</button></div>`
      : '',
    openCalls.length > 0
      ? `<div class="school-record-action-item warn"><strong>Chamados em aberto</strong><span>${esc(String(openCalls.length))} chamado(s) ativo(s) para esta escola.</span><button class="btn btn-g btn-sm" type="button" onclick="openSchoolCalls('${esc(school.name)}')">Abrir chamados</button></div>`
      : '',
    missingFields.length
      ? `<div class="school-record-action-item"><strong>Ficha incompleta</strong><span>Faltam: ${esc(missingFields.slice(0, 4).join(', '))}${missingFields.length > 4 ? '...' : ''}.</span></div>`
      : '',
    (!network || networkGap > 0)
      ? `<div class="school-record-action-item"><strong>Rede e cameras</strong><span>${esc(!network ? 'Ainda nao ha importacao de rede para a unidade.' : `${networkGap} camera(s) fora da cobertura esperada.`)}</span></div>`
      : '',
  ].filter(Boolean).join('') || '<div class="school-record-action-item ok"><strong>Sem pendência registrada</strong><span>Nenhum chamado, defeito ou campo obrigatório pendente para esta escola.</span></div>' : '<div class="sync-empty">Nenhuma escola selecionada.</div>';

  document.getElementById('schoolDetailMetrics').innerHTML = [
    { label: 'Inventario', value: String(totalUnits), note: `${inventoryRows.length} tipo(s)` },
    { label: 'Manut./defeito', value: String(alertUnits), note: defectUnits ? `${defectUnits} com defeito` : 'sem defeito' },
    { label: 'Cameras', value: network?.cameraInstalled ? `${network.cameraWorking || 0}/${network.cameraInstalled}` : '--', note: network ? badgeText(network.status) : 'sem rede' },
    { label: 'Chamados', value: String(openCalls.length), note: plannedTasks.length ? `${plannedTasks.length} tarefa(s)` : 'sem tarefa' }
  ].map((item) => `
    <div class="school-record-metric">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <small>${esc(item.note)}</small>
    </div>
  `).join('');

  document.getElementById('schoolDetailContacts').innerHTML = `
    <div class="school-record-info-list">
      <div class="school-record-info-row"><span>Direcao</span><strong>${esc(profile?.director || 'Nao informado')}</strong></div>
      <div class="school-record-info-row"><span>Vice</span><strong>${esc(profile?.viceDirector || 'Nao informado')}</strong></div>
      <div class="school-record-info-row"><span>PROATI</span><strong>${esc(profile?.proati || 'Nao informado')}</strong></div>
      <div class="school-record-info-row"><span>GOE</span><strong>${esc(profile?.goe || 'Nao informado')}</strong></div>
    </div>
    <div class="school-record-note-card">
      <strong>Contato rapido</strong>
      <div class="school-link-grid">
        ${profile?.phone ? `<a class="btn btn-g btn-sm" href="tel:${esc(profile.phone)}">Ligar ${esc(profile.phone)}</a>` : '<span class="diag-pill">Sem telefone</span>'}
        ${profile?.mobile ? `<a class="btn btn-g btn-sm" href="https://wa.me/${esc(profile.mobile.replace(/\D/g, ''))}" target="_blank" rel="noreferrer">WhatsApp</a>` : '<span class="diag-pill">Sem celular</span>'}
        ${profile?.email ? `<a class="btn btn-g btn-sm" href="mailto:${esc(profile.email)}">E-mail</a>` : '<span class="diag-pill">Sem e-mail</span>'}
        ${profile?.address ? `<a class="btn btn-g btn-sm" href="https://www.google.com/maps/search/${encodeURIComponent(profile.address)}" target="_blank" rel="noreferrer">Mapa</a>` : '<span class="diag-pill">Sem endereco</span>'}
      </div>
      <p>${esc(profile?.address || 'Endereco nao informado')}</p>
      <small>${esc(profile?.notes || 'Sem observacoes adicionais')}</small>
    </div>
  `;

  document.getElementById('schoolDetailInventory').innerHTML = `
    <div class="school-record-tech-card">
      <div>
        <span>Inventario</span>
        <strong>${esc(String(totalUnits))} unidade(s)</strong>
        <small>${esc(String(inventoryRows.length))} tipo(s) | ${esc(String(alertUnits))} manut./defeito</small>
      </div>
      <div class="school-detail-highlight">
        ${inventoryCategories.length ? inventoryCategories.slice(0, 4).map((item) => `<span class="diag-pill">${esc(equipmentTypeLabel(item.category))}: ${esc(String(item.units))}</span>`).join('') : '<span class="diag-pill">Sem tipos consolidados</span>'}
      </div>
      <button class="btn btn-p btn-sm" type="button" onclick="setInventorySchool('${esc(school.name)}')">Abrir inventario da escola</button>
    </div>
  `;

  document.getElementById('schoolDetailNetwork').innerHTML = network ? `
    <div class="school-record-tech-card">
      <div>
        <span>Rede e cameras</span>
        <strong>${esc(network.cameraWorkingLabel || '--')} / ${esc(network.cameraInstalledLabel || '--')}</strong>
        <small>${esc(network.bandwidth || 'banda nao informada')} | Wi-Fi ${esc(network.wifi || '--')}</small>
      </div>
      <div class="school-detail-highlight">
        <span class="diag-pill ${toneBySchool(network.status === 'defeito' ? 'critico' : network.status === 'manutencao' ? 'atencao' : 'estavel')}">${esc(badgeText(network.status))}</span>
        <span class="diag-pill">DVR ${esc(network.dvrBrand || '--')}</span>
        <span class="diag-pill">Firewall ${esc(network.firewallModel || '--')}</span>
      </div>
      <small>Gateway ADM ${esc(network.adminGateway || '--')} | Gateway PED ${esc(network.pedGateway || '--')}</small>
    </div>
  ` : '<div class="school-record-tech-card"><div><span>Rede e cameras</span><strong>Sem dados importados</strong><small>Nenhum registro de rede e cameras para esta escola ainda.</small></div></div>';

  const historyNode = document.getElementById('schoolEventHistory');
  if (historyNode) {
    const history = schoolEventHistory(currentSchoolDetail);
    historyNode.innerHTML = history.map((item) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <strong>${esc(item.text)}</strong>
          <span class="diag-pill">${esc(item.when)}</span>
        </div>
        <div class="sync-meta">${esc(badgeText(item.kind))}</div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhum historico relevante para esta escola ainda.</div>';
  }

  document.getElementById('schoolProfileDirector').value = profile?.director || '';
  document.getElementById('schoolProfileViceDirector').value = profile?.viceDirector || '';
  document.getElementById('schoolProfileProati').value = profile?.proati || '';
  document.getElementById('schoolProfileGoe').value = profile?.goe || '';
  document.getElementById('schoolProfilePhone').value = profile?.phone || '';
  document.getElementById('schoolProfileMobile').value = profile?.mobile || '';
  document.getElementById('schoolProfileEmail').value = profile?.email || '';
  document.getElementById('schoolProfileAddress').value = profile?.address || '';
  document.getElementById('schoolProfileNotes').value = profile?.notes || '';
}

function supervisorIndicatorClass(value) {
  const key = normalizeKey(value);
  if (key.includes('verde')) return 'pill-ok';
  if (key.includes('amarelo')) return 'pill-warn';
  if (key.includes('vermelho')) return 'pill-danger';
  if (key.includes('aviso')) return 'pill-warn';
  return 'pill-info';
}

function supervisorIndicatorText(value) {
  const key = normalizeKey(value);
  if (!key || key.includes('aviso')) return 'AVISO!';
  return badgeText(value);
}

function supervisorOfficialMonthlyVisits(supervisor, fallback) {
  return Number.isFinite(Number(supervisor.monthlyVisits)) ? Number(supervisor.monthlyVisits) : fallback;
}

function supervisorViewMonthIsCurrent() {
  const today = new Date();
  return currentViewDate.getFullYear() === today.getFullYear() && currentViewDate.getMonth() === today.getMonth();
}

function supervisorMonthlyVisitsForView(supervisor, fallback) {
  return supervisorViewMonthIsCurrent() ? supervisorOfficialMonthlyVisits(supervisor, fallback) : fallback;
}

function supervisorOfficialWeeklyVisits(supervisor) {
  return Number.isFinite(Number(supervisor.weeklyVisits)) ? Number(supervisor.weeklyVisits) : 0;
}

function supervisorViewWeekOneStart() {
  const firstDay = new Date(currentViewDate.getFullYear(), currentViewDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return start;
}

function supervisorDateWeekForView(date) {
  const start = supervisorViewWeekOneStart();
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((current - start) / 86400000);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

function supervisorLastWeekOfViewMonth() {
  return supervisorDateWeekForView(new Date(currentViewDate.getFullYear(), currentViewDate.getMonth() + 1, 0));
}

function supervisorVisitsInViewWeek(visits, supervisorName, weekNumber) {
  return (visits || []).filter((visit) => {
    if (visit.supervisor !== supervisorName) return false;
    const date = new Date(`${visit.date}T00:00:00`);
    return supervisorDateWeekForView(date) === weekNumber;
  }).length;
}

function supervisorIndicatorFromGoal(visits, goal) {
  if (!Number(goal || 0)) return 'aviso';
  if (Number(visits || 0) >= Number(goal || 0)) return 'verde';
  return Number(visits || 0) > 0 ? 'amarelo' : 'vermelho';
}

function supervisorWeeklyVisitsForView(supervisor, fallback) {
  return supervisorViewMonthIsCurrent() ? supervisorOfficialWeeklyVisits(supervisor) : fallback;
}

function supervisorGoalPct(visits, goal) {
  const total = Number(goal || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(visits || 0) / total) * 100));
}

function supervisorSheetMetrics(item) {
  const supervisor = item.supervisor || item;
  const assigned = Number(supervisor.assignedSchoolCount || item.assignedSchools?.length || supervisor.schools?.length || 0);
  const weeklyGoal = Number(supervisor.weeklyGoal || 0);
  const monthlyGoal = Number(supervisor.monthlyGoal || 0);
  const weeklyGoalLabel = weeklyGoal ? String(weeklyGoal) : '--';
  const monthlyGoalLabel = monthlyGoal ? String(monthlyGoal) : '--';
  const fallbackWeeklyVisits = Number.isFinite(Number(item.weeklyVisitFallback)) ? Number(item.weeklyVisitFallback) : 0;
  const weeklyVisits = supervisorWeeklyVisitsForView(supervisor, fallbackWeeklyVisits);
  const fallbackVisits = Number.isFinite(Number(item.monthlyVisitFallback)) ? Number(item.monthlyVisitFallback) : item.visits || 0;
  const monthlyVisits = supervisorMonthlyVisitsForView(supervisor, fallbackVisits);
  return {
    assigned,
    weeklyGoal,
    monthlyGoal,
    weeklyGoalLabel,
    monthlyGoalLabel,
    weeklyVisits,
    monthlyVisits,
    pendingMonth: Math.max(0, monthlyGoal - monthlyVisits),
    weeklyIndicator: supervisorViewMonthIsCurrent() ? supervisor.weeklyIndicator || 'aviso' : supervisorIndicatorFromGoal(weeklyVisits, weeklyGoal),
    monthlyIndicator: supervisorViewMonthIsCurrent() ? supervisor.monthlyIndicator || 'aviso' : supervisorIndicatorFromGoal(monthlyVisits, monthlyGoal)
  };
}

function renderSupervisors() {
  const metricCount = document.getElementById('supervisorMetricCount');
  const stats = supervisorStats();
  const visits = state.supervisorVisits || [];
  const viewMonthKey = `${currentViewDate.getFullYear()}-${String(currentViewDate.getMonth() + 1).padStart(2, '0')}`;
  const viewMonthLabel = supervisorSheetMonthLabel(viewMonthKey);
  const assignedSchoolCount = new Set(stats.flatMap((item) => item.assignedSchools)).size;
  const averageCoverage = stats.length
    ? Math.round(stats.reduce((sum, item) => sum + item.coverage, 0) / stats.length)
    : 0;
  if (metricCount) metricCount.textContent = String(stats.length);
  const metricSchools = document.getElementById('supervisorMetricSchools');
  const metricVisits = document.getElementById('supervisorMetricVisits');
  const metricCoverage = document.getElementById('supervisorMetricCoverage');
  if (metricSchools) metricSchools.textContent = String(assignedSchoolCount);
  if (metricVisits) metricVisits.textContent = String(visits.length);
  if (metricCoverage) metricCoverage.textContent = `${averageCoverage}%`;

  const filterSelect = document.getElementById('supervisorFilterSelect');
  const visitSupervisorSelect = document.getElementById('visitSupervisorSelect');
  const visitSchoolSelect = document.getElementById('visitSchoolSelect');
  const supervisorOptions = stats.map(({ supervisor }) => `<option value="${esc(normalizeKey(supervisor.name))}">${esc(supervisor.name)}</option>`).join('');
  if (filterSelect) {
    filterSelect.innerHTML = supervisorOptions;
    filterSelect.value = currentSupervisorFilter;
  }
  if (visitSupervisorSelect) {
    visitSupervisorSelect.innerHTML = stats.map(({ supervisor }) => `<option value="${esc(supervisor.name)}">${esc(supervisor.name)}</option>`).join('');
  }
  if (visitSchoolSelect) {
    const selectedSupervisor = visitSupervisorSelect?.value || stats[0]?.supervisor.name || '';
    const selected = stats.find((item) => item.supervisor.name === selectedSupervisor) || stats[0];
    visitSchoolSelect.innerHTML = (selected?.assignedSchools || visibleSchools().map((school) => school.name))
      .map((school) => `<option value="${esc(school)}">${esc(school)}</option>`)
      .join('');
  }
  const visitDate = document.getElementById('visitDate');
  if (visitDate && !visitDate.value) visitDate.value = new Date().toISOString().slice(0, 10);

  const panelGrid = document.getElementById('supervisorPanelGrid');
  if (panelGrid) {
    const now = currentViewDate;
    const monthVisits = visits.filter((visit) => {
      const date = new Date(`${visit.date}T00:00:00`);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    const monthVisitCounts = monthVisits.reduce((acc, visit) => {
      acc.set(visit.supervisor, (acc.get(visit.supervisor) || 0) + 1);
      return acc;
    }, new Map());
    const currentWeekForRows = supervisorViewMonthIsCurrent() ? null : supervisorLastWeekOfViewMonth();
    const weekVisitCounts = visits.reduce((acc, visit) => {
      const week = supervisorDateWeekForView(new Date(`${visit.date}T00:00:00`));
      const key = `${visit.supervisor}|${week}`;
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());
    const sheetRows = stats.map((item) => {
      const supervisor = item.supervisor;
      const localCount = monthVisitCounts.get(supervisor.name) || 0;
      const currentWeek = currentWeekForRows || Number(supervisor.currentWeek || 0);
      const localWeekCount = weekVisitCounts.get(`${supervisor.name}|${currentWeek}`) || 0;
      const assigned = Number(supervisor.assignedSchoolCount || item.assignedSchools.length || 0);
      const weeklyGoal = Number(supervisor.weeklyGoal || 0);
      const monthlyGoal = Number(supervisor.monthlyGoal || 0);
      const weeklyGoalLabel = weeklyGoal ? String(weeklyGoal) : '--';
      const monthlyGoalLabel = monthlyGoal ? String(monthlyGoal) : '--';
      const weeklyVisits = supervisorWeeklyVisitsForView(supervisor, localWeekCount);
      const monthlyVisits = supervisorMonthlyVisitsForView(supervisor, localCount);
      const weeklyIndicator = supervisorViewMonthIsCurrent() ? supervisor.weeklyIndicator || 'aviso' : supervisorIndicatorFromGoal(weeklyVisits, weeklyGoal);
      const monthlyIndicator = supervisorViewMonthIsCurrent() ? supervisor.monthlyIndicator || 'aviso' : supervisorIndicatorFromGoal(monthlyVisits, monthlyGoal);
      return {
        item,
        supervisor,
        assigned,
        weeklyGoal,
        monthlyGoal,
        weeklyGoalLabel,
        monthlyGoalLabel,
        currentWeek,
        weeklyVisits,
        monthlyVisits,
        weeklyIndicator,
        monthlyIndicator
      };
    });
    const syncedCount = sheetRows.filter((row) => row.supervisor.sourceSyncedAt).length;
    panelGrid.innerHTML = `
      ${supervisorAprilNoticeMarkup(viewMonthKey)}
      <div class="supervisor-sheet-table-wrap">
        <table class="supervisor-sheet-table">
          <thead>
            <tr>
              <th>Supervisor</th>
              <th>Escolas</th>
              <th>Meta semanal</th>
              <th>Meta mensal</th>
              <th>Semana</th>
              <th>Indicador semana</th>
              <th>Indicador mes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sheetRows.map((row) => `
              <tr class="supervisor-sheet-row" onclick="openSupervisorRecord('${esc(row.supervisor.name)}')">
                <td>
                  <strong>${esc(row.supervisor.name)}</strong>
                </td>
                <td>${esc(String(row.assigned || row.item.assignedSchools.length))}</td>
                <td class="supervisor-goal-cell">
                  <strong>${esc(String(row.weeklyVisits))}/${esc(row.weeklyGoalLabel)}</strong>
                  <div class="supervisor-sheet-bar"><span style="width:${esc(String(Math.max(4, supervisorGoalPct(row.weeklyVisits, row.weeklyGoal))))}%"></span></div>
                </td>
                <td class="supervisor-goal-cell">
                  <strong>${esc(String(row.monthlyVisits))}/${esc(row.monthlyGoalLabel)}</strong>
                  <div class="supervisor-sheet-bar"><span style="width:${esc(String(Math.max(4, supervisorGoalPct(row.monthlyVisits, row.monthlyGoal))))}%"></span></div>
                </td>
                <td>${esc(String(row.currentWeek || '--'))}</td>
                <td><span class="diag-pill ${supervisorIndicatorClass(row.weeklyIndicator)}">${esc(supervisorIndicatorText(row.weeklyIndicator))}</span></td>
                <td><span class="diag-pill ${supervisorIndicatorClass(row.monthlyIndicator)}">${esc(supervisorIndicatorText(row.monthlyIndicator))}</span></td>
                <td><button class="btn btn-g btn-sm" type="button" onclick="event.stopPropagation(); openSupervisorRecord('${esc(row.supervisor.name)}')">Abrir</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="supervisor-sheet-foot">
        <span>Fonte: planilha oficial de supervisao | Mes exibido: ${esc(viewMonthLabel)}</span>
        <span>${esc(syncedCount ? `Atualizada em ${timestampLabel(new Date(sheetRows.find((row) => row.supervisor.sourceSyncedAt)?.supervisor.sourceSyncedAt || Date.now()))}` : 'Aguardando sincronizacao')}</span>
      </div>
    `;
  }
  const selectorList = document.getElementById('supervisorSelectorList');
  if (selectorList) {
    const now = currentViewDate;
    const selectedMonthVisitCounts = visits.reduce((acc, visit) => {
      const date = new Date(`${visit.date}T00:00:00`);
      if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return acc;
      acc.set(visit.supervisor, (acc.get(visit.supervisor) || 0) + 1);
      return acc;
    }, new Map());
    const selectedWeek = supervisorViewMonthIsCurrent() ? null : supervisorLastWeekOfViewMonth();
    const selectedWeekVisitCounts = visits.reduce((acc, visit) => {
      const week = supervisorDateWeekForView(new Date(`${visit.date}T00:00:00`));
      const key = `${visit.supervisor}|${week}`;
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());
    selectorList.innerHTML = stats.map((item) => `
      <div class="setechub-item setechub-clickable supervisor-list-card" onclick="openSupervisorRecord('${esc(item.supervisor.name)}')">
        ${(() => {
          const selectedMonthCount = selectedMonthVisitCounts.get(item.supervisor.name) || 0;
          const selectedWeekNumber = selectedWeek || Number(item.supervisor.currentWeek || 0);
          const selectedWeekCount = selectedWeekVisitCounts.get(`${item.supervisor.name}|${selectedWeekNumber}`) || 0;
          const metrics = supervisorSheetMetrics({ ...item, monthlyVisitFallback: selectedMonthCount, weeklyVisitFallback: selectedWeekCount });
          const monthlyIndicator = metrics.monthlyIndicator;
          return `
            <div class="setechub-head">
              <div>
                <strong>${esc(item.supervisor.name)}</strong>
                <div class="sync-meta">${esc(item.supervisor.email || '')} | ${esc(item.supervisor.phone || '')}</div>
              </div>
              <span class="diag-pill ${supervisorIndicatorClass(monthlyIndicator)}">${esc(supervisorIndicatorText(monthlyIndicator))}</span>
            </div>
            <div class="school-overview-kpis supervisor-list-kpis">
              <div><span>Mes</span><strong>${esc(String(metrics.monthlyVisits))}/${esc(metrics.monthlyGoalLabel)}</strong></div>
              <div><span>Semana</span><strong>${esc(String(metrics.weeklyVisits))}/${esc(metrics.weeklyGoalLabel)}</strong></div>
              <div><span>Escolas</span><strong>${esc(String(metrics.assigned))}</strong></div>
              <div><span>Faltam</span><strong>${esc(metrics.monthlyGoal ? String(metrics.pendingMonth) : '--')}</strong></div>
            </div>
          `;
        })()}
      </div>
    `).join('') || '<div class="sync-empty">Nenhum supervisor cadastrado.</div>';
  }

  const overviewPanel = document.getElementById('supervisorOverviewPanel');
  if (overviewPanel) {
    const totalGoal = stats.reduce((sum, item) => sum + Number(item.supervisor.monthlyGoal || 0), 0);
    const metGoals = stats.filter((item) => Number(item.supervisor.monthlyGoal || 0) > 0 && item.visits >= Number(item.supervisor.monthlyGoal || 0)).length;
    overviewPanel.innerHTML = `
      <div class="school-overview-kpis">
        <div><span>Meta total</span><strong>${esc(String(totalGoal))}</strong></div>
        <div><span>Cumpriram</span><strong>${esc(String(metGoals))}</strong></div>
        <div><span>Pendentes</span><strong>${esc(String(Math.max(0, stats.length - metGoals)))}</strong></div>
        <div><span>Cobertura</span><strong>${esc(String(averageCoverage))}%</strong></div>
      </div>
    `;
  }

  const attentionList = document.getElementById('supervisorAttentionList');
  if (attentionList) {
    attentionList.innerHTML = stats
      .filter((item) => Number(item.supervisor.monthlyGoal || 0) > 0 && item.visits < Number(item.supervisor.monthlyGoal || 0))
      .slice(0, 6)
      .map((item) => `
        <div class="setechub-item setechub-clickable" onclick="openSupervisorRecord('${esc(item.supervisor.name)}')">
          <div class="setechub-head">
            <div>
              <strong>${esc(item.supervisor.name)}</strong>
              <div class="sync-meta">${esc(String(item.visits))}/${esc(String(item.supervisor.monthlyGoal || '--'))} visita(s) no periodo de teste</div>
            </div>
            <span class="diag-pill pill-warn">Meta pendente</span>
          </div>
        </div>
      `).join('') || '<div class="sync-empty">Nenhuma pendencia geral de supervisao.</div>';
  }

  const summaryTable = document.getElementById('supervisorVisitTable');
  if (summaryTable) {
    summaryTable.innerHTML = visits.length ? `
      <table class="setechub-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Supervisor</th>
            <th>Escola</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          ${visits.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12).map((visit) => `
            <tr>
              <td>${esc(visit.date || '--')}</td>
              <td><button class="link-button" type="button" onclick="openSupervisorRecord('${esc(visit.supervisor)}')">${esc(visit.supervisor)}</button></td>
              <td><button class="link-button" type="button" onclick="openSchoolRecord('${esc(visit.school)}')">${esc(visit.school)}</button></td>
              <td><span class="diag-pill">${esc(visit.type || 'Visita')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="sync-empty">Nenhuma visita registrada ainda.</div>';
  }
  return;

  const now = currentViewDate;
  const year = now.getFullYear();
  const month = now.getMonth();
  const selectedAllVisits = selectedStat
    ? (state.supervisorVisits || []).filter((visit) => visit.supervisor === selectedStat.supervisor.name)
    : [];
  const selectedVisits = selectedAllVisits.filter((visit) => {
    const date = new Date(`${visit.date}T00:00:00`);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const visitedSchoolSet = new Set(selectedVisits.map((visit) => visit.school));
  const pendingSchools = selectedStat
    ? selectedStat.assignedSchools.filter((school) => !visitedSchoolSet.has(school))
    : [];
  const monthlyGoal = selectedStat ? Number(selectedStat.supervisor.monthlyGoal || 0) : 0;
  const monthlyVisitCount = selectedVisits.length;
  const goalPct = selectedStat && monthlyGoal ? Math.min(100, Math.round((monthlyVisitCount / monthlyGoal) * 100)) : 0;
  const goalMet = selectedStat && monthlyGoal > 0 && monthlyVisitCount >= monthlyGoal;
  const monthlyGoalLabel = monthlyGoal ? String(monthlyGoal) : '--';

  const profilePanel = document.getElementById('supervisorProfilePanel');
  if (profilePanel) {
    profilePanel.innerHTML = selectedStat ? `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong>${esc(selectedStat.supervisor.name)}</strong>
            <div class="sync-meta">${esc(selectedStat.supervisor.email || '')} | ${esc(selectedStat.supervisor.phone || '')}</div>
          </div>
          <span class="diag-pill ${goalMet ? 'pill-ok' : 'pill-warn'}">${goalMet ? 'Meta cumprida' : 'Meta pendente'}</span>
        </div>
      </div>
      <div class="school-overview-kpis">
        <div><span>Escolas</span><strong>${esc(String(selectedStat.assignedSchools.length))}</strong></div>
        <div><span>Mes</span><strong>${esc(String(monthlyVisitCount))}</strong></div>
        <div><span>Visitadas</span><strong>${esc(String(visitedSchoolSet.size))}</strong></div>
        <div><span>Faltam</span><strong>${esc(String(pendingSchools.length))}</strong></div>
      </div>
    ` : '<div class="sync-empty">Selecione um supervisor para abrir o painel.</div>';
  }

  const goalPanel = document.getElementById('supervisorGoalPanel');
  if (goalPanel) {
    goalPanel.innerHTML = selectedStat ? `
      <div class="setechub-command-score supervisor-goal-score">
        <div>
          <div class="sync-meta">Meta mensal</div>
          <strong>${esc(String(monthlyVisitCount))}/${esc(monthlyGoalLabel)}</strong>
        </div>
        <span class="diag-pill ${goalMet ? 'pill-ok' : 'pill-warn'}">${monthlyGoal ? `${esc(String(goalPct))}%` : '--'}</span>
      </div>
      <div class="setechub-bar"><span style="width:${esc(String(Math.max(4, goalPct)))}%"></span></div>
      <div class="sync-meta">${monthlyGoal ? (goalMet ? 'Supervisor ja atingiu a meta de visitas no mes atual.' : `Faltam ${esc(String(Math.max(0, monthlyGoal - monthlyVisitCount)))} visita(s) para cumprir a meta do mes.`) : 'Meta mensal aguardando leitura da planilha oficial.'}</div>
    ` : '<div class="sync-empty">Sem meta calculada.</div>';
  }

  const calendar = document.getElementById('supervisorCalendarGrid');
  if (calendar) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const visitsByDay = selectedVisits.reduce((acc, visit) => {
      const date = new Date(`${visit.date}T00:00:00`);
      if (date.getFullYear() !== year || date.getMonth() !== month) return acc;
      const day = date.getDate();
      if (!acc[day]) acc[day] = [];
      acc[day].push(visit);
      return acc;
    }, {});
    const blanks = Array.from({ length: firstWeekday }, () => '<div class="supervisor-calendar-day empty"></div>');
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dayVisits = visitsByDay[day] || [];
      return `
        <div class="supervisor-calendar-day ${dayVisits.length ? 'has-visit' : ''}">
          <strong>${esc(String(day))}</strong>
          <span>${dayVisits.length ? `${esc(String(dayVisits.length))} visita(s)` : ''}</span>
        </div>
      `;
    });
    calendar.innerHTML = [
      '<div class="supervisor-calendar-week">Dom</div><div class="supervisor-calendar-week">Seg</div><div class="supervisor-calendar-week">Ter</div><div class="supervisor-calendar-week">Qua</div><div class="supervisor-calendar-week">Qui</div><div class="supervisor-calendar-week">Sex</div><div class="supervisor-calendar-week">Sab</div>',
      ...blanks,
      ...days
    ].join('');
  }

  const visitedNode = document.getElementById('supervisorVisitedSchools');
  if (visitedNode) {
    const visited = selectedStat ? selectedStat.assignedSchools.filter((school) => visitedSchoolSet.has(school)) : [];
    visitedNode.innerHTML = visited.map((school) => {
      const schoolVisits = selectedVisits.filter((visit) => visit.school === school);
      const lastVisit = schoolVisits.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      return `
        <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(school)}')">
          <div class="setechub-head">
            <div>
              <strong>${esc(school)}</strong>
              <div class="sync-meta">${esc(String(schoolVisits.length))} visita(s) | ultima em ${esc(lastVisit?.date || '--')}</div>
            </div>
            <span class="diag-pill pill-ok">Visitada</span>
          </div>
        </div>
      `;
    }).join('') || '<div class="sync-empty">Nenhuma escola visitada neste recorte.</div>';
  }

  const pendingNode = document.getElementById('supervisorPendingSchools');
  if (pendingNode) {
    pendingNode.innerHTML = pendingSchools.map((school) => `
      <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(school)}')">
        <div class="setechub-head">
          <div>
            <strong>${esc(school)}</strong>
            <div class="sync-meta">Sem visita registrada para ${esc(selectedStat?.supervisor.name || 'o supervisor')}.</div>
          </div>
          <span class="diag-pill pill-warn">Pendente</span>
        </div>
      </div>
    `).join('') || '<div class="sync-empty">Todas as escolas vinculadas possuem visita registrada.</div>';
  }

  const matrix = document.getElementById('supervisorSchoolMatrix');
  if (matrix) {
    matrix.innerHTML = filteredStats.map((item) => `
      <article class="supervisor-card">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.supervisor.name)}</strong>
            <div class="sync-meta">${esc(item.supervisor.email || '')} | ${esc(item.supervisor.phone || '')}</div>
          </div>
          <span class="diag-pill">${esc(item.supervisor.source === 'teste' ? 'dados teste' : 'oficial')}</span>
        </div>
        <div class="school-overview-kpis">
          <div><span>Escolas</span><strong>${esc(String(item.assignedSchools.length))}</strong></div>
          <div><span>Visitas</span><strong>${esc(String(item.visits))}</strong></div>
          <div><span>Cobertura</span><strong>${esc(String(item.coverage))}%</strong></div>
          <div><span>Chamados</span><strong>${esc(String(item.openCalls))}</strong></div>
        </div>
        <div class="supervisor-school-list">
          ${item.assignedSchools.map((schoolName) => {
            const signal = schoolByName(schoolName) ? schoolOperationalSnapshot(schoolByName(schoolName)) : null;
            const wasVisited = visitedSchoolSet.has(schoolName);
            return `
              <button class="supervisor-school-row" type="button" onclick="openSchoolRecord('${esc(schoolName)}')">
                <span>${esc(schoolName)}</span>
                <strong>${wasVisited ? 'visitada' : `${esc(String(signal?.alertUnits || 0))} manut./defeito`}</strong>
              </button>
            `;
          }).join('')}
        </div>
      </article>
    `).join('') || '<div class="sync-empty">Nenhum supervisor encontrado.</div>';
  }

  const table = document.getElementById('supervisorVisitTable');
  if (table) {
    table.innerHTML = visits.length ? `
      <table class="setechub-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Supervisor</th>
            <th>Escola</th>
            <th>Tipo</th>
            <th>Observacao</th>
          </tr>
        </thead>
        <tbody>
          ${visits.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((visit) => `
            <tr>
              <td>${esc(visit.date || '--')}</td>
              <td>${esc(visit.supervisor)}</td>
              <td><button class="link-button" type="button" onclick="openSchoolRecord('${esc(visit.school)}')">${esc(visit.school)}</button></td>
              <td><span class="diag-pill">${esc(visit.type || 'Visita')}</span></td>
              <td>${esc(visit.notes || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="sync-empty">Nenhuma visita registrada neste recorte.</div>';
  }
}

function renderSupervisorRecord() {
  const profileHost = document.getElementById('supervisorRecordProfile');
  if (!profileHost) return;
  const select = document.getElementById('supervisorRecordSelect');
  const stats = supervisorStats();
  if (!stats.length) {
    profileHost.innerHTML = '<div class="sync-empty">Nenhum supervisor cadastrado.</div>';
    return;
  }
  if (!currentSupervisorDetail || !stats.some((item) => item.supervisor.name === currentSupervisorDetail)) {
    currentSupervisorDetail = stats[0].supervisor.name;
  }
  currentSupervisorFilter = normalizeKey(currentSupervisorDetail);
  const selectedStat = stats.find((item) => item.supervisor.name === currentSupervisorDetail) || stats[0];
  const supervisor = selectedStat.supervisor;
  const now = currentViewDate;
  const year = now.getFullYear();
  const month = now.getMonth();
  const viewMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const viewMonthLabel = supervisorSheetMonthLabel(viewMonthKey);
  const allVisits = getDerivedCache().visitsBySupervisor.get(supervisor.name) || [];
  const monthVisits = allVisits.filter((visit) => {
    const date = new Date(`${visit.date}T00:00:00`);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const selectedWeek = supervisorViewMonthIsCurrent() ? Number(supervisor.currentWeek || 0) : supervisorLastWeekOfViewMonth();
  const selectedWeekVisits = allVisits.reduce((sum, visit) => {
    const date = new Date(`${visit.date}T00:00:00`);
    return sum + (supervisorDateWeekForView(date) === selectedWeek ? 1 : 0);
  }, 0);
  const visitedSchoolSet = new Set(monthVisits.map((visit) => visit.school));
  const pendingSchools = selectedStat.assignedSchools.filter((school) => !visitedSchoolSet.has(school));
  const monthVisitsBySchool = monthVisits.reduce((acc, visit) => {
    const bucket = acc.get(visit.school) || [];
    bucket.push(visit);
    acc.set(visit.school, bucket);
    return acc;
  }, new Map());
  const sheetMetrics = supervisorSheetMetrics({ ...selectedStat, monthlyVisitFallback: monthVisits.length, weeklyVisitFallback: selectedWeekVisits });
  const monthlyGoal = sheetMetrics.monthlyGoal;
  const weeklyGoal = sheetMetrics.weeklyGoal;
  const weeklyGoalLabel = sheetMetrics.weeklyGoalLabel;
  const monthlyVisitCount = sheetMetrics.monthlyVisits;
  const weeklyVisitCount = sheetMetrics.weeklyVisits;
  const goalPct = monthlyGoal ? Math.min(100, Math.round((monthlyVisitCount / monthlyGoal) * 100)) : 0;
  const weeklyGoalPct = weeklyGoal ? Math.min(100, Math.round((weeklyVisitCount / weeklyGoal) * 100)) : 0;
  const goalMet = monthlyGoal > 0 && monthlyVisitCount >= monthlyGoal;
  const weeklyGoalMet = weeklyGoal > 0 && weeklyVisitCount >= weeklyGoal;
  const monthlyGoalLabel = monthlyGoal ? String(monthlyGoal) : '--';
  const monthlyIndicator = sheetMetrics.monthlyIndicator;
  const weeklyIndicator = sheetMetrics.weeklyIndicator;
  const sourceUpdatedLabel = supervisor.sourceSyncedAt ? timestampLabel(new Date(supervisor.sourceSyncedAt)) : 'Sem leitura recente';

  if (select) {
    select.innerHTML = stats.map((item) => `<option value="${esc(item.supervisor.name)}">${esc(item.supervisor.name)}</option>`).join('');
    select.value = supervisor.name;
  }

  const title = document.getElementById('supervisorRecordTitle');
  const subtitle = document.getElementById('supervisorRecordSubtitle');
  if (title) title.textContent = supervisor.name;
  if (subtitle) subtitle.textContent = `${sheetMetrics.assigned} escola(s) | ${monthlyVisitCount}/${monthlyGoalLabel} visita(s) em ${viewMonthLabel} | ${monthlyGoal ? (goalMet ? 'meta cumprida' : 'meta pendente') : 'meta aguardando planilha'}.`;
  const goalTitle = document.querySelector('#supervisorRecordGoal')?.closest('.box')?.querySelector('.ct');
  const goalSubtitle = document.querySelector('#supervisorRecordGoal')?.closest('.box')?.querySelector('.cs');
  if (goalTitle) goalTitle.textContent = 'Metas do supervisor';
  if (goalSubtitle) goalSubtitle.textContent = 'Acompanhamento semanal e mensal da planilha oficial.';
  const visitCorrectionTitle = document.querySelector('#supervisorRecordVisitForm .ct');
  const visitCorrectionSubtitle = document.querySelector('#supervisorRecordVisitForm .cs');
  if (visitCorrectionTitle) visitCorrectionTitle.textContent = 'Correcao de visitas';
  if (visitCorrectionSubtitle) visitCorrectionSubtitle.textContent = 'Use este aviso quando uma visita estiver errada ou faltando.';
  const refreshButton = document.getElementById('refreshSupervisorSheetBtn');
  if (refreshButton) {
    refreshButton.hidden = true;
    refreshButton.disabled = false;
    refreshButton.textContent = 'Atualizar planilha';
  }

  profileHost.innerHTML = `
    <div class="setechub-item">
      <div class="setechub-head">
        <div>
          <strong>${esc(supervisor.name)}</strong>
          <div class="supervisor-profile-meta">
            ${supervisor.email ? `<a href="mailto:${esc(supervisor.email)}">${esc(supervisor.email)}</a>` : ''}
            ${supervisor.phone ? `<span>${esc(supervisor.phone)}</span>` : ''}
            <span>${esc(sourceUpdatedLabel)}</span>
          </div>
        </div>
        <span class="diag-pill ${supervisorIndicatorClass(monthlyIndicator)}">${esc(supervisorIndicatorText(monthlyIndicator))}</span>
      </div>
    </div>
  `;

  document.getElementById('supervisorRecordGoal').innerHTML = `
    <div class="supervisor-goal-grid">
      <div class="setechub-command-score supervisor-goal-score">
        <div>
          <div class="supervisor-goal-head">
            <span class="sync-meta">Meta semanal</span>
            <span class="supervisor-goal-status ${supervisorIndicatorClass(weeklyIndicator)}">${esc(supervisorIndicatorText(weeklyIndicator))}</span>
          </div>
          <strong>${esc(String(weeklyVisitCount))}/${esc(weeklyGoalLabel)}</strong>
        </div>
        <div class="setechub-bar"><span style="width:${esc(String(Math.max(4, weeklyGoalPct)))}%"></span></div>
        <div class="supervisor-goal-caption">${weeklyGoal ? (weeklyGoalMet ? `Semana ${esc(String(selectedWeek))} concluida.` : `Faltam ${esc(String(Math.max(0, weeklyGoal - weeklyVisitCount)))} visita(s) na semana ${esc(String(selectedWeek))}.`) : 'Meta semanal aguardando planilha.'}</div>
      </div>
      <div class="setechub-command-score supervisor-goal-score">
        <div>
          <div class="supervisor-goal-head">
            <span class="sync-meta">Meta mensal</span>
            <span class="supervisor-goal-status ${supervisorIndicatorClass(monthlyIndicator)}">${esc(supervisorIndicatorText(monthlyIndicator))}</span>
          </div>
          <strong>${esc(String(monthlyVisitCount))}/${esc(monthlyGoalLabel)}</strong>
        </div>
        <div class="setechub-bar"><span style="width:${esc(String(Math.max(4, goalPct)))}%"></span></div>
        <div class="supervisor-goal-caption">${monthlyGoal ? (goalMet ? `Meta de ${esc(viewMonthLabel)} concluida.` : `Faltam ${esc(String(Math.max(0, monthlyGoal - monthlyVisitCount)))} visita(s) em ${esc(viewMonthLabel)}.`) : 'Meta mensal aguardando planilha.'}</div>
      </div>
    </div>
  `;

  document.getElementById('supervisorRecordMetrics').innerHTML = [
    { label: 'Escolas', value: String(sheetMetrics.assigned), note: `${visitedSchoolSet.size} visitada(s) no mes`, target: 'supervisorRecordSchoolMatrix' },
    { label: 'Semana atual', value: `${weeklyVisitCount}/${weeklyGoalLabel}`, note: supervisorIndicatorText(weeklyIndicator), tone: weeklyIndicator, target: 'supervisorRecordGoal' },
    { label: 'Mes atual', value: `${monthlyVisitCount}/${monthlyGoalLabel}`, note: supervisorIndicatorText(monthlyIndicator), tone: monthlyIndicator, target: 'supervisorRecordGoal' },
    { label: 'Faltantes', value: monthlyGoal ? String(sheetMetrics.pendingMonth) : '--', note: 'Abrir lista', target: 'supervisorRecordPending' },
    { label: 'Chamados', value: String(selectedStat.openCalls), note: 'Pendencias das escolas', target: 'supervisorRecordSchoolMatrix' },
    { label: 'Historico', value: String(allVisits.length), note: 'Ver registros', target: 'supervisorRecordVisitTable' }
  ].map((item) => `
    <div class="setechub-monitor-card compact supervisor-metric-card ${item.target ? 'setechub-clickable' : ''}" ${item.target ? `onclick="document.getElementById('${esc(item.target)}')?.scrollIntoView({ behavior: 'smooth', block: 'start' })"` : ''}>
      <div class="supervisor-metric-head">
        <div class="supervisor-metric-label">${esc(item.label)}</div>
      </div>
      <strong>${esc(item.value)}</strong>
      <div class="supervisor-metric-note">${esc(item.note)}</div>
    </div>
  `).join('');

  const visitForm = document.getElementById('supervisorRecordVisitFormElement');
  if (visitForm) visitForm.hidden = true;
  const visitNoticeHost = document.getElementById('supervisorRecordVisitNotice') || document.getElementById('supervisorRecordVisitForm');
  if (visitNoticeHost) {
    visitNoticeHost.innerHTML = `
      <div class="supervisor-visit-notice-card">
        <strong>Visita errada ou faltando?</strong>
        <span>Confira a escola, a data e o supervisor na planilha oficial. Se a divergencia continuar, entre em contato com o gabinete para correcao do registro.</span>
        <div class="mini-actions">
          <button class="btn btn-g btn-sm" type="button" data-scroll-target="supervisorRecordVisitTable">Ver registros</button>
        </div>
      </div>
    `;
  }

  const weeklyMatrixBox = document.getElementById('supervisorRecordWeeklyMatrixBox');
  if (weeklyMatrixBox && !weeklyMatrixBox.hidden && typeof renderSupervisorWeeklyMatrixForRecord === 'function') {
    renderSupervisorWeeklyMatrixForRecord(selectedStat, allVisits);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const visitsByDay = monthVisits.reduce((acc, visit) => {
    const day = new Date(`${visit.date}T00:00:00`).getDate();
    if (!acc[day]) acc[day] = [];
    acc[day].push(visit);
    return acc;
  }, {});
  const blanks = Array.from({ length: firstWeekday }, () => '<div class="supervisor-calendar-day empty"></div>');
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const dayVisits = visitsByDay[day] || [];
    return `
      <div class="supervisor-calendar-day ${dayVisits.length ? 'has-visit' : ''}">
        <strong>${esc(String(day))}</strong>
        <span>${dayVisits.length ? `${esc(String(dayVisits.length))} visita(s)` : ''}</span>
      </div>
    `;
  });
  document.getElementById('supervisorRecordCalendarGrid').innerHTML = [
    '<div class="supervisor-calendar-week">Dom</div><div class="supervisor-calendar-week">Seg</div><div class="supervisor-calendar-week">Ter</div><div class="supervisor-calendar-week">Qua</div><div class="supervisor-calendar-week">Qui</div><div class="supervisor-calendar-week">Sex</div><div class="supervisor-calendar-week">Sab</div>',
    ...blanks,
    ...days
  ].join('');

  const visitedSchools = selectedStat.assignedSchools.filter((school) => visitedSchoolSet.has(school));
  document.getElementById('supervisorRecordVisitedSchools').innerHTML = visitedSchools.map((school) => {
    const schoolVisits = monthVisitsBySchool.get(school) || [];
    const lastVisit = schoolVisits.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return `
      <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(school)}')">
        <div class="setechub-head">
          <div>
            <strong>${esc(school)}</strong>
            <div class="sync-meta">${esc(String(schoolVisits.length))} visita(s) | ultima em ${esc(lastVisit?.date || '--')}</div>
          </div>
          <span class="diag-pill pill-ok">Visitada</span>
        </div>
      </div>
    `;
  }).join('') || '<div class="sync-empty">Nenhuma escola visitada no mes atual.</div>';

  document.getElementById('supervisorRecordPendingSchools').innerHTML = pendingSchools.map((school) => `
    <div class="setechub-item setechub-clickable" onclick="openSchoolRecord('${esc(school)}')">
      <div class="setechub-head">
        <div>
          <strong>${esc(school)}</strong>
          <div class="sync-meta">Ainda sem visita registrada no mes atual.</div>
        </div>
        <span class="diag-pill pill-warn">Pendente</span>
      </div>
    </div>
  `).join('') || '<div class="sync-empty">Todas as escolas vinculadas possuem visita no mes.</div>';

  document.getElementById('supervisorRecordSchoolMatrix').innerHTML = `
    <article class="supervisor-card">
      <div class="supervisor-school-list">
        ${selectedStat.assignedSchools.map((schoolName) => {
          const signal = schoolByName(schoolName) ? schoolOperationalSnapshot(schoolByName(schoolName)) : null;
          const wasVisited = visitedSchoolSet.has(schoolName);
          return `
            <button class="supervisor-school-row" type="button" onclick="openSchoolRecord('${esc(schoolName)}')">
              <span>${esc(schoolName)}</span>
              <strong>${wasVisited ? 'visitada' : `${esc(String(signal?.alertUnits || 0))} manut./defeito`}</strong>
            </button>
          `;
        }).join('')}
      </div>
    </article>
  `;

  const recordSchoolSelect = document.getElementById('recordVisitSchoolSelect');
  if (recordSchoolSelect) {
    recordSchoolSelect.innerHTML = selectedStat.assignedSchools.map((school) => `<option value="${esc(school)}">${esc(school)}</option>`).join('');
  }
  const recordDate = document.getElementById('recordVisitDate');
  if (recordDate && !recordDate.value) recordDate.value = new Date().toISOString().slice(0, 10);

  const visibleVisitRows = allVisits.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 80);
  document.getElementById('supervisorRecordVisitsTable').innerHTML = allVisits.length ? `
    <table class="setechub-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Escola</th>
          <th>Tipo</th>
          <th>Observacao</th>
        </tr>
      </thead>
      <tbody>
        ${visibleVisitRows.map((visit) => `
          <tr>
            <td>${esc(visit.date || '--')}</td>
            <td><button class="link-button" type="button" onclick="openSchoolRecord('${esc(visit.school)}')">${esc(visit.school)}</button></td>
            <td><span class="diag-pill">${esc(visit.type || 'Visita')}</span></td>
            <td>${esc(visit.notes || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${listLimitNotice(allVisits.length, 80, 'visitas do supervisor')}
  ` : '<div class="sync-empty">Nenhuma visita registrada para este supervisor.</div>';
}

function supervisorSheetMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  const names = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  if (!year || !month || month < 1 || month > 12) return 'mes nao informado';
  return `${names[month - 1]} de ${year}`;
}

function supervisorAprilNoticeMarkup(monthKey) {
  if (monthKey !== '2026-04') return '';
  return `
    <div class="supervisor-april-notice" role="note">
      <strong>AVISO IMPORTANTE SOBRE ABRIL</strong>
      <span>A planilha de abril foi usada apenas como teste de importacao e validacao do painel. Abril nao sera considerado para acompanhamento oficial; a partir de maio a supervisao usa a planilha oficial nova.</span>
    </div>
  `;
}

function supervisorMonthlySheetLinks() {
  return (state.officialLinks || [])
    .filter((item) => item.category === 'supervisor-sheet')
    .sort((a, b) => String(b.monthKey || '').localeCompare(String(a.monthKey || '')));
}

function renderOfficialData() {
  const list = document.getElementById('officialList');
  const adminActions = canManageUsers();
  if (list) {
    list.innerHTML = state.officialLinks.slice(0, 6).map((item) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <strong>${esc(item.label)}</strong>
        </div>
        <div class="sync-meta"><a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.url)}</a></div>
      </div>
    `).join('');
  }
  const linksList = document.getElementById('officialLinksList');
  if (linksList) {
    linksList.innerHTML = state.officialLinks.map((item) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.label)}</strong>
            <div class="sync-meta"><a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.url)}</a></div>
          </div>
          ${adminActions ? `<button class="btn btn-d btn-sm" onclick="removeOfficialLink(${item.id})">Remover</button>` : ''}
        </div>
      </div>
    `).join('');
  }
  const monthlyList = document.getElementById('monthlySupervisorSheetsList');
  if (monthlyList) {
    const links = supervisorMonthlySheetLinks();
    monthlyList.innerHTML = links.map((item) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.label || `Planilha ${supervisorSheetMonthLabel(item.monthKey)}`)}</strong>
            <div class="sync-meta">${esc(supervisorSheetMonthLabel(item.monthKey))}</div>
            <div class="sync-meta"><a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.url)}</a></div>
          </div>
          ${adminActions ? `<div class="mini-actions"><button class="btn btn-p btn-sm" onclick="syncSupervisorMonthlySheet(${item.id})">Atualizar dados</button><button class="btn btn-d btn-sm" onclick="removeOfficialLink(${item.id})">Remover</button></div>` : ''}
        </div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhuma planilha mensal cadastrada ainda.</div>';
  }
  const office = document.getElementById('officeContact');
  if (office) {
    office.innerHTML = `
      <div class="setechub-item">
        <div class="setechub-head">
          <strong>${esc(state.officialContacts.officeName || 'URE Itapeva')}</strong>
          <span class="diag-pill pill-info">Dirigente</span>
        </div>
        <div class="sync-meta">${esc(state.officialContacts.dirigente || '')}${state.officialContacts.since ? ` | desde ${esc(state.officialContacts.since)}` : ''}</div>
      </div>
      <div class="setechub-item">
        <strong>Contato principal</strong>
        <div class="sync-meta">${esc(state.officialContacts.address || '')}</div>
        <div class="sync-meta">${esc(state.officialContacts.phone || '')} | ${esc(state.officialContacts.email || '')}</div>
      </div>
    `;
  }
  const officeInput = document.getElementById('officeContactInput');
  if (officeInput) officeInput.value = state.officialContacts.office;
}

function carStatusTone(status) {
  const key = normalizeKey(status || '');
  if (['cancelado', 'cancelada', 'bloqueado', 'indisponivel', 'recusado', 'reprovado'].some((item) => key.includes(item))) return 'danger';
  if (['pendente', 'aguardando', 'solicitado'].some((item) => key.includes(item))) return 'warn';
  if (['uso', 'rota', 'andamento'].some((item) => key.includes(item))) return 'info';
  return 'ok';
}

function carBookings() {
  return (state.tasks || [])
    .filter((task) => task.scope === 'carro' || task.category === 'Carro oficial' || normalizeKey(task.source || '').includes('reservasveiculos'))
    .map((task) => ({
      id: task.id,
      requestId: String(task.id || '').replace(/^sharepoint-cars-/, '') || '--',
      vehicle: task.vehicle || task.car || 'Carro oficial',
      date: task.date || task.rawDate || '',
      time: task.time || '',
      requester: task.owner || task.createdBy || '',
      destination: task.place || '',
      driver: task.driver || '',
      status: task.authorization || (task.done ? 'concluido' : 'reservado'),
      note: task.notes || task.title || '',
      title: task.title || '',
      source: task.source || '',
      sourceSyncedAt: task.sourceSyncedAt || ''
    }))
    .sort((a, b) => `${a.date || '9999-99-99'} ${a.time || '99:99'}`.localeCompare(`${b.date || '9999-99-99'} ${b.time || '99:99'}`));
}

function monthCarBookings(items = carBookings()) {
  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();
  return items.filter((item) => {
    if (!item.date || !/^\d{4}-\d{2}-\d{2}/.test(item.date)) return false;
    const date = new Date(`${item.date.slice(0, 10)}T00:00:00`);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

function carDateLabel(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value || 'Sem data';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function carFullDateLabel(item) {
  const date = item?.date && /^\d{4}-\d{2}-\d{2}/.test(item.date)
    ? new Date(`${item.date.slice(0, 10)}T00:00:00`)
    : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : item?.date || 'Sem data';
  return item?.time ? `${dateLabel} ${item.time}` : dateLabel;
}

function canViewCarRequestDetails() {
  return ['admin', 'dirigente', 'seintec', 'setec', 'seom'].includes(currentUserRole());
}

function setSimpleSelectOptions(select, options, currentValue = 'all') {
  if (!select) return;
  const value = options.some((item) => item.value === currentValue) ? currentValue : 'all';
  select.innerHTML = options.map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('');
  select.value = value;
}

function bindCarsControls() {
  const controls = [
    document.getElementById('carVehicleFilter'),
    document.getElementById('carStatusFilter'),
    document.getElementById('carSearchInput')
  ];
  controls.forEach((control) => {
    if (!control || control.dataset.boundCars) return;
    control.dataset.boundCars = 'true';
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => renderCars());
  });
  const reset = document.getElementById('carFilterReset');
  if (reset && !reset.dataset.boundCars) {
    reset.dataset.boundCars = 'true';
    reset.addEventListener('click', () => {
      const vehicle = document.getElementById('carVehicleFilter');
      const status = document.getElementById('carStatusFilter');
      const search = document.getElementById('carSearchInput');
      if (vehicle) vehicle.value = 'all';
      if (status) status.value = 'all';
      if (search) search.value = '';
      renderCars();
    });
  }
  const refresh = document.getElementById('carRefreshBtn');
  if (refresh && !refresh.dataset.boundCars) {
    refresh.dataset.boundCars = 'true';
    refresh.addEventListener('click', async () => {
      const original = refresh.textContent;
      refresh.disabled = true;
      refresh.textContent = 'Atualizando...';
      try {
        await syncCarScheduleSource();
      } finally {
        refresh.disabled = false;
        refresh.textContent = original || 'Atualizar';
      }
    });
  }
}

function renderCarCalendar(items) {
  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const byDay = new Map();
  items.forEach((item) => {
    if (!item.date) return;
    const day = Number(item.date.slice(8, 10));
    if (!day) return;
    byDay.set(day, [...(byDay.get(day) || []), item]);
  });
  const blanks = Array.from({ length: firstWeekday }, () => '<div class="car-calendar-day empty"></div>');
  const dayCells = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const dayItems = byDay.get(day) || [];
    return `
      <div class="car-calendar-day ${dayItems.length ? 'has-event' : ''}">
        <strong>${esc(String(day))}</strong>
        ${dayItems.slice(0, 3).map((item) => `<span class="car-calendar-dot ${carStatusTone(item.status)}">${esc(item.time || '--:--')} ${esc(item.vehicle)}</span>`).join('')}
        ${dayItems.length > 3 ? `<small>+${esc(String(dayItems.length - 3))}</small>` : ''}
      </div>
    `;
  });
  return `
    <section class="car-calendar-shell">
      <div class="car-calendar-board">
        <div class="car-calendar-week">Dom</div><div class="car-calendar-week">Seg</div><div class="car-calendar-week">Ter</div><div class="car-calendar-week">Qua</div><div class="car-calendar-week">Qui</div><div class="car-calendar-week">Sex</div><div class="car-calendar-week">Sab</div>
        ${[...blanks, ...dayCells].join('')}
      </div>
    </section>
  `;
}

function renderCars() {
  const grid = document.getElementById('carGrid');
  if (!grid) return;
  bindCarsControls();

  const all = carBookings();
  const monthly = monthCarBookings(all);
  const vehicleFilter = document.getElementById('carVehicleFilter');
  const statusFilter = document.getElementById('carStatusFilter');
  const searchInput = document.getElementById('carSearchInput');
  const vehicles = [...new Set(monthly.map((item) => item.vehicle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const statuses = [...new Set(monthly.map((item) => item.status || 'pendente'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  setSimpleSelectOptions(vehicleFilter, [{ value: 'all', label: 'Todos' }, ...vehicles.map((item) => ({ value: normalizeKey(item), label: item }))], vehicleFilter?.value || 'all');
  setSimpleSelectOptions(statusFilter, [{ value: 'all', label: 'Todos' }, ...statuses.map((item) => ({ value: normalizeKey(item), label: item }))], statusFilter?.value || 'all');

  const vehicleValue = vehicleFilter?.value || 'all';
  const statusValue = statusFilter?.value || 'all';
  const search = normalizeKey(searchInput?.value || '');
  const visible = monthly.filter((item) => {
    const vehicleOk = vehicleValue === 'all' || normalizeKey(item.vehicle) === vehicleValue;
    const statusOk = statusValue === 'all' || normalizeKey(item.status || 'pendente') === statusValue;
    const searchOk = !search || normalizeKey(`${item.vehicle} ${item.destination} ${item.requester} ${item.driver} ${item.status} ${item.note}`).includes(search);
    return vehicleOk && statusOk && searchOk;
  });

  const reserved = visible.filter((item) => carStatusTone(item.status) === 'ok').length;
  const pending = visible.filter((item) => carStatusTone(item.status) === 'warn').length;
  const blocked = visible.filter((item) => carStatusTone(item.status) === 'danger').length;
  const syncedAt = all.find((item) => item.sourceSyncedAt)?.sourceSyncedAt || '';
  const summary = document.getElementById('carFilterSummary');
  const sourceStatus = document.getElementById('carSourceStatus');
  if (summary) summary.textContent = `${visible.length}/${monthly.length} reserva(s) visiveis em ${monthName()}.`;
  if (sourceStatus && !sourceStatus.textContent.includes('Atualizando')) {
    sourceStatus.textContent = syncedAt
      ? `Fonte SharePoint ReservasVeiculos sincronizada em ${new Date(syncedAt).toLocaleString('pt-BR')}.`
      : 'Fonte: SharePoint ReservasVeiculos. Use Atualizar para recarregar.';
  }

  if (!visible.length) {
    grid.innerHTML = `
      ${renderCarCalendar(visible)}
      <div class="sync-empty">${monthly.length ? 'Nenhum agendamento de carro encontrado neste filtro.' : `Nenhum agendamento de carro em ${esc(monthName())}.`}</div>
    `;
    return;
  }

  const byDate = visible.reduce((acc, item) => {
    const key = item.date || 'Sem data';
    acc.set(key, [...(acc.get(key) || []), item]);
    return acc;
  }, new Map());
  const showDetails = canViewCarRequestDetails();

  grid.innerHTML = `
    ${renderCarCalendar(visible)}
    <section class="car-day-list">
      ${Array.from(byDate.entries()).map(([date, items]) => `
        <article class="car-day-group">
          <div class="car-day-head"><strong>${esc(carDateLabel(date))}</strong><small>${esc(String(items.length))} reserva(s)</small></div>
          <div class="car-booking-grid">
            ${items.map((item) => {
            const tone = carStatusTone(item.status);
            return `
              <button class="car-booking-card car-booking-${tone} ${showDetails ? 'car-booking-full' : 'car-booking-limited'}" type="button">
                <span class="car-request-id"><small>Pedido</small><strong>#${esc(item.requestId || '--')}</strong></span>
                <span class="car-request-main"><strong>${esc(item.vehicle || 'Carro oficial')}</strong><small>${esc(carFullDateLabel(item))}</small></span>
                <em class="diag-pill ${tone === 'danger' ? 'pill-danger' : tone === 'warn' ? 'pill-warn' : tone === 'info' ? 'pill-info' : 'pill-ok'}">${esc(item.status || 'pendente')}</em>
                ${showDetails ? `<span class="car-note">${esc(item.note || item.title || '')}</span>` : ''}
              </button>
            `;
          }).join('')}
          </div>
        </article>
      `).join('')}
    </section>
  `;
}

function renderTasks(filtered) {
  const list = document.getElementById('taskList');
  const source = filtered || filteredTasks();
  const sorted = source.slice().sort((a, b) => `${a.date || '9999-99-99'} ${a.time || '99:99'}`.localeCompare(`${b.date || '9999-99-99'} ${b.time || '99:99'}`));
  const calendar = document.getElementById('agendaCalendarGrid');
  if (calendar && !calendar.hidden) {
    const today = currentViewDate;
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const byDay = new Map();
    sorted.forEach((task) => {
      if (!task.date) return;
      const taskDate = new Date(`${task.date}T00:00:00`);
      if (taskDate.getFullYear() !== year || taskDate.getMonth() !== month) return;
      const key = taskDate.getDate();
      byDay.set(key, [...(byDay.get(key) || []), task]);
    });
    const blanks = Array.from({ length: firstWeekday }, () => '<div class="supervisor-calendar-day empty"></div>');
    const dayCells = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const items = (byDay.get(day) || []).slice(0, 3);
      return `
        <div class="supervisor-calendar-day ${items.length ? 'has-visit' : ''}">
          <strong>${esc(String(day))}</strong>
          ${items.map((task) => `<span>${esc(task.scope === 'carro' ? `${task.vehicle || 'Carro'} - ${task.owner || 'Frota'}` : `${task.title} - ${task.owner || 'Agenda'}`)}</span>`).join('')}
          ${(byDay.get(day) || []).length > 3 ? `<span>+${esc(String((byDay.get(day) || []).length - 3))}</span>` : ''}
        </div>
      `;
    });
    calendar.innerHTML = [
      '<div class="supervisor-calendar-week">Dom</div><div class="supervisor-calendar-week">Seg</div><div class="supervisor-calendar-week">Ter</div><div class="supervisor-calendar-week">Qua</div><div class="supervisor-calendar-week">Qui</div><div class="supervisor-calendar-week">Sex</div><div class="supervisor-calendar-week">Sab</div>',
      ...blanks,
      ...dayCells
    ].join('');
  }
  const ownerSelect = document.getElementById('taskOwner');
  if (ownerSelect) {
    const selected = ownerSelect.value || currentUser()?.name || '';
    const users = (state.users || []).filter((item) => item.active !== false);
    ownerSelect.innerHTML = users.map((user) => `<option value="${esc(user.name)}">${esc(user.name)} (${esc(roleDisplay(user.role))})</option>`).join('');
    ownerSelect.value = selected || currentUser()?.name || users[0]?.name || '';
  }
  const dateInput = document.getElementById('taskDate');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  const taskActions = (task) => canEditData() ? `
    <button class="btn btn-g btn-sm" onclick="toggleTask('${esc(task.id)}')">${task.done ? 'Reabrir' : 'Concluir'}</button>
    <button class="btn btn-d btn-sm" onclick="removeTask('${esc(task.id)}')">Remover</button>
  ` : '';
  list.innerHTML = sorted.map((task) => `
    <div class="setechub-item">
      <div class="setechub-head">
        <div>
          <strong class="${task.done ? 'is-done' : ''}">${esc(task.title)}</strong>
          <div class="sync-meta">${esc(task.date || task.rawDate || 'Sem data')} | ${esc(task.time || 'Sem horario')} | ${esc(task.place)} | ${esc(task.category)}</div>
          <div class="setechub-inline-meta">
            <span class="diag-pill">${esc(task.owner || task.createdBy || 'Sem responsavel')}</span>
            <span class="diag-pill">${esc(task.scope === 'carro' ? 'Carro oficial' : task.scope === 'ure' ? 'Evento URE' : 'Pessoal')}</span>
            ${task.vehicle ? `<span class="diag-pill pill-info">${esc(task.vehicle)}</span>` : ''}
            ${task.driver ? `<span class="diag-pill">Condutor: ${esc(task.driver)}</span>` : ''}
            ${task.authorization ? `<span class="diag-pill ${/cancelado/i.test(task.authorization) ? 'pill-danger' : 'pill-ok'}">${esc(task.authorization)}</span>` : ''}
          </div>
        </div>
        <div class="setechub-badges">
          <span class="diag-pill ${toneByPriority(task.priority)}">${esc(badgeText(task.priority))}</span>
          ${taskActions(task)}
        </div>
      </div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhum agendamento encontrado.</div>';
}

function renderCtcAgenda() {
  const renderOwner = (owner) => {
    const items = (state.tasks || [])
      .filter((task) => normalizeKey(task.category) === 'ctc' && normalizeKey(task.ctcOwner) === normalizeKey(owner))
      .sort((a, b) => `${a.date || '9999-99-99'} ${a.time || '99:99'}`.localeCompare(`${b.date || '9999-99-99'} ${b.time || '99:99'}`));
    return items.map((task) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong class="${task.done ? 'is-done' : ''}">${esc(task.title)}</strong>
            <div class="sync-meta">${esc(task.date || 'Sem data')} | ${esc(task.time || 'Sem horario')} | ${esc(task.place || 'Sem local')}</div>
          </div>
          <div class="setechub-badges">
            <span class="diag-pill ${task.done ? 'pill-ok' : 'pill-info'}">${task.done ? 'Concluida' : 'Programada'}</span>
            ${canEditData() ? `<button class="btn btn-g btn-sm" onclick="toggleTask(${task.id})">${task.done ? 'Reabrir' : 'Concluir'}</button>` : ''}
          </div>
        </div>
      </div>
    `).join('') || '<div class="sync-empty">Nenhuma visita programada.</div>';
  };
  const bruno = document.getElementById('ctcAgendaBruno');
  const danilo = document.getElementById('ctcAgendaDanilo');
  if (bruno) bruno.innerHTML = renderOwner('Bruno');
  if (danilo) danilo.innerHTML = renderOwner('Danilo');
  const date = document.getElementById('ctcVisitDate');
  if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
}

function renderCalls() {
  const actionRow = (item) => canEditData() ? `
    <div class="setechub-action-row left">
      <button class="btn btn-g btn-sm" onclick="advanceCall(${item.id})">Avancar</button>
      <button class="btn btn-d btn-sm" onclick="removeCall(${item.id})">Remover</button>
    </div>
  ` : '';
  const columns = [
    { key: 'aberto', title: 'Abertos' },
    { key: 'em_rota', title: 'Em rota' },
    { key: 'resolvido', title: 'Resolvidos' }
  ];
  document.getElementById('callColumns').innerHTML = columns.map((column) => `
    <div class="bg-card setechub-column">
      <div class="ct">${column.title}</div>
      <div class="stack-list">
        ${filteredCalls().filter((item) => item.status === column.key).map((item) => `
          <div class="setechub-item">
            <div class="setechub-head">
              <div>
                <strong>${esc(item.title)}</strong>
                <div class="sync-meta">${esc(item.school)}</div>
              </div>
              <span class="diag-pill ${toneByCall(item.status)}">${esc(badgeText(item.status))}</span>
            </div>
            ${actionRow(item)}
          </div>
        `).join('') || '<div class="sync-empty">Sem itens nesta etapa.</div>'}
      </div>
    </div>
  `).join('');
}

function renderCallHistory() {
  document.getElementById('callHistoryList').innerHTML = state.histories.calls.map((item) => `
    <div class="setechub-item">
      <strong>${esc(item.text)}</strong>
      <div class="sync-meta">${esc(item.when)}</div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhuma movimentacao ainda.</div>';
}

function renderSchools() {
  renderSchoolCommandCenter();
  const zoneSelect = document.getElementById('schoolZoneFilterSelect');
  const sortSelect = document.getElementById('schoolSortSelect');
  const searchInput = document.getElementById('schoolMasterSearch');
  if (zoneSelect) {
    const selected = currentSchoolZoneFilter;
    const zones = ['todas', ...state.municipalities.map((item) => item.name)];
    zoneSelect.innerHTML = zones
      .filter((value, index, array) => array.indexOf(value) === index)
      .map((zone) => `<option value="${esc(zone)}">${zone === 'todas' ? 'Todos os municipios' : esc(zone)}</option>`)
      .join('');
    zoneSelect.value = selected;
  }
  if (sortSelect) sortSelect.value = currentSchoolSort;
  if (searchInput && searchInput.value !== currentSchoolSearch) searchInput.value = currentSchoolSearch;
  const schools = visibleSchools()
    .filter((school) => currentSchoolZoneFilter === 'todas' || school.zone === currentSchoolZoneFilter)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const statsNode = document.getElementById('schoolDirectoryStats');
  if (statsNode) {
    const baseSchools = visibleSchools();
    const visibleNames = new Set(schools.map((school) => normalizeKey(school.name)));
    const shownAssets = state.schoolAssets.filter((item) => visibleNames.has(normalizeKey(item.school)));
    const assetSchools = new Set(shownAssets.map((item) => normalizeKey(item.school)));
    const alertSchools = schools.filter((school) => schoolAlertUnits(school.name) > 0 || schoolOperationalSnapshot(school).openCalls > 0).length;
    const noInventory = schools.filter((school) => !assetSchools.has(normalizeKey(school.name))).length;
    const recordsOk = schools.filter((school) => schoolOperationalSnapshot(school).completion >= 80).length;
    statsNode.innerHTML = [
      { label: 'No filtro', value: String(schools.length), note: `${baseSchools.length} unidade(s) visiveis` },
      { label: 'Com inventario', value: String(assetSchools.size), note: `${noInventory} sem inventario` },
      { label: 'Em atencao', value: String(alertSchools), note: 'chamado ou equipamento' },
      { label: 'Ficha 80%+', value: String(recordsOk), note: 'dados principais completos' }
    ].map((item) => `
      <div class="school-directory-stat">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
        <small>${esc(item.note)}</small>
      </div>
    `).join('');
  }
  const schoolList = document.getElementById('schoolList');
  if (schoolList) {
    schoolList.innerHTML = schools.length ? `
      <div class="v2-operational-list school-compact-list">
        ${schools.map((school) => {
          const signal = schoolOperationalSnapshot(school);
          const supervisors = (getDerivedCache().supervisorsBySchool.get(school.name) || []).join(', ') || 'sem supervisor';
          const tone = signal.alertUnits > 0 || signal.openCalls > 0 ? 'pill-warn' : signal.completion >= 80 ? 'pill-ok' : 'pill-info';
          const primarySignal = signal.alertUnits
            ? `${signal.alertUnits} manut./defeito`
            : signal.openCalls
              ? `${signal.openCalls} chamado(s)`
              : `ficha ${signal.completion}%`;
          return `
            <article class="school-widget-card v2-list-row v3-school-tile">
              <button class="school-widget-main" type="button" onclick="openSchoolRecord('${esc(school.name)}')">
                <span class="school-widget-avatar" style="${schoolAvatarStyle(school)}">&#127979;</span>
                <span class="school-widget-copy">
                  <strong>${esc(school.name)}</strong>
                  <small>
                    <span>${esc(school.zone)}</span>
                    <span>CIE ${esc(school.cie || '--')}</span>
                  </small>
                </span>
                <span class="v3-school-footer">
                  <span>${esc(supervisors)}</span>
                  <span>${esc(String(signal.assetUnits))} item(ns)</span>
                </span>
                <span class="v3-school-status">
                  <i class="diag-pill ${tone}">${esc(primarySignal)}</i>
                </span>
                <span class="v3-school-accent" aria-hidden="true"></span>
              </button>
            </article>
          `;
        }).join('')}
      </div>
    ` : '<div class="sync-empty">Nenhuma escola encontrada neste filtro.</div>';
  }
  const options = document.getElementById('officialSchoolOptions');
  if (options) {
    options.innerHTML = visibleSchools()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((school) => `<option value="${esc(school.name)}"></option>`)
      .join('');
  }
}

function renderAssets() {
  renderInventoryWorkspace();
  const assetList = document.getElementById('assetList');
  if (assetList) {
    const assetActions = (asset) => canEditData() ? `
        <div class="setechub-action-row left">
          <button class="btn btn-g btn-sm" onclick="cycleAsset(${asset.id})">Atualizar status</button>
          <button class="btn btn-d btn-sm" onclick="removeAsset(${asset.id})">Remover</button>
        </div>
    ` : '';
    assetList.innerHTML = filteredAssets()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.status.localeCompare(b.status))
      .map((asset) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong>${esc(asset.name)}</strong>
            <div class="sync-meta">${esc(asset.place)}</div>
          </div>
          <span class="diag-pill ${toneByAsset(asset.status)}">${esc(badgeText(asset.status))}</span>
        </div>
        ${assetActions(asset)}
      </div>
    `).join('') || '<div class="sync-empty">Nenhum ativo geral encontrado neste filtro.</div>';
  }
  const schoolSelect = document.getElementById('schoolAssetSchool');
  const bulkSchoolSelect = document.getElementById('schoolAssetBulkSchool');
  if (schoolSelect) {
    const selected = schoolSelect.value;
    schoolSelect.innerHTML = visibleSchools()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((school) => `<option value="${esc(school.name)}">${esc(school.name)}</option>`)
      .join('');
    if (selected) schoolSelect.value = selected;
  }
  if (bulkSchoolSelect) {
    const selected = bulkSchoolSelect.value;
    bulkSchoolSelect.innerHTML = visibleSchools()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((school) => `<option value="${esc(school.name)}">${esc(school.name)}</option>`)
      .join('');
    if (selected) bulkSchoolSelect.value = selected;
  }
  const grouped = state.schoolAssets.reduce((acc, item) => {
    if (!acc[item.school]) acc[item.school] = [];
    acc[item.school].push(item);
    return acc;
  }, {});
  const schoolAssetList = document.getElementById('schoolAssetList');
  if (schoolAssetList) {
    const filteredRows = aggregateInventoryItems(filteredSchoolAssets());
    const groupedRows = filteredRows.reduce((acc, item) => {
      if (!acc[item.school]) acc[item.school] = [];
      acc[item.school].push(item);
      return acc;
    }, {});
    const groupedEntries = Object.entries(groupedRows).sort((a, b) => a[0].localeCompare(b[0]));
    const visibleGroupedEntries = groupedEntries.slice(0, INVENTORY_RENDER_LIMIT);
    schoolAssetList.innerHTML = Object.keys(groupedRows).length ? [
      ...visibleGroupedEntries
      .map(([school, items]) => `
        <div class="setechub-group v2-inventory-group">
          <div class="setechub-group-head">
            <strong>${esc(school)}</strong>
            <span class="diag-pill">${esc(String(items.reduce((sum, item) => sum + item.units, 0)))} unidades</span>
          </div>
          <div class="stack-list v2-operational-list">
            ${items.slice(0, 12).map((asset) => `
              <div class="setechub-item setechub-clickable v2-list-row" onclick="setInventorySchool('${esc(school)}')">
                <div class="setechub-head">
                  <div>
                    <strong>${esc(asset.name)}</strong>
                    <div class="sync-meta">CIE ${esc(schoolByName(school)?.cie || '--')} | ${esc(asset.notePreview || 'Sem observacao')}</div>
                    <div class="setechub-inline-meta">
                      <span class="diag-pill">${esc(String(asset.units))} unid.</span>
                      <span class="diag-pill">${esc(equipmentTypeLabel(asset.category))}</span>
                      <span class="diag-pill ${asset.alertUnits ? 'pill-danger' : 'pill-ok'}">${esc(String(asset.alertUnits))} manut./defeito</span>
                    </div>
                  </div>
                  <div class="setechub-badges">
                    <span class="diag-pill ${toneByAsset(asset.statusLabel)}">${esc(badgeText(asset.statusLabel))}</span>
                    <button class="btn btn-p btn-sm" onclick="event.stopPropagation(); setInventorySchool('${esc(school)}')">Ver inventario</button>
                  </div>
                </div>
              </div>
            `).join('')}
            ${items.length > 12 ? `<div class="sync-empty compact">Mais ${esc(String(items.length - 12))} tipo(s) nesta escola. Abra o inventario da unidade para detalhar.</div>` : ''}
          </div>
        </div>
      `),
      groupedEntries.length > visibleGroupedEntries.length ? `<div class="sync-empty compact">Mostrando ${esc(String(visibleGroupedEntries.length))} de ${esc(String(groupedEntries.length))} escolas. Use os filtros para refinar.</div>` : ''
    ].join('')
      : '<div class="sync-empty">Nenhum equipamento vinculado a escolas neste filtro.</div>';
  }
  renderAssetMonitoring();
}

function schoolAssetUnits(asset) {
  const notes = String(asset.notes || '');
  const unitMatch = notes.match(/(\d+)\s+unidade/i);
  if (unitMatch) return Number(unitMatch[1]);
  const countMatch = notes.match(/(^|\D)(\d{1,4})(?=\D|$)/);
  if (countMatch) return Number(countMatch[2]);
  return 1;
}

function renderAssetMonitoring() {
  const cards = document.getElementById('assetMonitorCards');
  const comparison = document.getElementById('assetComparisonTable');
  const typeTable = document.getElementById('assetTypeTable');
  if (!cards || !comparison || !typeTable) return;

  const schoolAssets = state.schoolAssets || [];
  const totalGeneral = state.assets.length;
  const totalSchoolLines = schoolAssets.length;
  const totalUnits = schoolAssets.reduce((sum, item) => sum + schoolAssetUnits(item), 0);
  const alertLines = schoolAssets.filter((item) => item.status !== 'ok').length + state.assets.filter((item) => item.status !== 'ok').length;
  const defectiveLines = schoolAssets.filter((item) => item.status === 'defeito').length;

  cards.innerHTML = [
    { label: 'Inventario geral', value: String(totalGeneral), note: 'linhas consolidadas da regional', tone: '' },
    { label: 'Itens por escola', value: String(totalSchoolLines), note: `${totalUnits} unidades aproximadas`, tone: '' },
    { label: 'Manut./defeito', value: String(alertLines), note: 'manutencao ou defeito', tone: 'pill-warn' },
    { label: 'Defeitos', value: String(defectiveLines), note: 'equipamentos com defeito', tone: 'pill-danger' }
  ].map((item) => `
    <div class="setechub-monitor-card">
      <div class="sync-meta">${esc(item.label)}</div>
      <strong>${esc(item.value)}</strong>
      <div class="diag-pill ${item.tone}">${esc(item.note)}</div>
    </div>
  `).join('');

  const bySchool = schoolAssets.reduce((acc, item) => {
    if (!acc[item.school]) {
      acc[item.school] = { school: item.school, totalLines: 0, totalUnits: 0, ok: 0, alert: 0, defect: 0 };
    }
    const bucket = acc[item.school];
    const units = schoolAssetUnits(item);
    bucket.totalLines += 1;
    bucket.totalUnits += units;
    if (item.status === 'defeito') bucket.defect += units;
    if (item.status !== 'ok') bucket.alert += units;
    if (item.status === 'ok') bucket.ok += units;
    return acc;
  }, {});

  const schoolRows = Object.values(bySchool)
    .sort((a, b) => b.totalUnits - a.totalUnits || b.alert - a.alert || a.school.localeCompare(b.school));
  const maxSchoolUnits = Math.max(...schoolRows.map((item) => item.totalUnits), 1);

  comparison.innerHTML = schoolRows.length ? `
    <table class="setechub-table">
      <thead>
        <tr>
          <th>Escola</th>
          <th>Total</th>
          <th>Manut./defeito</th>
          <th>Defeitos</th>
          <th>Peso</th>
        </tr>
      </thead>
      <tbody>
        ${schoolRows.map((item) => `
          <tr>
            <td><strong>${esc(item.school)}</strong><div class="sync-meta">${esc(String(item.totalLines))} tipos</div></td>
            <td>${esc(String(item.totalUnits))}</td>
            <td>${esc(String(item.alert))}</td>
            <td>${esc(String(item.defect))}</td>
            <td>
              <div class="setechub-bar"><span style="width:${Math.max(4, Math.round((item.totalUnits / maxSchoolUnits) * 100))}%"></span></div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<div class="sync-empty">Sem dados por escola para comparar.</div>';

  const byType = schoolAssets.reduce((acc, item) => {
    const name = simplifiedEquipmentName(item);
    if (!acc[name]) {
      acc[name] = { name, totalUnits: 0, alert: 0, schools: new Set() };
    }
    const bucket = acc[name];
    const units = schoolAssetUnits(item);
    bucket.totalUnits += units;
    if (item.status !== 'ok') bucket.alert += units;
    bucket.schools.add(item.school);
    return acc;
  }, {});
  const typeRows = Object.values(byType)
    .sort((a, b) => b.totalUnits - a.totalUnits || a.name.localeCompare(b.name))
    .slice(0, 12);
  const maxTypeUnits = Math.max(...typeRows.map((item) => item.totalUnits), 1);

  typeTable.innerHTML = typeRows.length ? `
    <table class="setechub-table">
      <thead>
        <tr>
          <th>Equipamento</th>
          <th>Unidades</th>
          <th>Manut./defeito</th>
          <th>Escolas</th>
          <th>Volume</th>
        </tr>
      </thead>
      <tbody>
        ${typeRows.map((item) => `
          <tr>
            <td><strong>${esc(item.name)}</strong></td>
            <td>${esc(String(item.totalUnits))}</td>
            <td>${esc(String(item.alert))}</td>
            <td>${esc(String(item.schools.size))}</td>
            <td>
              <div class="setechub-bar"><span style="width:${Math.max(4, Math.round((item.totalUnits / maxTypeUnits) * 100))}%"></span></div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<div class="sync-empty">Sem tipos de equipamento para comparar.</div>';
}

function renderReports() {
  const done = state.tasks.filter((item) => item.done).length;
  const total = state.tasks.length || 1;
  document.getElementById('reportTasks').textContent = state.tasks.length;
  document.getElementById('reportCalls').textContent = state.calls.filter((item) => item.status !== 'resolvido').length;
  document.getElementById('reportCriticalSchools').textContent = visibleSchools().filter((item) => item.status !== 'estavel').length;
  document.getElementById('reportAssets').textContent = state.assets.filter((item) => item.status !== 'ok').length + state.schoolAssets.filter((item) => item.status !== 'ok').length;
  document.getElementById('taskProgressBar').style.width = `${Math.round((done / total) * 100)}%`;
  document.getElementById('reportSummaryPreview').textContent = buildSummaryPreview();
  renderVisitHistory();
  renderNotes();
  renderRedeAutomation();
}

function renderDiagnostics() {
  const orphaned = orphanedReferenceSummary();
  const duplicateCies = duplicateSchoolCies();
  const importRows = state.schoolImports || [];
  const importSchools = new Set(importRows.map((item) => item.school).filter(Boolean)).size;
  const pendingImports = importRows.filter((item) => item.reviewStatus === 'pending').length;
  const confirmedImports = importRows.length - pendingImports;
  const diagnostics = [
    { label: 'Pagina atual', value: currentPage },
    { label: 'Schema do estado', value: `v${state.stateVersion || 1}` },
    { label: 'Ultima atualizacao', value: state.lastUpdatedAt ? timestampLabel(new Date(state.lastUpdatedAt)) : 'Nao registrada' },
    { label: 'Storage principal', value: localStorage.getItem(STORAGE_KEY) ? 'Disponivel' : 'Vazio' },
    { label: 'Prototipo antigo', value: localStorage.getItem(LEGACY_STORAGE_KEY) ? 'Encontrado' : 'Nao encontrado' },
    { label: 'Sessao local', value: sessionStorage.getItem(SESSION_KEY) === 'ok' ? 'Desbloqueada' : 'Bloqueada' },
    { label: 'Servidor local', value: serverStatus.message },
    { label: 'Supabase', value: supabaseStatus.message },
    { label: 'Snapshots no servidor', value: String(serverSnapshots.length) },
    { label: 'Tarefas abertas', value: String(state.tasks.filter((item) => !item.done).length) },
    { label: 'Chamados ativos', value: String(state.calls.filter((item) => item.status !== 'resolvido').length) },
    { label: 'CIE duplicado', value: duplicateCies.length ? duplicateCies.map((item) => item.cie).join(', ') : 'Nenhum' },
    { label: 'Referencias orfas', value: Object.values(orphaned).reduce((sum, value) => sum + value, 0) ? JSON.stringify(orphaned) : 'Nenhuma' }
  ];
  document.getElementById('diagnosticList').innerHTML = diagnostics.map((item) => `
    <div class="setechub-item">
      <div class="setechub-head">
        <strong>${esc(item.label)}</strong>
        <span class="diag-pill">${esc(item.value)}</span>
      </div>
    </div>
  `).join('');
  document.getElementById('legacyStateMeta').textContent = localStorage.getItem(LEGACY_STORAGE_KEY)
    ? 'Foi encontrado um estado salvo do setec_daily_app neste navegador.'
    : 'Nenhum estado legado encontrado no navegador atual.';
  const serverMeta = document.getElementById('serverHealthMeta');
  if (serverMeta) serverMeta.textContent = serverStatus.message;
  const backupMeta = document.getElementById('backupStatusMeta');
  if (backupMeta) {
    backupMeta.textContent = state.lastBackupAt
      ? `Ultimo backup exportado: ${timestampLabel(new Date(state.lastBackupAt))}`
      : 'Backup ainda nao exportado neste navegador.';
  }
  const importInfo = document.getElementById('adminImportInfo');
  if (importInfo) {
    importInfo.innerHTML = [
      { label: 'Registros importados', value: String(importRows.length), note: 'total preservado na base local' },
      { label: 'Escolas vinculadas', value: String(importSchools), note: 'unidades com algum arquivo' },
      { label: 'Confirmadas', value: String(confirmedImports), note: 'fora do fluxo operacional' },
      { label: 'Pendentes', value: String(pendingImports), note: 'apenas informativo no admin' }
    ].map((item) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.label)}</strong>
            <div class="sync-meta">${esc(item.note)}</div>
          </div>
          <span class="diag-pill">${esc(item.value)}</span>
        </div>
      </div>
    `).join('');
  }
  updateSupabaseStatus(supabaseStatus.message, supabaseStatus.configured);
  const snapshotList = document.getElementById('snapshotList');
  if (snapshotList) {
    snapshotList.innerHTML = serverSnapshots.length ? serverSnapshots.map((item) => `
      <div class="setechub-item">
        <div class="setechub-head">
          <div>
            <strong>${esc(item.label || item.id)}</strong>
            <div class="sync-meta">${esc(item.savedAt || item.createdAt || '')}</div>
          </div>
          <div class="setechub-badges">
            <button class="btn btn-g btn-sm" onclick="restoreServerSnapshot('${esc(item.id)}')">Restaurar</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="sync-empty">Nenhum snapshot salvo no servidor local.</div>';
  }
}

function renderUsers() {
  const list = document.getElementById('userList');
  if (!list) return;
  const supervisorSelect = document.getElementById('userSupervisorName');
  if (supervisorSelect) {
    supervisorSelect.innerHTML = '<option value="">Sem vinculo</option>' + (state.supervisors || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`)
      .join('');
  }
  const users = isPecUser()
    ? (state.users || []).filter((user) => {
      if (user.role !== 'pec') return false;
      if (isPecLeadUser()) return true;
      return normalizeKey(user.id) === normalizeKey(currentUser()?.id);
    })
    : (state.users || []);
  list.innerHTML = users.map((user) => `
    <div class="admin-user-row">
      <div class="admin-user-main">
        <strong>${esc(user.name)}</strong>
        <div class="sync-meta">${esc(user.login || user.name)} | ${esc(roleDisplay(user.role))}${user.supervisorName ? ` | ${esc(user.supervisorName)}` : ''} | PIN ${esc(user.pin || 'sem PIN')}</div>
      </div>
      <div class="admin-user-actions">
        <span class="diag-pill ${user.active === false ? 'pill-warn' : 'pill-ok'}">${user.active === false ? 'Inativo' : 'Ativo'}</span>
        <button class="btn btn-g btn-sm" type="button" onclick="editUser('${esc(user.id)}')">Editar</button>
        <button class="btn btn-g btn-sm" type="button" onclick="randomizeUserPin('${esc(user.id)}')">PIN aleatorio</button>
        <button class="btn btn-g btn-sm" type="button" onclick="resetUserPin('${esc(user.id)}')">Resetar senha</button>
        <button class="btn btn-g btn-sm" type="button" onclick="toggleUserActive('${esc(user.id)}')">${user.active === false ? 'Ativar' : 'Bloquear'}</button>
        <button class="btn btn-d btn-sm" type="button" onclick="removeUser('${esc(user.id)}')">Remover</button>
      </div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhum usuario cadastrado.</div>';
}

function renderAdminSchoolTools() {
  const list = document.getElementById('adminSchoolList');
  if (!list) return;
  const schools = (state.schools || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const schoolOptions = '<option value="">Selecionar escola para editar</option>' + schools
    .map((school) => `<option value="${esc(school.id)}">${esc(school.name)}${school.cie ? ` | CIE ${esc(school.cie)}` : ''}</option>`)
    .join('');
  const mergeOptions = '<option value="">Escolha a escola</option>' + schools
    .map((school) => `<option value="${esc(school.id)}">${esc(school.name)}</option>`)
    .join('');
  const supervisorOptions = '<option value="">Sem supervisor responsavel</option>' + (state.supervisors || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((supervisor) => `<option value="${esc(supervisor.name)}">${esc(supervisor.name)}</option>`)
    .join('');
  const picker = document.getElementById('adminSchoolPicker');
  const primary = document.getElementById('adminMergePrimary');
  const duplicate = document.getElementById('adminMergeDuplicate');
  const supervisorSelect = document.getElementById('adminSchoolSupervisorName');
  const currentSchoolId = document.getElementById('adminSchoolId')?.value || '';
  if (picker) {
    picker.innerHTML = schoolOptions;
    picker.value = currentSchoolId;
  }
  if (primary) primary.innerHTML = mergeOptions;
  if (duplicate) duplicate.innerHTML = mergeOptions;
  if (supervisorSelect) supervisorSelect.innerHTML = supervisorOptions;
  list.innerHTML = schools.map((school) => {
    const supervisor = supervisorNameForSchool(school.name);
    const assets = state.schoolAssets.filter((item) => item.school === school.name);
    const alerts = assets.filter((item) => item.status !== 'ok').length;
    return `
      <div class="admin-user-row">
        <div class="admin-user-main">
          <strong>${esc(school.name)}</strong>
          <div class="sync-meta">${esc(school.zone || 'Municipio nao informado')} | ${school.cie ? `CIE ${esc(school.cie)} | ` : ''}${esc(supervisor || 'sem supervisor')} | ${assets.length} item(ns), ${alerts} manut./defeito</div>
        </div>
        <div class="admin-user-actions">
          <span class="diag-pill ${school.status === 'critico' ? 'pill-danger' : school.status === 'atencao' ? 'pill-warn' : 'pill-ok'}">${esc(badgeText(school.status || 'estavel'))}</span>
          <button class="btn btn-g btn-sm" type="button" onclick="editAdminSchool('${esc(school.id)}')">Editar</button>
          <button class="btn btn-d btn-sm" type="button" onclick="removeSchool('${esc(school.id)}')">Remover</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="sync-empty">Nenhuma escola cadastrada.</div>';
}

function renderVisitHistory() {
  document.getElementById('visitHistoryList').innerHTML = state.histories.visits.map((item) => `
    <div class="setechub-item">
      <strong>${esc(item.text)}</strong>
      <div class="sync-meta">${esc(item.when)}</div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhuma visita registrada ainda.</div>';
}

function renderNotes() {
  document.getElementById('noteList').innerHTML = state.notes.map((note) => `
    <div class="setechub-item">
      <div class="setechub-head">
        <strong>${esc(note.title)}</strong>
        <button class="btn btn-d btn-sm" onclick="removeNote(${note.id})">Remover</button>
      </div>
      <div class="sync-meta">${esc(note.body)}</div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhuma nota salva.</div>';
}

function escapePowerShell(value) {
  return String(value || '').replace(/'/g, "''");
}

function parseRedeFilename(filename, fallbackYearSuffix) {
  const numericName = String(filename || '').match(/^\s*(\d+)\.(docx?|pdf)$/i);
  if (numericName) {
    const sequence = numericName[1];
    const yearSuffix = fallbackYearSuffix || '';
    return {
      originalName: filename,
      valid: true,
      sequence,
      yearSuffix,
      date: 'data do dia',
      networkNumber: yearSuffix ? `${sequence}/${yearSuffix}` : sequence,
      renamedBase: sequence
    };
  }
  const match = filename.match(/rede\s*n[oº°]?\s*(\d+)(?:\s*\/\s*(\d{2,4}))?.*?data[:\s]*([0-3]\d\/[01]\d\/\d{4})/i);
  if (!match) {
    return {
      originalName: filename,
      valid: false,
      reason: 'Nome fora do padrao esperado.'
    };
  }
  const sequence = match[1];
  const yearSuffix = match[2] || fallbackYearSuffix || '';
  const date = match[3];
  return {
    originalName: filename,
    valid: true,
    sequence,
    yearSuffix,
    date,
    networkNumber: yearSuffix ? `${sequence}/${yearSuffix}` : sequence,
    renamedBase: sequence
  };
}

function buildRedeCommand() {
  const folderPath = state.redes.folderPath.trim();
  if (!folderPath) return 'Preencha o caminho da pasta para montar o comando do PowerShell.';
  return [
    'powershell -ExecutionPolicy Bypass -File .\\tools\\processar_redes.ps1',
    `-SourceFolder '${escapePowerShell(folderPath)}'`,
    `-YearSuffix '${escapePowerShell(state.redes.yearSuffix)}'`,
    `-NumberPlaceholder '${escapePowerShell(state.redes.numberPlaceholder)}'`,
    `-DatePlaceholder '${escapePowerShell(state.redes.datePlaceholder)}'`,
    `-HeadingPlaceholder '${escapePowerShell(state.redes.headingPlaceholder)}'`,
    `-AssuntoLabel '${escapePowerShell(state.redes.assuntoLabel)}'`
  ].join(' ');
}

function redeDraftDataFromState() {
  return {
    number: state.redes.draftNumber || '',
    date: state.redes.draftDate || '',
    heading: state.redes.draftHeading || 'Diretoria de Ensino - Região de Itapeva',
    destination: state.redes.draftDestination || '',
    subject: state.redes.draftSubject || '',
    body: state.redes.draftBody || ''
  };
}

function formatRedeDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function buildRedeDraftHtml(data = redeDraftDataFromState()) {
  const body = esc(data.body || '').replace(/\r?\n/g, '<br>');
  return `
    <div class="rede-doc">
      <div class="rede-doc-heading">${esc(data.heading || 'Diretoria de Ensino - Região de Itapeva')}</div>
      <div class="rede-doc-line"><strong>REDE Nº:</strong> ${esc(data.number || '--')}</div>
      <div class="rede-doc-line"><strong>Data:</strong> ${esc(formatRedeDate(data.date) || '--')}</div>
      ${data.destination ? `<div class="rede-doc-line"><strong>Destino:</strong> ${esc(data.destination)}</div>` : ''}
      <div class="rede-doc-subject"><strong>${esc(state.redes.assuntoLabel || 'Assunto:')}</strong> ${esc(data.subject || '--')}</div>
      <div class="rede-doc-body">${body || 'Digite o corpo da REDE.'}</div>
    </div>
  `;
}

function renderRedePreview() {
  const list = document.getElementById('redePreviewList');
  list.innerHTML = redePreview.map((item) => `
    <div class="setechub-item">
      <div class="setechub-head">
        <strong>${esc(item.valid ? `${item.renamedBase}${item.extension || ''} | Rede ${item.networkNumber}` : item.originalName)}</strong>
        <span class="diag-pill ${item.valid ? 'pill-ok' : 'pill-warn'}">${item.valid ? esc(item.date) : 'Revisar'}</span>
      </div>
      <div class="sync-meta">${esc(item.valid ? `Original: ${item.originalName}` : item.reason)}</div>
    </div>
  `).join('') || '<div class="sync-empty">Nenhuma pasta analisada ainda.</div>';
}

function renderRedeAutomation() {
  const folderInput = document.getElementById('redeFolderPath');
  const yearInput = document.getElementById('redeYearSuffix');
  const commandInput = document.getElementById('redeCommand');
  if (folderInput) folderInput.value = state.redes.folderPath;
  if (yearInput) yearInput.value = state.redes.yearSuffix;
  if (commandInput) commandInput.value = buildRedeCommand();
  const draft = redeDraftDataFromState();
  const numberInput = document.getElementById('redeDraftNumber');
  const dateInput = document.getElementById('redeDraftDate');
  const headingInput = document.getElementById('redeDraftHeading');
  const destinationInput = document.getElementById('redeDraftDestination');
  const subjectInput = document.getElementById('redeDraftSubject');
  const bodyInput = document.getElementById('redeDraftBody');
  if (numberInput) numberInput.value = draft.number;
  if (dateInput) dateInput.value = draft.date;
  if (headingInput) headingInput.value = draft.heading;
  if (destinationInput) destinationInput.value = draft.destination;
  if (subjectInput) subjectInput.value = draft.subject;
  if (bodyInput) bodyInput.value = draft.body;
  const preview = document.getElementById('redeDraftPreview');
  if (preview) preview.innerHTML = buildRedeDraftHtml(draft);
  renderRedePreview();
}
