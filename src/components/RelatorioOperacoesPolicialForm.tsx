import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Department,
  Unit,
  RelatorioOperacaoPolicial,
  MunicipioOperacaoPolicial,
  ViaturaOperacaoPolicial,
  OperadorOperacaoPolicial,
  AcionamentoViaOperacao,
  TipoAtendimentoOperacao,
  MaterialArrecadadoBusca,
  TipoCriseOperacao,
  TipoArmaApreendidaBusca,
  TipoDrogaApreendidaBusca,
  UnidadeDrogaBusca,
  TipoVeiculoApreendidoBusca,
  AtuacaoSuicidioOperacao,
  ArmaApreendidaBuscaItem,
  DrogaApreendidaBuscaItem,
  VeiculoApreendidoBuscaItem,
  ArmaFogoUtilizadaOperacao,
  ArmaEletricaUtilizadaOperacao,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import {
  ESTADOS_BR,
  DEPARTAMENTOS_APOIO_OPERACAO,
  getCachedMunicipiosPorUF,
  fetchMunicipiosPorUF
} from '../data/estadosMunicipiosBR';
import {
  printDocumentInPage,
  buildStandardDocumentTitle,
  buildStandardDocumentFilename
} from '../utils/printHelper';
import {
  Shield,
  Calendar,
  Clock,
  MapPin,
  Car,
  Users,
  Plus,
  X,
  Save,
  Printer,
  Edit,
  Trash2,
  Search,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Zap,
  FileText,
  Radio,
  Skull
} from 'lucide-react';

interface RelatorioOperacoesPolicialFormProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  activeUnitId?: string;
  activeUnitName: string;
  activeDeptId?: string;
  activeDeptName: string;
  editingReportExternal?: RelatorioOperacaoPolicial | null;
  onClearExternalEdit?: () => void;
  onSaved?: () => void;
  dataVersion?: number;
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SINOPSE = 1000;
const MAX_DESC_CURTA = 250;
const MAX_DESC_FUGA = 500;
const MAX_SINOPSE_OBITO = 600;

const MATERIAIS_BUSCA_OPCOES: MaterialArrecadadoBusca[] = [
  'ARMA',
  'DROGA',
  'ELETRÔNICOS',
  'VEÍCULOS',
  'MENOR',
  'OUTROS'
];

const TIPOS_ARMA_BUSCA_OPCOES: TipoArmaApreendidaBusca[] = [
  'Pistola',
  'Revolver',
  'Espingarda',
  'Carabina',
  'Fuzil',
  'Metralhadora',
  'Artesanal'
];

const TIPOS_DROGA_BUSCA_OPCOES: TipoDrogaApreendidaBusca[] = [
  'MACONHA',
  'COCAINA',
  'SINTÉTICA',
  'DESCONHECIDA'
];

const TIPOS_VEICULO_BUSCA_OPCOES: TipoVeiculoApreendidoBusca[] = [
  'Carro',
  'Moto',
  'Caminhonete',
  'Embarcação'
];

const TIPOS_CRISE_OPCOES: TipoCriseOperacao[] = ['DISTÚRBIO', 'SUICÍDIO', 'OUTROS'];

const ATUACOES_SUICIDIO_OPCOES: AtuacaoSuicidioOperacao[] = [
  'Negociador',
  'Arma de incapacitação',
  'Outros'
];

export const formatMandadoPrisaoResumo = (
  mp?: RelatorioOperacaoPolicial['detalhesAdicionais']['mandadoPrisao']
): string => {
  if (!mp?.ativo) return '';
  if (typeof mp.quantidadeAlvos === 'number' && mp.quantidadeAlvos > 0) {
    const alvos = mp.quantidadeAlvos;
    const presos = typeof mp.quantidadePresos === 'number' ? mp.quantidadePresos : mp.foragidoPreso ? alvos : 0;
    const foragidos = Math.max(0, alvos - presos);
    const presosTxt = `${presos} ${presos === 1 ? 'preso' : 'presos'}`;
    if (foragidos === 0) {
      return `Alvos: ${alvos} — ${presosTxt} (todos presos)`;
    }
    const foragTxt = `${foragidos} ${foragidos === 1 ? 'permanece foragido' : 'permanecem foragidos'}`;
    let extra = '';
    if (mp.foragidoNoLocalChegada) {
      const fug = mp.quantidadeFugiram || foragidos;
      extra = ` • No local na chegada: SIM (${fug} ${fug === 1 ? 'fugiu' : 'fugiram'}${
        mp.descricaoFuga ? `: ${mp.descricaoFuga}` : ''
      })`;
    } else if (mp.foragidoNoLocalChegada === false) {
      extra = ' • No local na chegada: NÃO';
    }
    return `Alvos: ${alvos} — ${presosTxt} — ${foragTxt}${extra}`;
  }
  return `Foragido preso: ${mp.foragidoPreso ? 'SIM' : 'NÃO'}`;
};

export const formatMandadoBuscaResumo = (
  mb?: RelatorioOperacaoPolicial['detalhesAdicionais']['mandadoBusca']
): string => {
  if (!mb?.ativo) return '';
  if (!mb.materialArrecadado) return 'Material arrecadado: NÃO';
  const partes: string[] = [];
  for (const m of mb.materiais || []) {
    if (m === 'ARMA') {
      const list = (mb.armasArrecadadas || []).map(a => `${a.quantidade} ${a.tipo}`);
      partes.push(list.length > 0 ? `ARMA (${list.join(', ')})` : 'ARMA');
    } else if (m === 'DROGA') {
      const list = (mb.drogasArrecadadas || []).map(
        d => `${d.quantidade} ${d.unidade === 't' ? 't' : 'kg'} de ${d.tipo}`
      );
      partes.push(list.length > 0 ? `DROGA (${list.join(', ')})` : 'DROGA');
    } else if (m === 'VEÍCULOS') {
      const list = (mb.veiculosArrecadados || []).map(v => `${v.quantidade} ${v.tipo}`);
      partes.push(list.length > 0 ? `VEÍCULOS (${list.join(', ')})` : 'VEÍCULOS');
    } else if (m === 'OUTROS') {
      partes.push(mb.outrosDetalhes ? `OUTROS (${mb.outrosDetalhes})` : 'OUTROS');
    } else {
      partes.push(m);
    }
  }
  return partes.length > 0 ? `Material arrecadado: SIM — ${partes.join(' • ')}` : 'Material arrecadado: SIM';
};

export const formatGerenciamentoCriseResumo = (
  gc?: RelatorioOperacaoPolicial['detalhesAdicionais']['gerenciamentoCrise']
): string => {
  if (!gc?.ativo) return '';
  if (gc.tipo === 'SUICÍDIO') {
    const consumado = gc.suicidioConsumado ? 'SIM' : 'NÃO';
    const atuacao = gc.atuacaoAdotada
      ? ` • Atuação adotada: ${gc.atuacaoAdotada}${
          gc.atuacaoAdotada === 'Outros' && gc.atuacaoOutrosDescricao ? ` (${gc.atuacaoOutrosDescricao})` : ''
        }`
      : '';
    return `Tipo: SUICÍDIO • Consumado: ${consumado}${atuacao}`;
  }
  return `Tipo: ${gc.tipo}${gc.outrosDetalhes ? ` (${gc.outrosDetalhes})` : ''}`;
};

const getTodayBrasilia = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

