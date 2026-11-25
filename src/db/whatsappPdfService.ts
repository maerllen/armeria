import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';

export type OperacaoOrigem = 'CANIL' | 'POLICIAL' | 'CAT';
export type TreinamentoOrigem = 'CANIL' | 'POLICIAL';
export type ArmariaCategoria = 'ARMAS' | 'MUNICOES' | 'EXPLOSIVOS' | 'MATERIAIS';
export type ReciboTipo = ArmariaCategoria;
export type ArmariaPeriodo = '24H' | 'SEMANA' | 'MES_ATUAL' | 'ANO_ATUAL';
export type RelatorioPeriodoTipo = '24H' | 'SEMANA' | 'MES_ATUAL' | 'ANO_ATUAL' | 'MES_ANO' | 'ANO';
export type DesempenhoCategoria = 'FISICO' | 'TATICO';

export interface UnifiedOperationReport {
  origem: OperacaoOrigem;
  origemLabel: string;
  id: string;
  dataOperacao: string; // YYYY-MM-DD
  horaOperacao: string; // HH:MM
  estado: string;
  municipio: string;
  unidadeId: string;
  unidadeNome: string;
  criadorNome: string;
  criadorMasp: string;
  criadorCargo: string;
  dataCriacao: string;
  tipoAtendimento?: string;
  solicitacao?: string;
  apoioDepartamentos: string[];
  operadores: string[];
  viaturas: string[];
  aeronaves: string[];
  materiaisEncontrados: string[];
  resumoTexto: string;
  detalhesExtras: Array<{ label: string; value: string }>;
}

export interface UnifiedTrainingReport {
  origem: TreinamentoOrigem;
  origemLabel: string;
  id: string;
  dataTreinamento: string; // YYYY-MM-DD
  horaTreinamento: string; // HH:MM
  unidadeId: string;
  unidadeNome: string;
  responsavelNome: string;
  responsavelMasp: string;
  responsavelCargo: string;
  modalidadeLocal: string;
  modalidadeParticipacao: string;
  titulo: string;
  participantes: string[];
  animaisK9: string[];
  topicosK9: string[];
  disparoRealResumo?: string;
  descricao: string;
  dataCriacao: string;
}

export interface UnifiedArmariaReceipt {
  tipo: ReciboTipo;
  tipoLabel: string;
  id: string;
  protocolo: string;
  unidadeId: string;
  unidadeNome: string;
  requerenteId: string;
  requerenteNome: string;
  requerenteMasp: string;
  requerenteCargo: string;
  itemTitulo: string;
  itemSubtitulo: string;
  quantidade: string;
  status: string;
  dataSolicitacao: string;
  dataAutorizacao: string;
  dataDevolucao: string;
  armeiroAutorizador: string;
  armeiroRecebimento: string;
  finalidade: string;
  observacoes: string;
  extras: Array<{ label: string; value: string }>;
}

export interface ArmariaCautelasReportData {
  armas: UnifiedArmariaReceipt[];
  municoes: UnifiedArmariaReceipt[];
  materiais: UnifiedArmariaReceipt[];
}

export interface AvailableDateOption {
  value: string; // YYYY-MM-DD | YYYY-MM | YYYY
  label: string; // DD/MM/YYYY | MM/YYYY | YYYY
  count: number;
}

const MONTH_NAMES_PT: Record<string, string> = {
  '01': 'Janeiro',
  '02': 'Fevereiro',
  '03': 'Março',
  '04': 'Abril',
  '05': 'Maio',
  '06': 'Junho',
  '07': 'Julho',
  '08': 'Agosto',
  '09': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro'
};

export function formatIsoDateBr(iso?: string | null): string {
  const s = String(iso || '').trim().slice(0, 10);
  const parts = s.split('-');
  if (parts.length !== 3) return s || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatIsoDateTimeBr(iso?: string | Date | null): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
  const s = String(iso).replace('T', ' ').slice(0, 16);
  const [datePart, timePart] = s.split(' ');
  return `${formatIsoDateBr(datePart)}${timePart ? ` ${timePart}` : ''}`;
}

function safeJsonArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractNames(arr: any[]): string[] {
  return arr
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const nome = item.nome || item.name || item.operadorNome || item.label || item.sigla || item.descricao || '';
      const masp = item.masp || item.operadorMasp || '';
      const extra = item.cachorroNome || item.animalNome || item.placa || item.prefixo || '';
      const parts = [nome, masp ? `MASP ${masp}` : '', extra ? `(${extra})` : ''].filter(Boolean);
      return parts.join(' - ').trim();
    })
    .filter(Boolean);
}

function extractVehicles(arr: any[]): string[] {
  return arr
    .map(v => {
      if (typeof v === 'string') return v.trim();
      if (!v || typeof v !== 'object') return '';
      const placa = v.placa || v.placaViatura || '';
      const desc = v.descricao || v.modelo || v.nome || '';
      return [placa, desc].filter(Boolean).join(' - ').trim();
    })
    .filter(Boolean);
}

function extractMaterials(arr: any[]): string[] {
  return arr
    .map(m => {
      if (typeof m === 'string') return m.trim();
      if (!m || typeof m !== 'object') return '';
      const tipo = m.tipo || m.categoria || m.nome || m.descricao || '';
      const qtd = m.quantidade !== undefined && m.quantidade !== null ? `Qtd: ${m.quantidade}` : '';
      const obs = m.observacao || m.detalhes || '';
      return [tipo, qtd, obs].filter(Boolean).join(' | ').trim();
    })
    .filter(Boolean);
}

function extractTopicosK9(raw: any): string[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed
        .map((t: any) => {
          if (typeof t === 'string') return t;
          if (t && typeof t === 'object') {
            return String(t.topico || t.nome || t.label || '');
          }
          return '';
        })
        .filter(Boolean);
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.topicos)) {
        return parsed.topicos.map(String).filter(Boolean);
      }
      if (Array.isArray(parsed.items)) {
        return parsed.items.map((it: any) => String(it?.topico || it?.nome || it || '')).filter(Boolean);
      }
    }
  } catch {}
  return [];
}

function sanitizePdfText(input?: string | null): string {
  const raw = String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');

  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += raw[i];
    } else {
      out += ' ';
    }
  }
  return out;
}

function buildUnitInClause(columnName: string, unitIds?: string[]): { sql: string; params: any[] } {
  if (!unitIds || unitIds.length === 0) return { sql: '', params: [] };
  const clean = unitIds.map(u => String(u || '').trim()).filter(Boolean);
  if (clean.length === 0) return { sql: '', params: [] };
  const placeholders = clean.map(() => '?').join(', ');
  return { sql: ` AND ${columnName} IN (${placeholders})`, params: clean };
}

async function safeQuery(pool: any, sql: string, params: any[] = []): Promise<any[]> {
  try {
    const [rows]: any = await pool.query(sql, params);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// ============================================================================
// 1. OPERAÇÕES (COC / POLICIAL / CAT)
// ============================================================================
function mapCanilOpRow(r: any): UnifiedOperationReport {
  const apoioArr = safeJsonArray(r.DEPARTAMENTOS_APOIO_JSON);
  const materiaisArr = safeJsonArray(r.MATERIAIS_ENCONTRADOS_JSON);
  const opsArr = safeJsonArray(r.OPERADORES_JSON);
  const viatArr = safeJsonArray(r.VIATURAS_JSON);

  const solicitacao =
    r.SOLICITACAO_TIPO === 'Outros' && r.SOLICITACAO_OUTROS_DETALHES
      ? `Outros (${r.SOLICITACAO_OUTROS_DETALHES})`
      : String(r.SOLICITACAO_TIPO || 'CEPOLC');

  return {
    origem: 'CANIL',
    origemLabel: 'COC / Canil',
    id: String(r.ID_REL_OPERACAO),
    dataOperacao: String(r.DATA_OPERACAO || '').slice(0, 10),
    horaOperacao: String(r.HORA_OPERACAO || '00:00').slice(0, 5),
    estado: String(r.ESTADO_OPERACAO || 'MG'),
    municipio: String(r.COMARCA || 'Não informado'),
    unidadeId: String(r.UNIDADE_ID || ''),
    unidadeNome: String(r.UNIDADE_NOME_JOIN || 'COC - Coordenação de Operações com Cães'),
    criadorNome: String(r.CRIADOR_NOME || 'Não informado'),
    criadorMasp: String(r.CRIADOR_MASP || ''),
    criadorCargo: String(r.CRIADOR_CARGO || ''),
    dataCriacao: r.DATA_CRIACAO ? String(r.DATA_CRIACAO) : '',
    solicitacao,
    apoioDepartamentos: Number(r.APOIO_OUTRO_DEPARTAMENTO) ? extractNames(apoioArr) : [],
    operadores: extractNames(opsArr),
    viaturas: extractVehicles(viatArr),
    aeronaves: [],
    materiaisEncontrados: Number(r.MATERIAL_ENCONTRADO) ? extractMaterials(materiaisArr) : [],
    resumoTexto: String(r.DETALHAMENTO || 'Sem detalhamento registrado.'),
    detalhesExtras: [
      { label: 'Solicitação', value: solicitacao },
      { label: 'Material Encontrado', value: Number(r.MATERIAL_ENCONTRADO) ? 'Sim' : 'Não' }
    ]
  };
}

function mapPolicialOpRow(r: any): UnifiedOperationReport {
  const apoioArr = safeJsonArray(r.DEPARTAMENTOS_APOIO_JSON);
  const opsArr = safeJsonArray(r.OPERADORES_JSON);
  const viatArr = safeJsonArray(r.VIATURAS_JSON);
  const outrosMun = safeJsonArray(r.OUTROS_MUNICIPIOS_JSON).map(String).filter(Boolean);

  const acionamento =
    r.ACIONAMENTO_VIA === 'OUTROS' && r.ACIONAMENTO_OUTROS_DESC
      ? `Outros (${r.ACIONAMENTO_OUTROS_DESC})`
      : String(r.ACIONAMENTO_VIA || 'CEPOLC');

  const extras: Array<{ label: string; value: string }> = [
    { label: 'Tipo de Atendimento', value: String(r.TIPO_ATENDIMENTO || 'Operação prevista') },
    { label: 'Acionamento Via', value: acionamento },
    { label: 'Saída da Base', value: String(r.HORA_SAIDA_BASE || '—') }
  ];
  if (outrosMun.length > 0) extras.push({ label: 'Outros Municípios', value: outrosMun.join(', ') });
  if (Number(r.UTILIZOU_ARMA)) {
    extras.push({
      label: 'Emprego de Armamento',
      value:
        [
          Number(r.UTILIZOU_ARMA_FOGO) ? 'Arma de fogo' : '',
          Number(r.UTILIZOU_ARMA_ELETRICA) ? 'Arma elétrica' : ''
        ]
          .filter(Boolean)
          .join(' e ') || 'Sim'
    });
  }
  if (Number(r.HOUVE_OBITO)) extras.push({ label: 'Óbitos Registrados', value: String(r.QUANTIDADE_OBITOS || 1) });

  return {
    origem: 'POLICIAL',
    origemLabel: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'Unidade Policial'),
    id: String(r.ID_REL_OP_POL),
    dataOperacao: String(r.DATA_OPERACAO || '').slice(0, 10),
    horaOperacao: String(r.HORA_OPERACAO || '00:00').slice(0, 5),
    estado: String(r.ESTADO_OPERACAO || 'MG'),
    municipio: String(r.MUNICIPIO_OPERACAO || 'Não informado'),
    unidadeId: String(r.UNIDADE_ID || ''),
    unidadeNome: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'Unidade Policial'),
    criadorNome: String(r.CRIADOR_NOME || 'Não informado'),
    criadorMasp: String(r.CRIADOR_MASP || ''),
    criadorCargo: String(r.CRIADOR_CARGO || ''),
    dataCriacao: r.DATA_CRIACAO ? String(r.DATA_CRIACAO) : '',
    tipoAtendimento: String(r.TIPO_ATENDIMENTO || ''),
    solicitacao: acionamento,
    apoioDepartamentos: extractNames(apoioArr),
    operadores: extractNames(opsArr),
    viaturas: extractVehicles(viatArr),
    aeronaves: [],
    materiaisEncontrados: [],
    resumoTexto: String(r.SINOPSE || 'Sem sinopse registrada.'),
    detalhesExtras: extras
  };
}

function mapCatOpRow(r: any): UnifiedOperationReport {
  const apoioArr = safeJsonArray(r.DEPARTAMENTOS_APOIO_JSON);
  const opsArr = safeJsonArray(r.OPERADORES_JSON);
  const viatArr = safeJsonArray(r.VIATURAS_JSON);
  const aeroArr = safeJsonArray(r.AERONAVES_JSON);

  const tipoVoo =
    r.TIPO_VOO === 'Outros' && r.TIPO_VOO_OUTROS_DESC
      ? `Outros (${r.TIPO_VOO_OUTROS_DESC})`
      : String(r.TIPO_VOO || 'Operacional');

  const extras: Array<{ label: string; value: string }> = [
    { label: 'Emprego de Aeronave', value: Number(r.COM_EMPREGO_AERONAVE) ? 'Sim' : 'Não' },
    { label: 'Tipo de Voo', value: tipoVoo },
    { label: 'Decolagem / Horas de Voo', value: `${r.HORARIO_DECOLAGEM || '—'} (${r.HORAS_TOTAIS_VOO || '00:00'})` }
  ];
  if (Number(r.TEVE_DISPAROS_CAT)) extras.push({ label: 'Disparos', value: 'Sim' });
  if (Number(r.TEVE_OBITO)) extras.push({ label: 'Óbitos Registrados', value: String(r.QTD_OBITOS || 1) });

  return {
    origem: 'CAT',
    origemLabel: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'CAT - Coordenação Aerotática'),
    id: String(r.ID_REL_OP_CAT),
    dataOperacao: String(r.DATA_OPERACAO || '').slice(0, 10),
    horaOperacao: String(r.HORARIO_VOO_OPERACAO || r.HORARIO_DECOLAGEM || '00:00').slice(0, 5),
    estado: String(r.ESTADO_OPERACAO || 'MG'),
    municipio: String(r.MUNICIPIO_OPERACAO || 'Não informado'),
    unidadeId: String(r.UNIDADE_ID || ''),
    unidadeNome: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'CAT - Coordenação Aerotática'),
    criadorNome: String(r.CRIADOR_NOME || 'Não informado'),
    criadorMasp: String(r.CRIADOR_MASP || ''),
    criadorCargo: String(r.CRIADOR_CARGO || ''),
    dataCriacao: r.DATA_CRIACAO ? String(r.DATA_CRIACAO) : '',
    tipoAtendimento: tipoVoo,
    apoioDepartamentos: Number(r.APOIO_OUTRO_DEPARTAMENTO) ? extractNames(apoioArr) : [],
    operadores: extractNames(opsArr),
    viaturas: extractVehicles(viatArr),
    aeronaves: extractNames(aeroArr),
    materiaisEncontrados: [],
    resumoTexto: String(r.SINOPSE_VOO || 'Sem sinopse registrada.'),
    detalhesExtras: extras
  };
}

export async function listAvailableOperationDates(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO',
  unitIds?: string[]
): Promise<AvailableDateOption[]> {
  const sliceLen = granularity === 'DIA' ? 10 : granularity === 'MES' ? 7 : 4;
  const uClause = buildUnitInClause('UNIDADE_ID', unitIds);

  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT LEFT(DATA_OPERACAO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_OPERACOES_CANIL WHERE DATA_OPERACAO IS NOT NULL AND DATA_OPERACAO <> ''${uClause.sql} GROUP BY LEFT(DATA_OPERACAO, ?)`,
      [sliceLen, ...uClause.params, sliceLen]
    ),
    safeQuery(
      pool,
      `SELECT LEFT(DATA_OPERACAO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_OPERACOES_POLICIAL WHERE DATA_OPERACAO IS NOT NULL AND DATA_OPERACAO <> ''${uClause.sql} GROUP BY LEFT(DATA_OPERACAO, ?)`,
      [sliceLen, ...uClause.params, sliceLen]
    ),
    safeQuery(
      pool,
      `SELECT LEFT(DATA_OPERACAO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_OPERACOES_CAT WHERE DATA_OPERACAO IS NOT NULL AND DATA_OPERACAO <> ''${uClause.sql} GROUP BY LEFT(DATA_OPERACAO, ?)`,
      [sliceLen, ...uClause.params, sliceLen]
    )
  ]);

  const counts = new Map<string, number>();
  for (const row of [...canilRows, ...polRows, ...catRows]) {
    const dt = String(row.dt || '').trim();
    if (!dt) continue;
    counts.set(dt, (counts.get(dt) || 0) + Number(row.cnt || 0));
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 9)
    .map(([value, count]) => {
      let label = value;
      if (granularity === 'DIA') label = formatIsoDateBr(value);
      else if (granularity === 'MES') {
        const [yyyy, mm] = value.split('-');
        label = `${mm}/${yyyy} (${MONTH_NAMES_PT[mm] || mm})`;
      }
      return { value, label, count };
    });
}

export async function findOperationReportsByDate(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO',
  isoFilter: string,
  unitIds?: string[]
): Promise<UnifiedOperationReport[]> {
  const whereClause = granularity === 'DIA' ? 'r.DATA_OPERACAO = ?' : 'r.DATA_OPERACAO LIKE ?';
  const param = granularity === 'DIA' ? isoFilter : `${isoFilter}-%`;
  const uClause = buildUnitInClause('r.UNIDADE_ID', unitIds);

  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC LIMIT 30`,
      [param, ...uClause.params]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC LIMIT 30`,
      [param, ...uClause.params]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CAT r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORARIO_VOO_OPERACAO DESC LIMIT 30`,
      [param, ...uClause.params]
    )
  ]);

  return [
    ...canilRows.map(mapCanilOpRow),
    ...polRows.map(mapPolicialOpRow),
    ...catRows.map(mapCatOpRow)
  ].sort((a, b) => `${b.dataOperacao} ${b.horaOperacao}`.localeCompare(`${a.dataOperacao} ${a.horaOperacao}`));
}

