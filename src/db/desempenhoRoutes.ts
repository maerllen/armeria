import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  calculateDistributedScore,
  evaluateDesempenhoApproval,
  normalizeFatorDistribuicao,
  normalizeTempoAprovacaoModo,
  parseRegrasDistribuicao
} from '../utils/desempenhoScoring';

interface DesempenhoRoutesDeps {
  getPool: () => any;
  insertAuditLog: (
    moduleName: string,
    action: string,
    details: string,
    user?: { id?: string; name?: string; masp?: string; role?: string },
    ip?: string
  ) => Promise<void>;
}

interface ResolvedActor {
  id: string;
  name: string;
  masp: string;
  primaryRole: string;
  roles: string[];
  departmentId: string | null;
  unitId: string | null;
  managementScope: string;
  isGeral: boolean;
  isAdmin: boolean;
  isArmeiro: boolean;
  canAccessUnitPerformance: boolean;
  canManageMarkers: boolean;
  isDeptScoped: boolean;
}

const VALID_CATEGORIAS = new Set(['FISICO', 'TATICO']);
const VALID_TIPOS_MARCA = new Set(['Execução', 'Repetição', 'Distância']);
const VALID_TIPOS_ARMA = new Set(['Fuzil', 'Pistola', 'Espingarda', 'Submetralhadora']);
const VALID_MODOS = new Set(['INDIVIDUAL', 'COLETIVO']);

let schemaEnsured = false;

