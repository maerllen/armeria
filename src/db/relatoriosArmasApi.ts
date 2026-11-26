import { Express, Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import { resolveWhatsappUserContext, PermittedUnit, ResolvedWhatsappUser } from './whatsappBotEngine';
import { decryptSecret } from './whatsappRoutes';

interface RelatoriosApiDeps {
  getPool: () => any;
  insertAuditLog: (
    moduleName: string,
    action: string,
    details: string,
    user?: { id?: string; name?: string; masp?: string; role?: string },
    ip?: string
  ) => Promise<void>;
}

const DEFAULT_WHATSAPP_CONFIG_ID = 'default';
const PDF_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'relatorios-pdf');
const PDF_RETENTION_HOURS = Math.max(1, Math.min(168, Number(process.env.RELATORIOS_PDF_TTL_HOURS || 24) || 24));
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 30;
const RATE_LIMIT_MAX_PER_PHONE = 10;

let schemaReady = false;
let lastCleanupAt = 0;

const ipRateBuckets = new Map<string, number[]>();
const phoneRateBuckets = new Map<string, number[]>();

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeKey(val?: string | null): string {
  return String(val || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function sanitizeFileSlug(val: string): string {
  const clean = String(val || 'TODOS')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (clean || 'UNIDADE').slice(0, 48);
}

function sanitizePdfText(input?: string | null): string {
  const s = String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ');
  return s.trim();
}

function formatDateTimeBr(date: Date): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }
}

