import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { User, UserRole, UserCargo, Department, Unit, Course, UserCourse } from '../types';
import { formatMasp, formatPhone, cleanMasp, cleanPhone, isCourseExpired, formatDisplayDate } from '../utils/masks';
import { storage } from '../services/storage';
import { Users, Plus, Edit2, Trash2, GraduationCap, AlertCircle, Check, Shield, Search, Calendar, AlertTriangle, KeyRound, Building, Building2, ChevronRight, ArrowLeft, Filter, Lock, FileSpreadsheet, Upload, Download, X } from 'lucide-react';
import { ConfirmDeleteModal } from './ModalConfirmarExclusao';

interface ParsedExcelUserRow {
  rowIndex: number;
  name: string;
  masp: string;
  cargo: string;
  rawUnitName: string;
  matchedUnitId: string;
  matchedUnitName: string;
  alreadyRegistered: boolean;
  existingSystemName?: string;
}

interface ExcelImportResult {
  importedCount: number;
  alreadyRegisteredCount: number;
  alreadyRegisteredUsers: Array<{
    name: string;
    existingName: string;
    masp: string;
    cargo: string;
    unitName: string;
  }>;
}

interface UserModuleProps {
  currentUser: User;
  users: User[];
  departments: Department[];
  units: Unit[];
  courses: Course[];
  onRefresh: () => void;
}

