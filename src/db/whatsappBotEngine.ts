import crypto from 'crypto';
import {
  OperacaoOrigem,
  TreinamentoOrigem,
  ReciboTipo,
  ArmariaPeriodo,
  UnifiedOperationReport,
  UnifiedTrainingReport,
  UnifiedArmariaReceipt,
  formatIsoDateBr,
  formatIsoDateTimeBr,
  listAvailableOperationDates,
  findOperationReportsByDate,
  findOperationReportsLast24h,
  findSingleOperationReport,
  generateSingleOperationReportPdf,
  generateMultipleOperationsPdf,
  listAvailableTrainingDates,
  findTrainingReportsByDate,
  findTrainingReportsLast24h,
  findSingleTrainingReport,
  generateSingleTrainingReportPdf,
  generateMultipleTrainingsPdf,
  listArmariaReceipts,
  findSingleArmariaReceipt,
  generateArmariaReceiptPdf,
  findArmariaCautelasByPeriod,
  generateArmariaCautelasReportPdf
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
    | 'tr_single'
    | 'tr_last24h'
    | 'tr_period'
    | 'arm_receipt'
    | 'arm_report';
  origem?: OperacaoOrigem | TreinamentoOrigem;
  id?: string;
  granularity?: 'DIA' | 'MES' | 'ANO';
  isoFilter?: string;
  unitIds?: string[];
  unitLabel?: string;
  receiptTipo?: ReciboTipo;
  period?: ArmariaPeriodo;
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

function phonesMatch(a: string, b: string): boolean {
  const d1 = normalizePhoneDigits(a);
  const d2 = normalizePhoneDigits(b);
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  // Match ignoring country code 55 and/or Brazilian 9th digit
  const tail1 = d1.slice(-8);
  const tail2 = d2.slice(-8);
  return tail1.length === 8 && tail1 === tail2;
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
    userRow = (allUsers || []).find((u: any) => phonesMatch(u.TELEFONE_USUARIOS, fromPhone)) || null;
  }
  if (!userRow) return null;

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

function parseUserDate(granularity: 'DIA' | 'MES' | 'ANO', raw: string): { iso: string; display: string } | null {
  const clean = String(raw || '').trim();
  if (granularity === 'DIA') {
    let m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3];
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
        return { iso: `${yyyy}-${mm}-${dd}`, display: `${dd}/${mm}/${yyyy}` };
      }
    }
    m = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = m[2].padStart(2, '0');
      const dd = m[3].padStart(2, '0');
      if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
        return { iso: `${yyyy}-${mm}-${dd}`, display: `${dd}/${mm}/${yyyy}` };
      }
    }
    return null;
  }

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

export async function resetBotSession(pool: any, phone: string): Promise<void> {
  await saveSession(pool, phone, 'INICIO', {});
}

