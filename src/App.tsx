import React, { useState, useEffect, useMemo } from 'react';
import { User, Department, Unit, VaultSpace, Caliber, AmmunitionStock, Weapon, Movement, AmmunitionMovement, ModuleType, getAllowedModulesForUser, getSystemLogo, DEFAULT_SYSTEM_LOGO } from './types';
import { storage } from './services/storage';
import { Navbar } from './components/BarraNavegacao';
import { Sidebar } from './components/BarraLateral';
import { MobileBottomNav } from './components/NavegacaoInferiorMobile';
import { useDeviceDetection } from './utils/deviceDetection';
import { LoginModal } from './components/ModalLogin';
import { ChangePasswordModal } from './components/ModalAlterarSenha';
import { ProfileModule } from './components/ModuloPerfil';
import { UnitModule } from './components/ModuloUnidades';
import { UserModule } from './components/ModuloUsuarios';
import { VaultModule } from './components/ModuloCofre';
import { AmmunitionModule } from './components/ModuloMunicao';
import { WeaponModule } from './components/ModuloArmas';
import { ModuloExplosivos } from './components/ModuloExplosivos';
import { MovementModule } from './components/ModuloMovimentacoes';
import { ReportModule } from './components/ModuloRelatorios';
import { MaterialModule } from './components/ModuloMateriais';
import { AcademyModule } from './components/ModuloAcademia';
import { CourseManagementModule } from './components/ModuloGerenciaCursos';
import { MobileClassModule } from './components/ModuloAulaMobile';
import { CalendarModule } from './components/ModuloCalendario';
import { CertificateVerificationModule } from './components/ModuloVerificacaoCertificados';
import { PublicCertificateValidator } from './components/ValidadorPublicoCertificado';
import { ModuloVeterinario } from './components/ModuloVeterinario';
import { ModuloCautelaArmas } from './components/ModuloCautelaArmas';
import { ModuloCautelaMunicoes } from './components/ModuloCautelaMunicoes';
import { ModuloCautelaMateriais } from './components/ModuloCautelaMateriais';
import { ModuloWhatsapp } from './components/ModuloWhatsapp';
import { PortalSessaoTemporariaWhatsapp } from './components/PortalSessaoTemporariaWhatsapp';
import { ManualModule } from './components/ModuloManual';
import { Shield, Users, Crosshair, Disc, Vault, ArrowRightLeft, FileText, AlertTriangle, Key, Activity, Clock, Bomb, Dog } from 'lucide-react';
import { formatTimestamp } from './utils/masks';
import { usePreloader } from './context/PreloaderContext';
import { showTopAlert } from './components/TopLayerAlert';

const moduleLabels: Record<ModuleType, string> = {
  'meu-perfil': 'Meu Perfil',
  'cautela-armas': 'Cautela de Armas',
  'cautela-municoes': 'Cautela de Munições',
  'cautela-materiais': 'Cautela de Materiais',
  'explosivos': 'Módulo de Explosivos',
  'armas': 'Módulo de Armas',
  'municoes': 'Módulo de Munições',
  'unidade': 'Unidades e Departamentos',
  'usuarios': 'Usuários',
  'cofre': 'Locais do Cofre',
  'movimentacoes': 'Movimentações Bélicas',
  'materiais': 'Módulo de Materiais',
  'iniciar-aula-mobile': 'Iniciar Aula',
  'cursos': 'Curso de Formação',
  'ensino-continuado': 'Ensino Continuado',
  'gerencia-cursos': 'Gerência de Cursos',
  'calendario': 'Calendário Curso de Formação',
  'certificados': 'Verificação de Certificados',
  'veterinario': 'CANIL',
  'relatorio': 'Relatórios e Consultas',
  'whatsapp': 'WhatsApp',
  'manual': 'Manual do Policial'
};

