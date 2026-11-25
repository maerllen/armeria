import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Unit,
  Department,
  DesempenhoResultado,
  CategoriaDesempenho,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { buildStandardDocumentTitle, printDocumentInPage, escapeHtmlText } from '../utils/printHelper';
import { getSafeProfilePhotoUrl } from '../utils/profilePhoto';
import {
  Award,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Crosshair,
  Dumbbell,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Filter,
  History,
  RefreshCw,
  Building2,
  UserCheck,
  Target,
  Shield
} from 'lucide-react';

interface UsuarioDesempenhoDashboardProps {
  targetUser: User;
  currentUser: User;
  units: Unit[];
  departments: Department[];
  preloadedResultados?: DesempenhoResultado[];
  refreshTrigger?: number;
  titleOverride?: string;
}

export function formatSecondsToHuman(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins === 0) return `${rem}s`;
  if (rem === 0) return mins === 1 ? '1 minuto' : `${mins} minutos`;
  return `${mins}m ${String(rem).padStart(2, '0')}s`;
}

export function formatSecondsCompact(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const clean = String(iso).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatNumberBr(val?: number | null): string {
  if (val === undefined || val === null || !Number.isFinite(val)) return '—';
  return Number.isInteger(val) ? String(val) : val.toFixed(2).replace('.', ',').replace(/,00$/, '');
}

export function formatResultadoResumo(r: DesempenhoResultado): string {
  if (r.ausente) {
    if (r.ausenciaInformada === true) return 'Ausente (Informada previamente)';
    if (r.ausenciaInformada === false) return 'Ausente (Não informada previamente)';
    return 'Ausente';
  }
  const parts: string[] = [];
  if (r.valorMarca !== undefined && r.valorMarca !== null) {
    const unitLabel = r.unidadeMedida || (r.tipoMarca === 'Distância' ? 'm' : r.tipoMarca === 'Repetição' ? 'rep.' : 'exec.');
    parts.push(`${formatNumberBr(r.valorMarca)} ${unitLabel}`);
  }
  if (r.tempoSegundos !== undefined && r.tempoSegundos !== null) {
    parts.push(`em ${formatSecondsToHuman(r.tempoSegundos)}`);
  }
  const left = parts.join(' ');
  const pts = `${formatNumberBr(r.notaObtida)} pts`;
  const shotPart = r.teveTiro && r.tipoArma ? ` • ${r.tirosEfetuados ?? 0} tiros (${r.tipoArma})` : '';
  if (left) return `${left} — ${pts}${shotPart}`;
  return `${pts}${shotPart}`;
}

function calcPercent(nota: number, maxRef: number): number {
  if (!maxRef || maxRef <= 0) return 0;
  return Math.max(0, Math.min(100, (nota / maxRef) * 100));
}

interface MarkerSummaryBar {
  marcadorId: string;
  marcadorNome: string;
  categoria: CategoriaDesempenho;
  tipoMarca?: string | null;
  unidadeMedida?: string | null;
  latest: DesempenhoResultado;
  best: DesempenhoResultado;
  attempts: number;
  avgPct: number;
  latestPct: number;
  approvalPct: number;
  trendDeltaPct: number | null;
}

export const UsuarioDesempenhoDashboard: React.FC<UsuarioDesempenhoDashboardProps> = ({
  targetUser,
  currentUser,
  units,
  departments,
  preloadedResultados,
  refreshTrigger = 0,
  titleOverride
}) => {
  const [resultados, setResultados] = useState<DesempenhoResultado[]>(preloadedResultados || []);
  const [loading, setLoading] = useState<boolean>(!preloadedResultados);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [categoryFilter, setCategoryFilter] = useState<'TODOS' | CategoriaDesempenho>('TODOS');
  const [yearFilter, setYearFilter] = useState<string>('TODOS');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>('GERAL');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    const res = await storage.getDesempenhoResultados({ usuarioId: targetUser.id });
    if (res.success) {
      setResultados(res.resultados);
    } else {
      setErrorMsg(res.error || 'Não foi possível carregar os índices de desempenho.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (preloadedResultados) {
      setResultados(preloadedResultados.filter(r => r.usuarioId === targetUser.id));
      setLoading(false);
    } else {
      loadData();
    }
  }, [targetUser.id, refreshTrigger, preloadedResultados]);

  const userUnit = useMemo(
    () => units.find(u => u.id === targetUser.unitId) || null,
    [units, targetUser.unitId]
  );
  const userDept = useMemo(
    () =>
      departments.find(d => d.id === (targetUser.departmentId || userUnit?.departmentId)) || null,
    [departments, targetUser.departmentId, userUnit]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const r of resultados) {
      const y = String(r.dataAvaliacao || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [resultados]);

  const filteredResultados = useMemo(() => {
    return resultados
      .filter(r => {
        if (categoryFilter !== 'TODOS' && r.categoria !== categoryFilter) return false;
        if (yearFilter !== 'TODOS' && !String(r.dataAvaliacao || '').startsWith(yearFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        const cmp = String(a.dataAvaliacao || '').localeCompare(String(b.dataAvaliacao || ''));
        if (cmp !== 0) return cmp;
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      });
  }, [resultados, categoryFilter, yearFilter]);

  const markerSummaries = useMemo<MarkerSummaryBar[]>(() => {
    const byMarker = new Map<string, DesempenhoResultado[]>();
    for (const r of filteredResultados) {
      const key = r.marcadorId || r.marcadorNome;
      const list = byMarker.get(key) || [];
      list.push(r);
      byMarker.set(key, list);
    }

    const list: MarkerSummaryBar[] = [];
    for (const [marcadorId, items] of byMarker.entries()) {
      const sorted = [...items].sort((a, b) =>
        String(a.dataAvaliacao || '').localeCompare(String(b.dataAvaliacao || ''))
      );
      const latest = sorted[sorted.length - 1];
      const first = sorted[0];
      const best = sorted.reduce((acc, cur) =>
        calcPercent(cur.notaObtida, cur.notaMaxRef) > calcPercent(acc.notaObtida, acc.notaMaxRef) ? cur : acc
      );
      const avgPct =
        sorted.reduce((sum, cur) => sum + calcPercent(cur.notaObtida, cur.notaMaxRef), 0) / sorted.length;
      const latestPct = calcPercent(latest.notaObtida, latest.notaMaxRef);
      const firstPct = calcPercent(first.notaObtida, first.notaMaxRef);
      const approvalPct = calcPercent(latest.notaAprovacaoRef, latest.notaMaxRef);

      list.push({
        marcadorId,
        marcadorNome: latest.marcadorNome,
        categoria: latest.categoria,
        tipoMarca: latest.tipoMarca,
        unidadeMedida: latest.unidadeMedida,
        latest,
        best,
        attempts: sorted.length,
        avgPct,
        latestPct,
        approvalPct,
        trendDeltaPct: sorted.length > 1 ? latestPct - firstPct : null
      });
    }

    return list.sort((a, b) => b.latestPct - a.latestPct);
  }, [filteredResultados]);

  // Keep selectedMarkerId valid when filters change
  useEffect(() => {
    if (selectedMarkerId !== 'GERAL' && !markerSummaries.some(m => m.marcadorId === selectedMarkerId)) {
      setSelectedMarkerId('GERAL');
    }
  }, [markerSummaries, selectedMarkerId]);

  const kpis = useMemo(() => {
    const total = filteredResultados.length;
    const ausencias = filteredResultados.filter(r => r.ausente).length;
    const presentes = filteredResultados.filter(r => !r.ausente);
    const fisicos = filteredResultados.filter(r => r.categoria === 'FISICO').length;
    const taticos = filteredResultados.filter(r => r.categoria === 'TATICO').length;
    const aprovados = presentes.filter(r => r.aprovado).length;
    const taxaAprovacao = presentes.length > 0 ? Math.round((aprovados / presentes.length) * 100) : 0;
    const mediaPct =
      presentes.length > 0
        ? Math.round(
            presentes.reduce((s, r) => s + calcPercent(r.notaObtida, r.notaMaxRef), 0) / presentes.length
          )
        : 0;
    const totalTiros = presentes.reduce((s, r) => s + Number(r.tirosEfetuados || 0), 0);
    return { total, ausencias, presentesCount: presentes.length, fisicos, taticos, aprovados, taxaAprovacao, mediaPct, totalTiros };
  }, [filteredResultados]);

  const bestMarker = markerSummaries.length > 0 ? markerSummaries[0] : null;
  const lowestMarker = markerSummaries.length > 1 ? markerSummaries[markerSummaries.length - 1] : null;

  // Data series for Evolution Curve SVG
  const evolutionSeries = useMemo(() => {
    if (selectedMarkerId === 'GERAL') {
      // Group by dataAvaliacao + grupoId (chronological training sessions)
      const bySession = new Map<string, DesempenhoResultado[]>();
      for (const r of filteredResultados) {
        const key = `${r.dataAvaliacao}__${r.grupoId}`;
        const arr = bySession.get(key) || [];
        arr.push(r);
        bySession.set(key, arr);
      }
      return Array.from(bySession.values())
        .sort((a, b) => String(a[0].dataAvaliacao).localeCompare(String(b[0].dataAvaliacao)))
        .map(items => {
          const avgPct =
            items.reduce((s, x) => s + calcPercent(x.notaObtida, x.notaMaxRef), 0) / items.length;
          const approvedCount = items.filter(x => x.aprovado).length;
          const ref = items[0];
          return {
            key: `${ref.dataAvaliacao}-${ref.grupoId}`,
            date: ref.dataAvaliacao,
            label: formatDateBr(ref.dataAvaliacao),
            valuePct: Math.round(avgPct * 10) / 10,
            approvalPct: Math.round(calcPercent(ref.notaAprovacaoRef, ref.notaMaxRef)),
            title: ref.atividadeNome || ref.grupoNome || 'Avaliação',
            subtitle: `${items.length} marcador(es) • ${approvedCount}/${items.length} aprovado(s)`,
            detail: items.map(i => `${i.marcadorNome}: ${formatResultadoResumo(i)}`).join(' | '),
            aprovado: approvedCount === items.length,
            categoria: ref.categoria
          };
        });
    }

    const items = filteredResultados.filter(r => (r.marcadorId || r.marcadorNome) === selectedMarkerId);
    return items.map(r => ({
      key: r.id,
      date: r.dataAvaliacao,
      label: formatDateBr(r.dataAvaliacao),
      valuePct: Math.round(calcPercent(r.notaObtida, r.notaMaxRef) * 10) / 10,
      approvalPct: Math.round(calcPercent(r.notaAprovacaoRef, r.notaMaxRef)),
      title: `${r.marcadorNome} (${r.atividadeNome || r.grupoNome || 'Treinamento'})`,
      subtitle: formatResultadoResumo(r),
      detail: r.observacoes || '',
      aprovado: r.aprovado,
      categoria: r.categoria
    }));
  }, [filteredResultados, selectedMarkerId]);

  const evolutionDelta = useMemo(() => {
    if (evolutionSeries.length < 2) return null;
    const first = evolutionSeries[0].valuePct;
    const last = evolutionSeries[evolutionSeries.length - 1].valuePct;
    return Math.round((last - first) * 10) / 10;
  }, [evolutionSeries]);

  const handlePrintDashboard = () => {
    const logoUrl = getSystemLogo(userUnit, userDept);
    const docTitle = buildStandardDocumentTitle('FICHA DE ÍNDICES DE DESEMPENHO INDIVIDUAL');

    const barsHtml = markerSummaries
      .map(m => {
        const pct = m.latest.ausente ? 0 : Math.round(m.latestPct);
        const barColor = m.latest.ausente ? '#f43f5e' : m.latest.aprovado ? '#10b981' : '#f59e0b';
        const statusLabel = m.latest.ausente ? 'AUSENTE' : m.latest.aprovado ? 'APROVADO' : 'ABAIXO DA META';
        const statusColor = m.latest.ausente ? '#e11d48' : m.latest.aprovado ? '#059669' : '#d97706';
        return `
          <tr>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">
              ${escapeHtmlText(m.marcadorNome)}
              <div style="font-size:10px;font-weight:500;color:#64748b;">
                ${m.categoria === 'FISICO' ? `Físico${m.tipoMarca ? ` • ${escapeHtmlText(m.tipoMarca)}` : ''}` : 'Técnico / Tático'} • ${m.attempts} avaliação(ões)
              </div>
            </td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#1e293b;">
              ${escapeHtmlText(formatResultadoResumo(m.latest))}
            </td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;width:160px;">
              <div style="background:#e2e8f0;height:10px;border-radius:4px;overflow:hidden;">
                <div style="background:${barColor};height:10px;width:${pct}%;"></div>
              </div>
              <div style="font-size:10px;color:#475569;margin-top:2px;">${m.latest.ausente ? 'Ausente' : `${pct}% (mín. ${Math.round(m.approvalPct)}%)`}</div>
            </td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:${statusColor};">
              ${statusLabel}
            </td>
          </tr>
        `;
      })
      .join('');

    const historyRowsHtml = [...filteredResultados]
      .reverse()
      .map(
        r => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtmlText(formatDateBr(r.dataAvaliacao))}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.categoria === 'FISICO' ? 'Físico' : 'Tático'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtmlText(r.marcadorNome)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtmlText(r.atividadeNome || r.grupoNome || '—')}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtmlText(formatResultadoResumo(r))}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:${r.ausente ? '#e11d48' : r.aprovado ? '#059669' : '#d97706'};">
              ${r.ausente ? 'Ausente' : r.aprovado ? 'Aprovado' : 'Abaixo da Meta'}
            </td>
          </tr>
        `
      )
      .join('');

    const safePrintPhoto = getSafeProfilePhotoUrl(targetUser.fotoUrl);
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;padding:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoUrl ? `<img src="${escapeHtmlText(logoUrl)}" style="width:52px;height:52px;object-fit:contain;" />` : ''}
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#475569;">Polícia Civil de Minas Gerais</div>
              <div style="font-size:16px;font-weight:800;color:#0f172a;">FICHA DE ÍNDICES DE DESEMPENHO INDIVIDUAL</div>
              <div style="font-size:11px;color:#475569;">${escapeHtmlText(userUnit?.name || 'Unidade')} ${userDept ? `• ${escapeHtmlText(userDept.name)}` : ''}</div>
            </div>
          </div>
          <div style="text-align:right;font-size:11px;color:#475569;">
            <div><strong>Emitido em:</strong> ${escapeHtmlText(new Date().toLocaleString('pt-BR'))}</div>
            <div><strong>Emissor:</strong> ${escapeHtmlText(currentUser.name)}</div>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:14px;font-size:11px;">
          <div style="width:72px;height:96px;border-radius:6px;overflow:hidden;border:1.5px solid #cbd5e1;background:#e2e8f0;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;font-size:10px;text-align:center;">
            ${safePrintPhoto ? `<img src="${escapeHtmlText(safePrintPhoto)}" alt="Foto 3x4" style="width:100%;height:100%;object-fit:cover;" />` : 'FOTO<br/>3x4'}
          </div>
          <div style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
            <div><div style="color:#64748b;font-weight:600;">POLICIAL</div><div style="font-weight:800;font-size:13px;">${escapeHtmlText(targetUser.name)}</div></div>
            <div><div style="color:#64748b;font-weight:600;">MASP</div><div style="font-weight:700;">${escapeHtmlText(formatMasp(targetUser.masp || ''))}</div></div>
            <div><div style="color:#64748b;font-weight:600;">CARGO</div><div style="font-weight:700;">${escapeHtmlText(targetUser.cargo || '—')}</div></div>
            <div><div style="color:#64748b;font-weight:600;">APROVEITAMENTO / APROVAÇÃO</div><div style="font-weight:800;color:#059669;">${kpis.mediaPct}% • ${kpis.taxaAprovacao}% aprov.</div></div>
          </div>
        </div>

        <h3 style="font-size:13px;font-weight:800;margin:14px 0 8px;text-transform:uppercase;">Índices por Marcador (Última Marca Registrada)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;">
              <th style="padding:7px 8px;border-bottom:2px solid #cbd5e1;">Marcador</th>
              <th style="padding:7px 8px;border-bottom:2px solid #cbd5e1;">Marca / Tempo / Nota</th>
              <th style="padding:7px 8px;border-bottom:2px solid #cbd5e1;">Índice</th>
              <th style="padding:7px 8px;border-bottom:2px solid #cbd5e1;text-align:center;">Situação</th>
            </tr>
          </thead>
          <tbody>${barsHtml || '<tr><td colspan="4" style="padding:10px;text-align:center;color:#64748b;">Nenhum índice registrado.</td></tr>'}</tbody>
        </table>

        <h3 style="font-size:13px;font-weight:800;margin:14px 0 8px;text-transform:uppercase;">Histórico Cronológico de Avaliações (${filteredResultados.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;">
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;">Data</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;">Tipo</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;">Marcador</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;">Atividade / Grupo</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;">Resultado</th>
              <th style="padding:6px 8px;border-bottom:2px solid #cbd5e1;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${historyRowsHtml || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#64748b;">Nenhum registro encontrado.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    printDocumentInPage(html, docTitle);
  };

  // SVG dimensions for evolution curve
  const svgW = 780;
  const svgH = 250;
  const padL = 48;
  const padR = 24;
  const padT = 22;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const curvePoints = useMemo(() => {
    if (evolutionSeries.length === 0) return [];
    return evolutionSeries.map((pt, idx) => {
      const x =
        evolutionSeries.length === 1
          ? padL + plotW / 2
          : padL + (idx / (evolutionSeries.length - 1)) * plotW;
      const y = padT + plotH - (Math.max(0, Math.min(100, pt.valuePct)) / 100) * plotH;
      return { ...pt, x, y };
    });
  }, [evolutionSeries]);

  const polylinePath = curvePoints.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath =
    curvePoints.length > 0
      ? `M ${curvePoints[0].x},${padT + plotH} ` +
        curvePoints.map(p => `L ${p.x},${p.y}`).join(' ') +
        ` L ${curvePoints[curvePoints.length - 1].x},${padT + plotH} Z`
      : '';

  const approvalLineY =
    selectedMarkerId !== 'GERAL' && curvePoints.length > 0
      ? padT + plotH - (Math.max(0, Math.min(100, curvePoints[0].approvalPct)) / 100) * plotH
      : null;

  const initials = (targetUser.name || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  const safeUserPhoto = getSafeProfilePhotoUrl(targetUser.fotoUrl);

  return (
    <div className="space-y-5">
      {/* Cabeçalho do Policial (similar ao card de perfil do animal na aba COC) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-4 min-w-0">
            <div className="w-24 h-32 aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 border-2 border-amber-500/40 shadow-lg flex flex-col items-center justify-center shrink-0">
              {safeUserPhoto ? (
                <img
                  src={safeUserPhoto}
                  alt={`Foto 3x4 de ${targetUser.name}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  <span className="text-amber-300 font-black text-2xl">{initials}</span>
                  <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Foto 3x4</span>
                </>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-extrabold text-white truncate">
                  {titleOverride ? `${titleOverride} — ${targetUser.name}` : targetUser.name}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {targetUser.cargo || 'Policial Civil'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
                <span className="flex items-center space-x-1">
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>MASP: <strong className="text-slate-200">{formatMasp(targetUser.masp || '') || '—'}</strong></span>
                </span>
                <span className="flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Unidade: <strong className="text-slate-200">{userUnit?.name || '—'}</strong></span>
                </span>
                {userDept && (
                  <span className="flex items-center space-x-1">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Depto: <strong className="text-slate-200">{userDept.name}</strong></span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!preloadedResultados && (
              <button
                type="button"
                onClick={loadData}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center space-x-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintDashboard}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center space-x-1.5 transition shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Gráfico / Ficha</span>
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Avaliações Salvas</span>
            <div className="text-xl font-black text-white mt-0.5">{kpis.total}</div>
            <span className="text-[10px] text-slate-500">{kpis.fisicos} Físicas • {kpis.taticos} Táticas</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Aproveitamento Médio</span>
            <div className="text-xl font-black text-amber-400 mt-0.5">{kpis.mediaPct}%</div>
            <span className="text-[10px] text-slate-500">Média ponderada das notas</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Taxa de Aprovação</span>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{kpis.taxaAprovacao}%</div>
            <span className="text-[10px] text-slate-500">
              {kpis.aprovados} de {kpis.presentesCount} • {kpis.ausencias} ausência(s)
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase text-slate-400">Marcadores Avaliados</span>
            <div className="text-xl font-black text-sky-400 mt-0.5">{markerSummaries.length}</div>
            <span className="text-[10px] text-slate-500">{availableYears.length || 0} ano(s) no histórico</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">Disparos Táticos</span>
            <div className="text-xl font-black text-rose-400 mt-0.5">{kpis.totalTiros}</div>
            <span className="text-[10px] text-slate-500">Total registrado no período</span>
          </div>
        </div>

        {/* Destaques Aptidão & Sugestão de Treinamento */}
        {markerSummaries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {bestMarker && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-start space-x-3">
                <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                    Maior Índice / Destaque de Desempenho
                  </div>
                  <div className="text-sm font-bold text-white truncate mt-0.5">
                    {bestMarker.marcadorNome} ({Math.round(bestMarker.latestPct)}%)
                  </div>
                  <div className="text-xs text-emerald-200/80 mt-0.5">
                    Última marca: {formatResultadoResumo(bestMarker.latest)}
                  </div>
                </div>
              </div>
            )}
            {lowestMarker && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start space-x-3">
                <TrendingDown className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                    Ponto de Atenção / Sugestão de Treinamento
                  </div>
                  <div className="text-sm font-bold text-white truncate mt-0.5">
                    {lowestMarker.marcadorNome} ({Math.round(lowestMarker.latestPct)}%)
                  </div>
                  <div className="text-xs text-amber-200/80 mt-0.5">
                    Última marca: {formatResultadoResumo(lowestMarker.latest)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Filtros dos Gráficos</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Categoria */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1">
            {(['TODOS', 'FISICO', 'TATICO'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                  categoryFilter === cat
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'FISICO' && <Dumbbell className="w-3.5 h-3.5" />}
                {cat === 'TATICO' && <Crosshair className="w-3.5 h-3.5" />}
                <span>{cat === 'TODOS' ? 'Todos' : cat === 'FISICO' ? 'Físico' : 'Técnico / Tático'}</span>
              </button>
            ))}
          </div>

          {/* Ano */}
          <select
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="TODOS">Todos os Anos (Evolução Completa)</option>
            {availableYears.map(y => (
              <option key={y} value={y}>
                Ano {y}
              </option>
            ))}
          </select>

          {/* Marcador para Curva */}
          <select
            value={selectedMarkerId}
            onChange={e => setSelectedMarkerId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500 max-w-[240px]"
          >
            <option value="GERAL">Curva: Aproveitamento Geral (%)</option>
            {markerSummaries.map(m => (
              <option key={m.marcadorId} value={m.marcadorId}>
                Curva: {m.marcadorNome} ({m.categoria === 'FISICO' ? 'Físico' : 'Tático'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-xs text-rose-300 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
          Carregando índices de desempenho...
        </div>
      ) : filteredResultados.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <BarChart3 className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-sm font-bold text-slate-200">
            Nenhum índice de desempenho registrado para os filtros selecionados.
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Os resultados lançados em atividades físicas e táticas pela unidade ficam salvos permanentemente aqui para acompanhamento de desempenho e curva de evolução ao longo dos anos.
          </p>
        </div>
      ) : (
        <>
          {/* GRÁFICO 1: ÍNDICES POR MARCADOR (NOTA + MARCA + TEMPO + TIPO DE MEDIDA) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Gráfico de Índices por Marcador (Marca, Tempo e Pontuação)
                </h4>
              </div>
              <span className="text-[11px] text-slate-400">
                Clique em um marcador para isolar sua curva de evolução abaixo
              </span>
            </div>

            <div className="space-y-3">
              {markerSummaries.map(m => {
                const isSelected = selectedMarkerId === m.marcadorId;
                const pct = Math.round(m.latestPct);
                const aprobPct = Math.round(m.approvalPct);
                return (
                  <button
                    key={m.marcadorId}
                    type="button"
                    onClick={() => setSelectedMarkerId(isSelected ? 'GERAL' : m.marcadorId)}
                    className={`w-full text-left p-3.5 rounded-xl border transition ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/60 shadow-sm'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                            m.categoria === 'FISICO'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {m.categoria === 'FISICO' ? 'Físico' : 'Tático'}
                        </span>
                        <span className="font-bold text-sm text-white truncate">{m.marcadorNome}</span>
                        {m.tipoMarca && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                            {m.tipoMarca}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500">
                          • {m.attempts} registro(s) • Último: {formatDateBr(m.latest.dataAvaliacao)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        {m.trendDeltaPct !== null && (
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              m.trendDeltaPct >= 0
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {m.trendDeltaPct >= 0 ? '+' : ''}
                            {Math.round(m.trendDeltaPct)}% evolução
                          </span>
                        )}
                        <span
                          className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                            m.latest.ausente
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : m.latest.aprovado
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {m.latest.ausente
                            ? 'Ausente'
                            : `${pct}% (${formatNumberBr(m.latest.notaObtida)}/${formatNumberBr(m.latest.notaMaxRef)} pts)`}
                        </span>
                      </div>
                    </div>

                    {/* Barra com linha de corte de aprovação */}
                    <div className="relative h-3.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          m.latest.aprovado
                            ? m.categoria === 'FISICO'
                              ? 'bg-gradient-to-r from-sky-500 to-emerald-400'
                              : 'bg-gradient-to-r from-amber-500 to-emerald-400'
                            : 'bg-gradient-to-r from-rose-500 to-amber-500'
                        }`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                      {/* Linha de referência de aprovação */}
                      <div
                        title={`Mínimo de aprovação: ${formatNumberBr(m.latest.notaAprovacaoRef)} pts (${aprobPct}%)`}
                        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow"
                        style={{ left: `${Math.min(99, Math.max(1, aprobPct))}%` }}
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-2 text-xs">
                      <div className="text-amber-200 font-semibold">
                        Marca atingida: <span className="text-white">{formatResultadoResumo(m.latest)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Aprovação: ≥ {formatNumberBr(m.latest.notaAprovacaoRef)} pts
                        {m.latest.tempoAprovacaoRef != null ? ` • Tempo alvo: ≤ ${formatSecondsCompact(m.latest.tempoAprovacaoRef)}` : ''}
                        {m.attempts > 1 ? ` • Melhor: ${formatResultadoResumo(m.best)}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* GRÁFICO 2: CURVA DE EVOLUÇÃO HISTÓRICA AO LONGO DOS ANOS */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Curva de Evolução Histórica{' '}
                  {selectedMarkerId === 'GERAL'
                    ? '(Aproveitamento Geral)'
                    : `(${markerSummaries.find(m => m.marcadorId === selectedMarkerId)?.marcadorNome || ''})`}
                </h4>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                {evolutionDelta !== null && (
                  <span
                    className={`px-2.5 py-1 rounded-lg font-extrabold ${
                      evolutionDelta >= 0
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    Variação no período: {evolutionDelta >= 0 ? '+' : ''}
                    {evolutionDelta}%
                  </span>
                )}
                {selectedMarkerId !== 'GERAL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedMarkerId('GERAL')}
                    className="text-xs text-amber-400 hover:underline font-bold"
                  >
                    Ver todos os marcadores
                  </button>
                )}
              </div>
            </div>

            {curvePoints.length > 0 ? (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full min-w-[540px] h-[250px] select-none"
                  onMouseLeave={() => setHoveredPointIdx(null)}
                >
                  <defs>
                    <linearGradient id="evolAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Grade horizontal 0, 25, 50, 75, 100% */}
                  {[0, 25, 50, 75, 100].map(pct => {
                    const y = padT + plotH - (pct / 100) * plotH;
                    return (
                      <g key={pct}>
                        <line
                          x1={padL}
                          x2={svgW - padR}
                          y1={y}
                          y2={y}
                          stroke="#1e293b"
                          strokeWidth="1"
                          strokeDasharray={pct === 0 ? undefined : '4 4'}
                        />
                        <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="600">
                          {pct}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Linha de aprovação */}
                  {approvalLineY !== null && (
                    <g>
                      <line
                        x1={padL}
                        x2={svgW - padR}
                        y1={approvalLineY}
                        y2={approvalLineY}
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="6 4"
                      />
                      <text
                        x={svgW - padR - 4}
                        y={approvalLineY - 5}
                        textAnchor="end"
                        fontSize="10"
                        fill="#fbbf24"
                        fontWeight="700"
                      >
                        Meta de Aprovação ({curvePoints[0].approvalPct}%)
                      </text>
                    </g>
                  )}

                  {/* Área preenchida */}
                  {curvePoints.length > 1 && <path d={areaPath} fill="url(#evolAreaGrad)" />}

                  {/* Linha da curva */}
                  {curvePoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={polylinePath}
                    />
                  )}

                  {/* Pontos */}
                  {curvePoints.map((pt, idx) => {
                    const isHovered = hoveredPointIdx === idx;
                    const showLabel =
                      curvePoints.length <= 10 ||
                      idx === 0 ||
                      idx === curvePoints.length - 1 ||
                      idx % Math.ceil(curvePoints.length / 8) === 0;
                    return (
                      <g
                        key={pt.key}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPointIdx(idx)}
                      >
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 7 : 5}
                          fill={pt.aprovado ? '#10b981' : '#f59e0b'}
                          stroke="#0f172a"
                          strokeWidth="2"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 10}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#f8fafc"
                          fontWeight="700"
                        >
                          {Math.round(pt.valuePct)}%
                        </text>
                        {showLabel && (
                          <text
                            x={pt.x}
                            y={svgH - 14}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#94a3b8"
                            fontWeight="600"
                          >
                            {pt.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Detalhe do ponto focado / último ponto */}
                {(() => {
                  const activePt =
                    hoveredPointIdx !== null && curvePoints[hoveredPointIdx]
                      ? curvePoints[hoveredPointIdx]
                      : curvePoints[curvePoints.length - 1];
                  if (!activePt) return null;
                  return (
                    <div className="mt-2 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-white flex items-center space-x-2">
                          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{activePt.label}</span>
                          <span className="text-slate-500">•</span>
                          <span className="truncate">{activePt.title}</span>
                        </div>
                        <div className="text-slate-300 mt-0.5">{activePt.subtitle}</div>
                        {activePt.detail && (
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{activePt.detail}</div>
                        )}
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg font-extrabold shrink-0 ${
                          activePt.aprovado
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {activePt.valuePct}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>

          {/* HISTÓRICO COMPLETO DE AVALIAÇÕES */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Histórico Completo de Avaliações ({filteredResultados.length})
                </h4>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 pr-3">Data</th>
                    <th className="py-2.5 px-3">Categoria</th>
                    <th className="py-2.5 px-3">Marcador</th>
                    <th className="py-2.5 px-3">Atividade / Grupo</th>
                    <th className="py-2.5 px-3">Marca / Tempo / Nota</th>
                    <th className="py-2.5 px-3 text-center">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {[...filteredResultados].reverse().map(r => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 pr-3 whitespace-nowrap font-semibold text-slate-200">
                        {formatDateBr(r.dataAvaliacao)}
                        {r.horaAvaliacao ? <span className="text-slate-500 ml-1">{r.horaAvaliacao}</span> : null}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.categoria === 'FISICO'
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {r.categoria === 'FISICO' ? 'Físico' : 'Tático'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white">{r.marcadorNome}</div>
                        {r.tipoMarca && <div className="text-[10px] text-slate-400">{r.tipoMarca}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-200 font-medium">{r.atividadeNome || r.grupoNome || '—'}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.grupoStatus === 'ENCERRADO' ? 'Grupo arquivado' : 'Grupo aberto'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-amber-200">{formatResultadoResumo(r)}</div>
                        {r.observacoes && <div className="text-[10px] text-slate-400 mt-0.5">{r.observacoes}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {r.ausente ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-extrabold">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Ausente</span>
                            </span>
                            {r.ausenciaInformada !== null && r.ausenciaInformada !== undefined && (
                              <span className="text-[9px] text-slate-400 mt-0.5">
                                {r.ausenciaInformada ? 'Informada' : 'Não informada'}
                              </span>
                            )}
                          </div>
                        ) : r.aprovado ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-extrabold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Aprovado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-extrabold">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Abaixo da Meta</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