export async function createTemporaryWhatsappSession(
  pool: any,
  params: {
    tipoFluxo: 'SOLICITAR_CAUTELA' | 'DEVOLVER_CAUTELA';
    userId: string;
    fromPhone: string;
  }
): Promise<{ sessionId: string; rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(24).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const sessionId = `wpp-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

  await pool.query(
    `INSERT INTO WHATSAPP_SESSOES_TEMPORARIAS (
      ID_SESSAO, TOKEN_HASH, TIPO_FLUXO, USUARIO_ID, TELEFONE_CLIENTE, STATUS_SESSAO, EXPIRA_EM, DATA_CRIACAO
    ) VALUES (?, ?, ?, ?, ?, 'ATIVA', DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW())`,
    [sessionId, tokenHash, params.tipoFluxo, params.userId, params.fromPhone]
  );
  return { sessionId, rawToken, expiresAt };
}

// ============================================================================
// CONSTRUTORES DE MENUS INTERATIVOS
// ============================================================================
function buildMainMenuReply(user?: ResolvedWhatsappUser | null): BotReplyItem {
  const greeting = user?.name ? `Olá, *${user.name}*!` : 'Olá!';
  return {
    kind: 'buttons',
    header: 'Central Operacional — PCMG',
    body: `${greeting} Bem-vindo ao atendimento automático do sistema.\nSelecione abaixo uma das opções desejadas para prosseguir:`,
    footer: 'Escolha uma opção nos botões abaixo',
    buttons: [
      { id: 'MENU_OPERACOES', title: 'Operações' },
      { id: 'MENU_TREINAMENTOS', title: 'Treinamentos' },
      { id: 'MENU_ARMARIA', title: 'Armaria' }
    ]
  };
}

function buildModuloRelatoriosMenuReply(modulo: 'OP' | 'TR'): BotReplyItem {
  const label = modulo === 'OP' ? 'Operações' : 'Treinamentos';
  return {
    kind: 'buttons',
    header: `Relatórios de ${label}`,
    body:
      `Escolha como deseja consultar e baixar os relatórios de *${label}* em PDF:\n\n` +
      `• *Relatórios Por data* — filtrar por DIA/MÊS/ANO, MÊS/ANO ou ANO e escolher a unidade\n` +
      `• *Relatório das últimas 24h* — baixar em PDF os relatórios de ${label.toLowerCase()} das últimas 24 horas`,
    footer: 'Selecione uma das opções abaixo',
    buttons: [
      { id: `MOD_POR_DATA::${modulo}`, title: 'Relatórios Por data' },
      { id: `MOD_24H::${modulo}`, title: 'Relat. últimas 24h' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildEscolherTipoDataReply(modulo: 'OP' | 'TR'): BotReplyItem {
  const label = modulo === 'OP' ? 'Operações' : 'Treinamentos';
  return {
    kind: 'buttons',
    header: `${label} — Por Data`,
    body: `Como deseja filtrar os relatórios de *${label}*?\nSelecione abaixo se prefere por *DIA/MÊS/ANO*, *MÊS/ANO* ou *ANO*:`,
    footer: 'Em seguida você escolherá a unidade permitida',
    buttons: [
      { id: `MOD_GRAN::${modulo}::DIA`, title: 'DIA/MÊS/ANO' },
      { id: `MOD_GRAN::${modulo}::MES`, title: 'MÊS/ANO' },
      { id: `MOD_GRAN::${modulo}::ANO`, title: 'ANO' }
    ]
  };
}

function buildEscolherUnidadeReply(
  permittedUnits: PermittedUnit[],
  contextTitle: string,
  actionPrefix: string,
  includeTodas: boolean = true
): BotReplyItem {
  const rows: BotListRow[] = [];
  if (includeTodas && permittedUnits.length > 1) {
    rows.push({
      id: `${actionPrefix}::TODAS`,
      title: 'TODAS',
      description: `Consultar todas as ${permittedUnits.length} unidades que você possui permissão`
    });
  }
  permittedUnits.slice(0, 8).forEach(u => {
    rows.push({
      id: `${actionPrefix}::${u.id}`,
      title: truncateText(u.shortName, 24),
      description: truncateText(u.name, 72)
    });
  });
  rows.push({
    id: 'VOLTAR_MENU',
    title: 'Voltar ao Menu',
    description: 'Retornar ao menu principal'
  });

  // Se houver até 2 opções de unidade (+ TODAS se >1 -> no max 3 botões), pode usar lista interativa limpa
  const unitNamesList = permittedUnits.map(u => `*${u.shortName}*`).join(', ');
  return {
    kind: 'list',
    header: contextTitle,
    body:
      `Qual unidade deseja consultar?\n\n` +
      `Unidades disponíveis no seu perfil: ${unitNamesList}${
        includeTodas && permittedUnits.length > 1 ? ' ou *TODAS*' : ''
      }.`,
    footer: 'Exibindo apenas unidades autorizadas ao seu perfil',
    listButtonText: 'Escolher Unidade',
    listRows: rows
  };
}

function buildArmariaMenuReply(): BotReplyItem {
  return {
    kind: 'list',
    header: 'Módulo Armaria — PCMG',
    body:
      'Selecione o serviço desejado na *Armaria*:\n\n' +
      '• *Solicitar Cautelas* — abrir sessão temporária para cautelar armas, munições ou materiais\n' +
      '• *Devolver Cautelas* — abrir sessão temporária para devolução\n' +
      '• *Recibos* — baixar recibos em PDF (Armas, Munições e Materiais separados)\n' +
      '• *Relatórios* — emitir relatório de cautelas por unidade e período em PDF',
    footer: 'Toque abaixo para escolher uma opção',
    listButtonText: 'Opções Armaria',
    listRows: [
      { id: 'ARM_SOLICITAR', title: 'Solicitar Cautelas', description: 'Abrir página temporária de cautela (armas/munições/materiais)' },
      { id: 'ARM_DEVOLVER', title: 'Devolver Cautelas', description: 'Abrir página temporária de devolução de cautelas' },
      { id: 'ARM_RECIBOS', title: 'Recibos', description: 'Emitir recibos em PDF (Armas, Munições e Materiais)' },
      { id: 'ARM_RELATORIOS', title: 'Relatórios', description: 'Relatório de cautelas por unidade (24h, semana, mês, ano)' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Voltar para Operações, Treinamentos, Armaria' }
    ]
  };
}

function buildRecibosCategoriaReply(targetUserName: string, unitLabel?: string): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Recibos — Selecionar Tipo',
    body: `Escolha qual categoria de recibo deseja consultar para *${targetUserName}*${
      unitLabel ? ` (${unitLabel})` : ''
    }:`,
    footer: 'Armas, Munições e Materiais são listados separadamente',
    buttons: [
      { id: 'ARM_REC_TIPO::ARMAS', title: 'Armas' },
      { id: 'ARM_REC_TIPO::MUNICOES', title: 'Munições' },
      { id: 'ARM_REC_TIPO::MATERIAIS', title: 'Materiais' }
    ]
  };
}

function buildArmariaPeriodoReply(unitLabel: string): BotReplyItem {
  return {
    kind: 'list',
    header: `Relatório Armaria — ${truncateText(unitLabel, 24)}`,
    body: `Selecione o período desejado para gerar o relatório consolidado de cautelas (*${unitLabel}*) em PDF:`,
    footer: 'Armas, Munições e Materiais consolidados no PDF',
    listButtonText: 'Escolher Período',
    listRows: [
      { id: 'ARM_REL_PER::24H', title: 'Últimas 24h', description: 'Cautelas registradas nas últimas 24 horas' },
      { id: 'ARM_REL_PER::SEMANA', title: 'Última semana', description: 'Cautelas registradas nos últimos 7 dias' },
      { id: 'ARM_REL_PER::MES_ATUAL', title: 'Mês atual', description: 'Cautelas registradas no mês corrente' },
      { id: 'ARM_REL_PER::ANO_ATUAL', title: 'Ano atual', description: 'Cautelas registradas no ano corrente' },
      { id: 'MENU_ARMARIA', title: 'Voltar p/ Armaria', description: 'Retornar ao menu da Armaria' }
    ]
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
    ) VALUES (?, 'SAIDA', ?, ?, 'text', ?, ?, ?, ?, ?, ?, ?, ?, 'Bot WhatsApp PCMG', NOW())`,
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
      resumo = `[Sessão Temporária] ${item.header || item.actionLabel || 'Link'}`;
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
      ) VALUES (?, 'SAIDA', ?, ?, ?, 'ATENDIMENTO_BOT_INTERATIVO', ?, ?, ?, ?, ?, ?, ?, 'Bot WhatsApp PCMG', NOW())`,
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
// MOTOR PRINCIPAL DA MÁQUINA DE ESTADOS DO BOT INTERATIVO
// ============================================================================
export async function processWhatsappBotInteraction(
  pool: any,
  cfgRow: any,
  input: BotInputMessage,
  options: BotProcessOptions
): Promise<{ etapaAtual: string; replies: BotReplyItem[]; resolvedUser?: { id: string; name: string; role: string; unitsCount: number } | null }> {
  const phone = normalizePhoneDigits(input.fromPhone);
  const actionId = String(input.buttonId || input.listRowId || '').trim();
  const rawText = String(input.text || input.buttonTitle || input.listRowTitle || '').trim();
  const normText = normalizeText(rawText);

  const resolvedUser = await resolveWhatsappUserContext(pool, phone, options.forcedUserId);
  const session = await getSession(pool, phone);
  let nextEtapa = session.etapa;
  let nextContexto = { ...(session.contexto || {}) };
  const replies: BotReplyItem[] = [];

  const permittedUnits = resolvedUser?.permittedUnits || [];
  const allPermittedUnitIds = permittedUnits.map(u => u.id);

  const ensureAuthenticatedUser = (): boolean => {
    if (!resolvedUser) {
      replies.push({
        kind: 'text',
        header: 'Número Não Vinculado',
        body:
          'Seu número de WhatsApp não foi localizado no cadastro de policiais do sistema.\n' +
          'Solicite ao Administrador que cadastre seu telefone no seu perfil de usuário para liberar acesso às suas unidades e relatórios.'
      });
      nextEtapa = 'INICIO';
      return false;
    }
    if (permittedUnits.length === 0) {
      replies.push({
        kind: 'buttons',
        header: 'Sem Unidade Vinculada',
        body: `Olá, ${resolvedUser.name}. Seu usuário não possui unidade vinculada para consulta de relatórios ou cautelas.`,
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return false;
    }
    return true;
  };

  const resolveSelectedUnitScope = (
    choice: string
  ): { unitIds: string[]; unitLabel: string } | null => {
    if (choice === 'TODAS') {
      if (permittedUnits.length === 0) return null;
      return {
        unitIds: allPermittedUnitIds,
        unitLabel: permittedUnits.length > 1 ? 'TODAS AS UNIDADES PERMITIDAS' : permittedUnits[0].shortName
      };
    }
    const found = permittedUnits.find(u => u.id === choice);
    if (!found) return null;
    return { unitIds: [found.id], unitLabel: found.shortName };
  };

  const buildPublicBaseUrl = (): string => {
    const cfgBase = String(cfgRow?.CALLBACK_URL_PUBLICA || '').trim().replace(/\/+$/, '');
    if (cfgBase) return cfgBase;
    return String(options.publicBaseUrl || '').trim().replace(/\/+$/, '');
  };

  // --- Helpers de Relatórios de Operações & Treinamentos ---
  const showDateOptionsForModulo = async (modulo: 'OP' | 'TR', granularity: 'DIA' | 'MES' | 'ANO') => {
    const available =
      modulo === 'OP'
        ? await listAvailableOperationDates(pool, granularity, allPermittedUnitIds)
        : await listAvailableTrainingDates(pool, granularity, allPermittedUnitIds);

    const formatoExemplo =
      granularity === 'DIA'
        ? 'DD/MM/AAAA (ex: 24/11/2026)'
        : granularity === 'MES'
        ? 'MM/AAAA (ex: 11/2026)'
        : 'AAAA (ex: 2026)';
    const labelGran = granularity === 'DIA' ? 'DIA/MÊS/ANO' : granularity === 'MES' ? 'MÊS/ANO' : 'ANO';
    const labelMod = modulo === 'OP' ? 'Operações' : 'Treinamentos';

    nextEtapa = 'AGUARDANDO_VALOR_DATA';
    nextContexto = { modulo, granularity };

    if (available.length > 0) {
      const rows: BotListRow[] = available.map(opt => ({
        id: `MOD_DATEVAL::${modulo}::${granularity}::${opt.value}`,
        title: truncateText(opt.label, 24),
        description: `${opt.count} relatório(s) de ${labelMod.toLowerCase()} disponível(is)`
      }));
      rows.push({
        id: 'VOLTAR_MENU',
        title: 'Voltar ao Menu',
        description: 'Retornar ao menu principal'
      });

      replies.push({
        kind: 'list',
        header: `${labelMod} — ${labelGran}`,
        body: `Selecione uma opção abaixo ou digite diretamente no formato *${formatoExemplo}*.\nNa etapa seguinte você escolherá a unidade:`,
        footer: 'Selecione ou digite a data desejada',
        listButtonText: `Escolher ${labelGran}`,
        listRows: rows
      });
      return;
    }

    replies.push({
      kind: 'buttons',
      header: `${labelMod} — ${labelGran}`,
      body: `Digite a data desejada no formato *${formatoExemplo}* para consultar os relatórios de *${labelMod}*:`,
      footer: 'Na próxima etapa você escolherá a unidade',
      buttons: [
        { id: `MOD_POR_DATA::${modulo}`, title: 'Trocar Filtro' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
  };

  const askUnitBeforeReport = (params: {
    modulo: 'OP' | 'TR';
    mode: 'POR_DATA' | 'ULTIMAS_24H';
    granularity?: 'DIA' | 'MES' | 'ANO';
    isoFilter?: string;
    displayFilter?: string;
  }) => {
    const labelMod = params.modulo === 'OP' ? 'Operações' : 'Treinamentos';
    const sub = params.mode === 'ULTIMAS_24H' ? 'Últimas 24h' : params.displayFilter || 'Por Data';
    nextEtapa = 'ESCOLHER_UNIDADE_RELATORIO';
    nextContexto = { ...params };
    replies.push(
      buildEscolherUnidadeReply(
        permittedUnits,
        `${labelMod} (${sub}) — Qual unidade?`,
        'REL_UNIT',
        true
      )
    );
  };

  const emitReportsAfterUnitChoice = async (unitChoice: string) => {
    const scope = resolveSelectedUnitScope(unitChoice);
    if (!scope) {
      replies.push({
        kind: 'buttons',
        header: 'Unidade não autorizada',
        body: 'Você não possui permissão para consultar esta unidade. Escolha apenas uma unidade listada no seu perfil.',
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }

    const modulo: 'OP' | 'TR' = nextContexto.modulo === 'TR' ? 'TR' : 'OP';
    const mode: 'POR_DATA' | 'ULTIMAS_24H' = nextContexto.mode === 'ULTIMAS_24H' ? 'ULTIMAS_24H' : 'POR_DATA';
    const labelMod = modulo === 'OP' ? 'Operações' : 'Treinamentos';

    // CASO 1: ÚLTIMAS 24H -> GERA E BAIXA PDF IMEDIATAMENTE
    if (mode === 'ULTIMAS_24H') {
      if (modulo === 'OP') {
        const reports = await findOperationReportsLast24h(pool, scope.unitIds);
        if (reports.length === 0) {
          replies.push({
            kind: 'buttons',
            header: `Operações 24h — ${scope.unitLabel}`,
            body: `Nenhum relatório de operações foi encontrado nas últimas 24h para *${scope.unitLabel}*.`,
            buttons: [
              { id: 'MOD_POR_DATA::OP', title: 'Relatórios Por data' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
          nextEtapa = 'MENU_PRINCIPAL';
          return;
        }
        const todayIso = new Date().toISOString().slice(0, 10);
        const { buffer, filename } = await generateMultipleOperationsPdf(
          reports,
          `RELATORIOS DE OPERACOES (24H) — ${scope.unitLabel}`,
          `24h_${scope.unitLabel}_${todayIso}`
        );
        const token = createSignedPdfToken(
          { scope: 'op_last24h', unitIds: scope.unitIds, unitLabel: scope.unitLabel },
          options.signingKey
        );
        const caption = `Relatórios de Operações (Últimas 24h) • Unidade: ${scope.unitLabel} • ${reports.length} registro(s)`;
        replies.push({
          kind: 'document',
          header: 'PDF — Operações (Últimas 24h)',
          body: caption,
          documentFilename: filename,
          documentCaption: caption,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: buffer
        });
      } else {
        const reports = await findTrainingReportsLast24h(pool, scope.unitIds);
        if (reports.length === 0) {
          replies.push({
            kind: 'buttons',
            header: `Treinamentos 24h — ${scope.unitLabel}`,
            body: `Nenhum relatório de treinamento foi encontrado nas últimas 24h para *${scope.unitLabel}*.`,
            buttons: [
              { id: 'MOD_POR_DATA::TR', title: 'Relatórios Por data' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
          nextEtapa = 'MENU_PRINCIPAL';
          return;
        }
        const todayIso = new Date().toISOString().slice(0, 10);
        const { buffer, filename } = await generateMultipleTrainingsPdf(
          reports,
          `RELATORIOS DE TREINAMENTOS (24H) — ${scope.unitLabel}`,
          `24h_${scope.unitLabel}_${todayIso}`
        );
        const token = createSignedPdfToken(
          { scope: 'tr_last24h', unitIds: scope.unitIds, unitLabel: scope.unitLabel },
          options.signingKey
        );
        const caption = `Relatórios de Treinamentos (Últimas 24h) • Unidade: ${scope.unitLabel} • ${reports.length} registro(s)`;
        replies.push({
          kind: 'document',
          header: 'PDF — Treinamentos (Últimas 24h)',
          body: caption,
          documentFilename: filename,
          documentCaption: caption,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: buffer
        });
      }

      replies.push({
        kind: 'buttons',
        body: `PDF enviado! Deseja realizar outra consulta em ${labelMod} ou voltar ao menu principal?`,
        buttons: [
          { id: `MOD_POR_DATA::${modulo}`, title: 'Outra Data' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'MENU_PRINCIPAL';
      return;
    }

    // CASO 2: POR DATA -> LISTA OS RELATÓRIOS DA UNIDADE ESCOLHIDA PARA BAIXAR EM PDF
    const gran: 'DIA' | 'MES' | 'ANO' =
      nextContexto.granularity === 'MES' || nextContexto.granularity === 'ANO' ? nextContexto.granularity : 'DIA';
    const isoFilter = String(nextContexto.isoFilter || '');
    const displayFilter = String(nextContexto.displayFilter || isoFilter);

    if (modulo === 'OP') {
      const reports = await findOperationReportsByDate(pool, gran, isoFilter, scope.unitIds);
      if (reports.length === 0) {
        replies.push({
          kind: 'buttons',
          header: `Sem Operações — ${scope.unitLabel}`,
          body: `Nenhum relatório de operações encontrado para *${displayFilter}* na unidade *${scope.unitLabel}*.`,
          buttons: [
            { id: 'MOD_POR_DATA::OP', title: 'Outra Data' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
        nextEtapa = 'MENU_PRINCIPAL';
        return;
      }

      const rows: BotListRow[] = [];
      if (reports.length > 1) {
        rows.push({
          id: 'MOD_PDF_ALL',
          title: truncateText(`Baixar Todos (${reports.length} PDF)`, 24),
          description: truncateText(`PDF consolidado — ${scope.unitLabel} (${displayFilter})`, 72)
        });
      }
      const maxInd = reports.length > 1 ? 8 : 9;
      reports.slice(0, maxInd).forEach((r: UnifiedOperationReport, idx: number) => {
        rows.push({
          id: `MOD_PDF_ONE::OP::${r.origem}::${r.id}`,
          title: truncateText(`${idx + 1}. ${formatIsoDateBr(r.dataOperacao).slice(0, 5)} ${r.municipio}`, 24),
          description: truncateText(`${r.unidadeNome} • ${r.horaOperacao} • ${r.criadorNome}`, 72)
        });
      });
      rows.push({ id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' });

      nextEtapa = 'SELECIONAR_RELATORIO_PDF';
      nextContexto = {
        modulo: 'OP',
        granularity: gran,
        isoFilter,
        displayFilter,
        unitIds: scope.unitIds,
        unitLabel: scope.unitLabel,
        items: reports.slice(0, maxInd).map(r => ({ origem: r.origem, id: r.id }))
      };
      replies.push({
        kind: 'list',
        header: `Operações • ${scope.unitLabel}`,
        body: `Encontramos *${reports.length}* relatório(s) de operações em *${displayFilter}* (${scope.unitLabel}). Selecione qual deseja baixar em *PDF*:`,
        footer: 'Selecione na lista ou digite o número',
        listButtonText: 'Selecionar PDF',
        listRows: rows
      });
    } else {
      const reports = await findTrainingReportsByDate(pool, gran, isoFilter, scope.unitIds);
      if (reports.length === 0) {
        replies.push({
          kind: 'buttons',
          header: `Sem Treinamentos — ${scope.unitLabel}`,
          body: `Nenhum relatório de treinamento encontrado para *${displayFilter}* na unidade *${scope.unitLabel}*.`,
          buttons: [
            { id: 'MOD_POR_DATA::TR', title: 'Outra Data' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
        nextEtapa = 'MENU_PRINCIPAL';
        return;
      }

      const rows: BotListRow[] = [];
      if (reports.length > 1) {
        rows.push({
          id: 'MOD_PDF_ALL',
          title: truncateText(`Baixar Todos (${reports.length} PDF)`, 24),
          description: truncateText(`PDF consolidado — ${scope.unitLabel} (${displayFilter})`, 72)
        });
      }
      const maxInd = reports.length > 1 ? 8 : 9;
      reports.slice(0, maxInd).forEach((r: UnifiedTrainingReport, idx: number) => {
        rows.push({
          id: `MOD_PDF_ONE::TR::${r.origem}::${r.id}`,
          title: truncateText(`${idx + 1}. ${formatIsoDateBr(r.dataTreinamento).slice(0, 5)} ${r.titulo}`, 24),
          description: truncateText(`${r.unidadeNome} • ${r.responsavelNome}`, 72)
        });
      });
      rows.push({ id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' });

      nextEtapa = 'SELECIONAR_RELATORIO_PDF';
      nextContexto = {
        modulo: 'TR',
        granularity: gran,
        isoFilter,
        displayFilter,
        unitIds: scope.unitIds,
        unitLabel: scope.unitLabel,
        items: reports.slice(0, maxInd).map(r => ({ origem: r.origem, id: r.id }))
      };
      replies.push({
        kind: 'list',
        header: `Treinamentos • ${scope.unitLabel}`,
        body: `Encontramos *${reports.length}* relatório(s) de treinamento em *${displayFilter}* (${scope.unitLabel}). Selecione qual deseja baixar em *PDF*:`,
        footer: 'Selecione na lista ou digite o número',
        listButtonText: 'Selecionar PDF',
        listRows: rows
      });
    }
  };

  // --- Helpers de Armaria (Recibos & Usuários da Unidade) ---
  const showUsersOfUnitForReceipts = async (unitId: string, unitLabel: string, searchFilter = '') => {
    const likeParam = `%${searchFilter.trim()}%`;
    const [uRows]: any = await pool.query(
      searchFilter.trim()
        ? `SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS, CARGO_USUARIOS
           FROM USUARIOS
           WHERE UNIDADE_ID_USUARIOS = ? AND (NOME_USUARIOS LIKE ? OR MASP_USUARIOS LIKE ?)
           ORDER BY NOME_USUARIOS ASC LIMIT 8`
        : `SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS, CARGO_USUARIOS
           FROM USUARIOS
           WHERE UNIDADE_ID_USUARIOS = ?
           ORDER BY NOME_USUARIOS ASC LIMIT 8`,
      searchFilter.trim() ? [unitId, likeParam, likeParam] : [unitId]
    );

    const rows: BotListRow[] = [];
    if (resolvedUser) {
      rows.push({
        id: `ARM_REC_USER::${resolvedUser.id}`,
        title: truncateText(`Meus Recibos (${resolvedUser.name.split(' ')[0]})`, 24),
        description: `MASP ${resolvedUser.masp} • Emitir seus próprios recibos`
      });
    }
    for (const u of uRows || []) {
      if (resolvedUser && String(u.ID_USUARIOS) === resolvedUser.id) continue;
      rows.push({
        id: `ARM_REC_USER::${u.ID_USUARIOS}`,
        title: truncateText(String(u.NOME_USUARIOS || 'Usuário'), 24),
        description: truncateText(`MASP ${u.MASP_USUARIOS || '—'} • ${u.CARGO_USUARIOS || ''}`, 72)
      });
    }
    rows.push({ id: 'MENU_ARMARIA', title: 'Voltar p/ Armaria', description: 'Voltar às opções da Armaria' });

    nextEtapa = 'ARMARIA_RECIBOS_ESCOLHER_USUARIO';
    nextContexto = { recUnitId: unitId, recUnitLabel: unitLabel };
    replies.push({
      kind: 'list',
      header: `Recibos — ${truncateText(unitLabel, 20)}`,
      body:
        `Selecione o policial/usuário para emitir o recibo de cautela (ou digite o *nome* ou *MASP* para filtrar):`,
      footer: 'Armeiros e Administradores podem emitir recibos de terceiros',
      listButtonText: 'Escolher Usuário',
      listRows: rows.slice(0, 10)
    });
  };

  // ==========================================================================
  // ROTEAMENTO COMPLETO DA MÁQUINA DE ESTADOS
  // ==========================================================================
  const isResetCommand =
    actionId === 'VOLTAR_MENU' ||
    ['menu', 'inicio', 'voltar', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'start', 'ajuda'].includes(normText);

  if (isResetCommand) {
    nextEtapa = 'MENU_PRINCIPAL';
    nextContexto = {};
    replies.push(buildMainMenuReply(resolvedUser));
  } else if (
    actionId === 'MENU_OPERACOES' ||
    normText === 'operacoes' ||
    (session.etapa === 'MENU_PRINCIPAL' && normText === '1')
  ) {
    if (ensureAuthenticatedUser()) {
      nextEtapa = 'MODULO_MENU';
      nextContexto = { modulo: 'OP' };
      replies.push(buildModuloRelatoriosMenuReply('OP'));
    }
  } else if (
    actionId === 'MENU_TREINAMENTOS' ||
    normText === 'treinamentos' ||
    (session.etapa === 'MENU_PRINCIPAL' && normText === '2')
  ) {
    if (ensureAuthenticatedUser()) {
      nextEtapa = 'MODULO_MENU';
      nextContexto = { modulo: 'TR' };
      replies.push(buildModuloRelatoriosMenuReply('TR'));
    }
  } else if (
    actionId === 'MENU_ARMARIA' ||
    normText === 'armaria' ||
    (session.etapa === 'MENU_PRINCIPAL' && normText === '3')
  ) {
    if (ensureAuthenticatedUser()) {
      nextEtapa = 'ARMARIA_MENU';
      nextContexto = {};
      replies.push(buildArmariaMenuReply());
    }
  }
  // --- OPERAÇÕES / TREINAMENTOS: POR DATA vs 24H ---
  else if (actionId.startsWith('MOD_POR_DATA::')) {
    if (ensureAuthenticatedUser()) {
      const mod: 'OP' | 'TR' = actionId.endsWith('::TR') ? 'TR' : 'OP';
      nextEtapa = 'ESCOLHER_TIPO_DATA';
      nextContexto = { modulo: mod };
      replies.push(buildEscolherTipoDataReply(mod));
    }
  } else if (actionId.startsWith('MOD_24H::')) {
    if (ensureAuthenticatedUser()) {
      const mod: 'OP' | 'TR' = actionId.endsWith('::TR') ? 'TR' : 'OP';
      askUnitBeforeReport({ modulo: mod, mode: 'ULTIMAS_24H' });
    }
  } else if (actionId.startsWith('MOD_GRAN::')) {
    if (ensureAuthenticatedUser()) {
      const [, modRaw, granRaw] = actionId.split('::');
      const mod: 'OP' | 'TR' = modRaw === 'TR' ? 'TR' : 'OP';
      const gran: 'DIA' | 'MES' | 'ANO' = granRaw === 'MES' || granRaw === 'ANO' ? granRaw : 'DIA';
      await showDateOptionsForModulo(mod, gran);
    }
  } else if (actionId.startsWith('MOD_DATEVAL::')) {
    if (ensureAuthenticatedUser()) {
      const [, modRaw, granRaw, isoVal] = actionId.split('::');
      const mod: 'OP' | 'TR' = modRaw === 'TR' ? 'TR' : 'OP';
      const gran: 'DIA' | 'MES' | 'ANO' = granRaw === 'MES' || granRaw === 'ANO' ? granRaw : 'DIA';
      const parsed = parseUserDate(gran, isoVal);
      if (parsed) {
        askUnitBeforeReport({
          modulo: mod,
          mode: 'POR_DATA',
          granularity: gran,
          isoFilter: parsed.iso,
          displayFilter: parsed.display
        });
      } else {
        await showDateOptionsForModulo(mod, gran);
      }
    }
  } else if (actionId.startsWith('REL_UNIT::')) {
    if (ensureAuthenticatedUser()) {
      const chosenUnit = actionId.split('::')[1] || '';
      await emitReportsAfterUnitChoice(chosenUnit);
    }
  } else if (actionId.startsWith('MOD_PDF_ONE::')) {
    if (ensureAuthenticatedUser()) {
      const [, modRaw, origemRaw, repId] = actionId.split('::');
      if (modRaw === 'OP' && (origemRaw === 'CANIL' || origemRaw === 'POLICIAL' || origemRaw === 'CAT') && repId) {
        const report = await findSingleOperationReport(pool, origemRaw, repId);
        if (!report || (report.unidadeId && !allPermittedUnitIds.includes(report.unidadeId))) {
          replies.push({
            kind: 'buttons',
            header: 'Relatório indisponível',
            body: 'Relatório não encontrado ou sem permissão para sua unidade.',
            buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
          });
        } else {
          const { buffer, filename } = await generateSingleOperationReportPdf(report);
          const token = createSignedPdfToken({ scope: 'op_single', origem: origemRaw, id: report.id }, options.signingKey);
          const caption = `Relatório de Operação — ${report.unidadeNome} (${formatIsoDateBr(report.dataOperacao)} • ${report.municipio}/${report.estado})`;
          replies.push({
            kind: 'document',
            header: 'PDF Operação Pronto',
            body: caption,
            documentFilename: filename,
            documentCaption: caption,
            documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
            documentBuffer: buffer
          });
          replies.push({
            kind: 'buttons',
            body: 'Deseja consultar outro relatório ou voltar ao menu principal?',
            buttons: [
              { id: 'MOD_POR_DATA::OP', title: 'Outra Data' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
        }
      } else if (modRaw === 'TR' && (origemRaw === 'CANIL' || origemRaw === 'POLICIAL') && repId) {
        const report = await findSingleTrainingReport(pool, origemRaw, repId);
        if (!report || (report.unidadeId && !allPermittedUnitIds.includes(report.unidadeId))) {
          replies.push({
            kind: 'buttons',
            header: 'Relatório indisponível',
            body: 'Relatório de treinamento não encontrado ou sem permissão para sua unidade.',
            buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
          });
        } else {
          const { buffer, filename } = await generateSingleTrainingReportPdf(report);
          const token = createSignedPdfToken({ scope: 'tr_single', origem: origemRaw, id: report.id }, options.signingKey);
          const caption = `Relatório de Treinamento — ${report.unidadeNome} (${formatIsoDateBr(report.dataTreinamento)})`;
          replies.push({
            kind: 'document',
            header: 'PDF Treinamento Pronto',
            body: caption,
            documentFilename: filename,
            documentCaption: caption,
            documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
            documentBuffer: buffer
          });
          replies.push({
            kind: 'buttons',
            body: 'Deseja consultar outro treinamento ou voltar ao menu principal?',
            buttons: [
              { id: 'MOD_POR_DATA::TR', title: 'Outra Data' },
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
            ]
          });
        }
      }
      nextEtapa = 'MENU_PRINCIPAL';
    }
  } else if (actionId === 'MOD_PDF_ALL') {
    if (ensureAuthenticatedUser()) {
      const mod: 'OP' | 'TR' = nextContexto.modulo === 'TR' ? 'TR' : 'OP';
      const gran: 'DIA' | 'MES' | 'ANO' =
        nextContexto.granularity === 'MES' || nextContexto.granularity === 'ANO' ? nextContexto.granularity : 'DIA';
      const isoFilter = String(nextContexto.isoFilter || '');
      const displayFilter = String(nextContexto.displayFilter || isoFilter);
      const safeUnitIds = (Array.isArray(nextContexto.unitIds) ? nextContexto.unitIds : allPermittedUnitIds).filter(
        (id: string) => allPermittedUnitIds.includes(id)
      );
      const unitLabel = String(nextContexto.unitLabel || 'Unidades');

      if (mod === 'OP') {
        const reps = await findOperationReportsByDate(pool, gran, isoFilter, safeUnitIds);
        const { buffer, filename } = await generateMultipleOperationsPdf(
          reps,
          `OPERACOES — ${displayFilter} (${unitLabel})`,
          `OP_${isoFilter}_${unitLabel}`
        );
        const token = createSignedPdfToken(
          { scope: 'op_period', granularity: gran, isoFilter, unitIds: safeUnitIds, unitLabel },
          options.signingKey
        );
        replies.push({
          kind: 'document',
          header: `PDF Consolidado — ${displayFilter}`,
          body: `${reps.length} relatório(s) de operações (${unitLabel})`,
          documentFilename: filename,
          documentCaption: `Relatórios de Operações • ${displayFilter} • ${unitLabel}`,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: buffer
        });
      } else {
        const reps = await findTrainingReportsByDate(pool, gran, isoFilter, safeUnitIds);
        const { buffer, filename } = await generateMultipleTrainingsPdf(
          reps,
          `TREINAMENTOS — ${displayFilter} (${unitLabel})`,
          `TR_${isoFilter}_${unitLabel}`
        );
        const token = createSignedPdfToken(
          { scope: 'tr_period', granularity: gran, isoFilter, unitIds: safeUnitIds, unitLabel },
          options.signingKey
        );
        replies.push({
          kind: 'document',
          header: `PDF Consolidado — ${displayFilter}`,
          body: `${reps.length} relatório(s) de treinamentos (${unitLabel})`,
          documentFilename: filename,
          documentCaption: `Relatórios de Treinamentos • ${displayFilter} • ${unitLabel}`,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: buffer
        });
      }
      replies.push({
        kind: 'buttons',
        body: 'Arquivo PDF enviado! O que deseja fazer agora?',
        buttons: [
          { id: `MOD_POR_DATA::${mod}`, title: 'Outra Data' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'MENU_PRINCIPAL';
    }
  }
  // --- ARMARIA: SOLICITAR CAUTELAS (PÁGINA TEMPORÁRIA AUTENTICADA) ---
  else if (actionId === 'ARM_SOLICITAR' || normText.includes('solicitar cautela')) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      const sess = await createTemporaryWhatsappSession(pool, {
        tipoFluxo: 'SOLICITAR_CAUTELA',
        userId: resolvedUser.id,
        fromPhone: phone
      });
      const base = buildPublicBaseUrl();
      const tempUrl = `${base}/?wpp_sessao=${encodeURIComponent(sess.rawToken)}`;
      nextEtapa = 'ARMARIA_MENU';
      nextContexto = { lastSessionId: sess.sessionId };
      replies.push({
        kind: 'link',
        header: 'Solicitar Cautela — Sessão Temporária',
        body:
          `Criamos uma sessão temporária segura com o seu acesso (*${resolvedUser.name}* — MASP ${resolvedUser.masp}), válida por *30 minutos*.\n\n` +
          `Acesse o link abaixo para seguir o fluxo normal de cautela de *armas, munições e/ou materiais*.\n` +
          `Ao concluir, você voltará para o WhatsApp e receberá a confirmação: *"Aguardando deferimento do responsável pela armaria para emitir recibo."*`,
        footer: 'Sessão pessoal e intransferível • Expira em 30 min',
        actionUrl: tempUrl,
        actionLabel: 'Abrir Página Temporária — Solicitar Cautela'
      });
    }
  }
  // --- ARMARIA: DEVOLVER CAUTELAS (PÁGINA TEMPORÁRIA AUTENTICADA) ---
  else if (actionId === 'ARM_DEVOLVER' || normText.includes('devolver cautela')) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      const sess = await createTemporaryWhatsappSession(pool, {
        tipoFluxo: 'DEVOLVER_CAUTELA',
        userId: resolvedUser.id,
        fromPhone: phone
      });
      const base = buildPublicBaseUrl();
      const tempUrl = `${base}/?wpp_sessao=${encodeURIComponent(sess.rawToken)}`;
      nextEtapa = 'ARMARIA_MENU';
      nextContexto = { lastSessionId: sess.sessionId };
      replies.push({
        kind: 'link',
        header: 'Devolver Cautela — Sessão Temporária',
        body:
          `Criamos uma sessão temporária segura com o seu acesso (*${resolvedUser.name}* — MASP ${resolvedUser.masp}), válida por *30 minutos*.\n\n` +
          `Acesse o link abaixo para seguir o fluxo normal de devolução de *armas, munições e/ou materiais*.\n` +
          `Ao concluir, você voltará para o WhatsApp e receberá a confirmação: *"Aguardando deferimento do responsável pela armaria para emitir recibo."*`,
        footer: 'Sessão pessoal e intransferível • Expira em 30 min',
        actionUrl: tempUrl,
        actionLabel: 'Abrir Página Temporária — Devolver Cautela'
      });
    }
  }
  // --- ARMARIA: RECIBOS ---
  else if (actionId === 'ARM_RECIBOS' || (session.etapa === 'ARMARIA_MENU' && normText.includes('recibo'))) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      if (resolvedUser.isArmeiroOrAdmin) {
        if (permittedUnits.length > 1) {
          nextEtapa = 'ARMARIA_RECIBOS_ESCOLHER_UNIDADE';
          nextContexto = {};
          replies.push(
            buildEscolherUnidadeReply(
              permittedUnits,
              'Recibos — Qual unidade?',
              'ARM_REC_UNIT',
              false
            )
          );
        } else {
          await showUsersOfUnitForReceipts(permittedUnits[0].id, permittedUnits[0].shortName);
        }
      } else {
        // Policial comum: vai direto para seus próprios recibos (separados por Armas, Munições, Materiais)
        nextEtapa = 'ARMARIA_RECIBOS_ESCOLHER_TIPO';
        nextContexto = {
          targetUserId: resolvedUser.id,
          targetUserName: resolvedUser.name,
          targetUserMasp: resolvedUser.masp,
          recUnitIds: allPermittedUnitIds,
          recUnitLabel: permittedUnits[0]?.shortName || ''
        };
        replies.push(buildRecibosCategoriaReply(resolvedUser.name, permittedUnits[0]?.shortName));
      }
    }
  } else if (actionId.startsWith('ARM_REC_UNIT::')) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      const unitId = actionId.split('::')[1] || '';
      const unitObj = permittedUnits.find(u => u.id === unitId);
      if (!unitObj) {
        replies.push(buildArmariaMenuReply());
        nextEtapa = 'ARMARIA_MENU';
      } else {
        await showUsersOfUnitForReceipts(unitObj.id, unitObj.shortName);
      }
    }
  } else if (actionId.startsWith('ARM_REC_USER::')) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      const targetId = actionId.split('::')[1] || resolvedUser.id;
      // Verifica permissão: apenas Armeiro/Admin pode consultar recibos de terceiros
      const allowedTargetId = resolvedUser.isArmeiroOrAdmin ? targetId : resolvedUser.id;
      const [uRows]: any = await pool.query(
        'SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS, UNIDADE_ID_USUARIOS FROM USUARIOS WHERE ID_USUARIOS = ? LIMIT 1',
        [allowedTargetId]
      );
      const target = uRows?.[0];
      if (!target) {
        replies.push(buildArmariaMenuReply());
        nextEtapa = 'ARMARIA_MENU';
      } else {
        const chosenUnitId = nextContexto.recUnitId || target.UNIDADE_ID_USUARIOS || permittedUnits[0]?.id;
        const unitObj = permittedUnits.find(u => u.id === chosenUnitId);
        const recUnitIds = unitObj ? [unitObj.id] : allPermittedUnitIds;
        nextEtapa = 'ARMARIA_RECIBOS_ESCOLHER_TIPO';
        nextContexto = {
          targetUserId: String(target.ID_USUARIOS),
          targetUserName: String(target.NOME_USUARIOS),
          targetUserMasp: String(target.MASP_USUARIOS || ''),
          recUnitIds,
          recUnitLabel: unitObj?.shortName || nextContexto.recUnitLabel || ''
        };
        replies.push(buildRecibosCategoriaReply(String(target.NOME_USUARIOS), nextContexto.recUnitLabel));
      }
    }
  } else if (actionId.startsWith('ARM_REC_TIPO::')) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      const tipoRaw = actionId.split('::')[1] || 'ARMAS';
      const tipo: ReciboTipo = tipoRaw === 'MUNICOES' || tipoRaw === 'MATERIAIS' ? tipoRaw : 'ARMAS';
      const targetUserId = String(nextContexto.targetUserId || resolvedUser.id);
      const targetUserName = String(nextContexto.targetUserName || resolvedUser.name);
      const targetUserMasp = String(nextContexto.targetUserMasp || resolvedUser.masp);
      const safeUnitIds = (Array.isArray(nextContexto.recUnitIds) ? nextContexto.recUnitIds : allPermittedUnitIds).filter(
        (id: string) => allPermittedUnitIds.includes(id)
      );

      const list = await listArmariaReceipts(
        pool,
        tipo,
        { id: targetUserId, masp: targetUserMasp, name: targetUserName },
        safeUnitIds
      );
      const tipoTitle = tipo === 'ARMAS' ? 'Armas' : tipo === 'MUNICOES' ? 'Munições' : 'Materiais';

      if (list.length === 0) {
        replies.push({
          kind: 'buttons',
          header: `Recibos de ${tipoTitle}`,
          body: `Nenhum recibo de cautela de *${tipoTitle}* foi encontrado para *${targetUserName}*.`,
          buttons: [
            { id: 'ARM_RECIBOS', title: 'Outro Recibo' },
            { id: 'MENU_ARMARIA', title: 'Menu Armaria' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
        nextEtapa = 'ARMARIA_MENU';
      } else {
        const rows: BotListRow[] = list.slice(0, 9).map((rec: UnifiedArmariaReceipt, idx: number) => ({
          id: `ARM_REC_PDF::${tipo}::${rec.id}`,
          title: truncateText(`${idx + 1}. ${rec.itemTitulo}`, 24),
          description: truncateText(`${formatIsoDateTimeBr(rec.dataSolicitacao)} • ${rec.status} • ${rec.unidadeNome}`, 72)
        }));
        rows.push({ id: 'MENU_ARMARIA', title: 'Voltar p/ Armaria', description: 'Voltar às opções da Armaria' });

        nextEtapa = 'ARMARIA_RECIBOS_LISTA';
        nextContexto = { ...nextContexto, recTipo: tipo, recItems: list.slice(0, 9).map(r => r.id) };
        replies.push({
          kind: 'list',
          header: `Recibos de ${tipoTitle}`,
          body: `Encontramos *${list.length}* recibo(s) de *${tipoTitle}* em nome de *${targetUserName}*.\nSelecione abaixo o recibo que deseja baixar em *PDF*:`,
          footer: 'Toque no botão abaixo para escolher o recibo',
          listButtonText: 'Selecionar Recibo',
          listRows: rows
        });
      }
    }
  } else if (actionId.startsWith('ARM_REC_PDF::')) {
    if (ensureAuthenticatedUser() && resolvedUser) {
      const [, tipoRaw, recId] = actionId.split('::');
      const tipo: ReciboTipo = tipoRaw === 'MUNICOES' || tipoRaw === 'MATERIAIS' ? tipoRaw : 'ARMAS';
      const rec = await findSingleArmariaReceipt(pool, tipo, recId || '');
      const canView =
        rec &&
        (!rec.unidadeId || allPermittedUnitIds.includes(rec.unidadeId)) &&
        (resolvedUser.isArmeiroOrAdmin || rec.requerenteId === resolvedUser.id || rec.requerenteMasp === resolvedUser.masp);

      if (!rec || !canView) {
        replies.push({
          kind: 'buttons',
          header: 'Recibo indisponível',
          body: 'Recibo não localizado ou sem permissão de visualização.',
          buttons: [{ id: 'MENU_ARMARIA', title: 'Menu Armaria' }]
        });
      } else {
        const { buffer, filename } = await generateArmariaReceiptPdf(rec);
        const token = createSignedPdfToken({ scope: 'arm_receipt', receiptTipo: tipo, id: rec.id }, options.signingKey);
        const caption = `Recibo de ${rec.tipoLabel} • ${rec.itemTitulo} • ${rec.requerenteNome} (${rec.status})`;
        replies.push({
          kind: 'document',
          header: `PDF — Recibo de ${rec.tipoLabel}`,
          body: caption,
          documentFilename: filename,
          documentCaption: caption,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: buffer
        });
        replies.push({
          kind: 'buttons',
          body: 'Recibo emitido em PDF! Deseja emitir outro recibo ou voltar ao menu?',
          buttons: [
            { id: 'ARM_RECIBOS', title: 'Outro Recibo' },
            { id: 'MENU_ARMARIA', title: 'Menu Armaria' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      }
      nextEtapa = 'ARMARIA_MENU';
    }
  }
  // --- ARMARIA: RELATÓRIOS DE CAUTELAS (UNIDADE / TODAS + 24H / SEMANA / MÊS / ANO) ---
  else if (actionId === 'ARM_RELATORIOS' || (session.etapa === 'ARMARIA_MENU' && normText.includes('relatorio'))) {
    if (ensureAuthenticatedUser()) {
      nextEtapa = 'ARMARIA_REL_UNIDADE';
      nextContexto = {};
      const rows: BotListRow[] = [];
      rows.push({
        id: 'ARM_REL_UNIT::TODAS',
        title: 'Todas as Unidades',
        description:
          permittedUnits.length > 1
            ? `Consolidar todas as ${permittedUnits.length} unidades que você possui acesso`
            : `Emitir relatório da unidade ${permittedUnits[0]?.shortName || ''}`
      });
      permittedUnits.slice(0, 8).forEach(u => {
        rows.push({
          id: `ARM_REL_UNIT::${u.id}`,
          title: truncateText(u.shortName, 24),
          description: truncateText(u.name, 72)
        });
      });
      rows.push({ id: 'MENU_ARMARIA', title: 'Voltar p/ Armaria', description: 'Retornar às opções da Armaria' });

      replies.push({
        kind: 'list',
        header: 'Relatórios da Armaria',
        body: 'Selecione a unidade desejada ou *Todas as Unidades* para emitir o relatório de cautelas:',
        footer: 'Exibindo apenas unidades do seu acesso',
        listButtonText: 'Escolher Unidade',
        listRows: rows
      });
    }
  } else if (actionId.startsWith('ARM_REL_UNIT::')) {
    if (ensureAuthenticatedUser()) {
      const choice = actionId.split('::')[1] || 'TODAS';
      const scope = resolveSelectedUnitScope(choice);
      if (!scope) {
        replies.push(buildArmariaMenuReply());
        nextEtapa = 'ARMARIA_MENU';
      } else {
        nextEtapa = 'ARMARIA_REL_PERIODO';
        nextContexto = { armRelUnitIds: scope.unitIds, armRelUnitLabel: scope.unitLabel };
        replies.push(buildArmariaPeriodoReply(scope.unitLabel));
      }
    }
  } else if (actionId.startsWith('ARM_REL_PER::')) {
    if (ensureAuthenticatedUser()) {
      const perRaw = actionId.split('::')[1] || '24H';
      const period: ArmariaPeriodo =
        perRaw === 'SEMANA' || perRaw === 'MES_ATUAL' || perRaw === 'ANO_ATUAL' ? perRaw : '24H';
      const periodLabelMap: Record<ArmariaPeriodo, string> = {
        '24H': 'Últimas 24h',
        SEMANA: 'Última semana',
        MES_ATUAL: 'Mês atual',
        ANO_ATUAL: 'Ano atual'
      };
      const periodLabel = periodLabelMap[period];
      const safeUnitIds = (Array.isArray(nextContexto.armRelUnitIds) ? nextContexto.armRelUnitIds : allPermittedUnitIds).filter(
        (id: string) => allPermittedUnitIds.includes(id)
      );
      const unitLabel = String(nextContexto.armRelUnitLabel || 'Unidades');

      const data = await findArmariaCautelasByPeriod(pool, period, safeUnitIds);
      const total = data.armas.length + data.municoes.length + data.materiais.length;

      if (total === 0) {
        replies.push({
          kind: 'buttons',
          header: `Relatório Armaria — ${periodLabel}`,
          body: `Nenhuma cautela de armas, munições ou materiais foi registrada no período *${periodLabel}* para *${unitLabel}*.`,
          buttons: [
            { id: 'ARM_RELATORIOS', title: 'Outro Período' },
            { id: 'MENU_ARMARIA', title: 'Menu Armaria' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      } else {
        const { buffer, filename } = await generateArmariaCautelasReportPdf(
          data,
          unitLabel,
          periodLabel,
          `${unitLabel}_${period}`
        );
        const token = createSignedPdfToken(
          { scope: 'arm_report', period, unitIds: safeUnitIds, unitLabel },
          options.signingKey
        );
        const caption = `Relatório de Cautelas (${periodLabel}) • ${unitLabel} • Armas: ${data.armas.length} | Munições: ${data.municoes.length} | Materiais: ${data.materiais.length}`;
        replies.push({
          kind: 'document',
          header: `PDF — Relatório Armaria (${periodLabel})`,
          body: caption,
          documentFilename: filename,
          documentCaption: caption,
          documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
          documentBuffer: buffer
        });
        replies.push({
          kind: 'buttons',
          body: 'Relatório consolidado enviado em PDF! Deseja outra consulta?',
          buttons: [
            { id: 'ARM_RELATORIOS', title: 'Outro Relatório' },
            { id: 'MENU_ARMARIA', title: 'Menu Armaria' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      }
      nextEtapa = 'ARMARIA_MENU';
    }
  }
  // --- ENTRADAS DIGITADAS PELO USUÁRIO (DATAS, BUSCA DE USUÁRIO PARA RECIBO, NÚMEROS) ---
  else if (session.etapa === 'AGUARDANDO_VALOR_DATA') {
    if (ensureAuthenticatedUser()) {
      const mod: 'OP' | 'TR' = session.contexto?.modulo === 'TR' ? 'TR' : 'OP';
      const gran: 'DIA' | 'MES' | 'ANO' =
        session.contexto?.granularity === 'MES' || session.contexto?.granularity === 'ANO'
          ? session.contexto.granularity
          : 'DIA';
      const parsed = parseUserDate(gran, rawText);
      if (parsed) {
        askUnitBeforeReport({
          modulo: mod,
          mode: 'POR_DATA',
          granularity: gran,
          isoFilter: parsed.iso,
          displayFilter: parsed.display
        });
      } else {
        const fmt =
          gran === 'DIA' ? 'DD/MM/AAAA (ex: 24/11/2026)' : gran === 'MES' ? 'MM/AAAA (ex: 11/2026)' : 'AAAA (ex: 2026)';
        replies.push({
          kind: 'buttons',
          header: 'Formato de data inválido',
          body: `Informe a data no formato *${fmt}* ou clique abaixo para alterar o filtro:`,
          buttons: [
            { id: `MOD_POR_DATA::${mod}`, title: 'Trocar Filtro' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        });
      }
    }
  } else if (session.etapa === 'ARMARIA_RECIBOS_ESCOLHER_USUARIO' && rawText) {
    if (ensureAuthenticatedUser()) {
      const unitId = String(session.contexto?.recUnitId || permittedUnits[0]?.id || '');
      const unitLabel = String(session.contexto?.recUnitLabel || permittedUnits[0]?.shortName || '');
      await showUsersOfUnitForReceipts(unitId, unitLabel, rawText);
    }
  } else if (session.etapa === 'SELECIONAR_RELATORIO_PDF' && /^\d+$/.test(normText)) {
    if (ensureAuthenticatedUser()) {
      const idx = Number(normText) - 1;
      const items = Array.isArray(session.contexto?.items) ? session.contexto.items : [];
      const chosen = items[idx];
      const mod: 'OP' | 'TR' = session.contexto?.modulo === 'TR' ? 'TR' : 'OP';
      if (chosen?.id && chosen?.origem) {
        return processWhatsappBotInteraction(
          pool,
          cfgRow,
          { fromPhone: phone, buttonId: `MOD_PDF_ONE::${mod}::${chosen.origem}::${chosen.id}` },
          options
        );
      }
      replies.push({
        kind: 'buttons',
        body: `Número inválido. Escolha na lista ou digite um número entre 1 e ${items.length}.`,
        buttons: [{ id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }]
      });
    }
  } else {
    nextEtapa = 'MENU_PRINCIPAL';
    nextContexto = {};
    replies.push(buildMainMenuReply(resolvedUser));
  }

  await saveSession(pool, phone, nextEtapa, nextContexto);

  if (!options.dryRun) {
    await dispatchBotRepliesToMeta(pool, cfgRow, phone, replies, options.decryptSecret);
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
