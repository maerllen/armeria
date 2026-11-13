import { Router, Request, Response } from 'express';
import { getPool, dbConfig } from './mysql';
import crypto from 'crypto';

export const apiRouter = Router();

const ARMERIA_SALT = 'PCMG_ARMERIA_SECURE_SALT_2026';

// Helper to generate SHA-256 encrypted password hash
export function hashPassword(plainText: string): string {
  if (!plainText) return '';
  return crypto.createHash('sha256').update(plainText + ARMERIA_SALT).digest('hex');
}

// Helper to log audit in DB
async function insertAuditLog(
  moduleName: string,
  action: string,
  details: string,
  user?: { id?: string; name?: string; masp?: string; role?: string },
  ip?: string
) {
  try {
    const pool = getPool();
    const id = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await pool.query(
      `INSERT INTO LOGS_AUDITORIA (ID_LOGS_AUDITORIA, MODULO_LOGS_AUDITORIA, ACAO_LOGS_AUDITORIA, DETALHES_LOGS_AUDITORIA, USUARIO_ID_LOGS_AUDITORIA, NOME_USUARIO_LOGS_AUDITORIA, MASP_USUARIO_LOGS_AUDITORIA, PERFIL_USUARIO_LOGS_AUDITORIA, ENDERECO_IP_LOGS_AUDITORIA, DATA_HORA_LOGS_AUDITORIA)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        moduleName,
        action,
        details,
        user?.id || 'sistema',
        user?.name || 'Sistema Armeria',
        user?.masp || '000000',
        user?.role || 'Geral',
        ip || '127.0.0.1'
      ]
    );
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
}

export function parseUserRoles(rolesRaw: any, primaryRole: string): string[] {
  let list: string[] = [];
  if (rolesRaw) {
    if (Array.isArray(rolesRaw)) {
      list = rolesRaw;
    } else if (typeof rolesRaw === 'string') {
      try {
        const parsed = JSON.parse(rolesRaw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = rolesRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }
  }
  if (primaryRole && !list.includes(primaryRole)) {
    list.unshift(primaryRole);
  }
  return list.length > 0 ? list : [primaryRole || 'Policial'];
}

// -------------------------------------------------------------
// AUTH & USER SESSIONS
// -------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { maspDigits, passwordDigits, chosenRole } = req.body;
    const cleanMasp = (maspDigits || '').replace(/\D/g, '');
    const cleanPass = (passwordDigits || '').trim();

    let rows: any;
    let pool;
    try {
      pool = getPool();
      try {
        [rows] = await pool.query(`
          SELECT 
            ID_USUARIOS as id,
            MASP_USUARIOS as masp,
            SENHA_USUARIOS as password,
            NOME_USUARIOS as name,
            TELEFONE_USUARIOS as phone,
            CARGO_USUARIOS as cargo,
            PERFIL_USUARIOS as role,
            ROLES_USUARIOS as roles_json,
            DEPARTAMENTO_ID_USUARIOS as department_id,
            UNIDADE_ID_USUARIOS as unit_id,
            ABRANGENCIA_GESTAO_USUARIOS as management_scope,
            PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
            PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
            TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
            EH_PROFESSOR_USUARIOS as is_teacher,
            DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
            SIGLA_PROFESSOR_USUARIOS as professor_sigla,
            DEVE_ALTERAR_SENHA_USUARIOS as must_change_password,
            DATA_CRIACAO_USUARIOS as created_at
          FROM USUARIOS WHERE MASP_USUARIOS = ?
        `, [cleanMasp]);
      } catch (colErr) {
        // Fallback se a coluna ROLES_USUARIOS ainda não foi criada no banco remoto
        [rows] = await pool.query(`
          SELECT 
            ID_USUARIOS as id,
            MASP_USUARIOS as masp,
            SENHA_USUARIOS as password,
            NOME_USUARIOS as name,
            TELEFONE_USUARIOS as phone,
            CARGO_USUARIOS as cargo,
            PERFIL_USUARIOS as role,
            NULL as roles_json,
            DEPARTAMENTO_ID_USUARIOS as department_id,
            UNIDADE_ID_USUARIOS as unit_id,
            ABRANGENCIA_GESTAO_USUARIOS as management_scope,
            PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
            PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
            TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
            EH_PROFESSOR_USUARIOS as is_teacher,
            DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
            SIGLA_PROFESSOR_USUARIOS as professor_sigla,
            DEVE_ALTERAR_SENHA_USUARIOS as must_change_password,
            DATA_CRIACAO_USUARIOS as created_at
          FROM USUARIOS WHERE MASP_USUARIOS = ?
        `, [cleanMasp]);
      }
    } catch (dbErr: any) {
      console.error('[MySQL Login Error]', dbErr);
      const isAccessDenied = dbErr.code === 'ER_ACCESS_DENIED_ERROR' || dbErr.message?.includes('Access denied');
      const isConnRefused = dbErr.code === 'ECONNREFUSED' || dbErr.message?.includes('ECONNREFUSED');

      let customMsg = `Erro no banco de dados MySQL (${dbErr.code || 'ERRO'}): ${dbErr.message}`;
      if (isAccessDenied) {
        customMsg = `Acesso negado ao MySQL para o usuário '${dbConfig.user}'. Verifique o usuário, senha e permissões do banco no Hostinger.`;
      } else if (isConnRefused) {
        customMsg = `Não foi possível conectar ao servidor MySQL (${dbConfig.host}:${dbConfig.port}). Verifique se o MySQL está ativo.`;
      }

      return res.status(500).json({
        success: false,
        isDbError: true,
        dbErrorCode: dbErr.code || 'DB_CONNECT_ERROR',
        error: customMsg,
        rawMessage: dbErr.message
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'MASP ou senha incorretos.' });
    }

    const dbUser = rows[0];

    if (!dbUser.has_system_access) {
      return res.status(403).json({ success: false, error: 'Usuário sem permissão de acesso ao sistema.' });
    }

    const hashedInput = hashPassword(cleanPass);
    const legacyHash = crypto.createHash('sha256').update(cleanPass).digest('hex');
    const isHashMatch = dbUser.password === hashedInput;
    const isLegacyHashMatch = Boolean(dbUser.password) && dbUser.password === legacyHash;
    const isPlainMatch = dbUser.password === cleanPass;
    const isMaspDefaultMatch = cleanPass === cleanMasp;
    const isDefault123456Match = cleanPass === '123456';
    const isKnownPlaceholderHash = dbUser.password === '65d9fcbd6574ef2712c78de67904c8ed715eb4301e999389ad6ff2dfdf1f3700';

    const isValidPassword =
      isHashMatch ||
      isLegacyHashMatch ||
      isPlainMatch ||
      isMaspDefaultMatch ||
      (isKnownPlaceholderHash && (isDefault123456Match || isMaspDefaultMatch));

    if (!isValidPassword) {
      return res.status(400).json({ success: false, error: 'Senha incorreta.' });
    }

    // Auto-encrypt and upgrade password in MariaDB to secure salted hash on successful login
    if (!isHashMatch) {
      await pool.query('UPDATE USUARIOS SET SENHA_USUARIOS = ? WHERE ID_USUARIOS = ?', [hashedInput, dbUser.id]);
    }

    // Get user courses
    const [courses]: any = await pool.query('SELECT CURSO_ID_USUARIO_CURSOS as courseId, DATA_CONCLUSAO_USUARIO_CURSOS as completionDate, DATA_VALIDADE_USUARIO_CURSOS as expirationDate FROM USUARIO_CURSOS WHERE USUARIO_ID_USUARIO_CURSOS = ?', [dbUser.id]);

    const userRoles = parseUserRoles(dbUser.roles_json, dbUser.role);
    const activeRole = (chosenRole && userRoles.includes(chosenRole)) ? chosenRole : dbUser.role;

    const formattedUser = {
      id: dbUser.id,
      masp: dbUser.masp,
      name: dbUser.name,
      phone: dbUser.phone || '',
      cargo: dbUser.cargo,
      role: dbUser.role,
      roles: userRoles,
      activeRole: activeRole,
      departmentId: dbUser.department_id || '',
      unitId: dbUser.unit_id || '',
      managementScope: (dbUser.management_scope as any) || 'unit',
      canMoveAmmunition: Boolean(dbUser.can_move_ammo),
      canMoveWeapons: Boolean(dbUser.can_move_weapons),
      hasSystemAccess: Boolean(dbUser.has_system_access),
      mustChangePassword: Boolean(dbUser.must_change_password),
      isTeacher: Boolean(dbUser.is_teacher),
      teacherSubject: dbUser.teacher_subject || undefined,
      professorSigla: dbUser.professor_sigla || '',
      professor_sigla: dbUser.professor_sigla || '',
      courses: (courses || []).map((c: any) => ({
        courseId: c.courseId,
        completionDate: c.completionDate ? new Date(c.completionDate).toISOString().split('T')[0] : '',
        expirationDate: c.expirationDate ? new Date(c.expirationDate).toISOString().split('T')[0] : ''
      })),
      createdAt: dbUser.created_at
    };

    await insertAuditLog(
      'Login',
      'Login',
      `Usuário ${formattedUser.name} (MASP ${formattedUser.masp}) efetuou login no sistema via MySQL`,
      formattedUser,
      req.ip
    );

    return res.json({ success: true, user: formattedUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/auth/change-password', async (req: Request, res: Response) => {
  try {
    const { userId, newPassword } = req.body;
    const cleanPass = (newPassword || '').trim();

    if (!cleanPass || cleanPass.length < 6) {
      return res.status(400).json({ success: false, error: 'A nova senha deve possuir no mínimo 6 caracteres.' });
    }

    const pool = getPool();
    const [rows]: any = await pool.query('SELECT ID_USUARIOS as id, NOME_USUARIOS as name, MASP_USUARIOS as masp, PERFIL_USUARIOS as role FROM USUARIOS WHERE ID_USUARIOS = ?', [userId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const user = rows[0];
    if (cleanPass === user.masp) {
      return res.status(400).json({ success: false, error: 'A nova senha não pode ser igual ao MASP.' });
    }

    const hashedNewPass = hashPassword(cleanPass);
    await pool.query('UPDATE USUARIOS SET SENHA_USUARIOS = ?, DEVE_ALTERAR_SENHA_USUARIOS = 0 WHERE ID_USUARIOS = ?', [hashedNewPass, userId]);

    await insertAuditLog(
      'Perfil',
      'Alterar Senha',
      `Usuário ${user.name} alterou sua senha de acesso no banco MySQL`,
      { id: user.id, name: user.name, masp: user.masp, role: user.role },
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// DEPARTMENTS
// -------------------------------------------------------------
apiRouter.get('/departments', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query('SELECT ID_DEPARTAMENTOS as id, NOME_DEPARTAMENTOS as name, CODIGO_DEPARTAMENTOS as code, LOGO_URL_DEPARTAMENTOS as logoUrl, DATA_CRIACAO_DEPARTAMENTOS as createdAt FROM DEPARTAMENTOS ORDER BY DATA_CRIACAO_DEPARTAMENTOS ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/departments', async (req: Request, res: Response) => {
  try {
    const { name, code, logoUrl, actor } = req.body;
    const pool = getPool();
    const id = `dept-${Date.now()}`;
    await pool.query(
      'INSERT INTO DEPARTAMENTOS (ID_DEPARTAMENTOS, NOME_DEPARTAMENTOS, CODIGO_DEPARTAMENTOS, LOGO_URL_DEPARTAMENTOS, DATA_CRIACAO_DEPARTAMENTOS) VALUES (?, ?, ?, ?, NOW())',
      [id, name, code || '', logoUrl || null]
    );

    await insertAuditLog('Unidade', 'Criar', `Criado departamento: ${name} (${code})`, actor, req.ip);
    return res.json({ id, name, code, logoUrl: logoUrl || undefined, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/departments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, logoUrl, actor } = req.body;
    const pool = getPool();
    await pool.query(
      'UPDATE DEPARTAMENTOS SET NOME_DEPARTAMENTOS = ?, CODIGO_DEPARTAMENTOS = ?, LOGO_URL_DEPARTAMENTOS = ? WHERE ID_DEPARTAMENTOS = ?',
      [name, code, logoUrl !== undefined ? (logoUrl || null) : null, id]
    );

    await insertAuditLog('Unidade', 'Editar', `Atualizado departamento: ${name}`, actor, req.ip);
    return res.json({ id, name, code, logoUrl: logoUrl || undefined });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/departments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [deptRows]: any = await pool.query('SELECT ID_DEPARTAMENTOS as id, NOME_DEPARTAMENTOS as name FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTOS = ?', [id]);
    if (!deptRows || deptRows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    const [units]: any = await pool.query('SELECT COUNT(*) as cnt FROM UNIDADES WHERE DEPARTAMENTO_ID_UNIDADES = ?', [id]);
    if (units[0].cnt > 0) {
      return res.status(400).json({
        error: `Não é possível excluir o departamento "${deptRows[0].name}" porque existem ${units[0].cnt} unidade(s) vinculada(s) a ele.`
      });
    }

    await pool.query('DELETE FROM DEPARTAMENTOS WHERE ID_DEPARTAMENTOS = ?', [id]);
    await insertAuditLog('Unidade', 'Excluir', `Excluído departamento: ${deptRows[0].name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// UNITS
// -------------------------------------------------------------
apiRouter.get('/units', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query('SELECT ID_UNIDADES as id, NOME_UNIDADES as name, DEPARTAMENTO_ID_UNIDADES as departmentId, LOGO_URL_UNIDADES as logoUrl, DATA_CRIACAO_UNIDADES as createdAt FROM UNIDADES ORDER BY DATA_CRIACAO_UNIDADES ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/units', async (req: Request, res: Response) => {
  try {
    const { name, departmentId, logoUrl, actor } = req.body;
    const pool = getPool();
    const id = `unit-${Date.now()}`;
    await pool.query(
      'INSERT INTO UNIDADES (ID_UNIDADES, DEPARTAMENTO_ID_UNIDADES, NOME_UNIDADES, LOGO_URL_UNIDADES, DATA_CRIACAO_UNIDADES) VALUES (?, ?, ?, ?, NOW())',
      [id, departmentId || null, name, logoUrl || null]
    );

    await insertAuditLog('Unidade', 'Criar', `Criada unidade: ${name}`, actor, req.ip);
    return res.json({ id, name, departmentId, logoUrl: logoUrl || undefined, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/units/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, departmentId, logoUrl, actor } = req.body;
    const pool = getPool();
    await pool.query(
      'UPDATE UNIDADES SET NOME_UNIDADES = ?, DEPARTAMENTO_ID_UNIDADES = ?, LOGO_URL_UNIDADES = ? WHERE ID_UNIDADES = ?',
      [name, departmentId || null, logoUrl !== undefined ? (logoUrl || null) : null, id]
    );

    await insertAuditLog('Unidade', 'Editar', `Atualizada unidade: ${name}`, actor, req.ip);
    return res.json({ id, name, departmentId, logoUrl: logoUrl || undefined });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});


apiRouter.delete('/units/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [unitRows]: any = await pool.query('SELECT ID_UNIDADES as id, NOME_UNIDADES as name FROM UNIDADES WHERE ID_UNIDADES = ?', [id]);
    if (!unitRows || unitRows.length === 0) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }

    const [usersCnt]: any = await pool.query('SELECT COUNT(*) as cnt FROM USUARIOS WHERE UNIDADE_ID_USUARIOS = ?', [id]);
    const [weapsCnt]: any = await pool.query('SELECT COUNT(*) as cnt FROM ARMAS WHERE UNIDADE_ID_ARMAS = ?', [id]);

    if (usersCnt[0].cnt > 0 || weapsCnt[0].cnt > 0) {
      return res.status(400).json({
        error: `Não é possível excluir a unidade "${unitRows[0].name}" pois possui ${usersCnt[0].cnt} policial(is) e ${weapsCnt[0].cnt} arma(s) cadastrada(s).`
      });
    }

    await pool.query('DELETE FROM UNIDADES WHERE ID_UNIDADES = ?', [id]);
    await insertAuditLog('Unidade', 'Excluir', `Excluída unidade: ${unitRows[0].name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// USERS
// -------------------------------------------------------------
apiRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    let users: any[] = [];
    try {
      const [rows]: any = await pool.query(`
        SELECT 
          ID_USUARIOS as id,
          MASP_USUARIOS as masp,
          SENHA_USUARIOS as password,
          NOME_USUARIOS as name,
          TELEFONE_USUARIOS as phone,
          CARGO_USUARIOS as cargo,
          PERFIL_USUARIOS as role,
          ROLES_USUARIOS as roles_json,
          DEPARTAMENTO_ID_USUARIOS as department_id,
          UNIDADE_ID_USUARIOS as unit_id,
          ABRANGENCIA_GESTAO_USUARIOS as management_scope,
          PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
          PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
          TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
          EH_PROFESSOR_USUARIOS as is_teacher,
          DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
          SIGLA_PROFESSOR_USUARIOS as professor_sigla,
          DEVE_ALTERAR_SENHA_USUARIOS as must_change_password,
          DATA_CRIACAO_USUARIOS as created_at
        FROM USUARIOS ORDER BY DATA_CRIACAO_USUARIOS ASC
      `);
      users = rows || [];
    } catch {
      const [rows]: any = await pool.query(`
        SELECT 
          ID_USUARIOS as id,
          MASP_USUARIOS as masp,
          SENHA_USUARIOS as password,
          NOME_USUARIOS as name,
          TELEFONE_USUARIOS as phone,
          CARGO_USUARIOS as cargo,
          PERFIL_USUARIOS as role,
          NULL as roles_json,
          DEPARTAMENTO_ID_USUARIOS as department_id,
          UNIDADE_ID_USUARIOS as unit_id,
          ABRANGENCIA_GESTAO_USUARIOS as management_scope,
          PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
          PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
          TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
          EH_PROFESSOR_USUARIOS as is_teacher,
          DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
          SIGLA_PROFESSOR_USUARIOS as professor_sigla,
          DEVE_ALTERAR_SENHA_USUARIOS as must_change_password,
          DATA_CRIACAO_USUARIOS as created_at
        FROM USUARIOS ORDER BY DATA_CRIACAO_USUARIOS ASC
      `);
      users = rows || [];
    }
    const [userCourses]: any = await pool.query(`
      SELECT 
        ID_USUARIO_CURSOS as id,
        USUARIO_ID_USUARIO_CURSOS as user_id,
        CURSO_ID_USUARIO_CURSOS as course_id,
        DATA_CONCLUSAO_USUARIO_CURSOS as completion_date,
        DATA_VALIDADE_USUARIO_CURSOS as expiration_date
      FROM USUARIO_CURSOS
    `);

    const mapped = users.map((u: any) => {
      const courses = userCourses
        .filter((uc: any) => uc.user_id === u.id)
        .map((uc: any) => ({
          courseId: uc.course_id,
          completionDate: uc.completion_date ? new Date(uc.completion_date).toISOString().split('T')[0] : '',
          expirationDate: uc.expiration_date ? new Date(uc.expiration_date).toISOString().split('T')[0] : ''
        }));

      return {
        id: u.id,
        masp: u.masp,
        password: u.password,
        name: u.name,
        phone: u.phone || '',
        cargo: u.cargo,
        role: u.role,
        roles: parseUserRoles(u.roles_json, u.role),
        departmentId: u.department_id || '',
        unitId: u.unit_id || '',
        managementScope: (u.management_scope as any) || 'unit',
        canMoveAmmunition: Boolean(u.can_move_ammo),
        canMoveWeapons: Boolean(u.can_move_weapons),
        hasSystemAccess: Boolean(u.has_system_access),
        mustChangePassword: Boolean(u.must_change_password),
        isTeacher: Boolean(u.is_teacher),
        teacherSubject: u.teacher_subject || undefined,
        professorSigla: u.professor_sigla || '',
        professor_sigla: u.professor_sigla || '',
        courses,
        createdAt: u.created_at
      };
    });

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const { masp, name, phone, cargo, role, roles, departmentId, unitId, managementScope, canMoveAmmunition, canMoveWeapons, hasSystemAccess, isTeacher, teacherSubject, professorSigla, professor_sigla, courses, actor } = req.body;
    const cleanMasp = (masp || '').replace(/\D/g, '');
    const siglaProf = professorSigla || professor_sigla || null;
    const userRoles = parseUserRoles(roles, role);
    const rolesJson = JSON.stringify(userRoles);
    const userScope = managementScope === 'department' ? 'department' : 'unit';

    // Validação estrita: O usuário cadastrador só pode liberar acesso aos perfis que ele próprio possui
    if (actor) {
      const actorRoles = parseUserRoles(actor.roles, actor.role);
      const isActorGeral = actorRoles.includes('Geral') || actor.role === 'Geral';
      if (!isActorGeral) {
        for (const r of userRoles) {
          if (r !== 'Policial' && !actorRoles.includes(r)) {
            const label = r === 'operador_canino' ? 'Operador Canino' : r;
            return res.status(403).json({
              error: `Você não possui o perfil "${label}" e não tem autorização para concedê-lo a outros usuários.`
            });
          }
        }
      }
    }

    const pool = getPool();
    const [existing]: any = await pool.query('SELECT ID_USUARIOS FROM USUARIOS WHERE MASP_USUARIOS = ?', [cleanMasp]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe um usuário cadastrado com o MASP ${cleanMasp}` });
    }

    const id = `usr-${Date.now()}`;
    const hashedDefaultPass = hashPassword(cleanMasp);
    try {
      await pool.query(
        `INSERT INTO USUARIOS (ID_USUARIOS, MASP_USUARIOS, SENHA_USUARIOS, NOME_USUARIOS, TELEFONE_USUARIOS, CARGO_USUARIOS, PERFIL_USUARIOS, ROLES_USUARIOS, DEPARTAMENTO_ID_USUARIOS, UNIDADE_ID_USUARIOS, ABRANGENCIA_GESTAO_USUARIOS, PODE_MOVER_MUNICAO_USUARIOS, PODE_MOVER_ARMAS_USUARIOS, TEM_ACESSO_SISTEMA_USUARIOS, EH_PROFESSOR_USUARIOS, DISCIPLINA_PROFESSOR_USUARIOS, SIGLA_PROFESSOR_USUARIOS, DEVE_ALTERAR_SENHA_USUARIOS, DATA_CRIACAO_USUARIOS)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
        [
          id,
          cleanMasp,
          hashedDefaultPass, // Encrypted default password = MASP hash
          name,
          phone || null,
          cargo,
          role,
          rolesJson,
          departmentId || null,
          unitId || null,
          userScope,
          canMoveAmmunition ? 1 : 0,
          canMoveWeapons ? 1 : 0,
          hasSystemAccess ? 1 : 0,
          isTeacher ? 1 : 0,
          teacherSubject || null,
          siglaProf
        ]
      );
    } catch {
      await pool.query(
        `INSERT INTO USUARIOS (ID_USUARIOS, MASP_USUARIOS, SENHA_USUARIOS, NOME_USUARIOS, TELEFONE_USUARIOS, CARGO_USUARIOS, PERFIL_USUARIOS, DEPARTAMENTO_ID_USUARIOS, UNIDADE_ID_USUARIOS, ABRANGENCIA_GESTAO_USUARIOS, PODE_MOVER_MUNICAO_USUARIOS, PODE_MOVER_ARMAS_USUARIOS, TEM_ACESSO_SISTEMA_USUARIOS, EH_PROFESSOR_USUARIOS, DISCIPLINA_PROFESSOR_USUARIOS, SIGLA_PROFESSOR_USUARIOS, DEVE_ALTERAR_SENHA_USUARIOS, DATA_CRIACAO_USUARIOS)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
        [
          id,
          cleanMasp,
          hashedDefaultPass,
          name,
          phone || null,
          cargo,
          role,
          departmentId || null,
          unitId || null,
          userScope,
          canMoveAmmunition ? 1 : 0,
          canMoveWeapons ? 1 : 0,
          hasSystemAccess ? 1 : 0,
          isTeacher ? 1 : 0,
          teacherSubject || null,
          siglaProf
        ]
      );
    }

    if (Array.isArray(courses)) {
      for (const c of courses) {
        if (c.courseId) {
          const ucId = `uc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await pool.query(
            'INSERT INTO USUARIO_CURSOS (ID_USUARIO_CURSOS, USUARIO_ID_USUARIO_CURSOS, CURSO_ID_USUARIO_CURSOS, DATA_CONCLUSAO_USUARIO_CURSOS, DATA_VALIDADE_USUARIO_CURSOS, DATA_CRIACAO_USUARIO_CURSOS) VALUES (?, ?, ?, ?, ?, NOW())',
            [ucId, id, c.courseId, c.completionDate || new Date().toISOString().split('T')[0], c.expirationDate || null]
          );
        }
      }
    }

    await insertAuditLog('Usuários', 'Criar', `Cadastrado novo policial: ${name} (MASP: ${cleanMasp}, Cargo: ${cargo})`, actor, req.ip);

    return res.json({
      id,
      masp: cleanMasp,
      password: cleanMasp,
      name,
      phone: phone || '',
      cargo,
      role,
      departmentId,
      unitId,
      managementScope: userScope,
      canMoveAmmunition,
      canMoveWeapons,
      hasSystemAccess,
      isTeacher: Boolean(isTeacher),
      teacherSubject,
      mustChangePassword: true,
      courses: courses || [],
      createdAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/users/import-excel', async (req: Request, res: Response) => {
  try {
    const { users, actor } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'Nenhum usuário válido encontrado na planilha para importação.' });
    }

    let isActorGeral = false;
    if (actor) {
      const actorRoles = parseUserRoles(actor.roles, actor.role);
      isActorGeral = actorRoles.includes('Geral') || actor.role === 'Geral';
      const isOnlyPolicial = actorRoles.length === 1 && actorRoles[0] === 'Policial';
      if (isOnlyPolicial) {
        return res.status(403).json({ error: 'Seu perfil não possui permissão para cadastrar usuários em lote.' });
      }
    }

    const pool = getPool();

    const [existingRows]: any = await pool.query(
      'SELECT ID_USUARIOS as id, MASP_USUARIOS as masp, NOME_USUARIOS as name FROM USUARIOS'
    );
    const existingByMasp = new Map<string, { id: string; masp: string; name: string }>();
    for (const row of existingRows || []) {
      const rawDigits = String(row.masp || '').replace(/\D/g, '');
      const slicedDigits = rawDigits.slice(0, 8);
      if (rawDigits) existingByMasp.set(rawDigits, row);
      if (slicedDigits) existingByMasp.set(slicedDigits, row);
    }

    const [unitRows]: any = await pool.query(
      'SELECT ID_UNIDADES as id, NOME_UNIDADES as name, DEPARTAMENTO_ID_UNIDADES as department_id FROM UNIDADES'
    );
    const allUnits: Array<{ id: string; name: string; department_id: string }> = unitRows || [];
    const allowedUnits = (!isActorGeral && actor?.departmentId)
      ? allUnits.filter(u => u.department_id === actor.departmentId)
      : allUnits;

    const normText = (val: string) =>
      String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ');

    const normAlphaNum = (val: string) => normText(val).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    const matchUnit = (unitId?: string, unitName?: string) => {
      if (unitId) {
        const byId = allowedUnits.find(u => u.id === unitId) || (isActorGeral ? allUnits.find(u => u.id === unitId) : undefined);
        if (byId) return byId;
      }
      const target = normText(unitName || '');
      if (!target) {
        if (actor?.unitId) {
          return allowedUnits.find(u => u.id === actor.unitId) || allUnits.find(u => u.id === actor.unitId);
        }
        return undefined;
      }
      const exact = allowedUnits.find(u => normText(u.name) === target);
      if (exact) return exact;

      const targetClean = normAlphaNum(target);
      const cleanMatch = allowedUnits.find(u => normAlphaNum(u.name) === targetClean);
      if (cleanMatch) return cleanMatch;

      const tokenMatch = allowedUnits.find(u => {
        const tokens = normText(u.name).split(/[-–—/()]/).map(t => t.trim()).filter(Boolean);
        return tokens.includes(target) || tokens.some(t => normAlphaNum(t) === targetClean);
      });
      if (tokenMatch) return tokenMatch;

      const partialMatches = allowedUnits.filter(u => {
        const uClean = normAlphaNum(u.name);
        return uClean.includes(targetClean) || targetClean.includes(uClean);
      });
      if (partialMatches.length === 1) return partialMatches[0];

      return undefined;
    };

    const normalizeCargo = (rawCargo: string): string => {
      const c = normText(rawCargo);
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
      return String(rawCargo).trim().toUpperCase().slice(0, 64);
    };

    // Verifica antes se alguma linha nova possui unidade inválida/não encontrada
    const unmatchedUnitNames = new Set<string>();
    for (const item of users) {
      const digits = String(item.masp || '').replace(/\D/g, '').slice(0, 8);
      if (!digits) continue;
      // Mesmo se o MASP já existir ele será ignorado; valida unidade apenas para novos cadastros
      if (existingByMasp.has(digits)) continue;
      const resolved = matchUnit(item.unitId, item.unitName);
      if (!resolved) {
        unmatchedUnitNames.add(String(item.unitName || '(Sem Unidade)').trim());
      }
    }

    if (unmatchedUnitNames.size > 0) {
      return res.status(400).json({
        error: `Unidade(s) não encontrada(s) no sistema: ${Array.from(unmatchedUnitNames).join(', ')}. Verifique o nome da unidade na planilha ou selecione a unidade correspondente.`
      });
    }

    const importedUsers: Array<{ id: string; name: string; masp: string; cargo: string; unitId: string; unitName: string }> = [];
    const alreadyRegisteredMap = new Map<string, { name: string; existingName: string; masp: string; cargo: string; unitName: string }>();
    const seenInBatch = new Map<string, string>();
    const rolesJson = JSON.stringify(['Policial']);

    for (let i = 0; i < users.length; i++) {
      const item = users[i];
      const cleanMaspVal = String(item.masp || '').replace(/\D/g, '').slice(0, 8);
      const userName = String(item.name || '').trim();
      if (!cleanMaspVal || !userName) continue;

      const userCargo = normalizeCargo(item.cargo);
      const matchedUnit = matchUnit(item.unitId, item.unitName);
      const resolvedUnitName = matchedUnit?.name || String(item.unitName || '').trim();

      const existingDbUser = existingByMasp.get(cleanMaspVal);
      if (existingDbUser) {
        if (!alreadyRegisteredMap.has(cleanMaspVal)) {
          alreadyRegisteredMap.set(cleanMaspVal, {
            name: userName || existingDbUser.name,
            existingName: existingDbUser.name,
            masp: cleanMaspVal,
            cargo: userCargo,
            unitName: resolvedUnitName
          });
        }
        continue;
      }

      if (seenInBatch.has(cleanMaspVal)) {
        if (!alreadyRegisteredMap.has(cleanMaspVal)) {
          alreadyRegisteredMap.set(cleanMaspVal, {
            name: userName,
            existingName: seenInBatch.get(cleanMaspVal) || userName,
            masp: cleanMaspVal,
            cargo: userCargo,
            unitName: resolvedUnitName
          });
        }
        continue;
      }

      const id = `usr-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const hashedDefaultPass = hashPassword(cleanMaspVal);
      const targetDeptId = matchedUnit?.department_id || actor?.departmentId || null;
      const targetUnitId = matchedUnit?.id || actor?.unitId || null;

      // Padrões exigidos para importação via Excel:
      // PERFIL = 'Policial', Abrangência = 'unit' (Apenas Unidade),
      // ACESSO AO SISTEMA = 1 (SIM), PODE MOVIMENTAR MUNIÇÕES = 1 (SIM), PODE MOVIMENTAR ARMAS = 1 (SIM)
      try {
        await pool.query(
          `INSERT INTO USUARIOS (ID_USUARIOS, MASP_USUARIOS, SENHA_USUARIOS, NOME_USUARIOS, TELEFONE_USUARIOS, CARGO_USUARIOS, PERFIL_USUARIOS, ROLES_USUARIOS, DEPARTAMENTO_ID_USUARIOS, UNIDADE_ID_USUARIOS, ABRANGENCIA_GESTAO_USUARIOS, PODE_MOVER_MUNICAO_USUARIOS, PODE_MOVER_ARMAS_USUARIOS, TEM_ACESSO_SISTEMA_USUARIOS, EH_PROFESSOR_USUARIOS, DISCIPLINA_PROFESSOR_USUARIOS, SIGLA_PROFESSOR_USUARIOS, DEVE_ALTERAR_SENHA_USUARIOS, DATA_CRIACAO_USUARIOS)
           VALUES (?, ?, ?, ?, NULL, ?, 'Policial', ?, ?, ?, 'unit', 1, 1, 1, 0, NULL, NULL, 1, NOW())`,
          [
            id,
            cleanMaspVal,
            hashedDefaultPass,
            userName,
            userCargo,
            rolesJson,
            targetDeptId,
            targetUnitId
          ]
        );
      } catch {
        await pool.query(
          `INSERT INTO USUARIOS (ID_USUARIOS, MASP_USUARIOS, SENHA_USUARIOS, NOME_USUARIOS, TELEFONE_USUARIOS, CARGO_USUARIOS, PERFIL_USUARIOS, DEPARTAMENTO_ID_USUARIOS, UNIDADE_ID_USUARIOS, ABRANGENCIA_GESTAO_USUARIOS, PODE_MOVER_MUNICAO_USUARIOS, PODE_MOVER_ARMAS_USUARIOS, TEM_ACESSO_SISTEMA_USUARIOS, EH_PROFESSOR_USUARIOS, DISCIPLINA_PROFESSOR_USUARIOS, SIGLA_PROFESSOR_USUARIOS, DEVE_ALTERAR_SENHA_USUARIOS, DATA_CRIACAO_USUARIOS)
           VALUES (?, ?, ?, ?, NULL, ?, 'Policial', ?, ?, 'unit', 1, 1, 1, 0, NULL, NULL, 1, NOW())`,
          [
            id,
            cleanMaspVal,
            hashedDefaultPass,
            userName,
            userCargo,
            targetDeptId,
            targetUnitId
          ]
        );
      }

      seenInBatch.set(cleanMaspVal, userName);
      importedUsers.push({
        id,
        name: userName,
        masp: cleanMaspVal,
        cargo: userCargo,
        unitId: targetUnitId || '',
        unitName: resolvedUnitName
      });
    }

    const alreadyRegisteredUsers = Array.from(alreadyRegisteredMap.values());

    if (importedUsers.length > 0) {
      await insertAuditLog(
        'Usuários',
        'Importar Excel',
        `Importados ${importedUsers.length} policial(is) via planilha Excel (${alreadyRegisteredUsers.length} já cadastrado(s) ignorado(s)).`,
        actor,
        req.ip
      );
    }

    return res.json({
      success: true,
      importedCount: importedUsers.length,
      importedUsers,
      alreadyRegisteredCount: alreadyRegisteredUsers.length,
      alreadyRegisteredUsers
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const actor = req.body.actor;

    const pool = getPool();
    let rows: any[] = [];
    try {
      const [res]: any = await pool.query(`
        SELECT 
          ID_USUARIOS as id,
          MASP_USUARIOS as masp,
          SENHA_USUARIOS as password,
          NOME_USUARIOS as name,
          TELEFONE_USUARIOS as phone,
          CARGO_USUARIOS as cargo,
          PERFIL_USUARIOS as role,
          ROLES_USUARIOS as roles_json,
          DEPARTAMENTO_ID_USUARIOS as department_id,
          UNIDADE_ID_USUARIOS as unit_id,
          ABRANGENCIA_GESTAO_USUARIOS as management_scope,
          PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
          PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
          TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
          EH_PROFESSOR_USUARIOS as is_teacher,
          DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
          SIGLA_PROFESSOR_USUARIOS as professor_sigla,
          DEVE_ALTERAR_SENHA_USUARIOS as must_change_password
        FROM USUARIOS WHERE ID_USUARIOS = ?
      `, [id]);
      rows = res;
    } catch {
      const [res]: any = await pool.query(`
        SELECT 
          ID_USUARIOS as id,
          MASP_USUARIOS as masp,
          SENHA_USUARIOS as password,
          NOME_USUARIOS as name,
          TELEFONE_USUARIOS as phone,
          CARGO_USUARIOS as cargo,
          PERFIL_USUARIOS as role,
          NULL as roles_json,
          DEPARTAMENTO_ID_USUARIOS as department_id,
          UNIDADE_ID_USUARIOS as unit_id,
          ABRANGENCIA_GESTAO_USUARIOS as management_scope,
          PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
          PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
          TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
          EH_PROFESSOR_USUARIOS as is_teacher,
          DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
          SIGLA_PROFESSOR_USUARIOS as professor_sigla,
          DEVE_ALTERAR_SENHA_USUARIOS as must_change_password
        FROM USUARIOS WHERE ID_USUARIOS = ?
      `, [id]);
      rows = res;
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const userMasp = rows[0].masp;

    if (updates.resetPassword) {
      const hashedMasp = hashPassword(userMasp);
      await pool.query(
        'UPDATE USUARIOS SET SENHA_USUARIOS = ?, DEVE_ALTERAR_SENHA_USUARIOS = 1 WHERE ID_USUARIOS = ?',
        [hashedMasp, id]
      );
      await insertAuditLog(
        'Usuários',
        'Reset Senha',
        `Senha do policial ${rows[0].name} (MASP: ${userMasp}) foi resetada para o MASP pelo administrador`,
        actor,
        req.ip
      );
      return res.json({ success: true, message: 'Senha resetada para o MASP com sucesso.' });
    }

    const cleanMasp = updates.masp ? updates.masp.replace(/\D/g, '') : userMasp;

    const updatedRoles = updates.roles !== undefined ? parseUserRoles(updates.roles, updates.role || rows[0].role) : undefined;
    const rolesJson = updatedRoles ? JSON.stringify(updatedRoles) : null;
    const userScope = updates.managementScope !== undefined ? (updates.managementScope === 'department' ? 'department' : 'unit') : null;

    // Validação estrita: O usuário editor só pode conceder perfis que ele próprio possui
    if (updatedRoles !== undefined && actor) {
      const actorRoles = parseUserRoles(actor.roles, actor.role);
      const isActorGeral = actorRoles.includes('Geral') || actor.role === 'Geral';
      if (!isActorGeral) {
        const existingRoles = parseUserRoles(rows[0].roles_json, rows[0].role);
        for (const r of updatedRoles) {
          if (r !== 'Policial' && !actorRoles.includes(r) && !existingRoles.includes(r)) {
            const label = r === 'operador_canino' ? 'Operador Canino' : r;
            return res.status(403).json({
              error: `Você não possui o perfil "${label}" e não tem autorização para concedê-lo a outros usuários.`
            });
          }
        }
      }
    }

    try {
      await pool.query(
        `UPDATE USUARIOS SET
          MASP_USUARIOS = ?,
          NOME_USUARIOS = COALESCE(?, NOME_USUARIOS),
          TELEFONE_USUARIOS = COALESCE(?, TELEFONE_USUARIOS),
          CARGO_USUARIOS = COALESCE(?, CARGO_USUARIOS),
          PERFIL_USUARIOS = COALESCE(?, PERFIL_USUARIOS),
          ROLES_USUARIOS = COALESCE(?, ROLES_USUARIOS),
          DEPARTAMENTO_ID_USUARIOS = COALESCE(?, DEPARTAMENTO_ID_USUARIOS),
          UNIDADE_ID_USUARIOS = COALESCE(?, UNIDADE_ID_USUARIOS),
          ABRANGENCIA_GESTAO_USUARIOS = COALESCE(?, ABRANGENCIA_GESTAO_USUARIOS),
          PODE_MOVER_MUNICAO_USUARIOS = COALESCE(?, PODE_MOVER_MUNICAO_USUARIOS),
          PODE_MOVER_ARMAS_USUARIOS = COALESCE(?, PODE_MOVER_ARMAS_USUARIOS),
          TEM_ACESSO_SISTEMA_USUARIOS = COALESCE(?, TEM_ACESSO_SISTEMA_USUARIOS),
          EH_PROFESSOR_USUARIOS = COALESCE(?, EH_PROFESSOR_USUARIOS),
          DISCIPLINA_PROFESSOR_USUARIOS = COALESCE(?, DISCIPLINA_PROFESSOR_USUARIOS),
          SIGLA_PROFESSOR_USUARIOS = COALESCE(?, SIGLA_PROFESSOR_USUARIOS)
         WHERE ID_USUARIOS = ?`,
        [
          cleanMasp,
          updates.name ?? null,
          updates.phone ?? null,
          updates.cargo ?? null,
          updates.role ?? null,
          rolesJson,
          updates.departmentId ?? null,
          updates.unitId ?? null,
          userScope,
          updates.canMoveAmmunition !== undefined ? (updates.canMoveAmmunition ? 1 : 0) : null,
          updates.canMoveWeapons !== undefined ? (updates.canMoveWeapons ? 1 : 0) : null,
          updates.hasSystemAccess !== undefined ? (updates.hasSystemAccess ? 1 : 0) : null,
          updates.isTeacher !== undefined ? (updates.isTeacher ? 1 : 0) : null,
          updates.teacherSubject !== undefined ? updates.teacherSubject : null,
          updates.professorSigla ?? updates.professor_sigla ?? null,
          id
        ]
      );
    } catch {
      await pool.query(
        `UPDATE USUARIOS SET
          MASP_USUARIOS = ?,
          NOME_USUARIOS = COALESCE(?, NOME_USUARIOS),
          TELEFONE_USUARIOS = COALESCE(?, TELEFONE_USUARIOS),
          CARGO_USUARIOS = COALESCE(?, CARGO_USUARIOS),
          PERFIL_USUARIOS = COALESCE(?, PERFIL_USUARIOS),
          DEPARTAMENTO_ID_USUARIOS = COALESCE(?, DEPARTAMENTO_ID_USUARIOS),
          UNIDADE_ID_USUARIOS = COALESCE(?, UNIDADE_ID_USUARIOS),
          ABRANGENCIA_GESTAO_USUARIOS = COALESCE(?, ABRANGENCIA_GESTAO_USUARIOS),
          PODE_MOVER_MUNICAO_USUARIOS = COALESCE(?, PODE_MOVER_MUNICAO_USUARIOS),
          PODE_MOVER_ARMAS_USUARIOS = COALESCE(?, PODE_MOVER_ARMAS_USUARIOS),
          TEM_ACESSO_SISTEMA_USUARIOS = COALESCE(?, TEM_ACESSO_SISTEMA_USUARIOS),
          EH_PROFESSOR_USUARIOS = COALESCE(?, EH_PROFESSOR_USUARIOS),
          DISCIPLINA_PROFESSOR_USUARIOS = COALESCE(?, DISCIPLINA_PROFESSOR_USUARIOS),
          SIGLA_PROFESSOR_USUARIOS = COALESCE(?, SIGLA_PROFESSOR_USUARIOS)
         WHERE ID_USUARIOS = ?`,
        [
          cleanMasp,
          updates.name ?? null,
          updates.phone ?? null,
          updates.cargo ?? null,
          updates.role ?? null,
          updates.departmentId ?? null,
          updates.unitId ?? null,
          userScope,
          updates.canMoveAmmunition !== undefined ? (updates.canMoveAmmunition ? 1 : 0) : null,
          updates.canMoveWeapons !== undefined ? (updates.canMoveWeapons ? 1 : 0) : null,
          updates.hasSystemAccess !== undefined ? (updates.hasSystemAccess ? 1 : 0) : null,
          updates.isTeacher !== undefined ? (updates.isTeacher ? 1 : 0) : null,
          updates.teacherSubject !== undefined ? updates.teacherSubject : null,
          updates.professorSigla ?? updates.professor_sigla ?? null,
          id
        ]
      );
    }

    if (Array.isArray(updates.courses)) {
      await pool.query('DELETE FROM USUARIO_CURSOS WHERE USUARIO_ID_USUARIO_CURSOS = ?', [id]);
      for (const c of updates.courses) {
        if (c.courseId) {
          const ucId = `uc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await pool.query(
            'INSERT INTO USUARIO_CURSOS (ID_USUARIO_CURSOS, USUARIO_ID_USUARIO_CURSOS, CURSO_ID_USUARIO_CURSOS, DATA_CONCLUSAO_USUARIO_CURSOS, DATA_VALIDADE_USUARIO_CURSOS, DATA_CRIACAO_USUARIO_CURSOS) VALUES (?, ?, ?, ?, ?, NOW())',
            [ucId, id, c.courseId, c.completionDate || new Date().toISOString().split('T')[0], c.expirationDate || null]
          );
        }
      }
    }

    await insertAuditLog('Usuários', 'Editar', `Atualizados dados do policial: ${updates.name || rows[0].name} (MASP: ${cleanMasp})`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [users]: any = await pool.query('SELECT ID_USUARIOS as id, NOME_USUARIOS as name, MASP_USUARIOS as masp, PERFIL_USUARIOS as role FROM USUARIOS WHERE ID_USUARIOS = ?', [id]);
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    try {
      const [activeLoans]: any = await pool.query(
        `SELECT * FROM MOVIMENTACOES_ARMAS WHERE REQUERENTE_ID_MOVIMENTACOES_ARMAS = ? AND STATUS_MOVIMENTACOES_ARMAS IN ('Em Trânsito', 'Pendente Recibo', 'Pendente Aprovação')`,
        [id]
      );

      if (activeLoans && activeLoans.length > 0) {
        return res.status(400).json({
          error: `Não é possível excluir o policial ${users[0].name} pois ele possui solicitação ou armamento ativo em cautela.`
        });
      }
    } catch {
      // Tabela de movimentações vazia ou consulta ignorada
    }

    await pool.query('DELETE FROM USUARIO_CURSOS WHERE USUARIO_ID_USUARIO_CURSOS = ?', [id]);
    await pool.query('DELETE FROM USUARIOS WHERE ID_USUARIOS = ?', [id]);

    await insertAuditLog('Usuários', 'Excluir', `Excluído policial: ${users[0].name} (MASP: ${users[0].masp})`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AVAILABLE WEAPON TYPES & MODELS
// -------------------------------------------------------------
apiRouter.get('/available-weapon-types', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query('SELECT ID_TIPOS_ARMAS as id, NOME_TIPOS_ARMAS as name, MODELOS_TIPOS_ARMAS as models, DATA_CRIACAO_TIPOS_ARMAS as createdAt FROM TIPOS_ARMAS ORDER BY NOME_TIPOS_ARMAS ASC');
    const mapped = (rows || []).map((wt: any) => ({
      id: wt.id,
      name: wt.name,
      models: typeof wt.models === 'string' ? JSON.parse(wt.models) : (wt.models || []),
      createdAt: wt.createdAt
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/available-weapon-types', async (req: Request, res: Response) => {
  try {
    const { id, name, models, actor } = req.body;
    const pool = getPool();
    const cleanName = (name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Nome do tipo de arma é obrigatório.' });

    const finalId = id || `wt-${Date.now()}`;
    const modelsArr = Array.isArray(models) ? models : [];

    // Check if updating or inserting
    const [existing]: any = await pool.query('SELECT ID_TIPOS_ARMAS as id FROM TIPOS_ARMAS WHERE ID_TIPOS_ARMAS = ?', [finalId]);
    if (existing && existing.length > 0) {
      await pool.query(
        'UPDATE TIPOS_ARMAS SET NOME_TIPOS_ARMAS = ?, MODELOS_TIPOS_ARMAS = ? WHERE ID_TIPOS_ARMAS = ?',
        [cleanName, JSON.stringify(modelsArr), finalId]
      );
      await insertAuditLog('Armas', 'Editar', `Atualizado tipo de arma disponível: ${cleanName}`, actor, req.ip);
    } else {
      await pool.query(
        'INSERT INTO TIPOS_ARMAS (ID_TIPOS_ARMAS, NOME_TIPOS_ARMAS, MODELOS_TIPOS_ARMAS, DATA_CRIACAO_TIPOS_ARMAS) VALUES (?, ?, ?, NOW())',
        [finalId, cleanName, JSON.stringify(modelsArr)]
      );
      await insertAuditLog('Armas', 'Criar', `Criado tipo de arma disponível: ${cleanName}`, actor, req.ip);
    }

    return res.json({ id: finalId, name: cleanName, models: modelsArr });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/available-weapon-types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM TIPOS_ARMAS WHERE ID_TIPOS_ARMAS = ?', [id]);
    await insertAuditLog('Armas', 'Excluir', `Excluído tipo de arma disponível ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// COURSES
// -------------------------------------------------------------
apiRouter.get('/courses', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_CURSOS as id,
        NOME_CURSOS as name,
        TIPOS_ARMAS_PERMITIDOS_CURSOS as allowed_weapon_types,
        MODELOS_PERMITIDOS_CURSOS as allowed_models,
        CALIBRES_PERMITIDOS_CURSOS as allowed_calibers,
        TIROS_POR_ALUNO_CURSOS as shots_per_student,
        TIROS_POR_TIPO_ARMA_CURSOS as shots_per_weapon_type,
        DEPARTAMENTO_ID_CURSOS as department_id,
        DATA_CRIACAO_CURSOS as created_at
      FROM CURSOS ORDER BY NOME_CURSOS ASC
    `);
    const mapped = (rows || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      allowedWeaponTypes: typeof c.allowed_weapon_types === 'string' ? JSON.parse(c.allowed_weapon_types) : (c.allowed_weapon_types || []),
      allowedModels: typeof c.allowed_models === 'string' ? JSON.parse(c.allowed_models) : (c.allowed_models || []),
      allowedCalibers: typeof c.allowed_calibers === 'string' ? JSON.parse(c.allowed_calibers) : (c.allowed_calibers || []),
      shotsPerStudent: Number(c.shots_per_student) || 0,
      shotsPerWeaponType: typeof c.shots_per_weapon_type === 'string' ? JSON.parse(c.shots_per_weapon_type) : (c.shots_per_weapon_type || {}),
      departmentId: c.department_id || '',
      createdAt: c.created_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/courses', async (req: Request, res: Response) => {
  try {
    const { id, name, allowedWeaponTypes, allowedModels, allowedCalibers, shotsPerStudent, shotsPerWeaponType, departmentId, actor } = req.body;
    const pool = getPool();
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome do curso é obrigatório.' });
    }

    const finalId = id || `course-${Date.now()}`;

    const [existing]: any = await pool.query('SELECT ID_CURSOS as id FROM CURSOS WHERE ID_CURSOS = ?', [finalId]);

    if (existing && existing.length > 0) {
      await pool.query(
        'UPDATE CURSOS SET NOME_CURSOS = ?, TIPOS_ARMAS_PERMITIDOS_CURSOS = ?, MODELOS_PERMITIDOS_CURSOS = ?, CALIBRES_PERMITIDOS_CURSOS = ?, TIROS_POR_ALUNO_CURSOS = ?, TIROS_POR_TIPO_ARMA_CURSOS = ?, DEPARTAMENTO_ID_CURSOS = ? WHERE ID_CURSOS = ?',
        [
          name,
          JSON.stringify(allowedWeaponTypes || []),
          JSON.stringify(allowedModels || []),
          JSON.stringify(allowedCalibers || []),
          Number(shotsPerStudent) || 0,
          JSON.stringify(shotsPerWeaponType || {}),
          departmentId || null,
          finalId
        ]
      );
      await insertAuditLog('Cursos', 'Editar', `Atualizado curso: ${name}`, actor, req.ip);
    } else {
      await pool.query(
        'INSERT INTO CURSOS (ID_CURSOS, NOME_CURSOS, TIPOS_ARMAS_PERMITIDOS_CURSOS, MODELOS_PERMITIDOS_CURSOS, CALIBRES_PERMITIDOS_CURSOS, TIROS_POR_ALUNO_CURSOS, TIROS_POR_TIPO_ARMA_CURSOS, DEPARTAMENTO_ID_CURSOS, DATA_CRIACAO_CURSOS) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
        [
          finalId,
          name,
          JSON.stringify(allowedWeaponTypes || []),
          JSON.stringify(allowedModels || []),
          JSON.stringify(allowedCalibers || []),
          Number(shotsPerStudent) || 0,
          JSON.stringify(shotsPerWeaponType || {}),
          departmentId || null
        ]
      );
      await insertAuditLog('Cursos', 'Criar', `Criado curso: ${name}`, actor, req.ip);
    }

    return res.json({
      id: finalId,
      name,
      allowedWeaponTypes: allowedWeaponTypes || [],
      allowedModels: allowedModels || [],
      allowedCalibers: allowedCalibers || [],
      shotsPerStudent: Number(shotsPerStudent) || 0,
      shotsPerWeaponType: shotsPerWeaponType || {},
      departmentId,
      createdAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/courses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [enrolled]: any = await pool.query('SELECT COUNT(*) as cnt FROM USUARIO_CURSOS WHERE CURSO_ID_USUARIO_CURSOS = ?', [id]);
    if (enrolled[0].cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir o curso pois ele está vinculado a ${enrolled[0].cnt} policial(is).` });
    }

    await pool.query('DELETE FROM CURSOS WHERE ID_CURSOS = ?', [id]);
    await insertAuditLog('Cursos', 'Excluir', `Excluído curso ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// VAULT SPACES
// -------------------------------------------------------------
apiRouter.get('/vault-spaces', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query('SELECT ID_COFRES as id, CODIGO_COFRES as code, TIPO_COFRES as type, DESCRICAO_CURTA_COFRES as descricaoCurta, DEPARTAMENTO_ID_COFRES as departmentId, UNIDADE_ID_COFRES as unitId, DATA_CRIACAO_COFRES as createdAt FROM COFRES ORDER BY DATA_CRIACAO_COFRES ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/vault-spaces', async (req: Request, res: Response) => {
  try {
    const { code, type, descricaoCurta, departmentId, unitId, actor } = req.body;
    const pool = getPool();
    const id = `vault-${Date.now()}`;
    const cleanDesc = descricaoCurta ? String(descricaoCurta).trim() : null;
    await pool.query(
      'INSERT INTO COFRES (ID_COFRES, CODIGO_COFRES, TIPO_COFRES, DESCRICAO_CURTA_COFRES, DEPARTAMENTO_ID_COFRES, UNIDADE_ID_COFRES, DATA_CRIACAO_COFRES) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [id, code, type, cleanDesc, departmentId || null, unitId || null]
    );

    await insertAuditLog('Cofre', 'Criar', `Criado local de guarda: ${code} (${type})${cleanDesc ? ` — ${cleanDesc}` : ''}`, actor, req.ip);
    return res.json({ id, code, type, descricaoCurta: cleanDesc, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/vault-spaces/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, type, descricaoCurta, departmentId, unitId, actor } = req.body;
    const pool = getPool();
    const cleanDesc = descricaoCurta !== undefined ? (descricaoCurta ? String(descricaoCurta).trim() : null) : undefined;

    await pool.query(
      'UPDATE COFRES SET CODIGO_COFRES = ?, TIPO_COFRES = ?, DESCRICAO_CURTA_COFRES = ?, DEPARTAMENTO_ID_COFRES = ?, UNIDADE_ID_COFRES = ? WHERE ID_COFRES = ?',
      [code, type, cleanDesc ?? null, departmentId || null, unitId || null, id]
    );

    await insertAuditLog('Cofre', 'Editar', `Atualizado local de guarda no cofre: ${code} (${type})`, actor, req.ip);
    return res.json({ id, code, type, descricaoCurta: cleanDesc ?? null, departmentId, unitId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/vault-spaces/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [weaps]: any = await pool.query("SELECT COUNT(*) as cnt FROM ARMAS WHERE COFRE_ID_ARMAS = ? AND STATUS_ARMAS = 'No Cofre'", [id]);
    const [ammos]: any = await pool.query('SELECT COUNT(*) as cnt FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND QUANTIDADE_ESTOQUE_MUNICOES > 0', [id]);
    const [mats]: any = await pool.query('SELECT COUNT(*) as cnt FROM MATERIAIS WHERE COFRE_ID_MATERIAIS = ? AND QUANTIDADE_MATERIAIS > 0', [id]);

    if (weaps[0].cnt > 0 || ammos[0].cnt > 0 || (mats[0]?.cnt || 0) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir o local do cofre pois há armas, munições ou materiais armazenados nele.' });
    }

    await pool.query('DELETE FROM COFRES WHERE ID_COFRES = ?', [id]);
    await insertAuditLog('Cofre', 'Excluir', `Excluído local do cofre ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CALIBERS & AMMO
// -------------------------------------------------------------
apiRouter.get('/calibers', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    let rows: any;
    try {
      [rows] = await pool.query(`
        SELECT 
          ID_CALIBRES as id, 
          NOME_CALIBRES as name, 
          FABRICANTE_CALIBRES as fabricante,
          TIPO_CALIBRES as tipo,
          PESO_CALIBRES as peso,
          DATA_CRIACAO_CALIBRES as createdAt 
        FROM CALIBRES 
        ORDER BY NOME_CALIBRES ASC
      `);
    } catch {
      [rows] = await pool.query('SELECT ID_CALIBRES as id, NOME_CALIBRES as name, DATA_CRIACAO_CALIBRES as createdAt FROM CALIBRES ORDER BY NOME_CALIBRES ASC');
    }
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/calibers', async (req: Request, res: Response) => {
  try {
    const { name, fabricante, tipo, peso, actor } = req.body;
    if (actor) {
      const actorRole = actor.activeRole || actor.role;
      if (actorRole !== 'Geral') {
        return res.status(403).json({ error: 'Apenas usuários com perfil Geral podem cadastrar calibres.' });
      }
    }
    const cleanName = (name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Informe o nome do calibre.' });
    }
    const cleanFab = (fabricante || '').trim() || null;
    const cleanTipo = (tipo || '').trim() || null;
    const cleanPeso = (peso || '').trim() || null;
    const pool = getPool();

    const [existing]: any = await pool.query(
      `SELECT ID_CALIBRES as id FROM CALIBRES 
       WHERE LOWER(NOME_CALIBRES) = LOWER(?) 
         AND (LOWER(COALESCE(FABRICANTE_CALIBRES, '')) = LOWER(COALESCE(?, '')) OR (? IS NULL AND FABRICANTE_CALIBRES IS NULL))
         AND (LOWER(COALESCE(TIPO_CALIBRES, '')) = LOWER(COALESCE(?, '')) OR (? IS NULL AND TIPO_CALIBRES IS NULL))
         AND (LOWER(COALESCE(PESO_CALIBRES, '')) = LOWER(COALESCE(?, '')) OR (? IS NULL AND PESO_CALIBRES IS NULL))`,
      [cleanName, cleanFab, cleanFab, cleanTipo, cleanTipo, cleanPeso, cleanPeso]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Esta especificação exata de calibre (mesmo nome, fabricante, tipo e peso) já está cadastrada.' });
    }

    const id = `cal-${Date.now()}`;
    try {
      await pool.query(
        'INSERT INTO CALIBRES (ID_CALIBRES, NOME_CALIBRES, FABRICANTE_CALIBRES, TIPO_CALIBRES, PESO_CALIBRES, DATA_CRIACAO_CALIBRES) VALUES (?, ?, ?, ?, ?, NOW())',
        [id, cleanName, cleanFab, cleanTipo, cleanPeso]
      );
    } catch {
      await pool.query('INSERT INTO CALIBRES (ID_CALIBRES, NOME_CALIBRES, DATA_CRIACAO_CALIBRES) VALUES (?, ?, NOW())', [id, cleanName]);
    }

    await insertAuditLog('Munições', 'Criar', `Cadastrada munição/calibre: ${cleanFab ? `[${cleanFab}] ` : ''}${cleanName}${cleanTipo ? ` (${cleanTipo})` : ''}${cleanPeso ? ` ${cleanPeso}` : ''}`, actor, req.ip);
    return res.json({ id, name: cleanName, fabricante: cleanFab, tipo: cleanTipo, peso: cleanPeso, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/calibers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, fabricante, tipo, peso, actor } = req.body;
    if (actor) {
      const actorRole = actor.activeRole || actor.role;
      if (actorRole !== 'Geral') {
        return res.status(403).json({ error: 'Apenas usuários com perfil Geral podem editar calibres.' });
      }
    }
    const cleanName = (name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Informe o nome do calibre.' });
    }
    const cleanFab = (fabricante || '').trim() || null;
    const cleanTipo = (tipo || '').trim() || null;
    const cleanPeso = (peso || '').trim() || null;
    const pool = getPool();

    const [calRows]: any = await pool.query('SELECT ID_CALIBRES as id, NOME_CALIBRES as name FROM CALIBRES WHERE ID_CALIBRES = ?', [id]);
    if (!calRows || calRows.length === 0) {
      return res.status(404).json({ error: 'Calibre não encontrado.' });
    }
    const oldName = (calRows[0].name || '').trim();

    const [dupRows]: any = await pool.query(
      `SELECT ID_CALIBRES as id FROM CALIBRES 
       WHERE ID_CALIBRES <> ?
         AND LOWER(NOME_CALIBRES) = LOWER(?) 
         AND (LOWER(COALESCE(FABRICANTE_CALIBRES, '')) = LOWER(COALESCE(?, '')) OR (? IS NULL AND FABRICANTE_CALIBRES IS NULL))
         AND (LOWER(COALESCE(TIPO_CALIBRES, '')) = LOWER(COALESCE(?, '')) OR (? IS NULL AND TIPO_CALIBRES IS NULL))
         AND (LOWER(COALESCE(PESO_CALIBRES, '')) = LOWER(COALESCE(?, '')) OR (? IS NULL AND PESO_CALIBRES IS NULL))`,
      [id, cleanName, cleanFab, cleanFab, cleanTipo, cleanTipo, cleanPeso, cleanPeso]
    );
    if (dupRows && dupRows.length > 0) {
      return res.status(400).json({ error: 'Já existe outro calibre cadastrado com o mesmo nome, fabricante, tipo e peso.' });
    }

    try {
      await pool.query(
        'UPDATE CALIBRES SET NOME_CALIBRES = ?, FABRICANTE_CALIBRES = ?, TIPO_CALIBRES = ?, PESO_CALIBRES = ? WHERE ID_CALIBRES = ?',
        [cleanName, cleanFab, cleanTipo, cleanPeso, id]
      );
    } catch {
      await pool.query('UPDATE CALIBRES SET NOME_CALIBRES = ? WHERE ID_CALIBRES = ?', [cleanName, id]);
    }

    if (oldName && oldName.toLowerCase() !== cleanName.toLowerCase()) {
      const [remainingOld]: any = await pool.query(
        'SELECT COUNT(*) as cnt FROM CALIBRES WHERE LOWER(NOME_CALIBRES) = LOWER(?)',
        [oldName]
      );
      if (!remainingOld || Number(remainingOld[0]?.cnt || 0) === 0) {
        await pool.query('UPDATE ARMAS SET CALIBRE_ARMAS = ? WHERE LOWER(CALIBRE_ARMAS) = LOWER(?)', [cleanName, oldName]);
      }
    }

    await insertAuditLog('Munições', 'Editar', `Atualizado cadastro de calibre: ${cleanName}${cleanTipo ? ` (${cleanTipo})` : ''}${cleanPeso ? ` ${cleanPeso}` : ''}`, actor, req.ip);
    return res.json({ success: true, id, name: cleanName, fabricante: cleanFab, tipo: cleanTipo, peso: cleanPeso });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/calibers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    if (actor) {
      const actorRole = actor.activeRole || actor.role;
      if (actorRole !== 'Geral') {
        return res.status(403).json({ error: 'Apenas usuários com perfil Geral podem excluir calibres.' });
      }
    }
    const pool = getPool();

    const [calRows]: any = await pool.query('SELECT ID_CALIBRES as id, NOME_CALIBRES as name FROM CALIBRES WHERE ID_CALIBRES = ?', [id]);
    if (!calRows || calRows.length === 0) {
      return res.status(404).json({ error: 'Calibre não encontrado' });
    }

    const caliberName = calRows[0].name;
    const [otherSameName]: any = await pool.query(
      'SELECT COUNT(*) as cnt FROM CALIBRES WHERE LOWER(NOME_CALIBRES) = LOWER(?) AND ID_CALIBRES <> ?',
      [caliberName, id]
    );
    const [weaps]: any = await pool.query('SELECT COUNT(*) as cnt FROM ARMAS WHERE LOWER(CALIBRE_ARMAS) = LOWER(?)', [caliberName]);
    const [stocks]: any = await pool.query('SELECT COUNT(*) as cnt FROM ESTOQUE_MUNICOES WHERE CALIBRE_ID_ESTOQUE_MUNICOES = ? AND QUANTIDADE_ESTOQUE_MUNICOES > 0', [id]);

    if (stocks[0].cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir este calibre "${caliberName}" pois existem munições em estoque vinculadas a ele.` });
    }
    if (otherSameName[0].cnt === 0 && weaps[0].cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir o último registro do calibre "${caliberName}" pois há armas cadastradas utilizando este calibre.` });
    }

    await pool.query('DELETE FROM CALIBRES WHERE ID_CALIBRES = ?', [id]);
    await insertAuditLog('Munições', 'Excluir', `Excluído calibre: ${caliberName}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/ammo-stocks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    let rows: any;
    try {
      [rows] = await pool.query(`
        SELECT 
          ID_ESTOQUE_MUNICOES as id, 
          CALIBRE_ID_ESTOQUE_MUNICOES as caliberId, 
          QUANTIDADE_ESTOQUE_MUNICOES as quantity, 
          DEPARTAMENTO_ID_ESTOQUE_MUNICOES as departmentId, 
          UNIDADE_ID_ESTOQUE_MUNICOES as unitId, 
          COFRE_ID_ESTOQUE_MUNICOES as vaultSpaceId,
          FABRICANTE_MUNICAO as fabricante,
          TIPO_MUNICAO as tipoMunicao,
          PESO_MUNICAO as pesoMunicao,
          LOTE_MUNICAO as loteMunicao,
          ANO_FABRICACAO_MUNICAO as anoFabricacao,
          DESTINACAO_MUNICAO as destinacao,
          COALESCE(OBSERVACAO_ESTOQUE_MUNICAO, '') as additionalInfo,
          COALESCE(OBSERVACAO_ESTOQUE_MUNICAO, '') as observacaoEstoqueMunicao,
          COALESCE(OBSERVACAO_ESTOQUE_MUNICAO, '') as observacao,
          DATA_ATUALIZACAO_ESTOQUE_MUNICOES as updatedAt
        FROM ESTOQUE_MUNICOES ORDER BY DATA_ATUALIZACAO_ESTOQUE_MUNICOES DESC
      `);
    } catch {
      [rows] = await pool.query(`
        SELECT 
          ID_ESTOQUE_MUNICOES as id, 
          CALIBRE_ID_ESTOQUE_MUNICOES as caliberId, 
          QUANTIDADE_ESTOQUE_MUNICOES as quantity, 
          DEPARTAMENTO_ID_ESTOQUE_MUNICOES as departmentId, 
          UNIDADE_ID_ESTOQUE_MUNICOES as unitId, 
          COFRE_ID_ESTOQUE_MUNICOES as vaultSpaceId,
          TIPO_MUNICAO as tipoMunicao,
          LOTE_MUNICAO as loteMunicao,
          COALESCE(OBSERVACAO_ESTOQUE_MUNICAO, '') as additionalInfo,
          COALESCE(OBSERVACAO_ESTOQUE_MUNICAO, '') as observacaoEstoqueMunicao,
          COALESCE(OBSERVACAO_ESTOQUE_MUNICAO, '') as observacao,
          DATA_ATUALIZACAO_ESTOQUE_MUNICOES as updatedAt
        FROM ESTOQUE_MUNICOES ORDER BY DATA_ATUALIZACAO_ESTOQUE_MUNICOES DESC
      `);
    }
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/ammo-stocks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    const pool = getPool();

    const actorRole = actor?.activeRole || actor?.role || '';
    if (actor && actorRole && !['Geral', 'Armeiro', 'Administrador'].includes(actorRole)) {
      return res.status(403).json({ error: 'Permissão negada. Apenas Armeiros e administradores podem excluir registros de estoque de munição.' });
    }

    await pool.query('DELETE FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [id]);
    await insertAuditLog('Munições', 'Excluir', `Excluído registro de estoque de munição ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/ammo-stocks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      quantity, caliberId, fabricante, tipoMunicao, pesoMunicao, 
      loteMunicao, anoFabricacao, destinacao, additionalInfo,
      observacao, observacaoEstoqueMunicao,
      targetVaultSpaceId, transferQuantity, transferObservation,
      actor 
    } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const actorRole = actor.activeRole || actor.role || '';
    if (actorRole && !['Geral', 'Armeiro', 'Administrador'].includes(actorRole) && !(actorRole === 'Policial' && actor.canMoveAmmunition)) {
      return res.status(403).json({ error: 'Permissão negada. Apenas Armeiros e administradores podem alterar dados de estoque de munição.' });
    }

    const pool = getPool();
    const [stocks]: any = await pool.query(
      'SELECT ID_ESTOQUE_MUNICOES as id, CALIBRE_ID_ESTOQUE_MUNICOES as caliberId, QUANTIDADE_ESTOQUE_MUNICOES as quantity, COFRE_ID_ESTOQUE_MUNICOES as vaultSpaceId, DEPARTAMENTO_ID_ESTOQUE_MUNICOES as departmentId, UNIDADE_ID_ESTOQUE_MUNICOES as unitId, OBSERVACAO_ESTOQUE_MUNICAO as observacao FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?',
      [id]
    );

    if (!stocks || stocks.length === 0) {
      return res.status(404).json({ error: 'Registro de estoque não encontrado.' });
    }

    const currentStock = stocks[0];
    const newQty = parseInt(String(quantity), 10);
    if (isNaN(newQty) || newQty < 0) {
      return res.status(400).json({ error: 'Quantidade inválida.' });
    }

    const newCaliberId = caliberId || currentStock.caliberId;
    const rawObs = observacaoEstoqueMunicao !== undefined 
      ? observacaoEstoqueMunicao 
      : (observacao !== undefined ? observacao : (additionalInfo !== undefined ? additionalInfo : currentStock.observacao));
    const cleanInfo = typeof rawObs === 'string' ? rawObs.trim() : (rawObs || '');

    const isTransfer = Boolean(targetVaultSpaceId && targetVaultSpaceId !== currentStock.vaultSpaceId);

    if (isTransfer) {
      // 1. Obter dados do cofre de destino
      const [destVaults]: any = await pool.query(
        'SELECT ID_COFRES as id, CODIGO_COFRES as code, DEPARTAMENTO_ID_COFRES as departmentId, UNIDADE_ID_COFRES as unitId FROM COFRES WHERE ID_COFRES = ?',
        [targetVaultSpaceId]
      );
      if (!destVaults || destVaults.length === 0) {
        return res.status(404).json({ error: 'Cofre de destino não encontrado.' });
      }
      const destVault = destVaults[0];

      // 2. Obter dados do cofre de origem
      const [srcVaults]: any = await pool.query(
        'SELECT ID_COFRES as id, CODIGO_COFRES as code FROM COFRES WHERE ID_COFRES = ?',
        [currentStock.vaultSpaceId]
      );
      const srcVaultCode = srcVaults && srcVaults.length > 0 ? srcVaults[0].code : 'Cofre Origem';
      const destVaultCode = destVault.code || 'Cofre Destino';

      const qtyToTransfer = transferQuantity ? Math.min(newQty, Math.max(1, parseInt(String(transferQuantity), 10))) : newQty;
      const obsTransfer = transferObservation ? String(transferObservation).slice(0, 500) : `Transferência interna entre cofres da unidade (${srcVaultCode} -> ${destVaultCode})`;

      if (qtyToTransfer >= newQty) {
        // Transferência TOTAL do lote para o novo cofre
        const [existingDestStocks]: any = await pool.query(
          `SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity 
           FROM ESTOQUE_MUNICOES 
           WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ? AND (LOTE_MUNICAO = ? OR (LOTE_MUNICAO IS NULL AND ? IS NULL))`,
          [targetVaultSpaceId, newCaliberId, loteMunicao || null, loteMunicao || null]
        );

        if (existingDestStocks && existingDestStocks.length > 0) {
          const destStockId = existingDestStocks[0].id;
          const mergedQty = existingDestStocks[0].quantity + qtyToTransfer;
          await pool.query(
            `UPDATE ESTOQUE_MUNICOES SET 
              QUANTIDADE_ESTOQUE_MUNICOES = ?,
              FABRICANTE_MUNICAO = COALESCE(?, FABRICANTE_MUNICAO),
              TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO),
              PESO_MUNICAO = COALESCE(?, PESO_MUNICAO),
              ANO_FABRICACAO_MUNICAO = COALESCE(?, ANO_FABRICACAO_MUNICAO),
              DESTINACAO_MUNICAO = COALESCE(?, DESTINACAO_MUNICAO),
              DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
             WHERE ID_ESTOQUE_MUNICOES = ?`,
            [mergedQty, fabricante || null, tipoMunicao || null, pesoMunicao || null, anoFabricacao || null, destinacao || null, destStockId]
          );
          await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = 0, DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?', [id]);
        } else {
          await pool.query(
            `UPDATE ESTOQUE_MUNICOES SET 
              COFRE_ID_ESTOQUE_MUNICOES = ?,
              UNIDADE_ID_ESTOQUE_MUNICOES = ?,
              DEPARTAMENTO_ID_ESTOQUE_MUNICOES = ?,
              QUANTIDADE_ESTOQUE_MUNICOES = ?,
              CALIBRE_ID_ESTOQUE_MUNICOES = ?,
              FABRICANTE_MUNICAO = COALESCE(?, FABRICANTE_MUNICAO),
              TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO),
              PESO_MUNICAO = COALESCE(?, PESO_MUNICAO),
              LOTE_MUNICAO = COALESCE(?, LOTE_MUNICAO),
              ANO_FABRICACAO_MUNICAO = COALESCE(?, ANO_FABRICACAO_MUNICAO),
              DESTINACAO_MUNICAO = COALESCE(?, DESTINACAO_MUNICAO),
              DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
             WHERE ID_ESTOQUE_MUNICOES = ?`,
            [
              targetVaultSpaceId, destVault.unitId || currentStock.unitId, destVault.departmentId || currentStock.departmentId,
              newQty, newCaliberId, fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null,
              anoFabricacao || null, destinacao || null, id
            ]
          );
        }
      } else {
        // Transferência PARCIAL: subtrai da origem e adiciona/cria no destino
        const remainingSourceQty = newQty - qtyToTransfer;
        await pool.query(
          `UPDATE ESTOQUE_MUNICOES SET 
            QUANTIDADE_ESTOQUE_MUNICOES = ?,
            CALIBRE_ID_ESTOQUE_MUNICOES = ?,
            FABRICANTE_MUNICAO = COALESCE(?, FABRICANTE_MUNICAO),
            TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO),
            PESO_MUNICAO = COALESCE(?, PESO_MUNICAO),
            LOTE_MUNICAO = COALESCE(?, LOTE_MUNICAO),
            ANO_FABRICACAO_MUNICAO = COALESCE(?, ANO_FABRICACAO_MUNICAO),
            DESTINACAO_MUNICAO = COALESCE(?, DESTINACAO_MUNICAO),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
           WHERE ID_ESTOQUE_MUNICOES = ?`,
          [
            remainingSourceQty, newCaliberId, fabricante || null, tipoMunicao || null, pesoMunicao || null,
            loteMunicao || null, anoFabricacao || null, destinacao || null, id
          ]
        );

        const [existingDestStocks]: any = await pool.query(
          `SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity 
           FROM ESTOQUE_MUNICOES 
           WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ? AND (LOTE_MUNICAO = ? OR (LOTE_MUNICAO IS NULL AND ? IS NULL))`,
          [targetVaultSpaceId, newCaliberId, loteMunicao || null, loteMunicao || null]
        );

        if (existingDestStocks && existingDestStocks.length > 0) {
          const destStockId = existingDestStocks[0].id;
          const mergedQty = existingDestStocks[0].quantity + qtyToTransfer;
          await pool.query(
            `UPDATE ESTOQUE_MUNICOES SET 
              QUANTIDADE_ESTOQUE_MUNICOES = ?,
              DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
             WHERE ID_ESTOQUE_MUNICOES = ?`,
            [mergedQty, destStockId]
          );
        } else {
          const newDestStockId = `stock-${Date.now()}`;
          await pool.query(
            `INSERT INTO ESTOQUE_MUNICOES (
              ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES,
              DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES,
              FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
              DATA_ATUALIZACAO_ESTOQUE_MUNICOES
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              newDestStockId, newCaliberId, qtyToTransfer, destVault.departmentId || currentStock.departmentId,
              destVault.unitId || currentStock.unitId, targetVaultSpaceId, fabricante || null, tipoMunicao || null,
              pesoMunicao || null, loteMunicao || null, anoFabricacao || null, destinacao || null
            ]
          );
        }
      }

      // Registra a Saída no cofre de origem
      const movIdOut = `ammomov-${Date.now()}-out`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movIdOut, newCaliberId, qtyToTransfer, currentStock.departmentId, currentStock.unitId, currentStock.vaultSpaceId,
          `Transferência interna: Saída para Cofre ${destVaultCode}`,
          fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null, anoFabricacao || null, destinacao || null,
          actor.id, actor.name, actor.masp, obsTransfer, actor.id, actor.name
        ]
      );

      // Registra a Entrada no cofre de destino
      const movIdIn = `ammomov-${Date.now()}-in`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Entrada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movIdIn, newCaliberId, qtyToTransfer, destVault.departmentId || currentStock.departmentId, destVault.unitId || currentStock.unitId, targetVaultSpaceId,
          `Transferência interna: Entrada vinda do Cofre ${srcVaultCode}`,
          fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null, anoFabricacao || null, destinacao || null,
          actor.id, actor.name, actor.masp, obsTransfer, actor.id, actor.name
        ]
      );

      await insertAuditLog(
        'Munições',
        'Transferir',
        `Transferência interna de munições: ${qtyToTransfer} un. do Cofre ${srcVaultCode} para o Cofre ${destVaultCode} [${fabricante || 'Fabricante N/A'} - Lote: ${loteMunicao || 'N/A'}]`,
        actor,
        req.ip
      );

      return res.json({ success: true, transferred: true, qtyToTransfer, targetVaultCode: destVaultCode });
    }

    try {
      await pool.query(
        `UPDATE ESTOQUE_MUNICOES SET 
          QUANTIDADE_ESTOQUE_MUNICOES = ?, 
          CALIBRE_ID_ESTOQUE_MUNICOES = ?, 
          FABRICANTE_MUNICAO = COALESCE(?, FABRICANTE_MUNICAO),
          TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO), 
          PESO_MUNICAO = COALESCE(?, PESO_MUNICAO),
          LOTE_MUNICAO = COALESCE(?, LOTE_MUNICAO), 
          ANO_FABRICACAO_MUNICAO = COALESCE(?, ANO_FABRICACAO_MUNICAO),
          DESTINACAO_MUNICAO = COALESCE(?, DESTINACAO_MUNICAO),
          OBSERVACAO_ESTOQUE_MUNICAO = ?,
          DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() 
        WHERE ID_ESTOQUE_MUNICOES = ?`,
        [newQty, newCaliberId, fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null, anoFabricacao || null, destinacao || null, cleanInfo, id]
      );
    } catch {
      await pool.query(
        'UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ?, CALIBRE_ID_ESTOQUE_MUNICOES = ?, TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO), LOTE_MUNICAO = COALESCE(?, LOTE_MUNICAO), OBSERVACAO_ESTOQUE_MUNICAO = ?, DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?',
        [newQty, newCaliberId, tipoMunicao || null, loteMunicao || null, cleanInfo, id]
      );
    }

    if (cleanInfo) {
      const [lastMovs]: any = await pool.query(
        'SELECT ID_MOVIMENTACOES_MUNICOES as id FROM MOVIMENTACOES_MUNICOES WHERE COFRE_ID_MOVIMENTACOES_MUNICOES = ? AND CALIBRE_ID_MOVIMENTACOES_MUNICOES = ? ORDER BY DATA_CRIACAO_MOVIMENTACOES_MUNICOES DESC LIMIT 1',
        [currentStock.vaultSpaceId, currentStock.caliberId]
      );
      if (lastMovs && lastMovs.length > 0) {
        await pool.query(
          'UPDATE MOVIMENTACOES_MUNICOES SET OBSERVACAO_MOVIMENTACOES_MUNICOES = ?, CALIBRE_ID_MOVIMENTACOES_MUNICOES = ? WHERE ID_MOVIMENTACOES_MUNICOES = ?',
          [cleanInfo, newCaliberId, lastMovs[0].id]
        );
      }
    }

    await insertAuditLog(
      'Munições',
      'Editar',
      `Alterado estoque ID ${id}: Qtd ${newQty}, Fabricante: ${fabricante || 'N/A'}, Lote: ${loteMunicao || 'N/A'}, Tipo: ${tipoMunicao || 'N/A'}`,
      actor,
      req.ip
    );

    return res.json({ success: true, quantity: newQty, caliberId: newCaliberId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/ammo-movements', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    let rows: any;
    try {
      [rows] = await pool.query(`
        SELECT 
          ID_MOVIMENTACOES_MUNICOES as id, 
          TIPO_MOVIMENTACOES_MUNICOES as type, 
          CALIBRE_ID_MOVIMENTACOES_MUNICOES as caliberId, 
          QUANTIDADE_MOVIMENTACOES_MUNICOES as quantity, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES as departmentId, 
          UNIDADE_ID_MOVIMENTACOES_MUNICOES as unitId, 
          COFRE_ID_MOVIMENTACOES_MUNICOES as vaultSpaceId, 
          DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES as recipientOrReason,
          FABRICANTE_MUNICAO as fabricante,
          TIPO_MUNICAO as tipoMunicao,
          PESO_MUNICAO as pesoMunicao,
          LOTE_MUNICAO as loteMunicao,
          ANO_FABRICACAO_MUNICAO as anoFabricacao,
          DESTINACAO_MUNICAO as destinacao,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES as responsibleType, 
          RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES as responsibleUserId,
          RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES as responsibleName, 
          RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES as responsibleMasp,
          OBSERVACAO_MOVIMENTACOES_MUNICOES as observation, 
          QUANTIDADE_DEVOLVIDA_MOVIMENTACOES_MUNICOES as returnedQuantity, 
          DATA_DEVOLUCAO_MOVIMENTACOES_MUNICOES as returnedAt,
          COALESCE(NOME_USUARIO_RECEBIMENTO_MOVIMENTACOES_MUNICOES, DEVOLVIDO_POR_NOME_MOVIMENTACOES_MUNICOES) as returnedByUserName, 
          USUARIO_ID_MOVIMENTACOES_MUNICOES as userId, 
          NOME_USUARIO_MOVIMENTACOES_MUNICOES as userName, 
          DATA_CRIACAO_MOVIMENTACOES_MUNICOES as createdAt
        FROM MOVIMENTACOES_MUNICOES ORDER BY DATA_CRIACAO_MOVIMENTACOES_MUNICOES DESC
      `);
    } catch {
      [rows] = await pool.query(`
        SELECT 
          id, type, caliber_id as caliberId, quantity, department_id as departmentId, 
          unit_id as unitId, vault_space_id as vaultSpaceId, recipient_or_reason as recipientOrReason,
          responsible_type as responsibleType, responsible_user_id as responsibleUserId,
          responsible_name as responsibleName, responsible_masp as responsibleMasp,
          observation, returned_quantity as returnedQuantity, returned_at as returnedAt,
          returned_by_user_name as returnedByUserName, user_id as userId, user_name as userName, 
          created_at as createdAt
        FROM ammo_movements ORDER BY created_at DESC
      `);
    }
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/ammo-movements', async (req: Request, res: Response) => {
  try {
    const { 
      type, caliberId, quantity, vaultSpaceId, recipientOrReason,
      fabricante, tipoMunicao, pesoMunicao, loteMunicao, anoFabricacao, destinacao,
      responsibleType, responsibleUserId, responsibleName, responsibleMasp,
      observation, actor 
    } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const pool = getPool();
    const [vaults]: any = await pool.query('SELECT ID_COFRES as id, DEPARTAMENTO_ID_COFRES as department_id, UNIDADE_ID_COFRES as unit_id FROM COFRES WHERE ID_COFRES = ?', [vaultSpaceId]);
    if (!vaults || vaults.length === 0) return res.status(404).json({ error: 'Local do cofre não encontrado' });
    const vault = vaults[0];

    // Find stock matching vaultSpaceId, caliberId, loteMunicao and fabricante (if provided)
    let stockQuery = 'SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?';
    const stockParams: any[] = [vaultSpaceId, caliberId];

    if (loteMunicao) {
      stockQuery += ' AND (LOTE_MUNICAO = ? OR LOTE_MUNICAO IS NULL)';
      stockParams.push(loteMunicao);
    }

    const [stocks]: any = await pool.query(stockQuery, stockParams);

    let stockId = stocks && stocks.length > 0 ? stocks[0].id : null;
    let currentQty = stocks && stocks.length > 0 ? stocks[0].quantity : 0;

    const rawStockObs = req.body.observacaoEstoqueMunicao !== undefined 
      ? req.body.observacaoEstoqueMunicao 
      : (req.body.stockObservation !== undefined ? req.body.stockObservation : (req.body.additionalInfo || req.body.observation || ''));
    const stockObs = typeof rawStockObs === 'string' ? rawStockObs.trim() : (rawStockObs || '');

    if (type === 'Saída') {
      if (currentQty < quantity) {
        return res.status(400).json({ error: `Estoque insuficiente no cofre (${currentQty} disponíveis).` });
      }
      currentQty -= quantity;
      if (req.body.observacaoEstoqueMunicao !== undefined || req.body.stockObservation !== undefined) {
        await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ?, OBSERVACAO_ESTOQUE_MUNICAO = ?, DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?', [currentQty, stockObs, stockId]);
      } else {
        await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ?, DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?', [currentQty, stockId]);
      }
    } else {
      if (!stockId) {
        stockId = `stock-${Date.now()}`;
        currentQty = quantity;
        try {
          await pool.query(
            `INSERT INTO ESTOQUE_MUNICOES (
              ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES, 
              DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES,
              FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
              OBSERVACAO_ESTOQUE_MUNICAO,
              DATA_ATUALIZACAO_ESTOQUE_MUNICOES
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              stockId, caliberId, currentQty, vault.department_id, vault.unit_id, vaultSpaceId,
              fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null,
              anoFabricacao || null, destinacao || null, stockObs || ''
            ]
          );
        } catch {
          await pool.query(
            'INSERT INTO ESTOQUE_MUNICOES (ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES, DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES, TIPO_MUNICAO, LOTE_MUNICAO, OBSERVACAO_ESTOQUE_MUNICAO, DATA_ATUALIZACAO_ESTOQUE_MUNICOES) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [stockId, caliberId, currentQty, vault.department_id, vault.unit_id, vaultSpaceId, tipoMunicao || null, loteMunicao || null, stockObs || '']
          );
        }
      } else {
        currentQty += quantity;
        const updateObs = (req.body.observacaoEstoqueMunicao !== undefined || req.body.stockObservation !== undefined);
        try {
          await pool.query(
            `UPDATE ESTOQUE_MUNICOES SET 
              QUANTIDADE_ESTOQUE_MUNICOES = ?, 
              FABRICANTE_MUNICAO = COALESCE(?, FABRICANTE_MUNICAO),
              TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO), 
              PESO_MUNICAO = COALESCE(?, PESO_MUNICAO),
              LOTE_MUNICAO = COALESCE(?, LOTE_MUNICAO), 
              ANO_FABRICACAO_MUNICAO = COALESCE(?, ANO_FABRICACAO_MUNICAO),
              DESTINACAO_MUNICAO = COALESCE(?, DESTINACAO_MUNICAO),
              OBSERVACAO_ESTOQUE_MUNICAO = ${updateObs ? '?' : 'COALESCE(?, OBSERVACAO_ESTOQUE_MUNICAO)'},
              DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() 
             WHERE ID_ESTOQUE_MUNICOES = ?`,
            [currentQty, fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null, anoFabricacao || null, destinacao || null, stockObs || null, stockId]
          );
        } catch {
          await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ?, OBSERVACAO_ESTOQUE_MUNICAO = COALESCE(?, OBSERVACAO_ESTOQUE_MUNICAO), DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?', [currentQty, stockObs || null, stockId]);
        }
      }
    }

    const movId = `ammomov-${Date.now()}`;
    const cleanObs = (observation || '').slice(0, 500);

    try {
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId, type, caliberId, quantity, vault.department_id, vault.unit_id, vaultSpaceId, recipientOrReason,
          fabricante || null, tipoMunicao || null, pesoMunicao || null, loteMunicao || null, anoFabricacao || null, destinacao || null,
          responsibleType || 'SISTEMA', responsibleUserId || null, responsibleName || null, responsibleMasp || null,
          cleanObs, actor.id, actor.name
        ]
      );
    } catch {
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId, type, caliberId, quantity, vault.department_id, vault.unit_id, vaultSpaceId, recipientOrReason,
          responsibleType || 'SISTEMA', responsibleUserId || null, responsibleName || null, responsibleMasp || null,
          cleanObs, actor.id, actor.name
        ]
      );
    }

    await insertAuditLog(
      'Munições', 
      type === 'Entrada' ? 'Criar' : 'Excluir', 
      `${type} de ${quantity} munições [${fabricante || 'Fabricante N/A'} - Lote: ${loteMunicao || 'N/A'}] - Motivo/Destino: ${recipientOrReason}`, 
      actor, 
      req.ip
    );

    return res.json({
      id: movId,
      type,
      caliberId,
      quantity,
      vaultSpaceId,
      unitId: vault.unit_id,
      departmentId: vault.department_id,
      recipientOrReason,
      fabricante,
      tipoMunicao,
      pesoMunicao,
      loteMunicao,
      anoFabricacao,
      destinacao,
      responsibleType: responsibleType || 'SISTEMA',
      responsibleUserId: responsibleUserId || null,
      responsibleName: responsibleName || null,
      responsibleMasp: responsibleMasp || null,
      observation: cleanObs,
      returnedQuantity: 0,
      userId: actor.id,
      userName: actor.name,
      createdAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/ammo-movements/:id/return', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { returnQuantity, actor } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const numReturn = parseInt(returnQuantity, 10);
    if (isNaN(numReturn) || numReturn <= 0) {
      return res.status(400).json({ error: 'Informe uma quantidade válida para devolução.' });
    }

    const pool = getPool();
    const [movs]: any = await pool.query('SELECT ID_MOVIMENTACOES_MUNICOES as id, QUANTIDADE_MOVIMENTACOES_MUNICOES as quantity, QUANTIDADE_DEVOLVIDA_MOVIMENTACOES_MUNICOES as returned_quantity, COFRE_ID_MOVIMENTACOES_MUNICOES as vault_space_id, CALIBRE_ID_MOVIMENTACOES_MUNICOES as caliber_id, DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES as department_id, UNIDADE_ID_MOVIMENTACOES_MUNICOES as unit_id FROM MOVIMENTACOES_MUNICOES WHERE ID_MOVIMENTACOES_MUNICOES = ?', [id]);
    if (!movs || movs.length === 0) {
      return res.status(404).json({ error: 'Registro de saída de munição não encontrado.' });
    }

    const mov = movs[0];
    const prevReturned = mov.returned_quantity || 0;
    const maxReturnable = mov.quantity - prevReturned;

    if (numReturn > maxReturnable) {
      return res.status(400).json({ error: `Quantidade de devolução (${numReturn}) excede o saldo restante pendente (${maxReturnable}).` });
    }

    // Add back to ammo stock
    const [stocks]: any = await pool.query('SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?', [mov.vault_space_id, mov.caliber_id]);
    let currentQty = stocks && stocks.length > 0 ? stocks[0].quantity : 0;
    let stockId = stocks && stocks.length > 0 ? stocks[0].id : null;

    if (!stockId) {
      stockId = `stock-${Date.now()}`;
      await pool.query(
        'INSERT INTO ESTOQUE_MUNICOES (ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES, DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES, DATA_ATUALIZACAO_ESTOQUE_MUNICOES) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [stockId, mov.caliber_id, numReturn, mov.department_id, mov.unit_id, mov.vault_space_id]
      );
    } else {
      currentQty += numReturn;
      await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [currentQty, stockId]);
    }

    const newReturnedTotal = prevReturned + numReturn;
    await pool.query(
      `UPDATE MOVIMENTACOES_MUNICOES 
       SET QUANTIDADE_DEVOLVIDA_MOVIMENTACOES_MUNICOES = ?, DATA_DEVOLUCAO_MOVIMENTACOES_MUNICOES = NOW(), DEVOLVIDO_POR_NOME_MOVIMENTACOES_MUNICOES = ?
       WHERE ID_MOVIMENTACOES_MUNICOES = ?`,
      [newReturnedTotal, actor.name, id]
    );

    await insertAuditLog('Munições', 'Criar', `Devolução de ${numReturn} munições não utilizadas de saída ${id}`, actor, req.ip);

    return res.json({ success: true, newReturnedTotal });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/ammo-movements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    const pool = getPool();

    // Verify permissions: Geral, Armeiro or Administrador can delete
    const actorRole = actor?.activeRole || actor?.role || '';
    if (actor && actorRole && !['Geral', 'Armeiro', 'Administrador'].includes(actorRole) && !actor.canMoveAmmunition) {
      return res.status(403).json({ error: 'Permissão negada. Apenas Armeiros e usuários Gerais podem excluir lançamentos de munições.' });
    }

    // Retrieve movement to reconcile inventory stocks before deletion
    const [rows]: any = await pool.query(
      `SELECT 
        ID_MOVIMENTACOES_MUNICOES as id,
        TIPO_MOVIMENTACOES_MUNICOES as type,
        CALIBRE_ID_MOVIMENTACOES_MUNICOES as caliber_id,
        QUANTIDADE_MOVIMENTACOES_MUNICOES as quantity,
        QUANTIDADE_DEVOLVIDA_MOVIMENTACOES_MUNICOES as returned_quantity,
        DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES as department_id,
        UNIDADE_ID_MOVIMENTACOES_MUNICOES as unit_id,
        COFRE_ID_MOVIMENTACOES_MUNICOES as vault_space_id,
        DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES as recipient_or_reason
       FROM MOVIMENTACOES_MUNICOES WHERE ID_MOVIMENTACOES_MUNICOES = ?`,
      [id]
    );
    if (rows && rows.length > 0) {
      const mov = rows[0];

      // If Saída is being deleted: restore the net consumed ammunition back into the vault stock
      if (mov.type === 'Saída') {
        const netConsumed = Math.max(0, mov.quantity - (mov.returned_quantity || 0));
        if (netConsumed > 0 && mov.vault_space_id && mov.caliber_id) {
          const [stocks]: any = await pool.query(
            'SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?',
            [mov.vault_space_id, mov.caliber_id]
          );
          if (stocks && stocks.length > 0) {
            const newQty = stocks[0].quantity + netConsumed;
            await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [newQty, stocks[0].id]);
          } else {
            const stockId = `stock-${Date.now()}`;
            await pool.query(
              'INSERT INTO ESTOQUE_MUNICOES (ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES, DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES, DATA_ATUALIZACAO_ESTOQUE_MUNICOES) VALUES (?, ?, ?, ?, ?, ?, NOW())',
              [stockId, mov.caliber_id, netConsumed, mov.department_id, mov.unit_id, mov.vault_space_id]
            );
          }
        }
      }
      // If Entrada is being deleted: decrease the added stock from the vault
      else if (mov.type === 'Entrada') {
        if (mov.quantity > 0 && mov.vault_space_id && mov.caliber_id) {
          const [stocks]: any = await pool.query(
            'SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?',
            [mov.vault_space_id, mov.caliber_id]
          );
          if (stocks && stocks.length > 0) {
            const newQty = Math.max(0, stocks[0].quantity - mov.quantity);
            await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [newQty, stocks[0].id]);
          }
        }
      }

      await pool.query('DELETE FROM MOVIMENTACOES_MUNICOES WHERE ID_MOVIMENTACOES_MUNICOES = ?', [id]);
      await insertAuditLog('Munições', 'Excluir', `Excluído lançamento de movimentação de munição ${mov.type} (${mov.quantity} un) - ${mov.recipient_or_reason || ''}`, actor, req.ip);
    } else {
      await pool.query('DELETE FROM MOVIMENTACOES_MUNICOES WHERE ID_MOVIMENTACOES_MUNICOES = ?', [id]);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// WEAPONS
// -------------------------------------------------------------
apiRouter.get('/weapons', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    let rows: any = [];
    try {
      [rows] = await pool.query(`
        SELECT 
          ID_ARMAS as id, 
          TIPO_ARMAS as type, 
          NUMERO_SERIE_ARMAS as serialNumber, 
          FABRICANTE_ARMAS as manufacturer, 
          MODELO_ARMAS as model, 
          CALIBRE_ARMAS as caliber, 
          QUANTIDADE_CARREGADORES_ARMAS as magazineQuantity, 
          STATUS_ARMAS as status, 
          DEPARTAMENTO_ID_ARMAS as departmentId, 
          UNIDADE_ID_ARMAS as unitId, 
          COFRE_ID_ARMAS as vaultSpaceId, 
          OBSERVACAO_LOCALIZACAO_ARMAS as locationNote,
          DATA_ULTIMA_MANUTENCAO_ARMAS as lastMaintenanceDate, 
          RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS as lastMaintenanceResponsible, 
          COALESCE(TIROS_DISPARADOS_ARMAS, 0) as shotCount,
          LOCAL_ANTERIOR_COFRE_ID_ARMAS as previousVaultSpaceId,
          DATA_CRIACAO_ARMAS as createdAt
        FROM ARMAS 
        ORDER BY DATA_CRIACAO_ARMAS ASC
      `);
    } catch (_colErr) {
      await ensureCautelaReturnSchema(pool);
      [rows] = await pool.query(`
        SELECT 
          ID_ARMAS as id, 
          TIPO_ARMAS as type, 
          NUMERO_SERIE_ARMAS as serialNumber, 
          FABRICANTE_ARMAS as manufacturer, 
          MODELO_ARMAS as model, 
          CALIBRE_ARMAS as caliber, 
          QUANTIDADE_CARREGADORES_ARMAS as magazineQuantity, 
          STATUS_ARMAS as status, 
          DEPARTAMENTO_ID_ARMAS as departmentId, 
          UNIDADE_ID_ARMAS as unitId, 
          COFRE_ID_ARMAS as vaultSpaceId, 
          DATA_ULTIMA_MANUTENCAO_ARMAS as lastMaintenanceDate, 
          RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS as lastMaintenanceResponsible, 
          COALESCE(TIROS_DISPARADOS_ARMAS, 0) as shotCount,
          DATA_CRIACAO_ARMAS as createdAt
        FROM ARMAS 
        ORDER BY DATA_CRIACAO_ARMAS ASC
      `);
    }

    const mapped = (rows || []).map((w: any) => ({
      ...w,
      shotCount: Number(w.shotCount || 0),
      lastMaintenanceDate: w.lastMaintenanceDate ? new Date(w.lastMaintenanceDate).toISOString().split('T')[0] : null
    }));

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/weapons', async (req: Request, res: Response) => {
  try {
    const { type, serialNumber, manufacturer, model, caliber, magazineQuantity, departmentId, unitId, vaultSpaceId, lastMaintenanceDate, lastMaintenanceResponsible, actor } = req.body;
    const cleanSerial = (serialNumber || '').toUpperCase().trim();

    const pool = getPool();
    const [existing]: any = await pool.query(
      'SELECT ID_ARMAS as id FROM ARMAS WHERE UPPER(NUMERO_SERIE_ARMAS) = ?',
      [cleanSerial]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe uma arma cadastrada com o nº de série ${cleanSerial}` });
    }

    const id = `weap-${Date.now()}`;
    await pool.query(
      `INSERT INTO ARMAS (
        ID_ARMAS, TIPO_ARMAS, NUMERO_SERIE_ARMAS, FABRICANTE_ARMAS, MODELO_ARMAS, CALIBRE_ARMAS,
        QUANTIDADE_CARREGADORES_ARMAS, STATUS_ARMAS, DEPARTAMENTO_ID_ARMAS, UNIDADE_ID_ARMAS,
        COFRE_ID_ARMAS, DATA_ULTIMA_MANUTENCAO_ARMAS, RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS, TIROS_DISPARADOS_ARMAS, DATA_CRIACAO_ARMAS
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'No Cofre', ?, ?, ?, ?, ?, 0, NOW())`,
      [
        id, type, cleanSerial, manufacturer, model, caliber, magazineQuantity || 1,
        departmentId || null, unitId || null, vaultSpaceId || null,
        lastMaintenanceDate || null, lastMaintenanceResponsible || null
      ]
    );

    await insertAuditLog('Armas', 'Criar', `Cadastrada arma ${type} modelo ${model} (Série: ${cleanSerial})`, actor, req.ip);

    return res.json({
      id,
      type,
      serialNumber: cleanSerial,
      manufacturer,
      model,
      caliber,
      magazineQuantity: magazineQuantity || 1,
      status: 'No Cofre',
      departmentId,
      unitId,
      vaultSpaceId,
      shotCount: 0,
      lastMaintenanceDate,
      lastMaintenanceResponsible,
      createdAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/weapons/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const actor = req.body.actor;

    const pool = getPool();
    await pool.query(
      `UPDATE ARMAS SET
        TIPO_ARMAS = COALESCE(?, TIPO_ARMAS),
        FABRICANTE_ARMAS = COALESCE(?, FABRICANTE_ARMAS),
        MODELO_ARMAS = COALESCE(?, MODELO_ARMAS),
        CALIBRE_ARMAS = COALESCE(?, CALIBRE_ARMAS),
        QUANTIDADE_CARREGADORES_ARMAS = COALESCE(?, QUANTIDADE_CARREGADORES_ARMAS),
        STATUS_ARMAS = COALESCE(?, STATUS_ARMAS),
        DEPARTAMENTO_ID_ARMAS = COALESCE(?, DEPARTAMENTO_ID_ARMAS),
        UNIDADE_ID_ARMAS = COALESCE(?, UNIDADE_ID_ARMAS),
        COFRE_ID_ARMAS = COALESCE(?, COFRE_ID_ARMAS),
        DATA_ULTIMA_MANUTENCAO_ARMAS = COALESCE(?, DATA_ULTIMA_MANUTENCAO_ARMAS),
        RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS = COALESCE(?, RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS),
        TIROS_DISPARADOS_ARMAS = COALESCE(?, TIROS_DISPARADOS_ARMAS),
        LOCAL_ANTERIOR_COFRE_ID_ARMAS = COALESCE(?, LOCAL_ANTERIOR_COFRE_ID_ARMAS)
       WHERE ID_ARMAS = ?`,
      [
        updates.type ?? null,
        updates.manufacturer ?? null,
        updates.model ?? null,
        updates.caliber ?? null,
        updates.magazineQuantity ?? null,
        updates.status ?? null,
        updates.departmentId ?? null,
        updates.unitId ?? null,
        updates.vaultSpaceId ?? null,
        updates.lastMaintenanceDate ?? null,
        updates.lastMaintenanceResponsible ?? null,
        updates.shotCount !== undefined ? updates.shotCount : null,
        updates.previousVaultSpaceId ?? null,
        id
      ]
    );

    await insertAuditLog('Armas', 'Editar', `Atualizados dados da arma ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/weapons/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [weaps]: any = await pool.query('SELECT ID_ARMAS as id, TIPO_ARMAS as type, MODELO_ARMAS as model, NUMERO_SERIE_ARMAS as serial_number FROM ARMAS WHERE ID_ARMAS = ?', [id]);
    if (!weaps || weaps.length === 0) {
      return res.status(404).json({ error: 'Arma não encontrada' });
    }

    const serial = weaps[0].serial_number || weaps[0].numero_serie || '';
    const model = weaps[0].model || weaps[0].modelo || '';

    await pool.query('DELETE FROM MOVIMENTACOES_ARMAS WHERE ARMA_ID_MOVIMENTACOES_ARMAS = ?', [id]);
    await pool.query('DELETE FROM ARMAS WHERE ID_ARMAS = ?', [id]);
    try {
      
    } catch (_) {}

    await insertAuditLog('Armas', 'Excluir', `Excluída arma ${model} (Série: ${serial})`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// WEAPON SHOTS / DISPAROS
// -------------------------------------------------------------
apiRouter.post('/weapons/:id/add-shots', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { shotCount, reason, officerName, officerMasp, actor } = req.body;
    const count = parseInt(shotCount, 10);
    if (isNaN(count) || count <= 0) {
      return res.status(400).json({ error: 'Informe uma quantidade válida de tiros (maior que zero).' });
    }

    const pool = getPool();
    const [weaps]: any = await pool.query('SELECT ID_ARMAS, NUMERO_SERIE_ARMAS, TIROS_DISPARADOS_ARMAS FROM ARMAS WHERE ID_ARMAS = ?', [id]);
    if (!weaps || weaps.length === 0) {
      return res.status(404).json({ error: 'Arma não encontrada.' });
    }

    const weapon = weaps[0];
    const currentTotal = Number(weapon.TIROS_DISPARADOS_ARMAS) || 0;
    const newTotal = currentTotal + count;

    await pool.query('UPDATE ARMAS SET TIROS_DISPARADOS_ARMAS = ? WHERE ID_ARMAS = ?', [newTotal, id]);

    const regId = `shot-${Date.now()}`;
    await pool.query(
      `INSERT INTO REGISTROS_TIROS_ARMAS (
        ID_REGISTROS_TIROS, ARMA_ID, NUMERO_SERIE, QUANTIDADE_TIROS, MOTIVO, POLICIAL_NOME, POLICIAL_MASP, TOTAL_TIROS_APOS, DATA_REGISTRO
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        regId,
        id,
        weapon.NUMERO_SERIE_ARMAS,
        count,
        reason || 'Treinamento / Instrução',
        officerName || actor?.name || 'Policial',
        officerMasp || actor?.masp || '',
        newTotal
      ]
    );

    await insertAuditLog(
      'Armas',
      'Editar',
      `Registrados ${count} tiros para a arma ${weapon.NUMERO_SERIE_ARMAS} por ${officerName || actor?.name}. Total acumulado: ${newTotal}`,
      actor,
      req.ip
    );

    return res.json({ success: true, newTotal, shotCount: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/weapons/:id/shots', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    const [rows]: any = await pool.query(
      `SELECT 
        ID_REGISTROS_TIROS as id,
        ARMA_ID as weaponId,
        NUMERO_SERIE as serialNumber,
        QUANTIDADE_TIROS as shotCount,
        MOTIVO as reason,
        POLICIAL_NOME as officerName,
        POLICIAL_MASP as officerMasp,
        TOTAL_TIROS_APOS as totalShotsAfter,
        DATA_REGISTRO as createdAt
       FROM REGISTROS_TIROS_ARMAS
       WHERE ARMA_ID = ?
       ORDER BY DATA_REGISTRO DESC`,
      [id]
    );
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// WEAPON MAINTENANCE (MANUTENÇÃO INTERNA / EXTERNA)
// -------------------------------------------------------------
apiRouter.get('/maintenances', async (req: Request, res: Response) => {
  try {
    const { weaponId } = req.query;
    const pool = getPool();

    let sql = `
      SELECT 
        m.ID_MANUTENCOES_ARMAS as id,
        m.ARMA_ID_MANUTENCOES_ARMAS as weaponId,
        m.NUMERO_SERIE_ARMAS as serialNumber,
        w.MODELO_ARMAS as weaponModel,
        w.TIPO_ARMAS as weaponType,
        w.CALIBRE_ARMAS as caliber,
        m.TIPO_MANUTENCAO as type,
        m.DATA_ENVIO as sentDate,
        m.ARMEIRO_ENVIO_ID as sentArmorerId,
        m.ARMEIRO_ENVIO_NOME as sentArmorerName,
        m.DESCRICAO_ENVIO as sentDescription,
        m.TIROS_NO_MOMENTO as shotCountAtMaintenance,
        m.STATUS_MANUTENCAO as status,
        m.ARMERIA_NOME as workshopName,
        m.ARMERIA_CEP as workshopCep,
        m.ARMERIA_LOGRADOURO as workshopStreet,
        m.ARMERIA_NUMERO as workshopNumber,
        m.ARMERIA_COMPLEMENTO as workshopComplement,
        m.ARMERIA_BAIRRO as workshopNeighborhood,
        m.ARMERIA_CIDADE as workshopCity,
        m.ARMERIA_ESTADO as workshopState,
        m.ARMERIA_ARMEIRO_RESPONSAVEL as workshopArmorerName,
        m.ARMERIA_CREDENCIAMENTO_PF as workshopCredenciamentoPf,
        m.DATA_RETORNO as returnDate,
        m.ARMEIRO_RETORNO_ID as returnArmorerId,
        m.ARMEIRO_RETORNO_NOME as returnArmorerName,
        m.DESCRICAO_RETORNO as returnServiceDescription,
        m.COFRE_ORIGINAL_ID as originalVaultSpaceId,
        m.DATA_CRIACAO as createdAt
      FROM MANUTENCOES_ARMAS m
      LEFT JOIN ARMAS w ON w.ID_ARMAS = m.ARMA_ID_MANUTENCOES_ARMAS
    `;

    const params: any[] = [];
    if (weaponId) {
      sql += ' WHERE m.ARMA_ID_MANUTENCOES_ARMAS = ?';
      params.push(weaponId);
    }
    sql += ' ORDER BY m.DATA_ENVIO DESC, m.DATA_CRIACAO DESC';

    const [rows]: any = await pool.query(sql, params);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/weapons/:id/maintenance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      type, // 'Interna' | 'Externa'
      sentDate,
      sentArmorerName,
      sentDescription,
      workshopName,
      workshopCep,
      workshopStreet,
      workshopNumber,
      workshopComplement,
      workshopNeighborhood,
      workshopCity,
      workshopState,
      workshopArmorerName,
      workshopCredenciamentoPf,
      saveWorkshop,
      actor
    } = req.body;

    if (!type || !['Interna', 'Externa'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de manutenção inválido. Selecione "Interna" ou "Externa".' });
    }
    if (!sentDate) {
      return res.status(400).json({ error: 'Informe a data da manutenção.' });
    }
    if (!sentArmorerName || !sentArmorerName.trim()) {
      return res.status(400).json({ error: 'Informe o armeiro responsável.' });
    }
    if (type === 'Interna' && (!sentDescription || !sentDescription.trim())) {
      return res.status(400).json({ error: 'Informe a descrição da manutenção interna.' });
    }

    if (type === 'Externa') {
      if (!workshopName || !workshopName.trim()) {
        return res.status(400).json({ error: 'Para manutenção externa, informe o nome da armeria.' });
      }
    }

    const pool = getPool();
    const [weaps]: any = await pool.query(
      'SELECT ID_ARMAS, NUMERO_SERIE_ARMAS, MODELO_ARMAS, TIPO_ARMAS, CALIBRE_ARMAS, STATUS_ARMAS, COFRE_ID_ARMAS, TIROS_DISPARADOS_ARMAS FROM ARMAS WHERE ID_ARMAS = ?',
      [id]
    );

    if (!weaps || weaps.length === 0) {
      return res.status(404).json({ error: 'Arma não encontrada.' });
    }

    const weapon = weaps[0];
    const currentVaultId = weapon.COFRE_ID_ARMAS || '';
    const shotCountAtMaintenance = Number(weapon.TIROS_DISPARADOS_ARMAS) || 0;
    const maintId = `maint-${Date.now()}`;

    // Insert maintenance record
    await pool.query(
      `INSERT INTO MANUTENCOES_ARMAS (
        ID_MANUTENCOES_ARMAS,
        ARMA_ID_MANUTENCOES_ARMAS,
        NUMERO_SERIE_ARMAS,
        TIPO_MANUTENCAO,
        DATA_ENVIO,
        ARMEIRO_ENVIO_ID,
        ARMEIRO_ENVIO_NOME,
        DESCRICAO_ENVIO,
        TIROS_NO_MOMENTO,
        STATUS_MANUTENCAO,
        ARMERIA_NOME,
        ARMERIA_CEP,
        ARMERIA_LOGRADOURO,
        ARMERIA_NUMERO,
        ARMERIA_COMPLEMENTO,
        ARMERIA_BAIRRO,
        ARMERIA_CIDADE,
        ARMERIA_ESTADO,
        ARMERIA_ARMEIRO_RESPONSAVEL,
        ARMERIA_CREDENCIAMENTO_PF,
        COFRE_ORIGINAL_ID,
        DATA_CRIACAO
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EM_ANDAMENTO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        maintId,
        id,
        weapon.NUMERO_SERIE_ARMAS,
        type,
        sentDate,
        actor?.id || null,
        sentArmorerName.trim(),
        type === 'Interna' ? sentDescription.trim() : ((sentDescription || '').trim() || 'Enviada para manutenção externa'),
        shotCountAtMaintenance,
        type === 'Externa' ? (workshopName || '').trim() : null,
        type === 'Externa' ? (workshopCep || '').trim() : null,
        type === 'Externa' ? (workshopStreet || '').trim() : null,
        type === 'Externa' ? (workshopNumber || '').trim() : null,
        type === 'Externa' ? (workshopComplement || '').trim() : null,
        type === 'Externa' ? (workshopNeighborhood || '').trim() : null,
        type === 'Externa' ? (workshopCity || '').trim() : null,
        type === 'Externa' ? (workshopState || '').trim() : null,
        type === 'Externa' ? (workshopArmorerName || '').trim() || null : null,
        type === 'Externa' ? (workshopCredenciamentoPf || '').trim() || null : null,
        currentVaultId
      ]
    );

    // Update weapon status to 'Manutenção', save current vault to LOCAL_ANTERIOR_COFRE_ID_ARMAS
    await pool.query(
      `UPDATE ARMAS SET 
        STATUS_ARMAS = 'Manutenção',
        LOCAL_ANTERIOR_COFRE_ID_ARMAS = COALESCE(?, LOCAL_ANTERIOR_COFRE_ID_ARMAS),
        DATA_ULTIMA_MANUTENCAO_ARMAS = ?,
        RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS = ?
       WHERE ID_ARMAS = ?`,
      [currentVaultId, sentDate, sentArmorerName.trim(), id]
    );

    // Save workshop in ARMERIAS_EXTERNAS if requested or if not exists
    if (type === 'Externa' && workshopName && workshopName.trim()) {
      try {
        const cleanWName = workshopName.trim();
        const [existingShop]: any = await pool.query('SELECT ID_ARMERIAS_EXTERNAS FROM ARMERIAS_EXTERNAS WHERE LOWER(NOME) = LOWER(?)', [cleanWName]);
        if (!existingShop || existingShop.length === 0) {
          const shopId = `shop-${Date.now()}`;
          await pool.query(
            `INSERT INTO ARMERIAS_EXTERNAS (
              ID_ARMERIAS_EXTERNAS, NOME, CEP, LOGRADOURO, NUMERO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO, RESPONSAVEL, ARMEIRO_RESPONSAVEL, CREDENCIAMENTO_PF, DATA_CRIACAO
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              shopId,
              cleanWName,
              workshopCep || null,
              workshopStreet || null,
              workshopNumber || null,
              workshopComplement || null,
              workshopNeighborhood || null,
              workshopCity || null,
              workshopState || null,
              sentArmorerName || null,
              workshopArmorerName || null,
              workshopCredenciamentoPf || null
            ]
          );
        } else if (saveWorkshop) {
          await pool.query(
            `UPDATE ARMERIAS_EXTERNAS SET
              CEP = COALESCE(?, CEP),
              LOGRADOURO = COALESCE(?, LOGRADOURO),
              NUMERO = COALESCE(?, NUMERO),
              COMPLEMENTO = COALESCE(?, COMPLEMENTO),
              BAIRRO = COALESCE(?, BAIRRO),
              CIDADE = COALESCE(?, CIDADE),
              ESTADO = COALESCE(?, ESTADO),
              ARMEIRO_RESPONSAVEL = COALESCE(?, ARMEIRO_RESPONSAVEL),
              CREDENCIAMENTO_PF = COALESCE(?, CREDENCIAMENTO_PF)
             WHERE ID_ARMERIAS_EXTERNAS = ?`,
            [
              workshopCep || null,
              workshopStreet || null,
              workshopNumber || null,
              workshopComplement || null,
              workshopNeighborhood || null,
              workshopCity || null,
              workshopState || null,
              workshopArmorerName || null,
              workshopCredenciamentoPf || null,
              existingShop[0].ID_ARMERIAS_EXTERNAS
            ]
          );
        }
      } catch (shopErr) {
        console.warn('Erro ao salvar armeria externa:', shopErr);
      }
    }

    await insertAuditLog(
      'Manutenção',
      'Criar',
      `Arma ${weapon.NUMERO_SERIE_ARMAS} (${weapon.MODELO_ARMAS}) enviada para manutenção ${type}. Armeiro: ${sentArmorerName}`,
      actor,
      req.ip
    );

    return res.json({ success: true, id: maintId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/maintenances/:id/receive', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { returnDate, returnArmorerName, returnServiceDescription, actor } = req.body;

    if (!returnServiceDescription || !returnServiceDescription.trim()) {
      return res.status(400).json({ error: 'Informe o tipo de serviço que foi realizado na arma.' });
    }

    const pool = getPool();
    const [maints]: any = await pool.query('SELECT * FROM MANUTENCOES_ARMAS WHERE ID_MANUTENCOES_ARMAS = ?', [id]);
    if (!maints || maints.length === 0) {
      return res.status(404).json({ error: 'Registro de manutenção não encontrado.' });
    }

    const maint = maints[0];
    const weaponId = maint.ARMA_ID_MANUTENCOES_ARMAS;
    const returnDateVal = returnDate || new Date().toISOString().split('T')[0];
    const armorerVal = returnArmorerName || actor?.name || 'Armeiro';

    // Update maintenance to CONCLUIDA
    await pool.query(
      `UPDATE MANUTENCOES_ARMAS SET
        STATUS_MANUTENCAO = 'CONCLUIDA',
        DATA_RETORNO = ?,
        ARMEIRO_RETORNO_ID = ?,
        ARMEIRO_RETORNO_NOME = ?,
        DESCRICAO_RETORNO = ?
       WHERE ID_MANUTENCOES_ARMAS = ?`,
      [returnDateVal, actor?.id || null, armorerVal, returnServiceDescription.trim(), id]
    );

    // Restore weapon status to 'No Cofre' and restore vault space from COFRE_ORIGINAL_ID
    const targetVaultId = maint.COFRE_ORIGINAL_ID || null;
    await pool.query(
      `UPDATE ARMAS SET
        STATUS_ARMAS = 'No Cofre',
        COFRE_ID_ARMAS = COALESCE(?, COFRE_ID_ARMAS),
        LOCAL_ANTERIOR_COFRE_ID_ARMAS = NULL,
        DATA_ULTIMA_MANUTENCAO_ARMAS = ?,
        RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS = ?
       WHERE ID_ARMAS = ?`,
      [targetVaultId, returnDateVal, armorerVal, weaponId]
    );

    await insertAuditLog(
      'Manutenção',
      'Concluir',
      `Arma ${maint.NUMERO_SERIE_ARMAS} recebida da manutenção. Retornada ao cofre de origem. Serviço: ${returnServiceDescription.trim()}`,
      actor,
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// EXTERNAL WORKSHOPS (ARMERIAS EXTERNAS)
// -------------------------------------------------------------
apiRouter.get('/external-workshops', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_ARMERIAS_EXTERNAS as id,
        NOME as name,
        CEP as cep,
        LOGRADOURO as street,
        NUMERO as number,
        COMPLEMENTO as complement,
        BAIRRO as neighborhood,
        CIDADE as city,
        ESTADO as state,
        TELEFONE as phone,
        CONTATO as contact,
        ARMEIRO_RESPONSAVEL as responsibleArmorer,
        CREDENCIAMENTO_PF as credenciamentoPf,
        DATA_CRIACAO as createdAt
      FROM ARMERIAS_EXTERNAS
      ORDER BY NOME ASC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/external-workshops', async (req: Request, res: Response) => {
  try {
    const { id, name, cep, street, number, complement, neighborhood, city, state, phone, contact, responsibleArmorer, credenciamentoPf, actor } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da armeria é obrigatório.' });
    }

    const pool = getPool();
    const workshopId = id || `shop-${Date.now()}`;
    const [existing]: any = await pool.query('SELECT ID_ARMERIAS_EXTERNAS FROM ARMERIAS_EXTERNAS WHERE ID_ARMERIAS_EXTERNAS = ? OR LOWER(NOME) = LOWER(?)', [workshopId, name.trim()]);

    if (existing && existing.length > 0) {
      await pool.query(
        `UPDATE ARMERIAS_EXTERNAS SET
          NOME = ?, CEP = ?, LOGRADOURO = ?, NUMERO = ?, COMPLEMENTO = ?, BAIRRO = ?, CIDADE = ?, ESTADO = ?, TELEFONE = ?, CONTATO = ?, ARMEIRO_RESPONSAVEL = ?, CREDENCIAMENTO_PF = ?
         WHERE ID_ARMERIAS_EXTERNAS = ?`,
        [name.trim(), cep || null, street || null, number || null, complement || null, neighborhood || null, city || null, state || null, phone || null, contact || null, responsibleArmorer || null, credenciamentoPf || null, existing[0].ID_ARMERIAS_EXTERNAS]
      );
    } else {
      await pool.query(
        `INSERT INTO ARMERIAS_EXTERNAS (
          ID_ARMERIAS_EXTERNAS, NOME, CEP, LOGRADOURO, NUMERO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO, TELEFONE, CONTATO, ARMEIRO_RESPONSAVEL, CREDENCIAMENTO_PF, DATA_CRIACAO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [workshopId, name.trim(), cep || null, street || null, number || null, complement || null, neighborhood || null, city || null, state || null, phone || null, contact || null, responsibleArmorer || null, credenciamentoPf || null]
      );
    }

    await insertAuditLog('Armerias', 'Editar', `Cadastrada/atualizada armeria externa: ${name} (Armeiro: ${responsibleArmorer || 'N/A'}, Cred. PF: ${credenciamentoPf || 'N/A'})`, actor, req.ip);
    return res.json({ id: workshopId, name: name.trim() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/external-workshops/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    if (actor && actor.role !== 'Geral') {
      return res.status(403).json({ error: 'Permissão negada. Apenas usuários Gerais podem excluir armerias.' });
    }

    const pool = getPool();
    const [shops]: any = await pool.query('SELECT NOME FROM ARMERIAS_EXTERNAS WHERE ID_ARMERIAS_EXTERNAS = ?', [id]);
    const shopName = shops && shops.length > 0 ? shops[0].NOME : id;

    await pool.query('DELETE FROM ARMERIAS_EXTERNAS WHERE ID_ARMERIAS_EXTERNAS = ?', [id]);
    await insertAuditLog('Armerias', 'Excluir', `Excluída armeria externa: ${shopName}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// WEAPON MOVEMENTS (CAUTELAS, SOLICITAÇÕES, DEVOLUÇÕES)
// -------------------------------------------------------------
apiRouter.get('/movements', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_MOVIMENTACOES_ARMAS as id,
        ARMA_ID_MOVIMENTACOES_ARMAS as weaponId,
        NUMERO_SERIE_ARMA_MOVIMENTACOES_ARMAS as weaponSerialNumber,
        MODELO_ARMA_MOVIMENTACOES_ARMAS as weaponModel,
        TIPO_ARMA_MOVIMENTACOES_ARMAS as weaponType,
        CALIBRE_MOVIMENTACOES_ARMAS as caliber,
        DEPARTAMENTO_ID_MOVIMENTACOES_ARMAS as departmentId,
        UNIDADE_ID_MOVIMENTACOES_ARMAS as unitId,
        REQUERENTE_ID_MOVIMENTACOES_ARMAS as requesterId,
        NOME_REQUERENTE_MOVIMENTACOES_ARMAS as requesterName,
        MASP_REQUERENTE_MOVIMENTACOES_ARMAS as requesterMasp,
        COFRE_RETIRADA_ID_MOVIMENTACOES_ARMAS as withdrawalVaultSpaceId,
        COFRE_DEVOLUCAO_ID_MOVIMENTACOES_ARMAS as returnVaultSpaceId,
        QUANTIDADE_MUNICAO_MOVIMENTACOES_ARMAS as ammunitionCount,
        QUANTIDADE_CARREGADORES_MOVIMENTACOES_ARMAS as magazineCount,
        QUANTIDADE_MUNICAO_DEVOLUCAO_MOVIMENTACOES_ARMAS as returningAmmunitionCount,
        QUANTIDADE_CARREGADORES_DEVOLUCAO_MOVIMENTACOES_ARMAS as returningMagazineCount,
        STATUS_MOVIMENTACOES_ARMAS as status,
        APROVADO_POR_USUARIO_ID_MOVIMENTACOES_ARMAS as approvedByUserId,
        APROVADO_POR_NOME_MOVIMENTACOES_ARMAS as approvedByUserName,
        DATA_APROVACAO_MOVIMENTACOES_ARMAS as approvalDate,
        RECIBO_CONFIRMADO_POR_USUARIO_ID_MOVIMENTACOES_ARMAS as receiptConfirmedByUserId,
        RECIBO_CONFIRMADO_POR_NOME_MOVIMENTACOES_ARMAS as receiptConfirmedByUserName,
        DATA_RECIBO_MOVIMENTACOES_ARMAS as receiptDate,
        POSSUI_DIVERGENCIA_MOVIMENTACOES_ARMAS as hasDivergence,
        JUSTIFICATIVA_DIVERGENCIA_MOVIMENTACOES_ARMAS as divergenceJustification,
        DATA_CRIACAO_MOVIMENTACOES_ARMAS as createdAt,
        DATA_ATUALIZACAO_MOVIMENTACOES_ARMAS as updatedAt
      FROM MOVIMENTACOES_ARMAS ORDER BY DATA_CRIACAO_MOVIMENTACOES_ARMAS DESC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/movements/request-withdrawal', async (req: Request, res: Response) => {
  try {
    const { weaponId, ammunitionCount, magazineCount, actor } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const pool = getPool();
    const [weaps]: any = await pool.query('SELECT ID_ARMAS as id, NUMERO_SERIE_ARMAS as serial_number, MODELO_ARMAS as model, TIPO_ARMAS as type, CALIBRE_ARMAS as caliber, DEPARTAMENTO_ID_ARMAS as department_id, UNIDADE_ID_ARMAS as unit_id, COFRE_ID_ARMAS as vault_space_id, STATUS_ARMAS as status FROM ARMAS WHERE ID_ARMAS = ?', [weaponId]);
    if (!weaps || weaps.length === 0) return res.status(404).json({ error: 'Arma não encontrada' });
    const weapon = weaps[0];

    if (weapon.status !== 'No Cofre') {
      return res.status(400).json({ error: `Esta arma não está disponível no cofre (Status atual: ${weapon.status}).` });
    }

    const movId = `mov-${Date.now()}`;
    await pool.query(
      `INSERT INTO MOVIMENTACOES_ARMAS (
        ID_MOVIMENTACOES_ARMAS, ARMA_ID_MOVIMENTACOES_ARMAS, NUMERO_SERIE_ARMA_MOVIMENTACOES_ARMAS, MODELO_ARMA_MOVIMENTACOES_ARMAS,
        TIPO_ARMA_MOVIMENTACOES_ARMAS, CALIBRE_MOVIMENTACOES_ARMAS, DEPARTAMENTO_ID_MOVIMENTACOES_ARMAS, UNIDADE_ID_MOVIMENTACOES_ARMAS,
        REQUERENTE_ID_MOVIMENTACOES_ARMAS, NOME_REQUERENTE_MOVIMENTACOES_ARMAS, MASP_REQUERENTE_MOVIMENTACOES_ARMAS,
        COFRE_RETIRADA_ID_MOVIMENTACOES_ARMAS, QUANTIDADE_MUNICAO_MOVIMENTACOES_ARMAS, QUANTIDADE_CARREGADORES_MOVIMENTACOES_ARMAS,
        STATUS_MOVIMENTACOES_ARMAS, DATA_CRIACAO_MOVIMENTACOES_ARMAS, DATA_ATUALIZACAO_MOVIMENTACOES_ARMAS
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente Aprovação', NOW(), NOW())`,
      [
        movId,
        weapon.id,
        weapon.serial_number || weapon.numero_serie || '',
        weapon.model || weapon.modelo || '',
        weapon.type || weapon.tipo || '',
        weapon.caliber || weapon.calibre || '',
        weapon.department_id || weapon.departamento_id || null,
        weapon.unit_id || weapon.unidade_id || null,
        actor.id,
        actor.name,
        actor.masp,
        weapon.vault_space_id || weapon.cofre_id || null,
        ammunitionCount || 0,
        magazineCount || 0
      ]
    );

    await insertAuditLog('Movimentações', 'Solicitar', `Solicitada retirada da arma ${weapon.model || weapon.modelo} (${weapon.serial_number || weapon.numero_serie}) por ${actor.name}`, actor, req.ip);

    return res.json({ success: true, movementId: movId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/movements/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const pool = getPool();
    const [movs]: any = await pool.query('SELECT ID_MOVIMENTACOES_ARMAS as id, ARMA_ID_MOVIMENTACOES_ARMAS as weapon_id, NUMERO_SERIE_ARMA_MOVIMENTACOES_ARMAS as weapon_serial_number, MODELO_ARMA_MOVIMENTACOES_ARMAS as weapon_model, REQUERENTE_ID_MOVIMENTACOES_ARMAS as requester_id, NOME_REQUERENTE_MOVIMENTACOES_ARMAS as requester_name, MASP_REQUERENTE_MOVIMENTACOES_ARMAS as requester_masp, STATUS_MOVIMENTACOES_ARMAS as status, QUANTIDADE_MUNICAO_MOVIMENTACOES_ARMAS as ammunition_quantity, QUANTIDADE_CARREGADORES_MOVIMENTACOES_ARMAS as magazine_quantity FROM MOVIMENTACOES_ARMAS WHERE ID_MOVIMENTACOES_ARMAS = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação não encontrada' });
    const movement = movs[0];

    await pool.query(
      `UPDATE MOVIMENTACOES_ARMAS SET
        STATUS_MOVIMENTACOES_ARMAS = 'Em Trânsito',
        APROVADO_POR_USUARIO_ID_MOVIMENTACOES_ARMAS = ?,
        APROVADO_POR_NOME_MOVIMENTACOES_ARMAS = ?,
        DATA_APROVACAO_MOVIMENTACOES_ARMAS = NOW(),
        DATA_ATUALIZACAO_MOVIMENTACOES_ARMAS = NOW()
       WHERE ID_MOVIMENTACOES_ARMAS = ?`,
      [actor.id, actor.name, id]
    );

    await pool.query("UPDATE ARMAS SET STATUS_ARMAS = 'Em Trânsito' WHERE ID_ARMAS = ?", [movement.weapon_id]);

    await insertAuditLog('Movimentações', 'Aprovar', `Aprovada retirada da arma (${movement.weapon_serial_number}) para o policial ${movement.requester_name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/movements/:id/request-return', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { returnVaultSpaceId, returningAmmunitionCount, returningMagazineCount, divergenceJustification, actor } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const pool = getPool();
    const [movs]: any = await pool.query('SELECT ID_MOVIMENTACOES_ARMAS as id, ARMA_ID_MOVIMENTACOES_ARMAS as weapon_id, NUMERO_SERIE_ARMA_MOVIMENTACOES_ARMAS as weapon_serial_number, MODELO_ARMA_MOVIMENTACOES_ARMAS as weapon_model, REQUERENTE_ID_MOVIMENTACOES_ARMAS as requester_id, NOME_REQUERENTE_MOVIMENTACOES_ARMAS as requester_name, MASP_REQUERENTE_MOVIMENTACOES_ARMAS as requester_masp, STATUS_MOVIMENTACOES_ARMAS as status, QUANTIDADE_MUNICAO_MOVIMENTACOES_ARMAS as ammunition_quantity, QUANTIDADE_CARREGADORES_MOVIMENTACOES_ARMAS as magazine_quantity FROM MOVIMENTACOES_ARMAS WHERE ID_MOVIMENTACOES_ARMAS = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação não encontrada' });
    const movement = movs[0];

    await pool.query(
      `UPDATE MOVIMENTACOES_ARMAS SET
        STATUS_MOVIMENTACOES_ARMAS = 'Pendente Recibo',
        COFRE_DEVOLUCAO_ID_MOVIMENTACOES_ARMAS = ?,
        QUANTIDADE_MUNICAO_DEVOLUCAO_MOVIMENTACOES_ARMAS = ?,
        QUANTIDADE_CARREGADORES_DEVOLUCAO_MOVIMENTACOES_ARMAS = ?,
        JUSTIFICATIVA_DIVERGENCIA_MOVIMENTACOES_ARMAS = ?,
        DATA_ATUALIZACAO_MOVIMENTACOES_ARMAS = NOW()
       WHERE ID_MOVIMENTACOES_ARMAS = ?`,
      [returnVaultSpaceId, returningAmmunitionCount || 0, returningMagazineCount || 0, divergenceJustification || '', id]
    );

    await pool.query("UPDATE ARMAS SET STATUS_ARMAS = 'Pendente de Recibo' WHERE ID_ARMAS = ?", [movement.weapon_id]);

    await insertAuditLog('Movimentações', 'Devolver', `Solicitada devolução da arma (${movement.weapon_serial_number}) por ${actor.name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/movements/:id/confirm-receipt', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const pool = getPool();
    const [movs]: any = await pool.query('SELECT ID_MOVIMENTACOES_ARMAS as id, ARMA_ID_MOVIMENTACOES_ARMAS as weapon_id, NUMERO_SERIE_ARMA_MOVIMENTACOES_ARMAS as weapon_serial_number, MODELO_ARMA_MOVIMENTACOES_ARMAS as weapon_model, REQUERENTE_ID_MOVIMENTACOES_ARMAS as requester_id, NOME_REQUERENTE_MOVIMENTACOES_ARMAS as requester_name, MASP_REQUERENTE_MOVIMENTACOES_ARMAS as requester_masp, STATUS_MOVIMENTACOES_ARMAS as status, QUANTIDADE_MUNICAO_MOVIMENTACOES_ARMAS as ammunition_quantity, QUANTIDADE_CARREGADORES_MOVIMENTACOES_ARMAS as magazine_quantity FROM MOVIMENTACOES_ARMAS WHERE ID_MOVIMENTACOES_ARMAS = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação não encontrada' });
    const movement = movs[0];

    await pool.query(
      `UPDATE MOVIMENTACOES_ARMAS SET
        STATUS_MOVIMENTACOES_ARMAS = 'Concluído',
        RECIBO_CONFIRMADO_POR_USUARIO_ID_MOVIMENTACOES_ARMAS = ?,
        RECIBO_CONFIRMADO_POR_NOME_MOVIMENTACOES_ARMAS = ?,
        DATA_RECIBO_MOVIMENTACOES_ARMAS = NOW(),
        DATA_ATUALIZACAO_MOVIMENTACOES_ARMAS = NOW()
       WHERE ID_MOVIMENTACOES_ARMAS = ?`,
      [actor.id, actor.name, id]
    );

    const vaultToSet = movement.COFRE_DEVOLUCAO_ID_MOVIMENTACOES_ARMAS || movement.COFRE_RETIRADA_ID_MOVIMENTACOES_ARMAS || null;
    await pool.query("UPDATE ARMAS SET STATUS_ARMAS = 'No Cofre', COFRE_ID_ARMAS = ? WHERE ID_ARMAS = ?", [vaultToSet, movement.weapon_id]);

    await insertAuditLog('Movimentações', 'Confirmar Recibo', `Confirmado recibo de devolução da arma (${movement.weapon_serial_number}) por ${actor.name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/movements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [movs]: any = await pool.query('SELECT ID_MOVIMENTACOES_ARMAS as id, ARMA_ID_MOVIMENTACOES_ARMAS as weapon_id, NUMERO_SERIE_ARMA_MOVIMENTACOES_ARMAS as weapon_serial_number, MODELO_ARMA_MOVIMENTACOES_ARMAS as weapon_model, REQUERENTE_ID_MOVIMENTACOES_ARMAS as requester_id, NOME_REQUERENTE_MOVIMENTACOES_ARMAS as requester_name, MASP_REQUERENTE_MOVIMENTACOES_ARMAS as requester_masp, STATUS_MOVIMENTACOES_ARMAS as status, QUANTIDADE_MUNICAO_MOVIMENTACOES_ARMAS as ammunition_quantity, QUANTIDADE_CARREGADORES_MOVIMENTACOES_ARMAS as magazine_quantity FROM MOVIMENTACOES_ARMAS WHERE ID_MOVIMENTACOES_ARMAS = ?', [id]);
    if (movs && movs.length > 0) {
      await pool.query("UPDATE ARMAS SET STATUS_ARMAS = 'No Cofre' WHERE ID_ARMAS = ?", [movs[0].weapon_id]);
    }

    await pool.query('DELETE FROM MOVIMENTACOES_ARMAS WHERE ID_MOVIMENTACOES_ARMAS = ?', [id]);
    await insertAuditLog('Movimentações', 'Excluir', `Excluído registro de movimentação ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AUDIT LOGS
// -------------------------------------------------------------
apiRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_LOGS_AUDITORIA as id,
        MODULO_LOGS_AUDITORIA as module,
        ACAO_LOGS_AUDITORIA as action,
        DETALHES_LOGS_AUDITORIA as details,
        USUARIO_ID_LOGS_AUDITORIA as userId,
        NOME_USUARIO_LOGS_AUDITORIA as userName,
        MASP_USUARIO_LOGS_AUDITORIA as userMasp,
        PERFIL_USUARIO_LOGS_AUDITORIA as userRole,
        ENDERECO_IP_LOGS_AUDITORIA as ipAddress,
        DATA_HORA_LOGS_AUDITORIA as timestamp
      FROM LOGS_AUDITORIA ORDER BY DATA_HORA_LOGS_AUDITORIA DESC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/audit-logs', async (req: Request, res: Response) => {
  try {
    const { module, action, details, actor } = req.body;
    await insertAuditLog(module, action, details, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ACADEMIA DE POLÍCIA - CURSOS E MOVIMENTAÇÃO
// -------------------------------------------------------------

// Academy Courses
apiRouter.get('/academy-courses', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_CURSOS_ACADEMIA as id,
        NOME_CURSOS_ACADEMIA as name,
        TIPO_CURSOS_ACADEMIA as type,
        CARREIRA_CURSOS_ACADEMIA as career,
        CODIGO_CURSOS_ACADEMIA as code,
        DATAS_CURSOS_ACADEMIA as dates,
        NOME_DEPARTAMENTO_CURSOS_ACADEMIA as department_name,
        DATA_INICIO_CURSOS_ACADEMIA as start_date,
        DATA_FIM_CURSOS_ACADEMIA as end_date,
        NUMERO_MODULO_CURSOS_ACADEMIA as module_number,
        MODULO_CURSOS_ACADEMIA as module,
        NOME_DEPARTAMENTO_ENSINO_CURSOS_ACADEMIA as teaching_department_name,
        DEPARTAMENTO_ENSINO_ID_CURSOS_ACADEMIA as teaching_department_id,
        NOME_DEPARTAMENTO_LOCALIZACAO_CURSOS_ACADEMIA as location_department_name,
        DEPARTAMENTO_LOCALIZACAO_ID_CURSOS_ACADEMIA as location_department_id,
        DURACAO_DIAS_CURSOS_ACADEMIA as duration_days,
        DISCIPLINA_CURSOS_ACADEMIA as subject,
        QUANTIDADE_AULAS_CURSOS_ACADEMIA as lesson_count,
        DADOS_AULAS_CURSOS_ACADEMIA as lessons_data,
        DEPARTAMENTO_ID_CURSOS_ACADEMIA as department_id,
        UNIDADE_ID_CURSOS_ACADEMIA as unit_id,
        DATA_CRIACAO_CURSOS_ACADEMIA as created_at
      FROM CURSOS_ACADEMIA ORDER BY DATA_CRIACAO_CURSOS_ACADEMIA DESC
    `);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      career: r.career || undefined,
      code: r.code || '',
      dates: typeof r.dates === 'string' ? JSON.parse(r.dates) : (Array.isArray(r.dates) ? r.dates : []),
      departmentName: r.department_name || undefined,
      startDate: r.start_date ? new Date(r.start_date).toISOString().split('T')[0] : undefined,
      endDate: r.end_date ? new Date(r.end_date).toISOString().split('T')[0] : undefined,
      moduleNumber: r.module_number || undefined,
      module: r.module || undefined,
      teachingDepartmentName: r.teaching_department_name || undefined,
      teachingDepartmentId: r.teaching_department_id || undefined,
      locationDepartmentName: r.location_department_name || undefined,
      locationDepartmentId: r.location_department_id || undefined,
      durationDays: r.duration_days ? Number(r.duration_days) : undefined,
      subject: r.subject || undefined,
      lessonCount: r.lesson_count || 1,
      lessonsData: typeof r.lessons_data === 'string' ? JSON.parse(r.lessons_data) : (r.lessons_data || []),
      departmentId: r.department_id || undefined,
      unitId: r.unit_id || undefined,
      createdAt: r.created_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/academy-courses', async (req: Request, res: Response) => {
  try {
    const {
      name, type, career, code, dates, departmentName, startDate, endDate, moduleNumber, module,
      teachingDepartmentName, teachingDepartmentId, locationDepartmentName, locationDepartmentId,
      durationDays, subject, lessonCount, lessonsData, departmentId, unitId, actor
    } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do curso é obrigatório' });
    if (!code || !code.trim()) return res.status(400).json({ error: 'Código do curso é obrigatório' });

    const pool = getPool();
    const id = `acad-crs-${Date.now()}`;

    try {
      await pool.query(
        `INSERT INTO CURSOS_ACADEMIA (
          ID_CURSOS_ACADEMIA, NOME_CURSOS_ACADEMIA, TIPO_CURSOS_ACADEMIA, CARREIRA_CURSOS_ACADEMIA, CODIGO_CURSOS_ACADEMIA,
          DATAS_CURSOS_ACADEMIA, NOME_DEPARTAMENTO_CURSOS_ACADEMIA, DATA_INICIO_CURSOS_ACADEMIA, DATA_FIM_CURSOS_ACADEMIA,
          NUMERO_MODULO_CURSOS_ACADEMIA, MODULO_CURSOS_ACADEMIA, NOME_DEPARTAMENTO_ENSINO_CURSOS_ACADEMIA,
          DEPARTAMENTO_ENSINO_ID_CURSOS_ACADEMIA, NOME_DEPARTAMENTO_LOCALIZACAO_CURSOS_ACADEMIA,
          DEPARTAMENTO_LOCALIZACAO_ID_CURSOS_ACADEMIA, DURACAO_DIAS_CURSOS_ACADEMIA, DISCIPLINA_CURSOS_ACADEMIA,
          QUANTIDADE_AULAS_CURSOS_ACADEMIA, DADOS_AULAS_CURSOS_ACADEMIA, DEPARTAMENTO_ID_CURSOS_ACADEMIA, UNIDADE_ID_CURSOS_ACADEMIA, DATA_CRIACAO_CURSOS_ACADEMIA
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          name.trim(),
          type || 'Formação',
          career || null,
          code.trim(),
          JSON.stringify(dates || []),
          departmentName ? departmentName.trim() : null,
          startDate || null,
          endDate || null,
          moduleNumber || null,
          module || null,
          teachingDepartmentName ? teachingDepartmentName.trim() : null,
          teachingDepartmentId || null,
          locationDepartmentName ? locationDepartmentName.trim() : null,
          locationDepartmentId || null,
          durationDays ? Number(durationDays) : 1,
          subject || null,
          lessonCount || 1,
          JSON.stringify(lessonsData || []),
          departmentId || null,
          unitId || null
        ]
      );
    } catch (dbErr: any) {
      // Fallback query if some newly added columns do not exist yet
      await pool.query(
        `INSERT INTO CURSOS_ACADEMIA (ID_CURSOS_ACADEMIA, NOME_CURSOS_ACADEMIA, TIPO_CURSOS_ACADEMIA, CARREIRA_CURSOS_ACADEMIA, CODIGO_CURSOS_ACADEMIA, DATAS_CURSOS_ACADEMIA, NOME_DEPARTAMENTO_CURSOS_ACADEMIA, DATA_INICIO_CURSOS_ACADEMIA, NUMERO_MODULO_CURSOS_ACADEMIA, QUANTIDADE_AULAS_CURSOS_ACADEMIA, DADOS_AULAS_CURSOS_ACADEMIA, DEPARTAMENTO_ID_CURSOS_ACADEMIA, UNIDADE_ID_CURSOS_ACADEMIA, DATA_CRIACAO_CURSOS_ACADEMIA)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          name.trim(),
          type || 'Formação',
          career || null,
          code.trim(),
          JSON.stringify(dates || []),
          departmentName ? departmentName.trim() : null,
          startDate || null,
          moduleNumber || null,
          lessonCount || 1,
          JSON.stringify(lessonsData || []),
          departmentId || null,
          unitId || null
        ]
      );
    }

    await insertAuditLog('Cursos', 'Criar', `Cadastrado curso da academia: ${name} (${type} - Cód: ${code})`, actor, req.ip);
    return res.json({ id, name, type, career, code, dates, departmentName, startDate, endDate, moduleNumber, module, teachingDepartmentName, teachingDepartmentId, locationDepartmentName, locationDepartmentId, durationDays, subject, lessonCount, lessonsData, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/academy-courses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, type, career, code, dates, departmentName, startDate, endDate, moduleNumber, module,
      teachingDepartmentName, teachingDepartmentId, locationDepartmentName, locationDepartmentId,
      durationDays, subject, lessonCount, lessonsData, departmentId, unitId, actor
    } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do curso é obrigatório' });
    if (!code || !code.trim()) return res.status(400).json({ error: 'Código do curso é obrigatório' });

    const pool = getPool();

    await pool.query(
      `UPDATE CURSOS_ACADEMIA SET
        NOME_CURSOS_ACADEMIA = ?,
        TIPO_CURSOS_ACADEMIA = ?,
        CARREIRA_CURSOS_ACADEMIA = ?,
        CODIGO_CURSOS_ACADEMIA = ?,
        DATAS_CURSOS_ACADEMIA = ?,
        NOME_DEPARTAMENTO_CURSOS_ACADEMIA = ?,
        DATA_INICIO_CURSOS_ACADEMIA = ?,
        DATA_FIM_CURSOS_ACADEMIA = ?,
        NUMERO_MODULO_CURSOS_ACADEMIA = ?,
        MODULO_CURSOS_ACADEMIA = ?,
        NOME_DEPARTAMENTO_ENSINO_CURSOS_ACADEMIA = ?,
        DEPARTAMENTO_ENSINO_ID_CURSOS_ACADEMIA = ?,
        NOME_DEPARTAMENTO_LOCALIZACAO_CURSOS_ACADEMIA = ?,
        DEPARTAMENTO_LOCALIZACAO_ID_CURSOS_ACADEMIA = ?,
        DURACAO_DIAS_CURSOS_ACADEMIA = ?,
        DISCIPLINA_CURSOS_ACADEMIA = ?,
        QUANTIDADE_AULAS_CURSOS_ACADEMIA = ?,
        DADOS_AULAS_CURSOS_ACADEMIA = ?,
        DEPARTAMENTO_ID_CURSOS_ACADEMIA = ?,
        UNIDADE_ID_CURSOS_ACADEMIA = ?
       WHERE ID_CURSOS_ACADEMIA = ?`,
      [
        name.trim(),
        type,
        career || null,
        code.trim(),
        JSON.stringify(dates || []),
        departmentName ? departmentName.trim() : null,
        startDate || null,
        endDate || null,
        moduleNumber || null,
        module || null,
        teachingDepartmentName ? teachingDepartmentName.trim() : null,
        teachingDepartmentId || null,
        locationDepartmentName ? locationDepartmentName.trim() : null,
        locationDepartmentId || null,
        durationDays ? Number(durationDays) : 1,
        subject || null,
        lessonCount || 1,
        JSON.stringify(lessonsData || []),
        departmentId || null,
        unitId || null,
        id
      ]
    );

    await insertAuditLog('Cursos', 'Editar', `Atualizado curso da academia: ${name} (Cód: ${code})`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/academy-courses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM CURSOS_ACADEMIA WHERE ID_CURSOS_ACADEMIA = ?', [id]);
    await insertAuditLog('Cursos', 'Excluir', `Excluído curso da academia ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Lesson Plans (Planos de Aula Curso de Formação)
apiRouter.get('/lesson-plans', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_PLANOS_AULA as id,
        NOME_PLANOS_AULA as name,
        CARREIRA_PLANOS_AULA as career,
        ANO_PLANOS_AULA as year,
        TIPO_PLANOS_AULA as type,
        CODIGO_TURMA_PLANOS_AULA as turma_code,
        QUANTIDADE_AULAS_PLANOS_AULA as lesson_count,
        DADOS_AULAS_PLANOS_AULA as lessons_data,
        DEPARTAMENTO_ID_PLANOS_AULA as department_id,
        UNIDADE_ID_PLANOS_AULA as unit_id,
        DATA_CRIACAO_PLANOS_AULA as created_at
      FROM PLANOS_AULA ORDER BY DATA_CRIACAO_PLANOS_AULA DESC
    `);

    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      subject: 'MEAF',
      turmaCode: r.turma_code || undefined,
      career: r.career,
      year: r.year,
      type: r.type || 'curso de formação',
      lessonCount: r.lesson_count || 1,
      lessonsData: typeof r.lessons_data === 'string' ? JSON.parse(r.lessons_data) : (r.lessons_data || []),
      departmentId: r.department_id || undefined,
      unitId: r.unit_id || undefined,
      createdAt: r.created_at
    }));

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/lesson-plans', async (req: Request, res: Response) => {
  try {
    const { name, subject, turmaCode, career, year, type, lessonCount, lessonsData, departmentId, unitId, actor } = req.body;
    const pool = getPool();
    const id = req.body.id || `plano-${Date.now()}`;
    const planName = name || 'Plano de Aula';
    const planSubject = subject || 'MEAF';
    const planCareer = career || 'Delegado';
    const planYear = Number(year) || new Date().getFullYear();
    const planType = type || 'curso de formação';
    const lessonsList: any[] = Array.isArray(lessonsData) ? lessonsData : [];
    const planLessonCount = Number(lessonCount) || (lessonsList.length > 0 ? lessonsList.length : 1);

    await pool.query(
      `INSERT INTO PLANOS_AULA (ID_PLANOS_AULA, NOME_PLANOS_AULA, CODIGO_TURMA_PLANOS_AULA, CARREIRA_PLANOS_AULA, ANO_PLANOS_AULA, TIPO_PLANOS_AULA, QUANTIDADE_AULAS_PLANOS_AULA, DADOS_AULAS_PLANOS_AULA, DEPARTAMENTO_ID_PLANOS_AULA, UNIDADE_ID_PLANOS_AULA, DATA_CRIACAO_PLANOS_AULA)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        planName,
        turmaCode || null,
        planCareer,
        planYear,
        planType,
        planLessonCount,
        JSON.stringify(lessonsList),
        departmentId || null,
        unitId || null
      ]
    );

    await insertAuditLog('Cursos', 'Criar', `Cadastrado plano de aula: ${planName} (${planSubject} - ${planCareer} - ${planType})`, actor, req.ip);
    return res.json({ id, name: planName, subject: planSubject, turmaCode, career: planCareer, year: planYear, type: planType, lessonCount: planLessonCount, lessonsData: lessonsList, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Erro em POST /lesson-plans:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/lesson-plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, subject, turmaCode, career, year, type, lessonCount, lessonsData, departmentId, unitId, actor } = req.body;
    const pool = getPool();
    const planName = name || 'Plano de Aula';
    const planSubject = subject || 'MEAF';
    const planCareer = career || 'Delegado';
    const planYear = Number(year) || new Date().getFullYear();
    const planType = type || 'curso de formação';
    const lessonsList: any[] = Array.isArray(lessonsData) ? lessonsData : [];
    const planLessonCount = Number(lessonCount) || (lessonsList.length > 0 ? lessonsList.length : 1);

    await pool.query(
      `UPDATE PLANOS_AULA SET
         NOME_PLANOS_AULA = ?,
         CARREIRA_PLANOS_AULA = ?,
         ANO_PLANOS_AULA = ?,
         TIPO_PLANOS_AULA = ?,
         CODIGO_TURMA_PLANOS_AULA = ?,
         QUANTIDADE_AULAS_PLANOS_AULA = ?,
         DADOS_AULAS_PLANOS_AULA = ?,
         DEPARTAMENTO_ID_PLANOS_AULA = ?,
         UNIDADE_ID_PLANOS_AULA = ?
       WHERE ID_PLANOS_AULA = ?`,
      [
        planName,
        planCareer,
        planYear,
        planType,
        turmaCode || null,
        planLessonCount,
        JSON.stringify(lessonsList),
        departmentId || null,
        unitId || null,
        id
      ]
    );

    await insertAuditLog('Cursos', 'Editar', `Atualizado plano de aula: ${planName}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Erro em PUT /lesson-plans:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/lesson-plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    const pool = getPool();

    await pool.query('DELETE FROM PLANOS_AULA WHERE ID_PLANOS_AULA = ?', [id]);
    await insertAuditLog('Cursos', 'Excluir', `Excluído plano de aula ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Weapon Boxes (Caixas de Armas de Aula)
apiRouter.get('/weapon-boxes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_CAIXAS_ARMAS as id,
        NOME_CAIXAS_ARMAS as name,
        TIPO_CURSO_CAIXAS_ARMAS as course_type,
        QUANTIDADE_ARMAS_CAIXAS_ARMAS as weapon_count,
        IDS_ARMAS_CAIXAS_ARMAS as weapon_ids,
        DEPARTAMENTO_ID_CAIXAS_ARMAS as department_id,
        UNIDADE_ID_CAIXAS_ARMAS as unit_id,
        DATA_CRIACAO_CAIXAS_ARMAS as created_at
      FROM CAIXAS_ARMAS ORDER BY DATA_CRIACAO_CAIXAS_ARMAS DESC
    `);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      courseType: r.course_type,
      weaponCount: r.weapon_count,
      weaponIds: typeof r.weapon_ids === 'string' ? JSON.parse(r.weapon_ids) : (r.weapon_ids || []),
      departmentId: r.department_id || undefined,
      unitId: r.unit_id || undefined,
      createdAt: r.created_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/weapon-boxes', async (req: Request, res: Response) => {
  try {
    const actor = req.body.actor;
    const name = req.body.name || 'Caixa de Armas';
    const courseType = req.body.courseType || req.body.course_type || 'Geral';
    const rawWeaponIds = req.body.weaponIds || req.body.weapon_ids || [];
    const weaponIds = Array.isArray(rawWeaponIds) ? rawWeaponIds : (typeof rawWeaponIds === 'string' ? JSON.parse(rawWeaponIds) : []);
    const weaponCount = req.body.weaponCount !== undefined ? Number(req.body.weaponCount) : (req.body.weapon_count !== undefined ? Number(req.body.weapon_count) : weaponIds.length);
    const departmentId = req.body.departmentId || req.body.department_id || null;
    const unitId = req.body.unitId || req.body.unit_id || null;

    const pool = getPool();
    const id = req.body.id || `wp-box-${Date.now()}`;
    await pool.query(
      `INSERT INTO CAIXAS_ARMAS (ID_CAIXAS_ARMAS, NOME_CAIXAS_ARMAS, TIPO_CURSO_CAIXAS_ARMAS, QUANTIDADE_ARMAS_CAIXAS_ARMAS, IDS_ARMAS_CAIXAS_ARMAS, DEPARTAMENTO_ID_CAIXAS_ARMAS, UNIDADE_ID_CAIXAS_ARMAS, DATA_CRIACAO_CAIXAS_ARMAS)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        name,
        courseType,
        weaponCount,
        JSON.stringify(weaponIds),
        departmentId,
        unitId
      ]
    );

    await insertAuditLog('Cursos', 'Criar', `Criada caixa de armas de aula: ${name} (${weaponCount} armas)`, actor, req.ip);
    return res.json({ id, name, courseType, weaponCount, weaponIds, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Erro no POST /weapon-boxes:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/weapon-boxes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const name = req.body.name || 'Caixa de Armas';
    const courseType = req.body.courseType || req.body.course_type || 'Geral';
    const rawWeaponIds = req.body.weaponIds || req.body.weapon_ids || [];
    const weaponIds = Array.isArray(rawWeaponIds) ? rawWeaponIds : (typeof rawWeaponIds === 'string' ? JSON.parse(rawWeaponIds) : []);
    const weaponCount = req.body.weaponCount !== undefined ? Number(req.body.weaponCount) : (req.body.weapon_count !== undefined ? Number(req.body.weapon_count) : weaponIds.length);
    const departmentId = req.body.departmentId || req.body.department_id || null;
    const unitId = req.body.unitId || req.body.unit_id || null;

    const pool = getPool();

    await pool.query(
      `UPDATE CAIXAS_ARMAS SET
        NOME_CAIXAS_ARMAS = ?,
        TIPO_CURSO_CAIXAS_ARMAS = ?,
        QUANTIDADE_ARMAS_CAIXAS_ARMAS = ?,
        IDS_ARMAS_CAIXAS_ARMAS = ?,
        DEPARTAMENTO_ID_CAIXAS_ARMAS = ?,
        UNIDADE_ID_CAIXAS_ARMAS = ?
       WHERE ID_CAIXAS_ARMAS = ?`,
      [
        name,
        courseType,
        weaponCount,
        JSON.stringify(weaponIds),
        departmentId,
        unitId,
        id
      ]
    );

    await insertAuditLog('Cursos', 'Editar', `Atualizada caixa de armas de aula: ${name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Erro no PUT /weapon-boxes:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/weapon-boxes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM CAIXAS_ARMAS WHERE ID_CAIXAS_ARMAS = ?', [id]);
    await insertAuditLog('Cursos', 'Excluir', `Excluída caixa de armas de aula ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Weapon Box Replacement (Substituição de arma na caixa)
apiRouter.post('/weapon-boxes/:id/replace-weapon', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { oldWeaponId, oldWeaponDesc, newWeaponId, newWeaponDesc, reason, teacherName, responsibleUserName, actor } = req.body;
    const pool = getPool();

    const [boxes]: any = await pool.query('SELECT ID_CAIXAS_ARMAS as id, NOME_CAIXAS_ARMAS as name, IDS_ARMAS_CAIXAS_ARMAS as weapon_ids FROM CAIXAS_ARMAS WHERE ID_CAIXAS_ARMAS = ?', [id]);
    if (!boxes || boxes.length === 0) return res.status(404).json({ error: 'Caixa de armas não encontrada' });
    const box = boxes[0];
    let wIds: string[] = typeof box.weapon_ids === 'string' ? JSON.parse(box.weapon_ids) : (box.weapon_ids || []);

    wIds = wIds.map(wId => wId === oldWeaponId ? newWeaponId : wId);

    await pool.query('UPDATE CAIXAS_ARMAS SET IDS_ARMAS_CAIXAS_ARMAS = ? WHERE ID_CAIXAS_ARMAS = ?', [JSON.stringify(wIds), id]);

    const finalRespName = responsibleUserName || teacherName || actor?.name || 'Armeiro Responsável';
    const repId = `rep-${Date.now()}`;
    await pool.query(
      `INSERT INTO SUBSTITUICOES_CAIXA_ARMAS (
        ID_SUBSTITUICOES_CAIXA_ARMAS, CAIXA_ID_SUBSTITUICOES_CAIXA_ARMAS, NOME_CAIXA_SUBSTITUICOES_CAIXA_ARMAS,
        ARMA_ANTIGA_ID_SUBSTITUICOES_CAIXA_ARMAS, DESCRICAO_ARMA_ANTIGA_SUBSTITUICOES_CAIXA_ARMAS,
        ARMA_NOVA_ID_SUBSTITUICOES_CAIXA_ARMAS, DESCRICAO_ARMA_NOVA_SUBSTITUICOES_CAIXA_ARMAS,
        MOTIVO_SUBSTITUICOES_CAIXA_ARMAS, NOME_PROFESSOR_SUBSTITUICOES_CAIXA_ARMAS,
        NOME_RESPONSAVEL_SUBSTITUICOES_CAIXA_ARMAS, DATA_CRIACAO_SUBSTITUICOES_CAIXA_ARMAS
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        repId,
        id,
        box.name,
        oldWeaponId,
        oldWeaponDesc,
        newWeaponId,
        newWeaponDesc,
        reason,
        teacherName || null,
        finalRespName
      ]
    );

    const auditDetail = `Substituição na caixa '${box.name}': Troca da arma ${oldWeaponDesc} (${reason}) pela ${newWeaponDesc}.` + (teacherName ? ` Professor em aula: ${teacherName}.` : '');
    await insertAuditLog('Cursos', 'Editar', auditDetail, actor, req.ip);

    return res.json({ success: true, updatedWeaponIds: wIds });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/weapon-box-replacements', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_SUBSTITUICOES_CAIXA_ARMAS as id,
        CAIXA_ID_SUBSTITUICOES_CAIXA_ARMAS as box_id,
        NOME_CAIXA_SUBSTITUICOES_CAIXA_ARMAS as box_name,
        ARMA_ANTIGA_ID_SUBSTITUICOES_CAIXA_ARMAS as old_weapon_id,
        DESCRICAO_ARMA_ANTIGA_SUBSTITUICOES_CAIXA_ARMAS as old_weapon_desc,
        ARMA_NOVA_ID_SUBSTITUICOES_CAIXA_ARMAS as new_weapon_id,
        DESCRICAO_ARMA_NOVA_SUBSTITUICOES_CAIXA_ARMAS as new_weapon_desc,
        MOTIVO_SUBSTITUICOES_CAIXA_ARMAS as reason,
        NOME_PROFESSOR_SUBSTITUICOES_CAIXA_ARMAS as teacher_name,
        NOME_RESPONSAVEL_SUBSTITUICOES_CAIXA_ARMAS as responsible_name,
        DATA_CRIACAO_SUBSTITUICOES_CAIXA_ARMAS as created_at
      FROM SUBSTITUICOES_CAIXA_ARMAS ORDER BY DATA_CRIACAO_SUBSTITUICOES_CAIXA_ARMAS DESC
    `);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      boxId: r.box_id,
      boxName: r.box_name,
      oldWeaponId: r.old_weapon_id,
      oldWeaponDesc: r.old_weapon_desc,
      newWeaponId: r.new_weapon_id,
      newWeaponDesc: r.new_weapon_desc,
      reason: r.reason,
      teacherName: r.teacher_name || undefined,
      responsibleUserName: r.responsible_user_name,
      createdAt: r.created_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Course Classes (Turmas)
apiRouter.get('/course-classes', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_TURMAS_CURSO as id,
        CURSO_ID_TURMAS_CURSO as course_id,
        NOME_CURSO_TURMAS_CURSO as course_name,
        DISCIPLINA_TURMAS_CURSO as subject,
        CARREIRA_TURMAS_CURSO as career,
        SIGLA_CARREIRA_TURMAS_CURSO as career_abbreviation,
        NUMERO_TURMA_TURMAS_CURSO as turma_number,
        CODIGO_TURMAS_CURSO as code,
        QUANTIDADE_ALUNOS_TURMAS_CURSO as student_count,
        COALESCE(PROFESSORES_IDS_TURMAS_CURSO, IDS_PROFESSORES_TURMAS_CURSO) as teacher_user_ids,
        NOME_PROFESSOR_TURMAS_CURSO as teacher_name,
        PLANO_DE_AULA_TURMAS_CURSO as plano_de_aula,
        DEPARTAMENTO_ID_TURMAS_CURSO as department_id,
        UNIDADE_ID_TURMAS_CURSO as unit_id,
        COALESCE(DATA_PRIMEIRA_AULA_TURMAS_CURSO, PRIMEIRA_DATA_AULA_TURMAS_CURSO) as first_class_date,
        COALESCE(DATA_ULTIMA_AULA_TURMAS_CURSO, ULTIMA_DATA_AULA_TURMAS_CURSO) as last_class_date,
        TURMA_CALENDARIO_TURMAS_CURSO as turma_calendario,
        DATA_CRIACAO_TURMAS_CURSO as created_at
      FROM TURMAS_CURSO ORDER BY DATA_CRIACAO_TURMAS_CURSO DESC
    `);

    let teacherMap: Record<string, string> = {};
    try {
      const [tchRows]: any = await pool.query('SELECT ID_USUARIOS as id, NOME_USUARIOS as name, ID_USUARIOS as user_id FROM USUARIOS WHERE EH_PROFESSOR_USUARIOS = 1');
      (tchRows || []).forEach((t: any) => {
        if (t.id) teacherMap[t.id] = t.name;
        if (t.user_id) teacherMap[t.user_id] = t.name;
      });
    } catch (e) {}

    let studentCountsMap: Record<string, number> = {};
    try {
      const [scRows]: any = await pool.query('SELECT TURMA_ID_ALUNO_TURMA as turma_id, COUNT(*) as cnt FROM ALUNO_TURMA WHERE TURMA_ID_ALUNO_TURMA IS NOT NULL GROUP BY TURMA_ID_ALUNO_TURMA');
      (scRows || []).forEach((sc: any) => {
        if (sc.turma_id) studentCountsMap[sc.turma_id] = Number(sc.cnt) || 0;
      });
    } catch (e) {}

    const mapped = (rows || []).map((r: any) => {
      const teacherUserIds = typeof r.teacher_user_ids === 'string' ? JSON.parse(r.teacher_user_ids) : (r.teacher_user_ids || []);
      const primaryTeacherId = r.teacher_user_id || (teacherUserIds.length > 0 ? teacherUserIds[0] : undefined);
      
      let teacherName = r.teacher_name || undefined;
      if (!teacherName && teacherUserIds.length > 0) {
        const names = teacherUserIds.map((tid: string) => teacherMap[tid]).filter(Boolean);
        if (names.length > 0) teacherName = names.join(', ');
      }
      if (!teacherName && primaryTeacherId && teacherMap[primaryTeacherId]) {
        teacherName = teacherMap[primaryTeacherId];
      }

      // If student count exists in aluno_turma table, use that count; otherwise default to r.student_count
      const computedStudentCount = (studentCountsMap[r.id] !== undefined) ? studentCountsMap[r.id] : r.student_count;

      return {
        id: r.id,
        courseId: r.course_id,
        courseName: r.course_name,
        subject: r.subject,
        career: r.career,
        careerAbbreviation: r.career_abbreviation,
        turmaNumber: r.turma_number,
        code: r.code,
        studentCount: computedStudentCount,
        teacherUserId: primaryTeacherId,
        teacherName: teacherName || undefined,
        teacherUserIds: teacherUserIds,
        lessonPlanId: r.plano_de_aula || r.lesson_plan_id || undefined,
        plano_de_aula: r.plano_de_aula || r.lesson_plan_id || undefined,
        firstClassDate: r.first_class_date || undefined,
        lastClassDate: r.last_class_date || undefined,
        turmaCalendario: r.turma_calendario || undefined,
        departmentId: r.department_id || undefined,
        unitId: r.unit_id || undefined,
        createdAt: r.created_at
      };
    });
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

function computeCareerAbbreviation(career?: string): string {
  const c = (career || '').toUpperCase();
  if (c.includes('DELEGADO') || c.includes('DL')) return 'DL';
  if (c.includes('INVESTIGADOR') || c.includes('IP')) return 'IP';
  if (c.includes('ESCRIVÃ') || c.includes('ESCRIVAO') || c.includes('EP')) return 'EP';
  if (c.includes('PERITO') || c.includes('PC')) return 'PC';
  if (c.includes('MÉDICO') || c.includes('MEDICO') || c.includes('LEGISTA') || c.includes('ML')) return 'ML';
  return 'DL';
}

apiRouter.post('/course-classes', async (req: Request, res: Response) => {
  try {
    const { courseId, courseName, subject, career, studentCount, teacherUserIds, teacherUserId, teacherName, departmentId, unitId, actor, firstClassDate, lastClassDate, turmaCalendario } = req.body;
    const planoDeAula = req.body.plano_de_aula || req.body.lessonPlanId || req.body.lesson_plan_id || null;
    const finalCareer = career || 'Delegado';
    const careerAbbreviation = req.body.careerAbbreviation || req.body.career_abbreviation || computeCareerAbbreviation(finalCareer);
    
    let rawNum = req.body.turmaNumber || req.body.turma_number || req.body.name || req.body.code || '01';
    rawNum = String(rawNum).replace(/\D/g, '');
    const turmaNumber = (rawNum || '01').padStart(2, '0').slice(-2);
    const code = req.body.code || `${careerAbbreviation}-${turmaNumber}`;

    const pool = getPool();

    const finalTeacherUserIds = Array.isArray(teacherUserIds) ? teacherUserIds : (teacherUserId ? [teacherUserId] : []);
    let finalTeacherName = teacherName || req.body.teacher_name || '';

    if (!finalTeacherName && finalTeacherUserIds.length > 0) {
      try {
        let teacherMap: Record<string, string> = {};
        const [tchRows]: any = await pool.query('SELECT ID_USUARIOS as id, NOME_USUARIOS as name, ID_USUARIOS as user_id FROM USUARIOS WHERE EH_PROFESSOR_USUARIOS = 1');
        (tchRows || []).forEach((t: any) => {
          if (t.id) teacherMap[t.id] = t.name;
          if (t.user_id) teacherMap[t.user_id] = t.name;
        });
        const names = finalTeacherUserIds.map((tid: string) => teacherMap[tid]).filter(Boolean);
        if (names.length > 0) finalTeacherName = names.join(', ');
      } catch (e) {}
    }

    // Check duplicate turma in same course & career
    const [dups]: any = await pool.query(
      'SELECT ID_TURMAS_CURSO as id FROM TURMAS_CURSO WHERE CURSO_ID_TURMAS_CURSO = ? AND CARREIRA_TURMAS_CURSO = ? AND NUMERO_TURMA_TURMAS_CURSO = ?',
      [courseId || '', finalCareer, turmaNumber]
    );
    if (dups && dups.length > 0) {
      return res.status(400).json({ error: `Já existe uma turma cadastrada com o número "${turmaNumber}" para a carreira "${finalCareer}" neste mesmo curso.` });
    }

    const id = req.body.id || `class-${Date.now()}`;

    await pool.query(
      `INSERT INTO TURMAS_CURSO (
        ID_TURMAS_CURSO,
        CURSO_ID_TURMAS_CURSO,
        NOME_CURSO_TURMAS_CURSO,
        DISCIPLINA_TURMAS_CURSO,
        CARREIRA_TURMAS_CURSO,
        SIGLA_CARREIRA_TURMAS_CURSO,
        NUMERO_TURMA_TURMAS_CURSO,
        CODIGO_TURMAS_CURSO,
        QUANTIDADE_ALUNOS_TURMAS_CURSO,
        PROFESSORES_IDS_TURMAS_CURSO,
        NOME_PROFESSOR_TURMAS_CURSO,
        PLANO_DE_AULA_TURMAS_CURSO,
        DEPARTAMENTO_ID_TURMAS_CURSO,
        UNIDADE_ID_TURMAS_CURSO,
        DATA_PRIMEIRA_AULA_TURMAS_CURSO,
        DATA_ULTIMA_AULA_TURMAS_CURSO,
        TURMA_CALENDARIO_TURMAS_CURSO,
        DATA_CRIACAO_TURMAS_CURSO
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        courseId || '',
        courseName || '',
        subject || 'MEAF',
        finalCareer,
        careerAbbreviation,
        turmaNumber,
        code,
        Number(studentCount) || 1,
        JSON.stringify(finalTeacherUserIds),
        finalTeacherName || null,
        planoDeAula,
        departmentId || null,
        unitId || null,
        firstClassDate || null,
        lastClassDate || null,
        turmaCalendario || null
      ]
    );

    await insertAuditLog('Cursos', 'Criar', `Criada turma de aula: ${code} (${subject}) - Prof: ${finalTeacherName || 'N/I'}`, actor, req.ip);
    return res.json({ id, courseId, courseName, subject, career: finalCareer, careerAbbreviation, turmaNumber, code, studentCount, teacherUserIds: finalTeacherUserIds, teacherName: finalTeacherName, plano_de_aula: planoDeAula, lessonPlanId: planoDeAula, firstClassDate, lastClassDate, turmaCalendario, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Erro em POST /course-classes:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/course-classes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { courseId, courseName, subject, career, studentCount, teacherUserIds, teacherUserId, teacherName, departmentId, unitId, actor, firstClassDate, lastClassDate, turmaCalendario } = req.body;
    const planoDeAula = req.body.plano_de_aula || req.body.lessonPlanId || req.body.lesson_plan_id || null;
    const finalCareer = career || 'Delegado';
    const careerAbbreviation = req.body.careerAbbreviation || req.body.career_abbreviation || computeCareerAbbreviation(finalCareer);
    
    let rawNum = req.body.turmaNumber || req.body.turma_number || req.body.name || req.body.code || '01';
    rawNum = String(rawNum).replace(/\D/g, '');
    const turmaNumber = (rawNum || '01').padStart(2, '0').slice(-2);
    const code = req.body.code || `${careerAbbreviation}-${turmaNumber}`;

    const pool = getPool();

    // Check duplicate turma in same course & career
    const [dups]: any = await pool.query(
      'SELECT ID_TURMAS_CURSO as id FROM TURMAS_CURSO WHERE CURSO_ID_TURMAS_CURSO = ? AND CARREIRA_TURMAS_CURSO = ? AND NUMERO_TURMA_TURMAS_CURSO = ? AND ID_TURMAS_CURSO != ?',
      [courseId || '', finalCareer, turmaNumber, id]
    );
    if (dups && dups.length > 0) {
      return res.status(400).json({ error: `Já existe uma turma cadastrada com o número "${turmaNumber}" para a carreira "${finalCareer}" neste mesmo curso.` });
    }

    const finalTeacherUserIds = Array.isArray(teacherUserIds) ? teacherUserIds : (teacherUserId ? [teacherUserId] : []);
    let finalTeacherName = teacherName || req.body.teacher_name || '';

    if (!finalTeacherName && finalTeacherUserIds.length > 0) {
      try {
        let teacherMap: Record<string, string> = {};
        const [tchRows]: any = await pool.query('SELECT ID_USUARIOS as id, NOME_USUARIOS as name, ID_USUARIOS as user_id FROM USUARIOS WHERE EH_PROFESSOR_USUARIOS = 1');
        (tchRows || []).forEach((t: any) => {
          if (t.id) teacherMap[t.id] = t.name;
          if (t.user_id) teacherMap[t.user_id] = t.name;
        });
        const names = finalTeacherUserIds.map((tid: string) => teacherMap[tid]).filter(Boolean);
        if (names.length > 0) finalTeacherName = names.join(', ');
      } catch (e) {}
    }

    await pool.query(
      `UPDATE TURMAS_CURSO SET
        CURSO_ID_TURMAS_CURSO = ?,
        NOME_CURSO_TURMAS_CURSO = ?,
        DISCIPLINA_TURMAS_CURSO = ?,
        CARREIRA_TURMAS_CURSO = ?,
        SIGLA_CARREIRA_TURMAS_CURSO = ?,
        NUMERO_TURMA_TURMAS_CURSO = ?,
        CODIGO_TURMAS_CURSO = ?,
        QUANTIDADE_ALUNOS_TURMAS_CURSO = ?,
        PROFESSORES_IDS_TURMAS_CURSO = ?,
        NOME_PROFESSOR_TURMAS_CURSO = ?,
        PLANO_DE_AULA_TURMAS_CURSO = ?,
        DEPARTAMENTO_ID_TURMAS_CURSO = ?,
        UNIDADE_ID_TURMAS_CURSO = ?,
        DATA_PRIMEIRA_AULA_TURMAS_CURSO = ?,
        DATA_ULTIMA_AULA_TURMAS_CURSO = ?,
        TURMA_CALENDARIO_TURMAS_CURSO = ?
       WHERE ID_TURMAS_CURSO = ?`,
      [
        courseId || '',
        courseName || '',
        subject || 'MEAF',
        finalCareer,
        careerAbbreviation,
        turmaNumber,
        code,
        Number(studentCount) || 1,
        JSON.stringify(finalTeacherUserIds),
        finalTeacherName || null,
        planoDeAula,
        departmentId || null,
        unitId || null,
        firstClassDate || null,
        lastClassDate || null,
        turmaCalendario || null,
        id
      ]
    );

    await insertAuditLog('Cursos', 'Editar', `Atualizada turma de aula: ${code}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Erro em PUT /course-classes:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/course-classes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM TURMAS_CURSO WHERE ID_TURMAS_CURSO = ?', [id]);
    await insertAuditLog('Cursos', 'Excluir', `Excluída turma ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Course Movements (Saída e Devolução para Aula)
apiRouter.get('/course-movements', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_MOVIMENTACOES_TURMA as id,
        CURSO_ID_MOVIMENTACOES_TURMA as course_id,
        TURMA_ID_MOVIMENTACOES_TURMA as class_id,
        CODIGO_TURMA_MOVIMENTACOES_TURMA as turma_code,
        PLANO_AULA_ID_MOVIMENTACOES_TURMA as lesson_plan_id,
        NOME_PLANO_AULA_MOVIMENTACOES_TURMA as lesson_plan_name,
        NUMERO_AULA_MOVIMENTACOES_TURMA as lesson_number,
        NOME_PROFESSOR_MOVIMENTACOES_TURMA as teacher_name,
        CAIXA_ARMAS_ID_MOVIMENTACOES_TURMA as weapon_box_id,
        NOME_CAIXA_ARMAS_MOVIMENTACOES_TURMA as weapon_box_name,
        IDS_ARMAS_MOVIMENTACOES_TURMA as weapon_ids,
        CALIBRE_ID_MOVIMENTACOES_TURMA as caliber_id,
        COFRE_ID_MOVIMENTACOES_TURMA as vault_space_id,
        MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA as ammo_supplied,
        QUANTIDADE_ALUNOS_MOVIMENTACOES_TURMA as student_count,
        TIROS_POR_ALUNO_MOVIMENTACOES_TURMA as shots_per_student,
        TIROS_INSTRUTOR_MOVIMENTACOES_TURMA as instructor_shots,
        MUNICAO_USADA_MOVIMENTACOES_TURMA as ammo_used,
        MUNICAO_DEVOLVIDA_MOVIMENTACOES_TURMA as ammo_returned,
        CARREGADORES_EXTRAS_MOVIMENTACOES_TURMA as extra_magazines_count,
        STATUS_MOVIMENTACOES_TURMA as status,
        EMITIDO_POR_NOME_MOVIMENTACOES_TURMA as issued_by_user_name,
        DEVOLVIDO_POR_NOME_MOVIMENTACOES_TURMA as returned_by_user_name,
        MATERIAIS_DEVOLVIDOS_MOVIMENTACOES_TURMA as returned_materials,
        OBSERVACOES_MOVIMENTACOES_TURMA as notes,
        DATA_CRIACAO_MOVIMENTACOES_TURMA as created_at,
        DATA_DEVOLUCAO_MOVIMENTACOES_TURMA as returned_at
      FROM MOVIMENTACOES_TURMA ORDER BY DATA_CRIACAO_MOVIMENTACOES_TURMA DESC
    `);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      courseId: r.course_id,
      classId: r.class_id,
      turmaCode: r.turma_code,
      lessonPlanId: r.lesson_plan_id || undefined,
      lessonPlanName: r.lesson_plan_name || undefined,
      lessonNumber: r.lesson_number,
      teacherName: r.teacher_name,
      weaponBoxId: r.weapon_box_id || undefined,
      weaponBoxName: r.weapon_box_name || undefined,
      weaponIds: typeof r.weapon_ids === 'string' ? JSON.parse(r.weapon_ids) : (r.weapon_ids || []),
      caliberId: r.caliber_id || undefined,
      vaultSpaceId: r.vault_space_id || undefined,
      ammoSupplied: r.ammo_supplied || 0,
      studentCount: r.student_count || 0,
      shotsPerStudent: r.shots_per_student || 0,
      instructorShots: r.instructor_shots || 0,
      ammoUsed: r.ammo_used || 0,
      ammoReturned: r.ammo_returned || 0,
      extraMagazinesCount: r.extra_magazines_count || 0,
      status: r.status,
      notes: r.notes || undefined,
      returnedMaterials: r.returned_materials || undefined,
      issuedByUserName: r.issued_by_user_name,
      returnedByUserName: r.returned_by_user_name || undefined,
      createdAt: r.created_at,
      returnedAt: r.returned_at || undefined
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/course-movements/saida', async (req: Request, res: Response) => {
  try {
    const {
      courseId, classId, className, turmaCode, lessonPlanId, lessonPlanName, lessonNumber, teacherName,
      weaponBoxId, boxId, weaponBoxName, boxName, weaponIds, caliberId, ammoCaliber, vaultSpaceId, ammoStockId,
      ammoSupplied, ammoQuantity, studentCount, shotsPerStudent, instructorShots, ammoUsed,
      extraMagazinesCount, issuedByUserName, actor
    } = req.body;

    const pool = getPool();
    const id = `crs-mov-${Date.now()}`;

    const finalClassId = classId || req.body.class_id || '';
    const finalTurmaCode = turmaCode || className || req.body.turma_code || req.body.code || 'Turma';
    const finalTeacherName = teacherName || req.body.teacher_name || 'Professor';
    const finalBoxId = weaponBoxId || boxId || req.body.weapon_box_id || null;
    const finalBoxName = weaponBoxName || boxName || req.body.weapon_box_name || null;
    const finalAmmoSupplied = Number(ammoSupplied ?? ammoQuantity ?? req.body.ammo_supplied) || 0;
    const finalIssuedByUserName = issuedByUserName || req.body.issued_by_user_name || actor?.name || 'Armeiro';

    let finalCourseId = courseId || req.body.course_id || '';
    if (!finalCourseId && finalClassId) {
      try {
        const [cRows]: any = await pool.query('SELECT CURSO_ID_TURMAS_CURSO as course_id FROM TURMAS_CURSO WHERE ID_TURMAS_CURSO = ?', [finalClassId]);
        if (cRows && cRows.length > 0 && cRows[0].course_id) {
          finalCourseId = cRows[0].course_id;
        }
      } catch (e) {}
    }
    if (!finalCourseId) {
      finalCourseId = 'course-default';
    }

    let finalWeaponIds: string[] = Array.isArray(weaponIds) ? weaponIds : [];
    if (finalWeaponIds.length === 0 && finalBoxId) {
      const [boxes]: any = await pool.query('SELECT IDS_ARMAS_CAIXAS_ARMAS as weapon_ids FROM CAIXAS_ARMAS WHERE ID_CAIXAS_ARMAS = ?', [finalBoxId]);
      if (boxes && boxes.length > 0) {
        const rawIds = boxes[0].weapon_ids;
        finalWeaponIds = typeof rawIds === 'string' ? JSON.parse(rawIds) : (rawIds || []);
      }
    }

    const executeInsertMovement = async () => {
      await pool.query(
        `INSERT INTO MOVIMENTACOES_TURMA
          (ID_MOVIMENTACOES_TURMA, CURSO_ID_MOVIMENTACOES_TURMA, TURMA_ID_MOVIMENTACOES_TURMA, CODIGO_TURMA_MOVIMENTACOES_TURMA,
           PLANO_AULA_ID_MOVIMENTACOES_TURMA, NOME_PLANO_AULA_MOVIMENTACOES_TURMA, NUMERO_AULA_MOVIMENTACOES_TURMA, NOME_PROFESSOR_MOVIMENTACOES_TURMA,
           CAIXA_ARMAS_ID_MOVIMENTACOES_TURMA, NOME_CAIXA_ARMAS_MOVIMENTACOES_TURMA, IDS_ARMAS_MOVIMENTACOES_TURMA, CALIBRE_ID_MOVIMENTACOES_TURMA,
           COFRE_ID_MOVIMENTACOES_TURMA, MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA, QUANTIDADE_ALUNOS_MOVIMENTACOES_TURMA, TIROS_POR_ALUNO_MOVIMENTACOES_TURMA,
           TIROS_INSTRUTOR_MOVIMENTACOES_TURMA, MUNICAO_USADA_MOVIMENTACOES_TURMA, CARREGADORES_EXTRAS_MOVIMENTACOES_TURMA, STATUS_MOVIMENTACOES_TURMA,
           EMITIDO_POR_NOME_MOVIMENTACOES_TURMA, DATA_CRIACAO_MOVIMENTACOES_TURMA)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Em Aula', ?, NOW())`,
        [
          id,
          finalCourseId,
          finalClassId,
          finalTurmaCode,
          lessonPlanId || null,
          lessonPlanName || null,
          Number(lessonNumber) || 1,
          finalTeacherName,
          finalBoxId,
          finalBoxName,
          JSON.stringify(finalWeaponIds),
          caliberId || null,
          vaultSpaceId || null,
          finalAmmoSupplied,
          Number(studentCount) || 0,
          Number(shotsPerStudent) || 0,
          Number(instructorShots) || 0,
          Number(ammoUsed) || 0,
          Number(extraMagazinesCount) || 0,
          finalIssuedByUserName
        ]
      );
    };

    try {
      await executeInsertMovement();
    } catch (insertErr: any) {
      if (insertErr.message && (insertErr.message.includes('CURSO_ID_MOVIMENTACOES_TURMA') || insertErr.message.includes('cannot be null'))) {
        try { await pool.query('ALTER TABLE MOVIMENTACOES_TURMA MODIFY COLUMN CURSO_ID_MOVIMENTACOES_TURMA VARCHAR(64) NULL DEFAULT NULL;'); } catch (e) {}
        await executeInsertMovement();
      } else {
        throw insertErr;
      }
    }

    if (finalWeaponIds.length > 0) {
      const locNote = `Em Sala de Aula (${finalTurmaCode} - Prof. ${finalTeacherName})`;
      for (const wId of finalWeaponIds) {
        await pool.query(
          `UPDATE ARMAS SET STATUS_ARMAS = 'Em Sala de Aula', OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?`,
          [locNote, wId]
        );
      }
    }

    if (finalAmmoSupplied > 0) {
      let targetStock: any = null;

      if (ammoStockId) {
        const [stocks]: any = await pool.query('SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [ammoStockId]);
        if (stocks && stocks.length > 0) targetStock = stocks[0];
      }

      if (!targetStock && vaultSpaceId) {
        const calName = ammoCaliber || req.body.ammoCaliber || '';
        const [stocks]: any = await pool.query(
          `SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR CALIBRE_ID_ESTOQUE_MUNICOES IN (SELECT ID_CALIBRES FROM CALIBRES WHERE ID_CALIBRES = ? OR NOME_CALIBRES = ?))`,
          [vaultSpaceId, caliberId || '', caliberId || '', calName]
        );
        if (stocks && stocks.length > 0) {
          targetStock = stocks[0];
        } else {
          const [vStocks]: any = await pool.query('SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ?', [vaultSpaceId]);
          if (vStocks && vStocks.length > 0) targetStock = vStocks[0];
        }
      }

      if (targetStock) {
        const newQty = Math.max(0, targetStock.quantity - finalAmmoSupplied);
        await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [newQty, targetStock.id]);

        // Register movement in MOVIMENTACOES_MUNICOES as (Aula CFTP)
        try {
          const ammoMovId = `ammo-mov-${Date.now()}`;
          await pool.query(
            `INSERT INTO MOVIMENTACOES_MUNICOES (
              ID_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES,
              TIPO_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES,
              NOME_USUARIO_MOVIMENTACOES_MUNICOES, DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES
             ) VALUES (?, ?, ?, 'Saída', ?, ?, ?, ?, NOW())`,
            [
              ammoMovId,
              targetStock.caliber_id || caliberId || '',
              targetStock.vault_space_id || vaultSpaceId || null,
              finalAmmoSupplied,
              `(Aula CFTP) - Turma ${finalTurmaCode} (Prof. ${finalTeacherName})`,
              finalIssuedByUserName,
              targetStock.department_id || null
            ]
          );
        } catch (mErr) {
          console.error('Erro ao registrar MOVIMENTACOES_MUNICOES para Aula CFTP:', mErr);
        }
      }
    }

    await insertAuditLog('Cursos', 'Solicitar', `Saída (Aula CFTP) da Turma ${finalTurmaCode} (Aula ${lessonNumber || 1}) - Caixa: ${finalBoxName || 'N/A'}, Munições: ${finalAmmoSupplied} un`, actor, req.ip);

    return res.json({ id, success: true });
  } catch (err: any) {
    console.error('Erro em POST /course-movements/saida:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/course-movements/:id/retorno', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ammoReturned, ammoUsed, returnedMaterials, notes, returnedByUserName, actor } = req.body;

    const pool = getPool();
    const [movs]: any = await pool.query(`
      SELECT 
        ID_MOVIMENTACOES_TURMA as id,
        CODIGO_TURMA_MOVIMENTACOES_TURMA as turma_code,
        NUMERO_AULA_MOVIMENTACOES_TURMA as lesson_number,
        IDS_ARMAS_MOVIMENTACOES_TURMA as weapon_ids,
        MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA as ammo_supplied,
        COFRE_ID_MOVIMENTACOES_TURMA as vault_space_id,
        CALIBRE_ID_MOVIMENTACOES_TURMA as caliber_id
      FROM MOVIMENTACOES_TURMA WHERE ID_MOVIMENTACOES_TURMA = ?
    `, [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação de curso não encontrada' });
    const mov = movs[0];

    const wIds: string[] = typeof mov.weapon_ids === 'string' ? JSON.parse(mov.weapon_ids) : (mov.weapon_ids || []);

    if (Array.isArray(wIds) && wIds.length > 0) {
      for (const wId of wIds) {
        await pool.query(
          `UPDATE ARMAS SET STATUS_ARMAS = 'No Cofre', OBSERVACAO_LOCALIZACAO_ARMAS = NULL WHERE ID_ARMAS = ?`,
          [wId]
        );
      }
    }

    const calcAmmoReturned = ammoReturned !== undefined ? Number(ammoReturned) : Math.max(0, (mov.ammo_supplied || 0) - (Number(ammoUsed) || 0));
    const calcAmmoUsed = ammoUsed !== undefined ? Number(ammoUsed) : Math.max(0, (mov.ammo_supplied || 0) - calcAmmoReturned);

    if (calcAmmoReturned > 0 && mov.vault_space_id && mov.caliber_id) {
      const [stocks]: any = await pool.query('SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?', [mov.vault_space_id, mov.caliber_id]);
      if (stocks && stocks.length > 0) {
        const newQty = stocks[0].quantity + calcAmmoReturned;
        await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [newQty, stocks[0].id]);
      }
    }

    await pool.query(
      `UPDATE MOVIMENTACOES_TURMA
       SET STATUS_MOVIMENTACOES_TURMA = 'Finalizada',
           MUNICAO_USADA_MOVIMENTACOES_TURMA = ?,
           MUNICAO_DEVOLVIDA_MOVIMENTACOES_TURMA = ?,
           MATERIAIS_DEVOLVIDOS_MOVIMENTACOES_TURMA = ?,
           OBSERVACOES_MOVIMENTACOES_TURMA = COALESCE(?, OBSERVACOES_MOVIMENTACOES_TURMA),
           DEVOLVIDO_POR_NOME_MOVIMENTACOES_TURMA = ?,
           DATA_DEVOLUCAO_MOVIMENTACOES_TURMA = NOW()
       WHERE ID_MOVIMENTACOES_TURMA = ?`,
      [
        calcAmmoUsed,
        calcAmmoReturned,
        returnedMaterials || null,
        notes ? notes.trim() : null,
        returnedByUserName || actor?.name || 'Armeiro',
        id
      ]
    );

    await insertAuditLog('Cursos', 'Devolver', `Retorno da aula Turma ${mov.turma_code} (Aula ${mov.lesson_number}) - Munição devolvida ao cofre: ${ammoReturned} un`, actor, req.ip);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/course-movements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { teacherName, lessonNumber, lessonPlanName, ammoSupplied, notes, actor } = req.body;
    const pool = getPool();
    await pool.query(
      `UPDATE MOVIMENTACOES_TURMA SET
         NOME_PROFESSOR_MOVIMENTACOES_TURMA = COALESCE(?, NOME_PROFESSOR_MOVIMENTACOES_TURMA),
         NUMERO_AULA_MOVIMENTACOES_TURMA = COALESCE(?, NUMERO_AULA_MOVIMENTACOES_TURMA),
         NOME_PLANO_AULA_MOVIMENTACOES_TURMA = COALESCE(?, NOME_PLANO_AULA_MOVIMENTACOES_TURMA),
         MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA = COALESCE(?, MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA),
         OBSERVACOES_MOVIMENTACOES_TURMA = COALESCE(?, OBSERVACOES_MOVIMENTACOES_TURMA)
       WHERE ID_MOVIMENTACOES_TURMA = ?`,
      [
        teacherName || null,
        lessonNumber || null,
        lessonPlanName || null,
        ammoSupplied !== undefined ? Number(ammoSupplied) : null,
        notes !== undefined ? notes : null,
        id
      ]
    );
    await insertAuditLog('Cursos', 'Editar', `Atualizado Mapa de Aula ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/course-movements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    const pool = getPool();

    const [movs]: any = await pool.query(`
      SELECT 
        ID_MOVIMENTACOES_TURMA as id,
        IDS_ARMAS_MOVIMENTACOES_TURMA as weapon_ids,
        MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA as ammo_provided,
        COFRE_ID_MOVIMENTACOES_TURMA as vault_space_id,
        CALIBRE_ID_MOVIMENTACOES_TURMA as caliber_id
      FROM MOVIMENTACOES_TURMA WHERE ID_MOVIMENTACOES_TURMA = ?
    `, [id]);
    if (movs && movs.length > 0) {
      const mov = movs[0];
      if (mov.status === 'Em Aula' || mov.status === 'Em Sala de Aula') {
        const wIds: string[] = typeof mov.weapon_ids === 'string' ? JSON.parse(mov.weapon_ids) : (mov.weapon_ids || []);
        if (Array.isArray(wIds) && wIds.length > 0) {
          for (const wId of wIds) {
            await pool.query(`UPDATE ARMAS SET STATUS_ARMAS = 'No Cofre', OBSERVACAO_LOCALIZACAO_ARMAS = NULL WHERE ID_ARMAS = ?`, [wId]);
          }
        }
      }
      await pool.query('DELETE FROM MOVIMENTACOES_TURMA WHERE ID_MOVIMENTACOES_TURMA = ?', [id]);
      await insertAuditLog('Cursos', 'Excluir', `Excluído Mapa de Aula ID ${id}`, actor, req.ip);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 15. ALUNO TURMA & ALUNO AULAS ENDPOINTS
// ==========================================

// Helper function to recalculate class student_count
async function syncClassStudentCount(pool: any, classId: string) {
  if (!classId) return;
  try {
    const [rows]: any = await pool.query('SELECT COUNT(*) as total FROM ALUNO_TURMA WHERE TURMA_ID_ALUNO_TURMA = ?', [classId]);
    const total = rows && rows[0] ? Number(rows[0].total) || 0 : 0;
    await pool.query('UPDATE TURMAS_CURSO SET QUANTIDADE_ALUNOS_TURMAS_CURSO = ? WHERE ID_TURMAS_CURSO = ?', [total, classId]);
  } catch (e) {
    console.error('Error syncing class student_count:', e);
  }
}

// GET /aluno-turma
apiRouter.get('/aluno-turma', async (req: Request, res: Response) => {
  try {
    const { turmaId, turmaCode } = req.query;
    const pool = getPool();
    let query = `
      SELECT 
        ID_ALUNO_TURMA as id,
        TURMA_ID_ALUNO_TURMA as turma_id,
        TURMA_ALUNO_ALUNO_TURMA as turma_aluno,
        MODULO_ALUNO_ALUNO_TURMA as modulo_aluno,
        PROFESSOR_ALUNO_ALUNO_TURMA as professor_aluno,
        INSTRUTOR1_ALUNO_ALUNO_TURMA as instrutor1_aluno,
        INSTRUTOR2_ALUNO_ALUNO_TURMA as instrutor2_aluno,
        INSTRUTOR3_ALUNO_ALUNO_TURMA as instrutor3_aluno,
        INSTRUTOR4_ALUNO_ALUNO_TURMA as instrutor4_aluno,
        MASP_ALUNO_ALUNO_TURMA as masp_aluno,
        NOME_ALUNO_ALUNO_TURMA as nome_aluno,
        SITUACAO_ALUNO_ALUNO_TURMA as situacao_aluno,
        DEPARTAMENTO_ALUNO_ALUNO_TURMA as departamento_aluno,
        DATA_CRIACAO_ALUNO_TURMA as created_at,
        DATA_ATUALIZACAO_ALUNO_TURMA as updated_at
      FROM ALUNO_TURMA
    `;
    let params: any[] = [];

    if (turmaId) {
      query += ' WHERE turma_id = ?';
      params.push(String(turmaId));
    } else if (turmaCode) {
      query += ' WHERE turma_aluno = ?';
      params.push(String(turmaCode));
    }
    query += ' ORDER BY nome_aluno ASC';

    const [rows]: any = await pool.query(query, params);

    // Get aulas for each student
    const studentIds = (rows || []).map((r: any) => r.id);
    let aulasMap: Record<string, any[]> = {};
    if (studentIds.length > 0) {
      try {
        const [aulasRows]: any = await pool.query(
          `SELECT 
        ID_ALUNO_AULAS as id,
        ALUNO_ID_ALUNO_AULAS as aluno_id,
        AULA_NOME_ALUNO_ALUNO_AULAS as aula_nome_aluno,
        AULA_NUMERO_ALUNO_ALUNO_AULAS as aula_numero_aluno,
        AULA_DATA_ALUNO_ALUNO_AULAS as aula_data_aluno,
        AULA_HORA_ALUNO_ALUNO_AULAS as aula_hora_aluno,
        AULA_CONTEUDO_ALUNO_ALUNO_AULAS as aula_conteudo_aluno,
        OBSERVACAO_ALUNO_ALUNO_AULAS as observacao_aluno,
        NOTA_ALUNO_ALUNO_AULAS as nota_aluno,
        DATA_CRIACAO_ALUNO_AULAS as created_at,
        DATA_ATUALIZACAO_ALUNO_AULAS as updated_at
      FROM ALUNO_AULAS WHERE ALUNO_ID_ALUNO_AULAS IN (${studentIds.map(() => '?').join(',')}) ORDER BY AULA_NUMERO_ALUNO_ALUNO_AULAS ASC`,
          studentIds
        );
        (aulasRows || []).forEach((a: any) => {
          if (!aulasMap[a.aluno_id]) aulasMap[a.aluno_id] = [];
          aulasMap[a.aluno_id].push({
            id: a.id,
            alunoId: a.aluno_id,
            aulaNomeAluno: a.aula_nome_aluno,
            aulaNumeroAluno: a.aula_numero_aluno,
            aulaDataAluno: a.aula_data_aluno ? String(a.aula_data_aluno).split('T')[0] : undefined,
            aulaHoraAluno: a.aula_hora_aluno,
            aulaConteudoAluno: a.aula_conteudo_aluno,
            observacaoAluno: a.observacao_aluno,
            notaAluno: a.nota_aluno,
            createdAt: a.created_at,
            updatedAt: a.updated_at
          });
        });
      } catch (e) {}
    }

    const result = (rows || []).map((r: any) => ({
      id: r.id,
      turmaId: r.turma_id,
      turmaAluno: r.turma_aluno,
      moduloAluno: r.modulo_aluno,
      professorAluno: r.professor_aluno,
      instrutor1Aluno: r.instrutor1_aluno,
      instrutor2Aluno: r.instrutor2_aluno,
      instrutor3Aluno: r.instrutor3_aluno,
      instrutor4Aluno: r.instrutor4_aluno,
      maspAluno: r.masp_aluno,
      nomeAluno: r.nome_aluno,
      situacaoAluno: r.situacao_aluno,
      departamentoAluno: r.departamento_aluno,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      aulas: aulasMap[r.id] || []
    }));

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /course-classes/:id/students (List students for specific course class)
apiRouter.get('/course-classes/:id/students', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    // Get class details
    const [clsRows]: any = await pool.query('SELECT ID_TURMAS_CURSO as id, CODIGO_TURMAS_CURSO as turma_code, NUMERO_TURMA_TURMAS_CURSO as turma_number, CARREIRA_TURMAS_CURSO as career, DISCIPLINA_TURMAS_CURSO as subject, NOME_PROFESSOR_TURMAS_CURSO as teacher_name FROM TURMAS_CURSO WHERE ID_TURMAS_CURSO = ?', [id]);
    const cls = clsRows && clsRows.length > 0 ? clsRows[0] : null;

    let rows: any = [];
    if (cls) {
      const clsCode = cls.code || `${cls.career_abbreviation || 'DL'}-${cls.turma_number || '01'}`;
      const altCode = clsCode.replace('-', ' ');
      [rows] = await pool.query(
        `SELECT 
        ID_ALUNO_TURMA as id,
        TURMA_ID_ALUNO_TURMA as turma_id,
        TURMA_ALUNO_ALUNO_TURMA as turma_aluno,
        MODULO_ALUNO_ALUNO_TURMA as modulo_aluno,
        PROFESSOR_ALUNO_ALUNO_TURMA as professor_aluno,
        INSTRUTOR1_ALUNO_ALUNO_TURMA as instrutor1_aluno,
        INSTRUTOR2_ALUNO_ALUNO_TURMA as instrutor2_aluno,
        INSTRUTOR3_ALUNO_ALUNO_TURMA as instrutor3_aluno,
        INSTRUTOR4_ALUNO_ALUNO_TURMA as instrutor4_aluno,
        MASP_ALUNO_ALUNO_TURMA as masp_aluno,
        NOME_ALUNO_ALUNO_TURMA as nome_aluno,
        SITUACAO_ALUNO_ALUNO_TURMA as situacao_aluno,
        DEPARTAMENTO_ALUNO_ALUNO_TURMA as departamento_aluno,
        DATA_CRIACAO_ALUNO_TURMA as created_at,
        DATA_ATUALIZACAO_ALUNO_TURMA as updated_at
      FROM ALUNO_TURMA WHERE TURMA_ID_ALUNO_TURMA = ? OR TURMA_ALUNO_ALUNO_TURMA = ? OR TURMA_ALUNO_ALUNO_TURMA = ? ORDER BY NOME_ALUNO_ALUNO_TURMA ASC`,
        [id, clsCode, altCode]
      );
    } else {
      [rows] = await pool.query(
        `SELECT 
        ID_ALUNO_TURMA as id,
        TURMA_ID_ALUNO_TURMA as turma_id,
        TURMA_ALUNO_ALUNO_TURMA as turma_aluno,
        MODULO_ALUNO_ALUNO_TURMA as modulo_aluno,
        PROFESSOR_ALUNO_ALUNO_TURMA as professor_aluno,
        INSTRUTOR1_ALUNO_ALUNO_TURMA as instrutor1_aluno,
        INSTRUTOR2_ALUNO_ALUNO_TURMA as instrutor2_aluno,
        INSTRUTOR3_ALUNO_ALUNO_TURMA as instrutor3_aluno,
        INSTRUTOR4_ALUNO_ALUNO_TURMA as instrutor4_aluno,
        MASP_ALUNO_ALUNO_TURMA as masp_aluno,
        NOME_ALUNO_ALUNO_TURMA as nome_aluno,
        SITUACAO_ALUNO_ALUNO_TURMA as situacao_aluno,
        DEPARTAMENTO_ALUNO_ALUNO_TURMA as departamento_aluno,
        DATA_CRIACAO_ALUNO_TURMA as created_at,
        DATA_ATUALIZACAO_ALUNO_TURMA as updated_at
      FROM ALUNO_TURMA WHERE TURMA_ID_ALUNO_TURMA = ? OR TURMA_ALUNO_ALUNO_TURMA = ? ORDER BY NOME_ALUNO_ALUNO_TURMA ASC`,
        [id, id]
      );
    }

    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      turmaId: r.turma_id || id,
      turmaAluno: r.turma_aluno,
      moduloAluno: r.modulo_aluno,
      professorAluno: r.professor_aluno,
      instrutor1Aluno: r.instrutor1_aluno,
      instrutor2Aluno: r.instrutor2_aluno,
      instrutor3Aluno: r.instrutor3_aluno,
      instrutor4Aluno: r.instrutor4_aluno,
      maspAluno: r.masp_aluno,
      nomeAluno: r.nome_aluno,
      situacaoAluno: r.situacao_aluno || 'Ativo',
      departamentoAluno: r.departamento_aluno
    }));

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /course-students/:id/lessons
apiRouter.get('/course-students/:id/lessons', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_ALUNO_AULAS as id,
        ALUNO_ID_ALUNO_AULAS as aluno_id,
        AULA_NOME_ALUNO_ALUNO_AULAS as aula_nome_aluno,
        AULA_NUMERO_ALUNO_ALUNO_AULAS as aula_numero_aluno,
        AULA_DATA_ALUNO_ALUNO_AULAS as aula_data_aluno,
        AULA_HORA_ALUNO_ALUNO_AULAS as aula_hora_aluno,
        AULA_CONTEUDO_ALUNO_ALUNO_AULAS as aula_conteudo_aluno,
        OBSERVACAO_ALUNO_ALUNO_AULAS as observacao_aluno,
        NOTA_ALUNO_ALUNO_AULAS as nota_aluno,
        DATA_CRIACAO_ALUNO_AULAS as created_at,
        DATA_ATUALIZACAO_ALUNO_AULAS as updated_at
      FROM ALUNO_AULAS WHERE ALUNO_ID_ALUNO_AULAS = ? ORDER BY AULA_NUMERO_ALUNO_ALUNO_AULAS ASC
    `, [id]);
    const mapped = (rows || []).map((a: any) => ({
      id: a.id,
      alunoId: a.aluno_id,
      aulaNomeAluno: a.aula_nome_aluno,
      aulaNumeroAluno: a.aula_numero_aluno,
      aulaDataAluno: a.aula_data_aluno ? String(a.aula_data_aluno).split('T')[0] : undefined,
      aulaHoraAluno: a.aula_hora_aluno,
      aulaConteudoAluno: a.aula_conteudo_aluno,
      observacaoAluno: a.observacao_aluno,
      notaAluno: a.nota_aluno,
      createdAt: a.created_at,
      updatedAt: a.updated_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /course-students/:id/lessons
apiRouter.post('/course-students/:id/lessons', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { aulaNomeAluno, aulaNumeroAluno, aulaDataAluno, aulaHoraAluno, aulaConteudoAluno, observacaoAluno, notaAluno } = req.body;
    const pool = getPool();
    const targetAulaId = `aula-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const truncatedConteudo = aulaConteudoAluno ? String(aulaConteudoAluno).slice(0, 500) : null;

    await pool.query(
      `INSERT INTO ALUNO_AULAS (ID_ALUNO_AULAS, ALUNO_ID_ALUNO_AULAS, AULA_NOME_ALUNO_ALUNO_AULAS, AULA_NUMERO_ALUNO_ALUNO_AULAS, AULA_DATA_ALUNO_ALUNO_AULAS, AULA_HORA_ALUNO_ALUNO_AULAS, AULA_CONTEUDO_ALUNO_ALUNO_AULAS, OBSERVACAO_ALUNO_ALUNO_AULAS, NOTA_ALUNO_ALUNO_AULAS, DATA_CRIACAO_ALUNO_AULAS)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        targetAulaId,
        id,
        aulaNomeAluno || 'Aula',
        Number(aulaNumeroAluno) || 1,
        aulaDataAluno || null,
        aulaHoraAluno || null,
        truncatedConteudo,
        observacaoAluno || null,
        notaAluno || null
      ]
    );
    return res.json({ success: true, id: targetAulaId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /student-lessons/:id
apiRouter.put('/student-lessons/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { aulaNomeAluno, aulaNumeroAluno, aulaDataAluno, aulaHoraAluno, aulaConteudoAluno, observacaoAluno, notaAluno } = req.body;
    const pool = getPool();
    const truncatedConteudo = aulaConteudoAluno ? String(aulaConteudoAluno).slice(0, 500) : null;

    await pool.query(
      `UPDATE ALUNO_AULAS SET
         AULA_NOME_ALUNO_ALUNO_AULAS = COALESCE(?, AULA_NOME_ALUNO_ALUNO_AULAS),
         AULA_NUMERO_ALUNO_ALUNO_AULAS = COALESCE(?, AULA_NUMERO_ALUNO_ALUNO_AULAS),
         AULA_DATA_ALUNO_ALUNO_AULAS = COALESCE(?, AULA_DATA_ALUNO_ALUNO_AULAS),
         AULA_HORA_ALUNO_ALUNO_AULAS = COALESCE(?, AULA_HORA_ALUNO_ALUNO_AULAS),
         AULA_CONTEUDO_ALUNO_ALUNO_AULAS = COALESCE(?, AULA_CONTEUDO_ALUNO_ALUNO_AULAS),
         OBSERVACAO_ALUNO_ALUNO_AULAS = COALESCE(?, OBSERVACAO_ALUNO_ALUNO_AULAS),
         NOTA_ALUNO_ALUNO_AULAS = COALESCE(?, NOTA_ALUNO_ALUNO_AULAS),
         DATA_ATUALIZACAO_ALUNO_AULAS = NOW()
       WHERE ID_ALUNO_AULAS = ?`,
      [
        aulaNomeAluno || null,
        aulaNumeroAluno ? Number(aulaNumeroAluno) : null,
        aulaDataAluno || null,
        aulaHoraAluno || null,
        truncatedConteudo,
        observacaoAluno || null,
        notaAluno || null,
        id
      ]
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /student-lessons/:id
apiRouter.delete('/student-lessons/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    await pool.query('DELETE FROM ALUNO_AULAS WHERE ID_ALUNO_AULAS = ?', [id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /course-students/:id/transfer
apiRouter.put('/course-students/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newTurmaId, newClassId } = req.body;
    const targetClassId = newTurmaId || newClassId;
    const pool = getPool();

    const [clsRows]: any = await pool.query('SELECT ID_TURMAS_CURSO as id, CODIGO_TURMAS_CURSO as turma_code, NUMERO_TURMA_TURMAS_CURSO as turma_number, CARREIRA_TURMAS_CURSO as career, DISCIPLINA_TURMAS_CURSO as subject, NOME_PROFESSOR_TURMAS_CURSO as teacher_name FROM TURMAS_CURSO WHERE ID_TURMAS_CURSO = ?', [targetClassId]);
    if (!clsRows || clsRows.length === 0) return res.status(404).json({ error: 'Turma não encontrada' });
    const newCls = clsRows[0];

    const [stuRows]: any = await pool.query('SELECT ID_ALUNO_TURMA as id, NOME_ALUNO_ALUNO_TURMA as nome_aluno, TURMA_ID_ALUNO_TURMA as turma_id, TURMA_ALUNO_ALUNO_TURMA as turma_aluno FROM ALUNO_TURMA WHERE ID_ALUNO_TURMA = ?', [id]);
    if (!stuRows || stuRows.length === 0) return res.status(404).json({ error: 'Aluno não encontrado' });
    const oldClassId = stuRows[0].turma_id;

    await pool.query(
      `UPDATE ALUNO_TURMA SET
         TURMA_ID_ALUNO_TURMA = ?,
         TURMA_ALUNO_ALUNO_TURMA = ?,
         PROFESSOR_ALUNO_ALUNO_TURMA = ?,
         DATA_ATUALIZACAO_ALUNO_TURMA = NOW()
       WHERE ID_ALUNO_TURMA = ?`,
      [
        newCls.id,
        newCls.code || `${newCls.career_abbreviation || 'DL'}-${newCls.turma_number || '01'}`,
        newCls.teacher_name || null,
        id
      ]
    );

    if (oldClassId) await syncClassStudentCount(pool, oldClassId);
    await syncClassStudentCount(pool, newCls.id);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /aluno-turma (Cadastrar aluno ou bloco de alunos na turma)
apiRouter.post('/aluno-turma', async (req: Request, res: Response) => {
  try {
    const { turmaId, names, name, masp, actor } = req.body;
    if (!turmaId) {
      return res.status(400).json({ error: 'ID da turma (turmaId) é obrigatório.' });
    }

    const pool = getPool();

    // Fetch class info
    const [clsRows]: any = await pool.query('SELECT ID_TURMAS_CURSO as id, CURSO_ID_TURMAS_CURSO as course_id, CODIGO_TURMAS_CURSO as turma_code, NUMERO_TURMA_TURMAS_CURSO as turma_number, CARREIRA_TURMAS_CURSO as career, DISCIPLINA_TURMAS_CURSO as subject, NOME_PROFESSOR_TURMAS_CURSO as teacher_name FROM TURMAS_CURSO WHERE ID_TURMAS_CURSO = ?', [turmaId]);
    if (!clsRows || clsRows.length === 0) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }
    const cls = clsRows[0];

    // Fetch linked course code if possible
    let moduloCode = cls.course_id || '';
    if (cls.course_id) {
      try {
        const [crsRows]: any = await pool.query('SELECT CODIGO_CURSOS_ACADEMIA as code, NOME_CURSOS_ACADEMIA as name FROM CURSOS_ACADEMIA WHERE ID_CURSOS_ACADEMIA = ? OR CODIGO_CURSOS_ACADEMIA = ?', [cls.course_id, cls.course_id]);
        if (crsRows && crsRows.length > 0) {
          moduloCode = crsRows[0].code || crsRows[0].name || cls.course_id;
        }
      } catch (e) {}
    }

    // Process list of names
    let studentNames: string[] = [];
    if (Array.isArray(names)) {
      studentNames = names.map(n => String(n).trim()).filter(Boolean);
    } else if (typeof names === 'string') {
      studentNames = names.split('\n').map(n => n.trim()).filter(Boolean);
    } else if (name) {
      studentNames = [String(name).trim()];
    }

    if (studentNames.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos o nome de um aluno.' });
    }

    const insertedIds: string[] = [];
    for (const studentName of studentNames) {
      const studentId = `stu-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await pool.query(
        `INSERT INTO ALUNO_TURMA (ID_ALUNO_TURMA, TURMA_ID_ALUNO_TURMA, TURMA_ALUNO_ALUNO_TURMA, MODULO_ALUNO_ALUNO_TURMA, PROFESSOR_ALUNO_ALUNO_TURMA, MASP_ALUNO_ALUNO_TURMA, NOME_ALUNO_ALUNO_TURMA, SITUACAO_ALUNO_ALUNO_TURMA, DEPARTAMENTO_ALUNO_ALUNO_TURMA, DATA_CRIACAO_ALUNO_TURMA)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Ativo', ?, NOW())`,
        [
          studentId,
          cls.id,
          cls.code || `${cls.career_abbreviation || 'DL'}-${cls.turma_number || '01'}`,
          moduloCode,
          cls.teacher_name || null,
          masp || null,
          studentName,
          cls.department_id || 'ACADEMIA DE POLICIA'
        ]
      );
      insertedIds.push(studentId);
    }

    // Sync student_count in course_classes
    await syncClassStudentCount(pool, cls.id);

    await insertAuditLog('Cursos', 'Criar', `Cadastrado(s) ${studentNames.length} aluno(s) na turma ${cls.code}`, actor, req.ip);

    return res.json({ success: true, count: studentNames.length, insertedIds });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /aluno-turma/:id
apiRouter.put('/aluno-turma/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nomeAluno, maspAluno, situacaoAluno, instrutor1Aluno, instrutor2Aluno, instrutor3Aluno, instrutor4Aluno, actor } = req.body;
    const pool = getPool();

    await pool.query(
      `UPDATE ALUNO_TURMA SET
         NOME_ALUNO_ALUNO_TURMA = COALESCE(?, NOME_ALUNO_ALUNO_TURMA),
         MASP_ALUNO_ALUNO_TURMA = COALESCE(?, MASP_ALUNO_ALUNO_TURMA),
         SITUACAO_ALUNO_ALUNO_TURMA = COALESCE(?, SITUACAO_ALUNO_ALUNO_TURMA),
         INSTRUTOR1_ALUNO_ALUNO_TURMA = COALESCE(?, INSTRUTOR1_ALUNO_ALUNO_TURMA),
         INSTRUTOR2_ALUNO_ALUNO_TURMA = COALESCE(?, INSTRUTOR2_ALUNO_ALUNO_TURMA),
         INSTRUTOR3_ALUNO_ALUNO_TURMA = COALESCE(?, INSTRUTOR3_ALUNO_ALUNO_TURMA),
         INSTRUTOR4_ALUNO_ALUNO_TURMA = COALESCE(?, INSTRUTOR4_ALUNO_ALUNO_TURMA),
         DATA_ATUALIZACAO_ALUNO_TURMA = NOW()
       WHERE ID_ALUNO_TURMA = ?`,
      [
        nomeAluno || null,
        maspAluno || null,
        situacaoAluno || null,
        instrutor1Aluno || null,
        instrutor2Aluno || null,
        instrutor3Aluno || null,
        instrutor4Aluno || null,
        id
      ]
    );

    await insertAuditLog('Cursos', 'Editar', `Atualizado cadastro do aluno ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /aluno-turma/:id
apiRouter.delete('/aluno-turma/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    const pool = getPool();

    const [rows]: any = await pool.query('SELECT ID_ALUNO_TURMA as id, NOME_ALUNO_ALUNO_TURMA as nome_aluno, TURMA_ID_ALUNO_TURMA as turma_id, TURMA_ALUNO_ALUNO_TURMA as turma_aluno FROM ALUNO_TURMA WHERE ID_ALUNO_TURMA = ?', [id]);
    if (rows && rows.length > 0) {
      const student = rows[0];
      await pool.query('DELETE FROM ALUNO_AULAS WHERE ALUNO_ID_ALUNO_AULAS = ?', [id]);
      await pool.query('DELETE FROM ALUNO_TURMA WHERE ID_ALUNO_TURMA = ?', [id]);
      if (student.turma_id) {
        await syncClassStudentCount(pool, student.turma_id);
      }
      await insertAuditLog('Cursos', 'Excluir', `Excluído aluno ${student.nome_aluno} da turma ${student.turma_aluno}`, actor, req.ip);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /aluno-turma/:id/transfer (Transferir aluno de turma)
apiRouter.post('/aluno-turma/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newClassId, actor } = req.body;
    if (!newClassId) {
      return res.status(400).json({ error: 'Nova turma (newClassId) é obrigatória.' });
    }

    const pool = getPool();

    const [stuRows]: any = await pool.query('SELECT ID_ALUNO_TURMA as id, NOME_ALUNO_ALUNO_TURMA as nome_aluno, TURMA_ID_ALUNO_TURMA as turma_id, TURMA_ALUNO_ALUNO_TURMA as turma_aluno FROM ALUNO_TURMA WHERE ID_ALUNO_TURMA = ?', [id]);
    if (!stuRows || stuRows.length === 0) {
      return res.status(404).json({ error: 'Aluno não encontrado.' });
    }
    const student = stuRows[0];
    const oldClassId = student.turma_id;

    // Fetch new class info
    const [clsRows]: any = await pool.query('SELECT ID_TURMAS_CURSO as id, CURSO_ID_TURMAS_CURSO as course_id, CODIGO_TURMAS_CURSO as turma_code, NUMERO_TURMA_TURMAS_CURSO as turma_number, CARREIRA_TURMAS_CURSO as career, DISCIPLINA_TURMAS_CURSO as subject, NOME_PROFESSOR_TURMAS_CURSO as teacher_name FROM TURMAS_CURSO WHERE ID_TURMAS_CURSO = ?', [newClassId]);
    if (!clsRows || clsRows.length === 0) {
      return res.status(404).json({ error: 'Nova turma não encontrada.' });
    }
    const newCls = clsRows[0];

    // Fetch new course code
    let moduloCode = newCls.course_id || '';
    if (newCls.course_id) {
      try {
        const [crsRows]: any = await pool.query('SELECT CODIGO_CURSOS_ACADEMIA as code, NOME_CURSOS_ACADEMIA as name FROM CURSOS_ACADEMIA WHERE ID_CURSOS_ACADEMIA = ? OR CODIGO_CURSOS_ACADEMIA = ?', [newCls.course_id, newCls.course_id]);
        if (crsRows && crsRows.length > 0) {
          moduloCode = crsRows[0].code || crsRows[0].name || newCls.course_id;
        }
      } catch (e) {}
    }

    // Update student's class association while retaining all existing lessons/grades
    await pool.query(
      `UPDATE ALUNO_TURMA SET
         TURMA_ID_ALUNO_TURMA = ?,
         TURMA_ALUNO_ALUNO_TURMA = ?,
         MODULO_ALUNO_ALUNO_TURMA = ?,
         PROFESSOR_ALUNO_ALUNO_TURMA = ?,
         DEPARTAMENTO_ALUNO_ALUNO_TURMA = ?,
         DATA_ATUALIZACAO_ALUNO_TURMA = NOW()
       WHERE ID_ALUNO_TURMA = ?`,
      [
        newCls.id,
        newCls.code || `${newCls.career_abbreviation || 'DL'}-${newCls.turma_number || '01'}`,
        moduloCode,
        newCls.teacher_name || null,
        newCls.department_id || 'ACADEMIA DE POLICIA',
        id
      ]
    );

    // Sync student_count for both old and new class
    if (oldClassId) await syncClassStudentCount(pool, oldClassId);
    await syncClassStudentCount(pool, newCls.id);

    await insertAuditLog('Cursos', 'Transferir', `Transferido aluno ${student.nome_aluno} da turma ${student.turma_aluno} para ${newCls.code}`, actor, req.ip);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /aluno-turma/:id/aulas (Listar aulas do aluno)
apiRouter.get('/aluno-turma/:id/aulas', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_ALUNO_AULAS as id,
        ALUNO_ID_ALUNO_AULAS as aluno_id,
        AULA_NOME_ALUNO_ALUNO_AULAS as aula_nome_aluno,
        AULA_NUMERO_ALUNO_ALUNO_AULAS as aula_numero_aluno,
        AULA_DATA_ALUNO_ALUNO_AULAS as aula_data_aluno,
        AULA_HORA_ALUNO_ALUNO_AULAS as aula_hora_aluno,
        AULA_CONTEUDO_ALUNO_ALUNO_AULAS as aula_conteudo_aluno,
        OBSERVACAO_ALUNO_ALUNO_AULAS as observacao_aluno,
        NOTA_ALUNO_ALUNO_AULAS as nota_aluno,
        DATA_CRIACAO_ALUNO_AULAS as created_at,
        DATA_ATUALIZACAO_ALUNO_AULAS as updated_at
      FROM ALUNO_AULAS WHERE ALUNO_ID_ALUNO_AULAS = ? ORDER BY AULA_NUMERO_ALUNO_ALUNO_AULAS ASC
    `, [id]);
    const mapped = (rows || []).map((a: any) => ({
      id: a.id,
      alunoId: a.aluno_id,
      aulaNomeAluno: a.aula_nome_aluno,
      aulaNumeroAluno: a.aula_numero_aluno,
      aulaDataAluno: a.aula_data_aluno ? String(a.aula_data_aluno).split('T')[0] : undefined,
      aulaHoraAluno: a.aula_hora_aluno,
      aulaConteudoAluno: a.aula_conteudo_aluno,
      observacaoAluno: a.observacao_aluno,
      notaAluno: a.nota_aluno,
      createdAt: a.created_at,
      updatedAt: a.updated_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /aluno-turma/:id/aulas (Cadastrar / Atualizar aula do aluno)
apiRouter.post('/aluno-turma/:id/aulas', async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // aluno_id
    const { aulaId, aulaNomeAluno, aulaNumeroAluno, aulaDataAluno, aulaHoraAluno, aulaConteudoAluno, observacaoAluno, notaAluno, actor } = req.body;

    if (!aulaNomeAluno) {
      return res.status(400).json({ error: 'Nome da aula é obrigatório.' });
    }

    const pool = getPool();
    const targetAulaId = aulaId || `aula-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const truncatedConteudo = aulaConteudoAluno ? String(aulaConteudoAluno).slice(0, 500) : null;

    const [existing]: any = await pool.query('SELECT ID_ALUNO_AULAS as id FROM ALUNO_AULAS WHERE ID_ALUNO_AULAS = ?', [targetAulaId]);
    if (existing && existing.length > 0) {
      await pool.query(
        `UPDATE ALUNO_AULAS SET
           AULA_NOME_ALUNO_ALUNO_AULAS = ?,
           AULA_NUMERO_ALUNO_ALUNO_AULAS = ?,
           AULA_DATA_ALUNO_ALUNO_AULAS = ?,
           AULA_HORA_ALUNO_ALUNO_AULAS = ?,
           AULA_CONTEUDO_ALUNO_ALUNO_AULAS = ?,
           OBSERVACAO_ALUNO_ALUNO_AULAS = ?,
           NOTA_ALUNO_ALUNO_AULAS = ?,
           DATA_ATUALIZACAO_ALUNO_AULAS = NOW()
         WHERE ID_ALUNO_AULAS = ?`,
        [
          aulaNomeAluno,
          Number(aulaNumeroAluno) || 1,
          aulaDataAluno || null,
          aulaHoraAluno || null,
          truncatedConteudo,
          observacaoAluno || null,
          notaAluno || null,
          targetAulaId
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO ALUNO_AULAS (ID_ALUNO_AULAS, ALUNO_ID_ALUNO_AULAS, AULA_NOME_ALUNO_ALUNO_AULAS, AULA_NUMERO_ALUNO_ALUNO_AULAS, AULA_DATA_ALUNO_ALUNO_AULAS, AULA_HORA_ALUNO_ALUNO_AULAS, AULA_CONTEUDO_ALUNO_ALUNO_AULAS, OBSERVACAO_ALUNO_ALUNO_AULAS, NOTA_ALUNO_ALUNO_AULAS, DATA_CRIACAO_ALUNO_AULAS)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          targetAulaId,
          id,
          aulaNomeAluno,
          Number(aulaNumeroAluno) || 1,
          aulaDataAluno || null,
          aulaHoraAluno || null,
          truncatedConteudo,
          observacaoAluno || null,
          notaAluno || null
        ]
      );
    }

    await insertAuditLog('Cursos', 'Salvar', `Registrada aula/nota para aluno ID ${id}`, actor, req.ip);
    return res.json({ success: true, id: targetAulaId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /aluno-turma/aulas/:aulaId
apiRouter.delete('/aluno-turma/aulas/:aulaId', async (req: Request, res: Response) => {
  try {
    const { aulaId } = req.params;
    const pool = getPool();
    await pool.query('DELETE FROM ALUNO_AULAS WHERE ID_ALUNO_AULAS = ?', [aulaId]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CALENDÁRIO DE AULAS ENDPOINTS
// -------------------------------------------------------------

// Helper to format turma code (e.g. DL1 -> DL 01, MC2 -> MC 02, TURMA1 -> TURMA 01)
function formatTurmaCode(raw: any): string {
  if (raw === null || raw === undefined) return 'DL 01';
  let str = String(raw).trim();
  if (!str) return 'DL 01';

  str = str.replace(/\s+/g, ' ');

  const match = str.match(/^([A-Za-zÀ-ÿ]+)[_\-\s]*(\d+)(.*)$/);
  if (match) {
    const prefix = match[1].toUpperCase();
    const numStr = match[2];
    const suffix = match[3] ? match[3].trim().toUpperCase() : '';

    const formattedNum = numStr.length === 1 ? numStr.padStart(2, '0') : numStr;

    return `${prefix} ${formattedNum}${suffix ? ' ' + suffix : ''}`.trim();
  }

  if (/^\d+$/.test(str)) {
    return str.length === 1 ? str.padStart(2, '0') : str;
  }

  return str.toUpperCase();
}

// GET /calendario-aulas
apiRouter.get('/calendario-aulas', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_CALENDARIO_AULAS as id,
        DATA_CALENDARIO_AULAS as data_calendario,
        HORARIO_CALENDARIO_AULAS as horario_calendario,
        TURMA_CALENDARIO_AULAS as turma_calendario,
        SIGLA_CALENDARIO_AULAS as sigla_calendario,
        DISCIPLINA_CALENDARIO_AULAS as disciplina_calendario,
        SALA_CALENDARIO_AULAS as sala_calendario,
        CURSO_CALENDARIO_AULAS as curso_calendario,
        MODULO_CALENDARIO_AULAS as modulo_calendario,
        ANO_CALENDARIO_AULAS as ano_calendario,
        NUMERO_AULA_CALENDARIO_AULAS as numero_aula_calendario,
        EQUIPE_CALENDARIO_AULAS as equipe_calendario,
        OBSERVACAO_CALENDARIO_AULAS as observacao_calendario,
        DATA_CRIACAO_CALENDARIO_AULAS as created_at
      FROM CALENDARIO_AULAS ORDER BY DATA_CALENDARIO_AULAS ASC, HORARIO_CALENDARIO_AULAS ASC
    `);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      data_calendario: r.data_calendario ? String(r.data_calendario).split('T')[0] : '',
      horario_calendario: r.horario_calendario || '',
      turma_calendario: formatTurmaCode(r.turma_calendario),
      sigla_calendario: r.sigla_calendario || '',
      disciplina_calendario: r.disciplina_calendario || '',
      sala_calendario: r.sala_calendario || '',
      curso_calendario: r.curso_calendario || '',
      modulo_calendario: r.modulo_calendario || '',
      ano_calendario: r.ano_calendario || '',
      numero_aula_calendario: r.numero_aula_calendario || '',
      equipe_calendario: r.equipe_calendario || '',
      observacao_calendario: r.observacao_calendario || '',
      createdAt: r.created_at
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /calendario-aulas/import (Batch import from Excel / PDF / UI)
apiRouter.post('/calendario-aulas/import', async (req: Request, res: Response) => {
  try {
    const { records, actor } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Nenhum registro para importar.' });
    }

    const pool = getPool();
    let importedCount = 0;

    for (const rec of records) {
      const id = rec.id || `cal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const dataCal = rec.data_calendario || new Date().toISOString().split('T')[0];
      const horaCal = rec.horario_calendario || '08:00 as 09:40';
      const turmaCal = formatTurmaCode(rec.turma_calendario || 'DL 01');
      const siglaCal = rec.sigla_calendario || 'DISC';
      const discCal = rec.disciplina_calendario || null;
      const salaCal = rec.sala_calendario || null;
      const cursoCal = rec.curso_calendario || null;
      const moduloCal = rec.modulo_calendario || null;
      const anoCal = rec.ano_calendario !== undefined ? String(rec.ano_calendario) : null;
      const numAulaCal = rec.numero_aula_calendario !== undefined ? String(rec.numero_aula_calendario) : null;
      const equipeCal = rec.equipe_calendario || null;
      const obsCal = rec.observacao_calendario || null;

      await pool.query(
        `INSERT INTO CALENDARIO_AULAS 
          (ID_CALENDARIO_AULAS, DATA_CALENDARIO_AULAS, HORARIO_CALENDARIO_AULAS, TURMA_CALENDARIO_AULAS, SIGLA_CALENDARIO_AULAS, DISCIPLINA_CALENDARIO_AULAS, SALA_CALENDARIO_AULAS, CURSO_CALENDARIO_AULAS, MODULO_CALENDARIO_AULAS, ANO_CALENDARIO_AULAS, NUMERO_AULA_CALENDARIO_AULAS, EQUIPE_CALENDARIO_AULAS, OBSERVACAO_CALENDARIO_AULAS, DATA_CRIACAO_CALENDARIO_AULAS)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
          DATA_CALENDARIO_AULAS = VALUES(DATA_CALENDARIO_AULAS),
          HORARIO_CALENDARIO_AULAS = VALUES(HORARIO_CALENDARIO_AULAS),
          TURMA_CALENDARIO_AULAS = VALUES(TURMA_CALENDARIO_AULAS),
          SIGLA_CALENDARIO_AULAS = VALUES(SIGLA_CALENDARIO_AULAS),
          DISCIPLINA_CALENDARIO_AULAS = VALUES(DISCIPLINA_CALENDARIO_AULAS),
          SALA_CALENDARIO_AULAS = VALUES(SALA_CALENDARIO_AULAS),
          CURSO_CALENDARIO_AULAS = VALUES(CURSO_CALENDARIO_AULAS),
          MODULO_CALENDARIO_AULAS = VALUES(MODULO_CALENDARIO_AULAS),
          ANO_CALENDARIO_AULAS = VALUES(ANO_CALENDARIO_AULAS),
          NUMERO_AULA_CALENDARIO_AULAS = VALUES(NUMERO_AULA_CALENDARIO_AULAS),
          EQUIPE_CALENDARIO_AULAS = VALUES(EQUIPE_CALENDARIO_AULAS),
          OBSERVACAO_CALENDARIO_AULAS = VALUES(OBSERVACAO_CALENDARIO_AULAS)`,
        [id, dataCal, horaCal, turmaCal, siglaCal, discCal, salaCal, cursoCal, moduloCal, anoCal, numAulaCal, equipeCal, obsCal]
      );
      importedCount++;
    }

    await insertAuditLog('Calendário', 'Importar Tabela/PDF', `Importados ${importedCount} registros de calendário`, actor, req.ip);
    return res.json({ success: true, count: importedCount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /calendario-aulas (Create or Update Single Record)
apiRouter.post('/calendario-aulas', async (req: Request, res: Response) => {
  try {
    const {
      id: reqId,
      data_calendario,
      horario_calendario,
      turma_calendario,
      sigla_calendario,
      disciplina_calendario,
      sala_calendario,
      curso_calendario,
      modulo_calendario,
      ano_calendario,
      numero_aula_calendario,
      equipe_calendario,
      observacao_calendario,
      actor
    } = req.body;

    if (!data_calendario || !turma_calendario || !sigla_calendario) {
      return res.status(400).json({ error: 'Data, Turma e Sigla são obrigatórios.' });
    }

    const pool = getPool();
    const id = reqId || `cal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const formattedTurma = formatTurmaCode(turma_calendario);

    await pool.query(
      `INSERT INTO CALENDARIO_AULAS 
        (ID_CALENDARIO_AULAS, DATA_CALENDARIO_AULAS, HORARIO_CALENDARIO_AULAS, TURMA_CALENDARIO_AULAS, SIGLA_CALENDARIO_AULAS, DISCIPLINA_CALENDARIO_AULAS, SALA_CALENDARIO_AULAS, CURSO_CALENDARIO_AULAS, MODULO_CALENDARIO_AULAS, ANO_CALENDARIO_AULAS, NUMERO_AULA_CALENDARIO_AULAS, EQUIPE_CALENDARIO_AULAS, OBSERVACAO_CALENDARIO_AULAS, DATA_CRIACAO_CALENDARIO_AULAS)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        DATA_CALENDARIO_AULAS = VALUES(DATA_CALENDARIO_AULAS),
        HORARIO_CALENDARIO_AULAS = VALUES(HORARIO_CALENDARIO_AULAS),
        TURMA_CALENDARIO_AULAS = VALUES(TURMA_CALENDARIO_AULAS),
        SIGLA_CALENDARIO_AULAS = VALUES(SIGLA_CALENDARIO_AULAS),
        DISCIPLINA_CALENDARIO_AULAS = VALUES(DISCIPLINA_CALENDARIO_AULAS),
        SALA_CALENDARIO_AULAS = VALUES(SALA_CALENDARIO_AULAS),
        CURSO_CALENDARIO_AULAS = VALUES(CURSO_CALENDARIO_AULAS),
        MODULO_CALENDARIO_AULAS = VALUES(MODULO_CALENDARIO_AULAS),
        ANO_CALENDARIO_AULAS = VALUES(ANO_CALENDARIO_AULAS),
        NUMERO_AULA_CALENDARIO_AULAS = VALUES(NUMERO_AULA_CALENDARIO_AULAS),
        EQUIPE_CALENDARIO_AULAS = VALUES(EQUIPE_CALENDARIO_AULAS),
        OBSERVACAO_CALENDARIO_AULAS = VALUES(OBSERVACAO_CALENDARIO_AULAS)`,
      [
        id,
        data_calendario,
        horario_calendario || '08:00 as 09:40',
        formattedTurma,
        sigla_calendario,
        disciplina_calendario || null,
        sala_calendario || null,
        curso_calendario || null,
        modulo_calendario || null,
        ano_calendario !== undefined && ano_calendario !== '' ? String(ano_calendario) : null,
        numero_aula_calendario !== undefined ? String(numero_aula_calendario) : null,
        equipe_calendario || null,
        observacao_calendario || null
      ]
    );

    await insertAuditLog('Calendário', 'Salvar', `Salva aula ${sigla_calendario} da turma ${turma_calendario} para o dia ${data_calendario}`, actor, req.ip);
    return res.json({ success: true, id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /calendario-aulas/clear-all
apiRouter.delete('/calendario-aulas/clear-all', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query('TRUNCATE TABLE CALENDARIO_AULAS');
    return res.json({ success: true, message: 'Todos os registros do calendário foram apagados.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /calendario-aulas/:id
apiRouter.delete('/calendario-aulas/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    await pool.query('DELETE FROM CALENDARIO_AULAS WHERE ID_CALENDARIO_AULAS = ?', [id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// EQUIPES CALENDÁRIO ENDPOINTS
// -------------------------------------------------------------

// GET /equipes-calendario
apiRouter.get('/equipes-calendario', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_EQUIPE_CALENDARIO as id,
        NOME_DA_EQUIPE_EQUIPE_CALENDARIO as nome_da_equipe,
        MATERIA_EQUIPE_CALENDARIO as materia,
        TIPO_CURSO_EQUIPE_CALENDARIO as tipo_curso,
        NOME_DO_CURSO_EQUIPE_CALENDARIO as nome_do_curso,
        CODIGO_CURSO_EQUIPE_CALENDARIO as codigo_curso,
        DATES_CURSO_EQUIPE_CALENDARIO as dates_curso,
        MODULO_EQUIPE_CALENDARIO as modulo,
        ANO_EQUIPE_CALENDARIO as ano,
        DATA_EQUIPE_CALENDARIO as data,
        PROFESSOR_TITULAR_ID_EQUIPE_CALENDARIO as professor_titular_id,
        PROFESSOR_TITULAR_NOME_EQUIPE_CALENDARIO as professor_titular_nome,
        SIGLA_PROFESSOR_EQUIPE_CALENDARIO as sigla_professor,
        INSTRUTOR_ID_EQUIPE_CALENDARIO as instrutor_id,
        INSTRUTOR_NOME_EQUIPE_CALENDARIO as instrutor_nome,
        SIGLA_INSTRUTOR_EQUIPE_CALENDARIO as sigla_instrutor,
        DATA_CRIACAO_EQUIPE_CALENDARIO as created_at
      FROM EQUIPE_CALENDARIO ORDER BY DATA_CRIACAO_EQUIPE_CALENDARIO DESC
    `);
    const mapped = [];

    for (const r of rows || []) {
      const [profs]: any = await pool.query(`
      SELECT 
        ID_PROFESSORES_EQUIPE as id,
        EQUIPE_ID_PROFESSORES_EQUIPE as equipe_id,
        NOME_PROFESSOR_PROFESSORES_EQUIPE as nome_professor,
        SIGLA_PROFESSOR_PROFESSORES_EQUIPE as sigla_professor,
        TITULAR_PROFESSORES_EQUIPE as titular,
        INSTRUTOR_PROFESSORES_EQUIPE as instrutor,
        TIPO_FUNCAO_PROFESSORES_EQUIPE as tipo_funcao,
        PROFESSOR_TITULAR_ID_PROFESSORES_EQUIPE as professor_titular_id,
        PROFESSOR_TITULAR_NOME_PROFESSORES_EQUIPE as professor_titular_nome,
        INSTRUTOR_ID_PROFESSORES_EQUIPE as instrutor_id,
        INSTRUTOR_NOME_PROFESSORES_EQUIPE as instrutor_nome,
        SIGLA_INSTRUTOR_PROFESSORES_EQUIPE as sigla_instrutor,
        DATA_CRIACAO_PROFESSORES_EQUIPE as created_at
      FROM PROFESSORES_EQUIPE WHERE EQUIPE_ID_PROFESSORES_EQUIPE = ?
    `, [r.id]);
      
      const instrutoresList: any[] = [];
      let profTitularNome = r.professor_titular_nome || '';
      let profTitularSigla = r.sigla_professor || '';

      for (const p of profs || []) {
        if (p.tipo_funcao === 'TITULAR' || p.professor_titular_nome) {
          profTitularNome = p.professor_titular_nome || profTitularNome;
          profTitularSigla = p.sigla_professor || profTitularSigla;
        }
        if (p.tipo_funcao === 'INSTRUTOR' || p.instrutor_nome || p.sigla_instrutor) {
          if (p.instrutor_nome || p.sigla_instrutor) {
            instrutoresList.push({
              id: p.id,
              instrutorNome: p.instrutor_nome || '',
              siglaInstrutor: p.sigla_instrutor || ''
            });
          }
        }
      }

      // If no separate profs rows but single columns set
      if (instrutoresList.length === 0 && (r.instrutor_nome || r.sigla_instrutor)) {
        instrutoresList.push({
          id: `inst-1`,
          instrutorNome: r.instrutor_nome || '',
          siglaInstrutor: r.sigla_instrutor || ''
        });
      }

      mapped.push({
        id: r.id,
        nome_da_equipe: r.nome_da_equipe || '',
        materia: r.materia || '',
        tipo_curso: 'Curso de Formação',
        nome_do_curso: r.nome_do_curso || '',
        codigo_curso: r.codigo_curso || '',
        dates_curso: r.dates_curso || '',
        modulo: r.modulo || '',
        ano: r.ano || (r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear()),
        data: r.data ? String(r.data).split('T')[0] : '',
        professor_titular_equipe: profTitularNome,
        sigla_professor: profTitularSigla,
        instrutor_equipe: r.instrutor_nome || (instrutoresList[0]?.instrutorNome || ''),
        sigla_instrutor: r.sigla_instrutor || (instrutoresList[0]?.siglaInstrutor || ''),
        instrutores: instrutoresList,
        professores_equipe: (profs || []).map((p: any) => ({
          id: p.id,
          equipeId: p.equipe_id,
          nome_professor: p.nome_professor || p.professor_titular_nome || p.instrutor_nome || '',
          sigla_professor: p.sigla_professor || p.sigla_instrutor || '',
          titular: p.titular || (p.tipo_funcao === 'TITULAR' ? 'Sim' : 'Não'),
          instrutor: p.instrutor || (p.tipo_funcao === 'INSTRUTOR' ? '1' : undefined),
          tipoFuncao: p.tipo_funcao,
          professorTitularId: p.professor_titular_id,
          professorTitularNome: p.professor_titular_nome || p.nome_professor,
          siglaProfessor: p.sigla_professor,
          instrutorId: p.instrutor_id,
          instrutorNome: p.instrutor_nome || p.nome_professor,
          siglaInstrutor: p.sigla_instrutor || p.sigla_professor,
        })),
        createdAt: r.created_at
      });
    }

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /equipes-calendario (Create or Update Team)
apiRouter.post('/equipes-calendario', async (req: Request, res: Response) => {
  try {
    const {
      id: reqId,
      nome_da_equipe,
      materia,
      nome_do_curso,
      codigo_curso,
      dates_curso,
      modulo,
      ano,
      data,
      professor_titular_equipe,
      professor_titular_id,
      sigla_professor,
      instrutores, // array of { instrutorNome, siglaInstrutor }
      instrutor_equipe,
      sigla_instrutor,
      actor
    } = req.body;

    if (!nome_da_equipe || !materia || !nome_do_curso) {
      return res.status(400).json({ error: 'Nome da Equipe, Matéria e Curso são obrigatórios.' });
    }

    const pool = getPool();
    const id = reqId || `eq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const tipoCursoVal = 'Curso de Formação';
    const anoVal = ano ? String(ano) : new Date().getFullYear().toString();
    const dataVal = data || new Date().toISOString().split('T')[0];

    // Normalized list of instructors
    const instrList: { instrutorNome: string; siglaInstrutor: string }[] = Array.isArray(instrutores) && instrutores.length > 0
      ? instrutores
      : (instrutor_equipe || sigla_instrutor) ? [{ instrutorNome: instrutor_equipe || '', siglaInstrutor: sigla_instrutor || '' }] : [];

    const primaryInstrutorNome = instrList[0]?.instrutorNome || instrutor_equipe || '';
    const primarySiglaInstrutor = instrList[0]?.siglaInstrutor || sigla_instrutor || '';

    await pool.query(
      `INSERT INTO EQUIPE_CALENDARIO
        (ID_EQUIPE_CALENDARIO, NOME_DA_EQUIPE_EQUIPE_CALENDARIO, MATERIA_EQUIPE_CALENDARIO, TIPO_CURSO_EQUIPE_CALENDARIO, NOME_DO_CURSO_EQUIPE_CALENDARIO, CODIGO_CURSO_EQUIPE_CALENDARIO, DATES_CURSO_EQUIPE_CALENDARIO, MODULO_EQUIPE_CALENDARIO, ANO_EQUIPE_CALENDARIO, DATA_EQUIPE_CALENDARIO, PROFESSOR_TITULAR_ID_EQUIPE_CALENDARIO, PROFESSOR_TITULAR_NOME_EQUIPE_CALENDARIO, SIGLA_PROFESSOR_EQUIPE_CALENDARIO, INSTRUTOR_ID_EQUIPE_CALENDARIO, INSTRUTOR_NOME_EQUIPE_CALENDARIO, SIGLA_INSTRUTOR_EQUIPE_CALENDARIO, DATA_CRIACAO_EQUIPE_CALENDARIO)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        NOME_DA_EQUIPE_EQUIPE_CALENDARIO = VALUES(NOME_DA_EQUIPE_EQUIPE_CALENDARIO),
        MATERIA_EQUIPE_CALENDARIO = VALUES(MATERIA_EQUIPE_CALENDARIO),
        TIPO_CURSO_EQUIPE_CALENDARIO = VALUES(TIPO_CURSO_EQUIPE_CALENDARIO),
        NOME_DO_CURSO_EQUIPE_CALENDARIO = VALUES(NOME_DO_CURSO_EQUIPE_CALENDARIO),
        CODIGO_CURSO_EQUIPE_CALENDARIO = VALUES(CODIGO_CURSO_EQUIPE_CALENDARIO),
        DATES_CURSO_EQUIPE_CALENDARIO = VALUES(DATES_CURSO_EQUIPE_CALENDARIO),
        MODULO_EQUIPE_CALENDARIO = VALUES(MODULO_EQUIPE_CALENDARIO),
        ANO_EQUIPE_CALENDARIO = VALUES(ANO_EQUIPE_CALENDARIO),
        DATA_EQUIPE_CALENDARIO = VALUES(DATA_EQUIPE_CALENDARIO),
        PROFESSOR_TITULAR_ID_EQUIPE_CALENDARIO = VALUES(PROFESSOR_TITULAR_ID_EQUIPE_CALENDARIO),
        PROFESSOR_TITULAR_NOME_EQUIPE_CALENDARIO = VALUES(PROFESSOR_TITULAR_NOME_EQUIPE_CALENDARIO),
        SIGLA_PROFESSOR_EQUIPE_CALENDARIO = VALUES(SIGLA_PROFESSOR_EQUIPE_CALENDARIO),
        INSTRUTOR_ID_EQUIPE_CALENDARIO = VALUES(INSTRUTOR_ID_EQUIPE_CALENDARIO),
        INSTRUTOR_NOME_EQUIPE_CALENDARIO = VALUES(INSTRUTOR_NOME_EQUIPE_CALENDARIO),
        SIGLA_INSTRUTOR_EQUIPE_CALENDARIO = VALUES(SIGLA_INSTRUTOR_EQUIPE_CALENDARIO)`,
      [
        id,
        nome_da_equipe,
        materia,
        tipoCursoVal,
        nome_do_curso,
        codigo_curso || null,
        dates_curso || null,
        modulo || 'Módulo I',
        anoVal,
        dataVal,
        professor_titular_id || null,
        professor_titular_equipe || null,
        sigla_professor || null,
        null,
        primaryInstrutorNome || null,
        primarySiglaInstrutor || null
      ]
    );

    // Sync professores_equipe table
    await pool.query('DELETE FROM PROFESSORES_EQUIPE WHERE EQUIPE_ID_PROFESSORES_EQUIPE = ?', [id]);

    // Insert Professor Titular row (titular: "Sim", instrutor: null)
    if (professor_titular_equipe || sigla_professor) {
      const profTitId = `prof-tit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO PROFESSORES_EQUIPE
          (ID_PROFESSORES_EQUIPE, EQUIPE_ID_PROFESSORES_EQUIPE, NOME_PROFESSOR_PROFESSORES_EQUIPE, SIGLA_PROFESSOR_PROFESSORES_EQUIPE, TITULAR_PROFESSORES_EQUIPE, INSTRUTOR_PROFESSORES_EQUIPE, TIPO_FUNCAO_PROFESSORES_EQUIPE, PROFESSOR_TITULAR_ID_PROFESSORES_EQUIPE, PROFESSOR_TITULAR_NOME_PROFESSORES_EQUIPE, DATA_CRIACAO_PROFESSORES_EQUIPE)
         VALUES (?, ?, ?, ?, 'Sim', NULL, 'TITULAR', ?, ?, NOW())`,
        [
          profTitId,
          id,
          professor_titular_equipe || null,
          sigla_professor || null,
          professor_titular_id || null,
          professor_titular_equipe || null
        ]
      );
    }

    // Insert Instrutores rows (titular: "Não", instrutor: "1", "2", "3", "4")
    for (let i = 0; i < instrList.length; i++) {
      const inst = instrList[i];
      if (inst.instrutorNome || inst.siglaInstrutor) {
        const instId = `prof-inst-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
        const numInstrutor = String(i + 1);
        await pool.query(
          `INSERT INTO PROFESSORES_EQUIPE
            (ID_PROFESSORES_EQUIPE, EQUIPE_ID_PROFESSORES_EQUIPE, NOME_PROFESSOR_PROFESSORES_EQUIPE, SIGLA_PROFESSOR_PROFESSORES_EQUIPE, TITULAR_PROFESSORES_EQUIPE, INSTRUTOR_PROFESSORES_EQUIPE, TIPO_FUNCAO_PROFESSORES_EQUIPE, INSTRUTOR_NOME_PROFESSORES_EQUIPE, SIGLA_INSTRUTOR_PROFESSORES_EQUIPE, DATA_CRIACAO_PROFESSORES_EQUIPE)
           VALUES (?, ?, ?, ?, 'Não', ?, 'INSTRUTOR', ?, ?, NOW())`,
          [
            instId,
            id,
            inst.instrutorNome || null,
            inst.siglaInstrutor || null,
            numInstrutor,
            inst.instrutorNome || null,
            inst.siglaInstrutor || null
          ]
        );
      }
    }

    await insertAuditLog('Calendário', 'Salvar Equipe', `Cadastrada/Atualizada Equipe ${nome_da_equipe} (${materia}) para curso ${nome_do_curso} (${anoVal})`, actor, req.ip);
    return res.json({ success: true, id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /equipes-calendario/:id
apiRouter.delete('/equipes-calendario/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    await pool.query('DELETE FROM PROFESSORES_EQUIPE WHERE EQUIPE_ID_PROFESSORES_EQUIPE = ?', [id]);
    await pool.query('DELETE FROM EQUIPE_CALENDARIO WHERE ID_EQUIPE_CALENDARIO = ?', [id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AUXILIAR TABELA EQUIPE ENDPOINTS
// -------------------------------------------------------------

// GET /auxiliar-tabela-equipe
apiRouter.get('/auxiliar-tabela-equipe', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_AUXILIAR_TABELA_EQUIPE as id,
        EQUIPE_ID_AUXILIAR_TABELA_EQUIPE as equipe_id,
        NOME_DA_EQUIPE_AUXILIAR_TABELA_EQUIPE as nome_da_equipe,
        TURMA_ID_AUXILIAR_TABELA_EQUIPE as turma_id,
        CODIGO_TURMA_AUXILIAR_TABELA_EQUIPE as codigo_turma,
        MATERIA_AUXILIAR_TABELA_EQUIPE as materia,
        PROFESSOR_TITULAR_ID_AUXILIAR_TABELA_EQUIPE as professor_titular_id,
        PROFESSOR_TITULAR_NOME_AUXILIAR_TABELA_EQUIPE as professor_titular_nome,
        SIGLA_PROFESSOR_AUXILIAR_TABELA_EQUIPE as sigla_professor,
        PROFESSORES_AUXILIAR_TABELA_EQUIPE as professores,
        DATA_INICIO_AUXILIAR_TABELA_EQUIPE as data_inicio,
        DATA_FIM_AUXILIAR_TABELA_EQUIPE as data_fim,
        OBSERVACAO_AUXILIAR_TABELA_EQUIPE as observacao,
        DATA_CRIACAO_AUXILIAR_TABELA_EQUIPE as data_criacao,
        DATA_ATUALIZACAO_AUXILIAR_TABELA_EQUIPE as data_atualizacao
      FROM AUXILIAR_TABELA_EQUIPE ORDER BY DATA_INICIO_AUXILIAR_TABELA_EQUIPE ASC, DATA_CRIACAO_AUXILIAR_TABELA_EQUIPE DESC
    `);
    const mapped = (rows || []).map((r: any) => {
      let profsParsed: any[] = [];
      if (typeof r.professores === 'string') {
        try { profsParsed = JSON.parse(r.professores); } catch { profsParsed = []; }
      } else if (Array.isArray(r.professores)) {
        profsParsed = r.professores;
      }

      return {
        id: r.id,
        equipe_id: r.equipe_id || '',
        equipeId: r.equipe_id || '',
        nome_da_equipe: r.nome_da_equipe || '',
        turma_id: r.turma_id || '',
        turmaId: r.turma_id || '',
        codigo_turma: r.codigo_turma || '',
        materia: r.materia || '',
        professor_titular_id: r.professor_titular_id || '',
        professor_titular_nome: r.professor_titular_nome || '',
        sigla_professor: r.sigla_professor || '',
        professores: profsParsed,
        data_inicio: r.data_inicio ? String(r.data_inicio).split('T')[0] : '',
        data_fim: r.data_fim ? String(r.data_fim).split('T')[0] : '',
        observacao: r.observacao || '',
        createdAt: r.data_criacao
      };
    });
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /auxiliar-tabela-equipe
apiRouter.post('/auxiliar-tabela-equipe', async (req: Request, res: Response) => {
  try {
    const {
      id: reqId,
      equipe_id,
      nome_da_equipe,
      turma_id,
      codigo_turma,
      materia,
      professor_titular_id,
      professor_titular_nome,
      sigla_professor,
      professores,
      data_inicio,
      data_fim,
      observacao,
      actor
    } = req.body;

    if (!nome_da_equipe || !codigo_turma || !materia || !data_inicio || !data_fim) {
      return res.status(400).json({ error: 'Nome da Equipe, Turma, Matéria, Data Início e Data Fim são obrigatórios.' });
    }

    const pool = getPool();
    const id = reqId || `aux-eq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const formattedTurma = formatTurmaCode(codigo_turma);
    const profsJson = JSON.stringify(professores || []);

    await pool.query(
      `INSERT INTO AUXILIAR_TABELA_EQUIPE
        (ID_AUXILIAR_TABELA_EQUIPE, EQUIPE_ID_AUXILIAR_TABELA_EQUIPE, NOME_DA_EQUIPE_AUXILIAR_TABELA_EQUIPE, TURMA_ID_AUXILIAR_TABELA_EQUIPE, CODIGO_TURMA_AUXILIAR_TABELA_EQUIPE, MATERIA_AUXILIAR_TABELA_EQUIPE, PROFESSOR_TITULAR_ID_AUXILIAR_TABELA_EQUIPE, PROFESSOR_TITULAR_NOME_AUXILIAR_TABELA_EQUIPE, SIGLA_PROFESSOR_AUXILIAR_TABELA_EQUIPE, PROFESSORES_AUXILIAR_TABELA_EQUIPE, DATA_INICIO_AUXILIAR_TABELA_EQUIPE, DATA_FIM_AUXILIAR_TABELA_EQUIPE, OBSERVACAO_AUXILIAR_TABELA_EQUIPE, DATA_CRIACAO_AUXILIAR_TABELA_EQUIPE)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        EQUIPE_ID_AUXILIAR_TABELA_EQUIPE = VALUES(EQUIPE_ID_AUXILIAR_TABELA_EQUIPE),
        NOME_DA_EQUIPE_AUXILIAR_TABELA_EQUIPE = VALUES(NOME_DA_EQUIPE_AUXILIAR_TABELA_EQUIPE),
        TURMA_ID_AUXILIAR_TABELA_EQUIPE = VALUES(TURMA_ID_AUXILIAR_TABELA_EQUIPE),
        CODIGO_TURMA_AUXILIAR_TABELA_EQUIPE = VALUES(CODIGO_TURMA_AUXILIAR_TABELA_EQUIPE),
        MATERIA_AUXILIAR_TABELA_EQUIPE = VALUES(MATERIA_AUXILIAR_TABELA_EQUIPE),
        PROFESSOR_TITULAR_ID_AUXILIAR_TABELA_EQUIPE = VALUES(PROFESSOR_TITULAR_ID_AUXILIAR_TABELA_EQUIPE),
        PROFESSOR_TITULAR_NOME_AUXILIAR_TABELA_EQUIPE = VALUES(PROFESSOR_TITULAR_NOME_AUXILIAR_TABELA_EQUIPE),
        SIGLA_PROFESSOR_AUXILIAR_TABELA_EQUIPE = VALUES(SIGLA_PROFESSOR_AUXILIAR_TABELA_EQUIPE),
        PROFESSORES_AUXILIAR_TABELA_EQUIPE = VALUES(PROFESSORES_AUXILIAR_TABELA_EQUIPE),
        DATA_INICIO_AUXILIAR_TABELA_EQUIPE = VALUES(DATA_INICIO_AUXILIAR_TABELA_EQUIPE),
        DATA_FIM_AUXILIAR_TABELA_EQUIPE = VALUES(DATA_FIM_AUXILIAR_TABELA_EQUIPE),
        OBSERVACAO_AUXILIAR_TABELA_EQUIPE = VALUES(OBSERVACAO_AUXILIAR_TABELA_EQUIPE)`,
      [
        id,
        equipe_id || null,
        nome_da_equipe,
        turma_id || null,
        formattedTurma,
        materia,
        professor_titular_id || null,
        professor_titular_nome || null,
        sigla_professor || null,
        profsJson,
        data_inicio,
        data_fim,
        observacao || null
      ]
    );

    await insertAuditLog('Calendário', 'Salvar Vínculo Auxiliar Equipe', `Cadastrado/Atualizado vínculo da Equipe ${nome_da_equipe} com Turma ${formattedTurma} (${materia}) do dia ${data_inicio} até ${data_fim}`, actor, req.ip);
    return res.json({ success: true, id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /auxiliar-tabela-equipe/:id
apiRouter.delete('/auxiliar-tabela-equipe/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    await pool.query('DELETE FROM AUXILIAR_TABELA_EQUIPE WHERE ID_AUXILIAR_TABELA_EQUIPE = ?', [id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CERTIFICADOS ENDPOINTS
// ============================================================================

// GET /certificados - List all certificates
apiRouter.get('/certificados', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const includePdf = req.query.includePdf === 'true';
    
    // Select columns (optionally omit heavy base64 for fast listing)
    const sql = includePdf 
      ? 'SELECT ID_CERTIFICADOS as id, CODIGO_AUTENTICACAO_CERTIFICADOS as codigo_autenticacao, TITULO_CERTIFICADOS as titulo, NOME_ALUNO_CERTIFICADOS as nome_aluno, CPF_MASP_CERTIFICADOS as cpf_masp, DESCRICAO_CERTIFICADOS as descricao, NOME_ARQUIVO_CERTIFICADOS as nome_arquivo, PDF_BASE64_CERTIFICADOS as pdf_base64, PDF_STAMPED_BASE64_CERTIFICADOS as pdf_stamped_base64, TAMANHO_BYTES_CERTIFICADOS as tamanho_bytes, TIPO_MIME_CERTIFICADOS as tipo_mime, DATA_EMISSAO_CERTIFICADOS as data_emissao, CRIADO_POR_USUARIO_ID_CERTIFICADOS as criado_por_usuario_id, CRIADO_POR_NOME_CERTIFICADOS as criado_por_nome, STATUS_CERTIFICADOS as status, DATA_CRIACAO_CERTIFICADOS as data_criacao, DATA_ATUALIZACAO_CERTIFICADOS as data_atualizacao FROM CERTIFICADOS ORDER BY DATA_CRIACAO_CERTIFICADOS DESC'
      : `SELECT ID_CERTIFICADOS as id, CODIGO_AUTENTICACAO_CERTIFICADOS as codigo_autenticacao, TITULO_CERTIFICADOS as titulo, NOME_ALUNO_CERTIFICADOS as nome_aluno, CPF_MASP_CERTIFICADOS as cpf_masp, DESCRICAO_CERTIFICADOS as descricao,
                NOME_ARQUIVO_CERTIFICADOS as nome_arquivo, TAMANHO_BYTES_CERTIFICADOS as tamanho_bytes, TIPO_MIME_CERTIFICADOS as tipo_mime, DATA_EMISSAO_CERTIFICADOS as data_emissao,
                CRIADO_POR_USUARIO_ID_CERTIFICADOS as criado_por_usuario_id, CRIADO_POR_NOME_CERTIFICADOS as criado_por_nome, STATUS_CERTIFICADOS as status, DATA_CRIACAO_CERTIFICADOS as data_criacao, DATA_ATUALIZACAO_CERTIFICADOS as data_atualizacao
         FROM CERTIFICADOS ORDER BY DATA_CRIACAO_CERTIFICADOS DESC`;
         
    const [rows]: any = await pool.query(sql);
    
    const formatted = rows.map((r: any) => ({
      id: r.id,
      codigoAutenticacao: r.codigo_autenticacao,
      titulo: r.titulo,
      nomeAluno: r.nome_aluno,
      cpfMasp: r.cpf_masp,
      descricao: r.descricao,
      nomeArquivo: r.nome_arquivo,
      pdfBase64: r.pdf_base64 || '',
      pdfStampedBase64: r.pdf_stamped_base64 || '',
      tamanhoBytes: r.tamanho_bytes,
      tipoMime: r.tipo_mime || 'application/pdf',
      dataEmissao: r.data_emissao ? new Date(r.data_emissao).toISOString().split('T')[0] : null,
      criadoPorUsuarioId: r.criado_por_usuario_id,
      criadoPorNome: r.criado_por_nome,
      status: r.status || 'Valido',
      createdAt: r.data_criacao,
      updatedAt: r.data_atualizacao
    }));

    return res.json(formatted);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /certificados/:id - Get specific certificate with full PDF
apiRouter.get('/certificados/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    const [rows]: any = await pool.query(
      'SELECT ID_CERTIFICADOS as id, CODIGO_AUTENTICACAO_CERTIFICADOS as codigo_autenticacao, TITULO_CERTIFICADOS as titulo, NOME_ALUNO_CERTIFICADOS as nome_aluno, CPF_MASP_CERTIFICADOS as cpf_masp, DESCRICAO_CERTIFICADOS as descricao, NOME_ARQUIVO_CERTIFICADOS as nome_arquivo, PDF_BASE64_CERTIFICADOS as pdf_base64, PDF_STAMPED_BASE64_CERTIFICADOS as pdf_stamped_base64, TAMANHO_BYTES_CERTIFICADOS as tamanho_bytes, TIPO_MIME_CERTIFICADOS as tipo_mime, DATA_EMISSAO_CERTIFICADOS as data_emissao, CRIADO_POR_USUARIO_ID_CERTIFICADOS as criado_por_usuario_id, CRIADO_POR_NOME_CERTIFICADOS as criado_por_nome, STATUS_CERTIFICADOS as status, DATA_CRIACAO_CERTIFICADOS as data_criacao, DATA_ATUALIZACAO_CERTIFICADOS as data_atualizacao FROM CERTIFICADOS WHERE ID_CERTIFICADOS = ? OR CODIGO_AUTENTICACAO_CERTIFICADOS = ? LIMIT 1',
      [id, id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Certificado não encontrado.' });
    }

    const r = rows[0];
    return res.json({
      id: r.id,
      codigoAutenticacao: r.codigo_autenticacao,
      titulo: r.titulo,
      nomeAluno: r.nome_aluno,
      cpfMasp: r.cpf_masp,
      descricao: r.descricao,
      nomeArquivo: r.nome_arquivo,
      pdfBase64: r.pdf_base64 || '',
      pdfStampedBase64: r.pdf_stamped_base64 || '',
      tamanhoBytes: r.tamanho_bytes,
      tipoMime: r.tipo_mime || 'application/pdf',
      dataEmissao: r.data_emissao ? new Date(r.data_emissao).toISOString().split('T')[0] : null,
      criadoPorUsuarioId: r.criado_por_usuario_id,
      criadoPorNome: r.criado_por_nome,
      status: r.status || 'Valido',
      createdAt: r.data_criacao,
      updatedAt: r.data_atualizacao
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /certificados/verificar/:code - Public verification endpoint
apiRouter.get('/certificados/verificar/:code', async (req: Request, res: Response) => {
  try {
    const code = (req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Código de autenticação não informado.' });
    }

    const pool = getPool();
    const [rows]: any = await pool.query(
      'SELECT ID_CERTIFICADOS as id, CODIGO_AUTENTICACAO_CERTIFICADOS as codigo_autenticacao, TITULO_CERTIFICADOS as titulo, NOME_ALUNO_CERTIFICADOS as nome_aluno, CPF_MASP_CERTIFICADOS as cpf_masp, DESCRICAO_CERTIFICADOS as descricao, NOME_ARQUIVO_CERTIFICADOS as nome_arquivo, PDF_BASE64_CERTIFICADOS as pdf_base64, PDF_STAMPED_BASE64_CERTIFICADOS as pdf_stamped_base64, TAMANHO_BYTES_CERTIFICADOS as tamanho_bytes, TIPO_MIME_CERTIFICADOS as tipo_mime, DATA_EMISSAO_CERTIFICADOS as data_emissao, CRIADO_POR_USUARIO_ID_CERTIFICADOS as criado_por_usuario_id, CRIADO_POR_NOME_CERTIFICADOS as criado_por_nome, STATUS_CERTIFICADOS as status, DATA_CRIACAO_CERTIFICADOS as data_criacao, DATA_ATUALIZACAO_CERTIFICADOS as data_atualizacao FROM CERTIFICADOS WHERE CODIGO_AUTENTICACAO_CERTIFICADOS = ? OR ID_CERTIFICADOS = ? LIMIT 1',
      [code, code]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        valid: false, 
        error: 'Certificado não localizado na base oficial de registros da ACADEPOL.' 
      });
    }

    const r = rows[0];
    return res.json({
      success: true,
      valid: r.status === 'Valido',
      certificate: {
        id: r.id,
        codigoAutenticacao: r.codigo_autenticacao,
        titulo: r.titulo,
        nomeAluno: r.nome_aluno,
        cpfMasp: r.cpf_masp,
        descricao: r.descricao,
        nomeArquivo: r.nome_arquivo,
        pdfBase64: r.pdf_base64 || '',
        pdfStampedBase64: r.pdf_stamped_base64 || r.pdf_base64 || '',
        tamanhoBytes: r.tamanho_bytes,
        tipoMime: r.tipo_mime || 'application/pdf',
        dataEmissao: r.data_emissao ? new Date(r.data_emissao).toISOString().split('T')[0] : null,
        criadoPorNome: r.criado_por_nome,
        status: r.status || 'Valido',
        createdAt: r.data_criacao
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /certificados - Create or update certificate
apiRouter.post('/certificados', async (req: Request, res: Response) => {
  try {
    const {
      id: rawId,
      codigoAutenticacao: rawCode,
      titulo,
      nomeAluno,
      cpfMasp,
      descricao,
      nomeArquivo,
      pdfBase64,
      pdfStampedBase64,
      tamanhoBytes,
      tipoMime,
      dataEmissao,
      status,
      actor
    } = req.body;

    if (!titulo || !nomeAluno || !pdfBase64) {
      return res.status(400).json({ error: 'Título, Nome do Aluno e Arquivo PDF são obrigatórios.' });
    }

    const pool = getPool();
    const id = rawId || `cert-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const codigoAutenticacao = rawCode || `ACAD-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const fileBytes = tamanhoBytes || Math.round((pdfBase64.length * 3) / 4);
    const mime = tipoMime || 'application/pdf';
    const filename = nomeArquivo || `certificado_${nomeAluno.toLowerCase().replace(/\s+/g, '_')}.pdf`;
    const certStatus = status || 'Valido';
    const emissionDate = dataEmissao ? new Date(dataEmissao) : new Date();

    const criadoPorId = actor?.id || null;
    const criadoPorNome = actor?.name || 'Administrador Geral';

    await pool.query(
      `INSERT INTO CERTIFICADOS (
        ID_CERTIFICADOS, CODIGO_AUTENTICACAO_CERTIFICADOS, TITULO_CERTIFICADOS, NOME_ALUNO_CERTIFICADOS, CPF_MASP_CERTIFICADOS, DESCRICAO_CERTIFICADOS, 
        NOME_ARQUIVO_CERTIFICADOS, PDF_BASE64_CERTIFICADOS, PDF_STAMPED_BASE64_CERTIFICADOS, TAMANHO_BYTES_CERTIFICADOS, TIPO_MIME_CERTIFICADOS, 
        DATA_EMISSAO_CERTIFICADOS, CRIADO_POR_USUARIO_ID_CERTIFICADOS, CRIADO_POR_NOME_CERTIFICADOS, STATUS_CERTIFICADOS, DATA_CRIACAO_CERTIFICADOS
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        TITULO_CERTIFICADOS = VALUES(TITULO_CERTIFICADOS),
        NOME_ALUNO_CERTIFICADOS = VALUES(NOME_ALUNO_CERTIFICADOS),
        CPF_MASP_CERTIFICADOS = VALUES(CPF_MASP_CERTIFICADOS),
        DESCRICAO_CERTIFICADOS = VALUES(DESCRICAO_CERTIFICADOS),
        NOME_ARQUIVO_CERTIFICADOS = VALUES(NOME_ARQUIVO_CERTIFICADOS),
        PDF_BASE64_CERTIFICADOS = VALUES(PDF_BASE64_CERTIFICADOS),
        PDF_STAMPED_BASE64_CERTIFICADOS = VALUES(PDF_STAMPED_BASE64_CERTIFICADOS),
        TAMANHO_BYTES_CERTIFICADOS = VALUES(TAMANHO_BYTES_CERTIFICADOS),
        TIPO_MIME_CERTIFICADOS = VALUES(TIPO_MIME_CERTIFICADOS),
        DATA_EMISSAO_CERTIFICADOS = VALUES(DATA_EMISSAO_CERTIFICADOS),
        STATUS_CERTIFICADOS = VALUES(STATUS_CERTIFICADOS)`,
      [
        id,
        codigoAutenticacao,
        titulo,
        nomeAluno,
        cpfMasp || null,
        descricao || null,
        filename,
        pdfBase64,
        pdfStampedBase64 || pdfBase64,
        fileBytes,
        mime,
        emissionDate,
        criadoPorId,
        criadoPorNome,
        certStatus
      ]
    );

    await insertAuditLog(
      'Certificados',
      'Importar e Validar Certificado',
      `Certificado emitido/registrado: ${titulo} para ${nomeAluno} (Código: ${codigoAutenticacao})`,
      actor,
      req.ip
    );

    return res.json({
      success: true,
      id,
      codigoAutenticacao,
      titulo,
      nomeAluno
    });
  } catch (err: any) {
    console.error('Error saving certificate:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /certificados/:id - Delete certificate
apiRouter.delete('/certificados/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    const [rows]: any = await pool.query('SELECT TITULO_CERTIFICADOS as titulo, NOME_ALUNO_CERTIFICADOS as nome_aluno, CODIGO_AUTENTICACAO_CERTIFICADOS as codigo_autenticacao FROM CERTIFICADOS WHERE ID_CERTIFICADOS = ?', [id]);
    const cert = rows[0];

    await pool.query('DELETE FROM CERTIFICADOS WHERE ID_CERTIFICADOS = ?', [id]);

    if (cert) {
      await insertAuditLog(
        'Certificados',
        'Excluir Certificado',
        `Certificado excluído: ${cert.titulo} de ${cert.nome_aluno} (Código: ${cert.codigo_autenticacao})`,
        actor,
        req.ip
      );
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// WEAPON TRANSFERS BETWEEN UNITS (TRANSFERÊNCIAS DE ARMAS)
// Only Armeiro, Administrador, and Geral can view and transfer
// -------------------------------------------------------------
apiRouter.get('/weapon-transfers', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_TRANSFERENCIAS_ARMAS as id,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS as protocolNumber,
        DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS as transferDate,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS as originDepartmentId,
        ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS as originDepartmentName,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_ARMAS as originUnitId,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_ARMAS as originUnitName,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS as destinationDepartmentId,
        DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS as destinationDepartmentName,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_ARMAS as destinationUnitId,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS as destinationUnitName,
        DESTINO_ARMEIRO_ID_TRANSFERENCIAS_ARMAS as destinationArmorerId,
        DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_ARMAS as destinationArmorerName,
        DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_ARMAS as destinationArmorerMasp,
        DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS as destinationVaultSpaceId,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS as destinationVaultSpaceCode,
        RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS as transferredByUserId,
        RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS as transferredByUserName,
        RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS as transferredByUserMasp,
        RESPONSAVEL_PERFIL_TRANSFERENCIAS_ARMAS as transferredByUserRole,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS as receiverOrTransporterName,
        TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS as receiverOrTransporterMasp,
        TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS as receiverOrTransporterCargo,
        MOTIVO_TRANSFERENCIAS_ARMAS as reason,
        ARMAS_JSON_TRANSFERENCIAS_ARMAS as weaponsJson,
        TOTAL_ARMAS_TRANSFERENCIAS_ARMAS as totalWeapons,
        TOTAL_CARREGADORES_TRANSFERENCIAS_ARMAS as totalMagazines,
        OBSERVACAO_TRANSFERENCIAS_ARMAS as observation,
        STATUS_TRANSFERENCIAS_ARMAS as status,
        RECEBIDO_EM_TRANSFERENCIAS_ARMAS as receivedAt,
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_ARMAS as receivedByUserId,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_ARMAS as receivedByUserName,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_ARMAS as receivedByUserMasp,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_ARMAS as receivedByUserRole,
        DATA_CRIACAO_TRANSFERENCIAS_ARMAS as createdAt
      FROM TRANSFERENCIAS_ARMAS
      ORDER BY DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS DESC
    `);

    const mapped = (rows || []).map((r: any) => {
      let weapons = [];
      try {
        weapons = typeof r.weaponsJson === 'string' ? JSON.parse(r.weaponsJson) : (r.weaponsJson || []);
      } catch (e) {
        weapons = [];
      }
      return {
        id: r.id,
        protocolNumber: r.protocolNumber,
        transferDate: r.transferDate,
        originDepartmentId: r.originDepartmentId,
        originDepartmentName: r.originDepartmentName,
        originUnitId: r.originUnitId,
        originUnitName: r.originUnitName,
        destinationDepartmentId: r.destinationDepartmentId,
        destinationDepartmentName: r.destinationDepartmentName,
        destinationUnitId: r.destinationUnitId,
        destinationUnitName: r.destinationUnitName,
        destinationArmorerId: r.destinationArmorerId,
        destinationArmorerName: r.destinationArmorerName,
        destinationArmorerMasp: r.destinationArmorerMasp,
        destinationVaultSpaceId: r.destinationVaultSpaceId,
        destinationVaultSpaceCode: r.destinationVaultSpaceCode,
        transferredByUserId: r.transferredByUserId,
        transferredByUserName: r.transferredByUserName,
        transferredByUserMasp: r.transferredByUserMasp,
        transferredByUserRole: r.transferredByUserRole,
        receiverOrTransporterName: r.receiverOrTransporterName,
        receiverOrTransporterMasp: r.receiverOrTransporterMasp,
        receiverOrTransporterCargo: r.receiverOrTransporterCargo,
        reason: r.reason,
        weapons,
        totalWeapons: r.totalWeapons || (weapons ? weapons.length : 1),
        totalMagazines: r.totalMagazines || 0,
        observation: r.observation,
        status: (r.status || (r.receivedAt ? 'Recebido' : 'Pendente')),
        receivedAt: r.receivedAt,
        receivedByUserId: r.receivedByUserId,
        receivedByUserName: r.receivedByUserName,
        receivedByUserMasp: r.receivedByUserMasp,
        receivedByUserRole: r.receivedByUserRole,
        createdAt: r.createdAt
      };
    });

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/weapon-transfers', async (req: Request, res: Response) => {
  try {
    const {
      originDepartmentId,
      originDepartmentName,
      originUnitId,
      originUnitName,
      destinationDepartmentId,
      destinationDepartmentName,
      destinationUnitId,
      destinationUnitName,
      destinationArmorerId,
      destinationArmorerName,
      destinationArmorerMasp,
      destinationVaultSpaceId,
      destinationVaultSpaceCode,
      receiverOrTransporterName,
      receiverOrTransporterMasp,
      receiverOrTransporterCargo,
      reason,
      weapons,
      observation,
      actor
    } = req.body;

    if (!actor) {
      return res.status(401).json({ error: 'Sessão não autorizada ou expirada.' });
    }

    const actorRole = actor.activeRole || actor.role || '';
    const allowedRoles = ['Geral', 'Administrador', 'Armeiro'];
    if (!allowedRoles.includes(actorRole)) {
      return res.status(403).json({ error: 'Apenas Armeiro, Administrador e perfil Geral têm permissão para transferir armas entre unidades.' });
    }

    const hasDeptScope =
      actorRole === 'Geral' ||
      actorRole === 'Administrador' ||
      (actorRole === 'Armeiro' && actor.managementScope === 'department');

    // Restrição de Segurança: Armeiro de unidade só transfere da própria unidade; Armeiro/Admin de departamento transfere de qualquer unidade do seu departamento
    if (actorRole !== 'Geral') {
      if (!hasDeptScope && actor.unitId && originUnitId && originUnitId !== actor.unitId) {
        return res.status(403).json({
          error: 'Você só possui permissão para transferir armas pertencentes à sua própria unidade.'
        });
      }
      if (hasDeptScope && actor.departmentId && originUnitId) {
        const poolCheck = getPool();
        const [origUnitRows]: any = await poolCheck.query(
          'SELECT DEPARTAMENTO_ID_UNIDADES as deptId FROM UNIDADES WHERE ID_UNIDADES = ? LIMIT 1',
          [originUnitId]
        );
        if (origUnitRows && origUnitRows.length > 0 && origUnitRows[0].deptId && origUnitRows[0].deptId !== actor.departmentId) {
          return res.status(403).json({
            error: 'Você só possui permissão para transferir armas de unidades vinculadas ao seu departamento.'
          });
        }
      }
    }

    if (!destinationUnitId) {
      return res.status(400).json({ error: 'Selecione a unidade de destino.' });
    }

    if (originUnitId === destinationUnitId) {
      return res.status(400).json({ error: 'A unidade de destino deve ser diferente da unidade de origem.' });
    }

    if (!Array.isArray(weapons) || weapons.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma arma para transferir.' });
    }

    if (!receiverOrTransporterName || !receiverOrTransporterName.trim()) {
      return res.status(400).json({ error: 'Informe o nome do policial transportador/recebedor responsável.' });
    }

    if (!receiverOrTransporterMasp || !receiverOrTransporterMasp.trim()) {
      return res.status(400).json({ error: 'Informe o MASP do policial transportador/recebedor.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Informe o motivo/justificativa da transferência.' });
    }

    const pool = getPool();
    const currentYear = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transferId = `trf-${Date.now()}`;
    const protocolNumber = `TRF-${currentYear}-${randomSuffix}`;
    const nowIso = new Date().toISOString();

    let totalMagazines = 0;
    const weaponIdsToUpdate: string[] = [];

    for (const w of weapons) {
      if (w.weaponId) {
        weaponIdsToUpdate.push(w.weaponId);
      }
      totalMagazines += Number(w.magazineQuantity) || 0;
    }

    // Verify all weapons belong to origin unit and are not 'Em Trânsito' or 'Em Aula'
    if (weaponIdsToUpdate.length > 0) {
      const [dbWeaps]: any = await pool.query(
        `SELECT ID_ARMAS as id, NUMERO_SERIE_ARMAS as numero_serie, STATUS_ARMAS as status, UNIDADE_ID_ARMAS as unidade_id, DEPARTAMENTO_ID_ARMAS as departamento_id FROM ARMAS WHERE ID_ARMAS IN (${weaponIdsToUpdate.map(() => '?').join(',')})`,
        weaponIdsToUpdate
      );

      for (const dw of (dbWeaps || [])) {
        // Validação da unidade/departamento da arma para Armeiro e Administrador
        if (actorRole !== 'Geral') {
          if (!hasDeptScope && actor.unitId && dw.unidade_id !== actor.unitId) {
            return res.status(403).json({
              error: `A arma de série ${dw.numero_serie} não pertence à sua unidade e não pode ser transferida por você.`
            });
          }
          if (hasDeptScope && actor.departmentId && dw.departamento_id && dw.departamento_id !== actor.departmentId) {
            return res.status(403).json({
              error: `A arma de série ${dw.numero_serie} não pertence ao seu departamento e não pode ser transferida por você.`
            });
          }
        }

        if (originUnitId && dw.unidade_id !== originUnitId) {
          return res.status(400).json({
            error: `A arma de série ${dw.numero_serie} não pertence à unidade de origem informada.`
          });
        }

        if (dw.status === 'Em Trânsito' || dw.status === 'Em Aula') {
          return res.status(400).json({
            error: `A arma de série ${dw.numero_serie} está com status "${dw.status}" e não pode ser transferida enquanto não for devolvida ao cofre.`
          });
        }
      }

      // Atualiza localização das armas para novo departamento e unidade com status 'Pendente de Recibo'
      for (const wId of weaponIdsToUpdate) {
        await pool.query(
          `UPDATE ARMAS SET 
            DEPARTAMENTO_ID_ARMAS = ?,
            UNIDADE_ID_ARMAS = ?,
            COFRE_ID_ARMAS = NULL,
            STATUS_ARMAS = 'Pendente de Recibo'
           WHERE ID_ARMAS = ?`,
          [destinationDepartmentId, destinationUnitId, wId]
        );
      }
    }

    // Salva registro da transferência com status 'Pendente'
    try {
      await pool.query(
        `INSERT INTO TRANSFERENCIAS_ARMAS (
          ID_TRANSFERENCIAS_ARMAS,
          NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS,
          DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS,
          ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS,
          ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS,
          ORIGEM_UNIDADE_ID_TRANSFERENCIAS_ARMAS,
          ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_ARMAS,
          DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS,
          DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS,
          DESTINO_UNIDADE_ID_TRANSFERENCIAS_ARMAS,
          DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS,
          DESTINO_ARMEIRO_ID_TRANSFERENCIAS_ARMAS,
          DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_ARMAS,
          DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_ARMAS,
          DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS,
          DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS,
          RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS,
          RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS,
          RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS,
          RESPONSAVEL_PERFIL_TRANSFERENCIAS_ARMAS,
          TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS,
          TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS,
          TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS,
          MOTIVO_TRANSFERENCIAS_ARMAS,
          ARMAS_JSON_TRANSFERENCIAS_ARMAS,
          TOTAL_ARMAS_TRANSFERENCIAS_ARMAS,
          TOTAL_CARREGADORES_TRANSFERENCIAS_ARMAS,
          OBSERVACAO_TRANSFERENCIAS_ARMAS,
          STATUS_TRANSFERENCIAS_ARMAS,
          DATA_CRIACAO_TRANSFERENCIAS_ARMAS
        ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', NOW())`,
        [
          transferId,
          protocolNumber,
          originDepartmentId || null,
          originDepartmentName || null,
          originUnitId || null,
          originUnitName || null,
          destinationDepartmentId || null,
          destinationDepartmentName || null,
          destinationUnitId || null,
          destinationUnitName || null,
          destinationArmorerId || null,
          destinationArmorerName || null,
          destinationArmorerMasp || null,
          destinationVaultSpaceId || null,
          destinationVaultSpaceCode || null,
          actor.id,
          actor.name,
          actor.masp,
          actor.role,
          receiverOrTransporterName.trim(),
          receiverOrTransporterMasp.trim(),
          receiverOrTransporterCargo ? receiverOrTransporterCargo.trim() : null,
          reason.trim(),
          JSON.stringify(weapons),
          weapons.length,
          totalMagazines,
          observation ? observation.trim() : null
        ]
      );
    } catch (insertErr: any) {
      if (insertErr.code === 'ER_BAD_FIELD_ERROR' || (insertErr.message && insertErr.message.includes('DESTINO_ARMEIRO'))) {
        try {
          await pool.query(`
            ALTER TABLE \`TRANSFERENCIAS_ARMAS\` 
              ADD COLUMN IF NOT EXISTS \`DESTINO_ARMEIRO_ID_TRANSFERENCIAS_ARMAS\` VARCHAR(64) DEFAULT NULL AFTER \`DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS\`,
              ADD COLUMN IF NOT EXISTS \`DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_ARMAS\` VARCHAR(255) DEFAULT NULL AFTER \`DESTINO_ARMEIRO_ID_TRANSFERENCIAS_ARMAS\`,
              ADD COLUMN IF NOT EXISTS \`DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_ARMAS\` VARCHAR(64) DEFAULT NULL AFTER \`DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_ARMAS\`
          `);
          await pool.query(
            `INSERT INTO TRANSFERENCIAS_ARMAS (
              ID_TRANSFERENCIAS_ARMAS,
              NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS,
              DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS,
              ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS,
              ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS,
              ORIGEM_UNIDADE_ID_TRANSFERENCIAS_ARMAS,
              ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_UNIDADE_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_ARMEIRO_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_ARMAS,
              DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_PERFIL_TRANSFERENCIAS_ARMAS,
              TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS,
              TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS,
              TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS,
              MOTIVO_TRANSFERENCIAS_ARMAS,
              ARMAS_JSON_TRANSFERENCIAS_ARMAS,
              TOTAL_ARMAS_TRANSFERENCIAS_ARMAS,
              TOTAL_CARREGADORES_TRANSFERENCIAS_ARMAS,
              OBSERVACAO_TRANSFERENCIAS_ARMAS,
              STATUS_TRANSFERENCIAS_ARMAS,
              DATA_CRIACAO_TRANSFERENCIAS_ARMAS
            ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', NOW())`,
            [
              transferId,
              protocolNumber,
              originDepartmentId || null,
              originDepartmentName || null,
              originUnitId || null,
              originUnitName || null,
              destinationDepartmentId || null,
              destinationDepartmentName || null,
              destinationUnitId || null,
              destinationUnitName || null,
              destinationArmorerId || null,
              destinationArmorerName || null,
              destinationArmorerMasp || null,
              destinationVaultSpaceId || null,
              destinationVaultSpaceCode || null,
              actor.id,
              actor.name,
              actor.masp,
              actor.role,
              receiverOrTransporterName.trim(),
              receiverOrTransporterMasp.trim(),
              receiverOrTransporterCargo ? receiverOrTransporterCargo.trim() : null,
              reason.trim(),
              JSON.stringify(weapons),
              weapons.length,
              totalMagazines,
              observation ? observation.trim() : null
            ]
          );
        } catch {
          // Fallback sem as colunas do armeiro se o ALTER TABLE falhar
          await pool.query(
            `INSERT INTO TRANSFERENCIAS_ARMAS (
              ID_TRANSFERENCIAS_ARMAS,
              NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS,
              DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS,
              ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS,
              ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS,
              ORIGEM_UNIDADE_ID_TRANSFERENCIAS_ARMAS,
              ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_UNIDADE_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS,
              DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS,
              DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS,
              RESPONSAVEL_PERFIL_TRANSFERENCIAS_ARMAS,
              TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS,
              TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS,
              TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS,
              MOTIVO_TRANSFERENCIAS_ARMAS,
              ARMAS_JSON_TRANSFERENCIAS_ARMAS,
              TOTAL_ARMAS_TRANSFERENCIAS_ARMAS,
              TOTAL_CARREGADORES_TRANSFERENCIAS_ARMAS,
              OBSERVACAO_TRANSFERENCIAS_ARMAS,
              STATUS_TRANSFERENCIAS_ARMAS,
              DATA_CRIACAO_TRANSFERENCIAS_ARMAS
            ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', NOW())`,
            [
              transferId,
              protocolNumber,
              originDepartmentId || null,
              originDepartmentName || null,
              originUnitId || null,
              originUnitName || null,
              destinationDepartmentId || null,
              destinationDepartmentName || null,
              destinationUnitId || null,
              destinationUnitName || null,
              destinationVaultSpaceId || null,
              destinationVaultSpaceCode || null,
              actor.id,
              actor.name,
              actor.masp,
              actor.role,
              receiverOrTransporterName.trim(),
              receiverOrTransporterMasp.trim(),
              receiverOrTransporterCargo ? receiverOrTransporterCargo.trim() : null,
              reason.trim(),
              JSON.stringify(weapons),
              weapons.length,
              totalMagazines,
              observation ? observation.trim() : null
            ]
          );
        }
      } else {
        throw insertErr;
      }
    }

    const weaponSerials = weapons.map((w: any) => w.serialNumber).join(', ');
    await insertAuditLog(
      'Armas',
      'Transferência entre Unidades',
      `Transferência de ${weapons.length} arma(s) (${weaponSerials}) de ${originUnitName} para ${destinationUnitName} iniciada com status Pendente de Recebimento. Protocolo: ${protocolNumber}`,
      actor,
      req.ip
    );

    const createdTransfer = {
      id: transferId,
      protocolNumber,
      transferDate: nowIso,
      originDepartmentId,
      originDepartmentName,
      originUnitId,
      originUnitName,
      destinationDepartmentId,
      destinationDepartmentName,
      destinationUnitId,
      destinationUnitName,
      destinationArmorerId,
      destinationArmorerName,
      destinationArmorerMasp,
      destinationVaultSpaceId,
      destinationVaultSpaceCode,
      transferredByUserId: actor.id,
      transferredByUserName: actor.name,
      transferredByUserMasp: actor.masp,
      transferredByUserRole: actor.role,
      receiverOrTransporterName: receiverOrTransporterName.trim(),
      receiverOrTransporterMasp: receiverOrTransporterMasp.trim(),
      receiverOrTransporterCargo: receiverOrTransporterCargo ? receiverOrTransporterCargo.trim() : '',
      reason: reason.trim(),
      weapons,
      totalWeapons: weapons.length,
      totalMagazines,
      observation: observation ? observation.trim() : '',
      status: 'Pendente' as const,
      createdAt: nowIso
    };

    return res.json({ success: true, transfer: createdTransfer });
  } catch (err: any) {
    console.error('Error transferring weapons:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Confirm Receipt of Transferred Weapons at the Destination Unit
apiRouter.post('/weapon-transfers/:id/receive', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { destinationVaultSpaceId, observation, actor } = req.body;

    if (!actor) {
      return res.status(401).json({ error: 'Sessão não autorizada ou expirada.' });
    }

    const pool = getPool();
    const [rows]: any = await pool.query(
      `SELECT 
        ID_TRANSFERENCIAS_ARMAS as id,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS as numero_protocolo,
        DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS as data_transferencia,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS as origem_departamento_id,
        ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS as origem_departamento_nome,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_ARMAS as origem_unidade_id,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_ARMAS as origem_unidade_nome,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS as destino_departamento_id,
        DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS as destino_departamento_nome,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_ARMAS as destino_unidade_id,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS as destino_unidade_nome,
        DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS as destino_cofre_id,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS as destino_cofre_codigo,
        RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS as responsavel_id,
        RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS as responsavel_nome,
        RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS as responsavel_masp,
        RESPONSAVEL_PERFIL_TRANSFERENCIAS_ARMAS as responsavel_perfil,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS as transportador_nome,
        TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS as transportador_masp,
        TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS as transportador_cargo,
        MOTIVO_TRANSFERENCIAS_ARMAS as motivo,
        ARMAS_JSON_TRANSFERENCIAS_ARMAS as armas_json,
        TOTAL_ARMAS_TRANSFERENCIAS_ARMAS as total_armas,
        TOTAL_CARREGADORES_TRANSFERENCIAS_ARMAS as total_carregadores,
        OBSERVACAO_TRANSFERENCIAS_ARMAS as observacao,
        STATUS_TRANSFERENCIAS_ARMAS as status,
        RECEBIDO_EM_TRANSFERENCIAS_ARMAS as recebido_em,
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_ARMAS as recebido_por_usuario_id,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_ARMAS as recebido_por_nome,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_ARMAS as recebido_por_masp,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_ARMAS as recebido_por_perfil,
        DATA_CRIACAO_TRANSFERENCIAS_ARMAS as data_criacao
      FROM TRANSFERENCIAS_ARMAS WHERE ID_TRANSFERENCIAS_ARMAS = ?`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Registro de transferência não encontrado.' });
    }

    const transfer = rows[0];

    if (transfer.status === 'Recebido') {
      return res.status(400).json({ error: 'Esta transferência já foi recebida e confirmada no cofre da unidade.' });
    }

    // Permission check: Geral, or Armeiro / Administrador of the destination unit/dept
    const actorRole = actor.activeRole || actor.role || '';
    const isGeral = actorRole === 'Geral';
    const isDestAdmin = actorRole === 'Administrador' && (actor.departmentId === transfer.destino_departamento_id || !actor.departmentId);
    const isDestArmeiro = actorRole === 'Armeiro' && (
      actor.unitId === transfer.destino_unidade_id ||
      (actor.managementScope === 'department' && actor.departmentId === transfer.destino_departamento_id)
    );

    if (!isGeral && !isDestAdmin && !isDestArmeiro) {
      return res.status(403).json({
        error: 'Apenas o Armeiro, Administrador ou usuário Geral da unidade de destino podem receber e confirmar o armamento no cofre.'
      });
    }

    let finalVaultSpaceId = destinationVaultSpaceId || transfer.destino_cofre_id;
    if (!finalVaultSpaceId) {
      try {
        const [destVaults]: any = await pool.query(
          `SELECT ID_COFRES as id, CODIGO_COFRES as codigo FROM COFRES WHERE UNIDADE_ID_COFRES = ? AND TIPO_COFRES = 'ARMAS' LIMIT 1`,
          [transfer.destino_unidade_id]
        );
        if (destVaults && destVaults.length > 0) {
          finalVaultSpaceId = destVaults[0].id;
        }
      } catch (_) {}
    }

    // Fetch vault code for destination cofre
    let vaultCode = transfer.destino_cofre_codigo || 'Cofre Principal';
    if (finalVaultSpaceId) {
      try {
        const [vaultRows]: any = await pool.query(
          `SELECT CODIGO_COFRES as codigo FROM COFRES WHERE ID_COFRES = ?`,
          [finalVaultSpaceId]
        );
        if (vaultRows && vaultRows.length > 0) {
          vaultCode = vaultRows[0].codigo;
        }
      } catch (_) {}
    }

    // Parse weapons in transfer
    let weaponsList: any[] = [];
    try {
      weaponsList = typeof transfer.armas_json === 'string' ? JSON.parse(transfer.armas_json) : (transfer.armas_json || []);
    } catch (e) {
      weaponsList = [];
    }

    const weaponIds = weaponsList.map((w: any) => w.weaponId || w.id).filter(Boolean);

    // Atualiza armas para 'No Cofre' e vincula ao cofre de destino
    if (weaponIds.length > 0) {
      await pool.query(
        `UPDATE ARMAS SET 
          COFRE_ID_ARMAS = ?,
          STATUS_ARMAS = 'No Cofre',
          DEPARTAMENTO_ID_ARMAS = ?,
          UNIDADE_ID_ARMAS = ?
         WHERE ID_ARMAS IN (${weaponIds.map(() => '?').join(',')})`,
        [finalVaultSpaceId || null, transfer.destino_departamento_id, transfer.destino_unidade_id, ...weaponIds]
      );
    }

    // Atualiza status da transferência para 'Recebido'
    await pool.query(
      `UPDATE TRANSFERENCIAS_ARMAS SET 
        STATUS_TRANSFERENCIAS_ARMAS = 'Recebido',
        DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS = ?,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS = ?,
        RECEBIDO_EM_TRANSFERENCIAS_ARMAS = NOW(),
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_ARMAS = ?,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_ARMAS = ?,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_ARMAS = ?,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_ARMAS = ?,
        OBSERVACAO_TRANSFERENCIAS_ARMAS = COALESCE(?, OBSERVACAO_TRANSFERENCIAS_ARMAS)
       WHERE ID_TRANSFERENCIAS_ARMAS = ?`,
      [
        finalVaultSpaceId || null,
        vaultCode,
        actor.id,
        actor.name,
        actor.masp,
        actor.role,
        observation ? observation.trim() : null,
        id
      ]
    );

    const weaponSerials = weaponsList.map((w: any) => w.serialNumber).join(', ');
    await insertAuditLog(
      'Armas',
      'Recebimento de Transferência',
      `Recebimento confirmado de ${weaponsList.length} arma(s) (${weaponSerials}) na unidade ${transfer.destino_unidade_nome} (Espaço do Cofre: ${vaultCode}). Protocolo: ${transfer.numero_protocolo}`,
      actor,
      req.ip
    );

    // Fetch updated transfer object for immediate receipt printing
    let updatedTransfer: any = null;
    try {
      const [updatedRows]: any = await pool.query(
        `SELECT ID_TRANSFERENCIAS_ARMAS as id, STATUS_TRANSFERENCIAS_ARMAS as status, NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS as numero_protocolo FROM TRANSFERENCIAS_ARMAS WHERE ID_TRANSFERENCIAS_ARMAS = ?`,
        [id]
      );
      if (updatedRows && updatedRows.length > 0) {
        const r = updatedRows[0];
        let weapons = [];
        try {
          weapons = typeof r.weapons_json === 'string' ? JSON.parse(r.weapons_json) : (r.weapons_json || weaponsList);
        } catch (e) {
          weapons = weaponsList;
        }
        updatedTransfer = {
          id: r.id,
          protocolNumber: r.protocol_number,
          transferDate: r.transfer_date,
          originDepartmentId: r.origin_department_id,
          originDepartmentName: r.origin_department_name,
          originUnitId: r.origin_unit_id,
          originUnitName: r.origin_unit_name,
          destinationDepartmentId: r.destination_department_id,
          destinationDepartmentName: r.destination_department_name,
          destinationUnitId: r.destination_unit_id,
          destinationUnitName: r.destination_unit_name,
          destinationVaultSpaceId: r.destination_vault_space_id,
          destinationVaultSpaceCode: r.destination_vault_space_code,
          transferredByUserId: r.transferred_by_user_id,
          transferredByUserName: r.transferred_by_user_name,
          transferredByUserMasp: r.transferred_by_user_masp,
          transferredByUserRole: r.transferred_by_user_role,
          receiverOrTransporterName: r.receiver_or_transporter_name,
          receiverOrTransporterMasp: r.receiver_or_transporter_masp,
          receiverOrTransporterCargo: r.receiver_or_transporter_cargo,
          reason: r.reason,
          weapons,
          totalWeapons: r.total_weapons || (weapons ? weapons.length : 1),
          totalMagazines: r.total_magazines || 0,
          observation: r.observation,
          status: 'Recebido',
          receivedAt: r.received_at,
          receivedByUserId: r.received_by_user_id,
          receivedByUserName: r.received_by_user_name,
          receivedByUserMasp: r.received_by_user_masp,
          receivedByUserRole: r.received_by_user_role,
          createdAt: r.created_at
        };
      }
    } catch (_) {}

    return res.json({
      success: true,
      transfer: updatedTransfer,
      message: `Armamento recebido com sucesso no cofre "${vaultCode}". As armas agora constam no mapa do cofre da unidade.`
    });
  } catch (err: any) {
    console.error('Error receiving weapon transfer:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/weapon-transfers/:id/undo - Desfazer / Cancelar transferência pendente
apiRouter.post('/weapon-transfers/:id/undo', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, actor } = req.body;

    if (!actor) {
      return res.status(401).json({ error: 'Sessão não autorizada ou expirada.' });
    }

    const pool = getPool();
    const [rows]: any = await pool.query(
      `SELECT 
        ID_TRANSFERENCIAS_ARMAS as id,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_ARMAS as numero_protocolo,
        DATA_TRANSFERENCIA_TRANSFERENCIAS_ARMAS as data_transferencia,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS as origem_departamento_id,
        ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS as origem_departamento_nome,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_ARMAS as origem_unidade_id,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_ARMAS as origem_unidade_nome,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_ARMAS as destino_departamento_id,
        DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_ARMAS as destino_departamento_nome,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_ARMAS as destino_unidade_id,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_ARMAS as destino_unidade_nome,
        DESTINO_COFRE_ID_TRANSFERENCIAS_ARMAS as destino_cofre_id,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_ARMAS as destino_cofre_codigo,
        RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS as responsavel_id,
        RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS as responsavel_nome,
        RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS as responsavel_masp,
        RESPONSAVEL_PERFIL_TRANSFERENCIAS_ARMAS as responsavel_perfil,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS as transportador_nome,
        TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS as transportador_masp,
        TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS as transportador_cargo,
        MOTIVO_TRANSFERENCIAS_ARMAS as motivo,
        ARMAS_JSON_TRANSFERENCIAS_ARMAS as armas_json,
        TOTAL_ARMAS_TRANSFERENCIAS_ARMAS as total_armas,
        TOTAL_CARREGADORES_TRANSFERENCIAS_ARMAS as total_carregadores,
        OBSERVACAO_TRANSFERENCIAS_ARMAS as observacao,
        STATUS_TRANSFERENCIAS_ARMAS as status,
        RECEBIDO_EM_TRANSFERENCIAS_ARMAS as recebido_em,
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_ARMAS as recebido_por_usuario_id,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_ARMAS as recebido_por_nome,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_ARMAS as recebido_por_masp,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_ARMAS as recebido_por_perfil,
        DATA_CRIACAO_TRANSFERENCIAS_ARMAS as data_criacao
      FROM TRANSFERENCIAS_ARMAS WHERE ID_TRANSFERENCIAS_ARMAS = ?`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Transferência não encontrada.' });
    }

    const transfer = rows[0];

    if (transfer.status === 'Recebido') {
      return res.status(400).json({
        error: 'Não é possível desfazer esta transferência porque o armamento já foi confirmado e recebido no cofre da unidade de destino.'
      });
    }

    if (transfer.status === 'Cancelado') {
      return res.status(400).json({
        error: 'Esta transferência já se encontra desfeita/cancelada.'
      });
    }

    // Permission check: Geral, criador da transferência, Armeiro ou Administrador da unidade/departamento de origem ou destino
    const actorRole = actor.activeRole || actor.role || '';
    const isGeral = actorRole === 'Geral';
    const isCreator = actor.id === transfer.responsavel_id;
    const isOriginAdmin = actorRole === 'Administrador' && (actor.departmentId === transfer.origem_departamento_id || !actor.departmentId);
    const isOriginArmeiro = actorRole === 'Armeiro' && (
      actor.unitId === transfer.origem_unidade_id ||
      (actor.managementScope === 'department' && actor.departmentId === transfer.origem_departamento_id)
    );
    const isDestAdmin = actorRole === 'Administrador' && (actor.departmentId === transfer.destino_departamento_id || !actor.departmentId);
    const isDestArmeiro = actorRole === 'Armeiro' && (
      actor.unitId === transfer.destino_unidade_id ||
      (actor.managementScope === 'department' && actor.departmentId === transfer.destino_departamento_id)
    );

    if (!isGeral && !isCreator && !isOriginAdmin && !isOriginArmeiro && !isDestAdmin && !isDestArmeiro) {
      return res.status(403).json({
        error: 'Você não possui permissão para desfazer esta transferência.'
      });
    }

    // Parse weapons in transfer
    let weaponsList: any[] = [];
    try {
      weaponsList = typeof transfer.armas_json === 'string' ? JSON.parse(transfer.armas_json) : (transfer.armas_json || []);
    } catch (e) {
      weaponsList = [];
    }

    const weaponIds = weaponsList.map((w: any) => w.weaponId || w.id).filter(Boolean);

    // Find vault space in origin unit to restore weapons to cofre
    let originVaultId: string | null = null;
    try {
      const [originVaults]: any = await pool.query(
        `SELECT ID_COFRES as id, CODIGO_COFRES as codigo FROM COFRES WHERE UNIDADE_ID_COFRES = ? AND TIPO_COFRES = 'ARMAS' LIMIT 1`,
        [transfer.origem_unidade_id]
      );
      if (originVaults && originVaults.length > 0) {
        originVaultId = originVaults[0].id;
      }
    } catch (_) {}

    // Retorna armas para a unidade e departamento de origem com status 'No Cofre'
    if (weaponIds.length > 0) {
      await pool.query(
        `UPDATE ARMAS SET 
          DEPARTAMENTO_ID_ARMAS = ?,
          UNIDADE_ID_ARMAS = ?,
          COFRE_ID_ARMAS = COALESCE(?, COFRE_ID_ARMAS),
          STATUS_ARMAS = 'No Cofre'
         WHERE ID_ARMAS IN (${weaponIds.map(() => '?').join(',')})`,
        [transfer.origem_departamento_id, transfer.origem_unidade_id, originVaultId, ...weaponIds]
      );
    }

    // Atualiza status da transferência para 'Cancelado'
    const cancellationNote = `[Transferência desfeita por ${actor.name} (${actor.masp || actor.role}) em ${new Date().toLocaleString('pt-BR')}${reason ? ' - Motivo: ' + reason.trim() : ''}]`;
    
    await pool.query(
      `UPDATE TRANSFERENCIAS_ARMAS SET 
        STATUS_TRANSFERENCIAS_ARMAS = 'Cancelado',
        OBSERVACAO_TRANSFERENCIAS_ARMAS = CONCAT(COALESCE(OBSERVACAO_TRANSFERENCIAS_ARMAS, ''), CASE WHEN OBSERVACAO_TRANSFERENCIAS_ARMAS IS NULL OR OBSERVACAO_TRANSFERENCIAS_ARMAS = '' THEN '' ELSE '\n' END, ?)
       WHERE ID_TRANSFERENCIAS_ARMAS = ?`,
      [cancellationNote, id]
    );

    const weaponSerials = weaponsList.map((w: any) => w.serialNumber).join(', ');
    await insertAuditLog(
      'Armas',
      'Desfazer Transferência',
      `Transferência protocolo ${transfer.numero_protocolo || transfer.id} (${weaponsList.length} arma(s): ${weaponSerials}) desfeita por ${actor.name} (${actor.masp}). O armamento retornou ao cofre da unidade de origem (${transfer.origem_unidade_nome}).`,
      actor,
      req.ip
    );

    return res.json({
      success: true,
      message: `Transferência desfeita com sucesso! As armas retornaram à unidade de origem (${transfer.origem_unidade_nome}) com status "No Cofre".`
    });
  } catch (err: any) {
    console.error('Error undoing weapon transfer:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Alias for cancel
apiRouter.post('/weapon-transfers/:id/cancel', async (req: Request, res: Response) => {
  return (apiRouter as any).handle(Object.assign(req, { url: `/weapon-transfers/${req.params.id}/undo` }), res);
});

// -------------------------------------------------------------
// AMMO TRANSFERS BETWEEN UNITS (TRANSFERÊNCIAS DE MUNIÇÕES)
// Only Armeiro, Administrador, and Geral can view and transfer
// -------------------------------------------------------------
apiRouter.get('/ammo-transfers', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_TRANSFERENCIAS_MUNICOES as id,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_MUNICOES as protocolNumber,
        DATA_TRANSFERENCIA_TRANSFERENCIAS_MUNICOES as transferDate,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_MUNICOES as originDepartmentId,
        ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_MUNICOES as originDepartmentName,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_MUNICOES as originUnitId,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_MUNICOES as originUnitName,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_MUNICOES as destinationDepartmentId,
        DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_MUNICOES as destinationDepartmentName,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_MUNICOES as destinationUnitId,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_MUNICOES as destinationUnitName,
        DESTINO_ARMEIRO_ID_TRANSFERENCIAS_MUNICOES as destinationArmorerId,
        DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_MUNICOES as destinationArmorerName,
        DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_MUNICOES as destinationArmorerMasp,
        DESTINO_COFRE_ID_TRANSFERENCIAS_MUNICOES as destinationVaultSpaceId,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_MUNICOES as destinationVaultSpaceCode,
        RESPONSAVEL_ID_TRANSFERENCIAS_MUNICOES as transferredByUserId,
        RESPONSAVEL_NOME_TRANSFERENCIAS_MUNICOES as transferredByUserName,
        RESPONSAVEL_MASP_TRANSFERENCIAS_MUNICOES as transferredByUserMasp,
        RESPONSAVEL_PERFIL_TRANSFERENCIAS_MUNICOES as transferredByUserRole,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_MUNICOES as receiverOrTransporterName,
        TRANSPORTADOR_MASP_TRANSFERENCIAS_MUNICOES as receiverOrTransporterMasp,
        TRANSPORTADOR_CARGO_TRANSFERENCIAS_MUNICOES as receiverOrTransporterCargo,
        MOTIVO_TRANSFERENCIAS_MUNICOES as reason,
        MUNICOES_JSON_TRANSFERENCIAS_MUNICOES as itemsJson,
        TOTAL_MUNICOES_TRANSFERENCIAS_MUNICOES as totalQuantity,
        OBSERVACAO_TRANSFERENCIAS_MUNICOES as observation,
        STATUS_TRANSFERENCIAS_MUNICOES as status,
        RECEBIDO_EM_TRANSFERENCIAS_MUNICOES as receivedAt,
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_MUNICOES as receivedByUserId,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_MUNICOES as receivedByUserName,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_MUNICOES as receivedByUserMasp,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_MUNICOES as receivedByUserRole,
        DATA_CRIACAO_TRANSFERENCIAS_MUNICOES as createdAt
      FROM TRANSFERENCIAS_MUNICOES
      ORDER BY DATA_TRANSFERENCIA_TRANSFERENCIAS_MUNICOES DESC
    `);

    const mapped = (rows || []).map((r: any) => {
      let items = [];
      try {
        items = typeof r.itemsJson === 'string' ? JSON.parse(r.itemsJson) : (r.itemsJson || []);
      } catch {
        items = [];
      }
      return {
        id: r.id,
        protocolNumber: r.protocolNumber,
        transferDate: r.transferDate,
        originDepartmentId: r.originDepartmentId,
        originDepartmentName: r.originDepartmentName,
        originUnitId: r.originUnitId,
        originUnitName: r.originUnitName,
        destinationDepartmentId: r.destinationDepartmentId,
        destinationDepartmentName: r.destinationDepartmentName,
        destinationUnitId: r.destinationUnitId,
        destinationUnitName: r.destinationUnitName,
        destinationArmorerId: r.destinationArmorerId,
        destinationArmorerName: r.destinationArmorerName,
        destinationArmorerMasp: r.destinationArmorerMasp,
        destinationVaultSpaceId: r.destinationVaultSpaceId,
        destinationVaultSpaceCode: r.destinationVaultSpaceCode,
        transferredByUserId: r.transferredByUserId,
        transferredByUserName: r.transferredByUserName,
        transferredByUserMasp: r.transferredByUserMasp,
        transferredByUserRole: r.transferredByUserRole,
        receiverOrTransporterName: r.receiverOrTransporterName,
        receiverOrTransporterMasp: r.receiverOrTransporterMasp,
        receiverOrTransporterCargo: r.receiverOrTransporterCargo,
        reason: r.reason,
        items,
        totalQuantity: r.totalQuantity || (items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 0), 0)),
        observation: r.observation,
        status: (r.status || (r.receivedAt ? 'Recebido' : 'Pendente')),
        receivedAt: r.receivedAt,
        receivedByUserId: r.receivedByUserId,
        receivedByUserName: r.receivedByUserName,
        receivedByUserMasp: r.receivedByUserMasp,
        receivedByUserRole: r.receivedByUserRole,
        createdAt: r.createdAt
      };
    });

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/ammo-transfers', async (req: Request, res: Response) => {
  try {
    const {
      originDepartmentId,
      originDepartmentName,
      originUnitId,
      originUnitName,
      destinationDepartmentId,
      destinationDepartmentName,
      destinationUnitId,
      destinationUnitName,
      destinationArmorerId,
      destinationArmorerName,
      destinationArmorerMasp,
      receiverOrTransporterName,
      receiverOrTransporterMasp,
      receiverOrTransporterCargo,
      reason,
      items, // AmmoTransferItem[]
      observation,
      actor
    } = req.body;

    if (!actor) {
      return res.status(401).json({ error: 'Sessão não autorizada ou expirada.' });
    }

    const actorRole = actor.activeRole || actor.role || '';
    const allowedRoles = ['Geral', 'Administrador', 'Armeiro'];
    if (!allowedRoles.includes(actorRole)) {
      return res.status(403).json({ error: 'Apenas Armeiro, Administrador e perfil Geral têm permissão para transferir munições entre unidades.' });
    }

    const hasDeptScope =
      actorRole === 'Geral' ||
      actorRole === 'Administrador' ||
      (actorRole === 'Armeiro' && actor.managementScope === 'department');

    if (actorRole !== 'Geral') {
      if (!hasDeptScope && actor.unitId && originUnitId && originUnitId !== actor.unitId) {
        return res.status(403).json({
          error: 'Você só possui permissão para transferir munições pertencentes à sua própria unidade.'
        });
      }
      if (hasDeptScope && actor.departmentId && originUnitId) {
        const poolCheck = getPool();
        const [origUnitRows]: any = await poolCheck.query(
          'SELECT DEPARTAMENTO_ID_UNIDADES as deptId FROM UNIDADES WHERE ID_UNIDADES = ? LIMIT 1',
          [originUnitId]
        );
        if (origUnitRows && origUnitRows.length > 0 && origUnitRows[0].deptId && origUnitRows[0].deptId !== actor.departmentId) {
          return res.status(403).json({
            error: 'Você só possui permissão para transferir munições de unidades vinculadas ao seu departamento.'
          });
        }
      }
    }

    if (!destinationUnitId) {
      return res.status(400).json({ error: 'Selecione a unidade de destino.' });
    }

    if (originUnitId === destinationUnitId) {
      return res.status(400).json({ error: 'A unidade de destino deve ser diferente da unidade de origem.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um lote/tipo de munição para transferir.' });
    }

    if (!receiverOrTransporterName || !receiverOrTransporterName.trim()) {
      return res.status(400).json({ error: 'Informe o nome do policial transportador/recebedor responsável.' });
    }

    if (!receiverOrTransporterMasp || !receiverOrTransporterMasp.trim()) {
      return res.status(400).json({ error: 'Informe o MASP do policial transportador/recebedor.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Informe o motivo/justificativa da transferência.' });
    }

    const pool = getPool();
    let totalQty = 0;

    // Verify each item's stock and deduct from origin vault
    for (const it of items) {
      const q = parseInt(String(it.quantity), 10);
      if (isNaN(q) || q <= 0) {
        return res.status(400).json({ error: 'Quantidade de munição inválida.' });
      }
      totalQty += q;

      if (it.originVaultSpaceId && it.caliberId) {
        let findQuery = 'SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?';
        const findParams: any[] = [it.originVaultSpaceId, it.caliberId];
        if (it.loteMunicao) {
          findQuery += ' AND (LOTE_MUNICAO = ? OR LOTE_MUNICAO IS NULL)';
          findParams.push(it.loteMunicao);
        }
        const [stocks]: any = await pool.query(findQuery, findParams);
        if (!stocks || stocks.length === 0 || Number(stocks[0].quantity) < q) {
          const avail = stocks && stocks[0] ? Number(stocks[0].quantity) : 0;
          return res.status(400).json({
            error: `Estoque insuficiente para o calibre ${it.caliberName || ''} (Lote: ${it.loteMunicao || 'N/A'}). Disponível: ${avail}, Solicitado: ${q}.`
          });
        }

        // Deduct from origin stock
        await pool.query(
          'UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?), DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?',
          [q, stocks[0].id]
        );

        // Record outgoing movement at origin
        const movId = `ammomov-trf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await pool.query(
          `INSERT INTO MOVIMENTACOES_MUNICOES 
           (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
            DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
            FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
            TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
            OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
           VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
          [
            movId, it.caliberId, q, originDepartmentId || null, originUnitId || null, it.originVaultSpaceId,
            `Transferência de Unidade para ${destinationUnitName}`,
            it.fabricante || null, it.tipoMunicao || null, it.pesoMunicao || null, it.loteMunicao || null, it.anoFabricacao || null, it.destinacao || null,
            actor.id, actor.name, actor.masp,
            `Em trânsito para ${destinationUnitName} via ${receiverOrTransporterName}`,
            actor.id, actor.name
          ]
        );
      }
    }

    const currentYear = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const transferId = `trf-mun-${Date.now()}`;
    const protocolNumber = `TRFMUN-${currentYear}-${randomSuffix}`;
    const nowIso = new Date().toISOString();

    await pool.query(
      `INSERT INTO TRANSFERENCIAS_MUNICOES (
        ID_TRANSFERENCIAS_MUNICOES,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_MUNICOES,
        DATA_TRANSFERENCIA_TRANSFERENCIAS_MUNICOES,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_MUNICOES,
        ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_MUNICOES,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_MUNICOES,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_MUNICOES,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_MUNICOES,
        DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_MUNICOES,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_MUNICOES,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_MUNICOES,
        DESTINO_ARMEIRO_ID_TRANSFERENCIAS_MUNICOES,
        DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_MUNICOES,
        DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_MUNICOES,
        RESPONSAVEL_ID_TRANSFERENCIAS_MUNICOES,
        RESPONSAVEL_NOME_TRANSFERENCIAS_MUNICOES,
        RESPONSAVEL_MASP_TRANSFERENCIAS_MUNICOES,
        RESPONSAVEL_PERFIL_TRANSFERENCIAS_MUNICOES,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_MUNICOES,
        TRANSPORTADOR_MASP_TRANSFERENCIAS_MUNICOES,
        TRANSPORTADOR_CARGO_TRANSFERENCIAS_MUNICOES,
        MOTIVO_TRANSFERENCIAS_MUNICOES,
        MUNICOES_JSON_TRANSFERENCIAS_MUNICOES,
        TOTAL_MUNICOES_TRANSFERENCIAS_MUNICOES,
        OBSERVACAO_TRANSFERENCIAS_MUNICOES,
        STATUS_TRANSFERENCIAS_MUNICOES,
        DATA_CRIACAO_TRANSFERENCIAS_MUNICOES
      ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', NOW())`,
      [
        transferId,
        protocolNumber,
        originDepartmentId || null,
        originDepartmentName || null,
        originUnitId || null,
        originUnitName || null,
        destinationDepartmentId || null,
        destinationDepartmentName || null,
        destinationUnitId || null,
        destinationUnitName || null,
        destinationArmorerId || null,
        destinationArmorerName || null,
        destinationArmorerMasp || null,
        actor.id,
        actor.name,
        actor.masp,
        actor.role,
        receiverOrTransporterName.trim(),
        receiverOrTransporterMasp.trim(),
        receiverOrTransporterCargo ? receiverOrTransporterCargo.trim() : null,
        reason.trim(),
        JSON.stringify(items),
        totalQty,
        observation ? observation.trim() : null
      ]
    );

    await insertAuditLog(
      'Munições',
      'Transferência entre Unidades',
      `Transferência de ${totalQty} munições de ${originUnitName} para ${destinationUnitName} iniciada com status Pendente. Protocolo: ${protocolNumber}`,
      actor,
      req.ip
    );

    return res.json({
      id: transferId,
      protocolNumber,
      transferDate: nowIso,
      originDepartmentId,
      originDepartmentName,
      originUnitId,
      originUnitName,
      destinationDepartmentId,
      destinationDepartmentName,
      destinationUnitId,
      destinationUnitName,
      destinationArmorerId,
      destinationArmorerName,
      destinationArmorerMasp,
      items,
      totalQuantity: totalQty,
      status: 'Pendente' as const,
      createdAt: nowIso
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Confirm Receipt of Transferred Ammunition at the Destination Unit
apiRouter.post('/ammo-transfers/:id/receive', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { destinationVaultSpaceId, observation, actor } = req.body;

    if (!actor) {
      return res.status(401).json({ error: 'Sessão não autorizada ou expirada.' });
    }

    if (!destinationVaultSpaceId) {
      return res.status(400).json({ error: 'Selecione o local/cofre da sua unidade onde as munições serão armazenadas.' });
    }

    const pool = getPool();
    const [rows]: any = await pool.query(
      `SELECT 
        ID_TRANSFERENCIAS_MUNICOES as id,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_MUNICOES as numero_protocolo,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_MUNICOES as origem_unidade_id,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_MUNICOES as origem_unidade_nome,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_MUNICOES as destino_departamento_id,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_MUNICOES as destino_unidade_id,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_MUNICOES as destino_unidade_nome,
        DESTINO_ARMEIRO_ID_TRANSFERENCIAS_MUNICOES as destino_armeiro_id,
        MUNICOES_JSON_TRANSFERENCIAS_MUNICOES as municoes_json,
        TOTAL_MUNICOES_TRANSFERENCIAS_MUNICOES as total_municoes,
        STATUS_TRANSFERENCIAS_MUNICOES as status
      FROM TRANSFERENCIAS_MUNICOES WHERE ID_TRANSFERENCIAS_MUNICOES = ?`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Registro de transferência de munições não encontrado.' });
    }

    const transfer = rows[0];

    if (transfer.status === 'Recebido') {
      return res.status(400).json({ error: 'Esta transferência de munições já foi recebida e confirmada.' });
    }

    const actorRole = actor.activeRole || actor.role || '';
    const isGeral = actorRole === 'Geral';
    const isDestAdmin = actorRole === 'Administrador' && (actor.departmentId === transfer.destino_departamento_id || !actor.departmentId);
    const isDestArmeiro = actorRole === 'Armeiro' && (
      actor.unitId === transfer.destino_unidade_id ||
      (actor.managementScope === 'department' && actor.departmentId === transfer.destino_departamento_id)
    );

    if (!isGeral && !isDestAdmin && !isDestArmeiro) {
      return res.status(403).json({
        error: 'Apenas o Armeiro, Administrador ou usuário Geral da unidade de destino podem dar recibo nas munições transferidas.'
      });
    }

    // Verify destination vault belongs to destination unit
    const [vaultRows]: any = await pool.query('SELECT ID_COFRES as id, CODIGO_COFRES as codigo, UNIDADE_ID_COFRES as unidade_id, DEPARTAMENTO_ID_COFRES as departamento_id FROM COFRES WHERE ID_COFRES = ?', [destinationVaultSpaceId]);
    if (!vaultRows || vaultRows.length === 0) {
      return res.status(404).json({ error: 'Local de cofre de destino não encontrado.' });
    }
    const destVault = vaultRows[0];

    let itemsList: any[] = [];
    try {
      itemsList = typeof transfer.municoes_json === 'string' ? JSON.parse(transfer.municoes_json) : (transfer.municoes_json || []);
    } catch {
      itemsList = [];
    }

    // Store items into destination vault
    for (const it of itemsList) {
      const q = parseInt(String(it.quantity), 10);
      if (isNaN(q) || q <= 0) continue;

      let findQuery = 'SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?';
      const findParams: any[] = [destinationVaultSpaceId, it.caliberId];
      if (it.loteMunicao) {
        findQuery += ' AND (LOTE_MUNICAO = ? OR LOTE_MUNICAO IS NULL)';
        findParams.push(it.loteMunicao);
      }
      const [destStocks]: any = await pool.query(findQuery, findParams);

      if (destStocks && destStocks.length > 0) {
        await pool.query(
          `UPDATE ESTOQUE_MUNICOES SET 
            QUANTIDADE_ESTOQUE_MUNICOES = QUANTIDADE_ESTOQUE_MUNICOES + ?,
            FABRICANTE_MUNICAO = COALESCE(?, FABRICANTE_MUNICAO),
            TIPO_MUNICAO = COALESCE(?, TIPO_MUNICAO),
            PESO_MUNICAO = COALESCE(?, PESO_MUNICAO),
            LOTE_MUNICAO = COALESCE(?, LOTE_MUNICAO),
            ANO_FABRICACAO_MUNICAO = COALESCE(?, ANO_FABRICACAO_MUNICAO),
            DESTINACAO_MUNICAO = COALESCE(?, DESTINACAO_MUNICAO),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE ID_ESTOQUE_MUNICOES = ?`,
          [q, it.fabricante || null, it.tipoMunicao || null, it.pesoMunicao || null, it.loteMunicao || null, it.anoFabricacao || null, it.destinacao || null, destStocks[0].id]
        );
      } else {
        const newStockId = `stock-recv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await pool.query(
          `INSERT INTO ESTOQUE_MUNICOES (
            ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES, 
            DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES,
            FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            newStockId, it.caliberId, q, destVault.departamento_id, destVault.unidade_id, destinationVaultSpaceId,
            it.fabricante || null, it.tipoMunicao || null, it.pesoMunicao || null, it.loteMunicao || null, it.anoFabricacao || null, it.destinacao || null
          ]
        );
      }

      // Record incoming movement at destination vault
      const movId = `ammomov-recv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Entrada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId, it.caliberId, q, destVault.departamento_id, destVault.unidade_id, destinationVaultSpaceId,
          `Recebimento de Transferência de ${transfer.origem_unidade_nome}`,
          it.fabricante || null, it.tipoMunicao || null, it.pesoMunicao || null, it.loteMunicao || null, it.anoFabricacao || null, it.destinacao || null,
          actor.id, actor.name, actor.masp,
          `Confirmado por ${actor.name} (${actor.masp}) no cofre ${destVault.codigo}`,
          actor.id, actor.name
        ]
      );
    }

    // Update transfer status
    await pool.query(
      `UPDATE TRANSFERENCIAS_MUNICOES SET
        STATUS_TRANSFERENCIAS_MUNICOES = 'Recebido',
        DESTINO_COFRE_ID_TRANSFERENCIAS_MUNICOES = ?,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_MUNICOES = ?,
        RECEBIDO_EM_TRANSFERENCIAS_MUNICOES = NOW(),
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_MUNICOES = ?,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_MUNICOES = ?,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_MUNICOES = ?,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_MUNICOES = ?,
        OBSERVACAO_TRANSFERENCIAS_MUNICOES = COALESCE(?, OBSERVACAO_TRANSFERENCIAS_MUNICOES)
       WHERE ID_TRANSFERENCIAS_MUNICOES = ?`,
      [
        destinationVaultSpaceId,
        destVault.codigo,
        actor.id,
        actor.name,
        actor.masp,
        actor.role,
        observation || null,
        id
      ]
    );

    await insertAuditLog(
      'Munições',
      'Confirmar Recibo de Transferência',
      `Recibo confirmado por ${actor.name} (${actor.masp}) para ${transfer.total_municoes} munições transferidas de ${transfer.origem_unidade_nome}. Alocadas no cofre ${destVault.codigo}.`,
      actor,
      req.ip
    );

    return res.json({
      success: true,
      message: 'Munições recebidas e alocadas no cofre com sucesso!'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Undo Ammo Transfer
apiRouter.post('/ammo-transfers/:id/undo', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada.' });

    const pool = getPool();
    const [rows]: any = await pool.query('SELECT * FROM TRANSFERENCIAS_MUNICOES WHERE ID_TRANSFERENCIAS_MUNICOES = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Transferência não encontrada.' });
    const transfer = rows[0];

    if (transfer.STATUS_TRANSFERENCIAS_MUNICOES === 'Recebido') {
      return res.status(400).json({ error: 'Não é possível desfazer uma transferência já recebida.' });
    }

    let itemsList: any[] = [];
    try {
      itemsList = typeof transfer.MUNICOES_JSON_TRANSFERENCIAS_MUNICOES === 'string' 
        ? JSON.parse(transfer.MUNICOES_JSON_TRANSFERENCIAS_MUNICOES) 
        : (transfer.MUNICOES_JSON_TRANSFERENCIAS_MUNICOES || []);
    } catch {
      itemsList = [];
    }

    // Return quantities to origin stocks
    for (const it of itemsList) {
      const q = Number(it.quantity) || 0;
      if (it.originVaultSpaceId && it.caliberId && q > 0) {
        await pool.query(
          'UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = QUANTIDADE_ESTOQUE_MUNICOES + ?, DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ? LIMIT 1',
          [q, it.originVaultSpaceId, it.caliberId]
        );
      }
    }

    await pool.query("UPDATE TRANSFERENCIAS_MUNICOES SET STATUS_TRANSFERENCIAS_MUNICOES = 'Cancelado' WHERE ID_TRANSFERENCIAS_MUNICOES = ?", [id]);
    await insertAuditLog('Munições', 'Desfazer Transferência', `Transferência de munições ${transfer.NUMERO_PROTOCOLO_TRANSFERENCIAS_MUNICOES} cancelada`, actor, req.ip);

    return res.json({ success: true, message: 'Transferência de munições cancelada com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// ROTAS DO MÓDULO DE MATERIAIS
// ===================================================================

// --- 1. TIPOS DE MATERIAIS ---
apiRouter.get('/tipos-materiais', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_TIPOS_MATERIAIS as id,
        NOME_TIPOS_MATERIAIS as nome,
        DESCRICAO_TIPOS_MATERIAIS as descricao,
        CATEGORIA_TIPOS_MATERIAIS as categoria,
        EH_CONSUMIVEL_TIPOS_MATERIAIS as eh_consumivel,
        DATA_CRIACAO_TIPOS_MATERIAIS as data_criacao
      FROM TIPOS_MATERIAIS ORDER BY NOME_TIPOS_MATERIAIS ASC
    `);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      categoria: r.categoria || 'Geral',
      ehConsumivel: Boolean(r.eh_consumivel),
      createdAt: r.data_criacao
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching tipos_materiais:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/tipos-materiais', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id, nome, descricao, categoria, ehConsumivel } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome do tipo de material é obrigatório.' });
    }
    const newId = id || `tipo-mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await pool.query(
      `INSERT INTO TIPOS_MATERIAIS (ID_TIPOS_MATERIAIS, NOME_TIPOS_MATERIAIS, DESCRICAO_TIPOS_MATERIAIS, CATEGORIA_TIPOS_MATERIAIS, EH_CONSUMIVEL_TIPOS_MATERIAIS, DATA_CRIACAO_TIPOS_MATERIAIS)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE DESCRICAO_TIPOS_MATERIAIS = VALUES(DESCRICAO_TIPOS_MATERIAIS), CATEGORIA_TIPOS_MATERIAIS = VALUES(CATEGORIA_TIPOS_MATERIAIS), EH_CONSUMIVEL_TIPOS_MATERIAIS = VALUES(EH_CONSUMIVEL_TIPOS_MATERIAIS)`,
      [newId, nome.trim(), descricao || null, categoria || 'Geral', ehConsumivel ? 1 : 0]
    );
    return res.json({ success: true, id: newId });
  } catch (err: any) {
    console.error('Error saving tipo_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/tipos-materiais/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    // Check if any material is using this type
    const [used]: any = await pool.query('SELECT COUNT(*) as count FROM MATERIAIS WHERE TIPO_MATERIAL_ID_MATERIAIS = ?', [id]);
    if (used[0]?.count > 0) {
      return res.status(400).json({ error: 'Não é possível excluir este tipo pois existem materiais cadastrados vinculados a ele.' });
    }
    await pool.query('DELETE FROM TIPOS_MATERIAIS WHERE ID_TIPOS_MATERIAIS = ?', [id]);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting tipo_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- 2. MATERIAIS ---
apiRouter.get('/materiais', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { departamentoId, unidadeId } = req.query;
    let query = `
      SELECT 
        ID_MATERIAIS as id,
        TIPO_MATERIAL_ID_MATERIAIS as tipo_material_id,
        TIPO_MATERIAL_NOME_MATERIAIS as tipo_material_nome,
        NOME_MATERIAIS as nome,
        QUANTIDADE_MATERIAIS as quantidade,
        QUANTIDADE_DISPONIVEL_MATERIAIS as quantidade_disponivel,
        QUANTIDADE_EM_USO_MATERIAIS as quantidade_em_uso,
        QUANTIDADE_CONSUMIDA_MATERIAIS as quantidade_consumida,
        DEPARTAMENTO_ID_MATERIAIS as departamento_id,
        DEPARTAMENTO_NOME_MATERIAIS as departamento_nome,
        UNIDADE_ID_MATERIAIS as unidade_id,
        UNIDADE_NOME_MATERIAIS as unidade_nome,
        VALIDADE_MATERIAIS as validade,
        LOCAL_GUARDA_MATERIAIS as local_guarda,
        COFRE_ID_MATERIAIS as vault_space_id,
        PASSIVO_DEPOSITO_POLICIAIS as passivo_deposito_policiais,
        NUMERO_SERIE_MATERIAIS as numero_serie,
        OBSERVACOES_MATERIAIS as observacoes,
        CRIADO_POR_USUARIO_ID_MATERIAIS as criado_por_usuario_id,
        CRIADO_POR_NOME_MATERIAIS as criado_por_nome,
        DATA_CRIACAO_MATERIAIS as data_criacao,
        DATA_ATUALIZACAO_MATERIAIS as data_atualizacao
      FROM MATERIAIS WHERE 1=1
    `;
    const params: any[] = [];

    if (departamentoId) {
      query += ' AND DEPARTAMENTO_ID_MATERIAIS = ?';
      params.push(departamentoId);
    }
    if (unidadeId) {
      query += ' AND UNIDADE_ID_MATERIAIS = ?';
      params.push(unidadeId);
    }

    query += ' ORDER BY NOME_MATERIAIS ASC';
    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      tipoMaterialId: r.tipo_material_id || '',
      tipoMaterialNome: r.tipo_material_nome || r.TIPO_MATERIAL_NOME_MATERIAIS || 'Material',
      nome: r.nome || r.NOME_MATERIAIS || '',
      quantidade: Number(r.quantidade || 0),
      quantidadeDisponivel: Number(r.quantidade_disponivel ?? r.quantidade ?? 0),
      quantidadeEmUso: Number(r.quantidade_em_uso || 0),
      quantidadeConsumida: Number(r.quantidade_consumida || 0),
      departamentoId: r.departamento_id,
      departamentoNome: r.departamento_nome,
      unidadeId: r.unidade_id,
      unidadeNome: r.unidade_nome,
      validade: r.validade ? (r.validade instanceof Date ? r.validade.toISOString().split('T')[0] : String(r.validade).substring(0, 10)) : null,
      localGuarda: r.local_guarda,
      vaultSpaceId: r.vault_space_id || undefined,
      passivoDepositoPoliciais: r.passivo_deposito_policiais !== undefined && r.passivo_deposito_policiais !== null ? Boolean(r.passivo_deposito_policiais) : true,
      numeroSerie: r.numero_serie,
      observacoes: r.observacoes,
      criadoPorUsuarioId: r.criado_por_usuario_id,
      criadoPorNome: r.criado_por_nome,
      createdAt: r.data_criacao,
      updatedAt: r.data_atualizacao
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching materiais:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/materiais', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const {
      id,
      tipoMaterialId,
      tipoMaterialNome,
      nome,
      quantidade,
      departamentoId,
      departamentoNome,
      unidadeId,
      unidadeNome,
      validade,
      localGuarda,
      vaultSpaceId,
      passivoDepositoPoliciais,
      numeroSerie,
      observacoes,
      criadoPorUsuarioId,
      criadoPorNome
    } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do material é obrigatório.' });
    }
    if (!tipoMaterialId) {
      return res.status(400).json({ error: 'O tipo do material é obrigatório.' });
    }
    if (!departamentoId || !unidadeId) {
      return res.status(400).json({ error: 'Departamento e Unidade são obrigatórios.' });
    }

    let resolvedLocalGuarda = (localGuarda || '').trim();
    if (vaultSpaceId) {
      const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [vaultSpaceId]);
      if (vRows && vRows.length > 0 && vRows[0].CODIGO_COFRES) {
        resolvedLocalGuarda = vRows[0].CODIGO_COFRES;
      }
    }

    if (!resolvedLocalGuarda) {
      return res.status(400).json({ error: 'O cofre de guarda do material é obrigatório.' });
    }

    const qty = Math.max(1, parseInt(quantidade || '1', 10));
    const newId = id || `mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const passivoFlag = passivoDepositoPoliciais === false || passivoDepositoPoliciais === 0 || passivoDepositoPoliciais === 'NAO' ? 0 : 1;

    await pool.query(
      `INSERT INTO MATERIAIS 
        (ID_MATERIAIS, TIPO_MATERIAL_ID_MATERIAIS, TIPO_MATERIAL_NOME_MATERIAIS, NOME_MATERIAIS, QUANTIDADE_MATERIAIS, QUANTIDADE_DISPONIVEL_MATERIAIS, QUANTIDADE_EM_USO_MATERIAIS, QUANTIDADE_CONSUMIDA_MATERIAIS, DEPARTAMENTO_ID_MATERIAIS, DEPARTAMENTO_NOME_MATERIAIS, UNIDADE_ID_MATERIAIS, UNIDADE_NOME_MATERIAIS, VALIDADE_MATERIAIS, LOCAL_GUARDA_MATERIAIS, COFRE_ID_MATERIAIS, PASSIVO_DEPOSITO_POLICIAIS, NUMERO_SERIE_MATERIAIS, OBSERVACOES_MATERIAIS, CRIADO_POR_USUARIO_ID_MATERIAIS, CRIADO_POR_NOME_MATERIAIS, DATA_CRIACAO_MATERIAIS, DATA_ATUALIZACAO_MATERIAIS)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        newId,
        tipoMaterialId,
        tipoMaterialNome || 'Material',
        nome.trim(),
        qty,
        qty, // initially all available
        departamentoId,
        departamentoNome || null,
        unidadeId,
        unidadeNome || null,
        validade ? validade : null,
        resolvedLocalGuarda,
        vaultSpaceId || null,
        passivoFlag,
        numeroSerie ? numeroSerie.trim() : null,
        observacoes || null,
        criadoPorUsuarioId || null,
        criadoPorNome || null
      ]
    );

    await insertAuditLog(
      'Materiais',
      'Cadastro de Material',
      `Novo material cadastrado: "${nome}" (Qtd: ${qty}, Cofre: ${resolvedLocalGuarda}, Passivo de depósito: ${passivoFlag ? 'SIM' : 'NÃO'}, Tipo: ${tipoMaterialNome}) na unidade ${unidadeNome || unidadeId}.`,
      { id: criadoPorUsuarioId, name: criadoPorNome },
      req.ip
    );

    return res.json({ success: true, id: newId });
  } catch (err: any) {
    console.error('Error creating material:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/materiais/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const {
      tipoMaterialId,
      tipoMaterialNome,
      nome,
      quantidade,
      departamentoId,
      departamentoNome,
      unidadeId,
      unidadeNome,
      validade,
      localGuarda,
      vaultSpaceId,
      passivoDepositoPoliciais,
      numeroSerie,
      observacoes,
      updatedByUserId,
      updatedByName
    } = req.body;

    const [existingRows]: any = await pool.query('SELECT ID_MATERIAIS as id, NOME_MATERIAIS as nome, QUANTIDADE_MATERIAIS as quantidade, QUANTIDADE_DISPONIVEL_MATERIAIS as quantidade_disponivel, QUANTIDADE_EM_USO_MATERIAIS as quantidade_em_uso, QUANTIDADE_CONSUMIDA_MATERIAIS as quantidade_consumida, COFRE_ID_MATERIAIS as vault_space_id, PASSIVO_DEPOSITO_POLICIAIS as passivo_deposito_policiais FROM MATERIAIS WHERE ID_MATERIAIS = ?', [id]);
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }
    const current = existingRows[0];

    const newTotal = quantidade !== undefined ? Math.max(0, parseInt(quantidade, 10)) : current.quantidade;
    const inUse = Number(current.quantidade_em_uso || 0);
    const newDisponivel = Math.max(0, newTotal - inUse);

    let resolvedLocalGuarda = localGuarda ? localGuarda.trim() : null;
    if (vaultSpaceId) {
      const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [vaultSpaceId]);
      if (vRows && vRows.length > 0 && vRows[0].CODIGO_COFRES) {
        resolvedLocalGuarda = vRows[0].CODIGO_COFRES;
      }
    }

    const passivoFlag = passivoDepositoPoliciais !== undefined
      ? (passivoDepositoPoliciais === false || passivoDepositoPoliciais === 0 || passivoDepositoPoliciais === 'NAO' ? 0 : 1)
      : (current.passivo_deposito_policiais ?? 1);

    await pool.query(
      `UPDATE MATERIAIS SET
        TIPO_MATERIAL_ID_MATERIAIS = COALESCE(?, TIPO_MATERIAL_ID_MATERIAIS),
        TIPO_MATERIAL_NOME_MATERIAIS = COALESCE(?, TIPO_MATERIAL_NOME_MATERIAIS),
        NOME_MATERIAIS = COALESCE(?, NOME_MATERIAIS),
        QUANTIDADE_MATERIAIS = ?,
        QUANTIDADE_DISPONIVEL_MATERIAIS = ?,
        DEPARTAMENTO_ID_MATERIAIS = COALESCE(?, DEPARTAMENTO_ID_MATERIAIS),
        DEPARTAMENTO_NOME_MATERIAIS = COALESCE(?, DEPARTAMENTO_NOME_MATERIAIS),
        UNIDADE_ID_MATERIAIS = COALESCE(?, UNIDADE_ID_MATERIAIS),
        UNIDADE_NOME_MATERIAIS = COALESCE(?, UNIDADE_NOME_MATERIAIS),
        VALIDADE_MATERIAIS = ?,
        LOCAL_GUARDA_MATERIAIS = COALESCE(?, LOCAL_GUARDA_MATERIAIS),
        COFRE_ID_MATERIAIS = COALESCE(?, COFRE_ID_MATERIAIS),
        PASSIVO_DEPOSITO_POLICIAIS = ?,
        NUMERO_SERIE_MATERIAIS = ?,
        OBSERVACOES_MATERIAIS = ?,
        DATA_ATUALIZACAO_MATERIAIS = NOW()
       WHERE ID_MATERIAIS = ?`,
      [
        tipoMaterialId || null,
        tipoMaterialNome || null,
        nome ? nome.trim() : null,
        newTotal,
        newDisponivel,
        departamentoId || null,
        departamentoNome || null,
        unidadeId || null,
        unidadeNome || null,
        validade ? validade : null,
        resolvedLocalGuarda,
        vaultSpaceId || null,
        passivoFlag,
        numeroSerie ? numeroSerie.trim() : null,
        observacoes !== undefined ? observacoes : null,
        id
      ]
    );

    await insertAuditLog(
      'Materiais',
      'Edição de Material',
      `Material "${nome || current.nome}" atualizado (Qtd Total: ${newTotal}, Disponível: ${newDisponivel}, Em Uso: ${inUse}).`,
      { id: updatedByUserId, name: updatedByName },
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating material:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/materiais/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { deletedByUserId, deletedByName } = req.query as any;

    const [matRows]: any = await pool.query('SELECT ID_MATERIAIS as id, NOME_MATERIAIS as nome, QUANTIDADE_EM_USO_MATERIAIS as quantidade_em_uso FROM MATERIAIS WHERE ID_MATERIAIS = ?', [id]);
    if (!matRows || matRows.length === 0) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }
    const mat = matRows[0];

    if (mat.quantidade_em_uso > 0) {
      return res.status(400).json({ error: `Não é possível excluir o material pois existem ${mat.quantidade_em_uso} unidade(s) em uso/acautelada(s).` });
    }

    await pool.query('DELETE FROM MATERIAIS WHERE ID_MATERIAIS = ?', [id]);

    await insertAuditLog(
      'Materiais',
      'Exclusão de Material',
      `Material "${mat.nome}" (ID: ${id}) excluído do sistema.`,
      { id: deletedByUserId, name: deletedByName },
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- 3. CAUTELAS E MOVIMENTAÇÕES DE MATERIAIS ---
apiRouter.get('/cautelas-materiais', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { departamentoId, unidadeId, status } = req.query;
    let query = `
      SELECT 
        ID_CAUTELAS_MATERIAIS as id,
        PROTOCOLO_CAUTELAS_MATERIAIS as protocolo,
        MATERIAL_ID_CAUTELAS_MATERIAIS as material_id,
        MATERIAL_NOME_CAUTELAS_MATERIAIS as material_nome,
        TIPO_MATERIAL_NOME_CAUTELAS_MATERIAIS as tipo_material_nome,
        QUANTIDADE_CAUTELAS_MATERIAIS as quantidade,
        TIPO_DESTINATARIO_CAUTELAS_MATERIAIS as tipo_destinatario,
        USUARIO_INTERNO_ID_CAUTELAS_MATERIAIS as usuario_interno_id,
        USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS as usuario_interno_nome,
        USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS as usuario_interno_masp,
        USUARIO_INTERNO_CARGO_CAUTELAS_MATERIAIS as usuario_interno_cargo,
        USUARIO_EXTERNO_NOME_CAUTELAS_MATERIAIS as usuario_externo_nome,
        USUARIO_EXTERNO_DOCUMENTO_CAUTELAS_MATERIAIS as usuario_externo_documento,
        USUARIO_EXTERNO_ORGAO_CAUTELAS_MATERIAIS as usuario_externo_orgao,
        USUARIO_EXTERNO_TELEFONE_CAUTELAS_MATERIAIS as usuario_externo_telefone,
        DATA_RETIRADA_CAUTELAS_MATERIAIS as data_retirada,
        DATA_PREVISTA_DEVOLUCAO_CAUTELAS_MATERIAIS as data_prevista_devolucao,
        DATA_DEVOLUCAO_CAUTELAS_MATERIAIS as data_devolucao,
        FINALIDADE_CAUTELAS_MATERIAIS as finalidade,
        STATUS_CAUTELAS_MATERIAIS as status,
        FOI_CONSUMIDO_CAUTELAS_MATERIAIS as foi_consumido,
        RELATO_USO_ANOMALIAS_CAUTELAS_MATERIAIS as relato_uso_anomalias,
        COFRE_ORIGEM_ID_CAUTELAS_MATERIAIS as vault_space_id,
        COFRE_DESTINO_ID_CAUTELAS_MATERIAIS as destination_vault_space_id,
        SERA_DEVOLVIDA_CAUTELAS_MATERIAIS as sera_devolvida,
        QUANTIDADE_DEVOLVIDA_CAUTELAS_MATERIAIS as returned_quantity,
        DATA_AUTORIZACAO_CAUTELAS_MATERIAIS as authorized_at,
        MOTIVO_RECUSA_CAUTELAS_MATERIAIS as rejection_reason,
        OBSERVACOES_CAUTELAS_MATERIAIS as observacoes,
        RESPONSAVEL_ENTREGA_ID_CAUTELAS_MATERIAIS as responsavel_entrega_id,
        RESPONSAVEL_ENTREGA_NOME_CAUTELAS_MATERIAIS as responsavel_entrega_nome,
        RESPONSAVEL_ENTREGA_MASP_CAUTELAS_MATERIAIS as responsavel_entrega_masp,
        RESPONSAVEL_RECEBIMENTO_ID_CAUTELAS_MATERIAIS as responsavel_recebimento_id,
        RESPONSAVEL_RECEBIMENTO_NOME_CAUTELAS_MATERIAIS as responsavel_recebimento_nome,
        RESPONSAVEL_RECEBIMENTO_MASP_CAUTELAS_MATERIAIS as responsavel_recebimento_masp,
        DEPARTAMENTO_ID_CAUTELAS_MATERIAIS as departamento_id,
        UNIDADE_ID_CAUTELAS_MATERIAIS as unidade_id,
        DATA_CRIACAO_CAUTELAS_MATERIAIS as data_criacao
      FROM CAUTELAS_MATERIAIS WHERE 1=1
    `;
    const params: any[] = [];

    if (departamentoId) {
      query += ' AND DEPARTAMENTO_ID_CAUTELAS_MATERIAIS = ?';
      params.push(departamentoId);
    }
    if (unidadeId) {
      query += ' AND UNIDADE_ID_CAUTELAS_MATERIAIS = ?';
      params.push(unidadeId);
    }
    if (status) {
      query += ' AND STATUS_CAUTELAS_MATERIAIS = ?';
      params.push(status);
    }

    query += ' ORDER BY DATA_RETIRADA_CAUTELAS_MATERIAIS DESC';
    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      protocolo: r.protocolo || '',
      materialId: r.material_id,
      materialNome: r.material_nome || '',
      tipoMaterialNome: r.tipo_material_nome || '',
      quantidade: Number(r.quantidade || 1),
      tipoDestinatario: r.tipo_destinatario,
      usuarioInternoId: r.usuario_interno_id,
      usuarioInternoNome: r.usuario_interno_nome,
      usuarioInternoMasp: r.usuario_interno_masp,
      usuarioInternoCargo: r.usuario_interno_cargo,
      usuarioExternoNome: r.usuario_externo_nome,
      usuarioExternoDocumento: r.usuario_externo_documento,
      usuarioExternoOrgao: r.usuario_externo_orgao,
      usuarioExternoTelefone: r.usuario_externo_telefone,
      dataRetirada: r.data_retirada,
      dataPrevistaDevolucao: r.data_prevista_devolucao ? (r.data_prevista_devolucao instanceof Date ? r.data_prevista_devolucao.toISOString().split('T')[0] : String(r.data_prevista_devolucao).substring(0, 10)) : undefined,
      dataDevolucao: r.data_devolucao,
      finalidade: r.finalidade,
      status: r.status,
      foiConsumido: Boolean(r.foi_consumido),
      relatoUsoAnomalias: r.relato_uso_anomalias,
      vaultSpaceId: r.vault_space_id || undefined,
      destinationVaultSpaceId: r.destination_vault_space_id || undefined,
      seraDevolvida: r.sera_devolvida !== undefined && r.sera_devolvida !== null ? Boolean(r.sera_devolvida) : true,
      returnedQuantity: r.returned_quantity !== undefined && r.returned_quantity !== null ? Number(r.returned_quantity) : undefined,
      authorizedAt: r.authorized_at || undefined,
      rejectionReason: r.rejection_reason || undefined,
      observacoes: r.observacoes || undefined,
      responsavelEntregaId: r.responsavel_entrega_id,
      responsavelEntregaNome: r.responsavel_entrega_nome,
      responsavelEntregaMasp: r.responsavel_entrega_masp,
      responsavelRecebimentoId: r.responsavel_recebimento_id,
      responsavelRecebimentoNome: r.responsavel_recebimento_nome,
      responsavelRecebimentoMasp: r.responsavel_recebimento_masp,
      departamentoId: r.departamento_id,
      unidadeId: r.unidade_id,
      createdAt: r.data_criacao,
      updatedAt: r.data_atualizacao
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching cautelas_materiais:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/cautelas-materiais', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const {
      id,
      protocolo,
      materialId,
      materialNome,
      tipoMaterialNome,
      quantidade,
      tipoDestinatario,
      usuarioInternoId,
      usuarioInternoNome,
      usuarioInternoMasp,
      usuarioInternoCargo,
      usuarioExternoNome,
      usuarioExternoDocumento,
      usuarioExternoOrgao,
      usuarioExternoTelefone,
      dataRetirada,
      dataPrevistaDevolucao,
      finalidade,
      seraDevolvida,
      directAuthorized,
      observacoes,
      enforceDepositEligible,
      responsavelEntregaId,
      responsavelEntregaNome,
      responsavelEntregaMasp,
      departamentoId,
      unidadeId
    } = req.body;

    if (!materialId) {
      return res.status(400).json({ error: 'Material é obrigatório.' });
    }
    const qty = Math.max(1, parseInt(quantidade || '1', 10));

    // Verify stock availability
    const [matRows]: any = await pool.query('SELECT ID_MATERIAIS as id, NOME_MATERIAIS as nome, TIPO_MATERIAL_NOME_MATERIAIS as tipo_material_nome, QUANTIDADE_DISPONIVEL_MATERIAIS as quantidade_disponivel, QUANTIDADE_EM_USO_MATERIAIS as quantidade_em_uso, QUANTIDADE_CONSUMIDA_MATERIAIS as quantidade_consumida, COFRE_ID_MATERIAIS as vault_space_id, PASSIVO_DEPOSITO_POLICIAIS as passivo_deposito_policiais, DEPARTAMENTO_ID_MATERIAIS as departamento_id, UNIDADE_ID_MATERIAIS as unidade_id FROM MATERIAIS WHERE ID_MATERIAIS = ?', [materialId]);
    if (!matRows || matRows.length === 0) {
      return res.status(404).json({ error: 'Material não encontrado no estoque.' });
    }
    const mat = matRows[0];

    if (enforceDepositEligible && mat.passivo_deposito_policiais === 0) {
      return res.status(400).json({ error: 'Este material está configurado como NÃO passivo de depósito/cautela para policiais.' });
    }

    const isDirect = directAuthorized !== false;
    if (isDirect && mat.quantidade_disponivel < qty) {
      return res.status(400).json({
        error: `Estoque insuficiente para cautela. Disponível: ${mat.quantidade_disponivel}, Solicitado: ${qty}.`
      });
    }

    if ((tipoDestinatario || 'interno') === 'interno') {
      if (!usuarioInternoId || !usuarioInternoNome) {
        return res.status(400).json({ error: 'Usuário interno (policial) é obrigatório.' });
      }
    } else {
      if (!usuarioExternoNome || !usuarioExternoNome.trim()) {
        return res.status(400).json({ error: 'Nome do usuário externo é obrigatório.' });
      }
    }

    if (!finalidade || !finalidade.trim()) {
      return res.status(400).json({ error: 'Finalidade / Motivo da retirada é obrigatório.' });
    }

    const newId = id || `caut-mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const proto = protocolo || `CM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const effectiveRetirada = dataRetirada ? new Date(dataRetirada) : new Date();
    const initialStatus = isDirect ? (enforceDepositEligible ? 'AUTORIZADA' : 'Em Uso') : 'PENDENTE';
    const seraDevFlag = seraDevolvida === false ? 0 : 1;

    await pool.query(
      `INSERT INTO CAUTELAS_MATERIAIS (
        ID_CAUTELAS_MATERIAIS, PROTOCOLO_CAUTELAS_MATERIAIS, MATERIAL_ID_CAUTELAS_MATERIAIS, MATERIAL_NOME_CAUTELAS_MATERIAIS, TIPO_MATERIAL_NOME_CAUTELAS_MATERIAIS, QUANTIDADE_CAUTELAS_MATERIAIS,
        TIPO_DESTINATARIO_CAUTELAS_MATERIAIS, USUARIO_INTERNO_ID_CAUTELAS_MATERIAIS, USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS, USUARIO_INTERNO_MASP_CAUTELAS_MATERIAIS, USUARIO_INTERNO_CARGO_CAUTELAS_MATERIAIS,
        USUARIO_EXTERNO_NOME_CAUTELAS_MATERIAIS, USUARIO_EXTERNO_DOCUMENTO_CAUTELAS_MATERIAIS, USUARIO_EXTERNO_ORGAO_CAUTELAS_MATERIAIS, USUARIO_EXTERNO_TELEFONE_CAUTELAS_MATERIAIS,
        DATA_RETIRADA_CAUTELAS_MATERIAIS, DATA_PREVISTA_DEVOLUCAO_CAUTELAS_MATERIAIS, FINALIDADE_CAUTELAS_MATERIAIS, STATUS_CAUTELAS_MATERIAIS, FOI_CONSUMIDO_CAUTELAS_MATERIAIS,
        COFRE_ORIGEM_ID_CAUTELAS_MATERIAIS, SERA_DEVOLVIDA_CAUTELAS_MATERIAIS, DATA_AUTORIZACAO_CAUTELAS_MATERIAIS, OBSERVACOES_CAUTELAS_MATERIAIS,
        RESPONSAVEL_ENTREGA_ID_CAUTELAS_MATERIAIS, RESPONSAVEL_ENTREGA_NOME_CAUTELAS_MATERIAIS, RESPONSAVEL_ENTREGA_MASP_CAUTELAS_MATERIAIS,
        DEPARTAMENTO_ID_CAUTELAS_MATERIAIS, UNIDADE_ID_CAUTELAS_MATERIAIS, DATA_CRIACAO_CAUTELAS_MATERIAIS, DATA_ATUALIZACAO_CAUTELAS_MATERIAIS
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        newId,
        proto,
        materialId,
        materialNome || mat.nome,
        tipoMaterialNome || mat.tipo_material_nome,
        qty,
        tipoDestinatario || 'interno',
        usuarioInternoId || null,
        usuarioInternoNome || null,
        usuarioInternoMasp || null,
        usuarioInternoCargo || null,
        usuarioExternoNome ? usuarioExternoNome.trim() : null,
        usuarioExternoDocumento ? usuarioExternoDocumento.trim() : null,
        usuarioExternoOrgao ? usuarioExternoOrgao.trim() : null,
        usuarioExternoTelefone ? usuarioExternoTelefone.trim() : null,
        effectiveRetirada,
        dataPrevistaDevolucao || null,
        finalidade.trim(),
        initialStatus,
        mat.vault_space_id || null,
        seraDevFlag,
        isDirect ? new Date() : null,
        observacoes ? String(observacoes).trim() : null,
        responsavelEntregaId || (isDirect ? 'sistema' : 'pendente'),
        responsavelEntregaNome || (isDirect ? 'Armeiro' : 'Aguardando Armeiro'),
        responsavelEntregaMasp || null,
        departamentoId || mat.departamento_id,
        unidadeId || mat.unidade_id
      ]
    );

    if (isDirect) {
      await pool.query(
        `UPDATE MATERIAIS SET 
          QUANTIDADE_DISPONIVEL_MATERIAIS = GREATEST(0, QUANTIDADE_DISPONIVEL_MATERIAIS - ?),
          QUANTIDADE_EM_USO_MATERIAIS = QUANTIDADE_EM_USO_MATERIAIS + ?,
          DATA_ATUALIZACAO_MATERIAIS = NOW()
         WHERE ID_MATERIAIS = ?`,
        [qty, qty, materialId]
      );
    }

    const recipientDesc = (tipoDestinatario || 'interno') === 'interno'
      ? `${usuarioInternoNome} (MASP: ${usuarioInternoMasp || 'N/D'})`
      : `${usuarioExternoNome} (Externo - ${usuarioExternoOrgao || 'Sem órgão informado'})`;

    await insertAuditLog(
      'Materiais',
      isDirect ? 'Cautela de Material' : 'Solicitação de Cautela de Material',
      `${isDirect ? 'Cautela realizada' : 'Solicitação enviada para análise'} (${proto}): ${qty}x "${mat.nome}" para ${recipientDesc}. Finalidade: ${finalidade}.`,
      { id: responsavelEntregaId || usuarioInternoId, name: responsavelEntregaNome || usuarioInternoNome, masp: responsavelEntregaMasp || usuarioInternoMasp },
      req.ip
    );

    return res.json({ success: true, id: newId, protocolo: proto, status: initialStatus });
  } catch (err: any) {
    console.error('Error creating cautela_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Armeiro autoriza solicitação pendente, especifica material exato e quantidade, e deduz estoque do cofre
apiRouter.put('/cautelas-materiais/:id/autorizar', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const {
      materialId,
      quantidade,
      seraDevolvida,
      notes,
      armorerId,
      armorerName,
      armorerMasp
    } = req.body;

    const [cautRows]: any = await pool.query('SELECT * FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);
    if (!cautRows || cautRows.length === 0) {
      return res.status(404).json({ error: 'Solicitação de cautela de material não encontrada.' });
    }
    const caut = cautRows[0];
    if (caut.STATUS_CAUTELAS_MATERIAIS !== 'PENDENTE') {
      return res.status(400).json({ error: `Esta solicitação já foi processada (${caut.STATUS_CAUTELAS_MATERIAIS}).` });
    }

    const targetMaterialId = materialId || caut.MATERIAL_ID_CAUTELAS_MATERIAIS;
    const parsedQty =
      quantidade !== undefined && quantidade !== null && String(quantidade).trim() !== ''
        ? parseInt(String(quantidade), 10)
        : Number(caut.QUANTIDADE_CAUTELAS_MATERIAIS || 1);
    const qty = Math.max(1, isNaN(parsedQty) ? 1 : parsedQty);

    const [matRows]: any = await pool.query(
      'SELECT ID_MATERIAIS as id, NOME_MATERIAIS as nome, TIPO_MATERIAL_NOME_MATERIAIS as tipo_material_nome, QUANTIDADE_DISPONIVEL_MATERIAIS as disp, COFRE_ID_MATERIAIS as vaultId, PASSIVO_DEPOSITO_POLICIAIS as passivo_deposito_policiais FROM MATERIAIS WHERE ID_MATERIAIS = ?',
      [targetMaterialId]
    );
    if (!matRows || matRows.length === 0) {
      return res.status(404).json({ error: 'Material especificado não encontrado no estoque.' });
    }
    const mat = matRows[0];
    if (mat.passivo_deposito_policiais === 0) {
      return res.status(400).json({ error: 'O material selecionado não está habilitado como passivo de depósito para policiais.' });
    }
    if (mat.disp < qty) {
      return res.status(400).json({ error: `Saldo insuficiente no estoque para pagamento (${mat.disp} disponíveis para ${qty} definido(s)).` });
    }

    const seraDevFlag = seraDevolvida === false ? 0 : 1;

    await pool.query(
      `UPDATE CAUTELAS_MATERIAIS SET
        MATERIAL_ID_CAUTELAS_MATERIAIS = ?,
        MATERIAL_NOME_CAUTELAS_MATERIAIS = ?,
        TIPO_MATERIAL_NOME_CAUTELAS_MATERIAIS = ?,
        QUANTIDADE_CAUTELAS_MATERIAIS = ?,
        STATUS_CAUTELAS_MATERIAIS = 'AUTORIZADA',
        SERA_DEVOLVIDA_CAUTELAS_MATERIAIS = ?,
        OBSERVACOES_CAUTELAS_MATERIAIS = COALESCE(?, OBSERVACOES_CAUTELAS_MATERIAIS),
        COFRE_ORIGEM_ID_CAUTELAS_MATERIAIS = ?,
        DATA_AUTORIZACAO_CAUTELAS_MATERIAIS = NOW(),
        RESPONSAVEL_ENTREGA_ID_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_ENTREGA_NOME_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_ENTREGA_MASP_CAUTELAS_MATERIAIS = ?,
        DATA_ATUALIZACAO_CAUTELAS_MATERIAIS = NOW()
       WHERE ID_CAUTELAS_MATERIAIS = ?`,
      [
        mat.id,
        mat.nome,
        mat.tipo_material_nome || caut.TIPO_MATERIAL_NOME_CAUTELAS_MATERIAIS || null,
        qty,
        seraDevFlag,
        notes ? String(notes).trim() : null,
        mat.vaultId || caut.COFRE_ORIGEM_ID_CAUTELAS_MATERIAIS || null,
        armorerId || 'sistema',
        armorerName || 'Armeiro',
        armorerMasp || null,
        id
      ]
    );

    await pool.query(
      `UPDATE MATERIAIS SET
        QUANTIDADE_DISPONIVEL_MATERIAIS = GREATEST(0, QUANTIDADE_DISPONIVEL_MATERIAIS - ?),
        QUANTIDADE_EM_USO_MATERIAIS = QUANTIDADE_EM_USO_MATERIAIS + ?,
        DATA_ATUALIZACAO_MATERIAIS = NOW()
       WHERE ID_MATERIAIS = ?`,
      [qty, qty, mat.id]
    );

    await insertAuditLog(
      'Materiais',
      'Autorização de Cautela de Material',
      `Pagamento autorizado (${caut.PROTOCOLO_CAUTELAS_MATERIAIS || id}): ${qty}x "${mat.nome}" para ${caut.USUARIO_INTERNO_NOME_CAUTELAS_MATERIAIS || caut.USUARIO_EXTERNO_NOME_CAUTELAS_MATERIAIS}.`,
      { id: armorerId, name: armorerName, masp: armorerMasp },
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error authorizing cautela_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Armeiro recusa solicitação pendente
apiRouter.put('/cautelas-materiais/:id/recusar', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { reason, armorerId, armorerName, armorerMasp } = req.body;

    const [cautRows]: any = await pool.query('SELECT * FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);
    if (!cautRows || cautRows.length === 0) {
      return res.status(404).json({ error: 'Solicitação de cautela não encontrada.' });
    }
    const caut = cautRows[0];
    if (caut.STATUS_CAUTELAS_MATERIAIS !== 'PENDENTE') {
      return res.status(400).json({ error: 'Somente solicitações pendentes podem ser recusadas.' });
    }

    await pool.query(
      `UPDATE CAUTELAS_MATERIAIS SET
        STATUS_CAUTELAS_MATERIAIS = 'RECUSADA',
        MOTIVO_RECUSA_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_ENTREGA_ID_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_ENTREGA_NOME_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_ENTREGA_MASP_CAUTELAS_MATERIAIS = ?,
        DATA_ATUALIZACAO_CAUTELAS_MATERIAIS = NOW()
       WHERE ID_CAUTELAS_MATERIAIS = ?`,
      [
        reason ? String(reason).trim() : 'Indeferida pelo Armeiro',
        armorerId || 'sistema',
        armorerName || 'Armeiro',
        armorerMasp || null,
        id
      ]
    );

    await insertAuditLog(
      'Materiais',
      'Recusa de Cautela de Material',
      `Solicitação (${caut.PROTOCOLO_CAUTELAS_MATERIAIS || id}) de ${caut.MATERIAL_NOME_CAUTELAS_MATERIAIS} recusada. Motivo: ${reason || 'N/I'}.`,
      { id: armorerId, name: armorerName, masp: armorerMasp },
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error rejecting cautela_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Registrar Devolução / Solicitação de Devolução / Baixa por Consumo ou Anomalia
apiRouter.put('/cautelas-materiais/:id/devolucao', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const {
      status, // 'Devolvido' | 'DEVOLVIDA' | 'Consumido' | 'CONSUMIDA' | 'Devolvido com Anomalia'
      foiConsumido,
      returnedQuantity,
      destinationVaultSpaceId,
      relatoUsoAnomalias,
      dataDevolucao,
      pendingReceipt,
      responsavelRecebimentoId,
      responsavelRecebimentoNome,
      responsavelRecebimentoMasp
    } = req.body;

    const [cautRows]: any = await pool.query('SELECT ID_CAUTELAS_MATERIAIS as id, PROTOCOLO_CAUTELAS_MATERIAIS as protocolo, MATERIAL_ID_CAUTELAS_MATERIAIS as material_id, MATERIAL_NOME_CAUTELAS_MATERIAIS as material_nome, QUANTIDADE_CAUTELAS_MATERIAIS as quantidade, STATUS_CAUTELAS_MATERIAIS as status FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);
    if (!cautRows || cautRows.length === 0) {
      return res.status(404).json({ error: 'Cautela de material não encontrada.' });
    }
    const caut = cautRows[0];
    const allowedActiveStatuses = ['Em Uso', 'AUTORIZADA', 'DEVOLUCAO_PENDENTE'];
    if (!allowedActiveStatuses.includes(caut.status)) {
      return res.status(400).json({ error: `Esta cautela já se encontra finalizada com status "${caut.status}".` });
    }

    const totalQty = Number(caut.quantidade || 1);
    const isConsumed = Boolean(foiConsumido || status === 'Consumido' || status === 'CONSUMIDA');
    const retQty = returnedQuantity !== undefined && returnedQuantity !== null
      ? Math.max(0, Math.min(totalQty, Number(returnedQuantity)))
      : (isConsumed ? 0 : totalQty);
    const consumedQty = Math.max(0, totalQty - retQty);

    // Fluxo 1: Policial solicitando devolução (aguarda recebimento físico do Armeiro)
    if (pendingReceipt) {
      await pool.query(
        `UPDATE CAUTELAS_MATERIAIS SET
          STATUS_CAUTELAS_MATERIAIS = 'DEVOLUCAO_PENDENTE',
          FOI_CONSUMIDO_CAUTELAS_MATERIAIS = ?,
          QUANTIDADE_DEVOLVIDA_CAUTELAS_MATERIAIS = ?,
          RELATO_USO_ANOMALIAS_CAUTELAS_MATERIAIS = COALESCE(?, RELATO_USO_ANOMALIAS_CAUTELAS_MATERIAIS),
          DATA_ATUALIZACAO_CAUTELAS_MATERIAIS = NOW()
         WHERE ID_CAUTELAS_MATERIAIS = ?`,
        [
          isConsumed ? 1 : 0,
          retQty,
          relatoUsoAnomalias ? String(relatoUsoAnomalias).trim() : null,
          id
        ]
      );

      return res.json({ success: true, status: 'DEVOLUCAO_PENDENTE', pendingReceipt: true });
    }

    // Fluxo 2: Armeiro confirmando recebimento / baixa definitiva
    const finalStatus = (isConsumed && retQty === 0) || retQty === 0
      ? (status === 'Consumido' ? 'Consumido' : 'CONSUMIDA')
      : (status === 'Devolvido com Anomalia'
        ? 'Devolvido com Anomalia'
        : (caut.status === 'Em Uso' && status === 'Devolvido' ? 'Devolvido' : 'DEVOLVIDA'));

    const returnDate = dataDevolucao ? new Date(dataDevolucao) : new Date();

    await pool.query(
      `UPDATE CAUTELAS_MATERIAIS SET
        STATUS_CAUTELAS_MATERIAIS = ?,
        FOI_CONSUMIDO_CAUTELAS_MATERIAIS = ?,
        QUANTIDADE_DEVOLVIDA_CAUTELAS_MATERIAIS = ?,
        COFRE_DESTINO_ID_CAUTELAS_MATERIAIS = COALESCE(?, COFRE_DESTINO_ID_CAUTELAS_MATERIAIS),
        RELATO_USO_ANOMALIAS_CAUTELAS_MATERIAIS = COALESCE(?, RELATO_USO_ANOMALIAS_CAUTELAS_MATERIAIS),
        DATA_DEVOLUCAO_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_RECEBIMENTO_ID_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_RECEBIMENTO_NOME_CAUTELAS_MATERIAIS = ?,
        RESPONSAVEL_RECEBIMENTO_MASP_CAUTELAS_MATERIAIS = ?,
        DATA_ATUALIZACAO_CAUTELAS_MATERIAIS = NOW()
       WHERE ID_CAUTELAS_MATERIAIS = ?`,
      [
        finalStatus,
        consumedQty > 0 ? 1 : 0,
        retQty,
        destinationVaultSpaceId || null,
        relatoUsoAnomalias ? String(relatoUsoAnomalias).trim() : null,
        returnDate,
        responsavelRecebimentoId || null,
        responsavelRecebimentoNome || null,
        responsavelRecebimentoMasp || null,
        id
      ]
    );

    // Update material inventory cleanly (supports both full return, full consumption, or partial return)
    await pool.query(
      `UPDATE MATERIAIS SET
        QUANTIDADE_MATERIAIS = GREATEST(0, QUANTIDADE_MATERIAIS - ?),
        QUANTIDADE_DISPONIVEL_MATERIAIS = QUANTIDADE_DISPONIVEL_MATERIAIS + ?,
        QUANTIDADE_EM_USO_MATERIAIS = GREATEST(0, QUANTIDADE_EM_USO_MATERIAIS - ?),
        QUANTIDADE_CONSUMIDA_MATERIAIS = QUANTIDADE_CONSUMIDA_MATERIAIS + ?,
        DATA_ATUALIZACAO_MATERIAIS = NOW()
       WHERE ID_MATERIAIS = ?`,
      [consumedQty, retQty, totalQty, consumedQty, caut.material_id]
    );

    const actor = {
      id: responsavelRecebimentoId,
      name: responsavelRecebimentoNome,
      masp: responsavelRecebimentoMasp
    };

    let detailsMsg = `Devolução/Baixa de material (${caut.protocolo || caut.id}): ${retQty}x devolvido(s) e ${consumedQty}x consumido(s) de "${caut.material_nome}" (${finalStatus}).`;
    if (relatoUsoAnomalias) {
      detailsMsg += ` Relato/Anomalias: "${relatoUsoAnomalias}".`;
    }

    await insertAuditLog(
      'Materiais',
      consumedQty === totalQty ? 'Baixa de Material (Consumo)' : 'Devolução de Material',
      detailsMsg,
      actor,
      req.ip
    );

    return res.json({ success: true, status: finalStatus, isConsumed: consumedQty > 0, returnedQuantity: retQty });
  } catch (err: any) {
    console.error('Error updating cautela_material devolucao:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/cautelas-materiais/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { deletedByUserId, deletedByName } = req.query as any;

    const [cautRows]: any = await pool.query('SELECT ID_CAUTELAS_MATERIAIS as id, PROTOCOLO_CAUTELAS_MATERIAIS as protocolo, MATERIAL_ID_CAUTELAS_MATERIAIS as material_id, MATERIAL_NOME_CAUTELAS_MATERIAIS as material_nome, QUANTIDADE_CAUTELAS_MATERIAIS as quantidade, STATUS_CAUTELAS_MATERIAIS as status FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);
    if (!cautRows || cautRows.length === 0) {
      return res.status(404).json({ error: 'Cautela não encontrada.' });
    }
    const caut = cautRows[0];

    // If deleting an active loan (not PENDENTE), restore available stock
    if (caut.status === 'Em Uso' || caut.status === 'AUTORIZADA' || caut.status === 'DEVOLUCAO_PENDENTE') {
      const qty = Number(caut.quantidade || 1);
      await pool.query(
        `UPDATE MATERIAIS SET
          QUANTIDADE_DISPONIVEL_MATERIAIS = QUANTIDADE_DISPONIVEL_MATERIAIS + ?,
          QUANTIDADE_EM_USO_MATERIAIS = GREATEST(0, QUANTIDADE_EM_USO_MATERIAIS - ?),
          DATA_ATUALIZACAO_MATERIAIS = NOW()
         WHERE ID_MATERIAIS = ?`,
        [qty, qty, caut.material_id]
      );
    }

    await pool.query('DELETE FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);

    await insertAuditLog(
      'Materiais',
      'Exclusão de Cautela de Material',
      `Cautela protocolo ${caut.protocolo || caut.id} de ${caut.quantidade}x "${caut.material_nome}" excluída por ${deletedByName || 'Usuário'}.`,
      { id: deletedByUserId, name: deletedByName },
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting cautela_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- 4. TRANSFERÊNCIAS DE MATERIAIS ---
apiRouter.get('/material-transfers', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT
        ID_TRANSFERENCIAS_MATERIAIS as id,
        NUMERO_PROTOCOLO_TRANSFERENCIAS_MATERIAIS as protocolNumber,
        DATA_TRANSFERENCIA_TRANSFERENCIAS_MATERIAIS as transferDate,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_MATERIAIS as originDepartmentId,
        ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_MATERIAIS as originDepartmentName,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_MATERIAIS as originUnitId,
        ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_MATERIAIS as originUnitName,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_MATERIAIS as destinationDepartmentId,
        DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_MATERIAIS as destinationDepartmentName,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_MATERIAIS as destinationUnitId,
        DESTINO_UNIDADE_NOME_TRANSFERENCIAS_MATERIAIS as destinationUnitName,
        DESTINO_ARMEIRO_ID_TRANSFERENCIAS_MATERIAIS as destinationArmorerId,
        DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_MATERIAIS as destinationArmorerName,
        DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_MATERIAIS as destinationArmorerMasp,
        DESTINO_COFRE_ID_TRANSFERENCIAS_MATERIAIS as destinationVaultSpaceId,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_MATERIAIS as destinationVaultSpaceCode,
        RESPONSAVEL_ID_TRANSFERENCIAS_MATERIAIS as transferredByUserId,
        RESPONSAVEL_NOME_TRANSFERENCIAS_MATERIAIS as transferredByUserName,
        RESPONSAVEL_MASP_TRANSFERENCIAS_MATERIAIS as transferredByUserMasp,
        RESPONSAVEL_PERFIL_TRANSFERENCIAS_MATERIAIS as transferredByUserRole,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_MATERIAIS as receiverOrTransporterName,
        TRANSPORTADOR_MASP_TRANSFERENCIAS_MATERIAIS as receiverOrTransporterMasp,
        TRANSPORTADOR_CARGO_TRANSFERENCIAS_MATERIAIS as receiverOrTransporterCargo,
        MOTIVO_TRANSFERENCIAS_MATERIAIS as reason,
        MATERIAL_ID_TRANSFERENCIAS_MATERIAIS as materialId,
        NOME_MATERIAL_TRANSFERENCIAS_MATERIAIS as nomeMaterial,
        TIPO_NOME_TRANSFERENCIAS_MATERIAIS as tipoNome,
        NUMERO_SERIE_TRANSFERENCIAS_MATERIAIS as numeroSerie,
        QUANTIDADE_TRANSFERENCIAS_MATERIAIS as quantidade,
        ORIGIN_VAULT_CODE_TRANSFERENCIAS_MATERIAIS as originVaultCode,
        OBSERVACAO_TRANSFERENCIAS_MATERIAIS as observation,
        STATUS_TRANSFERENCIAS_MATERIAIS as status,
        RECEBIDO_EM_TRANSFERENCIAS_MATERIAIS as receivedAt,
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_MATERIAIS as receivedByUserId,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_MATERIAIS as receivedByUserName,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_MATERIAIS as receivedByUserMasp,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_MATERIAIS as receivedByUserRole,
        DATA_CRIACAO_TRANSFERENCIAS_MATERIAIS as createdAt
      FROM TRANSFERENCIAS_MATERIAIS
      ORDER BY DATA_TRANSFERENCIA_TRANSFERENCIAS_MATERIAIS DESC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    console.error('Error fetching material transfers:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/material-transfers', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const t = req.body;
    const id = t.id || `TRF-MAT-${Date.now()}`;
    const proto = t.protocolNumber || `TRF-MAT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const qty = Math.max(1, Number(t.quantidade || 1));

    const [matRows]: any = await pool.query(
      'SELECT * FROM MATERIAIS WHERE ID_MATERIAIS = ?',
      [t.materialId]
    );
    if (!matRows || matRows.length === 0) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }
    const mat = matRows[0];
    if (Number(mat.QUANTIDADE_DISPONIVEL_MATERIAIS || 0) < qty) {
      return res.status(400).json({ error: `Quantidade disponível insuficiente (${mat.QUANTIDADE_DISPONIVEL_MATERIAIS}).` });
    }

    await pool.query(
      `UPDATE MATERIAIS SET
        QUANTIDADE_MATERIAIS = GREATEST(0, QUANTIDADE_MATERIAIS - ?),
        QUANTIDADE_DISPONIVEL_MATERIAIS = GREATEST(0, QUANTIDADE_DISPONIVEL_MATERIAIS - ?),
        DATA_ATUALIZACAO_MATERIAIS = NOW()
       WHERE ID_MATERIAIS = ?`,
      [qty, qty, mat.ID_MATERIAIS]
    );

    await pool.query(
      `INSERT INTO TRANSFERENCIAS_MATERIAIS (
        ID_TRANSFERENCIAS_MATERIAIS, NUMERO_PROTOCOLO_TRANSFERENCIAS_MATERIAIS, DATA_TRANSFERENCIA_TRANSFERENCIAS_MATERIAIS,
        ORIGEM_DEPARTAMENTO_ID_TRANSFERENCIAS_MATERIAIS, ORIGEM_DEPARTAMENTO_NOME_TRANSFERENCIAS_MATERIAIS,
        ORIGEM_UNIDADE_ID_TRANSFERENCIAS_MATERIAIS, ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_MATERIAIS,
        DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_MATERIAIS, DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_MATERIAIS,
        DESTINO_UNIDADE_ID_TRANSFERENCIAS_MATERIAIS, DESTINO_UNIDADE_NOME_TRANSFERENCIAS_MATERIAIS,
        DESTINO_ARMEIRO_ID_TRANSFERENCIAS_MATERIAIS, DESTINO_ARMEIRO_NOME_TRANSFERENCIAS_MATERIAIS, DESTINO_ARMEIRO_MASP_TRANSFERENCIAS_MATERIAIS,
        RESPONSAVEL_ID_TRANSFERENCIAS_MATERIAIS, RESPONSAVEL_NOME_TRANSFERENCIAS_MATERIAIS, RESPONSAVEL_MASP_TRANSFERENCIAS_MATERIAIS, RESPONSAVEL_PERFIL_TRANSFERENCIAS_MATERIAIS,
        TRANSPORTADOR_NOME_TRANSFERENCIAS_MATERIAIS, TRANSPORTADOR_MASP_TRANSFERENCIAS_MATERIAIS, TRANSPORTADOR_CARGO_TRANSFERENCIAS_MATERIAIS,
        MOTIVO_TRANSFERENCIAS_MATERIAIS, MATERIAL_ID_TRANSFERENCIAS_MATERIAIS, NOME_MATERIAL_TRANSFERENCIAS_MATERIAIS,
        TIPO_NOME_TRANSFERENCIAS_MATERIAIS, NUMERO_SERIE_TRANSFERENCIAS_MATERIAIS, QUANTIDADE_TRANSFERENCIAS_MATERIAIS,
        ORIGIN_VAULT_CODE_TRANSFERENCIAS_MATERIAIS, OBSERVACAO_TRANSFERENCIAS_MATERIAIS, STATUS_TRANSFERENCIAS_MATERIAIS
      ) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente')`,
      [
        id,
        proto,
        t.originDepartmentId || mat.DEPARTAMENTO_ID_MATERIAIS || null,
        t.originDepartmentName || mat.DEPARTAMENTO_NOME_MATERIAIS || null,
        t.originUnitId || mat.UNIDADE_ID_MATERIAIS || null,
        t.originUnitName || mat.UNIDADE_NOME_MATERIAIS || null,
        t.destinationDepartmentId || null,
        t.destinationDepartmentName || null,
        t.destinationUnitId || null,
        t.destinationUnitName || null,
        t.destinationArmorerId || null,
        t.destinationArmorerName || null,
        t.destinationArmorerMasp || null,
        t.transferredByUserId || 'sistema',
        t.transferredByUserName || 'Armeiro',
        t.transferredByUserMasp || '',
        t.transferredByUserRole || 'Armeiro',
        t.receiverOrTransporterName || 'Armeiro Destino',
        t.receiverOrTransporterMasp || 'N/A',
        t.receiverOrTransporterCargo || null,
        t.reason || 'Transferência de Material',
        mat.ID_MATERIAIS,
        mat.NOME_MATERIAIS,
        mat.TIPO_MATERIAL_NOME_MATERIAIS || null,
        mat.NUMERO_SERIE_MATERIAIS || null,
        qty,
        mat.LOCAL_GUARDA_MATERIAIS || null,
        t.observation || null
      ]
    );

    await insertAuditLog(
      'Materiais',
      'Transferência de Material',
      `Despachada transferência (${proto}) de ${qty}x "${mat.NOME_MATERIAIS}" de ${t.originUnitName || mat.UNIDADE_NOME_MATERIAIS} para ${t.destinationUnitName || t.destinationUnitId}.`,
      { id: t.transferredByUserId, name: t.transferredByUserName, masp: t.transferredByUserMasp },
      req.ip
    );

    return res.json({ success: true, id, protocolNumber: proto });
  } catch (err: any) {
    console.error('Error creating material transfer:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/material-transfers/:id/receive', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { destinationVaultSpaceId, observation, actor } = req.body;

    const [tRows]: any = await pool.query('SELECT * FROM TRANSFERENCIAS_MATERIAIS WHERE ID_TRANSFERENCIAS_MATERIAIS = ?', [id]);
    if (!tRows || tRows.length === 0) {
      return res.status(404).json({ error: 'Transferência de material não encontrada.' });
    }
    const transfer = tRows[0];
    if (transfer.STATUS_TRANSFERENCIAS_MATERIAIS !== 'Pendente') {
      return res.status(400).json({ error: 'Esta transferência já foi recebida ou cancelada.' });
    }

    let vaultCode = 'Cofre Materiais';
    if (destinationVaultSpaceId) {
      const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [destinationVaultSpaceId]);
      if (vRows && vRows.length > 0 && vRows[0].CODIGO_COFRES) {
        vaultCode = vRows[0].CODIGO_COFRES;
      }
    }

    const obsFinal = observation
      ? `${transfer.OBSERVACAO_TRANSFERENCIAS_MATERIAIS ? transfer.OBSERVACAO_TRANSFERENCIAS_MATERIAIS + ' | ' : ''}Recibo: ${observation}`
      : transfer.OBSERVACAO_TRANSFERENCIAS_MATERIAIS;

    await pool.query(
      `UPDATE TRANSFERENCIAS_MATERIAIS SET
        STATUS_TRANSFERENCIAS_MATERIAIS = 'Recebido',
        DESTINO_COFRE_ID_TRANSFERENCIAS_MATERIAIS = ?,
        DESTINO_COFRE_CODIGO_TRANSFERENCIAS_MATERIAIS = ?,
        OBSERVACAO_TRANSFERENCIAS_MATERIAIS = ?,
        RECEBIDO_EM_TRANSFERENCIAS_MATERIAIS = NOW(),
        RECEBIDO_POR_USUARIO_ID_TRANSFERENCIAS_MATERIAIS = ?,
        RECEBIDO_POR_NOME_TRANSFERENCIAS_MATERIAIS = ?,
        RECEBIDO_POR_MASP_TRANSFERENCIAS_MATERIAIS = ?,
        RECEBIDO_POR_PERFIL_TRANSFERENCIAS_MATERIAIS = ?
       WHERE ID_TRANSFERENCIAS_MATERIAIS = ?`,
      [
        destinationVaultSpaceId || null,
        vaultCode,
        obsFinal || null,
        actor?.id || 'sistema',
        actor?.name || 'Armeiro',
        actor?.masp || '',
        actor?.role || 'Armeiro',
        id
      ]
    );

    const qty = Number(transfer.QUANTIDADE_TRANSFERENCIAS_MATERIAIS || 1);
    const [origRows]: any = await pool.query('SELECT * FROM MATERIAIS WHERE ID_MATERIAIS = ?', [transfer.MATERIAL_ID_TRANSFERENCIAS_MATERIAIS]);
    const origMat = origRows?.[0];

    const [destMatRows]: any = await pool.query(
      `SELECT * FROM MATERIAIS WHERE UNIDADE_ID_MATERIAIS = ? AND LOWER(TRIM(NOME_MATERIAIS)) = LOWER(TRIM(?)) AND (? IS NULL OR NUMERO_SERIE_MATERIAIS = ?)`,
      [
        transfer.DESTINO_UNIDADE_ID_TRANSFERENCIAS_MATERIAIS,
        transfer.NOME_MATERIAL_TRANSFERENCIAS_MATERIAIS,
        transfer.NUMERO_SERIE_TRANSFERENCIAS_MATERIAIS || null,
        transfer.NUMERO_SERIE_TRANSFERENCIAS_MATERIAIS || null
      ]
    );

    if (destMatRows && destMatRows.length > 0) {
      const dm = destMatRows[0];
      await pool.query(
        `UPDATE MATERIAIS SET
          QUANTIDADE_MATERIAIS = QUANTIDADE_MATERIAIS + ?,
          QUANTIDADE_DISPONIVEL_MATERIAIS = QUANTIDADE_DISPONIVEL_MATERIAIS + ?,
          LOCAL_GUARDA_MATERIAIS = ?,
          COFRE_ID_MATERIAIS = COALESCE(?, COFRE_ID_MATERIAIS),
          DATA_ATUALIZACAO_MATERIAIS = NOW()
         WHERE ID_MATERIAIS = ?`,
        [qty, qty, vaultCode, destinationVaultSpaceId || null, dm.ID_MATERIAIS]
      );
    } else {
      const newMatId = `mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO MATERIAIS (
          ID_MATERIAIS, TIPO_MATERIAL_ID_MATERIAIS, TIPO_MATERIAL_NOME_MATERIAIS, NOME_MATERIAIS,
          QUANTIDADE_MATERIAIS, QUANTIDADE_DISPONIVEL_MATERIAIS, QUANTIDADE_EM_USO_MATERIAIS, QUANTIDADE_CONSUMIDA_MATERIAIS,
          DEPARTAMENTO_ID_MATERIAIS, DEPARTAMENTO_NOME_MATERIAIS, UNIDADE_ID_MATERIAIS, UNIDADE_NOME_MATERIAIS,
          VALIDADE_MATERIAIS, LOCAL_GUARDA_MATERIAIS, COFRE_ID_MATERIAIS, PASSIVO_DEPOSITO_POLICIAIS, NUMERO_SERIE_MATERIAIS, OBSERVACOES_MATERIAIS,
          CRIADO_POR_USUARIO_ID_MATERIAIS, CRIADO_POR_NOME_MATERIAIS, DATA_CRIACAO_MATERIAIS, DATA_ATUALIZACAO_MATERIAIS
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          newMatId,
          origMat?.TIPO_MATERIAL_ID_MATERIAIS || 'tipo-geral',
          transfer.TIPO_NOME_TRANSFERENCIAS_MATERIAIS || origMat?.TIPO_MATERIAL_NOME_MATERIAIS || 'Geral',
          transfer.NOME_MATERIAL_TRANSFERENCIAS_MATERIAIS,
          qty,
          qty,
          transfer.DESTINO_DEPARTAMENTO_ID_TRANSFERENCIAS_MATERIAIS,
          transfer.DESTINO_DEPARTAMENTO_NOME_TRANSFERENCIAS_MATERIAIS || null,
          transfer.DESTINO_UNIDADE_ID_TRANSFERENCIAS_MATERIAIS,
          transfer.DESTINO_UNIDADE_NOME_TRANSFERENCIAS_MATERIAIS || null,
          origMat?.VALIDADE_MATERIAIS || null,
          vaultCode,
          destinationVaultSpaceId || null,
          origMat?.PASSIVO_DEPOSITO_POLICIAIS ?? 1,
          transfer.NUMERO_SERIE_TRANSFERENCIAS_MATERIAIS || null,
          `Recebido via Transferência ${transfer.NUMERO_PROTOCOLO_TRANSFERENCIAS_MATERIAIS || id} da unidade ${transfer.ORIGEM_UNIDADE_NOME_TRANSFERENCIAS_MATERIAIS || ''}`,
          actor?.id || null,
          actor?.name || null
        ]
      );
    }

    await insertAuditLog(
      'Materiais',
      'Recebimento de Transferência de Material',
      `Recebida transferência (${transfer.NUMERO_PROTOCOLO_TRANSFERENCIAS_MATERIAIS || id}): ${qty}x "${transfer.NOME_MATERIAL_TRANSFERENCIAS_MATERIAIS}" no cofre ${vaultCode}.`,
      actor,
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error receiving material transfer:', err);
    return res.status(500).json({ error: err.message });
  }
});

// =================================================================
// ROTAS DO MÓDULO DE EXPLOSIVOS
// =================================================================
apiRouter.get('/explosivos', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { departamentoId, unidadeId } = req.query;
    let query = `
      SELECT 
        ID_EXPLOSIVOS as id,
        NOME_EXPLOSIVOS as nome,
        TIPO_EXPLOSIVOS as tipo,
        SUBTIPO_EXPLOSIVOS as subtipo,
        QUANTIDADE_EXPLOSIVOS as quantidade,
        UNIDADE_MEDIDA_EXPLOSIVOS as unidadeMedida,
        LOTE_EXPLOSIVOS as lote,
        FABRICANTE_EXPLOSIVOS as fabricante,
        DATA_FABRICACAO_EXPLOSIVOS as dataFabricacao,
        DATA_VALIDADE_EXPLOSIVOS as dataValidade,
        CLASSE_RISCO_EXPLOSIVOS as classeRisco,
        LOCAL_ARMAZENAMENTO_EXPLOSIVOS as localArmazenamento,
        COFRE_ID_EXPLOSIVOS as cofreId,
        COFRE_ID_EXPLOSIVOS as vaultSpaceId,
        STATUS_EXPLOSIVOS as status,
        DEPARTAMENTO_ID_EXPLOSIVOS as departmentId,
        UNIDADE_ID_EXPLOSIVOS as unitId,
        OBSERVACOES_EXPLOSIVOS as observacoes,
        DATA_CRIACAO_EXPLOSIVOS as createdAt
      FROM EXPLOSIVOS
      WHERE 1=1
    `;
    const params: any[] = [];
    if (departamentoId && departamentoId !== 'ALL') {
      query += ' AND DEPARTAMENTO_ID_EXPLOSIVOS = ?';
      params.push(departamentoId);
    }
    if (unidadeId && unidadeId !== 'ALL') {
      query += ' AND UNIDADE_ID_EXPLOSIVOS = ?';
      params.push(unidadeId);
    }
    query += ' ORDER BY NOME_EXPLOSIVOS ASC';

    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      ...r,
      nome: r.nome || r.NOME_EXPLOSIVOS || '',
      tipo: r.tipo || r.TIPO_EXPLOSIVOS || 'Outro',
      subtipo: r.subtipo || r.SUBTIPO_EXPLOSIVOS || '',
      lote: r.lote || r.LOTE_EXPLOSIVOS || '',
      fabricante: r.fabricante || r.FABRICANTE_EXPLOSIVOS || '',
      localArmazenamento: r.localArmazenamento || r.LOCAL_ARMAZENAMENTO_EXPLOSIVOS || '',
      status: r.status || r.STATUS_EXPLOSIVOS || 'Operacional',
      quantidade: Number(r.quantidade || 0),
      dataFabricacao: r.dataFabricacao ? (r.dataFabricacao instanceof Date ? r.dataFabricacao.toISOString().split('T')[0] : String(r.dataFabricacao).substring(0, 10)) : undefined,
      dataValidade: r.dataValidade ? (r.dataValidade instanceof Date ? r.dataValidade.toISOString().split('T')[0] : String(r.dataValidade).substring(0, 10)) : undefined
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching explosivos:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/explosivos', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const {
      id,
      nome,
      tipo,
      subtipo,
      quantidade,
      unidadeMedida,
      lote,
      fabricante,
      dataFabricacao,
      dataValidade,
      classeRisco,
      localArmazenamento,
      cofreId,
      vaultSpaceId,
      status,
      departmentId,
      unitId,
      observacoes,
      actor
    } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome do explosivo é obrigatório.' });
    }
    if (!tipo || !tipo.trim()) {
      return res.status(400).json({ error: 'Tipo/categoria do explosivo é obrigatório.' });
    }
    if (!lote || !lote.trim()) {
      return res.status(400).json({ error: 'Lote de fabricação é obrigatório.' });
    }
    if (!localArmazenamento || !localArmazenamento.trim()) {
      return res.status(400).json({ error: 'Local de armazenamento/cofre é obrigatório.' });
    }

    const qty = parseFloat(quantidade) || 0;
    const finalId = id || `exp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const finalCofreId = cofreId || vaultSpaceId || null;

    const [existing]: any = await pool.query('SELECT ID_EXPLOSIVOS FROM EXPLOSIVOS WHERE ID_EXPLOSIVOS = ?', [finalId]);
    if (existing && existing.length > 0) {
      await pool.query(
        `UPDATE EXPLOSIVOS SET
          NOME_EXPLOSIVOS = ?,
          TIPO_EXPLOSIVOS = ?,
          SUBTIPO_EXPLOSIVOS = ?,
          QUANTIDADE_EXPLOSIVOS = ?,
          UNIDADE_MEDIDA_EXPLOSIVOS = ?,
          LOTE_EXPLOSIVOS = ?,
          FABRICANTE_EXPLOSIVOS = ?,
          DATA_FABRICACAO_EXPLOSIVOS = ?,
          DATA_VALIDADE_EXPLOSIVOS = ?,
          CLASSE_RISCO_EXPLOSIVOS = ?,
          LOCAL_ARMAZENAMENTO_EXPLOSIVOS = ?,
          COFRE_ID_EXPLOSIVOS = ?,
          STATUS_EXPLOSIVOS = ?,
          DEPARTAMENTO_ID_EXPLOSIVOS = ?,
          UNIDADE_ID_EXPLOSIVOS = ?,
          OBSERVACOES_EXPLOSIVOS = ?
        WHERE ID_EXPLOSIVOS = ?`,
        [
          nome.trim(),
          tipo.trim(),
          subtipo?.trim() || null,
          qty,
          unidadeMedida || 'kg',
          lote.trim(),
          fabricante?.trim() || null,
          dataFabricacao || null,
          dataValidade || null,
          classeRisco?.trim() || '1.1D',
          localArmazenamento.trim(),
          finalCofreId,
          status || 'Disponível',
          departmentId || null,
          unitId || null,
          observacoes?.trim() || null,
          finalId
        ]
      );

      await insertAuditLog(
        'Explosivos',
        'Editar',
        `Atualizado material explosivo: "${nome.trim()}" (Lote: ${lote.trim()})`,
        actor,
        req.ip
      );
    } else {
      await pool.query(
        `INSERT INTO EXPLOSIVOS (
          ID_EXPLOSIVOS, NOME_EXPLOSIVOS, TIPO_EXPLOSIVOS, SUBTIPO_EXPLOSIVOS,
          QUANTIDADE_EXPLOSIVOS, UNIDADE_MEDIDA_EXPLOSIVOS, LOTE_EXPLOSIVOS,
          FABRICANTE_EXPLOSIVOS, DATA_FABRICACAO_EXPLOSIVOS, DATA_VALIDADE_EXPLOSIVOS,
          CLASSE_RISCO_EXPLOSIVOS, LOCAL_ARMAZENAMENTO_EXPLOSIVOS, COFRE_ID_EXPLOSIVOS,
          STATUS_EXPLOSIVOS, DEPARTAMENTO_ID_EXPLOSIVOS, UNIDADE_ID_EXPLOSIVOS,
          OBSERVACOES_EXPLOSIVOS, DATA_CRIACAO_EXPLOSIVOS
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          finalId,
          nome.trim(),
          tipo.trim(),
          subtipo?.trim() || null,
          qty,
          unidadeMedida || 'kg',
          lote.trim(),
          fabricante?.trim() || null,
          dataFabricacao || null,
          dataValidade || null,
          classeRisco?.trim() || '1.1D',
          localArmazenamento.trim(),
          finalCofreId,
          status || 'Disponível',
          departmentId || null,
          unitId || null,
          observacoes?.trim() || null
        ]
      );

      await insertAuditLog(
        'Explosivos',
        'Criar',
        `Cadastrado novo material explosivo: "${nome.trim()}" (Qtd: ${qty} ${unidadeMedida || 'kg'})`,
        actor,
        req.ip
      );
    }

    return res.json({ success: true, id: finalId });
  } catch (err: any) {
    console.error('Error saving explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body?.actor;
    const pool = getPool();

    const [rows]: any = await pool.query('SELECT NOME_EXPLOSIVOS as nome, LOTE_EXPLOSIVOS as lote FROM EXPLOSIVOS WHERE ID_EXPLOSIVOS = ?', [id]);
    const exp = rows && rows.length > 0 ? rows[0] : null;

    await pool.query('DELETE FROM EXPLOSIVOS WHERE ID_EXPLOSIVOS = ?', [id]);

    await insertAuditLog(
      'Explosivos',
      'Excluir',
      `Excluído registro de explosivo: "${exp?.nome || id}" (Lote: ${exp?.lote || 'N/A'})`,
      actor,
      req.ip
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/movimentacoes-explosivos', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { explosivoId, departamentoId, unidadeId, cofreId } = req.query;
    let query = `
      SELECT 
        m.ID_MOVIMENTACOES_EXPLOSIVOS as id,
        m.EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS as explosivoId,
        m.NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS as nomeExplosivo,
        m.NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS as explosivoNome,
        m.TIPO_MOVIMENTACAO_EXPLOSIVOS as tipoMovimentacao,
        m.QUANTIDADE_MOVIMENTACOES_EXPLOSIVOS as quantidade,
        m.UNIDADE_MEDIDA_MOVIMENTACOES_EXPLOSIVOS as unidadeMedida,
        m.MOTIVO_MOVIMENTACOES_EXPLOSIVOS as motivo,
        m.RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS as responsavelNome,
        m.RESPONSAVEL_MASP_MOVIMENTACOES_EXPLOSIVOS as responsavelMasp,
        m.RESPONSAVEL_ID_MOVIMENTACOES_EXPLOSIVOS as responsavelId,
        m.LOCAL_ORIGEM_DESTINO_MOVIMENTACOES_EXPLOSIVOS as localOrigemDestino,
        COALESCE(m.COFRE_ID_MOVIMENTACOES_EXPLOSIVOS, e.COFRE_ID_EXPLOSIVOS) as cofreId,
        COALESCE(m.LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS, e.LOCAL_ARMAZENAMENTO_EXPLOSIVOS) as localCofre,
        m.DATA_MOVIMENTACAO_EXPLOSIVOS as dataMovimentacao,
        m.DEPARTAMENTO_ID_MOVIMENTACOES_EXPLOSIVOS as departmentId,
        m.UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS as unitId,
        m.OBSERVACOES_MOVIMENTACOES_EXPLOSIVOS as observacoes
      FROM MOVIMENTACOES_EXPLOSIVOS m
      LEFT JOIN EXPLOSIVOS e ON m.EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS = e.ID_EXPLOSIVOS
      WHERE 1=1
    `;
    const params: any[] = [];
    if (explosivoId) {
      query += ' AND m.EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS = ?';
      params.push(explosivoId);
    }
    if (departamentoId && departamentoId !== 'ALL') {
      query += ' AND m.DEPARTAMENTO_ID_MOVIMENTACOES_EXPLOSIVOS = ?';
      params.push(departamentoId);
    }
    if (unidadeId && unidadeId !== 'ALL') {
      query += ' AND m.UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS = ?';
      params.push(unidadeId);
    }
    if (cofreId && cofreId !== 'ALL') {
      query += ' AND (m.COFRE_ID_MOVIMENTACOES_EXPLOSIVOS = ? OR m.LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS = ? OR e.COFRE_ID_EXPLOSIVOS = ? OR e.LOCAL_ARMAZENAMENTO_EXPLOSIVOS = ?)';
      params.push(cofreId, cofreId, cofreId, cofreId);
    }
    query += ' ORDER BY m.DATA_MOVIMENTACAO_EXPLOSIVOS DESC';

    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      ...r,
      quantidade: Number(r.quantidade || 0)
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching movimentacoes_explosivos:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/movimentacoes-explosivos', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const {
      explosivoId,
      tipoMovimentacao,
      quantidade,
      motivo,
      responsavelNome,
      responsavelMasp,
      responsavelId,
      localOrigemDestino,
      dataMovimentacao,
      observacoes,
      cofreId,
      localCofre,
      actor
    } = req.body;

    if (!explosivoId) {
      return res.status(400).json({ error: 'Selecione o material explosivo.' });
    }
    if (!tipoMovimentacao) {
      return res.status(400).json({ error: 'Informe o tipo de movimentação.' });
    }
    const qty = parseFloat(quantidade);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Informe uma quantidade válida maior que zero.' });
    }
    if (!responsavelNome || !responsavelNome.trim()) {
      return res.status(400).json({ error: 'Informe o policial ou armeiro responsável.' });
    }

    const [expRows]: any = await pool.query(
      'SELECT NOME_EXPLOSIVOS, QUANTIDADE_EXPLOSIVOS, UNIDADE_MEDIDA_EXPLOSIVOS, DEPARTAMENTO_ID_EXPLOSIVOS, UNIDADE_ID_EXPLOSIVOS, COFRE_ID_EXPLOSIVOS, LOCAL_ARMAZENAMENTO_EXPLOSIVOS FROM EXPLOSIVOS WHERE ID_EXPLOSIVOS = ?',
      [explosivoId]
    );
    if (!expRows || expRows.length === 0) {
      return res.status(404).json({ error: 'Explosivo não encontrado no sistema.' });
    }

    const exp = expRows[0];
    const currentQty = Number(exp.QUANTIDADE_EXPLOSIVOS || 0);

    const isOutflow = 
      tipoMovimentacao === 'Saída' || 
      tipoMovimentacao === 'Saída / Cautela' || 
      tipoMovimentacao === 'Consumo Operacional' || 
      tipoMovimentacao === 'Consumo/Treinamento' || 
      tipoMovimentacao === 'Destruição Técnica' || 
      tipoMovimentacao === 'Descarte/Destruição' || 
      tipoMovimentacao === 'Instrução / Treinamento';
    if (isOutflow && currentQty < qty) {
      return res.status(400).json({ error: `Estoque insuficiente de explosivo. Disponível: ${currentQty} ${exp.UNIDADE_MEDIDA_EXPLOSIVOS}, Solicitado: ${qty}.` });
    }

    const newQty = isOutflow ? Math.max(0, currentQty - qty) : currentQty + qty;
    const movId = `mve-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const effectiveCofreId = cofreId || exp.COFRE_ID_EXPLOSIVOS || null;
    const effectiveLocalCofre = localCofre || exp.LOCAL_ARMAZENAMENTO_EXPLOSIVOS || null;

    await pool.query(
      `INSERT INTO MOVIMENTACOES_EXPLOSIVOS (
        ID_MOVIMENTACOES_EXPLOSIVOS,
        EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS,
        NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS,
        TIPO_MOVIMENTACAO_EXPLOSIVOS,
        QUANTIDADE_MOVIMENTACOES_EXPLOSIVOS,
        UNIDADE_MEDIDA_MOVIMENTACOES_EXPLOSIVOS,
        MOTIVO_MOVIMENTACOES_EXPLOSIVOS,
        RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS,
        RESPONSAVEL_MASP_MOVIMENTACOES_EXPLOSIVOS,
        RESPONSAVEL_ID_MOVIMENTACOES_EXPLOSIVOS,
        LOCAL_ORIGEM_DESTINO_MOVIMENTACOES_EXPLOSIVOS,
        COFRE_ID_MOVIMENTACOES_EXPLOSIVOS,
        LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS,
        DATA_MOVIMENTACAO_EXPLOSIVOS,
        DEPARTAMENTO_ID_MOVIMENTACOES_EXPLOSIVOS,
        UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS,
        OBSERVACOES_MOVIMENTACOES_EXPLOSIVOS
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        explosivoId,
        exp.NOME_EXPLOSIVOS,
        tipoMovimentacao,
        qty,
        exp.UNIDADE_MEDIDA_EXPLOSIVOS,
        motivo || 'Operação Especial',
        responsavelNome.trim(),
        responsavelMasp?.trim() || null,
        responsavelId || null,
        localOrigemDestino?.trim() || null,
        effectiveCofreId,
        effectiveLocalCofre,
        dataMovimentacao || new Date(),
        exp.DEPARTAMENTO_ID_EXPLOSIVOS,
        exp.UNIDADE_ID_EXPLOSIVOS,
        observacoes?.trim() || null
      ]
    );

    await pool.query('UPDATE EXPLOSIVOS SET QUANTIDADE_EXPLOSIVOS = ? WHERE ID_EXPLOSIVOS = ?', [newQty, explosivoId]);

    await insertAuditLog(
      'Explosivos',
      'Movimentação',
      `Movimentação "${tipoMovimentacao}" de ${qty} ${exp.UNIDADE_MEDIDA_EXPLOSIVOS} de "${exp.NOME_EXPLOSIVOS}". Local Cofre: ${effectiveLocalCofre || 'N/A'}. Novo estoque: ${newQty}`,
      actor,
      req.ip
    );

    return res.json({ success: true, id: movId, newQuantity: newQty });
  } catch (err: any) {
    console.error('Error saving movimentacao_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/tipos-explosivos', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(
      'SELECT ID_TIPOS_EXPLOSIVOS as id, NOME_TIPOS_EXPLOSIVOS as nome, DESCRICAO_TIPOS_EXPLOSIVOS as descricao, DATA_CRIACAO_TIPOS_EXPLOSIVOS as createdAt FROM TIPOS_EXPLOSIVOS ORDER BY NOME_TIPOS_EXPLOSIVOS ASC'
    );
    const mapped = (rows || []).map((r: any) => ({
      id: r.id || r.ID_TIPOS_EXPLOSIVOS || '',
      nome: r.nome || r.NOME_TIPOS_EXPLOSIVOS || '',
      descricao: r.descricao || r.DESCRICAO_TIPOS_EXPLOSIVOS || '',
      createdAt: r.createdAt || r.DATA_CRIACAO_TIPOS_EXPLOSIVOS
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching tipos_explosivos:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/tipos-explosivos', async (req: Request, res: Response) => {
  try {
    const { nome, descricao, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do tipo de explosivo é obrigatório.' });
    }
    const cleanNome = nome.trim();
    const pool = getPool();

    const [existing]: any = await pool.query(
      'SELECT ID_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE LOWER(NOME_TIPOS_EXPLOSIVOS) = LOWER(?)',
      [cleanNome]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `O tipo de explosivo "${cleanNome}" já está cadastrado.` });
    }

    const id = `te-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await pool.query(
      'INSERT INTO TIPOS_EXPLOSIVOS (ID_TIPOS_EXPLOSIVOS, NOME_TIPOS_EXPLOSIVOS, DESCRICAO_TIPOS_EXPLOSIVOS, DATA_CRIACAO_TIPOS_EXPLOSIVOS) VALUES (?, ?, ?, NOW())',
      [id, cleanNome, descricao?.trim() || null]
    );

    await insertAuditLog('Explosivos', 'Criar Tipo', `Cadastrado novo tipo de explosivo: "${cleanNome}"`, actor, req.ip);
    return res.json({ success: true, id, nome: cleanNome });
  } catch (err: any) {
    console.error('Error creating tipo_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/tipos-explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, descricao, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do tipo de explosivo é obrigatório.' });
    }
    const cleanNome = nome.trim();
    const pool = getPool();

    const [existing]: any = await pool.query(
      'SELECT ID_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE LOWER(NOME_TIPOS_EXPLOSIVOS) = LOWER(?) AND ID_TIPOS_EXPLOSIVOS != ?',
      [cleanNome, id]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe outro tipo de explosivo com o nome "${cleanNome}".` });
    }

    // Get old name to update cascade if used
    const [oldRows]: any = await pool.query('SELECT NOME_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE ID_TIPOS_EXPLOSIVOS = ?', [id]);
    const oldNome = oldRows && oldRows.length > 0 ? oldRows[0].NOME_TIPOS_EXPLOSIVOS : null;

    if (!oldRows || oldRows.length === 0) {
      // If doesn't exist by id, check if it exists by matching cleanNome or upsert
      await pool.query(
        `INSERT INTO TIPOS_EXPLOSIVOS (ID_TIPOS_EXPLOSIVOS, NOME_TIPOS_EXPLOSIVOS, DESCRICAO_TIPOS_EXPLOSIVOS, DATA_CRIACAO_TIPOS_EXPLOSIVOS)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE NOME_TIPOS_EXPLOSIVOS = VALUES(NOME_TIPOS_EXPLOSIVOS), DESCRICAO_TIPOS_EXPLOSIVOS = VALUES(DESCRICAO_TIPOS_EXPLOSIVOS)`,
        [id, cleanNome, descricao?.trim() || null]
      );
    } else {
      await pool.query(
        'UPDATE TIPOS_EXPLOSIVOS SET NOME_TIPOS_EXPLOSIVOS = ?, DESCRICAO_TIPOS_EXPLOSIVOS = ? WHERE ID_TIPOS_EXPLOSIVOS = ?',
        [cleanNome, descricao?.trim() || null, id]
      );
    }

    // Update explosives and subtypes using this type name
    if (oldNome && oldNome !== cleanNome) {
      await pool.query('UPDATE EXPLOSIVOS SET TIPO_EXPLOSIVOS = ? WHERE TIPO_EXPLOSIVOS = ?', [cleanNome, oldNome]);
      await pool.query('UPDATE SUBTIPOS_EXPLOSIVOS SET TIPO_NOME_SUBTIPOS_EXPLOSIVOS = ? WHERE TIPO_ID_SUBTIPOS_EXPLOSIVOS = ? OR TIPO_NOME_SUBTIPOS_EXPLOSIVOS = ?', [cleanNome, id, oldNome]);
    }

    await insertAuditLog('Explosivos', 'Editar Tipo', `Atualizado tipo de explosivo: "${cleanNome}"`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating tipo_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/tipos-explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    let [typeRows]: any = await pool.query('SELECT ID_TIPOS_EXPLOSIVOS, NOME_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE ID_TIPOS_EXPLOSIVOS = ?', [id]);
    if (!typeRows || typeRows.length === 0) {
      [typeRows] = await pool.query('SELECT ID_TIPOS_EXPLOSIVOS, NOME_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE LOWER(NOME_TIPOS_EXPLOSIVOS) = LOWER(?)', [id]);
    }

    if (!typeRows || typeRows.length === 0) {
      return res.json({ success: true, message: 'Tipo não encontrado no banco ou já removido.' });
    }

    const typeId = typeRows[0].ID_TIPOS_EXPLOSIVOS;
    const typeName = typeRows[0].NOME_TIPOS_EXPLOSIVOS;

    // Check if there are explosives registered with this type
    const [used]: any = await pool.query('SELECT COUNT(*) as c FROM EXPLOSIVOS WHERE TIPO_EXPLOSIVOS = ?', [typeName]);
    if (used && used[0]?.c > 0) {
      return res.status(400).json({ error: `Não é possível excluir o tipo "${typeName}" pois existem ${used[0].c} material(is) cadastrado(s) com este tipo.` });
    }

    // Cascade remove or unlink subtipos
    await pool.query('DELETE FROM SUBTIPOS_EXPLOSIVOS WHERE TIPO_ID_SUBTIPOS_EXPLOSIVOS = ? OR TIPO_NOME_SUBTIPOS_EXPLOSIVOS = ?', [typeId, typeName]);
    await pool.query('DELETE FROM TIPOS_EXPLOSIVOS WHERE ID_TIPOS_EXPLOSIVOS = ?', [typeId]);

    await insertAuditLog('Explosivos', 'Excluir Tipo', `Excluído tipo de explosivo: "${typeName}"`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting tipo_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- SUBTIPOS DE EXPLOSIVOS ---
apiRouter.get('/subtipos-explosivos', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { tipoId, tipoNome } = req.query;
    let query = 'SELECT ID_SUBTIPOS_EXPLOSIVOS as id, TIPO_ID_SUBTIPOS_EXPLOSIVOS as tipoId, TIPO_NOME_SUBTIPOS_EXPLOSIVOS as tipoNome, NOME_SUBTIPOS_EXPLOSIVOS as nome, DESCRICAO_SUBTIPOS_EXPLOSIVOS as descricao, DATA_CRIACAO_SUBTIPOS_EXPLOSIVOS as createdAt FROM SUBTIPOS_EXPLOSIVOS WHERE 1=1';
    const params: any[] = [];
    if (tipoId) {
      query += ' AND TIPO_ID_SUBTIPOS_EXPLOSIVOS = ?';
      params.push(tipoId);
    }
    if (tipoNome) {
      query += ' AND LOWER(TIPO_NOME_SUBTIPOS_EXPLOSIVOS) = LOWER(?)';
      params.push(tipoNome);
    }
    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id || r.ID_SUBTIPOS_EXPLOSIVOS || '',
      tipoId: r.tipoId || r.TIPO_ID_SUBTIPOS_EXPLOSIVOS || '',
      tipoNome: r.tipoNome || r.TIPO_NOME_SUBTIPOS_EXPLOSIVOS || '',
      nome: r.nome || r.NOME_SUBTIPOS_EXPLOSIVOS || '',
      descricao: r.descricao || r.DESCRICAO_SUBTIPOS_EXPLOSIVOS || '',
      createdAt: r.createdAt || r.DATA_CRIACAO_SUBTIPOS_EXPLOSIVOS
    }));
    return res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching subtipos_explosivos:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/subtipos-explosivos', async (req: Request, res: Response) => {
  try {
    const { tipoId, tipoNome, nome, descricao, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do subtipo de explosivo é obrigatório.' });
    }
    if (!tipoId && !tipoNome) {
      return res.status(400).json({ error: 'Selecione o tipo de explosivo ao qual este subtipo pertence.' });
    }
    const cleanNome = nome.trim();
    const pool = getPool();

    let resolvedTipoId = tipoId;
    let resolvedTipoNome = tipoNome;

    if (!resolvedTipoNome && resolvedTipoId) {
      const [tRows]: any = await pool.query('SELECT NOME_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE ID_TIPOS_EXPLOSIVOS = ?', [resolvedTipoId]);
      if (tRows && tRows.length > 0) resolvedTipoNome = tRows[0].NOME_TIPOS_EXPLOSIVOS;
    } else if (!resolvedTipoId && resolvedTipoNome) {
      const [tRows]: any = await pool.query('SELECT ID_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE LOWER(NOME_TIPOS_EXPLOSIVOS) = LOWER(?)', [resolvedTipoNome]);
      if (tRows && tRows.length > 0) resolvedTipoId = tRows[0].ID_TIPOS_EXPLOSIVOS;
      else resolvedTipoId = `te-${Date.now()}`;
    }

    const id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await pool.query(
      'INSERT INTO SUBTIPOS_EXPLOSIVOS (ID_SUBTIPOS_EXPLOSIVOS, TIPO_ID_SUBTIPOS_EXPLOSIVOS, TIPO_NOME_SUBTIPOS_EXPLOSIVOS, NOME_SUBTIPOS_EXPLOSIVOS, DESCRICAO_SUBTIPOS_EXPLOSIVOS, DATA_CRIACAO_SUBTIPOS_EXPLOSIVOS) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, resolvedTipoId, resolvedTipoNome || '', cleanNome, descricao?.trim() || null]
    );

    await insertAuditLog('Explosivos', 'Criar Subtipo', `Cadastrado subtipo "${cleanNome}" para o tipo "${resolvedTipoNome}"`, actor, req.ip);
    return res.json({ success: true, id, nome: cleanNome });
  } catch (err: any) {
    console.error('Error creating subtipo_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/subtipos-explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tipoId, tipoNome, nome, descricao, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do subtipo de explosivo é obrigatório.' });
    }
    const cleanNome = nome.trim();
    const pool = getPool();

    let resolvedTipoId = tipoId;
    let resolvedTipoNome = tipoNome;

    if (!resolvedTipoNome && resolvedTipoId) {
      const [tRows]: any = await pool.query('SELECT NOME_TIPOS_EXPLOSIVOS FROM TIPOS_EXPLOSIVOS WHERE ID_TIPOS_EXPLOSIVOS = ?', [resolvedTipoId]);
      if (tRows && tRows.length > 0) resolvedTipoNome = tRows[0].NOME_TIPOS_EXPLOSIVOS;
    }

    await pool.query(
      'UPDATE SUBTIPOS_EXPLOSIVOS SET TIPO_ID_SUBTIPOS_EXPLOSIVOS = COALESCE(?, TIPO_ID_SUBTIPOS_EXPLOSIVOS), TIPO_NOME_SUBTIPOS_EXPLOSIVOS = COALESCE(?, TIPO_NOME_SUBTIPOS_EXPLOSIVOS), NOME_SUBTIPOS_EXPLOSIVOS = ?, DESCRICAO_SUBTIPOS_EXPLOSIVOS = ? WHERE ID_SUBTIPOS_EXPLOSIVOS = ?',
      [resolvedTipoId || null, resolvedTipoNome || null, cleanNome, descricao?.trim() || null, id]
    );

    await insertAuditLog('Explosivos', 'Editar Subtipo', `Atualizado subtipo de explosivo: "${cleanNome}"`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating subtipo_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/subtipos-explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    const [subRows]: any = await pool.query('SELECT NOME_SUBTIPOS_EXPLOSIVOS FROM SUBTIPOS_EXPLOSIVOS WHERE ID_SUBTIPOS_EXPLOSIVOS = ?', [id]);
    const subName = subRows && subRows.length > 0 ? subRows[0].NOME_SUBTIPOS_EXPLOSIVOS : id;

    await pool.query('DELETE FROM SUBTIPOS_EXPLOSIVOS WHERE ID_SUBTIPOS_EXPLOSIVOS = ?', [id]);
    await insertAuditLog('Explosivos', 'Excluir Subtipo', `Excluído subtipo de explosivo: "${subName}"`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting subtipo_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- FABRICANTES DE EXPLOSIVOS ---
apiRouter.get('/fabricantes-explosivos', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(
      'SELECT ID_FABRICANTES_EXPLOSIVOS as id, NOME_FABRICANTES_EXPLOSIVOS as nome, PAIS_FABRICANTES_EXPLOSIVOS as pais, DESCRICAO_FABRICANTES_EXPLOSIVOS as descricao, DATA_CRIACAO_FABRICANTES_EXPLOSIVOS as createdAt FROM FABRICANTES_EXPLOSIVOS ORDER BY NOME_FABRICANTES_EXPLOSIVOS ASC'
    );
    return res.json(rows || []);
  } catch (err: any) {
    console.error('Error fetching fabricantes_explosivos:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/fabricantes-explosivos', async (req: Request, res: Response) => {
  try {
    const { nome, pais, descricao, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do fabricante é obrigatório.' });
    }
    const cleanNome = nome.trim();
    const pool = getPool();

    const [existing]: any = await pool.query(
      'SELECT ID_FABRICANTES_EXPLOSIVOS FROM FABRICANTES_EXPLOSIVOS WHERE LOWER(NOME_FABRICANTES_EXPLOSIVOS) = LOWER(?)',
      [cleanNome]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `O fabricante "${cleanNome}" já está cadastrado.` });
    }

    const id = `fab-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await pool.query(
      'INSERT INTO FABRICANTES_EXPLOSIVOS (ID_FABRICANTES_EXPLOSIVOS, NOME_FABRICANTES_EXPLOSIVOS, PAIS_FABRICANTES_EXPLOSIVOS, DESCRICAO_FABRICANTES_EXPLOSIVOS, DATA_CRIACAO_FABRICANTES_EXPLOSIVOS) VALUES (?, ?, ?, ?, NOW())',
      [id, cleanNome, pais?.trim() || 'Brasil', descricao?.trim() || null]
    );

    await insertAuditLog('Explosivos', 'Criar Fabricante', `Cadastrado fabricante de explosivos: "${cleanNome}"`, actor, req.ip);
    return res.json({ success: true, id, nome: cleanNome });
  } catch (err: any) {
    console.error('Error creating fabricante_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/fabricantes-explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, pais, descricao, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do fabricante é obrigatório.' });
    }
    const cleanNome = nome.trim();
    const pool = getPool();

    const [existing]: any = await pool.query(
      'SELECT ID_FABRICANTES_EXPLOSIVOS FROM FABRICANTES_EXPLOSIVOS WHERE LOWER(NOME_FABRICANTES_EXPLOSIVOS) = LOWER(?) AND ID_FABRICANTES_EXPLOSIVOS != ?',
      [cleanNome, id]
    );
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe outro fabricante com o nome "${cleanNome}".` });
    }

    await pool.query(
      'UPDATE FABRICANTES_EXPLOSIVOS SET NOME_FABRICANTES_EXPLOSIVOS = ?, PAIS_FABRICANTES_EXPLOSIVOS = ?, DESCRICAO_FABRICANTES_EXPLOSIVOS = ? WHERE ID_FABRICANTES_EXPLOSIVOS = ?',
      [cleanNome, pais?.trim() || 'Brasil', descricao?.trim() || null, id]
    );

    await insertAuditLog('Explosivos', 'Editar Fabricante', `Atualizado fabricante de explosivos: "${cleanNome}"`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating fabricante_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/fabricantes-explosivos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    const [fabRows]: any = await pool.query('SELECT NOME_FABRICANTES_EXPLOSIVOS FROM FABRICANTES_EXPLOSIVOS WHERE ID_FABRICANTES_EXPLOSIVOS = ?', [id]);
    const fabName = fabRows && fabRows.length > 0 ? fabRows[0].NOME_FABRICANTES_EXPLOSIVOS : id;

    await pool.query('DELETE FROM FABRICANTES_EXPLOSIVOS WHERE ID_FABRICANTES_EXPLOSIVOS = ?', [id]);
    await insertAuditLog('Explosivos', 'Excluir Fabricante', `Excluído fabricante de explosivos: "${fabName}"`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting fabricante_explosivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MÓDULO MATERIAL VETERINÁRIO & CANIL K9
// =============================================================

// --- 1. CANIS FÍSICOS ---
apiRouter.get('/canis-fisicos', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_CANIL as id,
        NOME_CANIL as nome,
        IDENTIFICACAO_CANIL as identificacao,
        CAPACIDADE_CANIL as capacidade,
        LOCALIZACAO_CANIL as localizacao,
        DEPARTAMENTO_ID_CANIL as departmentId,
        UNIDADE_ID_CANIL as unitId,
        STATUS_CANIL as status,
        OBSERVACOES_CANIL as observacoes,
        DATA_CRIACAO_CANIL as createdAt
      FROM CANIS_FISICOS ORDER BY NOME_CANIL ASC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/canis-fisicos', async (req: Request, res: Response) => {
  try {
    const { nome, identificacao, capacidade, localizacao, departmentId, unitId, status, observacoes, actor } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'O nome do canil é obrigatório.' });
    }
    const pool = getPool();
    const id = `canil-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await pool.query(`
      INSERT INTO CANIS_FISICOS (
        ID_CANIL, NOME_CANIL, IDENTIFICACAO_CANIL, CAPACIDADE_CANIL, LOCALIZACAO_CANIL,
        DEPARTAMENTO_ID_CANIL, UNIDADE_ID_CANIL, STATUS_CANIL, OBSERVACOES_CANIL, DATA_CRIACAO_CANIL
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      id,
      nome.trim(),
      identificacao?.trim() || null,
      capacidade ? Number(capacidade) : 1,
      localizacao?.trim() || null,
      departmentId || null,
      unitId || null,
      status || 'Ativo',
      observacoes?.trim() || null
    ]);

    await insertAuditLog('Veterinário', 'Criar Canil', `Cadastrado canil físico: ${nome}`, actor, req.ip);
    return res.json({ id, nome, status: status || 'Ativo' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/canis-fisicos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, identificacao, capacidade, localizacao, departmentId, unitId, status, observacoes, actor } = req.body;
    const pool = getPool();
    await pool.query(`
      UPDATE CANIS_FISICOS SET
        NOME_CANIL = COALESCE(?, NOME_CANIL),
        IDENTIFICACAO_CANIL = ?,
        CAPACIDADE_CANIL = COALESCE(?, CAPACIDADE_CANIL),
        LOCALIZACAO_CANIL = ?,
        DEPARTAMENTO_ID_CANIL = ?,
        UNIDADE_ID_CANIL = ?,
        STATUS_CANIL = COALESCE(?, STATUS_CANIL),
        OBSERVACOES_CANIL = ?
      WHERE ID_CANIL = ?
    `, [
      nome?.trim() || null,
      identificacao?.trim() || null,
      capacidade !== undefined ? Number(capacidade) : null,
      localizacao?.trim() || null,
      departmentId || null,
      unitId || null,
      status || null,
      observacoes?.trim() || null,
      id
    ]);

    await insertAuditLog('Veterinário', 'Editar Canil', `Atualizado canil físico: ${nome || id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/canis-fisicos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    const [dogs]: any = await pool.query('SELECT COUNT(*) as cnt FROM CACHORROS_CANIL WHERE CANIL_FISICO_ID_CACHORRO = ?', [id]);
    if (dogs[0]?.cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir o canil pois existem ${dogs[0].cnt} cão(es) vinculado(s) a ele.` });
    }

    await pool.query('DELETE FROM CANIS_FISICOS WHERE ID_CANIL = ?', [id]);
    await insertAuditLog('Veterinário', 'Excluir Canil', `Excluído canil físico ID: ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- 2. CACHORROS K9 ---
apiRouter.get('/cachorros', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        c.ID_CACHORRO as id,
        c.NOME_CACHORRO as nome,
        c.RACA_CACHORRO as raca,
        c.SEXO_CACHORRO as sexo,
        DATE_FORMAT(c.DATA_NASCIMENTO_CACHORRO, '%Y-%m-%d') as dataNascimento,
        c.MICROCHIP_CACHORRO as microchip,
        c.PELAGEM_CACHORRO as pelagem,
        c.ESPECIALIDADE_CACHORRO as especialidade,
        c.CANIL_FISICO_ID_CACHORRO as canilFisicoId,
        k.NOME_CANIL as canilFisicoNome,
        c.STATUS_CACHORRO as status,
        c.TIPO_VINCULO_CACHORRO as tipoVinculo,
        c.USUARIO_INTERNO_ID_CACHORRO as usuarioInternoId,
        c.USUARIO_INTERNO_NOME_CACHORRO as usuarioInternoNome,
        c.USUARIO_INTERNO_MASP_CACHORRO as usuarioInternoMasp,
        c.USUARIO_INTERNO_CARGO_CACHORRO as usuarioInternoCargo,
        c.RESPONSAVEL_EXTERNO_NOME_CACHORRO as responsavelExternoNome,
        c.RESPONSAVEL_EXTERNO_DOC_CACHORRO as responsavelExternoDoc,
        c.RESPONSAVEL_EXTERNO_TEL_CACHORRO as responsavelExternoTel,
        c.RESPONSAVEL_EXTERNO_ORGAO_CACHORRO as responsavelExternoOrgao,
        c.DEPARTAMENTO_ID_CACHORRO as departmentId,
        c.UNIDADE_ID_CACHORRO as unitId,
        c.FOTO_URL_CACHORRO as fotoUrl,
        c.OBSERVACOES_CACHORRO as observacoes,
        c.DATA_CRIACAO_CACHORRO as createdAt
      FROM CACHORROS_CANIL c
      LEFT JOIN CANIS_FISICOS k ON k.ID_CANIL = c.CANIL_FISICO_ID_CACHORRO
      ORDER BY c.NOME_CACHORRO ASC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/cachorros', async (req: Request, res: Response) => {
  try {
    const dog = req.body;
    if (!dog.nome || !dog.nome.trim()) {
      return res.status(400).json({ error: 'O nome do cão é obrigatório.' });
    }
    const pool = getPool();
    const id = `cao-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    await pool.query(`
      INSERT INTO CACHORROS_CANIL (
        ID_CACHORRO, NOME_CACHORRO, RACA_CACHORRO, SEXO_CACHORRO, DATA_NASCIMENTO_CACHORRO,
        MICROCHIP_CACHORRO, PELAGEM_CACHORRO, ESPECIALIDADE_CACHORRO, CANIL_FISICO_ID_CACHORRO,
        STATUS_CACHORRO, TIPO_VINCULO_CACHORRO, USUARIO_INTERNO_ID_CACHORRO, USUARIO_INTERNO_NOME_CACHORRO,
        USUARIO_INTERNO_MASP_CACHORRO, USUARIO_INTERNO_CARGO_CACHORRO, RESPONSAVEL_EXTERNO_NOME_CACHORRO,
        RESPONSAVEL_EXTERNO_DOC_CACHORRO, RESPONSAVEL_EXTERNO_TEL_CACHORRO, RESPONSAVEL_EXTERNO_ORGAO_CACHORRO,
        DEPARTAMENTO_ID_CACHORRO, UNIDADE_ID_CACHORRO, FOTO_URL_CACHORRO, OBSERVACOES_CACHORRO, DATA_CRIACAO_CACHORRO
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      id,
      dog.nome.trim(),
      dog.raca?.trim() || 'Pastor Belga Malinois',
      dog.sexo || 'Macho',
      dog.dataNascimento || null,
      dog.microchip?.trim() || null,
      dog.pelagem?.trim() || null,
      dog.especialidade?.trim() || null,
      dog.canilFisicoId || null,
      dog.status || 'Ativo / Operacional',
      dog.tipoVinculo || 'SISTEMA',
      dog.usuarioInternoId || null,
      dog.usuarioInternoNome || null,
      dog.usuarioInternoMasp || null,
      dog.usuarioInternoCargo || null,
      dog.responsavelExternoNome || null,
      dog.responsavelExternoDoc || null,
      dog.responsavelExternoTel || null,
      dog.responsavelExternoOrgao || null,
      dog.departmentId || null,
      dog.unitId || null,
      dog.fotoUrl || null,
      dog.observacoes || null
    ]);

    await insertAuditLog('Veterinário', 'Cadastrar Cão', `Cadastrado cão K9: ${dog.nome} (Raça: ${dog.raca})`, dog.actor, req.ip);
    return res.json({ id, ...dog });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/cachorros/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dog = req.body;
    const pool = getPool();

    await pool.query(`
      UPDATE CACHORROS_CANIL SET
        NOME_CACHORRO = COALESCE(?, NOME_CACHORRO),
        RACA_CACHORRO = COALESCE(?, RACA_CACHORRO),
        SEXO_CACHORRO = COALESCE(?, SEXO_CACHORRO),
        DATA_NASCIMENTO_CACHORRO = ?,
        MICROCHIP_CACHORRO = ?,
        PELAGEM_CACHORRO = ?,
        ESPECIALIDADE_CACHORRO = ?,
        CANIL_FISICO_ID_CACHORRO = ?,
        STATUS_CACHORRO = COALESCE(?, STATUS_CACHORRO),
        TIPO_VINCULO_CACHORRO = COALESCE(?, TIPO_VINCULO_CACHORRO),
        USUARIO_INTERNO_ID_CACHORRO = ?,
        USUARIO_INTERNO_NOME_CACHORRO = ?,
        USUARIO_INTERNO_MASP_CACHORRO = ?,
        USUARIO_INTERNO_CARGO_CACHORRO = ?,
        RESPONSAVEL_EXTERNO_NOME_CACHORRO = ?,
        RESPONSAVEL_EXTERNO_DOC_CACHORRO = ?,
        RESPONSAVEL_EXTERNO_TEL_CACHORRO = ?,
        RESPONSAVEL_EXTERNO_ORGAO_CACHORRO = ?,
        DEPARTAMENTO_ID_CACHORRO = ?,
        UNIDADE_ID_CACHORRO = ?,
        FOTO_URL_CACHORRO = COALESCE(?, FOTO_URL_CACHORRO),
        OBSERVACOES_CACHORRO = ?
      WHERE ID_CACHORRO = ?
    `, [
      dog.nome?.trim() || null,
      dog.raca?.trim() || null,
      dog.sexo || null,
      dog.dataNascimento || null,
      dog.microchip?.trim() || null,
      dog.pelagem?.trim() || null,
      dog.especialidade?.trim() || null,
      dog.canilFisicoId || null,
      dog.status || null,
      dog.tipoVinculo || null,
      dog.usuarioInternoId || null,
      dog.usuarioInternoNome || null,
      dog.usuarioInternoMasp || null,
      dog.usuarioInternoCargo || null,
      dog.responsavelExternoNome || null,
      dog.responsavelExternoDoc || null,
      dog.responsavelExternoTel || null,
      dog.responsavelExternoOrgao || null,
      dog.departmentId || null,
      dog.unitId || null,
      dog.fotoUrl !== undefined ? dog.fotoUrl : null,
      dog.observacoes?.trim() || null,
      id
    ]);

    await insertAuditLog('Veterinário', 'Editar Cão', `Atualizado cadastro do cão: ${dog.nome || id}`, dog.actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/cachorros/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    const [movs]: any = await pool.query('SELECT COUNT(*) as cnt FROM MOVIMENTACOES_VETERINARIAS WHERE CACHORRO_ID_MOV_VET = ?', [id]);
    if (movs[0]?.cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir este cão pois existem ${movs[0].cnt} registro(s) de administração/movimentação veterinária vinculados a ele.` });
    }

    await pool.query('DELETE FROM CACHORROS_CANIL WHERE ID_CACHORRO = ?', [id]);
    await insertAuditLog('Veterinário', 'Excluir Cão', `Excluído cão K9 ID: ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- 3. PRODUTOS VETERINÁRIOS (REMÉDIOS, RAÇÕES, INSUMOS) ---
apiRouter.get('/produtos-veterinarios', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_PRODUTO_VET as id,
        TIPO_PRODUTO_VET as tipo,
        NOME_PRODUTO_VET as nome,
        CATEGORIA_PRODUTO_VET as categoria,
        CODIGO_BARRAS_PRODUTO_VET as codigoBarras,
        FABRICANTE_PRODUTO_VET as fabricante,
        LOTE_PRODUTO_VET as lote,
        VALOR_UNITARIO_PRODUTO_VET as valorUnitario,
        TEM_VALIDADE_PRODUTO_VET as temValidade,
        DATE_FORMAT(DATA_VALIDADE_PRODUTO_VET, '%Y-%m-%d') as dataValidade,
        EH_PERECIVEL_PRODUTO_VET as ehPerecivel,
        QUANTIDADE_ESTOQUE_PRODUTO_VET as quantidadeEstoque,
        UNIDADE_MEDIDA_PRODUTO_VET as unidadeMedida,
        QUANTIDADE_MINIMA_PRODUTO_VET as quantidadeMinima,
        LOCAL_GUARDA_PRODUTO_VET as localGuarda,
        FORMA_FARMACEUTICA_PRODUTO_VET as formaFarmaceutica,
        REGIME_CONSUMO_PRODUTO_VET as regimeConsumo,
        INTERVALO_HORAS_PRODUTO_VET as intervaloHoras,
        DOSAGEM_PADRAO_PRODUTO_VET as dosagemPadrao,
        DEPARTAMENTO_ID_PRODUTO_VET as departmentId,
        UNIDADE_ID_PRODUTO_VET as unitId,
        OBSERVACOES_PRODUTO_VET as observacoes,
        DATA_CRIACAO_PRODUTO_VET as createdAt
      FROM PRODUTOS_VETERINARIOS ORDER BY NOME_PRODUTO_VET ASC
    `);
    const mapped = (rows || []).map((r: any) => ({
      ...r,
      valorUnitario: Number(r.valorUnitario || 0),
      quantidadeEstoque: Number(r.quantidadeEstoque || 0),
      quantidadeMinima: Number(r.quantidadeMinima || 0),
      intervaloHoras: r.intervaloHoras ? Number(r.intervaloHoras) : undefined,
      temValidade: Boolean(r.temValidade),
      ehPerecivel: Boolean(r.ehPerecivel)
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/produtos-veterinarios', async (req: Request, res: Response) => {
  try {
    const prod = req.body;
    if (!prod.nome || !prod.nome.trim()) {
      return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
    }
    const pool = getPool();
    const id = `prodvet-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    await pool.query(`
      INSERT INTO PRODUTOS_VETERINARIOS (
        ID_PRODUTO_VET, TIPO_PRODUTO_VET, NOME_PRODUTO_VET, CATEGORIA_PRODUTO_VET,
        CODIGO_BARRAS_PRODUTO_VET, FABRICANTE_PRODUTO_VET, LOTE_PRODUTO_VET, VALOR_UNITARIO_PRODUTO_VET,
        TEM_VALIDADE_PRODUTO_VET, DATA_VALIDADE_PRODUTO_VET, EH_PERECIVEL_PRODUTO_VET,
        QUANTIDADE_ESTOQUE_PRODUTO_VET, UNIDADE_MEDIDA_PRODUTO_VET, QUANTIDADE_MINIMA_PRODUTO_VET,
        LOCAL_GUARDA_PRODUTO_VET, FORMA_FARMACEUTICA_PRODUTO_VET, REGIME_CONSUMO_PRODUTO_VET,
        INTERVALO_HORAS_PRODUTO_VET, DOSAGEM_PADRAO_PRODUTO_VET, DEPARTAMENTO_ID_PRODUTO_VET,
        UNIDADE_ID_PRODUTO_VET, OBSERVACOES_PRODUTO_VET, DATA_CRIACAO_PRODUTO_VET
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      id,
      prod.tipo || 'REMEDIO',
      prod.nome.trim(),
      prod.categoria?.trim() || null,
      prod.codigoBarras?.trim() || null,
      prod.fabricante?.trim() || null,
      prod.lote?.trim() || null,
      prod.valorUnitario !== undefined ? Number(prod.valorUnitario) : 0,
      prod.temValidade ? 1 : 0,
      prod.temValidade && prod.dataValidade ? prod.dataValidade : null,
      prod.ehPerecivel ? 1 : 0,
      prod.quantidadeEstoque !== undefined ? Number(prod.quantidadeEstoque) : 0,
      prod.unidadeMedida?.trim() || 'Unidade',
      prod.quantidadeMinima !== undefined ? Number(prod.quantidadeMinima) : 0,
      prod.localGuarda?.trim() || null,
      prod.formaFarmaceutica || null,
      prod.regimeConsumo || null,
      prod.intervaloHoras ? Number(prod.intervaloHoras) : null,
      prod.dosagemPadrao?.trim() || null,
      prod.departmentId || null,
      prod.unitId || null,
      prod.observacoes?.trim() || null
    ]);

    await insertAuditLog('Veterinário', 'Cadastrar Produto', `Cadastrado produto veterinário: ${prod.nome} (${prod.tipo})`, prod.actor, req.ip);
    return res.json({ id, ...prod });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/produtos-veterinarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const prod = req.body;
    const pool = getPool();

    await pool.query(`
      UPDATE PRODUTOS_VETERINARIOS SET
        TIPO_PRODUTO_VET = COALESCE(?, TIPO_PRODUTO_VET),
        NOME_PRODUTO_VET = COALESCE(?, NOME_PRODUTO_VET),
        CATEGORIA_PRODUTO_VET = ?,
        CODIGO_BARRAS_PRODUTO_VET = ?,
        FABRICANTE_PRODUTO_VET = ?,
        LOTE_PRODUTO_VET = ?,
        VALOR_UNITARIO_PRODUTO_VET = COALESCE(?, VALOR_UNITARIO_PRODUTO_VET),
        TEM_VALIDADE_PRODUTO_VET = COALESCE(?, TEM_VALIDADE_PRODUTO_VET),
        DATA_VALIDADE_PRODUTO_VET = ?,
        EH_PERECIVEL_PRODUTO_VET = COALESCE(?, EH_PERECIVEL_PRODUTO_VET),
        QUANTIDADE_ESTOQUE_PRODUTO_VET = COALESCE(?, QUANTIDADE_ESTOQUE_PRODUTO_VET),
        UNIDADE_MEDIDA_PRODUTO_VET = COALESCE(?, UNIDADE_MEDIDA_PRODUTO_VET),
        QUANTIDADE_MINIMA_PRODUTO_VET = COALESCE(?, QUANTIDADE_MINIMA_PRODUTO_VET),
        LOCAL_GUARDA_PRODUTO_VET = ?,
        FORMA_FARMACEUTICA_PRODUTO_VET = ?,
        REGIME_CONSUMO_PRODUTO_VET = ?,
        INTERVALO_HORAS_PRODUTO_VET = ?,
        DOSAGEM_PADRAO_PRODUTO_VET = ?,
        DEPARTAMENTO_ID_PRODUTO_VET = ?,
        UNIDADE_ID_PRODUTO_VET = ?,
        OBSERVACOES_PRODUTO_VET = ?
      WHERE ID_PRODUTO_VET = ?
    `, [
      prod.tipo || null,
      prod.nome?.trim() || null,
      prod.categoria?.trim() || null,
      prod.codigoBarras?.trim() || null,
      prod.fabricante?.trim() || null,
      prod.lote?.trim() || null,
      prod.valorUnitario !== undefined ? Number(prod.valorUnitario) : null,
      prod.temValidade !== undefined ? (prod.temValidade ? 1 : 0) : null,
      prod.temValidade && prod.dataValidade ? prod.dataValidade : null,
      prod.ehPerecivel !== undefined ? (prod.ehPerecivel ? 1 : 0) : null,
      prod.quantidadeEstoque !== undefined ? Number(prod.quantidadeEstoque) : null,
      prod.unidadeMedida?.trim() || null,
      prod.quantidadeMinima !== undefined ? Number(prod.quantidadeMinima) : null,
      prod.localGuarda?.trim() || null,
      prod.formaFarmaceutica || null,
      prod.regimeConsumo || null,
      prod.intervaloHoras ? Number(prod.intervaloHoras) : null,
      prod.dosagemPadrao?.trim() || null,
      prod.departmentId || null,
      prod.unitId || null,
      prod.observacoes?.trim() || null,
      id
    ]);

    await insertAuditLog('Veterinário', 'Editar Produto', `Atualizado produto: ${prod.nome || id}`, prod.actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/produtos-veterinarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor } = req.body || {};
    const pool = getPool();

    const [movs]: any = await pool.query('SELECT COUNT(*) as cnt FROM MOVIMENTACOES_VETERINARIAS WHERE PRODUTO_ID_MOV_VET = ?', [id]);
    if (movs[0]?.cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir este produto pois existem ${movs[0].cnt} movimentações registradas para ele.` });
    }

    await pool.query('DELETE FROM PRODUTOS_VETERINARIOS WHERE ID_PRODUTO_VET = ?', [id]);
    await insertAuditLog('Veterinário', 'Excluir Produto', `Excluído produto veterinário ID: ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- 4. MOVIMENTAÇÕES E ADMINISTRAÇÃO VETERINÁRIA ---
apiRouter.get('/movimentacoes-veterinarias', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT 
        ID_MOV_VET as id,
        PRODUTO_ID_MOV_VET as produtoId,
        PRODUTO_NOME_MOV_VET as produtoNome,
        TIPO_PRODUTO_MOV_VET as tipoProduto,
        TIPO_MOVIMENTACAO_MOV_VET as tipoMovimentacao,
        QUANTIDADE_MOV_VET as quantidade,
        UNIDADE_MEDIDA_MOV_VET as unidadeMedida,
        DATE_FORMAT(DATA_HORA_MOV_VET, '%Y-%m-%d %H:%i:%s') as dataHora,
        CACHORRO_ID_MOV_VET as cachorroId,
        CACHORRO_NOME_MOV_VET as cachorroNome,
        CACHORRO_RACA_MOV_VET as cachorroRaca,
        CACHORRO_MICROCHIP_MOV_VET as cachorroMicrochip,
        CONDUTOR_NOME_MOV_VET as condutorNome,
        CONDUTOR_MASP_MOV_VET as condutorMasp,
        DOSAGEM_APLICADA_MOV_VET as dosagemAplicada,
        FREQUENCIA_ADMINISTRADA_MOV_VET as frequenciaAdministrada,
        VALOR_TOTAL_ITEM_MOV_VET as valorTotalItem,
        MOTIVO_MOV_VET as motivo,
        RESPONSAVEL_APLICACAO_ID_MOV_VET as responsavelAplicacaoId,
        RESPONSAVEL_APLICACAO_NOME_MOV_VET as responsavelAplicacaoNome,
        RESPONSAVEL_APLICACAO_MASP_MOV_VET as responsavelAplicacaoMasp,
        DEPARTAMENTO_ID_MOV_VET as departmentId,
        UNIDADE_ID_MOV_VET as unitId,
        OBSERVACOES_MOV_VET as observacoes,
        DATA_CRIACAO_MOV_VET as createdAt
      FROM MOVIMENTACOES_VETERINARIAS ORDER BY DATA_HORA_MOV_VET DESC
    `);
    const mapped = (rows || []).map((r: any) => ({
      ...r,
      quantidade: Number(r.quantidade || 0),
      valorTotalItem: Number(r.valorTotalItem || 0)
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/movimentacoes-veterinarias', async (req: Request, res: Response) => {
  try {
    const mov = req.body;
    if (!mov.produtoId || !mov.quantidade || Number(mov.quantidade) <= 0) {
      return res.status(400).json({ error: 'Produto e quantidade válida são obrigatórios.' });
    }
    const pool = getPool();
    const id = `movvet-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const qtd = Number(mov.quantidade);
    const valorTotal = mov.valorTotalItem !== undefined ? Number(mov.valorTotalItem) : 0;

    await pool.query(`
      INSERT INTO MOVIMENTACOES_VETERINARIAS (
        ID_MOV_VET, PRODUTO_ID_MOV_VET, PRODUTO_NOME_MOV_VET, TIPO_PRODUTO_MOV_VET,
        TIPO_MOVIMENTACAO_MOV_VET, QUANTIDADE_MOV_VET, UNIDADE_MEDIDA_MOV_VET, DATA_HORA_MOV_VET,
        CACHORRO_ID_MOV_VET, CACHORRO_NOME_MOV_VET, CACHORRO_RACA_MOV_VET, CACHORRO_MICROCHIP_MOV_VET,
        CONDUTOR_NOME_MOV_VET, CONDUTOR_MASP_MOV_VET, DOSAGEM_APLICADA_MOV_VET, FREQUENCIA_ADMINISTRADA_MOV_VET,
        VALOR_TOTAL_ITEM_MOV_VET, MOTIVO_MOV_VET, RESPONSAVEL_APLICACAO_ID_MOV_VET, RESPONSAVEL_APLICACAO_NOME_MOV_VET,
        RESPONSAVEL_APLICACAO_MASP_MOV_VET, DEPARTAMENTO_ID_MOV_VET, UNIDADE_ID_MOV_VET,
        OBSERVACOES_MOV_VET, DATA_CRIACAO_MOV_VET
      ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      id,
      mov.produtoId,
      mov.produtoNome?.trim() || 'Produto',
      mov.tipoProduto || 'REMEDIO',
      mov.tipoMovimentacao || 'ADMINISTRACAO_CAO',
      qtd,
      mov.unidadeMedida || 'Unidade',
      mov.dataHora || null,
      mov.cachorroId || null,
      mov.cachorroNome || null,
      mov.cachorroRaca || null,
      mov.cachorroMicrochip || null,
      mov.condutorNome || null,
      mov.condutorMasp || null,
      mov.dosagemAplicada || null,
      mov.frequenciaAdministrada || null,
      valorTotal,
      mov.motivo || null,
      mov.responsavelAplicacaoId || null,
      mov.responsavelAplicacaoNome || null,
      mov.responsavelAplicacaoMasp || null,
      mov.departmentId || null,
      mov.unitId || null,
      mov.observacoes || null
    ]);

    // Atualização automática de estoque do produto
    if (mov.tipoMovimentacao === 'ENTRADA') {
      await pool.query('UPDATE PRODUTOS_VETERINARIOS SET QUANTIDADE_ESTOQUE_PRODUTO_VET = QUANTIDADE_ESTOQUE_PRODUTO_VET + ? WHERE ID_PRODUTO_VET = ?', [qtd, mov.produtoId]);
    } else {
      // Baixa por administração, consumo ou descarte
      await pool.query('UPDATE PRODUTOS_VETERINARIOS SET QUANTIDADE_ESTOQUE_PRODUTO_VET = GREATEST(0, QUANTIDADE_ESTOQUE_PRODUTO_VET - ?) WHERE ID_PRODUTO_VET = ?', [qtd, mov.produtoId]);
    }

    const logDetails = mov.tipoMovimentacao === 'ADMINISTRACAO_CAO'
      ? `Administrado ${qtd} ${mov.unidadeMedida} de "${mov.produtoNome}" ao cão "${mov.cachorroNome}" (Condutor: ${mov.condutorNome || 'N/A'})`
      : `Baixa/Movimentação (${mov.tipoMovimentacao}) de ${qtd} ${mov.unidadeMedida} do produto "${mov.produtoNome}"`;

    await insertAuditLog('Veterinário', 'Movimentação / Administração', logDetails, mov.actor, req.ip);
    return res.json({ id, ...mov });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MODULO: CAUTELA DE ARMAS (ACAUTELAR_ARMAS)
// =============================================================

let cautelaReturnSchemaEnsured = false;
async function ensureCautelaReturnSchema(pool: any) {
  if (cautelaReturnSchemaEnsured) return;
  try {
    await pool.query("ALTER TABLE `ACAUTELAR_ARMAS` MODIFY COLUMN `STATUS_ACAUTELAR_ARMAS` VARCHAR(64) NOT NULL DEFAULT 'PENDENTE'");
  } catch (_) {}
  try {
    await pool.query("ALTER TABLE `ACAUTELAR_MUNICOES` MODIFY COLUMN `STATUS_ACAUTELAR_MUNICOES` VARCHAR(64) NOT NULL DEFAULT 'PENDENTE'");
  } catch (_) {}
  try {
    const [cols]: any = await pool.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ACAUTELAR_ARMAS' AND COLUMN_NAME = 'MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS'
    `);
    if (cols?.[0]?.cnt === 0) {
      await pool.query('ALTER TABLE `ACAUTELAR_ARMAS` ADD COLUMN `MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS` INT DEFAULT NULL AFTER `CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS`');
    }
  } catch (_) {}
  try {
    const [armaShotCols]: any = await pool.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ARMAS' AND COLUMN_NAME = 'TIROS_DISPARADOS_ARMAS'
    `);
    if (armaShotCols?.[0]?.cnt === 0) {
      await pool.query('ALTER TABLE `ARMAS` ADD COLUMN `TIROS_DISPARADOS_ARMAS` INT NOT NULL DEFAULT 0');
    }
  } catch (_) {}
  cautelaReturnSchemaEnsured = true;
}

apiRouter.get('/cautelas-armas', async (req: Request, res: Response) => {
  try {
    const { userId, masp, name, unitId, status } = req.query;
    const pool = getPool();
    await ensureCautelaReturnSchema(pool);

    const parseUserFromWeaponNote = (rawNote?: string | null): { name: string; masp: string } => {
      if (!rawNote) return { name: '', masp: '' };
      const note = String(rawNote).trim();
      let extractedMasp = '';
      if (note.includes('MASP:')) {
        extractedMasp = note.split('MASP:')[1].split(')')[0].split('•')[0].trim();
      }
      let extractedName = note
        .split('•')[0]
        .replace(/^Cautela Pendente\s*[—\-:]\s*Solicitante:\s*/i, '')
        .replace(/^Devolu[cç][aã]o Pendente[^—\-:]*[—\-:]\s*Policial:\s*/i, '')
        .replace(/^Acautelada com\s*/i, '')
        .replace(/^Solicitante:\s*/i, '')
        .replace(/^Policial:\s*/i, '')
        .split('(MASP:')[0]
        .trim();
      return { name: extractedName, masp: extractedMasp };
    };

    const isPlaceholderRequesterName = (val?: string | null): boolean => {
      const s = String(val || '').trim().toLowerCase();
      return (
        !s ||
        s === 'policial solicitante' ||
        s === 'policial' ||
        s === 'policial da unidade' ||
        s === 'policial responsável' ||
        s === 'policial responsavel' ||
        s === 'solicitante' ||
        s === 'usr-solicitante' ||
        s === 'usr-policial' ||
        s.startsWith('cautela pendente')
      );
    };

    const isPlaceholderRequesterMasp = (val?: string | null): boolean => {
      const s = String(val || '').trim().toLowerCase();
      return (
        !s ||
        s === 'pendente recibo' ||
        s === 'pendente de recibo' ||
        s === 'pendente' ||
        s === 'n/a' ||
        s === '0000000' ||
        s === 'masp da cautela' ||
        s === '—' ||
        s === '-'
      );
    };

    // Auto-sincroniza armas com status 'Cautela Pendente', 'Pendente de Recibo' ou 'Pendente Recibo'
    // garantindo que apareçam imediatamente para o armeiro em Solicitações Pendentes
    try {
      const [pendArmas]: any = await pool.query(`
        SELECT a.* 
        FROM ARMAS a
        WHERE a.STATUS_ARMAS IN ('Cautela Pendente', 'Pendente de Recibo', 'Pendente Recibo')
          AND NOT EXISTS (
            SELECT 1 FROM ACAUTELAR_ARMAS ac 
            WHERE ac.ARMA_ID_ACAUTELAR_ARMAS = a.ID_ARMAS 
              AND ac.STATUS_ACAUTELAR_ARMAS IN ('PENDENTE', 'Cautela Pendente', 'Pendente de Recibo', 'Pendente Recibo')
          )
      `);

      for (const pa of (pendArmas || [])) {
        const syncId = `caut-sync-${pa.ID_ARMAS}`;
        const rawLocNote = pa.OBSERVACAO_LOCALIZACAO_ARMAS || pa.LOCALIZACAO_NOTA_ARMAS || pa.OBSERVACOES_ARMAS || '';
        const parsedFromNote = parseUserFromWeaponNote(rawLocNote);

        let resolvedId: string = pa.DESTINATARIO_ID_ARMAS || '';
        let resolvedName: string = !isPlaceholderRequesterName(parsedFromNote.name) ? parsedFromNote.name : '';
        let resolvedMasp: string = !isPlaceholderRequesterMasp(parsedFromNote.masp) ? parsedFromNote.masp : '';
        let resolvedCargo: string = 'Policial';

        // 1. Tenta resolver na tabela USUARIOS por ID, MASP ou Nome
        try {
          if (resolvedId || resolvedMasp || resolvedName) {
            const [uRows]: any = await pool.query(
              `SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS, CARGO_USUARIOS
               FROM USUARIOS
               WHERE (? <> '' AND ID_USUARIOS = ?)
                  OR (? <> '' AND (MASP_USUARIOS = ? OR REPLACE(REPLACE(MASP_USUARIOS, '.', ''), '-', '') = REPLACE(REPLACE(?, '.', ''), '-', '')))
                  OR (? <> '' AND LOWER(NOME_USUARIOS) = LOWER(?))
               LIMIT 1`,
              [resolvedId, resolvedId, resolvedMasp, resolvedMasp, resolvedMasp, resolvedName, resolvedName]
            );
            if (uRows && uRows.length > 0) {
              resolvedId = uRows[0].ID_USUARIOS || resolvedId;
              resolvedName = uRows[0].NOME_USUARIOS || resolvedName;
              resolvedMasp = uRows[0].MASP_USUARIOS || resolvedMasp;
              resolvedCargo = uRows[0].CARGO_USUARIOS || resolvedCargo;
            }
          }
        } catch (_) {}

        // 2. Se ainda não identificado (ex.: arma com status 'Pendente de Recibo' oriunda de transferência), busca em TRANSFERENCIAS_ARMAS
        if (!resolvedName || !resolvedMasp) {
          try {
            const serialSearch = pa.NUMERO_SERIE_ARMAS ? `%${pa.NUMERO_SERIE_ARMAS}%` : '';
            const idSearch = pa.ID_ARMAS ? `%${pa.ID_ARMAS}%` : '';
            const [tRows]: any = await pool.query(
              `SELECT RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS, RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS, RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS,
                      TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS, TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS, TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS
               FROM TRANSFERENCIAS_ARMAS
               WHERE (? <> '' AND ARMAS_JSON_TRANSFERENCIAS_ARMAS LIKE ?)
                  OR (? <> '' AND ARMAS_JSON_TRANSFERENCIAS_ARMAS LIKE ?)
               ORDER BY DATA_CRIACAO_TRANSFERENCIAS_ARMAS DESC
               LIMIT 1`,
              [idSearch, idSearch, serialSearch, serialSearch]
            );
            if (tRows && tRows.length > 0) {
              const tr = tRows[0];
              resolvedId = resolvedId || tr.RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS || '';
              resolvedName = resolvedName || tr.TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS || tr.RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS || '';
              resolvedMasp = resolvedMasp || tr.TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS || tr.RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS || '';
              resolvedCargo = tr.TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS || resolvedCargo;
            }
          } catch (_) {}
        }

        await pool.query(`
          INSERT INTO ACAUTELAR_ARMAS (
            ID_ACAUTELAR_ARMAS, ARMA_ID_ACAUTELAR_ARMAS, NUMERO_SERIE_ACAUTELAR_ARMAS,
            MODELO_ACAUTELAR_ARMAS, TIPO_ARMA_ACAUTELAR_ARMAS, CALIBRE_ACAUTELAR_ARMAS,
            QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS,
            DEPARTAMENTO_ID_ACAUTELAR_ARMAS, UNIDADE_ID_ACAUTELAR_ARMAS,
            REQUERENTE_ID_ACAUTELAR_ARMAS, REQUERENTE_NOME_ACAUTELAR_ARMAS,
            REQUERENTE_MASP_ACAUTELAR_ARMAS, REQUERENTE_CARGO_ACAUTELAR_ARMAS,
            FINALIDADE_MOTIVO_ACAUTELAR_ARMAS, DATA_SOLICITACAO_ACAUTELAR_ARMAS,
            STATUS_ACAUTELAR_ARMAS, DATA_CRIACAO_ACAUTELAR_ARMAS
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'PENDENTE', NOW())
          ON DUPLICATE KEY UPDATE
            STATUS_ACAUTELAR_ARMAS = 'PENDENTE',
            REQUERENTE_ID_ACAUTELAR_ARMAS = VALUES(REQUERENTE_ID_ACAUTELAR_ARMAS),
            REQUERENTE_NOME_ACAUTELAR_ARMAS = VALUES(REQUERENTE_NOME_ACAUTELAR_ARMAS),
            REQUERENTE_MASP_ACAUTELAR_ARMAS = VALUES(REQUERENTE_MASP_ACAUTELAR_ARMAS)
        `, [
          syncId,
          pa.ID_ARMAS,
          pa.NUMERO_SERIE_ARMAS,
          pa.MODELO_ARMAS,
          pa.TIPO_ARMAS || 'Arma de Fogo',
          pa.CALIBRE_ARMAS,
          pa.QUANTIDADE_CARREGADORES_ARMAS || 2,
          pa.COFRE_ID_ARMAS || null,
          pa.DEPARTAMENTO_ID_ARMAS || null,
          pa.UNIDADE_ID_ARMAS || null,
          resolvedId || 'usr-solicitante',
          resolvedName || 'Policial Solicitante',
          resolvedMasp || 'N/I',
          resolvedCargo,
          pa.STATUS_ARMAS === 'Pendente de Recibo' ? 'Armamento pendente de recibo' : 'Solicitação de acautelamento pendente de recibo'
        ]);
      }

      // Auto-sincroniza armas com status 'Acautelada' garantindo que apareçam para o armeiro em Deferidas (Ativas)
      const [acautArmas]: any = await pool.query(`
        SELECT a.* 
        FROM ARMAS a
        WHERE a.STATUS_ARMAS = 'Acautelada'
          AND NOT EXISTS (
            SELECT 1 FROM ACAUTELAR_ARMAS ac 
            WHERE ac.ARMA_ID_ACAUTELAR_ARMAS = a.ID_ARMAS 
              AND ac.STATUS_ACAUTELAR_ARMAS IN ('AUTORIZADA', 'DEVOLUCAO_PENDENTE')
          )
      `);

      for (const aa of (acautArmas || [])) {
        const syncId = `caut-active-${aa.ID_ARMAS}`;
        const locNote = aa.OBSERVACAO_LOCALIZACAO_ARMAS || aa.LOCALIZACAO_NOTA_ARMAS || aa.OBSERVACOES_ARMAS || '';
        const parsedAcaut = parseUserFromWeaponNote(locNote);
        const reqName = parsedAcaut.name || 'Policial';
        const reqMasp = parsedAcaut.masp || 'N/A';

        let armId: string | null = null;
        let armName = 'Armeiro da Unidade';
        let armMasp = '';
        try {
          const [armRows]: any = await pool.query(
            "SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS FROM USUARIOS WHERE PERFIL_USUARIOS IN ('Armeiro', 'Administrador') ORDER BY CASE WHEN UNIDADE_ID_USUARIOS = ? THEN 1 ELSE 2 END ASC LIMIT 1",
            [aa.UNIDADE_ID_ARMAS || '']
          );
          if (armRows && armRows.length > 0) {
            armId = armRows[0].ID_USUARIOS;
            armName = armRows[0].NOME_USUARIOS;
            armMasp = armRows[0].MASP_USUARIOS || '';
          }
        } catch (_) {}

        let linkedMunId: string | null = null;
        let ammoQty = 0;
        let ammoFab: string | null = null;
        let ammoTip: string | null = null;
        let ammoPes: string | null = null;
        let ammoLot: string | null = null;
        let ammoDest: string | null = null;

        try {
          const [mRows]: any = await pool.query(
            "SELECT * FROM ACAUTELAR_MUNICOES WHERE (NUMERO_SERIE_ARMA_ACAUTELAR_MUNICOES = ? OR ARMA_ID_ACAUTELAR_MUNICOES = ? OR (REQUERENTE_MASP_ACAUTELAR_MUNICOES = ? AND STATUS_ACAUTELAR_MUNICOES = 'AUTORIZADA')) ORDER BY DATA_CRIACAO_ACAUTELAR_MUNICOES DESC LIMIT 1",
            [aa.NUMERO_SERIE_ARMAS, aa.ID_ARMAS, reqMasp]
          );
          if (mRows && mRows.length > 0) {
            const m = mRows[0];
            linkedMunId = m.ID_ACAUTELAR_MUNICOES;
            ammoQty = Number(m.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0);
            ammoFab = m.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES || null;
            ammoTip = m.TIPO_MUNICAO_ACAUTELAR_MUNICOES || null;
            ammoPes = m.PESO_MUNICAO_ACAUTELAR_MUNICOES || null;
            ammoLot = m.LOTE_MUNICAO_ACAUTELAR_MUNICOES || null;
            ammoDest = m.DESTINACAO_ACAUTELAR_MUNICOES || null;
          }
        } catch (_) {}

        await pool.query(`
          INSERT INTO ACAUTELAR_ARMAS (
            ID_ACAUTELAR_ARMAS, ARMA_ID_ACAUTELAR_ARMAS, NUMERO_SERIE_ACAUTELAR_ARMAS,
            MODELO_ACAUTELAR_ARMAS, TIPO_ARMA_ACAUTELAR_ARMAS, CALIBRE_ACAUTELAR_ARMAS,
            QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS,
            DEPARTAMENTO_ID_ACAUTELAR_ARMAS, UNIDADE_ID_ACAUTELAR_ARMAS,
            REQUERENTE_ID_ACAUTELAR_ARMAS, REQUERENTE_NOME_ACAUTELAR_ARMAS,
            REQUERENTE_MASP_ACAUTELAR_ARMAS, REQUERENTE_CARGO_ACAUTELAR_ARMAS,
            FINALIDADE_MOTIVO_ACAUTELAR_ARMAS, DATA_SOLICITACAO_ACAUTELAR_ARMAS,
            STATUS_ACAUTELAR_ARMAS, DATA_AUTORIZACAO_ACAUTELAR_ARMAS,
            ARMEIRO_ID_ACAUTELAR_ARMAS, ARMEIRO_NOME_ACAUTELAR_ARMAS, ARMEIRO_MASP_ACAUTELAR_ARMAS,
            CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS, MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS,
            MUNICAO_FABRICANTE_ACAUTELAR_ARMAS, MUNICAO_TIPO_ACAUTELAR_ARMAS,
            MUNICAO_PESO_ACAUTELAR_ARMAS, MUNICAO_LOTE_ACAUTELAR_ARMAS, MUNICAO_DESTINACAO_ACAUTELAR_ARMAS,
            DATA_CRIACAO_ACAUTELAR_ARMAS
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'AUTORIZADA', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE 
            STATUS_ACAUTELAR_ARMAS = 'AUTORIZADA',
            ARMEIRO_NOME_ACAUTELAR_ARMAS = COALESCE(ARMEIRO_NOME_ACAUTELAR_ARMAS, VALUES(ARMEIRO_NOME_ACAUTELAR_ARMAS)),
            ARMEIRO_MASP_ACAUTELAR_ARMAS = COALESCE(ARMEIRO_MASP_ACAUTELAR_ARMAS, VALUES(ARMEIRO_MASP_ACAUTELAR_ARMAS))
        `, [
          syncId,
          aa.ID_ARMAS,
          aa.NUMERO_SERIE_ARMAS,
          aa.MODELO_ARMAS,
          aa.TIPO_ARMAS || 'Arma de Fogo',
          aa.CALIBRE_ARMAS,
          aa.QUANTIDADE_CARREGADORES_ARMAS || 2,
          aa.COFRE_ID_ARMAS || null,
          aa.DEPARTAMENTO_ID_ARMAS || null,
          aa.UNIDADE_ID_ARMAS || null,
          aa.DESTINATARIO_ID_ARMAS || 'usr-policial',
          reqName,
          reqMasp,
          'Policial',
          'Arma acautelada em serviço na unidade',
          armId,
          armName,
          armMasp,
          linkedMunId,
          ammoQty,
          ammoFab,
          ammoTip,
          ammoPes,
          ammoLot,
          ammoDest
        ]);
      }
    } catch (syncErr) {
      // Ignora erro de sincronização se colunas opcionais variarem
    }

    let query = `
      SELECT 
        a.ID_ACAUTELAR_ARMAS as id,
        a.ARMA_ID_ACAUTELAR_ARMAS as weaponId,
        a.NUMERO_SERIE_ACAUTELAR_ARMAS as weaponSerialNumber,
        a.MODELO_ACAUTELAR_ARMAS as weaponModel,
        a.TIPO_ARMA_ACAUTELAR_ARMAS as weaponType,
        a.CALIBRE_ACAUTELAR_ARMAS as weaponCaliber,
        a.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS as magazineQuantity,
        a.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS as vaultSpaceId,
        a.DEPARTAMENTO_ID_ACAUTELAR_ARMAS as departmentId,
        a.UNIDADE_ID_ACAUTELAR_ARMAS as unitId,
        a.REQUERENTE_ID_ACAUTELAR_ARMAS as requesterId,
        a.REQUERENTE_NOME_ACAUTELAR_ARMAS as requesterName,
        a.REQUERENTE_MASP_ACAUTELAR_ARMAS as requesterMasp,
        a.REQUERENTE_CARGO_ACAUTELAR_ARMAS as requesterCargo,
        a.REQUERENTE_TELEFONE_ACAUTELAR_ARMAS as requesterPhone,
        a.FINALIDADE_MOTIVO_ACAUTELAR_ARMAS as reason,
        a.DATA_SOLICITACAO_ACAUTELAR_ARMAS as requestDate,
        a.STATUS_ACAUTELAR_ARMAS as status,
        a.ARMEIRO_ID_ACAUTELAR_ARMAS as armorerId,
        a.ARMEIRO_NOME_ACAUTELAR_ARMAS as armorerName,
        a.ARMEIRO_MASP_ACAUTELAR_ARMAS as armorerMasp,
        a.DATA_AUTORIZACAO_ACAUTELAR_ARMAS as authorizedAt,
        a.OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS as authorizationNotes,
        COALESCE(a.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS, m.ID_ACAUTELAR_MUNICOES) as linkedAmmoCautelaId,
        COALESCE(NULLIF(a.MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS, 0), m.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES) as ammoQuantity,
        COALESCE(a.MUNICAO_FABRICANTE_ACAUTELAR_ARMAS, m.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES) as ammoFabricante,
        COALESCE(a.MUNICAO_TIPO_ACAUTELAR_ARMAS, m.TIPO_MUNICAO_ACAUTELAR_MUNICOES) as ammoTipo,
        COALESCE(a.MUNICAO_PESO_ACAUTELAR_ARMAS, m.PESO_MUNICAO_ACAUTELAR_MUNICOES) as ammoPeso,
        COALESCE(a.MUNICAO_LOTE_ACAUTELAR_ARMAS, m.LOTE_MUNICAO_ACAUTELAR_MUNICOES) as ammoLote,
        COALESCE(a.MUNICAO_DESTINACAO_ACAUTELAR_ARMAS, m.DESTINACAO_ACAUTELAR_MUNICOES) as ammoDestinacao,
        m.CALIBRE_NOME_ACAUTELAR_MUNICOES as ammoCaliberName,
        m.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES as ammoSeraDevolvida,
        a.DATA_DEVOLUCAO_ACAUTELAR_ARMAS as returnDate,
        a.ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_ARMAS as returnArmorerId,
        a.ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS as returnArmorerName,
        a.ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS as returnArmorerMasp,
        a.HOUVE_TIROS_ACAUTELAR_ARMAS as hadShots,
        a.QUANTIDADE_TIROS_ACAUTELAR_ARMAS as shotsFired,
        a.CONDICOES_USO_ACAUTELAR_ARMAS as condicoesUso,
        a.DESCRICAO_DEFEITO_ACAUTELAR_ARMAS as defectDescription,
        a.APRESENTOU_PANE_ACAUTELAR_ARMAS as hadMalfunction,
        a.DESCRICAO_PANE_ACAUTELAR_ARMAS as malfunctionDescription,
        a.CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS as returnedMagazinesCount,
        COALESCE(a.MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS, m.QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES) as returnedAmmoQuantity,
        a.OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS as returnObservations,
        a.DATA_CRIACAO_ACAUTELAR_ARMAS as createdAt,
        a.DATA_ATUALIZACAO_ACAUTELAR_ARMAS as updatedAt,
        u_req.NOME_USUARIOS as dbUserName,
        u_req.MASP_USUARIOS as dbUserMasp,
        u_req.CARGO_USUARIOS as dbUserCargo,
        arm_ref.OBSERVACAO_LOCALIZACAO_ARMAS as weaponLocationNote
      FROM ACAUTELAR_ARMAS a
      LEFT JOIN USUARIOS u_req ON u_req.ID_USUARIOS = a.REQUERENTE_ID_ACAUTELAR_ARMAS
      LEFT JOIN ARMAS arm_ref ON arm_ref.ID_ARMAS = a.ARMA_ID_ACAUTELAR_ARMAS
      LEFT JOIN ACAUTELAR_MUNICOES m ON (
        (a.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS IS NOT NULL AND m.ID_ACAUTELAR_MUNICOES = a.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS)
        OR (a.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS IS NULL AND m.CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = a.ID_ACAUTELAR_ARMAS)
      )
      WHERE 1=1
    `;
    const params: any[] = [];

    if (userId || masp || name) {
      const uMasp = masp ? String(masp).trim() : null;
      const uMaspDigits = masp ? String(masp).replace(/\D/g, '') : null;
      const uName = name ? `%${String(name).trim().toLowerCase()}%` : null;

      query += ` AND (
        (? IS NOT NULL AND a.REQUERENTE_ID_ACAUTELAR_ARMAS = ?)
        OR (? IS NOT NULL AND (
          a.REQUERENTE_MASP_ACAUTELAR_ARMAS = ? 
          OR REPLACE(REPLACE(a.REQUERENTE_MASP_ACAUTELAR_ARMAS, '.', ''), '-', '') = ?
        ))
        OR (? IS NOT NULL AND LOWER(a.REQUERENTE_NOME_ACAUTELAR_ARMAS) LIKE ?)
      )`;
      params.push(
        userId || null, userId || null,
        uMasp || null, uMasp || null, uMaspDigits || null,
        uName || null, uName || null
      );
    }
    if (unitId) {
      query += ' AND a.UNIDADE_ID_ACAUTELAR_ARMAS = ?';
      params.push(unitId);
    }
    if (status) {
      if (status === 'PENDENTE') {
        query += " AND a.STATUS_ACAUTELAR_ARMAS IN ('PENDENTE', 'Cautela Pendente', 'Pendente de Recibo', 'Pendente Recibo')";
      } else {
        query += ' AND a.STATUS_ACAUTELAR_ARMAS = ?';
        params.push(status);
      }
    }

    query += ' ORDER BY a.DATA_CRIACAO_ACAUTELAR_ARMAS DESC';

    let rows: any = [];
    try {
      [rows] = await pool.query(query, params);
    } catch (_colErr) {
      // Fallback caso o banco ainda não possua as colunas opcionais MUNICAO_*_ACAUTELAR_ARMAS
      const fallbackQuery = query
        .replace(/COALESCE\(NULLIF\(a\.MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS, 0\), m\.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES\) as ammoQuantity,\s*/g, 'm.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES as ammoQuantity, ')
        .replace(/COALESCE\(a\.MUNICAO_FABRICANTE_ACAUTELAR_ARMAS, m\.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES\) as ammoFabricante,\s*/g, 'm.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES as ammoFabricante, ')
        .replace(/COALESCE\(a\.MUNICAO_TIPO_ACAUTELAR_ARMAS, m\.TIPO_MUNICAO_ACAUTELAR_MUNICOES\) as ammoTipo,\s*/g, 'm.TIPO_MUNICAO_ACAUTELAR_MUNICOES as ammoTipo, ')
        .replace(/COALESCE\(a\.MUNICAO_PESO_ACAUTELAR_ARMAS, m\.PESO_MUNICAO_ACAUTELAR_MUNICOES\) as ammoPeso,\s*/g, 'm.PESO_MUNICAO_ACAUTELAR_MUNICOES as ammoPeso, ')
        .replace(/COALESCE\(a\.MUNICAO_LOTE_ACAUTELAR_ARMAS, m\.LOTE_MUNICAO_ACAUTELAR_MUNICOES\) as ammoLote,\s*/g, 'm.LOTE_MUNICAO_ACAUTELAR_MUNICOES as ammoLote, ')
        .replace(/COALESCE\(a\.MUNICAO_DESTINACAO_ACAUTELAR_ARMAS, m\.DESTINACAO_ACAUTELAR_MUNICOES\) as ammoDestinacao,\s*/g, 'm.DESTINACAO_ACAUTELAR_MUNICOES as ammoDestinacao, ')
        .replace(/COALESCE\(a\.MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS, m\.QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES\) as returnedAmmoQuantity,\s*/g, 'm.QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES as returnedAmmoQuantity, ');
      [rows] = await pool.query(fallbackQuery, params);
    }
    const seenIds = new Set<string>();
    const dedupedRows = (rows || []).filter((r: any) => {
      if (!r.id || seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });
    let allUsersCache: any[] | null = null;
    let allTransfersCache: any[] | null = null;

    const mapped = [];
    for (const r of dedupedRows) {
      const rawStatus = (r.status || '').trim().toUpperCase();
      const normalizedStatus = (rawStatus === 'PENDENTE DE RECIBO' || rawStatus === 'PENDENTE RECIBO' || rawStatus === 'CAUTELA PENDENTE')
        ? 'PENDENTE'
        : (rawStatus === 'DEVOLUCAO_PENDENTE' || rawStatus === 'DEVOLUÇÃO PENDENTE')
        ? 'DEVOLUCAO_PENDENTE'
        : r.status;

      const cleanedFromStored = parseUserFromWeaponNote(r.requesterName);
      let finalReqName =
        (r.dbUserName && !isPlaceholderRequesterName(r.dbUserName) ? String(r.dbUserName).trim() : '') ||
        (!isPlaceholderRequesterName(cleanedFromStored.name) ? cleanedFromStored.name : '');
      let finalReqMasp =
        (r.dbUserMasp && !isPlaceholderRequesterMasp(r.dbUserMasp) ? String(r.dbUserMasp).trim() : '') ||
        (!isPlaceholderRequesterMasp(r.requesterMasp)
          ? String(r.requesterMasp).trim()
          : (!isPlaceholderRequesterMasp(cleanedFromStored.masp) ? cleanedFromStored.masp : ''));
      let finalReqCargo = r.dbUserCargo || r.requesterCargo || undefined;

      if ((!finalReqName || !finalReqMasp) && r.weaponLocationNote) {
        const parsedNote = parseUserFromWeaponNote(r.weaponLocationNote);
        if (!finalReqName && !isPlaceholderRequesterName(parsedNote.name)) finalReqName = parsedNote.name;
        if (!finalReqMasp && !isPlaceholderRequesterMasp(parsedNote.masp)) finalReqMasp = parsedNote.masp;
      }

      if (!finalReqName || !finalReqMasp) {
        if (allUsersCache === null) {
          try {
            const [uList]: any = await pool.query('SELECT ID_USUARIOS, NOME_USUARIOS, MASP_USUARIOS, CARGO_USUARIOS FROM USUARIOS');
            allUsersCache = uList || [];
          } catch (_) {
            allUsersCache = [];
          }
        }
        const reqDigits = String(finalReqMasp || '').replace(/\D/g, '');
        const matchedUser = (allUsersCache || []).find((u: any) => {
          if (r.requesterId && u.ID_USUARIOS === r.requesterId) return true;
          const uDigits = String(u.MASP_USUARIOS || '').replace(/\D/g, '');
          if (reqDigits && uDigits && reqDigits === uDigits) return true;
          if (finalReqName && u.NOME_USUARIOS && String(u.NOME_USUARIOS).trim().toLowerCase() === finalReqName.toLowerCase()) return true;
          return false;
        });
        if (matchedUser) {
          if (!finalReqName) finalReqName = matchedUser.NOME_USUARIOS || '';
          if (!finalReqMasp) finalReqMasp = matchedUser.MASP_USUARIOS || '';
          if (!finalReqCargo) finalReqCargo = matchedUser.CARGO_USUARIOS || undefined;
        }
      }

      if (!finalReqName || !finalReqMasp) {
        if (allTransfersCache === null) {
          try {
            const [tList]: any = await pool.query(
              `SELECT RESPONSAVEL_ID_TRANSFERENCIAS_ARMAS, RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS, RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS,
                      TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS, TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS, TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS,
                      ARMAS_JSON_TRANSFERENCIAS_ARMAS
               FROM TRANSFERENCIAS_ARMAS
               ORDER BY DATA_CRIACAO_TRANSFERENCIAS_ARMAS DESC`
            );
            allTransfersCache = tList || [];
          } catch (_) {
            allTransfersCache = [];
          }
        }
        const matchedTransfer = (allTransfersCache || []).find((tr: any) => {
          const jsonStr = String(tr.ARMAS_JSON_TRANSFERENCIAS_ARMAS || '');
          return (
            (r.weaponId && jsonStr.includes(r.weaponId)) ||
            (r.weaponSerialNumber && jsonStr.includes(r.weaponSerialNumber))
          );
        });
        if (matchedTransfer) {
          if (!finalReqName) {
            finalReqName = matchedTransfer.TRANSPORTADOR_NOME_TRANSFERENCIAS_ARMAS || matchedTransfer.RESPONSAVEL_NOME_TRANSFERENCIAS_ARMAS || '';
          }
          if (!finalReqMasp) {
            finalReqMasp = matchedTransfer.TRANSPORTADOR_MASP_TRANSFERENCIAS_ARMAS || matchedTransfer.RESPONSAVEL_MASP_TRANSFERENCIAS_ARMAS || '';
          }
          if (!finalReqCargo && matchedTransfer.TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS) {
            finalReqCargo = matchedTransfer.TRANSPORTADOR_CARGO_TRANSFERENCIAS_ARMAS;
          }
        }
      }

      // Persiste a correção no banco caso o registro antigo estivesse com placeholder
      if (
        (finalReqName && isPlaceholderRequesterName(r.requesterName)) ||
        (finalReqMasp && isPlaceholderRequesterMasp(r.requesterMasp))
      ) {
        pool.query(
          `UPDATE ACAUTELAR_ARMAS
           SET REQUERENTE_NOME_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), REQUERENTE_NOME_ACAUTELAR_ARMAS),
               REQUERENTE_MASP_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), REQUERENTE_MASP_ACAUTELAR_ARMAS)
           WHERE ID_ACAUTELAR_ARMAS = ?`,
          [finalReqName, finalReqMasp, r.id]
        ).catch(() => {});
      }

      const { dbUserName: _duN, dbUserMasp: _duM, dbUserCargo: _duC, weaponLocationNote: _wln, ...cleanRow } = r;

      mapped.push({
        ...cleanRow,
        requesterName: finalReqName || r.requesterName || 'Usuário não identificado',
        requesterMasp: finalReqMasp || r.requesterMasp || 'N/I',
        requesterCargo: finalReqCargo,
        status: normalizedStatus,
        hadShots: Boolean(r.hadShots),
        isWorking: r.condicoesUso !== 'Apresenta Defeito',
        hadMalfunction: Boolean(r.hadMalfunction),
        magazineQuantity: Number(r.magazineQuantity || 1),
        shotsFired: Number(r.shotsFired || 0),
        returnedMagazinesCount: Number(r.returnedMagazinesCount || 0),
        returnedAmmoQuantity: r.returnedAmmoQuantity !== null && r.returnedAmmoQuantity !== undefined ? Number(r.returnedAmmoQuantity) : undefined,
        ammoQuantity: Number(r.ammoQuantity || 0),
        ammoFabricante: r.ammoFabricante || undefined,
        ammoTipo: r.ammoTipo || undefined,
        ammoPeso: r.ammoPeso || undefined,
        ammoLote: r.ammoLote || undefined,
        ammoDestinacao: r.ammoDestinacao || undefined,
        ammoCaliberName: r.ammoCaliberName || undefined,
        ammoSeraDevolvida: r.ammoSeraDevolvida !== null && r.ammoSeraDevolvida !== undefined ? Boolean(r.ammoSeraDevolvida) : undefined
      });
    }

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/cautelas-armas', async (req: Request, res: Response) => {
  try {
    let {
      weaponId,
      weaponSerialNumber,
      weaponModel,
      weaponType,
      weaponCaliber,
      magazineQuantity,
      vaultSpaceId,
      departmentId,
      unitId,
      requesterId,
      requesterName,
      requesterMasp,
      requesterCargo,
      requesterPhone,
      reason,
      ammunition // optional ammo request in parallel: { caliberId, caliberName, quantity, tipoMunicao, loteMunicao, vaultSpaceId, reason, seraDevolvida }
    } = req.body;

    if (!weaponId || !requesterId) {
      return res.status(400).json({ error: 'Armamento e solicitante são obrigatórios.' });
    }

    const pool = getPool();

    if (!requesterName || !requesterMasp) {
      try {
        const [uRows]: any = await pool.query(
          'SELECT NOME_USUARIOS, MASP_USUARIOS, CARGO_USUARIOS, TELEFONE_USUARIOS FROM USUARIOS WHERE ID_USUARIOS = ? LIMIT 1',
          [requesterId]
        );
        if (uRows && uRows.length > 0) {
          requesterName = requesterName || uRows[0].NOME_USUARIOS;
          requesterMasp = requesterMasp || uRows[0].MASP_USUARIOS;
          requesterCargo = requesterCargo || uRows[0].CARGO_USUARIOS;
          requesterPhone = requesterPhone || uRows[0].TELEFONE_USUARIOS;
        }
      } catch (_) {}
    }

    const id = `caut-arma-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    let ammoCautelaId: string | null = null;
    const isDirect = Boolean(req.body.directAuthorized || req.body.status === 'AUTORIZADA');
    const armorer = req.body.armorer || req.body.actor || (isDirect ? { id: req.body.armorerId, name: req.body.armorerName, masp: req.body.armorerMasp } : null);

    const initialStatus = isDirect ? 'AUTORIZADA' : 'PENDENTE';

    if (ammunition && Number(ammunition.quantity) > 0) {
      ammoCautelaId = `caut-mun-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const ammoQty = parseInt(String(ammunition.quantity), 10);
      const seraDev = ammunition.seraDevolvida !== undefined ? (ammunition.seraDevolvida ? 1 : 0) : 1;

      await pool.query(`
        INSERT INTO ACAUTELAR_MUNICOES (
          ID_ACAUTELAR_MUNICOES, CALIBRE_ID_ACAUTELAR_MUNICOES, CALIBRE_NOME_ACAUTELAR_MUNICOES,
          QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES, TIPO_MUNICAO_ACAUTELAR_MUNICOES, LOTE_MUNICAO_ACAUTELAR_MUNICOES,
          FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES, PESO_MUNICAO_ACAUTELAR_MUNICOES, ANO_FABRICACAO_ACAUTELAR_MUNICOES, DESTINACAO_ACAUTELAR_MUNICOES,
          COFRE_ID_ACAUTELAR_MUNICOES, DEPARTAMENTO_ID_ACAUTELAR_MUNICOES, UNIDADE_ID_ACAUTELAR_MUNICOES,
          CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES, REQUERENTE_ID_ACAUTELAR_MUNICOES, REQUERENTE_NOME_ACAUTELAR_MUNICOES,
          REQUERENTE_MASP_ACAUTELAR_MUNICOES, REQUERENTE_CARGO_ACAUTELAR_MUNICOES, MOTIVO_USO_ACAUTELAR_MUNICOES,
          DATA_SOLICITACAO_ACAUTELAR_MUNICOES, STATUS_ACAUTELAR_MUNICOES, SERA_DEVOLVIDA_ACAUTELAR_MUNICOES,
          ARMEIRO_ID_ACAUTELAR_MUNICOES, ARMEIRO_NOME_ACAUTELAR_MUNICOES, ARMEIRO_MASP_ACAUTELAR_MUNICOES, DATA_AUTORIZACAO_ACAUTELAR_MUNICOES,
          DATA_CRIACAO_ACAUTELAR_MUNICOES
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ${isDirect ? 'NOW()' : 'NULL'}, NOW())
      `, [
        ammoCautelaId,
        ammunition.caliberId || null,
        ammunition.caliberName || weaponCaliber || 'Padrão',
        ammoQty,
        ammunition.tipoMunicao || 'Operacional',
        ammunition.loteMunicao || 'Lote Padrão',
        ammunition.fabricante || null,
        ammunition.pesoMunicao || null,
        ammunition.anoFabricacao || null,
        ammunition.destinacao || null,
        ammunition.vaultSpaceId || vaultSpaceId || null,
        departmentId || null,
        unitId || null,
        id,
        requesterId,
        requesterName,
        requesterMasp,
        requesterCargo || null,
        ammunition.reason || reason || 'Acautelamento conjunto com armamento',
        initialStatus,
        seraDev,
        isDirect && armorer ? armorer.id : null,
        isDirect && armorer ? armorer.name : null,
        isDirect && armorer ? armorer.masp : null
      ]);

      if (isDirect && (ammunition.vaultSpaceId || vaultSpaceId)) {
        const vId = ammunition.vaultSpaceId || vaultSpaceId;
        await pool.query(
          'UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?), DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR ? IS NULL) LIMIT 1',
          [ammoQty, vId, ammunition.caliberId || null, ammunition.caliberId || null]
        );

        const movId = `ammomov-caut-${Date.now()}`;
        await pool.query(
          `INSERT INTO MOVIMENTACOES_MUNICOES 
           (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
            DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
            FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
            TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
            OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
           VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
          [
            movId, ammunition.caliberId || 'padrao', ammoQty, departmentId || null, unitId || null, vId,
            `Cautela de Munição - Policial ${requesterName} (MASP ${requesterMasp})`,
            ammunition.fabricante || null, ammunition.tipoMunicao || null, ammunition.pesoMunicao || null, ammunition.loteMunicao || null, ammunition.anoFabricacao || null, ammunition.destinacao || null,
            requesterId, requesterName, requesterMasp,
            `Cautela direta autorizada pelo armeiro ${armorer?.name || ''}`,
            armorer?.id || requesterId, armorer?.name || requesterName
          ]
        );
      }
    }

    await pool.query(`
      INSERT INTO ACAUTELAR_ARMAS (
        ID_ACAUTELAR_ARMAS, ARMA_ID_ACAUTELAR_ARMAS, NUMERO_SERIE_ACAUTELAR_ARMAS,
        MODELO_ACAUTELAR_ARMAS, TIPO_ARMA_ACAUTELAR_ARMAS, CALIBRE_ACAUTELAR_ARMAS,
        QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS,
        DEPARTAMENTO_ID_ACAUTELAR_ARMAS, UNIDADE_ID_ACAUTELAR_ARMAS,
        REQUERENTE_ID_ACAUTELAR_ARMAS, REQUERENTE_NOME_ACAUTELAR_ARMAS,
        REQUERENTE_MASP_ACAUTELAR_ARMAS, REQUERENTE_CARGO_ACAUTELAR_ARMAS,
        REQUERENTE_TELEFONE_ACAUTELAR_ARMAS, FINALIDADE_MOTIVO_ACAUTELAR_ARMAS,
        DATA_SOLICITACAO_ACAUTELAR_ARMAS, STATUS_ACAUTELAR_ARMAS,
        ARMEIRO_ID_ACAUTELAR_ARMAS, ARMEIRO_NOME_ACAUTELAR_ARMAS, ARMEIRO_MASP_ACAUTELAR_ARMAS, DATA_AUTORIZACAO_ACAUTELAR_ARMAS,
        CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS, OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS, DATA_CRIACAO_ACAUTELAR_ARMAS
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ${isDirect ? 'NOW()' : 'NULL'}, ?, ?, NOW())
    `, [
      id,
      weaponId,
      weaponSerialNumber,
      weaponModel,
      weaponType || null,
      weaponCaliber || null,
      parseInt(String(magazineQuantity || 1), 10),
      vaultSpaceId || null,
      departmentId || null,
      unitId || null,
      requesterId,
      requesterName,
      requesterMasp,
      requesterCargo || null,
      requesterPhone || null,
      reason || null,
      initialStatus,
      isDirect && armorer ? armorer.id : null,
      isDirect && armorer ? armorer.name : null,
      isDirect && armorer ? armorer.masp : null,
      ammoCautelaId,
      req.body.authorizationNotes || req.body.notes || null
    ]);

    if (ammunition && Number(ammunition.quantity) > 0) {
      try {
        await pool.query(`
          UPDATE ACAUTELAR_ARMAS SET
            MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS = ?,
            MUNICAO_FABRICANTE_ACAUTELAR_ARMAS = ?,
            MUNICAO_TIPO_ACAUTELAR_ARMAS = ?,
            MUNICAO_PESO_ACAUTELAR_ARMAS = ?,
            MUNICAO_LOTE_ACAUTELAR_ARMAS = ?,
            MUNICAO_DESTINACAO_ACAUTELAR_ARMAS = ?
          WHERE ID_ACAUTELAR_ARMAS = ?
        `, [
          parseInt(String(ammunition.quantity || 0), 10),
          ammunition.fabricante || null,
          ammunition.tipoMunicao || null,
          ammunition.pesoMunicao || null,
          ammunition.loteMunicao || null,
          ammunition.destinacao || null,
          id
        ]);
      } catch (_) {}
    }

    if (isDirect) {
      let vaultCode = '';
      if (vaultSpaceId) {
        try {
          const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [vaultSpaceId]);
          if (vRows && vRows.length > 0) {
            vaultCode = vRows[0].CODIGO_COFRES;
          }
        } catch (e) {
          vaultCode = vaultSpaceId;
        }
      }
      const locationNote = `Acautelada com ${requesterName} (MASP: ${requesterMasp}) • Último cofre: ${vaultCode || 'N/A'}`;
      try {
        await pool.query(
          "UPDATE ARMAS SET STATUS_ARMAS = 'Acautelada', COFRE_ID_ARMAS = NULL, OBSERVACAO_LOCALIZACAO_ARMAS = ?, LOCAL_ANTERIOR_COFRE_ID_ARMAS = COALESCE(?, LOCAL_ANTERIOR_COFRE_ID_ARMAS) WHERE ID_ARMAS = ?",
          [locationNote, vaultSpaceId || null, weaponId]
        );
      } catch (e) {
        await pool.query(
          "UPDATE ARMAS SET STATUS_ARMAS = 'Acautelada', COFRE_ID_ARMAS = NULL, OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?",
          [locationNote, weaponId]
        );
      }
    } else {
      // Quando CONFIRMAR SOLICITAÇÃO a solicitação ficará marcada como Cautela Pendente, tanto no Status da arma quanto na aba Minhas Cautelas
      const pendingNote = `Cautela Pendente — Solicitante: ${requesterName} (MASP: ${requesterMasp})`;
      try {
        await pool.query(
          "UPDATE ARMAS SET STATUS_ARMAS = 'Cautela Pendente', OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?",
          [pendingNote, weaponId]
        );
      } catch (_) {
        await pool.query(
          "UPDATE ARMAS SET STATUS_ARMAS = 'Cautela Pendente' WHERE ID_ARMAS = ?",
          [weaponId]
        );
      }
    }

    await insertAuditLog(
      'Armas',
      isDirect ? 'Acautelamento Direto' : 'Solicitar',
      `${isDirect ? 'Armeiro acautelou diretamente' : 'Policial solicitou cautela da'} arma ${weaponModel} Nº ${weaponSerialNumber} para ${requesterName} (MASP ${requesterMasp})`,
      armorer || { id: requesterId, name: requesterName, masp: requesterMasp, role: 'Policial' } as any,
      req.ip
    );

    return res.json({ success: true, id, linkedAmmoCautelaId: ammoCautelaId, status: initialStatus });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Função auxiliar robusta para localizar ou resolver o registro da cautela de arma por ID, armaId, número de série ou IDs sintéticos
async function findCautelaArmaRecord(pool: any, id: string, body?: any): Promise<any | null> {
  const reqWeaponId = body?.weaponId;
  const reqSerial = body?.weaponSerialNumber;
  const reqCautelaId = body?.cautelaId;
  const isReturnOp = body?.shotsFired !== undefined || body?.destinationVaultSpaceId || body?.isWorking !== undefined || body?.hadShots !== undefined;

  // 1. Busca exata por ID_ACAUTELAR_ARMAS (com id ou body.cautelaId)
  if (id) {
    let [rows]: any = await pool.query('SELECT * FROM ACAUTELAR_ARMAS WHERE ID_ACAUTELAR_ARMAS = ?', [id]);
    if (rows && rows.length > 0) return rows[0];
  }
  if (reqCautelaId && reqCautelaId !== id) {
    let [rows]: any = await pool.query('SELECT * FROM ACAUTELAR_ARMAS WHERE ID_ACAUTELAR_ARMAS = ?', [reqCautelaId]);
    if (rows && rows.length > 0) return rows[0];
  }

  // 2. Busca removendo possíveis prefixos sintéticos (caut-active-, caut-weapon-sync-, caut-sync-, caut-arma-)
  const cleanId = (id || '')
    .replace(/^caut-active-/, '')
    .replace(/^caut-weapon-sync-/, '')
    .replace(/^caut-arma-sync-/, '')
    .replace(/^caut-sync-/, '')
    .replace(/^caut-arma-/, '')
    .replace(/^caut-/, '');

  // Ordem prioritária de status: se for operação de devolução, prioriza DEVOLUCAO_PENDENTE e AUTORIZADA; caso contrário, PENDENTE
  const orderClause = isReturnOp
    ? `CASE WHEN STATUS_ACAUTELAR_ARMAS IN ('DEVOLUCAO_PENDENTE', 'AUTORIZADA') THEN 1 WHEN STATUS_ACAUTELAR_ARMAS IN ('PENDENTE', 'Cautela Pendente', 'Pendente de Recibo') THEN 2 ELSE 3 END ASC`
    : `CASE WHEN STATUS_ACAUTELAR_ARMAS IN ('PENDENTE', 'Cautela Pendente', 'Pendente de Recibo') THEN 1 WHEN STATUS_ACAUTELAR_ARMAS IN ('AUTORIZADA', 'DEVOLUCAO_PENDENTE') THEN 2 ELSE 3 END ASC`;

  let [rows]: any = await pool.query(`
    SELECT * FROM ACAUTELAR_ARMAS 
    WHERE ID_ACAUTELAR_ARMAS = ? 
       OR ID_ACAUTELAR_ARMAS = ? 
       OR ID_ACAUTELAR_ARMAS = ?
       OR ID_ACAUTELAR_ARMAS = ?
       OR ARMA_ID_ACAUTELAR_ARMAS = ? 
       OR ARMA_ID_ACAUTELAR_ARMAS = ?
       OR (? IS NOT NULL AND ARMA_ID_ACAUTELAR_ARMAS = ?)
       OR (? IS NOT NULL AND NUMERO_SERIE_ACAUTELAR_ARMAS = ?)
       OR NUMERO_SERIE_ACAUTELAR_ARMAS = ?
       OR NUMERO_SERIE_ACAUTELAR_ARMAS = ?
    ORDER BY ${orderClause}, DATA_CRIACAO_ACAUTELAR_ARMAS DESC
  `, [
    cleanId, `caut-sync-${cleanId}`, `caut-weapon-sync-${cleanId}`, `caut-active-${cleanId}`,
    id, cleanId,
    reqWeaponId || null, reqWeaponId || null,
    reqSerial || null, reqSerial || null,
    id, cleanId
  ]);
  if (rows && rows.length > 0) return rows[0];

  // 3. Busca na tabela ARMAS se o armamento existe pelo id, cleanId, reqWeaponId ou reqSerial
  const [wRows]: any = await pool.query(`
    SELECT * FROM ARMAS 
    WHERE ID_ARMAS = ? 
       OR ID_ARMAS = ? 
       OR (? IS NOT NULL AND ID_ARMAS = ?)
       OR (? IS NOT NULL AND NUMERO_SERIE_ARMAS = ?)
       OR NUMERO_SERIE_ARMAS = ?
       OR NUMERO_SERIE_ARMAS = ?
    LIMIT 1
  `, [id, cleanId, reqWeaponId || null, reqWeaponId || null, reqSerial || null, reqSerial || null, id, cleanId]);

  if (wRows && wRows.length > 0) {
    const w = wRows[0];
    // Verifica se já existe qualquer cautela para essa arma
    const [cRows]: any = await pool.query(`
      SELECT * FROM ACAUTELAR_ARMAS 
      WHERE ARMA_ID_ACAUTELAR_ARMAS = ? OR NUMERO_SERIE_ACAUTELAR_ARMAS = ?
      ORDER BY ${orderClause}, DATA_CRIACAO_ACAUTELAR_ARMAS DESC LIMIT 1
    `, [w.ID_ARMAS, w.NUMERO_SERIE_ARMAS]);
    if (cRows && cRows.length > 0) return cRows[0];

    // Se ainda não existir registro em ACAUTELAR_ARMAS, resolve os dados do solicitante
    const isAcautelada = w.STATUS_ARMAS === 'Acautelada';
    const autoId = `caut-sync-${w.ID_ARMAS}`;
    let reqName = body?.requesterName;
    let reqMasp = body?.requesterMasp;
    let reqCargo = body?.requesterCargo || 'INVESTIGADOR';

    if (!reqName && w.OBSERVACAO_LOCALIZACAO_ARMAS) {
      const note = String(w.OBSERVACAO_LOCALIZACAO_ARMAS);
      if (note.includes('Acautelada com')) {
        const afterPrefix = note.split('Acautelada com')[1] || '';
        reqName = afterPrefix.split('•')[0].split('(MASP:')[0].trim();
        if (note.includes('MASP:')) {
          reqMasp = note.split('MASP:')[1].split(')')[0].trim();
        }
      }
    }
    reqName = reqName || 'Policial Responsável';
    reqMasp = reqMasp || '0000000';

    const cautelaStatus = isAcautelada ? 'AUTORIZADA' : 'PENDENTE';

    await pool.query(`
      INSERT INTO ACAUTELAR_ARMAS (
        ID_ACAUTELAR_ARMAS, ARMA_ID_ACAUTELAR_ARMAS, NUMERO_SERIE_ACAUTELAR_ARMAS,
        MODELO_ACAUTELAR_ARMAS, TIPO_ARMA_ACAUTELAR_ARMAS, CALIBRE_ACAUTELAR_ARMAS,
        QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS,
        DEPARTAMENTO_ID_ACAUTELAR_ARMAS, UNIDADE_ID_ACAUTELAR_ARMAS,
        REQUERENTE_ID_ACAUTELAR_ARMAS, REQUERENTE_NOME_ACAUTELAR_ARMAS,
        REQUERENTE_MASP_ACAUTELAR_ARMAS, REQUERENTE_CARGO_ACAUTELAR_ARMAS,
        FINALIDADE_MOTIVO_ACAUTELAR_ARMAS, STATUS_ACAUTELAR_ARMAS,
        DATA_SOLICITACAO_ACAUTELAR_ARMAS, DATA_AUTORIZACAO_ACAUTELAR_ARMAS, DATA_CRIACAO_ACAUTELAR_ARMAS
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usr-policial', ?, ?, ?, 'Acautelamento operacional', ?, NOW(), ${isAcautelada ? 'NOW()' : 'NULL'}, NOW())
      ON DUPLICATE KEY UPDATE STATUS_ACAUTELAR_ARMAS = VALUES(STATUS_ACAUTELAR_ARMAS)
    `, [
      autoId, w.ID_ARMAS, w.NUMERO_SERIE_ARMAS, w.MODELO_ARMAS, w.TIPO_ARMAS || 'Arma de Fogo',
      w.CALIBRE_ARMAS, w.QUANTIDADE_CARREGADORES_ARMAS || 2, w.COFRE_ID_ARMAS,
      w.DEPARTAMENTO_ID_ARMAS, w.UNIDADE_ID_ARMAS,
      reqName, reqMasp, reqCargo,
      cautelaStatus
    ]);
    const [created]: any = await pool.query('SELECT * FROM ACAUTELAR_ARMAS WHERE ID_ACAUTELAR_ARMAS = ?', [autoId]);
    if (created && created.length > 0) return created[0];
  }

  // 4. Fallback por número de série se foi passado no body
  if (reqSerial) {
    const [bySerial]: any = await pool.query(
      `SELECT * FROM ACAUTELAR_ARMAS WHERE NUMERO_SERIE_ACAUTELAR_ARMAS = ? ORDER BY ${orderClause}, DATA_CRIACAO_ACAUTELAR_ARMAS DESC LIMIT 1`,
      [reqSerial]
    );
    if (bySerial && bySerial.length > 0) return bySerial[0];
  }

  return null;
}

// Função auxiliar robusta para localizar ou resolver o registro da cautela de munição por ID ou vinculação
async function findCautelaMunicaoRecord(pool: any, id: string, body?: any): Promise<any | null> {
  const reqCautelaId = body?.cautelaId || body?.id;
  const reqWeaponCautelaId = body?.linkedWeaponCautelaId || body?.weaponCautelaId;

  // 1. Busca exata por ID_ACAUTELAR_MUNICOES
  if (id) {
    const [rows]: any = await pool.query('SELECT * FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ?', [id]);
    if (rows && rows.length > 0) return rows[0];
  }
  if (reqCautelaId && reqCautelaId !== id) {
    const [rows]: any = await pool.query('SELECT * FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ?', [reqCautelaId]);
    if (rows && rows.length > 0) return rows[0];
  }

  // 2. Busca removendo prefixos sintéticos
  const cleanId = (id || '')
    .replace(/^caut-mun-sync-/, '')
    .replace(/^caut-mun-/, '')
    .replace(/^caut-sync-/, '')
    .replace(/^caut-/, '');

  const [rows]: any = await pool.query(`
    SELECT * FROM ACAUTELAR_MUNICOES 
    WHERE ID_ACAUTELAR_MUNICOES = ? 
       OR ID_ACAUTELAR_MUNICOES = ?
       OR ID_ACAUTELAR_MUNICOES = ?
       OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?
       OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?
       OR (? IS NOT NULL AND CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?)
    ORDER BY CASE 
      WHEN STATUS_ACAUTELAR_MUNICOES = 'AUTORIZADA' THEN 1 
      WHEN STATUS_ACAUTELAR_MUNICOES = 'PENDENTE' THEN 2 
      ELSE 3 
    END ASC, DATA_CRIACAO_ACAUTELAR_MUNICOES DESC
  `, [
    cleanId, `caut-mun-${cleanId}`, `caut-sync-${cleanId}`,
    id, cleanId,
    reqWeaponCautelaId || null, reqWeaponCautelaId || null
  ]);
  if (rows && rows.length > 0) return rows[0];

  return null;
}

apiRouter.put('/cautelas-armas/:id/autorizar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { armorerId, armorerName, armorerMasp, notes, actor } = req.body;
    const pool = getPool();

    const cautela = await findCautelaArmaRecord(pool, id, req.body);
    if (!cautela) {
      return res.status(404).json({ error: 'Cautela de arma não encontrada.' });
    }

    const armorer = {
      id: armorerId || actor?.id,
      name: armorerName || actor?.name,
      masp: armorerMasp || actor?.masp
    };
    const { vaultSpaceId, stockId, seraDevolvida } = req.body;
    const actualCautelaId = cautela.ID_ACAUTELAR_ARMAS;

    // Resgata dados consolidados do policial solicitante e da cautela da arma
    const resolvedReqId = req.body.requesterId || cautela.REQUERENTE_ID_ACAUTELAR_ARMAS;
    const resolvedReqName = req.body.requesterName || cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS;
    const resolvedReqMasp = req.body.requesterMasp || cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS;
    const resolvedReqCargo = req.body.requesterCargo || cautela.REQUERENTE_CARGO_ACAUTELAR_ARMAS || null;
    const resolvedDeptId = cautela.DEPARTAMENTO_ID_ACAUTELAR_ARMAS || req.body.departmentId || null;
    const resolvedUnitId = cautela.UNIDADE_ID_ACAUTELAR_ARMAS || req.body.unitId || null;
    const rescuedMotivoArma =
      cautela.FINALIDADE_MOTIVO_ACAUTELAR_ARMAS ||
      req.body.reason ||
      'Serviço Ordinário';

    // 1. Atualiza status da cautela para AUTORIZADA com Armeiro Autorizador e dados resolvidos do solicitante
    await pool.query(`
      UPDATE ACAUTELAR_ARMAS SET
        STATUS_ACAUTELAR_ARMAS = 'AUTORIZADA',
        REQUERENTE_ID_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), REQUERENTE_ID_ACAUTELAR_ARMAS),
        REQUERENTE_NOME_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), REQUERENTE_NOME_ACAUTELAR_ARMAS),
        REQUERENTE_MASP_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), REQUERENTE_MASP_ACAUTELAR_ARMAS),
        REQUERENTE_CARGO_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), REQUERENTE_CARGO_ACAUTELAR_ARMAS),
        ARMEIRO_ID_ACAUTELAR_ARMAS = ?,
        ARMEIRO_NOME_ACAUTELAR_ARMAS = ?,
        ARMEIRO_MASP_ACAUTELAR_ARMAS = ?,
        DATA_AUTORIZACAO_ACAUTELAR_ARMAS = NOW(),
        OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS),
        DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
      WHERE ID_ACAUTELAR_ARMAS = ?
    `, [
      resolvedReqId || null,
      resolvedReqName || null,
      resolvedReqMasp || null,
      resolvedReqCargo,
      armorer.id,
      armorer.name,
      armorer.masp,
      notes || null,
      actualCautelaId
    ]);

    // 2. Atualiza a arma para status 'Acautelada', retirando do cofre físico mas mantendo último cofre e policial
    let vaultCode = '';
    const originVaultId = cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS || vaultSpaceId;
    if (originVaultId) {
      try {
        const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [originVaultId]);
        if (vRows && vRows.length > 0) {
          vaultCode = vRows[0].CODIGO_COFRES;
        }
      } catch (e) {
        vaultCode = originVaultId;
      }
    }
    const locationNote = `Acautelada com ${resolvedReqName} (MASP: ${resolvedReqMasp}) • Último cofre: ${vaultCode || 'N/A'}`;

    try {
      await pool.query(`
        UPDATE ARMAS SET 
          STATUS_ARMAS = 'Acautelada',
          COFRE_ID_ARMAS = NULL,
          OBSERVACAO_LOCALIZACAO_ARMAS = ?,
          LOCAL_ANTERIOR_COFRE_ID_ARMAS = COALESCE(?, LOCAL_ANTERIOR_COFRE_ID_ARMAS)
        WHERE ID_ARMAS = ?
      `, [locationNote, originVaultId || null, cautela.ARMA_ID_ACAUTELAR_ARMAS]);
    } catch (e) {
      await pool.query(`
        UPDATE ARMAS SET 
          STATUS_ARMAS = 'Acautelada',
          COFRE_ID_ARMAS = NULL,
          OBSERVACAO_LOCALIZACAO_ARMAS = ?
        WHERE ID_ARMAS = ?
      `, [locationNote, cautela.ARMA_ID_ACAUTELAR_ARMAS]);
    }

    // 3. Somente se o Armeiro marcou explicitamente "Acautelar munições junto com a arma?" (wantsWithAmmo),
    // autoriza ou gera a cautela de munições vinculada em nome do policial solicitante resgatando os dados da cautela da arma.
    // Caso contrário, a cautela será exclusivamente do armamento, sem gerar cautela de munições vinculada.
    const wantsWithAmmo =
      req.body.withAmmo !== undefined
        ? Boolean(req.body.withAmmo && Number(req.body.ammoQuantity) > 0)
        : Boolean(Number(req.body.ammoQuantity) > 0);

    const ammoCautelaId = cautela.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS;
    const [ammoRows]: any = wantsWithAmmo
      ? (ammoCautelaId
          ? await pool.query('SELECT * FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ?', [ammoCautelaId])
          : await pool.query('SELECT * FROM ACAUTELAR_MUNICOES WHERE CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ? LIMIT 1', [actualCautelaId]))
      : [[]];

    if (!wantsWithAmmo) {
      // Remove qualquer pré-solicitação pendente de munição porventura pré-vinculada e zera campos de munição na cautela de arma
      try {
        await pool.query(
          `DELETE FROM ACAUTELAR_MUNICOES
           WHERE STATUS_ACAUTELAR_MUNICOES = 'PENDENTE'
             AND (
               (? IS NOT NULL AND ID_ACAUTELAR_MUNICOES = ?)
               OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?
               OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?
             )`,
          [ammoCautelaId || null, ammoCautelaId || null, actualCautelaId, id]
        );
      } catch (_) {}

      try {
        await pool.query(
          `UPDATE ACAUTELAR_ARMAS SET
             CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = NULL,
             MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS = NULL,
             MUNICAO_FABRICANTE_ACAUTELAR_ARMAS = NULL,
             MUNICAO_TIPO_ACAUTELAR_ARMAS = NULL,
             MUNICAO_PESO_ACAUTELAR_ARMAS = NULL,
             MUNICAO_LOTE_ACAUTELAR_ARMAS = NULL,
             MUNICAO_DESTINACAO_ACAUTELAR_ARMAS = NULL
           WHERE ID_ACAUTELAR_ARMAS = ?`,
          [actualCautelaId]
        );
      } catch (_) {
        await pool.query(
          'UPDATE ACAUTELAR_ARMAS SET CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = NULL WHERE ID_ACAUTELAR_ARMAS = ?',
          [actualCautelaId]
        ).catch(() => {});
      }
    } else if (ammoRows && ammoRows.length > 0) {
      const ammoCautela = ammoRows[0];
      const qty = Number(req.body.ammoQuantity || ammoCautela.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0);
      const stDest = req.body.destinacao || ammoCautela.DESTINACAO_ACAUTELAR_MUNICOES || 'Defesa';
      const seraDev =
        seraDevolvida !== undefined
          ? (seraDevolvida ? 1 : 0)
          : (ammoCautela.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES !== undefined
              ? ammoCautela.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES
              : (stDest === 'Defesa' ? 1 : 0));

      let effectiveVault = vaultSpaceId || ammoCautela.COFRE_ID_ACAUTELAR_MUNICOES;
      let stockDetails: any = null;

      if (stockId) {
        const [stockRes]: any = await pool.query('SELECT * FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [stockId]);
        if (stockRes && stockRes.length > 0) {
          stockDetails = stockRes[0];
          effectiveVault = stockDetails.COFRE_ID_ESTOQUE_MUNICOES || effectiveVault;
        }
      }

      const stCalId =
        stockDetails?.CALIBRE_ID_ESTOQUE_MUNICOES ||
        req.body.caliberId ||
        ammoCautela.CALIBRE_ID_ACAUTELAR_MUNICOES ||
        null;
      let stCalName =
        req.body.caliberName ||
        ammoCautela.CALIBRE_NOME_ACAUTELAR_MUNICOES ||
        cautela.CALIBRE_ACAUTELAR_ARMAS ||
        'Padrão';
      if (stCalId) {
        try {
          const [cRows]: any = await pool.query('SELECT NOME_CALIBRES FROM CALIBRES WHERE ID_CALIBRES = ? LIMIT 1', [stCalId]);
          if (cRows && cRows.length > 0 && cRows[0].NOME_CALIBRES) {
            stCalName = cRows[0].NOME_CALIBRES;
          }
        } catch (_) {}
      }

      const stFab =
        stockDetails?.FABRICANTE_MUNICAO ||
        stockDetails?.FABRICANTE_ESTOQUE_MUNICOES ||
        req.body.fabricante ||
        ammoCautela.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES ||
        'CBC';
      const stTipo =
        stockDetails?.TIPO_MUNICAO ||
        stockDetails?.TIPO_ESTOQUE_MUNICOES ||
        req.body.tipoMunicao ||
        ammoCautela.TIPO_MUNICAO_ACAUTELAR_MUNICOES ||
        'Operacional';
      const stPeso =
        stockDetails?.PESO_MUNICAO ||
        stockDetails?.PESO_ESTOQUE_MUNICOES ||
        req.body.pesoMunicao ||
        ammoCautela.PESO_MUNICAO_ACAUTELAR_MUNICOES ||
        null;
      const stLote =
        stockDetails?.LOTE_MUNICAO ||
        stockDetails?.LOTE_ESTOQUE_MUNICOES ||
        req.body.loteMunicao ||
        ammoCautela.LOTE_MUNICAO_ACAUTELAR_MUNICOES ||
        'Lote Unidade';
      const stAno =
        stockDetails?.ANO_FABRICACAO_MUNICAO ||
        stockDetails?.ANO_FABRICACAO_ESTOQUE_MUNICOES ||
        req.body.anoFabricacao ||
        ammoCautela.ANO_FABRICACAO_ACAUTELAR_MUNICOES ||
        null;
      const rescuedAmmoReason = `${rescuedMotivoArma} — Acautelamento conjunto com arma ${cautela.MODELO_ACAUTELAR_ARMAS} Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} (Destinação: ${stDest})`;

      await pool.query(`
        UPDATE ACAUTELAR_MUNICOES SET
          STATUS_ACAUTELAR_MUNICOES = 'AUTORIZADA',
          CALIBRE_ID_ACAUTELAR_MUNICOES = COALESCE(?, CALIBRE_ID_ACAUTELAR_MUNICOES),
          CALIBRE_NOME_ACAUTELAR_MUNICOES = COALESCE(?, CALIBRE_NOME_ACAUTELAR_MUNICOES),
          QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES = ?,
          CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?,
          DEPARTAMENTO_ID_ACAUTELAR_MUNICOES = COALESCE(?, DEPARTAMENTO_ID_ACAUTELAR_MUNICOES),
          UNIDADE_ID_ACAUTELAR_MUNICOES = COALESCE(?, UNIDADE_ID_ACAUTELAR_MUNICOES),
          REQUERENTE_ID_ACAUTELAR_MUNICOES = COALESCE(NULLIF(?, ''), REQUERENTE_ID_ACAUTELAR_MUNICOES),
          REQUERENTE_NOME_ACAUTELAR_MUNICOES = COALESCE(NULLIF(?, ''), REQUERENTE_NOME_ACAUTELAR_MUNICOES),
          REQUERENTE_MASP_ACAUTELAR_MUNICOES = COALESCE(NULLIF(?, ''), REQUERENTE_MASP_ACAUTELAR_MUNICOES),
          REQUERENTE_CARGO_ACAUTELAR_MUNICOES = COALESCE(NULLIF(?, ''), REQUERENTE_CARGO_ACAUTELAR_MUNICOES),
          MOTIVO_USO_ACAUTELAR_MUNICOES = ?,
          ARMEIRO_ID_ACAUTELAR_MUNICOES = ?,
          ARMEIRO_NOME_ACAUTELAR_MUNICOES = ?,
          ARMEIRO_MASP_ACAUTELAR_MUNICOES = ?,
          COFRE_ID_ACAUTELAR_MUNICOES = COALESCE(?, COFRE_ID_ACAUTELAR_MUNICOES),
          LOTE_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, LOTE_MUNICAO_ACAUTELAR_MUNICOES),
          FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES),
          TIPO_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, TIPO_MUNICAO_ACAUTELAR_MUNICOES),
          PESO_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, PESO_MUNICAO_ACAUTELAR_MUNICOES),
          ANO_FABRICACAO_ACAUTELAR_MUNICOES = COALESCE(?, ANO_FABRICACAO_ACAUTELAR_MUNICOES),
          DESTINACAO_ACAUTELAR_MUNICOES = ?,
          SERA_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
          OBSERVACOES_ACAUTELAR_MUNICOES = COALESCE(NULLIF(?, ''), OBSERVACOES_ACAUTELAR_MUNICOES),
          DATA_AUTORIZACAO_ACAUTELAR_MUNICOES = NOW(),
          DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
        WHERE ID_ACAUTELAR_MUNICOES = ?
      `, [
        stCalId,
        stCalName,
        qty,
        actualCautelaId,
        resolvedDeptId,
        resolvedUnitId,
        resolvedReqId || null,
        resolvedReqName || null,
        resolvedReqMasp || null,
        resolvedReqCargo,
        rescuedAmmoReason,
        armorer.id, armorer.name, armorer.masp,
        effectiveVault,
        stLote,
        stFab,
        stTipo,
        stPeso,
        stAno,
        stDest,
        seraDev,
        req.body.armorerJustification || null,
        ammoCautela.ID_ACAUTELAR_MUNICOES
      ]);

      try {
        await pool.query(
          `UPDATE ACAUTELAR_ARMAS SET
             CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = ?,
             MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS = ?,
             MUNICAO_FABRICANTE_ACAUTELAR_ARMAS = ?,
             MUNICAO_TIPO_ACAUTELAR_ARMAS = ?,
             MUNICAO_PESO_ACAUTELAR_ARMAS = ?,
             MUNICAO_LOTE_ACAUTELAR_ARMAS = ?,
             MUNICAO_DESTINACAO_ACAUTELAR_ARMAS = ?
           WHERE ID_ACAUTELAR_ARMAS = ?`,
          [
            ammoCautela.ID_ACAUTELAR_MUNICOES,
            qty,
            stFab,
            stTipo,
            stPeso,
            stLote,
            stDest,
            actualCautelaId
          ]
        );
      } catch (_) {}

      // Deduz do estoque no cofre
      if (stockId) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE ID_ESTOQUE_MUNICOES = ?
        `, [qty, stockId]);
      } else if (effectiveVault) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE COFRE_ID_ESTOQUE_MUNICOES = ? 
            AND (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR ? IS NULL)
          LIMIT 1
        `, [qty, effectiveVault, stCalId, stCalId]);
      }

      // Registra movimentação de saída
      const movId = `ammomov-caut-${Date.now()}`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId,
          stCalId || 'padrao',
          qty,
          resolvedDeptId,
          resolvedUnitId,
          effectiveVault || 'COFRE_PADRAO',
          `Cautela Conjunta com Arma ${cautela.MODELO_ACAUTELAR_ARMAS} Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} (${stDest}) - ${seraDev ? 'Irá devolver' : 'Retirada permanente'}`,
          stFab,
          stTipo,
          stPeso,
          stLote,
          stAno,
          stDest,
          resolvedReqId,
          resolvedReqName,
          resolvedReqMasp,
          req.body.armorerJustification
            ? `Autorizado pelo armeiro ${armorer.name} (${armorer.masp}) • Justificativa: ${req.body.armorerJustification}`
            : `Autorizado pelo armeiro ${armorer.name} (${armorer.masp})`,
          armorer.id,
          armorer.name
        ]
      );
    } else if (wantsWithAmmo && Number(req.body.ammoQuantity) > 0) {
      // O armeiro optou por acautelar munições em conjunto com o armamento,
      // gerando a cautela de munições em nome do usuário solicitante resgatando os dados da cautela da arma
      const ammoQty = Number(req.body.ammoQuantity);
      let stockDetails: any = null;
      if (stockId) {
        const [stockRes]: any = await pool.query('SELECT * FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [stockId]);
        if (stockRes && stockRes.length > 0) stockDetails = stockRes[0];
      }
      if (!stockDetails) {
        const [matchingRes]: any = await pool.query(
          'SELECT * FROM ESTOQUE_MUNICOES WHERE (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR ? IS NULL) AND QUANTIDADE_ESTOQUE_MUNICOES > 0 ORDER BY QUANTIDADE_ESTOQUE_MUNICOES DESC LIMIT 1',
          [cautela.CALIBRE_ACAUTELAR_ARMAS, cautela.CALIBRE_ACAUTELAR_ARMAS]
        );
        if (matchingRes && matchingRes.length > 0) stockDetails = matchingRes[0];
      }
      const effectiveVault = stockDetails?.COFRE_ID_ESTOQUE_MUNICOES || vaultSpaceId || cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS;
      const stDest = req.body.destinacao || stockDetails?.DESTINACAO_MUNICAO || stockDetails?.DESTINACAO_ESTOQUE_MUNICOES || 'Defesa';
      const seraDev = seraDevolvida !== undefined ? (seraDevolvida ? 1 : 0) : (stDest === 'Defesa' ? 1 : 0);
      const newAmmoId = `caut-mun-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const stCalId = stockDetails?.CALIBRE_ID_ESTOQUE_MUNICOES || req.body.caliberId || null;
      let stCalName = req.body.caliberName || cautela.CALIBRE_ACAUTELAR_ARMAS || 'Padrão';
      if (stCalId) {
        try {
          const [cRows]: any = await pool.query('SELECT NOME_CALIBRES FROM CALIBRES WHERE ID_CALIBRES = ? LIMIT 1', [stCalId]);
          if (cRows && cRows.length > 0 && cRows[0].NOME_CALIBRES) {
            stCalName = cRows[0].NOME_CALIBRES;
          }
        } catch (_) {}
      }

      const stFab = stockDetails?.FABRICANTE_MUNICAO || stockDetails?.FABRICANTE_ESTOQUE_MUNICOES || req.body.fabricante || 'CBC';
      const stTipo = stockDetails?.TIPO_MUNICAO || stockDetails?.TIPO_ESTOQUE_MUNICOES || req.body.tipoMunicao || 'Operacional';
      const stPeso = stockDetails?.PESO_MUNICAO || stockDetails?.PESO_ESTOQUE_MUNICOES || req.body.pesoMunicao || null;
      const stLote = stockDetails?.LOTE_MUNICAO || stockDetails?.LOTE_ESTOQUE_MUNICOES || req.body.loteMunicao || 'Lote Unidade';
      const stAno = stockDetails?.ANO_FABRICACAO_MUNICAO || stockDetails?.ANO_FABRICACAO_ESTOQUE_MUNICOES || req.body.anoFabricacao || null;
      const rescuedAmmoReason = `${rescuedMotivoArma} — Acautelamento conjunto com arma ${cautela.MODELO_ACAUTELAR_ARMAS} Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} (Destinação: ${stDest})`;

      await pool.query(`
        INSERT INTO ACAUTELAR_MUNICOES (
          ID_ACAUTELAR_MUNICOES, CALIBRE_ID_ACAUTELAR_MUNICOES, CALIBRE_NOME_ACAUTELAR_MUNICOES,
          QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES, TIPO_MUNICAO_ACAUTELAR_MUNICOES, LOTE_MUNICAO_ACAUTELAR_MUNICOES,
          FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES, PESO_MUNICAO_ACAUTELAR_MUNICOES, ANO_FABRICACAO_ACAUTELAR_MUNICOES, DESTINACAO_ACAUTELAR_MUNICOES,
          COFRE_ID_ACAUTELAR_MUNICOES, DEPARTAMENTO_ID_ACAUTELAR_MUNICOES, UNIDADE_ID_ACAUTELAR_MUNICOES,
          CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES, REQUERENTE_ID_ACAUTELAR_MUNICOES, REQUERENTE_NOME_ACAUTELAR_MUNICOES,
          REQUERENTE_MASP_ACAUTELAR_MUNICOES, REQUERENTE_CARGO_ACAUTELAR_MUNICOES, MOTIVO_USO_ACAUTELAR_MUNICOES,
          DATA_SOLICITACAO_ACAUTELAR_MUNICOES, STATUS_ACAUTELAR_MUNICOES, SERA_DEVOLVIDA_ACAUTELAR_MUNICOES,
          ARMEIRO_ID_ACAUTELAR_MUNICOES, ARMEIRO_NOME_ACAUTELAR_MUNICOES, ARMEIRO_MASP_ACAUTELAR_MUNICOES, DATA_AUTORIZACAO_ACAUTELAR_MUNICOES,
          OBSERVACOES_ACAUTELAR_MUNICOES, DATA_CRIACAO_ACAUTELAR_MUNICOES
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), 'AUTORIZADA', ?, ?, ?, ?, NOW(), ?, NOW())
      `, [
        newAmmoId,
        stCalId,
        stCalName,
        ammoQty,
        stTipo,
        stLote,
        stFab,
        stPeso,
        stAno,
        stDest,
        effectiveVault,
        resolvedDeptId,
        resolvedUnitId,
        actualCautelaId,
        resolvedReqId,
        resolvedReqName,
        resolvedReqMasp,
        resolvedReqCargo,
        rescuedAmmoReason,
        cautela.DATA_SOLICITACAO_ACAUTELAR_ARMAS || null,
        seraDev,
        armorer.id,
        armorer.name,
        armorer.masp,
        req.body.armorerJustification || null
      ]);

      // Vincula na cautela de arma e grava dados da munição vinculada
      try {
        await pool.query(
          `UPDATE ACAUTELAR_ARMAS SET 
             CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = ?,
             MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS = ?,
             MUNICAO_FABRICANTE_ACAUTELAR_ARMAS = ?,
             MUNICAO_TIPO_ACAUTELAR_ARMAS = ?,
             MUNICAO_PESO_ACAUTELAR_ARMAS = ?,
             MUNICAO_LOTE_ACAUTELAR_ARMAS = ?,
             MUNICAO_DESTINACAO_ACAUTELAR_ARMAS = ?
           WHERE ID_ACAUTELAR_ARMAS = ?`,
          [
            newAmmoId,
            ammoQty,
            stFab,
            stTipo,
            stPeso,
            stLote,
            stDest,
            actualCautelaId
          ]
        );
      } catch (e) {
        await pool.query(
          'UPDATE ACAUTELAR_ARMAS SET CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = ? WHERE ID_ACAUTELAR_ARMAS = ?',
          [newAmmoId, actualCautelaId]
        );
      }

      // Deduz do estoque
      const effectiveStockId = stockDetails?.ID_ESTOQUE_MUNICOES || stockId;
      if (effectiveStockId) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE ID_ESTOQUE_MUNICOES = ?
        `, [ammoQty, effectiveStockId]);
      } else if (effectiveVault) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE COFRE_ID_ESTOQUE_MUNICOES = ? 
            AND (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR ? IS NULL)
          LIMIT 1
        `, [ammoQty, effectiveVault, stCalId || cautela.CALIBRE_ACAUTELAR_ARMAS, stCalId || cautela.CALIBRE_ACAUTELAR_ARMAS]);
      }

      // Registra movimentação de saída
      const movId = `ammomov-caut-${Date.now()}`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId,
          stCalId || 'padrao',
          ammoQty,
          resolvedDeptId,
          resolvedUnitId,
          effectiveVault || 'COFRE_PADRAO',
          `Cautela Conjunta com Arma ${cautela.MODELO_ACAUTELAR_ARMAS} Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} (${stDest}) - ${seraDev ? 'Irá devolver' : 'Retirada permanente'}`,
          stFab,
          stTipo,
          stPeso,
          stLote,
          stAno,
          stDest,
          resolvedReqId,
          resolvedReqName,
          resolvedReqMasp,
          req.body.armorerJustification
            ? `Autorizado pelo armeiro ${armorer.name} (${armorer.masp}) • Justificativa: ${req.body.armorerJustification}`
            : `Autorizado pelo armeiro ${armorer.name} (${armorer.masp})`,
          armorer.id,
          armorer.name
        ]
      );
    }

    await insertAuditLog(
      'Armas',
      'Aprovar',
      `Armeiro ${armorer.name} (MASP ${armorer.masp}) autorizou cautela da arma Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} para ${resolvedReqName}`,
      armorer,
      req.ip
    );

    return res.json({ success: true, message: 'Cautela de arma autorizada com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/cautelas-armas/:id/recusar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { armorerId, armorerName, armorerMasp, notes, actor } = req.body;
    const pool = getPool();
    const armorer = actor || { id: armorerId, name: armorerName, masp: armorerMasp };

    const cautela = await findCautelaArmaRecord(pool, id, req.body);
    if (!cautela) {
      return res.status(404).json({ error: 'Cautela de arma não encontrada.' });
    }
    const actualCautelaId = cautela.ID_ACAUTELAR_ARMAS;

    // 1. Atualiza registro da cautela para RECUSADA
    await pool.query(`
      UPDATE ACAUTELAR_ARMAS SET
        STATUS_ACAUTELAR_ARMAS = 'RECUSADA',
        ARMEIRO_ID_ACAUTELAR_ARMAS = ?,
        ARMEIRO_NOME_ACAUTELAR_ARMAS = ?,
        ARMEIRO_MASP_ACAUTELAR_ARMAS = ?,
        OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS = COALESCE(NULLIF(?, ''), OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS),
        DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
      WHERE ID_ACAUTELAR_ARMAS = ?
    `, [armorer.id, armorer.name, armorer.masp, notes || null, actualCautelaId]);

    // 2. Quando o armeiro recusar, a arma volta para o cofre no local de origem
    if (cautela.ARMA_ID_ACAUTELAR_ARMAS) {
      await pool.query(`
        UPDATE ARMAS SET 
          STATUS_ARMAS = 'No Cofre',
          COFRE_ID_ARMAS = COALESCE(?, COFRE_ID_ARMAS),
          OBSERVACAO_LOCALIZACAO_ARMAS = NULL
        WHERE ID_ARMAS = ?
      `, [cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS, cautela.ARMA_ID_ACAUTELAR_ARMAS]);
    }

    // 3. Se houver cautela de munição vinculada, recusa também
    const ammoCautelaId = cautela.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS;
    if (ammoCautelaId) {
      await pool.query(`
        UPDATE ACAUTELAR_MUNICOES SET
          STATUS_ACAUTELAR_MUNICOES = 'RECUSADA',
          ARMEIRO_ID_ACAUTELAR_MUNICOES = ?,
          ARMEIRO_NOME_ACAUTELAR_MUNICOES = ?,
          ARMEIRO_MASP_ACAUTELAR_MUNICOES = ?,
          OBSERVACOES_ACAUTELAR_MUNICOES = ?,
          DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
        WHERE ID_ACAUTELAR_MUNICOES = ?
      `, [armorer.id, armorer.name, armorer.masp, notes || 'Recusada junto com armamento', ammoCautelaId]);
    }

    await insertAuditLog(
      'Armas',
      'Recusar',
      `Armeiro ${armorer.name} (MASP ${armorer.masp}) recusou cautela da arma Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS}. Arma retornada ao cofre de origem.`,
      armorer,
      req.ip
    );

    return res.json({ success: true, message: 'Cautela de arma recusada e armamento mantido no cofre de origem.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Editar solicitação de cautela pendente (Policial enquanto o armeiro da unidade não Deferir/Indeferir)
async function handleUpdatePendingCautelaArma(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const pool = getPool();
    const {
      weaponId,
      weaponSerialNumber,
      weaponModel,
      weaponType,
      weaponCaliber,
      magazineQuantity,
      vaultSpaceId,
      reason,
      authorizationNotes,
      originalWeaponId,
      originalWeaponSerialNumber,
      cautelaId,
      actor
    } = req.body || {};

    const cautela = await findCautelaArmaRecord(pool, id, {
      cautelaId: cautelaId || id,
      weaponId: originalWeaponId || weaponId,
      weaponSerialNumber: originalWeaponSerialNumber
    });

    if (!cautela) {
      return res.status(404).json({ error: 'Solicitação de cautela não encontrada.' });
    }

    const actualCautelaId = cautela.ID_ACAUTELAR_ARMAS;
    const statusAtual = (cautela.STATUS_ACAUTELAR_ARMAS || '').trim().toUpperCase();
    const isStillPending =
      statusAtual === 'PENDENTE' ||
      statusAtual === 'CAUTELA PENDENTE' ||
      statusAtual === 'PENDENTE DE RECIBO' ||
      statusAtual === 'PENDENTE RECIBO';

    if (!isStillPending) {
      return res.status(400).json({
        error: 'Esta cautela já foi analisada (deferida ou indeferida) pelo armeiro da unidade e não pode mais ser editada.'
      });
    }

    const oldWeaponId = cautela.ARMA_ID_ACAUTELAR_ARMAS;
    const targetWeaponId = weaponId || oldWeaponId;

    let resolvedSerial = weaponSerialNumber || cautela.NUMERO_SERIE_ACAUTELAR_ARMAS;
    let resolvedModel = weaponModel || cautela.MODELO_ACAUTELAR_ARMAS;
    let resolvedType = weaponType !== undefined ? weaponType : cautela.TIPO_ARMA_ACAUTELAR_ARMAS;
    let resolvedCaliber = weaponCaliber !== undefined ? weaponCaliber : cautela.CALIBRE_ACAUTELAR_ARMAS;
    let resolvedMagazines = parseInt(String(magazineQuantity ?? cautela.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS ?? 2), 10);
    let resolvedOriginVaultId = cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS;

    // Se o policial trocou o armamento solicitado na cautela pendente
    if (targetWeaponId && targetWeaponId !== oldWeaponId) {
      const [newWRows]: any = await pool.query('SELECT * FROM ARMAS WHERE ID_ARMAS = ?', [targetWeaponId]);
      if (!newWRows || newWRows.length === 0) {
        return res.status(404).json({ error: 'Novo armamento selecionado não encontrado.' });
      }
      const newW = newWRows[0];
      const newWStatus = (newW.STATUS_ARMAS || '').trim().toLowerCase();
      if (newWStatus !== 'no cofre' && newWStatus !== 'nocofre') {
        return res.status(400).json({
          error: 'O novo armamento selecionado não está mais disponível com status "No Cofre".'
        });
      }

      // 1. Libera o armamento anterior de volta para o status "No Cofre" no cofre de origem
      if (oldWeaponId) {
        await pool.query(
          `UPDATE ARMAS SET 
            STATUS_ARMAS = 'No Cofre',
            COFRE_ID_ARMAS = COALESCE(?, COFRE_ID_ARMAS),
            OBSERVACAO_LOCALIZACAO_ARMAS = NULL
           WHERE ID_ARMAS = ?`,
          [cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS, oldWeaponId]
        );
      }

      // 2. Reserva o novo armamento com status "Cautela Pendente"
      const reqName = cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS || actor?.name || 'Policial';
      const reqMasp = cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS || actor?.masp || '';
      const pendingNote = `Cautela Pendente — Solicitante: ${reqName} (MASP: ${reqMasp})`;
      try {
        await pool.query(
          `UPDATE ARMAS SET STATUS_ARMAS = 'Cautela Pendente', OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?`,
          [pendingNote, targetWeaponId]
        );
      } catch (_) {
        await pool.query(
          `UPDATE ARMAS SET STATUS_ARMAS = 'Cautela Pendente' WHERE ID_ARMAS = ?`,
          [targetWeaponId]
        );
      }

      resolvedSerial = newW.NUMERO_SERIE_ARMAS || resolvedSerial;
      resolvedModel = newW.MODELO_ARMAS || resolvedModel;
      resolvedType = newW.TIPO_ARMAS || resolvedType;
      resolvedCaliber = newW.CALIBRE_ARMAS || resolvedCaliber;
      resolvedMagazines = parseInt(String(magazineQuantity ?? newW.QUANTIDADE_CARREGADORES_ARMAS ?? 2), 10);
      resolvedOriginVaultId = newW.COFRE_ID_ARMAS || vaultSpaceId || null;
    }

    const updatedNotes =
      authorizationNotes !== undefined
        ? (authorizationNotes && String(authorizationNotes).trim() ? String(authorizationNotes).trim() : null)
        : cautela.OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS;

    const updatedReason =
      reason !== undefined
        ? (reason && String(reason).trim() ? String(reason).trim() : null)
        : cautela.FINALIDADE_MOTIVO_ACAUTELAR_ARMAS;

    await pool.query(
      `UPDATE ACAUTELAR_ARMAS SET
        ARMA_ID_ACAUTELAR_ARMAS = ?,
        NUMERO_SERIE_ACAUTELAR_ARMAS = ?,
        MODELO_ACAUTELAR_ARMAS = ?,
        TIPO_ARMA_ACAUTELAR_ARMAS = ?,
        CALIBRE_ACAUTELAR_ARMAS = ?,
        QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS = ?,
        COFRE_ORIGEM_ID_ACAUTELAR_ARMAS = ?,
        FINALIDADE_MOTIVO_ACAUTELAR_ARMAS = ?,
        OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS = ?,
        DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
       WHERE ID_ACAUTELAR_ARMAS = ?`,
      [
        targetWeaponId,
        resolvedSerial,
        resolvedModel,
        resolvedType || null,
        resolvedCaliber || null,
        resolvedMagazines,
        resolvedOriginVaultId || null,
        updatedReason,
        updatedNotes,
        actualCautelaId
      ]
    );

    const polNome = cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS || actor?.name || 'Policial';
    const polMasp = cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS || actor?.masp || '';

    await insertAuditLog(
      'Cautelas',
      'Editar Solicitação',
      `Solicitação de cautela pendente (${actualCautelaId}) editada pelo policial ${polNome} (MASP: ${polMasp}) — Arma: ${resolvedModel} Nº ${resolvedSerial}.`,
      actor,
      req.ip
    );

    return res.json({
      success: true,
      id: actualCautelaId,
      message: 'Solicitação de cautela atualizada com sucesso.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Cancelar / Excluir solicitação de cautela pendente (Policial ou Armeiro antes do Deferimento/Indeferimento)
async function handleCancelCautelaArma(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const pool = getPool();
    const actor = req.body?.actor;

    const cautela = await findCautelaArmaRecord(pool, id, req.body);
    if (!cautela) {
      // Se não constar na tabela ACAUTELAR_ARMAS, mas a arma foi informada ou veio em id sintético
      const cleanId = (id || '')
        .replace(/^caut-active-/, '')
        .replace(/^caut-weapon-sync-/, '')
        .replace(/^caut-arma-sync-/, '')
        .replace(/^caut-sync-/, '')
        .replace(/^caut-arma-/, '')
        .replace(/^caut-/, '');
      const weaponId = req.body?.weaponId || cleanId;
      if (weaponId) {
        await pool.query(`
          UPDATE ARMAS SET 
            STATUS_ARMAS = 'No Cofre',
            OBSERVACAO_LOCALIZACAO_ARMAS = NULL
          WHERE ID_ARMAS = ? AND STATUS_ARMAS IN ('Cautela Pendente', 'Pendente de Recibo', 'Pendente Recibo')
        `, [weaponId]);
      }
      return res.json({ success: true, message: 'Solicitação excluída e arma liberada no cofre.' });
    }

    const actualCautelaId = cautela.ID_ACAUTELAR_ARMAS;

    // Apenas cautelas pendentes (enquanto o armeiro não Deferir/Indeferir) podem ser excluídas
    const statusAtual = (cautela.STATUS_ACAUTELAR_ARMAS || '').trim().toUpperCase();
    if (statusAtual !== 'PENDENTE' && statusAtual !== 'CAUTELA PENDENTE' && statusAtual !== 'PENDENTE DE RECIBO' && statusAtual !== 'PENDENTE RECIBO') {
      return res.status(400).json({ error: 'Esta cautela já foi analisada (deferida ou indeferida) pelo armeiro da unidade e não pode mais ser excluída.' });
    }

    // 1. Libera a arma de volta para o cofre de origem
    if (cautela.ARMA_ID_ACAUTELAR_ARMAS) {
      await pool.query(`
        UPDATE ARMAS SET 
          STATUS_ARMAS = 'No Cofre',
          COFRE_ID_ARMAS = COALESCE(?, COFRE_ID_ARMAS),
          OBSERVACAO_LOCALIZACAO_ARMAS = NULL
        WHERE ID_ARMAS = ?
      `, [cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS, cautela.ARMA_ID_ACAUTELAR_ARMAS]);
    }

    // 2. Se houver cautela de munição vinculada, remove também
    const ammoCautelaId = cautela.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS;
    if (ammoCautelaId) {
      await pool.query(`DELETE FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ?`, [ammoCautelaId]);
    }

    // 3. Exclui a solicitação de cautela de arma da tabela
    await pool.query(`DELETE FROM ACAUTELAR_ARMAS WHERE ID_ACAUTELAR_ARMAS = ?`, [actualCautelaId]);

    const polNome = cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS || actor?.name || 'Policial';
    const polMasp = cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS || actor?.masp || '';
    const armSerial = cautela.NUMERO_SERIE_ACAUTELAR_ARMAS || '';

    await insertAuditLog(
      'Cautelas',
      'Cancelar/Excluir',
      `Solicitação de cautela pendente da arma Nº ${armSerial} excluída pelo policial ${polNome} (MASP: ${polMasp}). Arma retornada ao status "No Cofre".`,
      actor,
      req.ip
    );

    return res.json({ success: true, message: 'Solicitação de cautela excluída com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Editar cautela deferida/ativa pelo Armeiro em até 15 minutos após a autorização
async function handleUpdateActiveCautelaArma(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const pool = getPool();
    const actor = req.body?.actor;
    const actorRole = String(actor?.activeRole || actor?.role || '').trim();

    if (actorRole === 'Policial' || (actorRole && !['Armeiro', 'Administrador', 'Geral'].includes(actorRole))) {
      return res.status(403).json({
        error: 'Apenas usuários com perfil Armeiro podem editar cautelas na aba Deferidas/Ativas.'
      });
    }

    const cautela = await findCautelaArmaRecord(pool, id, req.body);
    if (!cautela) {
      return res.status(404).json({ error: 'Cautela ativa não encontrada.' });
    }

    const actualCautelaId = cautela.ID_ACAUTELAR_ARMAS;
    const statusAtual = String(cautela.STATUS_ACAUTELAR_ARMAS || '').trim().toUpperCase();
    if (statusAtual !== 'AUTORIZADA') {
      return res.status(400).json({
        error: 'Somente cautelas ativas em posse (não devolvidas) podem ser editadas dentro do prazo.'
      });
    }

    // Regra estrita de 15 minutos (900 segundos) a partir da autorização
    const [timeRows]: any = await pool.query(
      `SELECT TIMESTAMPDIFF(
         SECOND,
         COALESCE(DATA_AUTORIZACAO_ACAUTELAR_ARMAS, DATA_CRIACAO_ACAUTELAR_ARMAS, DATA_SOLICITACAO_ACAUTELAR_ARMAS),
         NOW()
       ) AS elapsed_seconds
       FROM ACAUTELAR_ARMAS
       WHERE ID_ACAUTELAR_ARMAS = ?`,
      [actualCautelaId]
    );
    const elapsedSeconds = timeRows && timeRows.length > 0 ? Number(timeRows[0].elapsed_seconds) : 999999;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds > 900) {
      return res.status(403).json({
        error: 'O prazo máximo de 15 minutos após a autorização expirou. Esta cautela não pode mais ser alterada.'
      });
    }

    const resolvedReqId = req.body.requesterId || cautela.REQUERENTE_ID_ACAUTELAR_ARMAS;
    const resolvedReqName = req.body.requesterName || cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS;
    const resolvedReqMasp = req.body.requesterMasp || cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS;
    const resolvedReqCargo = req.body.requesterCargo || cautela.REQUERENTE_CARGO_ACAUTELAR_ARMAS || null;
    const resolvedDeptId = cautela.DEPARTAMENTO_ID_ACAUTELAR_ARMAS || req.body.departmentId || null;
    const resolvedUnitId = cautela.UNIDADE_ID_ACAUTELAR_ARMAS || req.body.unitId || null;
    const updatedReason =
      req.body.reason && String(req.body.reason).trim()
        ? String(req.body.reason).trim()
        : (cautela.FINALIDADE_MOTIVO_ACAUTELAR_ARMAS || 'Serviço Ordinário');

    const oldWeaponId = cautela.ARMA_ID_ACAUTELAR_ARMAS;
    const targetWeaponId = req.body.weaponId || oldWeaponId;
    let resolvedSerial = req.body.weaponSerialNumber || cautela.NUMERO_SERIE_ACAUTELAR_ARMAS;
    let resolvedModel = req.body.weaponModel || cautela.MODELO_ACAUTELAR_ARMAS;
    let resolvedType = req.body.weaponType || cautela.TIPO_ARMA_ACAUTELAR_ARMAS;
    let resolvedCaliber = req.body.weaponCaliber || cautela.CALIBRE_ACAUTELAR_ARMAS;
    let resolvedOriginVaultId = cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS;
    const resolvedMagazines = Math.max(
      1,
      parseInt(String(req.body.magazineQuantity ?? cautela.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS ?? 2), 10) || 2
    );

    if (targetWeaponId && targetWeaponId !== oldWeaponId) {
      const [newWRows]: any = await pool.query('SELECT * FROM ARMAS WHERE ID_ARMAS = ?', [targetWeaponId]);
      if (!newWRows || newWRows.length === 0) {
        return res.status(404).json({ error: 'Novo armamento selecionado não encontrado.' });
      }
      const newW = newWRows[0];
      if (newW.STATUS_ARMAS !== 'No Cofre') {
        return res.status(400).json({
          error: `A arma ${newW.MODELO_ARMAS} (Nº ${newW.NUMERO_SERIE_ARMAS}) não está disponível no cofre.`
        });
      }

      // Retorna a arma anterior ao cofre de origem
      if (oldWeaponId) {
        await pool.query(
          `UPDATE ARMAS SET
             STATUS_ARMAS = 'No Cofre',
             COFRE_ID_ARMAS = COALESCE(?, LOCAL_ANTERIOR_COFRE_ID_ARMAS, COFRE_ID_ARMAS),
             OBSERVACAO_LOCALIZACAO_ARMAS = NULL
           WHERE ID_ARMAS = ?`,
          [cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS || null, oldWeaponId]
        );
      }

      resolvedSerial = newW.NUMERO_SERIE_ARMAS || resolvedSerial;
      resolvedModel = newW.MODELO_ARMAS || resolvedModel;
      resolvedType = newW.TIPO_ARMAS || resolvedType;
      resolvedCaliber = newW.CALIBRE_ARMAS || resolvedCaliber;
      resolvedOriginVaultId = newW.COFRE_ID_ARMAS || newW.LOCAL_ANTERIOR_COFRE_ID_ARMAS || resolvedOriginVaultId;

      let newVaultCode = '';
      if (resolvedOriginVaultId) {
        try {
          const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [resolvedOriginVaultId]);
          if (vRows && vRows.length > 0) newVaultCode = vRows[0].CODIGO_COFRES;
        } catch (_) {}
      }
      const newLocNote = `Acautelada com ${resolvedReqName} (MASP: ${resolvedReqMasp}) • Último cofre: ${newVaultCode || 'N/A'}`;
      try {
        await pool.query(
          `UPDATE ARMAS SET
             STATUS_ARMAS = 'Acautelada',
             COFRE_ID_ARMAS = NULL,
             OBSERVACAO_LOCALIZACAO_ARMAS = ?,
             LOCAL_ANTERIOR_COFRE_ID_ARMAS = COALESCE(?, LOCAL_ANTERIOR_COFRE_ID_ARMAS)
           WHERE ID_ARMAS = ?`,
          [newLocNote, resolvedOriginVaultId || null, targetWeaponId]
        );
      } catch (_) {
        await pool.query(
          `UPDATE ARMAS SET STATUS_ARMAS = 'Acautelada', COFRE_ID_ARMAS = NULL, OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?`,
          [newLocNote, targetWeaponId]
        );
      }
    } else if (oldWeaponId) {
      let curVaultCode = '';
      if (resolvedOriginVaultId) {
        try {
          const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [resolvedOriginVaultId]);
          if (vRows && vRows.length > 0) curVaultCode = vRows[0].CODIGO_COFRES;
        } catch (_) {}
      }
      const updatedLocNote = `Acautelada com ${resolvedReqName} (MASP: ${resolvedReqMasp}) • Último cofre: ${curVaultCode || 'N/A'}`;
      await pool.query(
        `UPDATE ARMAS SET OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?`,
        [updatedLocNote, oldWeaponId]
      ).catch(() => {});
    }

    // Reconciliação de Munição Vinculada e Estoque
    const prevAmmoId = cautela.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS;
    const [prevAmmoRows]: any = prevAmmoId
      ? await pool.query('SELECT * FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ? LIMIT 1', [prevAmmoId])
      : await pool.query('SELECT * FROM ACAUTELAR_MUNICOES WHERE CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ? LIMIT 1', [actualCautelaId]);
    const prevAmmo = prevAmmoRows && prevAmmoRows.length > 0 ? prevAmmoRows[0] : null;

    let restoredStockId: string | null = null;
    let restoredQty = 0;

    if (prevAmmo && String(prevAmmo.STATUS_ACAUTELAR_MUNICOES || '').toUpperCase() === 'AUTORIZADA') {
      const prevQty = Number(prevAmmo.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0);
      if (prevQty > 0) {
        let [stMatch]: any = await pool.query(
          `SELECT ID_ESTOQUE_MUNICOES FROM ESTOQUE_MUNICOES
           WHERE COFRE_ID_ESTOQUE_MUNICOES = ?
             AND (? IS NULL OR LOTE_MUNICAO = ?)
             AND (? IS NULL OR CALIBRE_ID_ESTOQUE_MUNICOES = ?)
           LIMIT 1`,
          [
            prevAmmo.COFRE_ID_ACAUTELAR_MUNICOES || '',
            prevAmmo.LOTE_MUNICAO_ACAUTELAR_MUNICOES || null,
            prevAmmo.LOTE_MUNICAO_ACAUTELAR_MUNICOES || null,
            prevAmmo.CALIBRE_ID_ACAUTELAR_MUNICOES || null,
            prevAmmo.CALIBRE_ID_ACAUTELAR_MUNICOES || null
          ]
        );
        if (!stMatch || stMatch.length === 0) {
          [stMatch] = await pool.query(
            `SELECT ID_ESTOQUE_MUNICOES FROM ESTOQUE_MUNICOES
             WHERE COFRE_ID_ESTOQUE_MUNICOES = ?
               AND (? IS NULL OR CALIBRE_ID_ESTOQUE_MUNICOES = ?)
             LIMIT 1`,
            [
              prevAmmo.COFRE_ID_ACAUTELAR_MUNICOES || '',
              prevAmmo.CALIBRE_ID_ACAUTELAR_MUNICOES || null,
              prevAmmo.CALIBRE_ID_ACAUTELAR_MUNICOES || null
            ]
          );
        }
        if (stMatch && stMatch.length > 0) {
          restoredStockId = stMatch[0].ID_ESTOQUE_MUNICOES;
          restoredQty = prevQty;
          await pool.query(
            `UPDATE ESTOQUE_MUNICOES SET
               QUANTIDADE_ESTOQUE_MUNICOES = QUANTIDADE_ESTOQUE_MUNICOES + ?,
               DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
             WHERE ID_ESTOQUE_MUNICOES = ?`,
            [prevQty, restoredStockId]
          );
        }
      }
    }

    const wantsWithAmmo = Boolean(req.body.withAmmo && Number(req.body.ammoQuantity) > 0);
    let finalAmmoCautelaId: string | null = null;
    let finalAmmoQty: number | null = null;
    let finalFab: string | null = null;
    let finalTipo: string | null = null;
    let finalPeso: string | null = null;
    let finalLote: string | null = null;
    let finalDest: string | null = null;

    if (!wantsWithAmmo) {
      if (prevAmmo) {
        await pool.query('DELETE FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ?', [
          prevAmmo.ID_ACAUTELAR_MUNICOES
        ]);
        if (restoredQty > 0) {
          const movEstornoId = `ammomov-edit-est-${Date.now()}`;
          await pool.query(
            `INSERT INTO MOVIMENTACOES_MUNICOES
             (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES,
              DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES,
              FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
              TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES,
              OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
             VALUES (?, 'Entrada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
            [
              movEstornoId,
              prevAmmo.CALIBRE_ID_ACAUTELAR_MUNICOES || 'padrao',
              restoredQty,
              resolvedDeptId,
              resolvedUnitId,
              prevAmmo.COFRE_ID_ACAUTELAR_MUNICOES || 'COFRE_PADRAO',
              `Estorno de munição por edição de cautela ativa (dentro de 15 min) — Arma ${resolvedModel} Nº ${resolvedSerial}`,
              prevAmmo.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES || null,
              prevAmmo.TIPO_MUNICAO_ACAUTELAR_MUNICOES || null,
              prevAmmo.PESO_MUNICAO_ACAUTELAR_MUNICOES || null,
              prevAmmo.LOTE_MUNICAO_ACAUTELAR_MUNICOES || null,
              prevAmmo.ANO_FABRICACAO_ACAUTELAR_MUNICOES || null,
              prevAmmo.DESTINACAO_ACAUTELAR_MUNICOES || null,
              resolvedReqId,
              resolvedReqName,
              resolvedReqMasp,
              `Editado pelo armeiro ${actor?.name || 'Armeiro'} (${actor?.masp || ''})`,
              actor?.id || cautela.ARMEIRO_ID_ACAUTELAR_ARMAS,
              actor?.name || cautela.ARMEIRO_NOME_ACAUTELAR_ARMAS
            ]
          ).catch(() => {});
        }
      }
    } else {
      const newAmmoQty = Number(req.body.ammoQuantity);
      const targetStockId = req.body.stockId || restoredStockId;
      let stockDetails: any = null;
      if (targetStockId) {
        const [sRows]: any = await pool.query('SELECT * FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [targetStockId]);
        if (sRows && sRows.length > 0) stockDetails = sRows[0];
      }

      if (stockDetails && Number(stockDetails.QUANTIDADE_ESTOQUE_MUNICOES) < newAmmoQty) {
        if (restoredStockId && restoredQty > 0) {
          await pool.query(
            `UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?) WHERE ID_ESTOQUE_MUNICOES = ?`,
            [restoredQty, restoredStockId]
          );
        }
        return res.status(400).json({
          error: `Saldo insuficiente no lote selecionado para a quantidade informada (${newAmmoQty} un.).`
        });
      }

      const stDest = req.body.destinacao || prevAmmo?.DESTINACAO_ACAUTELAR_MUNICOES || 'Defesa';
      const seraDev =
        req.body.seraDevolvida !== undefined
          ? (req.body.seraDevolvida ? 1 : 0)
          : (stDest === 'Defesa' ? 1 : 0);
      const effectiveVault =
        stockDetails?.COFRE_ID_ESTOQUE_MUNICOES ||
        req.body.vaultSpaceId ||
        prevAmmo?.COFRE_ID_ACAUTELAR_MUNICOES ||
        resolvedOriginVaultId;

      const stCalId =
        stockDetails?.CALIBRE_ID_ESTOQUE_MUNICOES ||
        req.body.caliberId ||
        prevAmmo?.CALIBRE_ID_ACAUTELAR_MUNICOES ||
        null;
      let stCalName =
        req.body.caliberName ||
        prevAmmo?.CALIBRE_NOME_ACAUTELAR_MUNICOES ||
        resolvedCaliber ||
        'Padrão';
      if (stCalId) {
        try {
          const [cRows]: any = await pool.query('SELECT NOME_CALIBRES FROM CALIBRES WHERE ID_CALIBRES = ? LIMIT 1', [stCalId]);
          if (cRows && cRows.length > 0 && cRows[0].NOME_CALIBRES) stCalName = cRows[0].NOME_CALIBRES;
        } catch (_) {}
      }

      const stFab = stockDetails?.FABRICANTE_MUNICAO || req.body.fabricante || prevAmmo?.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES || 'CBC';
      const stTipo = stockDetails?.TIPO_MUNICAO || req.body.tipoMunicao || prevAmmo?.TIPO_MUNICAO_ACAUTELAR_MUNICOES || 'Operacional';
      const stPeso = stockDetails?.PESO_MUNICAO || req.body.pesoMunicao || prevAmmo?.PESO_MUNICAO_ACAUTELAR_MUNICOES || null;
      const stLote = stockDetails?.LOTE_MUNICAO || req.body.loteMunicao || prevAmmo?.LOTE_MUNICAO_ACAUTELAR_MUNICOES || 'Lote Unidade';
      const stAno = stockDetails?.ANO_FABRICACAO_MUNICAO || req.body.anoFabricacao || prevAmmo?.ANO_FABRICACAO_ACAUTELAR_MUNICOES || null;
      const rescuedAmmoReason = `${updatedReason} — Acautelamento conjunto com arma ${resolvedModel} Nº ${resolvedSerial} (Destinação: ${stDest})`;

      if (stockDetails?.ID_ESTOQUE_MUNICOES) {
        await pool.query(
          `UPDATE ESTOQUE_MUNICOES SET
             QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
             DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
           WHERE ID_ESTOQUE_MUNICOES = ?`,
          [newAmmoQty, stockDetails.ID_ESTOQUE_MUNICOES]
        );
      }

      if (prevAmmo) {
        finalAmmoCautelaId = prevAmmo.ID_ACAUTELAR_MUNICOES;
        await pool.query(
          `UPDATE ACAUTELAR_MUNICOES SET
             CALIBRE_ID_ACAUTELAR_MUNICOES = ?,
             CALIBRE_NOME_ACAUTELAR_MUNICOES = ?,
             QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES = ?,
             TIPO_MUNICAO_ACAUTELAR_MUNICOES = ?,
             LOTE_MUNICAO_ACAUTELAR_MUNICOES = ?,
             FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES = ?,
             PESO_MUNICAO_ACAUTELAR_MUNICOES = ?,
             ANO_FABRICACAO_ACAUTELAR_MUNICOES = ?,
             DESTINACAO_ACAUTELAR_MUNICOES = ?,
             COFRE_ID_ACAUTELAR_MUNICOES = ?,
             DEPARTAMENTO_ID_ACAUTELAR_MUNICOES = ?,
             UNIDADE_ID_ACAUTELAR_MUNICOES = ?,
             CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?,
             REQUERENTE_ID_ACAUTELAR_MUNICOES = ?,
             REQUERENTE_NOME_ACAUTELAR_MUNICOES = ?,
             REQUERENTE_MASP_ACAUTELAR_MUNICOES = ?,
             REQUERENTE_CARGO_ACAUTELAR_MUNICOES = ?,
             MOTIVO_USO_ACAUTELAR_MUNICOES = ?,
             SERA_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
             OBSERVACOES_ACAUTELAR_MUNICOES = COALESCE(NULLIF(?, ''), OBSERVACOES_ACAUTELAR_MUNICOES),
             DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
           WHERE ID_ACAUTELAR_MUNICOES = ?`,
          [
            stCalId,
            stCalName,
            newAmmoQty,
            stTipo,
            stLote,
            stFab,
            stPeso,
            stAno,
            stDest,
            effectiveVault,
            resolvedDeptId,
            resolvedUnitId,
            actualCautelaId,
            resolvedReqId,
            resolvedReqName,
            resolvedReqMasp,
            resolvedReqCargo,
            rescuedAmmoReason,
            seraDev,
            req.body.armorerJustification || null,
            finalAmmoCautelaId
          ]
        );
      } else {
        finalAmmoCautelaId = `caut-mun-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        await pool.query(
          `INSERT INTO ACAUTELAR_MUNICOES (
             ID_ACAUTELAR_MUNICOES, CALIBRE_ID_ACAUTELAR_MUNICOES, CALIBRE_NOME_ACAUTELAR_MUNICOES,
             QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES, TIPO_MUNICAO_ACAUTELAR_MUNICOES, LOTE_MUNICAO_ACAUTELAR_MUNICOES,
             FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES, PESO_MUNICAO_ACAUTELAR_MUNICOES, ANO_FABRICACAO_ACAUTELAR_MUNICOES, DESTINACAO_ACAUTELAR_MUNICOES,
             COFRE_ID_ACAUTELAR_MUNICOES, DEPARTAMENTO_ID_ACAUTELAR_MUNICOES, UNIDADE_ID_ACAUTELAR_MUNICOES,
             CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES, REQUERENTE_ID_ACAUTELAR_MUNICOES, REQUERENTE_NOME_ACAUTELAR_MUNICOES,
             REQUERENTE_MASP_ACAUTELAR_MUNICOES, REQUERENTE_CARGO_ACAUTELAR_MUNICOES, MOTIVO_USO_ACAUTELAR_MUNICOES,
             DATA_SOLICITACAO_ACAUTELAR_MUNICOES, STATUS_ACAUTELAR_MUNICOES, SERA_DEVOLVIDA_ACAUTELAR_MUNICOES,
             ARMEIRO_ID_ACAUTELAR_MUNICOES, ARMEIRO_NOME_ACAUTELAR_MUNICOES, ARMEIRO_MASP_ACAUTELAR_MUNICOES, DATA_AUTORIZACAO_ACAUTELAR_MUNICOES,
             OBSERVACOES_ACAUTELAR_MUNICOES, DATA_CRIACAO_ACAUTELAR_MUNICOES
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), 'AUTORIZADA', ?, ?, ?, ?, COALESCE(?, NOW()), ?, NOW())`,
          [
            finalAmmoCautelaId,
            stCalId,
            stCalName,
            newAmmoQty,
            stTipo,
            stLote,
            stFab,
            stPeso,
            stAno,
            stDest,
            effectiveVault,
            resolvedDeptId,
            resolvedUnitId,
            actualCautelaId,
            resolvedReqId,
            resolvedReqName,
            resolvedReqMasp,
            resolvedReqCargo,
            rescuedAmmoReason,
            cautela.DATA_SOLICITACAO_ACAUTELAR_ARMAS || null,
            seraDev,
            actor?.id || cautela.ARMEIRO_ID_ACAUTELAR_ARMAS,
            actor?.name || cautela.ARMEIRO_NOME_ACAUTELAR_ARMAS,
            actor?.masp || cautela.ARMEIRO_MASP_ACAUTELAR_ARMAS,
            cautela.DATA_AUTORIZACAO_ACAUTELAR_ARMAS || null,
            req.body.armorerJustification || null
          ]
        );
      }

      finalAmmoQty = newAmmoQty;
      finalFab = stFab;
      finalTipo = stTipo;
      finalPeso = stPeso;
      finalLote = stLote;
      finalDest = stDest;
    }

    const updatedNotes =
      req.body.notes !== undefined && String(req.body.notes).trim() !== ''
        ? String(req.body.notes).trim()
        : cautela.OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS;

    // Atualiza ACAUTELAR_ARMAS preservando DATA_AUTORIZACAO_ACAUTELAR_ARMAS (não reinicia o prazo de 15 min)
    await pool.query(
      `UPDATE ACAUTELAR_ARMAS SET
         ARMA_ID_ACAUTELAR_ARMAS = ?,
         NUMERO_SERIE_ACAUTELAR_ARMAS = ?,
         MODELO_ACAUTELAR_ARMAS = ?,
         TIPO_ARMA_ACAUTELAR_ARMAS = ?,
         CALIBRE_ACAUTELAR_ARMAS = ?,
         QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS = ?,
         COFRE_ORIGEM_ID_ACAUTELAR_ARMAS = ?,
         REQUERENTE_ID_ACAUTELAR_ARMAS = ?,
         REQUERENTE_NOME_ACAUTELAR_ARMAS = ?,
         REQUERENTE_MASP_ACAUTELAR_ARMAS = ?,
         REQUERENTE_CARGO_ACAUTELAR_ARMAS = ?,
         FINALIDADE_MOTIVO_ACAUTELAR_ARMAS = ?,
         OBSERVACOES_AUTORIZACAO_ACAUTELAR_ARMAS = ?,
         CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = ?,
         MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS = ?,
         MUNICAO_FABRICANTE_ACAUTELAR_ARMAS = ?,
         MUNICAO_TIPO_ACAUTELAR_ARMAS = ?,
         MUNICAO_PESO_ACAUTELAR_ARMAS = ?,
         MUNICAO_LOTE_ACAUTELAR_ARMAS = ?,
         MUNICAO_DESTINACAO_ACAUTELAR_ARMAS = ?,
         DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
       WHERE ID_ACAUTELAR_ARMAS = ?`,
      [
        targetWeaponId,
        resolvedSerial,
        resolvedModel,
        resolvedType || null,
        resolvedCaliber || null,
        resolvedMagazines,
        resolvedOriginVaultId || null,
        resolvedReqId,
        resolvedReqName,
        resolvedReqMasp,
        resolvedReqCargo,
        updatedReason,
        updatedNotes,
        finalAmmoCautelaId,
        finalAmmoQty,
        finalFab,
        finalTipo,
        finalPeso,
        finalLote,
        finalDest,
        actualCautelaId
      ]
    );

    await insertAuditLog(
      'Cautelas',
      'Editar Cautela Ativa',
      `Cautela ativa (${actualCautelaId}) editada dentro do prazo de 15 minutos pelo armeiro ${actor?.name || 'Armeiro'} (MASP: ${actor?.masp || ''}) — Arma: ${resolvedModel} Nº ${resolvedSerial} • Policial: ${resolvedReqName} (MASP: ${resolvedReqMasp}).`,
      actor,
      req.ip
    );

    return res.json({
      success: true,
      id: actualCautelaId,
      message: 'Cautela ativa atualizada com sucesso.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

apiRouter.put('/cautelas-armas/:id', handleUpdatePendingCautelaArma);
apiRouter.put('/cautelas-armas/:id/editar', handleUpdatePendingCautelaArma);
apiRouter.put('/cautelas-armas/:id/editar-ativa', handleUpdateActiveCautelaArma);
apiRouter.delete('/cautelas-armas/:id', handleCancelCautelaArma);
apiRouter.put('/cautelas-armas/:id/cancelar', handleCancelCautelaArma);

apiRouter.put('/cautelas-armas/:id/devolver', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      hadShots,
      shotsFired,
      isWorking,
      defectDescription,
      hadMalfunction,
      malfunctionDescription,
      returnedMagazinesCount,
      returnedAmmoQuantity,
      returnObservations,
      returnArmorerId,
      returnArmorerName,
      returnArmorerMasp,
      destinationVaultSpaceId,
      vaultSpaceId,
      pendingReceipt,
      actor
    } = req.body;

    const pool = getPool();
    await ensureCautelaReturnSchema(pool);

    const cautela = await findCautelaArmaRecord(pool, id, req.body);
    if (!cautela) {
      return res.status(404).json({ error: 'Cautela de arma não encontrada.' });
    }
    const actualCautelaId = cautela.ID_ACAUTELAR_ARMAS;

    const actorRole = actor?.activeRole || actor?.role || req.body.actorRole || '';
    const isPendingReceipt = Boolean(pendingReceipt || actorRole === 'Policial');
    const wasAlreadyReturned = String(cautela.STATUS_ACAUTELAR_ARMAS || '').trim().toUpperCase() === 'DEVOLVIDA';

    const armorer = actor || { id: returnArmorerId, name: returnArmorerName, masp: returnArmorerMasp };
    const condicoes = isWorking ? 'Condições de Uso' : 'Apresenta Defeito';
    const dbStoredShots = Math.max(0, parseInt(String(cautela.QUANTIDADE_TIROS_ACAUTELAR_ARMAS || 0), 10) || 0);
    const hasExplicitShotsBody = shotsFired !== undefined && shotsFired !== null && shotsFired !== '';
    const parsedBodyShots = hasExplicitShotsBody ? Math.max(0, parseInt(String(shotsFired), 10) || 0) : undefined;
    const effectiveHadShots =
      hadShots !== undefined
        ? Boolean(hadShots) || (parsedBodyShots !== undefined && parsedBodyShots > 0)
        : Boolean(cautela.HOUVE_TIROS_ACAUTELAR_ARMAS) || dbStoredShots > 0;
    const shots = effectiveHadShots
      ? (parsedBodyShots !== undefined ? parsedBodyShots : dbStoredShots)
      : 0;
    const mags = parseInt(String(returnedMagazinesCount ?? 1), 10);

    // Localiza cautela de munições vinculada (caso tenha)
    const explicitAmmoCautelaId = cautela.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS || req.body.linkedAmmoCautelaId || null;
    const cleanIdParam = (id || '').replace(/^caut-active-/, '').replace(/^caut-weapon-sync-/, '').replace(/^caut-sync-/, '').replace(/^caut-/, '');

    let linkedAmmoRow: any = null;
    if (explicitAmmoCautelaId) {
      const cleanAmmoId = String(explicitAmmoCautelaId).replace(/^caut-mun-/, '');
      const [directAmmoRows]: any = await pool.query(
        'SELECT * FROM ACAUTELAR_MUNICOES WHERE ID_ACAUTELAR_MUNICOES = ? OR ID_ACAUTELAR_MUNICOES = ? LIMIT 1',
        [explicitAmmoCautelaId, cleanAmmoId]
      );
      if (directAmmoRows && directAmmoRows.length > 0) {
        linkedAmmoRow = directAmmoRows[0];
      }
    }

    if (!linkedAmmoRow) {
      const [fallbackAmmoRows]: any = await pool.query(`
        SELECT * FROM ACAUTELAR_MUNICOES 
        WHERE (CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ? OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ? OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ? OR CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ?) 
          AND STATUS_ACAUTELAR_MUNICOES IN ('AUTORIZADA', 'DEVOLUCAO_PENDENTE') 
        ORDER BY DATA_CRIACAO_ACAUTELAR_MUNICOES DESC LIMIT 1
      `, [actualCautelaId, cautela.ARMA_ID_ACAUTELAR_ARMAS, id, cleanIdParam]);
      if (fallbackAmmoRows && fallbackAmmoRows.length > 0) {
        linkedAmmoRow = fallbackAmmoRows[0];
      }
    }

    const totalLinkedAmmo = linkedAmmoRow
      ? Number(linkedAmmoRow.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0)
      : Number(cautela.MUNICAO_QUANTIDADE_ACAUTELAR_ARMAS || 0);

    const forceReturnAmmo = Boolean(
      req.body.forceReturnAmmoToVault &&
      returnedAmmoQuantity !== undefined &&
      returnedAmmoQuantity !== null &&
      Number(returnedAmmoQuantity) > 0
    );

    const isAmmoPassivaDevolucao = forceReturnAmmo || (linkedAmmoRow
      ? Boolean(linkedAmmoRow.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES)
      : totalLinkedAmmo > 0
        ? (cautela.MUNICAO_SERA_DEVOLVIDA_ACAUTELAR_ARMAS !== undefined && cautela.MUNICAO_SERA_DEVOLVIDA_ACAUTELAR_ARMAS !== null
            ? Boolean(cautela.MUNICAO_SERA_DEVOLVIDA_ACAUTELAR_ARMAS)
            : (cautela.MUNICAO_DESTINACAO_ACAUTELAR_ARMAS || 'Defesa') !== 'Treinamento')
        : false);

    let resolvedReturnedAmmo: number | null = null;
    if ((linkedAmmoRow || totalLinkedAmmo > 0) && isAmmoPassivaDevolucao && totalLinkedAmmo > 0) {
      if (returnedAmmoQuantity !== undefined && returnedAmmoQuantity !== null && returnedAmmoQuantity !== '') {
        resolvedReturnedAmmo = Math.min(totalLinkedAmmo, Math.max(0, parseInt(String(returnedAmmoQuantity), 10) || 0));
      } else if (cautela.MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS !== undefined && cautela.MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS !== null) {
        resolvedReturnedAmmo = Math.min(totalLinkedAmmo, Math.max(0, Number(cautela.MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS)));
      } else {
        const ammoUsedFallback = Math.min(totalLinkedAmmo, Number(req.body.ammoUsedCount ?? (effectiveHadShots ? shots : 0)));
        resolvedReturnedAmmo = Math.max(0, totalLinkedAmmo - ammoUsedFallback);
      }
    }

    // =========================================================================
    // FLUXO 1: POLICIAL SOLICITA DEVOLUÇÃO -> FICA PENDENTE DE RECIBO PELO ARMEIRO
    // =========================================================================
    if (isPendingReceipt) {
      const obsClean = returnObservations ? returnObservations.trim() : null;

      try {
        await pool.query(`
          UPDATE ACAUTELAR_ARMAS SET
            STATUS_ACAUTELAR_ARMAS = 'DEVOLUCAO_PENDENTE',
            HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
            QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
            CONDICOES_USO_ACAUTELAR_ARMAS = ?,
            DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
            APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
            DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
            CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
            MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS = ?,
            OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
            DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
          WHERE ID_ACAUTELAR_ARMAS = ?
        `, [
          effectiveHadShots ? 1 : 0,
          shots,
          condicoes,
          defectDescription || null,
          hadMalfunction ? 1 : 0,
          malfunctionDescription || null,
          mags,
          resolvedReturnedAmmo,
          obsClean,
          actualCautelaId
        ]);
      } catch (_colErr) {
        await pool.query(`
          UPDATE ACAUTELAR_ARMAS SET
            STATUS_ACAUTELAR_ARMAS = 'DEVOLUCAO_PENDENTE',
            HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
            QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
            CONDICOES_USO_ACAUTELAR_ARMAS = ?,
            DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
            APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
            DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
            CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
            OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
            DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
          WHERE ID_ACAUTELAR_ARMAS = ?
        `, [
          effectiveHadShots ? 1 : 0,
          shots,
          condicoes,
          defectDescription || null,
          hadMalfunction ? 1 : 0,
          malfunctionDescription || null,
          mags,
          obsClean,
          actualCautelaId
        ]);
      }

      if (cautela.ARMA_ID_ACAUTELAR_ARMAS) {
        const pendingLocNote = `Devolução Pendente de Recibo pelo Armeiro — Policial: ${cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS} (MASP: ${cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS})`;
        try {
          await pool.query(
            `UPDATE ARMAS SET OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?`,
            [pendingLocNote, cautela.ARMA_ID_ACAUTELAR_ARMAS]
          );
        } catch (_) {}
      }

      if (
        linkedAmmoRow &&
        isAmmoPassivaDevolucao &&
        resolvedReturnedAmmo !== null &&
        linkedAmmoRow.STATUS_ACAUTELAR_MUNICOES !== 'DEVOLVIDA' &&
        linkedAmmoRow.STATUS_ACAUTELAR_MUNICOES !== 'CONSUMIDA'
      ) {
        try {
          await pool.query(
            `UPDATE ACAUTELAR_MUNICOES SET
               STATUS_ACAUTELAR_MUNICOES = 'DEVOLUCAO_PENDENTE',
               QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
               OBSERVACOES_ACAUTELAR_MUNICOES = CONCAT(COALESCE(OBSERVACOES_ACAUTELAR_MUNICOES, ''), CASE WHEN COALESCE(OBSERVACOES_ACAUTELAR_MUNICOES, '') = '' THEN '' ELSE ' | ' END, '[MODALIDADE_DEVOLUCAO: CONJUNTA_ARMA]'),
               DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
             WHERE ID_ACAUTELAR_MUNICOES = ?`,
            [resolvedReturnedAmmo, linkedAmmoRow.ID_ACAUTELAR_MUNICOES]
          );
        } catch (_) {}
      }

      const ammoLogPart = (linkedAmmoRow && isAmmoPassivaDevolucao && resolvedReturnedAmmo !== null)
        ? ` • Munições informadas para devolução: ${resolvedReturnedAmmo}/${totalLinkedAmmo} un.`
        : '';

      await insertAuditLog(
        'Armas',
        'Devolver',
        `Policial ${cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS} (MASP: ${cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS}) solicitou devolução da arma Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} (Tiros: ${shots}, Condição: ${condicoes}, Carregadores: ${mags}${ammoLogPart}). Aguardando recibo do Armeiro.`,
        actor || { id: cautela.REQUERENTE_ID_ACAUTELAR_ARMAS, name: cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS, masp: cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS, role: 'Policial' } as any,
        req.ip
      );

      return res.json({
        success: true,
        pendingReceipt: true,
        status: 'DEVOLUCAO_PENDENTE',
        message: 'Devolução registrada com sucesso! O armamento aguarda conferência e recibo pelo armeiro.'
      });
    }

    // =========================================================================
    // FLUXO 2: ARMEIRO CONFIRMA RECIBO DE DEVOLUÇÃO (OU DEVOLUÇÃO DIRETA)
    // =========================================================================
    const targetVaultId = destinationVaultSpaceId || vaultSpaceId || cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS;

    let targetVaultCode = '';
    if (targetVaultId) {
      try {
        const [vRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [targetVaultId]);
        if (vRows && vRows.length > 0) targetVaultCode = vRows[0].CODIGO_COFRES;
      } catch (e) {
        targetVaultCode = targetVaultId;
      }
    }

    let finalObs = returnObservations ? returnObservations.trim() : (cautela.OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS || '');
    if (targetVaultCode && targetVaultId !== cautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS && !finalObs.includes('Local alterado na devolução')) {
      finalObs = finalObs ? `${finalObs} | Local alterado na devolução: ${targetVaultCode}` : `Local alterado na devolução: ${targetVaultCode}`;
    }

    // 1. Atualiza registro da cautela como DEVOLVIDA com o cofre de retorno determinado pelo armeiro e dados técnicos
    try {
      await pool.query(`
        UPDATE ACAUTELAR_ARMAS SET
          STATUS_ACAUTELAR_ARMAS = 'DEVOLVIDA',
          DATA_DEVOLUCAO_ACAUTELAR_ARMAS = NOW(),
          COFRE_ORIGEM_ID_ACAUTELAR_ARMAS = COALESCE(?, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS),
          ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_ARMAS = ?,
          ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS = ?,
          ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS = ?,
          HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
          QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
          CONDICOES_USO_ACAUTELAR_ARMAS = ?,
          DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
          APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
          DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
          CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
          MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS = ?,
          OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
          DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
        WHERE ID_ACAUTELAR_ARMAS = ?
      `, [
        targetVaultId || null,
        armorer.id,
        armorer.name,
        armorer.masp,
        effectiveHadShots ? 1 : 0,
        shots,
        condicoes,
        defectDescription || null,
        hadMalfunction ? 1 : 0,
        malfunctionDescription || null,
        mags,
        resolvedReturnedAmmo,
        finalObs || null,
        actualCautelaId
      ]);
    } catch (_colErr) {
      await pool.query(`
        UPDATE ACAUTELAR_ARMAS SET
          STATUS_ACAUTELAR_ARMAS = 'DEVOLVIDA',
          DATA_DEVOLUCAO_ACAUTELAR_ARMAS = NOW(),
          COFRE_ORIGEM_ID_ACAUTELAR_ARMAS = COALESCE(?, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS),
          ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_ARMAS = ?,
          ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS = ?,
          ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS = ?,
          HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
          QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
          CONDICOES_USO_ACAUTELAR_ARMAS = ?,
          DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
          APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
          DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
          CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
          OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
          DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
        WHERE ID_ACAUTELAR_ARMAS = ?
      `, [
        targetVaultId || null,
        armorer.id,
        armorer.name,
        armorer.masp,
        effectiveHadShots ? 1 : 0,
        shots,
        condicoes,
        defectDescription || null,
        hadMalfunction ? 1 : 0,
        malfunctionDescription || null,
        mags,
        finalObs || null,
        actualCautelaId
      ]);
    }

    // 2. Localiza a arma correspondente na tabela ARMAS (por ID ou número de série)
    const rawWeaponId = String(cautela.ARMA_ID_ACAUTELAR_ARMAS || req.body.weaponId || '').trim();
    const cleanWeaponId = rawWeaponId
      .replace(/^caut-active-/, '')
      .replace(/^caut-weapon-sync-/, '')
      .replace(/^caut-sync-/, '')
      .replace(/^caut-arma-/, '')
      .replace(/^caut-/, '');
    const rawWeaponSerial = String(cautela.NUMERO_SERIE_ACAUTELAR_ARMAS || req.body.weaponSerialNumber || '').trim();

    let matchedWeaponRow: any = null;
    try {
      const [wLookup]: any = await pool.query(
        `SELECT ID_ARMAS, NUMERO_SERIE_ARMAS, COALESCE(TIROS_DISPARADOS_ARMAS, 0) AS currentShots
         FROM ARMAS
         WHERE (? <> '' AND ID_ARMAS = ?)
            OR (? <> '' AND ID_ARMAS = ?)
            OR (? <> '' AND UPPER(TRIM(NUMERO_SERIE_ARMAS)) = UPPER(TRIM(?)))
         LIMIT 1`,
        [
          rawWeaponId, rawWeaponId,
          cleanWeaponId, cleanWeaponId,
          rawWeaponSerial, rawWeaponSerial
        ]
      );
      if (wLookup && wLookup.length > 0) {
        matchedWeaponRow = wLookup[0];
      }
    } catch (_) {}

    const resolvedWeaponId = matchedWeaponRow?.ID_ARMAS || rawWeaponId || cleanWeaponId;
    const resolvedWeaponSerial = matchedWeaponRow?.NUMERO_SERIE_ARMAS || rawWeaponSerial;

    // 2a. Atualiza status e cofre da arma na tabela ARMAS
    const newStatus = !isWorking ? 'Manutenção' : 'No Cofre';
    try {
      await pool.query(
        `UPDATE ARMAS SET 
           STATUS_ARMAS = ?,
           COFRE_ID_ARMAS = ?,
           OBSERVACAO_LOCALIZACAO_ARMAS = NULL,
           POLICIAL_ACAUTELADO_ARMAS = NULL,
           LOCAL_ANTERIOR_COFRE_ID_ARMAS = ?
         WHERE ID_ARMAS = ?`,
        [newStatus, targetVaultId, targetVaultId, resolvedWeaponId]
      );
    } catch (_optColErr1) {
      try {
        await pool.query(
          `UPDATE ARMAS SET 
             STATUS_ARMAS = ?,
             COFRE_ID_ARMAS = ?,
             OBSERVACAO_LOCALIZACAO_ARMAS = NULL
           WHERE ID_ARMAS = ?`,
          [newStatus, targetVaultId, resolvedWeaponId]
        );
      } catch (_optColErr2) {
        await pool.query(
          `UPDATE ARMAS SET 
             STATUS_ARMAS = ?,
             COFRE_ID_ARMAS = ?
           WHERE ID_ARMAS = ?`,
          [newStatus, targetVaultId, resolvedWeaponId]
        );
      }
    }

    // 2b. Sempre que o armeiro receber uma arma que conste que teve tiros, soma em ARMAS.TIROS_DISPARADOS_ARMAS (de forma isolada e garantida)
    let shotsAddedToWeapon = 0;
    let newWeaponTotalShots: number | undefined = matchedWeaponRow
      ? Number(matchedWeaponRow.currentShots || 0)
      : undefined;

    if (!wasAlreadyReturned && effectiveHadShots && shots > 0) {
      let affectedShotsRows = 0;
      if (resolvedWeaponId) {
        const [updById]: any = await pool.query(
          `UPDATE ARMAS
           SET TIROS_DISPARADOS_ARMAS = COALESCE(TIROS_DISPARADOS_ARMAS, 0) + ?
           WHERE ID_ARMAS = ?`,
          [shots, resolvedWeaponId]
        );
        affectedShotsRows = Number(updById?.affectedRows || 0);
      }
      if (affectedShotsRows === 0 && resolvedWeaponSerial) {
        const [updBySerial]: any = await pool.query(
          `UPDATE ARMAS
           SET TIROS_DISPARADOS_ARMAS = COALESCE(TIROS_DISPARADOS_ARMAS, 0) + ?
           WHERE UPPER(TRIM(NUMERO_SERIE_ARMAS)) = UPPER(TRIM(?))`,
          [shots, resolvedWeaponSerial]
        );
        affectedShotsRows = Number(updBySerial?.affectedRows || 0);
      }

      if (affectedShotsRows > 0) {
        shotsAddedToWeapon = shots;
      }

      try {
        const [afterRows]: any = await pool.query(
          `SELECT COALESCE(TIROS_DISPARADOS_ARMAS, 0) AS totalShots
           FROM ARMAS
           WHERE (? <> '' AND ID_ARMAS = ?)
              OR (? <> '' AND UPPER(TRIM(NUMERO_SERIE_ARMAS)) = UPPER(TRIM(?)))
           LIMIT 1`,
          [resolvedWeaponId, resolvedWeaponId, resolvedWeaponSerial, resolvedWeaponSerial]
        );
        if (afterRows && afterRows.length > 0) {
          newWeaponTotalShots = Number(afterRows[0].totalShots || 0);
        } else if (newWeaponTotalShots !== undefined) {
          newWeaponTotalShots += shotsAddedToWeapon;
        }
      } catch (_) {}

      // Registra também no histórico de disparos da arma (REGISTROS_TIROS_ARMAS), caso a tabela exista
      try {
        const shotRegId = `shot-caut-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        await pool.query(
          `INSERT INTO REGISTROS_TIROS_ARMAS (
             ID_REGISTROS_TIROS, ARMA_ID, NUMERO_SERIE, QUANTIDADE_TIROS, MOTIVO, POLICIAL_NOME, POLICIAL_MASP, TOTAL_TIROS_APOS, DATA_REGISTRO
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            shotRegId,
            resolvedWeaponId || cautela.ARMA_ID_ACAUTELAR_ARMAS,
            resolvedWeaponSerial || cautela.NUMERO_SERIE_ACAUTELAR_ARMAS,
            shots,
            `Recebimento de Cautela #${String(actualCautelaId).slice(-8)} (Armeiro: ${armorer.name || 'Armaria'})`,
            cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS || 'Policial',
            cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS || '',
            newWeaponTotalShots ?? shots
          ]
        );
      } catch (_) {}
    }

    // 3. Processamento de Devolução das Munições Vinculadas (evita baixa duplicada caso munição já tenha sido devolvida separadamente)
    let ammoReturnedText = '';
    const wasLinkedAmmoAlreadyClosed = Boolean(
      linkedAmmoRow &&
      (linkedAmmoRow.STATUS_ACAUTELAR_MUNICOES === 'DEVOLVIDA' || linkedAmmoRow.STATUS_ACAUTELAR_MUNICOES === 'CONSUMIDA')
    );
    if (!wasLinkedAmmoAlreadyClosed && (linkedAmmoRow || totalLinkedAmmo > 0)) {
      const ammoCautela = linkedAmmoRow;
      if (isAmmoPassivaDevolucao) {
        const remainingAmmo = resolvedReturnedAmmo !== null ? resolvedReturnedAmmo : 0;
        const ammoUsed = Math.max(0, totalLinkedAmmo - remainingAmmo);
        const ammoDestVaultId = req.body.ammoDestinationVaultSpaceId || ammoCautela?.COFRE_ID_ACAUTELAR_MUNICOES || targetVaultId;

        let ammoVaultCode = '';
        let ammoDestDeptId = ammoCautela?.DEPARTAMENTO_ID_ACAUTELAR_MUNICOES || cautela.DEPARTAMENTO_ID_ACAUTELAR_ARMAS || null;
        let ammoDestUnitId = ammoCautela?.UNIDADE_ID_ACAUTELAR_MUNICOES || cautela.UNIDADE_ID_ACAUTELAR_ARMAS || null;
        if (ammoDestVaultId) {
          try {
            const [vRows]: any = await pool.query(
              'SELECT CODIGO_COFRES, DEPARTAMENTO_ID_COFRES, UNIDADE_ID_COFRES FROM COFRES WHERE ID_COFRES = ?',
              [ammoDestVaultId]
            );
            if (vRows && vRows.length > 0) {
              ammoVaultCode = vRows[0].CODIGO_COFRES || '';
              if (vRows[0].DEPARTAMENTO_ID_COFRES) ammoDestDeptId = vRows[0].DEPARTAMENTO_ID_COFRES;
              if (vRows[0].UNIDADE_ID_COFRES) ammoDestUnitId = vRows[0].UNIDADE_ID_COFRES;
            }
          } catch (e) {
            ammoVaultCode = ammoDestVaultId;
          }
        }

        // Resolve ID do calibre para evitar qualquer colisão no estoque do cofre de destino
        let resolvedCaliberId = ammoCautela?.CALIBRE_ID_ACAUTELAR_MUNICOES || req.body.ammoCaliberId || null;
        const rawCaliberName = (
          ammoCautela?.CALIBRE_NOME_ACAUTELAR_MUNICOES ||
          cautela.MUNICAO_CALIBRE_ACAUTELAR_ARMAS ||
          cautela.CALIBRE_ACAUTELAR_ARMAS ||
          ''
        ).trim();
        try {
          const [calRows]: any = await pool.query(
            `SELECT ID_CALIBRES FROM CALIBRES 
             WHERE (? IS NOT NULL AND ID_CALIBRES = ?) 
                OR (? <> '' AND LOWER(TRIM(NOME_CALIBRES)) = LOWER(TRIM(?))) 
             LIMIT 1`,
            [resolvedCaliberId, resolvedCaliberId, rawCaliberName, rawCaliberName]
          );
          if (calRows && calRows.length > 0) {
            resolvedCaliberId = calRows[0].ID_CALIBRES;
          }
        } catch (_) {}
        if (!resolvedCaliberId) {
          resolvedCaliberId = rawCaliberName || 'padrao';
        }

        // Baixa a cautela de munições vinculada registrando-a como DEVOLVIDA no sistema
        if (ammoCautela) {
          const prevObs = (ammoCautela.OBSERVACOES_ACAUTELAR_MUNICOES || '').trim();
          const returnSummaryObs = `Baixa automática na devolução da arma Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS}. Devolvidas: ${remainingAmmo} un. ao cofre ${ammoVaultCode || 'selecionado'} • Utilizadas/deflagradas: ${ammoUsed} un.`;
          const combinedAmmoObs = prevObs ? `${prevObs} | ${returnSummaryObs}` : returnSummaryObs;

          try {
            await pool.query(`
              UPDATE ACAUTELAR_MUNICOES SET
                STATUS_ACAUTELAR_MUNICOES = 'DEVOLVIDA',
                QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
                DATA_DEVOLUCAO_ACAUTELAR_MUNICOES = NOW(),
                ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_MUNICOES = ?,
                ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_MUNICOES = ?,
                COFRE_ID_ACAUTELAR_MUNICOES = COALESCE(?, COFRE_ID_ACAUTELAR_MUNICOES),
                OBSERVACOES_ACAUTELAR_MUNICOES = ?,
                DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
              WHERE ID_ACAUTELAR_MUNICOES = ?
            `, [
              remainingAmmo,
              armorer.id,
              armorer.name,
              ammoDestVaultId,
              combinedAmmoObs,
              ammoCautela.ID_ACAUTELAR_MUNICOES
            ]);
          } catch (_) {}
        }

        // Soma as munições devolvidas ao cofre de destino selecionado pelo armeiro
        if (remainingAmmo > 0 && ammoDestVaultId) {
          const ammoTipo = (ammoCautela?.TIPO_MUNICAO_ACAUTELAR_MUNICOES || cautela.MUNICAO_TIPO_ACAUTELAR_ARMAS || 'Operacional').trim();
          const ammoPeso = (ammoCautela?.PESO_MUNICAO_ACAUTELAR_MUNICOES || cautela.MUNICAO_PESO_ACAUTELAR_ARMAS || '').trim() || null;
          const ammoLote = (ammoCautela?.LOTE_MUNICAO_ACAUTELAR_MUNICOES || cautela.MUNICAO_LOTE_ACAUTELAR_ARMAS || '').trim();
          const ammoFab = (ammoCautela?.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES || cautela.MUNICAO_FABRICANTE_ACAUTELAR_ARMAS || 'CBC').trim();
          const ammoAno = ammoCautela?.ANO_FABRICACAO_ACAUTELAR_MUNICOES || null;
          const ammoDestinacao = (ammoCautela?.DESTINACAO_ACAUTELAR_MUNICOES || cautela.MUNICAO_DESTINACAO_ACAUTELAR_ARMAS || 'Defesa').trim();

          const normStr = (v: any) => String(v || '').trim().toLowerCase();
          const isGenericLot = !ammoLote || ['lote unidade', 'padrao', 'padrão', 'n/i'].includes(normStr(ammoLote));

          const [candidateStocks]: any = await pool.query(
            `SELECT * FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?`,
            [ammoDestVaultId, resolvedCaliberId]
          );
          const candidates: any[] = Array.isArray(candidateStocks) ? candidateStocks : [];

          let matchedStock = candidates.find(s =>
            normStr(s.LOTE_MUNICAO) === normStr(ammoLote) &&
            normStr(s.TIPO_MUNICAO) === normStr(ammoTipo) &&
            (!ammoPeso || !s.PESO_MUNICAO || normStr(s.PESO_MUNICAO) === normStr(ammoPeso))
          );
          if (!matchedStock && !isGenericLot) {
            matchedStock = candidates.find(s => normStr(s.LOTE_MUNICAO) === normStr(ammoLote));
          }
          if (!matchedStock && isGenericLot) {
            matchedStock = candidates.find(s => normStr(s.TIPO_MUNICAO) === normStr(ammoTipo)) || candidates[0];
          }

          if (matchedStock) {
            await pool.query(
              `UPDATE ESTOQUE_MUNICOES SET
                 QUANTIDADE_ESTOQUE_MUNICOES = QUANTIDADE_ESTOQUE_MUNICOES + ?,
                 DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
               WHERE ID_ESTOQUE_MUNICOES = ?`,
              [remainingAmmo, matchedStock.ID_ESTOQUE_MUNICOES]
            );
          } else {
            const newStockId = `stock-mun-ret-${Date.now()}`;
            try {
              await pool.query(`
                INSERT INTO ESTOQUE_MUNICOES (
                  ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES,
                  DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES,
                  QUANTIDADE_ESTOQUE_MUNICOES, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO,
                  FABRICANTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
                  DATA_ATUALIZACAO_ESTOQUE_MUNICOES
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
              `, [
                newStockId,
                resolvedCaliberId,
                ammoDestVaultId,
                ammoDestDeptId,
                ammoDestUnitId,
                remainingAmmo,
                ammoTipo,
                ammoPeso,
                ammoLote || 'Devolução',
                ammoFab,
                ammoAno,
                ammoDestinacao
              ]);
            } catch (_insErr) {
              await pool.query(`
                INSERT INTO ESTOQUE_MUNICOES (
                  ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES,
                  DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES,
                  QUANTIDADE_ESTOQUE_MUNICOES, TIPO_MUNICAO, LOTE_MUNICAO,
                  DATA_ATUALIZACAO_ESTOQUE_MUNICOES
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
              `, [
                newStockId,
                resolvedCaliberId,
                ammoDestVaultId,
                ammoDestDeptId,
                ammoDestUnitId,
                remainingAmmo,
                ammoTipo,
                ammoLote || 'Devolução'
              ]);
            }
          }

          // Registra a movimentação de entrada de devolução das munições no cofre de destino
          const movId = `ammomov-ret-${Date.now()}`;
          try {
            await pool.query(
              `INSERT INTO MOVIMENTACOES_MUNICOES 
               (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
                DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
                FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
                TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
                OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
               VALUES (?, 'Entrada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
              [
                movId,
                resolvedCaliberId,
                remainingAmmo,
                ammoDestDeptId,
                ammoDestUnitId,
                ammoDestVaultId,
                `Devolução de Cautela Conjunta - Arma ${cautela.MODELO_ACAUTELAR_ARMAS} (Devolvidas: ${remainingAmmo} un., Disparadas/Utilizadas: ${ammoUsed} un.)`,
                ammoFab || null,
                ammoTipo || null,
                ammoPeso || null,
                ammoLote || null,
                ammoAno,
                ammoDestinacao || null,
                cautela.REQUERENTE_ID_ACAUTELAR_ARMAS,
                cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS,
                cautela.REQUERENTE_MASP_ACAUTELAR_ARMAS,
                `Munições devolvidas recebidas e somadas ao cofre ${ammoVaultCode || 'selecionado'} pelo armeiro ${armorer.name}`,
                armorer.id,
                armorer.name
              ]
            );
          } catch (_) {}
        }
        ammoReturnedText = ` • Munições: ${remainingAmmo} devolvidas e somadas ao cofre ${ammoVaultCode || 'selecionado'} (${ammoUsed} utilizadas/disparadas) — Cautela de munição baixada como Devolvida.`;
      } else if (ammoCautela) {
        // Munição de retirada permanente (não passiva de devolução): encerra como CONSUMIDA sem devolver ao estoque
        try {
          await pool.query(`
            UPDATE ACAUTELAR_MUNICOES SET
              STATUS_ACAUTELAR_MUNICOES = 'CONSUMIDA',
              QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES = 0,
              DATA_DEVOLUCAO_ACAUTELAR_MUNICOES = NOW(),
              ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_MUNICOES = ?,
              ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_MUNICOES = ?,
              DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
            WHERE ID_ACAUTELAR_MUNICOES = ?
          `, [armorer.id, armorer.name, ammoCautela.ID_ACAUTELAR_MUNICOES]);
        } catch (_) {}
      }
    }

    const shotsLogPart = shotsAddedToWeapon > 0
      ? ` Tiros somados em ARMAS (TIROS_DISPARADOS_ARMAS): +${shotsAddedToWeapon}${newWeaponTotalShots !== undefined ? ` (Total acumulado: ${newWeaponTotalShots})` : ''}.`
      : ` Tiros: ${shots}.`;

    await insertAuditLog(
      'Armas',
      'Confirmar Recibo',
      `Recibo de devolução da arma Nº ${cautela.NUMERO_SERIE_ACAUTELAR_ARMAS} confirmado pelo armeiro ${armorer.name} (${cautela.REQUERENTE_NOME_ACAUTELAR_ARMAS}). Guardada no cofre: ${targetVaultCode || 'Padrão'}.${shotsLogPart} Condição: ${condicoes}. Panes: ${hadMalfunction ? 'Sim' : 'Não'}.${ammoReturnedText}`,
      armorer,
      req.ip
    );

    return res.json({ 
      success: true, 
      pendingReceipt: false,
      status: 'DEVOLVIDA',
      shotsAdded: shotsAddedToWeapon,
      newWeaponTotalShots,
      message: `Recibo de devolução confirmado com sucesso! Armamento guardado no cofre ${targetVaultCode || 'padrão'}.${ammoReturnedText}` 
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MODULO: CAUTELA DE MUNIÇÕES (ACAUTELAR_MUNICOES)
// =============================================================

apiRouter.get('/cautelas-municoes', async (req: Request, res: Response) => {
  try {
    const { userId, unitId, status } = req.query;
    const pool = getPool();

    let query = `
      SELECT 
        m.ID_ACAUTELAR_MUNICOES as id,
        m.CALIBRE_ID_ACAUTELAR_MUNICOES as caliberId,
        m.CALIBRE_NOME_ACAUTELAR_MUNICOES as caliberName,
        m.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES as quantity,
        m.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES as fabricante,
        m.TIPO_MUNICAO_ACAUTELAR_MUNICOES as tipoMunicao,
        m.PESO_MUNICAO_ACAUTELAR_MUNICOES as pesoMunicao,
        m.LOTE_MUNICAO_ACAUTELAR_MUNICOES as loteMunicao,
        m.ANO_FABRICACAO_ACAUTELAR_MUNICOES as anoFabricacao,
        m.DESTINACAO_ACAUTELAR_MUNICOES as destinacao,
        m.COFRE_ID_ACAUTELAR_MUNICOES as vaultSpaceId,
        m.DEPARTAMENTO_ID_ACAUTELAR_MUNICOES as departmentId,
        m.UNIDADE_ID_ACAUTELAR_MUNICOES as unitId,
        COALESCE(m.CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES, ca.ID_ACAUTELAR_ARMAS) as linkedWeaponCautelaId,
        ca.NUMERO_SERIE_ACAUTELAR_ARMAS as linkedWeaponSerialNumber,
        ca.ARMA_ID_ACAUTELAR_ARMAS as weaponId,
        ca.MODELO_ACAUTELAR_ARMAS as linkedWeaponModel,
        ca.TIPO_ARMA_ACAUTELAR_ARMAS as linkedWeaponType,
        ca.STATUS_ACAUTELAR_ARMAS as linkedWeaponStatus,
        ca.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS as linkedWeaponMagazineQty,
        ca.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS as linkedWeaponVaultSpaceId,
        ca.HOUVE_TIROS_ACAUTELAR_ARMAS as linkedWeaponHadShots,
        ca.QUANTIDADE_TIROS_ACAUTELAR_ARMAS as linkedWeaponShotsFired,
        ca.CONDICOES_USO_ACAUTELAR_ARMAS as linkedWeaponConditions,
        ca.DESCRICAO_DEFEITO_ACAUTELAR_ARMAS as linkedWeaponDefectDesc,
        ca.APRESENTOU_PANE_ACAUTELAR_ARMAS as linkedWeaponHadMalfunction,
        ca.DESCRICAO_PANE_ACAUTELAR_ARMAS as linkedWeaponMalfunctionDesc,
        ca.CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS as linkedWeaponReturnedMags,
        m.REQUERENTE_ID_ACAUTELAR_MUNICOES as requesterId,
        m.REQUERENTE_NOME_ACAUTELAR_MUNICOES as requesterName,
        m.REQUERENTE_MASP_ACAUTELAR_MUNICOES as requesterMasp,
        m.REQUERENTE_CARGO_ACAUTELAR_MUNICOES as requesterCargo,
        m.MOTIVO_USO_ACAUTELAR_MUNICOES as reason,
        m.DATA_SOLICITACAO_ACAUTELAR_MUNICOES as requestDate,
        m.STATUS_ACAUTELAR_MUNICOES as status,
        m.ARMEIRO_ID_ACAUTELAR_MUNICOES as armorerId,
        m.ARMEIRO_NOME_ACAUTELAR_MUNICOES as armorerName,
        m.ARMEIRO_MASP_ACAUTELAR_MUNICOES as armorerMasp,
        m.DATA_AUTORIZACAO_ACAUTELAR_MUNICOES as authorizedAt,
        m.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES as seraDevolvida,
        m.QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES as returnedQuantity,
        m.DATA_DEVOLUCAO_ACAUTELAR_MUNICOES as returnedAt,
        m.ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_MUNICOES as returnArmorerId,
        m.ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_MUNICOES as returnArmorerName,
        m.OBSERVACOES_ACAUTELAR_MUNICOES as observations,
        m.DATA_CRIACAO_ACAUTELAR_MUNICOES as createdAt,
        m.DATA_ATUALIZACAO_ACAUTELAR_MUNICOES as updatedAt
      FROM ACAUTELAR_MUNICOES m
      LEFT JOIN ACAUTELAR_ARMAS ca ON (m.CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES = ca.ID_ACAUTELAR_ARMAS OR m.ID_ACAUTELAR_MUNICOES = ca.CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS)
      WHERE COALESCE(m.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES, 0) > 0
    `;
    const params: any[] = [];

    if (userId) {
      query += ' AND m.REQUERENTE_ID_ACAUTELAR_MUNICOES = ?';
      params.push(userId);
    }
    if (unitId) {
      query += ' AND m.UNIDADE_ID_ACAUTELAR_MUNICOES = ?';
      params.push(unitId);
    }
    if (status) {
      query += ' AND m.STATUS_ACAUTELAR_MUNICOES = ?';
      params.push(status);
    }

    query += ' ORDER BY m.DATA_CRIACAO_ACAUTELAR_MUNICOES DESC';

    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      ...r,
      seraDevolvida: Boolean(r.seraDevolvida),
      quantity: Number(r.quantity || 0),
      returnedQuantity: r.returnedQuantity !== null && r.returnedQuantity !== undefined ? Number(r.returnedQuantity) : 0,
      linkedWeaponMagazineQty: r.linkedWeaponMagazineQty !== null && r.linkedWeaponMagazineQty !== undefined ? Number(r.linkedWeaponMagazineQty) : undefined,
      linkedWeaponHadShots: r.linkedWeaponHadShots !== null && r.linkedWeaponHadShots !== undefined ? Boolean(r.linkedWeaponHadShots) : undefined,
      linkedWeaponShotsFired: r.linkedWeaponShotsFired !== null && r.linkedWeaponShotsFired !== undefined ? Number(r.linkedWeaponShotsFired) : undefined,
      linkedWeaponHadMalfunction: r.linkedWeaponHadMalfunction !== null && r.linkedWeaponHadMalfunction !== undefined ? Boolean(r.linkedWeaponHadMalfunction) : undefined,
      linkedWeaponReturnedMags: r.linkedWeaponReturnedMags !== null && r.linkedWeaponReturnedMags !== undefined ? Number(r.linkedWeaponReturnedMags) : undefined
    }));

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/cautelas-municoes', async (req: Request, res: Response) => {
  try {
    const {
      stockId,
      caliberId,
      caliberName,
      quantity,
      fabricante,
      tipoMunicao,
      pesoMunicao,
      loteMunicao,
      anoFabricacao,
      destinacao,
      vaultSpaceId,
      departmentId,
      unitId,
      requesterId,
      requesterName,
      requesterMasp,
      requesterCargo,
      reason,
      seraDevolvida,
      directAuthorized,
      status,
      armorerId,
      armorerName,
      armorerMasp,
      actor
    } = req.body;

    const qty = parseInt(String(quantity || 0), 10);
    if (!caliberName || qty <= 0 || !requesterId) {
      return res.status(400).json({ error: 'Calibre, quantidade e dados do solicitante são obrigatórios.' });
    }

    const pool = getPool();
    const id = `caut-mun-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const isDirect = Boolean(directAuthorized || status === 'AUTORIZADA');
    const armorer = actor || (isDirect ? { id: armorerId, name: armorerName, masp: armorerMasp } : null);
    const initialStatus = isDirect ? 'AUTORIZADA' : 'PENDENTE';
    const isWillReturn = seraDevolvida !== undefined ? (seraDevolvida ? 1 : 0) : 1;

    let effectiveVaultId = vaultSpaceId || null;
    let resolvedStock: any = null;
    if (isDirect && stockId) {
      try {
        const [sRows]: any = await pool.query('SELECT * FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [stockId]);
        if (sRows && sRows.length > 0) {
          resolvedStock = sRows[0];
          effectiveVaultId = resolvedStock.COFRE_ID_ESTOQUE_MUNICOES || effectiveVaultId;
        }
      } catch (_) {}
    }

    const finalFab = resolvedStock?.FABRICANTE_MUNICAO || resolvedStock?.FABRICANTE_ESTOQUE_MUNICOES || fabricante || null;
    const finalTipo = resolvedStock?.TIPO_MUNICAO || resolvedStock?.TIPO_ESTOQUE_MUNICOES || tipoMunicao || 'Operacional';
    const finalPeso = resolvedStock?.PESO_MUNICAO || resolvedStock?.PESO_ESTOQUE_MUNICOES || pesoMunicao || null;
    const finalLote = resolvedStock?.LOTE_MUNICAO || resolvedStock?.LOTE_ESTOQUE_MUNICOES || loteMunicao || (isDirect ? 'Padrão' : null);
    const finalAno = resolvedStock?.ANO_FABRICACAO_MUNICAO || resolvedStock?.ANO_FABRICACAO_ESTOQUE_MUNICOES || anoFabricacao || null;
    const finalDest = destinacao || resolvedStock?.DESTINACAO_MUNICAO || resolvedStock?.DESTINACAO_ESTOQUE_MUNICOES || null;

    await pool.query(`
      INSERT INTO ACAUTELAR_MUNICOES (
        ID_ACAUTELAR_MUNICOES, CALIBRE_ID_ACAUTELAR_MUNICOES, CALIBRE_NOME_ACAUTELAR_MUNICOES,
        QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES, TIPO_MUNICAO_ACAUTELAR_MUNICOES, LOTE_MUNICAO_ACAUTELAR_MUNICOES,
        FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES, PESO_MUNICAO_ACAUTELAR_MUNICOES, ANO_FABRICACAO_ACAUTELAR_MUNICOES, DESTINACAO_ACAUTELAR_MUNICOES,
        COFRE_ID_ACAUTELAR_MUNICOES, DEPARTAMENTO_ID_ACAUTELAR_MUNICOES, UNIDADE_ID_ACAUTELAR_MUNICOES,
        REQUERENTE_ID_ACAUTELAR_MUNICOES, REQUERENTE_NOME_ACAUTELAR_MUNICOES,
        REQUERENTE_MASP_ACAUTELAR_MUNICOES, REQUERENTE_CARGO_ACAUTELAR_MUNICOES, MOTIVO_USO_ACAUTELAR_MUNICOES,
        DATA_SOLICITACAO_ACAUTELAR_MUNICOES, STATUS_ACAUTELAR_MUNICOES, SERA_DEVOLVIDA_ACAUTELAR_MUNICOES,
        ARMEIRO_ID_ACAUTELAR_MUNICOES, ARMEIRO_NOME_ACAUTELAR_MUNICOES, ARMEIRO_MASP_ACAUTELAR_MUNICOES, DATA_AUTORIZACAO_ACAUTELAR_MUNICOES,
        DATA_CRIACAO_ACAUTELAR_MUNICOES
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ${isDirect ? 'NOW()' : 'NULL'}, NOW())
    `, [
      id,
      caliberId || resolvedStock?.CALIBRE_ID_ESTOQUE_MUNICOES || null,
      caliberName,
      qty,
      finalTipo,
      finalLote,
      finalFab,
      finalPeso,
      finalAno,
      finalDest,
      effectiveVaultId,
      departmentId || null,
      unitId || null,
      requesterId,
      requesterName,
      requesterMasp,
      requesterCargo || null,
      reason || (isWillReturn ? 'Uso em serviço policial operacional' : 'Baixa Definitiva (Não retornará ao cofre)'),
      initialStatus,
      isWillReturn,
      isDirect && armorer ? armorer.id : null,
      isDirect && armorer ? armorer.name : null,
      isDirect && armorer ? armorer.masp : null
    ]);

    // Se autorizada diretamente pelo Armeiro, subtrai imediatamente do cofre referido e registra movimentação
    if (isDirect && (stockId || effectiveVaultId)) {
      if (stockId) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE ID_ESTOQUE_MUNICOES = ?
        `, [qty, stockId]);
      } else if (effectiveVaultId) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE COFRE_ID_ESTOQUE_MUNICOES = ? 
            AND (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR ? IS NULL)
          LIMIT 1
        `, [qty, effectiveVaultId, caliberId, caliberId]);
      }

      const movId = `ammomov-caut-${Date.now()}`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId, caliberId || resolvedStock?.CALIBRE_ID_ESTOQUE_MUNICOES || 'padrao', qty, departmentId || null, unitId || null, effectiveVaultId || 'COFRE_PADRAO',
          `Cautela de Munição - Policial ${requesterName} (MASP ${requesterMasp}) [${isWillReturn ? 'Com Retorno' : 'Baixa Definitiva'}]`,
          finalFab, finalTipo, finalPeso, finalLote, finalAno, finalDest,
          requesterId, requesterName, requesterMasp,
          `Cautela direta autorizada pelo armeiro ${armorer?.name || ''}`,
          armorer?.id || requesterId, armorer?.name || requesterName
        ]
      );
    }

    await insertAuditLog(
      'Munições',
      isDirect ? 'Acautelamento Direto' : 'Solicitar',
      `${isDirect ? 'Armeiro acautelou diretamente' : 'Policial solicitou cautela de'} ${qty} munições calibre ${caliberName} [${finalTipo || 'Operacional'}${finalPeso ? ` - ${finalPeso}` : ''}] para ${requesterName}${isWillReturn ? '' : ' (Baixa Definitiva)'}`,
      armorer || { id: requesterId, name: requesterName, masp: requesterMasp, role: 'Policial' } as any,
      req.ip
    );

    return res.json({ success: true, id, status: initialStatus });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/cautelas-municoes/:id/autorizar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { armorerId, armorerName, armorerMasp, vaultSpaceId, stockId, seraDevolvida, notes, actor } = req.body;
    const pool = getPool();

    const cautela = await findCautelaMunicaoRecord(pool, id, req.body);
    if (!cautela) {
      return res.status(404).json({ error: 'Cautela de munições não encontrada.' });
    }

    const wasAlreadyAuthorized = cautela.STATUS_ACAUTELAR_MUNICOES === 'AUTORIZADA';
    const actualAmmoId = cautela.ID_ACAUTELAR_MUNICOES;
    const armorer = actor || { id: armorerId, name: armorerName, masp: armorerMasp };
    let effectiveVaultId = vaultSpaceId || cautela.COFRE_ID_ACAUTELAR_MUNICOES;
    const qty = Number(cautela.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0);
    const seraDev = seraDevolvida !== undefined ? (seraDevolvida ? 1 : 0) : (cautela.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES !== undefined ? cautela.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES : 1);

    let stockDetails: any = null;
    if (stockId) {
      const [stockRes]: any = await pool.query('SELECT * FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?', [stockId]);
      if (stockRes && stockRes.length > 0) {
        stockDetails = stockRes[0];
        effectiveVaultId = stockDetails.COFRE_ID_ESTOQUE_MUNICOES || effectiveVaultId;
      }
    }

    const stLote = stockDetails?.LOTE_MUNICAO || stockDetails?.LOTE_ESTOQUE_MUNICOES || null;
    const stFab = stockDetails?.FABRICANTE_MUNICAO || stockDetails?.FABRICANTE_ESTOQUE_MUNICOES || null;
    const stTipo = stockDetails?.TIPO_MUNICAO || stockDetails?.TIPO_ESTOQUE_MUNICOES || null;
    const stPeso = stockDetails?.PESO_MUNICAO || stockDetails?.PESO_ESTOQUE_MUNICOES || null;
    const stAno = stockDetails?.ANO_FABRICACAO_MUNICAO || stockDetails?.ANO_FABRICACAO_ESTOQUE_MUNICOES || null;
    const stDest = stockDetails?.DESTINACAO_MUNICAO || stockDetails?.DESTINACAO_ESTOQUE_MUNICOES || null;

    // 1. Autoriza na tabela ACAUTELAR_MUNICOES
    await pool.query(`
      UPDATE ACAUTELAR_MUNICOES SET
        STATUS_ACAUTELAR_MUNICOES = 'AUTORIZADA',
        ARMEIRO_ID_ACAUTELAR_MUNICOES = ?,
        ARMEIRO_NOME_ACAUTELAR_MUNICOES = ?,
        ARMEIRO_MASP_ACAUTELAR_MUNICOES = ?,
        COFRE_ID_ACAUTELAR_MUNICOES = COALESCE(?, COFRE_ID_ACAUTELAR_MUNICOES),
        LOTE_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, LOTE_MUNICAO_ACAUTELAR_MUNICOES),
        FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES),
        TIPO_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, TIPO_MUNICAO_ACAUTELAR_MUNICOES),
        PESO_MUNICAO_ACAUTELAR_MUNICOES = COALESCE(?, PESO_MUNICAO_ACAUTELAR_MUNICOES),
        ANO_FABRICACAO_ACAUTELAR_MUNICOES = COALESCE(?, ANO_FABRICACAO_ACAUTELAR_MUNICOES),
        DESTINACAO_ACAUTELAR_MUNICOES = COALESCE(?, DESTINACAO_ACAUTELAR_MUNICOES),
        SERA_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
        OBSERVACOES_ACAUTELAR_MUNICOES = COALESCE(?, OBSERVACOES_ACAUTELAR_MUNICOES),
        DATA_AUTORIZACAO_ACAUTELAR_MUNICOES = NOW(),
        DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
      WHERE ID_ACAUTELAR_MUNICOES = ?
    `, [
      armorer.id, armorer.name, armorer.masp,
      effectiveVaultId,
      stLote,
      stFab,
      stTipo,
      stPeso,
      stAno,
      stDest,
      seraDev,
      notes || null,
      actualAmmoId
    ]);

    // 2. Sempre que confirmada pelo armeiro para retirada, subtrai do referido cofre (evitando duplicidade se já autorizada)
    if (!wasAlreadyAuthorized && qty > 0) {
      if (stockId) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE ID_ESTOQUE_MUNICOES = ?
        `, [qty, stockId]);
      } else if (effectiveVaultId) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = GREATEST(0, QUANTIDADE_ESTOQUE_MUNICOES - ?),
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE COFRE_ID_ESTOQUE_MUNICOES = ? 
            AND (CALIBRE_ID_ESTOQUE_MUNICOES = ? OR ? IS NULL)
          LIMIT 1
        `, [qty, effectiveVaultId, cautela.CALIBRE_ID_ACAUTELAR_MUNICOES, cautela.CALIBRE_ID_ACAUTELAR_MUNICOES]);
      }

      // 3. Registra em MOVIMENTACOES_MUNICOES para histórico completo do cofre
      const movId = `ammomov-caut-${Date.now()}`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Saída', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId,
          stockDetails?.CALIBRE_ID_ESTOQUE_MUNICOES || cautela.CALIBRE_ID_ACAUTELAR_MUNICOES || 'padrao',
          qty,
          cautela.DEPARTAMENTO_ID_ACAUTELAR_MUNICOES || null,
          cautela.UNIDADE_ID_ACAUTELAR_MUNICOES || null,
          effectiveVaultId || 'COFRE_PADRAO',
          `Cautela de Munição - Policial ${cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES} (MASP ${cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES}) - ${seraDev ? 'Irá devolver' : 'Retirada permanente'}`,
          stFab || cautela.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES || null,
          stTipo || cautela.TIPO_MUNICAO_ACAUTELAR_MUNICOES || null,
          stPeso || cautela.PESO_MUNICAO_ACAUTELAR_MUNICOES || null,
          stLote || cautela.LOTE_MUNICAO_ACAUTELAR_MUNICOES || null,
          stAno || cautela.ANO_FABRICACAO_ACAUTELAR_MUNICOES || null,
          stDest || cautela.DESTINACAO_ACAUTELAR_MUNICOES || null,
          cautela.REQUERENTE_ID_ACAUTELAR_MUNICOES,
          cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES,
          cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES,
          `Autorizado pelo armeiro ${armorer.name} (${armorer.masp})`,
          armorer.id,
          armorer.name
        ]
      );
    }

    await insertAuditLog(
      'Munições',
      'Aprovar',
      `Armeiro ${armorer.name} (MASP ${armorer.masp}) autorizou retirada de ${qty} munições calibre ${cautela.CALIBRE_NOME_ACAUTELAR_MUNICOES} para ${cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES}`,
      armorer,
      req.ip
    );

    return res.json({ success: true, message: 'Cautela de munições autorizada com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/cautelas-municoes/:id/recusar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { armorerId, armorerName, armorerMasp, notes, actor } = req.body;
    const pool = getPool();
    const armorer = actor || { id: armorerId, name: armorerName, masp: armorerMasp };

    const cautela = await findCautelaMunicaoRecord(pool, id, req.body);
    const actualAmmoId = cautela?.ID_ACAUTELAR_MUNICOES || id;

    await pool.query(`
      UPDATE ACAUTELAR_MUNICOES SET
        STATUS_ACAUTELAR_MUNICOES = 'RECUSADA',
        ARMEIRO_ID_ACAUTELAR_MUNICOES = ?,
        ARMEIRO_NOME_ACAUTELAR_MUNICOES = ?,
        ARMEIRO_MASP_ACAUTELAR_MUNICOES = ?,
        OBSERVACOES_ACAUTELAR_MUNICOES = ?,
        DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
      WHERE ID_ACAUTELAR_MUNICOES = ?
    `, [armorer.id, armorer.name, armorer.masp, notes || null, actualAmmoId]);

    await insertAuditLog(
      'Munições',
      'Recusar',
      `Armeiro ${armorer.name} (MASP ${armorer.masp}) recusou solicitação de munições ${cautela ? `(${cautela.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES} un. ${cautela.CALIBRE_NOME_ACAUTELAR_MUNICOES})` : ''}`,
      armorer,
      req.ip
    );

    return res.json({ success: true, message: 'Solicitação de cautela de munições recusada.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/cautelas-municoes/:id/devolver', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      returnedQuantity,
      destinationVaultSpaceId,
      ammoDestinationVaultSpaceId,
      weaponDestinationVaultSpaceId,
      vaultSpaceId,
      returnArmorerId,
      returnArmorerName,
      returnArmorerMasp,
      observations,
      pendingReceipt,
      returnWithWeapon,
      hadShots,
      shotsFired,
      isWorking,
      defectDescription,
      hadMalfunction,
      malfunctionDescription,
      returnedMagazinesCount,
      actor
    } = req.body;

    const pool = getPool();
    const cautela = await findCautelaMunicaoRecord(pool, id, req.body);
    if (!cautela) {
      return res.status(404).json({ error: 'Cautela de munição não encontrada.' });
    }

    const actualAmmoId = cautela.ID_ACAUTELAR_MUNICOES;
    const actorRole = actor?.activeRole || actor?.role || '';
    const isPendingReceipt = Boolean(pendingReceipt) || actorRole === 'Policial';
    const armorer = actor || { id: returnArmorerId, name: returnArmorerName, masp: returnArmorerMasp };

    const totalQty = Number(cautela.QUANTIDADE_SOLICITADA_ACAUTELAR_MUNICOES || 0);
    const returnedQty = Math.min(totalQty, Math.max(0, parseInt(String(returnedQuantity ?? cautela.QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES ?? 0), 10) || 0));
    const consumedQty = Math.max(0, totalQty - returnedQty);

    // Localiza cautela de arma vinculada (caso exista)
    let linkedWeaponCautela: any = null;
    try {
      const [wCautRows]: any = await pool.query(
        `SELECT * FROM ACAUTELAR_ARMAS
         WHERE (? IS NOT NULL AND ID_ACAUTELAR_ARMAS = ?)
            OR CAUTELA_MUNICAO_ID_ACAUTELAR_ARMAS = ?
         ORDER BY DATA_CRIACAO_ACAUTELAR_ARMAS DESC
         LIMIT 1`,
        [
          cautela.CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES || null,
          cautela.CAUTELA_ARMA_ID_ACAUTELAR_MUNICOES || null,
          actualAmmoId
        ]
      );
      if (wCautRows && wCautRows.length > 0) {
        linkedWeaponCautela = wCautRows[0];
      }
    } catch (_) {}

    const wantsJointWeaponReturn = Boolean(returnWithWeapon && linkedWeaponCautela);

    // =========================================================================
    // FLUXO 1: POLICIAL SOLICITA DEVOLUÇÃO -> AGUARDANDO DEVOLUÇÃO PELO ARMEIRO
    // =========================================================================
    if (isPendingReceipt) {
      const cleanUserObs = String(observations || '')
        .replace(/\[MODALIDADE_DEVOLUCAO:[^\]]*\]/g, '')
        .trim();
      const modeTag = linkedWeaponCautela
        ? (wantsJointWeaponReturn ? '[MODALIDADE_DEVOLUCAO: CONJUNTA_ARMA]' : '[MODALIDADE_DEVOLUCAO: SOMENTE_MUNICAO]')
        : '';
      const pendingObs = [cleanUserObs, modeTag].filter(Boolean).join(' | ') || null;

      await pool.query(`
        UPDATE ACAUTELAR_MUNICOES SET
          STATUS_ACAUTELAR_MUNICOES = 'DEVOLUCAO_PENDENTE',
          QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
          OBSERVACOES_ACAUTELAR_MUNICOES = ?,
          DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
        WHERE ID_ACAUTELAR_MUNICOES = ?
      `, [returnedQty, pendingObs, actualAmmoId]);

      if (wantsJointWeaponReturn && linkedWeaponCautela && linkedWeaponCautela.STATUS_ACAUTELAR_ARMAS !== 'DEVOLVIDA') {
        const shots = Math.max(0, parseInt(String(shotsFired ?? 0), 10) || 0);
        const effectiveHadShots = Boolean(hadShots) || shots > 0;
        const weaponWorking = isWorking !== undefined ? Boolean(isWorking) : true;
        const condicoes = weaponWorking ? 'Em perfeitas condições' : 'Com defeito / avaria';
        const mags = returnedMagazinesCount !== undefined && returnedMagazinesCount !== null
          ? Math.max(0, parseInt(String(returnedMagazinesCount), 10) || 0)
          : Number(linkedWeaponCautela.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS || 0);

        try {
          await pool.query(`
            UPDATE ACAUTELAR_ARMAS SET
              STATUS_ACAUTELAR_ARMAS = 'DEVOLUCAO_PENDENTE',
              HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
              QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
              CONDICOES_USO_ACAUTELAR_ARMAS = ?,
              DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
              APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
              DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
              CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
              MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS = ?,
              OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
              DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
            WHERE ID_ACAUTELAR_ARMAS = ?
          `, [
            effectiveHadShots ? 1 : 0,
            shots,
            condicoes,
            defectDescription || null,
            hadMalfunction ? 1 : 0,
            malfunctionDescription || null,
            mags,
            returnedQty,
            cleanUserObs || null,
            linkedWeaponCautela.ID_ACAUTELAR_ARMAS
          ]);
        } catch (_colErr) {
          await pool.query(`
            UPDATE ACAUTELAR_ARMAS SET
              STATUS_ACAUTELAR_ARMAS = 'DEVOLUCAO_PENDENTE',
              HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
              QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
              CONDICOES_USO_ACAUTELAR_ARMAS = ?,
              DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
              APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
              DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
              CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
              OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
              DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
            WHERE ID_ACAUTELAR_ARMAS = ?
          `, [
            effectiveHadShots ? 1 : 0,
            shots,
            condicoes,
            defectDescription || null,
            hadMalfunction ? 1 : 0,
            malfunctionDescription || null,
            mags,
            cleanUserObs || null,
            linkedWeaponCautela.ID_ACAUTELAR_ARMAS
          ]);
        }

        if (linkedWeaponCautela.ARMA_ID_ACAUTELAR_ARMAS) {
          const pendingLocNote = `Devolução Conjunta Pendente de Recibo pelo Armeiro — Policial: ${cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES} (MASP: ${cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES})`;
          try {
            await pool.query(
              `UPDATE ARMAS SET OBSERVACAO_LOCALIZACAO_ARMAS = ? WHERE ID_ARMAS = ?`,
              [pendingLocNote, linkedWeaponCautela.ARMA_ID_ACAUTELAR_ARMAS]
            );
          } catch (_) {}
        }
      }

      await insertAuditLog(
        'Munições',
        'Devolver',
        `Policial ${cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES} (MASP ${cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES}) solicitou devolução de ${returnedQty}/${totalQty} munições calibre ${cautela.CALIBRE_NOME_ACAUTELAR_MUNICOES}${wantsJointWeaponReturn && linkedWeaponCautela ? ` em conjunto com a arma Nº ${linkedWeaponCautela.NUMERO_SERIE_ACAUTELAR_ARMAS}` : ''}. Aguardando recebimento do Armeiro.`,
        actor || { id: cautela.REQUERENTE_ID_ACAUTELAR_MUNICOES, name: cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES, masp: cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES, role: 'Policial' } as any,
        req.ip
      );

      return res.json({
        success: true,
        pendingReceipt: true,
        status: 'DEVOLUCAO_PENDENTE',
        message: 'Solicitação de devolução registrada e encaminhada para conferência do Armeiro.'
      });
    }

    // =========================================================================
    // FLUXO 2: ARMEIRO CONFIRMA DEVOLUÇÃO (COM OU SEM ARMA EM CONJUNTO)
    // =========================================================================
    const wasAmmoAlreadyClosed =
      cautela.STATUS_ACAUTELAR_MUNICOES === 'DEVOLVIDA' ||
      cautela.STATUS_ACAUTELAR_MUNICOES === 'CONSUMIDA';

    const finalStatus = Boolean(cautela.SERA_DEVOLVIDA_ACAUTELAR_MUNICOES) || returnedQty > 0 ? 'DEVOLVIDA' : 'CONSUMIDA';
    const targetAmmoVaultId =
      ammoDestinationVaultSpaceId ||
      destinationVaultSpaceId ||
      vaultSpaceId ||
      cautela.COFRE_ID_ACAUTELAR_MUNICOES;

    let targetAmmoVaultCode = '';
    let ammoDestDeptId = cautela.DEPARTAMENTO_ID_ACAUTELAR_MUNICOES || null;
    let ammoDestUnitId = cautela.UNIDADE_ID_ACAUTELAR_MUNICOES || null;
    if (targetAmmoVaultId) {
      try {
        const [vRows]: any = await pool.query(
          'SELECT CODIGO_COFRES, DEPARTAMENTO_ID_COFRES, UNIDADE_ID_COFRES FROM COFRES WHERE ID_COFRES = ?',
          [targetAmmoVaultId]
        );
        if (vRows && vRows.length > 0) {
          targetAmmoVaultCode = vRows[0].CODIGO_COFRES || '';
          if (vRows[0].DEPARTAMENTO_ID_COFRES) ammoDestDeptId = vRows[0].DEPARTAMENTO_ID_COFRES;
          if (vRows[0].UNIDADE_ID_COFRES) ammoDestUnitId = vRows[0].UNIDADE_ID_COFRES;
        }
      } catch (_) {
        targetAmmoVaultCode = targetAmmoVaultId;
      }
    }

    const basePrevObs = String(observations ?? cautela.OBSERVACOES_ACAUTELAR_MUNICOES ?? '')
      .replace(/\[MODALIDADE_DEVOLUCAO:[^\]]*\]/g, '')
      .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
      .trim();

    const obsParts: string[] = [];
    if (basePrevObs) obsParts.push(basePrevObs);
    if (consumedQty > 0 && !basePrevObs.includes('Munições deflagradas/utilizadas:')) {
      obsParts.push(`Munições deflagradas/utilizadas: ${consumedQty} un.`);
    }
    if (targetAmmoVaultCode && !basePrevObs.includes('Devolvidas ao cofre:')) {
      obsParts.push(`Devolvidas ao cofre: ${targetAmmoVaultCode}`);
    }
    if (wantsJointWeaponReturn && linkedWeaponCautela) {
      obsParts.push(`Devolução conjunta com arma ${linkedWeaponCautela.MODELO_ACAUTELAR_ARMAS || ''} Nº ${linkedWeaponCautela.NUMERO_SERIE_ACAUTELAR_ARMAS || ''}`);
    }
    const finalObs = obsParts.join(' | ');

    // 1. Atualiza registro da cautela de munição como DEVOLVIDA / CONSUMIDA
    await pool.query(`
      UPDATE ACAUTELAR_MUNICOES SET
        STATUS_ACAUTELAR_MUNICOES = ?,
        QUANTIDADE_DEVOLVIDA_ACAUTELAR_MUNICOES = ?,
        DATA_DEVOLUCAO_ACAUTELAR_MUNICOES = NOW(),
        ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_MUNICOES = ?,
        ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_MUNICOES = ?,
        COFRE_ID_ACAUTELAR_MUNICOES = COALESCE(?, COFRE_ID_ACAUTELAR_MUNICOES),
        OBSERVACOES_ACAUTELAR_MUNICOES = ?,
        DATA_ATUALIZACAO_ACAUTELAR_MUNICOES = NOW()
      WHERE ID_ACAUTELAR_MUNICOES = ?
    `, [
      finalStatus,
      returnedQty,
      armorer.id,
      armorer.name,
      targetAmmoVaultId,
      finalObs || null,
      actualAmmoId
    ]);

    // 2. Sempre que devolvida pelo armeiro, a munição remanescente retorna para o referido cofre
    if (!wasAmmoAlreadyClosed && returnedQty > 0 && targetAmmoVaultId) {
      let resolvedCaliberId = cautela.CALIBRE_ID_ACAUTELAR_MUNICOES || null;
      const rawCaliberName = (cautela.CALIBRE_NOME_ACAUTELAR_MUNICOES || '').trim();
      try {
        const [calRows]: any = await pool.query(
          `SELECT ID_CALIBRES FROM CALIBRES 
           WHERE (? IS NOT NULL AND ID_CALIBRES = ?) 
              OR (? <> '' AND LOWER(TRIM(NOME_CALIBRES)) = LOWER(TRIM(?))) 
           LIMIT 1`,
          [resolvedCaliberId, resolvedCaliberId, rawCaliberName, rawCaliberName]
        );
        if (calRows && calRows.length > 0) {
          resolvedCaliberId = calRows[0].ID_CALIBRES;
        }
      } catch (_) {}
      if (!resolvedCaliberId) {
        resolvedCaliberId = rawCaliberName || 'padrao';
      }

      const ammoTipo = (cautela.TIPO_MUNICAO_ACAUTELAR_MUNICOES || 'Operacional').trim();
      const ammoPeso = (cautela.PESO_MUNICAO_ACAUTELAR_MUNICOES || '').trim() || null;
      const ammoLote = (cautela.LOTE_MUNICAO_ACAUTELAR_MUNICOES || '').trim();
      const ammoFab = (cautela.FABRICANTE_MUNICAO_ACAUTELAR_MUNICOES || 'CBC').trim();
      const ammoAno = cautela.ANO_FABRICACAO_ACAUTELAR_MUNICOES || null;
      const ammoDestinacao = (cautela.DESTINACAO_ACAUTELAR_MUNICOES || 'Defesa').trim();

      const normStr = (v: any) => String(v || '').trim().toLowerCase();
      const isGenericLot = !ammoLote || ['lote unidade', 'padrao', 'padrão', 'n/i', 'devolução'].includes(normStr(ammoLote));

      const [candidateStocks]: any = await pool.query(
        `SELECT * FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?`,
        [targetAmmoVaultId, resolvedCaliberId]
      );
      const candidates: any[] = Array.isArray(candidateStocks) ? candidateStocks : [];

      let matchedStock = candidates.find(s =>
        normStr(s.LOTE_MUNICAO) === normStr(ammoLote) &&
        normStr(s.TIPO_MUNICAO) === normStr(ammoTipo) &&
        (!ammoPeso || !s.PESO_MUNICAO || normStr(s.PESO_MUNICAO) === normStr(ammoPeso))
      );
      if (!matchedStock && !isGenericLot) {
        matchedStock = candidates.find(s => normStr(s.LOTE_MUNICAO) === normStr(ammoLote));
      }
      if (!matchedStock && isGenericLot) {
        matchedStock = candidates.find(s => normStr(s.TIPO_MUNICAO) === normStr(ammoTipo)) || candidates[0];
      }

      if (matchedStock) {
        await pool.query(`
          UPDATE ESTOQUE_MUNICOES SET
            QUANTIDADE_ESTOQUE_MUNICOES = QUANTIDADE_ESTOQUE_MUNICOES + ?,
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW()
          WHERE ID_ESTOQUE_MUNICOES = ?
        `, [returnedQty, matchedStock.ID_ESTOQUE_MUNICOES]);
      } else {
        const newStockId = `stock-mun-ret-${Date.now()}`;
        await pool.query(`
          INSERT INTO ESTOQUE_MUNICOES (
            ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES,
            DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES,
            QUANTIDADE_ESTOQUE_MUNICOES, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO,
            FABRICANTE_MUNICAO, DESTINACAO_MUNICAO,
            DATA_ATUALIZACAO_ESTOQUE_MUNICOES
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          newStockId,
          resolvedCaliberId,
          targetAmmoVaultId,
          ammoDestDeptId,
          ammoDestUnitId,
          returnedQty,
          ammoTipo,
          ammoPeso,
          ammoLote || 'Devolução',
          ammoFab,
          ammoDestinacao
        ]);
      }

      // Registra a movimentação de entrada no cofre de munições
      const movId = `ammomov-ret-${Date.now()}`;
      await pool.query(
        `INSERT INTO MOVIMENTACOES_MUNICOES 
         (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, 
          DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
          FABRICANTE_MUNICAO, TIPO_MUNICAO, PESO_MUNICAO, LOTE_MUNICAO, ANO_FABRICACAO_MUNICAO, DESTINACAO_MUNICAO,
          TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, 
          OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
         VALUES (?, 'Entrada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId,
          resolvedCaliberId,
          returnedQty,
          ammoDestDeptId,
          ammoDestUnitId,
          targetAmmoVaultId,
          `Devolução de Cautela de Munição - Policial ${cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES} (MASP ${cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES})`,
          ammoFab || null,
          ammoTipo || null,
          ammoPeso || null,
          ammoLote || null,
          ammoAno,
          ammoDestinacao || null,
          cautela.REQUERENTE_ID_ACAUTELAR_MUNICOES,
          cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES,
          cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES,
          `Devolução conferida e recebida pelo armeiro ${armorer.name} (${armorer.masp})`,
          armorer.id,
          armorer.name
        ]
      );
    }

    // 3. Caso a arma vinculada seja devolvida em conjunto, baixa ambas as cautelas, retorna arma ao cofre selecionado e soma tiros em ARMAS.TIROS_DISPARADOS_ARMAS
    let shotsAddedToWeapon = 0;
    let newWeaponTotalShots: number | undefined = undefined;
    if (wantsJointWeaponReturn && linkedWeaponCautela) {
      const wasWeaponAlreadyReturned = linkedWeaponCautela.STATUS_ACAUTELAR_ARMAS === 'DEVOLVIDA';
      const targetWeaponVaultId =
        weaponDestinationVaultSpaceId ||
        linkedWeaponCautela.COFRE_ORIGEM_ID_ACAUTELAR_ARMAS ||
        targetAmmoVaultId;

      const shots = shotsFired !== undefined && shotsFired !== null
        ? Math.max(0, parseInt(String(shotsFired), 10) || 0)
        : Math.max(0, Number(linkedWeaponCautela.QUANTIDADE_TIROS_ACAUTELAR_ARMAS || 0));
      const effectiveHadShots =
        hadShots !== undefined
          ? Boolean(hadShots) || shots > 0
          : Boolean(linkedWeaponCautela.HOUVE_TIROS_ACAUTELAR_ARMAS) || shots > 0;
      const weaponWorking =
        isWorking !== undefined
          ? Boolean(isWorking)
          : !(String(linkedWeaponCautela.CONDICOES_USO_ACAUTELAR_ARMAS || '').toLowerCase().includes('defeito'));
      const condicoes = weaponWorking ? 'Em perfeitas condições' : 'Com defeito / avaria';
      const defectDesc = defectDescription !== undefined ? (defectDescription || null) : (linkedWeaponCautela.DESCRICAO_DEFEITO_ACAUTELAR_ARMAS || null);
      const hadMalf = hadMalfunction !== undefined ? Boolean(hadMalfunction) : Boolean(linkedWeaponCautela.APRESENTOU_PANE_ACAUTELAR_ARMAS);
      const malfDesc = malfunctionDescription !== undefined ? (malfunctionDescription || null) : (linkedWeaponCautela.DESCRICAO_PANE_ACAUTELAR_ARMAS || null);
      const mags = returnedMagazinesCount !== undefined && returnedMagazinesCount !== null
        ? Math.max(0, parseInt(String(returnedMagazinesCount), 10) || 0)
        : Number(linkedWeaponCautela.CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS ?? linkedWeaponCautela.QUANTIDADE_CARREGADORES_ACAUTELAR_ARMAS ?? 0);

      let weaponVaultCode = '';
      if (targetWeaponVaultId) {
        try {
          const [wvRows]: any = await pool.query('SELECT CODIGO_COFRES FROM COFRES WHERE ID_COFRES = ?', [targetWeaponVaultId]);
          if (wvRows && wvRows.length > 0) weaponVaultCode = wvRows[0].CODIGO_COFRES || '';
        } catch (_) {}
      }

      const weaponObs = [
        basePrevObs || linkedWeaponCautela.OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS || '',
        `Devolução conjunta confirmada no módulo de munições${weaponVaultCode ? ` (Cofre Arma: ${weaponVaultCode})` : ''}`
      ].filter(Boolean).join(' | ');

      try {
        await pool.query(`
          UPDATE ACAUTELAR_ARMAS SET
            STATUS_ACAUTELAR_ARMAS = 'DEVOLVIDA',
            DATA_DEVOLUCAO_ACAUTELAR_ARMAS = NOW(),
            COFRE_ORIGEM_ID_ACAUTELAR_ARMAS = COALESCE(?, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS),
            ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_ARMAS = ?,
            ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS = ?,
            ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS = ?,
            HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
            QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
            CONDICOES_USO_ACAUTELAR_ARMAS = ?,
            DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
            APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
            DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
            CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
            MUNICAO_DEVOLVIDA_ACAUTELAR_ARMAS = ?,
            OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
            DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
          WHERE ID_ACAUTELAR_ARMAS = ?
        `, [
          targetWeaponVaultId || null,
          armorer.id,
          armorer.name,
          armorer.masp,
          effectiveHadShots ? 1 : 0,
          shots,
          condicoes,
          defectDesc,
          hadMalf ? 1 : 0,
          malfDesc,
          mags,
          returnedQty,
          weaponObs || null,
          linkedWeaponCautela.ID_ACAUTELAR_ARMAS
        ]);
      } catch (_colErr) {
        await pool.query(`
          UPDATE ACAUTELAR_ARMAS SET
            STATUS_ACAUTELAR_ARMAS = 'DEVOLVIDA',
            DATA_DEVOLUCAO_ACAUTELAR_ARMAS = NOW(),
            COFRE_ORIGEM_ID_ACAUTELAR_ARMAS = COALESCE(?, COFRE_ORIGEM_ID_ACAUTELAR_ARMAS),
            ARMEIRO_RECEBIMENTO_ID_ACAUTELAR_ARMAS = ?,
            ARMEIRO_RECEBIMENTO_NOME_ACAUTELAR_ARMAS = ?,
            ARMEIRO_RECEBIMENTO_MASP_ACAUTELAR_ARMAS = ?,
            HOUVE_TIROS_ACAUTELAR_ARMAS = ?,
            QUANTIDADE_TIROS_ACAUTELAR_ARMAS = ?,
            CONDICOES_USO_ACAUTELAR_ARMAS = ?,
            DESCRICAO_DEFEITO_ACAUTELAR_ARMAS = ?,
            APRESENTOU_PANE_ACAUTELAR_ARMAS = ?,
            DESCRICAO_PANE_ACAUTELAR_ARMAS = ?,
            CARREGADORES_DEVOLVIDOS_ACAUTELAR_ARMAS = ?,
            OBSERVACOES_DEVOLUCAO_ACAUTELAR_ARMAS = ?,
            DATA_ATUALIZACAO_ACAUTELAR_ARMAS = NOW()
          WHERE ID_ACAUTELAR_ARMAS = ?
        `, [
          targetWeaponVaultId || null,
          armorer.id,
          armorer.name,
          armorer.masp,
          effectiveHadShots ? 1 : 0,
          shots,
          condicoes,
          defectDesc,
          hadMalf ? 1 : 0,
          malfDesc,
          mags,
          weaponObs || null,
          linkedWeaponCautela.ID_ACAUTELAR_ARMAS
        ]);
      }

      const rawWeaponId = String(linkedWeaponCautela.ARMA_ID_ACAUTELAR_ARMAS || '').trim();
      const cleanWeaponId = rawWeaponId
        .replace(/^caut-active-/, '')
        .replace(/^caut-weapon-sync-/, '')
        .replace(/^caut-sync-/, '')
        .replace(/^caut-arma-/, '')
        .replace(/^caut-/, '');
      const rawWeaponSerial = String(linkedWeaponCautela.NUMERO_SERIE_ACAUTELAR_ARMAS || '').trim();

      let matchedWeaponRow: any = null;
      try {
        const [wLookup]: any = await pool.query(
          `SELECT ID_ARMAS, NUMERO_SERIE_ARMAS, COALESCE(TIROS_DISPARADOS_ARMAS, 0) AS currentShots
           FROM ARMAS
           WHERE (? <> '' AND ID_ARMAS = ?)
              OR (? <> '' AND ID_ARMAS = ?)
              OR (? <> '' AND UPPER(TRIM(NUMERO_SERIE_ARMAS)) = UPPER(TRIM(?)))
           LIMIT 1`,
          [rawWeaponId, rawWeaponId, cleanWeaponId, cleanWeaponId, rawWeaponSerial, rawWeaponSerial]
        );
        if (wLookup && wLookup.length > 0) matchedWeaponRow = wLookup[0];
      } catch (_) {}

      const resolvedWeaponId = matchedWeaponRow?.ID_ARMAS || rawWeaponId || cleanWeaponId;
      const resolvedWeaponSerial = matchedWeaponRow?.NUMERO_SERIE_ARMAS || rawWeaponSerial;
      const newWeaponStatus = !weaponWorking ? 'Manutenção' : 'No Cofre';

      if (resolvedWeaponId) {
        try {
          await pool.query(
            `UPDATE ARMAS SET
               STATUS_ARMAS = ?,
               COFRE_ID_ARMAS = ?,
               OBSERVACAO_LOCALIZACAO_ARMAS = NULL,
               POLICIAL_ACAUTELADO_ARMAS = NULL,
               LOCAL_ANTERIOR_COFRE_ID_ARMAS = ?
             WHERE ID_ARMAS = ?`,
            [newWeaponStatus, targetWeaponVaultId, targetWeaponVaultId, resolvedWeaponId]
          );
        } catch (_wUpdErr1) {
          try {
            await pool.query(
              `UPDATE ARMAS SET
                 STATUS_ARMAS = ?,
                 COFRE_ID_ARMAS = ?,
                 OBSERVACAO_LOCALIZACAO_ARMAS = NULL
               WHERE ID_ARMAS = ?`,
              [newWeaponStatus, targetWeaponVaultId, resolvedWeaponId]
            );
          } catch (_wUpdErr2) {
            await pool.query(
              `UPDATE ARMAS SET STATUS_ARMAS = ?, COFRE_ID_ARMAS = ? WHERE ID_ARMAS = ?`,
              [newWeaponStatus, targetWeaponVaultId, resolvedWeaponId]
            );
          }
        }
      }

      if (!wasWeaponAlreadyReturned && effectiveHadShots && shots > 0) {
        let affectedShotsRows = 0;
        if (resolvedWeaponId) {
          const [updById]: any = await pool.query(
            `UPDATE ARMAS
             SET TIROS_DISPARADOS_ARMAS = COALESCE(TIROS_DISPARADOS_ARMAS, 0) + ?
             WHERE ID_ARMAS = ?`,
            [shots, resolvedWeaponId]
          );
          affectedShotsRows = Number(updById?.affectedRows || 0);
        }
        if (affectedShotsRows === 0 && resolvedWeaponSerial) {
          const [updBySerial]: any = await pool.query(
            `UPDATE ARMAS
             SET TIROS_DISPARADOS_ARMAS = COALESCE(TIROS_DISPARADOS_ARMAS, 0) + ?
             WHERE UPPER(TRIM(NUMERO_SERIE_ARMAS)) = UPPER(TRIM(?))`,
            [shots, resolvedWeaponSerial]
          );
          affectedShotsRows = Number(updBySerial?.affectedRows || 0);
        }
        if (affectedShotsRows > 0) {
          shotsAddedToWeapon = shots;
        }

        try {
          const [afterRows]: any = await pool.query(
            `SELECT COALESCE(TIROS_DISPARADOS_ARMAS, 0) AS totalShots
             FROM ARMAS
             WHERE (? <> '' AND ID_ARMAS = ?)
                OR (? <> '' AND UPPER(TRIM(NUMERO_SERIE_ARMAS)) = UPPER(TRIM(?)))
             LIMIT 1`,
            [resolvedWeaponId, resolvedWeaponId, resolvedWeaponSerial, resolvedWeaponSerial]
          );
          if (afterRows && afterRows.length > 0) {
            newWeaponTotalShots = Number(afterRows[0].totalShots || 0);
          }
        } catch (_) {}

        try {
          const shotRegId = `shot-caut-mun-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          await pool.query(
            `INSERT INTO REGISTROS_TIROS_ARMAS (
               ID_REGISTROS_TIROS, ARMA_ID, NUMERO_SERIE, QUANTIDADE_TIROS, MOTIVO, POLICIAL_NOME, POLICIAL_MASP, TOTAL_TIROS_APOS, DATA_REGISTRO
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              shotRegId,
              resolvedWeaponId || linkedWeaponCautela.ARMA_ID_ACAUTELAR_ARMAS,
              resolvedWeaponSerial || linkedWeaponCautela.NUMERO_SERIE_ACAUTELAR_ARMAS,
              shots,
              `Devolução conjunta Cautela #${String(linkedWeaponCautela.ID_ACAUTELAR_ARMAS).slice(-8)} (Armeiro: ${armorer.name || 'Armaria'})`,
              cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES || 'Policial',
              cautela.REQUERENTE_MASP_ACAUTELAR_MUNICOES || '',
              newWeaponTotalShots ?? shots
            ]
          );
        } catch (_) {}
      }

      await insertAuditLog(
        'Armas',
        'Devolver',
        `Armeiro ${armorer.name} confirmou recebimento conjunto da arma ${linkedWeaponCautela.MODELO_ACAUTELAR_ARMAS || ''} Nº ${linkedWeaponCautela.NUMERO_SERIE_ACAUTELAR_ARMAS || ''} ao cofre ${weaponVaultCode || targetWeaponVaultId || 'selecionado'}${shotsAddedToWeapon > 0 ? ` (+${shotsAddedToWeapon} tiros somados em TIROS_DISPARADOS_ARMAS)` : ''}.`,
        armorer,
        req.ip
      );
    }

    await insertAuditLog(
      'Munições',
      'Devolver',
      `Devolução de cautela de munição ${cautela.CALIBRE_NOME_ACAUTELAR_MUNICOES}: ${returnedQty} unidades retornadas ao cofre ${targetAmmoVaultCode || ''} (${consumedQty} deflagradas) por ${cautela.REQUERENTE_NOME_ACAUTELAR_MUNICOES}${wantsJointWeaponReturn ? ' [Baixa conjunta com armamento]' : ''}`,
      armorer,
      req.ip
    );

    return res.json({
      success: true,
      shotsAddedToWeapon,
      newWeaponTotalShots,
      message: wantsJointWeaponReturn
        ? 'Devolução conjunta de armamento e munições concluída com sucesso!'
        : 'Devolução de munições concluída!'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});