export default function App() {
  const { deviceInfo } = useDeviceDetection();
  const { showPreloader, hidePreloader, setLogoUrl } = usePreloader();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleType>('meu-perfil');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  // App domain state from storage service
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vaultSpaces, setVaultSpaces] = useState<VaultSpace[]>([]);
  const [calibers, setCalibers] = useState<Caliber[]>([]);
  const [ammoStocks, setAmmoStocks] = useState<AmmunitionStock[]>([]);
  const [ammoMovements, setAmmoMovements] = useState<AmmunitionMovement[]>([]);
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [courses, setCourses] = useState(storage.getCourses());

  // UI Modals
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [preselectedCautelaWeaponId, setPreselectedCautelaWeaponId] = useState<string | null>(null);
  const [preselectedAmmoLinkedWeaponCautelaId, setPreselectedAmmoLinkedWeaponCautelaId] = useState<string | null>(null);

  const [loginError, setLoginError] = useState('');
  const [dataSyncTick, setDataSyncTick] = useState(0);

  // Load all app data based on logged in user
  const refreshData = async () => {
    const active = storage.getCurrentUser();
    if (active) {
      await storage.refreshFromServer();
      const freshUser = storage.getCurrentUser();
      setCurrentUser(freshUser);

      setAllUsers(storage.getUsers(freshUser));
      setDepartments(storage.getDepartments(freshUser));
      setUnits(storage.getUnits(freshUser));
      setVaultSpaces(storage.getVaultSpaces(freshUser));
      setCalibers(storage.getCalibers());
      setAmmoStocks(storage.getAmmoStocks(freshUser));
      setAmmoMovements(storage.getAmmoMovements(freshUser));
      setWeapons(storage.getWeapons(freshUser));
      setMovements(storage.getMovements(freshUser));
      setCourses(storage.getCourses());
      setDataSyncTick(t => t + 1);
    } else {
      setCurrentUser(null);
    }
  };

  const isMobileUrlMode = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search;
    const path = window.location.pathname;
    return search.includes('mode=mobile-class') || search.includes('mobile=true') || path === '/iniciar-aula';
  }, []);

  const [publicValidationCode, setPublicValidationCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('validar') || params.get('codigo') || params.get('cert');
    if (code) return code;
    if (window.location.pathname === '/validar-certificado') return '';
    return null;
  });

  const [whatsappTempSessionToken, setWhatsappTempSessionToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('wpp_sessao');
    return token && token.trim() ? token.trim() : null;
  });

  useEffect(() => {
    if (isMobileUrlMode && currentUser?.role === 'Geral') {
      const allowed = getAllowedModulesForUser(currentUser);
      if (allowed.includes('iniciar-aula-mobile')) {
        setActiveModule('iniciar-aula-mobile');
      }
    }
  }, [isMobileUrlMode]);

  // Initial Boot Preloader
  useEffect(() => {
    const initApp = async () => {
      const taskId = showPreloader('Inicializando ARMARIA...', 'Carregando dados da Polícia Civil...', 'sync');
      try {
        await refreshData();
      } finally {
        setIsAppReady(true);
        hidePreloader(taskId);
      }
    };
    initApp();
  }, []);

  // Security guard: ensure active module is strictly accessible by current user's role
  useEffect(() => {
    if (!currentUser) return;
    const allowed = getAllowedModulesForUser(currentUser);
    if (!allowed.includes(activeModule)) {
      setActiveModule(allowed[0] || 'meu-perfil');
    }
  }, [currentUser, activeModule]);

  // "O usuário administrador não poderá movimentar armas, munições ou materiais, apenas cadastrar e visualizar."
  const effectiveUser = useMemo(() => {
    if (!currentUser) return null;
    const role = currentUser.activeRole || currentUser.role;
    if (role === 'Administrador' || (role as string) === 'Administrativo') {
      return {
        ...currentUser,
        role: 'Administrador' as const,
        activeRole: 'Administrador' as const,
        canMoveWeapons: false,
        canMoveAmmunition: false
      };
    }
    return currentUser;
  }, [currentUser]);

  const handleLoginSubmit = async (maspDigits: string, passwordInput: string, chosenRole?: string) => {
    setLoginError('');
    const taskId = showPreloader('Autenticando usuário no sistema...', 'Validando credenciais na base de dados da Polícia Civil...', 'auth');
    try {
      const res = await storage.login(maspDigits, passwordInput, chosenRole);
      if (!res.success || !res.user) {
        setLoginError(res.error || 'MASP ou senha incorretos.');
        return;
      }

      setCurrentUser(res.user);
      await refreshData();

      if (res.user.password === res.user.masp) {
        setShowChangePasswordModal(true);
      } else {
        setShowChangePasswordModal(false);
      }
    } finally {
      hidePreloader(taskId);
    }
  };

  const handleLogout = () => {
    const taskId = showPreloader('Encerrando sessão...', 'Finalizando acesso seguro...', 'auth');
    setTimeout(() => {
      storage.logout();
      setCurrentUser(null);
      setShowChangePasswordModal(false);
      setLoginError('');
      hidePreloader(taskId);
    }, 450);
  };

  const handleLocalFallbackLogin = (maspDigits: string) => {
    setLoginError('');
    const taskId = showPreloader('Acessando ambiente local...', 'Carregando perfil de emergência...', 'auth');
    try {
      const res = storage.loginLocalFallback(maspDigits);
      if (!res.success || !res.user) {
        setLoginError(res.error || 'MASP não encontrado no ambiente local.');
        return;
      }
      setCurrentUser(res.user);
      refreshData();
    } finally {
      hidePreloader(taskId);
    }
  };

  const readSignalSet = (storageKey: string): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set<string>(parsed.filter((v): v is string => typeof v === 'string'))
        : new Set<string>();
    } catch {
      return new Set<string>();
    }
  };

  const writeSignalSet = (storageKey: string, keys: Set<string>) => {
    try {
      const arr = Array.from(keys);
      const trimmed = arr.length > 1000 ? arr.slice(arr.length - 1000) : arr;
      localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {
      // ignore
    }
  };

  const ackStorageKey = effectiveUser ? `armaria_ack_cautela_signals_${effectiveUser.id}` : '';
  const toastStorageKey = effectiveUser ? `armaria_toasted_cautela_signals_${effectiveUser.id}` : '';

  const [acknowledgedSignalKeys, setAcknowledgedSignalKeys] = useState<Set<string>>(() =>
    ackStorageKey ? readSignalSet(ackStorageKey) : new Set<string>()
  );
  const [toastedSignalKeys, setToastedSignalKeys] = useState<Set<string>>(() =>
    toastStorageKey ? readSignalSet(toastStorageKey) : new Set<string>()
  );

  useEffect(() => {
    if (!ackStorageKey || !toastStorageKey) {
      setAcknowledgedSignalKeys(new Set<string>());
      setToastedSignalKeys(new Set<string>());
      return;
    }
    setAcknowledgedSignalKeys(readSignalSet(ackStorageKey));
    setToastedSignalKeys(readSignalSet(toastStorageKey));
  }, [ackStorageKey, toastStorageKey]);

  const isArmeiroUser = effectiveUser?.role === 'Armeiro' || effectiveUser?.activeRole === 'Armeiro';
  const isGeralUser = effectiveUser?.role === 'Geral' || effectiveUser?.activeRole === 'Geral';

  const isRequesterSelfMatch = (requesterId?: string, requesterMasp?: string, requesterName?: string) => {
    if (!effectiveUser) return false;
    if (requesterId && requesterId === effectiveUser.id) return true;
    if (requesterMasp && effectiveUser.masp && requesterMasp.trim().toLowerCase() === effectiveUser.masp.trim().toLowerCase()) return true;
    const userMaspClean = (effectiveUser.masp || '').replace(/\D/g, '');
    const reqClean = (requesterMasp || '').replace(/\D/g, '');
    if (userMaspClean && reqClean && userMaspClean === reqClean) return true;
    const userNorm = (effectiveUser.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const reqNorm = (requesterName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (userNorm && reqNorm && (userNorm === reqNorm || userNorm.includes(reqNorm) || reqNorm.includes(userNorm))) return true;
    return false;
  };

  const movementSignalKeys = useMemo(() => {
    return movements
      .filter(m => m.status === 'Pendente Aprovação' || m.status === 'Pendente Recibo')
      .map(m => `movimentacoes:${m.id}:${m.status}`);
  }, [movements]);
  const pendingMovementsCount = useMemo(
    () => movementSignalKeys.filter(k => !acknowledgedSignalKeys.has(k)).length,
    [movementSignalKeys, acknowledgedSignalKeys]
  );

  const weaponSignalKeys = useMemo(() => {
    const list = storage.getCautelasArmas();
    if (isGeralUser) {
      return list
        .filter(c => c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE')
        .map(c => `cautela-armas:${c.id}:${c.status}`);
    }
    if (isArmeiroUser && effectiveUser) {
      const deptUnits = new Set(
        storage.getAllUnits()
          .filter(u => u.departmentId === effectiveUser.departmentId)
          .map(u => u.id)
      );
      return list
        .filter(c =>
          (c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE') &&
          (effectiveUser.managementScope === 'department'
            ? (c.departmentId === effectiveUser.departmentId || (c.unitId ? deptUnits.has(c.unitId) : false))
            : c.unitId === effectiveUser.unitId)
        )
        .map(c => `cautela-armas:${c.id}:${c.status}`);
    }
    if (effectiveUser) {
      return list
        .filter(c =>
          (c.status === 'AUTORIZADA' || c.status === 'RECUSADA') &&
          c.armorerId !== effectiveUser.id &&
          isRequesterSelfMatch(c.requesterId, c.requesterMasp, c.requesterName)
        )
        .map(c => `cautela-armas:${c.id}:${c.status}`);
    }
    return [];
  }, [effectiveUser, isArmeiroUser, isGeralUser, dataSyncTick]);
  const pendingWeaponCautelasCount = useMemo(
    () => weaponSignalKeys.filter(k => !acknowledgedSignalKeys.has(k)).length,
    [weaponSignalKeys, acknowledgedSignalKeys]
  );

  const ammoSignalKeys = useMemo(() => {
    const list = storage.getCautelasMunicoes().filter(c => Number(c.quantity || 0) > 0);
    if (isGeralUser) {
      return list
        .filter(c => c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE')
        .map(c => `cautela-municoes:${c.id}:${c.status}`);
    }
    if (isArmeiroUser && effectiveUser) {
      const deptUnits = new Set(
        storage.getAllUnits()
          .filter(u => u.departmentId === effectiveUser.departmentId)
          .map(u => u.id)
      );
      return list
        .filter(c =>
          (c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE') &&
          (effectiveUser.managementScope === 'department'
            ? (c.departmentId === effectiveUser.departmentId || (c.unitId ? deptUnits.has(c.unitId) : false))
            : c.unitId === effectiveUser.unitId)
        )
        .map(c => `cautela-municoes:${c.id}:${c.status}`);
    }
    if (effectiveUser) {
      return list
        .filter(c =>
          (c.status === 'AUTORIZADA' || c.status === 'RECUSADA') &&
          c.armorerId !== effectiveUser.id &&
          isRequesterSelfMatch(c.requesterId, c.requesterMasp, c.requesterName)
        )
        .map(c => `cautela-municoes:${c.id}:${c.status}`);
    }
    return [];
  }, [effectiveUser, isArmeiroUser, isGeralUser, dataSyncTick]);
  const pendingAmmoCautelasCount = useMemo(
    () => ammoSignalKeys.filter(k => !acknowledgedSignalKeys.has(k)).length,
    [ammoSignalKeys, acknowledgedSignalKeys]
  );

  const materialSignalKeys = useMemo(() => {
    const list = storage.getCautelasMateriais();
    if (isGeralUser) {
      return list
        .filter(c => c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE')
        .map(c => `cautela-materiais:${c.id}:${c.status}`);
    }
    if (isArmeiroUser && effectiveUser) {
      const deptUnits = new Set(
        storage.getAllUnits()
          .filter(u => u.departmentId === effectiveUser.departmentId)
          .map(u => u.id)
      );
      return list
        .filter(c =>
          (c.status === 'PENDENTE' || c.status === 'DEVOLUCAO_PENDENTE') &&
          (effectiveUser.managementScope === 'department'
            ? (c.departamentoId === effectiveUser.departmentId || (c.unidadeId ? deptUnits.has(c.unidadeId) : false))
            : c.unidadeId === effectiveUser.unitId)
        )
        .map(c => `cautela-materiais:${c.id}:${c.status}`);
    }
    if (effectiveUser) {
      return list
        .filter(c =>
          (c.status === 'AUTORIZADA' || c.status === 'Em Uso' || c.status === 'RECUSADA') &&
          c.responsavelEntregaId !== effectiveUser.id &&
          isRequesterSelfMatch(c.usuarioInternoId, c.usuarioInternoMasp, c.usuarioInternoNome)
        )
        .map(c => `cautela-materiais:${c.id}:${c.status}`);
    }
    return [];
  }, [effectiveUser, isArmeiroUser, isGeralUser, dataSyncTick]);
  const pendingMaterialCautelasCount = useMemo(
    () => materialSignalKeys.filter(k => !acknowledgedSignalKeys.has(k)).length,
    [materialSignalKeys, acknowledgedSignalKeys]
  );

  const readyReceiptSignalKeys = useMemo(() => {
    if (!effectiveUser) return [];
    const armasAutorizadas = storage
      .getCautelasArmas()
      .filter(c => isRequesterSelfMatch(c.requesterId, c.requesterMasp, c.requesterName) && c.status === 'AUTORIZADA')
      .map(c => `meu-perfil:arma:${c.id}:${c.status}`);
    const municoesAutorizadas = storage
      .getCautelasMunicoes()
      .filter(c => Number(c.quantity || 0) > 0 && isRequesterSelfMatch(c.requesterId, c.requesterMasp, c.requesterName) && c.status === 'AUTORIZADA')
      .map(c => `meu-perfil:municao:${c.id}:${c.status}`);
    const materiaisAutorizadas = storage
      .getCautelasMateriais()
      .filter(c => isRequesterSelfMatch(c.usuarioInternoId, c.usuarioInternoMasp, c.usuarioInternoNome) && (c.status === 'AUTORIZADA' || c.status === 'Em Uso'))
      .map(c => `meu-perfil:material:${c.id}:${c.status}`);
    return [...armasAutorizadas, ...municoesAutorizadas, ...materiaisAutorizadas];
  }, [effectiveUser, dataSyncTick]);
  const readyReceiptsCount = useMemo(
    () => readyReceiptSignalKeys.filter(k => !acknowledgedSignalKeys.has(k)).length,
    [readyReceiptSignalKeys, acknowledgedSignalKeys]
  );

  const markKeysAcknowledged = (keysToAck: string[]) => {
    if (!ackStorageKey || keysToAck.length === 0) return;
    setAcknowledgedSignalKeys(prev => {
      const hasNew = keysToAck.some(k => !prev.has(k));
      if (!hasNew) return prev;
      const next = new Set<string>(prev);
      keysToAck.forEach(k => next.add(k));
      writeSignalSet(ackStorageKey, next);
      return next;
    });
  };

  const markKeysToasted = (keysToMark: string[]) => {
    if (!toastStorageKey || keysToMark.length === 0) return;
    setToastedSignalKeys(prev => {
      const hasNew = keysToMark.some(k => !prev.has(k));
      if (!hasNew) return prev;
      const next = new Set<string>(prev);
      keysToMark.forEach(k => next.add(k));
      writeSignalSet(toastStorageKey, next);
      return next;
    });
  };

  // Quando o usuário entra diretamente em um dos módulos de cautela/movimentações, silencia imediatamente sua sinalização e toast
  useEffect(() => {
    if (!effectiveUser) return;
    if (activeModule === 'cautela-armas' && weaponSignalKeys.length > 0) {
      markKeysAcknowledged(weaponSignalKeys);
      markKeysToasted(weaponSignalKeys);
    } else if (activeModule === 'cautela-municoes' && ammoSignalKeys.length > 0) {
      markKeysAcknowledged(ammoSignalKeys);
      markKeysToasted(ammoSignalKeys);
    } else if (activeModule === 'cautela-materiais' && materialSignalKeys.length > 0) {
      markKeysAcknowledged(materialSignalKeys);
      markKeysToasted(materialSignalKeys);
    } else if (activeModule === 'movimentacoes' && movementSignalKeys.length > 0) {
      markKeysAcknowledged(movementSignalKeys);
    }
  }, [activeModule, effectiveUser, weaponSignalKeys, ammoSignalKeys, materialSignalKeys, movementSignalKeys]);

  // A sinalização de atividade nos módulos desaparece automaticamente após 3 segundos e é persistida para não repetir
  useEffect(() => {
    if (!effectiveUser || !isAppReady) return;

    const unackedKeys = [
      ...weaponSignalKeys,
      ...ammoSignalKeys,
      ...materialSignalKeys,
      ...movementSignalKeys,
      ...readyReceiptSignalKeys
    ].filter(k => !acknowledgedSignalKeys.has(k));

    if (unackedKeys.length === 0) return;

    const timer = setTimeout(() => {
      markKeysAcknowledged(unackedKeys);
    }, 3000);

    return () => clearTimeout(timer);
  }, [
    effectiveUser,
    isAppReady,
    weaponSignalKeys,
    ammoSignalKeys,
    materialSignalKeys,
    movementSignalKeys,
    readyReceiptSignalKeys,
    acknowledgedSignalKeys
  ]);

  // Exibe notificação de atividade em tela por 5 segundos apenas uma única vez para cada nova atividade em cautela de armas, munições e materiais
  useEffect(() => {
    if (!effectiveUser || !isAppReady) return;

    const newWeaponKeys = activeModule !== 'cautela-armas'
      ? weaponSignalKeys.filter(k => !toastedSignalKeys.has(k) && !acknowledgedSignalKeys.has(k))
      : [];
    const newAmmoKeys = activeModule !== 'cautela-municoes'
      ? ammoSignalKeys.filter(k => !toastedSignalKeys.has(k) && !acknowledgedSignalKeys.has(k))
      : [];
    const newMaterialKeys = activeModule !== 'cautela-materiais'
      ? materialSignalKeys.filter(k => !toastedSignalKeys.has(k) && !acknowledgedSignalKeys.has(k))
      : [];

    const allNewKeys = [...newWeaponKeys, ...newAmmoKeys, ...newMaterialKeys];
    if (allNewKeys.length === 0) return;

    const parts: string[] = [];
    if (newWeaponKeys.length > 0) {
      parts.push(`Cautela de Armas (${newWeaponKeys.length})`);
    }
    if (newAmmoKeys.length > 0) {
      parts.push(`Cautela de Munições (${newAmmoKeys.length})`);
    }
    if (newMaterialKeys.length > 0) {
      parts.push(`Cautela de Materiais (${newMaterialKeys.length})`);
    }

    if (parts.length > 0) {
      showTopAlert(
        `Nova atividade registrada em: ${parts.join(', ')}.`,
        'info',
        'Notificação de Atividade em Cautela',
        5000
      );
      markKeysToasted(allNewKeys);
    }
  }, [effectiveUser, isAppReady, activeModule, weaponSignalKeys, ammoSignalKeys, materialSignalKeys, toastedSignalKeys, acknowledgedSignalKeys]);

  const handleSelectModule = (mod: ModuleType) => {
    // Ao clicar no módulo, registra as chaves atuais como visualizadas permanentemente para sinalizar apenas uma vez
    if (mod === 'cautela-armas') {
      markKeysAcknowledged(weaponSignalKeys);
      markKeysToasted(weaponSignalKeys);
    } else if (mod === 'cautela-municoes') {
      markKeysAcknowledged(ammoSignalKeys);
      markKeysToasted(ammoSignalKeys);
    } else if (mod === 'cautela-materiais') {
      markKeysAcknowledged(materialSignalKeys);
      markKeysToasted(materialSignalKeys);
    } else if (mod === 'movimentacoes') {
      markKeysAcknowledged(movementSignalKeys);
    } else if (mod === 'meu-perfil') {
      markKeysAcknowledged(readyReceiptSignalKeys);
    }

    if (mod === activeModule) {
      setIsMobileMenuOpen(false);
      return;
    }
    setActiveModule(mod);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const userDepartment = currentUser?.departmentId 
    ? (departments.find(d => d.id === currentUser.departmentId) || storage.getAllDepartments().find(d => d.id === currentUser.departmentId) || null)
    : null;
  const userUnit = currentUser?.unitId 
    ? (units.find(u => u.id === currentUser.unitId) || storage.getAllUnits().find(u => u.id === currentUser.unitId) || null)
    : null;
  const currentLogo = getSystemLogo(userUnit, userDepartment);

  // Sincroniza logo ativa com o preloader
  useEffect(() => {
    setLogoUrl(currentLogo);
  }, [currentLogo, setLogoUrl]);

  // Se a aplicação ainda estiver inicializando os dados pela primeira vez, exibe preloader completo
  if (!isAppReady) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-x-clip font-sans">
        <div className="text-center max-w-sm w-full space-y-6">
          <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-500/40 border-t-amber-400 animate-spin-slow" />
            <div className="absolute inset-2 rounded-full border-2 border-cyan-500/40 border-b-cyan-400 animate-spin-reverse" />
            <div className="relative w-20 h-20 rounded-full bg-slate-950 p-1.5 shadow-2xl border border-amber-500/50 flex items-center justify-center overflow-hidden">
              <img
                src={DEFAULT_SYSTEM_LOGO}
                alt="Polícia Civil de Minas Gerais"
                className="w-full h-full object-contain filter drop-shadow-md"
              />
            </div>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
              POLÍCIA CIVIL DE MINAS GERAIS
            </span>
            <h1 className="text-2xl font-black text-slate-100 font-mono tracking-wider mt-3">ARMARIA</h1>
            <p className="text-xs text-slate-400 mt-1">Carregando acervo bélico e inicializando sistema...</p>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-300 to-cyan-500 animate-indeterminate shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
          </div>
        </div>
      </div>
    );
  }

  // Se acessando via link temporário gerado pelo WhatsApp (Solicitar / Devolver Cautelas)
  if (whatsappTempSessionToken) {
    return (
      <PortalSessaoTemporariaWhatsapp
        token={whatsappTempSessionToken}
        onExitToApp={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setWhatsappTempSessionToken(null);
          refreshData();
        }}
      />
    );
  }

  // If opening via QR Code scan or direct validation URL, show public certificate validator
  if (publicValidationCode !== null) {
    return (
      <PublicCertificateValidator
        initialCode={publicValidationCode}
        onBackToApp={() => {
          // Clear query param and return to main app view
          window.history.replaceState({}, document.title, window.location.pathname);
          setPublicValidationCode(null);
        }}
      />
    );
  }

  if (!currentUser) {
    if (isMobileUrlMode) {
      return (
        <div className="min-h-[100dvh] bg-slate-950 text-slate-100 font-sans">
          <MobileClassModule
            currentUser={({ id: 'temp-mobile', masp: '', name: 'Instrutor', role: 'Armeiro', cargo: 'Inspetor de Polícia' } as unknown as User)}
            onRefresh={refreshData}
          />
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-x-clip">
        <LoginModal
          onLoginSuccess={handleLoginSubmit}
          onLocalFallbackLogin={handleLocalFallbackLogin}
          error={loginError}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Top Navigation */}
      <Navbar
        currentUser={effectiveUser}
        onLogout={handleLogout}
        onChangePasswordClick={() => setShowChangePasswordModal(true)}
        onUserSwitched={refreshData}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        logoUrl={currentLogo}
        departmentName={userDepartment?.name}
        unitName={userUnit?.name}
      />

      <div className="flex-1 flex min-h-0 min-w-0 overflow-x-clip relative">
        
        {/* Sidebar Navigation (Desktop & Mobile Drawer) */}
        <Sidebar
          currentUser={effectiveUser}
          departments={departments}
          activeModule={activeModule}
          onSelectModule={handleSelectModule}
          pendingMovementsCount={pendingMovementsCount}
          pendingWeaponCautelasCount={pendingWeaponCautelasCount}
          pendingAmmoCautelasCount={pendingAmmoCautelasCount}
          pendingMaterialCautelasCount={pendingMaterialCautelasCount}
          readyReceiptsCount={readyReceiptsCount}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Main Workspace */}
        <main className="flex-1 p-3 sm:p-6 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-6 overflow-y-auto max-w-[1700px] mx-auto w-full min-w-0 min-h-0 space-y-4 sm:space-y-6">
          
          {/* Dashboard Summary Cards (Oculto nos módulos especificados a pedido) */}
          {!['explosivos', 'meu-perfil', 'cautela-armas', 'cautela-municoes', 'cautela-materiais', 'armas', 'municoes', 'movimentacoes', 'unidade', 'usuarios', 'cofre', 'materiais', 'manual', 'cursos', 'calendario', 'veterinario', 'relatorio', 'whatsapp'].includes(activeModule) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 print:hidden">
              <div className="glass-card hover:border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 transition-all">
                <div className="p-2 sm:p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
                  <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono block truncate">Armas em Acervo</span>
                  <p className="text-lg sm:text-xl font-black text-slate-100 font-mono">{weapons.length}</p>
                </div>
              </div>

              <div className="glass-card hover:border-cyan-500/40 rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 transition-all">
                <div className="p-2 sm:p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20 shrink-0 flex items-center justify-center">
                  <Disc className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono block truncate">Munições em Estoque</span>
                  <p className="text-lg sm:text-xl font-black text-slate-100 font-mono truncate">
                    {ammoStocks.reduce((acc, curr) => acc + curr.quantity, 0)} <span className="text-xs text-slate-400 font-normal">un</span>
                  </p>
                </div>
              </div>

              <div className="glass-card hover:border-purple-500/40 rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 transition-all">
                <div className="p-2 sm:p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 shrink-0">
                  <ArrowRightLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono block truncate">Em Trânsito</span>
                  <p className="text-lg sm:text-xl font-black text-amber-400 font-mono">
                    {weapons.filter(w => w.status === 'Em Trânsito').length}
                  </p>
                </div>
              </div>

              <div className="glass-card hover:border-emerald-500/40 rounded-2xl p-3.5 sm:p-4 flex items-center space-x-3.5 transition-all">
                <div className="p-2 sm:p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
                  <Vault className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-semibold tracking-wider font-mono block truncate">No Cofre</span>
                  <p className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
                    {weapons.filter(w => w.status === 'No Cofre').length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Module Views */}
          {activeModule === 'meu-perfil' && currentUser && (
            <ProfileModule
              currentUser={currentUser}
              user={currentUser}
              departments={departments}
              units={units}
              allCourses={courses}
              onUserUpdated={refreshData}
              onRefresh={refreshData}
              onChangePasswordClick={() => setShowChangePasswordModal(true)}
              onNavigateToModule={setActiveModule}
            />
          )}

          {activeModule === 'cautela-armas' && effectiveUser && (
            <ModuloCautelaArmas
              currentUser={effectiveUser}
              weapons={weapons}
              ammoStocks={ammoStocks}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
              units={units}
              departments={departments}
              preselectedWeaponId={preselectedCautelaWeaponId}
              onClearPreselectedWeapon={() => setPreselectedCautelaWeaponId(null)}
              onStartLinkedAmmoCautela={
                getAllowedModulesForUser(effectiveUser).includes('cautela-municoes')
                  ? (cautela) => {
                      setPreselectedAmmoLinkedWeaponCautelaId(cautela.id);
                      setActiveModule('cautela-municoes');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  : undefined
              }
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'cautela-municoes' && effectiveUser && (
            <ModuloCautelaMunicoes
              currentUser={effectiveUser}
              weapons={weapons}
              ammoStocks={ammoStocks}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
              units={units}
              departments={departments}
              preselectedLinkedWeaponCautelaId={preselectedAmmoLinkedWeaponCautelaId}
              onClearPreselectedLinkedWeaponCautela={() => setPreselectedAmmoLinkedWeaponCautelaId(null)}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'cautela-materiais' && effectiveUser && (
            <ModuloCautelaMateriais
              currentUser={effectiveUser}
              vaultSpaces={vaultSpaces}
              units={units}
              departments={departments}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'unidade' && effectiveUser && (
            <UnitModule
              currentUser={effectiveUser}
              departments={departments}
              units={units}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'usuarios' && effectiveUser && (
            <UserModule
              currentUser={effectiveUser}
              users={allUsers}
              departments={departments}
              units={units}
              courses={courses}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'cofre' && effectiveUser && (
            <VaultModule
              currentUser={effectiveUser}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'municoes' && effectiveUser && (
            <AmmunitionModule
              currentUser={effectiveUser}
              calibers={calibers}
              stocks={ammoStocks}
              movements={ammoMovements}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              users={allUsers}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'armas' && effectiveUser && (
            <WeaponModule
              currentUser={effectiveUser}
              weapons={weapons}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              onStartCautela={
                getAllowedModulesForUser(effectiveUser).includes('cautela-armas')
                  ? (weapon) => {
                      setPreselectedCautelaWeaponId(weapon.id);
                      setActiveModule('cautela-armas');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  : undefined
              }
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'explosivos' && effectiveUser && (
            <ModuloExplosivos
              currentUser={effectiveUser}
              departments={departments}
              units={units}
              vaultSpaces={vaultSpaces}
              users={allUsers}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'movimentacoes' && effectiveUser && (
            <MovementModule
              currentUser={effectiveUser}
              movements={movements}
              weapons={weapons}
              vaultSpaces={vaultSpaces}
              courses={courses}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'materiais' && effectiveUser && getAllowedModulesForUser(effectiveUser).includes('materiais') && (
            <MaterialModule
              currentUser={effectiveUser}
              departments={departments}
              units={units}
              allUsers={allUsers}
              vaultSpaces={vaultSpaces}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'cursos' && (
            <AcademyModule
              currentUser={currentUser}
              users={storage.getUsersForFormacao(currentUser)}
              weapons={weapons}
              ammoStocks={ammoStocks}
              vaultSpaces={vaultSpaces}
              departments={storage.getAllDepartments()}
              units={storage.getAllUnits()}
              onRefresh={refreshData}
              courseTypeFilterProp="Formação"
            />
          )}

          {activeModule === 'ensino-continuado' && (
            <AcademyModule
              currentUser={currentUser}
              users={allUsers}
              weapons={weapons}
              ammoStocks={ammoStocks}
              vaultSpaces={vaultSpaces}
              departments={departments}
              units={units}
              onRefresh={refreshData}
              courseTypeFilterProp="Ensino Continuado"
            />
          )}

          {activeModule === 'gerencia-cursos' && (
            <CourseManagementModule
              currentUser={currentUser}
              weapons={weapons}
              departments={departments}
              units={units}
              calibers={calibers}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'calendario' && getAllowedModulesForUser(currentUser).includes('calendario') && (
            <CalendarModule
              currentUser={currentUser}
            />
          )}

          {activeModule === 'certificados' && currentUser?.role === 'Geral' && (
            <CertificateVerificationModule
              currentUser={currentUser}
            />
          )}

          {activeModule === 'iniciar-aula-mobile' && (currentUser?.role === 'Geral' || Boolean(currentUser?.isCourseCoordinator)) && (
            <MobileClassModule
              currentUser={currentUser}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'veterinario' && (
            <ModuloVeterinario
              currentUser={effectiveUser}
              departments={departments}
              units={units}
              allUsers={allUsers}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'relatorio' && effectiveUser && (
            <ReportModule
              currentUser={effectiveUser}
              movements={movements}
              ammoMovements={ammoMovements}
              departments={departments}
              units={units}
              calibers={calibers}
              weapons={weapons}
              users={allUsers}
              vaultSpaces={vaultSpaces}
              onRefresh={refreshData}
            />
          )}

          {activeModule === 'whatsapp' && effectiveUser && getAllowedModulesForUser(effectiveUser).includes('whatsapp') && (
            <ModuloWhatsapp
              currentUser={effectiveUser}
              allUsers={allUsers}
            />
          )}

          {activeModule === 'manual' && effectiveUser && (
            <ManualModule
              currentUser={effectiveUser}
              departments={departments}
              units={units}
              users={allUsers}
              weapons={weapons}
              ammoStocks={ammoStocks}
              calibers={calibers}
              vaultSpaces={vaultSpaces}
            />
          )}

          {/* Footer Bar with Audit Log Trigger */}
          <footer className="pt-6 border-t border-slate-800 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 print:hidden">
            <div>
              Polícia Civil • <strong className="text-slate-400">Armeria</strong> v2.0
            </div>

            <button
              onClick={() => setShowAuditModal(true)}
              className="text-slate-400 hover:text-amber-400 font-mono text-[11px] flex items-center space-x-1 transition"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Ver Trilha de Auditoria (Logs do Sistema)</span>
            </button>
          </footer>

        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {deviceInfo.isMobile && effectiveUser && (
        <MobileBottomNav
          currentUser={effectiveUser}
          activeModule={activeModule}
          onSelectModule={handleSelectModule}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          pendingMovementsCount={pendingMovementsCount}
          pendingWeaponCautelasCount={pendingWeaponCautelasCount}
          pendingAmmoCautelasCount={pendingAmmoCautelasCount}
          pendingMaterialCautelasCount={pendingMaterialCautelasCount}
        />
      )}

      {/* Change Password Modal */}
      {(showChangePasswordModal || currentUser.password === currentUser.masp || currentUser.mustChangePassword) && currentUser && (
        <ChangePasswordModal
          user={currentUser}
          isMandatory={currentUser.password === currentUser.masp || currentUser.mustChangePassword}
          onSuccess={() => {
            setShowChangePasswordModal(false);
            refreshData();
          }}
          onCancel={
            (currentUser.password === currentUser.masp || currentUser.mustChangePassword)
              ? handleLogout
              : () => setShowChangePasswordModal(false)
          }
        />
      )}

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="print:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Activity className="w-5 h-5 text-amber-400" />
                <span>Trilha de Auditoria do Sistema</span>
              </h3>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {storage.getAuditLogs().length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">Nenhum log registrado.</p>
              ) : (
                storage.getAuditLogs().map((log) => (
                  <div key={log.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between font-mono text-[10px]">
                      <span className="text-amber-400 font-bold">{log.userName} (MASP: {log.userMasp})</span>
                      <span className="text-slate-500">{formatTimestamp(log.timestamp)}</span>
                    </div>
                    <p className="font-semibold text-slate-200">{log.action}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

