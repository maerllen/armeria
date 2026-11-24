import React, { useState, useMemo, useEffect } from 'react';
import {
  User,
  Department,
  Unit,
  Cachorro,
  RelatorioTreinamentoCanil,
  ParticipanteTreinamentoCanil,
  ParticipanteTreinamentoCachorro,
  LocalTreinamentoCanil,
  ParticipacaoTreinamentoCanil,
  TopicoTreinamentoCanilTipo,
  TopicoTreinamentoCanilItem,
  TopicoTreinamentoCanilConfig,
  TOPICOS_TREINAMENTO_CANIL,
  RelatorioOperacaoCanil,
  SolicitacaoOperacaoCanil,
  MaterialEncontradoOperacaoCanil,
  OperadorOperacaoCanil,
  ViaturaOperacaoCanil,
  getSystemLogo
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { buildStandardDocumentTitle, printDocumentInPage, escapeHtmlText } from '../utils/printHelper';
import { normalizeCitySearch } from '../data/municipiosMG';
import {
  ESTADOS_BR,
  getCachedMunicipiosPorUF,
  fetchMunicipiosPorUF
} from '../data/estadosMunicipiosBR';
import { TopLayerAlert } from './TopLayerAlert';
import { RelatorioOperacoesCanilForm } from './RelatorioOperacoesCanilForm';
import { RelatorioCanilAnimaisTab } from './RelatorioCanilAnimaisTab';
import {
  Dog,
  Search,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Clock,
  UserCheck,
  Users,
  Building,
  CheckCircle2,
  Printer,
  X,
  ClipboardList,
  PenTool,
  MapPin,
  ShieldAlert,
  Package,
  Car,
  ChevronDown,
  ChevronRight,
  Tag,
  Settings,
  Save
} from 'lucide-react';

interface RelatorioTreinamentoCanilPanelProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  onRefresh?: () => void;
  dataVersion?: number;
  defaultUnitId?: string;
}

type CanilTrainingTab =
  | 'relatorio-treinamento'
  | 'relatorio-operacoes'
  | 'meus-relatorios'
  | 'animais'
  | 'relatorio-unidade';