async function ensureDesempenhoSchema(pool: any): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`DESEMPENHO_MARCADORES\` (
      \`ID_MARCADOR\` VARCHAR(64) NOT NULL,
      \`CATEGORIA\` ENUM('FISICO', 'TATICO') NOT NULL,
      \`NOME\` VARCHAR(180) NOT NULL,
      \`TIPO_MARCA\` VARCHAR(40) DEFAULT NULL,
      \`UNIDADE_MEDIDA\` VARCHAR(60) DEFAULT NULL,
      \`VALOR_REFERENCIA\` DECIMAL(12,2) DEFAULT NULL,
      \`USA_TEMPO\` TINYINT(1) NOT NULL DEFAULT 1,
      \`TEMPO_MIN_SEG\` INT DEFAULT NULL,
      \`TEMPO_MAX_SEG\` INT DEFAULT NULL,
      \`TEMPO_APROVACAO_SEG\` INT DEFAULT NULL,
      \`TEMPO_APROVACAO_MODO\` VARCHAR(16) NOT NULL DEFAULT 'MENOR_IGUAL',
      \`NOTA_MIN\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`NOTA_MAX\` DECIMAL(10,2) NOT NULL DEFAULT 10.00,
      \`NOTA_APROVACAO\` DECIMAL(10,2) NOT NULL DEFAULT 6.00,
      \`USA_DISTRIBUICAO_NOTA\` TINYINT(1) NOT NULL DEFAULT 0,
      \`FATOR_DISTRIBUICAO\` VARCHAR(20) DEFAULT NULL,
      \`REGRAS_DISTRIBUICAO\` LONGTEXT DEFAULT NULL,
      \`DIFICULDADE\` VARCHAR(40) NOT NULL DEFAULT 'Médio',
      \`TEVE_TIRO\` TINYINT(1) NOT NULL DEFAULT 0,
      \`TIPO_ARMA\` VARCHAR(40) DEFAULT NULL,
      \`QUANTIDADE_TIROS\` INT DEFAULT NULL,
      \`DESCRICAO\` LONGTEXT DEFAULT NULL,
      \`DEPARTAMENTO_ID\` VARCHAR(64) DEFAULT NULL,
      \`UNIDADE_ID\` VARCHAR(64) DEFAULT NULL,
      \`CRIADOR_ID\` VARCHAR(64) NOT NULL,
      \`CRIADOR_NOME\` VARCHAR(255) NOT NULL,
      \`ATIVO\` TINYINT(1) NOT NULL DEFAULT 1,
      \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`ID_MARCADOR\`),
      KEY \`idx_desemp_marc_cat\` (\`CATEGORIA\`),
      KEY \`idx_desemp_marc_dept\` (\`DEPARTAMENTO_ID\`),
      KEY \`idx_desemp_marc_unit\` (\`UNIDADE_ID\`),
      KEY \`idx_desemp_marc_ativo\` (\`ATIVO\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`DESEMPENHO_ATIVIDADES\` (
      \`ID_ATIVIDADE\` VARCHAR(64) NOT NULL,
      \`CATEGORIA\` ENUM('FISICO', 'TATICO') NOT NULL,
      \`NOME\` VARCHAR(200) NOT NULL,
      \`DATA_ATIVIDADE\` VARCHAR(10) NOT NULL,
      \`HORA_ATIVIDADE\` VARCHAR(5) NOT NULL DEFAULT '08:00',
      \`DESCRICAO\` VARCHAR(500) NOT NULL,
      \`DEPARTAMENTO_ID\` VARCHAR(64) DEFAULT NULL,
      \`UNIDADE_ID\` VARCHAR(64) DEFAULT NULL,
      \`CRIADOR_ID\` VARCHAR(64) NOT NULL,
      \`CRIADOR_NOME\` VARCHAR(255) NOT NULL,
      \`ATIVO\` TINYINT(1) NOT NULL DEFAULT 1,
      \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`ID_ATIVIDADE\`),
      KEY \`idx_desemp_ativ_cat\` (\`CATEGORIA\`),
      KEY \`idx_desemp_ativ_data\` (\`DATA_ATIVIDADE\`),
      KEY \`idx_desemp_ativ_dept\` (\`DEPARTAMENTO_ID\`),
      KEY \`idx_desemp_ativ_unit\` (\`UNIDADE_ID\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`DESEMPENHO_ATIVIDADE_MARCADORES\` (
      \`ID_ATIVIDADE\` VARCHAR(64) NOT NULL,
      \`ID_MARCADOR\` VARCHAR(64) NOT NULL,
      \`ORDEM\` INT NOT NULL DEFAULT 0,
      PRIMARY KEY (\`ID_ATIVIDADE\`, \`ID_MARCADOR\`),
      KEY \`idx_desemp_am_marc\` (\`ID_MARCADOR\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`DESEMPENHO_GRUPOS\` (
      \`ID_GRUPO\` VARCHAR(64) NOT NULL,
      \`ID_ATIVIDADE\` VARCHAR(64) NOT NULL,
      \`NOME_GRUPO\` VARCHAR(220) NOT NULL,
      \`CATEGORIA\` ENUM('FISICO', 'TATICO') NOT NULL,
      \`MODO_LANCAMENTO\` ENUM('INDIVIDUAL', 'COLETIVO') NOT NULL DEFAULT 'COLETIVO',
      \`DATA_PREVISTA\` VARCHAR(10) NOT NULL,
      \`HORA_PREVISTA\` VARCHAR(5) NOT NULL DEFAULT '08:00',
      \`STATUS\` ENUM('ABERTO', 'ENCERRADO') NOT NULL DEFAULT 'ABERTO',
      \`ENCERRADO_EM\` DATETIME DEFAULT NULL,
      \`ENCERRADO_POR_ID\` VARCHAR(64) DEFAULT NULL,
      \`ENCERRADO_POR_NOME\` VARCHAR(255) DEFAULT NULL,
      \`DEPARTAMENTO_ID\` VARCHAR(64) DEFAULT NULL,
      \`UNIDADE_ID\` VARCHAR(64) DEFAULT NULL,
      \`CRIADOR_ID\` VARCHAR(64) NOT NULL,
      \`CRIADOR_NOME\` VARCHAR(255) NOT NULL,
      \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`ID_GRUPO\`),
      KEY \`idx_desemp_grp_ativ\` (\`ID_ATIVIDADE\`),
      KEY \`idx_desemp_grp_status\` (\`STATUS\`),
      KEY \`idx_desemp_grp_data\` (\`DATA_PREVISTA\`),
      KEY \`idx_desemp_grp_dept\` (\`DEPARTAMENTO_ID\`),
      KEY \`idx_desemp_grp_unit\` (\`UNIDADE_ID\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`DESEMPENHO_GRUPO_USUARIOS\` (
      \`ID_GRUPO\` VARCHAR(64) NOT NULL,
      \`USUARIO_ID\` VARCHAR(64) NOT NULL,
      \`USUARIO_NOME\` VARCHAR(255) NOT NULL,
      \`USUARIO_MASP\` VARCHAR(32) DEFAULT NULL,
      \`USUARIO_CARGO\` VARCHAR(128) DEFAULT NULL,
      \`USUARIO_UNIDADE_ID\` VARCHAR(64) DEFAULT NULL,
      \`USUARIO_UNIDADE_NOME\` VARCHAR(255) DEFAULT NULL,
      \`DATA_VINCULO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`ID_GRUPO\`, \`USUARIO_ID\`),
      KEY \`idx_desemp_gu_user\` (\`USUARIO_ID\`),
      KEY \`idx_desemp_gu_unit\` (\`USUARIO_UNIDADE_ID\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`DESEMPENHO_RESULTADOS\` (
      \`ID_RESULTADO\` VARCHAR(64) NOT NULL,
      \`ID_GRUPO\` VARCHAR(64) NOT NULL,
      \`ID_ATIVIDADE\` VARCHAR(64) NOT NULL,
      \`ID_MARCADOR\` VARCHAR(64) NOT NULL,
      \`USUARIO_ID\` VARCHAR(64) NOT NULL,
      \`USUARIO_NOME\` VARCHAR(255) NOT NULL,
      \`USUARIO_MASP\` VARCHAR(32) DEFAULT NULL,
      \`USUARIO_UNIDADE_ID\` VARCHAR(64) DEFAULT NULL,
      \`USUARIO_UNIDADE_NOME\` VARCHAR(255) DEFAULT NULL,
      \`CATEGORIA\` ENUM('FISICO', 'TATICO') NOT NULL,
      \`MARCADOR_NOME\` VARCHAR(180) NOT NULL,
      \`TIPO_MARCA\` VARCHAR(40) DEFAULT NULL,
      \`UNIDADE_MEDIDA\` VARCHAR(60) DEFAULT NULL,
      \`DATA_AVALIACAO\` VARCHAR(10) NOT NULL,
      \`HORA_AVALIACAO\` VARCHAR(5) DEFAULT NULL,
      \`VALOR_MARCA\` DECIMAL(12,2) DEFAULT NULL,
      \`TEMPO_SEGUNDOS\` INT DEFAULT NULL,
      \`NOTA_OBTIDA\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`NOTA_MIN_REF\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`NOTA_MAX_REF\` DECIMAL(10,2) NOT NULL DEFAULT 10.00,
      \`NOTA_APROVACAO_REF\` DECIMAL(10,2) NOT NULL DEFAULT 6.00,
      \`TEMPO_APROVACAO_REF\` INT DEFAULT NULL,
      \`TEMPO_APROVACAO_MODO_REF\` VARCHAR(16) DEFAULT NULL,
      \`APROVADO\` TINYINT(1) NOT NULL DEFAULT 0,
      \`AUSENTE\` TINYINT(1) NOT NULL DEFAULT 0,
      \`AUSENCIA_INFORMADA\` TINYINT(1) DEFAULT NULL,
      \`TEVE_TIRO\` TINYINT(1) NOT NULL DEFAULT 0,
      \`TIPO_ARMA\` VARCHAR(40) DEFAULT NULL,
      \`TIROS_EFETUADOS\` INT DEFAULT NULL,
      \`OBSERVACOES\` VARCHAR(500) DEFAULT NULL,
      \`LANCADO_POR_ID\` VARCHAR(64) DEFAULT NULL,
      \`LANCADO_POR_NOME\` VARCHAR(255) DEFAULT NULL,
      \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`ID_RESULTADO\`),
      UNIQUE KEY \`uq_desemp_res_grp_usr_marc\` (\`ID_GRUPO\`, \`USUARIO_ID\`, \`ID_MARCADOR\`),
      KEY \`idx_desemp_res_user_data\` (\`USUARIO_ID\`, \`DATA_AVALIACAO\`),
      KEY \`idx_desemp_res_marc_data\` (\`ID_MARCADOR\`, \`DATA_AVALIACAO\`),
      KEY \`idx_desemp_res_cat_data\` (\`CATEGORIA\`, \`DATA_AVALIACAO\`),
      KEY \`idx_desemp_res_unit\` (\`USUARIO_UNIDADE_ID\`),
      KEY \`idx_desemp_res_grupo\` (\`ID_GRUPO\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  try {
    const [colAus]: any = await pool.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DESEMPENHO_RESULTADOS' AND COLUMN_NAME = 'AUSENTE'
    `);
    if (Number(colAus?.[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE \`DESEMPENHO_RESULTADOS\` ADD COLUMN \`AUSENTE\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`APROVADO\``);
    }
    const [colAusInf]: any = await pool.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DESEMPENHO_RESULTADOS' AND COLUMN_NAME = 'AUSENCIA_INFORMADA'
    `);
    if (Number(colAusInf?.[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE \`DESEMPENHO_RESULTADOS\` ADD COLUMN \`AUSENCIA_INFORMADA\` TINYINT(1) DEFAULT NULL AFTER \`AUSENTE\``);
    }
    const ensureColumn = async (table: string, col: string, ddl: string) => {
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col]
      );
      if (Number(rows?.[0]?.cnt || 0) === 0) {
        await pool.query(ddl);
      }
    };
    await ensureColumn(
      'DESEMPENHO_MARCADORES',
      'VALOR_REFERENCIA',
      'ALTER TABLE `DESEMPENHO_MARCADORES` ADD COLUMN `VALOR_REFERENCIA` DECIMAL(12,2) DEFAULT NULL AFTER `UNIDADE_MEDIDA`'
    );
    await ensureColumn(
      'DESEMPENHO_MARCADORES',
      'TEMPO_APROVACAO_MODO',
      "ALTER TABLE `DESEMPENHO_MARCADORES` ADD COLUMN `TEMPO_APROVACAO_MODO` VARCHAR(16) NOT NULL DEFAULT 'MENOR_IGUAL' AFTER `TEMPO_APROVACAO_SEG`"
    );
    await ensureColumn(
      'DESEMPENHO_MARCADORES',
      'USA_DISTRIBUICAO_NOTA',
      'ALTER TABLE `DESEMPENHO_MARCADORES` ADD COLUMN `USA_DISTRIBUICAO_NOTA` TINYINT(1) NOT NULL DEFAULT 0 AFTER `NOTA_APROVACAO`'
    );
    await ensureColumn(
      'DESEMPENHO_MARCADORES',
      'FATOR_DISTRIBUICAO',
      'ALTER TABLE `DESEMPENHO_MARCADORES` ADD COLUMN `FATOR_DISTRIBUICAO` VARCHAR(20) DEFAULT NULL AFTER `USA_DISTRIBUICAO_NOTA`'
    );
    await ensureColumn(
      'DESEMPENHO_MARCADORES',
      'REGRAS_DISTRIBUICAO',
      'ALTER TABLE `DESEMPENHO_MARCADORES` ADD COLUMN `REGRAS_DISTRIBUICAO` LONGTEXT DEFAULT NULL AFTER `FATOR_DISTRIBUICAO`'
    );
    await ensureColumn(
      'DESEMPENHO_RESULTADOS',
      'TEMPO_APROVACAO_MODO_REF',
      'ALTER TABLE `DESEMPENHO_RESULTADOS` ADD COLUMN `TEMPO_APROVACAO_MODO_REF` VARCHAR(16) DEFAULT NULL AFTER `TEMPO_APROVACAO_REF`'
    );
  } catch (migErr) {
    console.warn('[Aviso ensureDesempenhoSchema]', migErr);
  }

  schemaEnsured = true;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function parseRolesList(rolesRaw: any, primaryRole: string): string[] {
  let list: string[] = [];
  if (Array.isArray(rolesRaw)) {
    list = rolesRaw.map(r => String(r || '').trim()).filter(Boolean);
  } else if (typeof rolesRaw === 'string' && rolesRaw.trim()) {
    try {
      const parsed = JSON.parse(rolesRaw);
      if (Array.isArray(parsed)) {
        list = parsed.map(r => String(r || '').trim()).filter(Boolean);
      }
    } catch {
      list = rolesRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
  }
  const p = String(primaryRole || '').trim();
  if (p && !list.includes(p)) list.unshift(p);
  return list;
}

async function resolveActorFromDb(pool: any, actorIdRaw: any): Promise<ResolvedActor | null> {
  const actorId = String(actorIdRaw || '').trim();
  if (!actorId) return null;
  const [rows]: any = await pool.query(
    `SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS, PERFIL_USUARIOS, ROLES_USUARIOS,
            DEPARTAMENTO_ID_USUARIOS, UNIDADE_ID_USUARIOS, ABRANGENCIA_GESTAO_USUARIOS
       FROM USUARIOS
      WHERE ID_USUARIOS = ?
      LIMIT 1`,
    [actorId]
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  const primaryRole = String(r.PERFIL_USUARIOS || 'Policial');
  const roles = parseRolesList(r.ROLES_USUARIOS, primaryRole);
  const rolesLower = roles.map(x => x.toLowerCase());
  const isGeral = rolesLower.includes('geral');
  const isAdmin = rolesLower.includes('administrador');
  const isArmeiro = rolesLower.includes('armeiro');
  const managementScope = String(r.ABRANGENCIA_GESTAO_USUARIOS || 'unit');
  const isDeptScoped = isGeral || isAdmin || (isArmeiro && managementScope === 'department');
  return {
    id: String(r.ID_USUARIOS),
    name: String(r.NOME_USUARIOS || ''),
    masp: String(r.MASP_USUARIOS || ''),
    primaryRole,
    roles,
    departmentId: r.DEPARTAMENTO_ID_USUARIOS ? String(r.DEPARTAMENTO_ID_USUARIOS) : null,
    unitId: r.UNIDADE_ID_USUARIOS ? String(r.UNIDADE_ID_USUARIOS) : null,
    managementScope,
    isGeral,
    isAdmin,
    isArmeiro,
    canAccessUnitPerformance: isGeral || isAdmin || isArmeiro,
    canManageMarkers: isGeral || isAdmin,
    isDeptScoped
  };
}

async function getAccessibleUnitIds(pool: any, actor: ResolvedActor): Promise<string[] | null> {
  if (actor.isGeral) return null; // null = todas as unidades
  if (actor.isDeptScoped && actor.departmentId) {
    const [unitRows]: any = await pool.query(
      'SELECT ID_UNIDADES FROM UNIDADES WHERE DEPARTAMENTO_ID_UNIDADES = ?',
      [actor.departmentId]
    );
    const ids = (unitRows || []).map((u: any) => String(u.ID_UNIDADES));
    if (actor.unitId && !ids.includes(actor.unitId)) ids.push(actor.unitId);
    return ids;
  }
  return actor.unitId ? [actor.unitId] : [];
}

function toOptionalInt(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function toOptionalFloat(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function isValidIsoDate(val: any): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(val || '').trim());
}

function isValidTimeHHMM(val: any): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(val || '').trim());
}

