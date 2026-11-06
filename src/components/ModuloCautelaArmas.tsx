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
import { isCourseExpired } from '../utils/masks';
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
  const isGeral = currentUser.role === 'Geral';
  const isArmeiro = currentUser.role === 'Armeiro';
  const isAdmin = currentUser.role === 'Administrador';
  const canAuthorize = isGeral || isArmeiro;

  // Tabs
  const [activeTab, setActiveTab] = useState<'MINHAS' | 'PENDENTES' | 'TODAS' | 'NOVA'>(
    canAuthorize ? 'PENDENTES' : 'MINHAS'
  );

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
  const [ammoType, setAmmoType] = useState('Operacional');
  const [ammoLot, setAmmoLot] = useState('Lote Unidade');
  const [ammoSeraDevolvida, setAmmoSeraDevolvida] = useState(true);

  // Armorer Direct Cautela State (Acautelar para policial sem solicitação prévia)
  const [isDirectCautela, setIsDirectCautela] = useState(false);
  const [targetOfficerId, setTargetOfficerId] = useState('');
  const [selectedAmmoStockId, setSelectedAmmoStockId] = useState('');

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
    return ammoStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === targetUnitId);
      const cal = calibers.find(c => c.id === st.caliberId);
      const matchCaliber = (cal && cal.name.toLowerCase() === selectedWeapon.caliber.toLowerCase()) ||
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
    if (currentUser.role === 'Policial') {
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
  }, [allCautelas, currentUser, isArmeiro, statusFilter, searchTerm]);

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

  // Armas disponíveis na unidade do usuário que ele é qualificado para manusear
  const userUnitWeapons = useMemo(() => {
    const userUnitId = currentUser.unitId;
    // Armas na mesma unidade e que estejam "No Cofre"
    let available = weapons.filter(w => {
      const sameUnit = isGeral ? true : (w.unitId === userUnitId);
      return sameUnit && (w.status === 'No Cofre' || !w.status);
    });

    // Se policial, filtrar pelas armas autorizadas pelos seus cursos válidos (< 2 anos)
    if (currentUser.role === 'Policial') {
      const userCourses = currentUser.courses || [];
      const coursesDefs = storage.getCourses();

      // Checa modelos e tipos permitidos pelos cursos não expirados
      const allowedModels = new Set<string>();
      const allowedTypes = new Set<string>();

      userCourses.forEach(uc => {
        if (!isCourseExpired(uc.completionDate)) {
          const cDef = coursesDefs.find(c => c.id === uc.courseId);
          if (cDef) {
            cDef.allowedModels?.forEach(m => allowedModels.add(m.trim().toUpperCase()));
            cDef.allowedWeaponTypes?.forEach(t => allowedTypes.add(t.trim().toUpperCase()));
          }
        }
      });

      // Se tiver cursos cadastrados, filtra por eles; caso não haja restrição estrita de cursos, permite armas convencionais
      if (allowedModels.size > 0 || allowedTypes.size > 0) {
        available = available.filter(w => 
          allowedModels.has((w.model || '').trim().toUpperCase()) ||
          allowedTypes.has((w.type || '').trim().toUpperCase())
        );
      }
    }

    return available;
  }, [weapons, currentUser, isGeral]);


  const availableAmmoInUnit = useMemo(() => {
    if (!selectedWeapon) return [];
    return ammoStocks.filter(st => {
      const matchUnit = isGeral ? true : (st.unitId === currentUser.unitId);
      const cal = calibers.find(c => c.id === st.caliberId);
      const matchCaliber = cal && selectedWeapon.caliber && cal.name.toLowerCase().includes(selectedWeapon.caliber.toLowerCase());
      return matchUnit && (matchCaliber || st.quantity > 0);
    });
  }, [selectedWeapon, ammoStocks, calibers, currentUser.unitId, isGeral]);

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

      if (requestAmmoTogether && Number(ammoQuantity) >= 0) {
        payload.ammunition = {
          caliberName: weapon.caliber,
          quantity: Number(ammoQuantity) || 0,
          tipoMunicao: ammoType,
          loteMunicao: ammoLot,
          vaultSpaceId: weapon.vaultSpaceId,
          reason: `Acautelamento em conjunto com ${weapon.model} Nº ${weapon.serialNumber}`,
          seraDevolvida: ammoSeraDevolvida
        };
      }

      const res = await storage.requestCautelaArma(payload);
      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao registrar solicitação de cautela.');
      } else {
        if (isDirect) {
          setSuccessMsg(`Arma ${weapon.model} (Série: ${weapon.serialNumber}) acautelada com sucesso para o policial ${beneficiary.name}! O recibo de cautela já pode ser impresso.`);
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

  // Autorizar Cautela (Armeiro)
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
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
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
                Visualização filtrada das armas disponíveis na sua unidade que você está habilitado a manusear.
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
                    <span className="text-[10px] text-slate-400 font-mono">Gera autorização e recibo imediatos</span>
                  </div>

                  {isDirectCautela && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Selecione o Policial Beneficiário (Responsável pela Cautela) <span className="text-amber-400">*</span>
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
                  1. Selecione a Arma Disponível na Unidade ({userUnitWeapons.length} aptas)
                </label>
                {userUnitWeapons.length === 0 ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                    Não há armas disponíveis no cofre da sua unidade ou você não possui habilitação ativa (válida por até 2 anos) para os armamentos cadastrados.
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
                          Quantidade de Munições (pode ser 0)
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
                          Tipo de Munição
                        </label>
                        <input
                          type="text"
                          value={ammoType}
                          onChange={(e) => setAmmoType(e.target.value)}
                          placeholder="Ex: ETOG, EXPO, Operacional..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                          Lote da Munição
                        </label>
                        <input
                          type="text"
                          value={ammoLot}
                          onChange={(e) => setAmmoLot(e.target.value)}
                          placeholder="Lote..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <input
                        type="checkbox"
                        id="seraDevolvidaCheck"
                        checked={ammoSeraDevolvida}
                        onChange={(e) => setAmmoSeraDevolvida(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700"
                      />
                      <label htmlFor="seraDevolvidaCheck" className="text-[11px] text-slate-300">
                        Munições serão devolvidas se não deflagradas (caso contrário serão dadas como consumo)
                      </label>
                    </div>
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

                  {/* Seção 2: Histórico de Cautelas Devolvidas / Encerradas */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Histórico de Cautelas Devolvidas / Encerradas
                        </h4>
                      </div>
                      <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        {scopedCautelas.filter(c => c.status !== 'AUTORIZADA').length} registro(s)
                      </span>
                    </div>

                    {scopedCautelas.filter(c => c.status !== 'AUTORIZADA').length === 0 ? (
                      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        Nenhum histórico anterior registrado.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {scopedCautelas.filter(c => c.status !== 'AUTORIZADA').map(cautela => {
                          const isPending = cautela.status === 'PENDENTE';
                          const isReturned = cautela.status === 'DEVOLVIDA';
                          const vault = vaultSpaces.find(v => v.id === cautela.vaultSpaceId);

                          return (
                            <div
                              key={cautela.id}
                              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition space-y-3 opacity-90"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                <div className="flex items-center space-x-3">
                                  <div className={`p-2.5 rounded-xl border ${
                                    isPending
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
                                        isPending
                                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                                          : isReturned
                                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                                          : 'bg-red-500/20 text-red-300 border-red-500/30'
                                      }`}>
                                        {cautela.status}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Solicitante: <strong className="text-slate-200">{cautela.requesterName}</strong> (MASP: {cautela.requesterMasp})
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 self-end sm:self-center">
                                  {isReturned && (
                                    <button
                                      onClick={() => handlePrintTermo(cautela)}
                                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                                      title="Imprimir Termo de Devolução de Armamento"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Imprimir Termo</span>
                                    </button>
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
                                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">Armeiro</span>
                                  <span className="text-slate-200 font-semibold truncate block">
                                    {cautela.armorerName ? `${cautela.armorerName} (${cautela.armorerMasp})` : 'N/A'}
                                  </span>
                                </div>
                              </div>

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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Aba PENDENTES ou TODAS */
                <div className="grid grid-cols-1 gap-3">
                  {scopedCautelas.map(cautela => {
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
                                  onClick={() => handleAuthorize(cautela.id)}
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
