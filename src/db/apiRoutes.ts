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
      `INSERT INTO audit_logs (id, module, action, details, user_id, user_name, user_masp, user_role, ip_address, timestamp)
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

// -------------------------------------------------------------
// AUTH & USER SESSIONS
// -------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { maspDigits, passwordDigits } = req.body;
    const cleanMasp = (maspDigits || '').replace(/\D/g, '');
    const cleanPass = (passwordDigits || '').trim();

    let rows: any;
    let pool;
    try {
      pool = getPool();
      [rows] = await pool.query('SELECT * FROM users WHERE masp = ?', [cleanMasp]);
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
    const isHashMatch = dbUser.password === hashedInput;
    const isPlainMatch = dbUser.password === cleanPass;

    if (!isHashMatch && !isPlainMatch) {
      return res.status(400).json({ success: false, error: 'Senha incorreta.' });
    }

    // Auto-encrypt legacy plain text password on successful login
    if (isPlainMatch && !isHashMatch) {
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedInput, dbUser.id]);
    }

    // Get user courses
    const [courses]: any = await pool.query('SELECT course_id as courseId, completion_date as completionDate, expiration_date as expirationDate FROM user_courses WHERE user_id = ?', [dbUser.id]);

    const formattedUser = {
      id: dbUser.id,
      masp: dbUser.masp,
      name: dbUser.name,
      phone: dbUser.phone || '',
      cargo: dbUser.cargo,
      role: dbUser.role,
      departmentId: dbUser.department_id || '',
      unitId: dbUser.unit_id || '',
      canMoveAmmunition: Boolean(dbUser.can_move_ammo),
      canMoveWeapons: Boolean(dbUser.can_move_weapons),
      hasSystemAccess: Boolean(dbUser.has_system_access),
      mustChangePassword: Boolean(dbUser.must_change_password),
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
    const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const user = rows[0];
    if (cleanPass === user.masp) {
      return res.status(400).json({ success: false, error: 'A nova senha não pode ser igual ao MASP.' });
    }

    const hashedNewPass = hashPassword(cleanPass);
    await pool.query('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [hashedNewPass, userId]);

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
    const [rows]: any = await pool.query('SELECT id, name, code, created_at as createdAt FROM departments ORDER BY created_at ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/departments', async (req: Request, res: Response) => {
  try {
    const { name, code, actor } = req.body;
    const pool = getPool();
    const id = `dept-${Date.now()}`;
    await pool.query(
      'INSERT INTO departments (id, name, code, created_at) VALUES (?, ?, ?, NOW())',
      [id, name, code || '']
    );

    await insertAuditLog('Unidade', 'Criar', `Criado departamento: ${name} (${code})`, actor, req.ip);
    return res.json({ id, name, code, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/departments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, actor } = req.body;
    const pool = getPool();
    await pool.query('UPDATE departments SET name = ?, code = ? WHERE id = ?', [name, code, id]);

    await insertAuditLog('Unidade', 'Editar', `Atualizado departamento: ${name}`, actor, req.ip);
    return res.json({ id, name, code });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/departments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [deptRows]: any = await pool.query('SELECT * FROM departments WHERE id = ?', [id]);
    if (!deptRows || deptRows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    const [units]: any = await pool.query('SELECT COUNT(*) as cnt FROM units WHERE department_id = ?', [id]);
    if (units[0].cnt > 0) {
      return res.status(400).json({
        error: `Não é possível excluir o departamento "${deptRows[0].name}" porque existem ${units[0].cnt} unidade(s) vinculada(s) a ele.`
      });
    }

    await pool.query('DELETE FROM departments WHERE id = ?', [id]);
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
    const [rows]: any = await pool.query('SELECT id, name, department_id as departmentId, created_at as createdAt FROM units ORDER BY created_at ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/units', async (req: Request, res: Response) => {
  try {
    const { name, departmentId, actor } = req.body;
    const pool = getPool();
    const id = `unit-${Date.now()}`;
    await pool.query(
      'INSERT INTO units (id, department_id, name, created_at) VALUES (?, ?, ?, NOW())',
      [id, departmentId || null, name]
    );

    await insertAuditLog('Unidade', 'Criar', `Criada unidade: ${name}`, actor, req.ip);
    return res.json({ id, name, departmentId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/units/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, departmentId, actor } = req.body;
    const pool = getPool();
    await pool.query('UPDATE units SET name = ?, department_id = ? WHERE id = ?', [name, departmentId || null, id]);

    await insertAuditLog('Unidade', 'Editar', `Atualizada unidade: ${name}`, actor, req.ip);
    return res.json({ id, name, departmentId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/units/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [unitRows]: any = await pool.query('SELECT * FROM units WHERE id = ?', [id]);
    if (!unitRows || unitRows.length === 0) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }

    const [usersCnt]: any = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE unit_id = ?', [id]);
    const [weapsCnt]: any = await pool.query('SELECT COUNT(*) as cnt FROM weapons WHERE unit_id = ?', [id]);

    if (usersCnt[0].cnt > 0 || weapsCnt[0].cnt > 0) {
      return res.status(400).json({
        error: `Não é possível excluir a unidade "${unitRows[0].name}" pois possui ${usersCnt[0].cnt} policial(is) e ${weapsCnt[0].cnt} arma(s) cadastrada(s).`
      });
    }

    await pool.query('DELETE FROM units WHERE id = ?', [id]);
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
    const [users]: any = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
    const [userCourses]: any = await pool.query('SELECT * FROM user_courses');

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
        departmentId: u.department_id || '',
        unitId: u.unit_id || '',
        canMoveAmmunition: Boolean(u.can_move_ammo),
        canMoveWeapons: Boolean(u.can_move_weapons),
        hasSystemAccess: Boolean(u.has_system_access),
        mustChangePassword: Boolean(u.must_change_password),
        isTeacher: Boolean(u.is_teacher),
        teacherSubject: u.teacher_subject || undefined,
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
    const { masp, name, phone, cargo, role, departmentId, unitId, canMoveAmmunition, canMoveWeapons, hasSystemAccess, isTeacher, teacherSubject, courses, actor } = req.body;
    const cleanMasp = (masp || '').replace(/\D/g, '');

    const pool = getPool();
    const [existing]: any = await pool.query('SELECT id FROM users WHERE masp = ?', [cleanMasp]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe um usuário cadastrado com o MASP ${cleanMasp}` });
    }

    const id = `usr-${Date.now()}`;
    const hashedDefaultPass = hashPassword(cleanMasp);
    await pool.query(
      `INSERT INTO users (id, masp, password, name, phone, cargo, role, department_id, unit_id, can_move_ammo, can_move_weapons, has_system_access, is_teacher, teacher_subject, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        id,
        cleanMasp,
        hashedDefaultPass, // Encrypted default password = MASP hash
        name,
        phone || null,
        cargo,
        role,
        departmentId || null,
        unitId || null,
        canMoveAmmunition ? 1 : 0,
        canMoveWeapons ? 1 : 0,
        hasSystemAccess ? 1 : 0,
        isTeacher ? 1 : 0,
        teacherSubject || null
      ]
    );

    if (Array.isArray(courses)) {
      for (const c of courses) {
        if (c.courseId) {
          const ucId = `uc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await pool.query(
            'INSERT INTO user_courses (id, user_id, course_id, completion_date, expiration_date) VALUES (?, ?, ?, ?, ?)',
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

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const actor = req.body.actor;

    const pool = getPool();
    const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const userMasp = rows[0].masp;

    if (updates.resetPassword) {
      const hashedMasp = hashPassword(userMasp);
      await pool.query(
        'UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?',
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

    await pool.query(
      `UPDATE users SET
        masp = ?,
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        cargo = COALESCE(?, cargo),
        role = COALESCE(?, role),
        department_id = COALESCE(?, department_id),
        unit_id = COALESCE(?, unit_id),
        can_move_ammo = COALESCE(?, can_move_ammo),
        can_move_weapons = COALESCE(?, can_move_weapons),
        has_system_access = COALESCE(?, has_system_access),
        is_teacher = COALESCE(?, is_teacher),
        teacher_subject = COALESCE(?, teacher_subject)
       WHERE id = ?`,
      [
        cleanMasp,
        updates.name ?? null,
        updates.phone ?? null,
        updates.cargo ?? null,
        updates.role ?? null,
        updates.departmentId ?? null,
        updates.unitId ?? null,
        updates.canMoveAmmunition !== undefined ? (updates.canMoveAmmunition ? 1 : 0) : null,
        updates.canMoveWeapons !== undefined ? (updates.canMoveWeapons ? 1 : 0) : null,
        updates.hasSystemAccess !== undefined ? (updates.hasSystemAccess ? 1 : 0) : null,
        updates.isTeacher !== undefined ? (updates.isTeacher ? 1 : 0) : null,
        updates.teacherSubject !== undefined ? updates.teacherSubject : null,
        id
      ]
    );

    if (Array.isArray(updates.courses)) {
      await pool.query('DELETE FROM user_courses WHERE user_id = ?', [id]);
      for (const c of updates.courses) {
        if (c.courseId) {
          const ucId = `uc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await pool.query(
            'INSERT INTO user_courses (id, user_id, course_id, completion_date, expiration_date) VALUES (?, ?, ?, ?, ?)',
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

    const [users]: any = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const [activeLoans]: any = await pool.query(
      `SELECT * FROM weapon_movements WHERE requester_id = ? AND status IN ('Em Trânsito', 'Pendente Recibo', 'Pendente Aprovação')`,
      [id]
    );

    if (activeLoans && activeLoans.length > 0) {
      return res.status(400).json({
        error: `Não é possível excluir o policial ${users[0].name} pois ele possui solicitação ou armamento ativo em cautela.`
      });
    }

    await pool.query('DELETE FROM user_courses WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM users WHERE id = ?', [id]);

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
    const [rows]: any = await pool.query('SELECT id, name, models, created_at as createdAt FROM available_weapon_types ORDER BY name ASC');
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
    const [existing]: any = await pool.query('SELECT id FROM available_weapon_types WHERE id = ?', [finalId]);
    if (existing && existing.length > 0) {
      await pool.query(
        'UPDATE available_weapon_types SET name = ?, models = ? WHERE id = ?',
        [cleanName, JSON.stringify(modelsArr), finalId]
      );
      await insertAuditLog('Armas', 'Editar', `Atualizado tipo de arma disponível: ${cleanName}`, actor, req.ip);
    } else {
      await pool.query(
        'INSERT INTO available_weapon_types (id, name, models, created_at) VALUES (?, ?, ?, NOW())',
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

    await pool.query('DELETE FROM available_weapon_types WHERE id = ?', [id]);
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
    const [rows]: any = await pool.query('SELECT * FROM courses');
    const mapped = (rows || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      allowedWeaponTypes: typeof c.allowed_weapon_types === 'string' ? JSON.parse(c.allowed_weapon_types) : (c.allowed_weapon_types || []),
      allowedModels: typeof c.allowed_models === 'string' ? JSON.parse(c.allowed_models) : (c.allowed_models || []),
      allowedCalibers: typeof c.allowed_calibers === 'string' ? JSON.parse(c.allowed_calibers) : (c.allowed_calibers || []),
      shotsPerStudent: Number(c.shots_per_student) || 0,
      shotsPerWeaponType: typeof c.shots_per_weapon_type === 'string' ? JSON.parse(c.shots_per_weapon_type) : (c.shots_per_weapon_type || {}),
      departmentId: c.department_id || c.departmentId || '',
      createdAt: c.created_at || c.createdAt
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

    const executeSave = async () => {
      const [existing]: any = await pool.query('SELECT id FROM courses WHERE id = ?', [finalId]);

      if (existing && existing.length > 0) {
        await pool.query(
          'UPDATE courses SET name = ?, allowed_weapon_types = ?, allowed_models = ?, allowed_calibers = ?, shots_per_student = ?, shots_per_weapon_type = ?, department_id = ? WHERE id = ?',
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
          'INSERT INTO courses (id, name, allowed_weapon_types, allowed_models, allowed_calibers, shots_per_student, shots_per_weapon_type, department_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
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
    };

    try {
      await executeSave();
    } catch (saveErr: any) {
      // If error is caused by missing column, dynamically add columns and retry
      if (saveErr.message && (saveErr.message.includes('allowed_weapon_types') || saveErr.message.includes('shots_per_weapon_type') || saveErr.message.includes('Unknown column'))) {
        try { await pool.query('ALTER TABLE courses ADD COLUMN allowed_weapon_types JSON DEFAULT NULL;'); } catch (e) {}
        try { await pool.query('ALTER TABLE courses ADD COLUMN shots_per_weapon_type JSON DEFAULT NULL;'); } catch (e) {}
        try { await pool.query('ALTER TABLE courses ADD COLUMN shots_per_student INT DEFAULT 0;'); } catch (e) {}
        await executeSave(); // Retry after ALTER
      } else {
        throw saveErr;
      }
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

    const [enrolled]: any = await pool.query('SELECT COUNT(*) as cnt FROM user_courses WHERE course_id = ?', [id]);
    if (enrolled[0].cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir o curso pois ele está vinculado a ${enrolled[0].cnt} policial(is).` });
    }

    await pool.query('DELETE FROM courses WHERE id = ?', [id]);
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
    const [rows]: any = await pool.query('SELECT id, code, type, department_id as departmentId, unit_id as unitId, created_at as createdAt FROM vault_spaces ORDER BY created_at ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/vault-spaces', async (req: Request, res: Response) => {
  try {
    const { code, type, departmentId, unitId, actor } = req.body;
    const pool = getPool();
    const id = `vault-${Date.now()}`;
    await pool.query(
      'INSERT INTO vault_spaces (id, code, type, department_id, unit_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, code, type, departmentId || null, unitId || null]
    );

    await insertAuditLog('Cofre', 'Criar', `Criado local de guarda: ${code} (${type})`, actor, req.ip);
    return res.json({ id, code, type, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/vault-spaces/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, type, departmentId, unitId, actor } = req.body;
    const pool = getPool();

    await pool.query(
      'UPDATE vault_spaces SET code = ?, type = ?, department_id = ?, unit_id = ? WHERE id = ?',
      [code, type, departmentId || null, unitId || null, id]
    );

    await insertAuditLog('Cofre', 'Editar', `Atualizado local de guarda no cofre: ${code} (${type})`, actor, req.ip);
    return res.json({ id, code, type, departmentId, unitId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/vault-spaces/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [weaps]: any = await pool.query("SELECT COUNT(*) as cnt FROM weapons WHERE vault_space_id = ? AND status = 'No Cofre'", [id]);
    const [ammos]: any = await pool.query('SELECT COUNT(*) as cnt FROM ammo_stocks WHERE vault_space_id = ? AND quantity > 0', [id]);

    if (weaps[0].cnt > 0 || ammos[0].cnt > 0) {
      return res.status(400).json({ error: 'Não é possível excluir o local do cofre pois há armas ou munições armazenadas nele.' });
    }

    await pool.query('DELETE FROM vault_spaces WHERE id = ?', [id]);
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
    const [rows]: any = await pool.query('SELECT id, name, created_at as createdAt FROM calibers ORDER BY name ASC');
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/calibers', async (req: Request, res: Response) => {
  try {
    const { name, actor } = req.body;
    const cleanName = (name || '').trim();
    const pool = getPool();

    const [existing]: any = await pool.query('SELECT id FROM calibers WHERE LOWER(name) = LOWER(?)', [cleanName]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Este calibre já está cadastrado.' });
    }

    const id = `cal-${Date.now()}`;
    await pool.query('INSERT INTO calibers (id, name, created_at) VALUES (?, ?, NOW())', [id, cleanName]);

    await insertAuditLog('Munições', 'Criar', `Cadastrado calibre: ${cleanName}`, actor, req.ip);
    return res.json({ id, name: cleanName, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/calibers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    const [calRows]: any = await pool.query('SELECT * FROM calibers WHERE id = ?', [id]);
    if (!calRows || calRows.length === 0) {
      return res.status(404).json({ error: 'Calibre não encontrado' });
    }

    const caliberName = calRows[0].name;
    const [weaps]: any = await pool.query('SELECT COUNT(*) as cnt FROM weapons WHERE LOWER(caliber) = LOWER(?)', [caliberName]);
    const [stocks]: any = await pool.query('SELECT COUNT(*) as cnt FROM ammo_stocks WHERE caliber_id = ? AND quantity > 0', [id]);

    if (weaps[0].cnt > 0 || stocks[0].cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir o calibre "${caliberName}" pois há armas ou munições em estoque vinculadas a ele.` });
    }

    await pool.query('DELETE FROM calibers WHERE id = ?', [id]);
    await insertAuditLog('Munições', 'Excluir', `Excluído calibre: ${caliberName}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/ammo-stocks', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
      SELECT id, caliber_id as caliberId, quantity, department_id as departmentId, unit_id as unitId, vault_space_id as vaultSpaceId, updated_at as updatedAt
      FROM ammo_stocks ORDER BY updated_at DESC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/ammo-stocks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM ammo_stocks WHERE id = ?', [id]);
    await insertAuditLog('Munições', 'Excluir', `Excluído registro de estoque de munição`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/ammo-movements', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query(`
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
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/ammo-movements', async (req: Request, res: Response) => {
  try {
    const { 
      type, caliberId, quantity, vaultSpaceId, recipientOrReason,
      responsibleType, responsibleUserId, responsibleName, responsibleMasp,
      observation, actor 
    } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    const pool = getPool();
    const [vaults]: any = await pool.query('SELECT * FROM vault_spaces WHERE id = ?', [vaultSpaceId]);
    if (!vaults || vaults.length === 0) return res.status(404).json({ error: 'Local do cofre não encontrado' });
    const vault = vaults[0];

    // Find stock
    const [stocks]: any = await pool.query('SELECT * FROM ammo_stocks WHERE vault_space_id = ? AND caliber_id = ?', [vaultSpaceId, caliberId]);

    let stockId = stocks && stocks.length > 0 ? stocks[0].id : null;
    let currentQty = stocks && stocks.length > 0 ? stocks[0].quantity : 0;

    if (type === 'Saída') {
      if (currentQty < quantity) {
        return res.status(400).json({ error: `Estoque insuficiente no cofre (${currentQty} disponíveis).` });
      }
      currentQty -= quantity;
      await pool.query('UPDATE ammo_stocks SET quantity = ? WHERE id = ?', [currentQty, stockId]);
    } else {
      if (!stockId) {
        stockId = `stock-${Date.now()}`;
        currentQty = quantity;
        await pool.query(
          'INSERT INTO ammo_stocks (id, caliber_id, quantity, department_id, unit_id, vault_space_id) VALUES (?, ?, ?, ?, ?, ?)',
          [stockId, caliberId, currentQty, vault.department_id, vault.unit_id, vaultSpaceId]
        );
      } else {
        currentQty += quantity;
        await pool.query('UPDATE ammo_stocks SET quantity = ? WHERE id = ?', [currentQty, stockId]);
      }
    }

    const movId = `ammomov-${Date.now()}`;
    const cleanObs = (observation || '').slice(0, 500);

    await pool.query(
      `INSERT INTO ammo_movements 
       (id, type, caliber_id, quantity, department_id, unit_id, vault_space_id, recipient_or_reason, 
        responsible_type, responsible_user_id, responsible_name, responsible_masp, observation, user_id, user_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        movId, type, caliberId, quantity, vault.department_id, vault.unit_id, vaultSpaceId, recipientOrReason,
        responsibleType || 'SISTEMA', responsibleUserId || null, responsibleName || null, responsibleMasp || null,
        cleanObs, actor.id, actor.name
      ]
    );

    await insertAuditLog('Munições', type === 'Entrada' ? 'Criar' : 'Excluir', `${type} de ${quantity} munições - Motivo/Destino: ${recipientOrReason}`, actor, req.ip);

    return res.json({
      id: movId,
      type,
      caliberId,
      quantity,
      vaultSpaceId,
      unitId: vault.unit_id,
      departmentId: vault.department_id,
      recipientOrReason,
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
    const [movs]: any = await pool.query('SELECT * FROM ammo_movements WHERE id = ?', [id]);
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
    const [stocks]: any = await pool.query('SELECT * FROM ammo_stocks WHERE vault_space_id = ? AND caliber_id = ?', [mov.vault_space_id, mov.caliber_id]);
    let currentQty = stocks && stocks.length > 0 ? stocks[0].quantity : 0;
    let stockId = stocks && stocks.length > 0 ? stocks[0].id : null;

    if (!stockId) {
      stockId = `stock-${Date.now()}`;
      await pool.query(
        'INSERT INTO ammo_stocks (id, caliber_id, quantity, department_id, unit_id, vault_space_id) VALUES (?, ?, ?, ?, ?, ?)',
        [stockId, mov.caliber_id, numReturn, mov.department_id, mov.unit_id, mov.vault_space_id]
      );
    } else {
      currentQty += numReturn;
      await pool.query('UPDATE ammo_stocks SET quantity = ? WHERE id = ?', [currentQty, stockId]);
    }

    const newReturnedTotal = prevReturned + numReturn;
    await pool.query(
      `UPDATE ammo_movements 
       SET returned_quantity = ?, returned_at = NOW(), returned_by_user_name = ?
       WHERE id = ?`,
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
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM ammo_movements WHERE id = ?', [id]);
    await insertAuditLog('Munições', 'Excluir', `Excluído histórico de movimentação de munição`, actor, req.ip);
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
    const [rows]: any = await pool.query(`
      SELECT id, type, serial_number as serialNumber, manufacturer, model, caliber, magazine_quantity as magazineQuantity, status, department_id as departmentId, unit_id as unitId, vault_space_id as vaultSpaceId, last_maintenance_date as lastMaintenanceDate, last_maintenance_responsible as lastMaintenanceResponsible, created_at as createdAt
      FROM weapons ORDER BY created_at ASC
    `);

    const mapped = (rows || []).map((w: any) => ({
      ...w,
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
    const [existing]: any = await pool.query('SELECT id FROM weapons WHERE UPPER(serial_number) = ?', [cleanSerial]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe uma arma cadastrada com o nº de série ${cleanSerial}` });
    }

    const id = `weap-${Date.now()}`;
    await pool.query(
      `INSERT INTO weapons (id, type, serial_number, manufacturer, model, caliber, magazine_quantity, status, department_id, unit_id, vault_space_id, last_maintenance_date, last_maintenance_responsible, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'No Cofre', ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        type,
        cleanSerial,
        manufacturer,
        model,
        caliber,
        magazineQuantity || 1,
        departmentId || null,
        unitId || null,
        vaultSpaceId || null,
        lastMaintenanceDate || null,
        lastMaintenanceResponsible || null
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
      `UPDATE weapons SET
        type = COALESCE(?, type),
        manufacturer = COALESCE(?, manufacturer),
        model = COALESCE(?, model),
        caliber = COALESCE(?, caliber),
        magazine_quantity = COALESCE(?, magazine_quantity),
        status = COALESCE(?, status),
        department_id = COALESCE(?, department_id),
        unit_id = COALESCE(?, unit_id),
        vault_space_id = COALESCE(?, vault_space_id),
        last_maintenance_date = COALESCE(?, last_maintenance_date),
        last_maintenance_responsible = COALESCE(?, last_maintenance_responsible)
       WHERE id = ?`,
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

    const [weaps]: any = await pool.query('SELECT * FROM weapons WHERE id = ?', [id]);
    if (!weaps || weaps.length === 0) {
      return res.status(404).json({ error: 'Arma não encontrada' });
    }

    await pool.query('DELETE FROM weapon_movements WHERE weapon_id = ?', [id]);
    await pool.query('DELETE FROM weapons WHERE id = ?', [id]);

    await insertAuditLog('Armas', 'Excluir', `Excluída arma ${weaps[0].model} (Série: ${weaps[0].serial_number})`, actor, req.ip);
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
        id, weapon_id as weaponId, weapon_serial_number as weaponSerialNumber, weapon_model as weaponModel, weapon_type as weaponType, caliber,
        department_id as departmentId, unit_id as unitId, requester_id as requesterId, requester_name as requesterName, requester_masp as requesterMasp,
        withdrawal_vault_space_id as withdrawalVaultSpaceId, return_vault_space_id as returnVaultSpaceId, ammunition_count as ammunitionCount,
        magazine_count as magazineCount, returning_ammunition_count as returningAmmunitionCount, returning_magazine_count as returningMagazineCount,
        status, approved_by_user_id as approvedByUserId, approved_by_user_name as approvedByUserName, approval_date as approvalDate,
        receipt_confirmed_by_user_id as receiptConfirmedByUserId, receipt_confirmed_by_user_name as receiptConfirmedByUserName, receipt_date as receiptDate,
        has_divergence as hasDivergence, divergence_justification as divergenceJustification, created_at as createdAt, updated_at as updatedAt
      FROM weapon_movements ORDER BY created_at DESC
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
    const [weaps]: any = await pool.query('SELECT * FROM weapons WHERE id = ?', [weaponId]);
    if (!weaps || weaps.length === 0) return res.status(404).json({ error: 'Arma não encontrada' });
    const weapon = weaps[0];

    if (weapon.status !== 'No Cofre') {
      return res.status(400).json({ error: `Esta arma não está disponível no cofre (Status atual: ${weapon.status}).` });
    }

    const movId = `mov-${Date.now()}`;
    await pool.query(
      `INSERT INTO weapon_movements (
        id, weapon_id, weapon_serial_number, weapon_model, weapon_type, caliber, department_id, unit_id,
        requester_id, requester_name, requester_masp, withdrawal_vault_space_id, ammunition_count, magazine_count,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente Aprovação', NOW(), NOW())`,
      [
        movId,
        weapon.id,
        weapon.serial_number,
        weapon.model,
        weapon.type,
        weapon.caliber,
        weapon.department_id,
        weapon.unit_id,
        actor.id,
        actor.name,
        actor.masp,
        weapon.vault_space_id,
        ammunitionCount || 0,
        magazineCount || 0
      ]
    );

    await insertAuditLog('Movimentações', 'Solicitar', `Solicitada retirada da arma ${weapon.model} (${weapon.serial_number}) por ${actor.name}`, actor, req.ip);

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
    const [movs]: any = await pool.query('SELECT * FROM weapon_movements WHERE id = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação não encontrada' });
    const movement = movs[0];

    await pool.query(
      `UPDATE weapon_movements SET status = 'Em Trânsito', approved_by_user_id = ?, approved_by_user_name = ?, approval_date = NOW(), updated_at = NOW() WHERE id = ?`,
      [actor.id, actor.name, id]
    );

    await pool.query("UPDATE weapons SET status = 'Em Trânsito' WHERE id = ?", [movement.weapon_id]);

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
    const [movs]: any = await pool.query('SELECT * FROM weapon_movements WHERE id = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação não encontrada' });
    const movement = movs[0];

    await pool.query(
      `UPDATE weapon_movements SET
        status = 'Pendente Recibo',
        return_vault_space_id = ?,
        returning_ammunition_count = ?,
        returning_magazine_count = ?,
        divergence_justification = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [returnVaultSpaceId, returningAmmunitionCount || 0, returningMagazineCount || 0, divergenceJustification || '', id]
    );

    await pool.query("UPDATE weapons SET status = 'Pendente de Recibo' WHERE id = ?", [movement.weapon_id]);

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
    const [movs]: any = await pool.query('SELECT * FROM weapon_movements WHERE id = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação não encontrada' });
    const movement = movs[0];

    await pool.query(
      `UPDATE weapon_movements SET status = 'Concluído', receipt_confirmed_by_user_id = ?, receipt_confirmed_by_user_name = ?, receipt_date = NOW(), updated_at = NOW() WHERE id = ?`,
      [actor.id, actor.name, id]
    );

    const vaultToSet = movement.return_vault_space_id || movement.withdrawal_vault_space_id;
    await pool.query("UPDATE weapons SET status = 'No Cofre', vault_space_id = ? WHERE id = ?", [vaultToSet, movement.weapon_id]);

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

    const [movs]: any = await pool.query('SELECT * FROM weapon_movements WHERE id = ?', [id]);
    if (movs && movs.length > 0) {
      await pool.query("UPDATE weapons SET status = 'No Cofre' WHERE id = ?", [movs[0].weapon_id]);
    }

    await pool.query('DELETE FROM weapon_movements WHERE id = ?', [id]);
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
      SELECT id, module, action, details, user_id as userId, user_name as userName, user_masp as userMasp, user_role as userRole, ip_address as ipAddress, timestamp
      FROM audit_logs ORDER BY timestamp DESC
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
    const [rows]: any = await pool.query('SELECT * FROM academy_courses ORDER BY created_at DESC');
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      career: r.career || undefined,
      code: r.code || '',
      dates: typeof r.dates === 'string' ? JSON.parse(r.dates) : (Array.isArray(r.dates) ? r.dates : []),
      departmentName: r.department_name || undefined,
      startDate: r.start_date ? new Date(r.start_date).toISOString().split('T')[0] : undefined,
      moduleNumber: r.module_number || undefined,
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
    const { name, type, career, code, dates, departmentName, startDate, moduleNumber, lessonCount, lessonsData, departmentId, unitId, actor } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do curso é obrigatório' });
    if (!code || !code.trim()) return res.status(400).json({ error: 'Código do curso é obrigatório' });

    const pool = getPool();
    const id = `acad-crs-${Date.now()}`;
    await pool.query(
      `INSERT INTO academy_courses (id, name, type, career, code, dates, department_name, start_date, module_number, lesson_count, lessons_data, department_id, unit_id, created_at)
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

    await insertAuditLog('Cursos', 'Criar', `Cadastrado curso da academia: ${name} (${type} - Cód: ${code})`, actor, req.ip);
    return res.json({ id, name, type, career, code, dates, departmentName, startDate, moduleNumber, lessonCount, lessonsData, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/academy-courses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, career, code, dates, departmentName, startDate, moduleNumber, lessonCount, lessonsData, departmentId, unitId, actor } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do curso é obrigatório' });
    if (!code || !code.trim()) return res.status(400).json({ error: 'Código do curso é obrigatório' });

    const pool = getPool();

    await pool.query(
      `UPDATE academy_courses SET
        name = ?,
        type = ?,
        career = ?,
        code = ?,
        dates = ?,
        department_name = ?,
        start_date = ?,
        module_number = ?,
        lesson_count = ?,
        lessons_data = ?,
        department_id = ?,
        unit_id = ?
       WHERE id = ?`,
      [
        name.trim(),
        type,
        career || null,
        code.trim(),
        JSON.stringify(dates || []),
        departmentName ? departmentName.trim() : null,
        startDate || null,
        moduleNumber || null,
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

    await pool.query('DELETE FROM academy_courses WHERE id = ?', [id]);
    await insertAuditLog('Cursos', 'Excluir', `Excluído curso da academia ID ${id}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Lesson Plans (Planos de Aula)
apiRouter.get('/lesson-plans', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query('SELECT * FROM lesson_plans ORDER BY created_at DESC');
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      turmaCode: r.turma_code || undefined,
      career: r.career,
      year: r.year,
      type: r.type,
      lessonCount: r.lesson_count,
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
    const { name, turmaCode, career, year, type, lessonCount, lessonsData, departmentId, unitId, actor } = req.body;
    const pool = getPool();
    const id = req.body.id || `plano-${Date.now()}`;
    await pool.query(
      `INSERT INTO lesson_plans (id, name, turma_code, career, year, type, lesson_count, lessons_data, department_id, unit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        name,
        turmaCode || null,
        career || 'Delegado',
        Number(year) || new Date().getFullYear(),
        type || 'curso de formação',
        Number(lessonCount) || 1,
        JSON.stringify(lessonsData || []),
        departmentId || null,
        unitId || null
      ]
    );

    await insertAuditLog('Cursos', 'Criar', `Cadastrado plano de aula: ${name} (${career} - ${type})`, actor, req.ip);
    return res.json({ id, name, turmaCode, career, year, type, lessonCount, lessonsData, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Erro em POST /lesson-plans:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/lesson-plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, turmaCode, career, year, type, lessonCount, lessonsData, departmentId, unitId, actor } = req.body;
    const pool = getPool();

    await pool.query(
      `UPDATE lesson_plans SET
        name = ?,
        turma_code = ?,
        career = ?,
        year = ?,
        type = ?,
        lesson_count = ?,
        lessons_data = ?,
        department_id = ?,
        unit_id = ?
       WHERE id = ?`,
      [
        name,
        turmaCode || null,
        career || 'Delegado',
        Number(year) || new Date().getFullYear(),
        type || 'curso de formação',
        Number(lessonCount) || 1,
        JSON.stringify(lessonsData || []),
        departmentId || null,
        unitId || null,
        id
      ]
    );

    await insertAuditLog('Cursos', 'Editar', `Atualizado plano de aula: ${name}`, actor, req.ip);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Erro em PUT /lesson-plans:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/lesson-plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = req.body.actor;
    const pool = getPool();

    await pool.query('DELETE FROM lesson_plans WHERE id = ?', [id]);
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
    const [rows]: any = await pool.query('SELECT * FROM weapon_boxes ORDER BY created_at DESC');
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
      `INSERT INTO weapon_boxes (id, name, course_type, weapon_count, weapon_ids, department_id, unit_id, created_at)
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
      `UPDATE weapon_boxes SET
        name = ?,
        course_type = ?,
        weapon_count = ?,
        weapon_ids = ?,
        department_id = ?,
        unit_id = ?
       WHERE id = ?`,
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

    await pool.query('DELETE FROM weapon_boxes WHERE id = ?', [id]);
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

    const [boxes]: any = await pool.query('SELECT * FROM weapon_boxes WHERE id = ?', [id]);
    if (!boxes || boxes.length === 0) return res.status(404).json({ error: 'Caixa de armas não encontrada' });
    const box = boxes[0];
    let wIds: string[] = typeof box.weapon_ids === 'string' ? JSON.parse(box.weapon_ids) : (box.weapon_ids || []);

    wIds = wIds.map(wId => wId === oldWeaponId ? newWeaponId : wId);

    await pool.query('UPDATE weapon_boxes SET weapon_ids = ? WHERE id = ?', [JSON.stringify(wIds), id]);

    const finalRespName = responsibleUserName || teacherName || actor?.name || 'Armeiro Responsável';
    const repId = `rep-${Date.now()}`;
    await pool.query(
      `INSERT INTO weapon_box_replacements (id, box_id, box_name, old_weapon_id, old_weapon_desc, new_weapon_id, new_weapon_desc, reason, teacher_name, responsible_user_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
    const [rows]: any = await pool.query('SELECT * FROM weapon_box_replacements ORDER BY created_at DESC');
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
    const [rows]: any = await pool.query('SELECT * FROM course_classes ORDER BY created_at DESC');
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      courseId: r.course_id,
      courseName: r.course_name,
      subject: r.subject,
      career: r.career,
      careerAbbreviation: r.career_abbreviation,
      turmaNumber: r.turma_number,
      code: r.code,
      studentCount: r.student_count,
      teacherUserId: r.teacher_user_id || undefined,
      teacherName: r.teacher_name || undefined,
      teacherUserIds: typeof r.teacher_user_ids === 'string' ? JSON.parse(r.teacher_user_ids) : (r.teacher_user_ids || []),
      departmentId: r.department_id || undefined,
      unitId: r.unit_id || undefined,
      createdAt: r.created_at
    }));
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
    const { courseId, courseName, subject, career, studentCount, teacherUserIds, teacherUserId, teacherName, departmentId, unitId, actor } = req.body;
    const finalCareer = career || 'Delegado';
    const careerAbbreviation = req.body.careerAbbreviation || req.body.career_abbreviation || computeCareerAbbreviation(finalCareer);
    
    let rawNum = req.body.turmaNumber || req.body.turma_number || req.body.name || req.body.code || '01';
    rawNum = String(rawNum).replace(/\D/g, '');
    const turmaNumber = (rawNum || '01').padStart(2, '0').slice(-2);
    const code = req.body.code || `${careerAbbreviation}-${turmaNumber}`;

    const pool = getPool();

    // Check duplicate turma in same course & career
    const [dups]: any = await pool.query(
      'SELECT id FROM course_classes WHERE course_id = ? AND career = ? AND turma_number = ?',
      [courseId || '', finalCareer, turmaNumber]
    );
    if (dups && dups.length > 0) {
      return res.status(400).json({ error: `Já existe uma turma cadastrada com o número "${turmaNumber}" para a carreira "${finalCareer}" neste mesmo curso.` });
    }

    const finalTeacherUserIds = Array.isArray(teacherUserIds) ? teacherUserIds : (teacherUserId ? [teacherUserId] : []);
    const id = req.body.id || `class-${Date.now()}`;

    await pool.query(
      `INSERT INTO course_classes (id, course_id, course_name, subject, career, career_abbreviation, turma_number, code, student_count, teacher_name, teacher_user_ids, department_id, unit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
        teacherName || '',
        JSON.stringify(finalTeacherUserIds),
        departmentId || null,
        unitId || null
      ]
    );

    await insertAuditLog('Cursos', 'Criar', `Criada turma de aula: ${code} (${subject} - Prof: ${teacherName || 'N/A'})`, actor, req.ip);
    return res.json({ id, courseId, courseName, subject, career: finalCareer, careerAbbreviation, turmaNumber, code, studentCount, teacherName, teacherUserIds: finalTeacherUserIds, departmentId, unitId, createdAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Erro em POST /course-classes:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/course-classes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { courseId, courseName, subject, career, studentCount, teacherUserIds, teacherUserId, teacherName, departmentId, unitId, actor } = req.body;
    const finalCareer = career || 'Delegado';
    const careerAbbreviation = req.body.careerAbbreviation || req.body.career_abbreviation || computeCareerAbbreviation(finalCareer);
    
    let rawNum = req.body.turmaNumber || req.body.turma_number || req.body.name || req.body.code || '01';
    rawNum = String(rawNum).replace(/\D/g, '');
    const turmaNumber = (rawNum || '01').padStart(2, '0').slice(-2);
    const code = req.body.code || `${careerAbbreviation}-${turmaNumber}`;

    const pool = getPool();

    // Check duplicate turma in same course & career
    const [dups]: any = await pool.query(
      'SELECT id FROM course_classes WHERE course_id = ? AND career = ? AND turma_number = ? AND id != ?',
      [courseId || '', finalCareer, turmaNumber, id]
    );
    if (dups && dups.length > 0) {
      return res.status(400).json({ error: `Já existe uma turma cadastrada com o número "${turmaNumber}" para a carreira "${finalCareer}" neste mesmo curso.` });
    }

    const finalTeacherUserIds = Array.isArray(teacherUserIds) ? teacherUserIds : (teacherUserId ? [teacherUserId] : []);

    await pool.query(
      `UPDATE course_classes SET
        course_id = ?,
        course_name = ?,
        subject = ?,
        career = ?,
        career_abbreviation = ?,
        turma_number = ?,
        code = ?,
        student_count = ?,
        teacher_name = ?,
        teacher_user_ids = ?,
        department_id = ?,
        unit_id = ?
       WHERE id = ?`,
      [
        courseId || '',
        courseName || '',
        subject || 'MEAF',
        finalCareer,
        careerAbbreviation,
        turmaNumber,
        code,
        Number(studentCount) || 1,
        teacherName || '',
        JSON.stringify(finalTeacherUserIds),
        departmentId || null,
        unitId || null,
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

    await pool.query('DELETE FROM course_classes WHERE id = ?', [id]);
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
    const [rows]: any = await pool.query('SELECT * FROM course_class_movements ORDER BY created_at DESC');
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
        const [cRows]: any = await pool.query('SELECT course_id FROM course_classes WHERE id = ?', [finalClassId]);
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
      const [boxes]: any = await pool.query('SELECT weapon_ids FROM weapon_boxes WHERE id = ?', [finalBoxId]);
      if (boxes && boxes.length > 0) {
        const rawIds = boxes[0].weapon_ids;
        finalWeaponIds = typeof rawIds === 'string' ? JSON.parse(rawIds) : (rawIds || []);
      }
    }

    const executeInsertMovement = async () => {
      await pool.query(
        `INSERT INTO course_class_movements
          (id, course_id, class_id, turma_code, lesson_plan_id, lesson_plan_name, lesson_number, teacher_name, weapon_box_id, weapon_box_name, weapon_ids, caliber_id, vault_space_id, ammo_supplied, student_count, shots_per_student, instructor_shots, ammo_used, extra_magazines_count, status, issued_by_user_name, created_at)
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
      if (insertErr.message && (insertErr.message.includes('course_id') || insertErr.message.includes('cannot be null'))) {
        try { await pool.query('ALTER TABLE course_class_movements MODIFY COLUMN course_id VARCHAR(64) NULL DEFAULT NULL;'); } catch (e) {}
        await executeInsertMovement();
      } else {
        throw insertErr;
      }
    }

    if (finalWeaponIds.length > 0) {
      const locNote = `Em Sala de Aula (${finalTurmaCode} - Prof. ${finalTeacherName})`;
      for (const wId of finalWeaponIds) {
        await pool.query(
          `UPDATE weapons SET status = 'Em Sala de Aula', location_note = ? WHERE id = ?`,
          [locNote, wId]
        );
      }
    }

    if (finalAmmoSupplied > 0) {
      let targetStock: any = null;

      if (ammoStockId) {
        const [stocks]: any = await pool.query('SELECT * FROM ammo_stocks WHERE id = ?', [ammoStockId]);
        if (stocks && stocks.length > 0) targetStock = stocks[0];
      }

      if (!targetStock && vaultSpaceId) {
        const calName = ammoCaliber || req.body.ammoCaliber || '';
        const [stocks]: any = await pool.query(
          `SELECT * FROM ammo_stocks WHERE vault_space_id = ? AND (caliber_id = ? OR caliber_id IN (SELECT id FROM calibers WHERE id = ? OR name = ?))`,
          [vaultSpaceId, caliberId || '', caliberId || '', calName]
        );
        if (stocks && stocks.length > 0) {
          targetStock = stocks[0];
        } else {
          const [vStocks]: any = await pool.query('SELECT * FROM ammo_stocks WHERE vault_space_id = ?', [vaultSpaceId]);
          if (vStocks && vStocks.length > 0) targetStock = vStocks[0];
        }
      }

      if (targetStock) {
        const newQty = Math.max(0, targetStock.quantity - finalAmmoSupplied);
        await pool.query('UPDATE ammo_stocks SET quantity = ? WHERE id = ?', [newQty, targetStock.id]);

        // Register movement in ammo_movements as (Aula CFTP)
        try {
          const ammoMovId = `ammo-mov-${Date.now()}`;
          await pool.query(
            `INSERT INTO ammo_movements (id, stock_id, caliber_id, vault_space_id, type, quantity, recipient_or_reason, responsible_user_name, department_id, created_at)
             VALUES (?, ?, ?, ?, 'Saída', ?, ?, ?, ?, NOW())`,
            [
              ammoMovId,
              targetStock.id,
              targetStock.caliber_id || caliberId || null,
              targetStock.vault_space_id || vaultSpaceId || null,
              finalAmmoSupplied,
              `(Aula CFTP) - Turma ${finalTurmaCode} (Prof. ${finalTeacherName})`,
              finalIssuedByUserName,
              targetStock.department_id || null
            ]
          );
        } catch (mErr) {
          console.error('Erro ao registrar ammo_movement para Aula CFTP:', mErr);
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
    const { ammoReturned, returnedByUserName, actor } = req.body;

    const pool = getPool();
    const [movs]: any = await pool.query('SELECT * FROM course_class_movements WHERE id = ?', [id]);
    if (!movs || movs.length === 0) return res.status(404).json({ error: 'Movimentação de curso não encontrada' });
    const mov = movs[0];

    const wIds: string[] = typeof mov.weapon_ids === 'string' ? JSON.parse(mov.weapon_ids) : (mov.weapon_ids || []);

    if (Array.isArray(wIds) && wIds.length > 0) {
      for (const wId of wIds) {
        await pool.query(
          `UPDATE weapons SET status = 'No Cofre', location_note = NULL WHERE id = ?`,
          [wId]
        );
      }
    }

    if (ammoReturned > 0 && mov.vault_space_id && mov.caliber_id) {
      const [stocks]: any = await pool.query('SELECT * FROM ammo_stocks WHERE vault_space_id = ? AND caliber_id = ?', [mov.vault_space_id, mov.caliber_id]);
      if (stocks && stocks.length > 0) {
        const newQty = stocks[0].quantity + ammoReturned;
        await pool.query('UPDATE ammo_stocks SET quantity = ? WHERE id = ?', [newQty, stocks[0].id]);
      }
    }

    await pool.query(
      `UPDATE course_class_movements
       SET status = 'Finalizada', ammo_returned = ?, returned_by_user_name = ?, returned_at = NOW()
       WHERE id = ?`,
      [ammoReturned || 0, returnedByUserName || actor?.name || 'Armeiro', id]
    );

    await insertAuditLog('Cursos', 'Devolver', `Retorno da aula Turma ${mov.turma_code} (Aula ${mov.lesson_number}) - Munição devolvida ao cofre: ${ammoReturned} un`, actor, req.ip);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