function mapMarcadorRow(row: any) {
  return {
    id: String(row.ID_MARCADOR),
    categoria: String(row.CATEGORIA) as 'FISICO' | 'TATICO',
    nome: String(row.NOME || ''),
    tipoMarca: row.TIPO_MARCA ? String(row.TIPO_MARCA) : null,
    unidadeMedida: row.UNIDADE_MEDIDA ? String(row.UNIDADE_MEDIDA) : null,
    valorReferencia: row.VALOR_REFERENCIA != null ? Number(row.VALOR_REFERENCIA) : null,
    usaTempo: Boolean(Number(row.USA_TEMPO ?? 1)),
    tempoMinSegundos: row.TEMPO_MIN_SEG != null ? Number(row.TEMPO_MIN_SEG) : null,
    tempoMaxSegundos: row.TEMPO_MAX_SEG != null ? Number(row.TEMPO_MAX_SEG) : null,
    tempoAprovacaoSegundos: row.TEMPO_APROVACAO_SEG != null ? Number(row.TEMPO_APROVACAO_SEG) : null,
    tempoAprovacaoModo: normalizeTempoAprovacaoModo(row.TEMPO_APROVACAO_MODO),
    notaMinima: Number(row.NOTA_MIN ?? 0),
    notaMaxima: Number(row.NOTA_MAX ?? 10),
    notaAprovacao: Number(row.NOTA_APROVACAO ?? 6),
    usaDistribuicaoNota: Boolean(Number(row.USA_DISTRIBUICAO_NOTA ?? 0)),
    fatorDistribuicao: normalizeFatorDistribuicao(row.FATOR_DISTRIBUICAO),
    regrasDistribuicao: parseRegrasDistribuicao(row.REGRAS_DISTRIBUICAO),
    dificuldade: String(row.DIFICULDADE || 'Médio'),
    teveTiro: Boolean(Number(row.TEVE_TIRO ?? 0)),
    tipoArma: row.TIPO_ARMA ? String(row.TIPO_ARMA) : null,
    quantidadeTiros: row.QUANTIDADE_TIROS != null ? Number(row.QUANTIDADE_TIROS) : null,
    descricao: row.DESCRICAO != null ? String(row.DESCRICAO) : null,
    departmentId: row.DEPARTAMENTO_ID ? String(row.DEPARTAMENTO_ID) : null,
    unitId: row.UNIDADE_ID ? String(row.UNIDADE_ID) : null,
    criadorId: String(row.CRIADOR_ID || ''),
    criadorNome: String(row.CRIADOR_NOME || ''),
    ativo: Boolean(Number(row.ATIVO ?? 1)),
    createdAt: row.DATA_CRIACAO ? new Date(row.DATA_CRIACAO).toISOString() : undefined,
    updatedAt: row.DATA_ATUALIZACAO ? new Date(row.DATA_ATUALIZACAO).toISOString() : undefined
  };
}

function mapResultadoRow(row: any) {
  return {
    id: String(row.ID_RESULTADO),
    grupoId: String(row.ID_GRUPO),
    grupoNome: row.NOME_GRUPO ? String(row.NOME_GRUPO) : undefined,
    grupoStatus: row.GRUPO_STATUS ? (String(row.GRUPO_STATUS) as 'ABERTO' | 'ENCERRADO') : undefined,
    atividadeId: String(row.ID_ATIVIDADE),
    atividadeNome: row.ATIVIDADE_NOME ? String(row.ATIVIDADE_NOME) : undefined,
    marcadorId: String(row.ID_MARCADOR),
    usuarioId: String(row.USUARIO_ID),
    usuarioNome: String(row.USUARIO_NOME || ''),
    usuarioMasp: row.USUARIO_MASP ? String(row.USUARIO_MASP) : undefined,
    usuarioUnitId: row.USUARIO_UNIDADE_ID ? String(row.USUARIO_UNIDADE_ID) : null,
    usuarioUnitName: row.USUARIO_UNIDADE_NOME ? String(row.USUARIO_UNIDADE_NOME) : null,
    categoria: String(row.CATEGORIA) as 'FISICO' | 'TATICO',
    marcadorNome: String(row.MARCADOR_NOME || ''),
    tipoMarca: row.TIPO_MARCA ? String(row.TIPO_MARCA) : null,
    unidadeMedida: row.UNIDADE_MEDIDA ? String(row.UNIDADE_MEDIDA) : null,
    dataAvaliacao: String(row.DATA_AVALIACAO || ''),
    horaAvaliacao: row.HORA_AVALIACAO ? String(row.HORA_AVALIACAO) : null,
    valorMarca: row.VALOR_MARCA != null ? Number(row.VALOR_MARCA) : null,
    tempoSegundos: row.TEMPO_SEGUNDOS != null ? Number(row.TEMPO_SEGUNDOS) : null,
    notaObtida: Number(row.NOTA_OBTIDA ?? 0),
    notaMinRef: Number(row.NOTA_MIN_REF ?? 0),
    notaMaxRef: Number(row.NOTA_MAX_REF ?? 10),
    notaAprovacaoRef: Number(row.NOTA_APROVACAO_REF ?? 6),
    tempoAprovacaoRef: row.TEMPO_APROVACAO_REF != null ? Number(row.TEMPO_APROVACAO_REF) : null,
    tempoAprovacaoModoRef: row.TEMPO_APROVACAO_MODO_REF
      ? normalizeTempoAprovacaoModo(row.TEMPO_APROVACAO_MODO_REF)
      : 'MENOR_IGUAL',
    aprovado: Boolean(Number(row.APROVADO ?? 0)),
    ausente: Boolean(Number(row.AUSENTE ?? 0)),
    ausenciaInformada: row.AUSENCIA_INFORMADA != null ? Boolean(Number(row.AUSENCIA_INFORMADA)) : null,
    teveTiro: Boolean(Number(row.TEVE_TIRO ?? 0)),
    tipoArma: row.TIPO_ARMA ? String(row.TIPO_ARMA) : null,
    tirosEfetuados: row.TIROS_EFETUADOS != null ? Number(row.TIROS_EFETUADOS) : null,
    observacoes: row.OBSERVACOES != null ? String(row.OBSERVACOES) : null,
    lancadoPorId: row.LANCADO_POR_ID ? String(row.LANCADO_POR_ID) : undefined,
    lancadoPorNome: row.LANCADO_POR_NOME ? String(row.LANCADO_POR_NOME) : undefined,
    createdAt: row.DATA_CRIACAO ? new Date(row.DATA_CRIACAO).toISOString() : undefined,
    updatedAt: row.DATA_ATUALIZACAO ? new Date(row.DATA_ATUALIZACAO).toISOString() : undefined
  };
}

function validateMarcadorPayload(body: any): { ok: boolean; error?: string; cleaned?: any } {
  const categoria = String(body?.categoria || '').trim().toUpperCase();
  if (!VALID_CATEGORIAS.has(categoria)) {
    return { ok: false, error: 'Categoria inválida. Utilize FISICO ou TATICO.' };
  }

  const nome = String(body?.nome || '').trim();
  if (!nome || nome.length > 180) {
    return { ok: false, error: 'Informe o nome do marcador (máximo 180 caracteres).' };
  }

  const notaMinima = toOptionalFloat(body?.notaMinima);
  const notaMaxima = toOptionalFloat(body?.notaMaxima);
  const notaAprovacao = toOptionalFloat(body?.notaAprovacao);
  if (notaMinima === null || notaMaxima === null || notaAprovacao === null) {
    return { ok: false, error: 'Informe pontuação/nota mínima, máxima e de aprovação válidas.' };
  }
  if (notaMinima < 0 || notaMaxima <= notaMinima) {
    return { ok: false, error: 'A pontuação/nota máxima deve ser maior que a mínima.' };
  }
  if (notaAprovacao < notaMinima || notaAprovacao > notaMaxima) {
    return { ok: false, error: 'A pontuação/nota de aprovação deve estar entre a mínima e a máxima.' };
  }

  const dificuldade = String(body?.dificuldade || '').trim() || 'Médio';
  if (dificuldade.length > 40) {
    return { ok: false, error: 'Dificuldade inválida.' };
  }

  const descricaoRaw = body?.descricao != null ? String(body.descricao) : '';
  const lineCount = descricaoRaw ? descricaoRaw.split(/\r?\n/).length : 0;
  if (lineCount > 200) {
    return { ok: false, error: `A descrição ultrapassa o limite máximo de 200 linhas (atual: ${lineCount}).` };
  }

  let tipoMarca: string | null = null;
  let unidadeMedida: string | null = body?.unidadeMedida ? String(body.unidadeMedida).trim().slice(0, 60) : null;
  const valorReferenciaRaw = toOptionalFloat(body?.valorReferencia);
  if (valorReferenciaRaw !== null && valorReferenciaRaw < 0) {
    return { ok: false, error: 'O valor de referência da unidade de medida não pode ser negativo.' };
  }
  const valorReferencia = categoria === 'FISICO' ? valorReferenciaRaw : null;
  const usaTempo = Boolean(body?.usaTempo);
  const tempoAprovacaoModo = normalizeTempoAprovacaoModo(body?.tempoAprovacaoModo);

  if (categoria === 'FISICO') {
    const rawTipo = String(body?.tipoMarca || '').trim();
    if (!VALID_TIPOS_MARCA.has(rawTipo)) {
      return { ok: false, error: 'Para marcadores Físicos, selecione o tipo de marca (Execução, Repetição ou Distância).' };
    }
    tipoMarca = rawTipo;
    if (!unidadeMedida) {
      unidadeMedida =
        rawTipo === 'Repetição' ? 'repetições' : rawTipo === 'Distância' ? 'metros' : 'execuções';
    }
  } else if (!unidadeMedida) {
    unidadeMedida = 'pontos';
  }

  let tempoMinSegundos = usaTempo ? toOptionalInt(body?.tempoMinSegundos) : null;
  let tempoMaxSegundos = usaTempo ? toOptionalInt(body?.tempoMaxSegundos) : null;
  let tempoAprovacaoSegundos = usaTempo ? toOptionalInt(body?.tempoAprovacaoSegundos) : null;

  if (usaTempo) {
    if (tempoMinSegundos !== null && tempoMinSegundos < 0) {
      return { ok: false, error: 'Tempo mínimo não pode ser negativo.' };
    }
    if (tempoMaxSegundos !== null && tempoMaxSegundos <= 0) {
      return { ok: false, error: 'Tempo máximo deve ser maior que zero.' };
    }
    if (tempoMinSegundos !== null && tempoMaxSegundos !== null && tempoMaxSegundos < tempoMinSegundos) {
      return { ok: false, error: 'Tempo máximo não pode ser menor que o tempo mínimo.' };
    }
    if (tempoAprovacaoSegundos !== null) {
      if (tempoAprovacaoSegundos < 0) {
        return { ok: false, error: 'Tempo de aprovação inválido.' };
      }
      if (tempoMinSegundos !== null && tempoAprovacaoSegundos < tempoMinSegundos) {
        return { ok: false, error: 'Tempo de aprovação não pode ser menor que o tempo mínimo.' };
      }
      if (tempoMaxSegundos !== null && tempoAprovacaoSegundos > tempoMaxSegundos) {
        return { ok: false, error: 'Tempo de aprovação não pode ser maior que o tempo máximo.' };
      }
    }
  } else {
    tempoMinSegundos = null;
    tempoMaxSegundos = null;
    tempoAprovacaoSegundos = null;
  }

  const usaDistribuicaoNota = Boolean(body?.usaDistribuicaoNota);
  let fatorDistribuicao: 'MARCA' | 'TEMPO' | null = null;
  let regrasDistribuicao: Array<{ valor: number; pontos: number }> = [];

  if (usaDistribuicaoNota) {
    fatorDistribuicao = normalizeFatorDistribuicao(body?.fatorDistribuicao);
    if (!fatorDistribuicao) {
      return {
        ok: false,
        error: 'Selecione o fator de distribuição de pontuação (Tipo de Marca ou Tempo).'
      };
    }
    if (fatorDistribuicao === 'TEMPO' && !usaTempo) {
      return {
        ok: false,
        error: 'Ative o controle de tempo para utilizar distribuição de pontuação por tempo.'
      };
    }
    const rawRules = Array.isArray(body?.regrasDistribuicao) ? body.regrasDistribuicao : [];
    if (rawRules.length === 0) {
      return { ok: false, error: 'Adicione ao menos uma divisão/faixa na distribuição de pontuação.' };
    }
    if (rawRules.length > 50) {
      return { ok: false, error: 'Limite máximo de 50 divisões na distribuição de pontuação.' };
    }
    const seenValues = new Set<number>();
    for (let idx = 0; idx < rawRules.length; idx++) {
      const r = rawRules[idx];
      const v = fatorDistribuicao === 'TEMPO' ? toOptionalInt(r?.valor) : toOptionalFloat(r?.valor);
      const pts = toOptionalFloat(r?.pontos);
      if (v === null || v < 0) {
        return { ok: false, error: `Informe um valor válido na divisão #${idx + 1}.` };
      }
      if (pts === null || pts < notaMinima || pts > notaMaxima) {
        return {
          ok: false,
          error: `A pontuação da divisão #${idx + 1} deve estar entre a nota mínima (${notaMinima}) e a máxima (${notaMaxima}).`
        };
      }
      if (seenValues.has(v)) {
        return {
          ok: false,
          error: `Valor duplicado na distribuição de pontuação (divisão #${idx + 1}). Informe valores distintos.`
        };
      }
      seenValues.add(v);
      regrasDistribuicao.push({ valor: v, pontos: pts });
    }
    regrasDistribuicao.sort((a, b) => a.valor - b.valor);
  }

  let teveTiro = false;
  let tipoArma: string | null = null;
  let quantidadeTiros: number | null = null;

  if (categoria === 'TATICO') {
    teveTiro = Boolean(body?.teveTiro);
    if (teveTiro) {
      const rawArma = String(body?.tipoArma || '').trim();
      if (!VALID_TIPOS_ARMA.has(rawArma)) {
        return {
          ok: false,
          error: 'Selecione o tipo de arma (Fuzil, Pistola, Espingarda ou Submetralhadora).'
        };
      }
      const qtd = toOptionalInt(body?.quantidadeTiros);
      if (qtd === null || qtd <= 0) {
        return { ok: false, error: 'Informe uma quantidade de tiros maior que zero.' };
      }
      tipoArma = rawArma;
      quantidadeTiros = qtd;
    }
  }

  return {
    ok: true,
    cleaned: {
      categoria,
      nome,
      tipoMarca,
      unidadeMedida,
      valorReferencia,
      usaTempo,
      tempoMinSegundos,
      tempoMaxSegundos,
      tempoAprovacaoSegundos,
      tempoAprovacaoModo,
      notaMinima,
      notaMaxima,
      notaAprovacao,
      usaDistribuicaoNota,
      fatorDistribuicao,
      regrasDistribuicaoJson: usaDistribuicaoNota ? JSON.stringify(regrasDistribuicao) : null,
      dificuldade,
      teveTiro,
      tipoArma,
      quantidadeTiros,
      descricao: descricaoRaw || null
    }
  };
}