export const RelatorioTreinamentoCanilPanel: React.FC<RelatorioTreinamentoCanilPanelProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  onRefresh,
  dataVersion = 0,
  defaultUnitId
}) => {
  const [activeTab, setActiveTab] = useState<CanilTrainingTab>('relatorio-treinamento');
  const [localVersion, setLocalVersion] = useState(0);

  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const canVerRelatoriosTodasEquipes =
    isGeral ||
    effectiveRole === 'Administrador' ||
    effectiveRole === 'Armeiro' ||
    Boolean(currentUser.canViewAllCanilReports);

  // Permissão para gerenciar (inserir/editar/excluir) tópicos K9: Administrador vinculado à COE ou Geral
  const canManageTopicosTreinamento = useMemo(() => {
    if (isGeral) return true;
    const assignedRoles = [effectiveRole, currentUser.role, ...(currentUser.roles || [])].map(r =>
      String(r || '').toLowerCase()
    );
    const isAdmin = assignedRoles.includes('administrador');
    if (!isAdmin) return false;

    const norm = (val?: string) =>
      String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    const isCoeText = (code?: string, name?: string) => {
      const c = norm(code);
      const n = norm(name);
      return (
        c === 'coe' ||
        n === 'coe' ||
        n.includes('coordenacao de operacoes especiais') ||
        n.startsWith('coe ') ||
        n.includes('(coe)') ||
        n.includes(' coe') ||
        c.includes('coe')
      );
    };

    const userUnit = units.find(u => u.id === currentUser.unitId);
    const userDept =
      departments.find(d => d.id === currentUser.departmentId) ||
      (userUnit ? departments.find(d => d.id === userUnit.departmentId) : undefined);

    return (
      isCoeText(userUnit?.code, userUnit?.name) ||
      isCoeText(userDept?.code, userDept?.name)
    );
  }, [isGeral, effectiveRole, currentUser, units, departments]);

  // Storage collections
  const cachorros = useMemo(() => storage.getCachorros(), [dataVersion, localVersion]);
  const relatoriosTreinamento = useMemo(
    () => storage.getRelatoriosTreinamentoCanil(),
    [dataVersion, localVersion]
  );
  const topicosConfig = useMemo(
    () => storage.getTopicosTreinamentoCanil(),
    [dataVersion, localVersion]
  );
  const activeTopicosList = useMemo(() => {
    if (topicosConfig.length > 0) {
      return topicosConfig.map(t => t.nome);
    }
    return TOPICOS_TREINAMENTO_CANIL;
  }, [topicosConfig]);
  const movimentacoesVeterinarias = useMemo(
    () => storage.getMovimentacoesVeterinarias(),
    [dataVersion, localVersion]
  );
  const relatoriosOperacoes = useMemo(
    () => storage.getRelatoriosOperacoesCanil(),
    [dataVersion, localVersion]
  );
  const viaturas = useMemo(
    () => storage.getViaturas(),
    [dataVersion, localVersion]
  );

  // Modal de gerenciamento de tópicos K9 (Admin COE / Geral)
  const [showManageTopicosModal, setShowManageTopicosModal] = useState(false);
  const [newTopicoNome, setNewTopicoNome] = useState('');
  const [editingTopicoId, setEditingTopicoId] = useState<string | null>(null);
  const [editingTopicoNome, setEditingTopicoNome] = useState('');
  const [confirmDeleteTopicoId, setConfirmDeleteTopicoId] = useState<string | null>(null);
  const [topicoBusy, setTopicoBusy] = useState(false);

  const triggerRefresh = () => {
    setLocalVersion(v => v + 1);
    if (onRefresh) onRefresh();
  };

  const handleCreateTopico = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = newTopicoNome.trim();
    if (!nome) {
      notifyError('Informe o nome do novo tópico de treinamento.');
      return;
    }
    setTopicoBusy(true);
    try {
      const res = await storage.createTopicoTreinamentoCanil(nome);
      if (res.success) {
        setNewTopicoNome('');
        notifySuccess(`Tópico "${nome.toUpperCase()}" cadastrado com sucesso.`);
        triggerRefresh();
      } else {
        notifyError(res.error || 'Erro ao cadastrar tópico.');
      }
    } finally {
      setTopicoBusy(false);
    }
  };

  const handleUpdateTopico = async (item: TopicoTreinamentoCanilConfig) => {
    const nome = editingTopicoNome.trim();
    if (!nome) {
      notifyError('Informe o novo nome do tópico.');
      return;
    }
    setTopicoBusy(true);
    try {
      const res = await storage.updateTopicoTreinamentoCanil(item.id, nome);
      if (res.success) {
        const oldName = item.nome;
        const nextName = nome.replace(/\s+/g, ' ').trim().toUpperCase();
        setTreinoForm(prev => ({
          ...prev,
          topicosTreinamento: prev.topicosTreinamento.map(t =>
            t.topico === oldName ? { ...t, topico: nextName } : t
          )
        }));
        setEditingTopicoId(null);
        setEditingTopicoNome('');
        notifySuccess(`Tópico atualizado para "${nextName}".`);
        triggerRefresh();
      } else {
        notifyError(res.error || 'Erro ao atualizar tópico.');
      }
    } finally {
      setTopicoBusy(false);
    }
  };

  const handleDeleteTopico = async (item: TopicoTreinamentoCanilConfig) => {
    setTopicoBusy(true);
    try {
      const res = await storage.deleteTopicoTreinamentoCanil(item.id);
      if (res.success) {
        setTreinoForm(prev => ({
          ...prev,
          topicosTreinamento: prev.topicosTreinamento.filter(t => t.topico !== item.nome)
        }));
        setConfirmDeleteTopicoId(null);
        notifySuccess(`Tópico "${item.nome}" excluído com sucesso.`);
        triggerRefresh();
      } else {
        notifyError(res.error || 'Erro ao excluir tópico.');
      }
    } finally {
      setTopicoBusy(false);
    }
  };

  // Messages & Loading state
  const [successMsg, setSuccessMsg] = useState<{ id: number; text: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<{ id: number; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const notifySuccess = (msg: string) => {
    setSuccessMsg({ id: Date.now() + Math.random(), text: msg });
    setErrorMsg(null);
  };

  const notifyError = (msg: string) => {
    setErrorMsg({ id: Date.now() + Math.random(), text: msg });
    setSuccessMsg(null);
  };

  // Relatório de Treinamento state
  const getTodayIsoBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const computeRemainingEditCountdownBr = () => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(new Date());
      const hh = Number(parts.find(p => p.type === 'hour')?.value || '0') % 24;
      const mm = Number(parts.find(p => p.type === 'minute')?.value || '0');
      const ss = Number(parts.find(p => p.type === 'second')?.value || '0');
      const elapsedSeconds = hh * 3600 + mm * 60 + ss;
      const remaining = Math.max(0, 86400 - elapsedSeconds);
      const rH = Math.floor(remaining / 3600);
      const rM = Math.floor((remaining % 3600) / 60);
      const rS = remaining % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        totalSeconds: remaining,
        formatted: `${pad(rH)}:${pad(rM)}:${pad(rS)}`
      };
    } catch {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const remaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      const rH = Math.floor(remaining / 3600);
      const rM = Math.floor((remaining % 3600) / 60);
      const rS = remaining % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        totalSeconds: remaining,
        formatted: `${pad(rH)}:${pad(rM)}:${pad(rS)}`
      };
    }
  };
  const [treinoEditCountdown, setTreinoEditCountdown] = useState<{ totalSeconds: number; formatted: string }>(() =>
    computeRemainingEditCountdownBr()
  );
  const [confirmDeleteTodayTreinoId, setConfirmDeleteTodayTreinoId] = useState<string | null>(null);
  const [treinoForm, setTreinoForm] = useState<{
    dataTreinamento: string;
    cachorros: ParticipanteTreinamentoCachorro[];
    modalidadeLocal: LocalTreinamentoCanil;
    modalidadeParticipacao: ParticipacaoTreinamentoCanil;
    descricao: string;
    participantes: ParticipanteTreinamentoCanil[];
    topicosTreinamento: TopicoTreinamentoCanilItem[];
  }>({
    dataTreinamento: getTodayIsoBr(),
    cachorros: [],
    modalidadeLocal: 'Interno',
    modalidadeParticipacao: 'Sozinho',
    descricao: '',
    participantes: [],
    topicosTreinamento: []
  });
  const [selectedTopicoToAdd, setSelectedTopicoToAdd] = useState<TopicoTreinamentoCanilTipo | ''>('');
  const [hasUserChangedMainDog, setHasUserChangedMainDog] = useState(false);
  const [editingTreinoReport, setEditingTreinoReport] = useState<RelatorioTreinamentoCanil | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
  const [meusTipoFilter, setMeusTipoFilter] = useState<'TODOS' | 'TREINAMENTO' | 'OPERACAO'>('TODOS');
  const [meusRelFilter, setMeusRelFilter] = useState<'TODOS' | 'CRIADOS' | 'CONJUNTOS_ASSINADOS' | 'PENDENTES'>('TODOS');
  const [unidadeTipoFilter, setUnidadeTipoFilter] = useState<'TODOS' | 'TREINAMENTO' | 'OPERACAO'>('TODOS');
  const [unidadeFilterDataInicio, setUnidadeFilterDataInicio] = useState('');
  const [unidadeFilterDataFim, setUnidadeFilterDataFim] = useState('');
  const [unidadeFilterDeptId, setUnidadeFilterDeptId] = useState('');
  const [unidadeFilterEstado, setUnidadeFilterEstado] = useState('');
  const [unidadeFilterPolicialId, setUnidadeFilterPolicialId] = useState('');
  const [unidadeFilterCachorroId, setUnidadeFilterCachorroId] = useState('');
  const [unidadeFilterViatura, setUnidadeFilterViatura] = useState('');
  const [unidadeFilterLocal, setUnidadeFilterLocal] = useState<'TODOS' | 'Interno' | 'Externo'>('TODOS');
  const [unidadeFilterComarca, setUnidadeFilterComarca] = useState('');
  const [unidadeFilterMaterial, setUnidadeFilterMaterial] = useState<'TODOS' | 'SIM' | 'NAO'>('TODOS');
  const [unidadeFilterUnitId, setUnidadeFilterUnitId] = useState<string>('');
  const [unidadeMunicipiosCache, setUnidadeMunicipiosCache] = useState<Record<string, string[]>>(() => ({
    MG: getCachedMunicipiosPorUF('MG')
  }));
  const [viewingTreinoReport, setViewingTreinoReport] = useState<RelatorioTreinamentoCanil | null>(null);
  const [editingOperacaoReport, setEditingOperacaoReport] = useState<RelatorioOperacaoCanil | null>(null);
  const [viewingOperacaoReport, setViewingOperacaoReport] = useState<RelatorioOperacaoCanil | null>(null);

  // Estado de recolhimento (todos os itens e seções iniciam ocultos em Meus Relatórios e Relatórios da Unidade)
  const [meusOperacoesSectionOpen, setMeusOperacoesSectionOpen] = useState(false);
  const [meusTreinamentosSectionOpen, setMeusTreinamentosSectionOpen] = useState(false);
  const [unidadeOperacoesSectionOpen, setUnidadeOperacoesSectionOpen] = useState(false);
  const [unidadeTreinamentosSectionOpen, setUnidadeTreinamentosSectionOpen] = useState(false);
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});

  const toggleExpandedReport = (key: string) => {
    setExpandedReportIds(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toParticipanteDog = (d: Cachorro): ParticipanteTreinamentoCachorro => ({
    id: d.id,
    nome: d.nome,
    raca: d.raca || '',
    microchip: d.microchip || ''
  });

  const getRelatorioCondutorDogs = (rel: RelatorioTreinamentoCanil): ParticipanteTreinamentoCachorro[] => {
    if (rel.cachorros && rel.cachorros.length > 0) return rel.cachorros;
    if (rel.cachorroId && rel.cachorroNome) {
      return [
        {
          id: rel.cachorroId,
          nome: rel.cachorroNome,
          raca: rel.cachorroRaca || '',
          microchip: rel.cachorroMicrochip || ''
        }
      ];
    }
    return [];
  };

  const getRelatorioAllDogs = (rel: RelatorioTreinamentoCanil): ParticipanteTreinamentoCachorro[] => {
    const map = new Map<string, ParticipanteTreinamentoCachorro>();
    for (const dog of getRelatorioCondutorDogs(rel)) {
      const key = dog.id || dog.nome;
      if (key && !map.has(key)) map.set(key, dog);
    }
    if (rel.modalidadeParticipacao === 'Coletivo' || (rel.participantes && rel.participantes.length > 0)) {
      for (const p of rel.participantes || []) {
        for (const dog of p.cachorros || []) {
          const key = dog.id || dog.nome;
          if (key && !map.has(key)) map.set(key, dog);
        }
      }
    }
    return Array.from(map.values());
  };

  const getRelatorioAllSignerNames = (rel: RelatorioTreinamentoCanil): string[] => {
    const names: string[] = [];
    if (rel.condutorNome) names.push(rel.condutorNome);
    for (const p of rel.participantes || []) {
      if (p.name && !names.includes(p.name)) names.push(p.name);
    }
    return names;
  };

  const getDefaultDogsForUser = (userId?: string) => {
    if (!userId) return [];
    const active = cachorros.filter(
      d =>
        d &&
        d.status !== 'Baixado / Óbito' &&
        d.tipoVinculo === 'SISTEMA' &&
        (d.usuarioInternoId === userId || d.usuarioInterno2Id === userId)
    );
    return active.sort((a, b) => {
      const aPrimary = a.usuarioInternoId === userId ? 0 : 1;
      const bPrimary = b.usuarioInternoId === userId ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  };

  const canEditRelatorioTreinamento = (rel?: RelatorioTreinamentoCanil | null): boolean => {
    if (!rel || !currentUser?.id) return false;
    const todayIso = getTodayIsoBr();
    if (String(rel.dataTreinamento || '').slice(0, 10) !== todayIso) return false;
    if (rel.condutorId === currentUser.id) return true;
    return (rel.participantes || []).some(p => p.userId === currentUser.id && Boolean(p.signed));
  };

  useEffect(() => {
    if (activeTab === 'relatorio-unidade' && !canVerRelatoriosTodasEquipes) {
      setActiveTab('relatorio-treinamento');
    }
  }, [activeTab, canVerRelatoriosTodasEquipes]);

  useEffect(() => {
    if (
      activeTab === 'relatorio-treinamento' &&
      !editingTreinoReport &&
      !hasUserChangedMainDog &&
      treinoForm.cachorros.length === 0 &&
      currentUser?.id
    ) {
      const defaultDogs = getDefaultDogsForUser(currentUser.id);
      if (defaultDogs.length > 0) {
        setTreinoForm(prev => (prev.cachorros.length > 0 ? prev : { ...prev, cachorros: [toParticipanteDog(defaultDogs[0])] }));
      }
    }
  }, [activeTab, currentUser?.id, cachorros, hasUserChangedMainDog, treinoForm.cachorros.length, editingTreinoReport]);

  const formatDateBr = (isoDate?: string) => {
    if (!isoDate) return '-';
    const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const d = new Date(isoDate);
    return Number.isNaN(d.getTime()) ? String(isoDate) : d.toLocaleDateString('pt-BR');
  };

  const selectableUsersForTreino = useMemo(() => {
    const rawLookup = storage.getAllUsersForLookup();
    const base = rawLookup.length > 0 ? rawLookup : allUsers;
    const ownerId = editingTreinoReport?.condutorId || currentUser?.id;
    return base
      .filter(u => u && u.id !== ownerId && (isGeral || u.role !== 'Geral'))
      .sort((a, b) => {
        const aSameUnit = a.unitId === currentUser?.unitId ? 0 : 1;
        const bSameUnit = b.unitId === currentUser?.unitId ? 0 : 1;
        if (aSameUnit !== bSameUnit) return aSameUnit - bSameUnit;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [allUsers, currentUser, isGeral, editingTreinoReport?.condutorId, dataVersion, localVersion]);

  const editableTodayReports = useMemo(() => {
    if (!currentUser?.id) return [];
    return relatoriosTreinamento.filter(r => canEditRelatorioTreinamento(r));
  }, [relatoriosTreinamento, currentUser?.id]);

  useEffect(() => {
    if (editableTodayReports.length === 0) return;
    setTreinoEditCountdown(computeRemainingEditCountdownBr());
    const intervalId = window.setInterval(() => {
      setTreinoEditCountdown(computeRemainingEditCountdownBr());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [editableTodayReports.length]);

  const filteredParticipantCandidates = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    const selectedIds = new Set(treinoForm.participantes.map(p => p.userId));
    return selectableUsersForTreino
      .filter(u => !selectedIds.has(u.id))
      .filter(u => {
        if (!q) return true;
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.masp || '').toLowerCase().includes(q) ||
          (u.cargo || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [selectableUsersForTreino, participantSearch, treinoForm.participantes]);

  const handleAddParticipant = (userToAdd: User) => {
    if (treinoForm.participantes.length >= 15) {
      notifyError('Limite máximo de 15 usuários adicionais atingido para treinamento coletivo.');
      return;
    }
    if (treinoForm.participantes.some(p => p.userId === userToAdd.id)) return;
    const defaultDogs = getDefaultDogsForUser(userToAdd.id);
    const initialDogs =
      defaultDogs.length > 0
        ? [
            {
              id: defaultDogs[0].id,
              nome: defaultDogs[0].nome,
              raca: defaultDogs[0].raca || '',
              microchip: defaultDogs[0].microchip || ''
            }
          ]
        : [];
    setTreinoForm(prev => ({
      ...prev,
      participantes: [
        ...prev.participantes,
        {
          userId: userToAdd.id,
          name: userToAdd.name,
          masp: userToAdd.masp || '',
          cargo: userToAdd.cargo || '',
          signed: false,
          cachorros: initialDogs
        }
      ]
    }));
  };

  const handleRemoveParticipant = (userId: string) => {
    setTreinoForm(prev => ({
      ...prev,
      participantes: prev.participantes.filter(p => p.userId !== userId)
    }));
  };

  const handleAddDogToParticipant = (userId: string, dogId: string) => {
    if (!dogId) return;
    const dog = cachorros.find(c => c.id === dogId);
    if (!dog) return;
    setTreinoForm(prev => ({
      ...prev,
      participantes: prev.participantes.map(p => {
        if (p.userId !== userId) return p;
        const currentDogs = p.cachorros || [];
        if (currentDogs.some(c => c.id === dog.id)) return p;
        return {
          ...p,
          cachorros: [
            ...currentDogs,
            {
              id: dog.id,
              nome: dog.nome,
              raca: dog.raca || '',
              microchip: dog.microchip || ''
            }
          ]
        };
      })
    }));
  };

  const handleRemoveDogFromParticipant = (userId: string, dogId: string) => {
    setTreinoForm(prev => ({
      ...prev,
      participantes: prev.participantes.map(p => {
        if (p.userId !== userId) return p;
        return {
          ...p,
          cachorros: (p.cachorros || []).filter(c => c.id !== dogId)
        };
      })
    }));
  };

  const handleAddMainDog = (dogId: string) => {
    if (!dogId) return;
    const dog = cachorros.find(c => c.id === dogId);
    if (!dog) return;
    setHasUserChangedMainDog(true);
    setTreinoForm(prev => {
      if (prev.cachorros.some(c => c.id === dog.id)) return prev;
      return {
        ...prev,
        cachorros: [...prev.cachorros, toParticipanteDog(dog)]
      };
    });
  };

  const handleRemoveMainDog = (dogId: string) => {
    setHasUserChangedMainDog(true);
    setTreinoForm(prev => ({
      ...prev,
      cachorros: prev.cachorros.filter(c => c.id !== dogId)
    }));
  };

  // Todos os K9 presentes no formulário atual de treinamento (condutor + participantes coletivos)
  const allFormDogs = useMemo<ParticipanteTreinamentoCachorro[]>(() => {
    const map = new Map<string, ParticipanteTreinamentoCachorro>();
    for (const dog of treinoForm.cachorros) {
      if (dog?.id && !map.has(dog.id)) map.set(dog.id, dog);
    }
    if (treinoForm.modalidadeParticipacao === 'Coletivo') {
      for (const p of treinoForm.participantes) {
        for (const dog of p.cachorros || []) {
          if (dog?.id && !map.has(dog.id)) map.set(dog.id, dog);
        }
      }
    }
    return Array.from(map.values());
  }, [treinoForm.cachorros, treinoForm.modalidadeParticipacao, treinoForm.participantes]);

  // Mantém os K9 selecionados nos tópicos sincronizados caso um animal seja removido do relatório
  useEffect(() => {
    const validIds = new Set(allFormDogs.map(d => d.id));
    setTreinoForm(prev => {
      if (prev.topicosTreinamento.length === 0) return prev;
      let changed = false;
      const nextTopicos = prev.topicosTreinamento.map(item => {
        if (item.aplicarTodosK9) return item;
        const filtered = (item.cachorros || []).filter(c => validIds.has(c.id));
        if (filtered.length !== (item.cachorros || []).length) {
          changed = true;
          return { ...item, cachorros: filtered };
        }
        return item;
      });
      return changed ? { ...prev, topicosTreinamento: nextTopicos } : prev;
    });
  }, [allFormDogs]);

  const handleAddTopicoTreinamento = (topico: TopicoTreinamentoCanilTipo | '') => {
    if (!topico) return;
    setTreinoForm(prev => {
      if (prev.topicosTreinamento.some(t => t.topico === topico)) return prev;
      return {
        ...prev,
        topicosTreinamento: [
          ...prev.topicosTreinamento,
          {
            topico,
            aplicarTodosK9: true,
            cachorros: allFormDogs.map(d => ({ ...d }))
          }
        ]
      };
    });
    setSelectedTopicoToAdd('');
  };

  const handleRemoveTopicoTreinamento = (topico: TopicoTreinamentoCanilTipo) => {
    setTreinoForm(prev => ({
      ...prev,
      topicosTreinamento: prev.topicosTreinamento.filter(t => t.topico !== topico)
    }));
  };

  const handleSetTopicoScope = (topico: TopicoTreinamentoCanilTipo, aplicarTodosK9: boolean) => {
    setTreinoForm(prev => ({
      ...prev,
      topicosTreinamento: prev.topicosTreinamento.map(t => {
        if (t.topico !== topico) return t;
        if (aplicarTodosK9) {
          return { ...t, aplicarTodosK9: true, cachorros: allFormDogs.map(d => ({ ...d })) };
        }
        return {
          ...t,
          aplicarTodosK9: false,
          cachorros: allFormDogs.length === 1 ? [{ ...allFormDogs[0] }] : []
        };
      })
    }));
  };

  const handleToggleDogInTopico = (topico: TopicoTreinamentoCanilTipo, dog: ParticipanteTreinamentoCachorro) => {
    setTreinoForm(prev => ({
      ...prev,
      topicosTreinamento: prev.topicosTreinamento.map(t => {
        if (t.topico !== topico) return t;
        const exists = t.cachorros.some(c => c.id === dog.id);
        return {
          ...t,
          aplicarTodosK9: false,
          cachorros: exists
            ? t.cachorros.filter(c => c.id !== dog.id)
            : [...t.cachorros, { ...dog }]
        };
      })
    }));
  };

  const handleStartEditTreinamento = (rel: RelatorioTreinamentoCanil) => {
    if (!canEditRelatorioTreinamento(rel)) {
      notifyError('Este relatório só pode ser modificado no mesmo dia em que foi criado pelo condutor autor ou por participantes que já assinaram.');
      return;
    }
    setEditingTreinoReport(rel);
    setHasUserChangedMainDog(true);
    setTreinoForm({
      dataTreinamento: rel.dataTreinamento,
      cachorros: getRelatorioCondutorDogs(rel),
      modalidadeLocal: rel.modalidadeLocal,
      modalidadeParticipacao: rel.modalidadeParticipacao,
      descricao: rel.descricao || '',
      participantes: (rel.participantes || []).map(p => ({
        ...p,
        cachorros: (p.cachorros || []).map(c => ({ ...c }))
      })),
      topicosTreinamento: (rel.topicosTreinamento || []).map(t => ({
        topico: t.topico,
        aplicarTodosK9: Boolean(t.aplicarTodosK9),
        cachorros: (t.cachorros || []).map(c => ({ ...c }))
      }))
    });
    setSelectedTopicoToAdd('');
    setParticipantSearch('');
    setViewingTreinoReport(null);
    setActiveTab('relatorio-treinamento');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCancelEditTreinamento = () => {
    setEditingTreinoReport(null);
    const nextDefaultDogs = currentUser ? getDefaultDogsForUser(currentUser.id) : [];
    setHasUserChangedMainDog(false);
    setTreinoForm({
      dataTreinamento: getTodayIsoBr(),
      cachorros: nextDefaultDogs.length > 0 ? [toParticipanteDog(nextDefaultDogs[0])] : [],
      modalidadeLocal: 'Interno',
      modalidadeParticipacao: 'Sozinho',
      descricao: '',
      participantes: [],
      topicosTreinamento: []
    });
    setSelectedTopicoToAdd('');
    setParticipantSearch('');
  };

  const handleSaveTreinamento = async (shouldPrintAfter: boolean) => {
    if (!currentUser) return;
    if (treinoForm.cachorros.length === 0) {
      notifyError('Selecione ao menos um cachorro participante do treinamento.');
      return;
    }
    const cleanDesc = treinoForm.descricao.trim();
    if (!cleanDesc) {
      notifyError('Preencha a descrição do treinamento do dia.');
      return;
    }
    if (cleanDesc.length > 1000) {
      notifyError('A descrição do treinamento deve ter no máximo 1000 caracteres.');
      return;
    }
    if (treinoForm.modalidadeParticipacao === 'Coletivo' && treinoForm.participantes.length === 0) {
      notifyError('Em treinamento coletivo, selecione ao menos 1 usuário participante junto com o condutor (ou altere para Sozinho).');
      return;
    }
    if (treinoForm.modalidadeParticipacao === 'Coletivo' && treinoForm.participantes.length > 15) {
      notifyError('É permitido adicionar no máximo 15 usuários em treinamento coletivo.');
      return;
    }

    if (treinoForm.topicosTreinamento.length === 0) {
      notifyError('Selecione ao menos um Tópico de Treinamento K9 antes de salvar o relatório.');
      return;
    }

    const validFormDogIds = new Set(allFormDogs.map(d => d.id));
    for (const item of treinoForm.topicosTreinamento) {
      if (!item.aplicarTodosK9) {
        const validSelected = (item.cachorros || []).filter(c => validFormDogIds.has(c.id));
        if (validSelected.length === 0) {
          notifyError(`Selecione ao menos um K9 para o tópico "${item.topico}" ou marque "Todos os K9 do relatório".`);
          return;
        }
      }
    }

    const normalizedTopicos: TopicoTreinamentoCanilItem[] = treinoForm.topicosTreinamento.map(item => ({
      topico: item.topico,
      aplicarTodosK9: item.aplicarTodosK9,
      cachorros: item.aplicarTodosK9
        ? allFormDogs.map(d => ({ ...d }))
        : (item.cachorros || []).filter(c => validFormDogIds.has(c.id))
    }));

    const primaryDogEntry = treinoForm.cachorros[0];
    const primaryDogRecord = cachorros.find(c => c.id === primaryDogEntry.id);

    setIsSubmitting(true);
    let res: { success: boolean; error?: string; data?: RelatorioTreinamentoCanil };
    if (editingTreinoReport) {
      res = await storage.updateRelatorioTreinamentoCanil(editingTreinoReport.id, {
        cachorroId: primaryDogEntry.id,
        cachorroNome: primaryDogEntry.nome,
        cachorroRaca: primaryDogEntry.raca || '',
        cachorroMicrochip: primaryDogEntry.microchip || '',
        cachorros: treinoForm.cachorros,
        modalidadeLocal: treinoForm.modalidadeLocal,
        modalidadeParticipacao: treinoForm.modalidadeParticipacao,
        descricao: cleanDesc,
        participantes: treinoForm.modalidadeParticipacao === 'Coletivo' ? treinoForm.participantes : [],
        topicosTreinamento: normalizedTopicos
      });
    } else {
      const todayDate = getTodayIsoBr();
      res = await storage.saveRelatorioTreinamentoCanil({
        dataTreinamento: todayDate,
        condutorId: currentUser.id,
        condutorNome: currentUser.name,
        condutorMasp: currentUser.masp || '',
        condutorCargo: currentUser.cargo || '',
        cachorroId: primaryDogEntry.id,
        cachorroNome: primaryDogEntry.nome,
        cachorroRaca: primaryDogEntry.raca || '',
        cachorroMicrochip: primaryDogEntry.microchip || '',
        cachorros: treinoForm.cachorros,
        modalidadeLocal: treinoForm.modalidadeLocal,
        modalidadeParticipacao: treinoForm.modalidadeParticipacao,
        descricao: cleanDesc,
        participantes: treinoForm.modalidadeParticipacao === 'Coletivo' ? treinoForm.participantes : [],
        topicosTreinamento: normalizedTopicos,
        departmentId: currentUser.departmentId || primaryDogRecord?.departmentId || '',
        unitId: currentUser.unitId || defaultUnitId || primaryDogRecord?.unitId || ''
      });
    }
    setIsSubmitting(false);

    if (!res.success) {
      notifyError(res.error || 'Erro ao salvar relatório de treinamento.');
      return;
    }

    notifySuccess(
      editingTreinoReport
        ? 'Relatório de treinamento atualizado com sucesso!'
        : 'Relatório de treinamento salvo com sucesso!'
    );
    setEditingTreinoReport(null);
    const nextDefaultDogs = getDefaultDogsForUser(currentUser.id);
    setHasUserChangedMainDog(false);
    setTreinoForm({
      dataTreinamento: getTodayIsoBr(),
      cachorros: nextDefaultDogs.length > 0 ? [toParticipanteDog(nextDefaultDogs[0])] : [],
      modalidadeLocal: 'Interno',
      modalidadeParticipacao: 'Sozinho',
      descricao: '',
      participantes: [],
      topicosTreinamento: []
    });
    setSelectedTopicoToAdd('');
    setParticipantSearch('');
    triggerRefresh();

    if (shouldPrintAfter && res.data) {
      handlePrintRelatorioTreinamento(res.data);
    }
  };

  const handleAssinarRelatorioTreino = async (rel: RelatorioTreinamentoCanil) => {
    setIsSubmitting(true);
    const res = await storage.assinarRelatorioTreinamentoCanil(rel.id);
    setIsSubmitting(false);
    const dogsLabel = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ') || rel.cachorroNome;
    if (res.success) {
      notifySuccess(`Relatório de treinamento (${dogsLabel}) assinado com sucesso!`);
      triggerRefresh();
    } else {
      notifyError(res.error || 'Erro ao assinar relatório.');
    }
  };

  const handleDeleteRelatorioTreino = async (rel: RelatorioTreinamentoCanil) => {
    const dogsLabel = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ') || rel.cachorroNome;
    if (!confirm(`Deseja excluir o relatório de treinamento (${dogsLabel}) de ${formatDateBr(rel.dataTreinamento)}?`)) {
      return;
    }
    setIsSubmitting(true);
    const res = await storage.deleteRelatorioTreinamentoCanil(rel.id);
    setIsSubmitting(false);
    if (res.success) {
      if (editingTreinoReport?.id === rel.id) {
        handleCancelEditTreinamento();
      }
      notifySuccess('Relatório de treinamento excluído.');
      triggerRefresh();
    } else {
      notifyError(res.error || 'Erro ao excluir relatório.');
    }
  };

  const myPendingSignCount = useMemo(() => {
    if (!currentUser) return 0;
    return relatoriosTreinamento.filter(
      r => r.condutorId !== currentUser.id && (r.participantes || []).some(p => p.userId === currentUser.id && !p.signed)
    ).length;
  }, [relatoriosTreinamento, currentUser]);

  const meusRelatoriosList = useMemo(() => {
    if (!currentUser) return [];
    return relatoriosTreinamento.filter(r => {
      const isCreator = r.condutorId === currentUser.id;
      const myPart = (r.participantes || []).find(p => p.userId === currentUser.id);
      if (meusRelFilter === 'CRIADOS') return isCreator;
      if (meusRelFilter === 'CONJUNTOS_ASSINADOS') return !isCreator && Boolean(myPart?.signed);
      if (meusRelFilter === 'PENDENTES') return !isCreator && Boolean(myPart && !myPart.signed);
      return isCreator || Boolean(myPart);
    });
  }, [relatoriosTreinamento, currentUser, meusRelFilter]);

  const unitScopedReports = useMemo(() => {
    if (!currentUser || !canVerRelatoriosTodasEquipes) return [];
    const targetUnitId = canVerRelatoriosTodasEquipes ? unidadeFilterUnitId : currentUser.unitId;
    return relatoriosTreinamento.filter(r => {
      const reportUnitId = r.unitId || '';
      if (!targetUnitId) return true;
      if (reportUnitId) return reportUnitId === targetUnitId;
      const condutorUser =
        selectableUsersForTreino.find(u => u.id === r.condutorId) ||
        (r.condutorId === currentUser.id ? currentUser : undefined);
      if (condutorUser?.unitId) return condutorUser.unitId === targetUnitId;
      const condutorDogs = getRelatorioCondutorDogs(r);
      if (condutorDogs.some(cd => cachorros.find(d => d.id === cd.id)?.unitId === targetUnitId)) return true;
      return false;
    });
  }, [relatoriosTreinamento, currentUser, canVerRelatoriosTodasEquipes, unidadeFilterUnitId, selectableUsersForTreino, cachorros]);

  const unitOfficersForFilter = useMemo(() => {
    const map = new Map<string, { id: string; name: string; masp: string }>();
    for (const r of unitScopedReports) {
      if (r.condutorId && !map.has(r.condutorId)) {
        map.set(r.condutorId, { id: r.condutorId, name: r.condutorNome, masp: r.condutorMasp || '' });
      }
      for (const p of r.participantes || []) {
        if (p.userId && !map.has(p.userId)) {
          map.set(p.userId, { id: p.userId, name: p.name, masp: p.masp || '' });
        }
      }
    }
    const targetUnitId = canVerRelatoriosTodasEquipes ? unidadeFilterUnitId : currentUser?.unitId;
    for (const opRel of relatoriosOperacoes) {
      if (targetUnitId && opRel.unitId && opRel.unitId !== targetUnitId) continue;
      if (opRel.criadorId && !map.has(opRel.criadorId)) {
        map.set(opRel.criadorId, { id: opRel.criadorId, name: opRel.criadorNome, masp: opRel.criadorMasp || '' });
      }
      for (const op of opRel.operadores || []) {
        if (op.userId && !map.has(op.userId)) {
          map.set(op.userId, { id: op.userId, name: op.name, masp: op.masp || '' });
        }
      }
    }
    for (const u of allUsers) {
      if ((!currentUser?.unitId || canVerRelatoriosTodasEquipes || u.unitId === currentUser.unitId) && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name, masp: u.masp || '' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [unitScopedReports, relatoriosOperacoes, unidadeFilterUnitId, allUsers, currentUser, canVerRelatoriosTodasEquipes]);

  useEffect(() => {
    if (!unidadeFilterEstado) return;
    const uf = unidadeFilterEstado.toUpperCase();
    if (unidadeMunicipiosCache[uf] && unidadeMunicipiosCache[uf].length > 30) return;
    let active = true;
    const cached = getCachedMunicipiosPorUF(uf);
    if (cached.length > 0 && !unidadeMunicipiosCache[uf]) {
      setUnidadeMunicipiosCache(prev => ({ ...prev, [uf]: cached }));
    }
    fetchMunicipiosPorUF(uf)
      .then(list => {
        if (active && list.length > 0) {
          setUnidadeMunicipiosCache(prev => ({ ...prev, [uf]: list }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeFilterEstado]);

  const unidadeViaturasForFilter = useMemo(() => {
    const map = new Map<string, { value: string; placa: string; descricao: string }>();
    const register = (id: string, placa?: string, descricao?: string) => {
      const cleanPlaca = String(placa || '').trim();
      if (!cleanPlaca) return;
      const key = normalizeCitySearch(cleanPlaca);
      if (!map.has(key)) {
        map.set(key, { value: id || cleanPlaca, placa: cleanPlaca, descricao: String(descricao || '').trim() });
      }
    };
    for (const v of viaturas) {
      if (!unidadeFilterUnitId || v.unitId === unidadeFilterUnitId) {
        register(v.id, v.placa, v.descricao);
      }
    }
    for (const op of relatoriosOperacoes) {
      for (const v of op.viaturas || []) register(v.id, v.placa, v.descricao);
    }
    return Array.from(map.values()).sort((a, b) => a.placa.localeCompare(b.placa, 'pt-BR'));
  }, [viaturas, relatoriosOperacoes, unidadeFilterUnitId]);

  const unidadeCidadesForFilter = useMemo(() => {
    const map = new Map<string, string>();
    const addCity = (c?: string | null) => {
      const clean = String(c || '').trim();
      if (!clean) return;
      const key = normalizeCitySearch(clean);
      if (!map.has(key)) map.set(key, clean);
    };
    if (unidadeFilterEstado) {
      for (const m of unidadeMunicipiosCache[unidadeFilterEstado] || getCachedMunicipiosPorUF(unidadeFilterEstado)) {
        addCity(m);
      }
      for (const op of relatoriosOperacoes) {
        if ((op.estadoOperacao || 'MG').toUpperCase() === unidadeFilterEstado.toUpperCase()) {
          addCity(op.comarca);
        }
      }
    } else {
      for (const op of relatoriosOperacoes) addCity(op.comarca);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [unidadeFilterEstado, unidadeMunicipiosCache, relatoriosOperacoes]);

  const hasCocOperationOnlyFilter = Boolean(
    unidadeFilterEstado || unidadeFilterComarca.trim() || unidadeFilterViatura
  );

  const filteredUnidadeReports = useMemo(() => {
    if (hasCocOperationOnlyFilter) return [];
    return unitScopedReports.filter(r => {
      if (unidadeFilterDataInicio && r.dataTreinamento < unidadeFilterDataInicio) return false;
      if (unidadeFilterDataFim && r.dataTreinamento > unidadeFilterDataFim) return false;
      if (unidadeFilterDeptId) {
        const repDeptId = r.departmentId || units.find(u => u.id === r.unitId)?.departmentId || '';
        if (repDeptId !== unidadeFilterDeptId) return false;
      }
      if (unidadeFilterPolicialId) {
        const matchesCondutor = r.condutorId === unidadeFilterPolicialId;
        const matchesPart = (r.participantes || []).some(p => p.userId === unidadeFilterPolicialId);
        if (!matchesCondutor && !matchesPart) return false;
      }
      if (unidadeFilterCachorroId) {
        const matchesMainDog = getRelatorioCondutorDogs(r).some(c => c.id === unidadeFilterCachorroId);
        const matchesPartDog = (r.participantes || []).some(p =>
          (p.cachorros || []).some(c => c.id === unidadeFilterCachorroId)
        );
        if (!matchesMainDog && !matchesPartDog) return false;
      }
      if (unidadeFilterLocal !== 'TODOS' && r.modalidadeLocal !== unidadeFilterLocal) return false;
      return true;
    });
  }, [
    hasCocOperationOnlyFilter,
    unitScopedReports,
    unidadeFilterDataInicio,
    unidadeFilterDataFim,
    unidadeFilterDeptId,
    units,
    unidadeFilterPolicialId,
    unidadeFilterCachorroId,
    unidadeFilterLocal
  ]);

  const handlePrintRelatorioTreinamento = (rel: RelatorioTreinamentoCanil) => {
    const unitName =
      units.find(u => u.id === rel.unitId)?.name ||
      units.find(u => u.id === currentUser?.unitId)?.name ||
      'Unidade Operacional Canil K9';
    const deptName = departments.find(d => d.id === rel.departmentId)?.name || 'Polícia Civil de Minas Gerais';
    const isSozinho = rel.modalidadeParticipacao === 'Sozinho';
    const hasMultipleSigners = !isSozinho || (Array.isArray(rel.participantes) && rel.participantes.length > 0);
    const isSoloReport = !hasMultipleSigners;
    const condutorDogs = getRelatorioCondutorDogs(rel);
    const dogsTitleText = condutorDogs.map(c => c.nome).join(', ') || rel.cachorroNome;
    const docTitle = buildStandardDocumentTitle(
      'Relatório de Treinamento (Canil K9)',
      `${dogsTitleText} - ${formatDateBr(rel.dataTreinamento)}`,
      rel.condutorNome
    );

    const creatorDogsText =
      condutorDogs.length > 0
        ? condutorDogs
            .map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}${c.microchip ? ` [Chip: ${c.microchip}]` : ''}`)
            .join(', ')
        : 'Sem cachorro';

    const participantBoxesHtml = isSoloReport
      ? `
        <div class="sig-grid-single">
          <div class="sig-box">
            ${rel.condutorAssinado ? '<div class="sig-digital">Assinado eletronicamente no sistema</div>' : '<div class="sig-space"></div>'}
            <div class="sig-line">${escapeHtmlText(rel.condutorNome)}</div>
            <div class="sig-meta">${rel.condutorMasp ? `MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))}` : ''} ${rel.condutorCargo ? `• ${escapeHtmlText(rel.condutorCargo)}` : ''}</div>
            <div class="sig-role">Condutor Responsável (Treinamento Individual)</div>
          </div>
        </div>
      `
      : `
        <div class="sig-grid">
          <div class="sig-box">
            ${rel.condutorAssinado ? '<div class="sig-digital">Assinado eletronicamente</div>' : '<div class="sig-space"></div>'}
            <div class="sig-line">${escapeHtmlText(rel.condutorNome)}</div>
            <div class="sig-meta">${rel.condutorMasp ? `MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))}` : ''} ${rel.condutorCargo ? `• ${escapeHtmlText(rel.condutorCargo)}` : ''}</div>
            <div class="sig-role">Condutor Digitador • Cão(s): ${escapeHtmlText(creatorDogsText)}</div>
          </div>
          ${(rel.participantes || []).slice(0, 15).map((p) => {
            const dogsText = (p.cachorros && p.cachorros.length > 0)
              ? p.cachorros.map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}${c.microchip ? ` [Chip: ${c.microchip}]` : ''}`).join(', ')
              : 'Sem cachorro';
            return `
            <div class="sig-box">
              ${p.signed ? `<div class="sig-digital">Assinado eletronicamente${p.signedAt ? ` em ${escapeHtmlText(new Date(p.signedAt).toLocaleString('pt-BR'))}` : ''}</div>` : '<div class="sig-space"></div>'}
              <div class="sig-line">${escapeHtmlText(p.name)}</div>
              <div class="sig-meta">${p.masp ? `MASP: ${escapeHtmlText(formatMasp(p.masp))}` : ''} ${p.cargo ? `• ${escapeHtmlText(p.cargo)}` : ''}</div>
              <div class="sig-role">Condutor • Cão(s): ${escapeHtmlText(dogsText)}</div>
            </div>
          `;
          }).join('')}
        </div>
      `;

    const infoTableHtml = isSoloReport
      ? `
  <table class="grid-info">
    <tr>
      <td style="width: 25%;">
        <span class="lbl">Data do Treinamento</span>
        <span class="val" style="font-family: monospace;">${escapeHtmlText(formatDateBr(rel.dataTreinamento))}</span>
      </td>
      <td style="width: 45%;">
        <span class="lbl">Condutor</span>
        <span class="val">${escapeHtmlText(rel.condutorNome)}${rel.condutorMasp ? ` (MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))})` : ''}</span>
      </td>
      <td style="width: 30%;">
        <span class="lbl">${condutorDogs.length > 1 ? 'Cães Policiais K9' : 'Cão Policial K9'}</span>
        <span class="val">${condutorDogs.map(c => `${escapeHtmlText(c.nome)}${c.raca ? ` (${escapeHtmlText(c.raca)})` : ''}`).join('<br/>')}</span>
      </td>
    </tr>
    <tr>
      <td>
        <span class="lbl">Local do Treinamento</span>
        <span class="val">${escapeHtmlText(rel.modalidadeLocal)}</span>
      </td>
      <td>
        <span class="lbl">Modalidade de Participação</span>
        <span class="val">${escapeHtmlText(rel.modalidadeParticipacao)}</span>
      </td>
      <td>
        <span class="lbl">${condutorDogs.length > 1 ? 'Microchips' : 'Microchip'}</span>
        <span class="val" style="font-family: monospace;">${escapeHtmlText(condutorDogs.map(c => c.microchip).filter(Boolean).join(', ') || 'N/A')}</span>
      </td>
    </tr>
  </table>`
      : `
  <table class="grid-info">
    <tr>
      <td style="width: 30%;">
        <span class="lbl">Data do Treinamento</span>
        <span class="val" style="font-family: monospace;">${escapeHtmlText(formatDateBr(rel.dataTreinamento))}</span>
      </td>
      <td style="width: 35%;">
        <span class="lbl">Local do Treinamento</span>
        <span class="val">${escapeHtmlText(rel.modalidadeLocal)}</span>
      </td>
      <td style="width: 35%;">
        <span class="lbl">Modalidade de Participação</span>
        <span class="val">${escapeHtmlText(rel.modalidadeParticipacao)} (${1 + (rel.participantes?.length || 0)} participantes)</span>
      </td>
    </tr>
  </table>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; text-align: center; }
    .header .org { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; }
    .header .unit { font-size: 11px; font-weight: 600; color: #475569; margin-top: 2px; }
    .header h1 { font-size: 16px; font-weight: 900; text-transform: uppercase; margin: 6px 0 2px; }
    .header .doc-id { font-size: 10px; font-family: monospace; color: #64748b; }
    .grid-info { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .grid-info td { border: 1px solid #cbd5e1; padding: 7px 10px; vertical-align: top; }
    .lbl { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
    .val { font-size: 12px; font-weight: 700; color: #0f172a; }
    .desc-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; margin-bottom: 16px; background: #f8fafc; }
    .desc-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .desc-text { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: #0f172a; min-height: 70px; }
    .sig-section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; margin: 14px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
    .sig-grid-single { display: flex; justify-content: center; margin-top: 26px; }
    .sig-grid-single .sig-box { width: 320px; text-align: center; }
    .sig-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 24px; margin-top: 18px; }
    .sig-box { text-align: center; page-break-inside: avoid; }
    .sig-space { height: 28px; }
    .sig-digital { height: 28px; display: flex; align-items: flex-end; justify-content: center; font-size: 9px; font-style: italic; color: #047857; padding-bottom: 2px; }
    .sig-line { border-top: 1px solid #0f172a; padding-top: 4px; font-weight: 700; font-size: 11px; }
    .sig-meta { font-size: 10px; font-family: monospace; color: #334155; }
    .sig-role { font-size: 9px; color: #64748b; text-transform: uppercase; }
    .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: 9px; color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <div class="org">Polícia Civil do Estado de Minas Gerais • ${escapeHtmlText(deptName)}</div>
    <div class="unit">${escapeHtmlText(unitName)} • Seção de Canil K9</div>
    <h1>Relatório Diário de Treinamento K9</h1>
    <div class="doc-id">Registro: ${escapeHtmlText(rel.id)}</div>
  </div>
${infoTableHtml}

  ${(rel.topicosTreinamento || []).length > 0 ? `
  <div class="desc-box" style="margin-bottom: 12px;">
    <div class="desc-title">Tópicos de Treinamento Realizados (${(rel.topicosTreinamento || []).length})</div>
    <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
      ${(rel.topicosTreinamento || [])
        .map(t => {
          const dogsLabel = t.aplicarTodosK9
            ? `Todos os K9 do relatório (${(t.cachorros || []).map(c => c.nome).join(', ') || 'Todos'})`
            : (t.cachorros || []).map(c => c.nome).join(', ') || 'Nenhum';
          return `<div><strong>${escapeHtmlText(t.topico)}</strong> — K9: ${escapeHtmlText(dogsLabel)}</div>`;
        })
        .join('')}
    </div>
  </div>` : ''}

  <div class="desc-box">
    <div class="desc-title">Descrição do Treinamento do Dia</div>
    <div class="desc-text">${escapeHtmlText(rel.descricao)}</div>
  </div>

  <div class="sig-section-title">${isSoloReport ? 'Assinaturas' : 'Equipe'}</div>
  ${participantBoxesHtml}

  <div class="footer">
    Documento emitido eletronicamente pelo Sistema ARMARIA • Polícia Civil de Minas Gerais
  </div>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  const handlePrintRelatorioUnidadeConsolidado = () => {
    const unitName =
      units.find(u => u.id === (canVerRelatoriosTodasEquipes && unidadeFilterUnitId ? unidadeFilterUnitId : currentUser?.unitId))?.name ||
      'Todas as Unidades / Equipes';
    const docTitle = buildStandardDocumentTitle('Relatório Consolidado de Treinamentos K9 (Canil)', unitName, currentUser?.name || '');

    const rowsHtml = filteredUnidadeReports.length === 0
      ? `<tr><td colspan="6" style="text-align:center; padding: 14px; color: #64748b;">Nenhum relatório encontrado para os filtros selecionados.</td></tr>`
      : filteredUnidadeReports
          .map(r => {
            const condutorDogs = getRelatorioCondutorDogs(r);
            const condutorDogsHtml = condutorDogs
              .map(c => `<strong>${escapeHtmlText(c.nome)}</strong>${c.raca ? ` <span style="font-size:9px; color:#475569;">(${escapeHtmlText(c.raca)})</span>` : ''}`)
              .join('<br/>');
            const participantsSummary =
              r.modalidadeParticipacao === 'Coletivo' && (r.participantes || []).length > 0
                ? `<br/><span style="font-size:9px; color:#475569;">${(r.participantes || [])
                    .map(p => {
                      const dogsTxt =
                        p.cachorros && p.cachorros.length > 0
                          ? p.cachorros.map(c => c.nome).join(', ')
                          : 'Sem cachorro';
                      return `${escapeHtmlText(p.name)} (${escapeHtmlText(dogsTxt)})`;
                    })
                    .join('; ')}</span>`
                : '';
            const topicosHtml =
              (r.topicosTreinamento || []).length > 0
                ? `<div style="margin-bottom:4px;font-size:9.5px;color:#334155;"><strong>Tópicos:</strong> ${(r.topicosTreinamento || [])
                    .map(t => `${escapeHtmlText(t.topico)} (${escapeHtmlText(t.aplicarTodosK9 ? 'Todos os K9' : (t.cachorros || []).map(c => c.nome).join(', '))})`)
                    .join(' • ')}</div>`
                : '';
            return `
            <tr>
              <td style="font-family: monospace; white-space: nowrap;">${escapeHtmlText(formatDateBr(r.dataTreinamento))}</td>
              <td><strong>${escapeHtmlText(r.condutorNome)}</strong>${r.condutorMasp ? `<br/><span style="font-size:9px; color:#475569;">MASP: ${escapeHtmlText(formatMasp(r.condutorMasp))}</span>` : ''}</td>
              <td>${condutorDogsHtml}${participantsSummary}</td>
              <td>${escapeHtmlText(r.modalidadeLocal)}</td>
              <td>${escapeHtmlText(r.modalidadeParticipacao)}${r.modalidadeParticipacao === 'Coletivo' ? `<br/><span style="font-size:9px; color:#475569;">+${(r.participantes || []).length} policial(is)</span>` : ''}</td>
              <td style="white-space: pre-wrap; word-break: break-word;">${topicosHtml}${escapeHtmlText(r.descricao)}</td>
            </tr>`;
          })
          .join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; text-align: center; }
    .header h1 { font-size: 15px; margin: 4px 0; text-transform: uppercase; }
    .meta { font-size: 10px; color: #475569; margin-bottom: 10px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-weight:bold; font-size:10px; text-transform:uppercase;">Polícia Civil do Estado de Minas Gerais • Seção Canil K9</div>
    <h1>Relatório de Treinamentos da Unidade</h1>
    <div style="font-size:10px; color:#334155;">Unidade: ${escapeHtmlText(unitName)}</div>
  </div>
  <div class="meta">
    <span>Total de registros listados: <strong>${filteredUnidadeReports.length}</strong></span>
    <span>Emitido em: ${escapeHtmlText(new Date().toLocaleString('pt-BR'))}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 9%;">Data</th>
        <th style="width: 18%;">Condutor</th>
        <th style="width: 14%;">Cachorro K9</th>
        <th style="width: 9%;">Local</th>
        <th style="width: 12%;">Participação</th>
        <th style="width: 38%;">Descrição do Treinamento</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  // =========================================================================
  // RELATÓRIO DE OPERAÇÕES CANIL K9: PERMISSÕES, FILTROS, CRUD E IMPRESSÃO
  // =========================================================================
  const getIsoDayBr = (value?: string): string => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
    }
    return String(value).slice(0, 10);
  };

  const canEditOrDeleteOperacao = (rel?: RelatorioOperacaoCanil | null): boolean => {
    if (!rel || !currentUser?.id) return false;
    const todayIso = getTodayIsoBr();
    const createdDay = getIsoDayBr(rel.createdAt) || String(rel.dataOperacao || '').slice(0, 10);
    if (createdDay !== todayIso) return false;
    if (rel.criadorId === currentUser.id) return true;
    return (rel.operadores || []).some(op => op.userId === currentUser.id);
  };

  const allUsersLookupForOperacoes = useMemo(() => {
    const rawLookup = storage.getAllUsersForLookup();
    return rawLookup.length > 0 ? rawLookup : allUsers;
  }, [allUsers, dataVersion, localVersion]);

  const operacoesHojeEditaveis = useMemo(() => {
    return relatoriosOperacoes.filter(r => canEditOrDeleteOperacao(r));
  }, [relatoriosOperacoes, currentUser?.id]);

  const meusOperacoesList = useMemo(() => {
    if (!currentUser?.id) return [];
    return relatoriosOperacoes.filter(
      r => r.criadorId === currentUser.id || (r.operadores || []).some(op => op.userId === currentUser.id)
    );
  }, [relatoriosOperacoes, currentUser?.id]);

  const meusTreinamentosTotalCount = useMemo(() => {
    if (!currentUser?.id) return 0;
    return relatoriosTreinamento.filter(
      r => r.condutorId === currentUser.id || (r.participantes || []).some(p => p.userId === currentUser.id)
    ).length;
  }, [relatoriosTreinamento, currentUser?.id]);

  const unitScopedOperacoes = useMemo(() => {
    if (!currentUser || !canVerRelatoriosTodasEquipes) return [];
    const targetUnitId = canVerRelatoriosTodasEquipes ? unidadeFilterUnitId : currentUser.unitId;
    return relatoriosOperacoes.filter(r => {
      if (!targetUnitId) return true;
      if (r.unitId) return r.unitId === targetUnitId;
      const creatorUser = allUsersLookupForOperacoes.find(u => u.id === r.criadorId);
      if (creatorUser?.unitId) return creatorUser.unitId === targetUnitId;
      if ((r.operadores || []).some(op => allUsersLookupForOperacoes.find(u => u.id === op.userId)?.unitId === targetUnitId)) {
        return true;
      }
      return false;
    });
  }, [relatoriosOperacoes, currentUser, canVerRelatoriosTodasEquipes, unidadeFilterUnitId, allUsersLookupForOperacoes]);

  const filteredUnidadeOperacoes = useMemo(() => {
    const comarcaQ = normalizeCitySearch(unidadeFilterComarca);
    const selectedVtr = unidadeViaturasForFilter.find(v => v.value === unidadeFilterViatura) || null;
    const selectedVtrPlacaNorm = selectedVtr ? normalizeCitySearch(selectedVtr.placa) : '';
    return unitScopedOperacoes.filter(r => {
      if (unidadeFilterDataInicio && r.dataOperacao < unidadeFilterDataInicio) return false;
      if (unidadeFilterDataFim && r.dataOperacao > unidadeFilterDataFim) return false;
      if (unidadeFilterDeptId) {
        const repDeptId = r.departmentId || units.find(u => u.id === r.unitId)?.departmentId || '';
        if (repDeptId !== unidadeFilterDeptId) return false;
      }
      if (unidadeFilterEstado && (r.estadoOperacao || 'MG').toUpperCase() !== unidadeFilterEstado.toUpperCase()) return false;
      if (unidadeFilterPolicialId) {
        const matchesCreator = r.criadorId === unidadeFilterPolicialId;
        const matchesOp = (r.operadores || []).some(op => op.userId === unidadeFilterPolicialId);
        if (!matchesCreator && !matchesOp) return false;
      }
      if (unidadeFilterCachorroId) {
        const matchesOpDog = (r.operadores || []).some(op =>
          (op.cachorros || []).some(c => c.id === unidadeFilterCachorroId)
        );
        const matchesMatDog = (r.materiaisEncontrados || []).some(m =>
          (m.cachorros || []).some(c => c.id === unidadeFilterCachorroId)
        );
        if (!matchesOpDog && !matchesMatDog) return false;
      }
      if (selectedVtr) {
        const matchVtr = (r.viaturas || []).some(
          v => v.id === selectedVtr.value || normalizeCitySearch(v.placa) === selectedVtrPlacaNorm
        );
        if (!matchVtr) return false;
      }
      if (comarcaQ && !normalizeCitySearch(r.comarca).includes(comarcaQ)) return false;
      if (unidadeFilterMaterial === 'SIM' && !r.materialEncontrado) return false;
      if (unidadeFilterMaterial === 'NAO' && r.materialEncontrado) return false;
      return true;
    });
  }, [
    unitScopedOperacoes,
    unidadeFilterDataInicio,
    unidadeFilterDataFim,
    unidadeFilterDeptId,
    units,
    unidadeFilterEstado,
    unidadeFilterPolicialId,
    unidadeFilterCachorroId,
    unidadeFilterViatura,
    unidadeViaturasForFilter,
    unidadeFilterComarca,
    unidadeFilterMaterial
  ]);

  const handlePrintRelatorioOperacao = (rel: RelatorioOperacaoCanil) => {
    const unitName =
      units.find(u => u.id === rel.unitId)?.name ||
      units.find(u => u.id === currentUser?.unitId)?.name ||
      'COC • Canil K9';
    const deptName =
      departments.find(d => d.id === rel.departmentId)?.name ||
      departments.find(d => d.id === currentUser?.departmentId)?.name ||
      'Polícia Civil de Minas Gerais';

    const docTitle = buildStandardDocumentTitle(
      'Relatório de Operação Canil K9',
      `${rel.comarca} - ${formatDateBr(rel.dataOperacao)} ${rel.horaOperacao}`,
      rel.criadorNome
    );

    const solicitacaoTexto =
      rel.solicitacaoTipo === 'Outros' && rel.solicitacaoOutrosDetalhes
        ? `Outros (${rel.solicitacaoOutrosDetalhes})`
        : rel.solicitacaoTipo;

    const materiaisHtml = !rel.materialEncontrado
      ? '<span style="color:#475569;">Não houve material encontrado.</span>'
      : (rel.materiaisEncontrados || [])
          .map(m => {
            const dogsTxt =
              m.cachorros && m.cachorros.length > 0
                ? m.cachorros.map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}`).join(', ')
                : 'Não informado';
            return `<div style="margin-bottom:4px;"><strong>${escapeHtmlText(m.tipo)}</strong> — Localizado por: ${escapeHtmlText(dogsTxt)}</div>`;
          })
          .join('');

    const operadoresRowsHtml = (rel.operadores || [])
      .map((op, idx) => {
        const dogsTxt =
          op.cachorros && op.cachorros.length > 0
            ? op.cachorros.map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}`).join(', ')
            : 'Sem animal';
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${escapeHtmlText(op.name)}</strong>${op.isCreator ? ' <span style="font-size:9px; color:#334155;">(Relator)</span>' : ''}</td>
            <td style="font-family:monospace;">${escapeHtmlText(op.masp ? formatMasp(op.masp) : '-')}</td>
            <td>${escapeHtmlText(op.cargo || '-')}</td>
            <td>${escapeHtmlText(dogsTxt)}</td>
          </tr>`;
      })
      .join('');

    const signaturesHtml = (rel.operadores || [])
      .map(
        op => `
        <div class="sig-box">
          <div class="sig-space"></div>
          <div class="sig-line">${escapeHtmlText(op.name)}</div>
          <div class="sig-meta">${op.masp ? `MASP: ${escapeHtmlText(formatMasp(op.masp))}` : ''} ${op.cargo ? `• ${escapeHtmlText(op.cargo)}` : ''}</div>
          <div class="sig-role">${op.isCreator ? 'Operador Canino (Relator)' : 'Operador Canino'}</div>
        </div>`
      )
      .join('');

    const viaturasHtml =
      rel.viaturas && rel.viaturas.length > 0
        ? rel.viaturas
            .map(
              v =>
                `<span style="display:inline-block; border:1px solid #cbd5e1; background:#f8fafc; border-radius:4px; padding:3px 7px; margin:0 6px 5px 0;"><strong style="font-family:monospace;">${escapeHtmlText(v.placa)}</strong> — ${escapeHtmlText(v.descricao)}</span>`
            )
            .join('')
        : '<span style="color:#64748b;">Nenhuma viatura informada.</span>';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; line-height: 1.45; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
    .org { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #334155; }
    .unit { font-size: 12px; font-weight: 800; text-transform: uppercase; margin-top: 2px; }
    .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 6px; }
    .doc-id { font-family: monospace; font-size: 10px; color: #475569; text-align: right; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .info-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .info-card .lbl { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b; display: block; margin-bottom: 2px; }
    .info-card .val { font-size: 11.5px; font-weight: 700; color: #0f172a; }
    .section-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
    .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 8px; }
    .desc-text { white-space: pre-wrap; word-break: break-word; min-height: 60px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; text-transform: uppercase; font-size: 9px; font-weight: 800; }
    .signatures-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #334155; margin: 14px 0 6px; }
    .signatures-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; }
    .sig-box { text-align: center; page-break-inside: avoid; }
    .sig-space { height: 28px; }
    .sig-line { border-top: 1px solid #0f172a; padding-top: 4px; font-weight: 700; font-size: 10.5px; }
    .sig-meta { font-size: 9px; color: #475569; margin-top: 1px; }
    .sig-role { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #334155; margin-top: 2px; }
    .footer { margin-top: 18px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="org">Polícia Civil do Estado de Minas Gerais • ${escapeHtmlText(deptName)}</div>
      <div class="unit">${escapeHtmlText(unitName)} • Seção de Canil K9</div>
      <div class="title">Relatório de Operação Policial K9</div>
    </div>
    <div class="doc-id">Registro: ${escapeHtmlText(rel.id)}</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <span class="lbl">Data e Hora da Operação</span>
      <span class="val" style="font-family: monospace;">${escapeHtmlText(formatDateBr(rel.dataOperacao))} às ${escapeHtmlText(rel.horaOperacao)}</span>
    </div>
    <div class="info-card">
      <span class="lbl">Estado / Comarca</span>
      <span class="val">${escapeHtmlText(rel.comarca)} / ${escapeHtmlText(rel.estadoOperacao || 'MG')}</span>
    </div>
    <div class="info-card">
      <span class="lbl">Solicitação</span>
      <span class="val">${escapeHtmlText(solicitacaoTexto)}</span>
    </div>
    <div class="info-card">
      <span class="lbl">Material Encontrado?</span>
      <span class="val">${rel.materialEncontrado ? 'SIM' : 'NÃO'}</span>
    </div>
    <div class="info-card" style="grid-column: 1 / -1;">
      <span class="lbl">Apoio a Outro Departamento?</span>
      <span class="val">${
        rel.apoioOutroDepartamento && (rel.departamentosApoio || []).length > 0
          ? `SIM — ${escapeHtmlText((rel.departamentosApoio || []).join(' • '))}`
          : 'NÃO'
      }</span>
    </div>
  </div>

  <div class="section-box">
    <div class="section-title">Viaturas Utilizadas na Operação (${(rel.viaturas || []).length})</div>
    <div>${viaturasHtml}</div>
  </div>

  <div class="section-box">
    <div class="section-title">Materiais Encontrados e Animais Responsáveis</div>
    <div>${materiaisHtml}</div>
  </div>

  <div class="section-box">
    <div class="section-title">Operadores Caninos e Animais Empregados (${(rel.operadores || []).length})</div>
    <table>
      <thead>
        <tr>
          <th style="width:6%; text-align:center;">#</th>
          <th style="width:32%;">Operador</th>
          <th style="width:16%;">MASP</th>
          <th style="width:18%;">Cargo</th>
          <th style="width:28%;">Animal(is) K9</th>
        </tr>
      </thead>
      <tbody>${operadoresRowsHtml}</tbody>
    </table>
  </div>

  <div class="section-box">
    <div class="section-title">Detalhamento da Operação</div>
    <div class="desc-text">${escapeHtmlText(rel.detalhamento)}</div>
  </div>

  <div class="signatures-title">Assinaturas dos Operadores (${(rel.operadores || []).length})</div>
  <div class="signatures-grid">${signaturesHtml}</div>

  <div class="footer">
    <span>Sistema de Gestão Integrada — Polícia Civil de Minas Gerais</span>
    <span>Impresso em: ${escapeHtmlText(new Date().toLocaleString('pt-BR'))}</span>
  </div>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  const handlePrintRelatorioUnidadeOperacoesConsolidado = () => {
    const unitName =
      units.find(u => u.id === (canVerRelatoriosTodasEquipes && unidadeFilterUnitId ? unidadeFilterUnitId : currentUser?.unitId))?.name ||
      'COC • Canil K9';
    const docTitle = buildStandardDocumentTitle('Relatório de Operações da Unidade Canil K9', unitName, currentUser?.name || '');

    const rowsHtml =
      filteredUnidadeOperacoes.length === 0
        ? `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:16px;">Nenhum relatório de operação encontrado para os filtros aplicados.</td></tr>`
        : filteredUnidadeOperacoes
            .map(r => {
              const opsHtml = (r.operadores || [])
                .map(op => {
                  const dogsTxt = op.cachorros && op.cachorros.length > 0 ? op.cachorros.map(c => c.nome).join(', ') : 'Sem animal';
                  return `<div><strong>${escapeHtmlText(op.name)}</strong> (${escapeHtmlText(dogsTxt)})</div>`;
                })
                .join('');
              const vtrsHtml =
                r.viaturas && r.viaturas.length > 0
                  ? r.viaturas
                      .map(v => `<div><strong style="font-family:monospace;">${escapeHtmlText(v.placa)}</strong> — ${escapeHtmlText(v.descricao)}</div>`)
                      .join('')
                  : '-';
              const matHtml = !r.materialEncontrado
                ? 'Não'
                : (r.materiaisEncontrados || [])
                    .map(m => `${escapeHtmlText(m.tipo)} (${escapeHtmlText((m.cachorros || []).map(c => c.nome).join(', ') || '-')})`)
                    .join('<br/>');
              const solTxt =
                r.solicitacaoTipo === 'Outros' && r.solicitacaoOutrosDetalhes
                  ? `Outros: ${r.solicitacaoOutrosDetalhes}`
                  : r.solicitacaoTipo;
              const apoioDeptHtml =
                r.apoioOutroDepartamento && (r.departamentosApoio || []).length > 0
                  ? `<div style="margin-top:3px;font-size:9px;color:#334155;"><strong>Apoio:</strong> ${escapeHtmlText((r.departamentosApoio || []).join('; '))}</div>`
                  : '';
              return `
                <tr>
                  <td style="font-family:monospace; white-space:nowrap;">${escapeHtmlText(formatDateBr(r.dataOperacao))}<br/>${escapeHtmlText(r.horaOperacao)}</td>
                  <td><strong>${escapeHtmlText(r.comarca)}</strong> / ${escapeHtmlText(r.estadoOperacao || 'MG')}</td>
                  <td>${escapeHtmlText(solTxt)}${apoioDeptHtml}</td>
                  <td>${vtrsHtml}</td>
                  <td>${matHtml}</td>
                  <td>${opsHtml}</td>
                  <td style="white-space:pre-wrap; word-break:break-word;">${escapeHtmlText(r.detalhamento)}</td>
                </tr>`;
            })
            .join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 10px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 15px; font-weight: 900; text-transform: uppercase; }
    .meta { font-size: 10px; color: #475569; margin-bottom: 10px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; text-transform: uppercase; font-size: 9px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:#475569;">Polícia Civil do Estado de Minas Gerais • Canil K9</div>
      <div class="title">Relatório Consolidado de Operações da Unidade</div>
    </div>
    <div style="font-size:10px; color:#334155;">Unidade: ${escapeHtmlText(unitName)}</div>
  </div>
  <div class="meta">
    <span>Total de operações listadas: <strong>${filteredUnidadeOperacoes.length}</strong></span>
    <span>Emitido em: ${escapeHtmlText(new Date().toLocaleString('pt-BR'))}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:8%;">Data/Hora</th>
        <th style="width:11%;">Comarca</th>
        <th style="width:10%;">Solicitação</th>
        <th style="width:14%;">Viaturas</th>
        <th style="width:14%;">Material Encontrado</th>
        <th style="width:18%;">Operadores & Animais</th>
        <th style="width:25%;">Detalhamento</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  const handlePrintRelatorioUnidadeHistoricoCompleto = () => {
    const trains = unidadeTipoFilter !== 'OPERACAO' ? filteredUnidadeReports : [];
    const ops = unidadeTipoFilter !== 'TREINAMENTO' ? filteredUnidadeOperacoes : [];
    const totalCount = trains.length + ops.length;

    if (totalCount === 0) {
      notifyError('Nenhum relatório encontrado para os filtros selecionados.');
      return;
    }

    const activeUnitObj = units.find(
      u => u.id === (canVerRelatoriosTodasEquipes && unidadeFilterUnitId ? unidadeFilterUnitId : currentUser?.unitId)
    );
    const activeDeptObj = departments.find(
      d => d.id === (unidadeFilterDeptId || activeUnitObj?.departmentId || currentUser?.departmentId)
    );
    const unitName = activeUnitObj?.name || 'COC • Canil K9';
    const deptName = activeDeptObj?.name || 'Polícia Civil de Minas Gerais';
    const logoUrl = getSystemLogo(activeUnitObj, activeDeptObj);
    const docTitle = buildStandardDocumentTitle(
      'Histórico de Relatórios da Unidade — Canil K9 (COC)',
      unitName,
      currentUser?.name || ''
    );

    const activeFilterTags: string[] = [];
    if (unidadeTipoFilter !== 'TODOS') {
      activeFilterTags.push(`Tipo: ${unidadeTipoFilter === 'TREINAMENTO' ? 'Treinamentos' : 'Operações'}`);
    }
    if (unidadeFilterDataInicio || unidadeFilterDataFim) {
      activeFilterTags.push(
        `Período: ${unidadeFilterDataInicio ? formatDateBr(unidadeFilterDataInicio) : 'Início'} até ${
          unidadeFilterDataFim ? formatDateBr(unidadeFilterDataFim) : 'Atual'
        }`
      );
    }
    if (unidadeFilterDeptId) {
      activeFilterTags.push(`Departamento: ${departments.find(d => d.id === unidadeFilterDeptId)?.name || unidadeFilterDeptId}`);
    }
    if (unidadeFilterUnitId) {
      activeFilterTags.push(`Unidade: ${units.find(u => u.id === unidadeFilterUnitId)?.name || unidadeFilterUnitId}`);
    }
    if (unidadeFilterEstado) activeFilterTags.push(`Estado: ${unidadeFilterEstado}`);
    if (unidadeFilterComarca.trim()) activeFilterTags.push(`Cidade: ${unidadeFilterComarca.trim()}`);
    if (unidadeFilterPolicialId) {
      const off = unitOfficersForFilter.find(o => o.id === unidadeFilterPolicialId);
      activeFilterTags.push(
        `Policial: ${off ? `${off.name}${off.masp ? ` (${formatMasp(off.masp)})` : ''}` : unidadeFilterPolicialId}`
      );
    }
    if (unidadeFilterViatura) {
      const vObj = unidadeViaturasForFilter.find(v => v.value === unidadeFilterViatura);
      activeFilterTags.push(
        `Veículo: ${vObj ? `${vObj.placa}${vObj.descricao ? ` — ${vObj.descricao}` : ''}` : unidadeFilterViatura}`
      );
    }
    if (unidadeFilterCachorroId) {
      const dog = cachorros.find(d => d.id === unidadeFilterCachorroId);
      activeFilterTags.push(`Animal K9: ${dog ? `${dog.nome}${dog.raca ? ` (${dog.raca})` : ''}` : unidadeFilterCachorroId}`);
    }
    if (unidadeFilterLocal !== 'TODOS') activeFilterTags.push(`Local Treino: ${unidadeFilterLocal}`);
    if (unidadeFilterMaterial !== 'TODOS') activeFilterTags.push(`Material Encontrado: ${unidadeFilterMaterial}`);

    const filtersSummary =
      activeFilterTags.length > 0 ? activeFilterTags.join(' • ') : 'Todos os registros (sem restrição de filtro)';

    const trainsSectionHtml =
      trains.length > 0
        ? `
      <div class="section-title">Relatórios de Treinamento K9 (${trains.length})</div>
      <table>
        <thead>
          <tr>
            <th style="width:9%;">Data</th>
            <th style="width:18%;">Condutor</th>
            <th style="width:16%;">Animal(is) K9</th>
            <th style="width:9%;">Local</th>
            <th style="width:12%;">Participação</th>
            <th style="width:36%;">Descrição do Treinamento</th>
          </tr>
        </thead>
        <tbody>
          ${trains
            .map(r => {
              const condutorDogs = getRelatorioCondutorDogs(r);
              const condutorDogsHtml = condutorDogs
                .map(c => `<strong>${escapeHtmlText(c.nome)}</strong>${c.raca ? ` <span style="font-size:9px;color:#475569;">(${escapeHtmlText(c.raca)})</span>` : ''}`)
                .join('<br/>');
              const participantsSummary =
                r.modalidadeParticipacao === 'Coletivo' && (r.participantes || []).length > 0
                  ? `<br/><span style="font-size:9px;color:#475569;">${(r.participantes || [])
                      .map(p => {
                        const dogsTxt =
                          p.cachorros && p.cachorros.length > 0 ? p.cachorros.map(c => c.nome).join(', ') : 'Sem animal';
                        return `${escapeHtmlText(p.name)} (${escapeHtmlText(dogsTxt)})`;
                      })
                      .join('; ')}</span>`
                  : '';
              const topicosHtml =
                (r.topicosTreinamento || []).length > 0
                  ? `<div style="margin-bottom:3px;font-size:9px;color:#334155;"><strong>Tópicos:</strong> ${(r.topicosTreinamento || [])
                      .map(t => `${escapeHtmlText(t.topico)} (${escapeHtmlText(t.aplicarTodosK9 ? 'Todos os K9' : (t.cachorros || []).map(c => c.nome).join(', '))})`)
                      .join(' • ')}</div>`
                  : '';
              return `
                <tr>
                  <td style="font-family:monospace;white-space:nowrap;">${escapeHtmlText(formatDateBr(r.dataTreinamento))}</td>
                  <td><strong>${escapeHtmlText(r.condutorNome)}</strong>${r.condutorMasp ? `<br/><span style="font-size:9px;color:#475569;">MASP: ${escapeHtmlText(formatMasp(r.condutorMasp))}</span>` : ''}</td>
                  <td>${condutorDogsHtml}${participantsSummary}</td>
                  <td>${escapeHtmlText(r.modalidadeLocal)}</td>
                  <td>${escapeHtmlText(r.modalidadeParticipacao)}${r.modalidadeParticipacao === 'Coletivo' ? `<br/><span style="font-size:9px;color:#475569;">+${(r.participantes || []).length} policial(is)</span>` : ''}</td>
                  <td style="white-space:pre-wrap;word-break:break-word;">${topicosHtml}${escapeHtmlText(r.descricao)}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `
        : '';

    const opsSectionHtml =
      ops.length > 0
        ? `
      <div class="section-title">Relatórios de Operações K9 (${ops.length})</div>
      <table>
        <thead>
          <tr>
            <th style="width:8%;">Data/Hora</th>
            <th style="width:11%;">Cidade / UF</th>
            <th style="width:10%;">Solicitação</th>
            <th style="width:14%;">Veículos / Viaturas</th>
            <th style="width:14%;">Material Encontrado</th>
            <th style="width:18%;">Operadores & Animais</th>
            <th style="width:25%;">Detalhamento</th>
          </tr>
        </thead>
        <tbody>
          ${ops
            .map(r => {
              const opsHtml = (r.operadores || [])
                .map(op => {
                  const dogsTxt = op.cachorros && op.cachorros.length > 0 ? op.cachorros.map(c => c.nome).join(', ') : 'Sem animal';
                  return `<div><strong>${escapeHtmlText(op.name)}</strong> (${escapeHtmlText(dogsTxt)})</div>`;
                })
                .join('');
              const vtrsHtml =
                r.viaturas && r.viaturas.length > 0
                  ? r.viaturas
                      .map(v => `<div><strong style="font-family:monospace;">${escapeHtmlText(v.placa)}</strong> — ${escapeHtmlText(v.descricao)}</div>`)
                      .join('')
                  : '-';
              const matHtml = !r.materialEncontrado
                ? 'Não'
                : (r.materiaisEncontrados || [])
                    .map(m => `${escapeHtmlText(m.tipo)} (${escapeHtmlText((m.cachorros || []).map(c => c.nome).join(', ') || '-')})`)
                    .join('<br/>');
              const solTxt =
                r.solicitacaoTipo === 'Outros' && r.solicitacaoOutrosDetalhes
                  ? `Outros: ${r.solicitacaoOutrosDetalhes}`
                  : r.solicitacaoTipo;
              const apoioDeptHtml =
                r.apoioOutroDepartamento && (r.departamentosApoio || []).length > 0
                  ? `<div style="margin-top:3px;font-size:8.5px;color:#334155;"><strong>Apoio:</strong> ${escapeHtmlText((r.departamentosApoio || []).join('; '))}</div>`
                  : '';
              return `
                <tr>
                  <td style="font-family:monospace;white-space:nowrap;">${escapeHtmlText(formatDateBr(r.dataOperacao))}<br/>${escapeHtmlText(r.horaOperacao)}</td>
                  <td><strong>${escapeHtmlText(r.comarca)}</strong> / ${escapeHtmlText(r.estadoOperacao || 'MG')}</td>
                  <td>${escapeHtmlText(solTxt)}${apoioDeptHtml}</td>
                  <td>${vtrsHtml}</td>
                  <td>${matHtml}</td>
                  <td>${opsHtml}</td>
                  <td style="white-space:pre-wrap;word-break:break-word;">${escapeHtmlText(r.detalhamento)}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `
        : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlText(docTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 10px; line-height: 1.4; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header img { width: 46px; height: 46px; object-fit: contain; }
    .header h1 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.4px; }
    .header p { margin: 2px 0 0; font-size: 10px; color: #475569; }
    .filters-box { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 7px 10px; margin-bottom: 10px; font-size: 10px; }
    .filters-box strong { color: #0f172a; text-transform: uppercase; font-size: 9px; }
    .summary-bar { display: flex; flex-wrap: wrap; gap: 14px; font-size: 10px; color: #334155; margin-bottom: 10px; }
    .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 12px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; text-transform: uppercase; font-size: 9px; font-weight: 800; }
    tr { page-break-inside: avoid; }
    .footer { margin-top: 12px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${escapeHtmlText(logoUrl)}" alt="Brasão" />
      <div>
        <h1>Polícia Civil de Minas Gerais — Histórico de Relatórios da Unidade (COC / Canil K9)</h1>
        <p>${escapeHtmlText(deptName)} • Unidade: <strong>${escapeHtmlText(unitName)}</strong></p>
      </div>
    </div>
    <div style="text-align:right;font-size:9.5px;color:#334155;">
      <div><strong>Emitido por:</strong> ${escapeHtmlText(currentUser?.name || '')}${currentUser?.masp ? ` (MASP ${escapeHtmlText(formatMasp(currentUser.masp))})` : ''}</div>
      <div><strong>Emissão:</strong> ${escapeHtmlText(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</div>
    </div>
  </div>
  <div class="filters-box">
    <strong>Filtros Aplicados:</strong> ${escapeHtmlText(filtersSummary)}
  </div>
  <div class="summary-bar">
    <span>Total de registros: <strong>${totalCount}</strong></span>
    <span>Treinamentos: <strong>${trains.length}</strong></span>
    <span>Operações: <strong>${ops.length}</strong></span>
  </div>
  ${trainsSectionHtml}
  ${opsSectionHtml}
  <div class="footer">
    <span>Sistema ARMARIA — Polícia Civil de Minas Gerais</span>
    <span>Histórico consolidado da unidade ${escapeHtmlText(unitName)}</span>
  </div>
</body>
</html>`;

    printDocumentInPage(html, docTitle);
  };

  const handleSaveOperacao = async (
    payload: {
      dataOperacao: string;
      horaOperacao: string;
      estadoOperacao: string;
      comarca: string;
      solicitacaoTipo: SolicitacaoOperacaoCanil;
      solicitacaoOutrosDetalhes: string;
      apoioOutroDepartamento: boolean;
      departamentosApoio: string[];
      materialEncontrado: boolean;
      materiaisEncontrados: MaterialEncontradoOperacaoCanil[];
      operadores: OperadorOperacaoCanil[];
      viaturas: ViaturaOperacaoCanil[];
      detalhamento: string;
    },
    andPrint: boolean
  ): Promise<boolean> => {
    setIsSubmitting(true);
    let res: { success: boolean; error?: string; id?: string; data?: RelatorioOperacaoCanil };
    if (editingOperacaoReport) {
      res = await storage.updateRelatorioOperacaoCanil(editingOperacaoReport.id, payload);
    } else {
      res = await storage.saveRelatorioOperacaoCanil({
        ...payload,
        criadorId: currentUser.id,
        criadorNome: currentUser.name,
        criadorMasp: currentUser.masp || '',
        criadorCargo: currentUser.cargo || '',
        departmentId: currentUser.departmentId || '',
        unitId: currentUser.unitId || defaultUnitId || ''
      });
    }
    setIsSubmitting(false);

    if (!res.success) {
      notifyError(res.error || 'Erro ao salvar relatório de operação.');
      return false;
    }

    notifySuccess(
      editingOperacaoReport
        ? 'Relatório de operação atualizado com sucesso!'
        : 'Relatório de operação salvo com sucesso!'
    );
    setEditingOperacaoReport(null);
    triggerRefresh();

    if (andPrint && res.data) {
      handlePrintRelatorioOperacao(res.data);
    }
    return true;
  };

  const handleStartEditOperacao = (rel: RelatorioOperacaoCanil) => {
    if (!canEditOrDeleteOperacao(rel)) {
      notifyError('Este relatório só pode ser editado durante o dia da sua confecção por usuários citados.');
      return;
    }
    setViewingOperacaoReport(null);
    setEditingOperacaoReport(rel);
    setActiveTab('relatorio-operacoes');
  };

  const handleDeleteOperacao = async (rel: RelatorioOperacaoCanil) => {
    if (!canEditOrDeleteOperacao(rel)) {
      notifyError('Este relatório só pode ser excluído durante o dia da sua confecção por usuários citados.');
      return;
    }
    if (
      !confirm(
        `Deseja excluir o relatório de operação em ${rel.comarca} (${formatDateBr(rel.dataOperacao)} às ${rel.horaOperacao})?`
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    const res = await storage.deleteRelatorioOperacaoCanil(rel.id);
    setIsSubmitting(false);
    if (res.success) {
      if (editingOperacaoReport?.id === rel.id) setEditingOperacaoReport(null);
      if (viewingOperacaoReport?.id === rel.id) setViewingOperacaoReport(null);
      notifySuccess('Relatório de operação excluído com sucesso.');
      triggerRefresh();
    } else {
      notifyError(res.error || 'Erro ao excluir relatório de operação.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Notifications (3 segundos) */}
      {successMsg && (
        <TopLayerAlert
          key={successMsg.id}
          type="success"
          message={successMsg.text}
          autoHideMs={3000}
          onClose={() => setSuccessMsg(null)}
        />
      )}
      {errorMsg && (
        <TopLayerAlert
          key={errorMsg.id}
          type="error"
          message={errorMsg.text}
          autoHideMs={3000}
          onClose={() => setErrorMsg(null)}
        />
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('relatorio-treinamento')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'relatorio-treinamento'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PenTool className="w-4 h-4" />
          <span>RELATÓRIO DE TREINAMENTO</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('relatorio-operacoes')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'relatorio-operacoes'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>RELATÓRIO DE OPERAÇÕES</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('meus-relatorios')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'meus-relatorios'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>MEUS RELATÓRIOS ({meusTreinamentosTotalCount + meusOperacoesList.length})</span>
          {myPendingSignCount > 0 && (
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'meus-relatorios'
                  ? 'bg-slate-950 text-amber-400'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              {myPendingSignCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('animais')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'animais'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Dog className="w-4 h-4" />
          <span>ANIMAIS</span>
        </button>

        {canVerRelatoriosTodasEquipes && (
          <button
            type="button"
            onClick={() => setActiveTab('relatorio-unidade')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
              activeTab === 'relatorio-unidade'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>RELATÓRIOS DA UNIDADE ({unitScopedReports.length + unitScopedOperacoes.length})</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB ANIMAIS: DOSSIÊ K9 + GRÁFICOS INTERATIVOS DE TÓPICOS DE TREINAMENTO  */}
      {/* ========================================================================= */}
      {activeTab === 'animais' && (
        <RelatorioCanilAnimaisTab
          currentUser={currentUser}
          cachorros={cachorros}
          relatoriosTreinamento={relatoriosTreinamento}
          movimentacoesVeterinarias={movimentacoesVeterinarias}
          activeTopicos={activeTopicosList}
          units={units}
          departments={departments}
          onNotifySuccess={notifySuccess}
          onNotifyError={notifyError}
          onDataChanged={triggerRefresh}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 1B: RELATÓRIO DE OPERAÇÕES (OPERADOR CANINO / COC) */}
      {/* ========================================================================= */}
      {activeTab === 'relatorio-operacoes' && (
        <RelatorioOperacoesCanilForm
          currentUser={currentUser}
          allUsers={allUsersLookupForOperacoes}
          units={units}
          cachorros={cachorros}
          viaturas={viaturas}
          defaultUnitId={defaultUnitId}
          operacoesHojeEditaveis={operacoesHojeEditaveis}
          editingReport={editingOperacaoReport}
          isSubmitting={isSubmitting}
          onStartEdit={handleStartEditOperacao}
          onCancelEdit={() => setEditingOperacaoReport(null)}
          onDelete={handleDeleteOperacao}
          onViaturasChanged={triggerRefresh}
          onSave={handleSaveOperacao}
          formatDateBr={formatDateBr}
          getTodayIsoBr={getTodayIsoBr}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 1: RELATÓRIO DE TREINAMENTO */}
      {/* ========================================================================= */}
      {activeTab === 'relatorio-treinamento' && (
        <div className="space-y-4">
          {editableTodayReports.length > 0 && (
            <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <div>
                    <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wide font-mono">
                      Relatórios de Hoje Disponíveis para Edição ({editableTodayReports.length})
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Relatórios criados ou assinados por você hoje podem ser modificados ou excluídos ao longo do dia.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <div
                    className={`px-3 py-1.5 rounded-lg border font-mono text-[11px] font-bold flex items-center space-x-1.5 ${
                      treinoEditCountdown.totalSeconds === 0
                        ? 'bg-red-500/15 border-red-500/40 text-red-300'
                        : treinoEditCountdown.totalSeconds <= 1800
                        ? 'bg-red-500/15 border-red-500/40 text-red-300'
                        : treinoEditCountdown.totalSeconds <= 7200
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                    }`}
                    title="Contagem regressiva até o término do dia para editar ou excluir"
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {treinoEditCountdown.totalSeconds > 0
                        ? `Tempo restante: ${treinoEditCountdown.formatted}`
                        : 'Prazo encerrado'}
                    </span>
                  </div>
                  {editingTreinoReport && (
                    <button
                      type="button"
                      onClick={handleCancelEditTreinamento}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 border border-slate-700 transition"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Novo Relatório</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                {editableTodayReports.map(rel => {
                  const isBeingEdited = editingTreinoReport?.id === rel.id;
                  const isCreator = rel.condutorId === currentUser?.id;
                  const canDeleteThis = isCreator || isGeral || effectiveRole === 'Administrador';
                  const dogsText = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ');
                  const isConfirmingDelete = confirmDeleteTodayTreinoId === rel.id;
                  return (
                    <div
                      key={rel.id}
                      className={`rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                        isBeingEdited
                          ? 'bg-cyan-500/10 border-cyan-400/60'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-100 truncate">{dogsText}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300">
                            {rel.modalidadeLocal} • {rel.modalidadeParticipacao}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            {isCreator ? 'Criado por você' : 'Assinado por você'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          Condutor: {rel.condutorNome} — {rel.descricao}
                        </p>
                        <div
                          className={`inline-flex items-center space-x-1 font-mono text-[10px] font-bold ${
                            treinoEditCountdown.totalSeconds === 0
                              ? 'text-red-400'
                              : treinoEditCountdown.totalSeconds <= 1800
                              ? 'text-red-300'
                              : treinoEditCountdown.totalSeconds <= 7200
                              ? 'text-amber-300'
                              : 'text-cyan-300'
                          }`}
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>
                            {treinoEditCountdown.totalSeconds > 0
                              ? `Edição/exclusão encerra em ${treinoEditCountdown.formatted}`
                              : 'Prazo de edição/exclusão encerrado'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={treinoEditCountdown.totalSeconds === 0 || isSubmitting}
                          onClick={() => (isBeingEdited ? handleCancelEditTreinamento() : handleStartEditTreinamento(rel))}
                          className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center space-x-1 transition disabled:opacity-40 disabled:cursor-not-allowed ${
                            isBeingEdited
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                          }`}
                        >
                          {isBeingEdited ? (
                            <>
                              <X className="w-3.5 h-3.5" />
                              <span>Cancelar</span>
                            </>
                          ) : (
                            <>
                              <Edit className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </>
                          )}
                        </button>
                        {canDeleteThis && (
                          isConfirmingDelete ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={treinoEditCountdown.totalSeconds === 0 || isSubmitting}
                                onClick={async () => {
                                  setConfirmDeleteTodayTreinoId(null);
                                  setIsSubmitting(true);
                                  const res = await storage.deleteRelatorioTreinamentoCanil(rel.id);
                                  setIsSubmitting(false);
                                  if (res.success) {
                                    if (editingTreinoReport?.id === rel.id) {
                                      handleCancelEditTreinamento();
                                    }
                                    notifySuccess('Relatório de treinamento excluído.');
                                    triggerRefresh();
                                  } else {
                                    notifyError(res.error || 'Erro ao excluir relatório.');
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-40"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTodayTreinoId(null)}
                                className="px-2 py-1.5 rounded-lg font-bold text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={treinoEditCountdown.totalSeconds === 0 || isSubmitting}
                              onClick={() => setConfirmDeleteTodayTreinoId(rel.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
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

          <div
            className={`bg-slate-900 border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 ${
              editingTreinoReport ? 'border-cyan-500/60' : 'border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    editingTreinoReport
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {editingTreinoReport ? <Edit className="w-5 h-5" /> : <PenTool className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-wide font-mono">
                      {editingTreinoReport ? 'Editando Relatório de Treinamento do Dia' : 'Relatório de Treinamento do Dia'}
                    </h2>
                    {editingTreinoReport && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold uppercase">
                        Modo Edição
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {editingTreinoReport
                      ? 'As assinaturas já registradas serão preservadas. Alterações são permitidas ao longo do dia de hoje.'
                      : 'Registre o treinamento diário do cão K9 com condutor, modalidade, descrição e assinaturas.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {editingTreinoReport && (
                  <button
                    type="button"
                    onClick={handleCancelEditTreinamento}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-700 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancelar Edição</span>
                  </button>
                )}
                <div className="inline-flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs font-mono">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-400">Data de Criação:</span>
                  <span className="font-bold text-slate-100">{formatDateBr(treinoForm.dataTreinamento)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Condutor */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Condutor Responsável
                </label>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-slate-100">
                      {editingTreinoReport ? editingTreinoReport.condutorNome : (currentUser?.name || 'Policial')}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      MASP:{' '}
                      {(editingTreinoReport ? editingTreinoReport.condutorMasp : currentUser?.masp)
                        ? formatMasp((editingTreinoReport ? editingTreinoReport.condutorMasp : currentUser?.masp) || '')
                        : 'N/A'}
                      {(editingTreinoReport ? editingTreinoReport.condutorCargo : currentUser?.cargo)
                        ? ` • ${editingTreinoReport ? editingTreinoReport.condutorCargo : currentUser?.cargo}`
                        : ''}
                    </p>
                    {editingTreinoReport && editingTreinoReport.condutorId !== currentUser?.id && (
                      <p className="text-[10px] text-cyan-300 mt-1 font-semibold">
                        Editando como participante assinante: {currentUser?.name}
                      </p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                    CONDUTOR
                  </span>
                </div>
              </div>

              {/* Cachorro(s) do Condutor */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Cachorro(s) K9 *
                  </label>
                  {treinoForm.cachorros.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                      {treinoForm.cachorros.length} selecionado(s)
                    </span>
                  )}
                </div>

                {treinoForm.cachorros.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {treinoForm.cachorros.map(dog => (
                      <span
                        key={dog.id}
                        className="inline-flex items-center space-x-1.5 bg-slate-900 border border-amber-500/40 text-amber-300 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                      >
                        <Dog className="w-3 h-3 text-amber-400" />
                        <span>{dog.nome}{dog.raca ? ` (${dog.raca})` : ''}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMainDog(dog.id)}
                          className="text-slate-400 hover:text-red-400"
                          title="Remover cachorro"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <select
                  value=""
                  onChange={(e) => handleAddMainDog(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="">
                    {treinoForm.cachorros.length === 0
                      ? 'Selecione o(s) cão(es) policial(is)...'
                      : '+ Adicionar outro cachorro...'}
                  </option>
                  {cachorros
                    .filter(d => d.status !== 'Baixado / Óbito' && !treinoForm.cachorros.some(c => c.id === d.id))
                    .map(dog => (
                      <option key={dog.id} value={dog.id}>
                        {dog.nome} — {dog.raca} ({dog.status})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Local & Participação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Local do Treinamento *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Interno', 'Externo'] as LocalTreinamentoCanil[]).map(local => (
                    <button
                      key={local}
                      type="button"
                      onClick={() => setTreinoForm({ ...treinoForm, modalidadeLocal: local })}
                      className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border font-bold transition ${
                        treinoForm.modalidadeLocal === local
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

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Formato de Participação *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Sozinho', 'Coletivo'] as ParticipacaoTreinamentoCanil[]).map(part => (
                    <button
                      key={part}
                      type="button"
                      onClick={() =>
                        setTreinoForm(prev => ({
                          ...prev,
                          modalidadeParticipacao: part,
                          participantes: part === 'Sozinho' ? [] : prev.participantes
                        }))
                      }
                      className={`flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border font-bold transition ${
                        treinoForm.modalidadeParticipacao === part
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {part === 'Sozinho' ? <UserCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                      <span>{part}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Participantes Coletivos (até 15 usuários) */}
            {treinoForm.modalidadeParticipacao === 'Coletivo' && (
              <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-4 space-y-4 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-cyan-300 uppercase flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>Usuários Participantes para Assinatura Conjunta</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Adicione até 15 usuários junto com {editingTreinoReport ? editingTreinoReport.condutorNome : currentUser?.name} para constar e assinar este relatório.
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg font-mono font-bold text-xs border ${
                      treinoForm.participantes.length >= 15
                        ? 'bg-red-500/20 border-red-500/40 text-red-300'
                        : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                    }`}
                  >
                    {treinoForm.participantes.length} / 15 adicionados
                  </span>
                </div>

                {treinoForm.participantes.length > 0 && (
                  <div className="space-y-2.5">
                    {treinoForm.participantes.map((p, idx) => {
                      const participantDogs = p.cachorros || [];
                      const assignedIds = new Set(participantDogs.map(c => c.id));
                      const availableDogs = cachorros.filter(
                        d => d.status !== 'Baixado / Óbito' && !assignedIds.has(d.id)
                      );
                      return (
                        <div
                          key={p.userId}
                          className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-mono text-cyan-400 font-bold">#{idx + 1}</span>
                              <span className="font-bold text-slate-100">{p.name}</span>
                              {p.masp && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  (MASP: {formatMasp(p.masp)})
                                </span>
                              )}
                              {participantDogs.length === 0 ? (
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400">
                                  Sem cachorro
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                                  {participantDogs.length} cachorro(s)
                                </span>
                              )}
                              {editingTreinoReport && (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    p.signed
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-400'
                                  }`}
                                >
                                  {p.signed ? '✓ Assinado' : 'Assinatura Pendente'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveParticipant(p.userId)}
                              className="text-slate-400 hover:text-red-400 transition flex items-center space-x-1 text-[11px]"
                              title="Remover participante"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Remover</span>
                            </button>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-slate-800/80">
                            <div className="flex-1 flex flex-wrap items-center gap-1.5">
                              {participantDogs.map(dog => (
                                <span
                                  key={dog.id}
                                  className="inline-flex items-center space-x-1.5 bg-slate-950 border border-amber-500/40 text-amber-300 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                                >
                                  <Dog className="w-3 h-3 text-amber-400" />
                                  <span>{dog.nome}{dog.raca ? ` (${dog.raca})` : ''}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDogFromParticipant(p.userId, dog.id)}
                                    className="text-slate-400 hover:text-red-400"
                                    title="Remover cachorro deste integrante"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <select
                              value=""
                              onChange={(e) => handleAddDogToParticipant(p.userId, e.target.value)}
                              className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-amber-500 sm:w-64"
                            >
                              <option value="">
                                {participantDogs.length === 0
                                  ? '+ Vincular cachorro (opcional)...'
                                  : '+ Adicionar outro cachorro...'}
                              </option>
                              {availableDogs.map(dog => (
                                <option key={dog.id} value={dog.id}>
                                  {dog.nome} — {dog.raca}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      placeholder="Buscar policial por nome, MASP ou cargo para adicionar..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/80 bg-slate-900/60">
                    {filteredParticipantCandidates.length === 0 ? (
                      <p className="p-3 text-center text-slate-500">Nenhum outro usuário encontrado para adicionar.</p>
                    ) : (
                      filteredParticipantCandidates.map(u => {
                        const disabled = treinoForm.participantes.length >= 15;
                        return (
                          <div key={u.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-800/40">
                            <div>
                              <p className="font-semibold text-slate-200">{u.name}</p>
                              <p className="text-[10px] font-mono text-slate-400">
                                MASP: {u.masp ? formatMasp(u.masp) : 'N/A'} • {u.cargo || 'Policial'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => handleAddParticipant(u)}
                              className={`px-3 py-1 rounded-lg font-bold text-[11px] flex items-center space-x-1 transition ${
                                disabled
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              <span>Adicionar</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tópicos de Treinamento K9 (Obrigatório) */}
            <div
              className={`bg-slate-950/80 border rounded-xl p-4 space-y-3.5 text-xs transition ${
                treinoForm.topicosTreinamento.length === 0
                  ? 'border-amber-500/50'
                  : 'border-emerald-500/35'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-amber-300 uppercase flex items-center space-x-2">
                    <Tag className="w-4 h-4" />
                    <span>Tópico(s) de Treinamento K9 *</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    <strong className="text-amber-300">Obrigatório:</strong> selecione ao menos um tópico realizado e defina se foi aplicado a <strong>todos os K9 do relatório</strong> ou apenas a <strong>K9 específicos</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {treinoForm.topicosTreinamento.length > 0 ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-mono font-bold text-[11px]">
                      {treinoForm.topicosTreinamento.length} tópico(s)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold uppercase text-[10px]">
                      Obrigatório
                    </span>
                  )}
                  {canManageTopicosTreinamento && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTopicoId(null);
                        setConfirmDeleteTopicoId(null);
                        setShowManageTopicosModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold text-[11px] flex items-center space-x-1.5 transition"
                      title="Inserir, editar ou excluir tópicos de treinamento K9 (Administrador COE)"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Gerenciar Tópicos</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedTopicoToAdd}
                  onChange={(e) => {
                    const val = e.target.value as TopicoTreinamentoCanilTipo | '';
                    setSelectedTopicoToAdd(val);
                    if (val) handleAddTopicoTreinamento(val);
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500"
                >
                  <option value="">
                    {treinoForm.topicosTreinamento.length === 0
                      ? 'Selecione um tópico de treinamento para adicionar...'
                      : '+ Adicionar outro tópico de treinamento...'}
                  </option>
                  {activeTopicosList.filter(
                    t => !treinoForm.topicosTreinamento.some(item => item.topico === t)
                  ).map(topico => (
                    <option key={topico} value={topico}>
                      {topico}
                    </option>
                  ))}
                </select>
              </div>

              {treinoForm.topicosTreinamento.length > 0 && (
                <div className="space-y-2.5">
                  {treinoForm.topicosTreinamento.map(item => (
                    <div
                      key={item.topico}
                      className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 font-black uppercase tracking-wide text-[11px]">
                            {item.topico}
                          </span>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSetTopicoScope(item.topico, true)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                                item.aplicarTodosK9
                                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Todos os K9 do relatório
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetTopicoScope(item.topico, false)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                                !item.aplicarTodosK9
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Selecionar K9
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTopicoTreinamento(item.topico)}
                          className="text-slate-400 hover:text-red-400 transition flex items-center space-x-1 text-[11px]"
                          title="Remover tópico"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                      </div>

                      {item.aplicarTodosK9 ? (
                        <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-emerald-400 font-semibold">Aplicado a todos os K9 do relatório:</span>
                          {allFormDogs.length === 0 ? (
                            <span className="text-amber-300 italic">Nenhum cachorro selecionado ainda no relatório.</span>
                          ) : (
                            allFormDogs.map(dog => (
                              <span
                                key={`${item.topico}-all-${dog.id}`}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 font-semibold"
                              >
                                <Dog className="w-3 h-3 text-emerald-400" />
                                <span>{dog.nome}</span>
                              </span>
                            ))
                          )}
                        </div>
                      ) : (
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <p className="text-[11px] text-cyan-300 font-semibold">
                            Indique qual(is) K9 realizaram o tópico &quot;{item.topico}&quot;:
                          </p>
                          {allFormDogs.length === 0 ? (
                            <p className="text-[11px] text-amber-300 italic">
                              Adicione ao menos um cachorro ao relatório acima para vinculá-lo a este tópico.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {allFormDogs.map(dog => {
                                const isChecked = item.cachorros.some(c => c.id === dog.id);
                                return (
                                  <button
                                    key={`${item.topico}-sel-${dog.id}`}
                                    type="button"
                                    onClick={() => handleToggleDogInTopico(item.topico, dog)}
                                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                                      isChecked
                                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow'
                                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                                    }`}
                                  >
                                    <Dog className={`w-3 h-3 ${isChecked ? 'text-amber-400' : 'text-slate-500'}`} />
                                    <span>{dog.nome}{dog.raca ? ` (${dog.raca})` : ''}</span>
                                    {isChecked && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Descrição até 1000 caracteres */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-300 uppercase">
                  Descrição do Treinamento do Dia *
                </label>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    treinoForm.descricao.length >= 950 ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  {treinoForm.descricao.length} / 1000 caracteres
                </span>
              </div>
              <textarea
                value={treinoForm.descricao}
                onChange={(e) => setTreinoForm({ ...treinoForm, descricao: e.target.value.slice(0, 1000) })}
                maxLength={1000}
                rows={5}
                placeholder="Descreva as atividades, exercícios de faro/obediência/proteção, comportamento do cão, duração e observações do treinamento..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-800">
              {editingTreinoReport && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCancelEditTreinamento}
                  className="px-4 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs flex items-center space-x-2 border border-slate-700 transition"
                >
                  <X className="w-4 h-4" />
                  <span>Cancelar Edição</span>
                </button>
              )}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSaveTreinamento(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl text-xs flex items-center space-x-2 border border-slate-700 transition"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{editingTreinoReport ? 'Salvar Alterações' : 'Salvar Relatório'}</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSaveTreinamento(true)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-2 shadow-lg transition"
              >
                <Printer className="w-4 h-4" />
                <span>{editingTreinoReport ? 'Salvar Alterações e Imprimir' : 'Salvar e Imprimir Relatório'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MEUS RELATÓRIOS */}
      {/* ========================================================================= */}
      {activeTab === 'meus-relatorios' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-100 uppercase font-mono flex items-center space-x-2">
                  <ClipboardList className="w-4 h-4 text-amber-400" />
                  <span>Meus Relatórios</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Visualize seus relatórios de treinamento e de operações separados por filtro.
                </p>
              </div>

              {/* Filtro Principal: Separar Treinamentos vs Operações */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  {
                    key: 'TODOS',
                    label: `Todos (${meusTreinamentosTotalCount + meusOperacoesList.length})`
                  },
                  {
                    key: 'TREINAMENTO',
                    label: `Treinamentos (${meusTreinamentosTotalCount})`
                  },
                  {
                    key: 'OPERACAO',
                    label: `Operações (${meusOperacoesList.length})`
                  }
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMeusTipoFilter(opt.key as any)}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition border ${
                      meusTipoFilter === opt.key
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-filtros específicos dos Relatórios de Treinamento */}
            {meusTipoFilter !== 'OPERACAO' && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs pt-2 border-t border-slate-800/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">Treinamentos:</span>
                {[
                  { key: 'TODOS', label: 'Todos' },
                  { key: 'CRIADOS', label: 'Criados por Mim' },
                  { key: 'CONJUNTOS_ASSINADOS', label: 'Conjuntos Assinados' },
                  { key: 'PENDENTES', label: `Pendentes (${myPendingSignCount})` }
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMeusRelFilter(opt.key as any)}
                    className={`px-3 py-1 rounded-lg font-bold transition border text-[11px] ${
                      meusRelFilter === opt.key
                        ? 'bg-cyan-600 text-white border-cyan-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SEÇÃO: MEUS RELATÓRIOS DE OPERAÇÕES (INICIA OCULTA) */}
          {(meusTipoFilter === 'OPERACAO' || meusTipoFilter === 'TODOS') && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <button
                type="button"
                onClick={() => setMeusOperacoesSectionOpen(v => !v)}
                className="w-full px-4 py-3.5 bg-slate-950/70 hover:bg-slate-950 transition flex items-center justify-between gap-3 text-left"
              >
                <span className="text-xs font-black text-emerald-300 uppercase font-mono flex items-center space-x-2">
                  {meusOperacoesSectionOpen ? (
                    <ChevronDown className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                  )}
                  <ShieldAlert className="w-4 h-4" />
                  <span>Meus Relatórios de Operações ({meusOperacoesList.length})</span>
                </span>
                <span className="text-[11px] font-bold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                  {meusOperacoesSectionOpen ? 'Ocultar' : 'Abrir'}
                </span>
              </button>

              {meusOperacoesSectionOpen && (
                <div className="p-3.5 sm:p-4 border-t border-slate-800 space-y-2.5">
                  {meusOperacoesList.length === 0 ? (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                      Nenhum relatório de operação encontrado em que você tenha participado.
                    </div>
                  ) : (
                    meusOperacoesList.map(rel => {
                      const isEditableToday = canEditOrDeleteOperacao(rel);
                      const isItemOpen = Boolean(expandedReportIds[`meus-op-${rel.id}`]);
                      const solicitacaoTxt =
                        rel.solicitacaoTipo === 'Outros' && rel.solicitacaoOutrosDetalhes
                          ? `Outros: ${rel.solicitacaoOutrosDetalhes}`
                          : rel.solicitacaoTipo;

                      return (
                        <div
                          key={rel.id}
                          className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden"
                        >
                          <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpandedReport(`meus-op-${rel.id}`)}
                              className="flex-1 text-left flex items-start space-x-2.5 min-w-0 group"
                            >
                              <span className="mt-0.5 text-slate-400 group-hover:text-amber-400 transition shrink-0">
                                {isItemOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase">
                                    Operação
                                  </span>
                                  <span className="font-mono font-bold text-amber-400 text-xs flex items-center space-x-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>
                                      {formatDateBr(rel.dataOperacao)} • {rel.horaOperacao}
                                    </span>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-100 border border-slate-700 text-[10px] font-bold flex items-center space-x-1">
                                    <MapPin className="w-3 h-3 text-amber-400" />
                                    <span>{rel.comarca}/{rel.estadoOperacao || 'MG'}</span>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                                    Solicitação: {solicitacaoTxt}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      rel.materialEncontrado
                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}
                                  >
                                    Material: {rel.materialEncontrado ? 'SIM' : 'NÃO'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400">
                                  Relator: <strong className="text-slate-200">{rel.criadorNome}</strong> • Operadores:{' '}
                                  <strong className="text-amber-300">{(rel.operadores || []).length}</strong>
                                  {(rel.viaturas || []).length > 0 && (
                                    <>
                                      {' '}• Viaturas: <strong className="text-cyan-300">{(rel.viaturas || []).length}</strong>
                                    </>
                                  )}
                                </p>
                              </div>
                            </button>

                            <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleExpandedReport(`meus-op-${rel.id}`)}
                                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold rounded-lg transition"
                              >
                                {isItemOpen ? 'Recolher' : 'Abrir'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewingOperacaoReport(rel)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition"
                              >
                                Ver Detalhes
                              </button>
                              {isEditableToday && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditOperacao(rel)}
                                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center space-x-1 transition"
                                  title="Editar relatório (permitido durante o dia da confecção)"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePrintRelatorioOperacao(rel)}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>
                              {isEditableToday && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOperacao(rel)}
                                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition"
                                  title="Excluir relatório (permitido durante o dia da confecção)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isItemOpen && (
                            <div className="px-4 pb-4 pt-3 border-t border-slate-800/80 space-y-3 bg-slate-900/50">
                              {rel.apoioOutroDepartamento && (rel.departamentosApoio || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-cyan-400 font-bold flex items-center space-x-1 mr-1">
                                    <Building className="w-3.5 h-3.5" />
                                    <span>Apoio a outro(s) departamento(s):</span>
                                  </span>
                                  {(rel.departamentosApoio || []).map(dept => (
                                    <span
                                      key={dept}
                                      className="px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 font-semibold"
                                    >
                                      {dept}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {(rel.viaturas || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-cyan-400 font-bold flex items-center space-x-1 mr-1">
                                    <Car className="w-3.5 h-3.5" />
                                    <span>Viaturas ({(rel.viaturas || []).length}):</span>
                                  </span>
                                  {(rel.viaturas || []).map(v => (
                                    <span
                                      key={v.id}
                                      className="px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 font-semibold"
                                    >
                                      <span className="font-mono font-black text-amber-300">{v.placa}</span> • {v.descricao}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {rel.materialEncontrado && (rel.materiaisEncontrados || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-emerald-400 font-bold flex items-center space-x-1 mr-1">
                                    <Package className="w-3.5 h-3.5" />
                                    <span>Encontrados:</span>
                                  </span>
                                  {rel.materiaisEncontrados.map(m => (
                                    <span
                                      key={m.tipo}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 font-semibold"
                                    >
                                      {m.tipo} — Cão(s): {(m.cachorros || []).map(c => c.nome).join(', ') || '-'}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 whitespace-pre-wrap">
                                {rel.detalhamento}
                              </div>

                              <div className="pt-1 flex flex-wrap gap-1.5 text-[11px]">
                                <span className="text-slate-400 font-semibold mr-1">Operadores ({(rel.operadores || []).length}):</span>
                                {(rel.operadores || []).map(op => (
                                  <span
                                    key={op.userId}
                                    className="px-2 py-0.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-300"
                                  >
                                    {op.name}
                                    {op.cachorros && op.cachorros.length > 0
                                      ? ` • Cão(s): ${op.cachorros.map(c => c.nome).join(', ')}`
                                      : ' • Sem animal'}
                                  </span>
                                ))}
                              </div>
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

          {/* SEÇÃO: MEUS RELATÓRIOS DE TREINAMENTO (INICIA OCULTA) */}
          {(meusTipoFilter === 'TREINAMENTO' || meusTipoFilter === 'TODOS') && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-visible shadow-lg">
              <button
                type="button"
                onClick={() => setMeusTreinamentosSectionOpen(v => !v)}
                className={`w-full px-4 py-3.5 bg-slate-950/70 hover:bg-slate-950 transition flex items-center justify-between gap-3 text-left ${
                  meusTreinamentosSectionOpen ? 'rounded-t-2xl' : 'rounded-2xl'
                }`}
              >
                <span className="text-xs font-black text-amber-300 uppercase font-mono flex items-center space-x-2">
                  {meusTreinamentosSectionOpen ? (
                    <ChevronDown className="w-4 h-4 text-amber-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                  )}
                  <PenTool className="w-4 h-4" />
                  <span>Meus Relatórios de Treinamento ({meusRelatoriosList.length})</span>
                  {myPendingSignCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                      {myPendingSignCount} pendente(s)
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-bold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                  {meusTreinamentosSectionOpen ? 'Ocultar' : 'Abrir'}
                </span>
              </button>

              {meusTreinamentosSectionOpen && (
                <div className="p-3.5 sm:p-4 border-t border-slate-800 space-y-2.5">
                  {meusRelatoriosList.length === 0 ? (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                      Nenhum relatório de treinamento encontrado para este filtro.
                    </div>
                  ) : (
                    meusRelatoriosList.map(rel => {
                      const isCreator = rel.condutorId === currentUser?.id;
                      const myParticipantEntry = (rel.participantes || []).find(p => p.userId === currentUser?.id);
                      const needsMySignature = !isCreator && Boolean(myParticipantEntry && !myParticipantEntry.signed);
                      const iSignedJoint = !isCreator && Boolean(myParticipantEntry?.signed);
                      const isItemOpen = Boolean(expandedReportIds[`meus-tr-${rel.id}`]);
                      const isColetivo = rel.modalidadeParticipacao === 'Coletivo';
                      const allDogs = getRelatorioAllDogs(rel);
                      const condutorDogs = getRelatorioCondutorDogs(rel);
                      const allSignerNames = getRelatorioAllSignerNames(rel);

                      return (
                        <div
                          key={rel.id}
                          className={`bg-slate-950/60 border rounded-xl overflow-visible ${
                            needsMySignature ? 'border-amber-500/60' : 'border-slate-800'
                          }`}
                        >
                          <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpandedReport(`meus-tr-${rel.id}`)}
                              className="flex-1 text-left flex items-start space-x-2.5 min-w-0 group"
                            >
                              <span className="mt-0.5 text-slate-400 group-hover:text-amber-400 transition shrink-0">
                                {isItemOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono font-bold text-xs text-amber-400">
                                    {formatDateBr(rel.dataTreinamento)}
                                  </span>
                                  <span className="font-black text-slate-100 text-sm flex items-center space-x-1.5">
                                    <Dog className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span>{allDogs.length > 0 ? allDogs.map(c => c.nome).join(', ') : 'Sem cachorro'}</span>
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      rel.modalidadeLocal === 'Interno'
                                        ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                        : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                    }`}
                                  >
                                    {rel.modalidadeLocal}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      rel.modalidadeParticipacao === 'Sozinho'
                                        ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                        : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                    }`}
                                  >
                                    {rel.modalidadeParticipacao}
                                  </span>
                                  {isCreator && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      {isColetivo ? 'Condutor Digitador' : 'Autor / Condutor'}
                                    </span>
                                  )}
                                  {iSignedJoint && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      Conjunto Assinado por Você
                                    </span>
                                  )}
                                  {needsMySignature && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      Aguardando Sua Assinatura
                                    </span>
                                  )}
                                </div>
                                {isColetivo ? (
                                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1">
                                    <span>
                                      Condutor digitador: <strong className="text-slate-200">{rel.condutorNome}</strong>
                                      {rel.condutorMasp ? ` (MASP: ${formatMasp(rel.condutorMasp)})` : ''} e
                                    </span>
                                    <span
                                      className="relative inline-block group/outros"
                                      title={allSignerNames.join('\n')}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold uppercase text-[10px] cursor-help underline decoration-dotted underline-offset-2">
                                        OUTROS
                                      </span>
                                      <div className="hidden group-hover/outros:block absolute left-0 bottom-full mb-1.5 z-50 w-64 p-2.5 rounded-xl bg-slate-950 border border-cyan-500/40 shadow-2xl text-[11px] text-slate-200 pointer-events-none">
                                        <p className="text-[10px] font-black uppercase text-cyan-300 mb-1 border-b border-slate-800 pb-1">
                                          Usuários que assinam ({allSignerNames.length})
                                        </p>
                                        <ul className="space-y-0.5">
                                          {allSignerNames.map((nome, idx) => (
                                            <li key={`${rel.id}-signer-${idx}`} className="truncate">
                                              • {nome}{idx === 0 ? ' (Digitador)' : ''}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </span>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400">
                                    Condutor: <strong className="text-slate-200">{rel.condutorNome}</strong>
                                    {rel.condutorMasp ? ` (MASP: ${formatMasp(rel.condutorMasp)})` : ''}
                                  </p>
                                )}
                              </div>
                            </button>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleExpandedReport(`meus-tr-${rel.id}`)}
                                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold rounded-lg text-xs transition"
                              >
                                {isItemOpen ? 'Recolher' : 'Abrir'}
                              </button>
                              {needsMySignature && (
                                <button
                                  type="button"
                                  onClick={() => handleAssinarRelatorioTreino(rel)}
                                  disabled={isSubmitting}
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow transition"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Assinar Relatório</span>
                                </button>
                              )}
                              {canEditRelatorioTreinamento(rel) && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditTreinamento(rel)}
                                  disabled={isSubmitting}
                                  className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                                  title="Editar relatório (disponível ao longo do dia de hoje)"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingTreinoReport(rel)}
                                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition"
                              >
                                Visualizar
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintRelatorioTreinamento(rel)}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Imprimir</span>
                              </button>
                              {(isCreator || isGeral) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRelatorioTreino(rel)}
                                  disabled={isSubmitting}
                                  className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition"
                                  title="Excluir relatório"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isItemOpen && (
                            <div className="px-4 pb-4 pt-3 border-t border-slate-800/80 space-y-3 bg-slate-900/50 rounded-b-xl">
                              {(rel.topicosTreinamento || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-amber-400 font-bold flex items-center space-x-1 mr-1">
                                    <Tag className="w-3.5 h-3.5" />
                                    <span>Tópicos ({(rel.topicosTreinamento || []).length}):</span>
                                  </span>
                                  {(rel.topicosTreinamento || []).map(t => (
                                    <span
                                      key={t.topico}
                                      className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 font-semibold"
                                    >
                                      <strong>{t.topico}</strong> —{' '}
                                      {t.aplicarTodosK9
                                        ? `Todos os K9 (${(t.cachorros || []).map(c => c.nome).join(', ') || 'Todos'})`
                                        : (t.cachorros || []).map(c => c.nome).join(', ')}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 whitespace-pre-wrap">
                                {rel.descricao}
                              </div>

                              {isColetivo && (
                                <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="text-slate-400 font-semibold mr-1">
                                    Participantes ({1 + (rel.participantes || []).length}):
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-lg border ${
                                      rel.condutorAssinado
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                        : 'bg-slate-950 border-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {rel.condutorNome} (Digitador):{' '}
                                    <span className="text-amber-300">
                                      {condutorDogs.length > 0
                                        ? condutorDogs.map(c => c.nome).join(', ')
                                        : 'Sem cachorro'}
                                    </span>{' '}
                                    {rel.condutorAssinado ? '✓ Assinado' : '• Pendente'}
                                  </span>
                                  {(rel.participantes || []).map(p => (
                                    <span
                                      key={p.userId}
                                      className={`px-2 py-0.5 rounded-lg border ${
                                        p.signed
                                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                          : 'bg-slate-950 border-slate-800 text-slate-400'
                                      }`}
                                    >
                                      {p.name}:{' '}
                                      <span className="text-amber-300">
                                        {p.cachorros && p.cachorros.length > 0
                                          ? p.cachorros.map(c => c.nome).join(', ')
                                          : 'Sem cachorro'}
                                      </span>{' '}
                                      {p.signed ? '✓ Assinado' : '• Pendente'}
                                    </span>
                                  ))}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RELATÓRIOS DA UNIDADE */}
      {/* ========================================================================= */}
      {canVerRelatoriosTodasEquipes && activeTab === 'relatorio-unidade' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-100 uppercase font-mono flex items-center space-x-2">
                  <Building className="w-4 h-4 text-amber-400" />
                  <span>Relatórios da Unidade (Treinamentos e Operações)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consulte, separe por tipo e filtre todos os relatórios de treinamento e operações da unidade.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUnidadeFilterDataInicio('');
                    setUnidadeFilterDataFim('');
                    setUnidadeFilterDeptId('');
                    setUnidadeFilterEstado('');
                    setUnidadeFilterPolicialId('');
                    setUnidadeFilterCachorroId('');
                    setUnidadeFilterViatura('');
                    setUnidadeFilterLocal('TODOS');
                    setUnidadeFilterComarca('');
                    setUnidadeFilterMaterial('TODOS');
                    setUnidadeFilterUnitId('');
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
                >
                  Limpar Filtros
                </button>
                <button
                  type="button"
                  onClick={handlePrintRelatorioUnidadeHistoricoCompleto}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    Imprimir Histórico (
                    {(unidadeTipoFilter !== 'OPERACAO' ? filteredUnidadeReports.length : 0) +
                      (unidadeTipoFilter !== 'TREINAMENTO' ? filteredUnidadeOperacoes.length : 0)}
                    )
                  </span>
                </button>
                {unidadeTipoFilter !== 'OPERACAO' && (
                  <button
                    type="button"
                    onClick={handlePrintRelatorioUnidadeConsolidado}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Treinamentos</span>
                  </button>
                )}
                {unidadeTipoFilter !== 'TREINAMENTO' && (
                  <button
                    type="button"
                    onClick={handlePrintRelatorioUnidadeOperacoesConsolidado}
                    className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Operações</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filtro de Tipo na Unidade: Separar Treinamentos vs Operações */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Tipo de Relatório:</span>
              {[
                {
                  key: 'TODOS',
                  label: `Todos (${filteredUnidadeReports.length + filteredUnidadeOperacoes.length})`
                },
                {
                  key: 'TREINAMENTO',
                  label: `Treinamentos (${filteredUnidadeReports.length})`
                },
                {
                  key: 'OPERACAO',
                  label: `Operações (${filteredUnidadeOperacoes.length})`
                }
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setUnidadeTipoFilter(opt.key as any)}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition border ${
                    unidadeTipoFilter === opt.key
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Inicial</label>
                <input
                  type="date"
                  value={unidadeFilterDataInicio}
                  onChange={(e) => setUnidadeFilterDataInicio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Final</label>
                <input
                  type="date"
                  value={unidadeFilterDataFim}
                  onChange={(e) => setUnidadeFilterDataFim(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Departamento</label>
                <select
                  value={unidadeFilterDeptId}
                  onChange={(e) => {
                    setUnidadeFilterDeptId(e.target.value);
                    setUnidadeFilterUnitId('');
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Departamentos</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unidade / Equipe</label>
                <select
                  value={unidadeFilterUnitId}
                  onChange={(e) => setUnidadeFilterUnitId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todas as Unidades / Equipes</option>
                  {units
                    .filter(u => !unidadeFilterDeptId || u.departmentId === unidadeFilterDeptId)
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Estado (UF)</label>
                <select
                  value={unidadeFilterEstado}
                  onChange={(e) => {
                    setUnidadeFilterEstado(e.target.value);
                    setUnidadeFilterComarca('');
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Estados</option>
                  {ESTADOS_BR.map(uf => (
                    <option key={uf.sigla} value={uf.sigla}>
                      {uf.sigla} — {uf.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cidade / Comarca</label>
                <select
                  value={unidadeFilterComarca}
                  onChange={(e) => setUnidadeFilterComarca(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todas as Cidades</option>
                  {unidadeCidadesForFilter.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Policial (Condutor / Operador)</label>
                <select
                  value={unidadeFilterPolicialId}
                  onChange={(e) => setUnidadeFilterPolicialId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Policiais</option>
                  {unitOfficersForFilter.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name}{o.masp ? ` (${formatMasp(o.masp)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Veículo / Viatura</label>
                <select
                  value={unidadeFilterViatura}
                  onChange={(e) => setUnidadeFilterViatura(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Veículos</option>
                  {unidadeViaturasForFilter.map(v => (
                    <option key={v.value} value={v.value}>
                      {v.placa}{v.descricao ? ` — ${v.descricao}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">Animal (Cachorro K9)</label>
                <select
                  value={unidadeFilterCachorroId}
                  onChange={(e) => setUnidadeFilterCachorroId(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Animais</option>
                  {cachorros.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nome} ({d.raca})
                    </option>
                  ))}
                </select>
              </div>

              {unidadeTipoFilter !== 'OPERACAO' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Treino: Interno / Externo</label>
                  <select
                    value={unidadeFilterLocal}
                    onChange={(e) => setUnidadeFilterLocal(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="TODOS">Todos (Interno e Externo)</option>
                    <option value="Interno">Interno</option>
                    <option value="Externo">Externo</option>
                  </select>
                </div>
              )}

              {unidadeTipoFilter !== 'TREINAMENTO' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Operação: Material?</label>
                  <select
                    value={unidadeFilterMaterial}
                    onChange={(e) => setUnidadeFilterMaterial(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="TODOS">Todos</option>
                    <option value="SIM">Com Material Encontrado</option>
                    <option value="NAO">Sem Material Encontrado</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-amber-400 uppercase">Treinamentos Filtrados</span>
                <p className="text-lg font-black text-amber-300">{filteredUnidadeReports.length}</p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-emerald-400 uppercase">Operações Filtradas</span>
                <p className="text-lg font-black text-emerald-300">{filteredUnidadeOperacoes.length}</p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-cyan-400 uppercase">Operações c/ Material</span>
                <p className="text-lg font-black text-cyan-300">
                  {filteredUnidadeOperacoes.filter(r => r.materialEncontrado).length}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-blue-400 uppercase">Treinos Coletivos</span>
                <p className="text-lg font-black text-blue-300">
                  {filteredUnidadeReports.filter(r => r.modalidadeParticipacao === 'Coletivo').length}
                </p>
              </div>
            </div>
          </div>

          {/* SEÇÃO: RELATÓRIOS DE OPERAÇÕES DA UNIDADE (INICIA OCULTA) */}
          {(unidadeTipoFilter === 'OPERACAO' || unidadeTipoFilter === 'TODOS') && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <button
                type="button"
                onClick={() => setUnidadeOperacoesSectionOpen(v => !v)}
                className="w-full px-4 py-3.5 bg-slate-950/70 hover:bg-slate-950 transition flex items-center justify-between gap-3 text-left"
              >
                <span className="text-xs font-black text-emerald-300 uppercase font-mono flex items-center space-x-2">
                  {unidadeOperacoesSectionOpen ? (
                    <ChevronDown className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                  )}
                  <ShieldAlert className="w-4 h-4" />
                  <span>Relatórios de Operações da Unidade ({filteredUnidadeOperacoes.length})</span>
                </span>
                <span className="text-[11px] font-bold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                  {unidadeOperacoesSectionOpen ? 'Ocultar' : 'Abrir'}
                </span>
              </button>

              {unidadeOperacoesSectionOpen && (
                <div className="p-3.5 sm:p-4 border-t border-slate-800 space-y-2.5">
                  {filteredUnidadeOperacoes.length === 0 ? (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center text-slate-500 italic text-xs">
                      Nenhum relatório de operação encontrado para os filtros selecionados.
                    </div>
                  ) : (
                    filteredUnidadeOperacoes.map(rel => {
                      const isEditableToday = canEditOrDeleteOperacao(rel);
                      const isItemOpen = Boolean(expandedReportIds[`unid-op-${rel.id}`]);
                      const solicitacaoTxt =
                        rel.solicitacaoTipo === 'Outros' && rel.solicitacaoOutrosDetalhes
                          ? `Outros: ${rel.solicitacaoOutrosDetalhes}`
                          : rel.solicitacaoTipo;

                      return (
                        <div
                          key={rel.id}
                          className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden"
                        >
                          <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpandedReport(`unid-op-${rel.id}`)}
                              className="flex-1 text-left flex items-start space-x-2.5 min-w-0 group"
                            >
                              <span className="mt-0.5 text-slate-400 group-hover:text-emerald-400 transition shrink-0">
                                {isItemOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-amber-400 text-xs">
                                    {formatDateBr(rel.dataOperacao)} • {rel.horaOperacao}
                                  </span>
                                  <span className="font-bold text-slate-100 text-xs flex items-center space-x-1">
                                    <MapPin className="w-3 h-3 text-amber-400" />
                                    <span>{rel.comarca}/{rel.estadoOperacao || 'MG'}</span>
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                                    {solicitacaoTxt}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      rel.materialEncontrado
                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}
                                  >
                                    Material: {rel.materialEncontrado ? 'SIM' : 'NÃO'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                  Relator: <strong className="text-slate-200">{rel.criadorNome}</strong> • Operadores:{' '}
                                  <strong className="text-amber-300">{(rel.operadores || []).length}</strong>
                                  {(rel.viaturas || []).length > 0 && (
                                    <>
                                      {' '}• Viaturas: <strong className="text-cyan-300">{(rel.viaturas || []).map(v => v.placa).join(', ')}</strong>
                                    </>
                                  )}
                                </p>
                              </div>
                            </button>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleExpandedReport(`unid-op-${rel.id}`)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px] font-semibold transition"
                              >
                                {isItemOpen ? 'Recolher' : 'Abrir'}
                              </button>
                              {isEditableToday && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditOperacao(rel)}
                                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                                >
                                  <Edit className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingOperacaoReport(rel)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold transition"
                              >
                                Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintRelatorioOperacao(rel)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Imprimir</span>
                              </button>
                              {isEditableToday && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOperacao(rel)}
                                  className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded transition"
                                  title="Excluir relatório"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isItemOpen && (
                            <div className="px-4 pb-4 pt-3 border-t border-slate-800/80 space-y-3 bg-slate-900/50 text-xs">
                              {rel.apoioOutroDepartamento && (rel.departamentosApoio || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-cyan-400 font-bold flex items-center space-x-1 mr-1">
                                    <Building className="w-3.5 h-3.5" />
                                    <span>Apoio a outro(s) departamento(s):</span>
                                  </span>
                                  {(rel.departamentosApoio || []).map(dept => (
                                    <span
                                      key={dept}
                                      className="px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 font-semibold"
                                    >
                                      {dept}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {(rel.viaturas || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-cyan-400 font-bold flex items-center space-x-1 mr-1">
                                    <Car className="w-3.5 h-3.5" />
                                    <span>Viaturas:</span>
                                  </span>
                                  {(rel.viaturas || []).map(v => (
                                    <span
                                      key={v.id}
                                      className="px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 font-semibold"
                                    >
                                      <span className="font-mono font-black text-amber-300">{v.placa}</span> • {v.descricao}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {rel.materialEncontrado && (rel.materiaisEncontrados || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-emerald-400 font-bold flex items-center space-x-1 mr-1">
                                    <Package className="w-3.5 h-3.5" />
                                    <span>Materiais Encontrados:</span>
                                  </span>
                                  {rel.materiaisEncontrados.map(m => (
                                    <span
                                      key={m.tipo}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 font-semibold"
                                    >
                                      {m.tipo} — Cão(s): {(m.cachorros || []).map(c => c.nome).join(', ') || '-'}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex flex-wrap gap-1.5 text-[11px]">
                                <span className="text-slate-400 font-semibold mr-1">Operadores & Animais:</span>
                                {(rel.operadores || []).map(op => (
                                  <span
                                    key={op.userId}
                                    className="px-2 py-0.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-300"
                                  >
                                    <strong className="text-slate-100">{op.name}</strong>:{' '}
                                    <span className="text-amber-300">
                                      {op.cachorros && op.cachorros.length > 0
                                        ? op.cachorros.map(c => c.nome).join(', ')
                                        : 'Sem animal'}
                                    </span>
                                  </span>
                                ))}
                              </div>

                              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-slate-200 whitespace-pre-wrap">
                                {rel.detalhamento}
                              </div>
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

          {/* SEÇÃO: RELATÓRIOS DE TREINAMENTO DA UNIDADE (INICIA OCULTA) */}
          {(unidadeTipoFilter === 'TREINAMENTO' || unidadeTipoFilter === 'TODOS') && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-visible shadow-lg">
              <button
                type="button"
                onClick={() => setUnidadeTreinamentosSectionOpen(v => !v)}
                className={`w-full px-4 py-3.5 bg-slate-950/70 hover:bg-slate-950 transition flex items-center justify-between gap-3 text-left ${
                  unidadeTreinamentosSectionOpen ? 'rounded-t-2xl' : 'rounded-2xl'
                }`}
              >
                <span className="text-xs font-black text-amber-300 uppercase font-mono flex items-center space-x-2">
                  {unidadeTreinamentosSectionOpen ? (
                    <ChevronDown className="w-4 h-4 text-amber-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                  )}
                  <PenTool className="w-4 h-4" />
                  <span>Relatórios de Treinamento da Unidade ({filteredUnidadeReports.length})</span>
                </span>
                <span className="text-[11px] font-bold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                  {unidadeTreinamentosSectionOpen ? 'Ocultar' : 'Abrir'}
                </span>
              </button>

              {unidadeTreinamentosSectionOpen && (
                <div className="p-3.5 sm:p-4 border-t border-slate-800 space-y-2.5">
                  {filteredUnidadeReports.length === 0 ? (
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                      Nenhum relatório de treinamento da unidade encontrado com os filtros aplicados.
                    </div>
                  ) : (
                    filteredUnidadeReports.map(rel => {
                      const isItemOpen = Boolean(expandedReportIds[`unid-tr-${rel.id}`]);
                      const isColetivo = rel.modalidadeParticipacao === 'Coletivo';
                      const allDogs = getRelatorioAllDogs(rel);
                      const condutorDogs = getRelatorioCondutorDogs(rel);
                      const allSignerNames = getRelatorioAllSignerNames(rel);
                      return (
                        <div
                          key={rel.id}
                          className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-visible"
                        >
                          <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpandedReport(`unid-tr-${rel.id}`)}
                              className="flex-1 text-left flex items-start space-x-2.5 min-w-0 group"
                            >
                              <span className="mt-0.5 text-slate-400 group-hover:text-amber-400 transition shrink-0">
                                {isItemOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-amber-400 text-xs">
                                    {formatDateBr(rel.dataTreinamento)}
                                  </span>
                                  <span className="font-bold text-slate-100 text-xs flex items-center space-x-1">
                                    <Dog className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span>{allDogs.length > 0 ? allDogs.map(d => d.nome).join(', ') : 'Sem cachorro'}</span>
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      rel.modalidadeLocal === 'Interno'
                                        ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                        : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                    }`}
                                  >
                                    {rel.modalidadeLocal}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      rel.modalidadeParticipacao === 'Sozinho'
                                        ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                        : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                    }`}
                                  >
                                    {rel.modalidadeParticipacao}
                                  </span>
                                </div>
                                {isColetivo ? (
                                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1">
                                    <span>
                                      Condutor digitador: <strong className="text-slate-200">{rel.condutorNome}</strong>
                                      {rel.condutorMasp ? ` (MASP: ${formatMasp(rel.condutorMasp)})` : ''} e
                                    </span>
                                    <span
                                      className="relative inline-block group/outros"
                                      title={allSignerNames.join('\n')}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold uppercase text-[10px] cursor-help underline decoration-dotted underline-offset-2">
                                        OUTROS
                                      </span>
                                      <div className="hidden group-hover/outros:block absolute left-0 bottom-full mb-1.5 z-50 w-64 p-2.5 rounded-xl bg-slate-950 border border-cyan-500/40 shadow-2xl text-[11px] text-slate-200 pointer-events-none">
                                        <p className="text-[10px] font-black uppercase text-cyan-300 mb-1 border-b border-slate-800 pb-1">
                                          Usuários que assinam ({allSignerNames.length})
                                        </p>
                                        <ul className="space-y-0.5">
                                          {allSignerNames.map((nome, idx) => (
                                            <li key={`${rel.id}-unid-signer-${idx}`} className="truncate">
                                              • {nome}{idx === 0 ? ' (Digitador)' : ''}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </span>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-slate-400">
                                    Condutor: <strong className="text-slate-200">{rel.condutorNome}</strong>
                                    {rel.condutorMasp ? ` (MASP: ${formatMasp(rel.condutorMasp)})` : ''}
                                  </p>
                                )}
                              </div>
                            </button>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleExpandedReport(`unid-tr-${rel.id}`)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px] font-semibold transition"
                              >
                                {isItemOpen ? 'Recolher' : 'Abrir'}
                              </button>
                              {canEditRelatorioTreinamento(rel) && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditTreinamento(rel)}
                                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                                  title="Editar relatório (disponível ao longo do dia de hoje)"
                                >
                                  <Edit className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingTreinoReport(rel)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold transition"
                              >
                                Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintRelatorioTreinamento(rel)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Imprimir</span>
                              </button>
                            </div>
                          </div>

                          {isItemOpen && (
                            <div className="px-4 pb-4 pt-3 border-t border-slate-800/80 space-y-3 bg-slate-900/50 text-xs rounded-b-xl">
                              {(rel.topicosTreinamento || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="text-amber-400 font-bold flex items-center space-x-1 mr-1">
                                    <Tag className="w-3.5 h-3.5" />
                                    <span>Tópicos ({(rel.topicosTreinamento || []).length}):</span>
                                  </span>
                                  {(rel.topicosTreinamento || []).map(t => (
                                    <span
                                      key={t.topico}
                                      className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 font-semibold"
                                    >
                                      <strong>{t.topico}</strong> —{' '}
                                      {t.aplicarTodosK9
                                        ? `Todos os K9 (${(t.cachorros || []).map(c => c.nome).join(', ') || 'Todos'})`
                                        : (t.cachorros || []).map(c => c.nome).join(', ')}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-slate-200 whitespace-pre-wrap">
                                {rel.descricao}
                              </div>

                              {isColetivo && (
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="text-slate-400 font-semibold mr-1">
                                    Participantes ({1 + (rel.participantes || []).length}):
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-lg border ${
                                      rel.condutorAssinado
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                        : 'bg-slate-950 border-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {rel.condutorNome} (Digitador):{' '}
                                    <span className="text-amber-300">
                                      {condutorDogs.length > 0
                                        ? condutorDogs.map(c => c.nome).join(', ')
                                        : 'Sem cachorro'}
                                    </span>{' '}
                                    {rel.condutorAssinado ? '✓ Assinado' : '• Pendente'}
                                  </span>
                                  {(rel.participantes || []).map(p => (
                                    <span
                                      key={p.userId}
                                      className={`px-2 py-0.5 rounded-lg border ${
                                        p.signed
                                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                          : 'bg-slate-950 border-slate-800 text-slate-400'
                                      }`}
                                    >
                                      {p.name}:{' '}
                                      <span className="text-amber-300">
                                        {p.cachorros && p.cachorros.length > 0
                                          ? p.cachorros.map(c => c.nome).join(', ')
                                          : 'Sem cachorro'}
                                      </span>{' '}
                                      {p.signed ? '✓ Assinado' : '• Pendente'}
                                    </span>
                                  ))}
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
        </div>
      )}

      {/* MODAL: DETALHES DO RELATÓRIO DE TREINAMENTO */}
      {viewingTreinoReport && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto my-auto text-xs">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Dog className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-slate-100 font-mono text-sm uppercase">
                  Relatório de Treinamento • {formatDateBr(viewingTreinoReport.dataTreinamento)}
                </h3>
              </div>
              <button
                onClick={() => setViewingTreinoReport(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {viewingTreinoReport.modalidadeParticipacao !== 'Coletivo' && (
                  <>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Condutor</span>
                      <p className="font-bold text-slate-100 text-sm">{viewingTreinoReport.condutorNome}</p>
                      {viewingTreinoReport.condutorMasp && (
                        <p className="font-mono text-slate-400">MASP: {formatMasp(viewingTreinoReport.condutorMasp)}</p>
                      )}
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">
                        {getRelatorioCondutorDogs(viewingTreinoReport).length > 1 ? 'Cães Policiais K9' : 'Cão Policial K9'}
                      </span>
                      <div className="space-y-1 mt-0.5">
                        {getRelatorioCondutorDogs(viewingTreinoReport).map(dog => (
                          <div key={dog.id}>
                            <p className="font-bold text-slate-100 text-sm">{dog.nome}</p>
                            <p className="text-slate-400">
                              {dog.raca || 'K9'}
                              {dog.microchip ? ` • Chip: ${dog.microchip}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Local</span>
                  <p className="font-bold text-slate-100">{viewingTreinoReport.modalidadeLocal}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Participação</span>
                  <p className="font-bold text-slate-100">{viewingTreinoReport.modalidadeParticipacao}</p>
                </div>
              </div>

              {(viewingTreinoReport.topicosTreinamento || []).length > 0 && (
                <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] text-amber-400 uppercase font-bold flex items-center space-x-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Tópicos de Treinamento Realizados ({(viewingTreinoReport.topicosTreinamento || []).length})</span>
                  </span>
                  <div className="space-y-1.5">
                    {(viewingTreinoReport.topicosTreinamento || []).map(t => (
                      <div
                        key={t.topico}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="font-bold text-amber-300">{t.topico}</span>
                        <span className="text-slate-200 font-semibold">
                          {t.aplicarTodosK9
                            ? `Todos os K9 (${(t.cachorros || []).map(c => c.nome).join(', ') || 'Todos'})`
                            : `K9: ${(t.cachorros || []).map(c => c.nome).join(', ') || '-'}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Descrição do Treinamento do Dia
                </span>
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{viewingTreinoReport.descricao}</p>
              </div>

              {viewingTreinoReport.modalidadeParticipacao === 'Coletivo' && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    Participantes para Assinatura ({1 + (viewingTreinoReport.participantes || []).length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-200">{viewingTreinoReport.condutorNome}</p>
                        {viewingTreinoReport.condutorMasp && (
                          <p className="text-[10px] font-mono text-slate-400">
                            MASP: {formatMasp(viewingTreinoReport.condutorMasp)}
                          </p>
                        )}
                        <p className="text-[10px] text-amber-300 mt-0.5">
                          {getRelatorioCondutorDogs(viewingTreinoReport).length > 0
                            ? `Cão(s): ${getRelatorioCondutorDogs(viewingTreinoReport).map(c => c.nome).join(', ')}`
                            : 'Sem cachorro'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            viewingTreinoReport.condutorAssinado
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {viewingTreinoReport.condutorAssinado ? 'Assinado' : 'Pendente'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                          Digitador
                        </span>
                      </div>
                    </div>
                    {(viewingTreinoReport.participantes || []).map(p => (
                      <div key={p.userId} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-200">{p.name}</p>
                          {p.masp && <p className="text-[10px] font-mono text-slate-400">MASP: {formatMasp(p.masp)}</p>}
                          <p className="text-[10px] text-amber-300 mt-0.5">
                            {p.cachorros && p.cachorros.length > 0
                              ? `Cão(s): ${p.cachorros.map(c => c.nome).join(', ')}`
                              : 'Sem cachorro'}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                            p.signed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {p.signed ? 'Assinado' : 'Pendente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setViewingTreinoReport(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Fechar
                </button>
                {canEditRelatorioTreinamento(viewingTreinoReport) && (
                  <button
                    onClick={() => handleStartEditTreinamento(viewingTreinoReport)}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center space-x-1.5 transition"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Editar Relatório</span>
                  </button>
                )}
                <button
                  onClick={() => handlePrintRelatorioTreinamento(viewingTreinoReport)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center space-x-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES DO RELATÓRIO DE OPERAÇÃO */}
      {viewingOperacaoReport && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto my-auto text-xs">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-slate-100 font-mono text-sm uppercase">
                  Relatório de Operação • {viewingOperacaoReport.comarca}/{viewingOperacaoReport.estadoOperacao || 'MG'} ({formatDateBr(viewingOperacaoReport.dataOperacao)} às {viewingOperacaoReport.horaOperacao})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingOperacaoReport(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Data e Hora</span>
                  <p className="font-bold text-slate-100 font-mono text-sm">
                    {formatDateBr(viewingOperacaoReport.dataOperacao)} às {viewingOperacaoReport.horaOperacao}
                  </p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Estado / Comarca</span>
                  <p className="font-bold text-slate-100 text-sm">
                    {viewingOperacaoReport.comarca} / {viewingOperacaoReport.estadoOperacao || 'MG'}
                  </p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Solicitação</span>
                  <p className="font-bold text-slate-100">
                    {viewingOperacaoReport.solicitacaoTipo}
                    {viewingOperacaoReport.solicitacaoTipo === 'Outros' && viewingOperacaoReport.solicitacaoOutrosDetalhes
                      ? ` — ${viewingOperacaoReport.solicitacaoOutrosDetalhes}`
                      : ''}
                  </p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Material Encontrado?</span>
                  <p className={`font-bold ${viewingOperacaoReport.materialEncontrado ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {viewingOperacaoReport.materialEncontrado ? 'SIM' : 'NÃO'}
                  </p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:col-span-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Apoio a Outro Departamento?</span>
                  {viewingOperacaoReport.apoioOutroDepartamento && (viewingOperacaoReport.departamentosApoio || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(viewingOperacaoReport.departamentosApoio || []).map(dept => (
                        <span
                          key={dept}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-[11px] font-semibold"
                        >
                          {dept}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="font-bold text-slate-300">NÃO</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] text-cyan-400 uppercase font-bold flex items-center space-x-1.5">
                  <Car className="w-3.5 h-3.5" />
                  <span>Viaturas Utilizadas ({(viewingOperacaoReport.viaturas || []).length})</span>
                </span>
                {(viewingOperacaoReport.viaturas || []).length === 0 ? (
                  <p className="text-slate-500 italic text-[11px]">Nenhuma viatura informada nesta operação.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(viewingOperacaoReport.viaturas || []).map(v => (
                      <span
                        key={v.id}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-500/30 text-slate-200 text-xs font-semibold"
                      >
                        <strong className="font-mono text-amber-300">{v.placa}</strong> • {v.descricao}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {viewingOperacaoReport.materialEncontrado && (viewingOperacaoReport.materiaisEncontrados || []).length > 0 && (
                <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] text-emerald-400 uppercase font-bold block">
                    Materiais Encontrados e Animais Responsáveis
                  </span>
                  <div className="space-y-2">
                    {viewingOperacaoReport.materiaisEncontrados.map(m => (
                      <div key={m.tipo} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-emerald-300">{m.tipo}</span>
                        <span className="text-amber-300 font-semibold">
                          Animal(is): {(m.cachorros || []).map(c => c.nome).join(', ') || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Operadores da Operação ({(viewingOperacaoReport.operadores || []).length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(viewingOperacaoReport.operadores || []).map(op => (
                    <div key={op.userId} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                      <p className="font-bold text-slate-100">
                        {op.name}
                        {op.isCreator ? ' (Relator)' : ''}
                      </p>
                      {op.masp && <p className="text-[10px] font-mono text-slate-400">MASP: {formatMasp(op.masp)}</p>}
                      <p className="text-[10px] text-amber-300 mt-0.5">
                        {op.cachorros && op.cachorros.length > 0
                          ? `Animal(is): ${op.cachorros.map(c => c.nome).join(', ')}`
                          : 'Sem animal'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Detalhamento da Operação
                </span>
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{viewingOperacaoReport.detalhamento}</p>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewingOperacaoReport(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Fechar
                </button>
                {canEditOrDeleteOperacao(viewingOperacaoReport) && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDeleteOperacao(viewingOperacaoReport)}
                      className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 font-bold rounded-xl flex items-center space-x-1.5 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditOperacao(viewingOperacaoReport)}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl flex items-center space-x-1.5 transition"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Editar Relatório</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handlePrintRelatorioOperacao(viewingOperacaoReport)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center space-x-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Gerenciar Tópicos de Treinamento K9 (Administrador COE / Geral) */}
      {showManageTopicosModal && canManageTopicosTreinamento && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-amber-300 uppercase flex items-center space-x-2">
                  <Settings className="w-4 h-4" />
                  <span>Gerenciar Tópicos de Treinamento K9</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Alterações atualizam imediatamente o formulário de treinamento e os gráficos da guia ANIMAIS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageTopicosModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={handleCreateTopico} className="flex gap-2">
                <input
                  type="text"
                  value={newTopicoNome}
                  onChange={e => setNewTopicoNome(e.target.value)}
                  maxLength={80}
                  placeholder="Novo tópico (ex: PISTA DE OBSTÁCULOS)..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 uppercase placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={topicoBusy || !newTopicoNome.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center space-x-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Inserir</span>
                </button>
              </form>

              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {topicosConfig.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Nenhum tópico carregado do banco. Insira um novo tópico ou atualize a página.
                  </p>
                ) : (
                  topicosConfig.map(item => {
                    const isEditing = editingTopicoId === item.id;
                    const isConfirmDelete = confirmDeleteTopicoId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editingTopicoNome}
                              onChange={e => setEditingTopicoNome(e.target.value)}
                              maxLength={80}
                              className="flex-1 bg-slate-900 border border-amber-500/60 rounded-lg px-2.5 py-1 text-xs text-slate-100 uppercase focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={topicoBusy}
                              onClick={() => handleUpdateTopico(item)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Salvar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTopicoId(null);
                                setEditingTopicoNome('');
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-slate-100 uppercase tracking-wide">{item.nome}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isConfirmDelete ? (
                                <>
                                  <span className="text-[11px] text-red-300 font-semibold mr-1">Confirmar exclusão?</span>
                                  <button
                                    type="button"
                                    disabled={topicoBusy}
                                    onClick={() => handleDeleteTopico(item)}
                                    className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px]"
                                  >
                                    Excluir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTopicoId(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold text-[11px]"
                                  >
                                    Não
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmDeleteTopicoId(null);
                                      setEditingTopicoId(item.id);
                                      setEditingTopicoNome(item.nome);
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition"
                                    title="Editar tópico"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTopicoId(null);
                                      setConfirmDeleteTopicoId(item.id);
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400 transition"
                                    title="Excluir tópico"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowManageTopicosModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
