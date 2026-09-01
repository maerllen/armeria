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
  WeaponTransferItem
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
    certificados: []
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
        weaponTransfersRes
      ] = await Promise.all([
        fetch('/api/users').then(r => r.ok ? r.json() : []),
        fetch('/api/departments').then(r => r.ok ? r.json() : []),
        fetch('/api/units').then(r => r.ok ? r.json() : []),
        fetch('/api/vault-spaces').then(r => r.ok ? r.json() : []),
        fetch('/api/calibers').then(r => r.ok ? r.json() : []),
        fetch('/api/courses').then(r => r.ok ? r.json() : []),
        fetch('/api/available-weapon-types').then(r => r.ok ? r.json() : []),
        fetch('/api/ammo-stocks').then(r => r.ok ? r.json() : []),
        fetch('/api/ammo-movements').then(r => r.ok ? r.json() : []),
        fetch('/api/weapons').then(r => r.ok ? r.json() : []),
        fetch('/api/movements').then(r => r.ok ? r.json() : []),
        fetch('/api/audit-logs').then(r => r.ok ? r.json() : []),
        fetch('/api/academy-courses').then(r => r.ok ? r.json() : []),
        fetch('/api/weapon-boxes').then(r => r.ok ? r.json() : []),
        fetch('/api/weapon-box-replacements').then(r => r.ok ? r.json() : []),
        fetch('/api/course-classes').then(r => r.ok ? r.json() : []),
        fetch('/api/course-movements').then(r => r.ok ? r.json() : []),
        fetch('/api/lesson-plans').then(r => r.ok ? r.json() : []),
        fetch('/api/calendario-aulas').then(r => r.ok ? r.json() : []),
        fetch('/api/equipes-calendario').then(r => r.ok ? r.json() : []),
        fetch('/api/auxiliar-tabela-equipe').then(r => r.ok ? r.json() : []),
        fetch('/api/certificados').then(r => r.ok ? r.json() : []),
        fetch('/api/weapon-transfers').then(r => r.ok ? r.json() : [])
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


      // Refresh current user reference if logged in
      if (this.state.currentUser) {
        const updatedUser = this.state.users.find(u => u.id === this.state.currentUser?.id);
        if (updatedUser) {
          this.state.currentUser = updatedUser;
          sessionStorage.setItem('armeria_session_user', JSON.stringify(updatedUser));
        }
      }
    } catch (err) {
      console.error('[StorageService] Error refreshing from MySQL server:', err);
    }
    return this.state;
  }

  // --- AUTHENTICATION ---
  public async login(masp: string, pass: string): Promise<{ success: boolean; user: User | null; error?: string; isDbError?: boolean }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maspDigits: masp, passwordDigits: pass })
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

  public async addDepartment(data: { name: string; code: string }): Promise<Department> {
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

  public async updateDepartment(id: string, name: string, code: string): Promise<Department> {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, actor: this.state.currentUser })
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

  public async addUnit(data: { name: string; departmentId: string }): Promise<Unit> {
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

  public async updateUnit(id: string, name: string, departmentId: string): Promise<Unit> {
    const res = await fetch(`/api/units/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, departmentId, actor: this.state.currentUser })
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

  // --- CALIBERS ---
  public getCalibers(): Caliber[] {
    return this.state.calibers;
  }

  public async addCaliber(name: string): Promise<Caliber> {
    const res = await fetch('/api/calibers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, actor: this.state.currentUser })
    });
    const caliber = await res.json();
    if (!res.ok) throw new Error(caliber.error || 'Erro ao cadastrar calibre.');
    await this.refreshFromServer();
    return caliber;
  }

  public async updateCaliber(id: string, name: string): Promise<Caliber> {
    const res = await fetch(`/api/calibers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, actor: this.state.currentUser })
    });
    const caliber = await res.json();
    if (!res.ok) throw new Error(caliber.error || 'Erro ao atualizar calibre.');
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
    return this.state.ammoMovements.filter(m => m.unitId === actor.unitId);
  }

  public async addAmmoMovement(data: {
    type: 'Entrada' | 'Saída';
    caliberId: string;
    quantity: number;
    vaultSpaceId: string;
    recipientOrReason: string;
    responsibleType?: 'SISTEMA' | 'FORA_DO_SISTEMA';
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleMasp?: string;
    observation?: string;
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
    responsibleType?: 'SISTEMA' | 'FORA_DO_SISTEMA';
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleMasp?: string;
    observation?: string;
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

  public async deleteAmmoStock(id: string): Promise<boolean> {
    const res = await fetch(`/api/ammo-stocks/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir registro de estoque.');
    await this.refreshFromServer();
    return true;
  }

  public async deleteAmmoMovement(id: string): Promise<boolean> {
    const res = await fetch(`/api/ammo-movements/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: this.state.currentUser })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir movimentação de munição.');
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
      result = this.state.weapons.filter(w => w.departmentId === actor.departmentId);
    } else {
      // Policial or Armeiro scoped to unit: filter weapons in unit
      result = this.state.weapons.filter(w => w.unitId === actor.unitId);
      if (actor.role === 'Policial') {
        const validCourses = (actor.courses || []).filter(c => !isCourseExpired(c.completionDate));
        const qualifiedCourseObjects = this.state.courses.filter(courseObj =>
          validCourses.some(vc => vc.courseId === courseObj.id)
        );

        result = result.filter(weapon => {
          return qualifiedCourseObjects.some(course => {
            const modelMatch = (course.allowedModels || []).some(m => (m || '').toLowerCase() === (weapon.model || '').toLowerCase());
            const caliberMatch = (course.allowedCalibers || []).some(c => (c || '').toLowerCase() === (weapon.caliber || '').toLowerCase());
            return modelMatch && caliberMatch;
          });
        });
      }
    }

    return result;
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

  // --- WEAPON TRANSFERS BETWEEN UNITS ---
  public getWeaponTransfers(currentUser?: User | null): WeaponTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    // Strict Role Check: ONLY Armeiro, Administrador, and Geral can view transfers
    const allowedRoles = ['Geral', 'Administrador', 'Armeiro'];
    if (!allowedRoles.includes(actor.role)) return [];

    if (actor.role === 'Geral') return this.state.weaponTransfers;
    if (actor.role === 'Administrador' || (actor.role === 'Armeiro' && actor.managementScope !== 'unit')) {
      return this.state.weaponTransfers.filter(
        t => t.originDepartmentId === actor.departmentId || t.destinationDepartmentId === actor.departmentId
      );
    }
    return this.state.weaponTransfers.filter(
      t => t.originUnitId === actor.unitId || t.destinationUnitId === actor.unitId
    );
  }

  public getPendingIncomingTransfers(currentUser?: User | null): WeaponTransfer[] {
    const actor = currentUser || this.state.currentUser;
    if (!actor) return [];
    const transfers = this.getWeaponTransfers(actor);
    return transfers.filter(t => {
      if (t.status !== 'Pendente') return false;
      if (actor.role === 'Geral') return true;
      if (actor.role === 'Administrador') {
        return t.destinationDepartmentId === actor.departmentId || !actor.departmentId;
      }
      if (actor.role === 'Armeiro') {
        if (actor.managementScope !== 'unit') {
          return t.destinationDepartmentId === actor.departmentId;
        }
        return t.destinationUnitId === actor.unitId;
      }
      return t.destinationUnitId === actor.unitId;
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
}



export const storage = new StorageService();