export async function findOperationReportsLast24h(
  pool: any,
  unitIds?: string[]
): Promise<UnifiedOperationReport[]> {
  const uClause = buildUnitInClause('r.UNIDADE_ID', unitIds);

  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE (r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_OPERACAO, ' ', COALESCE(NULLIF(r.HORA_OPERACAO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR))${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC, r.DATA_CRIACAO DESC LIMIT 50`,
      uClause.params
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE (r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_OPERACAO, ' ', COALESCE(NULLIF(r.HORA_OPERACAO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR))${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC, r.DATA_CRIACAO DESC LIMIT 50`,
      uClause.params
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CAT r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE (r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_OPERACAO, ' ', COALESCE(NULLIF(r.HORARIO_VOO_OPERACAO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR))${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORARIO_VOO_OPERACAO DESC, r.DATA_CRIACAO DESC LIMIT 50`,
      uClause.params
    )
  ]);

  return [
    ...canilRows.map(mapCanilOpRow),
    ...polRows.map(mapPolicialOpRow),
    ...catRows.map(mapCatOpRow)
  ].sort((a, b) => `${b.dataOperacao} ${b.horaOperacao}`.localeCompare(`${a.dataOperacao} ${a.horaOperacao}`));
}

export async function findSingleOperationReport(
  pool: any,
  origem: OperacaoOrigem,
  id: string
): Promise<UnifiedOperationReport | null> {
  if (origem === 'CANIL') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM RELATORIOS_OPERACOES_CANIL r LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID WHERE r.ID_REL_OPERACAO = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapCanilOpRow(rows[0]) : null;
  }
  if (origem === 'POLICIAL') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM RELATORIOS_OPERACOES_POLICIAL r LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID WHERE r.ID_REL_OP_POL = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapPolicialOpRow(rows[0]) : null;
  }
  if (origem === 'CAT') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM RELATORIOS_OPERACOES_CAT r LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID WHERE r.ID_REL_OP_CAT = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapCatOpRow(rows[0]) : null;
  }
  return null;
}

// ============================================================================
// 2. TREINAMENTOS (COC CANIL / UNIDADES POLICIAIS)
// ============================================================================
function extractDisparoRealResumo(disparoRealRaw: any, disparosJsonRaw: any): string {
  if (!Number(disparoRealRaw)) return '';
  const arr = safeJsonArray(disparosJsonRaw);
  const parts: string[] = [];
  let total = 0;
  for (const item of arr) {
    const tipo = String(item?.tipoArma || '').trim();
    const qty = Math.trunc(Number(item?.quantidadeTiros));
    if (!tipo || !Number.isFinite(qty) || qty <= 0) continue;
    total += qty;
    parts.push(`${tipo}: ${qty} ${qty === 1 ? 'tiro' : 'tiros'}`);
  }
  if (parts.length === 0) return 'Sim';
  return parts.length > 1 ? `Sim — ${parts.join(' | ')} (Total: ${total} tiros)` : `Sim — ${parts[0]}`;
}

function mapCanilTrainingRow(r: any): UnifiedTrainingReport {
  const k9Arr = safeJsonArray(r.CACHORROS_JSON);
  const animais =
    k9Arr.length > 0
      ? extractNames(k9Arr)
      : [r.CACHORRO_NOME ? `${r.CACHORRO_NOME}${r.CACHORRO_RACA ? ` (${r.CACHORRO_RACA})` : ''}` : ''].filter(Boolean);

  return {
    origem: 'CANIL',
    origemLabel: 'COC / Canil',
    id: String(r.ID_REL_TREINAMENTO),
    dataTreinamento: String(r.DATA_TREINAMENTO || '').slice(0, 10),
    horaTreinamento: String(r.HORA_TREINAMENTO || '00:00').slice(0, 5),
    unidadeId: String(r.UNIDADE_ID || ''),
    unidadeNome: String(r.UNIDADE_NOME_JOIN || 'COC - Coordenação de Operações com Cães'),
    responsavelNome: String(r.CONDUTOR_NOME || 'Não informado'),
    responsavelMasp: String(r.CONDUTOR_MASP || ''),
    responsavelCargo: String(r.CONDUTOR_CARGO || ''),
    modalidadeLocal: String(r.MODALIDADE_LOCAL || 'Interno'),
    modalidadeParticipacao: String(r.MODALIDADE_PARTICIPACAO || 'Sozinho'),
    titulo: `Treinamento K9 (${String(r.MODALIDADE_LOCAL || 'Interno')})`,
    participantes: extractNames(safeJsonArray(r.PARTICIPANTES_JSON)),
    animaisK9: animais,
    topicosK9: extractTopicosK9(r.TOPICOS_TREINAMENTO_JSON),
    disparoRealResumo: extractDisparoRealResumo(r.DISPARO_REAL, r.DISPAROS_REAIS_JSON),
    descricao: String(r.DESCRICAO || 'Sem descrição registrada.'),
    dataCriacao: r.DATA_CRIACAO ? String(r.DATA_CRIACAO) : ''
  };
}

function mapPolicialTrainingRow(r: any): UnifiedTrainingReport {
  return {
    origem: 'POLICIAL',
    origemLabel: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'Unidade Policial'),
    id: String(r.ID_REL_TREIN_POL),
    dataTreinamento: String(r.DATA_TREINAMENTO || '').slice(0, 10),
    horaTreinamento: '00:00',
    unidadeId: String(r.UNIDADE_ID || ''),
    unidadeNome: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'Unidade Policial'),
    responsavelNome: String(r.OPERADOR_NOME || 'Não informado'),
    responsavelMasp: String(r.OPERADOR_MASP || ''),
    responsavelCargo: String(r.OPERADOR_CARGO || ''),
    modalidadeLocal: String(r.MODALIDADE_LOCAL || 'Interno'),
    modalidadeParticipacao: String(r.MODALIDADE_PARTICIPACAO || 'Sozinho'),
    titulo: `Treinamento ${String(r.TITULO_TREINAMENTO || 'Operacional')}`,
    participantes: extractNames(safeJsonArray(r.PARTICIPANTES_JSON)),
    animaisK9: [],
    topicosK9: [],
    disparoRealResumo: extractDisparoRealResumo(r.DISPARO_REAL, r.DISPAROS_REAIS_JSON),
    descricao: String(r.DESCRICAO || 'Sem descrição registrada.'),
    dataCriacao: r.DATA_CRIACAO ? String(r.DATA_CRIACAO) : ''
  };
}

export async function listAvailableTrainingDates(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO',
  unitIds?: string[]
): Promise<AvailableDateOption[]> {
  const sliceLen = granularity === 'DIA' ? 10 : granularity === 'MES' ? 7 : 4;
  const uClause = buildUnitInClause('UNIDADE_ID', unitIds);

  const [canilRows, polRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT LEFT(DATA_TREINAMENTO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_TREINAMENTO_CANIL WHERE DATA_TREINAMENTO IS NOT NULL AND DATA_TREINAMENTO <> ''${uClause.sql} GROUP BY LEFT(DATA_TREINAMENTO, ?)`,
      [sliceLen, ...uClause.params, sliceLen]
    ),
    safeQuery(
      pool,
      `SELECT LEFT(DATA_TREINAMENTO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_TREINAMENTO_POLICIAL WHERE DATA_TREINAMENTO IS NOT NULL AND DATA_TREINAMENTO <> ''${uClause.sql} GROUP BY LEFT(DATA_TREINAMENTO, ?)`,
      [sliceLen, ...uClause.params, sliceLen]
    )
  ]);

  const counts = new Map<string, number>();
  for (const row of [...canilRows, ...polRows]) {
    const dt = String(row.dt || '').trim();
    if (!dt) continue;
    counts.set(dt, (counts.get(dt) || 0) + Number(row.cnt || 0));
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 9)
    .map(([value, count]) => {
      let label = value;
      if (granularity === 'DIA') label = formatIsoDateBr(value);
      else if (granularity === 'MES') {
        const [yyyy, mm] = value.split('-');
        label = `${mm}/${yyyy} (${MONTH_NAMES_PT[mm] || mm})`;
      }
      return { value, label, count };
    });
}

export async function findTrainingReportsByDate(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO',
  isoFilter: string,
  unitIds?: string[]
): Promise<UnifiedTrainingReport[]> {
  const whereClause = granularity === 'DIA' ? 'r.DATA_TREINAMENTO = ?' : 'r.DATA_TREINAMENTO LIKE ?';
  const param = granularity === 'DIA' ? isoFilter : `${isoFilter}-%`;
  const uClause = buildUnitInClause('r.UNIDADE_ID', unitIds);

  const [canilRows, polRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_TREINAMENTO_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}${uClause.sql}
       ORDER BY r.DATA_TREINAMENTO DESC, r.HORA_TREINAMENTO DESC LIMIT 30`,
      [param, ...uClause.params]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_TREINAMENTO_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}${uClause.sql}
       ORDER BY r.DATA_TREINAMENTO DESC, r.DATA_CRIACAO DESC LIMIT 30`,
      [param, ...uClause.params]
    )
  ]);

  return [...canilRows.map(mapCanilTrainingRow), ...polRows.map(mapPolicialTrainingRow)].sort((a, b) =>
    `${b.dataTreinamento} ${b.horaTreinamento}`.localeCompare(`${a.dataTreinamento} ${a.horaTreinamento}`)
  );
}

export async function findTrainingReportsLast24h(
  pool: any,
  unitIds?: string[]
): Promise<UnifiedTrainingReport[]> {
  const uClause = buildUnitInClause('r.UNIDADE_ID', unitIds);

  const [canilRows, polRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_TREINAMENTO_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE (r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_TREINAMENTO, ' ', COALESCE(NULLIF(r.HORA_TREINAMENTO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR))${uClause.sql}
       ORDER BY r.DATA_TREINAMENTO DESC, r.DATA_CRIACAO DESC LIMIT 50`,
      uClause.params
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_TREINAMENTO_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE (r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_TREINAMENTO, ' 00:00'), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR))${uClause.sql}
       ORDER BY r.DATA_TREINAMENTO DESC, r.DATA_CRIACAO DESC LIMIT 50`,
      uClause.params
    )
  ]);

  return [...canilRows.map(mapCanilTrainingRow), ...polRows.map(mapPolicialTrainingRow)].sort((a, b) =>
    `${b.dataTreinamento} ${b.horaTreinamento}`.localeCompare(`${a.dataTreinamento} ${a.horaTreinamento}`)
  );
}

