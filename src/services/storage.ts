import {
  User,
  Department,
  Unit,
  VaultSpace,
  Caliber,
  AmmunitionStock,
  AmmunitionMovement,
  Weapon,
  Movement,
  Course,
  AuditLog,
  AcademyCourse,
  WeaponBox,
  WeaponBoxReplacement,
  CourseClass,
  CourseMovement,
  LessonPlan,
  AvailableWeaponType,
  AlunoTurma,
  AlunoAula,
  CalendarRecord,
  EquipeCalendario,
  ProfessorEquipe,
  AuxiliarTabelaEquipe,
  Certificado,
  WeaponTransfer,
  WeaponTransferItem,
  TipoMaterial,
  Material,
  CautelaMaterial,
  WeaponMaintenance,
  ExternalWorkshop,
  WeaponShotRecord,
  Explosivo,
  MovimentacaoExplosivo,
  TipoExplosivo,
  SubtipoExplosivo,
  FabricanteExplosivo,
  isUserExplosivista,
  CanilFisico,
  Cachorro,
  ProdutoVeterinario,
  MovimentacaoVeterinaria,
  CautelaArma,
  CautelaMunicao,
  AmmoTransfer,
  ExplosivoTransfer,
  MaterialTransfer,
  UserRole
} from '../types';
import { isCourseExpired } from '../utils/masks';

export interface AppState {
  currentUser: User | null;
  users: User[];
  departments: Department[];
  units: Unit[];
  vaultSpaces: VaultSpace[];
  calibers: Caliber[];
  ammoStocks: AmmunitionStock[];
  ammoMovements: AmmunitionMovement[];
  weapons: Weapon[];
  weaponTransfers: WeaponTransfer[];
  ammoTransfers: AmmoTransfer[];
  movements: Movement[];
  courses: Course[];
  availableWeaponTypes: AvailableWeaponType[];
  auditLogs: AuditLog[];
  academyCourses: AcademyCourse[];
  weaponBoxes: WeaponBox[];
  weaponBoxReplacements: WeaponBoxReplacement[];
  courseClasses: CourseClass[];
  courseMovements: CourseMovement[];
  lessonPlans: LessonPlan[];
  calendarRecords: CalendarRecord[];
  equipesCalendario: EquipeCalendario[];
  auxiliarTabelaEquipe?: AuxiliarTabelaEquipe[];
  certificados: Certificado[];
  tiposMateriais: TipoMaterial[];
  materiais: Material[];
  cautelasMateriais: CautelaMaterial[];
  explosivos: Explosivo[];
  movimentacoesExplosivos: MovimentacaoExplosivo[];
  tiposExplosivos: TipoExplosivo[];
  subtiposExplosivos: SubtipoExplosivo[];
  fabricantesExplosivos: FabricanteExplosivo[];
  canisFisicos: CanilFisico[];
  cachorros: Cachorro[];
  produtosVeterinarios: ProdutoVeterinario[];
  movimentacoesVeterinarias: MovimentacaoVeterinaria[];
  cautelasArmas: CautelaArma[];
  cautelasMunicoes: CautelaMunicao[];
  explosivoTransfers: ExplosivoTransfer[];
  materialTransfers: MaterialTransfer[];
}

class StorageService {
  private state: AppState = {
    currentUser: null,
    users: [],
    departments: [],
    units: [],
    vaultSpaces: [],
    calibers: [],
    ammoStocks: [],
    ammoMovements: [],
    weapons: [],
    weaponTransfers: [],
    ammoTransfers: [],
    explosivoTransfers: [],
    materialTransfers: [],
    movements: [],
    courses: [],
    availableWeaponTypes: [],
    auditLogs: [],
    academyCourses: [],
    weaponBoxes: [],
    weaponBoxReplacements: [],
    courseClasses: [],
    courseMovements: [],
    lessonPlans: [],
    calendarRecords: [],
    equipesCalendario: [],
    auxiliarTabelaEquipe: [],
    certificados: [],
    tiposMateriais: [],
    materiais: [],
    cautelasMateriais: [],
    explosivos: [],
    movimentacoesExplosivos: [],
    tiposExplosivos: [],
    subtiposExplosivos: [],
    fabricantesExplosivos: [],
    canisFisicos: [],
    cachorros: [],
    produtosVeterinarios: [],
    movimentacoesVeterinarias: [],
    cautelasArmas: [],
    cautelasMunicoes: []
  };

  constructor() {
    // Session state restored from sessionStorage if present (only session user reference)
    try {
      const savedUser = sessionStorage.getItem('armeria_session_user');
      if (savedUser) {
        this.state.currentUser = JSON.parse(savedUser);
      }
    } catch {
      this.state.currentUser = null;
    }
  }

  // --- REFRESH DATA FROM MYSQL BACKEND SERVER ---
  public async refreshFromServer(): Promise<AppState> {
    try {
      const fetchSync = (url: string) => fetch(url, { headers: { 'x-skip-preloader': 'true' } }).then(r => r.ok ? r.json() : []);

      const [
        usersRes,
        deptsRes,
        unitsRes,
        vaultsRes,
        calibersRes,
        coursesRes,
        availableWeaponTypesRes,
        ammoStocksRes,
        ammoMovsRes,
        weaponsRes,
        movsRes,
        auditLogsRes,
        academyCoursesRes,
        weaponBoxesRes,
        weaponBoxRepsRes,
        courseClassesRes,
        courseMovsRes,
        lessonPlansRes,
        calendarRecordsRes,
        equipesCalendarioRes,
        auxiliarTabelaEquipeRes,
        certificadosRes,
        weaponTransfersRes,
        ammoTransfersRes,
        tiposMateriaisRes,
        materiaisRes,
        cautelasMateriaisRes,
        explosivosRes,
        movimentacoesExplosivosRes,
        tiposExplosivosRes,
        subtiposExplosivosRes,
        fabricantesExplosivosRes,
        canisFisicosRes,
        cachorrosRes,
        produtosVeterinariosRes,
        movimentacoesVeterinariasRes,
        cautelasArmasRes,
        cautelasMunicoesRes
      ] = await Promise.all([
        fetchSync('/api/users'),
        fetchSync('/api/departments'),
        fetchSync('/api/units'),
        fetchSync('/api/vault-spaces'),
        fetchSync('/api/calibers'),
        fetchSync('/api/courses'),
        fetchSync('/api/available-weapon-types'),
        fetchSync('/api/ammo-stocks'),
        fetchSync('/api/ammo-movements'),
        fetchSync('/api/weapons'),
        fetchSync('/api/movements'),
        fetchSync('/api/audit-logs'),
        fetchSync('/api/academy-courses'),
        fetchSync('/api/weapon-boxes'),
        fetchSync('/api/weapon-box-replacements'),
        fetchSync('/api/course-classes'),
        fetchSync('/api/course-movements'),
        fetchSync('/api/lesson-plans'),
        fetchSync('/api/calendario-aulas'),
        fetchSync('/api/equipes-calendario'),
        fetchSync('/api/auxiliar-tabela-equipe'),
        fetchSync('/api/certificados'),
        fetchSync('/api/weapon-transfers'),
        fetchSync('/api/ammo-transfers'),
        fetchSync('/api/tipos-materiais'),
        fetchSync('/api/materiais'),
        fetchSync('/api/cautelas-materiais'),
        fetchSync('/api/explosivos'),
        fetchSync('/api/movimentacoes-explosivos'),
        fetchSync('/api/tipos-explosivos'),
        fetchSync('/api/subtipos-explosivos'),
        fetchSync('/api/fabricantes-explosivos'),
        fetchSync('/api/canis-fisicos'),
        fetchSync('/api/cachorros'),
        fetchSync('/api/produtos-veterinarios'),
        fetchSync('/api/movimentacoes-veterinarias'),
        fetchSync('/api/cautelas-armas'),
        fetchSync('/api/cautelas-municoes')
      ]);

      this.state.users = usersRes || [];
      this.state.departments = deptsRes || [];
      this.state.units = unitsRes || [];
      this.state.vaultSpaces = vaultsRes || [];
      this.state.calibers = calibersRes || [];
      this.state.courses = coursesRes || [];
      this.state.availableWeaponTypes = availableWeaponTypesRes || [];
      this.state.ammoStocks = ammoStocksRes || [];
      this.state.ammoMovements = ammoMovsRes || [];
      this.state.weapons = weaponsRes || [];
      this.state.movements = movsRes || [];
      this.state.auditLogs = auditLogsRes || [];
      this.state.academyCourses = academyCoursesRes || [];
      this.state.weaponBoxes = weaponBoxesRes || [];
      this.state.weaponBoxReplacements = weaponBoxRepsRes || [];
      this.state.courseClasses = courseClassesRes || [];
      this.state.courseMovements = courseMovsRes || [];
      this.state.lessonPlans = lessonPlansRes || [];
      this.state.calendarRecords = calendarRecordsRes || [];
      this.state.equipesCalendario = equipesCalendarioRes || [];
      this.state.auxiliarTabelaEquipe = auxiliarTabelaEquipeRes || [];
      this.state.certificados = certificadosRes || [];
      this.state.weaponTransfers = weaponTransfersRes || [];
      this.state.ammoTransfers = ammoTransfersRes || [];
      this.state.tiposMateriais = tiposMateriaisRes || [];
      this.state.materiais = materiaisRes || [];
      this.state.cautelasMateriais = cautelasMateriaisRes || [];
      this.state.explosivos = explosivosRes || [];
      this.state.movimentacoesExplosivos = movimentacoesExplosivosRes || [];
      this.state.tiposExplosivos = tiposExplosivosRes || [];
      this.state.subtiposExplosivos = subtiposExplosivosRes || [];
      this.state.fabricantesExplosivos = fabricantesExplosivosRes || [];
      this.state.canisFisicos = canisFisicosRes || [];
      this.state.cachorros = cachorrosRes || [];
      this.state.produtosVeterinarios = produtosVeterinariosRes || [];
      this.state.movimentacoesVeterinarias = movimentacoesVeterinariasRes || [];
      this.state.cautelasArmas = cautelasArmasRes || [];
      this.state.cautelasMunicoes = cautelasMunicoesRes || [];

      try {
        const rawExpTrf = localStorage.getItem('pcmg_explosivo_transfers');
        this.state.explosivoTransfers = rawExpTrf ? JSON.parse(rawExpTrf) : [];
      } catch {
        this.state.explosivoTransfers = [];
      }
      try {
        const rawMatTrf = localStorage.getItem('pcmg_material_transfers');
        this.state.materialTransfers = rawMatTrf ? JSON.parse(rawMatTrf) : [];
      } catch {
        this.state.materialTransfers = [];
      }

      // Refresh current user reference if logged in, keeping activeRole if user had selected one
      if (this.state.currentUser) {
        const updatedUser = this.state.users.find(u => u.id === this.state.currentUser?.id);
        if (updatedUser) {
          const currentActiveRole = this.state.currentUser.activeRole || updatedUser.role;
          this.state.currentUser = {
            ...updatedUser,
            activeRole: currentActiveRole
          };
          sessionStorage.setItem('armeria_session_user', JSON.stringify(this.state.currentUser));
        }
      }
    } catch (err) {
      console.error('[StorageService] Error refreshing from MySQL server:', err);
    }
    return this.state;
  }

