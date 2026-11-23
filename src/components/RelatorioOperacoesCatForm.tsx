import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Department,
  Unit,
  TipoAeronave,
  TipoVooCat,
  TipoOperacaoSoloCat,
  TipoCapturaLocalizacaoCat,
  AeronaveOperacaoCat,
  ViaturaOperacaoCat,
  TripulanteOperacionalCat,
  EquipeSoloOperacaoCat,
  EmbarcadoExternoCat,
  DisparoOperacaoCat,
  CapturaLocalizacaoCatItem,
  MunicipioOperacaoPolicial,
  RelatorioOperacaoCat,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import {
  ESTADOS_BR,
  getCachedMunicipiosPorUF,
  fetchMunicipiosPorUF
} from '../data/estadosMunicipiosBR';
import {
  printDocumentInPage,
  buildStandardDocumentTitle,
  buildStandardDocumentFilename
} from '../utils/printHelper';
import {
  getPolOpRemainingEditMs,
  formatRemainingCountdown,
  isPolOpOperatorEffectivelySigned
} from './RelatorioOperacoesPolicialForm';
import {
  Plane,
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
  FileText,
  Compass,
  UserPlus,
  Target
} from 'lucide-react';

interface RelatorioOperacoesCatFormProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  activeUnitId?: string;
  activeUnitName: string;
  activeDeptId?: string;
  activeDeptName: string;
  editingReportExternal?: RelatorioOperacaoCat | null;
  onClearExternalEdit?: () => void;
  onSaved?: () => void;
  dataVersion?: number;
}

const MAX_SINOPSE_VOO = 1000;
const MAX_APOIO_VIATURA = 250;
const MAX_APOIO_LOGISTICO = 300;
const MAX_TIPO_VOO_OUTROS = 200;
const MAX_CAPTURA_DETALHES = 500;

const TIPOS_VOO_CAT: TipoVooCat[] = [
  'APOIO OPERACIONAL',
  'APOIO EXTRAORDINÁRIO',
  'TRANSPORTE DE AUTORIDADES',
  'OUTROS TIPOS'
];

const TIPOS_OPERACAO_SOLO_CAT: TipoOperacaoSoloCat[] = [
  'Piloto de aeronave não tripulada',
  'Apoio logístico'
];

const TIPOS_CAPTURA_CAT: TipoCapturaLocalizacaoCat[] = [
  'Pessoa(s)',
  'Veículo(s)',
  'Embarcação(ões)',
  'Cativeiro(s)',
  'Ponto(s)',
  'Outros'
];

const getTodayBrasilia = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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

const parseHHMMToMinutes = (val?: string | null): number => {
  const s = String(val || '').trim();
  const match = s.match(/^(\d{1,3}):(\d{1,2})$/);
  if (!match) return 0;
  const h = Math.max(0, parseInt(match[1], 10) || 0);
  const m = Math.max(0, Math.min(59, parseInt(match[2], 10) || 0));
  return h * 60 + m;
};

const formatMinutesToHHMM = (totalMin: number): string => {
  const safe = Math.max(0, Math.floor(totalMin));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const normalizeHHMMInput = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9:]/g, '');
  if (cleaned.includes(':')) {
    const [hPart, mPart = ''] = cleaned.split(':');
    return `${hPart.slice(0, 3)}:${mPart.slice(0, 2)}`;
  }
  const digits = cleaned.slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`;
};

const isValidHHMM = (val?: string | null): boolean => {
  const match = String(val || '').trim().match(/^(\d{1,3}):([0-5]\d)$/);
  return Boolean(match);
};

export const sumFlightHoursHHMM = (aeronaves: AeronaveOperacaoCat[]): string => {
  const totalMin = (aeronaves || []).reduce((acc, a) => acc + parseHHMMToMinutes(a.horasVoo), 0);
  return formatMinutesToHHMM(totalMin);
};

export function printRelatorioOperacaoCat(
  rel: RelatorioOperacaoCat,
  units: Unit[],
  departments: Department[],
  fallbackUnitName?: string,
  fallbackDeptName?: string
) {
  const unitObj = units.find(u => u.id === rel.unitId);
  const deptObj = departments.find(d => d.id === (rel.departmentId || unitObj?.departmentId));
  const logoUrl = getSystemLogo(unitObj, deptObj);
  const unitLabel = rel.unitName || unitObj?.name || fallbackUnitName || 'CAT — Coordenação Aerotática';
  const deptLabel = deptObj?.name || fallbackDeptName || 'Polícia Civil de Minas Gerais';

  const municipiosTodos = [
    `${rel.municipioOperacao}/${rel.estadoOperacao}`,
    ...(!rel.apenasUmMunicipio ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`) : [])
  ];

  const docTitle = buildStandardDocumentTitle(
    `Relatório de Operação CAT — ${rel.municipioOperacao}/${rel.estadoOperacao}`,
    unitLabel,
    formatDateBr(rel.dataOperacao)
  );
  const filename = buildStandardDocumentFilename(
    `Relatorio_Operacao_CAT_${rel.municipioOperacao}_${unitLabel}`,
    rel.dataOperacao
  );

  const aeronavesHtml =
    rel.comEmpregoAeronave && (rel.aeronaves || []).length > 0
      ? `
      <div class="section-title">Aeronave(s) Empregada(s) e Tripulação de Comando</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Prefixo</th>
            <th>Piloto</th>
            <th>Copiloto</th>
            <th>Horas de Voo</th>
          </tr>
        </thead>
        <tbody>
          ${(rel.aeronaves || [])
            .map(
              a => `
            <tr>
              <td><strong>${escapeHtmlText(a.tipo)}</strong></td>
              <td><strong>${escapeHtmlText(a.prefixo)}</strong>${a.descricao ? `<br/><span style="font-size:10px;color:#475569;">${escapeHtmlText(a.descricao)}</span>` : ''}</td>
              <td>${a.pilotoNome ? `${escapeHtmlText(a.pilotoNome)}${a.pilotoMasp ? `<br/><span style="font-size:10px;color:#475569;">MASP: ${escapeHtmlText(formatMasp(a.pilotoMasp))}</span>` : ''}` : 'Não informado'}</td>
              <td>${a.copilotoNome ? `${escapeHtmlText(a.copilotoNome)}${a.copilotoMasp ? `<br/><span style="font-size:10px;color:#475569;">MASP: ${escapeHtmlText(formatMasp(a.copilotoMasp))}</span>` : ''}` : 'Não informado'}</td>
              <td style="text-align:center;font-weight:700;">${escapeHtmlText(a.horasVoo || '00:00')}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      <div style="text-align:right;font-size:11.5px;font-weight:700;margin-top:4px;color:#0f172a;">
        Horas Totais de Voo: ${escapeHtmlText(rel.horasTotaisVoo || sumFlightHoursHHMM(rel.aeronaves || []))}
      </div>
    `
      : '';

  const viaturasHtml =
    (rel.viaturas || []).length > 0
      ? `
      <div class="section-title">Viatura(s) Empregada(s)</div>
      <ul class="clean-list">
        ${(rel.viaturas || [])
          .map(v => {
            const opsText = (v.operadores || [])
              .map(o => `${escapeHtmlText(o.name)}${o.masp ? ` (MASP ${escapeHtmlText(formatMasp(o.masp))})` : ''}`)
              .join(', ');
            return `
              <li>
                <strong>${escapeHtmlText(v.placa)}</strong>${v.descricao ? ` — ${escapeHtmlText(v.descricao)}` : ''}<br/>
                <span style="font-size:11px;color:#334155;"><strong>Integrante(s):</strong> ${opsText || 'Não informado'}</span><br/>
                <span style="font-size:11px;color:#334155;"><strong>Tipo de Apoio:</strong> ${escapeHtmlText(v.tipoApoio || 'Não informado')}</span>
              </li>
            `;
          })
          .join('')}
      </ul>
    `
      : '';

  const tripulantesCatHtml =
    rel.comEmpregoAeronave && rel.teveTripulanteOperacional && (rel.tripulantesOperacionais || []).length > 0
      ? `
      <div style="margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;margin-bottom:3px;">
          Tripulantes Operacionais (CAT) — ${(rel.tripulantesOperacionais || []).length}
        </div>
        <ul class="clean-list">
          ${(rel.tripulantesOperacionais || [])
            .map(
              t =>
                `<li><strong>${escapeHtmlText(t.name)}</strong>${t.cargo ? ` — ${escapeHtmlText(t.cargo)}` : ''}${
                  t.masp ? ` • MASP: ${escapeHtmlText(formatMasp(t.masp))}` : ''
                }</li>`
            )
            .join('')}
        </ul>
      </div>
    `
      : '';

  const tripulantesCoeHtml =
    rel.comEmpregoAeronave && rel.teveTripulanteOutraUnidade && (rel.tripulantesOutraUnidade || []).length > 0
      ? `
      <div style="margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;margin-bottom:3px;">
          Tripulantes de Outra Unidade (Departamento COE) — ${(rel.tripulantesOutraUnidade || []).length}
        </div>
        <ul class="clean-list">
          ${(rel.tripulantesOutraUnidade || [])
            .map(
              t =>
                `<li><strong>${escapeHtmlText(t.name)}</strong>${t.unitName ? ` (${escapeHtmlText(t.unitName)})` : ''}${
                  t.cargo ? ` — ${escapeHtmlText(t.cargo)}` : ''
                }${t.masp ? ` • MASP: ${escapeHtmlText(formatMasp(t.masp))}` : ''}</li>`
            )
            .join('')}
        </ul>
      </div>
    `
      : '';

  const equipeSoloHtml =
    rel.teveEquipeSolo && (rel.equipeSolo || []).length > 0
      ? `
      <div style="margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;margin-bottom:3px;">
          Equipe em Solo — ${(rel.equipeSolo || []).length}
        </div>
        <ul class="clean-list">
          ${(rel.equipeSolo || [])
            .map(
              s =>
                `<li><strong>${escapeHtmlText(s.name)}</strong>${
                  s.masp ? ` (MASP: ${escapeHtmlText(formatMasp(s.masp))})` : ''
                } — <strong>${escapeHtmlText(s.operacaoSolo)}</strong>${
                  s.operacaoSolo === 'Apoio logístico' && s.apoioLogisticoDescricao
                    ? `: ${escapeHtmlText(s.apoioLogisticoDescricao)}`
                    : ''
                }</li>`
            )
            .join('')}
        </ul>
      </div>
    `
      : '';

  const equipeExtraSectionHtml =
    tripulantesCatHtml || tripulantesCoeHtml || equipeSoloHtml
      ? `<div class="section-title">Tripulação Operacional e Equipe em Solo</div>${tripulantesCatHtml}${tripulantesCoeHtml}${equipeSoloHtml}`
      : '';

  const embarcadosHtml =
    rel.teveEmbarcadoExterno && (rel.embarcadosExternos || []).length > 0
      ? `
      <div class="section-title">Embarcado(s) Externo(s) à Unidade (${(rel.embarcadosExternos || []).length})</div>
      <ul class="clean-list">
        ${(rel.embarcadosExternos || [])
          .map(e => {
            if (e.foraDoSistema) {
              return `<li><strong>${escapeHtmlText(e.name)}</strong> • MASP: ${escapeHtmlText(
                e.masp ? formatMasp(e.masp) : 'N/A'
              )} — <em>Policial de fora do sistema</em></li>`;
            }
            const origem = e.ehDaCoe
              ? `COE${e.unitName ? ` / ${escapeHtmlText(e.unitName)}` : ''}`
              : `${escapeHtmlText(e.departmentName || 'Departamento')}${
                  e.unitName ? ` / ${escapeHtmlText(e.unitName)}` : ''
                }`;
            return `<li><strong>${escapeHtmlText(e.name)}</strong>${
              e.cargo ? ` (${escapeHtmlText(e.cargo)})` : ''
            } • MASP: ${escapeHtmlText(e.masp ? formatMasp(e.masp) : 'N/A')} — ${origem}</li>`;
          })
          .join('')}
      </ul>
    `
      : '';

  const atuacaoAereaHtml = rel.comEmpregoAeronave
    ? `
      <div class="section-title">Desembarque e Participação da Aeronave</div>
      <div class="meta-grid">
        <div class="info-box">
          <div class="info-label">Os tripulantes desembarcaram na operação?</div>
          <div class="info-value">${rel.tripulantesDesembarcaram ? 'SIM' : 'NÃO'}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Participou de captura de foragido ou localização?</div>
          <div class="info-value">${rel.participouCapturaLocalizacao ? 'SIM' : 'NÃO'}</div>
        </div>
      </div>
      ${
        rel.participouCapturaLocalizacao && (rel.capturasLocalizacoes || []).length > 0
          ? `<ul class="clean-list">
              ${(rel.capturasLocalizacoes || [])
                .map(
                  c =>
                    `<li><strong>${escapeHtmlText(c.tipo)}</strong> — Quantidade: <strong>${Number(
                      c.quantidade || 1
                    )}</strong>${
                      c.detalhes ? `<br/><span style="font-size:11px;color:#334155;">Detalhamento: ${escapeHtmlText(c.detalhes)}</span>` : ''
                    }</li>`
                )
                .join('')}
            </ul>`
          : ''
      }
    `
    : '';

  const disparosHtml =
    rel.teveDisparosCat && (rel.disparosCat || []).length > 0
      ? `
      <div class="section-title">Disparos Realizados por Operadores da CAT</div>
      <ul class="clean-list">
        ${(rel.disparosCat || [])
          .map(
            d => `
          <li>
            <strong>[${d.origem === 'ACERVO' ? 'Acervo CAT' : 'Fora do Acervo'}]</strong>
            ${escapeHtmlText(d.marca)} ${escapeHtmlText(d.modelo)} • Nº Série: <strong>${escapeHtmlText(
              d.numeroSerie
            )}</strong> • Calibre: ${escapeHtmlText(d.calibre)} • Disparos: <strong>${Number(
              d.quantidadeTiros || 0
            )}</strong>
          </li>
        `
          )
          .join('')}
      </ul>
    `
      : `
      <div class="info-box full" style="margin-top:10px;">
        <div class="info-label">Disparos na operação por parte dos operadores da CAT?</div>
        <div class="info-value">NÃO</div>
      </div>
    `;

  const operadoresList = rel.operadores || [];
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
        .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
        .info-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
        .info-box.full { grid-column: 1 / -1; }
        .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
        .info-value { font-size: 12px; font-weight: 700; color: #0f172a; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 14px 0 8px; }
        .desc-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #ffffff; white-space: pre-wrap; min-height: 64px; font-size: 12px; }
        .clean-list { margin: 4px 0 8px 18px; padding: 0; font-size: 11.5px; }
        .clean-list li { margin-bottom: 5px; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
        .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
        .data-table th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #334155; }
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
          <h1>Polícia Civil de Minas Gerais — Relatório de Operação (CAT)</h1>
          <p>${escapeHtmlText(deptLabel)} • Unidade: ${escapeHtmlText(unitLabel)}</p>
          <p>
            Modalidade: <strong>${rel.comEmpregoAeronave ? 'Com Emprego de Aeronave' : 'Sem Emprego de Aeronave'}</strong>
            • Saída da Base: ${escapeHtmlText(formatDateBr(rel.dataSaidaBase))}
            • Operação: ${escapeHtmlText(formatDateBr(rel.dataOperacao))}
          </p>
        </div>
      </div>

      <div class="meta-grid">
        <div class="info-box">
          <div class="info-label">${rel.comEmpregoAeronave ? 'Horário da Decolagem / Voo da Operação' : 'Horário Saída / Operação'}</div>
          <div class="info-value">${escapeHtmlText(rel.horarioDecolagem)} → ${escapeHtmlText(rel.horarioVooOperacao)}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Município(s) da Operação</div>
          <div class="info-value">${municipiosTodos.map(m => escapeHtmlText(m)).join(' • ')}</div>
        </div>
        ${
          rel.comEmpregoAeronave
            ? `
          <div class="info-box full">
            <div class="info-label">Tipo de Voo</div>
            <div class="info-value">${escapeHtmlText(rel.tipoVoo || 'APOIO OPERACIONAL')}${
              rel.tipoVoo === 'OUTROS TIPOS' && rel.tipoVooOutrosDescricao
                ? ` — ${escapeHtmlText(rel.tipoVooOutrosDescricao)}`
                : ''
            }</div>
          </div>
        `
            : ''
        }
      </div>

      ${aeronavesHtml}
      ${viaturasHtml}
      ${equipeExtraSectionHtml}
      ${embarcadosHtml}
      ${atuacaoAereaHtml}
      ${disparosHtml}

      <div class="section-title">${rel.comEmpregoAeronave ? 'Sinopse do Voo' : 'Sinopse da Operação'}</div>
      <div class="desc-box">${escapeHtmlText(rel.sinopseVoo)}</div>

      ${assinaturasHtml}
    </body>
    </html>
  `;

  printDocumentInPage(html, filename);
}

