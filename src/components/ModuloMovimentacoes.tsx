import React, { useState, useMemo } from 'react';
import { User, Movement, Weapon, VaultSpace, Course, WeaponTransfer, AmmoTransfer, ExplosivoTransfer, MaterialTransfer, VaultSpaceType } from '../types';
import { formatTimestamp } from '../utils/masks';
import { storage } from '../services/storage';
import {
  ArrowRightLeft,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ArrowDownLeft,
  Trash2,
  Printer,
  Building2,
  Disc,
  Crosshair,
  X,
  Loader2,
  Check,
  Eye,
  Plus,
  Shield,
  Layers,
  FileText,
  Clock,
  Sparkles,
  Flame,
  Package
} from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';
import { MovementReceiptModal } from './ModalReciboMovimentacao';

interface MovementModuleProps {
  currentUser: User;
  movements: Movement[];
  weapons: Weapon[];
  vaultSpaces: VaultSpace[];
  courses: Course[];
  onRefresh: () => void;
}

export interface UnifiedPendingTransferRow {
  id: string;
  category: 'Arma' | 'Munição' | 'Explosivo' | 'Material';
  protocolNumber?: string;
  originDepartmentId?: string;
  originDepartmentName: string;
  originUnitId?: string;
  originUnitName: string;
  destinationDepartmentId?: string;
  destinationUnitId?: string;
  destinationArmorerId?: string;
  destinationArmorerName?: string;
  transferredByUserId: string;
  transferredByUserName: string;
  transferredByUserMasp: string;
  receiverOrTransporterName: string;
  receiverOrTransporterMasp: string;
  receiverOrTransporterCargo?: string;
  date: string;
  reason: string;
  summaryText: string;
  badgeBg: string;
  badgeText: string;
  raw: WeaponTransfer | AmmoTransfer | ExplosivoTransfer | MaterialTransfer;
}

