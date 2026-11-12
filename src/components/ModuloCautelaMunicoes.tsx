import React, { useState, useMemo, useCallback } from 'react';
import {
  User,
  Weapon,
  CautelaMunicao,
  AmmunitionStock,
  Caliber,
  VaultSpace,
  Unit,
  Department,
  getSystemLogo,
  DEFAULT_SYSTEM_LOGO
} from '../types';
import { storage } from '../services/storage';
import {
  Disc,
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
  Package,
  AlertTriangle,
  Shield,
  Crosshair,
  Lock,
  Layers,
  Link2
} from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface ModuloCautelaMunicoesProps {
  currentUser: User;
  weapons?: Weapon[];
  ammoStocks: AmmunitionStock[];
  calibers: Caliber[];
  vaultSpaces: VaultSpace[];
  units: Unit[];
  departments: Department[];
  onRefresh: () => void | Promise<void>;
}

type ActiveAmmoTab = 'MINHAS' | 'EM_ANALISE' | 'PENDENTES' | 'MEU_HISTORICO' | 'TODAS' | 'NOVA';

export const ModuloCautelaMunicoes: React.FC<ModuloCautelaMunicoesProps> = ({
  currentUser,
  weapons = [],
  ammoStocks,
  calibers,
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

  // Todas as unidades do departamento ao qual o usuário pertence (usado no escopo departamental e no Histórico Geral [SIGLA])
  const departmentUnits = useMemo(() => {
    const allUnits = storage.getAllUnits().length > 0 ? storage.getAllUnits() : units;
    if (isGeral) return allUnits;
    if (!currentUser.departmentId) return units;
    return allUnits.filter(u => u.departmentId === currentUser.departmentId);
  }, [units, isGeral, currentUser.departmentId]);

  const deptUnitIds = useMemo(() => {
    return new Set(departmentUnits.map(u => u.id));
  }, [departmentUnits]);

  const userUnit = useMemo(() => {
    const allUnits = storage.getAllUnits();
    return (
      units.find(u => u.id === currentUser.unitId) ||
      allUnits.find(u => u.id === currentUser.unitId)
    );
  }, [units, currentUser.unitId]);

  // Sigla da unidade do usuário (ex: "COE")
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

  // Verifica se o usuário logado é o solicitante / requisitante / interessado na cautela
  const isOwnCautela = useCallback(
    (c: CautelaMunicao): boolean => {
      if (c.requesterId && c.requesterId === currentUser.id) return true;
      const myMaspRaw = (currentUser.masp || '').trim().toLowerCase();
      const reqMaspRaw = (c.requesterMasp || '').trim().toLowerCase();
      if (myMaspRaw && reqMaspRaw && myMaspRaw === reqMaspRaw) return true;
      const myDigits = cleanDigits(currentUser.masp);
      const reqDigits = cleanDigits(c.requesterMasp);
      if (myDigits && reqDigits && myDigits === reqDigits) return true;
      return false;
    },
    [currentUser.id, currentUser.masp, cleanDigits]
  );

  // Verifica se a cautela de munições possui vínculo com armamento
  const isLinkedToWeapon = useCallback((c: CautelaMunicao): boolean => {
    return Boolean(c.linkedWeaponCautelaId || c.linkedWeaponSerialNumber || c.weaponId);
  }, []);

  // Verifica modalidade solicitada na devolução pendente
  const isPendingJointWeaponReturn = useCallback((c: CautelaMunicao): boolean => {
    const obs = String(c.observations || '');
    if (obs.includes('[MODALIDADE_DEVOLUCAO: CONJUNTA_ARMA]')) return true;
    if (obs.includes('[MODALIDADE_DEVOLUCAO: SOMENTE_MUNICAO]')) return false;
    return c.linkedWeaponStatus === 'DEVOLUCAO_PENDENTE';
  }, []);

  const stripInternalTags = useCallback((text?: string | null): string => {
    return String(text || '')
      .replace(/\[MODALIDADE_DEVOLUCAO:[^\]]*\]/g, '')
      .replace(/\s*\|\s*\|\s*/g, ' | ')
      .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
      .trim();
  }, []);

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

  const resolveCautelaPrintBranding = useCallback(
    (cautela?: CautelaMunicao | null) => {
      const allUnits = storage.getAllUnits().length > 0 ? storage.getAllUnits() : units;
      const allDepts =
        storage.getAllDepartments().length > 0 ? storage.getAllDepartments() : departments;
      const allUsers = storage.getAllUsersForLookup();

      const vaultObj = cautela?.vaultSpaceId
        ? vaultSpaces.find(v => v.id === cautela.vaultSpaceId)
        : undefined;
      const reqUser = cautela?.requesterId
        ? allUsers.find(u => u.id === cautela.requesterId)
        : undefined;

      const candidateUnitIds = [
        cautela?.unitId,
        vaultObj?.unitId,
        currentUser.unitId,
        reqUser?.unitId
      ].filter(Boolean) as string[];

      let resolvedUnit: Unit | undefined = undefined;
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
        cautela?.departmentId,
        currentUser.departmentId,
        reqUser?.departmentId
      ].filter(Boolean) as string[];

      let resolvedDept: Department | undefined = undefined;
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
  const [activeTab, setActiveTab] = useState<ActiveAmmoTab>('MINHAS');
  const [pendingSubFilter, setPendingSubFilter] = useState<'TODAS' | 'AGUARDANDO_PAGAMENTO' | 'AGUARDANDO_DEVOLUCAO'>('TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLUCAO_PENDENTE' | 'DEVOLVIDA' | 'CONSUMIDA' | 'RECUSADA'>('TODOS');
  const [linkFilter, setLinkFilter] = useState<'TODOS' | 'AVULSA' | 'VINCULADA'>('TODOS');
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados do formulário de Nova Solicitação / Acautelamento
  const [selectedCaliberId, setSelectedCaliberId] = useState('');
  const [selectedTipoMunicao, setSelectedTipoMunicao] = useState('');
  const [selectedPesoMunicao, setSelectedPesoMunicao] = useState('');
  const [selectedStockId, setSelectedStockId] = useState('');
  const [reqQuantity, setReqQuantity] = useState(20);
  const [reqDestinacao, setReqDestinacao] = useState('Operacional / Defesa');
  const [reqReason, setReqReason] = useState('Serviço Policial Operacional / Plantão');
  const [reqSeraDevolvida, setReqSeraDevolvida] = useState<boolean>(true);
  const [selectedRequesterId, setSelectedRequesterId] = useState(currentUser.id);
  const [requesterSearchTerm, setRequesterSearchTerm] = useState('');
  const [isDirectAuthorize, setIsDirectAuthorize] = useState(canAuthorize);

  // Modal de Autorização de Pagamento (Armeiro)
  const [authorizeModalItem, setAuthorizeModalItem] = useState<CautelaMunicao | null>(null);
  const [authSelectedStockId, setAuthSelectedStockId] = useState('');
  const [authSeraDevolvida, setAuthSeraDevolvida] = useState(true);
  const [authNotes, setAuthNotes] = useState('');

  // Modal de Recusa (Armeiro)
  const [rejectModalItem, setRejectModalItem] = useState<CautelaMunicao | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Modal de Devolução (Policial solicita devolução OU Armeiro confirma recebimento)
  const [returnModalItem, setReturnModalItem] = useState<CautelaMunicao | null>(null);
  const [returnedQty, setReturnedQty] = useState<number>(0);
  const [returnObs, setReturnObs] = useState('');
  const [returnAmmoVaultId, setReturnAmmoVaultId] = useState('');
  // Campos para munições vinculadas a armamento (devolver com ou sem armamento)
  const [returnWithWeapon, setReturnWithWeapon] = useState<boolean>(false);
  const [returnWeaponVaultId, setReturnWeaponVaultId] = useState('');
  const [returnWeaponReturnedMags, setReturnWeaponReturnedMags] = useState<number>(2);
  const [returnWeaponHadShots, setReturnWeaponHadShots] = useState<boolean>(false);
  const [returnWeaponShotsFired, setReturnWeaponShotsFired] = useState<number>(0);
  const [returnWeaponIsWorking, setReturnWeaponIsWorking] = useState<boolean>(true);
  const [returnWeaponDefectDesc, setReturnWeaponDefectDesc] = useState('');
  const [returnWeaponHadMalfunction, setReturnWeaponHadMalfunction] = useState<boolean>(false);
  const [returnWeaponMalfunctionDesc, setReturnWeaponMalfunctionDesc] = useState('');

  // Modal de Detalhes / Impressão
  const [detailItem, setDetailItem] = useState<CautelaMunicao | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  // Base completa de cautelas de munições excluindo rigorosamente qualquer registro sem munição (quantity <= 0)
  const allCautelas = useMemo(() => {
    return storage.getCautelasMunicoes().filter(c => Number(c.quantity || 0) > 0);
  }, [ammoStocks, currentUser]); // recalcula após refresh

  // Cofres pertencentes à unidade ou departamento
  const scopedVaults = useMemo(() => {
    const allVaults = storage.getVaultSpaces(currentUser);
    const base = allVaults.length > 0 ? allVaults : vaultSpaces;
    if (isGeral) return base;
    if (hasDeptWideScope) {
      return base.filter(
        v => v.departmentId === currentUser.departmentId || (v.unitId ? deptUnitIds.has(v.unitId) : false)
      );
    }
    return base.filter(v => v.unitId === currentUser.unitId);
  }, [vaultSpaces, currentUser, isGeral, hasDeptWideScope, deptUnitIds]);

  const unitVaultIds = useMemo(() => {
    return new Set(
      vaultSpaces
        .filter(v => v.unitId === currentUser.unitId)
        .map(v => v.id)
    );
  }, [vaultSpaces, currentUser.unitId]);

  // Estoques com disponibilidade (quantity > 0) na unidade (para Policial) ou no escopo do Armeiro
  const availableUnitStocks = useMemo(() => {
    return ammoStocks.filter(s => {
      if (Number(s.quantity || 0) <= 0) return false;
      if (isGeral) return true;
      if (hasDeptWideScope && !isPolicial) {
        return (
          s.departmentId === currentUser.departmentId ||
          (s.unitId ? deptUnitIds.has(s.unitId) : false)
        );
      }
      return s.unitId === currentUser.unitId || (s.vaultSpaceId ? unitVaultIds.has(s.vaultSpaceId) : false);
    });
  }, [ammoStocks, isGeral, hasDeptWideScope, isPolicial, currentUser.departmentId, currentUser.unitId, deptUnitIds, unitVaultIds]);

  // Resolve nome do calibre a partir de um registro de estoque
  const getStockCaliberName = useCallback(
    (s: AmmunitionStock): string => {
      const cal = calibers.find(c => c.id === s.caliberId || c.name === s.caliberId);
      return (cal?.name || (s as any).caliberName || s.caliberId || 'Calibre').trim();
    },
    [calibers]
  );

  // Opções únicas para o Policial solicitar munição (Calibre -> Tipo -> Peso), sem expor cofre nem saldo
  const availableCaliberOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    availableUnitStocks.forEach(s => {
      const name = getStockCaliberName(s);
      const key = s.caliberId || name;
      if (!map.has(key)) {
        map.set(key, { id: key, name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [availableUnitStocks, getStockCaliberName]);

  const availableTipoOptions = useMemo(() => {
    if (!selectedCaliberId) return [];
    const set = new Set<string>();
    availableUnitStocks.forEach(s => {
      const name = getStockCaliberName(s);
      const key = s.caliberId || name;
      if (key === selectedCaliberId || name === selectedCaliberId) {
        const tipo = (s.tipoMunicao || 'Operacional').trim() || 'Operacional';
        set.add(tipo);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [availableUnitStocks, selectedCaliberId, getStockCaliberName]);

  const availablePesoOptions = useMemo(() => {
    if (!selectedCaliberId) return [];
    const set = new Set<string>();
    availableUnitStocks.forEach(s => {
      const name = getStockCaliberName(s);
      const key = s.caliberId || name;
      const tipo = (s.tipoMunicao || 'Operacional').trim() || 'Operacional';
      if (
        (key === selectedCaliberId || name === selectedCaliberId) &&
        (!selectedTipoMunicao || tipo.toLowerCase() === selectedTipoMunicao.toLowerCase())
      ) {
        const peso = (s.pesoMunicao || '').trim() || 'Padrão';
        set.add(peso);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [availableUnitStocks, selectedCaliberId, selectedTipoMunicao, getStockCaliberName]);

  // =========================================================================
  // CONJUNTOS DE DADOS POR ABA E PERFIL
  // =========================================================================

  // 1. Aba "Minhas Cautelas de Munições" (Policial e Armeiro):
  // Somente cautelas ATIVAS ('AUTORIZADA') passivas de devolução (seraDevolvida === true) onde o próprio usuário é o solicitante
  const minhasCautelasAtivas = useMemo(() => {
    return allCautelas.filter(
      c => isOwnCautela(c) && c.status === 'AUTORIZADA' && Boolean(c.seraDevolvida)
    );
  }, [allCautelas, isOwnCautela]);

  // 2. Aba Policial: "Cautela de munição em analise"
  // Todas as cautelas do Policial aguardando comandos do armeiro (PENDENTE ou DEVOLUCAO_PENDENTE), sem busca ou filtro
  const policialEmAnaliseCautelas = useMemo(() => {
    return allCautelas.filter(
      c => isOwnCautela(c) && (c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE')
    );
  }, [allCautelas, isOwnCautela]);

  // 3. Aba Policial: "Meu Histórico Cautelas de Munições"
  // Somente munições de consumo (não passíveis de devolução) + todas as já devolvidas
  const policialMeuHistoricoBase = useMemo(() => {
    return allCautelas.filter(
      c =>
        isOwnCautela(c) &&
        ((c.status === 'AUTORIZADA' && !c.seraDevolvida) ||
          c.status === 'CONSUMIDA' ||
          c.status === 'DEVOLVIDA')
    );
  }, [allCautelas, isOwnCautela]);

  // 4. Aba Armeiro: "Solicitações Pendentes <UNIDADE>"
  // Todas as solicitações da unidade (ou departamento se abrangência departamental) aguardando ação do armeiro
  const armeiroPendentesBase = useMemo(() => {
    if (!canAuthorize) return [];
    return allCautelas.filter(c => {
      const isAwaitingArmorer = c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE';
      if (!isAwaitingArmorer) return false;
      if (isGeral) return true;
      if (hasDeptWideScope) {
        return (
          c.departmentId === currentUser.departmentId ||
          (c.unitId ? deptUnitIds.has(c.unitId) : false)
        );
      }
      return c.unitId === currentUser.unitId;
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

  // 5. Aba Armeiro: "Meu Histórico"
  // Todo o histórico de cautelas com e sem vínculo que tem o próprio Armeiro como solicitante
  const armeiroMeuHistoricoBase = useMemo(() => {
    return allCautelas.filter(c => isOwnCautela(c));
  }, [allCautelas, isOwnCautela]);

  // 6. Aba Armeiro: "Histórico Geral <SIGLA>"
  // Todo o histórico de cautelas de munições com e sem vínculo que sejam do departamento ao qual pertence o armeiro
  const armeiroHistoricoDepartamentoBase = useMemo(() => {
    if (!canAuthorize) return [];
    if (isGeral) return allCautelas;
    if (currentUser.departmentId) {
      return allCautelas.filter(
        c =>
          c.departmentId === currentUser.departmentId ||
          (c.unitId ? deptUnitIds.has(c.unitId) : false)
      );
    }
    return allCautelas.filter(c => c.unitId === currentUser.unitId);
  }, [allCautelas, canAuthorize, isGeral, currentUser.departmentId, currentUser.unitId, deptUnitIds]);

  // Helper de busca textual
  const matchesSearch = useCallback(
    (c: CautelaMunicao): boolean => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        (c.caliberName || '').toLowerCase().includes(term) ||
        (c.loteMunicao || '').toLowerCase().includes(term) ||
        (c.fabricante || '').toLowerCase().includes(term) ||
        (c.tipoMunicao || '').toLowerCase().includes(term) ||
        (c.pesoMunicao || '').toLowerCase().includes(term) ||
        (c.requesterName || '').toLowerCase().includes(term) ||
        (c.requesterMasp || '').toLowerCase().includes(term) ||
        (c.linkedWeaponSerialNumber || '').toLowerCase().includes(term) ||
        (c.linkedWeaponModel || '').toLowerCase().includes(term) ||
        (c.reason || '').toLowerCase().includes(term)
      );
    },
    [searchTerm]
  );

  const matchesLinkFilter = useCallback(
    (c: CautelaMunicao): boolean => {
      if (linkFilter === 'TODOS') return true;
      const linked = isLinkedToWeapon(c);
      return linkFilter === 'VINCULADA' ? linked : !linked;
    },
    [linkFilter, isLinkedToWeapon]
  );

  // Listas filtradas para renderização
  const filteredMinhasAvulsas = useMemo(
    () => minhasCautelasAtivas.filter(c => !isLinkedToWeapon(c) && matchesSearch(c)),
    [minhasCautelasAtivas, isLinkedToWeapon, matchesSearch]
  );

  const filteredMinhasVinculadas = useMemo(
    () => minhasCautelasAtivas.filter(c => isLinkedToWeapon(c) && matchesSearch(c)),
    [minhasCautelasAtivas, isLinkedToWeapon, matchesSearch]
  );

  // No Meu Histórico do Policial: cautelas ativas (consumo) separadas e fixas no começo da pesquisa
  const filteredPolicialHistoricoAtivasFixas = useMemo(
    () =>
      policialMeuHistoricoBase.filter(
        c => c.status === 'AUTORIZADA' && !c.seraDevolvida && matchesSearch(c) && matchesLinkFilter(c)
      ),
    [policialMeuHistoricoBase, matchesSearch, matchesLinkFilter]
  );

  const filteredPolicialHistoricoEncerradas = useMemo(
    () =>
      policialMeuHistoricoBase.filter(
        c => (c.status === 'DEVOLVIDA' || c.status === 'CONSUMIDA') && matchesSearch(c) && matchesLinkFilter(c)
      ),
    [policialMeuHistoricoBase, matchesSearch, matchesLinkFilter]
  );

  const filteredArmeiroPendentes = useMemo(() => {
    return armeiroPendentesBase.filter(c => {
      if (pendingSubFilter === 'AGUARDANDO_PAGAMENTO' && c.status !== 'PENDENTE') return false;
      if (pendingSubFilter === 'AGUARDANDO_DEVOLUCAO' && c.status !== 'DEVOLUCAO_PENDENTE') return false;
      if (!matchesLinkFilter(c)) return false;
      return matchesSearch(c);
    });
  }, [armeiroPendentesBase, pendingSubFilter, matchesLinkFilter, matchesSearch]);

  const filteredArmeiroMeuHistorico = useMemo(() => {
    return armeiroMeuHistoricoBase.filter(c => {
      if (statusFilter !== 'TODOS' && c.status !== statusFilter) return false;
      if (!matchesLinkFilter(c)) return false;
      return matchesSearch(c);
    });
  }, [armeiroMeuHistoricoBase, statusFilter, matchesLinkFilter, matchesSearch]);

  const filteredArmeiroHistoricoGeral = useMemo(() => {
    return armeiroHistoricoDepartamentoBase.filter(c => {
      if (statusFilter !== 'TODOS' && c.status !== statusFilter) return false;
      if (!matchesLinkFilter(c)) return false;
      return matchesSearch(c);
    });
  }, [armeiroHistoricoDepartamentoBase, statusFilter, matchesLinkFilter, matchesSearch]);

  // Usuários elegíveis para cautela direta pelo Armeiro
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
      const matchName = (u.name || '').toLowerCase().includes(term);
      const matchMasp = (u.masp || '').toLowerCase().includes(term) || (digits.length > 0 && cleanDigits(u.masp).includes(digits));
      const matchCargo = (u.cargo || '').toLowerCase().includes(term);
      if (u.id === selectedRequesterId) return true;
      return matchName || matchMasp || matchCargo;
    });
  }, [unitUsers, requesterSearchTerm, selectedRequesterId, cleanDigits]);

  const getVaultCode = useCallback(
    (vaultId?: string) => {
      if (!vaultId) return 'Cofre da Unidade';
      const v = vaultSpaces.find(sp => sp.id === vaultId) || storage.getVaultSpaces(currentUser).find(sp => sp.id === vaultId);
      return v ? v.code : 'Cofre da Unidade';
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

  // Estoques compatíveis para o modal de Autorização do Armeiro
  const compatibleStocksForAuthorizeModal = useMemo(() => {
    if (!authorizeModalItem) return [];
    const reqCalName = (authorizeModalItem.caliberName || '').trim().toLowerCase();
    const reqCalId = authorizeModalItem.caliberId;
    return availableUnitStocks
      .filter(s => {
        const sCalName = getStockCaliberName(s).toLowerCase();
        return s.caliberId === reqCalId || sCalName === reqCalName;
      })
      .sort((a, b) => {
        // Prioriza estoque com mesmo tipo e peso solicitados pelo policial
        const reqTipo = (authorizeModalItem.tipoMunicao || '').trim().toLowerCase();
        const reqPeso = (authorizeModalItem.pesoMunicao || '').trim().toLowerCase();
        const aScore =
          ((a.tipoMunicao || '').trim().toLowerCase() === reqTipo ? 2 : 0) +
          (reqPeso && reqPeso !== 'padrão' && (a.pesoMunicao || '').trim().toLowerCase() === reqPeso ? 1 : 0);
        const bScore =
          ((b.tipoMunicao || '').trim().toLowerCase() === reqTipo ? 2 : 0) +
          (reqPeso && reqPeso !== 'padrão' && (b.pesoMunicao || '').trim().toLowerCase() === reqPeso ? 1 : 0);
        return bScore - aScore;
      });
  }, [authorizeModalItem, availableUnitStocks, getStockCaliberName]);

  // =========================================================================
  // HANDLERS DE AÇÃO
  // =========================================================================

  const handleDestinacaoChange = (newDest: string) => {
    setReqDestinacao(newDest);
    if (newDest === 'Treinamento') {
      if (reqReason.trim() === 'Serviço Policial Operacional / Plantão') {
        setReqReason('');
      }
    } else if (!reqReason.trim()) {
      setReqReason('Serviço Policial Operacional / Plantão');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (reqQuantity <= 0) {
      showToast('error', 'Informe uma quantidade válida maior que zero.');
      return;
    }

    // Regra de validação para Treinamento
    if (reqDestinacao === 'Treinamento') {
      const trimmedReason = reqReason.trim();
      if (
        !trimmedReason ||
        trimmedReason.toLowerCase() === 'serviço policial operacional / plantão' ||
        trimmedReason.length < 4
      ) {
        showToast(
          'error',
          'Ao escolher a Destinação como Treinamento, informe obrigatoriamente em Motivo/Justificativa qual o treinamento que vai fazer.'
        );
        return;
      }
    } else if (!reqReason.trim()) {
      showToast('error', 'Informe o motivo / justificativa do uso.');
      return;
    }

    // Fluxo Policial: seleciona Calibre, Tipo e Peso (sem ver cofre nem quantidade disponível)
    if (isPolicial) {
      if (!selectedCaliberId) {
        showToast('error', 'Selecione o calibre disponível na unidade.');
        return;
      }
      if (!selectedTipoMunicao) {
        showToast('error', 'Selecione o tipo de munição disponível para o calibre.');
        return;
      }
      if (availablePesoOptions.length > 0 && !selectedPesoMunicao) {
        showToast('error', 'Selecione o peso disponível para o calibre e tipo escolhidos.');
        return;
      }

      const calOption = availableCaliberOptions.find(c => c.id === selectedCaliberId);
      const resolvedCaliberName = calOption?.name || selectedCaliberId;
      const pesoClean = selectedPesoMunicao === 'Padrão' ? '' : selectedPesoMunicao;

      setLoading(true);
      const res = await storage.requestCautelaMunicao({
        caliberId: selectedCaliberId,
        caliberName: resolvedCaliberName,
        quantity: reqQuantity,
        tipoMunicao: selectedTipoMunicao || 'Operacional',
        pesoMunicao: pesoClean || null,
        destinacao: reqDestinacao,
        departmentId: currentUser.departmentId,
        unitId: currentUser.unitId,
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        requesterMasp: currentUser.masp,
        requesterCargo: currentUser.cargo,
        reason: reqReason.trim(),
        seraDevolvida: reqSeraDevolvida,
        directAuthorized: false,
        actor: currentUser
      });
      setLoading(false);

      if (res.success) {
        showToast('success', 'Solicitação de munições enviada para análise do Armeiro!');
        await onRefresh();
        setActiveTab('EM_ANALISE');
      } else {
        showToast('error', res.error || 'Erro ao registrar solicitação de munições.');
      }
      return;
    }

    // Fluxo Armeiro / Admin / Geral: seleciona lote/cofre do estoque
    const stock = availableUnitStocks.find(s => s.id === selectedStockId);
    if (!stock) {
      showToast('error', 'Selecione um lote de munição no cofre de origem.');
      return;
    }
    if (reqQuantity > stock.quantity) {
      showToast('error', `Quantidade solicitada (${reqQuantity}) excede o saldo disponível neste lote (${stock.quantity} un.).`);
      return;
    }

    const calName = getStockCaliberName(stock);
    const targetRequester = canAuthorize
      ? unitUsers.find(u => u.id === selectedRequesterId) || currentUser
      : currentUser;

    setLoading(true);
    const res = await storage.requestCautelaMunicao({
      stockId: stock.id,
      caliberId: stock.caliberId,
      caliberName: calName,
      quantity: reqQuantity,
      fabricante: stock.fabricante,
      tipoMunicao: stock.tipoMunicao || 'Operacional',
      pesoMunicao: stock.pesoMunicao,
      loteMunicao: stock.loteMunicao || 'Padrão',
      anoFabricacao: stock.anoFabricacao,
      destinacao: reqDestinacao || stock.destinacao,
      vaultSpaceId: stock.vaultSpaceId,
      departmentId: stock.departmentId || currentUser.departmentId,
      unitId: stock.unitId || currentUser.unitId,
      requesterId: targetRequester.id,
      requesterName: targetRequester.name,
      requesterMasp: targetRequester.masp,
      requesterCargo: targetRequester.cargo,
      reason: reqReason.trim(),
      seraDevolvida: reqSeraDevolvida,
      directAuthorized: canAuthorize && isDirectAuthorize,
      armorerId: canAuthorize && isDirectAuthorize ? currentUser.id : undefined,
      armorerName: canAuthorize && isDirectAuthorize ? currentUser.name : undefined,
      armorerMasp: canAuthorize && isDirectAuthorize ? currentUser.masp : undefined,
      actor: currentUser
    });
    setLoading(false);

    if (res.success) {
      showToast(
        'success',
        canAuthorize && isDirectAuthorize
          ? 'Cautela de munições confirmada e subtraída do cofre!'
          : 'Solicitação de munições registrada com sucesso!'
      );
      setSelectedStockId('');
      await onRefresh();
      setActiveTab(targetRequester.id === currentUser.id ? (reqSeraDevolvida ? 'MINHAS' : 'MEU_HISTORICO') : 'TODAS');
    } else {
      showToast('error', res.error || 'Erro ao registrar cautela de munições.');
    }
  };

  const openAuthorizeModal = (item: CautelaMunicao) => {
    setAuthorizeModalItem(item);
    setAuthSeraDevolvida(Boolean(item.seraDevolvida));
    setAuthNotes('');

    const reqCalName = (item.caliberName || '').trim().toLowerCase();
    const reqTipo = (item.tipoMunicao || '').trim().toLowerCase();
    const reqPeso = (item.pesoMunicao || '').trim().toLowerCase();

    const matching = availableUnitStocks.filter(s => {
      const sCalName = getStockCaliberName(s).toLowerCase();
      return (s.caliberId === item.caliberId || sCalName === reqCalName) && s.quantity >= item.quantity;
    });

    const exactMatch =
      matching.find(
        s =>
          (s.tipoMunicao || 'Operacional').trim().toLowerCase() === reqTipo &&
          (!reqPeso || (s.pesoMunicao || '').trim().toLowerCase() === reqPeso)
      ) ||
      matching.find(s => (s.tipoMunicao || 'Operacional').trim().toLowerCase() === reqTipo) ||
      matching[0];

    setAuthSelectedStockId(exactMatch?.id || '');
  };

  const handleConfirmAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizeModalItem) return;

    const chosenStock = availableUnitStocks.find(s => s.id === authSelectedStockId);
    if (!chosenStock) {
      showToast('error', 'Selecione o cofre / lote de origem para subtrair as munições.');
      return;
    }
    if (chosenStock.quantity < authorizeModalItem.quantity) {
      showToast(
        'error',
        `Saldo insuficiente no lote selecionado (${chosenStock.quantity} un. disponíveis para ${authorizeModalItem.quantity} un. solicitadas).`
      );
      return;
    }

    setLoading(true);
    const res = await storage.authorizeCautelaMunicao(authorizeModalItem.id, {
      stockId: chosenStock.id,
      vaultSpaceId: chosenStock.vaultSpaceId,
      seraDevolvida: authSeraDevolvida,
      notes: authNotes.trim() || undefined
    });
    setLoading(false);

    if (res.success) {
      showToast('success', 'Pagamento de munições confirmado! Quantidade subtraída do cofre selecionado.');
      setAuthorizeModalItem(null);
      await onRefresh();
    } else {
      showToast('error', res.error || 'Erro ao autorizar cautela de munições.');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    setLoading(true);
    const res = await storage.rejectCautelaMunicao(rejectModalItem.id, rejectNotes);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Solicitação de munições recusada.');
      setRejectModalItem(null);
      setRejectNotes('');
      await onRefresh();
    } else {
      showToast('error', res.error || 'Erro ao recusar solicitação.');
    }
  };

  const openReturnModal = (item: CautelaMunicao) => {
    setReturnModalItem(item);
    const initialRemaining =
      item.status === 'DEVOLUCAO_PENDENTE' && item.returnedQuantity !== undefined
        ? Number(item.returnedQuantity)
        : Number(item.quantity);
    setReturnedQty(initialRemaining);
    setReturnObs(stripInternalTags(item.observations));

    const unitOrDeptVaults = scopedVaults.filter(
      v => !item.unitId || v.unitId === item.unitId || hasDeptWideScope
    );
    const defaultAmmoVault =
      item.vaultSpaceId || unitOrDeptVaults[0]?.id || scopedVaults[0]?.id || '';
    setReturnAmmoVaultId(defaultAmmoVault);

    const linked = isLinkedToWeapon(item);
    const weaponAlreadyReturned = item.linkedWeaponStatus === 'DEVOLVIDA';

    if (linked && !weaponAlreadyReturned) {
      // Se já está em DEVOLUCAO_PENDENTE, pré-carrega a escolha feita pelo policial; caso contrário padrão é false (opção visível para escolher)
      const shouldJoint = item.status === 'DEVOLUCAO_PENDENTE' ? isPendingJointWeaponReturn(item) : false;
      setReturnWithWeapon(shouldJoint);

      const matchedWeapon = weapons.find(
        w => w.id === item.weaponId || (item.linkedWeaponSerialNumber && w.serialNumber === item.linkedWeaponSerialNumber)
      );
      const defaultWeaponVault =
        item.linkedWeaponVaultSpaceId ||
        matchedWeapon?.vaultSpaceId ||
        matchedWeapon?.previousVaultSpaceId ||
        defaultAmmoVault;
      setReturnWeaponVaultId(defaultWeaponVault);

      setReturnWeaponReturnedMags(
        item.linkedWeaponReturnedMags !== undefined
          ? item.linkedWeaponReturnedMags
          : item.linkedWeaponMagazineQty ?? 2
      );
      setReturnWeaponHadShots(Boolean(item.linkedWeaponHadShots));
      setReturnWeaponShotsFired(Number(item.linkedWeaponShotsFired || 0));
      setReturnWeaponIsWorking(
        item.linkedWeaponConditions
          ? !item.linkedWeaponConditions.toLowerCase().includes('defeito')
          : true
      );
      setReturnWeaponDefectDesc(item.linkedWeaponDefectDesc || '');
      setReturnWeaponHadMalfunction(Boolean(item.linkedWeaponHadMalfunction));
      setReturnWeaponMalfunctionDesc(item.linkedWeaponMalfunctionDesc || '');
    } else {
      setReturnWithWeapon(false);
      setReturnWeaponVaultId('');
      setReturnWeaponHadShots(false);
      setReturnWeaponShotsFired(0);
      setReturnWeaponIsWorking(true);
      setReturnWeaponDefectDesc('');
      setReturnWeaponHadMalfunction(false);
      setReturnWeaponMalfunctionDesc('');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalItem) return;

    if (returnedQty < 0 || returnedQty > returnModalItem.quantity) {
      showToast('error', `A quantidade devolvida deve estar entre 0 e ${returnModalItem.quantity}.`);
      return;
    }

    const isArmorerConfirming = canAuthorize && !isPolicial;

    if (returnWithWeapon) {
      if (returnWeaponHadShots && (!returnWeaponShotsFired || returnWeaponShotsFired <= 0)) {
        showToast('error', 'Informe a quantidade de tiros efetuados com o armamento.');
        return;
      }
      if (!returnWeaponIsWorking && !returnWeaponDefectDesc.trim()) {
        showToast('error', 'Descreva o defeito / avaria apresentado pelo armamento.');
        return;
      }
      if (returnWeaponHadMalfunction && !returnWeaponMalfunctionDesc.trim()) {
        showToast('error', 'Descreva a pane apresentada pelo armamento.');
        return;
      }
      if (isArmorerConfirming && !returnWeaponVaultId) {
        showToast('error', 'Selecione o cofre de armas para o qual o armamento irá retornar.');
        return;
      }
    }

    if (isArmorerConfirming && returnedQty > 0 && !returnAmmoVaultId) {
      showToast('error', 'Selecione o cofre de munições para o qual as munições remanescentes irão retornar.');
      return;
    }

    setLoading(true);
    const res = await storage.returnCautelaMunicao(returnModalItem.id, {
      returnedQuantity: returnedQty,
      destinationVaultSpaceId: isArmorerConfirming ? returnAmmoVaultId : undefined,
      ammoDestinationVaultSpaceId: isArmorerConfirming ? returnAmmoVaultId : undefined,
      weaponDestinationVaultSpaceId: isArmorerConfirming && returnWithWeapon ? returnWeaponVaultId : undefined,
      observations: returnObs.trim(),
      pendingReceipt: isPolicial,
      returnWithWeapon,
      hadShots: returnWithWeapon ? returnWeaponHadShots : false,
      shotsFired: returnWithWeapon && returnWeaponHadShots ? returnWeaponShotsFired : 0,
      isWorking: returnWithWeapon ? returnWeaponIsWorking : true,
      defectDescription: returnWithWeapon && !returnWeaponIsWorking ? returnWeaponDefectDesc.trim() : undefined,
      hadMalfunction: returnWithWeapon ? returnWeaponHadMalfunction : false,
      malfunctionDescription: returnWithWeapon && returnWeaponHadMalfunction ? returnWeaponMalfunctionDesc.trim() : undefined,
      returnedMagazinesCount: returnWithWeapon ? returnWeaponReturnedMags : undefined
    });
    setLoading(false);

    if (res.success) {
      if (isPolicial || res.pendingReceipt) {
        showToast(
          'success',
          returnWithWeapon
            ? 'Devolução conjunta (munições + armamento) enviada para conferência do Armeiro!'
            : 'Solicitação de devolução de munições enviada para conferência do Armeiro!'
        );
        setReturnModalItem(null);
        await onRefresh();
        setActiveTab('EM_ANALISE');
      } else {
        showToast(
          'success',
          returnWithWeapon
            ? `Devolução conjunta confirmada! Arma e munições remanescentes (${returnedQty} un.) retornadas aos cofres selecionados.`
            : `Devolução confirmada! ${returnedQty} munições remanescentes retornadas ao cofre.`
        );
        setReturnModalItem(null);
        await onRefresh();
      }
    } else {
      showToast('error', res.error || 'Erro ao processar devolução de munições.');
    }
  };

  // Impressão de Recibo Institucional com Brasão/Logo da Unidade no lado esquerdo do cabeçalho
  const handlePrintReceipt = (c: CautelaMunicao) => {
    const branding = resolveCautelaPrintBranding(c);
    const unitObj = branding.unitObj;
    const deptObj = branding.deptObj;
    const logoSrc = branding.logoSrc;
    const fallbackLogoSrc = branding.fallbackLogoSrc;

    const allUsers = storage.getAllUsersForLookup();
    const armorerUser = c.armorerId ? allUsers.find(u => u.id === c.armorerId) : undefined;
    const returnArmorerUser = c.returnArmorerId ? allUsers.find(u => u.id === c.returnArmorerId) : undefined;
    const armorerCargo = armorerUser?.cargo || 'Armeiro Responsável';
    const returnArmorerCargo = returnArmorerUser?.cargo || 'Armeiro Recebedor';

    const consumed = Math.max(0, c.quantity - (c.returnedQuantity || 0));
    const isReturned = c.status === 'DEVOLVIDA' || c.status === 'CONSUMIDA';
    const isPermanent = !c.seraDevolvida;
    const cleanObs = stripInternalTags(c.observations);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Recibo de Munições - ${c.caliberName}</title>
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
          .doc-title.permanent { background: #9a3412; }
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
            <h3>${unitObj?.name || 'Unidade Policial'} — Controle Bélico / Paiol</h3>
          </div>
        </div>

        <div class="doc-title ${isPermanent ? 'permanent' : ''}">
          ${
            isReturned
              ? 'RECIBO DE DEVOLUÇÃO / BAIXA DE MUNIÇÕES'
              : isPermanent
              ? 'TERMO DE RETIRADA DEFINITIVA DE MUNIÇÕES (CONSUMO / SEM DEVOLUÇÃO)'
              : 'TERMO DE RESPONSABILIDADE E CAUTELA DE MUNIÇÕES'
          }
        </div>

        <div class="section">
          <div class="section-title">1. Identificação do Policial Solicitante</div>
          <div class="grid">
            <div class="field"><span class="label">Nome Completo:</span> ${c.requesterName}</div>
            <div class="field"><span class="label">MASP:</span> ${c.requesterMasp}</div>
            <div class="field"><span class="label">Cargo / Carreira:</span> ${c.requesterCargo || 'Policial Civil'}</div>
            <div class="field"><span class="label">Modalidade:</span> ${isPermanent ? 'Munição de Consumo (Sem Devolução)' : 'Passiva de Devolução ao Paiol'}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">2. Especificação das Munições</div>
          <div class="grid">
            <div class="field"><span class="label">Calibre:</span> <strong>${c.caliberName}</strong></div>
            <div class="field"><span class="label">Quantidade Retirada:</span> <strong>${c.quantity} cartuchos</strong></div>
            <div class="field"><span class="label">Fabricante / Tipo:</span> ${c.fabricante || 'Padrão'} • ${c.tipoMunicao || 'Operacional'}</div>
            <div class="field"><span class="label">Peso / Lote:</span> ${c.pesoMunicao || 'Padrão'} • Lote: ${c.loteMunicao || 'Padrão'}</div>
            <div class="field"><span class="label">Destinação:</span> ${c.destinacao || 'Operacional'}</div>
            <div class="field"><span class="label">Vínculo com Arma:</span> ${
              isLinkedToWeapon(c)
                ? `Vinculada (${c.linkedWeaponModel || 'Arma'} — Nº Série: ${c.linkedWeaponSerialNumber || 'N/I'})`
                : 'Avulsa (Sem vínculo com armamento)'
            }</div>
            <div class="field" style="grid-column: span 2;"><span class="label">Motivo / Justificativa:</span> ${c.reason}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">3. Dados da Autorização</div>
          <div class="grid">
            <div class="field"><span class="label">Protocolo:</span> ${c.id}</div>
            <div class="field"><span class="label">Data Solicitação:</span> ${new Date(c.requestDate).toLocaleString('pt-BR')}</div>
            <div class="field"><span class="label">Armeiro Autorizador:</span> ${c.armorerName || 'Pendente'} ${c.armorerMasp ? `(MASP: ${c.armorerMasp})` : ''}</div>
            <div class="field"><span class="label">Data Autorização:</span> ${c.authorizedAt ? new Date(c.authorizedAt).toLocaleString('pt-BR') : 'Aguardando'}</div>
          </div>
        </div>

        ${
          isReturned
            ? `
        <div class="section">
          <div class="section-title">4. Conferência de Devolução / Consumo</div>
          <div class="grid">
            <div class="field"><span class="label">Data Recebimento:</span> ${c.returnedAt ? new Date(c.returnedAt).toLocaleString('pt-BR') : '-'}</div>
            <div class="field"><span class="label">Armeiro Recebedor:</span> ${c.returnArmorerName || '-'}</div>
            <div class="field"><span class="label">Munições Remanescentes (Devolvidas):</span> <strong>${c.returnedQuantity ?? 0} cartuchos</strong></div>
            <div class="field"><span class="label">Munições Deflagradas / Utilizadas:</span> <strong>${consumed} cartuchos</strong></div>
            <div class="field" style="grid-column: span 2;"><span class="label">Observações:</span> ${cleanObs || 'Sem observações adicionais.'}</div>
          </div>
        </div>
        `
            : ''
        }

        <div class="declaration">
          ${
            isPermanent
              ? `Declaro ter recebido <strong>${c.quantity} cartuchos calibre ${c.caliberName}</strong> destinados a consumo institucional (${c.destinacao || 'Operacional'}), assumindo responsabilidade pelo emprego estritamente legal e regulamentar.`
              : `Declaro ter recebido em perfeitas condições <strong>${c.quantity} cartuchos calibre ${c.caliberName}</strong>, comprometendo-me a zelar pela sua guarda e conservação, bem como a restituir as munições remanescentes e prestar contas de eventuais disparos efetuados.`
          }
        </div>

        <div class="signatures">
          <div class="sig-line">
            <strong>${c.requesterName}</strong><br/>
            ${c.requesterCargo || 'Policial Civil'}<br/>
            MASP: ${c.requesterMasp}
          </div>
          <div class="sig-line">
            <strong>${isReturned ? c.returnArmorerName || c.armorerName || 'Armeiro' : c.armorerName || 'Armeiro'}</strong><br/>
            ${isReturned ? returnArmorerCargo : armorerCargo}<br/>
            MASP: ${(isReturned ? returnArmorerUser?.masp : c.armorerMasp) || c.armorerMasp || '-'}
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
  // RENDERIZADORES REUTILIZÁVEIS DE BADGES E CARDS
  // =========================================================================

  const renderStatusBadge = (status: string, seraDevolvida: boolean) => {
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
        return seraDevolvida ? (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Ativa (Passiva de Devolução)
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center gap-1">
            <Flame className="w-3 h-3" /> Ativa (Munição de Consumo)
          </span>
        );
      case 'DEVOLVIDA':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Devolvida
          </span>
        );
      case 'CONSUMIDA':
        return (
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-700/60 text-slate-300 border border-slate-600 flex items-center gap-1">
            <Flame className="w-3 h-3" /> Consumo Encerrado
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

  const renderLinkBadge = (c: CautelaMunicao) => {
    if (isLinkedToWeapon(c)) {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
          <Link2 className="w-3 h-3" /> Vinculada • {c.linkedWeaponModel || 'Arma'} {c.linkedWeaponSerialNumber ? `(Nº ${c.linkedWeaponSerialNumber})` : ''}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
        <Layers className="w-3 h-3" /> Avulsa
      </span>
    );
  };

  const renderCautelaCard = (
    c: CautelaMunicao,
    options?: {
      allowReturnByOwner?: boolean;
      allowArmorerActions?: boolean;
      pinnedActiveBanner?: boolean;
    }
  ) => {
    const linked = isLinkedToWeapon(c);
    const cleanObs = stripInternalTags(c.observations);
    const jointPending = c.status === 'DEVOLUCAO_PENDENTE' && linked && isPendingJointWeaponReturn(c);
    const ammoOnlyPending = c.status === 'DEVOLUCAO_PENDENTE' && linked && !isPendingJointWeaponReturn(c);

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
              {renderLinkBadge(c)}
              {jointPending && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Devolução Conjunta c/ Arma
                </span>
              )}
              {ammoOnlyPending && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                  Devolução Somente Munição
                </span>
              )}
              {c.unitId && hasDeptWideScope && !isPolicial && (
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                  {getUnitName(c.unitId)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <Disc className="w-5 h-5 text-amber-400 shrink-0" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  {c.quantity}x Cartuchos Calibre {c.caliberName}
                </h3>
                <p className="text-xs text-slate-400">
                  Tipo: <strong className="text-slate-200">{c.tipoMunicao || 'Operacional'}</strong>
                  {c.pesoMunicao ? (
                    <>
                      {' '}• Peso: <strong className="text-slate-200">{c.pesoMunicao}</strong>
                    </>
                  ) : null}
                  {c.destinacao ? (
                    <>
                      {' '}• Destinação: <strong className="text-amber-300">{c.destinacao}</strong>
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Solicitante</span>
                <strong className="text-slate-200">{c.requesterName}</strong>
                <span className="block text-[10px] font-mono text-amber-400">MASP: {c.requesterMasp}</span>
              </div>

              {!isPolicial ? (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Cofre / Lote</span>
                  <strong className="text-cyan-400 font-mono">{getVaultCode(c.vaultSpaceId)}</strong>
                  <span className="block text-[10px] text-slate-400">
                    {c.fabricante ? `${c.fabricante} • ` : ''}Lote: {c.loteMunicao || 'A definir'}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Lote / Fabricante</span>
                  <strong className="text-slate-200">
                    {c.fabricante || 'Padrão'} {c.loteMunicao ? `• Lote ${c.loteMunicao}` : ''}
                  </strong>
                  <span className="block text-[10px] text-slate-400">
                    Solicitado em {new Date(c.requestDate).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Motivo / Justificativa</span>
                <strong className="text-slate-300 line-clamp-2">{c.reason}</strong>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Situação de Retorno</span>
                {c.status === 'DEVOLVIDA' || c.status === 'CONSUMIDA' ? (
                  <strong className="text-cyan-300">
                    Remanescentes: {c.returnedQuantity ?? 0}/{c.quantity} un.
                  </strong>
                ) : c.status === 'DEVOLUCAO_PENDENTE' ? (
                  <strong className="text-purple-300">
                    Informado p/ devolver: {c.returnedQuantity ?? 0}/{c.quantity} un.
                  </strong>
                ) : c.seraDevolvida ? (
                  <strong className="text-emerald-300">Passiva de Devolução</strong>
                ) : (
                  <strong className="text-orange-300">Consumo (Sem Devolução)</strong>
                )}
                {c.authorizedAt && (
                  <span className="block text-[10px] text-slate-500">
                    Autorizada: {new Date(c.authorizedAt).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            </div>

            {jointPending && !isPolicial && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center gap-3">
                <span className="font-bold flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                  Arma vinculada aguardando recebimento em conjunto: {c.linkedWeaponModel || 'Armamento'} Nº {c.linkedWeaponSerialNumber || '-'}
                </span>
                {c.linkedWeaponHadShots && (
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 font-mono text-[11px]">
                    Policial informou disparos: {c.linkedWeaponShotsFired || 0} tiros
                  </span>
                )}
              </div>
            )}

            {cleanObs && (
              <p className="text-[11px] text-slate-400 italic px-1">
                Obs: {cleanObs}
              </p>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap lg:flex-col items-stretch justify-end gap-2 shrink-0 border-t lg:border-t-0 border-slate-800 pt-3 lg:pt-0">
            {/* Ações do Armeiro na fila de Solicitações Pendentes */}
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
                    setRejectNotes('');
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

            {/* Botão Devolver em Minhas Cautelas (Policial ou Armeiro devolvendo suas cautelas ativas passivas de devolução) */}
            {options?.allowReturnByOwner && c.status === 'AUTORIZADA' && c.seraDevolvida && (
              <button
                onClick={() => openReturnModal(c)}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
              >
                <RotateCcw className="w-4 h-4" /> Devolver Munição
              </button>
            )}

            {/* Armeiro também pode baixar diretamente cautela ativa de policial no Histórico Geral */}
            {!options?.allowReturnByOwner && canAuthorize && c.status === 'AUTORIZADA' && c.seraDevolvida && (
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
              <Disc className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20">
                Controle de Paiol • PCMG
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 mt-1">
                Cautela de Munições
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPolicial
                  ? 'Acompanhe suas munições ativas passíveis de devolução, cautelas em análise, histórico e novas solicitações.'
                  : `Gestão de pagamentos e devoluções de munições da unidade ${unitSigla}, cautelas próprias e histórico departamental.`}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('NOVA')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isPolicial ? 'Solicitar Munições' : 'Nova Cautela de Munição'}</span>
          </button>
        </div>

        {/* Navegação de Abas conforme Perfil */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-800/80">
          {/* Aba comum: Minhas Cautelas de Munições */}
          <button
            onClick={() => setActiveTab('MINHAS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
              activeTab === 'MINHAS'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Minhas Cautelas de Munições</span>
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

          {/* Abas exclusivas do Policial */}
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
                <span>Cautela de munição em analise</span>
                {policialEmAnaliseCautelas.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-md font-extrabold ${
                      activeTab === 'EM_ANALISE' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {policialEmAnaliseCautelas.length}
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
                <span>Meu Histórico Cautelas de Munições</span>
              </button>
            </>
          )}

          {/* Abas exclusivas do Armeiro / Admin / Geral */}
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
            + {isPolicial ? 'Solicitar Munições' : 'Solicitar / Acautelar'}
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-xs underline ml-4">
            Fechar
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA: NOVA SOLICITAÇÃO / CAUTELA DE MUNIÇÕES                         */}
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
                  ? 'Solicitar Munições na Unidade'
                  : canAuthorize && isDirectAuthorize
                  ? 'Acautelamento Direto de Munições (Armeiro)'
                  : 'Solicitação de Munições'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPolicial
                  ? 'Escolha o calibre, tipo e peso disponíveis em sua unidade.'
                  : 'Selecione o lote do cofre para retirada e o policial destinatário.'}
              </p>
            </div>
          </div>

          {/* Seletor de modalidade (Passiva de Devolução x Consumo) */}
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
                  Munição Passiva de Devolução
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ficará ativa em Minhas Cautelas de Munições podendo ser devolvida a qualquer momento ao paiol.
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
                  Munição de Consumo (Não Pode Ser Devolvida)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Destinada a consumo definitivo (treinamento / instrução), registrada diretamente no Histórico.
                </p>
              </div>
            </button>
          </div>

          {/* Campos de Seleção de Munição: POLICIAL (sem ver cofre nem saldo) vs ARMEIRO */}
          {isPolicial ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Calibre Disponível na Unidade *
                </label>
                <select
                  value={selectedCaliberId}
                  onChange={e => {
                    const nextCal = e.target.value;
                    setSelectedCaliberId(nextCal);
                    setSelectedTipoMunicao('');
                    setSelectedPesoMunicao('');
                  }}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="">-- Escolha o Calibre --</option>
                  {availableCaliberOptions.map(cal => (
                    <option key={cal.id} value={cal.id}>
                      {cal.name}
                    </option>
                  ))}
                </select>
                {availableCaliberOptions.length === 0 && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    Não há munições disponíveis para solicitação em sua unidade no momento.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Tipo Disponível *
                </label>
                <select
                  value={selectedTipoMunicao}
                  onChange={e => {
                    setSelectedTipoMunicao(e.target.value);
                    setSelectedPesoMunicao('');
                  }}
                  disabled={!selectedCaliberId}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">-- Escolha o Tipo --</option>
                  {availableTipoOptions.map(tipo => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Peso Disponível *
                </label>
                <select
                  value={selectedPesoMunicao}
                  onChange={e => setSelectedPesoMunicao(e.target.value)}
                  disabled={!selectedCaliberId || !selectedTipoMunicao}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">-- Escolha o Peso --</option>
                  {availablePesoOptions.map(peso => (
                    <option key={peso} value={peso}>
                      {peso}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {canAuthorize && (
                <div className="md:col-span-2 bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
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
                      <span>Confirmar pagamento imediato e subtrair do cofre agora</span>
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
                          if (matches.length === 1) {
                            setSelectedRequesterId(matches[0].id);
                          }
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

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Lote de Munição no Cofre de Origem *
                </label>
                <select
                  value={selectedStockId}
                  onChange={e => setSelectedStockId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="">-- Selecione o Lote e Cofre de Munição --</option>
                  {availableUnitStocks.map(s => (
                    <option key={s.id} value={s.id}>
                      Calibre {getStockCaliberName(s)} • {s.tipoMunicao || 'Operacional'}
                      {s.pesoMunicao ? ` (${s.pesoMunicao})` : ''} — Lote: {s.loteMunicao || 'Padrão'} — Saldo:{' '}
                      {s.quantity} un. (Cofre: {getVaultCode(s.vaultSpaceId)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Quantidade e Destinação da Munição */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Quantidade de Cartuchos *
              </label>
              <input
                type="number"
                min={1}
                value={reqQuantity}
                onChange={e => setReqQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Destinação da Munição *
              </label>
              <select
                value={reqDestinacao}
                onChange={e => handleDestinacaoChange(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="Operacional / Defesa">Operacional / Defesa</option>
                <option value="Treinamento">Treinamento</option>
                <option value="Curso Policial / Instrução">Curso Policial / Instrução</option>
                <option value="Missão Especial">Missão Especial</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label
                className={`block text-xs font-bold uppercase mb-1.5 ${
                  reqDestinacao === 'Treinamento' ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                {reqDestinacao === 'Treinamento'
                  ? 'Motivo / Justificativa do Uso — Informe Qual o Treinamento Que Vai Fazer *'
                  : 'Motivo / Justificativa do Uso *'}
              </label>
              <input
                type="text"
                value={reqReason}
                onChange={e => setReqReason(e.target.value)}
                required
                placeholder={
                  reqDestinacao === 'Treinamento'
                    ? 'Informe obrigatoriamente qual o treinamento que vai realizar (ex: Treinamento Tático de Tiro Policial)...'
                    : 'Ex: Serviço Policial Operacional, Plantão, Diligência...'
                }
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none ${
                  reqDestinacao === 'Treinamento'
                    ? 'border-amber-500/60 focus:border-amber-400'
                    : 'border-slate-700 focus:border-amber-500'
                }`}
              />
              {reqDestinacao === 'Treinamento' && (
                <p className="text-[11px] text-amber-300/90 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Obrigatório especificar qual treinamento será realizado.</span>
                </p>
              )}
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
              disabled={loading || (isPolicial && availableCaliberOptions.length === 0)}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold flex items-center space-x-2 transition disabled:opacity-50"
            >
              <span>
                {loading
                  ? 'Processando...'
                  : canAuthorize && isDirectAuthorize
                  ? 'Confirmar e Emitir Cautela'
                  : 'Enviar Solicitação de Munições'}
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ABA: MINHAS CAUTELAS DE MUNIÇÕES (POLICIAL E ARMEIRO)               */}
      {/* Ativas + Passivas de Devolução, separadas em Avulsa e Vinculada      */}
      {/* =================================================================== */}
      {activeTab === 'MINHAS' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Pesquisar nas minhas cautelas ativas por calibre, tipo, arma vinculada ou motivo..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {filteredMinhasAvulsas.length === 0 && filteredMinhasVinculadas.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Disc className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhuma cautela de munição ativa passível de devolução encontrada.
              </p>
              <p className="text-xs text-slate-500">
                Munições de consumo e cautelas já devolvidas constam na aba de Histórico.
              </p>
            </div>
          ) : (
            <>
              {/* Seção 1: Munições Avulsas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Munições Avulsas</span>
                    <span className="px-2 py-0.5 text-[10px] rounded-md bg-slate-800 text-amber-300 border border-slate-700">
                      {filteredMinhasAvulsas.length}
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-500">Sem vínculo com armamento</span>
                </div>

                {filteredMinhasAvulsas.length === 0 ? (
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 text-center text-xs text-slate-500">
                    Nenhuma cautela de munição avulsa ativa no momento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMinhasAvulsas.map(c =>
                      renderCautelaCard(c, { allowReturnByOwner: true })
                    )}
                  </div>
                )}
              </div>

              {/* Seção 2: Munições Vinculadas */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-black uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-400" />
                    <span>Munições Vinculadas</span>
                    <span className="px-2 py-0.5 text-[10px] rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {filteredMinhasVinculadas.length}
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Podem ser devolvidas com ou sem o armamento vinculado
                  </span>
                </div>

                {filteredMinhasVinculadas.length === 0 ? (
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 text-center text-xs text-slate-500">
                    Nenhuma cautela de munição vinculada a armamento ativa no momento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMinhasVinculadas.map(c =>
                      renderCautelaCard(c, { allowReturnByOwner: true })
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA POLICIAL: CAUTELA DE MUNIÇÃO EM ANALISE                         */}
      {/* Sem busca e sem filtro — apenas pendentes de comando/recibo armeiro  */}
      {/* =================================================================== */}
      {activeTab === 'EM_ANALISE' && isPolicial && (
        <div className="space-y-4">
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-amber-200">
                Cautelas de Munição em Análise pelo Armeiro
              </h3>
              <p className="text-xs text-slate-400">
                Exibindo todas as suas cautelas pendentes de pagamento ou pendentes de recibo de devolução pelo Armeiro.
              </p>
            </div>
          </div>

          {policialEmAnaliseCautelas.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Não há cautelas de munição pendentes de análise ou recibo no momento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {policialEmAnaliseCautelas.map(c => renderCautelaCard(c))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA POLICIAL: MEU HISTÓRICO CAUTELAS DE MUNIÇÕES                    */}
      {/* Consumo + Devolvidas, com Cautelas Ativas separadas e fixas no topo */}
      {/* =================================================================== */}
      {activeTab === 'MEU_HISTORICO' && isPolicial && (
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Pesquisar no meu histórico por calibre, lote, motivo ou arma..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
              {(['TODOS', 'AVULSA', 'VINCULADA'] as const).map(lf => (
                <button
                  key={lf}
                  onClick={() => setLinkFilter(lf)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition ${
                    linkFilter === lf
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {lf === 'TODOS' ? 'Todas' : lf === 'AVULSA' ? 'Avulsas' : 'Vinculadas'}
                </button>
              ))}
            </div>
          </div>

          {/* Bloco Fixo no Começo da Pesquisa: Cautelas Ativas (Munições de Consumo) */}
          <div className="bg-orange-950/15 border border-orange-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-orange-300 flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-400" />
                <span>Cautelas Ativas — Munições de Consumo (Fixadas no Topo)</span>
                <span className="px-2 py-0.5 text-[10px] rounded-md bg-orange-500/20 text-orange-200 border border-orange-500/30">
                  {filteredPolicialHistoricoAtivasFixas.length}
                </span>
              </h3>
              <span className="text-[11px] text-orange-200/70 hidden sm:inline">
                Não passíveis de devolução
              </span>
            </div>

            {filteredPolicialHistoricoAtivasFixas.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">
                Nenhuma cautela ativa de munição de consumo encontrada para a pesquisa atual.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredPolicialHistoricoAtivasFixas.map(c =>
                  renderCautelaCard(c, { pinnedActiveBanner: true })
                )}
              </div>
            )}
          </div>

          {/* Bloco de Cautelas Devolvidas / Encerradas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Cautelas Já Devolvidas / Consumo Finalizado</span>
                <span className="px-2 py-0.5 text-[10px] rounded-md bg-slate-800 text-cyan-300 border border-slate-700">
                  {filteredPolicialHistoricoEncerradas.length}
                </span>
              </h3>
            </div>

            {filteredPolicialHistoricoEncerradas.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
                <p className="text-xs text-slate-400">
                  Nenhuma cautela devolvida encontrada para os critérios informados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPolicialHistoricoEncerradas.map(c => renderCautelaCard(c))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ABA ARMEIRO: SOLICITAÇÕES PENDENTES [UNIDADE]                       */}
      {/* Filtradas por Aguardando Pagamento e Aguardando Devolução           */}
      {/* =================================================================== */}
      {activeTab === 'PENDENTES' && canAuthorize && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
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

              <div className="flex flex-wrap items-center gap-2">
                {(['TODOS', 'AVULSA', 'VINCULADA'] as const).map(lf => (
                  <button
                    key={lf}
                    onClick={() => setLinkFilter(lf)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition ${
                      linkFilter === lf
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {lf === 'TODOS' ? 'Todas' : lf === 'AVULSA' ? 'Avulsas' : 'Vinculadas'}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar policial, MASP, calibre ou Nº de série do armamento vinculado..."
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
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={
                    activeTab === 'MEU_HISTORICO'
                      ? 'Buscar no meu histórico por calibre, lote, arma vinculada ou motivo...'
                      : `Buscar no Histórico Geral ${unitSigla} (todo o departamento) por policial, MASP, calibre, lote ou arma...`
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(['TODOS', 'AVULSA', 'VINCULADA'] as const).map(lf => (
                  <button
                    key={lf}
                    onClick={() => setLinkFilter(lf)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition ${
                      linkFilter === lf
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {lf === 'TODOS' ? 'Avulsas + Vinculadas' : lf === 'AVULSA' ? 'Avulsas' : 'Vinculadas'}
                  </button>
                ))}
              </div>
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
              <Disc className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhum registro de cautela de munições encontrado.
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
      {/* MODAL ARMEIRO: CONFIRMAR PAGAMENTO / RETIRADA DE MUNIÇÕES           */}
      {/* =================================================================== */}
      {authorizeModalItem && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmAuthorize}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl my-auto"
          >
            <div className="flex items-center space-x-2 text-emerald-400 border-b border-slate-800 pb-3">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-100">
                Confirmar Pagamento / Retirada de Munições
              </h3>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Solicitante:</span>
                <strong className="text-slate-100">
                  {authorizeModalItem.requesterName} (MASP: {authorizeModalItem.requesterMasp})
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Munição Solicitada:</span>
                <strong className="text-amber-400">
                  {authorizeModalItem.quantity}x {authorizeModalItem.caliberName} •{' '}
                  {authorizeModalItem.tipoMunicao || 'Operacional'}
                  {authorizeModalItem.pesoMunicao ? ` (${authorizeModalItem.pesoMunicao})` : ''}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Destinação / Motivo:</span>
                <strong className="text-slate-200 text-right max-w-[65%]">
                  {authorizeModalItem.destinacao ? `${authorizeModalItem.destinacao} — ` : ''}
                  {authorizeModalItem.reason}
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-400 uppercase mb-1.5">
                Cofre e Lote de Origem (Subtrair do Estoque) *
              </label>
              <select
                value={authSelectedStockId}
                onChange={e => setAuthSelectedStockId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Selecione o Cofre / Lote de Munições --</option>
                {compatibleStocksForAuthorizeModal.map(s => (
                  <option key={s.id} value={s.id}>
                    Cofre: {getVaultCode(s.vaultSpaceId)} • {s.tipoMunicao || 'Operacional'}
                    {s.pesoMunicao ? ` (${s.pesoMunicao})` : ''} • Lote: {s.loteMunicao || 'Padrão'} — Saldo:{' '}
                    {s.quantity} un.
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Ao confirmar o pagamento, <strong>{authorizeModalItem.quantity} cartuchos</strong> serão subtraídos imediatamente do cofre selecionado.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Regime de Devolução
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAuthSeraDevolvida(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    authSeraDevolvida
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Passiva de Devolução
                </button>
                <button
                  type="button"
                  onClick={() => setAuthSeraDevolvida(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    !authSeraDevolvida
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Consumo (Sem Devolução)
                </button>
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
                placeholder="Observação opcional na entrega das munições..."
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
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
              >
                {loading ? 'Confirmando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: DEVOLUÇÃO DE MUNIÇÕES (POLICIAL SOLICITA / ARMEIRO CONFIRMA) */}
      {/* Com suporte a Munições Vinculadas (Com ou Sem Armamento em Conjunto) */}
      {/* =================================================================== */}
      {returnModalItem && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleReturnSubmit}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl space-y-4 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-cyan-400">
                <RotateCcw className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-100">
                  {isPolicial
                    ? 'Solicitar Devolução de Munições'
                    : 'Confirmar Recebimento de Devolução'}
                </h3>
              </div>
              {renderLinkBadge(returnModalItem)}
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Policial:</span>
                <strong className="text-slate-100">
                  {returnModalItem.requesterName} (MASP: {returnModalItem.requesterMasp})
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Munições Acauteladas:</span>
                <strong className="text-amber-400">
                  {returnModalItem.quantity} cartuchos • Calibre {returnModalItem.caliberName} (
                  {returnModalItem.tipoMunicao || 'Operacional'})
                </strong>
              </div>
              {isLinkedToWeapon(returnModalItem) && (
                <div className="flex justify-between pt-1 border-t border-slate-800/80">
                  <span className="text-indigo-300">Armamento Vinculado:</span>
                  <strong className="text-indigo-200">
                    {returnModalItem.linkedWeaponModel || 'Arma'} — Nº Série:{' '}
                    {returnModalItem.linkedWeaponSerialNumber || 'N/I'}
                  </strong>
                </div>
              )}
            </div>

            {/* Opção para Munições Vinculadas: Devolver COM ou SEM o armamento vinculado */}
            {isLinkedToWeapon(returnModalItem) && returnModalItem.linkedWeaponStatus !== 'DEVOLVIDA' && (
              <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-4 space-y-3">
                <label className="block text-xs font-bold text-indigo-300 uppercase">
                  {isPolicial
                    ? 'Como deseja devolver esta munição vinculada?'
                    : 'Recebimento do Armamento Vinculado'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReturnWithWeapon(false)}
                    className={`p-3 rounded-xl border text-left transition ${
                      !returnWithWeapon
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100 ring-1 ring-cyan-400/40'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Sem o Armamento Vinculado</div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {isPolicial
                        ? 'Devolve apenas as munições agora e mantém o armamento acautelado.'
                        : 'Baixa apenas a cautela de munições (mantém cautela da arma ativa).'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnWithWeapon(true)}
                    className={`p-3 rounded-xl border text-left transition ${
                      returnWithWeapon
                        ? 'bg-amber-500/20 border-amber-400 text-amber-100 ring-1 ring-amber-400/40'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Com o Armamento Vinculado (Em Conjunto)</span>
                    </div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {isPolicial
                        ? 'Devolve as munições e o armamento vinculado simultaneamente.'
                        : 'Confirma recebimento da arma em conjunto e baixa ambas as cautelas.'}
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Quantidade de Munições Remanescentes e Cofre de Munições */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Munições Remanescentes (Devolvidas Intactas) *
                </label>
                <input
                  type="number"
                  min={0}
                  max={returnModalItem.quantity}
                  value={returnedQty}
                  onChange={e =>
                    setReturnedQty(
                      Math.min(
                        returnModalItem.quantity,
                        Math.max(0, parseInt(e.target.value || '0', 10))
                      )
                    )
                  }
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">
                  Deflagradas / Utilizadas
                </span>
                <span className="text-lg font-black text-amber-400 font-mono">
                  {Math.max(0, returnModalItem.quantity - returnedQty)} cartuchos
                </span>
              </div>
            </div>

            {/* Seleção de Cofre de Destino das Munições (Somente Armeiro ao confirmar) */}
            {!isPolicial && canAuthorize && (
              <div>
                <label className="block text-xs font-bold text-cyan-400 uppercase mb-1.5">
                  Cofre de Munições de Retorno (Destino das Remanescentes) *
                </label>
                <select
                  value={returnAmmoVaultId}
                  onChange={e => setReturnAmmoVaultId(e.target.value)}
                  required={returnedQty > 0}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">-- Selecione o Cofre de Munições --</option>
                  {scopedVaults.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.code} {v.description ? `— ${v.description}` : ''}
                    </option>
                  ))}
                </select>
                {returnedQty > 0 && (
                  <p className="text-[11px] text-cyan-300/80 mt-1">
                    As <strong>{returnedQty} munições remanescentes</strong> serão somadas ao estoque deste cofre.
                  </p>
                )}
              </div>
            )}

            {/* Campos de Devolução em Conjunto do Armamento Vinculado */}
            {returnWithWeapon && (
              <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4" />
                    Dados de Recebimento do Armamento em Conjunto ({returnModalItem.linkedWeaponModel} Nº{' '}
                    {returnModalItem.linkedWeaponSerialNumber})
                  </span>
                </div>

                {/* Cofre de Armas de Destino (Armeiro escolhe para qual cofre de armas a arma vai) */}
                {!isPolicial && canAuthorize && (
                  <div>
                    <label className="block text-xs font-bold text-amber-400 uppercase mb-1.5">
                      Cofre de Armas de Destino (Para qual cofre a arma vai) *
                    </label>
                    <select
                      value={returnWeaponVaultId}
                      onChange={e => setReturnWeaponVaultId(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="">-- Selecione o Cofre de Armas --</option>
                      {scopedVaults.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.code} {v.description ? `— ${v.description}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Carregadores Devolvidos
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={returnWeaponReturnedMags}
                      onChange={e =>
                        setReturnWeaponReturnedMags(Math.max(0, parseInt(e.target.value || '0', 10)))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Houve Disparos (Teve Tiros)?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReturnWeaponHadShots(false);
                          setReturnWeaponShotsFired(0);
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          !returnWeaponHadShots
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReturnWeaponHadShots(true);
                          if (returnWeaponShotsFired <= 0) {
                            const suggested = Math.max(1, returnModalItem.quantity - returnedQty);
                            setReturnWeaponShotsFired(suggested);
                          }
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          returnWeaponHadShots
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        Sim, Teve Tiros
                      </button>
                    </div>
                  </div>
                </div>

                {returnWeaponHadShots && (
                  <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3">
                    <label className="block text-xs font-bold text-rose-300 uppercase mb-1">
                      Quantidade de Tiros Efetuados no Armamento *
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={returnWeaponShotsFired}
                      onChange={e =>
                        setReturnWeaponShotsFired(Math.max(1, parseInt(e.target.value || '1', 10)))
                      }
                      required
                      className="w-full bg-slate-900 border border-rose-500/40 rounded-xl px-3 py-2 text-sm text-slate-100"
                    />
                    <p className="text-[11px] text-rose-200/80 mt-1">
                      Ao confirmar o recebimento pelo Armeiro, esta quantidade será somada ao histórico de tiros do armamento (TIROS_DISPARADOS_ARMAS).
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Condições de Uso da Arma
                    </label>
                    <select
                      value={returnWeaponIsWorking ? 'OK' : 'DEFEITO'}
                      onChange={e => setReturnWeaponIsWorking(e.target.value === 'OK')}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="OK">Em perfeitas condições</option>
                      <option value="DEFEITO">Apresentou defeito / avaria</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Apresentou Pane?
                    </label>
                    <select
                      value={returnWeaponHadMalfunction ? 'SIM' : 'NAO'}
                      onChange={e => setReturnWeaponHadMalfunction(e.target.value === 'SIM')}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                    >
                      <option value="NAO">Não apresentou pane</option>
                      <option value="SIM">Sim, apresentou pane</option>
                    </select>
                  </div>
                </div>

                {!returnWeaponIsWorking && (
                  <div>
                    <label className="block text-xs font-bold text-rose-300 uppercase mb-1">
                      Descrição do Defeito *
                    </label>
                    <input
                      type="text"
                      value={returnWeaponDefectDesc}
                      onChange={e => setReturnWeaponDefectDesc(e.target.value)}
                      required
                      placeholder="Descreva o defeito apresentado pelo armamento..."
                      className="w-full bg-slate-900 border border-rose-500/40 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                )}

                {returnWeaponHadMalfunction && (
                  <div>
                    <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                      Descrição da Pane *
                    </label>
                    <input
                      type="text"
                      value={returnWeaponMalfunctionDesc}
                      onChange={e => setReturnWeaponMalfunctionDesc(e.target.value)}
                      required
                      placeholder="Descreva a pane ocorrida..."
                      className="w-full bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Observações / Relato de Uso
              </label>
              <textarea
                rows={2}
                value={returnObs}
                onChange={e => setReturnObs(e.target.value)}
                placeholder="Informe justificativa caso haja munições deflagradas ou observações de conferência..."
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
                  ? returnWithWeapon
                    ? 'Enviar Devolução Conjunta (Arma + Munição)'
                    : 'Enviar Devolução de Munições'
                  : returnWithWeapon
                  ? 'Confirmar Baixa Conjunta (Arma + Munição)'
                  : 'Confirmar Devolução de Munições'}
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
              Recusar Solicitação de Munições
            </h3>
            <p className="text-xs text-slate-400">
              Informe o motivo da recusa para <strong>{rejectModalItem.requesterName}</strong>:
            </p>
            <textarea
              rows={3}
              required
              value={rejectNotes}
              onChange={e => setRejectNotes(e.target.value)}
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
                Detalhes da Cautela de Munições
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
              {renderLinkBadge(detailItem)}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Calibre / Quantidade</span>
                <strong className="text-amber-400">
                  {detailItem.quantity}x {detailItem.caliberName}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Modalidade</span>
                <strong className={detailItem.seraDevolvida ? 'text-emerald-400' : 'text-orange-400'}>
                  {detailItem.seraDevolvida ? 'Passiva de Devolução' : 'Munição de Consumo'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Solicitante</span>
                <strong className="text-slate-200">
                  {detailItem.requesterName} ({detailItem.requesterMasp})
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Tipo / Peso / Lote</span>
                <strong className="text-slate-200">
                  {detailItem.tipoMunicao || 'Operacional'}
                  {detailItem.pesoMunicao ? ` • ${detailItem.pesoMunicao}` : ''} • Lote:{' '}
                  {detailItem.loteMunicao || 'Padrão'}
                </strong>
              </div>
              {!isPolicial && (
                <div>
                  <span className="text-slate-500 block">Cofre</span>
                  <strong className="text-cyan-400">{getVaultCode(detailItem.vaultSpaceId)}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-500 block">Destinação</span>
                <strong className="text-slate-200">{detailItem.destinacao || 'Operacional'}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Armeiro Autorizador</span>
                <strong className="text-slate-200">{detailItem.armorerName || 'Aguardando'}</strong>
              </div>
              {detailItem.returnedAt && (
                <div>
                  <span className="text-slate-500 block">Remanescentes Devolvidas</span>
                  <strong className="text-cyan-400">
                    {detailItem.returnedQuantity ?? 0} de {detailItem.quantity} un.
                  </strong>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-slate-500 block">Motivo / Justificativa</span>
                <strong className="text-slate-200">{detailItem.reason}</strong>
              </div>
              {stripInternalTags(detailItem.observations) && (
                <div className="col-span-2">
                  <span className="text-slate-500 block">Observações</span>
                  <strong className="text-slate-300">
                    {stripInternalTags(detailItem.observations)}
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
