import { Express, Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveWhatsappUserContext, PermittedUnit, ResolvedWhatsappUser } from './whatsappBotEngine';
import { decryptSecret } from './whatsappRoutes';
import {
  formatDateTimeBr,
  formatMaspBr,
  generateSystemArmasPdf,
  generateSystemMunicoesPdf,
  generateSystemExplosivosPdf,
  generateSystemMateriaisPdf,
  generateSystemSinopseOperacionalPdf,
  generateSystemSinopseTreinamentoPdf,
  generateSystemFichaDesempenhoIndividualPdf,
  generateSystemFichaDesempenhoUnidadePdf,
  generateSystemFichaDesempenhoK9Pdf,
  SystemArmaPdfRecord,
  SystemMunicaoPdfRecord,
  SystemExplosivoPdfRecord,
  SystemMaterialPdfRecord,
  SystemCatOpPdfRecord,
  SystemPolicialOpPdfRecord,
  SystemCanilOpPdfRecord,
  SystemPolicialTreinPdfRecord,
  SystemCanilTreinPdfRecord,
  DesempenhoCategoriaPdf,
  SystemDesempenhoResultadoPdf,
  SystemDesempenhoUsuarioPdf,
  SystemDesempenhoMarcadorPdf,
  SystemDesempenhoAtividadePdf,
  SystemK9AnimalPdf,
  SystemK9TopicBarPdf,
  SystemK9VacinaPdf,
  SystemK9MedicoPdf,
  SystemK9MedicamentoPdf
} from './institutionalPdfTemplates';

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

interface ResolvedUnitSelection {
  isTodos: boolean;
  displayName: string;
  departmentName: string;
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
      /^(?:FUZIS?|SUBMETRALHADORAS?|SUBMET|SMT|ESPINGARDAS?|ESP|MUNICOES?|MUNICAO|MUN|EXPLOSIVOS?|EXPLOSIVO|EXP|MATERIAIS?|MATERIAL|MAT|SINOPSE|OPERACIONAL|OPERACOES|OPERACAO|OP|HIST|CALIBRE|CAL|ARMAS?|FICHAS?|DESEMPENHO|INDIVIDUAL|FISICAS?|FISICOS?|TATICO|TATICOS?|K9|CANIL|UNIDADE|UNIT|RELATORIO)[_\-\s:]+/i,
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
    let deptName = 'POLÍCIA CIVIL DE MINAS GERAIS';
    if (user.departmentId) {
      try {
        const [dRows]: any = await pool.query(
          'SELECT NOME_DEPARTAMENTOS, LOGO_URL_DEPARTAMENTOS FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTOS = ? LIMIT 1',
          [user.departmentId]
        );
        deptLogo = dRows?.[0]?.LOGO_URL_DEPARTAMENTOS || null;
        if (dRows?.[0]?.NOME_DEPARTAMENTOS) deptName = String(dRows[0].NOME_DEPARTAMENTOS);
      } catch {}
    }

    return {
      ok: true,
      selection: {
        isTodos: true,
        displayName: user.isGlobal ? 'Todas as Unidades' : 'Todas as Unidades Permitidas',
        departmentName: deptName,
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
  let departmentName = 'POLÍCIA CIVIL DE MINAS GERAIS';
  if (matchUnit.DEPARTAMENTO_ID_UNIDADES) {
    try {
      const [dRows]: any = await pool.query(
        'SELECT NOME_DEPARTAMENTOS, LOGO_URL_DEPARTAMENTOS FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTOS = ? LIMIT 1',
        [matchUnit.DEPARTAMENTO_ID_UNIDADES]
      );
      if (dRows?.[0]?.NOME_DEPARTAMENTOS) departmentName = String(dRows[0].NOME_DEPARTAMENTOS);
      if (!logoDataUri && dRows?.[0]?.LOGO_URL_DEPARTAMENTOS) {
        logoDataUri = dRows[0].LOGO_URL_DEPARTAMENTOS;
      }
    } catch {}
  }

  return {
    ok: true,
    selection: {
      isTodos: false,
      displayName: matchedName,
      departmentName,
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
): Promise<SystemArmaPdfRecord[]> {
  let sql = `
    SELECT
      a.ID_ARMAS,
      a.TIPO_ARMAS,
      a.NUMERO_SERIE_ARMAS,
      a.FABRICANTE_ARMAS,
      a.MODELO_ARMAS,
      a.CALIBRE_ARMAS,
      a.STATUS_ARMAS,
      a.UNIDADE_ID_ARMAS,
      a.POLICIAL_ACAUTELADO_ARMAS,
      a.QUANTIDADE_CARREGADORES_ARMAS,
      a.TIROS_DISPARADOS_ARMAS,
      a.DATA_ULTIMA_MANUTENCAO_ARMAS,
      a.RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS,
      a.OBSERVACAO_LOCALIZACAO_ARMAS,
      u.NOME_UNIDADES,
      c.CODIGO_COFRES,
      c.TIPO_COFRES
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
  return (rows || []).map((r: any) => {
    const manut = formatDateOnlyBr(r.DATA_ULTIMA_MANUTENCAO_ARMAS);
    return {
      id: String(r.ID_ARMAS || ''),
      tipo: String(r.TIPO_ARMAS || weaponSpec.pluralLabel),
      numeroSerie: String(r.NUMERO_SERIE_ARMAS || '—'),
      fabricante: String(r.FABRICANTE_ARMAS || ''),
      modelo: String(r.MODELO_ARMAS || '—'),
      calibre: String(r.CALIBRE_ARMAS || '—'),
      status: String(r.STATUS_ARMAS || 'No Cofre'),
      unidadeNome: String(r.NOME_UNIDADES || 'Sem Unidade'),
      cofreCodigo: String(r.CODIGO_COFRES || ''),
      cofreTipo: String(r.TIPO_COFRES || ''),
      policialAcautelado: String(r.POLICIAL_ACAUTELADO_ARMAS || ''),
      carregadores: Number(r.QUANTIDADE_CARREGADORES_ARMAS || 0),
      tirosDisparados: Number(r.TIROS_DISPARADOS_ARMAS || 0),
      ultimaManutencaoData: manut.formatted === '—' ? '' : manut.formatted,
      ultimaManutencaoResp: String(r.RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS || ''),
      observacao: String(r.OBSERVACAO_LOCALIZACAO_ARMAS || '')
    };
  });
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
        pdfBuffer = await generateSystemArmasPdf({
          tituloDoc: weaponSpec.tituloDoc,
          filtroTipoLabel: weaponSpec.pluralLabel,
          departamentoLabel: selection.departmentName,
          unidadeLabel: selection.displayName,
          solicitacaoId,
          geradoEm,
          solicitanteNome: user.name,
          solicitanteMasp: user.masp,
          solicitanteRole: user.role,
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
        const pdfBuffer = await generateSystemMunicoesPdf({
          calibreDisplayLabel: calibreSpec.displayLabel,
          isTodosCalibres: calibreSpec.isTodos,
          modoRelatorio,
          departamentoLabel: selection.departmentName,
          unidadeLabel: selection.displayName,
          solicitacaoId,
          geradoEm,
          solicitanteNome: user.name,
          solicitanteMasp: user.masp,
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

  // ============================================================================
  // ENDPOINTS DE EXPLOSIVOS E MATERIAIS POR UNIDADE (Make.com / Chatbot WhatsApp)
  // ============================================================================
  const handleAssetUnitReportRequest = async (
    req: Request,
    res: Response,
    kind: 'explosivos' | 'materiais'
  ) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const isExplosivos = kind === 'explosivos';
    const tipoRelatorioDb = isExplosivos ? 'EXPLOSIVOS' : 'MATERIAIS';
    const idPrefix = isExplosivos ? 'rel-exp' : 'rel-mat';
    const acessoAlvo = isExplosivos ? 'os explosivos' : 'os materiais';
    const tituloAcao = isExplosivos ? 'Explosivos' : 'Materiais';
    const semRegistrosMsg = isExplosivos
      ? 'Não temos explosivos disponíveis na unidade selecionada'
      : 'Não temos materiais disponíveis na unidade selecionada';

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
      const idRegistro = `${idPrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
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
      const unitResolution = await resolveUnitSelectionForUser(pool, user, unidade, unidadeCodigo, acessoAlvo);
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

      // 6. Consultar registros no banco
      const explosivosRecords = isExplosivos ? await queryExplosivosByUnit(pool, selection.unitIds) : [];
      const materiaisRecords = !isExplosivos ? await queryMateriaisByUnit(pool, selection.unitIds) : [];
      const totalRegistros = isExplosivos ? explosivosRecords.length : materiaisRecords.length;

      if (totalRegistros === 0) {
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
          `Relatório de ${tituloAcao} (Sem Registros)`,
          `Solicitação ${solicitacaoId} via Make.com para unidade ${selection.displayName} — nenhum registro de ${kind} encontrado.`,
          { id: user.id, name: user.name, masp: user.masp, role: user.role },
          clientIp
        );

        return res.status(200).json({
          sucesso: true,
          status: 'sem_registros',
          tipo_relatorio: kind,
          unidade: selection.displayName,
          mensagem: semRegistrosMsg
        });
      }

      // 7. Gerar PDF detalhado e salvar em diretório confinado acessível por HTTPS
      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `relacao-${kind}-${selection.fileSlug}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);

      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      try {
        const pdfBuffer = isExplosivos
          ? await generateSystemExplosivosPdf({
              departamentoLabel: selection.departmentName,
              unidadeLabel: selection.displayName,
              solicitacaoId,
              geradoEm,
              solicitanteNome: user.name,
              solicitanteMasp: user.masp,
              logoDataUri: selection.logoDataUri,
              records: explosivosRecords
            })
          : await generateSystemMateriaisPdf({
              departamentoLabel: selection.departmentName,
              unidadeLabel: selection.displayName,
              solicitacaoId,
              geradoEm,
              solicitanteNome: user.name,
              solicitanteMasp: user.masp,
              logoDataUri: selection.logoDataUri,
              records: materiaisRecords
            });
        fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
        fs.writeFileSync(targetPath, pdfBuffer);
      } catch (pdfErr: any) {
        console.error(`[Relatorios API] Erro ao gerar/salvar PDF de ${kind}:`, pdfErr?.message);
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
          totalRegistros,
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
        totalRegistros,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        `Gerar PDF de ${tituloAcao} (Make.com)`,
        `Solicitação ${solicitacaoId}: ${totalRegistros} registro(s) de ${kind} da unidade ${selection.displayName} — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      const extraStats = isExplosivos
        ? {}
        : {
            quantidade_total: materiaisRecords.reduce((s, r) => s + r.quantidadeTotal, 0),
            quantidade_disponivel: materiaisRecords.reduce((s, r) => s + r.quantidadeDisponivel, 0),
            quantidade_em_uso: materiaisRecords.reduce((s, r) => s + r.quantidadeEmUso, 0)
          };

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: kind,
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        solicitacao_id: solicitacaoId,
        total_registros: totalRegistros,
        ...extraStats,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error(`[Relatorios API] Erro inesperado em POST /api/relatorios/${kind}:`, err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar o relatório.'
      });
    }
  };

  // Endpoints de Explosivos por unidade
  apiRouter.post(
    ['/relatorios/explosivos', '/relatorios/explosivos/unidade', '/relatorios/explosivos/por-unidade', '/relatorios/explosivo'],
    (req: Request, res: Response) => handleAssetUnitReportRequest(req, res, 'explosivos')
  );

  // Endpoints de Materiais por unidade
  apiRouter.post(
    ['/relatorios/materiais', '/relatorios/materiais/unidade', '/relatorios/materiais/por-unidade', '/relatorios/material'],
    (req: Request, res: Response) => handleAssetUnitReportRequest(req, res, 'materiais')
  );

  // ============================================================================
  // ENDPOINT DE RELATÓRIOS — SINOPSE OPERACIONAL (Make.com / WhatsApp)
  // Mesmo documento do "Módulo Relatórios" -> "Relatório da unidade" -> "Imprimir Histórico" (Operações)
  // ============================================================================
  const handleSinopseOperacionalRequest = async (req: Request, res: Response) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const tipoRelatorioDb = 'SINOPSE_OPERACIONAL';

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
      const idRegistro = `rel-sinop-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const rawUnidadeForLog = String(body.unidade || body.unidade_codigo || '').trim() || 'NAO_INFORMADA';
      const rawCodigoForLog = String(body.unidade_codigo || body.unidade || '').trim() || 'NAO_INFORMADA';
      const rawPhoneForLog =
        normalizePhoneDigits(body.telefone_usuario || body.telefone || body.phone || body.from) || 'NAO_INFORMADO';
      const rawSolicitacaoForLog = String(body.solicitacao_id || '').trim() || `make-${Date.now()}`;

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
      const solicitacaoId =
        String(body.solicitacao_id || '').trim().slice(0, 128) ||
        `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const formato = String(body.formato || 'pdf').trim().toLowerCase() || 'pdf';
      const dataHoraRaw = body.data_hora_solicitacao ? String(body.data_hora_solicitacao).trim() : '';

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
        const parsedDate = parseRequestDateTime(dataHoraRaw);
        if (parsedDate) {
          dataSolicitacao = parsedDate;
        }
      }