export async function findSingleTrainingReport(
  pool: any,
  origem: TreinamentoOrigem,
  id: string
): Promise<UnifiedTrainingReport | null> {
  if (origem === 'CANIL') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM RELATORIOS_TREINAMENTO_CANIL r LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID WHERE r.ID_REL_TREINAMENTO = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapCanilTrainingRow(rows[0]) : null;
  }
  const rows = await safeQuery(
    pool,
    `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM RELATORIOS_TREINAMENTO_POLICIAL r LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID WHERE r.ID_REL_TREIN_POL = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? mapPolicialTrainingRow(rows[0]) : null;
}

// ============================================================================
// 3. ARMARIA — RECIBOS SEPARADOS (ARMAS, MUNIÇÕES, MATERIAIS) & RELATÓRIOS
// ============================================================================
function mapWeaponReceiptRow(r: any): UnifiedArmariaReceipt {
  return {
    tipo: 'ARMAS',
    tipoLabel: 'Cautela de Armamento',
    id: String(r.ID_ACAUTELAR_ARMAS),
    protocolo: String(r.ID_ACAUTELAR_ARMAS).slice(0, 24),
    unidadeId: String(r.UNIDADE_ID_ACAUTELAR_ARMAS || ''),
    unidadeNome: String(r.UNIDADE_NOME_JOIN || 'Unidade'),
    requerenteId: String(r.REQUERENTE_ID_ACAUTELAR_ARMAS || ''),
    requerenteNome: String(r.REQUERENTE_NOME_ACAUTELAR_ARMAS || 'Não informado'),
    requerenteMasp: String(r.REQUERENTE_MASP_ACAUTELAR_ARMAS || ''),
    requerenteCargo: String(r.REQUERENTE_CARGO_ACAUTELAR_ARMAS || ''),
    itemTitulo: `${r.MODELO_ACAUTELAR_ARMAS || 'Arma'} (Nº ${r.NUMERO_SERIE_ACAUTELAR_ARMAS || 'S/N'})`,
    itemSubtitulo: [r.TIPO_ARMA_ACAUTELAR_ARMAS, r.CALIBRE_ACAUTELAR_ARMAS].filter(Boolean).join(' • '),
    quantidade: `1 arma / ${r.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS ?? 1} carregador(es)`,
    status: String(r.STATUS_ACAUTELAR_ARMAS || 'PENDENTE'),
    dataSolicitacao: r.DATA_SOLICITACAO_ACAUTELAR_ARMAS ? String(r.DATA_SOLICITACAO_ACAUTELAR_ARMAS) : '',
    dataAutorizacao: r.DATA_AUTORIZACAO_ACAUTELAR_ARMAS ? String(r.DATA_AUTORIZACAO_ACAUTELAR_ARMAS) : '',
    dataDevolucao: r.DATA_DEVOLUCAO_ACAUTELAR_ARMAS ? String(r.DATA_DEVOLUCAO_ACAUTELAR_ARMAS) : '',
    armeiroAutorizador: r.ARMEIRO_NOME_ACAUTELAR_ARMAS
      ? `${r.ARMEIRO_NOME_ACAUTELAR_ARMAS}${r.ARMEIRO_MASP_ACAUTELAR_ARMAS ? ` (MASP ${r.ARMEIRO_MASP_ACAUTELAR_ARMAS})` : ''}`
      : 'Aguardando deferimento',
    armeiroRecebimento: r.ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS
      ? `${r.ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS}${r.ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS ? ` (MASP ${r.ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS})` : ''}`
      : '—',
    finalidade: String(r.FINALIDADE_MOTIVO_ACAUTELAR_ARMAS || 'Uso em serviço'),
    observacoes: [r.OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS, r.OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS]
      .filter(Boolean)
      .join(' | '),
    extras: [
      { label: 'Número de Série', value: String(r.NUMERO_SERIE_ACAUTELAR_ARMAS || '—') },
      { label: 'Condições na Devolução', value: String(r.CONDICOES_USO_ACAUTELAR_ARMAS || '—') },
      { label: 'Tiros Registrados', value: Number(r.HOUVE_TIROS_ACAUTELAR_ARMAS) ? `${r.QUANTIDADE_TIROS_ACAUTELAR_ARMAS || 0} disparos` : 'Não houve' }
    ]
  };
}

function mapAmmoReceiptRow(r: any): UnifiedArmariaReceipt {
  return {
    tipo: 'MUNICOES',
    tipoLabel: 'Cautela de Munições',
    id: String(r.ID_ACAUTELAR_MUNICOES),
    protocolo: String(r.ID_ACAUTELAR_MUNICOES).slice(0, 24),
    unidadeId: String(r.UNIDADE_ID_ACAUTELAR_MUNICOES || ''),
    unidadeNome: String(r.UNIDADE_NOME_JOIN || 'Unidade'),
    requerenteId: String(r.REQUERENTE_ID_ACAUTELAR_MUNICOES || ''),
    requerenteNome: String(r.REQUERENTE_NOME_ACAUTELAR_MUNICOES || 'Não informado'),
    requerenteMasp: String(r.REQUERENTE_MASP_ACAUTELAR_MUNICOES || ''),
    requerenteCargo: String(r.REQUERENTE_CARGO_ACAUTELAR_MUNICOES || ''),
    itemTitulo: `Calibre ${r.CALIBRE_NOME_ACAUTELAR_MUNICOES || 'N/D'}`,
    itemSubtitulo: [r.TIPO_MUNICAO_ACAUTELAR_MUNICOES, r.LOTE_MUNICAO_ACAUTELAR_MUNICOES ? `Lote ${r.LOTE_MUNICAO_ACAUTELAR_MUNICOES}` : '']
      .filter(Boolean)
      .join(' • '),
    quantidade: `${r.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0} unid. (Devolvida: ${r.QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES || 0})`,
    status: String(r.STATUS_ACAUTELAR_MUNICOES || 'PENDENTE'),
    dataSolicitacao: r.DATA_SOLICITACAO_ACAUTELAR_MUNICOES ? String(r.DATA_SOLICITACAO_ACAUTELAR_MUNICOES) : '',
    dataAutorizacao: r.DATA_AUTORIZACAO_ACAUTELAR_MUNICOES ? String(r.DATA_AUTORIZACAO_ACAUTELAR_MUNICOES) : '',
    dataDevolucao: r.DATA_DEVOLUCAO_ACAUTELAR_MUNICOES ? String(r.DATA_DEVOLUCAO_ACAUTELAR_MUNICOES) : '',
    armeiroAutorizador: r.ARMEIRO_NOME_ACAUTELAR_MUNICOES
      ? `${r.ARMEIRO_NOME_ACAUTELAR_MUNICOES}${r.ARMEIRO_MASP_ACAUTELAR_MUNICOES ? ` (MASP ${r.ARMEIRO_MASP_ACAUTELAR_MUNICOES})` : ''}`
      : 'Aguardando deferimento',
    armeiroRecebimento: String(r.ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_MUNICOES || '—'),
    finalidade: String(r.MOTIVO_USO_ACAUTELAR_MUNICOES || 'Uso em serviço'),
    observacoes: String(r.OBSERVACOES_ACAUTELAR_MUNICOES || ''),
    extras: [
      { label: 'Previsão de Devolução', value: Number(r.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES) ? 'Sim' : 'Não' }
    ]
  };
}

function mapMaterialReceiptRow(r: any): UnifiedArmariaReceipt {
  const isInterno = r.TIPO_DESTINATARIO_CAUTELAS_MATERIAIS !== 'externo';
  return {
    tipo: 'MATERIAIS',
    tipoLabel: 'Cautela de Materiais',
    id: String(r.ID_CAUTELAS_MATERIAIS),
    protocolo: String(r.PROTOCOLO_CAUTELAS_MATERIAIS || r.ID_CAUTELAS_MATERIAIS).slice(0, 28),
    unidadeId: String(r.UNIDADE_ID_CAUTELAS_MATERIAIS || ''),
    unidadeNome: String(r.UNIDADE_NOME_JOIN || 'Unidade'),
    requerenteId: String(r.USUARIO_INTERNO_ID_CAUTELAS_MATERIAIS || ''),
    requerenteNome: String(
      isInterno ? r.USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS : r.USUARIO_EXTERNO_NOME_CAUTELAS_MATERIAIS || 'Não informado'
    ),
    requerenteMasp: String(
      isInterno ? r.USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS : r.USUARIO_EXTERNO_DOCUMENTO_CAUTELAS_MATERIAIS || ''
    ),
    requerenteCargo: String(r.USUARIO_INTERNO_CARGO_CAUTELAS_MATERIAIS || ''),
    itemTitulo: String(r.MATERIAL_NOME_CAUTELAS_MATERIAIS || 'Material'),
    itemSubtitulo: String(r.TIPO_MATERIAL_NOME_CAUTELAS_MATERIAIS || ''),
    quantidade: `${r.QUANTIDADE_CAUTELAS_MATERIAIS || 1} unidade(s)`,
    status: String(r.STATUS_CAUTELAS_MATERIAIS || 'Em Uso'),
    dataSolicitacao: r.DATA_RETIRADA_CAUTELAS_MATERIAIS ? String(r.DATA_RETIRADA_CAUTELAS_MATERIAIS) : '',
    dataAutorizacao: r.DATA_RETIRADA_CAUTELAS_MATERIAIS ? String(r.DATA_RETIRADA_CAUTELAS_MATERIAIS) : '',
    dataDevolucao: r.DATA_DEVOLUCAO_CAUTELAS_MATERIAIS ? String(r.DATA_DEVOLUCAO_CAUTELAS_MATERIAIS) : '',
    armeiroAutorizador: r.RESPONSAVEL_ENTREGA_NOME_CAUTELAS_MATERIAIS
      ? `${r.RESPONSAVEL_ENTREGA_NOME_CAUTELAS_MATERIAIS}${r.RESPONSAVEL_ENTREGA_MASP_CAUTELAS_MATERIAIS ? ` (MASP ${r.RESPONSAVEL_ENTREGA_MASP_CAUTELAS_MATERIAIS})` : ''}`
      : '—',
    armeiroRecebimento: r.RESPONSAVEL_RECEBIMENTO_NOME_CAUTELAS_MATERIAIS
      ? `${r.RESPONSAVEL_RECEBIMENTO_NOME_CAUTELAS_MATERIAIS}${r.RESPONSAVEL_RECEBIMENTO_MASP_CAUTELAS_MATERIAIS ? ` (MASP ${r.RESPONSAVEL_RECEBIMENTO_MASP_CAUTELAS_MATERIAIS})` : ''}`
      : '—',
    finalidade: String(r.FINALIDADE_CAUTELAS_MATERIAIS || 'Uso operacional'),
    observacoes: String(r.RELATO_USO_ANOMALIAS_CAUTELAS_MATERIAIS || ''),
    extras: [
      { label: 'Protocolo', value: String(r.PROTOCOLO_CAUTELAS_MATERIAIS || '—') },
      { label: 'Consumido', value: Number(r.FOI_CONSUMIDO_CAUTELAS_MATERIAIS) ? 'Sim' : 'Não' }
    ]
  };
}

export async function listArmariaReceipts(
  pool: any,
  tipo: ReciboTipo,
  targetUser: { id?: string; masp?: string; name?: string },
  unitIds?: string[]
): Promise<UnifiedArmariaReceipt[]> {
  const uid = String(targetUser.id || '').trim();
  const masp = String(targetUser.masp || '').trim();
  const name = String(targetUser.name || '').trim();

  if (tipo === 'ARMAS') {
    const uClause = buildUnitInClause('a.UNIDADE_ID_ACAUTELAR_ARMAS', unitIds);
    const rows = await safeQuery(
      pool,
      `SELECT a.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_ARMAS a
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ACAUTELAR_ARMAS
       WHERE (a.REQUERENTE_ID_ACAUTELAR_ARMAS = ? OR (? <> '' AND a.REQUERENTE_MASP_ACAUTELAR_ARMAS = ?) OR (? <> '' AND LOWER(a.REQUERENTE_NOME_ACAUTELAR_ARMAS) = LOWER(?)))${uClause.sql}
       ORDER BY a.DATA_SOLICITACAO_ACAUTELAR_ARMAS DESC LIMIT 20`,
      [uid, masp, masp, name, name, ...uClause.params]
    );
    return rows.map(mapWeaponReceiptRow);
  }

  if (tipo === 'MUNICOES') {
    const uClause = buildUnitInClause('m.UNIDADE_ID_ACAUTELAR_MUNICOES', unitIds);
    const rows = await safeQuery(
      pool,
      `SELECT m.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_MUNICOES m
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_ACAUTELAR_MUNICOES
       WHERE (m.REQUERENTE_ID_ACAUTELAR_MUNICOES = ? OR (? <> '' AND m.REQUERENTE_MASP_ACAUTELAR_MUNICOES = ?) OR (? <> '' AND LOWER(m.REQUERENTE_NOME_ACAUTELAR_MUNICOES) = LOWER(?)))${uClause.sql}
       ORDER BY m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES DESC LIMIT 20`,
      [uid, masp, masp, name, name, ...uClause.params]
    );
    return rows.map(mapAmmoReceiptRow);
  }

  const uClause = buildUnitInClause('cm.UNIDADE_ID_CAUTELAS_MATERIAIS', unitIds);
  const rows = await safeQuery(
    pool,
    `SELECT cm.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
     FROM CAUTELAS_MATERIAIS cm
     LEFT JOIN UNIDADES u ON u.ID_UNIDADES = cm.UNIDADE_ID_CAUTELAS_MATERIAIS
     WHERE (cm.USUARIO_INTERNO_ID_CAUTELAS_MATERIAIS = ? OR (? <> '' AND cm.USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS = ?) OR (? <> '' AND LOWER(cm.USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS) = LOWER(?)))${uClause.sql}
     ORDER BY cm.DATA_RETIRADA_CAUTELAS_MATERIAIS DESC LIMIT 20`,
    [uid, masp, masp, name, name, ...uClause.params]
  );
  return rows.map(mapMaterialReceiptRow);
}

export async function findSingleArmariaReceipt(
  pool: any,
  tipo: ReciboTipo,
  id: string
): Promise<UnifiedArmariaReceipt | null> {
  if (tipo === 'ARMAS') {
    const rows = await safeQuery(
      pool,
      `SELECT a.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM ACAUTELAR_ARMAS a LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ACAUTELAR_ARMAS WHERE a.ID_ACAUTELAR_ARMAS = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapWeaponReceiptRow(rows[0]) : null;
  }
  if (tipo === 'MUNICOES') {
    const rows = await safeQuery(
      pool,
      `SELECT m.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM ACAUTELAR_MUNICOES m LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_ACAUTELAR_MUNICOES WHERE m.ID_ACAUTELAR_MUNICOES = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapAmmoReceiptRow(rows[0]) : null;
  }
  const rows = await safeQuery(
    pool,
    `SELECT cm.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN FROM CAUTELAS_MATERIAIS cm LEFT JOIN UNIDADES u ON u.ID_UNIDADES = cm.UNIDADE_ID_CAUTELAS_MATERIAIS WHERE cm.ID_CAUTELAS_MATERIAIS = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? mapMaterialReceiptRow(rows[0]) : null;
}

function buildPeriodCondition(dateColumn: string, period: ArmariaPeriodo): string {
  switch (period) {
    case '24H':
      return `${dateColumn} >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`;
    case 'SEMANA':
      return `${dateColumn} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
    case 'MES_ATUAL':
      return `YEAR(${dateColumn}) = YEAR(NOW()) AND MONTH(${dateColumn}) = MONTH(NOW())`;
    case 'ANO_ATUAL':
      return `YEAR(${dateColumn}) = YEAR(NOW())`;
  }
}

export async function findArmariaCautelasByPeriod(
  pool: any,
  period: ArmariaPeriodo,
  unitIds?: string[]
): Promise<ArmariaCautelasReportData> {
  const uArmas = buildUnitInClause('a.UNIDADE_ID_ACAUTELAR_ARMAS', unitIds);
  const uMun = buildUnitInClause('m.UNIDADE_ID_ACAUTELAR_MUNICOES', unitIds);
  const uMat = buildUnitInClause('cm.UNIDADE_ID_CAUTELAS_MATERIAIS', unitIds);

  const [armasRows, munRows, matRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT a.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_ARMAS a
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ACAUTELAR_ARMAS
       WHERE ${buildPeriodCondition('a.DATA_SOLICITACAO_ACAUTELAR_ARMAS', period)}${uArmas.sql}
       ORDER BY a.DATA_SOLICITACAO_ACAUTELAR_ARMAS DESC LIMIT 80`,
      uArmas.params
    ),
    safeQuery(
      pool,
      `SELECT m.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_MUNICOES m
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_ACAUTELAR_MUNICOES
       WHERE ${buildPeriodCondition('m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES', period)}${uMun.sql}
       ORDER BY m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES DESC LIMIT 80`,
      uMun.params
    ),
    safeQuery(
      pool,
      `SELECT cm.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM CAUTELAS_MATERIAIS cm
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = cm.UNIDADE_ID_CAUTELAS_MATERIAIS
       WHERE ${buildPeriodCondition('cm.DATA_RETIRADA_CAUTELAS_MATERIAIS', period)}${uMat.sql}
       ORDER BY cm.DATA_RETIRADA_CAUTELAS_MATERIAIS DESC LIMIT 80`,
      uMat.params
    )
  ]);

  return {
    armas: armasRows.map(mapWeaponReceiptRow),
    municoes: munRows.map(mapAmmoReceiptRow),
    materiais: matRows.map(mapMaterialReceiptRow)
  };
}