function checkRateLimit(bucketMap: Map<string, number[]>, key: string, maxRequests: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = (bucketMap.get(key) || []).filter(ts => ts > cutoff);
  if (existing.length >= maxRequests) {
    const oldest = existing[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    bucketMap.set(key, existing);
    return { allowed: false, retryAfterSec };
  }
  existing.push(now);
  bucketMap.set(key, existing);

  // Limpeza leve de chaves inativas para evitar crescimento de memória
  if (bucketMap.size > 2000) {
    for (const [k, list] of bucketMap.entries()) {
      const fresh = list.filter(ts => ts > cutoff);
      if (fresh.length === 0) bucketMap.delete(k);
      else bucketMap.set(k, fresh);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

function sanitizePublicBaseUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

const DEFAULT_PRODUCTION_PUBLIC_URL = 'https://maroon-moose-392087.hostingersite.com';

function resolvePublicHttpsBaseUrl(req: Request, cfgCallbackUrl?: string | null): string {
  const fromConfig = sanitizePublicBaseUrl(
    String(cfgCallbackUrl || '').replace(/\/api\/whatsapp\/webhook$/i, '')
  );
  if (fromConfig) {
    return fromConfig.replace(/^http:\/\//i, 'https://');
  }

  const fromEnv = sanitizePublicBaseUrl(process.env.APP_URL);
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv.replace(/^http:\/\//i, 'https://');
  }

  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  if (!host || /^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/i.test(host)) {
    return DEFAULT_PRODUCTION_PUBLIC_URL;
  }
  return `https://${host}`;
}

async function ensureRelatoriosApiSchema(pool: any): Promise<void> {
  if (schemaReady) return;
  fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`RELATORIOS_API_SOLICITACOES\` (
      \`ID_REGISTRO\` VARCHAR(64) NOT NULL,
      \`SOLICITACAO_ID\` VARCHAR(128) NOT NULL,
      \`TIPO_RELATORIO\` VARCHAR(32) NOT NULL DEFAULT 'FUZIS',
      \`UNIDADE_SOLICITADA\` VARCHAR(128) NOT NULL,
      \`UNIDADE_CODIGO\` VARCHAR(64) NOT NULL,
      \`UNIDADE_ID_RESOLVIDA\` VARCHAR(64) DEFAULT NULL,
      \`TELEFONE_USUARIO\` VARCHAR(32) NOT NULL,
      \`USUARIO_ID\` VARCHAR(64) DEFAULT NULL,
      \`USUARIO_NOME\` VARCHAR(255) DEFAULT NULL,
      \`USUARIO_MASP\` VARCHAR(32) DEFAULT NULL,
      \`STATUS\` VARCHAR(32) NOT NULL,
      \`ARQUIVO_NOME\` VARCHAR(255) DEFAULT NULL,
      \`ARQUIVO_TOKEN\` VARCHAR(64) DEFAULT NULL,
      \`ARQUIVO_CAMINHO\` VARCHAR(512) DEFAULT NULL,
      \`TOTAL_REGISTROS\` INT NOT NULL DEFAULT 0,
      \`EXPIRA_EM\` DATETIME DEFAULT NULL,
      \`DATA_SOLICITACAO\` DATETIME NOT NULL,
      \`DATA_GERACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`ERRO_CODIGO\` VARCHAR(64) DEFAULT NULL,
      \`ERRO_MENSAGEM\` VARCHAR(500) DEFAULT NULL,
      \`IP_ORIGEM\` VARCHAR(64) DEFAULT NULL,
      PRIMARY KEY (\`ID_REGISTRO\`),
      KEY \`idx_rel_api_solicitacao\` (\`SOLICITACAO_ID\`),
      KEY \`idx_rel_api_token\` (\`ARQUIVO_TOKEN\`),
      KEY \`idx_rel_api_expira\` (\`EXPIRA_EM\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  schemaReady = true;
}

async function cleanupExpiredPdfFiles(pool: any): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) return;
  lastCleanupAt = now;
  try {
    const [expiredRows]: any = await pool.query(
      `SELECT ID_REGISTRO, ARQUIVO_CAMINHO FROM RELATORIOS_API_SOLICITACOES
       WHERE ARQUIVO_CAMINHO IS NOT NULL AND EXPIRA_EM IS NOT NULL AND EXPIRA_EM < NOW()
       LIMIT 200`
    );
    for (const row of expiredRows || []) {
      const storedName = path.basename(String(row.ARQUIVO_CAMINHO || ''));
      if (storedName) {
        const target = path.resolve(PDF_STORAGE_DIR, storedName);
        if (target.startsWith(PDF_STORAGE_DIR + path.sep) && fs.existsSync(target)) {
          try {
            fs.unlinkSync(target);
          } catch {}
        }
      }
    }
  } catch {
    // Limpeza oportunista — não interrompe a requisição
  }
}

async function verifyRelatoriosApiToken(
  pool: any,
  req: Request
): Promise<{ ok: boolean; status?: number; codigo?: string; error?: string; callbackUrlPublica?: string | null }> {
  const envToken = String(process.env.ARSENAL_RELATORIOS_API_TOKEN || '').trim();
  let makeApiKey = '';
  let callbackUrlPublica: string | null = null;
  try {
    const [rows]: any = await pool.query(
      'SELECT MAKE_API_KEY_ENC, CALLBACK_URL_PUBLICA FROM WHATSAPP_CONFIGURACAO_API WHERE ID_CONFIG = ? LIMIT 1',
      [DEFAULT_WHATSAPP_CONFIG_ID]
    );
    if (rows?.[0]) {
      makeApiKey = decryptSecret(rows[0].MAKE_API_KEY_ENC);
      callbackUrlPublica = rows[0].CALLBACK_URL_PUBLICA || null;
    }
  } catch {
    // Tabela WHATSAPP_CONFIGURACAO_API pode ainda não ter sido inicializada se só o envToken for usado
  }

  const validTokens = [envToken, makeApiKey].filter(Boolean);
  if (validTokens.length === 0) {
    return {
      ok: false,
      status: 503,
      codigo: 'TOKEN_NAO_CONFIGURADO',
      error: 'Token da API ainda não foi configurado. Gere a API Key do Make no módulo WhatsApp ou defina ARSENAL_RELATORIOS_API_TOKEN.'
    };
  }

  const authHeader = String(req.headers['authorization'] || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const altHeaderToken = String(req.headers['x-make-api-key'] || req.headers['x-api-key'] || '').trim();
  const provided = bearerToken || altHeaderToken;

  if (!provided || !validTokens.some(expected => timingSafeEqualString(provided, expected))) {
    return {
      ok: false,
      status: 401,
      codigo: 'TOKEN_INVALIDO',
      error: 'Token de autenticação ausente ou inválido. Envie Authorization: Bearer <TOKEN_DA_API>.'
    };
  }

  return { ok: true, callbackUrlPublica };
}

interface FuzilRecord {
  id: string;
  numeroSerie: string;
  fabricante: string;
  modelo: string;
  calibre: string;
  status: string;
  unidadeId: string;
  unidadeNome: string;
  cofreCodigo: string;
  policialAcautelado: string;
  carregadores: number;
  tirosDisparados: number;
  observacao: string;
}

interface ResolvedUnitSelection {
  isTodos: boolean;
  displayName: string;
  fileSlug: string;
  unitIds: string[];
  logoDataUri: string | null;
}

type WeaponReportKey = 'fuzis' | 'submetralhadoras' | 'espingardas';

interface WeaponReportSpec {
  key: WeaponReportKey;
  tipoRelatorioDb: string;
  idPrefix: string;
  filePrefix: string;
  sqlLikePattern: string;
  tituloPdfUpper: string;
  tituloDoc: string;
  pluralLabel: string;
  pluralLower: string;
  singularLower: string;
  semRegistrosMsg: string;
  acessoNegadoAlvo: string;
}

const WEAPON_REPORT_SPECS: Record<WeaponReportKey, WeaponReportSpec> = {
  fuzis: {
    key: 'fuzis',
    tipoRelatorioDb: 'FUZIS',
    idPrefix: 'rel-fuz',
    filePrefix: 'relacao-fuzis',
    sqlLikePattern: '%fuzil%',
    tituloPdfUpper: 'RELACAO DE FUZIS',
    tituloDoc: 'Relação de Fuzis',
    pluralLabel: 'Fuzis',
    pluralLower: 'fuzis',
    singularLower: 'fuzil(is)',
    semRegistrosMsg: 'Não foram encontrados fuzis para a unidade selecionada.',
    acessoNegadoAlvo: 'os fuzis'
  },
  submetralhadoras: {
    key: 'submetralhadoras',
    tipoRelatorioDb: 'SUBMETRALHADORAS',
    idPrefix: 'rel-sub',
    filePrefix: 'relacao-submetralhadoras',
    sqlLikePattern: '%submetralhadora%',
    tituloPdfUpper: 'RELACAO DE SUBMETRALHADORAS',
    tituloDoc: 'Relação de Submetralhadoras',
    pluralLabel: 'Submetralhadoras',
    pluralLower: 'submetralhadoras',
    singularLower: 'submetralhadora(s)',
    semRegistrosMsg: 'Não foram encontradas submetralhadoras para a unidade selecionada.',
    acessoNegadoAlvo: 'as submetralhadoras'
  },
  espingardas: {
    key: 'espingardas',
    tipoRelatorioDb: 'ESPINGARDAS',
    idPrefix: 'rel-esp',
    filePrefix: 'relacao-espingardas',
    sqlLikePattern: '%espingarda%',
    tituloPdfUpper: 'RELACAO DE ESPINGARDAS',
    tituloDoc: 'Relação de Espingardas',
    pluralLabel: 'Espingardas',
    pluralLower: 'espingardas',
    singularLower: 'espingarda(s)',
    semRegistrosMsg: 'Não foram encontradas espingardas para a unidade selecionada.',
    acessoNegadoAlvo: 'as espingardas'
  }
};

function resolveWeaponReportSpec(raw?: string | null): WeaponReportSpec | null {
  const norm = normalizeKey(raw).replace(/[^A-Z0-9]/g, '');
  if (!norm) return null;
  if (norm === 'FUZIS' || norm === 'FUZIL') return WEAPON_REPORT_SPECS.fuzis;
  if (norm === 'SUBMETRALHADORAS' || norm === 'SUBMETRALHADORA' || norm === 'SUBMET' || norm === 'SMT') {
    return WEAPON_REPORT_SPECS.submetralhadoras;
  }
  if (norm === 'ESPINGARDAS' || norm === 'ESPINGARDA' || norm === 'ESP') {
    return WEAPON_REPORT_SPECS.espingardas;
  }
  return null;
}

function stripInteractiveUnitPrefix(raw: string): string {
  return normalizeKey(raw)
    .replace(
      /^(?:FUZIS?|SUBMETRALHADORAS?|SUBMET|SMT|ESPINGARDAS?|ESP|MUNICOES?|MUNICAO|MUN|CALIBRE|CAL|ARMAS?|UNIDADE|UNIT|RELATORIO)[_\-\s:]+/i,
      ''
    )
    .trim();
}

async function resolveUnitSelectionForUser(
  pool: any,
  user: ResolvedWhatsappUser,
  unidadeRaw: string,
  unidadeCodigoRaw: string,
  acessoNegadoAlvo: string
): Promise<{ ok: true; selection: ResolvedUnitSelection } | { ok: false; status: number; codigo: string; mensagem: string }> {
  const candidate = stripInteractiveUnitPrefix(unidadeCodigoRaw || unidadeRaw);
  const candidateAlt = stripInteractiveUnitPrefix(unidadeRaw || unidadeCodigoRaw);

  const isTodos =
    candidate === 'TODOS' ||
    candidate === 'TODAS' ||
    candidate === 'ALL' ||
    candidate === 'GERAL' ||
    candidateAlt === 'TODOS' ||
    candidateAlt === 'TODAS';

  if (isTodos) {
    const canQueryMultiple = user.isGlobal || (user.isArmeiroOrAdmin && user.permittedUnits.length > 1);
    if (!canQueryMultiple) {
      return {
        ok: false,
        status: 403,
        codigo: 'ACESSO_NEGADO_UNIDADE',
        mensagem: 'Seu perfil de acesso permite consultar apenas a sua própria unidade.'
      };
    }

    let deptLogo: string | null = null;
    if (user.departmentId) {
      try {
        const [dRows]: any = await pool.query(
          'SELECT LOGO_URL_DEPARTAMENTOS FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTOS = ? LIMIT 1',
          [user.departmentId]
        );
        deptLogo = dRows?.[0]?.LOGO_URL_DEPARTAMENTOS || null;
      } catch {}
    }

    return {
      ok: true,
      selection: {
        isTodos: true,
        displayName: user.isGlobal ? 'Todas as Unidades' : 'Todas as Unidades Permitidas',
        fileSlug: 'TODOS',
        unitIds: user.isGlobal ? [] : user.permittedUnits.map(u => u.id),
        logoDataUri: deptLogo
      }
    };
  }

  const [allUnitRows]: any = await pool.query(
    'SELECT ID_UNIDADES, NOME_UNIDADES, DEPARTAMENTO_ID_UNIDADES, LOGO_URL_UNIDADES FROM UNIDADES ORDER BY NOME_UNIDADES ASC'
  );

  const matchUnit = (allUnitRows || []).find((row: any) => {
    const idNorm = normalizeKey(row.ID_UNIDADES);
    const nameNorm = normalizeKey(row.NOME_UNIDADES);
    return (
      idNorm === candidate ||
      nameNorm === candidate ||
      idNorm === candidateAlt ||
      nameNorm === candidateAlt ||
      nameNorm.startsWith(`${candidate} `) ||
      nameNorm.startsWith(`${candidate}-`) ||
      nameNorm.includes(`(${candidate})`)
    );
  });

  if (!matchUnit) {
    return {
      ok: false,
      status: 400,
      codigo: 'UNIDADE_INVALIDA',
      mensagem: `Unidade "${unidadeCodigoRaw || unidadeRaw}" não encontrada no sistema Arsenal.`
    };
  }

  const matchedId = String(matchUnit.ID_UNIDADES);
  const matchedName = String(matchUnit.NOME_UNIDADES);
  const isPermitted =
    user.isGlobal || user.permittedUnits.some((u: PermittedUnit) => u.id === matchedId);

  if (!isPermitted) {
    return {
      ok: false,
      status: 403,
      codigo: 'ACESSO_NEGADO_UNIDADE',
      mensagem: `Usuário sem permissão para consultar ${acessoNegadoAlvo} da unidade ${matchedName}.`
    };
  }

  let logoDataUri: string | null = matchUnit.LOGO_URL_UNIDADES || null;
  if (!logoDataUri && matchUnit.DEPARTAMENTO_ID_UNIDADES) {
    try {
      const [dRows]: any = await pool.query(
        'SELECT LOGO_URL_DEPARTAMENTOS FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTOS = ? LIMIT 1',
        [matchUnit.DEPARTAMENTO_ID_UNIDADES]
      );
      logoDataUri = dRows?.[0]?.LOGO_URL_DEPARTAMENTOS || null;
    } catch {}
  }

  return {
    ok: true,
    selection: {
      isTodos: false,
      displayName: matchedName,
      fileSlug: sanitizeFileSlug(unidadeCodigoRaw || matchedName),
      unitIds: [matchedId],
      logoDataUri
    }
  };
}

async function queryArmasByTypeAndUnit(
  pool: any,
  weaponSpec: WeaponReportSpec,
  unitIds: string[]
): Promise<FuzilRecord[]> {
  let sql = `
    SELECT
      a.ID_ARMAS,
      a.NUMERO_SERIE_ARMAS,
      a.FABRICANTE_ARMAS,
      a.MODELO_ARMAS,
      a.CALIBRE_ARMAS,
      a.STATUS_ARMAS,
      a.UNIDADE_ID_ARMAS,
      a.POLICIAL_ACAUTELADO_ARMAS,
      a.QUANTIDADE_CARREGADORES_ARMAS,
      a.TIROS_DISPARADOS_ARMAS,
      a.OBSERVACAO_LOCALIZACAO_ARMAS,
      u.NOME_UNIDADES,
      c.CODIGO_COFRES
    FROM ARMAS a
    LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ARMAS
    LEFT JOIN COFRES c ON c.ID_COFRES = a.COFRE_ID_ARMAS
    WHERE LOWER(TRIM(a.TIPO_ARMAS)) LIKE ?
  `;
  const params: any[] = [weaponSpec.sqlLikePattern];

  if (unitIds.length > 0) {
    const placeholders = unitIds.map(() => '?').join(', ');
    sql += ` AND a.UNIDADE_ID_ARMAS IN (${placeholders})`;
    params.push(...unitIds);
  }

  sql += ' ORDER BY u.NOME_UNIDADES ASC, a.MODELO_ARMAS ASC, a.NUMERO_SERIE_ARMAS ASC';

  const [rows]: any = await pool.query(sql, params);
  return (rows || []).map((r: any) => ({
    id: String(r.ID_ARMAS || ''),
    numeroSerie: String(r.NUMERO_SERIE_ARMAS || '—'),
    fabricante: String(r.FABRICANTE_ARMAS || ''),
    modelo: String(r.MODELO_ARMAS || '—'),
    calibre: String(r.CALIBRE_ARMAS || '—'),
    status: String(r.STATUS_ARMAS || 'No Cofre'),
    unidadeId: String(r.UNIDADE_ID_ARMAS || ''),
    unidadeNome: String(r.NOME_UNIDADES || 'Sem Unidade'),
    cofreCodigo: String(r.CODIGO_COFRES || ''),
    policialAcautelado: String(r.POLICIAL_ACAUTELADO_ARMAS || ''),
    carregadores: Number(r.QUANTIDADE_CARREGADORES_ARMAS || 0),
    tirosDisparados: Number(r.TIROS_DISPARADOS_ARMAS || 0),
    observacao: String(r.OBSERVACAO_LOCALIZACAO_ARMAS || '')
  }));
}

async function tryEmbedLogoImage(doc: PDFDocument, dataUri?: string | null): Promise<PDFImage | null> {
  if (!dataUri || typeof dataUri !== 'string') return null;
  const match = dataUri.trim().match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    const kind = match[1].toLowerCase();
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) return null;
    if (kind === 'png') return await doc.embedPng(bytes);
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function fitTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  const clean = sanitizePdfText(text).replace(/\n/g, ' ');
  if (!clean) return '-';
  if (font.widthOfTextAtSize(clean, fontSize) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

async function generateArmasPdfBuffer(params: {
  weaponSpec: WeaponReportSpec;
  unidadeLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  telefoneUsuario: string;
  logoDataUri: string | null;
  records: FuzilRecord[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${params.weaponSpec.tituloDoc} - ${params.unidadeLabel}`);
  doc.setAuthor('Sistema Arsenal - Polícia Civil de Minas Gerais');
  doc.setCreator('API Arsenal Make.com / WhatsApp');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await tryEmbedLogoImage(doc, params.logoDataUri);

  // Paisagem A4 para excelente legibilidade das colunas da tabela de armamento
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 34;
  const contentWidth = pageWidth - marginX * 2;
  const footerHeight = 32;

  const totalCount = params.records.length;
  const noCofreCount = params.records.filter(r => r.status.toLowerCase().includes('cofre')).length;
  const acauteladoCount = params.records.filter(r => r.status.toLowerCase().includes('acautel')).length;
  const outrosCount = Math.max(0, totalCount - noCofreCount - acauteladoCount);

  const columns = [
    { key: 'idx', label: '#', width: 26 },
    { key: 'unidade', label: 'UNIDADE', width: 72 },
    { key: 'serie', label: 'N. SERIE', width: 102 },
    { key: 'modelo', label: 'FABRICANTE / MODELO', width: 168 },
    { key: 'calibre', label: 'CALIBRE', width: 74 },
    { key: 'situacao', label: 'SITUACAO', width: 88 },
    { key: 'posse', label: 'COFRE / POSSE', width: 126 },
    { key: 'obs', label: 'OBSERVACOES', width: contentWidth - (26 + 72 + 102 + 168 + 74 + 88 + 126) }
  ];

  const drawPageHeader = (page: PDFPage, isFirstPage: boolean): number => {
    // Cabeçalho institucional escuro + filete dourado
    page.drawRectangle({
      x: 0,
      y: pageHeight - 70,
      width: pageWidth,
      height: 70,
      color: rgb(0.06, 0.1, 0.17)
    });
    page.drawRectangle({
      x: 0,
      y: pageHeight - 73,
      width: pageWidth,
      height: 3,
      color: rgb(0.85, 0.65, 0.13)
    });

    let titleStartX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(46, 46);
      page.drawImage(logoImage, {
        x: marginX,
        y: pageHeight - 58 + (46 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      titleStartX = marginX + 56;
    }

    page.drawText('POLICIA CIVIL DE MINAS GERAIS - SISTEMA ARSENAL / ARMARIA', {
      x: titleStartX,
      y: pageHeight - 24,
      size: 8.5,
      font: fontBold,
      color: rgb(0.96, 0.78, 0.25)
    });

    page.drawText(
      fitTextToWidth(`${params.weaponSpec.tituloPdfUpper} - ${params.unidadeLabel.toUpperCase()}`, fontBold, 14, contentWidth - (titleStartX - marginX) - 180),
      {
        x: titleStartX,
        y: pageHeight - 44,
        size: 14,
        font: fontBold,
        color: rgb(1, 1, 1)
      }
    );

    page.drawText(
      `Emitido em: ${formatDateTimeBr(params.geradoEm)} | Protocolo: ${sanitizePdfText(params.solicitacaoId).slice(0, 40)}`,
      {
        x: titleStartX,
        y: pageHeight - 60,
        size: 8,
        font: fontRegular,
        color: rgb(0.82, 0.86, 0.92)
      }
    );

    let y = pageHeight - 88;

    if (isFirstPage) {
      // Cartão de metadados da solicitação + resumo quantitativo
      page.drawRectangle({
        x: marginX,
        y: y - 42,
        width: contentWidth,
        height: 44,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.82, 0.85, 0.9),
        borderWidth: 0.75
      });

      const metaLine1 = `Solicitante: ${sanitizePdfText(params.solicitanteNome)} (MASP: ${sanitizePdfText(params.solicitanteMasp || '-')})  |  WhatsApp: ${sanitizePdfText(params.telefoneUsuario)}`;
      const metaLine2 = `Total de ${params.weaponSpec.pluralLabel}: ${totalCount}   |   No Cofre: ${noCofreCount}   |   Acauteladas: ${acauteladoCount}   |   Outros / Manutencao: ${outrosCount}`;

      page.drawText(fitTextToWidth(metaLine1, fontRegular, 8.5, contentWidth - 16), {
        x: marginX + 8,
        y: y - 15,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.28)
      });
      page.drawText(fitTextToWidth(metaLine2, fontBold, 9, contentWidth - 16), {
        x: marginX + 8,
        y: y - 32,
        size: 9,
        font: fontBold,
        color: rgb(0.06, 0.25, 0.2)
      });
      y -= 54;
    }

    // Cabeçalho da tabela
    const headerRowHeight = 20;
    page.drawRectangle({
      x: marginX,
      y: y - headerRowHeight,
      width: contentWidth,
      height: headerRowHeight,
      color: rgb(0.11, 0.17, 0.27)
    });

    let colX = marginX;
    for (const col of columns) {
      page.drawText(col.label, {
        x: colX + 4,
        y: y - 13.5,
        size: 7.5,
        font: fontBold,
        color: rgb(1, 1, 1)
      });
      colX += col.width;
    }

    return y - headerRowHeight;
  };

  let page = doc.addPage([pageWidth, pageHeight]);
  let cursorY = drawPageHeader(page, true);
  const rowHeight = 18;

  params.records.forEach((rec, index) => {
    if (cursorY - rowHeight < footerHeight + 12) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursorY = drawPageHeader(page, false);
    }

    const rowBottomY = cursorY - rowHeight;
    if (index % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: rowBottomY,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.97, 0.98, 0.99)
      });
    }
    page.drawLine({
      start: { x: marginX, y: rowBottomY },
      end: { x: marginX + contentWidth, y: rowBottomY },
      thickness: 0.4,
      color: rgb(0.86, 0.89, 0.93)
    });

    const fabricanteModelo = [rec.fabricante, rec.modelo].filter(Boolean).join(' - ') || '-';
    const posseInfo = rec.policialAcautelado
      ? `Acaut.: ${rec.policialAcautelado}`
      : rec.cofreCodigo
        ? `Cofre ${rec.cofreCodigo}`
        : '-';
    const obsParts = [
      rec.observacao,
      rec.carregadores > 0 ? `Carr: ${rec.carregadores}` : '',
      rec.tirosDisparados > 0 ? `Tiros: ${rec.tirosDisparados}` : ''
    ].filter(Boolean);

    const values: Record<string, string> = {
      idx: String(index + 1),
      unidade: rec.unidadeNome,
      serie: rec.numeroSerie,
      modelo: fabricanteModelo,
      calibre: rec.calibre,
      situacao: rec.status,
      posse: posseInfo,
      obs: obsParts.join(' | ') || '-'
    };

    let colX = marginX;
    for (const col of columns) {
      const cellText = fitTextToWidth(values[col.key] || '-', fontRegular, 7.8, col.width - 8);
      page.drawText(cellText, {
        x: colX + 4,
        y: rowBottomY + 5.5,
        size: 7.8,
        font: col.key === 'serie' ? fontBold : fontRegular,
        color: rgb(0.1, 0.13, 0.18)
      });
      colX += col.width;
    }

    cursorY = rowBottomY;
  });

  // Rodapé institucional com paginação em todas as páginas
  const pages = doc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: marginX, y: 26 },
      end: { x: pageWidth - marginX, y: 26 },
      thickness: 0.6,
      color: rgb(0.78, 0.82, 0.87)
    });
    p.drawText(
      `Sistema Arsenal PCMG - Documento de uso restrito institucional | Solicitacao: ${sanitizePdfText(params.solicitacaoId).slice(0, 36)}`,
      {
        x: marginX,
        y: 13,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.42, 0.47, 0.54)
      }
    );
    const pageLabel = `Pagina ${idx + 1} de ${totalPages}`;
    const labelW = fontBold.widthOfTextAtSize(pageLabel, 7.5);
    p.drawText(pageLabel, {
      x: pageWidth - marginX - labelW,
      y: 13,
      size: 7.5,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.42)
    });
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

