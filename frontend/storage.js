'use strict';

const STATE_VERSION = 3;
const STORAGE_KEY = 'setechub_state_v1';
const LEGACY_STORAGE_KEY = 'setec-hub-v2';
const THEME_KEY = 'setechub_theme';
const PRIVACY_KEY = 'setechub_privacy';
const SESSION_KEY = 'setechub_session';
const SUPABASE_CONFIG_KEY = 'setechub_supabase_config';
const SUPABASE_DEFAULT_CONFIG = {
  url: 'https://pzbmnwnkmuvqgqetlpti.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6Ym1ud25rbXV2cWdxZXRscHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTAyMzQsImV4cCI6MjA5MzEyNjIzNH0.5ajNZvl3rNZ06HwOY6FhnLoKJDzPC6wwZmhaKjsSuaE'
};
const GENERATED_SCHOOL_DATA = typeof window !== 'undefined' && window.SETECHUB_SCHOOL_DATA
  ? window.SETECHUB_SCHOOL_DATA
  : { generalAssets: [], schoolImports: [], schoolAssets: [], schoolNetworks: [] };
let lastSavedStateComparable = '';
let lastSavedStatePayload = '';

function uid() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function repairMojibakeString(value) {
  const text = String(value ?? '');
  if (!/[ÃÂâ€]/.test(text)) return text;
  try {
    const repaired = decodeURIComponent(escape(text));
    return repaired.includes('\uFFFD') ? text : repaired;
  } catch {
    return text;
  }
}

function deepRepairStrings(value) {
  if (Array.isArray(value)) return value.map((item) => deepRepairStrings(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepRepairStrings(item)]));
  }
  return typeof value === 'string' ? repairMojibakeString(value) : value;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mergeUniqueBy(baseItems, savedItems, keyFn) {
  const map = new Map();
  baseItems.forEach((item) => map.set(keyFn(item), item));
  savedItems.forEach((item) => map.set(keyFn(item), item));
  return Array.from(map.values());
}

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function keepImportedFleetTask(item, date = new Date()) {
  if (!normalizeKey(item?.source || '').startsWith('frota excel')) return true;
  if (!item?.date) return false;
  const today = localIsoDate(date);
  const monthEnd = localIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return item.date >= today && item.date <= monthEnd;
}

function inferImportReviewStatus(item) {
  if (item?.reviewStatus) return item.reviewStatus;
  const id = String(item?.id || '');
  return id.startsWith('seed-') ? 'pending' : 'approved';
}

const SCHOOL_ALIASES = {
  'AGROVILA I': 'PEI EE Idalicio Mendes Lima',
  'EE BAIRRO TURVOS DOS ALMEIDAS': 'EE Bairro Turvo dos Almeidas',
  'EE BAIRRO TURVO DO ALMEIDAS': 'EE Bairro Turvo dos Almeidas',
  'EE CELIA VASQUES DUCH': 'PEI EE Professora Celia Vasques Ferrari Duch',
  'EE CINIRA DANIEL DA SILVA': 'PEI EE Professora Cinira Daniel da Silva',
  'EE DR ANTONIO DEFUNNE': 'EE Doutor Antonio Deffune',
  'EE DR ANTONIO DEFFUNE': 'EE Doutor Antonio Deffune',
  'EE DR. RAUL VENTURELLI': 'EE Doutor Raul Venturelli',
  'EE DR RAUL VENTURELLI': 'EE Doutor Raul Venturelli',
  'EE BAIRRO FERREIRA DOS MATOS': 'EE Bairro Ferreira dos Matos',
  'EE FRANCELINA FRANCO': 'PEI EE Professora Francelina Franco',
  'EE GERSON DE BARROS MARGARIDO': 'EE Professor Gerson de Barros Margarido',
  'EE IDALICIO MENDES LIMA': 'PEI EE Idalicio Mendes Lima',
  'EE JEMINIANO DAVID MUZEL': 'PEI EE Jeminiano David Muzel',
  'PEI EE JEMINIANO DAVID MÜZEL': 'PEI EE Jeminiano David Muzel',
  'EE PEI JOAO B. DO AMARAL VASCONCELLOS': 'PEI EE Professor Joao Baptista do Amaral Vasconcellos',
  'EE PEI JOÃO B. DO AMARAL VASCONCELLOS': 'PEI EE Professor Joao Baptista do Amaral Vasconcellos',
  'EE JOAO BATISTA DO AMARAL VASCONCELLOS': 'PEI EE Professor Joao Baptista do Amaral Vasconcellos',
  'EE JOSE VASQUES FERRARI': 'PEI EE Professor Jose Vasques Ferrari',
  'EE JOSÉ VASQUES FERRARI': 'PEI EE Professor Jose Vasques Ferrari',
  'EE NICOTA SOARES': 'PEI EE Professora Nicota Soares',
  'EE OSCAR KURTZ CAMARGO': 'PEI EE Oscar Kurtz Camargo',
  'EE OTAVIO FERRARI': 'PEI EE Otavio Ferrari',
  'PEI EE OTÁVIO FERRARI': 'PEI EE Otavio Ferrari',
  'EE PADRE ARLINDO VIEIRA': 'PEI EE Padre Arlindo Vieira',
  'EE RICARDO CAMPOLIM DE ALMEIDA': 'PEI EE Ricardo Campolim de Almeida Neto',
  'EE SILVERIO MONTEIRO': 'EE Professor Silverio Monteiro',
  'EE PROFESSOR SILVÉRIO MONTEIRO': 'EE Professor Silverio Monteiro',
  'EE SIMPLICIANO CAMPOLIM DE ALMEIDA NETO': 'PEI EE Simpliciano Campolim de Almeida',
  'EE ZULMIRA DE OLIVEIRA': 'PEI EE Professora Zulmira de Oliveira'
};

const SUPERVISOR_VISIT_SOURCES = [
  {
    id: 'supervisores-google-visitas',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSkqZydw5EWNLREBCXdG-VpqcoOfuOf-AI2gYawdaeEwDNitR2m37okLvurfscimlSQMtpbHg_H_bzz/pub?output=csv',
    label: 'Planilha Google - visitas dos supervisores',
    primary: true,
    aggregate: true,
    requireSupervisorColumn: true,
    panelGid: '1507846737',
    tabPrefix: 'DADOS_'
  }
];

const APRIL_SUPERVISOR_SHEET_LINK = {
  label: 'Planilha supervisores - abril de 2026',
  url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4b4nZ79Ev8139wvRESOX9YNedCB4PwNiqU2i-UbYUI3c4oKYrmuXjuiMS742RTluOFv94eGK0qMwd/pub?output=csv',
  category: 'supervisor-sheet',
  monthKey: '2026-04',
  panelGid: ''
};

const CAR_SCHEDULE_LINK = {
  label: 'Agenda de carros oficiais',
  url: 'https://seesp-my.sharepoint.com/:l:/g/personal/itv_seintec_educacao_sp_gov_br/JACaDeD8XkaHRaX2WSJPMXJ6ARg_YVMIXarwCYu78XAnEOs?e=9Dn1Da',
  category: 'car-schedule',
  sourceType: 'sharepoint-list'
};

const SUPERVISOR_SOURCE_ALIASES = {
  adilson: ['Adilson Manoel', 'Adilson Fogaca'],
  daiane: ['Daiane Aparecida', 'Daiane Aparecida de Oliveira Ribeiro'],
  edilene: ['Edilene Silva', 'Edilene da Silva', 'Edilene da Silva Almeida Oliveira'],
  magda: ['Magda Gisele', 'Magda Gisele Silva de Oliveira'],
  marcio: ['Marcio Nunes', 'Marcio Nunes da Cruz', 'Márcio Nunes da Cruz'],
  maria: ['Maria Luiza', 'Maria Luiza Brizolla de Queiroz', 'Maria Luiza Brisolla de Queiroz']
};

const LOCKED_SUPERVISOR_ASSIGNMENTS = [
  {
    key: 'daiane',
    name: 'Daiane Aparecida de Oliveira Ribeiro',
    email: 'daiane.ribeiro@educacao.sp.gov.br',
    phone: '(15) 3526-6227',
    schools: [
      'PEI EE Oscar Kurtz Camargo',
      'EE Bairro Ferreira dos Matos',
      'PEI EE Professora Nicota Soares',
      'EE Professor Gerson de Barros Margarido'
    ]
  },
  {
    key: 'adilson',
    name: 'Adilson Manoel Fogaça',
    email: 'adilson.fogaca@educacao.sp.gov.br',
    phone: '(15) 3526-6224',
    schools: [
      'PEI EE Jeminiano David Müzel',
      'PEI EE Professora Cinira Daniel da Silva',
      'EE Doutor Raul Venturelli'
    ]
  },
  {
    key: 'marcio',
    name: 'Márcio Nunes da Cruz',
    email: 'marcio.cruz@educacao.sp.gov.br',
    phone: '(15) 3526-6208',
    schools: [
      'PEI EE Ricardo Campolim de Almeida Neto',
      'PEI EE Simpliciano Campolim de Almeida',
      'EE Professor Silvério Monteiro',
      'PEI EE Professora Zulmira de Oliveira'
    ]
  },
  {
    key: 'maria',
    name: 'Maria Luiza Brisolla de Queiroz',
    email: 'maria.queiroz14@educacao.sp.gov.br',
    phone: '(15) 3526-6216',
    schools: [
      'EE Bairro Boa Vista Intervales',
      'EE Bairro Turvo do Almeidas',
      'PEI EE Professor José Vasques Ferrari'
    ]
  },
  {
    key: 'edilene',
    name: 'Edilene Silva Almeida Oliveira',
    email: 'edilene.oliveira@educacao.sp.gov.br',
    phone: '(15) 3526-6217',
    schools: [
      'PEI EE Otávio Ferrari',
      'PEI EE Professora Francelina Franco',
      'EE PEI João B. do Amaral Vasconcellos'
    ]
  },
  {
    key: 'magda',
    name: 'Magda Gisele Silva Oliveira',
    email: 'magda.oliveira@educacao.sp.gov.br',
    phone: '(15) 3526-6232',
    schools: [
      'EE Professora Célia Vasques Ferrari Duch',
      'PEI E.E Idalicio Mendes Lima',
      'PEI EE Padre Arlindo Vieira',
      'PEI EE Doutor Antonio Deffune'
    ]
  }
];

