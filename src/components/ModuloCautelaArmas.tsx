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

  // Tabs: Minhas Cautelas (Aguardando Ação do Armeiro), Deferidas (Autorizadas/Devolvidas), Indeferidas, Nova
  const [activeTab, setActiveTab] = useState<'MINHAS' | 'DEFERIDAS' | 'INDEFERIDAS' | 'NOVA'>('MINHAS');
  const [deferidasSubFilter, setDeferidasSubFilter] = useState<'TODAS' | 'ATIVAS' | 'DEVOLVIDAS'>('TODAS');

  const [lastDirectCautelaArma, setLastDirectCautelaArma] = useState<CautelaArma | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'DEFERIDAS' | 'INDEFERIDAS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLUCAO_PENDENTE' | 'DEVOLVIDA' | 'RECUSADA'>('TODOS');
  const [historyWeaponFilter, setHistoryWeaponFilter] = useState<string>('TODAS');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');
  const [historyDecisionFilter, setHistoryDecisionFilter] = useState<'TODAS' | 'ATIVAS' | 'DEFERIDA' | 'INDEFERIDAS'>('TODAS');

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
            requesterId: (w as any).destinatarioId || 'policial',
            requesterName: reqName || 'Policial da Unidade',
            requesterMasp: reqMasp !== 'N/A' ? reqMasp : 'Masp da Cautela',
            requesterCargo: 'Investigador / Policial',
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
            status: 'AUTORIZADA',
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

  // Lista a exibir com base na aba ativa
  const displayedCautelas = useMemo(() => {
    let list = [...scopedCautelas];

    if (activeTab === 'MINHAS') {
      // Aba "Cautela de arma em análise" (Policial) / "Solicitações Pendentes" (Armeiro):
      // exibe todas as cautelas de armas aguardando algum comando do armeiro (autorização inicial ou recibo de devolução)
      list = list.filter(c => isAwaitingArmorerCommand(c.status));
    } else if (activeTab === 'DEFERIDAS') {
      if (!canAuthorize) {
        // Aba "Minhas Cautelas" (Policial): exibe por padrão estritamente as cautelas ATIVAS EM POSSE (sem histórico de devolvidas)
        list = list.filter(c => c.status === 'AUTORIZADA');
      } else {
        // Aba "Deferidas / Ativas (Unidade)" (Armeiro): mantém visão de AUTORIZADA, DEVOLUCAO_PENDENTE e DEVOLVIDA
        list = list.filter(c =>
          c.status === 'AUTORIZADA' ||
          c.status === 'DEVOLUCAO_PENDENTE' ||
          c.status === 'DEVOLVIDA'
        );
        if (deferidasSubFilter === 'ATIVAS') {
          list = list.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLUCAO_PENDENTE');
        } else if (deferidasSubFilter === 'DEVOLVIDAS') {
          list = list.filter(c => c.status === 'DEVOLVIDA');
        }
      }
    } else if (activeTab === 'INDEFERIDAS') {
      if (canAuthorize) {
        // Aba "Indeferidas (Unidade)" (Armeiro): cautelas recusadas da unidade
        list = list.filter(c => c.status === 'RECUSADA');
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
          const toLocalYMD = (iso?: string) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          };
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
      const term = searchTerm.toLowerCase();
      list = list.filter(c => {
        const reqResolved = getResolvedRequester(c);
        return (
          (c.weaponSerialNumber && c.weaponSerialNumber.toLowerCase().includes(term)) ||
          (c.weaponModel && c.weaponModel.toLowerCase().includes(term)) ||
          (c.weaponCaliber && c.weaponCaliber.toLowerCase().includes(term)) ||
          (c.requesterName && c.requesterName.toLowerCase().includes(term)) ||
          (c.requesterMasp && c.requesterMasp.toLowerCase().includes(term)) ||
          (reqResolved.name && reqResolved.name.toLowerCase().includes(term)) ||
          (reqResolved.masp && reqResolved.masp.toLowerCase().includes(term)) ||
          (c.armorerName && c.armorerName.toLowerCase().includes(term)) ||
          (c.reason && c.reason.toLowerCase().includes(term)) ||
          (c.authorizationNotes && c.authorizationNotes.toLowerCase().includes(term))
        );
      });
    }

    // Na aba "Meu Histórico" do policial, a cautela ativa fica SEMPRE fixa como primeiro resultado
    if (!canAuthorize && activeTab === 'INDEFERIDAS') {
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
    }

    return list;
  }, [
    scopedCautelas,
    activeTab,
    deferidasSubFilter,
    searchTerm,
    canAuthorize,
    historyDecisionFilter,
    historyWeaponFilter,
    historyDateFilter,
    getResolvedRequester
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

  const deferidasCount = useMemo(() => {
    if (!canAuthorize) {
      return scopedCautelas.filter(c => c.status === 'AUTORIZADA').length;
    }
    return scopedCautelas.filter(c =>
      c.status === 'AUTORIZADA' ||
      c.status === 'DEVOLUCAO_PENDENTE' ||
      c.status === 'DEVOLVIDA'
    ).length;
  }, [scopedCautelas, canAuthorize]);

  const activeCautelasCount = useMemo(() => {
    return scopedCautelas.filter(c =>
      c.status === 'AUTORIZADA' ||
      (canAuthorize && c.status === 'DEVOLUCAO_PENDENTE')
    ).length;
  }, [scopedCautelas, canAuthorize]);

  const returnedCautelasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'DEVOLVIDA').length;
  }, [scopedCautelas]);

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
    // 1. Match direto pelo vínculo explícito da cautela de munições
    const exact = list.find(m =>
      (cautela.linkedAmmoCautelaId && m.id === cautela.linkedAmmoCautelaId) ||
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

    return {
      hasAmmo,
      linkedAmmo,
      linkedCautelaId,
      quantity,
      seraDevolvida, // true = munição passiva de devolução ("Irá devolver depois")
      caliberName: linkedAmmo?.caliberName || cautela.ammoCaliberName || cautela.weaponCaliber || 'Padrão',
      fabricante: linkedAmmo?.fabricante || cautela.ammoFabricante || 'CBC',
      tipoMunicao: linkedAmmo?.tipoMunicao || cautela.ammoTipo || 'Operacional',
      pesoMunicao: linkedAmmo?.pesoMunicao || cautela.ammoPeso || 'N/I',
      loteMunicao: linkedAmmo?.loteMunicao || cautela.ammoLote || 'Lote Unidade',
      destinacao: linkedAmmo?.destinacao || cautela.ammoDestinacao || 'Defesa',
      vaultSpaceId: linkedAmmo?.vaultSpaceId || ''
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
          setLastDirectCautelaArma(newCautelaObj);
          setSuccessMsg(`Arma ${weapon.model} (Série: ${weapon.serialNumber}) acautelada com sucesso para o policial ${beneficiary.name}! A cautela foi deferida diretamente e o recibo gerado imediatamente.`);
          setTimeout(() => {
            handlePrintTermo(newCautelaObj);
          }, 150);
          setActiveTab('DEFERIDAS');
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
        setSuccessMsg(
          `Cautela da arma ${authorizingCautela.weaponModel} (Série: ${authorizingCautela.weaponSerialNumber}) autorizada com sucesso! A arma passou de "Cautela Pendente" para "Acautelada — ${resolvedAuthReq.name} (MASP: ${resolvedAuthReq.masp})".${
            authWithAmmo
              ? ` Cautela de munições (${authAmmoQty} un. • Destinação: ${authAmmoDestinacao}) gerada em nome de ${resolvedAuthReq.name}.`
              : ' Cautela exclusiva do armamento (sem geração de cautela de munições).'
          }`
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
    if (!canAuthorize || (activeTab !== 'DEFERIDAS' && !editingActiveCautela)) return;
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
        setSuccessMsg(
          `Cautela ativa atualizada com sucesso dentro do prazo de 15 minutos! Arma: ${chosenWeapon.model} (Série: ${chosenWeapon.serialNumber}) — Policial: ${finalReqName} (MASP: ${finalReqMasp}).`
        );
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
    return vaultSpaces.filter(v => 
      (!v.unitId || v.unitId === targetUnit) && 
      (v.type === 'ARMAS' || !v.type)
    );
  }, [returningCautela, vaultSpaces, currentUser.unitId]);

  // Cofres de Munições na unidade
  const availableAmmoVaults = useMemo(() => {
    if (!returningCautela) return [];
    const targetUnit = returningCautela.unitId || currentUser.unitId;
    return vaultSpaces.filter(v => 
      (!v.unitId || v.unitId === targetUnit) && 
      (v.type === 'MUNIÇÕES' || (v.type as string) === 'MUNIÇÃO' || (v.type as string) === 'MUNICAO' || !v.type)
    );
  }, [returningCautela, vaultSpaces, currentUser.unitId]);

  // Abrir Modal de Devolução (ou Conferência de Recibo pelo Armeiro)
  const handleOpenReturnModal = (cautela: CautelaArma) => {
    setErrorMsg('');
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

    setReturnVaultSpaceId(cautela.vaultSpaceId || '');

    if (ammoDetails.vaultSpaceId) {
      setReturnAmmoVaultSpaceId(ammoDetails.vaultSpaceId);
    } else {
      const firstAmmoVault = vaultSpaces.find(v => 
        (!v.unitId || v.unitId === (cautela.unitId || currentUser.unitId)) &&
        (v.type === 'MUNIÇÕES' || (v.type as string) === 'MUNIÇÃO' || (v.type as string) === 'MUNICAO')
      );
      setReturnAmmoVaultSpaceId(firstAmmoVault?.id || cautela.vaultSpaceId || '');
    }
  };

  // Concluir Devolução (Policial envia como Pendente de Recibo; Armeiro confirma Recibo e guarda no cofre)
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
    if (ammoDetails.hasAmmo && ammoDetails.seraDevolvida) {
      const retQty = Number(returnedAmmoQuantity);
      if (isNaN(retQty) || retQty < 0 || retQty > ammoDetails.quantity) {
        setErrorMsg(`Informe uma quantidade válida de munições devolvidas (entre 0 e ${ammoDetails.quantity}).`);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const selectedVault = vaultSpaces.find(v => v.id === returnVaultSpaceId);
      const isPassivaDevolucao = ammoDetails.hasAmmo && ammoDetails.seraDevolvida;
      const sanitizedReturnedAmmo = isPassivaDevolucao
        ? Math.min(ammoDetails.quantity, Math.max(0, Number(returnedAmmoQuantity) || 0))
        : undefined;
      const usedAmmoCount = isPassivaDevolucao
        ? Math.max(0, ammoDetails.quantity - (sanitizedReturnedAmmo ?? 0))
        : (hadShots ? (Number(shotsFired) || 0) : 0);

      const res = await storage.returnCautelaArma(returningCautela.id, {
        weaponId: returningCautela.weaponId,
        weaponSerialNumber: returningCautela.weaponSerialNumber,
        cautelaId: returningCautela.id,
        requesterName: returningCautela.requesterName,
        requesterMasp: returningCautela.requesterMasp,
        requesterCargo: returningCautela.requesterCargo,
        hadShots,
        shotsFired: hadShots ? Number(shotsFired) || 0 : 0,
        ammoUsedCount: usedAmmoCount,
        returnedAmmoQuantity: sanitizedReturnedAmmo,
        pendingReceipt: isPolicial,
        ammoDestinationVaultSpaceId: canAuthorize
          ? (returnAmmoVaultSpaceId || ammoDetails.vaultSpaceId || returnVaultSpaceId)
          : undefined,
        isWorking,
        defectDescription: !isWorking ? defectDescription.trim() : null,
        hadMalfunction,
        malfunctionDescription: hadMalfunction ? malfunctionDescription.trim() : null,
        returnedMagazinesCount,
        destinationVaultSpaceId: canAuthorize
          ? (returnVaultSpaceId || returningCautela.vaultSpaceId)
          : undefined,
        returnObservations: returnObservations.trim()
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar devolução.');
      } else {
        if (isPolicial || res.pendingReceipt) {
          setSuccessMsg(
            `Devolução da arma ${returningCautela.weaponModel} (Série: ${returningCautela.weaponSerialNumber}) registrada e encaminhada! O registro encontra-se na aba "Cautela de arma em análise" aguardando recibo pelo armeiro.`
          );
          setActiveTab('MINHAS');
        } else {
          const destText = selectedVault ? `no cofre ${selectedVault.code}` : 'ao cofre da unidade';
          setSuccessMsg(
            `Recibo de devolução confirmado! Arma ${returningCautela.weaponModel} (Série: ${returningCautela.weaponSerialNumber}) devolvida e guardada com sucesso ${destText}.${
              ammoDetails.hasAmmo
                ? isPassivaDevolucao
                  ? ` Munições devolvidas (${sanitizedReturnedAmmo} un.) conferidas e recolocadas no cofre.`
                  : ' Cautela de munição vinculada encerrada.'
                : ''
            }`
          );
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
            {!canAuthorize && (
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
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-200">
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
          <span>{canAuthorize ? 'Solicitações Pendentes (Armeiro)' : 'Cautela de arma em análise'}</span>
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
          <span>{canAuthorize ? 'Deferidas / Ativas (Unidade)' : 'Minhas Cautelas'}</span>
          {deferidasCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
              {deferidasCount}
            </span>
          )}
        </button>

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
          <span>{canAuthorize ? 'Indeferidas (Unidade)' : 'Meu Histórico'}</span>
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
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por arma, série, calibre ou motivo..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500"
                />
              </div>

              {/* Sub-filtros para a aba Deferidas (Apenas para Armeiro; para Policial o padrão fixo é Ativas em Posse sem filtros de Todas/Devolvidas) */}
              {activeTab === 'DEFERIDAS' && (
                canAuthorize ? (
                  <div className="flex items-center space-x-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
                    {[
                      { id: 'TODAS', label: `Todas (${deferidasCount})` },
                      { id: 'ATIVAS', label: `Ativas em Posse (${activeCautelasCount})` },
                      { id: 'DEVOLVIDAS', label: `Devolvidas ao Cofre (${returnedCautelasCount})` }
                    ].map(item => (
                      <button
                        key={item.id}
                        onClick={() => setDeferidasSubFilter(item.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                          deferidasSubFilter === item.id
                            ? 'bg-emerald-600 text-slate-950 font-black shadow-sm'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    <span className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 text-slate-950 shadow-sm whitespace-nowrap">
                      Ativas em Posse ({activeCautelasCount})
                    </span>
                  </div>
                )
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
                                    ? `Devoluções de Armamento Pendentes de Recibo pelo Armeiro — ${userUnit?.name || 'Unidade'}`
                                    : 'Cautelas em Análise de Devolução (Aguardando Recibo do Armeiro)'}
                                </h4>
                              </div>
                              <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/70 px-2.5 py-0.5 rounded-md border border-amber-700/70">
                                {devolucoesPendentes.length} aguardando recibo
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
                                              Devolução Pendente de Recibo
                                            </span>
                                          </div>
                                          <p className="text-xs text-amber-300/90 mt-1 flex items-center space-x-1.5 font-medium">
                                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                                            <span>Aguardando comando do Armeiro para conferência e recibo da devolução ao cofre</span>
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
                                            className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-black transition shadow-md"
                                          >
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Confirmar Recibo de Devolução</span>
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

                  {/* Seção: Minhas Cautelas Ativas em Posse (Policial) / Cautelas Ativas (Armeiro) */}
                  {activeTab === 'DEFERIDAS' && (!canAuthorize || deferidasSubFilter === 'TODAS' || deferidasSubFilter === 'ATIVAS') && (() => {
                    const ativasList = displayedCautelas.filter(c => c.status === 'AUTORIZADA' || (canAuthorize && c.status === 'DEVOLUCAO_PENDENTE'));
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                              {canAuthorize 
                                ? `Armamentos Acautelados / Cautelas Ativas — ${userUnit?.name || 'Unidade'}` 
                                : 'Minhas Cautelas — Ativas em Posse'}
                            </h4>
                          </div>
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
                            {ativasList.length} arma(s) ativa(s)
                          </span>
                        </div>

                        {ativasList.length === 0 ? (
                          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                            {canAuthorize 
                              ? `Nenhum armamento da unidade ${userUnit?.name || ''} está acautelado no momento.` 
                              : 'Você não possui nenhuma arma acautelada ativa no momento.'}
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
                                Solicitações Indeferidas — {userUnit?.name || 'Unidade'}
                              </h4>
                            </div>
                            <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800/60">
                              {recusadas.length} recusada(s)
                            </span>
                          </div>

                          {recusadas.length === 0 ? (
                            <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                              Nenhuma solicitação de armamento foi indeferida na unidade {userUnit?.name || ''}.
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

                  {/* Seção 4: Histórico de Cautelas Devolvidas (Exclusivo para Armeiro; Policial não exibe div Histórico) */}
                  {canAuthorize && activeTab === 'DEFERIDAS' && (deferidasSubFilter === 'TODAS' || deferidasSubFilter === 'DEVOLVIDAS') && (() => {
                    const devolvidas = scopedCautelas.filter(c => c.status === 'DEVOLVIDA');
                    return (
                      <div className="space-y-3 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              {canAuthorize 
                                ? `Histórico de Devoluções — ${userUnit?.name || 'Unidade'}` 
                                : 'Histórico de Armas Devolvidas'}
                            </h4>
                          </div>
                          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                            {devolvidas.length} registro(s)
                          </span>
                        </div>

                        {devolvidas.length === 0 ? (
                          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                            {canAuthorize 
                              ? `Nenhum histórico de devolução de armas registrado na unidade ${userUnit?.name || ''}.` 
                              : 'Nenhum histórico de devolução de armas registrado.'}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {devolvidas.map(cautela => {
                              const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);
                              const returnVaultId = cautela.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
                              const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
                              const returnUnit = units.find(u => u.id === returnVault?.unitId);
                              const returnVaultAddress = returnVault 
                                ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}` 
                                : 'Cofre de Origem';

                              return (
                                <div
                                  key={cautela.id}
                                  className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition space-y-3 opacity-90"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                    <div className="flex items-center space-x-3">
                                      <div className="p-2.5 rounded-xl border bg-slate-800 border-slate-700 text-slate-300">
                                        <Crosshair className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <div className="flex items-center space-x-2">
                                          <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                          <span className="font-mono text-xs text-amber-400 font-bold">
                                            Nº {cautela.weaponSerialNumber}
                                          </span>
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-slate-800 text-slate-300 border-slate-700">
                                            Devolvida ao Cofre
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                          Devolvida em {cautela.returnDate ? new Date(cautela.returnDate).toLocaleString('pt-BR') : 'N/A'} por {cautela.returnArmorerName || 'Armeiro'}
                                        </p>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => handlePrintTermo(cautela)}
                                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                      title="Imprimir Termo de Devolução de Armamento"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Imprimir Termo</span>
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Cofre de Retorno</span>
                                      <span className="font-mono text-slate-200 font-bold truncate block" title={returnVault ? `Cofre ${returnVault.code} - ${returnUnit?.name || 'Unidade'}` : 'Cofre de Origem'}>
                                        {returnVaultAddress}
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
                                      <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Recebedor</span>
                                      <span className="text-slate-200 font-semibold truncate block">
                                        {cautela.returnArmorerName ? `${cautela.returnArmorerName} (${cautela.returnArmorerMasp})` : 'N/A'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center space-x-3">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        cautela.hadShots ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        {cautela.hadShots ? `${cautela.shotsFired} tiros efetuados` : 'Zero tiros'}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        cautela.isWorking ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                                      }`}>
                                        {cautela.isWorking ? 'Em Condições de Uso' : 'Apresenta Defeito (Manutenção)'}
                                      </span>
                                      {cautela.hadMalfunction && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">
                                          Pane Relatada
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      Devolvido em {new Date(cautela.returnDate || cautela.updatedAt || '').toLocaleString('pt-BR')} por {cautela.returnArmorerName || 'Armeiro'}
                                    </div>
                                  </div>
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

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl my-auto space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                    <RotateCcw className="w-5 h-5 text-amber-400" />
                    <span>
                      {isArmorerConfirmingPending
                        ? 'Conferência e Recibo de Devolução ao Cofre'
                        : 'Devolução de Armamento ao Cofre'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Arma: <strong>{returningCautela.weaponModel}</strong> (Série: <span className="font-mono">{returningCautela.weaponSerialNumber}</span>)
                    {returningCautela.weaponCaliber ? ` • Calibre: ${returningCautela.weaponCaliber}` : ''}
                  </p>
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
                <div className="p-3 bg-emerald-950/40 border border-emerald-700/60 rounded-xl text-xs text-emerald-200 flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-emerald-300 block">Recibo de Devolução Solicitada pelo Policial</strong>
                    <span>
                      Confira abaixo as informações registradas por <strong>{returningCautela.requesterName}</strong>, selecione o local de guarda no cofre e confirme o recibo.
                    </span>
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
                        <Disc className="w-4 h-4 text-amber-400" />
                        <div>
                          <span className="text-xs font-bold text-amber-300 block">
                            Dados da Munição / Cautela Vinculada
                          </span>
                          {ammoDetails.linkedCautelaId && (
                            <span className="text-[10px] font-mono text-slate-400">
                              Cautela vinculada: #{String(ammoDetails.linkedCautelaId).slice(-8)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5">
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

                    {/* Especificações técnicas resgatadas da munição (sem expor cofre ou saldo de estoque) */}
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
                        <span className="text-slate-500 block">Lote:</span>
                        <strong className="text-slate-200 font-mono">{ammoDetails.loteMunicao}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Destinação:</span>
                        <strong className="text-slate-200">{ammoDetails.destinacao}</strong>
                      </div>
                    </div>

                    {ammoDetails.seraDevolvida ? (
                      <div className="space-y-3 pt-1 border-t border-slate-800/80">
                        <div>
                          <label className="block text-xs font-bold text-amber-200 mb-1">
                            Quantidade de munições devolvidas (de {ammoDetails.quantity} acauteladas): <span className="text-amber-400">*</span>
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
                            Devolvendo <strong className="text-amber-300 font-mono">{returnedAmmoQuantity}</strong> munição(ões) • Utilizadas/consumidas:{' '}
                            <strong className="text-slate-200 font-mono">{Math.max(0, ammoDetails.quantity - returnedAmmoQuantity)}</strong> un.
                          </p>
                        </div>

                        {/* Seleção do Cofre para Guardar Munições Devolvidas: VISÍVEL SOMENTE PARA O ARMEIRO */}
                        {canAuthorize && returnedAmmoQuantity > 0 && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-1">
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                              Cofre para guardar as {returnedAmmoQuantity} munições devolvidas (Escolha do Armeiro):
                            </label>
                            <select
                              value={returnAmmoVaultSpaceId}
                              onChange={(e) => setReturnAmmoVaultSpaceId(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-amber-500"
                              required
                            >
                              {availableAmmoVaults.length === 0 ? (
                                <option value="">Cofre de Munições Padrão</option>
                              ) : (
                                availableAmmoVaults.map(v => {
                                  const vUnit = units.find(u => u.id === v.unitId);
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {v.code} - {(v as any).description || (vUnit ? vUnit.name : 'Cofre de Munições da Unidade')}
                                    </option>
                                  );
                                })
                              )}
                            </select>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400">
                        Esta munição consta como <strong>retirada permanente</strong> (não passiva de devolução ao cofre).
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

                {/* 6. Local no Cofre para Guarda: VISÍVEL SOMENTE PARA O ARMEIRO (OCULTO PARA POLICIAL) */}
                {canAuthorize && (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                        <Crosshair className="w-4 h-4 text-amber-400" />
                        <span>Local no Cofre para Guarda (Alterável pelo Armeiro):</span>
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono">
                        Original: {vaultSpaces.find(v => v.id === returningCautela.vaultSpaceId)?.code || 'Cofre Padrão'}
                      </span>
                    </div>

                    {availableArmasVaults.length === 0 ? (
                      <div className="text-xs text-slate-400 font-mono">
                        Retornará ao cofre original: {vaultSpaces.find(v => v.id === returningCautela.vaultSpaceId)?.code || 'Cofre Padrão'}
                      </div>
                    ) : (
                      <select
                        value={returnVaultSpaceId}
                        onChange={(e) => setReturnVaultSpaceId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
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
                      O armeiro ao aceitar a devolução pode manter o compartimento original ou selecionar outro cofre/slot livre para guardar a arma.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Observações Gerais da Devolução
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
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    {isArmorerConfirmingPending ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                    <span>
                      {isSubmitting
                        ? 'Registrando...'
                        : !canAuthorize
                          ? 'Enviar Devolução (Pendente de Recibo)'
                          : isArmorerConfirmingPending
                            ? 'Confirmar Recibo e Guardar no Cofre'
                            : 'Confirmar Devolução ao Cofre'}
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