export const RelatorioOperacoesCatForm: React.FC<RelatorioOperacoesCatFormProps> = ({
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

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const [editingReport, setEditingReport] = useState<RelatorioOperacaoCat | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 1. Modalidade (TOPO ANTES DE DATA E HORA)
  const [comEmpregoAeronave, setComEmpregoAeronave] = useState<boolean>(true);

  // 2. Datas e Horários
  const [dataSaidaBase, setDataSaidaBase] = useState<string>(() => getTodayBrasilia());
  const [dataOperacao, setDataOperacao] = useState<string>(() => getTodayBrasilia());
  const [horarioDecolagem, setHorarioDecolagem] = useState<string>('06:00');
  const [horarioVooOperacao, setHorarioVooOperacao] = useState<string>('06:00');

  // 3. Local da Operação (idêntico às demais unidades)
  const [estadoOperacao, setEstadoOperacao] = useState<string>('MG');
  const [municipioOperacao, setMunicipioOperacao] = useState<string>('');
  const [apenasUmMunicipio, setApenasUmMunicipio] = useState<boolean>(true);
  const [outrosMunicipios, setOutrosMunicipios] = useState<MunicipioOperacaoPolicial[]>([]);
  const [extraUfDraft, setExtraUfDraft] = useState<string>('MG');
  const [extraMunDraft, setExtraMunDraft] = useState<string>('');
  const [municipiosCache, setMunicipiosCache] = useState<Record<string, string[]>>(() => ({
    MG: getCachedMunicipiosPorUF('MG')
  }));
  const [loadingUf, setLoadingUf] = useState<Record<string, boolean>>({});

  // 4. Aeronaves e Viaturas
  const [aeronaveTipoDraft, setAeronaveTipoDraft] = useState<TipoAeronave | ''>('');
  const [aeronavesSelecionadas, setAeronavesSelecionadas] = useState<AeronaveOperacaoCat[]>([]);
  const [viaturasSelecionadas, setViaturasSelecionadas] = useState<ViaturaOperacaoCat[]>([]);

  // 5. Tripulante Operacional (CAT e COE) + Equipe em Solo
  const [teveTripulanteOperacional, setTeveTripulanteOperacional] = useState<boolean>(false);
  const [qtdTripulantesOp, setQtdTripulantesOp] = useState<number>(1);
  const [tripulantesOpSlots, setTripulantesOpSlots] = useState<string[]>(['']);

  const [teveTripulanteOutraUnidade, setTeveTripulanteOutraUnidade] = useState<boolean>(false);
  const [coeUnitDraft, setCoeUnitDraft] = useState<string>('');
  const [coeUserDraft, setCoeUserDraft] = useState<string>('');
  const [tripulantesOutraUnidade, setTripulantesOutraUnidade] = useState<TripulanteOperacionalCat[]>([]);

  const [teveEquipeSolo, setTeveEquipeSolo] = useState<boolean>(false);
  const [equipeSolo, setEquipeSolo] = useState<EquipeSoloOperacaoCat[]>([]);

  // 6. Tipo de Voo
  const [tipoVoo, setTipoVoo] = useState<TipoVooCat>('APOIO OPERACIONAL');
  const [tipoVooOutrosDescricao, setTipoVooOutrosDescricao] = useState<string>('');

  // 7. Embarcado Externo à Unidade
  const [teveEmbarcadoExterno, setTeveEmbarcadoExterno] = useState<boolean>(false);
  const [embarcadosExternos, setEmbarcadosExternos] = useState<EmbarcadoExternoCat[]>([]);
  const [embForaSistemaDraft, setEmbForaSistemaDraft] = useState<boolean>(false);
  const [embEhDaCoeDraft, setEmbEhDaCoeDraft] = useState<boolean>(true);
  const [embDeptIdDraft, setEmbDeptIdDraft] = useState<string>('');
  const [embUnitIdDraft, setEmbUnitIdDraft] = useState<string>('');
  const [embUserIdDraft, setEmbUserIdDraft] = useState<string>('');
  const [embNomeForaDraft, setEmbNomeForaDraft] = useState<string>('');
  const [embMaspForaDraft, setEmbMaspForaDraft] = useState<string>('');

  // 8. Desembarque & Captura / Localização
  const [tripulantesDesembarcaram, setTripulantesDesembarcaram] = useState<boolean>(false);
  const [participouCapturaLocalizacao, setParticipouCapturaLocalizacao] = useState<boolean>(false);
  const [capturasLocalizacoes, setCapturasLocalizacoes] = useState<CapturaLocalizacaoCatItem[]>([]);
  const [capturaTipoDraft, setCapturaTipoDraft] = useState<TipoCapturaLocalizacaoCat>('Pessoa(s)');
  const [capturaQtdDraft, setCapturaQtdDraft] = useState<string>('1');
  const [capturaDetalhesDraft, setCapturaDetalhesDraft] = useState<string>('');

  // 9. Disparos CAT
  const [teveDisparosCat, setTeveDisparosCat] = useState<boolean>(false);
  const [disparosCat, setDisparosCat] = useState<DisparoOperacaoCat[]>([]);
  const [disparoOrigemDraft, setDisparoOrigemDraft] = useState<'ACERVO' | 'FORA_ACERVO'>('ACERVO');
  const [weaponSearchDraft, setWeaponSearchDraft] = useState<string>('');
  const [selectedWeaponIdDraft, setSelectedWeaponIdDraft] = useState<string>('');
  const [disparoMarcaDraft, setDisparoMarcaDraft] = useState<string>('');
  const [disparoModeloDraft, setDisparoModeloDraft] = useState<string>('');
  const [disparoCalibreDraft, setDisparoCalibreDraft] = useState<string>('');
  const [disparoSerieDraft, setDisparoSerieDraft] = useState<string>('');
  const [disparoQtdTirosDraft, setDisparoQtdTirosDraft] = useState<string>('1');

  // 10. Sinopse do Voo
  const [sinopseVoo, setSinopseVoo] = useState<string>('');

  // Fetch municípios dinamicamente (IBGE + fallback local)
  const ensureMunicipiosForUF = async (uf: string) => {
    const code = String(uf || '').toUpperCase();
    if (!code) return;
    if (municipiosCache[code] && municipiosCache[code].length > 30) return;
    const cached = getCachedMunicipiosPorUF(code);
    if (cached.length > 0 && !municipiosCache[code]) {
      setMunicipiosCache(prev => ({ ...prev, [code]: cached }));
    }
    setLoadingUf(prev => ({ ...prev, [code]: true }));
    try {
      const list = await fetchMunicipiosPorUF(code);
      setMunicipiosCache(prev => ({ ...prev, [code]: list }));
    } finally {
      setLoadingUf(prev => ({ ...prev, [code]: false }));
    }
  };

  useEffect(() => {
    ensureMunicipiosForUF(estadoOperacao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoOperacao]);

  useEffect(() => {
    ensureMunicipiosForUF(extraUfDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraUfDraft]);

  // Lookup lists
  const coeDepartmentId = useMemo(() => {
    const byCodeOrName = departments.find(d => {
      const code = normalizeText((d as { code?: string }).code);
      const name = normalizeText(d.name);
      return code === 'coe' || name === 'coe' || name.includes('coordenacao de operacoes especiais') || name.startsWith('coe ') || name.includes('(coe)');
    });
    if (byCodeOrName) return byCodeOrName.id;
    // Fallback: departamento ao qual a própria unidade CAT pertence
    const ownUnit = units.find(u => u.id === effectiveUnitId);
    return ownUnit?.departmentId || effectiveDeptId || '';
  }, [departments, units, effectiveUnitId, effectiveDeptId]);

  const coeOtherUnits = useMemo(() => {
    return units
      .filter(u => u.id !== effectiveUnitId && coeDepartmentId && u.departmentId === coeDepartmentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [units, effectiveUnitId, coeDepartmentId]);

  const coeAllUnitsIds = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      if (coeDepartmentId && u.departmentId === coeDepartmentId) {
        set.add(u.id);
      }
    }
    return set;
  }, [units, coeDepartmentId]);

  const catUnitUsers = useMemo(() => {
    return allUsers
      .filter(u => u?.id && (!effectiveUnitId || u.unitId === effectiveUnitId))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, effectiveUnitId]);

  const catAeronaves = useMemo(() => {
    return storage
      .getAeronaves()
      .filter(a => !effectiveUnitId || a.unitId === effectiveUnitId)
      .sort((a, b) => a.prefixo.localeCompare(b.prefixo, 'pt-BR'));
  }, [effectiveUnitId, dataVersion]);

  const availableAeronavesByTipo = useMemo(() => {
    if (!aeronaveTipoDraft) return [];
    const selectedIds = new Set(aeronavesSelecionadas.map(a => a.aeronaveId));
    return catAeronaves.filter(a => a.tipo === aeronaveTipoDraft && !selectedIds.has(a.id));
  }, [catAeronaves, aeronaveTipoDraft, aeronavesSelecionadas]);

  const availableViaturas = useMemo(() => {
    const selectedIds = new Set(viaturasSelecionadas.map(v => v.id));
    return storage
      .getViaturas()
      .filter(v => (!effectiveUnitId || v.unitId === effectiveUnitId) && !selectedIds.has(v.id))
      .sort((a, b) => a.placa.localeCompare(b.placa, 'pt-BR'));
  }, [viaturasSelecionadas, effectiveUnitId, dataVersion]);

  const filteredAcervoWeapons = useMemo(() => {
    const allW = storage.getAllWeaponsForLookup();
    const q = normalizeText(weaponSearchDraft);
    const unitFiltered = effectiveUnitId ? allW.filter(w => w.unitId === effectiveUnitId) : allW;
    const baseList = unitFiltered.length > 0 ? unitFiltered : allW;
    return baseList
      .filter(w => {
        if (!q) return true;
        const hay = normalizeText(
          `${w.serialNumber} ${w.manufacturer} ${w.model} ${w.caliber} ${w.type} ${w.status || ''} ${w.maintenanceReason || ''}`
        );
        return hay.includes(q);
      })
      .sort((a, b) => (a.serialNumber || '').localeCompare(b.serialNumber || '', 'pt-BR'));
  }, [weaponSearchDraft, effectiveUnitId, dataVersion]);

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

  const municipiosEstadoPrincipal = useMemo(() => {
    return municipiosCache[estadoOperacao] || getCachedMunicipiosPorUF(estadoOperacao);
  }, [municipiosCache, estadoOperacao]);

  const municipiosEstadoExtraDisponiveis = useMemo(() => {
    const all = municipiosCache[extraUfDraft] || getCachedMunicipiosPorUF(extraUfDraft);
    return all.filter(m => !selectedMunicipioKeys.has(`${extraUfDraft}|${m.toLowerCase()}`));
  }, [municipiosCache, extraUfDraft, selectedMunicipioKeys]);

  // Relatórios CAT editáveis dentro dos últimos 3 dias
  const recentEditableReports = useMemo(() => {
    const all = storage.getRelatoriosOperacoesCat();
    return all.filter(r => {
      if (effectiveUnitId && r.unitId && r.unitId !== effectiveUnitId) return false;
      const isCreator = r.criadorId === currentUser.id;
      const isOperator = (r.operadores || []).some(o => o.userId === currentUser.id);
      if (!isCreator && !isOperator) return false;
      return getPolOpRemainingEditMs(r.createdAt, nowMs) > 0;
    });
  }, [dataVersion, effectiveUnitId, currentUser.id, nowMs]);

  const horasTotaisVooCalculado = useMemo(() => {
    return sumFlightHoursHHMM(aeronavesSelecionadas);
  }, [aeronavesSelecionadas]);

  // Populate form for edit
  const populateFormForEdit = (rel: RelatorioOperacaoCat) => {
    setFeedback(null);
    setEditingReport(rel);
    setComEmpregoAeronave(Boolean(rel.comEmpregoAeronave));
    setDataSaidaBase(String(rel.dataSaidaBase || getTodayBrasilia()).slice(0, 10));
    setDataOperacao(String(rel.dataOperacao || getTodayBrasilia()).slice(0, 10));
    setHorarioDecolagem(rel.horarioDecolagem || '06:00');
    setHorarioVooOperacao(rel.horarioVooOperacao || '06:00');
    setEstadoOperacao(rel.estadoOperacao || 'MG');
    setMunicipioOperacao(rel.municipioOperacao || '');
    setApenasUmMunicipio(Boolean(rel.apenasUmMunicipio));
    setOutrosMunicipios(Array.isArray(rel.outrosMunicipios) ? rel.outrosMunicipios : []);
    setAeronaveTipoDraft('');
    setAeronavesSelecionadas(Array.isArray(rel.aeronaves) ? rel.aeronaves : []);
    setViaturasSelecionadas(Array.isArray(rel.viaturas) ? rel.viaturas : []);
    setTipoVoo(rel.tipoVoo || 'APOIO OPERACIONAL');
    setTipoVooOutrosDescricao(rel.tipoVooOutrosDescricao || '');

    const trips = Array.isArray(rel.tripulantesOperacionais) ? rel.tripulantesOperacionais : [];
    setTeveTripulanteOperacional(Boolean(rel.teveTripulanteOperacional) && trips.length > 0);
    setQtdTripulantesOp(Math.max(1, rel.quantidadeTripulantesOperacionais || trips.length || 1));
    setTripulantesOpSlots(trips.length > 0 ? trips.map(t => t.userId) : ['']);

    const tripsCoe = Array.isArray(rel.tripulantesOutraUnidade) ? rel.tripulantesOutraUnidade : [];
    setTeveTripulanteOutraUnidade(Boolean(rel.teveTripulanteOutraUnidade) && tripsCoe.length > 0);
    setTripulantesOutraUnidade(tripsCoe);

    const solo = Array.isArray(rel.equipeSolo) ? rel.equipeSolo : [];
    setTeveEquipeSolo(Boolean(rel.teveEquipeSolo) && solo.length > 0);
    setEquipeSolo(solo);

    const embs = Array.isArray(rel.embarcadosExternos) ? rel.embarcadosExternos : [];
    setTeveEmbarcadoExterno(Boolean(rel.teveEmbarcadoExterno) && embs.length > 0);
    setEmbarcadosExternos(embs);

    setTripulantesDesembarcaram(Boolean(rel.tripulantesDesembarcaram));
    setParticipouCapturaLocalizacao(Boolean(rel.participouCapturaLocalizacao));
    setCapturasLocalizacoes(Array.isArray(rel.capturasLocalizacoes) ? rel.capturasLocalizacoes : []);

    const disps = Array.isArray(rel.disparosCat) ? rel.disparosCat : [];
    setTeveDisparosCat(Boolean(rel.teveDisparosCat) && disps.length > 0);
    setDisparosCat(disps);

    setSinopseVoo(rel.sinopseVoo || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (editingReportExternal) {
      populateFormForEdit(editingReportExternal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingReportExternal?.id]);

  const resetForm = () => {
    setEditingReport(null);
    if (onClearExternalEdit) onClearExternalEdit();
    setComEmpregoAeronave(true);
    setDataSaidaBase(getTodayBrasilia());
    setDataOperacao(getTodayBrasilia());
    setHorarioDecolagem('06:00');
    setHorarioVooOperacao('06:00');
    setEstadoOperacao('MG');
    setMunicipioOperacao('');
    setApenasUmMunicipio(true);
    setOutrosMunicipios([]);
    setExtraUfDraft('MG');
    setExtraMunDraft('');
    setAeronaveTipoDraft('');
    setAeronavesSelecionadas([]);
    setViaturasSelecionadas([]);
    setTeveTripulanteOperacional(false);
    setQtdTripulantesOp(1);
    setTripulantesOpSlots(['']);
    setTeveTripulanteOutraUnidade(false);
    setCoeUnitDraft('');
    setCoeUserDraft('');
    setTripulantesOutraUnidade([]);
    setTeveEquipeSolo(false);
    setEquipeSolo([]);
    setTipoVoo('APOIO OPERACIONAL');
    setTipoVooOutrosDescricao('');
    setTeveEmbarcadoExterno(false);
    setEmbarcadosExternos([]);
    setEmbForaSistemaDraft(false);
    setEmbEhDaCoeDraft(true);
    setEmbDeptIdDraft('');
    setEmbUnitIdDraft('');
    setEmbUserIdDraft('');
    setEmbNomeForaDraft('');
    setEmbMaspForaDraft('');
    setTripulantesDesembarcaram(false);
    setParticipouCapturaLocalizacao(false);
    setCapturasLocalizacoes([]);
    setCapturaTipoDraft('Pessoa(s)');
    setCapturaQtdDraft('1');
    setCapturaDetalhesDraft('');
    setTeveDisparosCat(false);
    setDisparosCat([]);
    setDisparoOrigemDraft('ACERVO');
    setWeaponSearchDraft('');
    setSelectedWeaponIdDraft('');
    setDisparoMarcaDraft('');
    setDisparoModeloDraft('');
    setDisparoCalibreDraft('');
    setDisparoSerieDraft('');
    setDisparoQtdTirosDraft('1');
    setSinopseVoo('');
  };

  // Helpers para handlers
  const handleAddOutroMunicipio = () => {
    if (!extraUfDraft || !extraMunDraft) return;
    const key = `${extraUfDraft}|${extraMunDraft.toLowerCase()}`;
    if (selectedMunicipioKeys.has(key)) return;
    setOutrosMunicipios(prev => [...prev, { uf: extraUfDraft, municipio: extraMunDraft }]);
    setExtraMunDraft('');
  };

  const handleAddAeronave = (aeronaveId: string) => {
    if (!aeronaveId) return;
    const found = catAeronaves.find(a => a.id === aeronaveId);
    if (!found) return;
    if (aeronavesSelecionadas.some(a => a.aeronaveId === found.id)) return;
    setAeronavesSelecionadas(prev => [
      ...prev,
      {
        aeronaveId: found.id,
        tipo: found.tipo,
        prefixo: found.prefixo,
        descricao: found.descricao || '',
        horasVoo: ''
      }
    ]);
  };

  const handleUpdateAeronaveField = (aeronaveId: string, patch: Partial<AeronaveOperacaoCat>) => {
    setAeronavesSelecionadas(prev =>
      prev.map(a => (a.aeronaveId === aeronaveId ? { ...a, ...patch } : a))
    );
  };

  const handleSelectPilotoForAeronave = (aeronaveId: string, userId: string) => {
    if (!userId) {
      handleUpdateAeronaveField(aeronaveId, {
        pilotoId: undefined,
        pilotoNome: undefined,
        pilotoMasp: undefined,
        pilotoCargo: undefined
      });
      return;
    }
    const u = allUsers.find(usr => usr.id === userId);
    if (!u) return;
    handleUpdateAeronaveField(aeronaveId, {
      pilotoId: u.id,
      pilotoNome: u.name,
      pilotoMasp: u.masp || '',
      pilotoCargo: u.cargo || ''
    });
  };

  const handleSelectCopilotoForAeronave = (aeronaveId: string, userId: string) => {
    if (!userId) {
      handleUpdateAeronaveField(aeronaveId, {
        copilotoId: undefined,
        copilotoNome: undefined,
        copilotoMasp: undefined,
        copilotoCargo: undefined
      });
      return;
    }
    const u = allUsers.find(usr => usr.id === userId);
    if (!u) return;
    handleUpdateAeronaveField(aeronaveId, {
      copilotoId: u.id,
      copilotoNome: u.name,
      copilotoMasp: u.masp || '',
      copilotoCargo: u.cargo || ''
    });
  };

  const handleAddViatura = (viaturaId: string) => {
    if (!viaturaId) return;
    const found = storage.getViaturas().find(v => v.id === viaturaId);
    if (!found) return;
    if (viaturasSelecionadas.some(v => v.id === found.id)) return;
    setViaturasSelecionadas(prev => [
      ...prev,
      {
        id: found.id,
        placa: found.placa,
        descricao: found.descricao || '',
        operadores: [],
        tipoApoio: ''
      }
    ]);
  };

  const handleAddOperadorToViatura = (viaturaId: string, userId: string) => {
    if (!userId) return;
    const u = catUnitUsers.find(usr => usr.id === userId);
    if (!u) return;
    setViaturasSelecionadas(prev =>
      prev.map(v => {
        if (v.id !== viaturaId) return v;
        if (v.operadores.some(o => o.userId === u.id)) return v;
        return {
          ...v,
          operadores: [
            ...v.operadores,
            { userId: u.id, name: u.name, masp: u.masp || '', cargo: u.cargo || '' }
          ]
        };
      })
    );
  };

  const handleRemoveOperadorFromViatura = (viaturaId: string, userId: string) => {
    setViaturasSelecionadas(prev =>
      prev.map(v =>
        v.id === viaturaId ? { ...v, operadores: v.operadores.filter(o => o.userId !== userId) } : v
      )
    );
  };

  const handleChangeQtdTripulantesOp = (newQtyRaw: number) => {
    const qty = Math.max(1, Math.min(20, newQtyRaw || 1));
    setQtdTripulantesOp(qty);
    setTripulantesOpSlots(prev => {
      const next = [...prev];
      while (next.length < qty) next.push('');
      return next.slice(0, qty);
    });
  };

  const handleAddTripulanteCoe = () => {
    if (!coeUnitDraft || !coeUserDraft) return;
    if (tripulantesOutraUnidade.some(t => t.userId === coeUserDraft)) return;
    const u = allUsers.find(usr => usr.id === coeUserDraft);
    const unitObj = units.find(un => un.id === coeUnitDraft);
    if (!u) return;
    setTripulantesOutraUnidade(prev => [
      ...prev,
      {
        userId: u.id,
        name: u.name,
        masp: u.masp || '',
        cargo: u.cargo || '',
        unitId: unitObj?.id || u.unitId || '',
        unitName: unitObj?.name || '',
        origem: 'COE'
      }
    ]);
    setCoeUserDraft('');
  };

  const handleAddEquipeSolo = (userId: string) => {
    if (!userId) return;
    if (equipeSolo.some(s => s.userId === userId)) return;
    const u = catUnitUsers.find(usr => usr.id === userId);
    if (!u) return;
    setEquipeSolo(prev => [
      ...prev,
      {
        userId: u.id,
        name: u.name,
        masp: u.masp || '',
        cargo: u.cargo || '',
        operacaoSolo: 'Piloto de aeronave não tripulada',
        apoioLogisticoDescricao: ''
      }
    ]);
  };

  const handleAddEmbarcadoExterno = () => {
    if (embForaSistemaDraft) {
      const nome = embNomeForaDraft.trim();
      const masp = embMaspForaDraft.trim();
      if (!nome || !masp) {
        setFeedback({ type: 'error', message: 'Informe o nome completo e o MASP do policial de fora do sistema.' });
        return;
      }
      setEmbarcadosExternos(prev => [
        ...prev,
        {
          id: `emb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          foraDoSistema: true,
          ehDaCoe: false,
          name: nome,
          masp
        }
      ]);
      setEmbNomeForaDraft('');
      setEmbMaspForaDraft('');
      setFeedback(null);
      return;
    }

    if (!embUserIdDraft) {
      setFeedback({ type: 'error', message: 'Selecione o policial embarcado antes de adicionar.' });
      return;
    }
    if (embarcadosExternos.some(e => !e.foraDoSistema && e.userId === embUserIdDraft)) {
      setFeedback({ type: 'error', message: 'Este policial já foi adicionado aos embarcados externos.' });
      return;
    }
    const u = allUsers.find(usr => usr.id === embUserIdDraft);
    if (!u) return;
    const uUnit = units.find(un => un.id === u.unitId);
    const uDept = departments.find(d => d.id === (u.departmentId || uUnit?.departmentId));
    setEmbarcadosExternos(prev => [
      ...prev,
      {
        id: `emb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        foraDoSistema: false,
        ehDaCoe: embEhDaCoeDraft,
        departmentId: uDept?.id || u.departmentId || '',
        departmentName: uDept?.name || '',
        unitId: uUnit?.id || u.unitId || '',
        unitName: uUnit?.name || '',
        userId: u.id,
        name: u.name,
        masp: u.masp || '',
        cargo: u.cargo || ''
      }
    ]);
    setEmbUserIdDraft('');
    setFeedback(null);
  };

  const handleAddCaptura = () => {
    const qty = Math.max(1, parseInt(capturaQtdDraft, 10) || 1);
    const precisaDetalhes = capturaTipoDraft === 'Ponto(s)' || capturaTipoDraft === 'Outros';
    const detalhes = precisaDetalhes ? capturaDetalhesDraft.trim() : '';
    if (precisaDetalhes && !detalhes) {
      setFeedback({
        type: 'error',
        message: `Informe os detalhes para "${capturaTipoDraft}" (até ${MAX_CAPTURA_DETALHES} caracteres).`
      });
      return;
    }
    setCapturasLocalizacoes(prev => [
      ...prev,
      {
        tipo: capturaTipoDraft,
        quantidade: qty,
        ...(detalhes ? { detalhes: detalhes.slice(0, MAX_CAPTURA_DETALHES) } : {})
      }
    ]);
    setCapturaQtdDraft('1');
    setCapturaDetalhesDraft('');
    setFeedback(null);
  };

  const handleAddDisparo = () => {
    const qtd = Math.max(1, parseInt(disparoQtdTirosDraft, 10) || 0);
    if (qtd < 1) {
      setFeedback({ type: 'error', message: 'Informe a quantidade de tiros disparados (mínimo 1).' });
      return;
    }

    if (disparoOrigemDraft === 'ACERVO') {
      const w = filteredAcervoWeapons.find(item => item.id === selectedWeaponIdDraft);
      if (!w) {
        setFeedback({ type: 'error', message: 'Selecione uma arma do acervo da unidade.' });
        return;
      }
      setDisparosCat(prev => [
        ...prev,
        {
          id: `disp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          origem: 'ACERVO',
          weaponId: w.id,
          marca: w.manufacturer || '',
          modelo: w.model || '',
          calibre: w.caliber || '',
          numeroSerie: w.serialNumber || '',
          quantidadeTiros: qtd
        }
      ]);
      setSelectedWeaponIdDraft('');
      setWeaponSearchDraft('');
      setDisparoQtdTirosDraft('1');
      setFeedback(null);
      return;
    }

    if (!disparoMarcaDraft.trim() || !disparoModeloDraft.trim() || !disparoSerieDraft.trim()) {
      setFeedback({
        type: 'error',
        message: 'Para arma fora do acervo, informe marca, modelo e número de série.'
      });
      return;
    }
    setDisparosCat(prev => [
      ...prev,
      {
        id: `disp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        origem: 'FORA_ACERVO',
        marca: disparoMarcaDraft.trim(),
        modelo: disparoModeloDraft.trim(),
        calibre: disparoCalibreDraft.trim() || 'N/I',
        numeroSerie: disparoSerieDraft.trim(),
        quantidadeTiros: qtd
      }
    ]);
    setDisparoMarcaDraft('');
    setDisparoModeloDraft('');
    setDisparoCalibreDraft('');
    setDisparoSerieDraft('');
    setDisparoQtdTirosDraft('1');
    setFeedback(null);
  };

  const handleSave = async (shouldPrint: boolean) => {
    setFeedback(null);

    if (!dataSaidaBase || !dataOperacao) {
      setFeedback({ type: 'error', message: 'Informe a data da saída da base e a data da operação.' });
      return;
    }
    if (!horarioDecolagem || !horarioVooOperacao) {
      setFeedback({ type: 'error', message: 'Informe os horários da operação.' });
      return;
    }
    if (!estadoOperacao || !municipioOperacao) {
      setFeedback({ type: 'error', message: 'Selecione o estado e o município principal da operação.' });
      return;
    }
    if (!apenasUmMunicipio && outrosMunicipios.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Adicione ao menos um município adicional ou marque que a operação ocorreu apenas em um município.'
      });
      return;
    }

    if (comEmpregoAeronave) {
      if (aeronavesSelecionadas.length === 0) {
        setFeedback({ type: 'error', message: 'Selecione ao menos uma aeronave empregada na operação.' });
        return;
      }
      for (const a of aeronavesSelecionadas) {
        if (!a.pilotoId) {
          setFeedback({
            type: 'error',
            message: `Selecione o Piloto habilitado para a aeronave ${a.tipo} ${a.prefixo}.`
          });
          return;
        }
        if (!isValidHHMM(a.horasVoo)) {
          setFeedback({
            type: 'error',
            message: `Informe as horas de voo no formato HH:mm para a aeronave ${a.tipo} ${a.prefixo} (ex.: 01:30).`
          });
          return;
        }
      }
      if (tipoVoo === 'OUTROS TIPOS' && !tipoVooOutrosDescricao.trim()) {
        setFeedback({ type: 'error', message: 'Descreva o tipo de voo ao selecionar "OUTROS TIPOS".' });
        return;
      }
    }

    for (const v of viaturasSelecionadas) {
      if (!v.operadores || v.operadores.length === 0) {
        setFeedback({
          type: 'error',
          message: `Selecione ao menos um usuário que estava na viatura ${v.placa}.`
        });
        return;
      }
      if (!v.tipoApoio.trim()) {
        setFeedback({
          type: 'error',
          message: `Informe o tipo de apoio prestado pela viatura ${v.placa}.`
        });
        return;
      }
    }

    const tripulantesCatResolvidos: TripulanteOperacionalCat[] = [];
    if (comEmpregoAeronave && teveTripulanteOperacional) {
      const seen = new Set<string>();
      for (const uid of tripulantesOpSlots) {
        if (!uid) {
          setFeedback({
            type: 'error',
            message: 'Selecione todos os tripulantes operacionais indicados ou ajuste a quantidade.'
          });
          return;
        }
        if (seen.has(uid)) continue;
        seen.add(uid);
        const u = allUsers.find(usr => usr.id === uid);
        if (u) {
          tripulantesCatResolvidos.push({
            userId: u.id,
            name: u.name,
            masp: u.masp || '',
            cargo: u.cargo || '',
            unitId: u.unitId || effectiveUnitId,
            unitName: activeUnitName,
            origem: 'CAT'
          });
        }
      }
    }

    if (comEmpregoAeronave && teveTripulanteOutraUnidade && tripulantesOutraUnidade.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Adicione ao menos um tripulante de outra unidade (COE) ou marque "Não".'
      });
      return;
    }

    if (teveEquipeSolo) {
      if (equipeSolo.length === 0) {
        setFeedback({
          type: 'error',
          message: 'Selecione ao menos um operador na Equipe em Solo ou marque "Não".'
        });
        return;
      }
      for (const s of equipeSolo) {
        if (s.operacaoSolo === 'Apoio logístico' && !(s.apoioLogisticoDescricao || '').trim()) {
          setFeedback({
            type: 'error',
            message: `Informe o tipo de apoio logístico prestado por ${s.name}.`
          });
          return;
        }
      }
    }

    if (teveEmbarcadoExterno && embarcadosExternos.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Adicione ao menos um embarcado externo ou marque "Não".'
      });
      return;
    }

    if (comEmpregoAeronave && participouCapturaLocalizacao && capturasLocalizacoes.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Adicione ao menos um item de captura/localização ou marque "Não".'
      });
      return;
    }

    if (teveDisparosCat && disparosCat.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Adicione ao menos uma arma com disparos ou marque "Não".'
      });
      return;
    }

    if (!sinopseVoo.trim()) {
      setFeedback({
        type: 'error',
        message: comEmpregoAeronave
          ? 'Preencha a Sinopse do Voo (até 1000 caracteres).'
          : 'Preencha a Sinopse da Operação (até 1000 caracteres).'
      });
      return;
    }

    const payload: Partial<RelatorioOperacaoCat> = {
      comEmpregoAeronave,
      dataSaidaBase,
      dataOperacao,
      horarioDecolagem,
      horarioVooOperacao,
      estadoOperacao,
      municipioOperacao,
      apenasUmMunicipio,
      outrosMunicipios: apenasUmMunicipio ? [] : outrosMunicipios,
      aeronaves: comEmpregoAeronave ? aeronavesSelecionadas : [],
      horasTotaisVoo: comEmpregoAeronave ? horasTotaisVooCalculado : '00:00',
      viaturas: viaturasSelecionadas,
      tipoVoo: comEmpregoAeronave ? tipoVoo : undefined,
      tipoVooOutrosDescricao:
        comEmpregoAeronave && tipoVoo === 'OUTROS TIPOS' ? tipoVooOutrosDescricao.trim() : '',
      teveTripulanteOperacional: comEmpregoAeronave && teveTripulanteOperacional,
      quantidadeTripulantesOperacionais:
        comEmpregoAeronave && teveTripulanteOperacional ? tripulantesCatResolvidos.length : 0,
      tripulantesOperacionais: comEmpregoAeronave && teveTripulanteOperacional ? tripulantesCatResolvidos : [],
      teveTripulanteOutraUnidade: comEmpregoAeronave && teveTripulanteOutraUnidade,
      tripulantesOutraUnidade:
        comEmpregoAeronave && teveTripulanteOutraUnidade ? tripulantesOutraUnidade : [],
      teveEquipeSolo,
      equipeSolo: teveEquipeSolo ? equipeSolo : [],
      teveEmbarcadoExterno,
      embarcadosExternos: teveEmbarcadoExterno ? embarcadosExternos : [],
      tripulantesDesembarcaram: comEmpregoAeronave && tripulantesDesembarcaram,
      participouCapturaLocalizacao: comEmpregoAeronave && participouCapturaLocalizacao,
      capturasLocalizacoes:
        comEmpregoAeronave && participouCapturaLocalizacao ? capturasLocalizacoes : [],
      teveDisparosCat,
      disparosCat: teveDisparosCat ? disparosCat : [],
      sinopseVoo: sinopseVoo.trim().slice(0, MAX_SINOPSE_VOO),
      departmentId: effectiveDeptId,
      unitId: effectiveUnitId,
      unitName: activeUnitName
    };

    setIsSubmitting(true);
    try {
      const res = editingReport
        ? await storage.updateRelatorioOperacaoCat(editingReport.id, payload)
        : await storage.saveRelatorioOperacaoCat(payload);

      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao salvar relatório de operação CAT.' });
        return;
      }

      const savedId = editingReport
        ? editingReport.id
        : 'id' in res
        ? res.id
        : res.data?.id;
      const savedReport =
        res.data || storage.getRelatoriosOperacoesCat().find(r => r.id === savedId);

      setFeedback({
        type: 'success',
        message: editingReport
          ? 'Relatório de operação CAT atualizado com sucesso!'
          : 'Relatório de operação CAT registrado com sucesso!'
      });

      resetForm();
      if (onSaved) onSaved();

      if (shouldPrint && savedReport) {
        printRelatorioOperacaoCat(savedReport, units, departments, activeUnitName, activeDeptName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecent = async (id: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await storage.deleteRelatorioOperacaoCat(id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir relatório CAT.' });
        return;
      }
      setConfirmDeleteId(null);
      if (editingReport?.id === id) resetForm();
      if (onSaved) onSaved();
      setFeedback({ type: 'success', message: 'Relatório de operação CAT excluído com sucesso.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered users for Embarcado Externo
  const embCoeUsers = useMemo(() => {
    return allUsers
      .filter(u => u?.id && u.unitId && coeAllUnitsIds.has(u.unitId) && u.unitId !== effectiveUnitId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, coeAllUnitsIds, effectiveUnitId]);

  const embUnitsForDept = useMemo(() => {
    if (!embDeptIdDraft) return [];
    return units
      .filter(u => u.departmentId === embDeptIdDraft && u.id !== effectiveUnitId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [units, embDeptIdDraft, effectiveUnitId]);

  const embUsersForUnit = useMemo(() => {
    if (!embUnitIdDraft) return [];
    return allUsers
      .filter(u => u?.id && u.unitId === embUnitIdDraft)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, embUnitIdDraft]);

  const coeUsersForSelectedUnit = useMemo(() => {
    if (!coeUnitDraft) return [];
    const already = new Set(tripulantesOutraUnidade.map(t => t.userId));
    return allUsers
      .filter(u => u?.id && u.unitId === coeUnitDraft && !already.has(u.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [allUsers, coeUnitDraft, tripulantesOutraUnidade]);

  return (
    <div className="space-y-5">
      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 border text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : 'bg-red-500/15 border-red-500/40 text-red-200'
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

      {/* Relatórios recentes editáveis (janela de 3 dias) */}
      {recentEditableReports.length > 0 && (
        <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300">
                Relatórios de Operações CAT Recentes (Editáveis por 3 dias)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">{recentEditableReports.length} registro(s)</span>
          </div>
          <div className="space-y-2">
            {recentEditableReports.map(r => {
              const remMs = getPolOpRemainingEditMs(r.createdAt, nowMs);
              const prefixos = (r.aeronaves || []).map(a => a.prefixo).join(', ');
              return (
                <div
                  key={r.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-100">{formatDateBr(r.dataOperacao)}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                        {r.municipioOperacao}/{r.estadoOperacao}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold">
                        {r.comEmpregoAeronave ? `Com Aeronave${prefixos ? ` (${prefixos})` : ''}` : 'Sem Aeronave'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono">
                        Edição: {formatRemainingCountdown(remMs)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => populateFormForEdit(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center space-x-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        printRelatorioOperacaoCat(r, units, departments, activeUnitName, activeDeptName)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir</span>
                    </button>
                    {confirmDeleteId === r.id ? (
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleDeleteRecent(r.id)}
                          className="px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px]"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-[11px]"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
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

      {/* FORMULÁRIO PRINCIPAL CAT */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center space-x-2">
              <Plane className="w-4 h-4 text-amber-400" />
              <span>
                {editingReport
                  ? 'Editar Relatório de Operação — Unidade CAT'
                  : 'Novo Relatório de Operação — Unidade CAT'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Unidade: <strong className="text-slate-200">{activeUnitName}</strong> • Digitador:{' '}
              <strong className="text-slate-200">{currentUser.name}</strong> (MASP:{' '}
              {currentUser.masp ? formatMasp(currentUser.masp) : 'N/A'})
            </p>
          </div>
          {editingReport && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center space-x-1 self-start"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar Edição</span>
            </button>
          )}
        </div>

        {/* =============================================================== */}
        {/* BLOCO 1 (TOPO ANTES DE DATA E HORA): EMPREGO DE AERONAVE         */}
        {/* =============================================================== */}
        <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <label className="block text-[11px] font-black uppercase tracking-wider text-amber-300">
            Modalidade da Operação (Emprego de Aeronave)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setComEmpregoAeronave(true)}
              className={`px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition ${
                comEmpregoAeronave
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Plane className="w-4 h-4" />
              <span>Com emprego de aeronave</span>
            </button>
            <button
              type="button"
              onClick={() => setComEmpregoAeronave(false)}
              className={`px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition ${
                !comEmpregoAeronave
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Sem emprego de aeronave</span>
            </button>
          </div>
          {!comEmpregoAeronave && (
            <p className="text-[11px] text-slate-400">
              Modo sem emprego de aeronave ativo: campos exclusivos de aeronave, pilotos, tripulação aérea, tipo de voo e horas de voo permanecem ocultos.
            </p>
          )}
        </div>

        {/* =============================================================== */}
        {/* BLOCO 2: DATAS E HORÁRIOS                                       */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Datas e Horários</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Data da Saída da Base *
              </label>
              <input
                type="date"
                value={dataSaidaBase}
                onChange={e => setDataSaidaBase(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Data da Operação *
              </label>
              <input
                type="date"
                value={dataOperacao}
                onChange={e => setDataOperacao(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                {comEmpregoAeronave ? 'Horário da Decolagem *' : 'Horário de Saída da Base *'}
              </label>
              <input
                type="time"
                value={horarioDecolagem}
                onChange={e => setHorarioDecolagem(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                {comEmpregoAeronave ? 'Horário do Voo da Operação *' : 'Horário da Operação *'}
              </label>
              <input
                type="time"
                value={horarioVooOperacao}
                onChange={e => setHorarioVooOperacao(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* BLOCO 3: LOCAL DA OPERAÇÃO (IDÊNTICO ÀS DEMAIS UNIDADES)        */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
            <MapPin className="w-4 h-4 text-amber-400" />
            <span>Local da Operação</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Estado da Operação *
              </label>
              <select
                value={estadoOperacao}
                onChange={e => {
                  setEstadoOperacao(e.target.value);
                  setMunicipioOperacao('');
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                {ESTADOS_BR.map(uf => (
                  <option key={uf.sigla} value={uf.sigla}>
                    {uf.sigla} — {uf.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Município da Operação * {loadingUf[estadoOperacao] ? '(carregando...)' : ''}
              </label>
              <select
                value={municipioOperacao}
                onChange={e => setMunicipioOperacao(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">Selecione o município...</option>
                {municipiosEstadoPrincipal.map(mun => (
                  <option key={mun} value={mun}>
                    {mun}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Operação apenas em um município?
              </label>
              <select
                value={apenasUmMunicipio ? 'SIM' : 'NAO'}
                onChange={e => {
                  const isSingle = e.target.value === 'SIM';
                  setApenasUmMunicipio(isSingle);
                  if (isSingle) setOutrosMunicipios([]);
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="SIM">
                  Sim, somente {municipioOperacao || 'o município selecionado'}
                </option>
                <option value="NAO">Não, teve outro(s) município(s)</option>
              </select>
            </div>
          </div>

          {!apenasUmMunicipio && (
            <div className="pt-2 border-t border-slate-800 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Outro Estado
                  </label>
                  <select
                    value={extraUfDraft}
                    onChange={e => {
                      setExtraUfDraft(e.target.value);
                      setExtraMunDraft('');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  >
                    {ESTADOS_BR.map(uf => (
                      <option key={uf.sigla} value={uf.sigla}>
                        {uf.sigla} — {uf.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Outro Município {loadingUf[extraUfDraft] ? '(carregando...)' : ''}
                  </label>
                  <select
                    value={extraMunDraft}
                    onChange={e => setExtraMunDraft(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione o município...</option>
                    {municipiosEstadoExtraDisponiveis.map(mun => (
                      <option key={mun} value={mun}>
                        {mun}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleAddOutroMunicipio}
                  disabled={!extraMunDraft}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Município</span>
                </button>
              </div>

              {outrosMunicipios.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {outrosMunicipios.map((m, idx) => (
                    <span
                      key={`${m.uf}-${m.municipio}-${idx}`}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] font-semibold"
                    >
                      <span>
                        {m.municipio}/{m.uf}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOutrosMunicipios(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-red-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* =============================================================== */}
        {/* BLOCO 4: AERONAVE UTILIZADA & VIATURA UTILIZADA (MESMA DIV)     */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-5">
          {/* Sub-bloco 4A: Aeronave Utilizada (somente com emprego de aeronave) */}
          {comEmpregoAeronave && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-amber-300">
                <Plane className="w-4 h-4" />
                <span>Aeronave Utilizada</span>
              </div>

              {catAeronaves.length === 0 ? (
                <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Nenhuma aeronave cadastrada para a unidade CAT. Cadastre aeronaves no módulo Unidades/Deptos.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Tipo da Aeronave
                    </label>
                    <select
                      value={aeronaveTipoDraft}
                      onChange={e => setAeronaveTipoDraft(e.target.value as TipoAeronave | '')}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Selecione o tipo (Avião / Helicóptero)...</option>
                      <option value="AVIÃO">AVIÃO</option>
                      <option value="HELICÓPTERO">HELICÓPTERO</option>
                    </select>
                  </div>

                  {aeronaveTipoDraft && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Prefixo da Aeronave ({aeronaveTipoDraft})
                      </label>
                      <select
                        value=""
                        onChange={e => handleAddAeronave(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="">
                          {availableAeronavesByTipo.length === 0
                            ? 'Nenhum prefixo disponível para este tipo'
                            : 'Selecione o prefixo para adicionar...'}
                        </option>
                        {availableAeronavesByTipo.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.prefixo} {a.descricao ? `— ${a.descricao}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {aeronavesSelecionadas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {aeronavesSelecionadas.map(a => (
                    <div
                      key={a.aeronaveId}
                      className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs"
                    >
                      <Plane className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold text-amber-200">{a.tipo}</span>
                      <span className="font-mono font-black text-slate-100">{a.prefixo}</span>
                      {a.descricao && <span className="text-slate-400 text-[11px]">— {a.descricao}</span>}
                      <button
                        type="button"
                        onClick={() =>
                          setAeronavesSelecionadas(prev =>
                            prev.filter(item => item.aeronaveId !== a.aeronaveId)
                          )
                        }
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

          {/* Sub-bloco 4B: Viatura Utilizada (abaixo de Aeronave Utilizada, mesma div) */}
          <div className={`space-y-3 ${comEmpregoAeronave ? 'pt-4 border-t border-slate-800' : ''}`}>
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-cyan-300">
              <Car className="w-4 h-4" />
              <span>Viatura Utilizada</span>
            </div>

            <div className="text-xs">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Adicionar Viatura da Unidade (opcional — pode selecionar uma ou mais)
              </label>
              <select
                value=""
                onChange={e => handleAddViatura(e.target.value)}
                className="w-full sm:w-96 bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="">
                  {availableViaturas.length === 0
                    ? 'Nenhuma viatura disponível para adicionar'
                    : 'Selecione uma viatura da unidade...'}
                </option>
                {availableViaturas.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.placa} {v.descricao ? `— ${v.descricao}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {viaturasSelecionadas.length > 0 && (
              <div className="space-y-3">
                {viaturasSelecionadas.map(v => {
                  const chosenOpIds = new Set(v.operadores.map(o => o.userId));
                  const availOpsForVtr = catUnitUsers.filter(u => !chosenOpIds.has(u.id));
                  return (
                    <div
                      key={v.id}
                      className="bg-slate-900 border border-cyan-500/30 rounded-xl p-3.5 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <Car className="w-4 h-4 text-cyan-400" />
                          <span className="font-mono font-bold text-slate-100">{v.placa}</span>
                          {v.descricao && <span className="text-slate-400">— {v.descricao}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setViaturasSelecionadas(prev => prev.filter(item => item.id !== v.id))
                          }
                          className="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                          title="Remover viatura"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-400">
                            Usuário(s) que estava(m) na viatura *
                          </label>
                          <select
                            value=""
                            onChange={e => handleAddOperadorToViatura(v.id, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                          >
                            <option value="">Selecionar operador da CAT na viatura...</option>
                            {availOpsForVtr.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                              </option>
                            ))}
                          </select>
                          {v.operadores.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {v.operadores.map(o => (
                                <span
                                  key={o.userId}
                                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-[11px] font-semibold"
                                >
                                  <span>{o.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOperadorFromViatura(v.id, o.userId)}
                                    className="hover:text-red-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Tipo de apoio da viatura * ({v.tipoApoio.length}/{MAX_APOIO_VIATURA})
                          </label>
                          <input
                            type="text"
                            maxLength={MAX_APOIO_VIATURA}
                            value={v.tipoApoio}
                            onChange={e =>
                              setViaturasSelecionadas(prev =>
                                prev.map(item =>
                                  item.id === v.id ? { ...item, tipoApoio: e.target.value } : item
                                )
                              )
                            }
                            placeholder="Ex.: Abastecimento em solo, apoio logístico, transporte de equipe..."
                            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* =============================================================== */}
        {/* BLOCO 5: EQUIPE (PILOTO, COPILOTO, TRIPULANTE OP E EQUIPE SOLO) */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-5">
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
            <Users className="w-4 h-4 text-amber-400" />
            <span>
              {comEmpregoAeronave
                ? 'Piloto, Copiloto, Tripulação Operacional e Equipe em Solo'
                : 'Equipe em Solo'}
            </span>
          </div>

          {/* 5A: Piloto e Copiloto por aeronave (somente com emprego de aeronave) */}
          {comEmpregoAeronave && (
            <div className="space-y-3">
              {aeronavesSelecionadas.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Selecione ao menos uma aeronave acima para escolher o Piloto e o Copiloto habilitados.
                </p>
              ) : (
                aeronavesSelecionadas.map(a => {
                  const pilotosHabilitados = catUnitUsers.filter(
                    u =>
                      (u.catFuncao === 'Piloto' && (u.catAeronaveIds || []).includes(a.aeronaveId)) ||
                      u.id === a.pilotoId
                  );
                  const copilotosHabilitados = catUnitUsers.filter(
                    u =>
                      (u.catFuncao === 'Copiloto' && (u.catAeronaveIds || []).includes(a.aeronaveId)) ||
                      u.id === a.copilotoId
                  );
                  return (
                    <div
                      key={a.aeronaveId}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs"
                    >
                      <div className="flex items-center space-x-2 text-amber-300 font-bold">
                        <Plane className="w-3.5 h-3.5" />
                        <span>
                          {a.tipo} • {a.prefixo}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Piloto (habilitado para {a.prefixo}) *
                          </label>
                          <select
                            value={a.pilotoId || ''}
                            onChange={e => handleSelectPilotoForAeronave(a.aeronaveId, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                          >
                            <option value="">
                              {pilotosHabilitados.length === 0
                                ? 'Nenhum piloto habilitado para esta aeronave'
                                : 'Selecione o piloto...'}
                            </option>
                            {pilotosHabilitados.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Copiloto (habilitado para {a.prefixo})
                          </label>
                          <select
                            value={a.copilotoId || ''}
                            onChange={e => handleSelectCopilotoForAeronave(a.aeronaveId, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                          >
                            <option value="">
                              {copilotosHabilitados.length === 0
                                ? 'Nenhum copiloto habilitado para esta aeronave'
                                : 'Selecione o copiloto (opcional)...'}
                            </option>
                            {copilotosHabilitados.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 5B: Tripulante Operacional (CAT e COE) — somente com emprego de aeronave */}
          {comEmpregoAeronave && (
            <div className="pt-4 border-t border-slate-800 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Teve tripulante operacional?
                  </label>
                  <select
                    value={teveTripulanteOperacional ? 'SIM' : 'NAO'}
                    onChange={e => {
                      const yes = e.target.value === 'SIM';
                      setTeveTripulanteOperacional(yes);
                      if (!yes) {
                        setQtdTripulantesOp(1);
                        setTripulantesOpSlots(['']);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="NAO">Não</option>
                    <option value="SIM">Sim</option>
                  </select>
                </div>

                {teveTripulanteOperacional && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Quantos tripulantes operacionais (CAT)?
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={qtdTripulantesOp}
                      onChange={e => handleChangeQtdTripulantesOp(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {teveTripulanteOperacional && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tripulantesOpSlots.map((selectedUid, idx) => {
                    const otherChosen = new Set(
                      tripulantesOpSlots.filter((id, i) => i !== idx && Boolean(id))
                    );
                    const avail = catUnitUsers.filter(u => !otherChosen.has(u.id));
                    return (
                      <div key={idx}>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Tripulante Operacional #{idx + 1} *
                        </label>
                        <select
                          value={selectedUid}
                          onChange={e => {
                            const val = e.target.value;
                            setTripulantesOpSlots(prev => prev.map((cur, i) => (i === idx ? val : cur)));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Selecione o policial da unidade CAT...</option>
                          {avail.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tripulante operacional de outra unidade do Departamento COE */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="sm:w-96">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Teve tripulante operacional de outra unidade (Departamento COE)?
                  </label>
                  <select
                    value={teveTripulanteOutraUnidade ? 'SIM' : 'NAO'}
                    onChange={e => {
                      const yes = e.target.value === 'SIM';
                      setTeveTripulanteOutraUnidade(yes);
                      if (!yes) {
                        setTripulantesOutraUnidade([]);
                        setCoeUnitDraft('');
                        setCoeUserDraft('');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="NAO">Não</option>
                    <option value="SIM">Sim</option>
                  </select>
                </div>

                {teveTripulanteOutraUnidade && (
                  <div className="space-y-2.5 bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Unidade do Departamento COE
                        </label>
                        <select
                          value={coeUnitDraft}
                          onChange={e => {
                            setCoeUnitDraft(e.target.value);
                            setCoeUserDraft('');
                          }}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Selecione a unidade da COE...</option>
                          {coeOtherUnits.map(un => (
                            <option key={un.id} value={un.id}>
                              {un.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Policial da Unidade Selecionada
                        </label>
                        <select
                          value={coeUserDraft}
                          onChange={e => setCoeUserDraft(e.target.value)}
                          disabled={!coeUnitDraft}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                          <option value="">Selecione o policial...</option>
                          {coeUsersForSelectedUnit.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddTripulanteCoe}
                        disabled={!coeUserDraft}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar Tripulante</span>
                      </button>
                    </div>

                    {tripulantesOutraUnidade.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tripulantesOutraUnidade.map(t => (
                          <span
                            key={t.userId}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] font-semibold"
                          >
                            <span>
                              {t.name} {t.unitName ? `(${t.unitName})` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setTripulantesOutraUnidade(prev =>
                                  prev.filter(item => item.userId !== t.userId)
                                )
                              }
                              className="hover:text-red-300"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5C: Equipe em Solo (mesma div de equipe, disponível com e sem aeronave) */}
          <div className={`${comEmpregoAeronave ? 'pt-4 border-t border-slate-800' : ''} space-y-3 text-xs`}>
            <div className="sm:w-72">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Teve equipe em solo?
              </label>
              <select
                value={teveEquipeSolo ? 'SIM' : 'NAO'}
                onChange={e => {
                  const yes = e.target.value === 'SIM';
                  setTeveEquipeSolo(yes);
                  if (!yes) setEquipeSolo([]);
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="NAO">Não</option>
                <option value="SIM">Sim</option>
              </select>
            </div>

            {teveEquipeSolo && (
              <div className="space-y-3">
                <div className="sm:w-96">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Adicionar Operador da Equipe em Solo (Unidade CAT)
                  </label>
                  <select
                    value=""
                    onChange={e => handleAddEquipeSolo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Selecione um operador da unidade CAT...</option>
                    {catUnitUsers
                      .filter(u => !equipeSolo.some(s => s.userId === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {equipeSolo.length > 0 && (
                  <div className="space-y-2.5">
                    {equipeSolo.map(s => (
                      <div
                        key={s.userId}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-slate-100">{s.name}</span>
                            {s.masp && (
                              <span className="ml-2 text-[11px] font-mono text-slate-400">
                                MASP: {formatMasp(s.masp)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setEquipeSolo(prev => prev.filter(item => item.userId !== s.userId))
                            }
                            className="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                              Operação de solo *
                            </label>
                            <select
                              value={s.operacaoSolo}
                              onChange={e => {
                                const nextOp = e.target.value as TipoOperacaoSoloCat;
                                setEquipeSolo(prev =>
                                  prev.map(item =>
                                    item.userId === s.userId
                                      ? {
                                          ...item,
                                          operacaoSolo: nextOp,
                                          apoioLogisticoDescricao:
                                            nextOp === 'Apoio logístico'
                                              ? item.apoioLogisticoDescricao || ''
                                              : ''
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                            >
                              {TIPOS_OPERACAO_SOLO_CAT.map(opt => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>

                          {s.operacaoSolo === 'Apoio logístico' && (
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                Tipo de apoio logístico * ({(s.apoioLogisticoDescricao || '').length}/
                                {MAX_APOIO_LOGISTICO})
                              </label>
                              <input
                                type="text"
                                maxLength={MAX_APOIO_LOGISTICO}
                                value={s.apoioLogisticoDescricao || ''}
                                onChange={e =>
                                  setEquipeSolo(prev =>
                                    prev.map(item =>
                                      item.userId === s.userId
                                        ? { ...item, apoioLogisticoDescricao: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder="Descreva o tipo de apoio logístico prestado..."
                                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* =============================================================== */}
        {/* BLOCO 6: TIPO DE VOO (SOMENTE COM EMPREGO DE AERONAVE)          */}
        {/* =============================================================== */}
        {comEmpregoAeronave && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
              <Compass className="w-4 h-4 text-amber-400" />
              <span>Tipo de Voo</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Classificação do Voo *
                </label>
                <select
                  value={tipoVoo}
                  onChange={e => {
                    const next = e.target.value as TipoVooCat;
                    setTipoVoo(next);
                    if (next !== 'OUTROS TIPOS') setTipoVooOutrosDescricao('');
                  }}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  {TIPOS_VOO_CAT.map(tv => (
                    <option key={tv} value={tv}>
                      {tv}
                    </option>
                  ))}
                </select>
              </div>

              {tipoVoo === 'OUTROS TIPOS' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Especifique o Tipo de Voo * ({tipoVooOutrosDescricao.length}/{MAX_TIPO_VOO_OUTROS})
                  </label>
                  <input
                    type="text"
                    maxLength={MAX_TIPO_VOO_OUTROS}
                    value={tipoVooOutrosDescricao}
                    onChange={e => setTipoVooOutrosDescricao(e.target.value)}
                    placeholder="Informe o tipo de voo..."
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* BLOCO 7: EMBARCADO EXTERNO À UNIDADE                            */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
            <UserPlus className="w-4 h-4 text-amber-400" />
            <span>Embarcado Externo à Unidade</span>
          </div>

          <div className="sm:w-72">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Teve embarcado externo à unidade?
            </label>
            <select
              value={teveEmbarcadoExterno ? 'SIM' : 'NAO'}
              onChange={e => {
                const yes = e.target.value === 'SIM';
                setTeveEmbarcadoExterno(yes);
                if (!yes) setEmbarcadosExternos([]);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </div>

          {teveEmbarcadoExterno && (
            <div className="space-y-3 bg-slate-900/70 border border-slate-800 rounded-xl p-3.5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEmbForaSistemaDraft(false)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    !embForaSistemaDraft
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-700'
                  }`}
                >
                  Policial cadastrado no sistema
                </button>
                <button
                  type="button"
                  onClick={() => setEmbForaSistemaDraft(true)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    embForaSistemaDraft
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-700'
                  }`}
                >
                  Policial de fora do sistema
                </button>
              </div>

              {!embForaSistemaDraft ? (
                <div className="space-y-3">
                  <div className="sm:w-64">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Da COE?
                    </label>
                    <select
                      value={embEhDaCoeDraft ? 'SIM' : 'NAO'}
                      onChange={e => {
                        setEmbEhDaCoeDraft(e.target.value === 'SIM');
                        setEmbDeptIdDraft('');
                        setEmbUnitIdDraft('');
                        setEmbUserIdDraft('');
                      }}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="SIM">Sim (Policial da COE)</option>
                      <option value="NAO">Não (Outro Departamento / Unidade)</option>
                    </select>
                  </div>

                  {embEhDaCoeDraft ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Policial da COE
                        </label>
                        <select
                          value={embUserIdDraft}
                          onChange={e => setEmbUserIdDraft(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Selecione o policial da COE...</option>
                          {embCoeUsers.map(u => {
                            const uName = units.find(un => un.id === u.unitId)?.name;
                            return (
                              <option key={u.id} value={u.id}>
                                {u.name} {uName ? `(${uName})` : ''}{' '}
                                {u.masp ? `— MASP ${formatMasp(u.masp)}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddEmbarcadoExterno}
                        disabled={!embUserIdDraft}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Departamento
                        </label>
                        <select
                          value={embDeptIdDraft}
                          onChange={e => {
                            setEmbDeptIdDraft(e.target.value);
                            setEmbUnitIdDraft('');
                            setEmbUserIdDraft('');
                          }}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Selecione o departamento...</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Unidade
                        </label>
                        <select
                          value={embUnitIdDraft}
                          onChange={e => {
                            setEmbUnitIdDraft(e.target.value);
                            setEmbUserIdDraft('');
                          }}
                          disabled={!embDeptIdDraft}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                          <option value="">Selecione a unidade...</option>
                          {embUnitsForDept.map(un => (
                            <option key={un.id} value={un.id}>
                              {un.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Usuário
                        </label>
                        <select
                          value={embUserIdDraft}
                          onChange={e => setEmbUserIdDraft(e.target.value)}
                          disabled={!embUnitIdDraft}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        >
                          <option value="">Selecione o policial...</option>
                          {embUsersForUnit.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} {u.masp ? `(MASP ${formatMasp(u.masp)})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddEmbarcadoExterno}
                        disabled={!embUserIdDraft}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      value={embNomeForaDraft}
                      onChange={e => setEmbNomeForaDraft(e.target.value)}
                      placeholder="Nome do policial de fora do sistema"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      MASP *
                    </label>
                    <input
                      type="text"
                      value={embMaspForaDraft}
                      onChange={e => setEmbMaspForaDraft(e.target.value)}
                      placeholder="Ex.: 123456-7"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEmbarcadoExterno}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar</span>
                  </button>
                </div>
              )}

              {embarcadosExternos.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  {embarcadosExternos.map(e => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                    >
                      <div className="text-[11px] text-slate-200">
                        <span className="font-bold">{e.name}</span>
                        <span className="ml-2 font-mono text-slate-400">
                          MASP: {e.masp ? formatMasp(e.masp) : 'N/A'}
                        </span>
                        <span className="ml-2 px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-semibold">
                          {e.foraDoSistema
                            ? 'Policial de fora do sistema'
                            : e.ehDaCoe
                            ? `COE${e.unitName ? ` • ${e.unitName}` : ''}`
                            : `${e.departmentName || 'Outro Depto'}${e.unitName ? ` • ${e.unitName}` : ''}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setEmbarcadosExternos(prev => prev.filter(item => item.id !== e.id))
                        }
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
        </div>

        {/* =============================================================== */}
        {/* BLOCO 8: DESEMBARQUE & CAPTURA / LOCALIZAÇÃO (COM AERONAVE)     */}
        {/* =============================================================== */}
        {comEmpregoAeronave && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
              <Target className="w-4 h-4 text-amber-400" />
              <span>Desembarque e Participação da Aeronave</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Os tripulantes desembarcaram na operação?
                </label>
                <select
                  value={tripulantesDesembarcaram ? 'SIM' : 'NAO'}
                  onChange={e => setTripulantesDesembarcaram(e.target.value === 'SIM')}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="NAO">Não</option>
                  <option value="SIM">Sim</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  A aeronave participou da captura de foragido ou localização de móvel ou imóvel?
                </label>
                <select
                  value={participouCapturaLocalizacao ? 'SIM' : 'NAO'}
                  onChange={e => {
                    const yes = e.target.value === 'SIM';
                    setParticipouCapturaLocalizacao(yes);
                    if (!yes) setCapturasLocalizacoes([]);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="NAO">Não</option>
                  <option value="SIM">Sim</option>
                </select>
              </div>
            </div>

            {participouCapturaLocalizacao && (
              <div className="space-y-3 bg-slate-900/70 border border-slate-800 rounded-xl p-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Tipo de Captura / Localização
                    </label>
                    <select
                      value={capturaTipoDraft}
                      onChange={e => {
                        setCapturaTipoDraft(e.target.value as TipoCapturaLocalizacaoCat);
                        setCapturaDetalhesDraft('');
                      }}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    >
                      {TIPOS_CAPTURA_CAT.map(tc => (
                        <option key={tc} value={tc}>
                          {tc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={capturaQtdDraft}
                      onChange={e => setCapturaQtdDraft(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCaptura}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar</span>
                  </button>
                </div>

                {(capturaTipoDraft === 'Ponto(s)' || capturaTipoDraft === 'Outros') && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Detalhamento ({capturaTipoDraft}) * ({capturaDetalhesDraft.length}/{MAX_CAPTURA_DETALHES})
                    </label>
                    <textarea
                      rows={2}
                      maxLength={MAX_CAPTURA_DETALHES}
                      value={capturaDetalhesDraft}
                      onChange={e => setCapturaDetalhesDraft(e.target.value)}
                      placeholder={`Descreva os detalhes sobre ${capturaTipoDraft.toLowerCase()}...`}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {capturasLocalizacoes.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    {capturasLocalizacoes.map((c, idx) => (
                      <div
                        key={`${c.tipo}-${idx}`}
                        className="flex items-start justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                      >
                        <div className="text-[11px] text-slate-200">
                          <span className="font-bold text-amber-300">{c.tipo}</span> — Quantidade:{' '}
                          <span className="font-bold">{c.quantidade}</span>
                          {c.detalhes && (
                            <p className="text-slate-400 mt-0.5 whitespace-pre-wrap">{c.detalhes}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCapturasLocalizacoes(prev => prev.filter((_, i) => i !== idx))
                          }
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
          </div>
        )}

        {/* =============================================================== */}
        {/* BLOCO 9: DISPAROS NA OPERAÇÃO (OPERADORES DA CAT)               */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
            <Crosshair className="w-4 h-4 text-amber-400" />
            <span>Disparos na Operação (Operadores da CAT)</span>
          </div>

          <div className="sm:w-80">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Teve disparos na operação por parte dos operadores da CAT?
            </label>
            <select
              value={teveDisparosCat ? 'SIM' : 'NAO'}
              onChange={e => {
                const yes = e.target.value === 'SIM';
                setTeveDisparosCat(yes);
                if (!yes) setDisparosCat([]);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </div>

          {teveDisparosCat && (
            <div className="space-y-3 bg-slate-900/70 border border-slate-800 rounded-xl p-3.5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDisparoOrigemDraft('ACERVO')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    disparoOrigemDraft === 'ACERVO'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-700'
                  }`}
                >
                  Arma do Acervo (Unidade CAT)
                </button>
                <button
                  type="button"
                  onClick={() => setDisparoOrigemDraft('FORA_ACERVO')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    disparoOrigemDraft === 'FORA_ACERVO'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-700'
                  }`}
                >
                  Arma Fora do Acervo
                </button>
              </div>

              {disparoOrigemDraft === 'ACERVO' ? (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={weaponSearchDraft}
                      onChange={e => setWeaponSearchDraft(e.target.value)}
                      placeholder="Filtrar armas da unidade por série, marca, modelo ou calibre..."
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Arma do Acervo ({filteredAcervoWeapons.length})
                      </label>
                      <select
                        value={selectedWeaponIdDraft}
                        onChange={e => setSelectedWeaponIdDraft(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Selecione a arma...</option>
                        {filteredAcervoWeapons.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.serialNumber} — {w.manufacturer} {w.model} ({w.caliber})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Qtd. Tiros *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={disparoQtdTirosDraft}
                        onChange={e => setDisparoQtdTirosDraft(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDisparo}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      value={disparoMarcaDraft}
                      onChange={e => setDisparoMarcaDraft(e.target.value)}
                      placeholder="Ex.: Glock"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Modelo *
                    </label>
                    <input
                      type="text"
                      value={disparoModeloDraft}
                      onChange={e => setDisparoModeloDraft(e.target.value)}
                      placeholder="Ex.: G17"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Calibre
                    </label>
                    <input
                      type="text"
                      value={disparoCalibreDraft}
                      onChange={e => setDisparoCalibreDraft(e.target.value)}
                      placeholder="Ex.: 9mm"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Nº Série *
                    </label>
                    <input
                      type="text"
                      value={disparoSerieDraft}
                      onChange={e => setDisparoSerieDraft(e.target.value)}
                      placeholder="Número de série"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Qtd. Tiros *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={disparoQtdTirosDraft}
                      onChange={e => setDisparoQtdTirosDraft(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddDisparo}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Adicionar</span>
                  </button>
                </div>
              )}

              {disparosCat.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  {disparosCat.map(d => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px]"
                    >
                      <span className="text-slate-200">
                        <strong className="text-amber-300">
                          [{d.origem === 'ACERVO' ? 'Acervo' : 'Fora do Acervo'}]
                        </strong>{' '}
                        {d.marca} {d.modelo} • Nº Série: <strong>{d.numeroSerie}</strong> • Calibre:{' '}
                        {d.calibre} • <strong>{d.quantidadeTiros} tiro(s)</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setDisparosCat(prev => prev.filter(item => item.id !== d.id))}
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
        </div>

        {/* =============================================================== */}
        {/* BLOCO 10: HORAS TOTAIS DE VOO (INDIVIDUAL POR AERONAVE + TOTAL) */}
        {/* =============================================================== */}
        {comEmpregoAeronave && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-slate-200">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Horas Totais de Voo</span>
              </div>
              {aeronavesSelecionadas.length > 0 && (
                <div className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-200 font-mono font-black text-xs">
                  Total Geral: {horasTotaisVooCalculado} h
                </div>
              )}
            </div>

            {aeronavesSelecionadas.length === 0 ? (
              <p className="text-slate-400">
                Selecione ao menos uma aeronave para informar as horas de voo individuais (formato HH:mm).
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {aeronavesSelecionadas.map(a => (
                  <div
                    key={a.aeronaveId}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5"
                  >
                    <label className="block text-[10px] font-bold uppercase text-amber-300">
                      {a.tipo} • {a.prefixo} (HH:mm) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ex.: 01:45"
                      value={a.horasVoo}
                      onChange={e =>
                        handleUpdateAeronaveField(a.aeronaveId, {
                          horasVoo: normalizeHHMMInput(e.target.value)
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* BLOCO 11: SINOPSE DO VOO                                        */}
        {/* =============================================================== */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>{comEmpregoAeronave ? 'Sinopse do Voo *' : 'Sinopse da Operação *'}</span>
            </label>
            <span
              className={`font-mono text-[11px] font-bold ${
                sinopseVoo.length >= MAX_SINOPSE_VOO ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {sinopseVoo.length} / {MAX_SINOPSE_VOO}
            </span>
          </div>
          <textarea
            rows={5}
            maxLength={MAX_SINOPSE_VOO}
            value={sinopseVoo}
            onChange={e => setSinopseVoo(e.target.value)}
            placeholder={
              comEmpregoAeronave
                ? 'Descreva a sinopse completa do voo e da operação aerotática (até 1000 caracteres)...'
                : 'Descreva a sinopse completa da operação (até 1000 caracteres)...'
            }
            className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* =============================================================== */}
        {/* BOTÕES FINAIS                                                   */}
        {/* =============================================================== */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave(false)}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center space-x-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-amber-400" />
            <span>
              {isSubmitting
                ? 'Salvando...'
                : editingReport
                ? 'Salvar Alterações'
                : 'Salvar Relatório CAT'}
            </span>
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