export function registerDesempenhoRoutes(router: Router, deps: DesempenhoRoutesDeps): void {
  const { getPool, insertAuditLog } = deps;

  // =========================================================================
  // 1. MARCADORES (FÍSICOS E TÁTICOS)
  // =========================================================================

  router.get('/desempenho/marcadores', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actorId = req.query.actorId;
      const actor = await resolveActorFromDb(pool, actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      const categoria = req.query.categoria ? String(req.query.categoria).toUpperCase() : '';
      const includeInactive = String(req.query.includeInactive || '') === '1';

      const clauses: string[] = [];
      const params: any[] = [];

      if (categoria && VALID_CATEGORIAS.has(categoria)) {
        clauses.push('CATEGORIA = ?');
        params.push(categoria);
      }
      if (!includeInactive) {
        clauses.push('ATIVO = 1');
      }
      if (!actor.isGeral && actor.departmentId) {
        clauses.push('(DEPARTAMENTO_ID IS NULL OR DEPARTAMENTO_ID = ?)');
        params.push(actor.departmentId);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const [rows]: any = await pool.query(
        `SELECT * FROM DESEMPENHO_MARCADORES ${whereSql} ORDER BY CATEGORIA ASC, NOME ASC`,
        params
      );

      return res.json({ marcadores: (rows || []).map(mapMarcadorRow) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao listar marcadores.' });
    }
  });

  router.post('/desempenho/marcadores', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.body?.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canManageMarkers) {
        return res.status(403).json({
          error: 'Apenas usuários com perfil Administrador podem cadastrar marcadores de desempenho.'
        });
      }

      const validation = validateMarcadorPayload(req.body);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }
      const c = validation.cleaned;

      const id = genId('marc');
      const departmentId = actor.isGeral ? (req.body?.departmentId || actor.departmentId || null) : actor.departmentId;
      const unitId = actor.isGeral ? (req.body?.unitId || actor.unitId || null) : actor.unitId;

      await pool.query(
        `INSERT INTO DESEMPENHO_MARCADORES (
          ID_MARCADOR, CATEGORIA, NOME, TIPO_MARCA, UNIDADE_MEDIDA, VALOR_REFERENCIA, USA_TEMPO,
          TEMPO_MIN_SEG, TEMPO_MAX_SEG, TEMPO_APROVACAO_SEG, TEMPO_APROVACAO_MODO,
          NOTA_MIN, NOTA_MAX, NOTA_APROVACAO,
          USA_DISTRIBUICAO_NOTA, FATOR_DISTRIBUICAO, REGRAS_DISTRIBUICAO,
          DIFICULDADE,
          TEVE_TIRO, TIPO_ARMA, QUANTIDADE_TIROS, DESCRICAO,
          DEPARTAMENTO_ID, UNIDADE_ID, CRIADOR_ID, CRIADOR_NOME, ATIVO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          id,
          c.categoria,
          c.nome,
          c.tipoMarca,
          c.unidadeMedida,
          c.valorReferencia,
          c.usaTempo ? 1 : 0,
          c.tempoMinSegundos,
          c.tempoMaxSegundos,
          c.tempoAprovacaoSegundos,
          c.tempoAprovacaoModo,
          c.notaMinima,
          c.notaMaxima,
          c.notaAprovacao,
          c.usaDistribuicaoNota ? 1 : 0,
          c.fatorDistribuicao,
          c.regrasDistribuicaoJson,
          c.dificuldade,
          c.teveTiro ? 1 : 0,
          c.tipoArma,
          c.quantidadeTiros,
          c.descricao,
          departmentId,
          unitId,
          actor.id,
          actor.name
        ]
      );

      await insertAuditLog(
        'Relatórios',
        'Cadastrar Marcador de Desempenho',
        `Marcador ${c.categoria} "${c.nome}" cadastrado por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      const [rows]: any = await pool.query('SELECT * FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR = ?', [id]);
      return res.json({ success: true, marcador: mapMarcadorRow(rows[0]) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao cadastrar marcador.' });
    }
  });

  router.put('/desempenho/marcadores/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.body?.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canManageMarkers) {
        return res.status(403).json({
          error: 'Apenas usuários com perfil Administrador podem editar marcadores de desempenho.'
        });
      }

      const id = String(req.params.id || '').trim();
      const [existingRows]: any = await pool.query(
        'SELECT * FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR = ? LIMIT 1',
        [id]
      );
      if (!existingRows || existingRows.length === 0) {
        return res.status(404).json({ error: 'Marcador não encontrado.' });
      }
      const existing = existingRows[0];
      if (!actor.isGeral && existing.DEPARTAMENTO_ID && actor.departmentId && existing.DEPARTAMENTO_ID !== actor.departmentId) {
        return res.status(403).json({ error: 'Sem permissão para editar marcadores de outro departamento.' });
      }

      const validation = validateMarcadorPayload({ ...req.body, categoria: existing.CATEGORIA });
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }
      const c = validation.cleaned;

      await pool.query(
        `UPDATE DESEMPENHO_MARCADORES SET
          NOME = ?, TIPO_MARCA = ?, UNIDADE_MEDIDA = ?, VALOR_REFERENCIA = ?, USA_TEMPO = ?,
          TEMPO_MIN_SEG = ?, TEMPO_MAX_SEG = ?, TEMPO_APROVACAO_SEG = ?, TEMPO_APROVACAO_MODO = ?,
          NOTA_MIN = ?, NOTA_MAX = ?, NOTA_APROVACAO = ?,
          USA_DISTRIBUICAO_NOTA = ?, FATOR_DISTRIBUICAO = ?, REGRAS_DISTRIBUICAO = ?,
          DIFICULDADE = ?,
          TEVE_TIRO = ?, TIPO_ARMA = ?, QUANTIDADE_TIROS = ?, DESCRICAO = ?
         WHERE ID_MARCADOR = ?`,
        [
          c.nome,
          c.tipoMarca,
          c.unidadeMedida,
          c.valorReferencia,
          c.usaTempo ? 1 : 0,
          c.tempoMinSegundos,
          c.tempoMaxSegundos,
          c.tempoAprovacaoSegundos,
          c.tempoAprovacaoModo,
          c.notaMinima,
          c.notaMaxima,
          c.notaAprovacao,
          c.usaDistribuicaoNota ? 1 : 0,
          c.fatorDistribuicao,
          c.regrasDistribuicaoJson,
          c.dificuldade,
          c.teveTiro ? 1 : 0,
          c.tipoArma,
          c.quantidadeTiros,
          c.descricao,
          id
        ]
      );

      await insertAuditLog(
        'Relatórios',
        'Editar Marcador de Desempenho',
        `Marcador ${c.categoria} "${c.nome}" atualizado por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      const [rows]: any = await pool.query('SELECT * FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR = ?', [id]);
      return res.json({ success: true, marcador: mapMarcadorRow(rows[0]) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao atualizar marcador.' });
    }
  });

  router.delete('/desempenho/marcadores/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.query.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canManageMarkers) {
        return res.status(403).json({
          error: 'Apenas usuários com perfil Administrador podem excluir marcadores de desempenho.'
        });
      }

      const id = String(req.params.id || '').trim();
      const [existingRows]: any = await pool.query(
        'SELECT * FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR = ? LIMIT 1',
        [id]
      );
      if (!existingRows || existingRows.length === 0) {
        return res.status(404).json({ error: 'Marcador não encontrado.' });
      }
      const existing = existingRows[0];
      if (!actor.isGeral && existing.DEPARTAMENTO_ID && actor.departmentId && existing.DEPARTAMENTO_ID !== actor.departmentId) {
        return res.status(403).json({ error: 'Sem permissão para excluir marcadores de outro departamento.' });
      }

      const [usedRes]: any = await pool.query(
        'SELECT COUNT(*) AS cnt FROM DESEMPENHO_RESULTADOS WHERE ID_MARCADOR = ?',
        [id]
      );
      const [usedAct]: any = await pool.query(
        'SELECT COUNT(*) AS cnt FROM DESEMPENHO_ATIVIDADE_MARCADORES WHERE ID_MARCADOR = ?',
        [id]
      );
      const isReferenced = Number(usedRes?.[0]?.cnt || 0) > 0 || Number(usedAct?.[0]?.cnt || 0) > 0;

      if (isReferenced) {
        await pool.query('UPDATE DESEMPENHO_MARCADORES SET ATIVO = 0 WHERE ID_MARCADOR = ?', [id]);
      } else {
        await pool.query('DELETE FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR = ?', [id]);
      }

      await insertAuditLog(
        'Relatórios',
        'Excluir Marcador de Desempenho',
        `Marcador "${existing.NOME}" ${isReferenced ? 'inativado (possui histórico)' : 'excluído'} por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true, archived: isReferenced });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao excluir marcador.' });
    }
  });

  // =========================================================================
  // 2. ATIVIDADES (FÍSICAS E TÁTICAS)
  // =========================================================================

  router.get('/desempenho/atividades', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.query.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Acesso restrito a perfis Administrador e Armeiro.' });
      }

      const clauses: string[] = ['ATIVO = 1'];
      const params: any[] = [];
      if (!actor.isGeral && actor.departmentId) {
        clauses.push('(DEPARTAMENTO_ID IS NULL OR DEPARTAMENTO_ID = ?)');
        params.push(actor.departmentId);
      }

      const [actRows]: any = await pool.query(
        `SELECT * FROM DESEMPENHO_ATIVIDADES WHERE ${clauses.join(' AND ')} ORDER BY DATA_ATIVIDADE DESC, DATA_CRIACAO DESC`,
        params
      );

      const actIds = (actRows || []).map((a: any) => String(a.ID_ATIVIDADE));
      let linkRows: any[] = [];
      let marcMap = new Map<string, any>();

      if (actIds.length > 0) {
        const placeholders = actIds.map(() => '?').join(',');
        const [links]: any = await pool.query(
          `SELECT * FROM DESEMPENHO_ATIVIDADE_MARCADORES WHERE ID_ATIVIDADE IN (${placeholders}) ORDER BY ORDEM ASC`,
          actIds
        );
        linkRows = links || [];
        const marcIds = Array.from(new Set(linkRows.map((l: any) => String(l.ID_MARCADOR))));
        if (marcIds.length > 0) {
          const mp = marcIds.map(() => '?').join(',');
          const [mRows]: any = await pool.query(
            `SELECT * FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR IN (${mp})`,
            marcIds
          );
          for (const mr of mRows || []) {
            marcMap.set(String(mr.ID_MARCADOR), mapMarcadorRow(mr));
          }
        }
      }

      const atividades = (actRows || []).map((a: any) => {
        const id = String(a.ID_ATIVIDADE);
        const relatedLinks = linkRows.filter(l => String(l.ID_ATIVIDADE) === id);
        const marcadoresIds = relatedLinks.map(l => String(l.ID_MARCADOR));
        const marcadores = marcadoresIds.map(mid => marcMap.get(mid)).filter(Boolean);
        return {
          id,
          categoria: String(a.CATEGORIA) as 'FISICO' | 'TATICO',
          nome: String(a.NOME || ''),
          dataAtividade: String(a.DATA_ATIVIDADE || ''),
          horaAtividade: String(a.HORA_ATIVIDADE || '08:00'),
          descricao: String(a.DESCRICAO || ''),
          marcadoresIds,
          marcadores,
          departmentId: a.DEPARTAMENTO_ID ? String(a.DEPARTAMENTO_ID) : null,
          unitId: a.UNIDADE_ID ? String(a.UNIDADE_ID) : null,
          criadorId: String(a.CRIADOR_ID || ''),
          criadorNome: String(a.CRIADOR_NOME || ''),
          ativo: Boolean(Number(a.ATIVO ?? 1)),
          createdAt: a.DATA_CRIACAO ? new Date(a.DATA_CRIACAO).toISOString() : undefined,
          updatedAt: a.DATA_ATUALIZACAO ? new Date(a.DATA_ATUALIZACAO).toISOString() : undefined
        };
      });

      return res.json({ atividades });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao listar atividades.' });
    }
  });

  router.post('/desempenho/atividades', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.body?.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Apenas perfis Administrador e Armeiro podem criar atividades.' });
      }

      const categoria = String(req.body?.categoria || '').trim().toUpperCase();
      if (!VALID_CATEGORIAS.has(categoria)) {
        return res.status(400).json({ error: 'Categoria da atividade inválida (FISICO ou TATICO).' });
      }

      const nome = String(req.body?.nome || '').trim();
      if (!nome || nome.length > 200) {
        return res.status(400).json({ error: 'Informe o nome da atividade (máximo 200 caracteres).' });
      }

      const dataAtividade = String(req.body?.dataAtividade || '').trim();
      if (!isValidIsoDate(dataAtividade)) {
        return res.status(400).json({ error: 'Data da atividade inválida.' });
      }

      const horaAtividade = String(req.body?.horaAtividade || '08:00').trim();
      if (!isValidTimeHHMM(horaAtividade)) {
        return res.status(400).json({ error: 'Hora da atividade inválida (use HH:mm).' });
      }

      const descricao = String(req.body?.descricao || '').trim();
      if (!descricao) {
        return res.status(400).json({ error: 'Informe a descrição da atividade.' });
      }
      if (descricao.length > 500) {
        return res.status(400).json({ error: 'A descrição da atividade deve ter no máximo 500 caracteres.' });
      }

      const rawMarcadoresIds: string[] = Array.isArray(req.body?.marcadoresIds)
        ? Array.from(new Set(req.body.marcadoresIds.map((x: any) => String(x || '').trim()).filter(Boolean)))
        : [];
      if (rawMarcadoresIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um marcador para a atividade.' });
      }

      const mp = rawMarcadoresIds.map(() => '?').join(',');
      const [validMarcs]: any = await pool.query(
        `SELECT ID_MARCADOR, CATEGORIA FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR IN (${mp}) AND ATIVO = 1`,
        rawMarcadoresIds
      );
      if (!validMarcs || validMarcs.length !== rawMarcadoresIds.length) {
        return res.status(400).json({ error: 'Um ou mais marcadores selecionados são inválidos ou estão inativos.' });
      }
      const wrongCat = validMarcs.find((m: any) => String(m.CATEGORIA) !== categoria);
      if (wrongCat) {
        return res.status(400).json({ error: 'Todos os marcadores selecionados devem pertencer à mesma categoria da atividade.' });
      }

      const id = genId('ativ');
      const departmentId = actor.isGeral ? (req.body?.departmentId || actor.departmentId || null) : actor.departmentId;
      const unitId = actor.isGeral ? (req.body?.unitId || actor.unitId || null) : actor.unitId;

      await pool.query(
        `INSERT INTO DESEMPENHO_ATIVIDADES (
          ID_ATIVIDADE, CATEGORIA, NOME, DATA_ATIVIDADE, HORA_ATIVIDADE, DESCRICAO,
          DEPARTAMENTO_ID, UNIDADE_ID, CRIADOR_ID, CRIADOR_NOME, ATIVO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, categoria, nome, dataAtividade, horaAtividade, descricao, departmentId, unitId, actor.id, actor.name]
      );

      for (let i = 0; i < rawMarcadoresIds.length; i++) {
        await pool.query(
          `INSERT INTO DESEMPENHO_ATIVIDADE_MARCADORES (ID_ATIVIDADE, ID_MARCADOR, ORDEM) VALUES (?, ?, ?)`,
          [id, rawMarcadoresIds[i], i]
        );
      }

      await insertAuditLog(
        'Relatórios',
        'Criar Atividade de Desempenho',
        `Atividade ${categoria} "${nome}" (${dataAtividade} ${horaAtividade}) criada com ${rawMarcadoresIds.length} marcador(es) por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true, id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao criar atividade.' });
    }
  });

  router.delete('/desempenho/atividades/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.query.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Apenas perfis Administrador e Armeiro podem excluir atividades.' });
      }

      const id = String(req.params.id || '').trim();
      const [rows]: any = await pool.query(
        'SELECT * FROM DESEMPENHO_ATIVIDADES WHERE ID_ATIVIDADE = ? LIMIT 1',
        [id]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Atividade não encontrada.' });
      }
      const existing = rows[0];
      if (!actor.isGeral && existing.DEPARTAMENTO_ID && actor.departmentId && existing.DEPARTAMENTO_ID !== actor.departmentId) {
        return res.status(403).json({ error: 'Sem permissão para excluir atividades de outro departamento.' });
      }

      const [grpCnt]: any = await pool.query(
        'SELECT COUNT(*) AS cnt FROM DESEMPENHO_GRUPOS WHERE ID_ATIVIDADE = ?',
        [id]
      );
      const hasGroups = Number(grpCnt?.[0]?.cnt || 0) > 0;
      if (hasGroups) {
        await pool.query('UPDATE DESEMPENHO_ATIVIDADES SET ATIVO = 0 WHERE ID_ATIVIDADE = ?', [id]);
      } else {
        await pool.query('DELETE FROM DESEMPENHO_ATIVIDADE_MARCADORES WHERE ID_ATIVIDADE = ?', [id]);
        await pool.query('DELETE FROM DESEMPENHO_ATIVIDADES WHERE ID_ATIVIDADE = ?', [id]);
      }

      await insertAuditLog(
        'Relatórios',
        'Excluir Atividade de Desempenho',
        `Atividade "${existing.NOME}" ${hasGroups ? 'arquivada' : 'excluída'} por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao excluir atividade.' });
    }
  });

  // =========================================================================
  // 3. GRUPOS DE EXECUÇÃO (INDIVIDUAL / COLETIVO) & RESULTADOS
  // =========================================================================

  router.get('/desempenho/grupos', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.query.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Acesso restrito a perfis Administrador e Armeiro.' });
      }

      const accessibleUnitIds = await getAccessibleUnitIds(pool, actor);
      const clauses: string[] = [];
      const params: any[] = [];

      if (accessibleUnitIds !== null) {
        if (accessibleUnitIds.length === 0) {
          clauses.push('g.CRIADOR_ID = ?');
          params.push(actor.id);
        } else {
          const up = accessibleUnitIds.map(() => '?').join(',');
          clauses.push(
            `(g.CRIADOR_ID = ? OR g.UNIDADE_ID IN (${up}) OR EXISTS (SELECT 1 FROM DESEMPENHO_GRUPO_USUARIOS gu2 WHERE gu2.ID_GRUPO = g.ID_GRUPO AND gu2.USUARIO_UNIDADE_ID IN (${up})))`
          );
          params.push(actor.id, ...accessibleUnitIds, ...accessibleUnitIds);
        }
      }

      const statusFilter = req.query.status ? String(req.query.status).toUpperCase() : '';
      if (statusFilter === 'ABERTO' || statusFilter === 'ENCERRADO') {
        clauses.push('g.STATUS = ?');
        params.push(statusFilter);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const [grpRows]: any = await pool.query(
        `SELECT g.*, a.NOME AS ATIVIDADE_NOME, a.DESCRICAO AS ATIVIDADE_DESCRICAO
           FROM DESEMPENHO_GRUPOS g
           LEFT JOIN DESEMPENHO_ATIVIDADES a ON a.ID_ATIVIDADE = g.ID_ATIVIDADE
           ${whereSql}
          ORDER BY (g.STATUS = 'ABERTO') DESC, g.DATA_PREVISTA DESC, g.DATA_CRIACAO DESC`,
        params
      );

      const grpIds = (grpRows || []).map((g: any) => String(g.ID_GRUPO));
      const actIds = Array.from(new Set((grpRows || []).map((g: any) => String(g.ID_ATIVIDADE))));

      let partRows: any[] = [];
      let resRows: any[] = [];
      let actMarcLinks: any[] = [];
      const marcMap = new Map<string, any>();

      if (grpIds.length > 0) {
        const gp = grpIds.map(() => '?').join(',');
        const [pRows]: any = await pool.query(
          `SELECT * FROM DESEMPENHO_GRUPO_USUARIOS WHERE ID_GRUPO IN (${gp}) ORDER BY USUARIO_NOME ASC`,
          grpIds
        );
        partRows = pRows || [];

        const [rRows]: any = await pool.query(
          `SELECT * FROM DESEMPENHO_RESULTADOS WHERE ID_GRUPO IN (${gp}) ORDER BY USUARIO_NOME ASC, MARCADOR_NOME ASC`,
          grpIds
        );
        resRows = rRows || [];
      }

      if (actIds.length > 0) {
        const ap = actIds.map(() => '?').join(',');
        const [lRows]: any = await pool.query(
          `SELECT * FROM DESEMPENHO_ATIVIDADE_MARCADORES WHERE ID_ATIVIDADE IN (${ap}) ORDER BY ORDEM ASC`,
          actIds
        );
        actMarcLinks = lRows || [];

        const marcIds = Array.from(new Set(actMarcLinks.map((l: any) => String(l.ID_MARCADOR))));
        if (marcIds.length > 0) {
          const mp = marcIds.map(() => '?').join(',');
          const [mRows]: any = await pool.query(
            `SELECT * FROM DESEMPENHO_MARCADORES WHERE ID_MARCADOR IN (${mp})`,
            marcIds
          );
          for (const mr of mRows || []) {
            marcMap.set(String(mr.ID_MARCADOR), mapMarcadorRow(mr));
          }
        }
      }

      const grupos = (grpRows || []).map((g: any) => {
        const gid = String(g.ID_GRUPO);
        const aid = String(g.ID_ATIVIDADE);
        const participantes = partRows
          .filter(p => String(p.ID_GRUPO) === gid)
          .map(p => ({
            usuarioId: String(p.USUARIO_ID),
            usuarioNome: String(p.USUARIO_NOME || ''),
            usuarioMasp: p.USUARIO_MASP ? String(p.USUARIO_MASP) : undefined,
            usuarioCargo: p.USUARIO_CARGO ? String(p.USUARIO_CARGO) : undefined,
            usuarioUnitId: p.USUARIO_UNIDADE_ID ? String(p.USUARIO_UNIDADE_ID) : null,
            usuarioUnitName: p.USUARIO_UNIDADE_NOME ? String(p.USUARIO_UNIDADE_NOME) : null
          }));
        const marcadores = actMarcLinks
          .filter(l => String(l.ID_ATIVIDADE) === aid)
          .map(l => marcMap.get(String(l.ID_MARCADOR)))
          .filter(Boolean);
        const resultados = resRows.filter(r => String(r.ID_GRUPO) === gid).map(mapResultadoRow);

        return {
          id: gid,
          atividadeId: aid,
          atividadeNome: String(g.ATIVIDADE_NOME || g.NOME_GRUPO || ''),
          atividadeDescricao: g.ATIVIDADE_DESCRICAO ? String(g.ATIVIDADE_DESCRICAO) : undefined,
          nomeGrupo: String(g.NOME_GRUPO || ''),
          categoria: String(g.CATEGORIA) as 'FISICO' | 'TATICO',
          modoLancamento: String(g.MODO_LANCAMENTO || 'COLETIVO') as 'INDIVIDUAL' | 'COLETIVO',
          dataPrevista: String(g.DATA_PREVISTA || ''),
          horaPrevista: String(g.HORA_PREVISTA || '08:00'),
          status: String(g.STATUS || 'ABERTO') as 'ABERTO' | 'ENCERRADO',
          encerradoEm: g.ENCERRADO_EM ? new Date(g.ENCERRADO_EM).toISOString() : null,
          encerradoPorId: g.ENCERRADO_POR_ID ? String(g.ENCERRADO_POR_ID) : null,
          encerradoPorNome: g.ENCERRADO_POR_NOME ? String(g.ENCERRADO_POR_NOME) : null,
          departmentId: g.DEPARTAMENTO_ID ? String(g.DEPARTAMENTO_ID) : null,
          unitId: g.UNIDADE_ID ? String(g.UNIDADE_ID) : null,
          criadorId: String(g.CRIADOR_ID || ''),
          criadorNome: String(g.CRIADOR_NOME || ''),
          participantes,
          marcadores,
          resultados,
          createdAt: g.DATA_CRIACAO ? new Date(g.DATA_CRIACAO).toISOString() : undefined,
          updatedAt: g.DATA_ATUALIZACAO ? new Date(g.DATA_ATUALIZACAO).toISOString() : undefined
        };
      });

      return res.json({ grupos });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao listar grupos de desempenho.' });
    }
  });

  router.post('/desempenho/grupos', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.body?.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Apenas perfis Administrador e Armeiro podem criar grupos de avaliação.' });
      }

      const atividadeId = String(req.body?.atividadeId || '').trim();
      const [actRows]: any = await pool.query(
        'SELECT * FROM DESEMPENHO_ATIVIDADES WHERE ID_ATIVIDADE = ? LIMIT 1',
        [atividadeId]
      );
      if (!actRows || actRows.length === 0) {
        return res.status(404).json({ error: 'Atividade selecionada não encontrada.' });
      }
      const act = actRows[0];

      const rawPartIds: string[] = Array.isArray(req.body?.participantesIds)
        ? Array.from(new Set(req.body.participantesIds.map((x: any) => String(x || '').trim()).filter(Boolean)))
        : [];
      if (rawPartIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um policial participante.' });
      }

      const modoRaw = String(req.body?.modoLancamento || '').trim().toUpperCase();
      const modoLancamento = VALID_MODOS.has(modoRaw)
        ? modoRaw
        : rawPartIds.length === 1
        ? 'INDIVIDUAL'
        : 'COLETIVO';

      const dataPrevista = String(req.body?.dataPrevista || act.DATA_ATIVIDADE || '').trim();
      if (!isValidIsoDate(dataPrevista)) {
        return res.status(400).json({ error: 'Data prevista inválida.' });
      }
      const horaPrevista = String(req.body?.horaPrevista || act.HORA_ATIVIDADE || '08:00').trim();
      if (!isValidTimeHHMM(horaPrevista)) {
        return res.status(400).json({ error: 'Hora prevista inválida.' });
      }

      const up = rawPartIds.map(() => '?').join(',');
      const [userRows]: any = await pool.query(
        `SELECT u.ID_USUARIOS, u.NOME_USUARIOS, u.MASP_USUARIOS, u.CARGO_USUARIOS,
                u.UNIDADE_ID_USUARIOS, u.DEPARTAMENTO_ID_USUARIOS, un.NOME_UNIDADES
           FROM USUARIOS u
           LEFT JOIN UNIDADES un ON un.ID_UNIDADES = u.UNIDADE_ID_USUARIOS
          WHERE u.ID_USUARIOS IN (${up})`,
        rawPartIds
      );
      if (!userRows || userRows.length === 0) {
        return res.status(400).json({ error: 'Nenhum usuário válido encontrado para o grupo.' });
      }

      const accessibleUnitIds = await getAccessibleUnitIds(pool, actor);
      if (accessibleUnitIds !== null) {
        const unauthorized = userRows.find(
          (u: any) =>
            u.UNIDADE_ID_USUARIOS &&
            !accessibleUnitIds.includes(String(u.UNIDADE_ID_USUARIOS)) &&
            String(u.DEPARTAMENTO_ID_USUARIOS || '') !== String(actor.departmentId || '')
        );
        if (unauthorized) {
          return res.status(403).json({
            error: `O usuário "${unauthorized.NOME_USUARIOS}" pertence a uma unidade fora do seu escopo de acesso.`
          });
        }
      }

      const nomeGrupo =
        String(req.body?.nomeGrupo || '').trim().slice(0, 220) ||
        `${act.NOME} — ${modoLancamento === 'INDIVIDUAL' ? userRows[0].NOME_USUARIOS : `Grupo (${userRows.length} policiais)`}`;

      const grupoId = genId('grp');

      await pool.query(
        `INSERT INTO DESEMPENHO_GRUPOS (
          ID_GRUPO, ID_ATIVIDADE, NOME_GRUPO, CATEGORIA, MODO_LANCAMENTO,
          DATA_PREVISTA, HORA_PREVISTA, STATUS,
          DEPARTAMENTO_ID, UNIDADE_ID, CRIADOR_ID, CRIADOR_NOME
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ABERTO', ?, ?, ?, ?)`,
        [
          grupoId,
          atividadeId,
          nomeGrupo,
          act.CATEGORIA,
          modoLancamento,
          dataPrevista,
          horaPrevista,
          actor.departmentId || act.DEPARTAMENTO_ID || null,
          actor.unitId || act.UNIDADE_ID || null,
          actor.id,
          actor.name
        ]
      );

      for (const u of userRows) {
        await pool.query(
          `INSERT INTO DESEMPENHO_GRUPO_USUARIOS (
            ID_GRUPO, USUARIO_ID, USUARIO_NOME, USUARIO_MASP, USUARIO_CARGO,
            USUARIO_UNIDADE_ID, USUARIO_UNIDADE_NOME
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            grupoId,
            String(u.ID_USUARIOS),
            String(u.NOME_USUARIOS || ''),
            u.MASP_USUARIOS ? String(u.MASP_USUARIOS) : null,
            u.CARGO_USUARIOS ? String(u.CARGO_USUARIOS) : null,
            u.UNIDADE_ID_USUARIOS ? String(u.UNIDADE_ID_USUARIOS) : null,
            u.NOME_UNIDADES ? String(u.NOME_UNIDADES) : null
          ]
        );
      }

      await insertAuditLog(
        'Relatórios',
        'Criar Grupo de Desempenho',
        `Grupo "${nomeGrupo}" (${modoLancamento}) criado com ${userRows.length} participante(s) por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true, id: grupoId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao criar grupo de avaliação.' });
    }
  });

  router.put('/desempenho/grupos/:id/resultados', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.body?.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Apenas perfis Administrador e Armeiro podem lançar resultados.' });
      }

      const grupoId = String(req.params.id || '').trim();
      const [grpRows]: any = await pool.query('SELECT * FROM DESEMPENHO_GRUPOS WHERE ID_GRUPO = ? LIMIT 1', [grupoId]);
      if (!grpRows || grpRows.length === 0) {
        return res.status(404).json({ error: 'Grupo não encontrado.' });
      }
      const grp = grpRows[0];
      if (String(grp.STATUS) === 'ENCERRADO') {
        return res.status(400).json({ error: 'Este grupo já foi encerrado e arquivado; resultados não podem mais ser alterados.' });
      }

      const items = Array.isArray(req.body?.resultados) ? req.body.resultados : [];
      if (items.length === 0) {
        return res.status(400).json({ error: 'Nenhum resultado informado para salvamento.' });
      }

      const [partRows]: any = await pool.query(
        'SELECT * FROM DESEMPENHO_GRUPO_USUARIOS WHERE ID_GRUPO = ?',
        [grupoId]
      );
      const partMap = new Map<string, any>();
      for (const p of partRows || []) {
        partMap.set(String(p.USUARIO_ID), p);
      }

      const [marcRows]: any = await pool.query(
        `SELECT m.*
           FROM DESEMPENHO_ATIVIDADE_MARCADORES am
           JOIN DESEMPENHO_MARCADORES m ON m.ID_MARCADOR = am.ID_MARCADOR
          WHERE am.ID_ATIVIDADE = ?`,
        [grp.ID_ATIVIDADE]
      );
      const marcMap = new Map<string, any>();
      for (const m of marcRows || []) {
        marcMap.set(String(m.ID_MARCADOR), m);
      }

      let savedCount = 0;

      for (const item of items) {
        const usuarioId = String(item?.usuarioId || '').trim();
        const marcadorId = String(item?.marcadorId || '').trim();
        const participant = partMap.get(usuarioId);
        const marker = marcMap.get(marcadorId);
        if (!participant || !marker) continue;

        const isAusente = Boolean(item?.ausente);
        const notaMinRef = Number(marker.NOTA_MIN ?? 0);
        const notaMaxRef = Number(marker.NOTA_MAX ?? 10);
        const notaAprovRef = Number(marker.NOTA_APROVACAO ?? 6);
        const usaTempo = Boolean(Number(marker.USA_TEMPO ?? 1));
        const tempoMinRef = marker.TEMPO_MIN_SEG != null ? Number(marker.TEMPO_MIN_SEG) : null;
        const tempoMaxRef = marker.TEMPO_MAX_SEG != null ? Number(marker.TEMPO_MAX_SEG) : null;
        const tempoAprovRef = marker.TEMPO_APROVACAO_SEG != null ? Number(marker.TEMPO_APROVACAO_SEG) : null;
        const tempoAprovModoRef = normalizeTempoAprovacaoModo(marker.TEMPO_APROVACAO_MODO);
        const usaDistribuicaoNota = Boolean(Number(marker.USA_DISTRIBUICAO_NOTA ?? 0));
        const fatorDistribuicao = normalizeFatorDistribuicao(marker.FATOR_DISTRIBUICAO);
        const regrasDistribuicao = parseRegrasDistribuicao(marker.REGRAS_DISTRIBUICAO);
        const teveTiro = Boolean(Number(marker.TEVE_TIRO ?? 0));
        const observacoes = item?.observacoes ? String(item.observacoes).trim().slice(0, 500) : null;

        const scoringMarker = {
          usaTempo,
          tempoMinSegundos: tempoMinRef,
          tempoMaxSegundos: tempoMaxRef,
          tempoAprovacaoSegundos: tempoAprovRef,
          tempoAprovacaoModo: tempoAprovModoRef,
          notaMinima: notaMinRef,
          notaMaxima: notaMaxRef,
          notaAprovacao: notaAprovRef,
          usaDistribuicaoNota,
          fatorDistribuicao,
          regrasDistribuicao
        };

        let clampedNota = 0;
        let valorMarca: number | null = null;
        let tempoSegundos: number | null = null;
        let tirosEfetuados: number | null = null;
        let aprovado = 0;
        let ausenciaInformadaDb: number | null = null;

        if (isAusente) {
          if (typeof item?.ausenciaInformada !== 'boolean') {
            return res.status(400).json({
              error: `Informe se a ausência de "${participant.USUARIO_NOME}" foi informada previamente ou não.`
            });
          }
          ausenciaInformadaDb = item.ausenciaInformada ? 1 : 0;
          clampedNota = 0;
          valorMarca = null;
          tempoSegundos = null;
          tirosEfetuados = null;
          aprovado = 0;
        } else {
          valorMarca = toOptionalFloat(item?.valorMarca);
          tempoSegundos = usaTempo ? toOptionalInt(item?.tempoSegundos) : null;
          tirosEfetuados = teveTiro ? toOptionalInt(item?.tirosEfetuados ?? marker.QUANTIDADE_TIROS) : null;

          if (usaDistribuicaoNota && fatorDistribuicao && regrasDistribuicao.length > 0) {
            const dist = calculateDistributedScore(scoringMarker, valorMarca, tempoSegundos);
            if (dist.hasInput && dist.nota !== null) {
              clampedNota = dist.nota;
            } else {
              const fallbackNota = toOptionalFloat(item?.notaObtida);
              if (fallbackNota === null) continue;
              clampedNota = Math.max(notaMinRef, Math.min(notaMaxRef, fallbackNota));
            }
          } else {
            const notaObtida = toOptionalFloat(item?.notaObtida);
            if (notaObtida === null) continue;
            clampedNota = Math.max(notaMinRef, Math.min(notaMaxRef, notaObtida));
          }

          aprovado = evaluateDesempenhoApproval(scoringMarker, clampedNota, tempoSegundos) ? 1 : 0;
        }

        const resId = genId('res');
        await pool.query(
          `INSERT INTO DESEMPENHO_RESULTADOS (
            ID_RESULTADO, ID_GRUPO, ID_ATIVIDADE, ID_MARCADOR,
            USUARIO_ID, USUARIO_NOME, USUARIO_MASP, USUARIO_UNIDADE_ID, USUARIO_UNIDADE_NOME,
            CATEGORIA, MARCADOR_NOME, TIPO_MARCA, UNIDADE_MEDIDA,
            DATA_AVALIACAO, HORA_AVALIACAO,
            VALOR_MARCA, TEMPO_SEGUNDOS, NOTA_OBTIDA,
            NOTA_MIN_REF, NOTA_MAX_REF, NOTA_APROVACAO_REF, TEMPO_APROVACAO_REF, TEMPO_APROVACAO_MODO_REF,
            APROVADO, AUSENTE, AUSENCIA_INFORMADA, TEVE_TIRO, TIPO_ARMA, TIROS_EFETUADOS, OBSERVACOES,
            LANCADO_POR_ID, LANCADO_POR_NOME
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            VALOR_MARCA = VALUES(VALOR_MARCA),
            TEMPO_SEGUNDOS = VALUES(TEMPO_SEGUNDOS),
            NOTA_OBTIDA = VALUES(NOTA_OBTIDA),
            TEMPO_APROVACAO_MODO_REF = VALUES(TEMPO_APROVACAO_MODO_REF),
            APROVADO = VALUES(APROVADO),
            AUSENTE = VALUES(AUSENTE),
            AUSENCIA_INFORMADA = VALUES(AUSENCIA_INFORMADA),
            TIROS_EFETUADOS = VALUES(TIROS_EFETUADOS),
            OBSERVACOES = VALUES(OBSERVACOES),
            LANCADO_POR_ID = VALUES(LANCADO_POR_ID),
            LANCADO_POR_NOME = VALUES(LANCADO_POR_NOME),
            DATA_ATUALIZACAO = NOW()`,
          [
            resId,
            grupoId,
            String(grp.ID_ATIVIDADE),
            marcadorId,
            usuarioId,
            String(participant.USUARIO_NOME || ''),
            participant.USUARIO_MASP ? String(participant.USUARIO_MASP) : null,
            participant.USUARIO_UNIDADE_ID ? String(participant.USUARIO_UNIDADE_ID) : null,
            participant.USUARIO_UNIDADE_NOME ? String(participant.USUARIO_UNIDADE_NOME) : null,
            String(marker.CATEGORIA),
            String(marker.NOME || ''),
            marker.TIPO_MARCA ? String(marker.TIPO_MARCA) : null,
            marker.UNIDADE_MEDIDA ? String(marker.UNIDADE_MEDIDA) : null,
            String(grp.DATA_PREVISTA),
            String(grp.HORA_PREVISTA || '08:00'),
            valorMarca,
            tempoSegundos,
            clampedNota,
            notaMinRef,
            notaMaxRef,
            notaAprovRef,
            tempoAprovRef,
            usaTempo && tempoAprovRef !== null ? tempoAprovModoRef : null,
            aprovado,
            isAusente ? 1 : 0,
            ausenciaInformadaDb,
            teveTiro ? 1 : 0,
            marker.TIPO_ARMA ? String(marker.TIPO_ARMA) : null,
            tirosEfetuados,
            observacoes,
            actor.id,
            actor.name
          ]
        );
        savedCount++;
      }

      await insertAuditLog(
        'Relatórios',
        'Lançar Resultados de Desempenho',
        `Lançados ${savedCount} resultado(s) no grupo "${grp.NOME_GRUPO}" por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true, savedCount });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao salvar resultados do grupo.' });
    }
  });

  router.put('/desempenho/grupos/:id/encerrar', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.body?.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Apenas perfis Administrador e Armeiro podem encerrar grupos.' });
      }

      const grupoId = String(req.params.id || '').trim();
      const [grpRows]: any = await pool.query('SELECT * FROM DESEMPENHO_GRUPOS WHERE ID_GRUPO = ? LIMIT 1', [grupoId]);
      if (!grpRows || grpRows.length === 0) {
        return res.status(404).json({ error: 'Grupo não encontrado.' });
      }
      const grp = grpRows[0];
      if (String(grp.STATUS) === 'ENCERRADO') {
        return res.json({ success: true, alreadyClosed: true });
      }

      const [resCntRows]: any = await pool.query(
        'SELECT COUNT(*) AS cnt FROM DESEMPENHO_RESULTADOS WHERE ID_GRUPO = ?',
        [grupoId]
      );
      if (Number(resCntRows?.[0]?.cnt || 0) === 0) {
        return res.status(400).json({
          error: 'Lance e salve ao menos um resultado individual antes de encerrar e arquivar o grupo.'
        });
      }

      await pool.query(
        `UPDATE DESEMPENHO_GRUPOS
            SET STATUS = 'ENCERRADO', ENCERRADO_EM = NOW(), ENCERRADO_POR_ID = ?, ENCERRADO_POR_NOME = ?
          WHERE ID_GRUPO = ?`,
        [actor.id, actor.name, grupoId]
      );

      await insertAuditLog(
        'Relatórios',
        'Encerrar e Arquivar Grupo de Desempenho',
        `Grupo "${grp.NOME_GRUPO}" encerrado e arquivado por ${actor.name} (resultados preservados no histórico individual)`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao encerrar grupo.' });
    }
  });

  router.delete('/desempenho/grupos/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.body?.actor?.id || req.query.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }
      if (!actor.canAccessUnitPerformance) {
        return res.status(403).json({ error: 'Apenas perfis Administrador e Armeiro podem excluir grupos.' });
      }

      const grupoId = String(req.params.id || '').trim();
      const [grpRows]: any = await pool.query('SELECT * FROM DESEMPENHO_GRUPOS WHERE ID_GRUPO = ? LIMIT 1', [grupoId]);
      if (!grpRows || grpRows.length === 0) {
        return res.status(404).json({ error: 'Grupo não encontrado.' });
      }
      const grp = grpRows[0];
      if (String(grp.STATUS) === 'ENCERRADO' && !actor.isGeral) {
        return res.status(400).json({
          error: 'Grupos encerrados e arquivados não podem ser excluídos para preservar o histórico anual dos policiais.'
        });
      }

      await pool.query('DELETE FROM DESEMPENHO_RESULTADOS WHERE ID_GRUPO = ?', [grupoId]);
      await pool.query('DELETE FROM DESEMPENHO_GRUPO_USUARIOS WHERE ID_GRUPO = ?', [grupoId]);
      await pool.query('DELETE FROM DESEMPENHO_GRUPOS WHERE ID_GRUPO = ?', [grupoId]);

      await insertAuditLog(
        'Relatórios',
        'Excluir Grupo de Desempenho',
        `Grupo "${grp.NOME_GRUPO}" excluído por ${actor.name}`,
        { id: actor.id, name: actor.name, masp: actor.masp, role: actor.primaryRole },
        req.ip
      );

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao excluir grupo.' });
    }
  });

  // =========================================================================
  // 4. RESULTADOS HISTÓRICOS (ALIMENTA GRÁFICOS & CURVA DE EVOLUÇÃO ANUAL)
  // =========================================================================

  router.get('/desempenho/resultados', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      await ensureDesempenhoSchema(pool);

      const actor = await resolveActorFromDb(pool, req.query.actorId);
      if (!actor) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      const requestedUserId = req.query.usuarioId ? String(req.query.usuarioId).trim() : '';
      const categoria = req.query.categoria ? String(req.query.categoria).toUpperCase() : '';
      const marcadorId = req.query.marcadorId ? String(req.query.marcadorId).trim() : '';
      const ano = req.query.ano ? String(req.query.ano).trim() : '';
      const unitId = req.query.unitId ? String(req.query.unitId).trim() : '';

      const clauses: string[] = [];
      const params: any[] = [];

      if (!actor.canAccessUnitPerformance) {
        // Policial comum só pode consultar os próprios índices
        clauses.push('r.USUARIO_ID = ?');
        params.push(actor.id);
      } else {
        const accessibleUnitIds = await getAccessibleUnitIds(pool, actor);
        if (requestedUserId) {
          if (requestedUserId !== actor.id && accessibleUnitIds !== null) {
            const [targetRows]: any = await pool.query(
              'SELECT UNIDADE_ID_USUARIOS, DEPARTAMENTO_ID_USUARIOS FROM USUARIOS WHERE ID_USUARIOS = ? LIMIT 1',
              [requestedUserId]
            );
            const target = targetRows?.[0];
            if (
              target &&
              target.UNIDADE_ID_USUARIOS &&
              !accessibleUnitIds.includes(String(target.UNIDADE_ID_USUARIOS)) &&
              String(target.DEPARTAMENTO_ID_USUARIOS || '') !== String(actor.departmentId || '')
            ) {
              return res.status(403).json({ error: 'Usuário fora do seu escopo de visualização.' });
            }
          }
          clauses.push('r.USUARIO_ID = ?');
          params.push(requestedUserId);
        } else if (accessibleUnitIds !== null) {
          if (accessibleUnitIds.length > 0) {
            const up = accessibleUnitIds.map(() => '?').join(',');
            clauses.push(`(r.USUARIO_ID = ? OR r.USUARIO_UNIDADE_ID IN (${up}))`);
            params.push(actor.id, ...accessibleUnitIds);
          } else {
            clauses.push('r.USUARIO_ID = ?');
            params.push(actor.id);
          }
        }
      }

      if (categoria && VALID_CATEGORIAS.has(categoria)) {
        clauses.push('r.CATEGORIA = ?');
        params.push(categoria);
      }
      if (marcadorId) {
        clauses.push('r.ID_MARCADOR = ?');
        params.push(marcadorId);
      }
      if (ano && /^\d{4}$/.test(ano)) {
        clauses.push('r.DATA_AVALIACAO LIKE ?');
        params.push(`${ano}-%`);
      }
      if (unitId) {
        clauses.push('r.USUARIO_UNIDADE_ID = ?');
        params.push(unitId);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const [rows]: any = await pool.query(
        `SELECT r.*, g.NOME_GRUPO, g.STATUS AS GRUPO_STATUS, a.NOME AS ATIVIDADE_NOME
           FROM DESEMPENHO_RESULTADOS r
           LEFT JOIN DESEMPENHO_GRUPOS g ON g.ID_GRUPO = r.ID_GRUPO
           LEFT JOIN DESEMPENHO_ATIVIDADES a ON a.ID_ATIVIDADE = r.ID_ATIVIDADE
           ${whereSql}
          ORDER BY r.DATA_AVALIACAO ASC, r.DATA_CRIACAO ASC`,
        params
      );

      return res.json({ resultados: (rows || []).map(mapResultadoRow) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao consultar resultados de desempenho.' });
    }
  });
}