async function logSolicitacaoDb(
  pool: any,
  entry: {
    idRegistro: string;
    solicitacaoId: string;
    tipoRelatorio?: string;
    unidadeSolicitada: string;
    unidadeCodigo: string;
    unidadeIdResolvida?: string | null;
    telefoneUsuario: string;
    usuario?: ResolvedWhatsappUser | null;
    status: 'concluido' | 'sem_registros' | 'erro';
    arquivoNome?: string | null;
    arquivoToken?: string | null;
    arquivoCaminho?: string | null;
    totalRegistros?: number;
    expiraEm?: Date | null;
    dataSolicitacao: Date;
    erroCodigo?: string | null;
    erroMensagem?: string | null;
    ipOrigem?: string | null;
  }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO RELATORIOS_API_SOLICITACOES (
        ID_REGISTRO, SOLICITACAO_ID, TIPO_RELATORIO, UNIDADE_SOLICITADA, UNIDADE_CODIGO,
        UNIDADE_ID_RESOLVIDA, TELEFONE_USUARIO, USUARIO_ID, USUARIO_NOME, USUARIO_MASP,
        STATUS, ARQUIVO_NOME, ARQUIVO_TOKEN, ARQUIVO_CAMINHO, TOTAL_REGISTROS,
        EXPIRA_EM, DATA_SOLICITACAO, DATA_GERACAO, ERRO_CODIGO, ERRO_MENSAGEM, IP_ORIGEM
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
      [
        entry.idRegistro,
        entry.solicitacaoId.slice(0, 128),
        String(entry.tipoRelatorio || 'FUZIS').slice(0, 32),
        entry.unidadeSolicitada.slice(0, 128),
        entry.unidadeCodigo.slice(0, 64),
        entry.unidadeIdResolvida || null,
        entry.telefoneUsuario.slice(0, 32),
        entry.usuario?.id || null,
        entry.usuario?.name || null,
        entry.usuario?.masp || null,
        entry.status,
        entry.arquivoNome || null,
        entry.arquivoToken || null,
        entry.arquivoCaminho || null,
        entry.totalRegistros || 0,
        entry.expiraEm || null,
        entry.dataSolicitacao,
        entry.erroCodigo || null,
        entry.erroMensagem ? entry.erroMensagem.slice(0, 500) : null,
        entry.ipOrigem ? String(entry.ipOrigem).slice(0, 64) : null
      ]
    );
  } catch (err) {
    console.warn('[Relatorios API] Falha ao registrar log da solicitação:', (err as any)?.message);
  }
}

