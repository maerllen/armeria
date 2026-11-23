import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Department,
  Unit,
  RelatorioTreinamentoPolicial,
  RelatorioOperacaoPolicial,
  RelatorioOperacaoCat,
  TituloTreinamentoPolicial,
  LocalTreinamentoPolicial,
  ParticipacaoTreinamentoPolicial,
  ParticipanteTreinamentoPolicial,
  UnidadeParticipanteTreinamento,
  isCatUnitName,
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
  RelatorioOperacoesPolicialForm,
  printRelatorioOperacaoPolicial,
  getPolOpRemainingEditMs,
  formatRemainingCountdown,
  isPolOpOperatorEffectivelySigned,
  formatMandadoPrisaoResumo,
  formatMandadoBuscaResumo,
  formatGerenciamentoCriseResumo
} from './RelatorioOperacoesPolicialForm';
import {
  RelatorioOperacoesCatForm,
  printRelatorioOperacaoCat,
  sumFlightHoursHHMM
} from './RelatorioOperacoesCatForm';
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
  Award,
  Car,
  Crosshair,
  Zap,
  Skull,
  Plane
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

type PolicialSubTab = 'TREINAMENTO' | 'OPERACOES' | 'MEUS_RELATORIOS' | 'RELATORIOS_UNIDADE';
type MyReportFilter = 'TODOS' | 'CRIADOS' | 'ASSINADOS' | 'PENDENTES';
type MyCategoryFilter = 'TODOS' | 'TREINAMENTO' | 'OPERACOES';

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
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isCatUnit = isCatUnitName(activeUnitName);
  const canViewUnitReports =
    effectiveRole === 'Armeiro' || effectiveRole === 'Administrador' || effectiveRole === 'Geral';

  const [subTab, setSubTab] = useState<PolicialSubTab>('TREINAMENTO');
  const [localVersion, setLocalVersion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reset tab if role does not permit RELATORIOS_UNIDADE
  useEffect(() => {
    if (!canViewUnitReports && subTab === 'RELATORIOS_UNIDADE') {
      setSubTab('TREINAMENTO');
    }
  }, [canViewUnitReports, subTab]);

  // Countdown until end of day (Brasília timezone) + nowMs for 3-day operation countdown
  const [editCountdown, setEditCountdown] = useState(() => getRemainingSecondsTodayBrasilia());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEditCountdown(getRemainingSecondsTodayBrasilia());
      setNowMs(Date.now());
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

  // Form state — Relatório de Operações (edição iniciada via Meus Relatórios)
  const [editingOpReport, setEditingOpReport] = useState<RelatorioOperacaoPolicial | null>(null);
  const [editingCatOpReport, setEditingCatOpReport] = useState<RelatorioOperacaoCat | null>(null);

  // Inline confirmation states (no window.confirm)
  const [confirmDeleteTodayId, setConfirmDeleteTodayId] = useState<string | null>(null);
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);
  const [confirmDeleteOpListId, setConfirmDeleteOpListId] = useState<string | null>(null);
  const [confirmDeleteCatOpListId, setConfirmDeleteCatOpListId] = useState<string | null>(null);

  // Meus Relatórios state
  const [myCategoryFilter, setMyCategoryFilter] = useState<MyCategoryFilter>('TODOS');
  const [myFilter, setMyFilter] = useState<MyReportFilter>('TODOS');
  const [mySearch, setMySearch] = useState<string>('');
  const [isMySectionOpen, setIsMySectionOpen] = useState<boolean>(false);
  const [isMyOpsSectionOpen, setIsMyOpsSectionOpen] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [expandedOpIds, setExpandedOpIds] = useState<Record<string, boolean>>({});

  // Relatórios da Unidade state (Armeiro / Administrador / Geral) — tudo inicia oculto
  const [unitCategoryFilter, setUnitCategoryFilter] = useState<MyCategoryFilter>('TODOS');
  const [unitSearch, setUnitSearch] = useState<string>('');
  const [unitDateStart, setUnitDateStart] = useState<string>('');
  const [unitDateEnd, setUnitDateEnd] = useState<string>('');
  const [unitOperatorId, setUnitOperatorId] = useState<string>('');
  const [isUnitTrainSectionOpen, setIsUnitTrainSectionOpen] = useState<boolean>(false);
  const [isUnitOpsSectionOpen, setIsUnitOpsSectionOpen] = useState<boolean>(false);
  const [expandedUnitIds, setExpandedUnitIds] = useState<Record<string, boolean>>({});

  const [viewModalReport, setViewModalReport] = useState<RelatorioTreinamentoPolicial | null>(null);
  const [viewModalOpReport, setViewModalOpReport] = useState<RelatorioOperacaoPolicial | null>(null);
  const [viewModalCatOpReport, setViewModalCatOpReport] = useState<RelatorioOperacaoCat | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signingOpId, setSigningOpId] = useState<string | null>(null);
  const [signingCatOpId, setSigningCatOpId] = useState<string | null>(null);

  const todayBr = getTodayBrasilia();

  const allReports = useMemo<RelatorioTreinamentoPolicial[]>(() => {
    return storage.getRelatoriosTreinamentoPolicial();
  }, [dataVersion, localVersion]);

  const allOpReports = useMemo<RelatorioOperacaoPolicial[]>(() => {
    return storage.getRelatoriosOperacoesPolicial();
  }, [dataVersion, localVersion]);

  const allCatOpReports = useMemo<RelatorioOperacaoCat[]>(() => {
    return storage.getRelatoriosOperacoesCat();
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

  const userDepartmentId = useMemo(() => {
    if (currentUser.departmentId) return currentUser.departmentId;
    if (effectiveUnitId) {
      const ownUnit = unitMap.get(effectiveUnitId);
      if (ownUnit?.departmentId) return ownUnit.departmentId;
    }
    return effectiveDeptId || '';
  }, [currentUser.departmentId, effectiveUnitId, unitMap, effectiveDeptId]);

  // Other units selectable when participacaoOutrasUnidades === true (apenas do departamento do usuário)
  const availableOtherUnits = useMemo(() => {
    const selectedIds = new Set(outrasUnidades.map(u => u.id));
    return units
      .filter(
        u =>
          u.id !== effectiveUnitId &&
          !selectedIds.has(u.id) &&
          Boolean(userDepartmentId) &&
          u.departmentId === userDepartmentId
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [units, effectiveUnitId, outrasUnidades, userDepartmentId]);

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

  // Operation reports related to the current user (creator or listed operator)
  const myOpReports = useMemo(() => {
    return allOpReports.filter(rel => {
      const isCreator = rel.criadorId === currentUser.id;
      const isListed = (rel.operadores || []).some(op => op.userId === currentUser.id);
      return isCreator || isListed;
    });
  }, [allOpReports, currentUser.id]);

  const pendingOpSignatureCount = useMemo(() => {
    return myOpReports.filter(rel => {
      const myOp = (rel.operadores || []).find(op => op.userId === currentUser.id);
      if (!myOp) return false;
      return !isPolOpOperatorEffectivelySigned(myOp, rel.createdAt).signed;
    }).length;
  }, [myOpReports, currentUser.id]);

  // CAT Operation reports related to the current user (creator or listed operator)
  const myCatOpReports = useMemo(() => {
    return allCatOpReports.filter(rel => {
      const isCreator = rel.criadorId === currentUser.id;
      const isListed = (rel.operadores || []).some(op => op.userId === currentUser.id);
      return isCreator || isListed;
    });
  }, [allCatOpReports, currentUser.id]);

  const pendingCatOpSignatureCount = useMemo(() => {
    return myCatOpReports.filter(rel => {
      const myOp = (rel.operadores || []).find(op => op.userId === currentUser.id);
      if (!myOp) return false;
      return !isPolOpOperatorEffectivelySigned(myOp, rel.createdAt).signed;
    }).length;
  }, [myCatOpReports, currentUser.id]);

  const totalMyOpsCount = myOpReports.length + myCatOpReports.length;
  const totalMyOpsPendingCount = pendingOpSignatureCount + pendingCatOpSignatureCount;
  const totalMyReportsCount = myReports.length + totalMyOpsCount;
  const totalPendingSignatureCount = pendingSignatureCount + totalMyOpsPendingCount;

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

  const filteredMyOpReports = useMemo(() => {
    const q = normalizeText(mySearch);
    return myOpReports.filter(rel => {
      const isCreator = rel.criadorId === currentUser.id;
      const myOp = (rel.operadores || []).find(op => op.userId === currentUser.id);
      const eff = myOp ? isPolOpOperatorEffectivelySigned(myOp, rel.createdAt) : null;
      const isPendingForMe = Boolean(myOp && eff && !eff.signed);
      const isSignedJointForMe = Boolean(myOp && eff && eff.signed && !isCreator);

      if (myFilter === 'CRIADOS' && !isCreator) return false;
      if (myFilter === 'ASSINADOS' && !isSignedJointForMe) return false;
      if (myFilter === 'PENDENTES' && !isPendingForMe) return false;

      if (q) {
        const munExtra = (rel.outrosMunicipios || []).map(m => `${m.municipio} ${m.uf}`).join(' ');
        const opNames = (rel.operadores || []).map(o => `${o.name} ${o.masp} ${o.cargo || ''}`).join(' ');
        const vtrText = (rel.viaturas || []).map(v => `${v.placa} ${v.descricao}`).join(' ');
        const deptApoio = (rel.departamentosApoio || []).join(' ');
        const detObj = rel.detalhesAdicionais || {};
        const detalhesTxt = [
          detObj.mandadoPrisao?.ativo ? `Mandado de Prisão ${formatMandadoPrisaoResumo(detObj.mandadoPrisao)}` : '',
          detObj.mandadoBusca?.ativo ? `Mandado de Busca ${formatMandadoBuscaResumo(detObj.mandadoBusca)}` : '',
          detObj.gerenciamentoCrise?.ativo ? `Gerenciamento de Crise ${formatGerenciamentoCriseResumo(detObj.gerenciamentoCrise)}` : ''
        ]
          .filter(Boolean)
          .join(' ');
        const hay = normalizeText(
          `${formatDateBr(rel.dataOperacao)} ${rel.municipioOperacao} ${rel.estadoOperacao} ${munExtra} ${rel.tipoAtendimento} ${rel.acionamentoVia} ${rel.acionamentoOutrosDescricao || ''} ${deptApoio} ${rel.criadorNome} ${opNames} ${vtrText} ${detalhesTxt} ${rel.sinopse}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [myOpReports, myFilter, mySearch, currentUser.id]);

  const filteredMyCatOpReports = useMemo(() => {
    const q = normalizeText(mySearch);
    return myCatOpReports.filter(rel => {
      const isCreator = rel.criadorId === currentUser.id;
      const myOp = (rel.operadores || []).find(op => op.userId === currentUser.id);
      const eff = myOp ? isPolOpOperatorEffectivelySigned(myOp, rel.createdAt) : null;
      const isPendingForMe = Boolean(myOp && eff && !eff.signed);
      const isSignedJointForMe = Boolean(myOp && eff && eff.signed && !isCreator);

      if (myFilter === 'CRIADOS' && !isCreator) return false;
      if (myFilter === 'ASSINADOS' && !isSignedJointForMe) return false;
      if (myFilter === 'PENDENTES' && !isPendingForMe) return false;

      if (q) {
        const munExtra = (rel.outrosMunicipios || []).map(m => `${m.municipio} ${m.uf}`).join(' ');
        const opNames = (rel.operadores || []).map(o => `${o.name} ${o.masp} ${o.cargo || ''}`).join(' ');
        const aeroText = (rel.aeronaves || []).map(a => `${a.tipo} ${a.prefixo} ${a.pilotoNome || ''} ${a.copilotoNome || ''}`).join(' ');
        const vtrText = (rel.viaturas || []).map(v => `${v.placa} ${v.descricao} ${v.tipoApoio}`).join(' ');
        const hay = normalizeText(
          `${formatDateBr(rel.dataOperacao)} ${rel.municipioOperacao} ${rel.estadoOperacao} ${munExtra} ${rel.tipoVoo || ''} ${rel.tipoVooOutrosDescricao || ''} ${rel.criadorNome} ${opNames} ${aeroText} ${vtrText} ${rel.sinopseVoo}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [myCatOpReports, myFilter, mySearch, currentUser.id]);

  // Relatórios da Unidade (escopo da unidade selecionada — visível para Armeiro, Administrador e Geral)
  const unitScopedTrainReports = useMemo(() => {
    if (!canViewUnitReports) return [];
    return allReports.filter(rel => {
      if (!effectiveUnitId) return true;
      if (rel.unitId) return rel.unitId === effectiveUnitId;
      const creator = allUsers.find(u => u.id === rel.operadorId);
      return creator?.unitId === effectiveUnitId;
    });
  }, [canViewUnitReports, allReports, effectiveUnitId, allUsers]);

  const unitScopedOpReports = useMemo(() => {
    if (!canViewUnitReports) return [];
    return allOpReports.filter(rel => {
      if (!effectiveUnitId) return true;
      if (rel.unitId) return rel.unitId === effectiveUnitId;
      const creator = allUsers.find(u => u.id === rel.criadorId);
      return creator?.unitId === effectiveUnitId;
    });
  }, [canViewUnitReports, allOpReports, effectiveUnitId, allUsers]);

  const unitScopedCatOpReports = useMemo(() => {
    if (!canViewUnitReports || !isCatUnit) return [];
    return allCatOpReports.filter(rel => {
      if (!effectiveUnitId) return true;
      if (rel.unitId) return rel.unitId === effectiveUnitId;
      const creator = allUsers.find(u => u.id === rel.criadorId);
      return creator?.unitId === effectiveUnitId;
    });
  }, [canViewUnitReports, isCatUnit, allCatOpReports, effectiveUnitId, allUsers]);

  const totalUnitOpsCount = unitScopedOpReports.length + unitScopedCatOpReports.length;
  const totalUnitReportsCount = unitScopedTrainReports.length + totalUnitOpsCount;

  const unitOperatorsForFilter = useMemo(() => {
    const map = new Map<string, { id: string; name: string; masp: string }>();
    for (const u of allUsers) {
      if (effectiveUnitId && u.unitId !== effectiveUnitId) continue;
      if (u.id && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name, masp: u.masp || '' });
      }
    }
    for (const rel of unitScopedTrainReports) {
      if (rel.operadorId && !map.has(rel.operadorId)) {
        map.set(rel.operadorId, { id: rel.operadorId, name: rel.operadorNome, masp: rel.operadorMasp || '' });
      }
      for (const p of rel.participantes || []) {
        if (p.userId && !map.has(p.userId)) {
          map.set(p.userId, { id: p.userId, name: p.name, masp: p.masp || '' });
        }
      }
    }
    for (const rel of unitScopedOpReports) {
      if (rel.criadorId && !map.has(rel.criadorId)) {
        map.set(rel.criadorId, { id: rel.criadorId, name: rel.criadorNome, masp: rel.criadorMasp || '' });
      }
      for (const o of rel.operadores || []) {
        if (o.userId && !map.has(o.userId)) {
          map.set(o.userId, { id: o.userId, name: o.name, masp: o.masp || '' });
        }
      }
    }
    for (const rel of unitScopedCatOpReports) {
      if (rel.criadorId && !map.has(rel.criadorId)) {
        map.set(rel.criadorId, { id: rel.criadorId, name: rel.criadorNome, masp: rel.criadorMasp || '' });
      }
      for (const o of rel.operadores || []) {
        if (o.userId && !map.has(o.userId)) {
          map.set(o.userId, { id: o.userId, name: o.name, masp: o.masp || '' });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allUsers, effectiveUnitId, unitScopedTrainReports, unitScopedOpReports, unitScopedCatOpReports]);

  const filteredUnitTrainReports = useMemo(() => {
    const q = normalizeText(unitSearch);
    return unitScopedTrainReports.filter(rel => {
      const dt = String(rel.dataTreinamento || '').slice(0, 10);
      if (unitDateStart && dt < unitDateStart) return false;
      if (unitDateEnd && dt > unitDateEnd) return false;
      if (unitOperatorId) {
        const matchOp =
          rel.operadorId === unitOperatorId ||
          (rel.participantes || []).some(p => p.userId === unitOperatorId);
        if (!matchOp) return false;
      }
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
  }, [unitScopedTrainReports, unitSearch, unitDateStart, unitDateEnd, unitOperatorId]);

  const filteredUnitOpReports = useMemo(() => {
    const q = normalizeText(unitSearch);
    return unitScopedOpReports.filter(rel => {
      const dt = String(rel.dataOperacao || '').slice(0, 10);
      if (unitDateStart && dt < unitDateStart) return false;
      if (unitDateEnd && dt > unitDateEnd) return false;
      if (unitOperatorId) {
        const matchOp =
          rel.criadorId === unitOperatorId ||
          (rel.operadores || []).some(o => o.userId === unitOperatorId);
        if (!matchOp) return false;
      }
      if (q) {
        const munExtra = (rel.outrosMunicipios || []).map(m => `${m.municipio} ${m.uf}`).join(' ');
        const opNames = (rel.operadores || []).map(o => `${o.name} ${o.masp} ${o.cargo || ''}`).join(' ');
        const vtrText = (rel.viaturas || []).map(v => `${v.placa} ${v.descricao}`).join(' ');
        const deptApoio = (rel.departamentosApoio || []).join(' ');
        const detObj = rel.detalhesAdicionais || {};
        const detalhesTxt = [
          detObj.mandadoPrisao?.ativo ? `Mandado de Prisão ${formatMandadoPrisaoResumo(detObj.mandadoPrisao)}` : '',
          detObj.mandadoBusca?.ativo ? `Mandado de Busca ${formatMandadoBuscaResumo(detObj.mandadoBusca)}` : '',
          detObj.gerenciamentoCrise?.ativo ? `Gerenciamento de Crise ${formatGerenciamentoCriseResumo(detObj.gerenciamentoCrise)}` : ''
        ]
          .filter(Boolean)
          .join(' ');
        const hay = normalizeText(
          `${formatDateBr(rel.dataOperacao)} ${rel.municipioOperacao} ${rel.estadoOperacao} ${munExtra} ${rel.tipoAtendimento} ${rel.acionamentoVia} ${rel.acionamentoOutrosDescricao || ''} ${deptApoio} ${rel.criadorNome} ${opNames} ${vtrText} ${detalhesTxt} ${rel.sinopse}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unitScopedOpReports, unitSearch, unitDateStart, unitDateEnd, unitOperatorId]);

  const filteredUnitCatOpReports = useMemo(() => {
    const q = normalizeText(unitSearch);
    return unitScopedCatOpReports.filter(rel => {
      const dt = String(rel.dataOperacao || '').slice(0, 10);
      if (unitDateStart && dt < unitDateStart) return false;
      if (unitDateEnd && dt > unitDateEnd) return false;
      if (unitOperatorId) {
        const matchOp =
          rel.criadorId === unitOperatorId ||
          (rel.operadores || []).some(o => o.userId === unitOperatorId);
        if (!matchOp) return false;
      }
      if (q) {
        const munExtra = (rel.outrosMunicipios || []).map(m => `${m.municipio} ${m.uf}`).join(' ');
        const opNames = (rel.operadores || []).map(o => `${o.name} ${o.masp} ${o.cargo || ''}`).join(' ');
        const aeroText = (rel.aeronaves || []).map(a => `${a.tipo} ${a.prefixo} ${a.pilotoNome || ''} ${a.copilotoNome || ''}`).join(' ');
        const vtrText = (rel.viaturas || []).map(v => `${v.placa} ${v.descricao} ${v.tipoApoio}`).join(' ');
        const hay = normalizeText(
          `${formatDateBr(rel.dataOperacao)} ${rel.municipioOperacao} ${rel.estadoOperacao} ${munExtra} ${rel.tipoVoo || ''} ${rel.criadorNome} ${opNames} ${aeroText} ${vtrText} ${rel.sinopseVoo}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unitScopedCatOpReports, unitSearch, unitDateStart, unitDateEnd, unitOperatorId]);

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

  const toggleExpandOpItem = (id: string) => {
    setExpandedOpIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandUnitItem = (key: string) => {
    setExpandedUnitIds(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStartEditOp = (rel: RelatorioOperacaoPolicial) => {
    setFeedback(null);
    setEditingOpReport(rel);
    setSubTab('OPERACOES');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOpReport = async (rel: RelatorioOperacaoPolicial) => {
    setFeedback(null);
    setSigningOpId(rel.id);
    try {
      const res = await storage.assinarRelatorioOperacaoPolicial(rel.id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao assinar relatório de operação.' });
        return;
      }
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();
      setFeedback({ type: 'success', message: 'Relatório de operação assinado eletronicamente com sucesso!' });
      if (viewModalOpReport?.id === rel.id) {
        const refreshed = storage.getRelatoriosOperacoesPolicial().find(r => r.id === rel.id);
        if (refreshed) setViewModalOpReport(refreshed);
      }
    } finally {
      setSigningOpId(null);
    }
  };

  const handleDeleteOpReport = async (id: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await storage.deleteRelatorioOperacaoPolicial(id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir relatório de operação.' });
        return;
      }
      setConfirmDeleteOpListId(null);
      if (editingOpReport?.id === id) setEditingOpReport(null);
      if (viewModalOpReport?.id === id) setViewModalOpReport(null);
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();
      setFeedback({ type: 'success', message: 'Relatório de operação excluído com sucesso.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditCatOp = (rel: RelatorioOperacaoCat) => {
    setFeedback(null);
    setEditingCatOpReport(rel);
    setSubTab('OPERACOES');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignCatOpReport = async (rel: RelatorioOperacaoCat) => {
    setFeedback(null);
    setSigningCatOpId(rel.id);
    try {
      const res = await storage.assinarRelatorioOperacaoCat(rel.id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao assinar relatório de operação CAT.' });
        return;
      }
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();
      setFeedback({ type: 'success', message: 'Relatório de operação CAT assinado eletronicamente com sucesso!' });
      if (viewModalCatOpReport?.id === rel.id) {
        const refreshed = storage.getRelatoriosOperacoesCat().find(r => r.id === rel.id);
        if (refreshed) setViewModalCatOpReport(refreshed);
      }
    } finally {
      setSigningCatOpId(null);
    }
  };

  const handleDeleteCatOpReport = async (id: string) => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const res = await storage.deleteRelatorioOperacaoCat(id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao excluir relatório de operação CAT.' });
        return;
      }
      setConfirmDeleteCatOpListId(null);
      if (editingCatOpReport?.id === id) setEditingCatOpReport(null);
      if (viewModalCatOpReport?.id === id) setViewModalCatOpReport(null);
      setLocalVersion(v => v + 1);
      if (onRefresh) onRefresh();
      setFeedback({ type: 'success', message: 'Relatório de operação CAT excluído com sucesso.' });
    } finally {
      setIsSubmitting(false);
    }
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
            {totalMyReportsCount}
          </span>
          {totalPendingSignatureCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-500 text-white">
              {totalPendingSignatureCount} pendente{totalPendingSignatureCount > 1 ? 's' : ''}
            </span>
          )}
        </button>

        {canViewUnitReports && (
          <button
            type="button"
            onClick={() => setSubTab('RELATORIOS_UNIDADE')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
              subTab === 'RELATORIOS_UNIDADE'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>RELATÓRIOS DA UNIDADE</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                subTab === 'RELATORIOS_UNIDADE'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {totalUnitReportsCount}
            </span>
          </button>
        )}
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
      {/* GUIA 2: RELATÓRIO DE OPERAÇÕES (SINOPSE DE OPERAÇÃO / CAT)         */}
      {/* ================================================================= */}
      {subTab === 'OPERACOES' &&
        (isCatUnit ? (
          <RelatorioOperacoesCatForm
            currentUser={currentUser}
            departments={departments}
            units={units}
            allUsers={allUsers}
            activeUnitId={effectiveUnitId}
            activeUnitName={activeUnitName}
            activeDeptId={effectiveDeptId}
            activeDeptName={activeDeptName}
            editingReportExternal={editingCatOpReport}
            onClearExternalEdit={() => setEditingCatOpReport(null)}
            onSaved={() => {
              setLocalVersion(v => v + 1);
              if (onRefresh) onRefresh();
            }}
            dataVersion={dataVersion + localVersion}
          />
        ) : (
          <RelatorioOperacoesPolicialForm
            currentUser={currentUser}
            departments={departments}
            units={units}
            allUsers={allUsers}
            activeUnitId={effectiveUnitId}
            activeUnitName={activeUnitName}
            activeDeptId={effectiveDeptId}
            activeDeptName={activeDeptName}
            editingReportExternal={editingOpReport}
            onClearExternalEdit={() => setEditingOpReport(null)}
            onSaved={() => {
              setLocalVersion(v => v + 1);
              if (onRefresh) onRefresh();
            }}
            dataVersion={dataVersion + localVersion}
          />
        ))}

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
                Consulte, assine, edite (dentro do prazo) e imprima seus relatórios de treinamento e operações.
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={mySearch}
                onChange={e => setMySearch(e.target.value)}
                placeholder="Buscar por município, título, data, nome..."
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Filtro por Tipo de Relatório + Status */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'TODOS', label: `Todos os Tipos (${totalMyReportsCount})` },
                  { id: 'TREINAMENTO', label: `Treinamento (${myReports.length})` },
                  { id: 'OPERACOES', label: `Operações (${totalMyOpsCount})` }
                ] as Array<{ id: MyCategoryFilter; label: string }>
              ).map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setMyCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold border transition ${
                    myCategoryFilter === cat.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const trainCreated = myReports.filter(r => r.operadorId === currentUser.id).length;
                const opCreated = myOpReports.filter(r => r.criadorId === currentUser.id).length;
                const trainSigned = myReports.filter(r =>
                  (r.participantes || []).some(p => p.userId === currentUser.id && p.signed)
                ).length;
                const opSigned = myOpReports.filter(r => {
                  const myOp = (r.operadores || []).find(o => o.userId === currentUser.id);
                  return Boolean(
                    myOp &&
                      r.criadorId !== currentUser.id &&
                      isPolOpOperatorEffectivelySigned(myOp, r.createdAt).signed
                  );
                }).length;

                const countTodos =
                  myCategoryFilter === 'TREINAMENTO'
                    ? myReports.length
                    : myCategoryFilter === 'OPERACOES'
                    ? myOpReports.length
                    : totalMyReportsCount;
                const countCriados =
                  myCategoryFilter === 'TREINAMENTO'
                    ? trainCreated
                    : myCategoryFilter === 'OPERACOES'
                    ? opCreated
                    : trainCreated + opCreated;
                const countAssinados =
                  myCategoryFilter === 'TREINAMENTO'
                    ? trainSigned
                    : myCategoryFilter === 'OPERACOES'
                    ? opSigned
                    : trainSigned + opSigned;
                const countPendentes =
                  myCategoryFilter === 'TREINAMENTO'
                    ? pendingSignatureCount
                    : myCategoryFilter === 'OPERACOES'
                    ? pendingOpSignatureCount
                    : totalPendingSignatureCount;

                return (
                  [
                    { id: 'TODOS', label: `Todos (${countTodos})` },
                    { id: 'CRIADOS', label: `Criados por Mim (${countCriados})` },
                    { id: 'ASSINADOS', label: `Conjuntos Assinados (${countAssinados})` },
                    { id: 'PENDENTES', label: `Pendentes (${countPendentes})` }
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
                ));
              })()}
            </div>
          </div>

          {/* Seção colapsável — Treinamento (inicia oculta) */}
          {myCategoryFilter !== 'OPERACOES' && (
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
          )}

          {/* Seção colapsável — Operações (inicia oculta) */}
          {myCategoryFilter !== 'TREINAMENTO' && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setIsMyOpsSectionOpen(prev => !prev)}
                className="w-full px-4 py-3 bg-slate-950/90 hover:bg-slate-950 flex items-center justify-between text-xs font-bold text-slate-200 transition"
              >
                <span className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>
                    MEUS RELATÓRIOS DE OPERAÇÕES ({filteredMyOpReports.length + filteredMyCatOpReports.length})
                  </span>
                  {totalMyOpsPendingCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                      {totalMyOpsPendingCount} pendente{totalMyOpsPendingCount > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <span className="flex items-center space-x-1 text-slate-400">
                  <span>{isMyOpsSectionOpen ? 'Ocultar' : 'Abrir'}</span>
                  {isMyOpsSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {isMyOpsSectionOpen && (
                <div className="p-3 space-y-2.5 bg-slate-900/60">
                  {filteredMyOpReports.length === 0 && filteredMyCatOpReports.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum relatório de operação encontrado para o filtro selecionado.
                    </div>
                  ) : (
                    <>
                    {filteredMyCatOpReports.map(rel => {
                      const isExpanded = Boolean(expandedOpIds[`cat-${rel.id}`]);
                      const ops = rel.operadores || [];
                      const myOp = ops.find(o => o.userId === currentUser.id);
                      const myEff = myOp ? isPolOpOperatorEffectivelySigned(myOp, rel.createdAt) : null;
                      const needsMySignature = Boolean(myOp && myEff && !myEff.signed);
                      const remainingMs = getPolOpRemainingEditMs(rel.createdAt, nowMs);
                      const isCitedOrGeral =
                        (currentUser.activeRole || currentUser.role) === 'Geral' ||
                        rel.criadorId === currentUser.id ||
                        Boolean(myOp);
                      const canEditOrDelete = remainingMs > 0 && isCitedOrGeral;
                      const municipiosLabel = [
                        `${rel.municipioOperacao}/${rel.estadoOperacao}`,
                        ...(!rel.apenasUmMunicipio ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`) : [])
                      ].join(' • ');
                      const otherOps = ops.filter(o => o.userId !== rel.criadorId);
                      const allOpsTooltip = [
                        `${rel.criadorNome} (Digitador)`,
                        ...otherOps.map(o => {
                          const st = isPolOpOperatorEffectivelySigned(o, rel.createdAt);
                          return `${o.name}${st.signed ? (st.autoSigned ? ' ✓ (30d)' : ' ✓') : ' (Pendente)'}`;
                        })
                      ].join('\n');
                      const prefixos = (rel.aeronaves || []).map(a => `${a.tipo} ${a.prefixo}`).join(', ');

                      return (
                        <div
                          key={`cat-${rel.id}`}
                          className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3.5 space-y-3 text-xs"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black inline-flex items-center space-x-1">
                                  <Plane className="w-3 h-3" />
                                  <span>CAT</span>
                                </span>
                                <span className="font-mono font-bold text-slate-100">
                                  {formatDateBr(rel.dataOperacao)}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono">
                                  {rel.horarioDecolagem} → {rel.horarioVooOperacao}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                                  {municipiosLabel}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold">
                                  {rel.comEmpregoAeronave
                                    ? `${rel.tipoVoo || 'COM AERONAVE'}${prefixos ? ` • ${prefixos}` : ''}`
                                    : 'Sem emprego de aeronave'}
                                </span>
                                {rel.comEmpregoAeronave && (
                                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-200 text-[10px] font-mono">
                                    Voo: {rel.horasTotaisVoo || sumFlightHoursHHMM(rel.aeronaves || [])}h
                                  </span>
                                )}
                                {needsMySignature && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                                    Assinatura Pendente
                                  </span>
                                )}
                                {canEditOrDelete && (
                                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono">
                                    Edição: {formatRemainingCountdown(remainingMs)}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-300">
                                {otherOps.length > 0 ? (
                                  <span>
                                    <span className="text-slate-400">Digitador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>{' '}
                                    <span className="text-slate-400">e </span>
                                    <span
                                      title={allOpsTooltip}
                                      className="font-bold text-cyan-300 underline decoration-dotted cursor-help"
                                    >
                                      OUTROS ({otherOps.length})
                                    </span>
                                  </span>
                                ) : (
                                  <span>
                                    <span className="text-slate-400">Operador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {needsMySignature && (
                                <button
                                  type="button"
                                  disabled={signingCatOpId === rel.id}
                                  onClick={() => handleSignCatOpReport(rel)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{signingCatOpId === rel.id ? 'Assinando...' : 'Assinar'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleExpandOpItem(`cat-${rel.id}`)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <span>{isExpanded ? 'Fechar' : 'Abrir'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => setViewModalCatOpReport(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>

                              {canEditOrDelete && isCatUnit && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditCatOp(rel)}
                                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  printRelatorioOperacaoCat(
                                    rel,
                                    units,
                                    departments,
                                    activeUnitName,
                                    activeDeptName
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>

                              {canEditOrDelete && (
                                confirmDeleteCatOpListId === rel.id ? (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      disabled={isSubmitting}
                                      onClick={() => handleDeleteCatOpReport(rel.id)}
                                      className="px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px]"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteCatOpListId(null)}
                                      className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-[11px]"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCatOpListId(rel.id)}
                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                                    title="Excluir relatório CAT"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                              {rel.comEmpregoAeronave && (rel.aeronaves || []).length > 0 && (
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                                  <span className="block text-[10px] font-bold uppercase text-amber-300">
                                    Aeronave(s) e Tripulação de Comando — Total: {rel.horasTotaisVoo || sumFlightHoursHHMM(rel.aeronaves || [])}h
                                  </span>
                                  {rel.aeronaves.map(a => (
                                    <div key={a.aeronaveId} className="text-[11px] text-slate-200">
                                      <strong>{a.tipo} {a.prefixo}</strong> • Piloto: {a.pilotoNome || '-'}
                                      {a.copilotoNome ? ` • Copiloto: ${a.copilotoNome}` : ''} • Horas: <span className="font-mono">{a.horasVoo || '00:00'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                  {rel.comEmpregoAeronave ? 'Sinopse do Voo' : 'Sinopse da Operação'}
                                </span>
                                <p className="text-slate-200 whitespace-pre-wrap bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                  {rel.sinopseVoo}
                                </p>
                              </div>
                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                                  Operadores / Assinaturas ({ops.length})
                                </span>
                                <div className="space-y-1.5">
                                  {ops.map(op => {
                                    const st = isPolOpOperatorEffectivelySigned(op, rel.createdAt);
                                    return (
                                      <div
                                        key={op.userId}
                                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5"
                                      >
                                        <span className="text-slate-200">
                                          <span className="font-semibold">{op.name}</span>
                                          {op.cargo && <span className="text-[10px] text-slate-400"> • {op.cargo}</span>}
                                          {op.userId === rel.criadorId && (
                                            <span className="text-[10px] text-cyan-300 font-bold"> (Digitador)</span>
                                          )}
                                        </span>
                                        <span className={`font-bold text-[11px] ${st.signed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                          {st.signed ? (st.autoSigned ? '✓ Assinado (30 dias)' : '✓ Assinado') : 'Pendente'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredMyOpReports.map(rel => {
                      const isExpanded = Boolean(expandedOpIds[rel.id]);
                      const ops = rel.operadores || [];
                      const myOp = ops.find(o => o.userId === currentUser.id);
                      const myEff = myOp ? isPolOpOperatorEffectivelySigned(myOp, rel.createdAt) : null;
                      const needsMySignature = Boolean(myOp && myEff && !myEff.signed);
                      const remainingMs = getPolOpRemainingEditMs(rel.createdAt, nowMs);
                      const isCitedOrGeral =
                        (currentUser.activeRole || currentUser.role) === 'Geral' ||
                        rel.criadorId === currentUser.id ||
                        Boolean(myOp);
                      const canEditOrDelete = remainingMs > 0 && isCitedOrGeral;

                      const municipiosLabel = [
                        `${rel.municipioOperacao}/${rel.estadoOperacao}`,
                        ...(!rel.apenasUmMunicipio ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`) : [])
                      ].join(' • ');

                      const otherOps = ops.filter(o => o.userId !== rel.criadorId);
                      const allOpsTooltip = [
                        `${rel.criadorNome} (Digitador)`,
                        ...otherOps.map(o => {
                          const st = isPolOpOperatorEffectivelySigned(o, rel.createdAt);
                          return `${o.name}${st.signed ? (st.autoSigned ? ' ✓ (30d)' : ' ✓') : ' (Pendente)'}`;
                        })
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
                                  {formatDateBr(rel.dataOperacao)}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono">
                                  {rel.horaSaidaBase} → {rel.horaOperacao}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                                  {municipiosLabel}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold">
                                  {rel.tipoAtendimento}
                                </span>
                                {rel.houveObito && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold inline-flex items-center space-x-1">
                                    <Skull className="w-3 h-3" />
                                    <span>
                                      Óbito{(rel.quantidadeObitos || 1) > 1 ? ` (${rel.quantidadeObitos})` : ''}
                                    </span>
                                  </span>
                                )}
                                {needsMySignature && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                                    Assinatura Pendente
                                  </span>
                                )}
                                {canEditOrDelete && (
                                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono">
                                    Edição: {formatRemainingCountdown(remainingMs)}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-300">
                                {otherOps.length > 0 ? (
                                  <span>
                                    <span className="text-slate-400">Digitador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>{' '}
                                    <span className="text-slate-400">e </span>
                                    <span
                                      title={allOpsTooltip}
                                      className="font-bold text-cyan-300 underline decoration-dotted cursor-help"
                                    >
                                      OUTROS ({otherOps.length})
                                    </span>
                                  </span>
                                ) : (
                                  <span>
                                    <span className="text-slate-400">Operador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {needsMySignature && (
                                <button
                                  type="button"
                                  disabled={signingOpId === rel.id}
                                  onClick={() => handleSignOpReport(rel)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{signingOpId === rel.id ? 'Assinando...' : 'Assinar'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleExpandOpItem(rel.id)}
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
                                onClick={() => setViewModalOpReport(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>

                              {canEditOrDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditOp(rel)}
                                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  printRelatorioOperacaoPolicial(
                                    rel,
                                    units,
                                    departments,
                                    activeUnitName,
                                    activeDeptName
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>

                              {canEditOrDelete && (
                                confirmDeleteOpListId === rel.id ? (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      disabled={isSubmitting}
                                      onClick={() => handleDeleteOpReport(rel.id)}
                                      className="px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px]"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteOpListId(null)}
                                      className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-[11px]"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteOpListId(rel.id)}
                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                                    title="Excluir relatório de operação"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Detalhes expandidos ao clicar em Abrir */}
                          {isExpanded && (
                            <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                                    Acionamento via
                                  </span>
                                  <span className="text-slate-100 font-semibold">
                                    {rel.acionamentoVia}
                                    {rel.acionamentoVia === 'OUTROS' && rel.acionamentoOutrosDescricao
                                      ? ` — ${rel.acionamentoOutrosDescricao}`
                                      : ''}
                                  </span>
                                </div>
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                                    Viaturas ({(rel.viaturas || []).length})
                                  </span>
                                  <span className="text-slate-100 font-mono text-[11px]">
                                    {(rel.viaturas || []).length > 0
                                      ? rel.viaturas.map(v => `${v.placa} (${v.descricao})`).join(' • ')
                                      : 'Nenhuma informada'}
                                  </span>
                                </div>
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                                    Apoio / Emergência
                                  </span>
                                  <span className="text-slate-200 text-[11px]">
                                    {rel.tipoAtendimento === 'Emergencial'
                                      ? rel.descricaoEmergencia || '-'
                                      : (rel.departamentosApoio || []).join(', ') || '-'}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                  Sinopse da Operação
                                </span>
                                <p className="text-slate-200 whitespace-pre-wrap bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                  {rel.sinopse}
                                </p>
                              </div>

                              {(() => {
                                const detObj = rel.detalhesAdicionais || {};
                                const items: Array<{ label: string; text: string }> = [];
                                if (detObj.mandadoPrisao?.ativo) {
                                  items.push({ label: 'MANDADO DE PRISÃO', text: formatMandadoPrisaoResumo(detObj.mandadoPrisao) });
                                }
                                if (detObj.mandadoBusca?.ativo) {
                                  items.push({ label: 'MANDADO DE BUSCA', text: formatMandadoBuscaResumo(detObj.mandadoBusca) });
                                }
                                if (detObj.gerenciamentoCrise?.ativo) {
                                  items.push({ label: 'GERENCIAMENTO DE CRISE', text: formatGerenciamentoCriseResumo(detObj.gerenciamentoCrise) });
                                }
                                if (items.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-1.5">
                                    {items.map(it => (
                                      <span
                                        key={it.label}
                                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-[11px]"
                                      >
                                        <strong className="text-amber-300">{it.label}:</strong> {it.text}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}

                              {rel.utilizouArmaFogoOuEletrica && (
                                <div className="bg-slate-900/70 border border-amber-500/30 rounded-lg p-2.5 space-y-1.5">
                                  <span className="block text-[10px] font-bold uppercase text-amber-300">
                                    Armamento / Incapacitação Elétrica Utilizado
                                  </span>
                                  {(rel.armasFogo || []).map((af, idx) => (
                                    <div key={af.id || idx} className="text-[11px] text-slate-200 flex items-center space-x-1.5">
                                      <Crosshair className="w-3 h-3 text-amber-400 shrink-0" />
                                      <span>
                                        {af.origem === 'ACERVO'
                                          ? `Acervo • Nº Série ${af.numeroSerie} (${af.marca} ${af.modelo}) — ${af.quantidadeTiros || 0} tiro(s)`
                                          : `Fora do Acervo • ${af.marca} ${af.modelo} • Nº Série ${af.numeroSerie} • Cal. ${af.calibre} — ${af.quantidadeTiros || 0} tiro(s)`}
                                      </span>
                                    </div>
                                  ))}
                                  {(rel.armasEletricas || []).map((ae, idx) => (
                                    <div key={ae.key || idx} className="text-[11px] text-slate-200 flex items-center space-x-1.5">
                                      <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                                      <span>
                                        {ae.tipo} • {ae.nome} (Nº Série: {ae.numeroSerie || 'S/N'})
                                        {ae.acautelado && ae.usuarioCautelaNome
                                          ? ` — Acautelado por ${ae.usuarioCautelaNome}`
                                          : ' — Disponível'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {rel.houveObito && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 space-y-2">
                                  <span className="block text-[10px] font-bold uppercase text-red-300">
                                    Óbito no Atendimento — Quantidade: {Math.max(1, Number(rel.quantidadeObitos) || 1)}
                                  </span>
                                  {rel.mesmaSinopseObito === false && (rel.sinopsesObitos || []).length > 0 ? (
                                    <div className="space-y-1.5">
                                      {(rel.sinopsesObitos || []).map((txt, idx) => (
                                        <div key={idx} className="bg-slate-950/60 border border-red-500/20 rounded-md p-2">
                                          <span className="block text-[9px] font-bold uppercase text-red-300 mb-0.5">
                                            Óbito {idx + 1}
                                          </span>
                                          <p className="text-slate-200 whitespace-pre-wrap text-[11px]">{txt}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    rel.sinopseObito && (
                                      <p className="text-slate-200 whitespace-pre-wrap text-[11px]">{rel.sinopseObito}</p>
                                    )
                                  )}
                                </div>
                              )}

                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                                  Operadores / Assinaturas ({ops.length})
                                </span>
                                <div className="space-y-1.5">
                                  {ops.map(op => {
                                    const st = isPolOpOperatorEffectivelySigned(op, rel.createdAt);
                                    return (
                                      <div
                                        key={op.userId}
                                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5"
                                      >
                                        <span className="text-slate-200">
                                          <span className="font-semibold">{op.name}</span>
                                          {op.cargo && (
                                            <span className="text-[10px] text-slate-400"> • {op.cargo}</span>
                                          )}
                                          {op.userId === rel.criadorId && (
                                            <span className="text-[10px] text-cyan-300 font-bold"> (Digitador)</span>
                                          )}
                                        </span>
                                        <span
                                          className={`font-bold text-[11px] ${
                                            st.signed ? 'text-emerald-400' : 'text-amber-400'
                                          }`}
                                        >
                                          {st.signed
                                            ? st.autoSigned
                                              ? '✓ Assinado (30 dias)'
                                              : '✓ Assinado'
                                            : 'Pendente'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* GUIA 4: RELATÓRIOS DA UNIDADE (ARMEIRO / ADMINISTRADOR / GERAL)    */}
      {/* ================================================================= */}
      {canViewUnitReports && subTab === 'RELATORIOS_UNIDADE' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>Relatórios da Unidade • {activeUnitName}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Consulte todos os relatórios de treinamento e de operações registrados na unidade {activeUnitName}.
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={unitSearch}
                onChange={e => setUnitSearch(e.target.value)}
                placeholder="Buscar por município, título, nome, viatura..."
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo de Relatório</label>
              <select
                value={unitCategoryFilter}
                onChange={e => setUnitCategoryFilter(e.target.value as MyCategoryFilter)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="TODOS">Todos ({totalUnitReportsCount})</option>
                <option value="TREINAMENTO">Treinamento ({unitScopedTrainReports.length})</option>
                <option value="OPERACOES">Operações ({totalUnitOpsCount})</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Policial / Operador</label>
              <select
                value={unitOperatorId}
                onChange={e => setUnitOperatorId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="">Todos os integrantes</option>
                {unitOperatorsForFilter.map(op => (
                  <option key={op.id} value={op.id}>
                    {op.name}{op.masp ? ` (${formatMasp(op.masp)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Data Inicial</label>
              <input
                type="date"
                value={unitDateStart}
                onChange={e => setUnitDateStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Data Final</label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="date"
                  value={unitDateEnd}
                  onChange={e => setUnitDateEnd(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none focus:border-amber-500"
                />
                {(unitSearch || unitDateStart || unitDateEnd || unitOperatorId || unitCategoryFilter !== 'TODOS') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnitSearch('');
                      setUnitDateStart('');
                      setUnitDateEnd('');
                      setUnitOperatorId('');
                      setUnitCategoryFilter('TODOS');
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold shrink-0"
                    title="Limpar filtros"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Seção colapsável — Relatórios de Treinamento da Unidade (inicia oculta) */}
          {unitCategoryFilter !== 'OPERACOES' && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setIsUnitTrainSectionOpen(prev => !prev)}
                className="w-full px-4 py-3 bg-slate-950/90 hover:bg-slate-950 flex items-center justify-between text-xs font-bold text-slate-200 transition"
              >
                <span className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>RELATÓRIOS DE TREINAMENTO DA UNIDADE ({filteredUnitTrainReports.length})</span>
                </span>
                <span className="flex items-center space-x-1 text-slate-400">
                  <span>{isUnitTrainSectionOpen ? 'Ocultar' : 'Abrir'}</span>
                  {isUnitTrainSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {isUnitTrainSectionOpen && (
                <div className="p-3 space-y-2.5 bg-slate-900/60">
                  {filteredUnitTrainReports.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum relatório de treinamento encontrado para os filtros selecionados.
                    </div>
                  ) : (
                    filteredUnitTrainReports.map(rel => {
                      const itemKey = `ut-${rel.id}`;
                      const isExpanded = Boolean(expandedUnitIds[itemKey]);
                      const parts = rel.participantes || [];
                      const isColetivoMulti = rel.modalidadeParticipacao === 'Coletivo' && parts.length > 0;
                      const myPart = parts.find(p => p.userId === currentUser.id);
                      const needsMySignature = Boolean(myPart && !myPart.signed);
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
                                onClick={() => toggleExpandUnitItem(itemKey)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <span>{isExpanded ? 'Fechar' : 'Abrir'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => setViewModalReport(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintReport(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>
                            </div>
                          </div>

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
                                        <span className={`font-bold text-[11px] ${p.signed ? 'text-emerald-400' : 'text-amber-400'}`}>
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
          )}

          {/* Seção colapsável — Relatórios de Operações da Unidade (inicia oculta) */}
          {unitCategoryFilter !== 'TREINAMENTO' && (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setIsUnitOpsSectionOpen(prev => !prev)}
                className="w-full px-4 py-3 bg-slate-950/90 hover:bg-slate-950 flex items-center justify-between text-xs font-bold text-slate-200 transition"
              >
                <span className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>
                    RELATÓRIOS DE OPERAÇÕES DA UNIDADE ({filteredUnitOpReports.length + filteredUnitCatOpReports.length})
                  </span>
                </span>
                <span className="flex items-center space-x-1 text-slate-400">
                  <span>{isUnitOpsSectionOpen ? 'Ocultar' : 'Abrir'}</span>
                  {isUnitOpsSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {isUnitOpsSectionOpen && (
                <div className="p-3 space-y-2.5 bg-slate-900/60">
                  {filteredUnitOpReports.length === 0 && filteredUnitCatOpReports.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum relatório de operação encontrado para os filtros selecionados.
                    </div>
                  ) : (
                    <>
                    {filteredUnitCatOpReports.map(rel => {
                      const itemKey = `ucat-${rel.id}`;
                      const isExpanded = Boolean(expandedUnitIds[itemKey]);
                      const ops = rel.operadores || [];
                      const myOp = ops.find(o => o.userId === currentUser.id);
                      const myEff = myOp ? isPolOpOperatorEffectivelySigned(myOp, rel.createdAt) : null;
                      const needsMySignature = Boolean(myOp && myEff && !myEff.signed);
                      const municipiosLabel = [
                        `${rel.municipioOperacao}/${rel.estadoOperacao}`,
                        ...(!rel.apenasUmMunicipio ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`) : [])
                      ].join(' • ');
                      const otherOps = ops.filter(o => o.userId !== rel.criadorId);
                      const allOpsTooltip = [
                        `${rel.criadorNome} (Digitador)`,
                        ...otherOps.map(o => {
                          const st = isPolOpOperatorEffectivelySigned(o, rel.createdAt);
                          return `${o.name}${st.signed ? (st.autoSigned ? ' ✓ (30d)' : ' ✓') : ' (Pendente)'}`;
                        })
                      ].join('\n');
                      const prefixos = (rel.aeronaves || []).map(a => `${a.tipo} ${a.prefixo}`).join(', ');

                      return (
                        <div
                          key={itemKey}
                          className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3.5 space-y-3 text-xs"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black inline-flex items-center space-x-1">
                                  <Plane className="w-3 h-3" />
                                  <span>CAT</span>
                                </span>
                                <span className="font-mono font-bold text-slate-100">
                                  {formatDateBr(rel.dataOperacao)}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono">
                                  {rel.horarioDecolagem} → {rel.horarioVooOperacao}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                                  {municipiosLabel}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold">
                                  {rel.comEmpregoAeronave
                                    ? `${rel.tipoVoo || 'COM AERONAVE'}${prefixos ? ` • ${prefixos}` : ''}`
                                    : 'Sem emprego de aeronave'}
                                </span>
                                {rel.comEmpregoAeronave && (
                                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-200 text-[10px] font-mono">
                                    Voo: {rel.horasTotaisVoo || sumFlightHoursHHMM(rel.aeronaves || [])}h
                                  </span>
                                )}
                                {needsMySignature && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                                    Assinatura Pendente
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-300">
                                {otherOps.length > 0 ? (
                                  <span>
                                    <span className="text-slate-400">Digitador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>{' '}
                                    <span className="text-slate-400">e </span>
                                    <span
                                      title={allOpsTooltip}
                                      className="font-bold text-cyan-300 underline decoration-dotted cursor-help"
                                    >
                                      OUTROS ({otherOps.length})
                                    </span>
                                  </span>
                                ) : (
                                  <span>
                                    <span className="text-slate-400">Operador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {needsMySignature && (
                                <button
                                  type="button"
                                  disabled={signingCatOpId === rel.id}
                                  onClick={() => handleSignCatOpReport(rel)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{signingCatOpId === rel.id ? 'Assinando...' : 'Assinar'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleExpandUnitItem(itemKey)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <span>{isExpanded ? 'Fechar' : 'Abrir'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => setViewModalCatOpReport(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  printRelatorioOperacaoCat(
                                    rel,
                                    units,
                                    departments,
                                    activeUnitName,
                                    activeDeptName
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                              {rel.comEmpregoAeronave && (rel.aeronaves || []).length > 0 && (
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                                  <span className="block text-[10px] font-bold uppercase text-amber-300">
                                    Aeronave(s) — Total: {rel.horasTotaisVoo || sumFlightHoursHHMM(rel.aeronaves || [])}h
                                  </span>
                                  {rel.aeronaves.map(a => (
                                    <div key={a.aeronaveId} className="text-[11px] text-slate-200">
                                      <strong>{a.tipo} {a.prefixo}</strong> • Piloto: {a.pilotoNome || '-'}
                                      {a.copilotoNome ? ` • Copiloto: ${a.copilotoNome}` : ''} • Horas: <span className="font-mono">{a.horasVoo || '00:00'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                  {rel.comEmpregoAeronave ? 'Sinopse do Voo' : 'Sinopse da Operação'}
                                </span>
                                <p className="text-slate-200 whitespace-pre-wrap bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                  {rel.sinopseVoo}
                                </p>
                              </div>
                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                                  Operadores / Assinaturas ({ops.length})
                                </span>
                                <div className="space-y-1.5">
                                  {ops.map(op => {
                                    const st = isPolOpOperatorEffectivelySigned(op, rel.createdAt);
                                    return (
                                      <div
                                        key={op.userId}
                                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5"
                                      >
                                        <span className="text-slate-200">
                                          <span className="font-semibold">{op.name}</span>
                                          {op.cargo && <span className="text-[10px] text-slate-400"> • {op.cargo}</span>}
                                          {op.userId === rel.criadorId && (
                                            <span className="text-[10px] text-cyan-300 font-bold"> (Digitador)</span>
                                          )}
                                        </span>
                                        <span className={`font-bold text-[11px] ${st.signed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                          {st.signed ? (st.autoSigned ? '✓ Assinado (30 dias)' : '✓ Assinado') : 'Pendente'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredUnitOpReports.map(rel => {
                      const itemKey = `uo-${rel.id}`;
                      const isExpanded = Boolean(expandedUnitIds[itemKey]);
                      const ops = rel.operadores || [];
                      const myOp = ops.find(o => o.userId === currentUser.id);
                      const myEff = myOp ? isPolOpOperatorEffectivelySigned(myOp, rel.createdAt) : null;
                      const needsMySignature = Boolean(myOp && myEff && !myEff.signed);

                      const municipiosLabel = [
                        `${rel.municipioOperacao}/${rel.estadoOperacao}`,
                        ...(!rel.apenasUmMunicipio ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`) : [])
                      ].join(' • ');

                      const otherOps = ops.filter(o => o.userId !== rel.criadorId);
                      const allOpsTooltip = [
                        `${rel.criadorNome} (Digitador)`,
                        ...otherOps.map(o => {
                          const st = isPolOpOperatorEffectivelySigned(o, rel.createdAt);
                          return `${o.name}${st.signed ? (st.autoSigned ? ' ✓ (30d)' : ' ✓') : ' (Pendente)'}`;
                        })
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
                                  {formatDateBr(rel.dataOperacao)}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono">
                                  {rel.horaSaidaBase} → {rel.horaOperacao}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                                  {municipiosLabel}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold">
                                  {rel.tipoAtendimento}
                                </span>
                                {rel.houveObito && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold inline-flex items-center space-x-1">
                                    <Skull className="w-3 h-3" />
                                    <span>
                                      Óbito{(rel.quantidadeObitos || 1) > 1 ? ` (${rel.quantidadeObitos})` : ''}
                                    </span>
                                  </span>
                                )}
                                {needsMySignature && (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                                    Assinatura Pendente
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-300">
                                {otherOps.length > 0 ? (
                                  <span>
                                    <span className="text-slate-400">Digitador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>{' '}
                                    <span className="text-slate-400">e </span>
                                    <span
                                      title={allOpsTooltip}
                                      className="font-bold text-cyan-300 underline decoration-dotted cursor-help"
                                    >
                                      OUTROS ({otherOps.length})
                                    </span>
                                  </span>
                                ) : (
                                  <span>
                                    <span className="text-slate-400">Operador: </span>
                                    <span className="font-semibold text-slate-100">{rel.criadorNome}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {needsMySignature && (
                                <button
                                  type="button"
                                  disabled={signingOpId === rel.id}
                                  onClick={() => handleSignOpReport(rel)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{signingOpId === rel.id ? 'Assinando...' : 'Assinar'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleExpandUnitItem(itemKey)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <span>{isExpanded ? 'Fechar' : 'Abrir'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => setViewModalOpReport(rel)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  printRelatorioOperacaoPolicial(
                                    rel,
                                    units,
                                    departments,
                                    activeUnitName,
                                    activeDeptName
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                                    Acionamento via
                                  </span>
                                  <span className="text-slate-100 font-semibold">
                                    {rel.acionamentoVia}
                                    {rel.acionamentoVia === 'OUTROS' && rel.acionamentoOutrosDescricao
                                      ? ` — ${rel.acionamentoOutrosDescricao}`
                                      : ''}
                                  </span>
                                </div>
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                                    Viaturas ({(rel.viaturas || []).length})
                                  </span>
                                  <span className="text-slate-100 font-mono text-[11px]">
                                    {(rel.viaturas || []).length > 0
                                      ? rel.viaturas.map(v => `${v.placa} (${v.descricao})`).join(' • ')
                                      : 'Nenhuma informada'}
                                  </span>
                                </div>
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                                  <span className="block text-[10px] font-bold uppercase text-slate-400">
                                    Apoio / Emergência
                                  </span>
                                  <span className="text-slate-200 text-[11px]">
                                    {rel.tipoAtendimento === 'Emergencial'
                                      ? rel.descricaoEmergencia || '-'
                                      : (rel.departamentosApoio || []).join(', ') || '-'}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                  Sinopse da Operação
                                </span>
                                <p className="text-slate-200 whitespace-pre-wrap bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                                  {rel.sinopse}
                                </p>
                              </div>

                              {(() => {
                                const detObj = rel.detalhesAdicionais || {};
                                const items: Array<{ label: string; text: string }> = [];
                                if (detObj.mandadoPrisao?.ativo) {
                                  items.push({ label: 'MANDADO DE PRISÃO', text: formatMandadoPrisaoResumo(detObj.mandadoPrisao) });
                                }
                                if (detObj.mandadoBusca?.ativo) {
                                  items.push({ label: 'MANDADO DE BUSCA', text: formatMandadoBuscaResumo(detObj.mandadoBusca) });
                                }
                                if (detObj.gerenciamentoCrise?.ativo) {
                                  items.push({ label: 'GERENCIAMENTO DE CRISE', text: formatGerenciamentoCriseResumo(detObj.gerenciamentoCrise) });
                                }
                                if (items.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-1.5">
                                    {items.map(it => (
                                      <span
                                        key={it.label}
                                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-[11px]"
                                      >
                                        <strong className="text-amber-300">{it.label}:</strong> {it.text}
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}

                              {rel.utilizouArmaFogoOuEletrica && (
                                <div className="bg-slate-900/70 border border-amber-500/30 rounded-lg p-2.5 space-y-1.5">
                                  <span className="block text-[10px] font-bold uppercase text-amber-300">
                                    Armamento / Incapacitação Elétrica Utilizado
                                  </span>
                                  {(rel.armasFogo || []).map((af, idx) => (
                                    <div key={af.id || idx} className="text-[11px] text-slate-200 flex items-center space-x-1.5">
                                      <Crosshair className="w-3 h-3 text-amber-400 shrink-0" />
                                      <span>
                                        {af.origem === 'ACERVO'
                                          ? `Acervo • Nº Série ${af.numeroSerie} (${af.marca} ${af.modelo}) — ${af.quantidadeTiros || 0} tiro(s)`
                                          : `Fora do Acervo • ${af.marca} ${af.modelo} • Nº Série ${af.numeroSerie} • Cal. ${af.calibre} — ${af.quantidadeTiros || 0} tiro(s)`}
                                      </span>
                                    </div>
                                  ))}
                                  {(rel.armasEletricas || []).map((ae, idx) => (
                                    <div key={ae.key || idx} className="text-[11px] text-slate-200 flex items-center space-x-1.5">
                                      <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                                      <span>
                                        {ae.tipo} • {ae.nome} (Nº Série: {ae.numeroSerie || 'S/N'})
                                        {ae.acautelado && ae.usuarioCautelaNome
                                          ? ` — Acautelado por ${ae.usuarioCautelaNome}`
                                          : ' — Disponível'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {rel.houveObito && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 space-y-2">
                                  <span className="block text-[10px] font-bold uppercase text-red-300">
                                    Óbito no Atendimento — Quantidade: {Math.max(1, Number(rel.quantidadeObitos) || 1)}
                                  </span>
                                  {rel.mesmaSinopseObito === false && (rel.sinopsesObitos || []).length > 0 ? (
                                    <div className="space-y-1.5">
                                      {(rel.sinopsesObitos || []).map((txt, idx) => (
                                        <div key={idx} className="bg-slate-950/60 border border-red-500/20 rounded-md p-2">
                                          <span className="block text-[9px] font-bold uppercase text-red-300 mb-0.5">
                                            Óbito {idx + 1}
                                          </span>
                                          <p className="text-slate-200 whitespace-pre-wrap text-[11px]">{txt}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    rel.sinopseObito && (
                                      <p className="text-slate-200 whitespace-pre-wrap text-[11px]">{rel.sinopseObito}</p>
                                    )
                                  )}
                                </div>
                              )}

                              <div>
                                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                                  Operadores / Assinaturas ({ops.length})
                                </span>
                                <div className="space-y-1.5">
                                  {ops.map(op => {
                                    const st = isPolOpOperatorEffectivelySigned(op, rel.createdAt);
                                    return (
                                      <div
                                        key={op.userId}
                                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5"
                                      >
                                        <span className="text-slate-200">
                                          <span className="font-semibold">{op.name}</span>
                                          {op.cargo && (
                                            <span className="text-[10px] text-slate-400"> • {op.cargo}</span>
                                          )}
                                          {op.userId === rel.criadorId && (
                                            <span className="text-[10px] text-cyan-300 font-bold"> (Digitador)</span>
                                          )}
                                        </span>
                                        <span className={`font-bold text-[11px] ${st.signed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                          {st.signed ? (st.autoSigned ? '✓ Assinado (30 dias)' : '✓ Assinado') : 'Pendente'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
      {/* Modal de Visualização — Relatório de Operação (Ver) */}
      {viewModalOpReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100">
                  Sinopse de Operação — {viewModalOpReport.tipoAtendimento}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {formatDateBr(viewModalOpReport.dataOperacao)} • Saída {viewModalOpReport.horaSaidaBase} • Operação{' '}
                  {viewModalOpReport.horaOperacao} • {viewModalOpReport.unitName || activeUnitName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewModalOpReport(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {(() => {
                const ops = viewModalOpReport.operadores || [];
                const myOp = ops.find(o => o.userId === currentUser.id);
                const myEff = myOp ? isPolOpOperatorEffectivelySigned(myOp, viewModalOpReport.createdAt) : null;
                const needsSign = Boolean(myOp && myEff && !myEff.signed);
                const allMunicipios = [
                  `${viewModalOpReport.municipioOperacao}/${viewModalOpReport.estadoOperacao}`,
                  ...(!viewModalOpReport.apenasUmMunicipio
                    ? (viewModalOpReport.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`)
                    : [])
                ];

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Município(s) da Operação
                        </span>
                        <span className="font-bold text-amber-300 block mt-0.5">
                          {allMunicipios.join(' • ')}
                        </span>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Acionamento via
                        </span>
                        <span className="font-bold text-slate-100 block mt-0.5">
                          {viewModalOpReport.acionamentoVia}
                          {viewModalOpReport.acionamentoVia === 'OUTROS' &&
                          viewModalOpReport.acionamentoOutrosDescricao
                            ? ` — ${viewModalOpReport.acionamentoOutrosDescricao}`
                            : ''}
                        </span>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Tipo de Atendimento
                        </span>
                        <span className="font-bold text-cyan-300 block mt-0.5">
                          {viewModalOpReport.tipoAtendimento}
                        </span>
                        {viewModalOpReport.tipoAtendimento !== 'Emergencial' &&
                          (viewModalOpReport.departamentosApoio || []).length > 0 && (
                            <span className="block text-[11px] text-slate-300 mt-1">
                              Apoio: {viewModalOpReport.departamentosApoio.join(', ')}
                            </span>
                          )}
                        {viewModalOpReport.tipoAtendimento === 'Operação extraordinária' &&
                          viewModalOpReport.descricaoApoio && (
                            <span className="block text-[11px] text-slate-400 mt-0.5">
                              {viewModalOpReport.descricaoApoio}
                            </span>
                          )}
                        {viewModalOpReport.tipoAtendimento === 'Emergencial' &&
                          viewModalOpReport.descricaoEmergencia && (
                            <span className="block text-[11px] text-slate-300 mt-1">
                              {viewModalOpReport.descricaoEmergencia}
                            </span>
                          )}
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Viaturas ({(viewModalOpReport.viaturas || []).length})
                        </span>
                        <div className="mt-1 space-y-1">
                          {(viewModalOpReport.viaturas || []).length === 0 ? (
                            <span className="text-slate-500">Nenhuma informada</span>
                          ) : (
                            viewModalOpReport.viaturas.map(v => (
                              <div key={v.id} className="text-[11px] text-slate-200 flex items-center space-x-1.5">
                                <Car className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="font-mono font-bold">{v.placa}</span>
                                <span className="text-slate-400">— {v.descricao}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                        Sinopse da Operação
                      </span>
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {viewModalOpReport.sinopse}
                      </p>
                    </div>

                    {(() => {
                      const detObj = viewModalOpReport.detalhesAdicionais || {};
                      const items: Array<{ label: string; text: string }> = [];
                      if (detObj.mandadoPrisao?.ativo) {
                        items.push({ label: 'MANDADO DE PRISÃO', text: formatMandadoPrisaoResumo(detObj.mandadoPrisao) });
                      }
                      if (detObj.mandadoBusca?.ativo) {
                        items.push({ label: 'MANDADO DE BUSCA', text: formatMandadoBuscaResumo(detObj.mandadoBusca) });
                      }
                      if (detObj.gerenciamentoCrise?.ativo) {
                        items.push({ label: 'GERENCIAMENTO DE CRISE', text: formatGerenciamentoCriseResumo(detObj.gerenciamentoCrise) });
                      }
                      if (items.length === 0) return null;
                      return (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Detalhes Adicionais
                          </span>
                          {items.map(it => (
                            <div key={it.label} className="text-slate-200">
                              <strong className="text-amber-300">{it.label}:</strong> {it.text}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {viewModalOpReport.utilizouArmaFogoOuEletrica && (
                      <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                        <span className="block text-[10px] font-bold uppercase text-amber-300">
                          Arma de Fogo / Incapacitação Elétrica Utilizada
                        </span>
                        {(viewModalOpReport.armasFogo || []).map((af, i) => (
                          <div key={af.id || i} className="text-slate-200 bg-slate-900 border border-slate-800 rounded-lg p-2">
                            {af.origem === 'ACERVO'
                              ? `Arma do Acervo • Nº Série: ${af.numeroSerie} • ${af.marca} ${af.modelo} (${af.calibre}) • Tiros disparados: ${af.quantidadeTiros || 0}`
                              : `Arma Fora do Acervo • ${af.marca} ${af.modelo} • Nº Série: ${af.numeroSerie} • Calibre: ${af.calibre} • Tiros: ${af.quantidadeTiros || 0}`}
                          </div>
                        ))}
                        {(viewModalOpReport.armasEletricas || []).map((ae, i) => (
                          <div key={ae.key || i} className="text-slate-200 bg-slate-900 border border-slate-800 rounded-lg p-2">
                            {ae.tipo} • {ae.nome} • Nº Série: {ae.numeroSerie || 'S/N'}
                            {ae.acautelado && ae.usuarioCautelaNome
                              ? ` • Acautelado por: ${ae.usuarioCautelaNome}`
                              : ' • Disponível na Unidade'}
                          </div>
                        ))}
                      </div>
                    )}

                    {viewModalOpReport.houveObito && (
                      <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3.5 space-y-2">
                        <span className="block text-[10px] font-bold uppercase text-red-300">
                          Óbito no Atendimento ou em Decorrência Dele — SIM (Quantidade: {Math.max(1, Number(viewModalOpReport.quantidadeObitos) || 1)})
                        </span>
                        {viewModalOpReport.mesmaSinopseObito === false && (viewModalOpReport.sinopsesObitos || []).length > 0 ? (
                          <div className="space-y-2">
                            {(viewModalOpReport.sinopsesObitos || []).map((txt, idx) => (
                              <div key={idx} className="bg-slate-950/70 border border-red-500/30 rounded-lg p-2.5">
                                <span className="block text-[10px] font-bold uppercase text-red-300 mb-1">
                                  Sinopse — Óbito {idx + 1}
                                </span>
                                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{txt}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {viewModalOpReport.sinopseObito}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                      <span className="block text-[10px] font-bold uppercase text-cyan-300">
                        Assinaturas Eletrônicas ({ops.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ops.map(op => {
                          const st = isPolOpOperatorEffectivelySigned(op, viewModalOpReport.createdAt);
                          return (
                            <div
                              key={op.userId}
                              className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2"
                            >
                              <div>
                                <p className="font-bold text-slate-100">{op.name}</p>
                                <p className="text-[11px] text-slate-300">{op.cargo || 'Policial Civil'}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  MASP: {op.masp ? formatMasp(op.masp) : 'N/A'}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    st.signed
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                  }`}
                                >
                                  {st.signed ? (st.autoSigned ? '✓ Assinado (30d)' : '✓ Assinado') : 'Pendente'}
                                </span>
                                {op.userId === viewModalOpReport.criadorId && (
                                  <span className="block text-[10px] font-bold text-cyan-300 mt-0.5">
                                    Digitador
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      {needsSign && (
                        <button
                          type="button"
                          disabled={signingOpId === viewModalOpReport.id}
                          onClick={() => handleSignOpReport(viewModalOpReport)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Assinar Relatório</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          printRelatorioOperacaoPolicial(
                            viewModalOpReport,
                            units,
                            departments,
                            activeUnitName,
                            activeDeptName
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewModalOpReport(null)}
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
      {/* Modal de Visualização — Relatório de Operação CAT (Ver) */}
      {viewModalCatOpReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100 flex items-center space-x-2">
                  <Plane className="w-4 h-4 text-amber-400" />
                  <span>
                    Relatório de Operação CAT —{' '}
                    {viewModalCatOpReport.comEmpregoAeronave ? 'Com Emprego de Aeronave' : 'Sem Emprego de Aeronave'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Saída Base: {formatDateBr(viewModalCatOpReport.dataSaidaBase)}
                  {viewModalCatOpReport.comEmpregoAeronave && viewModalCatOpReport.horarioSaidaBase
                    ? ` às ${viewModalCatOpReport.horarioSaidaBase}`
                    : ''}{' '}
                  • Operação: {formatDateBr(viewModalCatOpReport.dataOperacao)} •{' '}
                  {viewModalCatOpReport.horarioDecolagem} → {viewModalCatOpReport.horarioVooOperacao} •{' '}
                  {viewModalCatOpReport.unitName || activeUnitName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewModalCatOpReport(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {(() => {
                const ops = viewModalCatOpReport.operadores || [];
                const myOp = ops.find(o => o.userId === currentUser.id);
                const myEff = myOp ? isPolOpOperatorEffectivelySigned(myOp, viewModalCatOpReport.createdAt) : null;
                const needsSign = Boolean(myOp && myEff && !myEff.signed);
                const allMunicipios = [
                  `${viewModalCatOpReport.municipioOperacao}/${viewModalCatOpReport.estadoOperacao}`,
                  ...(!viewModalCatOpReport.apenasUmMunicipio
                    ? (viewModalCatOpReport.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`)
                    : [])
                ];

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">
                          Município(s) da Operação
                        </span>
                        <span className="font-bold text-amber-300 block mt-0.5">
                          {allMunicipios.join(' • ')}
                        </span>
                      </div>
                      {viewModalCatOpReport.comEmpregoAeronave && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Tipo de Voo
                          </span>
                          <span className="font-bold text-cyan-300 block mt-0.5">
                            {viewModalCatOpReport.tipoVoo || 'APOIO OPERACIONAL'}
                            {viewModalCatOpReport.tipoVoo === 'OUTROS TIPOS' &&
                            viewModalCatOpReport.tipoVooOutrosDescricao
                              ? ` — ${viewModalCatOpReport.tipoVooOutrosDescricao}`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {viewModalCatOpReport.comEmpregoAeronave &&
                      (viewModalCatOpReport.aeronaves || []).length > 0 && (
                        <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-amber-300">
                              Aeronave(s) Empregada(s) e Tripulação de Comando
                            </span>
                            <span className="text-[11px] font-mono font-bold text-amber-200">
                              Total: {viewModalCatOpReport.horasTotaisVoo || sumFlightHoursHHMM(viewModalCatOpReport.aeronaves || [])}h
                            </span>
                          </div>
                          {viewModalCatOpReport.aeronaves.map(a => (
                            <div
                              key={a.aeronaveId}
                              className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 space-y-0.5"
                            >
                              <div className="font-bold text-amber-200">
                                {a.tipo} • {a.prefixo} {a.descricao ? `— ${a.descricao}` : ''}
                              </div>
                              <div className="text-[11px] text-slate-300">
                                Piloto: <strong>{a.pilotoNome || 'Não informado'}</strong>
                                {a.copilotoNome ? ` • Copiloto: ${a.copilotoNome}` : ''} • Horas de Voo:{' '}
                                <strong className="font-mono">{a.horasVoo || '00:00'}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    {(viewModalCatOpReport.viaturas || []).length > 0 && (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <span className="block text-[10px] font-bold uppercase text-cyan-300">
                          Viatura(s) Empregada(s) ({viewModalCatOpReport.viaturas.length})
                        </span>
                        {viewModalCatOpReport.viaturas.map(v => (
                          <div
                            key={v.id}
                            className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 space-y-0.5"
                          >
                            <div className="font-mono font-bold">
                              {v.placa} {v.descricao ? `— ${v.descricao}` : ''}
                            </div>
                            <div className="text-[11px] text-slate-300">
                              Integrante(s): {(v.operadores || []).map(o => o.name).join(', ') || 'Não informado'}
                            </div>
                            <div className="text-[11px] text-slate-400">Apoio: {v.tipoApoio || '-'}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {viewModalCatOpReport.comEmpregoAeronave &&
                      ((viewModalCatOpReport.tripulantesOperacionais || []).length > 0 ||
                        (viewModalCatOpReport.tripulantesOutraUnidade || []).length > 0) && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Tripulantes Operacionais
                          </span>
                          {(viewModalCatOpReport.tripulantesOperacionais || []).map(t => (
                            <div key={`cat-t-${t.userId}`} className="text-[11px] text-slate-200">
                              <strong>[CAT]</strong> {t.name}{' '}
                              {t.masp ? `(MASP ${formatMasp(t.masp)})` : ''}
                            </div>
                          ))}
                          {(viewModalCatOpReport.tripulantesOutraUnidade || []).map(t => (
                            <div key={`coe-t-${t.userId}`} className="text-[11px] text-slate-200">
                              <strong>[COE{t.unitName ? ` — ${t.unitName}` : ''}]</strong> {t.name}{' '}
                              {t.masp ? `(MASP ${formatMasp(t.masp)})` : ''}
                            </div>
                          ))}
                        </div>
                      )}

                    {viewModalCatOpReport.teveEquipeSolo &&
                      (viewModalCatOpReport.equipeSolo || []).length > 0 && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            {viewModalCatOpReport.comEmpregoAeronave
                              ? `Apoio de Aeronave Não Tripulada (${viewModalCatOpReport.equipeSolo.length})`
                              : `Equipe CAT Solo (${viewModalCatOpReport.equipeSolo.length})`}
                          </span>
                          {viewModalCatOpReport.equipeSolo.map(s => (
                            <div key={s.userId} className="text-[11px] text-slate-200">
                              <strong>{s.name}</strong>
                              {!viewModalCatOpReport.comEmpregoAeronave && (
                                <>
                                  {' — '}
                                  {s.operacaoSolo}
                                  {s.operacaoSolo === 'Apoio logístico' && s.apoioLogisticoDescricao
                                    ? `: ${s.apoioLogisticoDescricao}`
                                    : ''}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    {viewModalCatOpReport.comEmpregoAeronave &&
                      viewModalCatOpReport.teveEmbarcadoExterno &&
                      (viewModalCatOpReport.embarcadosExternos || []).length > 0 && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                          <span className="block text-[10px] font-bold uppercase text-slate-400">
                            Embarcado(s) Externo(s) ({viewModalCatOpReport.embarcadosExternos.length})
                          </span>
                          {viewModalCatOpReport.embarcadosExternos.map(e => (
                            <div key={e.id} className="text-[11px] text-slate-200">
                              {e.tipoEmbarcado === 'CHEFIA_VIP' ? (
                                <strong className="text-amber-300">
                                  CHEFIA/CONSELHO/SUPERINTENDÊNCIA/VIP's
                                </strong>
                              ) : (
                                <>
                                  <strong>{e.name}</strong> (MASP: {e.masp ? formatMasp(e.masp) : 'N/A'}) —{' '}
                                  {e.foraDoSistema
                                    ? 'Policial de fora do sistema'
                                    : e.ehDaCoe
                                    ? `COE${e.unitName ? ` / ${e.unitName}` : ''}`
                                    : `${e.departmentName || 'Outro Depto'}${e.unitName ? ` / ${e.unitName}` : ''}`}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    {viewModalCatOpReport.comEmpregoAeronave && (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-slate-400">
                              Tripulantes desembarcaram?
                            </span>
                            <span className="font-bold text-slate-100">
                              {viewModalCatOpReport.tripulantesDesembarcaram ? 'SIM' : 'NÃO'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-slate-400">
                              Captura / Localização com aeronave?
                            </span>
                            <span className="font-bold text-slate-100">
                              {viewModalCatOpReport.participouCapturaLocalizacao ? 'SIM' : 'NÃO'}
                            </span>
                          </div>
                        </div>
                        {viewModalCatOpReport.participouCapturaLocalizacao &&
                          (viewModalCatOpReport.capturasLocalizacoes || []).length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-slate-800">
                              {viewModalCatOpReport.capturasLocalizacoes.map((c, idx) => (
                                <div key={`${c.tipo}-${idx}`} className="text-[11px] text-slate-200">
                                  <strong className="text-amber-300">{c.tipo}</strong> — Qtd: {c.quantidade}
                                  {c.detalhes ? ` • ${c.detalhes}` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    )}

                    {viewModalCatOpReport.teveDisparosCat &&
                      (viewModalCatOpReport.disparosCat || []).length > 0 && (
                        <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                          <span className="block text-[10px] font-bold uppercase text-amber-300">
                            Disparos por Operadores da CAT
                          </span>
                          {viewModalCatOpReport.disparosCat.map((d, i) => (
                            <div
                              key={d.id || i}
                              className="text-slate-200 bg-slate-900 border border-slate-800 rounded-lg p-2 text-[11px]"
                            >
                              <strong>[{d.origem === 'ACERVO' ? 'Acervo' : 'Fora do Acervo'}]</strong> {d.marca}{' '}
                              {d.modelo} • Nº Série: {d.numeroSerie} • Calibre: {d.calibre} •{' '}
                              <strong>{d.quantidadeTiros} tiro(s)</strong>
                            </div>
                          ))}
                          {viewModalCatOpReport.teveObito ? (
                            <div className="bg-red-500/10 border border-red-500/35 rounded-lg p-2.5 space-y-1.5 mt-1">
                              <span className="block text-[10px] font-bold uppercase text-red-300">
                                Óbito(s) Registrado(s) — Quantidade: {viewModalCatOpReport.quantidadeObitos || 0}
                              </span>
                              {(viewModalCatOpReport.obitosDetalhamentos || []).map((det, idx) => (
                                <div key={idx} className="text-[11px] text-slate-200 whitespace-pre-wrap">
                                  <strong className="text-red-200">
                                    {viewModalCatOpReport.mesmoDetalhamentoObitos ||
                                    (viewModalCatOpReport.obitosDetalhamentos || []).length === 1
                                      ? 'Detalhamento: '
                                      : `Óbito #${idx + 1}: `}
                                  </strong>
                                  {det}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              <strong>Teve óbito?</strong> Não
                            </div>
                          )}
                        </div>
                      )}

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                      <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                        {viewModalCatOpReport.comEmpregoAeronave ? 'Sinopse do Voo' : 'Sinopse da Operação'}
                      </span>
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {viewModalCatOpReport.sinopseVoo}
                      </p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                      <span className="block text-[10px] font-bold uppercase text-cyan-300">
                        Assinaturas Eletrônicas ({ops.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ops.map(op => {
                          const st = isPolOpOperatorEffectivelySigned(op, viewModalCatOpReport.createdAt);
                          return (
                            <div
                              key={op.userId}
                              className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2"
                            >
                              <div>
                                <p className="font-bold text-slate-100">{op.name}</p>
                                <p className="text-[11px] text-slate-300">{op.cargo || 'Policial Civil'}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  MASP: {op.masp ? formatMasp(op.masp) : 'N/A'}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    st.signed
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                  }`}
                                >
                                  {st.signed ? (st.autoSigned ? '✓ Assinado (30d)' : '✓ Assinado') : 'Pendente'}
                                </span>
                                {op.userId === viewModalCatOpReport.criadorId && (
                                  <span className="block text-[10px] font-bold text-cyan-300 mt-0.5">
                                    Digitador
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      {needsSign && (
                        <button
                          type="button"
                          disabled={signingCatOpId === viewModalCatOpReport.id}
                          onClick={() => handleSignCatOpReport(viewModalCatOpReport)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Assinar Relatório</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          printRelatorioOperacaoCat(
                            viewModalCatOpReport,
                            units,
                            departments,
                            activeUnitName,
                            activeDeptName
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewModalCatOpReport(null)}
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
