import crypto from 'crypto';
import {
  OperacaoOrigem,
  TreinamentoOrigem,
  ArmariaCategoria,
  ReciboTipo,
  ArmariaPeriodo,
  RelatorioPeriodoTipo,
  DesempenhoCategoria,
  ARMARIA_CATEGORIA_META,
  listAvailableOperationDates,
  listAvailableTrainingDates,
  findOperationReportsByPeriod,
  findTrainingReportsByPeriod,
  generateMultipleOperationsPdf,
  generateMultipleTrainingsPdf,
  findUserCautelasByCategory,
  findUnitCautelasByCategoryAndPeriod,
  listAvailableCautelaPeriods,
  generateCategoryCautelasPdf,
  findVaultInventoryByCategory,
  generateUnitVaultInventoryPdf,
  generateMyPerformanceSheetPdf,
  generateUnitPerformanceReportPdf
} from './whatsappPdfService';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com';
const ALLOWED_API_VERSIONS = new Set(['v23.0', 'v22.0', 'v21.0', 'v20.0', 'v19.0']);

export interface BotInteractiveButton {
  id: string;
  title: string; // Meta max 20 chars
}

export interface BotListRow {
  id: string;
  title: string; // Meta max 24 chars
  description?: string; // Meta max 72 chars
}

export interface BotReplyItem {
  kind: 'buttons' | 'list' | 'text' | 'document' | 'link';
  header?: string;
  body: string;
  footer?: string;
  buttons?: BotInteractiveButton[];
  listButtonText?: string;
  listRows?: BotListRow[];
  documentFilename?: string;
  documentCaption?: string;
  documentDownloadUrl?: string;
  actionUrl?: string;
  actionLabel?: string;
  documentBuffer?: Buffer; // internal only, stripped before JSON response
}

export interface BotInputMessage {
  fromPhone: string;
  text?: string;
  buttonId?: string;
  buttonTitle?: string;
  listRowId?: string;
  listRowTitle?: string;
}

export interface BotProcessOptions {
  dryRun?: boolean;
  forcedUserId?: string;
  publicBaseUrl?: string;
  signingKey: Buffer;
  decryptSecret: (encoded?: string | null) => string;
}

export interface PermittedUnit {
  id: string;
  name: string;
  shortName: string;
  departmentId: string | null;
}

export interface ResolvedWhatsappUser {
  id: string;
  name: string;
  masp: string;
  cargo: string;
  phone: string;
  role: string;
  roles: string[];
  departmentId: string | null;
  unitId: string | null;
  scope: string;
  isArmeiroOrAdmin: boolean;
  isGlobal: boolean;
  permittedUnits: PermittedUnit[];
}

export interface SignedPdfTokenPayload {
  scope:
    | 'op_single'
    | 'op_last24h'
    | 'op_period'
    | 'op_rel_period'
    | 'tr_single'
    | 'tr_last24h'
    | 'tr_period'
    | 'tr_rel_period'
    | 'arm_receipt'
    | 'arm_report'
    | 'arm_my_cautelas'
    | 'arm_unit_cautelas'
    | 'arm_unit_vaults'
    | 'desemp_my'
    | 'desemp_unit';
  origem?: OperacaoOrigem | TreinamentoOrigem;
  id?: string;
  granularity?: 'DIA' | 'MES' | 'ANO';
  isoFilter?: string;
  unitIds?: string[];
  unitLabel?: string;
  receiptTipo?: ReciboTipo;
  categoria?: ArmariaCategoria;
  onlyActive?: boolean;
  userId?: string;
  userName?: string;
  userMasp?: string;
  period?: ArmariaPeriodo;
  relPeriodo?: RelatorioPeriodoTipo;
  desempCategoria?: DesempenhoCategoria;
  exp: number;
}

export function createSignedPdfToken(payload: Omit<SignedPdfTokenPayload, 'exp'>, signingKey: Buffer): string {
  const full: SignedPdfTokenPayload = {
    ...payload,
    exp: Date.now() + 15 * 60 * 1000 // 15 minutos
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedPdfToken(token: string, signingKey: Buffer): SignedPdfTokenPayload | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;
  const expectedSig = crypto.createHmac('sha256', signingKey).update(encoded).digest('base64url');
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedPdfTokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeText(val?: string | null): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Normaliza telefone desconsiderando pontos, traços, parênteses, sinais e código do país (+55).
 */
export function stripBrazilPhone(phone?: string | null): string {
  let digits = normalizePhoneDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('0055') && digits.length >= 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }
  return digits;
}

function phonesMatch(a: string, b: string): boolean {
  const n1 = stripBrazilPhone(a);
  const n2 = stripBrazilPhone(b);
  if (n1.length < 8 || n2.length < 8) return false;
  if (n1 === n2) return true;

  // Se ambos possuem DDD (10 ou 11 dígitos), exige mesmo DDD + mesmos 8 dígitos finais (tolera 9º dígito BR)
  if (n1.length >= 10 && n2.length >= 10) {
    return n1.slice(0, 2) === n2.slice(0, 2) && n1.slice(-8) === n2.slice(-8);
  }

  // Se um deles foi salvo sem DDD (8 ou 9 dígitos), compara os 8 dígitos finais
  if ((n1.length === 8 || n1.length === 9) !== (n2.length === 8 || n2.length === 9)) {
    return n1.slice(-8) === n2.slice(-8);
  }

  return false;
}

function truncateText(val: string, max: number): string {
  const clean = String(val || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1))}…`;
}

function shortenUnitName(name: string): string {
  const clean = String(name || '').trim();
  const known = ['CORE', 'CAT', 'CAC', 'CAP', 'COC', 'COE', 'DEPOL', 'DECC', 'DHPP', 'DRACO', 'DEIC', 'DENARC'];
  const upper = clean.toUpperCase();
  for (const sigla of known) {
    if (upper === sigla || upper.startsWith(`${sigla} `) || upper.startsWith(`${sigla}-`) || upper.includes(`(${sigla})`)) {
      return sigla;
    }
  }
  return truncateText(clean, 20);
}

function isArmariaCategoria(val?: string | null): val is ArmariaCategoria {
  return val === 'ARMAS' || val === 'MUNICOES' || val === 'EXPLOSIVOS' || val === 'MATERIAIS';
}

export async function resolveWhatsappUserContext(
  pool: any,
  fromPhone: string,
  forcedUserId?: string
): Promise<ResolvedWhatsappUser | null> {
  let userRow: any = null;
  if (forcedUserId) {
    const [rows]: any = await pool.query('SELECT * FROM USUARIOS WHERE ID_USUARIOS = ? LIMIT 1', [forcedUserId]);
    userRow = rows?.[0] || null;
  } else {
    const [allUsers]: any = await pool.query(
      "SELECT * FROM USUARIOS WHERE TELEFONE_USUARIOS IS NOT NULL AND TELEFONE_USUARIOS <> ''"
    );
    userRow =
      (allUsers || []).find(
        (u: any) =>
          Number(u.TEM_ACESSO_SISTEMA_USUARIOS ?? 1) === 1 && phonesMatch(u.TELEFONE_USUARIOS, fromPhone)
      ) || null;
  }
  if (!userRow) return null;
  if (Number(userRow.TEM_ACESSO_SISTEMA_USUARIOS ?? 1) !== 1) return null;

  let roles: string[] = [String(userRow.PERFIL_USUARIOS || 'Policial')];
  if (userRow.ROLES_USUARIOS) {
    try {
      const parsed =
        typeof userRow.ROLES_USUARIOS === 'string'
          ? JSON.parse(userRow.ROLES_USUARIOS)
          : userRow.ROLES_USUARIOS;
      if (Array.isArray(parsed)) roles = [...roles, ...parsed.map(String)];
    } catch {}
  }
  const normRoles = Array.from(new Set(roles.map(r => r.toLowerCase())));
  const isGlobal = normRoles.includes('geral') || String(userRow.ABRANGENCIA_GESTAO_USUARIOS || '') === 'all';
  const isArmeiroOrAdmin =
    isGlobal ||
    normRoles.includes('administrador') ||
    normRoles.includes('administrativo') ||
    normRoles.includes('armeiro');
  const scope = String(userRow.ABRANGENCIA_GESTAO_USUARIOS || 'unit');

  const [allUnitRows]: any = await pool.query(
    'SELECT ID_UNIDADES, NOME_UNIDADES, DEPARTAMENTO_ID_UNIDADES FROM UNIDADES ORDER BY NOME_UNIDADES ASC'
  );
  const allUnits: PermittedUnit[] = (allUnitRows || []).map((u: any) => ({
    id: String(u.ID_UNIDADES),
    name: String(u.NOME_UNIDADES),
    shortName: shortenUnitName(String(u.NOME_UNIDADES)),
    departmentId: u.DEPARTAMENTO_ID_UNIDADES ? String(u.DEPARTAMENTO_ID_UNIDADES) : null
  }));

  let permittedUnits: PermittedUnit[] = [];
  if (isGlobal) {
    permittedUnits = allUnits;
  } else if (isArmeiroOrAdmin && scope === 'department' && userRow.DEPARTAMENTO_ID_USUARIOS) {
    permittedUnits = allUnits.filter(u => u.departmentId === String(userRow.DEPARTAMENTO_ID_USUARIOS));
    if (permittedUnits.length === 0 && userRow.UNIDADE_ID_USUARIOS) {
      permittedUnits = allUnits.filter(u => u.id === String(userRow.UNIDADE_ID_USUARIOS));
    }
  } else if (userRow.UNIDADE_ID_USUARIOS) {
    permittedUnits = allUnits.filter(u => u.id === String(userRow.UNIDADE_ID_USUARIOS));
  }

  return {
    id: String(userRow.ID_USUARIOS),
    name: String(userRow.NOME_USUARIOS || ''),
    masp: String(userRow.MASP_USUARIOS || ''),
    cargo: String(userRow.CARGO_USUARIOS || ''),
    phone: normalizePhoneDigits(userRow.TELEFONE_USUARIOS || fromPhone),
    role: String(userRow.PERFIL_USUARIOS || 'Policial'),
    roles: Array.from(new Set(roles)),
    departmentId: userRow.DEPARTAMENTO_ID_USUARIOS ? String(userRow.DEPARTAMENTO_ID_USUARIOS) : null,
    unitId: userRow.UNIDADE_ID_USUARIOS ? String(userRow.UNIDADE_ID_USUARIOS) : null,
    scope,
    isArmeiroOrAdmin,
    isGlobal,
    permittedUnits
  };
}

function parseMonthOrYear(granularity: 'MES' | 'ANO', raw: string): { iso: string; display: string } | null {
  const clean = String(raw || '').trim();
  if (granularity === 'MES') {
    let m = clean.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const mm = m[1].padStart(2, '0');
      const yyyy = m[2];
      if (Number(mm) >= 1 && Number(mm) <= 12) return { iso: `${yyyy}-${mm}`, display: `${mm}/${yyyy}` };
    }
    m = clean.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = m[2].padStart(2, '0');
      if (Number(mm) >= 1 && Number(mm) <= 12) return { iso: `${yyyy}-${mm}`, display: `${mm}/${yyyy}` };
    }
    return null;
  }

  const m = clean.match(/^(\d{4})$/);
  if (m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100) {
    return { iso: m[1], display: m[1] };
  }
  return null;
}

async function getSession(pool: any, phone: string): Promise<{ etapa: string; contexto: any }> {
  try {
    const [rows]: any = await pool.query(
      'SELECT ETAPA_ATUAL, CONTEXTO_JSON FROM WHATSAPP_CONVERSAS_SESSAO WHERE TELEFONE_CLIENTE = ? LIMIT 1',
      [phone]
    );
    if (!rows?.[0]) return { etapa: 'INICIO', contexto: {} };
    let contexto: any = {};
    try {
      contexto = rows[0].CONTEXTO_JSON ? JSON.parse(rows[0].CONTEXTO_JSON) : {};
    } catch {
      contexto = {};
    }
    return { etapa: String(rows[0].ETAPA_ATUAL || 'INICIO'), contexto };
  } catch {
    return { etapa: 'INICIO', contexto: {} };
  }
}

async function saveSession(pool: any, phone: string, etapa: string, contexto: any = {}): Promise<void> {
  await pool.query(
    `INSERT INTO WHATSAPP_CONVERSAS_SESSAO (TELEFONE_CLIENTE, ETAPA_ATUAL, CONTEXTO_JSON, ULTIMA_INTERACAO_EM, DATA_CRIACAO)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       ETAPA_ATUAL = VALUES(ETAPA_ATUAL),
       CONTEXTO_JSON = VALUES(CONTEXTO_JSON),
       ULTIMA_INTERACAO_EM = NOW()`,
    [phone, etapa, JSON.stringify(contexto || {})]
  );
}

function getSessionKey(phone: string): string {
  const raw = String(phone || '').trim();
  if (raw.startsWith('sim')) return raw.slice(0, 32);
  return (stripBrazilPhone(raw) || normalizePhoneDigits(raw) || raw).slice(0, 32);
}

export async function resetBotSession(pool: any, phone: string): Promise<void> {
  await saveSession(pool, getSessionKey(phone), 'INICIO', {});
}

export async function createTemporaryWhatsappSession(
  pool: any,
  params: {
    tipoFluxo: 'SOLICITAR_CAUTELA' | 'DEVOLVER_CAUTELA';
    userId: string;
    fromPhone: string;
  }
): Promise<{ sessionId: string; rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const sessionId = `wpp-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await pool.query(
    `INSERT INTO WHATSAPP_SESSOES_TEMPORARIAS (
      ID_SESSAO, TOKEN_HASH, TIPO_FLUXO, USUARIO_ID, TELEFONE_ORIGEM, STATUS_SESSAO, EXPIRA_EM, DATA_CRIACAO
    ) VALUES (?, ?, ?, ?, ?, 'ATIVA', DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW())`,
    [sessionId, tokenHash, params.tipoFluxo, params.userId, params.fromPhone]
  );
  return { sessionId, rawToken, expiresAt };
}

