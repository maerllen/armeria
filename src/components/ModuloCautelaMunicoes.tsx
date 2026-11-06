import React, { useState, useMemo } from 'react';
import { 
  User, CautelaMunicao, AmmunitionStock, Caliber, VaultSpace, Unit, Department 
} from '../types';
import { storage } from '../services/storage';
import { 
  Disc, Check, Clock, Search, Printer, 
  CheckCircle2, XCircle, FileText, RotateCcw, 
  AlertCircle, AlertTriangle, Shield, Layers, Plus
} from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface ModuloCautelaMunicoesProps {
  currentUser: User;
  ammoStocks: AmmunitionStock[];
  calibers: Caliber[];
  vaultSpaces: VaultSpace[];
  units: Unit[];
  departments: Department[];
  onRefresh: () => void;
}

export const ModuloCautelaMunicoes: React.FC<ModuloCautelaMunicoesProps> = ({
  currentUser,
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

  // Tabs
  const [activeTab, setActiveTab] = useState<'MINHAS' | 'PENDENTES' | 'TODAS' | 'NOVA'>(
    isArmeiroOrAdmin ? 'PENDENTES' : 'MINHAS'
  );

  // Redireciona usuário Policial caso tente acessar tabs restritas de armeiro
  React.useEffect(() => {
    if (isPolicial && (activeTab === 'PENDENTES' || activeTab === 'TODAS')) {
      setActiveTab('MINHAS');
    }
  }, [isPolicial, activeTab]);

  const [lastDirectCautelaMun, setLastDirectCautelaMun] = useState<CautelaMunicao | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLVIDA' | 'CONSUMIDA' | 'RECUSADA'>('TODOS');

  // Form de Solicitação
  const [selectedStockId, setSelectedStockId] = useState('');
  const [quantity, setQuantity] = useState<number>(30);
  const [tipoMunicao, setTipoMunicao] = useState('Operacional');
  const [loteMunicao, setLoteMunicao] = useState('');
  const [reason, setReason] = useState('Serviço Policial Operacional / Plantão');
  const [seraDevolvida, setSeraDevolvida] = useState(true);

  // Armorer Direct Cautela State
  const [isDirectCautela, setIsDirectCautela] = useState(false);
  const [targetOfficerId, setTargetOfficerId] = useState('');

  // Available officers in unit
  const availableUnitOfficers = useMemo(() => {
    const allUsers = storage.getUsers();
    return allUsers.filter(u => (isGeral ? true : u.unitId === currentUser.unitId) && u.hasSystemAccess !== false);
  }, [currentUser, isGeral]);

  // Modal de Devolução
  const [returningCautela, setReturningCautela] = useState<CautelaMunicao | null>(null);
  const [returnedQty, setReturnedQty] = useState<number>(0);
  const [returnObs, setReturnObs] = useState('');

  const [notesModal, setNotesModal] = useState<{ id: string; action: 'RECUSAR' } | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lista de todas as cautelas de munição
  const allCautelas = storage.getCautelasMunicoes();

  // Escopo de visibilidade
  const scopedCautelas = useMemo(() => {
    let list = allCautelas;
    if (isPolicial) {
      list = list.filter(c => c.requesterId === currentUser.id || c.requesterMasp === currentUser.masp);
    } else if (isArmeiro) {
      if (currentUser.managementScope !== 'department') {
        list = list.filter(c => c.unitId === currentUser.unitId || c.requesterId === currentUser.id);
      }
    }

    if (statusFilter !== 'TODOS') {
      list = list.filter(c => c.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.caliberName.toLowerCase().includes(term) ||
        c.requesterName.toLowerCase().includes(term) ||
        c.requesterMasp.toLowerCase().includes(term) ||
        (c.reason && c.reason.toLowerCase().includes(term)) ||
        (c.loteMunicao && c.loteMunicao.toLowerCase().includes(term))
      );
    }

    return list;
  }, [allCautelas, currentUser, isArmeiro, isPolicial, statusFilter, searchTerm]);

  // Lista a exibir com base na aba selecionada (PENDENTES mostra estritamente pendentes)
  const displayedCautelas = useMemo(() => {
    if (activeTab === 'PENDENTES') {
      return scopedCautelas.filter(c => c.status === 'PENDENTE');
    }
    return scopedCautelas;
  }, [activeTab, scopedCautelas]);

  // Contadores
  const pendingCount = useMemo(() => {
    if (currentUser.role === 'Policial') {
      return allCautelas.filter(c => c.requesterId === currentUser.id && c.status === 'PENDENTE').length;
    }
    if (isArmeiro && currentUser.managementScope !== 'department') {
      return allCautelas.filter(c => c.unitId === currentUser.unitId && c.status === 'PENDENTE').length;
    }
    return allCautelas.filter(c => c.status === 'PENDENTE').length;
  }, [allCautelas, currentUser, isArmeiro]);

  const myActiveCount = useMemo(() => {
    return allCautelas.filter(c => c.requesterId === currentUser.id && c.status === 'AUTORIZADA').length;
  }, [allCautelas, currentUser.id]);

  // Cofre selecionado e estoques filtrados
  const [selectedVaultId, setSelectedVaultId] = useState('');

  // Munições disponíveis na unidade do usuário
  const availableUnitStocks = useMemo(() => {
    const userUnitId = currentUser.unitId;
    return ammoStocks
      .filter(st => {
        const matchUnit = isGeral ? true : (st.unitId === userUnitId);
        return matchUnit && st.quantity > 0;
      })
      .map(st => {
        const cal = calibers.find(c => c.id === st.caliberId);
        const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
        return {
          ...st,
          caliberName: cal ? cal.name : 'Calibre Padrão',
          vaultCode: vault ? vault.code : 'Cofre'
        };
      });
  }, [ammoStocks, calibers, vaultSpaces, currentUser.unitId, isGeral]);

  // Cofres da unidade que possuem munições em estoque
  const availableUnitVaultsWithAmmo = useMemo(() => {
    const vaultIds = new Set(availableUnitStocks.map(s => s.vaultSpaceId).filter(Boolean));
    const targetUnitId = currentUser.unitId;
    return vaultSpaces.filter(v => 
      (isGeral ? true : v.unitId === targetUnitId) &&
      (vaultIds.has(v.id) || v.type === 'MUNIÇÕES')
    );
  }, [availableUnitStocks, vaultSpaces, currentUser.unitId, isGeral]);

  // Sincroniza cofre padrão
  React.useEffect(() => {
    if (availableUnitVaultsWithAmmo.length > 0 && !selectedVaultId) {
      setSelectedVaultId(availableUnitVaultsWithAmmo[0].id);
    }
  }, [availableUnitVaultsWithAmmo, selectedVaultId]);

  // Lotes de munição no cofre selecionado (ou todos os lotes da unidade se não filtrado)
  const stocksInSelectedVault = useMemo(() => {
    if (!selectedVaultId) return availableUnitStocks;
    const inVault = availableUnitStocks.filter(s => s.vaultSpaceId === selectedVaultId);
    return inVault.length > 0 ? inVault : availableUnitStocks;
  }, [availableUnitStocks, selectedVaultId]);

  // Sincroniza lote selecionado quando o cofre muda
  React.useEffect(() => {
    if (stocksInSelectedVault.length > 0) {
      const exists = stocksInSelectedVault.find(s => s.id === selectedStockId);
      if (!exists) {
        const first = stocksInSelectedVault[0];
        setSelectedStockId(first.id);
        if (first.tipoMunicao) setTipoMunicao(first.tipoMunicao);
        if (first.loteMunicao) setLoteMunicao(first.loteMunicao);
        setQuantity(Math.min(30, first.quantity));
      }
    } else {
      setSelectedStockId('');
    }
  }, [stocksInSelectedVault, selectedStockId]);

  // Estoque selecionado para o formulário
  const selectedStock = useMemo(() => {
    return availableUnitStocks.find(s => s.id === selectedStockId);
  }, [availableUnitStocks, selectedStockId]);

  // Submeter solicitação
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedStockId || !selectedStock) {
      setErrorMsg('Selecione um estoque de munição disponível na unidade.');
      return;
    }

    const qty = parseInt(String(quantity), 10);
    if (qty <= 0 || qty > selectedStock.quantity) {
      setErrorMsg(`Quantidade inválida. Máximo disponível no cofre: ${selectedStock.quantity} unidades.`);
      return;
    }

    const beneficiary = (canAuthorize && isDirectCautela && targetOfficerId)
      ? (availableUnitOfficers.find(u => u.id === targetOfficerId) || currentUser)
      : currentUser;

    setIsSubmitting(true);
    try {
      const isDirect = Boolean(canAuthorize && isDirectCautela);
      const payload: any = {
        caliberId: selectedStock.caliberId,
        caliberName: selectedStock.caliberName,
        quantity: qty,
        tipoMunicao: tipoMunicao || selectedStock.tipoMunicao || 'Operacional',
        loteMunicao: loteMunicao || selectedStock.loteMunicao || 'Padrão',
        fabricante: selectedStock.fabricante,
        pesoMunicao: selectedStock.pesoMunicao,
        anoFabricacao: selectedStock.anoFabricacao,
        destinacao: selectedStock.destinacao,
        vaultSpaceId: selectedStock.vaultSpaceId,
        departmentId: selectedStock.departmentId || beneficiary.departmentId || currentUser.departmentId,
        unitId: selectedStock.unitId || beneficiary.unitId || currentUser.unitId,
        requesterId: beneficiary.id,
        requesterName: beneficiary.name,
        requesterMasp: beneficiary.masp,
        requesterCargo: beneficiary.cargo,
        reason: reason.trim(),
        seraDevolvida,
        directAuthorized: isDirect,
        status: isDirect ? 'AUTORIZADA' : 'PENDENTE',
        armorerId: isDirect ? currentUser.id : undefined,
        armorerName: isDirect ? currentUser.name : undefined,
        armorerMasp: isDirect ? currentUser.masp : undefined
      };

      const res = await storage.requestCautelaMunicao(payload);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao solicitar cautela de munições.');
      } else {
        if (isDirect) {
          const newCautelaObj: CautelaMunicao = {
            id: res.id || `caut-mun-${Date.now()}`,
            caliberId: selectedStock.caliberId,
            caliberName: selectedStock.caliberName,
            quantity: qty,
            tipoMunicao: tipoMunicao || selectedStock.tipoMunicao || 'Operacional',
            loteMunicao: loteMunicao || selectedStock.loteMunicao || 'Padrão',
            fabricante: selectedStock.fabricante,
            pesoMunicao: selectedStock.pesoMunicao,
            anoFabricacao: selectedStock.anoFabricacao,
            destinacao: selectedStock.destinacao,
            vaultSpaceId: selectedStock.vaultSpaceId,
            departmentId: selectedStock.departmentId || beneficiary.departmentId || currentUser.departmentId,
            unitId: selectedStock.unitId || beneficiary.unitId || currentUser.unitId,
            requesterId: beneficiary.id,
            requesterName: beneficiary.name,
            requesterMasp: beneficiary.masp,
            requesterCargo: beneficiary.cargo,
            reason: reason.trim(),
            status: 'AUTORIZADA',
            requestDate: new Date().toISOString(),
            authorizedAt: new Date().toISOString(),
            seraDevolvida,
            armorerId: currentUser.id,
            armorerName: currentUser.name,
            armorerMasp: currentUser.masp,
            createdAt: new Date().toISOString()
          };
          setLastDirectCautelaMun(newCautelaObj);
          setSuccessMsg(`Cautela de ${qty} munições calibre ${selectedStock.caliberName} autorizada diretamente para o policial ${beneficiary.name}! O saldo foi deduzido do cofre e o recibo de cautela gerado imediatamente.`);
          setTimeout(() => {
            handlePrintRecibo(newCautelaObj);
          }, 150);
          setActiveTab('TODAS');
        } else {
          setSuccessMsg(`Solicitação de ${qty} munições calibre ${selectedStock.caliberName} enviada ao armeiro da unidade com sucesso!`);
          setActiveTab('MINHAS');
        }
        setSelectedStockId('');
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autorizar Cautela (Armeiro)
  const handleAuthorize = async (id: string, vaultSpaceId?: string) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await storage.authorizeCautelaMunicao(id, vaultSpaceId);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar retirada de munição.');
      } else {
        setSuccessMsg('Cautela de munição autorizada! A quantidade foi deduzida do cofre correspondente e o recibo está disponível.');
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao autorizar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recusar Cautela (Armeiro)
  const handleReject = async (id: string, notes?: string) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await storage.rejectCautelaMunicao(id, notes);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao recusar solicitação.');
      } else {
        setSuccessMsg('Solicitação de cautela de munição recusada.');
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

  // Abrir Modal de Devolução
  const handleOpenReturnModal = (cautela: CautelaMunicao) => {
    setReturningCautela(cautela);
    setReturnedQty(cautela.quantity);
    setReturnObs('');
  };

  // Confirmar devolução de munição não deflagrada
  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningCautela) return;

    const ret = parseInt(String(returnedQty || 0), 10);
    if (ret < 0 || ret > returningCautela.quantity) {
      setErrorMsg(`Quantidade de devolução inválida (máximo ${returningCautela.quantity} unidades).`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await storage.returnCautelaMunicao(returningCautela.id, {
        returnedQuantity: ret,
        observations: returnObs.trim()
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar devolução.');
      } else {
        setSuccessMsg(
          ret > 0 
            ? `Devolução de ${ret} munições confirmada! As unidades retornaram ao estoque do cofre.`
            : `Registro concluído: todas as ${returningCautela.quantity} munições foram dadas como consumidas em serviço.`
        );
        setReturningCautela(null);
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar devolução.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Impressão do Recibo / Termo de Cautela de Munições
  const handlePrintRecibo = (cautela: CautelaMunicao) => {
    const unitObj = units.find(u => u.id === cautela.unitId);
    const deptObj = departments.find(d => d.id === cautela.departmentId);
    const vaultObj = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #111; line-height: 1.5;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">POLÍCIA CIVIL DO ESTADO DE MINAS GERAIS</h2>
          <h3 style="margin: 4px 0 0 0; font-size: 15px; font-weight: normal; text-transform: uppercase;">
            ${deptObj ? deptObj.name : 'DEPARTAMENTO DE POLÍCIA'} - ${unitObj ? unitObj.name : 'UNIDADE POLICIAL'}
          </h3>
          <h1 style="margin: 16px 0 0 0; font-size: 16px; font-weight: bold; text-decoration: underline; letter-spacing: 0.5px;">
            RECIBO DE CAUTELA E FORNECIMENTO DE MUNIÇÕES
          </h1>
          <p style="margin: 6px 0 0 0; font-size: 11px; color: #444;">PROTOCOLO: ${cautela.id.toUpperCase()}</p>
        </div>

        <div style="margin-bottom: 18px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
            1. DADOS DO SERVIDOR REQUISITANTE
          </h4>
          <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; width: 60%;"><strong>Nome:</strong> ${cautela.requesterName}</td>
              <td style="padding: 4px 0; width: 40%;"><strong>MASP:</strong> ${cautela.requesterMasp}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Cargo/Função:</strong> ${cautela.requesterCargo || 'Policial'}</td>
              <td style="padding: 4px 0;"><strong>Unidade:</strong> ${unitObj ? unitObj.name : 'N/A'}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 18px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
            2. DISCRIMINAÇÃO DAS MUNIÇÕES FORNECIDAS
          </h4>
          <table style="width: 100%; font-size: 12px; border: 1px solid #ccc; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f4f4f4;">
                <th style="border: 1px solid #ccc; padding: 6px;">Calibre</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Quantidade</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Tipo</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Lote</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Local no Cofre</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="border: 1px solid #ccc; padding: 6px;"><strong>${cautela.caliberName}</strong></td>
                <td style="border: 1px solid #ccc; padding: 6px; font-weight: bold; font-size: 13px;">${cautela.quantity} cartuchos</td>
                <td style="border: 1px solid #ccc; padding: 6px;">${cautela.tipoMunicao || 'Operacional'}</td>
                <td style="border: 1px solid #ccc; padding: 6px; font-family: monospace;">${cautela.loteMunicao || 'Padrão'}</td>
                <td style="border: 1px solid #ccc; padding: 6px; font-family: monospace;">${vaultObj ? vaultObj.code : 'Cofre'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="margin-bottom: 18px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
            3. FINALIDADE E AUTORIZAÇÃO
          </h4>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Motivo do Uso:</strong> ${cautela.reason}</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Data da Solicitação:</strong> ${new Date(cautela.requestDate).toLocaleString('pt-BR')}</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Data da Autorização:</strong> ${cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : 'Pendente'}</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Armeiro Fornecedor:</strong> ${cautela.armorerName || 'Aguardando'} (MASP: ${cautela.armorerMasp || 'N/A'})</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Previsão de Devolução:</strong> ${cautela.seraDevolvida ? 'Sim (munições não deflagradas devem retornar ao cofre)' : 'Não (consumo operacional/treinamento)'}</p>
        </div>

        ${cautela.status === 'DEVOLVIDA' || cautela.status === 'CONSUMIDA' ? `
          <div style="margin-bottom: 18px;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
              4. PRESTAÇÃO DE CONTAS / DEVOLUÇÃO
            </h4>
            <p style="font-size: 12px; margin: 4px 0;"><strong>Status Final:</strong> ${cautela.status}</p>
            <p style="font-size: 12px; margin: 4px 0;"><strong>Munições Retornadas ao Cofre:</strong> ${cautela.returnedQuantity || 0} unidades</p>
            <p style="font-size: 12px; margin: 4px 0;"><strong>Munições Deflagradas / Consumidas:</strong> ${cautela.quantity - (cautela.returnedQuantity || 0)} unidades</p>
            <p style="font-size: 12px; margin: 4px 0;"><strong>Data do Fechamento:</strong> ${cautela.returnedAt ? new Date(cautela.returnedAt).toLocaleString('pt-BR') : 'N/A'}</p>
            ${cautela.observations ? `<p style="font-size: 12px; margin: 4px 0;"><strong>Observações:</strong> ${cautela.observations}</p>` : ''}
          </div>
        ` : ''}

        <div style="margin-top: 55px; display: flex; justify-content: space-between; font-size: 11px; text-align: center;">
          <div style="width: 45%; border-top: 1px solid #000; padding-top: 6px;">
            <strong>${cautela.requesterName}</strong><br/>
            MASP: ${cautela.requesterMasp}<br/>
            Servidor Requisitante
          </div>
          <div style="width: 45%; border-top: 1px solid #000; padding-top: 6px;">
            <strong>${cautela.armorerName || 'Armeiro da Unidade'}</strong><br/>
            MASP: ${cautela.armorerMasp || 'Armeiro'}<br/>
            Responsável pelo Fornecimento
          </div>
        </div>
      </div>
    `;

    printDocumentInPage(htmlContent);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
              <Disc className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-xl font-bold text-slate-100">Cautela de Munições</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Retirada com dedução imediata de estoque do cofre, controle de calibres, lotes e devolução
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('NOVA')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === 'NOVA'
                  ? 'bg-cyan-500 text-slate-950 font-black'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold'
              }`}
            >
              <Disc className="w-4 h-4" />
              <span>Solicitar Munições</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mensagens de Feedback */}
      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs p-4 rounded-xl flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            {lastDirectCautelaMun && (
              <button
                type="button"
                onClick={() => handlePrintRecibo(lastDirectCautelaMun)}
                className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-[11px] flex items-center space-x-1.5 shadow"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Recibo Imediato</span>
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

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('MINHAS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'MINHAS'
              ? 'bg-slate-800 text-cyan-300 border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Minhas Cautelas de Munição</span>
          {myActiveCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
              {myActiveCount} ativa{myActiveCount > 1 ? 's' : ''}
            </span>
          )}
        </button>

        {canAuthorize && (
          <button
            onClick={() => setActiveTab('PENDENTES')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'PENDENTES'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800 shadow-sm'
                : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Solicitações Pendentes (Armeiro)</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500 text-slate-950 font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {canAuthorize && (
          <button
            onClick={() => setActiveTab('TODAS')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'TODAS'
                ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Histórico Geral da Unidade</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('NOVA')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'NOVA'
              ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Solicitação</span>
        </button>
      </div>

      {/* VIEW: NOVA SOLICITAÇÃO */}
      {activeTab === 'NOVA' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Disc className="w-5 h-5 text-cyan-400" />
                <span>Solicitação de Munições por Calibre na Unidade</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Selecione o calibre disponível no cofre da sua unidade, informe a quantidade e o motivo do uso.
              </p>
            </div>

            <form onSubmit={handleRequest} className="space-y-4">
              {/* Opção para Armeiro acautelar diretamente para um policial */}
              {canAuthorize && (
                <div className="p-3.5 bg-slate-950 border border-cyan-600/50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="directCautelaMun"
                        checked={isDirectCautela}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsDirectCautela(checked);
                          if (checked && !targetOfficerId && availableUnitOfficers.length > 0) {
                            setTargetOfficerId(availableUnitOfficers[0].id);
                          }
                        }}
                        className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
                      />
                      <label htmlFor="directCautelaMun" className="text-xs font-bold text-cyan-400 cursor-pointer">
                        Acautelamento Direto pelo Armeiro (Sem solicitação prévia do policial)
                      </label>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Deduz do cofre e gera recibo imediato</span>
                  </div>

                  {isDirectCautela && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Selecione o Policial Beneficiário (Responsável pela Cautela) <span className="text-cyan-400">*</span>
                      </label>
                      <select
                        value={targetOfficerId}
                        onChange={(e) => setTargetOfficerId(e.target.value)}
                        className="w-full bg-slate-900 border border-cyan-600/70 focus:border-cyan-400 rounded-xl px-3 py-2 text-xs text-cyan-200 font-semibold"
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

              {/* 1. Seleção do Local no Cofre / Estoque */}
              <div className="space-y-3">
                {availableUnitVaultsWithAmmo.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>1. Local do Cofre da Unidade</span>
                      <span className="text-[10px] text-cyan-400 font-mono font-normal">
                        {availableUnitVaultsWithAmmo.length} cofre(s) na unidade
                      </span>
                    </label>
                    <select
                      value={selectedVaultId}
                      onChange={(e) => setSelectedVaultId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-bold focus:border-cyan-500 font-mono"
                    >
                      <option value="">Todos os Cofres da Unidade ({availableUnitStocks.length} lote(s) disponíveis)</option>
                      {availableUnitVaultsWithAmmo.map(v => (
                        <option key={v.id} value={v.id}>
                          Cofre: {v.code}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 2. Seleção de Lote / Tipo de Munição */}
                {stocksInSelectedVault.length > 0 ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>2. Selecione a Munição Disponível na Unidade</span>
                      <span className="text-[10px] text-cyan-400 font-mono font-normal">
                        {stocksInSelectedVault.length} lote(s) disponível(is)
                      </span>
                    </label>
                    <select
                      value={selectedStockId}
                      onChange={(e) => {
                        const found = stocksInSelectedVault.find(s => s.id === e.target.value);
                        setSelectedStockId(e.target.value);
                        if (found) {
                          if (found.tipoMunicao) setTipoMunicao(found.tipoMunicao);
                          if (found.loteMunicao) setLoteMunicao(found.loteMunicao);
                          setQuantity(Math.min(quantity || 30, found.quantity));
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:border-cyan-500"
                    >
                      {stocksInSelectedVault.map(stock => {
                        const cal = calibers.find(c => c.id === stock.caliberId);
                        const tipo = stock.tipoMunicao || cal?.tipo || 'Padrão';
                        const peso = stock.pesoMunicao || cal?.peso || 'N/I';
                        const lote = stock.loteMunicao || 'S/L';
                        const ano = stock.anoFabricacao || 'N/A';
                        const cofre = stock.vaultCode ? `[${stock.vaultCode}] ` : '';
                        return (
                          <option key={stock.id} value={stock.id}>
                            {cofre}{stock.caliberName} • {tipo} - {peso} - Lote: {lote} - Ano: {ano} (Disponível: {stock.quantity} un.)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
                    Não há munições em estoque disponíveis no cofre da sua unidade no momento.
                  </div>
                )}
              </div>

              {selectedStock && (
                <div className="p-3 bg-cyan-950/30 border border-cyan-800/50 rounded-xl text-xs text-cyan-200 flex items-center justify-between">
                  <div>
                    Calibre: <strong>{selectedStock.caliberName}</strong> • Disponível no cofre {selectedStock.vaultCode}: <strong>{selectedStock.quantity} un.</strong>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Quantidade Solicitada
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedStock ? selectedStock.quantity : 1000}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tipo de Munição
                  </label>
                  <input
                    type="text"
                    value={tipoMunicao}
                    onChange={(e) => setTipoMunicao(e.target.value)}
                    placeholder="Ex: Operacional, Treinamento, Frangível..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Lote da Munição
                  </label>
                  <input
                    type="text"
                    value={loteMunicao}
                    onChange={(e) => setLoteMunicao(e.target.value)}
                    placeholder="Ex: CBC-2024-LT1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Motivo / Justificativa do Uso
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Plantão Operacional / Instrução / Escolta"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  required
                />
              </div>

              {/* Destinação e Retorno ao Cofre / Baixa Definitiva */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Destinação e Retorno ao Cofre
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="seraDevolvidaCheckMun"
                    checked={seraDevolvida}
                    onChange={(e) => setSeraDevolvida(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="seraDevolvidaCheckMun" className="text-xs text-slate-200 cursor-pointer font-medium">
                    Munições serão devolvidas se não deflagradas (reabastece o estoque do cofre após devolução)
                  </label>
                </div>
                {!seraDevolvida && (
                  <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg font-mono">
                    ⚠ <strong>Baixa Definitiva:</strong> A munição é destinada para consumo/instrução/missão e não retornará ao cofre. A dedução do estoque é permanente.
                  </div>
                )}
              </div>

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
                  disabled={!selectedStockId || isSubmitting || availableUnitStocks.length === 0}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-md"
                >
                  <Disc className="w-4 h-4" />
                  <span>
                    {isSubmitting 
                      ? 'Processando...' 
                      : (isDirectCautela 
                          ? 'Acautelar Munição Imediatamente (Autorização Direta do Armeiro)' 
                          : 'Confirmar Solicitação de Munição')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW: LISTAGEM */}
      {activeTab !== 'NOVA' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por calibre, solicitante, lote..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
              {(['TODOS', 'PENDENTE', 'AUTORIZADA', 'DEVOLVIDA', 'CONSUMIDA', 'RECUSADA'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-cyan-500 text-slate-950 font-black'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {st === 'TODOS' ? 'Todos' : st}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Registros */}
          {scopedCautelas.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              <Disc className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhuma cautela de munição encontrada.</p>
              <p className="text-xs text-slate-500 mt-1">Utilize o botão "Solicitar Munições" para iniciar um novo pedido.</p>
            </div>
          ) : activeTab === 'MINHAS' ? (
            /* VISUALIZAÇÃO MINHAS CAUTELAS: SEPARAÇÃO ENTRE CAUTELAS ATIVAS E HISTÓRICO DEVOLVIDO */
            <div className="space-y-6">
              {/* Seção 1: Cautelas Ativas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      Cautelas Ativas em Posse do Policial
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                    {scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'PENDENTE').length} Ativa(s)
                  </span>
                </div>

                {scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'PENDENTE').length === 0 ? (
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                    Você não possui nenhuma cautela de munição ativa no momento.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {scopedCautelas.filter(c => c.status === 'AUTORIZADA' || c.status === 'PENDENTE').map(cautela => {
                      const isAuthorized = cautela.status === 'AUTORIZADA';
                      const isPending = cautela.status === 'PENDENTE';
                      const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

                      return (
                        <div
                          key={cautela.id}
                          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2.5 rounded-xl border ${
                                isAuthorized
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                  : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                              }`}>
                                <Disc className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <h4 className="text-sm font-bold text-slate-100">{cautela.caliberName}</h4>
                                  <span className="font-mono text-xs text-cyan-400 font-bold">
                                    {cautela.quantity} unidades
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                    isAuthorized
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 animate-pulse'
                                  }`}>
                                    {cautela.status === 'AUTORIZADA' ? 'Acautelada (Ativa)' : cautela.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Solicitante: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp})
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 self-end sm:self-center">
                              {isAuthorized && (
                                <button
                                  onClick={() => handlePrintRecibo(cautela)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                  title="Imprimir Recibo de Cautela de Munições"
                                >
                                  <Printer className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>Imprimir Recibo</span>
                                </button>
                              )}
                              {isAuthorized && (
                                <button
                                  onClick={() => handleOpenReturnModal(cautela)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Devolver / Baixar</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tipo & Lote</span>
                              <span className="text-slate-200 font-bold">{cautela.tipoMunicao || 'Operacional'} • <span className="font-mono">{cautela.loteMunicao || 'Padrão'}</span></span>
                            </div>
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Local do Cofre</span>
                              <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'Cofre da Unidade'}</span>
                            </div>
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Data da Retirada</span>
                              <span className="text-slate-300">
                                {cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Autorizador</span>
                              <span className="text-slate-200 font-semibold truncate block">
                                {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'Aguardando autorização'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Seção 2: Histórico de Cautelas Devolvidas / Encerradas */}
              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Histórico de Cautelas Devolvidas / Baixadas
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {scopedCautelas.filter(c => c.status === 'DEVOLVIDA' || c.status === 'CONSUMIDA' || c.status === 'RECUSADA').length} Registro(s)
                  </span>
                </div>

                {scopedCautelas.filter(c => c.status === 'DEVOLVIDA' || c.status === 'CONSUMIDA' || c.status === 'RECUSADA').length === 0 ? (
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                    Nenhum histórico de cautelas devolvidas ou encerradas.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {scopedCautelas.filter(c => c.status === 'DEVOLVIDA' || c.status === 'CONSUMIDA' || c.status === 'RECUSADA').map(cautela => {
                      const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

                      return (
                        <div
                          key={cautela.id}
                          className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center space-x-3">
                              <div className="p-2.5 rounded-xl border bg-slate-800 border-slate-700 text-slate-400">
                                <Disc className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <h4 className="text-sm font-bold text-slate-200">{cautela.caliberName}</h4>
                                  <span className="font-mono text-xs text-slate-400 font-bold">
                                    {cautela.quantity} unidades
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-slate-800 text-slate-300 border-slate-700">
                                    {cautela.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Devolvida/Encerrada em: {cautela.returnedAt ? new Date(cautela.returnedAt).toLocaleString('pt-BR') : 'N/A'}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => handlePrintRecibo(cautela)}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                              title="Imprimir Comprovante Oficial"
                            >
                              <Printer className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Imprimir Comprovante</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tipo & Lote</span>
                              <span className="text-slate-300 font-bold">{cautela.tipoMunicao || 'Operacional'} • <span className="font-mono">{cautela.loteMunicao || 'Padrão'}</span></span>
                            </div>
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Devolvidas ao Cofre</span>
                              <span className="font-bold text-cyan-400 font-mono">{cautela.returnedQuantity || 0} un.</span>
                            </div>
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Consumidas / Disparadas</span>
                              <span className="font-bold text-amber-400 font-mono">{Math.max(0, cautela.quantity - (cautela.returnedQuantity || 0))} un.</span>
                            </div>
                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Cofre de Retorno</span>
                              <span className="font-mono text-slate-300 font-bold">{vault ? vault.code : 'Cofre'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* VISUALIZAÇÃO GERAL (Armeiro / Admin - PENDENTES ou TODAS) */
            displayedCautelas.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                {activeTab === 'PENDENTES' ? (
                  <>
                    <Clock className="w-8 h-8 text-cyan-500/50 mx-auto mb-2" />
                    <p className="text-sm font-semibold">Nenhuma solicitação de munição pendente de autorização.</p>
                    <p className="text-xs text-slate-500 mt-1">Todas as solicitações de cautela foram devidamente analisadas.</p>
                  </>
                ) : (
                  <>
                    <Disc className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm font-semibold">Nenhuma cautela de munição encontrada no histórico da unidade.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {displayedCautelas.map(cautela => {
                  const isAuthorized = cautela.status === 'AUTORIZADA';
                  const isPending = cautela.status === 'PENDENTE';
                  const isDone = cautela.status === 'DEVOLVIDA' || cautela.status === 'CONSUMIDA';
                  const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

                  return (
                    <div
                      key={cautela.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2.5 rounded-xl border ${
                            isAuthorized
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : isPending
                              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                              : isDone
                              ? 'bg-slate-800 border-slate-700 text-slate-300'
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                          }`}>
                            <Disc className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-bold text-slate-100">{cautela.caliberName}</h4>
                              <span className="font-mono text-xs text-cyan-400 font-bold">
                                {cautela.quantity} unidades
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                isAuthorized
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : isPending
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 animate-pulse'
                                  : isDone
                                  ? 'bg-slate-800 text-slate-300 border-slate-700'
                                  : 'bg-red-500/20 text-red-300 border-red-500/30'
                              }`}>
                                {cautela.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Solicitante: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp}) • {cautela.requesterCargo || 'Policial'}
                            </p>
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex items-center space-x-2 self-end sm:self-center">
                          {(isAuthorized || isDone) && (
                            <button
                              onClick={() => handlePrintRecibo(cautela)}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                              title="Imprimir Recibo de Cautela de Munições"
                            >
                              <Printer className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Imprimir Recibo</span>
                            </button>
                          )}

                          {isAuthorized && (
                            <button
                              onClick={() => handleOpenReturnModal(cautela)}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Devolver / Baixar</span>
                            </button>
                          )}

                          {isPending && canAuthorize && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleAuthorize(cautela.id, cautela.vaultSpaceId)}
                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Autorizar e Deduzir Estoque</span>
                              </button>
                              <button
                                onClick={() => setNotesModal({ id: cautela.id, action: 'RECUSAR' })}
                                className="px-2.5 py-1.5 bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-200 rounded-xl text-xs font-semibold transition"
                              >
                                Recusar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tipo & Lote</span>
                          <span className="text-slate-200 font-bold">{cautela.tipoMunicao || 'Operacional'} • <span className="font-mono">{cautela.loteMunicao || 'Padrão'}</span></span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-500 uppercase block font-semibold">Local do Cofre</span>
                          <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'Cofre da Unidade'}</span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-500 uppercase block font-semibold">Data da Retirada</span>
                          <span className="text-slate-300">
                            {cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Autorizador</span>
                          <span className="text-slate-200 font-semibold truncate block">
                            {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'Aguardando autorização'}
                          </span>
                        </div>
                      </div>

                      {isDone && (
                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                          <div className="text-slate-300">
                            Devolvidas: <strong className="text-cyan-400 font-mono">{cautela.returnedQuantity || 0} un.</strong> • Consumidas em serviço: <strong className="text-amber-400 font-mono">{cautela.quantity - (cautela.returnedQuantity || 0)} un.</strong>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Finalizado em {cautela.returnedAt ? new Date(cautela.returnedAt).toLocaleString('pt-BR') : 'N/A'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* MODAL DE DEVOLUÇÃO / PRESTAÇÃO DE CONTAS DE MUNIÇÃO */}
      {returningCautela && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl my-auto space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                  <RotateCcw className="w-5 h-5 text-cyan-400" />
                  <span>Devolução / Baixa de Munições</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Calibre: <strong>{returningCautela.caliberName}</strong> (Total retirado: {returningCautela.quantity} un.)
                </p>
              </div>
              <button onClick={() => setReturningCautela(null)} className="text-slate-400 hover:text-slate-200">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Quantidade Retornando ao Cofre (Não deflagradas)
                </label>
                <input
                  type="number"
                  min="0"
                  max={returningCautela.quantity}
                  value={returnedQty}
                  onChange={(e) => setReturnedQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono"
                  required
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>Munições consumidas/disparadas:</span>
                  <strong className="text-amber-400 font-mono">
                    {Math.max(0, returningCautela.quantity - (returnedQty || 0))} un.
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Observações da Devolução
                </label>
                <textarea
                  value={returnObs}
                  onChange={(e) => setReturnObs(e.target.value)}
                  placeholder="Ex: Utilizadas em treinamento / Operação concluída sem disparos..."
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
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isSubmitting ? 'Salvando...' : 'Confirmar Devolução'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE RECUSA */}
      {notesModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-100">
              Recusar Solicitação de Cautela de Munição
            </h4>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Descreva o motivo da recusa..."
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
                onClick={() => handleReject(notesModal.id, actionNotes)}
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
