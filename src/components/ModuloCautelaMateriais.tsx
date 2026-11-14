import React, { useState, useMemo, useCallback } from 'react';
import {
  User,
  Material,
  CautelaMaterial,
  VaultSpace,
  Unit,
  Department,
  getSystemLogo,
  DEFAULT_SYSTEM_LOGO
} from '../types';
import { storage } from '../services/storage';
import {
  Package,
  Check,
  Clock,
  Search,
  Printer,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Eye,
  Flame,
  AlertTriangle,
  Lock,
  Shield,
  Vault,
  Calendar
} from 'lucide-react';
import { printDocumentInPage, buildStandardDocumentTitle, escapeHtmlText } from '../utils/printHelper';
import { TopLayerAlert } from './TopLayerAlert';

interface ModuloCautelaMateriaisProps {
  currentUser: User;
  vaultSpaces: VaultSpace[];
  units: Unit[];
  departments: Department[];
  onRefresh: () => void | Promise<void>;
}

type ActiveMaterialTab = 'MINHAS' | 'EM_ANALISE' | 'PENDENTES' | 'MEU_HISTORICO' | 'TODAS' | 'NOVA';

export const ModuloCautelaMateriais: React.FC<ModuloCautelaMateriaisProps> = ({
  currentUser,
  vaultSpaces,
  units,
  departments,
  onRefresh
}) => {
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isPolicial = effectiveRole === 'Policial';
  const isGeral = effectiveRole === 'Geral';
  const isArmeiro = effectiveRole === 'Armeiro';
  const isAdmin = effectiveRole === 'Administrador';
  const isDeptArmeiro = isArmeiro && currentUser.managementScope === 'department';
  const hasDeptWideScope = isGeral || isAdmin || isDeptArmeiro;
  const canAuthorize = !isPolicial && (isGeral || isArmeiro || isAdmin);

  const departmentUnits = useMemo(() => {
    const allUnits = storage.getAllUnits().length > 0 ? storage.getAllUnits() : units;
    if (isGeral) return allUnits;
    if (!currentUser.departmentId) return units;
    return allUnits.filter(u => u.departmentId === currentUser.departmentId);
  }, [units, isGeral, currentUser.departmentId]);

  const deptUnitIds = useMemo(() => new Set(departmentUnits.map(u => u.id)), [departmentUnits]);

  const userUnit = useMemo(() => {
    const allUnits = storage.getAllUnits();
    return (
      units.find(u => u.id === currentUser.unitId) ||
      allUnits.find(u => u.id === currentUser.unitId)
    );
  }, [units, currentUser.unitId]);

  const unitSigla = useMemo(() => {
    if (!userUnit) return 'COE';
    const explicitSigla = ((userUnit as any).sigla || (userUnit as any).code || '').trim();
    if (explicitSigla) return explicitSigla;
    const rawName = (userUnit.name || '').trim();
    if (!rawName) return 'COE';
    const parenMatch = rawName.match(/\(([A-Z0-9ªº/.-]{2,15})\)\s*$/);
    if (parenMatch) return parenMatch[1];
    const dashParts = rawName.split(/\s+[—\-]\s+/);
    if (dashParts.length >= 2 && dashParts[0].length <= 15) {
      return dashParts[0].trim();
    }
    return rawName;
  }, [userUnit]);

  const cleanDigits = useCallback((val?: string | null) => String(val || '').replace(/\D/g, ''), []);

  const isOwnCautela = useCallback(
    (c: CautelaMaterial): boolean => {
      if (c.usuarioInternoId && c.usuarioInternoId === currentUser.id) return true;
      const myMaspRaw = (currentUser.masp || '').trim().toLowerCase();
      const reqMaspRaw = (c.usuarioInternoMasp || '').trim().toLowerCase();
      if (myMaspRaw && reqMaspRaw && myMaspRaw === reqMaspRaw) return true;
      const myDigits = cleanDigits(currentUser.masp);
      const reqDigits = cleanDigits(c.usuarioInternoMasp);
      if (myDigits && reqDigits && myDigits === reqDigits) return true;
      return false;
    },
    [currentUser.id, currentUser.masp, cleanDigits]
  );

  const isActiveStatus = (st?: string) => st === 'AUTORIZADA' || st === 'Em Uso';
  const isReturnedStatus = (st?: string) =>
    st === 'DEVOLVIDA' || st === 'Devolvido' || st === 'Devolvido com Anomalia';
  const isConsumedStatus = (st?: string) => st === 'CONSUMIDA' || st === 'Consumido';

  const toPrintableLogoSrc = useCallback((rawLogo?: string | null): string => {
    const trimmed = (rawLogo || '').trim() || DEFAULT_SYSTEM_LOGO;
    if (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      /^https?:\/\//i.test(trimmed)
    ) {
      return trimmed;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        return new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, window.location.origin).href;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }, []);

  const resolvePrintBranding = useCallback(
    (cautela?: CautelaMaterial | null) => {
      const allUnits = storage.getAllUnits().length > 0 ? storage.getAllUnits() : units;
      const allDepts =
        storage.getAllDepartments().length > 0 ? storage.getAllDepartments() : departments;
      const allUsers = storage.getAllUsersForLookup();

      const vaultObj = cautela?.vaultSpaceId
        ? vaultSpaces.find(v => v.id === cautela.vaultSpaceId)
        : undefined;
      const reqUser = cautela?.usuarioInternoId
        ? allUsers.find(u => u.id === cautela.usuarioInternoId)
        : undefined;

      const candidateUnitIds = [
        cautela?.unidadeId,
        vaultObj?.unitId,
        currentUser.unitId,
        reqUser?.unitId
      ].filter(Boolean) as string[];

      let resolvedUnit: Unit | undefined;
      for (const uid of candidateUnitIds) {
        const found = allUnits.find(u => u.id === uid) || units.find(u => u.id === uid);
        if (found) {
          resolvedUnit = found;
          break;
        }
      }
      if (!resolvedUnit) {
        resolvedUnit = userUnit || (allUnits.length === 1 ? allUnits[0] : undefined);
      }

      const candidateDeptIds = [
        resolvedUnit?.departmentId,
        cautela?.departamentoId,
        currentUser.departmentId,
        reqUser?.departmentId
      ].filter(Boolean) as string[];

      let resolvedDept: Department | undefined;
      for (const did of candidateDeptIds) {
        const found = allDepts.find(d => d.id === did) || departments.find(d => d.id === did);
        if (found) {
          resolvedDept = found;
          break;
        }
      }

      const rawUnitLogo = getSystemLogo(resolvedUnit, resolvedDept);
      return {
        unitObj: resolvedUnit,
        deptObj: resolvedDept,
        logoSrc: toPrintableLogoSrc(rawUnitLogo),
        fallbackLogoSrc: toPrintableLogoSrc(DEFAULT_SYSTEM_LOGO)
      };
    },
    [units, departments, vaultSpaces, currentUser.unitId, currentUser.departmentId, userUnit, toPrintableLogoSrc]
  );

  // Estados de abas e filtros
  const [activeTab, setActiveTab] = useState<ActiveMaterialTab>('MINHAS');
  const [pendingSubFilter, setPendingSubFilter] = useState<'TODAS' | 'AGUARDANDO_PAGAMENTO' | 'AGUARDANDO_DEVOLUCAO'>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLUCAO_PENDENTE' | 'DEVOLVIDA' | 'CONSUMIDA' | 'RECUSADA'>('TODOS');
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Formulário de Nova Solicitação / Acautelamento
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [reqQuantity, setReqQuantity] = useState(1);
  const [reqSeraDevolvida, setReqSeraDevolvida] = useState(true);
  const [reqDataPrevistaDevolucao, setReqDataPrevistaDevolucao] = useState('');
  const [reqFinalidade, setReqFinalidade] = useState('Serviço Policial Operacional / Plantão');
  const [reqObservacoes, setReqObservacoes] = useState('');
  const [selectedRequesterId, setSelectedRequesterId] = useState(currentUser.id);
  const [requesterSearchTerm, setRequesterSearchTerm] = useState('');
  const [isDirectAuthorize, setIsDirectAuthorize] = useState(canAuthorize);

  // Modal de Autorização (Armeiro)
  const [authorizeModalItem, setAuthorizeModalItem] = useState<CautelaMaterial | null>(null);
  const [authMaterialId, setAuthMaterialId] = useState('');
  const [authQuantity, setAuthQuantity] = useState<number>(1);
  const [authSeraDevolvida, setAuthSeraDevolvida] = useState(true);
  const [authNotes, setAuthNotes] = useState('');

  // Modal de Recusa (Armeiro)
  const [rejectModalItem, setRejectModalItem] = useState<CautelaMaterial | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Modal de Devolução (Policial solicita devolução OU Armeiro confirma recebimento)
  const [returnModalItem, setReturnModalItem] = useState<CautelaMaterial | null>(null);
  const [returnedQty, setReturnedQty] = useState<number>(1);
  const [returnCondition, setReturnCondition] = useState<'Devolvido' | 'Devolvido com Anomalia' | 'Consumido'>('Devolvido');
  const [returnVaultId, setReturnVaultId] = useState('');
  const [returnRelato, setReturnRelato] = useState('');

  // Modal de Detalhes
  const [detailItem, setDetailItem] = useState<CautelaMaterial | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const triggerRefresh = async () => {
    await onRefresh();
    setRefreshTick(t => t + 1);
  };

  const allScopedMaterials = useMemo(
    () => storage.getMateriais(currentUser),
    [currentUser, vaultSpaces, refreshTick]
  );

  const materialsById = useMemo(
    () => new Map<string, Material>(allScopedMaterials.map(m => [m.id, m])),
    [allScopedMaterials]
  );

  // Materiais elegíveis para cautelas: APENAS passivoDepositoPoliciais !== false
  const eligibleMaterials = useMemo(() => {
    return allScopedMaterials.filter(m => {
      if (m.passivoDepositoPoliciais === false) return false;
      if (Number(m.quantidadeDisponivel || 0) <= 0) return false;
      if (isGeral) return true;
      if (hasDeptWideScope && !isPolicial) {
        return (
          m.departamentoId === currentUser.departmentId ||
          (m.unidadeId ? deptUnitIds.has(m.unidadeId) : false)
        );
      }
      return !m.unidadeId || m.unidadeId === currentUser.unitId;
    });
  }, [allScopedMaterials, currentUser, isGeral, hasDeptWideScope, isPolicial, deptUnitIds]);

  // Para solicitações (Policial ou não-direta), exibe apenas um item por Nome (omitindo repetidos e detalhes técnicos)
  const isSolicitationMode = isPolicial || !isDirectAuthorize;

  const dedupedMaterialsByName = useMemo(() => {
    const seen = new Set<string>();
    const unique: Material[] = [];
    const sorted = [...eligibleMaterials].sort((a, b) =>
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
    );
    for (const m of sorted) {
      const key = (m.nome || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(m);
    }
    return unique;
  }, [eligibleMaterials]);

  const filteredMaterialsForSelect = useMemo(() => {
    const term = materialSearchTerm.trim().toLowerCase();
    if (isSolicitationMode) {
      if (!term) return dedupedMaterialsByName;
      return dedupedMaterialsByName.filter(m =>
        (m.nome || '').toLowerCase().includes(term)
      );
    }
    if (!term) return eligibleMaterials;
    return eligibleMaterials.filter(m =>
      (m.nome || '').toLowerCase().includes(term) ||
      (m.tipoMaterialNome || '').toLowerCase().includes(term) ||
      (m.numeroSerie || '').toLowerCase().includes(term)
    );
  }, [eligibleMaterials, dedupedMaterialsByName, isSolicitationMode, materialSearchTerm]);

  const selectedMaterialObj = useMemo(
    () => eligibleMaterials.find(m => m.id === selectedMaterialId) || null,
    [eligibleMaterials, selectedMaterialId]
  );

  // Opções para o Armeiro especificar o material exato no modal de Confirmação de Pagamento
  const authMaterialGroups = useMemo(() => {
    if (!authorizeModalItem) {
      return { sameName: [] as Material[], others: [] as Material[] };
    }
    const reqName = (authorizeModalItem.materialNome || '').trim().toLowerCase();
    const sameName: Material[] = [];
    const others: Material[] = [];
    for (const m of eligibleMaterials) {
      if ((m.nome || '').trim().toLowerCase() === reqName) {
        sameName.push(m);
      } else {
        others.push(m);
      }
    }
    return { sameName, others };
  }, [authorizeModalItem, eligibleMaterials]);

  const selectedAuthMaterial = useMemo(
    () => eligibleMaterials.find(m => m.id === authMaterialId) || null,
    [eligibleMaterials, authMaterialId]
  );

  // Todas as cautelas de materiais visíveis para o usuário logado (apenas de materiais passíveis de depósito ou já registradas)
  const allCautelas = useMemo(() => {
    const list = storage.getCautelasMateriais(currentUser);
    return list.filter(c => {
      const mat = materialsById.get(c.materialId);
      if (mat && mat.passivoDepositoPoliciais === false) return false;
      return true;
    });
  }, [currentUser, materialsById, refreshTick]);

  // Cofres destinados exclusivamente à guarda de MATERIAIS
  const scopedMaterialVaults = useMemo(() => {
    const allVaults = storage.getVaultSpaces(currentUser);
    const base = (allVaults.length > 0 ? allVaults : vaultSpaces).filter(v => v.type === 'MATERIAIS');
    if (isGeral) return base;
    if (hasDeptWideScope) {
      return base.filter(
        v => v.departmentId === currentUser.departmentId || (v.unitId ? deptUnitIds.has(v.unitId) : false)
      );
    }
    return base.filter(v => v.unitId === currentUser.unitId);
  }, [vaultSpaces, currentUser, isGeral, hasDeptWideScope, deptUnitIds]);

  // 1. Minhas Cautelas Ativas Passivas de Devolução (Policial e Armeiro)
  const minhasCautelasAtivas = useMemo(() => {
    return allCautelas.filter(
      c => isOwnCautela(c) && isActiveStatus(c.status) && c.seraDevolvida !== false
    );
  }, [allCautelas, isOwnCautela]);

  // 2. Aba Policial: Cautela de material em análise (PENDENTE ou DEVOLUCAO_PENDENTE), sem busca/filtro
  const policialEmAnalise = useMemo(() => {
    return allCautelas.filter(
      c => isOwnCautela(c) && (c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE')
    );
  }, [allCautelas, isOwnCautela]);

  // 3. Aba Policial: Meu Histórico (Consumo ativas fixas no topo + Devolvidas/Consumidas/Recusadas)
  const policialMeuHistoricoBase = useMemo(() => {
    return allCautelas.filter(
      c =>
        isOwnCautela(c) &&
        ((isActiveStatus(c.status) && c.seraDevolvida === false) ||
          isReturnedStatus(c.status) ||
          isConsumedStatus(c.status) ||
          c.status === 'RECUSADA')
    );
  }, [allCautelas, isOwnCautela]);

  // 4. Aba Armeiro: Solicitações Pendentes <UNIDADE>
  const armeiroPendentesBase = useMemo(() => {
    if (!canAuthorize) return [];
    return allCautelas.filter(c => {
      if (c.status !== 'PENDENTE' && c.status !== 'DEVOLUCAO_PENDENTE') return false;
      if (isGeral) return true;
      if (hasDeptWideScope) {
        return (
          c.departamentoId === currentUser.departmentId ||
          (c.unidadeId ? deptUnitIds.has(c.unidadeId) : false)
        );
      }
      return c.unidadeId === currentUser.unitId;
    });
  }, [allCautelas, canAuthorize, isGeral, hasDeptWideScope, currentUser.departmentId, currentUser.unitId, deptUnitIds]);

  const countAguardandoPagamento = useMemo(
    () => armeiroPendentesBase.filter(c => c.status === 'PENDENTE').length,
    [armeiroPendentesBase]
  );

  const countAguardandoDevolucao = useMemo(
    () => armeiroPendentesBase.filter(c => c.status === 'DEVOLUCAO_PENDENTE').length,
    [armeiroPendentesBase]
  );

  // 5. Aba Armeiro: Meu Histórico
  const armeiroMeuHistoricoBase = useMemo(
    () => allCautelas.filter(c => isOwnCautela(c)),
    [allCautelas, isOwnCautela]
  );

  // 6. Aba Armeiro: Histórico Geral <SIGLA>
  const armeiroHistoricoGeralBase = useMemo(() => {
    if (!canAuthorize) return [];
    if (isGeral) return allCautelas;
    if (hasDeptWideScope && currentUser.departmentId) {
      return allCautelas.filter(
        c =>
          c.departamentoId === currentUser.departmentId ||
          (c.unidadeId ? deptUnitIds.has(c.unidadeId) : false)
      );
    }
    return allCautelas.filter(c => c.unidadeId === currentUser.unitId);
  }, [allCautelas, canAuthorize, isGeral, hasDeptWideScope, currentUser.departmentId, currentUser.unitId, deptUnitIds]);

  const matchesSearch = useCallback(
    (c: CautelaMaterial): boolean => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        (c.protocolo || '').toLowerCase().includes(term) ||
        (c.materialNome || '').toLowerCase().includes(term) ||
        (c.tipoMaterialNome || '').toLowerCase().includes(term) ||
        (c.usuarioInternoNome || '').toLowerCase().includes(term) ||
        (c.usuarioInternoMasp || '').toLowerCase().includes(term) ||
        (c.usuarioExternoNome || '').toLowerCase().includes(term) ||
        (c.finalidade || '').toLowerCase().includes(term)
      );
    },
    [searchTerm]
  );

  const filteredMinhasAtivas = useMemo(
    () => minhasCautelasAtivas.filter(matchesSearch),
    [minhasCautelasAtivas, matchesSearch]
  );

  const filteredPolicialAtivasConsumo = useMemo(
    () =>
      policialMeuHistoricoBase.filter(
        c => isActiveStatus(c.status) && c.seraDevolvida === false && matchesSearch(c)
      ),
    [policialMeuHistoricoBase, matchesSearch]
  );

  const filteredPolicialEncerradas = useMemo(
    () =>
      policialMeuHistoricoBase.filter(
        c =>
          (isReturnedStatus(c.status) || isConsumedStatus(c.status) || c.status === 'RECUSADA') &&
          matchesSearch(c)
      ),
    [policialMeuHistoricoBase, matchesSearch]
  );

  const filteredArmeiroPendentes = useMemo(() => {
    return armeiroPendentesBase.filter(c => {
      if (pendingSubFilter === 'AGUARDANDO_PAGAMENTO' && c.status !== 'PENDENTE') return false;
      if (pendingSubFilter === 'AGUARDANDO_DEVOLUCAO' && c.status !== 'DEVOLUCAO_PENDENTE') return false;
      return matchesSearch(c);
    });
  }, [armeiroPendentesBase, pendingSubFilter, matchesSearch]);

  const matchStatusFilter = useCallback(
    (c: CautelaMaterial): boolean => {
      if (statusFilter === 'TODOS') return true;
      if (statusFilter === 'AUTORIZADA') return isActiveStatus(c.status);
      if (statusFilter === 'DEVOLVIDA') return isReturnedStatus(c.status);
      if (statusFilter === 'CONSUMIDA') return isConsumedStatus(c.status);
      return c.status === statusFilter;
    },
    [statusFilter]
  );

  const filteredArmeiroMeuHistorico = useMemo(
    () => armeiroMeuHistoricoBase.filter(c => matchStatusFilter(c) && matchesSearch(c)),
    [armeiroMeuHistoricoBase, matchStatusFilter, matchesSearch]
  );

  const filteredArmeiroHistoricoGeral = useMemo(
    () => armeiroHistoricoGeralBase.filter(c => matchStatusFilter(c) && matchesSearch(c)),
    [armeiroHistoricoGeralBase, matchStatusFilter, matchesSearch]
  );

  const unitUsers = useMemo(() => {
    const all = storage.getAllUsersForLookup();
    if (isGeral) return all;
    if (hasDeptWideScope) {
      return all.filter(
        u => u.departmentId === currentUser.departmentId || (u.unitId ? deptUnitIds.has(u.unitId) : false)
      );
    }
    return all.filter(u => u.unitId === currentUser.unitId);
  }, [currentUser.departmentId, currentUser.unitId, isGeral, hasDeptWideScope, deptUnitIds]);

  const filteredUnitUsersForSelect = useMemo(() => {
    const term = requesterSearchTerm.trim().toLowerCase();
    const digits = cleanDigits(requesterSearchTerm);
    if (!term) return unitUsers;
    return unitUsers.filter(u => {
      if (u.id === selectedRequesterId) return true;
      const matchName = (u.name || '').toLowerCase().includes(term);
      const matchMasp =
        (u.masp || '').toLowerCase().includes(term) ||
        (digits.length > 0 && cleanDigits(u.masp).includes(digits));
      const matchCargo = (u.cargo || '').toLowerCase().includes(term);
      return matchName || matchMasp || matchCargo;
    });
  }, [unitUsers, requesterSearchTerm, selectedRequesterId, cleanDigits]);

  const getVaultLabel = useCallback(
    (vaultId?: string) => {
      if (!vaultId) return 'Cofre de Materiais da Unidade';
      const v =
        vaultSpaces.find(sp => sp.id === vaultId) ||
        storage.getVaultSpaces(currentUser).find(sp => sp.id === vaultId);
      if (!v) return 'Cofre de Materiais da Unidade';
      return v.descricaoCurta ? `${v.code} — ${v.descricaoCurta}` : v.code;
    },
    [vaultSpaces, currentUser]
  );

  const getUnitName = useCallback(
    (unitId?: string) => {
      if (!unitId) return '';
      const all = storage.getAllUnits().length > 0 ? storage.getAllUnits() : units;
      return all.find(u => u.id === unitId)?.name || '';
    },
    [units]
  );

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMaterialObj) {
      showToast('error', 'Selecione o material desejado.');
      return;
    }

    const directAuth = canAuthorize && isDirectAuthorize;
    const effectiveQuantity = directAuth ? reqQuantity : 1;

    if (directAuth) {
      if (reqQuantity <= 0) {
        showToast('error', 'Informe uma quantidade válida maior que zero.');
        return;
      }
      if (reqQuantity > selectedMaterialObj.quantidadeDisponivel) {
        showToast(
          'error',
          `Quantidade solicitada (${reqQuantity}) excede o disponível (${selectedMaterialObj.quantidadeDisponivel}).`
        );
        return;
      }
    }
    if (!reqFinalidade.trim()) {
      showToast('error', 'Informe a finalidade / motivo da cautela.');
      return;
    }

    const targetUser = canAuthorize
      ? unitUsers.find(u => u.id === selectedRequesterId) || currentUser
      : currentUser;

    setLoading(true);
    const res = await storage.requestCautelaMaterial({
      materialId: selectedMaterialObj.id,
      materialNome: selectedMaterialObj.nome,
      tipoMaterialNome: selectedMaterialObj.tipoMaterialNome,
      quantidade: effectiveQuantity,
      tipoDestinatario: 'interno',
      usuarioInternoId: targetUser.id,
      usuarioInternoNome: targetUser.name,
      usuarioInternoMasp: targetUser.masp,
      usuarioInternoCargo: targetUser.cargo,
      dataPrevistaDevolucao: reqDataPrevistaDevolucao || undefined,
      finalidade: reqFinalidade.trim(),
      seraDevolvida: reqSeraDevolvida,
      directAuthorized: directAuth,
      observacoes: reqObservacoes.trim() || undefined,
      departamentoId: selectedMaterialObj.departamentoId || targetUser.departmentId || currentUser.departmentId,
      unidadeId: selectedMaterialObj.unidadeId || targetUser.unitId || currentUser.unitId
    });
    setLoading(false);

    if (res.success) {
      showToast(
        'success',
        directAuth
          ? `Cautela (${res.protocolo || 'Material'}) emitida e baixada do estoque disponível!`
          : 'Solicitação de cautela de material enviada para análise do Armeiro!'
      );
      setSelectedMaterialId('');
      setReqQuantity(1);
      setReqDataPrevistaDevolucao('');
      setReqObservacoes('');
      await triggerRefresh();
      if (isPolicial) {
        setActiveTab('EM_ANALISE');
      } else {
        setActiveTab(targetUser.id === currentUser.id ? (reqSeraDevolvida ? 'MINHAS' : 'MEU_HISTORICO') : 'TODAS');
      }
    } else {
      showToast('error', res.error || 'Erro ao registrar cautela de material.');
    }
  };

  const openAuthorizeModal = (item: CautelaMaterial) => {
    const reqName = (item.materialNome || '').trim().toLowerCase();
    const exactMatch = eligibleMaterials.find(
      m => m.id === item.materialId && Number(m.quantidadeDisponivel || 0) > 0
    );
    const nameMatch = eligibleMaterials.find(
      m => (m.nome || '').trim().toLowerCase() === reqName && Number(m.quantidadeDisponivel || 0) > 0
    );
    const defaultMat = exactMatch || nameMatch || eligibleMaterials[0] || null;

    setAuthorizeModalItem(item);
    setAuthMaterialId(defaultMat?.id || '');
    const initialQty = defaultMat
      ? Math.min(Number(defaultMat.quantidadeDisponivel || 1), Math.max(1, Number(item.quantidade || 1)))
      : Math.max(1, Number(item.quantidade || 1));
    setAuthQuantity(initialQty);
    setAuthSeraDevolvida(item.seraDevolvida !== false);
    setAuthNotes(item.observacoes || '');
  };

  const handleConfirmAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizeModalItem) return;

    if (!authMaterialId || !selectedAuthMaterial) {
      showToast('error', 'Selecione o material exato no estoque para realizar o pagamento.');
      return;
    }
    if (authQuantity <= 0) {
      showToast('error', 'Informe uma quantidade válida maior que zero.');
      return;
    }
    if (authQuantity > selectedAuthMaterial.quantidadeDisponivel) {
      showToast(
        'error',
        `Quantidade definida (${authQuantity}) excede o disponível no cofre (${selectedAuthMaterial.quantidadeDisponivel}).`
      );
      return;
    }

    setLoading(true);
    const res = await storage.authorizeCautelaMaterial(authorizeModalItem.id, {
      materialId: selectedAuthMaterial.id,
      quantidade: authQuantity,
      seraDevolvida: authSeraDevolvida,
      notes: authNotes.trim() || undefined
    });
    setLoading(false);

    if (res.success) {
      showToast('success', 'Pagamento de material confirmado! Item baixado do cofre e acautelado ao policial.');
      setAuthorizeModalItem(null);
      await triggerRefresh();
    } else {
      showToast('error', res.error || 'Erro ao autorizar cautela de material.');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    setLoading(true);
    const res = await storage.rejectCautelaMaterial(rejectModalItem.id, rejectReason);
    setLoading(false);

    if (res.success) {
      showToast('success', 'Solicitação de material recusada.');
      setRejectModalItem(null);
      setRejectReason('');
      await triggerRefresh();
    } else {
      showToast('error', res.error || 'Erro ao recusar solicitação.');
    }
  };

  const openReturnModal = (item: CautelaMaterial) => {
    setReturnModalItem(item);
    const defaultQty =
      item.status === 'DEVOLUCAO_PENDENTE' && item.returnedQuantity !== undefined
        ? Number(item.returnedQuantity)
        : Number(item.quantidade || 1);
    setReturnedQty(defaultQty);
    setReturnCondition(item.foiConsumido && defaultQty === 0 ? 'Consumido' : 'Devolvido');
    setReturnRelato(item.relatoUsoAnomalias || '');
    const defaultVault =
      item.destinationVaultSpaceId ||
      item.vaultSpaceId ||
      scopedMaterialVaults[0]?.id ||
      '';
    setReturnVaultId(defaultVault);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalItem) return;

    if (returnedQty < 0 || returnedQty > returnModalItem.quantidade) {
      showToast('error', `Quantidade a devolver deve estar entre 0 e ${returnModalItem.quantidade}.`);
      return;
    }

    const isArmorerConfirming = canAuthorize && !isPolicial;
    if (isArmorerConfirming && returnedQty > 0 && scopedMaterialVaults.length > 0 && !returnVaultId) {
      showToast('error', 'Selecione o cofre de materiais de destino para retorno.');
      return;
    }

    const computedStatus: 'Devolvido' | 'Consumido' | 'Devolvido com Anomalia' =
      returnedQty === 0 || returnCondition === 'Consumido'
        ? 'Consumido'
        : returnCondition;

    setLoading(true);
    const res = await storage.returnCautelaMaterial(returnModalItem.id, {
      status: computedStatus,
      foiConsumido: returnedQty < returnModalItem.quantidade || computedStatus === 'Consumido',
      returnedQuantity: returnedQty,
      destinationVaultSpaceId: isArmorerConfirming ? returnVaultId || undefined : undefined,
      relatoUsoAnomalias: returnRelato.trim() || undefined,
      pendingReceipt: isPolicial
    });
    setLoading(false);

    if (res.success) {
      showToast(
        'success',
        isPolicial
          ? 'Solicitação de devolução enviada para conferência do Armeiro!'
          : `Recebimento confirmado! ${returnedQty} de ${returnModalItem.quantidade} un. retornadas ao estoque.`
      );
      setReturnModalItem(null);
      await triggerRefresh();
      if (isPolicial) setActiveTab('EM_ANALISE');
    } else {
      showToast('error', res.error || 'Erro ao processar devolução de material.');
    }
  };

  const handlePrintReceipt = (c: CautelaMaterial) => {
    const branding = resolvePrintBranding(c);
    const unitObj = branding.unitObj;
    const deptObj = branding.deptObj;
    const logoSrc = branding.logoSrc;
    const fallbackLogoSrc = branding.fallbackLogoSrc;

    const allUsers = storage.getAllUsersForLookup();
    const deliveryUser = c.responsavelEntregaId
      ? allUsers.find(u => u.id === c.responsavelEntregaId)
      : undefined;
    const receiverUser = c.responsavelRecebimentoId
      ? allUsers.find(u => u.id === c.responsavelRecebimentoId)
      : undefined;

    const matObj = materialsById.get(c.materialId);
    const tipoObj = matObj?.tipoMaterialId
      ? storage.getTiposMateriais().find(t => t.id === matObj.tipoMaterialId)
      : undefined;
    const originVaultId = c.vaultSpaceId || matObj?.vaultSpaceId;
    const originVaultObj = originVaultId
      ? (vaultSpaces.find(v => v.id === originVaultId) || storage.getVaultSpaces(currentUser).find(v => v.id === originVaultId))
      : undefined;
    const destVaultObj = c.destinationVaultSpaceId
      ? (vaultSpaces.find(v => v.id === c.destinationVaultSpaceId) || storage.getVaultSpaces(currentUser).find(v => v.id === c.destinationVaultSpaceId))
      : undefined;

    const originVaultText = originVaultObj
      ? `${originVaultObj.code}${originVaultObj.descricaoCurta ? ` — ${originVaultObj.descricaoCurta}` : ''}`
      : (matObj?.localGuarda || 'Cofre de Materiais da Unidade');
    const destVaultText = destVaultObj
      ? `${destVaultObj.code}${destVaultObj.descricaoCurta ? ` — ${destVaultObj.descricaoCurta}` : ''}`
      : '';

    const validadeText = matObj?.validade
      ? new Date(matObj.validade).toLocaleDateString('pt-BR')
      : 'Não perecível / Indeterminada';

    const categoriaLabel = tipoObj
      ? `${tipoObj.categoria || 'Geral'} (${tipoObj.ehConsumivel ? 'Consumível' : 'Permanente / Durável'})`
      : 'Material Operacional';

    const isFinished = isReturnedStatus(c.status) || isConsumedStatus(c.status);
    const isConsumo = c.seraDevolvida === false || isConsumedStatus(c.status);

    const materialSigner =
      c.usuarioInternoNome ||
      c.usuarioExternoNome ||
      (isFinished ? c.responsavelRecebimentoNome : c.responsavelEntregaNome) ||
      'Solicitante';
    const docTitle = buildStandardDocumentTitle(
      isFinished
        ? 'Termo de Devolução (Cautela de Materiais)'
        : isConsumo
        ? 'Recibo de Consumo (Cautela de Materiais)'
        : 'Recibo de Cautela (Cautela de Materiais)',
      c.protocolo || c.materialNome,
      materialSigner
    );

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtmlText(docTitle)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 10px 14px; color: #1e293b; font-size: 11px; line-height: 1.35; }
          .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .header img.unit-logo { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; }
          .header-text { flex: 1; text-align: center; padding-right: 64px; }
          .header-text h1 { font-size: 13px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; }
          .header-text h2 { font-size: 11px; margin: 2px 0; font-weight: 700; color: #334155; text-transform: uppercase; }
          .header-text h3 { font-size: 10px; margin: 2px 0 0; font-weight: 600; color: #475569; }
          .doc-title { background: #0f172a; color: #fff; text-align: center; padding: 6px 8px; font-weight: bold; font-size: 12px; border-radius: 4px; margin-bottom: 12px; letter-spacing: 0.5px; }
          .doc-title.consumo { background: #9a3412; }
          .section { border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px 12px; margin-bottom: 10px; page-break-inside: avoid; }
          .section-title { font-weight: bold; font-size: 10px; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
          .field { font-size: 10.5px; }
          .label { font-weight: bold; color: #475569; }
          .declaration { font-size: 10px; text-align: justify; line-height: 1.4; margin-top: 8px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #0f172a; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; text-align: center; page-break-inside: avoid; }
          .sig-line { border-top: 1px solid #0f172a; padding-top: 5px; font-size: 10px; }
          .footer { margin-top: 18px; text-align: center; font-size: 9px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="unit-logo" src="${logoSrc}" alt="Logo da Unidade" onerror="this.onerror=null;this.src='${fallbackLogoSrc}';" />
          <div class="header-text">
            <h1>Polícia Civil do Estado de Minas Gerais</h1>
            <h2>${deptObj?.name || 'Departamento de Polícia Civil'}</h2>
            <h3>${unitObj?.name || 'Unidade Policial'} — Controle de Materiais e Paiol</h3>
          </div>
        </div>

        <div class="doc-title ${isConsumo ? 'consumo' : ''}">
          ${
            isFinished
              ? 'TERMO DE DEVOLUÇÃO / BAIXA DE MATERIAL'
              : isConsumo
              ? 'RECIBO DE ENTREGA DE MATERIAL (CONSUMO)'
              : 'TERMO DE CAUTELA E RESPONSABILIDADE DE MATERIAL'
          }
        </div>

        <div class="section">
          <div class="section-title">Dados Completos do Material Acautelado</div>
          <div class="grid">
            <div class="field"><span class="label">Protocolo:</span> ${c.protocolo || c.id}</div>
            <div class="field"><span class="label">Status:</span> ${c.status}</div>
            <div class="field"><span class="label">Material:</span> ${matObj?.nome || c.materialNome}</div>
            <div class="field"><span class="label">Tipo:</span> ${matObj?.tipoMaterialNome || c.tipoMaterialNome || 'Material Operacional'}</div>
            <div class="field"><span class="label">Categoria / Natureza:</span> ${categoriaLabel}</div>
            <div class="field"><span class="label">Nº de Série / Patrimônio:</span> ${matObj?.numeroSerie || 'Não informado'}</div>
            <div class="field"><span class="label">Cofre de Origem / Local:</span> ${originVaultText}</div>
            <div class="field"><span class="label">Validade do Material:</span> ${validadeText}</div>
            <div class="field"><span class="label">Quantidade Retirada:</span> <strong>${c.quantidade} un.</strong></div>
            <div class="field"><span class="label">Modalidade:</span> ${c.seraDevolvida === false ? 'Consumo (Sem devolução obrigatória)' : 'Passivo de Devolução'}</div>
            <div class="field"><span class="label">Unidade / Depto:</span> ${unitObj?.name || matObj?.unidadeNome || '-'} • ${deptObj?.name || matObj?.departamentoNome || '-'}</div>
            <div class="field"><span class="label">Data de Solicitação/Retirada:</span> ${new Date(c.dataRetirada).toLocaleString('pt-BR')}</div>
            ${c.authorizedAt ? `<div class="field"><span class="label">Data de Autorização/Pagamento:</span> ${new Date(c.authorizedAt).toLocaleString('pt-BR')}</div>` : ''}
            ${c.dataPrevistaDevolucao ? `<div class="field"><span class="label">Devolução Prevista:</span> ${c.dataPrevistaDevolucao}</div>` : ''}
            ${c.dataDevolucao ? `<div class="field"><span class="label">Data de Devolução/Baixa:</span> ${new Date(c.dataDevolucao).toLocaleString('pt-BR')}</div>` : ''}
            ${c.returnedQuantity !== undefined ? `<div class="field"><span class="label">Qtd. Devolvida:</span> ${c.returnedQuantity} de ${c.quantidade} un.</div>` : ''}
            ${destVaultText ? `<div class="field"><span class="label">Cofre de Retorno:</span> ${destVaultText}</div>` : ''}
            ${matObj?.observacoes ? `<div class="field" style="grid-column: span 2;"><span class="label">Especificações / Observações do Material:</span> ${matObj.observacoes}</div>` : ''}
            ${c.observacoes ? `<div class="field" style="grid-column: span 2;"><span class="label">Observações da Cautela:</span> ${c.observacoes}</div>` : ''}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Identificação do Recebedor / Solicitante</div>
          <div class="grid">
            <div class="field"><span class="label">Nome:</span> ${c.usuarioInternoNome || c.usuarioExternoNome || '-'}</div>
            <div class="field"><span class="label">MASP / Documento:</span> ${c.usuarioInternoMasp || c.usuarioExternoDocumento || '-'}</div>
            <div class="field"><span class="label">Cargo / Órgão:</span> ${c.usuarioInternoCargo || c.usuarioExternoOrgao || 'Policial Civil'}</div>
            <div class="field"><span class="label">Finalidade:</span> ${c.finalidade}</div>
            ${c.relatoUsoAnomalias ? `<div class="field" style="grid-column: span 2;"><span class="label">Relato / Ocorrências:</span> ${c.relatoUsoAnomalias}</div>` : ''}
          </div>
        </div>

        <div class="declaration">
          ${
            isFinished
              ? `Certifico o encerramento da cautela referente ao material <strong>${matObj?.nome || c.materialNome}</strong>${matObj?.numeroSerie ? ` (Pat./Série: <strong>${matObj.numeroSerie}</strong>)` : ''} (${c.quantidade} un.), com devolução de <strong>${c.returnedQuantity ?? c.quantidade} un.</strong> e registro no controle de paiol.`
              : `Declaro ter recebido o material <strong>${c.quantidade}x ${matObj?.nome || c.materialNome}</strong>${matObj?.numeroSerie ? ` (Pat./Série: <strong>${matObj.numeroSerie}</strong>)` : ''}, retirado do cofre <strong>${originVaultText}</strong>, para uso estrito na atividade policial informada, comprometendo-me por sua guarda, conservação e devolução quando aplicável.`
          }
        </div>

        <div class="signatures">
          <div class="sig-line">
            <strong>${c.usuarioInternoNome || c.usuarioExternoNome || 'Solicitante'}</strong><br/>
            ${c.usuarioInternoCargo || c.usuarioExternoOrgao || 'Policial Civil'}<br/>
            MASP/Doc: ${c.usuarioInternoMasp || c.usuarioExternoDocumento || '-'}
          </div>
          <div class="sig-line">
            <strong>${isFinished ? c.responsavelRecebimentoNome || c.responsavelEntregaNome : c.responsavelEntregaNome}</strong><br/>
            ${isFinished ? (receiverUser?.cargo || 'Armeiro Recebedor') : (deliveryUser?.cargo || 'Armeiro Responsável')}<br/>
            MASP: ${(isFinished ? c.responsavelRecebimentoMasp || c.responsavelEntregaMasp : c.responsavelEntregaMasp) || '-'}
          </div>
        </div>

        <div class="footer">
          Documento emitido eletronicamente pelo Sistema Armaria PCMG em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // =========================================================================
  // BADGES E CARDS
  // =========================================================================

  const renderStatusBadge = (status: string, seraDevolvida?: boolean) => {
    switch (status) {
      case 'PENDENTE':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Aguardando Pagamento
          </span>
        );
      case 'DEVOLUCAO_PENDENTE':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Aguardando Devolução
          </span>
        );
      case 'AUTORIZADA':
      case 'Em Uso':
        return seraDevolvida === false ? (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center gap-1">
            <Flame className="w-3 h-3" /> Ativa (Consumo)
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Ativa (Passiva de Devolução)
          </span>
        );
      case 'DEVOLVIDA':
      case 'Devolvido':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Devolvido
          </span>
        );
      case 'Devolvido com Anomalia':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Devolvido c/ Anomalia
          </span>
        );
      case 'CONSUMIDA':
      case 'Consumido':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-700/60 text-slate-300 border border-slate-600 flex items-center gap-1">
            <Flame className="w-3 h-3" /> Consumido
          </span>
        );
      case 'RECUSADA':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Recusada
          </span>
        );
      default:
        return null;
    }
  };

  const renderCautelaCard = (
    c: CautelaMaterial,
    options?: {
      allowReturnByOwner?: boolean;
      allowArmorerActions?: boolean;
      pinnedActiveBanner?: boolean;
    }
  ) => {
    const active = isActiveStatus(c.status);
    const recipientName = c.usuarioInternoNome || c.usuarioExternoNome || 'Policial';
    const recipientDoc = c.usuarioInternoMasp || c.usuarioExternoDocumento || '-';

    return (
      <div
        key={c.id}
        className={`bg-slate-900/90 border rounded-2xl p-4 sm:p-5 transition shadow-lg ${
          options?.pinnedActiveBanner
            ? 'border-orange-500/40 bg-orange-950/10'
            : c.status === 'DEVOLUCAO_PENDENTE'
            ? 'border-purple-500/40 hover:border-purple-400/60'
            : c.status === 'PENDENTE'
            ? 'border-amber-500/40 hover:border-amber-400/60'
            : 'border-slate-800 hover:border-amber-500/30'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2.5 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {renderStatusBadge(c.status, c.seraDevolvida)}
              {c.protocolo && (
                <span className="text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {c.protocolo}
                </span>
              )}
              {c.unidadeId && hasDeptWideScope && !isPolicial && (
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                  {getUnitName(c.unidadeId)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <Package className="w-5 h-5 text-amber-400 shrink-0" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  {c.status === 'PENDENTE'
                    ? `${c.materialNome}`
                    : `${c.quantidade}x ${c.materialNome}`}
                </h3>
                <p className="text-xs text-slate-400">
                  {c.status === 'PENDENTE' ? (
                    <span className="text-amber-300 font-semibold">
                      Item exato e quantidade a definir pelo Armeiro da unidade
                    </span>
                  ) : (
                    <>
                      Tipo: <strong className="text-slate-200">{c.tipoMaterialNome || 'Material Operacional'}</strong>
                      {materialsById.get(c.materialId)?.numeroSerie && (
                        <>
                          {' '}• Pat./Série:{' '}
                          <strong className="text-slate-200 font-mono">
                            {materialsById.get(c.materialId)?.numeroSerie}
                          </strong>
                        </>
                      )}
                    </>
                  )}
                  {c.dataPrevistaDevolucao && (
                    <>
                      {' '}• Devolução Prevista: <strong className="text-amber-300">{c.dataPrevistaDevolucao}</strong>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Solicitante / Recebedor</span>
                <strong className="text-slate-200">{recipientName}</strong>
                <span className="block text-[10px] font-mono text-amber-400">
                  {c.tipoDestinatario === 'externo' ? `Doc: ${recipientDoc}` : `MASP: ${recipientDoc}`}
                </span>
              </div>

              {!isPolicial ? (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Cofre de Materiais</span>
                  <strong className="text-cyan-400 font-mono text-[11px]">{getVaultLabel(c.vaultSpaceId)}</strong>
                  <span className="block text-[10px] text-slate-400">
                    Retirada: {new Date(c.dataRetirada).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Data de Solicitação</span>
                  <strong className="text-slate-200">
                    {new Date(c.dataRetirada).toLocaleDateString('pt-BR')}
                  </strong>
                  <span className="block text-[10px] text-slate-400">
                    {c.responsavelEntregaNome && c.status !== 'PENDENTE'
                      ? `Armeiro: ${c.responsavelEntregaNome}`
                      : 'Aguardando Armeiro'}
                  </span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Finalidade / Uso</span>
                <strong className="text-slate-300 line-clamp-2">{c.finalidade}</strong>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Situação de Retorno</span>
                {isReturnedStatus(c.status) || isConsumedStatus(c.status) ? (
                  <strong className="text-cyan-300">
                    Devolvidos: {c.returnedQuantity ?? (isConsumedStatus(c.status) ? 0 : c.quantidade)}/{c.quantidade} un.
                  </strong>
                ) : c.status === 'DEVOLUCAO_PENDENTE' ? (
                  <strong className="text-purple-300">
                    Informado p/ devolver: {c.returnedQuantity ?? c.quantidade}/{c.quantidade} un.
                  </strong>
                ) : c.seraDevolvida !== false ? (
                  <strong className="text-emerald-300">Passivo de Devolução</strong>
                ) : (
                  <strong className="text-orange-300">Material de Consumo</strong>
                )}
                {c.authorizedAt && (
                  <span className="block text-[10px] text-slate-500">
                    Autorizada: {new Date(c.authorizedAt).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            </div>

            {c.rejectionReason && (
              <p className="text-[11px] text-rose-300 bg-rose-950/20 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                Motivo da recusa: {c.rejectionReason}
              </p>
            )}

            {(c.relatoUsoAnomalias || c.observacoes) && (
              <p className="text-[11px] text-slate-400 italic px-1">
                {c.relatoUsoAnomalias ? `Relato/Anomalias: ${c.relatoUsoAnomalias}` : `Obs: ${c.observacoes}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap lg:flex-col items-stretch justify-end gap-2 shrink-0 border-t lg:border-t-0 border-slate-800 pt-3 lg:pt-0">
            {options?.allowArmorerActions && canAuthorize && c.status === 'PENDENTE' && (
              <>
                <button
                  onClick={() => openAuthorizeModal(c)}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
                >
                  <Check className="w-4 h-4" /> Confirmar Pagamento
                </button>
                <button
                  onClick={() => {
                    setRejectModalItem(c);
                    setRejectReason('');
                  }}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <XCircle className="w-4 h-4" /> Recusar
                </button>
              </>
            )}

            {options?.allowArmorerActions && canAuthorize && c.status === 'DEVOLUCAO_PENDENTE' && (
              <button
                onClick={() => openReturnModal(c)}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
              >
                <RotateCcw className="w-4 h-4" /> Confirmar Devolução
              </button>
            )}

            {options?.allowReturnByOwner && active && c.seraDevolvida !== false && (
              <button
                onClick={() => openReturnModal(c)}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
              >
                <RotateCcw className="w-4 h-4" /> Solicitar Devolução
              </button>
            )}

            {!options?.allowReturnByOwner && canAuthorize && active && c.seraDevolvida !== false && (
              <button
                onClick={() => openReturnModal(c)}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-4 h-4" /> Receber Devolução
              </button>
            )}

            {c.status !== 'PENDENTE' && c.status !== 'RECUSADA' && (
              <button
                onClick={() => handlePrintReceipt(c)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" /> Emitir Recibo
              </button>
            )}

            <button
              onClick={() => setDetailItem(c)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Eye className="w-3.5 h-3.5" /> Detalhes
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20">
                Controle de Materiais • PCMG
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-1">
                Cautela de Materiais
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPolicial
                  ? 'Solicite materiais passíveis de depósito em sua unidade, acompanhe solicitações em análise e realize devoluções.'
                  : `Gestão de pagamentos e devoluções de materiais da unidade ${unitSigla}, cautelas próprias e histórico departamental.`}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('NOVA')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isPolicial ? 'Solicitar Material' : 'Nova Cautela de Material'}</span>
          </button>
        </div>

        {/* Navegação de Abas conforme Perfil */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('MINHAS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
              activeTab === 'MINHAS'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Minhas Cautelas de Materiais</span>
            {minhasCautelasAtivas.length > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-md font-extrabold ${
                  activeTab === 'MINHAS' ? 'bg-slate-950 text-amber-400' : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {minhasCautelasAtivas.length}
              </span>
            )}
          </button>

          {isPolicial && (
            <>
              <button
                onClick={() => setActiveTab('EM_ANALISE')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'EM_ANALISE'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Cautela de material em análise</span>
                {policialEmAnalise.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-md font-extrabold ${
                      activeTab === 'EM_ANALISE' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {policialEmAnalise.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('MEU_HISTORICO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'MEU_HISTORICO'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>Meu Histórico Cautelas de Materiais</span>
              </button>
            </>
          )}

          {canAuthorize && (
            <>
              <button
                onClick={() => setActiveTab('PENDENTES')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'PENDENTES'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Solicitações Pendentes {unitSigla}</span>
                {armeiroPendentesBase.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-md font-extrabold ${
                      activeTab === 'PENDENTES' ? 'bg-slate-950 text-amber-400' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {armeiroPendentesBase.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('MEU_HISTORICO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'MEU_HISTORICO'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>Meu Histórico</span>
              </button>

              <button
                onClick={() => setActiveTab('TODAS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'TODAS'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>Histórico Geral {unitSigla}</span>
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab('NOVA')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'NOVA'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            + {isPolicial ? 'Solicitar Material' : 'Solicitar / Acautelar'}
          </button>
        </div>
      </div>

      {/* Feedback Toast na primeira camada */}
      {feedbackMsg && (
        <TopLayerAlert
          type={feedbackMsg.type === 'success' ? 'success' : 'error'}
          message={feedbackMsg.text}
          onClose={() => setFeedbackMsg(null)}
        />
      )}

      {/* =================================================================== */}
      {/* ABA: NOVA SOLICITAÇÃO / ACAUTELAMENTO DE MATERIAL                   */}
      {/* =================================================================== */}
      {activeTab === 'NOVA' && (
        <form
          onSubmit={handleCreateRequest}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl"
        >
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {isPolicial
                  ? 'Solicitar Material na Unidade'
                  : canAuthorize && isDirectAuthorize
                  ? 'Acautelamento Direto de Material (Armeiro)'
                  : 'Solicitação de Material'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPolicial
                  ? 'Exibindo exclusivamente os materiais disponíveis habilitados para depósito policial na unidade.'
                  : 'Selecione o material elegível para cautela e o policial destinatário.'}
              </p>
            </div>
          </div>

          {/* Modalidade: Passivo de Devolução x Material de Consumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReqSeraDevolvida(true)}
              className={`p-4 rounded-xl border text-left transition flex items-start space-x-3 ${
                reqSeraDevolvida
                  ? 'bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/40'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg mt-0.5 ${
                  reqSeraDevolvida ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Material Passivo de Devolução
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ficará ativo em Minhas Cautelas de Materiais podendo ser devolvido a qualquer momento ao paiol.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setReqSeraDevolvida(false)}
              className={`p-4 rounded-xl border text-left transition flex items-start space-x-3 ${
                !reqSeraDevolvida
                  ? 'bg-orange-950/30 border-orange-500/60 ring-1 ring-orange-500/40'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg mt-0.5 ${
                  !reqSeraDevolvida ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Material de Consumo
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Destinado a consumo operacional ou treinamento sem retorno obrigatório ao cofre.
                </p>
              </div>
            </button>
          </div>

          {canAuthorize && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-amber-400 uppercase">
                  Policial Destinatário / Solicitante
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDirectAuthorize}
                    onChange={e => setIsDirectAuthorize(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Confirmar pagamento imediato e deduzir do estoque agora</span>
                </label>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={requesterSearchTerm}
                  onChange={e => {
                    const val = e.target.value;
                    setRequesterSearchTerm(val);
                    const term = val.trim().toLowerCase();
                    const digits = cleanDigits(val);
                    if (term) {
                      const matches = unitUsers.filter(
                        u =>
                          (u.name || '').toLowerCase().includes(term) ||
                          (u.masp || '').toLowerCase().includes(term) ||
                          (digits.length > 0 && cleanDigits(u.masp).includes(digits))
                      );
                      if (matches.length === 1) setSelectedRequesterId(matches[0].id);
                    }
                  }}
                  placeholder="Pesquisar policial por Nome ou MASP..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <select
                value={selectedRequesterId}
                onChange={e => setSelectedRequesterId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100"
              >
                {filteredUnitUsersForSelect.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} — MASP: {u.masp} ({u.cargo || u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Seleção de Material (apenas passivoDepositoPoliciais !== false) */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Buscar Material Disponível
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={materialSearchTerm}
                  onChange={e => setMaterialSearchTerm(e.target.value)}
                  placeholder={
                    isSolicitationMode
                      ? 'Filtrar pelo nome do material...'
                      : 'Filtrar por nome do material, categoria/tipo ou patrimônio/série...'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Material Selecionado *
              </label>
              <select
                value={selectedMaterialId}
                onChange={e => setSelectedMaterialId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Escolha o Material --</option>
                {filteredMaterialsForSelect.map(m =>
                  isSolicitationMode ? (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ) : (
                    <option key={m.id} value={m.id}>
                      {m.nome} • {m.tipoMaterialNome}
                      {m.numeroSerie ? ` (Pat./Série: ${m.numeroSerie})` : ''}
                      {` — Disp.: ${m.quantidadeDisponivel} un. (Cofre: ${getVaultLabel(m.vaultSpaceId)})`}
                    </option>
                  )
                )}
              </select>
              {isSolicitationMode && eligibleMaterials.length > 0 && (
                <p className="text-[11px] text-amber-300/90 mt-1.5">
                  O material exato (patrimônio/série, cofre) e a quantidade serão especificados pelo Armeiro da unidade ao confirmar o pagamento.
                </p>
              )}
              {eligibleMaterials.length === 0 && (
                <p className="text-[11px] text-rose-400 mt-1">
                  Nenhum material elegível para cautela disponível na unidade no momento.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {canAuthorize && isDirectAuthorize ? (
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Quantidade *
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedMaterialObj ? selectedMaterialObj.quantidadeDisponivel : undefined}
                  value={reqQuantity}
                  onChange={e => setReqQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Quantidade
                </label>
                <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-medium flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Será definida pelo Armeiro da unidade no pagamento</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Previsão de Devolução (Opcional)
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={reqDataPrevistaDevolucao}
                  onChange={e => setReqDataPrevistaDevolucao(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Finalidade / Motivo do Uso *
              </label>
              <input
                type="text"
                value={reqFinalidade}
                onChange={e => setReqFinalidade(e.target.value)}
                required
                placeholder="Ex: Operação Policial, Plantão, Diligência, Treinamento..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Observações (Opcional)
              </label>
              <textarea
                rows={2}
                value={reqObservacoes}
                onChange={e => setReqObservacoes(e.target.value)}
                placeholder="Informações complementares da solicitação..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('MINHAS')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || eligibleMaterials.length === 0}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold flex items-center space-x-2 transition disabled:opacity-50"
            >
              <span>
                {loading
                  ? 'Processando...'
                  : canAuthorize && isDirectAuthorize
                  ? 'Confirmar e Emitir Cautela'
                  : 'Enviar Solicitação de Material'}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ABA: MINHAS CAUTELAS DE MATERIAIS (POLICIAL E ARMEIRO)              */}
      {/* =================================================================== */}
      {activeTab === 'MINHAS' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Pesquisar nas minhas cautelas ativas por protocolo, material, tipo ou finalidade..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {filteredMinhasAtivas.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Package className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhuma cautela de material ativa passível de devolução encontrada.
              </p>
              <p className="text-xs text-slate-500">
                Materiais de consumo e cautelas já devolvidas constam na aba de Histórico.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMinhasAtivas.map(c =>
                renderCautelaCard(c, { allowReturnByOwner: true })
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA POLICIAL: CAUTELA DE MATERIAL EM ANÁLISE (SEM BUSCA/FILTRO)     */}
      {/* =================================================================== */}
      {activeTab === 'EM_ANALISE' && isPolicial && (
        <div className="space-y-4">
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-amber-200">
                Cautelas de Material em Análise pelo Armeiro
              </h3>
              <p className="text-xs text-slate-400">
                Exibindo todas as suas cautelas pendentes de pagamento ou pendentes de recibo de devolução pelo Armeiro.
              </p>
            </div>
          </div>

          {policialEmAnalise.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Não há cautelas de material pendentes de análise ou recibo no momento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {policialEmAnalise.map(c => renderCautelaCard(c))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA POLICIAL: MEU HISTÓRICO CAUTELAS DE MATERIAIS                   */}
      {/* =================================================================== */}
      {activeTab === 'MEU_HISTORICO' && isPolicial && (
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Pesquisar no meu histórico por material, protocolo ou finalidade..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-orange-950/15 border border-orange-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-orange-300 flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-400" />
                <span>Cautelas Ativas — Materiais de Consumo (Fixadas no Topo)</span>
                <span className="px-2 py-0.5 text-[10px] rounded-md bg-orange-500/20 text-orange-200 border border-orange-500/30">
                  {filteredPolicialAtivasConsumo.length}
                </span>
              </h3>
              <span className="text-[11px] text-orange-200/70 hidden sm:inline">
                Não passíveis de devolução
              </span>
            </div>

            {filteredPolicialAtivasConsumo.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">
                Nenhuma cautela ativa de material de consumo encontrada para a pesquisa atual.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredPolicialAtivasConsumo.map(c =>
                  renderCautelaCard(c, { pinnedActiveBanner: true })
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Cautelas Devolvidas / Baixadas</span>
                <span className="px-2 py-0.5 text-[10px] rounded-md bg-slate-800 text-cyan-300 border border-slate-700">
                  {filteredPolicialEncerradas.length}
                </span>
              </h3>
            </div>

            {filteredPolicialEncerradas.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
                <p className="text-xs text-slate-400">
                  Nenhuma cautela encerrada encontrada para os critérios informados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPolicialEncerradas.map(c => renderCautelaCard(c))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA ARMEIRO: SOLICITAÇÕES PENDENTES [UNIDADE]                       */}
      {/* =================================================================== */}
      {activeTab === 'PENDENTES' && canAuthorize && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPendingSubFilter('TODAS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  pendingSubFilter === 'TODAS'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>Todas</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900/30 text-[10px] font-extrabold">
                  {armeiroPendentesBase.length}
                </span>
              </button>

              <button
                onClick={() => setPendingSubFilter('AGUARDANDO_PAGAMENTO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  pendingSubFilter === 'AGUARDANDO_PAGAMENTO'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-950 text-amber-300 border border-amber-500/30 hover:bg-amber-500/10'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Aguardando Pagamento</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900/30 text-[10px] font-extrabold">
                  {countAguardandoPagamento}
                </span>
              </button>

              <button
                onClick={() => setPendingSubFilter('AGUARDANDO_DEVOLUCAO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  pendingSubFilter === 'AGUARDANDO_DEVOLUCAO'
                    ? 'bg-purple-500 text-slate-950 shadow'
                    : 'bg-slate-950 text-purple-300 border border-purple-500/30 hover:bg-purple-500/10'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Aguardando Devolução</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900/30 text-[10px] font-extrabold">
                  {countAguardandoDevolucao}
                </span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar policial, MASP, protocolo ou nome do material..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {filteredArmeiroPendentes.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhuma solicitação pendente encontrada neste filtro.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredArmeiroPendentes.map(c =>
                renderCautelaCard(c, { allowArmorerActions: true })
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA ARMEIRO: MEU HISTÓRICO / HISTÓRICO GERAL [SIGLA]                */}
      {/* =================================================================== */}
      {canAuthorize && (activeTab === 'MEU_HISTORICO' || activeTab === 'TODAS') && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={
                  activeTab === 'MEU_HISTORICO'
                    ? 'Buscar no meu histórico por material, protocolo ou finalidade...'
                    : `Buscar no Histórico Geral ${unitSigla} por policial, MASP, material ou protocolo...`
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                ['TODOS', 'AUTORIZADA', 'PENDENTE', 'DEVOLUCAO_PENDENTE', 'DEVOLVIDA', 'CONSUMIDA', 'RECUSADA'] as const
              ).map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${
                    statusFilter === st
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {st === 'TODOS'
                    ? 'Todos os Status'
                    : st === 'AUTORIZADA'
                    ? 'Ativas'
                    : st === 'PENDENTE'
                    ? 'Aguard. Pagamento'
                    : st === 'DEVOLUCAO_PENDENTE'
                    ? 'Aguard. Devolução'
                    : st === 'DEVOLVIDA'
                    ? 'Devolvidas'
                    : st === 'CONSUMIDA'
                    ? 'Consumidas'
                    : 'Recusadas'}
                </button>
              ))}
            </div>
          </div>

          {(activeTab === 'MEU_HISTORICO' ? filteredArmeiroMeuHistorico : filteredArmeiroHistoricoGeral).length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Package className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhum registro de cautela de material encontrado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(activeTab === 'MEU_HISTORICO' ? filteredArmeiroMeuHistorico : filteredArmeiroHistoricoGeral).map(c =>
                renderCautelaCard(c, { allowArmorerActions: true })
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL ARMEIRO: CONFIRMAR PAGAMENTO                                  */}
      {/* =================================================================== */}
      {authorizeModalItem && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmAuthorize}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl space-y-4 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center space-x-2 text-emerald-400 border-b border-slate-800 pb-3">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-100">
                Confirmar Pagamento / Entrega de Material
              </h3>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Solicitante:</span>
                <strong className="text-slate-100">
                  {authorizeModalItem.usuarioInternoNome} (MASP: {authorizeModalItem.usuarioInternoMasp})
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Nome Solicitado:</span>
                <strong className="text-amber-400">
                  {authorizeModalItem.materialNome}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Finalidade:</span>
                <strong className="text-slate-200 text-right max-w-[65%]">
                  {authorizeModalItem.finalidade}
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-400 uppercase mb-1.5">
                Especificar Material Exato no Estoque (Série / Cofre) *
              </label>
              <select
                value={authMaterialId}
                onChange={e => {
                  const nextId = e.target.value;
                  setAuthMaterialId(nextId);
                  const nextMat = eligibleMaterials.find(m => m.id === nextId);
                  if (nextMat && authQuantity > nextMat.quantidadeDisponivel) {
                    setAuthQuantity(Math.max(1, Number(nextMat.quantidadeDisponivel || 1)));
                  }
                }}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Selecione o Material Exato do Cofre --</option>
                {authMaterialGroups.sameName.length > 0 && (
                  <optgroup label={`Correspondentes a "${authorizeModalItem.materialNome}"`}>
                    {authMaterialGroups.sameName.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nome} • {m.tipoMaterialNome}
                        {m.numeroSerie ? ` • Pat./Série: ${m.numeroSerie}` : ''}
                        {` — Disp.: ${m.quantidadeDisponivel} un. (Cofre: ${getVaultLabel(m.vaultSpaceId)})`}
                      </option>
                    ))}
                  </optgroup>
                )}
                {authMaterialGroups.others.length > 0 && (
                  <optgroup label="Outros materiais elegíveis disponíveis na unidade">
                    {authMaterialGroups.others.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nome} • {m.tipoMaterialNome}
                        {m.numeroSerie ? ` • Pat./Série: ${m.numeroSerie}` : ''}
                        {` — Disp.: ${m.quantidadeDisponivel} un. (Cofre: ${getVaultLabel(m.vaultSpaceId)})`}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {eligibleMaterials.length === 0 && (
                <p className="text-[11px] text-rose-400 mt-1">
                  Não há saldo disponível de materiais elegíveis nesta unidade no momento.
                </p>
              )}
            </div>

            {selectedAuthMaterial && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-[11px]">
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Cofre de Saída</span>
                  <strong className="text-cyan-400 font-mono">
                    {getVaultLabel(selectedAuthMaterial.vaultSpaceId)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Patrimônio / Série</span>
                  <strong className="text-slate-200 font-mono">
                    {selectedAuthMaterial.numeroSerie || 'Sem Nº Série'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Saldo Disponível</span>
                  <strong className="text-emerald-400 font-mono">
                    {selectedAuthMaterial.quantidadeDisponivel} un.
                  </strong>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Quantidade a Entregar *
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedAuthMaterial?.quantidadeDisponivel || 1}
                  value={authQuantity}
                  onChange={e =>
                    setAuthQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))
                  }
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Regime de Devolução
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthSeraDevolvida(true)}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border transition ${
                      authSeraDevolvida
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Devolução
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthSeraDevolvida(false)}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border transition ${
                      !authSeraDevolvida
                        ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Consumo
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Observações do Armeiro (Opcional)
              </label>
              <textarea
                rows={2}
                value={authNotes}
                onChange={e => setAuthNotes(e.target.value)}
                placeholder="Observações na entrega do material..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAuthorizeModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !selectedAuthMaterial}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition disabled:opacity-50"
              >
                {loading ? 'Confirmando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: DEVOLUÇÃO DE MATERIAL (POLICIAL SOLICITA / ARMEIRO CONFIRMA) */}
      {/* =================================================================== */}
      {returnModalItem && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleReturnSubmit}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl space-y-4 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center space-x-2 text-cyan-400 border-b border-slate-800 pb-3">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-100">
                {isPolicial
                  ? 'Solicitar Devolução de Material'
                  : 'Confirmar Recebimento de Devolução'}
              </h3>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Policial:</span>
                <strong className="text-slate-100">
                  {returnModalItem.usuarioInternoNome || returnModalItem.usuarioExternoNome} (MASP:{' '}
                  {returnModalItem.usuarioInternoMasp || returnModalItem.usuarioExternoDocumento || '-'})
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Material Acautelado:</span>
                <strong className="text-amber-400">
                  {returnModalItem.quantidade}x {returnModalItem.materialNome}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Quantidade Devolvida *
                </label>
                <input
                  type="number"
                  min={0}
                  max={returnModalItem.quantidade}
                  value={returnedQty}
                  onChange={e =>
                    setReturnedQty(
                      Math.min(
                        returnModalItem.quantidade,
                        Math.max(0, parseInt(e.target.value || '0', 10))
                      )
                    )
                  }
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Condição do Material
                </label>
                <select
                  value={returnCondition}
                  onChange={e => {
                    const next = e.target.value as 'Devolvido' | 'Devolvido com Anomalia' | 'Consumido';
                    setReturnCondition(next);
                    if (next === 'Consumido') setReturnedQty(0);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                >
                  <option value="Devolvido">Íntegro (Em perfeitas condições)</option>
                  <option value="Devolvido com Anomalia">Devolvido com Anomalia / Avaria</option>
                  <option value="Consumido">Totalmente Consumido / Extraviado</option>
                </select>
              </div>
            </div>

            {!isPolicial && canAuthorize && returnedQty > 0 && (
              <div>
                <label className="block text-xs font-bold text-cyan-400 uppercase mb-1.5 flex items-center gap-1.5">
                  <Vault className="w-3.5 h-3.5" />
                  Cofre de Materiais de Destino
                </label>
                <select
                  value={returnVaultId}
                  onChange={e => setReturnVaultId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">-- Selecione o Cofre de Materiais --</option>
                  {scopedMaterialVaults.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.code} {v.descricaoCurta ? `— ${v.descricaoCurta}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Relato de Uso / Anomalias / Observações
              </label>
              <textarea
                rows={2}
                value={returnRelato}
                onChange={e => setReturnRelato(e.target.value)}
                placeholder="Informe anomalias, perdas, consumo ou observações da devolução..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReturnModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition"
              >
                {loading
                  ? 'Processando...'
                  : isPolicial
                  ? 'Enviar Devolução para Conferência'
                  : 'Confirmar Devolução / Baixa'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: RECUSAR SOLICITAÇÃO (ARMEIRO)                                */}
      {/* =================================================================== */}
      {rejectModalItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRejectSubmit}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-rose-400">
              Recusar Solicitação de Material
            </h3>
            <p className="text-xs text-slate-400">
              Informe o motivo da recusa para <strong>{rejectModalItem.usuarioInternoNome}</strong>:
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Justificativa da recusa..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"
              >
                Confirmar Recusa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: DETALHES DA CAUTELA                                          */}
      {/* =================================================================== */}
      {detailItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">
                Detalhes da Cautela de Material
              </h3>
              <button
                onClick={() => setDetailItem(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {renderStatusBadge(detailItem.status, detailItem.seraDevolvida)}
              {detailItem.protocolo && (
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                  {detailItem.protocolo}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Material / Quantidade</span>
                <strong className="text-amber-400">
                  {detailItem.status === 'PENDENTE'
                    ? `${detailItem.materialNome} (Qtd. a definir pelo Armeiro)`
                    : `${detailItem.quantidade}x ${detailItem.materialNome}`}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Modalidade</span>
                <strong className={detailItem.seraDevolvida !== false ? 'text-emerald-400' : 'text-orange-400'}>
                  {detailItem.seraDevolvida !== false ? 'Passivo de Devolução' : 'Material de Consumo'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Solicitante</span>
                <strong className="text-slate-200">
                  {detailItem.usuarioInternoNome || detailItem.usuarioExternoNome} (
                  {detailItem.usuarioInternoMasp || detailItem.usuarioExternoDocumento || '-'})
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Tipo de Material</span>
                <strong className="text-slate-200">{detailItem.tipoMaterialNome || 'Operacional'}</strong>
              </div>
              {detailItem.status !== 'PENDENTE' && materialsById.get(detailItem.materialId)?.numeroSerie && (
                <div>
                  <span className="text-slate-500 block">Patrimônio / Nº Série</span>
                  <strong className="text-slate-200 font-mono">
                    {materialsById.get(detailItem.materialId)?.numeroSerie}
                  </strong>
                </div>
              )}
              {!isPolicial && (
                <div>
                  <span className="text-slate-500 block">Cofre</span>
                  <strong className="text-cyan-400">{getVaultLabel(detailItem.vaultSpaceId || materialsById.get(detailItem.materialId)?.vaultSpaceId)}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-500 block">Armeiro Responsável</span>
                <strong className="text-slate-200">{detailItem.responsavelEntregaNome || 'Aguardando'}</strong>
              </div>
              {detailItem.dataDevolucao && (
                <div>
                  <span className="text-slate-500 block">Devolução / Baixa</span>
                  <strong className="text-cyan-400">
                    {detailItem.returnedQuantity ?? 0} de {detailItem.quantidade} un.
                  </strong>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-slate-500 block">Finalidade / Uso</span>
                <strong className="text-slate-200">{detailItem.finalidade}</strong>
              </div>
              {(detailItem.relatoUsoAnomalias || detailItem.observacoes) && (
                <div className="col-span-2">
                  <span className="text-slate-500 block">Observações / Relato</span>
                  <strong className="text-slate-300">
                    {detailItem.relatoUsoAnomalias || detailItem.observacoes}
                  </strong>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {detailItem.status !== 'PENDENTE' && detailItem.status !== 'RECUSADA' && (
                <button
                  onClick={() => handlePrintReceipt(detailItem)}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Imprimir Recibo
                </button>
              )}
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
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
