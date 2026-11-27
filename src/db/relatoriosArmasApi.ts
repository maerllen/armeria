import { Express, Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveWhatsappUserContext, PermittedUnit, ResolvedWhatsappUser } from './whatsappBotEngine';
import { decryptSecret } from './whatsappRoutes';
import {
  formatDateTimeBr,
  generateSystemArmasPdf,
  generateSystemMunicoesPdf,
  generateSystemExplosivosPdf,
  generateSystemMateriaisPdf,
  SystemArmaPdfRecord,
  SystemMunicaoPdfRecord,
  SystemExplosivoPdfRecord,
  SystemMaterialPdfRecord
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
      /^(?:FUZIS?|SUBMETRALHADORAS?|SUBMET|SMT|ESPINGARDAS?|ESP|MUNICOES?|MUNICAO|MUN|EXPLOSIVOS?|EXPLOSIVO|EXP|MATERIAIS?|MATERIAL|MAT|CALIBRE|CAL|ARMAS?|UNIDADE|UNIT|RELATORIO)[_\-\s:]+/i,
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
