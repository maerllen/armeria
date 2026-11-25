import crypto from 'crypto';
import {
  OperacaoOrigem,
  TreinamentoOrigem,
  ReciboTipo,
  ArmariaPeriodo,
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
  generateArmariaCautelasReportPdf,
  formatIsoDateBr,
  formatIsoDateTimeBr
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

function phonesMatch(a: string, b: string): boolean {
  const d1 = normalizePhoneDigits(a);
  const d2 = normalizePhoneDigits(b);
  if (d1.length < 8 || d2.length < 8) return false;
  if (d1 === d2) return true;
  const strip55 = (s: string) => (s.startsWith('55') && s.length >= 12 ? s.slice(2) : s);
  const n1 = strip55(d1);
  const n2 = strip55(d2);
  if (n1 === n2) return true;
  if (n1.length >= 10 && n2.length >= 10) {
    return n1.slice(0, 2) === n2.slice(0, 2) && n1.slice(-8) === n2.slice(-8);
  }
  return n1.slice(-8) === n2.slice(-8);
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

function parseUserDateInput(
  granularity: 'DIA' | 'MES' | 'ANO',
  raw: string
): { iso: string; display: string } | null {
  const clean = String(raw || '').trim();
  if (granularity === 'DIA') {
    let m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3];
      if (Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
        return { iso: `${yyyy}-${mm}-${dd}`, display: `${dd}/${mm}/${yyyy}` };
      }
    }
    m = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = m[2].padStart(2, '0');
      const dd = m[3].padStart(2, '0');
      if (Number(dd) >= 1 && Number(dd) <= 31 && Number(mm) >= 1 && Number(mm) <= 12) {
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
  const clean = String(phone || '').trim().slice(0, 32);
  await saveSession(pool, clean, 'INICIO', {});
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
// CONSTRUTORES DE MENUS INTERATIVOS — CENTRAL OPERACIONAL PCMG
// ============================================================================
function buildMainMenuReply(user?: ResolvedWhatsappUser | null): BotReplyItem {
  const firstName = user?.name ? user.name.split(/\s+/)[0] : '';
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';
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

function buildModuloSubMenuReply(modulo: 'OP' | 'TR'): BotReplyItem {
  const label = modulo === 'OP' ? 'Operações' : 'Treinamentos';
  return {
    kind: 'buttons',
    header: `${label} — Relatórios`,
    body:
      `Selecione como deseja consultar os relatórios de *${label}*:\n\n` +
      `• *Relatórios Por data* — filtrar por dia, mês ou ano\n` +
      `• *Relat. últimas 24h* — registros das últimas 24 horas`,
    footer: 'Escolha uma opção abaixo',
    buttons: [
      { id: `${modulo}_POR_DATA`, title: 'Relatórios Por data' },
      { id: `${modulo}_24H`, title: 'Relat. últimas 24h' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildGranularityReply(modulo: 'OP' | 'TR'): BotReplyItem {
  const label = modulo === 'OP' ? 'Operações' : 'Treinamentos';
  return {
    kind: 'buttons',
    header: `${label} — Por data`,
    body: `Como deseja filtrar a data dos relatórios de *${label}*?`,
    footer: 'Escolha o formato de período',
    buttons: [
      { id: `${modulo}_GRAN::DIA`, title: 'DIA/MÊS/ANO' },
      { id: `${modulo}_GRAN::MES`, title: 'MÊS/ANO' },
      { id: `${modulo}_GRAN::ANO`, title: 'ANO' }
    ]
  };
}

function buildArmariaMenuReply(): BotReplyItem {
  return {
    kind: 'list',
    header: 'Armaria — PCMG',
    body: 'Selecione abaixo o serviço de *Armaria* que deseja acessar:',
    footer: 'Sessões temporárias, recibos e relatórios',
    listButtonText: 'Opções da Armaria',
    listRows: [
      { id: 'ARM_SOLICITAR', title: 'Solicitar Cautelas', description: 'Abrir link seguro para solicitar cautela' },
      { id: 'ARM_DEVOLVER', title: 'Devolver Cautelas', description: 'Abrir link seguro para devolver cautelas ativas' },
      { id: 'ARM_RECIBOS', title: 'Recibos', description: 'Baixar PDF de recibos (Armas, Munições, Materiais)' },
      { id: 'ARM_RELATORIOS', title: 'Relatórios', description: 'Gerar PDF consolidado de cautelas por período' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
    ]
  };
}

function buildArmariaReciboCategoriaReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Armaria — Recibos',
    body: 'De qual categoria deseja consultar os recibos de cautela?',
    footer: 'Armas, Munições ou Materiais',
    buttons: [
      { id: 'REC_CAT::ARMAS', title: 'Armas' },
      { id: 'REC_CAT::MUNICOES', title: 'Munições' },
      { id: 'REC_CAT::MATERIAIS', title: 'Materiais' }
    ]
  };
}

function buildArmariaPeriodoReply(unitLabel: string): BotReplyItem {
  return {
    kind: 'list',
    header: truncateText(`Relatório Armaria — ${unitLabel}`, 60),
    body: `Unidade selecionada: *${unitLabel}*.\nEscolha o período para gerar o relatório consolidado de cautelas em PDF:`,
    footer: 'Armas, Munições e Materiais',
    listButtonText: 'Escolher Período',
    listRows: [
      { id: 'ARM_PER::24H', title: 'Últimas 24h', description: 'Movimentações das últimas 24 horas' },
      { id: 'ARM_PER::SEMANA', title: 'Última semana', description: 'Movimentações dos últimos 7 dias' },
      { id: 'ARM_PER::MES_ATUAL', title: 'Mês atual', description: 'Todas as cautelas do mês vigente' },
      { id: 'ARM_PER::ANO_ATUAL', title: 'Ano atual', description: 'Todas as cautelas do ano vigente' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
    ]
  };
}

function buildEscolherUnidadeListReply(params: {
  permittedUnits: PermittedUnit[];
  header: string;
  body: string;
  actionPrefix: string;
  includeAllIfMultiple?: boolean;
}): BotReplyItem {
  const rows: BotListRow[] = [];
  const allowAll = (params.includeAllIfMultiple ?? true) && params.permittedUnits.length > 1;
  if (allowAll) {
    rows.push({
      id: `${params.actionPrefix}::TODAS`,
      title: 'Todas as Unidades',
      description: truncateText(`Consultar todas as ${params.permittedUnits.length} unidades permitidas`, 72)
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
    description: 'Retornar ao menu principal'
  });

  return {
    kind: 'list',
    header: truncateText(params.header, 60),
    body: params.body,
    footer: 'Unidades disponíveis no seu perfil',
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
// AUXILIARES DE FLUXO (Operações, Treinamentos e Armaria)
// ============================================================================
function resolveUnitSelection(
  user: ResolvedWhatsappUser,
  unitChoice: string
): { unitIds: string[]; unitLabel: string } | null {
  if (unitChoice === 'TODAS') {
    if (user.permittedUnits.length === 0) return null;
    return {
      unitIds: user.permittedUnits.map(u => u.id),
      unitLabel: 'Todas as Unidades'
    };
  }
  const found = user.permittedUnits.find(u => u.id === unitChoice);
  if (!found) return null;
  return {
    unitIds: [found.id],
    unitLabel: found.shortName || found.name
  };
}

function buildDownloadUrl(token: string, publicBaseUrl?: string): string {
  const base = (publicBaseUrl || '').replace(/\/+$/, '');
  return `${base}/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`;
}

async function sendReportsForDateStep(params: {
  pool: any;
  modulo: 'OP' | 'TR';
  granularity: 'DIA' | 'MES' | 'ANO';
  isoFilter: string;
  displayDate: string;
  unitIds: string[];
  unitLabel: string;
  signingKey: Buffer;
  publicBaseUrl?: string;
}): Promise<{ nextEtapa: string; nextCtx: any; replies: BotReplyItem[] }> {
  const { pool, modulo, granularity, isoFilter, displayDate, unitIds, unitLabel, signingKey, publicBaseUrl } = params;

  if (modulo === 'OP') {
    const reports = await findOperationReportsByDate(pool, granularity, isoFilter, unitIds);
    if (reports.length === 0) {
      return {
        nextEtapa: 'MENU_PRINCIPAL',
        nextCtx: {},
        replies: [
          {
            kind: 'text',
            body: `Nenhum relatório de *Operação* encontrado para *${displayDate}* (${unitLabel}).`
          },
          buildMainMenuReply(null)
        ]
      };
    }

    if (reports.length === 1) {
      const rep = reports[0];
      const pdf = await generateSingleOperationReportPdf(rep);
      const token = createSignedPdfToken(
        { scope: 'op_single', origem: rep.origem, id: rep.id, unitIds, unitLabel },
        signingKey
      );
      return {
        nextEtapa: 'MENU_PRINCIPAL',
        nextCtx: {},
        replies: [
          {
            kind: 'document',
            body: `Relatório de Operação (${rep.unidadeNome}) — ${formatIsoDateBr(rep.dataOperacao)} • ${rep.municipio}/${rep.estado}`,
            documentFilename: pdf.filename,
            documentCaption: `Operação • ${rep.unidadeNome} • ${formatIsoDateBr(rep.dataOperacao)}`,
            documentDownloadUrl: buildDownloadUrl(token, publicBaseUrl),
            documentBuffer: pdf.buffer
          },
          buildMainMenuReply(null)
        ]
      };
    }

    const rows: BotListRow[] = [
      {
        id: `OP_PDF_ALL::${granularity}::${isoFilter}`,
        title: `Baixar Todos (${reports.length})`,
        description: truncateText(`PDF consolidado com todos os ${reports.length} relatórios de ${displayDate}`, 72)
      },
      ...reports.slice(0, 8).map(r => ({
        id: `OP_PDF_ONE::${r.origem}::${r.id}`,
        title: truncateText(`${formatIsoDateBr(r.dataOperacao)} ${shortenUnitName(r.unidadeNome)}`, 24),
        description: truncateText(`${r.municipio}/${r.estado} — ${r.criadorNome || r.origemLabel}`, 72)
      })),
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
    ];

    return {
      nextEtapa: 'OP_ESCOLHER_RELATORIO',
      nextCtx: { modulo: 'OP', granularity, isoFilter, displayDate, unitIds, unitLabel },
      replies: [
        {
          kind: 'list',
          header: truncateText(`Operações — ${displayDate}`, 60),
          body: `Foram encontrados *${reports.length} relatório(s)* em *${unitLabel}*.\nSelecione um relatório específico ou baixe o PDF consolidado:`,
          footer: 'PDF gerado em tempo real',
          listButtonText: 'Escolher Relatório',
          listRows: rows
        }
      ]
    };
  }

  // TREINAMENTOS
  const reports = await findTrainingReportsByDate(pool, granularity, isoFilter, unitIds);
  if (reports.length === 0) {
    return {
      nextEtapa: 'MENU_PRINCIPAL',
      nextCtx: {},
      replies: [
        {
          kind: 'text',
          body: `Nenhum relatório de *Treinamento* encontrado para *${displayDate}* (${unitLabel}).`
        },
        buildMainMenuReply(null)
      ]
    };
  }

  if (reports.length === 1) {
    const rep = reports[0];
    const pdf = await generateSingleTrainingReportPdf(rep);
    const token = createSignedPdfToken(
      { scope: 'tr_single', origem: rep.origem, id: rep.id, unitIds, unitLabel },
      signingKey
    );
    return {
      nextEtapa: 'MENU_PRINCIPAL',
      nextCtx: {},
      replies: [
        {
          kind: 'document',
          body: `Relatório de Treinamento (${rep.unidadeNome}) — ${formatIsoDateBr(rep.dataTreinamento)} • ${rep.titulo}`,
          documentFilename: pdf.filename,
          documentCaption: `Treinamento • ${rep.unidadeNome} • ${formatIsoDateBr(rep.dataTreinamento)}`,
          documentDownloadUrl: buildDownloadUrl(token, publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(null)
      ]
    };
  }

  const rows: BotListRow[] = [
    {
      id: `TR_PDF_ALL::${granularity}::${isoFilter}`,
      title: `Baixar Todos (${reports.length})`,
      description: truncateText(`PDF consolidado com todos os ${reports.length} treinamentos de ${displayDate}`, 72)
    },
    ...reports.slice(0, 8).map(r => ({
      id: `TR_PDF_ONE::${r.origem}::${r.id}`,
      title: truncateText(`${formatIsoDateBr(r.dataTreinamento)} ${shortenUnitName(r.unidadeNome)}`, 24),
      description: truncateText(`${r.titulo} — ${r.responsavelNome}`, 72)
    })),
    { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
  ];

  return {
    nextEtapa: 'TR_ESCOLHER_RELATORIO',
    nextCtx: { modulo: 'TR', granularity, isoFilter, displayDate, unitIds, unitLabel },
    replies: [
      {
        kind: 'list',
        header: truncateText(`Treinamentos — ${displayDate}`, 60),
        body: `Foram encontrados *${reports.length} treinamento(s)* em *${unitLabel}*.\nSelecione um relatório específico ou baixe o PDF consolidado:`,
        footer: 'PDF gerado em tempo real',
        listButtonText: 'Escolher Treinamento',
        listRows: rows
      }
    ]
  };
}

async function sendLast24hStep(params: {
  pool: any;
  modulo: 'OP' | 'TR';
  unitIds: string[];
  unitLabel: string;
  signingKey: Buffer;
  publicBaseUrl?: string;
}): Promise<{ nextEtapa: string; nextCtx: any; replies: BotReplyItem[] }> {
  const { pool, modulo, unitIds, unitLabel, signingKey, publicBaseUrl } = params;

  if (modulo === 'OP') {
    const reps = await findOperationReportsLast24h(pool, unitIds);
    if (reps.length === 0) {
      return {
        nextEtapa: 'MENU_PRINCIPAL',
        nextCtx: {},
        replies: [
          { kind: 'text', body: `Nenhum relatório de *Operação* registrado nas últimas 24 horas (${unitLabel}).` },
          buildMainMenuReply(null)
        ]
      };
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const pdf = await generateMultipleOperationsPdf(
      reps,
      `RELATORIOS DE OPERACOES — ULTIMAS 24H (${unitLabel})`,
      `Ultimas_24h_${unitLabel}_${todayIso}`
    );
    const token = createSignedPdfToken({ scope: 'op_last24h', unitIds, unitLabel }, signingKey);
    return {
      nextEtapa: 'MENU_PRINCIPAL',
      nextCtx: {},
      replies: [
        {
          kind: 'document',
          body: `PDF gerado com *${reps.length} relatório(s)* de Operações das últimas 24h (${unitLabel}).`,
          documentFilename: pdf.filename,
          documentCaption: `Operações • Últimas 24h (${unitLabel})`,
          documentDownloadUrl: buildDownloadUrl(token, publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(null)
      ]
    };
  }

  const reps = await findTrainingReportsLast24h(pool, unitIds);
  if (reps.length === 0) {
    return {
      nextEtapa: 'MENU_PRINCIPAL',
      nextCtx: {},
      replies: [
        { kind: 'text', body: `Nenhum relatório de *Treinamento* registrado nas últimas 24 horas (${unitLabel}).` },
        buildMainMenuReply(null)
      ]
    };
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const pdf = await generateMultipleTrainingsPdf(
    reps,
    `RELATORIOS DE TREINAMENTOS — ULTIMAS 24H (${unitLabel})`,
    `Ultimas_24h_${unitLabel}_${todayIso}`
  );
  const token = createSignedPdfToken({ scope: 'tr_last24h', unitIds, unitLabel }, signingKey);
  return {
    nextEtapa: 'MENU_PRINCIPAL',
    nextCtx: {},
    replies: [
      {
        kind: 'document',
        body: `PDF gerado com *${reps.length} relatório(s)* de Treinamentos das últimas 24h (${unitLabel}).`,
        documentFilename: pdf.filename,
        documentCaption: `Treinamentos • Últimas 24h (${unitLabel})`,
        documentDownloadUrl: buildDownloadUrl(token, publicBaseUrl),
        documentBuffer: pdf.buffer
      },
      buildMainMenuReply(null)
    ]
  };
}

async function promptAvailableDatesStep(params: {
  pool: any;
  modulo: 'OP' | 'TR';
  granularity: 'DIA' | 'MES' | 'ANO';
  unitIds: string[];
  unitLabel: string;
}): Promise<{ nextEtapa: string; nextCtx: any; replies: BotReplyItem[] }> {
  const { pool, modulo, granularity, unitIds, unitLabel } = params;
  const modLabel = modulo === 'OP' ? 'Operações' : 'Treinamentos';
  const dates =
    modulo === 'OP'
      ? await listAvailableOperationDates(pool, granularity, unitIds)
      : await listAvailableTrainingDates(pool, granularity, unitIds);

  const fmtHint = granularity === 'DIA' ? 'DD/MM/AAAA' : granularity === 'MES' ? 'MM/AAAA' : 'AAAA';
  const nextEtapa = `${modulo}_AGUARDANDO_DATA`;
  const nextCtx = { modulo, granularity, unitIds, unitLabel };

  if (dates.length === 0) {
    return {
      nextEtapa,
      nextCtx,
      replies: [
        {
          kind: 'text',
          body:
            `Não há datas recentes encontradas para *${modLabel}* (${unitLabel}).\n` +
            `Você pode digitar manualmente no formato *${fmtHint}* ou digitar *menu* para voltar.`
        }
      ]
    };
  }

  const rows: BotListRow[] = [
    ...dates.slice(0, 9).map(d => ({
      id: `${modulo}_PICK_DATE::${d.value}`,
      title: truncateText(d.label, 24),
      description: `${d.count} registro(s) disponível(is)`
    })),
    { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
  ];

  return {
    nextEtapa,
    nextCtx,
    replies: [
      {
        kind: 'list',
        header: truncateText(`${modLabel} — ${unitLabel}`, 60),
        body: `Selecione uma data abaixo ou digite manualmente no formato *${fmtHint}*:`,
        footer: 'Datas com registros encontrados',
        listButtonText: 'Selecionar Data',
        listRows: rows
      }
    ]
  };
}

async function listReceiptsForTargetUser(params: {
  pool: any;
  tipo: ReciboTipo;
  targetUser: { id: string; name: string; masp: string };
  unitIds?: string[];
}): Promise<{ nextEtapa: string; nextCtx: any; replies: BotReplyItem[] }> {
  const { pool, tipo, targetUser, unitIds } = params;
  const receipts = await listArmariaReceipts(pool, tipo, targetUser, unitIds);
  const tipoLabel = tipo === 'ARMAS' ? 'Armas' : tipo === 'MUNICOES' ? 'Munições' : 'Materiais';

  if (receipts.length === 0) {
    return {
      nextEtapa: 'MENU_PRINCIPAL',
      nextCtx: {},
      replies: [
        {
          kind: 'text',
          body: `Nenhum recibo de *${tipoLabel}* encontrado para *${targetUser.name}*.`
        },
        buildMainMenuReply(null)
      ]
    };
  }

  const rows: BotListRow[] = [
    ...receipts.slice(0, 9).map(rec => ({
      id: `REC_PDF::${tipo}::${rec.id}`,
      title: truncateText(`${rec.itemTitulo}`, 24),
      description: truncateText(`${rec.status} • ${formatIsoDateTimeBr(rec.dataSolicitacao)}`, 72)
    })),
    { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
  ];

  return {
    nextEtapa: 'ARM_RECIBO_ESCOLHER',
    nextCtx: { tipo, targetUser },
    replies: [
      {
        kind: 'list',
        header: truncateText(`Recibos — ${tipoLabel}`, 60),
        body: `Recibos recentes de *${tipoLabel}* para *${targetUser.name}*.\nSelecione o recibo para receber o PDF:`,
        footer: 'Toque para emitir o PDF',
        listButtonText: 'Escolher Recibo',
        listRows: rows
      }
    ]
  };
}

// ============================================================================
// MOTOR PRINCIPAL DA MÁQUINA DE ESTADOS — CENTRAL OPERACIONAL PCMG
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
  const sessionKey = String(input.fromPhone || '').trim().slice(0, 32);
  const rawPhoneDigits = normalizePhoneDigits(input.fromPhone);
  const actionId = String(input.buttonId || input.listRowId || '').trim();
  const rawText = String(input.text || input.buttonTitle || input.listRowTitle || '').trim();
  const norm = normalizeText(rawText);

  const user = await resolveWhatsappUserContext(pool, input.fromPhone, options.forcedUserId);
  if (!user) {
    const replies: BotReplyItem[] = [
      {
        kind: 'text',
        body:
          '⚠️ Seu número de WhatsApp não foi localizado em nenhum usuário ativo do sistema.\n\n' +
          'Verifique com o administrador da sua unidade se o seu telefone está cadastrado corretamente no seu perfil.'
      }
    ];
    if (!options.dryRun && rawPhoneDigits) {
      await dispatchBotRepliesToMeta(pool, cfgRow, rawPhoneDigits, replies, options.decryptSecret);
    }
    return { etapaAtual: 'NAO_AUTORIZADO', replies, resolvedUser: null };
  }

  const resolvedUserSummary = {
    id: user.id,
    name: user.name,
    role: user.role,
    unitsCount: user.permittedUnits.length
  };

  const session = await getSession(pool, sessionKey);
  let etapa = session.etapa || 'INICIO';
  let ctx = session.contexto || {};
  let replies: BotReplyItem[] = [];
  let nextEtapa = etapa;
  let nextCtx = ctx;

  const isMenuCommand =
    actionId === 'VOLTAR_MENU' ||
    ['menu', 'inicio', 'voltar', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ajuda', 'start', '0'].includes(
      norm
    );

  // 1. MENU PRINCIPAL / SAUDAÇÃO
  if (isMenuCommand || (etapa === 'INICIO' && !actionId)) {
    nextEtapa = 'MENU_PRINCIPAL';
    nextCtx = {};
    replies = [buildMainMenuReply(user)];
  }
  // 2. OPÇÕES DO MENU PRINCIPAL
  else if (actionId === 'MENU_OPERACOES' || (etapa === 'MENU_PRINCIPAL' && norm.includes('operac'))) {
    nextEtapa = 'OP_MENU';
    nextCtx = { modulo: 'OP' };
    replies = [buildModuloSubMenuReply('OP')];
  } else if (actionId === 'MENU_TREINAMENTOS' || (etapa === 'MENU_PRINCIPAL' && norm.includes('trein'))) {
    nextEtapa = 'TR_MENU';
    nextCtx = { modulo: 'TR' };
    replies = [buildModuloSubMenuReply('TR')];
  } else if (actionId === 'MENU_ARMARIA' || (etapa === 'MENU_PRINCIPAL' && norm.includes('armar'))) {
    nextEtapa = 'ARM_MENU';
    nextCtx = {};
    replies = [buildArmariaMenuReply()];
  }
  // 3. OPERAÇÕES / TREINAMENTOS — POR DATA ou 24H
  else if (actionId === 'OP_POR_DATA' || actionId === 'TR_POR_DATA') {
    const modulo = actionId.startsWith('OP_') ? 'OP' : 'TR';
    nextEtapa = `${modulo}_GRANULARIDADE`;
    nextCtx = { modulo };
    replies = [buildGranularityReply(modulo)];
  } else if (actionId === 'OP_24H' || actionId === 'TR_24H') {
    const modulo = actionId.startsWith('OP_') ? 'OP' : 'TR';
    if (user.permittedUnits.length === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        { kind: 'text', body: 'Você não possui unidade vinculada ao seu perfil para consultar relatórios.' },
        buildMainMenuReply(user)
      ];
    } else if (user.permittedUnits.length === 1) {
      const only = user.permittedUnits[0];
      const step = await sendLast24hStep({
        pool,
        modulo,
        unitIds: [only.id],
        unitLabel: only.shortName,
        signingKey: options.signingKey,
        publicBaseUrl: options.publicBaseUrl
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    } else {
      nextEtapa = `${modulo}_24H_UNIDADE`;
      nextCtx = { modulo };
      replies = [
        buildEscolherUnidadeListReply({
          permittedUnits: user.permittedUnits,
          header: modulo === 'OP' ? 'Operações — Últimas 24h' : 'Treinamentos — Últimas 24h',
          body: 'Qual unidade deseja consultar nas últimas 24 horas?',
          actionPrefix: `${modulo}_24H_UNIT`
        })
      ];
    }
  } else if (actionId.startsWith('OP_24H_UNIT::') || actionId.startsWith('TR_24H_UNIT::')) {
    const modulo = actionId.startsWith('OP_') ? 'OP' : 'TR';
    const choice = actionId.split('::')[1] || '';
    const resolved = resolveUnitSelection(user, choice);
    if (!resolved) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Unidade inválida ou sem permissão.' }, buildMainMenuReply(user)];
    } else {
      const step = await sendLast24hStep({
        pool,
        modulo,
        unitIds: resolved.unitIds,
        unitLabel: resolved.unitLabel,
        signingKey: options.signingKey,
        publicBaseUrl: options.publicBaseUrl
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    }
  } else if (actionId.startsWith('OP_GRAN::') || actionId.startsWith('TR_GRAN::')) {
    const modulo = actionId.startsWith('OP_') ? 'OP' : 'TR';
    const granularity = (actionId.split('::')[1] || 'DIA') as 'DIA' | 'MES' | 'ANO';
    if (user.permittedUnits.length === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        { kind: 'text', body: 'Você não possui unidade vinculada ao seu perfil para consultar relatórios.' },
        buildMainMenuReply(user)
      ];
    } else if (user.permittedUnits.length === 1) {
      const only = user.permittedUnits[0];
      const step = await promptAvailableDatesStep({
        pool,
        modulo,
        granularity,
        unitIds: [only.id],
        unitLabel: only.shortName
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    } else {
      nextEtapa = `${modulo}_DATA_UNIDADE`;
      nextCtx = { modulo, granularity };
      replies = [
        buildEscolherUnidadeListReply({
          permittedUnits: user.permittedUnits,
          header: modulo === 'OP' ? 'Operações — Unidade' : 'Treinamentos — Unidade',
          body: 'Qual unidade deseja consultar?',
          actionPrefix: `${modulo}_DATA_UNIT`
        })
      ];
    }
  } else if (actionId.startsWith('OP_DATA_UNIT::') || actionId.startsWith('TR_DATA_UNIT::')) {
    const modulo = actionId.startsWith('OP_') ? 'OP' : 'TR';
    const choice = actionId.split('::')[1] || '';
    const granularity = (ctx.granularity || 'DIA') as 'DIA' | 'MES' | 'ANO';
    const resolved = resolveUnitSelection(user, choice);
    if (!resolved) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Unidade inválida ou sem permissão.' }, buildMainMenuReply(user)];
    } else {
      const step = await promptAvailableDatesStep({
        pool,
        modulo,
        granularity,
        unitIds: resolved.unitIds,
        unitLabel: resolved.unitLabel
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    }
  } else if (actionId.startsWith('OP_PICK_DATE::') || actionId.startsWith('TR_PICK_DATE::')) {
    const modulo = actionId.startsWith('OP_') ? 'OP' : 'TR';
    const isoFilter = actionId.split('::')[1] || '';
    const granularity = (ctx.granularity || 'DIA') as 'DIA' | 'MES' | 'ANO';
    const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
    const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
    const displayDate = granularity === 'DIA' ? formatIsoDateBr(isoFilter) : isoFilter;
    const step = await sendReportsForDateStep({
      pool,
      modulo,
      granularity,
      isoFilter,
      displayDate,
      unitIds,
      unitLabel,
      signingKey: options.signingKey,
      publicBaseUrl: options.publicBaseUrl
    });
    nextEtapa = step.nextEtapa;
    nextCtx = step.nextCtx;
    replies = step.replies;
  } else if ((etapa === 'OP_AGUARDANDO_DATA' || etapa === 'TR_AGUARDANDO_DATA') && rawText && !actionId) {
    const modulo = etapa.startsWith('OP_') ? 'OP' : 'TR';
    const granularity = (ctx.granularity || 'DIA') as 'DIA' | 'MES' | 'ANO';
    const parsed = parseUserDateInput(granularity, rawText);
    if (!parsed) {
      const fmt = granularity === 'DIA' ? 'DD/MM/AAAA' : granularity === 'MES' ? 'MM/AAAA' : 'AAAA';
      replies = [{ kind: 'text', body: `Formato de data inválido. Digite no formato *${fmt}* ou digite *menu* para voltar.` }];
    } else {
      const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
      const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
      const step = await sendReportsForDateStep({
        pool,
        modulo,
        granularity,
        isoFilter: parsed.iso,
        displayDate: parsed.display,
        unitIds,
        unitLabel,
        signingKey: options.signingKey,
        publicBaseUrl: options.publicBaseUrl
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    }
  } else if (actionId.startsWith('OP_PDF_ALL::')) {
    const [, gran, isoFilter] = actionId.split('::');
    const granularity = (gran || 'DIA') as 'DIA' | 'MES' | 'ANO';
    const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
    const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
    const reps = await findOperationReportsByDate(pool, granularity, isoFilter, unitIds);
    if (reps.length === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Nenhum relatório encontrado.' }, buildMainMenuReply(user)];
    } else {
      const display = granularity === 'DIA' ? formatIsoDateBr(isoFilter) : isoFilter;
      const pdf = await generateMultipleOperationsPdf(
        reps,
        `RELATORIOS DE OPERACOES — ${display} (${unitLabel})`,
        `${granularity}_${isoFilter}_${unitLabel}`
      );
      const token = createSignedPdfToken(
        { scope: 'op_period', granularity, isoFilter, unitIds, unitLabel },
        options.signingKey
      );
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'document',
          body: `PDF consolidado com *${reps.length} operação(ões)* (${display} • ${unitLabel}).`,
          documentFilename: pdf.filename,
          documentCaption: `Operações • ${display} (${unitLabel})`,
          documentDownloadUrl: buildDownloadUrl(token, options.publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(user)
      ];
    }
  } else if (actionId.startsWith('OP_PDF_ONE::')) {
    const [, origem, id] = actionId.split('::');
    const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
    const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
    const rep = await findSingleOperationReport(pool, origem as OperacaoOrigem, id);
    if (!rep) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Relatório de operação não encontrado.' }, buildMainMenuReply(user)];
    } else {
      const pdf = await generateSingleOperationReportPdf(rep);
      const token = createSignedPdfToken(
        { scope: 'op_single', origem: rep.origem, id: rep.id, unitIds, unitLabel },
        options.signingKey
      );
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'document',
          body: `Relatório de Operação (${rep.unidadeNome}) — ${formatIsoDateBr(rep.dataOperacao)}.`,
          documentFilename: pdf.filename,
          documentCaption: `Operação • ${rep.unidadeNome}`,
          documentDownloadUrl: buildDownloadUrl(token, options.publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(user)
      ];
    }
  } else if (actionId.startsWith('TR_PDF_ALL::')) {
    const [, gran, isoFilter] = actionId.split('::');
    const granularity = (gran || 'DIA') as 'DIA' | 'MES' | 'ANO';
    const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
    const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
    const reps = await findTrainingReportsByDate(pool, granularity, isoFilter, unitIds);
    if (reps.length === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Nenhum relatório de treinamento encontrado.' }, buildMainMenuReply(user)];
    } else {
      const display = granularity === 'DIA' ? formatIsoDateBr(isoFilter) : isoFilter;
      const pdf = await generateMultipleTrainingsPdf(
        reps,
        `RELATORIOS DE TREINAMENTOS — ${display} (${unitLabel})`,
        `${granularity}_${isoFilter}_${unitLabel}`
      );
      const token = createSignedPdfToken(
        { scope: 'tr_period', granularity, isoFilter, unitIds, unitLabel },
        options.signingKey
      );
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'document',
          body: `PDF consolidado com *${reps.length} treinamento(s)* (${display} • ${unitLabel}).`,
          documentFilename: pdf.filename,
          documentCaption: `Treinamentos • ${display} (${unitLabel})`,
          documentDownloadUrl: buildDownloadUrl(token, options.publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(user)
      ];
    }
  } else if (actionId.startsWith('TR_PDF_ONE::')) {
    const [, origem, id] = actionId.split('::');
    const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
    const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
    const rep = await findSingleTrainingReport(pool, origem as TreinamentoOrigem, id);
    if (!rep) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Relatório de treinamento não encontrado.' }, buildMainMenuReply(user)];
    } else {
      const pdf = await generateSingleTrainingReportPdf(rep);
      const token = createSignedPdfToken(
        { scope: 'tr_single', origem: rep.origem, id: rep.id, unitIds, unitLabel },
        options.signingKey
      );
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'document',
          body: `Relatório de Treinamento (${rep.unidadeNome}) — ${formatIsoDateBr(rep.dataTreinamento)}.`,
          documentFilename: pdf.filename,
          documentCaption: `Treinamento • ${rep.unidadeNome}`,
          documentDownloadUrl: buildDownloadUrl(token, options.publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(user)
      ];
    }
  }
  // 4. ARMARIA — SOLICITAR / DEVOLVER CAUTELAS (LINK TEMPORÁRIO)
  else if (actionId === 'ARM_SOLICITAR' || actionId === 'ARM_DEVOLVER') {
    const tipoFluxo = actionId === 'ARM_SOLICITAR' ? 'SOLICITAR_CAUTELA' : 'DEVOLVER_CAUTELA';
    const created = await createTemporaryWhatsappSession(pool, {
      tipoFluxo,
      userId: user.id,
      fromPhone: rawPhoneDigits || sessionKey
    });
    const base = (options.publicBaseUrl || '').replace(/\/+$/, '');
    const linkUrl = `${base}/?wpp_sessao=${encodeURIComponent(created.rawToken)}`;
    const isDevolucao = tipoFluxo === 'DEVOLVER_CAUTELA';
    nextEtapa = 'MENU_PRINCIPAL';
    nextCtx = {};
    replies = [
      {
        kind: 'link',
        header: isDevolucao ? 'Devolver Cautelas — Sessão Temporária' : 'Solicitar Cautelas — Sessão Temporária',
        body:
          `Sessão autenticada gerada para *${user.name}* (MASP ${user.masp || '—'}).\n` +
          `O link abaixo é pessoal, de uso único e expira em *30 minutos*:`,
        actionUrl: linkUrl,
        actionLabel: isDevolucao ? 'Abrir Portal de Devolução' : 'Abrir Portal de Solicitação'
      },
      buildMainMenuReply(user)
    ];
  }
  // 5. ARMARIA — RECIBOS
  else if (actionId === 'ARM_RECIBOS') {
    nextEtapa = 'ARM_RECIBO_CATEGORIA';
    nextCtx = {};
    replies = [buildArmariaReciboCategoriaReply()];
  } else if (actionId.startsWith('REC_CAT::')) {
    const tipo = (actionId.split('::')[1] || 'ARMAS') as ReciboTipo;
    if (user.isArmeiroOrAdmin) {
      nextEtapa = 'ARM_RECIBO_ESCOPO';
      nextCtx = { tipo };
      replies = [
        {
          kind: 'buttons',
          header: 'Recibos — Escopo de Consulta',
          body: 'Deseja consultar os seus próprios recibos ou os recibos de outro policial da unidade?',
          footer: 'Perfil Armeiro / Administrador',
          buttons: [
            { id: `REC_WHO::ME::${tipo}`, title: 'Meus Recibos' },
            { id: `REC_WHO::OTHER::${tipo}`, title: 'Outro Policial' },
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
          ]
        }
      ];
    } else {
      const step = await listReceiptsForTargetUser({
        pool,
        tipo,
        targetUser: { id: user.id, name: user.name, masp: user.masp }
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    }
  } else if (actionId.startsWith('REC_WHO::ME::')) {
    const tipo = (actionId.split('::')[2] || 'ARMAS') as ReciboTipo;
    const step = await listReceiptsForTargetUser({
      pool,
      tipo,
      targetUser: { id: user.id, name: user.name, masp: user.masp }
    });
    nextEtapa = step.nextEtapa;
    nextCtx = step.nextCtx;
    replies = step.replies;
  } else if (actionId.startsWith('REC_WHO::OTHER::')) {
    const tipo = (actionId.split('::')[2] || 'ARMAS') as ReciboTipo;
    if (user.permittedUnits.length <= 1) {
      const uId = user.permittedUnits[0]?.id || user.unitId;
      const [uRows]: any = await pool.query(
        'SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS FROM USUARIOS WHERE UNIDADE_ID_USUARIOS = ? ORDER BY NOME_USUARIOS ASC LIMIT 9',
        [uId]
      );
      if (!uRows || uRows.length === 0) {
        nextEtapa = 'MENU_PRINCIPAL';
        nextCtx = {};
        replies = [{ kind: 'text', body: 'Nenhum policial encontrado na unidade.' }, buildMainMenuReply(user)];
      } else {
        nextEtapa = 'ARM_RECIBO_ESCOLHER_POLICIAL';
        nextCtx = { tipo, unitId: uId };
        replies = [
          {
            kind: 'list',
            header: 'Selecionar Policial',
            body: 'Escolha o policial para listar os recibos de cautela:',
            footer: 'Policiais da unidade',
            listButtonText: 'Escolher Policial',
            listRows: [
              ...uRows.map((r: any) => ({
                id: `REC_USER::${r.ID_USUARIOS}`,
                title: truncateText(String(r.NOME_USUARIOS || ''), 24),
                description: r.MASP_USUARIOS ? `MASP ${r.MASP_USUARIOS}` : 'Policial'
              })),
              { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
            ]
          }
        ];
      }
    } else {
      nextEtapa = 'ARM_RECIBO_UNIDADE';
      nextCtx = { tipo };
      replies = [
        buildEscolherUnidadeListReply({
          permittedUnits: user.permittedUnits,
          header: 'Recibos — Unidade do Policial',
          body: 'Selecione a unidade do policial:',
          actionPrefix: 'REC_UNIT',
          includeAllIfMultiple: false
        })
      ];
    }
  } else if (actionId.startsWith('REC_UNIT::')) {
    const unitId = actionId.split('::')[1] || '';
    const tipo = (ctx.tipo || 'ARMAS') as ReciboTipo;
    const [uRows]: any = await pool.query(
      'SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS FROM USUARIOS WHERE UNIDADE_ID_USUARIOS = ? ORDER BY NOME_USUARIOS ASC LIMIT 9',
      [unitId]
    );
    if (!uRows || uRows.length === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Nenhum policial encontrado na unidade selecionada.' }, buildMainMenuReply(user)];
    } else {
      nextEtapa = 'ARM_RECIBO_ESCOLHER_POLICIAL';
      nextCtx = { tipo, unitId };
      replies = [
        {
          kind: 'list',
          header: 'Selecionar Policial',
          body: 'Escolha o policial para consultar os recibos:',
          footer: 'Policiais da unidade',
          listButtonText: 'Escolher Policial',
          listRows: [
            ...uRows.map((r: any) => ({
              id: `REC_USER::${r.ID_USUARIOS}`,
              title: truncateText(String(r.NOME_USUARIOS || ''), 24),
              description: r.MASP_USUARIOS ? `MASP ${r.MASP_USUARIOS}` : 'Policial'
            })),
            { id: 'VOLTAR_MENU', title: 'Voltar ao Menu', description: 'Retornar ao menu principal' }
          ]
        }
      ];
    }
  } else if (actionId.startsWith('REC_USER::')) {
    const targetId = actionId.split('::')[1] || '';
    const tipo = (ctx.tipo || 'ARMAS') as ReciboTipo;
    const [rows]: any = await pool.query(
      'SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS FROM USUARIOS WHERE ID_USUARIOS = ? LIMIT 1',
      [targetId]
    );
    const target = rows?.[0];
    if (!target) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Policial não encontrado.' }, buildMainMenuReply(user)];
    } else {
      const step = await listReceiptsForTargetUser({
        pool,
        tipo,
        targetUser: {
          id: String(target.ID_USUARIOS),
          name: String(target.NOME_USUARIOS || ''),
          masp: String(target.MASP_USUARIOS || '')
        },
        unitIds: ctx.unitId ? [ctx.unitId] : undefined
      });
      nextEtapa = step.nextEtapa;
      nextCtx = step.nextCtx;
      replies = step.replies;
    }
  } else if (actionId.startsWith('REC_PDF::')) {
    const [, tipoStr, id] = actionId.split('::');
    const tipo = (tipoStr || 'ARMAS') as ReciboTipo;
    const rec = await findSingleArmariaReceipt(pool, tipo, id);
    if (!rec) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Recibo de cautela não encontrado.' }, buildMainMenuReply(user)];
    } else {
      const pdf = await generateArmariaReceiptPdf(rec);
      const token = createSignedPdfToken({ scope: 'arm_receipt', receiptTipo: tipo, id: rec.id }, options.signingKey);
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'document',
          body: `Recibo emitido: *${rec.itemTitulo}* (${rec.unidadeNome}) • Status: ${rec.status}.`,
          documentFilename: pdf.filename,
          documentCaption: `Recibo • ${rec.itemTitulo}`,
          documentDownloadUrl: buildDownloadUrl(token, options.publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(user)
      ];
    }
  }
  // 6. ARMARIA — RELATÓRIOS CONSOLIDADOS
  else if (actionId === 'ARM_RELATORIOS') {
    if (user.permittedUnits.length === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        { kind: 'text', body: 'Você não possui unidade vinculada ao seu perfil para emitir relatórios da armaria.' },
        buildMainMenuReply(user)
      ];
    } else if (user.permittedUnits.length === 1) {
      const only = user.permittedUnits[0];
      nextEtapa = 'ARM_REL_PERIODO';
      nextCtx = { unitIds: [only.id], unitLabel: only.shortName };
      replies = [buildArmariaPeriodoReply(only.shortName)];
    } else {
      nextEtapa = 'ARM_REL_UNIDADE';
      nextCtx = {};
      replies = [
        buildEscolherUnidadeListReply({
          permittedUnits: user.permittedUnits,
          header: 'Armaria — Unidade do Relatório',
          body: 'Selecione a unidade para o relatório consolidado de cautelas:',
          actionPrefix: 'ARM_REL_UNIT'
        })
      ];
    }
  } else if (actionId.startsWith('ARM_REL_UNIT::')) {
    const choice = actionId.split('::')[1] || '';
    const resolved = resolveUnitSelection(user, choice);
    if (!resolved) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [{ kind: 'text', body: 'Unidade inválida ou sem permissão.' }, buildMainMenuReply(user)];
    } else {
      nextEtapa = 'ARM_REL_PERIODO';
      nextCtx = { unitIds: resolved.unitIds, unitLabel: resolved.unitLabel };
      replies = [buildArmariaPeriodoReply(resolved.unitLabel)];
    }
  } else if (actionId.startsWith('ARM_PER::')) {
    const period = (actionId.split('::')[1] || '24H') as ArmariaPeriodo;
    const unitIds = Array.isArray(ctx.unitIds) ? ctx.unitIds : user.permittedUnits.map(u => u.id);
    const unitLabel = ctx.unitLabel || 'Unidades Permitidas';
    const data = await findArmariaCautelasByPeriod(pool, period, unitIds);
    const totalCount = data.armas.length + data.municoes.length + data.materiais.length;
    if (totalCount === 0) {
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'text',
          body: `Nenhuma movimentação de armaria encontrada no período selecionado (${unitLabel}).`
        },
        buildMainMenuReply(user)
      ];
    } else {
      const periodLabels: Record<ArmariaPeriodo, string> = {
        '24H': 'Últimas 24h',
        SEMANA: 'Última semana',
        MES_ATUAL: 'Mês atual',
        ANO_ATUAL: 'Ano atual'
      };
      const periodLabel = periodLabels[period] || period;
      const todayIso = new Date().toISOString().slice(0, 10);
      const pdf = await generateArmariaCautelasReportPdf(
        data,
        unitLabel,
        periodLabel,
        `${period}_${unitLabel}_${todayIso}`
      );
      const token = createSignedPdfToken({ scope: 'arm_report', period, unitIds, unitLabel }, options.signingKey);
      nextEtapa = 'MENU_PRINCIPAL';
      nextCtx = {};
      replies = [
        {
          kind: 'document',
          body: `Relatório da Armaria (${periodLabel} • ${unitLabel}) — ${totalCount} movimentação(ões).`,
          documentFilename: pdf.filename,
          documentCaption: `Armaria • ${periodLabel} (${unitLabel})`,
          documentDownloadUrl: buildDownloadUrl(token, options.publicBaseUrl),
          documentBuffer: pdf.buffer
        },
        buildMainMenuReply(user)
      ];
    }
  }
  // FALLBACK
  else {
    nextEtapa = 'MENU_PRINCIPAL';
    nextCtx = {};
    replies = [
      { kind: 'text', body: 'Não compreendi a opção selecionada. Retornando ao menu principal:' },
      buildMainMenuReply(user)
    ];
  }

  await saveSession(pool, sessionKey, nextEtapa, nextCtx);

  if (!options.dryRun && rawPhoneDigits) {
    await dispatchBotRepliesToMeta(pool, cfgRow, rawPhoneDigits, replies, options.decryptSecret);
  }

  // Strip internal binary buffers before returning JSON to simulator/API
  const sanitizedReplies = replies.map(({ documentBuffer: _ignored, ...rest }) => rest);

  return {
    etapaAtual: nextEtapa,
    replies: sanitizedReplies,
    resolvedUser: resolvedUserSummary
  };
}