export const parsePolOpTimestampMs = (val?: string | null): number => {
  if (!val) return Date.now();
  const str = String(val).trim();
  const normalized = str.includes('T') ? str : str.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

export const getPolOpRemainingEditMs = (createdAt?: string | null, nowMs: number = Date.now()): number => {
  const createdMs = parsePolOpTimestampMs(createdAt);
  return Math.max(0, createdMs + THREE_DAYS_MS - nowMs);
};

export const formatRemainingCountdown = (remainingMs: number): string => {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
};

export const isPolOpOperatorEffectivelySigned = (
  op: OperadorOperacaoPolicial,
  createdAt?: string | null
): { signed: boolean; autoSigned: boolean } => {
  if (op.signed) {
    return { signed: true, autoSigned: Boolean(op.autoSigned) };
  }
  const elapsed = Date.now() - parsePolOpTimestampMs(createdAt);
  if (elapsed >= THIRTY_DAYS_MS) {
    return { signed: true, autoSigned: true };
  }
  return { signed: false, autoSigned: false };
};

const formatDateBr = (isoDate?: string | null): string => {
  if (!isoDate) return '-';
  const clean = String(isoDate).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatDateTimeBr = (val?: string | null): string => {
  if (!val) return '-';
  const d = new Date(val.includes('T') ? val : val.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const normalizeText = (text?: string | null): string =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const escapeHtmlText = (str?: string | null): string =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function printRelatorioOperacaoPolicial(
  rel: RelatorioOperacaoPolicial,
  units: Unit[],
  departments: Department[],
  fallbackUnitName?: string,
  fallbackDeptName?: string
) {
  const unitObj = units.find(u => u.id === rel.unitId);
  const deptObj = departments.find(d => d.id === (rel.departmentId || unitObj?.departmentId));
  const logoUrl = getSystemLogo(unitObj, deptObj);
  const unitLabel = rel.unitName || unitObj?.name || fallbackUnitName || 'Unidade Policial';
  const deptLabel = deptObj?.name || fallbackDeptName || 'Polícia Civil de Minas Gerais';

  const municipiosTodos = [
    `${rel.municipioOperacao}/${rel.estadoOperacao}`,
    ...(!rel.apenasUmMunicipio ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`) : [])
  ];

  const docTitle = buildStandardDocumentTitle(
    `Sinopse de Operação — ${rel.municipioOperacao}/${rel.estadoOperacao}`,
    unitLabel,
    formatDateBr(rel.dataOperacao)
  );
  const filename = buildStandardDocumentFilename(
    `Sinopse_Operacao_${rel.municipioOperacao}_${unitLabel}`,
    rel.dataOperacao
  );

  const viaturasHtml =
    (rel.viaturas || []).length > 0
      ? (rel.viaturas || [])
          .map(v => `${escapeHtmlText(v.placa)}${v.descricao ? ` — ${escapeHtmlText(v.descricao)}` : ''}`)
          .join('<br/>')
      : 'Nenhuma viatura informada';

  const apoioHtml =
    rel.tipoAtendimento === 'Operação prevista' || rel.tipoAtendimento === 'Operação extraordinária'
      ? `
        <div class="info-box full">
          <div class="info-label">Departamento(s) de Apoio</div>
          <div class="info-value">${(rel.departamentosApoio || []).map(d => escapeHtmlText(d)).join(' • ') || '-'}</div>
          ${
            rel.tipoAtendimento === 'Operação extraordinária' && rel.descricaoApoio
              ? `<div style="margin-top:4px;font-size:11px;color:#334155;"><strong>Descrição do Apoio:</strong> ${escapeHtmlText(rel.descricaoApoio)}</div>`
              : ''
          }
        </div>
      `
      : rel.tipoAtendimento === 'Emergencial' && rel.descricaoEmergencia
      ? `
        <div class="info-box full">
          <div class="info-label">Descrição da Emergência</div>
          <div class="info-value" style="font-weight:500;">${escapeHtmlText(rel.descricaoEmergencia)}</div>
        </div>
      `
      : '';

  const det = rel.detalhesAdicionais || {};
  const detalhesLinhas: string[] = [];
  if (det.mandadoPrisao?.ativo) {
    detalhesLinhas.push(
      `<li><strong>Mandado de Prisão:</strong> ${escapeHtmlText(formatMandadoPrisaoResumo(det.mandadoPrisao))}</li>`
    );
  }
  if (det.mandadoBusca?.ativo) {
    detalhesLinhas.push(
      `<li><strong>Mandado de Busca:</strong> ${escapeHtmlText(formatMandadoBuscaResumo(det.mandadoBusca))}</li>`
    );
  }
  if (det.gerenciamentoCrise?.ativo) {
    detalhesLinhas.push(
      `<li><strong>Gerenciamento de Crise:</strong> ${escapeHtmlText(formatGerenciamentoCriseResumo(det.gerenciamentoCrise))}</li>`
    );
  }

  const detalhesHtml =
    detalhesLinhas.length > 0
      ? `<div class="section-title">Detalhes Adicionais</div><ul class="clean-list">${detalhesLinhas.join('')}</ul>`
      : '';

  let armasHtml = '';
  if (rel.utilizouArmaFogoOuEletrica) {
    const fogoRows = (rel.armasFogo || [])
      .map(
        a => `
        <li>
          <strong>[${a.origem === 'ACERVO' ? 'Acervo' : 'Fora do Acervo'}]</strong>
          ${escapeHtmlText(a.marca)} ${escapeHtmlText(a.modelo)} • Nº Série: <strong>${escapeHtmlText(a.numeroSerie)}</strong> • Calibre: ${escapeHtmlText(a.calibre)} • Disparos: <strong>${Number(a.quantidadeTiros || 0)}</strong>
        </li>`
      )
      .join('');
    const eletRows = (rel.armasEletricas || [])
      .map(
        e => `
        <li>
          <strong>${escapeHtmlText(e.tipo || 'Equipamento')}</strong> — ${escapeHtmlText(e.nome)}${
            e.numeroSerie ? ` • Nº Série: ${escapeHtmlText(e.numeroSerie)}` : ''
          }${
            e.acautelado && e.usuarioCautelaNome
              ? ` • Acautelado para: ${escapeHtmlText(e.usuarioCautelaNome)}`
              : ' • Disponível na unidade'
          }
        </li>`
      )
      .join('');
    armasHtml = `
      <div class="section-title">Emprego de Arma de Fogo / Incapacitação Elétrica</div>
      ${fogoRows ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;margin-bottom:4px;">Armas de Fogo</div><ul class="clean-list">${fogoRows}</ul>` : ''}
      ${eletRows ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;margin:8px 0 4px;">Armas de Incapacitação Elétrica</div><ul class="clean-list">${eletRows}</ul>` : ''}
    `;
  }

  const qtdObitosPrint = rel.houveObito ? Math.max(1, Number(rel.quantidadeObitos) || 1) : 0;
  const mesmaSinopsePrint = rel.mesmaSinopseObito !== false;
  const obitoSinopsesList = Array.isArray(rel.sinopsesObitos) ? rel.sinopsesObitos : [];
  const obitoHtml = rel.houveObito
    ? `
      <div class="section-title" style="color:#991b1b;border-color:#fca5a5;">
        Registro de Óbito no Atendimento / Em Decorrência Dele — Quantidade: ${qtdObitosPrint}
      </div>
      ${
        !mesmaSinopsePrint && obitoSinopsesList.length > 0
          ? obitoSinopsesList
              .map(
                (txt, idx) => `
              <div style="margin-bottom:8px;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#991b1b;margin-bottom:3px;">
                  Sinopse — Óbito ${idx + 1}
                </div>
                <div class="desc-box" style="border-color:#fca5a5;background:#fef2f2;min-height:42px;">${escapeHtmlText(txt)}</div>
              </div>`
              )
              .join('')
          : `<div class="desc-box" style="border-color:#fca5a5;background:#fef2f2;">${escapeHtmlText(rel.sinopseObito || '')}</div>`
      }
    `
    : `
      <div class="info-box full" style="margin-top:10px;">
        <div class="info-label">Óbito no atendimento ou em decorrência dele?</div>
        <div class="info-value">NÃO</div>
      </div>
    `;

  const operadoresList = rel.operadores || [];
  // Assinaturas: sem bordas, linha horizontal acima do nome para assinatura física + dados abaixo
  const assinaturasHtml = `
    <div class="section-title">Assinaturas</div>
    <div class="sig-grid">
      ${operadoresList
        .map(op => {
          const eff = isPolOpOperatorEffectivelySigned(op, rel.createdAt);
          const statusText = eff.signed
            ? eff.autoSigned
              ? '✓ Assinado (automático — prazo de 30 dias)'
              : `✓ Assinado eletronicamente${op.signedAt ? ` em ${escapeHtmlText(formatDateTimeBr(op.signedAt))}` : ''}`
            : 'Pendente de assinatura (prazo de 30 dias)';
          return `
            <div class="sig-card">
              <div class="sig-line"></div>
              <div class="sig-name">${escapeHtmlText(op.name)}</div>
              <div class="sig-cargo">${escapeHtmlText(op.cargo || 'Policial Civil')}</div>
              <div class="sig-masp">MASP: ${escapeHtmlText(op.masp ? formatMasp(op.masp) : 'N/A')}</div>
              <div class="sig-status ${eff.signed ? 'signed' : 'pending'}">${statusText}</div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtmlText(docTitle)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
        .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
        .header img { width: 54px; height: 54px; object-fit: contain; }
        .header-text h1 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.4px; }
        .header-text p { margin: 2px 0 0; font-size: 11px; color: #475569; }
        .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
        .info-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
        .info-box.full { grid-column: 1 / -1; }
        .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
        .info-value { font-size: 12px; font-weight: 700; color: #0f172a; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 14px 0 8px; }
        .desc-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #ffffff; white-space: pre-wrap; min-height: 64px; font-size: 12px; }
        .clean-list { margin: 4px 0 8px 18px; padding: 0; font-size: 11.5px; }
        .clean-list li { margin-bottom: 4px; }
        .sig-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 20px; margin-top: 14px; }
        .sig-card { border: none; background: transparent; padding: 20px 10px 6px; page-break-inside: avoid; text-align: center; }
        .sig-line { border-top: 1px solid #0f172a; width: 88%; margin: 0 auto 6px; }
        .sig-name { font-size: 12.5px; font-weight: 700; color: #0f172a; }
        .sig-cargo { font-size: 11px; font-weight: 600; color: #334155; margin-top: 2px; }
        .sig-masp { font-size: 10.5px; font-family: monospace; color: #475569; margin-top: 2px; }
        .sig-status { font-size: 9.5px; font-weight: 700; margin-top: 4px; }
        .sig-status.signed { color: #047857; }
        .sig-status.pending { color: #b45309; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${escapeHtmlText(logoUrl)}" alt="Brasão" />
        <div class="header-text">
          <h1>Polícia Civil de Minas Gerais — Sinopse de Operação</h1>
          <p>${escapeHtmlText(deptLabel)} • Unidade: ${escapeHtmlText(unitLabel)}</p>
          <p>Data da Operação: ${escapeHtmlText(formatDateBr(rel.dataOperacao))} • Saída da Base: ${escapeHtmlText(rel.horaSaidaBase)} • Hora da Operação: ${escapeHtmlText(rel.horaOperacao)}</p>
        </div>
      </div>

      <div class="meta-grid">
        <div class="info-box">
          <div class="info-label">Município(s) da Operação</div>
          <div class="info-value">${municipiosTodos.map(m => escapeHtmlText(m)).join(' • ')}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Acionamento Via</div>
          <div class="info-value">${escapeHtmlText(rel.acionamentoVia)}${
            rel.acionamentoVia === 'OUTROS' && rel.acionamentoOutrosDescricao
              ? ` — ${escapeHtmlText(rel.acionamentoOutrosDescricao)}`
              : ''
          }</div>
        </div>
        <div class="info-box">
          <div class="info-label">Tipo de Atendimento</div>
          <div class="info-value">${escapeHtmlText(rel.tipoAtendimento)}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Viatura(s) Empregada(s)</div>
          <div class="info-value" style="font-weight:600;font-size:11px;">${viaturasHtml}</div>
        </div>
        ${apoioHtml}
      </div>

      <div class="section-title">Sinopse da Operação</div>
      <div class="desc-box">${escapeHtmlText(rel.sinopse)}</div>

      ${detalhesHtml}
      ${armasHtml}
      ${obitoHtml}
      ${assinaturasHtml}
    </body>
    </html>
  `;

  printDocumentInPage(html, filename);
}

export const RelatorioOperacoesPolicialForm: React.FC<RelatorioOperacoesPolicialFormProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  activeUnitId,
  activeUnitName,
  activeDeptId,
  activeDeptName,
  editingReportExternal,
  onClearExternalEdit,
  onSaved,
  dataVersion = 0
}) => {
  const effectiveUnitId = activeUnitId || currentUser.unitId || '';
  const effectiveDeptId = activeDeptId || currentUser.departmentId || '';

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Editing target
  const [editingReport, setEditingReport] = useState<RelatorioOperacaoPolicial | null>(null);

  // 1. Data e Horários
  const [dataOperacao, setDataOperacao] = useState<string>(() => getTodayBrasilia());
  const [horaSaidaBase, setHoraSaidaBase] = useState<string>('06:00');
  const [horaOperacao, setHoraOperacao] = useState<string>('06:00');

  // 2. Localização (Estado padrão MG + Município + Outros municípios)
  const [estadoOperacao, setEstadoOperacao] = useState<string>('MG');
  const [municipiosPrimarios, setMunicipiosPrimarios] = useState<string[]>(() => getCachedMunicipiosPorUF('MG'));
  const [loadingMunPrimario, setLoadingMunPrimario] = useState<boolean>(false);
  const [municipioOperacao, setMunicipioOperacao] = useState<string>('');
  const [apenasUmMunicipio, setApenasUmMunicipio] = useState<boolean>(true);
  const [outrosMunicipios, setOutrosMunicipios] = useState<MunicipioOperacaoPolicial[]>([]);
  const [extraUf, setExtraUf] = useState<string>('MG');
  const [municipiosExtra, setMunicipiosExtra] = useState<string[]>(() => getCachedMunicipiosPorUF('MG'));
  const [loadingMunExtra, setLoadingMunExtra] = useState<boolean>(false);
  const [extraMunicipio, setExtraMunicipio] = useState<string>('');

  // 3. Viaturas e Operadores da Unidade
  const [viaturasSelecionadas, setViaturasSelecionadas] = useState<ViaturaOperacaoPolicial[]>([]);
  const [operadoresSelecionados, setOperadoresSelecionados] = useState<OperadorOperacaoPolicial[]>(() => [
    {
      userId: currentUser.id,
      name: currentUser.name,
      masp: currentUser.masp || '',
      cargo: currentUser.cargo || '',
      unitId: effectiveUnitId,
      unitName: activeUnitName,
      isCreator: true,
      signed: true,
      signedAt: new Date().toISOString()
    }
  ]);
  const [operatorSearch, setOperatorSearch] = useState<string>('');

  // 4. Acionamento & Tipo de Atendimento
  const [acionamentoVia, setAcionamentoVia] = useState<AcionamentoViaOperacao>('CEPOLC');
  const [acionamentoOutrosDescricao, setAcionamentoOutrosDescricao] = useState<string>('');
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimentoOperacao>('Operação prevista');
  const [departamentosApoio, setDepartamentosApoio] = useState<string[]>([]);
  const [descricaoApoio, setDescricaoApoio] = useState<string>('');
  const [descricaoEmergencia, setDescricaoEmergencia] = useState<string>('');

  // 5. Sinopse
  const [sinopse, setSinopse] = useState<string>('');

  // 6. Detalhe Adicional (múltiplo)
  const [hasMandadoPrisao, setHasMandadoPrisao] = useState<boolean>(false);
  const [quantidadeAlvosStr, setQuantidadeAlvosStr] = useState<string>('1');
  const [quantidadePresosStr, setQuantidadePresosStr] = useState<string>('1');
  const [foragidoNoLocalChegada, setForagidoNoLocalChegada] = useState<boolean>(false);
  const [quantidadeFugiramStr, setQuantidadeFugiramStr] = useState<string>('1');
  const [descricaoFuga, setDescricaoFuga] = useState<string>('');

  const [hasMandadoBusca, setHasMandadoBusca] = useState<boolean>(false);
  const [materialArrecadado, setMaterialArrecadado] = useState<boolean>(false);
  const [materiaisBusca, setMateriaisBusca] = useState<MaterialArrecadadoBusca[]>([]);
  const [armasBusca, setArmasBusca] = useState<ArmaApreendidaBuscaItem[]>([]);
  const [armaBuscaTipoDraft, setArmaBuscaTipoDraft] = useState<TipoArmaApreendidaBusca>('Pistola');
  const [armaBuscaQtdDraft, setArmaBuscaQtdDraft] = useState<string>('1');
  const [drogasBusca, setDrogasBusca] = useState<DrogaApreendidaBuscaItem[]>([]);
  const [drogaBuscaTipoDraft, setDrogaBuscaTipoDraft] = useState<TipoDrogaApreendidaBusca>('MACONHA');
  const [drogaBuscaQtdDraft, setDrogaBuscaQtdDraft] = useState<string>('');
  const [drogaBuscaUnidadeDraft, setDrogaBuscaUnidadeDraft] = useState<UnidadeDrogaBusca>('kg');
  const [veiculosBusca, setVeiculosBusca] = useState<VeiculoApreendidoBuscaItem[]>([]);
  const [veiculoBuscaTipoDraft, setVeiculoBuscaTipoDraft] = useState<TipoVeiculoApreendidoBusca>('Carro');
  const [veiculoBuscaQtdDraft, setVeiculoBuscaQtdDraft] = useState<string>('1');
  const [materiaisBuscaOutros, setMateriaisBuscaOutros] = useState<string>('');

  const [hasGerenciamentoCrise, setHasGerenciamentoCrise] = useState<boolean>(false);
  const [tipoCrise, setTipoCrise] = useState<TipoCriseOperacao>('DISTÚRBIO');
  const [suicidioConsumado, setSuicidioConsumado] = useState<boolean>(false);
  const [atuacaoSuicidio, setAtuacaoSuicidio] = useState<AtuacaoSuicidioOperacao>('Negociador');
  const [atuacaoSuicidioOutros, setAtuacaoSuicidioOutros] = useState<string>('');
  const [tipoCriseOutros, setTipoCriseOutros] = useState<string>('');

  // 7. Uso de Arma de Fogo ou Incapacitação Elétrica
  const [utilizouArma, setUtilizouArma] = useState<boolean>(false);
  const [utilizouArmaFogo, setUtilizouArmaFogo] = useState<boolean>(false);
  const [armasFogo, setArmasFogo] = useState<ArmaFogoUtilizadaOperacao[]>([]);
  const [armaOrigemDraft, setArmaOrigemDraft] = useState<'ACERVO' | 'FORA_DO_ACERVO'>('ACERVO');
  const [weaponSearchDraft, setWeaponSearchDraft] = useState<string>('');
  const [selectedWeaponIdDraft, setSelectedWeaponIdDraft] = useState<string>('');
  const [foraMarcaDraft, setForaMarcaDraft] = useState<string>('');
  const [foraModeloDraft, setForaModeloDraft] = useState<string>('');
  const [foraSerieDraft, setForaSerieDraft] = useState<string>('');
  const [foraCalibreDraft, setForaCalibreDraft] = useState<string>('');
  const [tirosDraft, setTirosDraft] = useState<string>('0');

  const [utilizouArmaEletrica, setUtilizouArmaEletrica] = useState<boolean>(false);
  const [armasEletricas, setArmasEletricas] = useState<ArmaEletricaUtilizadaOperacao[]>([]);
  const [electricSearch, setElectricSearch] = useState<string>('');

  // 8. Óbito
  const [houveObito, setHouveObito] = useState<boolean>(false);
  const [quantidadeObitosStr, setQuantidadeObitosStr] = useState<string>('1');
  const [mesmaSinopseObito, setMesmaSinopseObito] = useState<boolean>(true);
  const [sinopseObito, setSinopseObito] = useState<string>('');
  const [sinopsesObitos, setSinopsesObitos] = useState<string[]>(['']);

  // Tick every second for 3-day countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Load primary state municipalities when estadoOperacao changes
  useEffect(() => {
    let active = true;
    const cached = getCachedMunicipiosPorUF(estadoOperacao);
    setMunicipiosPrimarios(cached);
    setLoadingMunPrimario(estadoOperacao !== 'MG');
    fetchMunicipiosPorUF(estadoOperacao)
      .then(list => {
        if (active) setMunicipiosPrimarios(list);
      })
      .finally(() => {
        if (active) setLoadingMunPrimario(false);
      });
    return () => {
      active = false;
    };
  }, [estadoOperacao]);

  // Load extra state municipalities when extraUf changes
  useEffect(() => {
    let active = true;
    const cached = getCachedMunicipiosPorUF(extraUf);
    setMunicipiosExtra(cached);
    setLoadingMunExtra(extraUf !== 'MG');
    fetchMunicipiosPorUF(extraUf)
      .then(list => {
        if (active) setMunicipiosExtra(list);
      })
      .finally(() => {
        if (active) setLoadingMunExtra(false);
      });
    return () => {
      active = false;
    };
  }, [extraUf]);

  // Load external editing report when triggered from "Meus Relatórios"
  useEffect(() => {
    if (editingReportExternal) {
      populateFormForEdit(editingReportExternal);
      if (onClearExternalEdit) onClearExternalEdit();
    }
  }, [editingReportExternal]);

  const allOpReports = useMemo(() => storage.getRelatoriosOperacoesPolicial(), [dataVersion, nowMs > 0]);

  // Editable reports within 3-day window where current user is cited
  const editableReports3Days = useMemo(() => {
    return allOpReports.filter(rel => {
      const rem = getPolOpRemainingEditMs(rel.createdAt, nowMs);
      if (rem <= 0) return false;
      const isCited =
        rel.criadorId === currentUser.id ||
        (rel.operadores || []).some(op => op.userId === currentUser.id);
      return isCited;
    });
  }, [allOpReports, nowMs, currentUser.id]);

  // Selected municipality keys (to prevent duplicates!)
  const selectedMunicipioKeys = useMemo(() => {
    const set = new Set<string>();
    if (estadoOperacao && municipioOperacao) {
      set.add(`${estadoOperacao}|${municipioOperacao.toLowerCase()}`);
    }
    for (const m of outrosMunicipios) {
      set.add(`${m.uf}|${m.municipio.toLowerCase()}`);
    }
    return set;
  }, [estadoOperacao, municipioOperacao, outrosMunicipios]);

  // Unit viaturas available (excluding already selected)
  const availableViaturas = useMemo(() => {
    const selectedIds = new Set(viaturasSelecionadas.map(v => v.id));
    return storage
      .getViaturas()
      .filter(v => (!effectiveUnitId || v.unitId === effectiveUnitId) && !selectedIds.has(v.id))
      .sort((a, b) => a.placa.localeCompare(b.placa, 'pt-BR'));
  }, [viaturasSelecionadas, effectiveUnitId, dataVersion]);

  // Unit operators available (excluding already selected)
  const availableUnitOperators = useMemo(() => {
    const selectedIds = new Set(operadoresSelecionados.map(o => o.userId));
    const q = normalizeText(operatorSearch);
    return allUsers
      .filter(u => {
        if (!u?.id || selectedIds.has(u.id)) return false;
        if (effectiveUnitId && u.unitId !== effectiveUnitId) return false;
        if (q) {
          const hay = normalizeText(`${u.name} ${u.masp} ${u.cargo}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, operadoresSelecionados, effectiveUnitId, operatorSearch]);

  // Available support departments (excluding already selected)
  const availableDeptsApoio = useMemo(() => {
    const selected = new Set(departamentosApoio);
    return DEPARTAMENTOS_APOIO_OPERACAO.filter(d => !selected.has(d));
  }, [departamentosApoio]);

  // Weapons from Acervo — mostra armas disponíveis na unidade e filtra ao vivo por série, marca, modelo, calibre ou descrição
  const filteredAcervoWeapons = useMemo(() => {
    const allW = storage.getAllWeaponsForLookup();
    const q = normalizeText(weaponSearchDraft);
    const unitFiltered = effectiveUnitId ? allW.filter(w => w.unitId === effectiveUnitId) : allW;
    const baseList = unitFiltered.length > 0 ? unitFiltered : allW;
    return baseList
      .filter(w => {
        if (!q) return true;
        const hay = normalizeText(
          `${w.serialNumber} ${w.manufacturer} ${w.model} ${w.caliber} ${w.type} ${w.status || ''} ${w.maintenanceReason || ''} ${(w as { observations?: string; description?: string }).observations || ''} ${(w as { observations?: string; description?: string }).description || ''}`
        );
        return hay.includes(q);
      })
      .sort((a, b) => (a.serialNumber || '').localeCompare(b.serialNumber || '', 'pt-BR'));
  }, [weaponSearchDraft, effectiveUnitId, dataVersion]);

  // Unit electrical incapacitation / materials — ACAUTELADOS first, then unit available
  const unitElectricOptions = useMemo<ArmaEletricaUtilizadaOperacao[]>(() => {
    const unitMaterials = storage
      .getMateriais(currentUser)
      .filter(m => !effectiveUnitId || m.unidadeId === effectiveUnitId);
    const matMap = new Map(unitMaterials.map(m => [m.id, m]));

    const activeStatuses = new Set(['AUTORIZADA', 'Em Uso', 'DEVOLUCAO_PENDENTE', 'PENDENTE']);
    const unitCautelas = storage
      .getAllCautelasMateriaisForUnit(effectiveUnitId)
      .filter(c => activeStatuses.has(c.status));

    const selectedKeys = new Set(armasEletricas.map(a => a.key));
    const items: ArmaEletricaUtilizadaOperacao[] = [];

    // 1. Prioritariamente: Equipamentos ACAUTELADOS para a unidade
    for (const c of unitCautelas) {
      const mat = matMap.get(c.materialId);
      const key = `caut:${c.id}`;
      if (selectedKeys.has(key)) continue;
      items.push({
        key,
        materialId: c.materialId,
        tipo: c.tipoMaterialNome || mat?.tipoMaterialNome || 'Material',
        nome: c.materialNome || mat?.nome || 'Equipamento',
        numeroSerie: mat?.numeroSerie || undefined,
        acautelado: true,
        cautelaId: c.id,
        usuarioCautelaNome: c.usuarioInternoNome || c.usuarioExternoNome || 'Policial',
        usuarioCautelaMasp: c.usuarioInternoMasp || c.usuarioExternoDocumento || ''
      });
    }

    // 2. Demais materiais disponíveis na unidade (não acautelados / acervo da unidade)
    for (const m of unitMaterials) {
      const key = `mat:${m.id}`;
      if (selectedKeys.has(key)) continue;
      items.push({
        key,
        materialId: m.id,
        tipo: m.tipoMaterialNome || 'Material',
        nome: m.nome,
        numeroSerie: m.numeroSerie || undefined,
        acautelado: false
      });
    }

    const q = normalizeText(electricSearch);
    const filtered = q
      ? items.filter(it =>
          normalizeText(`${it.tipo} ${it.nome} ${it.numeroSerie || ''} ${it.usuarioCautelaNome || ''}`).includes(q)
        )
      : items;

    // Sort: Acautelados first, then electrical-related keywords first, then alphabetically
    const isElectricKeyword = (it: ArmaEletricaUtilizadaOperacao) => {
      const t = normalizeText(`${it.tipo} ${it.nome}`);
      return (
        t.includes('taser') ||
        t.includes('spark') ||
        t.includes('eletr') ||
        t.includes('incapacit') ||
        t.includes('condor') ||
        t.includes('choque') ||
        t.includes('aie')
      );
    };

    return filtered.sort((a, b) => {
      if (a.acautelado !== b.acautelado) return a.acautelado ? -1 : 1;
      const ae = isElectricKeyword(a) ? 0 : 1;
      const be = isElectricKeyword(b) ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [currentUser, effectiveUnitId, armasEletricas, electricSearch, dataVersion]);

  const resetForm = () => {
    setEditingReport(null);
    setDataOperacao(getTodayBrasilia());
    setHoraSaidaBase('06:00');
    setHoraOperacao('06:00');
    setEstadoOperacao('MG');
    setMunicipioOperacao('');
    setApenasUmMunicipio(true);
    setOutrosMunicipios([]);
    setExtraUf('MG');
    setExtraMunicipio('');
    setViaturasSelecionadas([]);
    setOperadoresSelecionados([
      {
        userId: currentUser.id,
        name: currentUser.name,
        masp: currentUser.masp || '',
        cargo: currentUser.cargo || '',
        unitId: effectiveUnitId,
        unitName: activeUnitName,
        isCreator: true,
        signed: true,
        signedAt: new Date().toISOString()
      }
    ]);
    setOperatorSearch('');
    setAcionamentoVia('CEPOLC');
    setAcionamentoOutrosDescricao('');
    setTipoAtendimento('Operação prevista');
    setDepartamentosApoio([]);
    setDescricaoApoio('');
    setDescricaoEmergencia('');
    setSinopse('');
    setHasMandadoPrisao(false);
    setQuantidadeAlvosStr('1');
    setQuantidadePresosStr('1');
    setForagidoNoLocalChegada(false);
    setQuantidadeFugiramStr('1');
    setDescricaoFuga('');
    setHasMandadoBusca(false);
    setMaterialArrecadado(false);
    setMateriaisBusca([]);
    setArmasBusca([]);
    setArmaBuscaTipoDraft('Pistola');
    setArmaBuscaQtdDraft('1');
    setDrogasBusca([]);
    setDrogaBuscaTipoDraft('MACONHA');
    setDrogaBuscaQtdDraft('');
    setDrogaBuscaUnidadeDraft('kg');
    setVeiculosBusca([]);
    setVeiculoBuscaTipoDraft('Carro');
    setVeiculoBuscaQtdDraft('1');
    setMateriaisBuscaOutros('');
    setHasGerenciamentoCrise(false);
    setTipoCrise('DISTÚRBIO');
    setSuicidioConsumado(false);
    setAtuacaoSuicidio('Negociador');
    setAtuacaoSuicidioOutros('');
    setTipoCriseOutros('');
    setUtilizouArma(false);
    setUtilizouArmaFogo(false);
    setArmasFogo([]);
    setArmaOrigemDraft('ACERVO');
    setWeaponSearchDraft('');
    setSelectedWeaponIdDraft('');
    setForaMarcaDraft('');
    setForaModeloDraft('');
    setForaSerieDraft('');
    setForaCalibreDraft('');
    setTirosDraft('0');
    setUtilizouArmaEletrica(false);
    setArmasEletricas([]);
    setElectricSearch('');
    setHouveObito(false);
    setQuantidadeObitosStr('1');
    setMesmaSinopseObito(true);
    setSinopseObito('');
    setSinopsesObitos(['']);
  };

  const populateFormForEdit = (rel: RelatorioOperacaoPolicial) => {
    setFeedback(null);
    setEditingReport(rel);
    setDataOperacao(String(rel.dataOperacao || getTodayBrasilia()).slice(0, 10));
    setHoraSaidaBase(rel.horaSaidaBase || '06:00');
    setHoraOperacao(rel.horaOperacao || '06:00');
    setEstadoOperacao(rel.estadoOperacao || 'MG');
    setMunicipioOperacao(rel.municipioOperacao || '');
    setApenasUmMunicipio(rel.apenasUmMunicipio !== false);
    setOutrosMunicipios(Array.isArray(rel.outrosMunicipios) ? rel.outrosMunicipios : []);
    setViaturasSelecionadas(Array.isArray(rel.viaturas) ? rel.viaturas : []);
    setOperadoresSelecionados(Array.isArray(rel.operadores) ? rel.operadores : []);
    setAcionamentoVia(rel.acionamentoVia || 'CEPOLC');
    setAcionamentoOutrosDescricao(rel.acionamentoOutrosDescricao || '');
    setTipoAtendimento(rel.tipoAtendimento || 'Operação prevista');
    setDepartamentosApoio(Array.isArray(rel.departamentosApoio) ? rel.departamentosApoio : []);
    setDescricaoApoio(rel.descricaoApoio || '');
    setDescricaoEmergencia(rel.descricaoEmergencia || '');
    setSinopse(rel.sinopse || '');

    const det = rel.detalhesAdicionais || {};
    setHasMandadoPrisao(Boolean(det.mandadoPrisao?.ativo));
    const alvosEdit = Math.max(1, Math.min(99, Number(det.mandadoPrisao?.quantidadeAlvos) || 1));
    const presosEdit =
      det.mandadoPrisao?.quantidadePresos !== undefined
        ? Math.max(0, Math.min(alvosEdit, Number(det.mandadoPrisao.quantidadePresos) || 0))
        : det.mandadoPrisao?.foragidoPreso !== false
        ? alvosEdit
        : 0;
    setQuantidadeAlvosStr(String(alvosEdit));
    setQuantidadePresosStr(String(presosEdit));
    setForagidoNoLocalChegada(Boolean(det.mandadoPrisao?.foragidoNoLocalChegada));
    setQuantidadeFugiramStr(String(Math.max(1, Number(det.mandadoPrisao?.quantidadeFugiram) || Math.max(1, alvosEdit - presosEdit))));
    setDescricaoFuga(det.mandadoPrisao?.descricaoFuga || '');

    setHasMandadoBusca(Boolean(det.mandadoBusca?.ativo));
    setMaterialArrecadado(Boolean(det.mandadoBusca?.materialArrecadado));
    setMateriaisBusca(Array.isArray(det.mandadoBusca?.materiais) ? det.mandadoBusca!.materiais : []);
    setArmasBusca(Array.isArray(det.mandadoBusca?.armasArrecadadas) ? det.mandadoBusca!.armasArrecadadas! : []);
    setDrogasBusca(Array.isArray(det.mandadoBusca?.drogasArrecadadas) ? det.mandadoBusca!.drogasArrecadadas! : []);
    setVeiculosBusca(Array.isArray(det.mandadoBusca?.veiculosArrecadados) ? det.mandadoBusca!.veiculosArrecadados! : []);
    setMateriaisBuscaOutros(det.mandadoBusca?.outrosDetalhes || '');

    setHasGerenciamentoCrise(Boolean(det.gerenciamentoCrise?.ativo));
    setTipoCrise(det.gerenciamentoCrise?.tipo || 'DISTÚRBIO');
    setSuicidioConsumado(Boolean(det.gerenciamentoCrise?.suicidioConsumado));
    setAtuacaoSuicidio(det.gerenciamentoCrise?.atuacaoAdotada || 'Negociador');
    setAtuacaoSuicidioOutros(det.gerenciamentoCrise?.atuacaoOutrosDescricao || '');
    setTipoCriseOutros(det.gerenciamentoCrise?.outrosDetalhes || '');

    setUtilizouArma(Boolean(rel.utilizouArmaFogoOuEletrica));
    setUtilizouArmaFogo(Boolean(rel.utilizouArmaFogo));
    setArmasFogo(Array.isArray(rel.armasFogo) ? rel.armasFogo : []);
    setUtilizouArmaEletrica(Boolean(rel.utilizouArmaEletrica));
    setArmasEletricas(Array.isArray(rel.armasEletricas) ? rel.armasEletricas : []);

    const hasOb = Boolean(rel.houveObito);
    const qtdOb = hasOb ? Math.max(1, Math.min(99, Number(rel.quantidadeObitos) || 1)) : 1;
    const mesmaOb = rel.mesmaSinopseObito !== false;
    setHouveObito(hasOb);
    setQuantidadeObitosStr(String(qtdOb));
    setMesmaSinopseObito(mesmaOb);
    setSinopseObito(rel.sinopseObito || '');
    setSinopsesObitos(
      !mesmaOb && Array.isArray(rel.sinopsesObitos) && rel.sinopsesObitos.length > 0
        ? Array.from({ length: qtdOb }, (_, i) => rel.sinopsesObitos?.[i] || '')
        : Array.from({ length: qtdOb }, () => '')
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddOutroMunicipio = () => {
    if (!extraUf || !extraMunicipio) return;
    const key = `${extraUf}|${extraMunicipio.toLowerCase()}`;
    if (selectedMunicipioKeys.has(key)) return;
    setOutrosMunicipios(prev => [...prev, { uf: extraUf, municipio: extraMunicipio }]);
    setExtraMunicipio('');
  };

  const handleAddViatura = (viaturaId: string) => {
    if (!viaturaId) return;
    const v = storage.getViaturas().find(item => item.id === viaturaId);
    if (!v || viaturasSelecionadas.some(x => x.id === v.id)) return;
    setViaturasSelecionadas(prev => [...prev, { id: v.id, placa: v.placa, descricao: v.descricao }]);
  };

  const handleAddOperator = (u: User) => {
    if (operadoresSelecionados.some(op => op.userId === u.id)) return;
    setOperadoresSelecionados(prev => [
      ...prev,
      {
        userId: u.id,
        name: u.name,
        masp: u.masp || '',
        cargo: u.cargo || '',
        unitId: u.unitId || effectiveUnitId,
        unitName: activeUnitName,
        isCreator: false,
        signed: false,
        signedAt: null
      }
    ]);
  };

  const handleAddArmaFogo = () => {
    setFeedback(null);
    const shots = Math.max(0, Math.floor(Number(tirosDraft) || 0));
    if (armaOrigemDraft === 'ACERVO') {
      const w = storage.getAllWeaponsForLookup().find(item => item.id === selectedWeaponIdDraft);
      if (!w) {
        setFeedback({ type: 'error', message: 'Selecione uma arma do acervo pelo número de série.' });
        return;
      }
      setArmasFogo(prev => [
        ...prev,
        {
          id: `af-${Date.now()}-${prev.length}`,
          origem: 'ACERVO',
          weaponId: w.id,
          marca: w.manufacturer || '',
          modelo: w.model || '',
          numeroSerie: w.serialNumber || '',
          calibre: w.caliber || '',
          quantidadeTiros: shots
        }
      ]);
      setSelectedWeaponIdDraft('');
      setWeaponSearchDraft('');
      setTirosDraft('0');
    } else {
      if (!foraMarcaDraft.trim() || !foraModeloDraft.trim() || !foraSerieDraft.trim() || !foraCalibreDraft.trim()) {
        setFeedback({
          type: 'error',
          message: 'Para arma fora do acervo, preencha Marca, Modelo, Número de Série e Calibre.'
        });
        return;
      }
      setArmasFogo(prev => [
        ...prev,
        {
          id: `af-${Date.now()}-${prev.length}`,
          origem: 'FORA_DO_ACERVO',
          marca: foraMarcaDraft.trim(),
          modelo: foraModeloDraft.trim(),
          numeroSerie: foraSerieDraft.trim().toUpperCase(),
          calibre: foraCalibreDraft.trim(),
          quantidadeTiros: shots
        }
      ]);
      setForaMarcaDraft('');
      setForaModeloDraft('');
      setForaSerieDraft('');
      setForaCalibreDraft('');
      setTirosDraft('0');
    }
  };

  const handleSave = async (shouldPrint: boolean) => {
    setFeedback(null);

    if (!municipioOperacao) {
      setFeedback({ type: 'error', message: 'Selecione o município da operação.' });
      return;
    }
    if (!apenasUmMunicipio && outrosMunicipios.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Adicione ao menos um outro município ou altere para operação em apenas um município.'
      });
      return;
    }
    if (acionamentoVia === 'OUTROS' && !acionamentoOutrosDescricao.trim()) {
      setFeedback({ type: 'error', message: 'Informe a Descrição de Outros no acionamento.' });
      return;
    }
    if (
      (tipoAtendimento === 'Operação prevista' || tipoAtendimento === 'Operação extraordinária') &&
      departamentosApoio.length === 0
    ) {
      setFeedback({ type: 'error', message: 'Selecione ao menos um Departamento de Apoio.' });
      return;
    }
    if (tipoAtendimento === 'Operação extraordinária' && !descricaoApoio.trim()) {
      setFeedback({ type: 'error', message: 'Informe a Descrição do Apoio.' });
      return;
    }
    if (tipoAtendimento === 'Emergencial' && !descricaoEmergencia.trim()) {
      setFeedback({ type: 'error', message: 'Informe a Descrição da Emergência.' });
      return;
    }
    if (!sinopse.trim()) {
      setFeedback({ type: 'error', message: 'Preencha a Sinopse da operação.' });
      return;
    }
    const alvosNum = Math.max(1, Math.min(99, parseInt(quantidadeAlvosStr || '0', 10) || 0));
    const presosNum = Math.max(0, Math.min(alvosNum, parseInt(quantidadePresosStr || '0', 10) || 0));
    const foragidosRestantes = Math.max(0, alvosNum - presosNum);
    const fugiramNum = Math.max(1, Math.min(Math.max(1, foragidosRestantes), parseInt(quantidadeFugiramStr || '1', 10) || 1));

    if (hasMandadoPrisao) {
      if (!quantidadeAlvosStr || parseInt(quantidadeAlvosStr, 10) < 1) {
        setFeedback({ type: 'error', message: 'Informe quantos eram os alvos no Mandado de Prisão (1 a 99).' });
        return;
      }
      if (quantidadePresosStr === '' || parseInt(quantidadePresosStr, 10) > alvosNum) {
        setFeedback({ type: 'error', message: 'A quantidade de presos não pode ser maior que a quantidade de alvos.' });
        return;
      }
      if (foragidosRestantes > 0 && foragidoNoLocalChegada && !descricaoFuga.trim()) {
        setFeedback({
          type: 'error',
          message: 'Descreva como ocorreu a fuga do(s) foragido(s) (até 500 caracteres).'
        });
        return;
      }
    }

    if (hasMandadoBusca && materialArrecadado) {
      if (materiaisBusca.length === 0) {
        setFeedback({ type: 'error', message: 'Selecione ao menos um tipo de material arrecadado no Mandado de Busca.' });
        return;
      }
      if (materiaisBusca.includes('ARMA') && armasBusca.length === 0) {
        setFeedback({ type: 'error', message: 'Adicione ao menos um tipo e quantidade de arma apreendida no Mandado de Busca.' });
        return;
      }
      if (materiaisBusca.includes('DROGA') && drogasBusca.length === 0) {
        setFeedback({ type: 'error', message: 'Adicione ao menos um tipo, quantidade e unidade de droga apreendida no Mandado de Busca.' });
        return;
      }
      if (materiaisBusca.includes('VEÍCULOS') && veiculosBusca.length === 0) {
        setFeedback({ type: 'error', message: 'Adicione ao menos um tipo e quantidade de veículo apreendido no Mandado de Busca.' });
        return;
      }
    }

    if (
      hasGerenciamentoCrise &&
      tipoCrise === 'SUICÍDIO' &&
      atuacaoSuicidio === 'Outros' &&
      !atuacaoSuicidioOutros.trim()
    ) {
      setFeedback({
        type: 'error',
        message: 'Descreva a atuação adotada em Outros no Gerenciamento de Crise (até 250 caracteres).'
      });
      return;
    }

    if (utilizouArma && !utilizouArmaFogo && !utilizouArmaEletrica) {
      setFeedback({
        type: 'error',
        message: 'Selecione se foi utilizada Arma de Fogo e/ou Arma de Incapacitação Elétrica.'
      });
      return;
    }
    if (utilizouArma && utilizouArmaFogo && armasFogo.length === 0) {
      setFeedback({ type: 'error', message: 'Adicione ao menos uma arma de fogo utilizada.' });
      return;
    }
    if (utilizouArma && utilizouArmaEletrica && armasEletricas.length === 0) {
      setFeedback({ type: 'error', message: 'Selecione ao menos uma arma de incapacitação elétrica.' });
      return;
    }

    const qtdObitosNum = houveObito ? Math.max(1, Math.min(99, parseInt(quantidadeObitosStr || '1', 10) || 1)) : 0;
    const sinopsesObitosTrim = Array.from({ length: qtdObitosNum }, (_, i) => (sinopsesObitos[i] || '').trim());
    if (houveObito) {
      if (!quantidadeObitosStr || parseInt(quantidadeObitosStr, 10) < 1) {
        setFeedback({ type: 'error', message: 'Informe a quantidade de mortos (1 a 99).' });
        return;
      }
      if (mesmaSinopseObito) {
        if (!sinopseObito.trim()) {
          setFeedback({ type: 'error', message: 'Informe a sinopse sobre o momento do óbito.' });
          return;
        }
      } else {
        const emptyIdx = sinopsesObitosTrim.findIndex(s => !s);
        if (emptyIdx !== -1) {
          setFeedback({
            type: 'error',
            message: `Preencha a sinopse individual do Óbito ${emptyIdx + 1}.`
          });
          return;
        }
      }
    }

    const payload: Partial<RelatorioOperacaoPolicial> = {
      dataOperacao,
      horaSaidaBase,
      horaOperacao,
      estadoOperacao,
      municipioOperacao,
      apenasUmMunicipio,
      outrosMunicipios: apenasUmMunicipio ? [] : outrosMunicipios,
      viaturas: viaturasSelecionadas,
      operadores: operadoresSelecionados,
      acionamentoVia,
      acionamentoOutrosDescricao: acionamentoVia === 'OUTROS' ? acionamentoOutrosDescricao.trim() : '',
      tipoAtendimento,
      departamentosApoio:
        tipoAtendimento === 'Operação prevista' || tipoAtendimento === 'Operação extraordinária'
          ? departamentosApoio
          : [],
      descricaoApoio: tipoAtendimento === 'Operação extraordinária' ? descricaoApoio.trim() : '',
      descricaoEmergencia: tipoAtendimento === 'Emergencial' ? descricaoEmergencia.trim() : '',
      sinopse: sinopse.trim(),
      detalhesAdicionais: {
        ...(hasMandadoPrisao
          ? {
              mandadoPrisao: {
                ativo: true,
                foragidoPreso: presosNum >= alvosNum,
                quantidadeAlvos: alvosNum,
                quantidadePresos: presosNum,
                ...(foragidosRestantes > 0 ? { foragidoNoLocalChegada } : {}),
                ...(foragidosRestantes > 0 && foragidoNoLocalChegada
                  ? { quantidadeFugiram: fugiramNum, descricaoFuga: descricaoFuga.trim() }
                  : {})
              }
            }
          : {}),
        ...(hasMandadoBusca
          ? {
              mandadoBusca: {
                ativo: true,
                materialArrecadado,
                materiais: materialArrecadado ? materiaisBusca : [],
                armasArrecadadas: materialArrecadado && materiaisBusca.includes('ARMA') ? armasBusca : [],
                drogasArrecadadas: materialArrecadado && materiaisBusca.includes('DROGA') ? drogasBusca : [],
                veiculosArrecadados: materialArrecadado && materiaisBusca.includes('VEÍCULOS') ? veiculosBusca : [],
                outrosDetalhes:
                  materialArrecadado && materiaisBusca.includes('OUTROS') ? materiaisBuscaOutros.trim() : ''
              }
            }
          : {}),
        ...(hasGerenciamentoCrise
          ? {
              gerenciamentoCrise: {
                ativo: true,
                tipo: tipoCrise,
                ...(tipoCrise === 'SUICÍDIO'
                  ? {
                      suicidioConsumado,
                      atuacaoAdotada: atuacaoSuicidio,
                      atuacaoOutrosDescricao: atuacaoSuicidio === 'Outros' ? atuacaoSuicidioOutros.trim() : ''
                    }
                  : {}),
                outrosDetalhes: tipoCrise === 'OUTROS' ? tipoCriseOutros.trim() : ''
              }
            }
          : {})
      },
      utilizouArmaFogoOuEletrica: utilizouArma,
      utilizouArmaFogo: utilizouArma && utilizouArmaFogo,
      armasFogo: utilizouArma && utilizouArmaFogo ? armasFogo : [],
      utilizouArmaEletrica: utilizouArma && utilizouArmaEletrica,
      armasEletricas: utilizouArma && utilizouArmaEletrica ? armasEletricas : [],
      houveObito,
      quantidadeObitos: qtdObitosNum,
      mesmaSinopseObito: houveObito ? mesmaSinopseObito : true,
      sinopseObito: houveObito && mesmaSinopseObito ? sinopseObito.trim() : '',
      sinopsesObitos: houveObito && !mesmaSinopseObito ? sinopsesObitosTrim : [],
      departmentId: effectiveDeptId || undefined,
      unitId: effectiveUnitId || undefined,
      unitName: activeUnitName || undefined
    };

    setIsSubmitting(true);
    try {
      const res = editingReport
        ? await storage.updateRelatorioOperacaoPolicial(editingReport.id, payload)
        : await storage.saveRelatorioOperacaoPolicial(payload);

      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao salvar relatório de operação.' });
        return;
      }

      const savedData = res.data;
      setFeedback({
        type: 'success',
        message: editingReport
          ? 'Relatório de operação atualizado com sucesso!'
          : 'Relatório de operação salvo com sucesso!'
      });
      resetForm();
      if (onSaved) onSaved();
      if (shouldPrint && savedData) {
        printRelatorioOperacaoPolicial(savedData, units, departments, activeUnitName, activeDeptName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await storage.deleteRelatorioOperacaoPolicial(id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir relatório de operação.' });
        return;
      }
      setConfirmDeleteId(null);
      if (editingReport?.id === id) resetForm();
      setFeedback({ type: 'success', message: 'Relatório de operação excluído com sucesso.' });
      if (onSaved) onSaved();
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMaterialBusca = (m: MaterialArrecadadoBusca) => {
    setMateriaisBusca(prev => {
      const removing = prev.includes(m);
      if (removing) {
        if (m === 'ARMA') setArmasBusca([]);
        if (m === 'DROGA') setDrogasBusca([]);
        if (m === 'VEÍCULOS') setVeiculosBusca([]);
        if (m === 'OUTROS') setMateriaisBuscaOutros('');
        return prev.filter(x => x !== m);
      }
      return [...prev, m];
    });
  };

  const handleAddArmaBusca = () => {
    const qtd = Math.max(1, Math.min(9999, parseInt(armaBuscaQtdDraft || '1', 10) || 1));
    setArmasBusca(prev => {
      const idx = prev.findIndex(item => item.tipo === armaBuscaTipoDraft);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + qtd };
        return copy;
      }
      return [...prev, { tipo: armaBuscaTipoDraft, quantidade: qtd }];
    });
    setArmaBuscaQtdDraft('1');
  };

  const handleAddDrogaBusca = () => {
    const parsed = parseFloat(drogaBuscaQtdDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFeedback({ type: 'error', message: 'Informe uma quantidade válida de droga apreendida (maior que 0).' });
      return;
    }
    setFeedback(null);
    const rounded = Math.round(parsed * 1000) / 1000;
    setDrogasBusca(prev => [
      ...prev,
      { tipo: drogaBuscaTipoDraft, quantidade: rounded, unidade: drogaBuscaUnidadeDraft }
    ]);
    setDrogaBuscaQtdDraft('');
  };

  const handleAddVeiculoBusca = () => {
    const qtd = Math.max(1, Math.min(9999, parseInt(veiculoBuscaQtdDraft || '1', 10) || 1));
    setVeiculosBusca(prev => {
      const idx = prev.findIndex(item => item.tipo === veiculoBuscaTipoDraft);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: copy[idx].quantidade + qtd };
        return copy;
      }
      return [...prev, { tipo: veiculoBuscaTipoDraft, quantidade: qtd }];
    });
    setVeiculoBuscaQtdDraft('1');
  };

  const handleQuantidadeAlvosChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setQuantidadeAlvosStr(digits);
    // Inicialmente o número de presos acompanha o número de alvos, podendo ser alterado depois
    setQuantidadePresosStr(digits);
    setForagidoNoLocalChegada(false);
    setQuantidadeFugiramStr('1');
    setDescricaoFuga('');
  };

  const handleQuantidadePresosChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (digits === '') {
      setQuantidadePresosStr('');
      return;
    }
    const maxAlvos = Math.max(0, parseInt(quantidadeAlvosStr || '0', 10) || 0);
    const val = Math.min(maxAlvos, parseInt(digits, 10) || 0);
    setQuantidadePresosStr(String(val));
    const rem = Math.max(0, maxAlvos - val);
    if (rem === 0) {
      setForagidoNoLocalChegada(false);
      setDescricaoFuga('');
    } else {
      setQuantidadeFugiramStr(String(rem));
    }
  };

  const handleQuantidadeObitosChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setQuantidadeObitosStr(digits);
    const n = Math.max(1, Math.min(99, parseInt(digits || '1', 10) || 1));
    setSinopsesObitos(prev => Array.from({ length: n }, (_, i) => prev[i] || ''));
  };

  return (
    <div className="space-y-5">
      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/10 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Relatórios Editáveis (Janela de 3 dias a contar da criação) */}
      {editableReports3Days.length > 0 && (
        <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Relatórios de Operações Disponíveis para Edição — Prazo 3 Dias ({editableReports3Days.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Qualquer operador citado pode editar ou excluir durante 3 dias a contar da criação
            </span>
          </div>

          <div className="space-y-2">
            {editableReports3Days.map(rel => {
              const remMs = getPolOpRemainingEditMs(rel.createdAt, nowMs);
              const isEditingThis = editingReport?.id === rel.id;
              return (
                <div
                  key={rel.id}
                  className={`bg-slate-950/70 border rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                    isEditingThis ? 'border-cyan-400' : 'border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-100">{formatDateBr(rel.dataOperacao)}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                        {rel.municipioOperacao}/{rel.estadoOperacao}
                        {!rel.apenasUmMunicipio && rel.outrosMunicipios.length > 0
                          ? ` +${rel.outrosMunicipios.length}`
                          : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                        {rel.tipoAtendimento}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">
                        Restante: {formatRemainingCountdown(remMs)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-1">{rel.sinopse}</p>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => populateFormForEdit(rel)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>{isEditingThis ? 'Editando' : 'Editar'}</span>
                    </button>

                    {confirmDeleteId === rel.id ? (
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleDelete(rel.id)}
                          className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-red-600 hover:bg-red-500 text-white"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg font-bold text-[11px] bg-slate-800 text-slate-300"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(rel.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                        title="Excluir relatório"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulário Sinopse de Operação — Tela Limpa & Progressiva */}
      <div
        className={`bg-slate-900 border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 ${
          editingReport ? 'border-cyan-500/60' : 'border-slate-800'
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-xl border ${
                editingReport
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide font-mono">
                  {editingReport ? 'Editando Sinopse de Operação' : 'Sinopse de Operação'}
                </h2>
                {editingReport && (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold uppercase">
                    Modo Edição
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Unidade {activeUnitName} • Preencha os campos abaixo; opções adicionais aparecem conforme suas escolhas.
              </p>
            </div>
          </div>

          {editingReport && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-700 transition self-start"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar Edição</span>
            </button>
          )}
        </div>

        {/* 1. Data e Horários */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <label className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-400 uppercase">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Data da Operação *</span>
            </label>
            <input
              type="date"
              value={dataOperacao}
              onChange={e => setDataOperacao(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <label className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-400 uppercase">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Hora de Saída da Base *</span>
            </label>
            <input
              type="time"
              value={horaSaidaBase}
              onChange={e => setHoraSaidaBase(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <label className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-400 uppercase">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Hora da Operação *</span>
            </label>
            <input
              type="time"
              value={horaOperacao}
              onChange={e => setHoraOperacao(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* 2. Localização (Estado + Município + Outros municípios) */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
          <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase text-[11px] tracking-wider">
            <MapPin className="w-4 h-4" />
            <span>Local da Operação</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Estado da Operação *
              </label>
              <select
                value={estadoOperacao}
                onChange={e => {
                  setEstadoOperacao(e.target.value);
                  setMunicipioOperacao('');
                }}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-amber-500"
              >
                {ESTADOS_BR.map(uf => (
                  <option key={uf.sigla} value={uf.sigla}>
                    {uf.sigla} — {uf.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Município ({estadoOperacao}) *
              </label>
              <select
                value={municipioOperacao}
                disabled={loadingMunPrimario}
                onChange={e => setMunicipioOperacao(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-amber-500 disabled:opacity-50"
              >
                <option value="">
                  {loadingMunPrimario ? 'Carregando municípios...' : 'Selecione o município...'}
                </option>
                {municipiosPrimarios.map(city => {
                  const alreadyInExtras = outrosMunicipios.some(
                    m => m.uf === estadoOperacao && m.municipio.toLowerCase() === city.toLowerCase()
                  );
                  return (
                    <option key={city} value={city} disabled={alreadyInExtras}>
                      {city}{alreadyInExtras ? ' (já selecionado)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Operação apenas em um município? *
              </label>
              <select
                value={apenasUmMunicipio ? 'SIM' : 'NAO'}
                onChange={e => {
                  const isOne = e.target.value === 'SIM';
                  setApenasUmMunicipio(isOne);
                  if (isOne) setOutrosMunicipios([]);
                }}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="SIM">
                  Sim, somente {municipioOperacao || 'o município selecionado'}
                </option>
                <option value="NAO">Não, teve outro(s) município(s)</option>
              </select>
            </div>
          </div>

          {!apenasUmMunicipio && (
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Outro Estado
                  </label>
                  <select
                    value={extraUf}
                    onChange={e => {
                      setExtraUf(e.target.value);
                      setExtraMunicipio('');
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400"
                  >
                    {ESTADOS_BR.map(uf => (
                      <option key={uf.sigla} value={uf.sigla}>
                        {uf.sigla} — {uf.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Outro Município ({extraUf})
                  </label>
                  <select
                    value={extraMunicipio}
                    disabled={loadingMunExtra}
                    onChange={e => setExtraMunicipio(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  >
                    <option value="">
                      {loadingMunExtra ? 'Carregando municípios...' : 'Selecione o município...'}
                    </option>
                    {municipiosExtra.map(city => {
                      const used = selectedMunicipioKeys.has(`${extraUf}|${city.toLowerCase()}`);
                      return (
                        <option key={city} value={city} disabled={used}>
                          {city}{used ? ' (já selecionado)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="button"
                    disabled={!extraMunicipio}
                    onClick={handleAddOutroMunicipio}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>

              {outrosMunicipios.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {outrosMunicipios.map(m => (
                    <span
                      key={`${m.uf}|${m.municipio}`}
                      className="inline-flex items-center space-x-1.5 bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>{m.municipio} / {m.uf}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setOutrosMunicipios(prev =>
                            prev.filter(x => !(x.uf === m.uf && x.municipio === m.municipio))
                          )
                        }
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Viaturas & Operadores da Unidade (sem limites, sem duplicação) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Viaturas */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 text-[11px] font-bold text-amber-400 uppercase">
                <Car className="w-4 h-4" />
                <span>Viaturas da Unidade</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {viaturasSelecionadas.length} selecionada(s)
              </span>
            </div>

            <select
              value=""
              onChange={e => handleAddViatura(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="">
                {availableViaturas.length > 0
                  ? '+ Selecionar viatura da unidade...'
                  : 'Nenhuma viatura disponível para adicionar'}
              </option>
              {availableViaturas.map(v => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.descricao}
                </option>
              ))}
            </select>

            {viaturasSelecionadas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {viaturasSelecionadas.map(v => (
                  <span
                    key={v.id}
                    className="inline-flex items-center space-x-1.5 bg-slate-900 border border-amber-500/40 text-amber-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                  >
                    <Car className="w-3 h-3 text-amber-400" />
                    <span className="font-mono font-bold">{v.placa}</span>
                    {v.descricao && <span className="text-slate-300 font-normal">• {v.descricao}</span>}
                    <button
                      type="button"
                      onClick={() => setViaturasSelecionadas(prev => prev.filter(x => x.id !== v.id))}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Operadores */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center space-x-1.5 text-[11px] font-bold text-cyan-400 uppercase">
                <Users className="w-4 h-4" />
                <span>Operadores da Unidade</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {operadoresSelecionados.length} selecionado(s)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {operadoresSelecionados.map(op => (
                <span
                  key={op.userId}
                  className="inline-flex items-center space-x-1.5 bg-slate-900 border border-cyan-500/40 text-cyan-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                >
                  <span>{op.name}</span>
                  {op.isCreator && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase">
                      Digitador
                    </span>
                  )}
                  {!op.isCreator && (
                    <button
                      type="button"
                      onClick={() =>
                        setOperadoresSelecionados(prev => prev.filter(x => x.userId !== op.userId))
                      }
                      className="text-slate-400 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={operatorSearch}
                onChange={e => setOperatorSearch(e.target.value)}
                placeholder="Filtrar operadores da unidade por nome ou MASP..."
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            {availableUnitOperators.length > 0 && (
              <div className="max-h-36 overflow-y-auto bg-slate-900/70 border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                {availableUnitOperators.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleAddOperator(u)}
                    className="w-full text-left px-3 py-1.5 hover:bg-cyan-500/10 flex items-center justify-between gap-2 transition"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-100 block truncate">{u.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {u.cargo || 'Policial'} • MASP: {u.masp ? formatMasp(u.masp) : 'N/A'}
                      </span>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. Acionamento & Tipo de Atendimento */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
          <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase text-[11px] tracking-wider">
            <Radio className="w-4 h-4" />
            <span>Acionamento e Tipo de Atendimento</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Acionamento via *
              </label>
              <select
                value={acionamentoVia}
                onChange={e => {
                  const next = e.target.value as AcionamentoViaOperacao;
                  setAcionamentoVia(next);
                  if (next !== 'OUTROS') setAcionamentoOutrosDescricao('');
                }}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="CEPOLC">CEPOLC</option>
                <option value="CHEFIA">CHEFIA</option>
                <option value="SEI">SEI</option>
                <option value="OUTROS">OUTROS</option>
              </select>

              {acionamentoVia === 'OUTROS' && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-amber-300 uppercase">
                      Descrição de Outros *
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">
                      {acionamentoOutrosDescricao.length} / {MAX_DESC_CURTA}
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={MAX_DESC_CURTA}
                    value={acionamentoOutrosDescricao}
                    onChange={e => setAcionamentoOutrosDescricao(e.target.value.slice(0, MAX_DESC_CURTA))}
                    placeholder="Descreva a origem do acionamento..."
                    className="w-full bg-slate-900 border border-amber-500/40 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Tipo de Atendimento *
              </label>
              <select
                value={tipoAtendimento}
                onChange={e => {
                  const next = e.target.value as TipoAtendimentoOperacao;
                  setTipoAtendimento(next);
                  if (next === 'Emergencial') {
                    setDepartamentosApoio([]);
                    setDescricaoApoio('');
                  } else {
                    setDescricaoEmergencia('');
                    if (next === 'Operação prevista') setDescricaoApoio('');
                  }
                }}
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="Operação prevista">Operação prevista</option>
                <option value="Operação extraordinária">Operação extraordinária</option>
                <option value="Emergencial">Emergencial</option>
              </select>
            </div>
          </div>

          {/* Condicional: Departamento de Apoio (Operação prevista ou extraordinária) */}
          {(tipoAtendimento === 'Operação prevista' || tipoAtendimento === 'Operação extraordinária') && (
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">
                  Departamento de Apoio (pode selecionar mais de um) *
                </label>
                <select
                  value=""
                  onChange={e => {
                    const val = e.target.value;
                    if (val && !departamentosApoio.includes(val)) {
                      setDepartamentosApoio(prev => [...prev, val]);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">+ Selecionar departamento de apoio...</option>
                  {availableDeptsApoio.map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {departamentosApoio.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {departamentosApoio.map(d => (
                    <span
                      key={d}
                      className="inline-flex items-center space-x-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <span>{d}</span>
                      <button
                        type="button"
                        onClick={() => setDepartamentosApoio(prev => prev.filter(x => x !== d))}
                        className="hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {tipoAtendimento === 'Operação extraordinária' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-cyan-300 uppercase">
                      Descrição do Apoio *
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">
                      {descricaoApoio.length} / {MAX_DESC_CURTA}
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={MAX_DESC_CURTA}
                    value={descricaoApoio}
                    onChange={e => setDescricaoApoio(e.target.value.slice(0, MAX_DESC_CURTA))}
                    placeholder="Descreva o apoio extraordinário prestado..."
                    className="w-full bg-slate-900 border border-cyan-500/40 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}
            </div>
          )}

          {/* Condicional: Descrição da Emergência */}
          {tipoAtendimento === 'Emergencial' && (
            <div className="pt-3 border-t border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-red-300 uppercase">
                  Descrição da Emergência *
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  {descricaoEmergencia.length} / {MAX_DESC_CURTA}
                </span>
              </div>
              <input
                type="text"
                maxLength={MAX_DESC_CURTA}
                value={descricaoEmergencia}
                onChange={e => setDescricaoEmergencia(e.target.value.slice(0, MAX_DESC_CURTA))}
                placeholder="Descreva a situação emergencial atendida..."
                className="w-full bg-slate-900 border border-red-500/40 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-400"
              />
            </div>
          )}
        </div>

        {/* 5. Sinopse da Operação (1000 caracteres) */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Sinopse da Operação *</span>
            </label>
            <span
              className={`font-mono text-[11px] font-bold ${
                sinopse.length >= MAX_SINOPSE ? 'text-red-400' : 'text-slate-400'
              }`}
            >
              {sinopse.length} / {MAX_SINOPSE} caracteres
            </span>
          </div>
          <textarea
            rows={4}
            maxLength={MAX_SINOPSE}
            value={sinopse}
            onChange={e => setSinopse(e.target.value.slice(0, MAX_SINOPSE))}
            placeholder="Descreva os detalhes e o desenrolar da operação..."
            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-3.5 text-xs focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>

        {/* 6. Detalhe Adicional (múltipla escolha progressiva) */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              Detalhe Adicional (opcional — selecione um ou mais)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHasMandadoPrisao(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl border font-bold text-xs transition ${
                hasMandadoPrisao
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              MANDADO DE PRISÃO
            </button>
            <button
              type="button"
              onClick={() => setHasMandadoBusca(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl border font-bold text-xs transition ${
                hasMandadoBusca
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              MANDADO DE BUSCA
            </button>
            <button
              type="button"
              onClick={() => setHasGerenciamentoCrise(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl border font-bold text-xs transition ${
                hasGerenciamentoCrise
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              GERENCIAMENTO DE CRISE
            </button>
          </div>

          {hasMandadoPrisao && (() => {
            const alvosVal = Math.max(0, parseInt(quantidadeAlvosStr || '0', 10) || 0);
            const presosVal = Math.max(0, Math.min(alvosVal, parseInt(quantidadePresosStr || '0', 10) || 0));
            const foragidosRestantes = Math.max(0, alvosVal - presosVal);

            return (
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-amber-300">Mandado de Prisão</span>
                  {alvosVal > 0 && quantidadePresosStr !== '' && (
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        foragidosRestantes > 0
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      }`}
                    >
                      {foragidosRestantes > 0
                        ? `${presosVal} ${presosVal === 1 ? 'preso' : 'presos'} — ${foragidosRestantes} ${
                            foragidosRestantes === 1 ? 'permanece foragido' : 'permanecem foragidos'
                          }`
                        : `${presosVal} ${presosVal === 1 ? 'preso' : 'presos'} — Todos os alvos capturados`}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Quantos eram os alvos? (máx. 2 dígitos) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={quantidadeAlvosStr}
                      onChange={e => handleQuantidadeAlvosChange(e.target.value)}
                      placeholder="Ex.: 3"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Quantos foram presos? *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={quantidadePresosStr}
                      onChange={e => handleQuantidadePresosChange(e.target.value)}
                      placeholder="Ex.: 2"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {alvosVal > 0 && quantidadePresosStr !== '' && foragidosRestantes > 0 && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="font-semibold text-amber-200">
                        O(s) foragido(s) estava(m) no local na hora da chegada da equipe?
                      </span>
                      <select
                        value={foragidoNoLocalChegada ? 'SIM' : 'NAO'}
                        onChange={e => {
                          const yes = e.target.value === 'SIM';
                          setForagidoNoLocalChegada(yes);
                          if (yes) {
                            setQuantidadeFugiramStr(String(foragidosRestantes));
                          } else {
                            setDescricaoFuga('');
                          }
                        }}
                        className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="NAO">NÃO</option>
                        <option value="SIM">SIM</option>
                      </select>
                    </div>

                    {foragidoNoLocalChegada && (
                      <div className="space-y-2.5 bg-slate-950/60 border border-amber-500/30 rounded-xl p-3">
                        <div className="sm:max-w-[240px]">
                          <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">
                            Quantos fugiram? (máx. {foragidosRestantes}) *
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            value={quantidadeFugiramStr}
                            onChange={e => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                              if (!digits) {
                                setQuantidadeFugiramStr('');
                                return;
                              }
                              const num = Math.max(1, Math.min(foragidosRestantes, parseInt(digits, 10) || 1));
                              setQuantidadeFugiramStr(String(num));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 font-mono text-xs focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-amber-300 uppercase">
                              Explicação de como ocorreu a fuga *
                            </label>
                            <span
                              className={`font-mono text-[10px] font-bold ${
                                descricaoFuga.length >= MAX_DESC_FUGA ? 'text-red-400' : 'text-slate-400'
                              }`}
                            >
                              {descricaoFuga.length} / {MAX_DESC_FUGA}
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            maxLength={MAX_DESC_FUGA}
                            value={descricaoFuga}
                            onChange={e => setDescricaoFuga(e.target.value.slice(0, MAX_DESC_FUGA))}
                            placeholder="Explique as circunstâncias da fuga no momento da chegada da equipe..."
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-2.5 text-xs focus:outline-none focus:border-amber-400 resize-y"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {hasMandadoBusca && (
            <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-amber-300">Mandado de Busca — Material arrecadado?</span>
                <select
                  value={materialArrecadado ? 'SIM' : 'NAO'}
                  onChange={e => {
                    const yes = e.target.value === 'SIM';
                    setMaterialArrecadado(yes);
                    if (!yes) {
                      setMateriaisBusca([]);
                      setArmasBusca([]);
                      setDrogasBusca([]);
                      setVeiculosBusca([]);
                      setMateriaisBuscaOutros('');
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold"
                >
                  <option value="NAO">NÃO</option>
                  <option value="SIM">SIM</option>
                </select>
              </div>

              {materialArrecadado && (
                <div className="space-y-3 pt-2.5 border-t border-slate-800">
                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                    Qual material arrecadado? (pode selecionar mais de um)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {MATERIAIS_BUSCA_OPCOES.map(opt => {
                      const active = materiaisBusca.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleMaterialBusca(opt)}
                          className={`px-3 py-1.5 rounded-lg border font-bold text-[11px] transition ${
                            active
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                              : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {/* ARMA — Tipo + Quantidade (múltiplos tipos) */}
                  {materiaisBusca.includes('ARMA') && (
                    <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-3 space-y-2.5">
                      <span className="block text-[10px] font-bold uppercase text-cyan-300">
                        Armas Arrecadadas — Tipo e Quantidade (pode adicionar mais de um tipo)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                          <select
                            value={armaBuscaTipoDraft}
                            onChange={e => setArmaBuscaTipoDraft(e.target.value as TipoArmaApreendidaBusca)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs"
                          >
                            {TIPOS_ARMA_BUSCA_OPCOES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Quantidade</label>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={armaBuscaQtdDraft}
                            onChange={e => setArmaBuscaQtdDraft(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button
                            type="button"
                            onClick={handleAddArmaBusca}
                            className="w-full py-1.5 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs flex items-center justify-center space-x-1 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                      {armasBusca.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {armasBusca.map(a => (
                            <span
                              key={a.tipo}
                              className="inline-flex items-center space-x-1.5 bg-slate-900 border border-cyan-500/40 text-cyan-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                            >
                              <span>{a.quantidade} {a.tipo}</span>
                              <button
                                type="button"
                                onClick={() => setArmasBusca(prev => prev.filter(x => x.tipo !== a.tipo))}
                                className="hover:text-red-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DROGA — Tipo + Quantidade + Unidade (kg / t) */}
                  {materiaisBusca.includes('DROGA') && (
                    <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-3 space-y-2.5">
                      <span className="block text-[10px] font-bold uppercase text-cyan-300">
                        Drogas Arrecadadas — Tipo, Quantidade e Unidade de Medida
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                          <select
                            value={drogaBuscaTipoDraft}
                            onChange={e => setDrogaBuscaTipoDraft(e.target.value as TipoDrogaApreendidaBusca)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs"
                          >
                            {TIPOS_DROGA_BUSCA_OPCOES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Quantidade</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={drogaBuscaQtdDraft}
                            onChange={e => setDrogaBuscaQtdDraft(e.target.value.replace(/[^0-9.,]/g, ''))}
                            placeholder="Ex.: 2,5"
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unidade</label>
                          <select
                            value={drogaBuscaUnidadeDraft}
                            onChange={e => setDrogaBuscaUnidadeDraft(e.target.value as UnidadeDrogaBusca)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs"
                          >
                            <option value="kg">Quilos (kg)</option>
                            <option value="t">Toneladas (t)</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            onClick={handleAddDrogaBusca}
                            className="w-full py-1.5 px-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs flex items-center justify-center space-x-1 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Incluir</span>
                          </button>
                        </div>
                      </div>
                      {drogasBusca.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {drogasBusca.map((d, idx) => (
                            <span
                              key={`${d.tipo}-${idx}`}
                              className="inline-flex items-center space-x-1.5 bg-slate-900 border border-cyan-500/40 text-cyan-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                            >
                              <span>
                                {d.quantidade} {d.unidade === 't' ? 'tonelada(s)' : 'kg'} — {d.tipo}
                              </span>
                              <button
                                type="button"
                                onClick={() => setDrogasBusca(prev => prev.filter((_, i) => i !== idx))}
                                className="hover:text-red-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* VEÍCULOS — Tipo + Quantidade */}
                  {materiaisBusca.includes('VEÍCULOS') && (
                    <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-3 space-y-2.5">
                      <span className="block text-[10px] font-bold uppercase text-cyan-300">
                        Veículos Arrecadados — Tipo e Quantidade
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                          <select
                            value={veiculoBuscaTipoDraft}
                            onChange={e => setVeiculoBuscaTipoDraft(e.target.value as TipoVeiculoApreendidoBusca)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs"
                          >
                            {TIPOS_VEICULO_BUSCA_OPCOES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Quantidade</label>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={veiculoBuscaQtdDraft}
                            onChange={e => setVeiculoBuscaQtdDraft(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button
                            type="button"
                            onClick={handleAddVeiculoBusca}
                            className="w-full py-1.5 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs flex items-center justify-center space-x-1 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                      {veiculosBusca.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {veiculosBusca.map(v => (
                            <span
                              key={v.tipo}
                              className="inline-flex items-center space-x-1.5 bg-slate-900 border border-cyan-500/40 text-cyan-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                            >
                              <span>{v.quantidade} {v.tipo}</span>
                              <button
                                type="button"
                                onClick={() => setVeiculosBusca(prev => prev.filter(x => x.tipo !== v.tipo))}
                                className="hover:text-red-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {materiaisBusca.includes('OUTROS') && (
                    <input
                      type="text"
                      maxLength={250}
                      value={materiaisBuscaOutros}
                      onChange={e => setMateriaisBuscaOutros(e.target.value.slice(0, 250))}
                      placeholder="Especifique brevemente os outros materiais arrecadados..."
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {hasGerenciamentoCrise && (
            <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-amber-300">Gerenciamento de Crise — Qual tipo?</span>
                <select
                  value={tipoCrise}
                  onChange={e => {
                    const val = e.target.value as TipoCriseOperacao;
                    setTipoCrise(val);
                    if (val !== 'OUTROS') setTipoCriseOutros('');
                    if (val !== 'SUICÍDIO') {
                      setSuicidioConsumado(false);
                      setAtuacaoSuicidio('Negociador');
                      setAtuacaoSuicidioOutros('');
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold"
                >
                  {TIPOS_CRISE_OPCOES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {tipoCrise === 'SUICÍDIO' && (
                <div className="pt-2.5 border-t border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Consumado? *
                      </label>
                      <select
                        value={suicidioConsumado ? 'SIM' : 'NAO'}
                        onChange={e => setSuicidioConsumado(e.target.value === 'SIM')}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs font-bold"
                      >
                        <option value="NAO">NÃO</option>
                        <option value="SIM">SIM</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Atuação adotada? *
                      </label>
                      <select
                        value={atuacaoSuicidio}
                        onChange={e => {
                          const val = e.target.value as AtuacaoSuicidioOperacao;
                          setAtuacaoSuicidio(val);
                          if (val !== 'Outros') setAtuacaoSuicidioOutros('');
                        }}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs font-bold"
                      >
                        {ATUACOES_SUICIDIO_OPCOES.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {atuacaoSuicidio === 'Outros' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-amber-300 uppercase">
                          Descrição da Atuação Adotada *
                        </label>
                        <span className="text-[10px] font-mono text-slate-400">
                          {atuacaoSuicidioOutros.length} / {MAX_DESC_CURTA}
                        </span>
                      </div>
                      <input
                        type="text"
                        maxLength={MAX_DESC_CURTA}
                        value={atuacaoSuicidioOutros}
                        onChange={e => setAtuacaoSuicidioOutros(e.target.value.slice(0, MAX_DESC_CURTA))}
                        placeholder="Ex.: parente convenceu a vítima a se submeter à condução ao hospital"
                        className="w-full bg-slate-950 border border-amber-500/40 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}
                </div>
              )}

              {tipoCrise === 'OUTROS' && (
                <input
                  type="text"
                  maxLength={250}
                  value={tipoCriseOutros}
                  onChange={e => setTipoCriseOutros(e.target.value.slice(0, 250))}
                  placeholder="Especifique o tipo de gerenciamento de crise..."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-xs"
                />
              )}
            </div>
          )}
        </div>

        {/* 7. Emprego de Arma de Fogo ou Arma de Incapacitação Elétrica */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="flex items-center space-x-2 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              <Crosshair className="w-4 h-4 text-amber-400" />
              <span>Foi utilizada arma de fogo ou de incapacitação elétrica?</span>
            </span>
            <select
              value={utilizouArma ? 'SIM' : 'NAO'}
              onChange={e => {
                const yes = e.target.value === 'SIM';
                setUtilizouArma(yes);
                if (!yes) {
                  setUtilizouArmaFogo(false);
                  setArmasFogo([]);
                  setUtilizouArmaEletrica(false);
                  setArmasEletricas([]);
                }
              }}
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
            >
              <option value="NAO">NÃO</option>
              <option value="SIM">SIM</option>
            </select>
          </div>

          {utilizouArma && (
            <div className="space-y-4 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUtilizouArmaFogo(prev => !prev)}
                  className={`px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center space-x-1.5 transition ${
                    utilizouArmaFogo
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Arma de Fogo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUtilizouArmaEletrica(prev => !prev)}
                  className={`px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center space-x-1.5 transition ${
                    utilizouArmaEletrica
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Arma de Incapacitação Elétrica</span>
                </button>
              </div>

              {/* Subpainel: Arma de Fogo */}
              {utilizouArmaFogo && (
                <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-amber-300 uppercase text-[11px]">
                      Registro de Arma de Fogo Utilizada
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setArmaOrigemDraft('ACERVO')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          armaOrigemDraft === 'ACERVO'
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 text-slate-300 border-slate-700'
                        }`}
                      >
                        Do Acervo
                      </button>
                      <button
                        type="button"
                        onClick={() => setArmaOrigemDraft('FORA_DO_ACERVO')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          armaOrigemDraft === 'FORA_DO_ACERVO'
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 text-slate-300 border-slate-700'
                        }`}
                      >
                        Fora do Acervo
                      </button>
                    </div>
                  </div>

                  {armaOrigemDraft === 'ACERVO' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Filtrar Armas Disponíveis na Unidade ({filteredAcervoWeapons.length})
                          </label>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={weaponSearchDraft}
                              onChange={e => setWeaponSearchDraft(e.target.value)}
                              placeholder="Digite nº de série, marca, modelo, calibre ou descrição..."
                              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                            />
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                            Qtd. Tiros *
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            value={tirosDraft}
                            onChange={e => setTirosDraft(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 font-mono text-xs"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button
                            type="button"
                            disabled={!selectedWeaponIdDraft}
                            onClick={handleAddArmaFogo}
                            className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Incluir Arma</span>
                          </button>
                        </div>
                      </div>

                      {/* Lista ao vivo das armas disponíveis na unidade */}
                      <div className="max-h-48 overflow-y-auto bg-slate-950/80 border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                        {filteredAcervoWeapons.length === 0 ? (
                          <div className="p-3.5 text-center text-slate-400 text-xs">
                            Nenhuma arma encontrada na unidade para o filtro informado.
                          </div>
                        ) : (
                          filteredAcervoWeapons.map(w => {
                            const isSelected = selectedWeaponIdDraft === w.id;
                            const descExtra = (w as any).observations || (w as any).description || w.location || '';
                            return (
                              <button
                                key={w.id}
                                type="button"
                                onClick={() => setSelectedWeaponIdDraft(w.id)}
                                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition ${
                                  isSelected
                                    ? 'bg-amber-500/20 border-l-2 border-amber-400'
                                    : 'hover:bg-amber-500/10'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono font-bold text-amber-300 text-xs">
                                      Nº {w.serialNumber}
                                    </span>
                                    <span className="font-bold text-slate-100">
                                      {w.manufacturer} {w.model}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">
                                      {w.caliber}
                                    </span>
                                    {w.type && (
                                      <span className="text-[10px] text-slate-400">• {w.type}</span>
                                    )}
                                  </div>
                                  {descExtra && (
                                    <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                                      {descExtra}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                                    isSelected
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {isSelected ? 'Selecionada' : 'Selecionar'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <p className="text-[10px] text-amber-300/90">
                        * Selecione uma arma na lista acima, informe a quantidade de tiros e clique em &ldquo;Incluir Arma&rdquo;. A quantidade informada será acrescentada automaticamente ao registro de tiros da arma ao salvar.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca *</label>
                        <input
                          type="text"
                          value={foraMarcaDraft}
                          onChange={e => setForaMarcaDraft(e.target.value)}
                          placeholder="Ex.: Glock"
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modelo *</label>
                        <input
                          type="text"
                          value={foraModeloDraft}
                          onChange={e => setForaModeloDraft(e.target.value)}
                          placeholder="Ex.: G17"
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nº de Série *</label>
                        <input
                          type="text"
                          value={foraSerieDraft}
                          onChange={e => setForaSerieDraft(e.target.value.toUpperCase())}
                          placeholder="ABC1234"
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 font-mono text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Calibre *</label>
                        <input
                          type="text"
                          value={foraCalibreDraft}
                          onChange={e => setForaCalibreDraft(e.target.value)}
                          placeholder="Ex.: 9mm"
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tiros</label>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={tirosDraft}
                          onChange={e => setTirosDraft(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-2 py-2 font-mono text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <button
                          type="button"
                          onClick={handleAddArmaFogo}
                          className="w-full py-2 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center"
                          title="Incluir arma"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {armasFogo.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      {armasFogo.map(a => (
                        <div
                          key={a.id}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                a.origem === 'ACERVO'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {a.origem === 'ACERVO' ? 'Acervo' : 'Fora do Acervo'}
                            </span>
                            <span className="font-bold text-slate-100">
                              {a.marca} {a.modelo}
                            </span>
                            <span className="font-mono text-amber-300">Nº {a.numeroSerie}</span>
                            <span className="text-slate-400">({a.calibre})</span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] font-bold">
                              {a.quantidadeTiros} tiro(s)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setArmasFogo(prev => prev.filter(x => x.id !== a.id))}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subpainel: Arma de Incapacitação Elétrica */}
              {utilizouArmaEletrica && (
                <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-cyan-300 uppercase text-[11px] block">
                        Equipamentos da Unidade (Incapacitação Elétrica / Materiais)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Equipamentos acautelados na unidade aparecem prioritariamente no topo. Pode selecionar mais de um.
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold">
                      {armasEletricas.length} selecionado(s)
                    </span>
                  </div>

                  {armasEletricas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {armasEletricas.map(item => (
                        <span
                          key={item.key}
                          className="inline-flex items-center space-x-1.5 bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                        >
                          <Zap className="w-3 h-3 text-cyan-400" />
                          <span>
                            {item.tipo}: {item.nome}
                            {item.numeroSerie ? ` (Nº ${item.numeroSerie})` : ''}
                            {item.acautelado && item.usuarioCautelaNome ? ` — Cautela: ${item.usuarioCautelaNome}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setArmasEletricas(prev => prev.filter(x => x.key !== item.key))}
                            className="hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={electricSearch}
                      onChange={e => setElectricSearch(e.target.value)}
                      placeholder="Filtrar por tipo, nome, número de série ou policial com cautela..."
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div className="max-h-52 overflow-y-auto bg-slate-950/80 border border-slate-800 rounded-xl divide-y divide-slate-800/70">
                    {unitElectricOptions.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs">
                        Nenhum material disponível na unidade para o filtro informado.
                      </div>
                    ) : (
                      unitElectricOptions.map(item => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setArmasEletricas(prev => [...prev, item])}
                          className="w-full text-left px-3 py-2 hover:bg-cyan-500/10 flex items-center justify-between gap-2 transition"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.acautelado ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold uppercase">
                                  Acautelado
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-bold uppercase">
                                  Unidade
                                </span>
                              )}
                              <span className="text-slate-400 font-semibold">{item.tipo}</span>
                              <span className="font-bold text-slate-100">{item.nome}</span>
                              {item.numeroSerie && (
                                <span className="font-mono text-amber-300 text-[10px]">
                                  Nº {item.numeroSerie}
                                </span>
                              )}
                            </div>
                            {item.acautelado && item.usuarioCautelaNome && (
                              <span className="text-[10px] text-emerald-300 block mt-0.5">
                                Cautela com: <strong>{item.usuarioCautelaNome}</strong>
                                {item.usuarioCautelaMasp ? ` (MASP: ${formatMasp(item.usuarioCautelaMasp)})` : ''}
                              </span>
                            )}
                          </div>
                          <Plus className="w-4 h-4 text-cyan-400 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 8. Óbito no atendimento ou em decorrência dele? */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="flex items-center space-x-2 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              <Skull className="w-4 h-4 text-red-400" />
              <span>Óbito no atendimento ou em decorrência dele?</span>
            </span>
            <select
              value={houveObito ? 'SIM' : 'NAO'}
              onChange={e => {
                const yes = e.target.value === 'SIM';
                setHouveObito(yes);
                if (!yes) {
                  setQuantidadeObitosStr('1');
                  setMesmaSinopseObito(true);
                  setSinopseObito('');
                  setSinopsesObitos(['']);
                }
              }}
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
            >
              <option value="NAO">NÃO</option>
              <option value="SIM">SIM</option>
            </select>
          </div>

          {houveObito && (
            <div className="space-y-3 pt-2.5 border-t border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-red-300 uppercase mb-1">
                    Quantidade de mortos *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={quantidadeObitosStr}
                    onChange={e => handleQuantidadeObitosChange(e.target.value)}
                    placeholder="Ex.: 2"
                    className="w-full bg-slate-900 border border-red-500/40 text-slate-100 rounded-xl px-3 py-2 font-mono text-xs focus:outline-none focus:border-red-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-red-300 uppercase mb-1">
                    Mesma sinopse? *
                  </label>
                  <select
                    value={mesmaSinopseObito ? 'SIM' : 'NAO'}
                    onChange={e => {
                      const same = e.target.value === 'SIM';
                      setMesmaSinopseObito(same);
                      if (!same) {
                        const n = Math.max(1, Math.min(99, parseInt(quantidadeObitosStr || '1', 10) || 1));
                        setSinopsesObitos(prev => Array.from({ length: n }, (_, i) => prev[i] || ''));
                      }
                    }}
                    className="w-full bg-slate-900 border border-red-500/40 text-slate-100 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-red-400"
                  >
                    <option value="SIM">SIM</option>
                    <option value="NAO">NÃO</option>
                  </select>
                </div>
              </div>

              {mesmaSinopseObito ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-red-300 uppercase">
                      Sinopse sobre o momento do óbito *
                    </label>
                    <span
                      className={`font-mono text-[10px] font-bold ${
                        sinopseObito.length >= MAX_SINOPSE_OBITO ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      {sinopseObito.length} / {MAX_SINOPSE_OBITO} caracteres
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={MAX_SINOPSE_OBITO}
                    value={sinopseObito}
                    onChange={e => setSinopseObito(e.target.value.slice(0, MAX_SINOPSE_OBITO))}
                    placeholder="Faça uma breve sinopse sobre o momento e as circunstâncias do(s) óbito(s)..."
                    className="w-full bg-slate-900 border border-red-500/40 text-slate-100 rounded-xl p-3 text-xs focus:outline-none focus:border-red-400 resize-y"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(
                    { length: Math.max(1, Math.min(99, parseInt(quantidadeObitosStr || '1', 10) || 1)) },
                    (_, idx) => {
                      const val = sinopsesObitos[idx] || '';
                      return (
                        <div key={idx} className="space-y-1.5 bg-slate-900/60 border border-red-500/30 rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-red-300 uppercase">
                              Sinopse — Óbito {idx + 1} *
                            </label>
                            <span
                              className={`font-mono text-[10px] font-bold ${
                                val.length >= MAX_SINOPSE_OBITO ? 'text-red-400' : 'text-slate-400'
                              }`}
                            >
                              {val.length} / {MAX_SINOPSE_OBITO} caracteres
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            maxLength={MAX_SINOPSE_OBITO}
                            value={val}
                            onChange={e => {
                              const nextText = e.target.value.slice(0, MAX_SINOPSE_OBITO);
                              setSinopsesObitos(prev => {
                                const n = Math.max(1, Math.min(99, parseInt(quantidadeObitosStr || '1', 10) || 1));
                                const copy = Array.from({ length: n }, (_, i) => prev[i] || '');
                                copy[idx] = nextText;
                                return copy;
                              });
                            }}
                            placeholder={`Descreva o momento e as circunstâncias do Óbito ${idx + 1}...`}
                            className="w-full bg-slate-950 border border-red-500/40 text-slate-100 rounded-xl p-3 text-xs focus:outline-none focus:border-red-400 resize-y"
                          />
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botões finais */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-800">
          {editingReport && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={resetForm}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition"
            >
              Cancelar
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave(false)}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-xl transition flex items-center space-x-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{editingReport ? 'Salvar Alterações' : 'Salvar Relatório'}</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave(true)}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition flex items-center space-x-2 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>{editingReport ? 'Salvar e Imprimir' : 'Salvar e Imprimir Relatório'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
