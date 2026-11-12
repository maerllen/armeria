import React, { useState, useMemo, useCallback } from 'react';
import { 
  User, Weapon, CautelaArma, AmmunitionStock, Caliber, VaultSpace, Unit, Department, getSystemLogo 
} from '../types';
import { storage } from '../services/storage';
import { 
  Shield, Crosshair, Disc, AlertCircle, Check, Clock, Search, 
  Printer, ArrowRightLeft, CheckCircle2, XCircle, FileText, 
  ChevronRight, Sparkles, Filter, AlertTriangle, RotateCcw, Eye, Lock, X, Trash2, Edit2
} from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface ModuloCautelaArmasProps {
  currentUser: User;
  weapons: Weapon[];
  ammoStocks: AmmunitionStock[];
  calibers: Caliber[];
  vaultSpaces: VaultSpace[];
  units: Unit[];
  departments: Department[];
  onRefresh: () => void | Promise<void>;
}

export const ModuloCautelaArmas: React.FC<ModuloCautelaArmasProps> = ({
  currentUser,
  weapons,
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
  const isArmeiroOrAdmin = !isPolicial && (isGeral || isArmeiro || isAdmin);
  const canAuthorize = isArmeiroOrAdmin;

  const userUnit = useMemo(() => {
    return units.find(u => u.id === currentUser.unitId);
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

  // Tabs: Solicitações Pendentes, Deferidas (Unidade), Deferidas/Ativas Própria (Armeiro), Histórico de cautelas (Unidade), Indeferidas, Nova
  const [activeTab, setActiveTab] = useState<'MINHAS' | 'DEFERIDAS' | 'DEFERIDAS_PROPRIA' | 'HISTORICO_UNIDADE' | 'INDEFERIDAS' | 'NOVA'>('MINHAS');
  const [pendentesSubFilter, setPendentesSubFilter] = useState<'TODAS' | 'SOLICITACOES' | 'DEVOLUCOES'>('TODAS');
  const [deferidasSubFilter, setDeferidasSubFilter] = useState<'TODAS' | 'ATIVAS' | 'DEVOLVIDAS'>('ATIVAS');
  const [propriaSubFilter, setPropriaSubFilter] = useState<'TODAS' | 'ATIVAS' | 'DEVOLVIDAS'>('ATIVAS');

  const [lastDirectCautelaArma, setLastDirectCautelaArma] = useState<CautelaArma | null>(null);
  const [lastReceivedReturnInfo, setLastReceivedReturnInfo] = useState<{
    cautela: CautelaArma;
    overrides: {
      weaponVaultId?: string;
      ammoVaultId?: string;
      returnedAmmoQty?: number;
      returnArmorerName?: string;
      returnArmorerMasp?: string;
      returnArmorerCargo?: string;
      returnDateIso?: string;
      hadShots?: boolean;
      shotsFired?: number;
      isWorking?: boolean;
      defectDescription?: string | null;
      hadMalfunction?: boolean;
      malfunctionDescription?: string | null;
      returnedMagazinesCount?: number;
      returnObservations?: string;
      forceReturnAmmo?: boolean;
    };
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'DEFERIDAS' | 'INDEFERIDAS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLUCAO_PENDENTE' | 'DEVOLVIDA' | 'RECUSADA'>('TODOS');
  const [historyWeaponFilter, setHistoryWeaponFilter] = useState<string>('TODAS');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');
  const [historyDecisionFilter, setHistoryDecisionFilter] = useState<'TODAS' | 'ATIVAS' | 'DEFERIDA' | 'INDEFERIDAS'>('TODAS');

  // Filtros exclusivos da aba "Deferidas/Ativas <Sigla>" (Armeiro)
  const [deferidasUserFilter, setDeferidasUserFilter] = useState<string>('TODOS');
  const [deferidasWeaponFilter, setDeferidasWeaponFilter] = useState<string>('TODAS');
  const [deferidasSerialFilter, setDeferidasSerialFilter] = useState<string>('');

  // Filtros exclusivos da aba "Indeferidas <Sigla>" (Armeiro)
  const [indeferidasUserFilter, setIndeferidasUserFilter] = useState<string>('TODOS');
  const [indeferidasWeaponFilter, setIndeferidasWeaponFilter] = useState<string>('TODAS');
  const [indeferidasSerialFilter, setIndeferidasSerialFilter] = useState<string>('');

  // Filtros exclusivos da aba "Histórico de cautelas <Unidade>" (Armeiro)
  const [unitHistoryUserFilter, setUnitHistoryUserFilter] = useState<string>('TODOS');
  const [unitHistoryWeaponFilter, setUnitHistoryWeaponFilter] = useState<string>('TODAS');
  const [unitHistoryDateFilter, setUnitHistoryDateFilter] = useState<string>('');

  // Modal de Emissão de Relatório de Cautelas da Unidade (Armeiro)
  const [isArmorerReportModalOpen, setIsArmorerReportModalOpen] = useState(false);
  const [armorerReportScope, setArmorerReportScope] = useState<
    'POR_ARMA' | 'POR_POLICIAL' | 'ATIVAS' | 'ATIVAS_E_INATIVAS' | 'SOMENTE_INATIVAS'
  >('POR_ARMA');
  const [armorerReportWeaponKey, setArmorerReportWeaponKey] = useState<string>('');
  const [armorerReportWeaponSearch, setArmorerReportWeaponSearch] = useState<string>('');
  const [armorerReportUserKey, setArmorerReportUserKey] = useState<string>('');
  const [armorerReportUserSearch, setArmorerReportUserSearch] = useState<string>('');
  const [armorerReportStatusSubFilter, setArmorerReportStatusSubFilter] = useState<
    'TODAS' | 'ATIVAS' | 'INATIVAS'
  >('TODAS');

  // Modal de Impressão do Histórico de Cautelas (Policial)
  const [isPrintHistoryModalOpen, setIsPrintHistoryModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'COMPLETO' | 'FILTRADO'>('COMPLETO');
  const [printStartDate, setPrintStartDate] = useState<string>('');
  const [printEndDate, setPrintEndDate] = useState<string>('');
  const [printWeaponFilter, setPrintWeaponFilter] = useState<string>('TODAS');
  const [printStatusFilter, setPrintStatusFilter] = useState<'TODAS' | 'ATIVAS' | 'DEVOLVIDAS' | 'INDEFERIDAS' | 'DEFERIDAS'>('TODAS');
  
  // Modal de Devolução
  const [returningCautela, setReturningCautela] = useState<CautelaArma | null>(null);
  const [hadShots, setHadShots] = useState(false);
  const [shotsFired, setShotsFired] = useState<number>(0);
  const [isWorking, setIsWorking] = useState(true);
  const [defectDescription, setDefectDescription] = useState('');
  const [hadMalfunction, setHadMalfunction] = useState(false);
  const [malfunctionDescription, setMalfunctionDescription] = useState('');
  const [returnedMagazinesCount, setReturnedMagazinesCount] = useState<number>(1);
  const [returnObservations, setReturnObservations] = useState('');
  const [returnVaultSpaceId, setReturnVaultSpaceId] = useState('');
  const [returnAmmoUsedCount, setReturnAmmoUsedCount] = useState<number>(0);
  const [returnedAmmoQuantity, setReturnedAmmoQuantity] = useState<number>(0);
  const [returnAmmoVaultSpaceId, setReturnAmmoVaultSpaceId] = useState('');
  const [forceReturnAmmoToVault, setForceReturnAmmoToVault] = useState(false);

  // Modal de Nova Solicitação de Cautela
  const [selectedWeaponId, setSelectedWeaponId] = useState('');
  const [reason, setReason] = useState('');
  const [magazineQuantity, setMagazineQuantity] = useState<number>(2);
  const [requestAmmoTogether, setRequestAmmoTogether] = useState(true);
  const [ammoQuantity, setAmmoQuantity] = useState<number>(30);
  const [ammoDestinacao, setAmmoDestinacao] = useState<'Defesa' | 'Treinamento'>('Defesa');
  const [ammoType, setAmmoType] = useState('Operacional');
  const [ammoLot, setAmmoLot] = useState('Lote Unidade');
  const [ammoSeraDevolvida, setAmmoSeraDevolvida] = useState(true);

  // Armorer Direct Cautela State (Acautelar para policial sem solicitação prévia)
  const [isDirectCautela, setIsDirectCautela] = useState(false);
  const [targetOfficerId, setTargetOfficerId] = useState('');
  const [selectedAmmoStockId, setSelectedAmmoStockId] = useState('');

  // Modal de Autorização pelo Armeiro (seleciona cofre/lote e permanente vs devolver depois)
  const [authorizingCautela, setAuthorizingCautela] = useState<CautelaArma | null>(null);
  const [cancelPendingModal, setCancelPendingModal] = useState<CautelaArma | null>(null);
  const [editingCautela, setEditingCautela] = useState<CautelaArma | null>(null);
  const [editWeaponId, setEditWeaponId] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editWantsAmmo, setEditWantsAmmo] = useState(false);
  const [editAmmoTipo, setEditAmmoTipo] = useState('');
  const [editAmmoPeso, setEditAmmoPeso] = useState('');
  const [activeCautelaWarningModal, setActiveCautelaWarningModal] = useState<CautelaArma[] | null>(null);
  const [hasDismissedActiveWarning, setHasDismissedActiveWarning] = useState(false);
  const [authWithAmmo, setAuthWithAmmo] = useState(false);
  const [authStockId, setAuthStockId] = useState('');
  const [authAmmoQty, setAuthAmmoQty] = useState<number>(30);
  const [authAmmoDestinacao, setAuthAmmoDestinacao] = useState<'Treinamento' | 'Defesa' | 'Ensaio'>('Defesa');
  const [authSeraDevolvida, setAuthSeraDevolvida] = useState(true);
  const [authNotes, setAuthNotes] = useState('');

  // Modal de Edição de Cautela Deferida/Ativa pelo Armeiro (permitida somente em até 15 minutos após a autorização)
  const [editingActiveCautela, setEditingActiveCautela] = useState<CautelaArma | null>(null);
  const [activeEditRequesterId, setActiveEditRequesterId] = useState('');
  const [activeEditWeaponId, setActiveEditWeaponId] = useState('');
  const [activeEditMagazines, setActiveEditMagazines] = useState<number>(2);
  const [activeEditReason, setActiveEditReason] = useState('');
  const [activeEditWithAmmo, setActiveEditWithAmmo] = useState(false);
  const [activeEditAmmoQty, setActiveEditAmmoQty] = useState<number>(30);
  const [activeEditAmmoDestinacao, setActiveEditAmmoDestinacao] = useState<'Treinamento' | 'Defesa' | 'Ensaio'>('Defesa');
  const [activeEditStockId, setActiveEditStockId] = useState('');
  const [activeEditSeraDevolvida, setActiveEditSeraDevolvida] = useState(true);
  const [activeEditNotes, setActiveEditNotes] = useState('');
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  // Indicação Informativa de Munição pelo Policial ("Desejo solicitar munições")
  const [policialWantsAmmo, setPolicialWantsAmmo] = useState(false);
  const [policialAmmoTipo, setPolicialAmmoTipo] = useState('');
  const [policialAmmoPeso, setPolicialAmmoPeso] = useState('');

  // Available officers in unit (strict unit restriction for direct checkout)
  const availableUnitOfficers = useMemo(() => {
    const allUsers = storage.getUsers();
    return allUsers.filter(u => (isGeral ? true : u.unitId === currentUser.unitId) && u.hasSystemAccess !== false);
  }, [currentUser, isGeral]);

  // Selected weapon object
  const selectedWeapon = useMemo(() => {
    return weapons.find(w => w.id === selectedWeaponId);
  }, [weapons, selectedWeaponId]);

  // Munições disponíveis na unidade correspondentes ao calibre da arma selecionada
  const availableAmmoForSelectedWeapon = useMemo(() => {
    if (!selectedWeapon) return [];
    const targetUnitId = selectedWeapon.unitId || currentUser.unitId;
    const selCal = (selectedWeapon.caliber || '').toLowerCase().trim();
    return ammoStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === targetUnitId);
      const cal = calibers.find(c => c.id === st.caliberId);
      const calName = (cal?.name || '').toLowerCase().trim();
      const matchCaliber = !selCal ||
                           (cal && (calName.includes(selCal) || selCal.includes(calName))) ||
                           (st.caliberId === selectedWeapon.caliber);
      return matchUnit && matchCaliber && st.quantity > 0;
    });
  }, [selectedWeapon, ammoStocks, calibers, currentUser.unitId, isGeral]);

  // Retorna especificações (tipo e peso) cadastradas no calibre da arma e disponíveis em estoque (> 0) na unidade
  // (Sem jamais expor local do cofre ou quantidade de munições em estoque)
  const getAvailableUnitAmmoSpecsForWeapon = useCallback(
    (weapon?: Weapon | null) => {
      if (!weapon || !weapon.caliber) {
        return [] as Array<{ tipo: string; peso: string }>;
      }
      const norm = (s?: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const targetCalName = norm(weapon.caliber);
      const targetUnitId = weapon.unitId || currentUser.unitId;

      const matchingCalibers = calibers.filter(c => norm(c.name) === targetCalName);
      const matchingCaliberIds = new Set(matchingCalibers.map(c => c.id));

      const specs: Array<{ tipo: string; peso: string }> = [];

      ammoStocks.forEach(st => {
        if (Number(st.quantity) <= 0) return;

        const stVault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
        const stUnitId = st.unitId || stVault?.unitId || '';
        const matchUnit = targetUnitId ? stUnitId === targetUnitId : true;
        if (!matchUnit) return;

        const calObj = calibers.find(
          c => c.id === st.caliberId || norm(c.name) === norm(st.caliberId)
        );
        const matchCaliber =
          matchingCaliberIds.has(st.caliberId) ||
          Boolean(calObj && norm(calObj.name) === targetCalName) ||
          norm(st.caliberId) === targetCalName;
        if (!matchCaliber) return;

        const resolvedTipo = (st.tipoMunicao || calObj?.tipo || '').trim();
        if (!resolvedTipo) return;

        let resolvedPeso = (st.pesoMunicao || calObj?.peso || '').trim();
        if (!resolvedPeso) {
          const calWithSameTipo = matchingCalibers.find(
            c => norm(c.tipo) === norm(resolvedTipo) && Boolean((c.peso || '').trim())
          );
          if (calWithSameTipo?.peso) {
            resolvedPeso = calWithSameTipo.peso.trim();
          }
        }

        specs.push({
          tipo: resolvedTipo,
          peso: resolvedPeso
        });
      });

      return specs;
    },
    [ammoStocks, calibers, vaultSpaces, currentUser.unitId]
  );

  // Somente tipos cadastrados no calibre da arma e disponíveis na unidade
  const availablePoliceSpecs = useMemo(() => {
    return getAvailableUnitAmmoSpecsForWeapon(selectedWeapon);
  }, [getAvailableUnitAmmoSpecsForWeapon, selectedWeapon]);

  const availablePoliceTipos = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    availablePoliceSpecs.forEach(spec => {
      const key = spec.tipo.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(spec.tipo.trim());
      }
    });
    return result;
  }, [availablePoliceSpecs]);

  // Somente pesos cadastrados no tipo selecionado do calibre da arma e disponíveis na unidade
  const availablePolicePesos = useMemo(() => {
    if (!policialAmmoTipo) return [];
    const selectedTipoNorm = policialAmmoTipo.trim().toLowerCase().replace(/\s+/g, ' ');
    const seen = new Set<string>();
    const result: string[] = [];
    availablePoliceSpecs.forEach(spec => {
      const specTipoNorm = spec.tipo.trim().toLowerCase().replace(/\s+/g, ' ');
      if (specTipoNorm !== selectedTipoNorm) return;
      const pesoClean = spec.peso.trim();
      const pesoKey = pesoClean.toLowerCase();
      if (pesoClean && !seen.has(pesoKey)) {
        seen.add(pesoKey);
        result.push(pesoClean);
      }
    });
    return result;
  }, [availablePoliceSpecs, policialAmmoTipo]);

  // Sincroniza automaticamente o tipo e peso selecionados quando o armamento ou tipo mudam
  React.useEffect(() => {
    if (availablePoliceTipos.length === 0) {
      if (policialAmmoTipo !== '') setPolicialAmmoTipo('');
    } else if (!availablePoliceTipos.includes(policialAmmoTipo)) {
      setPolicialAmmoTipo(availablePoliceTipos[0]);
    }
  }, [availablePoliceTipos, policialAmmoTipo]);

  React.useEffect(() => {
    if (availablePolicePesos.length === 0) {
      if (policialAmmoPeso !== '') setPolicialAmmoPeso('');
    } else if (!availablePolicePesos.includes(policialAmmoPeso)) {
      setPolicialAmmoPeso(availablePolicePesos[0]);
    }
  }, [availablePolicePesos, policialAmmoPeso]);

  // Auto-sync ammo stock selection when available ammo changes
  React.useEffect(() => {
    if (availableAmmoForSelectedWeapon.length > 0) {
      const currentExists = availableAmmoForSelectedWeapon.find(s => s.id === selectedAmmoStockId);
      if (!currentExists) {
        const first = availableAmmoForSelectedWeapon[0];
        setSelectedAmmoStockId(first.id);
        setAmmoType(first.tipoMunicao || 'Operacional');
        setAmmoLot(first.loteMunicao || 'Lote Unidade');
        setAmmoQuantity(Math.min(30, first.quantity));
      }
    } else {
      setSelectedAmmoStockId('');
      setAmmoQuantity(0);
    }
  }, [availableAmmoForSelectedWeapon, selectedAmmoStockId]);

  // Modal de Detalhes / Termo de Cautela
  const [viewingCautela, setViewingCautela] = useState<CautelaArma | null>(null);
  const [notesModal, setNotesModal] = useState<{ id: string; action: 'AUTORIZAR' | 'RECUSAR'; weaponId?: string; weaponSerialNumber?: string } | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localSyncTick, setLocalSyncTick] = useState(0);

  // Lista de cautelas reativa às ações locais e sincronizações do servidor
  const allCautelas = useMemo(() => {
    void localSyncTick;
    return [...storage.getCautelasArmas()];
  }, [weapons, ammoStocks, localSyncTick]);

  // Função auxiliar para verificar status pendente de autorização inicial
  const isPendingStatus = (st: string) => {
    const s = (st || '').trim().toUpperCase();
    return s === 'PENDENTE' || s === 'PENDENTE DE RECIBO' || s === 'PENDENTE RECIBO' || s === 'CAUTELA PENDENTE';
  };

  // Verifica se a cautela está aguardando algum comando do armeiro (autorização/análise inicial ou recibo de devolução)
  const isAwaitingArmorerCommand = (st: string) => {
    const s = (st || '').trim().toUpperCase();
    return isPendingStatus(s) || s === 'DEVOLUCAO_PENDENTE' || s === 'DEVOLUÇÃO PENDENTE';
  };

  // Normalizador de texto para busca insensível a caixa, acentos e espaços extras
  const normalizeStr = (s?: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Limpeza de dígitos para comparação flexível de MASP
  const cleanDigits = (s?: string) => (s || '').replace(/\D/g, '');

  // Verifica se a cautela pertence ao policial atual (por ID, MASP com/sem formatação, ou Nome)
  const isUserCautela = useCallback((c: CautelaArma | null | undefined): boolean => {
    if (!c) return false;

    // 1. Match direto por ID de requerente
    if (c.requesterId && currentUser.id && c.requesterId === currentUser.id) {
      return true;
    }

    // 2. Match por MASP exato
    const userMasp = (currentUser.masp || '').trim().toLowerCase();
    const reqMasp = (c.requesterMasp || '').trim().toLowerCase();
    if (userMasp && reqMasp && userMasp === reqMasp) {
      return true;
    }

    // Match por dígitos do MASP (ignora pontos, traços, barras)
    const userDigits = cleanDigits(currentUser.masp);
    const reqDigits = cleanDigits(c.requesterMasp);
    if (userDigits && reqDigits) {
      if (userDigits === reqDigits) return true;
      if (userDigits.length >= 4 && reqDigits.length >= 4) {
        if (userDigits.endsWith(reqDigits) || reqDigits.endsWith(userDigits)) return true;
      }
    }

    // 3. Match por Nome (normalizado sem acentos)
    const userNorm = normalizeStr(currentUser.name);
    const reqNorm = normalizeStr(c.requesterName);
    if (userNorm && reqNorm) {
      if (userNorm === reqNorm) return true;
      if (userNorm.length >= 4 && reqNorm.length >= 4) {
        if (userNorm.includes(reqNorm) || reqNorm.includes(userNorm)) return true;
      }
      const userParts = userNorm.split(/\s+/).filter(p => p.length > 2);
      const reqParts = reqNorm.split(/\s+/).filter(p => p.length > 2);
      if (userParts.length >= 2 && reqParts.length >= 2) {
        const firstMatch = userParts[0] === reqParts[0];
        const lastMatch = userParts[userParts.length - 1] === reqParts[reqParts.length - 1];
        if (firstMatch && lastMatch) return true;
      }
    }

    // 4. Match em observação/motivo
    if (userDigits && userDigits.length >= 5) {
      const reasonDigits = cleanDigits(c.reason);
      if (reasonDigits.includes(userDigits)) return true;
    }
    if (userNorm && userNorm.length >= 5 && c.reason) {
      const reasonNorm = normalizeStr(c.reason);
      if (reasonNorm.includes(userNorm)) return true;
    }

    return false;
  }, [currentUser]);

  // Helper para verificar se uma arma pertence ao usuário atual
  const isUserWeapon = useCallback((w: Weapon | null | undefined): boolean => {
    if (!w) return false;
    const destId = (w as any).destinatarioId || '';
    if (destId && currentUser.id && destId === currentUser.id) return true;

    const locNote = (w as any).locationNote || '';
    const polAcautelado = (w as any).policialAcautelado || '';

    const userMasp = (currentUser.masp || '').trim().toLowerCase();
    if (userMasp && (locNote.toLowerCase().includes(userMasp) || polAcautelado.toLowerCase().includes(userMasp))) {
      return true;
    }

    const userDigits = cleanDigits(currentUser.masp);
    if (userDigits && userDigits.length >= 4) {
      const locDigits = cleanDigits(locNote);
      const polDigits = cleanDigits(polAcautelado);
      if (locDigits.includes(userDigits) || polDigits.includes(userDigits)) return true;
    }

    const userNorm = normalizeStr(currentUser.name);
    if (userNorm && userNorm.length >= 4) {
      const locNorm = normalizeStr(locNote);
      const polNorm = normalizeStr(polAcautelado);
      if (locNorm.includes(userNorm) || polNorm.includes(userNorm)) return true;
    }

    return false;
  }, [currentUser]);

  // Resolve com precisão o armeiro autorizador da cautela (Nome e MASP)
  const getResolvedArmorer = useCallback((cautela: CautelaArma | null | undefined) => {
    if (!cautela) return { name: 'Armeiro da Unidade', masp: '', label: 'Armeiro da Unidade' };

    const allUsers = storage.getUsers();

    // 1. Armeiro explícito preenchido na cautela
    const rawName = (cautela.armorerName || '').trim();
    const rawMasp = (cautela.armorerMasp || '').trim();
    const isPlaceholder = !rawName || 
      rawName.toLowerCase() === 'aguardando autorização' || 
      rawName.toLowerCase() === 'aguardando autorizacao' || 
      rawName.toLowerCase() === 'pendente';

    if (!isPlaceholder) {
      return {
        name: rawName,
        masp: rawMasp,
        label: `${rawName}${rawMasp ? ` (MASP: ${rawMasp})` : ''}`
      };
    }

    // 2. Busca por ID do armeiro
    if (cautela.armorerId) {
      const u = allUsers.find(x => x.id === cautela.armorerId);
      if (u) {
        return {
          name: u.name,
          masp: u.masp || '',
          label: `${u.name}${u.masp ? ` (MASP: ${u.masp})` : ''}`
        };
      }
    }

    // 3. Busca por MASP do armeiro
    if (rawMasp) {
      const u = allUsers.find(x => x.masp === rawMasp);
      if (u) {
        return {
          name: u.name,
          masp: u.masp || rawMasp,
          label: `${u.name} (MASP: ${u.masp || rawMasp})`
        };
      }
    }

    // 4. Se a cautela estiver autorizada, pendente de recibo de devolução ou devolvida, resolve o armeiro da unidade
    if (cautela.status === 'AUTORIZADA' || cautela.status === 'DEVOLUCAO_PENDENTE' || cautela.status === 'DEVOLVIDA') {
      const targetUnitId = cautela.unitId;
      const unitArmorer = allUsers.find(u => 
        (u.role === 'Armeiro' || (u as any).activeRole === 'Armeiro') &&
        (!targetUnitId || u.unitId === targetUnitId)
      ) || allUsers.find(u => 
        (u.role === 'Administrador' || (u as any).activeRole === 'Administrador') &&
        (!targetUnitId || u.unitId === targetUnitId)
      ) || allUsers.find(u => u.role === 'Armeiro' || (u as any).activeRole === 'Armeiro')
        || allUsers.find(u => u.role === 'Administrador');

      if (unitArmorer) {
        return {
          name: unitArmorer.name,
          masp: unitArmorer.masp || '',
          label: `${unitArmorer.name}${unitArmorer.masp ? ` (MASP: ${unitArmorer.masp})` : ''}`
        };
      }

      if (canAuthorize) {
        return {
          name: currentUser.name,
          masp: currentUser.masp || '',
          label: `${currentUser.name}${currentUser.masp ? ` (MASP: ${currentUser.masp})` : ''}`
        };
      }

      return {
        name: 'Armeiro da Unidade',
        masp: '',
        label: 'Armeiro da Unidade'
      };
    }

    return {
      name: 'Aguardando autorização',
      masp: '',
      label: 'Aguardando autorização'
    };
  }, [currentUser, canAuthorize]);

  // Extrai nome e MASP limpos a partir de observações de localização da arma
  const parseWeaponLocationRequester = useCallback((rawText?: string | null) => {
    if (!rawText) return { name: '', masp: '' };
    const note = String(rawText).trim();
    let masp = '';
    if (note.includes('MASP:')) {
      masp = note.split('MASP:')[1].split(')')[0].split('•')[0].trim();
    }
    const name = note
      .split('•')[0]
      .replace(/^Cautela Pendente\s*[—\-:]\s*Solicitante:\s*/i, '')
      .replace(/^Devolu[cç][aã]o Pendente[^—\-:]*[—\-:]\s*Policial:\s*/i, '')
      .replace(/^Acautelada com\s*/i, '')
      .replace(/^Solicitante:\s*/i, '')
      .replace(/^Policial:\s*/i, '')
      .split('(MASP:')[0]
      .trim();
    return { name, masp };
  }, []);

  // Resolve com precisão o usuário solicitante da cautela (Nome seguido do MASP)
  const getResolvedRequester = useCallback((cautela: CautelaArma | null | undefined) => {
    if (!cautela) {
      return { name: 'Usuário não identificado', masp: 'N/I', cargo: 'Policial' };
    }

    const isGenericName = (val?: string | null) => {
      const s = normalizeStr(val || '');
      return (
        !s ||
        s === 'policial solicitante' ||
        s === 'policial' ||
        s === 'policial da unidade' ||
        s === 'policial responsavel' ||
        s === 'solicitante' ||
        s === 'usr-solicitante' ||
        s === 'usr-policial' ||
        s === 'usuario nao identificado' ||
        s.startsWith('cautela pendente')
      );
    };

    const isGenericMasp = (val?: string | null) => {
      const s = normalizeStr(val || '');
      return (
        !s ||
        s === 'pendente recibo' ||
        s === 'pendente de recibo' ||
        s === 'pendente' ||
        s === 'n/a' ||
        s === 'n/i' ||
        s === '0000000' ||
        s === 'masp da cautela' ||
        s === '—' ||
        s === '-'
      );
    };

    const allUsers = storage.getAllUsersForLookup();
    const parsedStored = parseWeaponLocationRequester(cautela.requesterName);

    const directUserById =
      cautela.requesterId && !isGenericName(cautela.requesterId)
        ? allUsers.find(u => u.id === cautela.requesterId)
        : undefined;

    let resolvedName =
      (directUserById?.name && !isGenericName(directUserById.name) ? directUserById.name.trim() : '') ||
      (!isGenericName(parsedStored.name) ? parsedStored.name : '');
    let resolvedMasp =
      (directUserById?.masp && !isGenericMasp(directUserById.masp) ? String(directUserById.masp).trim() : '') ||
      (!isGenericMasp(cautela.requesterMasp)
        ? String(cautela.requesterMasp).trim()
        : (!isGenericMasp(parsedStored.masp) ? parsedStored.masp : ''));
    let resolvedCargo: string = directUserById?.cargo || cautela.requesterCargo || '';

    // 1. Busca direta em usuários cadastrados (por ID, dígitos do MASP ou Nome)
    if (!resolvedName || !resolvedMasp || !resolvedCargo) {
      const reqDigits = cleanDigits(resolvedMasp || cautela.requesterMasp);
      const reqNorm = normalizeStr(resolvedName);
      const matchedUser =
        directUserById ||
        (reqDigits ? allUsers.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
        (reqNorm ? allUsers.find(u => normalizeStr(u.name) === reqNorm) : undefined);

      if (matchedUser) {
        if (!resolvedName) resolvedName = matchedUser.name;
        if (!resolvedMasp) resolvedMasp = matchedUser.masp || '';
        if (!resolvedCargo) resolvedCargo = matchedUser.cargo || '';
      }
    }

    // 2. Busca nos dados da arma vinculada (locationNote ou destinatarioId)
    if (!resolvedName || !resolvedMasp) {
      const linkedWeapon = (weapons || []).find(
        w => w.id === cautela.weaponId || (w.serialNumber && w.serialNumber === cautela.weaponSerialNumber)
      );
      if (linkedWeapon) {
        const destId = (linkedWeapon as any).destinatarioId;
        if (destId) {
          const destUser = allUsers.find(u => u.id === destId);
          if (destUser) {
            if (!resolvedName) resolvedName = destUser.name;
            if (!resolvedMasp) resolvedMasp = destUser.masp || '';
            if (!resolvedCargo) resolvedCargo = destUser.cargo || '';
          }
        }
        const parsedWeaponNote = parseWeaponLocationRequester((linkedWeapon as any).locationNote || (linkedWeapon as any).policialAcautelado || '');
        if (!resolvedName && !isGenericName(parsedWeaponNote.name)) {
          resolvedName = parsedWeaponNote.name;
        }
        if (!resolvedMasp && !isGenericMasp(parsedWeaponNote.masp)) {
          resolvedMasp = parsedWeaponNote.masp;
        }

        // Caso tenha encontrado apenas nome ou apenas MASP na nota, cruza novamente com USUARIOS
        if ((resolvedName && !resolvedMasp) || (!resolvedName && resolvedMasp)) {
          const mDigits = cleanDigits(resolvedMasp);
          const mNorm = normalizeStr(resolvedName);
          const uMatch =
            (mDigits ? allUsers.find(u => cleanDigits(u.masp) === mDigits) : undefined) ||
            (mNorm ? allUsers.find(u => normalizeStr(u.name) === mNorm) : undefined);
          if (uMatch) {
            if (!resolvedName) resolvedName = uMatch.name;
            if (!resolvedMasp) resolvedMasp = uMatch.masp || '';
            if (!resolvedCargo) resolvedCargo = uMatch.cargo || '';
          }
        }
      }
    }

    // 3. Caso a arma tenha vindo de transferência pendente de recibo, busca o usuário responsável/transportador da transferência
    if (!resolvedName || !resolvedMasp) {
      const transfers = storage.getWeaponTransfers(currentUser, 'ALL') || [];
      const matchedTransfer = transfers.find(t =>
        (t.weapons || []).some(
          tw =>
            (cautela.weaponId && tw.weaponId === cautela.weaponId) ||
            (cautela.weaponSerialNumber && tw.serialNumber === cautela.weaponSerialNumber)
        )
      );
      if (matchedTransfer) {
        if (!resolvedName) {
          resolvedName = matchedTransfer.receiverOrTransporterName || matchedTransfer.transferredByUserName || '';
        }
        if (!resolvedMasp) {
          resolvedMasp = matchedTransfer.receiverOrTransporterMasp || matchedTransfer.transferredByUserMasp || '';
        }
        if (!resolvedCargo && matchedTransfer.receiverOrTransporterCargo) {
          resolvedCargo = matchedTransfer.receiverOrTransporterCargo;
        }
      }
    }

    const fallbackStoredName = !isGenericName(cautela.requesterName) ? (cautela.requesterName || '').trim() : '';

    return {
      name: resolvedName || fallbackStoredName || 'Usuário não identificado',
      masp: resolvedMasp || 'N/I',
      cargo: resolvedCargo || 'Policial'
    };
  }, [weapons, currentUser, parseWeaponLocationRequester]);

  // Verifica se o próprio usuário logado (ex: Armeiro) é o destinatário/usuário que ficará com a arma na cautela
  const isOwnRecipientCautela = useCallback(
    (cautela: CautelaArma | null | undefined): boolean => {
      if (!cautela) return false;

      const reqId = (cautela.requesterId || '').trim();
      const isSyntheticReqId =
        !reqId ||
        reqId === 'policial' ||
        reqId === 'solicitante' ||
        reqId === 'usr-policial' ||
        reqId === 'usr-solicitante';

      if (!isSyntheticReqId && currentUser.id) {
        if (reqId === currentUser.id) return true;
        const allUsers = storage.getAllUsersForLookup();
        const distinctUser = allUsers.find(u => u.id === reqId);
        if (distinctUser) {
          const dDigits = cleanDigits(distinctUser.masp);
          const uDigits = cleanDigits(currentUser.masp);
          if (dDigits && uDigits && dDigits === uDigits) return true;
          return false;
        }
      }

      const resolvedReq = getResolvedRequester(cautela);
      const userDigits = cleanDigits(currentUser.masp);
      const cDigits = cleanDigits(cautela.requesterMasp);
      const rDigits = cleanDigits(resolvedReq.masp);

      if (userDigits && userDigits.length >= 4) {
        if (cDigits && cDigits === userDigits) return true;
        if (rDigits && rDigits === userDigits) return true;
      }

      const userNorm = normalizeStr(currentUser.name);
      if (userNorm && userNorm.length >= 4) {
        const cNorm = normalizeStr(cautela.requesterName);
        const rNorm = normalizeStr(resolvedReq.name);
        if (cNorm && cNorm === userNorm) return true;
        if (rNorm && rNorm !== 'usuario nao identificado' && rNorm === userNorm) return true;
      }

      return false;
    },
    [currentUser, getResolvedRequester]
  );

  // Resolve o Motivo/Finalidade solicitado pelo usuário ("Treinamento, Operação, Plantão, Serviço Ordinário")
  const getResolvedMotivoFinalidade = useCallback((cautela: CautelaArma | null | undefined): string => {
    if (!cautela) return '';
    const raw = (cautela.reason || '').trim();
    const norm = normalizeStr(raw);

    const isSystemPlaceholder =
      !norm ||
      norm === 'solicitacao de acautelamento pendente de recibo' ||
      norm === 'armamento pendente de recibo' ||
      norm === 'solicitacao de acautelamento - aguardando cautela';

    if (!isSystemPlaceholder) {
      if (norm === 'treinamento') return 'Treinamento';
      if (norm === 'operacao') return 'Operação';
      if (norm === 'plantao') return 'Plantão';
      if (norm === 'servico ordinario') return 'Serviço Ordinário';
      return raw;
    }

    if (cautela.ammoDestinacao === 'Treinamento') return 'Treinamento';
    return '';
  }, []);

  // Filtragem de cautelas de acordo com permissões
  const scopedCautelas = useMemo(() => {
    let list = [...allCautelas];

    // Se for Policial: restringe ESTRITAMENTE às armas e cautelas movimentadas com o seu MASP
    if (isPolicial) {
      list = list.filter(c => isUserCautela(c));

      // Inclui armas que o policial solicitou ou acautelou que estejam sincronizadas no cofre
      (weapons || []).forEach(w => {
        const isMyWeaponMatch = isUserWeapon(w);
        if (!isMyWeaponMatch) return;

        const isWeaponPending = w.status === 'Cautela Pendente' || w.status === 'Pendente de Recibo' || w.status === 'Pendente Recibo';
        const isWeaponAcautelada = w.status === 'Acautelada';

        if (isWeaponPending && !list.some(c => c.weaponId === w.id)) {
          list.unshift({
            id: `caut-sync-${w.id}`,
            weaponId: w.id,
            weaponSerialNumber: w.serialNumber,
            weaponModel: w.model,
            weaponType: w.type,
            weaponCaliber: w.caliber,
            magazineQuantity: w.magazineQuantity || 2,
            vaultSpaceId: w.vaultSpaceId,
            departmentId: w.departmentId,
            unitId: w.unitId,
            requesterId: currentUser.id,
            requesterName: currentUser.name,
            requesterMasp: currentUser.masp,
            requesterCargo: currentUser.cargo,
            requesterPhone: currentUser.phone,
            reason: 'Solicitação de acautelamento - Aguardando Cautela',
            requestDate: new Date().toISOString(),
            status: 'PENDENTE',
            hadShots: false,
            shotsFired: 0,
            isWorking: true,
            hadMalfunction: false,
            returnedMagazinesCount: w.magazineQuantity || 2,
            createdAt: new Date().toISOString()
          });
        } else if (isWeaponAcautelada && !list.some(c => c.weaponId === w.id && (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE' || c.status === 'PENDENTE'))) {
          const allUsers = storage.getUsers();
          const armorerUser = allUsers.find(u => 
            (u.role === 'Armeiro' || (u as any).activeRole === 'Armeiro') &&
            (!w.unitId || u.unitId === w.unitId)
          ) || allUsers.find(u => 
            (u.role === 'Administrador' || (u as any).activeRole === 'Administrador') &&
            (!w.unitId || u.unitId === w.unitId)
          ) || allUsers.find(u => u.role === 'Armeiro' || (u as any).activeRole === 'Armeiro')
            || allUsers.find(u => u.role === 'Administrador');

          const linkedMun = (storage.getCautelasMunicoes() || []).find(m => 
            (m.status === 'AUTORIZADA' || (m.status as string) === 'DEVOLUCAO_PENDENTE') &&
            ((m.linkedWeaponSerialNumber && m.linkedWeaponSerialNumber === w.serialNumber) ||
            ((m as any).weaponId && (m as any).weaponId === w.id))
          );

          list.unshift({
            id: `caut-active-${w.id}`,
            weaponId: w.id,
            weaponSerialNumber: w.serialNumber,
            weaponModel: w.model,
            weaponType: w.type,
            weaponCaliber: w.caliber,
            magazineQuantity: w.magazineQuantity || 2,
            vaultSpaceId: w.vaultSpaceId || (w as any).previousVaultSpaceId,
            departmentId: w.departmentId,
            unitId: w.unitId,
            requesterId: currentUser.id,
            requesterName: currentUser.name,
            requesterMasp: currentUser.masp,
            requesterCargo: currentUser.cargo,
            requesterPhone: currentUser.phone,
            reason: 'Acautelamento em uso pelo policial',
            requestDate: (w as any).dataModificacao || new Date().toISOString(),
            authorizedAt: (w as any).dataModificacao || new Date().toISOString(),
            status: 'AUTORIZADA',
            armorerId: (w as any).armorerId || armorerUser?.id,
            armorerName: (w as any).armorerName || armorerUser?.name || 'Armeiro da Unidade',
            armorerMasp: (w as any).armorerMasp || armorerUser?.masp || '',
            linkedAmmoCautelaId: linkedMun?.id,
            ammoQuantity: linkedMun?.quantity,
            ammoFabricante: linkedMun?.fabricante,
            ammoTipo: linkedMun?.tipoMunicao,
            ammoPeso: linkedMun?.pesoMunicao,
            ammoLote: linkedMun?.loteMunicao,
            ammoDestinacao: linkedMun?.destinacao,
            ammoCaliberName: linkedMun?.caliberName,
            ammoSeraDevolvida: linkedMun?.seraDevolvida,
            hadShots: false,
            shotsFired: 0,
            isWorking: true,
            hadMalfunction: false,
            returnedMagazinesCount: w.magazineQuantity || 2,
            createdAt: (w as any).dataModificacao || new Date().toISOString()
          });
        }
      });
    } else {
      // Armeiro / Admin / Geral:
      // O usuário Armeiro poderá ver TODAS as cautelas deferidas, pendentes e indeferidas da unidade que faz parte
      const targetUnitId = currentUser.unitId;

      if (!isGeral && currentUser.managementScope !== 'department' && targetUnitId) {
        list = list.filter(c => {
          // 1. Cautela possui a mesma unidade do armeiro
          if (c.unitId && c.unitId === targetUnitId) return true;

          // 2. Arma associada pertence à unidade do armeiro
          const w = (weapons || []).find(x => x.id === c.weaponId || (x.serialNumber && x.serialNumber === c.weaponSerialNumber));
          if (w && w.unitId === targetUnitId) return true;

          // 3. Cofre de origem ou retorno pertence à unidade do armeiro
          const vId = c.vaultSpaceId || w?.vaultSpaceId || w?.previousVaultSpaceId;
          if (vId) {
            const v = (vaultSpaces || []).find(x => x.id === vId);
            if (v && v.unitId === targetUnitId) return true;
          }

          // 4. Se a cautela não tem unidade nem arma definida mas foi criada pelo armeiro atual
          if (!c.unitId && !w?.unitId) {
            if (c.armorerId === currentUser.id || c.requesterId === currentUser.id || isUserCautela(c)) return true;
          }

          return false;
        });
      }

      // Sincroniza armas da unidade com status Cautela Pendente e Acautelada
      (weapons || []).forEach(w => {
        const isWeaponPending = w.status === 'Cautela Pendente' || w.status === 'Pendente de Recibo' || w.status === 'Pendente Recibo';
        const isWeaponAcautelada = w.status === 'Acautelada';

        const matchUnit = isGeral || 
                          currentUser.managementScope === 'department' || 
                          !targetUnitId || 
                          w.unitId === targetUnitId;

        if (!matchUnit) return;

        const locNote = (w as any).locationNote || '';
        const polAcautelado = (w as any).policialAcautelado || '';
        const parsedLoc = parseWeaponLocationRequester(locNote || polAcautelado);
        const allUsersList = storage.getUsers();
        const destUser = (w as any).destinatarioId
          ? allUsersList.find(u => u.id === (w as any).destinatarioId)
          : undefined;
        const matchedByParsed =
          (!destUser && parsedLoc.masp ? allUsersList.find(u => cleanDigits(u.masp) === cleanDigits(parsedLoc.masp)) : undefined) ||
          (!destUser && parsedLoc.name ? allUsersList.find(u => normalizeStr(u.name) === normalizeStr(parsedLoc.name)) : undefined);
        const resolvedSyncUser = destUser || matchedByParsed;

        let reqName = resolvedSyncUser?.name || parsedLoc.name || '';
        let reqMasp = resolvedSyncUser?.masp || parsedLoc.masp || '';
        let reqCargo: string = resolvedSyncUser?.cargo || 'Policial';

        if (!reqName || !reqMasp) {
          const matchedTransfer = (storage.getWeaponTransfers(currentUser, 'ALL') || []).find(t =>
            (t.weapons || []).some(tw => tw.weaponId === w.id || tw.serialNumber === w.serialNumber)
          );
          if (matchedTransfer) {
            reqName = reqName || matchedTransfer.receiverOrTransporterName || matchedTransfer.transferredByUserName || '';
            reqMasp = reqMasp || matchedTransfer.receiverOrTransporterMasp || matchedTransfer.transferredByUserMasp || '';
            reqCargo = matchedTransfer.receiverOrTransporterCargo || reqCargo;
          }
        }

        if (isWeaponPending && !list.some(c => c.weaponId === w.id && isPendingStatus(c.status))) {
          list.unshift({
            id: `caut-sync-${w.id}`,
            weaponId: w.id,
            weaponSerialNumber: w.serialNumber,
            weaponModel: w.model,
            weaponType: w.type,
            weaponCaliber: w.caliber,
            magazineQuantity: w.magazineQuantity || 2,
            vaultSpaceId: w.vaultSpaceId,
            departmentId: w.departmentId,
            unitId: w.unitId || targetUnitId,
            requesterId: resolvedSyncUser?.id || (w as any).destinatarioId || 'solicitante',
            requesterName: reqName || 'Usuário não identificado',
            requesterMasp: reqMasp || 'N/I',
            requesterCargo: reqCargo as any,
            reason: w.status === 'Pendente de Recibo' ? 'Armamento pendente de recibo' : 'Solicitação de acautelamento pendente de recibo',
            requestDate: new Date().toISOString(),
            status: 'PENDENTE',
            hadShots: false,
            shotsFired: 0,
            isWorking: true,
            hadMalfunction: false,
            returnedMagazinesCount: w.magazineQuantity || 2,
            createdAt: new Date().toISOString()
          });
        } else if (isWeaponAcautelada && !list.some(c => c.weaponId === w.id && (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'))) {
          const allUsers = storage.getUsers();
          const armorerUser = allUsers.find(u => 
            (u.role === 'Armeiro' || (u as any).activeRole === 'Armeiro') &&
            (!w.unitId || u.unitId === w.unitId)
          ) || allUsers.find(u => 
            (u.role === 'Administrador' || (u as any).activeRole === 'Administrador') &&
            (!w.unitId || u.unitId === w.unitId)
          ) || currentUser;

          const linkedMun = (storage.getCautelasMunicoes() || []).find(m => 
            (m.status === 'AUTORIZADA' || (m.status as string) === 'DEVOLUCAO_PENDENTE') &&
            ((m.linkedWeaponSerialNumber && m.linkedWeaponSerialNumber === w.serialNumber) ||
            ((m as any).weaponId && (m as any).weaponId === w.id))
          );

          const isPendingReturnNote = /devolu[cç][aã]o\s+pendente/i.test(locNote);

          list.unshift({
            id: `caut-active-${w.id}`,
            weaponId: w.id,
            weaponSerialNumber: w.serialNumber,
            weaponModel: w.model,
            weaponType: w.type,
            weaponCaliber: w.caliber,
            magazineQuantity: w.magazineQuantity || 2,
            vaultSpaceId: w.vaultSpaceId || (w as any).previousVaultSpaceId,
            departmentId: w.departmentId,
            unitId: w.unitId || targetUnitId,
            requesterId: resolvedSyncUser?.id || (w as any).destinatarioId || 'policial',
            requesterName: reqName || 'Policial da Unidade',
            requesterMasp: reqMasp || 'Masp da Cautela',
            requesterCargo: (reqCargo || 'Investigador / Policial') as any,
            armorerId: (w as any).armorerId || armorerUser?.id || currentUser.id,
            armorerName: (w as any).armorerName || armorerUser?.name || currentUser.name,
            armorerMasp: (w as any).armorerMasp || armorerUser?.masp || currentUser.masp || '',
            linkedAmmoCautelaId: linkedMun?.id,
            ammoQuantity: linkedMun?.quantity,
            ammoFabricante: linkedMun?.fabricante,
            ammoTipo: linkedMun?.tipoMunicao,
            ammoPeso: linkedMun?.pesoMunicao,
            ammoLote: linkedMun?.loteMunicao,
            ammoDestinacao: linkedMun?.destinacao,
            ammoCaliberName: linkedMun?.caliberName,
            ammoSeraDevolvida: linkedMun?.seraDevolvida,
            reason: 'Arma acautelada em serviço na unidade',
            requestDate: (w as any).dataModificacao || new Date().toISOString(),
            authorizedAt: (w as any).dataModificacao || new Date().toISOString(),
            status: isPendingReturnNote ? 'DEVOLUCAO_PENDENTE' : 'AUTORIZADA',
            hadShots: false,
            shotsFired: 0,
            isWorking: true,
            hadMalfunction: false,
            returnedMagazinesCount: w.magazineQuantity || 2,
            createdAt: (w as any).dataModificacao || new Date().toISOString()
          });
        }
      });
    }

    return list;
  }, [allCautelas, currentUser, isPolicial, isGeral, weapons, vaultSpaces, isUserCautela, isUserWeapon, parseWeaponLocationRequester]);

  // Chave única de identificação do usuário que realizou a cautela (para filtro por usuário no Histórico da Unidade)
  const getCautelaRequesterFilterKey = useCallback(
    (c: CautelaArma): string => {
      const resolved = getResolvedRequester(c);
      const mDigits = cleanDigits(resolved.masp || c.requesterMasp);
      if (mDigits && mDigits.length >= 4) return `masp:${mDigits}`;
      const rId = (c.requesterId || '').trim();
      if (
        rId &&
        rId !== 'policial' &&
        rId !== 'solicitante' &&
        rId !== 'usr-policial' &&
        rId !== 'usr-solicitante'
      ) {
        return `id:${rId}`;
      }
      const normName = normalizeStr(resolved.name || c.requesterName);
      return normName ? `name:${normName}` : 'unknown';
    },
    [getResolvedRequester]
  );

  // Lista base de cautelas ativas da aba "Deferidas/Ativas <Sigla>" (Armeiro)
  const deferidasBaseCautelas = useMemo(() => {
    if (!canAuthorize) return [] as CautelaArma[];
    return scopedCautelas.filter(
      c =>
        (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') &&
        !isOwnRecipientCautela(c)
    );
  }, [scopedCautelas, canAuthorize, isOwnRecipientCautela]);

  // Usuários distintos com cautelas ativas na aba "Deferidas/Ativas <Sigla>"
  const deferidasUsers = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    deferidasBaseCautelas.forEach(c => {
      const key = getCautelaRequesterFilterKey(c);
      if (!key || key === 'unknown' || map.has(key)) return;
      const resolved = getResolvedRequester(c);
      const maspPart =
        resolved.masp && resolved.masp !== 'N/I' ? ` (MASP: ${resolved.masp})` : '';
      map.set(key, {
        key,
        label: `${resolved.name}${maspPart}`
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [deferidasBaseCautelas, getCautelaRequesterFilterKey, getResolvedRequester]);

  // Armas distintas (modelo/fabricante/calibre) com cautelas ativas na aba "Deferidas/Ativas <Sigla>"
  const deferidasWeapons = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    deferidasBaseCautelas.forEach(c => {
      const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
      const rawModel = (c.weaponModel || wObj?.model || '').trim();
      const key = normalizeStr(rawModel) || c.weaponId || '';
      if (!key || map.has(key)) return;
      const typePart = c.weaponType || wObj?.type ? `${c.weaponType || wObj?.type} ` : '';
      const brandPart = wObj?.manufacturer ? `${wObj.manufacturer} ` : '';
      const calPart = c.weaponCaliber || wObj?.caliber ? ` (${c.weaponCaliber || wObj?.caliber})` : '';
      map.set(key, {
        key,
        label: `${typePart}${brandPart}${rawModel || 'Armamento'}${calPart}`.trim()
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [deferidasBaseCautelas, weapons]);

  // Números de série distintos em cautelas ativas na aba "Deferidas/Ativas <Sigla>"
  const deferidasSerialNumbers = useMemo(() => {
    const map = new Map<string, { serial: string; label: string }>();
    deferidasBaseCautelas.forEach(c => {
      const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
      if (deferidasWeaponFilter !== 'TODAS') {
        const modelKey = normalizeStr(c.weaponModel || wObj?.model || '') || c.weaponId || '';
        if (modelKey !== deferidasWeaponFilter) return;
      }
      const serial = (c.weaponSerialNumber || wObj?.serialNumber || '').trim();
      if (!serial || map.has(serial)) return;
      const req = getResolvedRequester(c);
      map.set(serial, {
        serial,
        label: `${c.weaponModel || wObj?.model || 'Arma'} — ${req.name}`
      });
    });
    return Array.from(map.values()).sort((a, b) => a.serial.localeCompare(b.serial, 'pt-BR'));
  }, [deferidasBaseCautelas, weapons, deferidasWeaponFilter, getResolvedRequester]);

  // Lista base de cautelas recusadas da aba "Indeferidas <Sigla>" (Armeiro)
  const indeferidasBaseCautelas = useMemo(() => {
    if (!canAuthorize) return [] as CautelaArma[];
    return scopedCautelas.filter(c => c.status === 'RECUSADA');
  }, [scopedCautelas, canAuthorize]);

  // Usuários distintos com cautelas recusadas na aba "Indeferidas <Sigla>"
  const indeferidasUsers = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    indeferidasBaseCautelas.forEach(c => {
      const key = getCautelaRequesterFilterKey(c);
      if (!key || key === 'unknown' || map.has(key)) return;
      const resolved = getResolvedRequester(c);
      const maspPart =
        resolved.masp && resolved.masp !== 'N/I' ? ` (MASP: ${resolved.masp})` : '';
      map.set(key, {
        key,
        label: `${resolved.name}${maspPart}`
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [indeferidasBaseCautelas, getCautelaRequesterFilterKey, getResolvedRequester]);

  // Armas distintas (modelo/fabricante/calibre) com cautelas recusadas na aba "Indeferidas <Sigla>"
  const indeferidasWeapons = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    indeferidasBaseCautelas.forEach(c => {
      const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
      const rawModel = (c.weaponModel || wObj?.model || '').trim();
      const key = normalizeStr(rawModel) || c.weaponId || '';
      if (!key || map.has(key)) return;
      const typePart = c.weaponType || wObj?.type ? `${c.weaponType || wObj?.type} ` : '';
      const brandPart = wObj?.manufacturer ? `${wObj.manufacturer} ` : '';
      const calPart = c.weaponCaliber || wObj?.caliber ? ` (${c.weaponCaliber || wObj?.caliber})` : '';
      map.set(key, {
        key,
        label: `${typePart}${brandPart}${rawModel || 'Armamento'}${calPart}`.trim()
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [indeferidasBaseCautelas, weapons]);

  // Números de série distintos em cautelas recusadas na aba "Indeferidas <Sigla>"
  const indeferidasSerialNumbers = useMemo(() => {
    const map = new Map<string, { serial: string; label: string }>();
    indeferidasBaseCautelas.forEach(c => {
      const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
      if (indeferidasWeaponFilter !== 'TODAS') {
        const modelKey = normalizeStr(c.weaponModel || wObj?.model || '') || c.weaponId || '';
        if (modelKey !== indeferidasWeaponFilter) return;
      }
      const serial = (c.weaponSerialNumber || wObj?.serialNumber || '').trim();
      if (!serial || map.has(serial)) return;
      const req = getResolvedRequester(c);
      map.set(serial, {
        serial,
        label: `${c.weaponModel || wObj?.model || 'Arma'} — ${req.name}`
      });
    });
    return Array.from(map.values()).sort((a, b) => a.serial.localeCompare(b.serial, 'pt-BR'));
  }, [indeferidasBaseCautelas, weapons, indeferidasWeaponFilter, getResolvedRequester]);

  // Lista base de cautelas do Histórico da Unidade (todas as cautelas ativas e devolvidas da unidade)
  const unitHistoryBaseCautelas = useMemo(() => {
    if (!canAuthorize) return [] as CautelaArma[];
    return scopedCautelas.filter(
      c =>
        c.status === 'AUTORIZADA' ||
        c.status === 'DEVOLUCAO_PENDENTE' ||
        c.status === 'DEVOLVIDA'
    );
  }, [scopedCautelas, canAuthorize]);

  // Usuários distintos que realizaram cautelas na unidade (para o filtro por Usuários)
  const unitHistoryUsers = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    unitHistoryBaseCautelas.forEach(c => {
      const key = getCautelaRequesterFilterKey(c);
      if (!key || key === 'unknown' || map.has(key)) return;
      const resolved = getResolvedRequester(c);
      const maspPart =
        resolved.masp && resolved.masp !== 'N/I' ? ` (MASP: ${resolved.masp})` : '';
      map.set(key, {
        key,
        label: `${resolved.name}${maspPart}`
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [unitHistoryBaseCautelas, getCautelaRequesterFilterKey, getResolvedRequester]);

  // Armas distintas presentes no Histórico da Unidade (para o filtro por Armas)
  const unitHistoryWeapons = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    unitHistoryBaseCautelas.forEach(c => {
      const key = c.weaponSerialNumber || c.weaponId || c.weaponModel || '';
      if (!key || map.has(key)) return;
      const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
      const brandPart = wObj?.manufacturer ? `${wObj.manufacturer} ` : '';
      const calPart = c.weaponCaliber || wObj?.caliber ? ` (${c.weaponCaliber || wObj?.caliber})` : '';
      const serPart = c.weaponSerialNumber ? ` — Nº ${c.weaponSerialNumber}` : '';
      map.set(key, {
        key,
        label: `${brandPart}${c.weaponModel || wObj?.model || 'Armamento'}${serPart}${calPart}`
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [unitHistoryBaseCautelas, weapons]);

  // Lista a exibir com base na aba ativa
  const displayedCautelas = useMemo(() => {
    let list = [...scopedCautelas];

    const toLocalYMD = (iso?: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    if (activeTab === 'MINHAS') {
      // Aba "Cautela de arma em análise" (Policial) / "Solicitações Pendentes (Unidade)" (Armeiro)
      list = list.filter(c => isAwaitingArmorerCommand(c.status));
      if (canAuthorize) {
        if (pendentesSubFilter === 'SOLICITACOES') {
          list = list.filter(c => isPendingStatus(c.status));
        } else if (pendentesSubFilter === 'DEVOLUCOES') {
          list = list.filter(c => {
            const st = (c.status || '').trim().toUpperCase();
            return st === 'DEVOLUCAO_PENDENTE' || st === 'DEVOLUÇÃO PENDENTE';
          });
        }
      }
    } else if (activeTab === 'DEFERIDAS') {
      if (!canAuthorize) {
        // Aba "Minhas Cautelas" (Policial): estritamente cautelas ATIVAS EM POSSE
        list = list.filter(c => c.status === 'AUTORIZADA');
      } else {
        // Aba "Deferidas/Ativas <Sigla>" (Armeiro): apenas cautelas ATIVAS da unidade (sem histórico de devoluções)
        list = list.filter(
          c =>
            (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') &&
            !isOwnRecipientCautela(c)
        );

        if (deferidasUserFilter !== 'TODOS') {
          list = list.filter(c => getCautelaRequesterFilterKey(c) === deferidasUserFilter);
        }

        if (deferidasWeaponFilter !== 'TODAS') {
          list = list.filter(c => {
            const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
            const modelKey = normalizeStr(c.weaponModel || wObj?.model || '') || c.weaponId || '';
            return modelKey === deferidasWeaponFilter;
          });
        }

        if (deferidasSerialFilter.trim()) {
          const normSerialQuery = normalizeStr(deferidasSerialFilter);
          const serialQueryDigits = cleanDigits(deferidasSerialFilter);
          list = list.filter(c => {
            const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
            const rawSerial = c.weaponSerialNumber || wObj?.serialNumber || '';
            if (normalizeStr(rawSerial).includes(normSerialQuery)) return true;
            if (serialQueryDigits.length >= 2 && cleanDigits(rawSerial).includes(serialQueryDigits)) return true;
            return false;
          });
        }
      }
    } else if (activeTab === 'DEFERIDAS_PROPRIA') {
      // Aba "Deferidas/Ativas Própria" (Armeiro): apenas cautelas ATIVAS em que o próprio armeiro é o usuário detentor da arma
      list = list.filter(
        c =>
          (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') &&
          isOwnRecipientCautela(c)
      );
    } else if (activeTab === 'HISTORICO_UNIDADE') {
      // Aba exclusiva "Histórico de cautelas <Unidade>" (Armeiro): cautelas ativas e devolvidas da unidade
      list = list.filter(
        c =>
          c.status === 'AUTORIZADA' ||
          c.status === 'DEVOLUCAO_PENDENTE' ||
          c.status === 'DEVOLVIDA'
      );

      if (unitHistoryUserFilter !== 'TODOS') {
        list = list.filter(c => getCautelaRequesterFilterKey(c) === unitHistoryUserFilter);
      }

      if (unitHistoryWeaponFilter !== 'TODAS') {
        list = list.filter(c => {
          const key = c.weaponSerialNumber || c.weaponId || c.weaponModel || '';
          return key === unitHistoryWeaponFilter;
        });
      }

      if (unitHistoryDateFilter) {
        list = list.filter(
          c =>
            toLocalYMD(c.requestDate) === unitHistoryDateFilter ||
            toLocalYMD(c.authorizedAt) === unitHistoryDateFilter ||
            toLocalYMD(c.returnDate) === unitHistoryDateFilter ||
            toLocalYMD(c.createdAt) === unitHistoryDateFilter
        );
      }
    } else if (activeTab === 'INDEFERIDAS') {
      if (canAuthorize) {
        // Aba "Indeferidas <Sigla>" (Armeiro): cautelas recusadas da unidade
        list = list.filter(c => c.status === 'RECUSADA');

        if (indeferidasUserFilter !== 'TODOS') {
          list = list.filter(c => getCautelaRequesterFilterKey(c) === indeferidasUserFilter);
        }

        if (indeferidasWeaponFilter !== 'TODAS') {
          list = list.filter(c => {
            const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
            const modelKey = normalizeStr(c.weaponModel || wObj?.model || '') || c.weaponId || '';
            return modelKey === indeferidasWeaponFilter;
          });
        }

        if (indeferidasSerialFilter.trim()) {
          const normSerialQuery = normalizeStr(indeferidasSerialFilter);
          const serialQueryDigits = cleanDigits(indeferidasSerialFilter);
          list = list.filter(c => {
            const wObj = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
            const rawSerial = c.weaponSerialNumber || wObj?.serialNumber || '';
            if (normalizeStr(rawSerial).includes(normSerialQuery)) return true;
            if (serialQueryDigits.length >= 2 && cleanDigits(rawSerial).includes(serialQueryDigits)) return true;
            return false;
          });
        }
      } else {
        // Aba "Meu Histórico" (Policial): histórico completo de armas em seu nome (inclusive indeferidas)
        if (historyDecisionFilter === 'ATIVAS') {
          list = list.filter(c => c.status === 'AUTORIZADA');
        } else if (historyDecisionFilter === 'DEFERIDA') {
          list = list.filter(c =>
            c.status === 'AUTORIZADA' ||
            c.status === 'DEVOLUCAO_PENDENTE' ||
            c.status === 'DEVOLVIDA'
          );
        } else if (historyDecisionFilter === 'INDEFERIDAS') {
          list = list.filter(c => c.status === 'RECUSADA');
        }

        if (historyWeaponFilter !== 'TODAS') {
          list = list.filter(c => {
            const key = c.weaponSerialNumber || c.weaponId || c.weaponModel || '';
            return key === historyWeaponFilter;
          });
        }

        if (historyDateFilter) {
          list = list.filter(c =>
            toLocalYMD(c.requestDate) === historyDateFilter ||
            toLocalYMD(c.authorizedAt) === historyDateFilter ||
            toLocalYMD(c.returnDate) === historyDateFilter ||
            toLocalYMD(c.createdAt) === historyDateFilter
          );
        }
      }
    }

    if (searchTerm.trim()) {
      const rawQuery = searchTerm.trim();
      const normQuery = normalizeStr(rawQuery);
      const tokens = normQuery.split(/\s+/).filter(Boolean);
      const allUsersLookup = storage.getAllUsersForLookup();

      list = list.filter(c => {
        const reqResolved = getResolvedRequester(c);
        const reqDigits = cleanDigits(reqResolved.masp || c.requesterMasp);
        const matchedUser =
          (c.requesterId ? allUsersLookup.find(u => u.id === c.requesterId) : undefined) ||
          (reqDigits ? allUsersLookup.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
          allUsersLookup.find(u => normalizeStr(u.name) === normalizeStr(reqResolved.name));

        const wObj = weapons.find(
          w => w.id === c.weaponId || (w.serialNumber && w.serialNumber === c.weaponSerialNumber)
        );
        const vaultObj = vaultSpaces.find(
          v => v.id === (c.vaultSpaceId || wObj?.vaultSpaceId || wObj?.previousVaultSpaceId)
        );
        const unitObj = units.find(u => u.id === (c.unitId || wObj?.unitId));
        const isAtivaStatus = c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE';
        const statusKeywords = isAtivaStatus
          ? 'ativa acautelada em posse'
          : c.status === 'DEVOLVIDA'
            ? 'devolvida ao cofre encerrada'
            : c.status || '';

        const searchableBlob = normalizeStr(
          [
            // Dados da Arma
            c.weaponModel,
            wObj?.model,
            c.weaponType,
            wObj?.type,
            wObj?.manufacturer,
            c.weaponSerialNumber,
            wObj?.serialNumber,
            c.weaponCaliber,
            wObj?.caliber,
            String(c.magazineQuantity || ''),
            vaultObj?.code,
            (vaultObj as any)?.description,
            unitObj?.name,
            (wObj as any)?.patrimonio,
            (wObj as any)?.locationNote,
            // Dados de Munição / Motivo / Observações
            c.ammoCaliberName,
            c.ammoFabricante,
            c.ammoTipo,
            c.ammoPeso,
            c.ammoLote,
            c.ammoDestinacao,
            c.reason,
            c.authorizationNotes,
            c.returnObservations,
            c.defectDescription,
            c.malfunctionDescription,
            // Dados do Usuário que realizou a cautela
            c.requesterName,
            reqResolved.name,
            matchedUser?.name,
            c.requesterMasp,
            reqResolved.masp,
            matchedUser?.masp,
            reqDigits,
            c.requesterCargo,
            reqResolved.cargo,
            matchedUser?.cargo,
            c.requesterPhone,
            matchedUser?.phone,
            matchedUser?.role,
            matchedUser?.professorSigla,
            (matchedUser as any)?.email,
            // Armeiro e Datas
            c.armorerName,
            c.armorerMasp,
            c.returnArmorerName,
            c.returnArmorerMasp,
            c.authorizedAt ? new Date(c.authorizedAt).toLocaleDateString('pt-BR') : '',
            c.returnDate ? new Date(c.returnDate).toLocaleDateString('pt-BR') : '',
            c.requestDate ? new Date(c.requestDate).toLocaleDateString('pt-BR') : '',
            statusKeywords
          ]
            .filter(Boolean)
            .join(' ')
        );

        return tokens.every(tk => {
          if (searchableBlob.includes(tk)) return true;
          const tkDigits = cleanDigits(tk);
          if (tkDigits.length >= 3 && reqDigits.includes(tkDigits)) return true;
          const serialDigits = cleanDigits(c.weaponSerialNumber || wObj?.serialNumber);
          if (tkDigits.length >= 3 && serialDigits.includes(tkDigits)) return true;
          return false;
        });
      });
    }

    // Ordenação: em "Meu Histórico" (Policial) e "Histórico de cautelas" (Armeiro), cautelas ativas primeiro e mais recentes no topo
    if ((!canAuthorize && activeTab === 'INDEFERIDAS') || (canAuthorize && activeTab === 'HISTORICO_UNIDADE')) {
      list.sort((a, b) => {
        const aIsAtiva = a.status === 'AUTORIZADA' || a.status === 'DEVOLUCAO_PENDENTE' ? 1 : 0;
        const bIsAtiva = b.status === 'AUTORIZADA' || b.status === 'DEVOLUCAO_PENDENTE' ? 1 : 0;
        if (aIsAtiva !== bIsAtiva) return bIsAtiva - aIsAtiva;

        const getTs = (item: CautelaArma) => {
          const raw = item.returnDate || item.authorizedAt || item.requestDate || item.createdAt || '';
          const t = raw ? new Date(raw).getTime() : 0;
          return isNaN(t) ? 0 : t;
        };
        return getTs(b) - getTs(a);
      });
    }

    return list;
  }, [
    scopedCautelas,
    activeTab,
    pendentesSubFilter,
    deferidasSubFilter,
    propriaSubFilter,
    searchTerm,
    canAuthorize,
    historyDecisionFilter,
    historyWeaponFilter,
    historyDateFilter,
    deferidasUserFilter,
    deferidasWeaponFilter,
    deferidasSerialFilter,
    indeferidasUserFilter,
    indeferidasWeaponFilter,
    indeferidasSerialFilter,
    unitHistoryUserFilter,
    unitHistoryWeaponFilter,
    unitHistoryDateFilter,
    weapons,
    vaultSpaces,
    units,
    getResolvedRequester,
    getCautelaRequesterFilterKey,
    isOwnRecipientCautela
  ]);

  // Lista de armas distintas presentes no histórico do policial (para o filtro por arma em "Meu Histórico")
  const userHistoryWeapons = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    scopedCautelas.forEach(c => {
      const key = c.weaponSerialNumber || c.weaponId || c.weaponModel || '';
      if (!key || map.has(key)) return;
      const calPart = c.weaponCaliber ? ` (${c.weaponCaliber})` : '';
      const serPart = c.weaponSerialNumber ? ` — Nº ${c.weaponSerialNumber}` : '';
      map.set(key, {
        key,
        label: `${c.weaponModel || 'Armamento'}${serPart}${calPart}`
      });
    });
    return Array.from(map.values());
  }, [scopedCautelas]);

  // Contadores para badges das abas
  const pendingCount = useMemo(() => {
    return scopedCautelas.filter(c => isAwaitingArmorerCommand(c.status)).length;
  }, [scopedCautelas]);

  const pendingSolicitacoesCount = useMemo(() => {
    return scopedCautelas.filter(c => isPendingStatus(c.status)).length;
  }, [scopedCautelas]);

  const pendingDevolucoesCount = useMemo(() => {
    return scopedCautelas.filter(c => {
      const st = (c.status || '').trim().toUpperCase();
      return st === 'DEVOLUCAO_PENDENTE' || st === 'DEVOLUÇÃO PENDENTE';
    }).length;
  }, [scopedCautelas]);

  const activeCautelasCount = useMemo(() => {
    if (!canAuthorize) {
      return scopedCautelas.filter(c => c.status === 'AUTORIZADA').length;
    }
    return scopedCautelas.filter(
      c =>
        (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') &&
        !isOwnRecipientCautela(c)
    ).length;
  }, [scopedCautelas, canAuthorize, isOwnRecipientCautela]);

  const deferidasCount = activeCautelasCount;

  const returnedCautelasCount = useMemo(() => {
    if (!canAuthorize) {
      return scopedCautelas.filter(c => c.status === 'DEVOLVIDA').length;
    }
    return scopedCautelas.filter(
      c => c.status === 'DEVOLVIDA' && !isOwnRecipientCautela(c)
    ).length;
  }, [scopedCautelas, canAuthorize, isOwnRecipientCautela]);

  const activePropriaCount = useMemo(() => {
    if (!canAuthorize) return 0;
    return scopedCautelas.filter(
      c =>
        (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') &&
        isOwnRecipientCautela(c)
    ).length;
  }, [scopedCautelas, canAuthorize, isOwnRecipientCautela]);

  const deferidasPropriaCount = activePropriaCount;

  const returnedPropriaCount = useMemo(() => {
    if (!canAuthorize) return 0;
    return scopedCautelas.filter(
      c => c.status === 'DEVOLVIDA' && isOwnRecipientCautela(c)
    ).length;
  }, [scopedCautelas, canAuthorize, isOwnRecipientCautela]);

  const unitHistoryTotalCount = useMemo(() => {
    return unitHistoryBaseCautelas.length;
  }, [unitHistoryBaseCautelas]);

  const indeferidasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'RECUSADA').length;
  }, [scopedCautelas]);

  const meuHistoricoTotalCount = useMemo(() => {
    return scopedCautelas.length;
  }, [scopedCautelas]);

  const meuHistoricoAtivasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'AUTORIZADA').length;
  }, [scopedCautelas]);

  const meuHistoricoDevolvidasCount = useMemo(() => {
    return scopedCautelas.filter(c =>
      c.status === 'DEVOLVIDA' || c.status === 'DEVOLUCAO_PENDENTE'
    ).length;
  }, [scopedCautelas]);

  const meuHistoricoDeferidasCount = useMemo(() => {
    return scopedCautelas.filter(c =>
      c.status === 'AUTORIZADA' ||
      c.status === 'DEVOLUCAO_PENDENTE' ||
      c.status === 'DEVOLVIDA'
    ).length;
  }, [scopedCautelas]);

  const myRefusedCautelas = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'RECUSADA');
  }, [scopedCautelas]);

  // Estado para armazenar IDs de recusas dispensadas pelo usuário
  const [dismissedRefusalIds, setDismissedRefusalIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`pc_dismissed_refusals_${currentUser.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Cautelas recusadas não dispensadas (para notificar imediatamente o policial)
  const unreadRefusedCautelas = useMemo(() => {
    return myRefusedCautelas.filter(c => !dismissedRefusalIds.includes(c.id));
  }, [myRefusedCautelas, dismissedRefusalIds]);

  const handleDismissRefusal = (cautelaId: string) => {
    const next = [...dismissedRefusalIds, cautelaId];
    setDismissedRefusalIds(next);
    try {
      localStorage.setItem(`pc_dismissed_refusals_${currentUser.id}`, JSON.stringify(next));
    } catch (e) {}
  };

  const handleDismissAllRefusals = () => {
    const allIds = myRefusedCautelas.map(c => c.id);
    const next = Array.from(new Set([...dismissedRefusalIds, ...allIds]));
    setDismissedRefusalIds(next);
    try {
      localStorage.setItem(`pc_dismissed_refusals_${currentUser.id}`, JSON.stringify(next));
    } catch (e) {}
  };

  // Armas disponíveis na unidade do usuário para solicitação de cautela: SOMENTE armas com status "No Cofre"
  const userUnitWeapons = useMemo(() => {
    const userUnitId = currentUser.unitId;
    const sourceWeapons = (weapons && weapons.length > 0) ? weapons : storage.getAllWeapons();
    return sourceWeapons.filter(w => {
      const sameUnit = isGeral ? true : (
        (userUnitId && w.unitId === userUnitId) ||
        (!w.unitId && currentUser.departmentId && w.departmentId === currentUser.departmentId) ||
        (!userUnitId && currentUser.departmentId && w.departmentId === currentUser.departmentId)
      );
      const st = (w.status || '').trim().toLowerCase();
      const isNoCofre = st === 'no cofre' || st === 'nocofre';
      return sameUnit && isNoCofre;
    });
  }, [weapons, currentUser.unitId, currentUser.departmentId, isGeral]);

  // Armas selecionáveis durante a edição de uma cautela pendente (inclui a arma atual da cautela + armas "No Cofre" da unidade)
  const editableUnitWeapons = useMemo(() => {
    if (!editingCautela) return userUnitWeapons;
    const sourceWeapons = (weapons && weapons.length > 0) ? weapons : storage.getAllWeapons();
    const currentWeapon = sourceWeapons.find(
      w => w.id === editingCautela.weaponId || (editingCautela.weaponSerialNumber && w.serialNumber === editingCautela.weaponSerialNumber)
    );
    const list = [...userUnitWeapons];
    if (currentWeapon && !list.some(w => w.id === currentWeapon.id)) {
      list.unshift(currentWeapon);
    } else if (!currentWeapon && editingCautela.weaponId) {
      list.unshift({
        id: editingCautela.weaponId,
        serialNumber: editingCautela.weaponSerialNumber,
        model: editingCautela.weaponModel,
        type: editingCautela.weaponType || 'Arma de Fogo',
        caliber: editingCautela.weaponCaliber || 'Padrão',
        magazineQuantity: editingCautela.magazineQuantity || 2,
        status: 'Cautela Pendente',
        vaultSpaceId: editingCautela.vaultSpaceId,
        departmentId: editingCautela.departmentId || currentUser.departmentId || '',
        unitId: editingCautela.unitId || currentUser.unitId || '',
        shotCount: 0,
        createdAt: editingCautela.createdAt || new Date().toISOString()
      } as Weapon);
    }
    return list;
  }, [editingCautela, userUnitWeapons, weapons, currentUser.departmentId, currentUser.unitId]);

  const editSelectedWeapon = useMemo(() => {
    return editableUnitWeapons.find(w => w.id === editWeaponId) || null;
  }, [editableUnitWeapons, editWeaponId]);

  // Tipos e pesos disponíveis no modal de edição da cautela (somente cadastrados no calibre/tipo da arma e disponíveis na unidade)
  const availableEditPoliceSpecs = useMemo(() => {
    return getAvailableUnitAmmoSpecsForWeapon(editSelectedWeapon);
  }, [getAvailableUnitAmmoSpecsForWeapon, editSelectedWeapon]);

  const availableEditPoliceTipos = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    availableEditPoliceSpecs.forEach(spec => {
      const key = spec.tipo.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(spec.tipo.trim());
      }
    });
    return result;
  }, [availableEditPoliceSpecs]);

  const availableEditPolicePesos = useMemo(() => {
    if (!editAmmoTipo) return [];
    const selectedTipoNorm = editAmmoTipo.trim().toLowerCase().replace(/\s+/g, ' ');
    const seen = new Set<string>();
    const result: string[] = [];
    availableEditPoliceSpecs.forEach(spec => {
      const specTipoNorm = spec.tipo.trim().toLowerCase().replace(/\s+/g, ' ');
      if (specTipoNorm !== selectedTipoNorm) return;
      const pesoClean = spec.peso.trim();
      const pesoKey = pesoClean.toLowerCase();
      if (pesoClean && !seen.has(pesoKey)) {
        seen.add(pesoKey);
        result.push(pesoClean);
      }
    });
    return result;
  }, [availableEditPoliceSpecs, editAmmoTipo]);

  React.useEffect(() => {
    if (!editingCautela) return;
    if (availableEditPoliceTipos.length === 0) {
      if (editAmmoTipo !== '') setEditAmmoTipo('');
    } else if (!availableEditPoliceTipos.includes(editAmmoTipo)) {
      setEditAmmoTipo(availableEditPoliceTipos[0]);
    }
  }, [editingCautela, availableEditPoliceTipos, editAmmoTipo]);

  React.useEffect(() => {
    if (!editingCautela) return;
    if (availableEditPolicePesos.length === 0) {
      if (editAmmoPeso !== '') setEditAmmoPeso('');
    } else if (!availableEditPolicePesos.includes(editAmmoPeso)) {
      setEditAmmoPeso(availableEditPolicePesos[0]);
    }
  }, [editingCautela, availableEditPolicePesos, editAmmoPeso]);


  const availableAmmoInUnit = useMemo(() => {
    if (!selectedWeapon) return [];
    return ammoStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === currentUser.unitId);
      const cal = calibers.find(c => c.id === st.caliberId);
      const matchCaliber = cal && selectedWeapon.caliber && cal.name.toLowerCase().includes(selectedWeapon.caliber.toLowerCase());
      return matchUnit && (matchCaliber || st.quantity > 0);
    });
  }, [selectedWeapon, ammoStocks, calibers, currentUser.unitId, isGeral]);

  // Munições disponíveis na unidade correspondentes ao calibre do armamento e à Destinação selecionada (Defesa, Treinamento ou Ensaio)
  const availableAmmoForAuthorizingWeapon = useMemo(() => {
    if (!authorizingCautela) return [];
    const normPlain = (s?: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const targetUnitId = authorizingCautela.unitId || currentUser.unitId;
    const selCal = normPlain(authorizingCautela.weaponCaliber);

    return ammoStocks.filter(st => {
      if (Number(st.quantity) <= 0) return false;

      const stVault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
      const stUnitId = st.unitId || stVault?.unitId || '';
      const matchUnit = isGeral ? true : (!targetUnitId || stUnitId === targetUnitId);
      if (!matchUnit) return false;

      const cal = calibers.find(
        c => c.id === st.caliberId || normPlain(c.name) === normPlain(st.caliberId)
      );
      const calName = normPlain(cal?.name || st.caliberId || '');
      const matchCaliber =
        !selCal ||
        calName === selCal ||
        Boolean(calName && (calName.includes(selCal) || selCal.includes(calName))) ||
        st.caliberId === authorizingCautela.weaponCaliber;
      if (!matchCaliber) return false;

      // Filtro por DESTINAÇÃO:
      // - Ensaio: todas as munições disponíveis naquele calibre
      // - Defesa: todas as munições de defesa/operacional daquele calibre
      // - Treinamento: todas as munições de treinamento daquele calibre
      if (authAmmoDestinacao === 'Ensaio') {
        return true;
      }

      const destNorm = normPlain(st.destinacao || '');
      const tipoNorm = normPlain(st.tipoMunicao || cal?.tipo || '');
      const isTrainingByTipo =
        tipoNorm.includes('treinamento') ||
        tipoNorm.includes('treino') ||
        tipoNorm.includes('ogival') ||
        tipoNorm.includes('etog') ||
        tipoNorm.includes('chog') ||
        tipoNorm.includes('nta') ||
        tipoNorm.includes('canto vivo');

      if (authAmmoDestinacao === 'Treinamento') {
        if (destNorm) {
          return (
            destNorm.includes('treinamento') ||
            destNorm.includes('treino') ||
            destNorm.includes('instrucao') ||
            destNorm.includes('curso de formacao')
          );
        }
        return isTrainingByTipo;
      }

      // authAmmoDestinacao === 'Defesa'
      if (destNorm) {
        return destNorm.includes('defesa') || destNorm.includes('operacional');
      }
      return !isTrainingByTipo;
    });
  }, [authorizingCautela, ammoStocks, vaultSpaces, calibers, currentUser.unitId, isGeral, authAmmoDestinacao]);

  // Comparação entre a munição solicitada pelo usuário em OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS
  // e a munição selecionada pelo Armeiro em "De qual cofre / lote vai tirar as munições?"
  const authAmmoComparison = useMemo(() => {
    const normComp = (s?: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const baseObs = ((authorizingCautela?.authorizationNotes || '').split('|')[0] || '').trim();
    const cleanedObs = baseObs
      .replace(/^Solicito\s+muni[cç][aã]o(?:\s+tipo)?\s*:\s*/i, '')
      .trim();

    let reqCaliber = '';
    let reqTipo = '';
    if (cleanedObs) {
      const weaponCalRaw = (authorizingCautela?.weaponCaliber || '').trim();
      if (
        weaponCalRaw &&
        cleanedObs.toLowerCase().startsWith(`${weaponCalRaw.toLowerCase()},`)
      ) {
        reqCaliber = weaponCalRaw;
        const rest = cleanedObs.slice(weaponCalRaw.length + 1).trim();
        const restParts = rest.split(/,\s+/).map(p => p.trim()).filter(Boolean);
        reqTipo = restParts[0] || rest;
      } else {
        const parts = cleanedObs.split(/,\s+/).map(p => p.trim()).filter(Boolean);
        reqCaliber = parts[0] || '';
        reqTipo = parts[1] || '';
      }
    }

    const selectedStock = authWithAmmo
      ? availableAmmoForAuthorizingWeapon.find(s => s.id === authStockId)
      : undefined;
    const selectedCalObj = selectedStock
      ? calibers.find(
          c => c.id === selectedStock.caliberId || normComp(c.name) === normComp(selectedStock.caliberId)
        )
      : undefined;

    const selectedCaliberDisplay = (
      selectedCalObj?.name ||
      selectedStock?.caliberId ||
      authorizingCautela?.weaponCaliber ||
      'Padrão'
    ).trim();
    const selectedTipoDisplay = (
      selectedStock?.tipoMunicao ||
      selectedCalObj?.tipo ||
      'Comum'
    ).trim();

    const selCalNorm = normComp(selectedCaliberDisplay);
    const reqCalNorm = normComp(reqCaliber);
    const selTipoNorm = normComp(selectedTipoDisplay);
    const reqTipoNorm = normComp(reqTipo);

    const sameCaliber = Boolean(
      reqCalNorm &&
        selCalNorm &&
        (selCalNorm === reqCalNorm ||
          selCalNorm.includes(reqCalNorm) ||
          reqCalNorm.includes(selCalNorm))
    );
    const sameTipo = Boolean(reqTipoNorm && selTipoNorm && selTipoNorm === reqTipoNorm);
    const isSameRequestedCaliberAndTipo = Boolean(
      selectedStock && baseObs && sameCaliber && sameTipo
    );

    const requestedAmmoConstant = cleanedObs || baseObs || 'Nenhuma munição solicitada';
    const showDivergenceJustification = Boolean(
      authWithAmmo && selectedStock && !isSameRequestedCaliberAndTipo
    );

    return {
      baseObs,
      requestedAmmoConstant,
      reqCaliber,
      reqTipo,
      selectedStock,
      selectedCalObj,
      selectedCaliberDisplay,
      selectedTipoDisplay,
      isSameRequestedCaliberAndTipo,
      showDivergenceJustification
    };
  }, [authorizingCautela, authWithAmmo, authStockId, availableAmmoForAuthorizingWeapon, calibers]);

  React.useEffect(() => {
    if (authorizingCautela && availableAmmoForAuthorizingWeapon.length > 0) {
      if (!availableAmmoForAuthorizingWeapon.some(s => s.id === authStockId)) {
        const rawSug = ((authorizingCautela.authorizationNotes || '').split('|')[0] || '').toLowerCase();
        const suggestedMatch = rawSug
          ? availableAmmoForAuthorizingWeapon.find(st => {
              const t = (st.tipoMunicao || '').toLowerCase().trim();
              const p = (st.pesoMunicao || '').toLowerCase().trim();
              const matchTipo = t && rawSug.includes(t);
              const matchPeso = !p || rawSug.includes(p);
              return Boolean(matchTipo && matchPeso);
            }) ||
            availableAmmoForAuthorizingWeapon.find(st => {
              const t = (st.tipoMunicao || '').toLowerCase().trim();
              return Boolean(t && rawSug.includes(t));
            })
          : undefined;
        setAuthStockId((suggestedMatch || availableAmmoForAuthorizingWeapon[0]).id);
      }
    } else if (authorizingCautela && availableAmmoForAuthorizingWeapon.length === 0 && authStockId !== '') {
      setAuthStockId('');
    }
  }, [authorizingCautela, availableAmmoForAuthorizingWeapon, authStockId]);

  const getLinkedAmmoForCautela = (cautela: CautelaArma) => {
    const list = storage.getCautelasMunicoes() || [];
    const cleanLinkedAmmoId = cautela.linkedAmmoCautelaId
      ? String(cautela.linkedAmmoCautelaId).replace(/^caut-mun-/, '')
      : '';
    // 1. Match direto pelo vínculo explícito da cautela de munições
    const exact = list.find(m =>
      (cautela.linkedAmmoCautelaId && (
        m.id === cautela.linkedAmmoCautelaId ||
        m.id === cleanLinkedAmmoId ||
        m.id === `caut-mun-${cleanLinkedAmmoId}`
      )) ||
      (m as any).cautelaArmaId === cautela.id ||
      m.linkedWeaponCautelaId === cautela.id
    );
    if (exact) return exact;

    // 2. Fallback exclusivo para registros sintéticos sincronizados de arma ('caut-active-'):
    // nunca vincula munições avulsas a registros reais de cautela de arma autorizados sem munição
    if (
      String(cautela.id || '').startsWith('caut-active-') &&
      !cautela.linkedAmmoCautelaId &&
      (cautela.status === 'AUTORIZADA' || cautela.status === 'DEVOLUCAO_PENDENTE')
    ) {
      const cDigits = cleanDigits(cautela.requesterMasp);
      return list.find(m => {
        const isActiveMun = m.status === 'AUTORIZADA' || (m.status as string) === 'DEVOLUCAO_PENDENTE';
        if (!isActiveMun) return false;
        const sameWeapon =
          (m.linkedWeaponSerialNumber && cautela.weaponSerialNumber && m.linkedWeaponSerialNumber === cautela.weaponSerialNumber) ||
          ((m as any).weaponId && cautela.weaponId && (m as any).weaponId === cautela.weaponId);
        if (!sameWeapon) return false;
        const mDigits = cleanDigits(m.requesterMasp);
        if (cDigits && mDigits && cDigits !== mDigits) return false;
        return true;
      }) || null;
    }

    return null;
  };

  // Resgata de forma consolidada os dados da munição e da cautela de munições vinculada (caso exista)
  const getRescuedAmmoDetails = (cautela: CautelaArma) => {
    const linkedAmmo = getLinkedAmmoForCautela(cautela);
    const linkedCautelaId = linkedAmmo?.id || cautela.linkedAmmoCautelaId || null;
    const quantity = Number(linkedAmmo?.quantity ?? cautela.ammoQuantity ?? 0);
    const hasAmmo = Boolean(linkedCautelaId || quantity > 0);
    const seraDevolvida = linkedAmmo && linkedAmmo.seraDevolvida !== undefined
      ? Boolean(linkedAmmo.seraDevolvida)
      : cautela.ammoSeraDevolvida !== undefined
        ? Boolean(cautela.ammoSeraDevolvida)
        : (cautela.ammoDestinacao || 'Defesa') !== 'Treinamento';
    const originVaultId = linkedAmmo?.vaultSpaceId || '';
    const originVault = originVaultId ? vaultSpaces.find(v => v.id === originVaultId) : undefined;

    return {
      hasAmmo,
      linkedAmmo,
      linkedCautelaId,
      linkedStatus: linkedAmmo?.status || null,
      returnedQuantity: linkedAmmo?.returnedQuantity ?? cautela.returnedAmmoQuantity ?? null,
      quantity,
      seraDevolvida, // true = munição passiva de devolução ("Irá devolver depois")
      caliberId: linkedAmmo?.caliberId || '',
      caliberName: linkedAmmo?.caliberName || cautela.ammoCaliberName || cautela.weaponCaliber || 'Padrão',
      fabricante: linkedAmmo?.fabricante || cautela.ammoFabricante || 'CBC',
      tipoMunicao: linkedAmmo?.tipoMunicao || cautela.ammoTipo || 'Operacional',
      pesoMunicao: linkedAmmo?.pesoMunicao || cautela.ammoPeso || 'N/I',
      loteMunicao: linkedAmmo?.loteMunicao || cautela.ammoLote || 'Lote Unidade',
      anoFabricacao: linkedAmmo?.anoFabricacao || null,
      destinacao: linkedAmmo?.destinacao || cautela.ammoDestinacao || 'Defesa',
      vaultSpaceId: originVaultId,
      originVaultCode: originVault?.code || ''
    };
  };

  // Abrir nova solicitação com verificação preventiva de cautela ativa para policial
  const handleOpenNovaSolicitacao = () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (isPolicial) {
      const activeList = scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE');
      if (activeList.length > 0) {
        setActiveCautelaWarningModal(activeList);
        return;
      }
    }
    setActiveTab('NOVA');
  };

  const handleGoToActiveCautela = () => {
    const hasAuthorized = scopedCautelas.some(c => c.status === 'AUTORIZADA');
    setActiveCautelaWarningModal(null);
    if (hasAuthorized) {
      setActiveTab('DEFERIDAS');
      setDeferidasSubFilter('ATIVAS');
    } else {
      setActiveTab('MINHAS');
    }
  };

  const handleProceedWithNewSolicitation = () => {
    setHasDismissedActiveWarning(true);
    setActiveCautelaWarningModal(null);
    setActiveTab('NOVA');
  };

  // Submeter nova solicitação de cautela
  const handleRequestCautela = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (isPolicial && !hasDismissedActiveWarning) {
      const activeList = scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE');
      if (activeList.length > 0) {
        setActiveCautelaWarningModal(activeList);
        return;
      }
    }

    if (!selectedWeaponId) {
      setErrorMsg('Selecione uma arma para solicitar a cautela.');
      return;
    }

    const weapon = weapons.find(w => w.id === selectedWeaponId);
    if (!weapon) {
      setErrorMsg('Armamento selecionado não encontrado.');
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('Selecione o Motivo / Finalidade da cautela (Treinamento, Operação, Plantão ou Serviço Ordinário).');
      return;
    }

    const beneficiary = (canAuthorize && isDirectCautela && targetOfficerId)
      ? (availableUnitOfficers.find(u => u.id === targetOfficerId) || currentUser)
      : currentUser;

    setIsSubmitting(true);
    try {
      const isDirect = Boolean(canAuthorize && isDirectCautela);
      const payload: any = {
        weaponId: weapon.id,
        weaponSerialNumber: weapon.serialNumber,
        weaponModel: weapon.model,
        weaponType: weapon.type,
        weaponCaliber: weapon.caliber,
        magazineQuantity: isPolicial ? (weapon.magazineQuantity || 2) : magazineQuantity,
        vaultSpaceId: weapon.vaultSpaceId, // Local original no cofre registrado para retorno
        departmentId: weapon.departmentId || beneficiary.departmentId || currentUser.departmentId,
        unitId: weapon.unitId || beneficiary.unitId || currentUser.unitId,
        requesterId: beneficiary.id,
        requesterName: beneficiary.name,
        requesterMasp: beneficiary.masp,
        requesterCargo: beneficiary.cargo,
        requesterPhone: beneficiary.phone,
        reason: reason.trim(),
        directAuthorized: isDirect,
        status: isDirect ? 'AUTORIZADA' : 'PENDENTE',
        armorerId: isDirect ? currentUser.id : undefined,
        armorerName: isDirect ? currentUser.name : undefined,
        armorerMasp: isDirect ? currentUser.masp : undefined
      };

      if (!isPolicial && requestAmmoTogether && Number(ammoQuantity) > 0) {
        const selectedStock = availableAmmoForSelectedWeapon.find(s => s.id === selectedAmmoStockId);
        const calObj = calibers.find(c => c.id === selectedStock?.caliberId);
        const resolvedFab = selectedStock?.fabricante || calObj?.fabricante || 'CBC';
        const resolvedTipo = ammoType || selectedStock?.tipoMunicao || (ammoDestinacao === 'Defesa' ? 'Defesa / Operacional' : 'Treinamento');
        const resolvedPeso = selectedStock?.pesoMunicao || calObj?.peso || '124gr';
        const resolvedLote = isDirect ? ammoLot : (selectedStock?.loteMunicao || 'Lote Unidade');

        payload.ammunition = {
          caliberId: selectedStock?.caliberId || weapon.caliber,
          caliberName: weapon.caliber,
          quantity: Number(ammoQuantity) || 0,
          fabricante: resolvedFab,
          tipoMunicao: resolvedTipo,
          pesoMunicao: resolvedPeso,
          loteMunicao: resolvedLote,
          destinacao: ammoDestinacao,
          vaultSpaceId: isDirect ? (selectedStock?.vaultSpaceId || weapon.vaultSpaceId) : undefined,
          reason: `Acautelamento em conjunto com ${weapon.model} Nº ${weapon.serialNumber} (${ammoDestinacao})`,
          seraDevolvida: isDirect ? ammoSeraDevolvida : (ammoDestinacao === 'Defesa')
        };
        payload.ammoQuantity = Number(ammoQuantity) || 0;
        payload.ammoDestinacao = ammoDestinacao;
        payload.ammoFabricante = resolvedFab;
        payload.ammoTipo = resolvedTipo;
        payload.ammoPeso = resolvedPeso;
        payload.ammoLote = resolvedLote;
      }

      // Regra de Negócio: Se for policial e marcou "Desejo solicitar munições",
      // salva meramente informativa em OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS
      // sem gerar cautela de munições em conjunto e sem deduzir do cofre
      if (isPolicial && policialWantsAmmo) {
        if (availablePoliceTipos.length === 0 || !policialAmmoTipo) {
          setErrorMsg(
            `Não há munições correspondentes ao calibre ${weapon.caliber} disponíveis na unidade no momento. Desmarque "Desejo solicitar munições" para solicitar apenas o armamento.`
          );
          setIsSubmitting(false);
          return;
        }
        if (availablePolicePesos.length > 0 && !policialAmmoPeso) {
          setErrorMsg('Selecione o peso do projétil disponível para o tipo de munição escolhido.');
          setIsSubmitting(false);
          return;
        }
        const calStr = weapon.caliber || 'Padrão';
        payload.authorizationNotes = policialAmmoPeso
          ? `Solicito munição tipo: ${calStr}, ${policialAmmoTipo}, ${policialAmmoPeso}`
          : `Solicito munição tipo: ${calStr}, ${policialAmmoTipo}`;
      }

      const res = await storage.requestCautelaArma(payload);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar solicitação de cautela.');
      } else {
        if (isDirect) {
          const newCautelaObj: CautelaArma = {
            id: res.id || `caut-${Date.now()}`,
            weaponId: weapon.id,
            weaponSerialNumber: weapon.serialNumber,
            weaponModel: weapon.model,
            weaponType: weapon.type,
            weaponCaliber: weapon.caliber,
            magazineQuantity: payload.magazineQuantity,
            vaultSpaceId: weapon.vaultSpaceId,
            departmentId: weapon.departmentId || beneficiary.departmentId || currentUser.departmentId,
            unitId: weapon.unitId || beneficiary.unitId || currentUser.unitId,
            requesterId: beneficiary.id,
            requesterName: beneficiary.name,
            requesterMasp: beneficiary.masp,
            requesterCargo: beneficiary.cargo,
            requesterPhone: beneficiary.phone,
            reason: reason.trim(),
            status: 'AUTORIZADA',
            requestDate: new Date().toISOString(),
            authorizedAt: new Date().toISOString(),
            armorerId: currentUser.id,
            armorerName: currentUser.name,
            armorerMasp: currentUser.masp,
            ammoQuantity: payload.ammoQuantity,
            ammoDestinacao: payload.ammoDestinacao,
            ammoFabricante: payload.ammoFabricante,
            ammoTipo: payload.ammoTipo,
            ammoPeso: payload.ammoPeso,
            ammoLote: payload.ammoLote,
            hadShots: false,
            shotsFired: 0,
            isWorking: true,
            hadMalfunction: false,
            returnedMagazinesCount: payload.magazineQuantity,
            createdAt: new Date().toISOString()
          };
          const isOwnDirect =
            beneficiary.id === currentUser.id || isOwnRecipientCautela(newCautelaObj);
          setLastDirectCautelaArma(newCautelaObj);
          setSuccessMsg(
            isOwnDirect
              ? `Arma ${weapon.model} (Série: ${weapon.serialNumber}) acautelada com sucesso em seu próprio nome (${beneficiary.name})! O registro consta na aba "Deferidas/Ativas Própria" e o recibo foi gerado imediatamente.`
              : `Arma ${weapon.model} (Série: ${weapon.serialNumber}) acautelada com sucesso para o policial ${beneficiary.name}! A cautela foi deferida diretamente e o recibo gerado imediatamente.`
          );
          setTimeout(() => {
            handlePrintTermo(newCautelaObj);
          }, 150);
          setActiveTab(isOwnDirect ? 'DEFERIDAS_PROPRIA' : 'DEFERIDAS');
        } else {
          setSuccessMsg(`Solicitação de cautela da arma ${weapon.model} (Série: ${weapon.serialNumber}) realizada com sucesso! A solicitação está listada em "Cautela de arma em análise" aguardando comando do armeiro.`);
          setActiveTab('MINHAS');
        }
        setSelectedWeaponId('');
        setReason('');
        setPolicialWantsAmmo(false);
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao solicitar cautela.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Abertura do fluxo de autorização pelo armeiro
  const handleOpenAuthorize = (cautela: CautelaArma) => {
    const linkedAmmo = getLinkedAmmoForCautela(cautela);
    const resolvedMotivo = getResolvedMotivoFinalidade(cautela);
    setErrorMsg('');
    setAuthStockId('');
    setAuthorizingCautela(cautela);
    // Inicia desmarcado: somente acautela munições caso o usuário Armeiro marque explicitamente a opção
    setAuthWithAmmo(false);
    setAuthAmmoQty(cautela.ammoQuantity || linkedAmmo?.quantity || 30);
    const isEnsaio =
      cautela.ammoDestinacao === 'Ensaio' || linkedAmmo?.destinacao === 'Ensaio';
    const isTreinamento =
      resolvedMotivo === 'Treinamento' ||
      cautela.ammoDestinacao === 'Treinamento' ||
      linkedAmmo?.destinacao === 'Treinamento';
    const initialDest: 'Treinamento' | 'Defesa' | 'Ensaio' = isEnsaio
      ? 'Ensaio'
      : isTreinamento
        ? 'Treinamento'
        : 'Defesa';
    setAuthAmmoDestinacao(initialDest);
    setAuthSeraDevolvida(initialDest === 'Defesa');
    setAuthNotes('');
  };

  // Confirmar autorização com seleção de cofre/lote e permanente vs devolver depois
  const handleConfirmAuthorizeWithAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizingCautela) return;

    const selectedStock = authWithAmmo
      ? availableAmmoForAuthorizingWeapon.find(s => s.id === authStockId)
      : undefined;

    if (authWithAmmo) {
      if (availableAmmoForAuthorizingWeapon.length === 0 || !selectedStock) {
        setErrorMsg(
          `Não há lote de munições disponível para a destinação "${authAmmoDestinacao}" no calibre ${authorizingCautela.weaponCaliber}.`
        );
        return;
      }
      if (!authAmmoQty || Number(authAmmoQty) < 1) {
        setErrorMsg('Informe uma quantidade válida de munições para a cautela.');
        return;
      }
      if (Number(authAmmoQty) > Number(selectedStock.quantity)) {
        setErrorMsg(
          `A quantidade informada (${authAmmoQty}) excede o saldo disponível no lote selecionado (${selectedStock.quantity} un.).`
        );
        return;
      }
      if (authAmmoComparison.showDivergenceJustification && !authNotes.trim()) {
        setErrorMsg(
          `Justifique o depósito da munição ${authAmmoComparison.selectedCaliberDisplay} - ${authAmmoComparison.selectedTipoDisplay}.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const resolvedAuthReq = getResolvedRequester(authorizingCautela);
      const allUsers = storage.getAllUsersForLookup();
      const reqDigits = cleanDigits(resolvedAuthReq.masp);
      const matchedUser =
        (authorizingCautela.requesterId
          ? allUsers.find(u => u.id === authorizingCautela.requesterId)
          : undefined) ||
        (reqDigits ? allUsers.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
        allUsers.find(u => normalizeStr(u.name) === normalizeStr(resolvedAuthReq.name));

      const resolvedRequesterId = matchedUser?.id || authorizingCautela.requesterId;
      const resolvedMotivo = getResolvedMotivoFinalidade(authorizingCautela) || authorizingCautela.reason;

      const justificationText =
        authWithAmmo && authAmmoComparison.showDivergenceJustification && authNotes.trim()
          ? authNotes.trim()
          : undefined;

      const notesToPersist = justificationText
        ? authAmmoComparison.baseObs
          ? `${authAmmoComparison.baseObs} | Justificativa do Armeiro (${authAmmoComparison.selectedCaliberDisplay} - ${authAmmoComparison.selectedTipoDisplay}): ${justificationText}`
          : `Justificativa do Armeiro (${authAmmoComparison.selectedCaliberDisplay} - ${authAmmoComparison.selectedTipoDisplay}): ${justificationText}`
        : undefined;

      const res = await storage.authorizeCautelaArma(authorizingCautela.id, {
        withAmmo: authWithAmmo,
        notes: notesToPersist,
        armorerJustification: justificationText,
        stockId: authWithAmmo ? (selectedStock?.id || authStockId || undefined) : undefined,
        vaultSpaceId: authWithAmmo
          ? (selectedStock?.vaultSpaceId || authorizingCautela.vaultSpaceId)
          : authorizingCautela.vaultSpaceId,
        seraDevolvida: authWithAmmo ? authSeraDevolvida : undefined,
        ammoQuantity: authWithAmmo ? Number(authAmmoQty) : 0,
        destinacao: authWithAmmo ? authAmmoDestinacao : undefined,
        caliberId: authWithAmmo ? selectedStock?.caliberId : undefined,
        caliberName: authWithAmmo ? authAmmoComparison.selectedCaliberDisplay : undefined,
        fabricante: authWithAmmo ? (selectedStock?.fabricante || authAmmoComparison.selectedCalObj?.fabricante || 'CBC') : undefined,
        tipoMunicao: authWithAmmo ? authAmmoComparison.selectedTipoDisplay : undefined,
        pesoMunicao: authWithAmmo ? (selectedStock?.pesoMunicao || authAmmoComparison.selectedCalObj?.peso) : undefined,
        loteMunicao: authWithAmmo ? selectedStock?.loteMunicao : undefined,
        anoFabricacao: authWithAmmo ? selectedStock?.anoFabricacao : undefined,
        weaponId: authorizingCautela.weaponId,
        weaponSerialNumber: authorizingCautela.weaponSerialNumber,
        weaponModel: authorizingCautela.weaponModel,
        weaponCaliber: authorizingCautela.weaponCaliber,
        departmentId: authorizingCautela.departmentId || matchedUser?.departmentId || currentUser.departmentId,
        unitId: authorizingCautela.unitId || matchedUser?.unitId || currentUser.unitId,
        reason: resolvedMotivo,
        cautelaId: authorizingCautela.id,
        requesterId: resolvedRequesterId,
        requesterName: resolvedAuthReq.name,
        requesterMasp: resolvedAuthReq.masp,
        requesterCargo: resolvedAuthReq.cargo || authorizingCautela.requesterCargo,
        armorerId: currentUser.id,
        armorerName: currentUser.name,
        armorerMasp: currentUser.masp
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar acautelamento.');
      } else {
        const isOwnAuth =
          resolvedRequesterId === currentUser.id || isOwnRecipientCautela(authorizingCautela);
        setSuccessMsg(
          `Cautela da arma ${authorizingCautela.weaponModel} (Série: ${authorizingCautela.weaponSerialNumber}) autorizada com sucesso! A arma passou de "Cautela Pendente" para "Acautelada — ${resolvedAuthReq.name} (MASP: ${resolvedAuthReq.masp})".${
            authWithAmmo
              ? ` Cautela de munições (${authAmmoQty} un. • Destinação: ${authAmmoDestinacao}) gerada em nome de ${resolvedAuthReq.name}.`
              : ' Cautela exclusiva do armamento (sem geração de cautela de munições).'
          }${isOwnAuth ? ' Disponível na aba "Deferidas/Ativas Própria".' : ''}`
        );
        setAuthorizingCautela(null);
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao autorizar acautelamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autorizar Cautela (Armeiro - Sem munições ou direto)
  const handleAuthorize = async (id: string, notes?: string) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const targetCautela = allCautelas.find(c => c.id === id || c.weaponId === id);
      const resolvedTargetReq = getResolvedRequester(targetCautela);
      const res = await storage.authorizeCautelaArma(id, {
        withAmmo: false,
        ammoQuantity: 0,
        notes,
        weaponId: targetCautela?.weaponId,
        weaponSerialNumber: targetCautela?.weaponSerialNumber,
        cautelaId: targetCautela?.id || id,
        requesterName: targetCautela ? resolvedTargetReq.name : undefined,
        requesterMasp: targetCautela ? resolvedTargetReq.masp : undefined,
        requesterCargo: targetCautela ? (resolvedTargetReq.cargo || targetCautela.requesterCargo) : undefined,
        armorerId: currentUser.id,
        armorerName: currentUser.name,
        armorerMasp: currentUser.masp
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar cautela.');
      } else {
        const reqName = targetCautela ? resolvedTargetReq.name : 'Policial';
        const reqMasp = targetCautela ? ` (MASP: ${resolvedTargetReq.masp})` : '';
        setSuccessMsg(`Cautela autorizada com sucesso! A arma passou de "Cautela Pendente" para "Acautelada — ${reqName}${reqMasp}", liberada para o policial e retirada do cofre.`);
        setNotesModal(null);
        setActionNotes('');
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar autorização.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recusar Cautela (Armeiro)
  const handleReject = async (id: string, notes?: string, extraWeaponId?: string, extraSerial?: string) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const targetCautela = allCautelas.find(c => c.id === id || c.weaponId === id || (extraWeaponId && c.weaponId === extraWeaponId));
      const res = await storage.rejectCautelaArma(id, notes, {
        weaponId: extraWeaponId || targetCautela?.weaponId,
        weaponSerialNumber: extraSerial || targetCautela?.weaponSerialNumber,
        cautelaId: targetCautela?.id || id,
        requesterName: targetCautela?.requesterName,
        requesterMasp: targetCautela?.requesterMasp
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao recusar cautela.');
      } else {
        const reqName = targetCautela ? targetCautela.requesterName : 'o policial solicitante';
        const reqMasp = targetCautela?.requesterMasp ? ` (MASP: ${targetCautela.requesterMasp})` : '';
        setSuccessMsg(`Solicitação de cautela recusada com sucesso. A arma retornou ao cofre no status "No Cofre", e ${reqName}${reqMasp} foi devidamente informado da recusa.`);
        setNotesModal(null);
        setActionNotes('');
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao recusar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Abrir modal de edição de solicitação de cautela pendente (Policial antes de Deferir/Indeferir)
  const handleOpenEditPendingCautela = (cautela: CautelaArma) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!isPendingStatus(cautela.status)) {
      setErrorMsg('Esta cautela já foi analisada pelo armeiro da unidade e não pode mais ser editada.');
      return;
    }

    setEditingCautela(cautela);
    setEditWeaponId(cautela.weaponId);

    const cleanReason = getResolvedMotivoFinalidade(cautela);
    setEditReason(cleanReason);

    const rawNotes = (cautela.authorizationNotes || '').trim();
    const normNotes = rawNotes.toLowerCase();
    if (normNotes.startsWith('solicito munição tipo:') || normNotes.startsWith('solicito municao tipo:')) {
      const afterColon = rawNotes.split(':').slice(1).join(':').trim();
      const parts = afterColon.split(',').map(p => p.trim()).filter(Boolean);
      setEditWantsAmmo(true);
      if (parts.length >= 3) {
        setEditAmmoTipo(parts[1]);
        setEditAmmoPeso(parts.slice(2).join(', '));
      } else if (parts.length === 2) {
        setEditAmmoTipo(parts[1]);
        setEditAmmoPeso('');
      } else {
        setEditAmmoTipo('');
        setEditAmmoPeso('');
      }
    } else {
      setEditWantsAmmo(false);
      setEditAmmoTipo('');
      setEditAmmoPeso('');
    }
  };

  // Salvar edição de solicitação de cautela pendente (enquanto o armeiro não Deferir/Indeferir)
  const handleConfirmEditPendingCautela = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCautela) return;

    if (!isPendingStatus(editingCautela.status)) {
      setErrorMsg('Esta cautela já foi analisada pelo armeiro da unidade e não pode mais ser editada.');
      setEditingCautela(null);
      return;
    }

    if (!editWeaponId) {
      setErrorMsg('Selecione um armamento válido para atualizar a solicitação de cautela.');
      return;
    }

    const chosenWeapon = editableUnitWeapons.find(w => w.id === editWeaponId);
    if (!chosenWeapon) {
      setErrorMsg('Armamento selecionado não encontrado.');
      return;
    }

    if (!editReason.trim()) {
      setErrorMsg('Selecione o Motivo / Finalidade da cautela (Treinamento, Operação, Plantão ou Serviço Ordinário).');
      return;
    }

    if (editWantsAmmo) {
      if (availableEditPoliceTipos.length === 0 || !editAmmoTipo) {
        setErrorMsg(
          `Não há munições correspondentes ao calibre ${chosenWeapon.caliber} disponíveis na unidade no momento. Desmarque "Desejo solicitar munições" para manter apenas o armamento.`
        );
        return;
      }
      if (availableEditPolicePesos.length > 0 && !editAmmoPeso) {
        setErrorMsg('Selecione o peso do projétil disponível para o tipo de munição escolhido.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const calStr = chosenWeapon.caliber || 'Padrão';
      const updatedAuthNotes = editWantsAmmo
        ? editAmmoPeso
          ? `Solicito munição tipo: ${calStr}, ${editAmmoTipo}, ${editAmmoPeso}`
          : `Solicito munição tipo: ${calStr}, ${editAmmoTipo}`
        : null;

      const res = await storage.updatePendingCautelaArma(editingCautela.id, {
        weaponId: chosenWeapon.id,
        weaponSerialNumber: chosenWeapon.serialNumber,
        weaponModel: chosenWeapon.model,
        weaponType: chosenWeapon.type,
        weaponCaliber: chosenWeapon.caliber,
        magazineQuantity: chosenWeapon.magazineQuantity || editingCautela.magazineQuantity || 2,
        vaultSpaceId: chosenWeapon.vaultSpaceId || editingCautela.vaultSpaceId,
        reason: editReason.trim(),
        authorizationNotes: updatedAuthNotes,
        originalWeaponId: editingCautela.weaponId,
        originalWeaponSerialNumber: editingCautela.weaponSerialNumber,
        cautelaId: editingCautela.id
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao salvar alterações na solicitação de cautela.');
      } else {
        setSuccessMsg(
          `Solicitação de cautela atualizada com sucesso! Arma: ${chosenWeapon.model} (Série: ${chosenWeapon.serialNumber}). A cautela permanece em análise aguardando decisão do armeiro da unidade.`
        );
        setEditingCautela(null);
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar edição da cautela.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Janela máxima de 15 minutos após a autorização para edição de cautela ativa pelo Armeiro
  const ACTIVE_CAUTELA_EDIT_LIMIT_MS = 15 * 60 * 1000;

  React.useEffect(() => {
    if (
      !canAuthorize ||
      (activeTab !== 'DEFERIDAS' &&
        activeTab !== 'DEFERIDAS_PROPRIA' &&
        activeTab !== 'HISTORICO_UNIDADE' &&
        !editingActiveCautela)
    ) {
      return;
    }
    setNowTickMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [canAuthorize, activeTab, editingActiveCautela]);

  const getActiveCautelaEditWindow = useCallback(
    (cautela: CautelaArma | null | undefined, refNowMs: number = nowTickMs) => {
      if (!cautela || cautela.status !== 'AUTORIZADA') {
        return {
          canEdit: false,
          remainingMs: 0,
          remainingLabel: '00:00',
          expired: true
        };
      }
      const refIso = cautela.authorizedAt || cautela.createdAt || cautela.requestDate;
      const authMs = refIso ? new Date(refIso).getTime() : NaN;
      if (!Number.isFinite(authMs)) {
        return {
          canEdit: false,
          remainingMs: 0,
          remainingLabel: '00:00',
          expired: true
        };
      }
      const elapsedMs = Math.max(0, refNowMs - authMs);
      const remainingMs = Math.max(0, ACTIVE_CAUTELA_EDIT_LIMIT_MS - elapsedMs);
      const canEdit = elapsedMs <= ACTIVE_CAUTELA_EDIT_LIMIT_MS;
      const totalSecs = Math.ceil(remainingMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const remainingLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      return {
        canEdit,
        remainingMs,
        remainingLabel,
        expired: !canEdit
      };
    },
    [nowTickMs, ACTIVE_CAUTELA_EDIT_LIMIT_MS]
  );

  // Armas disponíveis para troca pelo Armeiro na edição da cautela ativa (arma atual + armas "No Cofre" da unidade)
  const editableActiveWeapons = useMemo(() => {
    if (!editingActiveCautela) return [];
    const targetUnitId = editingActiveCautela.unitId || currentUser.unitId;
    return weapons.filter(w => {
      const matchUnit = isGeral ? true : (!targetUnitId || w.unitId === targetUnitId);
      if (!matchUnit) return false;
      return w.id === editingActiveCautela.weaponId || w.status === 'No Cofre';
    });
  }, [editingActiveCautela, weapons, currentUser.unitId, isGeral]);

  const activeEditSelectedWeapon = useMemo(() => {
    if (!activeEditWeaponId) return null;
    return (
      editableActiveWeapons.find(w => w.id === activeEditWeaponId) ||
      weapons.find(w => w.id === activeEditWeaponId) ||
      null
    );
  }, [editableActiveWeapons, weapons, activeEditWeaponId]);

  const activeEditCurrentAmmoDetails = useMemo(() => {
    if (!editingActiveCautela) return null;
    return getRescuedAmmoDetails(editingActiveCautela);
  }, [editingActiveCautela, localSyncTick]);

  // Lotes disponíveis para edição de munição na cautela ativa (considerando saldo restituível caso seja o mesmo lote atual)
  const availableAmmoForActiveEdit = useMemo(() => {
    if (!editingActiveCautela) return [] as Array<AmmunitionStock & { effectiveQuantity: number }>;
    const normPlain = (s?: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const targetUnitId = editingActiveCautela.unitId || currentUser.unitId;
    const weaponCaliber =
      activeEditSelectedWeapon?.caliber || editingActiveCautela.weaponCaliber || '';
    const selCal = normPlain(weaponCaliber);

    const curAmmo = activeEditCurrentAmmoDetails;
    const curHasAmmo = Boolean(curAmmo?.hasAmmo && Number(curAmmo.quantity) > 0);
    const curVaultId = curAmmo?.vaultSpaceId || editingActiveCautela.vaultSpaceId || '';
    const curLoteNorm = normPlain(curAmmo?.loteMunicao || '');

    const result: Array<AmmunitionStock & { effectiveQuantity: number }> = [];

    ammoStocks.forEach(st => {
      const stVault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
      const stUnitId = st.unitId || stVault?.unitId || '';
      const matchUnit = isGeral ? true : (!targetUnitId || stUnitId === targetUnitId);
      if (!matchUnit) return;

      const cal = calibers.find(
        c => c.id === st.caliberId || normPlain(c.name) === normPlain(st.caliberId)
      );
      const calName = normPlain(cal?.name || st.caliberId || '');
      const matchCaliber =
        !selCal ||
        calName === selCal ||
        Boolean(calName && (calName.includes(selCal) || selCal.includes(calName))) ||
        st.caliberId === weaponCaliber;
      if (!matchCaliber) return;

      const isSameCurrentLot = Boolean(
        curHasAmmo &&
          (!curVaultId || st.vaultSpaceId === curVaultId) &&
          (!curLoteNorm || normPlain(st.loteMunicao || '') === curLoteNorm)
      );
      const effectiveQuantity =
        Number(st.quantity || 0) + (isSameCurrentLot ? Number(curAmmo?.quantity || 0) : 0);
      if (effectiveQuantity <= 0) return;

      if (activeEditAmmoDestinacao !== 'Ensaio') {
        const destNorm = normPlain(st.destinacao || '');
        const tipoNorm = normPlain(st.tipoMunicao || cal?.tipo || '');
        const isTrainingByTipo =
          tipoNorm.includes('treinamento') ||
          tipoNorm.includes('treino') ||
          tipoNorm.includes('ogival') ||
          tipoNorm.includes('etog') ||
          tipoNorm.includes('chog') ||
          tipoNorm.includes('nta') ||
          tipoNorm.includes('canto vivo');

        if (activeEditAmmoDestinacao === 'Treinamento') {
          const okTreino = destNorm
            ? destNorm.includes('treinamento') ||
              destNorm.includes('treino') ||
              destNorm.includes('instrucao') ||
              destNorm.includes('curso de formacao')
            : isTrainingByTipo;
          if (!okTreino) return;
        } else {
          const okDefesa = destNorm
            ? destNorm.includes('defesa') || destNorm.includes('operacional')
            : !isTrainingByTipo;
          if (!okDefesa) return;
        }
      }

      result.push({
        ...st,
        effectiveQuantity
      });
    });

    return result;
  }, [
    editingActiveCautela,
    activeEditSelectedWeapon,
    activeEditCurrentAmmoDetails,
    ammoStocks,
    vaultSpaces,
    calibers,
    currentUser.unitId,
    isGeral,
    activeEditAmmoDestinacao
  ]);

  React.useEffect(() => {
    if (!editingActiveCautela) return;
    if (availableAmmoForActiveEdit.length > 0) {
      if (!availableAmmoForActiveEdit.some(s => s.id === activeEditStockId)) {
        const curAmmo = activeEditCurrentAmmoDetails;
        const matchedExistingLot = curAmmo?.hasAmmo
          ? availableAmmoForActiveEdit.find(
              st =>
                (!curAmmo.vaultSpaceId || st.vaultSpaceId === curAmmo.vaultSpaceId) &&
                (!curAmmo.loteMunicao ||
                  (st.loteMunicao || '').trim().toLowerCase() ===
                    curAmmo.loteMunicao.trim().toLowerCase())
            )
          : undefined;
        setActiveEditStockId((matchedExistingLot || availableAmmoForActiveEdit[0]).id);
      }
    } else if (activeEditStockId !== '') {
      setActiveEditStockId('');
    }
  }, [editingActiveCautela, availableAmmoForActiveEdit, activeEditStockId, activeEditCurrentAmmoDetails]);

  const activeEditAmmoComparison = useMemo(() => {
    const normComp = (s?: string) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const baseObs = ((editingActiveCautela?.authorizationNotes || '').split('|')[0] || '').trim();
    const cleanedObs = baseObs
      .replace(/^Solicito\s+muni[cç][aã]o(?:\s+tipo)?\s*:\s*/i, '')
      .trim();

    let reqCaliber = '';
    let reqTipo = '';
    if (cleanedObs) {
      const weaponCalRaw = (editingActiveCautela?.weaponCaliber || '').trim();
      if (weaponCalRaw && cleanedObs.toLowerCase().startsWith(`${weaponCalRaw.toLowerCase()},`)) {
        reqCaliber = weaponCalRaw;
        const rest = cleanedObs.slice(weaponCalRaw.length + 1).trim();
        const restParts = rest.split(/,\s+/).map(p => p.trim()).filter(Boolean);
        reqTipo = restParts[0] || rest;
      } else {
        const parts = cleanedObs.split(/,\s+/).map(p => p.trim()).filter(Boolean);
        reqCaliber = parts[0] || '';
        reqTipo = parts[1] || '';
      }
    }

    const selectedStock = activeEditWithAmmo
      ? availableAmmoForActiveEdit.find(s => s.id === activeEditStockId)
      : undefined;
    const selectedCalObj = selectedStock
      ? calibers.find(
          c => c.id === selectedStock.caliberId || normComp(c.name) === normComp(selectedStock.caliberId)
        )
      : undefined;

    const selectedCaliberDisplay = (
      selectedCalObj?.name ||
      selectedStock?.caliberId ||
      activeEditSelectedWeapon?.caliber ||
      editingActiveCautela?.weaponCaliber ||
      'Padrão'
    ).trim();
    const selectedTipoDisplay = (
      selectedStock?.tipoMunicao ||
      selectedCalObj?.tipo ||
      'Comum'
    ).trim();

    const selCalNorm = normComp(selectedCaliberDisplay);
    const reqCalNorm = normComp(reqCaliber);
    const selTipoNorm = normComp(selectedTipoDisplay);
    const reqTipoNorm = normComp(reqTipo);

    const sameCaliber = Boolean(
      reqCalNorm &&
        selCalNorm &&
        (selCalNorm === reqCalNorm ||
          selCalNorm.includes(reqCalNorm) ||
          reqCalNorm.includes(selCalNorm))
    );
    const sameTipo = Boolean(reqTipoNorm && selTipoNorm && selTipoNorm === reqTipoNorm);
    const isSameRequestedCaliberAndTipo = Boolean(
      selectedStock && baseObs && sameCaliber && sameTipo
    );

    const requestedAmmoConstant = cleanedObs || baseObs || 'Nenhuma munição solicitada';
    const showDivergenceJustification = Boolean(
      activeEditWithAmmo && selectedStock && !isSameRequestedCaliberAndTipo
    );

    return {
      baseObs,
      requestedAmmoConstant,
      selectedStock,
      selectedCalObj,
      selectedCaliberDisplay,
      selectedTipoDisplay,
      showDivergenceJustification
    };
  }, [
    editingActiveCautela,
    activeEditWithAmmo,
    activeEditStockId,
    availableAmmoForActiveEdit,
    calibers,
    activeEditSelectedWeapon
  ]);

  const handleOpenEditActiveCautela = (cautela: CautelaArma) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!canAuthorize) {
      setErrorMsg('Apenas o armeiro da unidade pode editar cautelas na aba Deferidas/Ativas.');
      return;
    }
    const win = getActiveCautelaEditWindow(cautela, Date.now());
    if (!win.canEdit) {
      setErrorMsg(
        'O prazo máximo de 15 minutos após a autorização expirou. Esta cautela não pode mais ser alterada.'
      );
      return;
    }

    const resolvedReq = getResolvedRequester(cautela);
    const allUsers = storage.getAllUsersForLookup();
    const reqDigits = cleanDigits(resolvedReq.masp);
    const matchedOfficer =
      (cautela.requesterId ? allUsers.find(u => u.id === cautela.requesterId) : undefined) ||
      (reqDigits ? allUsers.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
      allUsers.find(u => normalizeStr(u.name) === normalizeStr(resolvedReq.name));

    const curAmmo = getRescuedAmmoDetails(cautela);
    const curDestRaw = curAmmo.destinacao || cautela.ammoDestinacao || 'Defesa';
    const resolvedDest: 'Treinamento' | 'Defesa' | 'Ensaio' =
      curDestRaw === 'Ensaio'
        ? 'Ensaio'
        : curDestRaw === 'Treinamento'
          ? 'Treinamento'
          : 'Defesa';

    const existingJustifPart = ((cautela.authorizationNotes || '').split('|')[1] || '')
      .replace(/^Justificativa do Armeiro\s*\([^)]*\)\s*:\s*/i, '')
      .trim();

    setEditingActiveCautela(cautela);
    setActiveEditRequesterId(matchedOfficer?.id || cautela.requesterId || '');
    setActiveEditWeaponId(cautela.weaponId);
    setActiveEditMagazines(cautela.magazineQuantity || 2);
    setActiveEditReason(getResolvedMotivoFinalidade(cautela) || 'Serviço Ordinário');
    setActiveEditWithAmmo(Boolean(curAmmo.hasAmmo && curAmmo.quantity > 0));
    setActiveEditAmmoQty(curAmmo.quantity > 0 ? curAmmo.quantity : 30);
    setActiveEditAmmoDestinacao(resolvedDest);
    setActiveEditSeraDevolvida(curAmmo.hasAmmo ? curAmmo.seraDevolvida : resolvedDest === 'Defesa');
    setActiveEditStockId('');
    setActiveEditNotes(existingJustifPart);
    setNowTickMs(Date.now());
  };

  const handleConfirmEditActiveCautela = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActiveCautela) return;

    const win = getActiveCautelaEditWindow(editingActiveCautela, Date.now());
    if (!win.canEdit) {
      setErrorMsg(
        'O prazo máximo de 15 minutos após a autorização expirou. Esta cautela não pode mais ser alterada.'
      );
      setEditingActiveCautela(null);
      return;
    }

    const chosenWeapon =
      editableActiveWeapons.find(w => w.id === activeEditWeaponId) ||
      weapons.find(w => w.id === activeEditWeaponId);
    if (!chosenWeapon) {
      setErrorMsg('Selecione um armamento válido para a cautela.');
      return;
    }

    if (!activeEditReason.trim()) {
      setErrorMsg('Selecione o Motivo / Finalidade da cautela.');
      return;
    }

    const selectedStock = activeEditAmmoComparison.selectedStock;
    if (activeEditWithAmmo) {
      if (availableAmmoForActiveEdit.length === 0 || !selectedStock) {
        setErrorMsg(
          `Não há lote de munições disponível para a destinação "${activeEditAmmoDestinacao}" no calibre ${chosenWeapon.caliber}.`
        );
        return;
      }
      if (!activeEditAmmoQty || Number(activeEditAmmoQty) < 1) {
        setErrorMsg('Informe uma quantidade válida de munições.');
        return;
      }
      if (Number(activeEditAmmoQty) > Number(selectedStock.effectiveQuantity)) {
        setErrorMsg(
          `A quantidade informada (${activeEditAmmoQty}) excede o saldo disponível para este lote (${selectedStock.effectiveQuantity} un.).`
        );
        return;
      }
      if (activeEditAmmoComparison.showDivergenceJustification && !activeEditNotes.trim()) {
        setErrorMsg(
          `Justifique o depósito da munição ${activeEditAmmoComparison.selectedCaliberDisplay} - ${activeEditAmmoComparison.selectedTipoDisplay}.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const allUsers = storage.getAllUsersForLookup();
      const selectedOfficer = activeEditRequesterId
        ? allUsers.find(u => u.id === activeEditRequesterId)
        : undefined;
      const fallbackReq = getResolvedRequester(editingActiveCautela);

      const finalReqId = selectedOfficer?.id || editingActiveCautela.requesterId;
      const finalReqName = selectedOfficer?.name || fallbackReq.name;
      const finalReqMasp = selectedOfficer?.masp || fallbackReq.masp;
      const finalReqCargo =
        selectedOfficer?.cargo || fallbackReq.cargo || editingActiveCautela.requesterCargo;

      const justificationText =
        activeEditWithAmmo &&
        activeEditAmmoComparison.showDivergenceJustification &&
        activeEditNotes.trim()
          ? activeEditNotes.trim()
          : undefined;

      const notesToPersist = justificationText
        ? activeEditAmmoComparison.baseObs
          ? `${activeEditAmmoComparison.baseObs} | Justificativa do Armeiro (${activeEditAmmoComparison.selectedCaliberDisplay} - ${activeEditAmmoComparison.selectedTipoDisplay}): ${justificationText}`
          : `Justificativa do Armeiro (${activeEditAmmoComparison.selectedCaliberDisplay} - ${activeEditAmmoComparison.selectedTipoDisplay}): ${justificationText}`
        : activeEditAmmoComparison.baseObs || undefined;

      const res = await storage.updateActiveCautelaArma(editingActiveCautela.id, {
        weaponId: chosenWeapon.id,
        weaponSerialNumber: chosenWeapon.serialNumber,
        weaponModel: chosenWeapon.model,
        weaponType: chosenWeapon.type,
        weaponCaliber: chosenWeapon.caliber,
        magazineQuantity: Math.max(1, Number(activeEditMagazines) || 1),
        reason: activeEditReason.trim(),
        requesterId: finalReqId,
        requesterName: finalReqName,
        requesterMasp: finalReqMasp,
        requesterCargo: finalReqCargo,
        departmentId: editingActiveCautela.departmentId || chosenWeapon.departmentId,
        unitId: editingActiveCautela.unitId || chosenWeapon.unitId,
        withAmmo: activeEditWithAmmo,
        ammoQuantity: activeEditWithAmmo ? Number(activeEditAmmoQty) : 0,
        destinacao: activeEditWithAmmo ? activeEditAmmoDestinacao : undefined,
        stockId: activeEditWithAmmo ? selectedStock?.id : undefined,
        vaultSpaceId: activeEditWithAmmo
          ? (selectedStock?.vaultSpaceId || editingActiveCautela.vaultSpaceId)
          : editingActiveCautela.vaultSpaceId,
        seraDevolvida: activeEditWithAmmo ? activeEditSeraDevolvida : undefined,
        caliberId: activeEditWithAmmo ? selectedStock?.caliberId : undefined,
        caliberName: activeEditWithAmmo ? activeEditAmmoComparison.selectedCaliberDisplay : undefined,
        fabricante: activeEditWithAmmo
          ? (selectedStock?.fabricante || activeEditAmmoComparison.selectedCalObj?.fabricante || 'CBC')
          : undefined,
        tipoMunicao: activeEditWithAmmo ? activeEditAmmoComparison.selectedTipoDisplay : undefined,
        pesoMunicao: activeEditWithAmmo
          ? (selectedStock?.pesoMunicao || activeEditAmmoComparison.selectedCalObj?.peso)
          : undefined,
        loteMunicao: activeEditWithAmmo ? selectedStock?.loteMunicao : undefined,
        anoFabricacao: activeEditWithAmmo ? selectedStock?.anoFabricacao : undefined,
        notes: notesToPersist,
        armorerJustification: justificationText,
        cautelaId: editingActiveCautela.id
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao salvar alterações na cautela ativa.');
      } else {
        const becameOwn =
          finalReqId === currentUser.id ||
          (cleanDigits(finalReqMasp) &&
            cleanDigits(finalReqMasp) === cleanDigits(currentUser.masp));
        setSuccessMsg(
          `Cautela ativa atualizada com sucesso dentro do prazo de 15 minutos! Arma: ${chosenWeapon.model} (Série: ${chosenWeapon.serialNumber}) — Policial: ${finalReqName} (MASP: ${finalReqMasp}).`
        );
        if (becameOwn && activeTab === 'DEFERIDAS') {
          setActiveTab('DEFERIDAS_PROPRIA');
        } else if (!becameOwn && activeTab === 'DEFERIDAS_PROPRIA') {
          setActiveTab('DEFERIDAS');
        }
        setEditingActiveCautela(null);
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao editar cautela ativa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excluir Solicitação de Cautela Pendente (Policial enquanto o armeiro não Deferir/Indeferir)
  const handleCancelPendingCautela = async (cautela: CautelaArma) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await storage.cancelCautelaArma(cautela.id, {
        weaponId: cautela.weaponId,
        weaponSerialNumber: cautela.weaponSerialNumber,
        cautelaId: cautela.id,
        requesterName: cautela.requesterName,
        requesterMasp: cautela.requesterMasp
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao excluir solicitação de cautela.');
        setCancelPendingModal(null);
        await onRefresh();
      } else {
        setSuccessMsg(`Solicitação de cautela da arma ${cautela.weaponModel} (Série: ${cautela.weaponSerialNumber}) excluída com sucesso! O armamento retornou ao cofre no status "No Cofre".`);
        setCancelPendingModal(null);
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar exclusão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Armas Vault Spaces na unidade da arma devolvida
  const availableArmasVaults = useMemo(() => {
    if (!returningCautela) return [];
    const targetUnit = returningCautela.unitId || currentUser.unitId;
    const originWeaponVaultId = returningCautela.vaultSpaceId || '';
    const unitVaults = vaultSpaces.filter(v =>
      isGeral ? (!targetUnit || !v.unitId || v.unitId === targetUnit) : (!v.unitId || v.unitId === targetUnit)
    );
    const weaponTyped = unitVaults.filter(v => {
      const t = String(v.type || '').toUpperCase();
      return !t || t.includes('ARMA') || v.id === originWeaponVaultId;
    });
    const baseList = weaponTyped.length > 0 ? weaponTyped : unitVaults;
    if (originWeaponVaultId && !baseList.some(v => v.id === originWeaponVaultId)) {
      const originObj = vaultSpaces.find(v => v.id === originWeaponVaultId);
      if (originObj) return [originObj, ...baseList];
    }
    return baseList;
  }, [returningCautela, vaultSpaces, currentUser.unitId, isGeral]);

  // Cofres disponíveis para receber as munições devolvidas na unidade
  const availableAmmoVaults = useMemo(() => {
    if (!returningCautela) return [];
    const targetUnit = returningCautela.unitId || currentUser.unitId;
    const linkedAmmo = getLinkedAmmoForCautela(returningCautela);
    const originAmmoVaultId = linkedAmmo?.vaultSpaceId || '';

    const unitVaults = vaultSpaces.filter(v =>
      isGeral ? (!targetUnit || !v.unitId || v.unitId === targetUnit) : (!v.unitId || v.unitId === targetUnit)
    );
    const ammoTyped = unitVaults.filter(v => {
      const t = String(v.type || '').toUpperCase();
      return !t || t.includes('MUNI') || v.id === originAmmoVaultId;
    });

    const baseList = ammoTyped.length > 0 ? ammoTyped : unitVaults;
    if (originAmmoVaultId && !baseList.some(v => v.id === originAmmoVaultId)) {
      const originVaultObj = vaultSpaces.find(v => v.id === originAmmoVaultId);
      if (originVaultObj) return [originVaultObj, ...baseList];
    }
    return baseList;
  }, [returningCautela, vaultSpaces, currentUser.unitId, isGeral, localSyncTick]);

  // Impressão do Recibo Oficial de Devolução de Armamento e Munições ao Cofre
  const handlePrintReciboDevolucao = (
    cautela: CautelaArma,
    overrides?: {
      weaponVaultId?: string;
      ammoVaultId?: string;
      returnedAmmoQty?: number;
      returnArmorerName?: string;
      returnArmorerMasp?: string;
      returnArmorerCargo?: string;
      returnDateIso?: string;
      hadShots?: boolean;
      shotsFired?: number;
      isWorking?: boolean;
      defectDescription?: string | null;
      hadMalfunction?: boolean;
      malfunctionDescription?: string | null;
      returnedMagazinesCount?: number;
      returnObservations?: string;
      forceReturnAmmo?: boolean;
    }
  ) => {
    const unitObj = units.find(u => u.id === cautela.unitId) || userUnit;
    const deptObj = departments.find(d => d.id === (cautela.departmentId || unitObj?.departmentId));
    const termoLogo = getSystemLogo(unitObj, deptObj);
    const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);

    const chosenWeaponVaultId =
      overrides?.weaponVaultId ||
      cautela.vaultSpaceId ||
      weapon?.vaultSpaceId ||
      weapon?.previousVaultSpaceId;
    const returnVault = chosenWeaponVaultId ? vaultSpaces.find(v => v.id === chosenWeaponVaultId) : undefined;
    const returnUnit = returnVault ? units.find(u => u.id === returnVault.unitId) : unitObj;
    const weaponVaultAddress = isPolicial
      ? (unitObj ? unitObj.name : 'Unidade Policial')
      : returnVault
        ? `${returnVault.code}${(returnVault as any).description ? ` — ${(returnVault as any).description}` : ''}${returnUnit ? ` (${returnUnit.name})` : ''}`
        : 'Cofre da Unidade';

    const requesterInfo = getResolvedRequester(cautela);
    const storedReqUser = storage.getUsers().find(u => u.id === cautela.requesterId);
    const requesterName = requesterInfo.name || cautela.requesterName || 'Policial';
    const requesterMasp = requesterInfo.masp || cautela.requesterMasp || 'N/I';
    const requesterCareer = (cautela.requesterCargo || storedReqUser?.cargo || 'Policial Civil').trim();

    const storedArmorerUser = storage.getUsers().find(u =>
      (cautela.returnArmorerId && u.id === cautela.returnArmorerId) ||
      (!cautela.returnArmorerId && u.id === currentUser.id)
    );
    const receivingArmorerName =
      overrides?.returnArmorerName ||
      cautela.returnArmorerName ||
      (canAuthorize ? currentUser.name : cautela.armorerName) ||
      'Armeiro da Unidade';
    const receivingArmorerMasp =
      overrides?.returnArmorerMasp ||
      cautela.returnArmorerMasp ||
      (canAuthorize ? currentUser.masp : cautela.armorerMasp) ||
      'N/I';
    const receivingArmorerCargo =
      overrides?.returnArmorerCargo ||
      storedArmorerUser?.cargo ||
      (canAuthorize ? currentUser.cargo || currentUser.role : 'Armeiro') ||
      'Armeiro';

    const returnDateFormatted = new Date(
      overrides?.returnDateIso || cautela.returnDate || cautela.updatedAt || new Date().toISOString()
    ).toLocaleString('pt-BR');
    const checkoutDateFormatted = new Date(
      cautela.authorizedAt || cautela.requestDate || cautela.createdAt || new Date().toISOString()
    ).toLocaleString('pt-BR');

    const finalHadShots = overrides?.hadShots !== undefined ? overrides.hadShots : Boolean(cautela.hadShots);
    const finalShotsFired = overrides?.shotsFired !== undefined ? overrides.shotsFired : Number(cautela.shotsFired || 0);
    const finalIsWorking = overrides?.isWorking !== undefined ? overrides.isWorking : cautela.isWorking !== false;
    const finalDefectDesc = overrides?.defectDescription !== undefined ? overrides.defectDescription : cautela.defectDescription;
    const finalHadMalfunction = overrides?.hadMalfunction !== undefined ? overrides.hadMalfunction : Boolean(cautela.hadMalfunction);
    const finalMalfunctionDesc = overrides?.malfunctionDescription !== undefined ? overrides.malfunctionDescription : cautela.malfunctionDescription;
    const finalReturnedMagazines =
      overrides?.returnedMagazinesCount !== undefined
        ? overrides.returnedMagazinesCount
        : (cautela.returnedMagazinesCount ?? cautela.magazineQuantity ?? 1);
    const finalReturnObs =
      overrides?.returnObservations !== undefined ? overrides.returnObservations : (cautela.returnObservations || '');

    const ammoDetails = getRescuedAmmoDetails(cautela);
    const hasAmmo = ammoDetails.hasAmmo && ammoDetails.quantity > 0;
    const isAmmoReturnedToVault = Boolean(
      hasAmmo && (ammoDetails.seraDevolvida || overrides?.forceReturnAmmo || (overrides?.returnedAmmoQty ?? 0) > 0)
    );
    const finalReturnedAmmoQty = hasAmmo
      ? overrides?.returnedAmmoQty !== undefined
        ? overrides.returnedAmmoQty
        : ammoDetails.seraDevolvida
          ? (ammoDetails.returnedQuantity ?? Math.max(0, ammoDetails.quantity - finalShotsFired))
          : 0
      : 0;
    const finalConsumedAmmoQty = hasAmmo
      ? Math.max(0, ammoDetails.quantity - finalReturnedAmmoQty)
      : 0;

    const chosenAmmoVaultId = overrides?.ammoVaultId || ammoDetails.vaultSpaceId || chosenWeaponVaultId;
    const ammoVault = chosenAmmoVaultId ? vaultSpaces.find(v => v.id === chosenAmmoVaultId) : undefined;
    const ammoVaultUnit = ammoVault ? units.find(u => u.id === ammoVault.unitId) : unitObj;
    const ammoVaultAddress = isPolicial
      ? (unitObj ? unitObj.name : 'Unidade Policial')
      : ammoVault
        ? `${ammoVault.code}${(ammoVault as any).description ? ` — ${(ammoVault as any).description}` : ''}${ammoVaultUnit ? ` (${ammoVaultUnit.name})` : ''}`
        : 'Cofre de Munições da Unidade';

    const headerHtml = (protocolText: string) => `
      <div class="header-box">
        ${termoLogo ? `<img src="${termoLogo}" alt="Brasão" class="header-logo" />` : ''}
        <div class="header-center">
          <p class="header-title-org">${deptObj ? deptObj.name : 'POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS'}</p>
          <p class="header-subtitle-unit">${unitObj ? unitObj.name : 'UNIDADE POLICIAL'} — SETOR DE ARMARIA E CONTROLE BÉLICO</p>
          <p class="header-protocol">${protocolText}</p>
        </div>
      </div>
    `;

    const signaturesHtml = `
      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"></div>
          <p class="sig-name">${requesterName}</p>
          <p class="sig-role">${requesterCareer} — Policial Devolvente</p>
          <p class="sig-masp">MASP: ${requesterMasp}</p>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <p class="sig-name">${receivingArmorerName}</p>
          <p class="sig-role">${receivingArmorerCargo} — Armeiro Recebedor</p>
          <p class="sig-masp">MASP: ${receivingArmorerMasp}</p>
        </div>
      </div>
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Recibo de Devolução - ${cautela.weaponSerialNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
            font-family: Arial, Helvetica, sans-serif !important;
            margin: 0;
            padding: 8px;
            font-size: 11px;
            line-height: 1.45;
          }
          .header-box {
            display: flex;
            align-items: center;
            gap: 14px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .header-logo {
            height: 58px;
            width: auto;
            max-width: 72px;
            object-fit: contain;
            flex-shrink: 0;
          }
          .header-center {
            flex: 1;
            text-align: center;
          }
          .header-title-org {
            margin: 0;
            font-size: 15px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #0f172a;
          }
          .header-subtitle-unit {
            margin: 3px 0 0;
            font-size: 12px;
            font-weight: bold;
            color: #334155;
            text-transform: uppercase;
          }
          .header-protocol {
            margin: 3px 0 0;
            font-size: 10px;
            color: #475569;
            font-family: monospace;
          }
          .doc-title {
            text-align: center;
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
            background: #ecfdf5;
            border: 1.5px solid #059669;
            color: #064e3b;
            padding: 7px 10px;
            margin-bottom: 14px;
            letter-spacing: 0.4px;
          }
          .section-box {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            margin-bottom: 12px;
            overflow: hidden;
          }
          .section-title {
            background: #f1f5f9;
            border-bottom: 1px solid #cbd5e1;
            padding: 5px 10px;
            font-weight: bold;
            font-size: 10.5px;
            text-transform: uppercase;
            color: #0f172a;
          }
          .grid-table {
            width: 100%;
            border-collapse: collapse;
          }
          .grid-table td {
            padding: 6px 10px;
            border-bottom: 1px solid #e2e8f0;
            border-right: 1px solid #e2e8f0;
            vertical-align: top;
          }
          .grid-table tr:last-child td {
            border-bottom: none;
          }
          .grid-table td:last-child {
            border-right: none;
          }
          .lbl {
            display: block;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 2px;
          }
          .val {
            font-size: 11px;
            font-weight: bold;
            color: #0f172a;
          }
          .vault-highlight {
            background: #fef3c7;
            border: 1px solid #d97706;
            padding: 7px 10px;
            border-radius: 4px;
            margin: 8px 10px;
            font-size: 11px;
          }
          .decl-box {
            border: 1px solid #94a3b8;
            background: #f8fafc;
            padding: 9px 12px;
            border-radius: 4px;
            font-size: 10.5px;
            text-align: justify;
            margin-bottom: 18px;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            gap: 28px;
            margin-top: 34px;
          }
          .sig-box {
            flex: 1;
            text-align: center;
          }
          .sig-line {
            border-top: 1.5px solid #0f172a;
            margin-bottom: 5px;
          }
          .sig-name {
            margin: 0;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .sig-role {
            margin: 2px 0 0;
            font-size: 10px;
            color: #334155;
          }
          .sig-masp {
            margin: 2px 0 0;
            font-size: 10px;
            font-family: monospace;
            font-weight: bold;
          }
          .footer-note {
            margin-top: 18px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
            font-size: 9px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
            padding-top: 4px;
          }
        </style>
      </head>
      <body>
        <!-- PÁGINA 1: RECIBO DA ARMA -->
        ${headerHtml(`PROTOCOLO CAUTELA ARMA: #${String(cautela.id).slice(-10).toUpperCase()} • EMISSÃO: ${returnDateFormatted}`)}

        <div class="doc-title">
          RECIBO DE DEVOLUÇÃO E GUARDA DE ARMAMENTO AO COFRE
        </div>

        <div class="section-box">
          <div class="section-title">1. Identificação do Policial Devolvente</div>
          <table class="grid-table">
            <tr>
              <td style="width: 50%;">
                <span class="lbl">Nome Completo do Policial</span>
                <span class="val">${requesterName}</span>
              </td>
              <td style="width: 25%;">
                <span class="lbl">MASP</span>
                <span class="val">${requesterMasp}</span>
              </td>
              <td style="width: 25%;">
                <span class="lbl">Carreira / Cargo</span>
                <span class="val">${requesterCareer}</span>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <span class="lbl">Unidade de Lotação / Cautela</span>
                <span class="val">${unitObj ? unitObj.name : 'Unidade Policial'}</span>
              </td>
              <td>
                <span class="lbl">Finalidade Original</span>
                <span class="val">${cautela.reason || 'Serviço Policial'}</span>
              </td>
            </tr>
          </table>
        </div>

        <div class="section-box">
          <div class="section-title">2. Dados do Armamento Recebido e Local de Guarda no Cofre</div>
          <table class="grid-table">
            <tr>
              <td style="width: 34%;">
                <span class="lbl">Espécie / Modelo</span>
                <span class="val">${cautela.weaponType ? `${cautela.weaponType} — ` : ''}${cautela.weaponModel || weapon?.model || 'Armamento'}</span>
              </td>
              <td style="width: 26%;">
                <span class="lbl">Número de Série</span>
                <span class="val" style="font-family: monospace;">${cautela.weaponSerialNumber || weapon?.serialNumber || 'N/A'}</span>
              </td>
              <td style="width: 20%;">
                <span class="lbl">Calibre</span>
                <span class="val">${cautela.weaponCaliber || weapon?.caliber || 'N/A'}</span>
              </td>
              <td style="width: 20%;">
                <span class="lbl">Carregadores Devolvidos</span>
                <span class="val">${finalReturnedMagazines} de ${cautela.magazineQuantity || finalReturnedMagazines} un.</span>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <span class="lbl">Data / Hora da Retirada</span>
                <span class="val">${checkoutDateFormatted}</span>
              </td>
              <td colspan="2">
                <span class="lbl">Data / Hora do Recebimento no Cofre</span>
                <span class="val">${returnDateFormatted}</span>
              </td>
            </tr>
          </table>
          <div class="vault-highlight">
            <strong>LOCAL NO COFRE DE RETORNO DA ARMA (DETERMINADO PELO ARMEIRO):</strong> ${weaponVaultAddress}
            • <strong>Situação da Arma após Recebimento:</strong> ${finalIsWorking ? 'NO COFRE (APTIDÃO OPERACIONAL)' : 'ENCAMINHADA PARA MANUTENÇÃO'}
          </div>
        </div>

        <div class="section-box">
          <div class="section-title">3. Conferência Técnica do Armamento no Ato do Recebimento</div>
          <table class="grid-table">
            <tr>
              <td style="width: 33%;">
                <span class="lbl">Disparos Efetuados</span>
                <span class="val">${finalHadShots ? `SIM — ${finalShotsFired} disparo(s)` : 'NÃO (Zero disparos)'}</span>
              </td>
              <td style="width: 33%;">
                <span class="lbl">Condição de Funcionamento</span>
                <span class="val">${finalIsWorking ? 'Em perfeitas condições de uso' : `COM DEFEITO: ${finalDefectDesc || 'Relatado'}`}</span>
              </td>
              <td style="width: 34%;">
                <span class="lbl">Ocorrência de Pane</span>
                <span class="val">${finalHadMalfunction ? `SIM — ${finalMalfunctionDesc || 'Relatada'}` : 'NÃO'}</span>
              </td>
            </tr>
            <tr>
              <td colspan="3">
                <span class="lbl">Observações da Conferência / Recebimento</span>
                <span class="val">${finalReturnObs ? finalReturnObs : 'Armamento e carregadores conferidos fisicamente pelo armeiro sem ressalvas adicionais.'}</span>
              </td>
            </tr>
          </table>
        </div>

        <div class="section-box">
          <div class="section-title">4. Situação de Munições Vinculadas</div>
          <table class="grid-table">
            <tr>
              <td>
                <span class="val">
                  ${
                    hasAmmo
                      ? isAmmoReturnedToVault
                        ? `Constam ${ammoDetails.quantity} munição(ões) vinculada(s) (${ammoDetails.caliberName} • ${ammoDetails.tipoMunicao} • Lote ${ammoDetails.loteMunicao}): ${finalReturnedAmmoQty} un. devolvida(s) ao cofre (${ammoVaultAddress}) e ${finalConsumedAmmoQty} un. utilizada(s)/consumida(s). Ver recibo específico de munições na página seguinte.`
                        : `Constam ${ammoDetails.quantity} munição(ões) vinculada(s) (${ammoDetails.caliberName} • ${ammoDetails.tipoMunicao} • Lote ${ammoDetails.loteMunicao}) em regime de Retirada Permanente (cautela encerrada; ver recibo específico na página seguinte).`
                      : 'Nenhuma cautela de munições vinculada a este armamento.'
                  }
                </span>
              </td>
            </tr>
          </table>
        </div>

        <div class="decl-box">
          Certifico que recebi e conferi fisicamente o armamento e os carregadores descritos neste documento, dando plena quitação da cautela de armamento acima identificada e promovendo sua guarda imediata em <strong>${weaponVaultAddress}</strong>.
        </div>

        ${signaturesHtml}

        <div class="footer-note">
          <span>Recibo Oficial de Devolução de Armamento — Via da Armaria / Policial</span>
          <span>Recebido por: ${receivingArmorerName} (MASP: ${receivingArmorerMasp})</span>
        </div>

        ${
          hasAmmo
            ? `
        <!-- PÁGINA 2: RECIBO DA MUNIÇÃO VINCULADA -->
        <div class="page-break">
          ${headerHtml(`PROTOCOLO CAUTELA MUNIÇÃO: #${String(ammoDetails.linkedCautelaId || cautela.id).slice(-10).toUpperCase()} • EMISSÃO: ${returnDateFormatted}`)}

          <div class="doc-title">
            RECIBO DE DEVOLUÇÃO E GUARDA DE MUNIÇÕES AO COFRE
          </div>

          <div class="section-box">
            <div class="section-title">1. Identificação do Policial Devolvente e Armamento Vinculado</div>
            <table class="grid-table">
              <tr>
                <td style="width: 50%;">
                  <span class="lbl">Policial Devolvente</span>
                  <span class="val">${requesterName} (MASP: ${requesterMasp})</span>
                </td>
                <td style="width: 50%;">
                  <span class="lbl">Armamento Vinculado à Cautela</span>
                  <span class="val">${cautela.weaponModel || 'Armamento'} — Série Nº ${cautela.weaponSerialNumber || 'N/A'} (${cautela.weaponCaliber || ammoDetails.caliberName})</span>
                </td>
              </tr>
            </table>
          </div>

          <div class="section-box">
            <div class="section-title">2. Especificação das Munições Vinculadas</div>
            <table class="grid-table">
              <tr>
                <td style="width: 25%;">
                  <span class="lbl">Calibre</span>
                  <span class="val">${ammoDetails.caliberName}</span>
                </td>
                <td style="width: 25%;">
                  <span class="lbl">Fabricante</span>
                  <span class="val">${ammoDetails.fabricante}</span>
                </td>
                <td style="width: 25%;">
                  <span class="lbl">Tipo / Peso do Projétil</span>
                  <span class="val">${ammoDetails.tipoMunicao} • ${ammoDetails.pesoMunicao}</span>
                </td>
                <td style="width: 25%;">
                  <span class="lbl">Lote / Destinação</span>
                  <span class="val">${ammoDetails.loteMunicao}${ammoDetails.anoFabricacao ? ` (${ammoDetails.anoFabricacao})` : ''} — ${ammoDetails.destinacao}</span>
                </td>
              </tr>
            </table>
          </div>

          <div class="section-box">
            <div class="section-title">3. Contabilização de Devolução e Cofre de Destino das Munições</div>
            <table class="grid-table">
              <tr>
                <td style="width: 33%;">
                  <span class="lbl">Quantidade Acautelada</span>
                  <span class="val">${ammoDetails.quantity} unidade(s)</span>
                </td>
                <td style="width: 33%;">
                  <span class="lbl">Quantidade Utilizada / Deflagrada</span>
                  <span class="val">${isAmmoReturnedToVault ? `${finalConsumedAmmoQty} unidade(s)` : `${ammoDetails.quantity} un. (Retirada Permanente)`}</span>
                </td>
                <td style="width: 34%;">
                  <span class="lbl">Quantidade Devolvida ao Cofre</span>
                  <span class="val">${isAmmoReturnedToVault ? `${finalReturnedAmmoQty} unidade(s)` : '0 unidade(s) (Não passiva de devolução)'}</span>
                </td>
              </tr>
              <tr>
                <td colspan="2">
                  <span class="lbl">Data / Hora do Recebimento e Baixa</span>
                  <span class="val">${returnDateFormatted}</span>
                </td>
                <td>
                  <span class="lbl">Status da Cautela de Munição</span>
                  <span class="val">DEVOLVIDA / BAIXADA NO SISTEMA</span>
                </td>
              </tr>
            </table>
            <div class="vault-highlight">
              <strong>LOCAL NO COFRE DE DESTINO DAS MUNIÇÕES (DETERMINADO PELO ARMEIRO):</strong>
              ${isAmmoReturnedToVault ? `${ammoVaultAddress} — Saldo acrescido em +${finalReturnedAmmoQty} unidade(s)` : 'Sem reingresso físico no estoque (Retirada Permanente encerrada)'}
            </div>
          </div>

          <div class="decl-box">
            Certifico que conferi os dados e quantidades referentes às munições vinculadas à cautela acima descrita, procedendo à baixa da cautela de munições no sistema${
              isAmmoReturnedToVault
                ? ` e ao depósito de <strong>${finalReturnedAmmoQty} unidade(s)</strong> no local <strong>${ammoVaultAddress}</strong> determinado pelo armeiro`
                : ''
            }.
          </div>

          ${signaturesHtml}

          <div class="footer-note">
            <span>Recibo Oficial de Devolução de Munições — Via da Armaria / Policial</span>
            <span>Recebido por: ${receivingArmorerName} (MASP: ${receivingArmorerMasp})</span>
          </div>
        </div>
        `
            : ''
        }
      </body>
      </html>
    `;

    printDocumentInPage(htmlContent);
  };

  // Abrir Modal de Devolução (ou Conferência de Recibo pelo Armeiro)
  const handleOpenReturnModal = (cautela: CautelaArma) => {
    setErrorMsg('');
    setForceReturnAmmoToVault(false);
    setReturningCautela(cautela);

    const ammoDetails = getRescuedAmmoDetails(cautela);

    if (cautela.status === 'DEVOLUCAO_PENDENTE') {
      // Pré-carrega os dados já informados pelo policial para conferência e recibo do armeiro
      const reportedShots = Number(cautela.shotsFired || 0);
      const defaultRetAmmo =
        cautela.returnedAmmoQuantity !== undefined && cautela.returnedAmmoQuantity !== null
          ? Number(cautela.returnedAmmoQuantity)
          : Math.max(0, ammoDetails.quantity - reportedShots);

      setHadShots(Boolean(cautela.hadShots));
      setShotsFired(reportedShots);
      setReturnedAmmoQuantity(ammoDetails.hasAmmo && ammoDetails.seraDevolvida ? defaultRetAmmo : 0);
      setReturnAmmoUsedCount(
        ammoDetails.hasAmmo && ammoDetails.seraDevolvida
          ? Math.max(0, ammoDetails.quantity - defaultRetAmmo)
          : reportedShots
      );
      setIsWorking(cautela.isWorking !== false);
      setDefectDescription(cautela.defectDescription || '');
      setHadMalfunction(Boolean(cautela.hadMalfunction));
      setMalfunctionDescription(cautela.malfunctionDescription || '');
      setReturnedMagazinesCount(cautela.returnedMagazinesCount ?? cautela.magazineQuantity ?? 1);
      setReturnObservations(cautela.returnObservations || '');
    } else {
      setHadShots(false);
      setShotsFired(0);
      setReturnAmmoUsedCount(0);
      setReturnedAmmoQuantity(ammoDetails.hasAmmo && ammoDetails.seraDevolvida ? ammoDetails.quantity : 0);
      setIsWorking(true);
      setDefectDescription('');
      setHadMalfunction(false);
      setMalfunctionDescription('');
      setReturnedMagazinesCount(cautela.magazineQuantity || 1);
      setReturnObservations('');
    }

    const targetUnit = cautela.unitId || currentUser.unitId;
    const unitVaults = vaultSpaces.filter(v =>
      isGeral ? (!targetUnit || !v.unitId || v.unitId === targetUnit) : (!v.unitId || v.unitId === targetUnit)
    );
    const defaultWeaponVaultId = cautela.vaultSpaceId || unitVaults.find(v => !v.type || v.type === 'ARMAS')?.id || unitVaults[0]?.id || '';
    setReturnVaultSpaceId(defaultWeaponVaultId);

    if (ammoDetails.vaultSpaceId) {
      setReturnAmmoVaultSpaceId(ammoDetails.vaultSpaceId);
    } else {
      const firstAmmoVault = unitVaults.find(v => {
        const t = String(v.type || '').toUpperCase();
        return t.includes('MUNI');
      });
      setReturnAmmoVaultSpaceId(firstAmmoVault?.id || defaultWeaponVaultId || unitVaults[0]?.id || '');
    }
  };

  // Concluir Devolução (Policial envia como Pendente de Recibo; Armeiro recebe, guarda no cofre e gera recibo)
  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningCautela) return;

    if (!isWorking && !defectDescription.trim()) {
      setErrorMsg('Informe a descrição do defeito apresentado pela arma.');
      return;
    }
    if (hadMalfunction && !malfunctionDescription.trim()) {
      setErrorMsg('Informe a descrição da pane apresentada pela arma.');
      return;
    }

    const ammoDetails = getRescuedAmmoDetails(returningCautela);
    const shouldReturnAmmoToVault = Boolean(
      ammoDetails.hasAmmo && (ammoDetails.seraDevolvida || (canAuthorize && forceReturnAmmoToVault))
    );

    if (canAuthorize && availableArmasVaults.length > 0 && !returnVaultSpaceId) {
      setErrorMsg('Selecione para qual local no cofre vai voltar a arma.');
      return;
    }

    if (shouldReturnAmmoToVault) {
      const retQty = Number(returnedAmmoQuantity);
      if (isNaN(retQty) || retQty < 0 || retQty > ammoDetails.quantity) {
        setErrorMsg(`Informe uma quantidade válida de munições devolvidas (entre 0 e ${ammoDetails.quantity}).`);
        return;
      }
      if (canAuthorize && availableAmmoVaults.length > 0 && !returnAmmoVaultSpaceId) {
        setErrorMsg('Selecione para qual local no cofre vão voltar as munições.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const chosenWeaponVaultId = canAuthorize
        ? (returnVaultSpaceId || returningCautela.vaultSpaceId)
        : undefined;
      const selectedVault = chosenWeaponVaultId ? vaultSpaces.find(v => v.id === chosenWeaponVaultId) : undefined;
      const resolvedAmmoDestVaultId = canAuthorize
        ? (returnAmmoVaultSpaceId || ammoDetails.vaultSpaceId || returnVaultSpaceId || returningCautela.vaultSpaceId)
        : undefined;
      const selectedAmmoVault = resolvedAmmoDestVaultId
        ? vaultSpaces.find(v => v.id === resolvedAmmoDestVaultId)
        : undefined;
      const sanitizedReturnedAmmo = shouldReturnAmmoToVault
        ? Math.min(ammoDetails.quantity, Math.max(0, Number(returnedAmmoQuantity) || 0))
        : undefined;
      const usedAmmoCount = shouldReturnAmmoToVault
        ? Math.max(0, ammoDetails.quantity - (sanitizedReturnedAmmo ?? 0))
        : (hadShots ? (Number(shotsFired) || 0) : 0);

      const cautelaSnapshot = { ...returningCautela };
      const nowIso = new Date().toISOString();

      const res = await storage.returnCautelaArma(returningCautela.id, {
        weaponId: returningCautela.weaponId,
        weaponSerialNumber: returningCautela.weaponSerialNumber,
        cautelaId: returningCautela.id,
        linkedAmmoCautelaId: ammoDetails.linkedCautelaId || undefined,
        ammoCaliberId: ammoDetails.caliberId || undefined,
        ammoSeraDevolvida: shouldReturnAmmoToVault,
        forceReturnAmmoToVault: Boolean(canAuthorize && forceReturnAmmoToVault && (sanitizedReturnedAmmo ?? 0) > 0),
        requesterName: returningCautela.requesterName,
        requesterMasp: returningCautela.requesterMasp,
        requesterCargo: returningCautela.requesterCargo,
        hadShots,
        shotsFired: hadShots ? Number(shotsFired) || 0 : 0,
        ammoUsedCount: usedAmmoCount,
        returnedAmmoQuantity: sanitizedReturnedAmmo,
        pendingReceipt: isPolicial,
        ammoDestinationVaultSpaceId: resolvedAmmoDestVaultId,
        isWorking,
        defectDescription: !isWorking ? defectDescription.trim() : null,
        hadMalfunction,
        malfunctionDescription: hadMalfunction ? malfunctionDescription.trim() : null,
        returnedMagazinesCount,
        destinationVaultSpaceId: chosenWeaponVaultId,
        returnObservations: returnObservations.trim()
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar devolução.');
      } else {
        if (isPolicial || res.pendingReceipt) {
          setLastReceivedReturnInfo(null);
          setSuccessMsg(
            `Devolução da arma ${returningCautela.weaponModel} (Série: ${returningCautela.weaponSerialNumber}) registrada e encaminhada! O registro encontra-se pendente de recebimento pelo armeiro da unidade.`
          );
          setActiveTab('MINHAS');
        } else {
          const destText = selectedVault ? `no cofre ${selectedVault.code}` : 'ao cofre da unidade';
          const ammoDestText = selectedAmmoVault ? `no cofre ${selectedAmmoVault.code}` : 'no cofre determinado';
          const receiptOverrides = {
            weaponVaultId: chosenWeaponVaultId,
            ammoVaultId: resolvedAmmoDestVaultId,
            returnedAmmoQty: sanitizedReturnedAmmo ?? 0,
            returnArmorerName: currentUser.name,
            returnArmorerMasp: currentUser.masp,
            returnArmorerCargo: currentUser.cargo || currentUser.role,
            returnDateIso: nowIso,
            hadShots,
            shotsFired: hadShots ? Number(shotsFired) || 0 : 0,
            isWorking,
            defectDescription: !isWorking ? defectDescription.trim() : null,
            hadMalfunction,
            malfunctionDescription: hadMalfunction ? malfunctionDescription.trim() : null,
            returnedMagazinesCount,
            returnObservations: returnObservations.trim(),
            forceReturnAmmo: Boolean(forceReturnAmmoToVault && (sanitizedReturnedAmmo ?? 0) > 0)
          };

          setLastDirectCautelaArma(null);
          setLastReceivedReturnInfo({
            cautela: cautelaSnapshot,
            overrides: receiptOverrides
          });

          setSuccessMsg(
            `Cautela recebida com sucesso! Arma ${returningCautela.weaponModel} (Série: ${returningCautela.weaponSerialNumber}) guardada ${destText}.${
              ammoDetails.hasAmmo
                ? shouldReturnAmmoToVault
                  ? ` Munições (${sanitizedReturnedAmmo} un.) colocadas ${ammoDestText} e cautela de munições baixada como Devolvida. Recibo da arma e da munição gerado!`
                  : ' Cautela de munições vinculada baixada e recibo da arma e da munição gerado!'
                : ' Recibo de devolução da arma gerado!'
            }`
          );

          // Gera imediatamente o recibo da arma (e da munição, caso vinculada)
          handlePrintReciboDevolucao(cautelaSnapshot, receiptOverrides);
        }
        setReturningCautela(null);
        setLocalSyncTick(t => t + 1);
        await onRefresh();
        setLocalSyncTick(t => t + 1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar devolução.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Impressão do Termo Formal de Cautela de Armamento
  // Impressão do Termo Formal de Cautela de Armamento e Munições
  const handlePrintTermo = (cautela: CautelaArma) => {
    const unitObj = units.find(u => u.id === cautela.unitId) || userUnit;
    const deptObj = departments.find(d => d.id === (cautela.departmentId || unitObj?.departmentId));
    const termoLogo = getSystemLogo(unitObj, deptObj);
    const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);
    const returnVaultId = cautela.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
    const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
    const returnUnit = units.find(u => u.id === returnVault?.unitId);
    const returnVaultAddress = isPolicial
      ? (unitObj ? unitObj.name : 'Unidade Policial')
      : returnVault
        ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}`
        : 'Cofre de Origem da Unidade';

    const storedReqUser = storage.getUsers().find(u => u.id === cautela.requesterId);
    const storedLoggedUser = storage.getUsers().find(u => u.id === currentUser.id);
    const requesterCareer = (cautela.requesterCargo || (isPolicial ? currentUser.cargo : undefined) || storedReqUser?.cargo || 'Policial Civil').trim();
    const signerName = isPolicial ? currentUser.name : cautela.requesterName;
    const signerCareer = isPolicial ? (currentUser.cargo || storedLoggedUser?.cargo || requesterCareer || 'Policial Civil').trim() : requesterCareer;
    const signerMasp = isPolicial ? (currentUser.masp || cautela.requesterMasp) : cautela.requesterMasp;

    const armorerInfo = getResolvedArmorer(cautela);

    const linkedAmmo = getLinkedAmmoForCautela(cautela);
    const calObj = (linkedAmmo || cautela.weaponCaliber) 
      ? calibers.find(c => c.id === linkedAmmo?.caliberId || c.name === linkedAmmo?.caliberName || c.name === cautela.weaponCaliber) 
      : null;
    const ammoStock = linkedAmmo ? ammoStocks.find(s => s.id === (linkedAmmo as any).stockId) : null;
    const ammoVault = linkedAmmo?.vaultSpaceId ? vaultSpaces.find(v => v.id === linkedAmmo.vaultSpaceId) : null;
    const ammoVaultUnit = ammoVault ? units.find(u => u.id === ammoVault.unitId) : null;

    const hasAmmo = Boolean(
      (linkedAmmo && linkedAmmo.quantity > 0) || 
      (cautela.ammoQuantity && cautela.ammoQuantity > 0) ||
      cautela.ammoFabricante ||
      cautela.linkedAmmoCautelaId
    );

    const ammoQtd = linkedAmmo?.quantity || cautela.ammoQuantity || 0;
    const ammoFabricante = linkedAmmo?.fabricante || cautela.ammoFabricante || ammoStock?.fabricante || calObj?.fabricante || 'CBC';
    const ammoCalibre = linkedAmmo?.caliberName || cautela.weaponCaliber || weapon?.caliber || 'N/A';
    const ammoTipo = linkedAmmo?.tipoMunicao || cautela.ammoTipo || ammoStock?.tipoMunicao || calObj?.tipo || (cautela.ammoDestinacao === 'Treinamento' ? 'Treinamento' : 'Operacional');
    const ammoPeso = linkedAmmo?.pesoMunicao || cautela.ammoPeso || ammoStock?.pesoMunicao || calObj?.peso || '124gr';
    const ammoLote = linkedAmmo?.loteMunicao || cautela.ammoLote || ammoStock?.loteMunicao || 'Lote Padrão';
    const ammoDest = linkedAmmo?.destinacao || cautela.ammoDestinacao || 'Defesa';
    const ammoSeraDevolvida = linkedAmmo?.seraDevolvida !== undefined ? linkedAmmo.seraDevolvida : (cautela.ammoDestinacao === 'Defesa');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Termo de Cautela - ${cautela.weaponSerialNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
            font-family: Arial, Helvetica, sans-serif !important;
            margin: 0;
            padding: 8px;
            font-size: 11px;
            line-height: 1.45;
          }
          .header-box {
            display: flex;
            align-items: center;
            gap: 14px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .header-logo {
            height: 58px;
            width: auto;
            max-width: 72px;
            object-fit: contain;
            flex-shrink: 0;
          }
          .header-center {
            flex: 1;
            text-align: center;
          }
          .header-title-org {
            margin: 0;
            font-size: 15px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #0f172a;
          }
          .header-subtitle-unit {
            margin: 3px 0 0 0;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #334155;
          }
          .header-doc-title {
            margin: 8px 0 0 0;
            font-size: 14px;
            font-weight: bold;
            text-decoration: underline;
            letter-spacing: 0.5px;
            color: #000000;
          }
          .protocol-tag {
            margin: 4px 0 0 0;
            font-size: 10px;
            font-family: monospace;
            color: #475569;
          }
          .section-banner {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            background-color: #f1f5f9;
            color: #0f172a;
            padding: 5px 8px;
            border-left: 4px solid #0f172a;
            margin: 12px 0 6px 0;
          }
          .data-table {
            width: 100%;
            font-size: 11px;
            border-collapse: collapse;
            margin-bottom: 8px;
          }
          .data-table th, .data-table td {
            border: 1px solid #cbd5e1;
            padding: 5px 7px;
            text-align: left;
            vertical-align: middle;
          }
          .data-table th {
            background-color: #f8fafc;
            font-weight: bold;
            color: #0f172a;
          }
          .info-table {
            width: 100%;
            font-size: 11px;
            border-collapse: collapse;
            margin-bottom: 6px;
          }
          .info-table td {
            padding: 3px 4px;
            vertical-align: top;
          }
          .commitment-box {
            margin-top: 18px;
            font-size: 10px;
            text-align: justify;
            color: #1e293b;
            background-color: #f8fafc;
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            border-radius: 4px;
            line-height: 1.4;
          }
          .signatures-container {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            text-align: center;
            font-size: 10px;
          }
          .signature-box {
            width: 45%;
            border-top: 1px solid #0f172a;
            padding-top: 5px;
            color: #0f172a;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px dashed #94a3b8;
          }
          .footer-note {
            margin-top: 20px;
            text-align: center;
            font-size: 9px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <!-- PÁGINA 1: TERMO DE CAUTELA DO ARMAMENTO E MUNIÇÕES -->
        <div class="header-box">
          <img src="${termoLogo}" alt="Logo da Unidade" class="header-logo" />
          <div class="header-center">
            <h2 class="header-title-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
            <h3 class="header-subtitle-unit">
              ${deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA'} • ${unitObj ? unitObj.name : 'UNIDADE POLICIAL'}
            </h3>
            <h1 class="header-doc-title">
              TERMO DE CAUTELA INDIVIDUAL DE ARMAMENTO E MUNIÇÕES
            </h1>
            <p class="protocol-tag">PROTOCOLO: ${cautela.id.toUpperCase()}</p>
          </div>
        </div>

        <div>
          <div class="section-banner">
            1. DADOS DO SERVIDOR RECEBEDOR (POLICIAL)
          </div>
          <table class="info-table">
            <tr>
              <td style="width: 60%;"><strong>Nome:</strong> ${cautela.requesterName}</td>
              <td style="width: 40%;"><strong>MASP:</strong> ${cautela.requesterMasp}</td>
            </tr>
            <tr>
              <td><strong>Cargo/Função:</strong> ${requesterCareer}</td>
              <td><strong>Telefone/Contato:</strong> ${cautela.requesterPhone || 'N/A'}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Unidade de Lotação:</strong> ${unitObj ? unitObj.name : 'N/A'}</td>
            </tr>
          </table>
        </div>

        <div>
          <div class="section-banner">
            2. ESPECIFICAÇÃO DO ARMAMENTO ACAUTELADO
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Fabricante / Marca</th>
                <th>Modelo</th>
                <th>Calibre</th>
                <th>Nº de Série</th>
                <th style="text-align: center;">Carregadores</th>
                <th>${isPolicial ? 'Unidade de Origem / Retorno' : 'Cofre de Retorno (Origem)'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${cautela.weaponType || weapon?.type || 'Arma de Fogo'}</td>
                <td>${(weapon as any)?.fabricante || (weapon as any)?.marca || (weapon as any)?.manufacturer || 'CBC / Taurus'}</td>
                <td><strong>${cautela.weaponModel}</strong></td>
                <td>${cautela.weaponCaliber || weapon?.caliber || 'N/A'}</td>
                <td style="font-family: monospace;"><strong>${cautela.weaponSerialNumber}</strong></td>
                <td style="text-align: center; font-weight: bold;">${cautela.magazineQuantity} un.</td>
                <td style="font-family: monospace; font-weight: 600;">${returnVaultAddress}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div class="section-banner">
            3. ESPECIFICAÇÃO DAS MUNIÇÕES FORNECIDAS EM CONJUNTO
          </div>
          ${hasAmmo ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>Calibre</th>
                <th style="text-align: center;">Quantidade</th>
                <th>Fabricante</th>
                <th>Tipo</th>
                <th>Peso</th>
                <th>Lote</th>
                <th>Destinação</th>
                <th>Previsão de Retorno</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${ammoCalibre}</strong></td>
                <td style="text-align: center; font-weight: bold; font-size: 12px; color: #000;">${ammoQtd} munições</td>
                <td>${ammoFabricante}</td>
                <td>${ammoTipo}</td>
                <td>${ammoPeso}</td>
                <td style="font-family: monospace;">${ammoLote}</td>
                <td><strong>${ammoDest}</strong></td>
                <td>${ammoSeraDevolvida ? 'Devolução posterior (saldo não deflagrado)' : 'Baixa definitiva para consumo'}</td>
              </tr>
            </tbody>
          </table>
          ` : `
          <div style="padding: 8px 12px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 4px; font-size: 11px; color: #475569; margin-bottom: 8px;">
            <strong>Munições Vinculadas:</strong> Nenhuma munição fornecida em conjunto para esta cautela (Apenas armamento e ${cautela.magazineQuantity} carregadores).
          </div>
          `}
        </div>

        <div>
          <div class="section-banner">
            4. FINALIDADE E AUTORIZAÇÃO
          </div>
          <table class="info-table">
            <tr>
              <td style="width: 60%;"><strong>Finalidade da Cautela:</strong> ${cautela.reason || 'Serviço Policial Operacional'}</td>
              <td style="width: 40%;"><strong>Data/Hora Solicitação:</strong> ${new Date(cautela.requestDate).toLocaleString('pt-BR')}</td>
            </tr>
            <tr>
              <td><strong>Armeiro Autorizador da Cautela:</strong> ${armorerInfo.name} ${armorerInfo.masp ? `(MASP: ${armorerInfo.masp})` : ''}</td>
              <td><strong>Data/Hora Autorização:</strong> ${cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : 'Pendente'}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>${isPolicial ? 'Unidade de Origem / Retorno:' : 'Cofre Físico de Origem/Retorno:'}</strong> ${returnVaultAddress}</td>
            </tr>
          </table>
        </div>

        ${cautela.status === 'DEVOLVIDA' ? `
          <div>
            <div class="section-banner">
              5. REGISTRO TÉCNICO DE DEVOLUÇÃO
            </div>
            <table class="info-table">
              <tr>
                <td style="width: 50%;"><strong>Data de Devolução:</strong> ${cautela.returnDate ? new Date(cautela.returnDate).toLocaleString('pt-BR') : 'N/A'}</td>
                <td style="width: 50%;"><strong>Armeiro Receptor:</strong> ${cautela.returnArmorerName || 'N/A'} (MASP: ${cautela.returnArmorerMasp || 'N/A'})</td>
              </tr>
              <tr>
                <td><strong>Houve Disparos:</strong> ${cautela.hadShots ? `SIM (${cautela.shotsFired} tiros efetuados)` : 'NÃO (Zero disparos)'}</td>
                <td><strong>Condição da Arma:</strong> ${cautela.isWorking ? 'Em Condições de Uso' : 'Apresenta Defeito'}</td>
              </tr>
              <tr>
                <td><strong>Apresentou Pane:</strong> ${cautela.hadMalfunction ? `SIM (${cautela.malfunctionDescription || 'Pane registrada'})` : 'NÃO'}</td>
                <td><strong>Carregadores Devolvidos:</strong> ${cautela.returnedMagazinesCount} un.</td>
              </tr>
              ${cautela.defectDescription ? `<tr><td colspan="2" style="color: #991b1b;"><strong>Defeito Constatado:</strong> ${cautela.defectDescription}</td></tr>` : ''}
              ${cautela.returnObservations ? `<tr><td colspan="2"><strong>Observações:</strong> ${cautela.returnObservations}</td></tr>` : ''}
            </table>
          </div>
        ` : ''}

        <div class="commitment-box">
          <strong>TERMO DE COMPROMISSO E FIEL DEPOSITÁRIO:</strong> O servidor qualificado acima declara ter recebido o armamento, munições e acessórios discriminados em perfeitas condições de conservação e funcionamento, comprometendo-se a zelar por sua guarda, segurança e emprego estritamente legal nos termos do regulamento da Polícia Civil de Minas Gerais. Obriga-se a devolver o armamento ${isPolicial ? `na unidade indicada (<strong>${returnVaultAddress}</strong>)` : `no cofre de retorno indicado (<strong>${returnVaultAddress}</strong>)`} findo o período de cautela, prestando as informações técnicas de disparos efetuados, eventuais anomalias e restituição dos cartuchos não deflagrados.
        </div>

        <div class="signatures-container" ${isPolicial ? 'style="justify-content: center;"' : ''}>
          <div class="signature-box">
            <strong>${signerName}</strong><br/>
            ${signerCareer}<br/>
            MASP: ${signerMasp}
          </div>
          ${!isPolicial ? `
            <div class="signature-box">
              <strong>${armorerInfo.name}</strong><br/>
              ${armorerInfo.masp ? `MASP: ${armorerInfo.masp}<br/>` : ''}
              <span>Armeiro Autorizador da Cautela</span>
            </div>
          ` : ''}
        </div>

        <div class="footer-note">
          Documento emitido eletronicamente pelo Sistema de Gestão de Armas e Munições - PCMG em ${new Date().toLocaleString('pt-BR')} ${(hasAmmo && ammoQtd > 0) ? '• (Página 1 de 2)' : ''}
        </div>

        ${(hasAmmo && ammoQtd > 0) ? `
          <!-- PÁGINA 2: RECIBO DE FORNECIMENTO DE MUNIÇÕES VINCULADAS -->
          <div class="page-break">
            <div class="header-box">
              <img src="${termoLogo}" alt="Logo da Unidade" class="header-logo" />
              <div class="header-center">
                <h2 class="header-title-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
                <h3 class="header-subtitle-unit">
                  ${deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA'} • ${unitObj ? unitObj.name : 'UNIDADE POLICIAL'}
                </h3>
                <h1 class="header-doc-title">
                  RECIBO DE CAUTELA E FORNECIMENTO DE MUNIÇÕES
                </h1>
                <p class="protocol-tag">VINCULADO AO ARMAMENTO Nº ${cautela.weaponSerialNumber} (${cautela.weaponModel}) • PROTOCOLO: ${(linkedAmmo?.id || cautela.id).toUpperCase()}</p>
              </div>
            </div>

            <div>
              <div class="section-banner">
                1. DADOS DO SERVIDOR REQUISITANTE / RECEBEDOR
              </div>
              <table class="info-table">
                <tr>
                  <td style="width: 60%;"><strong>Nome:</strong> ${cautela.requesterName}</td>
                  <td style="width: 40%;"><strong>MASP:</strong> ${cautela.requesterMasp}</td>
                </tr>
                <tr>
                  <td><strong>Cargo/Função:</strong> ${requesterCareer}</td>
                  <td><strong>Armamento Vinculado:</strong> Nº ${cautela.weaponSerialNumber} (${cautela.weaponModel} • ${cautela.weaponCaliber || 'N/A'})</td>
                </tr>
              </table>
            </div>

            <div>
              <div class="section-banner">
                2. ESPECIFICAÇÃO DAS MUNIÇÕES FORNECIDAS
              </div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Calibre</th>
                    <th>Quantidade</th>
                    <th>Fabricante</th>
                    <th>Tipo</th>
                    <th>Peso</th>
                    <th>Lote</th>
                    <th>Destinação</th>
                    ${!isPolicial ? '<th>Cofre</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>${ammoCalibre}</strong></td>
                    <td style="font-weight: bold; font-size: 12px; color: #000;">${ammoQtd} cartuchos</td>
                    <td>${ammoFabricante}</td>
                    <td>${ammoTipo}</td>
                    <td>${ammoPeso}</td>
                    <td style="font-family: monospace;">${ammoLote}</td>
                    <td><strong>${ammoDest}</strong></td>
                    ${!isPolicial ? `<td>${ammoVault ? `${ammoVault.code}${ammoVaultUnit ? ` (${ammoVaultUnit.name})` : ''}` : returnVaultAddress}</td>` : ''}
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <div class="section-banner">
                3. FINALIDADE E AUTORIZAÇÃO
              </div>
              <table class="info-table">
                <tr>
                  <td style="width: 60%;"><strong>Motivo / Emprego:</strong> Fornecimento conjunto para emprego com a arma nº ${cautela.weaponSerialNumber}</td>
                  <td style="width: 40%;"><strong>Previsão de Devolução:</strong> ${ammoSeraDevolvida ? 'Sim (munições não deflagradas retornam ao cofre)' : 'Não (consumo operacional/treinamento)'}</td>
                </tr>
                <tr>
                  <td><strong>Armeiro Autorizador da Cautela:</strong> ${armorerInfo.name} ${armorerInfo.masp ? `(MASP: ${armorerInfo.masp})` : ''}</td>
                  <td><strong>Data da Liberação:</strong> ${cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}</td>
                </tr>
              </table>
            </div>

            <div class="commitment-box">
              <strong>TERMO DE RESPONSABILIDADE DE MUNIÇÃO:</strong> O servidor declara o recebimento dos cartuchos acima discriminados, comprometendo-se ao uso estritamente legal em serviço e à prestação de contas dos cartuchos deflagrados e devolução dos cartuchos íntegros remanescentes junto à Armaria da Unidade.
            </div>

            <div class="signatures-container" ${isPolicial ? 'style="justify-content: center;"' : ''}>
              <div class="signature-box">
                <strong>${signerName}</strong><br/>
                ${signerCareer}<br/>
                MASP: ${signerMasp}
              </div>
              ${!isPolicial ? `
                <div class="signature-box">
                  <strong>${armorerInfo.name}</strong><br/>
                  ${armorerInfo.masp ? `MASP: ${armorerInfo.masp}<br/>` : ''}
                  <span>Armeiro Autorizador da Cautela</span>
                </div>
              ` : ''}
            </div>

            <div class="footer-note">
              Documento emitido eletronicamente pelo Sistema de Gestão de Armas e Munições - PCMG em ${new Date().toLocaleString('pt-BR')} • (Página 2 de 2)
            </div>
          </div>
        ` : ''}
      </body>
      </html>
    `;

    printDocumentInPage(htmlContent);
  };

  // Auxiliar para converter ISO em YYYY-MM-DD local
  const toLocalDateYMD = useCallback((iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Lista calculada para o Relatório de Impressão do Histórico do Policial
  const buildPolicialPrintList = useCallback((overrideComplete?: boolean) => {
    const isComplete = overrideComplete === true || (overrideComplete !== false && printMode === 'COMPLETO');
    let list = [...scopedCautelas];

    if (!isComplete) {
      if (printStatusFilter === 'ATIVAS') {
        list = list.filter(c => c.status === 'AUTORIZADA');
      } else if (printStatusFilter === 'DEVOLVIDAS') {
        list = list.filter(c => c.status === 'DEVOLVIDA' || c.status === 'DEVOLUCAO_PENDENTE');
      } else if (printStatusFilter === 'INDEFERIDAS') {
        list = list.filter(c => c.status === 'RECUSADA');
      } else if (printStatusFilter === 'DEFERIDAS') {
        list = list.filter(c =>
          c.status === 'AUTORIZADA' ||
          c.status === 'DEVOLUCAO_PENDENTE' ||
          c.status === 'DEVOLVIDA'
        );
      }

      if (printWeaponFilter !== 'TODAS') {
        list = list.filter(c => {
          const key = c.weaponSerialNumber || c.weaponId || c.weaponModel || '';
          return key === printWeaponFilter;
        });
      }

      if (printStartDate || printEndDate) {
        list = list.filter(c => {
          const candidateDates = [
            toLocalDateYMD(c.requestDate),
            toLocalDateYMD(c.authorizedAt),
            toLocalDateYMD(c.returnDate),
            toLocalDateYMD(c.createdAt)
          ].filter(Boolean);

          if (candidateDates.length === 0) return false;

          return candidateDates.some(ymd => {
            const afterStart = !printStartDate || ymd >= printStartDate;
            const beforeEnd = !printEndDate || ymd <= printEndDate;
            return afterStart && beforeEnd;
          });
        });
      }
    }

    // Ordena fixando cautelas ATIVAS no topo e depois por data decrescente
    list.sort((a, b) => {
      const aIsAtiva = a.status === 'AUTORIZADA' ? 1 : 0;
      const bIsAtiva = b.status === 'AUTORIZADA' ? 1 : 0;
      if (aIsAtiva !== bIsAtiva) return bIsAtiva - aIsAtiva;

      const getTs = (item: CautelaArma) => {
        const raw = item.returnDate || item.authorizedAt || item.requestDate || item.createdAt || '';
        const t = raw ? new Date(raw).getTime() : 0;
        return isNaN(t) ? 0 : t;
      };
      return getTs(b) - getTs(a);
    });

    return list;
  }, [
    scopedCautelas,
    printMode,
    printStatusFilter,
    printWeaponFilter,
    printStartDate,
    printEndDate,
    toLocalDateYMD
  ]);

  const printPreviewList = useMemo(() => buildPolicialPrintList(), [buildPolicialPrintList]);

  const handleOpenPrintHistoryModal = () => {
    setErrorMsg('');
    const hasScreenFilters =
      activeTab === 'INDEFERIDAS' &&
      (historyWeaponFilter !== 'TODAS' || Boolean(historyDateFilter) || historyDecisionFilter !== 'TODAS');

    if (hasScreenFilters) {
      setPrintMode('FILTRADO');
      setPrintWeaponFilter(historyWeaponFilter);
      setPrintStartDate(historyDateFilter || '');
      setPrintEndDate(historyDateFilter || '');
      if (historyDecisionFilter === 'ATIVAS') {
        setPrintStatusFilter('ATIVAS');
      } else if (historyDecisionFilter === 'DEFERIDA') {
        setPrintStatusFilter('DEFERIDAS');
      } else if (historyDecisionFilter === 'INDEFERIDAS') {
        setPrintStatusFilter('INDEFERIDAS');
      } else {
        setPrintStatusFilter('TODAS');
      }
    } else {
      setPrintMode('COMPLETO');
      setPrintWeaponFilter('TODAS');
      setPrintStartDate('');
      setPrintEndDate('');
      setPrintStatusFilter('TODAS');
    }
    setIsPrintHistoryModalOpen(true);
  };

  // Impressão do Relatório de Cautela / Histórico do Policial
  // (1 registro de cautela por página, logo da unidade à esquerda no cabeçalho e assinatura de 3 linhas em todas as páginas)
  const handlePrintPolicialHistory = (forceComplete?: boolean) => {
    const isComplete = forceComplete === true || (forceComplete !== false && printMode === 'COMPLETO');
    const reportList = buildPolicialPrintList(isComplete);

    const escapeHtml = (val?: string | number | null) =>
      String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatDateBr = (ymd: string) => {
      if (!ymd) return '';
      const [y, m, d] = ymd.split('-');
      return y && m && d ? `${d}/${m}/${y}` : ymd;
    };

    const deptObj = userUnit ? departments.find(d => d.id === userUnit.departmentId) : undefined;
    const defaultUnitLogo = getSystemLogo(userUnit, deptObj);
    const storedCurrentUser = storage.getUsers().find(u => u.id === currentUser.id);
    const userCareer = (currentUser.cargo || storedCurrentUser?.cargo || 'Policial Civil').trim();
    const emittedAtStr = new Date().toLocaleString('pt-BR');

    const totalCount = reportList.length;
    const ativasCount = reportList.filter(c => c.status === 'AUTORIZADA').length;
    const devolvidasCount = reportList.filter(c => c.status === 'DEVOLVIDA' || c.status === 'DEVOLUCAO_PENDENTE').length;
    const indeferidasReportCount = reportList.filter(c => c.status === 'RECUSADA').length;

    const statusLabelMap: Record<typeof printStatusFilter, string> = {
      TODAS: 'Todas (Ativas, Devolvidas e Indeferidas)',
      ATIVAS: 'Somente Ativas (Em Posse)',
      DEVOLVIDAS: 'Somente Devolvidas',
      INDEFERIDAS: 'Somente Indeferidas',
      DEFERIDAS: 'Deferidas (Ativas e Devolvidas)'
    };

    const selectedWeaponObj = userHistoryWeapons.find(w => w.key === printWeaponFilter);
    const periodLabel = isComplete
      ? 'Todo o Período (Ativas, Devolvidas e Indeferidas)'
      : (printStartDate || printEndDate)
        ? `${printStartDate ? `De ${formatDateBr(printStartDate)}` : 'Desde o início'}${printEndDate ? ` até ${formatDateBr(printEndDate)}` : ' até a presente data'}`
        : 'Todo o Período';

    const filterSummaryText = isComplete
      ? 'Relatório Completo — Todo o Período (Ativas, Devolvidas e Indeferidas)'
      : `Situação: ${statusLabelMap[printStatusFilter]} • Arma: ${selectedWeaponObj ? selectedWeaponObj.label : 'Todas as Armas'} • Período: ${periodLabel}`;

    const renderPageSignatureAndFooter = (pageNum: number, totalPages: number) => `
      <div class="signature-section">
        <div class="signature-line"></div>
        <div class="signature-name">${escapeHtml(currentUser.name)}</div>
        <div class="signature-career">${escapeHtml(userCareer)}</div>
        <div class="signature-masp">MASP: ${escapeHtml(currentUser.masp || '—')}</div>
      </div>

      <div class="footer-note">
        Página ${pageNum} de ${totalPages} • Relatório de Cautela de Armas emitido em ${escapeHtml(emittedAtStr)} • Sistema de Gestão de Armas e Munições - PCMG
      </div>
    `;

    const pagesHtml = reportList.length === 0
      ? `
        <div class="cautela-report-page">
          <div class="page-header">
            <div class="header-left">
              <img src="${escapeHtml(defaultUnitLogo)}" alt="Logo da Unidade" class="unit-logo" />
              <div class="header-titles">
                <h2 class="header-title-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
                <h3 class="header-subtitle-dept">${escapeHtml(deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA CIVIL')}</h3>
                <div class="header-subtitle-unit">${escapeHtml(userUnit ? userUnit.name : 'UNIDADE POLICIAL')}</div>
              </div>
            </div>
            <div class="header-badge">
              RELATÓRIO DE CAUTELA<br/>
              <span>PÁGINA 1 DE 1</span>
            </div>
          </div>

          <div class="doc-title-bar">
            <h1 class="header-doc-title">RELATÓRIO DE CAUTELA DE ARMAS DA UNIDADE</h1>
            <div class="filter-banner">${escapeHtml(filterSummaryText)}</div>
          </div>

          <div style="margin-bottom: 12px;">
            <div class="section-banner">1. IDENTIFICAÇÃO DO SERVIDOR POLICIAL</div>
            <table class="info-table">
              <tr>
                <td style="width: 45%;"><strong>Servidor:</strong> ${escapeHtml(currentUser.name)}</td>
                <td style="width: 30%;"><strong>Carreira:</strong> ${escapeHtml(userCareer)}</td>
                <td style="width: 25%;"><strong>MASP:</strong> ${escapeHtml(currentUser.masp)}</td>
              </tr>
              <tr>
                <td><strong>Unidade de Lotação:</strong> ${escapeHtml(userUnit ? userUnit.name : 'Unidade Vinculada')}</td>
                <td colspan="2"><strong>Data/Hora da Emissão:</strong> ${escapeHtml(emittedAtStr)}</td>
              </tr>
            </table>
          </div>

          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 24px; text-align: center; color: #475569; margin: 18px 0;">
            Nenhum registro de cautela encontrado para os parâmetros selecionados.
          </div>

          ${renderPageSignatureAndFooter(1, 1)}
        </div>
      `
      : reportList.map((cautela, index) => {
          const isAtiva = cautela.status === 'AUTORIZADA';
          const isDevolvida = cautela.status === 'DEVOLVIDA';
          const isDevPendente = cautela.status === 'DEVOLUCAO_PENDENTE';
          const isRecusada = cautela.status === 'RECUSADA';
          const isPend = isPendingStatus(cautela.status);

          const statusText = isAtiva
            ? 'ATIVA (EM POSSE)'
            : isDevolvida
              ? 'DEVOLVIDA'
              : isDevPendente
                ? 'DEVOLVIDA (AGUARDANDO RECIBO)'
                : isRecusada
                  ? 'INDEFERIDA'
                  : isPend
                    ? 'EM ANÁLISE'
                    : cautela.status;

          const statusStyle = isAtiva
            ? 'background: #dcfce7; color: #14532d; border: 1px solid #16a34a;'
            : isDevolvida
              ? 'background: #f1f5f9; color: #0f172a; border: 1px solid #64748b;'
              : isDevPendente
                ? 'background: #fef3c7; color: #92400e; border: 1px solid #d97706;'
                : isRecusada
                  ? 'background: #fee2e2; color: #991b1b; border: 1px solid #dc2626;'
                  : 'background: #fef9c3; color: #854d0e; border: 1px solid #ca8a04;';

          const cardBorderStyle = isAtiva
            ? 'border: 2px solid #16a34a; background: #f8fafc;'
            : isRecusada
              ? 'border: 1px solid #fca5a5; background: #ffffff;'
              : 'border: 1px solid #94a3b8; background: #ffffff;';

          const cautelaUnit = units.find(u => u.id === cautela.unitId) || userUnit;
          const cautelaDept = departments.find(d => d.id === (cautelaUnit?.departmentId || cautela.departmentId)) || deptObj;
          const pageUnitLogo = getSystemLogo(cautelaUnit, cautelaDept);

          const armorerInfo = getResolvedArmorer(cautela);
          const ammoDetails = getRescuedAmmoDetails(cautela);
          const hasLinkedAmmo = ammoDetails.hasAmmo && ammoDetails.quantity > 0;

          const returnedAmmoVal =
            cautela.returnedAmmoQuantity !== undefined && cautela.returnedAmmoQuantity !== null
              ? Number(cautela.returnedAmmoQuantity)
              : (ammoDetails.linkedAmmo as any)?.returnedQuantity !== undefined
                ? Number((ammoDetails.linkedAmmo as any).returnedQuantity)
                : null;

          const isLastPage = index === reportList.length - 1;

          return `
            <div class="cautela-report-page ${!isLastPage ? 'page-break' : ''}">
              <div class="page-header">
                <div class="header-left">
                  <img src="${escapeHtml(pageUnitLogo)}" alt="Logo da Unidade" class="unit-logo" />
                  <div class="header-titles">
                    <h2 class="header-title-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
                    <h3 class="header-subtitle-dept">${escapeHtml(cautelaDept ? cautelaDept.name : 'DEPARTAMENTO DE POLÍCIA CIVIL')}</h3>
                    <div class="header-subtitle-unit">${escapeHtml(cautelaUnit ? cautelaUnit.name : 'UNIDADE POLICIAL')}</div>
                  </div>
                </div>
                <div class="header-badge">
                  RELATÓRIO DE CAUTELA<br/>
                  <span>REGISTRO ${index + 1} DE ${totalCount}</span>
                </div>
              </div>

              <div class="doc-title-bar">
                <h1 class="header-doc-title">RELATÓRIO DE CAUTELA DE ARMAS DA UNIDADE</h1>
                <div class="filter-banner">
                  ${escapeHtml(filterSummaryText)} • Total: ${totalCount} (Ativas: ${ativasCount} | Devolvidas: ${devolvidasCount} | Indeferidas: ${indeferidasReportCount})
                </div>
              </div>

              <div style="margin-bottom: 10px;">
                <div class="section-banner">1. IDENTIFICAÇÃO DO SERVIDOR POLICIAL</div>
                <table class="info-table">
                  <tr>
                    <td style="width: 44%;"><strong>Servidor:</strong> ${escapeHtml(currentUser.name)}</td>
                    <td style="width: 31%;"><strong>Carreira:</strong> ${escapeHtml(userCareer)}</td>
                    <td style="width: 25%;"><strong>MASP:</strong> ${escapeHtml(currentUser.masp)}</td>
                  </tr>
                  <tr>
                    <td><strong>Unidade de Lotação:</strong> ${escapeHtml(userUnit ? userUnit.name : (cautelaUnit?.name || 'Unidade Vinculada'))}</td>
                    <td colspan="2"><strong>Data/Hora da Emissão:</strong> ${escapeHtml(emittedAtStr)}</td>
                  </tr>
                </table>
              </div>

              <div>
                <div class="section-banner" style="border-bottom: 1px solid #94a3b8; margin-bottom: 8px;">
                  2. REGISTRO INDIVIDUAL DA CAUTELA DE ARMAMENTO (#${index + 1} DE ${totalCount})
                </div>

                <div class="cautela-card" style="${cardBorderStyle}">
                  <div class="cautela-card-header">
                    <div>
                      <span style="font-weight: 800; font-size: 12px; color: #0f172a;">
                        ${escapeHtml(cautela.weaponModel || 'Armamento')}
                      </span>
                      <span style="font-family: monospace; font-weight: 700; font-size: 11.5px; margin-left: 8px; color: #1e293b;">
                        Nº Série: ${escapeHtml(cautela.weaponSerialNumber || 'N/I')}
                      </span>
                      ${cautela.weaponCaliber ? `<span style="margin-left: 8px; font-size: 10.5px; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 3px; background: #f1f5f9;">Calibre: <strong>${escapeHtml(cautela.weaponCaliber)}</strong></span>` : ''}
                    </div>
                    <span style="padding: 3px 9px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; ${statusStyle}">
                      ${escapeHtml(statusText)}
                    </span>
                  </div>

                  <table class="info-table" style="margin-bottom: ${hasLinkedAmmo ? '8px' : '0'};">
                    <tr>
                      <td style="width: 34%;"><strong>Espécie / Tipo:</strong> ${escapeHtml(cautela.weaponType || 'Arma de Fogo')}</td>
                      <td style="width: 33%;"><strong>Carregadores:</strong> ${escapeHtml(cautela.magazineQuantity ?? 0)} un.</td>
                      <td style="width: 33%;"><strong>Unidade da Cautela:</strong> ${escapeHtml(cautelaUnit?.name || 'Unidade Policial')}</td>
                    </tr>
                    <tr>
                      <td><strong>Data da Solicitação:</strong> ${cautela.requestDate ? escapeHtml(new Date(cautela.requestDate).toLocaleString('pt-BR')) : 'N/I'}</td>
                      <td><strong>Data da Autorização:</strong> ${cautela.authorizedAt ? escapeHtml(new Date(cautela.authorizedAt).toLocaleString('pt-BR')) : (isRecusada ? 'Indeferida' : 'Aguardando')}</td>
                      <td><strong>Data da Devolução:</strong> ${cautela.returnDate ? escapeHtml(new Date(cautela.returnDate).toLocaleString('pt-BR')) : (isAtiva ? 'Em posse (Ativa)' : '—')}</td>
                    </tr>
                    <tr>
                      <td><strong>Armeiro Responsável:</strong> ${isPend ? 'Aguardando análise' : `${escapeHtml(armorerInfo.name)}${armorerInfo.masp ? ` (MASP: ${escapeHtml(armorerInfo.masp)})` : ''}`}</td>
                      <td colspan="2"><strong>Motivo / Finalidade:</strong> ${escapeHtml(cautela.reason || 'Serviço Policial')}</td>
                    </tr>
                    ${(isDevolvida || isDevPendente) ? `
                      <tr>
                        <td><strong>Disparos na Devolução:</strong> ${cautela.hadShots ? `Sim (${escapeHtml(cautela.shotsFired || 0)} disparos)` : 'Não houve disparos'}</td>
                        <td><strong>Condição na Devolução:</strong> ${cautela.isWorking !== false ? 'Em perfeito funcionamento' : `Com defeito (${escapeHtml(cautela.defectDescription || 'Relatado')})`}</td>
                        <td><strong>Recebedor Devolução:</strong> ${isDevPendente ? 'Aguardando recibo do Armeiro' : escapeHtml(cautela.returnArmorerName || armorerInfo.name)}</td>
                      </tr>
                      ${cautela.hadMalfunction ? `
                        <tr>
                          <td colspan="3" style="color: #92400e;"><strong>Pane Relatada:</strong> ${escapeHtml(cautela.malfunctionDescription || 'Sim')}</td>
                        </tr>
                      ` : ''}
                      ${cautela.returnObservations ? `
                        <tr>
                          <td colspan="3"><strong>Observações da Devolução:</strong> ${escapeHtml(cautela.returnObservations)}</td>
                        </tr>
                      ` : ''}
                    ` : ''}
                    ${isRecusada && cautela.authorizationNotes ? `
                      <tr>
                        <td colspan="3" style="color: #991b1b; background: #fef2f2;">
                          <strong>Justificativa do Indeferimento:</strong> ${escapeHtml(cautela.authorizationNotes)}
                        </td>
                      </tr>
                    ` : ''}
                    ${!isRecusada && cautela.authorizationNotes ? `
                      <tr>
                        <td colspan="3">
                          <strong>Observações do Registro:</strong> ${escapeHtml(cautela.authorizationNotes)}
                        </td>
                      </tr>
                    ` : ''}
                  </table>

                  ${hasLinkedAmmo ? `
                    <div class="ammo-linked-box">
                      <div class="ammo-linked-title">
                        3. DADOS DAS MUNIÇÕES DA CAUTELA VINCULADA ${ammoDetails.linkedCautelaId ? `(PROTOCOLO: ${escapeHtml(ammoDetails.linkedCautelaId.toUpperCase())})` : ''}
                      </div>
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Calibre</th>
                            <th>Qtd. Acautelada</th>
                            <th>Fabricante</th>
                            <th>Tipo</th>
                            <th>Peso</th>
                            <th>Lote</th>
                            <th>Destinação</th>
                            <th>Regime / Devolução</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><strong>${escapeHtml(ammoDetails.caliberName)}</strong></td>
                            <td><strong>${escapeHtml(ammoDetails.quantity)} un.</strong></td>
                            <td>${escapeHtml(ammoDetails.fabricante)}</td>
                            <td>${escapeHtml(ammoDetails.tipoMunicao)}</td>
                            <td>${escapeHtml(ammoDetails.pesoMunicao)}</td>
                            <td style="font-family: monospace;">${escapeHtml(ammoDetails.loteMunicao)}</td>
                            <td>${escapeHtml(ammoDetails.destinacao)}</td>
                            <td>
                              ${ammoDetails.seraDevolvida
                                ? `Passiva de Devolução${(isDevolvida || isDevPendente) && returnedAmmoVal !== null ? ` (Devolvidas: ${escapeHtml(returnedAmmoVal)} un.)` : ''}`
                                : 'Retirada Permanente / Consumo'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ` : ''}
                </div>
              </div>

              ${renderPageSignatureAndFooter(index + 1, totalCount)}
            </div>
          `;
        }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório de Histórico de Cautelas de Armas - ${escapeHtml(currentUser.masp)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 14mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
            font-family: Arial, Helvetica, sans-serif !important;
            margin: 0;
            padding: 0;
            font-size: 10.5px;
            line-height: 1.42;
          }
          .cautela-report-page {
            padding: 4px 2px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .unit-logo {
            height: 58px;
            width: auto;
            max-width: 75px;
            object-fit: contain;
            flex-shrink: 0;
          }
          .header-titles {
            text-align: left;
          }
          .header-title-org {
            margin: 0;
            font-size: 13.5px;
            font-weight: 900;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            color: #000000;
          }
          .header-subtitle-dept {
            margin: 2px 0 0 0;
            font-size: 11px;
            font-weight: 700;
            color: #1e293b;
            text-transform: uppercase;
          }
          .header-subtitle-unit {
            margin: 2px 0 0 0;
            font-size: 10.5px;
            font-weight: 700;
            color: #334155;
            text-transform: uppercase;
          }
          .header-badge {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 10px;
            border-radius: 4px;
            font-family: monospace;
            text-align: right;
            font-size: 9.5px;
            font-weight: 800;
            color: #0f172a;
            flex-shrink: 0;
          }
          .header-badge span {
            font-size: 10.5px;
            color: #000000;
          }
          .doc-title-bar {
            text-align: center;
            margin-bottom: 12px;
          }
          .header-doc-title {
            margin: 0 0 4px 0;
            font-size: 12.5px;
            font-weight: 800;
            color: #000000;
            text-decoration: underline;
            text-transform: uppercase;
          }
          .filter-banner {
            margin: 2px auto 0 auto;
            font-size: 9.5px;
            font-weight: 700;
            color: #1e293b;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 3px 8px;
            display: inline-block;
          }
          .section-banner {
            background-color: #e2e8f0 !important;
            color: #0f172a !important;
            padding: 5px 8px;
            font-weight: 800;
            font-size: 10.5px;
            border: 1px solid #94a3b8;
            border-bottom: none;
            text-transform: uppercase;
          }
          .info-table, .data-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            padding: 5px 8px;
            border: 1px solid #cbd5e1;
            font-size: 10.5px;
            color: #0f172a;
            vertical-align: top;
          }
          .data-table th {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            border: 1px solid #94a3b8;
            padding: 5px 6px;
            text-align: left;
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .data-table td {
            border: 1px solid #cbd5e1;
            padding: 5px 6px;
            font-size: 10px;
            color: #0f172a;
          }
          .cautela-card {
            border-radius: 5px;
            padding: 10px;
            margin-bottom: 10px;
            page-break-inside: avoid;
          }
          .cautela-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 6px;
            margin-bottom: 8px;
            border-bottom: 1px solid #cbd5e1;
          }
          .ammo-linked-box {
            background: #f8fafc;
            border: 1px solid #94a3b8;
            border-radius: 4px;
            padding: 6px;
            margin-top: 6px;
          }
          .ammo-linked-title {
            font-size: 10px;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .signature-section {
            margin-top: 44px;
            page-break-inside: avoid;
            text-align: center;
          }
          .signature-line {
            width: 280px;
            max-width: 70%;
            margin: 0 auto 6px auto;
            border-top: 1px solid #000000;
          }
          .signature-name {
            font-size: 11px;
            font-weight: 800;
            color: #000000;
            line-height: 1.35;
          }
          .signature-career {
            font-size: 10.5px;
            font-weight: 600;
            color: #1e293b;
            line-height: 1.35;
          }
          .signature-masp {
            font-size: 10.5px;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.35;
          }
          .footer-note {
            margin-top: 18px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
            text-align: center;
            font-size: 9px;
            color: #475569;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    setIsPrintHistoryModalOpen(false);
    printDocumentInPage(htmlContent);
  };

  // Chave única de identificação de arma para o Relatório de Cautelas do Armeiro
  const getCautelaWeaponReportKey = useCallback(
    (c: CautelaArma): string => {
      const wObj = weapons.find(
        w => w.id === c.weaponId || (w.serialNumber && w.serialNumber === c.weaponSerialNumber)
      );
      const serial = (c.weaponSerialNumber || wObj?.serialNumber || '').trim();
      if (serial) return `ser:${normalizeStr(serial)}`;
      if (c.weaponId || wObj?.id) return `id:${c.weaponId || wObj?.id}`;
      return `mod:${normalizeStr(c.weaponModel || wObj?.model || c.id)}`;
    },
    [weapons]
  );

  // Dados consolidados para prévia, seletores (Arma / Policial) e emissão do Relatório de Cautelas pelo Armeiro
  const armorerReportPreview = useMemo(() => {
    if (!canAuthorize) {
      return {
        weaponOptions: [] as Array<{
          key: string;
          label: string;
          weaponTitle: string;
          serial: string;
          caliber: string;
          status: string;
          totalCount: number;
          activeCount: number;
          inactiveCount: number;
        }>,
        userOptions: [] as Array<{
          key: string;
          label: string;
          name: string;
          masp: string;
          cargo: string;
          phone: string;
          unitName: string;
          totalCount: number;
          activeCount: number;
          inactiveCount: number;
        }>,
        activeUsersGroups: [] as Array<{
          key: string;
          user: { name: string; masp: string; cargo: string; phone: string; unitName: string };
          cautelas: CautelaArma[];
        }>,
        activeCautelas: [] as CautelaArma[],
        inactiveCautelas: [] as CautelaArma[],
        activeWithAmmoCount: 0,
        inactiveWithAmmoCount: 0
      };
    }

    const allUsersLookup = storage.getAllUsersForLookup();
    const activeCautelas = scopedCautelas.filter(
      c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
    );
    const inactiveCautelas = scopedCautelas.filter(c => c.status === 'DEVOLVIDA');

    // 1. Opções de Armas da Unidade (todas as armas com cautelas + armas cadastradas na unidade)
    const weaponMap = new Map<
      string,
      {
        key: string;
        weaponTitle: string;
        serial: string;
        caliber: string;
        status: string;
        totalCount: number;
        activeCount: number;
        inactiveCount: number;
      }
    >();

    scopedCautelas.forEach(c => {
      const key = getCautelaWeaponReportKey(c);
      const wObj = weapons.find(
        w => w.id === c.weaponId || (w.serialNumber && w.serialNumber === c.weaponSerialNumber)
      );
      const weaponTitle = [
        c.weaponType || wObj?.type,
        wObj?.manufacturer,
        c.weaponModel || wObj?.model || 'Armamento'
      ]
        .filter(Boolean)
        .join(' ');
      const serial = (c.weaponSerialNumber || wObj?.serialNumber || 'S/N').trim();
      const caliber = (c.weaponCaliber || wObj?.caliber || 'Padrão').trim();
      const status = wObj?.status || (c.status === 'AUTORIZADA' ? 'Acautelada' : 'No Cofre');

      if (!weaponMap.has(key)) {
        weaponMap.set(key, {
          key,
          weaponTitle,
          serial,
          caliber,
          status,
          totalCount: 0,
          activeCount: 0,
          inactiveCount: 0
        });
      }
      const entry = weaponMap.get(key)!;
      entry.totalCount += 1;
      if (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') {
        entry.activeCount += 1;
      } else if (c.status === 'DEVOLVIDA') {
        entry.inactiveCount += 1;
      }
    });

    // Inclui também armas da unidade ainda sem cautela registrada para permitir consulta completa
    (weapons || []).forEach(w => {
      const sameUnit =
        isGeral ||
        currentUser.managementScope === 'department' ||
        !currentUser.unitId ||
        w.unitId === currentUser.unitId;
      if (!sameUnit) return;
      const serial = (w.serialNumber || '').trim();
      const key = serial ? `ser:${normalizeStr(serial)}` : `id:${w.id}`;
      if (!weaponMap.has(key)) {
        const weaponTitle = [w.type, w.manufacturer, w.model || 'Armamento']
          .filter(Boolean)
          .join(' ');
        weaponMap.set(key, {
          key,
          weaponTitle,
          serial: serial || 'S/N',
          caliber: w.caliber || 'Padrão',
          status: w.status || 'No Cofre',
          totalCount: 0,
          activeCount: 0,
          inactiveCount: 0
        });
      }
    });

    const weaponOptions = Array.from(weaponMap.values())
      .map(item => ({
        ...item,
        label: `${item.weaponTitle} — Nº ${item.serial} (${item.caliber}) • ${item.totalCount} cautela(s)`
      }))
      .sort((a, b) => {
        if ((b.totalCount > 0 ? 1 : 0) !== (a.totalCount > 0 ? 1 : 0)) {
          return (b.totalCount > 0 ? 1 : 0) - (a.totalCount > 0 ? 1 : 0);
        }
        return a.label.localeCompare(b.label, 'pt-BR');
      });

    // 2. Opções de Policiais / Usuários (todos os policiais com cautelas na unidade + policiais da unidade)
    const userMap = new Map<
      string,
      {
        key: string;
        name: string;
        masp: string;
        cargo: string;
        phone: string;
        unitName: string;
        totalCount: number;
        activeCount: number;
        inactiveCount: number;
      }
    >();

    scopedCautelas.forEach(c => {
      const key = getCautelaRequesterFilterKey(c);
      if (!key || key === 'unknown') return;
      const resolved = getResolvedRequester(c);
      const reqDigits = cleanDigits(resolved.masp || c.requesterMasp);
      const matchedUser =
        (c.requesterId ? allUsersLookup.find(u => u.id === c.requesterId) : undefined) ||
        (reqDigits ? allUsersLookup.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
        allUsersLookup.find(u => normalizeStr(u.name) === normalizeStr(resolved.name));
      const wObj = weapons.find(
        w => w.id === c.weaponId || (w.serialNumber && w.serialNumber === c.weaponSerialNumber)
      );
      const uObj = units.find(
        u => u.id === (matchedUser?.unitId || c.unitId || wObj?.unitId || currentUser.unitId)
      );

      if (!userMap.has(key)) {
        userMap.set(key, {
          key,
          name: resolved.name,
          masp: resolved.masp || 'N/I',
          cargo: resolved.cargo || matchedUser?.cargo || 'Policial Civil',
          phone: matchedUser?.phone || c.requesterPhone || 'Não informado',
          unitName: uObj?.name || unitSigla,
          totalCount: 0,
          activeCount: 0,
          inactiveCount: 0
        });
      }
      const entry = userMap.get(key)!;
      entry.totalCount += 1;
      if (c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE') {
        entry.activeCount += 1;
      } else if (c.status === 'DEVOLVIDA') {
        entry.inactiveCount += 1;
      }
    });

    availableUnitOfficers.forEach(u => {
      const mDigits = cleanDigits(u.masp);
      const key = mDigits && mDigits.length >= 4 ? `masp:${mDigits}` : `id:${u.id}`;
      if (!userMap.has(key)) {
        const uObj = units.find(x => x.id === (u.unitId || currentUser.unitId));
        userMap.set(key, {
          key,
          name: u.name,
          masp: u.masp || 'N/I',
          cargo: u.cargo || 'Policial Civil',
          phone: u.phone || 'Não informado',
          unitName: uObj?.name || unitSigla,
          totalCount: 0,
          activeCount: 0,
          inactiveCount: 0
        });
      }
    });

    const userOptions = Array.from(userMap.values())
      .map(item => ({
        ...item,
        label: `${item.name}${item.masp && item.masp !== 'N/I' ? ` (MASP: ${item.masp})` : ''} — ${item.cargo} • ${item.totalCount} cautela(s)`
      }))
      .sort((a, b) => {
        if ((b.totalCount > 0 ? 1 : 0) !== (a.totalCount > 0 ? 1 : 0)) {
          return (b.totalCount > 0 ? 1 : 0) - (a.totalCount > 0 ? 1 : 0);
        }
        return a.name.localeCompare(b.name, 'pt-BR');
      });

    // 3. Agrupamento de Usuários com Cautelas Ativas
    const userGroupsMap = new Map<
      string,
      {
        key: string;
        user: { name: string; masp: string; cargo: string; phone: string; unitName: string };
        cautelas: CautelaArma[];
      }
    >();

    activeCautelas.forEach(c => {
      const key = getCautelaRequesterFilterKey(c);
      const resolved = getResolvedRequester(c);
      const reqDigits = cleanDigits(resolved.masp || c.requesterMasp);
      const matchedUser =
        (c.requesterId ? allUsersLookup.find(u => u.id === c.requesterId) : undefined) ||
        (reqDigits ? allUsersLookup.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
        allUsersLookup.find(u => normalizeStr(u.name) === normalizeStr(resolved.name));
      const wObj = weapons.find(
        w => w.id === c.weaponId || (w.serialNumber && w.serialNumber === c.weaponSerialNumber)
      );
      const uObj = units.find(
        u => u.id === (matchedUser?.unitId || c.unitId || wObj?.unitId || currentUser.unitId)
      );

      if (!userGroupsMap.has(key)) {
        userGroupsMap.set(key, {
          key,
          user: {
            name: resolved.name,
            masp: resolved.masp || 'N/I',
            cargo: resolved.cargo || matchedUser?.cargo || 'Policial Civil',
            phone: matchedUser?.phone || c.requesterPhone || 'Não informado',
            unitName: uObj?.name || unitSigla
          },
          cautelas: []
        });
      }
      userGroupsMap.get(key)!.cautelas.push(c);
    });

    const activeUsersGroups = Array.from(userGroupsMap.values()).sort((a, b) =>
      a.user.name.localeCompare(b.user.name, 'pt-BR')
    );

    const activeWithAmmoCount = activeCautelas.filter(c => {
      const ad = getRescuedAmmoDetails(c);
      return ad.hasAmmo && ad.quantity > 0;
    }).length;

    const inactiveWithAmmoCount = inactiveCautelas.filter(c => {
      const ad = getRescuedAmmoDetails(c);
      return ad.hasAmmo && ad.quantity > 0;
    }).length;

    return {
      weaponOptions,
      userOptions,
      activeUsersGroups,
      activeCautelas,
      inactiveCautelas,
      activeWithAmmoCount,
      inactiveWithAmmoCount
    };
  }, [
    canAuthorize,
    scopedCautelas,
    weapons,
    units,
    isGeral,
    currentUser.unitId,
    currentUser.managementScope,
    unitSigla,
    availableUnitOfficers,
    getCautelaWeaponReportKey,
    getCautelaRequesterFilterKey,
    getResolvedRequester
  ]);

  // Filtra opções de armas e policiais conforme busca digitada no modal
  const filteredReportWeaponOptions = useMemo(() => {
    if (!armorerReportWeaponSearch.trim()) return armorerReportPreview.weaponOptions;
    const q = normalizeStr(armorerReportWeaponSearch);
    const qDigits = cleanDigits(armorerReportWeaponSearch);
    return armorerReportPreview.weaponOptions.filter(opt => {
      if (normalizeStr(opt.label).includes(q)) return true;
      if (qDigits.length >= 2 && cleanDigits(opt.serial).includes(qDigits)) return true;
      return false;
    });
  }, [armorerReportPreview.weaponOptions, armorerReportWeaponSearch]);

  const filteredReportUserOptions = useMemo(() => {
    if (!armorerReportUserSearch.trim()) return armorerReportPreview.userOptions;
    const q = normalizeStr(armorerReportUserSearch);
    const qDigits = cleanDigits(armorerReportUserSearch);
    return armorerReportPreview.userOptions.filter(opt => {
      if (normalizeStr(opt.label).includes(q)) return true;
      if (qDigits.length >= 2 && cleanDigits(opt.masp).includes(qDigits)) return true;
      return false;
    });
  }, [armorerReportPreview.userOptions, armorerReportUserSearch]);

  // Mantém seleção válida nos seletores de Arma e Policial
  React.useEffect(() => {
    if (filteredReportWeaponOptions.length > 0) {
      if (!filteredReportWeaponOptions.some(w => w.key === armorerReportWeaponKey)) {
        setArmorerReportWeaponKey(filteredReportWeaponOptions[0].key);
      }
    }
  }, [filteredReportWeaponOptions, armorerReportWeaponKey]);

  React.useEffect(() => {
    if (filteredReportUserOptions.length > 0) {
      if (!filteredReportUserOptions.some(u => u.key === armorerReportUserKey)) {
        setArmorerReportUserKey(filteredReportUserOptions[0].key);
      }
    }
  }, [filteredReportUserOptions, armorerReportUserKey]);

  // Lista calculada em tempo real para os modos POR_ARMA e POR_POLICIAL
  const selectedEntityHistoryCautelas = useMemo(() => {
    if (!canAuthorize) return [] as CautelaArma[];
    let list = [...scopedCautelas];

    if (armorerReportScope === 'POR_ARMA') {
      if (!armorerReportWeaponKey) return [];
      list = list.filter(c => getCautelaWeaponReportKey(c) === armorerReportWeaponKey);
    } else if (armorerReportScope === 'POR_POLICIAL') {
      if (!armorerReportUserKey) return [];
      list = list.filter(c => getCautelaRequesterFilterKey(c) === armorerReportUserKey);
    } else if (armorerReportScope === 'ATIVAS') {
      list = list.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE');
    } else if (armorerReportScope === 'SOMENTE_INATIVAS') {
      list = list.filter(c => c.status === 'DEVOLVIDA');
    } else {
      list = list.filter(
        c =>
          c.status === 'AUTORIZADA' ||
          c.status === 'DEVOLUCAO_PENDENTE' ||
          c.status === 'DEVOLVIDA'
      );
    }

    if (armorerReportScope === 'POR_ARMA' || armorerReportScope === 'POR_POLICIAL') {
      if (armorerReportStatusSubFilter === 'ATIVAS') {
        list = list.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE');
      } else if (armorerReportStatusSubFilter === 'INATIVAS') {
        list = list.filter(c => c.status === 'DEVOLVIDA');
      }
    }

    // Ordena mantendo cautelas ativas no topo e as demais da mais recente para a mais antiga
    list.sort((a, b) => {
      const aActive = a.status === 'AUTORIZADA' || a.status === 'DEVOLUCAO_PENDENTE' ? 1 : 0;
      const bActive = b.status === 'AUTORIZADA' || b.status === 'DEVOLUCAO_PENDENTE' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const tsA =
        new Date(a.returnDate || a.authorizedAt || a.requestDate || a.createdAt || '').getTime() || 0;
      const tsB =
        new Date(b.returnDate || b.authorizedAt || b.requestDate || b.createdAt || '').getTime() || 0;
      return tsB - tsA;
    });

    return list;
  }, [
    canAuthorize,
    scopedCautelas,
    armorerReportScope,
    armorerReportWeaponKey,
    armorerReportUserKey,
    armorerReportStatusSubFilter,
    getCautelaWeaponReportKey,
    getCautelaRequesterFilterKey
  ]);

  const handleOpenArmorerReportModal = () => {
    setErrorMsg('');
    setArmorerReportWeaponSearch('');
    setArmorerReportUserSearch('');
    setArmorerReportStatusSubFilter('TODAS');

    // Pré-seleciona automaticamente caso o armeiro já esteja filtrando por usuário ou arma na tela
    if (activeTab === 'HISTORICO_UNIDADE' && unitHistoryUserFilter !== 'TODOS') {
      setArmorerReportScope('POR_POLICIAL');
      setArmorerReportUserKey(unitHistoryUserFilter);
    } else if (activeTab === 'DEFERIDAS' && deferidasUserFilter !== 'TODOS') {
      setArmorerReportScope('POR_POLICIAL');
      setArmorerReportUserKey(deferidasUserFilter);
    } else if (activeTab === 'INDEFERIDAS' && indeferidasUserFilter !== 'TODOS') {
      setArmorerReportScope('POR_POLICIAL');
      setArmorerReportUserKey(indeferidasUserFilter);
    } else if (activeTab === 'HISTORICO_UNIDADE' && unitHistoryWeaponFilter !== 'TODAS') {
      const foundW = armorerReportPreview.weaponOptions.find(
        w => w.serial === unitHistoryWeaponFilter || w.key.includes(normalizeStr(unitHistoryWeaponFilter))
      );
      if (foundW) {
        setArmorerReportScope('POR_ARMA');
        setArmorerReportWeaponKey(foundW.key);
      }
    } else {
      if (!armorerReportWeaponKey && armorerReportPreview.weaponOptions.length > 0) {
        setArmorerReportWeaponKey(armorerReportPreview.weaponOptions[0].key);
      }
      if (!armorerReportUserKey && armorerReportPreview.userOptions.length > 0) {
        setArmorerReportUserKey(armorerReportPreview.userOptions[0].key);
      }
    }

    setIsArmorerReportModalOpen(true);
  };

  // Emissão do Relatório de Cautelas pelo Armeiro
  // Contém TODAS as informações completas (usuário, arma, solicitação/retirada, devolução/condição técnica e munições vinculadas)
  // independentemente do tipo de filtro selecionado (por arma, por policial, ativas, inativas ou geral).
  const handlePrintArmorerCautelasReport = () => {
    const escapeHtml = (val?: string | number | null) =>
      String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const deptObj = userUnit ? departments.find(d => d.id === userUnit.departmentId) : undefined;
    const reportLogo = getSystemLogo(userUnit, deptObj);
    const allUsersLookup = storage.getAllUsersForLookup();
    const issuerStored = allUsersLookup.find(u => u.id === currentUser.id);
    const issuerCareer = (currentUser.cargo || issuerStored?.cargo || 'Armeiro da Unidade').trim();

    const selectedWeaponOpt = armorerReportPreview.weaponOptions.find(
      w => w.key === armorerReportWeaponKey
    );
    const selectedUserOpt = armorerReportPreview.userOptions.find(
      u => u.key === armorerReportUserKey
    );

    const subFilterLabel =
      armorerReportStatusSubFilter === 'ATIVAS'
        ? 'Somente Cautelas Ativas'
        : armorerReportStatusSubFilter === 'INATIVAS'
          ? 'Somente Cautelas Inativas (Devolvidas)'
          : 'Todo o Histórico de Cautelas';

    const reportDocTitle =
      armorerReportScope === 'POR_ARMA'
        ? `HISTÓRICO COMPLETO DE CAUTELAS DO ARMAMENTO — ${unitSigla}`
        : armorerReportScope === 'POR_POLICIAL'
          ? `HISTÓRICO COMPLETO DE CAUTELAS DO POLICIAL — ${unitSigla}`
          : armorerReportScope === 'ATIVAS'
            ? `RELATÓRIO DE CAUTELAS ATIVAS — ${unitSigla}`
            : armorerReportScope === 'SOMENTE_INATIVAS'
              ? `RELATÓRIO DE CAUTELAS INATIVAS (RECEBIDAS E DEVOLVIDAS) — ${unitSigla}`
              : `RELATÓRIO GERAL DE CAUTELAS ATIVAS E INATIVAS — ${unitSigla}`;

    const reportSubtitle =
      armorerReportScope === 'POR_ARMA'
        ? `Histórico detalhado de todas as cautelas da arma ${selectedWeaponOpt ? `${selectedWeaponOpt.weaponTitle} (Nº ${selectedWeaponOpt.serial})` : ''} — ${subFilterLabel}`
        : armorerReportScope === 'POR_POLICIAL'
          ? `Histórico detalhado de todas as cautelas do policial ${selectedUserOpt ? `${selectedUserOpt.name} (MASP: ${selectedUserOpt.masp})` : ''} — ${subFilterLabel}`
          : armorerReportScope === 'ATIVAS'
            ? 'Relação completa com todos os dados de usuários, armamentos, retiradas, devoluções e munições vinculadas'
            : armorerReportScope === 'SOMENTE_INATIVAS'
              ? 'Histórico completo de todas as cautelas inativas (recebidas e devolvidas) com todos os dados de usuários, armas e munições'
              : 'Relatório completo de cautelas ativas e inativas contendo todos os dados de usuários, armamentos e munições vinculadas';

    const modalidadeSummary =
      armorerReportScope === 'POR_ARMA'
        ? `Histórico por Arma (${subFilterLabel})`
        : armorerReportScope === 'POR_POLICIAL'
          ? `Histórico por Policial (${subFilterLabel})`
          : armorerReportScope === 'ATIVAS'
            ? 'Somente Cautelas Ativas (Unidade)'
            : armorerReportScope === 'SOMENTE_INATIVAS'
              ? 'Somente Cautelas Inativas / Devolvidas (Unidade)'
              : 'Cautelas Ativas e Inativas (Histórico Completo da Unidade)';

    // Renderizador padronizado contendo TODAS AS INFORMAÇÕES da cautela independentemente do tipo de filtro
    const renderCompleteCautelaCardHtml = (c: CautelaArma, index: number, total: number) => {
      const reqInfo = getResolvedRequester(c);
      const reqDigits = cleanDigits(reqInfo.masp || c.requesterMasp);
      const matchedUser =
        (c.requesterId ? allUsersLookup.find(u => u.id === c.requesterId) : undefined) ||
        (reqDigits ? allUsersLookup.find(u => cleanDigits(u.masp) === reqDigits) : undefined) ||
        allUsersLookup.find(u => normalizeStr(u.name) === normalizeStr(reqInfo.name));

      const wObj = weapons.find(
        w => w.id === c.weaponId || (w.serialNumber && w.serialNumber === c.weaponSerialNumber)
      );
      const uObj = units.find(
        u => u.id === (matchedUser?.unitId || c.unitId || wObj?.unitId || currentUser.unitId)
      );
      const vaultObj = vaultSpaces.find(
        v => v.id === (c.vaultSpaceId || wObj?.vaultSpaceId || wObj?.previousVaultSpaceId)
      );
      const vaultLabel = vaultObj ? vaultObj.code : 'Cofre da Unidade';

      const armorerOut = getResolvedArmorer(c);
      const motivo = getResolvedMotivoFinalidade(c) || c.reason || 'Serviço Policial';

      const isActive = c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE';
      const isDevPend = c.status === 'DEVOLUCAO_PENDENTE';
      const isReturned = c.status === 'DEVOLVIDA';
      const isRefused = c.status === 'RECUSADA';

      const statusBadgeClass = isActive
        ? 'badge-active'
        : isReturned
          ? 'badge-inactive'
          : isRefused
            ? 'badge-refused'
            : 'badge-pending';

      const statusLabel = isDevPend
        ? 'ATIVA — DEVOLUÇÃO PENDENTE DE CONFERÊNCIA'
        : isActive
          ? 'CAUTELA ATIVA EM POSSE'
          : isReturned
            ? 'CAUTELA INATIVA / DEVOLVIDA AO COFRE'
            : isRefused
              ? 'SOLICITAÇÃO INDEFERIDA / RECUSADA'
              : 'SOLICITAÇÃO PENDENTE DE ANÁLISE';

      const reqDateStr = c.requestDate
        ? new Date(c.requestDate).toLocaleString('pt-BR')
        : c.createdAt
          ? new Date(c.createdAt).toLocaleString('pt-BR')
          : 'N/I';
      const authDateStr = c.authorizedAt
        ? new Date(c.authorizedAt).toLocaleString('pt-BR')
        : isRefused
          ? 'Indeferida'
          : isActive || isReturned
            ? reqDateStr
            : 'Aguardando autorização';
      const returnDateStr = c.returnDate
        ? new Date(c.returnDate).toLocaleString('pt-BR')
        : isReturned
          ? 'Baixada no Sistema'
          : isDevPend
            ? 'Devolução informada pelo policial (aguardando recibo)'
            : isActive
              ? 'Em posse atual (não devolvida)'
              : 'Não aplicável';

      const returnArmorerStr = isReturned
        ? `${c.returnArmorerName || armorerOut.name}${
            c.returnArmorerMasp ? ` (MASP: ${c.returnArmorerMasp})` : ''
          }`
        : isDevPend
          ? 'Aguardando conferência do Armeiro'
          : isActive
            ? 'Aguardando encerramento da cautela'
            : 'Não aplicável';

      const shotsStr =
        isReturned || isDevPend
          ? c.hadShots
            ? `SIM (${c.shotsFired || 0} disparo(s) efetuado(s))`
            : 'NÃO (Zero disparos)'
          : 'Sem registro de devolução';

      const conditionStr =
        isReturned || isDevPend
          ? c.isWorking !== false
            ? 'Em perfeitas condições de uso'
            : `APRESENTA DEFEITO${c.defectDescription ? `: ${c.defectDescription}` : ''}`
          : 'Em condições normais na saída';

      const malfunctionStr =
        isReturned || isDevPend
          ? c.hadMalfunction
            ? `SIM${c.malfunctionDescription ? ` (${c.malfunctionDescription})` : ''}`
            : 'NÃO'
          : 'Sem registro';

      const returnedMagsStr =
        isReturned || isDevPend
          ? `${c.returnedMagazinesCount ?? c.magazineQuantity ?? 1} de ${c.magazineQuantity || 1} un.`
          : `${c.magazineQuantity || 1} un. acautelado(s)`;

      const ammoDetails = getRescuedAmmoDetails(c);
      let ammoSectionHtml = '';

      if (ammoDetails.hasAmmo && ammoDetails.quantity > 0) {
        const retVaultId =
          (c as any).ammoReturnVaultSpaceId ||
          (ammoDetails.linkedAmmo as any)?.returnVaultSpaceId ||
          ammoDetails.vaultSpaceId;
        const retVaultObj = retVaultId ? vaultSpaces.find(v => v.id === retVaultId) : undefined;
        const retVaultCode = retVaultObj
          ? retVaultObj.code
          : ammoDetails.originVaultCode || 'Cofre da Unidade';

        const returnedQty =
          ammoDetails.returnedQuantity !== null && ammoDetails.returnedQuantity !== undefined
            ? Number(ammoDetails.returnedQuantity)
            : ammoDetails.seraDevolvida
              ? Math.max(0, ammoDetails.quantity - (c.shotsFired || 0))
              : 0;
        const consumedQty = Math.max(0, ammoDetails.quantity - returnedQty);

        const ammoReturnStatusStr = isReturned
          ? ammoDetails.seraDevolvida
            ? `Devolvidas: ${returnedQty} un.${
                consumedQty > 0 ? ` • Deflagradas: ${consumedQty} un.` : ''
              } (Cofre: ${retVaultCode})`
            : `Baixa definitiva / Consumo${c.hadShots ? ` (${c.shotsFired || 0} tiro(s))` : ''}`
          : isDevPend && ammoDetails.seraDevolvida
            ? `Informadas p/ devolução: ${c.returnedAmmoQuantity ?? returnedQty} de ${ammoDetails.quantity} un.`
            : ammoDetails.seraDevolvida
              ? 'Em posse (passiva de devolução posterior)'
              : 'Em posse (retirada permanente)';

        ammoSectionHtml = `
          <div class="ammo-linked-box">
            <div class="ammo-linked-title">
              ● Detalhamento das Munições Vinculadas (${escapeHtml(ammoDetails.quantity)} cartuchos)
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Calibre</th>
                  <th>Qtd. Acautelada</th>
                  <th>Fabricante</th>
                  <th>Tipo / Peso</th>
                  <th>Lote${ammoDetails.anoFabricacao ? ' / Ano' : ''}</th>
                  <th>Destinação</th>
                  <th>Regime</th>
                  <th>Cofre Origem</th>
                  <th>Situação / Devolução da Munição</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>${escapeHtml(ammoDetails.caliberName)}</strong></td>
                  <td style="font-weight: 800;">${escapeHtml(ammoDetails.quantity)} un.</td>
                  <td>${escapeHtml(ammoDetails.fabricante)}</td>
                  <td>${escapeHtml(ammoDetails.tipoMunicao)} • ${escapeHtml(ammoDetails.pesoMunicao)}</td>
                  <td style="font-family: monospace;">${escapeHtml(ammoDetails.loteMunicao)}${
                    ammoDetails.anoFabricacao ? ` (${escapeHtml(ammoDetails.anoFabricacao)})` : ''
                  }</td>
                  <td><strong>${escapeHtml(ammoDetails.destinacao)}</strong></td>
                  <td>${ammoDetails.seraDevolvida ? 'Passiva de Devolução' : 'Retirada Permanente'}</td>
                  <td>${escapeHtml(ammoDetails.originVaultCode || 'Cofre da Unidade')}</td>
                  <td>${escapeHtml(ammoReturnStatusStr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      } else {
        ammoSectionHtml = `
          <div class="no-ammo-line">
            <strong>Munições Vinculadas:</strong> Nenhuma munição vinculada nesta cautela (somente armamento e ${escapeHtml(c.magazineQuantity || 1)} carregador(es)).
          </div>
        `;
      }

      const weaponFullTitle = [
        c.weaponType || wObj?.type || 'Arma de Fogo',
        wObj?.manufacturer,
        c.weaponModel || wObj?.model || 'Armamento'
      ]
        .filter(Boolean)
        .join(' • ');

      return `
        <div class="full-record-card">
          <div class="full-record-header">
            <div>
              <span class="record-order">REGISTRO #${index + 1} DE ${total}</span>
              <span class="record-proto">Protocolo: ${escapeHtml(String(c.id || '').toUpperCase())}</span>
            </div>
            <span class="${statusBadgeClass}">${escapeHtml(statusLabel)}</span>
          </div>

          <!-- 1. Dados do Policial / Usuário -->
          <div class="sub-banner">Dados do Policial / Usuário</div>
          <table class="info-table" style="margin-bottom: 5px;">
            <tr>
              <td style="width: 42%;"><strong>Nome Completo:</strong> ${escapeHtml(reqInfo.name)}</td>
              <td style="width: 22%;"><strong>MASP:</strong> <span style="font-family: monospace; font-weight: 700;">${escapeHtml(reqInfo.masp)}</span></td>
              <td style="width: 36%;"><strong>Cargo / Carreira:</strong> ${escapeHtml(reqInfo.cargo)}</td>
            </tr>
            <tr>
              <td><strong>Telefone:</strong> ${escapeHtml(matchedUser?.phone || c.requesterPhone || 'Não informado')}</td>
              <td colspan="2"><strong>Unidade de Lotação:</strong> ${escapeHtml(uObj?.name || unitSigla)}</td>
            </tr>
          </table>

          <!-- 2. Dados do Armamento -->
          <div class="sub-banner">Dados do Armamento</div>
          <table class="data-table" style="margin-bottom: 5px;">
            <thead>
              <tr>
                <th>Espécie / Fabricante / Modelo</th>
                <th>Número de Série</th>
                <th>Calibre</th>
                <th>Carregadores</th>
                <th>Cofre de Origem / Retorno</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${escapeHtml(weaponFullTitle)}</strong></td>
                <td style="font-family: monospace; font-weight: 800;">${escapeHtml(c.weaponSerialNumber || wObj?.serialNumber || 'S/N')}</td>
                <td>${escapeHtml(c.weaponCaliber || wObj?.caliber || 'Padrão')}</td>
                <td style="text-align: center;">${escapeHtml(c.magazineQuantity || 1)} un.</td>
                <td>${escapeHtml(vaultLabel)}</td>
              </tr>
            </tbody>
          </table>

          <!-- 3. Dados da Solicitação, Autorização e Recebimento + Devolução ao Cofre -->
          <div class="sub-banner">Movimentação da Cautela (Retirada / Recebimento e Devolução ao Cofre)</div>
          <table class="info-table">
            <tr>
              <td style="width: 34%;"><strong>Data/Hora Solicitação:</strong> ${escapeHtml(reqDateStr)}</td>
              <td style="width: 33%;"><strong>Data/Hora Autorização/Retirada:</strong> ${escapeHtml(authDateStr)}</td>
              <td style="width: 33%;"><strong>Motivo / Finalidade:</strong> <strong>${escapeHtml(motivo)}</strong></td>
            </tr>
            <tr>
              <td colspan="2"><strong>Armeiro Autorizador / Liberador:</strong> ${escapeHtml(armorerOut.label)}</td>
              <td><strong>Data/Hora Devolução:</strong> ${escapeHtml(returnDateStr)}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Armeiro Recebedor na Devolução:</strong> ${escapeHtml(returnArmorerStr)}</td>
              <td><strong>Carregadores Devolvidos:</strong> ${escapeHtml(returnedMagsStr)}</td>
            </tr>
            <tr>
              <td><strong>Disparos Efetuados:</strong> ${escapeHtml(shotsStr)}</td>
              <td><strong>Condição Técnica:</strong> ${escapeHtml(conditionStr)}</td>
              <td><strong>Registro de Pane:</strong> ${escapeHtml(malfunctionStr)}</td>
            </tr>
            ${
              c.authorizationNotes
                ? `<tr><td colspan="3"><strong>Observações / Despacho da Solicitação/Autorização:</strong> ${escapeHtml(c.authorizationNotes)}</td></tr>`
                : ''
            }
            ${
              c.returnObservations
                ? `<tr><td colspan="3"><strong>Observações da Devolução:</strong> ${escapeHtml(c.returnObservations)}</td></tr>`
                : ''
            }
          </table>

          <!-- 4. Detalhamento das Munições Vinculadas -->
          ${ammoSectionHtml}
        </div>
      `;
    };

    // Cabeçalho focalizado quando filtrado por uma Arma específica ou por um Policial específico
    let entityFocusBannerHtml = '';
    if (armorerReportScope === 'POR_ARMA' && selectedWeaponOpt) {
      const totalC = selectedEntityHistoryCautelas.length;
      const actC = selectedEntityHistoryCautelas.filter(
        c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
      ).length;
      const inactC = selectedEntityHistoryCautelas.filter(c => c.status === 'DEVOLVIDA').length;

      entityFocusBannerHtml = `
        <div class="focus-entity-box">
          <div class="focus-entity-title">FICHA HISTÓRICA DO ARMAMENTO SELECIONADO</div>
          <table class="info-table">
            <tr>
              <td style="width: 45%;"><strong>Armamento:</strong> ${escapeHtml(selectedWeaponOpt.weaponTitle)}</td>
              <td style="width: 28%;"><strong>Número de Série:</strong> <span style="font-family: monospace; font-weight: 800;">${escapeHtml(selectedWeaponOpt.serial)}</span></td>
              <td style="width: 27%;"><strong>Calibre:</strong> ${escapeHtml(selectedWeaponOpt.caliber)}</td>
            </tr>
            <tr>
              <td><strong>Status Atual na Unidade:</strong> ${escapeHtml(selectedWeaponOpt.status)}</td>
              <td colspan="2">
                <strong>Resumo no Relatório:</strong> ${totalC} registro(s) listado(s)
                (${actC} ativa(s) • ${inactC} devolvida(s)/inativa(s))
              </td>
            </tr>
          </table>
        </div>
      `;
    } else if (armorerReportScope === 'POR_POLICIAL' && selectedUserOpt) {
      const totalC = selectedEntityHistoryCautelas.length;
      const actC = selectedEntityHistoryCautelas.filter(
        c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
      ).length;
      const inactC = selectedEntityHistoryCautelas.filter(c => c.status === 'DEVOLVIDA').length;

      entityFocusBannerHtml = `
        <div class="focus-entity-box">
          <div class="focus-entity-title">FICHA HISTÓRICA DO POLICIAL / USUÁRIO SELECIONADO</div>
          <table class="info-table">
            <tr>
              <td style="width: 45%;"><strong>Nome Completo:</strong> ${escapeHtml(selectedUserOpt.name)}</td>
              <td style="width: 25%;"><strong>MASP:</strong> <span style="font-family: monospace; font-weight: 800;">${escapeHtml(selectedUserOpt.masp)}</span></td>
              <td style="width: 30%;"><strong>Cargo / Carreira:</strong> ${escapeHtml(selectedUserOpt.cargo)}</td>
            </tr>
            <tr>
              <td><strong>Telefone:</strong> ${escapeHtml(selectedUserOpt.phone)}</td>
              <td><strong>Unidade:</strong> ${escapeHtml(selectedUserOpt.unitName)}</td>
              <td><strong>Registros no Relatório:</strong> ${totalC} (${actC} ativa(s) • ${inactC} devolvida(s))</td>
            </tr>
          </table>
        </div>
      `;
    }

    // Construção do corpo principal mantendo 100% das informações em qualquer filtro
    let reportBodyHtml = '';

    if (armorerReportScope === 'POR_ARMA' || armorerReportScope === 'POR_POLICIAL') {
      const sectionHeading =
        armorerReportScope === 'POR_ARMA'
          ? `HISTÓRICO CRONOLÓGICO DE CAUTELAS DO ARMAMENTO (${selectedEntityHistoryCautelas.length} REGISTRO(S))`
          : `HISTÓRICO CRONOLÓGICO DE CAUTELAS DO POLICIAL (${selectedEntityHistoryCautelas.length} REGISTRO(S))`;

      if (selectedEntityHistoryCautelas.length === 0) {
        reportBodyHtml = `
          <div class="section-block">
            <div class="section-banner">${escapeHtml(sectionHeading)}</div>
            <div class="empty-box">
              Nenhuma cautela encontrada para o filtro selecionado na unidade ${escapeHtml(unitSigla)}.
            </div>
          </div>
        `;
      } else {
        reportBodyHtml = `
          <div class="section-block">
            <div class="section-banner">${escapeHtml(sectionHeading)}</div>
            ${selectedEntityHistoryCautelas
              .map((c, idx) =>
                renderCompleteCautelaCardHtml(c, idx, selectedEntityHistoryCautelas.length)
              )
              .join('')}
          </div>
        `;
      }
    } else if (armorerReportScope === 'ATIVAS') {
      const list = selectedEntityHistoryCautelas;
      reportBodyHtml = `
        <div class="section-block">
          <div class="section-banner">
            RELAÇÃO COMPLETA DE CAUTELAS ATIVAS — ${escapeHtml(unitSigla)} (${armorerReportPreview.activeUsersGroups.length} USUÁRIO(S) / ${list.length} CAUTELA(S))
          </div>
          ${
            list.length === 0
              ? `<div class="empty-box">Nenhum usuário possui cautela de armamento ativa na unidade ${escapeHtml(unitSigla)} neste momento.</div>`
              : list.map((c, idx) => renderCompleteCautelaCardHtml(c, idx, list.length)).join('')
          }
        </div>
      `;
    } else if (armorerReportScope === 'SOMENTE_INATIVAS') {
      const list = selectedEntityHistoryCautelas;
      reportBodyHtml = `
        <div class="section-block">
          <div class="section-banner">
            HISTÓRICO COMPLETO DE CAUTELAS INATIVAS (RECEBIDAS E DEVOLVIDAS) — ${escapeHtml(unitSigla)} (${list.length} REGISTRO(S))
          </div>
          ${
            list.length === 0
              ? `<div class="empty-box">Nenhum registro de cautela inativa / devolvida encontrado na unidade ${escapeHtml(unitSigla)}.</div>`
              : list.map((c, idx) => renderCompleteCautelaCardHtml(c, idx, list.length)).join('')
          }
        </div>
      `;
    } else {
      // ATIVAS_E_INATIVAS
      const actList = selectedEntityHistoryCautelas.filter(
        c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
      );
      const inactList = selectedEntityHistoryCautelas.filter(c => c.status === 'DEVOLVIDA');

      reportBodyHtml = `
        <div class="section-block">
          <div class="section-banner">
            1. CAUTELAS ATIVAS EM POSSE — ${escapeHtml(unitSigla)} (${armorerReportPreview.activeUsersGroups.length} USUÁRIO(S) / ${actList.length} CAUTELA(S))
          </div>
          ${
            actList.length === 0
              ? `<div class="empty-box">Nenhuma cautela ativa no momento na unidade ${escapeHtml(unitSigla)}.</div>`
              : actList
                  .map((c, idx) => renderCompleteCautelaCardHtml(c, idx, actList.length))
                  .join('')
          }
        </div>

        <div class="section-block" style="margin-top: 16px;">
          <div class="section-banner">
            2. HISTÓRICO DE CAUTELAS INATIVAS (RECEBIDAS E DEVOLVIDAS) — ${escapeHtml(unitSigla)} (${inactList.length} REGISTRO(S))
          </div>
          ${
            inactList.length === 0
              ? `<div class="empty-box">Nenhuma cautela inativa / devolvida registrada na unidade ${escapeHtml(unitSigla)}.</div>`
              : inactList
                  .map((c, idx) => renderCompleteCautelaCardHtml(c, idx, inactList.length))
                  .join('')
          }
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(reportDocTitle)}</title>
        <style>
          @page { size: A4 portrait; margin: 11mm 11mm 13mm 11mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body {
            font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 10px;
            line-height: 1.36;
          }
          .header-box {
            display: flex;
            align-items: center;
            gap: 14px;
            border: 1.5px solid #0f172a;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 9px;
            background: #f8fafc;
          }
          .header-logo {
            width: 56px;
            height: 56px;
            object-fit: contain;
            flex-shrink: 0;
          }
          .header-center {
            flex: 1;
            text-align: center;
          }
          .header-org {
            margin: 0;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.4px;
            color: #0f172a;
            text-transform: uppercase;
          }
          .header-unit {
            margin: 2px 0;
            font-size: 10px;
            font-weight: 700;
            color: #334155;
            text-transform: uppercase;
          }
          .header-doc-title {
            margin: 3px 0 2px 0;
            font-size: 12.5px;
            font-weight: 900;
            color: #000000;
            text-transform: uppercase;
          }
          .header-subtitle {
            margin: 0;
            font-size: 9.2px;
            color: #475569;
          }
          .summary-bar {
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            padding: 5px 10px;
            margin-bottom: 10px;
            font-size: 9.5px;
          }
          .focus-entity-box {
            border: 1.5px solid #0f172a;
            border-radius: 6px;
            padding: 7px 9px;
            margin-bottom: 11px;
            background: #f8fafc;
            page-break-inside: avoid;
          }
          .focus-entity-title {
            font-size: 9.5px;
            font-weight: 900;
            letter-spacing: 0.4px;
            color: #0f172a;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .section-banner {
            background: #0f172a !important;
            color: #ffffff !important;
            padding: 6px 10px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.4px;
            border-radius: 4px;
            margin-bottom: 8px;
            text-transform: uppercase;
          }
          .full-record-card {
            border: 1.3px solid #64748b;
            border-radius: 6px;
            padding: 8px 9px;
            margin-bottom: 10px;
            page-break-inside: avoid;
            background: #ffffff;
          }
          .full-record-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .record-order {
            font-size: 9.5px;
            font-weight: 900;
            color: #0f172a;
            margin-right: 8px;
          }
          .record-proto {
            font-family: monospace;
            font-size: 9px;
            color: #475569;
          }
          .sub-banner {
            font-size: 8.8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #1e293b;
            background: #e2e8f0 !important;
            padding: 2.5px 6px;
            border-radius: 3px;
            margin-bottom: 3px;
          }
          .info-table, .data-table {
            width: 100%;
            border-collapse: collapse;
          }
          .info-table td {
            border: 1px solid #cbd5e1;
            padding: 3.5px 6px;
            font-size: 9.5px;
            vertical-align: top;
          }
          .data-table th {
            background: #f1f5f9 !important;
            color: #0f172a !important;
            border: 1px solid #94a3b8;
            padding: 3.5px 5px;
            text-align: left;
            font-size: 8.5px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .data-table td {
            border: 1px solid #cbd5e1;
            padding: 3.5px 5px;
            font-size: 9.2px;
            vertical-align: top;
          }
          .ammo-linked-box {
            margin-top: 5px;
            padding: 5px 6px;
            background: #f8fafc;
            border: 1px solid #94a3b8;
            border-radius: 4px;
          }
          .ammo-linked-title {
            font-size: 9px;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            margin-bottom: 3px;
          }
          .no-ammo-line {
            margin-top: 5px;
            padding: 4px 7px;
            background: #f8fafc;
            border: 1px dashed #cbd5e1;
            border-radius: 4px;
            font-size: 9px;
            color: #475569;
          }
          .badge-active {
            display: inline-block;
            padding: 1.5px 6px;
            border-radius: 3px;
            font-size: 8.5px;
            font-weight: 800;
            background: #d1fae5 !important;
            color: #065f46 !important;
            border: 1px solid #6ee7b7;
            text-transform: uppercase;
          }
          .badge-inactive {
            display: inline-block;
            padding: 1.5px 6px;
            border-radius: 3px;
            font-size: 8.5px;
            font-weight: 800;
            background: #0f172a !important;
            color: #ffffff !important;
            border: 1px solid #0f172a;
            text-transform: uppercase;
          }
          .badge-refused {
            display: inline-block;
            padding: 1.5px 6px;
            border-radius: 3px;
            font-size: 8.5px;
            font-weight: 800;
            background: #fee2e2 !important;
            color: #991b1b !important;
            border: 1px solid #fca5a5;
            text-transform: uppercase;
          }
          .badge-pending {
            display: inline-block;
            padding: 1.5px 6px;
            border-radius: 3px;
            font-size: 8.5px;
            font-weight: 800;
            background: #fef3c7 !important;
            color: #92400e !important;
            border: 1px solid #fcd34d;
            text-transform: uppercase;
          }
          .empty-box {
            padding: 12px;
            text-align: center;
            border: 1px dashed #94a3b8;
            border-radius: 5px;
            color: #475569;
            font-size: 10px;
          }
          .signature-section {
            margin-top: 30px;
            page-break-inside: avoid;
            text-align: center;
          }
          .signature-line {
            width: 280px;
            margin: 0 auto 5px auto;
            border-top: 1px solid #000000;
          }
          .footer-note {
            margin-top: 14px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 5px;
            text-align: center;
            font-size: 8.8px;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <img src="${reportLogo}" alt="Brasão / Logo" class="header-logo" />
          <div class="header-center">
            <h2 class="header-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
            <h3 class="header-unit">
              ${escapeHtml(deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA CIVIL')} • UNIDADE: ${escapeHtml(userUnit?.name || unitSigla)}
            </h3>
            <h1 class="header-doc-title">${escapeHtml(reportDocTitle)}</h1>
            <p class="header-subtitle">${escapeHtml(reportSubtitle)}</p>
          </div>
        </div>

        <div class="summary-bar">
          <span><strong>Unidade:</strong> ${escapeHtml(userUnit?.name || unitSigla)}</span>
          <span><strong>Modalidade:</strong> ${escapeHtml(modalidadeSummary)}</span>
          <span><strong>Emissão:</strong> ${escapeHtml(new Date().toLocaleString('pt-BR'))}</span>
        </div>

        ${entityFocusBannerHtml}
        ${reportBodyHtml}

        <div class="signature-section">
          <div class="signature-line"></div>
          <div style="font-weight: 800; font-size: 11px;">${escapeHtml(currentUser.name)}</div>
          <div style="font-size: 10px; color: #334155;">${escapeHtml(issuerCareer)} • Armeiro Emissor (${escapeHtml(unitSigla)})</div>
          <div style="font-family: monospace; font-weight: 700; font-size: 10px;">MASP: ${escapeHtml(currentUser.masp || 'N/I')}</div>
        </div>

        <div class="footer-note">
          Relatório oficial completo gerado pelo Módulo Cautela de Armas — Unidade ${escapeHtml(unitSigla)} em ${escapeHtml(new Date().toLocaleString('pt-BR'))}
        </div>
      </body>
      </html>
    `;

    setIsArmorerReportModalOpen(false);
    printDocumentInPage(htmlContent);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <Crosshair className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                <h2 className="text-xl font-bold text-slate-100">Cautela de Armas</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currentUser.role}
                </span>
                {userUnit && (
                  <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Unidade: <strong className="text-amber-400">{userUnit.name}</strong>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {canAuthorize 
                  ? `Visualização completa de todas as cautelas da unidade ${userUnit?.name || 'vinculada'} (pendentes, deferidas e indeferidas).`
                  : 'Retirada, autorização por armeiros, controle de carregadores, tiros efetuados e devolução'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canAuthorize ? (
              <button
                type="button"
                onClick={handleOpenArmorerReportModal}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-700/60"
                title="Emitir relatório de cautelas (somente ativas, ativas e inativas, ou somente inativas)"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Emitir Relatório de Cautelas</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenPrintHistoryModal}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-700/60"
                title="Imprimir histórico de cautelas filtrando por data, armas, ativas ou relatório completo"
              >
                <Printer className="w-4 h-4 text-sky-400" />
                <span>Imprimir Histórico</span>
              </button>
            )}
            <button
              onClick={handleOpenNovaSolicitacao}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === 'NOVA'
                  ? 'bg-amber-500 text-slate-950 font-black'
                  : 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold'
              }`}
            >
              <Crosshair className="w-4 h-4" />
              <span>Solicitar Retirada de Arma</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mensagens de Sucesso e Erro */}
      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-4 rounded-xl flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            {lastDirectCautelaArma && (
              <button
                type="button"
                onClick={() => handlePrintTermo(lastDirectCautelaArma)}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 shadow"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Recibo / Termo Imediato</span>
              </button>
            )}
            {lastReceivedReturnInfo && (
              <button
                type="button"
                onClick={() =>
                  handlePrintReciboDevolucao(
                    lastReceivedReturnInfo.cautela,
                    lastReceivedReturnInfo.overrides
                  )
                }
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 shadow"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Reimprimir Recibo da Arma e da Munição</span>
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setSuccessMsg('');
              setLastReceivedReturnInfo(null);
            }}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-200">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerta de Cautela Recusada / Informação ao Policial */}
      {isPolicial && unreadRefusedCautelas.length > 0 && (
        <div className="bg-red-950/90 border-2 border-red-700/80 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-800/60 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-500/20 text-red-400 rounded-xl border border-red-500/40 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-100 flex items-center space-x-2">
                  <span>Comunicado de Recusa de Cautela</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-red-900 text-red-200 border border-red-700 font-mono">
                    {unreadRefusedCautelas.length} indeferida{unreadRefusedCautelas.length > 1 ? 's' : ''}
                  </span>
                </h4>
                <p className="text-xs text-red-300/90">
                  O armeiro recusou a solicitação de cautela. O armamento retornou imediatamente ao status <strong>"No Cofre"</strong> no local de origem.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismissAllRefusals}
              className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-200 text-xs font-semibold rounded-xl border border-red-700 transition self-end sm:self-auto"
            >
              Dispensar Avisos
            </button>
          </div>

          <div className="space-y-2">
            {unreadRefusedCautelas.map(c => {
              const vault = vaultSpaces.find(v => v.id === c.vaultSpaceId);
              return (
                <div
                  key={c.id}
                  className="bg-slate-950/80 border border-red-900/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-100 text-sm">{c.weaponModel}</span>
                      <span className="font-mono text-red-400 font-bold">Série: {c.weaponSerialNumber}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-950 text-red-300 border border-red-800 uppercase font-mono font-bold">
                        Recusada
                      </span>
                    </div>
                    <p className="text-slate-300">
                      Recusada por: <strong className="text-red-200">{c.armorerName || 'Armeiro'}</strong> {c.armorerMasp ? `(MASP: ${c.armorerMasp})` : ''}
                      {!isPolicial && (
                        <> • Retornou ao: <strong className="text-slate-100">{vault ? vault.code : 'Cofre de Origem'}</strong></>
                      )}
                    </p>
                    {c.authorizationNotes && (
                      <p className="text-amber-200/90 italic bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                        <strong>Motivo do Armeiro:</strong> "{c.authorizationNotes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('INDEFERIDAS');
                        setHistoryDecisionFilter('INDEFERIDAS');
                        handleDismissRefusal(c.id);
                      }}
                      className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition shadow-sm"
                    >
                      Ver em Meu Histórico
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissRefusal(c.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
                      title="Dispensar este aviso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('MINHAS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'MINHAS'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>{canAuthorize ? 'Solicitações Pendentes (Unidade)' : 'Cautela de arma em análise'}</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black animate-pulse">
              {pendingCount} {canAuthorize ? (pendingCount === 1 ? 'pendente' : 'pendentes') : 'em análise'}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('DEFERIDAS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'DEFERIDAS'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800 shadow-sm'
              : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-900'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{canAuthorize ? `Deferidas/Ativas ${unitSigla}` : 'Minhas Cautelas'}</span>
          {deferidasCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
              {deferidasCount}
            </span>
          )}
        </button>

        {canAuthorize && (
          <button
            onClick={() => setActiveTab('DEFERIDAS_PROPRIA')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'DEFERIDAS_PROPRIA'
                ? 'bg-teal-950/80 text-teal-300 border border-teal-700 shadow-sm'
                : 'text-slate-400 hover:text-teal-300 hover:bg-slate-900'
            }`}
            title="Cautelas em que o próprio armeiro é o usuário que ficará com a arma"
          >
            <Shield className="w-3.5 h-3.5 text-teal-400" />
            <span>Deferidas/Ativas Própria</span>
            {deferidasPropriaCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/40 font-mono">
                {deferidasPropriaCount}
              </span>
            )}
          </button>
        )}

        {canAuthorize && (
          <button
            onClick={() => setActiveTab('HISTORICO_UNIDADE')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'HISTORICO_UNIDADE'
                ? 'bg-sky-950/80 text-sky-300 border border-sky-700 shadow-sm'
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-900'
            }`}
            title={`Histórico completo de cautelas ativas e devolvidas da unidade ${userUnit?.name || 'COE'}`}
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>{`Histórico de cautelas ${userUnit?.name || 'COE'}`}</span>
            {unitHistoryTotalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono">
                {unitHistoryTotalCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => setActiveTab('INDEFERIDAS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'INDEFERIDAS'
              ? canAuthorize
                ? 'bg-red-950/80 text-red-300 border border-red-800 shadow-sm'
                : 'bg-sky-950/80 text-sky-300 border border-sky-800 shadow-sm'
              : canAuthorize
                ? 'text-slate-400 hover:text-red-300 hover:bg-slate-900'
                : 'text-slate-400 hover:text-sky-300 hover:bg-slate-900'
          }`}
        >
          {canAuthorize ? (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-sky-400" />
          )}
          <span>{canAuthorize ? `Indeferidas ${unitSigla}` : 'Meu Histórico'}</span>
          {canAuthorize ? (
            indeferidasCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 font-mono">
                {indeferidasCount}
              </span>
            )
          ) : (
            meuHistoricoTotalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono">
                {meuHistoricoTotalCount}
              </span>
            )
          )}
        </button>

        <button
          onClick={handleOpenNovaSolicitacao}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ml-auto ${
            activeTab === 'NOVA'
              ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>{canAuthorize ? 'Acautelar Arma' : 'Nova Solicitação'}</span>
        </button>
      </div>

      {/* VIEW: NOVA SOLICITAÇÃO */}
      {activeTab === 'NOVA' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Crosshair className="w-5 h-5 text-amber-400" />
                <span>Solicitação de Cautela de Armamento Individual</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Visualização de todas as armas disponíveis no cofre da sua unidade para solicitação de cautela.
              </p>
            </div>

            {/* Aviso para policial que já possui cautela ativa */}
            {isPolicial && (() => {
              const activeList = scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE');
              if (activeList.length === 0) return null;
              return (
                <div className="p-4 bg-amber-950/40 border border-amber-600/60 rounded-xl space-y-2 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center space-x-3">
                      <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0 mt-0.5 sm:mt-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-300">
                          Atenção: Você já possui {activeList.length === 1 ? '1 cautela de arma ativa' : `${activeList.length} cautelas de armas ativas`} em seu nome
                        </h4>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {activeList.map(c => `${c.weaponModel} (Série: ${c.weaponSerialNumber})`).join(' • ')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoToActiveCautela}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg transition whitespace-nowrap shadow-sm self-end sm:self-center"
                    >
                      Ir para Minha Cautela
                    </button>
                  </div>
                </div>
              );
            })()}

            <form onSubmit={handleRequestCautela} className="space-y-4">
              {/* Opção para Armeiro acautelar diretamente para um policial */}
              {canAuthorize && (
                <div className="p-3.5 bg-slate-950 border border-amber-600/50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="directCautelaArma"
                        checked={isDirectCautela}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsDirectCautela(checked);
                          if (checked && !targetOfficerId && availableUnitOfficers.length > 0) {
                            setTargetOfficerId(availableUnitOfficers[0].id);
                          }
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700"
                      />
                      <label htmlFor="directCautelaArma" className="text-xs font-bold text-amber-400 cursor-pointer">
                        Acautelamento Direto pelo Armeiro (Sem solicitação prévia do policial)
                      </label>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Deduz do cofre e gera recibo imediato</span>
                  </div>

                  {isDirectCautela && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Selecione o Policial Beneficiário (Mesma Unidade) <span className="text-amber-400">*</span>
                      </label>
                      <select
                        value={targetOfficerId}
                        onChange={(e) => setTargetOfficerId(e.target.value)}
                        className="w-full bg-slate-900 border border-amber-600/70 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-amber-200 font-semibold"
                        required
                      >
                        {availableUnitOfficers.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.name} (MASP: {o.masp}) - {o.cargo || o.role}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  1. Selecione a Arma Disponível na Unidade ({userUnitWeapons.length} disponível{userUnitWeapons.length === 1 ? '' : 'is'})
                </label>
                {userUnitWeapons.length === 0 ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                    Não há armas com status "No Cofre" disponíveis na sua unidade no momento.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                    {userUnitWeapons.map(w => {
                      const isSelected = selectedWeaponId === w.id;
                      const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);
                      return (
                        <div
                          key={w.id}
                          onClick={() => {
                            setSelectedWeaponId(w.id);
                            setMagazineQuantity(w.magazineQuantity || 2);
                          }}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                            isSelected
                              ? 'bg-amber-950/70 border-amber-500 shadow-md ring-1 ring-amber-500'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-100">{w.model}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {w.caliber}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-amber-400 mt-0.5">
                              Série: {w.serialNumber}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
                            <span>{isPolicial ? 'Disponível na Unidade' : `Local: ${vault ? vault.code : 'Cofre'}`}</span>
                            <span>{w.magazineQuantity || 1} carregadores</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedWeapon && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200 flex items-center justify-between">
                  <div>
                    Arma selecionada: <strong>{selectedWeapon.model}</strong> (Série: <span className="font-mono">{selectedWeapon.serialNumber}</span>) - Calibre: <strong>{selectedWeapon.caliber}</strong>
                  </div>
                  {!isPolicial && (
                    <div className="text-[10px] text-slate-400">
                      Retorno no cofre: <strong>{vaultSpaces.find(v => v.id === selectedWeapon.vaultSpaceId)?.code || 'Origem'}</strong>
                    </div>
                  )}
                </div>
              )}

              {!isPolicial ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Quantidade de Carregadores
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={magazineQuantity}
                        onChange={(e) => setMagazineQuantity(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        MOTIVO / FINALIDADE DO USO
                      </label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-amber-500 cursor-pointer"
                      >
                        <option value="">Selecione o motivo / finalidade</option>
                        <option value="Treinamento">Treinamento</option>
                        <option value="Operação">Operação</option>
                        <option value="Plantão">Plantão</option>
                        <option value="Serviço Ordinário">Serviço Ordinário</option>
                      </select>
                    </div>
                  </div>

                  {/* Seção de Munições Conjuntas (Armeiro/Admin) */}
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="ammoTogether"
                          checked={requestAmmoTogether}
                          onChange={(e) => setRequestAmmoTogether(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700"
                        />
                        <label htmlFor="ammoTogether" className="text-xs font-bold text-slate-200 cursor-pointer">
                          Acautelar também munições correspondentes do calibre {selectedWeapon?.caliber || ''}
                        </label>
                      </div>
                      <span className="text-[10px] text-slate-400">Alimenta tabelas de Armas e Munições</span>
                    </div>

                    {requestAmmoTogether && (
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3.5">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                              <span>Selecione a Munição no Cofre (Mesmo Calibre {selectedWeapon?.caliber})</span>
                              <span className="text-[10px] text-amber-400 font-mono font-normal">
                                {availableAmmoForSelectedWeapon.length} lote(s) disponível(is)
                              </span>
                            </label>
                            {availableAmmoForSelectedWeapon.length === 0 ? (
                              <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300">
                                Não há munições cadastradas em estoque no calibre <strong>{selectedWeapon?.caliber || 'da arma'}</strong> na sua unidade.
                              </div>
                            ) : (
                              <select
                                value={selectedAmmoStockId}
                                onChange={(e) => {
                                  const found = availableAmmoForSelectedWeapon.find(s => s.id === e.target.value);
                                  setSelectedAmmoStockId(e.target.value);
                                  if (found) {
                                    setAmmoType(found.tipoMunicao || 'Operacional');
                                    setAmmoLot(found.loteMunicao || 'Lote Padrão');
                                    setAmmoQuantity(Math.min(ammoQuantity || 30, found.quantity));
                                  }
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                              >
                                {availableAmmoForSelectedWeapon.map(st => {
                                  const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                                  const cal = calibers.find(c => c.id === st.caliberId);
                                  return (
                                    <option key={st.id} value={st.id}>
                                      Cofre: {vault ? vault.code : 'Cofre'} • Tipo: {st.tipoMunicao || cal?.tipo || 'Padrão'} • Peso: {st.pesoMunicao || cal?.peso || 'N/I'} • Lote: {st.loteMunicao || 'S/L'} • Ano: {st.anoFabricacao || 'N/A'} — Saldo: {st.quantity} un.
                                    </option>
                                  );
                                })}
                              </select>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Quantidade de Munições
                              </label>
                              <input
                                type="number"
                                min="0"
                                max={availableAmmoForSelectedWeapon.find(s => s.id === selectedAmmoStockId)?.quantity || 200}
                                value={ammoQuantity}
                                onChange={(e) => setAmmoQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono font-bold"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Destinação
                              </label>
                              <select
                                value={ammoDestinacao}
                                onChange={(e) => setAmmoDestinacao(e.target.value as 'Defesa' | 'Treinamento')}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium"
                              >
                                <option value="Defesa">Defesa</option>
                                <option value="Treinamento">Treinamento</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Tipo de Retirada
                              </label>
                              <select
                                value={ammoSeraDevolvida ? 'DEVOLVER' : 'PERMANENTE'}
                                onChange={(e) => setAmmoSeraDevolvida(e.target.value === 'DEVOLVER')}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium"
                              >
                                <option value="DEVOLVER">Irá devolver depois</option>
                                <option value="PERMANENTE">Retirada permanente</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      MOTIVO / FINALIDADE DO USO
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition cursor-pointer"
                    >
                      <option value="">Selecione o motivo / finalidade</option>
                      <option value="Treinamento">Treinamento</option>
                      <option value="Operação">Operação</option>
                      <option value="Plantão">Plantão</option>
                      <option value="Serviço Ordinário">Serviço Ordinário</option>
                    </select>
                  </div>

                  {/* Seção Informativa de Munição Desejada ("Desejo solicitar munições") */}
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="policialAmmoRequest"
                        checked={policialWantsAmmo}
                        onChange={(e) => setPolicialWantsAmmo(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700 cursor-pointer"
                      />
                      <label htmlFor="policialAmmoRequest" className="text-xs font-bold text-slate-200 cursor-pointer">
                        Desejo solicitar munições
                      </label>
                    </div>

                    {policialWantsAmmo && (
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3.5 animate-in fade-in">
                        {!selectedWeapon ? (
                          <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Selecione primeiramente uma arma acima para carregar o calibre, os tipos e os pesos de munição disponíveis na unidade.</span>
                          </div>
                        ) : availablePoliceTipos.length === 0 ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Calibre Correspondente
                              </label>
                              <input
                                type="text"
                                readOnly
                                disabled
                                value={selectedWeapon.caliber}
                                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold cursor-not-allowed"
                              />
                            </div>
                            <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
                              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>
                                Não há tipos de munição cadastrados para o calibre <strong>{selectedWeapon.caliber}</strong> disponíveis na sua unidade no momento.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Calibre fixo correspondente ao armamento escolhido */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Calibre Correspondente
                              </label>
                              <input
                                type="text"
                                readOnly
                                disabled
                                value={selectedWeapon.caliber}
                                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold cursor-not-allowed"
                              />
                            </div>

                            {/* Tipo de Munição (somente cadastrados no calibre da arma e disponíveis na unidade) */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Tipo de Munição
                              </label>
                              <select
                                value={policialAmmoTipo}
                                onChange={(e) => setPolicialAmmoTipo(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-amber-500 cursor-pointer"
                              >
                                {availablePoliceTipos.map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>

                            {/* Peso do Projétil (somente cadastrados no tipo do calibre da arma e disponíveis na unidade) */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                                Peso do Projétil
                              </label>
                              <select
                                value={policialAmmoPeso}
                                onChange={(e) => setPolicialAmmoPeso(e.target.value)}
                                disabled={availablePolicePesos.length === 0}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-amber-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {availablePolicePesos.length === 0 ? (
                                  <option value="">Sem peso cadastrado neste tipo</option>
                                ) : (
                                  availablePolicePesos.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                  ))
                                )}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start space-x-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            Esta indicação é <strong>meramente informativa</strong> para a análise do armeiro. <strong>Não gera cautela de munições em conjunto</strong> e <strong>não deduz do cofre</strong>.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1">
                    Ao confirmar, a solicitação ficará marcada como <strong>Cautela Pendente</strong> aguardando autorização do armeiro. O armeiro definirá a entrega de carregadores e terá a opção de acautelar munições junto com a arma.
                  </p>
                </div>
              )}

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('MINHAS')}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedWeaponId || isSubmitting || userUnitWeapons.length === 0}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-md"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>
                    {isSubmitting 
                      ? 'Processando...' 
                      : (isDirectCautela 
                          ? 'Acautelar Arma Imediatamente (Autorização Direta do Armeiro)' 
                          : 'Confirmar Solicitação de Cautela')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW: LISTAGEM DE CAUTELAS */}
      {activeTab !== 'NOVA' && (
        <div className="space-y-4">
          {/* Barra de Filtro e Busca */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className={`relative w-full ${canAuthorize && (activeTab === 'HISTORICO_UNIDADE' || activeTab === 'DEFERIDAS' || activeTab === 'INDEFERIDAS') ? 'sm:flex-1' : 'sm:w-80'}`}>
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={
                    canAuthorize && activeTab === 'HISTORICO_UNIDADE'
                      ? 'Campo aberto: pesquise qualquer dado da arma (modelo, série, marca, calibre, cofre) ou do usuário (nome, MASP, cargo, telefone)...'
                      : canAuthorize && (activeTab === 'DEFERIDAS' || activeTab === 'INDEFERIDAS')
                        ? 'Pesquisar por usuário (nome/MASP), arma ou número de série...'
                        : 'Buscar por arma, série, calibre ou motivo...'
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500"
                />
              </div>

              {/* Sub-filtros para Solicitações Pendentes (Unidade) — Armeiro visualiza solicitações novas e cautelas devolvidas pelos usuários */}
              {canAuthorize && activeTab === 'MINHAS' && (
                <div className="flex items-center space-x-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
                  {[
                    { id: 'TODAS', label: `Todas (${pendingCount})` },
                    { id: 'SOLICITACOES', label: `Solicitações de Cautela (${pendingSolicitacoesCount})` },
                    { id: 'DEVOLUCOES', label: `Cautelas Devolvidas (${pendingDevolucoesCount})` }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPendentesSubFilter(item.id as 'TODAS' | 'SOLICITACOES' | 'DEVOLUCOES')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                        pendentesSubFilter === item.id
                          ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Indicador de Cautelas Ativas para Deferidas/Ativas <Sigla> e Minhas Cautelas */}
              {activeTab === 'DEFERIDAS' && (
                <div className="flex items-center space-x-2 self-start sm:self-auto">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 text-slate-950 shadow-sm whitespace-nowrap">
                    Ativas em Posse ({canAuthorize && displayedCautelas.length !== activeCautelasCount ? `${displayedCautelas.length} de ${activeCautelasCount}` : activeCautelasCount})
                  </span>
                </div>
              )}

              {/* Indicador de Cautelas Ativas para Deferidas/Ativas Própria */}
              {canAuthorize && activeTab === 'DEFERIDAS_PROPRIA' && (
                <div className="flex items-center space-x-2 self-start sm:self-auto">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-black bg-teal-500 text-slate-950 shadow-sm whitespace-nowrap">
                    Ativas em Posse ({activePropriaCount})
                  </span>
                </div>
              )}

              {/* Legenda de Marcadores para Histórico de cautelas <Unidade> (Armeiro) */}
              {canAuthorize && activeTab === 'HISTORICO_UNIDADE' && (
                <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)] shrink-0" />
                    <span>Ativas</span>
                  </span>
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-black text-slate-100 border border-slate-600 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-black ring-2 ring-slate-300 shrink-0" />
                    <span>Devolvidas</span>
                  </span>
                </div>
              )}

              {/* Indicador de Cautelas Indeferidas para Indeferidas <Sigla> (Armeiro) */}
              {canAuthorize && activeTab === 'INDEFERIDAS' && (
                <div className="flex items-center space-x-2 self-start sm:self-auto">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-black bg-red-600 text-white shadow-sm whitespace-nowrap">
                    Indeferidas ({displayedCautelas.length !== indeferidasCount ? `${displayedCautelas.length} de ${indeferidasCount}` : indeferidasCount})
                  </span>
                </div>
              )}

              {/* Sub-filtros de Decisão para "Meu Histórico" (Policial) */}
              {!canAuthorize && activeTab === 'INDEFERIDAS' && (
                <div className="flex items-center space-x-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
                  {[
                    { id: 'TODAS', label: `Todas (${meuHistoricoTotalCount})`, activeClass: 'bg-sky-500 text-slate-950 font-black shadow-sm' },
                    { id: 'ATIVAS', label: `Ativas (${meuHistoricoAtivasCount})`, activeClass: 'bg-emerald-500 text-slate-950 font-black shadow-sm' },
                    { id: 'DEFERIDA', label: `Deferida (${meuHistoricoDeferidasCount})`, activeClass: 'bg-teal-500 text-slate-950 font-black shadow-sm' },
                    { id: 'INDEFERIDAS', label: `Indeferidas (${indeferidasCount})`, activeClass: 'bg-red-500 text-white font-black shadow-sm' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHistoryDecisionFilter(item.id as 'TODAS' | 'ATIVAS' | 'DEFERIDA' | 'INDEFERIDAS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                        historyDecisionFilter === item.id
                          ? item.activeClass
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filtros por Usuário, Arma e Número de Série exclusivos da aba "Deferidas/Ativas <Sigla>" (Armeiro) */}
            {canAuthorize && activeTab === 'DEFERIDAS' && (
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Usuário:
                  </label>
                  <select
                    value={deferidasUserFilter}
                    onChange={(e) => setDeferidasUserFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-emerald-500"
                  >
                    <option value="TODOS">Todos os Usuários ({deferidasUsers.length})</option>
                    {deferidasUsers.map(u => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Arma:
                  </label>
                  <select
                    value={deferidasWeaponFilter}
                    onChange={(e) => setDeferidasWeaponFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-emerald-500"
                  >
                    <option value="TODAS">Todas as Armas ({deferidasWeapons.length})</option>
                    {deferidasWeapons.map(w => (
                      <option key={w.key} value={w.key}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Número de Série:
                  </label>
                  <input
                    type="text"
                    list="deferidas-serial-options"
                    value={deferidasSerialFilter}
                    onChange={(e) => setDeferidasSerialFilter(e.target.value)}
                    placeholder="Digite ou selecione o nº de série..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-emerald-500"
                  />
                  <datalist id="deferidas-serial-options">
                    {deferidasSerialNumbers.map(item => (
                      <option key={item.serial} value={item.serial}>
                        {item.label}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div className="sm:col-span-1 flex items-center justify-end">
                  {(deferidasUserFilter !== 'TODOS' ||
                    deferidasWeaponFilter !== 'TODAS' ||
                    deferidasSerialFilter.trim() !== '' ||
                    searchTerm.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeferidasUserFilter('TODOS');
                        setDeferidasWeaponFilter('TODAS');
                        setDeferidasSerialFilter('');
                        setSearchTerm('');
                      }}
                      className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1 border border-slate-700"
                      title="Limpar filtros de usuário, arma e número de série"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Limpar</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Filtros por Usuário, Arma e Número de Série exclusivos da aba "Indeferidas <Sigla>" (Armeiro) */}
            {canAuthorize && activeTab === 'INDEFERIDAS' && (
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Usuário:
                  </label>
                  <select
                    value={indeferidasUserFilter}
                    onChange={(e) => setIndeferidasUserFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-red-500"
                  >
                    <option value="TODOS">Todos os Usuários ({indeferidasUsers.length})</option>
                    {indeferidasUsers.map(u => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Arma:
                  </label>
                  <select
                    value={indeferidasWeaponFilter}
                    onChange={(e) => setIndeferidasWeaponFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-red-500"
                  >
                    <option value="TODAS">Todas as Armas ({indeferidasWeapons.length})</option>
                    {indeferidasWeapons.map(w => (
                      <option key={w.key} value={w.key}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Número de Série:
                  </label>
                  <input
                    type="text"
                    list="indeferidas-serial-options"
                    value={indeferidasSerialFilter}
                    onChange={(e) => setIndeferidasSerialFilter(e.target.value)}
                    placeholder="Digite ou selecione o nº de série..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-red-500"
                  />
                  <datalist id="indeferidas-serial-options">
                    {indeferidasSerialNumbers.map(item => (
                      <option key={item.serial} value={item.serial}>
                        {item.label}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div className="sm:col-span-1 flex items-center justify-end">
                  {(indeferidasUserFilter !== 'TODOS' ||
                    indeferidasWeaponFilter !== 'TODAS' ||
                    indeferidasSerialFilter.trim() !== '' ||
                    searchTerm.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setIndeferidasUserFilter('TODOS');
                        setIndeferidasWeaponFilter('TODAS');
                        setIndeferidasSerialFilter('');
                        setSearchTerm('');
                      }}
                      className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1 border border-slate-700"
                      title="Limpar filtros de usuário, arma e número de série"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Limpar</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Filtros por Usuários, Armas e Data exclusivos da aba "Histórico de cautelas <Unidade>" (Armeiro) */}
            {canAuthorize && activeTab === 'HISTORICO_UNIDADE' && (
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Usuário:
                  </label>
                  <select
                    value={unitHistoryUserFilter}
                    onChange={(e) => setUnitHistoryUserFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-sky-500"
                  >
                    <option value="TODOS">Todos os Usuários ({unitHistoryUsers.length})</option>
                    {unitHistoryUsers.map(u => (
                      <option key={u.key} value={u.key}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Arma:
                  </label>
                  <select
                    value={unitHistoryWeaponFilter}
                    onChange={(e) => setUnitHistoryWeaponFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-sky-500"
                  >
                    <option value="TODAS">Todas as Armas ({unitHistoryWeapons.length})</option>
                    {unitHistoryWeapons.map(w => (
                      <option key={w.key} value={w.key}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Data:
                  </label>
                  <input
                    type="date"
                    value={unitHistoryDateFilter}
                    onChange={(e) => setUnitHistoryDateFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-sky-500"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-end">
                  {(unitHistoryUserFilter !== 'TODOS' ||
                    unitHistoryWeaponFilter !== 'TODAS' ||
                    unitHistoryDateFilter ||
                    searchTerm.trim()) && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnitHistoryUserFilter('TODOS');
                        setUnitHistoryWeaponFilter('TODAS');
                        setUnitHistoryDateFilter('');
                        setSearchTerm('');
                      }}
                      className="w-full sm:w-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1.5 border border-slate-700"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Limpar</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Filtros por Arma, por Data e Ações de Impressão exclusivos da aba "Meu Histórico" (Policial) */}
            {!canAuthorize && activeTab === 'INDEFERIDAS' && (
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Arma:
                  </label>
                  <select
                    value={historyWeaponFilter}
                    onChange={(e) => setHistoryWeaponFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-sky-500"
                  >
                    <option value="TODAS">Todas as Armas ({userHistoryWeapons.length})</option>
                    {userHistoryWeapons.map(w => (
                      <option key={w.key} value={w.key}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Filtrar por Data:
                  </label>
                  <input
                    type="date"
                    value={historyDateFilter}
                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-sky-500"
                  />
                </div>

                <div className="sm:col-span-5 flex flex-wrap items-center justify-end gap-2">
                  {(historyWeaponFilter !== 'TODAS' || historyDateFilter || historyDecisionFilter !== 'TODAS' || searchTerm.trim()) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryWeaponFilter('TODAS');
                        setHistoryDateFilter('');
                        setHistoryDecisionFilter('TODAS');
                        setSearchTerm('');
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 border border-slate-700"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Limpar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleOpenPrintHistoryModal}
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-slate-950 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-sm"
                    title="Abrir opções para imprimir histórico filtrado por data, armas, ativas ou relatório completo"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Histórico</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintPolicialHistory(true)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                    title="Imprimir relatório completo com ativas, devolvidas e indeferidas de todo o período"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Relatório Completo</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lista de Registros */}
          {scopedCautelas.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              <Crosshair className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhuma cautela de armamento encontrada.</p>
              <p className="text-xs text-slate-500 mt-1">Utilize o botão "Solicitar Retirada de Arma" para registrar uma nova cautela.</p>
            </div>
          ) : (
            <div className="space-y-6">
                  {/* Conteúdo das Abas */}

                  {/* Seção: Cautela de arma em análise (Policial) / Solicitações Pendentes (Armeiro) */}
                  {activeTab === 'MINHAS' && (() => {
                    const pendentes = displayedCautelas.filter(c => isPendingStatus(c.status));
                    const devolucoesPendentes = displayedCautelas.filter(c =>
                      (c.status || '').trim().toUpperCase() === 'DEVOLUCAO_PENDENTE' ||
                      (c.status || '').trim().toUpperCase() === 'DEVOLUÇÃO PENDENTE'
                    );

                    if (pendentes.length === 0 && devolucoesPendentes.length === 0) {
                      return (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                          <Clock className="w-8 h-8 text-amber-500/50 mx-auto mb-2" />
                          <p className="text-sm font-semibold">
                            {canAuthorize
                              ? 'Nenhuma solicitação ou devolução de armamento pendente na unidade.'
                              : 'Nenhuma cautela de arma em análise no momento.'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {isPolicial 
                              ? 'Não há cautelas de armas aguardando comando do armeiro (autorização ou recibo de devolução).' 
                              : `Não há solicitações nem devoluções aguardando comando para a unidade ${userUnit?.name || 'vinculada'}.`}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-6">
                        {/* Devoluções Aguardando Recibo pelo Armeiro (Visível para Policial e Armeiro) */}
                        {devolucoesPendentes.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                              <div className="flex items-center space-x-2">
                                <RotateCcw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                                  {canAuthorize
                                    ? `Cautelas Devolvidas pelos Usuários — Aguardando Recebimento (${userUnit?.name || 'Unidade'})`
                                    : 'Cautelas em Análise de Devolução (Aguardando Recibo do Armeiro)'}
                                </h4>
                              </div>
                              <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/70 px-2.5 py-0.5 rounded-md border border-amber-700/70">
                                {devolucoesPendentes.length} aguardando recebimento
                              </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                              {devolucoesPendentes.map(cautela => {
                                const ammoDetails = getRescuedAmmoDetails(cautela);
                                const armorerInfo = getResolvedArmorer(cautela);
                                const requesterInfo = getResolvedRequester(cautela);
                                return (
                                  <div
                                    key={`ret-pend-${cautela.id}`}
                                    className="bg-slate-900 border border-amber-500/50 rounded-2xl p-4 sm:p-5 space-y-3 shadow-md ring-1 ring-amber-500/20"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                      <div className="flex items-center space-x-3">
                                        <div className="p-2.5 rounded-xl border bg-amber-500/15 border-amber-500/40 text-amber-400">
                                          <RotateCcw className="w-5 h-5" />
                                        </div>
                                        <div>
                                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                            <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                            <span className="font-mono text-xs text-amber-400 font-bold">
                                              Nº {cautela.weaponSerialNumber}
                                            </span>
                                            {cautela.weaponCaliber && (
                                              <span className="font-mono text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                                {cautela.weaponCaliber}
                                              </span>
                                            )}
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse">
                                              Devolvida pelo Usuário
                                            </span>
                                          </div>
                                          <p className="text-xs text-amber-300/90 mt-1 flex items-center space-x-1.5 font-medium">
                                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                                            <span>Aguardando conferência dos dados, definição de local no cofre e recebimento pelo Armeiro</span>
                                          </p>
                                          <p className="text-[11px] text-slate-400 mt-0.5">
                                            Solicitante: <strong className="text-amber-300 font-semibold">{requesterInfo.name}</strong> <span className="font-mono text-amber-400">(MASP: {requesterInfo.masp})</span> • Autorizado originalmente por: <strong className="text-slate-300">{armorerInfo.name}</strong>
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center space-x-2 self-end sm:self-center">
                                        <button
                                          onClick={() => handlePrintTermo(cautela)}
                                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                          title="Imprimir Termo de Cautela"
                                        >
                                          <Printer className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Imprimir Termo</span>
                                        </button>

                                        {canAuthorize ? (
                                          <button
                                            onClick={() => handleOpenReturnModal(cautela)}
                                            className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black transition shadow-md"
                                            title="Conferir dados da devolução, definir local no cofre e gerar recibo da arma e da munição"
                                          >
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Receber</span>
                                          </button>
                                        ) : (
                                          <span className="px-3 py-1.5 bg-amber-950/70 border border-amber-800 text-amber-300 text-xs font-bold rounded-xl flex items-center space-x-1.5">
                                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                            <span>Aguardando Recibo do Armeiro</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Disparos Informados</span>
                                        <span className="font-bold text-slate-200">
                                          {cautela.hadShots ? `${cautela.shotsFired || 0} tiro(s)` : 'Zero disparos'}
                                        </span>
                                      </div>
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Carregadores Devolvidos</span>
                                        <span className="font-bold text-slate-200">{cautela.returnedMagazinesCount ?? cautela.magazineQuantity} un.</span>
                                      </div>
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Condição Relatada</span>
                                        <span className={`font-bold ${cautela.isWorking !== false ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {cautela.isWorking !== false ? 'Em Condições' : 'Com Defeito'}
                                        </span>
                                      </div>
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Munição Vinculada</span>
                                        <span className="font-bold text-amber-300">
                                          {ammoDetails.hasAmmo
                                            ? ammoDetails.seraDevolvida
                                              ? `${cautela.returnedAmmoQuantity ?? Math.max(0, ammoDetails.quantity - (cautela.shotsFired || 0))}/${ammoDetails.quantity} devolvidas`
                                              : `${ammoDetails.quantity} un. (Permanente)`
                                            : 'Sem munição'}
                                        </span>
                                      </div>
                                    </div>

                                    {ammoDetails.hasAmmo && ammoDetails.quantity > 0 && (
                                      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5 flex-wrap gap-2">
                                          <span className="font-bold text-amber-300 flex items-center space-x-1.5">
                                            <Disc className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Dados da Munição / Cautela Vinculada</span>
                                          </span>
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                            ammoDetails.seraDevolvida
                                              ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                                              : 'bg-slate-800 text-slate-300 border-slate-700'
                                          }`}>
                                            {ammoDetails.seraDevolvida ? 'Passiva de Devolução' : 'Retirada Permanente'}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                          <div>
                                            <span className="text-slate-500 block">Calibre / Fabricante:</span>
                                            <strong className="text-slate-200">{ammoDetails.caliberName} • {ammoDetails.fabricante}</strong>
                                          </div>
                                          <div>
                                            <span className="text-slate-500 block">Tipo / Peso:</span>
                                            <strong className="text-slate-200">{ammoDetails.tipoMunicao} • {ammoDetails.pesoMunicao}</strong>
                                          </div>
                                          <div>
                                            <span className="text-slate-500 block">Lote:</span>
                                            <strong className="text-slate-200 font-mono">{ammoDetails.loteMunicao}</strong>
                                          </div>
                                          <div>
                                            <span className="text-slate-500 block">Destinação:</span>
                                            <strong className="text-slate-200">{ammoDetails.destinacao}</strong>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {pendentes.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                              <div className="flex items-center space-x-2">
                                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                  {canAuthorize 
                                    ? `Solicitações Pendentes de Armamento — ${userUnit?.name || 'Unidade'} (Aguardando Ação do Armeiro)` 
                                    : 'Cautelas de Arma em Análise (Aguardando Autorização do Armeiro)'}
                                </h4>
                              </div>
                              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded-md border border-amber-800/60">
                                {pendentes.length} aguardando comando
                              </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                              {pendentes.map(cautela => {
                                const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);
                                const returnVaultId = cautela.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
                                const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
                                const returnUnit = units.find(u => u.id === returnVault?.unitId);
                                const returnVaultAddress = returnVault 
                                  ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}` 
                                  : 'Cofre de Origem';

                                const linkedAmmo = getLinkedAmmoForCautela(cautela);
                                const hasAmmo = Boolean(cautela.ammoQuantity || cautela.linkedAmmoCautelaId || linkedAmmo);
                                const requesterInfo = getResolvedRequester(cautela);

                                return (
                                  <div
                                    key={cautela.id}
                                    className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-3 shadow-md ring-1 ring-amber-500/20"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                      <div className="flex items-center space-x-3">
                                        <div className="p-2.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400">
                                          <Clock className="w-5 h-5 animate-pulse" />
                                        </div>
                                        <div>
                                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                            <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                            <span className="font-mono text-xs text-amber-400 font-bold">
                                              Nº {cautela.weaponSerialNumber}
                                            </span>
                                            {cautela.weaponCaliber && (
                                              <span className="font-mono text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                                {cautela.weaponCaliber}
                                              </span>
                                            )}
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse flex items-center space-x-1">
                                              <span>●</span>
                                              <span>Aguardando Cautela</span>
                                            </span>
                                          </div>
                                          <p className="text-xs text-amber-300/90 mt-1 flex items-center space-x-1.5 font-medium">
                                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                                            <span>Aguardando resposta do Armeiro para autorização e liberação do armamento</span>
                                          </p>
                                          <p className="text-[11px] text-slate-400 mt-0.5">
                                            Solicitante: <strong className="text-amber-300 font-semibold">{requesterInfo.name}</strong> <span className="font-mono text-amber-400">(MASP: {requesterInfo.masp})</span> • Solicitado em {new Date(cautela.requestDate).toLocaleString('pt-BR')}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center space-x-2 self-end sm:self-center">
                                        {canAuthorize ? (
                                          <>
                                            <button
                                              onClick={() => handleOpenAuthorize(cautela)}
                                              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-md"
                                              title="Autorizar cautela e liberar arma para o policial"
                                            >
                                              <Check className="w-4 h-4" />
                                              <span>Autorizar Cautela</span>
                                            </button>
                                            <button
                                              onClick={() => setNotesModal({ 
                                                id: cautela.id, 
                                                action: 'RECUSAR',
                                                weaponId: cautela.weaponId,
                                                weaponSerialNumber: cautela.weaponSerialNumber
                                              })}
                                              className="flex items-center space-x-1 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 rounded-xl text-xs font-semibold transition"
                                              title="Recusar solicitação e retornar arma ao cofre"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                              <span>Recusar</span>
                                            </button>
                                          </>
                                        ) : (
                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenEditPendingCautela(cautela)}
                                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 hover:border-amber-400 text-amber-200 rounded-xl text-xs font-bold transition shadow-sm"
                                              title="Editar solicitação de cautela enquanto o armeiro da unidade não deferir ou indeferir"
                                            >
                                              <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                                              <span>Editar Cautela</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setCancelPendingModal(cautela)}
                                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700 hover:border-red-500 text-red-200 rounded-xl text-xs font-bold transition shadow-sm"
                                              title="Excluir solicitação de cautela enquanto o armeiro da unidade não deferir ou indeferir"
                                            >
                                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                              <span>Excluir Cautela</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">{isPolicial ? 'Unidade' : 'Cofre de Origem'}</span>
                                        <span className="font-mono text-slate-200 font-bold truncate block">
                                          {isPolicial ? (returnUnit?.name || userUnit?.name || 'Unidade Policial') : returnVaultAddress}
                                        </span>
                                      </div>
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Carregadores</span>
                                        <span className="font-bold text-slate-200">{cautela.magazineQuantity} unidade(s)</span>
                                      </div>
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Data da Solicitação</span>
                                        <span className="text-slate-300">{new Date(cautela.requestDate).toLocaleString('pt-BR')}</span>
                                      </div>
                                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Policial Solicitante</span>
                                        <span className="text-slate-200 font-semibold truncate block" title={requesterInfo.name}>
                                          {requesterInfo.name}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Sugestão de Munição (OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS) e opção "Desejo solicitar munições" */}
                                    {(() => {
                                      const sugestaoMunicao = (cautela.authorizationNotes || '').trim();
                                      const marcouDesejoMunicoes = Boolean(sugestaoMunicao) || hasAmmo;

                                      if (!canAuthorize && !sugestaoMunicao) return null;

                                      return (
                                        <div
                                          className={`p-3 rounded-xl space-y-1.5 text-xs border ${
                                            marcouDesejoMunicoes
                                              ? 'bg-amber-950/25 border-amber-800/50'
                                              : 'bg-slate-950/70 border-slate-800/80'
                                          }`}
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center space-x-2 font-bold text-amber-300">
                                              <Disc className={`w-3.5 h-3.5 ${marcouDesejoMunicoes ? 'text-amber-400' : 'text-slate-500'}`} />
                                              <span className={marcouDesejoMunicoes ? 'text-amber-300' : 'text-slate-300'}>
                                                Sugestão de munição:
                                              </span>
                                            </div>
                                            <span
                                              className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                                                marcouDesejoMunicoes
                                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                                  : 'bg-slate-900 text-slate-400 border-slate-700'
                                              }`}
                                            >
                                              Desejo solicitar munições: {marcouDesejoMunicoes ? 'Sim' : 'Não'}
                                            </span>
                                          </div>
                                          <p
                                            className={`font-mono text-[11px] pl-5 ${
                                              sugestaoMunicao ? 'text-amber-200/95 font-semibold' : 'text-slate-500 italic'
                                            }`}
                                          >
                                            {sugestaoMunicao || 'Nenhuma sugestão de munição informada pelo solicitante.'}
                                          </p>
                                        </div>
                                      );
                                    })()}

                                    {/* Munições solicitadas em conjunto */}
                                    {hasAmmo && (() => {
                                      const qty = cautela.ammoQuantity || linkedAmmo?.quantity || 0;
                                      const fab = cautela.ammoFabricante || linkedAmmo?.fabricante || 'CBC';
                                      const cal = cautela.weaponCaliber || linkedAmmo?.caliberName || 'Padrão';
                                      const tip = cautela.ammoTipo || linkedAmmo?.tipoMunicao || 'Operacional';
                                      const pes = cautela.ammoPeso || linkedAmmo?.pesoMunicao || '124gr';
                                      const lot = cautela.ammoLote || linkedAmmo?.loteMunicao || 'Lote Unidade';
                                      const des = cautela.ammoDestinacao || linkedAmmo?.destinacao || 'Defesa';

                                      return (
                                        <div className="p-3 bg-amber-950/20 border border-amber-800/50 rounded-xl space-y-1.5 text-xs">
                                          <div className="flex items-center justify-between border-b border-amber-800/40 pb-1.5">
                                            <span className="font-bold text-amber-300 flex items-center space-x-1.5">
                                              <Disc className="w-3.5 h-3.5 text-amber-400" />
                                              <span>Munições Solicitadas em Conjunto</span>
                                            </span>
                                            <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700">
                                              {qty} munições
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                            <div>
                                              <span className="text-slate-500 block">Fabricante / Calibre:</span>
                                              <strong className="text-slate-200">{fab} • {cal}</strong>
                                            </div>
                                            <div>
                                              <span className="text-slate-500 block">Tipo / Peso:</span>
                                              <strong className="text-slate-200">{tip} • {pes}</strong>
                                            </div>
                                            <div>
                                              <span className="text-slate-500 block">Lote:</span>
                                              <strong className="text-slate-200 font-mono">{lot}</strong>
                                            </div>
                                            <div>
                                              <span className="text-slate-500 block">Destinação:</span>
                                              <strong className="text-slate-200">{des}</strong>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {(() => {
                                      const motivoSolicitado = getResolvedMotivoFinalidade(cautela);
                                      if (!motivoSolicitado) return null;
                                      return (
                                        <p className="text-xs text-slate-300">
                                          Motivo/Finalidade: <strong className="text-slate-100">{motivoSolicitado}</strong>
                                        </p>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Seção: Minhas Cautelas Ativas em Posse (Policial) / Cautelas Ativas da Unidade ou Próprias (Armeiro) */}
                  {(activeTab === 'DEFERIDAS' || (canAuthorize && activeTab === 'DEFERIDAS_PROPRIA')) && (() => {
                    const isPropriaView = canAuthorize && activeTab === 'DEFERIDAS_PROPRIA';
                    const ativasList = displayedCautelas.filter(c => c.status === 'AUTORIZADA' || (canAuthorize && c.status === 'DEVOLUCAO_PENDENTE'));
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${isPropriaView ? 'bg-teal-400' : 'bg-emerald-500'}`}></span>
                            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                              {isPropriaView
                                ? `Deferidas/Ativas Própria — Armas Acauteladas pelo Próprio Armeiro (${currentUser.name})`
                                : canAuthorize
                                  ? `Deferidas/Ativas ${unitSigla} — Armamentos Acautelados`
                                  : 'Minhas Cautelas — Ativas em Posse'}
                            </h4>
                          </div>
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
                            isPropriaView
                              ? 'text-teal-300 bg-teal-950/60 border-teal-800/60'
                              : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                          }`}>
                            {ativasList.length} arma(s) ativa(s)
                          </span>
                        </div>

                        {ativasList.length === 0 ? (
                          <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400 space-y-2">
                            <p>
                              {isPropriaView
                                ? `Nenhuma cautela ativa em que você (${currentUser.name}) seja o usuário detentor da arma no momento.`
                                : canAuthorize
                                  ? activeCautelasCount > 0
                                    ? 'Nenhuma cautela ativa encontrada para os filtros informados (usuário, arma ou número de série).'
                                    : `Nenhum armamento da unidade ${unitSigla} está acautelado para outros policiais no momento.`
                                  : 'Você não possui nenhuma arma acautelada ativa no momento.'}
                            </p>
                            {canAuthorize &&
                              !isPropriaView &&
                              activeCautelasCount > 0 &&
                              (deferidasUserFilter !== 'TODOS' ||
                                deferidasWeaponFilter !== 'TODAS' ||
                                deferidasSerialFilter.trim() !== '' ||
                                searchTerm.trim() !== '') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeferidasUserFilter('TODOS');
                                    setDeferidasWeaponFilter('TODAS');
                                    setDeferidasSerialFilter('');
                                    setSearchTerm('');
                                  }}
                                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700"
                                >
                                  <X className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Limpar filtros</span>
                                </button>
                              )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {ativasList.map(cautela => {
                              const isDevPendente = cautela.status === 'DEVOLUCAO_PENDENTE';
                              const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);
                              const returnVaultId = cautela.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
                              const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
                              const returnUnit = units.find(u => u.id === returnVault?.unitId);
                              const returnVaultAddress = returnVault 
                                ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}` 
                                : 'Cofre de Origem';

                              const ammoDetails = getRescuedAmmoDetails(cautela);
                              const armorerInfo = getResolvedArmorer(cautela);
                              const requesterInfo = getResolvedRequester(cautela);

                              return (
                                <div
                                  key={cautela.id}
                                  className={`bg-slate-900 rounded-2xl p-4 sm:p-5 transition space-y-3 shadow-sm ${
                                    isDevPendente
                                      ? 'border border-amber-500/50 ring-1 ring-amber-500/20'
                                      : 'border border-emerald-800/40 hover:border-emerald-700/60 ring-1 ring-emerald-500/10'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                    <div className="flex items-center space-x-3">
                                      <div className={`p-2.5 rounded-xl border ${
                                        isDevPendente
                                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      }`}>
                                        {isDevPendente ? <Clock className="w-5 h-5 animate-pulse" /> : <Crosshair className="w-5 h-5" />}
                                      </div>
                                      <div>
                                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                          <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                          <span className="font-mono text-xs text-amber-400 font-bold">
                                            Nº {cautela.weaponSerialNumber}
                                          </span>
                                          {isDevPendente ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse">
                                              Devolução Pendente de Recibo pelo Armeiro
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                              Acautelada (Ativa)
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                          Solicitante: <strong className="text-slate-200">{requesterInfo.name}</strong> <span className="font-mono text-slate-300">(MASP: {requesterInfo.masp})</span> • {requesterInfo.cargo}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                                      {canAuthorize && !isDevPendente && (() => {
                                        const editWin = getActiveCautelaEditWindow(cautela);
                                        return editWin.canEdit ? (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditActiveCautela(cautela)}
                                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                            title="Editar cautela (permitido em até 15 minutos após a autorização)"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                            <span>Editar ({editWin.remainingLabel})</span>
                                          </button>
                                        ) : (
                                          <span
                                            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 text-slate-500 rounded-xl text-[11px] font-semibold cursor-not-allowed select-none"
                                            title="O prazo de 15 minutos após a autorização foi encerrado. Esta cautela não pode mais ser alterada."
                                          >
                                            <Lock className="w-3.5 h-3.5 text-slate-600" />
                                            <span>Edição encerrada (15 min)</span>
                                          </span>
                                        );
                                      })()}

                                      <button
                                        onClick={() => handlePrintTermo(cautela)}
                                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                        title="Imprimir Termo de Cautela de Armamento"
                                      >
                                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Imprimir Termo</span>
                                      </button>

                                      {isDevPendente ? (
                                        canAuthorize ? (
                                          <button
                                            onClick={() => handleOpenReturnModal(cautela)}
                                            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-black transition shadow-md"
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Confirmar Recibo de Devolução</span>
                                          </button>
                                        ) : (
                                          <span className="px-3 py-1.5 bg-amber-950/70 border border-amber-700/80 text-amber-300 rounded-xl text-xs font-bold flex items-center space-x-1.5">
                                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                            <span>Aguardando Recibo do Armeiro</span>
                                          </span>
                                        )
                                      ) : (
                                        <button
                                          onClick={() => handleOpenReturnModal(cautela)}
                                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          <span>Devolver ao Cofre</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">{isPolicial ? 'Unidade de Retorno' : 'Cofre de Retorno'}</span>
                                      <span className="font-mono text-slate-200 font-bold truncate block" title={isPolicial ? (returnUnit?.name || userUnit?.name || 'Unidade Policial') : (returnVault ? `Cofre ${returnVault.code} - ${returnUnit?.name || 'Unidade'}` : 'Cofre de Origem')}>
                                        {isPolicial ? (returnUnit?.name || userUnit?.name || 'Unidade Policial') : returnVaultAddress}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Carregadores</span>
                                      <span className="font-bold text-slate-200">{cautela.magazineQuantity} unidade(s)</span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Data da Retirada</span>
                                      <span className="text-slate-300">
                                        {cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Autorizador</span>
                                      <span className="text-slate-200 font-semibold truncate block" title={armorerInfo.label}>
                                        {armorerInfo.label}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Resumo da Devolução Informada pelo Policial quando Pendente de Recibo */}
                                  {isDevPendente && (
                                    <div className="p-3 bg-amber-950/25 border border-amber-700/50 rounded-xl space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between border-b border-amber-800/40 pb-1">
                                        <span className="font-bold text-amber-300 flex items-center space-x-1.5">
                                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Dados Informados na Devolução (Aguardando Conferência e Recibo do Armeiro)</span>
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                        <div>
                                          <span className="text-slate-400 block">Disparos Efetuados:</span>
                                          <strong className="text-slate-100">{cautela.hadShots ? `${cautela.shotsFired || 0} tiro(s)` : 'Zero tiros'}</strong>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block">Condição da Arma:</span>
                                          <strong className={cautela.isWorking !== false ? 'text-emerald-300' : 'text-red-300'}>
                                            {cautela.isWorking !== false ? 'Em Condições' : 'Apresenta Defeito'}
                                          </strong>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block">Carregadores Devolvidos:</span>
                                          <strong className="text-slate-100">{cautela.returnedMagazinesCount ?? cautela.magazineQuantity} un.</strong>
                                        </div>
                                        {ammoDetails.hasAmmo && ammoDetails.seraDevolvida && (
                                          <div>
                                            <span className="text-slate-400 block">Munições Devolvidas:</span>
                                            <strong className="text-amber-300 font-mono">
                                              {cautela.returnedAmmoQuantity ?? Math.max(0, ammoDetails.quantity - (cautela.shotsFired || 0))} de {ammoDetails.quantity} un.
                                            </strong>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Munição Vinculada (Fabricante, Calibre, Tipo, Peso, Lote, Quantidade e Destinação) */}
                                  {ammoDetails.hasAmmo && ammoDetails.quantity > 0 ? (
                                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5 flex-wrap gap-2">
                                        <span className="font-bold text-amber-300 flex items-center space-x-1.5">
                                          <Disc className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Munição Vinculada à Cautela da Arma</span>
                                        </span>
                                        <div className="flex items-center space-x-2">
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                            ammoDetails.seraDevolvida
                                              ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                                              : 'bg-slate-800 text-slate-300 border-slate-700'
                                          }`}>
                                            {ammoDetails.seraDevolvida ? 'Passiva de Devolução' : 'Retirada Permanente'}
                                          </span>
                                          <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                                            {ammoDetails.quantity} munições
                                          </span>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                        <div>
                                          <span className="text-slate-500 block">Fabricante / Calibre:</span>
                                          <strong className="text-slate-200">{ammoDetails.fabricante} • {ammoDetails.caliberName}</strong>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block">Tipo / Peso:</span>
                                          <strong className="text-slate-200">{ammoDetails.tipoMunicao} • {ammoDetails.pesoMunicao}</strong>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block">Lote:</span>
                                          <strong className="text-slate-200 font-mono">{ammoDetails.loteMunicao}</strong>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block">Destinação:</span>
                                          <strong className="text-slate-200">{ammoDetails.destinacao}</strong>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2.5 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl text-xs flex items-center justify-between text-slate-400">
                                      <span className="flex items-center space-x-1.5">
                                        <Disc className="w-3.5 h-3.5 text-slate-600" />
                                        <span>Munições Associadas: <strong className="text-slate-300">Nenhuma munição vinculada</strong> (Apenas arma e carregadores)</span>
                                      </span>
                                      <span className="text-[11px] font-mono text-slate-500">0 un.</span>
                                    </div>
                                  )}

                                  {cautela.reason && (
                                    <p className="text-xs text-slate-400 italic">
                                      Motivo: "{cautela.reason}"
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Seção: "Meu Histórico" (Policial) / "Solicitações Indeferidas" (Armeiro) */}
                  {activeTab === 'INDEFERIDAS' && (() => {
                    if (canAuthorize) {
                      const recusadas = displayedCautelas.filter(c => c.status === 'RECUSADA');
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                            <div className="flex items-center space-x-2">
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                              <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">
                                {`Indeferidas ${unitSigla} — Solicitações Recusadas`}
                              </h4>
                            </div>
                            <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800/60">
                              {recusadas.length} recusada(s)
                            </span>
                          </div>

                          {recusadas.length === 0 ? (
                            <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400 space-y-2">
                              <p>
                                {indeferidasCount > 0
                                  ? 'Nenhuma cautela indeferida encontrada para os filtros informados (usuário, arma ou número de série).'
                                  : `Nenhuma solicitação de armamento foi indeferida na unidade ${unitSigla}.`}
                              </p>
                              {indeferidasCount > 0 &&
                                (indeferidasUserFilter !== 'TODOS' ||
                                  indeferidasWeaponFilter !== 'TODAS' ||
                                  indeferidasSerialFilter.trim() !== '' ||
                                  searchTerm.trim() !== '') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIndeferidasUserFilter('TODOS');
                                      setIndeferidasWeaponFilter('TODAS');
                                      setIndeferidasSerialFilter('');
                                      setSearchTerm('');
                                    }}
                                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700"
                                  >
                                    <X className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Limpar filtros</span>
                                  </button>
                                )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3">
                              {recusadas.map(cautela => {
                                const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);
                                const requesterInfo = getResolvedRequester(cautela);

                                return (
                                  <div
                                    key={cautela.id}
                                    className="bg-slate-900 border border-red-900/40 rounded-2xl p-4 sm:p-5 space-y-3 opacity-90"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                      <div className="flex items-center space-x-3">
                                        <div className="p-2.5 rounded-xl border bg-red-500/10 border-red-500/20 text-red-400">
                                          <Crosshair className="w-5 h-5" />
                                        </div>
                                        <div>
                                          <div className="flex items-center space-x-2">
                                            <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                            <span className="font-mono text-xs text-red-400 font-bold">
                                              Nº {cautela.weaponSerialNumber}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-red-500/20 text-red-300 border-red-500/30">
                                              Recusada
                                            </span>
                                          </div>
                                          <p className="text-xs text-slate-400 mt-0.5">
                                            Solicitante: <strong className="text-slate-200">{requesterInfo.name}</strong> (MASP: {requesterInfo.masp}) • Arma retornada ao cofre: <strong className="text-slate-200">{vault ? vault.code : 'No Cofre de Origem'}</strong>
                                          </p>
                                        </div>
                                      </div>

                                      <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/40 px-3 py-1.5 rounded-xl">
                                        Recusada por {cautela.armorerName || 'Armeiro'} {cautela.armorerMasp ? `(MASP: ${cautela.armorerMasp})` : ''}
                                      </div>
                                    </div>

                                    {cautela.authorizationNotes && (
                                      <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-red-300">
                                        <strong>Motivo da Recusa:</strong> {cautela.authorizationNotes}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Visão do Policial: "Meu Histórico" (Histórico de Armas completo em seu nome, com cautela ativa fixa em 1º lugar como ATIVA)
                    const historicoList = displayedCautelas;

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-3.5 h-3.5 text-sky-400" />
                            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                              Meu Histórico — Histórico Completo de Cautelas de Armas
                            </h4>
                          </div>
                          <span className="text-xs font-mono font-bold text-sky-300 bg-sky-950/60 px-2.5 py-0.5 rounded-md border border-sky-800/60">
                            {historicoList.length} registro(s)
                          </span>
                        </div>

                        {historicoList.length === 0 ? (
                          <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                            <FileText className="w-7 h-7 text-slate-600 mx-auto" />
                            <p className="font-semibold text-slate-300">
                              Nenhum registro de cautela encontrado para os filtros selecionados.
                            </p>
                            {(historyWeaponFilter !== 'TODAS' || historyDateFilter || historyDecisionFilter !== 'TODAS' || searchTerm.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryWeaponFilter('TODAS');
                                  setHistoryDateFilter('');
                                  setHistoryDecisionFilter('TODAS');
                                  setSearchTerm('');
                                }}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-xs font-bold transition"
                              >
                                Exibir todo o histórico
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {historicoList.map(cautela => {
                              const isAtiva = cautela.status === 'AUTORIZADA';
                              const isDevolvida = cautela.status === 'DEVOLVIDA';
                              const isDevPendente = cautela.status === 'DEVOLUCAO_PENDENTE';
                              const isRecusada = cautela.status === 'RECUSADA';
                              const isPendente = isPendingStatus(cautela.status);
                              const isDeferida = isAtiva || isDevolvida || isDevPendente;

                              const cautelaUnit = units.find(u => u.id === cautela.unitId) || userUnit;
                              const armorerInfo = getResolvedArmorer(cautela);
                              const ammoDetails = getRescuedAmmoDetails(cautela);

                              return (
                                <div
                                  key={`hist-${cautela.id}`}
                                  className={`bg-slate-900 rounded-2xl p-4 sm:p-5 space-y-3 transition ${
                                    isAtiva
                                      ? 'border-2 border-emerald-500/70 ring-2 ring-emerald-500/20 shadow-lg'
                                      : isRecusada
                                        ? 'border border-red-900/50 opacity-95'
                                        : isDevPendente || isPendente
                                          ? 'border border-amber-600/40'
                                          : 'border border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                    <div className="flex items-center space-x-3">
                                      <div className={`p-2.5 rounded-xl border ${
                                        isAtiva
                                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                          : isRecusada
                                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                            : isDevPendente || isPendente
                                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                              : 'bg-slate-800 border-slate-700 text-slate-300'
                                      }`}>
                                        <Crosshair className="w-5 h-5" />
                                      </div>

                                      <div>
                                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                          {isAtiva && (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500 text-slate-950 shadow-sm tracking-wider">
                                              ● ATIVA
                                            </span>
                                          )}

                                          <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                          <span className="font-mono text-xs text-amber-400 font-bold">
                                            Nº {cautela.weaponSerialNumber}
                                          </span>

                                          {cautela.weaponCaliber && (
                                            <span className="font-mono text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                              {cautela.weaponCaliber}
                                            </span>
                                          )}

                                          {isDeferida && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                              Deferida
                                            </span>
                                          )}

                                          {isDevolvida && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-slate-800 text-slate-300 border-slate-700">
                                              Devolvida ao Cofre
                                            </span>
                                          )}

                                          {isDevPendente && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-500/20 text-amber-300 border-amber-500/40">
                                              Devolução em Análise
                                            </span>
                                          )}

                                          {isPendente && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-500/20 text-amber-300 border-amber-500/40">
                                              Solicitação em Análise
                                            </span>
                                          )}

                                          {isRecusada && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-red-500/20 text-red-300 border-red-500/30">
                                              Indeferida
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-xs text-slate-400 mt-0.5">
                                          {isAtiva
                                            ? 'Cautela ativa em posse do policial (fixada no topo do histórico)'
                                            : isDevolvida
                                              ? `Devolvida em ${cautela.returnDate ? new Date(cautela.returnDate).toLocaleString('pt-BR') : 'N/A'} • Recebida por ${cautela.returnArmorerName || armorerInfo.name}`
                                              : isRecusada
                                                ? `Indeferida por ${cautela.armorerName || 'Armeiro'}${cautela.armorerMasp ? ` (MASP: ${cautela.armorerMasp})` : ''}`
                                                : isDevPendente
                                                  ? 'Devolução encaminhada e aguardando recibo pelo armeiro'
                                                  : 'Solicitação encaminhada e aguardando análise do armeiro'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                                      {isPendente && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditPendingCautela(cautela)}
                                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 hover:border-amber-400 text-amber-200 rounded-xl text-xs font-bold transition shadow-sm"
                                            title="Editar solicitação de cautela enquanto o armeiro da unidade não deferir ou indeferir"
                                          >
                                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Editar Cautela</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setCancelPendingModal(cautela)}
                                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700 hover:border-red-500 text-red-200 rounded-xl text-xs font-bold transition shadow-sm"
                                            title="Excluir solicitação de cautela enquanto o armeiro da unidade não deferir ou indeferir"
                                          >
                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                            <span>Excluir Cautela</span>
                                          </button>
                                        </>
                                      )}

                                      {isDeferida && (
                                        <button
                                          onClick={() => handlePrintTermo(cautela)}
                                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                          title="Imprimir Termo de Cautela"
                                        >
                                          <Printer className="w-3.5 h-3.5 text-amber-400" />
                                          <span>Imprimir Termo</span>
                                        </button>
                                      )}

                                      {isAtiva && (
                                        <button
                                          onClick={() => handleOpenReturnModal(cautela)}
                                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          <span>Devolver ao Cofre</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Unidade</span>
                                      <span className="font-mono text-slate-200 font-bold truncate block">
                                        {cautelaUnit?.name || 'Unidade Policial'}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Carregadores</span>
                                      <span className="font-bold text-slate-200">{cautela.magazineQuantity} unidade(s)</span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                                        {isDeferida ? 'Data da Retirada' : 'Data da Solicitação'}
                                      </span>
                                      <span className="text-slate-300">
                                        {isDeferida && cautela.authorizedAt
                                          ? new Date(cautela.authorizedAt).toLocaleString('pt-BR')
                                          : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                                        {isRecusada ? 'Armeiro Analista' : 'Armeiro Autorizador'}
                                      </span>
                                      <span className="text-slate-200 font-semibold truncate block" title={armorerInfo.label}>
                                        {isRecusada
                                          ? `${cautela.armorerName || 'Armeiro'}${cautela.armorerMasp ? ` (MASP: ${cautela.armorerMasp})` : ''}`
                                          : armorerInfo.label}
                                      </span>
                                    </div>
                                  </div>

                                  {isDevolvida && (
                                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          cautela.hadShots ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                                        }`}>
                                          {cautela.hadShots ? `${cautela.shotsFired} tiro(s) efetuado(s)` : 'Zero tiros'}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          cautela.isWorking !== false ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                                        }`}>
                                          {cautela.isWorking !== false ? 'Em Condições de Uso' : 'Apresentou Defeito'}
                                        </span>
                                        {cautela.hadMalfunction && (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">
                                            Pane Relatada
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-400">
                                        Devolvido em {cautela.returnDate ? new Date(cautela.returnDate).toLocaleString('pt-BR') : 'N/A'}
                                      </div>
                                    </div>
                                  )}

                                  {isPendente && cautela.authorizationNotes && (
                                    <div className="p-3 bg-amber-950/25 border border-amber-800/50 rounded-xl space-y-1 text-xs">
                                      <div className="flex items-center space-x-2 text-amber-300 font-bold">
                                        <Disc className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Sugestão de munição:</span>
                                      </div>
                                      <p className="text-amber-200/95 font-mono text-[11px] pl-5">
                                        {cautela.authorizationNotes}
                                      </p>
                                    </div>
                                  )}

                                  {isRecusada && cautela.authorizationNotes && (
                                    <div className="p-3 bg-red-950/25 border border-red-900/40 rounded-xl text-xs text-red-200">
                                      <strong className="text-red-300">Motivo do Indeferimento:</strong> {cautela.authorizationNotes}
                                    </div>
                                  )}

                                  {ammoDetails.hasAmmo && ammoDetails.quantity > 0 && (
                                    <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                      <span className="text-amber-300 font-semibold flex items-center space-x-1.5">
                                        <Disc className="w-3.5 h-3.5 text-amber-400" />
                                        <span>
                                          Munição vinculada: <strong>{ammoDetails.quantity} un.</strong> ({ammoDetails.caliberName} • {ammoDetails.tipoMunicao} • {ammoDetails.pesoMunicao})
                                        </span>
                                      </span>
                                      <span className="text-slate-400 font-mono">
                                        Lote: {ammoDetails.loteMunicao} • {ammoDetails.destinacao}
                                      </span>
                                    </div>
                                  )}

                                  {cautela.reason && (
                                    <p className="text-xs text-slate-400 italic">
                                      Motivo / Finalidade: "{cautela.reason}"
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Aba Exclusiva: Histórico de cautelas <Unidade> (Armeiro) — Cautelas Ativas (Marcador Verde) e Devolvidas (Marcador Preto) */}
                  {canAuthorize && activeTab === 'HISTORICO_UNIDADE' && (() => {
                    const unitLabel = userUnit?.name || 'COE';
                    const unitHistoryList = displayedCautelas;
                    const activeInResults = unitHistoryList.filter(
                      c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
                    ).length;
                    const returnedInResults = unitHistoryList.filter(
                      c => c.status === 'DEVOLVIDA'
                    ).length;

                    return (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-sky-400" />
                            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                              {`Histórico de cautelas ${unitLabel}`}
                            </h4>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 font-bold">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
                              <span>{activeInResults} ativa(s)</span>
                            </span>
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-black border border-slate-600 text-slate-100 font-bold">
                              <span className="w-2.5 h-2.5 rounded-full bg-black ring-2 ring-slate-300" />
                              <span>{returnedInResults} devolvida(s)</span>
                            </span>
                            <span className="text-slate-400 bg-slate-950 px-2.5 py-0.5 rounded-md border border-slate-800">
                              Total: {unitHistoryList.length}
                            </span>
                          </div>
                        </div>

                        {unitHistoryList.length === 0 ? (
                          <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                            <FileText className="w-7 h-7 text-slate-600 mx-auto" />
                            <p className="font-semibold text-slate-300">
                              {`Nenhuma cautela encontrada em Histórico de cautelas ${unitLabel} para os filtros informados.`}
                            </p>
                            {(unitHistoryUserFilter !== 'TODOS' ||
                              unitHistoryWeaponFilter !== 'TODAS' ||
                              unitHistoryDateFilter ||
                              searchTerm.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUnitHistoryUserFilter('TODOS');
                                  setUnitHistoryWeaponFilter('TODAS');
                                  setUnitHistoryDateFilter('');
                                  setSearchTerm('');
                                }}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-xs font-bold transition"
                              >
                                Limpar filtros e exibir todo o histórico
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {unitHistoryList.map(cautela => {
                              const isAtiva =
                                cautela.status === 'AUTORIZADA' ||
                                cautela.status === 'DEVOLUCAO_PENDENTE';
                              const isDevPendente = cautela.status === 'DEVOLUCAO_PENDENTE';
                              const weapon = weapons.find(
                                w =>
                                  w.id === cautela.weaponId ||
                                  w.serialNumber === cautela.weaponSerialNumber
                              );
                              const returnVaultId =
                                cautela.vaultSpaceId ||
                                weapon?.previousVaultSpaceId ||
                                weapon?.vaultSpaceId;
                              const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
                              const returnUnit = units.find(u => u.id === returnVault?.unitId);
                              const returnVaultAddress = returnVault
                                ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}`
                                : 'Cofre da Unidade';

                              const requesterInfo = getResolvedRequester(cautela);
                              const armorerInfo = getResolvedArmorer(cautela);
                              const retAmmoDetails = getRescuedAmmoDetails(cautela);
                              const retAmmoVault = retAmmoDetails.vaultSpaceId
                                ? vaultSpaces.find(v => v.id === retAmmoDetails.vaultSpaceId)
                                : undefined;

                              return (
                                <div
                                  key={`unit-hist-${cautela.id}`}
                                  className={`bg-slate-900 rounded-2xl p-4 sm:p-5 transition space-y-3 border-l-4 ${
                                    isAtiva
                                      ? 'border border-emerald-600/50 border-l-emerald-500 ring-1 ring-emerald-500/15 shadow-md'
                                      : 'border border-slate-700/80 border-l-black shadow-sm'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                    <div className="flex items-center space-x-3">
                                      {/* Ícone com marcador verde (ativa) ou preto (devolvida) */}
                                      <div
                                        className={`p-2.5 rounded-xl border relative ${
                                          isAtiva
                                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                            : 'bg-black border-slate-600 text-slate-200'
                                        }`}
                                      >
                                        <Crosshair className="w-5 h-5" />
                                        <span
                                          className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                                            isAtiva
                                              ? 'bg-emerald-500 ring-2 ring-slate-900 shadow-[0_0_8px_rgba(16,185,129,0.95)]'
                                              : 'bg-black ring-2 ring-slate-300'
                                          }`}
                                          title={isAtiva ? 'Marcador Verde: Cautela Ativa' : 'Marcador Preto: Cautela Devolvida'}
                                        />
                                      </div>

                                      <div>
                                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                          {isAtiva ? (
                                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.95)] shrink-0" />
                                              <span>
                                                {isDevPendente ? 'Cautela Ativa (Devolução Pendente)' : 'Cautela Ativa'}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-black text-white border border-slate-500 shadow-sm">
                                              <span className="w-2.5 h-2.5 rounded-full bg-black ring-2 ring-slate-300 shrink-0" />
                                              <span>Cautela Devolvida</span>
                                            </span>
                                          )}

                                          <h4 className="text-sm font-bold text-slate-100">
                                            {weapon?.manufacturer ? `${weapon.manufacturer} ` : ''}
                                            {cautela.weaponModel}
                                          </h4>
                                          <span className="font-mono text-xs text-amber-400 font-bold">
                                            Nº {cautela.weaponSerialNumber}
                                          </span>
                                          {(cautela.weaponCaliber || weapon?.caliber) && (
                                            <span className="font-mono text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                              {cautela.weaponCaliber || weapon?.caliber}
                                            </span>
                                          )}
                                        </div>

                                        <p className="text-xs text-slate-300 mt-1">
                                          Usuário da Cautela:{' '}
                                          <strong className="text-slate-100">{requesterInfo.name}</strong>{' '}
                                          <span className="font-mono text-amber-300">
                                            (MASP: {requesterInfo.masp})
                                          </span>
                                          {requesterInfo.cargo ? ` • ${requesterInfo.cargo}` : ''}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                                      {!isAtiva && (
                                        <button
                                          onClick={() => handlePrintReciboDevolucao(cautela)}
                                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-700/60 text-emerald-200 rounded-xl text-xs font-semibold transition"
                                          title="Imprimir Recibo de Devolução da Arma e da Munição"
                                        >
                                          <Printer className="w-3.5 h-3.5 text-emerald-400" />
                                          <span>Recibo de Devolução</span>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handlePrintTermo(cautela)}
                                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                        title="Imprimir Termo de Cautela"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Termo</span>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                                        {isAtiva ? 'Cofre de Origem' : 'Cofre de Retorno'}
                                      </span>
                                      <span className="font-mono text-slate-200 font-bold truncate block">
                                        {returnVaultAddress}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                                        Carregadores
                                      </span>
                                      <span className="font-bold text-slate-200">
                                        {isAtiva
                                          ? `${cautela.magazineQuantity} unidade(s)`
                                          : `${cautela.returnedMagazinesCount ?? cautela.magazineQuantity}/${cautela.magazineQuantity} devolvido(s)`}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                                        Data da Retirada
                                      </span>
                                      <span className="text-slate-300">
                                        {cautela.authorizedAt
                                          ? new Date(cautela.authorizedAt).toLocaleString('pt-BR')
                                          : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                                      </span>
                                    </div>
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                                        {isAtiva ? 'Armeiro Autorizador' : 'Data / Armeiro Recebedor'}
                                      </span>
                                      <span className="text-slate-200 font-semibold truncate block">
                                        {isAtiva
                                          ? armorerInfo.label
                                          : `${cautela.returnDate ? new Date(cautela.returnDate).toLocaleString('pt-BR') : 'N/A'} • ${cautela.returnArmorerName || armorerInfo.name}`}
                                      </span>
                                    </div>
                                  </div>

                                  {retAmmoDetails.hasAmmo && retAmmoDetails.quantity > 0 && (
                                    <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                      <span className="text-amber-300 font-semibold flex items-center space-x-1.5">
                                        <Disc className="w-3.5 h-3.5 text-amber-400" />
                                        <span>
                                          Munição vinculada ({retAmmoDetails.caliberName} • {retAmmoDetails.tipoMunicao} • Lote {retAmmoDetails.loteMunicao}):{' '}
                                          {isAtiva ? (
                                            <strong className="text-amber-200">
                                              {retAmmoDetails.quantity} un. acauteladas
                                            </strong>
                                          ) : retAmmoDetails.seraDevolvida ? (
                                            <strong className="text-emerald-300">
                                              {retAmmoDetails.returnedQuantity ?? 0}/{retAmmoDetails.quantity} un. devolvidas
                                              {retAmmoVault ? ` ao cofre ${retAmmoVault.code}` : ''}
                                            </strong>
                                          ) : (
                                            <strong className="text-slate-300">
                                              {retAmmoDetails.quantity} un. (Retirada Permanente)
                                            </strong>
                                          )}
                                        </span>
                                      </span>
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-slate-800 text-slate-300 border-slate-700">
                                        {isAtiva
                                          ? `Destinação: ${retAmmoDetails.destinacao}`
                                          : `Munição: ${retAmmoDetails.linkedStatus === 'DEVOLVIDA' || retAmmoDetails.seraDevolvida ? 'Devolvida' : 'Encerrada'}`}
                                      </span>
                                    </div>
                                  )}

                                  {!isAtiva && (
                                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            cautela.hadShots
                                              ? 'bg-amber-500/20 text-amber-300'
                                              : 'bg-slate-800 text-slate-400'
                                          }`}
                                        >
                                          {cautela.hadShots
                                            ? `${cautela.shotsFired} tiros efetuados`
                                            : 'Zero tiros'}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            cautela.isWorking !== false
                                              ? 'bg-emerald-500/20 text-emerald-300'
                                              : 'bg-red-500/20 text-red-300'
                                          }`}
                                        >
                                          {cautela.isWorking !== false
                                            ? 'Em Condições de Uso'
                                            : 'Apresentou Defeito (Manutenção)'}
                                        </span>
                                        {cautela.hadMalfunction && (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">
                                            Pane Relatada
                                          </span>
                                        )}
                                      </div>
                                      {cautela.reason && (
                                        <span className="text-[11px] text-slate-400 italic">
                                          Finalidade: "{cautela.reason}"
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {isAtiva && cautela.reason && (
                                    <p className="text-xs text-slate-400 italic">
                                      Finalidade: "{cautela.reason}"
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE DEVOLUÇÃO COM REGISTRO TÉCNICO (TIROS, DEFEITOS, PANES, MUNIÇÃO VINCULADA) */}
      {returningCautela && (() => {
        const ammoDetails = getRescuedAmmoDetails(returningCautela);
        const isArmorerConfirmingPending = canAuthorize && returningCautela.status === 'DEVOLUCAO_PENDENTE';
        const requesterInfo = getResolvedRequester(returningCautela);

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl my-auto space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                    {isArmorerConfirmingPending ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <RotateCcw className="w-5 h-5 text-amber-400" />
                    )}
                    <span>
                      {isArmorerConfirmingPending
                        ? 'Receber Cautela Devolvida ao Cofre'
                        : 'Devolução de Armamento ao Cofre'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Arma: <strong>{returningCautela.weaponModel}</strong> (Série: <span className="font-mono">{returningCautela.weaponSerialNumber}</span>)
                    {returningCautela.weaponCaliber ? ` • Calibre: ${returningCautela.weaponCaliber}` : ''}
                  </p>
                  {canAuthorize && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Policial Solicitante: <strong className="text-slate-200">{requesterInfo.name}</strong>{' '}
                      <span className="font-mono text-amber-300">(MASP: {requesterInfo.masp})</span>
                    </p>
                  )}
                </div>
                <button onClick={() => setReturningCautela(null)} className="text-slate-400 hover:text-slate-200">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Aviso contextual conforme o perfil */}
              {!canAuthorize ? (
                <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded-xl text-xs text-amber-200 flex items-start space-x-2.5">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-300 block">Devolução Pendente de Recibo pelo Armeiro</strong>
                    <span>
                      Ao confirmar esta devolução, os dados informados serão registrados e a cautela ficará <strong>pendente de recibo pelo armeiro</strong> da unidade para conferência física e guarda no cofre.
                    </span>
                  </div>
                </div>
              ) : isArmorerConfirmingPending ? (
                <div className="p-3.5 bg-emerald-950/40 border border-emerald-700/60 rounded-xl text-xs text-emerald-200 space-y-2">
                  <div className="flex items-start space-x-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-emerald-300 block">Conferência de Cautela Devolvida pelo Usuário</strong>
                      <span>
                        Confira abaixo os dados informados por <strong>{requesterInfo.name}</strong> (MASP: <span className="font-mono">{requesterInfo.masp}</span>), defina <strong>para qual local no cofre vai voltar a arma</strong>{ammoDetails.hasAmmo ? <> e <strong>para qual local vão voltar as munições</strong></> : ''} e clique em receber para guardar no cofre e gerar o recibo.
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-800/50 text-[11px]">
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Disparos Relatados</span>
                      <strong className="text-slate-100">{returningCautela.hadShots ? `${returningCautela.shotsFired || 0} tiro(s)` : 'Zero disparos'}</strong>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Condição Relatada</span>
                      <strong className={returningCautela.isWorking !== false ? 'text-emerald-300' : 'text-red-300'}>
                        {returningCautela.isWorking !== false ? 'Em Condições' : 'Com Defeito'}
                      </strong>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Carregadores</span>
                      <strong className="text-slate-100">{returningCautela.returnedMagazinesCount ?? returningCautela.magazineQuantity} un.</strong>
                    </div>
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Munição Vinculada</span>
                      <strong className="text-amber-300">
                        {ammoDetails.hasAmmo
                          ? `${returningCautela.returnedAmmoQuantity ?? Math.max(0, ammoDetails.quantity - (returningCautela.shotsFired || 0))}/${ammoDetails.quantity} un.`
                          : 'Sem munição'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleConfirmReturn} className="space-y-4">
                {/* 1. Tiros efetuados */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                      <Disc className="w-4 h-4 text-amber-400" />
                      <span>Houve tiros / disparos efetuados com a arma?</span>
                    </label>
                    <div className="flex items-center space-x-3 text-xs">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="hadShots"
                          checked={!hadShots}
                          onChange={() => {
                            setHadShots(false);
                            setShotsFired(0);
                            setReturnAmmoUsedCount(0);
                            if (ammoDetails.hasAmmo && ammoDetails.seraDevolvida) {
                              setReturnedAmmoQuantity(ammoDetails.quantity);
                            }
                          }}
                          className="text-amber-500"
                        />
                        <span>Não</span>
                      </label>
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="hadShots"
                          checked={hadShots}
                          onChange={() => {
                            setHadShots(true);
                            const nextShots = shotsFired > 0 ? shotsFired : 1;
                            setShotsFired(nextShots);
                            if (ammoDetails.hasAmmo && ammoDetails.seraDevolvida) {
                              const nextRet = Math.max(0, ammoDetails.quantity - nextShots);
                              setReturnedAmmoQuantity(nextRet);
                              setReturnAmmoUsedCount(Math.max(0, ammoDetails.quantity - nextRet));
                            }
                          }}
                          className="text-amber-500"
                        />
                        <span className="text-amber-400 font-bold">Sim</span>
                      </label>
                    </div>
                  </div>

                  {hadShots && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Quantidade de tiros efetuados:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="2000"
                        value={shotsFired}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setShotsFired(val);
                          if (ammoDetails.hasAmmo && ammoDetails.seraDevolvida) {
                            const suggestedReturned = Math.max(0, ammoDetails.quantity - val);
                            setReturnedAmmoQuantity(suggestedReturned);
                            setReturnAmmoUsedCount(Math.max(0, ammoDetails.quantity - suggestedReturned));
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                        required={hadShots}
                      />
                    </div>
                  )}
                </div>

                {/* 2. Condições de Uso & Defeitos */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      <span>Condição do armamento na devolução:</span>
                    </label>
                    <div className="flex items-center space-x-3 text-xs">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="isWorking"
                          checked={isWorking}
                          onChange={() => setIsWorking(true)}
                          className="text-emerald-500"
                        />
                        <span className="text-emerald-400 font-semibold">Em Condições</span>
                      </label>
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="isWorking"
                          checked={!isWorking}
                          onChange={() => setIsWorking(false)}
                          className="text-red-500"
                        />
                        <span className="text-red-400 font-semibold">Apresenta Defeito</span>
                      </label>
                    </div>
                  </div>

                  {!isWorking && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <label className="block text-[11px] font-semibold text-red-300 mb-1">
                        Descreva detalhadamente o defeito apresentado:
                      </label>
                      <textarea
                        value={defectDescription}
                        onChange={(e) => setDefectDescription(e.target.value)}
                        placeholder="Ex: Percussor quebrado, alça de mira solta, tranca frouxa..."
                        className="w-full bg-slate-900 border border-red-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500"
                        rows={2}
                        required={!isWorking}
                      />
                    </div>
                  )}
                </div>

                {/* 3. Panes ocorridas */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-purple-400" />
                      <span>A arma apresentou alguma pane durante o uso?</span>
                    </label>
                    <div className="flex items-center space-x-3 text-xs">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="hadMalfunction"
                          checked={!hadMalfunction}
                          onChange={() => setHadMalfunction(false)}
                          className="text-purple-500"
                        />
                        <span>Não</span>
                      </label>
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="hadMalfunction"
                          checked={hadMalfunction}
                          onChange={() => setHadMalfunction(true)}
                          className="text-purple-500"
                        />
                        <span className="text-purple-400 font-bold">Sim</span>
                      </label>
                    </div>
                  </div>

                  {hadMalfunction && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <label className="block text-[11px] font-semibold text-purple-300 mb-1">
                        Informe qual pane ocorreu (Ex: falha na extração, nega, chaminé):
                      </label>
                      <input
                        type="text"
                        value={malfunctionDescription}
                        onChange={(e) => setMalfunctionDescription(e.target.value)}
                        placeholder="Ex: Pane tipo chaminé no 15º disparo"
                        className="w-full bg-slate-900 border border-purple-800 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                        required={hadMalfunction}
                      />
                    </div>
                  )}
                </div>

                {/* 4. Resgate dos Dados da Munição e Cautela Vinculada */}
                {ammoDetails.hasAmmo ? (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-600/50 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <Disc className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-xs font-bold text-amber-300 block">
                            Dados da Munição e Cautela Vinculada
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block">
                            {ammoDetails.linkedCautelaId
                              ? `Cautela de Munições Vinculada: #${String(ammoDetails.linkedCautelaId).slice(-10)}`
                              : 'Registro de munições vinculado à cautela do armamento'}
                            {canAuthorize && ammoDetails.originVaultCode
                              ? ` • Origem: Cofre ${ammoDetails.originVaultCode}`
                              : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          ammoDetails.seraDevolvida
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {ammoDetails.seraDevolvida ? 'Passiva de Devolução' : 'Retirada Permanente'}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/60">
                          {ammoDetails.quantity} un. acauteladas
                        </span>
                      </div>
                    </div>

                    {/* Especificações técnicas resgatadas da munição */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-900/70 p-2.5 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-slate-500 block">Calibre / Fabricante:</span>
                        <strong className="text-slate-200">{ammoDetails.caliberName} • {ammoDetails.fabricante}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Tipo / Peso:</span>
                        <strong className="text-slate-200">{ammoDetails.tipoMunicao} • {ammoDetails.pesoMunicao}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Lote{ammoDetails.anoFabricacao ? ' / Ano' : ''}:</span>
                        <strong className="text-slate-200 font-mono">
                          {ammoDetails.loteMunicao}{ammoDetails.anoFabricacao ? ` (${ammoDetails.anoFabricacao})` : ''}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Destinação:</span>
                        <strong className="text-slate-200">{ammoDetails.destinacao}</strong>
                      </div>
                    </div>

                    {ammoDetails.seraDevolvida || (canAuthorize && forceReturnAmmoToVault) ? (
                      <div className="space-y-3 pt-1 border-t border-slate-800/80">
                        {!ammoDetails.seraDevolvida && canAuthorize && (
                          <div className="flex items-center justify-between bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2 text-xs">
                            <span className="text-amber-200 font-semibold">
                              Devolvendo munições remanescentes ao cofre determinado pelo armeiro
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setForceReturnAmmoToVault(false);
                                setReturnedAmmoQuantity(0);
                              }}
                              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                            >
                              Cancelar devolução de munição
                            </button>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-amber-200 mb-1">
                            Quantas munições foram devolvidas (de {ammoDetails.quantity} acauteladas)? <span className="text-amber-400">*</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={ammoDetails.quantity}
                            value={returnedAmmoQuantity}
                            onChange={(e) => {
                              const raw = parseInt(e.target.value, 10);
                              const val = isNaN(raw) ? 0 : Math.min(ammoDetails.quantity, Math.max(0, raw));
                              setReturnedAmmoQuantity(val);
                              setReturnAmmoUsedCount(Math.max(0, ammoDetails.quantity - val));
                            }}
                            className="w-full bg-slate-900 border border-amber-600/60 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono font-bold focus:border-amber-400"
                            required
                          />
                          <p className="text-[11px] text-slate-400 mt-1">
                            Devolvidas ao cofre: <strong className="text-amber-300 font-mono">{returnedAmmoQuantity}</strong> un. • Utilizadas/consumidas:{' '}
                            <strong className="text-slate-200 font-mono">{Math.max(0, ammoDetails.quantity - returnedAmmoQuantity)}</strong> un.
                          </p>
                        </div>

                        {/* Seleção de Para Qual Local no Cofre Vão Voltar as Munições: VISÍVEL SOMENTE PARA O ARMEIRO */}
                        {canAuthorize && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                            <label className="block text-xs font-bold text-amber-200">
                              Para qual local no cofre vão voltar as munições? <span className="text-amber-400">*</span>
                            </label>
                            <select
                              value={returnAmmoVaultSpaceId}
                              onChange={(e) => setReturnAmmoVaultSpaceId(e.target.value)}
                              className="w-full bg-slate-900 border border-amber-600/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-400"
                              required={availableAmmoVaults.length > 0}
                            >
                              {availableAmmoVaults.length === 0 ? (
                                <option value="">Cofre de Munições Padrão da Unidade</option>
                              ) : (
                                availableAmmoVaults.map(v => {
                                  const vUnit = units.find(u => u.id === v.unitId);
                                  const isOriginAmmoVault = Boolean(ammoDetails.vaultSpaceId && v.id === ammoDetails.vaultSpaceId);
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {v.code} - {(v as any).description || (vUnit ? vUnit.name : 'Cofre da Unidade')}{isOriginAmmoVault ? ' (Cofre de Origem da Munição)' : ''}
                                    </option>
                                  );
                                })
                              )}
                            </select>

                            <div className="p-2.5 bg-emerald-950/30 border border-emerald-700/40 rounded-lg text-[11px] text-emerald-200/95 leading-relaxed">
                              Ao confirmar o recebimento, as{' '}
                              <strong className="font-mono text-emerald-300">{returnedAmmoQuantity}</strong> munição(ões) devolvida(s) serão{' '}
                              <strong>colocadas/somadas no cofre determinado acima</strong>, a cautela de munições vinculada será{' '}
                              <strong>baixada como Devolvida</strong> e será gerado o <strong>recibo da arma e da munição</strong>.
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-2">
                        <p>
                          Esta munição consta originalmente como <strong>retirada permanente</strong>. Ao receber a arma, a cautela de munição vinculada será encerrada e constará no recibo.
                        </p>
                        {canAuthorize && (
                          <label className="flex items-center space-x-2 text-amber-300 font-semibold cursor-pointer pt-1 border-t border-slate-800">
                            <input
                              type="checkbox"
                              checked={forceReturnAmmoToVault}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setForceReturnAmmoToVault(checked);
                                if (checked) {
                                  const suggested = Math.max(0, ammoDetails.quantity - (hadShots ? Number(shotsFired) || 0 : 0));
                                  setReturnedAmmoQuantity(suggested > 0 ? suggested : ammoDetails.quantity);
                                } else {
                                  setReturnedAmmoQuantity(0);
                                }
                              }}
                              className="rounded text-amber-500 bg-slate-950 border-slate-700"
                            />
                            <span>Haverá devolução de munições remanescentes ao cofre (definir quantidade e local no cofre)</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-dashed border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center space-x-2">
                      <Disc className="w-4 h-4 text-slate-600" />
                      <span>Nenhuma cautela de munição vinculada a este armamento.</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">0 un.</span>
                  </div>
                )}

                {/* 5. Carregadores devolvidos */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Quantidade de Carregadores Sendo Devolvidos
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={returnedMagazinesCount}
                    onChange={(e) => setReturnedMagazinesCount(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>

                {/* 6. Para qual local no cofre vai voltar a arma: VISÍVEL SOMENTE PARA O ARMEIRO */}
                {canAuthorize && (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-emerald-700/50 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <label className="text-xs font-bold text-emerald-300 flex items-center space-x-2">
                        <Crosshair className="w-4 h-4 text-emerald-400" />
                        <span>Para qual local no cofre vai voltar a arma? <span className="text-amber-400">*</span></span>
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono">
                        Origem: {vaultSpaces.find(v => v.id === returningCautela.vaultSpaceId)?.code || 'Cofre Padrão'}
                      </span>
                    </div>

                    {availableArmasVaults.length === 0 ? (
                      <div className="text-xs text-slate-300 font-mono bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                        Retornará ao cofre original: {vaultSpaces.find(v => v.id === returningCautela.vaultSpaceId)?.code || 'Cofre Padrão da Unidade'}
                      </div>
                    ) : (
                      <select
                        value={returnVaultSpaceId}
                        onChange={(e) => setReturnVaultSpaceId(e.target.value)}
                        className="w-full bg-slate-900 border border-emerald-600/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-emerald-400"
                        required
                      >
                        {availableArmasVaults.map(v => {
                          const vUnit = units.find(u => u.id === v.unitId);
                          return (
                            <option key={v.id} value={v.id}>
                              {v.code} - {(v as any).description || (vUnit ? vUnit.name : 'Cofre da Unidade')} {v.id === returningCautela.vaultSpaceId ? '(Local Original de Saída)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Ao confirmar, a arma retornará imediatamente para o local do cofre selecionado acima e será emitido o recibo oficial{ammoDetails.hasAmmo ? ' da arma e da munição' : ' da arma'}.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Observações Gerais da Conferência / Devolução
                  </label>
                  <textarea
                    value={returnObservations}
                    onChange={(e) => setReturnObservations(e.target.value)}
                    placeholder="Informações adicionais para registro da armaria..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                    rows={2}
                  />
                </div>

                <div className="pt-3 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setReturningCautela(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-5 py-2.5 font-bold text-xs rounded-xl transition flex items-center space-x-2 ${
                      isArmorerConfirmingPending
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    {isArmorerConfirmingPending ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                    <span>
                      {isSubmitting
                        ? 'Processando...'
                        : !canAuthorize
                          ? 'Enviar Devolução (Pendente de Recibo)'
                          : isArmorerConfirmingPending
                            ? (ammoDetails.hasAmmo ? 'RECEBER E GERAR RECIBO DA ARMA E MUNIÇÃO' : 'RECEBER E GERAR RECIBO DA ARMA')
                            : 'CONFIRMAR DEVOLUÇÃO AO COFRE'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE AUTORIZAÇÃO PELO ARMEIRO (SELEÇÃO DE COFRE/LOTE E PERMANENTE OU DEVOLVER DEPOIS) */}
      {authorizingCautela && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-xl shadow-2xl my-auto space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-amber-400" />
                  <span>Autorização e Liberação de Armamento e Munição</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Informe o cofre/lote de onde retirará a munição e a modalidade de acautelamento.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setAuthorizingCautela(null)} 
                className="text-slate-400 hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAuthorizeWithAmmo} className="space-y-4">
              {/* Resumo do Pedido do Policial */}
              {(() => {
                const authRequesterInfo = getResolvedRequester(authorizingCautela);
                return (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3 text-slate-300">
                      <span className="shrink-0">Policial Solicitante:</span>
                      <strong className="text-slate-100 text-right">
                        {authRequesterInfo.name} — MASP: {authRequesterInfo.masp}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Arma Solicitada:</span>
                      <strong className="text-slate-100 font-mono">{authorizingCautela.weaponModel} - Série: {authorizingCautela.weaponSerialNumber} ({authorizingCautela.weaponCaliber})</strong>
                    </div>
                    {(() => {
                      const authMotivoFinalidade = getResolvedMotivoFinalidade(authorizingCautela);
                      return (
                        <div className="flex items-center justify-between gap-3 text-slate-300 pt-1 border-t border-slate-800/80">
                          <span className="shrink-0">Motivo/Finalidade:</span>
                          <strong className="text-slate-100 text-right">
                            {authMotivoFinalidade || 'Não informado'}
                          </strong>
                        </div>
                      );
                    })()}
                    {(() => {
                      const authSugestaoMunicao = (authorizingCautela.authorizationNotes || '').trim();
                      const authLinkedAmmo = getLinkedAmmoForCautela(authorizingCautela);
                      const authMarcouMunicoes = Boolean(
                        authSugestaoMunicao ||
                          authorizingCautela.linkedAmmoCautelaId ||
                          (authorizingCautela.ammoQuantity && authorizingCautela.ammoQuantity > 0) ||
                          authLinkedAmmo
                      );
                      return (
                        <div
                          className={`p-2.5 rounded-lg text-xs space-y-1.5 border ${
                            authMarcouMunicoes
                              ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                              : 'bg-slate-900/70 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center space-x-1.5">
                              <Disc className={`w-4 h-4 shrink-0 ${authMarcouMunicoes ? 'text-amber-400' : 'text-slate-500'}`} />
                              <strong className="uppercase text-[10px] tracking-wider text-amber-200">
                                Sugestão de munição:
                              </strong>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                authMarcouMunicoes
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-950 text-slate-400 border-slate-700'
                              }`}
                            >
                              Desejo solicitar munições: {authMarcouMunicoes ? 'Sim' : 'Não'}
                            </span>
                          </div>
                          <div className={`font-mono text-xs pl-5 ${authSugestaoMunicao ? 'text-amber-200 font-semibold' : 'text-slate-500 italic'}`}>
                            {authSugestaoMunicao || 'Nenhuma sugestão de munição informada pelo solicitante.'}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Opção para o armeiro acautelar munições junto com a arma */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-600/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={authWithAmmo}
                      onChange={(e) => setAuthWithAmmo(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs font-bold text-slate-100">
                      Acautelar munições junto com a arma?
                    </span>
                  </label>
                  <span className={`text-[10px] font-semibold ${authWithAmmo ? 'text-amber-400' : 'text-slate-400'}`}>
                    {authWithAmmo ? 'Munições vinculadas ativas' : 'Somente armamento (sem munição)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {authWithAmmo
                    ? 'O registro de cautela de munição será lançado em Cautela de Munições e deduzido do estoque do cofre selecionado.'
                    : 'Caso não marque esta opção, a cautela será exclusivamente do armamento, sem munição e sem gerar nenhuma cautela de munições vinculada.'}
                </p>
              </div>

              {authWithAmmo && (
                <div className="space-y-4 pt-1 border-t border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Quantidade de Munições Desejadas
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        value={authAmmoQty}
                        onChange={(e) => setAuthAmmoQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono font-bold focus:border-amber-500"
                        required={authWithAmmo}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Destinação
                      </label>
                      <select
                        value={authAmmoDestinacao}
                        onChange={(e) => {
                          const nextDest = e.target.value as 'Treinamento' | 'Defesa' | 'Ensaio';
                          setAuthAmmoDestinacao(nextDest);
                          setAuthSeraDevolvida(nextDest === 'Defesa');
                          setAuthStockId('');
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium focus:border-amber-500"
                      >
                        <option value="Treinamento">Treinamento</option>
                        <option value="Defesa">Defesa</option>
                        <option value="Ensaio">Ensaio</option>
                      </select>
                    </div>
                  </div>

                  {/* 1. Seleção do Cofre e Lote da Munição */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>De qual cofre / lote vai tirar as munições?</span>
                      <span className="text-[10px] text-amber-400 font-mono font-normal">
                        {availableAmmoForAuthorizingWeapon.length} lote(s) disponível(is)
                      </span>
                    </label>

                    {availableAmmoForAuthorizingWeapon.length === 0 ? (
                      <div className="p-3 bg-red-950/40 border border-red-800 text-xs text-red-300 rounded-xl">
                        ⚠ {authAmmoDestinacao === 'Defesa'
                          ? <>Não há munições de <strong>Defesa</strong> disponíveis no calibre <strong>{authorizingCautela.weaponCaliber}</strong> nesta unidade.</>
                          : authAmmoDestinacao === 'Treinamento'
                            ? <>Não há munições de <strong>Treinamento</strong> disponíveis no calibre <strong>{authorizingCautela.weaponCaliber}</strong> nesta unidade.</>
                            : <>Não há munições disponíveis no calibre <strong>{authorizingCautela.weaponCaliber}</strong> nesta unidade.</>}
                      </div>
                    ) : (
                      <select
                        value={authStockId}
                        onChange={(e) => setAuthStockId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                        required={authWithAmmo}
                      >
                        {availableAmmoForAuthorizingWeapon.map(st => {
                          const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                          const cal = calibers.find(c => c.id === st.caliberId);
                          return (
                            <option key={st.id} value={st.id}>
                              {vault ? vault.code : 'Cofre'} • {st.fabricante || 'CBC'} • Calibre: {cal ? cal.name : (st.caliberId || authorizingCautela.weaponCaliber)} • Tipo: {st.tipoMunicao || 'Comum'} • Peso: {st.pesoMunicao || 'N/I'} • Lote: {st.loteMunicao || 'S/L'} • Ano: {st.anoFabricacao || 'N/A'} — Saldo: {st.quantity} un.
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  {/* 2. Tipo de Retirada: Permanente vs Devolver Depois */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Tipo de Retirada da Munição
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        authSeraDevolvida
                          ? 'bg-amber-950/40 border-amber-500 text-slate-100 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="authRetiradaTipo"
                            checked={authSeraDevolvida}
                            onChange={() => setAuthSeraDevolvida(true)}
                            className="text-amber-500"
                          />
                          <span className="font-bold text-slate-100">Irá devolver depois</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1">
                          Cautela temporária: as munições não deflagradas deverão retornar ao cofre.
                        </span>
                      </label>

                      <label className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        !authSeraDevolvida
                          ? 'bg-amber-950/40 border-amber-500 text-slate-100 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="authRetiradaTipo"
                            checked={!authSeraDevolvida}
                            onChange={() => setAuthSeraDevolvida(false)}
                            className="text-amber-500"
                          />
                          <span className="font-bold text-slate-100">Retirada permanente</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1">
                          Baixa definitiva: consumo, treinamento, ensaio ou missão (não retornará ao cofre).
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Justificativa de Divergência da Munição (exibida somente quando o calibre/tipo selecionado diverge de OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS) */}
              {authAmmoComparison.showDivergenceJustification && (
                <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-3 space-y-1.5">
                  <label className="block text-xs font-semibold text-amber-200 tracking-wide">
                    Usuário solicitou munição: {authAmmoComparison.requestedAmmoConstant}
                  </label>
                  <textarea
                    value={authNotes}
                    onChange={(e) => setAuthNotes(e.target.value)}
                    placeholder={`Justifique o depósito da munição ${authAmmoComparison.selectedCaliberDisplay} - ${authAmmoComparison.selectedTipoDisplay}`}
                    className="w-full bg-slate-950 border border-amber-700/50 focus:border-amber-500 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-amber-300/70"
                    rows={2}
                    required
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAuthorizingCautela(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (authWithAmmo && (availableAmmoForAuthorizingWeapon.length === 0 || !authStockId))
                  }
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-md"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSubmitting 
                      ? 'Autorizando...' 
                      : (authWithAmmo 
                          ? 'Confirmar Autorização de Arma e Munições' 
                          : 'Confirmar Autorização de Arma')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE JUSTIFICATIVA/RECUSA */}
      {notesModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-100">
              {notesModal.action === 'RECUSAR' ? 'Recusar Solicitação de Cautela' : 'Observações de Autorização'}
            </h4>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Descreva o motivo ou observações..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100"
              rows={3}
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setNotesModal(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => handleReject(notesModal.id, actionNotes, notesModal.weaponId, notesModal.weaponSerialNumber)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl"
              >
                Confirmar Recusa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AVISO: POLICIAL JÁ POSSUI CAUTELA ATIVA */}
      {activeCautelaWarningModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-amber-500/20">
            {/* Header com ícone de alerta */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Cautela Ativa em Andamento
                  </h3>
                  <p className="text-xs text-amber-400 font-medium">
                    Identificação de cautela ativa em seu usuário
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveCautelaWarningModal(null)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem e listagem das armas ativas */}
            <div className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Você já possui{' '}
                <strong className="text-amber-300">
                  {activeCautelaWarningModal.length === 1 
                    ? '1 (uma) cautela de arma ativa' 
                    : `${activeCautelaWarningModal.length} cautelas de armas ativas`}
                </strong>{' '}
                em seu nome (MASP: <strong>{currentUser.masp || 'Policial'}</strong>):
              </p>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {activeCautelaWarningModal.map(c => {
                  const armorerInfo = getResolvedArmorer(c);
                  const linkedAmmo = getLinkedAmmoForCautela(c);
                  const hasAmmo = Boolean(c.ammoQuantity || c.linkedAmmoCautelaId || linkedAmmo);
                  const ammoQtd = c.ammoQuantity || linkedAmmo?.quantity || 0;
                  const weapon = weapons.find(w => w.id === c.weaponId || w.serialNumber === c.weaponSerialNumber);
                  const returnVaultId = c.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
                  const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
                  const returnUnit = units.find(u => u.id === returnVault?.unitId);
                  const returnVaultAddress = returnVault 
                    ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}` 
                    : 'Cofre de Origem';

                  return (
                    <div
                      key={c.id}
                      className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                        <span className="font-bold text-slate-100 flex items-center space-x-1.5">
                          <Crosshair className="w-4 h-4 text-emerald-400" />
                          <span>{c.weaponModel}</span>
                        </span>
                        <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                          Nº {c.weaponSerialNumber}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <div>
                          <span className="text-slate-500 block">Armeiro Autorizador:</span>
                          <span className="text-slate-200 font-semibold truncate block" title={armorerInfo.label}>
                            {armorerInfo.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">{isPolicial ? 'Unidade:' : 'Cofre de Retorno:'}</span>
                          <span className="text-slate-300 font-mono truncate block">
                            {isPolicial ? (returnUnit?.name || userUnit?.name || 'Unidade Policial') : returnVaultAddress}
                          </span>
                        </div>
                      </div>
                      {hasAmmo && ammoQtd > 0 && (
                        <div className="pt-1 text-[11px] text-amber-300 flex items-center space-x-1.5 border-t border-slate-900">
                          <Disc className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Munições fornecidas em conjunto: <strong>{ammoQtd} munições</strong></span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-slate-300 leading-normal">
                Deseja <strong>continuar mesmo assim</strong> com uma nova solicitação ou deseja <strong>ir para Minhas Cautelas</strong>?
              </div>
            </div>

            {/* Ações / Botões */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleProceedWithNewSolicitation}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1.5"
              >
                <span>Continuar Mesmo Assim</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleGoToActiveCautela}
                className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-md shadow-amber-500/20"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>Ir para Minha Cautela</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Solicitação de Cautela Pendente (Policial enquanto o armeiro não Deferir/Indeferir) */}
      {editingCautela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto animate-in fade-in">
          <div className="bg-slate-900 border border-amber-600/60 rounded-2xl max-w-2xl w-full p-5 sm:p-6 my-auto space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Editar Solicitação de Cautela de Arma</h3>
                  <p className="text-xs text-slate-400">
                    Edição permitida enquanto o armeiro da unidade ainda não deferiu ou indeferiu a cautela
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCautela(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditPendingCautela} className="space-y-4">
              {/* 1. Seleção do Armamento */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  1. Armamento Solicitado ({editableUnitWeapons.length} opção{editableUnitWeapons.length === 1 ? '' : 'ões'} disponível{editableUnitWeapons.length === 1 ? '' : 'is'})
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto p-1">
                  {editableUnitWeapons.map(w => {
                    const isSelected = editWeaponId === w.id;
                    const isOriginalWeapon = w.id === editingCautela.weaponId;
                    const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);
                    return (
                      <div
                        key={`edit-w-${w.id}`}
                        onClick={() => setEditWeaponId(w.id)}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-950/70 border-amber-500 shadow-md ring-1 ring-amber-500'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-100">{w.model}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {w.caliber}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[11px] font-mono text-amber-400">
                              Série: {w.serialNumber}
                            </span>
                            {isOriginalWeapon && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Atual
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
                          <span>
                            {isPolicial
                              ? (isOriginalWeapon ? 'Reservada nesta solicitação' : 'Disponível na Unidade')
                              : `Local: ${vault ? vault.code : 'Cofre'}`}
                          </span>
                          <span>{w.magazineQuantity || 1} carregadores</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {editSelectedWeapon && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200 flex items-center justify-between">
                  <div>
                    Arma selecionada: <strong>{editSelectedWeapon.model}</strong> (Série: <span className="font-mono">{editSelectedWeapon.serialNumber}</span>) - Calibre: <strong>{editSelectedWeapon.caliber}</strong>
                  </div>
                </div>
              )}

              {/* 2. Motivo / Finalidade do Uso */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  2. Motivo / Finalidade do Uso
                </label>
                <select
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition cursor-pointer"
                >
                  <option value="">Selecione o motivo / finalidade</option>
                  <option value="Treinamento">Treinamento</option>
                  <option value="Operação">Operação</option>
                  <option value="Plantão">Plantão</option>
                  <option value="Serviço Ordinário">Serviço Ordinário</option>
                  {editReason &&
                    !['Treinamento', 'Operação', 'Plantão', 'Serviço Ordinário'].includes(editReason) && (
                      <option value={editReason}>{editReason}</option>
                    )}
                </select>
              </div>

              {/* 3. Indicação Informativa de Munição Desejada ("Desejo solicitar munições") */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="editPolicialAmmoRequest"
                    checked={editWantsAmmo}
                    onChange={(e) => setEditWantsAmmo(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-950 border-slate-700 cursor-pointer"
                  />
                  <label htmlFor="editPolicialAmmoRequest" className="text-xs font-bold text-slate-200 cursor-pointer">
                    Desejo solicitar munições
                  </label>
                </div>

                {editWantsAmmo && (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3.5">
                    {!editSelectedWeapon ? (
                      <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Selecione uma arma acima para carregar o calibre, os tipos e os pesos disponíveis na unidade.</span>
                      </div>
                    ) : availableEditPoliceTipos.length === 0 ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                            Calibre Correspondente
                          </label>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={editSelectedWeapon.caliber}
                            className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold cursor-not-allowed"
                          />
                        </div>
                        <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            Não há tipos de munição cadastrados para o calibre <strong>{editSelectedWeapon.caliber}</strong> disponíveis na sua unidade no momento.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                            Calibre Correspondente
                          </label>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={editSelectedWeapon.caliber}
                            className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold cursor-not-allowed"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                            Tipo de Munição
                          </label>
                          <select
                            value={editAmmoTipo}
                            onChange={(e) => setEditAmmoTipo(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-amber-500 cursor-pointer"
                          >
                            {availableEditPoliceTipos.map(t => (
                              <option key={`edit-t-${t}`} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                            Peso do Projétil
                          </label>
                          <select
                            value={editAmmoPeso}
                            onChange={(e) => setEditAmmoPeso(e.target.value)}
                            disabled={availableEditPolicePesos.length === 0}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-amber-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {availableEditPolicePesos.length === 0 ? (
                              <option value="">Sem peso cadastrado neste tipo</option>
                            ) : (
                              availableEditPolicePesos.map(p => (
                                <option key={`edit-p-${p}`} value={p}>{p}</option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Esta indicação é <strong>meramente informativa</strong> para a análise do armeiro. <strong>Não gera cautela de munições em conjunto</strong> e <strong>não deduz do cofre</strong>.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingCautela(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!editWeaponId || isSubmitting}
                  className="flex items-center space-x-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition shadow-md"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Cautela Deferida/Ativa pelo Armeiro (Permitido em até 15 minutos após a autorização) */}
      {editingActiveCautela && (() => {
        const activeModalWin = getActiveCautelaEditWindow(editingActiveCautela);
        const currentReqResolved = getResolvedRequester(editingActiveCautela);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto animate-in fade-in">
            <div className="bg-slate-900 border border-sky-600/60 rounded-2xl max-w-2xl w-full p-5 sm:p-6 my-auto space-y-4 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-start justify-between border-b border-slate-800 pb-3 gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-sky-500/15 border border-sky-500/30 rounded-xl text-sky-400">
                    <Edit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      Editar Cautela Deferida / Ativa
                    </h3>
                    <p className="text-xs text-slate-400">
                      Edição permitida ao armeiro em até 15 minutos após o deferimento da cautela
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border flex items-center space-x-1.5 ${
                      activeModalWin.canEdit
                        ? 'bg-sky-950/70 border-sky-600/60 text-sky-300'
                        : 'bg-red-950/70 border-red-700 text-red-300'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {activeModalWin.canEdit
                        ? `Restam ${activeModalWin.remainingLabel}`
                        : 'Prazo encerrado'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingActiveCautela(null)}
                    className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
                    title="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {!activeModalWin.canEdit && (
                <div className="p-3 bg-red-950/50 border border-red-700 rounded-xl text-xs text-red-200 flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    O prazo máximo de <strong>15 minutos</strong> após a autorização expirou. Esta cautela não pode mais ser alterada.
                  </span>
                </div>
              )}

              <form onSubmit={handleConfirmEditActiveCautela} className="space-y-4">
                {/* 1. Policial Responsável pela Cautela */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Policial Solicitante / Responsável
                    </label>
                    <select
                      value={activeEditRequesterId}
                      onChange={(e) => setActiveEditRequesterId(e.target.value)}
                      disabled={!activeModalWin.canEdit}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-sky-500 disabled:opacity-60"
                    >
                      {!availableUnitOfficers.some(u => u.id === activeEditRequesterId) && (
                        <option value={activeEditRequesterId}>
                          {currentReqResolved.name} — MASP: {currentReqResolved.masp}
                        </option>
                      )}
                      {availableUnitOfficers.map(u => (
                        <option key={`act-req-${u.id}`} value={u.id}>
                          {u.name} — MASP: {u.masp} ({u.cargo || 'Policial'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Carregadores
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={activeEditMagazines}
                      onChange={(e) =>
                        setActiveEditMagazines(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      disabled={!activeModalWin.canEdit}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono font-bold focus:border-sky-500 disabled:opacity-60"
                      required
                    />
                  </div>
                </div>

                {/* 2. Armamento e Motivo / Finalidade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Armamento Acautelado
                    </label>
                    <select
                      value={activeEditWeaponId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setActiveEditWeaponId(nextId);
                        const nextW = editableActiveWeapons.find(w => w.id === nextId);
                        if (nextW && nextW.id !== editingActiveCautela.weaponId && nextW.magazineQuantity) {
                          setActiveEditMagazines(nextW.magazineQuantity);
                        }
                        setActiveEditStockId('');
                      }}
                      disabled={!activeModalWin.canEdit}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-sky-500 disabled:opacity-60"
                      required
                    >
                      {editableActiveWeapons.map(w => (
                        <option key={`act-w-${w.id}`} value={w.id}>
                          {w.model} • Nº {w.serialNumber} ({w.caliber}){w.id === editingActiveCautela.weaponId ? ' [Atual]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Motivo / Finalidade
                    </label>
                    <select
                      value={activeEditReason}
                      onChange={(e) => setActiveEditReason(e.target.value)}
                      disabled={!activeModalWin.canEdit}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-sky-500 disabled:opacity-60"
                      required
                    >
                      <option value="Treinamento">Treinamento</option>
                      <option value="Operação">Operação</option>
                      <option value="Plantão">Plantão</option>
                      <option value="Serviço Ordinário">Serviço Ordinário</option>
                      {activeEditReason &&
                        !['Treinamento', 'Operação', 'Plantão', 'Serviço Ordinário'].includes(
                          activeEditReason
                        ) && <option value={activeEditReason}>{activeEditReason}</option>}
                    </select>
                  </div>
                </div>

                {/* 3. Munições vinculadas à cautela */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-600/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeEditWithAmmo}
                        onChange={(e) => setActiveEditWithAmmo(e.target.checked)}
                        disabled={!activeModalWin.canEdit}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                      />
                      <span className="text-xs font-bold text-slate-100">
                        Acautelar munições junto com a arma?
                      </span>
                    </label>
                    <span
                      className={`text-[10px] font-semibold ${
                        activeEditWithAmmo ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {activeEditWithAmmo
                        ? 'Munições vinculadas ativas'
                        : 'Somente armamento (sem munição)'}
                    </span>
                  </div>
                </div>

                {activeEditWithAmmo && (
                  <div className="space-y-3 pt-1 border-t border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Quantidade de Munições
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="300"
                          value={activeEditAmmoQty}
                          onChange={(e) =>
                            setActiveEditAmmoQty(Math.max(1, parseInt(e.target.value, 10) || 1))
                          }
                          disabled={!activeModalWin.canEdit}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono font-bold focus:border-amber-500 disabled:opacity-60"
                          required={activeEditWithAmmo}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Destinação
                        </label>
                        <select
                          value={activeEditAmmoDestinacao}
                          onChange={(e) => {
                            const nextDest = e.target.value as 'Treinamento' | 'Defesa' | 'Ensaio';
                            setActiveEditAmmoDestinacao(nextDest);
                            setActiveEditSeraDevolvida(nextDest === 'Defesa');
                            setActiveEditStockId('');
                          }}
                          disabled={!activeModalWin.canEdit}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium focus:border-amber-500 disabled:opacity-60"
                        >
                          <option value="Treinamento">Treinamento</option>
                          <option value="Defesa">Defesa</option>
                          <option value="Ensaio">Ensaio</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>De qual cofre / lote vai tirar as munições?</span>
                        <span className="text-[10px] text-amber-400 font-mono font-normal">
                          {availableAmmoForActiveEdit.length} lote(s) disponível(is)
                        </span>
                      </label>

                      {availableAmmoForActiveEdit.length === 0 ? (
                        <div className="p-3 bg-red-950/40 border border-red-800 text-xs text-red-300 rounded-xl">
                          ⚠ Não há munições disponíveis para a destinação{' '}
                          <strong>{activeEditAmmoDestinacao}</strong> no calibre{' '}
                          <strong>
                            {activeEditSelectedWeapon?.caliber || editingActiveCautela.weaponCaliber}
                          </strong>{' '}
                          nesta unidade.
                        </div>
                      ) : (
                        <select
                          value={activeEditStockId}
                          onChange={(e) => setActiveEditStockId(e.target.value)}
                          disabled={!activeModalWin.canEdit}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500 disabled:opacity-60"
                          required={activeEditWithAmmo}
                        >
                          {availableAmmoForActiveEdit.map(st => {
                            const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                            const cal = calibers.find(c => c.id === st.caliberId);
                            return (
                              <option key={`act-st-${st.id}`} value={st.id}>
                                {vault ? vault.code : 'Cofre'} • {st.fabricante || 'CBC'} • Calibre:{' '}
                                {cal
                                  ? cal.name
                                  : st.caliberId ||
                                    activeEditSelectedWeapon?.caliber ||
                                    editingActiveCautela.weaponCaliber}{' '}
                                • Tipo: {st.tipoMunicao || 'Comum'} • Peso: {st.pesoMunicao || 'N/I'}{' '}
                                • Lote: {st.loteMunicao || 'S/L'} — Saldo disp.: {st.effectiveQuantity}{' '}
                                un.
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>

                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                      <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Tipo de Retirada da Munição
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label
                          className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center space-x-2 ${
                            activeEditSeraDevolvida
                              ? 'bg-amber-950/40 border-amber-500 text-slate-100'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="activeEditRetiradaTipo"
                            checked={activeEditSeraDevolvida}
                            onChange={() => setActiveEditSeraDevolvida(true)}
                            disabled={!activeModalWin.canEdit}
                            className="text-amber-500"
                          />
                          <span className="font-bold">Irá devolver depois</span>
                        </label>

                        <label
                          className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center space-x-2 ${
                            !activeEditSeraDevolvida
                              ? 'bg-amber-950/40 border-amber-500 text-slate-100'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="activeEditRetiradaTipo"
                            checked={!activeEditSeraDevolvida}
                            onChange={() => setActiveEditSeraDevolvida(false)}
                            disabled={!activeModalWin.canEdit}
                            className="text-amber-500"
                          />
                          <span className="font-bold">Retirada permanente</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditAmmoComparison.showDivergenceJustification && (
                  <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-3 space-y-1.5">
                    <label className="block text-xs font-semibold text-amber-200 tracking-wide">
                      Usuário solicitou munição: {activeEditAmmoComparison.requestedAmmoConstant}
                    </label>
                    <textarea
                      value={activeEditNotes}
                      onChange={(e) => setActiveEditNotes(e.target.value)}
                      disabled={!activeModalWin.canEdit}
                      placeholder={`Justifique o depósito da munição ${activeEditAmmoComparison.selectedCaliberDisplay} - ${activeEditAmmoComparison.selectedTipoDisplay}`}
                      className="w-full bg-slate-950 border border-amber-700/50 focus:border-amber-500 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-amber-300/70 disabled:opacity-60"
                      rows={2}
                      required
                    />
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setEditingActiveCautela(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !activeModalWin.canEdit ||
                      isSubmitting ||
                      !activeEditWeaponId ||
                      (activeEditWithAmmo &&
                        (availableAmmoForActiveEdit.length === 0 || !activeEditStockId))
                    }
                    className="flex items-center space-x-1.5 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition shadow-md"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {isSubmitting
                        ? 'Salvando...'
                        : activeModalWin.canEdit
                          ? 'Salvar Alterações da Cautela'
                          : 'Prazo de 15 min Encerrado'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal de Confirmação para Excluir Solicitação de Cautela Pendente */}
      {cancelPendingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-red-800/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center space-x-3 text-red-400">
                <div className="p-3 bg-red-950/60 rounded-xl border border-red-800">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Excluir Solicitação de Cautela</h3>
                  <p className="text-xs text-slate-400">Permitido enquanto o armeiro da unidade não deferir ou indeferir</p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2.5">
                <p>
                  Você tem certeza que deseja excluir esta solicitação de cautela do armamento:
                </p>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono text-slate-200 space-y-1">
                  <div><strong>Modelo:</strong> {cancelPendingModal.weaponModel}</div>
                  <div><strong>Nº de Série:</strong> <span className="text-amber-400 font-bold">{cancelPendingModal.weaponSerialNumber}</span></div>
                  <div><strong>Calibre:</strong> {cancelPendingModal.weaponCaliber}</div>
                </div>
                <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-lg text-amber-300 text-[11px] leading-relaxed">
                  ● Ao excluir, esta solicitação será apagada e a arma voltará a ficar disponível no cofre (status "No Cofre") da sua unidade.
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setCancelPendingModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                >
                  Manter Solicitação
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleCancelPendingCautela(cancelPendingModal)}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-red-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Excluindo...' : 'Sim, Excluir Cautela'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Emissão de Relatório de Cautelas da Unidade (Armeiro) */}
        {isArmorerReportModalOpen && canAuthorize && (() => {
          const previewActivesCount = selectedEntityHistoryCautelas.filter(
            c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE'
          ).length;
          const previewInactivesCount = selectedEntityHistoryCautelas.filter(
            c => c.status === 'DEVOLVIDA'
          ).length;
          const previewWithAmmoCount = selectedEntityHistoryCautelas.filter(c => {
            const ad = getRescuedAmmoDetails(c);
            return ad.hasAmmo && ad.quantity > 0;
          }).length;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
              <div className="bg-slate-900 border border-emerald-700/70 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95">
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-emerald-500/15 rounded-xl border border-emerald-500/30 text-emerald-400">
                      <Printer className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">
                        Emitir Relatório de Cautelas — {unitSigla}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Imprima todas as cautelas de uma arma específica, todas as cautelas de um policial em forma de histórico ou o relatório da unidade, contendo todas as informações completas independentemente do filtro.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsArmorerReportModalOpen(false)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 1. Opções Principais: Histórico por Arma ou Histórico por Policial */}
                <div className="space-y-2.5">
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Histórico Individual (Arma ou Policial):
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setArmorerReportScope('POR_ARMA')}
                      className={`text-left p-4 rounded-xl border transition space-y-1.5 ${
                        armorerReportScope === 'POR_ARMA'
                          ? 'bg-emerald-500/15 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/40'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center space-x-2">
                          <Crosshair className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Todas as Cautelas de uma Arma</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                          {armorerReportPreview.weaponOptions.length} arma(s)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Imprime em forma de histórico <strong>todas as cautelas de um armamento específico</strong> com todos os dados completos de policiais, retiradas, devoluções e munições.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setArmorerReportScope('POR_POLICIAL')}
                      className={`text-left p-4 rounded-xl border transition space-y-1.5 ${
                        armorerReportScope === 'POR_POLICIAL'
                          ? 'bg-sky-500/15 border-sky-500 text-slate-100 ring-1 ring-sky-500/40'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-sky-300 flex items-center space-x-2">
                          <Shield className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>Todas as Cautelas de um Policial</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-700/60">
                          {armorerReportPreview.userOptions.length} policial(is)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Imprime em forma de histórico <strong>todas as cautelas de um policial específico</strong> com todos os dados completos do servidor, armas, retiradas, devoluções e munições.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Painel de Seleção de Arma quando POR_ARMA */}
                {armorerReportScope === 'POR_ARMA' && (
                  <div className="bg-slate-950 border border-emerald-700/50 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                          Pesquisar Arma (Modelo / Série / Calibre):
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={armorerReportWeaponSearch}
                            onChange={(e) => setArmorerReportWeaponSearch(e.target.value)}
                            placeholder="Filtrar lista de armas..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-7">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                          Selecione a Arma para o Histórico:
                        </label>
                        <select
                          value={armorerReportWeaponKey}
                          onChange={(e) => setArmorerReportWeaponKey(e.target.value)}
                          className="w-full bg-slate-900 border border-emerald-600/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-emerald-400"
                        >
                          {filteredReportWeaponOptions.length === 0 ? (
                            <option value="">Nenhuma arma encontrada para a pesquisa</option>
                          ) : (
                            filteredReportWeaponOptions.map(w => (
                              <option key={w.key} value={w.key}>
                                {w.label}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] font-semibold text-slate-400">
                        Recorte de situação no histórico da arma:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'TODAS', label: 'Todas as Cautelas (Histórico Completo)' },
                          { id: 'ATIVAS', label: 'Somente Ativas' },
                          { id: 'INATIVAS', label: 'Somente Inativas (Devolvidas)' }
                        ].map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setArmorerReportStatusSubFilter(
                                item.id as 'TODAS' | 'ATIVAS' | 'INATIVAS'
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                              armorerReportStatusSubFilter === item.id
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Painel de Seleção de Policial quando POR_POLICIAL */}
                {armorerReportScope === 'POR_POLICIAL' && (
                  <div className="bg-slate-950 border border-sky-700/50 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                          Pesquisar Policial (Nome / MASP):
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={armorerReportUserSearch}
                            onChange={(e) => setArmorerReportUserSearch(e.target.value)}
                            placeholder="Filtrar lista de policiais..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-7">
                        <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                          Selecione o Policial para o Histórico:
                        </label>
                        <select
                          value={armorerReportUserKey}
                          onChange={(e) => setArmorerReportUserKey(e.target.value)}
                          className="w-full bg-slate-900 border border-sky-600/60 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-sky-400"
                        >
                          {filteredReportUserOptions.length === 0 ? (
                            <option value="">Nenhum policial encontrado para a pesquisa</option>
                          ) : (
                            filteredReportUserOptions.map(u => (
                              <option key={u.key} value={u.key}>
                                {u.label}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] font-semibold text-slate-400">
                        Recorte de situação no histórico do policial:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'TODAS', label: 'Todas as Cautelas (Histórico Completo)' },
                          { id: 'ATIVAS', label: 'Somente Ativas' },
                          { id: 'INATIVAS', label: 'Somente Inativas (Devolvidas)' }
                        ].map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setArmorerReportStatusSubFilter(
                                item.id as 'TODAS' | 'ATIVAS' | 'INATIVAS'
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                              armorerReportStatusSubFilter === item.id
                                ? 'bg-sky-500 text-slate-950 border-sky-400 font-black'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Opções Gerais da Unidade (Ativas / Ativas e Inativas / Somente Inativas) */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Ou Relatório Geral da Unidade ({unitSigla}):
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setArmorerReportScope('ATIVAS')}
                      className={`text-left p-3 rounded-xl border transition space-y-1 ${
                        armorerReportScope === 'ATIVAS'
                          ? 'bg-emerald-500/15 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/40'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black uppercase text-emerald-300">
                          Somente Ativas
                        </span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400">
                          {armorerReportPreview.activeCautelas.length}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Todos os usuários com cautelas ativas na unidade.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setArmorerReportScope('ATIVAS_E_INATIVAS')}
                      className={`text-left p-3 rounded-xl border transition space-y-1 ${
                        armorerReportScope === 'ATIVAS_E_INATIVAS'
                          ? 'bg-amber-500/15 border-amber-500 text-slate-100 ring-1 ring-amber-500/40'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black uppercase text-amber-300">
                          Ativas e Inativas
                        </span>
                        <span className="text-[10px] font-mono font-bold text-amber-400">
                          {armorerReportPreview.activeCautelas.length + armorerReportPreview.inactiveCautelas.length}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Relatório geral ativo e histórico devolvido.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setArmorerReportScope('SOMENTE_INATIVAS')}
                      className={`text-left p-3 rounded-xl border transition space-y-1 ${
                        armorerReportScope === 'SOMENTE_INATIVAS'
                          ? 'bg-slate-800 border-slate-400 text-slate-100 ring-1 ring-slate-400/40'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black uppercase text-slate-200">
                          Somente Inativas
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-300">
                          {armorerReportPreview.inactiveCautelas.length}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Todas as cautelas recebidas e devolvidas.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Resumo quantitativo do relatório selecionado */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                      Prévia dos Registros Selecionados no Relatório:
                    </span>
                    <span className="font-mono font-bold text-emerald-300">
                      {selectedEntityHistoryCautelas.length} registro(s) completo(s)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                      <div className="text-sm font-black text-slate-100 font-mono">
                        {selectedEntityHistoryCautelas.length}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Total no Relatório</div>
                    </div>
                    <div className="bg-slate-900 border border-emerald-800/40 rounded-lg p-2">
                      <div className="text-sm font-black text-emerald-400 font-mono">
                        {previewActivesCount}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Cautelas Ativas</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2">
                      <div className="text-sm font-black text-slate-200 font-mono">
                        {previewInactivesCount}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Inativas / Devolvidas</div>
                    </div>
                    <div className="bg-slate-900 border border-amber-800/40 rounded-lg p-2">
                      <div className="text-sm font-black text-amber-400 font-mono">
                        {previewWithAmmoCount}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">C/ Munição Vinculada</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    ● Independentemente do tipo de filtro (por arma, por policial ou geral da unidade), cada registro impresso contém <strong>todas as informações completas</strong>: dados do policial, dados do armamento, solicitação/autorização/retirada, devolução/condição técnica e detalhamento das munições vinculadas.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsArmorerReportModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      (armorerReportScope === 'POR_ARMA' && !armorerReportWeaponKey) ||
                      (armorerReportScope === 'POR_POLICIAL' && !armorerReportUserKey)
                    }
                    onClick={handlePrintArmorerCautelasReport}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs transition shadow-lg"
                  >
                    <Printer className="w-4 h-4" />
                    <span>
                      {armorerReportScope === 'POR_ARMA'
                        ? 'Imprimir Histórico da Arma'
                        : armorerReportScope === 'POR_POLICIAL'
                          ? 'Imprimir Histórico do Policial'
                          : armorerReportScope === 'ATIVAS'
                            ? 'Imprimir Somente Cautelas Ativas'
                            : armorerReportScope === 'SOMENTE_INATIVAS'
                              ? 'Imprimir Somente Cautelas Inativas'
                              : 'Imprimir Ativas e Inativas'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal de Impressão do Histórico de Cautelas (Policial) */}
        {isPrintHistoryModalOpen && !canAuthorize && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-sky-800/70 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-sky-500/15 rounded-xl border border-sky-500/30 text-sky-400">
                    <Printer className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      Imprimir Histórico de Cautelas de Armas
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Gere a impressão filtrando por data, armas ou ativas, ou imprima o relatório completo de todo o período (incluindo dados das munições vinculadas).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPrintHistoryModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Seleção do Modo de Impressão */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPrintMode('COMPLETO')}
                  className={`text-left p-3.5 rounded-xl border transition space-y-1 ${
                    printMode === 'COMPLETO'
                      ? 'bg-sky-500/15 border-sky-500 text-slate-100 ring-1 ring-sky-500/40'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-sky-300">
                      Relatório Completo (Todo o Período)
                    </span>
                    {printMode === 'COMPLETO' && <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Inclui todas as cautelas <strong>ativas, devolvidas e indeferidas</strong> por todo o período, além das munições vinculadas.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintMode('FILTRADO')}
                  className={`text-left p-3.5 rounded-xl border transition space-y-1 ${
                    printMode === 'FILTRADO'
                      ? 'bg-amber-500/15 border-amber-500 text-slate-100 ring-1 ring-amber-500/40'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                      Filtrar Impressão
                    </span>
                    {printMode === 'FILTRADO' && <Filter className="w-4 h-4 text-amber-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Permite filtrar especificamente por <strong>data/período, armas e situação</strong> (ativas, devolvidas ou indeferidas).
                  </p>
                </button>
              </div>

              {/* Opções de Filtro quando printMode === 'FILTRADO' */}
              {printMode === 'FILTRADO' && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Situação das Cautelas:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'TODAS', label: `Todas (${meuHistoricoTotalCount})` },
                        { id: 'ATIVAS', label: `Somente Ativas (${meuHistoricoAtivasCount})` },
                        { id: 'DEVOLVIDAS', label: `Devolvidas (${meuHistoricoDevolvidasCount})` },
                        { id: 'INDEFERIDAS', label: `Indeferidas (${indeferidasCount})` },
                        { id: 'DEFERIDAS', label: `Deferidas (${meuHistoricoDeferidasCount})` }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPrintStatusFilter(opt.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                            printStatusFilter === opt.id
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                        Filtrar por Arma:
                      </label>
                      <select
                        value={printWeaponFilter}
                        onChange={(e) => setPrintWeaponFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-amber-500"
                      >
                        <option value="TODAS">Todas as Armas do Histórico ({userHistoryWeapons.length})</option>
                        {userHistoryWeapons.map(w => (
                          <option key={w.key} value={w.key}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                        Data Inicial:
                      </label>
                      <input
                        type="date"
                        value={printStartDate}
                        onChange={(e) => setPrintStartDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                        Data Final:
                      </label>
                      <input
                        type="date"
                        value={printEndDate}
                        onChange={(e) => setPrintEndDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {(printStartDate || printEndDate || printWeaponFilter !== 'TODAS' || printStatusFilter !== 'TODAS') && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPrintStartDate('');
                          setPrintEndDate('');
                          setPrintWeaponFilter('TODAS');
                          setPrintStatusFilter('TODAS');
                        }}
                        className="text-[11px] font-bold text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Redefinir filtros de impressão</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Resumo prévio do que sairá na impressão */}
              {(() => {
                const prevAtivas = printPreviewList.filter(c => c.status === 'AUTORIZADA').length;
                const prevDevolvidas = printPreviewList.filter(c => c.status === 'DEVOLVIDA' || c.status === 'DEVOLUCAO_PENDENTE').length;
                const prevIndeferidas = printPreviewList.filter(c => c.status === 'RECUSADA').length;
                const prevComMunicao = printPreviewList.filter(c => {
                  const ad = getRescuedAmmoDetails(c);
                  return ad.hasAmmo && ad.quantity > 0;
                }).length;

                return (
                  <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                        Prévia dos Registros no Relatório:
                      </span>
                      <span className="font-mono font-bold text-sky-300">
                        {printPreviewList.length} cautela(s) selecionada(s)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-slate-900 border border-emerald-800/40 rounded-lg p-2">
                        <div className="text-sm font-black text-emerald-400 font-mono">{prevAtivas}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Ativas</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                        <div className="text-sm font-black text-slate-200 font-mono">{prevDevolvidas}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Devolvidas</div>
                      </div>
                      <div className="bg-slate-900 border border-red-900/40 rounded-lg p-2">
                        <div className="text-sm font-black text-red-400 font-mono">{prevIndeferidas}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Indeferidas</div>
                      </div>
                      <div className="bg-slate-900 border border-amber-800/40 rounded-lg p-2">
                        <div className="text-sm font-black text-amber-400 font-mono">{prevComMunicao}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">C/ Munição Vinculada</div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      ● Cautelas com munição vinculada exibem automaticamente calibre, quantidade, fabricante, tipo, peso, lote, destinação e regime de devolução.
                    </p>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPrintHistoryModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {printMode === 'FILTRADO' && (
                    <button
                      type="button"
                      onClick={() => handlePrintPolicialHistory(true)}
                      className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-700/60 rounded-xl text-xs font-bold transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      <span>Imprimir Completo (Todo o Período)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePrintPolicialHistory()}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs transition shadow-lg"
                  >
                    <Printer className="w-4 h-4" />
                    <span>
                      {printMode === 'COMPLETO'
                        ? 'Imprimir Relatório Completo'
                        : 'Imprimir Relatório Filtrado'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