      // Validar filtro de período solicitado
      const periodResolution = resolveOperationalPeriodFilter(body, dataSolicitacao);
      if ('codigo' in periodResolution) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          status: 'erro',
          dataSolicitacao,
          erroCodigo: periodResolution.codigo,
          erroMensagem: periodResolution.mensagem,
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: periodResolution.codigo,
          mensagem: periodResolution.mensagem
        });
      }

      const periodFilter = periodResolution.filter;

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

      // 4. Identificar usuário no sistema Arsenal pelo telefone
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

      // 5. Validar unidade recebida e permissão de acesso
      const unitResolution = await resolveUnitSelectionForUser(
        pool,
        user,
        unidade,
        unidadeCodigo,
        'os relatórios operacionais'
      );
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

      // 6. Consultar relatórios operacionais da(s) unidade(s) no período
      const { catOps, polOps, canilOps } = await querySinopseOperacionalByUnitAndPeriod(
        pool,
        selection.unitIds,
        periodFilter
      );
      const totalRegistros = catOps.length + polOps.length + canilOps.length;

      if (totalRegistros === 0) {
        const emptyMsg = 'Não existem registros de relatórios com os filtros selecionados.';
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
          'Sinopse Operacional (Sem Registros)',
          `Solicitação ${solicitacaoId} via Make.com — unidade ${selection.displayName} (${periodFilter.label}) — nenhum relatório operacional encontrado.`,
          { id: user.id, name: user.name, masp: user.masp, role: user.role },
          clientIp
        );

        return res.status(200).json({
          sucesso: true,
          status: 'sem_registros',
          tipo_relatorio: 'sinopse_operacional',
          unidade: selection.displayName,
          unidade_codigo: selection.fileSlug,
          periodo: periodFilter.key,
          periodo_descricao: periodFilter.label,
          data_inicio: periodFilter.startDateBr,
          data_fim: periodFilter.endDateBr,
          total_registros: 0,
          mensagem: emptyMsg
        });
      }

      // 7. Gerar PDF institucional idêntico ao "Imprimir Histórico" (Operações) e salvar em diretório confinado
      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `sinopse-operacional-${selection.fileSlug}-${periodFilter.fileSlug}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);

      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateSystemSinopseOperacionalPdf({
          departamentoLabel: selection.departmentName,
          unidadeLabel: selection.displayName,
          isTodosUnidades: selection.isTodos,
          periodoLabel: periodFilter.label,
          solicitacaoId,
          geradoEm,
          solicitanteNome: user.name,
          solicitanteMasp: user.masp,
          logoDataUri: selection.logoDataUri,
          catOps,
          polOps,
          canilOps
        });
        fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
        fs.writeFileSync(targetPath, pdfBuffer);
      } catch (pdfErr: any) {
        console.error('[Relatorios API] Erro ao gerar/salvar PDF de Sinopse Operacional:', pdfErr?.message);
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
          totalRegistros,
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
        totalRegistros,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        'Gerar PDF Sinopse Operacional (Make.com)',
        `Solicitação ${solicitacaoId}: ${totalRegistros} relatório(s) operacional(is) da unidade ${selection.displayName} (${periodFilter.label}) — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: 'sinopse_operacional',
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        periodo: periodFilter.key,
        periodo_descricao: periodFilter.label,
        data_inicio: periodFilter.startDateBr,
        data_fim: periodFilter.endDateBr,
        solicitacao_id: solicitacaoId,
        total_registros: totalRegistros,
        total_operacoes_policial: polOps.length,
        total_operacoes_cat: catOps.length,
        total_operacoes_canil: canilOps.length,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em Sinopse Operacional:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar o relatório.'
      });
    }
  };

  // Endpoints de Sinopse Operacional (Relatórios -> Sinopse operacional)
  apiRouter.post(
    [
      '/relatorios/sinopse-operacional',
      '/relatorios/sinopse/operacional',
      '/relatorios/operacoes',
      '/relatorios/relatorios-operacionais'
    ],
    (req: Request, res: Response) => handleSinopseOperacionalRequest(req, res)
  );

  // ============================================================================
  // HANDLER: RELATÓRIOS -> SINOPSE TREINAMENTO (Make.com -> Arsenal)
  // ============================================================================
  const handleSinopseTreinamentoRequest = async (req: Request, res: Response) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const tipoRelatorioDb = 'SINOPSE_TREINAMENTO';

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
      const idRegistro = `rel-sintr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const rawUnidadeForLog =
        String(body.unidade || body.unidade_codigo || body.codigoUnidade || '').trim() || 'NAO_INFORMADA';
      const rawCodigoForLog =
        String(body.unidade_codigo || body.codigoUnidade || body.unidade || '').trim() || 'NAO_INFORMADA';
      const rawPhoneForLog =
        normalizePhoneDigits(body.telefone_usuario || body.telefone || body.phone || body.from) || 'NAO_INFORMADO';
      const rawSolicitacaoForLog =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '').trim() ||
        `make-${Date.now()}`;

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

      // 3. Validar corpo da requisição (aceita snake_case e camelCase)
      const unidade = String(body.unidade || '').trim();
      const unidadeCodigo = String(body.unidade_codigo || body.codigoUnidade || unidade || '').trim();
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);
      const solicitacaoId =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '')
          .trim()
          .slice(0, 128) || `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const formato = String(body.formato || 'pdf').trim().toLowerCase() || 'pdf';
      const dataHoraRaw = String(body.data_hora_solicitacao || body.dataHoraSolicitacao || '').trim();

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
        const parsedDate = parseRequestDateTime(dataHoraRaw);
        if (parsedDate) {
          dataSolicitacao = parsedDate;
        }
      }

      // Normaliza aliases camelCase de data_inicio/data_fim antes de resolver o período
      const normalizedPeriodBody = {
        ...body,
        data_inicio: body.data_inicio || body.dataInicio || body.data_inicial || body.inicio || body.start_date,
        data_fim: body.data_fim || body.dataFim || body.data_final || body.fim || body.end_date
      };

      const periodResolution = resolveOperationalPeriodFilter(normalizedPeriodBody, dataSolicitacao);
      if ('codigo' in periodResolution) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade || unidadeCodigo,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits,
          status: 'erro',
          dataSolicitacao,
          erroCodigo: periodResolution.codigo,
          erroMensagem: periodResolution.mensagem,
          ipOrigem: clientIp
        });
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: periodResolution.codigo,
          mensagem: periodResolution.mensagem
        });
      }

      const periodFilter = periodResolution.filter;

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

      // 4. Identificar usuário no sistema Arsenal pelo telefone
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

      // 5. Validar unidade recebida e permissão de acesso
      const unitResolution = await resolveUnitSelectionForUser(
        pool,
        user,
        unidade,
        unidadeCodigo,
        'os relatórios de treinamento'
      );
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

      // 6. Consultar relatórios de treinamento da(s) unidade(s) no período
      const { polTrains, canilTrains } = await querySinopseTreinamentoByUnitAndPeriod(
        pool,
        selection.unitIds,
        periodFilter
      );
      const totalRegistros = polTrains.length + canilTrains.length;

      if (totalRegistros === 0) {
        const emptyMsg = 'Não existem registros de relatórios com os filtros selecionados.';
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
          'Sinopse Treinamento (Sem Registros)',
          `Solicitação ${solicitacaoId} via Make.com — unidade ${selection.displayName} (${periodFilter.label}) — nenhum relatório de treinamento encontrado.`,
          { id: user.id, name: user.name, masp: user.masp, role: user.role },
          clientIp
        );

        return res.status(200).json({
          sucesso: true,
          status: 'sem_registros',
          tipo_relatorio: 'sinopse_treinamento',
          unidade: selection.displayName,
          unidade_codigo: selection.fileSlug,
          periodo: periodFilter.key,
          periodo_descricao: periodFilter.label,
          data_inicio: periodFilter.startDateBr,
          data_fim: periodFilter.endDateBr,
          total_registros: 0,
          mensagem: emptyMsg
        });
      }

      // 7. Gerar PDF institucional idêntico ao "Imprimir Histórico" (Treinamento) e salvar em diretório confinado
      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `sinopse-treinamento-${selection.fileSlug}-${periodFilter.fileSlug}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);

      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generateSystemSinopseTreinamentoPdf({
          departamentoLabel: selection.departmentName,
          unidadeLabel: selection.displayName,
          isTodosUnidades: selection.isTodos,
          periodoLabel: periodFilter.label,
          solicitacaoId,
          geradoEm,
          solicitanteNome: user.name,
          solicitanteMasp: user.masp,
          logoDataUri: selection.logoDataUri,
          polTrains,
          canilTrains
        });
        fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
        fs.writeFileSync(targetPath, pdfBuffer);
      } catch (pdfErr: any) {
        console.error('[Relatorios API] Erro ao gerar/salvar PDF de Sinopse Treinamento:', pdfErr?.message);
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
          totalRegistros,
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
        totalRegistros,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        'Gerar PDF Sinopse Treinamento (Make.com)',
        `Solicitação ${solicitacaoId}: ${totalRegistros} relatório(s) de treinamento da unidade ${selection.displayName} (${periodFilter.label}) — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: 'sinopse_treinamento',
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        periodo: periodFilter.key,
        periodo_descricao: periodFilter.label,
        data_inicio: periodFilter.startDateBr,
        data_fim: periodFilter.endDateBr,
        solicitacao_id: solicitacaoId,
        total_registros: totalRegistros,
        total_treinamentos_policial: polTrains.length,
        total_treinamentos_canil: canilTrains.length,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em Sinopse Treinamento:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar o relatório.'
      });
    }
  };

  // Endpoints de Sinopse Treinamento (Relatórios -> Sinopse treinamento)
  apiRouter.post(
    [
      '/relatorios/sinopse-treinamento',
      '/relatorios/sinopse/treinamento',
      '/relatorios/treinamentos',
      '/relatorios/relatorios-treinamento'
    ],
    (req: Request, res: Response) => handleSinopseTreinamentoRequest(req, res)
  );

  // ============================================================================
  // HANDLER 1: FICHA DE DESEMPENHO -> CONSULTA K9 VINCULADOS DO CONDUTOR (Make.com)
  // ============================================================================
  const handleDesempenhoK9CondutorInfo = async (req: Request, res: Response) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
    try {
      await ensureRelatoriosApiSchema(pool);

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

      const tokenCheck = await verifyRelatoriosApiToken(pool, req);
      if (!tokenCheck.ok) {
        return res.status(tokenCheck.status || 401).json({
          sucesso: false,
          status: 'erro',
          codigo: tokenCheck.codigo || 'TOKEN_INVALIDO',
          mensagem: tokenCheck.error || 'Não autorizado.'
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);

      if (telefoneDigits.length < 10 || telefoneDigits.length > 15) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TELEFONE_INVALIDO',
          mensagem: 'Informe "telefone_usuario" válido com DDD (ex: 5531999999999).'
        });
      }

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

      const user = await resolveWhatsappUserContext(pool, telefoneDigits);
      if (!user) {
        return res.status(403).json({
          sucesso: false,
          status: 'erro',
          codigo: 'USUARIO_NAO_AUTORIZADO',
          mensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.'
        });
      }

      const linkedDogs = await queryK9AnimalsRaw(pool, { condutorUserId: user.id });
      const nomes = linkedDogs.map(d => d.nome).filter(Boolean);
      const nomesVirgula = nomes.join(', ');
      const temK9 = nomes.length > 0;
      const botaoLabel = temK9 ? `Gráfico ${nomesVirgula}` : '';
      const trunc = (txt: string, maxLen: number) =>
        txt.length <= maxLen ? txt : `${txt.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;

      return res.status(200).json({
        sucesso: true,
        status: 'ok',
        usuario: {
          id: user.id,
          nome: user.name,
          masp: user.masp
        },
        tem_k9_vinculado: temK9,
        exibir_opcao_condutor: temK9,
        quantidade_k9: nomes.length,
        nomes_k9: nomes,
        nomes_k9_virgula: nomesVirgula,
        botao_condutor_label: botaoLabel,
        botao_condutor_whatsapp_btn: temK9 ? trunc(botaoLabel, 20) : '',
        botao_condutor_whatsapp_lista: temK9 ? trunc(botaoLabel, 24) : '',
        animais: linkedDogs.map(d => ({
          id: d.id,
          nome: d.nome,
          raca: d.raca,
          baia: formatK9BaiaLabel(d.canilFisicoNome, d.canilFisicoIdentificacao),
          status: d.status
        }))
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro ao consultar K9 vinculados do condutor:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_INTERNO',
        mensagem: 'Não foi possível consultar os animais K9 vinculados.'
      });
    }
  };

  apiRouter.post(
    [
      '/relatorios/desempenho/k9/condutor-info',
      '/relatorios/desempenho/k9/opcoes',
      '/relatorios/desempenho/opcoes'
    ],
    (req: Request, res: Response) => handleDesempenhoK9CondutorInfo(req, res)
  );

  // ============================================================================
  // HANDLER 2: FICHA DE DESEMPENHO INDIVIDUAL (MINHA FICHA FÍSICA / OPERACIONAL)
  // ============================================================================
  const handleDesempenhoIndividualRequest = async (
    req: Request,
    res: Response,
    forcedCategoria?: DesempenhoCategoriaPdf
  ) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');

    try {
      await ensureRelatoriosApiSchema(pool);
      void cleanupExpiredPdfFiles(pool);

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
      const categoria = resolveDesempenhoCategoria(
        body.tipo || body.categoria || body.modalidade || body.ficha,
        forcedCategoria
      );
      const tipoRelatorioDb =
        categoria === 'TATICO' ? 'DESEMPENHO_INDIVIDUAL_OPERACIONAL' : 'DESEMPENHO_INDIVIDUAL_FISICA';
      const idRegistro = `rel-dind-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const rawUnidadeForLog =
        String(body.unidade || body.unidade_codigo || body.codigoUnidade || '').trim() || 'NAO_INFORMADA';
      const rawCodigoForLog =
        String(body.unidade_codigo || body.codigoUnidade || body.unidade || '').trim() || 'NAO_INFORMADA';
      const rawPhoneForLog =
        normalizePhoneDigits(body.telefone_usuario || body.telefone || body.phone || body.from) || 'NAO_INFORMADO';
      const rawSolicitacaoForLog =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '').trim() ||
        `make-${Date.now()}`;

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

      if (!categoria) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TIPO_FICHA_INVALIDO',
          mensagem: 'Informe o tipo da ficha: "fisica" ou "operacional".'
        });
      }

      const unidade = String(body.unidade || '').trim();
      const unidadeCodigo = String(body.unidade_codigo || body.codigoUnidade || unidade || '').trim();
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);
      const solicitacaoId =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '')
          .trim()
          .slice(0, 128) || `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const dataHoraRaw = String(body.data_hora_solicitacao || body.dataHoraSolicitacao || '').trim();

      if (!unidade && !unidadeCodigo) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'CAMPOS_OBRIGATORIOS_AUSENTES',
          mensagem: 'Informe o campo obrigatório "unidade" ou "unidade_codigo".'
        });
      }

      if (telefoneDigits.length < 10 || telefoneDigits.length > 15) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TELEFONE_INVALIDO',
          mensagem: 'Informe "telefone_usuario" válido com DDD (ex: 5531999999999).'
        });
      }

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

      let dataSolicitacao = new Date();
      if (dataHoraRaw) {
        const parsed = parseRequestDateTime(dataHoraRaw);
        if (parsed) dataSolicitacao = parsed;
      }
      const anoReferencia = getBrasiliaDateParts(dataSolicitacao).year;

      const user = await resolveWhatsappUserContext(pool, telefoneDigits);
      if (!user) {
        return res.status(403).json({
          sucesso: false,
          status: 'erro',
          codigo: 'USUARIO_NAO_AUTORIZADO',
          mensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.'
        });
      }

      const unitResolution = await resolveUnitSelectionForUser(
        pool,
        user,
        unidade,
        unidadeCodigo,
        'a ficha de desempenho individual'
      );
      if ('codigo' in unitResolution) {
        return res.status(unitResolution.status).json({
          sucesso: false,
          status: 'erro',
          codigo: unitResolution.codigo,
          mensagem: unitResolution.mensagem
        });
      }

      const { selection } = unitResolution;
      if (selection.isTodos) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'UNIDADE_ESPECIFICA_OBRIGATORIA',
          mensagem: 'Selecione uma unidade específica (COE, CORE, CAT, CAP ou COC) para a Ficha de Desempenho.'
        });
      }

      const [userExtra, resultados] = await Promise.all([
        queryUserProfileExtra(pool, user.id),
        queryDesempenhoResultadosYear(pool, categoria, anoReferencia, { usuarioId: user.id })
      ]);

      const catSlug = categoria === 'FISICO' ? 'fisica' : 'operacional';

      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `ficha-individual-${catSlug}-${selection.fileSlug}-${anoReferencia}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);
      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      const pdfBuffer = await generateSystemFichaDesempenhoIndividualPdf({
        categoria,
        anoReferencia,
        departamentoLabel: selection.departmentName,
        unidadeLabel: selection.displayName,
        solicitacaoId,
        geradoEm,
        solicitanteNome: user.name,
        solicitanteMasp: user.masp,
        logoDataUri: selection.logoDataUri,
        usuario: {
          id: user.id,
          name: user.name,
          masp: user.masp,
          cargo: userExtra.cargo,
          unidadeNome: userExtra.unidadeNome || selection.displayName,
          fotoUrl: userExtra.fotoUrl,
          resultados
        }
      });

      fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
      fs.writeFileSync(targetPath, pdfBuffer);

      const baseUrl = resolvePublicHttpsBaseUrl(req, tokenCheck.callbackUrlPublica);
      const arquivoUrl = `${baseUrl}/arquivos/${arquivoToken}/${encodeURIComponent(arquivoNome)}`;

      await logSolicitacaoDb(pool, {
        idRegistro,
        solicitacaoId,
        tipoRelatorio: tipoRelatorioDb,
        unidadeSolicitada: selection.displayName,
        unidadeCodigo: selection.fileSlug,
        unidadeIdResolvida: selection.unitIds[0] || null,
        telefoneUsuario: telefoneDigits,
        usuario: user,
        status: 'concluido',
        arquivoNome,
        arquivoToken,
        arquivoCaminho: storedFilename,
        totalRegistros: resultados.length,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        `Gerar Ficha Individual ${categoria === 'FISICO' ? 'Física' : 'Operacional'} (Make.com)`,
        `Solicitação ${solicitacaoId}: ${resultados.length} avaliação(ões) de ${user.name} em ${anoReferencia} (${selection.displayName}) — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: `ficha_individual_${catSlug}`,
        categoria,
        ano_referencia: anoReferencia,
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        solicitacao_id: solicitacaoId,
        total_registros: resultados.length,
        grafico_vazio: resultados.length === 0,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em Ficha Individual:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar a ficha de desempenho individual.'
      });
    }
  };

  apiRouter.post('/relatorios/desempenho/individual/fisica', (req: Request, res: Response) =>
    handleDesempenhoIndividualRequest(req, res, 'FISICO')
  );
  apiRouter.post('/relatorios/desempenho/individual/operacional', (req: Request, res: Response) =>
    handleDesempenhoIndividualRequest(req, res, 'TATICO')
  );
  apiRouter.post('/relatorios/desempenho/individual', (req: Request, res: Response) =>
    handleDesempenhoIndividualRequest(req, res)
  );

  // ============================================================================
  // HANDLER 3: FICHA DA UNIDADE (FICHAS FÍSICAS / FICHAS OPERACIONAIS - 1 USUÁRIO/PÁG)
  // ============================================================================
  const handleDesempenhoUnidadeRequest = async (
    req: Request,
    res: Response,
    forcedCategoria?: DesempenhoCategoriaPdf
  ) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');

    try {
      await ensureRelatoriosApiSchema(pool);
      void cleanupExpiredPdfFiles(pool);

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
      const categoria = resolveDesempenhoCategoria(
        body.tipo || body.categoria || body.modalidade || body.ficha,
        forcedCategoria
      );
      const tipoRelatorioDb =
        categoria === 'TATICO' ? 'DESEMPENHO_UNIDADE_OPERACIONAL' : 'DESEMPENHO_UNIDADE_FISICA';
      const idRegistro = `rel-duni-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const rawUnidadeForLog =
        String(body.unidade || body.unidade_codigo || body.codigoUnidade || '').trim() || 'NAO_INFORMADA';
      const rawCodigoForLog =
        String(body.unidade_codigo || body.codigoUnidade || body.unidade || '').trim() || 'NAO_INFORMADA';
      const rawPhoneForLog =
        normalizePhoneDigits(body.telefone_usuario || body.telefone || body.phone || body.from) || 'NAO_INFORMADO';
      const rawSolicitacaoForLog =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '').trim() ||
        `make-${Date.now()}`;

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

      if (!categoria) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TIPO_FICHA_INVALIDO',
          mensagem: 'Informe o tipo das fichas da unidade: "fisica" ou "operacional".'
        });
      }

      const unidade = String(body.unidade || '').trim();
      const unidadeCodigo = String(body.unidade_codigo || body.codigoUnidade || unidade || '').trim();
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);
      const solicitacaoId =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '')
          .trim()
          .slice(0, 128) || `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const dataHoraRaw = String(body.data_hora_solicitacao || body.dataHoraSolicitacao || '').trim();

      if (!unidade && !unidadeCodigo) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'CAMPOS_OBRIGATORIOS_AUSENTES',
          mensagem: 'Informe o campo obrigatório "unidade" ou "unidade_codigo".'
        });
      }

      if (telefoneDigits.length < 10 || telefoneDigits.length > 15) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TELEFONE_INVALIDO',
          mensagem: 'Informe "telefone_usuario" válido com DDD (ex: 5531999999999).'
        });
      }

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

      let dataSolicitacao = new Date();
      if (dataHoraRaw) {
        const parsed = parseRequestDateTime(dataHoraRaw);
        if (parsed) dataSolicitacao = parsed;
      }
      const anoReferencia = getBrasiliaDateParts(dataSolicitacao).year;

      const user = await resolveWhatsappUserContext(pool, telefoneDigits);
      if (!user) {
        return res.status(403).json({
          sucesso: false,
          status: 'erro',
          codigo: 'USUARIO_NAO_AUTORIZADO',
          mensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.'
        });
      }

      const unitResolution = await resolveUnitSelectionForUser(
        pool,
        user,
        unidade,
        unidadeCodigo,
        'as fichas de desempenho da unidade'
      );
      if ('codigo' in unitResolution) {
        return res.status(unitResolution.status).json({
          sucesso: false,
          status: 'erro',
          codigo: unitResolution.codigo,
          mensagem: unitResolution.mensagem
        });
      }

      const { selection } = unitResolution;
      if (selection.isTodos || selection.unitIds.length === 0) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'UNIDADE_ESPECIFICA_OBRIGATORIA',
          mensagem: 'Selecione uma unidade específica (COE, CORE, CAT, CAP ou COC) para a Ficha da Unidade.'
        });
      }

      const unitId = selection.unitIds[0];
      const { marcadores, atividades, usuarios, totalAvaliacoes } = await queryDesempenhoUnidadeResumoYear(
        pool,
        categoria,
        anoReferencia,
        unitId,
        selection.displayName
      );

      const catSlug = categoria === 'FISICO' ? 'fisicas' : 'operacionais';

      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome = `fichas-unidade-${catSlug}-${selection.fileSlug}-${anoReferencia}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);
      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      const pdfBuffer = await generateSystemFichaDesempenhoUnidadePdf({
        categoria,
        anoReferencia,
        departamentoLabel: selection.departmentName,
        unidadeLabel: selection.displayName,
        solicitacaoId,
        geradoEm,
        solicitanteNome: user.name,
        solicitanteMasp: user.masp,
        logoDataUri: selection.logoDataUri,
        marcadores,
        atividades,
        usuarios
      });

      fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
      fs.writeFileSync(targetPath, pdfBuffer);

      const baseUrl = resolvePublicHttpsBaseUrl(req, tokenCheck.callbackUrlPublica);
      const arquivoUrl = `${baseUrl}/arquivos/${arquivoToken}/${encodeURIComponent(arquivoNome)}`;

      await logSolicitacaoDb(pool, {
        idRegistro,
        solicitacaoId,
        tipoRelatorio: tipoRelatorioDb,
        unidadeSolicitada: selection.displayName,
        unidadeCodigo: selection.fileSlug,
        unidadeIdResolvida: unitId,
        telefoneUsuario: telefoneDigits,
        usuario: user,
        status: 'concluido',
        arquivoNome,
        arquivoToken,
        arquivoCaminho: storedFilename,
        totalRegistros: usuarios.length,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        `Gerar Fichas da Unidade ${categoria === 'FISICO' ? 'Físicas' : 'Operacionais'} (Make.com)`,
        `Solicitação ${solicitacaoId}: ${usuarios.length} policial(is), ${marcadores.length} marcador(es), ${atividades.length} atividade(s) de ${selection.displayName} (${anoReferencia}) — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: `fichas_unidade_${catSlug}`,
        categoria,
        ano_referencia: anoReferencia,
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        solicitacao_id: solicitacaoId,
        total_usuarios: usuarios.length,
        total_marcadores: marcadores.length,
        total_atividades: atividades.length,
        total_registros: totalAvaliacoes,
        grafico_vazio: totalAvaliacoes === 0,
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em Fichas da Unidade:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar as fichas de desempenho da unidade.'
      });
    }
  };

  apiRouter.post('/relatorios/desempenho/unidade/fisica', (req: Request, res: Response) =>
    handleDesempenhoUnidadeRequest(req, res, 'FISICO')
  );
  apiRouter.post('/relatorios/desempenho/unidade/operacional', (req: Request, res: Response) =>
    handleDesempenhoUnidadeRequest(req, res, 'TATICO')
  );
  apiRouter.post('/relatorios/desempenho/unidade', (req: Request, res: Response) =>
    handleDesempenhoUnidadeRequest(req, res)
  );

  // ============================================================================
  // HANDLER 4: FICHA DO K9 (CONDUTOR OU TODOS OS K9 DA COC - ANO ATUAL)
  // ============================================================================
  const handleDesempenhoK9PdfRequest = async (
    req: Request,
    res: Response,
    mode: 'condutor' | 'unidade'
  ) => {
    const pool = getPool();
    const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const tipoRelatorioDb = mode === 'condutor' ? 'DESEMPENHO_K9_CONDUTOR' : 'DESEMPENHO_K9_UNIDADE';

    try {
      await ensureRelatoriosApiSchema(pool);
      void cleanupExpiredPdfFiles(pool);

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
      const idRegistro = `rel-dk9-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const unidade = String(body.unidade || 'COC').trim() || 'COC';
      const unidadeCodigo = String(body.unidade_codigo || body.codigoUnidade || unidade || 'COC').trim();
      const telefoneRaw = String(body.telefone_usuario || body.telefone || body.phone || body.from || '').trim();
      const telefoneDigits = normalizePhoneDigits(telefoneRaw);
      const solicitacaoId =
        String(body.solicitacao_id || body.identificadorSolicitacao || body.identificador_solicitacao || '')
          .trim()
          .slice(0, 128) || `make-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const dataHoraRaw = String(body.data_hora_solicitacao || body.dataHoraSolicitacao || '').trim();

      const tokenCheck = await verifyRelatoriosApiToken(pool, req);
      if (!tokenCheck.ok) {
        await logSolicitacaoDb(pool, {
          idRegistro,
          solicitacaoId,
          tipoRelatorio: tipoRelatorioDb,
          unidadeSolicitada: unidade,
          unidadeCodigo,
          telefoneUsuario: telefoneDigits || 'NAO_INFORMADO',
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

      if (telefoneDigits.length < 10 || telefoneDigits.length > 15) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'TELEFONE_INVALIDO',
          mensagem: 'Informe "telefone_usuario" válido com DDD (ex: 5531999999999).'
        });
      }

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

      let dataSolicitacao = new Date();
      if (dataHoraRaw) {
        const parsed = parseRequestDateTime(dataHoraRaw);
        if (parsed) dataSolicitacao = parsed;
      }
      const anoReferencia = getBrasiliaDateParts(dataSolicitacao).year;

      const user = await resolveWhatsappUserContext(pool, telefoneDigits);
      if (!user) {
        return res.status(403).json({
          sucesso: false,
          status: 'erro',
          codigo: 'USUARIO_NAO_AUTORIZADO',
          mensagem: 'Telefone não vinculado a um usuário ativo no sistema Arsenal.'
        });
      }

      const unitResolution = await resolveUnitSelectionForUser(
        pool,
        user,
        unidade,
        unidadeCodigo,
        'as fichas de desempenho K9'
      );
      if ('codigo' in unitResolution) {
        return res.status(unitResolution.status).json({
          sucesso: false,
          status: 'erro',
          codigo: unitResolution.codigo,
          mensagem: unitResolution.mensagem
        });
      }

      const { selection } = unitResolution;
      if (selection.isTodos || !isCocUnitName(selection.displayName)) {
        return res.status(400).json({
          sucesso: false,
          status: 'erro',
          codigo: 'UNIDADE_K9_APENAS_COC',
          mensagem: 'A Ficha do K9 está disponível exclusivamente para a unidade COC (Canil).'
        });
      }

      const unitId = selection.unitIds[0] || '';
      const rawDogs =
        mode === 'condutor'
          ? await queryK9AnimalsRaw(pool, { condutorUserId: user.id })
          : await queryK9AnimalsRaw(pool, { unitId });

      const animaisDossier =
        rawDogs.length > 0 ? await buildK9AnimalDossiersYear(pool, rawDogs, anoReferencia) : [];

      const geradoEm = new Date();
      const expiraEm = new Date(geradoEm.getTime() + PDF_RETENTION_HOURS * 60 * 60 * 1000);
      const arquivoNome =
        mode === 'condutor'
          ? `ficha-k9-condutor-${anoReferencia}.pdf`
          : `ficha-k9-unidade-${selection.fileSlug}-${anoReferencia}.pdf`;
      const arquivoToken = crypto.randomBytes(16).toString('hex');
      const storedFilename = `${arquivoToken}__${arquivoNome}`;
      const targetPath = path.resolve(PDF_STORAGE_DIR, storedFilename);
      if (!targetPath.startsWith(PDF_STORAGE_DIR + path.sep)) {
        throw new Error('Caminho de armazenamento inválido.');
      }

      const pdfBuffer = await generateSystemFichaDesempenhoK9Pdf({
        mode,
        anoReferencia,
        departamentoLabel: selection.departmentName,
        unidadeLabel: selection.displayName,
        solicitacaoId,
        geradoEm,
        solicitanteNome: user.name,
        solicitanteMasp: user.masp,
        logoDataUri: selection.logoDataUri,
        animais: animaisDossier
      });

      fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
      fs.writeFileSync(targetPath, pdfBuffer);

      const baseUrl = resolvePublicHttpsBaseUrl(req, tokenCheck.callbackUrlPublica);
      const arquivoUrl = `${baseUrl}/arquivos/${arquivoToken}/${encodeURIComponent(arquivoNome)}`;

      await logSolicitacaoDb(pool, {
        idRegistro,
        solicitacaoId,
        tipoRelatorio: tipoRelatorioDb,
        unidadeSolicitada: selection.displayName,
        unidadeCodigo: selection.fileSlug,
        unidadeIdResolvida: unitId || null,
        telefoneUsuario: telefoneDigits,
        usuario: user,
        status: 'concluido',
        arquivoNome,
        arquivoToken,
        arquivoCaminho: storedFilename,
        totalRegistros: animaisDossier.length,
        expiraEm,
        dataSolicitacao,
        ipOrigem: clientIp
      });

      await insertAuditLog(
        'WhatsApp / API Relatórios',
        mode === 'condutor' ? 'Gerar Ficha K9 Condutor (Make.com)' : 'Gerar Ficha K9 Unidade COC (Make.com)',
        `Solicitação ${solicitacaoId}: ${animaisDossier.length} animal(is) K9 (${animaisDossier.map(a => a.nome).join(', ')}) — Ano ${anoReferencia} — arquivo ${arquivoNome}`,
        { id: user.id, name: user.name, masp: user.masp, role: user.role },
        clientIp
      );

      return res.status(200).json({
        sucesso: true,
        status: 'concluido',
        tipo_relatorio: mode === 'condutor' ? 'ficha_k9_condutor' : 'ficha_k9_unidade',
        ano_referencia: anoReferencia,
        unidade: selection.displayName,
        unidade_codigo: selection.fileSlug,
        solicitacao_id: solicitacaoId,
        total_animais: animaisDossier.length,
        nomes_animais: animaisDossier.map(a => a.nome),
        grafico_vazio: animaisDossier.length === 0 || animaisDossier.every(a => a.totalTreinosAno === 0),
        arquivo_nome: arquivoNome,
        arquivo_url: arquivoUrl,
        gerado_em: geradoEm.toISOString(),
        expira_em: expiraEm.toISOString()
      });
    } catch (err: any) {
      console.error('[Relatorios API] Erro inesperado em Ficha K9:', err?.message);
      return res.status(500).json({
        sucesso: false,
        status: 'erro',
        codigo: 'ERRO_GERACAO_PDF',
        mensagem: 'Não foi possível gerar a ficha de desempenho K9.'
      });
    }
  };

  apiRouter.post(
    ['/relatorios/desempenho/k9/condutor', '/relatorios/desempenho/k9/meu', '/relatorios/desempenho/k9/individual'],
    (req: Request, res: Response) => handleDesempenhoK9PdfRequest(req, res, 'condutor')
  );
  apiRouter.post(
    ['/relatorios/desempenho/k9/unidade', '/relatorios/desempenho/k9/todos', '/relatorios/desempenho/k9/graficos'],
    (req: Request, res: Response) => handleDesempenhoK9PdfRequest(req, res, 'unidade')
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

type MunicaoStockRecord = SystemMunicaoPdfRecord;

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

// ============================================================================
// CONSULTAS DE EXPLOSIVOS E MATERIAIS POR UNIDADE
// ============================================================================
function formatDateOnlyBr(val?: any): { formatted: string; dateObj: Date | null } {
  if (!val) return { formatted: '—', dateObj: null };
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return { formatted: '—', dateObj: null };
  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
    return { formatted, dateObj: d };
  } catch {
    return { formatted: d.toISOString().slice(0, 10), dateObj: d };
  }
}

async function queryExplosivosByUnit(pool: any, unitIds: string[]): Promise<SystemExplosivoPdfRecord[]> {
  let sql = `
    SELECT
      e.ID_EXPLOSIVOS,
      e.NOME_EXPLOSIVOS,
      e.TIPO_EXPLOSIVOS,
      e.SUBTIPO_EXPLOSIVOS,
      e.QUANTIDADE_EXPLOSIVOS,
      e.UNIDADE_MEDIDA_EXPLOSIVOS,
      e.LOTE_EXPLOSIVOS,
      e.FABRICANTE_EXPLOSIVOS,
      e.DATA_FABRICACAO_EXPLOSIVOS,
      e.DATA_VALIDADE_EXPLOSIVOS,
      e.CLASSE_RISCO_EXPLOSIVOS,
      e.LOCAL_ARMAZENAMENTO_EXPLOSIVOS,
      e.STATUS_EXPLOSIVOS,
      e.OBSERVACOES_EXPLOSIVOS,
      u.NOME_UNIDADES,
      cf.CODIGO_COFRES,
      cf.DESCRICAO_CURTA_COFRES
    FROM EXPLOSIVOS e
    LEFT JOIN UNIDADES u ON u.ID_UNIDADES = e.UNIDADE_ID_EXPLOSIVOS
    LEFT JOIN COFRES cf ON cf.ID_COFRES = e.COFRE_ID_EXPLOSIVOS
    WHERE 1=1
  `;
  const params: any[] = [];

  if (unitIds.length > 0) {
    const placeholders = unitIds.map(() => '?').join(', ');
    sql += ` AND e.UNIDADE_ID_EXPLOSIVOS IN (${placeholders})`;
    params.push(...unitIds);
  }

  sql += ' ORDER BY u.NOME_UNIDADES ASC, e.TIPO_EXPLOSIVOS ASC, e.SUBTIPO_EXPLOSIVOS ASC, e.NOME_EXPLOSIVOS ASC';

  const [rows]: any = await pool.query(sql, params);
  return (rows || []).map((r: any) => {
    const fab = formatDateOnlyBr(r.DATA_FABRICACAO_EXPLOSIVOS);
    const val = formatDateOnlyBr(r.DATA_VALIDADE_EXPLOSIVOS);
    return {
      nome: String(r.NOME_EXPLOSIVOS || '—'),
      tipo: String(r.TIPO_EXPLOSIVOS || '—'),
      subtipo: String(r.SUBTIPO_EXPLOSIVOS || ''),
      quantidade: Number(r.QUANTIDADE_EXPLOSIVOS || 0),
      unidadeMedida: String(r.UNIDADE_MEDIDA_EXPLOSIVOS || 'un'),
      lote: String(r.LOTE_EXPLOSIVOS || '—'),
      fabricante: String(r.FABRICANTE_EXPLOSIVOS || '—'),
      dataFabricacao: fab.formatted,
      dataValidade: val.formatted,
      validadeRaw: val.dateObj,
      classeRisco: String(r.CLASSE_RISCO_EXPLOSIVOS || '—'),
      localArmazenamento: String(r.LOCAL_ARMAZENAMENTO_EXPLOSIVOS || ''),
      cofreCodigo: String(r.CODIGO_COFRES || ''),
      cofreDescricao: String(r.DESCRICAO_CURTA_COFRES || ''),
      status: String(r.STATUS_EXPLOSIVOS || 'Operacional'),
      unidadeNome: String(r.NOME_UNIDADES || 'Sem Unidade'),
      observacoes: String(r.OBSERVACOES_EXPLOSIVOS || '').trim()
    };
  });
}

async function queryMateriaisByUnit(pool: any, unitIds: string[]): Promise<SystemMaterialPdfRecord[]> {
  let sql = `
    SELECT
      m.ID_MATERIAIS,
      m.NOME_MATERIAIS,
      COALESCE(NULLIF(TRIM(m.TIPO_MATERIAL_NOME_MATERIAIS), ''), tm.NOME_TIPOS_MATERIAIS, 'Geral') AS TIPO_FINAL,
      COALESCE(tm.CATEGORIA_TIPOS_MATERIAIS, '') AS CATEGORIA_FINAL,
      COALESCE(tm.EH_CONSUMIVEL_TIPOS_MATERIAIS, 0) AS EH_CONSUMIVEL_FINAL,
      m.NUMERO_SERIE_MATERIAIS,
      m.QUANTIDADE_MATERIAIS,
      m.QUANTIDADE_DISPONIVEL_MATERIAIS,
      m.QUANTIDADE_EM_USO_MATERIAIS,
      m.QUANTIDADE_CONSUMIDA_MATERIAIS,
      m.PASSIVO_DEPOSITO_POLICIAIS,
      m.VALIDADE_MATERIAIS,
      m.LOCAL_GUARDA_MATERIAIS,
      m.OBSERVACOES_MATERIAIS,
      m.DEPARTAMENTO_NOME_MATERIAIS,
      m.CRIADO_POR_NOME_MATERIAIS,
      m.DATA_ATUALIZACAO_MATERIAIS,
      m.DATA_CRIACAO_MATERIAIS,
      COALESCE(u.NOME_UNIDADES, m.UNIDADE_NOME_MATERIAIS, 'Sem Unidade') AS UNIDADE_FINAL,
      COALESCE(d.NOME_DEPARTAMENTOS, m.DEPARTAMENTO_NOME_MATERIAIS, '') AS DEPTO_FINAL,
      cf.CODIGO_COFRES,
      cf.DESCRICAO_CURTA_COFRES
    FROM MATERIAIS m
    LEFT JOIN TIPOS_MATERIAIS tm ON tm.ID_TIPOS_MATERIAIS = m.TIPO_MATERIAL_ID_MATERIAIS
    LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_MATERIAIS
    LEFT JOIN DEPARTAMENTOS d ON d.ID_DEPARTAMENTOS = u.DEPARTAMENTO_ID_UNIDADES
    LEFT JOIN COFRES cf ON cf.ID_COFRES = m.COFRE_ID_MATERIAIS
    WHERE 1=1
  `;
  const params: any[] = [];

  if (unitIds.length > 0) {
    const placeholders = unitIds.map(() => '?').join(', ');
    sql += ` AND m.UNIDADE_ID_MATERIAIS IN (${placeholders})`;
    params.push(...unitIds);
  }

  sql += ' ORDER BY UNIDADE_FINAL ASC, TIPO_FINAL ASC, m.NOME_MATERIAIS ASC, m.NUMERO_SERIE_MATERIAIS ASC';

  const [rows]: any = await pool.query(sql, params);
  const materialRows = rows || [];

  // Carrega cautelas ativas para exibir acautelamento exatamente como em ModuloMateriais.tsx
  const activeCautelasMap = new Map<string, string[]>();
  if (materialRows.length > 0) {
    try {
      const matIds = materialRows.map((r: any) => String(r.ID_MATERIAIS || '')).filter(Boolean);
      if (matIds.length > 0) {
        const placeholders = matIds.map(() => '?').join(', ');
        const [cRows]: any = await pool.query(
          `SELECT
            MATERIAL_ID_CAUTELAS_MATERIAIS,
            PROTOCOLO_CAUTELAS_MATERIAIS,
            QUANTIDADE_CAUTELAS_MATERIAIS,
            TIPO_DESTINATARIO_CAUTELAS_MATERIAIS,
            USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS,
            USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS,
            USUARIO_INTERNO_CARGO_CAUTELAS_MATERIAIS,
            USUARIO_EXTERNO_NOME_CAUTELAS_MATERIAIS,
            USUARIO_EXTERNO_DOCUMENTO_CAUTELAS_MATERIAIS,
            USUARIO_EXTERNO_ORGAO_CAUTELAS_MATERIAIS,
            DATA_RETIRADA_CAUTELAS_MATERIAIS,
            STATUS_CAUTELAS_MATERIAIS
          FROM CAUTELAS_MATERIAIS
          WHERE MATERIAL_ID_CAUTELAS_MATERIAIS IN (${placeholders})
            AND LOWER(COALESCE(STATUS_CAUTELAS_MATERIAIS, '')) NOT IN ('devolvida', 'devolvido', 'recusada', 'cancelada', 'consumida', 'concluida')
          ORDER BY DATA_RETIRADA_CAUTELAS_MATERIAIS DESC`,
          matIds
        );

        for (const c of cRows || []) {
          const mid = String(c.MATERIAL_ID_CAUTELAS_MATERIAIS || '');
          if (!mid) continue;
          const isExternal = String(c.TIPO_DESTINATARIO_CAUTELAS_MATERIAIS || '').toLowerCase().includes('extern');
          const nome = isExternal
            ? String(c.USUARIO_EXTERNO_NOME_CAUTELAS_MATERIAIS || 'Externo')
            : String(c.USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS || 'Policial');
          const detail = isExternal
            ? [c.USUARIO_EXTERNO_ORGAO_CAUTELAS_MATERIAIS, c.USUARIO_EXTERNO_DOCUMENTO_CAUTELAS_MATERIAIS]
                .filter(Boolean)
                .join(' / ')
            : [
                c.USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS ? `MASP ${c.USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS}` : '',
                c.USUARIO_INTERNO_CARGO_CAUTELAS_MATERIAIS
              ]
                .filter(Boolean)
                .join(' - ');
          const qtd = Number(c.QUANTIDADE_CAUTELAS_MATERIAIS || 1);
          const retirada = c.DATA_RETIRADA_CAUTELAS_MATERIAIS
            ? formatDateOnlyBr(c.DATA_RETIRADA_CAUTELAS_MATERIAIS).formatted
            : '';
          const summary = `${nome}${detail ? ` (${detail})` : ''} - Qtd: ${qtd}${retirada && retirada !== '—' ? ` em ${retirada}` : ''}`;
          const list = activeCautelasMap.get(mid) || [];
          list.push(summary);
          activeCautelasMap.set(mid, list);
        }
      }
    } catch {
      // Prossegue normalmente se CAUTELAS_MATERIAIS estiver vazia ou indisponível
    }
  }

  return materialRows.map((r: any) => {
    const id = String(r.ID_MATERIAIS || '');
    const val = formatDateOnlyBr(r.VALIDADE_MATERIAIS);
    const createdRaw = r.DATA_CRIACAO_MATERIAIS || r.DATA_ATUALIZACAO_MATERIAIS;
    const qtdEmUso = Number(r.QUANTIDADE_EM_USO_MATERIAIS || 0);
    const activeList = activeCautelasMap.get(id) || [];
    const isAcautelado = activeList.length > 0 || qtdEmUso > 0;
    const acautelamentoResumo =
      activeList.length > 0
        ? activeList.slice(0, 2).join('; ') + (activeList.length > 2 ? ` (+${activeList.length - 2})` : '')
        : qtdEmUso > 0
          ? `${qtdEmUso} un. em uso / acautelado`
          : '';

    return {
      id,
      nome: String(r.NOME_MATERIAIS || '—'),
      tipoNome: String(r.TIPO_FINAL || 'Geral'),
      categoria: String(r.CATEGORIA_FINAL || ''),
      consumivel: Boolean(Number(r.EH_CONSUMIVEL_FINAL || 0)),
      numeroSerie: String(r.NUMERO_SERIE_MATERIAIS || '—'),
      quantidadeTotal: Number(r.QUANTIDADE_MATERIAIS || 0),
      quantidadeDisponivel: Number(r.QUANTIDADE_DISPONIVEL_MATERIAIS || 0),
      quantidadeEmUso: qtdEmUso,
      quantidadeConsumida: Number(r.QUANTIDADE_CONSUMIDA_MATERIAIS || 0),
      passivoDepositoPoliciais: Boolean(Number(r.PASSIVO_DEPOSITO_POLICIAIS || 0)),
      validade: val.formatted,
      validadeRaw: val.dateObj,
      localGuarda: String(r.LOCAL_GUARDA_MATERIAIS || ''),
      cofreCodigo: String(r.CODIGO_COFRES || ''),
      cofreDescricao: String(r.DESCRICAO_CURTA_COFRES || ''),
      unidadeNome: String(r.UNIDADE_FINAL || 'Sem Unidade'),
      departamentoNome: String(r.DEPTO_FINAL || ''),
      acautelamentoResumo,
      isAcautelado,
      criadoPorNome: String(r.CRIADO_POR_NOME_MATERIAIS || ''),
      criadoEm: createdRaw ? formatDateTimeBr(new Date(createdRaw)).slice(0, 10) : '',
      observacoes: String(r.OBSERVACOES_MATERIAIS || '').trim()
    };
  });
}

// ============================================================================
// AUXILIARES DE PERÍODO E CONSULTA DE SINOPSE OPERACIONAL (OPERAÇÕES)
// ============================================================================
type OperationalPeriodKey =
  | 'ultima_permanencia'
  | 'essa_semana'
  | 'esse_mes'
  | 'mes_passado'
  | 'esse_ano'
  | 'informar_periodo';

interface ResolvedOperationalPeriodFilter {
  key: OperationalPeriodKey;
  mode: 'window_24h' | 'date_range';
  startIsoDate: string; // YYYY-MM-DD
  endIsoDate: string; // YYYY-MM-DD
  startWallClock: string; // YYYY-MM-DD HH:MM:SS (Brasília)
  endWallClock: string; // YYYY-MM-DD HH:MM:SS (Brasília)
  startDateBr: string; // DD/MM/YYYY
  endDateBr: string; // DD/MM/YYYY
  label: string;
  fileSlug: string;
}

interface BrasiliaParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDate: string;
  hhmm: string;
  wallClock: string;
  weekday: number; // 0 = Domingo .. 6 = Sábado
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUtcDateIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatIsoToBr(iso: string): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function getBrasiliaDateParts(date: Date): BrasiliaParts {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(date);

    const getNum = (type: string, fallback: number): number => {
      const v = parts.find(p => p.type === type)?.value;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    const year = getNum('year', date.getUTCFullYear());
    const month = getNum('month', date.getUTCMonth() + 1);
    const day = getNum('day', date.getUTCDate());
    let hour = getNum('hour', date.getUTCHours());
    if (hour === 24) hour = 0;
    const minute = getNum('minute', date.getUTCMinutes());
    const second = getNum('second', date.getUTCSeconds());
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const hhmm = `${pad2(hour)}:${pad2(minute)}`;
    const wallClock = `${isoDate} ${hhmm}:${pad2(second)}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { year, month, day, hour, minute, second, isoDate, hhmm, wallClock, weekday };
  } catch {
    // Fallback UTC-3
    const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    const hour = shifted.getUTCHours();
    const minute = shifted.getUTCMinutes();
    const second = shifted.getUTCSeconds();
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const hhmm = `${pad2(hour)}:${pad2(minute)}`;
    const wallClock = `${isoDate} ${hhmm}:${pad2(second)}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { year, month, day, hour, minute, second, isoDate, hhmm, wallClock, weekday };
  }
}

function parseRequestDateTime(raw: string): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  // Aceita DD/MM/YYYY HH:mm(:ss)? em horário de Brasília
  const brDt = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDt) {
    const day = Number(brDt[1]);
    const month = Number(brDt[2]);
    const year = Number(brDt[3]);
    const hour = brDt[4] !== undefined ? Number(brDt[4]) : 12;
    const minute = brDt[5] !== undefined ? Number(brDt[5]) : 0;
    const second = brDt[6] !== undefined ? Number(brDt[6]) : 0;
    const candidate = new Date(
      `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}-03:00`
    );
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseStrictDateInputToIso(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  // Formato brasileiro: DD/MM/AAAA (ou DD-MM-AAAA, DD.MM.AAAA)
  const brMatch = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[\sT].*)?$/);
  if (brMatch) {
    day = Number(brMatch[1]);
    month = Number(brMatch[2]);
    year = Number(brMatch[3]);
  } else {
    // Formato ISO: AAAA-MM-DD (ou AAAA/MM/DD)
    const isoMatch = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[\sT].*)?$/);
    if (!isoMatch) return null;
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  }

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Validação real de calendário (rejeita 31/02, 31/04, etc.)
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function extractTwoDatesFromString(raw?: string | null): { start?: string; end?: string } {
  const s = String(raw || '').trim();
  if (!s) return {};
  const matches = s.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/g);
  if (!matches || matches.length < 2) return {};
  return { start: matches[0], end: matches[1] };
}

function resolveOperationalPeriodFilter(
  body: Record<string, any>,
  dataSolicitacao: Date
): { ok: true; filter: ResolvedOperationalPeriodFilter } | { ok: false; codigo: string; mensagem: string } {
  const rawPeriodo = String(
    body.periodo || body.filtro_periodo || body.tipo_periodo || body.periodo_codigo || ''
  ).trim();
  const rawStart = String(
    body.data_inicio || body.data_inicial || body.inicio || body.start_date || ''
  ).trim();
  const rawEnd = String(
    body.data_fim || body.data_final || body.fim || body.end_date || ''
  ).trim();
  const rawRange = String(
    body.periodo_custom || body.periodo_informado || body.intervalo || ''
  ).trim();

  const compactPeriodo = normalizeKey(rawPeriodo)
    .replace(/^(?:PERIODO|FILTRO|SINOPSE|OP)[_\-\s:]+/i, '')
    .replace(/[^A-Z0-9]/g, '');

  const nowBr = getBrasiliaDateParts(dataSolicitacao);

  const hasExplicitDates = Boolean(rawStart || rawEnd || rawRange);
  const isCustomPeriod =
    compactPeriodo === 'INFORMARPERIODO' ||
    compactPeriodo === 'PERIODO' ||
    compactPeriodo === 'PERSONALIZADO' ||
    compactPeriodo === 'CUSTOM' ||
    compactPeriodo === 'INTERVALO' ||
    compactPeriodo === 'DATAS' ||
    (hasExplicitDates && !compactPeriodo) ||
    Boolean(extractTwoDatesFromString(rawPeriodo).start);

  if (isCustomPeriod) {
    let startCandidate = rawStart;
    let endCandidate = rawEnd;
    if (!startCandidate || !endCandidate) {
      const fromRange = extractTwoDatesFromString(rawRange || rawPeriodo);
      if (!startCandidate && fromRange.start) startCandidate = fromRange.start;
      if (!endCandidate && fromRange.end) endCandidate = fromRange.end;
    }

    const startIso = parseStrictDateInputToIso(startCandidate);
    const endIso = parseStrictDateInputToIso(endCandidate);

    if (!startIso || !endIso) {
      return {
        ok: false,
        codigo: 'PERIODO_INVALIDO',
        mensagem:
          'Informe "data_inicio" e "data_fim" válidas no formato DD/MM/AAAA (ex: "01/11/2026" e "27/11/2026").'
      };
    }

    if (startIso > endIso) {
      return {
        ok: false,
        codigo: 'PERIODO_INVALIDO',
        mensagem: 'A data de início não pode ser posterior à data final.'
      };
    }

    const startBr = formatIsoToBr(startIso);
    const endBr = formatIsoToBr(endIso);
    return {
      ok: true,
      filter: {
        key: 'informar_periodo',
        mode: 'date_range',
        startIsoDate: startIso,
        endIsoDate: endIso,
        startWallClock: `${startIso} 00:00:00`,
        endWallClock: `${endIso} 23:59:59`,
        startDateBr: startBr,
        endDateBr: endBr,
        label: `Período informado (${startBr} até ${endBr})`,
        fileSlug: `${startIso}_a_${endIso}`
      }
    };
  }

  // 1. Última permanência (19h do dia anterior até a hora da solicitação)
  if (
    !compactPeriodo ||
    compactPeriodo === 'ULTIMAPERMANENCIA' ||
    compactPeriodo === 'ULTIMAS24H' ||
    compactPeriodo === 'ULTIMA24H' ||
    compactPeriodo === '24H' ||
    compactPeriodo === 'PERMANENCIA'
  ) {
    const prevDayUtc = new Date(Date.UTC(nowBr.year, nowBr.month - 1, nowBr.day - 1));
    const prevIso = formatUtcDateIso(prevDayUtc);
    const prevBr = formatIsoToBr(prevIso);
    const currBr = formatIsoToBr(nowBr.isoDate);
    return {
      ok: true,
      filter: {
        key: 'ultima_permanencia',
        mode: 'window_24h',
        startIsoDate: prevIso,
        endIsoDate: nowBr.isoDate,
        startWallClock: `${prevIso} 19:00:00`,
        endWallClock: nowBr.wallClock,
        startDateBr: prevBr,
        endDateBr: currBr,
        label: `Última permanência (${prevBr} 19:00 até ${currBr} ${nowBr.hhmm})`,
        fileSlug: 'ultima-permanencia'
      }
    };
  }

  // 2. Essa semana (de domingo ao dia da solicitação)
  if (
    compactPeriodo === 'ESSASEMANA' ||
    compactPeriodo === 'ESTASEMANA' ||
    compactPeriodo === 'SEMANA' ||
    compactPeriodo === 'SEMANAATUAL' ||
    compactPeriodo === 'SEMANAL'
  ) {
    const sundayUtc = new Date(Date.UTC(nowBr.year, nowBr.month - 1, nowBr.day - nowBr.weekday));
    const startIso = formatUtcDateIso(sundayUtc);
    const endIso = nowBr.isoDate;
    const startBr = formatIsoToBr(startIso);
    const endBr = formatIsoToBr(endIso);
    return {
      ok: true,
      filter: {
        key: 'essa_semana',
        mode: 'date_range',
        startIsoDate: startIso,
        endIsoDate: endIso,
        startWallClock: `${startIso} 00:00:00`,
        endWallClock: nowBr.wallClock,
        startDateBr: startBr,
        endDateBr: endBr,
        label: `Essa semana (${startBr} até ${endBr})`,
        fileSlug: 'essa-semana'
      }
    };
  }

  // 3. Esse mês (do dia 01 ao dia atual do mês da solicitação)
  if (
    compactPeriodo === 'ESSEMES' ||
    compactPeriodo === 'ESTEMES' ||
    compactPeriodo === 'MES' ||
    compactPeriodo === 'MESATUAL' ||
    compactPeriodo === 'MENSAL'
  ) {
    const startIso = `${nowBr.year}-${pad2(nowBr.month)}-01`;
    const endIso = nowBr.isoDate;
    const startBr = formatIsoToBr(startIso);
    const endBr = formatIsoToBr(endIso);
    return {
      ok: true,
      filter: {
        key: 'esse_mes',
        mode: 'date_range',
        startIsoDate: startIso,
        endIsoDate: endIso,
        startWallClock: `${startIso} 00:00:00`,
        endWallClock: nowBr.wallClock,
        startDateBr: startBr,
        endDateBr: endBr,
        label: `Esse mês (${startBr} até ${endBr})`,
        fileSlug: 'esse-mes'
      }
    };
  }

  // 4. Mês passado (todo o mês anterior à solicitação)
  if (
    compactPeriodo === 'MESPASSADO' ||
    compactPeriodo === 'MESANTERIOR' ||
    compactPeriodo === 'ULTIMOMES'
  ) {
    const prevMonthStartUtc = new Date(Date.UTC(nowBr.year, nowBr.month - 2, 1));
    const prevMonthEndUtc = new Date(Date.UTC(nowBr.year, nowBr.month - 1, 0));
    const startIso = formatUtcDateIso(prevMonthStartUtc);
    const endIso = formatUtcDateIso(prevMonthEndUtc);
    const startBr = formatIsoToBr(startIso);
    const endBr = formatIsoToBr(endIso);
    return {
      ok: true,
      filter: {
        key: 'mes_passado',
        mode: 'date_range',
        startIsoDate: startIso,
        endIsoDate: endIso,
        startWallClock: `${startIso} 00:00:00`,
        endWallClock: `${endIso} 23:59:59`,
        startDateBr: startBr,
        endDateBr: endBr,
        label: `Mês passado (${startBr} até ${endBr})`,
        fileSlug: 'mes-passado'
      }
    };
  }

  // 5. Esse ano (01/01 do ano corrente até a data atual)
  if (
    compactPeriodo === 'ESSEANO' ||
    compactPeriodo === 'ESTEANO' ||
    compactPeriodo === 'ANO' ||
    compactPeriodo === 'ANOATUAL' ||
    compactPeriodo === 'ANUAL'
  ) {
    const startIso = `${nowBr.year}-01-01`;
    const endIso = nowBr.isoDate;
    const startBr = formatIsoToBr(startIso);
    const endBr = formatIsoToBr(endIso);
    return {
      ok: true,
      filter: {
        key: 'esse_ano',
        mode: 'date_range',
        startIsoDate: startIso,
        endIsoDate: endIso,
        startWallClock: `${startIso} 00:00:00`,
        endWallClock: nowBr.wallClock,
        startDateBr: startBr,
        endDateBr: endBr,
        label: `Esse ano (${startBr} até ${endBr})`,
        fileSlug: 'esse-ano'
      }
    };
  }

  return {
    ok: false,
    codigo: 'PERIODO_INVALIDO',
    mensagem:
      'Período inválido. Utilize: "ultima_permanencia", "essa_semana", "esse_mes", "mes_passado", "esse_ano" ou "informar_periodo" (com data_inicio e data_fim em DD/MM/AAAA).'
  };
}

function safeParseJsonArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseJsonObject(raw: any): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatPolOpMandadoPrisao(mp: any): string {
  if (!mp?.ativo) return '';
  if (typeof mp.quantidadeAlvos === 'number' && mp.quantidadeAlvos > 0) {
    const alvos = mp.quantidadeAlvos;
    const presos = typeof mp.quantidadePresos === 'number' ? mp.quantidadePresos : mp.foragidoPreso ? alvos : 0;
    const foragidos = Math.max(0, alvos - presos);
    const presosTxt = `${presos} ${presos === 1 ? 'preso' : 'presos'}`;
    if (foragidos === 0) return `Alvos: ${alvos} - ${presosTxt} (todos presos)`;
    const foragTxt = `${foragidos} ${foragidos === 1 ? 'permanece foragido' : 'permanecem foragidos'}`;
    let extra = '';
    if (mp.foragidoNoLocalChegada) {
      const fug = mp.quantidadeFugiram || foragidos;
      extra = ` - No local na chegada: SIM (${fug} ${fug === 1 ? 'fugiu' : 'fugiram'}${
        mp.descricaoFuga ? `: ${mp.descricaoFuga}` : ''
      })`;
    } else if (mp.foragidoNoLocalChegada === false) {
      extra = ' - No local na chegada: NAO';
    }
    return `Alvos: ${alvos} - ${presosTxt} - ${foragTxt}${extra}`;
  }
  return `Foragido preso: ${mp.foragidoPreso ? 'SIM' : 'NAO'}`;
}

function formatPolOpMandadoBusca(mb: any): string {
  if (!mb?.ativo) return '';
  if (!mb.materialArrecadado) return 'Material arrecadado: NAO';
  const partes: string[] = [];
  for (const m of Array.isArray(mb.materiais) ? mb.materiais : []) {
    if (m === 'ARMA') {
      const list = (Array.isArray(mb.armasArrecadadas) ? mb.armasArrecadadas : []).map(
        (a: any) => `${a.quantidade} ${a.tipo}`
      );
      partes.push(list.length > 0 ? `ARMA (${list.join(', ')})` : 'ARMA');
    } else if (m === 'DROGA') {
      const list = (Array.isArray(mb.drogasArrecadadas) ? mb.drogasArrecadadas : []).map(
        (d: any) => `${d.quantidade} ${d.unidade === 't' ? 't' : 'kg'} de ${d.tipo}`
      );
      partes.push(list.length > 0 ? `DROGA (${list.join(', ')})` : 'DROGA');
    } else if (m === 'VEÍCULOS' || m === 'VEICULOS') {
      const list = (Array.isArray(mb.veiculosArrecadados) ? mb.veiculosArrecadados : []).map(
        (v: any) => `${v.quantidade} ${v.tipo}`
      );
      partes.push(list.length > 0 ? `VEICULOS (${list.join(', ')})` : 'VEICULOS');
    } else if (m === 'OUTROS') {
      partes.push(mb.outrosDetalhes ? `OUTROS (${mb.outrosDetalhes})` : 'OUTROS');
    } else {
      partes.push(String(m));
    }
  }
  return partes.length > 0 ? `Material arrecadado: SIM - ${partes.join(', ')}` : 'Material arrecadado: SIM';
}

function formatPolOpCrise(gc: any): string {
  if (!gc?.ativo) return '';
  if (gc.tipo === 'SUICÍDIO' || gc.tipo === 'SUICIDIO') {
    const consumado = gc.suicidioConsumado ? 'SIM' : 'NAO';
    const atuacao = gc.atuacaoAdotada
      ? ` - Atuacao adotada: ${gc.atuacaoAdotada}${
          gc.atuacaoAdotada === 'Outros' && gc.atuacaoOutrosDescricao ? ` (${gc.atuacaoOutrosDescricao})` : ''
        }`
      : '';
    return `Tipo: SUICIDIO - Consumado: ${consumado}${atuacao}`;
  }
  return `Tipo: ${gc.tipo || 'OUTROS'}${gc.outrosDetalhes ? ` (${gc.outrosDetalhes})` : ''}`;
}

function normalizeHHMM(raw?: string | null): string {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '00:00';
  return `${pad2(Number(m[1]))}:${pad2(Number(m[2]))}`;
}

function matchesPeriodRecord(
  dataOperacao: string,
  horaOperacao: string,
  dataCriacao: any,
  period: ResolvedOperationalPeriodFilter
): boolean {
  const isoDay = String(dataOperacao || '').trim().slice(0, 10);
  if (period.mode === 'date_range') {
    return isoDay >= period.startIsoDate && isoDay <= period.endIsoDate;
  }

  // Modo window_24h (Última permanência: das 19:00 do dia anterior até a hora da solicitação)
  const opWall = `${isoDay} ${normalizeHHMM(horaOperacao)}:00`;
  if (isoDay.length === 10 && opWall >= period.startWallClock && opWall <= period.endWallClock) {
    return true;
  }

  if (dataCriacao) {
    const createdDate = new Date(dataCriacao);
    if (!Number.isNaN(createdDate.getTime())) {
      const createdBr = getBrasiliaDateParts(createdDate).wallClock;
      if (createdBr >= period.startWallClock && createdBr <= period.endWallClock) {
        return true;
      }
    }
  }

  return false;
}

async function querySinopseOperacionalByUnitAndPeriod(
  pool: any,
  unitIds: string[],
  period: ResolvedOperationalPeriodFilter
): Promise<{
  catOps: SystemCatOpPdfRecord[];
  polOps: SystemPolicialOpPdfRecord[];
  canilOps: SystemCanilOpPdfRecord[];
}> {
  const unitClauseSql =
    unitIds.length > 0 ? ` AND r.UNIDADE_ID IN (${unitIds.map(() => '?').join(', ')})` : '';
  const windowStartUtc = new Date(`${period.startIsoDate}T19:00:00-03:00`);

  const buildDateFilter = (): { sql: string; params: any[] } => {
    if (period.mode === 'date_range') {
      return {
        sql: ' AND r.DATA_OPERACAO >= ? AND r.DATA_OPERACAO <= ?',
        params: [period.startIsoDate, period.endIsoDate]
      };
    }
    return {
      sql: ' AND ((r.DATA_OPERACAO >= ? AND r.DATA_OPERACAO <= ?) OR r.DATA_CRIACAO >= ?)',
      params: [period.startIsoDate, period.endIsoDate, windowStartUtc]
    };
  };

  const df = buildDateFilter();

  // 1. RELATORIOS_OPERACOES_CAT
  let catOps: SystemCatOpPdfRecord[] = [];
  try {
    const [rows]: any = await pool.query(
      `SELECT
        r.ID_REL_OP_CAT,
        r.DATA_OPERACAO,
        r.HORARIO_DECOLAGEM,
        r.HORARIO_VOO_OPERACAO,
        r.ESTADO_OPERACAO,
        r.MUNICIPIO_OPERACAO,
        r.APENAS_UM_MUNICIPIO,
        r.OUTROS_MUNICIPIOS_JSON,
        r.APOIO_OUTRO_DEPARTAMENTO,
        r.DEPARTAMENTOS_APOIO_JSON,
        r.COM_EMPREGO_AERONAVE,
        r.TIPO_VOO,
        r.TIPO_VOO_OUTROS_DESC,
        r.AERONAVES_JSON,
        r.TRIPULANTES_OPERACIONAIS_JSON,
        r.VIATURAS_JSON,
        r.EQUIPE_SOLO_JSON,
        r.SINOPSE_VOO,
        r.TEVE_DISPAROS_CAT,
        r.DISPAROS_CAT_JSON,
        r.TEVE_OBITO,
        r.QTD_OBITOS,
        r.DATA_CRIACAO,
        COALESCE(u.NOME_UNIDADES, r.UNIDADE_NOME, 'CAT') AS UNIDADE_FINAL
      FROM RELATORIOS_OPERACOES_CAT r
      LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
      WHERE 1=1${unitClauseSql}${df.sql}
      ORDER BY r.DATA_OPERACAO DESC, r.HORARIO_DECOLAGEM DESC, r.DATA_CRIACAO DESC`,
      [...unitIds, ...df.params]
    );

    catOps = (rows || [])
      .filter((r: any) =>
        matchesPeriodRecord(
          r.DATA_OPERACAO,
          r.HORARIO_DECOLAGEM || r.HORARIO_VOO_OPERACAO || '00:00',
          r.DATA_CRIACAO,
          period
        )
      )
      .map((r: any) => {
        const disparos = safeParseJsonArray(r.DISPAROS_CAT_JSON);
        const totalDisparosCat = disparos.reduce(
          (acc, d) => acc + Number(d?.quantidadeTiros || 0),
          0
        );
        const tipoVooRaw = String(r.TIPO_VOO || '').trim();
        const tipoVoo =
          tipoVooRaw.toUpperCase() === 'OUTROS' && r.TIPO_VOO_OUTROS_DESC
            ? `Outros: ${String(r.TIPO_VOO_OUTROS_DESC).trim()}`
            : tipoVooRaw;

        return {
          id: String(r.ID_REL_OP_CAT || ''),
          unidadeNome: String(r.UNIDADE_FINAL || 'CAT'),
          dataOperacao: String(r.DATA_OPERACAO || ''),
          horarioDecolagem: String(r.HORARIO_DECOLAGEM || ''),
          horarioVooOperacao: String(r.HORARIO_VOO_OPERACAO || ''),
          estadoOperacao: String(r.ESTADO_OPERACAO || 'MG'),
          municipioOperacao: String(r.MUNICIPIO_OPERACAO || ''),
          apenasUmMunicipio: Boolean(Number(r.APENAS_UM_MUNICIPIO ?? 1)),
          outrosMunicipios: safeParseJsonArray(r.OUTROS_MUNICIPIOS_JSON).map((m: any) => ({
            municipio: String(m?.municipio || ''),
            uf: String(m?.uf || '')
          })),
          apoioOutroDepartamento: Boolean(Number(r.APOIO_OUTRO_DEPARTAMENTO || 0)),
          departamentosApoio: safeParseJsonArray(r.DEPARTAMENTOS_APOIO_JSON).map((d: any) => String(d || '')).filter(Boolean),
          comEmpregoAeronave: Boolean(Number(r.COM_EMPREGO_AERONAVE ?? 1)),
          tipoVoo,
          aeronaves: safeParseJsonArray(r.AERONAVES_JSON).map((a: any) => ({
            tipo: String(a?.tipo || ''),
            prefixo: String(a?.prefixo || ''),
            horasVoo: String(a?.horasVoo || '00:00'),
            pilotoNome: String(a?.pilotoNome || ''),
            copilotoNome: String(a?.copilotoNome || '')
          })),
          tripulantesOperacionais: safeParseJsonArray(r.TRIPULANTES_OPERACIONAIS_JSON)
            .map((t: any) => ({ name: String(t?.name || t?.nome || '') }))
            .filter((t: any) => Boolean(t.name)),
          viaturas: safeParseJsonArray(r.VIATURAS_JSON).map((v: any) => ({
            placa: String(v?.placa || ''),
            descricao: String(v?.descricao || ''),
            operadores: safeParseJsonArray(v?.operadores)
              .map((o: any) => ({ name: String(o?.name || o?.nome || '') }))
              .filter((o: any) => Boolean(o.name))
          })),
          equipeSolo: safeParseJsonArray(r.EQUIPE_SOLO_JSON)
            .map((s: any) => ({ name: String(s?.name || s?.nome || '') }))
            .filter((s: any) => Boolean(s.name)),
          sinopseVoo: String(r.SINOPSE_VOO || ''),
          teveDisparosCat: Boolean(Number(r.TEVE_DISPAROS_CAT || 0)),
          totalDisparosCat,
          teveObito: Boolean(Number(r.TEVE_OBITO || 0)),
          quantidadeObitos: Number(r.QTD_OBITOS || 0)
        };
      });
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar RELATORIOS_OPERACOES_CAT:', err?.message);
  }

  // 2. RELATORIOS_OPERACOES_POLICIAL
  let polOps: SystemPolicialOpPdfRecord[] = [];
  try {
    const [rows]: any = await pool.query(
      `SELECT
        r.ID_REL_OP_POL,
        r.DATA_OPERACAO,
        r.HORA_OPERACAO,
        r.ESTADO_OPERACAO,
        r.MUNICIPIO_OPERACAO,
        r.APENAS_UM_MUNICIPIO,
        r.OUTROS_MUNICIPIOS_JSON,
        r.TIPO_ATENDIMENTO,
        r.ACIONAMENTO_VIA,
        r.ACIONAMENTO_OUTROS_DESC,
        r.DEPARTAMENTOS_APOIO_JSON,
        r.VIATURAS_JSON,
        r.OPERADORES_JSON,
        r.CRIADOR_NOME,
        r.SINOPSE,
        r.DETALHES_ADICIONAIS_JSON,
        r.HOUVE_OBITO,
        r.QUANTIDADE_OBITOS,
        r.DATA_CRIACAO,
        COALESCE(u.NOME_UNIDADES, r.UNIDADE_NOME, 'Sem Unidade') AS UNIDADE_FINAL
      FROM RELATORIOS_OPERACOES_POLICIAL r
      LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
      WHERE 1=1${unitClauseSql}${df.sql}
      ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC, r.DATA_CRIACAO DESC`,
      [...unitIds, ...df.params]
    );

    polOps = (rows || [])
      .filter((r: any) =>
        matchesPeriodRecord(r.DATA_OPERACAO, r.HORA_OPERACAO || '00:00', r.DATA_CRIACAO, period)
      )
      .map((r: any) => {
        const det = safeParseJsonObject(r.DETALHES_ADICIONAIS_JSON);
        const extras: string[] = [];
        const mpTxt = formatPolOpMandadoPrisao(det.mandadoPrisao);
        if (mpTxt) extras.push(`Mandado de Prisao: ${mpTxt}`);
        const mbTxt = formatPolOpMandadoBusca(det.mandadoBusca);
        if (mbTxt) extras.push(`Mandado de Busca: ${mbTxt}`);
        const gcTxt = formatPolOpCrise(det.gerenciamentoCrise);
        if (gcTxt) extras.push(`Crise: ${gcTxt}`);
        if (Boolean(Number(r.HOUVE_OBITO || 0))) {
          extras.push(`Obitos: ${Number(r.QUANTIDADE_OBITOS || 1)}`);
        }

        const acViaRaw = String(r.ACIONAMENTO_VIA || '').trim();
        const acionamentoVia =
          acViaRaw.toUpperCase() === 'OUTROS' && r.ACIONAMENTO_OUTROS_DESC
            ? `Outros (${String(r.ACIONAMENTO_OUTROS_DESC).trim()})`
            : acViaRaw;

        return {
          id: String(r.ID_REL_OP_POL || ''),
          unidadeNome: String(r.UNIDADE_FINAL || 'Sem Unidade'),
          dataOperacao: String(r.DATA_OPERACAO || ''),
          horarioOperacao: String(r.HORA_OPERACAO || ''),
          estadoOperacao: String(r.ESTADO_OPERACAO || 'MG'),
          municipioOperacao: String(r.MUNICIPIO_OPERACAO || ''),
          apenasUmMunicipio: Boolean(Number(r.APENAS_UM_MUNICIPIO ?? 1)),
          outrosMunicipios: safeParseJsonArray(r.OUTROS_MUNICIPIOS_JSON).map((m: any) => ({
            municipio: String(m?.municipio || ''),
            uf: String(m?.uf || '')
          })),
          tipoAtendimento: String(r.TIPO_ATENDIMENTO || ''),
          acionamentoVia,
          departamentosApoio: safeParseJsonArray(r.DEPARTAMENTOS_APOIO_JSON).map((d: any) => String(d || '')).filter(Boolean),
          viaturas: safeParseJsonArray(r.VIATURAS_JSON).map((v: any) => ({
            placa: String(v?.placa || ''),
            descricao: String(v?.descricao || '')
          })),
          operadores: safeParseJsonArray(r.OPERADORES_JSON)
            .map((o: any) => ({
              name: String(o?.name || o?.nome || ''),
              masp: String(o?.masp || '')
            }))
            .filter((o: any) => Boolean(o.name)),
          criadorNome: String(r.CRIADOR_NOME || ''),
          sinopse: String(r.SINOPSE || ''),
          detalhesExtras: extras
        };
      });
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar RELATORIOS_OPERACOES_POLICIAL:', err?.message);
  }

  // 3. RELATORIOS_OPERACOES_CANIL (COC / Canil K9)
  let canilOps: SystemCanilOpPdfRecord[] = [];
  try {
    const [rows]: any = await pool.query(
      `SELECT
        r.ID_REL_OPERACAO,
        r.DATA_OPERACAO,
        r.HORA_OPERACAO,
        r.ESTADO_OPERACAO,
        r.COMARCA,
        r.SOLICITACAO_TIPO,
        r.SOLICITACAO_OUTROS_DETALHES,
        r.APOIO_OUTRO_DEPARTAMENTO,
        r.DEPARTAMENTOS_APOIO_JSON,
        r.MATERIAL_ENCONTRADO,
        r.MATERIAIS_ENCONTRADOS_JSON,
        r.OPERADORES_JSON,
        r.VIATURAS_JSON,
        r.DETALHAMENTO,
        r.CRIADOR_NOME,
        r.DATA_CRIACAO,
        COALESCE(u.NOME_UNIDADES, 'COC') AS UNIDADE_FINAL
      FROM RELATORIOS_OPERACOES_CANIL r
      LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
      WHERE 1=1${unitClauseSql}${df.sql}
      ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC, r.DATA_CRIACAO DESC`,
      [...unitIds, ...df.params]
    );

    canilOps = (rows || [])
      .filter((r: any) =>
        matchesPeriodRecord(r.DATA_OPERACAO, r.HORA_OPERACAO || '00:00', r.DATA_CRIACAO, period)
      )
      .map((r: any) => {
        const solTipo = String(r.SOLICITACAO_TIPO || '').trim();
        const solicitacaoTexto =
          solTipo === 'Outros' && r.SOLICITACAO_OUTROS_DETALHES
            ? `Outros: ${String(r.SOLICITACAO_OUTROS_DETALHES).trim()}`
            : solTipo;

        return {
          id: String(r.ID_REL_OPERACAO || ''),
          unidadeNome: String(r.UNIDADE_FINAL || 'COC'),
          dataOperacao: String(r.DATA_OPERACAO || ''),
          horaOperacao: String(r.HORA_OPERACAO || ''),
          estadoOperacao: String(r.ESTADO_OPERACAO || 'MG'),
          comarca: String(r.COMARCA || ''),
          solicitacaoTexto,
          apoioOutroDepartamento: Boolean(Number(r.APOIO_OUTRO_DEPARTAMENTO || 0)),
          departamentosApoio: safeParseJsonArray(r.DEPARTAMENTOS_APOIO_JSON).map((d: any) => String(d || '')).filter(Boolean),
          viaturas: safeParseJsonArray(r.VIATURAS_JSON).map((v: any) => ({
            placa: String(v?.placa || ''),
            descricao: String(v?.descricao || '')
          })),
          materialEncontrado: Boolean(Number(r.MATERIAL_ENCONTRADO || 0)),
          materiaisEncontrados: safeParseJsonArray(r.MATERIAIS_ENCONTRADOS_JSON).map((m: any) => ({
            tipo: String(m?.tipo || ''),
            cachorros: safeParseJsonArray(m?.cachorros)
              .map((c: any) => String(typeof c === 'string' ? c : c?.nome || c?.name || ''))
              .filter(Boolean)
          })),
          operadores: safeParseJsonArray(r.OPERADORES_JSON)
            .map((o: any) => ({
              name: String(o?.name || o?.nome || ''),
              cachorros: safeParseJsonArray(o?.cachorros)
                .map((c: any) => String(typeof c === 'string' ? c : c?.nome || c?.name || ''))
                .filter(Boolean)
            }))
            .filter((o: any) => Boolean(o.name)),
          criadorNome: String(r.CRIADOR_NOME || ''),
          detalhamento: String(r.DETALHAMENTO || '')
        };
      });
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar RELATORIOS_OPERACOES_CANIL:', err?.message);
  }

  return { catOps, polOps, canilOps };
}

function formatDisparosReaisPdfSummary(disparoRealFlag: any, disparosJsonRaw: any): string {
  if (!Boolean(Number(disparoRealFlag || 0))) return '';
  const items = safeParseJsonArray(disparosJsonRaw).filter(
    (item: any) => item && item.tipoArma && Number(item.quantidadeTiros) > 0
  );
  if (items.length === 0) return 'Sim';
  const parts = items.map((item: any) => {
    const qty = Math.trunc(Number(item.quantidadeTiros));
    return `${String(item.tipoArma)}: ${qty} ${qty === 1 ? 'tiro' : 'tiros'}`;
  });
  const total = items.reduce((acc: number, item: any) => acc + Math.trunc(Number(item.quantidadeTiros)), 0);
  return parts.length > 1 ? `${parts.join(' - ')} (Total: ${total} tiros)` : parts[0];
}

function matchesTrainingPeriodRecord(
  dataTreinamento: string,
  horaTreinamento: string | null,
  dataCriacao: any,
  period: ResolvedOperationalPeriodFilter
): boolean {
  const isoDay = String(dataTreinamento || '').trim().slice(0, 10);
  if (period.mode === 'date_range') {
    return isoDay >= period.startIsoDate && isoDay <= period.endIsoDate;
  }

  // Modo window_24h (Última permanência: 19h do dia anterior até a hora da solicitação)
  if (horaTreinamento && /^\d{1,2}:\d{2}/.test(horaTreinamento.trim())) {
    const wall = `${isoDay} ${normalizeHHMM(horaTreinamento)}:00`;
    if (isoDay.length === 10 && wall >= period.startWallClock && wall <= period.endWallClock) {
      return true;
    }
  }

  if (dataCriacao) {
    const createdDate = new Date(dataCriacao);
    if (!Number.isNaN(createdDate.getTime())) {
      const createdBr = getBrasiliaDateParts(createdDate).wallClock;
      if (createdBr >= period.startWallClock && createdBr <= period.endWallClock) {
        return true;
      }
    }
  }

  // Para registros sem hora (ex: RELATORIOS_TREINAMENTO_POLICIAL), inclui treinamentos datados no dia corrente da solicitação
  if (!horaTreinamento && isoDay === period.endIsoDate) {
    return true;
  }

  return false;
}

async function querySinopseTreinamentoByUnitAndPeriod(
  pool: any,
  unitIds: string[],
  period: ResolvedOperationalPeriodFilter
): Promise<{
  polTrains: SystemPolicialTreinPdfRecord[];
  canilTrains: SystemCanilTreinPdfRecord[];
}> {
  const unitClauseSql =
    unitIds.length > 0 ? ` AND r.UNIDADE_ID IN (${unitIds.map(() => '?').join(', ')})` : '';
  const windowStartUtc = new Date(`${period.startIsoDate}T19:00:00-03:00`);

  const buildDateFilter = (): { sql: string; params: any[] } => {
    if (period.mode === 'date_range') {
      return {
        sql: ' AND r.DATA_TREINAMENTO >= ? AND r.DATA_TREINAMENTO <= ?',
        params: [period.startIsoDate, period.endIsoDate]
      };
    }
    return {
      sql: ' AND ((r.DATA_TREINAMENTO >= ? AND r.DATA_TREINAMENTO <= ?) OR r.DATA_CRIACAO >= ?)',
      params: [period.startIsoDate, period.endIsoDate, windowStartUtc]
    };
  };

  const df = buildDateFilter();

  // 1. RELATORIOS_TREINAMENTO_POLICIAL (COE, CORE, CAT, CAP, etc.)
  let polTrains: SystemPolicialTreinPdfRecord[] = [];
  try {
    const [rows]: any = await pool.query(
      `SELECT
        r.ID_REL_TREIN_POL,
        r.DATA_TREINAMENTO,
        r.OPERADOR_NOME,
        r.OPERADOR_MASP,
        r.MODALIDADE_LOCAL,
        r.TITULO_TREINAMENTO,
        r.MODALIDADE_PARTICIPACAO,
        r.OUTRAS_UNIDADES_JSON,
        r.PARTICIPANTES_JSON,
        r.DISPARO_REAL,
        r.DISPAROS_REAIS_JSON,
        r.DESCRICAO,
        r.DATA_CRIACAO,
        COALESCE(u.NOME_UNIDADES, r.UNIDADE_NOME, 'Sem Unidade') AS UNIDADE_FINAL
      FROM RELATORIOS_TREINAMENTO_POLICIAL r
      LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
      WHERE 1=1${unitClauseSql}${df.sql}
      ORDER BY r.DATA_TREINAMENTO DESC, r.DATA_CRIACAO DESC`,
      [...unitIds, ...df.params]
    );

    polTrains = (rows || [])
      .filter((r: any) =>
        matchesTrainingPeriodRecord(r.DATA_TREINAMENTO, null, r.DATA_CRIACAO, period)
      )
      .map((r: any) => ({
        id: String(r.ID_REL_TREIN_POL || ''),
        unidadeNome: String(r.UNIDADE_FINAL || 'Sem Unidade'),
        dataTreinamento: String(r.DATA_TREINAMENTO || ''),
        tituloTreinamento: String(r.TITULO_TREINAMENTO || 'Operacional'),
        modalidadeLocal: String(r.MODALIDADE_LOCAL || 'Interno'),
        modalidadeParticipacao: String(r.MODALIDADE_PARTICIPACAO || 'Sozinho'),
        operadorNome: String(r.OPERADOR_NOME || ''),
        operadorMasp: String(r.OPERADOR_MASP || ''),
        participantes: safeParseJsonArray(r.PARTICIPANTES_JSON)
          .map((p: any) => ({
            name: String(p?.name || p?.nome || ''),
            unitName: String(p?.unitName || p?.unidadeNome || '')
          }))
          .filter((p: any) => Boolean(p.name)),
        outrasUnidades: safeParseJsonArray(r.OUTRAS_UNIDADES_JSON)
          .map((u: any) => String(typeof u === 'string' ? u : u?.name || u?.nome || ''))
          .filter(Boolean),
        disparoRealResumo: formatDisparosReaisPdfSummary(r.DISPARO_REAL, r.DISPAROS_REAIS_JSON),
        descricao: String(r.DESCRICAO || '')
      }));
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar RELATORIOS_TREINAMENTO_POLICIAL:', err?.message);
  }

  // 2. RELATORIOS_TREINAMENTO_CANIL (COC / Canil K9)
  let canilTrains: SystemCanilTreinPdfRecord[] = [];
  try {
    const [rows]: any = await pool.query(
      `SELECT
        r.ID_REL_TREINAMENTO,
        r.DATA_TREINAMENTO,
        r.HORA_TREINAMENTO,
        r.CONDUTOR_NOME,
        r.CONDUTOR_MASP,
        r.CACHORRO_NOME,
        r.CACHORRO_RACA,
        r.CACHORROS_JSON,
        r.MODALIDADE_LOCAL,
        r.MODALIDADE_PARTICIPACAO,
        r.DESCRICAO,
        r.PARTICIPANTES_JSON,
        r.TOPICOS_TREINAMENTO_JSON,
        r.DISPARO_REAL,
        r.DISPAROS_REAIS_JSON,
        r.DATA_CRIACAO,
        COALESCE(u.NOME_UNIDADES, 'COC') AS UNIDADE_FINAL
      FROM RELATORIOS_TREINAMENTO_CANIL r
      LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
      WHERE 1=1${unitClauseSql}${df.sql}
      ORDER BY r.DATA_TREINAMENTO DESC, r.HORA_TREINAMENTO DESC, r.DATA_CRIACAO DESC`,
      [...unitIds, ...df.params]
    );

    canilTrains = (rows || [])
      .filter((r: any) =>
        matchesTrainingPeriodRecord(
          r.DATA_TREINAMENTO,
          r.HORA_TREINAMENTO ? String(r.HORA_TREINAMENTO) : null,
          r.DATA_CRIACAO,
          period
        )
      )
      .map((r: any) => {
        const parsedDogs = safeParseJsonArray(r.CACHORROS_JSON)
          .map((c: any) => ({
            nome: String(c?.nome || c?.name || ''),
            raca: String(c?.raca || '')
          }))
          .filter((c: any) => Boolean(c.nome));

        const condutorCachorros =
          parsedDogs.length > 0
            ? parsedDogs
            : r.CACHORRO_NOME
              ? [{ nome: String(r.CACHORRO_NOME), raca: String(r.CACHORRO_RACA || '') }]
              : [];

        return {
          id: String(r.ID_REL_TREINAMENTO || ''),
          unidadeNome: String(r.UNIDADE_FINAL || 'COC'),
          dataTreinamento: String(r.DATA_TREINAMENTO || ''),
          horaTreinamento: String(r.HORA_TREINAMENTO || '').slice(0, 5),
          condutorNome: String(r.CONDUTOR_NOME || ''),
          condutorMasp: String(r.CONDUTOR_MASP || ''),
          condutorCachorros,
          modalidadeLocal: String(r.MODALIDADE_LOCAL || 'Interno'),
          modalidadeParticipacao: String(r.MODALIDADE_PARTICIPACAO || 'Sozinho'),
          participantes: safeParseJsonArray(r.PARTICIPANTES_JSON)
            .map((p: any) => ({
              name: String(p?.name || p?.nome || ''),
              cachorros: safeParseJsonArray(p?.cachorros)
                .map((c: any) => String(typeof c === 'string' ? c : c?.nome || c?.name || ''))
                .filter(Boolean)
            }))
            .filter((p: any) => Boolean(p.name)),
          topicos: safeParseJsonArray(r.TOPICOS_TREINAMENTO_JSON)
            .map((t: any) => ({
              topico: String(t?.topico || ''),
              aplicarTodosK9: Boolean(t?.aplicarTodosK9),
              cachorros: safeParseJsonArray(t?.cachorros)
                .map((c: any) => String(typeof c === 'string' ? c : c?.nome || c?.name || ''))
                .filter(Boolean)
            }))
            .filter((t: any) => Boolean(t.topico)),
          disparoRealResumo: formatDisparosReaisPdfSummary(r.DISPARO_REAL, r.DISPAROS_REAIS_JSON),
          descricao: String(r.DESCRICAO || '')
        };
      });
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar RELATORIOS_TREINAMENTO_CANIL:', err?.message);
  }

  return { polTrains, canilTrains };
}

// ============================================================================
// AUXILIARES E CONSULTAS DE FICHA DE DESEMPENHO (INDIVIDUAL, UNIDADE E K9)
// ============================================================================
const DEFAULT_TOPICOS_K9_DESEMPENHO = [
  'VEÍCULO',
  'ENTERRADA',
  'ALTO',
  'TEMPO',
  'INDICAÇÃO',
  'FECHADO',
  'FISICO',
  'PAREDE',
  'COLONIZAÇÃO',
  'MALAS',
  'POSIÇÕES',
  'CONDUÇÃO',
  'HAND TARGET',
  'SOLTAR',
  'FOCINHEIRA'
];

function resolveDesempenhoCategoria(
  raw?: any,
  forced?: DesempenhoCategoriaPdf
): DesempenhoCategoriaPdf | null {
  if (forced) return forced;
  const norm = normalizeKey(String(raw || '')).replace(/[^A-Z0-9]/g, '');
  if (!norm) return null;
  if (norm.includes('FISIC')) return 'FISICO';
  if (norm.includes('OPERAC') || norm.includes('TATIC') || norm.includes('TECNIC')) return 'TATICO';
  return null;
}

function isCocUnitName(name?: string | null): boolean {
  const s = String(name || '');
  return /\bcoc\b/i.test(s) || /opera[çc][õo]es\s+com\s+c[ãa]es/i.test(s) || /\bcanil\b|\bk9\b/i.test(s);
}

function formatK9BaiaLabel(nome?: string | null, ident?: string | null): string {
  const n = String(nome || '').trim();
  const id = String(ident || '').trim();
  if (!n && !id) return 'Não alocada';
  if (n && id && !n.toLowerCase().includes(id.toLowerCase())) return `${n} (${id})`;
  return n || id;
}

async function queryUserProfileExtra(
  pool: any,
  userId: string
): Promise<{ cargo: string; fotoUrl: string | null; unidadeNome: string }> {
  try {
    const [rows]: any = await pool.query(
      `SELECT u.CARGO_USUARIOS as cargo, u.FOTO_URL_USUARIOS as fotoUrl, un.NOME_UNIDADES as unidadeNome
       FROM USUARIOS u
       LEFT JOIN UNIDADES un ON un.ID_UNIDADES = u.UNIDADE_ID_USUARIOS
       WHERE u.ID_USUARIOS = ?
       LIMIT 1`,
      [userId]
    );
    const r = rows?.[0];
    return {
      cargo: String(r?.cargo || 'Policial Civil'),
      fotoUrl: r?.fotoUrl ? String(r.fotoUrl) : null,
      unidadeNome: String(r?.unidadeNome || '')
    };
  } catch {
    try {
      const [rows]: any = await pool.query(
        `SELECT u.CARGO_USUARIOS as cargo, un.NOME_UNIDADES as unidadeNome
         FROM USUARIOS u
         LEFT JOIN UNIDADES un ON un.ID_UNIDADES = u.UNIDADE_ID_USUARIOS
         WHERE u.ID_USUARIOS = ?
         LIMIT 1`,
        [userId]
      );
      const r = rows?.[0];
      return {
        cargo: String(r?.cargo || 'Policial Civil'),
        fotoUrl: null,
        unidadeNome: String(r?.unidadeNome || '')
      };
    } catch {
      return { cargo: 'Policial Civil', fotoUrl: null, unidadeNome: '' };
    }
  }
}

async function queryDesempenhoResultadosYear(
  pool: any,
  categoria: DesempenhoCategoriaPdf,
  anoReferencia: number,
  filter: { usuarioId?: string; unitId?: string; userIds?: string[] }
): Promise<SystemDesempenhoResultadoPdf[]> {
  try {
    const where: string[] = ['r.CATEGORIA = ?', 'r.DATA_AVALIACAO LIKE ?'];
    const params: any[] = [categoria, `${anoReferencia}-%`];

    if (filter.usuarioId) {
      where.push('r.USUARIO_ID = ?');
      params.push(filter.usuarioId);
    } else if (filter.unitId && filter.userIds && filter.userIds.length > 0) {
      const ph = filter.userIds.map(() => '?').join(', ');
      where.push(`(r.USUARIO_UNIDADE_ID = ? OR r.USUARIO_ID IN (${ph}))`);
      params.push(filter.unitId, ...filter.userIds);
    } else if (filter.unitId) {
      where.push('r.USUARIO_UNIDADE_ID = ?');
      params.push(filter.unitId);
    }

    const [rows]: any = await pool.query(
      `SELECT
         r.ID_RESULTADO as id,
         r.ID_GRUPO as grupoId,
         g.NOME_GRUPO as grupoNome,
         r.ID_ATIVIDADE as atividadeId,
         a.NOME as atividadeNome,
         r.ID_MARCADOR as marcadorId,
         r.MARCADOR_NOME as marcadorNome,
         r.USUARIO_ID as usuarioId,
         r.USUARIO_NOME as usuarioNome,
         r.USUARIO_MASP as usuarioMasp,
         r.USUARIO_UNIDADE_NOME as usuarioUnidadeNome,
         r.CATEGORIA as categoria,
         r.TIPO_MARCA as tipoMarca,
         r.UNIDADE_MEDIDA as unidadeMedida,
         r.DATA_AVALIACAO as dataAvaliacao,
         r.HORA_AVALIACAO as horaAvaliacao,
         r.VALOR_MARCA as valorMarca,
         r.TEMPO_SEGUNDOS as tempoSegundos,
         r.NOTA_OBTIDA as notaObtida,
         r.NOTA_MIN_REF as notaMinRef,
         r.NOTA_MAX_REF as notaMaxRef,
         r.NOTA_APROVACAO_REF as notaAprovacaoRef,
         r.TEMPO_APROVACAO_REF as tempoAprovacaoRef,
         r.APROVADO as aprovado,
         r.AUSENTE as ausente,
         r.AUSENCIA_INFORMADA as ausenciaInformada,
         r.TEVE_TIRO as teveTiro,
         r.TIPO_ARMA as tipoArma,
         r.TIROS_EFETUADOS as tirosEfetuados,
         r.OBSERVACOES as observacoes,
         r.DATA_CRIACAO as createdAt
       FROM DESEMPENHO_RESULTADOS r
       LEFT JOIN DESEMPENHO_ATIVIDADES a ON a.ID_ATIVIDADE = r.ID_ATIVIDADE
       LEFT JOIN DESEMPENHO_GRUPOS g ON g.ID_GRUPO = r.ID_GRUPO
       WHERE ${where.join(' AND ')}
       ORDER BY r.DATA_AVALIACAO ASC, r.DATA_CRIACAO ASC`,
      params
    );

    return (rows || []).map((r: any) => ({
      id: String(r.id),
      grupoId: String(r.grupoId || ''),
      grupoNome: String(r.grupoNome || ''),
      atividadeId: String(r.atividadeId || ''),
      atividadeNome: String(r.atividadeNome || ''),
      marcadorId: String(r.marcadorId || ''),
      marcadorNome: String(r.marcadorNome || 'Marcador'),
      categoria: r.categoria === 'TATICO' ? 'TATICO' : 'FISICO',
      tipoMarca: r.tipoMarca || null,
      unidadeMedida: r.unidadeMedida || null,
      dataAvaliacao: String(r.dataAvaliacao || '').slice(0, 10),
      horaAvaliacao: r.horaAvaliacao || null,
      valorMarca: r.valorMarca !== null && r.valorMarca !== undefined ? Number(r.valorMarca) : null,
      tempoSegundos: r.tempoSegundos !== null && r.tempoSegundos !== undefined ? Number(r.tempoSegundos) : null,
      notaObtida: Number(r.notaObtida || 0),
      notaMinRef: Number(r.notaMinRef || 0),
      notaMaxRef: Number(r.notaMaxRef || 10),
      notaAprovacaoRef: Number(r.notaAprovacaoRef || 6),
      tempoAprovacaoRef:
        r.tempoAprovacaoRef !== null && r.tempoAprovacaoRef !== undefined ? Number(r.tempoAprovacaoRef) : null,
      aprovado: Boolean(r.aprovado),
      ausente: Boolean(r.ausente),
      ausenciaInformada:
        r.ausenciaInformada === null || r.ausenciaInformada === undefined ? null : Boolean(r.ausenciaInformada),
      teveTiro: Boolean(r.teveTiro),
      tipoArma: r.tipoArma || null,
      tirosEfetuados: r.tirosEfetuados !== null && r.tirosEfetuados !== undefined ? Number(r.tirosEfetuados) : null,
      observacoes: r.observacoes || null,
      createdAt: r.createdAt ? String(r.createdAt) : null,
      // metadata temporária usada apenas no agrupamento interno por usuário
      _usuarioId: String(r.usuarioId || ''),
      _usuarioNome: String(r.usuarioNome || ''),
      _usuarioMasp: String(r.usuarioMasp || '')
    })) as any;
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar DESEMPENHO_RESULTADOS:', err?.message);
    return [];
  }
}

async function queryDesempenhoUnidadeResumoYear(
  pool: any,
  categoria: DesempenhoCategoriaPdf,
  anoReferencia: number,
  unitId: string,
  unitDisplayName: string
): Promise<{
  marcadores: SystemDesempenhoMarcadorPdf[];
  atividades: SystemDesempenhoAtividadePdf[];
  usuarios: SystemDesempenhoUsuarioPdf[];
  totalAvaliacoes: number;
}> {
  // 1. Usuários lotados na unidade
  let unitUsersRows: any[] = [];
  try {
    const [uRows]: any = await pool.query(
      `SELECT ID_USUARIOS as id, NOME_USUARIOS as name, MASP_USUARIOS as masp,
              CARGO_USUARIOS as cargo, FOTO_URL_USUARIOS as fotoUrl
       FROM USUARIOS
       WHERE UNIDADE_ID_USUARIOS = ?
       ORDER BY NOME_USUARIOS ASC`,
      [unitId]
    );
    unitUsersRows = uRows || [];
  } catch {
    const [uRows]: any = await pool.query(
      `SELECT ID_USUARIOS as id, NOME_USUARIOS as name, MASP_USUARIOS as masp, CARGO_USUARIOS as cargo
       FROM USUARIOS
       WHERE UNIDADE_ID_USUARIOS = ?
       ORDER BY NOME_USUARIOS ASC`,
      [unitId]
    );
    unitUsersRows = uRows || [];
  }

  const userIds = unitUsersRows.map((u: any) => String(u.id));

  // 2. Avaliações da categoria no ano atual para os usuários da unidade
  const rawResultados: any[] = await queryDesempenhoResultadosYear(pool, categoria, anoReferencia, {
    unitId,
    userIds
  });

  const resultsByUser = new Map<string, SystemDesempenhoResultadoPdf[]>();
  const countByMarcador = new Map<string, number>();
  const countByAtividade = new Map<string, number>();

  for (const r of rawResultados) {
    const uid = String(r._usuarioId || '');
    if (uid) {
      const arr = resultsByUser.get(uid) || [];
      arr.push(r);
      resultsByUser.set(uid, arr);
    }
    if (r.marcadorId) countByMarcador.set(r.marcadorId, (countByMarcador.get(r.marcadorId) || 0) + 1);
    if (r.atividadeId) countByAtividade.set(r.atividadeId, (countByAtividade.get(r.atividadeId) || 0) + 1);
  }

  // Monta lista final de usuários (lotados na unidade + quaisquer usuários extras que tiveram avaliação na unidade no ano)
  const userMap = new Map<string, SystemDesempenhoUsuarioPdf>();
  for (const u of unitUsersRows) {
    const uid = String(u.id);
    userMap.set(uid, {
      id: uid,
      name: String(u.name || 'Policial'),
      masp: String(u.masp || ''),
      cargo: u.cargo ? String(u.cargo) : 'Policial Civil',
      unidadeNome: unitDisplayName,
      fotoUrl: u.fotoUrl ? String(u.fotoUrl) : null,
      resultados: resultsByUser.get(uid) || []
    });
  }
  for (const r of rawResultados) {
    const uid = String(r._usuarioId || '');
    if (uid && !userMap.has(uid)) {
      userMap.set(uid, {
        id: uid,
        name: String(r._usuarioNome || 'Policial'),
        masp: String(r._usuarioMasp || ''),
        cargo: 'Policial Civil',
        unidadeNome: unitDisplayName,
        fotoUrl: null,
        resultados: resultsByUser.get(uid) || []
      });
    }
  }
  const usuarios = Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // 3. Marcadores da categoria (ativos na unidade ou globais + usados no ano)
  let marcadores: SystemDesempenhoMarcadorPdf[] = [];
  try {
    let mRows: any[] = [];
    try {
      const [rows]: any = await pool.query(
        `SELECT ID_MARCADOR as id, NOME as nome, CATEGORIA as categoria, TIPO_MARCA as tipoMarca,
                UNIDADE_MEDIDA as unidadeMedida, VALOR_REFERENCIA as valorReferencia,
                USA_TEMPO as usaTempo, TEMPO_APROVACAO_SEG as tempoAprovacaoSeg,
                TEMPO_APROVACAO_MODO as tempoAprovacaoModo,
                NOTA_MIN as notaMin, NOTA_MAX as notaMax, NOTA_APROVACAO as notaAprovacao,
                DIFICULDADE as dificuldade, TEVE_TIRO as teveTiro, TIPO_ARMA as tipoArma,
                QUANTIDADE_TIROS as quantidadeTiros, DESCRICAO as descricao
         FROM DESEMPENHO_MARCADORES
         WHERE CATEGORIA = ? AND ATIVO = 1 AND (UNIDADE_ID = ? OR UNIDADE_ID IS NULL OR UNIDADE_ID = '')
         ORDER BY NOME ASC`,
        [categoria, unitId]
      );
      mRows = rows || [];
    } catch {
      const [rows]: any = await pool.query(
        `SELECT ID_MARCADOR as id, NOME as nome, CATEGORIA as categoria, TIPO_MARCA as tipoMarca,
                UNIDADE_MEDIDA as unidadeMedida, USA_TEMPO as usaTempo, TEMPO_APROVACAO_SEG as tempoAprovacaoSeg,
                NOTA_MIN as notaMin, NOTA_MAX as notaMax, NOTA_APROVACAO as notaAprovacao,
                DIFICULDADE as dificuldade, TEVE_TIRO as teveTiro, TIPO_ARMA as tipoArma,
                QUANTIDADE_TIROS as quantidadeTiros, DESCRICAO as descricao
         FROM DESEMPENHO_MARCADORES
         WHERE CATEGORIA = ? AND ATIVO = 1 AND (UNIDADE_ID = ? OR UNIDADE_ID IS NULL OR UNIDADE_ID = '')
         ORDER BY NOME ASC`,
        [categoria, unitId]
      );
      mRows = rows || [];
    }
    marcadores = mRows.map((m: any) => ({
      id: String(m.id),
      nome: String(m.nome || ''),
      categoria,
      tipoMarca: m.tipoMarca || null,
      unidadeMedida: m.unidadeMedida || null,
      valorReferencia:
        m.valorReferencia !== null && m.valorReferencia !== undefined ? Number(m.valorReferencia) : null,
      usaTempo: Boolean(m.usaTempo),
      tempoAprovacaoSeg:
        m.tempoAprovacaoSeg !== null && m.tempoAprovacaoSeg !== undefined ? Number(m.tempoAprovacaoSeg) : null,
      tempoAprovacaoModo:
        String(m.tempoAprovacaoModo || '').toUpperCase() === 'MAIOR_IGUAL' ? 'MAIOR_IGUAL' : 'MENOR_IGUAL',
      notaMin: Number(m.notaMin || 0),
      notaMax: Number(m.notaMax || 10),
      notaAprovacao: Number(m.notaAprovacao || 6),
      dificuldade: m.dificuldade || null,
      teveTiro: Boolean(m.teveTiro),
      tipoArma: m.tipoArma || null,
      quantidadeTiros:
        m.quantidadeTiros !== null && m.quantidadeTiros !== undefined ? Number(m.quantidadeTiros) : null,
      descricao: m.descricao || null,
      totalAvaliacoesAno: countByMarcador.get(String(m.id)) || 0
    }));
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar DESEMPENHO_MARCADORES:', err?.message);
  }

  // 4. Atividades da categoria no ano atual
  let atividades: SystemDesempenhoAtividadePdf[] = [];
  try {
    const [aRows]: any = await pool.query(
      `SELECT ID_ATIVIDADE as id, NOME as nome, CATEGORIA as categoria,
              DATA_ATIVIDADE as dataAtividade, HORA_ATIVIDADE as horaAtividade, DESCRICAO as descricao
       FROM DESEMPENHO_ATIVIDADES
       WHERE CATEGORIA = ? AND ATIVO = 1 AND DATA_ATIVIDADE LIKE ?
         AND (UNIDADE_ID = ? OR UNIDADE_ID IS NULL OR UNIDADE_ID = '')
       ORDER BY DATA_ATIVIDADE DESC, HORA_ATIVIDADE DESC`,
      [categoria, `${anoReferencia}-%`, unitId]
    );

    const ativIds = (aRows || []).map((a: any) => String(a.id));
    const marcadoresByAtiv = new Map<string, string[]>();
    if (ativIds.length > 0) {
      const ph = ativIds.map(() => '?').join(', ');
      const [amRows]: any = await pool.query(
        `SELECT am.ID_ATIVIDADE as atividadeId, m.NOME as marcadorNome
         FROM DESEMPENHO_ATIVIDADE_MARCADORES am
         INNER JOIN DESEMPENHO_MARCADORES m ON m.ID_MARCADOR = am.ID_MARCADOR
         WHERE am.ID_ATIVIDADE IN (${ph})
         ORDER BY am.ORDEM ASC, m.NOME ASC`,
        ativIds
      );
      for (const row of amRows || []) {
        const aid = String(row.atividadeId);
        const list = marcadoresByAtiv.get(aid) || [];
        if (row.marcadorNome) list.push(String(row.marcadorNome));
        marcadoresByAtiv.set(aid, list);
      }
    }

    atividades = (aRows || []).map((a: any) => ({
      id: String(a.id),
      nome: String(a.nome || ''),
      categoria,
      dataAtividade: String(a.dataAtividade || '').slice(0, 10),
      horaAtividade: a.horaAtividade || null,
      descricao: a.descricao || null,
      marcadoresNomes: marcadoresByAtiv.get(String(a.id)) || [],
      totalAvaliacoesAno: countByAtividade.get(String(a.id)) || 0
    }));
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar DESEMPENHO_ATIVIDADES:', err?.message);
  }

  return { marcadores, atividades, usuarios, totalAvaliacoes: rawResultados.length };
}

interface RawK9DogRow {
  id: string;
  nome: string;
  raca: string;
  sexo?: string | null;
  dataNascimento?: string | null;
  microchip?: string | null;
  pelagem?: string | null;
  especialidade?: string | null;
  canilFisicoNome?: string | null;
  canilFisicoIdentificacao?: string | null;
  status: string;
  tipoVinculo: string;
  usuarioInternoId?: string | null;
  usuarioInternoNome?: string | null;
  usuarioInternoMasp?: string | null;
  usuarioInterno2Id?: string | null;
  usuarioInterno2Nome?: string | null;
  usuarioInterno2Masp?: string | null;
  responsavelExternoNome?: string | null;
  fotoUrl?: string | null;
  anotacoesCondutor?: string | null;
  anotacoesCondutorUpdatedAt?: string | null;
}

async function queryK9AnimalsRaw(
  pool: any,
  filter: { condutorUserId?: string; unitId?: string }
): Promise<RawK9DogRow[]> {
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filter.condutorUserId) {
    where.push(
      "(c.TIPO_VINCULO_CACHORRO = 'SISTEMA' AND (c.USUARIO_INTERNO_ID_CACHORRO = ? OR c.USUARIO_INTERNO_2_ID_CACHORRO = ?))"
    );
    params.push(filter.condutorUserId, filter.condutorUserId);
  } else if (filter.unitId) {
    where.push("(c.UNIDADE_ID_CACHORRO = ? OR c.UNIDADE_ID_CACHORRO IS NULL OR c.UNIDADE_ID_CACHORRO = '')");
    params.push(filter.unitId);
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT
         c.ID_CACHORRO as id,
         c.NOME_CACHORRO as nome,
         c.RACA_CACHORRO as raca,
         c.SEXO_CACHORRO as sexo,
         DATE_FORMAT(c.DATA_NASCIMENTO_CACHORRO, '%Y-%m-%d') as dataNascimento,
         c.MICROCHIP_CACHORRO as microchip,
         c.PELAGEM_CACHORRO as pelagem,
         c.ESPECIALIDADE_CACHORRO as especialidade,
         k.NOME_CANIL as canilFisicoNome,
         k.IDENTIFICACAO_CANIL as canilFisicoIdentificacao,
         c.STATUS_CACHORRO as status,
         c.TIPO_VINCULO_CACHORRO as tipoVinculo,
         c.USUARIO_INTERNO_ID_CACHORRO as usuarioInternoId,
         c.USUARIO_INTERNO_NOME_CACHORRO as usuarioInternoNome,
         c.USUARIO_INTERNO_MASP_CACHORRO as usuarioInternoMasp,
         c.USUARIO_INTERNO_2_ID_CACHORRO as usuarioInterno2Id,
         c.USUARIO_INTERNO_2_NOME_CACHORRO as usuarioInterno2Nome,
         c.USUARIO_INTERNO_2_MASP_CACHORRO as usuarioInterno2Masp,
         c.RESPONSAVEL_EXTERNO_NOME_CACHORRO as responsavelExternoNome,
         c.FOTO_URL_CACHORRO as fotoUrl,
         c.ANOTACOES_CONDUTOR_CACHORRO as anotacoesCondutor,
         DATE_FORMAT(c.ANOTACOES_CONDUTOR_ATUALIZADO_EM, '%Y-%m-%d %H:%i:%s') as anotacoesCondutorUpdatedAt
       FROM CACHORROS_CANIL c
       LEFT JOIN CANIS_FISICOS k ON k.ID_CANIL = c.CANIL_FISICO_ID_CACHORRO
       WHERE ${where.join(' AND ')}
       ORDER BY c.NOME_CACHORRO ASC`,
      params
    );
    return (rows || []) as RawK9DogRow[];
  } catch {
    try {
      const [rows]: any = await pool.query(
        `SELECT
           c.ID_CACHORRO as id,
           c.NOME_CACHORRO as nome,
           c.RACA_CACHORRO as raca,
           c.SEXO_CACHORRO as sexo,
           DATE_FORMAT(c.DATA_NASCIMENTO_CACHORRO, '%Y-%m-%d') as dataNascimento,
           c.MICROCHIP_CACHORRO as microchip,
           c.PELAGEM_CACHORRO as pelagem,
           c.ESPECIALIDADE_CACHORRO as especialidade,
           k.NOME_CANIL as canilFisicoNome,
           k.IDENTIFICACAO_CANIL as canilFisicoIdentificacao,
           c.STATUS_CACHORRO as status,
           c.TIPO_VINCULO_CACHORRO as tipoVinculo,
           c.USUARIO_INTERNO_ID_CACHORRO as usuarioInternoId,
           c.USUARIO_INTERNO_NOME_CACHORRO as usuarioInternoNome,
           c.USUARIO_INTERNO_MASP_CACHORRO as usuarioInternoMasp,
           NULL as usuarioInterno2Id,
           NULL as usuarioInterno2Nome,
           NULL as usuarioInterno2Masp,
           c.RESPONSAVEL_EXTERNO_NOME_CACHORRO as responsavelExternoNome,
           c.FOTO_URL_CACHORRO as fotoUrl,
           NULL as anotacoesCondutor,
           NULL as anotacoesCondutorUpdatedAt
         FROM CACHORROS_CANIL c
         LEFT JOIN CANIS_FISICOS k ON k.ID_CANIL = c.CANIL_FISICO_ID_CACHORRO
         WHERE ${where.join(' AND ')}
         ORDER BY c.NOME_CACHORRO ASC`,
        params
      );
      return (rows || []) as RawK9DogRow[];
    } catch (err: any) {
      console.warn('[Relatorios API] Aviso ao consultar CACHORROS_CANIL:', err?.message);
      return [];
    }
  }
}

