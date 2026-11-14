import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Movement,
  AmmunitionMovement,
  Department,
  Unit,
  Caliber,
  Weapon,
  VaultSpace,
  getSystemLogo,
  getAllowedModulesForUser,
  isUserExplosivista,
  formatCaliberDisplay
} from '../types';
import { storage } from '../services/storage';
import { formatTimestamp } from '../utils/masks';
import {
  FileText,
  Printer,
  Download,
  Filter,
  Crosshair,
  Disc,
  Vault,
  Package,
  Flame,
  Building2,
  X,
  CheckCircle2,
  Dog,
  Building,
  Pill,
  Syringe
} from 'lucide-react';
import { printDocumentInPage, buildStandardDocumentTitle, buildStandardDocumentFilename } from '../utils/printHelper';

interface ReportModuleProps {
  currentUser: User;
  movements: Movement[];
  ammoMovements?: AmmunitionMovement[];
  departments: Department[];
  units: Unit[];
  calibers: Caliber[];
  weapons: Weapon[];
  users: User[];
  vaultSpaces?: VaultSpace[];
}

type ReportTab = 'TODOS' | 'COFRES' | 'ARMAS' | 'MUNICIONAL' | 'MATERIAIS' | 'EXPLOSIVOS' | 'CANIL';

interface SectionSelection {
  cofres: boolean;
  armas: boolean;
  municoes: boolean;
  materiais: boolean;
  explosivos: boolean;
  canil: boolean;
}

const DEFAULT_SECTIONS: SectionSelection = {
  cofres: true,
  armas: true,
  municoes: true,
  materiais: true,
  explosivos: true,
  canil: true
};

