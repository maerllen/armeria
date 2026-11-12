import React, { useState, useMemo, useEffect } from 'react';
import { 
  User, Department, Unit, VaultSpace, Caliber, AmmunitionStock, 
  AmmunitionMovement, AmmoTransfer, isUserExplosivista, getSystemLogo 
} from '../types';
import { storage } from '../services/storage';
import { printDocumentInPage } from '../utils/printHelper';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { ModalTransferirMunicao } from './ModalTransferirMunicao';
import { ModalHistoricoTransferenciasMunicao } from './ModalHistoricoTransferenciasMunicao';
import { AmmunitionReceiptModal } from './ModalReciboMunicao';
import { 
  Disc, Plus, Search, Building, Vault, ArrowRightLeft, Printer, 
  Trash2, Edit2, History, RotateCcw, AlertTriangle, Check, X, 
  ChevronRight, Layers, Package, Send, CheckCircle2, ArrowDownCircle, 
  ArrowUpCircle, FileText, Sparkles, Filter, Clock, SlidersHorizontal
} from 'lucide-react';

interface AmmunitionModuleProps {
  currentUser: User;
  calibers: Caliber[];
  stocks: AmmunitionStock[];
  movements: AmmunitionMovement[];
  vaultSpaces: VaultSpace[];
  departments: Department[];
  units: Unit[];
  users?: User[];
  onRefresh: () => void;
}