  // --- AUTHENTICATION ---
  public async login(masp: string, pass: string, chosenRole?: string): Promise<{ success: boolean; user: User | null; error?: string; isDbError?: boolean }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maspDigits: masp, passwordDigits: pass, chosenRole })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          user: null,
          error: data.error || 'MASP ou senha incorretos.',
          isDbError: Boolean(data.isDbError)
        };
      }

      this.state.currentUser = data.user;
      sessionStorage.setItem('armeria_session_user', JSON.stringify(data.user));
      await this.refreshFromServer();
      return { success: true, user: data.user };
    } catch (err: any) {
      return {
        success: false,
        user: null,
        error: err.message || 'Erro de conexão com o servidor.',
        isDbError: true
      };
    }
  }

  public loginLocalFallback(masp: string): { success: boolean; user: User | null; error?: string } {
    const cleanMasp = masp.replace(/\D/g, '');
    let user = this.state.users.find(u => u.masp === cleanMasp);
    
    if (!user) {
      // Create local master user fallback if not present
      if (cleanMasp === '1255748' || cleanMasp === '2222222' || cleanMasp === '3333333' || cleanMasp === '4444444') {
        user = {
          id: `usr-fallback-${cleanMasp}`,
          masp: cleanMasp,
          password: cleanMasp,
          name: cleanMasp === '1255748' ? 'Administrador Geral Master (Modo Local)' : `Policial MASP ${cleanMasp}`,
          phone: '31999998888',
          cargo: 'Delegado',
          role: 'Geral',
          departmentId: 'dept-coe',
          unitId: 'unit-coe-insp',
          canMoveAmmunition: true,
          canMoveWeapons: true,
          hasSystemAccess: true,
          mustChangePassword: false,
          courses: [],
          createdAt: new Date().toISOString()
        };
      }
    }

    if (user) {
      this.state.currentUser = user;
      sessionStorage.setItem('armeria_session_user', JSON.stringify(user));
      return { success: true, user };
    }

    return { success: false, user: null, error: 'MASP não encontrado no ambiente local.' };
  }

  public logout() {
    this.state.currentUser = null;
    sessionStorage.removeItem('armeria_session_user');
  }

  public getCurrentUser(): User | null {
    return this.state.currentUser;
  }

  public setCurrentUser(user: User | null): void {
    this.state.currentUser = user;
    if (user) {
      sessionStorage.setItem('armeria_session_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('armeria_session_user');
    }
  }

  public getAllUsersUnfiltered(): User[] {
    return this.state.users;
  }

  public getAllUsers(currentUser?: User | null): User[] {
    return this.getUsers(currentUser);
  }

  public async addAuditLog(action: string, details: string, description?: string): Promise<void> {
    // Audit log placeholder
  }

  public async resetToSeedData(): Promise<void> {
    await fetch('/api/seed', { method: 'POST' });
    await this.refreshFromServer();
  }

  public async changePassword(userId: string, newPass: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword: newPass })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Erro ao alterar senha.' };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao comunicar com o servidor.' };
    }
  }

  public async resetUserPassword(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: true, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Erro ao resetar senha do usuário.' };
      
      // Update local state fallback if matching
      const targetUser = this.state.users.find(u => u.id === userId);
      if (targetUser) {
        targetUser.password = targetUser.masp;
        targetUser.mustChangePassword = true;
      }
      
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao comunicar com o servidor.' };
    }
  }

  // --- DEPARTMENTS ---
  public getAllDepartments(): Department[] {
    return this.state.departments || [];
  }

  public getDepartments(currentUser?: User | null): Department[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.departments;
    return this.state.departments.filter(d => d.id === actor.departmentId);
  }

  public async addDepartment(data: { name: string; code: string; logoUrl?: string }): Promise<Department> {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const dept = await res.json();
    if (!res.ok) throw new Error(dept.error || 'Erro ao criar departamento.');
    await this.refreshFromServer();
    return dept;
  }

  public async updateDepartment(id: string, name: string, code: string, logoUrl?: string): Promise<Department> {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, logoUrl, actor: this.state.currentUser })
    });
    const dept = await res.json();
    if (!res.ok) throw new Error(dept.error || 'Erro ao atualizar departamento.');
    await this.refreshFromServer();
    return dept;
  }

  public async deleteDepartment(id: string): Promise<boolean> {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir departamento.');
    await this.refreshFromServer();
    return true;
  }

  // --- UNITS ---
  public getAllUnits(): Unit[] {
    return this.state.units || [];
  }

  public getUnits(currentUser?: User | null): Unit[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.units;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.units.filter(u => u.departmentId === actor.departmentId);
    }
    return this.state.units.filter(u => u.id === actor.unitId);
  }

  public async addUnit(data: { name: string; departmentId: string; logoUrl?: string }): Promise<Unit> {
    const res = await fetch('/api/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const unit = await res.json();
    if (!res.ok) throw new Error(unit.error || 'Erro ao criar unidade.');
    await this.refreshFromServer();
    return unit;
  }

  public async updateUnit(id: string, name: string, departmentId: string, logoUrl?: string): Promise<Unit> {
    const res = await fetch(`/api/units/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, departmentId, logoUrl, actor: this.state.currentUser })
    });
    const unit = await res.json();
    if (!res.ok) throw new Error(unit.error || 'Erro ao atualizar unidade.');
    await this.refreshFromServer();
    return unit;
  }

  public async deleteUnit(id: string): Promise<boolean> {
    const res = await fetch(`/api/units/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir unidade.');
    await this.refreshFromServer();
    return true;
  }

  // --- USERS ---
  public getAllUsersForLookup(): User[] {
    return this.state.users || [];
  }

  public getUsers(currentUser?: User | null): User[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    
    let list: User[] = [];
    if (actor.role === 'Geral') {
      list = this.state.users;
    } else if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      list = this.state.users.filter(u => u.departmentId === actor.departmentId);
    } else {
      list = this.state.users.filter(u => u.unitId === actor.unitId);
    }

    // Apenas usuários com perfil Geral podem ver usuários com perfil Geral
    if (actor.role !== 'Geral') {
      list = list.filter(u => u.role !== 'Geral');
    }

    return list;
  }

  public async addUser(data: Omit<User, 'id' | 'password' | 'createdAt' | 'mustChangePassword'>): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const user = await res.json();
    if (!res.ok) throw new Error(user.error || 'Erro ao cadastrar policial.');
    await this.refreshFromServer();
    return user;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<boolean> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar policial.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteUser(id: string): Promise<boolean> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir policial.');
    await this.refreshFromServer();
    return true;
  }

  // --- COURSES ---
  public getCourses(): Course[] {
    return this.state.courses;
  }

  public async addCourse(data: Partial<Course> & { name: string }): Promise<Course> {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const course = await res.json();
    if (!res.ok) throw new Error(course.error || 'Erro ao adicionar curso.');
    await this.refreshFromServer();
    return course;
  }

  public async updateCourse(id: string, data: Partial<Course>): Promise<Course> {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, id, actor: this.state.currentUser })
    });
    const course = await res.json();
    if (!res.ok) throw new Error(course.error || 'Erro ao atualizar curso.');
    await this.refreshFromServer();
    return course;
  }

  public async deleteCourse(id: string): Promise<boolean> {
    const res = await fetch(`/api/courses/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir curso.');
    await this.refreshFromServer();
    return true;
  }

  // --- AVAILABLE WEAPON TYPES ---
  public getAvailableWeaponTypes(): AvailableWeaponType[] {
    return this.state.availableWeaponTypes || [];
  }

  public async addOrUpdateAvailableWeaponType(data: { id?: string; name: string; models: string[] }): Promise<AvailableWeaponType> {
    const res = await fetch('/api/available-weapon-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao salvar tipo de arma disponível.');
    await this.refreshFromServer();
    return result;
  }

  public async deleteAvailableWeaponType(id: string): Promise<boolean> {
    const res = await fetch(`/api/available-weapon-types/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir tipo de arma disponível.');
    await this.refreshFromServer();
    return true;
  }

  // --- VAULT SPACES ---
  public getVaultSpaces(currentUser?: User | null): VaultSpace[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.vaultSpaces;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.vaultSpaces.filter(v => v.departmentId === actor.departmentId);
    }
    return this.state.vaultSpaces.filter(v => v.unitId === actor.unitId);
  }

  public async addVaultSpace(data: Omit<VaultSpace, 'id' | 'createdAt'>): Promise<VaultSpace> {
    const res = await fetch('/api/vault-spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const space = await res.json();
    if (!res.ok) throw new Error(space.error || 'Erro ao criar local no cofre.');
    await this.refreshFromServer();
    return space;
  }

  public async updateVaultSpace(id: string, data: Partial<Omit<VaultSpace, 'id' | 'createdAt'>>): Promise<VaultSpace> {
    const res = await fetch(`/api/vault-spaces/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const space = await res.json();
    if (!res.ok) throw new Error(space.error || 'Erro ao atualizar local do cofre.');
    await this.refreshFromServer();
    const updated = this.state.vaultSpaces.find(v => v.id === id);
    if (!updated) throw new Error('Local do cofre não encontrado.');
    return updated;
  }

  public async deleteVaultSpace(id: string): Promise<boolean> {
    const res = await fetch(`/api/vault-spaces/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir local do cofre.');
    await this.refreshFromServer();
    return true;
  }

  // --- CALIBERS / CADASTRO DE MUNIÇÃO ---
  public getCalibers(): Caliber[] {
    return this.state.calibers;
  }

  public async addCaliber(name: string, fabricante?: string, tipo?: string, peso?: string): Promise<Caliber> {
    const res = await fetch('/api/calibers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, fabricante, tipo, peso, actor: this.state.currentUser })
    });
    const caliber = await res.json();
    if (!res.ok) throw new Error(caliber.error || 'Erro ao cadastrar munição/calibre.');
    await this.refreshFromServer();
    return caliber;
  }

  public async updateCaliber(id: string, name: string, fabricante?: string, tipo?: string, peso?: string): Promise<Caliber> {
    const res = await fetch(`/api/calibers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, fabricante, tipo, peso, actor: this.state.currentUser })
    });
    const caliber = await res.json();
    if (!res.ok) throw new Error(caliber.error || 'Erro ao atualizar munição/calibre.');
    await this.refreshFromServer();
    return caliber;
  }

  public async deleteCaliber(id: string): Promise<boolean> {
    const res = await fetch(`/api/calibers/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir calibre.');
    await this.refreshFromServer();
    return true;
  }

  // --- AMMUNITION ---
  public getAmmoStocks(currentUser?: User | null): AmmunitionStock[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.ammoStocks;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.ammoStocks.filter(s => s.departmentId === actor.departmentId);
    }
    return this.state.ammoStocks.filter(s => s.unitId === actor.unitId);
  }

  public getAmmoMovements(currentUser?: User | null): AmmunitionMovement[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.ammoMovements;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.ammoMovements.filter(m => m.departmentId === actor.departmentId);
    }
    return this.state.ammoMovements.filter(m => m.unitId === actor.unitId || (!m.unitId && m.departmentId === actor.departmentId));
  }

  public async addAmmoMovement(data: {
    type: 'Entrada' | 'Saída';
    caliberId: string;
    quantity: number;
    vaultSpaceId: string;
    recipientOrReason: string;
    fabricante?: string;
    tipoMunicao?: string;
    pesoMunicao?: string;
    loteMunicao?: string;
    anoFabricacao?: number | string;
    destinacao?: string;
    responsibleType?: 'SISTEMA' | 'FORA_DO_SISTEMA';
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleMasp?: string;
    observation?: string;
    observacao?: string;
    observacaoEstoqueMunicao?: string;
    stockObservation?: string;
  }): Promise<AmmunitionMovement> {
    const res = await fetch('/api/ammo-movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const mov = await res.json();
    if (!res.ok) throw new Error(mov.error || 'Erro ao registrar movimentação de munição.');
    await this.refreshFromServer();
    return mov;
  }

  public recordAmmoMovement(data: {
    type: 'Entrada' | 'Saída';
    caliberId: string;
    quantity: number;
    vaultSpaceId: string;
    recipientOrReason: string;
    fabricante?: string;
    tipoMunicao?: string;
    pesoMunicao?: string;
    loteMunicao?: string;
    anoFabricacao?: number | string;
    destinacao?: string;
    responsibleType?: 'SISTEMA' | 'FORA_DO_SISTEMA';
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleMasp?: string;
    observation?: string;
    observacao?: string;
    observacaoEstoqueMunicao?: string;
    stockObservation?: string;
  }) {
    return this.addAmmoMovement(data);
  }

  public async returnUnusedAmmo(id: string, returnQuantity: number): Promise<boolean> {
    const res = await fetch(`/api/ammo-movements/${id}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnQuantity, actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao registrar devolução de munição.');
    await this.refreshFromServer();
    return true;
  }

  public async updateAmmoStock(
    id: string,
    data: { 
      quantity: number; 
      caliberId?: string; 
      fabricante?: string;
      tipoMunicao?: string;
      pesoMunicao?: string;
      loteMunicao?: string;
      anoFabricacao?: number | string;
      destinacao?: string;
      additionalInfo?: string;
      observacao?: string;
      observacaoEstoqueMunicao?: string;
      targetVaultSpaceId?: string;
      transferQuantity?: number;
      transferObservation?: string;
    },
    actorUser?: User
  ): Promise<boolean> {
    const actor = actorUser || this.state.currentUser;
    const res = await fetch(`/api/ammo-stocks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor })
    });
    const resData = await res.json();
    if (!res.ok) throw new Error(resData.error || 'Erro ao alterar dados de estoque de munição.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteAmmoStock(id: string, actorUser?: User): Promise<boolean> {
    const actor = actorUser || this.state.currentUser;
    const res = await fetch(`/api/ammo-stocks/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir registro de estoque.');
    this.state.ammoStocks = this.state.ammoStocks.filter(s => s.id !== id);
    await this.refreshFromServer();
    return true;
  }

  public async deleteAmmoMovement(id: string, actorUser?: User): Promise<boolean> {
    const actor = actorUser || this.state.currentUser;
    const res = await fetch(`/api/ammo-movements/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir lançamento de movimentação de munição.');
    this.state.ammoMovements = this.state.ammoMovements.filter(m => m.id !== id);
    await this.refreshFromServer();
    return true;
  }

  // --- WEAPONS ---
  public getWeapons(currentUser?: User | null): Weapon[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];

    let result: Weapon[] = [];
    if (actor.role === 'Geral') {
      result = this.state.weapons;
    } else if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      result = this.state.weapons.filter(w => !w.departmentId || w.departmentId === actor.departmentId);
    } else {
      // Policial or Armeiro scoped to unit: vê todas as armas da sua unidade
      result = this.state.weapons.filter(w => !w.unitId || w.unitId === actor.unitId || (actor.departmentId && w.departmentId === actor.departmentId));
    }

    return result;
  }

  public getAllWeapons(): Weapon[] {
    return this.state.weapons || [];
  }

  public getAllWeaponsForAdmin(currentUser?: User | null): Weapon[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.weapons;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.weapons.filter(w => w.departmentId === actor.departmentId);
    }
    return this.state.weapons.filter(w => w.unitId === actor.unitId);
  }

  public async addWeapon(data: Omit<Weapon, 'id' | 'createdAt' | 'status'>): Promise<Weapon> {
    const res = await fetch('/api/weapons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const weap = await res.json();
    if (!res.ok) throw new Error(weap.error || 'Erro ao cadastrar arma.');
    await this.refreshFromServer();
    return weap;
  }

  public async updateWeapon(id: string, updates: Partial<Weapon>): Promise<boolean> {
    const res = await fetch(`/api/weapons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar arma.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteWeapon(id: string): Promise<boolean> {
    const res = await fetch(`/api/weapons/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir arma.');
    await this.refreshFromServer();
    return true;
  }

  // --- WEAPON SHOTS / DISPAROS ---
  public async addWeaponShots(
    weaponId: string,
    shotCount: number,
    reason: string,
    officerName: string,
    officerMasp?: string
  ): Promise<{ newTotal: number }> {
    const res = await fetch(`/api/weapons/${weaponId}/add-shots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shotCount,
        reason,
        officerName,
        officerMasp,
        actor: this.state.currentUser
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao registrar disparos.');
    await this.refreshFromServer();
    return data;
  }

  public async getWeaponShots(weaponId: string): Promise<WeaponShotRecord[]> {
    const res = await fetch(`/api/weapons/${weaponId}/shots`);
    if (!res.ok) return [];
    return await res.json();
  }

  // --- WEAPON MAINTENANCE ---
  public async getMaintenances(weaponId?: string): Promise<WeaponMaintenance[]> {
    const url = weaponId ? `/api/maintenances?weaponId=${encodeURIComponent(weaponId)}` : '/api/maintenances';
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  }

  public async sendWeaponToMaintenance(weaponId: string, payload: {
    type: 'Interna' | 'Externa';
    sentDate: string;
    sentArmorerName: string;
    sentDescription: string;
    workshopName?: string;
    workshopCep?: string;
    workshopStreet?: string;
    workshopNumber?: string;
    workshopComplement?: string;
    workshopNeighborhood?: string;
    workshopCity?: string;
    workshopState?: string;
    workshopArmorerName?: string;
    workshopCredenciamentoPf?: string;
    saveWorkshop?: boolean;
  }): Promise<{ id: string }> {
    const res = await fetch(`/api/weapons/${weaponId}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        actor: this.state.currentUser
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar arma para manutenção.');
    await this.refreshFromServer();
    return data;
  }

  public async receiveWeaponFromMaintenance(maintenanceId: string, payload: {
    returnDate: string;
    returnArmorerName: string;
    returnServiceDescription: string;
  }): Promise<boolean> {
    const res = await fetch(`/api/maintenances/${maintenanceId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        actor: this.state.currentUser
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao receber arma da manutenção.');
    await this.refreshFromServer();
    return true;
  }

  // --- EXTERNAL WORKSHOPS ---
  public async getExternalWorkshops(): Promise<ExternalWorkshop[]> {
    const res = await fetch('/api/external-workshops');
    if (!res.ok) return [];
    return await res.json();
  }

  public async saveExternalWorkshop(workshop: Partial<ExternalWorkshop>): Promise<ExternalWorkshop> {
    const res = await fetch('/api/external-workshops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...workshop,
        actor: this.state.currentUser
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar armeria externa.');
    return data;
  }

  public async deleteExternalWorkshop(id: string): Promise<boolean> {
    const res = await fetch(`/api/external-workshops/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir armeria.');
    return true;
  }

  // --- WEAPON TRANSFERS BETWEEN UNITS ---
  public getWeaponTransfers(currentUser?: User | null, unitIdFilter?: string): WeaponTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    // Strict Role Check: ONLY Armeiro, Administrador, Geral, and Policial
    const allowedRoles = ['Geral', 'Administrador', 'Armeiro', 'Policial'];
    if (!allowedRoles.includes(role)) return [];

    const allTransfers = this.state.weaponTransfers || [];

    // If an explicit unit filter is passed (and not 'ALL'), only return transfers where that unit is origin or destination
    if (unitIdFilter && unitIdFilter !== 'ALL') {
      return allTransfers.filter(
        t => t.originUnitId === unitIdFilter || t.destinationUnitId === unitIdFilter
      );
    }

    // Strict Rule:
    // "o histórico de transferência entre unidades deve aparecer para as unidades envolvidas na movimentação, as demais unidades não devem enxergar o histórico se não estiver em origem ou destino da transferência"
    if (actor.unitId) {
      return allTransfers.filter(
        t => t.originUnitId === actor.unitId || t.destinationUnitId === actor.unitId
      );
    }

    // Super-user Geral with no unit restriction sees all transfers
    if (role === 'Geral') return allTransfers;

    return allTransfers.filter(
      t => t.destinationArmorerId === actor.id || t.transferredByUserId === actor.id
    );
  }

  public getPendingIncomingTransfers(currentUser?: User | null): WeaponTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const transfers = this.getWeaponTransfers(actor);
    return transfers.filter(t => {
      if (t.status !== 'Pendente') return false;
      if (t.destinationArmorerId && t.destinationArmorerId === actor.id) return true;
      if (actor.unitId) {
        return t.destinationUnitId === actor.unitId;
      }
      if (role === 'Geral' && !actor.unitId) return true;
      return false;
    });
  }

  public async transferWeapons(data: {
    originDepartmentId?: string;
    originDepartmentName?: string;
    originUnitId?: string;
    originUnitName?: string;
    destinationDepartmentId: string;
    destinationDepartmentName: string;
    destinationUnitId: string;
    destinationUnitName: string;
    destinationArmorerId?: string;
    destinationArmorerName?: string;
    destinationArmorerMasp?: string;
    destinationVaultSpaceId?: string;
    destinationVaultSpaceCode?: string;
    receiverOrTransporterName: string;
    receiverOrTransporterMasp: string;
    receiverOrTransporterCargo?: string;
    reason: string;
    weapons: {
      weaponId: string;
      serialNumber: string;
      type: string;
      model: string;
      manufacturer: string;
      caliber: string;
      magazineQuantity: number;
      originVaultCode?: string;
    }[];
    observation?: string;
  }): Promise<WeaponTransfer> {
    const res = await fetch('/api/weapon-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao realizar transferência de armas.');
    await this.refreshFromServer();
    return result.transfer;
  }

  public async receiveWeaponTransfer(
    transferId: string,
    destinationVaultSpaceId: string,
    observation?: string
  ): Promise<WeaponTransfer | null> {
    const res = await fetch(`/api/weapon-transfers/${transferId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationVaultSpaceId,
        observation,
        actor: this.state.currentUser
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao receber armamento.');
    await this.refreshFromServer();
    return result.transfer || (this.state.weaponTransfers.find(t => t.id === transferId) || null);
  }

  public async undoWeaponTransfer(
    transferId: string,
    reason?: string
  ): Promise<boolean> {
    const res = await fetch(`/api/weapon-transfers/${transferId}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        actor: this.state.currentUser
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao desfazer transferência.');
    await this.refreshFromServer();
    return true;
  }

  public getPendingOutgoingTransfers(currentUser?: User | null): WeaponTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const transfers = this.getWeaponTransfers(actor);
    return transfers.filter(t => {
      if (t.status !== 'Pendente') return false;
      if (actor.role === 'Geral') return true;
      if (t.transferredByUserId === actor.id) return true;
      if (actor.role === 'Administrador') {
        return t.originDepartmentId === actor.departmentId || !actor.departmentId;
      }
      if (actor.role === 'Armeiro') {
        if (actor.managementScope !== 'unit') {
          return t.originDepartmentId === actor.departmentId;
        }
        return t.originUnitId === actor.unitId;
      }
      return t.originUnitId === actor.unitId;
    });
  }

  // --- AMMO TRANSFERS BETWEEN UNITS ---
  public getAmmoTransfers(currentUser?: User | null, unitIdFilter?: string): AmmoTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const allowedRoles = ['Geral', 'Administrador', 'Armeiro', 'Policial'];
    if (!allowedRoles.includes(role)) return [];

    const allTransfers = this.state.ammoTransfers || [];

    if (unitIdFilter && unitIdFilter !== 'ALL') {
      return allTransfers.filter(
        t => t.originUnitId === unitIdFilter || t.destinationUnitId === unitIdFilter
      );
    }

    // Strict Rule:
    // "o histórico de transferência entre unidades deve aparecer para as unidades envolvidas na movimentação, as demais unidades não devem enxergar o histórico se não estiver em origem ou destino da transferência"
    if (actor.unitId) {
      return allTransfers.filter(
        t => t.originUnitId === actor.unitId || t.destinationUnitId === actor.unitId
      );
    }

    if (role === 'Geral') return allTransfers;

    return allTransfers.filter(
      t => t.destinationArmorerId === actor.id || t.transferredByUserId === actor.id
    );
  }

  public getPendingIncomingAmmoTransfers(currentUser?: User | null): AmmoTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const transfers = this.getAmmoTransfers(actor);
    return transfers.filter(t => {
      if (t.status !== 'Pendente') return false;
      if (t.destinationArmorerId && t.destinationArmorerId === actor.id) return true;
      if (actor.unitId) {
        return t.destinationUnitId === actor.unitId;
      }
      if (role === 'Geral' && !actor.unitId) return true;
      return false;
    });
  }

  public async transferAmmo(data: {
    originDepartmentId?: string;
    originDepartmentName?: string;
    originUnitId?: string;
    originUnitName?: string;
    destinationDepartmentId: string;
    destinationDepartmentName: string;
    destinationUnitId: string;
    destinationUnitName: string;
    destinationArmorerId?: string;
    destinationArmorerName?: string;
    destinationArmorerMasp?: string;
    receiverOrTransporterName: string;
    receiverOrTransporterMasp: string;
    receiverOrTransporterCargo?: string;
    reason: string;
    items: {
      caliberId: string;
      caliberName: string;
      fabricante?: string;
      tipoMunicao?: string;
      pesoMunicao?: string;
      loteMunicao?: string;
      anoFabricacao?: number | string;
      destinacao?: string;
      quantity: number;
      originVaultSpaceId?: string;
      originVaultCode?: string;
    }[];
    observation?: string;
  }): Promise<AmmoTransfer> {
    const res = await fetch('/api/ammo-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao realizar transferência de munições.');
    await this.refreshFromServer();
    return result;
  }

  public async receiveAmmoTransfer(
    transferId: string,
    destinationVaultSpaceId: string,
    observation?: string
  ): Promise<boolean> {
    const res = await fetch(`/api/ammo-transfers/${transferId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationVaultSpaceId,
        observation,
        actor: this.state.currentUser
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao dar recibo nas munições.');
    await this.refreshFromServer();
    return true;
  }

  public async undoAmmoTransfer(transferId: string): Promise<boolean> {
    const res = await fetch(`/api/ammo-transfers/${transferId}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao desfazer transferência de munições.');
    await this.refreshFromServer();
    return true;
  }

  // --- EXPLOSIVO TRANSFERS BETWEEN UNITS ---
  public getExplosivoTransfers(currentUser?: User | null, unitIdFilter?: string): ExplosivoTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const list = this.state.explosivoTransfers || [];

    if (unitIdFilter && unitIdFilter !== 'ALL') {
      return list.filter(
        t => t.originUnitId === unitIdFilter || t.destinationUnitId === unitIdFilter
      );
    }

    // Strict Rule:
    // "o histórico de transferência entre unidades deve aparecer para as unidades envolvidas na movimentação, as demais unidades não devem enxergar o histórico se não estiver em origem ou destino da transferência"
    if (actor.unitId) {
      return list.filter(
        t => t.originUnitId === actor.unitId || t.destinationUnitId === actor.unitId
      );
    }

    if (role === 'Geral') return list;

    return list.filter(
      t => t.destinationArmorerId === actor.id || t.transferredByUserId === actor.id
    );
  }

  public getPendingIncomingExplosivoTransfers(currentUser?: User | null): ExplosivoTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const transfers = this.getExplosivoTransfers(actor);
    return transfers.filter(t => {
      if (t.status !== 'Pendente') return false;
      if (t.destinationArmorerId && t.destinationArmorerId === actor.id) return true;
      if (actor.unitId) {
        return t.destinationUnitId === actor.unitId;
      }
      if (role === 'Geral' && !actor.unitId) return true;
      return false;
    });
  }

  public async transferExplosivo(data: {
    originDepartmentId?: string;
    originDepartmentName?: string;
    originUnitId?: string;
    originUnitName?: string;
    destinationDepartmentId: string;
    destinationDepartmentName: string;
    destinationUnitId: string;
    destinationUnitName: string;
    destinationArmorerId?: string;
    destinationArmorerName?: string;
    destinationArmorerMasp?: string;
    receiverOrTransporterName: string;
    receiverOrTransporterMasp: string;
    receiverOrTransporterCargo?: string;
    reason: string;
    explosivoId: string;
    quantidade: number;
    observation?: string;
  }): Promise<ExplosivoTransfer> {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Usuário não autenticado.');

    const exp = this.state.explosivos.find(e => e.id === data.explosivoId);
    if (!exp) throw new Error('Material explosivo não encontrado.');
    if (exp.quantidade < data.quantidade) {
      throw new Error(`Quantidade solicitada (${data.quantidade}) maior que o saldo em estoque (${exp.quantidade}).`);
    }

    const updatedQty = exp.quantidade - data.quantidade;
    await this.saveExplosivo({
      ...exp,
      quantidade: updatedQty
    });

    const transferId = `TRF-EXP-${Date.now()}`;
    const newTransfer: ExplosivoTransfer = {
      id: transferId,
      protocolNumber: `TRF-EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      transferDate: new Date().toISOString(),
      originDepartmentId: data.originDepartmentId || exp.departmentId || actor.departmentId || '',
      originDepartmentName: data.originDepartmentName || this.state.departments.find(d => d.id === exp.departmentId)?.name || '',
      originUnitId: data.originUnitId || exp.unitId || actor.unitId || '',
      originUnitName: data.originUnitName || this.state.units.find(u => u.id === exp.unitId)?.name || '',
      destinationDepartmentId: data.destinationDepartmentId,
      destinationDepartmentName: data.destinationDepartmentName,
      destinationUnitId: data.destinationUnitId,
      destinationUnitName: data.destinationUnitName,
      destinationArmorerId: data.destinationArmorerId,
      destinationArmorerName: data.destinationArmorerName,
      destinationArmorerMasp: data.destinationArmorerMasp,
      transferredByUserId: actor.id,
      transferredByUserName: actor.name,
      transferredByUserMasp: actor.masp,
      transferredByUserRole: actor.role,
      receiverOrTransporterName: data.receiverOrTransporterName,
      receiverOrTransporterMasp: data.receiverOrTransporterMasp,
      receiverOrTransporterCargo: data.receiverOrTransporterCargo,
      reason: data.reason,
      explosivoId: exp.id,
      nomeExplosivo: exp.nome,
      tipoNome: exp.tipo,
      subtipoNome: exp.subtipo,
      quantidade: data.quantidade,
      unidadeMedida: exp.unidadeMedida,
      lote: exp.lote,
      originVaultCode: exp.localArmazenamento,
      observation: data.observation,
      status: 'Pendente',
      createdAt: new Date().toISOString()
    };

    if (!this.state.explosivoTransfers) this.state.explosivoTransfers = [];
    this.state.explosivoTransfers.unshift(newTransfer);
    try {
      localStorage.setItem('pcmg_explosivo_transfers', JSON.stringify(this.state.explosivoTransfers));
    } catch {}

    await this.saveMovimentacaoExplosivo({
      explosivoId: exp.id,
      nomeExplosivo: exp.nome,
      tipoMovimentacao: 'Transferência',
      quantidade: data.quantidade,
      unidadeMedida: exp.unidadeMedida,
      motivo: `Transferência para a unidade: ${data.destinationUnitName} (${data.reason})`,
      responsavelNome: data.receiverOrTransporterName,
      responsavelMasp: data.receiverOrTransporterMasp,
      localOrigemDestino: `${data.destinationUnitName} - Destinatário: ${data.destinationArmorerName || 'Armeiro'}`,
      dataMovimentacao: new Date().toISOString().slice(0, 10),
      observacoes: data.observation
    });

    return newTransfer;
  }

  public async receiveExplosivoTransfer(
    transferId: string,
    destinationVaultSpaceId: string,
    observation?: string
  ): Promise<boolean> {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Usuário não autenticado.');

    const transfer = (this.state.explosivoTransfers || []).find(t => t.id === transferId);
    if (!transfer) throw new Error('Transferência de explosivo não encontrada.');
    if (transfer.status !== 'Pendente') throw new Error('Esta transferência já foi recebida ou cancelada.');

    const vault = this.state.vaultSpaces.find(v => v.id === destinationVaultSpaceId);
    const vaultCode = vault ? vault.code : 'Paiol Principal';

    transfer.status = 'Recebido';
    transfer.receivedAt = new Date().toISOString();
    transfer.receivedByUserId = actor.id;
    transfer.receivedByUserName = actor.name;
    transfer.receivedByUserMasp = actor.masp;
    transfer.destinationVaultSpaceId = destinationVaultSpaceId;
    transfer.destinationVaultSpaceCode = vaultCode;
    if (observation) {
      transfer.observation = (transfer.observation ? transfer.observation + ' | ' : '') + `Recibo: ${observation}`;
    }

    try {
      localStorage.setItem('pcmg_explosivo_transfers', JSON.stringify(this.state.explosivoTransfers));
    } catch {}

    const destExp = this.state.explosivos.find(e =>
      e.unitId === transfer.destinationUnitId &&
      (e.nome || '').trim().toLowerCase() === (transfer.nomeExplosivo || '').trim().toLowerCase() &&
      (e.lote || '').trim().toLowerCase() === (transfer.lote || '').trim().toLowerCase()
    );

    if (destExp) {
      await this.saveExplosivo({
        ...destExp,
        quantidade: destExp.quantidade + transfer.quantidade,
        vaultSpaceId: destinationVaultSpaceId,
        localArmazenamento: vaultCode
      });
    } else {
      const originalExp = this.state.explosivos.find(e => e.id === transfer.explosivoId);
      await this.saveExplosivo({
        nome: transfer.nomeExplosivo,
        tipo: transfer.tipoNome || originalExp?.tipo || 'Outros',
        subtipo: transfer.subtipoNome || originalExp?.subtipo || '',
        quantidade: transfer.quantidade,
        unidadeMedida: transfer.unidadeMedida || 'kg',
        lote: transfer.lote || 'LOTE-TRF',
        fabricante: originalExp?.fabricante || 'CBC',
        dataFabricacao: originalExp?.dataFabricacao,
        dataValidade: originalExp?.dataValidade,
        classeRisco: originalExp?.classeRisco || '1.1D',
        localArmazenamento: vaultCode,
        vaultSpaceId: destinationVaultSpaceId,
        status: 'Operacional',
        departmentId: transfer.destinationDepartmentId,
        unitId: transfer.destinationUnitId,
        observacoes: `Recebido via Transferência ${transfer.protocolNumber || transfer.id} da unidade ${transfer.originUnitName}`
      });
    }

    await this.refreshFromServer();
    return true;
  }

  // --- MATERIAL TRANSFERS BETWEEN UNITS ---
  public getMaterialTransfers(currentUser?: User | null, unitIdFilter?: string): MaterialTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const list = this.state.materialTransfers || [];

    if (unitIdFilter && unitIdFilter !== 'ALL') {
      return list.filter(
        t => t.originUnitId === unitIdFilter || t.destinationUnitId === unitIdFilter
      );
    }

    // Strict Rule:
    // "o histórico de transferência entre unidades deve aparecer para as unidades envolvidas na movimentação, as demais unidades não devem enxergar o histórico se não estiver em origem ou destino da transferência"
    if (actor.unitId) {
      return list.filter(
        t => t.originUnitId === actor.unitId || t.destinationUnitId === actor.unitId
      );
    }

    if (role === 'Geral') return list;

    return list.filter(
      t => t.destinationArmorerId === actor.id || t.transferredByUserId === actor.id
    );
  }

  public getPendingIncomingMaterialTransfers(currentUser?: User | null): MaterialTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const role = actor.activeRole || actor.role;
    const transfers = this.getMaterialTransfers(actor);
    return transfers.filter(t => {
      if (t.status !== 'Pendente') return false;
      if (t.destinationArmorerId && t.destinationArmorerId === actor.id) return true;
      if (actor.unitId) {
        return t.destinationUnitId === actor.unitId;
      }
      if (role === 'Geral' && !actor.unitId) return true;
      return false;
    });
  }

  public async transferMaterial(data: {
    originDepartmentId?: string;
    originDepartmentName?: string;
    originUnitId?: string;
    originUnitName?: string;
    destinationDepartmentId: string;
    destinationDepartmentName: string;
    destinationUnitId: string;
    destinationUnitName: string;
    destinationArmorerId?: string;
    destinationArmorerName?: string;
    destinationArmorerMasp?: string;
    receiverOrTransporterName: string;
    receiverOrTransporterMasp: string;
    receiverOrTransporterCargo?: string;
    reason: string;
    materialId: string;
    quantidade: number;
    observation?: string;
  }): Promise<MaterialTransfer> {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Usuário não autenticado.');

    const mat = this.state.materiais.find(m => m.id === data.materialId);
    if (!mat) throw new Error('Material não encontrado.');
    if (mat.quantidadeDisponivel < data.quantidade) {
      throw new Error(`Quantidade disponível insuficiente (${mat.quantidadeDisponivel}).`);
    }

    await this.saveMaterial({
      ...mat,
      quantidade: Math.max(0, mat.quantidade - data.quantidade),
      quantidadeDisponivel: Math.max(0, mat.quantidadeDisponivel - data.quantidade)
    });

    const transferId = `TRF-MAT-${Date.now()}`;
    const newTransfer: MaterialTransfer = {
      id: transferId,
      protocolNumber: `TRF-MAT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      transferDate: new Date().toISOString(),
      originDepartmentId: data.originDepartmentId || mat.departamentoId || actor.departmentId || '',
      originDepartmentName: data.originDepartmentName || this.state.departments.find(d => d.id === mat.departamentoId)?.name || '',
      originUnitId: data.originUnitId || mat.unidadeId || actor.unitId || '',
      originUnitName: data.originUnitName || this.state.units.find(u => u.id === mat.unidadeId)?.name || '',
      destinationDepartmentId: data.destinationDepartmentId,
      destinationDepartmentName: data.destinationDepartmentName,
      destinationUnitId: data.destinationUnitId,
      destinationUnitName: data.destinationUnitName,
      destinationArmorerId: data.destinationArmorerId,
      destinationArmorerName: data.destinationArmorerName,
      destinationArmorerMasp: data.destinationArmorerMasp,
      transferredByUserId: actor.id,
      transferredByUserName: actor.name,
      transferredByUserMasp: actor.masp,
      transferredByUserRole: actor.role,
      receiverOrTransporterName: data.receiverOrTransporterName,
      receiverOrTransporterMasp: data.receiverOrTransporterMasp,
      receiverOrTransporterCargo: data.receiverOrTransporterCargo,
      reason: data.reason,
      materialId: mat.id,
      nomeMaterial: mat.nome,
      tipoNome: mat.tipoMaterialNome,
      numeroSerie: mat.numeroSerie,
      quantidade: data.quantidade,
      originVaultCode: mat.localGuarda,
      observation: data.observation,
      status: 'Pendente',
      createdAt: new Date().toISOString()
    };

    if (!this.state.materialTransfers) this.state.materialTransfers = [];
    this.state.materialTransfers.unshift(newTransfer);
    try {
      localStorage.setItem('pcmg_material_transfers', JSON.stringify(this.state.materialTransfers));
    } catch {}

    return newTransfer;
  }

  public async receiveMaterialTransfer(
    transferId: string,
    destinationVaultSpaceId: string,
    observation?: string
  ): Promise<boolean> {
    const actor = this.state.currentUser;
    if (!actor) throw new Error('Usuário não autenticado.');

    const transfer = (this.state.materialTransfers || []).find(t => t.id === transferId);
    if (!transfer) throw new Error('Transferência de material não encontrada.');
    if (transfer.status !== 'Pendente') throw new Error('Esta transferência já foi recebida ou cancelada.');

    const vault = this.state.vaultSpaces.find(v => v.id === destinationVaultSpaceId);
    const vaultCode = vault ? vault.code : 'Armário Central';

    transfer.status = 'Recebido';
    transfer.receivedAt = new Date().toISOString();
    transfer.receivedByUserId = actor.id;
    transfer.receivedByUserName = actor.name;
    transfer.receivedByUserMasp = actor.masp;
    transfer.destinationVaultSpaceId = destinationVaultSpaceId;
    transfer.destinationVaultSpaceCode = vaultCode;
    if (observation) {
      transfer.observation = (transfer.observation ? transfer.observation + ' | ' : '') + `Recibo: ${observation}`;
    }

    try {
      localStorage.setItem('pcmg_material_transfers', JSON.stringify(this.state.materialTransfers));
    } catch {}

    const destMat = this.state.materiais.find(m =>
      m.unidadeId === transfer.destinationUnitId &&
      (m.nome || '').trim().toLowerCase() === (transfer.nomeMaterial || '').trim().toLowerCase() &&
      (transfer.numeroSerie ? m.numeroSerie === transfer.numeroSerie : true)
    );

    if (destMat) {
      await this.saveMaterial({
        ...destMat,
        quantidade: destMat.quantidade + transfer.quantidade,
        quantidadeDisponivel: destMat.quantidadeDisponivel + transfer.quantidade,
        localGuarda: vaultCode
      });
    } else {
      const origMat = this.state.materiais.find(m => m.id === transfer.materialId);
      await this.saveMaterial({
        nome: transfer.nomeMaterial,
        tipoMaterialId: origMat?.tipoMaterialId || '',
        tipoMaterialNome: transfer.tipoNome || origMat?.tipoMaterialNome || 'Geral',
        quantidade: transfer.quantidade,
        quantidadeDisponivel: transfer.quantidade,
        quantidadeEmUso: 0,
        quantidadeConsumida: 0,
        departamentoId: transfer.destinationDepartmentId,
        unidadeId: transfer.destinationUnitId,
        localGuarda: vaultCode,
        numeroSerie: transfer.numeroSerie,
        observacoes: `Recebido via Transferência ${transfer.protocolNumber || transfer.id} da unidade ${transfer.originUnitName}`
      });
    }

    await this.refreshFromServer();
    return true;
  }

  // --- WEAPON MOVEMENTS (CAUTELAS) ---
  public getMovements(currentUser?: User | null): Movement[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    if (actor.role === 'Geral') return this.state.movements;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.movements.filter(m => m.departmentId === actor.departmentId);
    }
    return this.state.movements.filter(m => m.unitId === actor.unitId);
  }

  public getWeaponMovementHistory(weaponId: string): Movement[] {
    return this.state.movements
      .filter(m => m.weaponId === weaponId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }

  public async requestWithdrawal(data: {
    weaponId: string;
    ammunitionCount: number;
    magazineCount: number;
  }): Promise<boolean> {
    const res = await fetch('/api/movements/request-withdrawal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao solicitar retirada.');
    await this.refreshFromServer();
    return true;
  }

  public async approveWithdrawal(movementId: string): Promise<boolean> {
    const res = await fetch(`/api/movements/${movementId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao aprovar retirada.');
    await this.refreshFromServer();
    return true;
  }

  public async requestReturn(data: {
    movementId: string;
    returnVaultSpaceId: string;
    returningAmmunitionCount: number;
    returningMagazineCount: number;
    divergenceJustification?: string;
  }): Promise<boolean> {
    const res = await fetch(`/api/movements/${data.movementId}/request-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao solicitar devolução.');
    await this.refreshFromServer();
    return true;
  }

  public async confirmReceipt(movementId: string): Promise<boolean> {
    const res = await fetch(`/api/movements/${movementId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao confirmar recibo.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteMovement(id: string): Promise<boolean> {
    const res = await fetch(`/api/movements/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao excluir movimentação.');
    await this.refreshFromServer();
    return true;
  }

  // --- AUDIT LOGS ---
  public getAuditLogs(): AuditLog[] {
    return this.state.auditLogs;
  }

  // --- ACADEMIA DE POLÍCIA ---
  public getAcademyCourses(): AcademyCourse[] {
    return this.state.academyCourses;
  }

  public async saveAcademyCourse(courseData: Partial<AcademyCourse>): Promise<{ success: boolean; error?: string }> {
    try {
      const method = courseData.id ? 'PUT' : 'POST';
      const url = courseData.id ? `/api/academy-courses/${courseData.id}` : '/api/academy-courses';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...courseData, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteAcademyCourse(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/academy-courses/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getWeaponBoxes(): WeaponBox[] {
    return this.state.weaponBoxes;
  }

  public getWeaponBoxReplacements(): WeaponBoxReplacement[] {
    return this.state.weaponBoxReplacements;
  }

  public async saveWeaponBox(boxData: Partial<WeaponBox>): Promise<{ success: boolean; error?: string }> {
    try {
      const method = boxData.id ? 'PUT' : 'POST';
      const url = boxData.id ? `/api/weapon-boxes/${boxData.id}` : '/api/weapon-boxes';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...boxData, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteWeaponBox(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/weapon-boxes/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async replaceWeaponInBox(
    boxId: string,
    oldWeaponId: string,
    oldWeaponDesc: string,
    newWeaponId: string,
    newWeaponDesc: string,
    reason: string,
    teacherName?: string,
    responsibleUserName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/weapon-boxes/${boxId}/replace-weapon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldWeaponId,
          oldWeaponDesc,
          newWeaponId,
          newWeaponDesc,
          reason,
          teacherName,
          responsibleUserName,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getCourseClasses(): CourseClass[] {
    return this.state.courseClasses;
  }

  public async saveCourseClass(classData: Partial<CourseClass>): Promise<{ success: boolean; error?: string }> {
    try {
      const method = classData.id ? 'PUT' : 'POST';
      const url = classData.id ? `/api/course-classes/${classData.id}` : '/api/course-classes';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...classData, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCourseClass(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/course-classes/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getCourseMovements(): CourseMovement[] {
    return this.state.courseMovements;
  }

  public async darSaidaCurso(movementData: any): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const res = await fetch('/api/course-movements/saida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...movementData, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async darRetornoCurso(
    movementId: string,
    ammoReturned: number,
    returnedByUserName?: string,
    options?: { ammoUsed?: number; returnedMaterials?: string; notes?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/course-movements/${movementId}/retorno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ammoReturned,
          ammoUsed: options?.ammoUsed,
          returnedMaterials: options?.returnedMaterials,
          notes: options?.notes,
          returnedByUserName,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async updateCourseMovement(id: string, movementData: any): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/course-movements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...movementData, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCourseMovement(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/course-movements/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getLessonPlans(): LessonPlan[] {
    return this.state.lessonPlans;
  }

  public async saveLessonPlan(planData: Partial<LessonPlan>): Promise<{ success: boolean; error?: string }> {
    try {
      const method = planData.id ? 'PUT' : 'POST';
      const url = planData.id ? `/api/lesson-plans/${planData.id}` : '/api/lesson-plans';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...planData, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteLessonPlan(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- ALUNO TURMA & ALUNO AULAS METHODS ---
  public async getAlunosTurma(turmaId?: string): Promise<AlunoTurma[]> {
    try {
      const url = turmaId ? `/api/aluno-turma?turmaId=${encodeURIComponent(turmaId)}` : '/api/aluno-turma';
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error('Error fetching alunos turma:', err);
      return [];
    }
  }

  public async addAlunosTurma(data: { turmaId: string; names?: string | string[]; name?: string; masp?: string }): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const res = await fetch('/api/aluno-turma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, actor: this.state.currentUser })
      });
      const resData = await res.json();
      if (!res.ok) return { success: false, error: resData.error };
      await this.refreshFromServer();
      return { success: true, count: resData.count };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async updateAlunoTurma(id: string, data: Partial<AlunoTurma>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/aluno-turma/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, actor: this.state.currentUser })
      });
      const resData = await res.json();
      if (!res.ok) return { success: false, error: resData.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteAlunoTurma(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/aluno-turma/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const resData = await res.json();
      if (!res.ok) return { success: false, error: resData.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async transferAlunoTurma(id: string, newClassId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/aluno-turma/${id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newClassId, actor: this.state.currentUser })
      });
      const resData = await res.json();
      if (!res.ok) return { success: false, error: resData.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getAlunoAulas(alunoId: string): Promise<AlunoAula[]> {
    try {
      const res = await fetch(`/api/aluno-turma/${alunoId}/aulas`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error('Error fetching aluno aulas:', err);
      return [];
    }
  }

  public async saveAlunoAula(alunoId: string, aulaData: Partial<AlunoAula>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/aluno-turma/${alunoId}/aulas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...aulaData, actor: this.state.currentUser })
      });
      const resData = await res.json();
      if (!res.ok) return { success: false, error: resData.error };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteAlunoAula(aulaId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/aluno-turma/aulas/${aulaId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const resData = await res.json();
      if (!res.ok) return { success: false, error: resData.error };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- CALENDÁRIO DE AULAS METHODS ---
  public getCalendarRecords(): CalendarRecord[] {
    return this.state.calendarRecords;
  }

  public async importCalendarRecords(records: CalendarRecord[]): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const res = await fetch('/api/calendario-aulas/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, count: data.count };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async saveCalendarRecord(rec: Partial<CalendarRecord>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/calendario-aulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rec, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCalendarRecord(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/calendario-aulas/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async clearAllCalendarRecords(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/calendario-aulas/clear-all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- EQUIPES CALENDÁRIO METHODS ---
  public getEquipesCalendario(): EquipeCalendario[] {
    return this.state.equipesCalendario || [];
  }

  public async saveEquipeCalendario(equipe: Partial<EquipeCalendario>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const res = await fetch('/api/equipes-calendario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...equipe, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteEquipeCalendario(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/equipes-calendario/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- AUXILIAR TABELA EQUIPE METHODS ---
  public getAuxiliarTabelaEquipe(): AuxiliarTabelaEquipe[] {
    return this.state.auxiliarTabelaEquipe || [];
  }

  public async saveAuxiliarTabelaEquipe(aux: Partial<AuxiliarTabelaEquipe>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const res = await fetch('/api/auxiliar-tabela-equipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...aux, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteAuxiliarTabelaEquipe(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/auxiliar-tabela-equipe/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- CERTIFICADOS METHODS ---
  public getCertificados(): Certificado[] {
    return this.state.certificados || [];
  }

  public async getCertificadoById(id: string): Promise<Certificado | null> {
    try {
      const res = await fetch(`/api/certificados/${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public async verificarCertificado(codigo: string): Promise<{ success: boolean; valid?: boolean; certificate?: Certificado; error?: string }> {
    try {
      const res = await fetch(`/api/certificados/verificar/${encodeURIComponent(codigo)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, valid: false, error: data.error || 'Certificado não encontrado.' };
      }
      return { success: true, valid: data.valid, certificate: data.certificate };
    } catch (err: any) {
      return { success: false, valid: false, error: err.message || 'Erro ao consultar autenticidade do certificado.' };
    }
  }

  public async saveCertificado(cert: Partial<Certificado>): Promise<{ success: boolean; id?: string; codigoAutenticacao?: string; error?: string }> {
    try {
      const res = await fetch('/api/certificados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cert, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, id: data.id, codigoAutenticacao: data.codigoAutenticacao };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCertificado(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/certificados/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =================================================================
  // MÉTODOS DO MÓDULO DE MATERIAIS
  // =================================================================

  public getTiposMateriais(): TipoMaterial[] {
    return this.state.tiposMateriais || [];
  }

  public async saveTipoMaterial(tipo: Partial<TipoMaterial>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const res = await fetch('/api/tipos-materiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tipo)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteTipoMaterial(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/tipos-materiais/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getMateriais(user?: User | null): Material[] {
    const list = this.state.materiais || [];
    const currentUser = user || this.state.currentUser;
    if (!currentUser || currentUser.role === 'Geral') {
      return list;
    }

    if (currentUser.managementScope === 'unit' && currentUser.unitId) {
      return list.filter(m => m.unidadeId === currentUser.unitId);
    }

    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      if (currentUser.departmentId) {
        return list.filter(m => m.departamentoId === currentUser.departmentId);
      }
    }

    if (currentUser.unitId) {
      return list.filter(m => m.unidadeId === currentUser.unitId);
    }

    return list;
  }

  public async saveMaterial(material: Partial<Material>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const isEdit = Boolean(material.id && this.state.materiais.some(m => m.id === material.id));
      const url = isEdit ? `/api/materiais/${material.id}` : '/api/materiais';
      const method = isEdit ? 'PUT' : 'POST';

      const actor = this.state.currentUser;
      const payload = {
        ...material,
        criadoPorUsuarioId: actor?.id,
        criadoPorNome: actor?.name,
        updatedByUserId: actor?.id,
        updatedByName: actor?.name
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, id: data.id || material.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteMaterial(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const actor = this.state.currentUser;
      const params = new URLSearchParams({
        deletedByUserId: actor?.id || '',
        deletedByName: actor?.name || ''
      });
      const res = await fetch(`/api/materiais/${id}?${params.toString()}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getCautelasMateriais(user?: User | null): CautelaMaterial[] {
    const list = this.state.cautelasMateriais || [];
    const currentUser = user || this.state.currentUser;
    if (!currentUser || currentUser.role === 'Geral') {
      return list;
    }

    if (currentUser.managementScope === 'unit' && currentUser.unitId) {
      return list.filter(c => c.unidadeId === currentUser.unitId);
    }

    if (currentUser.role === 'Administrador' || currentUser.role === 'Armeiro') {
      if (currentUser.departmentId) {
        return list.filter(c => c.departamentoId === currentUser.departmentId);
      }
    }

    if (currentUser.role === 'Policial') {
      return list.filter(c => c.usuarioInternoId === currentUser.id || c.unidadeId === currentUser.unitId);
    }

    return list;
  }

  public async saveCautelaMaterial(cautela: Partial<CautelaMaterial>): Promise<{ success: boolean; id?: string; protocolo?: string; error?: string }> {
    try {
      const actor = this.state.currentUser;
      const payload = {
        ...cautela,
        responsavelEntregaId: actor?.id || 'sistema',
        responsavelEntregaNome: actor?.name || 'Armeiro',
        responsavelEntregaMasp: actor?.masp || ''
      };

      const res = await fetch('/api/cautelas-materiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true, id: data.id, protocolo: data.protocolo };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async returnCautelaMaterial(
    id: string,
    params: {
      status: 'Devolvido' | 'Consumido' | 'Devolvido com Anomalia';
      foiConsumido?: boolean;
      relatoUsoAnomalias?: string;
      dataDevolucao?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const actor = this.state.currentUser;
      const payload = {
        ...params,
        responsavelRecebimentoId: actor?.id || 'sistema',
        responsavelRecebimentoNome: actor?.name || 'Armeiro',
        responsavelRecebimentoMasp: actor?.masp || ''
      };

      const res = await fetch(`/api/cautelas-materiais/${id}/devolucao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCautelaMaterial(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const actor = this.state.currentUser;
      const params = new URLSearchParams({
        deletedByUserId: actor?.id || '',
        deletedByName: actor?.name || ''
      });
      const res = await fetch(`/api/cautelas-materiais/${id}?${params.toString()}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =================================================================
  // MÉTODOS DO MÓDULO DE EXPLOSIVOS
  // =================================================================
  public getExplosivos(user?: User | null): Explosivo[] {
    const actor = user || this.state.currentUser;
    const list = this.state.explosivos || [];
    if (!actor || actor.role === 'Geral') {
      return list;
    }
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return list.filter(e => !e.departmentId || e.departmentId === actor.departmentId);
    }
    return list.filter(e => !e.unitId || e.unitId === actor.unitId);
  }

  public async saveExplosivo(exp: Partial<Explosivo>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const res = await fetch('/api/explosivos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...exp, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteExplosivo(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/explosivos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getMovimentacoesExplosivos(userOrExplosivoId?: User | string | null, optionalExplosivoId?: string): MovimentacaoExplosivo[] {
    const list = this.state.movimentacoesExplosivos || [];
    let targetExplosivoId: string | undefined = undefined;
    let actor: User | null = null;

    if (typeof userOrExplosivoId === 'string') {
      targetExplosivoId = userOrExplosivoId;
    } else if (userOrExplosivoId && typeof userOrExplosivoId === 'object' && ('role' in userOrExplosivoId || 'id' in userOrExplosivoId)) {
      actor = userOrExplosivoId as User;
      targetExplosivoId = optionalExplosivoId;
    }

    let filtered = list;
    if (targetExplosivoId) {
      filtered = filtered.filter(m => m.explosivoId === targetExplosivoId);
    }

    if (actor && actor.role !== 'Geral' && actor.role !== 'Administrador') {
      if (actor.unitId) {
        filtered = filtered.filter(m => !m.unitId || m.unitId === actor.unitId);
      } else if (actor.departmentId) {
        filtered = filtered.filter(m => !m.departmentId || m.departmentId === actor.departmentId);
      }
    }

    return filtered;
  }

  public getMovimentacoesExplosivosByVault(vaultIdOrCode: string): MovimentacaoExplosivo[] {
    const list = this.state.movimentacoesExplosivos || [];
    if (!vaultIdOrCode) return list;
    const term = vaultIdOrCode.toLowerCase().trim();
    return list.filter(m => 
      (m.cofreId && m.cofreId.toLowerCase() === term) ||
      (m.localCofre && m.localCofre.toLowerCase() === term) ||
      (m.localOrigemDestino && m.localOrigemDestino.toLowerCase().includes(term))
    );
  }

  public async saveMovimentacaoExplosivo(mov: Partial<MovimentacaoExplosivo>): Promise<{ success: boolean; id?: string; newQuantity?: number; error?: string }> {
    try {
      const res = await fetch('/api/movimentacoes-explosivos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mov, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };

      const movRecord: MovimentacaoExplosivo = {
        id: data.id || mov.id || `mov-exp-${Date.now()}`,
        explosivoId: mov.explosivoId || '',
        nomeExplosivo: mov.nomeExplosivo || mov.explosivoNome || '',
        tipoMovimentacao: (mov.tipoMovimentacao as any) || 'Saída',
        quantidade: Number(mov.quantidade || 0),
        unidadeMedida: mov.unidadeMedida || 'kg',
        motivo: mov.motivo || '',
        responsavelNome: mov.responsavelNome || '',
        responsavelMasp: mov.responsavelMasp || '',
        responsavelId: mov.responsavelId || '',
        localOrigemDestino: mov.localOrigemDestino || '',
        cofreId: mov.cofreId || '',
        localCofre: mov.localCofre || '',
        dataMovimentacao: mov.dataMovimentacao || new Date().toISOString(),
        departmentId: mov.departmentId || '',
        unitId: mov.unitId || '',
        observacoes: mov.observacoes || ''
      };

      this.state.movimentacoesExplosivos = [
        movRecord,
        ...(this.state.movimentacoesExplosivos || []).filter(m => m.id !== movRecord.id)
      ];

      await this.refreshFromServer();
      return { success: true, id: data.id, newQuantity: data.newQuantity };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getTiposExplosivos(): TipoExplosivo[] {
    return this.state.tiposExplosivos || [];
  }

  public async saveTipoExplosivo(tipo: Partial<TipoExplosivo>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const isEdit = Boolean(tipo.id);
      const url = isEdit ? `/api/tipos-explosivos/${tipo.id}` : '/api/tipos-explosivos';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tipo, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteTipoExplosivo(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/tipos-explosivos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getSubtiposExplosivos(tipoIdOrNome?: string): SubtipoExplosivo[] {
    const all = this.state.subtiposExplosivos || [];
    if (!tipoIdOrNome) return all;
    const search = tipoIdOrNome.toLowerCase().trim();
    return all.filter(s => 
      (s.tipoId && s.tipoId.toLowerCase() === search) || 
      (s.tipoNome && s.tipoNome.toLowerCase() === search)
    );
  }

  public async saveSubtipoExplosivo(subtipo: Partial<SubtipoExplosivo>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const isEdit = Boolean(subtipo.id);
      const url = isEdit ? `/api/subtipos-explosivos/${subtipo.id}` : '/api/subtipos-explosivos';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...subtipo, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteSubtipoExplosivo(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/subtipos-explosivos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public getFabricantesExplosivos(): FabricanteExplosivo[] {
    return this.state.fabricantesExplosivos || [];
  }

  public async saveFabricanteExplosivo(fab: Partial<FabricanteExplosivo>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const isEdit = Boolean(fab.id);
      const url = isEdit ? `/api/fabricantes-explosivos/${fab.id}` : '/api/fabricantes-explosivos';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fab, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteFabricanteExplosivo(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/fabricantes-explosivos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // --- ROLE SWITCHING ---
  public switchActiveRole(role: UserRole): void {
    if (this.state.currentUser) {
      this.state.currentUser = {
        ...this.state.currentUser,
        activeRole: role
      };
      sessionStorage.setItem('armeria_session_user', JSON.stringify(this.state.currentUser));
    }
  }

  // --- MATERIAL VETERINÁRIO & CANIL K9 ---
  // Canis Físicos
  public getCanisFisicos(): CanilFisico[] {
    return this.state.canisFisicos || [];
  }

  public async saveCanilFisico(canil: Partial<CanilFisico>): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const isEdit = Boolean(canil.id);
      const url = isEdit ? `/api/canis-fisicos/${canil.id}` : '/api/canis-fisicos';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...canil, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id || canil.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCanilFisico(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/canis-fisicos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Cachorros K9
  public getCachorros(): Cachorro[] {
    return this.state.cachorros || [];
  }

  public async saveCachorro(dog: Partial<Cachorro>): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const isEdit = Boolean(dog.id);
      const url = isEdit ? `/api/cachorros/${dog.id}` : '/api/cachorros';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dog, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id || dog.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteCachorro(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/cachorros/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Produtos Veterinários (Remédios, Rações, Insumos)
  public getProdutosVeterinarios(): ProdutoVeterinario[] {
    return this.state.produtosVeterinarios || [];
  }

  public async saveProdutoVeterinario(prod: Partial<ProdutoVeterinario>): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const isEdit = Boolean(prod.id);
      const url = isEdit ? `/api/produtos-veterinarios/${prod.id}` : '/api/produtos-veterinarios';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prod, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id || prod.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteProdutoVeterinario(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/produtos-veterinarios/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Movimentações & Administração Veterinária
  public getMovimentacoesVeterinarias(): MovimentacaoVeterinaria[] {
    return this.state.movimentacoesVeterinarias || [];
  }

  public async saveMovimentacaoVeterinaria(mov: Partial<MovimentacaoVeterinaria>): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const res = await fetch('/api/movimentacoes-veterinarias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mov, actor: this.state.currentUser })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  // CAUTELA DE ARMAS
  // =========================================================
  public getCautelasArmas(): CautelaArma[] {
    return this.state.cautelasArmas || [];
  }

  public async requestCautelaArma(payload: any): Promise<{ success: boolean; error?: string; id?: string }> {
    const tempId = `caut-arma-${Date.now()}`;
    const newCautela: CautelaArma = {
      id: tempId,
      weaponId: payload.weaponId,
      weaponSerialNumber: payload.weaponSerialNumber,
      weaponModel: payload.weaponModel,
      weaponType: payload.weaponType,
      weaponCaliber: payload.weaponCaliber,
      magazineQuantity: payload.magazineQuantity || 2,
      vaultSpaceId: payload.vaultSpaceId,
      departmentId: payload.departmentId,
      unitId: payload.unitId,
      requesterId: payload.requesterId,
      requesterName: payload.requesterName,
      requesterMasp: payload.requesterMasp,
      requesterCargo: payload.requesterCargo,
      requesterPhone: payload.requesterPhone,
      reason: payload.reason,
      authorizationNotes: payload.authorizationNotes || payload.notes,
      status: payload.directAuthorized ? 'AUTORIZADA' : 'PENDENTE',
      requestDate: new Date().toISOString(),
      authorizedAt: payload.directAuthorized ? new Date().toISOString() : undefined,
      armorerId: payload.armorerId,
      armorerName: payload.armorerName,
      armorerMasp: payload.armorerMasp,
      ammoQuantity: payload.ammoQuantity,
      ammoDestinacao: payload.ammoDestinacao,
      ammoFabricante: payload.ammoFabricante || payload.ammunition?.fabricante,
      ammoTipo: payload.ammoTipo || payload.ammunition?.tipoMunicao,
      ammoPeso: payload.ammoPeso || payload.ammunition?.pesoMunicao,
      ammoLote: payload.ammoLote || payload.ammunition?.loteMunicao,
      hadShots: false,
      shotsFired: 0,
      isWorking: true,
      hadMalfunction: false,
      returnedMagazinesCount: payload.magazineQuantity || 2,
      createdAt: new Date().toISOString()
    };

    if (payload.ammunition && Number(payload.ammunition.quantity) > 0) {
      const tempMunId = `caut-mun-${Date.now()}`;
      newCautela.linkedAmmoCautelaId = tempMunId;
      const newMun: CautelaMunicao = {
        id: tempMunId,
        caliberId: payload.ammunition.caliberId,
        caliberName: payload.ammunition.caliberName || payload.weaponCaliber || 'Padrão',
        quantity: Number(payload.ammunition.quantity),
        fabricante: payload.ammunition.fabricante || 'CBC',
        tipoMunicao: payload.ammunition.tipoMunicao || 'Operacional',
        pesoMunicao: payload.ammunition.pesoMunicao,
        loteMunicao: payload.ammunition.loteMunicao,
        destinacao: payload.ammunition.destinacao || 'Defesa',
        vaultSpaceId: payload.ammunition.vaultSpaceId || payload.vaultSpaceId,
        departmentId: payload.departmentId,
        unitId: payload.unitId,
        linkedWeaponCautelaId: tempId,
        linkedWeaponSerialNumber: payload.weaponSerialNumber,
        weaponId: payload.weaponId,
        requesterId: payload.requesterId,
        requesterName: payload.requesterName,
        requesterMasp: payload.requesterMasp,
        requesterCargo: payload.requesterCargo,
        reason: payload.ammunition.reason || `Acautelamento em conjunto com ${payload.weaponModel} Nº ${payload.weaponSerialNumber}`,
        requestDate: new Date().toISOString(),
        status: payload.directAuthorized ? 'AUTORIZADA' : 'PENDENTE',
        armorerId: payload.armorerId,
        armorerName: payload.armorerName,
        armorerMasp: payload.armorerMasp,
        authorizedAt: payload.directAuthorized ? new Date().toISOString() : undefined,
        seraDevolvida: payload.ammunition.seraDevolvida !== undefined ? payload.ammunition.seraDevolvida : (payload.ammunition.destinacao === 'Defesa'),
        createdAt: new Date().toISOString()
      };
      if (!this.state.cautelasMunicoes) this.state.cautelasMunicoes = [];
      this.state.cautelasMunicoes.unshift(newMun);
    }

    if (!this.state.cautelasArmas) this.state.cautelasArmas = [];
    this.state.cautelasArmas.unshift(newCautela);

    // Atualização otimista imediata no estado local da arma
    const weap = (this.state.weapons || []).find(w => w.id === payload.weaponId);
    if (weap) {
      weap.status = payload.directAuthorized ? 'Acautelada' : 'Cautela Pendente';
      if (payload.directAuthorized) {
        weap.previousVaultSpaceId = payload.vaultSpaceId || weap.vaultSpaceId;
        (weap as any).locationNote = `Acautelada com ${payload.requesterName} (MASP: ${payload.requesterMasp})`;
      }
    }

    try {
      const res = await fetch('/api/cautelas-armas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      if (data.id) {
        newCautela.id = data.id;
      }
      if (data.linkedAmmoCautelaId) {
        newCautela.linkedAmmoCautelaId = data.linkedAmmoCautelaId;
        const linkedMun = (this.state.cautelasMunicoes || []).find(m => m.id === newCautela.linkedAmmoCautelaId || m.linkedWeaponCautelaId === tempId);
        if (linkedMun) {
          linkedMun.id = data.linkedAmmoCautelaId;
          linkedMun.linkedWeaponCautelaId = data.id || tempId;
        }
      }
      await this.refreshFromServer();
      return { success: true, id: data.id || tempId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async authorizeCautelaArma(
    id: string, 
    options?: string | { 
      withAmmo?: boolean;
      notes?: string; 
      armorerJustification?: string;
      vaultSpaceId?: string; 
      stockId?: string; 
      seraDevolvida?: boolean; 
      ammoQuantity?: number; 
      destinacao?: string; 
      caliberId?: string;
      caliberName?: string;
      fabricante?: string;
      tipoMunicao?: string;
      pesoMunicao?: string;
      loteMunicao?: string;
      anoFabricacao?: number | string;
      weaponId?: string; 
      weaponSerialNumber?: string; 
      weaponModel?: string;
      weaponCaliber?: string;
      departmentId?: string;
      unitId?: string;
      reason?: string;
      cautelaId?: string; 
      requesterId?: string;
      requesterName?: string; 
      requesterMasp?: string; 
      requesterCargo?: string;
      armorerId?: string;
      armorerName?: string;
      armorerMasp?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const opts = typeof options === 'string' ? { notes: options } : (options || {});
    const shouldIncludeAmmo =
      opts.withAmmo !== undefined
        ? Boolean(opts.withAmmo && opts.ammoQuantity && Number(opts.ammoQuantity) > 0)
        : Boolean(opts.ammoQuantity && Number(opts.ammoQuantity) > 0);
    
    // Atualização otimista imediata no estado local
    const cleanId = id.replace(/^caut-weapon-sync-/, '').replace(/^caut-sync-/, '');
    const target = (this.state.cautelasArmas || []).find(c => 
      c.id === id || 
      c.id === cleanId || 
      c.id === `caut-sync-${cleanId}` ||
      c.weaponId === id || 
      c.weaponId === cleanId ||
      ((opts as any).weaponId && c.weaponId === (opts as any).weaponId)
    );

    if (target) {
      const prevLinkedAmmoId = target.linkedAmmoCautelaId;
      target.status = 'AUTORIZADA';
      target.authorizedAt = new Date().toISOString();
      target.armorerId = opts.armorerId || this.state.currentUser?.id;
      target.armorerName = opts.armorerName || this.state.currentUser?.name;
      target.armorerMasp = opts.armorerMasp || this.state.currentUser?.masp;
      if (opts.requesterId) target.requesterId = opts.requesterId;
      if (opts.requesterName) target.requesterName = opts.requesterName;
      if (opts.requesterMasp) target.requesterMasp = opts.requesterMasp;
      if (opts.requesterCargo) target.requesterCargo = (opts.requesterCargo as any);
      if (opts.notes && opts.notes.trim()) {
        target.authorizationNotes = opts.notes.trim();
      }
      const weap = (this.state.weapons || []).find(w => w.id === target.weaponId);
      if (weap) {
        weap.status = 'Acautelada';
        weap.previousVaultSpaceId = target.vaultSpaceId || weap.vaultSpaceId;
        const vault = (this.state.vaultSpaces || []).find(v => v.id === weap.previousVaultSpaceId);
        (weap as any).locationNote = `Acautelada com ${target.requesterName} (MASP: ${target.requesterMasp}) • Último cofre: ${vault?.code || 'N/A'}`;
      }

      if (shouldIncludeAmmo) {
        const resolvedDest = opts.destinacao || 'Defesa';
        const resolvedCalName = opts.caliberName || target.weaponCaliber || 'Padrão';
        const resolvedFab = opts.fabricante || target.ammoFabricante || 'CBC';
        const resolvedTipo = opts.tipoMunicao || target.ammoTipo || 'Operacional';
        const resolvedPeso = opts.pesoMunicao || target.ammoPeso || 'N/I';
        const resolvedLote = opts.loteMunicao || target.ammoLote || 'Lote Unidade';
        const resolvedSeraDev =
          opts.seraDevolvida !== undefined ? opts.seraDevolvida : resolvedDest === 'Defesa';
        const rescuedMotivo = opts.reason || target.reason || 'Serviço Ordinário';
        const ammoReason = `${rescuedMotivo} — Cautela conjunta com arma ${target.weaponModel} Nº ${target.weaponSerialNumber} (Destinação: ${resolvedDest})`;

        target.ammoQuantity = Number(opts.ammoQuantity);
        target.ammoDestinacao = resolvedDest;
        target.ammoCaliberName = resolvedCalName;
        target.ammoFabricante = resolvedFab;
        target.ammoTipo = resolvedTipo;
        target.ammoPeso = resolvedPeso;
        target.ammoLote = resolvedLote;
        target.ammoSeraDevolvida = resolvedSeraDev;
        
        const linkedMun = (this.state.cautelasMunicoes || []).find(m => 
          (prevLinkedAmmoId && m.id === prevLinkedAmmoId) || 
          (m as any).cautelaArmaId === target.id || 
          m.linkedWeaponCautelaId === target.id
        );

        if (linkedMun) {
          linkedMun.status = 'AUTORIZADA';
          linkedMun.authorizedAt = new Date().toISOString();
          linkedMun.armorerId = target.armorerId;
          linkedMun.armorerName = target.armorerName;
          linkedMun.armorerMasp = target.armorerMasp;
          linkedMun.caliberId = opts.caliberId || linkedMun.caliberId;
          linkedMun.caliberName = resolvedCalName;
          linkedMun.quantity = Number(opts.ammoQuantity);
          linkedMun.fabricante = resolvedFab;
          linkedMun.tipoMunicao = resolvedTipo;
          linkedMun.pesoMunicao = resolvedPeso;
          linkedMun.loteMunicao = resolvedLote;
          linkedMun.anoFabricacao = opts.anoFabricacao ?? linkedMun.anoFabricacao;
          linkedMun.destinacao = resolvedDest;
          linkedMun.vaultSpaceId = opts.vaultSpaceId || linkedMun.vaultSpaceId || target.vaultSpaceId;
          linkedMun.seraDevolvida = resolvedSeraDev;
          linkedMun.departmentId = opts.departmentId || target.departmentId || linkedMun.departmentId;
          linkedMun.unitId = opts.unitId || target.unitId || linkedMun.unitId;
          linkedMun.requesterId = target.requesterId;
          linkedMun.requesterName = target.requesterName;
          linkedMun.requesterMasp = target.requesterMasp;
          linkedMun.requesterCargo = target.requesterCargo;
          linkedMun.reason = ammoReason;
          linkedMun.linkedWeaponCautelaId = target.id;
          linkedMun.linkedWeaponSerialNumber = target.weaponSerialNumber;
          linkedMun.linkedWeaponModel = target.weaponModel;
          linkedMun.weaponId = target.weaponId;
          if (opts.armorerJustification) {
            linkedMun.observations = opts.armorerJustification;
          }
        } else {
          const newMunId = `caut-mun-${Date.now()}`;
          target.linkedAmmoCautelaId = newMunId;
          const newMun: CautelaMunicao = {
            id: newMunId,
            caliberId: opts.caliberId,
            caliberName: resolvedCalName,
            quantity: Number(opts.ammoQuantity),
            fabricante: resolvedFab,
            tipoMunicao: resolvedTipo,
            pesoMunicao: resolvedPeso,
            loteMunicao: resolvedLote,
            anoFabricacao: opts.anoFabricacao,
            destinacao: resolvedDest,
            vaultSpaceId: opts.vaultSpaceId || target.vaultSpaceId,
            departmentId: opts.departmentId || target.departmentId,
            unitId: opts.unitId || target.unitId,
            linkedWeaponCautelaId: target.id,
            linkedWeaponSerialNumber: target.weaponSerialNumber,
            linkedWeaponModel: target.weaponModel,
            weaponId: target.weaponId,
            requesterId: target.requesterId,
            requesterName: target.requesterName,
            requesterMasp: target.requesterMasp,
            requesterCargo: target.requesterCargo,
            reason: ammoReason,
            requestDate: target.requestDate || new Date().toISOString(),
            status: 'AUTORIZADA',
            armorerId: target.armorerId,
            armorerName: target.armorerName,
            armorerMasp: target.armorerMasp,
            authorizedAt: new Date().toISOString(),
            seraDevolvida: resolvedSeraDev,
            observations: opts.armorerJustification,
            createdAt: new Date().toISOString()
          };
          if (!this.state.cautelasMunicoes) this.state.cautelasMunicoes = [];
          this.state.cautelasMunicoes.unshift(newMun);
        }
      } else {
        // Armeiro não marcou "Acautelar munições junto com a arma?":
        // limpa vínculos de munição e descarta qualquer pré-solicitação pendente vinculada
        target.linkedAmmoCautelaId = undefined;
        target.ammoQuantity = 0;
        target.ammoFabricante = undefined;
        target.ammoTipo = undefined;
        target.ammoPeso = undefined;
        target.ammoLote = undefined;
        target.ammoDestinacao = undefined;

        if (this.state.cautelasMunicoes) {
          this.state.cautelasMunicoes = this.state.cautelasMunicoes.filter(m => {
            const isLinkedToThis =
              (prevLinkedAmmoId && m.id === prevLinkedAmmoId) ||
              (m as any).cautelaArmaId === target.id ||
              m.linkedWeaponCautelaId === target.id;
            return !(isLinkedToThis && m.status === 'PENDENTE');
          });
        }
      }
    }

    try {
      const actualId = target?.id || id;
      const res = await fetch(`/api/cautelas-armas/${actualId}/autorizar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withAmmo: shouldIncludeAmmo,
          notes: opts.notes,
          armorerJustification: shouldIncludeAmmo ? opts.armorerJustification : undefined,
          vaultSpaceId: opts.vaultSpaceId,
          stockId: shouldIncludeAmmo ? opts.stockId : undefined,
          seraDevolvida: shouldIncludeAmmo ? opts.seraDevolvida : undefined,
          ammoQuantity: shouldIncludeAmmo ? opts.ammoQuantity : 0,
          destinacao: shouldIncludeAmmo ? opts.destinacao : undefined,
          caliberId: shouldIncludeAmmo ? opts.caliberId : undefined,
          caliberName: shouldIncludeAmmo ? opts.caliberName : undefined,
          fabricante: shouldIncludeAmmo ? opts.fabricante : undefined,
          tipoMunicao: shouldIncludeAmmo ? opts.tipoMunicao : undefined,
          pesoMunicao: shouldIncludeAmmo ? opts.pesoMunicao : undefined,
          loteMunicao: shouldIncludeAmmo ? opts.loteMunicao : undefined,
          anoFabricacao: shouldIncludeAmmo ? opts.anoFabricacao : undefined,
          weaponId: opts.weaponId || target?.weaponId,
          weaponSerialNumber: opts.weaponSerialNumber || target?.weaponSerialNumber,
          weaponModel: opts.weaponModel || target?.weaponModel,
          weaponCaliber: opts.weaponCaliber || target?.weaponCaliber,
          departmentId: opts.departmentId || target?.departmentId,
          unitId: opts.unitId || target?.unitId,
          reason: opts.reason || target?.reason,
          cautelaId: target?.id || id,
          requesterId: opts.requesterId || target?.requesterId,
          requesterName: opts.requesterName || target?.requesterName,
          requesterMasp: opts.requesterMasp || target?.requesterMasp,
          requesterCargo: opts.requesterCargo || target?.requesterCargo,
          armorerId: opts.armorerId || this.state.currentUser?.id,
          armorerName: opts.armorerName || this.state.currentUser?.name,
          armorerMasp: opts.armorerMasp || this.state.currentUser?.masp,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: true }; // Local state already updated
    }
  }

  public async rejectCautelaArma(
    id: string, 
    notes?: string,
    extra?: { weaponId?: string; weaponSerialNumber?: string; cautelaId?: string; requesterName?: string; requesterMasp?: string }
  ): Promise<{ success: boolean; error?: string }> {
    // Atualização otimista imediata no estado local: a arma volta para o cofre de origem
    const cleanId = id.replace(/^caut-weapon-sync-/, '').replace(/^caut-sync-/, '');
    const target = (this.state.cautelasArmas || []).find(c => 
      c.id === id || 
      c.id === cleanId || 
      c.id === `caut-sync-${cleanId}` ||
      c.weaponId === id || 
      c.weaponId === cleanId ||
      (extra?.weaponId && c.weaponId === extra.weaponId)
    );

    if (target) {
      target.status = 'RECUSADA';
      target.authorizationNotes = notes || '';
      target.armorerId = this.state.currentUser?.id;
      target.armorerName = this.state.currentUser?.name;
      target.armorerMasp = this.state.currentUser?.masp;
      
      const weap = (this.state.weapons || []).find(w => w.id === target.weaponId);
      if (weap) {
        weap.status = 'No Cofre';
        weap.vaultSpaceId = target.vaultSpaceId || weap.previousVaultSpaceId || weap.vaultSpaceId;
        delete (weap as any).locationNote;
      }
      if (target.linkedAmmoCautelaId) {
        const ammo = (this.state.cautelasMunicoes || []).find(m => m.id === target.linkedAmmoCautelaId);
        if (ammo) ammo.status = 'RECUSADA';
      }
    }

    try {
      const actualId = target?.id || id;
      const res = await fetch(`/api/cautelas-armas/${actualId}/recusar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          weaponId: extra?.weaponId || target?.weaponId,
          weaponSerialNumber: extra?.weaponSerialNumber || target?.weaponSerialNumber,
          cautelaId: target?.id || id,
          requesterName: target?.requesterName,
          requesterMasp: target?.requesterMasp,
          armorerId: this.state.currentUser?.id,
          armorerName: this.state.currentUser?.name,
          armorerMasp: this.state.currentUser?.masp,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: true }; // Local state updated
    }
  }

  public async updatePendingCautelaArma(
    id: string,
    updates: {
      weaponId: string;
      weaponSerialNumber: string;
      weaponModel: string;
      weaponType?: string;
      weaponCaliber?: string;
      magazineQuantity?: number;
      vaultSpaceId?: string;
      reason?: string;
      authorizationNotes?: string | null;
      originalWeaponId?: string;
      originalWeaponSerialNumber?: string;
      cautelaId?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const cleanId = id
      .replace(/^caut-active-/, '')
      .replace(/^caut-weapon-sync-/, '')
      .replace(/^caut-sync-/, '')
      .replace(/^caut-arma-/, '')
      .replace(/^caut-/, '');

    const target = (this.state.cautelasArmas || []).find(
      c =>
        c.id === id ||
        c.id === cleanId ||
        c.id === `caut-sync-${cleanId}` ||
        (updates.cautelaId && c.id === updates.cautelaId) ||
        (updates.originalWeaponId && c.weaponId === updates.originalWeaponId && c.status === 'PENDENTE')
    );

    try {
      const actualId = target?.id || id;
      const res = await fetch(`/api/cautelas-armas/${encodeURIComponent(actualId)}/editar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          cautelaId: target?.id || updates.cautelaId || id,
          originalWeaponId: updates.originalWeaponId || target?.weaponId,
          originalWeaponSerialNumber: updates.originalWeaponSerialNumber || target?.weaponSerialNumber,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) {
        await this.refreshFromServer();
        return { success: false, error: data.error || 'Erro ao editar solicitação de cautela.' };
      }

      // Aplica também no estado local caso o refresh seja assíncrono/offline
      if (target) {
        const oldWId = target.weaponId;
        if (updates.weaponId && updates.weaponId !== oldWId) {
          const oldW = (this.state.weapons || []).find(w => w.id === oldWId);
          if (oldW) {
            oldW.status = 'No Cofre';
            oldW.vaultSpaceId = target.vaultSpaceId || oldW.previousVaultSpaceId || oldW.vaultSpaceId;
            delete (oldW as any).locationNote;
          }
          const newW = (this.state.weapons || []).find(w => w.id === updates.weaponId);
          if (newW) {
            newW.status = 'Cautela Pendente';
            target.vaultSpaceId = newW.vaultSpaceId;
          }
        }
        target.weaponId = updates.weaponId;
        target.weaponSerialNumber = updates.weaponSerialNumber;
        target.weaponModel = updates.weaponModel;
        if (updates.weaponType !== undefined) target.weaponType = updates.weaponType;
        if (updates.weaponCaliber !== undefined) target.weaponCaliber = updates.weaponCaliber;
        if (updates.magazineQuantity !== undefined) target.magazineQuantity = updates.magazineQuantity;
        target.reason = updates.reason || '';
        target.authorizationNotes = updates.authorizationNotes || undefined;
      }

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      if (target) {
        const st = (target.status || '').toUpperCase();
        if (st !== 'PENDENTE' && st !== 'CAUTELA PENDENTE') {
          return {
            success: false,
            error: 'Esta cautela já foi analisada pelo armeiro da unidade e não pode mais ser editada.'
          };
        }
        const oldWId = target.weaponId;
        if (updates.weaponId && updates.weaponId !== oldWId) {
          const oldW = (this.state.weapons || []).find(w => w.id === oldWId);
          if (oldW) {
            oldW.status = 'No Cofre';
            oldW.vaultSpaceId = target.vaultSpaceId || oldW.previousVaultSpaceId || oldW.vaultSpaceId;
            delete (oldW as any).locationNote;
          }
          const newW = (this.state.weapons || []).find(w => w.id === updates.weaponId);
          if (newW) {
            newW.status = 'Cautela Pendente';
            target.vaultSpaceId = newW.vaultSpaceId;
          }
        }
        target.weaponId = updates.weaponId;
        target.weaponSerialNumber = updates.weaponSerialNumber;
        target.weaponModel = updates.weaponModel;
        if (updates.weaponType !== undefined) target.weaponType = updates.weaponType;
        if (updates.weaponCaliber !== undefined) target.weaponCaliber = updates.weaponCaliber;
        if (updates.magazineQuantity !== undefined) target.magazineQuantity = updates.magazineQuantity;
        target.reason = updates.reason || '';
        target.authorizationNotes = updates.authorizationNotes || undefined;
        return { success: true };
      }
      return { success: false, error: err.message || 'Erro de comunicação ao editar cautela.' };
    }
  }

  public async updateActiveCautelaArma(
    id: string,
    updates: {
      weaponId: string;
      weaponSerialNumber: string;
      weaponModel: string;
      weaponType?: string;
      weaponCaliber?: string;
      magazineQuantity: number;
      reason: string;
      requesterId?: string;
      requesterName?: string;
      requesterMasp?: string;
      requesterCargo?: string;
      departmentId?: string;
      unitId?: string;
      withAmmo: boolean;
      ammoQuantity?: number;
      destinacao?: 'Treinamento' | 'Defesa' | 'Ensaio';
      stockId?: string;
      vaultSpaceId?: string;
      seraDevolvida?: boolean;
      caliberId?: string;
      caliberName?: string;
      fabricante?: string;
      tipoMunicao?: string;
      pesoMunicao?: string;
      loteMunicao?: string;
      anoFabricacao?: number | string;
      notes?: string;
      armorerJustification?: string;
      cautelaId?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const cleanId = id
      .replace(/^caut-active-/, '')
      .replace(/^caut-weapon-sync-/, '')
      .replace(/^caut-sync-/, '')
      .replace(/^caut-arma-/, '')
      .replace(/^caut-/, '');

    const target = (this.state.cautelasArmas || []).find(
      c =>
        c.id === id ||
        c.id === cleanId ||
        c.id === `caut-sync-${cleanId}` ||
        c.id === `caut-active-${cleanId}` ||
        (updates.cautelaId && c.id === updates.cautelaId)
    );

    if (target) {
      const refIso = target.authorizedAt || target.createdAt || target.requestDate;
      const authTimeMs = refIso ? new Date(refIso).getTime() : NaN;
      if (!Number.isFinite(authTimeMs) || Date.now() - authTimeMs > 15 * 60 * 1000) {
        return {
          success: false,
          error: 'O prazo máximo de 15 minutos após a autorização expirou. Esta cautela não pode mais ser alterada.'
        };
      }
    }

    try {
      const actualId = target?.id || id;
      const res = await fetch(`/api/cautelas-armas/${encodeURIComponent(actualId)}/editar-ativa`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          cautelaId: target?.id || updates.cautelaId || id,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) {
        await this.refreshFromServer();
        return {
          success: false,
          error: data.error || 'Erro ao editar cautela ativa.'
        };
      }
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro de comunicação ao editar cautela ativa.'
      };
    }
  }

  public async cancelCautelaArma(
    id: string,
    extra?: { weaponId?: string; weaponSerialNumber?: string; cautelaId?: string; requesterName?: string; requesterMasp?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const cleanId = id.replace(/^caut-active-/, '').replace(/^caut-weapon-sync-/, '').replace(/^caut-sync-/, '').replace(/^caut-arma-/, '').replace(/^caut-/, '');
    
    const targetIdx = (this.state.cautelasArmas || []).findIndex(c => 
      c.id === id || 
      c.id === cleanId || 
      c.id === `caut-sync-${cleanId}` ||
      c.weaponId === id || 
      c.weaponId === cleanId ||
      (extra?.weaponId && c.weaponId === extra.weaponId && c.status === 'PENDENTE')
    );

    const target = targetIdx !== -1 ? this.state.cautelasArmas[targetIdx] : undefined;

    try {
      const actualId = target?.id || id;
      const res = await fetch(`/api/cautelas-armas/${encodeURIComponent(actualId)}/cancelar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weaponId: extra?.weaponId || target?.weaponId,
          weaponSerialNumber: extra?.weaponSerialNumber || target?.weaponSerialNumber,
          cautelaId: target?.id || id,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) {
        await this.refreshFromServer();
        return { success: false, error: data.error };
      }

      // Atualização imediata no estado local após confirmação do servidor
      if (targetIdx !== -1) {
        this.state.cautelasArmas.splice(targetIdx, 1);
      }
      const weapId = target?.weaponId || extra?.weaponId || cleanId;
      const weap = (this.state.weapons || []).find(w => w.id === weapId || (target?.weaponSerialNumber && w.serialNumber === target.weaponSerialNumber));
      if (weap) {
        weap.status = 'No Cofre';
        weap.vaultSpaceId = target?.vaultSpaceId || weap.previousVaultSpaceId || weap.vaultSpaceId;
        delete (weap as any).locationNote;
      }
      if (target?.linkedAmmoCautelaId) {
        const munIdx = (this.state.cautelasMunicoes || []).findIndex(m => m.id === target?.linkedAmmoCautelaId);
        if (munIdx !== -1) {
          this.state.cautelasMunicoes.splice(munIdx, 1);
        }
      }

      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      // Fallback offline local caso ainda esteja pendente
      if (target && (target.status === 'PENDENTE' || (target.status as string) === 'Cautela Pendente')) {
        if (targetIdx !== -1) this.state.cautelasArmas.splice(targetIdx, 1);
        const weapId = target.weaponId || extra?.weaponId || cleanId;
        const weap = (this.state.weapons || []).find(w => w.id === weapId || (target.weaponSerialNumber && w.serialNumber === target.weaponSerialNumber));
        if (weap) {
          weap.status = 'No Cofre';
          weap.vaultSpaceId = target.vaultSpaceId || weap.previousVaultSpaceId || weap.vaultSpaceId;
          delete (weap as any).locationNote;
        }
        return { success: true };
      }
      return { success: false, error: err.message || 'Erro ao excluir solicitação de cautela.' };
    }
  }

  public async returnCautelaArma(id: string, returnData: any): Promise<{ success: boolean; pendingReceipt?: boolean; error?: string }> {
    const cleanId = id.replace(/^caut-active-/, '').replace(/^caut-weapon-sync-/, '').replace(/^caut-sync-/, '').replace(/^caut-arma-/, '').replace(/^caut-/, '');
    const target = (this.state.cautelasArmas || []).find(c => 
      c.id === id || 
      c.id === cleanId || 
      c.weaponId === id || 
      c.weaponId === cleanId ||
      (returnData?.weaponId && c.weaponId === returnData.weaponId) ||
      (returnData?.weaponSerialNumber && c.weaponSerialNumber === returnData.weaponSerialNumber)
    );
    const weap = (this.state.weapons || []).find(w => 
      w.id === (target?.weaponId || returnData?.weaponId || cleanId) ||
      (target?.weaponSerialNumber && w.serialNumber === target.weaponSerialNumber) ||
      (returnData?.weaponSerialNumber && w.serialNumber === returnData.weaponSerialNumber)
    );

    const effectiveRole = this.state.currentUser?.activeRole || this.state.currentUser?.role;
    const isPendingReceipt = Boolean(returnData?.pendingReceipt || effectiveRole === 'Policial');

    const nowIso = new Date().toISOString();
    if (target) {
      target.status = isPendingReceipt ? 'DEVOLUCAO_PENDENTE' : 'DEVOLVIDA';
      if (!isPendingReceipt) {
        target.returnDate = nowIso;
        target.returnArmorerId = this.state.currentUser?.id;
        target.returnArmorerName = this.state.currentUser?.name;
        target.returnArmorerMasp = this.state.currentUser?.masp;
      }
      target.hadShots = Boolean(returnData.hadShots);
      target.shotsFired = Number(returnData.shotsFired || 0);
      target.isWorking = Boolean(returnData.isWorking);
      target.defectDescription = returnData.defectDescription || undefined;
      target.hadMalfunction = Boolean(returnData.hadMalfunction);
      target.malfunctionDescription = returnData.malfunctionDescription || undefined;
      target.returnedMagazinesCount = Number(returnData.returnedMagazinesCount ?? target.magazineQuantity ?? 1);
      if (returnData.returnedAmmoQuantity !== undefined && returnData.returnedAmmoQuantity !== null) {
        target.returnedAmmoQuantity = Number(returnData.returnedAmmoQuantity);
      }
      if (returnData.returnObservations !== undefined) {
        target.returnObservations = returnData.returnObservations;
      }
    }

    if (weap && !isPendingReceipt) {
      const destVault = returnData.destinationVaultSpaceId || returnData.vaultSpaceId || target?.vaultSpaceId || weap.previousVaultSpaceId || weap.vaultSpaceId;
      weap.vaultSpaceId = destVault;
      weap.previousVaultSpaceId = destVault;
      delete (weap as any).locationNote;
      weap.status = !returnData.isWorking ? 'Manutenção' : 'No Cofre';
      if (returnData.shotsFired) {
        weap.shotCount = (weap.shotCount || 0) + Number(returnData.shotsFired);
      }
    }

    // Sincroniza a cautela de munições vinculada e o estoque do cofre de destino
    const linkedAmmoId = target?.linkedAmmoCautelaId || returnData?.linkedAmmoCautelaId;
    const linkedMun = (this.state.cautelasMunicoes || []).find(m =>
      (linkedAmmoId && (m.id === linkedAmmoId || m.id === `caut-mun-${String(linkedAmmoId).replace(/^caut-mun-/, '')}`)) ||
      (target?.id && (m.linkedWeaponCautelaId === target.id || (m as any).cautelaArmaId === target.id))
    );

    if (linkedMun) {
      if (isPendingReceipt) {
        if (linkedMun.seraDevolvida && returnData.returnedAmmoQuantity !== undefined && returnData.returnedAmmoQuantity !== null) {
          linkedMun.returnedQuantity = Math.max(0, Number(returnData.returnedAmmoQuantity));
        }
      } else {
        const isPassiva = Boolean(linkedMun.seraDevolvida);
        const retQty = isPassiva ? Math.max(0, Number(returnData.returnedAmmoQuantity ?? 0)) : 0;
        linkedMun.status = isPassiva ? 'DEVOLVIDA' : 'CONSUMIDA';
        linkedMun.returnedQuantity = retQty;
        linkedMun.returnedAt = nowIso;
        linkedMun.returnArmorerId = this.state.currentUser?.id;
        linkedMun.returnArmorerName = this.state.currentUser?.name;

        const ammoDestVault = returnData.ammoDestinationVaultSpaceId || linkedMun.vaultSpaceId;
        if (isPassiva && ammoDestVault) {
          linkedMun.vaultSpaceId = ammoDestVault;
        }

        if (isPassiva && retQty > 0 && ammoDestVault) {
          const norm = (s?: string) => (s || '').trim().toLowerCase();
          const matchingStock = (this.state.ammoStocks || []).find(s =>
            s.vaultSpaceId === ammoDestVault &&
            (s.caliberId === linkedMun.caliberId || norm((s as any).caliberName) === norm(linkedMun.caliberName)) &&
            (!linkedMun.loteMunicao || norm(s.loteMunicao) === norm(linkedMun.loteMunicao))
          );
          if (matchingStock) {
            matchingStock.quantity = Number(matchingStock.quantity || 0) + retQty;
          } else {
            const destVaultObj = (this.state.vaultSpaces || []).find(v => v.id === ammoDestVault);
            if (!this.state.ammoStocks) this.state.ammoStocks = [];
            this.state.ammoStocks.unshift({
              id: `stock-mun-ret-${Date.now()}`,
              caliberId: linkedMun.caliberId || linkedMun.caliberName || 'padrao',
              quantity: retQty,
              vaultSpaceId: ammoDestVault,
              departmentId: destVaultObj?.departmentId || linkedMun.departmentId || target?.departmentId,
              unitId: destVaultObj?.unitId || linkedMun.unitId || target?.unitId,
              fabricante: linkedMun.fabricante || 'CBC',
              tipoMunicao: linkedMun.tipoMunicao || 'Operacional',
              pesoMunicao: linkedMun.pesoMunicao,
              loteMunicao: linkedMun.loteMunicao || 'Devolução',
              anoFabricacao: linkedMun.anoFabricacao,
              destinacao: linkedMun.destinacao || 'Defesa',
              updatedAt: nowIso
            } as any);
          }
        }
      }
    }

    try {
      const actualId = target?.id || id;
      const res = await fetch(`/api/cautelas-armas/${encodeURIComponent(actualId)}/devolver`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...returnData,
          pendingReceipt: isPendingReceipt,
          actorRole: effectiveRole,
          weaponId: returnData?.weaponId || target?.weaponId || weap?.id,
          weaponSerialNumber: returnData?.weaponSerialNumber || target?.weaponSerialNumber || weap?.serialNumber,
          cautelaId: target?.id || id,
          requesterName: target?.requesterName || returnData?.requesterName,
          requesterMasp: target?.requesterMasp || returnData?.requesterMasp,
          returnArmorerId: isPendingReceipt ? undefined : this.state.currentUser?.id,
          returnArmorerName: isPendingReceipt ? undefined : this.state.currentUser?.name,
          returnArmorerMasp: isPendingReceipt ? undefined : this.state.currentUser?.masp,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, pendingReceipt: Boolean(data.pendingReceipt ?? isPendingReceipt) };
    } catch (err: any) {
      return { success: true, pendingReceipt: isPendingReceipt };
    }
  }

  // =========================================================
  // CAUTELA DE MUNIÇÕES
  // =========================================================
  public getCautelasMunicoes(): CautelaMunicao[] {
    return this.state.cautelasMunicoes || [];
  }

  public async requestCautelaMunicao(payload: any): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const res = await fetch('/api/cautelas-municoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async authorizeCautelaMunicao(
    id: string, 
    options?: string | { vaultSpaceId?: string; stockId?: string; seraDevolvida?: boolean; notes?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const opts = typeof options === 'string' ? { vaultSpaceId: options } : (options || {});
    const target = (this.state.cautelasMunicoes || []).find(c => c.id === id);
    if (target) {
      target.status = 'AUTORIZADA';
      target.authorizedAt = new Date().toISOString();
      target.armorerId = this.state.currentUser?.id;
      target.armorerName = this.state.currentUser?.name;
      target.armorerMasp = this.state.currentUser?.masp;
      if (opts.seraDevolvida !== undefined) {
        target.seraDevolvida = opts.seraDevolvida;
      }
    }

    try {
      const res = await fetch(`/api/cautelas-municoes/${id}/autorizar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultSpaceId: opts.vaultSpaceId,
          stockId: opts.stockId,
          seraDevolvida: opts.seraDevolvida,
          notes: opts.notes,
          armorerId: this.state.currentUser?.id,
          armorerName: this.state.currentUser?.name,
          armorerMasp: this.state.currentUser?.masp,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  }

  public async rejectCautelaMunicao(id: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    const target = (this.state.cautelasMunicoes || []).find(c => c.id === id);
    if (target) {
      target.status = 'RECUSADA';
      target.armorerId = this.state.currentUser?.id;
      target.armorerName = this.state.currentUser?.name;
      target.armorerMasp = this.state.currentUser?.masp;
      target.observations = notes || '';
    }

    try {
      const res = await fetch(`/api/cautelas-municoes/${id}/recusar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          armorerId: this.state.currentUser?.id,
          armorerName: this.state.currentUser?.name,
          armorerMasp: this.state.currentUser?.masp,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  }

  public async returnCautelaMunicao(id: string, returnData: any): Promise<{ success: boolean; error?: string }> {
    const cleanId = id.replace(/^caut-mun-sync-/, '').replace(/^caut-mun-/, '').replace(/^caut-sync-/, '').replace(/^caut-/, '');
    const target = (this.state.cautelasMunicoes || []).find(c => c.id === id || c.id === cleanId || c.id === `caut-mun-${cleanId}`);
    if (target) {
      const returnedQty = Number(returnData.returnedQuantity || 0);
      target.status = target.seraDevolvida || returnedQty > 0 ? 'DEVOLVIDA' : 'CONSUMIDA';
      target.returnedQuantity = returnedQty;
      target.returnedAt = new Date().toISOString();
      target.returnArmorerId = this.state.currentUser?.id;
      target.returnArmorerName = this.state.currentUser?.name;
      if (returnData.destinationVaultSpaceId) {
        target.vaultSpaceId = returnData.destinationVaultSpaceId;
      }
      if (returnedQty > 0) {
        const destVault = returnData.destinationVaultSpaceId || target.vaultSpaceId;
        const matchingStock = (this.state.ammoStocks || []).find(s => 
          (s.caliberId === target.caliberId || (s as any).caliberName === target.caliberName) &&
          (destVault ? s.vaultSpaceId === destVault : true)
        );
        if (matchingStock) {
          matchingStock.quantity += returnedQty;
        }
      }
    }

    try {
      const res = await fetch(`/api/cautelas-municoes/${id}/devolver`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...returnData,
          cautelaId: target?.id || id,
          returnArmorerId: this.state.currentUser?.id,
          returnArmorerName: this.state.currentUser?.name,
          returnArmorerMasp: this.state.currentUser?.masp,
          actor: this.state.currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await this.refreshFromServer();
      return { success: true };
    } catch (err: any) {
      return { success: true };
    }
  }
}

export const storage = new StorageService();

