import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Department,
  Unit,
  RelatorioTreinamentoPolicial,
  TituloTreinamentoPolicial,
  LocalTreinamentoPolicial,
  ParticipacaoTreinamentoPolicial,
  ParticipanteTreinamentoPolicial,
  UnidadeParticipanteTreinamento,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import {
  printDocumentInPage,
  buildStandardDocumentTitle,
  buildStandardDocumentFilename
} from '../utils/printHelper';
import {
  PenTool,
  ClipboardList,
  Shield,
  Calendar,
  MapPin,
  Users,
  UserCheck,
  Search,
  Plus,
  X,
  Save,
  Printer,
  Edit,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Building2,
  FileText,
  Award
} from 'lucide-react';

interface RelatorioPolicialUnidadePanelProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  activeUnitId?: string;
  activeUnitName: string;
  activeDeptId?: string;
  activeDeptName: string;
  onRefresh?: () => void;
  dataVersion?: number;
}

type PolicialSubTab = 'TREINAMENTO' | 'OPERACOES' | 'MEUS_RELATORIOS';
type MyReportFilter = 'TODOS' | 'CRIADOS' | 'ASSINADOS' | 'PENDENTES';

const MAX_PARTICIPANTES = 100;
const MAX_DESCRICAO = 1000;
const TITULOS_TREINAMENTO: TituloTreinamentoPolicial[] = ['Operacional', 'Tático', 'Físico', '3C'];

