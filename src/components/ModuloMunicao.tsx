import React, { useState, useMemo, useEffect } from 'react';
import { 
  User, Department, Unit, VaultSpace, Caliber, AmmunitionStock, 
  AmmunitionMovement, isUserExplosivista, getSystemLogo 
} from '../types';
import { storage } from '../services/storage';
import { printDocumentInPage } from '../utils/printHelper';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { 
  Disc, Plus, Search, Building, Vault, ArrowRightLeft, Printer, 
  Trash2, Edit2, History, RotateCcw, AlertTriangle, Check, X, 
  ChevronRight, Layers, Package, Send, CheckCircle2, ArrowDownCircle, 
  ArrowUpCircle, FileText, Sparkles, Filter
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

  // Active View Tab: 'estoque' | 'movimentacoes' | 'calibres' | 'transferencias'
  const [activeTab, setActiveTab] = useState<'estoque' | 'movimentacoes' | 'calibres' | 'transferencias'>('estoque');

  // Search filter - searches across all ammo fields
  const [searchTerm, setSearchTerm] = useState('');

  // Department & Unit selection
  const [selectedDeptId, setSelectedDeptId] = useState<string>(() => {
    if (isGeral) {
      return departments[0]?.id || '';
    }
    return currentUser.departmentId || departments[0]?.id || '';
  });

  // Available units in selected department
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

  // Keep selectedUnitId valid whenever department or availableUnits change
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

  // Return Unused Ammo Modal State
  const [returnTargetMov, setReturnTargetMov] = useState<AmmunitionMovement | null>(null);
  const [returnQtyInput, setReturnQtyInput] = useState<number>(0);

  // Transfer Ammo between Units Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transfDestDeptId, setTransfDestDeptId] = useState('');
  const [transfDestUnitId, setTransfDestUnitId] = useState('');
  const [transfReceiverName, setTransfReceiverName] = useState('');
  const [transfReceiverMasp, setTransfReceiverMasp] = useState('');
  const [transfReceiverCargo, setTransfReceiverCargo] = useState('');
  const [transfReason, setTransfReason] = useState('Suprimento de Material Bélico');
  const [transfObs, setTransfObs] = useState('');
  const [transfItems, setTransfItems] = useState<{
    stockId: string;
    caliberId: string;
    caliberName: string;
    fabricante?: string;
    tipoMunicao?: string;
    pesoMunicao?: string;
    loteMunicao?: string;
    anoFabricacao?: number | string;
    destinacao?: string;
    quantity: number;
    maxQuantity: number;
    originVaultSpaceId: string;
    originVaultCode: string;
  }[]>([]);

  // Receive Transfer Modal State
  const [receivingTransferId, setReceivingTransferId] = useState<string | null>(null);
  const [receiveDestVaultId, setReceiveDestVaultId] = useState('');
  const [receiveObs, setReceiveObs] = useState('');

  // Print Vaults Report Modal State
  const [showPrintVaultSelectModal, setShowPrintVaultSelectModal] = useState(false);
  // User Requirement: "ao imprimir relatório pergunta se deseja imprimir locais de cofres vazio ou somente os com munições"
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

  // Comprehensive Search across all ammunition fields
  const filteredStocks = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return stocks.filter(stock => {
      // Must belong to candidate vaults or unit
      if (selectedUnitId && stock.unitId !== selectedUnitId) return false;
      if (selectedDeptId && selectedDeptId !== 'ALL' && stock.departmentId !== selectedDeptId) return false;

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
  }, [stocks, selectedUnitId, selectedDeptId, searchTerm, calibers, vaultSpaces, units, departments]);

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

  // Pending Incoming Ammo Transfers
  const pendingTransfers = useMemo(() => {
    return storage.getPendingIncomingAmmoTransfers(currentUser);
  }, [currentUser, stocks]);

  // Ammo transfers history
  const unitAmmoTransfers = useMemo(() => {
    return storage.getAmmoTransfers(currentUser, selectedUnitId || undefined);
  }, [currentUser, selectedUnitId, stocks]);

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
    setStockInfo(stock.additionalInfo || '');
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
          observation: stockInfo || 'Cadastro no sistema'
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
    setMovType(preselectedType);
    setMovStockId(stock?.id || stocks[0]?.id || '');
    setMovQuantity(preselectedType === 'Saída' ? Math.min(50, stock?.quantity || 50) : 100);
    setMovReason(preselectedType === 'Saída' ? 'Treinamento Tático' : 'Reabastecimento de Cofre');
    setMovRespType('SISTEMA');
    setMovRespUserId(currentUser.id);
    setMovRespName(currentUser.name);
    setMovRespMasp(currentUser.masp);
    setMovObs('');
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
      await storage.addAmmoMovement({
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
        observation: movObs
      });

      setSuccessMsg(`Movimentação de ${movType} de ${movQuantity} munição(ões) registrada com sucesso!`);
      setShowMovementModal(false);
      onRefresh();
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

  // --- Handlers: Inter-Unit Ammo Transfers ---

  const handleOpenTransferModal = () => {
    setErrorMsg('');
    setSuccessMsg('');
    const otherUnits = units.filter(u => u.id !== selectedUnitId);
    const firstOtherUnit = otherUnits[0];
    setTransfDestDeptId(firstOtherUnit?.departmentId || departments[0]?.id || '');
    setTransfDestUnitId(firstOtherUnit?.id || '');
    setTransfReceiverName('');
    setTransfReceiverMasp('');
    setTransfReceiverCargo('Investigador');
    setTransfReason('Suprimento de Munições');
    setTransfObs('');
    setTransfItems([]);
    setShowTransferModal(true);
  };

  const handleAddStockToTransfer = (stock: AmmunitionStock) => {
    const exists = transfItems.some(i => i.stockId === stock.id);
    if (exists) return;
    const caliber = calibers.find(c => c.id === stock.caliberId);
    const vault = vaultSpaces.find(v => v.id === stock.vaultSpaceId);

    setTransfItems(prev => [
      ...prev,
      {
        stockId: stock.id,
        caliberId: stock.caliberId,
        caliberName: caliber?.name || 'Munição',
        fabricante: stock.fabricante,
        tipoMunicao: stock.tipoMunicao,
        pesoMunicao: stock.pesoMunicao,
        loteMunicao: stock.loteMunicao,
        anoFabricacao: stock.anoFabricacao,
        destinacao: stock.destinacao,
        quantity: Math.min(100, stock.quantity),
        maxQuantity: stock.quantity,
        originVaultSpaceId: stock.vaultSpaceId,
        originVaultCode: vault?.code || 'Cofre'
      }
    ]);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (transfItems.length === 0) {
      setErrorMsg('Adicione pelo menos um lote de munição para transferir.');
      return;
    }
    if (!transfDestUnitId) {
      setErrorMsg('Selecione a unidade de destino.');
      return;
    }
    if (transfDestUnitId === selectedUnitId) {
      setErrorMsg('A unidade de destino deve ser diferente da unidade de origem.');
      return;
    }
    if (!transfReceiverName.trim() || !transfReceiverMasp.trim()) {
      setErrorMsg('Informe o nome e MASP do recebedor / transportador.');
      return;
    }

    const destDept = departments.find(d => d.id === transfDestDeptId);
    const destUnit = units.find(u => u.id === transfDestUnitId);

    try {
      await storage.transferAmmo({
        originDepartmentId: selectedDepartmentObj?.id,
        originDepartmentName: selectedDepartmentObj?.name,
        originUnitId: selectedUnitObj?.id,
        originUnitName: selectedUnitObj?.name,
        destinationDepartmentId: transfDestDeptId,
        destinationDepartmentName: destDept?.name || 'Departamento Destino',
        destinationUnitId: transfDestUnitId,
        destinationUnitName: destUnit?.name || 'Unidade Destino',
        receiverOrTransporterName: transfReceiverName.trim(),
        receiverOrTransporterMasp: transfReceiverMasp.trim(),
        receiverOrTransporterCargo: transfReceiverCargo,
        reason: transfReason,
        observation: transfObs,
        items: transfItems.map(item => ({
          caliberId: item.caliberId,
          caliberName: item.caliberName,
          fabricante: item.fabricante,
          tipoMunicao: item.tipoMunicao,
          pesoMunicao: item.pesoMunicao,
          loteMunicao: item.loteMunicao,
          anoFabricacao: item.anoFabricacao,
          destinacao: item.destinacao,
          quantity: Number(item.quantity),
          originVaultSpaceId: item.originVaultSpaceId,
          originVaultCode: item.originVaultCode
        }))
      });

      setSuccessMsg('Transferência de munições iniciada com sucesso. O material aguarda recebimento na unidade de destino.');
      setShowTransferModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao iniciar transferência.');
    }
  };

  const handleConfirmReceiveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingTransferId || !receiveDestVaultId) {
      setErrorMsg('Selecione o cofre de destino para armazenar as munições recebidas.');
      return;
    }
    try {
      await storage.receiveAmmoTransfer(receivingTransferId, receiveDestVaultId, receiveObs);
      setSuccessMsg('Munições recebidas e armazenadas no cofre com sucesso!');
      setReceivingTransferId(null);
      setReceiveDestVaultId('');
      setReceiveObs('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao dar recibo nas munições.');
    }
  };

  // --- Handlers: Printing Reports ---

  /**
   * Imprime Relatório Consolidado de Munições por Cofre
   * REGRA DO USUÁRIO:
   * 1. Pergunta se deseja imprimir locais de cofres vazios ou somente os com munições.
   * 2. Imprime um relatório por vez (cada cofre em uma página separada).
   * 3. O relatório contém SOMENTE a assinatura do armeiro responsável (centralizada).
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
            return `
              <tr>
                <td style="font-weight: bold;">${cal?.name || 'Munição'}</td>
                <td>${stock.fabricante || '-'} / ${stock.loteMunicao || 'S/L'}</td>
                <td>${stock.tipoMunicao || '-'} ${stock.pesoMunicao ? `(${stock.pesoMunicao})` : ''}</td>
                <td>${stock.anoFabricacao || '-'} / ${stock.destinacao || 'Operacional'}</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${stock.quantity}</td>
              </tr>
            `;
          }).join('')
        : `
          <tr>
            <td colspan="5" style="text-align: center; color: #64748b; padding: 16px; font-style: italic;">
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
                <th style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right;">Qtd (un)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: bold;">
                <td colspan="4" style="padding: 8px 10px; text-align: right; text-transform: uppercase;">Total de Munições no Cofre:</td>
                <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-size: 12px;">${totalQuantity} un</td>
              </tr>
            </tfoot>
          </table>

          <div class="info-footer-box">
            Certifico que o inventário acima reflete fielmente o material bélico (munições) sob guarda no espaço do cofre ${vault.code} na presente data, conforme conferência física realizada pelo armeiro responsável.
          </div>

          <!-- ASSINATURA: SOMENTE O ARMEIRO RESPONSÁVEL (CENTRALIZADA) -->
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
            min-height: 265mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
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
            padding: 8px 12px;
            font-size: 9.5px;
            color: #334155;
            line-height: 1.45;
            margin-bottom: 24px;
          }
          .signatures {
            margin-top: 24px;
            display: flex;
            justify-content: center;
            text-align: center;
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

  /**
   * Imprime comprovante individual de movimentação
   */
  const handlePrintMovementReceipt = (mov: AmmunitionMovement) => {
    const systemLogo = getSystemLogo(selectedUnitObj, selectedDepartmentObj);
    const cal = calibers.find(c => c.id === mov.caliberId);
    const vault = vaultSpaces.find(v => v.id === mov.vaultSpaceId);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Munição - ${mov.type}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; margin: 0; padding: 0; font-size: 11px; }
          .receipt-page { border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; max-width: 700px; margin: 0 auto; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 16px; }
          .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; text-align: center; }
          .sig-line { border-top: 1px solid #000; padding-top: 6px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt-page">
          <div class="header">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${systemLogo}" alt="Logo" style="height: 50px;" />
              <div>
                <div style="font-weight: 900; font-size: 13px;">POLÍCIA CIVIL DE MINAS GERAIS</div>
                <div style="font-weight: bold; font-size: 11px; color: #374151;">${selectedDepartmentObj?.name || ''}</div>
                <div style="font-size: 10px; color: #64748b;">${selectedUnitObj?.name || ''}</div>
              </div>
            </div>
            <div style="text-align: right; font-family: monospace;">
              <strong>RECIBO DE ${mov.type.toUpperCase()}</strong><br>
              <span style="font-size: 10px;">ID: ${mov.id.slice(0, 8)}</span>
            </div>
          </div>

          <div class="meta-grid">
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Tipo de Operação:</strong><br><strong>${mov.type}</strong></div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Data/Hora:</strong><br><strong>${new Date(mov.createdAt).toLocaleString('pt-BR')}</strong></div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Calibre:</strong><br><strong>${cal?.name || '-'}</strong></div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Quantidade:</strong><br><strong style="font-size: 14px;">${mov.quantity} un</strong></div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Fabricante / Lote:</strong><br>${mov.fabricante || '-'} / ${mov.loteMunicao || 'S/L'}</div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Tipo / Peso:</strong><br>${mov.tipoMunicao || '-'} ${mov.pesoMunicao ? `(${mov.pesoMunicao})` : ''}</div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Cofre:</strong><br>${vault?.code || '-'}</div>
            <div><strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Finalidade / Motivo:</strong><br>${mov.recipientOrReason}</div>
          </div>

          <div style="margin-bottom: 20px;">
            <strong style="color: #64748b; font-size: 9px; text-transform: uppercase;">Responsável / Recebedor:</strong><br>
            <span style="font-size: 12px; font-weight: bold;">${mov.responsibleName || 'Não especificado'}</span>
            ${mov.responsibleMasp ? `<span style="font-size: 11px; color: #475569;"> (MASP: ${mov.responsibleMasp})</span>` : ''}
          </div>

          ${mov.observation ? `
            <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; font-size: 10px; margin-bottom: 30px;">
              <strong>Observações:</strong> ${mov.observation}
            </div>
          ` : ''}

          <div class="signatures">
            <div class="sig-line">
              ${mov.responsibleName || 'Recebedor'}<br>
              <span style="font-size: 9px; font-weight: normal; color: #64748b;">Responsável pela Retirada</span>
            </div>
            <div class="sig-line">
              ${currentUser.name} (MASP: ${currentUser.masp})<br>
              <span style="font-size: 9px; font-weight: normal; color: #64748b;">Armeiro Operador</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Total ammo in current view
  const totalAmmoInView = useMemo(() => {
    return filteredStocks.reduce((sum, s) => sum + s.quantity, 0);
  }, [filteredStocks]);

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

      {/* Main Top Header */}
      <div className="glass-card rounded-3xl p-6 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20 shadow-inner">
              <Disc className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                Módulo de Munições
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  PCMG
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Gestão tática de calibres, lotes de munições, cofres e transferências
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {canManage && (
              <>
                <button
                  onClick={() => handleOpenAddStock()}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Munição</span>
                </button>

                <button
                  onClick={() => handleOpenMovementModal(undefined, 'Saída')}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700 flex items-center space-x-2 active:scale-95"
                >
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  <span>Movimentação</span>
                </button>
              </>
            )}

            <button
              onClick={() => setShowPrintVaultSelectModal(true)}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700 flex items-center space-x-2 active:scale-95"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span>Imprimir Relatório</span>
            </button>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-slate-800 space-x-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('estoque')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'estoque'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Vault className="w-4 h-4" />
            <span>Estoque por Cofre ({filteredStocks.length} lotes)</span>
          </button>

          <button
            onClick={() => setActiveTab('movimentacoes')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'movimentacoes'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Movimentações</span>
          </button>

          <button
            onClick={() => setActiveTab('calibres')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'calibres'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Catálogo de Calibres ({calibers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('transferencias')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center space-x-2 border-b-2 whitespace-nowrap relative ${
              activeTab === 'transferencias'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Transferências entre Unidades</span>
            {pendingTransfers.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-1" />
            )}
          </button>
        </div>

        {/* STEP 1: Department Selection (if multiple) */}
        {departments.length > 1 && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Building className="w-3.5 h-3.5 text-amber-400" />
              <span>1. Selecione o Departamento</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {isGeral && (
                <button
                  onClick={() => setSelectedDeptId('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                    selectedDeptId === 'ALL'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  Todos os Departamentos
                </button>
              )}
              {departments.map(dept => {
                const isSelected = dept.id === selectedDeptId;
                return (
                  <button
                    key={dept.id}
                    onClick={() => setSelectedDeptId(dept.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Unit Selection
            CRITICAL USER REQUIREMENT:
            - NÃO deve ter a opção "Todas as unidades"
            - NÃO deve aparecer quantidade de lotes e nem total das munições no botão de filtro
            - Deve conter APENAS a abreviação/nome da unidade
        */}
        <div className="space-y-2 pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <ChevronRight className="w-3.5 h-3.5" />
              <span>2. Selecione a Unidade em <strong className="text-slate-100">{selectedDepartmentObj?.name || 'Departamento'}</strong></span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {availableUnits.length} unidade(s) disponível(is)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {availableUnits.map(unit => {
              const isSelected = unit.id === selectedUnitId;
              return (
                <button
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>{unit.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar - CRITICAL USER REQUIREMENT: searches across all fields of registered ammo */}
        <div className="pt-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Pesquisar munição por calibre, fabricante, lote, tipo, peso, ano, destinação, cofre ou observação..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
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
        </div>

      </div>

      {/* VIEW CONTENT BY TAB */}

      {/* 1. ABA ESTOQUE POR COFRE */}
      {activeTab === 'estoque' && (
        <div className="space-y-6">
          
          {/* Summary Banner */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center space-x-3">
              <Package className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Unidade Atual</span>
                <span className="text-sm font-bold text-slate-100">{selectedUnitObj?.name || 'Selecione uma Unidade'}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-semibold block uppercase tracking-wider">Total em Estoque</span>
              <span className="text-lg font-black text-amber-400 font-mono">{totalAmmoInView.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">un</span></span>
            </div>
          </div>

          {candidateAmmoVaults.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-slate-800 space-y-3">
              <Vault className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">Nenhum cofre de munições encontrado nesta unidade</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cadastre um local no cofre do tipo "MUNIÇÕES" no módulo de Cofres para vincular o estoque.
              </p>
            </div>
          ) : (
            candidateAmmoVaults.map(vault => {
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
                          {vaultItems.length} lote(s) cadastrado(s)
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

                  {/* Vault Items Table */}
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
                                <td className="py-3 px-4 text-right font-mono font-bold text-amber-400 text-sm">
                                  {item.quantity.toLocaleString('pt-BR')} <span className="text-[10px] text-slate-500 font-normal">un</span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end space-x-1.5">
                                    {canManage && (
                                      <>
                                        <button
                                          onClick={() => handleOpenMovementModal(item, 'Saída')}
                                          className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition"
                                          title="Saída / Baixa rápida"
                                        >
                                          <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400" />
                                        </button>

                                        <button
                                          onClick={() => handleOpenMovementModal(item, 'Entrada')}
                                          className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition"
                                          title="Entrada / Reabastecimento rápido"
                                        >
                                          <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-400" />
                                        </button>

                                        {/* USER REQUIREMENT: Editar informações e transferir munições entre cofres */}
                                        <button
                                          onClick={() => handleOpenEditStock(item)}
                                          className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60 transition"
                                          title="Editar Informações ou Transferir entre Cofres"
                                        >
                                          <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
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
      )}

      {/* 2. ABA MOVIMENTAÇÕES */}
      {activeTab === 'movimentacoes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">
              Histórico de Movimentações de Munições
            </h3>
            {canManage && (
              <button
                onClick={() => handleOpenMovementModal()}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Movimentação</span>
              </button>
            )}
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Data/Hora</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Calibre / Lote</th>
                    <th className="py-3 px-4">Cofre</th>
                    <th className="py-3 px-4">Destinatário / Finalidade</th>
                    <th className="py-3 px-4 text-right">Qtd</th>
                    <th className="py-3 px-4 text-center">Devolução</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                        Nenhuma movimentação registrada.
                      </td>
                    </tr>
                  ) : (
                    movements.map(mov => {
                      const cal = calibers.find(c => c.id === mov.caliberId);
                      const vault = vaultSpaces.find(v => v.id === mov.vaultSpaceId);
                      const isSaida = mov.type === 'Saída';
                      const returned = mov.returnedQuantity || 0;
                      const canReturn = isSaida && returned < mov.quantity;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-900/40 transition">
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {new Date(mov.createdAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isSaida 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {mov.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-200">
                            <strong>{cal?.name || 'Munição'}</strong>
                            <span className="text-slate-500 ml-1.5 text-[11px] font-mono">
                              ({mov.fabricante || '-'} • Lote: {mov.loteMunicao || 'S/L'})
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {vault?.code || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            <span className="font-semibold block">{mov.responsibleName || 'Não especificado'}</span>
                            <span className="text-slate-500 text-[11px]">{mov.recipientOrReason}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-100">
                            {mov.quantity} un
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isSaida ? (
                              returned > 0 ? (
                                <span className="text-[10px] text-emerald-400 font-mono">
                                  {returned} un devolvida(s)
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Pendente
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-600">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
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
                                onClick={() => handlePrintMovementReceipt(mov)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                                title="Imprimir recibo"
                              >
                                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. ABA CATÁLOGO DE CALIBRES */}
      {activeTab === 'calibres' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">
              Catálogo de Calibres & Munições Homologadas
            </h3>
            {canManage && (
              <button
                onClick={handleOpenAddCaliber}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Calibre</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {calibers.map(cal => {
              const countInStock = stocks
                .filter(s => s.caliberId === cal.id)
                .reduce((acc, curr) => acc + curr.quantity, 0);

              return (
                <div key={cal.id} className="glass-card rounded-2xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                        <Disc className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-100">{cal.name}</h4>
                        <span className="text-[11px] text-slate-400">
                          {cal.fabricante || 'Fabricante padrão'} • {cal.tipo || 'Operacional'}
                        </span>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenEditCaliber(cal)}
                          className="p-1.5 text-slate-400 hover:text-slate-200"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmState({
                            isOpen: true,
                            type: 'caliber',
                            id: cal.id,
                            message: `Deseja realmente excluir o calibre "${cal.name}"? Certifique-se de que não haja estoques vinculados.`
                          })}
                          className="p-1.5 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-500">Em estoque na rede:</span>
                    <span className="font-mono font-bold text-amber-400">{countInStock.toLocaleString('pt-BR')} un</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. ABA TRANSFERÊNCIAS ENTRE UNIDADES */}
      {activeTab === 'transferencias' && (
        <div className="space-y-6">
          
          {/* Incoming Pending Transfers */}
          {pendingTransfers.length > 0 && (
            <div className="glass-card rounded-2xl p-5 border border-amber-500/30 bg-amber-500/5 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Transferências de Munições Aguardando Recibo
                  </h4>
                  <p className="text-xs text-slate-400">
                    Munições enviadas de outras unidades que necessitam de conferência e recebimento no cofre.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {pendingTransfers.map(t => (
                  <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-amber-400">
                          {t.originUnitName} → {t.destinationUnitName}
                        </span>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold">
                          {t.totalQuantity} munições
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Transportador: <strong>{t.receiverOrTransporterName}</strong> (MASP: {t.receiverOrTransporterMasp})
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Motivo: {t.reason} • Data: {t.transferDate}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {canManage && (
                        <button
                          onClick={() => {
                            setReceivingTransferId(t.id);
                            setReceiveDestVaultId(candidateAmmoVaults[0]?.id || '');
                            setReceiveObs('');
                          }}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Dar Recibo e Guardar no Cofre</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transfers History Header & Button */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200">
              Histórico de Transferências de Munições entre Unidades
            </h3>
            {canManage && (
              <button
                onClick={handleOpenTransferModal}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shadow"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transferir para Outra Unidade</span>
              </button>
            )}
          </div>

          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Origem → Destino</th>
                    <th className="py-3 px-4">Responsável Transferência</th>
                    <th className="py-3 px-4">Transportador</th>
                    <th className="py-3 px-4 text-right">Qtd Total</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {unitAmmoTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        Nenhuma transferência registrada nesta unidade.
                      </td>
                    </tr>
                  ) : (
                    unitAmmoTransfers.map(t => (
                      <tr key={t.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                          {t.transferDate}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-200">
                          {t.originUnitName} <span className="text-amber-400 font-bold">→</span> {t.destinationUnitName}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {t.transferredByUserName} (MASP: {t.transferredByUserMasp})
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {t.receiverOrTransporterName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                          {t.totalQuantity} un
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === 'Recebido'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : t.status === 'Pendente'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {t.status}
                          </span>
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

      {/* ============================================================== */}
      {/* MODAL 1: CADASTRAR / EDITAR / TRANSFERIR ESTOQUE DE MUNIÇÃO */}
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
      {/* MODAL 2: SELEÇÃO DE COFRES PARA IMPRESSÃO DE RELATÓRIO          */}
      {/* CRITICAL USER REQUIREMENT:                                     */}
      {/* - Pergunta se deseja imprimir locais de cofres vazios ou       */}
      {/*   somente os com munições.                                     */}
      {/* - Imprime somente assinatura do armeiro responsável.           */}
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

            {/* CRITICAL QUESTION: Deseja imprimir locais de cofres vazios ou somente os com munições? */}
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
              <p>• O relatório conterá <strong>somente a assinatura do armeiro responsável</strong>.</p>
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
      {/* MODAL 3: MOVIMENTAÇÃO (ENTRADA / SAÍDA RÁPIDA)                  */}
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
                  onChange={e => setMovStockId(e.target.value)}
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
      {/* MODAL 4: DEVOLUÇÃO DE MUNIÇÕES NÃO DEFLAGRADAS                 */}
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
      {/* MODAL 5: CADASTRAR / EDITAR CALIBRE                            */}
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
      {/* MODAL 6: TRANSFERIR MUNIÇÕES ENTRE UNIDADES                    */}
      {/* ============================================================== */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Transferir Munições para Outra Unidade
                  </h3>
                  <p className="text-xs text-slate-400">
                    Origem: {selectedUnitObj?.name || 'Unidade Atual'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-4">
              
              {/* Destino */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Departamento de Destino *
                  </label>
                  <select
                    value={transfDestDeptId}
                    onChange={e => {
                      setTransfDestDeptId(e.target.value);
                      const dUnits = units.filter(u => u.departmentId === e.target.value && u.id !== selectedUnitId);
                      setTransfDestUnitId(dUnits[0]?.id || '');
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unidade de Destino *
                  </label>
                  <select
                    value={transfDestUnitId}
                    onChange={e => setTransfDestUnitId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {units
                      .filter(u => (!transfDestDeptId || u.departmentId === transfDestDeptId) && u.id !== selectedUnitId)
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Lotes Selecionados para Transferir */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Lotes de Munição a Enviar ({transfItems.length}):
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Clique em "+ Adicionar" nos lotes disponíveis abaixo
                  </span>
                </div>

                {transfItems.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                    Nenhum lote adicionado à transferência ainda.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {transfItems.map((item, idx) => (
                      <div key={item.stockId} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                        <div>
                          <strong className="text-slate-200">{item.caliberName}</strong>
                          <span className="text-slate-400 ml-1.5 font-mono text-[11px]">
                            (Lote: {item.loteMunicao || 'S/L'} • Cofre {item.originVaultCode})
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="text-[11px] text-slate-400">Qtd:</label>
                          <input
                            type="number"
                            min={1}
                            max={item.maxQuantity}
                            value={item.quantity}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10) || 1;
                              setTransfItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                            }}
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => setTransfItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Available stocks in current unit to add */}
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Lotes em Estoque na Unidade Atual:
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                    {filteredStocks.map(stock => {
                      const cal = calibers.find(c => c.id === stock.caliberId);
                      const vault = vaultSpaces.find(v => v.id === stock.vaultSpaceId);
                      const isAdded = transfItems.some(i => i.stockId === stock.id);

                      return (
                        <div key={stock.id} className="flex items-center justify-between text-xs py-1 px-2 hover:bg-slate-900 rounded">
                          <div>
                            <span className="text-slate-200 font-semibold">{cal?.name}</span>
                            <span className="text-slate-500 text-[11px] ml-1.5">
                              Lote: {stock.loteMunicao || 'S/L'} • Cofre {vault?.code} (Disp: {stock.quantity})
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isAdded || stock.quantity <= 0}
                            onClick={() => handleAddStockToTransfer(stock)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-400 text-[11px] font-bold rounded"
                          >
                            {isAdded ? 'Adicionado' : '+ Adicionar'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recebedor / Transportador */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Transportador / Recebedor *
                  </label>
                  <input
                    type="text"
                    required
                    value={transfReceiverName}
                    onChange={e => setTransfReceiverName(e.target.value)}
                    placeholder="Nome do Policial"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    MASP do Transportador *
                  </label>
                  <input
                    type="text"
                    required
                    value={transfReceiverMasp}
                    onChange={e => setTransfReceiverMasp(e.target.value)}
                    placeholder="Ex: 1234567"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Cargo
                  </label>
                  <input
                    type="text"
                    value={transfReceiverCargo}
                    onChange={e => setTransfReceiverCargo(e.target.value)}
                    placeholder="Ex: Investigador"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Motivo da Transferência *
                </label>
                <input
                  type="text"
                  required
                  value={transfReason}
                  onChange={e => setTransfReason(e.target.value)}
                  placeholder="Ex: Reforço operacional, treinamento agendado"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={transfItems.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition flex items-center space-x-1.5 shadow"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar Transferência</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 7: RECEBIMENTO DE TRANSFERÊNCIA DE MUNIÇÕES              */}
      {/* ============================================================== */}
      {receivingTransferId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[999] overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95 my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Dar Recibo em Munições Recebidas
                  </h3>
                  <p className="text-xs text-slate-400">
                    Selecione o cofre da sua unidade onde serão guardadas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReceivingTransferId(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReceiveTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Cofre de Munição de Destino *
                </label>
                <select
                  required
                  value={receiveDestVaultId}
                  onChange={e => setReceiveDestVaultId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {candidateAmmoVaults.map(v => (
                    <option key={v.id} value={v.id}>
                      Cofre {v.code} ({v.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações do Recebimento (Opcional)
                </label>
                <input
                  type="text"
                  value={receiveObs}
                  onChange={e => setReceiveObs(e.target.value)}
                  placeholder="Ex: Material conferido e lacrado em perfeito estado"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReceivingTransferId(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Entrada no Cofre</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 8: CONFIRMAR EXCLUSÃO                                    */}
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
