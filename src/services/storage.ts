import {
  User,
  Department,
  Unit,
  Course,
  VaultSpace,
  Caliber,
  AmmunitionStock,
  AmmunitionMovement,
  AmmoMovementType,
  Weapon,
  Movement,
  AuditLog,
  UserRole
} from '../types';
import { isCourseExpired } from '../utils/masks';

const STORAGE_KEY = 'armeria_db_v1';

interface AppState {
  users: User[];
  departments: Department[];
  units: Unit[];
  courses: Course[];
  vaultSpaces: VaultSpace[];
  calibers: Caliber[];
  ammoStocks: AmmunitionStock[];
  ammoMovements: AmmunitionMovement[];
  weapons: Weapon[];
  movements: Movement[];
  auditLogs: AuditLog[];
  currentUser: User | null;
}

const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: 'dept-coe',
    name: 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)',
    code: 'DOE-COE',
    createdAt: new Date().toISOString()
  },
  {
    id: 'dept-dhpp',
    name: 'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA (DHPP)',
    code: 'DHPP',
    createdAt: new Date().toISOString()
  },
  {
    id: 'dept-dic',
    name: 'DEPARTAMENTO DE INVESTIGAÇÕES CRIMINAIS (DIC)',
    code: 'DIC',
    createdAt: new Date().toISOString()
  }
];

const INITIAL_UNITS: Unit[] = [
  {
    id: 'unit-coe-insp',
    name: 'INSPETORIA COE',
    departmentId: 'dept-coe',
    createdAt: new Date().toISOString()
  },
  {
    id: 'unit-coe-grt',
    name: 'GRUPO DE RESGATE TÁTICO (GRT)',
    departmentId: 'dept-coe',
    createdAt: new Date().toISOString()
  },
  {
    id: 'unit-dhpp-1',
    name: '1ª DELEGACIA DE HOMICÍDIOS',
    departmentId: 'dept-dhpp',
    createdAt: new Date().toISOString()
  },
  {
    id: 'unit-dic-cargas',
    name: 'DELEGACIA DE REPRESSÃO AO ROUBO DE CARGAS',
    departmentId: 'dept-dic',
    createdAt: new Date().toISOString()
  }
];

const INITIAL_CALIBERS: Caliber[] = [
  { id: 'cal-556', name: '5,56x45mm', createdAt: new Date().toISOString() },
  { id: 'cal-40', name: '.40 S&W', createdAt: new Date().toISOString() },
  { id: 'cal-9mm', name: '9x19mm', createdAt: new Date().toISOString() },
  { id: 'cal-380', name: '.380 ACP', createdAt: new Date().toISOString() },
  { id: 'cal-12ga', name: '12 GA', createdAt: new Date().toISOString() }
];

const INITIAL_COURSES: Course[] = [
  {
    id: 'course-fuzil',
    name: 'Operador de fuzil',
    allowedModels: ['T4', 'IA2', 'M4A1'],
    allowedCalibers: ['5,56x45mm'],
    departmentId: 'dept-coe',
    createdAt: new Date().toISOString()
  },
  {
    id: 'course-pistola',
    name: 'Operador de Pistola',
    allowedModels: ['PT92', 'Glock G22', 'TH40', 'PT840'],
    allowedCalibers: ['.40 S&W', '9x19mm'],
    departmentId: 'dept-coe',
    createdAt: new Date().toISOString()
  },
  {
    id: 'course-12',
    name: 'Operador de Espingarda C12',
    allowedModels: ['CBC 586-P', 'Benelli M4'],
    allowedCalibers: ['12 GA'],
    departmentId: 'dept-coe',
    createdAt: new Date().toISOString()
  }
];

const INITIAL_VAULTS: VaultSpace[] = [
  {
    id: 'vault-coe-1',
    code: 'A1-G1',
    type: 'ARMAS',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vault-coe-2',
    code: 'A1-G2',
    type: 'ARMAS',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vault-coe-3',
    code: 'C1-L1',
    type: 'MUNIÇÕES',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vault-coe-4',
    code: 'C1-L2',
    type: 'MUNIÇÕES',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vault-dhpp-1',
    code: 'B1-G1',
    type: 'ARMAS',
    departmentId: 'dept-dhpp',
    unitId: 'unit-dhpp-1',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vault-dhpp-2',
    code: 'M1-L1',
    type: 'MUNIÇÕES',
    departmentId: 'dept-dhpp',
    unitId: 'unit-dhpp-1',
    createdAt: new Date().toISOString()
  }
];