// ============================================================================
// CONSTRUTORES DE MENUS INTERATIVOS — COEapp
// ============================================================================
function buildMainMenuReply(user?: ResolvedWhatsappUser | null): BotReplyItem {
  const firstName = user?.name ? user.name.split(/\s+/)[0] : '';
  const footer = user
    ? truncateText(`Sessão ativa: ${firstName}${user.masp ? ` (MASP ${user.masp})` : ''}`, 60)
    : 'Escolha uma opção abaixo';

  return {
    kind: 'buttons',
    header: 'Bem vindo(a) ao COEapp',
    body: 'O que podemos fazer por você agora?',
    footer,
    buttons: [
      { id: 'MENU_ARMARIA', title: 'Armaria' },
      { id: 'MENU_RELATORIOS', title: 'Relatórios' },
      { id: 'MENU_DESEMPENHO', title: 'Ficha de desempenho' }
    ]
  };
}

function buildArmariaCategoriesReply(): BotReplyItem {
  return {
    kind: 'list',
    header: 'Armaria — COEapp',
    body: 'Escolha qual categoria da *Armaria* deseja consultar:',
    footer: 'Armas, Munições, Explosivos ou Materiais',
    listButtonText: 'Escolher Categoria',
    listRows: [
      { id: 'ARM_CAT::ARMAS', title: 'Armas', description: 'Minhas Cautelas, Cautelas da Unidade e Armas da Unidade' },
      { id: 'ARM_CAT::MUNICOES', title: 'Munições', description: 'Minhas Cautelas, Cautelas da Unidade e Munições da Unidade' },
      { id: 'ARM_CAT::EXPLOSIVOS', title: 'Explosivos', description: 'Minhas Cautelas, Cautelas da Unidade e Explosivos da Unidade' },
      { id: 'ARM_CAT::MATERIAIS', title: 'Materiais', description: 'Minhas Cautelas, Cautelas da Unidade e Materiais da Unidade' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal do COEapp' }
    ]
  };
}

function buildArmariaCategoryActionsReply(categoria: ArmariaCategoria): BotReplyItem {
  const meta = ARMARIA_CATEGORIA_META[categoria];
  return {
    kind: 'buttons',
    header: `Armaria — ${meta.label}`,
    body:
      `Selecione o que deseja consultar em *${meta.label}*:\n\n` +
      `• *Minhas Cautelas* — suas cautelas ativas (ou históricas por período)\n` +
      `• *Cautelas da Unidade* — cautelas da(s) unidade(s) por mês/ano ou ano\n` +
      `• *${meta.label} da Unidade* — inventário dos cofres por unidade ou geral`,
    footer: 'Os documentos são enviados em PDF',
    buttons: [
      { id: `ARM_ACT::${categoria}::MINHAS`, title: 'Minhas Cautelas' },
      { id: `ARM_ACT::${categoria}::UNIDADE`, title: 'Cautelas da Unidade' },
      { id: `ARM_ACT::${categoria}::COFRES`, title: truncateText(meta.unitButtonLabel, 20) }
    ]
  };
}

function buildRelatoriosMenuReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Relatórios — COEapp',
    body: 'Qual tipo de relatório deseja gerar em PDF?',
    footer: 'Operações ou Treinamento',
    buttons: [
      { id: 'REL_TIPO::OP', title: 'Operações' },
      { id: 'REL_TIPO::TR', title: 'Treinamento' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildRelatoriosPeriodosReply(modulo: 'OP' | 'TR', unitLabel: string): BotReplyItem {
  const modLabel = modulo === 'OP' ? 'Operações' : 'Treinamento';
  return {
    kind: 'list',
    header: truncateText(`${modLabel} — ${unitLabel}`, 60),
    body:
      `Unidade selecionada: *${unitLabel}*.\n` +
      `Agora escolha o período do relatório de *${modLabel}* para receber o PDF:`,
    footer: 'Selecione o período desejado',
    listButtonText: 'Escolher Período',
    listRows: [
      { id: 'REL_PER::24H', title: 'Últimas 24h', description: 'Registros das últimas 24 horas' },
      { id: 'REL_PER::SEMANA', title: 'Essa semana', description: 'De segunda-feira até hoje (limite até domingo)' },
      { id: 'REL_PER::MES_ATUAL', title: 'Mês atual', description: 'Todos os registros do mês vigente' },
      { id: 'REL_PER::ANO_ATUAL', title: 'Ano atual', description: 'Todos os registros do ano vigente' },
      { id: 'REL_PER::MES_ANO', title: 'Escolher Mês e Ano', description: 'Informar mês e ano específicos (MM/AAAA)' },
      { id: 'REL_PER::ANO', title: 'Escolher Ano', description: 'Informar apenas o ano específico (AAAA)' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal do COEapp' }
    ]
  };
}

function buildDesempenhoMenuReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Ficha de Desempenho — COEapp',
    body:
      'Escolha a ficha de desempenho que deseja receber em PDF:\n\n' +
      '• *Minha ficha* — sua ficha completa (Física e Tática)\n' +
      '• *Desempenho por unidade* — gráfico da unidade na 1ª folha + 1 ficha por folha',
    footer: 'Selecione uma das opções abaixo',
    buttons: [
      { id: 'DESEMP_MINHA', title: 'Minha ficha' },
      { id: 'DESEMP_UNIDADE', title: 'Desempenho unidade' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildDesempenhoCategoriaReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Desempenho por Unidade',
    body: 'Deseja emitir o PDF consolidado de *Desempenho Físico* ou *Desempenho Tático*?',
    footer: 'Em seguida você escolherá a unidade',
    buttons: [
      { id: 'DESEMP_CAT::FISICO', title: 'Desempenho Físico' },
      { id: 'DESEMP_CAT::TATICO', title: 'Desempenho Tático' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildEscolherUnidadeListReply(params: {
  permittedUnits: PermittedUnit[];
  header: string;
  body: string;
  actionPrefix: string;
  allOptionTitle?: string;
  allOptionDesc?: string;
  includeAllIfMultiple?: boolean;
}): BotReplyItem {
  const rows: BotListRow[] = [];
  const allowAll = (params.includeAllIfMultiple ?? true) && params.permittedUnits.length > 1;
  if (allowAll) {
    rows.push({
      id: `${params.actionPrefix}::TODAS`,
      title: truncateText(params.allOptionTitle || 'Todas as Unidades', 24),
      description: truncateText(
        params.allOptionDesc || `Incluir todas as ${params.permittedUnits.length} unidades do seu acesso`,
        72
      )
    });
  }
  params.permittedUnits.slice(0, 8).forEach(u => {
    rows.push({
      id: `${params.actionPrefix}::${u.id}`,
      title: truncateText(u.shortName, 24),
      description: truncateText(u.name, 72)
    });
  });
  rows.push({
    id: 'VOLTAR_MENU',
    title: 'Voltar ao Menu',
    description: 'Retornar ao menu principal do COEapp'
  });

  return {
    kind: 'list',
    header: truncateText(params.header, 60),
    body: params.body,
    footer: 'Exibindo apenas unidades permitidas ao seu perfil',
    listButtonText: 'Escolher Unidade',
    listRows: rows
  };
}

// ============================================================================
// ENVIO REAL PARA META CLOUD API (Buttons, List, Text, Document PDF)
// ============================================================================
async function uploadPdfToMetaMedia(
  apiVersion: string,
  phoneNumberId: string,
  accessToken: string,
  pdfBuffer: Buffer,
  filename: string
): Promise<{ mediaId?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    form.append('file', blob, filename);

    const res = await fetch(`${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json?.id) return { mediaId: String(json.id) };
    return {
      error: json?.error?.error_user_msg || json?.error?.message || `Erro HTTP ${res.status} no upload de PDF`
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro de rede ao enviar PDF' };
  }
}

export async function sendDirectWhatsappText(
  pool: any,
  cfgRow: any,
  toPhone: string,
  textBody: string,
  decryptSecret: (encoded?: string | null) => string,
  eventoSistema = 'ATENDIMENTO_BOT_INTERATIVO'
): Promise<{ sentToMeta: boolean; error?: string }> {
  const cleanTo = normalizePhoneDigits(toPhone);
  if (!cleanTo) return { sentToMeta: false, error: 'Telefone inválido' };

  const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
  const phoneNumberId = String(cfgRow?.PHONE_NUMBER_ID || '').trim();
  const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    type: 'text',
    text: { preview_url: false, body: truncateText(textBody, 4096) }
  };

  let metaMessageId: string | null = null;
  let statusEntrega = 'PENDENTE';
  let erroCodigo: string | null = null;
  let erroMensagem: string | null = null;
  let respJson: any = null;

  if (cfgRow?.ATIVO && /^\d{5,30}$/.test(phoneNumberId) && accessToken) {
    try {
      const metaRes = await fetch(`${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      respJson = await metaRes.json().catch(() => ({}));
      if (metaRes.ok && respJson?.messages?.[0]?.id) {
        metaMessageId = String(respJson.messages[0].id);
        statusEntrega = 'ENVIADA';
      } else {
        statusEntrega = 'FALHOU';
        erroCodigo = String(respJson?.error?.code || metaRes.status);
        erroMensagem = respJson?.error?.error_user_msg || respJson?.error?.message || `HTTP ${metaRes.status}`;
      }
    } catch (e: any) {
      statusEntrega = 'FALHOU';
      erroCodigo = 'NETWORK_ERROR';
      erroMensagem = e?.message || 'Erro de rede';
    }
  } else {
    statusEntrega = 'ENVIADA';
  }

  const msgId = `wpp-notify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await pool.query(
    `INSERT INTO WHATSAPP_MENSAGENS (
      ID_MENSAGEM, DIRECAO, TELEFONE_DESTINO, TELEFONE_ORIGEM,
      TIPO_MENSAGEM, EVENTO_SISTEMA, CONTEUDO_RESUMO, META_MESSAGE_ID,
      STATUS_ENTREGA, ERRO_CODIGO, ERRO_MENSAGEM, PAYLOAD_REQUISICAO_JSON,
      PAYLOAD_RESPOSTA_JSON, ENVIADO_POR_NOME, DATA_CRIACAO
    ) VALUES (?, 'SAIDA', ?, ?, 'text', ?, ?, ?, ?, ?, ?, ?, ?, 'Bot WhatsApp COEapp', NOW())`,
    [
      msgId,
      cleanTo,
      cfgRow?.NUMERO_TELEFONE_EXIBICAO || null,
      eventoSistema,
      textBody.slice(0, 600),
      metaMessageId,
      statusEntrega,
      erroCodigo,
      erroMensagem,
      JSON.stringify(payload),
      respJson ? JSON.stringify(respJson) : null
    ]
  );

  return { sentToMeta: Boolean(metaMessageId), error: erroMensagem || undefined };
}

async function dispatchBotRepliesToMeta(
  pool: any,
  cfgRow: any,
  toPhone: string,
  replies: BotReplyItem[],
  decryptSecret: (encoded?: string | null) => string
): Promise<void> {
  const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
  const phoneNumberId = String(cfgRow?.PHONE_NUMBER_ID || '').trim();
  const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);
  if (!/^\d{5,30}$/.test(phoneNumberId) || !accessToken) return;

  const endpointUrl = `${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`;

  for (const item of replies) {
    let payload: any = null;
    let tipoMsg = 'interactive';
    let resumo = item.body.slice(0, 400);

    if (item.kind === 'buttons' && item.buttons && item.buttons.length > 0) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(item.header ? { header: { type: 'text', text: truncateText(item.header, 60) } } : {}),
          body: { text: truncateText(item.body, 1024) },
          ...(item.footer ? { footer: { text: truncateText(item.footer, 60) } } : {}),
          action: {
            buttons: item.buttons.slice(0, 3).map(b => ({
              type: 'reply',
              reply: { id: b.id.slice(0, 256), title: truncateText(b.title, 20) }
            }))
          }
        }
      };
      resumo = `[Botões] ${item.header || ''} • ${item.buttons.map(b => b.title).join(' | ')}`;
    } else if (item.kind === 'list' && item.listRows && item.listRows.length > 0) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(item.header ? { header: { type: 'text', text: truncateText(item.header, 60) } } : {}),
          body: { text: truncateText(item.body, 1024) },
          ...(item.footer ? { footer: { text: truncateText(item.footer, 60) } } : {}),
          action: {
            button: truncateText(item.listButtonText || 'Selecionar', 20),
            sections: [
              {
                title: truncateText(item.header || 'Opções disponíveis', 24),
                rows: item.listRows.slice(0, 10).map(r => ({
                  id: r.id.slice(0, 200),
                  title: truncateText(r.title, 24),
                  ...(r.description ? { description: truncateText(r.description, 72) } : {})
                }))
              }
            ]
          }
        }
      };
      resumo = `[Lista] ${item.header || ''} (${item.listRows.length} opções)`;
    } else if (item.kind === 'link' && item.actionUrl) {
      tipoMsg = 'text';
      const bodyWithUrl = `${item.header ? `*${item.header}*\n\n` : ''}${item.body}\n\n${item.actionUrl}`;
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: true, body: truncateText(bodyWithUrl, 4096) }
      };
      resumo = `[Link] ${item.header || item.actionLabel || 'Link'}`;
    } else if (item.kind === 'document' && item.documentBuffer && item.documentFilename) {
      tipoMsg = 'document';
      const upload = await uploadPdfToMetaMedia(
        apiVersion,
        phoneNumberId,
        accessToken,
        item.documentBuffer,
        item.documentFilename
      );
      if (upload.mediaId) {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'document',
          document: {
            id: upload.mediaId,
            filename: item.documentFilename,
            caption: truncateText(item.documentCaption || item.body, 1024)
          }
        };
        resumo = `[PDF Enviado] ${item.documentFilename}`;
      } else {
        tipoMsg = 'text';
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: `O PDF (${item.documentFilename}) foi gerado, mas houve falha ao enviá-lo pela Meta API: ${upload.error}`
          }
        };
        resumo = `[Falha Upload PDF] ${item.documentFilename}: ${upload.error}`;
      }
    } else {
      tipoMsg = 'text';
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: truncateText(item.body, 4096) }
      };
    }

    const msgId = `wpp-bot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let metaMessageId: string | null = null;
    let statusEntrega = 'PENDENTE';
    let erroCodigo: string | null = null;
    let erroMensagem: string | null = null;
    let respJson: any = null;

    try {
      const metaRes = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      respJson = await metaRes.json().catch(() => ({}));
      if (metaRes.ok && respJson?.messages?.[0]?.id) {
        metaMessageId = String(respJson.messages[0].id);
        statusEntrega = 'ENVIADA';
      } else {
        statusEntrega = 'FALHOU';
        erroCodigo = String(respJson?.error?.code || metaRes.status);
        erroMensagem = respJson?.error?.error_user_msg || respJson?.error?.message || `Erro HTTP ${metaRes.status}`;
      }
    } catch (e: any) {
      statusEntrega = 'FALHOU';
      erroCodigo = 'NETWORK_ERROR';
      erroMensagem = e?.message || 'Erro de rede';
    }

    await pool.query(
      `INSERT INTO WHATSAPP_MENSAGENS (
        ID_MENSAGEM, DIRECAO, TELEFONE_DESTINO, TELEFONE_ORIGEM,
        TIPO_MENSAGEM, EVENTO_SISTEMA, CONTEUDO_RESUMO, META_MESSAGE_ID,
        STATUS_ENTREGA, ERRO_CODIGO, ERRO_MENSAGEM, PAYLOAD_REQUISICAO_JSON,
        PAYLOAD_RESPOSTA_JSON, ENVIADO_POR_NOME, DATA_CRIACAO
      ) VALUES (?, 'SAIDA', ?, ?, ?, 'ATENDIMENTO_BOT_INTERATIVO', ?, ?, ?, ?, ?, ?, ?, 'Bot WhatsApp COEapp', NOW())`,
      [
        msgId,
        toPhone,
        cfgRow?.NUMERO_TELEFONE_EXIBICAO || null,
        tipoMsg,
        resumo,
        metaMessageId,
        statusEntrega,
        erroCodigo,
        erroMensagem,
        JSON.stringify(payload),
        respJson ? JSON.stringify(respJson) : null
      ]
    );
  }
}

// ============================================================================
// MOTOR PRINCIPAL DA MÁQUINA DE ESTADOS — COEapp
// ============================================================================
export async function processWhatsappBotInteraction(
  pool: any,
  cfgRow: any,
  input: BotInputMessage,
  options: BotProcessOptions
): Promise<{
  etapaAtual: string;
  replies: BotReplyItem[];
  resolvedUser?: { id: string; name: string; role: string; unitsCount: number } | null;
}> {
  const rawPhoneDigits = normalizePhoneDigits(input.fromPhone);
  const sessionKeyPhone = getSessionKey(input.fromPhone);
  const actionId = String(input.buttonId || input.listRowId || '').trim();
  const rawText = String(input.text || input.buttonTitle || input.listRowTitle || '').trim();
  const normText = normalizeText(rawText);

  const resolvedUser = await resolveWhatsappUserContext(pool, input.fromPhone, options.forcedUserId);
  const session = await getSession(pool, sessionKeyPhone);
  let nextEtapa = session.etapa;
  let nextContexto: any = {
    ...(session.contexto || {}),
    ...(resolvedUser ? { userId: resolvedUser.id, userName: resolvedUser.name, userMasp: resolvedUser.masp } : {})
  };
  const replies: BotReplyItem[] = [];

  const permittedUnits = resolvedUser?.permittedUnits || [];
  const allPermittedUnitIds = permittedUnits.map(u => u.id);

  const ensureAuthenticatedUser = (requireUnits = true): boolean => {
    if (!resolvedUser) {
      replies.push({
        kind: 'text',
        header: 'Bem vindo(a) ao COEapp',
        body:
          'Seu número de WhatsApp não foi localizado em nenhum usuário ativo do COEapp.\n' +
          'Verifique com o Administrador se o seu telefone está cadastrado corretamente no seu perfil.'
      });
      nextEtapa = 'INICIO';
      return false;
    }
    if (requireUnits && permittedUnits.length === 0) {
      replies.push({
        kind: 'buttons',
        header: 'Sem Unidade Vinculada',
        body: `Olá, ${resolvedUser.name}. Seu perfil não possui unidade vinculada para esta consulta.`,
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return false;
    }
    return true;
  };

  const resolveSelectedUnitScope = (choice: string): { unitIds: string[]; unitLabel: string } | null => {
    if (choice === 'TODAS') {
      if (permittedUnits.length === 0) return null;
      return {
        unitIds: allPermittedUnitIds,
        unitLabel: permittedUnits.length > 1 ? 'Todas as Unidades' : permittedUnits[0].shortName
      };
    }
    const found = permittedUnits.find(u => u.id === choice);
    if (!found) return null;
    return { unitIds: [found.id], unitLabel: found.shortName };
  };

  const isGreetingOrMenuReset =
    actionId === 'VOLTAR_MENU' ||
    ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'inicio', 'comecar', 'ajuda', '0'].includes(normText);

  // --- Helpers internos de emissão de PDFs ---
  const showArmariaPeriodPicker = async (params: {
    mode: 'MINHAS_ANTIGAS' | 'UNIDADE_CAUTELAS';
    categoria: ArmariaCategoria;
    granularity: 'MES' | 'ANO';
  }) => {
    const meta = ARMARIA_CATEGORIA_META[params.categoria];
    const available = await listAvailableCautelaPeriods(pool, params.categoria, {
      targetUser: params.mode === 'MINHAS_ANTIGAS' && resolvedUser ? resolvedUser : undefined,
      unitIds: params.mode === 'UNIDADE_CAUTELAS' ? allPermittedUnitIds : undefined,
      granularity: params.granularity
    });
    const formato = params.granularity === 'MES' ? 'MM/AAAA (ex: 11/2026)' : 'AAAA (ex: 2026)';
    const granLabel = params.granularity === 'MES' ? 'Mês e Ano' : 'Ano';

    nextEtapa = 'ARM_AGUARDANDO_PERIODO';
    nextContexto = {
      ...nextContexto,
      armPeriodMode: params.mode,
      armCategoria: params.categoria,
      armGranularity: params.granularity
    };

    if (available.length > 0) {
      const rows: BotListRow[] = available.map(opt => ({
        id: `ARM_PER_VAL::${params.mode}::${params.categoria}::${params.granularity}::${opt.value}`,
        title: truncateText(opt.label, 24),
        description: `${opt.count} registro(s) de ${meta.label.toLowerCase()} encontrado(s)`
      }));
      rows.push({ id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' });
      replies.push({
        kind: 'list',
        header: `${meta.label} — ${granLabel}`,
        body: `Selecione um período disponível abaixo ou digite no formato *${formato}*:`,
        footer: 'Selecione da lista ou digite o período',
        listButtonText: `Escolher ${granLabel}`,
        listRows: rows
      });
      return;
    }

    replies.push({
      kind: 'buttons',
      header: `${meta.label} — ${granLabel}`,
      body: `Digite o período desejado no formato *${formato}* para consultar *${meta.label}*:`,
      footer: 'Ou clique abaixo para voltar',
      buttons: [
        { id: `ARM_CAT::${params.categoria}`, title: 'Voltar Categoria' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
  };

  const emitMyCautelasPdf = async (
    categoria: ArmariaCategoria,
    opts: { onlyActive: boolean; granularity?: 'MES' | 'ANO'; isoFilter?: string; displayFilter?: string }
  ) => {
    if (!resolvedUser) return;
    const meta = ARMARIA_CATEGORIA_META[categoria];
    const items = await findUserCautelasByCategory(pool, categoria, resolvedUser, {
      onlyActive: opts.onlyActive,
      granularity: opts.granularity,
      isoFilter: opts.isoFilter
    });

    if (opts.onlyActive && items.length === 0) {
      nextEtapa = 'ARM_CONFIRM_ANTIGAS';
      nextContexto = { ...nextContexto, armCategoria: categoria };
      replies.push({
        kind: 'buttons',
        header: `Minhas Cautelas — ${meta.label}`,
        body: 'Você não tem cautela ativa no sistema, deseja ver cautelas antigas?',
        footer: 'Escolha Sim para consultar por mês/ano ou ano',
        buttons: [
          { id: `ARM_OLD_SIM::${categoria}`, title: 'Sim' },
          { id: 'VOLTAR_MENU', title: 'Não' }
        ]
      });
      return;
    }

    if (items.length === 0) {
      replies.push({
        kind: 'buttons',
        header: `Minhas Cautelas — ${meta.label}`,
        body: `Nenhuma cautela de *${meta.label}* foi encontrada para você no período *${opts.displayFilter || 'informado'}*.`,
        buttons: [
          { id: `ARM_OLD_SIM::${categoria}`, title: 'Outro Período' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }

    const periodText = opts.onlyActive ? 'Cautelas Ativas' : `Período ${opts.displayFilter || opts.isoFilter || ''}`;
    const { buffer, filename } = await generateCategoryCautelasPdf(
      categoria,
      items,
      `MINHAS CAUTELAS DE ${meta.label.toUpperCase()} — ${opts.onlyActive ? 'ATIVAS' : 'HISTORICO'}`,
      `${resolvedUser.name} (MASP ${resolvedUser.masp || '—'}) • ${periodText} • ${items.length} registro(s)`,
      `Minhas_${opts.onlyActive ? 'Ativas' : opts.isoFilter || 'Hist'}`
    );

    const token = createSignedPdfToken(
      {
        scope: 'arm_my_cautelas',
        categoria,
        onlyActive: opts.onlyActive,
        granularity: opts.granularity,
        isoFilter: opts.isoFilter,
        userId: resolvedUser.id,
        userName: resolvedUser.name,
        userMasp: resolvedUser.masp
      },
      options.signingKey
    );

    const caption = `Minhas Cautelas (${meta.label}) • ${periodText} • ${items.length} registro(s)`;
    replies.push({
      kind: 'document',
      header: `PDF — Minhas Cautelas (${meta.label})`,
      body: caption,
      documentFilename: filename,
      documentCaption: caption,
      documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
      documentBuffer: buffer
    });
    replies.push({
      kind: 'buttons',
      body: 'PDF enviado! Deseja fazer outra consulta?',
      buttons: [
        { id: `ARM_CAT::${categoria}`, title: meta.label },
        { id: 'MENU_ARMARIA', title: 'Armaria' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'MENU_PRINCIPAL';
  };

  const emitUnitCautelasPdf = async (
    categoria: ArmariaCategoria,
    granularity: 'MES' | 'ANO',
    isoFilter: string,
    displayFilter: string,
    unitChoice: string
  ) => {
    const scope = resolveSelectedUnitScope(unitChoice);
    if (!scope) {
      replies.push({
        kind: 'buttons',
        header: 'Unidade não autorizada',
        body: 'Você não possui permissão para consultar esta unidade.',
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }
    const meta = ARMARIA_CATEGORIA_META[categoria];
    const items = await findUnitCautelasByCategoryAndPeriod(pool, categoria, granularity, isoFilter, scope.unitIds);
    if (items.length === 0) {
      replies.push({
        kind: 'buttons',
        header: `Cautelas de ${meta.label}`,
        body: `Nenhuma cautela de *${meta.label}* foi encontrada para *${scope.unitLabel}* no período *${displayFilter}*.`,
        buttons: [
          { id: `ARM_ACT::${categoria}::UNIDADE`, title: 'Outro Período' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }

    const { buffer, filename } = await generateCategoryCautelasPdf(
      categoria,
      items,
      `CAUTELAS DE ${meta.label.toUpperCase()} — ${scope.unitLabel.toUpperCase()}`,
      `Período: ${displayFilter} • ${items.length} registro(s)`,
      `Unidade_${scope.unitLabel}_${isoFilter}`
    );
    const token = createSignedPdfToken(
      {
        scope: 'arm_unit_cautelas',
        categoria,
        granularity,
        isoFilter,
        unitIds: scope.unitIds,
        unitLabel: scope.unitLabel
      },
      options.signingKey
    );
    const caption = `Cautelas de ${meta.label} • ${scope.unitLabel} • Período: ${displayFilter} • ${items.length} registro(s)`;
    replies.push({
      kind: 'document',
      header: `PDF — Cautelas de ${meta.label}`,
      body: caption,
      documentFilename: filename,
      documentCaption: caption,
      documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
      documentBuffer: buffer
    });
    replies.push({
      kind: 'buttons',
      body: 'PDF enviado! O que deseja fazer agora?',
      buttons: [
        { id: `ARM_CAT::${categoria}`, title: meta.label },
        { id: 'MENU_ARMARIA', title: 'Armaria' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'MENU_PRINCIPAL';
  };

  const emitUnitVaultsPdf = async (categoria: ArmariaCategoria, unitChoice: string) => {
    const scope = resolveSelectedUnitScope(unitChoice);
    if (!scope) {
      replies.push({
        kind: 'buttons',
        header: 'Unidade não autorizada',
        body: 'Você não possui permissão para consultar esta unidade.',
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }
    const meta = ARMARIA_CATEGORIA_META[categoria];
    const { groups, totalRecords } = await findVaultInventoryByCategory(pool, categoria, scope.unitIds);
    if (totalRecords === 0) {
      replies.push({
        kind: 'buttons',
        header: `${meta.label} da Unidade`,
        body: `Nenhum registro de *${meta.label}* encontrado nos cofres de *${scope.unitLabel}*.`,
        buttons: [
          { id: `ARM_CAT::${categoria}`, title: meta.label },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }

    const { buffer, filename } = await generateUnitVaultInventoryPdf(
      categoria,
      groups,
      totalRecords,
      scope.unitLabel,
      scope.unitLabel
    );
    const token = createSignedPdfToken(
      {
        scope: 'arm_unit_vaults',
        categoria,
        unitIds: scope.unitIds,
        unitLabel: scope.unitLabel
      },
      options.signingKey
    );
    const caption = `Inventário de ${meta.label} por Cofres • ${scope.unitLabel} • ${totalRecords} registro(s)`;
    replies.push({
      kind: 'document',
      header: `PDF — ${meta.label} por Cofres`,
      body: caption,
      documentFilename: filename,
      documentCaption: caption,
      documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
      documentBuffer: buffer
    });
    replies.push({
      kind: 'buttons',
      body: 'Inventário dos cofres enviado em PDF! Deseja outra consulta?',
      buttons: [
        { id: `ARM_CAT::${categoria}`, title: meta.label },
        { id: 'MENU_ARMARIA', title: 'Armaria' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'MENU_PRINCIPAL';
  };

  const emitRelatorioPeriodPdf = async (
    modulo: 'OP' | 'TR',
    periodo: RelatorioPeriodoTipo,
    unitIds: string[],
    unitLabel: string,
    isoFilter?: string
  ) => {
    const safeUnitIds = unitIds.filter(id => allPermittedUnitIds.includes(id));
    if (safeUnitIds.length === 0) {
      replies.push({
        kind: 'buttons',
        header: 'Unidade não autorizada',
        body: 'Você não possui permissão para consultar esta unidade.',
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }

    const modLabel = modulo === 'OP' ? 'Operações' : 'Treinamento';
    if (modulo === 'OP') {
      const { reports, periodLabel, periodSlug } = await findOperationReportsByPeriod(
        pool,
        periodo,
        safeUnitIds,
        isoFilter
      );
      if (reports.length === 0) {
        replies.push({
          kind: 'buttons',
          header: `Relatório de ${modLabel}`,
          body: `Nenhum relatório de *${modLabel}* encontrado para *${unitLabel}* no período *${periodLabel}*.`,
          buttons: [
            { id: 'REL_TIPO::OP', title: 'Outro Período' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
        nextEtapa = 'MENU_PRINCIPAL';
        return;
      }

      const { buffer, filename } = await generateMultipleOperationsPdf(
        reports,
        `RELATORIO DE OPERACOES — ${periodLabel.toUpperCase()} (${unitLabel})`,
        `${unitLabel}_${periodSlug}`
      );
      const token = createSignedPdfToken(
        {
          scope: 'op_rel_period',
          relPeriodo: periodo,
          isoFilter,
          unitIds: safeUnitIds,
          unitLabel
        },
        options.signingKey
      );
      const caption = `Relatório de Operações • ${unitLabel} • ${periodLabel} • ${reports.length} registro(s)`;
      replies.push({
        kind: 'document',
        header: `PDF — Relatório de Operações`,
        body: caption,
        documentFilename: filename,
        documentCaption: caption,
        documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
        documentBuffer: buffer
      });
    } else {
      const { reports, periodLabel, periodSlug } = await findTrainingReportsByPeriod(
        pool,
        periodo,
        safeUnitIds,
        isoFilter
      );
      if (reports.length === 0) {
        replies.push({
          kind: 'buttons',
          header: `Relatório de ${modLabel}`,
          body: `Nenhum relatório de *${modLabel}* encontrado para *${unitLabel}* no período *${periodLabel}*.`,
          buttons: [
            { id: 'REL_TIPO::TR', title: 'Outro Período' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
        nextEtapa = 'MENU_PRINCIPAL';
        return;
      }

      const { buffer, filename } = await generateMultipleTrainingsPdf(
        reports,
        `RELATORIO DE TREINAMENTO — ${periodLabel.toUpperCase()} (${unitLabel})`,
        `${unitLabel}_${periodSlug}`
      );
      const token = createSignedPdfToken(
        {
          scope: 'tr_rel_period',
          relPeriodo: periodo,
          isoFilter,
          unitIds: safeUnitIds,
          unitLabel
        },
        options.signingKey
      );
      const caption = `Relatório de Treinamento • ${unitLabel} • ${periodLabel} • ${reports.length} registro(s)`;
      replies.push({
        kind: 'document',
        header: `PDF — Relatório de Treinamento`,
        body: caption,
        documentFilename: filename,
        documentCaption: caption,
        documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
        documentBuffer: buffer
      });
    }

    replies.push({
      kind: 'buttons',
      body: 'Relatório enviado em PDF! Deseja outra consulta?',
      buttons: [
        { id: 'MENU_RELATORIOS', title: 'Outros Relatórios' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'MENU_PRINCIPAL';
  };

  // ==========================================================================
  // ROTEAMENTO DA MÁQUINA DE ESTADOS
  // ==========================================================================
  if (isGreetingOrMenuReset) {
    if (!resolvedUser) {
      ensureAuthenticatedUser(false);
    } else {
      nextEtapa = 'MENU_PRINCIPAL';
      nextContexto = { userId: resolvedUser.id, userName: resolvedUser.name, userMasp: resolvedUser.masp };
      replies.push(buildMainMenuReply(resolvedUser));
    }
  }
  // --------------------------------------------------------------------------
  // RAMO 1: ARMARIA
  // --------------------------------------------------------------------------
  else if (actionId === 'MENU_ARMARIA' || (session.etapa === 'MENU_PRINCIPAL' && normText === 'armaria')) {
    if (ensureAuthenticatedUser(false)) {
      nextEtapa = 'ARMARIA_CATEGORIAS';
      replies.push(buildArmariaCategoriesReply());
    }
  } else if (actionId.startsWith('ARM_CAT::')) {
    if (ensureAuthenticatedUser(false)) {
      const catRaw = actionId.split('::')[1];
      if (isArmariaCategoria(catRaw)) {
        nextEtapa = 'ARMARIA_ACOES';
        nextContexto = { ...nextContexto, armCategoria: catRaw };
        replies.push(buildArmariaCategoryActionsReply(catRaw));
      } else {
        replies.push(buildArmariaCategoriesReply());
      }
    }
  } else if (actionId.startsWith('ARM_ACT::')) {
    const [, catRaw, actRaw] = actionId.split('::');
    if (isArmariaCategoria(catRaw)) {
      const meta = ARMARIA_CATEGORIA_META[catRaw];
      if (actRaw === 'MINHAS') {
        if (ensureAuthenticatedUser(false)) {
          await emitMyCautelasPdf(catRaw, { onlyActive: true });
        }
      } else if (actRaw === 'UNIDADE') {
        if (ensureAuthenticatedUser(true)) {
          nextEtapa = 'ARM_UNIDADE_TIPO_PERIODO';
          nextContexto = { ...nextContexto, armCategoria: catRaw };
          replies.push({
            kind: 'buttons',
            header: `Cautelas da Unidade — ${meta.label}`,
            body: `Como deseja filtrar o período das cautelas de *${meta.label}* da unidade?`,
            footer: 'Em seguida você escolherá a unidade permitida',
            buttons: [
              { id: `ARM_UNIT_GRAN::${catRaw}::MES`, title: 'Mês e Ano' },
              { id: `ARM_UNIT_GRAN::${catRaw}::ANO`, title: 'Somente Ano' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
        }
      } else if (actRaw === 'COFRES') {
        if (ensureAuthenticatedUser(true)) {
          nextEtapa = 'ARM_COFRES_ESCOLHER_UNIDADE';
          nextContexto = { ...nextContexto, armCategoria: catRaw };
          replies.push(
            buildEscolherUnidadeListReply({
              permittedUnits,
              header: `${meta.label} da Unidade (Cofres)`,
              body: `Escolha a unidade para receber o PDF dos cofres de *${meta.label}*${
                permittedUnits.length > 1 ? ' ou selecione *Geral (Todas)* para incluir todas as unidades do seu perfil' : ''
              }:`,
              actionPrefix: `ARM_COFRE_UNIT::${catRaw}`,
              allOptionTitle: 'Geral (Todas)',
              allOptionDesc: `Cofres de ${meta.label.toLowerCase()} de todas as ${permittedUnits.length} unidades`
            })
          );
        }
      }
    }
  } else if (actionId.startsWith('ARM_OLD_SIM::')) {
    if (ensureAuthenticatedUser(false)) {
      const catRaw = actionId.split('::')[1];
      const cat: ArmariaCategoria = isArmariaCategoria(catRaw) ? catRaw : 'ARMAS';
      const meta = ARMARIA_CATEGORIA_META[cat];
      nextEtapa = 'ARM_OLD_TIPO_PERIODO';
      nextContexto = { ...nextContexto, armCategoria: cat };
      replies.push({
        kind: 'buttons',
        header: `Cautelas Antigas — ${meta.label}`,
        body: `Escolha se deseja consultar suas cautelas antigas de *${meta.label}* por *Mês e Ano* ou *Apenas Ano*:`,
        footer: 'Selecione o filtro desejado',
        buttons: [
          { id: `ARM_OLD_GRAN::${cat}::MES`, title: 'Mês e Ano' },
          { id: `ARM_OLD_GRAN::${cat}::ANO`, title: 'Apenas Ano' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
    }
  } else if (actionId.startsWith('ARM_OLD_GRAN::')) {
    if (ensureAuthenticatedUser(false)) {
      const [, catRaw, granRaw] = actionId.split('::');
      const cat: ArmariaCategoria = isArmariaCategoria(catRaw) ? catRaw : 'ARMAS';
      const gran: 'MES' | 'ANO' = granRaw === 'ANO' ? 'ANO' : 'MES';
      await showArmariaPeriodPicker({ mode: 'MINHAS_ANTIGAS', categoria: cat, granularity: gran });
    }
  } else if (actionId.startsWith('ARM_UNIT_GRAN::')) {
    if (ensureAuthenticatedUser(true)) {
      const [, catRaw, granRaw] = actionId.split('::');
      const cat: ArmariaCategoria = isArmariaCategoria(catRaw) ? catRaw : 'ARMAS';
      const gran: 'MES' | 'ANO' = granRaw === 'ANO' ? 'ANO' : 'MES';
      await showArmariaPeriodPicker({ mode: 'UNIDADE_CAUTELAS', categoria: cat, granularity: gran });
    }
  } else if (actionId.startsWith('ARM_PER_VAL::')) {
    const [, modeRaw, catRaw, granRaw, isoValue] = actionId.split('::');
    const cat: ArmariaCategoria = isArmariaCategoria(catRaw) ? catRaw : 'ARMAS';
    const gran: 'MES' | 'ANO' = granRaw === 'ANO' ? 'ANO' : 'MES';
    const parsed = parseMonthOrYear(gran, isoValue || '');
    if (!parsed) {
      replies.push(buildMainMenuReply(resolvedUser));
      nextEtapa = 'MENU_PRINCIPAL';
    } else if (modeRaw === 'MINHAS_ANTIGAS') {
      if (ensureAuthenticatedUser(false)) {
        await emitMyCautelasPdf(cat, {
          onlyActive: false,
          granularity: gran,
          isoFilter: parsed.iso,
          displayFilter: parsed.display
        });
      }
    } else if (ensureAuthenticatedUser(true)) {
      const meta = ARMARIA_CATEGORIA_META[cat];
      nextEtapa = 'ARM_UNIDADE_CAUTELA_ESCOLHER_UNIT';
      nextContexto = {
        ...nextContexto,
        armCategoria: cat,
        armGranularity: gran,
        armIsoFilter: parsed.iso,
        armDisplayFilter: parsed.display
      };
      replies.push(
        buildEscolherUnidadeListReply({
          permittedUnits,
          header: `Cautelas ${meta.label} (${parsed.display})`,
          body: `Período selecionado: *${parsed.display}*.\nEscolha qual unidade deseja consultar para receber o PDF:`,
          actionPrefix: 'ARM_CAUT_UNIT'
        })
      );
    }
  } else if (actionId.startsWith('ARM_CAUT_UNIT::')) {
    if (ensureAuthenticatedUser(true)) {
      const unitChoice = actionId.split('::')[1] || 'TODAS';
      const cat: ArmariaCategoria = isArmariaCategoria(nextContexto.armCategoria) ? nextContexto.armCategoria : 'ARMAS';
      const gran: 'MES' | 'ANO' = nextContexto.armGranularity === 'ANO' ? 'ANO' : 'MES';
      const isoFilter = String(nextContexto.armIsoFilter || '');
      const displayFilter = String(nextContexto.armDisplayFilter || isoFilter);
      await emitUnitCautelasPdf(cat, gran, isoFilter, displayFilter, unitChoice);
    }
  } else if (actionId.startsWith('ARM_COFRE_UNIT::')) {
    if (ensureAuthenticatedUser(true)) {
      const [, catRaw, unitChoice] = actionId.split('::');
      const cat: ArmariaCategoria = isArmariaCategoria(catRaw) ? catRaw : 'ARMAS';
      await emitUnitVaultsPdf(cat, unitChoice || 'TODAS');
    }
  }
  // --------------------------------------------------------------------------
  // RAMO 2: RELATÓRIOS (OPERAÇÕES & TREINAMENTO)
  // --------------------------------------------------------------------------
  else if (
    actionId === 'MENU_RELATORIOS' ||
    (session.etapa === 'MENU_PRINCIPAL' && (normText === 'relatorios' || normText === 'relatorio'))
  ) {
    if (ensureAuthenticatedUser(true)) {
      nextEtapa = 'RELATORIOS_TIPO';
      replies.push(buildRelatoriosMenuReply());
    }
  } else if (actionId.startsWith('REL_TIPO::')) {
    if (ensureAuthenticatedUser(true)) {
      const modulo: 'OP' | 'TR' = actionId.split('::')[1] === 'TR' ? 'TR' : 'OP';
      const modLabel = modulo === 'OP' ? 'Operações' : 'Treinamento';
      nextEtapa = 'RELATORIOS_ESCOLHER_UNIDADE';
      nextContexto = { ...nextContexto, relModulo: modulo };
      replies.push(
        buildEscolherUnidadeListReply({
          permittedUnits,
          header: `Relatório de ${modLabel}`,
          body: `Escolha a unidade para emitir o relatório de *${modLabel}*${
            permittedUnits.length > 1 ? ' (ou selecione *Todas as Unidades*)' : ''
          }:`,
          actionPrefix: `REL_UNIT::${modulo}`
        })
      );
    }
  } else if (actionId.startsWith('REL_UNIT::')) {
    if (ensureAuthenticatedUser(true)) {
      const [, modRaw, unitChoice] = actionId.split('::');
      const modulo: 'OP' | 'TR' = modRaw === 'TR' ? 'TR' : 'OP';
      const scope = resolveSelectedUnitScope(unitChoice || 'TODAS');
      if (!scope) {
        replies.push({
          kind: 'buttons',
          header: 'Unidade não autorizada',
          body: 'Você não possui permissão para acessar esta unidade.',
          buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
        });
        nextEtapa = 'MENU_PRINCIPAL';
      } else {
        nextEtapa = 'RELATORIOS_ESCOLHER_PERIODO';
        nextContexto = {
          ...nextContexto,
          relModulo: modulo,
          relUnitIds: scope.unitIds,
          relUnitLabel: scope.unitLabel
        };
        replies.push(buildRelatoriosPeriodosReply(modulo, scope.unitLabel));
      }
    }
  } else if (actionId.startsWith('REL_PER::')) {
    if (ensureAuthenticatedUser(true)) {
      const perRaw = actionId.split('::')[1] as RelatorioPeriodoTipo;
      const modulo: 'OP' | 'TR' = nextContexto.relModulo === 'TR' ? 'TR' : 'OP';
      const unitIds: string[] = Array.isArray(nextContexto.relUnitIds) ? nextContexto.relUnitIds : allPermittedUnitIds;
      const unitLabel = String(nextContexto.relUnitLabel || 'Unidade');

      if (perRaw === '24H' || perRaw === 'SEMANA' || perRaw === 'MES_ATUAL' || perRaw === 'ANO_ATUAL') {
        await emitRelatorioPeriodPdf(modulo, perRaw, unitIds, unitLabel);
      } else if (perRaw === 'MES_ANO' || perRaw === 'ANO') {
        const gran: 'MES' | 'ANO' = perRaw === 'ANO' ? 'ANO' : 'MES';
        const available =
          modulo === 'OP'
            ? await listAvailableOperationDates(pool, gran, unitIds)
            : await listAvailableTrainingDates(pool, gran, unitIds);
        const modLabel = modulo === 'OP' ? 'Operações' : 'Treinamento';
        const fmt = gran === 'MES' ? 'MM/AAAA (ex: 11/2026)' : 'AAAA (ex: 2026)';
        const granLabel = gran === 'MES' ? 'Mês e Ano' : 'Ano';

        nextEtapa = 'REL_AGUARDANDO_PERIODO';
        nextContexto = {
          ...nextContexto,
          relModulo: modulo,
          relUnitIds: unitIds,
          relUnitLabel: unitLabel,
          relCustomGran: gran
        };

        if (available.length > 0) {
          const rows: BotListRow[] = available.map(opt => ({
            id: `REL_CUSTOM_VAL::${gran}::${opt.value}`,
            title: truncateText(opt.label, 24),
            description: `${opt.count} relatório(s) de ${modLabel.toLowerCase()} em ${unitLabel}`
          }));
          rows.push({ id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' });
          replies.push({
            kind: 'list',
            header: `${modLabel} — ${granLabel}`,
            body: `Selecione um período abaixo ou digite diretamente no formato *${fmt}*:`,
            footer: `Unidade: ${unitLabel}`,
            listButtonText: `Escolher ${granLabel}`,
            listRows: rows
          });
        } else {
          replies.push({
            kind: 'buttons',
            header: `${modLabel} — ${granLabel}`,
            body: `Digite o período desejado no formato *${fmt}* para gerar o PDF de *${modLabel}* (*${unitLabel}*):`,
            buttons: [
              { id: 'MENU_RELATORIOS', title: 'Voltar Relatórios' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
        }
      }
    }
  } else if (actionId.startsWith('REL_CUSTOM_VAL::')) {
    if (ensureAuthenticatedUser(true)) {
      const [, granRaw, isoVal] = actionId.split('::');
      const gran: 'MES' | 'ANO' = granRaw === 'ANO' ? 'ANO' : 'MES';
      const modulo: 'OP' | 'TR' = nextContexto.relModulo === 'TR' ? 'TR' : 'OP';
      const unitIds: string[] = Array.isArray(nextContexto.relUnitIds) ? nextContexto.relUnitIds : allPermittedUnitIds;
      const unitLabel = String(nextContexto.relUnitLabel || 'Unidade');
      await emitRelatorioPeriodPdf(modulo, gran === 'MES' ? 'MES_ANO' : 'ANO', unitIds, unitLabel, isoVal);
    }
  }
  // --------------------------------------------------------------------------
  // RAMO 3: FICHA DE DESEMPENHO
  // --------------------------------------------------------------------------
  else if (
    actionId === 'MENU_DESEMPENHO' ||
    (session.etapa === 'MENU_PRINCIPAL' && (normText.includes('ficha') || normText.includes('desempenho')))
  ) {
    if (ensureAuthenticatedUser(false)) {
      nextEtapa = 'DESEMPENHO_MENU';
      replies.push(buildDesempenhoMenuReply());
    }
  } else if (actionId === 'DESEMP_MINHA') {
    if (ensureAuthenticatedUser(false) && resolvedUser) {
      const pdf = await generateMyPerformanceSheetPdf(pool, resolvedUser.id);
      if (!pdf) {
        replies.push({
          kind: 'buttons',
          header: 'Minha Ficha de Desempenho',
          body: 'Não foi possível localizar seus dados de desempenho no sistema.',
          buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
        });
      } else {
        const token = createSignedPdfToken({ scope: 'desemp_my', userId: resolvedUser.id }, options.signingKey);
        const caption = `Ficha Individual de Desempenho (Físico e Tático) • ${resolvedUser.name} • ${pdf.totalResults} avaliação(ões)`;
        replies.push({
          kind: 'document',
          header: 'PDF — Minha Ficha de Desempenho',
          body: caption,
          documentFilename: pdf.filename,
          documentCaption: caption,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: pdf.buffer
        });
        replies.push({
          kind: 'buttons',
          body: 'Sua ficha completa (Física e Tática) foi enviada em PDF! Deseja outra consulta?',
          buttons: [
            { id: 'MENU_DESEMPENHO', title: 'Ficha Desempenho' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      }
      nextEtapa = 'MENU_PRINCIPAL';
    }
  } else if (actionId === 'DESEMP_UNIDADE') {
    if (ensureAuthenticatedUser(true) && resolvedUser) {
      if (!resolvedUser.isArmeiroOrAdmin) {
        replies.push({
          kind: 'buttons',
          header: 'Acesso Restrito',
          body:
            'A consulta de *Desempenho por Unidade* é restrita a perfis com privilégio de gestão (Administrador ou Armeiro).\n' +
            'Você pode baixar a qualquer momento a sua própria ficha clicando em *Minha ficha*.',
          buttons: [
            { id: 'DESEMP_MINHA', title: 'Minha ficha' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
        nextEtapa = 'DESEMPENHO_MENU';
      } else {
        nextEtapa = 'DESEMPENHO_UNIDADE_CATEGORIA';
        replies.push(buildDesempenhoCategoriaReply());
      }
    }
  } else if (actionId.startsWith('DESEMP_CAT::')) {
    if (ensureAuthenticatedUser(true) && resolvedUser) {
      if (!resolvedUser.isArmeiroOrAdmin) {
        replies.push(buildDesempenhoMenuReply());
        nextEtapa = 'DESEMPENHO_MENU';
      } else {
        const cat: DesempenhoCategoria = actionId.split('::')[1] === 'TATICO' ? 'TATICO' : 'FISICO';
        const catLabel = cat === 'FISICO' ? 'Físico' : 'Tático';
        nextEtapa = 'DESEMPENHO_UNIDADE_ESCOLHER_UNIT';
        nextContexto = { ...nextContexto, desempCategoria: cat };
        replies.push(
          buildEscolherUnidadeListReply({
            permittedUnits,
            header: `Desempenho ${catLabel} — Unidade`,
            body:
              `Escolha a unidade para gerar o PDF de *Desempenho ${catLabel}*.\n` +
              `A 1ª folha trará o *Gráfico da Unidade* (média dos usuários) seguida de *1 ficha por folha*:`,
            actionPrefix: `DESEMP_UNIT::${cat}`
          })
        );
      }
    }
  } else if (actionId.startsWith('DESEMP_UNIT::')) {
    if (ensureAuthenticatedUser(true) && resolvedUser && resolvedUser.isArmeiroOrAdmin) {
      const [, catRaw, unitChoice] = actionId.split('::');
      const cat: DesempenhoCategoria = catRaw === 'TATICO' ? 'TATICO' : 'FISICO';
      const catLabel = cat === 'FISICO' ? 'Físico' : 'Tático';
      const scope = resolveSelectedUnitScope(unitChoice || 'TODAS');
      if (!scope) {
        replies.push({
          kind: 'buttons',
          header: 'Unidade não autorizada',
          body: 'Você não possui permissão para consultar esta unidade.',
          buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
        });
        nextEtapa = 'MENU_PRINCIPAL';
      } else {
        const pdf = await generateUnitPerformanceReportPdf(pool, cat, scope.unitIds, scope.unitLabel);
        if (!pdf) {
          replies.push({
            kind: 'buttons',
            header: `Desempenho ${catLabel} — ${scope.unitLabel}`,
            body: `Nenhum índice de *Desempenho ${catLabel}* foi lançado ainda para *${scope.unitLabel}*.`,
            buttons: [
              { id: 'DESEMP_UNIDADE', title: 'Outra Categoria' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
        } else {
          const token = createSignedPdfToken(
            {
              scope: 'desemp_unit',
              desempCategoria: cat,
              unitIds: scope.unitIds,
              unitLabel: scope.unitLabel
            },
            options.signingKey
          );
          const caption = `Desempenho ${catLabel} (${scope.unitLabel}) • 1ª folha: Gráfico da Unidade + ${pdf.userCount} ficha(s) individuais`;
          replies.push({
            kind: 'document',
            header: `PDF — Desempenho ${catLabel} (${scope.unitLabel})`,
            body: caption,
            documentFilename: pdf.filename,
            documentCaption: caption,
            documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
            documentBuffer: pdf.buffer
          });
          replies.push({
            kind: 'buttons',
            body: 'PDF consolidado enviado! Deseja realizar outra consulta?',
            buttons: [
              { id: 'DESEMP_UNIDADE', title: 'Outro Desempenho' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
        }
        nextEtapa = 'MENU_PRINCIPAL';
      }
    }
  }
  // --------------------------------------------------------------------------
  // ENTRADAS DIGITADAS DE PERÍODO (MM/AAAA ou AAAA)
  // --------------------------------------------------------------------------
  else if (session.etapa === 'ARM_AGUARDANDO_PERIODO' && rawText) {
    if (ensureAuthenticatedUser(false)) {
      const mode: 'MINHAS_ANTIGAS' | 'UNIDADE_CAUTELAS' =
        session.contexto?.armPeriodMode === 'UNIDADE_CAUTELAS' ? 'UNIDADE_CAUTELAS' : 'MINHAS_ANTIGAS';
      const cat: ArmariaCategoria = isArmariaCategoria(session.contexto?.armCategoria)
        ? session.contexto.armCategoria
        : 'ARMAS';
      const gran: 'MES' | 'ANO' = session.contexto?.armGranularity === 'ANO' ? 'ANO' : 'MES';
      const parsed = parseMonthOrYear(gran, rawText);

      if (!parsed) {
        const fmt = gran === 'MES' ? 'MM/AAAA (ex: 11/2026)' : 'AAAA (ex: 2026)';
        replies.push({
          kind: 'buttons',
          header: 'Formato inválido',
          body: `Digite o período no formato *${fmt}* ou clique abaixo para voltar ao menu:`,
          buttons: [
            { id: `ARM_CAT::${cat}`, title: 'Voltar Categoria' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      } else if (mode === 'MINHAS_ANTIGAS') {
        await emitMyCautelasPdf(cat, {
          onlyActive: false,
          granularity: gran,
          isoFilter: parsed.iso,
          displayFilter: parsed.display
        });
      } else if (ensureAuthenticatedUser(true)) {
        const meta = ARMARIA_CATEGORIA_META[cat];
        nextEtapa = 'ARM_UNIDADE_CAUTELA_ESCOLHER_UNIT';
        nextContexto = {
          ...nextContexto,
          armCategoria: cat,
          armGranularity: gran,
          armIsoFilter: parsed.iso,
          armDisplayFilter: parsed.display
        };
        replies.push(
          buildEscolherUnidadeListReply({
            permittedUnits,
            header: `Cautelas ${meta.label} (${parsed.display})`,
            body: `Período selecionado: *${parsed.display}*.\nEscolha qual unidade deseja consultar para receber o PDF:`,
            actionPrefix: 'ARM_CAUT_UNIT'
          })
        );
      }
    }
  } else if (session.etapa === 'REL_AGUARDANDO_PERIODO' && rawText) {
    if (ensureAuthenticatedUser(true)) {
      const modulo: 'OP' | 'TR' = session.contexto?.relModulo === 'TR' ? 'TR' : 'OP';
      const gran: 'MES' | 'ANO' = session.contexto?.relCustomGran === 'ANO' ? 'ANO' : 'MES';
      const unitIds: string[] = Array.isArray(session.contexto?.relUnitIds)
        ? session.contexto.relUnitIds
        : allPermittedUnitIds;
      const unitLabel = String(session.contexto?.relUnitLabel || 'Unidade');
      const parsed = parseMonthOrYear(gran, rawText);

      if (!parsed) {
        const fmt = gran === 'MES' ? 'MM/AAAA (ex: 11/2026)' : 'AAAA (ex: 2026)';
        replies.push({
          kind: 'buttons',
          header: 'Formato inválido',
          body: `Digite o período no formato *${fmt}* ou volte ao menu principal:`,
          buttons: [
            { id: 'MENU_RELATORIOS', title: 'Voltar Relatórios' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      } else {
        await emitRelatorioPeriodPdf(modulo, gran === 'MES' ? 'MES_ANO' : 'ANO', unitIds, unitLabel, parsed.iso);
      }
    }
  }
  // --------------------------------------------------------------------------
  // QUALQUER MENSAGEM -> EXIBE O MENU INTERATIVO DO COEapp
  // --------------------------------------------------------------------------
  else {
    if (!resolvedUser) {
      ensureAuthenticatedUser(false);
    } else {
      nextEtapa = 'MENU_PRINCIPAL';
      nextContexto = { userId: resolvedUser.id, userName: resolvedUser.name, userMasp: resolvedUser.masp };
      replies.push(buildMainMenuReply(resolvedUser));
    }
  }

  await saveSession(pool, sessionKeyPhone, nextEtapa, nextContexto);

  if (!options.dryRun) {
    await dispatchBotRepliesToMeta(pool, cfgRow, rawPhoneDigits || sessionKeyPhone, replies, options.decryptSecret);
  }

  const publicReplies: BotReplyItem[] = replies.map(({ documentBuffer: _buf, ...rest }) => rest);
  return {
    etapaAtual: nextEtapa,
    replies: publicReplies,
    resolvedUser: resolvedUser
      ? {
          id: resolvedUser.id,
          name: resolvedUser.name,
          role: resolvedUser.role,
          unitsCount: resolvedUser.permittedUnits.length
        }
      : null
  };
}
