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
    const { masp, name, phone, cargo, role, departmentId, unitId, canMoveAmmunition, canMoveWeapons, hasSystemAccess, courses, actor } = req.body;
    const cleanMasp = (masp || '').replace(/\D/g, '');

    const pool = getPool();
    const [existing]: any = await pool.query('SELECT id FROM users WHERE masp = ?', [cleanMasp]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe um usuário cadastrado com o MASP ${cleanMasp}` });
    }

    const id = `usr-${Date.now()}`;
    const hashedDefaultPass = hashPassword(cleanMasp);
    await pool.query(
      `INSERT INTO users (id, masp, password, name, phone, cargo, role, department_id, unit_id, can_move_ammo, can_move_weapons, has_system_access, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
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
        hasSystemAccess ? 1 : 0
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
        has_system_access = COALESCE(?, has_system_access)
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
// COURSES
// -------------------------------------------------------------
apiRouter.get('/courses', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const [rows]: any = await pool.query('SELECT id, name, allowed_models, allowed_calibers, department_id as departmentId, created_at as createdAt FROM courses');
    const mapped = (rows || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      allowedModels: typeof c.allowed_models === 'string' ? JSON.parse(c.allowed_models) : (c.allowed_models || []),
      allowedCalibers: typeof c.allowed_calibers === 'string' ? JSON.parse(c.allowed_calibers) : (c.allowed_calibers || []),
      departmentId: c.departmentId || '',
      createdAt: c.createdAt
    }));
    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/courses', async (req: Request, res: Response) => {
  try {
    const { name, allowedModels, allowedCalibers, departmentId, actor } = req.body;
    const pool = getPool();
    const id = `course-${Date.now()}`;
    await pool.query(
      'INSERT INTO courses (id, name, allowed_models, allowed_calibers, department_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, name, JSON.stringify(allowedModels || []), JSON.stringify(allowedCalibers || []), departmentId || null]
    );

    await insertAuditLog('Cursos', 'Criar', `Criado curso: ${name}`, actor, req.ip);
    return res.json({ id, name, allowedModels, allowedCalibers, departmentId, createdAt: new Date().toISOString() });
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
      SELECT id, type, caliber_id as caliberId, quantity, department_id as departmentId, unit_id as unitId, vault_space_id as vaultSpaceId, recipient_or_reason as recipientOrReason, user_id as userId, user_name as userName, created_at as createdAt
      FROM ammo_movements ORDER BY created_at DESC
    `);
    return res.json(rows || []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/ammo-movements', async (req: Request, res: Response) => {
  try {
    const { type, caliberId, quantity, vaultSpaceId, recipientOrReason, actor } = req.body;
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
    await pool.query(
      `INSERT INTO ammo_movements (id, type, caliber_id, quantity, department_id, unit_id, vault_space_id, recipient_or_reason, user_id, user_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [movId, type, caliberId, quantity, vault.department_id, vault.unit_id, vaultSpaceId, recipientOrReason, actor.id, actor.name]
    );

    await insertAuditLog('Munições', type === 'Entrada' ? 'Criar' : 'Excluir', `${type} de ${quantity} munições - Motivo: ${recipientOrReason}`, actor, req.ip);

    return res.json({
      id: movId,
      type,
      caliberId,
      quantity,
      vaultSpaceId,
      unitId: vault.unit_id,
      departmentId: vault.department_id,
      recipientOrReason,
      userId: actor.id,
      userName: actor.name,
      createdAt: new Date().toISOString()
    });
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