export const UserModule: React.FC<UserModuleProps> = ({
  currentUser,
  users,
  departments,
  units,
  courses,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [unitSearchTerm, setUnitSearchTerm] = useState('');
  const [unitDeptFilter, setUnitDeptFilter] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [cargoFilter, setCargoFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [accessFilter, setAccessFilter] = useState<'todos' | 'sim' | 'nao'>('todos');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showCourseManagementModal, setShowCourseManagementModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const handleSelectUnit = (targetUnitId: string) => {
    setSelectedUnitId(targetUnitId);
    setSearchTerm('');
    setCargoFilter('');
    setRoleFilter('');
    setAccessFilter('todos');
  };
  const [maspRaw, setMaspRaw] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cargo, setCargo] = useState<UserCargo>('INVESTIGADOR');
  const [role, setRole] = useState<UserRole>('Policial');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(['Policial']);
  const [deptId, setDeptId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [canMoveAmmo, setCanMoveAmmo] = useState(false);
  const [canMoveWeapons, setCanMoveWeapons] = useState(false);
  const [hasSystemAccess, setHasSystemAccess] = useState(true);
  const [managementScope, setManagementScope] = useState<'department' | 'unit'>('unit');
  const [userCourses, setUserCourses] = useState<UserCourse[]>([]);

  // Teacher states
  const [isTeacher, setIsTeacher] = useState(false);
  const [teacherSubject, setTeacherSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');
  const [professorSigla, setProfessorSigla] = useState('');
  const [showPromoteTeacherModal, setShowPromoteTeacherModal] = useState(false);
  const [existingMaspUser, setExistingMaspUser] = useState<User | null>(null);
  const [promoteSubject, setPromoteSubject] = useState<'MEAF' | 'TAP' | 'DP'>('MEAF');

  // Course Management Form states
  const [showCourseAddForm, setShowCourseAddForm] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedCalibers, setSelectedCalibers] = useState<string[]>([]);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteTargetUser, setDeleteTargetUser] = useState<{ type: 'user' | 'course'; id: string; name: string } | null>(null);

  // Excel Import states
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelRows, setExcelRows] = useState<ParsedExcelUserRow[]>([]);
  const [excelModalError, setExcelModalError] = useState('');
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelImportResult, setExcelImportResult] = useState<ExcelImportResult | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  // Todos os perfis que o usuário logado possui
  const currentUserRoles: UserRole[] = (currentUser.roles && currentUser.roles.length > 0)
    ? currentUser.roles
    : [currentUser.role];

  const isGeral = currentUserRoles.includes('Geral') || currentUser.role === 'Geral';
  const isExplosivista = currentUserRoles.includes('Explosivista') || currentUser.role === 'Explosivista';
  const isAdministrador = currentUserRoles.includes('Administrador') || currentUser.role === 'Administrador';
  const isArmeiro = currentUserRoles.includes('Armeiro') || currentUser.role === 'Armeiro';
  const isRestrictedRegistrar = (isExplosivista || isAdministrador) && !isGeral && !isArmeiro;
  const isAdminOrArmeiro = isAdministrador || isArmeiro;
  const isPolicial = currentUserRoles.length === 1 && currentUserRoles[0] === 'Policial';

  // Regra de autorização hierárquica solicitada:
  // "o usuario que tem permição para cadastrar novos usuarios só poderão liberar acesso a perfis que possui"
  // Exemplo: um armeiro que não tenha permição como administrador, não pode liberar o perfil de administrador para outros usuarios.
  const canGrantRole = (roleToGrant: UserRole): boolean => {
    // Policial é o acesso operacional base que qualquer cadastrador autorizado pode conferir
    if (roleToGrant === 'Policial') return true;
    // O perfil Geral tem permissão irrestrita no sistema
    if (isGeral) return true;
    // Apenas quem possui Geral pode conceder Geral
    if (roleToGrant === 'Geral') return false;
    // O usuário DEVE possuir o perfil em suas permissões para poder concedê-lo a terceiros
    return currentUserRoles.includes(roleToGrant);
  };

  // Privilégio de manuseio com armas e munições
  const currentUserCanHandleWeapons = isGeral || currentUser.role === 'Armeiro' || Boolean(currentUser.canMoveWeapons);
  const currentUserCanHandleAmmo = isGeral || currentUser.role === 'Armeiro' || Boolean(currentUser.canMoveAmmunition);
  const canGrantWeaponAmmoHandling = !isRestrictedRegistrar && currentUserCanHandleWeapons && currentUserCanHandleAmmo;

  // Check if user has rights to manage teachers
  const userDept = departments.find(d => d.id === currentUser.departmentId);
  const isAcademiaDept = (userDept?.name || '').toUpperCase().includes('ACADEMIA');
  const canManageTeachers = isGeral || (isAdminOrArmeiro && isAcademiaDept);

  // Available models from registered weapons & defaults
  const availableModels = Array.from(
    new Set([...storage.getAllWeaponsForAdmin({ role: 'Geral' } as User).map(w => w.model), 'T4', 'IA2', 'PT92', 'Glock G22', 'TH40', 'CBC 586-P'])
  );

  // Available calibers from catalog
  const availableCalibers = storage.getCalibers().map(c => c.name);

  const cargosList: UserCargo[] = [
    'DELEGADO',
    'PERITO',
    'INVESTIGADOR',
    'ESCRIVÃO'
  ];

  const allSystemRoles: UserRole[] = isGeral
    ? ['Geral', 'Administrador', 'Armeiro', 'Policial', 'Explosivista', 'operador_canino']
    : ['Administrador', 'Armeiro', 'Policial', 'Explosivista', 'operador_canino'];

  // Para novos usuários: mostra apenas os perfis que o usuário pode conceder.
  // Para edição: inclui também perfis preexistentes do policial para preservação visual.
  const rolesList: UserRole[] = allSystemRoles.filter(r =>
    canGrantRole(r) || (editingUser && (editingUser.roles?.includes(r) || editingUser.role === r))
  );

  // Filtered units based on selected department in form
  const availableUnitsForForm = units.filter(u => u.departmentId === (deptId || currentUser.departmentId));

  // Open User Modal
  const handleOpenUserModal = (usr?: User) => {
    setErrorMsg('');
    if (usr) {
      setEditingUser(usr);
      setMaspRaw(usr.masp);
      setName(usr.name);
      setPhone(usr.phone);
      const rawCargo = (usr.cargo || '').toUpperCase().trim();
      const validCargos: UserCargo[] = ['DELEGADO', 'PERITO', 'INVESTIGADOR', 'ESCRIVÃO'];
      if (validCargos.includes(rawCargo as UserCargo)) {
        setCargo(rawCargo as UserCargo);
      } else {
        setCargo('INVESTIGADOR');
      }
      setRole(usr.role);
      const userRoles = usr.roles && usr.roles.length > 0 ? usr.roles : [usr.role];
      setSelectedRoles(userRoles);
      setDeptId(isRestrictedRegistrar ? currentUser.departmentId : usr.departmentId);
      setUnitId(isRestrictedRegistrar ? currentUser.unitId : usr.unitId);
      setCanMoveAmmo(isRestrictedRegistrar ? false : usr.canMoveAmmunition);
      setCanMoveWeapons(isRestrictedRegistrar ? false : usr.canMoveWeapons);
      setHasSystemAccess(usr.hasSystemAccess);
      setManagementScope(usr.managementScope || 'unit');
      setUserCourses(usr.courses || []);
      setIsTeacher(Boolean(usr.isTeacher));
      setTeacherSubject(usr.teacherSubject || 'MEAF');
      setProfessorSigla(usr.professorSigla || '');
    } else {
      setEditingUser(null);
      setMaspRaw('');
      setName('');
      setPhone('');
      setCargo('INVESTIGADOR');
      setRole('Policial');
      setSelectedRoles(['Policial']);
      const activeSelectedUnit =
        selectedUnitId && selectedUnitId !== '__SEM_UNIDADE__'
          ? units.find(u => u.id === selectedUnitId)
          : undefined;
      const initialDept = isRestrictedRegistrar
        ? currentUser.departmentId
        : activeSelectedUnit
        ? activeSelectedUnit.departmentId
        : (isGeral ? (departments[0]?.id || '') : currentUser.departmentId);
      setDeptId(initialDept);
      const initialUnits = units.filter(u => u.departmentId === initialDept);
      setUnitId(
        isRestrictedRegistrar
          ? currentUser.unitId
          : activeSelectedUnit
          ? activeSelectedUnit.id
          : (initialUnits[0]?.id || '')
      );
      setCanMoveAmmo(false);
      setCanMoveWeapons(false);
      setHasSystemAccess(true);
      setManagementScope('unit');
      setUserCourses([]);
      setIsTeacher(false);
      setTeacherSubject('MEAF');
      setProfessorSigla('');
    }
    setShowUserModal(true);
  };

  // MASP blur check
  const handleMaspBlur = () => {
    if (editingUser) return;
    const clean = cleanMasp(maspRaw);
    if (!clean) return;

    const existing = users.find(u => u.masp === clean);
    if (existing) {
      if (canManageTeachers) {
        setExistingMaspUser(existing);
        setPromoteSubject('MEAF');
        setShowPromoteTeacherModal(true);
      } else {
        setErrorMsg(`O policial ${existing.name} (MASP: ${formatMasp(existing.masp)}) já está cadastrado no sistema.`);
      }
    }
  };

  const handleConfirmPromoteTeacher = async () => {
    if (!existingMaspUser) return;
    try {
      await storage.updateUser(existingMaspUser.id, {
        isTeacher: true,
        teacherSubject: promoteSubject
      });

      setSuccessMsg(`O policial ${existingMaspUser.name} (MASP: ${formatMasp(existingMaspUser.masp)}) foi tornado Professor da disciplina ${promoteSubject}!`);
      setShowPromoteTeacherModal(false);
      setShowUserModal(false);
      setExistingMaspUser(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao promover policial para professor.');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanMaspInput = cleanMasp(maspRaw);
    if (!cleanMaspInput) {
      setErrorMsg('Informe o MASP contendo apenas números.');
      return;
    }

    if (selectedRoles.length === 0) {
      setErrorMsg('Selecione ao menos um perfil de acesso para o policial.');
      return;
    }

    if (!editingUser && selectedRoles.includes('Geral') && !isGeral) {
      setErrorMsg('Apenas administradores com perfil Geral podem conceder o perfil Geral.');
      return;
    }

    // Validação estrita: O usuário só pode liberar acesso aos perfis que ele próprio possui
    for (const r of selectedRoles) {
      if (!canGrantRole(r)) {
        const wasAlreadyAssigned = editingUser && (editingUser.roles?.includes(r) || editingUser.role === r);
        if (!wasAlreadyAssigned) {
          const label = r === 'operador_canino' ? 'Operador Canino' : r;
          setErrorMsg(`Você não possui a permissão de "${label}" e não pode liberá-la para outros usuários.`);
          return;
        }
      }
    }

    const primaryRole = selectedRoles[0] || 'Policial';

    try {
      const targetDeptId = isRestrictedRegistrar ? currentUser.departmentId : (deptId || currentUser.departmentId);
      const targetUnitId = isRestrictedRegistrar ? currentUser.unitId : (unitId || currentUser.unitId);
      const finalCanMoveAmmo = isRestrictedRegistrar ? false : canMoveAmmo;
      const finalCanMoveWeapons = isRestrictedRegistrar ? false : canMoveWeapons;
      const finalManagementScope = managementScope || 'unit';

      if (editingUser) {
        await storage.updateUser(editingUser.id, {
          masp: cleanMaspInput,
          name: name.trim(),
          phone: cleanPhone(phone),
          cargo,
          role: primaryRole,
          roles: selectedRoles,
          departmentId: targetDeptId,
          unitId: targetUnitId,
          canMoveAmmunition: finalCanMoveAmmo,
          canMoveWeapons: finalCanMoveWeapons,
          hasSystemAccess,
          managementScope: finalManagementScope,
          courses: userCourses,
          isTeacher,
          teacherSubject: isTeacher ? teacherSubject : undefined,
          professorSigla: professorSigla.trim() || undefined
        });
        setSuccessMsg('Policial atualizado com sucesso.');
      } else {
        await storage.addUser({
          name: name.trim(),
          masp: cleanMaspInput,
          phone: cleanPhone(phone),
          cargo,
          role: primaryRole,
          roles: selectedRoles,
          departmentId: targetDeptId,
          unitId: targetUnitId,
          canMoveAmmunition: finalCanMoveAmmo,
          canMoveWeapons: finalCanMoveWeapons,
          hasSystemAccess,
          managementScope: finalManagementScope,
          courses: userCourses,
          isTeacher,
          teacherSubject: isTeacher ? teacherSubject : undefined,
          professorSigla: professorSigla.trim() || undefined
        });
        setSuccessMsg('Novo policial cadastrado com sucesso. A senha inicial será o número do MASP.');
      }

      setShowUserModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar policial.');
    }
  };

  const handleDeleteUser = (usr: User) => {
    setDeleteTargetUser({ type: 'user', id: usr.id, name: `o policial ${usr.name} (MASP: ${formatMasp(usr.masp)})` });
  };

  const canResetPassword = isGeral || isAdministrador || isArmeiro;

  const handleResetPassword = async () => {
    if (!editingUser) return;
    if (window.confirm(`Confirma o reset de senha de ${editingUser.name} (MASP: ${formatMasp(editingUser.masp)}) para o número do MASP?`)) {
      try {
        setErrorMsg('');
        setSuccessMsg('');
        await storage.resetUserPassword(editingUser.id);
        setSuccessMsg(`Senha do policial ${editingUser.name} resetada com sucesso para o MASP. No próximo login, o usuário deverá alterar sua senha.`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao resetar senha do policial.');
      }
    }
  };

  const confirmExecuteDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (deleteTargetUser.type === 'user') {
        await storage.deleteUser(deleteTargetUser.id);
        setSuccessMsg(`Policial excluído com sucesso.`);
      } else {
        await storage.deleteCourse(deleteTargetUser.id);
        setSuccessMsg(`Curso excluído com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar exclusão.');
    } finally {
      setDeleteTargetUser(null);
    }
  };

  // Add/remove course for user
  const handleAddCourseToUser = (courseId: string) => {
    if (!courseId) return;
    if (userCourses.some(uc => uc.courseId === courseId)) return;

    setUserCourses([
      ...userCourses,
      { courseId, completionDate: new Date().toISOString().split('T')[0] }
    ]);
  };

  const handleUpdateCourseDate = (courseId: string, newDate: string) => {
    setUserCourses(
      userCourses.map(uc => (uc.courseId === courseId ? { ...uc, completionDate: newDate } : uc))
    );
  };

  const handleRemoveCourseFromUser = (courseId: string) => {
    setUserCourses(userCourses.filter(uc => uc.courseId !== courseId));
  };

  // Create Course Handler
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    if (selectedModels.length === 0 || selectedCalibers.length === 0) {
      setErrorMsg('Selecione ao menos um modelo e um calibre abrangido pelo curso.');
      return;
    }

    try {
      await storage.addCourse({
        name: newCourseName.trim(),
        allowedModels: selectedModels,
        allowedCalibers: selectedCalibers,
        departmentId: currentUser.departmentId
      });
      setNewCourseName('');
      setSelectedModels([]);
      setSelectedCalibers([]);
      setShowCourseAddForm(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar curso');
    }
  };

  // --- EXCEL IMPORT HELPERS ---
  const allSystemUnits = storage.getAllUnits();
  const allowedUnitsForExcel = isGeral
    ? allSystemUnits
    : allSystemUnits.filter(u => u.departmentId === currentUser.departmentId);

  const normalizeStr = (val: string) =>
    String(val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' ');

  const normalizeAlphaNum = (val: string) =>
    normalizeStr(val).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  const resolveExcelUnit = (rawUnit: string): Unit | undefined => {
    const target = normalizeStr(rawUnit);
    if (!target) {
      if (currentUser.unitId) {
        return allowedUnitsForExcel.find(u => u.id === currentUser.unitId) || allSystemUnits.find(u => u.id === currentUser.unitId);
      }
      return undefined;
    }
    const exact = allowedUnitsForExcel.find(u => normalizeStr(u.name) === target);
    if (exact) return exact;

    const targetClean = normalizeAlphaNum(target);
    const cleanMatch = allowedUnitsForExcel.find(u => normalizeAlphaNum(u.name) === targetClean);
    if (cleanMatch) return cleanMatch;

    const tokenMatch = allowedUnitsForExcel.find(u => {
      const tokens = normalizeStr(u.name).split(/[-–—/()]/).map(t => t.trim()).filter(Boolean);
      return tokens.includes(target) || tokens.some(t => normalizeAlphaNum(t) === targetClean);
    });
    if (tokenMatch) return tokenMatch;

    const partial = allowedUnitsForExcel.filter(u => {
      const uClean = normalizeAlphaNum(u.name);
      return uClean.includes(targetClean) || targetClean.includes(uClean);
    });
    if (partial.length === 1) return partial[0];

    return undefined;
  };

  const normalizeExcelCargo = (rawCargo: string): string => {
    const c = normalizeStr(rawCargo);
    if (!c) return 'INVESTIGADOR';
    if (c.includes('DELEGAD') || c === 'DPC') return 'DELEGADO';
    if (c.includes('ESCRIV') || c === 'EPC') return 'ESCRIVÃO';
    if (c.includes('PERIT')) return 'PERITO';
    if (c.includes('INVESTIGAD') || c === 'IPC' || c === 'INV') return 'INVESTIGADOR';
    if (c.includes('MEDICO') || c.includes('LEGISTA')) return 'Médico Legista';
    if (c.includes('EXPLOSIV')) return 'Explosivista';
    if (c.includes('VETERINAR')) return 'Veterinário';
    if (c.includes('CAES') || c.includes('CANIN')) return 'Condutor de Cães';
    if (c.includes('OPERADOR')) return 'Operador';
    return rawCargo.trim().toUpperCase();
  };

  const handleOpenExcelImportModal = () => {
    setShowUserModal(false);
    setExcelFileName('');
    setExcelRows([]);
    setExcelModalError('');
    setExcelImportResult(null);
    setShowExcelImportModal(true);
  };

  const handleDownloadExcelTemplate = () => {
    const sampleUnitName =
      allowedUnitsForExcel.find(u => u.id === currentUser.unitId)?.name ||
      allowedUnitsForExcel[0]?.name ||
      'COE';
    const wsData = [
      ['NOME', 'MASP', 'CARGO', 'UNIDADE'],
      ['JOÃO DA SILVA', '12345678', 'INVESTIGADOR', sampleUnitName]
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 20 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Usuários');
    XLSX.writeFile(wb, 'usuarios.xlsx');
  };

  const handleExcelFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelModalError('');
    setExcelImportResult(null);
    setExcelFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) {
          setExcelModalError('Não foi possível ler o arquivo selecionado.');
          return;
        }

        const workbook = XLSX.read(buffer, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          setExcelModalError('A planilha anexada não possui abas válidas.');
          return;
        }

        // Prioriza aba com nome "usuários" / "usuarios", caso exista; senão usa a primeira aba não vazia
        const preferredSheetName =
          workbook.SheetNames.find(sn => normalizeStr(sn).includes('USUARIO')) ||
          workbook.SheetNames[0];

        const worksheet = workbook.Sheets[preferredSheetName];
        const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawMatrix || rawMatrix.length === 0) {
          setExcelModalError('A tabela Excel anexada está vazia.');
          return;
        }

        // Localiza a linha de cabeçalho contendo NOME e MASP nas primeiras 10 linhas
        let headerRowIdx = -1;
        let colIdxNome = -1;
        let colIdxMasp = -1;
        let colIdxCargo = -1;
        let colIdxUnidade = -1;

        for (let r = 0; r < Math.min(rawMatrix.length, 10); r++) {
          const rowCells = (rawMatrix[r] || []).map(cell => normalizeStr(String(cell ?? '')));
          const nIdx = rowCells.findIndex(c => c === 'NOME' || c === 'NOME COMPLETO' || c === 'POLICIAL' || c === 'USUARIO' || c === 'NOME DO USUARIO' || c.startsWith('NOME'));
          const mIdx = rowCells.findIndex(c => c === 'MASP' || c.includes('MASP') || c === 'MATRICULA');
          if (nIdx !== -1 && mIdx !== -1) {
            headerRowIdx = r;
            colIdxNome = nIdx;
            colIdxMasp = mIdx;
            colIdxCargo = rowCells.findIndex(c => c === 'CARGO' || c.includes('CARGO') || c === 'CARREIRA' || c === 'FUNCAO');
            colIdxUnidade = rowCells.findIndex(c => c === 'UNIDADE' || c.includes('UNIDADE') || c === 'LOTACAO' || c === 'DELEGACIA' || c === 'SETOR');
            break;
          }
        }

        if (headerRowIdx === -1 || colIdxNome === -1 || colIdxMasp === -1) {
          setExcelModalError('Cabeçalho inválido. Certifique-se de que a tabela contenha as colunas NOME, MASP, CARGO e UNIDADE.');
          setExcelRows([]);
          return;
        }

        const allExistingUsers = storage.getAllUsersForLookup();
        const existingMaspMap = new Map<string, User>();
        for (const u of allExistingUsers) {
          const d = cleanMasp(u.masp);
          if (d) existingMaspMap.set(d, u);
          const rawD = (u.masp || '').replace(/\D/g, '');
          if (rawD) existingMaspMap.set(rawD, u);
        }

        const seenMaspsInSheet = new Map<string, string>();
        const parsedRows: ParsedExcelUserRow[] = [];

        for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
          const row = rawMatrix[r] || [];
          const rawName = String(row[colIdxNome] ?? '').trim();
          const rawMaspCell = String(row[colIdxMasp] ?? '').trim();
          const cleanedMaspVal = cleanMasp(rawMaspCell);

          // Ignora linhas totalmente em branco
          if (!rawName && !cleanedMaspVal) continue;
          if (!rawName || !cleanedMaspVal) continue;

          const rawCargo = colIdxCargo !== -1 ? String(row[colIdxCargo] ?? '').trim() : '';
          const rawUnit = colIdxUnidade !== -1 ? String(row[colIdxUnidade] ?? '').trim() : '';
          const normalizedCargo = normalizeExcelCargo(rawCargo);
          const matchedUnit = resolveExcelUnit(rawUnit);

          const existingUser = existingMaspMap.get(cleanedMaspVal);
          const duplicateInSheetName = seenMaspsInSheet.get(cleanedMaspVal);
          const isAlready = Boolean(existingUser || duplicateInSheetName);

          if (!isAlready) {
            seenMaspsInSheet.set(cleanedMaspVal, rawName);
          }

          parsedRows.push({
            rowIndex: r + 1,
            name: rawName,
            masp: cleanedMaspVal,
            cargo: normalizedCargo,
            rawUnitName: rawUnit,
            matchedUnitId: matchedUnit?.id || '',
            matchedUnitName: matchedUnit?.name || '',
            alreadyRegistered: isAlready,
            existingSystemName: existingUser?.name || duplicateInSheetName
          });
        }

        if (parsedRows.length === 0) {
          setExcelModalError('Nenhum registro com NOME e MASP válidos foi encontrado na tabela.');
          setExcelRows([]);
          return;
        }

        setExcelRows(parsedRows);
      } catch (err: any) {
        setExcelModalError(err.message || 'Erro ao processar o arquivo Excel.');
        setExcelRows([]);
      } finally {
        if (excelFileInputRef.current) {
          excelFileInputRef.current.value = '';
        }
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleChangeRowUnit = (rowIndex: number, rawUnitName: string, newUnitId: string) => {
    const selectedUnit = allowedUnitsForExcel.find(u => u.id === newUnitId);
    const normRaw = normalizeStr(rawUnitName);
    setExcelRows(prev =>
      prev.map(row => {
        if (row.rowIndex === rowIndex || (normRaw && normalizeStr(row.rawUnitName) === normRaw && !row.matchedUnitId)) {
          return {
            ...row,
            matchedUnitId: selectedUnit?.id || '',
            matchedUnitName: selectedUnit?.name || ''
          };
        }
        return row;
      })
    );
  };

  const handleConfirmExcelImport = async () => {
    if (excelRows.length === 0) return;
    setExcelModalError('');

    const missingUnitRows = excelRows.filter(r => !r.alreadyRegistered && !r.matchedUnitId);
    if (missingUnitRows.length > 0) {
      setExcelModalError(
        `Existem ${missingUnitRows.length} novo(s) usuário(s) cuja unidade da planilha não foi localizada automaticamente. Selecione a unidade correspondente na tabela abaixo antes de gravar.`
      );
      return;
    }

    setIsImportingExcel(true);
    try {
      const payload = excelRows.map(r => ({
        name: r.name,
        masp: r.masp,
        cargo: r.cargo,
        unitName: r.matchedUnitName || r.rawUnitName,
        unitId: r.matchedUnitId || undefined
      }));

      const result = await storage.importUsersFromExcel(payload);
      setExcelImportResult({
        importedCount: result.importedCount,
        alreadyRegisteredCount: result.alreadyRegisteredCount,
        alreadyRegisteredUsers: result.alreadyRegisteredUsers || []
      });

      if (result.importedCount > 0) {
        setSuccessMsg(`${result.importedCount} usuário(s) cadastrado(s) via Excel com sucesso.`);
      }
      onRefresh();
    } catch (err: any) {
      setExcelModalError(err.message || 'Erro ao gravar usuários da planilha.');
    } finally {
      setIsImportingExcel(false);
    }
  };

  // Unidades visíveis ordenadas por departamento e nome
  const visibleDepts = useMemo(
    () => (isGeral ? departments : departments.filter(d => d.id === currentUser.departmentId)),
    [departments, isGeral, currentUser.departmentId]
  );

  const visibleUnits = useMemo(() => {
    const allowedDeptIds = new Set(visibleDepts.map(d => d.id));
    const list = units.filter(u => isGeral || allowedDeptIds.has(u.departmentId) || u.id === currentUser.unitId);
    return [...list].sort((a, b) => {
      const deptA = departments.find(d => d.id === a.departmentId)?.name || '';
      const deptB = departments.find(d => d.id === b.departmentId)?.name || '';
      const deptCmp = deptA.localeCompare(deptB, 'pt-BR');
      if (deptCmp !== 0) return deptCmp;
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });
  }, [units, visibleDepts, isGeral, currentUser.unitId, departments]);

  const visibleUnitIdsSet = useMemo(() => new Set(visibleUnits.map(u => u.id)), [visibleUnits]);

  const usersCountByUnit = useMemo(() => {
    const map = new Map<string, { total: number; activeAccess: number }>();
    for (const u of users) {
      const key = u.unitId && visibleUnitIdsSet.has(u.unitId) ? u.unitId : '__SEM_UNIDADE__';
      const curr = map.get(key) || { total: 0, activeAccess: 0 };
      curr.total += 1;
      if (u.hasSystemAccess) curr.activeAccess += 1;
      map.set(key, curr);
    }
    return map;
  }, [users, visibleUnitIdsSet]);

  const filteredUnitsList = useMemo(() => {
    const uTerm = unitSearchTerm.trim().toLowerCase();
    return visibleUnits.filter(u => {
      if (unitDeptFilter && u.departmentId !== unitDeptFilter) return false;
      if (!uTerm) return true;
      const dept = departments.find(d => d.id === u.departmentId);
      return (
        (u.name || '').toLowerCase().includes(uTerm) ||
        (dept?.name || '').toLowerCase().includes(uTerm) ||
        (dept?.code || '').toLowerCase().includes(uTerm)
      );
    });
  }, [visibleUnits, unitSearchTerm, unitDeptFilter, departments]);

  const unassignedCount = usersCountByUnit.get('__SEM_UNIDADE__')?.total || 0;

  const selectedUnitObj = useMemo(
    () => (selectedUnitId && selectedUnitId !== '__SEM_UNIDADE__' ? visibleUnits.find(u => u.id === selectedUnitId) || null : null),
    [selectedUnitId, visibleUnits]
  );

  const selectedUnitDeptObj = useMemo(
    () => (selectedUnitObj ? departments.find(d => d.id === selectedUnitObj.departmentId) || null : null),
    [selectedUnitObj, departments]
  );

  const usersInSelectedUnit = useMemo(() => {
    if (!selectedUnitId) return [];
    if (selectedUnitId === '__SEM_UNIDADE__') {
      return users.filter(u => !u.unitId || !visibleUnitIdsSet.has(u.unitId));
    }
    return users.filter(u => u.unitId === selectedUnitId);
  }, [selectedUnitId, users, visibleUnitIdsSet]);

  const availableCargoFilterOptions = useMemo(() => {
    const set = new Set<string>(cargosList);
    for (const u of usersInSelectedUnit) {
      if (u.cargo && u.cargo.trim()) {
        set.add(u.cargo.trim().toUpperCase());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [usersInSelectedUnit]);

  const filteredUnitUsers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return usersInSelectedUnit.filter(u => {
      if (term) {
        const maspFmt = formatMasp(u.masp).toLowerCase();
        const matchesText =
          u.name.toLowerCase().includes(term) ||
          u.masp.toLowerCase().includes(term) ||
          maspFmt.includes(term) ||
          (u.cargo || '').toLowerCase().includes(term);
        if (!matchesText) return false;
      }

      if (cargoFilter) {
        if ((u.cargo || '').trim().toUpperCase() !== cargoFilter.trim().toUpperCase()) {
          return false;
        }
      }

      if (roleFilter) {
        const uRoles = u.roles && u.roles.length > 0 ? u.roles : [u.role];
        if (!uRoles.includes(roleFilter as UserRole)) return false;
      }

      if (accessFilter === 'sim' && !u.hasSystemAccess) return false;
      if (accessFilter === 'nao' && u.hasSystemAccess) return false;

      return true;
    });
  }, [usersInSelectedUnit, searchTerm, cargoFilter, roleFilter, accessFilter]);

  const hasActiveUnitFilters = Boolean(searchTerm.trim() || cargoFilter || roleFilter || accessFilter !== 'todos');

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {selectedUnitId
                ? `Policiais Cadastrados — ${selectedUnitObj ? selectedUnitObj.name : 'Sem Unidade Vinculada'}`
                : 'Gestão de Usuários por Unidade'}
            </h1>
            <p className="text-xs text-slate-400">
              {selectedUnitId
                ? 'Filtre os policiais cadastrados nesta unidade por cargo, perfil de acesso e situação de acesso.'
                : 'Escolha uma unidade abaixo para visualizar os policiais cadastrados.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Attach Excel Users Button & New User Button */}
          {!isPolicial && (
            <>
              <button
                type="button"
                onClick={handleOpenExcelImportModal}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
                title="Anexar tabela do Excel (usuários) com NOME, MASP, CARGO e UNIDADE"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Anexar Excel (Usuários)</span>
              </button>
              <button
                onClick={() => handleOpenUserModal()}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Policial</span>
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

      {/* ETAPA 1: APENAS AS UNIDADES (ANTES DE ESCOLHER A UNIDADE) */}
      {!selectedUnitId ? (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={unitSearchTerm}
                  onChange={(e) => setUnitSearchTerm(e.target.value)}
                  placeholder="Filtrar unidade por nome ou departamento..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {visibleDepts.length > 1 && (
                <select
                  value={unitDeptFilter}
                  onChange={(e) => setUnitDeptFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Departamentos</option>
                  {visibleDepts.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.code ? `${d.code} — ${d.name}` : d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <span className="text-xs text-slate-400 font-medium">
              <strong className="text-amber-400">{filteredUnitsList.length}</strong> unidade(s) disponíve{filteredUnitsList.length === 1 ? 'l' : 'is'}
            </span>
          </div>

          {filteredUnitsList.length === 0 && unassignedCount === 0 ? (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhuma unidade encontrada para o filtro informado.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUnitsList.map((u) => {
                const dept = departments.find(d => d.id === u.departmentId);
                const stats = usersCountByUnit.get(u.id) || { total: 0, activeAccess: 0 };
                const isOwnUnit = u.id === currentUser.unitId;

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUnit(u.id)}
                    className="group text-left bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 shadow-sm transition flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2.5 w-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 group-hover:bg-amber-500/20 transition">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {isOwnUnit && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Sua Unidade
                            </span>
                          )}
                          {dept && (
                            <span className="text-[10px] font-mono font-bold bg-slate-950 text-amber-400 px-2 py-0.5 rounded border border-slate-800">
                              {dept.code || dept.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h2 className="text-base font-bold text-slate-100 group-hover:text-amber-300 transition">
                          {u.name}
                        </h2>
                        {dept && (
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {dept.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 w-full">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 font-bold font-mono">
                          {stats.total} {stats.total === 1 ? 'Cadastrado' : 'Cadastrados'}
                        </span>
                        {stats.total > 0 && (
                          <span className="text-[11px] text-slate-400">
                            ({stats.activeAccess} ativo{stats.activeAccess === 1 ? '' : 's'})
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-400 group-hover:text-amber-400 flex items-center gap-1 transition">
                        <span>Abrir</span>
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </button>
                );
              })}

              {unassignedCount > 0 && !unitSearchTerm.trim() && !unitDeptFilter && (
                <button
                  type="button"
                  onClick={() => handleSelectUnit('__SEM_UNIDADE__')}
                  className="group text-left bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 shadow-sm transition flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5 w-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="p-2.5 bg-slate-800 text-slate-400 rounded-xl border border-slate-700">
                        <Building className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-slate-950 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                        SEM VÍNCULO
                      </span>
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-100 group-hover:text-amber-300 transition">
                        Sem Unidade Vinculada
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Cadastros sem unidade associada no escopo atual
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 w-full">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 font-bold font-mono text-xs">
                      {unassignedCount} {unassignedCount === 1 ? 'Cadastrado' : 'Cadastrados'}
                    </span>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-amber-400 flex items-center gap-1 transition">
                      <span>Abrir</span>
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ETAPA 2: CADASTRADOS DA UNIDADE SELECIONADA + FILTROS (CARGO, PERFIL E ACESSO) */
        <div className="space-y-4">
          {/* Barra de Navegação da Unidade Selecionada */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedUnitId(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center space-x-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Voltar para Unidades</span>
              </button>

              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-100">
                      {selectedUnitObj ? selectedUnitObj.name : 'Sem Unidade Vinculada'}
                    </h2>
                    {selectedUnitDeptObj && (
                      <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                        {selectedUnitDeptObj.code || selectedUnitDeptObj.name}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Total na unidade: <strong className="text-slate-200">{usersInSelectedUnit.length}</strong> policial(is)
                    {hasActiveUnitFilters && (
                      <> • Exibindo <strong className="text-amber-400">{filteredUnitUsers.length}</strong> com os filtros aplicados</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {visibleUnits.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">Trocar Unidade:</span>
                <select
                  value={selectedUnitId}
                  onChange={(e) => handleSelectUnit(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {visibleUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({usersCountByUnit.get(u.id)?.total || 0})
                    </option>
                  ))}
                  {unassignedCount > 0 && (
                    <option value="__SEM_UNIDADE__">Sem Unidade Vinculada ({unassignedCount})</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Barra de Filtros: Busca, Cargo, Perfil e Acesso */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5" />
                <span>Filtros dos Cadastrados</span>
              </div>
              {hasActiveUnitFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCargoFilter('');
                    setRoleFilter('');
                    setAccessFilter('todos');
                  }}
                  className="text-xs text-amber-400 hover:underline font-semibold"
                >
                  Limpar Filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Busca por Nome ou MASP */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Nome ou MASP
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar nome ou MASP..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Filtro por Cargo */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Cargo
                </label>
                <select
                  value={cargoFilter}
                  onChange={(e) => setCargoFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Cargos</option>
                  {availableCargoFilterOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Perfil */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Perfil
                </label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos os Perfis</option>
                  {allSystemRoles.map((r) => (
                    <option key={r} value={r}>
                      {r === 'operador_canino' ? 'Operador Canino' : r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Acesso */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Acesso ao Sistema
                </label>
                <select
                  value={accessFilter}
                  onChange={(e) => setAccessFilter(e.target.value as 'todos' | 'sim' | 'nao')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="todos">Todos os Acessos</option>
                  <option value="sim">Acesso Ativo (SIM)</option>
                  <option value="nao">Acesso Bloqueado (NÃO)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabela de Cadastrados da Unidade Selecionada */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Policial / MASP</th>
                    <th className="py-3 px-4">Cargo</th>
                    <th className="py-3 px-4">Perfil</th>
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4 text-center">Acesso</th>
                    <th className="py-3 px-4">Permissões Especiais</th>
                    <th className="py-3 px-4">Cursos Habilitados</th>
                    {!isPolicial && <th className="py-3 px-4 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUnitUsers.length === 0 ? (
                    <tr>
                      <td colSpan={isPolicial ? 7 : 8} className="py-8 text-center text-slate-500 italic">
                        {usersInSelectedUnit.length === 0
                          ? 'Nenhum policial cadastrado nesta unidade.'
                          : 'Nenhum policial encontrado com os filtros selecionados (cargo, perfil ou acesso).'}
                      </td>
                    </tr>
                  ) : (
                    filteredUnitUsers.map((usr) => {
                      const u = units.find(un => un.id === usr.unitId);

                      return (
                        <tr key={usr.id} className="hover:bg-slate-800/40 transition">
                          {/* Name & MASP */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-100 text-sm">{usr.name}</div>
                            <div className="text-[11px] font-mono text-amber-400">
                              MASP: {formatMasp(usr.masp)}
                            </div>
                          </td>

                          {/* Cargo */}
                          <td className="py-3 px-4">
                            <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded font-medium">
                              {usr.cargo}
                            </span>
                          </td>

                          {/* Role */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(usr.roles && usr.roles.length > 0 ? usr.roles : [usr.role]).map((r) => (
                                <span
                                  key={r}
                                  className={`px-2 py-0.5 rounded font-bold border text-[11px] ${
                                    r === 'Geral'
                                      ? 'bg-purple-950 text-purple-300 border-purple-800'
                                      : r === 'Administrador'
                                      ? 'bg-blue-950 text-blue-300 border-blue-800'
                                      : r === 'Armeiro'
                                      ? 'bg-amber-950 text-amber-300 border-amber-800'
                                      : r === 'Explosivista'
                                      ? 'bg-orange-950 text-orange-300 border-orange-800'
                                      : r === 'operador_canino'
                                      ? 'bg-teal-950 text-teal-300 border-teal-800'
                                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  }`}
                                >
                                  {r === 'operador_canino' ? 'Operador Canino' : r}
                                </span>
                              ))}
                            </div>
                            {usr.isTeacher && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                                  Prof ({usr.teacherSubject || 'MEAF'})
                                </span>
                                {usr.professorSigla && (
                                  <span className="bg-slate-950 text-amber-300 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
                                    [{usr.professorSigla}]
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Unit */}
                          <td className="py-3 px-4 text-slate-300">
                            <div className="font-semibold text-slate-200">{u ? u.name : 'N/A'}</div>
                          </td>

                          {/* System Access */}
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                usr.hasSystemAccess
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-red-950 text-red-400 border border-red-800'
                              }`}
                            >
                              {usr.hasSystemAccess ? 'SIM' : 'NÃO'}
                            </span>
                          </td>

                          {/* Special Move Permissions */}
                          <td className="py-3 px-4 space-y-1">
                            <div className="text-[10px]">
                              Munição: {' '}
                              <span className={usr.canMoveAmmunition ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                {usr.canMoveAmmunition ? 'Sim' : 'Não'}
                              </span>
                            </div>
                            <div className="text-[10px]">
                              Armas: {' '}
                              <span className={usr.canMoveWeapons ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                {usr.canMoveWeapons ? 'Sim' : 'Não'}
                              </span>
                            </div>
                            <div className="text-[10px]">
                              Abrangência: {' '}
                              <span className={`font-semibold ${usr.managementScope === 'department' ? 'text-amber-400' : 'text-slate-400'}`}>
                                {usr.managementScope === 'department' ? 'Departamento' : 'Unidade'}
                              </span>
                            </div>
                          </td>

                          {/* Courses */}
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {usr.courses.length === 0 ? (
                                <span className="text-slate-500 italic text-[11px]">Nenhum</span>
                              ) : (
                                usr.courses.map((uc, i) => {
                                  const cObj = courses.find(c => c.id === uc.courseId);
                                  const expired = isCourseExpired(uc.completionDate);

                                  return (
                                    <span
                                      key={i}
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold flex items-center space-x-1 ${
                                        expired
                                          ? 'bg-red-600 text-white border-red-500'
                                          : 'bg-slate-950 text-amber-400 border-slate-800'
                                      }`}
                                      title={expired ? 'Curso Vencido (> 2 anos)' : 'Curso Válido'}
                                    >
                                      <span>{cObj ? cObj.name : uc.courseId}</span>
                                      {expired && <AlertTriangle className="w-3 h-3 text-white inline" />}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          {!isPolicial && (
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => handleOpenUserModal(usr)}
                                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                                  title="Editar Policial"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                {isGeral && (
                                  <button
                                    onClick={() => handleDeleteUser(usr)}
                                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                                    title="Excluir Policial"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
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

      {/* User Edit / Add Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-2 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100">
                {editingUser ? 'Editar Policial' : 'Novo Policial'}
              </h3>
              {!editingUser && !isPolicial && (
                <button
                  type="button"
                  onClick={handleOpenExcelImportModal}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Anexar Tabela Excel (Usuários)</span>
                </button>
              )}
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* MASP */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    MASP (Apenas números)
                  </label>
                  <input
                    type="text"
                    value={formatMasp(maspRaw)}
                    onChange={(e) => setMaspRaw(cleanMasp(e.target.value))}
                    onBlur={handleMaspBlur}
                    placeholder="MASP com dígito"
                    maxLength={11}
                    disabled={!!editingUser}
                    className={`w-full border rounded-xl px-3.5 py-2 text-sm font-mono ${
                      editingUser
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {editingUser
                      ? 'O número de MASP é inalterável por qualquer perfil.'
                      : 'Armazenado apenas números. Ao sair da caixa, verifica duplicidade.'}
                  </p>
                </div>

                {/* Nome */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                    required
                  />
                </div>

                {/* Cargo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Cargo
                  </label>
                  <select
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value as UserCargo)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    {cargosList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(cleanPhone(e.target.value))}
                    placeholder="(00) 0 0000-0000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  />
                </div>

                {/* Perfis de Acesso (Múltiplos perfis permitidos) */}
                <div className="md:col-span-2 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Perfis de Acesso no Sistema (Múltiplos Permitidos)
                    </label>
                    <span className="text-[11px] text-amber-400 font-semibold">
                      {selectedRoles.length} selecionado(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Selecione todas as funções que o policial desempenha. Ao efetuar login, o policial poderá escolher sua função ativa ou alternar a qualquer momento no menu superior.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {rolesList.map((r) => {
                      const isChecked = selectedRoles.includes(r);
                      const isAllowed = canGrantRole(r);
                      const roleLabel = r === 'operador_canino' ? 'Operador Canino' : r;
                      return (
                        <label
                          key={r}
                          title={!isAllowed ? `Você não possui o perfil de ${roleLabel} e não tem permissão para liberá-lo a outros usuários.` : undefined}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs font-semibold transition ${
                            !isAllowed
                              ? 'bg-slate-950/40 border-slate-800/60 text-slate-500 cursor-not-allowed opacity-60'
                              : isChecked
                              ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 cursor-pointer'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!isAllowed}
                              onChange={(e) => {
                                if (!isAllowed) return;
                                if (e.target.checked) {
                                  const nextRoles = [...selectedRoles, r];
                                  setSelectedRoles(nextRoles);
                                  setRole(nextRoles[0]);
                                } else {
                                  if (selectedRoles.length <= 1) {
                                    setErrorMsg('O usuário deve possuir ao menos 1 perfil ativo.');
                                    return;
                                  }
                                  const filtered = selectedRoles.filter(item => item !== r);
                                  setSelectedRoles(filtered);
                                  setRole(filtered[0]);
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500/20 bg-slate-950 disabled:opacity-50"
                            />
                            <span>{roleLabel}</span>
                          </div>
                          {!isAllowed && (
                            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" title="Perfil bloqueado: você não possui esta permissão" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Acesso ao Sistema */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Acesso ao Sistema
                  </label>
                  <select
                    value={hasSystemAccess ? 'sim' : 'nao'}
                    onChange={(e) => setHasSystemAccess(e.target.value === 'sim')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                  >
                    <option value="sim">Sim (Ativo)</option>
                    <option value="nao">Não (Bloqueado)</option>
                  </select>
                </div>

                {/* Lotação: Departamento e Unidade (Oculto para Explosivista e Administrativo, herança automática) */}
                {isRestrictedRegistrar ? (
                  <div className="md:col-span-2 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                      Lotação do Policial (Departamento e Unidade)
                    </span>
                    <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        {departments.find(d => d.id === currentUser.departmentId)?.name || 'Departamento'} • {units.find(u => u.id === currentUser.unitId)?.name || 'Unidade'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Usuários cadastrados por seu perfil herdam obrigatoriamente a mesma lotação de sua unidade. Apenas consultas em armas e munições serão permitidas.
                    </p>
                  </div>
                ) : (
                  <>
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
                          setUnitId(depUnits[0]?.id || '');
                        }}
                        disabled={!isGeral}
                        className={`w-full border rounded-xl px-3.5 py-2 text-sm ${
                          !isGeral
                            ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-950 border-slate-700 text-slate-100'
                        }`}
                      >
                        {departments.map((d) => (
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
                        onChange={(e) => setUnitId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      >
                        {availableUnitsForForm.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Professor da Academia */}
                {canManageTeachers && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>Professor da Academia?</span>
                      </label>
                      <select
                        value={isTeacher ? 'sim' : 'nao'}
                        onChange={(e) => setIsTeacher(e.target.value === 'sim')}
                        className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-semibold"
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim (Professor)</option>
                      </select>
                    </div>

                    {isTeacher && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                            Matéria Leccionada
                          </label>
                          <select
                            value={teacherSubject}
                            onChange={(e) => setTeacherSubject(e.target.value as 'MEAF' | 'TAP' | 'DP')}
                            className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-semibold"
                          >
                            <option value="MEAF">MEAF (Manejo e Emprego de Armas de Fogo)</option>
                            <option value="TAP">TAP (Técnicas de Ações Policiais)</option>
                            <option value="DP">DP (Defesa Pessoal)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                            Sigla do Professor
                          </label>
                          <input
                            type="text"
                            value={professorSigla}
                            onChange={(e) => setProfessorSigla(e.target.value)}
                            placeholder="Ex: SILVA / MEAF"
                            className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-semibold uppercase"
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Permissões Especiais de Manuseio com Armas e Munições (Ocultas quando o usuário não possui o privilégio ou for Explosivista/Administrativo) */}
                {canGrantWeaponAmmoHandling && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Pode Movimentar Munições?
                      </label>
                      <select
                        value={canMoveAmmo ? 'sim' : 'nao'}
                        onChange={(e) => setCanMoveAmmo(e.target.value === 'sim')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      >
                        <option value="nao">Não (Apenas Consulta)</option>
                        <option value="sim">Sim (Movimentar/Manusear)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Pode Movimentar Armas?
                      </label>
                      <select
                        value={canMoveWeapons ? 'sim' : 'nao'}
                        onChange={(e) => setCanMoveWeapons(e.target.value === 'sim')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100"
                      >
                        <option value="nao">Não (Apenas Consulta)</option>
                        <option value="sim">Sim (Movimentar/Manusear)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Abrangência de Movimentação e Gestão */}
                <div className="md:col-span-2 bg-amber-950/20 border border-amber-800/40 p-3.5 rounded-xl">
                  <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
                    Abrangência de Movimentação e Gestão
                  </label>
                  <select
                    value={managementScope}
                    onChange={(e) => setManagementScope(e.target.value as 'department' | 'unit')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-medium focus:border-amber-500 focus:outline-none"
                  >
                    <option value="department">Departamento e todas as unidades do departamento vinculado</option>
                    <option value="unit">Apenas a unidade específica que está vinculado</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Determina se o policial/usuário possui abrangência para gerenciar e movimentar em todo o departamento ou restrito à sua unidade vinculada.
                  </p>
                </div>

                {/* Resetar Senha (Geral, Administrador ou Armeiro) */}
                {canResetPassword && editingUser && (
                  <div className="md:col-span-2 bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-400 block flex items-center space-x-1.5">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        <span>Resetar Senha do Policial</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Redefine a senha do policial para o número do MASP. No próximo acesso, o policial será direcionado obrigatoriamente para a página de primeiro acesso para cadastrar uma nova senha (mínimo 6 dígitos).
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ml-4 flex items-center space-x-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Resetar Senha</span>
                    </button>
                  </div>
                )}

              </div>

              {/* Course Assignment Section */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4" />
                    <span>Cursos do Policial</span>
                  </label>

                  <select
                    onChange={(e) => {
                      handleAddCourseToUser(e.target.value);
                      e.target.value = '';
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 px-3 py-1"
                  >
                    <option value="">+ Adicionar Curso</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {userCourses.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhum curso associado a este policial.</p>
                  ) : (
                    userCourses.map((uc) => {
                      const cObj = courses.find(c => c.id === uc.courseId);
                      const expired = isCourseExpired(uc.completionDate);

                      return (
                        <div key={uc.courseId} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-200">{cObj ? cObj.name : uc.courseId}</span>
                            <span className="block text-[10px] text-slate-400">
                              Modelos: {cObj?.allowedModels.join(', ')} • Calibres: {cObj?.allowedCalibers.join(', ')}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] text-slate-400">Data do Curso:</span>
                              <input
                                type="date"
                                value={uc.completionDate}
                                onChange={(e) => handleUpdateCourseDate(uc.courseId, e.target.value)}
                                className={`border rounded px-2 py-1 text-xs font-mono font-bold ${
                                  expired
                                    ? 'bg-red-600 text-white border-red-500'
                                    : 'bg-slate-900 border-slate-700 text-amber-400'
                                }`}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveCourseFromUser(uc.courseId)}
                              className="text-red-400 hover:text-red-300 font-bold"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow"
                >
                  Salvar Policial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Course Management Modal */}
      {showCourseManagementModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                <span>Cadastro e Gestão de Cursos</span>
              </h3>
              <button
                onClick={() => setShowCourseManagementModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Defina os cursos e quais modelos de armas e calibres cada curso abrange.
            </p>

            {/* List of existing courses */}
            <div className="space-y-3 mt-4 max-h-60 overflow-y-auto">
              {courses.map((course) => (
                <div key={course.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-amber-400 text-sm">{course.name}</h4>
                    <p className="text-xs text-slate-300 mt-1">
                      <strong>Modelos abrangidos:</strong> {course.allowedModels.join(', ')}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      <strong>Calibres abrangidos:</strong> {course.allowedCalibers.join(', ')}
                    </p>
                  </div>
                  {isGeral && (
                    <button
                      onClick={() => {
                        setDeleteTargetUser({ type: 'course', id: course.id, name: `o curso "${course.name}"` });
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded transition"
                      title="Excluir Curso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Course Toggle */}
            {!showCourseAddForm ? (
              <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setShowCourseAddForm(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Novo Curso</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateCourse} className="mt-4 pt-4 border-t border-slate-800 space-y-4 bg-slate-950/60 p-4 rounded-xl border">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Novo Curso</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nome do Curso (Cursos de Habilitação)</label>
                  <input
                    type="text"
                    list="userCoursesDatalist"
                    value={newCourseName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewCourseName(val);
                      const matched = courses.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
                      if (matched) {
                        if (matched.allowedModels && matched.allowedModels.length > 0) {
                          setSelectedModels(matched.allowedModels);
                        }
                        if (matched.allowedCalibers && matched.allowedCalibers.length > 0) {
                          setSelectedCalibers(matched.allowedCalibers);
                        }
                      }
                    }}
                    placeholder="Ex: Operador de fuzil"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                    required
                  />
                  <datalist id="userCoursesDatalist">
                    {courses.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>

                  {(() => {
                    const matched = courses.find(c => c.name.toLowerCase() === newCourseName.trim().toLowerCase());
                    if (!matched) return null;
                    return (
                      <div className="bg-amber-950/40 border border-amber-500/40 p-2.5 rounded-xl text-xs space-y-1 mt-2">
                        <div className="font-bold text-amber-400">Dados Herdados do Curso de Habilitação</div>
                        <div className="text-slate-300">
                          <strong>Tipo/Modelos:</strong> {matched.allowedModels?.join(', ') || 'N/A'}
                        </div>
                        <div className="text-slate-300">
                          <strong>Quantidade de Tiros:</strong> <span className="text-amber-400 font-bold">{matched.shotsPerStudent || 50} tiros/aluno</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Select Models */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Modelos de Armas Abrangidos (Selecione múltiplos)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableModels.map((model) => {
                      const selected = selectedModels.includes(model);
                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setSelectedModels(selectedModels.filter(m => m !== model));
                            } else {
                              setSelectedModels([...selectedModels, model]);
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
                            selected
                              ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {model}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Select Calibers */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Calibres Abrangidos (Selecione múltiplos)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableCalibers.map((cal) => {
                      const selected = selectedCalibers.includes(cal);
                      return (
                        <button
                          key={cal}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setSelectedCalibers(selectedCalibers.filter(c => c !== cal));
                            } else {
                              setSelectedCalibers([...selectedCalibers, cal]);
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
                            selected
                              ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {cal}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCourseAddForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-500 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-lg"
                  >
                    Salvar Curso
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Promote Existing User to Teacher Modal */}
      {showPromoteTeacherModal && existingMaspUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-amber-400">
              <GraduationCap className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-100">Policial Já Cadastrado</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              O policial <strong className="text-amber-400">{existingMaspUser.name}</strong> (MASP: <span className="font-mono">{formatMasp(existingMaspUser.masp)}</span>) já está cadastrado no sistema.
            </p>
            <p className="text-xs text-slate-300 font-semibold">
              Deseja torná-lo professor da Academia de Polícia Civil?
            </p>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Informe a Matéria Leccionada
              </label>
              <select
                value={promoteSubject}
                onChange={(e) => setPromoteSubject(e.target.value as 'MEAF' | 'TAP' | 'DP')}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-semibold"
              >
                <option value="MEAF">MEAF (Manejo e Emprego de Armas de Fogo)</option>
                <option value="TAP">TAP (Técnicas de Ações Policiais)</option>
                <option value="DP">DP (Defesa Pessoal)</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowPromoteTeacherModal(false);
                  setExistingMaspUser(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
              >
                Não (Cancelar)
              </button>
              <button
                type="button"
                onClick={handleConfirmPromoteTeacher}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow transition"
              >
                Sim, Tornar Professor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Users Import Modal */}
      {showExcelImportModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-4xl shadow-2xl my-8 space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    Importar Tabela do Excel — Usuários
                  </h3>
                  <p className="text-xs text-slate-400">
                    Anexe uma planilha Excel (<span className="font-mono text-slate-300">.xlsx</span>, <span className="font-mono text-slate-300">.xls</span> ou <span className="font-mono text-slate-300">.csv</span>) contendo as colunas <strong>NOME</strong>, <strong>MASP</strong>, <strong>CARGO</strong> e <strong>UNIDADE</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExcelImportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Post-Save Completion Result View */}
            {excelImportResult ? (
              <div className="space-y-4">
                <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-xl p-4 flex items-start space-x-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0 mt-0.5">
                    <Check className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-emerald-200">
                      Gravação Concluída!
                    </h4>
                    <p className="text-xs text-emerald-300/90">
                      Foram gravados <strong>{excelImportResult.importedCount}</strong> novo(s) usuário(s) no sistema com perfil <strong>Policial</strong>, abrangência <strong>Apenas Unidade</strong>, acesso ao sistema <strong>SIM</strong> e permissão para movimentar armas e munições <strong>SIM</strong>.
                    </p>
                  </div>
                </div>

                {excelImportResult.alreadyRegisteredUsers.length > 0 ? (
                  <div className="bg-amber-950/30 border border-amber-700/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center space-x-2 text-amber-300">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Os seguintes usuários ({excelImportResult.alreadyRegisteredUsers.length}) já estavam cadastrados no sistema e foram ignorados:
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/80">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3.5">Usuário (Planilha / Sistema)</th>
                            <th className="py-2.5 px-3.5">MASP</th>
                            <th className="py-2.5 px-3.5">Cargo</th>
                            <th className="py-2.5 px-3.5">Unidade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {excelImportResult.alreadyRegisteredUsers.map((u, idx) => (
                            <tr key={`${u.masp}-${idx}`} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3.5">
                                <span className="font-bold text-slate-100">{u.existingName || u.name}</span>
                                {u.name && u.existingName && normalizeStr(u.name) !== normalizeStr(u.existingName) && (
                                  <span className="block text-[10px] text-slate-400">
                                    Na planilha: {u.name}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3.5 font-mono text-amber-400 font-semibold">
                                {formatMasp(u.masp)}
                              </td>
                              <td className="py-2 px-3.5 text-slate-300">{u.cargo || '-'}</td>
                              <td className="py-2 px-3.5 text-slate-400">{u.unitName || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300">
                    Nenhum MASP da planilha constava previamente cadastrado no sistema.
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setExcelImportResult(null);
                      setExcelRows([]);
                      setExcelFileName('');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
                  >
                    Anexar Outra Planilha
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExcelImportModal(false)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl shadow transition"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            ) : (
              /* Attachment & Preview View */
              <div className="space-y-4">
                {/* Default Rules Info Card */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      Configurações Padrão Aplicadas Automaticamente
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadExcelTemplate}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-lg transition flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Modelo (usuarios.xlsx)</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                      <span className="text-slate-400 block text-[10px]">Perfil</span>
                      <strong className="text-emerald-300">Policial</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                      <span className="text-slate-400 block text-[10px]">Abrangência</span>
                      <strong className="text-slate-200">Apenas Unidade</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                      <span className="text-slate-400 block text-[10px]">Acesso ao Sistema</span>
                      <strong className="text-emerald-400">SIM</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                      <span className="text-slate-400 block text-[10px]">Movimentar Munições</span>
                      <strong className="text-emerald-400">SIM</strong>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                      <span className="text-slate-400 block text-[10px]">Movimentar Armas</span>
                      <strong className="text-emerald-400">SIM</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Caso conste na tabela algum <strong>MASP</strong> já cadastrado no sistema, ele será ignorado automaticamente e listado ao término da gravação. A senha inicial dos novos usuários será o número do MASP.
                  </p>
                </div>

                {/* File Input Dropzone */}
                <input
                  ref={excelFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileSelected}
                  className="hidden"
                />

                <div
                  onClick={() => excelFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-950/60 hover:bg-slate-950 rounded-2xl p-6 text-center cursor-pointer transition group"
                >
                  <Upload className="w-8 h-8 mx-auto text-emerald-400 group-hover:scale-105 transition mb-2" />
                  <p className="text-sm font-bold text-slate-200">
                    {excelFileName
                      ? `Planilha selecionada: ${excelFileName}`
                      : 'Clique aqui para anexar a tabela do Excel de Usuários'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Colunas esperadas: <span className="font-mono text-amber-400">NOME</span>, <span className="font-mono text-amber-400">MASP</span>, <span className="font-mono text-amber-400">CARGO</span> e <span className="font-mono text-amber-400">UNIDADE</span>
                  </p>
                </div>

                {excelModalError && (
                  <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{excelModalError}</span>
                  </div>
                )}

                {/* Parsed Rows Preview */}
                {excelRows.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-lg font-semibold">
                          Total lido: <strong>{excelRows.length}</strong>
                        </span>
                        <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-lg font-semibold">
                          Novos para gravar: <strong>{excelRows.filter(r => !r.alreadyRegistered).length}</strong>
                        </span>
                        {excelRows.some(r => r.alreadyRegistered) && (
                          <span className="bg-amber-950 text-amber-300 border border-amber-800 px-2.5 py-1 rounded-lg font-semibold">
                            Já cadastrados (serão ignorados): <strong>{excelRows.filter(r => r.alreadyRegistered).length}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/80">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3">Nome</th>
                            <th className="py-2.5 px-3">MASP</th>
                            <th className="py-2.5 px-3">Cargo</th>
                            <th className="py-2.5 px-3">Unidade</th>
                            <th className="py-2.5 px-3 text-right">Situação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {excelRows.map((row) => (
                            <tr
                              key={row.rowIndex}
                              className={row.alreadyRegistered ? 'bg-slate-900/40 opacity-75' : 'hover:bg-slate-900/60'}
                            >
                              <td className="py-2 px-3 font-semibold text-slate-100">{row.name}</td>
                              <td className="py-2 px-3 font-mono text-amber-400">{formatMasp(row.masp)}</td>
                              <td className="py-2 px-3">{row.cargo}</td>
                              <td className="py-2 px-3">
                                {row.alreadyRegistered ? (
                                  <span className="text-slate-400">{row.matchedUnitName || row.rawUnitName || '-'}</span>
                                ) : row.matchedUnitId ? (
                                  <span className="text-emerald-300 font-medium">{row.matchedUnitName}</span>
                                ) : (
                                  <div className="space-y-1">
                                    {row.rawUnitName && (
                                      <span className="block text-[10px] text-amber-400">
                                        Planilha: &quot;{row.rawUnitName}&quot;
                                      </span>
                                    )}
                                    <select
                                      value={row.matchedUnitId}
                                      onChange={(e) => handleChangeRowUnit(row.rowIndex, row.rawUnitName, e.target.value)}
                                      className="bg-slate-900 border border-amber-500/60 rounded-lg px-2 py-1 text-[11px] text-slate-100 w-full max-w-[220px]"
                                    >
                                      <option value="">Selecione a unidade...</option>
                                      {allowedUnitsForExcel.map((u) => (
                                        <option key={u.id} value={u.id}>
                                          {u.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {row.alreadyRegistered ? (
                                  <span className="inline-block bg-slate-800 text-amber-300 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                    Já cadastrado (ignorar)
                                  </span>
                                ) : (
                                  <span className="inline-block bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                    Novo cadastro
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex justify-end items-center gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowExcelImportModal(false)}
                    disabled={isImportingExcel}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmExcelImport}
                    disabled={excelRows.length === 0 || isImportingExcel}
                    className={`font-bold text-xs px-5 py-2.5 rounded-xl shadow transition flex items-center space-x-1.5 ${
                      excelRows.length === 0 || isImportingExcel
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>{isImportingExcel ? 'Gravando Usuários...' : 'Gravar Usuários'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetUser}
        title="Confirmar Exclusão"
        message={`Deseja realmente apagar permanentemente ${deleteTargetUser?.name || 'este item'} do sistema?`}
        onConfirm={confirmExecuteDeleteUser}
        onCancel={() => setDeleteTargetUser(null)}
      />

    </div>
  );
};
