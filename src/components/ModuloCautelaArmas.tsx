import React, { useState, useMemo, useCallback } from 'react';
import { 
  User, Weapon, CautelaArma, AmmunitionStock, Caliber, VaultSpace, Unit, Department 
} from '../types';
import { storage } from '../services/storage';
import { 
  Shield, Crosshair, Disc, AlertCircle, Check, Clock, Search, 
  Printer, ArrowRightLeft, CheckCircle2, XCircle, FileText, 
  ChevronRight, Sparkles, Filter, AlertTriangle, RotateCcw, Eye, Lock, X
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
  onRefresh: () => void;
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
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'DEFERIDAS' | 'INDEFERIDAS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLVIDA' | 'RECUSADA'>('TODOS');
  
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
  const [returnAmmoVaultSpaceId, setReturnAmmoVaultSpaceId] = useState('');

  // Modal de Nova Solicitação de Cautela
  const [selectedWeaponId, setSelectedWeaponId] = useState('');
  const [reason, setReason] = useState('Serviço Policial Operacional / Plantão');
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
  const [authWithAmmo, setAuthWithAmmo] = useState(false);
  const [authStockId, setAuthStockId] = useState('');
  const [authAmmoQty, setAuthAmmoQty] = useState<number>(30);
  const [authAmmoDestinacao, setAuthAmmoDestinacao] = useState<'Defesa' | 'Treinamento'>('Defesa');
  const [authSeraDevolvida, setAuthSeraDevolvida] = useState(true);
  const [authNotes, setAuthNotes] = useState('');

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

  // Lista de cautelas
  const allCautelas = storage.getCautelasArmas();

  // Função auxiliar para verificar status pendente de recibo / autorização
  const isPendingStatus = (st: string) => {
    const s = (st || '').trim().toUpperCase();
    return s === 'PENDENTE' || s === 'PENDENTE DE RECIBO' || s === 'PENDENTE RECIBO' || s === 'CAUTELA PENDENTE';
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

    // 4. Se a cautela estiver autorizada ou devolvida, resolve o armeiro da unidade
    if (cautela.status === 'AUTORIZADA' || cautela.status === 'DEVOLVIDA') {
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
        } else if (isWeaponAcautelada && !list.some(c => c.weaponId === w.id && (c.status === 'AUTORIZADA' || c.status === 'PENDENTE'))) {
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
            (m.linkedWeaponSerialNumber && m.linkedWeaponSerialNumber === w.serialNumber) ||
            ((m as any).weaponId && (m as any).weaponId === w.id) ||
            (m.requesterMasp && currentUser.masp && m.requesterMasp === currentUser.masp && m.status === 'AUTORIZADA')
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
        const reqName = locNote ? locNote.split('•')[0].replace('Acautelada com ', '').split('(MASP:')[0].trim() : (polAcautelado || 'Policial');
        const reqMasp = locNote && locNote.includes('MASP:') ? locNote.split('MASP:')[1].split(')')[0].trim() : 'N/A';

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
            requesterId: (w as any).destinatarioId || 'solicitante',
            requesterName: reqName || 'Policial Solicitante',
            requesterMasp: reqMasp || 'Pendente',
            requesterCargo: 'Investigador',
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
        } else if (isWeaponAcautelada && !list.some(c => c.weaponId === w.id && c.status === 'AUTORIZADA')) {
          const allUsers = storage.getUsers();
          const armorerUser = allUsers.find(u => 
            (u.role === 'Armeiro' || (u as any).activeRole === 'Armeiro') &&
            (!w.unitId || u.unitId === w.unitId)
          ) || allUsers.find(u => 
            (u.role === 'Administrador' || (u as any).activeRole === 'Administrador') &&
            (!w.unitId || u.unitId === w.unitId)
          ) || currentUser;

          const linkedMun = (storage.getCautelasMunicoes() || []).find(m => 
            (m.linkedWeaponSerialNumber && m.linkedWeaponSerialNumber === w.serialNumber) ||
            ((m as any).weaponId && (m as any).weaponId === w.id) ||
            (reqMasp !== 'N/A' && m.requesterMasp && m.requesterMasp === reqMasp && m.status === 'AUTORIZADA')
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
  }, [allCautelas, currentUser, isPolicial, isGeral, weapons, vaultSpaces, isUserCautela, isUserWeapon]);

  // Lista a exibir com base na aba ativa
  const displayedCautelas = useMemo(() => {
    let list = [...scopedCautelas];

    if (activeTab === 'MINHAS') {
      // Aba "Minhas Cautelas": lista estritamente as Cautelas que estão aguardando uma ação do armeiro (status PENDENTE)
      list = list.filter(c => isPendingStatus(c.status));
    } else if (activeTab === 'DEFERIDAS') {
      // Aba "Deferidas (Autorizadas/Devolvidas)": cautelas deferidas (ativas) e histórico das devolvidas
      list = list.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLVIDA');
      if (deferidasSubFilter === 'ATIVAS') {
        list = list.filter(c => c.status === 'AUTORIZADA');
      } else if (deferidasSubFilter === 'DEVOLVIDAS') {
        list = list.filter(c => c.status === 'DEVOLVIDA');
      }
    } else if (activeTab === 'INDEFERIDAS') {
      // Aba "Indeferidas": cautelas recusadas
      list = list.filter(c => c.status === 'RECUSADA');
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.weaponSerialNumber && c.weaponSerialNumber.toLowerCase().includes(term)) ||
        (c.weaponModel && c.weaponModel.toLowerCase().includes(term)) ||
        (c.weaponCaliber && c.weaponCaliber.toLowerCase().includes(term)) ||
        (c.requesterName && c.requesterName.toLowerCase().includes(term)) ||
        (c.requesterMasp && c.requesterMasp.toLowerCase().includes(term)) ||
        (c.armorerName && c.armorerName.toLowerCase().includes(term)) ||
        (c.reason && c.reason.toLowerCase().includes(term))
      );
    }

    return list;
  }, [scopedCautelas, activeTab, deferidasSubFilter, searchTerm]);

  // Contadores para badges das abas
  const pendingCount = useMemo(() => {
    return scopedCautelas.filter(c => isPendingStatus(c.status)).length;
  }, [scopedCautelas]);

  const deferidasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'DEVOLVIDA').length;
  }, [scopedCautelas]);

  const activeCautelasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'AUTORIZADA').length;
  }, [scopedCautelas]);

  const returnedCautelasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'DEVOLVIDA').length;
  }, [scopedCautelas]);

  const indeferidasCount = useMemo(() => {
    return scopedCautelas.filter(c => c.status === 'RECUSADA').length;
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


  const availableAmmoInUnit = useMemo(() => {
    if (!selectedWeapon) return [];
    return ammoStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === currentUser.unitId);
      const cal = calibers.find(c => c.id === st.caliberId);
      const matchCaliber = cal && selectedWeapon.caliber && cal.name.toLowerCase().includes(selectedWeapon.caliber.toLowerCase());
      return matchUnit && (matchCaliber || st.quantity > 0);
    });
  }, [selectedWeapon, ammoStocks, calibers, currentUser.unitId, isGeral]);

  // Munições disponíveis na unidade correspondentes ao armamento que o armeiro está autorizando
  const availableAmmoForAuthorizingWeapon = useMemo(() => {
    if (!authorizingCautela) return [];
    const targetUnitId = authorizingCautela.unitId || currentUser.unitId;
    const selCal = (authorizingCautela.weaponCaliber || '').toLowerCase().trim();
    return ammoStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === targetUnitId);
      const cal = calibers.find(c => c.id === st.caliberId);
      const calName = (cal?.name || '').toLowerCase().trim();
      const matchCaliber = !selCal ||
                           (cal && (calName.includes(selCal) || selCal.includes(calName))) ||
                           (st.caliberId === authorizingCautela.weaponCaliber);
      return matchUnit && matchCaliber && st.quantity > 0;
    });
  }, [authorizingCautela, ammoStocks, calibers, currentUser.unitId, isGeral]);

  React.useEffect(() => {
    if (authorizingCautela && availableAmmoForAuthorizingWeapon.length > 0) {
      if (!availableAmmoForAuthorizingWeapon.some(s => s.id === authStockId)) {
        setAuthStockId(availableAmmoForAuthorizingWeapon[0].id);
      }
    }
  }, [authorizingCautela, availableAmmoForAuthorizingWeapon, authStockId]);

  const getLinkedAmmoForCautela = (cautela: CautelaArma) => {
    const list = storage.getCautelasMunicoes();
    return list.find(m => 
      m.id === cautela.linkedAmmoCautelaId || 
      (m as any).cautelaArmaId === cautela.id || 
      m.linkedWeaponCautelaId === cautela.id ||
      (m.linkedWeaponSerialNumber && cautela.weaponSerialNumber && m.linkedWeaponSerialNumber === cautela.weaponSerialNumber) ||
      ((m as any).weaponId && cautela.weaponId && (m as any).weaponId === cautela.weaponId) ||
      (m.requesterMasp && cautela.requesterMasp && m.requesterMasp === cautela.requesterMasp && (cautela.status === 'AUTORIZADA' ? m.status === 'AUTORIZADA' : true)) ||
      (m.requesterId === cautela.requesterId && (m.status === 'PENDENTE' || m.status === 'AUTORIZADA') && Math.abs(new Date(m.requestDate).getTime() - new Date(cautela.requestDate).getTime()) < 30000)
    ) || null;
  };

  // Submeter nova solicitação de cautela
  const handleRequestCautela = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedWeaponId) {
      setErrorMsg('Selecione uma arma para solicitar a cautela.');
      return;
    }

    const weapon = weapons.find(w => w.id === selectedWeaponId);
    if (!weapon) {
      setErrorMsg('Armamento selecionado não encontrado.');
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
          setSuccessMsg(`Solicitação de cautela da arma ${weapon.model} (Série: ${weapon.serialNumber}) realizada com sucesso! A solicitação está listada em "Minhas Cautelas" aguardando autorização do armeiro.`);
          setActiveTab('MINHAS');
        }
        setSelectedWeaponId('');
        onRefresh();
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
    const hasAmmo = Boolean(cautela.linkedAmmoCautelaId || (cautela.ammoQuantity && cautela.ammoQuantity > 0) || linkedAmmo);
    setAuthorizingCautela(cautela);
    setAuthWithAmmo(hasAmmo);
    setAuthAmmoQty(cautela.ammoQuantity || linkedAmmo?.quantity || 30);
    const isTreinamento = (cautela.ammoDestinacao === 'Treinamento' || linkedAmmo?.destinacao === 'Treinamento');
    setAuthAmmoDestinacao(isTreinamento ? 'Treinamento' : 'Defesa');
    setAuthSeraDevolvida(!isTreinamento);
    setAuthNotes('');
  };

  // Confirmar autorização com seleção de cofre/lote e permanente vs devolver depois
  const handleConfirmAuthorizeWithAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizingCautela) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const selectedStock = availableAmmoForAuthorizingWeapon.find(s => s.id === authStockId);
      const res = await storage.authorizeCautelaArma(authorizingCautela.id, {
        notes: authNotes,
        stockId: authWithAmmo ? (authStockId || undefined) : undefined,
        vaultSpaceId: selectedStock?.vaultSpaceId || authorizingCautela.vaultSpaceId,
        seraDevolvida: authSeraDevolvida,
        ammoQuantity: authWithAmmo ? Number(authAmmoQty) : undefined,
        destinacao: authAmmoDestinacao,
        weaponId: authorizingCautela.weaponId,
        weaponSerialNumber: authorizingCautela.weaponSerialNumber,
        cautelaId: authorizingCautela.id,
        requesterName: authorizingCautela.requesterName,
        requesterMasp: authorizingCautela.requesterMasp,
        requesterCargo: authorizingCautela.requesterCargo,
        armorerId: currentUser.id,
        armorerName: currentUser.name,
        armorerMasp: currentUser.masp
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar acautelamento.');
      } else {
        setSuccessMsg(`Cautela da arma ${authorizingCautela.weaponModel} (Série: ${authorizingCautela.weaponSerialNumber}) autorizada com sucesso! A arma passou de "Cautela Pendente" para "Acautelada — ${authorizingCautela.requesterName} (MASP: ${authorizingCautela.requesterMasp})".${authWithAmmo ? ' Munições deduzidas e lançadas em Cautela de Munições.' : ''}`);
        setAuthorizingCautela(null);
        onRefresh();
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
      const res = await storage.authorizeCautelaArma(id, {
        notes,
        weaponId: targetCautela?.weaponId,
        weaponSerialNumber: targetCautela?.weaponSerialNumber,
        cautelaId: targetCautela?.id || id,
        requesterName: targetCautela?.requesterName,
        requesterMasp: targetCautela?.requesterMasp,
        requesterCargo: targetCautela?.requesterCargo,
        armorerId: currentUser.id,
        armorerName: currentUser.name,
        armorerMasp: currentUser.masp
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar cautela.');
      } else {
        const reqName = targetCautela ? targetCautela.requesterName : 'Policial';
        const reqMasp = targetCautela?.requesterMasp ? ` (MASP: ${targetCautela.requesterMasp})` : '';
        setSuccessMsg(`Cautela autorizada com sucesso! A arma passou de "Cautela Pendente" para "Acautelada — ${reqName}${reqMasp}", liberada para o policial e retirada do cofre.`);
        setNotesModal(null);
        setActionNotes('');
        onRefresh();
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
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao recusar.');
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
      (v.type === 'MUNIÇÃO' || v.type === 'MUNICAO' || !v.type)
    );
  }, [returningCautela, vaultSpaces, currentUser.unitId]);

  // Abrir Modal de Devolução
  const handleOpenReturnModal = (cautela: CautelaArma) => {
    setReturningCautela(cautela);
    setHadShots(false);
    setShotsFired(0);
    setReturnAmmoUsedCount(0);
    setIsWorking(true);
    setDefectDescription('');
    setHadMalfunction(false);
    setMalfunctionDescription('');
    setReturnedMagazinesCount(cautela.magazineQuantity || 1);
    setReturnObservations('');
    setReturnVaultSpaceId(cautela.vaultSpaceId || '');

    const linkedAmmo = getLinkedAmmoForCautela(cautela);
    if (linkedAmmo?.vaultSpaceId) {
      setReturnAmmoVaultSpaceId(linkedAmmo.vaultSpaceId);
    } else {
      const firstAmmoVault = vaultSpaces.find(v => 
        (!v.unitId || v.unitId === (cautela.unitId || currentUser.unitId)) &&
        (v.type === 'MUNIÇÃO' || v.type === 'MUNICAO')
      );
      setReturnAmmoVaultSpaceId(firstAmmoVault?.id || cautela.vaultSpaceId || '');
    }
  };

  // Concluir Devolução
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

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const selectedVault = vaultSpaces.find(v => v.id === returnVaultSpaceId);
      const linkedAmmo = getLinkedAmmoForCautela(returningCautela);
      const usedAmmoCount = hadShots ? (Number(returnAmmoUsedCount) || Number(shotsFired) || 0) : 0;

      const res = await storage.returnCautelaArma(returningCautela.id, {
        weaponId: returningCautela.weaponId,
        weaponSerialNumber: returningCautela.weaponSerialNumber,
        cautelaId: returningCautela.id,
        requesterName: returningCautela.requesterName,
        requesterMasp: returningCautela.requesterMasp,
        requesterCargo: returningCautela.requesterCargo,
        hadShots,
        shotsFired: hadShots ? (Number(shotsFired) || usedAmmoCount) : 0,
        ammoUsedCount: usedAmmoCount,
        ammoDestinationVaultSpaceId: returnAmmoVaultSpaceId || linkedAmmo?.vaultSpaceId || returnVaultSpaceId,
        isWorking,
        defectDescription: !isWorking ? defectDescription.trim() : null,
        hadMalfunction,
        malfunctionDescription: hadMalfunction ? malfunctionDescription.trim() : null,
        returnedMagazinesCount,
        destinationVaultSpaceId: returnVaultSpaceId || returningCautela.vaultSpaceId,
        returnObservations: returnObservations.trim()
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar devolução.');
      } else {
        const destText = selectedVault ? `no cofre ${selectedVault.code}` : 'ao cofre da unidade';
        setSuccessMsg(`Arma ${returningCautela.weaponModel} (Série: ${returningCautela.weaponSerialNumber}) devolvida e guardada com sucesso ${destText}!${linkedAmmo ? ' Situação das munições atualizada e saldo remanescente guardado no cofre.' : ''}`);
        setReturningCautela(null);
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar devolução.');
      setIsSubmitting(false);
    }
  };

  // Impressão do Termo Formal de Cautela de Armamento
  // Impressão do Termo Formal de Cautela de Armamento e Munições
  const handlePrintTermo = (cautela: CautelaArma) => {
    const unitObj = units.find(u => u.id === cautela.unitId);
    const deptObj = departments.find(d => d.id === cautela.departmentId);
    const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);
    const returnVaultId = cautela.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
    const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
    const returnUnit = units.find(u => u.id === returnVault?.unitId);
    const returnVaultAddress = returnVault 
      ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}`
      : 'Cofre de Origem da Unidade';

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
            text-align: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .header-title-org {
            margin: 0;
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #0f172a;
          }
          .header-subtitle-unit {
            margin: 3px 0 0 0;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            color: #334155;
          }
          .header-doc-title {
            margin: 12px 0 0 0;
            font-size: 15px;
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
          <h2 class="header-title-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
          <h3 class="header-subtitle-unit">
            ${deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA'} • ${unitObj ? unitObj.name : 'UNIDADE POLICIAL'}
          </h3>
          <h1 class="header-doc-title">
            TERMO DE CAUTELA INDIVIDUAL DE ARMAMENTO E MUNIÇÕES
          </h1>
          <p class="protocol-tag">PROTOCOLO: ${cautela.id.toUpperCase()}</p>
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
              <td><strong>Cargo/Função:</strong> ${cautela.requesterCargo || 'Policial'}</td>
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
                <th>Cofre de Retorno (Origem)</th>
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
              <td colspan="2"><strong>Cofre Físico de Origem/Retorno:</strong> ${returnVaultAddress}</td>
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
          <strong>TERMO DE COMPROMISSO E FIEL DEPOSITÁRIO:</strong> O servidor qualificado acima declara ter recebido o armamento, munições e acessórios discriminados em perfeitas condições de conservação e funcionamento, comprometendo-se a zelar por sua guarda, segurança e emprego estritamente legal nos termos do regulamento da Polícia Civil de Minas Gerais. Obriga-se a devolver o armamento no cofre de retorno indicado (<strong>${returnVaultAddress}</strong>) findo o período de cautela, prestando as informações técnicas de disparos efetuados, eventuais anomalias e restituição dos cartuchos não deflagrados.
        </div>

        <div class="signatures-container">
          <div class="signature-box">
            <strong>${cautela.requesterName}</strong><br/>
            MASP: ${cautela.requesterMasp}<br/>
            <span>Usuário que está recebendo a arma (Policial)</span>
          </div>
          <div class="signature-box">
            <strong>${armorerInfo.name}</strong><br/>
            ${armorerInfo.masp ? `MASP: ${armorerInfo.masp}<br/>` : ''}
            <span>Armeiro Autorizador da Cautela</span>
          </div>
        </div>

        <div class="footer-note">
          Documento emitido eletronicamente pelo Sistema de Gestão de Armas e Munições - PCMG em ${new Date().toLocaleString('pt-BR')} ${(hasAmmo && ammoQtd > 0) ? '• (Página 1 de 2)' : ''}
        </div>

        ${(hasAmmo && ammoQtd > 0) ? `
          <!-- PÁGINA 2: RECIBO DE FORNECIMENTO DE MUNIÇÕES VINCULADAS -->
          <div class="page-break">
            <div class="header-box">
              <h2 class="header-title-org">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
              <h3 class="header-subtitle-unit">
                ${deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA'} • ${unitObj ? unitObj.name : 'UNIDADE POLICIAL'}
              </h3>
              <h1 class="header-doc-title">
                RECIBO DE CAUTELA E FORNECIMENTO DE MUNIÇÕES
              </h1>
              <p class="protocol-tag">VINCULADO AO ARMAMENTO Nº ${cautela.weaponSerialNumber} (${cautela.weaponModel}) • PROTOCOLO: ${(linkedAmmo?.id || cautela.id).toUpperCase()}</p>
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
                  <td><strong>Cargo/Função:</strong> ${cautela.requesterCargo || 'Policial'}</td>
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
                    <th>Cofre</th>
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
                    <td>${ammoVault ? `${ammoVault.code}${ammoVaultUnit ? ` (${ammoVaultUnit.name})` : ''}` : returnVaultAddress}</td>
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

            <div class="signatures-container">
              <div class="signature-box">
                <strong>${cautela.requesterName}</strong><br/>
                MASP: ${cautela.requesterMasp}<br/>
                <span>Usuário que está recebendo as munições (Policial)</span>
              </div>
              <div class="signature-box">
                <strong>${armorerInfo.name}</strong><br/>
                ${armorerInfo.masp ? `MASP: ${armorerInfo.masp}<br/>` : ''}
                <span>Armeiro Autorizador da Cautela</span>
              </div>
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

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('NOVA')}
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
                      Recusada por: <strong className="text-red-200">{c.armorerName || 'Armeiro'}</strong> {c.armorerMasp ? `(MASP: ${c.armorerMasp})` : ''} • Retornou ao: <strong className="text-slate-100">{vault ? vault.code : 'Cofre de Origem'}</strong>
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
                        setActiveTab('MINHAS');
                        setStatusFilter('INDEFERIDAS');
                        handleDismissRefusal(c.id);
                      }}
                      className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition shadow-sm"
                    >
                      Ver em Indeferidas
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
          <span>{canAuthorize ? 'Solicitações Pendentes (Unidade)' : 'Minhas Cautelas'}</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black animate-pulse">
              {pendingCount} {canAuthorize ? (pendingCount === 1 ? 'pendente' : 'pendentes') : (pendingCount === 1 ? 'aguardando' : 'aguardando')}
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
          <span>{canAuthorize ? 'Deferidas / Ativas (Unidade)' : 'Deferidas (Autorizadas/Devolvidas)'}</span>
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
              ? 'bg-red-950/80 text-red-300 border border-red-800 shadow-sm'
              : 'text-slate-400 hover:text-red-300 hover:bg-slate-900'
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          <span>{canAuthorize ? 'Indeferidas (Unidade)' : 'Indeferidas'}</span>
          {indeferidasCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 font-mono">
              {indeferidasCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('NOVA')}
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
                            <span>Local: {vault ? vault.code : 'Cofre'}</span>
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
                  <div className="text-[10px] text-slate-400">
                    Retorno no cofre: <strong>{vaultSpaces.find(v => v.id === selectedWeapon.vaultSpaceId)?.code || 'Origem'}</strong>
                  </div>
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
                        Motivo / Finalidade do Uso
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ex: Plantão Operacional / Diligência"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                        required
                      />
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
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Motivo / Finalidade do Uso (Opcional)
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ex: Plantão Operacional / Diligência / Serviço Policial"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500"
                  />
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por arma, série, calibre ou policial..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500"
              />
            </div>

            {/* Sub-filtros para a aba Deferidas */}
            {activeTab === 'DEFERIDAS' && (
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

                  {/* Seção: Solicitações Pendentes (Aba MINHAS CAUTELAS) */}
                  {activeTab === 'MINHAS' && (() => {
                    const pendentes = scopedCautelas.filter(c => isPendingStatus(c.status));
                    if (pendentes.length === 0) {
                      return (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                          <Clock className="w-8 h-8 text-amber-500/50 mx-auto mb-2" />
                          <p className="text-sm font-semibold">
                            {canAuthorize ? 'Nenhuma solicitação de armamento pendente na unidade.' : 'Nenhuma cautela aguardando ação do armeiro no momento.'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {isPolicial 
                              ? 'Você não possui solicitações de armamento pendentes de autorização.' 
                              : `Não há solicitações de armamento aguardando autorização para a unidade ${userUnit?.name || 'vinculada'}.`}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                              {canAuthorize 
                                ? `Solicitações Pendentes de Armamento — ${userUnit?.name || 'Unidade'} (Aguardando Ação do Armeiro)` 
                                : 'Minhas Solicitações Pendentes (Aguardando Ação do Armeiro)'}
                            </h4>
                          </div>
                          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded-md border border-amber-800/60">
                            {pendentes.length} aguardando ação
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
                                        Solicitante: <strong className="text-amber-300 font-semibold">{cautela.requesterName}</strong> <span className="font-mono text-amber-400">(MASP: {cautela.requesterMasp})</span> • Solicitado em {new Date(cautela.requestDate).toLocaleString('pt-BR')}
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
                                      <span className="px-3 py-1 bg-amber-950/70 border border-amber-800 text-amber-300 text-xs font-bold rounded-xl flex items-center space-x-1.5">
                                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Pendente de Liberação</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Cofre de Origem</span>
                                    <span className="font-mono text-slate-200 font-bold truncate block">
                                      {returnVaultAddress}
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
                                    <span className="text-slate-200 font-semibold truncate block">
                                      {cautela.requesterName} ({cautela.requesterMasp})
                                    </span>
                                  </div>
                                </div>

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

                                {cautela.reason && (
                                  <p className="text-xs text-slate-400 italic">
                                    Motivo da Solicitação: "{cautela.reason}"
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Seção: Cautelas Ativas (Aba DEFERIDAS) */}
                  {activeTab === 'DEFERIDAS' && (deferidasSubFilter === 'TODAS' || deferidasSubFilter === 'ATIVAS') && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                            {canAuthorize 
                              ? `Armamentos Acautelados / Cautelas Ativas — ${userUnit?.name || 'Unidade'}` 
                              : 'Cautela(s) Ativa(s) em Posse do Policial'}
                          </h4>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
                          {scopedCautelas.filter(c => c.status === 'AUTORIZADA').length} arma(s) acautelada(s)
                        </span>
                      </div>

                      {scopedCautelas.filter(c => c.status === 'AUTORIZADA').length === 0 ? (
                        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                          {canAuthorize 
                            ? `Nenhum armamento da unidade ${userUnit?.name || ''} está acautelado no momento.` 
                            : 'Você não possui nenhuma arma acautelada ativa no momento.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {scopedCautelas.filter(c => c.status === 'AUTORIZADA').map(cautela => {
                            const weapon = weapons.find(w => w.id === cautela.weaponId || w.serialNumber === cautela.weaponSerialNumber);
                            const returnVaultId = cautela.vaultSpaceId || weapon?.previousVaultSpaceId || weapon?.vaultSpaceId;
                            const returnVault = vaultSpaces.find(v => v.id === returnVaultId);
                            const returnUnit = units.find(u => u.id === returnVault?.unitId);
                            const returnVaultAddress = returnVault 
                              ? `${returnVault.code}${returnUnit ? ` (${returnUnit.name})` : ''}` 
                              : 'Cofre de Origem';

                            const linkedAmmo = getLinkedAmmoForCautela(cautela);
                            const hasAmmo = Boolean(cautela.ammoQuantity || cautela.linkedAmmoCautelaId || linkedAmmo);
                            const armorerInfo = getResolvedArmorer(cautela);

                            return (
                              <div
                                key={cautela.id}
                                className="bg-slate-900 border border-emerald-800/40 rounded-2xl p-4 sm:p-5 hover:border-emerald-700/60 transition space-y-3 shadow-sm ring-1 ring-emerald-500/10"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                  <div className="flex items-center space-x-3">
                                    <div className="p-2.5 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                      <Crosshair className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <div className="flex items-center space-x-2">
                                        <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                        <span className="font-mono text-xs text-amber-400 font-bold">
                                          Nº {cautela.weaponSerialNumber}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                          Acautelada (Ativa)
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-400 mt-0.5">
                                        Policial: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp}) • {cautela.requesterCargo || 'Policial'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2 self-end sm:self-center">
                                    <button
                                      onClick={() => handlePrintTermo(cautela)}
                                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                      title="Imprimir Termo de Cautela de Armamento"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Imprimir Termo</span>
                                    </button>

                                    <button
                                      onClick={() => handleOpenReturnModal(cautela)}
                                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Devolver ao Cofre</span>
                                    </button>
                                  </div>
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
                                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Autorizador</span>
                                    <span className="text-slate-200 font-semibold truncate block" title={armorerInfo.label}>
                                      {armorerInfo.label}
                                    </span>
                                  </div>
                                </div>

                                {/* Munição Vinculada (Fabricante, Calibre, Tipo, Peso, Lote, Quantidade e Destinação) */}
                                {(() => {
                                  const qty = cautela.ammoQuantity || linkedAmmo?.quantity || 0;
                                  const fab = cautela.ammoFabricante || linkedAmmo?.fabricante || 'CBC';
                                  const cal = cautela.weaponCaliber || linkedAmmo?.caliberName || 'Padrão';
                                  const tip = cautela.ammoTipo || linkedAmmo?.tipoMunicao || 'Operacional';
                                  const pes = cautela.ammoPeso || linkedAmmo?.pesoMunicao || '124gr';
                                  const lot = cautela.ammoLote || linkedAmmo?.loteMunicao || 'Lote Unidade';
                                  const des = cautela.ammoDestinacao || linkedAmmo?.destinacao || 'Defesa';

                                  if (hasAmmo && qty > 0) {
                                    return (
                                      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                                          <span className="font-bold text-amber-300 flex items-center space-x-1.5">
                                            <Disc className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Munição Vinculada à Cautela da Arma</span>
                                          </span>
                                          <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
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
                                  }

                                  return (
                                    <div className="p-2.5 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl text-xs flex items-center justify-between text-slate-400">
                                      <span className="flex items-center space-x-1.5">
                                        <Disc className="w-3.5 h-3.5 text-slate-600" />
                                        <span>Munições Associadas: <strong className="text-slate-300">Nenhuma munição vinculada</strong> (Apenas arma e carregadores)</span>
                                      </span>
                                      <span className="text-[11px] font-mono text-slate-500">0 un.</span>
                                    </div>
                                  );
                                })()}

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
                  )}

                  {/* Seção: Cautelas Recusadas (Aba INDEFERIDAS) */}
                  {activeTab === 'INDEFERIDAS' && (() => {
                    const recusadas = scopedCautelas.filter(c => c.status === 'RECUSADA');
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">
                              {canAuthorize 
                                ? `Solicitações Indeferidas — ${userUnit?.name || 'Unidade'}` 
                                : 'Cautelas Recusadas (Minhas Solicitações Indeferidas)'}
                            </h4>
                          </div>
                          <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800/60">
                            {recusadas.length} recusada(s)
                          </span>
                        </div>

                        {recusadas.length === 0 ? (
                          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                            {canAuthorize 
                              ? `Nenhuma solicitação de armamento foi indeferida na unidade ${userUnit?.name || ''}.` 
                              : 'Nenhuma solicitação de armamento foi recusada.'}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {recusadas.map(cautela => {
                              const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

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
                                          Arma retornada ao cofre: <strong className="text-slate-200">{vault ? vault.code : 'No Cofre de Origem'}</strong>
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
                  })()}

                  {/* Seção 4: Histórico de Cautelas Devolvidas (Aba DEFERIDAS) */}
                  {activeTab === 'DEFERIDAS' && (deferidasSubFilter === 'TODAS' || deferidasSubFilter === 'DEVOLVIDAS') && (() => {
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

      {/* MODAL DE DEVOLUÇÃO COM REGISTRO TÉCNICO (TIROS, DEFEITOS, PANES) */}
      {returningCautela && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl my-auto space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                  <span>Devolução de Armamento ao Cofre</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Arma: <strong>{returningCautela.weaponModel}</strong> (Série: <span className="font-mono">{returningCautela.weaponSerialNumber}</span>)
                </p>
              </div>
              <button onClick={() => setReturningCautela(null)} className="text-slate-400 hover:text-slate-200">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

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
                        onChange={() => setHadShots(false)}
                        className="text-amber-500"
                      />
                      <span>Não</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="hadShots"
                        checked={hadShots}
                        onChange={() => setHadShots(true)}
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
                      onChange={(e) => setShotsFired(parseInt(e.target.value, 10) || 0)}
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

              {/* Prestação de contas de munição vinculada à cautela da arma */}
              {(() => {
                const linkedAmmo = getLinkedAmmoForCautela(returningCautela);
                const totalLinkedAmmo = linkedAmmo?.quantity || returningCautela.ammoQuantity || 0;
                if (totalLinkedAmmo <= 0) return null;
                const used = hadShots ? (Number(returnAmmoUsedCount) || Number(shotsFired) || 0) : 0;
                const rem = Math.max(0, totalLinkedAmmo - used);

                return (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-600/40 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center space-x-2">
                        <Disc className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-amber-300">
                          Devolução de Munições ({totalLinkedAmmo} un. acauteladas)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400 font-bold">
                        {rem} un. a recolocar no cofre
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-300">
                        Houve tiros disparados / consumo de munição?
                      </label>
                      <div className="flex items-center space-x-3 text-xs">
                        <label className="flex items-center space-x-1 cursor-pointer">
                          <input
                            type="radio"
                            name="hadAmmoUsed"
                            checked={!hadShots}
                            onChange={() => {
                              setHadShots(false);
                              setShotsFired(0);
                              setReturnAmmoUsedCount(0);
                            }}
                            className="text-amber-500"
                          />
                          <span className="text-slate-300">Não (Zero disparos)</span>
                        </label>
                        <label className="flex items-center space-x-1 cursor-pointer">
                          <input
                            type="radio"
                            name="hadAmmoUsed"
                            checked={hadShots}
                            onChange={() => {
                              setHadShots(true);
                              if (!returnAmmoUsedCount) setReturnAmmoUsedCount(1);
                              if (!shotsFired) setShotsFired(1);
                            }}
                            className="text-amber-500"
                          />
                          <span className="text-amber-400 font-bold">Sim</span>
                        </label>
                      </div>
                    </div>

                    {hadShots && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Quantidade de munições utilizadas / deflagradas:
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={totalLinkedAmmo}
                          value={returnAmmoUsedCount || shotsFired || 0}
                          onChange={(e) => {
                            const val = Math.min(totalLinkedAmmo, Math.max(0, parseInt(e.target.value, 10) || 0));
                            setReturnAmmoUsedCount(val);
                            setShotsFired(val);
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono font-bold focus:border-amber-500"
                          required={hadShots}
                        />
                        <p className="text-[10px] text-amber-400/90">
                          {returnAmmoUsedCount} munições serão baixadas/subtraídas e {rem} munições restantes retornarão ao cofre da unidade.
                        </p>
                      </div>
                    )}

                    {rem > 0 && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Cofre para guardar as {rem} munições restantes (Escolha do Armeiro):
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
                            availableAmmoVaults.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.code} - {v.description || 'Cofre de Munições da Unidade'}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 4. Carregadores devolvidos */}
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

              {/* 5. Local no Cofre para Guarda (Pode ser alterado pelo Armeiro) */}
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
                    {availableArmasVaults.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.code} - {v.description || 'Cofre da Unidade'} {v.id === returningCautela.vaultSpaceId ? '(Local Original de Saída)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-400">
                  O armeiro ao aceitar a devolução pode manter o compartimento original ou selecionar outro cofre/slot livre para guardar a arma.
                </p>
              </div>

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
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isSubmitting ? 'Registrando...' : 'Confirmar Devolução ao Cofre'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Policial Solicitante:</span>
                  <strong className="text-slate-100">{authorizingCautela.requesterName} (MASP: {authorizingCautela.requesterMasp})</strong>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Arma Solicitada:</span>
                  <strong className="text-slate-100 font-mono">{authorizingCautela.weaponModel} - Série: {authorizingCautela.weaponSerialNumber} ({authorizingCautela.weaponCaliber})</strong>
                </div>
                {authorizingCautela.reason && (
                  <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>Motivo/Finalidade:</span>
                    <span className="italic">{authorizingCautela.reason}</span>
                  </div>
                )}
              </div>

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
                  <span className="text-[10px] text-amber-400 font-semibold">
                    {authWithAmmo ? 'Munições vinculadas ativas' : 'Apenas a arma'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Caso habilitado, o registro de cautela de munição será lançado igualmente no módulo Cautela de Munições e deduzido do estoque do cofre selecionado.
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
                        onChange={(e) => setAuthAmmoDestinacao(e.target.value as 'Defesa' | 'Treinamento')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium focus:border-amber-500"
                      >
                        <option value="Defesa">Defesa (Serviço Operacional / Plantão)</option>
                        <option value="Treinamento">Treinamento (Instrução / Estande)</option>
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
                        ⚠ Não há estoque de munições no calibre <strong>{authorizingCautela.weaponCaliber}</strong> cadastrado nesta unidade.
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
                          Baixa definitiva: consumo, treinamento ou missão (não retornará ao cofre).
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Despacho / Observações do Armeiro */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Despacho / Observações do Armeiro (Opcional)
                </label>
                <textarea
                  value={authNotes}
                  onChange={(e) => setAuthNotes(e.target.value)}
                  placeholder="Observações pertinentes à liberação do armamento e das munições..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                  rows={2}
                />
              </div>

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
                  disabled={isSubmitting || (authWithAmmo && availableAmmoForAuthorizingWeapon.length > 0 && !authStockId)}
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
    </div>
  );
};