export function registerRelatoriosArmasApiRoutes(apiRouter: Router, deps: RelatoriosApiDeps): void {
  const { getPool, insertAuditLog } = deps;

  const handleWeaponReportRequest = async (
    req: Request,
    res: Response,
    fixedWeaponKey?: WeaponReportKey
  ) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');

    try {
      await ensureRelatoriosApiSchema(pool);
      void cleanupExpiredPdfFiles(pool);

      // 1. Limite de requisições por IP
      const ipLimit = checkRateLimit(ipRateBuckets, clientIp, RATE_LIMIT_MAX_PER_IP);
      if (!ipLimit.allowed) {
        res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
        return res.status(429).json({
          sucesso: false,
          status: 'erro',
          codigo: 'LIMITE_REQUISICOES_EXCEDIDO',
          mensagem: `Limite de requisições atingido. Tente novamente em ${ipLimit.retryAfterSec} segundos.`
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const weaponSpec = fixedWeaponKey
        ? WEAPON_REPORT_SPECS[fixedWeaponKey]
        : resolveWeaponReportSpec(String(body.tipo_arma || body.tipo || body.categoria || ''));

      if (!weaponSpec) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TIPO_ARMA_INVALIDO',
          mensagem: 'Informe "tipo_arma" válido: "fuzis", "submetralhadoras" ou "espingardas".'
        });
      }

      const idRegistro = `${weaponSpec.idPrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const rawUnidadeForLog = String(body.unidade || body.unidade_codigo || '').trim() || 'NAO_INFORMADA';
      const rawCodigoForLog = String(body.unidade_codigo || body.unidade || '').trim() || 'NAO_INFORMADA';
      const rawPhoneForLog = normalizePhoneDigits(body.telefone_usuario || body.telefone || body.phone || body.from) || 'NAO_INFORMADO';
      const rawSolicitacaoForLog = String(body.solicitacao_id || '').trim() || `make-${Date.now()}`;

      // 2. Validar token de autenticação (Bearer, X-Make-Api-Key ou X-Api-Key)
      const tokenCheck = await verifyRelatoriosApiToken(pool, req);
      if (!tokenCheck.ok) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId: rawSolicitacaoForLog,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: rawUnidadeForLog,
          unidadeCodigo: rawCodigoForLog,
          telefoneUsuario: rawPhoneForLog,
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: tokenCheck.codigo || 'TOKEN_INVALIDO',
          erroMensagem: tokenCheck.error || 'Token ausente ou inválido.',
          ipOrigem: clientIp
        });
        return res.status(tokenCheck.status || 401).json({
          sucesso: false,
          status: 'erro',
          codigo: tokenCheck.codigo || 'TOKEN_INVALIDO',
          mensagem: tokenCheck.error || 'Não autorizado.'
        });
      }

      // 3. Validar corpo da requisição (com tolerância a variações comuns do Make.com)
      const unidade = String(body.unidade || '').trim();
      const unidadeCodigo = String(body.unidade_codigo || unidade || '').trim();
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);
      const solicitacaoId = String(body.solicitacao_id || '').trim().slice(0, 128) || `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const formato = String(body.formato || 'pdf').trim().toLowerCase() || 'pdf';
      const dataHoraRaw = body.data_hora_solicitacao ? String(body.data_hora_solicitacao).trim() : '';

      if (!unidade && !unidadeCodigo) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: 'NAO_INFORMADA',
          unidadeCodigo: 'NAO_INFORMADA',
          telefoneUsuario: telefoneDigits || 'NAO_INFORMADO',
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: 'CAMPOS_OBRIGATORIOS_AUSENTES',
          erroMensagem: 'Campo unidade/unidade_codigo ausente na requisição.',
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'CAMPOS_OBRIGATORIOS_AUSENTES',
          mensagem: 'Informe o campo obrigatório "unidade" ou "unidade_codigo".'
        });
      }

      if (telefoneDigits.length < 10 || telefoneDigits.length > 15) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits || 'INVALIDO',
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: 'TELEFONE_INVALIDO',
          erroMensagem: 'Campo telefone_usuario ausente ou fora do padrão (10-15 dígitos).',
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TELEFONE_INVALIDO',
          mensagem: 'Informe "telefone_usuario" válido com DDD (ex: 5531999999999).'
        });
      }

      if (formato !== 'pdf') {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: 'FORMATO_NAO_SUPORTADO',
          erroMensagem: `Formato não suportado: ${formato}`,
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'FORMATO_NAO_SUPORTADO',
          mensagem: 'Formato não suportado. Utilize formato "pdf".'
        });
      }

      let dataSolicitacao = new Date();
      if (dataHoraRaw) {
        const parsedDate = new Date(dataHoraRaw);
        if (!Number.isNaN(parsedDate.getTime())) {
          dataSolicitacao = parsedDate;
        }
      }

      // Limite de requisições por telefone
      const phoneLimit = checkRateLimit(phoneRateBuckets, telefoneDigits, RATE_LIMIT_MAX_PER_PHONE);
      if (!phoneLimit.allowed) {
        res.setHeader('Retry-After', String(phoneLimit.retryAfterSec));
        return res.status(429).json({
          sucesso: false,
          status: 'erro',
          codigo: 'LIMITE_REQUISICOES_EXCEDIDO',
          mensagem: `Limite de solicitações por usuário atingido. Tente novamente em ${phoneLimit.retryAfterSec} segundos.`
        });
      }

      // 4. Identificar usuário no sistema Arsenal pelo telefone (ignorando formatação e +55)
      const user = await resolveWhatsappUserContext(pool, telefoneDigits);
      if (!user) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          status: 'erro',
          dataSolicitacao,
          erroCodigo: 'USUARIO_NAO_AUTORIZADO',
          erroMensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.',
          ipOrigem: clientIp
        });
        return res.status(403).json({
          sucesso: false,
          status: 'erro',
          codigo: 'USUARIO_NAO_AUTORIZADO',
          mensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.'
        });
      }

      // 5. Validar unidade recebida e permissão de acesso por unidade
      const unitResolution = await resolveUnitSelectionForUser(pool, user, unidade, unidadeCodigo, weaponSpec.acessoNegadoAlvo);
      if ('codigo' in unitResolution) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          usuario: user,
          status: 'erro',
          dataSolicitacao,
          erroCodigo: unitResolution.codigo,
          erroMensagem: unitResolution.mensagem,
          ipOrigem: clientIp
        });
        return res.status(unitResolution.status).json({
          sucesso: false,
          status: 'erro',
          codigo: unitResolution.codigo,
          mensagem: unitResolution.mensagem
        });
      }

      const { selection } = unitResolution;

      // 6. Buscar registros da categoria de arma selecionada na tabela ARMAS
      const records = await queryArmasByTypeAndUnit(pool, weaponSpec, selection.unitIds);

      if (records.length === 0) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: selection.displayName,
          unidadeCodigo: selection.fileSlug,
          unidadeIdResolvida: selection.unitIds.length === 1 ? selection.unitIds[0] : null,
          telefoneUsuario: telefoneDigits,
          usuario: user,
          status: 'sem_registros',
          totalRegistros: 0,
          dataSolicitacao,
          ipOrigem: clientIp
        });

        await insertAuditLog(
          'WhatsApp / API Relatórios',
          `Relatório de ${weaponSpec.pluralLabel} (Sem Registros)`,
          `Solicitação ${solicitacaoId} via Make.com para unidade ${selection.displayName} — nenhum registro de ${weaponSpec.pluralLower} encontrado.`,
          { id: user.id, name: user.name, masp: user.masp, role: user.role },
          clientIp
        );

        return res.status(200).json({
          sucesso: true,
          status: 'sem_registros',
          tipo_arma: weaponSpec.key,
          unidade: selection.displayName,
          mensagem: weaponSpec.semRegistrosMsg
        });
      }

      // 7. Gerar PDF e salvar em diretório confinado acessível por HTTPS
      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `${weaponSpec.filePrefix}-${selection.fileSlug}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);

      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateArmasPdfBuffer({
          weaponSpec,
          unidadeLabel: selection.displayName,
          solicitacaoId,
          geradoEm,
          solicitanteNome: user.name,
          solicitanteMasp: user.masp,
          telefoneUsuario: telefoneDigits,
          logoDataUri: selection.logoDataUri,
          records
        });
        fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
        fs.writeFileSync(targetPath, pdfBuffer);
      } catch (pdfErr: any) {
        console.error(`[Relatorios API] Erro ao gerar/salvar PDF de ${weaponSpec.pluralLower}:`, pdfErr?.message);
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: weaponSpec.tipoRelatorioDb,
          unidadeSolicitada: selection.displayName,
          unidadeCodigo: selection.fileSlug,
          unidadeIdResolvida: selection.unitIds.length === 1 ? selection.unitIds[0] : null,
          telefoneUsuario: telefoneDigits,
          usuario: user,
          status: 'erro',
          totalRegistros: records.length,
          dataSolicitacao,
          erroCodigo: 'ERRO_GERACAO_PDF',
          erroMensagem: pdfErr?.message || 'Falha ao gerar PDF.',
          ipOrigem: clientIp
        });
        return res.status(500).json({
          sucesso: false,
          status: 'erro',
          codigo: 'ERRO_GERACAO_PDF',
          mensagem: 'Não foi possível gerar o relatório.'
        });
      }

      const baseUrl = resolvePublicHttpsBaseUrl(req, tokenCheck.callbackUrlPublica);
      const arquivoUrl = `${baseUrl}/arquivos/${arquivoToken}/${encodeURIComponent(arquivoNome)}`;

      await logSolicitacaoDb(pool, {
        idRegistro,
        solicitacaoId,
        tipoRelatorio: weaponSpec.tipoRelatorioDb,
        unidadeSolicitada: selection.displayName,
        unidadeCodigo: selection.fileSlug,
        unidadeIdResolvida: selection.unitIds.length === 1 ? selection.unitIds[0] : null,
        telefoneUsuario: telefoneDigits,
        usuario: user,
        status: 'concluido',
        arquivoNome,
        arquivoToken,
        arquivoCaminho: storedFilename,
        totalRegistros: records.length,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        `Gerar PDF de ${weaponSpec.pluralLabel} (Make.com)`,
        `Solicitação ${solicitacaoId}: ${records.length} ${weaponSpec.singularLower} da unidade ${selection.displayName} — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_arma: weaponSpec.key,
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        solicitacao_id: solicitacaoId,
        total_registros: records.length,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em POST /api/relatorios:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar o relatório.'
      });
    }
  };

  // Endpoints dedicados por tipo de arma (Make.com / Chatbot WhatsApp)
  apiRouter.post(['/relatorios/fuzis', '/relatorios/fuzil'], (req: Request, res: Response) =>
    handleWeaponReportRequest(req, res, 'fuzis')
  );
  apiRouter.post(['/relatorios/submetralhadoras', '/relatorios/submetralhadora'], (req: Request, res: Response) =>
    handleWeaponReportRequest(req, res, 'submetralhadoras')
  );
  apiRouter.post(['/relatorios/espingardas', '/relatorios/espingarda'], (req: Request, res: Response) =>
    handleWeaponReportRequest(req, res, 'espingardas')
  );

  // Endpoint dinâmico opcional (recebe tipo_arma: "fuzis" | "submetralhadoras" | "espingardas")
  apiRouter.post('/relatorios/armas', (req: Request, res: Response) =>
    handleWeaponReportRequest(req, res)
  );

  // ============================================================================
  // ENDPOINTS DE MUNIÇÕES — RELAÇÃO POR CALIBRE E RELAÇÃO POR UNIDADE (Make.com)
  // ============================================================================
  const handleMunicoesReportRequest = async (
    req: Request,
    res: Response,
    routeCalibreParam?: string,
    forcedMode?: 'por_unidade'
  ) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');

    try {
      await ensureRelatoriosApiSchema(pool);
      void cleanupExpiredPdfFiles(pool);

      // 1. Limite de requisições por IP
      const ipLimit = checkRateLimit(ipRateBuckets, clientIp, RATE_LIMIT_MAX_PER_IP);
      if (!ipLimit.allowed) {
        res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
        return res.status(429).json({
          sucesso: false,
          status: 'erro',
          codigo: 'LIMITE_REQUISICOES_EXCEDIDO',
          mensagem: `Limite de requisições atingido. Tente novamente em ${ipLimit.retryAfterSec} segundos.`
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawModeInput = normalizeKey(
        String(body.modo_relatorio || body.modo || body.tipo_relatorio || body.tipo_consulta || '')
      ).replace(/[^A-Z0-9]/g, '');
      const rawCalibreInput = String(
        routeCalibreParam ||
          body.calibre ||
          body.calibre_codigo ||
          body.tipo_municao ||
          body.tipo ||
          ''
      ).trim();

      const explicitUnitMode =
        forcedMode === 'por_unidade' ||
        rawModeInput === 'UNIDADE' ||
        rawModeInput === 'PORUNIDADE' ||
        rawModeInput === 'RELACAOPORUNIDADE' ||
        ['unidade', 'porunidade', 'relacaoporunidade'].includes(compactCalibreCode(rawCalibreInput));

      const calibreSpec: MunicaoCalibreSpec =
        explicitUnitMode || !rawCalibreInput
          ? {
              key: 'unidade',
              displayLabel: 'Todos os Calibres',
              fileSlug: 'UNIDADE',
              isTodos: true,
              matcher: () => true
            }
          : resolveMunicaoCalibreSpec(rawCalibreInput)!;

      const modoRelatorio: 'por_calibre' | 'por_unidade' =
        explicitUnitMode || !rawCalibreInput ? 'por_unidade' : 'por_calibre';

      const idRegistro = `rel-mun-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const rawUnidadeForLog = String(body.unidade || body.unidade_codigo || '').trim() || 'NAO_INFORMADA';
      const rawCodigoForLog = String(body.unidade_codigo || body.unidade || '').trim() || 'NAO_INFORMADA';
      const rawPhoneForLog = normalizePhoneDigits(body.telefone_usuario || body.telefone || body.phone || body.from) || 'NAO_INFORMADO';
      const rawSolicitacaoForLog = String(body.solicitacao_id || '').trim() || `make-${Date.now()}`;
      const tipoRelatorioDb =
        modoRelatorio === 'por_unidade'
          ? 'MUN_POR_UNIDADE'
          : `MUN_${calibreSpec.fileSlug.toUpperCase()}`.slice(0, 32);

      // 2. Validar token de autenticação (Bearer, X-Make-Api-Key ou X-Api-Key)
      const tokenCheck = await verifyRelatoriosApiToken(pool, req);
      if (!tokenCheck.ok) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId: rawSolicitacaoForLog,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: rawUnidadeForLog,
          unidadeCodigo: rawCodigoForLog,
          telefoneUsuario: rawPhoneForLog,
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: tokenCheck.codigo || 'TOKEN_INVALIDO',
          erroMensagem: tokenCheck.error || 'Token ausente ou inválido.',
          ipOrigem: clientIp
        });
        return res.status(tokenCheck.status || 401).json({
          sucesso: false,
          status: 'erro',
          codigo: tokenCheck.codigo || 'TOKEN_INVALIDO',
          mensagem: tokenCheck.error || 'Não autorizado.'
        });
      }

      // 3. Validar corpo da requisição
      const unidade = String(body.unidade || '').trim();
      const unidadeCodigo = String(body.unidade_codigo || unidade || '').trim();
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);
      const solicitacaoId = String(body.solicitacao_id || '').trim().slice(0, 128) || `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const formato = String(body.formato || 'pdf').trim().toLowerCase() || 'pdf';
      const dataHoraRaw = body.data_hora_solicitacao ? String(body.data_hora_solicitacao).trim() : '';
      const incluirZerados = Boolean(body.incluir_zerados);

      if (!unidade && !unidadeCodigo) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: 'NAO_INFORMADA',
          unidadeCodigo: 'NAO_INFORMADA',
          telefoneUsuario: telefoneDigits || 'NAO_INFORMADO',
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: 'CAMPOS_OBRIGATORIOS_AUSENTES',
          erroMensagem: 'Campo unidade/unidade_codigo ausente na requisição.',
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'CAMPOS_OBRIGATORIOS_AUSENTES',
          mensagem: 'Informe o campo obrigatório "unidade" ou "unidade_codigo".'
        });
      }

      if (telefoneDigits.length < 10 || telefoneDigits.length > 15) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits || 'INVALIDO',
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: 'TELEFONE_INVALIDO',
          erroMensagem: 'Campo telefone_usuario ausente ou fora do padrão (10-15 dígitos).',
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TELEFONE_INVALIDO',
          mensagem: 'Informe "telefone_usuario" válido com DDD (ex: 5531999999999).'
        });
      }

      if (formato !== 'pdf') {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          status: 'erro',
          dataSolicitacao: new Date(),
          erroCodigo: 'FORMATO_NAO_SUPORTADO',
          erroMensagem: `Formato não suportado: ${formato}`,
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'FORMATO_NAO_SUPORTADO',
          mensagem: 'Formato não suportado. Utilize formato "pdf".'
        });
      }

      let dataSolicitacao = new Date();
      if (dataHoraRaw) {
        const parsedDate = new Date(dataHoraRaw);
        if (!Number.isNaN(parsedDate.getTime())) {
          dataSolicitacao = parsedDate;
        }
      }

      // Limite de requisições por telefone
      const phoneLimit = checkRateLimit(phoneRateBuckets, telefoneDigits, RATE_LIMIT_MAX_PER_PHONE);
      if (!phoneLimit.allowed) {
        res.setHeader('Retry-After', String(phoneLimit.retryAfterSec));
        return res.status(429).json({
          sucesso: false,
          status: 'erro',
          codigo: 'LIMITE_REQUISICOES_EXCEDIDO',
          mensagem: `Limite de solicitações por usuário atingido. Tente novamente em ${phoneLimit.retryAfterSec} segundos.`
        });
      }

      // 4. Identificar usuário ativo pelo telefone
      const user = await resolveWhatsappUserContext(pool, telefoneDigits);
      if (!user) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          status: 'erro',
          dataSolicitacao,
          erroCodigo: 'USUARIO_NAO_AUTORIZADO',
          erroMensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.',
          ipOrigem: clientIp
        });
        return res.status(403).json({
          sucesso: false,
          status: 'erro',
          codigo: 'USUARIO_NAO_AUTORIZADO',
          mensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.'
        });
      }

      // 5. Validar unidade e permissão de acesso
      const unitResolution = await resolveUnitSelectionForUser(pool, user, unidade, unidadeCodigo, 'as munições');
      if ('codigo' in unitResolution) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          usuario: user,
          status: 'erro',
          dataSolicitacao,
          erroCodigo: unitResolution.codigo,
          erroMensagem: unitResolution.mensagem,
          ipOrigem: clientIp
        });
        return res.status(unitResolution.status).json({
          sucesso: false,
          status: 'erro',
          codigo: unitResolution.codigo,
          mensagem: unitResolution.mensagem
        });
      }

      const { selection } = unitResolution;

      // 6. Buscar registros de munições no estoque
      const records = await queryMunicoesByCalibreAndUnit(pool, calibreSpec, selection.unitIds, incluirZerados);

      if (records.length === 0) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: selection.displayName,
          unidadeCodigo: selection.fileSlug,
          unidadeIdResolvida: selection.unitIds.length === 1 ? selection.unitIds[0] : null,
          telefoneUsuario: telefoneDigits,
          usuario: user,
          status: 'sem_registros',
          totalRegistros: 0,
          dataSolicitacao,
          ipOrigem: clientIp
        });

        await insertAuditLog(
          'WhatsApp / API Relatórios',
          `Relatório de Munições ${calibreSpec.displayLabel} (Sem Registros)`,
          `Solicitação ${solicitacaoId} via Make.com para unidade ${selection.displayName} — sem munição ${calibreSpec.displayLabel} em estoque.`,
          { id: user.id, name: user.name, masp: user.masp, role: user.role },
          clientIp
        );

        return res.status(200).json({
          sucesso: true,
          status: 'sem_registros',
          tipo_relatorio: 'municoes',
          modo_relatorio: modoRelatorio,
          calibre: calibreSpec.displayLabel,
          unidade: selection.displayName,
          mensagem: 'Não temos esse tipo de munição na unidade selecionada'
        });
      }

      const totalMunicoes = records.reduce((acc, r) => acc + Math.max(0, Number(r.quantidade || 0)), 0);

      // 7. Gerar PDF detalhado e salvar em diretório confinado acessível por HTTPS
      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome =
        modoRelatorio === 'por_unidade'
          ? `relacao-municoes-unidade-${selection.fileSlug}.pdf`
          : `relacao-municoes-${calibreSpec.fileSlug}-${selection.fileSlug}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);

      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      try {
        const pdfBuffer = await generateMunicoesPdfBuffer({
          calibreSpec,
          modoRelatorio,
          unidadeLabel: selection.displayName,
          solicitacaoId,
          geradoEm,
          solicitanteNome: user.name,
          solicitanteMasp: user.masp,
          telefoneUsuario: telefoneDigits,
          logoDataUri: selection.logoDataUri,
          records
        });
        fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
        fs.writeFileSync(targetPath, pdfBuffer);
      } catch (pdfErr: any) {
        console.error(`[Relatorios API] Erro ao gerar/salvar PDF de munições (${calibreSpec.displayLabel}):`, pdfErr?.message);
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: selection.displayName,
          unidadeCodigo: selection.fileSlug,
          unidadeIdResolvida: selection.unitIds.length === 1 ? selection.unitIds[0] : null,
          telefoneUsuario: telefoneDigits,
          usuario: user,
          status: 'erro',
          totalRegistros: records.length,
          dataSolicitacao,
          erroCodigo: 'ERRO_GERACAO_PDF',
          erroMensagem: pdfErr?.message || 'Falha ao gerar PDF.',
          ipOrigem: clientIp
        });
        return res.status(500).json({
          sucesso: false,
          status: 'erro',
          codigo: 'ERRO_GERACAO_PDF',
          mensagem: 'Não foi possível gerar o relatório.'
        });
      }

      const baseUrl = resolvePublicHttpsBaseUrl(req, tokenCheck.callbackUrlPublica);
      const arquivoUrl = `${baseUrl}/arquivos/${arquivoToken}/${encodeURIComponent(arquivoNome)}`;

      await logSolicitacaoDb(pool, {
        idRegistro,
        solicitacaoId,
        tipoRelatorio: tipoRelatorioDb,
        unidadeSolicitada: selection.displayName,
        unidadeCodigo: selection.fileSlug,
        unidadeIdResolvida: selection.unitIds.length === 1 ? selection.unitIds[0] : null,
        telefoneUsuario: telefoneDigits,
        usuario: user,
        status: 'concluido',
        arquivoNome,
        arquivoToken,
        arquivoCaminho: storedFilename,
        totalRegistros: records.length,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        modoRelatorio === 'por_unidade'
          ? 'Gerar PDF de Munições por Unidade (Make.com)'
          : `Gerar PDF de Munições ${calibreSpec.displayLabel} (Make.com)`,
        `Solicitação ${solicitacaoId}: ${records.length} lote(s) / ${totalMunicoes} munições (${modoRelatorio === 'por_unidade' ? 'Relação por Unidade' : calibreSpec.displayLabel}) da unidade ${selection.displayName} — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: 'municoes',
        modo_relatorio: modoRelatorio,
        calibre: calibreSpec.displayLabel,
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        solicitacao_id: solicitacaoId,
        total_registros: records.length,
        total_municoes: totalMunicoes,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em POST /api/relatorios/municoes:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar o relatório.'
      });
    }
  };

  // Endpoint principal de munições (aceita calibre para "Relação por calibre" ou sem calibre para "Relação por unidade")
  apiRouter.post('/relatorios/municoes', (req: Request, res: Response) =>
    handleMunicoesReportRequest(req, res)
  );

  // Endpoints dedicados para "Relação por unidade" (todos os calibres da unidade selecionada)
  apiRouter.post(['/relatorios/municoes/unidade', '/relatorios/municoes/por-unidade'], (req: Request, res: Response) =>
    handleMunicoesReportRequest(req, res, undefined, 'por_unidade')
  );

  // Endpoints dedicados por calibre na URL (ex: /api/relatorios/municoes/9x19mm, /5-56x45mm, /7-62x51mm, /308winchester, /40sw, /12ga, /todos)
  apiRouter.post('/relatorios/municoes/:calibre', (req: Request, res: Response) =>
    handleMunicoesReportRequest(req, res, String(req.params.calibre || ''))
  );
}