// ============================================================================
// 4. GERADOR DE PDF PROFISSIONAL (pdf-lib)
// ============================================================================
function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const safe = sanitizePdfText(text);
  const paragraphs = safe.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth) {
              if (chunk) lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

class PdfReportBuilder {
  private doc: PDFDocument;
  private fontRegular!: PDFFont;
  private fontBold!: PDFFont;
  private page!: PDFPage;
  private cursorY = 0;
  private readonly pageWidth = 595.28;
  private readonly pageHeight = 841.89;
  private readonly marginX = 44;
  private readonly contentWidth = 595.28 - 88;
  private titleHeader: string;
  private subtitleHeader: string;

  constructor(doc: PDFDocument, titleHeader: string, subtitleHeader: string) {
    this.doc = doc;
    this.titleHeader = sanitizePdfText(titleHeader);
    this.subtitleHeader = sanitizePdfText(subtitleHeader);
  }

  async init() {
    this.fontRegular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fontBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([this.pageWidth, this.pageHeight]);
    this.page.drawRectangle({
      x: 0,
      y: this.pageHeight - 76,
      width: this.pageWidth,
      height: 76,
      color: rgb(0.06, 0.1, 0.17)
    });
    this.page.drawRectangle({
      x: 0,
      y: this.pageHeight - 79,
      width: this.pageWidth,
      height: 3,
      color: rgb(0.85, 0.65, 0.13)
    });
    this.page.drawText('COEapp — POLICIA CIVIL DE MINAS GERAIS', {
      x: this.marginX,
      y: this.pageHeight - 28,
      size: 9,
      font: this.fontBold,
      color: rgb(0.96, 0.78, 0.25)
    });
    this.page.drawText(this.titleHeader.slice(0, 74), {
      x: this.marginX,
      y: this.pageHeight - 48,
      size: 13.5,
      font: this.fontBold,
      color: rgb(1, 1, 1)
    });
    this.page.drawText(this.subtitleHeader.slice(0, 98), {
      x: this.marginX,
      y: this.pageHeight - 65,
      size: 8.5,
      font: this.fontRegular,
      color: rgb(0.82, 0.86, 0.92)
    });
    this.cursorY = this.pageHeight - 98;
  }

  ensureSpace(neededHeight: number) {
    if (this.cursorY - neededHeight < 52) {
      this.addPage();
    }
  }

  drawSectionTitle(title: string) {
    this.ensureSpace(28);
    this.cursorY -= 6;
    this.page.drawRectangle({
      x: this.marginX,
      y: this.cursorY - 4,
      width: this.contentWidth,
      height: 18,
      color: rgb(0.93, 0.95, 0.98)
    });
    this.page.drawRectangle({
      x: this.marginX,
      y: this.cursorY - 4,
      width: 3,
      height: 18,
      color: rgb(0.06, 0.48, 0.36)
    });
    this.page.drawText(sanitizePdfText(title).toUpperCase().slice(0, 90), {
      x: this.marginX + 9,
      y: this.cursorY + 1,
      size: 9.5,
      font: this.fontBold,
      color: rgb(0.08, 0.14, 0.22)
    });
    this.cursorY -= 16;
  }

  drawKeyValue(label: string, value: string) {
    const cleanLabel = `${sanitizePdfText(label)}: `;
    const cleanValue = sanitizePdfText(value || '—');
    const labelW = this.fontBold.widthOfTextAtSize(cleanLabel, 9.5);
    const valLines = wrapTextLines(cleanValue, this.fontRegular, 9.5, Math.max(120, this.contentWidth - labelW - 6));

    this.ensureSpace(Math.max(15, valLines.length * 13 + 3));
    this.page.drawText(cleanLabel, {
      x: this.marginX + 4,
      y: this.cursorY,
      size: 9.5,
      font: this.fontBold,
      color: rgb(0.2, 0.25, 0.32)
    });
    valLines.forEach((line, idx) => {
      if (idx > 0) this.ensureSpace(14);
      this.page.drawText(line, {
        x: idx === 0 ? this.marginX + 4 + labelW : this.marginX + 12,
        y: this.cursorY,
        size: 9.5,
        font: this.fontRegular,
        color: rgb(0.1, 0.13, 0.18)
      });
      this.cursorY -= 13;
    });
  }

  drawParagraph(text: string) {
    const lines = wrapTextLines(text || '—', this.fontRegular, 9.5, this.contentWidth - 8);
    for (const line of lines) {
      this.ensureSpace(14);
      if (line) {
        this.page.drawText(line, {
          x: this.marginX + 4,
          y: this.cursorY,
          size: 9.5,
          font: this.fontRegular,
          color: rgb(0.1, 0.13, 0.18)
        });
      }
      this.cursorY -= 13;
    }
    this.cursorY -= 4;
  }

  drawDivider() {
    this.ensureSpace(14);
    this.page.drawLine({
      start: { x: this.marginX, y: this.cursorY },
      end: { x: this.marginX + this.contentWidth, y: this.cursorY },
      thickness: 0.75,
      color: rgb(0.8, 0.84, 0.89)
    });
    this.cursorY -= 12;
  }

  drawOperationBlock(report: UnifiedOperationReport, index?: number, total?: number) {
    const badge = index !== undefined && total !== undefined ? `Relatório ${index + 1} de ${total} — ` : '';
    this.drawSectionTitle(`${badge}${report.unidadeNome} (${report.origemLabel})`);
    this.drawKeyValue('Identificador', report.id);
    this.drawKeyValue('Data e Hora da Operação', `${formatIsoDateBr(report.dataOperacao)} às ${report.horaOperacao}`);
    this.drawKeyValue('Localidade (UF / Município)', `${report.municipio} / ${report.estado}`);
    this.drawKeyValue(
      'Registrado por',
      `${report.criadorNome}${report.criadorMasp ? ` (MASP ${report.criadorMasp})` : ''}${
        report.criadorCargo ? ` — ${report.criadorCargo}` : ''
      }`
    );
    if (report.dataCriacao) this.drawKeyValue('Registro no Sistema', formatIsoDateTimeBr(report.dataCriacao));
    for (const ex of report.detalhesExtras) {
      if (ex.value) this.drawKeyValue(ex.label, ex.value);
    }
    if (report.apoioDepartamentos.length > 0) this.drawKeyValue('Apoio a Departamentos', report.apoioDepartamentos.join(', '));
    if (report.operadores.length > 0) this.drawKeyValue('Integrantes / Operadores', report.operadores.join('; '));
    if (report.viaturas.length > 0) this.drawKeyValue('Viaturas Empregadas', report.viaturas.join('; '));
    if (report.aeronaves.length > 0) this.drawKeyValue('Aeronaves Empregadas', report.aeronaves.join('; '));
    if (report.materiaisEncontrados.length > 0) this.drawKeyValue('Materiais / Apreensões', report.materiaisEncontrados.join('; '));
    this.cursorY -= 4;
    this.ensureSpace(20);
    this.page.drawText('SINOPSE / DETALHAMENTO DA OPERACAO:', {
      x: this.marginX + 4,
      y: this.cursorY,
      size: 9,
      font: this.fontBold,
      color: rgb(0.15, 0.22, 0.3)
    });
    this.cursorY -= 14;
    this.drawParagraph(report.resumoTexto);
    this.drawDivider();
  }

  drawTrainingBlock(report: UnifiedTrainingReport, index?: number, total?: number) {
    const badge = index !== undefined && total !== undefined ? `Treinamento ${index + 1} de ${total} — ` : '';
    this.drawSectionTitle(`${badge}${report.unidadeNome} — ${report.titulo}`);
    this.drawKeyValue('Identificador', report.id);
    this.drawKeyValue(
      'Data e Hora',
      `${formatIsoDateBr(report.dataTreinamento)}${report.horaTreinamento !== '00:00' ? ` às ${report.horaTreinamento}` : ''}`
    );
    this.drawKeyValue(
      'Responsável / Condutor',
      `${report.responsavelNome}${report.responsavelMasp ? ` (MASP ${report.responsavelMasp})` : ''}${
        report.responsavelCargo ? ` — ${report.responsavelCargo}` : ''
      }`
    );
    this.drawKeyValue('Local / Participação', `${report.modalidadeLocal} • ${report.modalidadeParticipacao}`);
    if (report.animaisK9.length > 0) this.drawKeyValue('Animais K9', report.animaisK9.join('; '));
    if (report.topicosK9.length > 0) this.drawKeyValue('Tópicos de Treinamento K9', report.topicosK9.join(', '));
    if (report.disparoRealResumo) this.drawKeyValue('Disparo Real', report.disparoRealResumo);
    if (report.participantes.length > 0) this.drawKeyValue('Participantes', report.participantes.join('; '));
    if (report.dataCriacao) this.drawKeyValue('Registro no Sistema', formatIsoDateTimeBr(report.dataCriacao));
    this.cursorY -= 4;
    this.ensureSpace(20);
    this.page.drawText('DESCRICAO DO TREINAMENTO:', {
      x: this.marginX + 4,
      y: this.cursorY,
      size: 9,
      font: this.fontBold,
      color: rgb(0.15, 0.22, 0.3)
    });
    this.cursorY -= 14;
    this.drawParagraph(report.descricao);
    this.drawDivider();
  }

  drawReceiptBlock(rec: UnifiedArmariaReceipt, index?: number, total?: number) {
    const badge = index !== undefined && total !== undefined ? `${index + 1}/${total} — ` : '';
    this.drawSectionTitle(`${badge}${rec.tipoLabel} • ${rec.unidadeNome}`);
    this.drawKeyValue('Protocolo / ID', rec.protocolo);
    this.drawKeyValue('Status Atual', rec.status);
    this.drawKeyValue(
      'Policial / Requerente',
      `${rec.requerenteNome}${rec.requerenteMasp ? ` (MASP ${rec.requerenteMasp})` : ''}${
        rec.requerenteCargo ? ` — ${rec.requerenteCargo}` : ''
      }`
    );
    this.drawKeyValue('Item Acautelado', `${rec.itemTitulo}${rec.itemSubtitulo ? ` — ${rec.itemSubtitulo}` : ''}`);
    this.drawKeyValue('Quantidade', rec.quantidade);
    this.drawKeyValue('Data da Solicitação / Retirada', formatIsoDateTimeBr(rec.dataSolicitacao));
    if (rec.dataAutorizacao) this.drawKeyValue('Data da Autorização', formatIsoDateTimeBr(rec.dataAutorizacao));
    if (rec.dataDevolucao) this.drawKeyValue('Data da Devolução', formatIsoDateTimeBr(rec.dataDevolucao));
    this.drawKeyValue('Responsável pela Armaria (Entrega)', rec.armeiroAutorizador);
    if (rec.armeiroRecebimento && rec.armeiroRecebimento !== '—') {
      this.drawKeyValue('Responsável pelo Recebimento', rec.armeiroRecebimento);
    }
    this.drawKeyValue('Finalidade / Motivo', rec.finalidade);
    for (const ex of rec.extras) {
      if (ex.value && ex.value !== '—') this.drawKeyValue(ex.label, ex.value);
    }
    if (rec.observacoes) this.drawKeyValue('Observações', rec.observacoes);
    this.drawDivider();
  }

  drawSignatureLines(leftLabel: string, rightLabel: string) {
    this.ensureSpace(70);
    this.cursorY -= 26;
    const mid = this.marginX + this.contentWidth / 2;
    this.page.drawLine({
      start: { x: this.marginX + 12, y: this.cursorY },
      end: { x: mid - 18, y: this.cursorY },
      thickness: 0.7,
      color: rgb(0.3, 0.35, 0.42)
    });
    this.page.drawLine({
      start: { x: mid + 18, y: this.cursorY },
      end: { x: this.marginX + this.contentWidth - 12, y: this.cursorY },
      thickness: 0.7,
      color: rgb(0.3, 0.35, 0.42)
    });
    this.cursorY -= 12;
    this.page.drawText(sanitizePdfText(leftLabel).slice(0, 38), {
      x: this.marginX + 18,
      y: this.cursorY,
      size: 8.5,
      font: this.fontRegular,
      color: rgb(0.3, 0.35, 0.42)
    });
    this.page.drawText(sanitizePdfText(rightLabel).slice(0, 38), {
      x: mid + 24,
      y: this.cursorY,
      size: 8.5,
      font: this.fontRegular,
      color: rgb(0.3, 0.35, 0.42)
    });
  }

  setHeaderTexts(titleHeader: string, subtitleHeader: string) {
    this.titleHeader = sanitizePdfText(titleHeader);
    this.subtitleHeader = sanitizePdfText(subtitleHeader);
  }

  getDoc(): PDFDocument {
    return this.doc;
  }

  getPage(): PDFPage {
    return this.page;
  }

  getFonts(): { regular: PDFFont; bold: PDFFont } {
    return { regular: this.fontRegular, bold: this.fontBold };
  }

  getMetrics() {
    return {
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      marginX: this.marginX,
      contentWidth: this.contentWidth,
      cursorY: this.cursorY
    };
  }

  setCursorY(y: number) {
    this.cursorY = y;
  }

  drawKpiCards(cards: Array<{ label: string; value: string; accent?: [number, number, number] }>) {
    if (cards.length === 0) return;
    const cardHeight = 42;
    this.ensureSpace(cardHeight + 12);
    const gap = 8;
    const cardWidth = (this.contentWidth - gap * (cards.length - 1)) / cards.length;
    const topY = this.cursorY;

    cards.forEach((c, idx) => {
      const x = this.marginX + idx * (cardWidth + gap);
      const y = topY - cardHeight;
      const accent = c.accent || [0.06, 0.48, 0.36];
      this.page.drawRectangle({
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0.96, 0.97, 0.99),
        borderColor: rgb(0.84, 0.87, 0.92),
        borderWidth: 0.7
      });
      this.page.drawRectangle({
        x,
        y: topY - 3,
        width: cardWidth,
        height: 3,
        color: rgb(accent[0], accent[1], accent[2])
      });
      this.page.drawText(sanitizePdfText(c.label).toUpperCase().slice(0, 24), {
        x: x + 7,
        y: topY - 15,
        size: 7.2,
        font: this.fontBold,
        color: rgb(0.4, 0.46, 0.55)
      });
      this.page.drawText(sanitizePdfText(c.value).slice(0, 20), {
        x: x + 7,
        y: topY - 33,
        size: 13,
        font: this.fontBold,
        color: rgb(0.08, 0.13, 0.22)
      });
    });

    this.cursorY = topY - cardHeight - 12;
  }

  drawHorizontalBarChart(
    chartTitle: string,
    items: Array<{ label: string; percent: number; rightText: string; barColor?: [number, number, number] }>,
    options?: { maxItems?: number; compact?: boolean; allowPageBreak?: boolean }
  ) {
    const maxItems = options?.maxItems ?? 12;
    const compact = options?.compact ?? false;
    const allowBreak = options?.allowPageBreak ?? true;
    const visible = items.slice(0, maxItems);
    if (visible.length === 0) return;

    const rowH = compact ? 16 : 20;
    const needed = 28 + visible.length * rowH;
    if (allowBreak) this.ensureSpace(Math.min(needed, 120));

    this.drawSectionTitle(chartTitle);

    const labelColW = 165;
    const rightColW = 84;
    const barTrackW = Math.max(110, this.contentWidth - labelColW - rightColW - 14);
    const barH = compact ? 8.5 : 11;

    for (const item of visible) {
      if (allowBreak) this.ensureSpace(rowH + 4);
      const y = this.cursorY;
      const pct = Math.max(0, Math.min(100, Number.isFinite(item.percent) ? item.percent : 0));
      const color =
        item.barColor ||
        (pct >= 75 ? [0.06, 0.56, 0.42] : pct >= 50 ? [0.85, 0.58, 0.08] : [0.78, 0.22, 0.22]);

      this.page.drawText(sanitizePdfText(item.label).slice(0, 30), {
        x: this.marginX + 4,
        y: y - 1,
        size: compact ? 8 : 8.5,
        font: this.fontBold,
        color: rgb(0.14, 0.19, 0.27)
      });

      const trackX = this.marginX + labelColW;
      const trackY = y - 2.5;
      this.page.drawRectangle({
        x: trackX,
        y: trackY,
        width: barTrackW,
        height: barH,
        color: rgb(0.9, 0.92, 0.96)
      });

      const fillW = Math.max(pct > 0 ? 3 : 0, (barTrackW * pct) / 100);
      if (fillW > 0) {
        this.page.drawRectangle({
          x: trackX,
          y: trackY,
          width: fillW,
          height: barH,
          color: rgb(color[0], color[1], color[2])
        });
      }

      this.page.drawText(sanitizePdfText(item.rightText).slice(0, 18), {
        x: trackX + barTrackW + 8,
        y: y - 1,
        size: compact ? 8 : 8.5,
        font: this.fontBold,
        color: rgb(0.16, 0.22, 0.3)
      });

      this.cursorY -= rowH;
    }

    if (items.length > maxItems) {
      this.page.drawText(sanitizePdfText(`+ ${items.length - maxItems} item(ns) adicional(is)`), {
        x: this.marginX + 4,
        y: this.cursorY,
        size: 7.8,
        font: this.fontRegular,
        color: rgb(0.45, 0.5, 0.58)
      });
      this.cursorY -= 12;
    } else {
      this.cursorY -= 4;
    }
  }

  async finalize(): Promise<Buffer> {
    const pages = this.doc.getPages();
    const generatedAt = formatIsoDateTimeBr(new Date());
    pages.forEach((p, i) => {
      p.drawLine({
        start: { x: this.marginX, y: 36 },
        end: { x: this.pageWidth - this.marginX, y: 36 },
        thickness: 0.5,
        color: rgb(0.8, 0.84, 0.88)
      });
      p.drawText(sanitizePdfText(`Emitido via COEapp WhatsApp Oficial PCMG em ${generatedAt}`), {
        x: this.marginX,
        y: 22,
        size: 8,
        font: this.fontRegular,
        color: rgb(0.45, 0.5, 0.58)
      });
      const pageNum = `Pagina ${i + 1} de ${pages.length}`;
      const numW = this.fontRegular.widthOfTextAtSize(pageNum, 8);
      p.drawText(pageNum, {
        x: this.pageWidth - this.marginX - numW,
        y: 22,
        size: 8,
        font: this.fontRegular,
        color: rgb(0.45, 0.5, 0.58)
      });
    });

    const bytes = await this.doc.save();
    return Buffer.from(bytes);
  }
}

export async function generateSingleOperationReportPdf(
  report: UnifiedOperationReport
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    'RELATORIO DE OPERACAO POLICIAL',
    `${report.unidadeNome} • Data: ${formatIsoDateBr(report.dataOperacao)} • ${report.municipio}/${report.estado}`
  );
  await builder.init();
  builder.drawOperationBlock(report);
  const buffer = await builder.finalize();
  const safeSlug = report.municipio
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 28);
  return {
    buffer,
    filename: `Relatorio_Operacao_${report.origem}_${report.dataOperacao}_${safeSlug || 'PCMG'}.pdf`
  };
}

export async function generateMultipleOperationsPdf(
  reports: UnifiedOperationReport[],
  titleLabel: string,
  fileSlug: string
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    titleLabel,
    `Total de ${reports.length} relatorio(s) consolidado(s) • Emitido em ${formatIsoDateTimeBr(new Date())}`
  );
  await builder.init();
  reports.forEach((rep, idx) => {
    if (idx > 0) builder.ensureSpace(160);
    builder.drawOperationBlock(rep, idx, reports.length);
  });
  const buffer = await builder.finalize();
  return { buffer, filename: `Relatorios_Operacoes_${fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}.pdf` };
}

export async function generateSingleTrainingReportPdf(
  report: UnifiedTrainingReport
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    'RELATORIO DE TREINAMENTO POLICIAL',
    `${report.unidadeNome} • Data: ${formatIsoDateBr(report.dataTreinamento)}`
  );
  await builder.init();
  builder.drawTrainingBlock(report);
  const buffer = await builder.finalize();
  return {
    buffer,
    filename: `Relatorio_Treinamento_${report.origem}_${report.dataTreinamento}.pdf`
  };
}

export async function generateMultipleTrainingsPdf(
  reports: UnifiedTrainingReport[],
  titleLabel: string,
  fileSlug: string
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    titleLabel,
    `Total de ${reports.length} treinamento(s) consolidado(s) • Emitido em ${formatIsoDateTimeBr(new Date())}`
  );
  await builder.init();
  reports.forEach((rep, idx) => {
    if (idx > 0) builder.ensureSpace(160);
    builder.drawTrainingBlock(rep, idx, reports.length);
  });
  const buffer = await builder.finalize();
  return { buffer, filename: `Relatorios_Treinamentos_${fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}.pdf` };
}

export async function generateArmariaReceiptPdf(
  rec: UnifiedArmariaReceipt
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    `RECIBO DE ${rec.tipoLabel.toUpperCase()}`,
    `${rec.unidadeNome} • Requerente: ${rec.requerenteNome} • Status: ${rec.status}`
  );
  await builder.init();
  builder.drawReceiptBlock(rec);
  builder.drawSignatureLines(`Requerente: ${rec.requerenteNome}`, `Armeiro: ${rec.armeiroAutorizador}`);
  const buffer = await builder.finalize();
  const cleanId = rec.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  return {
    buffer,
    filename: `Recibo_${rec.tipo}_${cleanId}.pdf`
  };
}