export const MovementModule: React.FC<MovementModuleProps> = ({
  currentUser,
  movements,
  weapons,
  vaultSpaces,
  courses: _courses,
  onRefresh
}) => {
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

  // Return Form
  const [returnVaultId, setReturnVaultId] = useState('');
  const [returningAmmoCount, setReturningAmmoCount] = useState(50);
  const [returningMagCount, setReturningMagCount] = useState(3);
  const [divergenceJustification, setDivergenceJustification] = useState('');
  const [confirmDivergence, setConfirmDivergence] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetMov, setDeleteTargetMov] = useState<Movement | null>(null);
  const [receiptTargetMov, setReceiptTargetMov] = useState<Movement | null>(null);

  const effectiveRole = currentUser.activeRole || currentUser.role;
  const isGeral = effectiveRole === 'Geral';
  const isArmeiro = effectiveRole === 'Armeiro';
  const isAdmin = effectiveRole === 'Administrador';
  const isPolicial = effectiveRole === 'Policial';

  // Pending transfers across the 4 categories
  const pendingWeaponTransfers = storage.getPendingIncomingTransfers(currentUser);
  const pendingAmmoTransfers = storage.getPendingIncomingAmmoTransfers(currentUser);
  const pendingExplosivoTransfers = storage.getPendingIncomingExplosivoTransfers(currentUser);
  const pendingMaterialTransfers = storage.getPendingIncomingMaterialTransfers(currentUser);

  // Unified list of pending transfers for the receiving panel
  const unifiedPendingTransfers: UnifiedPendingTransferRow[] = useMemo(() => {
    const list: UnifiedPendingTransferRow[] = [];

    // 1. Armas
    for (const wt of pendingWeaponTransfers) {
      list.push({
        id: wt.id,
        category: 'Arma',
        protocolNumber: wt.protocolNumber || `TRF-ARM-${wt.id.slice(-6)}`,
        originDepartmentId: wt.originDepartmentId,
        originDepartmentName: wt.originDepartmentName || 'Departamento de Origem',
        originUnitId: wt.originUnitId,
        originUnitName: wt.originUnitName || 'Unidade de Origem',
        destinationDepartmentId: wt.destinationDepartmentId,
        destinationUnitId: wt.destinationUnitId,
        destinationArmorerId: wt.destinationArmorerId,
        destinationArmorerName: wt.destinationArmorerName,
        transferredByUserId: wt.transferredByUserId,
        transferredByUserName: wt.transferredByUserName || 'Armeiro Remetente',
        transferredByUserMasp: wt.transferredByUserMasp || 'N/A',
        receiverOrTransporterName: wt.receiverOrTransporterName || 'Armeiro Destinatário',
        receiverOrTransporterMasp: wt.receiverOrTransporterMasp || 'N/A',
        receiverOrTransporterCargo: wt.receiverOrTransporterCargo,
        date: wt.transferDate || wt.createdAt,
        reason: wt.reason || 'Transferência de carga bélica',
        summaryText: `${wt.weapons?.length || 0} arma(s)`,
        badgeBg: 'bg-amber-500/10 border-amber-500/30',
        badgeText: 'text-amber-400',
        raw: wt
      });
    }

    // 2. Munições
    for (const at of pendingAmmoTransfers) {
      const totalQtd = at.items?.reduce((s, i) => s + (i.quantity || 0), 0) || at.totalQuantity || 0;
      list.push({
        id: at.id,
        category: 'Munição',
        protocolNumber: at.protocolNumber || `TRF-MUN-${at.id.slice(-6)}`,
        originDepartmentId: at.originDepartmentId,
        originDepartmentName: at.originDepartmentName || 'Departamento de Origem',
        originUnitId: at.originUnitId,
        originUnitName: at.originUnitName || 'Unidade de Origem',
        destinationDepartmentId: at.destinationDepartmentId,
        destinationUnitId: at.destinationUnitId,
        destinationArmorerId: at.destinationArmorerId,
        destinationArmorerName: at.destinationArmorerName,
        transferredByUserId: at.transferredByUserId,
        transferredByUserName: at.transferredByUserName || 'Armeiro Remetente',
        transferredByUserMasp: at.transferredByUserMasp || 'N/A',
        receiverOrTransporterName: at.receiverOrTransporterName || 'Armeiro Destinatário',
        receiverOrTransporterMasp: at.receiverOrTransporterMasp || 'N/A',
        receiverOrTransporterCargo: at.receiverOrTransporterCargo,
        date: at.transferDate || at.createdAt,
        reason: at.reason || 'Transferência de munições',
        summaryText: `${totalQtd} un. (${at.items?.length || 0} lote(s))`,
        badgeBg: 'bg-emerald-500/10 border-emerald-500/30',
        badgeText: 'text-emerald-400',
        raw: at
      });
    }

    // 3. Explosivos
    for (const et of pendingExplosivoTransfers) {
      list.push({
        id: et.id,
        category: 'Explosivo',
        protocolNumber: et.protocolNumber || `TRF-EXP-${et.id.slice(-6)}`,
        originDepartmentId: et.originDepartmentId,
        originDepartmentName: et.originDepartmentName || 'Departamento de Origem',
        originUnitId: et.originUnitId,
        originUnitName: et.originUnitName || 'Unidade de Origem',
        destinationDepartmentId: et.destinationDepartmentId,
        destinationUnitId: et.destinationUnitId,
        destinationArmorerId: et.destinationArmorerId,
        destinationArmorerName: et.destinationArmorerName,
        transferredByUserId: et.transferredByUserId,
        transferredByUserName: et.transferredByUserName || 'Armeiro Remetente',
        transferredByUserMasp: et.transferredByUserMasp || 'N/A',
        receiverOrTransporterName: et.receiverOrTransporterName || 'Armeiro Destinatário',
        receiverOrTransporterMasp: et.receiverOrTransporterMasp || 'N/A',
        receiverOrTransporterCargo: et.receiverOrTransporterCargo,
        date: et.transferDate || et.createdAt,
        reason: et.reason || 'Transferência de material explosivo',
        summaryText: `${et.quantidade} ${et.unidadeMedida} (${et.nomeExplosivo})`,
        badgeBg: 'bg-red-500/10 border-red-500/30',
        badgeText: 'text-red-400',
        raw: et
      });
    }

    // 4. Materiais
    for (const mt of pendingMaterialTransfers) {
      list.push({
        id: mt.id,
        category: 'Material',
        protocolNumber: mt.protocolNumber || `TRF-MAT-${mt.id.slice(-6)}`,
        originDepartmentId: mt.originDepartmentId,
        originDepartmentName: mt.originDepartmentName || 'Departamento de Origem',
        originUnitId: mt.originUnitId,
        originUnitName: mt.originUnitName || 'Unidade de Origem',
        destinationDepartmentId: mt.destinationDepartmentId,
        destinationUnitId: mt.destinationUnitId,
        destinationArmorerId: mt.destinationArmorerId,
        destinationArmorerName: mt.destinationArmorerName,
        transferredByUserId: mt.transferredByUserId,
        transferredByUserName: mt.transferredByUserName || 'Armeiro Remetente',
        transferredByUserMasp: mt.transferredByUserMasp || 'N/A',
        receiverOrTransporterName: mt.receiverOrTransporterName || 'Armeiro Destinatário',
        receiverOrTransporterMasp: mt.receiverOrTransporterMasp || 'N/A',
        receiverOrTransporterCargo: mt.receiverOrTransporterCargo,
        date: mt.transferDate || mt.createdAt,
        reason: mt.reason || 'Transferência de material',
        summaryText: `${mt.quantidade} un. (${mt.nomeMaterial})`,
        badgeBg: 'bg-purple-500/10 border-purple-500/30',
        badgeText: 'text-purple-400',
        raw: mt
      });
    }

    return list;
  }, [pendingWeaponTransfers, pendingAmmoTransfers, pendingExplosivoTransfers, pendingMaterialTransfers]);

  // Transfer Details Modal State
  const [selectedTransferForDetails, setSelectedTransferForDetails] = useState<UnifiedPendingTransferRow | null>(null);
  const [destVaultChoiceId, setDestVaultChoiceId] = useState<string>('');
  const [destObservation, setDestObservation] = useState<string>('');
  const [isReceivingTransfer, setIsReceivingTransfer] = useState<boolean>(false);

  // Inline "Criar Novo Local no Cofre" State
  const [showInlineCreateVault, setShowInlineCreateVault] = useState<boolean>(false);
  const [newVaultCode, setNewVaultCode] = useState<string>('');
  const [newVaultType, setNewVaultType] = useState<VaultSpaceType>('ARMAS');
  const [isCreatingVault, setIsCreatingVault] = useState<boolean>(false);

  // Helper to open details modal
  const handleOpenTransferDetails = (row: UnifiedPendingTransferRow) => {
    setSelectedTransferForDetails(row);
    setDestObservation('');
    setShowInlineCreateVault(false);
    setNewVaultCode('');

    // Determine target vault space type
    let expectedType: VaultSpaceType = 'ARMAS';
    if (row.category === 'Munição') expectedType = 'MUNIÇÕES';
    else if (row.category === 'Explosivo') expectedType = 'EXPLOSIVOS';
    else if (row.category === 'Material') expectedType = 'MATERIAIS';
    setNewVaultType(expectedType);

    // Find compatible vaults for destination unit
    const destUnitId = row.destinationUnitId || currentUser.unitId;
    const compatibleVaults = vaultSpaces.filter(v => {
      const unitMatch = isGeral ? true : v.unitId === destUnitId;
      if (!unitMatch) return false;
      if (row.category === 'Arma') return v.type === 'ARMAS';
      if (row.category === 'Munição') return v.type === 'MUNIÇÕES';
      if (row.category === 'Explosivo') return v.type === 'EXPLOSIVOS';
      if (row.category === 'Material') return v.type === 'MATERIAIS' || v.type === 'ARMAS';
      return true;
    });

    setDestVaultChoiceId(compatibleVaults[0]?.id || '');
  };

  // Create new vault space inline
  const handleCreateNewVaultSpaceInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVaultCode.trim() || !selectedTransferForDetails) return;

    setIsCreatingVault(true);
    try {
      const targetUnitId = selectedTransferForDetails.destinationUnitId || currentUser.unitId || '';
      const targetDeptId = selectedTransferForDetails.destinationDepartmentId || currentUser.departmentId || '';

      const created = await storage.addVaultSpace({
        code: newVaultCode.trim().toUpperCase(),
        type: newVaultType,
        unitId: targetUnitId,
        departmentId: targetDeptId
      });

      setDestVaultChoiceId(created.id);
      setShowInlineCreateVault(false);
      setNewVaultCode('');
      setSuccessMsg(`Novo local no cofre "${created.code}" criado e selecionado com sucesso!`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar local no cofre.');
    } finally {
      setIsCreatingVault(false);
    }
  };

  // Confirm receipt and print official receipt
  const handleConfirmReceiveTransfer = async () => {
    if (!selectedTransferForDetails) return;
    if (!destVaultChoiceId) {
      setErrorMsg('Selecione ou crie um local no cofre da sua unidade para armazenar o item.');
      return;
    }

    setIsReceivingTransfer(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const row = selectedTransferForDetails;
      const chosenVault = vaultSpaces.find(v => v.id === destVaultChoiceId);
      const vaultCode = chosenVault ? chosenVault.code : 'Cofre da Unidade';

      if (row.category === 'Arma') {
        await storage.receiveWeaponTransfer(row.id, destVaultChoiceId, destObservation);
      } else if (row.category === 'Munição') {
        await storage.receiveAmmoTransfer(row.id, destVaultChoiceId, destObservation);
      } else if (row.category === 'Explosivo') {
        await storage.receiveExplosivoTransfer(row.id, destVaultChoiceId, destObservation);
      } else if (row.category === 'Material') {
        await storage.receiveMaterialTransfer(row.id, destVaultChoiceId, destObservation);
      }

      setSuccessMsg(`Recibo da transferência de ${row.category} (${row.summaryText}) confirmado com sucesso! Item alocado no cofre ${vaultCode}.`);

      // Print official receipt immediately
      printOfficialTransferReceipt(row, vaultCode, currentUser, destObservation);

      setSelectedTransferForDetails(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao confirmar recibo da transferência.');
    } finally {
      setIsReceivingTransfer(false);
    }
  };

  // Direct Print PDF function for Movement Receipt
  const handleDirectPrintMovement = (mov: Movement) => {
    const withdrawalVault = vaultSpaces.find(v => v.id === mov.withdrawalVaultSpaceId);
    const returnVault = vaultSpaces.find(v => v.id === mov.returnVaultSpaceId);

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Cautela - ${mov.weaponSerialNumber} - PCMG</title>
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
            <div class="subtitle">SISTEMA DE ARMARIA • TERMO DE MOVIMENTAÇÃO DE CARGA</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${mov.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>STATUS:</strong> ${(mov.status || 'FINALIZADO').toUpperCase()}</div>
          <div><strong>Data:</strong> ${formatTimestamp(mov.createdAt)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados do Policial (Cautelante)</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Nome Completo:</span> <span class="val">${mov.requesterName}</span></div>
            <div class="field"><span class="label">MASP:</span> <span class="val">${mov.requesterMasp}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Especificação do Armamento e Munição</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Tipo / Modelo:</span> <span class="val">${mov.weaponType} ${mov.weaponModel}</span></div>
            <div class="field"><span class="label">Nº de Série:</span> <span class="val">${mov.weaponSerialNumber}</span></div>
            <div class="field"><span class="label">Calibre:</span> <span class="val">${mov.caliber}</span></div>
            <div class="field"><span class="label">Munição Cautelada:</span> <span class="val">${mov.ammunitionCount} un</span></div>
            <div class="field"><span class="label">Carregadores:</span> <span class="val">${mov.magazineCount} un</span></div>
            <div class="field"><span class="label">Cofre Retirada:</span> <span class="val">${withdrawalVault?.code || 'Cofre Principal'}</span></div>
            ${returnVault ? `<div class="field"><span class="label">Cofre Devolução:</span> <span class="val">${returnVault.code}</span></div>` : ''}
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">3. Auditoria e Armeiros Responsáveis</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Armeiro Aprovador:</span> <span class="val">${mov.approvedByUserName || 'Pendente'}</span></div>
            <div class="field"><span class="label">Confirmado Por (Devolução):</span> <span class="val">${mov.receiptConfirmedByUserName || 'Não Devolvido'}</span></div>
          </div>
          ${mov.divergenceJustification ? `<div class="field" style="margin-top: 6px;"><span class="label">Justificativa de Divergência:</span> <span class="val" style="font-weight: normal; color: #b91c1c;">${mov.divergenceJustification}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${mov.requesterName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Cautelante (MASP: ${mov.requesterMasp})</span>
          </div>
          <div class="sig-line">
            ${mov.receiptConfirmedByUserName || mov.approvedByUserName || 'Armeiro Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro da Unidade</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado eletronicamente pelo Sistema de Armeria da Polícia Civil em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  const canApproveOrConfirm = isGeral || isArmeiro || isAdmin || (isPolicial && currentUser.canMoveWeapons);

  // Approve Withdrawal
  const handleApprove = async (mov: Movement) => {
    try {
      await storage.approveWithdrawal(mov.id);
      setSuccessMsg(`Retirada da arma ${mov.weaponModel} (${mov.weaponSerialNumber}) aprovada com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao aprovar retirada.');
    }
  };

  const handleDeleteMovement = (mov: Movement) => {
    setDeleteTargetMov(mov);
  };

  const confirmExecuteDeleteMovement = async () => {
    if (!deleteTargetMov) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await storage.deleteMovement(deleteTargetMov.id);
      setSuccessMsg(`Registro de movimentação da arma ${deleteTargetMov.weaponModel} (${deleteTargetMov.weaponSerialNumber}) excluído com sucesso.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir movimentação.');
    } finally {
      setDeleteTargetMov(null);
    }
  };

  // Open Return Modal
  const handleOpenReturnModal = (mov: Movement) => {
    setErrorMsg('');
    setSelectedMovement(mov);

    const availableArmasVaults = vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === mov.unitId);
    const prevVault = availableArmasVaults.find(v => v.id === mov.withdrawalVaultSpaceId);
    setReturnVaultId(prevVault ? prevVault.id : (availableArmasVaults[0]?.id || ''));

    setReturningAmmoCount(mov.ammunitionCount);
    setReturningMagCount(mov.magazineCount);
    setDivergenceJustification('');
    setConfirmDivergence(false);
    setShowReturnModal(true);
  };

  // Submit Return Request
  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedMovement) return;

    const ammoDivergent = returningAmmoCount !== selectedMovement.ammunitionCount;
    const magDivergent = returningMagCount !== selectedMovement.magazineCount;

    if (ammoDivergent || magDivergent) {
      if (!confirmDivergence) {
        setErrorMsg('Há divergência na quantidade devolvida. Marque a caixa de confirmação e apresente a justificativa.');
        return;
      }
      if (!divergenceJustification.trim()) {
        setErrorMsg('Por favor, digite a justificativa para a divergência na devolução.');
        return;
      }
    }

    try {
      await storage.requestReturn({
        movementId: selectedMovement.id,
        returnVaultSpaceId: returnVaultId,
        returningAmmunitionCount: returningAmmoCount,
        returningMagazineCount: returningMagCount,
        divergenceJustification
      });

      setSuccessMsg('Solicitação de devolução encaminhada com sucesso. Aguardando confirmação de recibo no cofre.');
      setShowReturnModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao solicitar devolução.');
    }
  };

  // Confirm Receipt
  const handleConfirmReceipt = async (mov: Movement) => {
    try {
      await storage.confirmReceipt(mov.id);
      setSuccessMsg(`Recibo da devolução da arma ${mov.weaponModel} (${mov.weaponSerialNumber}) confirmado.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao confirmar recibo.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner - Note: 'Solicitar Retirada de Arma' button removed as requested */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Movimentações e Transferências</h1>
            <p className="text-xs text-slate-400">
              Painel de recebimento de transferências entre unidades e gestão do fluxo de custódia e armaria
            </p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-3.5 rounded-xl flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3.5 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAINEL GERAL DE RECEBIMENTO DE TRANSFERÊNCIAS DE OUTRAS UNIDADES */}
      {/* Colunas: Item da Transferência | Depto Origem | Unidade Origem | Armeiro Resp. | Ação */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 bg-slate-800/60 border-b border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>Recebimento de Transferências de Outras Unidades</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                  unifiedPendingTransfers.length > 0
                    ? 'bg-amber-500 text-slate-950 animate-pulse'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {unifiedPendingTransfers.length} Pendente(s)
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Itens despachados para a sua unidade aguardando conferência, alocação no cofre e recibo oficial
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-3 px-4">Item da Transferência</th>
                <th className="py-3 px-4">Departamento de Origem</th>
                <th className="py-3 px-4">Unidade de Origem</th>
                <th className="py-3 px-4">Armeiro Responsável pela Transferência</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {unifiedPendingTransfers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 italic bg-slate-950/30">
                    Nenhuma transferência de arma, munição, explosivo ou material pendente de recebimento para a sua unidade.
                  </td>
                </tr>
              ) : (
                unifiedPendingTransfers.map((trf) => (
                  <tr key={trf.id} className="hover:bg-slate-800/50 transition">
                    
                    {/* 1. Item da Transferência (simplificado com badge e detalhes) */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2.5">
                        <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center space-x-1.5 ${trf.badgeBg} ${trf.badgeText}`}>
                          {trf.category === 'Arma' && <Crosshair className="w-3.5 h-3.5" />}
                          {trf.category === 'Munição' && <Disc className="w-3.5 h-3.5" />}
                          {trf.category === 'Explosivo' && <Flame className="w-3.5 h-3.5" />}
                          {trf.category === 'Material' && <Package className="w-3.5 h-3.5" />}
                          <span>{trf.category}</span>
                        </span>
                        <div className="text-xs">
                          <span className="font-semibold text-slate-200">{trf.summaryText}</span>
                          <span className="block text-[10px] font-mono text-slate-500">Guia #{trf.protocolNumber || trf.id.slice(-6)}</span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Departamento de Origem */}
                    <td className="py-3.5 px-4 font-medium text-slate-300">
                      {trf.originDepartmentName}
                    </td>

                    {/* 3. Unidade de Origem */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-100">{trf.originUnitName}</div>
                      <div className="text-[10px] text-slate-500">{formatTimestamp(trf.date)}</div>
                    </td>

                    {/* 4. Armeiro Responsável pela Transferência */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{trf.transferredByUserName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">MASP: {trf.transferredByUserMasp}</div>
                    </td>

                    {/* 5. Ação: Botão "Demonstrar Detalhes" */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenTransferDetails(trf)}
                        className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition inline-flex items-center space-x-1.5 shadow-md shadow-sky-900/40 hover:scale-[1.02]"
                        title="Ver especificações técnicas completas, conferir e dar recibo"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Demonstrar Detalhes</span>
                      </button>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAINEL GERAL DE MOVIMENTAÇÕES DE CARGA / CAUTELAS LOCAIS */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Histórico de Movimentações Locais da Unidade</h2>
          <span className="text-xs bg-slate-800 text-amber-400 px-2.5 py-1 rounded-full font-mono font-bold">
            Total: {movements.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-3 px-4">Data Solicitação</th>
                <th className="py-3 px-4">Policial / MASP</th>
                <th className="py-3 px-4">Arma / Série</th>
                <th className="py-3 px-4">Munição / Carregadores</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Aprovador / Responsável</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                    Nenhuma movimentação de arma registrada.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isRequester = currentUser.id === m.requesterId;

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/50 transition">
                      
                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {formatTimestamp(m.createdAt)}
                      </td>

                      {/* Requester */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-100">{m.requesterName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">MASP: {m.requesterMasp}</div>
                      </td>

                      {/* Weapon */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200">{m.weaponType} {m.weaponModel}</div>
                        <div className="text-[10px] font-mono text-amber-400">Série: {m.weaponSerialNumber}</div>
                      </td>

                      {/* Ammo & Mag */}
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div>{m.ammunitionCount} un (Cal. {m.caliber})</div>
                        <div className="text-[10px] text-slate-400">{m.magazineCount} carregadores</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded font-bold text-[10px] border inline-block ${
                            m.status === 'Pendente Aprovação'
                              ? 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse'
                              : m.status === 'Em Trânsito'
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                              : m.status === 'Pendente Recibo'
                              ? 'bg-purple-950 text-purple-300 border-purple-800'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>

                      {/* Approved By */}
                      <td className="py-3 px-4 text-slate-300">
                        {m.approvedByUserName ? (
                          <div>
                            <span className="font-semibold">{m.approvedByUserName}</span>
                            {m.approvalDate && <p className="text-[10px] text-slate-500 font-mono">{formatTimestamp(m.approvalDate)}</p>}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Pendente</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          
                          {/* Approve Withdrawal */}
                          {m.status === 'Pendente Aprovação' && canApproveOrConfirm && (
                            <button
                              onClick={() => handleApprove(m)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow"
                            >
                              Aprovar
                            </button>
                          )}

                          {/* Request Return (Available if Em Trânsito) */}
                          {m.status === 'Em Trânsito' && (isRequester || canApproveOrConfirm) && (
                            <button
                              onClick={() => handleOpenReturnModal(m)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] px-3 py-1.5 rounded-lg shadow"
                            >
                              Devolver
                            </button>
                          )}

                          {/* Confirm Receipt (Available if Pendente Recibo) */}
                          {m.status === 'Pendente Recibo' && canApproveOrConfirm && (
                            <button
                              onClick={() => handleConfirmReceipt(m)}
                              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg shadow"
                            >
                              Confirmar Recibo
                            </button>
                          )}

                          {/* Print Receipt Button */}
                          <button
                            onClick={() => handleDirectPrintMovement(m)}
                            className="bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-bold text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center space-x-1 shadow transition"
                            title="Gerar/Imprimir Recibo da Movimentação"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Recibo</span>
                          </button>

                          {/* Delete Movement (Armeiro, Administrador, Geral) */}
                          {canApproveOrConfirm && (
                            <button
                              onClick={() => handleDeleteMovement(m)}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                              title="Excluir Registro de Movimentação"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

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

      {/* ========================================================================= */}
      {/* MODAL "DEMONSTRAR DETALHES DA TRANSFERÊNCIA" (CONFERIR, COFRE E RECIBO) */}
      {/* ========================================================================= */}
      {selectedTransferForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl border ${selectedTransferForDetails.badgeBg} ${selectedTransferForDetails.badgeText}`}>
                  {selectedTransferForDetails.category === 'Arma' && <Crosshair className="w-5 h-5" />}
                  {selectedTransferForDetails.category === 'Munição' && <Disc className="w-5 h-5" />}
                  {selectedTransferForDetails.category === 'Explosivo' && <Flame className="w-5 h-5" />}
                  {selectedTransferForDetails.category === 'Material' && <Package className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                    <span>Detalhes da Transferência de {selectedTransferForDetails.category}</span>
                    <span className="text-[11px] font-mono text-sky-400 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded-lg">
                      Guia #{selectedTransferForDetails.protocolNumber || selectedTransferForDetails.id}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Confira as especificações técnicas herdadas da unidade de origem e selecione o cofre
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransferForDetails(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">

              {/* Informações de Despacho e Origem */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Origem:</span>
                  <div className="font-bold text-slate-100 text-sm">{selectedTransferForDetails.originUnitName}</div>
                  <div className="text-slate-400 text-[11px]">{selectedTransferForDetails.originDepartmentName}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Armeiro Remetente:</span>
                  <div className="font-bold text-slate-100">{selectedTransferForDetails.transferredByUserName}</div>
                  <div className="text-slate-400 font-mono text-[11px]">MASP: {selectedTransferForDetails.transferredByUserMasp}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Policial Transportador:</span>
                  <div className="font-semibold text-slate-200">{selectedTransferForDetails.receiverOrTransporterName}</div>
                  <div className="text-slate-400 font-mono text-[11px]">MASP: {selectedTransferForDetails.receiverOrTransporterMasp}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Motivo / Justificativa:</span>
                  <div className="text-slate-200 italic">{selectedTransferForDetails.reason}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Data: {formatTimestamp(selectedTransferForDetails.date)}</div>
                </div>
              </div>

              {/* Especificações Técnicas Completas do Item */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Especificações Técnicas Completas do Item ({selectedTransferForDetails.category})</span>
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">{selectedTransferForDetails.summaryText}</span>
                </div>

                {/* Casos por Categoria: ARMA */}
                {selectedTransferForDetails.category === 'Arma' && (() => {
                  const wt = selectedTransferForDetails.raw as WeaponTransfer;
                  return (
                    <div className="overflow-x-auto border border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs bg-slate-950/50">
                        <thead className="bg-slate-800/60 text-slate-400 text-[10px] uppercase font-mono">
                          <tr>
                            <th className="py-2.5 px-3">Nº Série</th>
                            <th className="py-2.5 px-3">Modelo / Tipo</th>
                            <th className="py-2.5 px-3">Fabricante</th>
                            <th className="py-2.5 px-3">Calibre</th>
                            <th className="py-2.5 px-3 text-center">Carregadores</th>
                            <th className="py-2.5 px-3">Cofre Origem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {wt.weapons?.map((w, i) => (
                            <tr key={i} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-bold text-amber-400">{w.serialNumber}</td>
                              <td className="py-2 px-3 text-slate-200 font-sans">{w.type} - {w.model}</td>
                              <td className="py-2 px-3 text-slate-300 font-sans">{w.manufacturer}</td>
                              <td className="py-2 px-3 text-slate-300">{w.caliber}</td>
                              <td className="py-2 px-3 text-center text-slate-200 font-bold">{w.magazineQuantity}</td>
                              <td className="py-2 px-3 text-slate-400">{w.originVaultCode || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Casos por Categoria: MUNIÇÃO */}
                {selectedTransferForDetails.category === 'Munição' && (() => {
                  const at = selectedTransferForDetails.raw as AmmoTransfer;
                  return (
                    <div className="overflow-x-auto border border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs bg-slate-950/50">
                        <thead className="bg-slate-800/60 text-slate-400 text-[10px] uppercase font-mono">
                          <tr>
                            <th className="py-2.5 px-3">Fabricante</th>
                            <th className="py-2.5 px-3">Calibre</th>
                            <th className="py-2.5 px-3">Tipo / Peso</th>
                            <th className="py-2.5 px-3">Lote / Ano</th>
                            <th className="py-2.5 px-3">Destinação</th>
                            <th className="py-2.5 px-3 text-center">Quantidade</th>
                            <th className="py-2.5 px-3">Cofre Origem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {at.items?.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-bold text-slate-200">{item.fabricante || 'CBC'}</td>
                              <td className="py-2 px-3 font-bold text-emerald-400 font-mono">{item.caliberName}</td>
                              <td className="py-2 px-3 text-slate-300">{item.tipoMunicao || 'Padrão'} {item.pesoMunicao ? `• ${item.pesoMunicao}` : ''}</td>
                              <td className="py-2 px-3 font-mono text-slate-300">{item.loteMunicao || 'S/L'} ({item.anoFabricacao || '-'})</td>
                              <td className="py-2 px-3 text-slate-400">{item.destinacao || 'Abastecimento'}</td>
                              <td className="py-2 px-3 text-center font-bold text-emerald-400 font-mono text-sm">{item.quantity} un.</td>
                              <td className="py-2 px-3 font-mono text-slate-400">{item.originVaultCode || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Casos por Categoria: EXPLOSIVO */}
                {selectedTransferForDetails.category === 'Explosivo' && (() => {
                  const et = selectedTransferForDetails.raw as ExplosivoTransfer;
                  return (
                    <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Explosivo:</span>
                        <strong className="text-slate-100 text-sm font-sans">{et.nomeExplosivo}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Quantidade:</span>
                        <strong className="text-red-400 text-sm">{et.quantidade} {et.unidadeMedida}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Lote:</span>
                        <strong className="text-slate-200">{et.lote || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Tipo / Subtipo:</span>
                        <strong className="text-slate-300 font-sans">{et.tipoNome || 'Explosivo'} {et.subtipoNome ? `(${et.subtipoNome})` : ''}</strong>
                      </div>
                    </div>
                  );
                })()}

                {/* Casos por Categoria: MATERIAL */}
                {selectedTransferForDetails.category === 'Material' && (() => {
                  const mt = selectedTransferForDetails.raw as MaterialTransfer;
                  return (
                    <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Material:</span>
                        <strong className="text-slate-100 text-sm font-sans">{mt.nomeMaterial}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Quantidade:</span>
                        <strong className="text-purple-400 text-sm">{mt.quantidade} un.</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Categoria / Tipo:</span>
                        <strong className="text-slate-300 font-sans">{mt.tipoNome || 'Equipamentos'}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Nº Série / Patrimônio:</span>
                        <strong className="text-slate-200">{mt.numeroSerie || 'Sem número'}</strong>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Seção de Seleção e Criação do Cofre na Unidade de Destino */}
              <div className="p-4 bg-sky-950/30 border border-sky-800/60 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-sky-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <span>Local no Cofre de Destino (Sua Unidade) *</span>
                  </label>

                  {/* Botão "Criar Novo Local no Cofre" */}
                  <button
                    type="button"
                    onClick={() => setShowInlineCreateVault(!showInlineCreateVault)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] px-3 py-1.5 rounded-lg transition inline-flex items-center space-x-1 shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Criar Novo Local no Cofre</span>
                  </button>
                </div>

                {/* Inline Form to Create Vault if needed */}
                {showInlineCreateVault && (
                  <form onSubmit={handleCreateNewVaultSpaceInline} className="p-3 bg-slate-900 border border-amber-500/40 rounded-xl space-y-2 animate-fadeIn">
                    <div className="text-[11px] font-bold text-amber-300 flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Adicionar Novo Local no Cofre da Unidade</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Identificação / Código do Cofre:</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: ARM-02, MUN-03, PAIOL-01, MAT-01"
                          value={newVaultCode}
                          onChange={(e) => setNewVaultCode(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-amber-400 uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Tipo de Cofre:</label>
                        <select
                          value={newVaultType}
                          onChange={(e) => setNewVaultType(e.target.value as VaultSpaceType)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400"
                        >
                          <option value="ARMAS">Cofre de Armas</option>
                          <option value="MUNIÇÕES">Cofre de Munições</option>
                          <option value="EXPLOSIVOS">Paiol de Explosivos</option>
                          <option value="MATERIAIS">Armário de Materiais</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowInlineCreateVault(false)}
                        className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingVault || !newVaultCode.trim()}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs px-3.5 py-1 rounded-lg transition"
                      >
                        {isCreatingVault ? 'Criando...' : 'Salvar Local no Cofre'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Vault Selection Selectlist */}
                <div>
                  <select
                    value={destVaultChoiceId}
                    onChange={(e) => setDestVaultChoiceId(e.target.value)}
                    className="w-full bg-slate-950 border border-sky-500/60 rounded-xl px-3.5 py-2.5 text-xs text-sky-200 font-mono font-bold outline-none focus:border-sky-400"
                    required
                  >
                    <option value="">Selecione o local no cofre para armazenar o item...</option>
                    {vaultSpaces
                      .filter(v => {
                        const targetUnit = selectedTransferForDetails.destinationUnitId || currentUser.unitId;
                        const unitMatch = isGeral ? true : v.unitId === targetUnit;
                        if (!unitMatch) return false;
                        if (selectedTransferForDetails.category === 'Arma') return v.type === 'ARMAS';
                        if (selectedTransferForDetails.category === 'Munição') return v.type === 'MUNIÇÕES';
                        if (selectedTransferForDetails.category === 'Explosivo') return v.type === 'EXPLOSIVOS';
                        if (selectedTransferForDetails.category === 'Material') return v.type === 'MATERIAIS' || v.type === 'ARMAS';
                        return true;
                      })
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.code} - Cofre para {v.type} ({v.unitId === currentUser.unitId ? 'Sua Unidade' : 'Unidade Destino'})
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ao confirmar, o item será alocado neste local e todas as características técnicas permanecerão inalteradas.
                  </p>
                </div>

                {/* Observações do Armeiro Recebedor */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Observação do Recebimento (Opcional):
                  </label>
                  <input
                    type="text"
                    value={destObservation}
                    onChange={(e) => setDestObservation(e.target.value)}
                    placeholder="Ex: Itens conferidos visualmente e recebidos em perfeito estado operacional..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400"
                  />
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-800/80 border-t border-slate-700 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSelectedTransferForDetails(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
              >
                Voltar
              </button>

              <button
                type="button"
                disabled={!destVaultChoiceId || isReceivingTransfer}
                onClick={handleConfirmReceiveTransfer}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center space-x-2 shadow-lg shadow-emerald-900/40"
              >
                {isReceivingTransfer ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gravando Recibo e Alocando...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Confirmar Recibo e Alocar no Cofre</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Return Request Modal */}
      {showReturnModal && selectedMovement && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl my-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-2 pb-2 border-b border-slate-800 flex items-center space-x-2">
              <ArrowDownLeft className="w-5 h-5 text-amber-400" />
              <span>Solicitação de Devolução de Arma</span>
            </h3>

            <p className="text-xs text-slate-400 mb-4">
              Devolução da arma <strong className="text-amber-400 font-mono">{selectedMovement.weaponModel} ({selectedMovement.weaponSerialNumber})</strong>
            </p>

            <form onSubmit={handleSaveReturn} className="space-y-4">
              
              {/* Vault Location Suggestion */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Localização no Cofre para Guarda
                </label>
                <select
                  value={returnVaultId}
                  onChange={(e) => setReturnVaultId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                >
                  {vaultSpaces.filter(v => v.type === 'ARMAS' && v.unitId === selectedMovement.unitId).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} (Cofre da Unidade)
                    </option>
                  ))}
                </select>
              </div>

              {/* Returning Ammo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade de Munições Devolvidas (Sugestão: {selectedMovement.ammunitionCount})
                </label>
                <input
                  type="number"
                  min="0"
                  value={returningAmmoCount}
                  onChange={(e) => setReturningAmmoCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              {/* Returning Magazines */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade de Carregadores Devolvidos (Sugestão: {selectedMovement.magazineCount})
                </label>
                <input
                  type="number"
                  min="0"
                  value={returningMagCount}
                  onChange={(e) => setReturningMagCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
              </div>

              {/* Divergence Check */}
              {(returningAmmoCount !== selectedMovement.ammunitionCount || returningMagCount !== selectedMovement.magazineCount) && (
                <div className="bg-amber-950/40 border border-amber-800/80 p-3 rounded-xl space-y-3">
                  <div className="flex items-start space-x-2 text-amber-200 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>Divergência detectada em relação à quantidade retirada. Informe o motivo.</span>
                  </div>

                  <label className="flex items-center space-x-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmDivergence}
                      onChange={(e) => setConfirmDivergence(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500"
                    />
                    <span>Confirmo a alteração da quantidade devolvida</span>
                  </label>

                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 uppercase mb-1">
                      Justificativa Obrigatória da Divergência:
                    </label>
                    <textarea
                      value={divergenceJustification}
                      onChange={(e) => setDivergenceJustification(e.target.value)}
                      placeholder="Ex: Munições deflagradas em serviço / treinamento..."
                      rows={2}
                      className="w-full bg-slate-950 border border-amber-800 rounded-xl p-2.5 text-xs text-slate-100"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetMov}
        title="Excluir Movimentação Definitivamente"
        message={`Deseja realmente apagar permanentemente este registro de movimentação da arma ${deleteTargetMov?.weaponModel} (${deleteTargetMov?.weaponSerialNumber})?`}
        onConfirm={confirmExecuteDeleteMovement}
        onCancel={() => setDeleteTargetMov(null)}
      />

      {/* Movement Printable Receipt Modal */}
      {receiptTargetMov && (
        <MovementReceiptModal
          movement={receiptTargetMov}
          weapon={weapons.find(w => w.id === receiptTargetMov.weaponId)}
          vaultSpaces={vaultSpaces}
          onClose={() => setReceiptTargetMov(null)}
        />
      )}

    </div>
  );
};

// =========================================================================
// FUNÇÃO OFICIAL DE IMPRESSÃO DO TERMO DE TRANSFERÊNCIA RECEBIDA
// =========================================================================
function printOfficialTransferReceipt(
  trf: UnifiedPendingTransferRow,
  destVaultCode: string,
  currentUser: User,
  observation?: string
) {
  let itemsRowsHtml = '';

  if (trf.category === 'Arma') {
    const wt = trf.raw as WeaponTransfer;
    itemsRowsHtml = (wt.weapons || []).map((w, idx) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="padding: 6px; font-weight: bold; font-family: monospace;">${w.serialNumber}</td>
        <td style="padding: 6px;">${w.type} - ${w.model}</td>
        <td style="padding: 6px;">${w.manufacturer}</td>
        <td style="padding: 6px; font-family: monospace;">${w.caliber}</td>
        <td style="padding: 6px; text-align: center;">${w.magazineQuantity}</td>
        <td style="padding: 6px; text-align: center; font-family: monospace;">${destVaultCode}</td>
      </tr>
    `).join('');
  } else if (trf.category === 'Munição') {
    const at = trf.raw as AmmoTransfer;
    itemsRowsHtml = (at.items || []).map((it, idx) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="padding: 6px; font-weight: bold;">${it.fabricante || 'CBC'}</td>
        <td style="padding: 6px; font-weight: bold; font-family: monospace;">${it.caliberName}</td>
        <td style="padding: 6px;">${it.tipoMunicao || 'Padrão'} ${it.pesoMunicao ? `(${it.pesoMunicao})` : ''}</td>
        <td style="padding: 6px; font-family: monospace;">${it.loteMunicao || 'S/L'} - ${it.anoFabricacao || '-'}</td>
        <td style="padding: 6px; text-align: center; font-weight: bold; font-family: monospace;">${it.quantity} un.</td>
        <td style="padding: 6px; text-align: center; font-family: monospace;">${destVaultCode}</td>
      </tr>
    `).join('');
  } else if (trf.category === 'Explosivo') {
    const et = trf.raw as ExplosivoTransfer;
    itemsRowsHtml = `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 6px; text-align: center; font-weight: bold;">1</td>
        <td style="padding: 6px; font-weight: bold;">${et.nomeExplosivo}</td>
        <td style="padding: 6px;">${et.tipoNome || 'Explosivo'} ${et.subtipoNome ? `(${et.subtipoNome})` : ''}</td>
        <td style="padding: 6px; font-family: monospace;">Lote: ${et.lote || 'N/A'}</td>
        <td style="padding: 6px; text-align: center; font-weight: bold; font-family: monospace;">${et.quantidade} ${et.unidadeMedida}</td>
        <td style="padding: 6px; text-align: center; font-family: monospace;">${destVaultCode}</td>
      </tr>
    `;
  } else if (trf.category === 'Material') {
    const mt = trf.raw as MaterialTransfer;
    itemsRowsHtml = `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 6px; text-align: center; font-weight: bold;">1</td>
        <td style="padding: 6px; font-weight: bold;">${mt.nomeMaterial}</td>
        <td style="padding: 6px;">${mt.tipoNome || 'Equipamentos'}</td>
        <td style="padding: 6px; font-family: monospace;">Série: ${mt.numeroSerie || 'Sem número'}</td>
        <td style="padding: 6px; text-align: center; font-weight: bold; font-family: monospace;">${mt.quantidade} un.</td>
        <td style="padding: 6px; text-align: center; font-family: monospace;">${destVaultCode}</td>
      </tr>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Termo de Recebimento de Transferência - ${trf.protocolNumber || trf.id} - PCMG</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #111827;
          background: #fff;
          margin: 0;
          padding: 16px;
          font-size: 11px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .title {
          font-size: 15px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000;
        }
        .subtitle {
          font-size: 11px;
          font-weight: 700;
          color: #374151;
          margin-top: 2px;
        }
        .reg-id {
          font-family: monospace;
          font-size: 11px;
          font-weight: bold;
          text-align: right;
        }
        .status-bar {
          background: #f0fdf4;
          border: 1px solid #10b981;
          padding: 8px 12px;
          border-radius: 6px;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          font-family: monospace;
          font-size: 11px;
          color: #065f46;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .box {
          border: 1px solid #9ca3af;
          border-radius: 6px;
          padding: 10px 12px;
        }
        .box-title {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          margin-bottom: 6px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 3px;
          color: #111827;
        }
        .field {
          margin-bottom: 4px;
        }
        .label {
          font-size: 9px;
          font-weight: bold;
          color: #4b5563;
          text-transform: uppercase;
          display: block;
        }
        .val {
          font-size: 11px;
          font-weight: bold;
          color: #000;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
          font-size: 10px;
        }
        th {
          background: #f3f4f6;
          border-bottom: 2px solid #000;
          padding: 6px;
          text-align: left;
          font-size: 9px;
          text-transform: uppercase;
          color: #374151;
        }
        .signatures {
          margin-top: 40px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          text-align: center;
          font-size: 10px;
        }
        .sig-line {
          border-top: 1px solid #000;
          padding-top: 6px;
          font-weight: bold;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 8px;
          color: #6b7280;
          font-family: monospace;
          border-top: 1px solid #e5e7eb;
          padding-top: 8px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</div>
          <div class="subtitle">SISTEMA DE ARMARIA E LOGÍSTICA BÉLICA • TERMO OFICIAL DE TRANSFERÊNCIA E RECEBIMENTO</div>
        </div>
        <div class="reg-id">
          GUIA OFICIAL<br>
          <span style="font-size: 13px; font-weight: 900;">${trf.protocolNumber || trf.id}</span>
        </div>
      </div>

      <div class="status-bar">
        <div><strong>SITUAÇÃO:</strong> TRANSFERÊNCIA CONCLUÍDA E RECEBIDA NO COFRE</div>
        <div><strong>DATA DE RECEBIMENTO:</strong> ${new Date().toLocaleString('pt-BR')}</div>
      </div>

      <div class="grid">
        <div class="box">
          <div class="box-title">1. UNIDADE DE ORIGEM (REMETENTE)</div>
          <div class="field"><span class="label">Departamento:</span> <span class="val">${trf.originDepartmentName}</span></div>
          <div class="field"><span class="label">Unidade Policial:</span> <span class="val">${trf.originUnitName}</span></div>
          <div class="field"><span class="label">Armeiro Responsável (Envio):</span> <span class="val">${trf.transferredByUserName} (MASP: ${trf.transferredByUserMasp})</span></div>
          <div class="field"><span class="label">Motivo da Transferência:</span> <span class="val" style="font-weight: normal;">${trf.reason}</span></div>
        </div>

        <div class="box">
          <div class="box-title">2. UNIDADE DE DESTINO (RECEPTORA)</div>
          <div class="field"><span class="label">Unidade Policial:</span> <span class="val">${(currentUser as any).unitName || 'Unidade Receptora'}</span></div>
          <div class="field"><span class="label">Armeiro Recebedor:</span> <span class="val">${currentUser.name} (MASP: ${currentUser.masp})</span></div>
          <div class="field"><span class="label">Local Alocado no Cofre:</span> <span class="val" style="color: #065f46; font-family: monospace;">${destVaultCode}</span></div>
          <div class="field"><span class="label">Policial Transportador:</span> <span class="val">${trf.receiverOrTransporterName} (MASP: ${trf.receiverOrTransporterMasp})</span></div>
        </div>
      </div>

      <div class="box" style="margin-bottom: 12px;">
        <div class="box-title">3. ESPECIFICAÇÃO DOS ITENS TRANSFERIDOS (${trf.category.toUpperCase()})</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25px; text-align: center;">#</th>
              <th>Identificação / Fabricante</th>
              <th>Tipo / Modelo / Calibre</th>
              <th>Detalhes / Lote</th>
              <th style="text-align: center;">Qtd</th>
              <th style="text-align: center;">Cofre Destino</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>
      </div>

      ${observation ? `
        <div class="box" style="margin-bottom: 12px;">
          <div class="box-title">4. OBSERVAÇÕES DO RECEBIMENTO</div>
          <p style="margin: 0; font-size: 10px; color: #374151;">${observation}</p>
        </div>
      ` : ''}

      <div class="signatures">
        <div class="sig-line">
          ${trf.receiverOrTransporterName}<br>
          <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Responsável pelo Transporte (MASP: ${trf.receiverOrTransporterMasp})</span>
        </div>
        <div class="sig-line">
          ${currentUser.name}<br>
          <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Receptor da Unidade (MASP: ${currentUser.masp})</span>
        </div>
      </div>

      <div class="footer">
        Termo de recebimento lavrado e assinado eletronicamente no Sistema de Gestão de Armaria - PCMG em ${new Date().toLocaleString('pt-BR')}.
      </div>
    </body>
    </html>
  `;

  printDocumentInPage(html);
}
