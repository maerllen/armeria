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
  const [selectedCaliberId, setSelectedCaliberId] = useState(calibers[0]?.id || '');
  const [destinacao, setDestinacao] = useState<'Defesa' | 'Treinamento'>('Defesa');
  const [selectedStockId, setSelectedStockId] = useState('');
  const [quantity, setQuantity] = useState<number>(30);
  const [tipoMunicao, setTipoMunicao] = useState('Operacional');
  const [loteMunicao, setLoteMunicao] = useState('');
  const [reason, setReason] = useState('Serviço Policial Operacional / Plantão');
  const [seraDevolvida, setSeraDevolvida] = useState(true);

  // Armorer Direct Cautela State
  const [isDirectCautela, setIsDirectCautela] = useState(false);
  const [targetOfficerId, setTargetOfficerId] = useState('');

  // Modal de Autorização pelo Armeiro (seleciona cofre/lote e permanente vs devolver depois)
  const [authorizingCautelaMun, setAuthorizingCautelaMun] = useState<CautelaMunicao | null>(null);
  const [authStockId, setAuthStockId] = useState('');
  const [authSeraDevolvida, setAuthSeraDevolvida] = useState(true);
  const [authNotes, setAuthNotes] = useState('');

  // Sincroniza calibre inicial
  React.useEffect(() => {
    if (calibers.length > 0 && !selectedCaliberId) {
      setSelectedCaliberId(calibers[0].id);
    }
  }, [calibers, selectedCaliberId]);

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

  // Estoque selecionado para o formulário direto do armeiro
  const selectedStock = useMemo(() => {
    return availableUnitStocks.find(s => s.id === selectedStockId);
  }, [availableUnitStocks, selectedStockId]);

  // Estoques disponíveis na unidade para o armeiro autorizar a cautela pendente
  const availableStocksForAuthorizing = useMemo(() => {
    if (!authorizingCautelaMun) return [];
    const targetUnitId = authorizingCautelaMun.unitId || currentUser.unitId;
    const calId = authorizingCautelaMun.caliberId;
    const calName = (authorizingCautelaMun.caliberName || '').toLowerCase().trim();
    return availableUnitStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === targetUnitId);
      const c = calibers.find(x => x.id === st.caliberId);
      const cName = (c?.name || '').toLowerCase().trim();
      const matchCaliber = (calId && st.caliberId === calId) || (cName && (cName.includes(calName) || calName.includes(cName)));
      return matchUnit && matchCaliber && st.quantity > 0;
    });
  }, [authorizingCautelaMun, availableUnitStocks, calibers, currentUser.unitId, isGeral]);

  React.useEffect(() => {
    if (authorizingCautelaMun && availableStocksForAuthorizing.length > 0) {
      if (!availableStocksForAuthorizing.some(s => s.id === authStockId)) {
        setAuthStockId(availableStocksForAuthorizing[0].id);
      }
    }
  }, [authorizingCautelaMun, availableStocksForAuthorizing, authStockId]);

  // Submeter solicitação
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const qty = parseInt(String(quantity), 10);
    if (qty <= 0) {
      setErrorMsg('Informe uma quantidade válida de munições (maior que zero).');
      return;
    }

    const beneficiary = (canAuthorize && isDirectCautela && targetOfficerId)
      ? (availableUnitOfficers.find(u => u.id === targetOfficerId) || currentUser)
      : currentUser;

    setIsSubmitting(true);
    try {
      const isDirect = Boolean(canAuthorize && isDirectCautela);
      let payload: any;

      if (isDirect) {
        if (!selectedStockId || !selectedStock) {
          setErrorMsg('Selecione um estoque de munição disponível na unidade.');
          setIsSubmitting(false);
          return;
        }
        if (qty > selectedStock.quantity) {
          setErrorMsg(`Quantidade excede o disponível no cofre (${selectedStock.quantity} un.).`);
          setIsSubmitting(false);
          return;
        }

        payload = {
          caliberId: selectedStock.caliberId,
          caliberName: selectedStock.caliberName,
          quantity: qty,
          tipoMunicao: tipoMunicao || selectedStock.tipoMunicao || 'Operacional',
          loteMunicao: loteMunicao || selectedStock.loteMunicao || 'Padrão',
          fabricante: selectedStock.fabricante,
          pesoMunicao: selectedStock.pesoMunicao,
          anoFabricacao: selectedStock.anoFabricacao,
          destinacao,
          vaultSpaceId: selectedStock.vaultSpaceId,
          departmentId: selectedStock.departmentId || beneficiary.departmentId || currentUser.departmentId,
          unitId: selectedStock.unitId || beneficiary.unitId || currentUser.unitId,
          requesterId: beneficiary.id,
          requesterName: beneficiary.name,
          requesterMasp: beneficiary.masp,
          requesterCargo: beneficiary.cargo,
          reason: reason.trim(),
          seraDevolvida,
          directAuthorized: true,
          status: 'AUTORIZADA',
          armorerId: currentUser.id,
          armorerName: currentUser.name,
          armorerMasp: currentUser.masp
        };
      } else {
        // Pedido normal do policial: apenas calibre, quantidade e destinação (Treinamento ou Defesa)
        const chosenCaliber = calibers.find(c => c.id === selectedCaliberId) || (availableUnitStocks[0] ? calibers.find(c => c.id === availableUnitStocks[0].caliberId) : calibers[0]);
        payload = {
          caliberId: chosenCaliber?.id,
          caliberName: chosenCaliber?.name || 'Calibre Padrão',
          quantity: qty,
          tipoMunicao: destinacao === 'Defesa' ? 'Defesa / Operacional' : 'Treinamento',
          loteMunicao: 'A definir pelo armeiro',
          destinacao,
          departmentId: beneficiary.departmentId || currentUser.departmentId,
          unitId: beneficiary.unitId || currentUser.unitId,
          requesterId: beneficiary.id,
          requesterName: beneficiary.name,
          requesterMasp: beneficiary.masp,
          requesterCargo: beneficiary.cargo,
          reason: reason.trim(),
          seraDevolvida: destinacao === 'Defesa',
          directAuthorized: false,
          status: 'PENDENTE'
        };
      }

      const res = await storage.requestCautelaMunicao(payload);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao solicitar cautela de munições.');
      } else {
        if (isDirect && selectedStock) {
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
            destinacao,
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
          setSuccessMsg(`Solicitação de ${qty} munições calibre ${payload.caliberName} enviada ao armeiro da unidade com sucesso!`);
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

  // Abrir modal de autorização pelo armeiro
  const handleOpenAuthorize = (cautela: CautelaMunicao) => {
    setAuthorizingCautelaMun(cautela);
    setAuthSeraDevolvida(cautela.destinacao !== 'Treinamento');
    setAuthNotes('');
  };

  // Confirmar autorização com seleção de cofre/lote e tipo de retirada
  const handleConfirmAuthorizeWithStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorizingCautelaMun) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const selectedStock = availableStocksForAuthorizing.find(s => s.id === authStockId);
      const res = await storage.authorizeCautelaMunicao(authorizingCautelaMun.id, {
        stockId: authStockId || undefined,
        vaultSpaceId: selectedStock?.vaultSpaceId || authorizingCautelaMun.vaultSpaceId,
        seraDevolvida: authSeraDevolvida,
        notes: authNotes
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar retirada de munição.');
      } else {
        setSuccessMsg(`Cautela de ${authorizingCautelaMun.quantity} munições calibre ${authorizingCautelaMun.caliberName} autorizada com sucesso! Saldo deduzido do cofre (${authSeraDevolvida ? 'Irá devolver depois' : 'Retirada permanente'}).`);
        setAuthorizingCautelaMun(null);
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao autorizar retirada de munição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Autorização direta legada
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

              {!isDirectCautela ? (
                /* SOLICITAÇÃO SIMPLIFICADA DO POLICIAL: Calibre, Quantidade e se é Treinamento ou Defesa */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Calibre Desejado <span className="text-cyan-400">*</span>
                      </label>
                      <select
                        value={selectedCaliberId}
                        onChange={(e) => setSelectedCaliberId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-bold focus:border-cyan-500 font-mono"
                        required
                      >
                        {calibers.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Quantidade de Munições Desejadas <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono font-bold focus:border-cyan-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Destinação da Munição <span className="text-cyan-400">*</span>
                      </label>
                      <select
                        value={destinacao}
                        onChange={(e) => setDestinacao(e.target.value as 'Defesa' | 'Treinamento')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-semibold focus:border-cyan-500"
                      >
                        <option value="Defesa">Defesa (Serviço Operacional / Plantão)</option>
                        <option value="Treinamento">Treinamento (Instrução / Estande de Tiro)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                        Motivo / Justificativa do Uso <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ex: Plantão Operacional / Instrução / Escolta"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-cyan-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-xl text-xs text-cyan-300">
                    ℹ <strong>Fluxo Simplificado:</strong> O armeiro da unidade será notificado no sistema e informará de qual cofre e lote será feita a retirada, definindo se a entrega será permanente ou com devolução posterior.
                  </div>

                  <div className="pt-2 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('MINHAS')}
                      className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || quantity <= 0 || !selectedCaliberId}
                      className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-md"
                    >
                      <Disc className="w-4 h-4" />
                      <span>{isSubmitting ? 'Enviando...' : 'Confirmar Solicitação de Munição'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ACAUTELAMENTO DIRETO PELO ARMEIRO: Seleciona cofre e lote diretamente */
                <div className="space-y-4">
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

                    {stocksInSelectedVault.length > 0 ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>2. Selecione a Munição Disponível no Cofre</span>
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
                        Quantidade
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
                        Destinação
                      </label>
                      <select
                        value={destinacao}
                        onChange={(e) => setDestinacao(e.target.value as 'Defesa' | 'Treinamento')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium"
                      >
                        <option value="Defesa">Defesa</option>
                        <option value="Treinamento">Treinamento</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Tipo de Retirada
                      </label>
                      <select
                        value={seraDevolvida ? 'DEVOLVER' : 'PERMANENTE'}
                        onChange={(e) => setSeraDevolvida(e.target.value === 'DEVOLVER')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-medium"
                      >
                        <option value="DEVOLVER">Irá devolver depois</option>
                        <option value="PERMANENTE">Retirada permanente</option>
                      </select>
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
                      <span>{isSubmitting ? 'Processando...' : 'Acautelar Munição Imediatamente (Autorização Direta)'}</span>
                    </button>
                  </div>
                </div>
              )}
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
            /* VISUALIZAÇÃO MINHAS CAUTELAS: SEPARAÇÃO ENTRE CAUTELAS ATIVAS (A DEVOLVER), BAIXADAS (USO PERMANENTE), RECUSADAS E DEVOLVIDAS */
            <div className="space-y-6">
              {/* Seção 1: Cautelas Ativas a Devolver */}
              {(() => {
                const ativas = scopedCautelas.filter(c => c.status === 'AUTORIZADA' && Boolean(c.seraDevolvida));
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                          Munições Acauteladas (Ativas - Aguardando Devolução)
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                        {ativas.length} Cautela(s) Ativa(s)
                      </span>
                    </div>

                    {ativas.length === 0 ? (
                      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                        Você não possui nenhuma munição acautelada temporária pendente de devolução.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {ativas.map(cautela => {
                          const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

                          return (
                            <div
                              key={cautela.id}
                              className="bg-slate-900 border border-emerald-800/40 rounded-2xl p-4 sm:p-5 hover:border-emerald-700/60 transition space-y-3 shadow-sm ring-1 ring-emerald-500/10"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                <div className="flex items-center space-x-3">
                                  <div className="p-2.5 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                    <Disc className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <h4 className="text-sm font-bold text-slate-100">{cautela.caliberName}</h4>
                                      <span className="font-mono text-xs text-cyan-400 font-bold">
                                        {cautela.quantity} unidades
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                        Acautelada (Ativa - A Devolver)
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Solicitante: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp})
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 self-end sm:self-center">
                                  <button
                                    onClick={() => handlePrintRecibo(cautela)}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                    title="Imprimir Recibo de Cautela de Munições"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>Imprimir Recibo</span>
                                  </button>
                                  <button
                                    onClick={() => handleOpenReturnModal(cautela)}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Devolver ao Cofre</span>
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tipo & Lote</span>
                                  <span className="text-slate-200 font-bold">{cautela.tipoMunicao || 'Operacional'} • <span className="font-mono">{cautela.loteMunicao || 'Padrão'}</span></span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Local de Origem</span>
                                  <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'Cofre da Unidade'}</span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Data da Retirada</span>
                                  <span className="text-slate-300">
                                    {cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Fornecedor</span>
                                  <span className="text-slate-200 font-semibold truncate block">
                                    {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'Armeiro da Unidade'}
                                  </span>
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

              {/* Seção 2: Munições Baixadas (Uso Permanente / Treinamento / Consumo) */}
              {(() => {
                const baixadas = scopedCautelas.filter(c => c.status === 'CONSUMIDA' || (c.status === 'AUTORIZADA' && !c.seraDevolvida));
                return (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                        <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                          Munições Baixadas (Uso Permanente / Treinamento / Consumo)
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                        {baixadas.length} Registro(s) Baixado(s)
                      </span>
                    </div>

                    {baixadas.length === 0 ? (
                      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                        Nenhuma munição baixada de forma definitiva registrada.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {baixadas.map(cautela => {
                          const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

                          return (
                            <div
                              key={cautela.id}
                              className="bg-slate-900 border border-blue-900/40 rounded-2xl p-4 sm:p-5 hover:border-blue-700/60 transition space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                <div className="flex items-center space-x-3">
                                  <div className="p-2.5 rounded-xl border bg-blue-500/10 border-blue-500/20 text-blue-400">
                                    <Disc className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <h4 className="text-sm font-bold text-slate-100">{cautela.caliberName}</h4>
                                      <span className="font-mono text-xs text-blue-300 font-bold">
                                        {cautela.quantity} unidades
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-blue-500/20 text-blue-300 border-blue-500/30">
                                        Baixada (Uso Permanente)
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Autorizado para: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp}) • Destinação: {cautela.destinacao || 'Consumo Operacional'}
                                    </p>
                                  </div>
                                </div>

                                <button
                                  onClick={() => handlePrintRecibo(cautela)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                  title="Imprimir Comprovante de Baixa de Munições"
                                >
                                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                                  <span>Imprimir Recibo</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tipo & Lote</span>
                                  <span className="text-slate-200 font-bold">{cautela.tipoMunicao || 'Operacional'} • <span className="font-mono">{cautela.loteMunicao || 'Padrão'}</span></span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Cofre de Origem</span>
                                  <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'Cofre da Unidade'}</span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Data da Baixa</span>
                                  <span className="text-slate-300">
                                    {cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : new Date(cautela.requestDate).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro Responsável</span>
                                  <span className="text-slate-200 font-semibold truncate block">
                                    {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'Armeiro da Unidade'}
                                  </span>
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

              {/* Seção 3: Cautelas Recusadas (Indeferidas pelo Armeiro) */}
              {(() => {
                const recusadas = scopedCautelas.filter(c => c.status === 'RECUSADA');
                return (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider">
                          Cautelas Recusadas (Solicitações Indeferidas)
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                        {recusadas.length} Recusada(s)
                      </span>
                    </div>

                    {recusadas.length === 0 ? (
                      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                        Nenhuma solicitação de munição foi recusada.
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
                                    <Disc className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <h4 className="text-sm font-bold text-slate-100">{cautela.caliberName}</h4>
                                      <span className="font-mono text-xs text-red-400 font-bold">
                                        {cautela.quantity} unidades solicitadas
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-red-500/20 text-red-300 border-red-500/30">
                                        Recusada
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Solicitado em: {new Date(cautela.requestDate).toLocaleString('pt-BR')} • {cautela.reason || 'Sem motivo especificado'}
                                    </p>
                                  </div>
                                </div>

                                <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/40 px-3 py-1.5 rounded-xl">
                                  Indeferido por {cautela.armorerName || 'Armeiro'} {cautela.armorerMasp ? `(MASP: ${cautela.armorerMasp})` : ''}
                                </div>
                              </div>

                              {cautela.observations && (
                                <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-red-300">
                                  <strong>Justificativa da recusa:</strong> {cautela.observations}
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

              {/* Seção 4: Solicitações Pendentes */}
              {(() => {
                const pendentes = scopedCautelas.filter(c => c.status === 'PENDENTE');
                if (pendentes.length === 0) return null;
                return (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                          Solicitações Pendentes (Aguardando Armeiro)
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                        {pendentes.length} Pendente(s)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {pendentes.map(cautela => (
                        <div
                          key={cautela.id}
                          className="bg-slate-900 border border-amber-900/40 rounded-2xl p-4 sm:p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                            <div className="flex items-center space-x-3">
                              <div className="p-2.5 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-400">
                                <Clock className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <h4 className="text-sm font-bold text-slate-100">{cautela.caliberName}</h4>
                                  <span className="font-mono text-xs text-amber-400 font-bold">
                                    {cautela.quantity} unidades
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">
                                    Aguardando Análise
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Solicitado em: {new Date(cautela.requestDate).toLocaleString('pt-BR')} • Motivo: {cautela.reason}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Seção 5: Histórico de Cautelas Devolvidas */}
              {(() => {
                const devolvidas = scopedCautelas.filter(c => c.status === 'DEVOLVIDA');
                return (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Histórico de Munições Devolvidas ao Cofre
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {devolvidas.length} Registro(s) Devolvido(s)
                      </span>
                    </div>

                    {devolvidas.length === 0 ? (
                      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                        Nenhum histórico de devolução de munições registrado.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {devolvidas.map(cautela => {
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
                                        Devolvida ao Cofre
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Devolvida em: {cautela.returnedAt ? new Date(cautela.returnedAt).toLocaleString('pt-BR') : 'N/A'} por {cautela.returnArmorerName || 'Armeiro'}
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
                );
              })()}
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
                                onClick={() => handleOpenAuthorize(cautela)}
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
                          <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : (cautela.status === 'PENDENTE' ? 'A definir pelo armeiro' : 'Cofre da Unidade')}</span>
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

                      <div className="p-2.5 bg-cyan-950/30 border border-cyan-800/50 rounded-xl flex items-center justify-between text-xs text-cyan-200">
                        <div className="flex items-center space-x-2">
                          <Disc className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>
                            Destinação: <strong>{cautela.destinacao || 'Defesa'}</strong> • Modalidade: <strong>{cautela.seraDevolvida ? 'Irá devolver depois' : 'Retirada permanente / baixa definitiva'}</strong>
                          </span>
                        </div>
                        {cautela.reason && (
                          <span className="text-[11px] text-slate-400 italic truncate max-w-xs">
                            "{cautela.reason}"
                          </span>
                        )}
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

      {/* MODAL DO ARMEIRO: AUTORIZAÇÃO, SELEÇÃO DO COFRE/LOTE E TIPO DE RETIRADA */}
      {authorizingCautelaMun && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-4 my-8">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Despacho do Armeiro
              </span>
              <h3 className="text-base font-bold text-slate-100 mt-1">
                Autorizar Cautela de Munições
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina de qual cofre/lote as munições serão retiradas e se a saída é temporária ou definitiva.
              </p>
            </div>

            {/* Resumo da solicitação do policial */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Policial Solicitante:</span>
                <strong className="text-slate-200">
                  {authorizingCautelaMun.requesterName} (MASP: {authorizingCautelaMun.requesterMasp})
                </strong>
              </div>
              <div className="flex items-center justify-between text-amber-300 pt-1 border-t border-slate-800/80">
                <span>Calibre & Quantidade Solicitada:</span>
                <strong className="font-mono text-sm">
                  {authorizingCautelaMun.quantity} un. • Calibre: {authorizingCautelaMun.caliberName}
                </strong>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Destinação Solicitada:</span>
                <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-bold text-amber-300">
                  {authorizingCautelaMun.destinacao || 'Defesa'}
                </span>
              </div>
              {authorizingCautelaMun.reason && (
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-500">Motivo:</span> {authorizingCautelaMun.reason}
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmAuthorizeWithStock} className="space-y-4">
              {/* 1. Seleção de qual cofre/lote retirar */}
              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>De qual cofre / lote vai tirar as munições?</span>
                  <span className="text-[10px] text-amber-400 font-mono font-normal">
                    {availableStocksForAuthorizing.length} lote(s) disponível(is)
                  </span>
                </label>

                {availableStocksForAuthorizing.length === 0 ? (
                  <div className="p-3 bg-red-950/40 border border-red-800 text-xs text-red-300 rounded-xl">
                    ⚠ Não há estoque disponível para o calibre <strong>{authorizingCautelaMun.caliberName}</strong> nesta unidade.
                  </div>
                ) : (
                  <select
                    value={authStockId}
                    onChange={(e) => setAuthStockId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-amber-500"
                    required
                  >
                    {availableStocksForAuthorizing.map(st => {
                      const vault = vaultSpaces.find(v => v.id === st.vaultSpaceId);
                      return (
                        <option key={st.id} value={st.id}>
                          {vault ? vault.code : 'Cofre'} • {st.fabricante || 'CBC'} • Tipo: {st.tipoMunicao || 'Comum'} • Peso: {st.pesoMunicao || 'N/I'} • Lote: {st.loteMunicao || 'S/L'} • Ano: {st.anoFabricacao || 'N/A'} — Saldo: {st.quantity} un.
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
                        name="authRetiradaTipoMun"
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
                        name="authRetiradaTipoMun"
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

              {/* 3. Despacho / Observações do Armeiro */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Despacho / Observações do Armeiro (Opcional)
                </label>
                <textarea
                  value={authNotes}
                  onChange={(e) => setAuthNotes(e.target.value)}
                  placeholder="Observações pertinentes à liberação das munições..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100"
                  rows={2}
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAuthorizingCautelaMun(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (availableStocksForAuthorizing.length > 0 && !authStockId)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition flex items-center space-x-2 shadow-md"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Autorizando...' : 'Confirmar Autorização e Baixa no Estoque'}</span>
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
