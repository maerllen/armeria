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
  ParticipacaoTreinamentoCanil
} from '../types';
import { storage } from '../services/storage';
import { formatMasp } from '../utils/masks';
import { buildStandardDocumentTitle, printDocumentInPage, escapeHtmlText } from '../utils/printHelper';
import { TopLayerAlert } from './TopLayerAlert';
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
  MapPin
} from 'lucide-react';

interface RelatorioTreinamentoCanilPanelProps {
  currentUser: User;
  departments: Department[];
  units: Unit[];
  allUsers: User[];
  onRefresh?: () => void;
  dataVersion?: number;
}

type CanilTrainingTab = 'relatorio-treinamento' | 'meus-relatorios' | 'relatorio-unidade';

export const RelatorioTreinamentoCanilPanel: React.FC<RelatorioTreinamentoCanilPanelProps> = ({
  currentUser,
  departments,
  units,
  allUsers,
  onRefresh,
  dataVersion = 0
}) => {
  const [activeTab, setActiveTab] = useState<CanilTrainingTab>('relatorio-treinamento');
  const [localVersion, setLocalVersion] = useState(0);

  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const canVerRelatoriosTodasEquipes = isGeral || Boolean(currentUser.canViewAllCanilReports);

  // Storage collections
  const cachorros = useMemo(() => storage.getCachorros(), [dataVersion, localVersion]);
  const relatoriosTreinamento = useMemo(
    () => storage.getRelatoriosTreinamentoCanil(),
    [dataVersion, localVersion]
  );

  const triggerRefresh = () => {
    setLocalVersion(v => v + 1);
    if (onRefresh) onRefresh();
  };

  // Messages & Loading state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const notifyError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 6000);
  };

  // Relatório de Treinamento state
  const getTodayIsoBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [treinoForm, setTreinoForm] = useState<{
    dataTreinamento: string;
    cachorros: ParticipanteTreinamentoCachorro[];
    modalidadeLocal: LocalTreinamentoCanil;
    modalidadeParticipacao: ParticipacaoTreinamentoCanil;
    descricao: string;
    participantes: ParticipanteTreinamentoCanil[];
  }>({
    dataTreinamento: getTodayIsoBr(),
    cachorros: [],
    modalidadeLocal: 'Interno',
    modalidadeParticipacao: 'Sozinho',
    descricao: '',
    participantes: []
  });
  const [hasUserChangedMainDog, setHasUserChangedMainDog] = useState(false);
  const [editingTreinoReport, setEditingTreinoReport] = useState<RelatorioTreinamentoCanil | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
  const [meusRelFilter, setMeusRelFilter] = useState<'TODOS' | 'CRIADOS' | 'CONJUNTOS_ASSINADOS' | 'PENDENTES'>('TODOS');
  const [unidadeFilterDataInicio, setUnidadeFilterDataInicio] = useState('');
  const [unidadeFilterDataFim, setUnidadeFilterDataFim] = useState('');
  const [unidadeFilterPolicialId, setUnidadeFilterPolicialId] = useState('');
  const [unidadeFilterCachorroId, setUnidadeFilterCachorroId] = useState('');
  const [unidadeFilterLocal, setUnidadeFilterLocal] = useState<'TODOS' | 'Interno' | 'Externo'>('TODOS');
  const [unidadeFilterUnitId, setUnidadeFilterUnitId] = useState<string>('');
  const [viewingTreinoReport, setViewingTreinoReport] = useState<RelatorioTreinamentoCanil | null>(null);

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
      }))
    });
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
      participantes: []
    });
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
        participantes: treinoForm.modalidadeParticipacao === 'Coletivo' ? treinoForm.participantes : []
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
        departmentId: currentUser.departmentId || primaryDogRecord?.departmentId || '',
        unitId: currentUser.unitId || primaryDogRecord?.unitId || ''
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
      participantes: []
    });
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
    for (const u of allUsers) {
      if ((!currentUser?.unitId || canVerRelatoriosTodasEquipes || u.unitId === currentUser.unitId) && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name, masp: u.masp || '' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [unitScopedReports, allUsers, currentUser, canVerRelatoriosTodasEquipes]);

  const filteredUnidadeReports = useMemo(() => {
    return unitScopedReports.filter(r => {
      if (unidadeFilterDataInicio && r.dataTreinamento < unidadeFilterDataInicio) return false;
      if (unidadeFilterDataFim && r.dataTreinamento > unidadeFilterDataFim) return false;
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
    unitScopedReports,
    unidadeFilterDataInicio,
    unidadeFilterDataFim,
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
    const condutorDogs = getRelatorioCondutorDogs(rel);
    const dogsTitleText = condutorDogs.map(c => c.nome).join(', ') || rel.cachorroNome;
    const docTitle = buildStandardDocumentTitle(
      'Relatório de Treinamento (Canil K9)',
      `${dogsTitleText} - ${formatDateBr(rel.dataTreinamento)}`,
      rel.condutorNome
    );

    const participantBoxesHtml = isSozinho
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
            <div class="sig-meta">${rel.condutorMasp ? `MASP: ${escapeHtmlText(formatMasp(rel.condutorMasp))}` : ''}</div>
            <div class="sig-role">Condutor Responsável</div>
          </div>
          ${(rel.participantes || []).slice(0, 15).map((p, idx) => {
            const dogsText = (p.cachorros && p.cachorros.length > 0)
              ? p.cachorros.map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}`).join(', ')
              : 'Sem cachorro';
            return `
            <div class="sig-box">
              ${p.signed ? `<div class="sig-digital">Assinado eletronicamente${p.signedAt ? ` em ${escapeHtmlText(new Date(p.signedAt).toLocaleString('pt-BR'))}` : ''}</div>` : '<div class="sig-space"></div>'}
              <div class="sig-line">${escapeHtmlText(p.name)}</div>
              <div class="sig-meta">${p.masp ? `MASP: ${escapeHtmlText(formatMasp(p.masp))}` : ''} ${p.cargo ? `• ${escapeHtmlText(p.cargo)}` : ''}</div>
              <div class="sig-role">Participante ${idx + 1} • Cão(s): ${escapeHtmlText(dogsText)}</div>
            </div>
          `;
          }).join('')}
        </div>
      `;

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
        <span class="val">${escapeHtmlText(rel.modalidadeParticipacao)}${!isSozinho ? ` (${1 + (rel.participantes?.length || 0)} participantes)` : ''}</span>
      </td>
      <td>
        <span class="lbl">${condutorDogs.length > 1 ? 'Microchips' : 'Microchip'}</span>
        <span class="val" style="font-family: monospace;">${escapeHtmlText(condutorDogs.map(c => c.microchip).filter(Boolean).join(', ') || 'N/A')}</span>
      </td>
    </tr>
  </table>

  <div class="desc-box">
    <div class="desc-title">Descrição do Treinamento do Dia</div>
    <div class="desc-text">${escapeHtmlText(rel.descricao)}</div>
  </div>

  <div class="sig-section-title">Assinaturas</div>
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
            return `
            <tr>
              <td style="font-family: monospace; white-space: nowrap;">${escapeHtmlText(formatDateBr(r.dataTreinamento))}</td>
              <td><strong>${escapeHtmlText(r.condutorNome)}</strong>${r.condutorMasp ? `<br/><span style="font-size:9px; color:#475569;">MASP: ${escapeHtmlText(formatMasp(r.condutorMasp))}</span>` : ''}</td>
              <td>${condutorDogsHtml}${participantsSummary}</td>
              <td>${escapeHtmlText(r.modalidadeLocal)}</td>
              <td>${escapeHtmlText(r.modalidadeParticipacao)}${r.modalidadeParticipacao === 'Coletivo' ? `<br/><span style="font-size:9px; color:#475569;">+${(r.participantes || []).length} policial(is)</span>` : ''}</td>
              <td style="white-space: pre-wrap; word-break: break-word;">${escapeHtmlText(r.descricao)}</td>
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

  return (
    <div className="space-y-5">
      {/* Notifications */}
      <TopLayerAlert type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />
      <TopLayerAlert type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />

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
          onClick={() => setActiveTab('meus-relatorios')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
            activeTab === 'meus-relatorios'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>MEUS RELATÓRIOS ({meusRelatoriosList.length})</span>
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
            <span>RELATÓRIOS DA UNIDADE ({unitScopedReports.length})</span>
          </button>
        )}
      </div>

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
                      Relatórios criados ou assinados por você hoje podem ser modificados ao longo do dia.
                    </p>
                  </div>
                </div>
                {editingTreinoReport && (
                  <button
                    type="button"
                    onClick={handleCancelEditTreinamento}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 border border-slate-700 transition self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Novo Relatório</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                {editableTodayReports.map(rel => {
                  const isBeingEdited = editingTreinoReport?.id === rel.id;
                  const isCreator = rel.condutorId === currentUser?.id;
                  const dogsText = getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ');
                  return (
                    <div
                      key={rel.id}
                      className={`rounded-xl p-3 border flex items-center justify-between gap-3 transition ${
                        isBeingEdited
                          ? 'bg-cyan-500/10 border-cyan-400/60'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
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
                      </div>
                      <button
                        type="button"
                        onClick={() => (isBeingEdited ? handleCancelEditTreinamento() : handleStartEditTreinamento(rel))}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center space-x-1 shrink-0 transition ${
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-100 uppercase font-mono flex items-center space-x-2">
                <ClipboardList className="w-4 h-4 text-amber-400" />
                <span>Meus Relatórios de Treinamento</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Relatórios criados por você ou treinamentos conjuntos em que outros condutores o incluíram para assinatura.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: 'TODOS', label: 'Todos' },
                { key: 'CRIADOS', label: 'Criados por Mim' },
                { key: 'CONJUNTOS_ASSINADOS', label: 'Conjuntos Assinados' },
                { key: 'PENDENTES', label: `Pendentes (${myPendingSignCount})` }
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setMeusRelFilter(opt.key as any)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition border ${
                    meusRelFilter === opt.key
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {meusRelatoriosList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-xs">
              Nenhum relatório de treinamento encontrado para este filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {meusRelatoriosList.map(rel => {
                const isCreator = rel.condutorId === currentUser?.id;
                const myParticipantEntry = (rel.participantes || []).find(p => p.userId === currentUser?.id);
                const needsMySignature = !isCreator && Boolean(myParticipantEntry && !myParticipantEntry.signed);
                const iSignedJoint = !isCreator && Boolean(myParticipantEntry?.signed);

                return (
                  <div
                    key={rel.id}
                    className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 space-y-3 ${
                      needsMySignature ? 'border-amber-500/60' : 'border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded bg-slate-950 border border-slate-700 font-mono font-bold text-xs text-amber-400">
                            {formatDateBr(rel.dataTreinamento)}
                          </span>
                          <span className="font-black text-slate-100 text-sm flex items-center space-x-1.5">
                            <Dog className="w-4 h-4 text-amber-400" />
                            <span>{getRelatorioCondutorDogs(rel).map(c => c.nome).join(', ')}</span>
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
                              Autor / Condutor
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
                        <p className="text-xs text-slate-400">
                          Condutor: <strong className="text-slate-200">{rel.condutorNome}</strong>
                          {rel.condutorMasp ? ` (MASP: ${formatMasp(rel.condutorMasp)})` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {needsMySignature && (
                          <button
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
                          onClick={() => setViewingTreinoReport(rel)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition"
                        >
                          Visualizar
                        </button>
                        <button
                          onClick={() => handlePrintRelatorioTreinamento(rel)}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Imprimir</span>
                        </button>
                        {(isCreator || isGeral) && (
                          <button
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

                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 whitespace-pre-wrap">
                      {rel.descricao}
                    </div>

                    {rel.modalidadeParticipacao === 'Coletivo' && (rel.participantes || []).length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-semibold mr-1">Participantes ({rel.participantes.length}):</span>
                        {rel.participantes.map(p => (
                          <span
                            key={p.userId}
                            className={`px-2 py-0.5 rounded-lg border ${
                              p.signed
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400'
                            }`}
                          >
                            {p.name}
                            {p.cachorros && p.cachorros.length > 0
                              ? ` • Cão(s): ${p.cachorros.map(c => c.nome).join(', ')}`
                              : ' • Sem cachorro'}{' '}
                            {p.signed ? '✓ Assinado' : '• Pendente'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                  <span>Relatório de Treinamentos da Unidade</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consulte e filtre todos os relatórios de treinamento da unidade por data, policial, cachorro ou local.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setUnidadeFilterDataInicio('');
                    setUnidadeFilterDataFim('');
                    setUnidadeFilterPolicialId('');
                    setUnidadeFilterCachorroId('');
                    setUnidadeFilterLocal('TODOS');
                    setUnidadeFilterUnitId('');
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
                >
                  Limpar Filtros
                </button>
                <button
                  onClick={handlePrintRelatorioUnidadeConsolidado}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório da Unidade</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs pt-2 border-t border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unidade / Equipe</label>
                <select
                  value={unidadeFilterUnitId}
                  onChange={(e) => setUnidadeFilterUnitId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todas as Unidades / Equipes</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

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
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Policial (Condutor / Participante)</label>
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cachorro K9</label>
                <select
                  value={unidadeFilterCachorroId}
                  onChange={(e) => setUnidadeFilterCachorroId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Cães</option>
                  {cachorros.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nome} ({d.raca})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Interno ou Externo</label>
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
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-slate-400 uppercase">Relatórios Filtrados</span>
                <p className="text-lg font-black text-slate-100">{filteredUnidadeReports.length}</p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-blue-400 uppercase">Internos</span>
                <p className="text-lg font-black text-blue-400">
                  {filteredUnidadeReports.filter(r => r.modalidadeLocal === 'Interno').length}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-purple-400 uppercase">Externos</span>
                <p className="text-lg font-black text-purple-400">
                  {filteredUnidadeReports.filter(r => r.modalidadeLocal === 'Externo').length}
                </p>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-sans text-cyan-400 uppercase">Coletivos</span>
                <p className="text-lg font-black text-cyan-400">
                  {filteredUnidadeReports.filter(r => r.modalidadeParticipacao === 'Coletivo').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5">Condutor</th>
                    <th className="p-3.5">Cachorro K9</th>
                    <th className="p-3.5">Local</th>
                    <th className="p-3.5">Participação</th>
                    <th className="p-3.5">Descrição do Treinamento</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredUnidadeReports.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-500">
                        Nenhum relatório de treinamento da unidade encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredUnidadeReports.map(rel => (
                      <tr key={rel.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3.5 font-mono font-bold text-amber-400 whitespace-nowrap">
                          {formatDateBr(rel.dataTreinamento)}
                        </td>
                        <td className="p-3.5">
                          <p className="font-bold text-slate-200">{rel.condutorNome}</p>
                          {rel.condutorMasp && (
                            <p className="text-[10px] font-mono text-slate-500">MASP: {formatMasp(rel.condutorMasp)}</p>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="space-y-0.5">
                            {getRelatorioCondutorDogs(rel).map(dog => (
                              <div key={dog.id}>
                                <p className="font-bold text-slate-100">{dog.nome}</p>
                                {dog.raca && <p className="text-[10px] text-slate-500">{dog.raca}</p>}
                              </div>
                            ))}
                          </div>
                          {rel.modalidadeParticipacao === 'Coletivo' && (rel.participantes || []).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {rel.participantes.map(p => (
                                <p key={p.userId} className="text-[10px] text-slate-400">
                                  • {p.name}:{' '}
                                  <span className="text-amber-300">
                                    {p.cachorros && p.cachorros.length > 0
                                      ? p.cachorros.map(c => c.nome).join(', ')
                                      : 'Sem cachorro'}
                                  </span>
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              rel.modalidadeLocal === 'Interno'
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {rel.modalidadeLocal}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              rel.modalidadeParticipacao === 'Sozinho'
                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            }`}
                          >
                            {rel.modalidadeParticipacao}
                          </span>
                          {rel.modalidadeParticipacao === 'Coletivo' && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              +{(rel.participantes || []).length} participante(s)
                            </p>
                          )}
                        </td>
                        <td className="p-3.5 max-w-md">
                          <p className="text-slate-300 line-clamp-2 whitespace-pre-wrap">{rel.descricao}</p>
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center space-x-1.5">
                            {canEditRelatorioTreinamento(rel) && (
                              <button
                                onClick={() => handleStartEditTreinamento(rel)}
                                className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                                title="Editar relatório (disponível ao longo do dia de hoje)"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Editar</span>
                              </button>
                            )}
                            <button
                              onClick={() => setViewingTreinoReport(rel)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold transition"
                            >
                              Ver
                            </button>
                            <button
                              onClick={() => handlePrintRelatorioTreinamento(rel)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-[11px] font-bold inline-flex items-center space-x-1 transition"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Imprimir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Local</span>
                  <p className="font-bold text-slate-100">{viewingTreinoReport.modalidadeLocal}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Participação</span>
                  <p className="font-bold text-slate-100">{viewingTreinoReport.modalidadeParticipacao}</p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  Descrição do Treinamento do Dia
                </span>
                <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{viewingTreinoReport.descricao}</p>
              </div>

              {viewingTreinoReport.modalidadeParticipacao === 'Coletivo' && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    Participantes para Assinatura ({viewingTreinoReport.participantes.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {viewingTreinoReport.participantes.map(p => (
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
    </div>
  );
};