const getTodayBrasilia = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const getRemainingSecondsTodayBrasilia = (): { formatted: string; totalSeconds: number } => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === 'hour')?.value || '0');
    const m = Number(parts.find(p => p.type === 'minute')?.value || '0');
    const s = Number(parts.find(p => p.type === 'second')?.value || '0');
    const elapsed = h * 3600 + m * 60 + s;
    const remaining = Math.max(0, 86400 - elapsed);
    const rh = Math.floor(remaining / 3600);
    const rm = Math.floor((remaining % 3600) / 60);
    const rs = remaining % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return { formatted: `${pad(rh)}:${pad(rm)}:${pad(rs)}`, totalSeconds: remaining };
  } catch {
    return { formatted: '00:00:00', totalSeconds: 0 };
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

export const RelatorioPolicialUnidadePanel: React.FC<RelatorioPolicialUnidadePanelProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  activeUnitId,
  activeUnitName,
  activeDeptId,
  activeDeptName,
  onRefresh,
  dataVersion = 0
}) => {
  const effectiveUnitId = activeUnitId || currentUser.unitId || '';
  const effectiveDeptId = activeDeptId || currentUser.departmentId || '';

  const [subTab, setSubTab] = useState<PolicialSubTab>('TREINAMENTO');
  const [localVersion, setLocalVersion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Countdown until end of day (Brasília timezone)
  const [editCountdown, setEditCountdown] = useState(() => getRemainingSecondsTodayBrasilia());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEditCountdown(getRemainingSecondsTodayBrasilia());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Form state — Relatório de Treinamento
  const [editingReport, setEditingReport] = useState<RelatorioTreinamentoPolicial | null>(null);
  const [dataTreinamento, setDataTreinamento] = useState<string>(() => getTodayBrasilia());
  const [modalidadeLocal, setModalidadeLocal] = useState<LocalTreinamentoPolicial>('Interno');
  const [tituloTreinamento, setTituloTreinamento] = useState<TituloTreinamentoPolicial>('Operacional');
  const [modalidadeParticipacao, setModalidadeParticipacao] =
    useState<ParticipacaoTreinamentoPolicial>('Sozinho');
  const [participacaoOutrasUnidades, setParticipacaoOutrasUnidades] = useState<boolean>(false);
  const [outrasUnidades, setOutrasUnidades] = useState<UnidadeParticipanteTreinamento[]>([]);
  const [participantes, setParticipantes] = useState<ParticipanteTreinamentoPolicial[]>([]);
  const [participantSearch, setParticipantSearch] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');

  // Inline confirmation states (no window.confirm)
  const [confirmDeleteTodayId, setConfirmDeleteTodayId] = useState<string | null>(null);
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);

  // Meus Relatórios state
  const [myFilter, setMyFilter] = useState<MyReportFilter>('TODOS');
  const [mySearch, setMySearch] = useState<string>('');
  const [isMySectionOpen, setIsMySectionOpen] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [viewModalReport, setViewModalReport] = useState<RelatorioTreinamentoPolicial | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);

  const todayBr = getTodayBrasilia();

  const allReports = useMemo<RelatorioTreinamentoPolicial[]>(() => {
    return storage.getRelatoriosTreinamentoPolicial();
  }, [dataVersion, localVersion]);

  const unitMap = useMemo(() => {
    const map = new Map<string, Unit>();
    for (const u of units) map.set(u.id, u);
    return map;
  }, [units]);

  const getUnitNameById = (uid?: string | null): string => {
    if (!uid) return 'Sem Unidade';
    return unitMap.get(uid)?.name || uid;
  };

  // Other units selectable when participacaoOutrasUnidades === true
  const availableOtherUnits = useMemo(() => {
    const selectedIds = new Set(outrasUnidades.map(u => u.id));
    return units
      .filter(u => u.id !== effectiveUnitId && !selectedIds.has(u.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [units, effectiveUnitId, outrasUnidades]);

  // All eligible users for selection in Coletivo mode:
  // Members of user's linked unit + members of all selected other units
  const eligibleUsersForColetivo = useMemo(() => {
    const allowedUnitIds = new Set<string>();
    if (effectiveUnitId) allowedUnitIds.add(effectiveUnitId);
    if (participacaoOutrasUnidades) {
      for (const u of outrasUnidades) {
        allowedUnitIds.add(u.id);
      }
    }

    const operatorIdToExclude = editingReport ? editingReport.operadorId : currentUser.id;
    const alreadySelectedIds = new Set(participantes.map(p => p.userId));
    const q = normalizeText(participantSearch);

    return allUsers
      .filter(u => {
        if (!u?.id) return false;
        if (u.id === operatorIdToExclude) return false;
        if (alreadySelectedIds.has(u.id)) return false;
        if (!u.unitId || !allowedUnitIds.has(u.unitId)) return false;
        if (q) {
          const hay = normalizeText(
            `${u.name || ''} ${u.masp || ''} ${u.cargo || ''} ${getUnitNameById(u.unitId)}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aOwn = a.unitId === effectiveUnitId ? 0 : 1;
        const bOwn = b.unitId === effectiveUnitId ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [
    allUsers,
    effectiveUnitId,
    participacaoOutrasUnidades,
    outrasUnidades,
    editingReport,
    currentUser.id,
    participantes,
    participantSearch,
    unitMap
  ]);

  // Reports related to the current user (creator or participant)
  const myReports = useMemo(() => {
    return allReports.filter(rel => {
      const isCreator = rel.operadorId === currentUser.id;
      const isParticipant = (rel.participantes || []).some(p => p.userId === currentUser.id);
      return isCreator || isParticipant;
    });
  }, [allReports, currentUser.id]);

  // Today's editable reports for this user (creator or signed participant)
  const todayEditableReports = useMemo(() => {
    return myReports.filter(rel => {
      if (String(rel.dataTreinamento || '').slice(0, 10) !== todayBr) return false;
      const isCreator = rel.operadorId === currentUser.id;
      const isSignedParticipant = (rel.participantes || []).some(
        p => p.userId === currentUser.id && Boolean(p.signed)
      );
      return isCreator || isSignedParticipant;
    });
  }, [myReports, todayBr, currentUser.id]);

  const pendingSignatureCount = useMemo(() => {
    return myReports.filter(rel =>
      (rel.participantes || []).some(p => p.userId === currentUser.id && !p.signed)
    ).length;
  }, [myReports, currentUser.id]);

  const filteredMyReports = useMemo(() => {
    const q = normalizeText(mySearch);
    return myReports.filter(rel => {
      const isCreator = rel.operadorId === currentUser.id;
      const myPart = (rel.participantes || []).find(p => p.userId === currentUser.id);
      const isPendingForMe = Boolean(myPart && !myPart.signed);
      const isSignedJointForMe = Boolean(myPart && myPart.signed);

      if (myFilter === 'CRIADOS' && !isCreator) return false;
      if (myFilter === 'ASSINADOS' && !isSignedJointForMe) return false;
      if (myFilter === 'PENDENTES' && !isPendingForMe) return false;

      if (q) {
        const partNames = (rel.participantes || []).map(p => `${p.name} ${p.masp} ${p.unitName || ''}`).join(' ');
        const otherUnitNames = (rel.outrasUnidades || []).map(u => u.name).join(' ');
        const hay = normalizeText(
          `${formatDateBr(rel.dataTreinamento)} ${rel.tituloTreinamento} ${rel.modalidadeLocal} ${rel.modalidadeParticipacao} ${rel.operadorNome} ${rel.operadorMasp} ${rel.unitName || ''} ${partNames} ${otherUnitNames} ${rel.descricao}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [myReports, myFilter, mySearch, currentUser.id]);

  const resetForm = () => {
    setEditingReport(null);
    setDataTreinamento(getTodayBrasilia());
    setModalidadeLocal('Interno');
    setTituloTreinamento('Operacional');
    setModalidadeParticipacao('Sozinho');
    setParticipacaoOutrasUnidades(false);
    setOutrasUnidades([]);
    setParticipantes([]);
    setParticipantSearch('');
    setDescricao('');
  };

  const handleStartEdit = (rel: RelatorioTreinamentoPolicial) => {
    setFeedback(null);
    setEditingReport(rel);
    setDataTreinamento(String(rel.dataTreinamento || getTodayBrasilia()).slice(0, 10));
    setModalidadeLocal(rel.modalidadeLocal || 'Interno');
    setTituloTreinamento(rel.tituloTreinamento || 'Operacional');
    setModalidadeParticipacao(rel.modalidadeParticipacao || 'Sozinho');
    setParticipacaoOutrasUnidades(Boolean(rel.participacaoOutrasUnidades));
    setOutrasUnidades(Array.isArray(rel.outrasUnidades) ? rel.outrasUnidades : []);
    setParticipantes(Array.isArray(rel.participantes) ? rel.participantes : []);
    setParticipantSearch('');
    setDescricao(rel.descricao || '');
    setSubTab('TREINAMENTO');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleOtherUnitsFlag = (value: string) => {
    const isYes = value === 'Sim';
    setParticipacaoOutrasUnidades(isYes);
    if (!isYes) {
      setOutrasUnidades([]);
      // Remove participants from other units if user switches back to Não
      setParticipantes(prev => prev.filter(p => !p.unitId || p.unitId === effectiveUnitId));
    }
  };

  const handleAddOtherUnit = (unitIdToAdd: string) => {
    if (!unitIdToAdd) return;
    const found = units.find(u => u.id === unitIdToAdd);
    if (!found) return;
    setOutrasUnidades(prev => {
      if (prev.some(u => u.id === found.id)) return prev;
      return [...prev, { id: found.id, name: found.name }];
    });
  };

  const handleRemoveOtherUnit = (unitIdToRemove: string) => {
    setOutrasUnidades(prev => prev.filter(u => u.id !== unitIdToRemove));
    setParticipantes(prev => prev.filter(p => p.unitId !== unitIdToRemove));
  };

  const handleAddParticipant = (u: User) => {
    if (participantes.length >= MAX_PARTICIPANTES) {
      setFeedback({
        type: 'error',
        message: `Limite máximo de ${MAX_PARTICIPANTES} participantes atingido.`
      });
      return;
    }
    if (participantes.some(p => p.userId === u.id)) return;
    const newEntry: ParticipanteTreinamentoPolicial = {
      userId: u.id,
      name: u.name,
      masp: u.masp || '',
      cargo: u.cargo || '',
      unitId: u.unitId || '',
      unitName: getUnitNameById(u.unitId),
      signed: false,
      signedAt: null
    };
    setParticipantes(prev => [...prev, newEntry]);
    setFeedback(null);
  };

  const handleRemoveParticipant = (userIdToRemove: string) => {
    setParticipantes(prev => prev.filter(p => p.userId !== userIdToRemove));
  };

  const handlePrintReport = (rel: RelatorioTreinamentoPolicial) => {
    const unitObj = units.find(u => u.id === (rel.unitId || effectiveUnitId));
    const deptObj = departments.find(d => d.id === (rel.departmentId || unitObj?.departmentId || effectiveDeptId));
    const logoUrl = getSystemLogo(unitObj, deptObj);
    const unitLabel = rel.unitName || unitObj?.name || activeUnitName || 'Unidade Policial';
    const deptLabel = deptObj?.name || activeDeptName || 'Polícia Civil de Minas Gerais';

    const participantsList = Array.isArray(rel.participantes) ? rel.participantes : [];
    const isColetivoMulti = rel.modalidadeParticipacao === 'Coletivo' && participantsList.length > 0;
    const otherUnitsList = Array.isArray(rel.outrasUnidades) ? rel.outrasUnidades : [];

    const docTitle = buildStandardDocumentTitle(
      `Relatório de Treinamento — ${rel.tituloTreinamento}`,
      unitLabel,
      formatDateBr(rel.dataTreinamento)
    );
    const filename = buildStandardDocumentFilename(
      `Relatorio_Treinamento_${rel.tituloTreinamento}_${unitLabel}`,
      rel.dataTreinamento
    );

    const signaturesHtml = isColetivoMulti
      ? `
        <div class="section-title">Equipe (${participantsList.length + 1} integrantes)</div>
        <div class="sig-grid">
          <div class="sig-card">
            <div class="sig-role">OPERADOR DIGITADOR</div>
            <div class="sig-name">${escapeHtmlText(rel.operadorNome)}</div>
            <div class="sig-meta">MASP: ${escapeHtmlText(rel.operadorMasp ? formatMasp(rel.operadorMasp) : 'N/A')}${
              rel.operadorCargo ? ` • ${escapeHtmlText(rel.operadorCargo)}` : ''
            }</div>
            <div class="sig-unit">${escapeHtmlText(unitLabel)}</div>
            <div class="sig-status signed">✓ Assinado eletronicamente${
              rel.operadorAssinadoEm ? ` em ${escapeHtmlText(formatDateTimeBr(rel.operadorAssinadoEm))}` : ''
            }</div>
          </div>
          ${participantsList
            .map(
              p => `
            <div class="sig-card">
              <div class="sig-role">OPERADOR</div>
              <div class="sig-name">${escapeHtmlText(p.name)}</div>
              <div class="sig-meta">MASP: ${escapeHtmlText(p.masp ? formatMasp(p.masp) : 'N/A')}${
                p.cargo ? ` • ${escapeHtmlText(p.cargo)}` : ''
              }</div>
              ${p.unitName ? `<div class="sig-unit">${escapeHtmlText(p.unitName)}</div>` : ''}
              <div class="sig-status ${p.signed ? 'signed' : 'pending'}">
                ${
                  p.signed
                    ? `✓ Assinado eletronicamente${p.signedAt ? ` em ${escapeHtmlText(formatDateTimeBr(p.signedAt))}` : ''}`
                    : 'Pendente de assinatura'
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      : `
        <div class="section-title">Assinatura</div>
        <div class="sig-grid single">
          <div class="sig-card">
            <div class="sig-role">OPERADOR DIGITADOR</div>
            <div class="sig-name">${escapeHtmlText(rel.operadorNome)}</div>
            <div class="sig-meta">MASP: ${escapeHtmlText(rel.operadorMasp ? formatMasp(rel.operadorMasp) : 'N/A')}${
              rel.operadorCargo ? ` • ${escapeHtmlText(rel.operadorCargo)}` : ''
            }</div>
            <div class="sig-unit">${escapeHtmlText(unitLabel)}</div>
            <div class="sig-status signed">✓ Assinado eletronicamente${
              rel.operadorAssinadoEm ? ` em ${escapeHtmlText(formatDateTimeBr(rel.operadorAssinadoEm))}` : ''
            }</div>
          </div>
        </div>
      `;

    const otherUnitsHtml =
      rel.participacaoOutrasUnidades && otherUnitsList.length > 0
        ? `
          <div class="info-box full">
            <div class="info-label">Outras Unidades Participantes</div>
            <div class="info-value">${otherUnitsList.map(u => escapeHtmlText(u.name)).join(' • ')}</div>
          </div>
        `
        : '';

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
          .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
          .info-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
          .info-box.full { grid-column: 1 / -1; }
          .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
          .info-value { font-size: 12px; font-weight: 700; color: #0f172a; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 14px 0 8px; }
          .desc-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #ffffff; white-space: pre-wrap; min-height: 80px; font-size: 12px; }
          .sig-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 8px; }
          .sig-grid.single { grid-template-columns: 1fr; max-width: 360px; }
          .sig-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; page-break-inside: avoid; background: #f8fafc; }
          .sig-role { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569; }
          .sig-name { font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 2px; }
          .sig-meta { font-size: 10px; color: #334155; }
          .sig-unit { font-size: 10px; color: #64748b; margin-top: 2px; }
          .sig-status { font-size: 10px; font-weight: 700; margin-top: 5px; }
          .sig-status.signed { color: #047857; }
          .sig-status.pending { color: #b45309; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${escapeHtmlText(logoUrl)}" alt="Brasão" />
          <div class="header-text">
            <h1>Polícia Civil de Minas Gerais — Relatório de Treinamento</h1>
            <p>${escapeHtmlText(deptLabel)} • Unidade: ${escapeHtmlText(unitLabel)}</p>
            <p>Data do Treinamento: ${escapeHtmlText(formatDateBr(rel.dataTreinamento))}</p>
          </div>
        </div>

        <div class="meta-grid">
          ${
            !isColetivoMulti
              ? `
                <div class="info-box">
                  <div class="info-label">Operador Digitador</div>
                  <div class="info-value">${escapeHtmlText(rel.operadorNome)}</div>
                  <div style="font-size:10px;color:#475569;">MASP: ${escapeHtmlText(
                    rel.operadorMasp ? formatMasp(rel.operadorMasp) : 'N/A'
                  )}${rel.operadorCargo ? ` • ${escapeHtmlText(rel.operadorCargo)}` : ''}</div>
                </div>
              `
              : ''
          }
          <div class="info-box">
            <div class="info-label">Título do Treinamento</div>
            <div class="info-value">${escapeHtmlText(rel.tituloTreinamento)}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Local do Treinamento</div>
            <div class="info-value">${escapeHtmlText(rel.modalidadeLocal)}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Formato de Participação</div>
            <div class="info-value">${escapeHtmlText(rel.modalidadeParticipacao)}</div>
          </div>
          ${otherUnitsHtml}
        </div>

        <div class="section-title">Descrição do Treinamento do Dia</div>
        <div class="desc-box">${escapeHtmlText(rel.descricao)}</div>

        ${signaturesHtml}
      </body>
      </html>
    `;

    printDocumentInPage(html, filename);
  };

  const handleSave = async (shouldPrint: boolean) => {
    setFeedback(null);

    const trimmedDesc = descricao.trim();
    if (!trimmedDesc) {
      setFeedback({ type: 'error', message: 'Informe a descrição do treinamento do dia.' });
      return;
    }
    if (trimmedDesc.length > MAX_DESCRICAO) {
      setFeedback({
        type: 'error',
        message: `A descrição do treinamento não pode ultrapassar ${MAX_DESCRICAO} caracteres.`
      });
      return;
    }
    if (modalidadeParticipacao === 'Coletivo' && participantes.length > MAX_PARTICIPANTES) {
      setFeedback({
        type: 'error',
        message: `O limite máximo é de ${MAX_PARTICIPANTES} participantes.`
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<RelatorioTreinamentoPolicial> = {
        dataTreinamento: editingReport ? editingReport.dataTreinamento : dataTreinamento,
        modalidadeLocal,
        tituloTreinamento,
        modalidadeParticipacao,
        participacaoOutrasUnidades: modalidadeParticipacao === 'Coletivo' && participacaoOutrasUnidades,
        outrasUnidades:
          modalidadeParticipacao === 'Coletivo' && participacaoOutrasUnidades ? outrasUnidades : [],
        participantes: modalidadeParticipacao === 'Coletivo' ? participantes : [],
        descricao: trimmedDesc,
        departmentId: effectiveDeptId || undefined,
        unitId: effectiveUnitId || undefined,
        unitName: activeUnitName || undefined
      };

      const res = editingReport
        ? await storage.updateRelatorioTreinamentoPolicial(editingReport.id, payload)
        : await storage.saveRelatorioTreinamentoPolicial(payload);

      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao salvar relatório de treinamento.' });
        return;
      }

      const savedRecord: RelatorioTreinamentoPolicial | undefined = res.data;
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();

      setFeedback({
        type: 'success',
        message: editingReport
          ? 'Relatório de treinamento atualizado com sucesso!'
          : 'Relatório de treinamento salvo com sucesso!'
      });

      resetForm();

      if (shouldPrint && savedRecord) {
        handlePrintReport(savedRecord);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignReport = async (rel: RelatorioTreinamentoPolicial) => {
    setFeedback(null);
    setSigningId(rel.id);
    try {
      const res = await storage.assinarRelatorioTreinamentoPolicial(rel.id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao assinar relatório.' });
        return;
      }
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();
      setFeedback({ type: 'success', message: 'Relatório assinado eletronicamente com sucesso!' });
      if (viewModalReport?.id === rel.id) {
        const refreshed = storage.getRelatoriosTreinamentoPolicial().find(r => r.id === rel.id);
        if (refreshed) setViewModalReport(refreshed);
      }
    } finally {
      setSigningId(null);
    }
  };

  const handleDeleteReport = async (id: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await storage.deleteRelatorioTreinamentoPolicial(id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir relatório.' });
        return;
      }
      setConfirmDeleteTodayId(null);
      setConfirmDeleteListId(null);
      if (editingReport?.id === id) resetForm();
      if (viewModalReport?.id === id) setViewModalReport(null);
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();
      setFeedback({ type: 'success', message: 'Relatório excluído com sucesso.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpandItem = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-5">
      {/* Navegação das 3 guias do Policial (unidades não-COC) */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl print:hidden">
        <button
          type="button"
          onClick={() => setSubTab('TREINAMENTO')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
            subTab === 'TREINAMENTO'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PenTool className="w-4 h-4" />
          <span>RELATÓRIO DE TREINAMENTO</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('OPERACOES')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
            subTab === 'OPERACOES'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>RELATÓRIO DE OPERAÇÕES</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('MEUS_RELATORIOS')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
            subTab === 'MEUS_RELATORIOS'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>MEUS RELATÓRIOS</span>
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
              subTab === 'MEUS_RELATORIOS'
                ? 'bg-slate-950/20 text-slate-950'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {myReports.length}
          </span>
          {pendingSignatureCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-500 text-white">
              {pendingSignatureCount} pendente{pendingSignatureCount > 1 ? 's' : ''}
            </span>
          )}
        </button>
      </div>

      {/* Feedback Banner */}
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* GUIA 1: RELATÓRIO DE TREINAMENTO                                   */}
      {/* ================================================================= */}
      {subTab === 'TREINAMENTO' && (
        <div className="space-y-5">
          {/* Relatórios de Hoje Disponíveis para Edição (com contagem regressiva) */}
          {todayEditableReports.length > 0 && (
            <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Relatórios de Hoje Disponíveis para Edição ({todayEditableReports.length})
                  </h3>
                </div>
                <div className="inline-flex items-center space-x-2 bg-slate-950 border border-cyan-500/30 px-3 py-1.5 rounded-xl text-[11px] font-mono">
                  <span className="text-slate-400">Tempo restante para edição/exclusão:</span>
                  <span
                    className={`font-bold ${
                      editCountdown.totalSeconds <= 3600 ? 'text-red-400' : 'text-cyan-300'
                    }`}
                  >
                    {editCountdown.formatted}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {todayEditableReports.map(rel => {
                  const isEditingThis = editingReport?.id === rel.id;
                  const canDelete = rel.operadorId === currentUser.id;
                  const partCount = (rel.participantes || []).length;
                  return (
                    <div
                      key={rel.id}
                      className={`bg-slate-950/70 border rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                        isEditingThis ? 'border-cyan-400' : 'border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-200">
                            {formatDateBr(rel.dataTreinamento)}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                            {rel.tituloTreinamento}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                            {rel.modalidadeLocal}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold">
                            {rel.modalidadeParticipacao}
                            {rel.modalidadeParticipacao === 'Coletivo' ? ` (+${partCount})` : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-1">
                          {rel.descricao}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          disabled={editCountdown.totalSeconds === 0 || isSubmitting}
                          onClick={() => handleStartEdit(rel)}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-40"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>{isEditingThis ? 'Editando' : 'Editar'}</span>
                        </button>

                        {canDelete && (
                          confirmDeleteTodayId === rel.id ? (
                            <div className="flex items-center space-x-1.5">
                              <button
                                type="button"
                                disabled={editCountdown.totalSeconds === 0 || isSubmitting}
                                onClick={() => handleDeleteReport(rel.id)}
                                className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-40"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTodayId(null)}
                                className="px-2 py-1.5 rounded-lg font-bold text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={editCountdown.totalSeconds === 0 || isSubmitting}
                              onClick={() => setConfirmDeleteTodayId(rel.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition disabled:opacity-40"
                              title="Excluir relatório de treinamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Formulário Principal de Relatório de Treinamento */}
          <div
            className={`bg-slate-900 border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 ${
              editingReport ? 'border-cyan-500/60' : 'border-slate-800'
            }`}
          >
            {/* Cabeçalho do Formulário */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    editingReport
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {editingReport ? <Edit className="w-5 h-5" /> : <PenTool className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide font-mono">
                      {editingReport ? 'Editando Relatório de Treinamento do Dia' : 'Relatório de Treinamento do Dia'}
                    </h2>
                    {editingReport && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold uppercase">
                        Modo Edição
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {editingReport
                      ? 'As assinaturas já registradas serão preservadas. Alterações são permitidas ao longo do dia de hoje.'
                      : `Registre o treinamento diário da unidade ${activeUnitName} com modalidade, título, participantes e descrição.`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {editingReport && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-700 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancelar Edição</span>
                  </button>
                )}
                <div className="inline-flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs font-mono">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-400">Data de Criação:</span>
                  <span className="font-bold text-slate-100">{formatDateBr(dataTreinamento)}</span>
                </div>
              </div>
            </div>

            {/* Linha 1: Operador Digitador + Local (Interno / Externo) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Operador Digitador */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Operador Digitador
                </label>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-slate-100">
                      {editingReport ? editingReport.operadorNome : currentUser.name || 'Policial'}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      MASP:{' '}
                      {(editingReport ? editingReport.operadorMasp : currentUser.masp)
                        ? formatMasp((editingReport ? editingReport.operadorMasp : currentUser.masp) || '')
                        : 'N/A'}
                      {(editingReport ? editingReport.operadorCargo : currentUser.cargo)
                        ? ` • ${editingReport ? editingReport.operadorCargo : currentUser.cargo}`
                        : ''}
                    </p>
                    {editingReport && editingReport.operadorId !== currentUser.id && (
                      <p className="text-[10px] text-cyan-300 mt-1 font-semibold">
                        Editando como participante assinante: {currentUser.name}
                      </p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                    OPERADOR DIGITADOR
                  </span>
                </div>
              </div>

              {/* Div onde estaria CACHORRO na referência: Interno ou Externo */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Treinamento Interno ou Externo *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Interno', 'Externo'] as LocalTreinamentoPolicial[]).map(local => (
                    <button
                      key={local}
                      type="button"
                      onClick={() => setModalidadeLocal(local)}
                      className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border font-bold transition ${
                        modalidadeLocal === local
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{local}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Linha 2: Título do Treinamento (onde seria Local) + Formato de Participação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Título do Treinamento: Operacional, Tático, Físico, 3C */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Título do Treinamento *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TITULOS_TREINAMENTO.map(titulo => (
                    <button
                      key={titulo}
                      type="button"
                      onClick={() => setTituloTreinamento(titulo)}
                      className={`flex items-center justify-center space-x-1.5 py-2.5 px-2.5 rounded-xl border font-bold transition ${
                        tituloTreinamento === titulo
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Award className="w-3.5 h-3.5 shrink-0" />
                      <span>{titulo}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Formato de Participação: Sozinho ou Coletivo */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Formato de Participação *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Sozinho', 'Coletivo'] as ParticipacaoTreinamentoPolicial[]).map(part => (
                    <button
                      key={part}
                      type="button"
                      onClick={() => {
                        setModalidadeParticipacao(part);
                        if (part === 'Sozinho') {
                          setParticipantes([]);
                          setParticipacaoOutrasUnidades(false);
                          setOutrasUnidades([]);
                          setParticipantSearch('');
                        }
                      }}
                      className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border font-bold transition ${
                        modalidadeParticipacao === part
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {part === 'Sozinho' ? (
                        <UserCheck className="w-3.5 h-3.5" />
                      ) : (
                        <Users className="w-3.5 h-3.5" />
                      )}
                      <span>{part}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Div Coletivo: Usuários Participantes para Assinatura Conjunta (até 100 participantes) */}
            {modalidadeParticipacao === 'Coletivo' && (
              <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-4 space-y-4 text-xs">
                {/* Cabeçalho com selectlist "Participação de outras unidades?" no lugar de "0/15 adicionados" */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-cyan-300 uppercase flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>Usuários Participantes para Assinatura Conjunta</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Selecione integrantes da unidade {activeUnitName} (até {MAX_PARTICIPANTES} participantes) junto com{' '}
                      {editingReport ? editingReport.operadorNome : currentUser.name}.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2">
                    <label
                      htmlFor="pol-outras-unidades-flag"
                      className="text-[11px] font-bold text-slate-200 whitespace-nowrap"
                    >
                      Participação de outras unidades?
                    </label>
                    <select
                      id="pol-outras-unidades-flag"
                      value={participacaoOutrasUnidades ? 'Sim' : 'Não'}
                      onChange={e => handleToggleOtherUnitsFlag(e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-cyan-300 font-bold rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-cyan-400"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                  </div>
                </div>

                {/* Selectlist para escolher quais outras unidades participaram (múltipla escolha) */}
                {participacaoOutrasUnidades && (
                  <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label
                        htmlFor="pol-outras-unidades-select"
                        className="text-[11px] font-bold uppercase text-amber-300 flex items-center space-x-1.5"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Selecione as outras unidades participantes</span>
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {outrasUnidades.length} unidade(s) adicional(is) selecionada(s)
                      </span>
                    </div>

                    <select
                      id="pol-outras-unidades-select"
                      value=""
                      onChange={e => handleAddOtherUnit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="">
                        {availableOtherUnits.length > 0
                          ? '+ Selecionar outra unidade participante...'
                          : 'Todas as unidades disponíveis já foram selecionadas'}
                      </option>
                      {availableOtherUnits.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>

                    {outrasUnidades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {outrasUnidades.map(u => (
                          <span
                            key={u.id}
                            className="inline-flex items-center space-x-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                          >
                            <Building2 className="w-3 h-3 text-amber-400" />
                            <span>{u.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOtherUnit(u.id)}
                              className="text-amber-300 hover:text-red-400 transition"
                              title="Remover unidade"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Participantes já selecionados */}
                {participantes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase text-slate-300">
                        Participantes Adicionados ({participantes.length} / {MAX_PARTICIPANTES})
                      </span>
                      <button
                        type="button"
                        onClick={() => setParticipantes([])}
                        className="text-[11px] text-slate-400 hover:text-red-400 font-semibold transition"
                      >
                        Limpar selecionados
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {participantes.map((p, idx) => (
                        <div
                          key={p.userId}
                          className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-cyan-400">#{idx + 1}</span>
                              <span className="font-bold text-slate-100 truncate">{p.name}</span>
                              {editingReport && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                    p.signed
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-400'
                                  }`}
                                >
                                  {p.signed ? '✓ Assinado' : 'Pendente'}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              MASP: {p.masp ? formatMasp(p.masp) : 'N/A'}
                              {p.cargo ? ` • ${p.cargo}` : ''}
                              {p.unitName ? ` • ${p.unitName}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(p.userId)}
                            className="p-1 text-slate-400 hover:text-red-400 transition shrink-0"
                            title="Remover participante"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campo de busca por nome + listagem de integrantes da unidade (e outras unidades selecionadas) */}
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={participantSearch}
                      onChange={e => setParticipantSearch(e.target.value)}
                      placeholder="Buscar integrante por nome, MASP ou cargo..."
                      className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl pl-9 pr-9 py-2.5 text-xs focus:outline-none focus:border-cyan-400"
                    />
                    {participantSearch && (
                      <button
                        type="button"
                        onClick={() => setParticipantSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-300">
                        Integrantes Disponíveis ({eligibleUsersForColetivo.length})
                      </span>
                      <span className="text-slate-400">
                        Clique no nome para adicionar ({participantes.length}/{MAX_PARTICIPANTES})
                      </span>
                    </div>

                    {eligibleUsersForColetivo.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs">
                        {participantSearch
                          ? 'Nenhum integrante encontrado com o filtro informado.'
                          : 'Todos os integrantes das unidades selecionadas já foram adicionados ou não há outros usuários vinculados.'}
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80">
                        {eligibleUsersForColetivo.map(u => {
                          const uUnitName = getUnitNameById(u.unitId);
                          const isOtherUnit = u.unitId !== effectiveUnitId;
                          return (
                            <button
                              key={u.id}
                              type="button"
                              disabled={participantes.length >= MAX_PARTICIPANTES}
                              onClick={() => handleAddParticipant(u)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-cyan-500/10 transition flex items-center justify-between gap-2 disabled:opacity-40"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-slate-100">{u.name}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      isOtherUnit
                                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                        : 'bg-slate-800 border-slate-700 text-slate-300'
                                    }`}
                                  >
                                    {uUnitName}
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  MASP: {u.masp ? formatMasp(u.masp) : 'N/A'}
                                  {u.cargo ? ` • ${u.cargo}` : ''}
                                </div>
                              </div>
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold shrink-0">
                                <Plus className="w-3 h-3" />
                                <span>Adicionar</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Descrição do Treinamento do Dia (máximo 1000 caracteres) */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="pol-descricao-treinamento"
                  className="text-[11px] font-bold text-slate-300 uppercase tracking-wider"
                >
                  Descrição do Treinamento do Dia *
                </label>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    descricao.length >= MAX_DESCRICAO
                      ? 'text-red-400'
                      : descricao.length >= 850
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }`}
                >
                  {descricao.length} / {MAX_DESCRICAO} caracteres
                </span>
              </div>
              <textarea
                id="pol-descricao-treinamento"
                rows={5}
                maxLength={MAX_DESCRICAO}
                value={descricao}
                onChange={e => setDescricao(e.target.value.slice(0, MAX_DESCRICAO))}
                placeholder="Descreva as atividades, exercícios, técnicas aplicadas e observações do treinamento realizado no dia..."
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl p-3.5 text-xs focus:outline-none focus:border-amber-500 resize-y"
              />
            </div>

            {/* Botões de Ação */}
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
      )}

      {/* ================================================================= */}
      {/* GUIA 2: RELATÓRIO DE OPERAÇÕES                                     */}
      {/* ================================================================= */}
      {subTab === 'OPERACOES' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-100">
            Relatório de Operações • {activeUnitName}
          </h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            Guia dedicada ao registro de relatórios de operações da unidade {activeUnitName}. Os campos específicos desta guia serão disponibilizados conforme definição operacional da unidade.
          </p>
        </div>
      )}

      {/* ================================================================= */}
      {/* GUIA 3: MEUS RELATÓRIOS                                            */}
      {/* ================================================================= */}
      {subTab === 'MEUS_RELATORIOS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center space-x-2">
                <ClipboardList className="w-4 h-4 text-amber-400" />
                <span>Meus Relatórios • {activeUnitName}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Consulte, assine, edite (no mesmo dia) e imprima seus relatórios de treinamento.
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={mySearch}
                onChange={e => setMySearch(e.target.value)}
                placeholder="Buscar por título, data, nome..."
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(
              [
                { id: 'TODOS', label: `Todos (${myReports.length})` },
                {
                  id: 'CRIADOS',
                  label: `Criados por Mim (${myReports.filter(r => r.operadorId === currentUser.id).length})`
                },
                {
                  id: 'ASSINADOS',
                  label: `Conjuntos Assinados (${
                    myReports.filter(r =>
                      (r.participantes || []).some(p => p.userId === currentUser.id && p.signed)
                    ).length
                  })`
                },
                {
                  id: 'PENDENTES',
                  label: `Pendentes de Assinatura (${pendingSignatureCount})`
                }
              ] as Array<{ id: MyReportFilter; label: string }>
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMyFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl font-bold border transition ${
                  myFilter === f.id
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Seção colapsável (inicia oculta) */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsMySectionOpen(prev => !prev)}
              className="w-full px-4 py-3 bg-slate-950/90 hover:bg-slate-950 flex items-center justify-between text-xs font-bold text-slate-200 transition"
            >
              <span className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>MEUS RELATÓRIOS DE TREINAMENTO ({filteredMyReports.length})</span>
              </span>
              <span className="flex items-center space-x-1 text-slate-400">
                <span>{isMySectionOpen ? 'Ocultar' : 'Abrir'}</span>
                {isMySectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>

            {isMySectionOpen && (
              <div className="p-3 space-y-2.5 bg-slate-900/60">
                {filteredMyReports.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Nenhum relatório de treinamento encontrado para o filtro selecionado.
                  </div>
                ) : (
                  filteredMyReports.map(rel => {
                    const isExpanded = Boolean(expandedIds[rel.id]);
                    const parts = rel.participantes || [];
                    const isColetivoMulti = rel.modalidadeParticipacao === 'Coletivo' && parts.length > 0;
                    const myPart = parts.find(p => p.userId === currentUser.id);
                    const needsMySignature = Boolean(myPart && !myPart.signed);
                    const isToday = String(rel.dataTreinamento || '').slice(0, 10) === todayBr;
                    const canEditToday =
                      isToday &&
                      (rel.operadorId === currentUser.id || Boolean(myPart && myPart.signed));
                    const canDeleteToday = isToday && rel.operadorId === currentUser.id;

                    const allSignersTooltip = [
                      `${rel.operadorNome} (Operador Digitador)`,
                      ...parts.map(p => `${p.name}${p.signed ? ' ✓' : ' (Pendente)'}`)
                    ].join('\n');

                    return (
                      <div
                        key={rel.id}
                        className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-100">
                                {formatDateBr(rel.dataTreinamento)}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                                {rel.tituloTreinamento}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold">
                                {rel.modalidadeLocal}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold">
                                {rel.modalidadeParticipacao}
                              </span>
                              {needsMySignature && (
                                <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                                  Assinatura Pendente
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-300">
                              {isColetivoMulti ? (
                                <span>
                                  <span className="text-slate-400">Operador digitador: </span>
                                  <span className="font-semibold text-slate-100">{rel.operadorNome}</span>{' '}
                                  <span className="text-slate-400">e </span>
                                  <span
                                    title={allSignersTooltip}
                                    className="font-bold text-cyan-300 underline decoration-dotted cursor-help"
                                  >
                                    OUTROS
                                  </span>
                                </span>
                              ) : (
                                <span>
                                  <span className="text-slate-400">Operador: </span>
                                  <span className="font-semibold text-slate-100">{rel.operadorNome}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {needsMySignature && (
                              <button
                                type="button"
                                disabled={signingId === rel.id}
                                onClick={() => handleSignReport(rel)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{signingId === rel.id ? 'Assinando...' : 'Assinar'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleExpandItem(rel.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center space-x-1 transition"
                            >
                              <span>{isExpanded ? 'Fechar' : 'Abrir'}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setViewModalReport(rel)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] flex items-center space-x-1 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver</span>
                            </button>

                            {canEditToday && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Editar</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handlePrintReport(rel)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Imprimir</span>
                            </button>

                            {canDeleteToday && (
                              confirmDeleteListId === rel.id ? (
                                <div className="flex items-center space-x-1">
                                  <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => handleDeleteReport(rel.id)}
                                    className="px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px]"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteListId(null)}
                                    className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-[11px]"
                                  >
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteListId(rel.id)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Conteúdo expandido ao clicar em Abrir */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                            <div>
                              <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                Descrição do Treinamento
                              </span>
                              <p className="text-slate-200 whitespace-pre-wrap bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                {rel.descricao}
                              </p>
                            </div>

                            {rel.participacaoOutrasUnidades && (rel.outrasUnidades || []).length > 0 && (
                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                  Outras Unidades Participantes
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {rel.outrasUnidades.map(u => (
                                    <span
                                      key={u.id}
                                      className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold"
                                    >
                                      {u.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {isColetivoMulti && (
                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                                  Participantes ({parts.length + 1})
                                </span>
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
                                    <span className="text-slate-100 font-semibold">
                                      {rel.operadorNome}{' '}
                                      <span className="text-[10px] text-cyan-300 font-bold">(Operador Digitador)</span>
                                    </span>
                                    <span className="text-emerald-400 font-bold text-[11px]">✓ Assinado</span>
                                  </div>
                                  {parts.map(p => (
                                    <div
                                      key={p.userId}
                                      className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5"
                                    >
                                      <span className="text-slate-200">
                                        <span className="font-semibold">{p.name}</span>
                                        {p.unitName && (
                                          <span className="text-[10px] text-slate-400"> • {p.unitName}</span>
                                        )}
                                      </span>
                                      <span
                                        className={`font-bold text-[11px] ${
                                          p.signed ? 'text-emerald-400' : 'text-amber-400'
                                        }`}
                                      >
                                        {p.signed ? '✓ Assinado' : 'Pendente'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Visualização (Ver) */}
      {viewModalReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100">
                  Relatório de Treinamento — {viewModalReport.tituloTreinamento}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {formatDateBr(viewModalReport.dataTreinamento)} • {viewModalReport.unitName || activeUnitName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewModalReport(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {(() => {
                const parts = viewModalReport.participantes || [];
                const isColetivoMulti =
                  viewModalReport.modalidadeParticipacao === 'Coletivo' && parts.length > 0;
                const myPart = parts.find(p => p.userId === currentUser.id);
                const needsSign = Boolean(myPart && !myPart.signed);

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {!isColetivoMulti && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Operador Digitador
                          </span>
                          <span className="font-bold text-slate-100 block mt-0.5">
                            {viewModalReport.operadorNome}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            MASP: {viewModalReport.operadorMasp ? formatMasp(viewModalReport.operadorMasp) : 'N/A'}
                          </span>
                        </div>
                      )}
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Título do Treinamento
                        </span>
                        <span className="font-bold text-amber-300 block mt-0.5">
                          {viewModalReport.tituloTreinamento}
                        </span>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Local do Treinamento
                        </span>
                        <span className="font-bold text-slate-100 block mt-0.5">
                          {viewModalReport.modalidadeLocal}
                        </span>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Formato de Participação
                        </span>
                        <span className="font-bold text-cyan-300 block mt-0.5">
                          {viewModalReport.modalidadeParticipacao}
                        </span>
                      </div>
                    </div>

                    {viewModalReport.participacaoOutrasUnidades &&
                      (viewModalReport.outrasUnidades || []).length > 0 && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                          <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                            Outras Unidades Participantes
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {viewModalReport.outrasUnidades.map(u => (
                              <span
                                key={u.id}
                                className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold"
                              >
                                {u.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                        Descrição do Treinamento do Dia
                      </span>
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {viewModalReport.descricao}
                      </p>
                    </div>

                    {isColetivoMulti && (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <span className="block text-[10px] font-bold uppercase text-cyan-300">
                          Participantes para Assinatura ({parts.length + 1})
                        </span>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                            <div>
                              <p className="font-bold text-slate-100">{viewModalReport.operadorNome}</p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                MASP:{' '}
                                {viewModalReport.operadorMasp
                                  ? formatMasp(viewModalReport.operadorMasp)
                                  : 'N/A'}
                                {viewModalReport.unitName ? ` • ${viewModalReport.unitName}` : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                                ✓ Assinado
                              </span>
                              <span className="block text-[10px] font-bold text-cyan-300 mt-0.5">
                                Digitador
                              </span>
                            </div>
                          </div>

                          {parts.map(p => (
                            <div
                              key={p.userId}
                              className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2"
                            >
                              <div>
                                <p className="font-bold text-slate-100">{p.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  MASP: {p.masp ? formatMasp(p.masp) : 'N/A'}
                                  {p.unitName ? ` • ${p.unitName}` : ''}
                                </p>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  p.signed
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                }`}
                              >
                                {p.signed ? '✓ Assinado' : 'Pendente'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      {needsSign && (
                        <button
                          type="button"
                          disabled={signingId === viewModalReport.id}
                          onClick={() => handleSignReport(viewModalReport)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Assinar Relatório</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePrintReport(viewModalReport)}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewModalReport(null)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
                      >
                        Fechar
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