// ============================================================================
// AUXILIARES E GERADOR DE PDF DETALHADO DE MUNIÇÕES
// ============================================================================
interface MunicaoCalibreSpec {
  key: string;
  displayLabel: string;
  fileSlug: string;
  isTodos: boolean;
  matcher: (normalizedDbCalibre: string) => boolean;
}

interface MunicaoStockRecord {
  id: string;
  unidadeId: string;
  unidadeNome: string;
  calibreNome: string;
  fabricante: string;
  tipo: string;
  peso: string;
  lote: string;
  anoFabricacao: string;
  destinacao: string;
  cofreCodigo: string;
  cofreDescricao: string;
  quantidade: number;
  atualizadoEm: string;
  observacao: string;
}

function compactCalibreCode(val?: string | null): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(?:municoes?|municao|mun|calibre|cal|relatorio)[_\-\s:]+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function resolveMunicaoCalibreSpec(raw?: string | null): MunicaoCalibreSpec | null {
  const cleanRaw = String(raw || '').trim();
  const compact = compactCalibreCode(cleanRaw);
  if (!compact) return null;

  if (compact === 'todos' || compact === 'todas' || compact === 'geral' || compact === 'all') {
    return {
      key: 'todos',
      displayLabel: 'Todos os Calibres',
      fileSlug: 'TODOS',
      isTodos: true,
      matcher: () => true
    };
  }

  if (compact === '9x19mm' || compact === '9x19' || compact === '9mm' || compact === '9') {
    return {
      key: '9x19mm',
      displayLabel: '9x19mm',
      fileSlug: '9x19mm',
      isTodos: false,
      matcher: db => db.includes('9x19') || db === '9mm'
    };
  }

  if (compact === '556x45mm' || compact === '556x45' || compact === '556mm' || compact === '556') {
    return {
      key: '5,56x45mm',
      displayLabel: '5,56x45mm',
      fileSlug: '5-56x45mm',
      isTodos: false,
      matcher: db => db.includes('556')
    };
  }

  if (compact === '762x51mm' || compact === '762x51' || compact === '762mm' || compact === '762') {
    return {
      key: '7,62x51mm',
      displayLabel: '7,62x51mm',
      fileSlug: '7-62x51mm',
      isTodos: false,
      matcher: db => db.includes('762')
    };
  }

  if (compact === '308winchester' || compact === '308win' || compact === '308') {
    return {
      key: '.308Winchester',
      displayLabel: '.308 Winchester',
      fileSlug: '308Winchester',
      isTodos: false,
      matcher: db => db.includes('308')
    };
  }

  if (compact === '40sw' || compact === '40' || compact === '40mm') {
    return {
      key: '.40S&W',
      displayLabel: '.40 S&W',
      fileSlug: '40SW',
      isTodos: false,
      matcher: db => db.startsWith('40') || db.includes('40sw')
    };
  }

  if (compact === '12ga' || compact === '12' || compact === '12gauge') {
    return {
      key: '12Ga',
      displayLabel: '12 Ga',
      fileSlug: '12Ga',
      isTodos: false,
      matcher: db => db === '12' || db.startsWith('12ga')
    };
  }

  return {
    key: cleanRaw,
    displayLabel: cleanRaw,
    fileSlug: sanitizeFileSlug(cleanRaw),
    isTodos: false,
    matcher: db => db === compact || db.includes(compact)
  };
}