export async function generateArmariaCautelasReportPdf(
  data: ArmariaCautelasReportData,
  unitLabel: string,
  periodLabel: string,
  fileSlug: string
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const totalCount = data.armas.length + data.municoes.length + data.materiais.length;
  const builder = new PdfReportBuilder(
    doc,
    `RELATORIO DE CAUTELAS DA ARMARIA — ${periodLabel.toUpperCase()}`,
    `Unidade: ${unitLabel} • Total: ${totalCount} cautela(s) (Armas: ${data.armas.length} | Municoes: ${data.municoes.length} | Materiais: ${data.materiais.length})`
  );
  await builder.init();

  builder.drawSectionTitle('Resumo Consolidado do Período');
  builder.drawKeyValue('Unidade(s)', unitLabel);
  builder.drawKeyValue('Período Consultado', periodLabel);
  builder.drawKeyValue('Cautelas de Armas', String(data.armas.length));
  builder.drawKeyValue('Cautelas de Munições', String(data.municoes.length));
  builder.drawKeyValue('Cautelas de Materiais', String(data.materiais.length));
  builder.drawDivider();

  if (data.armas.length > 0) {
    builder.drawSectionTitle(`1. Cautelas de Armamentos (${data.armas.length})`);
    data.armas.forEach((a, i) => builder.drawReceiptBlock(a, i, data.armas.length));
  }
  if (data.municoes.length > 0) {
    builder.drawSectionTitle(`2. Cautelas de Munições (${data.municoes.length})`);
    data.municoes.forEach((m, i) => builder.drawReceiptBlock(m, i, data.municoes.length));
  }
  if (data.materiais.length > 0) {
    builder.drawSectionTitle(`3. Cautelas de Materiais (${data.materiais.length})`);
    data.materiais.forEach((mat, i) => builder.drawReceiptBlock(mat, i, data.materiais.length));
  }

  const buffer = await builder.finalize();
  return {
    buffer,
    filename: `Relatorio_Armaria_Cautelas_${fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 44)}.pdf`
  };
}

// ============================================================================
// 5. PERÍODOS DE RELATÓRIOS (24H, ESSA SEMANA SEG->HOJE/DOM, MÊS, ANO, CUSTOM)
// ============================================================================
function getSaoPauloTodayParts(): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0=Dom..6=Sab
  isoDate: string;
} {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find(p => p.type === 'year')?.value || now.getUTCFullYear());
  const month = Number(parts.find(p => p.type === 'month')?.value || now.getUTCMonth() + 1);
  const day = Number(parts.find(p => p.type === 'day')?.value || now.getUTCDate());
  const wdStr = (parts.find(p => p.type === 'weekday')?.value || '').toLowerCase();
  const wdMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const dayOfWeek = wdMap[wdStr.slice(0, 3)] ?? new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, dayOfWeek, isoDate };
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function getRelatorioPeriodoInfo(
  periodo: RelatorioPeriodoTipo,
  isoFilter?: string
): { label: string; slug: string; startIso?: string; endIso?: string } {
  const sp = getSaoPauloTodayParts();
  if (periodo === '24H') {
    return { label: 'Últimas 24h', slug: `24h_${sp.isoDate}` };
  }
  if (periodo === 'SEMANA') {
    // Segunda-feira da semana atual até o dia atual (limite até domingo)
    const daysSinceMonday = sp.dayOfWeek === 0 ? 6 : sp.dayOfWeek - 1;
    const mondayIso = addDaysIso(sp.isoDate, -daysSinceMonday);
    const sundayIso = addDaysIso(mondayIso, 6);
    const endIso = sp.isoDate <= sundayIso ? sp.isoDate : sundayIso;
    return {
      label: `Essa semana (${formatIsoDateBr(mondayIso).slice(0, 5)} a ${formatIsoDateBr(endIso).slice(0, 5)})`,
      slug: `Semana_${mondayIso}_a_${endIso}`,
      startIso: mondayIso,
      endIso
    };
  }
  if (periodo === 'MES_ATUAL') {
    const ym = `${String(sp.year).padStart(4, '0')}-${String(sp.month).padStart(2, '0')}`;
    const mm = String(sp.month).padStart(2, '0');
    return {
      label: `Mês atual (${mm}/${sp.year})`,
      slug: `Mes_${ym}`,
      startIso: `${ym}-01`,
      endIso: `${ym}-31`
    };
  }
  if (periodo === 'ANO_ATUAL') {
    const yyyy = String(sp.year);
    return {
      label: `Ano atual (${yyyy})`,
      slug: `Ano_${yyyy}`,
      startIso: `${yyyy}-01-01`,
      endIso: `${yyyy}-12-31`
    };
  }
  if (periodo === 'MES_ANO' && isoFilter && /^\d{4}-\d{2}$/.test(isoFilter)) {
    const [yyyy, mm] = isoFilter.split('-');
    return {
      label: `${mm}/${yyyy} (${MONTH_NAMES_PT[mm] || mm})`,
      slug: `Mes_${isoFilter}`,
      startIso: `${isoFilter}-01`,
      endIso: `${isoFilter}-31`
    };
  }
  const yr = isoFilter && /^\d{4}$/.test(isoFilter) ? isoFilter : String(sp.year);
  return {
    label: `Ano ${yr}`,
    slug: `Ano_${yr}`,
    startIso: `${yr}-01-01`,
    endIso: `${yr}-12-31`
  };
}

