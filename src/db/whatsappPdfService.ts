import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';

export type OperacaoOrigem = 'CANIL' | 'POLICIAL' | 'CAT';
export type TreinamentoOrigem = 'CANIL' | 'POLICIAL';
export type ReciboTipo = 'ARMAS' | 'MUNICOES' | 'MATERIAIS';
export type ArmariaPeriodo = '24H' | 'SEMANA' | 'MES_ATUAL' | 'ANO_ATUAL';

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
    this.page.drawText('POLICIA CIVIL DE MINAS GERAIS — SISTEMA OPERACIONAL E ARMARIA', {
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
      p.drawText(sanitizePdfText(`Emitido via WhatsApp Oficial PCMG em ${generatedAt}`), {
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
