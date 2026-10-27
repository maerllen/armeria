import React, { useState, useMemo, useEffect } from 'react';
import { User, Weapon, Caliber, VaultSpace, Department, Unit, Movement, WeaponTransfer } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Crosshair, Plus, Edit2, Trash2, History, AlertCircle, Check, Wrench, Shield, Search, Info, Layers, X, Building, ChevronRight, Eye, Filter, ArrowRightLeft, FileText, Inbox, Clock, SlidersHorizontal, RotateCcw, Printer, CheckCircle2 } from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { TransferWeaponModal } from './ModalTransferirArmas';
import { TransferReceiptModal } from './ModalReciboTransferencia';
import { TransferHistoryModal } from './ModalHistoricoTransferencias';
import { ReceiveTransferModal } from './ModalReceberTransferencia';
import { PrintArsenalModal } from './ModalImprimirArsenal';
import { ModalRegistrarTiros } from './ModalRegistrarTiros';
import { ModalManutencaoArma } from './ModalManutencaoArma';
import { ModalReceberManutencao } from './ModalReceberManutencao';
import { ModalHistoricoManutencoes } from './ModalHistoricoManutencoes';
import { ModalCadastrarArmeria } from './ModalCadastrarArmeria';

interface WeaponModuleProps {
  currentUser: User;
  weapons: Weapon[];
  calibers: Caliber[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  onRefresh: () => void;
}

export const WeaponModule: React.FC<WeaponModuleProps> = ({
  currentUser,
  weapons,
  calibers,
  vaultSpaces,
  departments,
  units,
  onRefresh
}) => {
  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const isPolicial = currentUser.role === 'Policial';

  // Navigation state: Department -> Unit -> Weapons
  const availableDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(availableDepts[0]?.id || '');

  const availableUnits = useMemo(() => {
    if (selectedDeptId === 'ALL') {
      return isGeral ? units : units.filter(u => u.departmentId === currentUser.departmentId);
    }
    return units.filter(u => u.departmentId === selectedDeptId);
  }, [units, selectedDeptId, isGeral, currentUser.departmentId]);

  // Permission to select all units: Geral, Admin, or Armeiro (and any user with multi-unit management scope)
  const canSelectAllUnits = isGeral || isAdmin || isArmeiro || currentUser.managementScope !== 'unit' || availableUnits.length > 1;

  // Selected Unit ID: 'ALL' represents "Todas as Unidades", otherwise a specific unit ID
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    return canSelectAllUnits ? 'ALL' : (availableUnits[0]?.id || '');
  });

  // Automatically select 'ALL' if permitted and empty, or first unit if restricted
  useEffect(() => {
    if (!selectedUnitId && availableUnits.length > 0) {
      setSelectedUnitId(canSelectAllUnits ? 'ALL' : availableUnits[0].id);
    }
  }, [selectedDeptId, availableUnits, selectedUnitId, canSelectAllUnits]);

  // Status Filter: All, No Cofre, Em Trânsito, Em Aula, Em Manutenção
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');

  // Granular Weapon Filters: Type, Manufacturer, Model, Caliber
  const [filterType, setFilterType] = useState<string>('TODOS');
  const [filterManufacturer, setFilterManufacturer] = useState<string>('TODOS');
  const [filterModel, setFilterModel] = useState<string>('TODOS');
  const [filterCaliber, setFilterCaliber] = useState<string>('TODOS');

  // Search input
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Weapon for Detail Modal
  const [selectedWeaponDetail, setSelectedWeaponDetail] = useState<Weapon | null>(null);

  // Modals state
  const [showWeaponModal, setShowWeaponModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showTransitDetailModal, setShowTransitDetailModal] = useState(false);
  const [showPrintArsenalModal, setShowPrintArsenalModal] = useState(false);

  // Maintenance & Shots Modals
  const [showAddShotsModal, setShowAddShotsModal] = useState(false);
  const [weaponForShots, setWeaponForShots] = useState<Weapon | null>(null);
  const [showReceiveMaintenanceModal, setShowReceiveMaintenanceModal] = useState(false);
  const [weaponToReceive, setWeaponToReceive] = useState<Weapon | null>(null);
  const [showMaintenanceHistoryModal, setShowMaintenanceHistoryModal] = useState(false);
  const [maintenanceHistoryWeapon, setMaintenanceHistoryWeapon] = useState<Weapon | null>(null);
  const [showRegisterWorkshopModal, setShowRegisterWorkshopModal] = useState(false);

  // Transfer Modals state (Exclusive to Geral, Admin, and Armeiro)
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferInitialWeapon, setTransferInitialWeapon] = useState<Weapon | null>(null);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [selectedTransferForReceipt, setSelectedTransferForReceipt] = useState<WeaponTransfer | null>(null);
  const [transferToReceive, setTransferToReceive] = useState<WeaponTransfer | null>(null);

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [weaponHistory, setWeaponHistory] = useState<Movement[]>([]);
  const [transitMovement, setTransitMovement] = useState<Movement | null>(null);
  const [deleteTargetWeapon, setDeleteTargetWeapon] = useState<Weapon | null>(null);

  // Weapon form states
  const [editingWeapon, setEditingWeapon] = useState<Weapon | null>(null);
  const [type, setType] = useState('Fuzil');
  const [serialNumber, setSerialNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('Taurus');
  const [model, setModel] = useState('');
  const [caliber, setCaliber] = useState('');
  const [magazineQuantity, setMagazineQuantity] = useState(4);
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [vaultSpaceId, setVaultSpaceId] = useState('');

  // Maintenance form states
  const [maintDate, setMaintDate] = useState('');
  const [maintResponsible, setMaintResponsible] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  // Available Weapon Types modal states
  const [showAvailableWeaponsModal, setShowAvailableWeaponsModal] = useState(false);
  const [editingWeaponTypeId, setEditingWeaponTypeId] = useState<string | null>(null);
  const [typeNameInput, setTypeNameInput] = useState('');
  const [newModelInputs, setNewModelInputs] = useState<Record<string, string>>({});
  const [wtErrorMsg, setWtErrorMsg] = useState('');
  const [wtSuccessMsg, setWtSuccessMsg] = useState('');

  const availableWeaponTypes = storage.getAvailableWeaponTypes();

  const handleCreateOrUpdateWeaponType = async (e: React.FormEvent) => {
    e.preventDefault();
    setWtErrorMsg('');
    setWtSuccessMsg('');
    if (!typeNameInput.trim()) {
      setWtErrorMsg('Informe o nome do tipo de arma.');
      return;
    }
    try {
      if (editingWeaponTypeId) {
        const existing = availableWeaponTypes.find(wt => wt.id === editingWeaponTypeId);
        await storage.addOrUpdateAvailableWeaponType({
          id: editingWeaponTypeId,
          name: typeNameInput.trim(),
          models: existing ? existing.models : []
        });
        setWtSuccessMsg('Tipo de arma atualizado com sucesso!');
      } else {
        await storage.addOrUpdateAvailableWeaponType({
          name: typeNameInput.trim(),
          models: []
        });
        setWtSuccessMsg('Novo tipo de arma cadastrado!');
      }
      setTypeNameInput('');
      setEditingWeaponTypeId(null);
      onRefresh();
    } catch (err: any) {
      setWtErrorMsg(err.message || 'Erro ao salvar tipo de arma.');
    }
  };

  const handleAddModelToType = async (typeId: string) => {
    const modelName = (newModelInputs[typeId] || '').trim();
    if (!modelName) return;
    const wt = availableWeaponTypes.find(item => item.id === typeId);
    if (!wt) return;

    if (wt.models.includes(modelName)) {
      setWtErrorMsg(`O modelo "${modelName}" já está cadastrado para ${wt.name}.`);
      return;
    }

    try {
      setWtErrorMsg('');
      setWtSuccessMsg('');
      const updatedModels = [...wt.models, modelName];
      await storage.addOrUpdateAvailableWeaponType({
        id: wt.id,
        name: wt.name,
        models: updatedModels
      });
      setNewModelInputs(prev => ({ ...prev, [typeId]: '' }));
      setWtSuccessMsg(`Modelo "${modelName}" adicionado a ${wt.name}.`);
      onRefresh();
    } catch (err: any) {
      setWtErrorMsg(err.message || 'Erro ao adicionar modelo.');
    }
  };

  const handleRemoveModelFromType = async (typeId: string, modelName: string) => {
    const wt = availableWeaponTypes.find(item => item.id === typeId);
    if (!wt) return;
    try {
      setWtErrorMsg('');
      setWtSuccessMsg('');
      const updatedModels = wt.models.filter(m => m !== modelName);
      await storage.addOrUpdateAvailableWeaponType({
        id: wt.id,
        name: wt.name,
        models: updatedModels
      });
      setWtSuccessMsg(`Modelo "${modelName}" removido.`);
      onRefresh();
    } catch (err: any) {
      setWtErrorMsg(err.message || 'Erro ao remover modelo.');
    }
  };

  const handleDeleteWeaponType = async (typeId: string, typeName: string) => {
    if (!window.confirm(`Deseja realmente excluir o tipo de arma "${typeName}" e todos os seus modelos?`)) return;
    try {
      setWtErrorMsg('');
      setWtSuccessMsg('');
      await storage.deleteAvailableWeaponType(typeId);
      setWtSuccessMsg(`Tipo de arma "${typeName}" excluído.`);
      onRefresh();
    } catch (err: any) {
      setWtErrorMsg(err.message || 'Erro ao excluir tipo de arma.');
    }
  };

  const canAddEditWeapon = isGeral || isArmeiro || isAdmin || (isPolicial && currentUser.canMoveWeapons);
  const canDeleteWeapon = isGeral || isArmeiro || isAdmin;
  const canManageMaintenance = isGeral || isArmeiro;
  const canTransferWeapons = isGeral || isAdmin || isArmeiro;

  const weaponTransfers = canTransferWeapons ? storage.getWeaponTransfers(currentUser) : [];
  const pendingTransfers = canTransferWeapons ? storage.getPendingIncomingTransfers(currentUser) : [];

  // Vault spaces for weapons: MUST BE TYPE ARMAS
  const weaponVaultSpaces = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === (unitId || currentUser.unitId));
  const availableUnitsForForm = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  const handleOpenWeaponModal = (weap?: Weapon) => {
    setErrorMsg('');
    setSuccessMsg('');
    setModalError('');
    setModalSuccess('');
    if (weap) {
      setEditingWeapon(weap);
      setType(weap.type);
      setSerialNumber(weap.serialNumber);
      setManufacturer(weap.manufacturer);
      setModel(weap.model);
      setCaliber(weap.caliber);
      setMagazineQuantity(weap.magazineQuantity);
      setDeptId(weap.departmentId);
      setUnitId(weap.unitId);
      setVaultSpaceId(weap.vaultSpaceId);
    } else {
      setEditingWeapon(null);
      setType('Fuzil');
      setSerialNumber('');
      setManufacturer('Taurus');
      setModel('T4');
      setCaliber(calibers[0]?.name || '5,56x45mm');
      setMagazineQuantity(4);
      const initialDept = selectedDeptId || (isGeral ? (departments[0]?.id || '') : currentUser.departmentId);
      setDeptId(initialDept);
      const initialUnits = units.filter(u => u.departmentId === initialDept);
      const initialUnitId = selectedUnitId || initialUnits[0]?.id || currentUser.unitId;
      setUnitId(initialUnitId);
      const initialVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === initialUnitId);
      setVaultSpaceId(initialVaults[0]?.id || '');
    }
    setShowWeaponModal(true);
  };

  const handleSaveWeapon = async (e: React.FormEvent | React.MouseEvent, keepOpen: boolean = false) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setModalError('');
    setModalSuccess('');

    if (!serialNumber.trim()) {
      setModalError('Informe o número de série da arma.');
      return;
    }
    if (!vaultSpaceId) {
      setModalError('Selecione um local do cofre para guardar a arma.');
      return;
    }

    const serials = serialNumber
      .split(/[\n,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);

    if (serials.length === 0) {
      setModalError('Informe ao menos um número de série válido.');
      return;
    }

    try {
      if (editingWeapon) {
        await storage.updateWeapon(editingWeapon.id, {
          type,
          serialNumber: serials[0],
          manufacturer: manufacturer.trim(),
          model: model.trim(),
          caliber,
          magazineQuantity,
          departmentId: deptId,
          unitId,
          vaultSpaceId
        });
        setSuccessMsg(`Arma ${serials[0]} atualizada com sucesso.`);
        setShowWeaponModal(false);
      } else {
        let addedCount = 0;
        const failedSerials: string[] = [];

        for (const s of serials) {
          try {
            await storage.addWeapon({
              type,
              serialNumber: s,
              manufacturer: manufacturer.trim(),
              model: model.trim(),
              caliber,
              magazineQuantity,
              departmentId: deptId,
              unitId,
              vaultSpaceId
            });
            addedCount++;
          } catch (err: any) {
            failedSerials.push(`${s}: ${err.message || 'Erro'}`);
          }
        }

        if (failedSerials.length > 0) {
          if (addedCount > 0) {
            setModalError(`Cadastrada(s) ${addedCount} arma(s). Falha no(s) número(s) de série: ${failedSerials.join(' | ')}`);
          } else {
            setModalError(`Erro ao cadastrar arma(s): ${failedSerials.join(' | ')}`);
            return;
          }
        } else {
          const successText = serials.length === 1
            ? `Arma (Série: ${serials[0]}) cadastrada no acervo com sucesso.`
            : `${serials.length} armas cadastradas em lote no acervo com sucesso.`;

          if (keepOpen) {
            setModalSuccess(`✅ ${successText} Formulário mantido. Insira o próximo número de série.`);
          } else {
            setSuccessMsg(successText);
            setShowWeaponModal(false);
          }
        }

        setSerialNumber('');
      }
      onRefresh();
    } catch (err: any) {
      setModalError(err.message || 'Erro ao salvar arma.');
    }
  };

  const handleDeleteWeapon = (weap: Weapon) => {
    setErrorMsg('');
    setSuccessMsg('');
    setDeleteTargetWeapon(weap);
  };

  const confirmExecuteDeleteWeapon = async () => {
    if (!deleteTargetWeapon) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await storage.deleteWeapon(deleteTargetWeapon.id);
      setSuccessMsg(`Arma ${deleteTargetWeapon.manufacturer} ${deleteTargetWeapon.model} (Série: ${deleteTargetWeapon.serialNumber}) excluída definitivamente.`);
      if (selectedWeaponDetail?.id === deleteTargetWeapon.id) {
        setSelectedWeaponDetail(null);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir arma.');
    } finally {
      setDeleteTargetWeapon(null);
    }
  };

  // Open Maintenance Modal
  const handleOpenMaintenance = (weap: Weapon) => {
    setSelectedWeapon(weap);
    setShowMaintenanceModal(true);
  };

  // Open Movement History
  const handleOpenHistory = (weap: Weapon) => {
    setSelectedWeapon(weap);
    const hist = storage.getWeaponMovementHistory(weap.id);
    setWeaponHistory(hist);
    setShowHistoryModal(true);
  };

  // View Transit Details
  const handleOpenTransitDetail = (weap: Weapon) => {
    if (weap.status !== 'Em Trânsito' || !weap.currentMovementId) return;

    const allMovs = storage.getMovements({ role: 'Geral' } as User);
    const mov = allMovs.find(m => m.id === weap.currentMovementId);
    if (mov) {
      setTransitMovement(mov);
      setSelectedWeapon(weap);
      setShowTransitDetailModal(true);
    }
  };

  // Weapons in the selected department / unit before attribute filtering (for dynamic option generation & counters)
  const baseWeaponsForOptions = useMemo(() => {
    return weapons.filter(w => {
      if (selectedUnitId && selectedUnitId !== 'ALL' && w.unitId !== selectedUnitId) return false;
      if ((!selectedUnitId || selectedUnitId === 'ALL') && selectedDeptId && selectedDeptId !== 'ALL' && w.departmentId !== selectedDeptId) return false;
      return true;
    });
  }, [weapons, selectedUnitId, selectedDeptId]);

  // Options for Tipo
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    availableWeaponTypes.forEach(t => { if (t.name) set.add(t.name.trim()); });
    baseWeaponsForOptions.forEach(w => { if (w.type) set.add(w.type.trim()); });
    if (set.size === 0) {
      weapons.forEach(w => { if (w.type) set.add(w.type.trim()); });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [availableWeaponTypes, baseWeaponsForOptions, weapons]);

  // Options for Fabricante
  const availableManufacturers = useMemo(() => {
    const set = new Set<string>();
    baseWeaponsForOptions.forEach(w => { if (w.manufacturer) set.add(w.manufacturer.trim()); });
    if (set.size === 0) {
      weapons.forEach(w => { if (w.manufacturer) set.add(w.manufacturer.trim()); });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseWeaponsForOptions, weapons]);

  // Options for Modelo (optionally refined by current type / manufacturer if selected)
  const availableModels = useMemo(() => {
    const set = new Set<string>();
    baseWeaponsForOptions.forEach(w => {
      if (filterType !== 'TODOS' && filterType && (w.type || '').toLowerCase() !== filterType.toLowerCase()) return;
      if (filterManufacturer !== 'TODOS' && filterManufacturer && (w.manufacturer || '').toLowerCase() !== filterManufacturer.toLowerCase()) return;
      if (w.model) set.add(w.model.trim());
    });
    if (filterType !== 'TODOS' && filterType) {
      const awt = availableWeaponTypes.find(t => t.name.toLowerCase() === filterType.toLowerCase());
      awt?.models?.forEach(m => { if (m) set.add(m.trim()); });
    }
    // Fallback if none matched
    if (set.size === 0) {
      baseWeaponsForOptions.forEach(w => { if (w.model) set.add(w.model.trim()); });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseWeaponsForOptions, filterType, filterManufacturer, availableWeaponTypes]);

  // Options for Calibre
  const availableCalibers = useMemo(() => {
    const set = new Set<string>();
    calibers.forEach(c => { if (c.name) set.add(c.name.trim()); });
    baseWeaponsForOptions.forEach(w => { if (w.caliber) set.add(w.caliber.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [calibers, baseWeaponsForOptions]);

  const hasActiveAttributeFilters =
    filterType !== 'TODOS' ||
    filterManufacturer !== 'TODOS' ||
    filterModel !== 'TODOS' ||
    filterCaliber !== 'TODOS';

  const clearAllFilters = () => {
    setFilterType('TODOS');
    setFilterManufacturer('TODOS');
    setFilterModel('TODOS');
    setFilterCaliber('TODOS');
    setStatusFilter('TODOS');
    setSearchTerm('');
  };

  // Filtered Weapons logic based on Department, Unit, Status, Type, Manufacturer, Model, Caliber, and Search query
  const unitWeapons = weapons.filter(w => {
    // Must belong to selected unit (if a specific unit is selected)
    if (selectedUnitId && selectedUnitId !== 'ALL' && w.unitId !== selectedUnitId) return false;
    // If all units, filter by selected department (if not ALL departments)
    if ((!selectedUnitId || selectedUnitId === 'ALL') && selectedDeptId && selectedDeptId !== 'ALL' && w.departmentId !== selectedDeptId) return false;

    // Status filter
    if (statusFilter !== 'TODOS') {
      if (statusFilter === 'NO_COFRE' && w.status !== 'No Cofre') return false;
      if (statusFilter === 'EM_MOVIMENTO' && w.status !== 'Em Trânsito' && w.status !== 'Em Transito') return false;
      if (statusFilter === 'EM_AULA' && w.status !== 'Em Aula' && w.status !== 'Em Sala de Aula') return false;
      if (statusFilter === 'EM_MANUTENCAO' && w.status !== 'Em Manutenção' && w.status !== 'Manutenção') return false;
      if (statusFilter === 'PENDENTE_RECIBO' && w.status !== 'Pendente de Recibo' && w.status !== 'Pendente Recibo') return false;
    }

    // Type Filter
    if (filterType !== 'TODOS' && filterType.trim()) {
      if ((w.type || '').trim().toLowerCase() !== filterType.trim().toLowerCase()) return false;
    }

    // Manufacturer Filter
    if (filterManufacturer !== 'TODOS' && filterManufacturer.trim()) {
      if ((w.manufacturer || '').trim().toLowerCase() !== filterManufacturer.trim().toLowerCase()) return false;
    }

    // Model Filter
    if (filterModel !== 'TODOS' && filterModel.trim()) {
      if ((w.model || '').trim().toLowerCase() !== filterModel.trim().toLowerCase()) return false;
    }

    // Caliber Filter
    if (filterCaliber !== 'TODOS' && filterCaliber.trim()) {
      if ((w.caliber || '').trim().toLowerCase() !== filterCaliber.trim().toLowerCase()) return false;
    }

    // Search term matching (Modelo, Fabricante, Número de série, Calibre, Tipo, Unidade, Cofre)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const unitObj = units.find(u => u.id === w.unitId);
      const vaultObj = vaultSpaces.find(v => v.id === w.vaultSpaceId);

      const matchesModel = (w.model || '').toLowerCase().includes(term);
      const matchesManufacturer = (w.manufacturer || '').toLowerCase().includes(term);
      const matchesSerial = (w.serialNumber || '').toLowerCase().includes(term);
      const matchesCaliber = (w.caliber || '').toLowerCase().includes(term);
      const matchesType = (w.type || '').toLowerCase().includes(term);
      const matchesUnit = unitObj ? unitObj.name.toLowerCase().includes(term) : false;
      const matchesVault = vaultObj ? vaultObj.code.toLowerCase().includes(term) : false;

      return matchesModel || matchesManufacturer || matchesSerial || matchesCaliber || matchesType || matchesUnit || matchesVault;
    }

    return true;
  });

  const selectedDepartmentObj = selectedDeptId === 'ALL' ? null : departments.find(d => d.id === selectedDeptId);
  const selectedUnitObj = selectedUnitId === 'ALL' || !selectedUnitId ? null : units.find(u => u.id === selectedUnitId);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Crosshair className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Catálogo e Acervo de Armas</h1>
            <p className="text-xs text-slate-400">
              Escolha o Departamento e a Unidade para visualizar e detalhar as armas do acervo
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isGeral && (
            <button
              onClick={() => {
                setWtErrorMsg('');
                setWtSuccessMsg('');
                setShowAvailableWeaponsModal(true);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Armas Disponíveis (Tipos e Modelos)</span>
            </button>
          )}

          {canTransferWeapons && (
            <>
              <button
                id="open-transfer-history-btn"
                onClick={() => setShowTransferHistoryModal(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Histórico Transferências</span>
                {weaponTransfers.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold">
                    {weaponTransfers.length}
                  </span>
                )}
              </button>

              <button
                id="open-transfer-weapons-btn"
                onClick={() => {
                  setTransferInitialWeapon(null);
                  setShowTransferModal(true);
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Transferir Armas entre Unidades</span>
              </button>
            </>
          )}

          {/* Print Arsenal Button */}
          <button
            id="open-print-arsenal-btn"
            onClick={() => setShowPrintArsenalModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            title="Imprimir relatório e inventário das armas disponíveis na unidade"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Imprimir Arsenal</span>
          </button>

          {/* Histórico Geral de Manutenções */}
          <button
            id="open-general-maintenance-btn"
            onClick={() => {
              setMaintenanceHistoryWeapon(null);
              setShowMaintenanceHistoryModal(true);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            title="Visualizar histórico geral de todas as manutenções de armas"
          >
            <Wrench className="w-4 h-4 text-amber-400" />
            <span>Histórico de Manutenções</span>
          </button>

          {/* Atalho Exclusivo: Perfil "Geral" para Cadastrar Armeria */}
          {isGeral && (
            <button
              id="open-register-workshop-btn"
              onClick={() => setShowRegisterWorkshopModal(true)}
              className="bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-800/80 hover:border-purple-600 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              title="Atalho exclusivo para perfil Geral: Cadastrar e gerenciar armerias e oficinas externas"
            >
              <Building className="w-4 h-4 text-purple-400" />
              <span>Cadastrar Armeria</span>
            </button>
          )}

          {canAddEditWeapon && (
            <button
              onClick={() => handleOpenWeaponModal()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Nova Arma</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Pending Incoming Transfers Alert Banner */}
      {pendingTransfers.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-300">
                  {isGeral
                    ? `${pendingTransfers.length} Transferência(s) Pendente(s) de Recebimento no Sistema`
                    : `${pendingTransfers.length} Transferência(s) com Destino à sua Unidade Pendente(s) de Recebimento`}
                </h3>
                <p className="text-xs text-amber-200/80">
                  O armamento foi despachado e aguarda confirmação de entrada no cofre para liberação do recibo de recebimento.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {pendingTransfers.map((ptrf) => (
              <div
                key={ptrf.id}
                className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-sm"
              >
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-400 text-xs">
                      {ptrf.protocolNumber || ptrf.id}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatTimestamp(ptrf.transferDate || ptrf.createdAt)}
                    </span>
                  </div>

                  <div className="text-slate-300 text-xs">
                    <span className="text-slate-400 font-semibold">Origem:</span> {ptrf.originUnitName} ({ptrf.originDepartmentName})
                  </div>

                  <div className="text-slate-300 text-xs">
                    <span className="text-slate-400 font-semibold">Destino:</span> {ptrf.destinationUnitName}
                  </div>

                  <div className="text-slate-400 text-[11px]">
                    Transportador: <strong className="text-slate-200">{ptrf.receiverOrTransporterName}</strong> (MASP: {ptrf.receiverOrTransporterMasp})
                  </div>

                  <div className="text-[11px] text-amber-400/90 font-mono">
                    {ptrf.totalWeapons || ptrf.weapons?.length || 1} arma(s): {(ptrf.weapons || []).map(w => w.serialNumber).join(', ')}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTransferToReceive(ptrf)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-950/40"
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    <span>Receber no Cofre</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 1: Department Selection Grid / Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
          <Building className="w-4 h-4" />
          <span>1. Selecione o Departamento</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {isGeral && (
            <button
              onClick={() => {
                setSelectedDeptId('ALL');
                setSelectedUnitId('ALL');
              }}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                selectedDeptId === 'ALL'
                  ? 'bg-amber-500/10 border-amber-500/50 text-slate-100 ring-1 ring-amber-500/30'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 block uppercase">ESTADO</span>
                <span className="text-xs font-bold block truncate" title="Todos os Departamentos da Polícia Civil">Todos os Departamentos</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">
                {weapons.length} arma(s)
              </span>
            </button>
          )}

          {availableDepts.map((d) => {
            const isSelected = d.id === selectedDeptId;
            const deptWeaponCount = weapons.filter(w => w.departmentId === d.id).length;

            return (
              <button
                key={d.id}
                onClick={() => {
                  setSelectedDeptId(d.id);
                  const firstUnit = units.find(u => u.departmentId === d.id);
                  setSelectedUnitId(canSelectAllUnits ? 'ALL' : (firstUnit ? firstUnit.id : ''));
                }}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/50 text-slate-100 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 block uppercase">{d.code}</span>
                  <span className="text-xs font-bold block truncate" title={d.name}>{d.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {deptWeaponCount} arma(s)
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2: Unit Selection for Selected Department */}
      {selectedDeptId && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
              <ChevronRight className="w-4 h-4" />
              <span>2. Selecione a Unidade em <strong className="text-slate-100">{selectedDeptId === 'ALL' ? 'Todos os Departamentos' : (selectedDepartmentObj?.name || 'Departamento')}</strong></span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {availableUnits.length} unidade(s) encontrada(s)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {canSelectAllUnits && (
              <button
                id="select-all-units-btn"
                onClick={() => setSelectedUnitId('ALL')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border ${
                  selectedUnitId === 'ALL' || selectedUnitId === ''
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Todas as Unidades</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  selectedUnitId === 'ALL' || selectedUnitId === '' ? 'bg-slate-950/30 text-slate-950 font-black' : 'bg-slate-900 text-amber-400 border border-slate-800'
                }`}>
                  {weapons.filter(w => selectedDeptId === 'ALL' || !selectedDeptId ? true : w.departmentId === selectedDeptId).length}
                </span>
              </button>
            )}

            {availableUnits.map((u) => {
              const isSelected = u.id === selectedUnitId;
              const unitWeaponCount = weapons.filter(w => w.unitId === u.id).length;

              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUnitId(u.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>{u.name}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-slate-950/30 text-slate-950 font-black' : 'bg-slate-900 text-amber-400 border border-slate-800'
                  }`}>
                    {unitWeaponCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: Weapon List & Filters for Selected Unit / Department */}
      {selectedDeptId ? (
        <div className="space-y-4">
          
          {/* Status Quick Filters, Granular Filters & Search Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              
              {/* Status Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  <span>Status:</span>
                </span>

                <button
                  onClick={() => setStatusFilter('TODOS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === 'TODOS'
                      ? 'bg-slate-100 text-slate-950'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Todos
                </button>

                <button
                  onClick={() => setStatusFilter('NO_COFRE')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === 'NO_COFRE'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  No Cofre
                </button>

                <button
                  onClick={() => setStatusFilter('EM_MOVIMENTO')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === 'EM_MOVIMENTO'
                      ? 'bg-amber-950 text-amber-400 border border-amber-600'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Em Trânsito / Movimento
                </button>

                <button
                  onClick={() => setStatusFilter('PENDENTE_RECIBO')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1 ${
                    statusFilter === 'PENDENTE_RECIBO'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Pendente de Recibo</span>
                </button>

                <button
                  onClick={() => setStatusFilter('EM_AULA')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === 'EM_AULA'
                      ? 'bg-blue-950 text-blue-400 border border-blue-600'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Em Aula
                </button>

                <button
                  onClick={() => setStatusFilter('EM_MANUTENCAO')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === 'EM_MANUTENCAO'
                      ? 'bg-purple-950 text-purple-300 border border-purple-600'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Em Manutenção
                </button>
              </div>

              {/* Counter & Print Arsenal Action */}
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowPrintArsenalModal(true)}
                  className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 shadow-sm"
                  title="Abrir painel para filtrar, selecionar e imprimir armas disponíveis na unidade"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Armas ({unitWeapons.length})</span>
                </button>

                <span className="text-xs text-slate-400 font-medium">
                  Exibindo <strong className="text-amber-400 font-mono">{unitWeapons.length}</strong> arma(s)
                </span>
              </div>

            </div>

            {/* Search Input matching (Modelo, Fabricante, Numero de serie, Calibre, Tipo, Unidade e Cofre) */}
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por Modelo, Fabricante, Nº de Série, Calibre, Tipo, Unidade ou Cofre..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Granular Filters: Tipo, Fabricante, Modelo, Calibre */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Filtros do Acervo (Tipo, Fabricante, Modelo, Calibre):</span>
                </span>

                {(hasActiveAttributeFilters || statusFilter !== 'TODOS' || searchTerm) && (
                  <button
                    onClick={clearAllFilters}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center space-x-1 transition hover:underline"
                    title="Limpar todos os filtros aplicados"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpar Filtros</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Tipo */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Tipo de Arma:
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => {
                      setFilterType(e.target.value);
                      setFilterModel('TODOS');
                    }}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterType !== 'TODOS'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="TODOS" className="bg-slate-900 text-slate-200">
                      Todos os Tipos ({baseWeaponsForOptions.length})
                    </option>
                    {availableTypes.map((t) => {
                      const count = baseWeaponsForOptions.filter(w => (w.type || '').toLowerCase() === t.toLowerCase()).length;
                      return (
                        <option key={t} value={t} className="bg-slate-900 text-slate-200">
                          {t} {count > 0 ? `(${count})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Fabricante */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Fabricante:
                  </label>
                  <select
                    value={filterManufacturer}
                    onChange={(e) => {
                      setFilterManufacturer(e.target.value);
                      setFilterModel('TODOS');
                    }}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterManufacturer !== 'TODOS'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="TODOS" className="bg-slate-900 text-slate-200">
                      Todos os Fabricantes
                    </option>
                    {availableManufacturers.map((m) => {
                      const count = baseWeaponsForOptions.filter(w => (w.manufacturer || '').toLowerCase() === m.toLowerCase()).length;
                      return (
                        <option key={m} value={m} className="bg-slate-900 text-slate-200">
                          {m} {count > 0 ? `(${count})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 3. Modelo */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Modelo:
                  </label>
                  <select
                    value={filterModel}
                    onChange={(e) => setFilterModel(e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterModel !== 'TODOS'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="TODOS" className="bg-slate-900 text-slate-200">
                      Todos os Modelos
                    </option>
                    {availableModels.map((m) => {
                      const count = baseWeaponsForOptions.filter(w => (w.model || '').toLowerCase() === m.toLowerCase()).length;
                      return (
                        <option key={m} value={m} className="bg-slate-900 text-slate-200">
                          {m} {count > 0 ? `(${count})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 4. Calibre */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Calibre:
                  </label>
                  <select
                    value={filterCaliber}
                    onChange={(e) => setFilterCaliber(e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterCaliber !== 'TODOS'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="TODOS" className="bg-slate-900 text-slate-200">
                      Todos os Calibres
                    </option>
                    {availableCalibers.map((c) => {
                      const count = baseWeaponsForOptions.filter(w => (w.caliber || '').toLowerCase() === c.toLowerCase()).length;
                      return (
                        <option key={c} value={c} className="bg-slate-900 text-slate-200">
                          {c} {count > 0 ? `(${count})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Active Filter Badges */}
              {hasActiveAttributeFilters && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <span className="text-[10px] text-slate-400 font-semibold">Filtros ativos:</span>
                  {filterType !== 'TODOS' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Tipo: {filterType}</span>
                      <button onClick={() => setFilterType('TODOS')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterManufacturer !== 'TODOS' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Fabricante: {filterManufacturer}</span>
                      <button onClick={() => setFilterManufacturer('TODOS')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterModel !== 'TODOS' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Modelo: {filterModel}</span>
                      <button onClick={() => setFilterModel('TODOS')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterCaliber !== 'TODOS' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Calibre: {filterCaliber}</span>
                      <button onClick={() => setFilterCaliber('TODOS')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Weapons Cards List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unitWeapons.length === 0 ? (
              <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs italic">
                Nenhuma arma encontrada {selectedUnitObj ? `na unidade ${selectedUnitObj.name}` : (selectedDeptId === 'ALL' ? 'no acervo geral de armas' : `no departamento ${selectedDepartmentObj?.name || ''}`)} para os critérios selecionados.
              </div>
            ) : (
              unitWeapons.map((w) => {
                const vault = vaultSpaces.find(v => v.id === w.vaultSpaceId);
                const weaponUnit = units.find(u => u.id === w.unitId);

                return (
                  <div
                    key={w.id}
                    onClick={() => setSelectedWeaponDetail(w)}
                    className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition shadow-sm flex flex-col justify-between group"
                  >
                    <div>
                      {/* Status Badge */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-md border ${
                          w.status === 'No Cofre'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : w.status === 'Em Trânsito'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : w.status === 'Pendente de Recibo'
                            ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                            : w.status === 'Manutenção' || w.status === 'Em Manutenção'
                            ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                            : 'bg-purple-950 text-purple-300 border-purple-800'
                        }`}>
                          {w.status}
                        </span>

                        <div className="flex items-center space-x-1">
                          {(w.shotCount || 0) > 0 && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold" title="Quantidade de tiros efetuados">
                              {w.shotCount} tiros
                            </span>
                          )}
                          <span className="text-[10px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded border border-slate-800 font-mono">
                            {w.type}
                          </span>
                        </div>
                      </div>

                      {/* Main Weapon Title */}
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition">
                        {w.manufacturer} {w.model}
                      </h3>

                      <p className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                        Série: {w.serialNumber}
                      </p>

                      <div className="text-[11px] text-slate-400 mt-2 space-y-0.5 font-mono">
                        {(selectedUnitId === 'ALL' || !selectedUnitId) && (
                          <p className="text-slate-300 font-semibold truncate flex items-center space-x-1">
                            <Building className="w-3 text-amber-400 shrink-0" />
                            <span>{weaponUnit?.name || 'Unidade'}</span>
                          </p>
                        )}
                        <p>Calibre: <strong className="text-slate-200">{w.caliber}</strong></p>
                        <p>
                          Cofre: <strong className="text-slate-200">
                            {w.status === 'Manutenção' || w.status === 'Em Manutenção'
                              ? 'Em Manutenção'
                              : vault ? vault.code : (w.status === 'Pendente de Recibo' ? 'Aguardando Recebimento' : 'Em Trânsito')}
                          </strong>
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400 font-medium flex items-center space-x-1 group-hover:text-amber-400">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Detalhes</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-xs italic">
          Por favor, selecione um Departamento para visualizar o acervo de armas.
        </div>
      )}

      {/* WEAPON DETAIL MODAL (Opens ONLY when a weapon is clicked/selected) */}
      {selectedWeaponDetail && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-5 my-8">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
                  <Crosshair className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {selectedWeaponDetail.manufacturer} {selectedWeaponDetail.model}
                  </h3>
                  <p className="text-xs font-mono text-amber-400 font-bold">
                    Nº de Série: {selectedWeaponDetail.serialNumber}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedWeaponDetail(null)}
                className="text-slate-400 hover:text-slate-100 font-bold p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Weapon Information Grid */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Especificações e Localização
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] block">TIPO:</span>
                  <span className="font-bold text-slate-100">{selectedWeaponDetail.type}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">FABRICANTE:</span>
                  <span className="font-bold text-slate-100">{selectedWeaponDetail.manufacturer}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">MODELO:</span>
                  <span className="font-bold text-slate-100">{selectedWeaponDetail.model}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">CALIBRE:</span>
                  <span className="font-bold text-amber-400">{selectedWeaponDetail.caliber}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">CARREGADORES:</span>
                  <span className="font-bold text-slate-100">{selectedWeaponDetail.magazineQuantity} un</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">STATUS ATUAL:</span>
                  <span className={`font-bold ${
                    selectedWeaponDetail.status === 'No Cofre' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {selectedWeaponDetail.status}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] block">DEPARTAMENTO:</span>
                  <span className="font-bold text-slate-200">
                    {departments.find(d => d.id === selectedWeaponDetail.departmentId)?.name || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">UNIDADE:</span>
                  <span className="font-bold text-slate-200">
                    {units.find(u => u.id === selectedWeaponDetail.unitId)?.name || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">LOCAL NO COFRE:</span>
                  <span className="font-bold text-amber-400">
                    {vaultSpaces.find(v => v.id === selectedWeaponDetail.vaultSpaceId)?.code || (selectedWeaponDetail.status === 'Manutenção' ? 'Em Manutenção' : 'Em Trânsito')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">ÚLTIMA MANUTENÇÃO:</span>
                  <span className="font-bold text-slate-200">
                    {selectedWeaponDetail.lastMaintenanceDate || 'Sem registro'}
                  </span>
                </div>
              </div>

              {/* Quantidade de Tiros / Disparos Efetuados */}
              <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[10px] block font-mono">QUANTIDADE DE TIROS / DISPAROS:</span>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span className="text-amber-400 font-bold font-mono text-sm">
                      {(selectedWeaponDetail.shotCount || 0).toLocaleString('pt-BR')}
                    </span>
                    <span className="text-slate-400 text-xs">tiros disparados</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setWeaponForShots(selectedWeaponDetail);
                    setShowAddShotsModal(true);
                  }}
                  className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 shadow-sm"
                  title="Registrar disparos efetuados pela arma em treinamento ou estande"
                >
                  <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                  <span>Registrar Tiros</span>
                </button>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              
              <div className="flex items-center space-x-2">
                {/* Movement History Button */}
                <button
                  onClick={() => handleOpenHistory(selectedWeaponDetail)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5"
                >
                  <History className="w-4 h-4 text-amber-400" />
                  <span>Histórico</span>
                </button>

                {/* Maintenance History Button for this Weapon */}
                <button
                  onClick={() => {
                    setMaintenanceHistoryWeapon(selectedWeaponDetail);
                    setShowMaintenanceHistoryModal(true);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5"
                  title="Histórico de manutenções deste armamento"
                >
                  <Wrench className="w-4 h-4 text-amber-400" />
                  <span>Histórico Manutenções</span>
                </button>

                {/* Transfer Weapon Button (Geral, Admin, Armeiro) */}
                {canTransferWeapons && (() => {
                  const isWeaponFromMyUnit = isGeral || !currentUser.unitId || selectedWeaponDetail.unitId === currentUser.unitId;
                  const isTransferDisabled = !isWeaponFromMyUnit || selectedWeaponDetail.status === 'Em Trânsito' || selectedWeaponDetail.status === 'Em Aula' || selectedWeaponDetail.status === 'Pendente de Recibo' || selectedWeaponDetail.status === 'Manutenção';
                  
                  return (
                    <button
                      id="detail-transfer-weapon-btn"
                      disabled={isTransferDisabled}
                      onClick={() => {
                        setTransferInitialWeapon(selectedWeaponDetail);
                        setSelectedWeaponDetail(null);
                        setShowTransferModal(true);
                      }}
                      title={
                        !isWeaponFromMyUnit
                          ? 'Você só pode transferir armas pertencentes à sua própria unidade.'
                          : selectedWeaponDetail.status === 'Em Trânsito' || selectedWeaponDetail.status === 'Em Aula' || selectedWeaponDetail.status === 'Pendente de Recibo' || selectedWeaponDetail.status === 'Manutenção'
                          ? `Arma com status "${selectedWeaponDetail.status}". Não é possível transferir no momento.`
                          : 'Transferir esta arma para outra unidade'
                      }
                      className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-800 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-2 rounded-xl border border-amber-500/30 transition flex items-center space-x-1.5"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Transferir Arma</span>
                    </button>
                  );
                })()}

                {/* Maintenance Actions: Send to Maintenance vs Receive from Maintenance */}
                {canManageMaintenance && (selectedWeaponDetail.status === 'Manutenção' || selectedWeaponDetail.status === 'Em Manutenção') ? (
                  <button
                    onClick={() => {
                      setWeaponToReceive(selectedWeaponDetail);
                      setShowReceiveMaintenanceModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-2 rounded-xl border border-emerald-500/40 transition flex items-center space-x-1.5 shadow-lg shadow-emerald-950/40"
                    title="Confirmar retorno da arma ao cofre e registrar tipo de serviço realizado"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>(RECEBER DA MANUTENÇÃO)</span>
                  </button>
                ) : canManageMaintenance && selectedWeaponDetail.status === 'No Cofre' ? (
                  <button
                    onClick={() => handleOpenMaintenance(selectedWeaponDetail)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5"
                  >
                    <Wrench className="w-4 h-4 text-amber-400" />
                    <span>Manutenção</span>
                  </button>
                ) : null}

                {/* Transit Details if in transit */}
                {selectedWeaponDetail.status === 'Em Trânsito' && (
                  <button
                    onClick={() => handleOpenTransitDetail(selectedWeaponDetail)}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center space-x-1.5"
                  >
                    <Info className="w-4 h-4" />
                    <span>Quem está com a arma</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* Edit Button */}
                {canAddEditWeapon && (
                  <button
                    onClick={() => {
                      setSelectedWeaponDetail(null);
                      handleOpenWeaponModal(selectedWeaponDetail);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl border border-slate-700 transition flex items-center space-x-1"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-300" />
                    <span>Editar</span>
                  </button>
                )}

                {/* Delete Button */}
                {canDeleteWeapon && (
                  <button
                    onClick={() => handleDeleteWeapon(selectedWeaponDetail)}
                    className="bg-red-950 hover:bg-red-900 text-red-300 text-xs font-bold px-3 py-2 rounded-xl border border-red-800 transition flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                )}
              </div>

            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedWeaponDetail(null)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
              >
                Fechar Detalhes
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Add / Edit Weapon */}
      {showWeaponModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800 flex items-center justify-between">
              <span>{editingWeapon ? 'Editar Arma' : 'Cadastrar Nova Arma'}</span>
              {!editingWeapon && (
                <span className="text-[11px] font-normal text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                  Modo Cadastro Rápido / Lote
                </span>
              )}
            </h3>

            {modalSuccess && (
              <div className="mb-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{modalSuccess}</span>
              </div>
            )}

            {modalError && (
              <div className="mb-4 bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={(e) => handleSaveWeapon(e, false)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Tipo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tipo de Arma
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="Fuzil">Fuzil</option>
                    <option value="Pistola">Pistola</option>
                    <option value="Submetralhadora">Submetralhadora</option>
                    <option value="Espingarda">Espingarda</option>
                    <option value="Carabina">Carabina</option>
                    <option value="Revólver">Revólver</option>
                  </select>
                </div>

                {/* Número de Série */}
                <div className={editingWeapon ? '' : 'sm:col-span-2'}>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Número de Série</span>
                    {!editingWeapon && (
                      <span className="text-[10px] text-amber-400 font-normal">
                        (Aceita múltiplos números separando por vírgula ou linha)
                      </span>
                    )}
                  </label>
                  {editingWeapon ? (
                    <input
                      type="text"
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      placeholder="Ex: EKG-5486"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                      required
                    />
                  ) : (
                    <div>
                      <textarea
                        rows={2}
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        placeholder="Ex: EKG-5486 ou EKG-5486, EKG-5487, EKG-5488"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono resize-none focus:border-amber-500 focus:outline-none"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 inline shrink-0 text-amber-400" />
                        <span>Você pode informar vários números de série para criar armas idênticas em lote de uma vez só.</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Fabricante */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Fabricante
                  </label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="Ex: Taurus, Imbel, Glock"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                    required
                  />
                </div>

                {/* Modelo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ex: T4, PT92, IA2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>

                {/* Calibre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Calibre
                  </label>
                  <select
                    value={caliber}
                    onChange={(e) => setCaliber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  >
                    {calibers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Qtd Carregadores */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Qtd. Carregadores
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={magazineQuantity}
                    onChange={(e) => setMagazineQuantity(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>

                {/* Departamento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Departamento
                  </label>
                  <select
                    value={deptId}
                    onChange={(e) => {
                      setDeptId(e.target.value);
                      const depUnits = units.filter(u => u.departmentId === e.target.value);
                      const newUnitId = depUnits[0]?.id || '';
                      setUnitId(newUnitId);
                      const newVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === newUnitId);
                      setVaultSpaceId(newVaults[0]?.id || '');
                    }}
                    disabled={!isGeral}
                    className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                      !isGeral
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  >
                    {availableDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unidade */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Unidade
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => {
                      setUnitId(e.target.value);
                      const newVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === e.target.value);
                      setVaultSpaceId(newVaults[0]?.id || '');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    {availableUnitsForForm.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Local do Cofre */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Localização no Cofre (Apenas cofres do tipo ARMAS)
                </label>
                <select
                  value={vaultSpaceId}
                  onChange={(e) => setVaultSpaceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {weaponVaultSpaces.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} (Espaço de Armas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWeaponModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                >
                  Cancelar
                </button>

                {!editingWeapon && (
                  <button
                    type="button"
                    onClick={(e) => handleSaveWeapon(e, true)}
                    className="bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-400 font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5 shadow"
                    title="Cadastra esta arma, mantém o formulário preenchido e limpa apenas o número de série"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Salvar e Cadastrar Outra</span>
                  </button>
                )}

                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow transition"
                >
                  {editingWeapon ? 'Atualizar Arma' : 'Salvar e Concluir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar Tiros */}
      {showAddShotsModal && weaponForShots && (
        <ModalRegistrarTiros
          weapon={weaponForShots}
          currentUser={currentUser}
          onClose={() => {
            setShowAddShotsModal(false);
            setWeaponForShots(null);
          }}
          onSuccess={(newTotal) => {
            setSuccessMsg(`Disparos registrados com sucesso! Total acumulado da arma: ${newTotal.toLocaleString('pt-BR')} tiros.`);
            onRefresh();
            if (selectedWeaponDetail && selectedWeaponDetail.id === weaponForShots.id) {
              setSelectedWeaponDetail({ ...selectedWeaponDetail, shotCount: newTotal });
            }
          }}
        />
      )}

      {/* Modal Enviar para Manutenção (Interna ou Externa) */}
      {showMaintenanceModal && selectedWeapon && (
        <ModalManutencaoArma
          weapon={selectedWeapon}
          currentUser={currentUser}
          vaultSpaces={vaultSpaces}
          onClose={() => {
            setShowMaintenanceModal(false);
            setSelectedWeapon(null);
          }}
          onSuccess={() => {
            setSuccessMsg(`Arma ${selectedWeapon.serialNumber} enviada para manutenção. O status foi alterado para "Manutenção".`);
            setShowMaintenanceModal(false);
            setSelectedWeapon(null);
            setSelectedWeaponDetail(null);
            onRefresh();
          }}
        />
      )}

      {/* Modal Receber da Manutenção */}
      {showReceiveMaintenanceModal && weaponToReceive && (
        <ModalReceberManutencao
          weapon={weaponToReceive}
          currentUser={currentUser}
          vaultSpaces={vaultSpaces}
          onClose={() => {
            setShowReceiveMaintenanceModal(false);
            setWeaponToReceive(null);
          }}
          onSuccess={() => {
            setSuccessMsg(`Arma ${weaponToReceive.serialNumber} recebida da manutenção e retornada ao cofre de origem com sucesso.`);
            setShowReceiveMaintenanceModal(false);
            setWeaponToReceive(null);
            setSelectedWeaponDetail(null);
            onRefresh();
          }}
        />
      )}

      {/* Modal Histórico de Manutenções (Individual por arma ou Geral) */}
      {showMaintenanceHistoryModal && (
        <ModalHistoricoManutencoes
          weapon={maintenanceHistoryWeapon}
          weapons={weapons}
          departments={departments}
          units={units}
          vaultSpaces={vaultSpaces}
          currentUser={currentUser}
          onClose={() => {
            setShowMaintenanceHistoryModal(false);
            setMaintenanceHistoryWeapon(null);
          }}
        />
      )}

      {/* Modal Cadastrar Armeria (Exclusivo: Geral) */}
      {showRegisterWorkshopModal && isGeral && (
        <ModalCadastrarArmeria
          currentUser={currentUser}
          onClose={() => setShowRegisterWorkshopModal(false)}
          onSuccess={() => {
            setSuccessMsg('Armeria externa salva com sucesso!');
          }}
        />
      )}

      {/* Modal History (Last 5 movements) */}
      {showHistoryModal && selectedWeapon && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <History className="w-5 h-5 text-amber-400" />
                <span>Histórico (Últimas 5 Retiradas e Devoluções)</span>
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Arma: <strong className="text-amber-400 font-mono">{selectedWeapon.type} {selectedWeapon.model} - Série {selectedWeapon.serialNumber}</strong>
            </p>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {weaponHistory.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  Nenhuma movimentação registrada no histórico desta arma.
                </p>
              ) : (
                weaponHistory.map((m) => (
                  <div key={m.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100">{m.requesterName} (MASP {m.requesterMasp})</span>
                      <span className="text-[10px] font-mono text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        {m.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-0.5">
                      <p>Retirada: <span className="text-slate-200">{m.ammunitionCount} munições • {m.magazineCount} carregadores</span></p>
                      <p>Autorizado por: <span className="text-slate-300 font-semibold">{m.approvedByUserName || 'N/A'}</span></p>
                      {m.receiptDate && (
                        <p>Devolução confirmada em: <span className="text-emerald-400 font-mono">{formatTimestamp(m.receiptDate)}</span> por {m.receiptConfirmedByUserName}</p>
                      )}
                      {m.divergenceJustification && (
                        <p className="text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-900/50 mt-1">
                          Justificativa Divergência: "{m.divergenceJustification}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transit Detail Modal */}
      {showTransitDetailModal && transitMovement && selectedWeapon && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <div className="flex items-center space-x-3 text-amber-400 mb-4 pb-2 border-b border-slate-800">
              <Info className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-100">Arma em Trânsito</h3>
                <p className="text-xs text-slate-400">Detalhamento do policial em posse do armamento</p>
              </div>
            </div>

            <div className="space-y-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400">Arma:</span>
                <p className="font-bold text-amber-400 text-sm">{selectedWeapon.type} {selectedWeapon.model} ({selectedWeapon.serialNumber})</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400">Policial com a arma:</span>
                <p className="font-bold text-slate-100 text-sm">{transitMovement.requesterName}</p>
                <p className="text-slate-400 font-mono">MASP: {transitMovement.requesterMasp}</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400">Data e hora da retirada:</span>
                <p className="font-mono text-slate-200 font-bold">{formatTimestamp(transitMovement.approvalDate || transitMovement.createdAt)}</p>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400">Autorizado por:</span>
                <p className="font-bold text-emerald-400">{transitMovement.approvedByUserName || 'N/A'}</p>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between text-slate-300 font-mono">
                <span>Munições levadas: <strong>{transitMovement.ammunitionCount}</strong></span>
                <span>Carregadores: <strong>{transitMovement.magazineCount}</strong></span>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setShowTransitDetailModal(false)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Armas Disponíveis Modal - Geral */}
      {showAvailableWeaponsModal && isGeral && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2 text-amber-400">
                <Layers className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-100">Armas Disponíveis - Tipos e Modelos</h3>
              </div>
              <button
                onClick={() => setShowAvailableWeaponsModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold"
              >
                &times;
              </button>
            </div>

            {wtSuccessMsg && (
              <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{wtSuccessMsg}</span>
              </div>
            )}

            {wtErrorMsg && (
              <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{wtErrorMsg}</span>
              </div>
            )}

            {/* Form de Tipo de Arma */}
            <form onSubmit={handleCreateOrUpdateWeaponType} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
              <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                {editingWeaponTypeId ? 'Editar Tipo de Arma' : 'Cadastrar Novo Tipo de Arma'}
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={typeNameInput}
                  onChange={(e) => setTypeNameInput(e.target.value)}
                  placeholder="Ex: Fuzil, Pistola, Submetralhadora, Carabina..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  required
                />
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shrink-0 shadow"
                >
                  {editingWeaponTypeId ? 'Atualizar' : 'Cadastrar Tipo'}
                </button>
                {editingWeaponTypeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingWeaponTypeId(null);
                      setTypeNameInput('');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 px-2"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {/* Lista de Tipos e seus Modelos */}
            <div className="space-y-4">
              {availableWeaponTypes.map((wt) => (
                <div key={wt.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                      <span className="text-amber-400">{wt.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({wt.models.length} modelos)</span>
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setEditingWeaponTypeId(wt.id);
                          setTypeNameInput(wt.name);
                        }}
                        className="p-1 text-slate-400 hover:text-amber-400 transition"
                        title="Editar Nome do Tipo"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteWeaponType(wt.id, wt.name)}
                        className="p-1 text-slate-400 hover:text-red-400 transition"
                        title="Excluir Tipo de Arma"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* List of Models */}
                  <div className="flex flex-wrap gap-1.5">
                    {wt.models.length === 0 ? (
                      <span className="text-[11px] text-slate-500 italic">Nenhum modelo cadastrado para este tipo.</span>
                    ) : (
                      wt.models.map((modelName) => (
                        <span
                          key={modelName}
                          className="bg-slate-900 border border-slate-800 text-slate-200 text-xs px-2.5 py-1 rounded-lg font-mono flex items-center space-x-1.5"
                        >
                          <span>{modelName}</span>
                          <button
                            onClick={() => handleRemoveModelFromType(wt.id, modelName)}
                            className="text-slate-500 hover:text-red-400 ml-1 font-bold"
                            title="Remover Modelo"
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Add Model Input */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      value={newModelInputs[wt.id] || ''}
                      onChange={(e) => setNewModelInputs(prev => ({ ...prev, [wt.id]: e.target.value }))}
                      placeholder={`Adicionar novo modelo de ${wt.name}...`}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddModelToType(wt.id)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3 py-1.5 rounded-lg border border-slate-700 shrink-0"
                    >
                      + Modelo
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAvailableWeaponsModal(false)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
              >
                Concluído
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Transfer Weapon Modal (Armeiro, Administrador, Geral) */}
      {showTransferModal && canTransferWeapons && (
        <TransferWeaponModal
          currentUser={currentUser}
          weapons={weapons}
          departments={departments}
          units={units}
          vaultSpaces={vaultSpaces}
          initialWeapon={transferInitialWeapon}
          onClose={() => {
            setShowTransferModal(false);
            setTransferInitialWeapon(null);
          }}
          onSuccess={(createdTransfer) => {
            setShowTransferModal(false);
            setTransferInitialWeapon(null);
            onRefresh();
            setSuccessMsg(`Transferência registrada com sucesso sob protocolo ${createdTransfer.protocolNumber || createdTransfer.id}. A Guia de Trânsito / Recibo de Envio está pronta para impressão.`);
            if (createdTransfer) {
              setSelectedTransferForReceipt(createdTransfer);
            }
          }}
        />
      )}

      {/* Transfer Receipt Modal (PDF / Print) */}
      {selectedTransferForReceipt && (
        <TransferReceiptModal
          transfer={selectedTransferForReceipt}
          onClose={() => setSelectedTransferForReceipt(null)}
        />
      )}

      {/* Transfer History Modal */}
      {showTransferHistoryModal && canTransferWeapons && (
        <TransferHistoryModal
          transfers={weaponTransfers}
          currentUser={currentUser}
          onClose={() => setShowTransferHistoryModal(false)}
          onSelectTransfer={(trf) => setSelectedTransferForReceipt(trf)}
          onReceiveTransfer={(trf) => setTransferToReceive(trf)}
          onRefresh={onRefresh}
          onOpenNewTransfer={() => {
            setTransferInitialWeapon(null);
            setShowTransferModal(true);
          }}
        />
      )}

      {/* Receive Transfer Modal */}
      {transferToReceive && (
        <ReceiveTransferModal
          transfer={transferToReceive}
          vaultSpaces={vaultSpaces}
          currentUser={currentUser}
          onClose={() => setTransferToReceive(null)}
          onSuccess={(receivedTransfer) => {
            setTransferToReceive(null);
            onRefresh();
            setSuccessMsg('Transferência recebida com sucesso! O armamento foi incorporado ao cofre da unidade de destino e o recibo está disponível para impressão.');
            if (receivedTransfer) {
              setSelectedTransferForReceipt(receivedTransfer);
            }
          }}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetWeapon}
        title="Confirmar Exclusão de Arma"
        message={`Deseja realmente apagar permanentemente a arma ${deleteTargetWeapon?.manufacturer} ${deleteTargetWeapon?.model} (Série: ${deleteTargetWeapon?.serialNumber}) do sistema?`}
        onConfirm={confirmExecuteDeleteWeapon}
        onCancel={() => setDeleteTargetWeapon(null)}
      />

      {/* Print Arsenal Modal */}
      {showPrintArsenalModal && (
        <PrintArsenalModal
          currentUser={currentUser}
          weapons={weapons}
          departments={departments}
          units={units}
          vaultSpaces={vaultSpaces}
          initialUnitId={selectedUnitId}
          initialDeptId={selectedDeptId}
          onClose={() => setShowPrintArsenalModal(false)}
        />
      )}

    </div>
  );
};
