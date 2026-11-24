import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';

export type OperacaoOrigem = 'CANIL' | 'POLICIAL' | 'CAT';

export interface UnifiedOperationReport {
  origem: OperacaoOrigem;
  origemLabel: string;
  id: string;
  dataOperacao: string; // YYYY-MM-DD
  horaOperacao: string; // HH:MM
  estado: string;
  municipio: string;
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

  // WinAnsi (Latin-1) safe characters for Helvetica standard font in pdf-lib
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

function mapCanilRow(r: any): UnifiedOperationReport {
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

function mapPolicialRow(r: any): UnifiedOperationReport {
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
  if (outrosMun.length > 0) {
    extras.push({ label: 'Outros Municípios', value: outrosMun.join(', ') });
  }
  if (Number(r.UTILIZOU_ARMA)) {
    extras.push({
      label: 'Emprego de Armamento',
      value: [
        Number(r.UTILIZOU_ARMA_FOGO) ? 'Arma de fogo' : '',
        Number(r.UTILIZOU_ARMA_ELETRICA) ? 'Arma elétrica' : ''
      ]
        .filter(Boolean)
        .join(' e ') || 'Sim'
    });
  }
  if (Number(r.HOUVE_OBITO)) {
    extras.push({ label: 'Óbitos Registrados', value: String(r.QUANTIDADE_OBITOS || 1) });
  }

  return {
    origem: 'POLICIAL',
    origemLabel: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'Unidade Policial'),
    id: String(r.ID_REL_OP_POL),
    dataOperacao: String(r.DATA_OPERACAO || '').slice(0, 10),
    horaOperacao: String(r.HORA_OPERACAO || '00:00').slice(0, 5),
    estado: String(r.ESTADO_OPERACAO || 'MG'),
    municipio: String(r.MUNICIPIO_OPERACAO || 'Não informado'),
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

function mapCatRow(r: any): UnifiedOperationReport {
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
  if (Number(r.TEVE_DISPAROS_CAT)) {
    extras.push({ label: 'Disparos', value: 'Sim' });
  }
  if (Number(r.TEVE_OBITO)) {
    extras.push({ label: 'Óbitos Registrados', value: String(r.QTD_OBITOS || 1) });
  }

  return {
    origem: 'CAT',
    origemLabel: String(r.UNIDADE_NOME || r.UNIDADE_NOME_JOIN || 'CAT - Coordenação Aerotática'),
    id: String(r.ID_REL_OP_CAT),
    dataOperacao: String(r.DATA_OPERACAO || '').slice(0, 10),
    horaOperacao: String(r.HORARIO_VOO_OPERACAO || r.HORARIO_DECOLAGEM || '00:00').slice(0, 5),
    estado: String(r.ESTADO_OPERACAO || 'MG'),
    municipio: String(r.MUNICIPIO_OPERACAO || 'Não informado'),
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

async function safeQuery(pool: any, sql: string, params: any[] = []): Promise<any[]> {
  try {
    const [rows]: any = await pool.query(sql, params);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function listAvailableOperationDates(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO'
): Promise<AvailableDateOption[]> {
  const sliceLen = granularity === 'DIA' ? 10 : granularity === 'MES' ? 7 : 4;

  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT LEFT(DATA_OPERACAO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_OPERACOES_CANIL WHERE DATA_OPERACAO IS NOT NULL AND DATA_OPERACAO <> '' GROUP BY LEFT(DATA_OPERACAO, ?)`,
      [sliceLen, sliceLen]
    ),
    safeQuery(
      pool,
      `SELECT LEFT(DATA_OPERACAO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_OPERACOES_POLICIAL WHERE DATA_OPERACAO IS NOT NULL AND DATA_OPERACAO <> '' GROUP BY LEFT(DATA_OPERACAO, ?)`,
      [sliceLen, sliceLen]
    ),
    safeQuery(
      pool,
      `SELECT LEFT(DATA_OPERACAO, ?) AS dt, COUNT(*) AS cnt FROM RELATORIOS_OPERACOES_CAT WHERE DATA_OPERACAO IS NOT NULL AND DATA_OPERACAO <> '' GROUP BY LEFT(DATA_OPERACAO, ?)`,
      [sliceLen, sliceLen]
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
      if (granularity === 'DIA') {
        label = formatIsoDateBr(value);
      } else if (granularity === 'MES') {
        const [yyyy, mm] = value.split('-');
        label = `${mm}/${yyyy} (${MONTH_NAMES_PT[mm] || mm})`;
      }
      return { value, label, count };
    });
}

export async function findOperationReportsByDate(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO',
  isoFilter: string
): Promise<UnifiedOperationReport[]> {
  const whereClause =
    granularity === 'DIA' ? 'r.DATA_OPERACAO = ?' : 'r.DATA_OPERACAO LIKE ?';
  const param = granularity === 'DIA' ? isoFilter : `${isoFilter}-%`;

  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC
       LIMIT 30`,
      [param]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC
       LIMIT 30`,
      [param]
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CAT r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE ${whereClause}
       ORDER BY r.DATA_OPERACAO DESC, r.HORARIO_VOO_OPERACAO DESC
       LIMIT 30`,
      [param]
    )
  ]);

  const all: UnifiedOperationReport[] = [
    ...canilRows.map(mapCanilRow),
    ...polRows.map(mapPolicialRow),
    ...catRows.map(mapCatRow)
  ];

  return all.sort((a, b) => {
    const keyA = `${a.dataOperacao} ${a.horaOperacao}`;
    const keyB = `${b.dataOperacao} ${b.horaOperacao}`;
    return keyB.localeCompare(keyA);
  });
}

export async function findOperationReportsLast24h(pool: any): Promise<UnifiedOperationReport[]> {
  const [canilRows, polRows, catRows] = await Promise.all([
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_OPERACAO, ' ', COALESCE(NULLIF(r.HORA_OPERACAO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC, r.DATA_CRIACAO DESC
       LIMIT 50`
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_OPERACAO, ' ', COALESCE(NULLIF(r.HORA_OPERACAO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY r.DATA_OPERACAO DESC, r.HORA_OPERACAO DESC, r.DATA_CRIACAO DESC
       LIMIT 50`
    ),
    safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CAT r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          OR STR_TO_DATE(CONCAT(r.DATA_OPERACAO, ' ', COALESCE(NULLIF(r.HORARIO_VOO_OPERACAO, ''), '00:00')), '%Y-%m-%d %H:%i') >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY r.DATA_OPERACAO DESC, r.HORARIO_VOO_OPERACAO DESC, r.DATA_CRIACAO DESC
       LIMIT 50`
    )
  ]);

  const all: UnifiedOperationReport[] = [
    ...canilRows.map(mapCanilRow),
    ...polRows.map(mapPolicialRow),
    ...catRows.map(mapCatRow)
  ];

  return all.sort((a, b) => {
    const keyA = `${a.dataOperacao} ${a.horaOperacao}`;
    const keyB = `${b.dataOperacao} ${b.horaOperacao}`;
    return keyB.localeCompare(keyA);
  });
}

export async function findSingleOperationReport(
  pool: any,
  origem: OperacaoOrigem,
  id: string
): Promise<UnifiedOperationReport | null> {
  if (origem === 'CANIL') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CANIL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.ID_REL_OPERACAO = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapCanilRow(rows[0]) : null;
  }
  if (origem === 'POLICIAL') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_POLICIAL r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.ID_REL_OP_POL = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapPolicialRow(rows[0]) : null;
  }
  if (origem === 'CAT') {
    const rows = await safeQuery(
      pool,
      `SELECT r.*, u.NOME_UNIDADES AS UNIDADE_NOME_JOIN
       FROM RELATORIOS_OPERACOES_CAT r
       LEFT JOIN UNIDADES u ON u.ID_UNIDADES = r.UNIDADE_ID
       WHERE r.ID_REL_OP_CAT = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapCatRow(rows[0]) : null;
  }
  return null;
}

// ============================================================================
// GERADOR DE PDF PROFISSIONAL (pdf-lib) PARA RELATÓRIOS DE OPERAÇÕES
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
        // Handle single ultra-long words
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
  private readonly pageWidth = 595.28; // A4
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
    // Header Banner
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
    this.page.drawText('POLICIA CIVIL DE MINAS GERAIS — SISTEMA OPERACIONAL', {
      x: this.marginX,
      y: this.pageHeight - 28,
      size: 9,
      font: this.fontBold,
      color: rgb(0.96, 0.78, 0.25)
    });
    this.page.drawText(this.titleHeader.slice(0, 72), {
      x: this.marginX,
      y: this.pageHeight - 48,
      size: 13.5,
      font: this.fontBold,
      color: rgb(1, 1, 1)
    });
    this.page.drawText(this.subtitleHeader.slice(0, 95), {
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

  drawReportBlock(report: UnifiedOperationReport, index?: number, total?: number) {
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
    if (report.dataCriacao) {
      this.drawKeyValue('Data de Registro no Sistema', formatIsoDateTimeBr(report.dataCriacao));
    }

    for (const ex of report.detalhesExtras) {
      if (ex.value) this.drawKeyValue(ex.label, ex.value);
    }

    if (report.apoioDepartamentos.length > 0) {
      this.drawKeyValue('Apoio a Departamentos', report.apoioDepartamentos.join(', '));
    }
    if (report.operadores.length > 0) {
      this.drawKeyValue('Integrantes / Operadores', report.operadores.join('; '));
    }
    if (report.viaturas.length > 0) {
      this.drawKeyValue('Viaturas Empregadas', report.viaturas.join('; '));
    }
    if (report.aeronaves.length > 0) {
      this.drawKeyValue('Aeronaves Empregadas', report.aeronaves.join('; '));
    }
    if (report.materiaisEncontrados.length > 0) {
      this.drawKeyValue('Materiais / Apreensões', report.materiaisEncontrados.join('; '));
    }

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
  builder.drawReportBlock(report);
  const buffer = await builder.finalize();
  const safeSlug = report.municipio
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 28);
  const filename = `Relatorio_Operacao_${report.origem}_${report.dataOperacao}_${safeSlug || 'PCMG'}.pdf`;
  return { buffer, filename };
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
    if (idx > 0) {
      builder.ensureSpace(160);
    }
    builder.drawReportBlock(rep, idx, reports.length);
  });

  const buffer = await builder.finalize();
  const cleanSlug = fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const filename = `Relatorios_Operacoes_${cleanSlug}.pdf`;
  return { buffer, filename };
}