async function buildK9AnimalDossiersYear(
  pool: any,
  dogs: RawK9DogRow[],
  anoReferencia: number
): Promise<SystemK9AnimalPdf[]> {
  if (dogs.length === 0) return [];
  const dogIds = dogs.map(d => d.id);
  const ph = dogIds.map(() => '?').join(', ');

  // 1. Tópicos ativos de treinamento K9
  let activeTopicos: string[] = [...DEFAULT_TOPICOS_K9_DESEMPENHO];
  try {
    const [tRows]: any = await pool.query(
      'SELECT NOME_TOPICO as nome FROM TOPICOS_TREINAMENTO_CANIL ORDER BY ORDEM ASC, NOME_TOPICO ASC'
    );
    if (Array.isArray(tRows) && tRows.length > 0) {
      activeTopicos = tRows.map((r: any) => String(r.nome || '').trim()).filter(Boolean);
    }
  } catch {}

  // 2. Relatórios de treinamento canil APENAS DO ANO ATUAL
  let relRows: any[] = [];
  try {
    const [rRows]: any = await pool.query(
      `SELECT ID_REL_TREINAMENTO, CACHORRO_ID, CACHORRO_NOME, CACHORROS_JSON, PARTICIPANTES_JSON, TOPICOS_TREINAMENTO_JSON
       FROM RELATORIOS_TREINAMENTO_CANIL
       WHERE DATA_TREINAMENTO LIKE ?`,
      [`${anoReferencia}-%`]
    );
    relRows = rRows || [];
  } catch (err: any) {
    console.warn('[Relatorios API] Aviso ao consultar RELATORIOS_TREINAMENTO_CANIL para K9:', err?.message);
  }

  // Pré-processa os relatórios do ano
  const parsedReports = relRows.map((rel: any) => {
    const condutorDogs = safeParseJsonArray(rel.CACHORROS_JSON);
    const condIds =
      condutorDogs.length > 0
        ? condutorDogs.map((d: any) => String(d?.id || '')).filter(Boolean)
        : rel.CACHORRO_ID
        ? [String(rel.CACHORRO_ID)]
        : [];
    const partDogs = safeParseJsonArray(rel.PARTICIPANTES_JSON).flatMap((p: any) => safeParseJsonArray(p?.cachorros));
    const partIds = partDogs.map((d: any) => String(d?.id || '')).filter(Boolean);
    const reportDogIds = new Set<string>([...condIds, ...partIds]);
    const topicos = safeParseJsonArray(rel.TOPICOS_TREINAMENTO_JSON).map((item: any) => ({
      topico: item?.topico === 'PADERE' ? 'PAREDE' : String(item?.topico || ''),
      aplicarTodosK9: Boolean(item?.aplicarTodosK9),
      dogIds: new Set<string>(safeParseJsonArray(item?.cachorros).map((c: any) => String(c?.id || '')).filter(Boolean))
    }));
    return { reportDogIds, topicos };
  });

  // 3. Prontuário clínico em lote (vacinas, histórico médico, medicamentos)
  const vacinasByDog = new Map<string, SystemK9VacinaPdf[]>();
  try {
    const [vRows]: any = await pool.query(
      `SELECT CACHORRO_ID as cachorroId, NOME_VACINA as nomeVacina, DATA_APLICACAO as dataAplicacao,
              PROXIMA_DOSE as proximaDose, LOTE as lote, VETERINARIO as veterinario
       FROM CACHORROS_CANIL_VACINAS
       WHERE CACHORRO_ID IN (${ph})
       ORDER BY DATA_APLICACAO DESC, DATA_CRIACAO DESC`,
      dogIds
    );
    for (const v of vRows || []) {
      const cid = String(v.cachorroId);
      const list = vacinasByDog.get(cid) || [];
      list.push({
        nomeVacina: String(v.nomeVacina || ''),
        dataAplicacao: v.dataAplicacao ? String(v.dataAplicacao).slice(0, 10) : null,
        proximaDose: v.proximaDose ? String(v.proximaDose).slice(0, 10) : null,
        lote: v.lote || null,
        veterinario: v.veterinario || null
      });
      vacinasByDog.set(cid, list);
    }
  } catch {}

  const medicoByDog = new Map<string, SystemK9MedicoPdf>();
  try {
    const [mRows]: any = await pool.query(
      `SELECT CACHORRO_ID as cachorroId, DATA_ATENDIMENTO as dataAtendimento, TIPO_ATENDIMENTO as tipoAtendimento,
              DIAGNOSTICO as diagnostico, CONDUTA as conduta, VETERINARIO as veterinario
       FROM CACHORROS_CANIL_HISTORICO_MEDICO
       WHERE CACHORRO_ID IN (${ph})
       ORDER BY DATA_ATENDIMENTO DESC, DATA_CRIACAO DESC`,
      dogIds
    );
    for (const m of mRows || []) {
      const cid = String(m.cachorroId);
      if (!medicoByDog.has(cid)) {
        medicoByDog.set(cid, {
          dataAtendimento: m.dataAtendimento ? String(m.dataAtendimento).slice(0, 10) : null,
          tipoAtendimento: String(m.tipoAtendimento || 'Atendimento'),
          diagnostico: m.diagnostico || null,
          conduta: m.conduta || null,
          veterinario: m.veterinario || null
        });
      }
    }
  } catch {}

  const medByDog = new Map<string, SystemK9MedicamentoPdf>();
  try {
    const [mdRows]: any = await pool.query(
      `SELECT CACHORRO_ID_MOV_VET as cachorroId, PRODUTO_NOME_MOV_VET as produtoNome,
              QUANTIDADE_MOV_VET as quantidade, UNIDADE_MEDIDA_MOV_VET as unidadeMedida,
              DOSAGEM_APLICADA_MOV_VET as dosagemAplicada, FREQUENCIA_ADMINISTRADA_MOV_VET as frequenciaAdministrada,
              DATA_HORA_MOV_VET as dataHora, MOTIVO_MOV_VET as motivo,
              RESPONSAVEL_APLICACAO_NOME_MOV_VET as responsavelAplicacaoNome
       FROM MOVIMENTACOES_VETERINARIAS
       WHERE CACHORRO_ID_MOV_VET IN (${ph}) AND TIPO_MOVIMENTACAO_MOV_VET = 'ADMINISTRACAO_CAO'
       ORDER BY DATA_HORA_MOV_VET DESC`,
      dogIds
    );
    for (const md of mdRows || []) {
      const cid = String(md.cachorroId);
      if (!medByDog.has(cid)) {
        medByDog.set(cid, {
          produtoNome: String(md.produtoNome || ''),
          dataHora: md.dataHora ? new Date(md.dataHora).toISOString().replace('T', ' ').slice(0, 16) : null,
          quantidade: Number(md.quantidade || 0),
          unidadeMedida: md.unidadeMedida || null,
          dosagemAplicada: md.dosagemAplicada || null,
          frequenciaAdministrada: md.frequenciaAdministrada || null,
          motivo: md.motivo || null,
          responsavelAplicacaoNome: md.responsavelAplicacaoNome || null
        });
      }
    }
  } catch {}

  return dogs.map(dog => {
    const counts = new Map<string, number>();
    for (const t of activeTopicos) counts.set(t, 0);

    let totalTreinosAno = 0;
    for (const rep of parsedReports) {
      const participated = rep.reportDogIds.has(dog.id);
      if (participated) totalTreinosAno += 1;
      for (const item of rep.topicos) {
        if (!counts.has(item.topico)) continue;
        if ((item.aplicarTodosK9 && participated) || item.dogIds.has(dog.id)) {
          counts.set(item.topico, (counts.get(item.topico) || 0) + 1);
        }
      }
    }

    const bars: SystemK9TopicBarPdf[] = activeTopicos.map(topico => {
      const count = counts.get(topico) || 0;
      const pctOfTrainings = totalTreinosAno > 0 ? Math.round((count / totalTreinosAno) * 100) : 0;
      return { topico, count, pctOfTrainings };
    });
    const maxCount = bars.length > 0 ? Math.max(...bars.map(b => b.count)) : 0;
    const minCount = bars.length > 0 ? Math.min(...bars.map(b => b.count)) : 0;
    const aptidaoTopicos = maxCount > 0 ? bars.filter(b => b.count === maxCount).map(b => b.topico) : [];
    const sugestaoTopicos = bars.length > 0 ? bars.filter(b => b.count === minCount).map(b => b.topico) : [];

    const condutorTexto =
      dog.tipoVinculo === 'SISTEMA'
        ? [
            dog.usuarioInternoNome
              ? `${dog.usuarioInternoNome}${dog.usuarioInternoMasp ? ` (MASP ${formatMaspBr(dog.usuarioInternoMasp)})` : ''}`
              : null,
            dog.usuarioInterno2Nome
              ? `${dog.usuarioInterno2Nome}${dog.usuarioInterno2Masp ? ` (MASP ${formatMaspBr(dog.usuarioInterno2Masp)})` : ''}`
              : null
          ]
            .filter(Boolean)
            .join(' / ') || 'Não vinculado'
        : dog.responsavelExternoNome || 'Vínculo Externo';

    return {
      id: dog.id,
      nome: dog.nome,
      raca: dog.raca || 'Não informada',
      sexo: dog.sexo || null,
      dataNascimento: dog.dataNascimento || null,
      microchip: dog.microchip || null,
      pelagem: dog.pelagem || null,
      especialidade: dog.especialidade || null,
      baiaBox: formatK9BaiaLabel(dog.canilFisicoNome, dog.canilFisicoIdentificacao),
      status: dog.status || 'Ativo / Operacional',
      condutorTexto,
      fotoUrl: dog.fotoUrl || null,
      anotacoesCondutor: dog.anotacoesCondutor || null,
      anotacoesCondutorUpdatedAt: dog.anotacoesCondutorUpdatedAt || null,
      totalTreinosAno,
      bars,
      maxCount,
      minCount,
      aptidaoTopicos,
      sugestaoTopicos,
      vacinas: vacinasByDog.get(dog.id) || [],
      ultimoMedico: medicoByDog.get(dog.id) || null,
      ultimoMedicamento: medByDog.get(dog.id) || null
    };
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
