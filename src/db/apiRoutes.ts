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
      [rows] = await pool.query(`
        SELECT 
          ID_USUARIOS as id,
          MASP_USUARIOS as masp,
          SENHA_USUARIOS as password,
          NOME_USUARIOS as name,
          TELEFONE_USUARIOS as phone,
          CARGO_USUARIOS as cargo,
          PERFIL_USUARIOS as role,
          DEPARTAMENTO_ID_USUARIOS as department_id,
          UNIDADE_ID_USUARIOS as unit_id,
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
    const [rows]: any = await pool.query('SELECT ID_DEPARTAMENTOS as id, NOME_DEPARTAMENTOS as name, CODIGO_DEPARTAMENTOS as code, DATA_CRIACAO_DEPARTAMENTOS as createdAt FROM DEPARTAMENTOS ORDER BY DATA_CRIACAO_DEPARTAMENTOS ASC');
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
      'INSERT INTO DEPARTAMENTOS (ID_DEPARTAMENTOS, NOME_DEPARTAMENTOS, CODIGO_DEPARTAMENTOS, DATA_CRIACAO_DEPARTAMENTOS) VALUES (?, ?, ?, NOW())',
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
    await pool.query('UPDATE DEPARTAMENTOS SET NOME_DEPARTAMENTOS = ?, CODIGO_DEPARTAMENTOS = ? WHERE ID_DEPARTAMENTOS = ?', [name, code, id]);

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
    const [rows]: any = await pool.query('SELECT ID_UNIDADES as id, NOME_UNIDADES as name, DEPARTAMENTO_ID_UNIDADES as departmentId, DATA_CRIACAO_UNIDADES as createdAt FROM UNIDADES ORDER BY DATA_CRIACAO_UNIDADES ASC');
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
      'INSERT INTO UNIDADES (ID_UNIDADES, DEPARTAMENTO_ID_UNIDADES, NOME_UNIDADES, DATA_CRIACAO_UNIDADES) VALUES (?, ?, ?, NOW())',
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
    await pool.query('UPDATE UNIDADES SET NOME_UNIDADES = ?, DEPARTAMENTO_ID_UNIDADES = ? WHERE ID_UNIDADES = ?', [name, departmentId || null, id]);

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
    const [users]: any = await pool.query(`
      SELECT 
        ID_USUARIOS as id,
        MASP_USUARIOS as masp,
        SENHA_USUARIOS as password,
        NOME_USUARIOS as name,
        TELEFONE_USUARIOS as phone,
        CARGO_USUARIOS as cargo,
        PERFIL_USUARIOS as role,
        DEPARTAMENTO_ID_USUARIOS as department_id,
        UNIDADE_ID_USUARIOS as unit_id,
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
        departmentId: u.department_id || '',
        unitId: u.unit_id || '',
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
    const { masp, name, phone, cargo, role, departmentId, unitId, canMoveAmmunition, canMoveWeapons, hasSystemAccess, isTeacher, teacherSubject, professorSigla, professor_sigla, courses, actor } = req.body;
    const cleanMasp = (masp || '').replace(/\D/g, '');
    const siglaProf = professorSigla || professor_sigla || null;

    const pool = getPool();
    const [existing]: any = await pool.query('SELECT ID_USUARIOS FROM USUARIOS WHERE MASP_USUARIOS = ?', [cleanMasp]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Já existe um usuário cadastrado com o MASP ${cleanMasp}` });
    }

    const id = `usr-${Date.now()}`;
    const hashedDefaultPass = hashPassword(cleanMasp);
    await pool.query(
      `INSERT INTO USUARIOS (ID_USUARIOS, MASP_USUARIOS, SENHA_USUARIOS, NOME_USUARIOS, TELEFONE_USUARIOS, CARGO_USUARIOS, PERFIL_USUARIOS, DEPARTAMENTO_ID_USUARIOS, UNIDADE_ID_USUARIOS, PODE_MOVER_MUNICAO_USUARIOS, PODE_MOVER_ARMAS_USUARIOS, TEM_ACESSO_SISTEMA_USUARIOS, EH_PROFESSOR_USUARIOS, DISCIPLINA_PROFESSOR_USUARIOS, SIGLA_PROFESSOR_USUARIOS, DEVE_ALTERAR_SENHA_USUARIOS, DATA_CRIACAO_USUARIOS)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
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
        teacherSubject || null,
        siglaProf
      ]
    );

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
    const [rows]: any = await pool.query(`
      SELECT 
        ID_USUARIOS as id,
        MASP_USUARIOS as masp,
        SENHA_USUARIOS as password,
        NOME_USUARIOS as name,
        TELEFONE_USUARIOS as phone,
        CARGO_USUARIOS as cargo,
        PERFIL_USUARIOS as role,
        DEPARTAMENTO_ID_USUARIOS as department_id,
        UNIDADE_ID_USUARIOS as unit_id,
        PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
        PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
        TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
        EH_PROFESSOR_USUARIOS as is_teacher,
        DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
        SIGLA_PROFESSOR_USUARIOS as professor_sigla,
        DEVE_ALTERAR_SENHA_USUARIOS as must_change_password
      FROM USUARIOS WHERE ID_USUARIOS = ?
    `, [id]);
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

    await pool.query(
      `UPDATE USUARIOS SET
        MASP_USUARIOS = ?,
        NOME_USUARIOS = COALESCE(?, NOME_USUARIOS),
        TELEFONE_USUARIOS = COALESCE(?, TELEFONE_USUARIOS),
        CARGO_USUARIOS = COALESCE(?, CARGO_USUARIOS),
        PERFIL_USUARIOS = COALESCE(?, PERFIL_USUARIOS),
        DEPARTAMENTO_ID_USUARIOS = COALESCE(?, DEPARTAMENTO_ID_USUARIOS),
        UNIDADE_ID_USUARIOS = COALESCE(?, UNIDADE_ID_USUARIOS),
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
        updates.canMoveAmmunition !== undefined ? (updates.canMoveAmmunition ? 1 : 0) : null,
        updates.canMoveWeapons !== undefined ? (updates.canMoveWeapons ? 1 : 0) : null,
        updates.hasSystemAccess !== undefined ? (updates.hasSystemAccess ? 1 : 0) : null,
        updates.isTeacher !== undefined ? (updates.isTeacher ? 1 : 0) : null,
        updates.teacherSubject !== undefined ? updates.teacherSubject : null,
        updates.professorSigla ?? updates.professor_sigla ?? null,
        id
      ]
    );

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

    const [activeLoans]: any = await pool.query(
      `SELECT * FROM weapon_movements WHERE requester_id = ? AND status IN ('Em Trânsito', 'Pendente Recibo', 'Pendente Aprovação')`,
      [id]
    );

    if (activeLoans && activeLoans.length > 0) {
      return res.status(400).json({
        error: `Não é possível excluir o policial ${users[0].name} pois ele possui solicitação ou armamento ativo em cautela.`
      });
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
    const [rows]: any = await pool.query('SELECT ID_COFRES as id, CODIGO_COFRES as code, TIPO_COFRES as type, DEPARTAMENTO_ID_COFRES as departmentId, UNIDADE_ID_COFRES as unitId, DATA_CRIACAO_COFRES as createdAt FROM COFRES ORDER BY DATA_CRIACAO_COFRES ASC');
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
      'INSERT INTO COFRES (ID_COFRES, CODIGO_COFRES, TIPO_COFRES, DEPARTAMENTO_ID_COFRES, UNIDADE_ID_COFRES, DATA_CRIACAO_COFRES) VALUES (?, ?, ?, ?, ?, NOW())',
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
      'UPDATE COFRES SET CODIGO_COFRES = ?, TIPO_COFRES = ?, DEPARTAMENTO_ID_COFRES = ?, UNIDADE_ID_COFRES = ? WHERE ID_COFRES = ?',
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

    const [weaps]: any = await pool.query("SELECT COUNT(*) as cnt FROM ARMAS WHERE COFRE_ID_ARMAS = ? AND STATUS_ARMAS = 'No Cofre'", [id]);
    const [ammos]: any = await pool.query('SELECT COUNT(*) as cnt FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND QUANTIDADE_ESTOQUE_MUNICOES > 0', [id]);

    if (weaps[0].cnt > 0 || ammos[0].cnt > 0) {
      return res.status(400).json({ error: 'Não é possível excluir o local do cofre pois há armas ou munições armazenadas nele.' });
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
    const [rows]: any = await pool.query('SELECT ID_CALIBRES as id, NOME_CALIBRES as name, DATA_CRIACAO_CALIBRES as createdAt FROM CALIBRES ORDER BY NOME_CALIBRES ASC');
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

    const [existing]: any = await pool.query('SELECT ID_CALIBRES as id FROM CALIBRES WHERE LOWER(NOME_CALIBRES) = LOWER(?)', [cleanName]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Este calibre já está cadastrado.' });
    }

    const id = `cal-${Date.now()}`;
    await pool.query('INSERT INTO CALIBRES (ID_CALIBRES, NOME_CALIBRES, DATA_CRIACAO_CALIBRES) VALUES (?, ?, NOW())', [id, cleanName]);

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

    const [calRows]: any = await pool.query('SELECT ID_CALIBRES as id, NOME_CALIBRES as name FROM CALIBRES WHERE ID_CALIBRES = ?', [id]);
    if (!calRows || calRows.length === 0) {
      return res.status(404).json({ error: 'Calibre não encontrado' });
    }

    const caliberName = calRows[0].name;
    const [weaps]: any = await pool.query('SELECT COUNT(*) as cnt FROM ARMAS WHERE LOWER(CALIBRE_ARMAS) = LOWER(?)', [caliberName]);
    const [stocks]: any = await pool.query('SELECT COUNT(*) as cnt FROM ESTOQUE_MUNICOES WHERE CALIBRE_ID_ESTOQUE_MUNICOES = ? AND QUANTIDADE_ESTOQUE_MUNICOES > 0', [id]);

    if (weaps[0].cnt > 0 || stocks[0].cnt > 0) {
      return res.status(400).json({ error: `Não é possível excluir o calibre "${caliberName}" pois há armas ou munições em estoque vinculadas a ele.` });
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
    const actor = req.body?.actor;
    const pool = getPool();

    // Check permissions: Geral, Armeiro or Administrador can delete
    if (actor && actor.role && !['Geral', 'Armeiro', 'Administrador'].includes(actor.role)) {
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
    const { quantity, caliberId, additionalInfo, actor } = req.body;
    if (!actor) return res.status(401).json({ error: 'Sessão expirada' });

    if (actor.role && !['Geral', 'Armeiro', 'Administrador'].includes(actor.role) && !(actor.role === 'Policial' && actor.canMoveAmmunition)) {
      return res.status(403).json({ error: 'Permissão negada. Apenas Armeiros e administradores podem alterar dados de estoque de munição.' });
    }

    const pool = getPool();
    const [stocks]: any = await pool.query(
      'SELECT ID_ESTOQUE_MUNICOES as id, CALIBRE_ID_ESTOQUE_MUNICOES as caliberId, QUANTIDADE_ESTOQUE_MUNICOES as quantity, COFRE_ID_ESTOQUE_MUNICOES as vaultSpaceId, DEPARTAMENTO_ID_ESTOQUE_MUNICOES as departmentId, UNIDADE_ID_ESTOQUE_MUNICOES as unitId FROM ESTOQUE_MUNICOES WHERE ID_ESTOQUE_MUNICOES = ?',
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
    const cleanInfo = typeof additionalInfo === 'string' ? additionalInfo.slice(0, 500) : '';

    await pool.query(
      'UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ?, CALIBRE_ID_ESTOQUE_MUNICOES = ?, DATA_ATUALIZACAO_ESTOQUE_MUNICOES = NOW() WHERE ID_ESTOQUE_MUNICOES = ?',
      [newQty, newCaliberId, id]
    );

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
      } else {
        const movId = `ammomov-${Date.now()}`;
        await pool.query(
          `INSERT INTO MOVIMENTACOES_MUNICOES 
           (ID_MOVIMENTACOES_MUNICOES, TIPO_MOVIMENTACOES_MUNICOES, CALIBRE_ID_MOVIMENTACOES_MUNICOES, QUANTIDADE_MOVIMENTACOES_MUNICOES, DEPARTAMENTO_ID_MOVIMENTACOES_MUNICOES, UNIDADE_ID_MOVIMENTACOES_MUNICOES, COFRE_ID_MOVIMENTACOES_MUNICOES, DESTINATARIO_OU_MOTIVO_MOVIMENTACOES_MUNICOES, 
            TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES, RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES, RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES, RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES, OBSERVACAO_MOVIMENTACOES_MUNICOES, USUARIO_ID_MOVIMENTACOES_MUNICOES, NOME_USUARIO_MOVIMENTACOES_MUNICOES, DATA_CRIACAO_MOVIMENTACOES_MUNICOES)
           VALUES (?, 'Entrada', ?, ?, ?, ?, ?, 'Ajuste de Estoque', 'SISTEMA', ?, ?, ?, ?, ?, ?, NOW())`,
          [
            movId, newCaliberId, newQty, currentStock.departmentId, currentStock.unitId, currentStock.vaultSpaceId,
            actor.id, actor.name, actor.masp, cleanInfo, actor.id, actor.name
          ]
        );
      }
    }

    await insertAuditLog(
      'Munições',
      'Editar',
      `Alterado estoque ID ${id}: Quantidade para ${newQty}, Calibre ${newCaliberId}${cleanInfo ? ` - Informações adicionais: ${cleanInfo}` : ''}`,
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
    const [vaults]: any = await pool.query('SELECT ID_COFRES as id, DEPARTAMENTO_ID_COFRES as department_id, UNIDADE_ID_COFRES as unit_id FROM COFRES WHERE ID_COFRES = ?', [vaultSpaceId]);
    if (!vaults || vaults.length === 0) return res.status(404).json({ error: 'Local do cofre não encontrado' });
    const vault = vaults[0];

    // Find stock
    const [stocks]: any = await pool.query('SELECT ID_ESTOQUE_MUNICOES as id, QUANTIDADE_ESTOQUE_MUNICOES as quantity FROM ESTOQUE_MUNICOES WHERE COFRE_ID_ESTOQUE_MUNICOES = ? AND CALIBRE_ID_ESTOQUE_MUNICOES = ?', [vaultSpaceId, caliberId]);

    let stockId = stocks && stocks.length > 0 ? stocks[0].id : null;
    let currentQty = stocks && stocks.length > 0 ? stocks[0].quantity : 0;

    if (type === 'Saída') {
      if (currentQty < quantity) {
        return res.status(400).json({ error: `Estoque insuficiente no cofre (${currentQty} disponíveis).` });
      }
      currentQty -= quantity;
      await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [currentQty, stockId]);
    } else {
      if (!stockId) {
        stockId = `stock-${Date.now()}`;
        currentQty = quantity;
        await pool.query(
          'INSERT INTO ESTOQUE_MUNICOES (ID_ESTOQUE_MUNICOES, CALIBRE_ID_ESTOQUE_MUNICOES, QUANTIDADE_ESTOQUE_MUNICOES, DEPARTAMENTO_ID_ESTOQUE_MUNICOES, UNIDADE_ID_ESTOQUE_MUNICOES, COFRE_ID_ESTOQUE_MUNICOES, DATA_ATUALIZACAO_ESTOQUE_MUNICOES) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [stockId, caliberId, currentQty, vault.department_id, vault.unit_id, vaultSpaceId]
        );
      } else {
        currentQty += quantity;
        await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [currentQty, stockId]);
      }
    }

    const movId = `ammomov-${Date.now()}`;
    const cleanObs = (observation || '').slice(0, 500);

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
    if (actor && actor.role && !['Geral', 'Armeiro', 'Administrador'].includes(actor.role) && !actor.canMoveAmmunition) {
      return res.status(403).json({ error: 'Permissão negada. Apenas Armeiros e usuários Gerais podem excluir lançamentos de munições.' });
    }

    // Retrieve movement to reconcile inventory stocks before deletion
    const [rows]: any = await pool.query('SELECT * FROM ammo_movements WHERE id = ?', [id]);
    if (rows && rows.length > 0) {
      const mov = rows[0];

      // If Saída is being deleted: restore the net consumed ammunition back into the vault stock
      if (mov.type === 'Saída') {
        const netConsumed = Math.max(0, mov.quantity - (mov.returned_quantity || 0));
        if (netConsumed > 0 && mov.vault_space_id && mov.caliber_id) {
          const [stocks]: any = await pool.query(
            'SELECT * FROM ammo_stocks WHERE vault_space_id = ? AND caliber_id = ?',
            [mov.vault_space_id, mov.caliber_id]
          );
          if (stocks && stocks.length > 0) {
            const newQty = stocks[0].quantity + netConsumed;
            await pool.query('UPDATE ESTOQUE_MUNICOES SET QUANTIDADE_ESTOQUE_MUNICOES = ? WHERE ID_ESTOQUE_MUNICOES = ?', [newQty, stocks[0].id]);
          } else {
            const stockId = `stock-${Date.now()}`;
            await pool.query(
              'INSERT INTO ammo_stocks (id, caliber_id, quantity, department_id, unit_id, vault_space_id) VALUES (?, ?, ?, ?, ?, ?)',
              [stockId, mov.caliber_id, netConsumed, mov.department_id, mov.unit_id, mov.vault_space_id]
            );
          }
        }
      }
      // If Entrada is being deleted: decrease the added stock from the vault
      else if (mov.type === 'Entrada') {
        if (mov.quantity > 0 && mov.vault_space_id && mov.caliber_id) {
          const [stocks]: any = await pool.query(
            'SELECT * FROM ammo_stocks WHERE vault_space_id = ? AND caliber_id = ?',
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
    const [rows]: any = await pool.query(`
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
        TIROS_DISPARADOS_ARMAS as shotCount,
        LOCAL_ANTERIOR_COFRE_ID_ARMAS as previousVaultSpaceId,
        DATA_CRIACAO_ARMAS as createdAt
      FROM ARMAS 
      ORDER BY DATA_CRIACAO_ARMAS ASC
    `);

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
    const [weaps]: any = await pool.query('SELECT ID_ARMAS as id, NUMERO_SERIE_ARMAS as serial_number, MODELO_ARMAS as model, TIPO_ARMAS as type, CALIBRE_ARMAS as caliber, DEPARTAMENTO_ID_ARMAS as department_id, UNIDADE_ID_ARMAS as unit_id, COFRE_ID_ARMAS as vault_space_id, STATUS_ARMAS as status FROM ARMAS WHERE ID_ARMAS = ?', [weaponId]);
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
        NUMERO_MODULO_CURSOS_ACADEMIA as module_number,
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
          DATAS_CURSOS_ACADEMIA, NOME_DEPARTAMENTO_CURSOS_ACADEMIA, DATA_INICIO_CURSOS_ACADEMIA, NUMERO_MODULO_CURSOS_ACADEMIA,
          QUANTIDADE_AULAS_CURSOS_ACADEMIA, DADOS_AULAS_CURSOS_ACADEMIA, DEPARTAMENTO_ID_CURSOS_ACADEMIA, UNIDADE_ID_CURSOS_ACADEMIA, DATA_CRIACAO_CURSOS_ACADEMIA
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
        CODIGO_TURMAS_CURSO as turma_code,
        QUANTIDADE_ALUNOS_TURMAS_CURSO as student_count,
        IDS_PROFESSORES_TURMAS_CURSO as teacher_ids,
        NOME_PROFESSOR_TURMAS_CURSO as teacher_name,
        DEPARTAMENTO_ID_TURMAS_CURSO as department_id,
        UNIDADE_ID_TURMAS_CURSO as unit_id,
        PRIMEIRA_DATA_AULA_TURMAS_CURSO as first_lesson_date,
        ULTIMA_DATA_AULA_TURMAS_CURSO as last_lesson_date,
        TURMA_CALENDARIO_TURMAS_CURSO as calendar_turma,
        DATA_CRIACAO_TURMAS_CURSO as created_at
      FROM TURMAS_CURSO ORDER BY DATA_CRIACAO_TURMAS_CURSO DESC
    `);

    let teacherMap: Record<string, string> = {};
    try {
      const [tchRows]: any = await pool.query('SELECT id, name, user_id FROM teachers');
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
        const [tchRows]: any = await pool.query('SELECT id, name, user_id FROM teachers');
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
        const [tchRows]: any = await pool.query('SELECT id, name, user_id FROM teachers');
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
        CODIGO_TURMA_MOVIMENTACOES_TURMA as class_code,
        PLANO_AULA_ID_MOVIMENTACOES_TURMA as lesson_plan_id,
        NOME_PLANO_AULA_MOVIMENTACOES_TURMA as lesson_name,
        NUMERO_AULA_MOVIMENTACOES_TURMA as lesson_number,
        NOME_PROFESSOR_MOVIMENTACOES_TURMA as teacher_name,
        CAIXA_ARMAS_ID_MOVIMENTACOES_TURMA as weapon_box_id,
        NOME_CAIXA_ARMAS_MOVIMENTACOES_TURMA as weapon_box_name,
        IDS_ARMAS_MOVIMENTACOES_TURMA as weapon_ids,
        CALIBRE_ID_MOVIMENTACOES_TURMA as caliber_id,
        COFRE_ID_MOVIMENTACOES_TURMA as vault_space_id,
        MUNICAO_FORNECIDA_MOVIMENTACOES_TURMA as ammo_provided,
        QUANTIDADE_ALUNOS_MOVIMENTACOES_TURMA as student_count,
        TIROS_POR_ALUNO_MOVIMENTACOES_TURMA as shots_per_student,
        TIROS_INSTRUTOR_MOVIMENTACOES_TURMA as instructor_shots,
        MUNICAO_USADA_MOVIMENTACOES_TURMA as ammo_used,
        MUNICAO_DEVOLVIDA_MOVIMENTACOES_TURMA as ammo_returned,
        CARREGADORES_EXTRAS_MOVIMENTACOES_TURMA as extra_magazines,
        STATUS_MOVIMENTACOES_TURMA as status,
        EMITIDO_POR_NOME_MOVIMENTACOES_TURMA as issued_by_name,
        DEVOLVIDO_POR_NOME_MOVIMENTACOES_TURMA as returned_by_name,
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
    const { ammoReturned, ammoUsed, returnedMaterials, notes, returnedByUserName, actor } = req.body;

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
          (ID_CALENDARIO_AULAS, DATA_CALENDARIO_CALENDARIO_AULAS, HORARIO_CALENDARIO_CALENDARIO_AULAS, TURMA_CALENDARIO_CALENDARIO_AULAS, SIGLA_CALENDARIO_CALENDARIO_AULAS, DISCIPLINA_CALENDARIO_CALENDARIO_AULAS, SALA_CALENDARIO_CALENDARIO_AULAS, CURSO_CALENDARIO_CALENDARIO_AULAS, MODULO_CALENDARIO_CALENDARIO_AULAS, ANO_CALENDARIO_CALENDARIO_AULAS, NUMERO_AULA_CALENDARIO_CALENDARIO_AULAS, EQUIPE_CALENDARIO_CALENDARIO_AULAS, OBSERVACAO_CALENDARIO_CALENDARIO_AULAS, DATA_CRIACAO_CALENDARIO_AULAS)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
          DATA_CALENDARIO_CALENDARIO_AULAS = VALUES(DATA_CALENDARIO_CALENDARIO_AULAS),
          HORARIO_CALENDARIO_CALENDARIO_AULAS = VALUES(HORARIO_CALENDARIO_CALENDARIO_AULAS),
          TURMA_CALENDARIO_CALENDARIO_AULAS = VALUES(TURMA_CALENDARIO_CALENDARIO_AULAS),
          SIGLA_CALENDARIO_CALENDARIO_AULAS = VALUES(SIGLA_CALENDARIO_CALENDARIO_AULAS),
          DISCIPLINA_CALENDARIO_CALENDARIO_AULAS = VALUES(DISCIPLINA_CALENDARIO_CALENDARIO_AULAS),
          SALA_CALENDARIO_CALENDARIO_AULAS = VALUES(SALA_CALENDARIO_CALENDARIO_AULAS),
          CURSO_CALENDARIO_CALENDARIO_AULAS = VALUES(CURSO_CALENDARIO_CALENDARIO_AULAS),
          MODULO_CALENDARIO_CALENDARIO_AULAS = VALUES(MODULO_CALENDARIO_CALENDARIO_AULAS),
          ANO_CALENDARIO_CALENDARIO_AULAS = VALUES(ANO_CALENDARIO_CALENDARIO_AULAS),
          NUMERO_AULA_CALENDARIO_CALENDARIO_AULAS = VALUES(NUMERO_AULA_CALENDARIO_CALENDARIO_AULAS),
          EQUIPE_CALENDARIO_CALENDARIO_AULAS = VALUES(EQUIPE_CALENDARIO_CALENDARIO_AULAS),
          OBSERVACAO_CALENDARIO_CALENDARIO_AULAS = VALUES(OBSERVACAO_CALENDARIO_CALENDARIO_AULAS)`,
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
        (ID_CALENDARIO_AULAS, DATA_CALENDARIO_CALENDARIO_AULAS, HORARIO_CALENDARIO_CALENDARIO_AULAS, TURMA_CALENDARIO_CALENDARIO_AULAS, SIGLA_CALENDARIO_CALENDARIO_AULAS, DISCIPLINA_CALENDARIO_CALENDARIO_AULAS, SALA_CALENDARIO_CALENDARIO_AULAS, CURSO_CALENDARIO_CALENDARIO_AULAS, MODULO_CALENDARIO_CALENDARIO_AULAS, ANO_CALENDARIO_CALENDARIO_AULAS, NUMERO_AULA_CALENDARIO_CALENDARIO_AULAS, EQUIPE_CALENDARIO_CALENDARIO_AULAS, OBSERVACAO_CALENDARIO_CALENDARIO_AULAS, DATA_CRIACAO_CALENDARIO_AULAS)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        DATA_CALENDARIO_CALENDARIO_AULAS = VALUES(DATA_CALENDARIO_CALENDARIO_AULAS),
        HORARIO_CALENDARIO_CALENDARIO_AULAS = VALUES(HORARIO_CALENDARIO_CALENDARIO_AULAS),
        TURMA_CALENDARIO_CALENDARIO_AULAS = VALUES(TURMA_CALENDARIO_CALENDARIO_AULAS),
        SIGLA_CALENDARIO_CALENDARIO_AULAS = VALUES(SIGLA_CALENDARIO_CALENDARIO_AULAS),
        DISCIPLINA_CALENDARIO_CALENDARIO_AULAS = VALUES(DISCIPLINA_CALENDARIO_CALENDARIO_AULAS),
        SALA_CALENDARIO_CALENDARIO_AULAS = VALUES(SALA_CALENDARIO_CALENDARIO_AULAS),
        CURSO_CALENDARIO_CALENDARIO_AULAS = VALUES(CURSO_CALENDARIO_CALENDARIO_AULAS),
        MODULO_CALENDARIO_CALENDARIO_AULAS = VALUES(MODULO_CALENDARIO_CALENDARIO_AULAS),
        ANO_CALENDARIO_CALENDARIO_AULAS = VALUES(ANO_CALENDARIO_CALENDARIO_AULAS),
        NUMERO_AULA_CALENDARIO_CALENDARIO_AULAS = VALUES(NUMERO_AULA_CALENDARIO_CALENDARIO_AULAS),
        EQUIPE_CALENDARIO_CALENDARIO_AULAS = VALUES(EQUIPE_CALENDARIO_CALENDARIO_AULAS),
        OBSERVACAO_CALENDARIO_CALENDARIO_AULAS = VALUES(OBSERVACAO_CALENDARIO_CALENDARIO_AULAS)`,
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
      : `SELECT id, codigo_autenticacao, titulo, nome_aluno, cpf_masp, descricao, 
                nome_arquivo, tamanho_bytes, tipo_mime, data_emissao, 
                criado_por_usuario_id, criado_por_nome, status, data_criacao, data_atualizacao 
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

    const allowedRoles = ['Geral', 'Administrador', 'Armeiro'];
    if (!allowedRoles.includes(actor.role)) {
      return res.status(403).json({ error: 'Apenas Armeiro, Administrador e perfil Geral têm permissão para transferir armas entre unidades.' });
    }

    // Restrição de Segurança: Somente será possível transferir uma arma da unidade que pertencer o armeiro ou administrador
    if (actor.role !== 'Geral') {
      if (actor.unitId && originUnitId && originUnitId !== actor.unitId) {
        return res.status(403).json({
          error: 'Você só possui permissão para transferir armas pertencentes à sua própria unidade.'
        });
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
        `SELECT ID_ARMAS as id, NUMERO_SERIE_ARMAS as numero_serie, STATUS_ARMAS as status, UNIDADE_ID_ARMAS as unidade_id FROM ARMAS WHERE ID_ARMAS IN (${weaponIdsToUpdate.map(() => '?').join(',')})`,
        weaponIdsToUpdate
      );

      for (const dw of (dbWeaps || [])) {
        // Validação da unidade da arma para Armeiro e Administrador
        if (actor.role !== 'Geral' && actor.unitId && dw.unidade_id !== actor.unitId) {
          return res.status(403).json({
            error: `A arma de série ${dw.numero_serie} não pertence à sua unidade e não pode ser transferida por você.`
          });
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
    const isGeral = actor.role === 'Geral';
    const isDestAdmin = actor.role === 'Administrador' && (actor.departmentId === transfer.destino_departamento_id || !actor.departmentId);
    const isDestArmeiro = actor.role === 'Armeiro' && (actor.unitId === transfer.destino_unidade_id || actor.departmentId === transfer.destino_departamento_id);

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
    const isGeral = actor.role === 'Geral';
    const isCreator = actor.id === transfer.responsavel_id;
    const isOriginAdmin = actor.role === 'Administrador' && (actor.departmentId === transfer.origem_departamento_id || !actor.departmentId);
    const isOriginArmeiro = actor.role === 'Armeiro' && (actor.unitId === transfer.origem_unidade_id || actor.departmentId === transfer.origem_departamento_id);
    const isDestAdmin = actor.role === 'Administrador' && (actor.departmentId === transfer.destino_departamento_id || !actor.departmentId);
    const isDestArmeiro = actor.role === 'Armeiro' && (actor.unitId === transfer.destino_unidade_id || actor.departmentId === transfer.destino_departamento_id);

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
      query += ' AND departamento_id = ?';
      params.push(departamentoId);
    }
    if (unidadeId) {
      query += ' AND unidade_id = ?';
      params.push(unidadeId);
    }

    query += ' ORDER BY nome ASC';
    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      tipoMaterialId: r.tipo_material_id,
      tipoMaterialNome: r.tipo_material_nome,
      nome: r.nome,
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
    if (!localGuarda || !localGuarda.trim()) {
      return res.status(400).json({ error: 'O local de guarda é obrigatório.' });
    }

    const qty = Math.max(1, parseInt(quantidade || '1', 10));
    const newId = id || `mat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    await pool.query(
      `INSERT INTO MATERIAIS 
        (id, tipo_material_id, tipo_material_nome, nome, quantidade, quantidade_disponivel, quantidade_em_uso, quantidade_consumida, departamento_id, departamento_nome, unidade_id, unidade_nome, validade, local_guarda, numero_serie, observacoes, criado_por_usuario_id, criado_por_nome, data_criacao, data_atualizacao)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
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
        localGuarda.trim(),
        numeroSerie ? numeroSerie.trim() : null,
        observacoes || null,
        criadoPorUsuarioId || null,
        criadoPorNome || null
      ]
    );

    await insertAuditLog(
      'Materiais',
      'Cadastro de Material',
      `Novo material cadastrado: "${nome}" (Qtd: ${qty}, Local: ${localGuarda}, Tipo: ${tipoMaterialNome}) na unidade ${unidadeNome || unidadeId}.`,
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
      numeroSerie,
      observacoes,
      updatedByUserId,
      updatedByName
    } = req.body;

    const [existingRows]: any = await pool.query('SELECT ID_MATERIAIS as id, NOME_MATERIAIS as nome, QUANTIDADE_MATERIAIS as quantidade, QUANTIDADE_DISPONIVEL_MATERIAIS as quantidade_disponivel, QUANTIDADE_EM_USO_MATERIAIS as quantidade_em_uso, QUANTIDADE_CONSUMIDA_MATERIAIS as quantidade_consumida FROM MATERIAIS WHERE ID_MATERIAIS = ?', [id]);
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Material não encontrado.' });
    }
    const current = existingRows[0];

    const newTotal = quantidade !== undefined ? Math.max(0, parseInt(quantidade, 10)) : current.quantidade;
    const inUse = Number(current.quantidade_em_uso || 0);
    const consumed = Number(current.quantidade_consumida || 0);
    const newDisponivel = Math.max(0, newTotal - inUse);

    await pool.query(
      `UPDATE MATERIAIS SET
        tipo_material_id = COALESCE(?, tipo_material_id),
        tipo_material_nome = COALESCE(?, tipo_material_nome),
        nome = COALESCE(?, nome),
        quantidade = ?,
        quantidade_disponivel = ?,
        departamento_id = COALESCE(?, departamento_id),
        departamento_nome = COALESCE(?, departamento_nome),
        unidade_id = COALESCE(?, unidade_id),
        unidade_nome = COALESCE(?, unidade_nome),
        validade = ?,
        local_guarda = COALESCE(?, local_guarda),
        numero_serie = ?,
        observacoes = ?,
        data_atualizacao = NOW()
       WHERE id = ?`,
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
        localGuarda ? localGuarda.trim() : null,
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
      query += ' AND departamento_id = ?';
      params.push(departamentoId);
    }
    if (unidadeId) {
      query += ' AND unidade_id = ?';
      params.push(unidadeId);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY data_retirada DESC';
    const [rows]: any = await pool.query(query, params);
    const mapped = (rows || []).map((r: any) => ({
      id: r.id,
      protocolo: r.protocolo,
      materialId: r.material_id,
      materialNome: r.material_nome,
      tipoMaterialNome: r.tipo_material_nome,
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
    const [matRows]: any = await pool.query('SELECT ID_MATERIAIS as id, NOME_MATERIAIS as nome, TIPO_MATERIAL_NOME_MATERIAIS as tipo_material_nome, QUANTIDADE_DISPONIVEL_MATERIAIS as quantidade_disponivel, QUANTIDADE_EM_USO_MATERIAIS as quantidade_em_uso, QUANTIDADE_CONSUMIDA_MATERIAIS as quantidade_consumida FROM MATERIAIS WHERE ID_MATERIAIS = ?', [materialId]);
    if (!matRows || matRows.length === 0) {
      return res.status(404).json({ error: 'Material não encontrado no estoque.' });
    }
    const mat = matRows[0];
    if (mat.quantidade_disponivel < qty) {
      return res.status(400).json({
        error: `Estoque insuficiente para cautela. Disponível: ${mat.quantidade_disponivel}, Solicitado: ${qty}.`
      });
    }

    if (tipoDestinatario === 'interno') {
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

    // Insert cautela
    await pool.query(
      `INSERT INTO CAUTELAS_MATERIAIS (
        id, protocolo, material_id, material_nome, tipo_material_nome, quantidade,
        tipo_destinatario, usuario_interno_id, usuario_interno_nome, usuario_interno_masp, usuario_interno_cargo,
        usuario_externo_nome, usuario_externo_documento, usuario_externo_orgao, usuario_externo_telefone,
        data_retirada, data_prevista_devolucao, finalidade, status, foi_consumido,
        responsavel_entrega_id, responsavel_entrega_nome, responsavel_entrega_masp,
        departamento_id, unidade_id, data_criacao, data_atualizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Em Uso', 0, ?, ?, ?, ?, ?, NOW(), NOW())`,
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
        responsavelEntregaId || 'sistema',
        responsavelEntregaNome || 'Armeiro',
        responsavelEntregaMasp || null,
        departamentoId || mat.departamento_id,
        unidadeId || mat.unidade_id
      ]
    );

    // Update material quantities: reduce available, increase in_use
    await pool.query(
      `UPDATE MATERIAIS SET 
        quantidade_disponivel = quantidade_disponivel - ?,
        quantidade_em_uso = quantidade_em_uso + ?,
        data_atualizacao = NOW()
       WHERE id = ?`,
      [qty, qty, materialId]
    );

    const recipientDesc = tipoDestinatario === 'interno'
      ? `${usuarioInternoNome} (MASP: ${usuarioInternoMasp || 'N/D'})`
      : `${usuarioExternoNome} (Externo - ${usuarioExternoOrgao || 'Sem órgão informado'})`;

    await insertAuditLog(
      'Materiais',
      'Cautela de Material',
      `Cautela realizada (${proto}): ${qty}x "${mat.nome}" entregue para ${recipientDesc}. Finalidade: ${finalidade}.`,
      { id: responsavelEntregaId, name: responsavelEntregaNome, masp: responsavelEntregaMasp },
      req.ip
    );

    return res.json({ success: true, id: newId, protocolo: proto });
  } catch (err: any) {
    console.error('Error creating cautela_material:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Registrar Devolução / Comunicação de Uso ou Anomalias / Material que se perca
apiRouter.put('/cautelas-materiais/:id/devolucao', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const {
      status, // 'Devolvido' | 'Consumido' | 'Devolvido com Anomalia'
      foiConsumido, // Se foi utilizado e não retornará mais
      relatoUsoAnomalias, // Comunicação de uso ou anomalias
      dataDevolucao,
      responsavelRecebimentoId,
      responsavelRecebimentoNome,
      responsavelRecebimentoMasp
    } = req.body;

    const [cautRows]: any = await pool.query('SELECT ID_CAUTELAS_MATERIAIS as id, PROTOCOLO_CAUTELAS_MATERIAIS as protocolo, MATERIAL_ID_CAUTELAS_MATERIAIS as material_id, QUANTIDADE_CAUTELAS_MATERIAIS as quantidade, STATUS_CAUTELAS_MATERIAIS as status FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);
    if (!cautRows || cautRows.length === 0) {
      return res.status(404).json({ error: 'Cautela de material não encontrada.' });
    }
    const caut = cautRows[0];
    if (caut.status !== 'Em Uso') {
      return res.status(400).json({ error: `Esta cautela já se encontra finalizada com status "${caut.status}".` });
    }

    const qty = Number(caut.quantidade || 1);
    const isConsumed = Boolean(foiConsumido || status === 'Consumido');
    const finalStatus = isConsumed
      ? 'Consumido'
      : (status === 'Devolvido com Anomalia' ? 'Devolvido com Anomalia' : 'Devolvido');
    const returnDate = dataDevolucao ? new Date(dataDevolucao) : new Date();

    // 1. Update cautela record
    await pool.query(
      `UPDATE CAUTELAS_MATERIAIS SET
        status = ?,
        foi_consumido = ?,
        relato_uso_anomalias = ?,
        data_devolucao = ?,
        responsavel_recebimento_id = ?,
        responsavel_recebimento_nome = ?,
        responsavel_recebimento_masp = ?,
        data_atualizacao = NOW()
       WHERE id = ?`,
      [
        finalStatus,
        isConsumed ? 1 : 0,
        relatoUsoAnomalias || null,
        returnDate,
        responsavelRecebimentoId || null,
        responsavelRecebimentoNome || null,
        responsavelRecebimentoMasp || null,
        id
      ]
    );

    // 2. Update material inventory
    if (isConsumed) {
      // Material foi utilizado e não retornará mais ao estoque!
      // Reduz estoque total, zera quantidade em uso desta cautela, incrementa consumido
      await pool.query(
        `UPDATE MATERIAIS SET
          quantidade = GREATEST(0, quantidade - ?),
          quantidade_em_uso = GREATEST(0, quantidade_em_uso - ?),
          quantidade_consumida = quantidade_consumida + ?,
          data_atualizacao = NOW()
         WHERE id = ?`,
        [qty, qty, qty, caut.material_id]
      );
    } else {
      // Retorna ao estoque disponível
      await pool.query(
        `UPDATE MATERIAIS SET
          quantidade_disponivel = quantidade_disponivel + ?,
          quantidade_em_uso = GREATEST(0, quantidade_em_uso - ?),
          data_atualizacao = NOW()
         WHERE id = ?`,
        [qty, qty, caut.material_id]
      );
    }

    const actor = {
      id: responsavelRecebimentoId,
      name: responsavelRecebimentoNome,
      masp: responsavelRecebimentoMasp
    };

    let detailsMsg = `Devolução/Baixa de material (${caut.protocolo || caut.id}): ${qty}x "${caut.material_nome}" finalizada com status "${finalStatus}".`;
    if (isConsumed) {
      detailsMsg += ` Material declarado como CONSUMIDO/UTILIZADO EM OPERAÇÃO (baixa permanente no estoque).`;
    }
    if (relatoUsoAnomalias) {
      detailsMsg += ` Relato/Anomalias: "${relatoUsoAnomalias}".`;
    }

    await insertAuditLog(
      'Materiais',
      isConsumed ? 'Baixa de Material (Consumo)' : 'Devolução de Material',
      detailsMsg,
      actor,
      req.ip
    );

    return res.json({ success: true, status: finalStatus, isConsumed });
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

    const [cautRows]: any = await pool.query('SELECT ID_CAUTELAS_MATERIAIS as id, PROTOCOLO_CAUTELAS_MATERIAIS as protocolo, MATERIAL_ID_CAUTELAS_MATERIAIS as material_id, QUANTIDADE_CAUTELAS_MATERIAIS as quantidade, STATUS_CAUTELAS_MATERIAIS as status FROM CAUTELAS_MATERIAIS WHERE ID_CAUTELAS_MATERIAIS = ?', [id]);
    if (!cautRows || cautRows.length === 0) {
      return res.status(404).json({ error: 'Cautela não encontrada.' });
    }
    const caut = cautRows[0];

    // If deleting an active loan, restore available stock
    if (caut.status === 'Em Uso') {
      const qty = Number(caut.quantidade || 1);
      await pool.query(
        `UPDATE MATERIAIS SET
          quantidade_disponivel = quantidade_disponivel + ?,
          quantidade_em_uso = GREATEST(0, quantidade_em_uso - ?),
          data_atualizacao = NOW()
         WHERE id = ?`,
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