export async function findOperationReportsByPeriod(
  pool: any,
  periodo: RelatorioPeriodoTipo,
  unitIds?: string[],
  isoFilter?: string
): Promise<{ reports: UnifiedOperationReport[]; periodLabel: string; periodSlug: string }> {
  const info = getRelatorioPeriodoInfo(periodo, isoFilter);
  if (periodo === '24H') {
    const reports = await findOperationReportsLast24h(pool, unitIds);
    return { reports, periodLabel: info.label, periodSlug: info.slug };
  }
  const startIso = info.startIso || '2000-01-01';
  const endIso = info.endIso || '2099-12-31';
  const uClause = buildUnitInClause('r.UNIDADE_ID', unitIds);

  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_OPERACAO >= ? AND r.DATA_OPERACAO <= ?${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC LIMIT 120`,
      [startIso, endIso, ...uClause.params]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_OPERACAO >= ? AND r.DATA_OPERACAO <= ?${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC LIMIT 120`,
      [startIso, endIso, ...uClause.params]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CAT r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_OPERACAO >= ? AND r.DATA_OPERACAO <= ?${uClause.sql}
       ORDER BY r.DATA_OPERACAO DESC, r.HORARIO_VOO_OPERACAO DESC LIMIT 120`,
      [startIso, endIso, ...uClause.params]
    )
  ]);

  const reports = [
    ...canilRows.map(mapCanilOpRow),
    ...polRows.map(mapPolicialOpRow),
    ...catRows.map(mapCatOpRow)
  ].sort((a, b) => `${b.dataOperacao} ${b.horaOperacao}`.localeCompare(`${a.dataOperacao} ${a.horaOperacao}`));

  return { reports, periodLabel: info.label, periodSlug: info.slug };
}

export async function findTrainingReportsByPeriod(
  pool: any,
  periodo: RelatorioPeriodoTipo,
  unitIds?: string[],
  isoFilter?: string
): Promise<{ reports: UnifiedTrainingReport[]; periodLabel: string; periodSlug: string }> {
  const info = getRelatorioPeriodoInfo(periodo, isoFilter);
  if (periodo === '24H') {
    const reports = await findTrainingReportsLast24h(pool, unitIds);
    return { reports, periodLabel: info.label, periodSlug: info.slug };
  }
  const startIso = info.startIso || '2000-01-01';
  const endIso = info.endIso || '2099-12-31';
  const uClause = buildUnitInClause('r.UNIDADE_ID', unitIds);

  const [canilRows, polRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_TREINAMENTO_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_TREINAMENTO >= ? AND r.DATA_TREINAMENTO <= ?${uClause.sql}
       ORDER BY r.DATA_TREINAMENTO DESC, r.HORA_TREINAMENTO DESC LIMIT 120`,
      [startIso, endIso, ...uClause.params]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_TREINAMENTO_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_TREINAMENTO >= ? AND r.DATA_TREINAMENTO <= ?${uClause.sql}
       ORDER BY r.DATA_TREINAMENTO DESC, r.DATA_CRIACAO DESC LIMIT 120`,
      [startIso, endIso, ...uClause.params]
    )
  ]);

  const reports = [...canilRows.map(mapCanilTrainingRow), ...polRows.map(mapPolicialTrainingRow)].sort((a, b) =>
    `${b.dataTreinamento} ${b.horaTreinamento}`.localeCompare(`${a.dataTreinamento} ${a.horaTreinamento}`)
  );
  return { reports, periodLabel: info.label, periodSlug: info.slug };
}

// ============================================================================
// 6. ARMARIA COMPLETA — CAUTELAS (4 CATEGORIAS) & COFRES / INVENTÁRIO
// ============================================================================
export const ARMARIA_CATEGORIA_META: Record<
  ArmariaCategoria,
  { label: string; singular: string; unitButtonLabel: string }
> = {
  ARMAS: { label: 'Armas', singular: 'Arma', unitButtonLabel: 'Armas da Unidade' },
  MUNICOES: { label: 'Munições', singular: 'Munição', unitButtonLabel: 'Munições da Unidade' },
  EXPLOSIVOS: { label: 'Explosivos', singular: 'Explosivo', unitButtonLabel: 'Explosivos Unidade' },
  MATERIAIS: { label: 'Materiais', singular: 'Material', unitButtonLabel: 'Materiais Unidade' }
};

function mapExplosivoReceiptRow(r: any): UnifiedArmariaReceipt {
  return {
    tipo: 'EXPLOSIVOS',
    tipoLabel: 'Cautela / Movimentação de Explosivos',
    id: String(r.ID_MOVIMENTACOES_EXPLOSIVOS),
    protocolo: String(r.ID_MOVIMENTACOES_EXPLOSIVOS).slice(0, 26),
    unidadeId: String(r.UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS || ''),
    unidadeNome: String(r.UNIDADE_NOME_JOIN || 'Unidade'),
    requerenteId: String(r.RESPONSAVEL_ID_MOVIMENTACOES_EXPLOSIVOS || ''),
    requerenteNome: String(r.RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS || 'Não informado'),
    requerenteMasp: String(r.RESPONSAVEL_MASP_MOVIMENTACOES_EXPLOSIVOS || ''),
    requerenteCargo: '',
    itemTitulo: String(r.NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS || 'Explosivo'),
    itemSubtitulo: String(r.LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS || r.LOCAL_ORIGEM_DESTINO_MOVIMENTACOES_EXPLOSIVOS || ''),
    quantidade: `${r.QUANTIDADE_MOVIMENTACOES_EXPLOSIVOS ?? 0} ${r.UNIDADE_MEDIDA_MOVIMENTACOES_EXPLOSIVOS || 'unid.'}`,
    status: String(r.TIPO_MOVIMENTACAO_EXPLOSIVOS || 'Saída / Cautela'),
    dataSolicitacao: r.DATA_MOVIMENTACAO_EXPLOSIVOS ? String(r.DATA_MOVIMENTACAO_EXPLOSIVOS) : '',
    dataAutorizacao: r.DATA_MOVIMENTACAO_EXPLOSIVOS ? String(r.DATA_MOVIMENTACAO_EXPLOSIVOS) : '',
    dataDevolucao: '',
    armeiroAutorizador: String(r.RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS || '—'),
    armeiroRecebimento: '—',
    finalidade: String(r.MOTIVO_MOVIMENTACOES_EXPLOSIVOS || 'Operação Especial'),
    observacoes: String(r.OBSERVACOES_MOVIMENTACOES_EXPLOSIVOS || ''),
    extras: [
      { label: 'Local / Cofre', value: String(r.LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS || '—') },
      { label: 'Origem / Destino', value: String(r.LOCAL_ORIGEM_DESTINO_MOVIMENTACOES_EXPLOSIVOS || '—') }
    ]
  };
}

function buildDateFilterCondition(dateCol: string, granularity?: 'MES' | 'ANO', isoFilter?: string): { sql: string; params: any[] } {
  if (!granularity || !isoFilter) return { sql: '', params: [] };
  if (granularity === 'MES' && /^\d{4}-\d{2}$/.test(isoFilter)) {
    const [yyyy, mm] = isoFilter.split('-');
    return {
      sql: ` AND YEAR(${dateCol}) = ? AND MONTH(${dateCol}) = ?`,
      params: [Number(yyyy), Number(mm)]
    };
  }
  if (granularity === 'ANO' && /^\d{4}$/.test(isoFilter)) {
    return {
      sql: ` AND YEAR(${dateCol}) = ?`,
      params: [Number(isoFilter)]
    };
  }
  return { sql: '', params: [] };
}

export async function findUserCautelasByCategory(
  pool: any,
  categoria: ArmariaCategoria,
  targetUser: { id?: string; masp?: string; name?: string },
  options: { onlyActive?: boolean; granularity?: 'MES' | 'ANO'; isoFilter?: string } = {}
): Promise<UnifiedArmariaReceipt[]> {
  const uid = String(targetUser.id || '').trim();
  const masp = String(targetUser.masp || '').trim();
  const name = String(targetUser.name || '').trim();

  if (categoria === 'ARMAS') {
    const activeSql = options.onlyActive
      ? " AND UPPER(COALESCE(a.STATUS_ACAUTELAR_ARMAS, '')) NOT IN ('DEVOLVIDA', 'RECUSADA', 'CANCELADA')"
      : '';
    const dt = buildDateFilterCondition('a.DATA_SOLICITACAO_ACAUTELAR_ARMAS', options.granularity, options.isoFilter);
    const rows = await safeQuery(
      pool,
      `SELECT a.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_ARMAS a
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ACAUTELAR_ARMAS
       WHERE (a.REQUERENTE_ID_ACAUTELAR_ARMAS = ? OR (? <> '' AND a.REQUERENTE_MASP_ACAUTELAR_ARMAS = ?) OR (? <> '' AND LOWER(a.REQUERENTE_NOME_ACAUTELAR_ARMAS) = LOWER(?)))${activeSql}${dt.sql}
       ORDER BY a.DATA_SOLICITACAO_ACAUTELAR_ARMAS DESC LIMIT 120`,
      [uid, masp, masp, name, name, ...dt.params]
    );
    return rows.map(mapWeaponReceiptRow);
  }

  if (categoria === 'MUNICOES') {
    const activeSql = options.onlyActive
      ? " AND UPPER(COALESCE(m.STATUS_ACAUTELAR_MUNICOES, '')) NOT IN ('DEVOLVIDA', 'CONSUMIDA', 'RECUSADA', 'CANCELADA')"
      : '';
    const dt = buildDateFilterCondition('m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES', options.granularity, options.isoFilter);
    const rows = await safeQuery(
      pool,
      `SELECT m.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_MUNICOES m
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_ACAUTELAR_MUNICOES
       WHERE (m.REQUERENTE_ID_ACAUTELAR_MUNICOES = ? OR (? <> '' AND m.REQUERENTE_MASP_ACAUTELAR_MUNICOES = ?) OR (? <> '' AND LOWER(m.REQUERENTE_NOME_ACAUTELAR_MUNICOES) = LOWER(?)))${activeSql}${dt.sql}
       ORDER BY m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES DESC LIMIT 120`,
      [uid, masp, masp, name, name, ...dt.params]
    );
    return rows.map(mapAmmoReceiptRow);
  }

  if (categoria === 'MATERIAIS') {
    const activeSql = options.onlyActive
      ? " AND LOWER(COALESCE(cm.STATUS_CAUTELAS_MATERIAIS, '')) NOT IN ('devolvido', 'consumido', 'devolvido com anomalia', 'recusada', 'cancelada')"
      : '';
    const dt = buildDateFilterCondition('cm.DATA_RETIRADA_CAUTELAS_MATERIAIS', options.granularity, options.isoFilter);
    const rows = await safeQuery(
      pool,
      `SELECT cm.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM CAUTELAS_MATERIAIS cm
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = cm.UNIDADE_ID_CAUTELAS_MATERIAIS
       WHERE (cm.USUARIO_INTERNO_ID_CAUTELAS_MATERIAIS = ? OR (? <> '' AND cm.USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS = ?) OR (? <> '' AND LOWER(cm.USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS) = LOWER(?)))${activeSql}${dt.sql}
       ORDER BY cm.DATA_RETIRADA_CAUTELAS_MATERIAIS DESC LIMIT 120`,
      [uid, masp, masp, name, name, ...dt.params]
    );
    return rows.map(mapMaterialReceiptRow);
  }

  // EXPLOSIVOS
  const dt = buildDateFilterCondition('mv.DATA_MOVIMENTACAO_EXPLOSIVOS', options.granularity, options.isoFilter);
  const rows = await safeQuery(
    pool,
    `SELECT mv.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
     FROM MOVIMENTACOES_EXPLOSIVOS mv
     LEFT JOIN UNIDADES u ON u.ID_UNIDADES = mv.UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS
     WHERE (mv.RESPONSAVEL_ID_MOVIMENTACOES_EXPLOSIVOS = ? OR (? <> '' AND mv.RESPONSAVEL_MASP_MOVIMENTACOES_EXPLOSIVOS = ?) OR (? <> '' AND LOWER(mv.RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS) = LOWER(?)))${dt.sql}
     ORDER BY mv.DATA_MOVIMENTACAO_EXPLOSIVOS DESC LIMIT 120`,
    [uid, masp, masp, name, name, ...dt.params]
  );

  if (!options.onlyActive) {
    return rows.map(mapExplosivoReceiptRow);
  }

  // Considera cautela ativa de explosivos quando há saldo líquido em posse do responsável
  const netByExplosivo = new Map<string, number>();
  for (const r of rows) {
    const expId = String(r.EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS || r.NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS || '');
    const tipo = String(r.TIPO_MOVIMENTACAO_EXPLOSIVOS || '').toLowerCase();
    const qty = Number(r.QUANTIDADE_MOVIMENTACOES_EXPLOSIVOS || 0);
    if (tipo.includes('cautela') || tipo === 'saída' || tipo === 'saida') {
      netByExplosivo.set(expId, (netByExplosivo.get(expId) || 0) + qty);
    } else if (tipo.includes('devolu') || tipo.includes('retorno') || tipo.includes('consumo') || tipo.includes('destrui')) {
      netByExplosivo.set(expId, (netByExplosivo.get(expId) || 0) - qty);
    }
  }
  const activeRows = rows.filter(r => {
    const expId = String(r.EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS || r.NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS || '');
    const tipo = String(r.TIPO_MOVIMENTACAO_EXPLOSIVOS || '').toLowerCase();
    return (tipo.includes('cautela') || tipo === 'saída' || tipo === 'saida') && (netByExplosivo.get(expId) || 0) > 0;
  });
  return activeRows.map(mapExplosivoReceiptRow);
}

export async function findUnitCautelasByCategoryAndPeriod(
  pool: any,
  categoria: ArmariaCategoria,
  granularity: 'MES' | 'ANO',
  isoFilter: string,
  unitIds?: string[]
): Promise<UnifiedArmariaReceipt[]> {
  if (categoria === 'ARMAS') {
    const uClause = buildUnitInClause('a.UNIDADE_ID_ACAUTELAR_ARMAS', unitIds);
    const dt = buildDateFilterCondition('a.DATA_SOLICITACAO_ACAUTELAR_ARMAS', granularity, isoFilter);
    const rows = await safeQuery(
      pool,
      `SELECT a.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_ARMAS a
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ACAUTELAR_ARMAS
       WHERE 1=1${dt.sql}${uClause.sql}
       ORDER BY a.DATA_SOLICITACAO_ACAUTELAR_ARMAS DESC LIMIT 180`,
      [...dt.params, ...uClause.params]
    );
    return rows.map(mapWeaponReceiptRow);
  }

  if (categoria === 'MUNICOES') {
    const uClause = buildUnitInClause('m.UNIDADE_ID_ACAUTELAR_MUNICOES', unitIds);
    const dt = buildDateFilterCondition('m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES', granularity, isoFilter);
    const rows = await safeQuery(
      pool,
      `SELECT m.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ACAUTELAR_MUNICOES m
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_ACAUTELAR_MUNICOES
       WHERE 1=1${dt.sql}${uClause.sql}
       ORDER BY m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES DESC LIMIT 180`,
      [...dt.params, ...uClause.params]
    );
    return rows.map(mapAmmoReceiptRow);
  }

  if (categoria === 'MATERIAIS') {
    const uClause = buildUnitInClause('cm.UNIDADE_ID_CAUTELAS_MATERIAIS', unitIds);
    const dt = buildDateFilterCondition('cm.DATA_RETIRADA_CAUTELAS_MATERIAIS', granularity, isoFilter);
    const rows = await safeQuery(
      pool,
      `SELECT cm.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM CAUTELAS_MATERIAIS cm
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = cm.UNIDADE_ID_CAUTELAS_MATERIAIS
       WHERE 1=1${dt.sql}${uClause.sql}
       ORDER BY cm.DATA_RETIRADA_CAUTELAS_MATERIAIS DESC LIMIT 180`,
      [...dt.params, ...uClause.params]
    );
    return rows.map(mapMaterialReceiptRow);
  }

  const uClause = buildUnitInClause('mv.UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS', unitIds);
  const dt = buildDateFilterCondition('mv.DATA_MOVIMENTACAO_EXPLOSIVOS', granularity, isoFilter);
  const rows = await safeQuery(
    pool,
    `SELECT mv.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
     FROM MOVIMENTACOES_EXPLOSIVOS mv
     LEFT JOIN UNIDADES u ON u.ID_UNIDADES = mv.UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS
     WHERE 1=1${dt.sql}${uClause.sql}
     ORDER BY mv.DATA_MOVIMENTACAO_EXPLOSIVOS DESC LIMIT 180`,
    [...dt.params, ...uClause.params]
  );
  return rows.map(mapExplosivoReceiptRow);
}

export async function listAvailableCautelaPeriods(
  pool: any,
  categoria: ArmariaCategoria,
  options: {
    targetUser?: { id?: string; masp?: string; name?: string };
    unitIds?: string[];
    granularity: 'MES' | 'ANO';
  }
): Promise<AvailableDateOption[]> {
  const fmtExpr = options.granularity === 'MES' ? '%Y-%m' : '%Y';
  let table = 'ACAUTELAR_ARMAS';
  let dateCol = 'DATA_SOLICITACAO_ACAUTELAR_ARMAS';
  let unitCol = 'UNIDADE_ID_ACAUTELAR_ARMAS';
  let userWhere = '';
  const params: any[] = [fmtExpr];

  if (categoria === 'MUNICOES') {
    table = 'ACAUTELAR_MUNICOES';
    dateCol = 'DATA_SOLICITACAO_ACAUTELAR_MUNICOES';
    unitCol = 'UNIDADE_ID_ACAUTELAR_MUNICOES';
  } else if (categoria === 'MATERIAIS') {
    table = 'CAUTELAS_MATERIAIS';
    dateCol = 'DATA_RETIRADA_CAUTELAS_MATERIAIS';
    unitCol = 'UNIDADE_ID_CAUTELAS_MATERIAIS';
  } else if (categoria === 'EXPLOSIVOS') {
    table = 'MOVIMENTACOES_EXPLOSIVOS';
    dateCol = 'DATA_MOVIMENTACAO_EXPLOSIVOS';
    unitCol = 'UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS';
  }

  if (options.targetUser) {
    const uid = String(options.targetUser.id || '').trim();
    const masp = String(options.targetUser.masp || '').trim();
    const name = String(options.targetUser.name || '').trim();
    if (categoria === 'ARMAS') {
      userWhere = ' AND (REQUERENTE_ID_ACAUTELAR_ARMAS = ? OR (? <> "" AND REQUERENTE_MASP_ACAUTELAR_ARMAS = ?) OR (? <> "" AND LOWER(REQUERENTE_NOME_ACAUTELAR_ARMAS) = LOWER(?)))';
    } else if (categoria === 'MUNICOES') {
      userWhere = ' AND (REQUERENTE_ID_ACAUTELAR_MUNICOES = ? OR (? <> "" AND REQUERENTE_MASP_ACAUTELAR_MUNICOES = ?) OR (? <> "" AND LOWER(REQUERENTE_NOME_ACAUTELAR_MUNICOES) = LOWER(?)))';
    } else if (categoria === 'MATERIAIS') {
      userWhere = ' AND (USUARIO_INTERNO_ID_CAUTELAS_MATERIAIS = ? OR (? <> "" AND USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS = ?) OR (? <> "" AND LOWER(USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS) = LOWER(?)))';
    } else {
      userWhere = ' AND (RESPONSAVEL_ID_MOVIMENTACOES_EXPLOSIVOS = ? OR (? <> "" AND RESPONSAVEL_MASP_MOVIMENTACOES_EXPLOSIVOS = ?) OR (? <> "" AND LOWER(RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS) = LOWER(?)))';
    }
    params.push(uid, masp, masp, name, name);
  }

  const uClause = buildUnitInClause(unitCol, options.unitIds);
  params.push(...uClause.params);

  const rows = await safeQuery(
    pool,
    `SELECT DATE_FORMAT(${dateCol}, ?) AS dt, COUNT(*) AS cnt
     FROM ${table}
     WHERE ${dateCol} IS NOT NULL${userWhere}${uClause.sql}
     GROUP BY dt
     ORDER BY dt DESC
     LIMIT 8`,
    params
  );

  return rows
    .filter(r => r.dt)
    .map(r => {
      const value = String(r.dt);
      let label = value;
      if (options.granularity === 'MES') {
        const [yyyy, mm] = value.split('-');
        label = `${mm}/${yyyy} (${MONTH_NAMES_PT[mm] || mm})`;
      }
      return { value, label, count: Number(r.cnt || 0) };
    });
}

export async function generateCategoryCautelasPdf(
  categoria: ArmariaCategoria,
  items: UnifiedArmariaReceipt[],
  title: string,
  subtitle: string,
  fileSlug: string
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const meta = ARMARIA_CATEGORIA_META[categoria];
  const builder = new PdfReportBuilder(doc, title, subtitle);
  await builder.init();

  builder.drawSectionTitle(`Resumo — ${meta.label}`);
  builder.drawKeyValue('Categoria', meta.label);
  builder.drawKeyValue('Total de Registros', String(items.length));
  builder.drawDivider();

  items.forEach((item, idx) => {
    builder.drawReceiptBlock(item, idx, items.length);
  });

  const buffer = await builder.finalize();
  return {
    buffer,
    filename: `Cautelas_${categoria}_${fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 46)}.pdf`
  };
}

export interface VaultInventoryItem {
  titulo: string;
  subtitulo: string;
  quantidade: string;
  status: string;
  detalhes: string;
}

export interface VaultInventoryCofreGroup {
  cofreLabel: string;
  itens: VaultInventoryItem[];
}

export interface VaultInventoryUnitGroup {
  unidadeId: string;
  unidadeNome: string;
  totalItens: number;
  cofres: VaultInventoryCofreGroup[];
}

export async function findVaultInventoryByCategory(
  pool: any,
  categoria: ArmariaCategoria,
  unitIds?: string[]
): Promise<{ groups: VaultInventoryUnitGroup[]; totalRecords: number }> {
  const unitMap = new Map<string, { unidadeId: string; unidadeNome: string; cofreMap: Map<string, VaultInventoryItem[]> }>();

  const pushItem = (unidadeId: string, unidadeNome: string, cofreLabel: string, item: VaultInventoryItem) => {
    const uKey = unidadeId || unidadeNome || 'SEM_UNIDADE';
    if (!unitMap.has(uKey)) {
      unitMap.set(uKey, {
        unidadeId: unidadeId || '',
        unidadeNome: unidadeNome || 'Unidade Não Informada',
        cofreMap: new Map()
      });
    }
    const uEntry = unitMap.get(uKey)!;
    const cKey = cofreLabel || 'Sem Cofre / Local Vinculado';
    if (!uEntry.cofreMap.has(cKey)) uEntry.cofreMap.set(cKey, []);
    uEntry.cofreMap.get(cKey)!.push(item);
  };

  let totalRecords = 0;

  if (categoria === 'ARMAS') {
    const uClause = buildUnitInClause('a.UNIDADE_ID_ARMAS', unitIds);
    const rows = await safeQuery(
      pool,
      `SELECT a.*, c.CODIGO_COFRES, c.DESCRICAO_CURTA_COFRES, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ARMAS a
       LEFT JOIN COFRES c ON c.ID_COFRES = a.COFRE_ID_ARMAS
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = a.UNIDADE_ID_ARMAS
       WHERE 1=1${uClause.sql}
       ORDER BY u.NOME_UNIDADES ASC, c.CODIGO_COFRES ASC, a.TIPO_ARMAS ASC, a.MODELO_ARMAS ASC`,
      uClause.params
    );
    totalRecords = rows.length;
    for (const r of rows) {
      const cofreLabel = r.CODIGO_COFRES
        ? `Cofre ${r.CODIGO_COFRES}${r.DESCRICAO_CURTA_COFRES ? ` — ${r.DESCRICAO_CURTA_COFRES}` : ''}`
        : 'Sem Cofre Vinculado';
      pushItem(String(r.UNIDADE_ID_ARMAS || ''), String(r.UNIDADE_NOME_JOIN || 'Unidade'), cofreLabel, {
        titulo: `${r.TIPO_ARMAS || 'Arma'} ${r.MODELO_ARMAS || ''} (${r.FABRICANTE_ARMAS || 'N/D'})`.trim(),
        subtitulo: `Calibre: ${r.CALIBRE_ARMAS || '—'} | Série: ${r.NUMERO_SERIE_ARMAS || 'S/N'}`,
        quantidade: `${r.QUANTIDADE_CARREGADORES_ARMAS ?? 0} carregador(es)`,
        status: String(r.STATUS_ARMAS || 'Disponível'),
        detalhes: r.POLICIAL_ACAUTELADO_ARMAS
          ? `Acautelada com: ${r.POLICIAL_ACAUTELADO_ARMAS} | Tiros: ${r.TIROS_DISPARADOS_ARMAS ?? 0}`
          : `Tiros registrados: ${r.TIROS_DISPARADOS_ARMAS ?? 0}`
      });
    }
  } else if (categoria === 'MUNICOES') {
    const uClause = buildUnitInClause('e.UNIDADE_ID_ESTOQUE_MUNICOES', unitIds);
    const rows = await safeQuery(
      pool,
      `SELECT e.*, cal.NOME_CALIBRES, cal.FABRICANTE_CALIBRES, c.CODIGO_COFRES, c.DESCRICAO_CURTA_COFRES, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM ESTOQUE_MUNICOES e
       LEFT JOIN CALIBRES cal ON cal.ID_CALIBRES = e.CALIBRE_ID_ESTOQUE_MUNICOES
       LEFT JOIN COFRES c ON c.ID_COFRES = e.COFRE_ID_ESTOQUE_MUNICOES
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = e.UNIDADE_ID_ESTOQUE_MUNICOES
       WHERE 1=1${uClause.sql}
       ORDER BY u.NOME_UNIDADES ASC, c.CODIGO_COFRES ASC, cal.NOME_CALIBRES ASC`,
      uClause.params
    );
    totalRecords = rows.length;
    for (const r of rows) {
      const cofreLabel = r.CODIGO_COFRES
        ? `Cofre ${r.CODIGO_COFRES}${r.DESCRICAO_CURTA_COFRES ? ` — ${r.DESCRICAO_CURTA_COFRES}` : ''}`
        : 'Sem Cofre Vinculado';
      pushItem(String(r.UNIDADE_ID_ESTOQUE_MUNICOES || ''), String(r.UNIDADE_NOME_JOIN || 'Unidade'), cofreLabel, {
        titulo: `Calibre ${r.NOME_CALIBRES || r.CALIBRE_ID_ESTOQUE_MUNICOES || 'N/D'} — ${r.TIPO_MUNICAO || 'Padrão'}`,
        subtitulo: `Fabricante: ${r.FABRICANTE_MUNICAO || r.FABRICANTE_CALIBRES || '—'} | Lote: ${r.LOTE_MUNICAO || '—'}`,
        quantidade: `${r.QUANTIDADE_ESTOQUE_MUNICOES ?? 0} unid.`,
        status: String(r.DESTINACAO_MUNICAO || 'Estoque'),
        detalhes: `Peso: ${r.PESO_MUNICAO || '—'} | Ano Fab.: ${r.ANO_FABRICACAO_MUNICAO || '—'}`
      });
    }
  } else if (categoria === 'EXPLOSIVOS') {
    const uClause = buildUnitInClause('ex.UNIDADE_ID_EXPLOSIVOS', unitIds);
    const rows = await safeQuery(
      pool,
      `SELECT ex.*, c.CODIGO_COFRES, c.DESCRICAO_CURTA_COFRES, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM EXPLOSIVOS ex
       LEFT JOIN COFRES c ON c.ID_COFRES = ex.COFRE_ID_EXPLOSIVOS
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = ex.UNIDADE_ID_EXPLOSIVOS
       WHERE 1=1${uClause.sql}
       ORDER BY u.NOME_UNIDADES ASC, c.CODIGO_COFRES ASC, ex.NOME_EXPLOSIVOS ASC`,
      uClause.params
    );
    totalRecords = rows.length;
    for (const r of rows) {
      const cofreLabel = r.CODIGO_COFRES
        ? `Cofre ${r.CODIGO_COFRES}${r.DESCRICAO_CURTA_COFRES ? ` — ${r.DESCRICAO_CURTA_COFRES}` : ''}`
        : r.LOCAL_ARMAZENAMENTO_EXPLOSIVOS
        ? `Local: ${r.LOCAL_ARMAZENAMENTO_EXPLOSIVOS}`
        : 'Sem Cofre / Paiol Vinculado';
      pushItem(String(r.UNIDADE_ID_EXPLOSIVOS || ''), String(r.UNIDADE_NOME_JOIN || 'Unidade'), cofreLabel, {
        titulo: `${r.NOME_EXPLOSIVOS || 'Explosivo'} (${r.TIPO_EXPLOSIVOS || '—'})`,
        subtitulo: `Lote: ${r.LOTE_EXPLOSIVOS || '—'} | Risco: ${r.CLASSE_RISCO_EXPLOSIVOS || '—'}`,
        quantidade: `${r.QUANTIDADE_EXPLOSIVOS ?? 0} ${r.UNIDADE_MEDIDA_EXPLOSIVOS || 'unid.'}`,
        status: String(r.STATUS_EXPLOSIVOS || 'Disponível'),
        detalhes: `Fabricante: ${r.FABRICANTE_EXPLOSIVOS || '—'} | Validade: ${r.DATA_VALIDADE_EXPLOSIVOS ? formatIsoDateBr(String(r.DATA_VALIDADE_EXPLOSIVOS)) : '—'}`
      });
    }
  } else {
    const uClause = buildUnitInClause('m.UNIDADE_ID_MATERIAIS', unitIds);
    const rows = await safeQuery(
      pool,
      `SELECT m.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM MATERIAIS m
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = m.UNIDADE_ID_MATERIAIS
       WHERE 1=1${uClause.sql}
       ORDER BY COALESCE(u.NOME_UNIDADES, m.UNIDADE_NOME_MATERIAIS) ASC, m.LOCAL_GUARDA_MATERIAIS ASC, m.NOME_MATERIAIS ASC`,
      uClause.params
    );
    totalRecords = rows.length;
    for (const r of rows) {
      const cofreLabel = r.LOCAL_GUARDA_MATERIAIS ? `Cofre / Local: ${r.LOCAL_GUARDA_MATERIAIS}` : 'Sem Cofre / Local Informado';
      pushItem(
        String(r.UNIDADE_ID_MATERIAIS || ''),
        String(r.UNIDADE_NOME_JOIN || r.UNIDADE_NOME_MATERIAIS || 'Unidade'),
        cofreLabel,
        {
          titulo: `${r.NOME_MATERIAIS || 'Material'} (${r.TIPO_MATERIAL_NOME_MATERIAIS || 'Geral'})`,
          subtitulo: r.NUMERO_SERIE_MATERIAIS ? `Série: ${r.NUMERO_SERIE_MATERIAIS}` : 'Sem nº série',
          quantidade: `Total: ${r.QUANTIDADE_MATERIAIS ?? 0} | Disp.: ${r.QUANTIDADE_DISPONIVEL_MATERIAIS ?? 0} | Uso: ${r.QUANTIDADE_EM_USO_MATERIAIS ?? 0}`,
          status: Number(r.QUANTIDADE_DISPONIVEL_MATERIAIS || 0) > 0 ? 'Disponível' : 'Sem Disponível',
          detalhes: r.VALIDADE_MATERIAIS ? `Validade: ${formatIsoDateBr(String(r.VALIDADE_MATERIAIS))}` : 'Sem validade definida'
        }
      );
    }
  }

  const groups: VaultInventoryUnitGroup[] = Array.from(unitMap.values()).map(u => {
    const cofres: VaultInventoryCofreGroup[] = Array.from(u.cofreMap.entries()).map(([cofreLabel, itens]) => ({
      cofreLabel,
      itens
    }));
    const totalItens = cofres.reduce((acc, c) => acc + c.itens.length, 0);
    return {
      unidadeId: u.unidadeId,
      unidadeNome: u.unidadeNome,
      totalItens,
      cofres
    };
  });

  return { groups, totalRecords };
}

export async function generateUnitVaultInventoryPdf(
  categoria: ArmariaCategoria,
  groups: VaultInventoryUnitGroup[],
  totalRecords: number,
  unitLabel: string,
  fileSlug: string
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const meta = ARMARIA_CATEGORIA_META[categoria];
  const totalCofres = groups.reduce((acc, g) => acc + g.cofres.length, 0);
  const builder = new PdfReportBuilder(
    doc,
    `INVENTARIO POR COFRES — ${meta.label.toUpperCase()}`,
    `Abrangencia: ${unitLabel} • ${groups.length} unidade(s) • ${totalCofres} cofre(s)/local(is) • ${totalRecords} registro(s)`
  );
  await builder.init();

  builder.drawKpiCards([
    { label: 'Categoria', value: meta.label, accent: [0.06, 0.48, 0.36] },
    { label: 'Unidades', value: String(groups.length), accent: [0.12, 0.4, 0.72] },
    { label: 'Cofres / Locais', value: String(totalCofres), accent: [0.85, 0.58, 0.08] },
    { label: 'Registros', value: String(totalRecords), accent: [0.35, 0.25, 0.72] }
  ]);

  for (const unit of groups) {
    builder.drawSectionTitle(`UNIDADE: ${unit.unidadeNome} (${unit.totalItens} item(ns))`);
    for (const cofre of unit.cofres) {
      builder.ensureSpace(42);
      const { bold, regular } = builder.getFonts();
      const { marginX, contentWidth } = builder.getMetrics();
      const page = builder.getPage();
      let y = builder.getMetrics().cursorY;

      page.drawRectangle({
        x: marginX + 4,
        y: y - 3,
        width: contentWidth - 8,
        height: 15,
        color: rgb(0.96, 0.94, 0.88)
      });
      page.drawText(sanitizePdfText(`${cofre.cofreLabel} (${cofre.itens.length} registro(s))`).slice(0, 88), {
        x: marginX + 10,
        y: y + 1,
        size: 8.8,
        font: bold,
        color: rgb(0.35, 0.24, 0.04)
      });
      builder.setCursorY(y - 16);

      cofre.itens.forEach((it, idx) => {
        builder.ensureSpace(34);
        const curPage = builder.getPage();
        const curY = builder.getMetrics().cursorY;
        const line1 = `${idx + 1}. ${it.titulo}  [${it.status}]`;
        const line2 = `${it.subtitulo}  |  ${it.quantidade}${it.detalhes ? `  |  ${it.detalhes}` : ''}`;

        curPage.drawText(sanitizePdfText(line1).slice(0, 96), {
          x: marginX + 10,
          y: curY,
          size: 8.8,
          font: bold,
          color: rgb(0.1, 0.14, 0.2)
        });
        curPage.drawText(sanitizePdfText(line2).slice(0, 110), {
          x: marginX + 16,
          y: curY - 11,
          size: 8,
          font: regular,
          color: rgb(0.3, 0.36, 0.44)
        });
        builder.setCursorY(curY - 25);
      });
      builder.setCursorY(builder.getMetrics().cursorY - 4);
    }
    builder.drawDivider();
  }

  const buffer = await builder.finalize();
  return {
    buffer,
    filename: `Cofres_${categoria}_${fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 44)}.pdf`
  };
}

// ============================================================================
// 7. FICHA DE DESEMPENHO — MINHA FICHA (FÍSICO+TÁTICO) & UNIDADE (GRÁFICO + 1/FOLHA)
// ============================================================================
interface PerformanceResultItem {
  id: string;
  categoria: DesempenhoCategoria;
  marcadorNome: string;
  tipoMarca: string;
  unidadeMedida: string;
  atividadeNome: string;
  grupoNome: string;
  dataAvaliacao: string;
  valorMarca: number | null;
  tempoSegundos: number | null;
  notaObtida: number;
  notaMinRef: number;
  notaMaxRef: number;
  notaAprovacaoRef: number;
  aprovado: boolean;
  ausente: boolean;
  ausenciaInformada: boolean | null;
  teveTiro: boolean;
  tipoArma: string;
  tirosEfetuados: number | null;
  percentual: number;
}

interface PerformanceUserProfile {
  id: string;
  name: string;
  masp: string;
  cargo: string;
  unidadeId: string;
  unidadeNome: string;
  departamentoNome: string;
  photoUrl: string | null;
  results: PerformanceResultItem[];
}

function computePercentualScore(nota: number, minRef: number, maxRef: number): number {
  const span = maxRef - minRef;
  if (!Number.isFinite(span) || span <= 0) {
    return Math.max(0, Math.min(100, Number.isFinite(nota) ? nota * 10 : 0));
  }
  const pct = ((nota - minRef) / span) * 100;
  return Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
}

function formatSecondsToMmSs(sec: number | null): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const total = Math.max(0, Math.round(sec));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function mapPerfResultRow(r: any): PerformanceResultItem {
  const notaObtida = Number(r.NOTA_OBTIDA || 0);
  const notaMinRef = Number(r.NOTA_MIN_REF ?? 0);
  const notaMaxRef = Number(r.NOTA_MAX_REF ?? 10);
  const notaAprovacaoRef = Number(r.NOTA_APROVACAO_REF ?? 6);
  const ausente = Boolean(Number(r.AUSENTE || 0));
  return {
    id: String(r.ID_RESULTADO),
    categoria: String(r.CATEGORIA || 'FISICO').toUpperCase() === 'TATICO' ? 'TATICO' : 'FISICO',
    marcadorNome: String(r.MARCADOR_NOME || 'Marcador'),
    tipoMarca: String(r.TIPO_MARCA || ''),
    unidadeMedida: String(r.UNIDADE_MEDIDA || ''),
    atividadeNome: String(r.ATIVIDADE_NOME || 'Atividade'),
    grupoNome: String(r.GRUPO_NOME || ''),
    dataAvaliacao: String(r.DATA_AVALIACAO || '').slice(0, 10),
    valorMarca: r.VALOR_MARCA !== null && r.VALOR_MARCA !== undefined ? Number(r.VALOR_MARCA) : null,
    tempoSegundos: r.TEMPO_SEGUNDOS !== null && r.TEMPO_SEGUNDOS !== undefined ? Number(r.TEMPO_SEGUNDOS) : null,
    notaObtida,
    notaMinRef,
    notaMaxRef,
    notaAprovacaoRef,
    aprovado: !ausente && Boolean(Number(r.APROVADO || 0)),
    ausente,
    ausenciaInformada:
      r.AUSENCIA_INFORMADA === null || r.AUSENCIA_INFORMADA === undefined ? null : Boolean(Number(r.AUSENCIA_INFORMADA)),
    teveTiro: Boolean(Number(r.TEVE_TIRO || 0)),
    tipoArma: String(r.TIPO_ARMA || ''),
    tirosEfetuados: r.TIROS_EFETUADOS !== null && r.TIROS_EFETUADOS !== undefined ? Number(r.TIROS_EFETUADOS) : null,
    percentual: ausente ? 0 : computePercentualScore(notaObtida, notaMinRef, notaMaxRef)
  };
}

async function tryEmbedProfilePhoto(doc: PDFDocument, photoDataUrl?: string | null): Promise<PDFImage | null> {
  if (!photoDataUrl || typeof photoDataUrl !== 'string') return null;
  const trimmed = photoDataUrl.trim();
  if (trimmed.length > 4_000_000) return null; // limite defensivo de 3MB base64
  const match = trimmed.match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (bytes.length === 0 || bytes.length > 3 * 1024 * 1024) return null;
    if (match[1].toLowerCase() === 'png') {
      return await doc.embedPng(bytes);
    }
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function summarizeMarkerAverages(results: PerformanceResultItem[]) {
  const map = new Map<string, { sumPct: number; sumNota: number; count: number; aprovados: number; maxRef: number }>();
  for (const r of results) {
    if (r.ausente) continue;
    const entry = map.get(r.marcadorNome) || { sumPct: 0, sumNota: 0, count: 0, aprovados: 0, maxRef: r.notaMaxRef };
    entry.sumPct += r.percentual;
    entry.sumNota += r.notaObtida;
    entry.count += 1;
    if (r.aprovado) entry.aprovados += 1;
    entry.maxRef = r.notaMaxRef;
    map.set(r.marcadorNome, entry);
  }
  return Array.from(map.entries())
    .map(([label, st]) => {
      const avgPct = st.count > 0 ? st.sumPct / st.count : 0;
      const avgNota = st.count > 0 ? st.sumNota / st.count : 0;
      return {
        label,
        percent: avgPct,
        avgNota,
        count: st.count,
        rightText: `${avgPct.toFixed(0)}% (${avgNota.toFixed(1)}/${st.maxRef.toFixed(0)})`
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

function drawUserIdentityBanner(
  builder: PdfReportBuilder,
  profile: { name: string; masp: string; cargo: string; unidadeNome: string; departamentoNome?: string },
  photo: PDFImage | null
) {
  const { marginX, contentWidth } = builder.getMetrics();
  const { bold, regular } = builder.getFonts();
  const page = builder.getPage();
  const boxH = 92;
  const topY = builder.getMetrics().cursorY;
  const boxY = topY - boxH;

  page.drawRectangle({
    x: marginX,
    y: boxY,
    width: contentWidth,
    height: boxH,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.82, 0.86, 0.92),
    borderWidth: 0.8
  });

  // Foto 3x4 (60 x 80 pt)
  const photoW = 60;
  const photoH = 80;
  const photoX = marginX + 8;
  const photoY = boxY + 6;
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    color: rgb(0.88, 0.91, 0.95),
    borderColor: rgb(0.72, 0.76, 0.83),
    borderWidth: 0.7
  });

  if (photo) {
    page.drawImage(photo, {
      x: photoX + 1,
      y: photoY + 1,
      width: photoW - 2,
      height: photoH - 2
    });
  } else {
    const initials = sanitizePdfText(profile.name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase() || '')
      .join('');
    page.drawText(initials || 'PC', {
      x: photoX + 18,
      y: photoY + 34,
      size: 16,
      font: bold,
      color: rgb(0.35, 0.42, 0.52)
    });
    page.drawText('FOTO 3x4', {
      x: photoX + 12,
      y: photoY + 14,
      size: 7,
      font: regular,
      color: rgb(0.45, 0.52, 0.6)
    });
  }

  const textX = photoX + photoW + 14;
  page.drawText(sanitizePdfText(profile.name).toUpperCase().slice(0, 56), {
    x: textX,
    y: topY - 22,
    size: 12.5,
    font: bold,
    color: rgb(0.07, 0.12, 0.2)
  });
  page.drawText(
    sanitizePdfText(`MASP: ${profile.masp || '—'}   •   Cargo: ${profile.cargo || 'Policial Civil'}`).slice(0, 74),
    {
      x: textX,
      y: topY - 40,
      size: 9.2,
      font: regular,
      color: rgb(0.22, 0.28, 0.36)
    }
  );
  page.drawText(sanitizePdfText(`Unidade: ${profile.unidadeNome || '—'}`).slice(0, 74), {
    x: textX,
    y: topY - 56,
    size: 9.2,
    font: bold,
    color: rgb(0.12, 0.35, 0.28)
  });
  if (profile.departamentoNome) {
    page.drawText(sanitizePdfText(`Departamento: ${profile.departamentoNome}`).slice(0, 74), {
      x: textX,
      y: topY - 72,
      size: 8.4,
      font: regular,
      color: rgb(0.38, 0.44, 0.52)
    });
  }

  builder.setCursorY(boxY - 12);
}

function drawEvaluationRows(
  builder: PdfReportBuilder,
  rows: PerformanceResultItem[],
  options: { maxRows: number; allowPageBreak: boolean }
) {
  const { marginX, contentWidth } = builder.getMetrics();
  const { bold, regular } = builder.getFonts();

  const headerH = 16;
  if (options.allowPageBreak) builder.ensureSpace(headerH + 24);
  const startY = builder.getMetrics().cursorY;
  const page = builder.getPage();

  page.drawRectangle({
    x: marginX,
    y: startY - 3,
    width: contentWidth,
    height: headerH,
    color: rgb(0.1, 0.15, 0.24)
  });
  const cols = [
    { label: 'DATA', x: marginX + 4 },
    { label: 'MARCADOR / ATIVIDADE', x: marginX + 60 },
    { label: 'MARCA / TEMPO', x: marginX + 265 },
    { label: 'NOTA', x: marginX + 368 },
    { label: 'RESULTADO', x: marginX + 422 }
  ];
  for (const col of cols) {
    page.drawText(col.label, {
      x: col.x,
      y: startY + 1,
      size: 7.5,
      font: bold,
      color: rgb(1, 1, 1)
    });
  }
  builder.setCursorY(startY - 17);

  const visible = rows.slice(0, options.maxRows);
  visible.forEach((r, idx) => {
    if (options.allowPageBreak) builder.ensureSpace(16);
    const curPage = builder.getPage();
    const y = builder.getMetrics().cursorY;
    if (y < 54 && !options.allowPageBreak) return;

    if (idx % 2 === 1) {
      curPage.drawRectangle({
        x: marginX,
        y: y - 3,
        width: contentWidth,
        height: 14,
        color: rgb(0.96, 0.97, 0.99)
      });
    }

    const marcaParts: string[] = [];
    if (r.valorMarca !== null) {
      marcaParts.push(`${r.valorMarca}${r.unidadeMedida ? ` ${r.unidadeMedida}` : ''}`);
    }
    if (r.tempoSegundos !== null) {
      marcaParts.push(formatSecondsToMmSs(r.tempoSegundos));
    }
    if (r.teveTiro && r.tirosEfetuados) {
      marcaParts.push(`${r.tipoArma || 'Tiro'}: ${r.tirosEfetuados}`);
    }

    const statusText = r.ausente
      ? r.ausenciaInformada === true
        ? 'Ausente (Inf.)'
        : r.ausenciaInformada === false
        ? 'Ausente (N/Inf.)'
        : 'Ausente'
      : r.aprovado
      ? 'Aprovado'
      : 'Abaixo Meta';

    const statusColor = r.ausente
      ? rgb(0.65, 0.45, 0.05)
      : r.aprovado
      ? rgb(0.05, 0.5, 0.34)
      : rgb(0.75, 0.18, 0.18);

    curPage.drawText(sanitizePdfText(formatIsoDateBr(r.dataAvaliacao)), {
      x: cols[0].x,
      y,
      size: 7.8,
      font: regular,
      color: rgb(0.2, 0.25, 0.32)
    });
    curPage.drawText(sanitizePdfText(`${r.marcadorNome} (${r.atividadeNome})`).slice(0, 40), {
      x: cols[1].x,
      y,
      size: 7.8,
      font: bold,
      color: rgb(0.1, 0.14, 0.2)
    });
    curPage.drawText(sanitizePdfText(r.ausente ? '—' : marcaParts.join(' / ') || '—').slice(0, 20), {
      x: cols[2].x,
      y,
      size: 7.8,
      font: regular,
      color: rgb(0.2, 0.25, 0.32)
    });
    curPage.drawText(
      sanitizePdfText(r.ausente ? '—' : `${r.notaObtida.toFixed(1)}/${r.notaMaxRef.toFixed(0)}`),
      {
        x: cols[3].x,
        y,
        size: 7.8,
        font: bold,
        color: rgb(0.12, 0.18, 0.28)
      }
    );
    curPage.drawText(sanitizePdfText(statusText), {
      x: cols[4].x,
      y,
      size: 7.8,
      font: bold,
      color: statusColor
    });

    builder.setCursorY(y - 14);
  });

  if (rows.length > visible.length) {
    const curPage = builder.getPage();
    const y = builder.getMetrics().cursorY;
    if (y >= 46) {
      curPage.drawText(sanitizePdfText(`+ ${rows.length - visible.length} registro(s) anterior(es) no historico do sistema.`), {
        x: marginX + 4,
        y,
        size: 7.6,
        font: regular,
        color: rgb(0.45, 0.5, 0.58)
      });
      builder.setCursorY(y - 12);
    }
  }
}

export async function findUserPerformanceProfile(
  pool: any,
  userId: string
): Promise<PerformanceUserProfile | null> {
  const uRows = await safeQuery(
    pool,
    `SELECT u.ID_USUARIOS, u.NOME_USUARIOS, u.MASP_USUARIOS, u.CARGO_USUARIOS,
            u.UNIDADE_ID_USUARIOS, u.FOTO_URL_USUARIOS,
            un.NOME_UNIDADES AS UNIDADE_NOME,
            d.NOME_DEPARTAMENTOS AS DEPARTAMENTO_NOME
     FROM USUARIOS u
     LEFT JOIN UNIDADES un ON un.ID_UNIDADES = u.UNIDADE_ID_USUARIOS
     LEFT JOIN DEPARTAMENTOS d ON d.ID_DEPARTAMENTOS = u.DEPARTAMENTO_ID_USUARIOS
     WHERE u.ID_USUARIOS = ? LIMIT 1`,
    [userId]
  );
  const u = uRows[0];
  if (!u) return null;

  const rRows = await safeQuery(
    pool,
    `SELECT r.*, a.NOME AS ATIVIDADE_NOME, g.NOME_GRUPO AS GRUPO_NOME
     FROM DESEMPENHO_RESULTADOS r
     LEFT JOIN DESEMPENHO_ATIVIDADES a ON a.ID_ATIVIDADE = r.ID_ATIVIDADE
     LEFT JOIN DESEMPENHO_GRUPOS g ON g.ID_GRUPO = r.ID_GRUPO
     WHERE r.USUARIO_ID = ?
     ORDER BY r.DATA_AVALIACAO DESC, r.DATA_CRIACAO DESC LIMIT 200`,
    [userId]
  );

  return {
    id: String(u.ID_USUARIOS),
    name: String(u.NOME_USUARIOS || 'Policial'),
    masp: String(u.MASP_USUARIOS || ''),
    cargo: String(u.CARGO_USUARIOS || ''),
    unidadeId: String(u.UNIDADE_ID_USUARIOS || ''),
    unidadeNome: String(u.UNIDADE_NOME || 'Unidade'),
    departamentoNome: String(u.DEPARTAMENTO_NOME || ''),
    photoUrl: u.FOTO_URL_USUARIOS ? String(u.FOTO_URL_USUARIOS) : null,
    results: rRows.map(mapPerfResultRow)
  };
}

export async function generateMyPerformanceSheetPdf(
  pool: any,
  userId: string
): Promise<{ buffer: Buffer; filename: string; totalResults: number } | null> {
  const profile = await findUserPerformanceProfile(pool, userId);
  if (!profile) return null;

  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    'FICHA INDIVIDUAL DE DESEMPENHO (FISICO E TATICO)',
    `${profile.name} (MASP ${profile.masp || '—'}) • ${profile.unidadeNome}`
  );
  await builder.init();

  const photo = await tryEmbedProfilePhoto(doc, profile.photoUrl);
  drawUserIdentityBanner(builder, profile, photo);

  const fisicos = profile.results.filter(r => r.categoria === 'FISICO');
  const taticos = profile.results.filter(r => r.categoria === 'TATICO');
  const fisPres = fisicos.filter(r => !r.ausente);
  const tatPres = taticos.filter(r => !r.ausente);
  const avgFis = fisPres.length > 0 ? fisPres.reduce((s, r) => s + r.percentual, 0) / fisPres.length : 0;
  const avgTat = tatPres.length > 0 ? tatPres.reduce((s, r) => s + r.percentual, 0) / tatPres.length : 0;
  const totalPres = fisPres.length + tatPres.length;
  const totalAprov = [...fisPres, ...tatPres].filter(r => r.aprovado).length;
  const totalAus = profile.results.filter(r => r.ausente).length;

  builder.drawKpiCards([
    { label: 'Média Física', value: fisPres.length > 0 ? `${avgFis.toFixed(1)}%` : 'Sem dados', accent: [0.06, 0.56, 0.42] },
    { label: 'Média Tática', value: tatPres.length > 0 ? `${avgTat.toFixed(1)}%` : 'Sem dados', accent: [0.12, 0.42, 0.78] },
    { label: 'Aprovações', value: totalPres > 0 ? `${totalAprov}/${totalPres}` : '0/0', accent: [0.85, 0.58, 0.08] },
    { label: 'Ausências', value: String(totalAus), accent: [0.72, 0.24, 0.24] }
  ]);

  // SEÇÃO 1: DESEMPENHO FÍSICO
  builder.drawSectionTitle(`1. DESEMPENHO FISICO (${fisicos.length} registro(s))`);
  if (fisicos.length === 0) {
    builder.drawParagraph('Nenhum índice de desempenho físico registrado até o momento.');
  } else {
    const fisMarkers = summarizeMarkerAverages(fisicos);
    if (fisMarkers.length > 0) {
      builder.drawHorizontalBarChart('Gráfico — Médias por Marcador Físico', fisMarkers, { maxItems: 10 });
    }
    drawEvaluationRows(builder, fisicos, { maxRows: 25, allowPageBreak: true });
  }

  builder.setCursorY(builder.getMetrics().cursorY - 8);

  // SEÇÃO 2: DESEMPENHO TÁTICO
  builder.drawSectionTitle(`2. DESEMPENHO TATICO (${taticos.length} registro(s))`);
  if (taticos.length === 0) {
    builder.drawParagraph('Nenhum índice de desempenho tático registrado até o momento.');
  } else {
    const tatMarkers = summarizeMarkerAverages(taticos);
    if (tatMarkers.length > 0) {
      builder.drawHorizontalBarChart('Gráfico — Médias por Marcador Tático', tatMarkers, { maxItems: 10 });
    }
    drawEvaluationRows(builder, taticos, { maxRows: 25, allowPageBreak: true });
  }

  const buffer = await builder.finalize();
  const safeName = profile.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);

  return {
    buffer,
    filename: `Ficha_Desempenho_${safeName || profile.masp || 'Policial'}.pdf`,
    totalResults: profile.results.length
  };
}

export async function generateUnitPerformanceReportPdf(
  pool: any,
  categoria: DesempenhoCategoria,
  unitIds: string[],
  unitLabel: string
): Promise<{ buffer: Buffer; filename: string; userCount: number; resultCount: number } | null> {
  if (!Array.isArray(unitIds) || unitIds.length === 0) return null;
  const uClauseUser = buildUnitInClause('u.UNIDADE_ID_USUARIOS', unitIds);
  const uClauseRes = buildUnitInClause('r.USUARIO_UNIDADE_ID', unitIds);

  // Carrega todos os resultados da categoria nas unidades autorizadas
  const rRows = await safeQuery(
    pool,
    `SELECT r.*, a.NOME AS ATIVIDADE_NOME, g.NOME_GRUPO AS GRUPO_NOME,
            u.NOME_USUARIOS, u.MASP_USUARIOS, u.CARGO_USUARIOS, u.FOTO_URL_USUARIOS,
            u.UNIDADE_ID_USUARIOS,
            un.NOME_UNIDADES AS UNIDADE_NOME_JOIN,
            d.NOME_DEPARTAMENTOS AS DEPARTAMENTO_NOME
     FROM DESEMPENHO_RESULTADOS r
     LEFT JOIN DESEMPENHO_ATIVIDADES a ON a.ID_ATIVIDADE = r.ID_ATIVIDADE
     LEFT JOIN DESEMPENHO_GRUPOS g ON g.ID_GRUPO = r.ID_GRUPO
     LEFT JOIN USUARIOS u ON u.ID_USUARIOS = r.USUARIO_ID
     LEFT JOIN UNIDADES un ON un.ID_UNIDADES = COALESCE(u.UNIDADE_ID_USUARIOS, r.USUARIO_UNIDADE_ID)
     LEFT JOIN DEPARTAMENTOS d ON d.ID_DEPARTAMENTOS = u.DEPARTAMENTO_ID_USUARIOS
     WHERE r.CATEGORIA = ?
       AND ((1=1${uClauseRes.sql}) OR (u.ID_USUARIOS IS NOT NULL${uClauseUser.sql}))
     ORDER BY COALESCE(u.NOME_USUARIOS, r.USUARIO_NOME) ASC, r.DATA_AVALIACAO DESC`,
    [categoria, ...uClauseRes.params, ...uClauseUser.params]
  );

  if (rRows.length === 0) return null;

  const byUser = new Map<string, PerformanceUserProfile>();
  for (const row of rRows) {
    const uid = String(row.USUARIO_ID);
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        id: uid,
        name: String(row.NOME_USUARIOS || row.USUARIO_NOME || 'Policial'),
        masp: String(row.MASP_USUARIOS || row.USUARIO_MASP || ''),
        cargo: String(row.CARGO_USUARIOS || ''),
        unidadeId: String(row.UNIDADE_ID_USUARIOS || row.USUARIO_UNIDADE_ID || ''),
        unidadeNome: String(row.UNIDADE_NOME_JOIN || row.USUARIO_UNIDADE_NOME || 'Unidade'),
        departamentoNome: String(row.DEPARTAMENTO_NOME || ''),
        photoUrl: row.FOTO_URL_USUARIOS ? String(row.FOTO_URL_USUARIOS) : null,
        results: []
      });
    }
    byUser.get(uid)!.results.push(mapPerfResultRow(row));
  }

  const users = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const allResults = users.flatMap(u => u.results);
  const allPresent = allResults.filter(r => !r.ausente);
  const allApproved = allPresent.filter(r => r.aprovado);
  const totalAus = allResults.filter(r => r.ausente).length;

  const userAvgChart = users
    .map(u => {
      const pres = u.results.filter(r => !r.ausente);
      const avg = pres.length > 0 ? pres.reduce((s, r) => s + r.percentual, 0) / pres.length : 0;
      const aprov = pres.filter(r => r.aprovado).length;
      return {
        user: u,
        avgPct: avg,
        presCount: pres.length,
        aprovCount: aprov,
        label: u.name,
        percent: avg,
        rightText: pres.length > 0 ? `${avg.toFixed(1)}% (${aprov}/${pres.length})` : 'Ausente'
      };
    })
    .sort((a, b) => b.avgPct - a.avgPct);

  const usersWithPresent = userAvgChart.filter(x => x.presCount > 0);
  const unitAvgOfUsers =
    usersWithPresent.length > 0
      ? usersWithPresent.reduce((s, x) => s + x.avgPct, 0) / usersWithPresent.length
      : 0;
  const approvalRate = allPresent.length > 0 ? (allApproved.length / allPresent.length) * 100 : 0;

  const catLabel = categoria === 'FISICO' ? 'Físico' : 'Tático';
  const catUpper = categoria === 'FISICO' ? 'FISICO' : 'TATICO';
  const doc = await PDFDocument.create();
  const builder = new PdfReportBuilder(
    doc,
    `DESEMPENHO ${catUpper} DA UNIDADE — GRAFICO CONSOLIDADO`,
    `Abrangencia: ${unitLabel} • ${users.length} policial(is) • ${allResults.length} avaliacao(oes)`
  );
  await builder.init();

  // ==========================================================================
  // FOLHA 1: GRÁFICO DA UNIDADE (COM BASE NOS NÍVEIS MÉDIOS DOS USUÁRIOS)
  // ==========================================================================
  builder.drawKpiCards([
    { label: 'Média Geral Unidade', value: `${unitAvgOfUsers.toFixed(1)}%`, accent: [0.06, 0.56, 0.42] },
    { label: 'Policiais Avaliados', value: String(users.length), accent: [0.12, 0.42, 0.78] },
    { label: 'Taxa de Aprovação', value: `${approvalRate.toFixed(0)}%`, accent: [0.85, 0.58, 0.08] },
    { label: 'Ausências', value: String(totalAus), accent: [0.72, 0.24, 0.24] }
  ]);

  const unitMarkerAverages = summarizeMarkerAverages(allResults);
  builder.drawHorizontalBarChart(
    `Gráfico 1 — Nível Médio da Unidade por Marcador (${catLabel})`,
    unitMarkerAverages,
    { maxItems: 10, compact: true, allowPageBreak: false }
  );

  builder.drawHorizontalBarChart(
    `Gráfico 2 — Nível Médio por Policial (${catLabel})`,
    userAvgChart.map(x => ({
      label: x.label,
      percent: x.percent,
      rightText: x.rightText
    })),
    { maxItems: 18, compact: true, allowPageBreak: false }
  );

  // ==========================================================================
  // FOLHAS 2..N: UMA FICHA INDIVIDUAL POR FOLHA DO ARQUIVO
  // ==========================================================================
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    builder.setHeaderTexts(
      `FICHA DE DESEMPENHO ${catUpper} (${i + 1}/${users.length})`,
      `${u.name} (MASP ${u.masp || '—'}) • ${u.unidadeNome}`
    );
    builder.addPage();

    const photo = await tryEmbedProfilePhoto(doc, u.photoUrl);
    drawUserIdentityBanner(builder, u, photo);

    const pres = u.results.filter(r => !r.ausente);
    const aprov = pres.filter(r => r.aprovado).length;
    const aus = u.results.filter(r => r.ausente).length;
    const avgPct = pres.length > 0 ? pres.reduce((s, r) => s + r.percentual, 0) / pres.length : 0;

    builder.drawKpiCards([
      { label: `Média ${catLabel}`, value: pres.length > 0 ? `${avgPct.toFixed(1)}%` : 'Sem nota', accent: [0.06, 0.56, 0.42] },
      { label: 'Avaliações', value: String(u.results.length), accent: [0.12, 0.42, 0.78] },
      { label: 'Aprovações', value: `${aprov}/${pres.length}`, accent: [0.85, 0.58, 0.08] },
      { label: 'Ausências', value: String(aus), accent: [0.72, 0.24, 0.24] }
    ]);

    const userMarkers = summarizeMarkerAverages(u.results);
    if (userMarkers.length > 0) {
      builder.drawHorizontalBarChart(`Desempenho por Marcador (${catLabel})`, userMarkers, {
        maxItems: 8,
        compact: true,
        allowPageBreak: false
      });
    }

    builder.drawSectionTitle(`Histórico de Avaliações — ${catLabel}`);
    // Garante que cada ficha caiba exatamente em 1 folha
    const remainingHeight = Math.max(0, builder.getMetrics().cursorY - 68);
    const maxRowsForOnePage = Math.max(4, Math.min(18, Math.floor((remainingHeight - 24) / 14)));
    drawEvaluationRows(builder, u.results, { maxRows: maxRowsForOnePage, allowPageBreak: false });
  }

  const buffer = await builder.finalize();
  const safeSlug = `${categoria}_${unitLabel}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 44);
  return {
    buffer,
    filename: `Desempenho_Unidade_${safeSlug}.pdf`,
    userCount: users.length,
    resultCount: allResults.length
  };
}