function supervisorSourceAliases(name) {
  const firstName = normalizeKey(String(name || '').trim().split(/\s+/)[0]);
  return SUPERVISOR_SOURCE_ALIASES[firstName] || [];
}

function lockedSupervisorAssignmentFor(supervisor) {
  const key = normalizeKey(`${supervisor?.name || ''} ${supervisor?.email || ''} ${(supervisor?.sourceAliases || []).join(' ')}`);
  return LOCKED_SUPERVISOR_ASSIGNMENTS.find((item) =>
    key.includes(normalizeKey(item.key)) ||
    key.includes(normalizeKey(item.name)) ||
    normalizeKey(supervisor?.email) === normalizeKey(item.email)
  ) || null;
}

function lockedSupervisorSchools(schools) {
  const knownSchools = new Set((schools || []).map((school) => normalizeKey(school.name || school)));
  return (schoolNames) => Array.from(new Set(schoolNames
    .map((school) => canonicalSchoolName(school))
    .filter((school) => !knownSchools.size || knownSchools.has(normalizeKey(school)))));
}

function applyLockedSupervisorAssignments(supervisors, schools = SCHOOL_MASTER) {
  const canonicalizeSchools = lockedSupervisorSchools(schools);
  const usedKeys = new Set();
  const normalized = (supervisors || []).map((supervisor) => {
    const locked = lockedSupervisorAssignmentFor(supervisor);
    if (!locked) return supervisor;
    usedKeys.add(locked.key);
    const assignedSchools = canonicalizeSchools(locked.schools);
    const sheetSynced = supervisor.source === 'google-sheet' || Boolean(supervisor.sourceSyncedAt);
    return {
      ...supervisor,
      name: locked.name,
      email: locked.email,
      phone: supervisor.phone || locked.phone,
      sourceAliases: supervisorSourceAliases(locked.name),
      schools: assignedSchools,
      assignedSchoolCount: sheetSynced ? Number(supervisor.assignedSchoolCount || 0) : assignedSchools.length,
      weeklyGoal: Number(supervisor.weeklyGoal || 0),
      monthlyGoal: Number(supervisor.monthlyGoal || 0),
      source: supervisor.source === 'google-sheet' ? supervisor.source : 'lista oficial travada'
    };
  });
  LOCKED_SUPERVISOR_ASSIGNMENTS.forEach((locked) => {
    if (usedKeys.has(locked.key)) return;
    const assignedSchools = canonicalizeSchools(locked.schools);
    normalized.push({
      id: `sup-${locked.key}`,
      name: locked.name,
      email: locked.email,
      phone: locked.phone,
      visitSourceId: SUPERVISOR_VISIT_SOURCES[0].id,
      visitSourceUrl: SUPERVISOR_VISIT_SOURCES[0].url,
      visitSourceLabel: SUPERVISOR_VISIT_SOURCES[0].label,
      visitSourcePrimary: true,
      sourceAliases: supervisorSourceAliases(locked.name),
      schools: assignedSchools,
      assignedSchoolCount: assignedSchools.length,
      weeklyGoal: 0,
      monthlyGoal: 0,
      source: 'lista oficial travada'
    });
  });
  return normalized;
}

function canonicalSupervisorName(value) {
  const key = normalizeKey(value);
  const locked = LOCKED_SUPERVISOR_ASSIGNMENTS.find((item) =>
    key === normalizeKey(item.name) ||
    key.includes(normalizeKey(item.key)) ||
    supervisorSourceAliases(item.name).some((alias) => key === normalizeKey(alias) || key.includes(normalizeKey(alias)))
  );
  return locked ? locked.name : String(value || '').trim();
}

