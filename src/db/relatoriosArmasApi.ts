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

function stripInteractiveUnitPrefix(raw: string): string {
  return normalizeKey(raw).replace(/^(?:FUZIS?|ARMAS?|UNIDADE|UNIT|RELATORIO)[_\-\s:]+/i, '').trim();
}

async function resolveUnitSelectionForUser(
  pool: any,
  user: ResolvedWhatsappUser,
  unidadeRaw: string,
  unidadeCodigoRaw: string
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
      mensagem: `Usuário sem permissão para consultar os fuzis da unidade ${matchedName}.`
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

async function queryFuzisByUnit(pool: any, unitIds: string[]): Promise<FuzilRecord[]> {
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
  const params: any[] = ['%fuzil%'];

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

async function generateFuzisPdfBuffer(params: {
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
  doc.setTitle(`Relação de Fuzis - ${params.unidadeLabel}`);
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
      fitTextToWidth(`RELACAO DE FUZIS - ${params.unidadeLabel.toUpperCase()}`, fontBold, 14, contentWidth - (titleStartX - marginX) - 180),
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
      const metaLine2 = `Total de Fuzis: ${totalCount}   |   No Cofre: ${noCofreCount}   |   Acautelados: ${acauteladoCount}   |   Outros / Manutencao: ${outrosCount}`;

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
      ) VALUES (?, ?, 'FUZIS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
      [
        entry.idRegistro,
        entry.solicitacaoId.slice(0, 128),
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

  // POST /api/relatorios/fuzis — Integração Make.com / Chatbot WhatsApp
  apiRouter.post('/relatorios/fuzis', async (req: Request, res: Response) => {
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
      const idRegistro = `rel-fuz-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
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
      const unitResolution = await resolveUnitSelectionForUser(pool, user, unidade, unidadeCodigo);
      if ('codigo' in unitResolution) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
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

      // 6. Buscar registros de fuzis na tabela ARMAS
      const records = await queryFuzisByUnit(pool, selection.unitIds);

      if (records.length === 0) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
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
          'Relatório de Fuzis (Sem Registros)',
          `Solicitação ${solicitacaoId} via Make.com para unidade ${selection.displayName} — nenhum fuzil encontrado.`,
          { id: user.id, name: user.name, masp: user.masp, role: user.role },
          clientIp
        );

        return res.status(200).json({
          sucesso: true,
          status: 'sem_registros',
          unidade: selection.displayName,
          mensagem: 'Não foram encontrados fuzis para a unidade selecionada.'
        });
      }

      // 7. Gerar PDF e salvar em diretório confinado acessível por HTTPS
      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `relacao-fuzis-${selection.fileSlug}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);

      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateFuzisPdfBuffer({
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
        console.error('[Relatorios API] Erro ao gerar/salvar PDF de fuzis:', pdfErr?.message);
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
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
        'Gerar PDF de Fuzis (Make.com)',
        `Solicitação ${solicitacaoId}: ${records.length} fuzil(is) da unidade ${selection.displayName} — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
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
      console.error('[Relatorios API] Erro inesperado em POST /api/relatorios/fuzis:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar o relatório.'
      });
    }
  });
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