async function queryMunicoesByCalibreAndUnit(
  pool: any,
  calibreSpec: MunicaoCalibreSpec,
  unitIds: string[],
  incluirZerados = false
): Promise<MunicaoStockRecord[]> {
  let sql = `
    SELECT
      e.ID_ESTOQUE_MUNICOES,
      e.UNIDADE_ID_ESTOQUE_MUNICOES,
      e.QUANTIDADE_ESTOQUE_MUNICOES,
      e.LOTE_MUNICAO,
      e.ANO_FABRICACAO_MUNICAO,
      e.DESTINACAO_MUNICAO,
      e.OBSERVACAO_ESTOQUE_MUNICAO,
      e.DATA_ATUALIZACAO_ESTOQUE_MUNICOES,
      COALESCE(NULLIF(TRIM(e.FABRICANTE_MUNICAO), ''), c.FABRICANTE_CALIBRES, '') AS FABRICANTE_FINAL,
      COALESCE(NULLIF(TRIM(e.TIPO_MUNICAO), ''), c.TIPO_CALIBRES, '') AS TIPO_FINAL,
      COALESCE(NULLIF(TRIM(e.PESO_MUNICAO), ''), c.PESO_CALIBRES, '') AS PESO_FINAL,
      c.NOME_CALIBRES,
      u.NOME_UNIDADES,
      cf.CODIGO_COFRES,
      cf.DESCRICAO_CURTA_COFRES
    FROM ESTOQUE_MUNICOES e
    INNER JOIN CALIBRES c ON c.ID_CALIBRES = e.CALIBRE_ID_ESTOQUE_MUNICOES
    LEFT JOIN UNIDADES u ON u.ID_UNIDADES = e.UNIDADE_ID_ESTOQUE_MUNICOES
    LEFT JOIN COFRES cf ON cf.ID_COFRES = e.COFRE_ID_ESTOQUE_MUNICOES
    WHERE 1=1
  `;
  const params: any[] = [];

  if (!incluirZerados) {
    sql += ' AND e.QUANTIDADE_ESTOQUE_MUNICOES > 0';
  }

  if (unitIds.length > 0) {
    const placeholders = unitIds.map(() => '?').join(', ');
    sql += ` AND e.UNIDADE_ID_ESTOQUE_MUNICOES IN (${placeholders})`;
    params.push(...unitIds);
  }

  sql += ' ORDER BY u.NOME_UNIDADES ASC, c.NOME_CALIBRES ASC, e.DESTINACAO_MUNICAO ASC, TIPO_FINAL ASC, e.ANO_FABRICACAO_MUNICAO ASC, e.LOTE_MUNICAO ASC';

  const [rows]: any = await pool.query(sql, params);
  const mapped: MunicaoStockRecord[] = (rows || []).map((r: any) => ({
    id: String(r.ID_ESTOQUE_MUNICOES || ''),
    unidadeId: String(r.UNIDADE_ID_ESTOQUE_MUNICOES || ''),
    unidadeNome: String(r.NOME_UNIDADES || 'Sem Unidade'),
    calibreNome: String(r.NOME_CALIBRES || '—'),
    fabricante: String(r.FABRICANTE_FINAL || '—'),
    tipo: String(r.TIPO_FINAL || '—'),
    peso: String(r.PESO_FINAL || ''),
    lote: String(r.LOTE_MUNICAO || 'Não informado'),
    anoFabricacao: r.ANO_FABRICACAO_MUNICAO ? String(r.ANO_FABRICACAO_MUNICAO) : '—',
    destinacao: String(r.DESTINACAO_MUNICAO || 'Não informada'),
    cofreCodigo: String(r.CODIGO_COFRES || '—'),
    cofreDescricao: String(r.DESCRICAO_CURTA_COFRES || ''),
    quantidade: Number(r.QUANTIDADE_ESTOQUE_MUNICOES || 0),
    atualizadoEm: r.DATA_ATUALIZACAO_ESTOQUE_MUNICOES
      ? formatDateTimeBr(new Date(r.DATA_ATUALIZACAO_ESTOQUE_MUNICOES)).slice(0, 10)
      : '',
    observacao: String(r.OBSERVACAO_ESTOQUE_MUNICAO || '').trim()
  }));

  if (calibreSpec.isTodos) return mapped;
  return mapped.filter(item => calibreSpec.matcher(compactCalibreCode(item.calibreNome)));
}