const INITIAL_USERS: User[] = [
  {
    id: 'usr-master-geral',
    masp: '1255748',
    password: '1255748',
    name: 'Administrador Geral Master',
    cargo: 'Delegado',
    phone: '31999998888',
    role: 'Geral',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    canMoveAmmunition: true,
    canMoveWeapons: true,
    hasSystemAccess: true,
    mustChangePassword: true, // Default per prompt: initial login asks to change password
    courses: [
      { courseId: 'course-fuzil', completionDate: '2025-10-15' },
      { courseId: 'course-pistola', completionDate: '2025-11-20' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr-admin-coe',
    masp: '2222222',
    password: '2222222',
    name: 'Dr. Roberto Silva (Admin DOE)',
    cargo: 'Delegado',
    phone: '31988887777',
    role: 'Administrador',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    canMoveAmmunition: true,
    canMoveWeapons: true,
    hasSystemAccess: true,
    mustChangePassword: false,
    courses: [
      { courseId: 'course-fuzil', completionDate: '2025-05-10' },
      { courseId: 'course-pistola', completionDate: '2025-06-01' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr-armeiro-coe',
    masp: '3333333',
    password: '3333333',
    name: 'Agente Carlos Andrade (Armeiro COE)',
    cargo: 'Investigador',
    phone: '31977776666',
    role: 'Armeiro',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    canMoveAmmunition: true,
    canMoveWeapons: true,
    hasSystemAccess: true,
    mustChangePassword: false,
    courses: [
      { courseId: 'course-fuzil', completionDate: '2025-01-15' },
      { courseId: 'course-pistola', completionDate: '2025-02-10' },
      { courseId: 'course-12', completionDate: '2025-03-01' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr-policial-coe',
    masp: '4444444',
    password: '4444444',
    name: 'Policial Eduardo Costa',
    cargo: 'Investigador',
    phone: '31966665555',
    role: 'Policial',
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    canMoveAmmunition: false,
    canMoveWeapons: false,
    hasSystemAccess: true,
    mustChangePassword: false,
    courses: [
      { courseId: 'course-fuzil', completionDate: '2025-08-12' },
      { courseId: 'course-pistola', completionDate: '2023-01-10' } // Expired course (> 2 years old) to test UI!
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr-policial-dhpp',
    masp: '5555555',
    password: '5555555',
    name: 'Escrivã Ana Lima',
    cargo: 'Escrivão',
    phone: '31955554444',
    role: 'Policial',
    departmentId: 'dept-dhpp',
    unitId: 'unit-dhpp-1',
    canMoveAmmunition: false,
    canMoveWeapons: false,
    hasSystemAccess: true,
    mustChangePassword: false,
    courses: [
      { courseId: 'course-pistola', completionDate: '2025-04-10' }
    ],
    createdAt: new Date().toISOString()
  }
];

const INITIAL_WEAPONS: Weapon[] = [
  {
    id: 'weap-1',
    type: 'Fuzil',
    serialNumber: 'EKG-5486',
    manufacturer: 'Taurus',
    model: 'T4',
    caliber: '5,56x45mm',
    magazineQuantity: 4,
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    vaultSpaceId: 'vault-coe-1',
    status: 'No Cofre',
    lastMaintenanceDate: '2026-05-10',
    lastMaintenanceResponsible: 'Agente Carlos Andrade',
    createdAt: new Date().toISOString()
  },
  {
    id: 'weap-2',
    type: 'Pistola',
    serialNumber: 'PT-998822',
    manufacturer: 'Taurus',
    model: 'PT92',
    caliber: '.40 S&W',
    magazineQuantity: 3,
    departmentId: 'dept-coe',
    unitId: 'unit-coe-insp',
    vaultSpaceId: 'vault-coe-2',
    status: 'No Cofre',
    lastMaintenanceDate: '2026-06-15',
    lastMaintenanceResponsible: 'Agente Carlos Andrade',
    createdAt: new Date().toISOString()
  },
  {
    id: 'weap-3',
    type: 'Espingarda',
    serialNumber: 'CBC-12009',
    manufacturer: 'CBC',
    model: 'CBC 586-P',
    caliber: '12 GA',
    magazineQuantity: 1,
    departmentId: 'dept-dhpp',
    unitId: 'unit-dhpp-1',
    vaultSpaceId: 'vault-dhpp-1',
    status: 'No Cofre',
    lastMaintenanceDate: '2026-04-01',
    lastMaintenanceResponsible: 'Armeiro DHPP',
    createdAt: new Date().toISOString()
  }
];

const INITIAL_STOCKS: AmmunitionStock[] = [
  {
    id: 'stock-1',
    caliberId: 'cal-556',
    vaultSpaceId: 'vault-coe-3',
    unitId: 'unit-coe-insp',
    departmentId: 'dept-coe',
    quantity: 2500
  },
  {
    id: 'stock-2',
    caliberId: 'cal-40',
    vaultSpaceId: 'vault-coe-4',
    unitId: 'unit-coe-insp',
    departmentId: 'dept-coe',
    quantity: 1200
  },
  {
    id: 'stock-3',
    caliberId: 'cal-9mm',
    vaultSpaceId: 'vault-dhpp-2',
    unitId: 'unit-dhpp-1',
    departmentId: 'dept-dhpp',
    quantity: 800
  }
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    userId: 'usr-master-geral',
    userName: 'Administrador Geral Master',
    userMasp: '1255748',
    userRole: 'Geral',
    module: 'Unidade',
    action: 'Criar',
    details: 'Inicialização do sistema e cadastro das unidades padrão',
    ipAddress: '192.168.1.100'
  }
];

class StorageService {
  private state: AppState;

  constructor() {
    this.state = this.loadInitialState();
  }

  private loadInitialState(): AppState {
    try {
      const saved = typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            users: Array.isArray(parsed.users) ? parsed.users : INITIAL_USERS,
            departments: Array.isArray(parsed.departments) ? parsed.departments : INITIAL_DEPARTMENTS,
            units: Array.isArray(parsed.units) ? parsed.units : INITIAL_UNITS,
            courses: Array.isArray(parsed.courses) ? parsed.courses : INITIAL_COURSES,
            vaultSpaces: Array.isArray(parsed.vaultSpaces) ? parsed.vaultSpaces : INITIAL_VAULTS,
            calibers: Array.isArray(parsed.calibers) ? parsed.calibers : INITIAL_CALIBERS,
            ammoStocks: Array.isArray(parsed.ammoStocks) ? parsed.ammoStocks : INITIAL_STOCKS,
            ammoMovements: Array.isArray(parsed.ammoMovements) ? parsed.ammoMovements : [],
            weapons: Array.isArray(parsed.weapons) ? parsed.weapons : INITIAL_WEAPONS,
            movements: Array.isArray(parsed.movements) ? parsed.movements : [],
            auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : INITIAL_AUDIT_LOGS,
            currentUser: null // Always start at login screen
          };
        }
      }
    } catch (e) {
      console.error('Failed to load storage, using default initial state', e);
    }

    const defaultState: AppState = {
      users: INITIAL_USERS,
      departments: INITIAL_DEPARTMENTS,
      units: INITIAL_UNITS,
      courses: INITIAL_COURSES,
      vaultSpaces: INITIAL_VAULTS,
      calibers: INITIAL_CALIBERS,
      ammoStocks: INITIAL_STOCKS,
      ammoMovements: [],
      weapons: INITIAL_WEAPONS,
      movements: [],
      auditLogs: INITIAL_AUDIT_LOGS,
      currentUser: null // Initial screen is always login
    };

    this.saveStateToStorage(defaultState);
    return defaultState;
  }

  private saveStateToStorage(newState?: AppState) {
    if (newState) {
      this.state = newState;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  // --- Audit Logging Helper ---
  public addAuditLog(
    module: AuditLog['module'],
    action: AuditLog['action'],
    details: string,
    overrideUser?: User
  ) {
    const actor = overrideUser || this.state.currentUser;
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      userId: actor ? actor.id : 'sistema',
      userName: actor ? actor.name : 'Sistema Armeria',
      userMasp: actor ? actor.masp : '000000',
      userRole: actor ? actor.role : 'Geral',
      module,
      action,
      details,
      ipAddress: '192.168.1.' + Math.floor(10 + Math.random() * 200)
    };

    this.state.auditLogs.unshift(log);
    this.saveStateToStorage();
  }

  // --- Auth & Session Methods ---
  public getCurrentUser(): User | null {
    return this.state.currentUser;
  }

  public setCurrentUser(user: User | null) {
    this.state.currentUser = user;
    this.saveStateToStorage();
  }

  public logout() {
    if (this.state.currentUser) {
      this.addAuditLog('Login', 'Login', `Usuário ${this.state.currentUser.name} efetuou logout`);
    }
    this.setCurrentUser(null);
  }

  public getAllUsersUnfiltered(): User[] {
    return this.state.users;
  }

  public getAllUsers(): User[] {
    return this.state.users;
  }

  public login(maspDigits: string, passwordDigits: string): { success: boolean; user?: User; error?: string } {
    const cleanMaspInput = maspDigits.replace(/\D/g, '');
    const cleanPassInput = passwordDigits.trim();

    const user = this.state.users.find(u => u.masp === cleanMaspInput);

    if (!user) {
      return { success: false, error: 'MASP ou senha incorretos.' };
    }

    if (!user.hasSystemAccess) {
      return { success: false, error: 'Usuário sem permissão de acesso ao sistema.' };
    }

    if (user.password !== cleanPassInput) {
      return { success: false, error: 'Senha incorreta.' };
    }

    this.setCurrentUser(user);
    this.addAuditLog('Login', 'Login', `Usuário ${user.name} (MASP ${user.masp}) efetuou login no sistema`);

    return { success: true, user };
  }

  public changePassword(userId: string, newPass: string): { success: boolean; error?: string } {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'Usuário não encontrado.' };

    const cleanNewPass = newPass.trim();

    if (cleanNewPass.length < 6) {
      return { success: false, error: 'A nova senha deve possuir no mínimo 6 caracteres.' };
    }

    // Rule: Cannot use MASP as new password
    if (cleanNewPass === user.masp) {
      return { success: false, error: 'A nova senha não pode ser igual ao MASP.' };
    }

    user.password = cleanNewPass;
    user.mustChangePassword = false;

    if (this.state.currentUser?.id === user.id) {
      this.state.currentUser = { ...user };
    }

    this.addAuditLog('Perfil', 'Alterar Senha', `Usuário ${user.name} alterou sua senha de acesso`);
    this.saveStateToStorage();

    return { success: true };
  }

  // --- Departments & Units ---
  public getDepartments(currentUser: User | null): Department[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.departments;
    
    // Admin, Armeiro, Policial only see their department
    return this.state.departments.filter(d => d.id === currentUser.departmentId);
  }

  public getAllDepartments(): Department[] {
    return this.state.departments;
  }

  public addDepartment(dept: Omit<Department, 'id' | 'createdAt'>): Department {
    const newDept: Department = {
      ...dept,
      id: `dept-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.state.departments.push(newDept);
    this.addAuditLog('Unidade', 'Criar', `Criado departamento: ${newDept.name} (${newDept.code})`);
    this.saveStateToStorage();
    return newDept;
  }

  public updateDepartment(id: string, name: string, code: string): Department | null {
    const index = this.state.departments.findIndex(d => d.id === id);
    if (index === -1) return null;

    this.state.departments[index].name = name;
    this.state.departments[index].code = code;
    this.addAuditLog('Unidade', 'Editar', `Atualizado departamento: ${name}`);
    this.saveStateToStorage();
    return this.state.departments[index];
  }

  public deleteDepartment(id: string): boolean {
    const dept = this.state.departments.find(d => d.id === id);
    if (!dept) return false;

    // Check if units exist
    const linkedUnits = this.state.units.filter(u => u.departmentId === id);
    if (linkedUnits.length > 0) {
      throw new Error(`Não é possível excluir o departamento "${dept.name}" porque existem ${linkedUnits.length} unidade(s) vinculada(s) a ele. Exclua ou altere as unidades primeiro.`);
    }

    this.state.departments = this.state.departments.filter(d => d.id !== id);
    this.addAuditLog('Unidade', 'Excluir', `Excluído departamento: ${dept.name}`);
    this.saveStateToStorage();
    return true;
  }

  public getUnits(currentUser: User | null): Unit[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.units;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.units.filter(u => u.departmentId === currentUser.departmentId);
    }
    // Policial only sees their own unit
    return this.state.units.filter(u => u.id === currentUser.unitId);
  }

  public getAllUnits(): Unit[] {
    return this.state.units;
  }

  public addUnit(unit: Omit<Unit, 'id' | 'createdAt'>): Unit {
    const newUnit: Unit = {
      ...unit,
      id: `unit-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.state.units.push(newUnit);
    this.addAuditLog('Unidade', 'Criar', `Criada unidade: ${newUnit.name}`);
    this.saveStateToStorage();
    return newUnit;
  }

  public updateUnit(id: string, name: string, departmentId: string): Unit | null {
    const index = this.state.units.findIndex(u => u.id === id);
    if (index === -1) return null;

    this.state.units[index].name = name;
    this.state.units[index].departmentId = departmentId;
    this.addAuditLog('Unidade', 'Editar', `Atualizada unidade: ${name}`);
    this.saveStateToStorage();
    return this.state.units[index];
  }

  public deleteUnit(id: string): boolean {
    const unit = this.state.units.find(u => u.id === id);
    if (!unit) return false;

    // Check if users or weapons belong to unit
    const linkedUsers = this.state.users.filter(u => u.unitId === id);
    const linkedWeapons = this.state.weapons.filter(w => w.unitId === id);

    if (linkedUsers.length > 0 || linkedWeapons.length > 0) {
      throw new Error(`Não é possível excluir a unidade "${unit.name}" porque ela possui ${linkedUsers.length} policial(is) e ${linkedWeapons.length} arma(s) cadastrada(s).`);
    }

    this.state.units = this.state.units.filter(u => u.id !== id);
    this.addAuditLog('Unidade', 'Excluir', `Excluída unidade: ${unit.name}`);
    this.saveStateToStorage();
    return true;
  }

  // --- Users Management ---
  public getUsers(currentUser: User | null): User[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.users;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.users.filter(u => u.departmentId === currentUser.departmentId);
    }
    // Policial sees officers in their own unit
    return this.state.users.filter(u => u.unitId === currentUser.unitId);
  }

  public addUser(userData: Omit<User, 'id' | 'createdAt'>): User {
    const cleanMaspNum = userData.masp.replace(/\D/g, '');

    // Check if MASP already exists
    if (this.state.users.some(u => u.masp === cleanMaspNum)) {
      throw new Error(`Já existe um usuário cadastrado com o MASP ${cleanMaspNum}`);
    }

    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}`,
      masp: cleanMaspNum,
      password: cleanMaspNum, // Default password = MASP
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    };

    this.state.users.push(newUser);
    this.addAuditLog('Usuários', 'Criar', `Cadastrado novo policial: ${newUser.name} (MASP: ${newUser.masp}, Cargo: ${newUser.cargo})`);
    this.saveStateToStorage();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | null {
    const index = this.state.users.findIndex(u => u.id === id);
    if (index === -1) return null;

    const existing = this.state.users[index];
    
    // If MASP updated, clean it
    let cleanMaspVal = existing.masp;
    if (updates.masp) {
      cleanMaspVal = updates.masp.replace(/\D/g, '');
    }

    const updatedUser: User = {
      ...existing,
      ...updates,
      masp: cleanMaspVal
    };

    this.state.users[index] = updatedUser;

    // If current logged in user was updated, keep current user synced
    if (this.state.currentUser?.id === id) {
      this.state.currentUser = { ...updatedUser };
    }

    this.addAuditLog('Usuários', 'Editar', `Atualizados dados do policial: ${updatedUser.name} (MASP: ${updatedUser.masp})`);
    this.saveStateToStorage();
    return updatedUser;
  }

  public deleteUser(id: string): boolean {
    const user = this.state.users.find(u => u.id === id);
    if (!user) return false;

    if (this.state.currentUser?.id === id) {
      throw new Error('Não é possível excluir o usuário com o qual você está atualmente conectado no sistema.');
    }

    // Check if user has active cautela/weapon loans or pending requests
    const activeLoan = this.state.movements.find(
      m => m.requesterId === id && (m.status === 'Em Trânsito' || m.status === 'Pendente Recibo' || m.status === 'Pendente Aprovação')
    );
    if (activeLoan) {
      throw new Error(`Não é possível excluir o policial ${user.name} pois ele possui solicitação ou armamento ativo em cautela (${activeLoan.status}).`);
    }

    this.state.users = this.state.users.filter(u => u.id !== id);
    this.addAuditLog('Usuários', 'Excluir', `Excluído policial: ${user.name} (MASP: ${user.masp})`);
    this.saveStateToStorage();
    return true;
  }

  // --- Courses Management ---
  public getCourses(): Course[] {
    return this.state.courses;
  }

  public addCourse(courseData: Omit<Course, 'id' | 'createdAt'>): Course {
    const newCourse: Course = {
      ...courseData,
      id: `course-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.state.courses.push(newCourse);
    this.addAuditLog('Cursos', 'Criar', `Criado curso: ${newCourse.name} (Modelos: ${newCourse.allowedModels.join(', ')}, Calibres: ${newCourse.allowedCalibers.join(', ')})`);
    this.saveStateToStorage();
    return newCourse;
  }

  public updateCourse(id: string, updates: Partial<Course>): Course | null {
    const index = this.state.courses.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.state.courses[index] = { ...this.state.courses[index], ...updates };
    this.addAuditLog('Cursos', 'Editar', `Atualizado curso: ${this.state.courses[index].name}`);
    this.saveStateToStorage();
    return this.state.courses[index];
  }

  public deleteCourse(id: string): boolean {
    const course = this.state.courses.find(c => c.id === id);
    if (!course) return false;

    const enrolledUsers = this.state.users.filter(u => u.courses && u.courses.some(c => c.courseId === id));
    if (enrolledUsers.length > 0) {
      throw new Error(`Não é possível excluir o curso "${course.name}" pois ele está vinculado ao cadastro de ${enrolledUsers.length} policial(is). Desvincule o curso dos policiais primeiro.`);
    }

    this.state.courses = this.state.courses.filter(c => c.id !== id);
    this.addAuditLog('Cursos', 'Excluir', `Excluído curso: ${course.name}`);
    this.saveStateToStorage();
    return true;
  }

  // --- Vault Spaces ---
  public getVaultSpaces(currentUser: User | null): VaultSpace[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.vaultSpaces;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.vaultSpaces.filter(v => v.departmentId === currentUser.departmentId);
    }
    return this.state.vaultSpaces.filter(v => v.unitId === currentUser.unitId);
  }

  public addVaultSpace(vault: Omit<VaultSpace, 'id' | 'createdAt'>): VaultSpace {
    const newVault: VaultSpace = {
      ...vault,
      id: `vault-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.state.vaultSpaces.push(newVault);
    this.addAuditLog('Cofre', 'Criar', `Criado local de guarda: ${newVault.code} (${newVault.type})`);
    this.saveStateToStorage();
    return newVault;
  }

  public deleteVaultSpace(id: string): boolean {
    const vault = this.state.vaultSpaces.find(v => v.id === id);
    if (!vault) return false;

    // Check if weapon or ammo is stored in this vault
    const hasWeapon = this.state.weapons.some(w => w.vaultSpaceId === id && w.status === 'No Cofre');
    const hasAmmo = this.state.ammoStocks.some(s => s.vaultSpaceId === id && s.quantity > 0);

    if (hasWeapon || hasAmmo) {
      throw new Error(`Não é possível excluir o local do cofre "${vault.code}" pois há armas ou munições armazenadas nele.`);
    }

    this.state.vaultSpaces = this.state.vaultSpaces.filter(v => v.id !== id);
    this.addAuditLog('Cofre', 'Excluir', `Excluído local do cofre: ${vault.code}`);
    this.saveStateToStorage();
    return true;
  }

  // --- Calibers & Ammo ---
  public getCalibers(): Caliber[] {
    return this.state.calibers;
  }

  public addCaliber(name: string): Caliber {
    const cleanName = name.trim();
    if (this.state.calibers.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('Este calibre já está cadastrado.');
    }

    const newCaliber: Caliber = {
      id: `cal-${Date.now()}`,
      name: cleanName,
      createdAt: new Date().toISOString()
    };
    this.state.calibers.push(newCaliber);
    this.addAuditLog('Munições', 'Criar', `Cadastrado calibre: ${newCaliber.name}`);
    this.saveStateToStorage();
    return newCaliber;
  }

  public getAmmoStocks(currentUser: User | null): AmmunitionStock[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.ammoStocks;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.ammoStocks.filter(s => s.departmentId === currentUser.departmentId);
    }
    return this.state.ammoStocks.filter(s => s.unitId === currentUser.unitId);
  }

  public getAmmoMovements(currentUser: User | null): AmmunitionMovement[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.ammoMovements;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.ammoMovements.filter(m => m.departmentId === currentUser.departmentId);
    }
    return this.state.ammoMovements.filter(m => m.unitId === currentUser.unitId);
  }

  public recordAmmoMovement(data: {
    type: AmmoMovementType;
    caliberId: string;
    quantity: number;
    vaultSpaceId: string;
    recipientOrReason: string;
  }): AmmunitionMovement {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Sessão expirada');

    const vault = this.state.vaultSpaces.find(v => v.id === data.vaultSpaceId);
    if (!vault) throw new Error('Local do cofre não encontrado');

    if (vault.type !== 'MUNIÇÕES') {
      throw new Error('O local selecionado no cofre não é exclusivo para munições.');
    }

    // Find or create ammo stock
    let stock = this.state.ammoStocks.find(s => s.vaultSpaceId === data.vaultSpaceId && s.caliberId === data.caliberId);

    if (data.type === 'Saída') {
      if (!stock || stock.quantity < data.quantity) {
        throw new Error(`Estoque insuficiente no cofre (${stock ? stock.quantity : 0} disponíveis).`);
      }
      stock.quantity -= data.quantity;
    } else {
      if (!stock) {
        stock = {
          id: `stock-${Date.now()}`,
          caliberId: data.caliberId,
          vaultSpaceId: data.vaultSpaceId,
          unitId: vault.unitId,
          departmentId: vault.departmentId,
          quantity: 0
        };
        this.state.ammoStocks.push(stock);
      }
      stock.quantity += data.quantity;
    }

    const caliber = this.state.calibers.find(c => c.id === data.caliberId);

    const movement: AmmunitionMovement = {
      id: `ammomov-${Date.now()}`,
      type: data.type,
      caliberId: data.caliberId,
      quantity: data.quantity,
      vaultSpaceId: data.vaultSpaceId,
      unitId: vault.unitId,
      departmentId: vault.departmentId,
      recipientOrReason: data.recipientOrReason,
      userId: actor.id,
      userName: actor.name,
      createdAt: new Date().toISOString()
    };

    this.state.ammoMovements.unshift(movement);
    this.addAuditLog('Munições', data.type === 'Entrada' ? 'Criar' : 'Excluir', `${data.type} de ${data.quantity} munições calibre ${caliber?.name || ''} - Destino/Motivo: ${data.recipientOrReason}`);
    this.saveStateToStorage();
    return movement;
  }

  // --- Weapons ---
  public getWeapons(currentUser: User | null): Weapon[] {
    if (!currentUser) return [];

    let result: Weapon[] = [];
    if (currentUser.role === 'Geral') {
      result = this.state.weapons;
    } else if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      result = this.state.weapons.filter(w => w.departmentId === currentUser.departmentId);
    } else {
      // Policial: only see weapons in their unit
      result = this.state.weapons.filter(w => w.unitId === currentUser.unitId);
      
      // CRITICAL: Filter weapons to ONLY those for which the officer has a VALID course (< 2 years old)
      const validCourses = currentUser.courses.filter(c => !isCourseExpired(c.completionDate));
      const qualifiedCourseObjects = this.state.courses.filter(courseObj => 
        validCourses.some(vc => vc.courseId === courseObj.id)
      );

      result = result.filter(weapon => {
        return qualifiedCourseObjects.some(course => {
          const modelMatch = course.allowedModels.some(m => m.toLowerCase() === weapon.model.toLowerCase());
          const caliberMatch = course.allowedCalibers.some(c => c.toLowerCase() === weapon.caliber.toLowerCase());
          return modelMatch && caliberMatch;
        });
      });
    }

    return result;
  }

  public getAllWeaponsForAdmin(currentUser: User | null): Weapon[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.weapons;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.weapons.filter(w => w.departmentId === currentUser.departmentId);
    }
    return this.state.weapons.filter(w => w.unitId === currentUser.unitId);
  }

  public addWeapon(data: Omit<Weapon, 'id' | 'createdAt' | 'status'>): Weapon {
    const actor = this.state.currentUser;

    if (this.state.weapons.some(w => w.serialNumber.toLowerCase() === data.serialNumber.toLowerCase().trim())) {
      throw new Error(`Já existe uma arma cadastrada com o nº de série ${data.serialNumber}`);
    }

    const newWeapon: Weapon = {
      ...data,
      serialNumber: data.serialNumber.toUpperCase().trim(),
      id: `weap-${Date.now()}`,
      status: 'No Cofre',
      createdAt: new Date().toISOString()
    };

    this.state.weapons.push(newWeapon);
    this.addAuditLog('Armas', 'Criar', `Cadastrada arma ${newWeapon.type} modelo ${newWeapon.model} (Série: ${newWeapon.serialNumber}, Calibre: ${newWeapon.caliber})`);
    this.saveStateToStorage();
    return newWeapon;
  }

  public updateWeapon(id: string, updates: Partial<Weapon>): Weapon | null {
    const index = this.state.weapons.findIndex(w => w.id === id);
    if (index === -1) return null;

    this.state.weapons[index] = { ...this.state.weapons[index], ...updates };
    this.addAuditLog('Armas', 'Editar', `Atualizados dados da arma nº de série ${this.state.weapons[index].serialNumber}`);
    this.saveStateToStorage();
    return this.state.weapons[index];
  }

  public deleteWeapon(id: string): boolean {
    const weapon = this.state.weapons.find(w => w.id === id);
    if (!weapon) return false;

    if (weapon.status !== 'No Cofre') {
      throw new Error('Armas em trânsito ou com movimentação pendente não podem ser excluídas.');
    }

    this.state.weapons = this.state.weapons.filter(w => w.id !== id);
    this.addAuditLog('Armas', 'Excluir', `Excluída arma ${weapon.type} ${weapon.model} (Série: ${weapon.serialNumber})`);
    this.saveStateToStorage();
    return true;
  }

  // --- Movements (Weapon Retiradas e Devoluções) ---
  public getMovements(currentUser: User | null): Movement[] {
    if (!currentUser) return [];
    if (currentUser.role === 'Geral') return this.state.movements;
    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      return this.state.movements.filter(m => m.departmentId === currentUser.departmentId);
    }
    return this.state.movements.filter(m => m.unitId === currentUser.unitId);
  }

  public getWeaponMovementHistory(weaponId: string): Movement[] {
    return this.state.movements
      .filter(m => m.weaponId === weaponId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5); // Last 5 movements per specification
  }

  // Request withdrawal
  public requestWithdrawal(data: {
    weaponId: string;
    ammunitionCount: number;
    magazineCount: number;
  }): Movement {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Sessão expirada');

    const weapon = this.state.weapons.find(w => w.id === data.weaponId);
    if (!weapon) throw new Error('Arma não encontrada');

    if (weapon.status !== 'No Cofre') {
      throw new Error(`Esta arma não está disponível no cofre (Status atual: ${weapon.status}).`);
    }

    // Verify course qualification for Policial
    if (actor.role === 'Policial') {
      const validUserCourses = actor.courses.filter(c => !isCourseExpired(c.completionDate));
      const qualifiedCourses = this.state.courses.filter(courseObj => 
        validUserCourses.some(vc => vc.courseId === courseObj.id)
      );

      const isQualified = qualifiedCourses.some(course => {
        const modelMatch = course.allowedModels.some(m => m.toLowerCase() === weapon.model.toLowerCase());
        const caliberMatch = course.allowedCalibers.some(c => c.toLowerCase() === weapon.caliber.toLowerCase());
        return modelMatch && caliberMatch;
      });

      if (!isQualified) {
        throw new Error('Você não possui curso válido (realizado nos últimos 2 anos) para operar esta arma.');
      }
    }

    const movement: Movement = {
      id: `mov-${Date.now()}`,
      weaponId: weapon.id,
      weaponSerialNumber: weapon.serialNumber,
      weaponModel: weapon.model,
      weaponType: weapon.type,
      departmentId: weapon.departmentId,
      unitId: weapon.unitId,
      requesterId: actor.id,
      requesterName: actor.name,
      requesterMasp: actor.masp,
      ammunitionCount: data.ammunitionCount,
      magazineCount: data.magazineCount,
      caliber: weapon.caliber,
      status: 'Pendente Aprovação',
      withdrawalVaultSpaceId: weapon.vaultSpaceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.state.movements.unshift(movement);
    this.addAuditLog('Movimentações', 'Solicitar', `Solicitada retirada de arma ${weapon.model} (Série: ${weapon.serialNumber}), ${data.ammunitionCount} munições e ${data.magazineCount} carregadores por ${actor.name}`);
    this.saveStateToStorage();
    return movement;
  }

  // Approve withdrawal
  public approveWithdrawal(movementId: string): Movement {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Sessão expirada');

    const movement = this.state.movements.find(m => m.id === movementId);
    if (!movement) throw new Error('Solicitação de movimentação não encontrada');

    const weapon = this.state.weapons.find(w => w.id === movement.weaponId);
    if (!weapon) throw new Error('Arma vinculada não encontrada');

    movement.status = 'Em Trânsito';
    movement.approvedByUserId = actor.id;
    movement.approvedByUserName = actor.name;
    movement.approvalDate = new Date().toISOString();
    movement.updatedAt = new Date().toISOString();

    // Weapon status changes to Em Trânsito
    weapon.status = 'Em Trânsito';
    weapon.currentMovementId = movement.id;

    this.addAuditLog('Movimentações', 'Aprovar', `Aprovada retirada da arma ${weapon.model} (${weapon.serialNumber}) para o policial ${movement.requesterName} por ${actor.name}`);
    this.saveStateToStorage();
    return movement;
  }

  // Request return
  public requestReturn(data: {
    movementId: string;
    returnVaultSpaceId: string;
    returningAmmunitionCount: number;
    returningMagazineCount: number;
    divergenceJustification?: string;
  }): Movement {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Sessão expirada');

    const movement = this.state.movements.find(m => m.id === data.movementId);
    if (!movement) throw new Error('Movimentação não encontrada');

    const weapon = this.state.weapons.find(w => w.id === movement.weaponId);
    if (!weapon) throw new Error('Arma não encontrada');

    // Check divergence
    const ammoDivergent = data.returningAmmunitionCount !== movement.ammunitionCount;
    const magDivergent = data.returningMagazineCount !== movement.magazineCount;

    if ((ammoDivergent || magDivergent) && !data.divergenceJustification?.trim()) {
      throw new Error('Divergência detectada na quantidade de munições/carregadores. A justificativa é obrigatória.');
    }

    movement.status = 'Pendente Recibo';
    movement.returnVaultSpaceId = data.returnVaultSpaceId;
    movement.returningAmmunitionCount = data.returningAmmunitionCount;
    movement.returningMagazineCount = data.returningMagazineCount;
    movement.divergenceJustification = data.divergenceJustification?.trim() || '';
    movement.updatedAt = new Date().toISOString();

    weapon.status = 'Pendente de Recibo';

    this.addAuditLog('Movimentações', 'Devolver', `Solicitada devolução da arma ${weapon.model} (${weapon.serialNumber}) por ${actor.name}`);
    this.saveStateToStorage();
    return movement;
  }

  // Confirm receipt
  public confirmReceipt(movementId: string): Movement {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Sessão expirada');

    const movement = this.state.movements.find(m => m.id === movementId);
    if (!movement) throw new Error('Movimentação não encontrada');

    const weapon = this.state.weapons.find(w => w.id === movement.weaponId);
    if (!weapon) throw new Error('Arma não encontrada');

    movement.status = 'Concluído';
    movement.receiptConfirmedByUserId = actor.id;
    movement.receiptConfirmedByUserName = actor.name;
    movement.receiptDate = new Date().toISOString();
    movement.updatedAt = new Date().toISOString();

    weapon.status = 'No Cofre';
    if (movement.returnVaultSpaceId) {
      weapon.vaultSpaceId = movement.returnVaultSpaceId;
    }
    weapon.currentMovementId = undefined;

    this.addAuditLog('Movimentações', 'Confirmar Recibo', `Confirmado recibo de devolução da arma ${weapon.model} (${weapon.serialNumber}) por ${actor.name}`);
    this.saveStateToStorage();
    return movement;
  }

  // --- Reports & Auditing ---
  public getAuditLogs(): AuditLog[] {
    return this.state.auditLogs;
  }

  public resetToSeedData() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this.loadInitialState();
  }
}

export const storage = new StorageService();
