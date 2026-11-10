import React, { useState, useMemo, useEffect } from 'react';
import { User, Caliber, AmmunitionStock, AmmunitionMovement, VaultSpace, Department, Unit, AmmoMovementType, isUserExplosivista } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Disc, Plus, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, AlertCircle, AlertTriangle, Check, Shield, Search, Trash2, Printer, RotateCcw, UserX, UserCheck, Building, ChevronDown, ChevronUp, ChevronRight, Edit2, Filter, Eye, X, History, FileText } from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { printDocumentInPage } from '../utils/printHelper';
import { ModalTransferirMunicao } from './ModalTransferirMunicao';
import { ModalHistoricoTransferenciasMunicao } from './ModalHistoricoTransferenciasMunicao';

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
  const [showCaliberModal, setShowCaliberModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [transferTargetStock, setTransferTargetStock] = useState<AmmunitionStock | null>(null);

  // Ammo/Caliber Form & Edit State (Inside Cadastro de Munição Modal: Fabricante, Calibre, Tipo, Peso)
  const [caliberFabricante, setCaliberFabricante] = useState('');
  const [caliberName, setCaliberName] = useState('');
  const [caliberTipo, setCaliberTipo] = useState('');
  const [caliberPeso, setCaliberPeso] = useState('');
  const [editingCaliber, setEditingCaliber] = useState<Caliber | null>(null);

  // Ammo Movement Form
  const [movementType, setMovementType] = useState<AmmoMovementType>('Saída');
  const [selectedCaliberId, setSelectedCaliberId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [recipientOrReason, setRecipientOrReason] = useState('Curso ou Teste');

  // Cascading Selection State for Entrada de Munição
  const [entryFabricante, setEntryFabricante] = useState('');
  const [entryTipo, setEntryTipo] = useState('');
  const [entryPeso, setEntryPeso] = useState('');
  const [entryLote, setEntryLote] = useState('');
  const [entryAnoFabricacao, setEntryAnoFabricacao] = useState<number>(new Date().getFullYear());
  const [entryDestinacao, setEntryDestinacao] = useState('Operacional');

  // Responsible Officer Form State
  const [responsibleType, setResponsibleType] = useState<'SISTEMA' | 'FORA_DO_SISTEMA'>('SISTEMA');
  const [selectedResponsibleUserId, setSelectedResponsibleUserId] = useState('');
  const [customResponsibleName, setCustomResponsibleName] = useState('');
  const [customResponsibleMasp, setCustomResponsibleMasp] = useState('');

  // Observation (max 500 chars)
  const [observation, setObservation] = useState('');

  // Return Unused Ammo Modal State
  const [returnTargetMov, setReturnTargetMov] = useState<AmmunitionMovement | null>(null);
  const [returnQuantity, setReturnQuantity] = useState<number>(0);

  // General Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCaliberId, setFilterCaliberId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>(() => {
    if (currentUser.role === 'Geral') return 'ALL';
    return currentUser.departmentId || '';
  });
  const [filterUnitId, setFilterUnitId] = useState<string>(() => {
    if (currentUser.role === 'Geral') return 'ALL';
    return currentUser.unitId || '';
  });

  // Modal de Seleção de Cofres para Impressão
  const [showPrintVaultSelectModal, setShowPrintVaultSelectModal] = useState(false);
  const [selectedVaultIdsForReport, setSelectedVaultIdsForReport] = useState<string[]>([]);

  // Expanded departments accordion
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);

  // Movement Log Column Filters
  const [colFilterData, setColFilterData] = useState('');
  const [colFilterTipo, setColFilterTipo] = useState('');
  const [colFilterCalibre, setColFilterCalibre] = useState('');
  const [colFilterQtd, setColFilterQtd] = useState('');
  const [colFilterLocal, setColFilterLocal] = useState('');
  const [colFilterMotivo, setColFilterMotivo] = useState('');
  const [colFilterPolicial, setColFilterPolicial] = useState('');
  const [colFilterDevolucao, setColFilterDevolucao] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetAmmo, setDeleteTargetAmmo] = useState<{ type: 'caliber' | 'stock' | 'movement'; id: string; label: string } | null>(null);

  // Edit Ammo Stock Modal State (Fabricante, Lote, Tipo, Peso, Destinação, Ano, Quantidade e Transferência de Cofre)
  const [editingStock, setEditingStock] = useState<{
    stock: AmmunitionStock;
    caliberId: string;
    fabricante: string;
    tipoMunicao: string;
    pesoMunicao: string;
    loteMunicao: string;
    anoFabricacao: string | number;
    destinacao: string;
    quantity: number;
    additionalInfo: string;
    targetVaultSpaceId: string;
    transferMode: 'ALL' | 'PARTIAL';
    transferQuantity: number;
    transferObservation: string;
  } | null>(null);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [lotSelectionForEdit, setLotSelectionForEdit] = useState<{ stocks: AmmunitionStock[]; onSelect: (s: AmmunitionStock) => void } | null>(null);

  // Quick Direct Vault Movement State (Entrada direto no cofre)
  const [quickVaultMovement, setQuickVaultMovement] = useState<{
    stock: AmmunitionStock;
    type: 'Entrada' | 'Saída';
    quantity: number;
    responsibleType: 'SISTEMA' | 'FORA_DO_SISTEMA';
    responsibleUserId: string;
    responsibleName: string;
    responsibleMasp: string;
  } | null>(null);
  const [isSubmittingQuickMovement, setIsSubmittingQuickMovement] = useState(false);

  // Vault Movement History Modal State (detalhes iniciam ocultos e só mostram se selecionados)
  const [vaultHistoryStock, setVaultHistoryStock] = useState<AmmunitionStock | null>(null);
  const [selectedHistoryMovId, setSelectedHistoryMovId] = useState<string | null>(null);
  const [historyFilterCaliber, setHistoryFilterCaliber] = useState<boolean>(true);

  // Histórico de Movimentação Accordion State (inicia oculto igual aos cofres)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const isExplosivista = isUserExplosivista(currentUser);
  const canManageStock = isGeral || isArmeiro || isAdmin || isExplosivista || (currentUser.role === 'Policial' && currentUser.canMoveAmmunition);

  // User unit for restricted vault viewing
  const userUnit = units.find(u => u.id === currentUser.unitId);

  // Available vault spaces for ammo: MUST BE TYPE MUNIÇÕES
  const ammoVaultSpaces = vaultSpaces.filter(v => v.type === 'MUNIÇÕES');

  // Vault spaces for Entrada: visible ONLY the vaults of the user's unit
  const entryVaultSpaces = useMemo(() => {
    if (isGeral) return ammoVaultSpaces;
    const targetUnitId = currentUser.unitId || userUnit?.id;
    const unitVaults = ammoVaultSpaces.filter(v => v.unitId === targetUnitId);
    return unitVaults.length > 0 ? unitVaults : ammoVaultSpaces;
  }, [ammoVaultSpaces, isGeral, currentUser.unitId, userUnit]);

  // Unique manufacturers from registered calibers / ammo catalog
  const availableFabricantes = useMemo(() => {
    const fromCalibers = calibers.map(c => c.fabricante?.trim()).filter(Boolean) as string[];
    const set = Array.from(new Set(fromCalibers));
    if (set.length === 0) {
      return ['CBC', 'Magtech', 'Federal', 'Winchester', 'Sellier & Bellot', 'Fiocchi', 'Taurus'];
    }
    return set;
  }, [calibers]);

  // Calibers registered under the selected manufacturer
  const availableCalibresForFabricante = useMemo(() => {
    if (!entryFabricante) return calibers;
    const filtered = calibers.filter(c => (c.fabricante || '').toLowerCase() === entryFabricante.toLowerCase());
    return filtered.length > 0 ? filtered : calibers;
  }, [calibers, entryFabricante]);

  // Types registered under the selected caliber and manufacturer
  const availableTiposForCalibre = useMemo(() => {
    const matching = availableCalibresForFabricante.filter(c => c.id === selectedCaliberId || c.name === selectedCaliberId);
    const tipos = Array.from(new Set(matching.map(c => c.tipo?.trim()).filter(Boolean) as string[]));
    return tipos.length > 0 ? tipos : ['Ogival (ETOG)', 'Ponta Oca (EXPO / JHP)', 'FMJ', 'Treinamento', 'Operacional', 'Frangível', 'Traçante'];
  }, [availableCalibresForFabricante, selectedCaliberId]);

  // Weights registered under the selected caliber, manufacturer and type
  const availablePesosForTipo = useMemo(() => {
    const matching = availableCalibresForFabricante.filter(c => 
      (c.id === selectedCaliberId || c.name === selectedCaliberId) &&
      (!entryTipo || c.tipo === entryTipo)
    );
    const pesos = Array.from(new Set(matching.map(c => c.peso?.trim()).filter(Boolean) as string[]));
    return pesos.length > 0 ? pesos : ['115 gr', '124 gr', '147 gr', '180 gr', '165 gr', '55 gr', '62 gr', '158 gr', '230 gr'];
  }, [availableCalibresForFabricante, selectedCaliberId, entryTipo]);

  // Locations available for ammo exit: ONLY locations that possess stock of selectedCaliberId (> 0)
  // Formatted with observation instead of unit: ( L1 C1 - 5,56X45MM - SAT )
  const availableLocationsForExit = useMemo(() => {
    if (movementType !== 'Saída' || !selectedCaliberId) return [];

    const matchingStocks = stocks.filter(s => s.caliberId === selectedCaliberId && s.quantity > 0);

    return matchingStocks.map(st => {
      const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
      const unit = units.find(u => u.id === st.unitId);
      const dept = departments.find(d => d.id === st.departmentId);

      // Find movement observation for this caliber and vault space
      const stockMovs = movements.filter(m => m.vaultSpaceId === st.vaultSpaceId && m.caliberId === st.caliberId);
      const entryMov = stockMovs.find(m => m.type === 'Entrada' && (m.observation || m.recipientOrReason)) ||
                       stockMovs.find(m => m.observation || m.recipientOrReason) ||
                       stockMovs[0];

      const rawObs = entryMov?.observation
        ? entryMov.observation.trim()
        : (entryMov?.recipientOrReason ? entryMov.recipientOrReason.trim() : 'SAT');
      const obs = rawObs.toUpperCase();

      const calObj = calibers.find(c => c.id === st.caliberId);
      const calName = (calObj ? calObj.name : '').toUpperCase();
      const vCode = (vault ? vault.code : 'COFRE').toUpperCase();

      // Formatted label as requested: ( L1 C1 - 5,56X45MM - SAT )
      const formattedLabel = `( ${vCode} - ${calName} - ${obs} ) - Saldo: ${st.quantity} un.`;

      return {
        vaultSpaceId: st.vaultSpaceId,
        stockId: st.id,
        quantity: st.quantity,
        vCode,
        calName,
        obs,
        formattedLabel,
        unitName: unit ? unit.name : '',
        deptCode: dept ? dept.code : ''
      };
    });
  }, [movementType, selectedCaliberId, stocks, vaultSpaces, units, departments, movements, calibers]);

  // Selected stock object for the currently chosen vault when performing Saída
  const selectedExitStock = useMemo(() => {
    if (movementType !== 'Saída') return null;
    return availableLocationsForExit.find(loc => loc.vaultSpaceId === selectedVaultId) || null;
  }, [movementType, availableLocationsForExit, selectedVaultId]);

  // Ensure selectedVaultId stays valid when selectedCaliberId or movementType changes
  useEffect(() => {
    if (movementType === 'Saída') {
      const exists = availableLocationsForExit.some(loc => loc.vaultSpaceId === selectedVaultId);
      if (!exists && availableLocationsForExit.length > 0) {
        setSelectedVaultId(availableLocationsForExit[0].vaultSpaceId);
      } else if (availableLocationsForExit.length === 0) {
        setSelectedVaultId('');
      }
    }
  }, [selectedCaliberId, movementType, availableLocationsForExit, selectedVaultId]);

  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  // Open Movement Modal specifically for ENTRADA or SAÍDA
  const handleOpenMovementModal = (type: AmmoMovementType, initialDeptId?: string, initialUnitId?: string) => {
    setErrorMsg('');
    setMovementType(type);
    const initialCalId = calibers[0]?.id || '';
    setSelectedCaliberId(initialCalId);
    setQuantity(100);

    let matchingVaults = ammoVaultSpaces;
    if (initialUnitId) {
      matchingVaults = ammoVaultSpaces.filter(v => v.unitId === initialUnitId);
    } else if (initialDeptId) {
      matchingVaults = ammoVaultSpaces.filter(v => v.departmentId === initialDeptId);
    }

    if (type === 'Saída') {
      const exitStocks = stocks.filter(s => s.caliberId === initialCalId && s.quantity > 0);
      if (initialUnitId) {
        const uStocks = exitStocks.filter(s => s.unitId === initialUnitId);
        setSelectedVaultId(uStocks[0]?.vaultSpaceId || exitStocks[0]?.vaultSpaceId || '');
      } else if (initialDeptId) {
        const dStocks = exitStocks.filter(s => s.departmentId === initialDeptId);
        setSelectedVaultId(dStocks[0]?.vaultSpaceId || exitStocks[0]?.vaultSpaceId || '');
      } else {
        setSelectedVaultId(exitStocks[0]?.vaultSpaceId || '');
      }
    } else {
      const initialFab = availableFabricantes[0] || 'CBC';
      setEntryFabricante(initialFab);
      const matchingCals = calibers.filter(c => (c.fabricante || '').toLowerCase() === initialFab.toLowerCase());
      const firstCal = matchingCals[0] || calibers[0];
      setSelectedCaliberId(firstCal?.id || '');
      setEntryTipo(firstCal?.tipo || 'Operacional');
      setEntryPeso(firstCal?.peso || '124 gr');
      setEntryLote('');
      setEntryAnoFabricacao(new Date().getFullYear());
      setEntryDestinacao('Operacional');

      const targetUnitId = currentUser.unitId || userUnit?.id;
      const unitVaults = ammoVaultSpaces.filter(v => v.unitId === targetUnitId);
      setSelectedVaultId(unitVaults[0]?.id || matchingVaults[0]?.id || ammoVaultSpaces[0]?.id || '');
    }

    setRecipientOrReason(type === 'Entrada' ? 'Abastecimento do Cofre' : 'Curso ou Teste');
    
    setResponsibleType('SISTEMA');
    setSelectedResponsibleUserId(users[0]?.id || '');
    setCustomResponsibleName('');
    setCustomResponsibleMasp('');
    setObservation('');

    setShowMovementModal(true);
  };

  // Save Ammo / Caliber (Cadastro de Munição: Fabricante, Calibre, Tipo, Peso)
  const handleSaveCaliber = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!caliberName.trim()) {
      setErrorMsg('Informe o calibre da munição.');
      return;
    }

    try {
      if (editingCaliber) {
        await storage.updateCaliber(
          editingCaliber.id,
          caliberName.trim(),
          caliberFabricante.trim() || undefined,
          caliberTipo.trim() || undefined,
          caliberPeso.trim() || undefined
        );
        setSuccessMsg(`Cadastro de munição "${caliberName.trim()}" atualizado com sucesso.`);
      } else {
        await storage.addCaliber(
          caliberName.trim(),
          caliberFabricante.trim() || undefined,
          caliberTipo.trim() || undefined,
          caliberPeso.trim() || undefined
        );
        setSuccessMsg(`Cadastro de munição "${caliberName.trim()}" realizado com sucesso.`);
      }
      setCaliberFabricante('');
      setCaliberName('');
      setCaliberTipo('');
      setCaliberPeso('');
      setEditingCaliber(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar cadastro de munição.');
    }
  };

  const handleDeleteCaliber = (cal: Caliber) => {
    setDeleteTargetAmmo({ type: 'caliber', id: cal.id, label: `o calibre "${cal.name}"` });
  };

  const handleDeleteStock = (st: AmmunitionStock) => {
    const cal = calibers.find(c => c.id === st.caliberId);
    setDeleteTargetAmmo({ 
      type: 'stock', 
      id: st.id, 
      label: `o registro de estoque de ${st.quantity} un (${cal?.name || 'Calibre'})` 
    });
  };

  const handleDeleteAmmoMovement = (m: AmmunitionMovement) => {
    const cal = calibers.find(c => c.id === m.caliberId);
    setDeleteTargetAmmo({ 
      type: 'movement', 
      id: m.id, 
      label: `o lançamento de movimentação (${m.type} de ${m.quantity} un de ${cal?.name || m.caliberId})` 
    });
  };

  const confirmExecuteDeleteAmmo = async () => {
    if (!deleteTargetAmmo) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetAmmo.type === 'caliber') {
        await storage.deleteCaliber(deleteTargetAmmo.id);
        setSuccessMsg(`Calibre excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'stock') {
        await storage.deleteAmmoStock(deleteTargetAmmo.id, currentUser);
        setSuccessMsg(`Registro de estoque excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'movement') {
        await storage.deleteAmmoMovement(deleteTargetAmmo.id, currentUser);
        setSuccessMsg(`Lançamento de munição excluído com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
    } finally {
      setDeleteTargetAmmo(null);
    }
  };

  // Open Edit Stock Modal (Alteração completa das especificações da munição e transferência de cofre)
  const handleOpenEditStock = (st: AmmunitionStock, currentObs: string) => {
    setEditingStock({
      stock: st,
      caliberId: st.caliberId,
      fabricante: st.fabricante || '',
      tipoMunicao: st.tipoMunicao || '',
      pesoMunicao: st.pesoMunicao || '',
      loteMunicao: st.loteMunicao || '',
      anoFabricacao: st.anoFabricacao || new Date().getFullYear(),
      destinacao: st.destinacao || 'Operacional',
      quantity: st.quantity,
      additionalInfo: currentObs || '',
      targetVaultSpaceId: st.vaultSpaceId,
      transferMode: 'ALL',
      transferQuantity: st.quantity,
      transferObservation: ''
    });
  };

  // Save Stock Edit
  const handleSaveStockEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsSavingStock(true);
    try {
      const isTransferring = Boolean(
        editingStock.targetVaultSpaceId && 
        editingStock.targetVaultSpaceId !== editingStock.stock.vaultSpaceId
      );
      const transferQty = editingStock.transferMode === 'ALL' ? editingStock.quantity : editingStock.transferQuantity;
      
      const destVault = vaultSpaces.find(v => v.id === editingStock.targetVaultSpaceId);
      const origVault = vaultSpaces.find(v => v.id === editingStock.stock.vaultSpaceId);

      await storage.updateAmmoStock(
        editingStock.stock.id,
        {
          quantity: editingStock.quantity,
          caliberId: editingStock.caliberId,
          fabricante: editingStock.fabricante || undefined,
          tipoMunicao: editingStock.tipoMunicao || undefined,
          pesoMunicao: editingStock.pesoMunicao || undefined,
          loteMunicao: editingStock.loteMunicao || undefined,
          anoFabricacao: editingStock.anoFabricacao || undefined,
          destinacao: editingStock.destinacao || undefined,
          additionalInfo: editingStock.additionalInfo,
          targetVaultSpaceId: isTransferring ? editingStock.targetVaultSpaceId : undefined,
          transferQuantity: isTransferring ? transferQty : undefined,
          transferObservation: isTransferring ? (editingStock.transferObservation || `Transferência do cofre ${origVault?.code || ''} para ${destVault?.code || ''}`) : undefined
        },
        currentUser
      );
      
      if (isTransferring) {
        setSuccessMsg(`Informações da munição atualizadas e ${transferQty} unidade(s) transferida(s) com sucesso para o cofre ${destVault?.code || ''}.`);
      } else {
        setSuccessMsg('Informações da munição alteradas com sucesso no cofre.');
      }
      setEditingStock(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar informações da munição.');
    } finally {
      setIsSavingStock(false);
    }
  };

  // Open Direct Vault Movement (Entrada ou Saída direto no cofre)
  const handleOpenQuickMovement = (st: AmmunitionStock, type: 'Entrada' | 'Saída') => {
    const activeUsers = users.length > 0 ? users : storage.getUsers();
    const defaultUser = activeUsers.find(u => u.id === currentUser.id) || activeUsers[0] || currentUser;
    setQuickVaultMovement({
      stock: st,
      type,
      quantity: type === 'Entrada' ? 50 : Math.min(50, st.quantity || 1),
      responsibleType: 'SISTEMA',
      responsibleUserId: defaultUser?.id || '',
      responsibleName: defaultUser?.name || currentUser.name,
      responsibleMasp: defaultUser?.masp || currentUser.masp
    });
  };

  // Save Direct Vault Movement (Inserindo apenas quantidade e policial responsável)
  const handleSaveQuickMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVaultMovement) return;
    const { stock, type, quantity: movQty, responsibleType, responsibleUserId, responsibleName, responsibleMasp } = quickVaultMovement;

    if (movQty <= 0) {
      setErrorMsg('A quantidade deve ser maior que zero.');
      return;
    }

    if (type === 'Saída' && movQty > stock.quantity) {
      setErrorMsg(`Quantidade de saída (${movQty}) não pode exceder o estoque disponível no cofre (${stock.quantity} un).`);
      return;
    }

    if (responsibleType === 'SISTEMA' && !responsibleUserId) {
      setErrorMsg('Selecione o policial responsável pela movimentação.');
      return;
    }

    if (responsibleType === 'FORA_DO_SISTEMA' && (!responsibleName.trim() || !responsibleMasp.trim())) {
      setErrorMsg('Informe o nome e o MASP do policial responsável.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmittingQuickMovement(true);
    try {
      const activeUsers = users.length > 0 ? users : storage.getUsers();
      const respUser = activeUsers.find(u => u.id === responsibleUserId);
      const finalName = responsibleType === 'SISTEMA' ? (respUser?.name || currentUser.name) : responsibleName.trim();
      const finalMasp = responsibleType === 'SISTEMA' ? (respUser?.masp || currentUser.masp) : responsibleMasp.trim();

      await storage.addAmmoMovement({
        type,
        caliberId: stock.caliberId,
        quantity: movQty,
        vaultSpaceId: stock.vaultSpaceId,
        recipientOrReason: type === 'Entrada' ? 'Abastecimento direto no cofre' : 'Saída direta do cofre',
        responsibleType,
        responsibleUserId: responsibleType === 'SISTEMA' ? responsibleUserId : undefined,
        responsibleName: finalName,
        responsibleMasp: finalMasp,
        observation: ''
      });

      const vault = vaultSpaces.find(v => v.id === stock.vaultSpaceId);
      setSuccessMsg(`${type} de ${movQty} unidades registrada com sucesso no cofre ${vault?.code || ''}.`);
      setQuickVaultMovement(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || `Erro ao registrar ${type.toLowerCase()} de munição no cofre.`);
    } finally {
      setIsSubmittingQuickMovement(false);
    }
  };

  // Save Movement (Entrada / Saída)
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCaliberId) {
      setErrorMsg('Selecione o calibre.');
      return;
    }
    if (!selectedVaultId) {
      setErrorMsg('Selecione um local do cofre para munições.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Informe uma quantidade válida maior que zero.');
      return;
    }

    if (movementType === 'Saída') {
      const stock = stocks.find(s => s.vaultSpaceId === selectedVaultId && s.caliberId === selectedCaliberId);
      const availableQty = stock ? stock.quantity : 0;
      if (availableQty <= 0) {
        setErrorMsg('O local selecionado não possui estoque disponível para este calibre.');
        return;
      }
      if (quantity > availableQty) {
        setErrorMsg(`Quantidade solicitada (${quantity} un.) é superior ao saldo disponível no cofre (${availableQty} un.).`);
        return;
      }
    }

    let respName = '';
    let respMasp = '';
    let respUserId = '';

    if (responsibleType === 'SISTEMA') {
      const foundUser = users.find(u => u.id === selectedResponsibleUserId);
      if (!foundUser) {
        setErrorMsg('Selecione o policial responsável no sistema.');
        return;
      }
      respName = foundUser.name;
      respMasp = foundUser.masp;
      respUserId = foundUser.id;
    } else {
      if (!customResponsibleName.trim()) {
        setErrorMsg('Informe o nome do policial responsável (fora do sistema).');
        return;
      }
      respName = customResponsibleName.trim();
      respMasp = customResponsibleMasp.trim();
    }

    try {
      await storage.recordAmmoMovement({
        type: movementType,
        caliberId: selectedCaliberId,
        quantity,
        vaultSpaceId: selectedVaultId,
        recipientOrReason: movementType === 'Entrada' ? (entryDestinacao ? `Entrada - ${entryDestinacao}` : recipientOrReason) : recipientOrReason,
        fabricante: movementType === 'Entrada' ? (entryFabricante || undefined) : undefined,
        tipoMunicao: movementType === 'Entrada' ? (entryTipo || undefined) : undefined,
        pesoMunicao: movementType === 'Entrada' ? (entryPeso || undefined) : undefined,
        loteMunicao: movementType === 'Entrada' ? (entryLote || undefined) : undefined,
        anoFabricacao: movementType === 'Entrada' ? (entryAnoFabricacao || undefined) : undefined,
        destinacao: movementType === 'Entrada' ? (entryDestinacao || undefined) : undefined,
        responsibleType,
        responsibleUserId: respUserId,
        responsibleName: respName,
        responsibleMasp: respMasp,
        observation: observation.slice(0, 500)
      });

      setSuccessMsg(`Movimentação de ${movementType} de munição registrada com sucesso!`);
      setShowMovementModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação.');
    }
  };

  // Direct Print Receipt PDF function (In-page browser print, no popup modal, no extra tab)
  const handlePrintDirectReceipt = (m: AmmunitionMovement, isReturn: boolean = false, returnAmt?: number) => {
    const caliber = calibers.find(c => c.id === m.caliberId);
    const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);

    const responsibleText = m.responsibleName 
      ? `${m.responsibleName}${m.responsibleMasp ? ` (MASP/Doc: ${m.responsibleMasp})` : ''}`
      : m.recipientOrReason;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Munição - ${caliber?.name || 'Munição'}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .reg-id { font-family: monospace; font-size: 12px; font-weight: bold; text-align: right; }
          .status-bar { background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; font-family: monospace; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .box { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; font-family: monospace; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; letter-spacing: 0.5px; }
          .field { margin-bottom: 6px; }
          .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .val { font-size: 12px; font-weight: bold; color: #000; }
          .signatures { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMARIA • COMPROVANTE DE MOVIMENTAÇÃO DE MUNIÇÃO</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${m.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>TIPO:</strong> ${isReturn ? 'DEVOLUÇÃO DE MUNIÇÃO' : (m.type === 'Saída' ? 'SAÍDA / FORNECIMENTO' : 'ENTRADA / REPOSIÇÃO')}</div>
          <div><strong>Data:</strong> ${formatTimestamp(m.createdAt)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados da Munição</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Calibre:</span> <span class="val">${caliber?.name || m.caliberId}</span></div>
            <div class="field"><span class="label">Quantidade:</span> <span class="val">${isReturn ? (returnAmt || m.returnedQuantity || 0) : m.quantity} unidades</span></div>
            <div class="field"><span class="label">Cofre:</span> <span class="val">${vault?.code || 'Cofre Principal'}</span></div>
            <div class="field"><span class="label">Operador:</span> <span class="val">${m.userName}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Responsável e Motivo</div>
          <div class="field"><span class="label">Responsável:</span> <span class="val">${responsibleText}</span></div>
          <div class="field"><span class="label">Motivo / Destino:</span> <span class="val">${m.recipientOrReason}</span></div>
          ${m.observation ? `<div class="field" style="margin-top: 6px;"><span class="label">Observações:</span> <span class="val" style="font-weight: normal;">${m.observation}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${m.responsibleName || 'Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Responsável</span>
          </div>
          <div class="sig-line">
            ${m.userName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Operador</span>
          </div>
        </div>

        <div class="footer">
          Documento impresso eletronicamente pelo Sistema de Armeria em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Print Vault Movement History Report
  const handlePrintVaultHistoryReport = (targetStock: AmmunitionStock, historyMovs: AmmunitionMovement[]) => {
    const vault = vaultSpaces.find(v => v.id === targetStock.vaultSpaceId);
    const unit = units.find(u => u.id === targetStock.unitId);
    const dept = departments.find(d => d.id === targetStock.departmentId);
    const cal = calibers.find(c => c.id === targetStock.caliberId);

    const totalEntradas = historyMovs
      .filter(m => m.type === 'Entrada')
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalSaidas = historyMovs
      .filter(m => m.type === 'Saída')
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalDevolvido = historyMovs
      .reduce((sum, m) => sum + (m.returnedQuantity || 0), 0);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Movimentações - Cofre ${vault?.code || ''}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 15px; font-size: 11px; line-height: 1.35; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; }
          .subtitle { font-size: 11px; font-weight: bold; color: #374151; margin-top: 2px; }
          .meta-box { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-family: monospace; font-size: 11px; }
          .meta-item .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .meta-item .val { font-size: 11px; font-weight: bold; color: #000; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
          th { background: #f9fafb; font-weight: bold; text-transform: uppercase; font-size: 9px; color: #374151; }
          .badge-entrada { background: #dcfce7; color: #166534; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 9px; display: inline-block; }
          .badge-saida { background: #fef3c7; color: #92400e; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 9px; display: inline-block; }
          .footer { margin-top: 25px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 8px; }
          .signatures { margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 10px; }
          .sig-line { border-top: 1px solid #000; padding-top: 6px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMARIA • RELATÓRIO DE MOVIMENTAÇÕES DE MUNIÇÕES NO COFRE</div>
          </div>
          <div style="text-align: right; font-family: monospace; font-size: 10px;">
            Emissão: ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <div class="meta-box">
          <div class="meta-item"><span class="label">Cofre:</span><span class="val">${vault?.code || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Calibre:</span><span class="val">${historyFilterCaliber ? (cal?.name || 'N/A') : 'Todos os Calibres'}</span></div>
          <div class="meta-item"><span class="label">Unidade:</span><span class="val">${unit?.name || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Departamento:</span><span class="val">${dept?.name || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Estoque Atual:</span><span class="val" style="color: #059669;">${targetStock.quantity} un.</span></div>
          <div class="meta-item"><span class="label">Total Entradas:</span><span class="val">+${totalEntradas} un.</span></div>
          <div class="meta-item"><span class="label">Total Saídas:</span><span class="val">-${totalSaidas} un.</span></div>
          <div class="meta-item"><span class="label">Total Devolvido:</span><span class="val">${totalDevolvido} un.</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Data/Hora</th>
              <th style="width: 10%;">Tipo</th>
              <th style="width: 12%;">Calibre</th>
              <th style="width: 10%; text-align: right;">Qtd</th>
              <th style="width: 20%;">Policial Responsável</th>
              <th style="width: 18%;">Motivo / Destino</th>
              <th style="width: 15%;">Informações Adicionais</th>
            </tr>
          </thead>
          <tbody>
            ${historyMovs.length === 0 ? `
              <tr><td colspan="7" style="text-align: center; color: #6b7280; padding: 15px;">Nenhuma movimentação registrada para este cofre.</td></tr>
            ` : historyMovs.map(m => {
              const mCal = calibers.find(c => c.id === m.caliberId);
              const resp = m.responsibleName ? `${m.responsibleName}${m.responsibleMasp ? ` (${m.responsibleMasp})` : ''}` : (m.recipientOrReason || '-');
              return `
                <tr>
                  <td style="font-family: monospace;">${formatTimestamp(m.createdAt)}</td>
                  <td><span class="${m.type === 'Entrada' ? 'badge-entrada' : 'badge-saida'}">${m.type}</span></td>
                  <td><strong>${mCal?.name || m.caliberId}</strong></td>
                  <td style="text-align: right; font-weight: bold; font-family: monospace;">${m.type === 'Entrada' ? `+${m.quantity}` : `-${m.quantity}`}</td>
                  <td>${resp}</td>
                  <td>${m.recipientOrReason || '-'}</td>
                  <td>${m.observation || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sig-line">
            ${currentUser.name} (MASP: ${currentUser.masp})<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pela Emissão</span>
          </div>
          <div class="sig-line">
            Visto da Chefia / Inspetoria<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Assinatura / Carimbo</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado eletronicamente pelo Sistema de Armeria • Polícia Civil de Minas Gerais
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Candidatos de cofres de MUNIÇÕES para o relatório
  const candidateAmmoVaults = useMemo(() => {
    let list = vaultSpaces.filter(v => v.type === 'MUNIÇÕES');
    if (filterUnitId && filterUnitId !== 'ALL') {
      list = list.filter(v => v.unitId === filterUnitId || (!v.unitId && v.departmentId === filterDepartmentId));
    } else if (filterDepartmentId && filterDepartmentId !== 'ALL') {
      list = list.filter(v => v.departmentId === filterDepartmentId);
    } else if (!isGeral) {
      if (currentUser.unitId) {
        list = list.filter(v => v.unitId === currentUser.unitId || (!v.unitId && v.departmentId === currentUser.departmentId));
      } else if (currentUser.departmentId) {
        list = list.filter(v => v.departmentId === currentUser.departmentId);
      }
    }
    return list;
  }, [vaultSpaces, filterUnitId, filterDepartmentId, isGeral, currentUser]);

  const handleOpenPrintVaultModal = () => {
    const defaultIds = candidateAmmoVaults.map(v => v.id);
    setSelectedVaultIdsForReport(defaultIds);
    setShowPrintVaultSelectModal(true);
  };

  // Impressão de Relatório de Munições por Cofre (um cofre por página, selecionados pelo usuário em comando único)
  const handlePrintUnitAmmoReport = (vaultIdsToPrint?: string[]) => {
    const targetVaults = (vaultIdsToPrint && vaultIdsToPrint.length > 0)
      ? vaultSpaces.filter(v => v.type === 'MUNIÇÕES' && vaultIdsToPrint.includes(v.id))
      : candidateAmmoVaults;

    if (targetVaults.length === 0) {
      setErrorMsg('Nenhum cofre de munições selecionado para impressão.');
      return;
    }

    const defaultUnitId = filterUnitId && filterUnitId !== 'ALL' ? filterUnitId : currentUser.unitId || (units.length > 0 ? units[0].id : '');
    const defaultUnit = units.find(u => u.id === defaultUnitId) || { id: defaultUnitId, name: 'Unidade Policial', departmentId: '' };
    const defaultDept = departments.find(d => d.id === defaultUnit.departmentId) || departments.find(d => d.id === currentUser.departmentId);

    const vaultsHtml = targetVaults.map((v, idx) => {
      const vUnit = units.find(u => u.id === v.unitId) || defaultUnit;
      const vDept = departments.find(d => d.id === (v.departmentId || vUnit.departmentId)) || defaultDept;
      const vStocks = stocks.filter(s => s.vaultSpaceId === v.id);
      const vTotal = vStocks.reduce((sum, s) => sum + s.quantity, 0);
      const isLast = idx === targetVaults.length - 1;

      const vCalibresCount = new Set(vStocks.map(s => s.caliberId)).size;
      const vLotesCount = new Set(vStocks.map(s => s.loteMunicao).filter(Boolean)).size;

      return `
        <div class="vault-report-page ${!isLast ? 'page-break' : ''}">
          <div class="header-table">
            <div class="title-area">
              <h2>POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
              <h3>${vDept ? vDept.name : 'DEPARTAMENTO DE POLÍCIA'} - ${vUnit.name}</h3>
              <h1>RELATÓRIO INDIVIDUAL DE ESTOQUE NO COFRE</h1>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #475569;">
                INVENTÁRIO FÍSICO DO COFRE ${v.code} (MUNIÇÕES) • EMISSÃO: ${new Date().toLocaleString('pt-BR')} • RELATÓRIO ${idx + 1} DE ${targetVaults.length}
              </p>
            </div>
          </div>

          <div class="vault-banner">
            <div>
              <span class="vault-title">COFRE: ${v.code}</span>
              <span class="vault-type-badge">COFRE PARA MUNIÇÕES</span>
            </div>
            <div class="vault-unit-info">
              Unidade: <strong>${vUnit.name}</strong> • Depto: <strong>${vDept ? vDept.name : 'PCMG'}</strong>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-item">
              <div class="label">Total no Cofre</div>
              <div class="val">${vTotal.toLocaleString('pt-BR')} un.</div>
            </div>
            <div class="summary-item">
              <div class="label">Calibres Distintos</div>
              <div class="val">${vCalibresCount}</div>
            </div>
            <div class="summary-item">
              <div class="label">Lotes Distintos</div>
              <div class="val">${vLotesCount}</div>
            </div>
            <div class="summary-item">
              <div class="label">Status do Local</div>
              <div class="val" style="color: ${vTotal > 0 ? '#0284c7' : '#64748b'};">${vTotal > 0 ? 'ATIVO COM CARGA' : 'LIVRE / SEM MUNIÇÕES'}</div>
            </div>
          </div>

          <h4 style="margin: 12px 0 6px 0; font-size: 11px; text-transform: uppercase; background: #0f172a; color: #fff; padding: 5px 8px; border-radius: 3px;">
            MUNIÇÕES ESTOCADAS NO COFRE ${v.code}
          </h4>

          ${vStocks.length === 0 ? `
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 25px; text-align: center; color: #64748b; font-style: italic; margin: 15px 0;">
              Nenhuma munição estocada neste cofre no momento.
            </div>
          ` : `
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 18%;">Calibre</th>
                  <th style="width: 14%;">Fabricante</th>
                  <th style="width: 16%;">Tipo / Projétil</th>
                  <th style="width: 10%;">Peso</th>
                  <th style="width: 14%;">Lote</th>
                  <th style="width: 8%;">Ano</th>
                  <th style="width: 10%;">Destinação</th>
                  <th style="width: 10%; text-align: right;">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                ${vStocks.map(s => {
                  const cal = calibers.find(c => c.id === s.caliberId);
                  const calName = cal ? cal.name : s.caliberId;
                  const fab = s.fabricante || cal?.fabricante || 'CBC';
                  const tipo = s.tipoMunicao || cal?.tipo || 'COMUM';
                  const peso = s.pesoMunicao || cal?.peso || 'N/I';
                  const lote = s.loteMunicao || 'S/L';
                  const ano = s.anoFabricacao || 'N/A';
                  const dest = s.destinacao || 'Operacional';

                  return `
                    <tr>
                      <td><strong>${calName}</strong></td>
                      <td>${fab}</td>
                      <td>${tipo}</td>
                      <td>${peso}</td>
                      <td style="font-family: monospace; font-weight: bold; color: #b45309;">${lote}</td>
                      <td>${ano}</td>
                      <td>${dest}</td>
                      <td class="qty-col">${s.quantity.toLocaleString('pt-BR')} un.</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="vault-footer">
              Subtotal do Cofre ${v.code}: ${vTotal.toLocaleString('pt-BR')} cartuchos
            </div>
          `}

          <div class="signatures">
            <div class="sig-box">
              <strong>${currentUser.name}</strong><br/>
              MASP: ${currentUser.masp || 'Armeiro'}<br/>
              Armeiro / Responsável pelo Material Bélico
            </div>
            <div class="sig-box">
              <strong>Delegado(a) de Polícia / Titular</strong><br/>
              Chefia da ${vUnit.name}<br/>
              Polícia Civil de Minas Gerais
            </div>
          </div>

          <div class="footer-note">
            Cofre ${v.code} (Relatório ${idx + 1} de ${targetVaults.length}) • Documento gerado eletronicamente pelo Sistema de Armaria PCMG • ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Cofres de Munições - ${defaultUnit.name}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            color: #111827;
            background: #fff;
            margin: 0;
            padding: 0;
            line-height: 1.35;
          }
          .vault-report-page {
            box-sizing: border-box;
            min-height: 260mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 8px 0;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .title-area { text-align: center; }
          .title-area h2 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
          .title-area h3 { margin: 2px 0 0 0; font-size: 11px; font-weight: normal; text-transform: uppercase; }
          .title-area h1 { margin: 6px 0 0 0; font-size: 14px; font-weight: bold; text-decoration: underline; }
          .vault-banner {
            background: #0f172a;
            color: #fff;
            padding: 8px 12px;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          .vault-title { font-size: 14px; font-weight: 900; font-family: monospace; letter-spacing: 0.5px; }
          .vault-type-badge { background: #0284c7; color: #fff; font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 3px; margin-left: 8px; }
          .vault-unit-info { font-size: 10px; color: #cbd5e1; }
          .summary-card {
            display: flex;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 14px;
            margin-bottom: 12px;
          }
          .summary-item { text-align: center; }
          .summary-item .label { font-size: 9px; text-transform: uppercase; color: #475569; font-weight: bold; }
          .summary-item .val { font-size: 14px; font-weight: 900; color: #0f172a; font-family: monospace; }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            border: 1px solid #cbd5e1;
          }
          table.data-table th {
            background: #f1f5f9;
            color: #1e293b;
            font-weight: bold;
            text-align: left;
            padding: 6px;
            border-bottom: 1px solid #cbd5e1;
            text-transform: uppercase;
            font-size: 9px;
          }
          table.data-table td {
            padding: 6px;
            border-bottom: 1px solid #e2e8f0;
          }
          table.data-table tr:nth-child(even) { background: #f8fafc; }
          .qty-col { text-align: right; font-family: monospace; font-weight: bold; font-size: 11px; color: #0369a1; }
          .vault-footer {
            background: #f1f5f9;
            padding: 5px 10px;
            display: flex;
            justify-content: flex-end;
            font-weight: bold;
            font-size: 10px;
            border: 1px solid #cbd5e1;
            border-top: none;
            margin-bottom: 15px;
          }
          .signatures {
            margin-top: 25px;
            display: flex;
            justify-content: space-between;
          }
          .sig-box {
            width: 45%;
            text-align: center;
            border-top: 1px solid #000;
            padding-top: 5px;
            font-size: 10px;
          }
          .footer-note {
            margin-top: 15px;
            text-align: center;
            font-size: 9px;
            color: #64748b;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        ${vaultsHtml}
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Submit Unused Ammo Return
  const handleConfirmReturnAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetMov) return;
    setErrorMsg('');
    setSuccessMsg('');

    const maxReturnable = returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0);
    if (returnQuantity <= 0 || returnQuantity > maxReturnable) {
      setErrorMsg(`A quantidade de devolução deve estar entre 1 e ${maxReturnable}.`);
      return;
    }

    try {
      await storage.returnUnusedAmmo(returnTargetMov.id, returnQuantity);
      setSuccessMsg(`Devolução de ${returnQuantity} munições registrada com sucesso.`);
      
      const updatedMov = {
        ...returnTargetMov,
        returnedQuantity: (returnTargetMov.returnedQuantity || 0) + returnQuantity,
        returnedAt: new Date().toISOString(),
        returnedByUserName: currentUser.name
      };

      setReturnTargetMov(null);
      onRefresh();

      // Directly call print browser helper
      handlePrintDirectReceipt(updatedMov, true, returnQuantity);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar devolução.');
    }
  };

  // Filtered Departments to display
  const visibleDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);

  // Available units filtered by department filter
  const availableUnitsForFilter = (filterDepartmentId && filterDepartmentId !== 'ALL')
    ? units.filter(u => u.departmentId === filterDepartmentId)
    : (isGeral ? units : units.filter(u => u.departmentId === currentUser.departmentId));

  const canSelectAllUnits = isGeral || currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const selectedDepartmentObj = departments.find(d => d.id === filterDepartmentId);
  const selectedUnitObj = units.find(u => u.id === filterUnitId);

  // Filtered stocks according to global filters and active search term across all fields
  const term = searchTerm.toLowerCase().trim();
  const filteredStocks = stocks.filter(s => {
    if (filterCaliberId && s.caliberId !== filterCaliberId) return false;
    if (filterDepartmentId && filterDepartmentId !== 'ALL' && s.departmentId !== filterDepartmentId) return false;
    if (filterUnitId && filterUnitId !== 'ALL' && s.unitId !== filterUnitId) return false;

    if (term) {
      const cal = calibers.find(c => c.id === s.caliberId);
      const vault = vaultSpaces.find(v => v.id === s.vaultSpaceId);
      const unit = units.find(u => u.id === s.unitId);
      const dept = departments.find(d => d.id === s.departmentId);

      const calName = (cal?.name || s.caliberId || '').toLowerCase();
      const fab = (s.fabricante || cal?.fabricante || '').toLowerCase();
      const lote = (s.loteMunicao || '').toLowerCase();
      const tipo = (s.tipoMunicao || cal?.tipo || '').toLowerCase();
      const peso = (s.pesoMunicao || cal?.peso || '').toLowerCase();
      const ano = (s.anoFabricacao?.toString() || '').toLowerCase();
      const dest = (s.destinacao || '').toLowerCase();
      const vCode = (vault?.code || '').toLowerCase();
      const uName = (unit?.name || '').toLowerCase();
      const dName = (dept?.name || '').toLowerCase();
      const addInfo = (s.additionalInfo || '').toLowerCase();

      const matches =
        calName.includes(term) ||
        fab.includes(term) ||
        lote.includes(term) ||
        tipo.includes(term) ||
        peso.includes(term) ||
        ano.includes(term) ||
        dest.includes(term) ||
        vCode.includes(term) ||
        uName.includes(term) ||
        dName.includes(term) ||
        addInfo.includes(term);

      if (!matches) return false;
    }

    return true;
  });

  // Filtered movements according to column filters
  const filteredMovements = movements.filter(m => {
    // Global dropdown filters
    if (filterCaliberId && m.caliberId !== filterCaliberId) return false;
    const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);
    const movDeptId = m.departmentId || vault?.departmentId;
    const movUnitId = m.unitId || vault?.unitId;
    if (filterDepartmentId && filterDepartmentId !== 'ALL' && movDeptId && movDeptId !== filterDepartmentId) return false;
    if (filterUnitId && filterUnitId !== 'ALL' && movUnitId && movUnitId !== filterUnitId) return false;

    // Column text/dropdown filters
    if (colFilterData && !formatTimestamp(m.createdAt).toLowerCase().includes(colFilterData.toLowerCase())) return false;
    if (colFilterTipo && m.type !== colFilterTipo) return false;

    const cal = calibers.find(c => c.id === m.caliberId);
    if (colFilterCalibre && cal && !cal.name.toLowerCase().includes(colFilterCalibre.toLowerCase())) return false;

    if (colFilterQtd && !m.quantity.toString().includes(colFilterQtd)) return false;

    const unit = vault ? units.find(u => u.id === vault.unitId) : null;
    const dept = vault ? departments.find(d => d.id === vault.departmentId) : null;
    const localText = `${vault ? vault.code : ''} ${unit ? unit.name : ''} ${dept ? dept.name : ''}`.toLowerCase();
    if (colFilterLocal && !localText.includes(colFilterLocal.toLowerCase())) return false;

    if (colFilterMotivo && !m.recipientOrReason.toLowerCase().includes(colFilterMotivo.toLowerCase()) && !(m.observation || '').toLowerCase().includes(colFilterMotivo.toLowerCase())) return false;

    const respText = `${m.responsibleName || ''} ${m.responsibleMasp || ''}`.toLowerCase();
    if (colFilterPolicial && !respText.includes(colFilterPolicial.toLowerCase())) return false;

    if (colFilterDevolucao) {
      const devText = `${m.returnedQuantity || 0}`.toLowerCase();
      if (!devText.includes(colFilterDevolucao.toLowerCase())) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner with Separate Entrance & Exit Buttons */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Disc className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão e Estoque de Munições por Departamento</h1>
            <p className="text-xs text-slate-400">
              Selecione o departamento para visualizar e registrar entrada ou saída de munição
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Button Cadastro de Munição - Opens Ammo/Caliber Management Modal (Fabricante, Calibre, Tipo, Peso) */}
          {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
            <button
              onClick={() => {
                setErrorMsg('');
                setCaliberFabricante('');
                setCaliberName('');
                setCaliberTipo('');
                setCaliberPeso('');
                setEditingCaliber(null);
                setShowCaliberModal(true);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Cadastro de Munição</span>
            </button>
          )}

          {/* Botão Único: Movimentação de Munições na Unidade */}
          {canManageStock && (
            <button
              onClick={() => handleOpenMovementModal('Entrada')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <ArrowRightLeft className="w-4 h-4 text-white" />
              <span>Movimentação de Munições na Unidade</span>
            </button>
          )}

          {/* Transferência de Unidade & Histórico Buttons */}
          {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
            <>
              <button
                onClick={() => setShowTransferHistoryModal(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Visualizar histórico de transferências de munições entre unidades"
              >
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Histórico Transferências</span>
                {storage.getAmmoTransfers(currentUser, filterUnitId || undefined).length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[10px] font-mono font-bold">
                    {storage.getAmmoTransfers(currentUser, filterUnitId || undefined).length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setTransferTargetStock(null);
                  setShowTransferModal(true);
                }}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Transferir munições para outra unidade policial"
              >
                <ArrowRightLeft className="w-4 h-4 text-white" />
                <span>Transferência de Unidade</span>
              </button>

              {/* Botão de Relatório de Munições da Unidade por Cofre */}
              <button
                type="button"
                onClick={handleOpenPrintVaultModal}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Imprimir relatório completo de todas as munições da unidade com seleção de cofres"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Relatório da Unidade por Cofre</span>
              </button>
            </>
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

      {/* STEP 1: Seleção de Departamento */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
            <Building className="w-4 h-4" />
            <span>1. Selecione o Departamento</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {visibleDepts.length} departamento(s) disponível(is)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {isGeral && (
            <button
              onClick={() => {
                setFilterDepartmentId('ALL');
                setFilterUnitId('ALL');
              }}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                filterDepartmentId === 'ALL' || !filterDepartmentId
                  ? 'bg-amber-500/10 border-amber-500/50 text-slate-100 ring-1 ring-amber-500/30'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 block uppercase">ESTADO</span>
                <span className="text-xs font-bold block truncate" title="Todos os Departamentos da Polícia Civil">Todos os Departamentos</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono block">
                {stocks.reduce((acc, s) => acc + s.quantity, 0)} un. ({stocks.length} lotes)
              </span>
            </button>
          )}

          {visibleDepts.map((d) => {
            const isSelected = d.id === filterDepartmentId;
            const deptStocks = stocks.filter(s => s.departmentId === d.id);
            const deptTotalCartuchos = deptStocks.reduce((acc, s) => acc + s.quantity, 0);

            return (
              <button
                key={d.id}
                onClick={() => {
                  setFilterDepartmentId(d.id);
                  const deptUnits = units.filter(u => u.departmentId === d.id);
                  setFilterUnitId(canSelectAllUnits ? 'ALL' : (deptUnits[0]?.id || ''));
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
                  {deptTotalCartuchos} un. ({deptStocks.length} lotes)
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2: Seleção de Unidade para o Departamento Selecionado */}
      {filterDepartmentId && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
              <ChevronRight className="w-4 h-4" />
              <span>2. Selecione a Unidade em <strong className="text-slate-100">{filterDepartmentId === 'ALL' ? 'Todos os Departamentos' : (selectedDepartmentObj?.name || 'Departamento')}</strong></span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {availableUnitsForFilter.length} unidade(s) encontrada(s)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {canSelectAllUnits && (
              <button
                onClick={() => setFilterUnitId('ALL')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border ${
                  filterUnitId === 'ALL' || !filterUnitId
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Todas as Unidades</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  filterUnitId === 'ALL' || !filterUnitId ? 'bg-slate-950/30 text-slate-950 font-black' : 'bg-slate-900 text-amber-400 border border-slate-800'
                }`}>
                  {stocks.filter(s => filterDepartmentId === 'ALL' || !filterDepartmentId ? true : s.departmentId === filterDepartmentId).length} lotes
                </span>
              </button>
            )}

            {availableUnitsForFilter.map((u) => {
              const isSelected = u.id === filterUnitId;
              const unitStocks = stocks.filter(s => s.unitId === u.id);
              const unitTotalCartuchos = unitStocks.reduce((sum, s) => sum + s.quantity, 0);

              return (
                <button
                  key={u.id}
                  onClick={() => setFilterUnitId(u.id)}
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
                    {unitStocks.length} lotes ({unitTotalCartuchos} un.)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: Barra de Pesquisa Completa de Munições & Filtro de Calibre */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Campo de Pesquisa Aberta em Todos os Campos */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar munição por calibre, fabricante, lote, tipo, peso, destinação, cofre, ano ou detalhes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                title="Limpar termo de pesquisa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Calibre Filter Dropdown */}
            <select
              value={filterCaliberId}
              onChange={(e) => setFilterCaliberId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Todos os Calibres</option>
              {calibers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.fabricante ? `[${c.fabricante}] ` : ''}{c.name}{c.tipo ? ` - ${c.tipo}` : ''}
                </option>
              ))}
            </select>

            {/* Botão de Impressão com Seleção de Cofres */}
            <button
              type="button"
              onClick={handleOpenPrintVaultModal}
              className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2.5 rounded-xl text-xs transition shadow-sm"
              title="Selecionar quais cofres de munições imprimir (cada cofre em página separada)"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>Imprimir Relatório de Cofres</span>
            </button>
          </div>
        </div>

        {/* Linha de Feedback de Resultados da Pesquisa */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <div className="flex items-center space-x-2">
            <span>Exibindo: <strong className="text-slate-200 font-mono">{filteredStocks.length}</strong> lote(s) de munição</span>
            {searchTerm && (
              <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-mono text-[10px]">
                Filtro ativo: "{searchTerm}"
              </span>
            )}
          </div>
          <span className="font-mono text-amber-400 font-semibold">
            {filteredStocks.reduce((acc, s) => acc + s.quantity, 0)} cartuchos totais
          </span>
        </div>
      </div>

      {/* Departments Accordion for Ammunition Stock */}
      <div className="space-y-4">
        {visibleDepts.map((dept) => {
          if (filterDepartmentId && filterDepartmentId !== 'ALL' && dept.id !== filterDepartmentId) return null;

          const deptStocks = filteredStocks.filter(s => s.departmentId === dept.id);
          const isExpanded = filterDepartmentId === 'ALL' || filterDepartmentId === dept.id || expandedDeptIds.includes(dept.id);

          return (
            <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
              
              {/* Department Accordion Header */}
              <div
                onClick={() => toggleDeptExpand(dept.id)}
                className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                        {dept.code}
                      </span>
                      <h2 className="text-base font-bold text-slate-100">{dept.name}</h2>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {deptStocks.length} registro(s) de estoque neste departamento
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
                    {deptStocks.reduce((sum, s) => sum + s.quantity, 0)} un. Totais
                  </span>

                  {/* Direct Entrada / Saída buttons inside department header */}
                  {canManageStock && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenMovementModal('Entrada', dept.id)}
                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition"
                        title="Registrar Movimentação neste departamento"
                      >
                        + Movimentação
                      </button>
                    </div>
                  )}

                  <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Department Stock Cards */}
              {isExpanded && (
                <div className="p-6 bg-slate-950/40 border-t border-slate-800/60">
                  {deptStocks.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      Nenhum estoque de munição registrado para este departamento.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(() => {
                        // Agrupa os registros por cofre (vaultSpaceId) para não duplicar visualmente o mesmo cofre (ex: L3 C2)
                        const vaultMap = new Map<string, AmmunitionStock[]>();
                        deptStocks.forEach(st => {
                          const key = st.vaultSpaceId || `no-vault-${st.id}`;
                          if (!vaultMap.has(key)) {
                            vaultMap.set(key, []);
                          }
                          vaultMap.get(key)!.push(st);
                        });
                        const groupedVaults = Array.from(vaultMap.values());

                        return groupedVaults.map((cofreStocks) => {
                          const primaryStock = cofreStocks[0];
                          const cal = calibers.find(c => c.id === primaryStock.caliberId);
                          const vault = vaultSpaces.find(v => v.id === primaryStock.vaultSpaceId);
                          const unit = units.find(u => u.id === primaryStock.unitId);
                          const totalVaultQty = cofreStocks.reduce((sum, s) => sum + s.quantity, 0);

                          // Movements associated with this stock item / vault
                          const stockMovs = movements.filter(m => 
                            cofreStocks.some(s => s.caliberId === m.caliberId && s.vaultSpaceId === m.vaultSpaceId)
                          );
                          const lastEntry = stockMovs.find(m => m.type === 'Entrada' && m.observation) ||
                                           stockMovs.find(m => m.type === 'Entrada') ||
                                           stockMovs.find(m => m.observation) ||
                                           stockMovs[0];
                          const lastMov = stockMovs[0];
                          const ammoObs = lastEntry?.observation?.trim() || '';
                          const distinctObs = Array.from(new Set(stockMovs.map(m => m.observation?.trim()).filter(Boolean))) as string[];

                          return (
                            <div
                              key={primaryStock.vaultSpaceId || primaryStock.id}
                              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between shadow-sm"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-amber-400 text-base">
                                    {cal ? cal.name : primaryStock.caliberId}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-slate-200 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                                    Cofre: {vault ? vault.code : 'N/A'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  Unidade: <strong className="text-slate-200">{unit ? unit.name : ''}</strong>
                                </p>

                                {/* Especificações Técnicas em formato limpo, vertical e sem células */}
                                <div className="mt-2.5 p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                                  {cofreStocks.map((lotItem, idx) => {
                                    const lotCal = calibers.find(c => c.id === lotItem.caliberId) || cal;
                                    const fab = lotItem.fabricante || lotCal?.fabricante || 'CBC';
                                    const calName = lotCal ? lotCal.name : lotItem.caliberId;
                                    const tipo = lotItem.tipoMunicao || lotCal?.tipo || 'COMUM';
                                    const peso = lotItem.pesoMunicao || lotCal?.peso || 'N/I';
                                    const lote = lotItem.loteMunicao || 'S/L';
                                    const dest = lotItem.destinacao || 'Operacional';
                                    const ano = lotItem.anoFabricacao || 'N/A';
                                    const isZero = lotItem.quantity <= 0;

                                    return (
                                      <div
                                        key={lotItem.id || idx}
                                        className={`text-xs text-slate-200 font-sans leading-relaxed py-2 ${
                                          idx > 0 ? 'border-t border-slate-800/80 mt-2' : ''
                                        }`}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-bold text-amber-400 text-sm tracking-wide">
                                            {fab}
                                          </span>
                                          {isZero && canManageStock && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteStock(lotItem)}
                                              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold transition shadow-sm"
                                              title="Apagar este registro que está sem munições"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              <span>Apagar Registro Vazio</span>
                                            </button>
                                          )}
                                        </div>
                                        <div className="text-slate-300">
                                          Calibre: <span className="font-mono text-slate-100">{calName}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Tipo: <span className="text-slate-100">{tipo}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Peso: <span className="font-mono text-slate-100">{peso}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Lote: <span className="font-mono font-bold text-amber-300">{lote}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Destinação: <span className="text-sky-300">{dest}</span>
                                        </div>
                                        <div className="text-slate-300 flex items-center justify-between pt-0.5">
                                          <span>
                                            Ano: <span className="font-mono text-slate-200">{ano}</span> — <strong className="font-mono text-emerald-400 font-bold">{lotItem.quantity} un.</strong>
                                          </span>
                                          {canManageStock && (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenEditStock(lotItem, ammoObs)}
                                              className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
                                              title="Alterar informações deste lote"
                                            >
                                              Alterar
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Detalhes da Munição em Lista */}
                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
                                  <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="font-bold text-amber-400 uppercase tracking-wider">
                                      Detalhes da Munição
                                    </span>
                                    {lastMov?.createdAt && (
                                      <span className="text-slate-500">
                                        {formatTimestamp(lastMov.createdAt).split(' ')[0]}
                                      </span>
                                    )}
                                  </div>

                                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/90 text-[11px]">
                                    {distinctObs.length === 0 ? (
                                      <span className="font-normal text-slate-500 italic text-xs">Padrão / Sem informações adicionais</span>
                                    ) : distinctObs.length === 1 ? (
                                      <p className="font-medium text-amber-300 whitespace-pre-wrap leading-relaxed text-xs">{distinctObs[0]}</p>
                                    ) : (
                                      <ul className="space-y-1.5 list-disc list-inside text-xs text-amber-300">
                                        {distinctObs.map((obsText, idx) => (
                                          <li key={idx} className="leading-relaxed">
                                            <span className="text-slate-200">{obsText}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Estoque Atual no Cofre:</span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-base font-mono font-black text-emerald-400">
                                    {totalVaultQty} un
                                  </span>

                                  {/* Opção de Entrada nativa com dados completos (Botão Saída removido) */}
                                  {canManageStock && (
                                    <div className="flex items-center space-x-1 ml-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleOpenMovementModal('Entrada', primaryStock.departmentId, primaryStock.unitId);
                                          setSelectedCaliberId(primaryStock.caliberId);
                                          setSelectedVaultId(primaryStock.vaultSpaceId);
                                          if (primaryStock.fabricante) setEntryFabricante(primaryStock.fabricante);
                                          if (primaryStock.tipoMunicao) setEntryTipo(primaryStock.tipoMunicao);
                                          if (primaryStock.pesoMunicao) setEntryPeso(primaryStock.pesoMunicao);
                                          if (primaryStock.loteMunicao) setEntryLote(primaryStock.loteMunicao);
                                          if (primaryStock.anoFabricacao) setEntryAnoFabricacao(Number(primaryStock.anoFabricacao));
                                          if (primaryStock.destinacao) setEntryDestinacao(primaryStock.destinacao);
                                        }}
                                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition shadow-sm"
                                        title="Entrada de munição com formulário nativo completo"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>Entrar</span>
                                      </button>
                                    </div>
                                  )}

                                  {/* Botão de Transferir munição entre unidades */}
                                  {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
                                    <button
                                      type="button"
                                      disabled={totalVaultQty <= 0}
                                      onClick={() => {
                                        const targetStock = cofreStocks.find(s => s.quantity > 0) || primaryStock;
                                        setTransferTargetStock(targetStock);
                                        setShowTransferModal(true);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 disabled:opacity-40 transition"
                                      title="Transferir para outra unidade policial"
                                    >
                                      <ArrowRightLeft className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Ícone de alterar informações com seletor caso haja mais de um lote */}
                                  {canManageStock && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (cofreStocks.length > 1) {
                                          setLotSelectionForEdit({
                                           stocks: cofreStocks,
                                           onSelect: (selectedStock) => {
                                             setLotSelectionForEdit(null);
                                             handleOpenEditStock(selectedStock, ammoObs);
                                           }
                                          });
                                        } else {
                                          handleOpenEditStock(primaryStock, ammoObs);
                                        }
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                                      title="Alterar Informações da Munição"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Ícone de ver histórico de movimentações do cofre */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVaultHistoryStock(primaryStock);
                                      setSelectedHistoryMovId(null);
                                      setHistoryFilterCaliber(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                                    title="Ver Histórico de Movimentações do Cofre"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Movement Log Table with Column Filters (Inicia oculto igual aos cofres) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
        
        {/* Accordion Header (idêntico à div dos cofres) */}
        <div
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                  HISTÓRICO
                </span>
                <h2 className="text-base font-bold text-slate-100">Histórico de Movimentação de Munições</h2>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {filteredMovements.length} registro(s) de movimentação de munições
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
              {filteredMovements.length} Registros
            </span>

            <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
              {isHistoryExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </div>

        {/* Content Body - Inicia oculto e só abre ao selecionar a div, igual aos cofres */}
        {isHistoryExpanded && (
          <div className="p-6 bg-slate-950/40 border-t border-slate-800/60 space-y-4">
            {(colFilterData || colFilterTipo || colFilterCalibre || colFilterQtd || colFilterLocal || colFilterMotivo || colFilterPolicial || colFilterDevolucao) && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setColFilterData('');
                    setColFilterTipo('');
                    setColFilterCalibre('');
                    setColFilterQtd('');
                    setColFilterLocal('');
                    setColFilterMotivo('');
                    setColFilterPolicial('');
                    setColFilterDevolucao('');
                  }}
                  className="text-xs text-amber-400 hover:underline font-medium"
                >
                  Limpar Filtros de Coluna
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-2 px-3 min-w-[110px]">Data / Hora</th>
                <th className="py-2 px-3 min-w-[90px]">Tipo</th>
                <th className="py-2 px-3 min-w-[100px]">Calibre</th>
                <th className="py-2 px-3 min-w-[80px]">Quantidade</th>
                <th className="py-2 px-3 min-w-[120px]">Local / Unidade</th>
                <th className="py-2 px-3 min-w-[130px]">Motivo / Destino</th>
                <th className="py-2 px-3 min-w-[140px]">Policial Responsável</th>
                <th className="py-2 px-3 min-w-[110px]">Devolução</th>
                <th className="py-2 px-3 text-right min-w-[80px]">Ações</th>
              </tr>

              {/* Column Filter Inputs Header Row */}
              <tr className="bg-slate-950/60 border-b border-slate-800">
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterData}
                    onChange={(e) => setColFilterData(e.target.value)}
                    placeholder="Filtrar data..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 font-mono"
                  />
                </th>
                <th className="p-1">
                  <select
                    value={colFilterTipo}
                    onChange={(e) => setColFilterTipo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  >
                    <option value="">Todos</option>
                    <option value="Entrada">Entrada</option>
                    <option value="Saída">Saída</option>
                  </select>
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterCalibre}
                    onChange={(e) => setColFilterCalibre(e.target.value)}
                    placeholder="Filtrar calibre..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterQtd}
                    onChange={(e) => setColFilterQtd(e.target.value)}
                    placeholder="Qtd..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 font-mono"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterLocal}
                    onChange={(e) => setColFilterLocal(e.target.value)}
                    placeholder="Local/Unidade..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterMotivo}
                    onChange={(e) => setColFilterMotivo(e.target.value)}
                    placeholder="Motivo/Destino..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterPolicial}
                    onChange={(e) => setColFilterPolicial(e.target.value)}
                    placeholder="Policial/MASP..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterDevolucao}
                    onChange={(e) => setColFilterDevolucao(e.target.value)}
                    placeholder="Devolução..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const cal = calibers.find(c => c.id === m.caliberId);
                  const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);
                  const unit = vault ? units.find(u => u.id === vault.unitId) : null;

                  const reasonStr = (m.recipientOrReason || '').toLowerCase();
                  const isCourseOrTest = reasonStr.includes('curso') || reasonStr.includes('teste');
                  const returnedQty = m.returnedQuantity || 0;
                  const canReturnMore = m.type === 'Saída' && isCourseOrTest && returnedQty < m.quantity;

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {formatTimestamp(m.createdAt)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center space-x-1 w-fit ${
                            m.type === 'Entrada'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {m.type === 'Entrada' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          <span>{m.type}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-100">
                        {cal ? cal.name : m.caliberId}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-amber-400">
                        {m.quantity} un
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-200">
                        <div className="font-bold">{vault ? vault.code : 'N/A'}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{unit ? unit.name : ''}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-200">
                        <div>
                          <span>{m.recipientOrReason}</span>
                          {m.observation && (
                            <p className="text-[10px] text-slate-400 font-normal italic truncate max-w-xs" title={m.observation}>
                              Obs: {m.observation}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        <div>
                          <span className="font-bold block text-slate-100">
                            {m.responsibleName || m.recipientOrReason}
                          </span>
                          {m.responsibleMasp && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              MASP: {m.responsibleMasp}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Devolução Column */}
                      <td className="py-3 px-3 text-xs font-mono">
                        {m.type === 'Saída' && isCourseOrTest ? (
                          <div className="space-y-1">
                            <span className={`font-bold block ${returnedQty > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {returnedQty} / {m.quantity} dev.
                            </span>
                            {canReturnMore && (
                              <button
                                onClick={() => {
                                  setReturnTargetMov(m);
                                  setReturnQuantity(m.quantity - returnedQty);
                                }}
                                className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold text-[10px] px-2 py-0.5 rounded transition flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3 text-emerald-400" />
                                <span>Devolver</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">N/A</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right space-x-1">
                        <button
                          onClick={() => handlePrintDirectReceipt(m)}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition inline-flex items-center space-x-1"
                          title="Imprimir PDF do Recibo (Via Navegador)"
                        >
                          <Printer className="w-4 h-4" />
                          <span className="text-[10px] font-bold">PDF</span>
                        </button>

                        {canManageStock && (
                          <button
                            onClick={() => handleDeleteAmmoMovement(m)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            title="Excluir Lançamento de Munição"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Cadastro de Munição (Fabricante, Calibre, Tipo, Peso) */}
      {showCaliberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                  <Disc className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Cadastro de Munição
                  </h3>
                  <p className="text-xs text-slate-400">
                    Especificação de Fabricante, Calibre, Tipo de Projétil e Peso
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCaliberModal(false);
                  setEditingCaliber(null);
                  setCaliberFabricante('');
                  setCaliberName('');
                  setCaliberTipo('');
                  setCaliberPeso('');
                }}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form de Cadastro / Edição: VISÍVEL PARA GERAL, ARMEIRO E ADMINISTRADOR */}
            {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') ? (
              <form onSubmit={handleSaveCaliber} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    {editingCaliber ? 'Editar Cadastro de Munição' : 'Cadastrar Nova Especificação de Munição'}
                  </h4>
                  {editingCaliber && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCaliber(null);
                        setCaliberFabricante('');
                        setCaliberName('');
                        setCaliberTipo('');
                        setCaliberPeso('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 underline"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Fabricante */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Fabricante <span className="text-slate-500 font-normal">(ex: CBC, Federal, Magtech)</span>
                    </label>
                    <input
                      type="text"
                      list="fabricantes-sugestoes"
                      value={caliberFabricante}
                      onChange={(e) => setCaliberFabricante(e.target.value)}
                      placeholder="Ex: CBC, Federal, Magtech..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <datalist id="fabricantes-sugestoes">
                      <option value="CBC" />
                      <option value="Magtech" />
                      <option value="Federal" />
                      <option value="Winchester" />
                      <option value="Sellier & Bellot" />
                      <option value="Fiocchi" />
                      <option value="Hornady" />
                      <option value="Speer" />
                      <option value="Aguila" />
                      <option value="Taurus" />
                    </datalist>
                  </div>

                  {/* Calibre */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Calibre <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      list="calibres-sugestoes"
                      value={caliberName}
                      onChange={(e) => setCaliberName(e.target.value)}
                      placeholder="Ex: 9x19mm, .40 S&W, 5,56x45mm..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                      required
                    />
                    <datalist id="calibres-sugestoes">
                      <option value="9x19mm" />
                      <option value=".40 S&W" />
                      <option value="5,56x45mm" />
                      <option value=".380 ACP" />
                      <option value=".38 SPL" />
                      <option value="12 GA" />
                      <option value="7,62x51mm" />
                      <option value=".45 ACP" />
                      <option value=".357 Magnum" />
                    </datalist>
                  </div>

                  {/* Tipo */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Tipo de Munição <span className="text-slate-500 font-normal">(ex: Ogival, FMJ, Ponta Oca)</span>
                    </label>
                    <input
                      type="text"
                      list="tipos-sugestoes"
                      value={caliberTipo}
                      onChange={(e) => setCaliberTipo(e.target.value)}
                      placeholder="Ex: Ogival, Ponta Oca, FMJ, Treino..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <datalist id="tipos-sugestoes">
                      <option value="Ogival (ETOG)" />
                      <option value="Ponta Oca (EXPO / JHP)" />
                      <option value="FMJ (Full Metal Jacket)" />
                      <option value="Treinamento" />
                      <option value="Operacional" />
                      <option value="Frangível" />
                      <option value="Traçante" />
                      <option value="Chumbo (Balote)" />
                    </datalist>
                  </div>

                  {/* Peso */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Peso do Projétil <span className="text-slate-500 font-normal">(ex: 115 gr, 124 gr, 180 gr)</span>
                    </label>
                    <input
                      type="text"
                      list="pesos-sugestoes"
                      value={caliberPeso}
                      onChange={(e) => setCaliberPeso(e.target.value)}
                      placeholder="Ex: 115 gr, 124 gr, 147 gr, 180 gr, 55 gr..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <datalist id="pesos-sugestoes">
                      <option value="115 gr" />
                      <option value="124 gr" />
                      <option value="147 gr" />
                      <option value="165 gr" />
                      <option value="180 gr" />
                      <option value="55 gr" />
                      <option value="62 gr" />
                      <option value="158 gr" />
                      <option value="230 gr" />
                    </datalist>
                  </div>
                </div>

                <div className="pt-2 flex justify-end space-x-2">
                  {editingCaliber && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCaliber(null);
                        setCaliberFabricante('');
                        setCaliberName('');
                        setCaliberTipo('');
                        setCaliberPeso('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded-xl transition"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shrink-0 shadow flex items-center space-x-1.5 transition"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingCaliber ? 'Salvar Alterações' : 'Cadastrar Munição'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-[11px] text-slate-500 italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                Apenas usuários dos perfis <strong>Geral</strong>, <strong>Armeiro</strong> e <strong>Administrador</strong> possuem permissão para cadastrar ou editar munições.
              </p>
            )}

            {/* Lista de Munições Cadastradas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span className="font-bold uppercase tracking-wider">Munições Cadastradas no Catálogo</span>
                <span className="font-mono">{calibers.length} registros</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {calibers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-6">Nenhuma munição cadastrada.</p>
                ) : (
                  calibers.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-100 text-sm">{c.name}</span>
                          {c.fabricante && (
                            <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md">
                              {c.fabricante}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          {c.tipo && (
                            <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                              Tipo: <strong className="text-slate-100">{c.tipo}</strong>
                            </span>
                          )}
                          {c.peso && (
                            <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                              Peso: <strong className="text-slate-100">{c.peso}</strong>
                            </span>
                          )}
                          {!c.fabricante && !c.tipo && !c.peso && (
                            <span className="text-slate-500 italic text-[10px]">Especificações não detalhadas</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 ml-3 shrink-0">
                        {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
                          <>
                            <button
                              onClick={() => {
                                setEditingCaliber(c);
                                setCaliberFabricante(c.fabricante || '');
                                setCaliberName(c.name);
                                setCaliberTipo(c.tipo || '');
                                setCaliberPeso(c.peso || '');
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-900 rounded-lg transition"
                              title="Editar Cadastro de Munição"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCaliber(c)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition"
                              title="Excluir Cadastro de Munição"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowCaliberModal(false);
                  setEditingCaliber(null);
                  setCaliberFabricante('');
                  setCaliberName('');
                  setCaliberTipo('');
                  setCaliberPeso('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Movement (Entrada / Saída) */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <Disc className="w-5 h-5 text-amber-400" />
              <span>{movementType === 'Entrada' ? 'Registrar Entrada / Reabastecimento' : 'Registrar Saída de Munição'}</span>
            </h3>

            <form onSubmit={handleSaveMovement} className="space-y-4">
              
              {/* Type Selection Tabs */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMovementType('Entrada')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Entrada'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ENTRADA / REABASTECIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('Saída')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Saída'
                        ? 'bg-red-950 text-red-400 border-red-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    SAÍDA DE MUNIÇÃO
                  </button>
                </div>
              </div>

              {/* If movementType === 'Entrada': Cascading selection (Fabricante -> Calibre -> Tipo -> Peso -> Lote -> Ano -> Destinação -> Qtd -> Cofre da Unidade) */}
              {movementType === 'Entrada' ? (
                <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5 pb-1 border-b border-slate-800/80">
                    <Disc className="w-4 h-4" />
                    <span>Especificações Técnicas da Munição de Entrada</span>
                  </div>

                  {/* 1. Fabricante & 2. Calibre */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        1. Fabricante <span className="text-amber-400">*</span>
                      </label>
                      <select
                        value={entryFabricante}
                        onChange={(e) => {
                          const fab = e.target.value;
                          setEntryFabricante(fab);
                          const matching = calibers.filter(c => (c.fabricante || '').toLowerCase() === fab.toLowerCase());
                          const first = matching[0] || calibers[0];
                          if (first) {
                            setSelectedCaliberId(first.id);
                            if (first.tipo) setEntryTipo(first.tipo);
                            if (first.peso) setEntryPeso(first.peso);
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium focus:border-amber-500"
                        required
                      >
                        {availableFabricantes.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        2. Calibre (Subcategoria) <span className="text-amber-400">*</span>
                      </label>
                      <select
                        value={selectedCaliberId}
                        onChange={(e) => {
                          const cId = e.target.value;
                          setSelectedCaliberId(cId);
                          const cal = calibers.find(c => c.id === cId);
                          if (cal?.tipo) setEntryTipo(cal.tipo);
                          if (cal?.peso) setEntryPeso(cal.peso);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-amber-300 font-mono font-bold focus:border-amber-500"
                        required
                      >
                        {availableCalibresForFabricante.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.tipo ? `(${c.tipo})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 3. Tipo & 4. Peso */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        3. Tipo de Munição <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        list="entry-tipos-list"
                        value={entryTipo}
                        onChange={(e) => setEntryTipo(e.target.value)}
                        placeholder="Ex: Ogival, ETOG, EXPO, FMJ..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium focus:border-amber-500"
                        required
                      />
                      <datalist id="entry-tipos-list">
                        {availableTiposForCalibre.map(t => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        4. Peso da Munição <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        list="entry-pesos-list"
                        value={entryPeso}
                        onChange={(e) => setEntryPeso(e.target.value)}
                        placeholder="Ex: 124 gr, 115 gr, 55 gr..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium focus:border-amber-500"
                        required
                      />
                      <datalist id="entry-pesos-list">
                        {availablePesosForTipo.map(p => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* 5. Lote, 6. Ano de Fabricação & 7. Destinação */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        5. Lote de Munição <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={entryLote}
                        onChange={(e) => setEntryLote(e.target.value)}
                        placeholder="Ex: CBC-2025/01"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono font-bold focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        6. Ano de Fabricação
                      </label>
                      <select
                        value={entryAnoFabricacao}
                        onChange={(e) => setEntryAnoFabricacao(parseInt(e.target.value) || new Date().getFullYear())}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                      >
                        {Array.from({ length: new Date().getFullYear() - 1990 + 1 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        7. Destinação
                      </label>
                      <select
                        value={entryDestinacao}
                        onChange={(e) => setEntryDestinacao(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 font-medium"
                      >
                        <option value="Defesa">Defesa</option>
                        <option value="Treinamento">Treinamento</option>
                        <option value="Ensaios">Ensaios</option>
                        <option value="Reserva estratégica">Reserva estratégica</option>
                      </select>
                    </div>
                  </div>

                  {/* 8. Quantidade & 9. Local no Cofre (Restrito à Unidade do Policial) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/60">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        8. Quantidade (unidades) <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-emerald-400 font-mono font-bold focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>9. Local no Cofre</span>
                        <span className="text-[10px] text-amber-400 font-mono">(Apenas sua unidade)</span>
                      </label>
                      <select
                        value={selectedVaultId}
                        onChange={(e) => setSelectedVaultId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                        required
                      >
                        {entryVaultSpaces.map((v) => {
                          const u = units.find(unit => unit.id === v.unitId);
                          const d = departments.find(dep => dep.id === v.departmentId);
                          return (
                            <option key={v.id} value={v.id}>
                              {v.code} - {u ? u.name : 'Unidade'} ({d ? d.code : ''})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Caliber & Quantity Grid for SAÍDA */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Calibre
                      </label>
                      <select
                        value={selectedCaliberId}
                        onChange={(e) => setSelectedCaliberId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                        required
                      >
                        {calibers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fabricante ? `[${c.fabricante}] ` : ''}{c.name}{c.tipo ? ` - ${c.tipo}` : ''}{c.peso ? ` (${c.peso})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Quantidade (unidades)
                        </label>
                        {selectedExitStock && (
                          <span className="text-[11px] font-mono font-bold text-amber-400">
                            Disponível: {selectedExitStock.quantity} un.
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={selectedExitStock ? selectedExitStock.quantity : undefined}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        disabled={availableLocationsForExit.length === 0}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono disabled:opacity-50"
                        required
                      />
                    </div>
                  </div>

                  {/* Vault Location for SAÍDA */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Localização do Estoque (Cofre - Calibre - Observação)
                    </label>
                    {availableLocationsForExit.length === 0 ? (
                      <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center space-x-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <div>
                          <strong className="block font-semibold">Sem estoque disponível</strong>
                          <span>Nenhum cofre possui estoque disponível para o calibre selecionado ({calibers.find(c => c.id === selectedCaliberId)?.name || 'calibre'}).</span>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={selectedVaultId}
                        onChange={(e) => setSelectedVaultId(e.target.value)}
                        className="w-full bg-slate-950 border border-amber-600/70 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-mono font-semibold"
                        required
                      >
                        {availableLocationsForExit.map((loc) => (
                          <option key={loc.vaultSpaceId} value={loc.vaultSpaceId}>
                            {loc.formattedLabel}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Motivo / Destino da Munição
                </label>
                <select
                  value={recipientOrReason}
                  onChange={(e) => setRecipientOrReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-medium"
                >
                  <option value="Abastecimento">Abastecimento</option>
                  <option value="Curso ou Teste">Curso ou Teste (Permite retorno de sobras)</option>
                  <option value="Treinamento">Treinamento</option>
                  <option value="Substituição">Substituição</option>
                  <option value="Operacional">Operacional / Diligência</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {/* Policial Responsável pela Retirada */}
              <div className="border border-slate-800 bg-slate-950/60 p-3.5 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Policial Responsável pela Movimentação
                </label>

                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'SISTEMA'}
                      onChange={() => setResponsibleType('SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Policial Cadastrado no Sistema</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'FORA_DO_SISTEMA'}
                      onChange={() => setResponsibleType('FORA_DO_SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Fora do Sistema</span>
                  </label>
                </div>

                {responsibleType === 'SISTEMA' ? (
                  <div>
                    <select
                      value={selectedResponsibleUserId}
                      onChange={(e) => setSelectedResponsibleUserId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      required
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {u.masp}) - {u.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Nome do Policial</label>
                      <input
                        type="text"
                        value={customResponsibleName}
                        onChange={(e) => setCustomResponsibleName(e.target.value)}
                        placeholder="Nome Completo..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">MASP / Documento</label>
                      <input
                        type="text"
                        value={customResponsibleMasp}
                        onChange={(e) => setCustomResponsibleMasp(e.target.value)}
                        placeholder="Ex: 123.456-7"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informações adicionais (até 500 caracteres) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Informações adicionais
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {observation.length} / 500
                  </span>
                </div>
                <textarea
                  maxLength={500}
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="LOTE: [Informe o lote da munição]  POL: [Nome/Identificação do Policial]  - Observações adicionais..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={movementType === 'Saída' && availableLocationsForExit.length === 0}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Movimentação</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Devolução de Sobras de Munição */}
      {returnTargetMov && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-2 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <RotateCcw className="w-5 h-5 text-emerald-400" />
              <span>Devolução de Munições Não Utilizadas</span>
            </h3>

            <p className="text-xs text-slate-400 mb-4">
              Policial: <strong className="text-slate-200">{returnTargetMov.responsibleName || returnTargetMov.recipientOrReason}</strong>
              <br />
              Retirada inicial: <strong className="text-amber-400">{returnTargetMov.quantity} un</strong>
              {returnTargetMov.returnedQuantity ? ` (Já devolvidos: ${returnTargetMov.returnedQuantity} un)` : ''}
            </p>

            <form onSubmit={handleConfirmReturnAmmo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade a Devolver (Restante max: {returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)} un)
                </label>
                <input
                  type="number"
                  min="1"
                  max={returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)}
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReturnTargetMov(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Informações da Munição (substitui exclusão permanente) */}
      {editingStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl space-y-0">
            <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Alterar Informações da Munição</h3>
                  <p className="text-[11px] text-slate-400">
                    Cofre Atual: <strong className="text-amber-400 font-mono">{vaultSpaces.find(v => v.id === editingStock.stock.vaultSpaceId)?.code || 'N/A'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockEdit} className="p-6 space-y-4 overflow-y-auto">
              {/* Localização / Transferência entre Cofres */}
              {(() => {
                const stockUnitId = editingStock.stock.unitId || currentUser.unitId;
                const unitVaults = vaultSpaces.filter(v => (!v.unitId || v.unitId === stockUnitId) && (v.type === 'MUNIÇÕES' || !v.type));
                const availableVaults = unitVaults.length > 0 ? unitVaults : vaultSpaces.filter(v => !v.unitId || v.unitId === stockUnitId);
                const currentVault = vaultSpaces.find(v => v.id === editingStock.stock.vaultSpaceId);
                const targetVault = vaultSpaces.find(v => v.id === editingStock.targetVaultSpaceId);
                const isTransferring = Boolean(editingStock.targetVaultSpaceId && editingStock.targetVaultSpaceId !== editingStock.stock.vaultSpaceId);

                return (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Cofre de Armazenamento
                      </label>
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Cofre Atual: {currentVault?.code || 'N/A'}
                      </span>
                    </div>

                    <div>
                      <select
                        value={editingStock.targetVaultSpaceId}
                        onChange={(e) => {
                          const newVId = e.target.value;
                          setEditingStock({
                            ...editingStock,
                            targetVaultSpaceId: newVId,
                            transferQuantity: editingStock.quantity
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                      >
                        {availableVaults.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.code} {v.type ? `(${v.type})` : ''} {v.id === editingStock.stock.vaultSpaceId ? '— [Cofre Atual]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Alerta e Opções quando selecionado um cofre diferente */}
                    {isTransferring && (
                      <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-xl space-y-2.5 animate-fadeIn text-xs">
                        <div className="flex items-center space-x-2 text-amber-300 font-bold">
                          <ArrowRightLeft className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Transferência de Munições para o Cofre {targetVault?.code}</span>
                        </div>
                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                          Ao salvar, as munições serão transferidas do cofre <strong>{currentVault?.code}</strong> para o cofre <strong>{targetVault?.code}</strong> com registro automático no histórico de movimentações.
                        </p>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <label className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${editingStock.transferMode === 'ALL' ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                            <input
                              type="radio"
                              name="transferMode"
                              checked={editingStock.transferMode === 'ALL'}
                              onChange={() => setEditingStock({ ...editingStock, transferMode: 'ALL', transferQuantity: editingStock.quantity })}
                              className="text-amber-500 focus:ring-0"
                            />
                            <span className="font-semibold text-[11px]">Transferir Tudo ({editingStock.quantity} un.)</span>
                          </label>
                          <label className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${editingStock.transferMode === 'PARTIAL' ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                            <input
                              type="radio"
                              name="transferMode"
                              checked={editingStock.transferMode === 'PARTIAL'}
                              onChange={() => setEditingStock({ ...editingStock, transferMode: 'PARTIAL', transferQuantity: Math.min(editingStock.quantity, Math.max(1, Math.floor(editingStock.quantity / 2))) })}
                              className="text-amber-500 focus:ring-0"
                            />
                            <span className="font-semibold text-[11px]">Quantidade Parcial</span>
                          </label>
                        </div>

                        {editingStock.transferMode === 'PARTIAL' && (
                          <div className="pt-1">
                            <label className="block text-[10px] font-semibold text-slate-300 uppercase mb-1">
                              Quantidade a transferir para {targetVault?.code} (máximo: {editingStock.quantity})
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={editingStock.quantity}
                              value={editingStock.transferQuantity}
                              onChange={(e) => setEditingStock({
                                ...editingStock,
                                transferQuantity: Math.min(editingStock.quantity, Math.max(1, parseInt(e.target.value) || 1))
                              })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">
                              Permanecerão no cofre {currentVault?.code}: <strong>{editingStock.quantity - editingStock.transferQuantity} un.</strong>
                            </p>
                          </div>
                        )}

                        <div className="pt-1">
                          <label className="block text-[10px] font-semibold text-slate-300 uppercase mb-1">
                            Motivo / Justificativa da Transferência
                          </label>
                          <input
                            type="text"
                            value={editingStock.transferObservation}
                            onChange={(e) => setEditingStock({ ...editingStock, transferObservation: e.target.value })}
                            placeholder="Ex: Remanejamento interno de cofre, reorganização de estoque..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Fabricante & Calibre */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Fabricante
                  </label>
                  <input
                    type="text"
                    list="edit-fab-list"
                    value={editingStock.fabricante}
                    onChange={(e) => setEditingStock({ ...editingStock, fabricante: e.target.value })}
                    placeholder="CBC, Magtech..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <datalist id="edit-fab-list">
                    {availableFabricantes.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Calibre <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={editingStock.caliberId}
                    onChange={(e) => setEditingStock({ ...editingStock, caliberId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                    required
                  >
                    {calibers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fabricante ? `[${c.fabricante}] ` : ''}{c.name}{c.tipo ? ` - ${c.tipo}` : ''}{c.peso ? ` (${c.peso})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tipo & Peso */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tipo de Munição
                  </label>
                  <input
                    type="text"
                    list="edit-tipos-list"
                    value={editingStock.tipoMunicao}
                    onChange={(e) => setEditingStock({ ...editingStock, tipoMunicao: e.target.value })}
                    placeholder="ETOG, FMJ, EXPO..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <datalist id="edit-tipos-list">
                    {availableTiposForCalibre.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Peso da Munição
                  </label>
                  <input
                    type="text"
                    list="edit-pesos-list"
                    value={editingStock.pesoMunicao}
                    onChange={(e) => setEditingStock({ ...editingStock, pesoMunicao: e.target.value })}
                    placeholder="124 gr, 115 gr..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <datalist id="edit-pesos-list">
                    {availablePesosForTipo.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>

              {/* Lote, Ano de Fabricação & Destinação */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Lote
                  </label>
                  <input
                    type="text"
                    value={editingStock.loteMunicao}
                    onChange={(e) => setEditingStock({ ...editingStock, loteMunicao: e.target.value })}
                    placeholder="LOTE-2025/01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Ano Fab.
                  </label>
                  <select
                    value={editingStock.anoFabricacao}
                    onChange={(e) => setEditingStock({ ...editingStock, anoFabricacao: parseInt(e.target.value) || new Date().getFullYear() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  >
                    {Array.from({ length: new Date().getFullYear() - 1990 + 1 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Destinação
                  </label>
                  <select
                    value={editingStock.destinacao}
                    onChange={(e) => setEditingStock({ ...editingStock, destinacao: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Operacional">Operacional</option>
                    <option value="Treinamento / Instrução">Treinamento</option>
                    <option value="SAT">SAT</option>
                    <option value="Reserva Estratégica">Reserva</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Quantidade <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingStock.quantity}
                    onChange={(e) => setEditingStock({
                      ...editingStock,
                      quantity: Math.max(0, parseInt(e.target.value) || 0)
                    })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-amber-500"
                    required
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-500 font-mono">unidades</span>
                </div>
              </div>

              {/* Informações adicionais */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Informações adicionais
                </label>
                <textarea
                  value={editingStock.additionalInfo}
                  onChange={(e) => setEditingStock({ ...editingStock, additionalInfo: e.target.value })}
                  placeholder="Descreva informações adicionais, observações técnicas ou referências do lote..."
                  maxLength={500}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {editingStock.additionalInfo.length}/500 caracteres
                  </span>
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStock(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-amber-400/10"
                >
                  {isSavingStock ? (
                    <span>Salvando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Entrada / Saída Direta no Cofre */}
      {quickVaultMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              quickVaultMovement.type === 'Entrada'
                ? 'bg-emerald-950/40 border-emerald-800/60'
                : 'bg-amber-950/40 border-amber-800/60'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl border ${
                  quickVaultMovement.type === 'Entrada'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {quickVaultMovement.type === 'Entrada' ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {quickVaultMovement.type === 'Entrada' ? 'Entrada Direta no Cofre' : 'Saída Direta do Cofre'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {calibers.find(c => c.id === quickVaultMovement.stock.caliberId)?.name} &bull; Cofre {vaultSpaces.find(v => v.id === quickVaultMovement.stock.vaultSpaceId)?.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickVaultMovement(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-2">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Estoque Atual no Cofre:</span>
                <span className="text-sm font-mono font-bold text-slate-200">
                  {quickVaultMovement.stock.quantity} unidades
                </span>
              </div>
            </div>

            {/* Inserindo apenas quantidade e o policial responsável */}
            <form onSubmit={handleSaveQuickMovement} className="p-6 pt-2 space-y-4">
              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Quantidade a {quickVaultMovement.type === 'Entrada' ? 'Entrar' : 'Sair'} <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={quickVaultMovement.type === 'Saída' ? quickVaultMovement.stock.quantity : undefined}
                    step="1"
                    value={quickVaultMovement.quantity}
                    onChange={(e) => setQuickVaultMovement({
                      ...quickVaultMovement,
                      quantity: Math.max(1, parseInt(e.target.value) || 1)
                    })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-500 font-mono">unidades</span>
                </div>
                {quickVaultMovement.type === 'Saída' && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Disponível no cofre: {quickVaultMovement.stock.quantity} un.
                  </p>
                )}
              </div>

              {/* Policial Responsável pela Movimentação */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Policial Responsável pela Movimentação <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setQuickVaultMovement({ ...quickVaultMovement, responsibleType: 'SISTEMA' })}
                      className={`px-1.5 py-0.5 rounded ${quickVaultMovement.responsibleType === 'SISTEMA' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Cadastrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickVaultMovement({ ...quickVaultMovement, responsibleType: 'FORA_DO_SISTEMA' })}
                      className={`px-1.5 py-0.5 rounded ${quickVaultMovement.responsibleType === 'FORA_DO_SISTEMA' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Outro
                    </button>
                  </div>
                </div>

                {quickVaultMovement.responsibleType === 'SISTEMA' ? (
                  <select
                    value={quickVaultMovement.responsibleUserId}
                    onChange={(e) => {
                      const uid = e.target.value;
                      const activeUsers = users.length > 0 ? users : storage.getUsers();
                      const foundUser = activeUsers.find(u => u.id === uid);
                      setQuickVaultMovement({
                        ...quickVaultMovement,
                        responsibleUserId: uid,
                        responsibleName: foundUser?.name || '',
                        responsibleMasp: foundUser?.masp || ''
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  >
                    <option value="">Selecione o policial responsável...</option>
                    {(users.length > 0 ? users : storage.getUsers()).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {u.masp}) - {u.cargo}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome do Policial"
                      value={quickVaultMovement.responsibleName}
                      onChange={(e) => setQuickVaultMovement({ ...quickVaultMovement, responsibleName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="MASP"
                      value={quickVaultMovement.responsibleMasp}
                      onChange={(e) => setQuickVaultMovement({ ...quickVaultMovement, responsibleMasp: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setQuickVaultMovement(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuickMovement}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow-md ${
                    quickVaultMovement.type === 'Entrada'
                      ? 'text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-emerald-400/10'
                      : 'text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-amber-400/10'
                  }`}
                >
                  {isSubmittingQuickMovement ? (
                    <span>Processando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar {quickVaultMovement.type}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Histórico de Movimentações do Cofre (inicia oculto e só mostra detalhes se selecionado) */}
      {vaultHistoryStock && (() => {
        const vault = vaultSpaces.find(v => v.id === vaultHistoryStock.vaultSpaceId);
        const unit = units.find(u => u.id === vaultHistoryStock.unitId);
        const dept = departments.find(d => d.id === vaultHistoryStock.departmentId);
        const cal = calibers.find(c => c.id === vaultHistoryStock.caliberId);

        const filteredHistoryMovs = movements.filter(m => {
          const isSameVault = m.vaultSpaceId === vaultHistoryStock.vaultSpaceId;
          if (historyFilterCaliber) {
            return isSameVault && m.caliberId === vaultHistoryStock.caliberId;
          }
          return isSameVault;
        });

        const totalEntradas = filteredHistoryMovs
          .filter(m => m.type === 'Entrada')
          .reduce((sum, m) => sum + m.quantity, 0);

        const totalSaidas = filteredHistoryMovs
          .filter(m => m.type === 'Saída')
          .reduce((sum, m) => sum + m.quantity, 0);

        const totalDevolvido = filteredHistoryMovs
          .reduce((sum, m) => sum + (m.returnedQuantity || 0), 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              
              {/* Header */}
              <div className="px-6 py-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-100">
                        Histórico de Movimentações do Cofre
                      </h3>
                      <span className="text-xs font-mono font-bold bg-slate-950 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                        Cofre: {vault?.code || 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {unit?.name ? `${unit.name} • ` : ''}{dept?.name || ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePrintVaultHistoryReport(vaultHistoryStock, filteredHistoryMovs)}
                    className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm"
                    title="Imprimir Relatório Completo deste Cofre"
                  >
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Imprimir Relatório</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVaultHistoryStock(null);
                      setSelectedHistoryMovId(null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Sub-header Summary & Filter Controls */}
              <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                {/* Filter toggle */}
                <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryFilterCaliber(true)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      historyFilterCaliber
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Calibre {cal?.name || ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilterCaliber(false)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      !historyFilterCaliber
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todas as Munições do Cofre
                  </button>
                </div>

                {/* Counters */}
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
                    Total: <strong className="text-white">{filteredHistoryMovs.length}</strong> reg.
                  </span>
                  <span className="bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg text-emerald-400">
                    +{totalEntradas} un
                  </span>
                  <span className="bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg text-amber-400">
                    -{totalSaidas} un
                  </span>
                  {totalDevolvido > 0 && (
                    <span className="bg-blue-950/60 border border-blue-800/60 px-2.5 py-1 rounded-lg text-blue-400">
                      ↩ {totalDevolvido} dev.
                    </span>
                  )}
                </div>
              </div>

              {/* Notice that details start hidden and are only shown when selected */}
              <div className="px-6 py-2 bg-slate-900/60 border-b border-slate-800/50 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
                <span>Clique em qualquer movimentação da lista para ver os detalhes completos.</span>
                {selectedHistoryMovId && (
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryMovId(null)}
                    className="text-amber-400 hover:underline font-medium text-[11px]"
                  >
                    Ocultar detalhes abertos
                  </button>
                )}
              </div>

              {/* Movement List */}
              <div className="p-6 overflow-y-auto space-y-2.5 flex-1">
                {filteredHistoryMovs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma movimentação registrada para este cofre.</p>
                  </div>
                ) : (
                  filteredHistoryMovs.map((m) => {
                    const mCal = calibers.find(c => c.id === m.caliberId);
                    const isSelected = selectedHistoryMovId === m.id;
                    const isEntrada = m.type === 'Entrada';

                    return (
                      <div
                        key={m.id}
                        className={`border rounded-xl transition duration-150 overflow-hidden ${
                          isSelected
                            ? 'bg-slate-950 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                            : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700 hover:bg-slate-950'
                        }`}
                      >
                        {/* Clickable Header Row */}
                        <div
                          onClick={() => setSelectedHistoryMovId(isSelected ? null : m.id)}
                          className="p-3.5 flex items-center justify-between cursor-pointer select-none space-x-3"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            {/* Type Icon */}
                            <div className={`p-1.5 rounded-lg border shrink-0 ${
                              isEntrada
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              {isEntrada ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>

                            {/* Main Info */}
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  isEntrada
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                }`}>
                                  {m.type}
                                </span>
                                <span className="font-mono font-bold text-slate-200 text-xs">
                                  {mCal ? mCal.name : m.caliberId}
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {formatTimestamp(m.createdAt)}
                                </span>
                              </div>

                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                Responsável: <strong className="text-slate-200">{m.responsibleName || m.recipientOrReason || 'Não informado'}</strong>
                                {m.responsibleMasp && <span className="font-mono text-slate-400"> ({m.responsibleMasp})</span>}
                              </p>
                            </div>
                          </div>

                          {/* Quantity & Chevron */}
                          <div className="flex items-center space-x-3 shrink-0">
                            <span className={`text-sm font-mono font-black ${
                              isEntrada ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                              {isEntrada ? `+${m.quantity}` : `-${m.quantity}`} un
                            </span>

                            <div className="text-slate-400 p-1 rounded-md hover:bg-slate-800 transition">
                              {isSelected ? (
                                <ChevronUp className="w-4 h-4 text-amber-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expandable Details - Inicia oculto e só mostra se for selecionado */}
                        {isSelected && (
                          <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-900/60 space-y-3 animate-fadeIn text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {/* Motivo / Destino */}
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Motivo / Destino
                                </span>
                                <p className="font-medium text-slate-200 mt-0.5">
                                  {m.recipientOrReason || '-'}
                                </p>
                              </div>

                              {/* Policial Responsável */}
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Policial Responsável
                                </span>
                                <p className="font-medium text-slate-200 mt-0.5">
                                  {m.responsibleName || '-'}
                                </p>
                                {m.responsibleMasp && (
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    MASP: {m.responsibleMasp} {m.responsibleType === 'FORA_DO_SISTEMA' ? '(Outro Órgão)' : ''}
                                  </span>
                                )}
                              </div>

                              {/* Armeiro / Operador */}
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Armeiro / Operador
                                </span>
                                <p className="font-medium text-slate-200 mt-0.5">
                                  {m.userName || 'Sistema'}
                                </p>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  ID: #{m.id}
                                </span>
                              </div>
                            </div>

                            {/* Informações Adicionais */}
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                                Informações Adicionais
                              </span>
                              <p className="text-amber-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                                {m.observation?.trim() ? m.observation.trim() : <span className="text-slate-500 italic font-sans text-xs">Nenhuma informação adicional informada.</span>}
                              </p>
                            </div>

                            {/* Devolução de munição não utilizada se houver */}
                            {Boolean(m.returnedQuantity && m.returnedQuantity > 0) && (
                              <div className="bg-blue-950/40 p-2.5 rounded-xl border border-blue-800/60 flex items-center justify-between text-blue-300">
                                <div className="flex items-center space-x-2">
                                  <RotateCcw className="w-4 h-4 text-blue-400 shrink-0" />
                                  <span>
                                    <strong>{m.returnedQuantity} un</strong> devolvidas em {m.returnedAt ? formatTimestamp(m.returnedAt) : ''}
                                    {m.returnedByUserName ? ` por ${m.returnedByUserName}` : ''}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Ação individual para imprimir recibo desta movimentação */}
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => handlePrintDirectReceipt(m)}
                                className="flex items-center space-x-1.5 text-xs font-bold text-slate-300 hover:text-amber-400 bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg transition"
                                title="Imprimir comprovante desta movimentação"
                              >
                                <Printer className="w-3.5 h-3.5 text-amber-400" />
                                <span>Imprimir Comprovante Individual</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-slate-800/80 border-t border-slate-700 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-400">
                  {filteredHistoryMovs.length} registro(s) encontrado(s) no cofre {vault?.code || ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setVaultHistoryStock(null);
                    setSelectedHistoryMovId(null);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition"
                >
                  Fechar
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Modal Transferência de Munições entre Unidades */}
      {showTransferModal && (
        <ModalTransferirMunicao
          initialStock={transferTargetStock}
          stocks={stocks}
          calibers={calibers}
          departments={departments}
          units={units}
          vaultSpaces={vaultSpaces}
          currentUser={currentUser}
          onClose={() => {
            setShowTransferModal(false);
            setTransferTargetStock(null);
          }}
          onTransferSuccess={(transfer) => {
            setSuccessMsg(`Transferência de munições registrada com sucesso (Guia nº ${transfer.id}). Aguardando confirmação do armeiro de destino.`);
            onRefresh();
          }}
        />
      )}

      {/* Modal Histórico de Transferências de Munições */}
      {showTransferHistoryModal && (
        <ModalHistoricoTransferenciasMunicao
          transfers={storage.getAmmoTransfers(currentUser, filterUnitId || undefined)}
          currentUser={currentUser}
          selectedUnitId={filterUnitId}
          onClose={() => setShowTransferHistoryModal(false)}
          onOpenNewTransfer={() => {
            setTransferTargetStock(null);
            setShowTransferModal(true);
          }}
          onRefresh={onRefresh}
        />
      )}

      {/* Modal de Seleção de Lote para Edição */}
      {lotSelectionForEdit && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <span>Selecione o Lote de Munição para Editar</span>
              </h3>
              <button
                type="button"
                onClick={() => setLotSelectionForEdit(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Este cofre possui mais de um lote cadastrado. Escolha qual registro deseja alterar:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {lotSelectionForEdit.stocks.map((s) => {
                const c = calibers.find(cal => cal.id === s.caliberId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => lotSelectionForEdit.onSelect(s)}
                    className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500 hover:bg-slate-900/90 transition flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition">
                        {c?.name || s.caliberId} • {s.fabricante || 'Fabricante'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Lote: <strong className="text-amber-300 font-bold">{s.loteMunicao || 'S/L'}</strong> • Ano: {s.anoFabricacao || 'N/A'} • Tipo: {s.tipoMunicao || 'Padrão'}
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/60">
                      {s.quantity} un.
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setLotSelectionForEdit(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Cofres para Impressão */}
      {showPrintVaultSelectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Imprimir Relatório de Cofres de Munições</h3>
                  <p className="text-xs text-slate-400">
                    Selecione quais cofres de munições deseja imprimir. Cada cofre será gerado em página separada no mesmo comando.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintVaultSelectModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between py-1 px-1 shrink-0">
              <span className="text-xs text-slate-400 font-mono">
                {candidateAmmoVaults.length} cofre(s) de munições encontrado(s)
              </span>
              <div className="flex items-center space-x-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedVaultIdsForReport(candidateAmmoVaults.map(v => v.id))}
                  className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs"
                >
                  Selecionar Todos
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedVaultIdsForReport([])}
                  className="text-slate-400 hover:text-slate-200 font-semibold underline text-xs"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[50vh]">
              {candidateAmmoVaults.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic bg-slate-950/50 rounded-xl border border-slate-800">
                  Nenhum cofre de munições encontrado para a unidade ou departamento selecionado.
                </div>
              ) : (
                candidateAmmoVaults.map(v => {
                  const isChecked = selectedVaultIdsForReport.includes(v.id);
                  const vUnit = units.find(u => u.id === v.unitId);
                  const vStocks = stocks.filter(s => s.vaultSpaceId === v.id);
                  const vTotalQty = vStocks.reduce((sum, s) => sum + s.quantity, 0);

                  return (
                    <label
                      key={v.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition select-none ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedVaultIdsForReport(prev => [...prev, v.id]);
                            } else {
                              setSelectedVaultIdsForReport(prev => prev.filter(id => id !== v.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-sm text-slate-100">{v.code}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                              COFRE PARA MUNIÇÕES
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            Unidade: {vUnit ? vUnit.name : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-xs font-bold text-amber-400">
                          {vTotalQty.toLocaleString('pt-BR')} un.
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {vStocks.length} lote(s)
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-800 pt-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowPrintVaultSelectModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={selectedVaultIdsForReport.length === 0}
                onClick={() => {
                  setShowPrintVaultSelectModal(false);
                  handlePrintUnitAmmoReport(selectedVaultIdsForReport);
                }}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow transition flex items-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Cofres Selecionados ({selectedVaultIdsForReport.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetAmmo}
        title="Confirmar Exclusão"
        message={`Deseja realmente apagar permanentemente ${deleteTargetAmmo?.label || 'este item'} do sistema?`}
        onConfirm={confirmExecuteDeleteAmmo}
        onCancel={() => setDeleteTargetAmmo(null)}
      />

    </div>
  );
};
import React, { useState, useMemo, useEffect } from 'react';
import { User, Caliber, AmmunitionStock, AmmunitionMovement, VaultSpace, Department, Unit, AmmoMovementType, isUserExplosivista } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import { Disc, Plus, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, AlertCircle, AlertTriangle, Check, Shield, Search, Trash2, Printer, RotateCcw, UserX, UserCheck, Building, ChevronDown, ChevronUp, ChevronRight, Edit2, Filter, Eye, X, History, FileText } from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { printDocumentInPage } from '../utils/printHelper';
import { ModalTransferirMunicao } from './ModalTransferirMunicao';
import { ModalHistoricoTransferenciasMunicao } from './ModalHistoricoTransferenciasMunicao';

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
  const [showCaliberModal, setShowCaliberModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);
  const [transferTargetStock, setTransferTargetStock] = useState<AmmunitionStock | null>(null);

  // Ammo/Caliber Form & Edit State (Inside Cadastro de Munição Modal: Fabricante, Calibre, Tipo, Peso)
  const [caliberFabricante, setCaliberFabricante] = useState('');
  const [caliberName, setCaliberName] = useState('');
  const [caliberTipo, setCaliberTipo] = useState('');
  const [caliberPeso, setCaliberPeso] = useState('');
  const [editingCaliber, setEditingCaliber] = useState<Caliber | null>(null);

  // Ammo Movement Form
  const [movementType, setMovementType] = useState<AmmoMovementType>('Saída');
  const [selectedCaliberId, setSelectedCaliberId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [recipientOrReason, setRecipientOrReason] = useState('Curso ou Teste');

  // Cascading Selection State for Entrada de Munição
  const [entryFabricante, setEntryFabricante] = useState('');
  const [entryTipo, setEntryTipo] = useState('');
  const [entryPeso, setEntryPeso] = useState('');
  const [entryLote, setEntryLote] = useState('');
  const [entryAnoFabricacao, setEntryAnoFabricacao] = useState<number>(new Date().getFullYear());
  const [entryDestinacao, setEntryDestinacao] = useState('Operacional');

  // Responsible Officer Form State
  const [responsibleType, setResponsibleType] = useState<'SISTEMA' | 'FORA_DO_SISTEMA'>('SISTEMA');
  const [selectedResponsibleUserId, setSelectedResponsibleUserId] = useState('');
  const [customResponsibleName, setCustomResponsibleName] = useState('');
  const [customResponsibleMasp, setCustomResponsibleMasp] = useState('');

  // Observation (max 500 chars)
  const [observation, setObservation] = useState('');

  // Return Unused Ammo Modal State
  const [returnTargetMov, setReturnTargetMov] = useState<AmmunitionMovement | null>(null);
  const [returnQuantity, setReturnQuantity] = useState<number>(0);

  // General Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCaliberId, setFilterCaliberId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>(() => {
    if (currentUser.role === 'Geral') return 'ALL';
    return currentUser.departmentId || '';
  });
  const [filterUnitId, setFilterUnitId] = useState<string>(() => {
    if (currentUser.role === 'Geral') return 'ALL';
    return currentUser.unitId || '';
  });

  // Modal de Seleção de Cofres para Impressão
  const [showPrintVaultSelectModal, setShowPrintVaultSelectModal] = useState(false);
  const [selectedVaultIdsForReport, setSelectedVaultIdsForReport] = useState<string[]>([]);

  // Expanded departments accordion
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);

  // Movement Log Column Filters
  const [colFilterData, setColFilterData] = useState('');
  const [colFilterTipo, setColFilterTipo] = useState('');
  const [colFilterCalibre, setColFilterCalibre] = useState('');
  const [colFilterQtd, setColFilterQtd] = useState('');
  const [colFilterLocal, setColFilterLocal] = useState('');
  const [colFilterMotivo, setColFilterMotivo] = useState('');
  const [colFilterPolicial, setColFilterPolicial] = useState('');
  const [colFilterDevolucao, setColFilterDevolucao] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetAmmo, setDeleteTargetAmmo] = useState<{ type: 'caliber' | 'stock' | 'movement'; id: string; label: string } | null>(null);

  // Edit Ammo Stock Modal State (Fabricante, Lote, Tipo, Peso, Destinação, Ano, Quantidade e Transferência de Cofre)
  const [editingStock, setEditingStock] = useState<{
    stock: AmmunitionStock;
    caliberId: string;
    fabricante: string;
    tipoMunicao: string;
    pesoMunicao: string;
    loteMunicao: string;
    anoFabricacao: string | number;
    destinacao: string;
    quantity: number;
    additionalInfo: string;
    targetVaultSpaceId: string;
    transferMode: 'ALL' | 'PARTIAL';
    transferQuantity: number;
    transferObservation: string;
  } | null>(null);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [lotSelectionForEdit, setLotSelectionForEdit] = useState<{ stocks: AmmunitionStock[]; onSelect: (s: AmmunitionStock) => void } | null>(null);

  // Quick Direct Vault Movement State (Entrada direto no cofre)
  const [quickVaultMovement, setQuickVaultMovement] = useState<{
    stock: AmmunitionStock;
    type: 'Entrada' | 'Saída';
    quantity: number;
    responsibleType: 'SISTEMA' | 'FORA_DO_SISTEMA';
    responsibleUserId: string;
    responsibleName: string;
    responsibleMasp: string;
  } | null>(null);
  const [isSubmittingQuickMovement, setIsSubmittingQuickMovement] = useState(false);

  // Vault Movement History Modal State (detalhes iniciam ocultos e só mostram se selecionados)
  const [vaultHistoryStock, setVaultHistoryStock] = useState<AmmunitionStock | null>(null);
  const [selectedHistoryMovId, setSelectedHistoryMovId] = useState<string | null>(null);
  const [historyFilterCaliber, setHistoryFilterCaliber] = useState<boolean>(true);

  // Histórico de Movimentação Accordion State (inicia oculto igual aos cofres)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const isExplosivista = isUserExplosivista(currentUser);
  const canManageStock = isGeral || isArmeiro || isAdmin || isExplosivista || (currentUser.role === 'Policial' && currentUser.canMoveAmmunition);

  // User unit for restricted vault viewing
  const userUnit = units.find(u => u.id === currentUser.unitId);

  // Available vault spaces for ammo: MUST BE TYPE MUNIÇÕES
  const ammoVaultSpaces = vaultSpaces.filter(v => v.type === 'MUNIÇÕES');

  // Vault spaces for Entrada: visible ONLY the vaults of the user's unit
  const entryVaultSpaces = useMemo(() => {
    if (isGeral) return ammoVaultSpaces;
    const targetUnitId = currentUser.unitId || userUnit?.id;
    const unitVaults = ammoVaultSpaces.filter(v => v.unitId === targetUnitId);
    return unitVaults.length > 0 ? unitVaults : ammoVaultSpaces;
  }, [ammoVaultSpaces, isGeral, currentUser.unitId, userUnit]);

  // Unique manufacturers from registered calibers / ammo catalog
  const availableFabricantes = useMemo(() => {
    const fromCalibers = calibers.map(c => c.fabricante?.trim()).filter(Boolean) as string[];
    const set = Array.from(new Set(fromCalibers));
    if (set.length === 0) {
      return ['CBC', 'Magtech', 'Federal', 'Winchester', 'Sellier & Bellot', 'Fiocchi', 'Taurus'];
    }
    return set;
  }, [calibers]);

  // Calibers registered under the selected manufacturer
  const availableCalibresForFabricante = useMemo(() => {
    if (!entryFabricante) return calibers;
    const filtered = calibers.filter(c => (c.fabricante || '').toLowerCase() === entryFabricante.toLowerCase());
    return filtered.length > 0 ? filtered : calibers;
  }, [calibers, entryFabricante]);

  // Types registered under the selected caliber and manufacturer
  const availableTiposForCalibre = useMemo(() => {
    const matching = availableCalibresForFabricante.filter(c => c.id === selectedCaliberId || c.name === selectedCaliberId);
    const tipos = Array.from(new Set(matching.map(c => c.tipo?.trim()).filter(Boolean) as string[]));
    return tipos.length > 0 ? tipos : ['Ogival (ETOG)', 'Ponta Oca (EXPO / JHP)', 'FMJ', 'Treinamento', 'Operacional', 'Frangível', 'Traçante'];
  }, [availableCalibresForFabricante, selectedCaliberId]);

  // Weights registered under the selected caliber, manufacturer and type
  const availablePesosForTipo = useMemo(() => {
    const matching = availableCalibresForFabricante.filter(c => 
      (c.id === selectedCaliberId || c.name === selectedCaliberId) &&
      (!entryTipo || c.tipo === entryTipo)
    );
    const pesos = Array.from(new Set(matching.map(c => c.peso?.trim()).filter(Boolean) as string[]));
    return pesos.length > 0 ? pesos : ['115 gr', '124 gr', '147 gr', '180 gr', '165 gr', '55 gr', '62 gr', '158 gr', '230 gr'];
  }, [availableCalibresForFabricante, selectedCaliberId, entryTipo]);

  // Locations available for ammo exit: ONLY locations that possess stock of selectedCaliberId (> 0)
  // Formatted with observation instead of unit: ( L1 C1 - 5,56X45MM - SAT )
  const availableLocationsForExit = useMemo(() => {
    if (movementType !== 'Saída' || !selectedCaliberId) return [];

    const matchingStocks = stocks.filter(s => s.caliberId === selectedCaliberId && s.quantity > 0);

    return matchingStocks.map(st => {
      const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
      const unit = units.find(u => u.id === st.unitId);
      const dept = departments.find(d => d.id === st.departmentId);

      // Find movement observation for this caliber and vault space
      const stockMovs = movements.filter(m => m.vaultSpaceId === st.vaultSpaceId && m.caliberId === st.caliberId);
      const entryMov = stockMovs.find(m => m.type === 'Entrada' && (m.observation || m.recipientOrReason)) ||
                       stockMovs.find(m => m.observation || m.recipientOrReason) ||
                       stockMovs[0];

      const rawObs = entryMov?.observation
        ? entryMov.observation.trim()
        : (entryMov?.recipientOrReason ? entryMov.recipientOrReason.trim() : 'SAT');
      const obs = rawObs.toUpperCase();

      const calObj = calibers.find(c => c.id === st.caliberId);
      const calName = (calObj ? calObj.name : '').toUpperCase();
      const vCode = (vault ? vault.code : 'COFRE').toUpperCase();

      // Formatted label as requested: ( L1 C1 - 5,56X45MM - SAT )
      const formattedLabel = `( ${vCode} - ${calName} - ${obs} ) - Saldo: ${st.quantity} un.`;

      return {
        vaultSpaceId: st.vaultSpaceId,
        stockId: st.id,
        quantity: st.quantity,
        vCode,
        calName,
        obs,
        formattedLabel,
        unitName: unit ? unit.name : '',
        deptCode: dept ? dept.code : ''
      };
    });
  }, [movementType, selectedCaliberId, stocks, vaultSpaces, units, departments, movements, calibers]);

  // Selected stock object for the currently chosen vault when performing Saída
  const selectedExitStock = useMemo(() => {
    if (movementType !== 'Saída') return null;
    return availableLocationsForExit.find(loc => loc.vaultSpaceId === selectedVaultId) || null;
  }, [movementType, availableLocationsForExit, selectedVaultId]);

  // Ensure selectedVaultId stays valid when selectedCaliberId or movementType changes
  useEffect(() => {
    if (movementType === 'Saída') {
      const exists = availableLocationsForExit.some(loc => loc.vaultSpaceId === selectedVaultId);
      if (!exists && availableLocationsForExit.length > 0) {
        setSelectedVaultId(availableLocationsForExit[0].vaultSpaceId);
      } else if (availableLocationsForExit.length === 0) {
        setSelectedVaultId('');
      }
    }
  }, [selectedCaliberId, movementType, availableLocationsForExit, selectedVaultId]);

  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  // Open Movement Modal specifically for ENTRADA or SAÍDA
  const handleOpenMovementModal = (type: AmmoMovementType, initialDeptId?: string, initialUnitId?: string) => {
    setErrorMsg('');
    setMovementType(type);
    const initialCalId = calibers[0]?.id || '';
    setSelectedCaliberId(initialCalId);
    setQuantity(100);

    let matchingVaults = ammoVaultSpaces;
    if (initialUnitId) {
      matchingVaults = ammoVaultSpaces.filter(v => v.unitId === initialUnitId);
    } else if (initialDeptId) {
      matchingVaults = ammoVaultSpaces.filter(v => v.departmentId === initialDeptId);
    }

    if (type === 'Saída') {
      const exitStocks = stocks.filter(s => s.caliberId === initialCalId && s.quantity > 0);
      if (initialUnitId) {
        const uStocks = exitStocks.filter(s => s.unitId === initialUnitId);
        setSelectedVaultId(uStocks[0]?.vaultSpaceId || exitStocks[0]?.vaultSpaceId || '');
      } else if (initialDeptId) {
        const dStocks = exitStocks.filter(s => s.departmentId === initialDeptId);
        setSelectedVaultId(dStocks[0]?.vaultSpaceId || exitStocks[0]?.vaultSpaceId || '');
      } else {
        setSelectedVaultId(exitStocks[0]?.vaultSpaceId || '');
      }
    } else {
      const initialFab = availableFabricantes[0] || 'CBC';
      setEntryFabricante(initialFab);
      const matchingCals = calibers.filter(c => (c.fabricante || '').toLowerCase() === initialFab.toLowerCase());
      const firstCal = matchingCals[0] || calibers[0];
      setSelectedCaliberId(firstCal?.id || '');
      setEntryTipo(firstCal?.tipo || 'Operacional');
      setEntryPeso(firstCal?.peso || '124 gr');
      setEntryLote('');
      setEntryAnoFabricacao(new Date().getFullYear());
      setEntryDestinacao('Operacional');

      const targetUnitId = currentUser.unitId || userUnit?.id;
      const unitVaults = ammoVaultSpaces.filter(v => v.unitId === targetUnitId);
      setSelectedVaultId(unitVaults[0]?.id || matchingVaults[0]?.id || ammoVaultSpaces[0]?.id || '');
    }

    setRecipientOrReason(type === 'Entrada' ? 'Abastecimento do Cofre' : 'Curso ou Teste');
    
    setResponsibleType('SISTEMA');
    setSelectedResponsibleUserId(users[0]?.id || '');
    setCustomResponsibleName('');
    setCustomResponsibleMasp('');
    setObservation('');

    setShowMovementModal(true);
  };

  // Save Ammo / Caliber (Cadastro de Munição: Fabricante, Calibre, Tipo, Peso)
  const handleSaveCaliber = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!caliberName.trim()) {
      setErrorMsg('Informe o calibre da munição.');
      return;
    }

    try {
      if (editingCaliber) {
        await storage.updateCaliber(
          editingCaliber.id,
          caliberName.trim(),
          caliberFabricante.trim() || undefined,
          caliberTipo.trim() || undefined,
          caliberPeso.trim() || undefined
        );
        setSuccessMsg(`Cadastro de munição "${caliberName.trim()}" atualizado com sucesso.`);
      } else {
        await storage.addCaliber(
          caliberName.trim(),
          caliberFabricante.trim() || undefined,
          caliberTipo.trim() || undefined,
          caliberPeso.trim() || undefined
        );
        setSuccessMsg(`Cadastro de munição "${caliberName.trim()}" realizado com sucesso.`);
      }
      setCaliberFabricante('');
      setCaliberName('');
      setCaliberTipo('');
      setCaliberPeso('');
      setEditingCaliber(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar cadastro de munição.');
    }
  };

  const handleDeleteCaliber = (cal: Caliber) => {
    setDeleteTargetAmmo({ type: 'caliber', id: cal.id, label: `o calibre "${cal.name}"` });
  };

  const handleDeleteStock = (st: AmmunitionStock) => {
    const cal = calibers.find(c => c.id === st.caliberId);
    setDeleteTargetAmmo({ 
      type: 'stock', 
      id: st.id, 
      label: `o registro de estoque de ${st.quantity} un (${cal?.name || 'Calibre'})` 
    });
  };

  const handleDeleteAmmoMovement = (m: AmmunitionMovement) => {
    const cal = calibers.find(c => c.id === m.caliberId);
    setDeleteTargetAmmo({ 
      type: 'movement', 
      id: m.id, 
      label: `o lançamento de movimentação (${m.type} de ${m.quantity} un de ${cal?.name || m.caliberId})` 
    });
  };

  const confirmExecuteDeleteAmmo = async () => {
    if (!deleteTargetAmmo) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetAmmo.type === 'caliber') {
        await storage.deleteCaliber(deleteTargetAmmo.id);
        setSuccessMsg(`Calibre excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'stock') {
        await storage.deleteAmmoStock(deleteTargetAmmo.id, currentUser);
        setSuccessMsg(`Registro de estoque excluído com sucesso.`);
      } else if (deleteTargetAmmo.type === 'movement') {
        await storage.deleteAmmoMovement(deleteTargetAmmo.id, currentUser);
        setSuccessMsg(`Lançamento de munição excluído com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
    } finally {
      setDeleteTargetAmmo(null);
    }
  };

  // Open Edit Stock Modal (Alteração completa das especificações da munição e transferência de cofre)
  const handleOpenEditStock = (st: AmmunitionStock, currentObs: string) => {
    setEditingStock({
      stock: st,
      caliberId: st.caliberId,
      fabricante: st.fabricante || '',
      tipoMunicao: st.tipoMunicao || '',
      pesoMunicao: st.pesoMunicao || '',
      loteMunicao: st.loteMunicao || '',
      anoFabricacao: st.anoFabricacao || new Date().getFullYear(),
      destinacao: st.destinacao || 'Operacional',
      quantity: st.quantity,
      additionalInfo: currentObs || '',
      targetVaultSpaceId: st.vaultSpaceId,
      transferMode: 'ALL',
      transferQuantity: st.quantity,
      transferObservation: ''
    });
  };

  // Save Stock Edit
  const handleSaveStockEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsSavingStock(true);
    try {
      const isTransferring = Boolean(
        editingStock.targetVaultSpaceId && 
        editingStock.targetVaultSpaceId !== editingStock.stock.vaultSpaceId
      );
      const transferQty = editingStock.transferMode === 'ALL' ? editingStock.quantity : editingStock.transferQuantity;
      
      const destVault = vaultSpaces.find(v => v.id === editingStock.targetVaultSpaceId);
      const origVault = vaultSpaces.find(v => v.id === editingStock.stock.vaultSpaceId);

      await storage.updateAmmoStock(
        editingStock.stock.id,
        {
          quantity: editingStock.quantity,
          caliberId: editingStock.caliberId,
          fabricante: editingStock.fabricante || undefined,
          tipoMunicao: editingStock.tipoMunicao || undefined,
          pesoMunicao: editingStock.pesoMunicao || undefined,
          loteMunicao: editingStock.loteMunicao || undefined,
          anoFabricacao: editingStock.anoFabricacao || undefined,
          destinacao: editingStock.destinacao || undefined,
          additionalInfo: editingStock.additionalInfo,
          targetVaultSpaceId: isTransferring ? editingStock.targetVaultSpaceId : undefined,
          transferQuantity: isTransferring ? transferQty : undefined,
          transferObservation: isTransferring ? (editingStock.transferObservation || `Transferência do cofre ${origVault?.code || ''} para ${destVault?.code || ''}`) : undefined
        },
        currentUser
      );
      
      if (isTransferring) {
        setSuccessMsg(`Informações da munição atualizadas e ${transferQty} unidade(s) transferida(s) com sucesso para o cofre ${destVault?.code || ''}.`);
      } else {
        setSuccessMsg('Informações da munição alteradas com sucesso no cofre.');
      }
      setEditingStock(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar informações da munição.');
    } finally {
      setIsSavingStock(false);
    }
  };

  // Open Direct Vault Movement (Entrada ou Saída direto no cofre)
  const handleOpenQuickMovement = (st: AmmunitionStock, type: 'Entrada' | 'Saída') => {
    const activeUsers = users.length > 0 ? users : storage.getUsers();
    const defaultUser = activeUsers.find(u => u.id === currentUser.id) || activeUsers[0] || currentUser;
    setQuickVaultMovement({
      stock: st,
      type,
      quantity: type === 'Entrada' ? 50 : Math.min(50, st.quantity || 1),
      responsibleType: 'SISTEMA',
      responsibleUserId: defaultUser?.id || '',
      responsibleName: defaultUser?.name || currentUser.name,
      responsibleMasp: defaultUser?.masp || currentUser.masp
    });
  };

  // Save Direct Vault Movement (Inserindo apenas quantidade e policial responsável)
  const handleSaveQuickMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVaultMovement) return;
    const { stock, type, quantity: movQty, responsibleType, responsibleUserId, responsibleName, responsibleMasp } = quickVaultMovement;

    if (movQty <= 0) {
      setErrorMsg('A quantidade deve ser maior que zero.');
      return;
    }

    if (type === 'Saída' && movQty > stock.quantity) {
      setErrorMsg(`Quantidade de saída (${movQty}) não pode exceder o estoque disponível no cofre (${stock.quantity} un).`);
      return;
    }

    if (responsibleType === 'SISTEMA' && !responsibleUserId) {
      setErrorMsg('Selecione o policial responsável pela movimentação.');
      return;
    }

    if (responsibleType === 'FORA_DO_SISTEMA' && (!responsibleName.trim() || !responsibleMasp.trim())) {
      setErrorMsg('Informe o nome e o MASP do policial responsável.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmittingQuickMovement(true);
    try {
      const activeUsers = users.length > 0 ? users : storage.getUsers();
      const respUser = activeUsers.find(u => u.id === responsibleUserId);
      const finalName = responsibleType === 'SISTEMA' ? (respUser?.name || currentUser.name) : responsibleName.trim();
      const finalMasp = responsibleType === 'SISTEMA' ? (respUser?.masp || currentUser.masp) : responsibleMasp.trim();

      await storage.addAmmoMovement({
        type,
        caliberId: stock.caliberId,
        quantity: movQty,
        vaultSpaceId: stock.vaultSpaceId,
        recipientOrReason: type === 'Entrada' ? 'Abastecimento direto no cofre' : 'Saída direta do cofre',
        responsibleType,
        responsibleUserId: responsibleType === 'SISTEMA' ? responsibleUserId : undefined,
        responsibleName: finalName,
        responsibleMasp: finalMasp,
        observation: ''
      });

      const vault = vaultSpaces.find(v => v.id === stock.vaultSpaceId);
      setSuccessMsg(`${type} de ${movQty} unidades registrada com sucesso no cofre ${vault?.code || ''}.`);
      setQuickVaultMovement(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || `Erro ao registrar ${type.toLowerCase()} de munição no cofre.`);
    } finally {
      setIsSubmittingQuickMovement(false);
    }
  };

  // Save Movement (Entrada / Saída)
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedCaliberId) {
      setErrorMsg('Selecione o calibre.');
      return;
    }
    if (!selectedVaultId) {
      setErrorMsg('Selecione um local do cofre para munições.');
      return;
    }
    if (quantity <= 0) {
      setErrorMsg('Informe uma quantidade válida maior que zero.');
      return;
    }

    if (movementType === 'Saída') {
      const stock = stocks.find(s => s.vaultSpaceId === selectedVaultId && s.caliberId === selectedCaliberId);
      const availableQty = stock ? stock.quantity : 0;
      if (availableQty <= 0) {
        setErrorMsg('O local selecionado não possui estoque disponível para este calibre.');
        return;
      }
      if (quantity > availableQty) {
        setErrorMsg(`Quantidade solicitada (${quantity} un.) é superior ao saldo disponível no cofre (${availableQty} un.).`);
        return;
      }
    }

    let respName = '';
    let respMasp = '';
    let respUserId = '';

    if (responsibleType === 'SISTEMA') {
      const foundUser = users.find(u => u.id === selectedResponsibleUserId);
      if (!foundUser) {
        setErrorMsg('Selecione o policial responsável no sistema.');
        return;
      }
      respName = foundUser.name;
      respMasp = foundUser.masp;
      respUserId = foundUser.id;
    } else {
      if (!customResponsibleName.trim()) {
        setErrorMsg('Informe o nome do policial responsável (fora do sistema).');
        return;
      }
      respName = customResponsibleName.trim();
      respMasp = customResponsibleMasp.trim();
    }

    try {
      await storage.recordAmmoMovement({
        type: movementType,
        caliberId: selectedCaliberId,
        quantity,
        vaultSpaceId: selectedVaultId,
        recipientOrReason: movementType === 'Entrada' ? (entryDestinacao ? `Entrada - ${entryDestinacao}` : recipientOrReason) : recipientOrReason,
        fabricante: movementType === 'Entrada' ? (entryFabricante || undefined) : undefined,
        tipoMunicao: movementType === 'Entrada' ? (entryTipo || undefined) : undefined,
        pesoMunicao: movementType === 'Entrada' ? (entryPeso || undefined) : undefined,
        loteMunicao: movementType === 'Entrada' ? (entryLote || undefined) : undefined,
        anoFabricacao: movementType === 'Entrada' ? (entryAnoFabricacao || undefined) : undefined,
        destinacao: movementType === 'Entrada' ? (entryDestinacao || undefined) : undefined,
        responsibleType,
        responsibleUserId: respUserId,
        responsibleName: respName,
        responsibleMasp: respMasp,
        observation: observation.slice(0, 500)
      });

      setSuccessMsg(`Movimentação de ${movementType} de munição registrada com sucesso!`);
      setShowMovementModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar movimentação.');
    }
  };

  // Direct Print Receipt PDF function (In-page browser print, no popup modal, no extra tab)
  const handlePrintDirectReceipt = (m: AmmunitionMovement, isReturn: boolean = false, returnAmt?: number) => {
    const caliber = calibers.find(c => c.id === m.caliberId);
    const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);

    const responsibleText = m.responsibleName 
      ? `${m.responsibleName}${m.responsibleMasp ? ` (MASP/Doc: ${m.responsibleMasp})` : ''}`
      : m.recipientOrReason;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Munição - ${caliber?.name || 'Munição'}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .reg-id { font-family: monospace; font-size: 12px; font-weight: bold; text-align: right; }
          .status-bar { background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; font-family: monospace; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .box { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; font-family: monospace; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; letter-spacing: 0.5px; }
          .field { margin-bottom: 6px; }
          .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .val { font-size: 12px; font-weight: bold; color: #000; }
          .signatures { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMARIA • COMPROVANTE DE MOVIMENTAÇÃO DE MUNIÇÃO</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${m.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>TIPO:</strong> ${isReturn ? 'DEVOLUÇÃO DE MUNIÇÃO' : (m.type === 'Saída' ? 'SAÍDA / FORNECIMENTO' : 'ENTRADA / REPOSIÇÃO')}</div>
          <div><strong>Data:</strong> ${formatTimestamp(m.createdAt)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados da Munição</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Calibre:</span> <span class="val">${caliber?.name || m.caliberId}</span></div>
            <div class="field"><span class="label">Quantidade:</span> <span class="val">${isReturn ? (returnAmt || m.returnedQuantity || 0) : m.quantity} unidades</span></div>
            <div class="field"><span class="label">Cofre:</span> <span class="val">${vault?.code || 'Cofre Principal'}</span></div>
            <div class="field"><span class="label">Operador:</span> <span class="val">${m.userName}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Responsável e Motivo</div>
          <div class="field"><span class="label">Responsável:</span> <span class="val">${responsibleText}</span></div>
          <div class="field"><span class="label">Motivo / Destino:</span> <span class="val">${m.recipientOrReason}</span></div>
          ${m.observation ? `<div class="field" style="margin-top: 6px;"><span class="label">Observações:</span> <span class="val" style="font-weight: normal;">${m.observation}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${m.responsibleName || 'Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Responsável</span>
          </div>
          <div class="sig-line">
            ${m.userName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Operador</span><br>
          </div>
        </div>

        <div class="footer">
          Documento impresso eletronicamente pelo Sistema de Armeria em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Print Vault Movement History Report
  const handlePrintVaultHistoryReport = (targetStock: AmmunitionStock, historyMovs: AmmunitionMovement[]) => {
    const vault = vaultSpaces.find(v => v.id === targetStock.vaultSpaceId);
    const unit = units.find(u => u.id === targetStock.unitId);
    const dept = departments.find(d => d.id === targetStock.departmentId);
    const cal = calibers.find(c => c.id === targetStock.caliberId);

    const totalEntradas = historyMovs
      .filter(m => m.type === 'Entrada')
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalSaidas = historyMovs
      .filter(m => m.type === 'Saída')
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalDevolvido = historyMovs
      .reduce((sum, m) => sum + (m.returnedQuantity || 0), 0);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Movimentações - Cofre ${vault?.code || ''}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 15px; font-size: 11px; line-height: 1.35; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; }
          .subtitle { font-size: 11px; font-weight: bold; color: #374151; margin-top: 2px; }
          .meta-box { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-family: monospace; font-size: 11px; }
          .meta-item .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .meta-item .val { font-size: 11px; font-weight: bold; color: #000; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
          th { background: #f9fafb; font-weight: bold; text-transform: uppercase; font-size: 9px; color: #374151; }
          .badge-entrada { background: #dcfce7; color: #166534; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 9px; display: inline-block; }
          .badge-saida { background: #fef3c7; color: #92400e; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 9px; display: inline-block; }
          .footer { margin-top: 25px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 8px; }
          .signatures { margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 10px; }
          .sig-line { border-top: 1px solid #000; padding-top: 6px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMARIA • RELATÓRIO DE MOVIMENTAÇÕES DE MUNIÇÕES NO COFRE</div>
          </div>
          <div style="text-align: right; font-family: monospace; font-size: 10px;">
            Emissão: ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <div class="meta-box">
          <div class="meta-item"><span class="label">Cofre:</span><span class="val">${vault?.code || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Calibre:</span><span class="val">${historyFilterCaliber ? (cal?.name || 'N/A') : 'Todos os Calibres'}</span></div>
          <div class="meta-item"><span class="label">Unidade:</span><span class="val">${unit?.name || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Departamento:</span><span class="val">${dept?.name || 'N/A'}</span></div>
          <div class="meta-item"><span class="label">Estoque Atual:</span><span class="val" style="color: #059669;">${targetStock.quantity} un.</span></div>
          <div class="meta-item"><span class="label">Total Entradas:</span><span class="val">+${totalEntradas} un.</span></div>
          <div class="meta-item"><span class="label">Total Saídas:</span><span class="val">-${totalSaidas} un.</span></div>
          <div class="meta-item"><span class="label">Total Devolvido:</span><span class="val">${totalDevolvido} un.</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Data/Hora</th>
              <th style="width: 10%;">Tipo</th>
              <th style="width: 12%;">Calibre</th>
              <th style="width: 10%; text-align: right;">Qtd</th>
              <th style="width: 20%;">Policial Responsável</th>
              <th style="width: 18%;">Motivo / Destino</th>
              <th style="width: 15%;">Informações Adicionais</th>
            </tr>
          </thead>
          <tbody>
            ${historyMovs.length === 0 ? `
              <tr><td colspan="7" style="text-align: center; color: #6b7280; padding: 15px;">Nenhuma movimentação registrada para este cofre.</td></tr>
            ` : historyMovs.map(m => {
              const mCal = calibers.find(c => c.id === m.caliberId);
              const resp = m.responsibleName ? `${m.responsibleName}${m.responsibleMasp ? ` (${m.responsibleMasp})` : ''}` : (m.recipientOrReason || '-');
              return `
                <tr>
                  <td style="font-family: monospace;">${formatTimestamp(m.createdAt)}</td>
                  <td><span class="${m.type === 'Entrada' ? 'badge-entrada' : 'badge-saida'}">${m.type}</span></td>
                  <td><strong>${mCal?.name || m.caliberId}</strong></td>
                  <td style="text-align: right; font-weight: bold; font-family: monospace;">${m.type === 'Entrada' ? `+${m.quantity}` : `-${m.quantity}`}</td>
                  <td>${resp}</td>
                  <td>${m.recipientOrReason || '-'}</td>
                  <td>${m.observation || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sig-line">
            ${currentUser.name} (MASP: ${currentUser.masp})<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro / Responsável pela Emissão</span>
          </div>
          <div class="sig-line">
            Visto da Chefia / Inspetoria<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Assinatura / Carimbo</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado eletronicamente pelo Sistema de Armeria • Polícia Civil de Minas Gerais
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Candidatos de cofres de MUNIÇÕES para o relatório
  const candidateAmmoVaults = useMemo(() => {
    let list = vaultSpaces.filter(v => v.type === 'MUNIÇÕES');
    if (filterUnitId && filterUnitId !== 'ALL') {
      list = list.filter(v => v.unitId === filterUnitId || (!v.unitId && v.departmentId === filterDepartmentId));
    } else if (filterDepartmentId && filterDepartmentId !== 'ALL') {
      list = list.filter(v => v.departmentId === filterDepartmentId);
    } else if (!isGeral) {
      if (currentUser.unitId) {
        list = list.filter(v => v.unitId === currentUser.unitId || (!v.unitId && v.departmentId === currentUser.departmentId));
      } else if (currentUser.departmentId) {
        list = list.filter(v => v.departmentId === currentUser.departmentId);
      }
    }
    return list;
  }, [vaultSpaces, filterUnitId, filterDepartmentId, isGeral, currentUser]);

  const handleOpenPrintVaultModal = () => {
    const defaultIds = candidateAmmoVaults.map(v => v.id);
    setSelectedVaultIdsForReport(defaultIds);
    setShowPrintVaultSelectModal(true);
  };

  // Impressão de Relatório de Munições por Cofre (um cofre por página, selecionados pelo usuário em comando único)
  const handlePrintUnitAmmoReport = (vaultIdsToPrint?: string[]) => {
    const targetVaults = (vaultIdsToPrint && vaultIdsToPrint.length > 0)
      ? vaultSpaces.filter(v => v.type === 'MUNIÇÕES' && vaultIdsToPrint.includes(v.id))
      : candidateAmmoVaults;

    if (targetVaults.length === 0) {
      setErrorMsg('Nenhum cofre de munições selecionado para impressão.');
      return;
    }

    const defaultUnitId = filterUnitId && filterUnitId !== 'ALL' ? filterUnitId : currentUser.unitId || (units.length > 0 ? units[0].id : '');
    const defaultUnit = units.find(u => u.id === defaultUnitId) || { id: defaultUnitId, name: 'Unidade Policial', departmentId: '' };
    const defaultDept = departments.find(d => d.id === defaultUnit.departmentId) || departments.find(d => d.id === currentUser.departmentId);

    const vaultsHtml = targetVaults.map((v, idx) => {
      const vUnit = units.find(u => u.id === v.unitId) || defaultUnit;
      const vDept = departments.find(d => d.id === (v.departmentId || vUnit.departmentId)) || defaultDept;
      const vStocks = stocks.filter(s => s.vaultSpaceId === v.id);
      const vTotal = vStocks.reduce((sum, s) => sum + s.quantity, 0);
      const isLast = idx === targetVaults.length - 1;

      const vCalibresCount = new Set(vStocks.map(s => s.caliberId)).size;
      const vLotesCount = new Set(vStocks.map(s => s.loteMunicao).filter(Boolean)).size;

      return `
        <div class="vault-report-page ${!isLast ? 'page-break' : ''}">
          <div class="header-table">
            <div class="title-area">
              <h2>POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
              <h3>${vDept ? vDept.name : 'DEPARTAMENTO DE POLÍCIA'} - ${vUnit.name}</h3>
              <h1>RELATÓRIO INDIVIDUAL DE ESTOQUE NO COFRE</h1>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #475569;">
                INVENTÁRIO FÍSICO DO COFRE ${v.code} (MUNIÇÕES) • EMISSÃO: ${new Date().toLocaleString('pt-BR')} • RELATÓRIO ${idx + 1} DE ${targetVaults.length}
              </p>
            </div>
          </div>

          <div class="vault-banner">
            <div>
              <span class="vault-title">COFRE: ${v.code}</span>
              <span class="vault-type-badge">COFRE PARA MUNIÇÕES</span>
            </div>
            <div class="vault-unit-info">
              Unidade: <strong>${vUnit.name}</strong> • Depto: <strong>${vDept ? vDept.name : 'PCMG'}</strong>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-item">
              <div class="label">Total no Cofre</div>
              <div class="val">${vTotal.toLocaleString('pt-BR')} un.</div>
            </div>
            <div class="summary-item">
              <div class="label">Calibres Distintos</div>
              <div class="val">${vCalibresCount}</div>
            </div>
            <div class="summary-item">
              <div class="label">Lotes Distintos</div>
              <div class="val">${vLotesCount}</div>
            </div>
            <div class="summary-item">
              <div class="label">Status do Local</div>
              <div class="val" style="color: ${vTotal > 0 ? '#0284c7' : '#64748b'};">${vTotal > 0 ? 'ATIVO COM CARGA' : 'LIVRE / SEM MUNIÇÕES'}</div>
            </div>
          </div>

          <h4 style="margin: 12px 0 6px 0; font-size: 11px; text-transform: uppercase; background: #0f172a; color: #fff; padding: 5px 8px; border-radius: 3px;">
            MUNIÇÕES ESTOCADAS NO COFRE ${v.code}
          </h4>

          ${vStocks.length === 0 ? `
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 25px; text-align: center; color: #64748b; font-style: italic; margin: 15px 0;">
              Nenhuma munição estocada neste cofre no momento.
            </div>
          ` : `
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 18%;">Calibre</th>
                  <th style="width: 14%;">Fabricante</th>
                  <th style="width: 16%;">Tipo / Projétil</th>
                  <th style="width: 10%;">Peso</th>
                  <th style="width: 14%;">Lote</th>
                  <th style="width: 8%;">Ano</th>
                  <th style="width: 10%;">Destinação</th>
                  <th style="width: 10%; text-align: right;">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                ${vStocks.map(s => {
                  const cal = calibers.find(c => c.id === s.caliberId);
                  const calName = cal ? cal.name : s.caliberId;
                  const fab = s.fabricante || cal?.fabricante || 'CBC';
                  const tipo = s.tipoMunicao || cal?.tipo || 'COMUM';
                  const peso = s.pesoMunicao || cal?.peso || 'N/I';
                  const lote = s.loteMunicao || 'S/L';
                  const ano = s.anoFabricacao || 'N/A';
                  const dest = s.destinacao || 'Operacional';

                  return `
                    <tr>
                      <td><strong>${calName}</strong></td>
                      <td>${fab}</td>
                      <td>${tipo}</td>
                      <td>${peso}</td>
                      <td style="font-family: monospace; font-weight: bold; color: #b45309;">${lote}</td>
                      <td>${ano}</td>
                      <td>${dest}</td>
                      <td class="qty-col">${s.quantity.toLocaleString('pt-BR')} un.</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="vault-footer">
              Subtotal do Cofre ${v.code}: ${vTotal.toLocaleString('pt-BR')} cartuchos
            </div>
          `}

          <div class="signatures">
            <div class="sig-box">
              <strong>${currentUser.name}</strong><br/>
              MASP: ${currentUser.masp || 'Armeiro'}<br/>
              Armeiro / Responsável pelo Material Bélico
            </div><br/>


            

          <div class="footer-note">
            Cofre ${v.code} (Relatório ${idx + 1} de ${targetVaults.length}) • Documento gerado eletronicamente pelo Sistema de Armaria PCMG • ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Cofres de Munições - ${defaultUnit.name}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            color: #111827;
            background: #fff;
            margin: 0;
            padding: 0;
            line-height: 1.35;
          }
          .vault-report-page {
            box-sizing: border-box;
            min-height: 260mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 8px 0;
          }
          .page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .title-area { text-align: center; }
          .title-area h2 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
          .title-area h3 { margin: 2px 0 0 0; font-size: 11px; font-weight: normal; text-transform: uppercase; }
          .title-area h1 { margin: 6px 0 0 0; font-size: 14px; font-weight: bold; text-decoration: underline; }
          .vault-banner {
            background: #0f172a;
            color: #fff;
            padding: 8px 12px;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          .vault-title { font-size: 14px; font-weight: 900; font-family: monospace; letter-spacing: 0.5px; }
          .vault-type-badge { background: #0284c7; color: #fff; font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 3px; margin-left: 8px; }
          .vault-unit-info { font-size: 10px; color: #cbd5e1; }
          .summary-card {
            display: flex;
            justify-content: space-between;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 14px;
            margin-bottom: 12px;
          }
          .summary-item { text-align: center; }
          .summary-item .label { font-size: 9px; text-transform: uppercase; color: #475569; font-weight: bold; }
          .summary-item .val { font-size: 14px; font-weight: 900; color: #0f172a; font-family: monospace; }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            border: 1px solid #cbd5e1;
          }
          table.data-table th {
            background: #f1f5f9;
            color: #1e293b;
            font-weight: bold;
            text-align: left;
            padding: 6px;
            border-bottom: 1px solid #cbd5e1;
            text-transform: uppercase;
            font-size: 9px;
          }
          table.data-table td {
            padding: 6px;
            border-bottom: 1px solid #e2e8f0;
          }
          table.data-table tr:nth-child(even) { background: #f8fafc; }
          .qty-col { text-align: right; font-family: monospace; font-weight: bold; font-size: 11px; color: #0369a1; }
          .vault-footer {
            background: #f1f5f9;
            padding: 5px 10px;
            display: flex;
            justify-content: flex-end;
            font-weight: bold;
            font-size: 10px;
            border: 1px solid #cbd5e1;
            border-top: none;
            margin-bottom: 15px;
          }
          .signatures {
            margin-top: 25px;
            display: flex;
            justify-content: space-between;
          }
          .sig-box {
            width: 45%;
            text-align: center;
            border-top: 1px solid #000;
            padding-top: 5px;
            font-size: 10px;
          }
          .footer-note {
            margin-top: 15px;
            text-align: center;
            font-size: 9px;
            color: #64748b;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        ${vaultsHtml}
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  // Submit Unused Ammo Return
  const handleConfirmReturnAmmo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetMov) return;
    setErrorMsg('');
    setSuccessMsg('');

    const maxReturnable = returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0);
    if (returnQuantity <= 0 || returnQuantity > maxReturnable) {
      setErrorMsg(`A quantidade de devolução deve estar entre 1 e ${maxReturnable}.`);
      return;
    }

    try {
      await storage.returnUnusedAmmo(returnTargetMov.id, returnQuantity);
      setSuccessMsg(`Devolução de ${returnQuantity} munições registrada com sucesso.`);
      
      const updatedMov = {
        ...returnTargetMov,
        returnedQuantity: (returnTargetMov.returnedQuantity || 0) + returnQuantity,
        returnedAt: new Date().toISOString(),
        returnedByUserName: currentUser.name
      };

      setReturnTargetMov(null);
      onRefresh();

      // Directly call print browser helper
      handlePrintDirectReceipt(updatedMov, true, returnQuantity);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar devolução.');
    }
  };

  // Filtered Departments to display
  const visibleDepts = isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId);

  // Available units filtered by department filter
  const availableUnitsForFilter = (filterDepartmentId && filterDepartmentId !== 'ALL')
    ? units.filter(u => u.departmentId === filterDepartmentId)
    : (isGeral ? units : units.filter(u => u.departmentId === currentUser.departmentId));

  const canSelectAllUnits = isGeral || currentUser.role === 'Administrador' || currentUser.role === 'Armeiro';
  const selectedDepartmentObj = departments.find(d => d.id === filterDepartmentId);
  const selectedUnitObj = units.find(u => u.id === filterUnitId);

  // Filtered stocks according to global filters and active search term across all fields
  const term = searchTerm.toLowerCase().trim();
  const filteredStocks = stocks.filter(s => {
    if (filterCaliberId && s.caliberId !== filterCaliberId) return false;
    if (filterDepartmentId && filterDepartmentId !== 'ALL' && s.departmentId !== filterDepartmentId) return false;
    if (filterUnitId && filterUnitId !== 'ALL' && s.unitId !== filterUnitId) return false;

    if (term) {
      const cal = calibers.find(c => c.id === s.caliberId);
      const vault = vaultSpaces.find(v => v.id === s.vaultSpaceId);
      const unit = units.find(u => u.id === s.unitId);
      const dept = departments.find(d => d.id === s.departmentId);

      const calName = (cal?.name || s.caliberId || '').toLowerCase();
      const fab = (s.fabricante || cal?.fabricante || '').toLowerCase();
      const lote = (s.loteMunicao || '').toLowerCase();
      const tipo = (s.tipoMunicao || cal?.tipo || '').toLowerCase();
      const peso = (s.pesoMunicao || cal?.peso || '').toLowerCase();
      const ano = (s.anoFabricacao?.toString() || '').toLowerCase();
      const dest = (s.destinacao || '').toLowerCase();
      const vCode = (vault?.code || '').toLowerCase();
      const uName = (unit?.name || '').toLowerCase();
      const dName = (dept?.name || '').toLowerCase();
      const addInfo = (s.additionalInfo || '').toLowerCase();

      const matches =
        calName.includes(term) ||
        fab.includes(term) ||
        lote.includes(term) ||
        tipo.includes(term) ||
        peso.includes(term) ||
        ano.includes(term) ||
        dest.includes(term) ||
        vCode.includes(term) ||
        uName.includes(term) ||
        dName.includes(term) ||
        addInfo.includes(term);

      if (!matches) return false;
    }

    return true;
  });

  // Filtered movements according to column filters
  const filteredMovements = movements.filter(m => {
    // Global dropdown filters
    if (filterCaliberId && m.caliberId !== filterCaliberId) return false;
    const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);
    const movDeptId = m.departmentId || vault?.departmentId;
    const movUnitId = m.unitId || vault?.unitId;
    if (filterDepartmentId && filterDepartmentId !== 'ALL' && movDeptId && movDeptId !== filterDepartmentId) return false;
    if (filterUnitId && filterUnitId !== 'ALL' && movUnitId && movUnitId !== filterUnitId) return false;

    // Column text/dropdown filters
    if (colFilterData && !formatTimestamp(m.createdAt).toLowerCase().includes(colFilterData.toLowerCase())) return false;
    if (colFilterTipo && m.type !== colFilterTipo) return false;

    const cal = calibers.find(c => c.id === m.caliberId);
    if (colFilterCalibre && cal && !cal.name.toLowerCase().includes(colFilterCalibre.toLowerCase())) return false;

    if (colFilterQtd && !m.quantity.toString().includes(colFilterQtd)) return false;

    const unit = vault ? units.find(u => u.id === vault.unitId) : null;
    const dept = vault ? departments.find(d => d.id === vault.departmentId) : null;
    const localText = `${vault ? vault.code : ''} ${unit ? unit.name : ''} ${dept ? dept.name : ''}`.toLowerCase();
    if (colFilterLocal && !localText.includes(colFilterLocal.toLowerCase())) return false;

    if (colFilterMotivo && !m.recipientOrReason.toLowerCase().includes(colFilterMotivo.toLowerCase()) && !(m.observation || '').toLowerCase().includes(colFilterMotivo.toLowerCase())) return false;

    const respText = `${m.responsibleName || ''} ${m.responsibleMasp || ''}`.toLowerCase();
    if (colFilterPolicial && !respText.includes(colFilterPolicial.toLowerCase())) return false;

    if (colFilterDevolucao) {
      const devText = `${m.returnedQuantity || 0}`.toLowerCase();
      if (!devText.includes(colFilterDevolucao.toLowerCase())) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner with Separate Entrance & Exit Buttons */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Disc className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Gestão e Estoque de Munições por Departamento</h1>
            <p className="text-xs text-slate-400">
              Selecione o departamento para visualizar e registrar entrada ou saída de munição
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Button Cadastro de Munição - Opens Ammo/Caliber Management Modal (Fabricante, Calibre, Tipo, Peso) */}
          {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
            <button
              onClick={() => {
                setErrorMsg('');
                setCaliberFabricante('');
                setCaliberName('');
                setCaliberTipo('');
                setCaliberPeso('');
                setEditingCaliber(null);
                setShowCaliberModal(true);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Cadastro de Munição</span>
            </button>
          )}

          {/* Botão Único: Movimentação de Munições na Unidade */}
          {canManageStock && (
            <button
              onClick={() => handleOpenMovementModal('Entrada')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <ArrowRightLeft className="w-4 h-4 text-white" />
              <span>Movimentação de Munições na Unidade</span>
            </button>
          )}

          {/* Transferência de Unidade & Histórico Buttons */}
          {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
            <>
              <button
                onClick={() => setShowTransferHistoryModal(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Visualizar histórico de transferências de munições entre unidades"
              >
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Histórico Transferências</span>
                {storage.getAmmoTransfers(currentUser, filterUnitId || undefined).length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[10px] font-mono font-bold">
                    {storage.getAmmoTransfers(currentUser, filterUnitId || undefined).length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setTransferTargetStock(null);
                  setShowTransferModal(true);
                }}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Transferir munições para outra unidade policial"
              >
                <ArrowRightLeft className="w-4 h-4 text-white" />
                <span>Transferência de Unidade</span>
              </button>

              {/* Botão de Relatório de Munições da Unidade por Cofre */}
              <button
                type="button"
                onClick={handleOpenPrintVaultModal}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Imprimir relatório completo de todas as munições da unidade com seleção de cofres"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Relatório da Unidade por Cofre</span>
              </button>
            </>
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

      {/* STEP 1: Seleção de Departamento */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
            <Building className="w-4 h-4" />
            <span>1. Selecione o Departamento</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {visibleDepts.length} departamento(s) disponível(is)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {isGeral && (
            <button
              onClick={() => {
                setFilterDepartmentId('ALL');
                setFilterUnitId('ALL');
              }}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                filterDepartmentId === 'ALL' || !filterDepartmentId
                  ? 'bg-amber-500/10 border-amber-500/50 text-slate-100 ring-1 ring-amber-500/30'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 block uppercase">ESTADO</span>
                <span className="text-xs font-bold block truncate" title="Todos os Departamentos da Polícia Civil">Todos os Departamentos</span>
              </div>
            </button>
          )}

          {visibleDepts.map((d) => {
            const isSelected = d.id === filterDepartmentId;
            const deptStocks = stocks.filter(s => s.departmentId === d.id);
            const deptTotalCartuchos = deptStocks.reduce((acc, s) => acc + s.quantity, 0);

            return (
              <button
                key={d.id}
                onClick={() => {
                  setFilterDepartmentId(d.id);
                  const deptUnits = units.filter(u => u.departmentId === d.id);
                  setFilterUnitId(canSelectAllUnits ? 'ALL' : (deptUnits[0]?.id || ''));
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
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2: Seleção de Unidade para o Departamento Selecionado */}
      {filterDepartmentId && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
              <ChevronRight className="w-4 h-4" />
              <span>2. Selecione a Unidade em <strong className="text-slate-100">{filterDepartmentId === 'ALL' ? 'Todos os Departamentos' : (selectedDepartmentObj?.name || 'Departamento')}</strong></span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {availableUnitsForFilter.length} unidade(s) encontrada(s)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {canSelectAllUnits && (
              <button
                onClick={() => setFilterUnitId('ALL')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border ${
                  filterUnitId === 'ALL' || !filterUnitId
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Todas as Unidades</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  filterUnitId === 'ALL' || !filterUnitId ? 'bg-slate-950/30 text-slate-950 font-black' : 'bg-slate-900 text-amber-400 border border-slate-800'
                }`}>
                  {stocks.filter(s => filterDepartmentId === 'ALL' || !filterDepartmentId ? true : s.departmentId === filterDepartmentId).length} lotes
                </span>
              </button>
            )}

            {availableUnitsForFilter.map((u) => {
              const isSelected = u.id === filterUnitId;
              const unitStocks = stocks.filter(s => s.unitId === u.id);
              const unitTotalCartuchos = unitStocks.reduce((sum, s) => sum + s.quantity, 0);

              return (
                <button
                  key={u.id}
                  onClick={() => setFilterUnitId(u.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
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

      {/* STEP 3: Barra de Pesquisa Completa de Munições & Filtro de Calibre */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Campo de Pesquisa Aberta em Todos os Campos */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar munição por calibre, fabricante, lote, tipo, peso, destinação, cofre, ano ou detalhes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                title="Limpar termo de pesquisa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Calibre Filter Dropdown */}
            <select
              value={filterCaliberId}
              onChange={(e) => setFilterCaliberId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Todos os Calibres</option>
              {calibers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.fabricante ? `[${c.fabricante}] ` : ''}{c.name}{c.tipo ? ` - ${c.tipo}` : ''}
                </option>
              ))}
            </select>

            {/* Botão de Impressão com Seleção de Cofres */}
            <button
              type="button"
              onClick={handleOpenPrintVaultModal}
              className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2.5 rounded-xl text-xs transition shadow-sm"
              title="Selecionar quais cofres de munições imprimir (cada cofre em página separada)"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>Imprimir Relatório de Cofres</span>
            </button>
          </div>
        </div>

        {/* Linha de Feedback de Resultados da Pesquisa */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <div className="flex items-center space-x-2">
            <span>Exibindo: <strong className="text-slate-200 font-mono">{filteredStocks.length}</strong> lote(s) de munição</span>
            {searchTerm && (
              <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-mono text-[10px]">
                Filtro ativo: "{searchTerm}"
              </span>
            )}
          </div>
          <span className="font-mono text-amber-400 font-semibold">
            {filteredStocks.reduce((acc, s) => acc + s.quantity, 0)} cartuchos totais
          </span>
        </div>
      </div>

      {/* Departments Accordion for Ammunition Stock */}
      <div className="space-y-4">
        {visibleDepts.map((dept) => {
          if (filterDepartmentId && filterDepartmentId !== 'ALL' && dept.id !== filterDepartmentId) return null;

          const deptStocks = filteredStocks.filter(s => s.departmentId === dept.id);
          const isExpanded = filterDepartmentId === 'ALL' || filterDepartmentId === dept.id || expandedDeptIds.includes(dept.id);

          return (
            <div key={dept.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
              
              {/* Department Accordion Header */}
              <div
                onClick={() => toggleDeptExpand(dept.id)}
                className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                        {dept.code}
                      </span>
                      <h2 className="text-base font-bold text-slate-100">{dept.name}</h2>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {deptStocks.length} registro(s) de estoque neste departamento
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
                    {deptStocks.reduce((sum, s) => sum + s.quantity, 0)} un. Totais
                  </span>

                  {/* Direct Entrada / Saída buttons inside department header */}
                  {canManageStock && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenMovementModal('Entrada', dept.id)}
                        className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition"
                        title="Registrar Movimentação neste departamento"
                      >
                        + Movimentação
                      </button>
                    </div>
                  )}

                  <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {/* Department Stock Cards */}
              {isExpanded && (
                <div className="p-6 bg-slate-950/40 border-t border-slate-800/60">
                  {deptStocks.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      Nenhum estoque de munição registrado para este departamento.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(() => {
                        // Agrupa os registros por cofre (vaultSpaceId) para não duplicar visualmente o mesmo cofre (ex: L3 C2)
                        const vaultMap = new Map<string, AmmunitionStock[]>();
                        deptStocks.forEach(st => {
                          const key = st.vaultSpaceId || `no-vault-${st.id}`;
                          if (!vaultMap.has(key)) {
                            vaultMap.set(key, []);
                          }
                          vaultMap.get(key)!.push(st);
                        });
                        const groupedVaults = Array.from(vaultMap.values());

                        return groupedVaults.map((cofreStocks) => {
                          const primaryStock = cofreStocks[0];
                          const cal = calibers.find(c => c.id === primaryStock.caliberId);
                          const vault = vaultSpaces.find(v => v.id === primaryStock.vaultSpaceId);
                          const unit = units.find(u => u.id === primaryStock.unitId);
                          const totalVaultQty = cofreStocks.reduce((sum, s) => sum + s.quantity, 0);

                          // Movements associated with this stock item / vault
                          const stockMovs = movements.filter(m => 
                            cofreStocks.some(s => s.caliberId === m.caliberId && s.vaultSpaceId === m.vaultSpaceId)
                          );
                          const lastEntry = stockMovs.find(m => m.type === 'Entrada' && m.observation) ||
                                           stockMovs.find(m => m.type === 'Entrada') ||
                                           stockMovs.find(m => m.observation) ||
                                           stockMovs[0];
                          const lastMov = stockMovs[0];
                          const ammoObs = lastEntry?.observation?.trim() || '';
                          const distinctObs = Array.from(new Set(stockMovs.map(m => m.observation?.trim()).filter(Boolean))) as string[];

                          return (
                            <div
                              key={primaryStock.vaultSpaceId || primaryStock.id}
                              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between shadow-sm"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-amber-400 text-base">
                                    {cal ? cal.name : primaryStock.caliberId}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-slate-200 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                                    Cofre: {vault ? vault.code : 'N/A'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  Unidade: <strong className="text-slate-200">{unit ? unit.name : ''}</strong>
                                </p>

                                {/* Especificações Técnicas em formato limpo, vertical e sem células */}
                                <div className="mt-2.5 p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                                  {cofreStocks.map((lotItem, idx) => {
                                    const lotCal = calibers.find(c => c.id === lotItem.caliberId) || cal;
                                    const fab = lotItem.fabricante || lotCal?.fabricante || 'CBC';
                                    const calName = lotCal ? lotCal.name : lotItem.caliberId;
                                    const tipo = lotItem.tipoMunicao || lotCal?.tipo || 'COMUM';
                                    const peso = lotItem.pesoMunicao || lotCal?.peso || 'N/I';
                                    const lote = lotItem.loteMunicao || 'S/L';
                                    const dest = lotItem.destinacao || 'Operacional';
                                    const ano = lotItem.anoFabricacao || 'N/A';
                                    const isZero = lotItem.quantity <= 0;

                                    return (
                                      <div
                                        key={lotItem.id || idx}
                                        className={`text-xs text-slate-200 font-sans leading-relaxed py-2 ${
                                          idx > 0 ? 'border-t border-slate-800/80 mt-2' : ''
                                        }`}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-bold text-amber-400 text-sm tracking-wide">
                                            {fab}
                                          </span>
                                          {isZero && canManageStock && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteStock(lotItem)}
                                              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold transition shadow-sm"
                                              title="Apagar este registro que está sem munições"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              <span>Apagar Registro Vazio</span>
                                            </button>
                                          )}
                                        </div>
                                        <div className="text-slate-300">
                                          Calibre: <span className="font-mono text-slate-100">{calName}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Tipo: <span className="text-slate-100">{tipo}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Peso: <span className="font-mono text-slate-100">{peso}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Lote: <span className="font-mono font-bold text-amber-300">{lote}</span>
                                        </div>
                                        <div className="text-slate-300">
                                          Destinação: <span className="text-sky-300">{dest}</span>
                                        </div>
                                        <div className="text-slate-300 flex items-center justify-between pt-0.5">
                                          <span>
                                            Ano: <span className="font-mono text-slate-200">{ano}</span> — <strong className="font-mono text-emerald-400 font-bold">{lotItem.quantity} un.</strong>
                                          </span>
                                          {canManageStock && (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenEditStock(lotItem, ammoObs)}
                                              className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
                                              title="Alterar informações deste lote"
                                            >
                                              Alterar
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Detalhes da Munição em Lista */}
                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
                                  <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="font-bold text-amber-400 uppercase tracking-wider">
                                      Detalhes da Munição
                                    </span>
                                    {lastMov?.createdAt && (
                                      <span className="text-slate-500">
                                        {formatTimestamp(lastMov.createdAt).split(' ')[0]}
                                      </span>
                                    )}
                                  </div>

                                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/90 text-[11px]">
                                    {distinctObs.length === 0 ? (
                                      <span className="font-normal text-slate-500 italic text-xs">Padrão / Sem informações adicionais</span>
                                    ) : distinctObs.length === 1 ? (
                                      <p className="font-medium text-amber-300 whitespace-pre-wrap leading-relaxed text-xs">{distinctObs[0]}</p>
                                    ) : (
                                      <ul className="space-y-1.5 list-disc list-inside text-xs text-amber-300">
                                        {distinctObs.map((obsText, idx) => (
                                          <li key={idx} className="leading-relaxed">
                                            <span className="text-slate-200">{obsText}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                                <span className="text-xs text-slate-400">Estoque Atual no Cofre:</span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-base font-mono font-black text-emerald-400">
                                    {totalVaultQty} un
                                  </span>

                                  {/* Opção de Entrada nativa com dados completos (Botão Saída removido) */}
                                  {canManageStock && (
                                    <div className="flex items-center space-x-1 ml-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleOpenMovementModal('Entrada', primaryStock.departmentId, primaryStock.unitId);
                                          setSelectedCaliberId(primaryStock.caliberId);
                                          setSelectedVaultId(primaryStock.vaultSpaceId);
                                          if (primaryStock.fabricante) setEntryFabricante(primaryStock.fabricante);
                                          if (primaryStock.tipoMunicao) setEntryTipo(primaryStock.tipoMunicao);
                                          if (primaryStock.pesoMunicao) setEntryPeso(primaryStock.pesoMunicao);
                                          if (primaryStock.loteMunicao) setEntryLote(primaryStock.loteMunicao);
                                          if (primaryStock.anoFabricacao) setEntryAnoFabricacao(Number(primaryStock.anoFabricacao));
                                          if (primaryStock.destinacao) setEntryDestinacao(primaryStock.destinacao);
                                        }}
                                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition shadow-sm"
                                        title="Entrada de munição com formulário nativo completo"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>Entrar</span>
                                      </button>
                                    </div>
                                  )}

                                  {/* Botão de Transferir munição entre unidades */}
                                  {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
                                    <button
                                      type="button"
                                      disabled={totalVaultQty <= 0}
                                      onClick={() => {
                                        const targetStock = cofreStocks.find(s => s.quantity > 0) || primaryStock;
                                        setTransferTargetStock(targetStock);
                                        setShowTransferModal(true);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 disabled:opacity-40 transition"
                                      title="Transferir para outra unidade policial"
                                    >
                                      <ArrowRightLeft className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Ícone de alterar informações com seletor caso haja mais de um lote */}
                                  {canManageStock && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (cofreStocks.length > 1) {
                                          setLotSelectionForEdit({
                                           stocks: cofreStocks,
                                           onSelect: (selectedStock) => {
                                             setLotSelectionForEdit(null);
                                             handleOpenEditStock(selectedStock, ammoObs);
                                           }
                                          });
                                        } else {
                                          handleOpenEditStock(primaryStock, ammoObs);
                                        }
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                                      title="Alterar Informações da Munição"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Ícone de ver histórico de movimentações do cofre */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVaultHistoryStock(primaryStock);
                                      setSelectedHistoryMovId(null);
                                      setHistoryFilterCaliber(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition"
                                    title="Ver Histórico de Movimentações do Cofre"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Movement Log Table with Column Filters (Inicia oculto igual aos cofres) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition">
        
        {/* Accordion Header (idêntico à div dos cofres) */}
        <div
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="bg-slate-800/80 hover:bg-slate-800 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between cursor-pointer select-none transition"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                  HISTÓRICO
                </span>
                <h2 className="text-base font-bold text-slate-100">Histórico de Movimentação de Munições</h2>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {filteredMovements.length} registro(s) de movimentação de munições
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs bg-slate-950 text-amber-400 border border-slate-800 px-3 py-1 rounded-xl font-bold font-mono">
              {filteredMovements.length} Registros
            </span>

            <div className="text-slate-400 bg-slate-950/60 p-2 rounded-xl border border-slate-800 flex items-center justify-center">
              {isHistoryExpanded ? <ChevronUp className="w-5 h-5 text-amber-400" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </div>

        {/* Content Body - Inicia oculto e só abre ao selecionar a div, igual aos cofres */}
        {isHistoryExpanded && (
          <div className="p-6 bg-slate-950/40 border-t border-slate-800/60 space-y-4">
            {(colFilterData || colFilterTipo || colFilterCalibre || colFilterQtd || colFilterLocal || colFilterMotivo || colFilterPolicial || colFilterDevolucao) && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setColFilterData('');
                    setColFilterTipo('');
                    setColFilterCalibre('');
                    setColFilterQtd('');
                    setColFilterLocal('');
                    setColFilterMotivo('');
                    setColFilterPolicial('');
                    setColFilterDevolucao('');
                  }}
                  className="text-xs text-amber-400 hover:underline font-medium"
                >
                  Limpar Filtros de Coluna
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-2 px-3 min-w-[110px]">Data / Hora</th>
                <th className="py-2 px-3 min-w-[90px]">Tipo</th>
                <th className="py-2 px-3 min-w-[100px]">Calibre</th>
                <th className="py-2 px-3 min-w-[80px]">Quantidade</th>
                <th className="py-2 px-3 min-w-[120px]">Local / Unidade</th>
                <th className="py-2 px-3 min-w-[130px]">Motivo / Destino</th>
                <th className="py-2 px-3 min-w-[140px]">Policial Responsável</th>
                <th className="py-2 px-3 min-w-[110px]">Devolução</th>
                <th className="py-2 px-3 text-right min-w-[80px]">Ações</th>
              </tr>

              {/* Column Filter Inputs Header Row */}
              <tr className="bg-slate-950/60 border-b border-slate-800">
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterData}
                    onChange={(e) => setColFilterData(e.target.value)}
                    placeholder="Filtrar data..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 font-mono"
                  />
                </th>
                <th className="p-1">
                  <select
                    value={colFilterTipo}
                    onChange={(e) => setColFilterTipo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  >
                    <option value="">Todos</option>
                    <option value="Entrada">Entrada</option>
                    <option value="Saída">Saída</option>
                  </select>
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterCalibre}
                    onChange={(e) => setColFilterCalibre(e.target.value)}
                    placeholder="Filtrar calibre..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterQtd}
                    onChange={(e) => setColFilterQtd(e.target.value)}
                    placeholder="Qtd..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200 font-mono"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterLocal}
                    onChange={(e) => setColFilterLocal(e.target.value)}
                    placeholder="Local/Unidade..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterMotivo}
                    onChange={(e) => setColFilterMotivo(e.target.value)}
                    placeholder="Motivo/Destino..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterPolicial}
                    onChange={(e) => setColFilterPolicial(e.target.value)}
                    placeholder="Policial/MASP..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1">
                  <input
                    type="text"
                    value={colFilterDevolucao}
                    onChange={(e) => setColFilterDevolucao(e.target.value)}
                    placeholder="Devolução..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] text-slate-200"
                  />
                </th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const cal = calibers.find(c => c.id === m.caliberId);
                  const vault = vaultSpaces.find(v => v.id === m.vaultSpaceId);
                  const unit = vault ? units.find(u => u.id === vault.unitId) : null;

                  const reasonStr = (m.recipientOrReason || '').toLowerCase();
                  const isCourseOrTest = reasonStr.includes('curso') || reasonStr.includes('teste');
                  const returnedQty = m.returnedQuantity || 0;
                  const canReturnMore = m.type === 'Saída' && isCourseOrTest && returnedQty < m.quantity;

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {formatTimestamp(m.createdAt)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center space-x-1 w-fit ${
                            m.type === 'Entrada'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {m.type === 'Entrada' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          <span>{m.type}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-100">
                        {cal ? cal.name : m.caliberId}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-amber-400">
                        {m.quantity} un
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-200">
                        <div className="font-bold">{vault ? vault.code : 'N/A'}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{unit ? unit.name : ''}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-200">
                        <div>
                          <span>{m.recipientOrReason}</span>
                          {m.observation && (
                            <p className="text-[10px] text-slate-400 font-normal italic truncate max-w-xs" title={m.observation}>
                              Obs: {m.observation}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        <div>
                          <span className="font-bold block text-slate-100">
                            {m.responsibleName || m.recipientOrReason}
                          </span>
                          {m.responsibleMasp && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              MASP: {m.responsibleMasp}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Devolução Column */}
                      <td className="py-3 px-3 text-xs font-mono">
                        {m.type === 'Saída' && isCourseOrTest ? (
                          <div className="space-y-1">
                            <span className={`font-bold block ${returnedQty > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {returnedQty} / {m.quantity} dev.
                            </span>
                            {canReturnMore && (
                              <button
                                onClick={() => {
                                  setReturnTargetMov(m);
                                  setReturnQuantity(m.quantity - returnedQty);
                                }}
                                className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold text-[10px] px-2 py-0.5 rounded transition flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3 text-emerald-400" />
                                <span>Devolver</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">N/A</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right space-x-1">
                        <button
                          onClick={() => handlePrintDirectReceipt(m)}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition inline-flex items-center space-x-1"
                          title="Imprimir PDF do Recibo (Via Navegador)"
                        >
                          <Printer className="w-4 h-4" />
                          <span className="text-[10px] font-bold">PDF</span>
                        </button>

                        {canManageStock && (
                          <button
                            onClick={() => handleDeleteAmmoMovement(m)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                            title="Excluir Lançamento de Munição"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Cadastro de Munição (Fabricante, Calibre, Tipo, Peso) */}
      {showCaliberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                  <Disc className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Cadastro de Munição
                  </h3>
                  <p className="text-xs text-slate-400">
                    Especificação de Fabricante, Calibre, Tipo de Projétil e Peso
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCaliberModal(false);
                  setEditingCaliber(null);
                  setCaliberFabricante('');
                  setCaliberName('');
                  setCaliberTipo('');
                  setCaliberPeso('');
                }}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form de Cadastro / Edição: VISÍVEL PARA GERAL, ARMEIRO E ADMINISTRADOR */}
            {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') ? (
              <form onSubmit={handleSaveCaliber} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    {editingCaliber ? 'Editar Cadastro de Munição' : 'Cadastrar Nova Especificação de Munição'}
                  </h4>
                  {editingCaliber && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCaliber(null);
                        setCaliberFabricante('');
                        setCaliberName('');
                        setCaliberTipo('');
                        setCaliberPeso('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 underline"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Fabricante */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Fabricante <span className="text-slate-500 font-normal">(ex: CBC, Federal, Magtech)</span>
                    </label>
                    <input
                      type="text"
                      list="fabricantes-sugestoes"
                      value={caliberFabricante}
                      onChange={(e) => setCaliberFabricante(e.target.value)}
                      placeholder="Ex: CBC, Federal, Magtech..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <datalist id="fabricantes-sugestoes">
                      <option value="CBC" />
                      <option value="Magtech" />
                      <option value="Federal" />
                      <option value="Winchester" />
                      <option value="Sellier & Bellot" />
                      <option value="Fiocchi" />
                      <option value="Hornady" />
                      <option value="Speer" />
                      <option value="Aguila" />
                      <option value="Taurus" />
                    </datalist>
                  </div>

                  {/* Calibre */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Calibre <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      list="calibres-sugestoes"
                      value={caliberName}
                      onChange={(e) => setCaliberName(e.target.value)}
                      placeholder="Ex: 9x19mm, .40 S&W, 5,56x45mm..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                      required
                    />
                    <datalist id="calibres-sugestoes">
                      <option value="9x19mm" />
                      <option value=".40 S&W" />
                      <option value="5,56x45mm" />
                      <option value=".380 ACP" />
                      <option value=".38 SPL" />
                      <option value="12 GA" />
                      <option value="7,62x51mm" />
                      <option value=".45 ACP" />
                      <option value=".357 Magnum" />
                    </datalist>
                  </div>

                  {/* Tipo */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Tipo de Munição <span className="text-slate-500 font-normal">(ex: Ogival, FMJ, Ponta Oca)</span>
                    </label>
                    <input
                      type="text"
                      list="tipos-sugestoes"
                      value={caliberTipo}
                      onChange={(e) => setCaliberTipo(e.target.value)}
                      placeholder="Ex: Ogival, Ponta Oca, FMJ, Treino..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <datalist id="tipos-sugestoes">
                      <option value="Ogival (ETOG)" />
                      <option value="Ponta Oca (EXPO / JHP)" />
                      <option value="FMJ (Full Metal Jacket)" />
                      <option value="Treinamento" />
                      <option value="Operacional" />
                      <option value="Frangível" />
                      <option value="Traçante" />
                      <option value="Chumbo (Balote)" />
                    </datalist>
                  </div>

                  {/* Peso */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Peso do Projétil <span className="text-slate-500 font-normal">(ex: 115 gr, 124 gr, 180 gr)</span>
                    </label>
                    <input
                      type="text"
                      list="pesos-sugestoes"
                      value={caliberPeso}
                      onChange={(e) => setCaliberPeso(e.target.value)}
                      placeholder="Ex: 115 gr, 124 gr, 147 gr, 180 gr, 55 gr..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                    />
                    <datalist id="pesos-sugestoes">
                      <option value="115 gr" />
                      <option value="124 gr" />
                      <option value="147 gr" />
                      <option value="165 gr" />
                      <option value="180 gr" />
                      <option value="55 gr" />
                      <option value="62 gr" />
                      <option value="158 gr" />
                      <option value="230 gr" />
                    </datalist>
                  </div>
                </div>

                <div className="pt-2 flex justify-end space-x-2">
                  {editingCaliber && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCaliber(null);
                        setCaliberFabricante('');
                        setCaliberName('');
                        setCaliberTipo('');
                        setCaliberPeso('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded-xl transition"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shrink-0 shadow flex items-center space-x-1.5 transition"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingCaliber ? 'Salvar Alterações' : 'Cadastrar Munição'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-[11px] text-slate-500 italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                Apenas usuários dos perfis <strong>Geral</strong>, <strong>Armeiro</strong> e <strong>Administrador</strong> possuem permissão para cadastrar ou editar munições.
              </p>
            )}

            {/* Lista de Munições Cadastradas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span className="font-bold uppercase tracking-wider">Munições Cadastradas no Catálogo</span>
                <span className="font-mono">{calibers.length} registros</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {calibers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-6">Nenhuma munição cadastrada.</p>
                ) : (
                  calibers.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-100 text-sm">{c.name}</span>
                          {c.fabricante && (
                            <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md">
                              {c.fabricante}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          {c.tipo && (
                            <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                              Tipo: <strong className="text-slate-100">{c.tipo}</strong>
                            </span>
                          )}
                          {c.peso && (
                            <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                              Peso: <strong className="text-slate-100">{c.peso}</strong>
                            </span>
                          )}
                          {!c.fabricante && !c.tipo && !c.peso && (
                            <span className="text-slate-500 italic text-[10px]">Especificações não detalhadas</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 ml-3 shrink-0">
                        {(isGeral || currentUser.role === 'Armeiro' || currentUser.role === 'Administrador') && (
                          <>
                            <button
                              onClick={() => {
                                setEditingCaliber(c);
                                setCaliberFabricante(c.fabricante || '');
                                setCaliberName(c.name);
                                setCaliberTipo(c.tipo || '');
                                setCaliberPeso(c.peso || '');
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-900 rounded-lg transition"
                              title="Editar Cadastro de Munição"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCaliber(c)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition"
                              title="Excluir Cadastro de Munição"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowCaliberModal(false);
                  setEditingCaliber(null);
                  setCaliberFabricante('');
                  setCaliberName('');
                  setCaliberTipo('');
                  setCaliberPeso('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Movement (Entrada / Saída) */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl my-8">
            <h3 className="text-lg font-bold text-slate-100 mb-4 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <Disc className="w-5 h-5 text-amber-400" />
              <span>{movementType === 'Entrada' ? 'Registrar Entrada / Reabastecimento' : 'Registrar Saída de Munição'}</span>
            </h3>

            <form onSubmit={handleSaveMovement} className="space-y-4">
              
              {/* Type Selection Tabs */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMovementType('Entrada')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Entrada'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    ENTRADA / REABASTECIMENTO
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('Saída')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      movementType === 'Saída'
                        ? 'bg-red-950 text-red-400 border-red-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    SAÍDA DE MUNIÇÃO
                  </button>
                </div>
              </div>

              {/* If movementType === 'Entrada': Cascading selection (Fabricante -> Calibre -> Tipo -> Peso -> Lote -> Ano -> Destinação -> Qtd -> Cofre da Unidade) */}
              {movementType === 'Entrada' ? (
                <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5 pb-1 border-b border-slate-800/80">
                    <Disc className="w-4 h-4" />
                    <span>Especificações Técnicas da Munição de Entrada</span>
                  </div>

                  {/* 1. Fabricante & 2. Calibre */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        1. Fabricante <span className="text-amber-400">*</span>
                      </label>
                      <select
                        value={entryFabricante}
                        onChange={(e) => {
                          const fab = e.target.value;
                          setEntryFabricante(fab);
                          const matching = calibers.filter(c => (c.fabricante || '').toLowerCase() === fab.toLowerCase());
                          const first = matching[0] || calibers[0];
                          if (first) {
                            setSelectedCaliberId(first.id);
                            if (first.tipo) setEntryTipo(first.tipo);
                            if (first.peso) setEntryPeso(first.peso);
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium focus:border-amber-500"
                        required
                      >
                        {availableFabricantes.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        2. Calibre (Subcategoria) <span className="text-amber-400">*</span>
                      </label>
                      <select
                        value={selectedCaliberId}
                        onChange={(e) => {
                          const cId = e.target.value;
                          setSelectedCaliberId(cId);
                          const cal = calibers.find(c => c.id === cId);
                          if (cal?.tipo) setEntryTipo(cal.tipo);
                          if (cal?.peso) setEntryPeso(cal.peso);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-amber-300 font-mono font-bold focus:border-amber-500"
                        required
                      >
                        {availableCalibresForFabricante.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.tipo ? `(${c.tipo})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 3. Tipo & 4. Peso */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        3. Tipo de Munição <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        list="entry-tipos-list"
                        value={entryTipo}
                        onChange={(e) => setEntryTipo(e.target.value)}
                        placeholder="Ex: Ogival, ETOG, EXPO, FMJ..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium focus:border-amber-500"
                        required
                      />
                      <datalist id="entry-tipos-list">
                        {availableTiposForCalibre.map(t => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        4. Peso da Munição <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        list="entry-pesos-list"
                        value={entryPeso}
                        onChange={(e) => setEntryPeso(e.target.value)}
                        placeholder="Ex: 124 gr, 115 gr, 55 gr..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium focus:border-amber-500"
                        required
                      />
                      <datalist id="entry-pesos-list">
                        {availablePesosForTipo.map(p => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* 5. Lote, 6. Ano de Fabricação & 7. Destinação */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        5. Lote de Munição <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={entryLote}
                        onChange={(e) => setEntryLote(e.target.value)}
                        placeholder="Ex: CBC-2025/01"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono font-bold focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        6. Ano de Fabricação
                      </label>
                      <select
                        value={entryAnoFabricacao}
                        onChange={(e) => setEntryAnoFabricacao(parseInt(e.target.value) || new Date().getFullYear())}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                      >
                        {Array.from({ length: new Date().getFullYear() - 1990 + 1 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        7. Destinação
                      </label>
                      <select
                        value={entryDestinacao}
                        onChange={(e) => setEntryDestinacao(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 font-medium"
                      >
                        <option value="Defesa">Defesa</option>
                        <option value="Treinamento">Treinamento</option>
                        <option value="Ensaios">Ensaios</option>
                        <option value="Reserva estratégica">Reserva estratégica</option>
                      </select>
                    </div>
                  </div>

                  {/* 8. Quantidade & 9. Local no Cofre (Restrito à Unidade do Policial) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/60">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        8. Quantidade (unidades) <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-emerald-400 font-mono font-bold focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>9. Local no Cofre</span>
                        <span className="text-[10px] text-amber-400 font-mono">(Apenas sua unidade)</span>
                      </label>
                      <select
                        value={selectedVaultId}
                        onChange={(e) => setSelectedVaultId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                        required
                      >
                        {entryVaultSpaces.map((v) => {
                          const u = units.find(unit => unit.id === v.unitId);
                          const d = departments.find(dep => dep.id === v.departmentId);
                          return (
                            <option key={v.id} value={v.id}>
                              {v.code} - {u ? u.name : 'Unidade'} ({d ? d.code : ''})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Caliber & Quantity Grid for SAÍDA */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Calibre
                      </label>
                      <select
                        value={selectedCaliberId}
                        onChange={(e) => setSelectedCaliberId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                        required
                      >
                        {calibers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fabricante ? `[${c.fabricante}] ` : ''}{c.name}{c.tipo ? ` - ${c.tipo}` : ''}{c.peso ? ` (${c.peso})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Quantidade (unidades)
                        </label>
                        {selectedExitStock && (
                          <span className="text-[11px] font-mono font-bold text-amber-400">
                            Disponível: {selectedExitStock.quantity} un.
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={selectedExitStock ? selectedExitStock.quantity : undefined}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        disabled={availableLocationsForExit.length === 0}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono disabled:opacity-50"
                        required
                      />
                    </div>
                  </div>

                  {/* Vault Location for SAÍDA */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Localização do Estoque (Cofre - Calibre - Observação)
                    </label>
                    {availableLocationsForExit.length === 0 ? (
                      <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center space-x-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <div>
                          <strong className="block font-semibold">Sem estoque disponível</strong>
                          <span>Nenhum cofre possui estoque disponível para o calibre selecionado ({calibers.find(c => c.id === selectedCaliberId)?.name || 'calibre'}).</span>
                        </div>
                      </div>
                    ) : (
                      <select
                        value={selectedVaultId}
                        onChange={(e) => setSelectedVaultId(e.target.value)}
                        className="w-full bg-slate-950 border border-amber-600/70 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-mono font-semibold"
                        required
                      >
                        {availableLocationsForExit.map((loc) => (
                          <option key={loc.vaultSpaceId} value={loc.vaultSpaceId}>
                            {loc.formattedLabel}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Motivo / Destino da Munição
                </label>
                <select
                  value={recipientOrReason}
                  onChange={(e) => setRecipientOrReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-medium"
                >
                  <option value="Abastecimento">Abastecimento</option>
                  <option value="Curso ou Teste">Curso ou Teste (Permite retorno de sobras)</option>
                  <option value="Treinamento">Treinamento</option>
                  <option value="Substituição">Substituição</option>
                  <option value="Operacional">Operacional / Diligência</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {/* Policial Responsável pela Retirada */}
              <div className="border border-slate-800 bg-slate-950/60 p-3.5 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Policial Responsável pela Movimentação
                </label>

                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'SISTEMA'}
                      onChange={() => setResponsibleType('SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Policial Cadastrado no Sistema</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                    <input
                      type="radio"
                      name="respType"
                      checked={responsibleType === 'FORA_DO_SISTEMA'}
                      onChange={() => setResponsibleType('FORA_DO_SISTEMA')}
                      className="accent-amber-500"
                    />
                    <UserX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Fora do Sistema</span>
                  </label>
                </div>

                {responsibleType === 'SISTEMA' ? (
                  <div>
                    <select
                      value={selectedResponsibleUserId}
                      onChange={(e) => setSelectedResponsibleUserId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      required
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (MASP: {u.masp}) - {u.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">Nome do Policial</label>
                      <input
                        type="text"
                        value={customResponsibleName}
                        onChange={(e) => setCustomResponsibleName(e.target.value)}
                        placeholder="Nome Completo..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">MASP / Documento</label>
                      <input
                        type="text"
                        value={customResponsibleMasp}
                        onChange={(e) => setCustomResponsibleMasp(e.target.value)}
                        placeholder="Ex: 123.456-7"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informações adicionais (até 500 caracteres) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Informações adicionais
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {observation.length} / 500
                  </span>
                </div>
                <textarea
                  maxLength={500}
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="LOTE: [Informe o lote da munição]  POL: [Nome/Identificação do Policial]  - Observações adicionais..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={movementType === 'Saída' && availableLocationsForExit.length === 0}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Movimentação</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Devolução de Sobras de Munição */}
      {returnTargetMov && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-2 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <RotateCcw className="w-5 h-5 text-emerald-400" />
              <span>Devolução de Munições Não Utilizadas</span>
            </h3>

            <p className="text-xs text-slate-400 mb-4">
              Policial: <strong className="text-slate-200">{returnTargetMov.responsibleName || returnTargetMov.recipientOrReason}</strong>
              <br />
              Retirada inicial: <strong className="text-amber-400">{returnTargetMov.quantity} un</strong>
              {returnTargetMov.returnedQuantity ? ` (Já devolvidos: ${returnTargetMov.returnedQuantity} un)` : ''}
            </p>

            <form onSubmit={handleConfirmReturnAmmo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade a Devolver (Restante max: {returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)} un)
                </label>
                <input
                  type="number"
                  min="1"
                  max={returnTargetMov.quantity - (returnTargetMov.returnedQuantity || 0)}
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReturnTargetMov(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Informações da Munição (substitui exclusão permanente) */}
      {editingStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl space-y-0">
            <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Alterar Informações da Munição</h3>
                  <p className="text-[11px] text-slate-400">
                    Cofre Atual: <strong className="text-amber-400 font-mono">{vaultSpaces.find(v => v.id === editingStock.stock.vaultSpaceId)?.code || 'N/A'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockEdit} className="p-6 space-y-4 overflow-y-auto">
              {/* Localização / Transferência entre Cofres */}
              {(() => {
                const stockUnitId = editingStock.stock.unitId || currentUser.unitId;
                const unitVaults = vaultSpaces.filter(v => (!v.unitId || v.unitId === stockUnitId) && (v.type === 'MUNIÇÕES' || !v.type));
                const availableVaults = unitVaults.length > 0 ? unitVaults : vaultSpaces.filter(v => !v.unitId || v.unitId === stockUnitId);
                const currentVault = vaultSpaces.find(v => v.id === editingStock.stock.vaultSpaceId);
                const targetVault = vaultSpaces.find(v => v.id === editingStock.targetVaultSpaceId);
                const isTransferring = Boolean(editingStock.targetVaultSpaceId && editingStock.targetVaultSpaceId !== editingStock.stock.vaultSpaceId);

                return (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Cofre de Armazenamento
                      </label>
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        Cofre Atual: {currentVault?.code || 'N/A'}
                      </span>
                    </div>

                    <div>
                      <select
                        value={editingStock.targetVaultSpaceId}
                        onChange={(e) => {
                          const newVId = e.target.value;
                          setEditingStock({
                            ...editingStock,
                            targetVaultSpaceId: newVId,
                            transferQuantity: editingStock.quantity
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                      >
                        {availableVaults.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.code} {v.type ? `(${v.type})` : ''} {v.id === editingStock.stock.vaultSpaceId ? '— [Cofre Atual]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Alerta e Opções quando selecionado um cofre diferente */}
                    {isTransferring && (
                      <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-xl space-y-2.5 animate-fadeIn text-xs">
                        <div className="flex items-center space-x-2 text-amber-300 font-bold">
                          <ArrowRightLeft className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Transferência de Munições para o Cofre {targetVault?.code}</span>
                        </div>
                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                          Ao salvar, as munições serão transferidas do cofre <strong>{currentVault?.code}</strong> para o cofre <strong>{targetVault?.code}</strong> com registro automático no histórico de movimentações.
                        </p>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <label className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${editingStock.transferMode === 'ALL' ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                            <input
                              type="radio"
                              name="transferMode"
                              checked={editingStock.transferMode === 'ALL'}
                              onChange={() => setEditingStock({ ...editingStock, transferMode: 'ALL', transferQuantity: editingStock.quantity })}
                              className="text-amber-500 focus:ring-0"
                            />
                            <span className="font-semibold text-[11px]">Transferir Tudo ({editingStock.quantity} un.)</span>
                          </label>
                          <label className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition ${editingStock.transferMode === 'PARTIAL' ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                            <input
                              type="radio"
                              name="transferMode"
                              checked={editingStock.transferMode === 'PARTIAL'}
                              onChange={() => setEditingStock({ ...editingStock, transferMode: 'PARTIAL', transferQuantity: Math.min(editingStock.quantity, Math.max(1, Math.floor(editingStock.quantity / 2))) })}
                              className="text-amber-500 focus:ring-0"
                            />
                            <span className="font-semibold text-[11px]">Quantidade Parcial</span>
                          </label>
                        </div>

                        {editingStock.transferMode === 'PARTIAL' && (
                          <div className="pt-1">
                            <label className="block text-[10px] font-semibold text-slate-300 uppercase mb-1">
                              Quantidade a transferir para {targetVault?.code} (máximo: {editingStock.quantity})
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={editingStock.quantity}
                              value={editingStock.transferQuantity}
                              onChange={(e) => setEditingStock({
                                ...editingStock,
                                transferQuantity: Math.min(editingStock.quantity, Math.max(1, parseInt(e.target.value) || 1))
                              })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">
                              Permanecerão no cofre {currentVault?.code}: <strong>{editingStock.quantity - editingStock.transferQuantity} un.</strong>
                            </p>
                          </div>
                        )}

                        <div className="pt-1">
                          <label className="block text-[10px] font-semibold text-slate-300 uppercase mb-1">
                            Motivo / Justificativa da Transferência
                          </label>
                          <input
                            type="text"
                            value={editingStock.transferObservation}
                            onChange={(e) => setEditingStock({ ...editingStock, transferObservation: e.target.value })}
                            placeholder="Ex: Remanejamento interno de cofre, reorganização de estoque..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Fabricante & Calibre */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Fabricante
                  </label>
                  <input
                    type="text"
                    list="edit-fab-list"
                    value={editingStock.fabricante}
                    onChange={(e) => setEditingStock({ ...editingStock, fabricante: e.target.value })}
                    placeholder="CBC, Magtech..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <datalist id="edit-fab-list">
                    {availableFabricantes.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Calibre <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={editingStock.caliberId}
                    onChange={(e) => setEditingStock({ ...editingStock, caliberId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                    required
                  >
                    {calibers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fabricante ? `[${c.fabricante}] ` : ''}{c.name}{c.tipo ? ` - ${c.tipo}` : ''}{c.peso ? ` (${c.peso})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tipo & Peso */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tipo de Munição
                  </label>
                  <input
                    type="text"
                    list="edit-tipos-list"
                    value={editingStock.tipoMunicao}
                    onChange={(e) => setEditingStock({ ...editingStock, tipoMunicao: e.target.value })}
                    placeholder="ETOG, FMJ, EXPO..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <datalist id="edit-tipos-list">
                    {availableTiposForCalibre.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Peso da Munição
                  </label>
                  <input
                    type="text"
                    list="edit-pesos-list"
                    value={editingStock.pesoMunicao}
                    onChange={(e) => setEditingStock({ ...editingStock, pesoMunicao: e.target.value })}
                    placeholder="124 gr, 115 gr..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium"
                  />
                  <datalist id="edit-pesos-list">
                    {availablePesosForTipo.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>

              {/* Lote, Ano de Fabricação & Destinação */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Lote
                  </label>
                  <input
                    type="text"
                    value={editingStock.loteMunicao}
                    onChange={(e) => setEditingStock({ ...editingStock, loteMunicao: e.target.value })}
                    placeholder="LOTE-2025/01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Ano Fab.
                  </label>
                  <select
                    value={editingStock.anoFabricacao}
                    onChange={(e) => setEditingStock({ ...editingStock, anoFabricacao: parseInt(e.target.value) || new Date().getFullYear() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  >
                    {Array.from({ length: new Date().getFullYear() - 1990 + 1 }, (_, i) => new Date().getFullYear() - i).map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Destinação
                  </label>
                  <select
                    value={editingStock.destinacao}
                    onChange={(e) => setEditingStock({ ...editingStock, destinacao: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Operacional">Operacional</option>
                    <option value="Treinamento / Instrução">Treinamento</option>
                    <option value="SAT">SAT</option>
                    <option value="Reserva Estratégica">Reserva</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Quantidade <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingStock.quantity}
                    onChange={(e) => setEditingStock({
                      ...editingStock,
                      quantity: Math.max(0, parseInt(e.target.value) || 0)
                    })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-amber-500"
                    required
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-500 font-mono">unidades</span>
                </div>
              </div>

              {/* Informações adicionais */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Informações adicionais
                </label>
                <textarea
                  value={editingStock.additionalInfo}
                  onChange={(e) => setEditingStock({ ...editingStock, additionalInfo: e.target.value })}
                  placeholder="Descreva informações adicionais, observações técnicas ou referências do lote..."
                  maxLength={500}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {editingStock.additionalInfo.length}/500 caracteres
                  </span>
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStock(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-amber-400/10"
                >
                  {isSavingStock ? (
                    <span>Salvando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Entrada / Saída Direta no Cofre */}
      {quickVaultMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              quickVaultMovement.type === 'Entrada'
                ? 'bg-emerald-950/40 border-emerald-800/60'
                : 'bg-amber-950/40 border-amber-800/60'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl border ${
                  quickVaultMovement.type === 'Entrada'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {quickVaultMovement.type === 'Entrada' ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {quickVaultMovement.type === 'Entrada' ? 'Entrada Direta no Cofre' : 'Saída Direta do Cofre'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {calibers.find(c => c.id === quickVaultMovement.stock.caliberId)?.name} &bull; Cofre {vaultSpaces.find(v => v.id === quickVaultMovement.stock.vaultSpaceId)?.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickVaultMovement(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-2">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Estoque Atual no Cofre:</span>
                <span className="text-sm font-mono font-bold text-slate-200">
                  {quickVaultMovement.stock.quantity} unidades
                </span>
              </div>
            </div>

            {/* Inserindo apenas quantidade e o policial responsável */}
            <form onSubmit={handleSaveQuickMovement} className="p-6 pt-2 space-y-4">
              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Quantidade a {quickVaultMovement.type === 'Entrada' ? 'Entrar' : 'Sair'} <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={quickVaultMovement.type === 'Saída' ? quickVaultMovement.stock.quantity : undefined}
                    step="1"
                    value={quickVaultMovement.quantity}
                    onChange={(e) => setQuickVaultMovement({
                      ...quickVaultMovement,
                      quantity: Math.max(1, parseInt(e.target.value) || 1)
                    })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-500 font-mono">unidades</span>
                </div>
                {quickVaultMovement.type === 'Saída' && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Disponível no cofre: {quickVaultMovement.stock.quantity} un.
                  </p>
                )}
              </div>

              {/* Policial Responsável pela Movimentação */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Policial Responsável pela Movimentação <span className="text-amber-400">*</span>
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setQuickVaultMovement({ ...quickVaultMovement, responsibleType: 'SISTEMA' })}
                      className={`px-1.5 py-0.5 rounded ${quickVaultMovement.responsibleType === 'SISTEMA' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Cadastrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickVaultMovement({ ...quickVaultMovement, responsibleType: 'FORA_DO_SISTEMA' })}
                      className={`px-1.5 py-0.5 rounded ${quickVaultMovement.responsibleType === 'FORA_DO_SISTEMA' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Outro
                    </button>
                  </div>
                </div>

                {quickVaultMovement.responsibleType === 'SISTEMA' ? (
                  <select
                    value={quickVaultMovement.responsibleUserId}
                    onChange={(e) => {
                      const uid = e.target.value;
                      const activeUsers = users.length > 0 ? users : storage.getUsers();
                      const foundUser = activeUsers.find(u => u.id === uid);
                      setQuickVaultMovement({
                        ...quickVaultMovement,
                        responsibleUserId: uid,
                        responsibleName: foundUser?.name || '',
                        responsibleMasp: foundUser?.masp || ''
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  >
                    <option value="">Selecione o policial responsável...</option>
                    {(users.length > 0 ? users : storage.getUsers()).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (MASP: {u.masp}) - {u.cargo}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome do Policial"
                      value={quickVaultMovement.responsibleName}
                      onChange={(e) => setQuickVaultMovement({ ...quickVaultMovement, responsibleName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="MASP"
                      value={quickVaultMovement.responsibleMasp}
                      onChange={(e) => setQuickVaultMovement({ ...quickVaultMovement, responsibleMasp: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setQuickVaultMovement(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuickMovement}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow-md ${
                    quickVaultMovement.type === 'Entrada'
                      ? 'text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-emerald-400/10'
                      : 'text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-amber-400/10'
                  }`}
                >
                  {isSubmittingQuickMovement ? (
                    <span>Processando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar {quickVaultMovement.type}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Histórico de Movimentações do Cofre (inicia oculto e só mostra detalhes se selecionado) */}
      {vaultHistoryStock && (() => {
        const vault = vaultSpaces.find(v => v.id === vaultHistoryStock.vaultSpaceId);
        const unit = units.find(u => u.id === vaultHistoryStock.unitId);
        const dept = departments.find(d => d.id === vaultHistoryStock.departmentId);
        const cal = calibers.find(c => c.id === vaultHistoryStock.caliberId);

        const filteredHistoryMovs = movements.filter(m => {
          const isSameVault = m.vaultSpaceId === vaultHistoryStock.vaultSpaceId;
          if (historyFilterCaliber) {
            return isSameVault && m.caliberId === vaultHistoryStock.caliberId;
          }
          return isSameVault;
        });

        const totalEntradas = filteredHistoryMovs
          .filter(m => m.type === 'Entrada')
          .reduce((sum, m) => sum + m.quantity, 0);

        const totalSaidas = filteredHistoryMovs
          .filter(m => m.type === 'Saída')
          .reduce((sum, m) => sum + m.quantity, 0);

        const totalDevolvido = filteredHistoryMovs
          .reduce((sum, m) => sum + (m.returnedQuantity || 0), 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              
              {/* Header */}
              <div className="px-6 py-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-100">
                        Histórico de Movimentações do Cofre
                      </h3>
                      <span className="text-xs font-mono font-bold bg-slate-950 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
                        Cofre: {vault?.code || 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {unit?.name ? `${unit.name} • ` : ''}{dept?.name || ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePrintVaultHistoryReport(vaultHistoryStock, filteredHistoryMovs)}
                    className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm"
                    title="Imprimir Relatório Completo deste Cofre"
                  >
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Imprimir Relatório</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVaultHistoryStock(null);
                      setSelectedHistoryMovId(null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Sub-header Summary & Filter Controls */}
              <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                {/* Filter toggle */}
                <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryFilterCaliber(true)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      historyFilterCaliber
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Calibre {cal?.name || ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilterCaliber(false)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      !historyFilterCaliber
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todas as Munições do Cofre
                  </button>
                </div>

                {/* Counters */}
                <div className="flex items-center space-x-2 text-xs font-mono">
                  <span className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
                    Total: <strong className="text-white">{filteredHistoryMovs.length}</strong> reg.
                  </span>
                  <span className="bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg text-emerald-400">
                    +{totalEntradas} un
                  </span>
                  <span className="bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg text-amber-400">
                    -{totalSaidas} un
                  </span>
                  {totalDevolvido > 0 && (
                    <span className="bg-blue-950/60 border border-blue-800/60 px-2.5 py-1 rounded-lg text-blue-400">
                      ↩ {totalDevolvido} dev.
                    </span>
                  )}
                </div>
              </div>

              {/* Notice that details start hidden and are only shown when selected */}
              <div className="px-6 py-2 bg-slate-900/60 border-b border-slate-800/50 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
                <span>Clique em qualquer movimentação da lista para ver os detalhes completos.</span>
                {selectedHistoryMovId && (
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryMovId(null)}
                    className="text-amber-400 hover:underline font-medium text-[11px]"
                  >
                    Ocultar detalhes abertos
                  </button>
                )}
              </div>

              {/* Movement List */}
              <div className="p-6 overflow-y-auto space-y-2.5 flex-1">
                {filteredHistoryMovs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma movimentação registrada para este cofre.</p>
                  </div>
                ) : (
                  filteredHistoryMovs.map((m) => {
                    const mCal = calibers.find(c => c.id === m.caliberId);
                    const isSelected = selectedHistoryMovId === m.id;
                    const isEntrada = m.type === 'Entrada';

                    return (
                      <div
                        key={m.id}
                        className={`border rounded-xl transition duration-150 overflow-hidden ${
                          isSelected
                            ? 'bg-slate-950 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                            : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700 hover:bg-slate-950'
                        }`}
                      >
                        {/* Clickable Header Row */}
                        <div
                          onClick={() => setSelectedHistoryMovId(isSelected ? null : m.id)}
                          className="p-3.5 flex items-center justify-between cursor-pointer select-none space-x-3"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            {/* Type Icon */}
                            <div className={`p-1.5 rounded-lg border shrink-0 ${
                              isEntrada
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              {isEntrada ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>

                            {/* Main Info */}
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  isEntrada
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                }`}>
                                  {m.type}
                                </span>
                                <span className="font-mono font-bold text-slate-200 text-xs">
                                  {mCal ? mCal.name : m.caliberId}
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {formatTimestamp(m.createdAt)}
                                </span>
                              </div>

                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                Responsável: <strong className="text-slate-200">{m.responsibleName || m.recipientOrReason || 'Não informado'}</strong>
                                {m.responsibleMasp && <span className="font-mono text-slate-400"> ({m.responsibleMasp})</span>}
                              </p>
                            </div>
                          </div>

                          {/* Quantity & Chevron */}
                          <div className="flex items-center space-x-3 shrink-0">
                            <span className={`text-sm font-mono font-black ${
                              isEntrada ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                              {isEntrada ? `+${m.quantity}` : `-${m.quantity}`} un
                            </span>

                            <div className="text-slate-400 p-1 rounded-md hover:bg-slate-800 transition">
                              {isSelected ? (
                                <ChevronUp className="w-4 h-4 text-amber-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expandable Details - Inicia oculto e só mostra se for selecionado */}
                        {isSelected && (
                          <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-900/60 space-y-3 animate-fadeIn text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {/* Motivo / Destino */}
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Motivo / Destino
                                </span>
                                <p className="font-medium text-slate-200 mt-0.5">
                                  {m.recipientOrReason || '-'}
                                </p>
                              </div>

                              {/* Policial Responsável */}
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Policial Responsável
                                </span>
                                <p className="font-medium text-slate-200 mt-0.5">
                                  {m.responsibleName || '-'}
                                </p>
                                {m.responsibleMasp && (
                                  <span className="text-[10px] text-slate-400 font-mono block">
                                    MASP: {m.responsibleMasp} {m.responsibleType === 'FORA_DO_SISTEMA' ? '(Outro Órgão)' : ''}
                                  </span>
                                )}
                              </div>

                              {/* Armeiro / Operador */}
                              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Armeiro / Operador
                                </span>
                                <p className="font-medium text-slate-200 mt-0.5">
                                  {m.userName || 'Sistema'}
                                </p>
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  ID: #{m.id}
                                </span>
                              </div>
                            </div>

                            {/* Informações Adicionais */}
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                                Informações Adicionais
                              </span>
                              <p className="text-amber-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                                {m.observation?.trim() ? m.observation.trim() : <span className="text-slate-500 italic font-sans text-xs">Nenhuma informação adicional informada.</span>}
                              </p>
                            </div>

                            {/* Devolução de munição não utilizada se houver */}
                            {Boolean(m.returnedQuantity && m.returnedQuantity > 0) && (
                              <div className="bg-blue-950/40 p-2.5 rounded-xl border border-blue-800/60 flex items-center justify-between text-blue-300">
                                <div className="flex items-center space-x-2">
                                  <RotateCcw className="w-4 h-4 text-blue-400 shrink-0" />
                                  <span>
                                    <strong>{m.returnedQuantity} un</strong> devolvidas em {m.returnedAt ? formatTimestamp(m.returnedAt) : ''}
                                    {m.returnedByUserName ? ` por ${m.returnedByUserName}` : ''}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Ação individual para imprimir recibo desta movimentação */}
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => handlePrintDirectReceipt(m)}
                                className="flex items-center space-x-1.5 text-xs font-bold text-slate-300 hover:text-amber-400 bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg transition"
                                title="Imprimir comprovante desta movimentação"
                              >
                                <Printer className="w-3.5 h-3.5 text-amber-400" />
                                <span>Imprimir Comprovante Individual</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-slate-800/80 border-t border-slate-700 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-400">
                  {filteredHistoryMovs.length} registro(s) encontrado(s) no cofre {vault?.code || ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setVaultHistoryStock(null);
                    setSelectedHistoryMovId(null);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition"
                >
                  Fechar
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Modal Transferência de Munições entre Unidades */}
      {showTransferModal && (
        <ModalTransferirMunicao
          initialStock={transferTargetStock}
          stocks={stocks}
          calibers={calibers}
          departments={departments}
          units={units}
          vaultSpaces={vaultSpaces}
          currentUser={currentUser}
          onClose={() => {
            setShowTransferModal(false);
            setTransferTargetStock(null);
          }}
          onTransferSuccess={(transfer) => {
            setSuccessMsg(`Transferência de munições registrada com sucesso (Guia nº ${transfer.id}). Aguardando confirmação do armeiro de destino.`);
            onRefresh();
          }}
        />
      )}

      {/* Modal Histórico de Transferências de Munições */}
      {showTransferHistoryModal && (
        <ModalHistoricoTransferenciasMunicao
          transfers={storage.getAmmoTransfers(currentUser, filterUnitId || undefined)}
          currentUser={currentUser}
          selectedUnitId={filterUnitId}
          onClose={() => setShowTransferHistoryModal(false)}
          onOpenNewTransfer={() => {
            setTransferTargetStock(null);
            setShowTransferModal(true);
          }}
          onRefresh={onRefresh}
        />
      )}

      {/* Modal de Seleção de Lote para Edição */}
      {lotSelectionForEdit && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <span>Selecione o Lote de Munição para Editar</span>
              </h3>
              <button
                type="button"
                onClick={() => setLotSelectionForEdit(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Este cofre possui mais de um lote cadastrado. Escolha qual registro deseja alterar:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {lotSelectionForEdit.stocks.map((s) => {
                const c = calibers.find(cal => cal.id === s.caliberId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => lotSelectionForEdit.onSelect(s)}
                    className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500 hover:bg-slate-900/90 transition flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition">
                        {c?.name || s.caliberId} • {s.fabricante || 'Fabricante'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Lote: <strong className="text-amber-300 font-bold">{s.loteMunicao || 'S/L'}</strong> • Ano: {s.anoFabricacao || 'N/A'} • Tipo: {s.tipoMunicao || 'Padrão'}
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800/60">
                      {s.quantity} un.
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setLotSelectionForEdit(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Cofres para Impressão */}
      {showPrintVaultSelectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Imprimir Relatório de Cofres de Munições</h3>
                  <p className="text-xs text-slate-400">
                    Selecione quais cofres de munições deseja imprimir. Cada cofre será gerado em página separada no mesmo comando.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintVaultSelectModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between py-1 px-1 shrink-0">
              <span className="text-xs text-slate-400 font-mono">
                {candidateAmmoVaults.length} cofre(s) de munições encontrado(s)
              </span>
              <div className="flex items-center space-x-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedVaultIdsForReport(candidateAmmoVaults.map(v => v.id))}
                  className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs"
                >
                  Selecionar Todos
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedVaultIdsForReport([])}
                  className="text-slate-400 hover:text-slate-200 font-semibold underline text-xs"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[50vh]">
              {candidateAmmoVaults.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic bg-slate-950/50 rounded-xl border border-slate-800">
                  Nenhum cofre de munições encontrado para a unidade ou departamento selecionado.
                </div>
              ) : (
                candidateAmmoVaults.map(v => {
                  const isChecked = selectedVaultIdsForReport.includes(v.id);
                  const vUnit = units.find(u => u.id === v.unitId);
                  const vStocks = stocks.filter(s => s.vaultSpaceId === v.id);
                  const vTotalQty = vStocks.reduce((sum, s) => sum + s.quantity, 0);

                  return (
                    <label
                      key={v.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition select-none ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedVaultIdsForReport(prev => [...prev, v.id]);
                            } else {
                              setSelectedVaultIdsForReport(prev => prev.filter(id => id !== v.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500 bg-slate-900"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-sm text-slate-100">{v.code}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                              COFRE PARA MUNIÇÕES
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            Unidade: {vUnit ? vUnit.name : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-xs font-bold text-amber-400">
                          {vTotalQty.toLocaleString('pt-BR')} un.
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {vStocks.length} lote(s)
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-800 pt-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowPrintVaultSelectModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={selectedVaultIdsForReport.length === 0}
                onClick={() => {
                  setShowPrintVaultSelectModal(false);
                  handlePrintUnitAmmoReport(selectedVaultIdsForReport);
                }}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow transition flex items-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Cofres Selecionados ({selectedVaultIdsForReport.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetAmmo}
        title="Confirmar Exclusão"
        message={`Deseja realmente apagar permanentemente ${deleteTargetAmmo?.label || 'este item'} do sistema?`}
        onConfirm={confirmExecuteDeleteAmmo}
        onCancel={() => setDeleteTargetAmmo(null)}
      />

    </div>
  );
};