function wrapCellLines(text: string, font: PDFFont, fontSize: number, maxWidth: number, maxLines = 6): string[] {
  const clean = sanitizePdfText(text).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return ['-'];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let part = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(part + ch, fontSize) > maxWidth) {
            if (part) lines.push(part);
            part = ch;
          } else {
            part += ch;
          }
        }
        current = part;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const trimmed = lines.slice(0, maxLines);
  trimmed[maxLines - 1] = fitTextToWidth(`${trimmed[maxLines - 1]}...`, font, fontSize, maxWidth);
  return trimmed;
}

function formatIntBr(n: number): string {
  try {
    return new Intl.NumberFormat('pt-BR').format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

async function generateMunicoesPdfBuffer(params: {
  calibreSpec: MunicaoCalibreSpec;
  modoRelatorio: 'por_calibre' | 'por_unidade';
  unidadeLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  telefoneUsuario: string;
  logoDataUri: string | null;
  records: MunicaoStockRecord[];
}): Promise<Buffer> {
  const isPorUnidade = params.modoRelatorio === 'por_unidade';
  const doc = await PDFDocument.create();
  doc.setTitle(
    isPorUnidade
      ? `Relação de Munições por Unidade - ${params.unidadeLabel}`
      : `Relação de Munições (${params.calibreSpec.displayLabel}) - ${params.unidadeLabel}`
  );
  doc.setAuthor('Sistema Arsenal - Polícia Civil de Minas Gerais');
  doc.setCreator('API Arsenal Make.com / WhatsApp');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await tryEmbedLogoImage(doc, params.logoDataUri);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2;
  const footerHeight = 32;

  const totalLotes = params.records.length;
  const totalQtd = params.records.reduce((s, r) => s + r.quantidade, 0);
  const operacionalQtd = params.records
    .filter(r => normalizeKey(r.destinacao).includes('OPERAC'))
    .reduce((s, r) => s + r.quantidade, 0);
  const treinamentoQtd = params.records
    .filter(r => normalizeKey(r.destinacao).includes('TREIN'))
    .reduce((s, r) => s + r.quantidade, 0);
  const outrosQtd = Math.max(0, totalQtd - operacionalQtd - treinamentoQtd);

  const byCalibreMap = new Map<string, number>();
  const byTypeMap = new Map<string, number>();
  const byUnitMap = new Map<string, number>();
  for (const r of params.records) {
    byCalibreMap.set(r.calibreNome, (byCalibreMap.get(r.calibreNome) || 0) + r.quantidade);
    const typeKey = [r.calibreNome, r.tipo && r.tipo !== '—' ? r.tipo : '', r.peso].filter(Boolean).join(' ');
    byTypeMap.set(typeKey, (byTypeMap.get(typeKey) || 0) + r.quantidade);
    byUnitMap.set(r.unidadeNome, (byUnitMap.get(r.unidadeNome) || 0) + r.quantidade);
  }

  const calibresResumo = Array.from(byCalibreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${formatIntBr(v)}`)
    .join('  |  ');

  const tiposResumo = Array.from(byTypeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${formatIntBr(v)}`)
    .join('  |  ');

  const unidadesResumo =
    byUnitMap.size > 1
      ? Array.from(byUnitMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}: ${formatIntBr(v)}`)
          .join('  |  ')
      : '';

  const fixedColsWidth = 22 + 56 + 106 + 44 + 132 + 74 + 92 + 52;
  const columns = [
    { key: 'idx', label: '#', width: 22 },
    { key: 'unidade', label: 'UNIDADE', width: 56 },
    { key: 'calibreTipo', label: 'CALIBRE / TIPO / PESO', width: 106 },
    { key: 'fab', label: 'FAB.', width: 44 },
    { key: 'loteAno', label: 'LOTE / ANO FAB.', width: 132 },
    { key: 'destinacao', label: 'DESTINACAO', width: 74 },
    { key: 'cofre', label: 'COFRE / LOCAL', width: 92 },
    { key: 'qtd', label: 'QTD', width: 52 },
    { key: 'obs', label: 'OBSERVACOES / ATUALIZACAO', width: contentWidth - fixedColsWidth }
  ];

  const drawPageHeader = (page: PDFPage, isFirstPage: boolean): number => {
    page.drawRectangle({
      x: 0,
      y: pageHeight - 70,
      width: pageWidth,
      height: 70,
      color: rgb(0.06, 0.1, 0.17)
    });
    page.drawRectangle({
      x: 0,
      y: pageHeight - 73,
      width: pageWidth,
      height: 3,
      color: rgb(0.85, 0.65, 0.13)
    });

    let titleStartX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(46, 46);
      page.drawImage(logoImage, {
        x: marginX,
        y: pageHeight - 58 + (46 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      titleStartX = marginX + 56;
    }

    page.drawText('POLICIA CIVIL DE MINAS GERAIS - SISTEMA ARSENAL / ARMARIA', {
      x: titleStartX,
      y: pageHeight - 24,
      size: 8.5,
      font: fontBold,
      color: rgb(0.96, 0.78, 0.25)
    });

    const headerTitle = isPorUnidade
      ? `RELACAO DE MUNICOES POR UNIDADE - ${params.unidadeLabel.toUpperCase()}`
      : `RELACAO DE MUNICOES (${params.calibreSpec.displayLabel.toUpperCase()}) - ${params.unidadeLabel.toUpperCase()}`;
    page.drawText(
      fitTextToWidth(headerTitle, fontBold, 13.5, contentWidth - (titleStartX - marginX) - 20),
      {
        x: titleStartX,
        y: pageHeight - 44,
        size: 13.5,
        font: fontBold,
        color: rgb(1, 1, 1)
      }
    );

    page.drawText(
      `Emitido em: ${formatDateTimeBr(params.geradoEm)} | Protocolo: ${sanitizePdfText(params.solicitacaoId).slice(0, 44)}`,
      {
        x: titleStartX,
        y: pageHeight - 60,
        size: 8,
        font: fontRegular,
        color: rgb(0.82, 0.86, 0.92)
      }
    );

    let y = pageHeight - 86;

    if (isFirstPage) {
      const cardHeight = unidadesResumo ? 72 : 58;
      page.drawRectangle({
        x: marginX,
        y: y - cardHeight,
        width: contentWidth,
        height: cardHeight,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.82, 0.85, 0.9),
        borderWidth: 0.75
      });

      const metaLine1 = `Solicitante: ${sanitizePdfText(params.solicitanteNome)} (MASP: ${sanitizePdfText(params.solicitanteMasp || '-')})  |  WhatsApp: ${sanitizePdfText(params.telefoneUsuario)}`;
      const metaLine2 = `Total em Estoque: ${formatIntBr(totalQtd)} municoes (${totalLotes} lote(s))   |   Operacional: ${formatIntBr(operacionalQtd)}   |   Treinamento: ${formatIntBr(treinamentoQtd)}   |   Reserva/Outros: ${formatIntBr(outrosQtd)}`;
      const metaLine3 =
        isPorUnidade || params.calibreSpec.isTodos
          ? `Subtotais por Calibre: ${calibresResumo || '-'}`
          : `Subtotais por Tipo: ${tiposResumo || '-'}`;

      page.drawText(fitTextToWidth(metaLine1, fontRegular, 8.2, contentWidth - 16), {
        x: marginX + 8,
        y: y - 14,
        size: 8.2,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.28)
      });
      page.drawText(fitTextToWidth(metaLine2, fontBold, 8.8, contentWidth - 16), {
        x: marginX + 8,
        y: y - 29,
        size: 8.8,
        font: fontBold,
        color: rgb(0.06, 0.25, 0.2)
      });
      page.drawText(fitTextToWidth(metaLine3, fontRegular, 7.8, contentWidth - 16), {
        x: marginX + 8,
        y: y - 44,
        size: 7.8,
        font: fontRegular,
        color: rgb(0.2, 0.25, 0.34)
      });
      if (unidadesResumo) {
        page.drawText(fitTextToWidth(`Por Unidade: ${unidadesResumo}`, fontBold, 7.8, contentWidth - 16), {
          x: marginX + 8,
          y: y - 59,
          size: 7.8,
          font: fontBold,
          color: rgb(0.12, 0.18, 0.32)
        });
      }
      y -= cardHeight + 10;
    }

    const headerRowHeight = 20;
    page.drawRectangle({
      x: marginX,
      y: y - headerRowHeight,
      width: contentWidth,
      height: headerRowHeight,
      color: rgb(0.11, 0.17, 0.27)
    });

    let colX = marginX;
    for (const col of columns) {
      page.drawText(col.label, {
        x: colX + 4,
        y: y - 13.5,
        size: 7.3,
        font: fontBold,
        color: rgb(1, 1, 1)
      });
      colX += col.width;
    }

    return y - headerRowHeight;
  };

  let page = doc.addPage([pageWidth, pageHeight]);
  let cursorY = drawPageHeader(page, true);
  const fontSize = 7.4;
  const lineHeight = 9.8;

  params.records.forEach((rec, index) => {
    const calibreTipoText = [rec.calibreNome, rec.tipo && rec.tipo !== '—' ? rec.tipo : '', rec.peso]
      .filter(Boolean)
      .join(' - ');
    const loteAnoText =
      rec.anoFabricacao && rec.anoFabricacao !== '—'
        ? `${rec.lote} (Ano: ${rec.anoFabricacao})`
        : rec.lote;
    const cofreText = rec.cofreDescricao
      ? `${rec.cofreCodigo} (${rec.cofreDescricao})`
      : rec.cofreCodigo;
    const obsText = [
      rec.observacao,
      rec.atualizadoEm ? `Atualizado: ${rec.atualizadoEm}` : ''
    ]
      .filter(Boolean)
      .join(' | ');

    const rawValues: Record<string, string> = {
      idx: String(index + 1),
      unidade: rec.unidadeNome,
      calibreTipo: calibreTipoText || '-',
      fab: rec.fabricante,
      loteAno: loteAnoText,
      destinacao: rec.destinacao,
      cofre: cofreText,
      qtd: formatIntBr(rec.quantidade),
      obs: obsText || '-'
    };

    const wrappedByCol: Record<string, string[]> = {};
    let maxLineCount = 1;
    for (const col of columns) {
      const f = col.key === 'qtd' ? fontBold : fontRegular;
      const lines = wrapCellLines(rawValues[col.key] || '-', f, fontSize, col.width - 7, 6);
      wrappedByCol[col.key] = lines;
      if (lines.length > maxLineCount) maxLineCount = lines.length;
    }

    const rowHeight = Math.max(18, maxLineCount * lineHeight + 7);
    if (cursorY - rowHeight < footerHeight + 12) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursorY = drawPageHeader(page, false);
    }

    const rowBottomY = cursorY - rowHeight;
    if (index % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: rowBottomY,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.97, 0.98, 0.99)
      });
    }
    page.drawLine({
      start: { x: marginX, y: rowBottomY },
      end: { x: marginX + contentWidth, y: rowBottomY },
      thickness: 0.4,
      color: rgb(0.86, 0.89, 0.93)
    });

    let colX = marginX;
    for (const col of columns) {
      const lines = wrappedByCol[col.key] || ['-'];
      const f = col.key === 'qtd' ? fontBold : fontRegular;
      lines.forEach((line, lineIdx) => {
        page.drawText(line, {
          x: colX + 4,
          y: cursorY - 10.5 - lineIdx * lineHeight,
          size: fontSize,
          font: f,
          color: col.key === 'qtd' ? rgb(0.06, 0.3, 0.22) : rgb(0.1, 0.13, 0.18)
        });
      });
      colX += col.width;
    }

    cursorY = rowBottomY;
  });

  // Linha de total geral ao final da tabela
  if (cursorY - 22 < footerHeight + 10) {
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawPageHeader(page, false);
  }
  const totalBarY = cursorY - 20;
  page.drawRectangle({
    x: marginX,
    y: totalBarY,
    width: contentWidth,
    height: 20,
    color: rgb(0.9, 0.94, 0.97),
    borderColor: rgb(0.75, 0.8, 0.86),
    borderWidth: 0.6
  });
  page.drawText(
    isPorUnidade
      ? `TOTAL GERAL (POR UNIDADE - ${params.unidadeLabel.toUpperCase()}): ${formatIntBr(totalQtd)} MUNICOES EM ${totalLotes} LOTE(S)`
      : `TOTAL GERAL (${params.calibreSpec.displayLabel.toUpperCase()} - ${params.unidadeLabel.toUpperCase()}): ${formatIntBr(totalQtd)} MUNICOES EM ${totalLotes} LOTE(S)`,
    {
      x: marginX + 8,
      y: totalBarY + 6,
      size: 8.3,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.26)
    }
  );

  // Rodapé institucional em todas as páginas
  const pages = doc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: marginX, y: 26 },
      end: { x: pageWidth - marginX, y: 26 },
      thickness: 0.6,
      color: rgb(0.78, 0.82, 0.87)
    });
    p.drawText(
      `Sistema Arsenal PCMG - Relatorio de Municoes (Uso Restrito) | Solicitacao: ${sanitizePdfText(params.solicitacaoId).slice(0, 36)}`,
      {
        x: marginX,
        y: 13,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.42, 0.47, 0.54)
      }
    );
    const pageLabel = `Pagina ${idx + 1} de ${totalPages}`;
    const labelW = fontBold.widthOfTextAtSize(pageLabel, 7.5);
    p.drawText(pageLabel, {
      x: pageWidth - marginX - labelW,
      y: 13,
      size: 7.5,
      font: fontBold,
      color: rgb(0.3, 0.35, 0.42)
    });
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// Rota HTTPS pública de entrega do PDF gerado (com token criptográfico de 128 bits e expiração automática)
export function registerRelatoriosArquivosRoute(app: Express, deps: { getPool: () => any }): void {
  const { getPool } = deps;

  app.get('/arquivos/:token/:filename', async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || '').trim();
      const filename = String(req.params.filename || '').trim();

      if (!/^[a-f0-9]{24,64}$/.test(token) || !/^[a-zA-Z0-9._-]+\.pdf$/.test(filename)) {
        return res.status(404).json({
          sucesso: false,
          status: 'erro',
          codigo: 'ARQUIVO_NAO_ENCONTRADO',
          mensagem: 'Arquivo inválido ou não encontrado.'
        });
      }

      const pool = getPool();
      await ensureRelatoriosApiSchema(pool);

      const [rows]: any = await pool.query(
        `SELECT ARQUIVO_NOME, ARQUIVO_CAMINHO, EXPIRA_EM
         FROM RELATORIOS_API_SOLICITACOES
         WHERE ARQUIVO_TOKEN = ? AND STATUS = 'concluido'
         LIMIT 1`,
        [token]
      );

      const row = rows?.[0];
      if (!row || row.ARQUIVO_NOME !== filename) {
        return res.status(404).json({
          sucesso: false,
          status: 'erro',
          codigo: 'ARQUIVO_NAO_ENCONTRADO',
          mensagem: 'Relatório não encontrado.'
        });
      }

      const expiraEm = row.EXPIRA_EM ? new Date(row.EXPIRA_EM) : null;
      const storedName = path.basename(String(row.ARQUIVO_CAMINHO || ''));
      const resolvedPath = path.resolve(PDF_STORAGE_DIR, storedName);

      if (!storedName || !resolvedPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        return res.status(404).json({
          sucesso: false,
          status: 'erro',
          codigo: 'ARQUIVO_NAO_ENCONTRADO',
          mensagem: 'Relatório indisponível.'
        });
      }

      if (expiraEm && expiraEm.getTime() < Date.now()) {
        if (fs.existsSync(resolvedPath)) {
          try {
            fs.unlinkSync(resolvedPath);
          } catch {}
        }
        return res.status(410).json({
          sucesso: false,
          status: 'erro',
          codigo: 'LINK_EXPIRADO',
          mensagem: 'O link deste relatório expirou. Solicite um novo PDF pelo WhatsApp.'
        });
      }

      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({
          sucesso: false,
          status: 'erro',
          codigo: 'ARQUIVO_INDISPONIVEL',
          mensagem: 'Arquivo expirado ou removido do servidor. Solicite novamente pelo WhatsApp.'
        });
      }

      const safeDownloadName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.sendFile(resolvedPath);
    } catch (err: any) {
      console.error('[Relatorios API] Erro ao servir arquivo PDF:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_DOWNLOAD_PDF',
        mensagem: 'Não foi possível carregar o relatório PDF.'
      });
    }
  });
}