function canonicalSchoolName(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const direct = SCHOOL_ALIASES[text.toUpperCase()];
  if (direct) return direct;
  const normalized = normalizeKey(text);
  const aliasEntry = Object.entries(SCHOOL_ALIASES).find(([alias]) => normalizeKey(alias) === normalized);
  if (aliasEntry) return aliasEntry[1];
  const comparable = normalized
    .replace(/\b(pei|ee|doutor|dr|professor|professora)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const schoolMatch = typeof SCHOOL_MASTER !== 'undefined'
    ? SCHOOL_MASTER.find((school) => {
      const schoolComparable = normalizeKey(school.name)
        .replace(/\b(pei|ee|doutor|dr|professor|professora)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return comparable && (schoolComparable.includes(comparable) || comparable.includes(schoolComparable));
    })
    : null;
  return schoolMatch ? schoolMatch.name : text;
}

const SCHOOL_MASTER = [
  { name: 'PEI EE Idalicio Mendes Lima', cie: '905227', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Doutor Antonio Deffune', cie: '49323', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professora Celia Vasques Ferrari Duch', cie: '39731', zone: 'Taquarivai', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professora Cinira Daniel da Silva', cie: '35348', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Bairro Ferreira dos Matos', cie: '915087', zone: 'Ribeirao Grande', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professora Francelina Franco', cie: '15568', zone: 'Buri', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Professor Gerson de Barros Margarido', cie: '43412', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Bairro Boa Vista Intervales', cie: '915075', zone: 'Ribeirao Grande', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Jeminiano David Muzel', cie: '15477', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professor Joao Baptista do Amaral Vasconcellos', cie: '910077', zone: 'Capao Bonito', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professor Jose Vasques Ferrari', cie: '15519', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professora Nicota Soares', cie: '15489', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Oscar Kurtz Camargo', cie: '15076', zone: 'Ribeirao Grande', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Otavio Ferrari', cie: '15404', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Padre Arlindo Vieira', cie: '15118', zone: 'Capao Bonito', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Doutor Raul Venturelli', cie: '15222', zone: 'Capao Bonito', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Ricardo Campolim de Almeida Neto', cie: '915117', zone: 'Nova Campina', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Professor Silverio Monteiro', cie: '35336', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Simpliciano Campolim de Almeida', cie: '15428', zone: 'Nova Campina', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'EE Bairro Turvo dos Almeidas', cie: '926036', zone: 'Capao Bonito', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true },
  { name: 'PEI EE Professora Zulmira de Oliveira', cie: '15544', zone: 'Itapeva', status: 'estavel', notes: 'Unidade oficial da URE Itapeva.', fixedName: true }
];

function mergeSchools(baseSchools, savedSchools) {
  const baseMap = new Map(baseSchools.map((item) => [normalizeKey(item.name), item]));
  const mergedMap = new Map();
  const unsupportedSeedStatuses = new Map([
    [normalizeKey('EE Doutor Antonio Deffune'), 'Prioridade de suporte para conectividade e laboratorio.'],
    [normalizeKey('PEI EE Professora Cinira Daniel da Silva'), 'Fila tecnica acompanhada pela base do SEINTEC.'],
    [normalizeKey('EE Doutor Raul Venturelli'), 'Monitorar infraestrutura e fila tecnica local.']
  ]);
  savedSchools.forEach((item) => {
    const canonicalName = canonicalSchoolName(item.name);
    const key = normalizeKey(canonicalName);
    const normalizedItem = unsupportedSeedStatuses.has(key) && item.notes === unsupportedSeedStatuses.get(key)
      ? { ...item, status: 'estavel', notes: 'Unidade oficial da URE Itapeva.' }
      : item;
    if (baseMap.has(key)) {
      const official = baseMap.get(key);
      const existing = mergedMap.get(key) || {};
      mergedMap.set(key, {
        ...existing,
        ...normalizedItem,
        name: official.name,
        cie: existing.cie || normalizedItem.cie || official.cie || '',
        zone: existing.zone || normalizedItem.zone || official.zone,
        status: existing.status || normalizedItem.status || official.status,
        notes: existing.notes || normalizedItem.notes || official.notes,
        fixedName: true
      });
      baseMap.delete(key);
      return;
    }
    mergedMap.set(key, {
      ...(mergedMap.get(key) || {}),
      ...normalizedItem,
      name: canonicalName
    });
  });
  return [...Array.from(mergedMap.values()), ...Array.from(baseMap.values())];
}

function defaultSchoolProfiles(schools) {
  return schools.map((school) => ({
    id: `profile-${normalizeKey(school.name)}`,
    school: school.name,
    municipality: school.zone,
    director: '',
    viceDirector: '',
    proati: '',
    goe: '',
    phone: '',
    mobile: '',
    email: '',
    address: '',
    notes: ''
  })).map(applyOfficialSchoolProfileDefaults);
}

const OFFICIAL_SCHOOL_PROFILE_DEFAULTS = {
  [normalizeKey('PEI EE Idalicio Mendes Lima')]: {
    address: 'Fazenda Pirituba, s/no - Itapeva/SP',
    phone: '(15) 3624-7326',
    email: 'e905227a@educacao.sp.gov.br',
    viceDirector: 'Aparecida de Fatima Dom. Oliveira Almeida; Flaviane Cristiane Bispo; Silmara Regina Soares Conceicao',
    goe: 'Jose Rubens Ortolan Gomes',
    notes: [
      'Horario de funcionamento: 12:00 as 23:00.',
      'E-mail pedagogico: e905227p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Gerson Francisco de Moraes; Marcela Bosoki Carvalho de Oliveira; Marcia Cristina da Silva; Silvio Cesar Fernandes de Almeida.',
      'Supervisor: Magda Gisele Silva Oliveira.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-pei-idalicio-mendes-lima/'
    ].join(' ')
  },
  [normalizeKey('EE Doutor Antonio Deffune')]: {
    phone: '(15) 3526-7271',
    email: 'e049323a@educacao.sp.gov.br',
    viceDirector: 'Maria Cristina Mendes de Melo',
    notes: [
      'Horario de funcionamento: 12:00 as 23:00.',
      'E-mail pedagogico: e049323p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Graziela Leite; Josiani Aparecida de Oliveira Almeida; Decio Henrique Ribeiro Siqueira.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-antonio-deffune/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professora Cinira Daniel da Silva')]: {
    address: 'Rua Martinho Daniel da Silva, 50 - Distrito do Guarizinho - Itapeva/SP',
    phone: '(15) 3523-1137',
    email: 'e035348a@educacao.sp.gov.br',
    director: 'Cassia Avila Bueno da Silva',
    viceDirector: 'Elizangela Justina de Paula Oliveira Costa',
    goe: 'Daiany Abreu Barros',
    notes: [
      'Horario de funcionamento: 12:00 as 23:00.',
      'E-mail pedagogico: e035348p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Amanda de Oliveira Silva; Mateus Lopes de Paula; Genice da Silva Campos Lopes.',
      'Supervisor: Adilson Manoel Fogaca.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-cinira-daniel-da-silva/'
    ].join(' ')
  },
  [normalizeKey('EE Professor Gerson de Barros Margarido')]: {
    phone: '(15) 3624-7011',
    email: 'e043412a@educacao.sp.gov.br',
    notes: [
      'Horario de funcionamento: 12:00 as 23:00.',
      'E-mail pedagogico: e043412p@educacao.sp.gov.br.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-gerson-de-barros-margarido/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Jeminiano David Muzel')]: {
    phone: '(15) 3522-3829 / (15) 3522-2155',
    email: 'e015477a@educacao.sp.gov.br',
    director: 'Elaine Cristina Araujo Toledo',
    viceDirector: 'Janaina Aparecida Pereira Ribeiro',
    goe: 'Gizeli Duarte de Oliveira',
    notes: [
      'E-mail pedagogico: e015477p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Eliane Bersonetti de Jesus Carpes; Elaine Aparecida Kuntz Cavalcanti Souza; Irene Ribeiro Leite Fortes; Thiago Dias de Oliveira.',
      'Supervisor: Adilson Manoel Fogaca.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-jeminiano-david-muzel/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professor Jose Vasques Ferrari')]: {
    address: 'Rua Professor Humberto Fascetti, no 120 - Parque Cimentolandia - Itapeva/SP',
    phone: '(15) 3522-2866',
    email: 'e015519a@educacao.sp.gov.br',
    viceDirector: 'Vera Leticia Faria da Cruz',
    goe: 'Ana Cristina Poglisch Santos',
    notes: [
      'Horario de funcionamento: 07:30 as 17:00.',
      'E-mail pedagogico: e015519p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Luciana de Oliveira Lino; Patricia Paula da Silva Tavares; Paulo Roberto Gomes Alves.',
      'Supervisor: Maria Luiza Brisolla de Queiroz.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-jose-vasques-ferrari/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professora Nicota Soares')]: {
    address: 'Rua Roselandia, s/no - Jardim Belvedere - Itapeva/SP',
    phone: '(15) 3522-3077',
    email: 'e015489a@educacao.sp.gov.br',
    director: 'Myrna Weruska Pereira de Souza',
    goe: 'Valquiria dos Santos Pereira Rosa',
    notes: [
      'Horario de funcionamento: 07:00 as 17:00.',
      'E-mail pedagogico: e015489p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Ernesto Alves Filho; Maria Fernanda Garcia Chiarelli.',
      'Supervisor: Daiane Aparecida de Oliveira Ribeiro.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-nicota-soares/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Otavio Ferrari')]: {
    phone: '(15) 3522-0303 / (15) 3522-1691',
    email: 'e015404a@educacao.sp.gov.br',
    director: 'Fabiano Jose Santos Ferraz',
    goe: 'Marcelo Jose Fonseca de Lima',
    notes: [
      'E-mail pedagogico: e015404p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Fabiana de Souza Roca.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-otavio-ferrari/'
    ].join(' ')
  },
  [normalizeKey('EE Professor Silverio Monteiro')]: {
    phone: '(15) 5704-3611',
    email: 'e035336a@educacao.sp.gov.br',
    notes: [
      'Horario de funcionamento: 12:00 as 23:00.',
      'E-mail pedagogico: e035336p@educacao.sp.gov.br.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-silverio-monteiro/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professora Zulmira de Oliveira')]: {
    phone: '(15) 3522-1655',
    email: 'e015544a@educacao.sp.gov.br',
    director: 'Maria Aparecida Miranda Melo',
    goe: 'Pedro Henrique Pinheiro Barros',
    notes: [
      'Horario de funcionamento: 07:00 as 23:00.',
      'E-mail pedagogico: e015544p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Karla Fernanda Diniz; Cristina Souza Lucio Martins de Oliveira Pontes; Geiza Ferreira de Oliveira; Joao Carlos Biazzon.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/zulmira-de-oliveira/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Padre Arlindo Vieira')]: {
    phone: '(15) 3542-1530',
    email: 'e015118a@educacao.sp.gov.br',
    director: 'Edicleia Pontes de Jesus',
    goe: 'Luana Aparecida da Cruz Prestes Queiroz',
    notes: [
      'Horario de funcionamento: 07:30 as 17:00.',
      'E-mail pedagogico: e015118p@educacao.sp.gov.br.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-padre-arlindo-vieira/'
    ].join(' ')
  },
  [normalizeKey('EE Bairro Turvo dos Almeidas')]: {
    phone: '(15) 3379-7199',
    email: 'e926036a@educacao.sp.gov.br',
    notes: [
      'Horario de funcionamento: 12:30 as 23:00.',
      'E-mail pedagogico: e926036p@educacao.sp.gov.br.',
      'Supervisor: Maria Luiza Brisolla de Queiroz.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-bairro-turvo-dos-almeidas/'
    ].join(' ')
  },
  [normalizeKey('EE Doutor Raul Venturelli')]: {
    address: 'Rua Yoiti Ikeda, 170 - Centro - Capao Bonito/SP',
    phone: '(15) 3542-1131 / (15) 3542-1518',
    email: 'e015222a@educacao.sp.gov.br',
    director: 'Elisete de Fatima Siqueira',
    viceDirector: 'Silvia Cristina de Oliveira Barros; Simone Paula dos Reis Rodrigues',
    goe: 'Sergio de Proenca Ramos',
    notes: [
      'Horario de funcionamento: 07:00 as 23:00.',
      'E-mail pedagogico: e015222p@educacao.sp.gov.br.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-raul-venturelli/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professor Joao Baptista do Amaral Vasconcellos')]: {
    phone: '(15) 3542-2370',
    email: 'e910077a@educacao.sp.gov.br',
    director: 'Alessandra Ap. Souto Martinho J. de Oliveira',
    goe: 'Dalva Maria Garcia',
    notes: [
      'Horario de funcionamento: 07:00 as 23:00.',
      'E-mail pedagogico: e910077p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Ana Caroline Domingues de Almeida Goes.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-joao-b-do-amaral-vasconcellos/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Oscar Kurtz Camargo')]: {
    address: 'Rua Joaquim Amantino Ferreira, no 317 - Centro - Ribeirao Grande/SP',
    phone: '(15) 3544-1194 / (15) 3544-1137',
    email: 'e015076a@educacao.sp.gov.br',
    director: 'Milena Ferreira de Almeida Chrischner Figueiredo',
    goe: 'Amanda Caroline Ferreira Monticeli',
    notes: [
      'Horario de funcionamento: 07:00 as 23:00.',
      'E-mail pedagogico: e015076p@educacao.sp.gov.br.',
      'Supervisor: Magda Gisele Silva Oliveira.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-oscar-kurtz-camargo/'
    ].join(' ')
  },
  [normalizeKey('EE Bairro Boa Vista Intervales')]: {
    phone: '(15) 3444-6100',
    email: 'e915075a@educacao.sp.gov.br',
    notes: [
      'Horario de funcionamento: 07:00 as 17:40.',
      'E-mail pedagogico: e915075p@educacao.sp.gov.br.',
      'Supervisor: Maria Luiza Brisolla de Queiroz.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/bairro-boa-vista-intervales/'
    ].join(' ')
  },
  [normalizeKey('EE Bairro Ferreira dos Matos')]: {
    phone: '(15) 3544-6226',
    email: 'e915087a@educacao.sp.gov.br',
    notes: [
      'Horario de funcionamento: 12:30 as 23:00.',
      'E-mail pedagogico: e915087p@educacao.sp.gov.br.',
      'Supervisor: Daiane Aparecida de Oliveira Ribeiro.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-bairro-ferreira-dos-matos/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Simpliciano Campolim de Almeida')]: {
    phone: '(15) 3535-1126',
    email: 'e015428a@educacao.sp.gov.br',
    director: 'Antonio dos Santos Junior',
    goe: 'Donizeth Lopes de Camargo Junior',
    notes: [
      'Horario de funcionamento: 07:00 as 23:00.',
      'E-mail pedagogico: e015428p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Leticia Goncalves Taura; Zenilton Ferreira de Oliveira.',
      'Supervisor: Adilson Manoel Fogaca.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-simpliciano-campolim-de-almeida/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Ricardo Campolim de Almeida Neto')]: {
    phone: '(15) 3535-0309 / (15) 3535-7373',
    email: 'e915117a@educacao.sp.gov.br',
    director: 'Rodrigo Manoel Ferreira Marques',
    goe: 'Wilson Rodrigues Cordeiro',
    notes: [
      'Horario de funcionamento: 12:00 as 23:00.',
      'E-mail pedagogico: e915117p@educacao.sp.gov.br.',
      'Supervisor: Adilson Manoel Fogaca.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-ricardo-campolim-de-almeida-neto/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professora Francelina Franco')]: {
    phone: '(15) 3546-1242',
    viceDirector: 'Elder Fogaca de Lara',
    goe: 'Nelia Aparecida de Oliveira Alves',
    notes: [
      'Horario de funcionamento: 07:00 as 23:00.',
      'Coordenadores de Gestao Pedagogica: Zelma de Campos Lucio Oliveira; Edilson Ponce de Camargo; Guadalupe Aparecida de Queiroz Antunes; Maria Andrea Bortotti.',
      'Supervisor: Edilene Silva Almeida Oliveira.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-francelina-franco/'
    ].join(' ')
  },
  [normalizeKey('PEI EE Professora Celia Vasques Ferrari Duch')]: {
    phone: '(15) 3534-1192',
    email: 'e039731a@educacao.sp.gov.br',
    director: 'Paulo Sergio Vieira',
    notes: [
      'Horario de funcionamento: 12:40 as 23:00.',
      'E-mail pedagogico: e039731p@educacao.sp.gov.br.',
      'Coordenadores de Gestao Pedagogica: Roselaine Lucio Ribeiro.',
      'Fonte: https://deitapeva.educacao.sp.gov.br/ee-celia-vasques-ferrari-duch/'
    ].join(' ')
  }
};

function applyOfficialSchoolProfileDefaults(profile) {
  const official = OFFICIAL_SCHOOL_PROFILE_DEFAULTS[normalizeKey(profile?.school)];
  if (!official) return profile;
  return Object.fromEntries(Object.entries({ ...profile, ...official }).map(([key, value]) => [
    key,
    profile[key] ? profile[key] : value
  ]));
}

function defaultSupervisors(schools) {
  const canonicalizeSchools = lockedSupervisorSchools(schools);
  return LOCKED_SUPERVISOR_ASSIGNMENTS.map((supervisor, index) => {
    const assignedSchools = canonicalizeSchools(supervisor.schools);
    return ({
    id: `sup-${index + 1}`,
    name: supervisor.name,
    email: supervisor.email,
    phone: supervisor.phone,
    visitSourceId: SUPERVISOR_VISIT_SOURCES[0].id,
    visitSourceUrl: SUPERVISOR_VISIT_SOURCES[0].url,
    visitSourceLabel: SUPERVISOR_VISIT_SOURCES[0].label,
    visitSourcePrimary: true,
    sourceAliases: supervisorSourceAliases(supervisor.name),
    schools: assignedSchools,
    assignedSchoolCount: assignedSchools.length,
    weeklyGoal: 0,
    monthlyGoal: 0,
    source: 'lista oficial travada'
  });
  });
}

function normalizeOfficialLinks(links) {
  const source = Array.isArray(links) ? links : [];
  const normalized = source.filter((item) =>
    !(item.category === 'supervisor-sheet' && item.monthKey === APRIL_SUPERVISOR_SHEET_LINK.monthKey) &&
    item.category !== CAR_SCHEDULE_LINK.category
  );
  normalized.unshift({
    id: source.find((item) => item.category === CAR_SCHEDULE_LINK.category)?.id || uid(),
    ...CAR_SCHEDULE_LINK
  });
  normalized.unshift({
    id: source.find((item) => item.category === 'supervisor-sheet' && item.monthKey === APRIL_SUPERVISOR_SHEET_LINK.monthKey)?.id || uid(),
    ...APRIL_SUPERVISOR_SHEET_LINK
  });
  return normalized;
}

function defaultSupervisorVisits(supervisors) {
  const currentYear = new Date().getFullYear();
  return supervisors.flatMap((supervisor, supervisorIndex) =>
    supervisor.visitSourcePrimary ? [] : supervisor.schools.slice(0, 3).map((school, schoolIndex) => ({
      id: `visit-${supervisorIndex + 1}-${schoolIndex + 1}`,
      supervisor: supervisor.name,
      school,
      date: `${currentYear}-${String((schoolIndex + supervisorIndex) % 12 + 1).padStart(2, '0')}-${String(8 + schoolIndex * 6).padStart(2, '0')}`,
      type: schoolIndex % 2 === 0 ? 'Rotina' : 'Acompanhamento',
      notes: 'Registro de teste para validar o BI de supervisao.',
      source: 'teste'
    }))
  );
}

function defaultPecs() {
  return [
    { id: 'pec-eline-batagin', name: 'Eline Fernanda Teobaldo Batagin', login: 'eline.batagin', role: 'PEC - Quimica', phone: '(15) 3526-6212', email: 'deitvnpe@educacao.sp.gov.br' },
    { id: 'pec-elysane-maciel', name: 'Elysane Rodrigues Cardoso Maciel', login: 'elysane.maciel', role: 'PEC - Historia', phone: '(15) 3526-6218', email: 'deitvnpe@educacao.sp.gov.br' },
    { id: 'pec-jaqueline-borelli', name: 'Jaqueline de Oliveira Cunha Borelli', login: 'jaqueline.borelli', role: 'PEC - Arte', phone: '(15) 3526-6212', email: 'deitvnpe@educacao.sp.gov.br' },
    { id: 'pec-tatiane-graciliano', name: 'Tatiane Ryden de Mello Graciliano', login: 'tatiane.graciliano', role: 'PEC - Educacao Inclusiva', phone: '(15) 3526-6218', email: 'deitvnpe@educacao.sp.gov.br' },
    { id: 'pec-jose-netto', name: 'Jose do Amaral Netto', login: 'jose.netto', role: 'PEC - Projetos Especiais', phone: '(15) 3526-6218', email: 'deitvnpe@educacao.sp.gov.br' },
    { id: 'pec-paula', name: 'Paula', login: 'paula', role: 'Especialista em Curriculo', phone: '(15) 3526-6226', email: 'deitvnpe@educacao.sp.gov.br' }
  ];
}

const DIRECTORY_PHOTOS = {
  dirigente: 'https://midiasstoragesec.blob.core.windows.net/001/2025/09/dsc02935-5.jpg',
  asure: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-59-04.jpeg',
  ese1: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-59-04-1.jpeg',
  ese2: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-19-at-15-41-59.jpeg',
  ese3: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-59-03.jpeg',
  ese4: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-28-at-13-43-36.jpeg',
  ese5: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-14-10-29.jpeg',
  ese6: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-56.jpeg',
  eec: 'https://midiasstoragesec.blob.core.windows.net/001/2026/02/whatsapp-image-2026-02-24-at-11-55-32.jpeg',
  seafin: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-19-at-16-05-17.jpeg',
  secomse1: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-14-10-30.jpeg',
  secomse2: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-14-10-30-1.jpeg',
  sefin1: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-14-10-29-1.jpeg',
  sefin2: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-59-1.jpeg',
  seom: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-57.jpeg',
  sefisc: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-59.jpeg',
  segre: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-14-10-29-2.jpeg',
  semat: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-59-02.jpeg',
  sevesc: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-59-02-1.jpeg',
  seintec: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-58.jpeg',
  setec: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-19-at-15-54-28.jpeg',
  sepes1: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-19-at-16-08-34.jpeg',
  sepes2: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-19-at-16-05-18.jpeg',
  sefrep1: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-58-3.jpeg',
  sefrep2: 'https://midiasstoragesec.blob.core.windows.net/001/2025/09/whatsapp-image-2025-06-18-at-08-31-25.jpeg',
  seape1: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-58-1.jpeg',
  seape2: 'https://midiasstoragesec.blob.core.windows.net/001/2025/08/whatsapp-image-2025-08-05-at-13-55-58-2.jpeg',
  seape3: 'https://midiasstoragesec.blob.core.windows.net/001/2025/09/whatsapp-image-2025-09-10-at-09-38-34.jpeg',
  seape4: 'https://midiasstoragesec.blob.core.windows.net/001/2025/09/whatsapp-image-2025-06-18-at-09-23-36.jpeg',
  seape5: 'https://midiasstoragesec.blob.core.windows.net/001/2025/09/whatsapp-image-2025-06-30-at-09-20-27.jpeg'
};

function directoryContact(data) {
  return {
    id: `contact-${normalizeKey(data.name).replace(/\s+/g, '-')}`,
    phone: data.phone || '(15) 3526-6200',
    email: data.email || data.sectorEmail || 'deitv@educacao.sp.gov.br',
    ...data
  };
}

function ureDirectoryContacts(pecs = []) {
  const contacts = [
    directoryContact({ name: 'Andre Dias de Oliveira', role: 'Dirigente Regional de Ensino', sector: 'GAB', ramal: '6202', email: 'deitv@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.dirigente, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/dirigente/' }),
    directoryContact({ name: 'Vanessa', role: 'Gabinete', sector: 'GAB', ramal: '6201', email: 'deitv@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.dirigente, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/dirigente/' }),
    directoryContact({ name: 'Juliano Lobo Ribeiro', role: 'Assistente II', sector: 'GAB', ramal: '6225', email: 'juliano.ribeiro@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.dirigente, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/dirigente/' }),
    directoryContact({ name: 'Juli Francis Oliveira Roza', role: 'Executiva Publica', sector: 'ASURE', ramal: '6219', email: 'juli.oliveira@educacao.sp.gov.br', sectorEmail: 'itv.asure@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.asure, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/assessoria-tecnica-asure/' }),
    directoryContact({ name: 'Nelio Celso Fernandes Junior', role: 'Chefe de Servico', sector: 'SEOM', ramal: '6236', email: 'nelio.junior@educacao.sp.gov.br', sectorEmail: 'itv.seom@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seom, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-obras-e-manut-escolar/' }),
    directoryContact({ name: 'Priscila Aparecida Conceicao Souza', role: 'Chefe de Servico', sector: 'SEGRE', ramal: '6230', email: 'priscila.souza01@educacao.sp.gov.br', sectorEmail: 'itv.segre@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.segre, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/centro-de-informacoes-educacionais-e-gestao-da-rede-escolar/' }),
    directoryContact({ name: 'Rosinei Dell Anhol', role: 'Chefe de Secao', sector: 'SEMAT', ramal: '6228', email: 'rosinei.anhol@educacao.sp.gov.br', sectorEmail: 'itv.semat@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.semat, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-matricula-semat/' }),
    directoryContact({ name: 'Joao', role: 'Vida Escolar', sector: 'SEVESC', ramal: '6207 / 6239', email: 'itv.sevesc@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sevesc, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-vida-escolar-sevesc/' }),
    directoryContact({ name: 'Richard', role: 'Protocolo', sector: 'SEAFIN', ramal: '6200', email: 'itv.seafin@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seafin, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/servico-de-administracao-e-financas-seafin/' }),
    directoryContact({ name: 'Adriana', role: 'Protocolo', sector: 'SEAFIN', ramal: '6209', email: 'itv.seafin@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seafin, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/servico-de-administracao-e-financas-seafin/' }),
    directoryContact({ name: 'Juliana', role: 'Protocolo', sector: 'SEAFIN', ramal: '6233', email: 'itv.seafin@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seafin, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/servico-de-administracao-e-financas-seafin/' }),
    directoryContact({ name: 'Daniel Duchen Hiromitus', role: 'Chefe de Secao', sector: 'SEFISC', ramal: '6206', email: 'daniel.hiromitus@educacao.sp.gov.br', sectorEmail: 'itv.sefisc@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sefisc, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/setor-de-fiscalizacao-sefisc/' }),
    directoryContact({ name: 'Silvio', role: 'Financas', sector: 'SEFIN', ramal: '6223', email: 'itv.sefin@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sefin1, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-financas/' }),
    directoryContact({ name: 'Nelson da Conceicao Junior', role: 'Chefe de Secao', sector: 'SEFIN', ramal: '6237', email: 'nelson.junior@educacao.sp.gov.br', sectorEmail: 'itv.sefin@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sefin2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-financas/' }),
    directoryContact({ name: 'Hector Antunes de Carvalho', role: 'Diretor II', sector: 'SEPES', ramal: '6221', email: 'hector.carvalho@educacao.sp.gov.br', sectorEmail: 'itv.sepes@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sepes1, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/serrvico-de-pessoas-sepes/' }),
    directoryContact({ name: 'Elenira Trindade Diniz', role: 'Pessoas', sector: 'SEPES', ramal: '6231', email: 'elenira.diniz1@educacao.sp.gov.br', sectorEmail: 'itv.sepes@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sepes2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/serrvico-de-pessoas-sepes/' }),
    directoryContact({ name: 'Paulo Sergio de Oliveira', role: 'Administracao de Pessoal', sector: 'SEAPE', ramal: '6222', email: 'paulo.oliveira@educacao.sp.gov.br', sectorEmail: 'itv.seape@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seape1, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-administracao-de-pessoal-seape/' }),
    directoryContact({ name: 'Ana Paula', role: 'Administracao de Pessoal', sector: 'SEAPE', ramal: '6203', email: 'itv.seape@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seape2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-administracao-de-pessoal-seape/' }),
    directoryContact({ name: 'Wania Chrischner Nunes Figueiredo', role: 'Administracao de Pessoal', sector: 'SEAPE', ramal: '6204', email: 'wania.figueiredo@educacao.sp.gov.br', sectorEmail: 'itv.seape@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seape3, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-administracao-de-pessoal-seape/' }),
    directoryContact({ name: 'Camila', role: 'Administracao de Pessoal', sector: 'SEAPE', ramal: '6234', email: 'itv.seape@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seape4, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-administracao-de-pessoal-seape/' }),
    directoryContact({ name: 'Leticia Aparecida Alves dos Santos', role: 'Frequencia e Pagamento', sector: 'SEFREP', ramal: '6205', email: 'leticia.santos01@educacao.sp.gov.br', sectorEmail: 'itv.sefrep@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sefrep1, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-frequencia-e-pagamento-sefrep/' }),
    directoryContact({ name: 'Valeria', role: 'Frequencia e Pagamento', sector: 'SEFREP', ramal: '6215', email: 'itv.sefrep@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.sefrep2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-frequencia-e-pagamento-sefrep/' }),
    directoryContact({ name: 'Rafael Alves Machado', role: 'Administracao e Financas', sector: 'SEAFIN / SECOMSE', ramal: '6220', email: 'rafael.machado@educacao.sp.gov.br', sectorEmail: 'itv.secomse@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.secomse1, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-compras-e-servicos/' }),
    directoryContact({ name: 'Roque', role: 'Administracao e Financas', sector: 'SEAFIN / SECOMSE', ramal: '6229', email: 'itv.secomse@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.secomse2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-compras-e-servicos/' }),
    directoryContact({ name: 'Fabricio Santos', role: 'Chefe de Secao', sector: 'SECOMSE', ramal: '6238', email: 'fabricio.santos05@educacao.sp.gov.br', sectorEmail: 'itv.secomse@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.secomse2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-compras-e-servicos/' }),
    directoryContact({ name: 'Rodolfo Rodrigues Pereira', role: 'Chefe de Servico', sector: 'SEAFIN', ramal: '6240', email: 'rodolfo.pereira@educacao.sp.gov.br', sectorEmail: 'itv.seafin@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seafin, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/servico-de-administracao-e-financas-seafin/' }),
    directoryContact({ name: 'WHATS', role: 'WhatsApp institucional', sector: 'SEINTEC / SETEC', ramal: '6210', email: 'itv.setec@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.setec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-tecnologia-setec/' }),
    directoryContact({ id: 'contact-site-support-jefferson-felipe', name: 'Jefferson Felipe', role: 'Problemas no site', sector: 'SITE', ramal: 'WhatsApp', email: 'jefferson.paula@educacao.sp.gov.br', sectorEmail: 'deitvnit@educacao.sp.gov.br', whatsappUrl: 'https://wa.me/551535266210', photo: DIRECTORY_PHOTOS.setec }),
    directoryContact({ name: 'Elcio Renato Bonifacio de Azevedo', role: 'Chefe de Servico', sector: 'SEINTEC', ramal: '6211', email: 'elcio.azevedo@educacao.sp.gov.br', sectorEmail: 'itv.seintec@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.seintec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-informacoes-educacionais-e-tecnologia/' }),
    directoryContact({ name: 'Jefferson Felipe', role: 'Chefe de Secao', sector: 'SETEC', ramal: '6233', email: 'jefferson.paula@educacao.sp.gov.br', sectorEmail: 'deitvnit@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.setec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-tecnologia-setec/' }),
    directoryContact({ name: 'Jeffeson do Espirito Santo Moreira', role: 'Tecnico Prodesp', sector: 'SETEC', ramal: '6235', email: 'jefferson.santo@educacao.sp.gov.br', sectorEmail: 'deitvnit@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.setec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-tecnologia-setec/' }),
    directoryContact({ name: 'Gustavo', role: 'CTC', sector: 'SETEC', ramal: '6235', email: 'itv.setec@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.setec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/secao-de-tecnologia-setec/' }),
    directoryContact({ name: 'Jaqueline de Oliveira Cunha Borelli', role: 'PEC - Arte', sector: 'EEC', ramal: '6212', email: 'deitvnpe@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.eec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-especialistas-em-curriculo-eec/' }),
    directoryContact({ name: 'Jose do Amaral Netto', role: 'PEC - Projetos Especiais', sector: 'EEC', ramal: '6218', email: 'deitvnpe@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.eec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-especialistas-em-curriculo-eec/' }),
    directoryContact({ name: 'Paula', role: 'Especialista em Curriculo', sector: 'EEC', ramal: '6226', email: 'deitvnpe@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.eec, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-especialistas-em-curriculo-eec/' }),
    directoryContact({ name: 'Marcio Nunes da Cruz', role: 'Supervisor Educacional', sector: 'ESE', ramal: '6208', email: 'marcio.cruz@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.ese1, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' }),
    directoryContact({ name: 'Maria Luiza Brizolla de Queiroz', role: 'Supervisor Educacional', sector: 'ESE', ramal: '6216', email: 'maria.queiroz14@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.ese2, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' }),
    directoryContact({ name: 'Edilene da Silva Almeida Oliveira', role: 'Supervisor Educacional', sector: 'ESE', ramal: '6217', email: 'edilene.oliveira@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.ese3, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' }),
    directoryContact({ name: 'Adilson Fogaca', role: 'Supervisor Educacional', sector: 'ESE', ramal: '6224', email: 'adilson.fogaca@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.ese4, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' }),
    directoryContact({ name: 'Daiane Aparecida de Oliveira Ribeiro', role: 'Supervisor Educacional', sector: 'ESE', ramal: '6227', email: 'daiane.ribeiro@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.ese5, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' }),
    directoryContact({ name: 'Magda Gisele Silva de Oliveira', role: 'Supervisor Educacional', sector: 'ESE', ramal: '6232', email: 'magda.oliveira@educacao.sp.gov.br', photo: DIRECTORY_PHOTOS.ese6, sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' })
  ];
  const existing = new Set(contacts.map((item) => normalizeKey(item.name)));
  pecs.forEach((pec) => {
    if (existing.has(normalizeKey(pec.name))) return;
    contacts.push(directoryContact({
      name: pec.name,
      role: pec.role,
      sector: 'EEC',
      ramal: String(pec.phone || '').replace(/\D/g, '').slice(-4),
      phone: pec.phone,
      email: pec.email,
      photo: DIRECTORY_PHOTOS.eec,
      sourceUrl: 'https://deitapeva.educacao.sp.gov.br/equipe-de-especialistas-em-curriculo-eec/'
    }));
  });
  return contacts;
}

function mergeDirectoryContacts(baseItems, savedItems) {
  const map = new Map();
  const normalizeDirectoryContact = (item) => {
    if (normalizeKey(item?.name) !== normalizeKey('Jefferson do Espirito Santo Moreira')) return item;
    if (normalizeKey(item?.email) === normalizeKey('jefferson.paula@educacao.sp.gov.br')) {
      return {
        ...item,
        name: 'Jefferson Felipe',
        role: 'Chefe de Secao',
        ramal: '6233',
        sectorEmail: 'deitvnit@educacao.sp.gov.br'
      };
    }
    return { ...item, name: 'Jeffeson do Espirito Santo Moreira', email: item.email || 'jefferson.santo@educacao.sp.gov.br' };
  };
  const keyOf = (item) => normalizeKey(item.id || item.email || item.name);
  baseItems.map(normalizeDirectoryContact).forEach((item) => map.set(keyOf(item), item));
  savedItems.map(normalizeDirectoryContact).forEach((item) => {
    const key = keyOf(item);
    const base = map.get(key) || {};
    map.set(key, {
      ...item,
      ...base
    });
  });
  return Array.from(map.values());
}

function defaultUsers(supervisors) {
  const supervisorUsers = supervisors.map((supervisor, index) => ({
    id: `user-supervisor-${index + 1}`,
    name: supervisor.name,
    login: supervisor.name,
    pin: '1234',
    role: 'supervisor',
    supervisorName: supervisor.name,
    active: true
  }));
  return [
    {
      id: 'user-admin-jefferson',
      name: 'Jefferson',
      login: 'Jefferson',
      pin: '1234',
      role: 'admin',
      active: true
    },
    {
      id: 'user-dirigente',
      name: 'Andre',
      login: 'Andre',
      pin: '1234',
      role: 'dirigente',
      active: true
    },
    {
      id: 'user-seintec',
      name: 'Elcio',
      login: 'Elcio',
      pin: '1234',
      role: 'seintec',
      active: true
    },
    {
      id: 'user-seom-nelio',
      name: 'Nelio',
      login: 'Nelio',
      pin: '1234',
      role: 'seom',
      active: true
    },
    {
      id: 'user-ctc',
      name: 'Gustavo',
      login: 'Gustavo',
      pin: '1234',
      role: 'ctc',
      active: true
    },
    {
      id: 'user-ctc-bruno',
      name: 'Bruno',
      login: 'Bruno',
      pin: '1234',
      role: 'ctc',
      active: true
    },
    {
      id: 'user-ctc-danilo',
      name: 'Danilo',
      login: 'Danilo',
      pin: '1234',
      role: 'ctc',
      active: true
    },
    ...supervisorUsers
  ];
}

function normalizeDefaultUserNames(users) {
  const replacements = {
    dirigente: { name: 'Andre', login: 'Andre' },
    seintec: { name: 'Elcio', login: 'Elcio' },
    ctc: { name: 'Gustavo', login: 'Gustavo' }
  };
  return (users || []).map((user) => {
    const replacement = replacements[user.role];
    if (!replacement) return user;
    const oldGeneric = ['dirigente', 'seintec', 'ctc'].includes(normalizeKey(user.name)) ||
      ['dirigente', 'seintec', 'ctc'].includes(normalizeKey(user.login));
    return oldGeneric ? { ...user, ...replacement } : user;
  });
}

function enrichSupervisorSources(supervisors) {
  return (supervisors || []).map((supervisor) => {
    const source = SUPERVISOR_VISIT_SOURCES.find((item) =>
      item.aggregate ||
      item.workbookTabs ||
      normalizeKey(item.supervisor) === normalizeKey(supervisor.name) ||
      (item.aliases || []).some((alias) => normalizeKey(alias) === normalizeKey(supervisor.name))
    );
    if (!source) return supervisor;
    return {
      ...supervisor,
      visitSourceId: supervisor.visitSourceId || source.id,
      visitSourceUrl: supervisor.visitSourceUrl || source.url,
      visitSourceLabel: supervisor.visitSourceLabel || source.label,
      visitSourcePrimary: supervisor.visitSourcePrimary ?? source.primary,
      sourceAliases: [...new Set([
        ...supervisorSourceAliases(supervisor.name),
        ...(supervisor.sourceAliases || []),
        ...(source.aliases || [])
      ])]
    };
  });
}

function loadSupabaseConfig() {
  try {
    return {
      ...SUPABASE_DEFAULT_CONFIG,
      ...JSON.parse(localStorage.getItem(SUPABASE_CONFIG_KEY) || '{}')
    };
  } catch {
    return { ...SUPABASE_DEFAULT_CONFIG };
  }
}

function saveSupabaseConfig(config) {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config || {}));
}

function createDefaults() {
  const schools = SCHOOL_MASTER.map((school) => ({ id: uid(), ...school }));
  const supervisors = defaultSupervisors(schools);
  const pecs = defaultPecs();
  return {
    stateVersion: STATE_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    lastBackupAt: '',
    inventoryUpdatedAt: new Date().toISOString(),
    inventoryUpdatedBySchool: {},
    settings: {
      funAdsEnabled: false
    },
    profile: {
      name: 'Jefferson',
      unit: 'URE Itapeva',
      pin: '1234'
    },
    users: defaultUsers(supervisors, pecs),
    officialContacts: {
      office: 'Unidade Regional de Ensino de Itapeva - URE | Rua Torquato Raimundo, 96 - Jardim Ferrari - Itapeva/SP | Tel. (15) 3526-6200 | deitv@educacao.sp.gov.br',
      officeName: 'Unidade Regional de Ensino de Itapeva - URE',
      address: 'Rua Torquato Raimundo, 96 - Jardim Ferrari - Itapeva/SP',
      phone: '(15) 3526-6200',
      email: 'deitv@educacao.sp.gov.br',
      dirigente: 'Andre Dias de Oliveira',
      since: '23/05/2025'
    },
    municipalities: [
      { id: uid(), name: 'Itapeva', schoolCount: 11, notes: 'Maior concentracao de unidades da regional.' },
      { id: uid(), name: 'Capao Bonito', schoolCount: 4, notes: 'Polo importante na circunscricao da URE.' },
      { id: uid(), name: 'Ribeirao Grande', schoolCount: 3, notes: 'Base com unidades em bairros e area de Intervales.' },
      { id: uid(), name: 'Nova Campina', schoolCount: 2, notes: 'Municipio com duas unidades PEI oficiais.' },
      { id: uid(), name: 'Buri', schoolCount: 1, notes: 'Unidade oficial Francelina Franco.' },
      { id: uid(), name: 'Taquarivai', schoolCount: 1, notes: 'Unidade oficial Celia Vasques Ferrari Duch.' }
    ],
    sectors: [
      {
        id: uid(),
        code: 'PECs',
        name: 'Equipe de Especialistas em Curriculo',
        lead: 'Equipe de Especialistas em Curriculo da URE Itapeva',
        phone: '(15) 3526-6201',
        email: 'deitv@educacao.sp.gov.br',
        summary: 'Especialistas por area curricular para apoio pedagogico, orientacoes tecnicas, recomposicao e acompanhamento de acoes formativas.'
      },
      {
        id: uid(),
        code: 'DIRETORIA',
        name: 'Dirigencia Regional de Ensino',
        lead: 'Andre Dias de Oliveira',
        phone: '(15) 3526-6200',
        email: 'deitv@educacao.sp.gov.br',
        summary: 'Gestao geral da regional e articulacao das diretrizes educacionais.'
      },
      {
        id: uid(),
        code: 'SEINTEC',
        name: 'Servico de Informacoes Educacionais e Tecnologia',
        lead: 'Elcio Renato Bonifacio de Azevedo',
        phone: '(15) 3526-6211',
        email: 'itv.seintec@educacao.sp.gov.br',
        summary: 'Atendimento tecnico, portais, chamados, suporte de tecnologia e monitoramento das escolas.'
      },
      {
        id: uid(),
        code: 'SETEC',
        name: 'Secao de Tecnologia',
        lead: 'Jefferson Felipe',
        phone: '(15) 3526-6235',
        email: 'deitvnit@educacao.sp.gov.br',
        summary: 'Apoio tecnico operacional e suporte de infraestrutura vinculados ao SEINTEC.'
      },
      {
        id: uid(),
        code: 'SEOM',
        name: 'Servico de Obras e Manutencao Escolar',
        lead: 'Nelio Celso Fernandes Junior',
        phone: '(15) 3526-6236',
        email: 'itv.seom@educacao.sp.gov.br',
        summary: 'Infraestrutura, patrimonio, manutencao e cadastro fisico das unidades escolares.'
      },
      {
        id: uid(),
        code: 'SEGRE',
        name: 'Servico de Gestao da Rede Escolar',
        lead: 'Priscila Aparecida Conceicao Souza',
        phone: '(15) 3526-6230',
        email: 'deitvcie@educacao.sp.gov.br',
        summary: 'Gestao da rede, matricula, vida escolar e apoio ao cadastro das unidades.'
      },
      {
        id: uid(),
        code: 'SEVESC',
        name: 'Secao de Vida Escolar',
        lead: 'Vanessa Juliane Antunes Polidoro Rodrigues',
        phone: '(15) 3526-6201',
        email: 'deitvnve@educacao.sp.gov.br',
        summary: 'Vida escolar, registros, documentacao e interface de atendimento com escolas.'
      },
      {
        id: uid(),
        code: 'CRH',
        name: 'Centro de Recursos Humanos',
        lead: 'Hector Antunes de Carvalho',
        phone: '(15) 3526-6204',
        email: 'deitvcrh@educacao.sp.gov.br',
        summary: 'Fluxos de pessoas, pessoal, orientacoes funcionais e apoio ao SEPES.'
      },
      {
        id: uid(),
        code: 'ESE',
        name: 'Equipe de Supervisao de Ensino',
        lead: 'Equipe de Supervisores da URE Itapeva',
        phone: '(15) 3526-6227 / 6217 / 6232 / 6208 / 6216 / 6224',
        email: 'daiane.ribeiro@educacao.sp.gov.br',
        summary: 'Supervisao, acompanhamento pedagogico, programas e orientacao das unidades.'
      }
    ],
    directoryContacts: ureDirectoryContacts(pecs),
    officialLinks: [
      {
        id: uid(),
        ...APRIL_SUPERVISOR_SHEET_LINK
      },
      {
        id: uid(),
        ...CAR_SCHEDULE_LINK
      },
      { id: uid(), label: 'Portal da Diretoria de Ensino de Itapeva', url: 'https://deitapeva.educacao.sp.gov.br/' },
      { id: uid(), label: 'Escolas da URE Itapeva', url: 'https://deitapeva.educacao.sp.gov.br/escolas/' },
      { id: uid(), label: 'Lista de ramais da URE Itapeva', url: 'https://deitapeva.educacao.sp.gov.br/lista-de-ramais/' },
      { id: uid(), label: 'Fale Conosco da URE Itapeva', url: 'https://deitapeva.educacao.sp.gov.br/central-de-atendimento/' },
      { id: uid(), label: 'SIC.SP - Informacoes ao Cidadao', url: 'https://deitapeva.educacao.sp.gov.br/sic-sp-informacoes-ao-cidadao/' },
      { id: uid(), label: 'Assessoria Tecnica - ASURE', url: 'https://deitapeva.educacao.sp.gov.br/assessoria-tecnica-asure/' },
      { id: uid(), label: 'Dirigente Regional', url: 'https://deitapeva.educacao.sp.gov.br/dirigente/' },
      { id: uid(), label: 'Equipe de Supervisao Escolar', url: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' },
      { id: uid(), label: 'Equipe de Especialistas em Curriculo', url: 'https://deitapeva.educacao.sp.gov.br/equipe-de-especialistas-em-curriculo-eec/' },
      { id: uid(), label: 'Servico de Administracao e Financas - SEAFIN', url: 'https://deitapeva.educacao.sp.gov.br/servico-de-administracao-e-financas-seafin/' },
      { id: uid(), label: 'Secao de Compras e Servicos', url: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-compras-e-servicos/' },
      { id: uid(), label: 'Secao de Financas', url: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-financas/' },
      { id: uid(), label: 'Servico de Obras e Manutencao Escolar', url: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-obras-e-manut-escolar/' },
      { id: uid(), label: 'Setor de Fiscalizacao', url: 'https://deitapeva.educacao.sp.gov.br/setor-de-fiscalizacao-sefisc/' },
      { id: uid(), label: 'Centro de Informacoes Educacionais', url: 'https://deitapeva.educacao.sp.gov.br/centro-de-informacoes-educacionais-e-gestao-da-rede-escolar/' },
      { id: uid(), label: 'Secao de Matricula', url: 'https://deitapeva.educacao.sp.gov.br/secao-de-matricula-semat/' },
      { id: uid(), label: 'Secao de Vida Escolar', url: 'https://deitapeva.educacao.sp.gov.br/secao-de-vida-escolar-sevesc/' },
      { id: uid(), label: 'Pagina do SEINTEC', url: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-informacoes-educacionais-e-tecnologia/' },
      { id: uid(), label: 'Secao de Tecnologia - SETEC', url: 'https://deitapeva.educacao.sp.gov.br/secao-de-tecnologia-setec/' },
      { id: uid(), label: 'Servico de Pessoas - SEPES', url: 'https://deitapeva.educacao.sp.gov.br/serrvico-de-pessoas-sepes/' },
      { id: uid(), label: 'Secao de Frequencia e Pagamento', url: 'https://deitapeva.educacao.sp.gov.br/secao-de-frequencia-e-pagamento-sefrep/' },
      { id: uid(), label: 'Secao de Administracao de Pessoal', url: 'https://deitapeva.educacao.sp.gov.br/secao-de-administracao-de-pessoal-seape/' },
      { id: uid(), label: 'Pagina do SEOM', url: 'https://deitapeva.educacao.sp.gov.br/nucleo-de-obras-e-manut-escolar/' },
      { id: uid(), label: 'Equipe de Supervisao de Ensino', url: 'https://deitapeva.educacao.sp.gov.br/equipe-de-supervisao-escolar/' },
      { id: uid(), label: 'Secretaria Escolar Digital', url: 'https://sed.educacao.sp.gov.br/' },
      { id: uid(), label: 'Centro de Midias', url: 'https://cmspweb.ip.tv/' }
    ],
    checklist: [
      { id: uid(), text: 'Conferir chamados abertos e prioridades do SEINTEC', done: false },
      { id: uid(), text: 'Revisar escolas em atencao da regional antes da rota', done: false },
      { id: uid(), text: 'Validar se ha redes ou boletins para processamento no dia', done: true }
    ],
    tasks: [],
    calls: [],
    schools,
    supervisors,
    supervisorVisits: defaultSupervisorVisits(supervisors),
    schoolProfiles: defaultSchoolProfiles(schools),
    schoolImports: GENERATED_SCHOOL_DATA.schoolImports || [],
    inventoryReplacementSchools: [],
    schoolAssets: GENERATED_SCHOOL_DATA.schoolAssets || [],
    schoolNetworks: GENERATED_SCHOOL_DATA.schoolNetworks || [],
    assets: GENERATED_SCHOOL_DATA.generalAssets || [],
    notes: [],
    histories: {
      calls: [],
      visits: [],
      schoolEvents: []
    },
    ponto: {
      entrada: '',
      saida: ''
    },
    redes: {
      folderPath: '',
      yearSuffix: '26',
      numberPlaceholder: '{{REDE_NUMERO}}',
      datePlaceholder: '{{REDE_DATA}}',
      headingPlaceholder: '{{REDE_CABECALHO}}',
      assuntoLabel: 'Assunto:',
      draftNumber: '',
      draftDate: '',
      draftHeading: 'Diretoria de Ensino - Região de Itapeva',
      draftSubject: '',
      draftDestination: '',
      draftBody: '',
      processStartNumber: '',
      processDate: ''
    }
  };
}

function mergeState(saved) {
  const base = createDefaults();
  if (!saved || typeof saved !== 'object') return base;
  const repaired = deepRepairStrings(saved);
  const savedVersion = Number(repaired.stateVersion || 1);
  const lastUpdatedAt = repaired.lastUpdatedAt || new Date().toISOString();
  const lastBackupAt = repaired.lastBackupAt || '';
  const inventoryUpdatedAt = repaired.inventoryUpdatedAt || lastUpdatedAt;
  const inventoryUpdatedBySchool = repaired.inventoryUpdatedBySchool && typeof repaired.inventoryUpdatedBySchool === 'object'
    ? Object.fromEntries(Object.entries(repaired.inventoryUpdatedBySchool)
      .map(([school, value]) => [canonicalSchoolName(school) || school, value])
      .filter(([school, value]) => school && value))
    : {};
  const savedMunicipalities = Array.isArray(repaired.municipalities) ? repaired.municipalities.filter((item) => normalizeKey(item.name) !== normalizeKey('Nao definido')) : [];
  const savedSectors = Array.isArray(repaired.sectors) ? repaired.sectors : [];
  const savedDirectoryContacts = Array.isArray(repaired.directoryContacts) ? repaired.directoryContacts : [];
  const savedOfficialLinks = Array.isArray(repaired.officialLinks) ? repaired.officialLinks : [];
  const savedSchools = Array.isArray(repaired.schools)
    ? repaired.schools.map((item) => ({ ...item, name: canonicalSchoolName(item.name) }))
    : [];
  const mergedSchools = mergeSchools(base.schools, savedSchools);
  const baseProfiles = defaultSchoolProfiles(mergedSchools);
  const savedSchoolImports = Array.isArray(repaired.schoolImports)
    ? repaired.schoolImports.map((item) => ({ ...item, school: canonicalSchoolName(item.school) }))
    : [];
  const savedSchoolAssets = Array.isArray(repaired.schoolAssets)
    ? repaired.schoolAssets.map((item) => ({ ...item, school: canonicalSchoolName(item.school) }))
    : [];
  const inventoryReplacementSchools = Array.isArray(repaired.inventoryReplacementSchools)
    ? Array.from(new Set(repaired.inventoryReplacementSchools.map((school) => canonicalSchoolName(school)).filter(Boolean)))
    : [];
  const replacementKeys = new Set(inventoryReplacementSchools.map((school) => normalizeKey(school)));
  const baseSchoolAssets = replacementKeys.size
    ? base.schoolAssets.filter((item) => !replacementKeys.has(normalizeKey(item.school)))
    : base.schoolAssets;
  const savedSchoolNetworks = Array.isArray(repaired.schoolNetworks)
    ? repaired.schoolNetworks.map((item) => ({ ...item, school: canonicalSchoolName(item.school) }))
    : [];
  const savedTasks = Array.isArray(repaired.tasks)
    ? repaired.tasks.map((item) => ({
      ...item,
      place: canonicalSchoolName(item.place) || item.place,
      scope: item.scope || (item.category === 'Carro oficial' ? 'carro' : item.category === 'Evento URE' || item.category === 'CTC' ? 'ure' : 'pessoal'),
      owner: item.owner || item.createdBy || repaired.profile?.name || base.profile.name,
      createdBy: item.createdBy || repaired.profile?.name || base.profile.name
    })).filter((item) => keepImportedFleetTask(item))
    : base.tasks;
  const savedCalls = Array.isArray(repaired.calls)
    ? repaired.calls.map((item) => ({ ...item, school: canonicalSchoolName(item.school) || item.school }))
    : base.calls;
  const savedSupervisors = Array.isArray(repaired.supervisors)
    ? repaired.supervisors.map((supervisor) => ({
      ...supervisor,
      schools: Array.from(new Set((supervisor.schools || []).map((school) => canonicalSchoolName(school)).filter(Boolean)))
    }))
    : [];
  const savedSupervisorVisits = Array.isArray(repaired.supervisorVisits)
    ? repaired.supervisorVisits.map((item) => ({
      ...item,
      supervisor: canonicalSupervisorName(item.supervisor) || item.supervisor,
      school: canonicalSchoolName(item.school) || item.school
    }))
    : [];
  return {
    ...base,
    stateVersion: Math.max(STATE_VERSION, savedVersion),
    lastUpdatedAt,
    lastBackupAt,
    inventoryUpdatedAt,
    inventoryUpdatedBySchool,
    settings: {
      ...base.settings,
      ...(repaired.settings || {}),
      funAdsEnabled: false
    },
    profile: { ...base.profile, ...(repaired.profile || {}) },
    users: normalizeDefaultUserNames(mergeUniqueBy(
      base.users,
      Array.isArray(repaired.users) ? repaired.users : [],
      (item) => normalizeKey(item.id || item.login || item.name)
    ).map((item) => ({ ...item, active: item.active !== false }))),
    officialContacts: { ...base.officialContacts, ...(repaired.officialContacts || {}) },
    municipalities: mergeUniqueBy(base.municipalities, savedMunicipalities, (item) => normalizeKey(item.name)),
    sectors: mergeUniqueBy(base.sectors, savedSectors, (item) => normalizeKey(item.code || item.name)),
    directoryContacts: mergeDirectoryContacts(base.directoryContacts, savedDirectoryContacts),
    officialLinks: normalizeOfficialLinks(mergeUniqueBy(base.officialLinks, savedOfficialLinks, (item) => normalizeKey(item.url || item.label))),
    checklist: Array.isArray(repaired.checklist) ? repaired.checklist : base.checklist,
    tasks: savedTasks,
    calls: savedCalls,
    schools: mergedSchools,
    supervisors: applyLockedSupervisorAssignments(
      enrichSupervisorSources(mergeUniqueBy(base.supervisors, savedSupervisors, (item) => normalizeKey(item.email || item.name))),
      mergedSchools
    ),
    supervisorVisits: mergeUniqueBy(
      base.supervisorVisits,
      savedSupervisorVisits,
      (item) => normalizeKey(`${item.supervisor}|${item.school}|${item.date}|${item.type}`)
    ),
    schoolProfiles: mergeUniqueBy(
      baseProfiles,
      Array.isArray(repaired.schoolProfiles) ? repaired.schoolProfiles : [],
      (item) => normalizeKey(item.school)
    ).map((item) => {
      const canonicalName = canonicalSchoolName(item.school);
      const school = mergedSchools.find((entry) => normalizeKey(entry.name) === normalizeKey(canonicalName));
      return {
        ...item,
        school: school ? school.name : canonicalName,
        municipality: item.municipality || school?.zone || ''
      };
    }).map(applyOfficialSchoolProfileDefaults),
    schoolImports: mergeUniqueBy(
      base.schoolImports,
      savedSchoolImports,
      (item) => normalizeKey(`${item.school}|${item.label || item.filename || item.id}`)
    ).map((item) => ({
      ...item,
      reviewStatus: inferImportReviewStatus(item)
    })),
    inventoryReplacementSchools,
    schoolAssets: mergeUniqueBy(
      baseSchoolAssets,
      savedSchoolAssets,
      (item) => normalizeKey(`${item.school}|${item.name}|${item.notes || ''}`)
    ),
    schoolNetworks: mergeUniqueBy(
      base.schoolNetworks,
      savedSchoolNetworks,
      (item) => normalizeKey(`${item.school}|${item.adminNetwork || ''}|${item.pedNetwork || ''}|${item.cie || ''}`)
    ),
    assets: mergeUniqueBy(
      base.assets,
      Array.isArray(repaired.assets) ? repaired.assets : [],
      (item) => normalizeKey(`${item.place}|${item.name}|${item.notes || ''}`)
    ),
    notes: Array.isArray(repaired.notes) ? repaired.notes : base.notes,
    histories: {
      calls: repaired.histories?.calls || base.histories.calls,
      visits: repaired.histories?.visits || base.histories.visits,
      schoolEvents: repaired.histories?.schoolEvents || base.histories.schoolEvents
    },
    ponto: { ...base.ponto, ...(repaired.ponto || {}) },
    redes: { ...base.redes, ...(repaired.redes || {}) }
  };
}

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const loaded = mergeState(JSON.parse(current));
      rememberPersistedState(loaded);
      return loaded;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return mergeLegacyState(JSON.parse(legacy));
  } catch {
    return createDefaults();
  }
  return createDefaults();
}

function comparableStateForPersistence(value) {
  const { lastUpdatedAt, ...rest } = value || {};
  return {
    ...rest,
    stateVersion: STATE_VERSION
  };
}

function rememberPersistedState(value) {
  try {
    const comparable = comparableStateForPersistence(value);
    lastSavedStateComparable = JSON.stringify(comparable);
    lastSavedStatePayload = JSON.stringify({
      ...value,
      stateVersion: STATE_VERSION
    });
  } catch {
    lastSavedStateComparable = '';
    lastSavedStatePayload = '';
  }
}

function saveState() {
  if (typeof isLegacyReadOnlyMode === 'function' && isLegacyReadOnlyMode()) return false;
  if (typeof resetDerivedCache === 'function') resetDerivedCache();
  const comparable = JSON.stringify(comparableStateForPersistence(state));
  if (comparable === lastSavedStateComparable) return false;
  const nextUpdatedAt = new Date().toISOString();
  state.stateVersion = STATE_VERSION;
  state.lastUpdatedAt = nextUpdatedAt;
  const payload = JSON.stringify(state);
  if (payload === lastSavedStatePayload) return false;
  localStorage.setItem(STORAGE_KEY, payload);
  lastSavedStateComparable = comparable;
  lastSavedStatePayload = payload;
  if (typeof scheduleSupabaseAutoSave === 'function') scheduleSupabaseAutoSave();
  return true;
}

function mergeLegacyState(saved) {
  const merged = mergeState(saved);
  if (!merged.officialContacts?.office) {
    merged.officialContacts = {
      ...merged.officialContacts,
      office: 'Diretoria de Ensino - Itapeva | suporte setorial e rede escolar'
    };
  }
  return merged;
}