export const AmmunitionModule: React.FC<AmmunitionModuleProps> = ({
  currentUser,
  calibers,
  stocks,
  movements,
  vaultSpaces,
  departments,
  units,
  users = [],
  onRefresh
}) => {
  // Roles & permissions
  const role = currentUser.activeRole || currentUser.role;
  const isGeral = role === 'Geral';
  const isAdmin = role === 'Administrador' || (role as string) === 'Administrativo';
  const isArmeiro = role === 'Armeiro';
  const isPolicial = role === 'Policial';
  const isExplosivista = isUserExplosivista(currentUser);
  const canManage = isGeral || isAdmin || isArmeiro || (isPolicial && currentUser.canMoveAmmunition);

  // Search filter across all ammo fields
  const [searchTerm, setSearchTerm] = useState('');

  // Granular Filters requested by User: Cofre, Calibre, Destinação
  const [filterVaultId, setFilterVaultId] = useState<string>('ALL');
  const [filterCaliberId, setFilterCaliberId] = useState<string>('ALL');
  const [filterDestinacao, setFilterDestinacao] = useState<string>('ALL');

  // Department & Unit selection
  const [selectedDeptId, setSelectedDeptId] = useState<string>(() => {
    if (isGeral) {
      return departments[0]?.id || '';
    }
    return currentUser.departmentId || departments[0]?.id || '';
  });

  // Available units for the selected department
  const availableUnits = useMemo(() => {
    if (!selectedDeptId || selectedDeptId === 'ALL') {
      return units;
    }
    return units.filter(u => u.departmentId === selectedDeptId);
  }, [units, selectedDeptId]);

  // Selected Unit - RULE: No "Todas as Unidades", only specific unit
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    if (currentUser.unitId && availableUnits.some(u => u.id === currentUser.unitId)) {
      return currentUser.unitId;
    }
    return availableUnits[0]?.id || '';
  });

  // Keep selectedUnitId synchronized and valid whenever department or availableUnits change
  useEffect(() => {
    if (availableUnits.length > 0) {
      const stillValid = availableUnits.some(u => u.id === selectedUnitId);
      if (!stillValid) {
        if (currentUser.unitId && availableUnits.some(u => u.id === currentUser.unitId)) {
          setSelectedUnitId(currentUser.unitId);
        } else {
          setSelectedUnitId(availableUnits[0].id);
        }
      }
    } else {
      setSelectedUnitId('');
    }
  }, [availableUnits, selectedDeptId]);

  // Reset granular filters on department or unit change
  useEffect(() => {
    setFilterVaultId('ALL');
    setFilterCaliberId('ALL');
    setFilterDestinacao('ALL');
    setSearchTerm('');
  }, [selectedDeptId, selectedUnitId]);

  const selectedDepartmentObj = useMemo(() => {
    return departments.find(d => d.id === selectedDeptId);
  }, [departments, selectedDeptId]);

  const selectedUnitObj = useMemo(() => {
    return units.find(u => u.id === selectedUnitId);
  }, [units, selectedUnitId]);

  // Candidate vaults for ammunition (MUST be type MUNIÇÕES and match selected unit)
  const candidateAmmoVaults = useMemo(() => {
    return vaultSpaces.filter(v => {
      if (v.type !== 'MUNIÇÕES') return false;
      if (selectedUnitId) {
        return v.unitId === selectedUnitId;
      }
      if (selectedDeptId && selectedDeptId !== 'ALL') {
        return v.departmentId === selectedDeptId;
      }
      return true;
    });
  }, [vaultSpaces, selectedUnitId, selectedDeptId]);

  // Available Caliber + Tipo options present in this unit's stocks for filter dropdown
  // REGRA DO USUÁRIO: "o filtro 'Calibre da Munição:' deve conter além do calibre, o tipo da munição"
  const availableCaliberOptionsInUnit = useMemo(() => {
    const optionsMap = new Map<string, { key: string; caliberId: string; caliberName: string; tipo: string; label: string }>();

    const unitStocks = stocks.filter(s => (!selectedUnitId || s.unitId === selectedUnitId));

    unitStocks.forEach(s => {
      const cal = calibers.find(c => c.id === s.caliberId);
      const calName = cal?.name || 'Munição';
      const tipo = (s.tipoMunicao || cal?.tipo || '').trim();
      const key = tipo ? `${s.caliberId}:::${tipo}` : s.caliberId;
      const label = tipo ? `${calName} - ${tipo}` : calName;

      if (!optionsMap.has(key)) {
        optionsMap.set(key, {
          key,
          caliberId: s.caliberId,
          caliberName: calName,
          tipo,
          label
        });
      }
    });

    // If unit has no stocks registered yet, fallback to catalog calibers
    if (optionsMap.size === 0) {
      calibers.forEach(c => {
        const tipo = (c.tipo || '').trim();
        const key = tipo ? `${c.id}:::${tipo}` : c.id;
        const label = tipo ? `${c.name} - ${tipo}` : c.name;
        if (!optionsMap.has(key)) {
          optionsMap.set(key, {
            key,
            caliberId: c.id,
            caliberName: c.name,
            tipo,
            label
          });
        }
      });
    }

    return Array.from(optionsMap.values()).sort((a, b) => 
      a.caliberName.localeCompare(b.caliberName) || a.tipo.localeCompare(b.tipo)
    );
  }, [calibers, stocks, selectedUnitId]);

  // Available Destinações present in stocks for filter dropdown
  const availableDestinacoes = useMemo(() => {
    const set = new Set<string>();
    stocks
      .filter(s => (!selectedUnitId || s.unitId === selectedUnitId))
      .forEach(s => {
        if (s.destinacao) set.add(s.destinacao);
      });
    if (set.size === 0) {
      set.add('Treinamento');
      set.add('Operacional');
      set.add('Reserva');
      set.add('Curso de Formação');
    }
    return Array.from(set);
  }, [stocks, selectedUnitId]);

  // Check if any filter is currently active
  // USER REQUIREMENT: "sempre que um filtro tiver ativado os cofres que não possuírem registros devem ficar invisíveis"
  const hasActiveFilter = Boolean(
    searchTerm.trim() || 
    filterVaultId !== 'ALL' || 
    filterCaliberId !== 'ALL' || 
    filterDestinacao !== 'ALL'
  );

  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterVaultId('ALL');
    setFilterCaliberId('ALL');
    setFilterDestinacao('ALL');
  };

  // Alerts
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingStock, setEditingStock] = useState<AmmunitionStock | null>(null);
  
  // Stock Form State
  const [stockCaliberId, setStockCaliberId] = useState('');
  const [stockVaultId, setStockVaultId] = useState('');
  const [stockQuantity, setStockQuantity] = useState<number>(0);
  const [stockFabricante, setStockFabricante] = useState('');
  const [stockTipo, setStockTipo] = useState('');
  const [stockPeso, setStockPeso] = useState('');
  const [stockLote, setStockLote] = useState('');
  const [stockAno, setStockAno] = useState<string | number>(new Date().getFullYear());
  const [stockDestinacao, setStockDestinacao] = useState('Treinamento');
  const [stockInfo, setStockInfo] = useState('');
  
  // Internal Vault Transfer during Stock Edit
  const [transferTargetVaultId, setTransferTargetVaultId] = useState('');
  const [transferStockQuantity, setTransferStockQuantity] = useState<number>(0);
  const [transferStockObservation, setTransferStockObservation] = useState('');

  // Delete Confirm Modal State
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    type: 'stock' | 'caliber' | 'movement';
    id: string;
    message: string;
  }>({
    isOpen: false,
    type: 'stock',
    id: '',
    message: ''
  });

  // Caliber Modal State
  const [showCaliberModal, setShowCaliberModal] = useState(false);
  const [editingCaliber, setEditingCaliber] = useState<Caliber | null>(null);
  const [calName, setCalName] = useState('');
  const [calFabricante, setCalFabricante] = useState('');
  const [calTipo, setCalTipo] = useState('');
  const [calPeso, setCalPeso] = useState('');

  // Movement Modal State
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movType, setMovType] = useState<'Entrada' | 'Saída'>('Saída');
  const [movStockId, setMovStockId] = useState('');
  const [movQuantity, setMovQuantity] = useState<number>(1);
  const [movReason, setMovReason] = useState('Treinamento Operacional');
  const [movRespType, setMovRespType] = useState<'SISTEMA' | 'FORA_DO_SISTEMA'>('SISTEMA');
  const [movRespUserId, setMovRespUserId] = useState('');
  const [movRespName, setMovRespName] = useState('');
  const [movRespMasp, setMovRespMasp] = useState('');
  const [movObs, setMovObs] = useState('');
  const [movStockObs, setMovStockObs] = useState('');

  // Movement Receipt Modal State
  const [selectedMovForReceipt, setSelectedMovForReceipt] = useState<AmmunitionMovement | null>(null);

  // Return Unused Ammo Modal State
  const [returnTargetMov, setReturnTargetMov] = useState<AmmunitionMovement | null>(null);
  const [returnQtyInput, setReturnQtyInput] = useState<number>(0);

  // Transfer Modals State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [stockToTransferInitially, setStockToTransferInitially] = useState<AmmunitionStock | null>(null);

  // Movements History Drawer / Toggle
  const [showMovementsSection, setShowMovementsSection] = useState(false);

  // Print Vaults Report Modal State
  const [showPrintVaultSelectModal, setShowPrintVaultSelectModal] = useState(false);
  const [printEmptyVaultsOption, setPrintEmptyVaultsOption] = useState<'somente_com_municoes' | 'todos_inclusive_vazios'>('somente_com_municoes');
  const [selectedVaultIdsForReport, setSelectedVaultIdsForReport] = useState<string[]>([]);

  // When print modal opens or printEmptyVaultsOption changes, recalculate selected vault IDs
  useEffect(() => {
    if (!showPrintVaultSelectModal) return;

    if (printEmptyVaultsOption === 'somente_com_municoes') {
      const vaultsWithAmmo = candidateAmmoVaults.filter(v => {
        const total = stocks
          .filter(s => s.vaultSpaceId === v.id)
          .reduce((sum, s) => sum + s.quantity, 0);
        return total > 0;
      });
      setSelectedVaultIdsForReport(vaultsWithAmmo.map(v => v.id));
    } else {
      setSelectedVaultIdsForReport(candidateAmmoVaults.map(v => v.id));
    }
  }, [showPrintVaultSelectModal, printEmptyVaultsOption, candidateAmmoVaults, stocks]);

  // Comprehensive Search and Granular Filtering across all ammunition fields
  const filteredStocks = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return stocks.filter(stock => {
      // Must belong to candidate vaults or unit
      if (selectedUnitId && stock.unitId !== selectedUnitId) return false;
      if (selectedDeptId && selectedDeptId !== 'ALL' && stock.departmentId !== selectedDeptId) return false;

      // Filter: Cofre
      if (filterVaultId !== 'ALL' && stock.vaultSpaceId !== filterVaultId) return false;

      // Filter: Calibre e Tipo da Munição
      if (filterCaliberId !== 'ALL') {
        if (filterCaliberId.includes(':::')) {
          const [targetCalId, targetTipo] = filterCaliberId.split(':::');
          if (stock.caliberId !== targetCalId) return false;
          if (targetTipo) {
            const stockTipo = (stock.tipoMunicao || calibers.find(c => c.id === stock.caliberId)?.tipo || '').trim().toLowerCase();
            if (stockTipo !== targetTipo.trim().toLowerCase()) return false;
          }
        } else {
          if (stock.caliberId !== filterCaliberId) return false;
        }
      }

      // Filter: Destinação
      if (filterDestinacao !== 'ALL') {
        const d = (stock.destinacao || 'Treinamento').toLowerCase();
        if (d !== filterDestinacao.toLowerCase()) return false;
      }

      if (!q) return true;

      const caliber = calibers.find(c => c.id === stock.caliberId);
      const vault = vaultSpaces.find(v => v.id === stock.vaultSpaceId);
      const unit = units.find(u => u.id === stock.unitId);
      const dept = departments.find(d => d.id === stock.departmentId);

      const searchFields = [
        caliber?.name || '',
        caliber?.fabricante || '',
        caliber?.tipo || '',
        stock.fabricante || '',
        stock.tipoMunicao || '',
        stock.pesoMunicao || '',
        stock.loteMunicao || '',
        String(stock.anoFabricacao || ''),
        stock.destinacao || '',
        stock.additionalInfo || '',
        vault?.code || '',
        unit?.name || '',
        dept?.name || '',
        String(stock.quantity)
      ].map(f => f.toLowerCase());

      return searchFields.some(field => field.includes(q));
    });
  }, [stocks, selectedUnitId, selectedDeptId, searchTerm, filterVaultId, filterCaliberId, filterDestinacao, calibers, vaultSpaces, units, departments]);

  // Group filtered stocks by vault
  const stocksByVault = useMemo(() => {
    const map = new Map<string, AmmunitionStock[]>();
    candidateAmmoVaults.forEach(v => {
      map.set(v.id, []);
    });
    filteredStocks.forEach(s => {
      const list = map.get(s.vaultSpaceId) || [];
      list.push(s);
      map.set(s.vaultSpaceId, list);
    });
    return map;
  }, [candidateAmmoVaults, filteredStocks]);

  // USER REQUIREMENT: "sempre que um filtro tiver ativado os cofres que não possuírem registros devem ficar invisíveis"
  const visibleVaults = useMemo(() => {
    return candidateAmmoVaults.filter(vault => {
      // If a specific cofre is selected in filter, match only that one
      if (filterVaultId !== 'ALL' && vault.id !== filterVaultId) {
        return false;
      }
      const items = stocksByVault.get(vault.id) || [];
      if (hasActiveFilter) {
        return items.length > 0;
      }
      return true;
    });
  }, [candidateAmmoVaults, filterVaultId, stocksByVault, hasActiveFilter]);

  // Pending Incoming Ammo Transfers for the badge
  const pendingTransfers = useMemo(() => {
    return storage.getPendingIncomingAmmoTransfers(currentUser);
  }, [currentUser, stocks]);

  const allAmmoTransfers = useMemo(() => {
    return storage.getAmmoTransfers(currentUser, selectedUnitId || undefined);
  }, [currentUser, selectedUnitId, stocks]);

  // Total ammunition count in current unit view
  const totalAmmoInView = useMemo(() => {
    return filteredStocks.reduce((sum, s) => sum + s.quantity, 0);
  }, [filteredStocks]);

  // --- Handlers: Stock CRUD & Internal Transfer ---

  const handleOpenAddStock = (preselectedVaultId?: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditingStock(null);
    setStockCaliberId(calibers[0]?.id || '');
    setStockVaultId(preselectedVaultId || candidateAmmoVaults[0]?.id || '');
    setStockQuantity(100);
    setStockFabricante('CBC');
    setStockTipo('Treino');
    setStockPeso('124 gr');
    setStockLote('');
    setStockAno(new Date().getFullYear());
    setStockDestinacao('Treinamento');
    setStockInfo('');
    setTransferTargetVaultId('');
    setTransferStockQuantity(0);
    setTransferStockObservation('');
    setShowStockModal(true);
  };

  const handleOpenEditStock = (stock: AmmunitionStock) => {
    setErrorMsg('');
    setSuccessMsg('');
    setEditingStock(stock);
    setStockCaliberId(stock.caliberId);
    setStockVaultId(stock.vaultSpaceId);
    setStockQuantity(stock.quantity);
    setStockFabricante(stock.fabricante || '');
    setStockTipo(stock.tipoMunicao || '');
    setStockPeso(stock.pesoMunicao || '');
    setStockLote(stock.loteMunicao || '');
    setStockAno(stock.anoFabricacao || new Date().getFullYear());
    setStockDestinacao(stock.destinacao || 'Treinamento');
    setStockInfo(stock.observacaoEstoqueMunicao || stock.observacao || stock.additionalInfo || '');
    setTransferTargetVaultId('');
    setTransferStockQuantity(0);
    setTransferStockObservation('');
    setShowStockModal(true);
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!stockVaultId) {
      setErrorMsg('Selecione um cofre de munições válido.');
      return;
    }
    if (!stockCaliberId) {
      setErrorMsg('Selecione o calibre da munição.');
      return;
    }
    if (stockQuantity < 0) {
      setErrorMsg('A quantidade não pode ser negativa.');
      return;
    }

    try {
      if (editingStock) {
        // Editing existing stock and optionally transferring to another vault
        await storage.updateAmmoStock(
          editingStock.id,
          {
            quantity: Number(stockQuantity),
            caliberId: stockCaliberId,
            fabricante: stockFabricante,
            tipoMunicao: stockTipo,
            pesoMunicao: stockPeso,
            loteMunicao: stockLote,
            anoFabricacao: stockAno,
            destinacao: stockDestinacao,
            additionalInfo: stockInfo,
            observacao: stockInfo,
            observacaoEstoqueMunicao: stockInfo,
            targetVaultSpaceId: transferTargetVaultId || undefined,
            transferQuantity: transferTargetVaultId && transferStockQuantity > 0 ? Number(transferStockQuantity) : undefined,
            transferObservation: transferStockObservation || undefined
          },
          currentUser
        );
        setSuccessMsg(
          transferTargetVaultId && transferStockQuantity > 0
            ? `Munição atualizada e ${transferStockQuantity} unidade(s) transferida(s) para o novo cofre com sucesso!`
            : 'Munição atualizada com sucesso!'
        );
      } else {
        // Adding new stock via movement Entrada
        await storage.addAmmoMovement({
          type: 'Entrada',
          caliberId: stockCaliberId,
          quantity: Number(stockQuantity),
          vaultSpaceId: stockVaultId,
          recipientOrReason: 'Abastecimento Inicial / Cadastro de Estoque',
          fabricante: stockFabricante,
          tipoMunicao: stockTipo,
          pesoMunicao: stockPeso,
          loteMunicao: stockLote,
          anoFabricacao: stockAno,
          destinacao: stockDestinacao,
          observation: stockInfo || 'Cadastro no sistema',
          observacaoEstoqueMunicao: stockInfo,
          stockObservation: stockInfo
        });
        setSuccessMsg('Munição adicionada ao estoque com sucesso!');
      }

      setShowStockModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar informações da munição.');
    }
  };

  const handleConfirmDelete = async () => {
    try {
      if (deleteConfirmState.type === 'stock') {
        await storage.deleteAmmoStock(deleteConfirmState.id, currentUser);
        setSuccessMsg('Registro de estoque de munição excluído com sucesso.');
      } else if (deleteConfirmState.type === 'caliber') {
        await storage.deleteCaliber(deleteConfirmState.id);
        setSuccessMsg('Calibre excluído com sucesso.');
      } else if (deleteConfirmState.type === 'movement') {
        await storage.deleteAmmoMovement(deleteConfirmState.id, currentUser);
        setSuccessMsg('Registro de movimentação excluído com sucesso.');
      }
      setDeleteConfirmState({ isOpen: false, type: 'stock', id: '', message: '' });
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
      setDeleteConfirmState({ isOpen: false, type: 'stock', id: '', message: '' });
    }
  };

  // --- Handlers: Caliber Management ---

  const handleOpenAddCaliber = () => {
    setEditingCaliber(null);
    setCalName('');
    setCalFabricante('CBC');
    setCalTipo('Operacional');
    setCalPeso('124 gr');
    setShowCaliberModal(true);
  };

  const handleOpenEditCaliber = (cal: Caliber) => {
    setEditingCaliber(cal);
    setCalName(cal.name);
    setCalFabricante(cal.fabricante || 'CBC');
    setCalTipo(cal.tipo || 'Operacional');
    setCalPeso(cal.peso || '');
    setShowCaliberModal(true);
  };

  const handleSaveCaliber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calName.trim()) {
      setErrorMsg('Informe o nome/descrição do calibre.');
      return;
    }
    try {
      if (editingCaliber) {
        await storage.updateCaliber(editingCaliber.id, calName.trim(), calFabricante, calTipo, calPeso);
        setSuccessMsg('Calibre atualizado com sucesso.');
      } else {
        await storage.addCaliber(calName.trim(), calFabricante, calTipo, calPeso);
        setSuccessMsg('Calibre cadastrado com sucesso.');
      }
      setShowCaliberModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar calibre.');
    }
  };

  // --- Handlers: Quick Movement (Entrada / Saída) ---

  const handleOpenMovementModal = (stock?: AmmunitionStock, preselectedType: 'Entrada' | 'Saída' = 'Saída') => {
    setErrorMsg('');
    setSuccessMsg('');
    const target = stock || stocks[0];
    setMovStockId(target?.id || '');
    setMovQuantity(preselectedType === 'Saída' ? Math.min(50, target?.quantity || 50) : 100);
    setMovReason(preselectedType === 'Saída' ? 'Treinamento Tático' : 'Reabastecimento de Cofre');
    setMovRespType('SISTEMA');
    setMovRespUserId(currentUser.id);
    setMovRespName(currentUser.name);
    setMovRespMasp(currentUser.masp);
    setMovObs('');
    setMovStockObs(target?.observacaoEstoqueMunicao || target?.observacao || target?.additionalInfo || '');
    setShowMovementModal(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const targetStock = stocks.find(s => s.id === movStockId);
    if (!targetStock) {
      setErrorMsg('Selecione a munição em estoque.');
      return;
    }

    if (movQuantity <= 0) {
      setErrorMsg('A quantidade deve ser maior que zero.');
      return;
    }

    if (movType === 'Saída' && movQuantity > targetStock.quantity) {
      setErrorMsg(`Quantidade insuficiente no cofre. Disponível: ${targetStock.quantity} unidades.`);
      return;
    }

    const finalRespName = movRespType === 'SISTEMA' 
      ? (users.find(u => u.id === movRespUserId)?.name || currentUser.name)
      : movRespName;
    const finalRespMasp = movRespType === 'SISTEMA'
      ? (users.find(u => u.id === movRespUserId)?.masp || currentUser.masp)
      : movRespMasp;

    try {
      const createdMov = await storage.addAmmoMovement({
        type: movType,
        caliberId: targetStock.caliberId,
        quantity: Number(movQuantity),
        vaultSpaceId: targetStock.vaultSpaceId,
        recipientOrReason: movReason,
        fabricante: targetStock.fabricante,
        tipoMunicao: targetStock.tipoMunicao,
        pesoMunicao: targetStock.pesoMunicao,
        loteMunicao: targetStock.loteMunicao,
        anoFabricacao: targetStock.anoFabricacao,
        destinacao: targetStock.destinacao,
        responsibleType: movRespType,
        responsibleUserId: movRespType === 'SISTEMA' ? movRespUserId : undefined,
        responsibleName: finalRespName,
        responsibleMasp: finalRespMasp,
        observation: movObs,
        observacaoEstoqueMunicao: movStockObs,
        stockObservation: movStockObs
      });

      // Atualiza a observação da munição no estoque caso tenha sido alterada na movimentação
      const currentObs = targetStock.observacaoEstoqueMunicao || targetStock.additionalInfo || targetStock.observacao || '';
      if (movStockObs !== currentObs) {
        await storage.updateAmmoStock(
          targetStock.id,
          {
            quantity: movType === 'Saída' ? Math.max(0, targetStock.quantity - Number(movQuantity)) : targetStock.quantity,
            observacaoEstoqueMunicao: movStockObs,
            additionalInfo: movStockObs,
            observacao: movStockObs
          },
          currentUser
        );
      }

      setSuccessMsg(`Movimentação de ${movType} de ${movQuantity} munição(ões) registrada com sucesso!`);
      setShowMovementModal(false);
      onRefresh();
      
      // Auto-open receipt modal
      setSelectedMovForReceipt(createdMov);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação.');
    }
  };

  // --- Handlers: Return Unused Ammo ---

  const handleOpenReturnModal = (mov: AmmunitionMovement) => {
    setReturnTargetMov(mov);
    const maxCanReturn = mov.quantity - (mov.returnedQuantity || 0);
    setReturnQtyInput(maxCanReturn > 0 ? maxCanReturn : 0);
  };

  const handleSaveReturnAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetMov) return;
    if (returnQtyInput <= 0) {
      setErrorMsg('A quantidade a devolver deve ser maior que zero.');
      return;
    }
    const maxCanReturn = returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0);
    if (returnQtyInput > maxCanReturn) {
      setErrorMsg(`Quantidade máxima permitida para devolução é de ${maxCanReturn} munições.`);
      return;
    }

    try {
      await storage.returnUnusedAmmo(returnTargetMov.id, Number(returnQtyInput));
      setSuccessMsg(`Devolução de ${returnQtyInput} munição(ões) registrada com sucesso.`);
      setReturnTargetMov(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar devolução.');
    }
  };

  // --- Handlers: Printing Reports ---

  /**
   * Imprime Relatório Consolidado de Munições por Cofre
   * REGRA DO USUÁRIO:
   * 1. Pergunta se deseja imprimir locais de cofres vazios ou somente os com munições.
   * 2. Imprime um relatório por vez (cada cofre em uma página separada).
   * 3. TODAS as páginas devem conter a assinatura do armeiro, logo abaixo do texto certificador!
   */
  const handlePrintUnitAmmoReport = () => {
    if (selectedVaultIdsForReport.length === 0) {
      setErrorMsg('Selecione ao menos um cofre para imprimir o relatório.');
      return;
    }

    const systemLogo = getSystemLogo(selectedUnitObj, selectedDepartmentObj);
    const emitDate = new Date().toLocaleString('pt-BR');

    const vaultsToPrint = candidateAmmoVaults.filter(v => selectedVaultIdsForReport.includes(v.id));

    if (vaultsToPrint.length === 0) {
      setErrorMsg('Nenhum cofre selecionado para impressão.');
      return;
    }

    const pagesHtml = vaultsToPrint.map((vault, idx) => {
      const vaultStocks = stocks.filter(s => s.vaultSpaceId === vault.id);
      const totalQuantity = vaultStocks.reduce((sum, s) => sum + s.quantity, 0);

      const rowsHtml = vaultStocks.length > 0
        ? vaultStocks.map(stock => {
            const cal = calibers.find(c => c.id === stock.caliberId);
            const obs = stock.observacaoEstoqueMunicao || stock.additionalInfo || stock.observacao || '-';
            return `
              <tr>
                <td style="font-weight: bold;">${cal?.name || 'Munição'}</td>
                <td>${stock.fabricante || '-'} / ${stock.loteMunicao || 'S/L'}</td>
                <td>${stock.tipoMunicao || '-'} ${stock.pesoMunicao ? `(${stock.pesoMunicao})` : ''}</td>
                <td>${stock.anoFabricacao || '-'} / ${stock.destinacao || 'Operacional'}</td>
                <td style="font-size: 10px; color: #334155;">${obs}</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${stock.quantity}</td>
              </tr>
            `;
          }).join('')
        : `
          <tr>
            <td colspan="6" style="text-align: center; color: #64748b; padding: 16px; font-style: italic;">
              Nenhuma munição armazenada neste cofre no momento (Cofre Vazio).
            </td>
          </tr>
        `;

      return `
        <div class="vault-report-page ${idx < vaultsToPrint.length - 1 ? 'page-break' : ''}">
          <div class="header">
            <div style="display: flex; align-items: center; gap: 14px;">
              <img src="${systemLogo}" alt="Logo" style="height: 55px; width: auto; object-fit: contain;" />
              <div>
                <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
                <div class="subtitle">${selectedDepartmentObj?.name || 'Departamento de Polícia Civil'}</div>
                <div class="subtitle" style="font-size: 10px; color: #475569;">${selectedUnitObj?.name || 'Unidade Policial'}</div>
              </div>
            </div>
            <div class="badge">
              INVENTÁRIO DE COFRE<br>
              <span style="font-size: 11px; color: #000;">COFRE: ${vault.code}</span>
            </div>
          </div>

          <div class="meta-box">
            <div class="meta-item">
              <label>Local / Código do Cofre</label>
              <span>${vault.code} (${vault.type})</span>
            </div>
            <div class="meta-item">
              <label>Unidade Policial</label>
              <span>${selectedUnitObj?.name || '-'}</span>
            </div>
            <div class="meta-item">
              <label>Data e Hora da Emissão</label>
              <span>${emitDate}</span>
            </div>
            <div class="meta-item">
              <label>Armeiro Emitente</label>
              <span>${currentUser.name} (MASP: ${currentUser.masp || '-'})</span>
            </div>
          </div>

          <div class="section-title">DETALHAMENTO DO ESTOQUE DE MUNIÇÕES NO COFRE</div>
          <table class="detail-table">
            <thead>
              <tr style="background: #f1f5f9; text-align: left; font-size: 10px; text-transform: uppercase;">
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">Calibre</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">Fabricante / Lote</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">Tipo / Peso</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">Ano / Destinação</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1;">Observações</th>
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right;">Qtd (un)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: bold;">
                <td colspan="5" style="padding: 8px 10px; text-align: right; text-transform: uppercase;">Total de Munições no Cofre:</td>
                <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-size: 12px;">${totalQuantity} un</td>
              </tr>
            </tfoot>
          </table>

          <!-- TEXTO CERTIFICADOR EXATO SOLICITADO -->
          <div class="info-footer-box">
            Certifico que o inventário acima reflete fielmente o material bélico (munições) sob guarda no espaço do cofre ${vault.code} na presente data, conforme conferência física realizada pelo armeiro responsável.
          </div>

          <!-- ASSINATURA DO ARMEIRO: PRESENTE EM TODAS AS PÁGINAS, LOGO ABAIXO DO TEXTO CERTIFICADOR -->
          <div class="signatures">
            <div class="sig-box">
              <div class="sig-line"></div>
              <div class="sig-name">${currentUser.name}</div>
              <div class="sig-role">MASP: ${currentUser.masp || 'Armeiro'} - Armeiro / Responsável pelo Material Bélico</div>
            </div>
          </div>

          <div class="footer">
            Página ${idx + 1} de ${vaultsToPrint.length} • Relatório individual emitido via Sistema de Gestão Bélica da PCMG em ${emitDate}.
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Cofres de Munições - ${selectedUnitObj?.name || 'Unidade'}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
          }
          .vault-report-page {
            box-sizing: border-box;
            padding: 10px 0;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 10.5px; font-weight: 700; color: #374151; margin-top: 1px; }
          .badge {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 12px;
            border-radius: 4px;
            font-family: monospace;
            text-align: right;
            font-size: 9px;
            font-weight: bold;
          }
          .meta-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 16px;
          }
          .meta-item label { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; display: block; }
          .meta-item span { font-size: 11px; font-weight: bold; color: #0f172a; }
          .section-title {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: #0f172a;
            color: #fff;
            padding: 6px 10px;
            border-radius: 4px 4px 0 0;
            margin-top: 6px;
          }
          table.detail-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #cbd5e1;
            margin-bottom: 16px;
          }
          table.detail-table th, table.detail-table td {
            padding: 7px 10px;
            border: 1px solid #e2e8f0;
            font-size: 10.5px;
          }
          .info-footer-box {
            background: #f8fafc;
            border-left: 3px solid #0f172a;
            padding: 9px 13px;
            font-size: 10px;
            color: #1e293b;
            line-height: 1.45;
            margin-top: 14px;
            margin-bottom: 22px;
          }
          .signatures {
            margin-top: 20px;
            margin-bottom: 24px;
            display: flex;
            justify-content: center;
            text-align: center;
            page-break-inside: avoid;
          }
          .sig-box {
            width: 320px;
            max-width: 100%;
            text-align: center;
          }
          .sig-line {
            border-top: 1px solid #000;
            margin-bottom: 6px;
          }
          .sig-name {
            font-weight: bold;
            font-size: 11px;
            color: #0f172a;
          }
          .sig-role {
            font-size: 9.5px;
            color: #475569;
          }
          .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 8.5px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    setShowPrintVaultSelectModal(false);
    printDocumentInPage(html);
  };

  return (
    <div className="space-y-6">
      
      {/* Alert Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between text-red-400 text-sm animate-in fade-in">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="p-1 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-emerald-400 text-sm animate-in fade-in">
          <div className="flex items-center space-x-3">
            <Check className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="p-1 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Top Header - Classic layout matching ModuloArmas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
            <Disc className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              Módulo de Munições
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                PCMG
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Controle e rastreabilidade de munições, cofres e transferências da Polícia Civil
            </p>
          </div>
        </div>

        {/* Quick Actions Header Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <button
                onClick={() => handleOpenAddStock()}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-amber-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Munição</span>
              </button>

              <button
                onClick={() => handleOpenMovementModal(undefined, 'Saída')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700 flex items-center space-x-1.5"
              >
                <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                <span>Movimentação</span>
              </button>

              <button
                onClick={() => {
                  setStockToTransferInitially(null);
                  setShowTransferModal(true);
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700 flex items-center space-x-1.5"
              >
                <Send className="w-4 h-4 text-sky-400" />
                <span>Transferir Munições</span>
              </button>
            </>
          )}

          <button
            onClick={() => setShowTransferHistoryModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700 flex items-center space-x-1.5 relative"
          >
            <History className="w-4 h-4 text-slate-400" />
            <span>Histórico de Transferências</span>
            {pendingTransfers.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setShowPrintVaultSelectModal(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700 flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span>Imprimir Relatório</span>
          </button>

          <button
            onClick={handleOpenAddCaliber}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl border border-slate-800 transition"
            title="Catálogo de Calibres"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* STEP 1: Department Selection Grid / Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
          <Building className="w-4 h-4" />
          <span>1. Selecione o Departamento</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {isGeral && (
            <button
              onClick={() => setSelectedDeptId('ALL')}
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
                {stocks.reduce((acc, curr) => acc + curr.quantity, 0)} munições
              </span>
            </button>
          )}

          {departments.map((d) => {
            const isSelected = d.id === selectedDeptId;
            const deptStockCount = stocks.filter(s => s.departmentId === d.id).reduce((acc, curr) => acc + curr.quantity, 0);

            return (
              <button
                key={d.id}
                onClick={() => setSelectedDeptId(d.id)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/50 text-slate-100 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 block uppercase">{d.code || 'DEPTO'}</span>
                  <span className="text-xs font-bold block truncate" title={d.name}>{d.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {deptStockCount} munições
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2: Unit Selection for Selected Department
          CRITICAL USER REQUIREMENT:
          - NÃO deve ter a opção "Todas as unidades"
          - NÃO deve aparecer quantidade de lotes e nem total das munições no botão de filtro
          - Deve conter APENAS a abreviação/nome da unidade
      */}
      {selectedDeptId && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
              <ChevronRight className="w-4 h-4" />
              <span>2. Selecione a Unidade em <strong className="text-slate-100">{selectedDeptId === 'ALL' ? 'Todos os Departamentos' : (selectedDepartmentObj?.name || 'Departamento')}</strong></span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {availableUnits.length} unidade(s) disponível(is)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {availableUnits.map((u) => {
              const isSelected = u.id === selectedUnitId;

              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUnitId(u.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>{u.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: Ammo Search Bar & Filters */}
      {selectedUnitId ? (
        <div className="space-y-4">
          
          {/* Search Bar & Granular Filters: Cofre, Calibre, Destinação */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              
              {/* Comprehensive Search Bar across all ammunition fields */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar munição por calibre, fabricante, lote, tipo, peso, ano, destinação, cofre ou observação..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Total Summary */}
              <div className="flex items-center space-x-3 shrink-0">
                <div className="px-3 py-1.5 bg-slate-950/80 rounded-xl border border-slate-800 text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Munições em Estoque</span>
                  <span className="text-sm font-black text-amber-400 font-mono">
                    {totalAmmoInView.toLocaleString('pt-BR')} <span className="text-[10px] text-slate-400 font-normal">un</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMovementsSection(!showMovementsSection)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
                    showMovementsSection
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Histórico de Movimentações</span>
                </button>
              </div>

            </div>

            {/* Granular Filters: Cofre, Calibre, Destinação */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Filtros do Estoque (Cofre, Calibre, Destinação):</span>
                </span>

                {hasActiveFilter && (
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* 1. Filtro: Cofre */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Local / Cofre de Munição:
                  </label>
                  <select
                    value={filterVaultId}
                    onChange={(e) => setFilterVaultId(e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterVaultId !== 'ALL'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="ALL" className="bg-slate-900 text-slate-200">
                      Todos os Cofres da Unidade ({candidateAmmoVaults.length})
                    </option>
                    {candidateAmmoVaults.map(v => (
                      <option key={v.id} value={v.id} className="bg-slate-900 text-slate-200 font-mono">
                        Cofre {v.code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Filtro: Calibre */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Calibre da Munição:
                  </label>
                  <select
                    value={filterCaliberId}
                    onChange={(e) => setFilterCaliberId(e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterCaliberId !== 'ALL'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="ALL" className="bg-slate-900 text-slate-200">
                      Todos os Calibres
                    </option>
                    {availableCaliberOptionsInUnit.map(opt => (
                      <option key={opt.key} value={opt.key} className="bg-slate-900 text-slate-200">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Filtro: Destinação */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Destinação Operacional:
                  </label>
                  <select
                    value={filterDestinacao}
                    onChange={(e) => setFilterDestinacao(e.target.value)}
                    className={`w-full text-xs rounded-xl px-3 py-2 border transition focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      filterDestinacao !== 'ALL'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="ALL" className="bg-slate-900 text-slate-200">
                      Todas as Destinações
                    </option>
                    {availableDestinacoes.map(d => (
                      <option key={d} value={d} className="bg-slate-900 text-slate-200">
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Active Filter Badges */}
              {hasActiveFilter && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-semibold">Filtros ativos:</span>
                  {filterVaultId !== 'ALL' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Cofre: {candidateAmmoVaults.find(v => v.id === filterVaultId)?.code || filterVaultId}</span>
                      <button onClick={() => setFilterVaultId('ALL')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterCaliberId !== 'ALL' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>
                        Calibre: {availableCaliberOptionsInUnit.find(opt => opt.key === filterCaliberId)?.label || calibers.find(c => c.id === filterCaliberId)?.name || filterCaliberId}
                      </span>
                      <button onClick={() => setFilterCaliberId('ALL')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterDestinacao !== 'ALL' && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Destinação: {filterDestinacao}</span>
                      <button onClick={() => setFilterDestinacao('ALL')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {searchTerm && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <span>Busca: "{searchTerm}"</span>
                      <button onClick={() => setSearchTerm('')} className="hover:text-amber-100 ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Optional: Movimentações Recentes Drawer / Section */}
          {showMovementsSection && (
            <div className="glass-card rounded-2xl border border-slate-800 p-5 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <span>Últimas Movimentações Bélicas Registradas</span>
                </h3>
                <button
                  onClick={() => setShowMovementsSection(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  Fechar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Calibre / Lote</th>
                      <th className="py-2.5 px-3">Cofre</th>
                      <th className="py-2.5 px-3">Destinatário / Motivo</th>
                      <th className="py-2.5 px-3 text-right">Qtd</th>
                      <th className="py-2.5 px-3 text-center">Devolução</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {movements.slice(0, 10).map(mov => {
                      const cal = calibers.find(c => c.id === mov.caliberId);
                      const vault = vaultSpaces.find(v => v.id === mov.vaultSpaceId);
                      const isSaida = mov.type === 'Saída';
                      const returned = mov.returnedQuantity || 0;
                      const canReturn = isSaida && returned < mov.quantity;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-900/40 transition">
                          <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                            {new Date(mov.createdAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isSaida 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {mov.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-200">
                            <strong>{cal?.name || 'Munição'}</strong>
                            <span className="text-slate-500 ml-1.5 text-[11px] font-mono">
                              ({mov.loteMunicao || 'S/L'})
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300">
                            {vault?.code || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {mov.responsibleName || mov.recipientOrReason}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-100">
                            {mov.quantity} un
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isSaida ? (
                              returned > 0 ? (
                                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                  {returned} un devolvida(s)
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-mono">Pendente</span>
                              )
                            ) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {canReturn && canManage && (
                                <button
                                  onClick={() => handleOpenReturnModal(mov)}
                                  className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold transition flex items-center space-x-1"
                                  title="Registrar devolução de munição não deflagrada"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Devolver</span>
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedMovForReceipt(mov)}
                                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                                title="Imprimir Recibo"
                              >
                                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cofres de Munições da Unidade Selecionada
              CRITICAL USER REQUIREMENTS:
              1. Sempre que um filtro tiver ativado os cofres que não possuírem registros devem ficar invisíveis.
              2. As opções entrada e saída de munições não deve ficar visível no cofre.
              3. Layout restaurado da forma anterior da modificação de hoje.
          */}
          <div className="space-y-4">
            {candidateAmmoVaults.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center border border-slate-800 space-y-3">
                <Vault className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-slate-300">Nenhum cofre de munições encontrado nesta unidade</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Cadastre um local no cofre do tipo "MUNIÇÕES" no módulo de Cofres para gerenciar o estoque.
                </p>
              </div>
            ) : visibleVaults.length === 0 ? (
              <div className="glass-card rounded-2xl p-10 text-center border border-slate-800 space-y-3">
                <Disc className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-slate-300">Nenhum cofre com munições encontrado para os filtros selecionados</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Tente alterar ou limpar os filtros de cofre, calibre, destinação ou texto de busca.
                </p>
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl transition inline-flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar Filtros</span>
                </button>
              </div>
            ) : (
              visibleVaults.map(vault => {
                const vaultItems = stocksByVault.get(vault.id) || [];
                const vaultTotal = vaultItems.reduce((acc, curr) => acc + curr.quantity, 0);

                return (
                  <div key={vault.id} className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                    
                    {/* Vault Header */}
                    <div className="bg-slate-900/90 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                          <Vault className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-base font-bold text-slate-100 font-mono tracking-wide">
                              COFRE: {vault.code}
                            </h3>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {vault.type}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {vaultItems.length} lote(s) registrado(s)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right px-3 py-1.5 bg-slate-950/70 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-mono block">Munições no Cofre</span>
                          <span className="text-sm font-black text-amber-400 font-mono">{vaultTotal.toLocaleString('pt-BR')} un</span>
                        </div>

                        {canManage && (
                          <button
                            onClick={() => handleOpenAddStock(vault.id)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition"
                            title="Adicionar munição neste cofre"
                          >
                            <Plus className="w-4 h-4 text-amber-400" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Vault Items Table
                        USER REQUIREMENT:
                        - As opções entrada e saída de munições NÃO devem ficar visíveis no cofre!
                        - Exibe apenas Editar / Transferir e Excluir.
                    */}
                    {vaultItems.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        Nenhuma munição armazenada neste cofre no momento (Cofre vazio).
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800/80">
                            <tr>
                              <th className="py-3 px-4">Calibre</th>
                              <th className="py-3 px-4">Fabricante / Lote</th>
                              <th className="py-3 px-4">Tipo / Peso</th>
                              <th className="py-3 px-4">Ano / Destinação</th>
                              <th className="py-3 px-4">Observações</th>
                              <th className="py-3 px-4 text-right">Qtd Disponível</th>
                              <th className="py-3 px-4 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {vaultItems.map(item => {
                              const cal = calibers.find(c => c.id === item.caliberId);

                              return (
                                <tr key={item.id} className="hover:bg-slate-900/40 transition">
                                  <td className="py-3 px-4 font-bold text-slate-100">
                                    {cal?.name || 'Munição'}
                                  </td>
                                  <td className="py-3 px-4 text-slate-300">
                                    <span className="font-semibold">{item.fabricante || '-'}</span>
                                    <span className="text-slate-500 ml-1.5 font-mono text-[11px]">
                                      Lote: {item.loteMunicao || 'S/L'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-300">
                                    <span>{item.tipoMunicao || '-'}</span>
                                    {item.pesoMunicao && (
                                      <span className="text-slate-500 ml-1.5 text-[11px]">
                                        ({item.pesoMunicao})
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-slate-300">
                                    <span>{item.anoFabricacao || '-'}</span>
                                    <span className="text-slate-500 ml-1.5">
                                      • {item.destinacao || 'Operacional'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-300 max-w-[200px]">
                                    {item.observacaoEstoqueMunicao || item.additionalInfo || item.observacao ? (
                                      <span 
                                        className="text-slate-300 text-xs truncate block"
                                        title={item.observacaoEstoqueMunicao || item.additionalInfo || item.observacao}
                                      >
                                        {item.observacaoEstoqueMunicao || item.additionalInfo || item.observacao}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 text-xs italic">-</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-bold text-amber-400 text-sm">
                                    {item.quantity.toLocaleString('pt-BR')} <span className="text-[10px] text-slate-500 font-normal">un</span>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end space-x-1.5">
                                      {canManage && (
                                        <>
                                          {/* Note: As opções de entrada e saída rápida foram removidas conforme instrução do usuário */}
                                          <button
                                            onClick={() => handleOpenEditStock(item)}
                                            className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition"
                                            title="Editar Informações ou Transferir entre Cofres"
                                          >
                                            <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                                          </button>

                                          <button
                                            onClick={() => {
                                              setStockToTransferInitially(item);
                                              setShowTransferModal(true);
                                            }}
                                            className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition"
                                            title="Transferir para Outra Unidade Policial"
                                          >
                                            <Send className="w-3.5 h-3.5 text-sky-400" />
                                          </button>

                                          <button
                                            onClick={() => setDeleteConfirmState({
                                              isOpen: true,
                                              type: 'stock',
                                              id: item.id,
                                              message: `Deseja realmente remover o registro de ${item.quantity} munição(ões) do lote "${item.loteMunicao || 'S/L'}" do cofre ${vault.code}?`
                                            })}
                                            className="p-1.5 bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg border border-slate-700/60 transition"
                                            title="Excluir do cofre"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>

        </div>
      ) : null}

      {/* ============================================================== */}
      {/* MODAL: CADASTRAR / EDITAR / TRANSFERIR ESTOQUE DE MUNIÇÃO      */}
      {/* ============================================================== */}
      {showStockModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <Disc className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {editingStock ? 'Editar Informações da Munição' : 'Cadastrar Munição em Estoque'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingStock ? 'Atualize os dados ou transfira munições para outro cofre da unidade' : 'Informe as características do lote e selecione o cofre'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowStockModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Cofre de Armazenamento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Cofre de Munição (Origem/Atual) *
                  </label>
                  <select
                    value={stockVaultId}
                    onChange={e => setStockVaultId(e.target.value)}
                    disabled={Boolean(editingStock)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-60"
                  >
                    {candidateAmmoVaults.map(v => (
                      <option key={v.id} value={v.id}>
                        Cofre {v.code} ({v.type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Calibre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Calibre *
                  </label>
                  <select
                    value={stockCaliberId}
                    onChange={e => setStockCaliberId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {calibers.map(cal => (
                      <option key={cal.id} value={cal.id}>
                        {cal.name} ({cal.fabricante || 'Padrão'} - {cal.tipo || 'Operacional'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantidade */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Quantidade em Estoque (un) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stockQuantity}
                    onChange={e => setStockQuantity(parseInt(e.target.value, 10) || 0)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Fabricante */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fabricante
                  </label>
                  <input
                    type="text"
                    value={stockFabricante}
                    onChange={e => setStockFabricante(e.target.value)}
                    placeholder="Ex: CBC, Magtech, Federal"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Tipo de Munição */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tipo de Munição
                  </label>
                  <input
                    type="text"
                    value={stockTipo}
                    onChange={e => setStockTipo(e.target.value)}
                    placeholder="Ex: Treino, Operacional, Expansiva"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Peso do Projétil */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Peso do Projétil
                  </label>
                  <input
                    type="text"
                    value={stockPeso}
                    onChange={e => setStockPeso(e.target.value)}
                    placeholder="Ex: 115 gr, 124 gr, 147 gr"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Lote */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número do Lote
                  </label>
                  <input
                    type="text"
                    value={stockLote}
                    onChange={e => setStockLote(e.target.value)}
                    placeholder="Ex: CBC-2024-X8"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Ano de Fabricação */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ano de Fabricação
                  </label>
                  <input
                    type="number"
                    value={stockAno}
                    onChange={e => setStockAno(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Destinação */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Destinação Operacional
                  </label>
                  <select
                    value={stockDestinacao}
                    onChange={e => setStockDestinacao(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Treinamento">Treinamento / Instrução</option>
                    <option value="Operacional">Operacional / Cautela</option>
                    <option value="Reserva">Reserva Estratégica</option>
                    <option value="Curso de Formação">Curso de Formação Acadepol</option>
                  </select>
                </div>

                {/* Observações da Munição */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Observações da Munição</span>
                    <span className="text-[10px] text-amber-400 font-normal">Salvo em OBSERVACAO_ESTOQUE_MUNICAO</span>
                  </label>
                  <textarea
                    rows={2}
                    value={stockInfo}
                    onChange={e => setStockInfo(e.target.value)}
                    placeholder="Observações complementares sobre o lote/munição..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

              </div>

              {/* USER REQUIREMENT: TRANSFERÊNCIA ENTRE COFRES DA UNIDADE */}
              {editingStock && (
                <div className="pt-4 border-t border-slate-800/80 bg-slate-950/40 p-4 rounded-2xl border space-y-3">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Transferir Munições para Outro Cofre da Unidade</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Se deseja mover parte ou a totalidade deste lote para outro cofre, selecione o cofre de destino abaixo.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Cofre de Destino
                      </label>
                      <select
                        value={transferTargetVaultId}
                        onChange={e => {
                          setTransferTargetVaultId(e.target.value);
                          if (e.target.value && transferStockQuantity === 0) {
                            setTransferStockQuantity(stockQuantity);
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- Não transferir (manter no cofre atual) --</option>
                        {candidateAmmoVaults
                          .filter(v => v.id !== editingStock.vaultSpaceId)
                          .map(v => (
                            <option key={v.id} value={v.id}>
                              Mover para Cofre: {v.code}
                            </option>
                          ))}
                      </select>
                    </div>

                    {transferTargetVaultId && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Quantidade a Transferir (Máx: {stockQuantity})
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={stockQuantity}
                          value={transferStockQuantity}
                          onChange={e => setTransferStockQuantity(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    )}
                  </div>

                  {transferTargetVaultId && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Justificativa da Transferência entre Cofres
                      </label>
                      <input
                        type="text"
                        value={transferStockObservation}
                        onChange={e => setTransferStockObservation(e.target.value)}
                        placeholder="Ex: Reorganização de estoque da unidade / Remanejamento interno"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Botões */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingStock ? 'Salvar Alterações' : 'Cadastrar no Estoque'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: SELEÇÃO DE COFRES PARA IMPRESSÃO DE RELATÓRIO           */}
      {/* ============================================================== */}
      {showPrintVaultSelectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-2xl border border-cyan-500/20">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Imprimir Relatório de Cofres de Munições
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedUnitObj?.name || 'Unidade Policial'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPrintVaultSelectModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pergunta se deseja imprimir locais de cofres vazios ou somente os com munições */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
              <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                Deseja imprimir locais de cofres vazios ou somente os com munições?
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPrintEmptyVaultsOption('somente_com_municoes')}
                  className={`p-3 rounded-xl border text-left transition flex items-start space-x-3 ${
                    printEmptyVaultsOption === 'somente_com_municoes'
                      ? 'bg-amber-500/10 border-amber-500/40 text-slate-100 ring-1 ring-amber-500'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${
                    printEmptyVaultsOption === 'somente_com_municoes'
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-slate-600'
                  }`}>
                    {printEmptyVaultsOption === 'somente_com_municoes' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-slate-200">Somente com Munições</span>
                    <span className="text-[10px] text-slate-400">Desconsidera cofres sem estoque</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintEmptyVaultsOption('todos_inclusive_vazios')}
                  className={`p-3 rounded-xl border text-left transition flex items-start space-x-3 ${
                    printEmptyVaultsOption === 'todos_inclusive_vazios'
                      ? 'bg-amber-500/10 border-amber-500/40 text-slate-100 ring-1 ring-amber-500'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${
                    printEmptyVaultsOption === 'todos_inclusive_vazios'
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-slate-600'
                  }`}>
                    {printEmptyVaultsOption === 'todos_inclusive_vazios' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-slate-200">Todos os Cofres</span>
                    <span className="text-[10px] text-slate-400">Inclui cofres vazios</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Selection List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Cofres que serão impressos ({selectedVaultIdsForReport.length} selecionados):
                </span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (printEmptyVaultsOption === 'somente_com_municoes') {
                        const withAmmo = candidateAmmoVaults.filter(v => {
                          const total = stocks.filter(s => s.vaultSpaceId === v.id).reduce((sum, s) => sum + s.quantity, 0);
                          return total > 0;
                        });
                        setSelectedVaultIdsForReport(withAmmo.map(v => v.id));
                      } else {
                        setSelectedVaultIdsForReport(candidateAmmoVaults.map(v => v.id));
                      }
                    }}
                    className="text-amber-400 hover:underline font-bold text-[11px]"
                  >
                    Marcar Todos
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedVaultIdsForReport([])}
                    className="text-slate-400 hover:underline font-bold text-[11px]"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 p-2 bg-slate-950 border border-slate-800 rounded-2xl">
                {candidateAmmoVaults.map(vault => {
                  const vaultStocks = stocks.filter(s => s.vaultSpaceId === vault.id);
                  const total = vaultStocks.reduce((sum, s) => sum + s.quantity, 0);
                  const isChecked = selectedVaultIdsForReport.includes(vault.id);
                  const isEmpty = total === 0;

                  return (
                    <label
                      key={vault.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/30 text-slate-100'
                          : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedVaultIdsForReport(prev => [...prev, vault.id]);
                            } else {
                              setSelectedVaultIdsForReport(prev => prev.filter(id => id !== vault.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
                        />
                        <span className="font-mono font-bold text-xs">Cofre {vault.code}</span>
                      </div>

                      <span className={`text-[11px] font-mono font-bold ${isEmpty ? 'text-slate-500' : 'text-amber-400'}`}>
                        {total} un {isEmpty ? '(Vazio)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
              <p>• Cada cofre selecionado será gerado em sua própria página A4 individual.</p>
              <p>• <strong>Todas as páginas</strong> conterão a assinatura do armeiro responsável, posicionada logo abaixo da declaração certificadora.</p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPrintVaultSelectModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePrintUnitAmmoReport}
                disabled={selectedVaultIdsForReport.length === 0}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs transition flex items-center space-x-2 shadow-lg shadow-cyan-600/20"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir ({selectedVaultIdsForReport.length})</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: MOVIMENTAÇÃO (ENTRADA / SAÍDA RÁPIDA)                   */}
      {/* ============================================================== */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Registrar Movimentação de Munição
                  </h3>
                  <p className="text-xs text-slate-400">
                    Entrada ou Saída com emissão de comprovante
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMovementModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-4">
              
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovType('Saída')}
                  className={`py-2 rounded-xl text-xs font-bold transition border ${
                    movType === 'Saída'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  Saída / Cautela / Consumo
                </button>
                <button
                  type="button"
                  onClick={() => setMovType('Entrada')}
                  className={`py-2 rounded-xl text-xs font-bold transition border ${
                    movType === 'Entrada'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-950 text-slate-300 border-slate-800'
                  }`}
                >
                  Entrada / Reabastecimento
                </button>
              </div>

              {/* Lote de Munição */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Munição em Estoque *
                </label>
                <select
                  value={movStockId}
                  onChange={e => {
                    const newId = e.target.value;
                    setMovStockId(newId);
                    const s = stocks.find(st => st.id === newId);
                    setMovStockObs(s?.observacaoEstoqueMunicao || s?.observacao || s?.additionalInfo || '');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {stocks.map(s => {
                    const cal = calibers.find(c => c.id === s.caliberId);
                    const vault = vaultSpaces.find(v => v.id === s.vaultSpaceId);
                    return (
                      <option key={s.id} value={s.id}>
                        {cal?.name} • Lote: {s.loteMunicao || 'S/L'} • Cofre {vault?.code} (Disp: {s.quantity} un)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Observações da Munição no Estoque */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Observações da Munição</span>
                  <span className="text-[10px] text-amber-400 font-normal">Salvo em OBSERVACAO_ESTOQUE_MUNICAO</span>
                </label>
                <input
                  type="text"
                  value={movStockObs}
                  onChange={e => setMovStockObs(e.target.value)}
                  placeholder="Observações da munição no cofre..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Quantidade (un) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={movQuantity}
                  onChange={e => setMovQuantity(parseInt(e.target.value, 10) || 1)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Finalidade / Motivo *
                </label>
                <input
                  type="text"
                  value={movReason}
                  onChange={e => setMovReason(e.target.value)}
                  required
                  placeholder="Ex: Treinamento Tático, Operação Policial, Abastecimento"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Responsável Tipo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Origem do Responsável / Recebedor
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={movRespType === 'SISTEMA'}
                      onChange={() => setMovRespType('SISTEMA')}
                      className="text-amber-500"
                    />
                    <span>Usuário do Sistema</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={movRespType === 'FORA_DO_SISTEMA'}
                      onChange={() => setMovRespType('FORA_DO_SISTEMA')}
                      className="text-amber-500"
                    />
                    <span>Externo / Outra Instituição</span>
                  </label>
                </div>

                {movRespType === 'SISTEMA' ? (
                  <select
                    value={movRespUserId}
                    onChange={e => {
                      setMovRespUserId(e.target.value);
                      const u = users.find(usr => usr.id === e.target.value);
                      if (u) {
                        setMovRespName(u.name);
                        setMovRespMasp(u.masp);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {u.masp}) - {u.cargo || u.role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome completo do responsável"
                      value={movRespName}
                      onChange={e => setMovRespName(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="text"
                      placeholder="MASP / CPF / Matrícula"
                      value={movRespMasp}
                      onChange={e => setMovRespMasp(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Observação */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações Complementares
                </label>
                <textarea
                  rows={2}
                  value={movObs}
                  onChange={e => setMovObs(e.target.value)}
                  placeholder="Informações adicionais da movimentação..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Movimentação</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DEVOLUÇÃO DE MUNIÇÕES NÃO DEFLAGRADAS                   */}
      {/* ============================================================== */}
      {returnTargetMov && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Devolver Munições ao Cofre
                  </h3>
                  <p className="text-xs text-slate-400">
                    Retorno de munições não deflagradas / sobressalentes
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReturnTargetMov(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReturnAmmo} className="space-y-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                <p><strong>Saída original:</strong> {returnTargetMov.quantity} unidades</p>
                <p><strong>Já devolvidas:</strong> {returnTargetMov.returnedQuantity || 0} unidades</p>
                <p><strong>Responsável:</strong> {returnTargetMov.responsibleName}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Quantidade a Devolver ao Cofre *
                </label>
                <input
                  type="number"
                  min={1}
                  max={returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)}
                  value={returnQtyInput}
                  onChange={e => setReturnQtyInput(parseInt(e.target.value, 10) || 0)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReturnTargetMov(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Devolução</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CADASTRAR / EDITAR CALIBRE                              */}
      {/* ============================================================== */}
      {showCaliberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {editingCaliber ? 'Editar Calibre' : 'Novo Calibre de Munição'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Catálogo de especificações bélicas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCaliberModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCaliber} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Calibre *
                </label>
                <input
                  type="text"
                  required
                  value={calName}
                  onChange={e => setCalName(e.target.value)}
                  placeholder="Ex: 9x19mm Luger, .40 S&W, 5,56x45mm"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Fabricante Padrão
                </label>
                <input
                  type="text"
                  value={calFabricante}
                  onChange={e => setCalFabricante(e.target.value)}
                  placeholder="Ex: CBC, Magtech"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tipo de Projétil / Munição
                </label>
                <input
                  type="text"
                  value={calTipo}
                  onChange={e => setCalTipo(e.target.value)}
                  placeholder="Ex: Treino, Operacional, Expansivo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Peso Típico
                </label>
                <input
                  type="text"
                  value={calPeso}
                  onChange={e => setCalPeso(e.target.value)}
                  placeholder="Ex: 124 gr, 115 gr, 55 gr"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCaliberModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-1.5 shadow"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Calibre</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: TRANSFERÊNCIA DE MUNIÇÕES ENTRE UNIDADES (DEDICADO)     */}
      {/* ============================================================== */}
      {showTransferModal && (
        <ModalTransferirMunicao
          initialStock={stockToTransferInitially}
          stocks={stocks}
          calibers={calibers}
          departments={departments}
          units={units}
          vaultSpaces={vaultSpaces}
          currentUser={currentUser}
          onClose={() => {
            setShowTransferModal(false);
            setStockToTransferInitially(null);
          }}
          onTransferSuccess={() => {
            setSuccessMsg('Transferência de munições despachada com sucesso!');
            setShowTransferModal(false);
            setStockToTransferInitially(null);
            onRefresh();
          }}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: HISTÓRICO DE TRANSFERÊNCIAS ENTRE UNIDADES              */}
      {/* ============================================================== */}
      {showTransferHistoryModal && (
        <ModalHistoricoTransferenciasMunicao
          transfers={allAmmoTransfers}
          currentUser={currentUser}
          selectedUnitId={selectedUnitId}
          onClose={() => setShowTransferHistoryModal(false)}
          onOpenNewTransfer={() => {
            setShowTransferHistoryModal(false);
            setShowTransferModal(true);
          }}
          onRefresh={onRefresh}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: RECIBO DE MOVIMENTAÇÃO / SAÍDA DE MUNIÇÃO               */}
      {/* ============================================================== */}
      {selectedMovForReceipt && (
        <AmmunitionReceiptModal
          movement={selectedMovForReceipt}
          calibers={calibers}
          vaultSpaces={vaultSpaces}
          onClose={() => setSelectedMovForReceipt(null)}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIRMAR EXCLUSÃO                                      */}
      {/* ============================================================== */}
      <ConfirmDeleteModal
        isOpen={deleteConfirmState.isOpen}
        title="Confirmar Exclusão"
        message={deleteConfirmState.message}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmState({ isOpen: false, type: 'stock', id: '', message: '' })}
      />

    </div>
  );
};

export default AmmunitionModule;