export const ReportModule: React.FC<ReportModuleProps> = ({
  currentUser,
  movements = [],
  ammoMovements = [],
  departments = [],
  units = [],
  calibers = [],
  weapons = [],
  users = [],
  vaultSpaces = []
}) => {
  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const isExplosivistaRole =
    effectiveRole === 'Explosivista' ||
    (effectiveRole === 'Policial' && isUserExplosivista(currentUser));
  const allowedModules = useMemo(() => getAllowedModulesForUser(currentUser), [currentUser]);
  const hasCanilAccess = allowedModules.includes('veterinario');
  const isCanilOnly =
    hasCanilAccess &&
    !isGeral &&
    !isExplosivistaRole &&
    effectiveRole !== 'Armeiro' &&
    effectiveRole !== 'Administrador';
  const isDeptScoped =
    !isGeral &&
    (effectiveRole === 'Administrador' ||
      ((effectiveRole === 'Armeiro' || effectiveRole === 'Explosivista') &&
        currentUser.managementScope === 'department'));
  const isUnitOnly = !isGeral && !isDeptScoped;

  const [dataVersion, setDataVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<ReportTab>(() => {
    if (isCanilOnly) return 'CANIL';
    if (isExplosivistaRole) return 'COFRES';
    return 'TODOS';
  });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedCaliber, setSelectedCaliber] = useState('ALL');
  const [selectedVaultSpace, setSelectedVaultSpace] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState<string>(() =>
    isGeral ? 'ALL' : currentUser.departmentId || 'ALL'
  );
  const [selectedUnit, setSelectedUnit] = useState<string>(() =>
    isUnitOnly ? currentUser.unitId || 'ALL' : 'ALL'
  );
  const [recipientScope, setRecipientScope] = useState<'ALL' | 'SISTEMA' | 'FORA_DO_SISTEMA'>('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');

  // Shared Modal State for both "Imprimir Relatório" and "Exportar CSV"
  const [actionModalMode, setActionModalMode] = useState<'PRINT' | 'CSV' | null>(null);
  const [modalUnitId, setModalUnitId] = useState<string>('ALL');
  const [modalScopeMode, setModalScopeMode] = useState<'FULL_UNIT' | 'FILTERED'>('FULL_UNIT');
  const [modalSections, setModalSections] = useState<SectionSelection>(DEFAULT_SECTIONS);

  useEffect(() => {
    let active = true;
    storage.refreshFromServer().then(() => {
      if (active) setDataVersion(v => v + 1);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [currentUser.id, effectiveRole]);

  useEffect(() => {
    if (isUnitOnly) {
      setSelectedDept(currentUser.departmentId || 'ALL');
      setSelectedUnit(currentUser.unitId || 'ALL');
    } else if (isDeptScoped) {
      setSelectedDept(currentUser.departmentId || 'ALL');
      setSelectedUnit(prev => {
        if (prev === 'ALL') return 'ALL';
        const valid = units.some(u => u.id === prev && u.departmentId === currentUser.departmentId);
        return valid ? prev : 'ALL';
      });
    }
  }, [currentUser.id, currentUser.departmentId, currentUser.unitId, effectiveRole, isUnitOnly, isDeptScoped, units]);

  // Complete Lookup & Domain Collections synced with storage
  const allDepartments = useMemo(() => {
    const full = storage.getAllDepartments();
    return full.length > 0 ? full : departments;
  }, [departments, dataVersion]);

  const allUnits = useMemo(() => {
    const full = storage.getAllUnits();
    return full.length > 0 ? full : units;
  }, [units, dataVersion]);

  const allVaults = useMemo(() => {
    const fromStorage = storage.getVaultSpaces(currentUser);
    return fromStorage.length > 0 ? fromStorage : vaultSpaces;
  }, [vaultSpaces, currentUser, dataVersion]);

  const allUsersList = useMemo(() => {
    const full = storage.getAllUsersForLookup();
    return full.length > 0 ? full : users;
  }, [users, dataVersion]);

  const allWeapons = useMemo(() => {
    const list = storage.getWeapons(currentUser);
    return list.length > 0 ? list : weapons;
  }, [weapons, currentUser, dataVersion]);

  const allMovements = useMemo(() => {
    const list = storage.getMovements(currentUser);
    return list.length > 0 ? list : movements;
  }, [movements, currentUser, dataVersion]);

  const allCautelasArmas = useMemo(() => storage.getCautelasArmas(), [dataVersion, movements]);
  const allWeaponTransfers = useMemo(() => storage.getWeaponTransfers(currentUser), [currentUser, dataVersion]);

  const allAmmoStocks = useMemo(() => storage.getAmmoStocks(currentUser), [currentUser, dataVersion]);
  const allAmmoMovements = useMemo(() => {
    const list = storage.getAmmoMovements(currentUser);
    return list.length > 0 ? list : ammoMovements;
  }, [ammoMovements, currentUser, dataVersion]);
  const allCautelasMunicoes = useMemo(() => storage.getCautelasMunicoes(), [dataVersion, ammoMovements]);
  const allAmmoTransfers = useMemo(() => storage.getAmmoTransfers(currentUser), [currentUser, dataVersion]);

  const allMateriais = useMemo(() => storage.getMateriais(currentUser), [currentUser, dataVersion]);
  const allCautelasMateriais = useMemo(() => storage.getCautelasMateriais(currentUser), [currentUser, dataVersion]);
  const allMaterialTransfers = useMemo(() => storage.getMaterialTransfers(currentUser), [currentUser, dataVersion]);

  const allExplosivos = useMemo(() => storage.getExplosivos(currentUser), [currentUser, dataVersion]);
  const allMovsExplosivos = useMemo(() => storage.getMovimentacoesExplosivos(currentUser), [currentUser, dataVersion]);
  const allExplosivoTransfers = useMemo(() => storage.getExplosivoTransfers(currentUser), [currentUser, dataVersion]);

  const allCanisFisicos = useMemo(() => storage.getCanisFisicos(), [dataVersion]);
  const allCachorros = useMemo(() => storage.getCachorros(), [dataVersion]);
  const allProdutosVet = useMemo(() => storage.getProdutosVeterinarios(), [dataVersion]);
  const allMovsVet = useMemo(() => storage.getMovimentacoesVeterinarias(), [dataVersion]);

  // Allowed Departments and Units for Dropdowns
  const allowedDepartments = useMemo(() => {
    if (isGeral) return allDepartments;
    return allDepartments.filter(d => d.id === currentUser.departmentId);
  }, [allDepartments, isGeral, currentUser.departmentId]);

  const allowedUnits = useMemo(() => {
    if (isUnitOnly) {
      return allUnits.filter(u => u.id === currentUser.unitId);
    }
    if (isDeptScoped) {
      return allUnits.filter(u => u.departmentId === currentUser.departmentId);
    }
    if (selectedDept !== 'ALL') {
      return allUnits.filter(u => u.departmentId === selectedDept);
    }
    return allUnits;
  }, [allUnits, isUnitOnly, isDeptScoped, currentUser.unitId, currentUser.departmentId, selectedDept]);

  const visibleVaultsForDropdown = useMemo(() => {
    return allVaults.filter(v => {
      if (isExplosivistaRole && v.type !== 'EXPLOSIVOS') return false;
      if (selectedDept !== 'ALL' && v.departmentId !== selectedDept) return false;
      if (selectedUnit !== 'ALL' && v.unitId !== selectedUnit) return false;
      return true;
    });
  }, [allVaults, selectedDept, selectedUnit, isExplosivistaRole]);

  const getVaultById = (vaultId?: string | null) =>
    vaultId ? allVaults.find(v => v.id === vaultId) : undefined;

  const getUnitName = (unitId?: string | null) =>
    (unitId && allUnits.find(u => u.id === unitId)?.name) || unitId || '-';

  const getDeptName = (deptId?: string | null) =>
    (deptId && allDepartments.find(d => d.id === deptId)?.name) || deptId || '-';

  // Core Data Computation Engine (shared identically by Screen, Print, and CSV)
  const buildUnitScopeData = (unitFilterId: string, applyScreenFilters: boolean) => {
    const deptUnitIds = new Set(
      allUnits.filter(u => u.departmentId === currentUser.departmentId).map(u => u.id)
    );
    const selectedDeptUnitIds = new Set(
      selectedDept !== 'ALL'
        ? allUnits.filter(u => u.departmentId === selectedDept).map(u => u.id)
        : []
    );

    const isAllowedDeptUnit = (
      rawDeptId?: string | null,
      rawUnitId?: string | null,
      vaultId?: string | null
    ): boolean => {
      const vault = getVaultById(vaultId);
      const effectiveUnitId = rawUnitId || vault?.unitId || '';
      const effectiveDeptId =
        rawDeptId ||
        vault?.departmentId ||
        (effectiveUnitId ? allUnits.find(u => u.id === effectiveUnitId)?.departmentId || '' : '');

      // User Permission Gate
      if (!isGeral) {
        if (isDeptScoped) {
          const sameDept =
            effectiveDeptId === currentUser.departmentId ||
            (effectiveUnitId ? deptUnitIds.has(effectiveUnitId) : false);
          if (!sameDept) return false;
        } else {
          if (effectiveUnitId !== currentUser.unitId) return false;
        }
      }

      // Selected Department Gate
      if (selectedDept !== 'ALL') {
        const matchSelDept =
          effectiveDeptId === selectedDept ||
          (effectiveUnitId ? selectedDeptUnitIds.has(effectiveUnitId) : false);
        if (!matchSelDept) return false;
      }

      // Specific Unit vs All Units Gate
      if (unitFilterId && unitFilterId !== 'ALL') {
        if (effectiveUnitId !== unitFilterId) return false;
      }

      return true;
    };

    const matchesDateRange = (dateStr?: string | null): boolean => {
      if (!applyScreenFilters) return true;
      if (!startDate && !endDate) return true;
      if (!dateStr) return false;
      const ms = new Date(dateStr).getTime();
      if (Number.isNaN(ms)) return true;
      if (startDate && ms < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && ms > new Date(`${endDate}T23:59:59`).getTime()) return false;
      return true;
    };

    const matchesReason = (text?: string | null): boolean => {
      if (!applyScreenFilters || reasonFilter === 'ALL') return true;
      return (text || '').toLowerCase().includes(reasonFilter.toLowerCase());
    };

    const selectedCalObj = selectedCaliber !== 'ALL'
      ? calibers.find(c => c.id === selectedCaliber || (c.name || '').toLowerCase() === selectedCaliber.toLowerCase())
      : undefined;
    const selectedCalTargetName = (selectedCalObj?.name || selectedCaliber).trim().toLowerCase();
    const selectedCalTargetTipo = (selectedCalObj?.tipo || '').trim().toLowerCase();
    const selectedCalTargetPeso = (selectedCalObj?.peso || '').trim().toLowerCase();

    const matchesCaliber = (calName?: string | null): boolean => {
      if (!applyScreenFilters || selectedCaliber === 'ALL') return true;
      return (calName || '').trim().toLowerCase() === selectedCalTargetName;
    };

    const matchesAmmoCaliberSpec = (
      calId?: string | null,
      calName?: string | null,
      tipo?: string | null,
      peso?: string | null
    ): boolean => {
      if (!applyScreenFilters || selectedCaliber === 'ALL') return true;
      if (selectedCalObj && calId && calId === selectedCalObj.id) return true;
      if ((calName || '').trim().toLowerCase() !== selectedCalTargetName) return false;
      const itemTipo = (tipo || '').trim().toLowerCase();
      const itemPeso = (peso || '').trim().toLowerCase();
      if (selectedCalTargetTipo && itemTipo && itemTipo !== selectedCalTargetTipo) return false;
      if (selectedCalTargetPeso && itemPeso && itemPeso !== selectedCalTargetPeso) return false;
      return true;
    };

    const matchesVault = (vaultId?: string | null, vaultId2?: string | null): boolean => {
      if (!applyScreenFilters || selectedVaultSpace === 'ALL') return true;
      return vaultId === selectedVaultSpace || vaultId2 === selectedVaultSpace;
    };

    const matchesUser = (userId?: string | null, userId2?: string | null): boolean => {
      if (!applyScreenFilters || selectedUser === 'ALL') return true;
      return userId === selectedUser || userId2 === selectedUser;
    };

    const isTransferInTargetUnit = (
      originDept?: string | null,
      originUnit?: string | null,
      destDept?: string | null,
      destUnit?: string | null
    ): boolean => {
      return (
        isAllowedDeptUnit(originDept, originUnit, null) ||
        isAllowedDeptUnit(destDept, destUnit, null)
      );
    };

    // 1. COFRES DA UNIDADE
    const cofresRaw = allVaults.filter(v => {
      if (isExplosivistaRole && v.type !== 'EXPLOSIVOS') return false;
      if (!isAllowedDeptUnit(v.departmentId, v.unitId, v.id)) return false;
      if (applyScreenFilters && selectedVaultSpace !== 'ALL' && v.id !== selectedVaultSpace) return false;
      return true;
    });

    const cofres = cofresRaw.map(v => {
      const armasNoCofre = allWeapons.filter(w => w.vaultSpaceId === v.id).length;
      const municoesNoCofre = allAmmoStocks
        .filter(s => s.vaultSpaceId === v.id)
        .reduce((acc, s) => acc + Number(s.quantity || 0), 0);
      const materiaisNoCofre = allMateriais
        .filter(m =>
          m.vaultSpaceId
            ? m.vaultSpaceId === v.id
            : m.localGuarda === v.code && (!m.unidadeId || m.unidadeId === v.unitId)
        )
        .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
      const explosivosNoCofre = allExplosivos
        .filter(e => e.vaultSpaceId === v.id || e.cofreId === v.id || e.localArmazenamento === v.code)
        .reduce((acc, e) => acc + Number(e.quantidade || 0), 0);

      return {
        ...v,
        unitName: getUnitName(v.unitId),
        deptName: getDeptName(v.departmentId),
        armasCount: armasNoCofre,
        municoesCount: municoesNoCofre,
        materiaisCount: materiaisNoCofre,
        explosivosCount: explosivosNoCofre
      };
    });

    // 2. ARMAS DA UNIDADE + TODO HISTÓRICO DE MOVIMENTAÇÃO
    const armas = allWeapons.filter(w => {
      if (!isAllowedDeptUnit(w.departmentId, w.unitId, w.vaultSpaceId)) return false;
      if (!matchesVault(w.vaultSpaceId)) return false;
      if (!matchesCaliber(w.caliber)) return false;
      return true;
    });
    const scopedWeaponIds = new Set(armas.map(w => w.id));

    type WeaponHistoryEntry = {
      id: string;
      sortTime: number;
      dataHora: string;
      origem: string;
      arma: string;
      serie: string;
      calibre: string;
      policial: string;
      armeiro: string;
      detalhes: string;
      motivo: string;
      status: string;
      unidade: string;
    };

    const armaHistoricoRaw: WeaponHistoryEntry[] = [];

    allCautelasArmas.forEach(c => {
      const inUnit =
        isAllowedDeptUnit(c.departmentId, c.unitId, c.vaultSpaceId) ||
        (!c.unitId && scopedWeaponIds.has(c.weaponId));
      if (!inUnit) return;
      if (!matchesDateRange(c.requestDate || c.createdAt)) return;
      if (!matchesCaliber(c.weaponCaliber)) return;
      if (!matchesVault(c.vaultSpaceId)) return;
      if (!matchesUser(c.requesterId)) return;
      if (!matchesReason(c.reason || 'Cautela')) return;
      if (applyScreenFilters && recipientScope === 'FORA_DO_SISTEMA') return;

      const dateVal = c.requestDate || c.createdAt;
      armaHistoricoRaw.push({
        id: `ca-${c.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: 'Cautela de Arma',
        arma: `${c.weaponType || ''} ${c.weaponModel || ''}`.trim() || 'Armamento',
        serie: c.weaponSerialNumber || '-',
        calibre: c.weaponCaliber || '-',
        policial: `${c.requesterName || '-'} (MASP: ${c.requesterMasp || '-'})`,
        armeiro: c.returnArmorerName
          ? `Ent: ${c.armorerName || '-'} / Rec: ${c.returnArmorerName}`
          : c.armorerName || '-',
        detalhes: [
          `Carreg.: ${c.magazineQuantity ?? 0}`,
          c.ammoQuantity ? `Mun.: ${c.ammoQuantity} un` : '',
          c.hadShots ? `Disparos: ${c.shotsFired || 0}` : '',
          c.returnDate ? `Dev.: ${formatTimestamp(c.returnDate)}` : '',
          c.returnObservations || ''
        ]
          .filter(Boolean)
          .join(' | '),
        motivo: c.reason || 'Serviço Operacional',
        status: c.status,
        unidade: getUnitName(c.unitId)
      });
    });

    allMovements.forEach(m => {
      const inUnit =
        isAllowedDeptUnit(m.departmentId, m.unitId, m.withdrawalVaultSpaceId || m.returnVaultSpaceId) ||
        (!m.unitId && scopedWeaponIds.has(m.weaponId));
      if (!inUnit) return;
      if (!matchesDateRange(m.createdAt)) return;
      if (!matchesCaliber(m.caliber)) return;
      if (!matchesVault(m.withdrawalVaultSpaceId, m.returnVaultSpaceId)) return;
      if (!matchesUser(m.requesterId)) return;
      if (!matchesReason('Cautela')) return;
      if (applyScreenFilters && recipientScope === 'FORA_DO_SISTEMA') return;

      armaHistoricoRaw.push({
        id: `mov-${m.id}`,
        sortTime: new Date(m.createdAt).getTime() || 0,
        dataHora: m.createdAt,
        origem: 'Movimentação de Arma',
        arma: `${m.weaponType || ''} ${m.weaponModel || ''}`.trim(),
        serie: m.weaponSerialNumber || '-',
        calibre: m.caliber || '-',
        policial: `${m.requesterName || '-'} (MASP: ${m.requesterMasp || '-'})`,
        armeiro: m.receiptConfirmedByUserName || m.approvedByUserName || '-',
        detalhes: `Mun.: ${m.ammunitionCount || 0} un | Carreg.: ${m.magazineCount || 0}${m.receiptDate ? ` | Rec.: ${formatTimestamp(m.receiptDate)}` : ''}`,
        motivo: 'Cautela / Movimentação',
        status: m.status,
        unidade: getUnitName(m.unitId)
      });
    });

    allWeaponTransfers.forEach(t => {
      if (
        !isTransferInTargetUnit(
          t.originDepartmentId,
          t.originUnitId,
          t.destinationDepartmentId,
          t.destinationUnitId
        )
      ) {
        return;
      }
      const dateVal = t.transferDate || t.createdAt;
      if (!matchesDateRange(dateVal)) return;
      if (!matchesVault(t.destinationVaultSpaceId)) return;
      if (!matchesUser(t.transferredByUserId, t.receivedByUserId)) return;
      if (!matchesReason(t.reason || 'Transferência')) return;
      if (applyScreenFilters && selectedCaliber !== 'ALL') {
        const hasCal = (t.weapons || []).some(
          w => matchesCaliber(w.caliber)
        );
        if (!hasCal) return;
      }

      armaHistoricoRaw.push({
        id: `trf-w-${t.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: `Transferência (${t.protocolNumber || t.id})`,
        arma:
          (t.weapons || []).map(w => `${w.type} ${w.model}`).join(', ') ||
          `${t.totalWeapons} arma(s)`,
        serie: (t.weapons || []).map(w => w.serialNumber).join(', ') || '-',
        calibre:
          Array.from(new Set((t.weapons || []).map(w => w.caliber).filter(Boolean))).join(', ') ||
          '-',
        policial: `${t.receiverOrTransporterName || '-'} (MASP: ${t.receiverOrTransporterMasp || '-'})`,
        armeiro: `Exp: ${t.transferredByUserName || '-'}${t.receivedByUserName ? ` / Rec: ${t.receivedByUserName}` : ''}`,
        detalhes: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'} (${t.totalWeapons} armas, ${t.totalMagazines} carreg.)`,
        motivo: t.reason || 'Transferência entre Unidades',
        status: t.status,
        unidade: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}`
      });
    });

    const armaHistorico = armaHistoricoRaw.sort((a, b) => b.sortTime - a.sortTime);

    // 3. MUNIÇÕES DA UNIDADE + TODO HISTÓRICO DE MOVIMENTAÇÃO
    const municoesEstoque = allAmmoStocks
      .filter(s => {
        if (!isAllowedDeptUnit(s.departmentId, s.unitId, s.vaultSpaceId)) return false;
        if (!matchesVault(s.vaultSpaceId)) return false;
        const cal = calibers.find(c => c.id === s.caliberId);
        const calName = cal ? cal.name : s.caliberId;
        if (!matchesAmmoCaliberSpec(s.caliberId, calName, s.tipoMunicao || cal?.tipo, s.pesoMunicao || cal?.peso)) return false;
        return true;
      })
      .map(s => {
        const cal = calibers.find(c => c.id === s.caliberId);
        const vault = getVaultById(s.vaultSpaceId);
        return {
          ...s,
          caliberName: cal ? cal.name : s.caliberId,
          vaultCode: vault?.code || s.vaultSpaceId || '-',
          unitName: getUnitName(s.unitId || vault?.unitId)
        };
      });

    type AmmoHistoryEntry = {
      id: string;
      sortTime: number;
      dataHora: string;
      origem: string;
      calibre: string;
      quantidade: string;
      devolvido: string;
      cofre: string;
      responsavel: string;
      vinculo: string;
      armeiro: string;
      motivo: string;
      detalhes: string;
      status: string;
      unidade: string;
    };

    const municaoHistoricoRaw: AmmoHistoryEntry[] = [];

    allAmmoMovements.forEach(m => {
      if (!isAllowedDeptUnit(m.departmentId, m.unitId, m.vaultSpaceId)) return;
      if (!matchesDateRange(m.createdAt)) return;
      const cal = calibers.find(c => c.id === m.caliberId);
      const calName = cal ? cal.name : m.caliberId;
      if (!matchesAmmoCaliberSpec(m.caliberId, calName, m.tipoMunicao || cal?.tipo, m.pesoMunicao || cal?.peso)) return;
      if (!matchesVault(m.vaultSpaceId)) return;
      if (!matchesUser(m.responsibleUserId, m.userId)) return;
      if (!matchesReason(m.recipientOrReason)) return;
      if (applyScreenFilters && recipientScope === 'SISTEMA' && m.responsibleType === 'FORA_DO_SISTEMA') return;
      if (applyScreenFilters && recipientScope === 'FORA_DO_SISTEMA' && m.responsibleType !== 'FORA_DO_SISTEMA') return;

      const vault = getVaultById(m.vaultSpaceId);
      municaoHistoricoRaw.push({
        id: `am-${m.id}`,
        sortTime: new Date(m.createdAt).getTime() || 0,
        dataHora: m.createdAt,
        origem: `Movimentação (${m.type})`,
        calibre: calName,
        quantidade: `${m.quantity} un`,
        devolvido: `${m.returnedQuantity || 0} un`,
        cofre: vault?.code || m.vaultSpaceId || '-',
        responsavel: `${m.responsibleName || m.recipientOrReason || '-'}${m.responsibleMasp ? ` (MASP: ${m.responsibleMasp})` : ''}`,
        vinculo: m.responsibleType === 'FORA_DO_SISTEMA' ? 'Fora do Sistema' : 'No Sistema',
        armeiro: m.userName || '-',
        motivo: m.recipientOrReason || '-',
        detalhes: [
          m.fabricante,
          m.tipoMunicao,
          m.pesoMunicao,
          m.loteMunicao ? `Lote: ${m.loteMunicao}` : '',
          m.observation || m.observacao || ''
        ]
          .filter(Boolean)
          .join(' | '),
        status: m.type,
        unidade: getUnitName(m.unitId || vault?.unitId)
      });
    });

    allCautelasMunicoes.forEach(c => {
      if (!isAllowedDeptUnit(c.departmentId, c.unitId, c.vaultSpaceId)) return;
      const dateVal = c.requestDate || c.createdAt;
      if (!matchesDateRange(dateVal)) return;
      if (!matchesAmmoCaliberSpec(c.caliberId, c.caliberName, c.tipoMunicao, c.pesoMunicao)) return;
      if (!matchesVault(c.vaultSpaceId)) return;
      if (!matchesUser(c.requesterId)) return;
      if (!matchesReason(c.reason || c.destinacao || 'Cautela')) return;
      if (applyScreenFilters && recipientScope === 'FORA_DO_SISTEMA') return;

      const vault = getVaultById(c.vaultSpaceId);
      municaoHistoricoRaw.push({
        id: `cm-${c.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: c.linkedWeaponCautelaId ? 'Cautela de Munição (Vinculada)' : 'Cautela de Munição (Avulsa)',
        calibre: c.caliberName || '-',
        quantidade: `${c.quantity} un`,
        devolvido: `${c.returnedQuantity || 0} un`,
        cofre: vault?.code || c.vaultSpaceId || '-',
        responsavel: `${c.requesterName || '-'} (MASP: ${c.requesterMasp || '-'})`,
        vinculo: c.linkedWeaponSerialNumber ? `Arma ${c.linkedWeaponSerialNumber}` : 'No Sistema',
        armeiro: c.returnArmorerName
          ? `Ent: ${c.armorerName || '-'} / Rec: ${c.returnArmorerName}`
          : c.armorerName || '-',
        motivo: c.reason || c.destinacao || '-',
        detalhes: [
          c.fabricante,
          c.tipoMunicao,
          c.pesoMunicao,
          c.loteMunicao ? `Lote: ${c.loteMunicao}` : '',
          c.seraDevolvida ? 'Passiva de Devolução' : 'Consumo',
          c.observations || ''
        ]
          .filter(Boolean)
          .join(' | '),
        status: c.status,
        unidade: getUnitName(c.unitId || vault?.unitId)
      });
    });

    allAmmoTransfers.forEach(t => {
      if (
        !isTransferInTargetUnit(
          t.originDepartmentId,
          t.originUnitId,
          t.destinationDepartmentId,
          t.destinationUnitId
        )
      ) {
        return;
      }
      const dateVal = t.transferDate || t.createdAt;
      if (!matchesDateRange(dateVal)) return;
      if (!matchesVault(t.destinationVaultSpaceId)) return;
      if (!matchesUser(t.transferredByUserId, t.receivedByUserId)) return;
      if (!matchesReason(t.reason || 'Transferência')) return;
      if (applyScreenFilters && selectedCaliber !== 'ALL') {
        const hasCal = (t.items || []).some(
          i => matchesAmmoCaliberSpec(i.caliberId, i.caliberName, i.tipoMunicao, i.pesoMunicao)
        );
        if (!hasCal) return;
      }

      municaoHistoricoRaw.push({
        id: `trf-a-${t.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: `Transferência (${t.protocolNumber || t.id})`,
        calibre:
          (t.items || []).map(i => `${i.caliberName} (${i.quantity} un)`).join(', ') || '-',
        quantidade: `${t.totalQuantity} un`,
        devolvido: '-',
        cofre: t.destinationVaultSpaceCode || '-',
        responsavel: `${t.receiverOrTransporterName || '-'} (MASP: ${t.receiverOrTransporterMasp || '-'})`,
        vinculo: 'Transferência entre Unidades',
        armeiro: `Exp: ${t.transferredByUserName || '-'}${t.receivedByUserName ? ` / Rec: ${t.receivedByUserName}` : ''}`,
        motivo: t.reason || 'Transferência',
        detalhes: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}${t.observation ? ` | ${t.observation}` : ''}`,
        status: t.status,
        unidade: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}`
      });
    });

    const municaoHistorico = municaoHistoricoRaw.sort((a, b) => b.sortTime - a.sortTime);

    // 4. MATERIAIS DA UNIDADE + TODO HISTÓRICO DE MOVIMENTAÇÕES
    const materiais = allMateriais.filter(m => {
      if (!isAllowedDeptUnit(m.departamentoId, m.unidadeId, m.vaultSpaceId)) return false;
      if (!matchesVault(m.vaultSpaceId)) return false;
      return true;
    });

    type MaterialHistoryEntry = {
      id: string;
      sortTime: number;
      dataHora: string;
      origem: string;
      material: string;
      quantidade: string;
      destinatario: string;
      vinculo: string;
      armaria: string;
      motivo: string;
      detalhes: string;
      status: string;
      unidade: string;
    };

    const materialHistoricoRaw: MaterialHistoryEntry[] = [];

    allCautelasMateriais.forEach(c => {
      if (!isAllowedDeptUnit(c.departamentoId, c.unidadeId, c.vaultSpaceId)) return;
      const dateVal = c.dataRetirada || c.createdAt;
      if (!matchesDateRange(dateVal)) return;
      if (!matchesVault(c.vaultSpaceId, c.destinationVaultSpaceId)) return;
      if (!matchesUser(c.usuarioInternoId, c.responsavelEntregaId)) return;
      if (!matchesReason(c.finalidade || 'Cautela')) return;
      if (applyScreenFilters && recipientScope === 'SISTEMA' && c.tipoDestinatario === 'externo') return;
      if (applyScreenFilters && recipientScope === 'FORA_DO_SISTEMA' && c.tipoDestinatario !== 'externo') return;

      materialHistoricoRaw.push({
        id: `mat-c-${c.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: `Cautela (${c.protocolo || c.id})`,
        material: `${c.materialNome}${c.tipoMaterialNome ? ` (${c.tipoMaterialNome})` : ''}`,
        quantidade: `${c.quantidade} un`,
        destinatario:
          c.tipoDestinatario === 'interno'
            ? `${c.usuarioInternoNome || '-'} (MASP: ${c.usuarioInternoMasp || '-'})`
            : `${c.usuarioExternoNome || '-'} (${c.usuarioExternoOrgao || 'Externo'})`,
        vinculo: c.tipoDestinatario === 'externo' ? 'Fora do Sistema' : 'No Sistema',
        armaria: `Ent: ${c.responsavelEntregaNome || '-'}${c.responsavelRecebimentoNome ? ` / Rec: ${c.responsavelRecebimentoNome}` : ''}`,
        motivo: c.finalidade || '-',
        detalhes: [
          c.dataDevolucao ? `Devolução: ${formatTimestamp(c.dataDevolucao)}` : '',
          c.relatoUsoAnomalias || '',
          c.observacoes || ''
        ]
          .filter(Boolean)
          .join(' | ') || '-',
        status: c.status,
        unidade: getUnitName(c.unidadeId)
      });
    });

    allMaterialTransfers.forEach(t => {
      if (
        !isTransferInTargetUnit(
          t.originDepartmentId,
          t.originUnitId,
          t.destinationDepartmentId,
          t.destinationUnitId
        )
      ) {
        return;
      }
      const dateVal = t.transferDate || t.createdAt;
      if (!matchesDateRange(dateVal)) return;
      if (!matchesVault(t.destinationVaultSpaceId)) return;
      if (!matchesUser(t.transferredByUserId, t.receivedByUserId)) return;
      if (!matchesReason(t.reason || 'Transferência')) return;

      materialHistoricoRaw.push({
        id: `trf-m-${t.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: `Transferência (${t.protocolNumber || t.id})`,
        material: `${t.nomeMaterial}${t.numeroSerie ? ` (S/N: ${t.numeroSerie})` : ''}`,
        quantidade: `${t.quantidade} un`,
        destinatario: `${t.receiverOrTransporterName || '-'} (MASP: ${t.receiverOrTransporterMasp || '-'})`,
        vinculo: 'Transferência entre Unidades',
        armaria: `Exp: ${t.transferredByUserName || '-'}${t.receivedByUserName ? ` / Rec: ${t.receivedByUserName}` : ''}`,
        motivo: t.reason || '-',
        detalhes: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}${t.observation ? ` | ${t.observation}` : ''}`,
        status: t.status,
        unidade: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}`
      });
    });

    const materialHistorico = materialHistoricoRaw.sort((a, b) => b.sortTime - a.sortTime);

    // 5. EXPLOSIVOS DA UNIDADE + TODO HISTÓRICO DE MOVIMENTAÇÕES
    const explosivos = allExplosivos.filter(e => {
      if (!isAllowedDeptUnit(e.departmentId, e.unitId, e.vaultSpaceId || e.cofreId)) return false;
      if (!matchesVault(e.vaultSpaceId, e.cofreId)) return false;
      return true;
    });
    const scopedExplosivoIds = new Set(explosivos.map(e => e.id));

    type ExplosivoHistoryEntry = {
      id: string;
      sortTime: number;
      dataHora: string;
      origem: string;
      explosivo: string;
      quantidade: string;
      responsavel: string;
      local: string;
      motivo: string;
      detalhes: string;
      status: string;
      unidade: string;
    };

    const explosivoHistoricoRaw: ExplosivoHistoryEntry[] = [];

    allMovsExplosivos.forEach(m => {
      const inUnit =
        isAllowedDeptUnit(m.departmentId, m.unitId, m.cofreId) ||
        (!m.unitId && scopedExplosivoIds.has(m.explosivoId));
      if (!inUnit) return;
      if (!matchesDateRange(m.dataMovimentacao)) return;
      if (!matchesVault(m.cofreId)) return;
      if (!matchesUser(m.responsavelId)) return;
      if (!matchesReason(m.motivo || m.tipoMovimentacao)) return;

      explosivoHistoricoRaw.push({
        id: `exp-m-${m.id}`,
        sortTime: new Date(m.dataMovimentacao).getTime() || 0,
        dataHora: m.dataMovimentacao,
        origem: m.tipoMovimentacao || 'Movimentação',
        explosivo: m.nomeExplosivo || m.explosivoNome || '-',
        quantidade: `${m.quantidade} ${m.unidadeMedida || ''}`.trim(),
        responsavel: `${m.responsavelNome || '-'}${m.responsavelMasp ? ` (MASP: ${m.responsavelMasp})` : ''}`,
        local: m.localOrigemDestino || m.localCofre || '-',
        motivo: m.motivo || '-',
        detalhes: m.observacoes || '-',
        status: m.tipoMovimentacao,
        unidade: getUnitName(m.unitId)
      });
    });

    allExplosivoTransfers.forEach(t => {
      if (
        !isTransferInTargetUnit(
          t.originDepartmentId,
          t.originUnitId,
          t.destinationDepartmentId,
          t.destinationUnitId
        )
      ) {
        return;
      }
      const dateVal = t.transferDate || t.createdAt;
      if (!matchesDateRange(dateVal)) return;
      if (!matchesVault(t.destinationVaultSpaceId)) return;
      if (!matchesUser(t.transferredByUserId, t.receivedByUserId)) return;
      if (!matchesReason(t.reason || 'Transferência')) return;

      explosivoHistoricoRaw.push({
        id: `trf-e-${t.id}`,
        sortTime: new Date(dateVal).getTime() || 0,
        dataHora: dateVal,
        origem: `Transferência (${t.protocolNumber || t.id})`,
        explosivo: `${t.nomeExplosivo}${t.lote ? ` (Lote: ${t.lote})` : ''}`,
        quantidade: `${t.quantidade} ${t.unidadeMedida || ''}`.trim(),
        responsavel: `${t.receiverOrTransporterName || '-'} (MASP: ${t.receiverOrTransporterMasp || '-'})`,
        local: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}`,
        motivo: t.reason || '-',
        detalhes: `Exp: ${t.transferredByUserName || '-'}${t.receivedByUserName ? ` / Rec: ${t.receivedByUserName}` : ''}${t.observation ? ` | ${t.observation}` : ''}`,
        status: t.status,
        unidade: `${t.originUnitName || '-'} → ${t.destinationUnitName || '-'}`
      });
    });

    const explosivoHistorico = explosivoHistoricoRaw.sort((a, b) => b.sortTime - a.sortTime);

    // 6. CANIL (CANIS FÍSICOS, CÃES K9, FARMÁCIA VETERINÁRIA E HISTÓRICO DE APLICAÇÕES)
    const matchesCanilScope = (rawDeptId?: string | null, rawUnitId?: string | null): boolean => {
      if (!rawDeptId && !rawUnitId) {
        return unitFilterId === 'ALL' || isUnitOnly;
      }
      return isAllowedDeptUnit(rawDeptId, rawUnitId, null);
    };

    const canisFisicos = allCanisFisicos
      .filter(k => matchesCanilScope(k.departmentId, k.unitId))
      .map(k => ({
        ...k,
        dogsCount: allCachorros.filter(c => c.canilFisicoId === k.id).length,
        unitName: getUnitName(k.unitId)
      }));

    const cachorrosCanil = allCachorros
      .filter(d => {
        if (!matchesCanilScope(d.departmentId, d.unitId)) return false;
        if (!matchesUser(d.usuarioInternoId)) return false;
        if (applyScreenFilters && recipientScope === 'SISTEMA' && d.tipoVinculo !== 'SISTEMA') return false;
        if (applyScreenFilters && recipientScope === 'FORA_DO_SISTEMA' && d.tipoVinculo !== 'EXTERNO') return false;
        return true;
      })
      .map(d => {
        const kennel = allCanisFisicos.find(k => k.id === d.canilFisicoId);
        return {
          ...d,
          canilNome: kennel ? `${kennel.nome}${kennel.identificacao ? ` (${kennel.identificacao})` : ''}` : d.canilFisicoNome || 'Não alocado',
          unitName: getUnitName(d.unitId)
        };
      });

    const produtosCanil = allProdutosVet
      .filter(p => matchesCanilScope(p.departmentId, p.unitId))
      .map(p => ({
        ...p,
        unitName: getUnitName(p.unitId)
      }));

    const canilTotalValorEstoque = produtosCanil.reduce(
      (acc, p) => acc + Number(p.quantidadeEstoque || 0) * Number(p.valorUnitario || 0),
      0
    );

    const movimentacoesCanil = allMovsVet
      .filter(m => {
        if (!matchesCanilScope(m.departmentId, m.unitId)) return false;
        if (!matchesDateRange(m.dataHora || m.createdAt)) return false;
        if (!matchesUser(m.responsavelAplicacaoId)) return false;
        if (!matchesReason(m.motivo || m.tipoMovimentacao)) return false;
        return true;
      })
      .map(m => ({
        ...m,
        sortTime: new Date((m.dataHora || m.createdAt || '').replace(' ', 'T')).getTime() || 0,
        unitName: getUnitName(m.unitId)
      }))
      .sort((a, b) => b.sortTime - a.sortTime);

    return {
      cofres,
      armas,
      armaHistorico,
      municoesEstoque,
      municaoHistorico,
      materiais,
      materialHistorico,
      explosivos,
      explosivoHistorico,
      canisFisicos,
      cachorrosCanil,
      produtosCanil,
      movimentacoesCanil,
      canilTotalValorEstoque
    };
  };

  // Screen data follows current screen filters
  const screenData = useMemo(
    () => buildUnitScopeData(selectedUnit, true),
    [
      selectedUnit,
      selectedDept,
      startDate,
      endDate,
      selectedUser,
      selectedCaliber,
      selectedVaultSpace,
      recipientScope,
      reasonFilter,
      dataVersion,
      allVaults,
      allWeapons,
      allMovements,
      allCautelasArmas,
      allWeaponTransfers,
      allAmmoStocks,
      allAmmoMovements,
      allCautelasMunicoes,
      allAmmoTransfers,
      allMateriais,
      allCautelasMateriais,
      allMaterialTransfers,
      allExplosivos,
      allMovsExplosivos,
      allExplosivoTransfers,
      allCanisFisicos,
      allCachorros,
      allProdutosVet,
      allMovsVet,
      isExplosivistaRole,
      hasCanilAccess,
      isUnitOnly
    ]
  );

  const getDefaultSectionsForRole = (): SectionSelection => {
    if (isCanilOnly) {
      return {
        cofres: false,
        armas: false,
        municoes: false,
        materiais: false,
        explosivos: false,
        canil: true
      };
    }
    if (isExplosivistaRole) {
      return {
        cofres: true,
        armas: false,
        municoes: false,
        materiais: false,
        explosivos: true,
        canil: false
      };
    }
    return {
      cofres: true,
      armas: true,
      municoes: true,
      materiais: true,
      explosivos: true,
      canil: hasCanilAccess
    };
  };

  // Open shared modal for Print OR CSV
  const openActionModal = (mode: 'PRINT' | 'CSV') => {
    setActionModalMode(mode);
    if (isUnitOnly) {
      setModalUnitId(currentUser.unitId || 'ALL');
    } else {
      setModalUnitId(selectedUnit || 'ALL');
    }
    setModalScopeMode('FULL_UNIT');
    if (isCanilOnly) {
      setModalSections({
        cofres: false,
        armas: false,
        municoes: false,
        materiais: false,
        explosivos: false,
        canil: true
      });
    } else if (isExplosivistaRole) {
      setModalSections({
        cofres: activeTab === 'COFRES',
        armas: false,
        municoes: false,
        materiais: false,
        explosivos: activeTab === 'EXPLOSIVOS',
        canil: false
      });
    } else {
      setModalSections({
        cofres: activeTab === 'TODOS' || activeTab === 'COFRES',
        armas: activeTab === 'TODOS' || activeTab === 'ARMAS',
        municoes: activeTab === 'TODOS' || activeTab === 'MUNICIONAL',
        materiais: activeTab === 'TODOS' || activeTab === 'MATERIAIS',
        explosivos: activeTab === 'TODOS' || activeTab === 'EXPLOSIVOS',
        canil: hasCanilAccess && (activeTab === 'TODOS' || activeTab === 'CANIL')
      });
    }
  };

  const escapeCsvCell = (val: unknown): string => {
    const str = val === undefined || val === null ? '' : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const escapeHtml = (val: unknown): string => {
    if (val === undefined || val === null) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const executeExportCSV = (
    targetUnitId: string,
    applyScreenFilters: boolean,
    sections: SectionSelection
  ) => {
    const data = buildUnitScopeData(targetUnitId, applyScreenFilters);
    const unitLabel =
      targetUnitId === 'ALL'
        ? isUnitOnly
          ? getUnitName(currentUser.unitId)
          : 'Todas as Unidades do Escopo'
        : getUnitName(targetUnitId);

    const rows: string[][] = [
      ['POLÍCIA CIVIL DE MINAS GERAIS • SISTEMA DE ARMARIA'],
      ['RELATÓRIO OPERACIONAL DA UNIDADE', unitLabel],
      ['EMISSOR', `${currentUser.name} (MASP: ${currentUser.masp})`],
      ['DATA/HORA DE EMISSÃO', new Date().toLocaleString('pt-BR')],
      ['ABRANGÊNCIA', applyScreenFilters ? 'Com Filtros da Tela' : 'Relatório Completo da Unidade']
    ];

    const safeSections: SectionSelection = {
      cofres: Boolean(sections.cofres && !isCanilOnly),
      armas: Boolean(sections.armas && !isExplosivistaRole && !isCanilOnly),
      municoes: Boolean(sections.municoes && !isExplosivistaRole && !isCanilOnly),
      materiais: Boolean(sections.materiais && !isExplosivistaRole && !isCanilOnly),
      explosivos: Boolean(sections.explosivos && !isCanilOnly),
      canil: Boolean(sections.canil && hasCanilAccess)
    };

    if (safeSections.cofres) {
      rows.push([], [isExplosivistaRole ? '=== 1. COFRES DE EXPLOSIVOS DA UNIDADE ===' : '=== 1. COFRES DA UNIDADE ===']);
      if (isExplosivistaRole) {
        rows.push([
          'Código do Cofre',
          'Tipo',
          'Descrição Curta',
          'Unidade',
          'Departamento',
          'Explosivos'
        ]);
        data.cofres.forEach(v => {
          rows.push([
            v.code,
            v.type,
            v.descricaoCurta || '-',
            v.unitName,
            v.deptName,
            String(v.explosivosCount)
          ]);
        });
      } else {
        rows.push([
          'Código do Cofre',
          'Tipo',
          'Descrição Curta',
          'Unidade',
          'Departamento',
          'Armas',
          'Munições (un)',
          'Materiais (un)',
          'Explosivos'
        ]);
        data.cofres.forEach(v => {
          rows.push([
            v.code,
            v.type,
            v.descricaoCurta || '-',
            v.unitName,
            v.deptName,
            String(v.armasCount),
            String(v.municoesCount),
            String(v.materiaisCount),
            String(v.explosivosCount)
          ]);
        });
      }
    }

    if (safeSections.armas) {
      rows.push([], ['=== 2A. ARMAS DA UNIDADE (ACERVO ATUAL) ===']);
      rows.push([
        'Tipo',
        'Modelo',
        'Fabricante',
        'Nº Série',
        'Calibre',
        'Carregadores',
        'Disparos Acumulados',
        'Cofre',
        'Unidade',
        'Status'
      ]);
      data.armas.forEach(w => {
        const vault = getVaultById(w.vaultSpaceId);
        rows.push([
          w.type,
          w.model,
          w.manufacturer,
          w.serialNumber,
          w.caliber,
          String(w.magazineQuantity || 0),
          String(w.shotCount || 0),
          vault?.code || w.vaultSpaceId || '-',
          getUnitName(w.unitId),
          w.status
        ]);
      });

      rows.push([], ['=== 2B. HISTÓRICO COMPLETO DE MOVIMENTAÇÃO DE ARMAS ===']);
      rows.push([
        'Data/Hora',
        'Origem/Tipo',
        'Arma',
        'Nº Série',
        'Calibre',
        'Policial / Solicitante',
        'Armeiro / Responsável',
        'Motivo',
        'Detalhes',
        'Status',
        'Unidade'
      ]);
      data.armaHistorico.forEach(h => {
        rows.push([
          formatTimestamp(h.dataHora),
          h.origem,
          h.arma,
          h.serie,
          h.calibre,
          h.policial,
          h.armeiro,
          h.motivo,
          h.detalhes,
          h.status,
          h.unidade
        ]);
      });
    }

    if (safeSections.municoes) {
      rows.push([], ['=== 3A. MUNIÇÕES DA UNIDADE (ESTOQUE ATUAL) ===']);
      rows.push([
        'Calibre',
        'Quantidade (un)',
        'Fabricante',
        'Tipo',
        'Peso',
        'Lote',
        'Ano',
        'Destinação',
        'Cofre',
        'Unidade'
      ]);
      data.municoesEstoque.forEach(s => {
        rows.push([
          s.caliberName,
          String(s.quantity),
          s.fabricante || '-',
          s.tipoMunicao || '-',
          s.pesoMunicao || '-',
          s.loteMunicao || '-',
          String(s.anoFabricacao || '-'),
          s.destinacao || '-',
          s.vaultCode,
          s.unitName
        ]);
      });

      rows.push([], ['=== 3B. HISTÓRICO COMPLETO DE MOVIMENTAÇÃO DE MUNIÇÕES ===']);
      rows.push([
        'Data/Hora',
        'Origem/Tipo',
        'Calibre',
        'Qtd',
        'Sobra Devolvida',
        'Cofre',
        'Responsável',
        'Vínculo',
        'Armeiro',
        'Motivo',
        'Detalhes',
        'Status',
        'Unidade'
      ]);
      data.municaoHistorico.forEach(h => {
        rows.push([
          formatTimestamp(h.dataHora),
          h.origem,
          h.calibre,
          h.quantidade,
          h.devolvido,
          h.cofre,
          h.responsavel,
          h.vinculo,
          h.armeiro,
          h.motivo,
          h.detalhes,
          h.status,
          h.unidade
        ]);
      });
    }

    if (safeSections.materiais) {
      rows.push([], ['=== 4A. MATERIAIS DA UNIDADE (INVENTÁRIO ATUAL) ===']);
      rows.push([
        'Material',
        'Tipo',
        'Nº Série / Patrimônio',
        'Cofre / Local',
        'Qtd Total',
        'Disponível',
        'Em Uso',
        'Consumida',
        'Cautelável p/ Policiais',
        'Validade',
        'Unidade',
        'Observações'
      ]);
      data.materiais.forEach(m => {
        rows.push([
          m.nome,
          m.tipoMaterialNome,
          m.numeroSerie || '-',
          m.localGuarda || '-',
          String(m.quantidade),
          String(m.quantidadeDisponivel),
          String(m.quantidadeEmUso),
          String(m.quantidadeConsumida),
          m.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO',
          m.validade ? new Date(m.validade).toLocaleDateString('pt-BR') : 'Não perecível',
          m.unidadeNome || getUnitName(m.unidadeId),
          m.observacoes || '-'
        ]);
      });

      rows.push([], ['=== 4B. HISTÓRICO COMPLETO DE MOVIMENTAÇÃO DE MATERIAIS ===']);
      rows.push([
        'Data/Hora',
        'Origem/Protocolo',
        'Material',
        'Quantidade',
        'Destinatário / Portador',
        'Vínculo',
        'Responsável Armaria',
        'Finalidade / Motivo',
        'Detalhes / Anomalias',
        'Status',
        'Unidade'
      ]);
      data.materialHistorico.forEach(h => {
        rows.push([
          formatTimestamp(h.dataHora),
          h.origem,
          h.material,
          h.quantidade,
          h.destinatario,
          h.vinculo,
          h.armaria,
          h.motivo,
          h.detalhes,
          h.status,
          h.unidade
        ]);
      });
    }

    if (safeSections.explosivos) {
      rows.push([], ['=== 5A. EXPLOSIVOS DA UNIDADE (ACERVO ATUAL) ===']);
      rows.push([
        'Nome',
        'Tipo',
        'Subtipo',
        'Quantidade',
        'Unidade Medida',
        'Lote',
        'Fabricante',
        'Classe Risco',
        'Validade',
        'Local / Paiol',
        'Unidade',
        'Status'
      ]);
      data.explosivos.forEach(e => {
        rows.push([
          e.nome,
          e.tipo,
          e.subtipo || '-',
          String(e.quantidade),
          e.unidadeMedida,
          e.lote,
          e.fabricante,
          e.classeRisco,
          e.dataValidade ? new Date(e.dataValidade).toLocaleDateString('pt-BR') : '-',
          e.localArmazenamento,
          getUnitName(e.unitId),
          e.status
        ]);
      });

      rows.push([], ['=== 5B. HISTÓRICO COMPLETO DE MOVIMENTAÇÃO DE EXPLOSIVOS ===']);
      rows.push([
        'Data/Hora',
        'Origem/Tipo',
        'Explosivo',
        'Quantidade',
        'Responsável',
        'Local / Destino',
        'Motivo',
        'Observações',
        'Status',
        'Unidade'
      ]);
      data.explosivoHistorico.forEach(h => {
        rows.push([
          h.dataHora ? formatTimestamp(h.dataHora) : '-',
          h.origem,
          h.explosivo,
          h.quantidade,
          h.responsavel,
          h.local,
          h.motivo,
          h.detalhes,
          h.status,
          h.unidade
        ]);
      });
    }

    if (safeSections.canil) {
      rows.push([], ['=== 6A. CANIL - CANIS FÍSICOS E BAIAS ===']);
      rows.push(['Nome do Canil', 'Identificação', 'Capacidade', 'Cães Alocados', 'Localização', 'Unidade', 'Status']);
      data.canisFisicos.forEach(k => {
        rows.push([
          k.nome,
          k.identificacao || '-',
          String(k.capacidade || 0),
          String(k.dogsCount),
          k.localizacao || '-',
          k.unitName,
          k.status
        ]);
      });

      rows.push([], ['=== 6B. CANIL - CÃES POLICIAIS K9 ===']);
      rows.push(['Nome', 'Raça', 'Sexo', 'Microchip', 'Especialidade', 'Baia / Canil', 'Condutor / Responsável', 'Vínculo', 'Unidade', 'Status']);
      data.cachorrosCanil.forEach(d => {
        const condutor =
          d.tipoVinculo === 'SISTEMA'
            ? `${d.usuarioInternoNome || '-'} (MASP: ${d.usuarioInternoMasp || '-'})`
            : `${d.responsavelExternoNome || '-'} (${d.responsavelExternoOrgao || 'Externo'})`;
        rows.push([
          d.nome,
          d.raca,
          d.sexo,
          d.microchip || '-',
          d.especialidade || '-',
          d.canilNome,
          condutor,
          d.tipoVinculo === 'SISTEMA' ? 'No Sistema' : 'Externo',
          d.unitName,
          d.status
        ]);
      });

      rows.push([], ['=== 6C. CANIL - FARMÁCIA, MEDICAMENTOS E RAÇÕES ===']);
      rows.push(['Produto', 'Tipo', 'Categoria / Forma', 'Fabricante', 'Lote', 'Validade', 'Estoque Atual', 'Estoque Mínimo', 'Unidade Medida', 'Valor Unit. (R$)', 'Local de Guarda', 'Unidade']);
      data.produtosCanil.forEach(p => {
        rows.push([
          p.nome,
          p.tipo,
          [p.categoria, p.formaFarmaceutica].filter(Boolean).join(' / ') || '-',
          p.fabricante || '-',
          p.lote || '-',
          p.temValidade && p.dataValidade ? new Date(p.dataValidade).toLocaleDateString('pt-BR') : 'Sem validade',
          String(p.quantidadeEstoque),
          String(p.quantidadeMinima),
          p.unidadeMedida,
          Number(p.valorUnitario || 0).toFixed(2),
          p.localGuarda || '-',
          p.unitName
        ]);
      });

      rows.push([], ['=== 6D. CANIL - HISTÓRICO DE APLICAÇÕES E MOVIMENTAÇÕES ===']);
      rows.push(['Data/Hora', 'Tipo Movimentação', 'Produto', 'Quantidade', 'Cão K9', 'Microchip', 'Dosagem / Frequência', 'Condutor', 'Aplicador / Responsável', 'Motivo', 'Valor Total (R$)', 'Observações', 'Unidade']);
      data.movimentacoesCanil.forEach(m => {
        rows.push([
          m.dataHora ? formatTimestamp(m.dataHora) : '-',
          m.tipoMovimentacao,
          m.produtoNome,
          `${m.quantidade} ${m.unidadeMedida}`,
          m.cachorroNome || '-',
          m.cachorroMicrochip || '-',
          [m.dosagemAplicada, m.frequenciaAdministrada].filter(Boolean).join(' • ') || '-',
          m.condutorNome || '-',
          `${m.responsavelAplicacaoNome || '-'}${m.responsavelAplicacaoMasp ? ` (MASP: ${m.responsavelAplicacaoMasp})` : ''}`,
          m.motivo || '-',
          Number(m.valorTotalItem || 0).toFixed(2),
          m.observacoes || '-',
          m.unitName
        ]);
      });
    }

    const csvText = '\uFEFF' + rows.map(row => row.map(escapeCsvCell).join(';')).join('\r\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const safeUnitSlug = unitLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_|_$/g, '');
    const link = document.createElement('a');
    link.href = url;
    link.download = buildStandardDocumentFilename(
      'Relatório Gerencial (Relatórios)',
      `${unitLabel || 'Unidade'} (${new Date().toISOString().slice(0, 10)})`,
      currentUser.name,
      'csv'
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const executePrintReport = (
    targetUnitId: string,
    applyScreenFilters: boolean,
    sections: SectionSelection
  ) => {
    const data = buildUnitScopeData(targetUnitId, applyScreenFilters);
    const targetUnitObj =
      targetUnitId !== 'ALL'
        ? allUnits.find(u => u.id === targetUnitId)
        : isUnitOnly
        ? allUnits.find(u => u.id === currentUser.unitId)
        : undefined;
    const targetDeptObj =
      (targetUnitObj && allDepartments.find(d => d.id === targetUnitObj.departmentId)) ||
      (selectedDept !== 'ALL'
        ? allDepartments.find(d => d.id === selectedDept)
        : allDepartments.find(d => d.id === currentUser.departmentId));

    const logoSrc = getSystemLogo(targetUnitObj, targetDeptObj);
    const unitTitle =
      targetUnitId === 'ALL'
        ? isUnitOnly
          ? getUnitName(currentUser.unitId)
          : selectedDept !== 'ALL'
          ? `Todas as Unidades — ${targetDeptObj?.name || ''}`
          : 'Todas as Unidades Permitidas'
        : targetUnitObj?.name || targetUnitId;

    const renderEmpty = (msg: string) =>
      `<div class="empty-box">${escapeHtml(msg)}</div>`;

    const safeSections: SectionSelection = {
      cofres: Boolean(sections.cofres && !isCanilOnly),
      armas: Boolean(sections.armas && !isExplosivistaRole && !isCanilOnly),
      municoes: Boolean(sections.municoes && !isExplosivistaRole && !isCanilOnly),
      materiais: Boolean(sections.materiais && !isExplosivistaRole && !isCanilOnly),
      explosivos: Boolean(sections.explosivos && !isCanilOnly),
      canil: Boolean(sections.canil && hasCanilAccess)
    };

    const summaryCardsHtml = (() => {
      if (isCanilOnly) {
        return `
          <div class="summary-bar">
            <div class="sum-card"><label>Canis / Baias</label><span>${data.canisFisicos.length}</span></div>
            <div class="sum-card"><label>Cães K9</label><span>${data.cachorrosCanil.length}</span></div>
            <div class="sum-card"><label>Itens Farmácia</label><span>${data.produtosCanil.length}</span></div>
            <div class="sum-card"><label>Aplicações / Mov.</label><span>${data.movimentacoesCanil.length}</span></div>
            <div class="sum-card"><label>Valor em Estoque</label><span>R$ ${data.canilTotalValorEstoque.toFixed(2)}</span></div>
          </div>
        `;
      }
      if (isExplosivistaRole) {
        return `
          <div class="summary-bar" style="grid-template-columns: repeat(2, 1fr);">
            <div class="sum-card"><label>Cofres de Explosivos</label><span>${data.cofres.length}</span></div>
            <div class="sum-card"><label>Explosivos / Movimentações</label><span>${data.explosivos.length} / ${data.explosivoHistorico.length}</span></div>
          </div>
        `;
      }
      return `
        <div class="summary-bar" style="grid-template-columns: repeat(${hasCanilAccess ? 6 : 5}, 1fr);">
          <div class="sum-card"><label>Cofres da Unidade</label><span>${data.cofres.length}</span></div>
          <div class="sum-card"><label>Armas / Movim.</label><span>${data.armas.length} / ${data.armaHistorico.length}</span></div>
          <div class="sum-card"><label>Munições (un) / Mov.</label><span>${data.municoesEstoque.reduce((a, s) => a + Number(s.quantity || 0), 0)} / ${data.municaoHistorico.length}</span></div>
          <div class="sum-card"><label>Materiais / Mov.</label><span>${data.materiais.length} / ${data.materialHistorico.length}</span></div>
          <div class="sum-card"><label>Explosivos / Mov.</label><span>${data.explosivos.length} / ${data.explosivoHistorico.length}</span></div>
          ${hasCanilAccess ? `<div class="sum-card"><label>Canil (Cães / Mov.)</label><span>${data.cachorrosCanil.length} / ${data.movimentacoesCanil.length}</span></div>` : ''}
        </div>
      `;
    })();

    const reportDocTitle = buildStandardDocumentTitle(
      'Relatório Geral da Unidade (Relatórios)',
      unitTitle,
      currentUser.name
    );

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(reportDocTitle)}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 12px; font-size: 9.5px; line-height: 1.3; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; gap: 12px; }
          .header-left { display: flex; align-items: center; gap: 10px; }
          .logo { height: 48px; width: auto; object-fit: contain; }
          .title { font-size: 13.5px; font-weight: 900; text-transform: uppercase; color: #0f172a; }
          .subtitle { font-size: 9.5px; font-weight: 700; color: #b45309; text-transform: uppercase; margin-top: 2px; }
          .meta { font-family: monospace; font-size: 9px; text-align: right; color: #334155; }
          .summary-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }
          .sum-card { border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px; text-align: center; background: #f8fafc; }
          .sum-card label { display: block; font-size: 8px; text-transform: uppercase; font-weight: 700; color: #64748b; }
          .sum-card span { font-size: 12px; font-weight: 900; font-family: monospace; color: #0f172a; }
          .section-block { margin-top: 14px; page-break-inside: auto; }
          .sec-title { font-size: 11px; font-weight: 900; text-transform: uppercase; background: #0f172a; color: #fff; padding: 5px 8px; border-radius: 4px; margin-bottom: 6px; page-break-after: avoid; }
          .sub-title { font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #b45309; border-left: 3px solid #d97706; padding-left: 6px; margin: 8px 0 4px; page-break-after: avoid; }
          table { width: 100%; border-collapse: collapse; font-size: 8.8px; margin-bottom: 8px; }
          th { background: #e2e8f0; color: #0f172a; border: 1px solid #94a3b8; padding: 4px 5px; text-align: left; text-transform: uppercase; font-size: 8px; font-weight: 800; }
          td { border: 1px solid #cbd5e1; padding: 4px 5px; vertical-align: top; }
          tr:nth-child(even) { background: #f8fafc; }
          .mono { font-family: monospace; }
          .empty-box { padding: 10px; border: 1px dashed #cbd5e1; text-align: center; color: #64748b; font-style: italic; margin-bottom: 8px; }
          .signatures { display: flex; justify-content: center; margin-top: 24px; page-break-inside: avoid; }
          .sig-line { width: 280px; border-top: 1px solid #0f172a; padding-top: 5px; text-align: center; font-weight: 700; font-size: 9.5px; }
          .footer { margin-top: 12px; border-top: 1px solid #cbd5e1; padding-top: 5px; text-align: center; font-size: 8px; color: #64748b; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <img src="${escapeHtml(logoSrc)}" alt="Brasão PCMG" class="logo" />
            <div>
              <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
              <div class="subtitle">${
                isCanilOnly
                  ? `RELATÓRIO DO CANIL K9 • ${escapeHtml(unitTitle)}`
                  : isExplosivistaRole
                  ? `RELATÓRIO DE COFRES DE EXPLOSIVOS E EXPLOSIVOS • ${escapeHtml(unitTitle)}`
                  : `RELATÓRIO OPERACIONAL COMPLETO • ${escapeHtml(unitTitle)}`
              }</div>
            </div>
          </div>
          <div class="meta">
            <div>Emissor: <strong>${escapeHtml(currentUser.name)}</strong> (MASP: ${escapeHtml(currentUser.masp)})</div>
            <div>Escopo: ${applyScreenFilters ? 'Com Filtros da Tela' : 'Relatório Completo da Unidade'}</div>
            <div>Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        ${summaryCardsHtml}

        ${safeSections.cofres ? `
          <div class="section-block">
            <div class="sec-title">1. ${isExplosivistaRole ? 'COFRES DE EXPLOSIVOS DA UNIDADE' : 'COFRES DA UNIDADE'} (${data.cofres.length})</div>
            ${data.cofres.length === 0 ? renderEmpty('Nenhum cofre encontrado para o escopo selecionado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Código do Cofre</th>
                    <th>Tipo</th>
                    <th>Descrição Curta</th>
                    <th>Unidade</th>
                    <th>Departamento</th>
                    ${!isExplosivistaRole ? '<th>Armas</th><th>Munições</th><th>Materiais</th>' : ''}
                    <th>Explosivos</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.cofres.map(v => `
                    <tr>
                      <td class="mono"><strong>${escapeHtml(v.code)}</strong></td>
                      <td>${escapeHtml(v.type)}</td>
                      <td>${escapeHtml(v.descricaoCurta || '-')}</td>
                      <td>${escapeHtml(v.unitName)}</td>
                      <td>${escapeHtml(v.deptName)}</td>
                      ${!isExplosivistaRole ? `
                        <td class="mono">${v.armasCount}</td>
                        <td class="mono">${v.municoesCount} un</td>
                        <td class="mono">${v.materiaisCount} un</td>
                      ` : ''}
                      <td class="mono">${v.explosivosCount}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        ` : ''}

        ${safeSections.armas ? `
          <div class="section-block">
            <div class="sec-title">2. ARMAS DA UNIDADE E HISTÓRICO COMPLETO DE MOVIMENTAÇÃO</div>
            <div class="sub-title">2A. Acervo de Armamento da Unidade (${data.armas.length})</div>
            ${data.armas.length === 0 ? renderEmpty('Nenhuma arma encontrada para o escopo selecionado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Tipo / Modelo</th>
                    <th>Fabricante</th>
                    <th>Nº Série</th>
                    <th>Calibre</th>
                    <th>Carreg.</th>
                    <th>Disparos</th>
                    <th>Cofre</th>
                    <th>Unidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.armas.map(w => {
                    const vault = getVaultById(w.vaultSpaceId);
                    return `
                      <tr>
                        <td><strong>${escapeHtml(w.type)} ${escapeHtml(w.model)}</strong></td>
                        <td>${escapeHtml(w.manufacturer)}</td>
                        <td class="mono">${escapeHtml(w.serialNumber)}</td>
                        <td class="mono">${escapeHtml(w.caliber)}</td>
                        <td class="mono">${w.magazineQuantity || 0}</td>
                        <td class="mono">${w.shotCount || 0}</td>
                        <td class="mono">${escapeHtml(vault?.code || w.vaultSpaceId || '-')}</td>
                        <td>${escapeHtml(getUnitName(w.unitId))}</td>
                        <td><strong>${escapeHtml(w.status)}</strong></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">2B. Histórico Completo de Movimentações de Armamento (${data.armaHistorico.length})</div>
            ${data.armaHistorico.length === 0 ? renderEmpty('Nenhuma movimentação de armamento registrada.') : `
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Origem</th>
                    <th>Arma / Série</th>
                    <th>Calibre</th>
                    <th>Policial / Portador</th>
                    <th>Armeiro / Operador</th>
                    <th>Motivo</th>
                    <th>Detalhes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.armaHistorico.map(h => `
                    <tr>
                      <td class="mono">${escapeHtml(formatTimestamp(h.dataHora))}</td>
                      <td>${escapeHtml(h.origem)}</td>
                      <td><strong>${escapeHtml(h.arma)}</strong><br/><span class="mono">${escapeHtml(h.serie)}</span></td>
                      <td class="mono">${escapeHtml(h.calibre)}</td>
                      <td>${escapeHtml(h.policial)}</td>
                      <td>${escapeHtml(h.armeiro)}</td>
                      <td>${escapeHtml(h.motivo)}</td>
                      <td>${escapeHtml(h.detalhes || '-')}</td>
                      <td><strong>${escapeHtml(h.status)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        ` : ''}

        ${safeSections.municoes ? `
          <div class="section-block">
            <div class="sec-title">3. MUNIÇÕES DA UNIDADE E HISTÓRICO COMPLETO DE MOVIMENTAÇÃO</div>
            <div class="sub-title">3A. Estoque Atual de Munições (${data.municoesEstoque.length} lotes)</div>
            ${data.municoesEstoque.length === 0 ? renderEmpty('Nenhum estoque de munição encontrado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Calibre</th>
                    <th>Quantidade</th>
                    <th>Fabricante</th>
                    <th>Tipo / Peso</th>
                    <th>Lote / Ano</th>
                    <th>Destinação</th>
                    <th>Cofre</th>
                    <th>Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.municoesEstoque.map(s => `
                    <tr>
                      <td class="mono"><strong>${escapeHtml(s.caliberName)}</strong></td>
                      <td class="mono"><strong>${s.quantity} un</strong></td>
                      <td>${escapeHtml(s.fabricante || '-')}</td>
                      <td>${escapeHtml(s.tipoMunicao || '-')} / ${escapeHtml(s.pesoMunicao || '-')}</td>
                      <td class="mono">${escapeHtml(s.loteMunicao || '-')} (${escapeHtml(s.anoFabricacao || '-')})</td>
                      <td>${escapeHtml(s.destinacao || '-')}</td>
                      <td class="mono">${escapeHtml(s.vaultCode)}</td>
                      <td>${escapeHtml(s.unitName)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">3B. Histórico Completo de Movimentações de Munição (${data.municaoHistorico.length})</div>
            ${data.municaoHistorico.length === 0 ? renderEmpty('Nenhuma movimentação de munição registrada.') : `
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Origem</th>
                    <th>Calibre</th>
                    <th>Qtd / Sobra</th>
                    <th>Cofre</th>
                    <th>Responsável / Vínculo</th>
                    <th>Armeiro</th>
                    <th>Motivo</th>
                    <th>Detalhes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.municaoHistorico.map(h => `
                    <tr>
                      <td class="mono">${escapeHtml(formatTimestamp(h.dataHora))}</td>
                      <td>${escapeHtml(h.origem)}</td>
                      <td class="mono"><strong>${escapeHtml(h.calibre)}</strong></td>
                      <td class="mono">${escapeHtml(h.quantidade)}<br/><span style="color:#047857;">Dev: ${escapeHtml(h.devolvido)}</span></td>
                      <td class="mono">${escapeHtml(h.cofre)}</td>
                      <td>${escapeHtml(h.responsavel)}<br/><span style="color:#475569;">${escapeHtml(h.vinculo)}</span></td>
                      <td>${escapeHtml(h.armeiro)}</td>
                      <td>${escapeHtml(h.motivo)}</td>
                      <td>${escapeHtml(h.detalhes || '-')}</td>
                      <td><strong>${escapeHtml(h.status)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        ` : ''}

        ${safeSections.materiais ? `
          <div class="section-block">
            <div class="sec-title">4. MATERIAIS DA UNIDADE E HISTÓRICO COMPLETO DE MOVIMENTAÇÕES</div>
            <div class="sub-title">4A. Inventário de Materiais (${data.materiais.length})</div>
            ${data.materiais.length === 0 ? renderEmpty('Nenhum material encontrado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Tipo</th>
                    <th>Nº Série / Patr.</th>
                    <th>Cofre</th>
                    <th>Estoque (Tot / Disp / Uso / Cons)</th>
                    <th>Cautelável</th>
                    <th>Validade</th>
                    <th>Unidade</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.materiais.map(m => `
                    <tr>
                      <td><strong>${escapeHtml(m.nome)}</strong></td>
                      <td>${escapeHtml(m.tipoMaterialNome)}</td>
                      <td class="mono">${escapeHtml(m.numeroSerie || '-')}</td>
                      <td class="mono">${escapeHtml(m.localGuarda || '-')}</td>
                      <td class="mono">T:${m.quantidade} | D:${m.quantidadeDisponivel} | U:${m.quantidadeEmUso} | C:${m.quantidadeConsumida}</td>
                      <td>${m.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}</td>
                      <td>${m.validade ? new Date(m.validade).toLocaleDateString('pt-BR') : 'Não perecível'}</td>
                      <td>${escapeHtml(m.unidadeNome || getUnitName(m.unidadeId))}</td>
                      <td>${escapeHtml(m.observacoes || '-')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">4B. Histórico Completo de Movimentações de Materiais (${data.materialHistorico.length})</div>
            ${data.materialHistorico.length === 0 ? renderEmpty('Nenhuma movimentação de material registrada.') : `
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Origem</th>
                    <th>Material</th>
                    <th>Qtd</th>
                    <th>Destinatário / Vínculo</th>
                    <th>Armaria</th>
                    <th>Motivo / Finalidade</th>
                    <th>Detalhes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.materialHistorico.map(h => `
                    <tr>
                      <td class="mono">${escapeHtml(formatTimestamp(h.dataHora))}</td>
                      <td>${escapeHtml(h.origem)}</td>
                      <td><strong>${escapeHtml(h.material)}</strong></td>
                      <td class="mono">${escapeHtml(h.quantidade)}</td>
                      <td>${escapeHtml(h.destinatario)}<br/><span style="color:#475569;">${escapeHtml(h.vinculo)}</span></td>
                      <td>${escapeHtml(h.armaria)}</td>
                      <td>${escapeHtml(h.motivo)}</td>
                      <td>${escapeHtml(h.detalhes)}</td>
                      <td><strong>${escapeHtml(h.status)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        ` : ''}

        ${safeSections.explosivos ? `
          <div class="section-block">
            <div class="sec-title">5. EXPLOSIVOS DA UNIDADE E HISTÓRICO COMPLETO DE MOVIMENTAÇÕES</div>
            <div class="sub-title">5A. Acervo de Explosivos (${data.explosivos.length})</div>
            ${data.explosivos.length === 0 ? renderEmpty('Nenhum explosivo encontrado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo / Subtipo</th>
                    <th>Quantidade</th>
                    <th>Lote</th>
                    <th>Fabricante</th>
                    <th>Classe Risco</th>
                    <th>Validade</th>
                    <th>Local / Paiol</th>
                    <th>Unidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.explosivos.map(e => `
                    <tr>
                      <td><strong>${escapeHtml(e.nome)}</strong></td>
                      <td>${escapeHtml(e.tipo)}${e.subtipo ? ` / ${escapeHtml(e.subtipo)}` : ''}</td>
                      <td class="mono"><strong>${e.quantidade} ${escapeHtml(e.unidadeMedida)}</strong></td>
                      <td class="mono">${escapeHtml(e.lote)}</td>
                      <td>${escapeHtml(e.fabricante)}</td>
                      <td class="mono">${escapeHtml(e.classeRisco)}</td>
                      <td>${e.dataValidade ? new Date(e.dataValidade).toLocaleDateString('pt-BR') : '-'}</td>
                      <td class="mono">${escapeHtml(e.localArmazenamento)}</td>
                      <td>${escapeHtml(getUnitName(e.unitId))}</td>
                      <td><strong>${escapeHtml(e.status)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">5B. Histórico Completo de Movimentações de Explosivos (${data.explosivoHistorico.length})</div>
            ${data.explosivoHistorico.length === 0 ? renderEmpty('Nenhuma movimentação de explosivos registrada.') : `
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Tipo / Origem</th>
                    <th>Explosivo</th>
                    <th>Quantidade</th>
                    <th>Responsável</th>
                    <th>Local / Destino</th>
                    <th>Motivo</th>
                    <th>Observações</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.explosivoHistorico.map(h => `
                    <tr>
                      <td class="mono">${escapeHtml(h.dataHora ? formatTimestamp(h.dataHora) : '-')}</td>
                      <td>${escapeHtml(h.origem)}</td>
                      <td><strong>${escapeHtml(h.explosivo)}</strong></td>
                      <td class="mono">${escapeHtml(h.quantidade)}</td>
                      <td>${escapeHtml(h.responsavel)}</td>
                      <td>${escapeHtml(h.local)}</td>
                      <td>${escapeHtml(h.motivo)}</td>
                      <td>${escapeHtml(h.detalhes)}</td>
                      <td><strong>${escapeHtml(h.status)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        ` : ''}

        ${safeSections.canil ? `
          <div class="section-block">
            <div class="sec-title">6. CANIL K9 (CANIS FÍSICOS, CÃES, FARMÁCIA E APLICAÇÕES)</div>
            <div class="sub-title">6A. Canis Físicos & Baias (${data.canisFisicos.length})</div>
            ${data.canisFisicos.length === 0 ? renderEmpty('Nenhum canil físico encontrado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Identificação</th>
                    <th>Ocupação / Capacidade</th>
                    <th>Localização</th>
                    <th>Unidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.canisFisicos.map(k => `
                    <tr>
                      <td><strong>${escapeHtml(k.nome)}</strong></td>
                      <td class="mono">${escapeHtml(k.identificacao || '-')}</td>
                      <td class="mono">${k.dogsCount} / ${k.capacidade}</td>
                      <td>${escapeHtml(k.localizacao || '-')}</td>
                      <td>${escapeHtml(k.unitName)}</td>
                      <td><strong>${escapeHtml(k.status)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">6B. Cães Policiais K9 (${data.cachorrosCanil.length})</div>
            ${data.cachorrosCanil.length === 0 ? renderEmpty('Nenhum cão K9 encontrado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Raça / Sexo</th>
                    <th>Microchip</th>
                    <th>Especialidade</th>
                    <th>Baia / Canil</th>
                    <th>Condutor / Responsável</th>
                    <th>Unidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.cachorrosCanil.map(d => {
                    const condutor =
                      d.tipoVinculo === 'SISTEMA'
                        ? `${d.usuarioInternoNome || '-'} (MASP: ${d.usuarioInternoMasp || '-'})`
                        : `${d.responsavelExternoNome || '-'} (${d.responsavelExternoOrgao || 'Externo'})`;
                    return `
                      <tr>
                        <td><strong>${escapeHtml(d.nome)}</strong></td>
                        <td>${escapeHtml(d.raca)} (${escapeHtml(d.sexo)})</td>
                        <td class="mono">${escapeHtml(d.microchip || '-')}</td>
                        <td>${escapeHtml(d.especialidade || '-')}</td>
                        <td>${escapeHtml(d.canilNome)}</td>
                        <td>${escapeHtml(condutor)}</td>
                        <td>${escapeHtml(d.unitName)}</td>
                        <td><strong>${escapeHtml(d.status)}</strong></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">6C. Farmácia Veterinária, Medicamentos & Rações (${data.produtosCanil.length})</div>
            ${data.produtosCanil.length === 0 ? renderEmpty('Nenhum produto veterinário encontrado.') : `
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Tipo / Forma</th>
                    <th>Fabricante / Lote</th>
                    <th>Validade</th>
                    <th>Estoque (Atual / Mín.)</th>
                    <th>Valor Unit.</th>
                    <th>Local de Guarda</th>
                    <th>Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.produtosCanil.map(p => `
                    <tr>
                      <td><strong>${escapeHtml(p.nome)}</strong></td>
                      <td>${escapeHtml(p.tipo)}${p.formaFarmaceutica ? ` / ${escapeHtml(p.formaFarmaceutica)}` : ''}</td>
                      <td>${escapeHtml(p.fabricante || '-')} ${p.lote ? `(Lote: ${escapeHtml(p.lote)})` : ''}</td>
                      <td>${p.temValidade && p.dataValidade ? new Date(p.dataValidade).toLocaleDateString('pt-BR') : 'Sem validade'}</td>
                      <td class="mono"><strong>${p.quantidadeEstoque} ${escapeHtml(p.unidadeMedida)}</strong> (Mín: ${p.quantidadeMinima})</td>
                      <td class="mono">R$ ${Number(p.valorUnitario || 0).toFixed(2)}</td>
                      <td>${escapeHtml(p.localGuarda || '-')}</td>
                      <td>${escapeHtml(p.unitName)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}

            <div class="sub-title">6D. Histórico de Aplicações & Movimentações Veterinárias (${data.movimentacoesCanil.length})</div>
            ${data.movimentacoesCanil.length === 0 ? renderEmpty('Nenhuma movimentação veterinária registrada.') : `
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Tipo</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Cão K9</th>
                    <th>Dosagem / Frequência</th>
                    <th>Aplicador / Condutor</th>
                    <th>Motivo / Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.movimentacoesCanil.map(m => `
                    <tr>
                      <td class="mono">${escapeHtml(m.dataHora ? formatTimestamp(m.dataHora) : '-')}</td>
                      <td>${escapeHtml(m.tipoMovimentacao)}</td>
                      <td><strong>${escapeHtml(m.produtoNome)}</strong></td>
                      <td class="mono">${m.quantidade} ${escapeHtml(m.unidadeMedida)}</td>
                      <td>${escapeHtml(m.cachorroNome || '-')}${m.cachorroMicrochip ? ` (${escapeHtml(m.cachorroMicrochip)})` : ''}</td>
                      <td>${escapeHtml([m.dosagemAplicada, m.frequenciaAdministrada].filter(Boolean).join(' • ') || '-')}</td>
                      <td>${escapeHtml(m.responsavelAplicacaoNome || '-')}${m.condutorNome ? `<br/><span style="color:#475569;">Cond: ${escapeHtml(m.condutorNome)}</span>` : ''}</td>
                      <td>${escapeHtml(m.motivo || '-')}${m.observacoes ? ` — ${escapeHtml(m.observacoes)}` : ''}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        ` : ''}

        <div class="signatures">
          <div class="sig-line">
            ${escapeHtml(currentUser.name)} (MASP: ${escapeHtml(currentUser.masp)})<br/>
            <span style="font-weight:normal; font-size:8.5px; color:#475569;">Responsável pela Emissão • Perfil: ${escapeHtml(effectiveRole)}</span>
          </div>
        </div>

        <div class="footer">
          Documento extraído do Sistema de Armeria da Polícia Civil do Estado de Minas Gerais em ${new Date().toLocaleString('pt-BR')}.
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  const handleConfirmActionModal = (e: React.FormEvent) => {
    e.preventDefault();
    const applyFilters = modalScopeMode === 'FILTERED';
    if (actionModalMode === 'PRINT') {
      executePrintReport(modalUnitId, applyFilters, modalSections);
    } else if (actionModalMode === 'CSV') {
      executeExportCSV(modalUnitId, applyFilters, modalSections);
    }
    setActionModalMode(null);
  };

  const tabsConfig = useMemo(() => {
    const allTabs: { id: ReportTab; label: string; icon: React.ReactNode; visible: boolean }[] = [
      {
        id: 'TODOS',
        label: 'Relatório Geral (Completo)',
        icon: <FileText className="w-4 h-4" />,
        visible: !isExplosivistaRole && !isCanilOnly
      },
      {
        id: 'COFRES',
        label: isExplosivistaRole
          ? `Cofres de Explosivos (${screenData.cofres.length})`
          : `Cofres (${screenData.cofres.length})`,
        icon: <Vault className="w-4 h-4" />,
        visible: !isCanilOnly
      },
      {
        id: 'ARMAS',
        label: `Armas (${screenData.armas.length} / ${screenData.armaHistorico.length})`,
        icon: <Crosshair className="w-4 h-4" />,
        visible: !isExplosivistaRole && !isCanilOnly
      },
      {
        id: 'MUNICIONAL',
        label: `Munições (${screenData.municoesEstoque.length} / ${screenData.municaoHistorico.length})`,
        icon: <Disc className="w-4 h-4" />,
        visible: !isExplosivistaRole && !isCanilOnly
      },
      {
        id: 'MATERIAIS',
        label: `Materiais (${screenData.materiais.length} / ${screenData.materialHistorico.length})`,
        icon: <Package className="w-4 h-4" />,
        visible: !isExplosivistaRole && !isCanilOnly
      },
      {
        id: 'EXPLOSIVOS',
        label: `Explosivos (${screenData.explosivos.length} / ${screenData.explosivoHistorico.length})`,
        icon: <Flame className="w-4 h-4" />,
        visible: !isCanilOnly
      },
      {
        id: 'CANIL',
        label: `Canil (${screenData.cachorrosCanil.length} / ${screenData.movimentacoesCanil.length})`,
        icon: <Dog className="w-4 h-4" />,
        visible: hasCanilAccess
      }
    ];
    return allTabs.filter(t => t.visible);
  }, [
    isExplosivistaRole,
    isCanilOnly,
    hasCanilAccess,
    screenData.cofres.length,
    screenData.armas.length,
    screenData.armaHistorico.length,
    screenData.municoesEstoque.length,
    screenData.municaoHistorico.length,
    screenData.materiais.length,
    screenData.materialHistorico.length,
    screenData.explosivos.length,
    screenData.explosivoHistorico.length,
    screenData.cachorrosCanil.length,
    screenData.movimentacoesCanil.length
  ]);

  useEffect(() => {
    const allowedIds = tabsConfig.map(t => t.id);
    if (allowedIds.length > 0 && !allowedIds.includes(activeTab)) {
      setActiveTab(allowedIds[0]);
    }
  }, [tabsConfig, activeTab]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Relatórios Gerenciais e Operacionais</h1>
            <p className="text-xs text-slate-400">
              {isCanilOnly
                ? 'Canis físicos, cães K9, farmácia veterinária, rações e histórico completo de aplicações do Canil'
                : isExplosivistaRole
                ? 'Cofres de explosivos, acervo de explosivos e histórico completo de movimentações por unidade'
                : 'Cofres, armas, munições, materiais, explosivos e histórico completo de movimentações por unidade'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => openActionModal('CSV')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => openActionModal('PRINT')}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl print:hidden">
        {tabsConfig.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 ${
              activeTab === t.id
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 print:hidden">
        <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Filter className="w-4 h-4" />
          <span>Filtros do Relatório (Unidade, Departamento, Cofre, Calibre, Período, Usuário e Motivo)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          {/* Dept Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Departamento</label>
            <select
              value={selectedDept}
              disabled={!isGeral}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setSelectedUnit('ALL');
                setSelectedVaultSpace('ALL');
              }}
              className={`w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 ${
                !isGeral ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {isGeral && <option value="ALL">Todos os Departamentos</option>}
              {allowedDepartments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Unit Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Unidade</label>
            <select
              value={selectedUnit}
              disabled={isUnitOnly}
              onChange={(e) => {
                setSelectedUnit(e.target.value);
                setSelectedVaultSpace('ALL');
              }}
              className={`w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 ${
                isUnitOnly ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {!isUnitOnly && <option value="ALL">Todas as Unidades</option>}
              {allowedUnits.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Vault Space Filter */}
          {!isCanilOnly && (
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                {isExplosivistaRole ? 'Cofre de Explosivos' : 'Cofre / Espaço'}
              </label>
              <select
                value={selectedVaultSpace}
                onChange={(e) => setSelectedVaultSpace(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
              >
                <option value="ALL">
                  {isExplosivistaRole ? 'Todos os Cofres de Explosivos' : 'Todos os Espaços do Cofre'}
                </option>
                {visibleVaultsForDropdown.map(v => (
                  <option key={v.id} value={v.id}>{v.code} ({v.type})</option>
                ))}
              </select>
            </div>
          )}

          {/* Start Date */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
            />
          </div>

          {/* Caliber Filter */}
          {!isCanilOnly && !isExplosivistaRole && (
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Calibre</label>
              <select
                value={selectedCaliber}
                onChange={(e) => setSelectedCaliber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
              >
                <option value="ALL">Todos os Calibres</option>
                {calibers.map(c => (
                  <option key={c.id} value={c.id}>{formatCaliberDisplay(c)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Destinatário Scope Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Destinatário (Vínculo)</label>
            <select
              value={recipientScope}
              onChange={(e) => setRecipientScope(e.target.value as 'ALL' | 'SISTEMA' | 'FORA_DO_SISTEMA')}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos (Sistema e Fora do Sistema)</option>
              <option value="SISTEMA">Apenas Cadastrados no Sistema</option>
              <option value="FORA_DO_SISTEMA">Apenas Fora do Sistema</option>
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Policial / Usuário</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Policiais</option>
              {allUsersList.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.masp})</option>
              ))}
            </select>
          </div>

          {/* Reason Filter */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Motivo / Finalidade</label>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
            >
              <option value="ALL">Todos os Motivos</option>
              <option value="Curso">Curso ou Teste</option>
              <option value="Treinamento">Treinamento</option>
              <option value="Substituição">Substituição</option>
              <option value="Abastecimento">Abastecimento do Cofre</option>
              <option value="Operacional">Operacional / Diligência</option>
              <option value="Transferência">Transferência</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedUser('ALL');
                setSelectedCaliber('ALL');
                setSelectedVaultSpace('ALL');
                if (isGeral) setSelectedDept('ALL');
                if (!isUnitOnly) setSelectedUnit('ALL');
                setRecipientScope('ALL');
                setReasonFilter('ALL');
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Report Content Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-8">
        {/* Official Header Preview */}
        <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100 font-mono uppercase">
              POLÍCIA CIVIL • ESTADO DE MINAS GERAIS
            </h2>
            <p className="text-xs text-amber-400 font-semibold font-mono">
              {isCanilOnly
                ? 'RELATÓRIO INTEGRADO DO CANIL: CANIS FÍSICOS, CÃES K9, FARMÁCIA E HISTÓRICO DE APLICAÇÕES'
                : isExplosivistaRole
                ? 'RELATÓRIO INTEGRADO: COFRES DE EXPLOSIVOS, EXPLOSIVOS E HISTÓRICO DE MOVIMENTAÇÕES'
                : 'RELATÓRIO INTEGRADO: COFRES, ARMAS, MUNIÇÕES, MATERIAIS, EXPLOSIVOS E HISTÓRICO DE MOVIMENTAÇÕES'}
            </p>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-400 font-mono">
            <p>Emissor: <strong className="text-slate-200">{currentUser.name}</strong></p>
            <p>
              Unidade: <strong className="text-amber-400">{selectedUnit === 'ALL' ? (isUnitOnly ? getUnitName(currentUser.unitId) : 'Todas do Escopo') : getUnitName(selectedUnit)}</strong>
            </p>
            <p>{formatTimestamp(new Date().toISOString())}</p>
          </div>
        </div>

        {/* SECTION 1: COFRES */}
        {!isCanilOnly && (activeTab === 'COFRES' || activeTab === 'TODOS') && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <Vault className="w-4 h-4" />
              <span>
                1. {isExplosivistaRole ? 'Cofres de Explosivos da Unidade' : 'Cofres da Unidade'} ({screenData.cofres.length})
              </span>
            </h3>
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Descrição Curta</th>
                    <th className="py-2.5 px-3">Unidade</th>
                    <th className="py-2.5 px-3">Departamento</th>
                    {!isExplosivistaRole && (
                      <>
                        <th className="py-2.5 px-3 text-center">Armas</th>
                        <th className="py-2.5 px-3 text-center">Munições</th>
                        <th className="py-2.5 px-3 text-center">Materiais</th>
                      </>
                    )}
                    <th className="py-2.5 px-3 text-center">Explosivos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.cofres.length === 0 ? (
                    <tr>
                      <td colSpan={isExplosivistaRole ? 6 : 9} className="py-4 text-center text-slate-500 italic">
                        Nenhum cofre encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    screenData.cofres.map(v => (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{v.code}</td>
                        <td className="py-2.5 px-3 font-semibold">{v.type}</td>
                        <td className="py-2.5 px-3 text-slate-400">{v.descricaoCurta || '-'}</td>
                        <td className="py-2.5 px-3">{v.unitName}</td>
                        <td className="py-2.5 px-3">{v.deptName}</td>
                        {!isExplosivistaRole && (
                          <>
                            <td className="py-2.5 px-3 text-center font-mono">{v.armasCount}</td>
                            <td className="py-2.5 px-3 text-center font-mono">{v.municoesCount} un</td>
                            <td className="py-2.5 px-3 text-center font-mono">{v.materiaisCount} un</td>
                          </>
                        )}
                        <td className="py-2.5 px-3 text-center font-mono">{v.explosivosCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 2: ARMAS + HISTÓRICO */}
        {!isExplosivistaRole && !isCanilOnly && (activeTab === 'ARMAS' || activeTab === 'TODOS') && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <Crosshair className="w-4 h-4" />
              <span>2. Armas da Unidade ({screenData.armas.length}) e Histórico de Movimentação ({screenData.armaHistorico.length})</span>
            </h3>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Armamento</th>
                    <th className="py-2 px-3">Série</th>
                    <th className="py-2 px-3">Calibre</th>
                    <th className="py-2 px-3">Carreg. / Disparos</th>
                    <th className="py-2 px-3">Cofre</th>
                    <th className="py-2 px-3">Unidade</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.armas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhuma arma cadastrada no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.armas.map(w => (
                      <tr key={w.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-100">{w.type} {w.model} <span className="text-slate-400 font-normal">({w.manufacturer})</span></td>
                        <td className="py-2 px-3 font-mono text-amber-400">{w.serialNumber}</td>
                        <td className="py-2 px-3 font-mono">{w.caliber}</td>
                        <td className="py-2 px-3 font-mono">{w.magazineQuantity || 0} carreg. | {w.shotCount || 0} tiros</td>
                        <td className="py-2 px-3 font-mono">{getVaultById(w.vaultSpaceId)?.code || '-'}</td>
                        <td className="py-2 px-3">{getUnitName(w.unitId)}</td>
                        <td className="py-2 px-3 font-bold">{w.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800">
                Histórico Completo de Movimentações de Armamento ({screenData.armaHistorico.length})
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Origem</th>
                    <th className="py-2 px-3">Arma / Série</th>
                    <th className="py-2 px-3">Policial / Portador</th>
                    <th className="py-2 px-3">Armeiro</th>
                    <th className="py-2 px-3">Motivo / Detalhes</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.armaHistorico.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhuma movimentação de armamento encontrada.
                      </td>
                    </tr>
                  ) : (
                    screenData.armaHistorico.map(h => (
                      <tr key={h.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{formatTimestamp(h.dataHora)}</td>
                        <td className="py-2 px-3 font-semibold text-sky-300">{h.origem}</td>
                        <td className="py-2 px-3">
                          <span className="font-bold block text-slate-100">{h.arma}</span>
                          <span className="text-[10px] font-mono text-amber-400">{h.serie} • {h.calibre}</span>
                        </td>
                        <td className="py-2 px-3">{h.policial}</td>
                        <td className="py-2 px-3 text-slate-400">{h.armeiro}</td>
                        <td className="py-2 px-3 max-w-xs">
                          <span className="block font-medium text-slate-200">{h.motivo}</span>
                          {h.detalhes && <span className="text-[10px] text-slate-400 block">{h.detalhes}</span>}
                        </td>
                        <td className="py-2 px-3 font-bold">{h.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 3: MUNIÇÕES + HISTÓRICO */}
        {!isExplosivistaRole && !isCanilOnly && (activeTab === 'MUNICIONAL' || activeTab === 'TODOS') && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <Disc className="w-4 h-4" />
              <span>3. Munições da Unidade ({screenData.municoesEstoque.length} lotes) e Histórico de Movimentação ({screenData.municaoHistorico.length})</span>
            </h3>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Calibre</th>
                    <th className="py-2 px-3">Qtd Atual</th>
                    <th className="py-2 px-3">Fabricante / Tipo / Peso</th>
                    <th className="py-2 px-3">Lote / Ano</th>
                    <th className="py-2 px-3">Destinação</th>
                    <th className="py-2 px-3">Cofre</th>
                    <th className="py-2 px-3">Unidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.municoesEstoque.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhum lote de munição encontrado no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.municoesEstoque.map(s => (
                      <tr key={s.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono font-bold text-amber-400">{s.caliberName}</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400">{s.quantity} un</td>
                        <td className="py-2 px-3">{s.fabricante || '-'} • {s.tipoMunicao || '-'} • {s.pesoMunicao || '-'}</td>
                        <td className="py-2 px-3 font-mono">{s.loteMunicao || '-'} ({s.anoFabricacao || '-'})</td>
                        <td className="py-2 px-3">{s.destinacao || '-'}</td>
                        <td className="py-2 px-3 font-mono">{s.vaultCode}</td>
                        <td className="py-2 px-3">{s.unitName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800">
                Histórico Completo de Movimentações de Munições ({screenData.municaoHistorico.length})
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Origem</th>
                    <th className="py-2 px-3">Calibre</th>
                    <th className="py-2 px-3">Qtd / Sobra</th>
                    <th className="py-2 px-3">Cofre</th>
                    <th className="py-2 px-3">Responsável</th>
                    <th className="py-2 px-3">Motivo / Detalhes</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.municaoHistorico.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500 italic">
                        Nenhuma movimentação de munição encontrada.
                      </td>
                    </tr>
                  ) : (
                    screenData.municaoHistorico.map(h => (
                      <tr key={h.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{formatTimestamp(h.dataHora)}</td>
                        <td className="py-2 px-3 font-semibold text-sky-300">{h.origem}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-400">{h.calibre}</td>
                        <td className="py-2 px-3 font-mono">
                          <span className="font-bold block">{h.quantidade}</span>
                          <span className="text-[10px] text-emerald-400">Dev: {h.devolvido}</span>
                        </td>
                        <td className="py-2 px-3 font-mono">{h.cofre}</td>
                        <td className="py-2 px-3">
                          <span className="block">{h.responsavel}</span>
                          <span className="text-[10px] text-slate-400">{h.vinculo}</span>
                        </td>
                        <td className="py-2 px-3 max-w-xs">
                          <span className="block font-medium text-slate-200">{h.motivo}</span>
                          {h.detalhes && <span className="text-[10px] text-slate-400 block">{h.detalhes}</span>}
                        </td>
                        <td className="py-2 px-3 font-bold">{h.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 4: MATERIAIS + HISTÓRICO */}
        {!isExplosivistaRole && !isCanilOnly && (activeTab === 'MATERIAIS' || activeTab === 'TODOS') && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <Package className="w-4 h-4" />
              <span>4. Materiais da Unidade ({screenData.materiais.length}) e Histórico de Movimentações ({screenData.materialHistorico.length})</span>
            </h3>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Material</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Série / Patr.</th>
                    <th className="py-2 px-3">Cofre</th>
                    <th className="py-2 px-3">Estoque (T / D / U / C)</th>
                    <th className="py-2 px-3">Cautelável</th>
                    <th className="py-2 px-3">Unidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.materiais.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhum material encontrado no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.materiais.map(m => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-100">{m.nome}</td>
                        <td className="py-2 px-3">{m.tipoMaterialNome}</td>
                        <td className="py-2 px-3 font-mono">{m.numeroSerie || '-'}</td>
                        <td className="py-2 px-3 font-mono text-emerald-300">{m.localGuarda || '-'}</td>
                        <td className="py-2 px-3 font-mono">
                          T:{m.quantidade} | D:<strong className="text-emerald-400">{m.quantidadeDisponivel}</strong> | U:{m.quantidadeEmUso} | C:{m.quantidadeConsumida}
                        </td>
                        <td className="py-2 px-3 font-bold">{m.passivoDepositoPoliciais !== false ? 'SIM' : 'NÃO'}</td>
                        <td className="py-2 px-3">{m.unidadeNome || getUnitName(m.unidadeId)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800">
                Histórico Completo de Movimentações de Materiais ({screenData.materialHistorico.length})
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Origem</th>
                    <th className="py-2 px-3">Material</th>
                    <th className="py-2 px-3">Qtd</th>
                    <th className="py-2 px-3">Destinatário / Vínculo</th>
                    <th className="py-2 px-3">Motivo / Detalhes</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.materialHistorico.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhuma movimentação de material registrada.
                      </td>
                    </tr>
                  ) : (
                    screenData.materialHistorico.map(h => (
                      <tr key={h.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{formatTimestamp(h.dataHora)}</td>
                        <td className="py-2 px-3 font-semibold text-sky-300">{h.origem}</td>
                        <td className="py-2 px-3 font-bold text-slate-100">{h.material}</td>
                        <td className="py-2 px-3 font-mono">{h.quantidade}</td>
                        <td className="py-2 px-3">
                          <span className="block">{h.destinatario}</span>
                          <span className="text-[10px] text-slate-400">{h.vinculo}</span>
                        </td>
                        <td className="py-2 px-3 max-w-xs">
                          <span className="block font-medium text-slate-200">{h.motivo}</span>
                          {h.detalhes && <span className="text-[10px] text-slate-400 block">{h.detalhes}</span>}
                        </td>
                        <td className="py-2 px-3 font-bold">{h.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 5: EXPLOSIVOS + HISTÓRICO */}
        {!isCanilOnly && (activeTab === 'EXPLOSIVOS' || activeTab === 'TODOS') && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <Flame className="w-4 h-4" />
              <span>5. Explosivos da Unidade ({screenData.explosivos.length}) e Histórico de Movimentações ({screenData.explosivoHistorico.length})</span>
            </h3>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Explosivo</th>
                    <th className="py-2 px-3">Tipo / Subtipo</th>
                    <th className="py-2 px-3">Quantidade</th>
                    <th className="py-2 px-3">Lote / Risco</th>
                    <th className="py-2 px-3">Paiol / Cofre</th>
                    <th className="py-2 px-3">Unidade</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.explosivos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhum explosivo encontrado no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.explosivos.map(e => (
                      <tr key={e.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-100">{e.nome}</td>
                        <td className="py-2 px-3">{e.tipo}{e.subtipo ? ` / ${e.subtipo}` : ''}</td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-400">{e.quantidade} {e.unidadeMedida}</td>
                        <td className="py-2 px-3 font-mono">{e.lote} ({e.classeRisco})</td>
                        <td className="py-2 px-3 font-mono">{e.localArmazenamento}</td>
                        <td className="py-2 px-3">{getUnitName(e.unitId)}</td>
                        <td className="py-2 px-3 font-bold">{e.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800">
                Histórico Completo de Movimentações de Explosivos ({screenData.explosivoHistorico.length})
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Origem / Tipo</th>
                    <th className="py-2 px-3">Explosivo</th>
                    <th className="py-2 px-3">Quantidade</th>
                    <th className="py-2 px-3">Responsável</th>
                    <th className="py-2 px-3">Local / Motivo</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.explosivoHistorico.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                        Nenhuma movimentação de explosivos registrada.
                      </td>
                    </tr>
                  ) : (
                    screenData.explosivoHistorico.map(h => (
                      <tr key={h.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{h.dataHora ? formatTimestamp(h.dataHora) : '-'}</td>
                        <td className="py-2 px-3 font-semibold text-sky-300">{h.origem}</td>
                        <td className="py-2 px-3 font-bold text-slate-100">{h.explosivo}</td>
                        <td className="py-2 px-3 font-mono">{h.quantidade}</td>
                        <td className="py-2 px-3">{h.responsavel}</td>
                        <td className="py-2 px-3 max-w-xs">
                          <span className="block font-medium text-slate-200">{h.local}</span>
                          <span className="text-[10px] text-slate-400 block">{h.motivo}{h.detalhes && h.detalhes !== '-' ? ` — ${h.detalhes}` : ''}</span>
                        </td>
                        <td className="py-2 px-3 font-bold">{h.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 6: CANIL */}
        {hasCanilAccess && (activeTab === 'CANIL' || activeTab === 'TODOS') && (
          <div className="space-y-5 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center space-x-1.5">
              <Dog className="w-4 h-4" />
              <span>6. Canil K9 — Canis Físicos ({screenData.canisFisicos.length}), Cães ({screenData.cachorrosCanil.length}), Farmácia ({screenData.produtosCanil.length}) e Aplicações ({screenData.movimentacoesCanil.length})</span>
            </h3>

            {/* Resumo Canil */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-sans block">Canis / Baias</span>
                <strong className="text-base text-slate-100">{screenData.canisFisicos.length}</strong>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-sans block">Cães K9</span>
                <strong className="text-base text-amber-400">{screenData.cachorrosCanil.length}</strong>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-sans block">Itens Farmácia / Ração</span>
                <strong className="text-base text-cyan-400">{screenData.produtosCanil.length}</strong>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-sans block">Aplicações / Mov.</span>
                <strong className="text-base text-emerald-400">{screenData.movimentacoesCanil.length}</strong>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 uppercase font-sans block">Valor em Estoque</span>
                <strong className="text-base text-purple-400">R$ {screenData.canilTotalValorEstoque.toFixed(2)}</strong>
              </div>
            </div>

            {/* 6A. Canis Físicos */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 flex items-center space-x-1.5">
                <Building className="w-3.5 h-3.5 text-amber-400" />
                <span>6A. Canis Físicos & Baias ({screenData.canisFisicos.length})</span>
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">Identificação</th>
                    <th className="py-2 px-3">Ocupação</th>
                    <th className="py-2 px-3">Localização</th>
                    <th className="py-2 px-3">Unidade</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.canisFisicos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500 italic">
                        Nenhum canil físico encontrado no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.canisFisicos.map(k => (
                      <tr key={k.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-100">{k.nome}</td>
                        <td className="py-2 px-3 font-mono text-amber-400">{k.identificacao || '-'}</td>
                        <td className="py-2 px-3 font-mono">{k.dogsCount} / {k.capacidade}</td>
                        <td className="py-2 px-3 text-slate-400">{k.localizacao || '-'}</td>
                        <td className="py-2 px-3">{k.unitName}</td>
                        <td className="py-2 px-3 font-bold">{k.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 6B. Cães K9 */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 flex items-center space-x-1.5">
                <Dog className="w-3.5 h-3.5 text-amber-400" />
                <span>6B. Cães Policiais K9 ({screenData.cachorrosCanil.length})</span>
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">Raça / Sexo</th>
                    <th className="py-2 px-3">Microchip</th>
                    <th className="py-2 px-3">Especialidade</th>
                    <th className="py-2 px-3">Baia / Canil</th>
                    <th className="py-2 px-3">Condutor / Responsável</th>
                    <th className="py-2 px-3">Unidade</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.cachorrosCanil.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500 italic">
                        Nenhum cão K9 encontrado no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.cachorrosCanil.map(d => (
                      <tr key={d.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-100">{d.nome}</td>
                        <td className="py-2 px-3">{d.raca} ({d.sexo})</td>
                        <td className="py-2 px-3 font-mono text-amber-400">{d.microchip || '-'}</td>
                        <td className="py-2 px-3">{d.especialidade || '-'}</td>
                        <td className="py-2 px-3">{d.canilNome}</td>
                        <td className="py-2 px-3">
                          {d.tipoVinculo === 'SISTEMA'
                            ? `${d.usuarioInternoNome || '-'} (MASP: ${d.usuarioInternoMasp || '-'})`
                            : `${d.responsavelExternoNome || '-'} (${d.responsavelExternoOrgao || 'Externo'})`}
                        </td>
                        <td className="py-2 px-3">{d.unitName}</td>
                        <td className="py-2 px-3 font-bold">{d.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 6C. Farmácia Veterinária & Rações */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 flex items-center space-x-1.5">
                <Pill className="w-3.5 h-3.5 text-emerald-400" />
                <span>6C. Farmácia Veterinária, Medicamentos & Rações ({screenData.produtosCanil.length})</span>
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Produto</th>
                    <th className="py-2 px-3">Tipo / Forma</th>
                    <th className="py-2 px-3">Fabricante / Lote</th>
                    <th className="py-2 px-3">Validade</th>
                    <th className="py-2 px-3">Estoque (Atual / Mín.)</th>
                    <th className="py-2 px-3">Valor Unit.</th>
                    <th className="py-2 px-3">Local de Guarda</th>
                    <th className="py-2 px-3">Unidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.produtosCanil.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500 italic">
                        Nenhum produto veterinário encontrado no escopo selecionado.
                      </td>
                    </tr>
                  ) : (
                    screenData.produtosCanil.map(p => (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-bold text-slate-100">{p.nome}</td>
                        <td className="py-2 px-3">{p.tipo}{p.formaFarmaceutica ? ` • ${p.formaFarmaceutica}` : ''}</td>
                        <td className="py-2 px-3">{p.fabricante || '-'} {p.lote ? `(Lote: ${p.lote})` : ''}</td>
                        <td className="py-2 px-3 font-mono">{p.temValidade && p.dataValidade ? new Date(p.dataValidade).toLocaleDateString('pt-BR') : 'Sem validade'}</td>
                        <td className="py-2 px-3 font-mono">
                          <strong className={p.quantidadeEstoque <= p.quantidadeMinima ? 'text-red-400' : 'text-emerald-400'}>
                            {p.quantidadeEstoque} {p.unidadeMedida}
                          </strong>{' '}
                          <span className="text-slate-500">(Mín: {p.quantidadeMinima})</span>
                        </td>
                        <td className="py-2 px-3 font-mono">R$ {Number(p.valorUnitario || 0).toFixed(2)}</td>
                        <td className="py-2 px-3">{p.localGuarda || '-'}</td>
                        <td className="py-2 px-3">{p.unitName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 6D. Histórico de Aplicações & Movimentações */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <div className="bg-slate-950/70 px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 flex items-center space-x-1.5">
                <Syringe className="w-3.5 h-3.5 text-cyan-400" />
                <span>6D. Histórico de Aplicações & Movimentações Veterinárias ({screenData.movimentacoesCanil.length})</span>
              </div>
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Produto</th>
                    <th className="py-2 px-3">Quantidade</th>
                    <th className="py-2 px-3">Cão K9</th>
                    <th className="py-2 px-3">Dosagem / Frequência</th>
                    <th className="py-2 px-3">Aplicador / Condutor</th>
                    <th className="py-2 px-3">Motivo / Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {screenData.movimentacoesCanil.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500 italic">
                        Nenhuma movimentação veterinária registrada.
                      </td>
                    </tr>
                  ) : (
                    screenData.movimentacoesCanil.map(m => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{m.dataHora ? formatTimestamp(m.dataHora) : '-'}</td>
                        <td className="py-2 px-3 font-semibold text-sky-300">{m.tipoMovimentacao}</td>
                        <td className="py-2 px-3 font-bold text-slate-100">{m.produtoNome}</td>
                        <td className="py-2 px-3 font-mono">{m.quantidade} {m.unidadeMedida}</td>
                        <td className="py-2 px-3">
                          <span className="block font-semibold text-amber-300">{m.cachorroNome || '-'}</span>
                          {m.cachorroMicrochip && <span className="text-[10px] font-mono text-slate-400">{m.cachorroMicrochip}</span>}
                        </td>
                        <td className="py-2 px-3">{[m.dosagemAplicada, m.frequenciaAdministrada].filter(Boolean).join(' • ') || '-'}</td>
                        <td className="py-2 px-3">
                          <span className="block">{m.responsavelAplicacaoNome || '-'}</span>
                          {m.condutorNome && <span className="text-[10px] text-slate-400">Cond: {m.condutorNome}</span>}
                        </td>
                        <td className="py-2 px-3 max-w-xs">
                          <span className="block font-medium text-slate-200">{m.motivo || '-'}</span>
                          {m.observacoes && <span className="text-[10px] text-slate-400 block">{m.observacoes}</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between font-mono">
          <span>Relatório gerado em conformidade com o Nível de Acesso: <strong>{effectiveRole}</strong></span>
          <span>Armeria PCMG v2.0</span>
        </div>
      </div>

      {/* UNIFIED MODAL FOR PRINT & CSV EXPORT */}
      {actionModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl border border-amber-500/30">
                  {actionModalMode === 'PRINT' ? (
                    <Printer className="w-5 h-5" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {actionModalMode === 'PRINT'
                      ? 'Imprimir Relatório da Unidade'
                      : 'Exportar Relatório em CSV'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Escolha a unidade específica ou toda a unidade para gerar o documento
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActionModalMode(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmActionModal} className="p-6 space-y-4 text-xs sm:text-sm">
              {/* Unit selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span>Unidade do Relatório</span>
                </label>
                <select
                  value={modalUnitId}
                  disabled={isUnitOnly}
                  onChange={(e) => setModalUnitId(e.target.value)}
                  className={`w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500 ${
                    isUnitOnly ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {!isUnitOnly && (
                    <option value="ALL">
                      Todas as Unidades ({selectedDept !== 'ALL' ? getDeptName(selectedDept) : 'Escopo Permitido'})
                    </option>
                  )}
                  {allowedUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      Toda a Unidade: {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scope mode: Full Unit vs Filtered */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  Abrangência das Informações
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setModalScopeMode('FULL_UNIT');
                      setModalSections(getDefaultSectionsForRole());
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      modalScopeMode === 'FULL_UNIT'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <strong className="block text-xs text-slate-100">Relatório Completo da Unidade</strong>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Todos os dados sem restrição de datas ou calibre.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalScopeMode('FILTERED')}
                    className={`p-3 rounded-xl border text-left transition ${
                      modalScopeMode === 'FILTERED'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <strong className="block text-xs text-slate-100">Usar Filtros da Tela</strong>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Aplica período, cofre, calibre, usuário e motivo ativos.
                    </span>
                  </button>
                </div>
              </div>

              {/* Sections included */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-semibold">
                    Blocos Incluídos no Relatório
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalSections(getDefaultSectionsForRole())}
                    className="text-[11px] text-amber-400 hover:underline font-semibold"
                  >
                    Selecionar Todos
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  {[
                    {
                      key: 'cofres',
                      label: isExplosivistaRole ? '1. Cofres de Explosivos da unidade' : '1. Cofres da unidade',
                      visible: !isCanilOnly
                    },
                    {
                      key: 'armas',
                      label: '2. Armas da unidade + todo histórico de movimentação',
                      visible: !isExplosivistaRole && !isCanilOnly
                    },
                    {
                      key: 'municoes',
                      label: '3. Munições da unidade + todo histórico de movimentação',
                      visible: !isExplosivistaRole && !isCanilOnly
                    },
                    {
                      key: 'materiais',
                      label: '4. Materiais da unidade + todo histórico de movimentações',
                      visible: !isExplosivistaRole && !isCanilOnly
                    },
                    {
                      key: 'explosivos',
                      label: isExplosivistaRole
                        ? '2. Explosivos da unidade + todo histórico de movimentações'
                        : '5. Explosivos da unidade + todo histórico de movimentações',
                      visible: !isCanilOnly
                    },
                    {
                      key: 'canil',
                      label: isCanilOnly
                        ? '1. Canil K9 (Canis físicos, Cães, Farmácia e Aplicações)'
                        : '6. Canil K9 (Canis físicos, Cães, Farmácia e Aplicações)',
                      visible: hasCanilAccess
                    }
                  ]
                    .filter(item => item.visible)
                    .map(item => {
                      const checked = modalSections[item.key as keyof SectionSelection];
                      return (
                        <label
                          key={item.key}
                          className={`flex items-center space-x-2.5 p-2 rounded-xl border cursor-pointer transition ${
                            checked
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-100'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setModalSections(prev => ({
                                ...prev,
                                [item.key]: e.target.checked
                              }))
                            }
                            className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700"
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActionModalMode(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!Object.values(modalSections).some(Boolean)}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition shadow"
                >
                  {actionModalMode === 'PRINT' ? (
                    <>
                      <Printer className="w-4 h-4" />
                      <span>Gerar e Imprimir</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Baixar Arquivo CSV</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
