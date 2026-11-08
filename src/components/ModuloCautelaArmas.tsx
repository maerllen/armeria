import React, { useState, useMemo } from 'react';
import { 
  User, Weapon, CautelaArma, AmmunitionStock, Caliber, VaultSpace, Unit, Department 
} from '../types';
import { storage } from '../services/storage';
import { 
  Shield, Crosshair, Disc, AlertCircle, Check, Clock, Search, 
  Printer, ArrowRightLeft, CheckCircle2, XCircle, FileText, 
  ChevronRight, Sparkles, Filter, AlertTriangle, RotateCcw, Eye, Lock
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

  const [lastDirectCautelaArma, setLastDirectCautelaArma] = useState<CautelaArma | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDENTE' | 'AUTORIZADA' | 'DEVOLVIDA' | 'RECUSADA'>('TODOS');
  
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
  const [authStockId, setAuthStockId] = useState('');
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
  const [notesModal, setNotesModal] = useState<{ id: string; action: 'AUTORIZAR' | 'RECUSAR' } | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lista de cautelas
  const allCautelas = storage.getCautelasArmas();

  // Filtragem de cautelas de acordo com permissões
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
        c.weaponSerialNumber.toLowerCase().includes(term) ||
        c.weaponModel.toLowerCase().includes(term) ||
        c.requesterName.toLowerCase().includes(term) ||
        c.requesterMasp.toLowerCase().includes(term) ||
        (c.reason && c.reason.toLowerCase().includes(term))
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

  // Contadores para badges
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

  // Armas disponíveis na unidade do usuário para solicitação de cautela (qualquer arma no cofre da unidade)
  const userUnitWeapons = useMemo(() => {
    const userUnitId = currentUser.unitId;
    // Permite ao policial solicitar acautelamento de qualquer arma disponível na sua unidade
    const sourceWeapons = (weapons && weapons.length > 0) ? weapons : storage.getAllWeapons();
    return sourceWeapons.filter(w => {
      const sameUnit = isGeral ? true : (
        (userUnitId && w.unitId === userUnitId) ||
        (!w.unitId && currentUser.departmentId && w.departmentId === currentUser.departmentId) ||
        (!userUnitId && currentUser.departmentId && w.departmentId === currentUser.departmentId)
      );
      const st = (w.status || '').toLowerCase().trim();
      const isAvailable = !st || st.includes('cofre') || st.includes('dispon');
      const notBlocked = st !== 'acautelada' && st !== 'em trânsito' && st !== 'em transito' && st !== 'manutenção' && st !== 'manutencao';
      return sameUnit && (isAvailable || notBlocked);
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
      (m.requesterId === cautela.requesterId && (m.status === 'PENDENTE' || m.status === 'AUTORIZADA') && Math.abs(new Date(m.requestDate).getTime() - new Date(cautela.requestDate).getTime()) < 15000)
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
        magazineQuantity,
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

      if (requestAmmoTogether && Number(ammoQuantity) > 0) {
        payload.ammunition = {
          caliberName: weapon.caliber,
          quantity: Number(ammoQuantity) || 0,
          destinacao: ammoDestinacao,
          tipoMunicao: ammoDestinacao === 'Defesa' ? 'Defesa / Operacional' : 'Treinamento',
          loteMunicao: isDirect ? ammoLot : 'A definir pelo armeiro',
          vaultSpaceId: isDirect ? (availableAmmoForSelectedWeapon.find(s => s.id === selectedAmmoStockId)?.vaultSpaceId || weapon.vaultSpaceId) : undefined,
          reason: `Acautelamento em conjunto com ${weapon.model} Nº ${weapon.serialNumber} (${ammoDestinacao})`,
          seraDevolvida: isDirect ? ammoSeraDevolvida : (ammoDestinacao === 'Defesa')
        };
        payload.ammoQuantity = Number(ammoQuantity) || 0;
        payload.ammoDestinacao = ammoDestinacao;
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
            magazineQuantity,
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
            hadShots: false,
            shotsFired: 0,
            isWorking: true,
            hadMalfunction: false,
            returnedMagazinesCount: magazineQuantity,
            createdAt: new Date().toISOString()
          };
          setLastDirectCautelaArma(newCautelaObj);
          setSuccessMsg(`Arma ${weapon.model} (Série: ${weapon.serialNumber}) acautelada com sucesso para o policial ${beneficiary.name}! O saldo foi deduzido do cofre e o recibo gerado imediatamente.`);
          setTimeout(() => {
            handlePrintTermo(newCautelaObj);
          }, 150);
          setActiveTab('TODAS');
        } else {
          setSuccessMsg(`Solicitação de cautela da arma ${weapon.model} (Série: ${weapon.serialNumber}) enviada ao armeiro da unidade com sucesso!`);
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
    if (hasAmmo) {
      setAuthorizingCautela(cautela);
      const isTreinamento = (cautela.ammoDestinacao === 'Treinamento' || linkedAmmo?.destinacao === 'Treinamento');
      setAuthSeraDevolvida(!isTreinamento);
      setAuthNotes('');
    } else {
      setNotesModal({ id: cautela.id, action: 'AUTORIZAR' });
    }
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
        stockId: authStockId || undefined,
        vaultSpaceId: selectedStock?.vaultSpaceId || authorizingCautela.vaultSpaceId,
        seraDevolvida: authSeraDevolvida
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar acautelamento.');
      } else {
        setSuccessMsg(`Cautela da arma ${authorizingCautela.weaponModel} autorizada com sucesso! A munição foi deduzida do cofre selecionado (${authSeraDevolvida ? 'Irá devolver depois' : 'Retirada permanente'}).`);
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
      const res = await storage.authorizeCautelaArma(id, notes);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao autorizar cautela.');
      } else {
        setSuccessMsg('Cautela autorizada com sucesso! A arma agora consta como "Acautelada" e o termo está liberado para impressão.');
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
  const handleReject = async (id: string, notes?: string) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await storage.rejectCautelaArma(id, notes);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao recusar cautela.');
      } else {
        setSuccessMsg('Solicitação de cautela recusada.');
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
  const handleOpenReturnModal = (cautela: CautelaArma) => {
    setReturningCautela(cautela);
    setHadShots(false);
    setShotsFired(0);
    setIsWorking(true);
    setDefectDescription('');
    setHadMalfunction(false);
    setMalfunctionDescription('');
    setReturnedMagazinesCount(cautela.magazineQuantity || 1);
    setReturnObservations('');
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
      const res = await storage.returnCautelaArma(returningCautela.id, {
        hadShots,
        shotsFired: hadShots ? shotsFired : 0,
        isWorking,
        defectDescription: !isWorking ? defectDescription.trim() : null,
        hadMalfunction,
        malfunctionDescription: hadMalfunction ? malfunctionDescription.trim() : null,
        returnedMagazinesCount,
        returnObservations: returnObservations.trim()
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar devolução.');
      } else {
        setSuccessMsg(`Arma ${returningCautela.weaponModel} devolvida com sucesso ao cofre de origem!`);
        setReturningCautela(null);
        onRefresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar devolução.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Impressão do Termo Formal de Cautela de Armamento
  const handlePrintTermo = (cautela: CautelaArma) => {
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
            TERMO DE CAUTELA INDIVIDUAL DE ARMAMENTO E MUNIÇÃO
          </h1>
          <p style="margin: 6px 0 0 0; font-size: 11px; color: #444;">PROTOCOLO: ${cautela.id.toUpperCase()}</p>
        </div>

        <div style="margin-bottom: 18px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
            1. DADOS DO SERVIDOR CAUTELANTE (RESPONSÁVEL)
          </h4>
          <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; width: 60%;"><strong>Nome:</strong> ${cautela.requesterName}</td>
              <td style="padding: 4px 0; width: 40%;"><strong>MASP:</strong> ${cautela.requesterMasp}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Cargo/Função:</strong> ${cautela.requesterCargo || 'Policial'}</td>
              <td style="padding: 4px 0;"><strong>Telefone/Contato:</strong> ${cautela.requesterPhone || 'N/A'}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 4px 0;"><strong>Unidade de Lotação:</strong> ${unitObj ? unitObj.name : 'N/A'}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 18px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
            2. ESPECIFICAÇÃO DO ARMAMENTO ACAUTELADO
          </h4>
          <table style="width: 100%; font-size: 12px; border: 1px solid #ccc; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f4f4f4;">
                <th style="border: 1px solid #ccc; padding: 6px;">Tipo</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Modelo</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Calibre</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Nº de Série</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Carregadores</th>
                <th style="border: 1px solid #ccc; padding: 6px;">Cofre de Retorno</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="border: 1px solid #ccc; padding: 6px;">${cautela.weaponType || 'Arma'}</td>
                <td style="border: 1px solid #ccc; padding: 6px;"><strong>${cautela.weaponModel}</strong></td>
                <td style="border: 1px solid #ccc; padding: 6px;">${cautela.weaponCaliber || 'N/A'}</td>
                <td style="border: 1px solid #ccc; padding: 6px; font-family: monospace;"><strong>${cautela.weaponSerialNumber}</strong></td>
                <td style="border: 1px solid #ccc; padding: 6px; text-align: center;">${cautela.magazineQuantity} un.</td>
                <td style="border: 1px solid #ccc; padding: 6px; font-family: monospace;">${vaultObj ? vaultObj.code : 'Cofre Padrão'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="margin-bottom: 18px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
            3. FINALIDADE E DATAS
          </h4>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Finalidade / Motivo da Cautela:</strong> ${cautela.reason || 'Serviço Operacional'}</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Data/Hora da Solicitação:</strong> ${new Date(cautela.requestDate).toLocaleString('pt-BR')}</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Data/Hora da Autorização:</strong> ${cautela.authorizedAt ? new Date(cautela.authorizedAt).toLocaleString('pt-BR') : 'Pendente'}</p>
          <p style="font-size: 12px; margin: 4px 0;"><strong>Armeiro Responsável pela Entrega:</strong> ${cautela.armorerName || 'Aguardando'} (MASP: ${cautela.armorerMasp || 'N/A'})</p>
        </div>

        ${cautela.status === 'DEVOLVIDA' ? `
          <div style="margin-bottom: 18px;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; background: #eee; padding: 4px 8px; border-left: 4px solid #000;">
              4. REGISTRO TÉCNICO DE DEVOLUÇÃO
            </h4>
            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0; width: 50%;"><strong>Data de Devolução:</strong> ${cautela.returnDate ? new Date(cautela.returnDate).toLocaleString('pt-BR') : 'N/A'}</td>
                <td style="padding: 4px 0; width: 50%;"><strong>Armeiro Receptor:</strong> ${cautela.returnArmorerName || 'N/A'} (MASP: ${cautela.returnArmorerMasp || 'N/A'})</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Houve Disparos/Tiros:</strong> ${cautela.hadShots ? `SIM (${cautela.shotsFired} tiros efetuados)` : 'NÃO (Zero disparos)'}</td>
                <td style="padding: 4px 0;"><strong>Condição da Arma:</strong> ${cautela.isWorking ? 'Em Condições de Uso' : 'Apresenta Defeito'}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;"><strong>Apresentou Pane:</strong> ${cautela.hadMalfunction ? `SIM (${cautela.malfunctionDescription || 'Pane registrada'})` : 'NÃO'}</td>
                <td style="padding: 4px 0;"><strong>Carregadores Devolvidos:</strong> ${cautela.returnedMagazinesCount} un.</td>
              </tr>
              ${cautela.defectDescription ? `<tr><td colspan="2" style="padding: 4px 0; color: #a00;"><strong>Defeito Constatado:</strong> ${cautela.defectDescription}</td></tr>` : ''}
              ${cautela.returnObservations ? `<tr><td colspan="2" style="padding: 4px 0;"><strong>Observações:</strong> ${cautela.returnObservations}</td></tr>` : ''}
            </table>
          </div>
        ` : ''}

        <div style="margin-top: 35px; font-size: 11px; text-align: justify; color: #333; border: 1px solid #bbb; padding: 10px; border-radius: 4px;">
          <strong>TERMO DE COMPROMISSO E FIEL DEPOSITÁRIO:</strong> O servidor qualificado acima declara ter recebido o armamento e acessórios descritos em perfeitas condições de funcionamento e limpeza, comprometendo-se a zelar por sua guarda, conservação e uso estritamente legal nos termos do regulamento da Polícia Civil de Minas Gerais. Obriga-se ainda a devolver a arma no cofre de retorno indicado, prestando as informações técnicas de disparos e anomalias ocorridas.
        </div>

        <div style="margin-top: 55px; display: flex; justify-content: space-between; font-size: 11px; text-align: center;">
          <div style="width: 45%; border-top: 1px solid #000; padding-top: 6px;">
            <strong>${cautela.requesterName}</strong><br/>
            MASP: ${cautela.requesterMasp}<br/>
            Servidor Cautelante
          </div>
          <div style="width: 45%; border-top: 1px solid #000; padding-top: 6px;">
            <strong>${cautela.armorerName || 'Armeiro da Unidade'}</strong><br/>
            MASP: ${cautela.armorerMasp || 'Armeiro'}<br/>
            Responsável pela Autorização / Armaria
          </div>
        </div>

        <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #777;">
          Documento emitido eletronicamente pelo Sistema de Gestão de Armas e Munições - PCMG em ${new Date().toLocaleString('pt-BR')}
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
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <Crosshair className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-xl font-bold text-slate-100">Cautela de Armas</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Retirada, autorização por armeiros, controle de carregadores, tiros efetuados e devolução
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

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('MINHAS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'MINHAS'
              ? 'bg-slate-800 text-amber-300 border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Minhas Cautelas</span>
          {myActiveCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
              {myActiveCount} ativa{myActiveCount > 1 ? 's' : ''}
            </span>
          )}
        </button>

        {canAuthorize && (
          <button
            onClick={() => setActiveTab('PENDENTES')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'PENDENTES'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-800 shadow-sm'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Solicitações Pendentes (Armeiro)</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black animate-pulse">
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
              ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Nova Solicitação</span>
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

              {/* Seção de Munições Conjuntas */}
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
                    {!isDirectCautela ? (
                      /* Formulário para o policial: fala apenas a quantidade e se é de treinamento ou defesa */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                              Quantidade de Munições Desejadas
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="300"
                              value={ammoQuantity}
                              onChange={(e) => setAmmoQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono font-bold focus:border-amber-500"
                              required
                            />
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              Calibre correspondente: <strong>{selectedWeapon?.caliber || 'Padrão da Arma'}</strong>
                            </span>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                              Destinação da Munição
                            </label>
                            <select
                              value={ammoDestinacao}
                              onChange={(e) => setAmmoDestinacao(e.target.value as 'Defesa' | 'Treinamento')}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-semibold focus:border-amber-500"
                            >
                              <option value="Defesa">Defesa (Serviço Operacional / Plantão)</option>
                              <option value="Treinamento">Treinamento (Instrução / Estande de Tiro)</option>
                            </select>
                            <span className="text-[10px] text-amber-400/90 mt-1 block">
                              O armeiro definirá o cofre, lote e se será com devolução ou baixa definitiva.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Acautelamento direto pelo armeiro */
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
                    )}
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
                placeholder="Buscar por arma, série ou policial..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500"
              />
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
              {(['TODOS', 'PENDENTE', 'AUTORIZADA', 'DEVOLVIDA', 'RECUSADA'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-amber-500 text-slate-950 font-black'
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
              <Crosshair className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhuma cautela de armamento encontrada.</p>
              <p className="text-xs text-slate-500 mt-1">Utilize o botão "Solicitar Retirada de Arma" para registrar uma nova cautela.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeTab === 'MINHAS' ? (
                <>
                  {/* Seção 1: Cautelas Ativas */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          Cautela(s) Ativa(s) em Posse do Policial
                        </h4>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
                        {scopedCautelas.filter(c => c.status === 'AUTORIZADA').length} arma(s) acautelada(s)
                      </span>
                    </div>

                    {scopedCautelas.filter(c => c.status === 'AUTORIZADA').length === 0 ? (
                      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        Você não possui nenhuma arma acautelada ativa no momento.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {scopedCautelas.filter(c => c.status === 'AUTORIZADA').map(cautela => {
                          const isAuthorized = cautela.status === 'AUTORIZADA';
                          const isPending = cautela.status === 'PENDENTE';
                          const isReturned = cautela.status === 'DEVOLVIDA';
                          const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

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
                                  <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'No Cofre de Origem'}</span>
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
                                  <span className="text-slate-200 font-semibold truncate block">
                                    {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'Aguardando autorização'}
                                  </span>
                                </div>
                              </div>

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

                  {/* Seção 2: Cautelas Recusadas (Indeferidas pelo Armeiro) */}
                  {(() => {
                    const recusadas = scopedCautelas.filter(c => c.status === 'RECUSADA');
                    return (
                      <div className="space-y-3 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">
                              Cautelas Recusadas (Solicitações Indeferidas)
                            </h4>
                          </div>
                          <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800/60">
                            {recusadas.length} recusada(s)
                          </span>
                        </div>

                        {recusadas.length === 0 ? (
                          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                            Nenhuma solicitação de armamento foi recusada.
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

                  {/* Seção 3: Solicitações Pendentes */}
                  {(() => {
                    const pendentes = scopedCautelas.filter(c => c.status === 'PENDENTE');
                    if (pendentes.length === 0) return null;
                    return (
                      <div className="space-y-3 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                              Solicitações Pendentes (Aguardando Armeiro)
                            </h4>
                          </div>
                          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/60">
                            {pendentes.length} pendente(s)
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
                                      <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                      <span className="font-mono text-xs text-amber-400 font-bold">
                                        Nº {cautela.weaponSerialNumber}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">
                                        Aguardando Análise
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Solicitado em {new Date(cautela.requestDate).toLocaleString('pt-BR')} • Motivo: "{cautela.reason}"
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

                  {/* Seção 4: Histórico de Cautelas Devolvidas */}
                  {(() => {
                    const devolvidas = scopedCautelas.filter(c => c.status === 'DEVOLVIDA');
                    return (
                      <div className="space-y-3 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Histórico de Armas Devolvidas
                            </h4>
                          </div>
                          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                            {devolvidas.length} registro(s)
                          </span>
                        </div>

                        {devolvidas.length === 0 ? (
                          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                            Nenhum histórico de devolução de armas registrado.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {devolvidas.map(cautela => {
                              const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

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
                                      <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'No Cofre de Origem'}</span>
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
                </>
              ) : (
                /* Aba PENDENTES ou TODAS */
                displayedCautelas.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                    {activeTab === 'PENDENTES' ? (
                      <>
                        <Clock className="w-8 h-8 text-amber-500/50 mx-auto mb-2" />
                        <p className="text-sm font-semibold">Nenhuma solicitação de armamento pendente de autorização.</p>
                        <p className="text-xs text-slate-500 mt-1">Todas as solicitações de cautela foram devidamente analisadas.</p>
                      </>
                    ) : (
                      <>
                        <Crosshair className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-semibold">Nenhuma cautela de armamento encontrada no histórico da unidade.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {displayedCautelas.map(cautela => {
                      const isAuthorized = cautela.status === 'AUTORIZADA';
                      const isPending = cautela.status === 'PENDENTE';
                      const isReturned = cautela.status === 'DEVOLVIDA';
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
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  : isReturned
                                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                                  : 'bg-red-500/10 border-red-500/20 text-red-400'
                              }`}>
                                <Crosshair className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <h4 className="text-sm font-bold text-slate-100">{cautela.weaponModel}</h4>
                                  <span className="font-mono text-xs text-amber-400 font-bold">
                                    Nº {cautela.weaponSerialNumber}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                    isAuthorized
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                      : isPending
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                                      : isReturned
                                      ? 'bg-slate-800 text-slate-300 border-slate-700'
                                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                                  }`}>
                                    {cautela.status === 'AUTORIZADA' ? 'Acautelada (Ativa)' : cautela.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Solicitante: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp}) • {cautela.requesterCargo || 'Policial'}
                                </p>
                              </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center space-x-2 self-end sm:self-center">
                              {(isAuthorized || isReturned) && (
                                <button
                                  onClick={() => handlePrintTermo(cautela)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                  title="Imprimir Termo de Cautela de Armamento"
                                >
                                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Imprimir Termo</span>
                                </button>
                              )}

                              {isAuthorized && (
                                <button
                                  onClick={() => handleOpenReturnModal(cautela)}
                                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Devolver ao Cofre</span>
                                </button>
                              )}

                              {isPending && canAuthorize && (
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleOpenAuthorize(cautela)}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Autorizar Retirada</span>
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
                              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Cofre de Retorno</span>
                              <span className="font-mono text-slate-200 font-bold">{vault ? vault.code : 'No Cofre de Origem'}</span>
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
                              <span className="text-slate-200 font-semibold truncate block">
                                {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'Aguardando autorização'}
                              </span>
                            </div>
                          </div>

                          {/* Seção com detalhes da munição conjunta solicitada */}
                          {(() => {
                            const linked = getLinkedAmmoForCautela(cautela);
                            const hasMun = Boolean(cautela.ammoQuantity || cautela.linkedAmmoCautelaId || linked);
                            if (!hasMun) return null;
                            const qty = cautela.ammoQuantity || linked?.quantity || 'N/I';
                            const dest = cautela.ammoDestinacao || linked?.destinacao || 'Defesa';
                            return (
                              <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
                                <div className="flex items-center space-x-2">
                                  <Disc className="w-4 h-4 text-amber-400 shrink-0" />
                                  <span>
                                    Munições Solicitadas: <strong>{qty} un.</strong> • Destinação: <strong>{dest}</strong>
                                    {linked?.seraDevolvida !== undefined && (
                                      <span className="text-[11px] text-slate-300 ml-2">
                                        ({linked.seraDevolvida ? 'Irá devolver depois' : 'Retirada permanente / baixa definitiva'})
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {linked?.status && (
                                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                                    linked.status === 'AUTORIZADA' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-900 text-slate-300 border-slate-700'
                                  }`}>
                                    Munição {linked.status}
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          {isReturned && (
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
                )
              )}
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
                <div className="flex items-center justify-between text-amber-300 pt-1 border-t border-slate-800/80">
                  <span>Munições Solicitadas:</span>
                  <strong>
                    {authorizingCautela.ammoQuantity || getLinkedAmmoForCautela(authorizingCautela)?.quantity || 30} unidades • Destinação: {authorizingCautela.ammoDestinacao || getLinkedAmmoForCautela(authorizingCautela)?.destinacao || 'Defesa'}
                  </strong>
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
                    required
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
                  disabled={isSubmitting || (availableAmmoForAuthorizingWeapon.length > 0 && !authStockId)}
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
