import mysql from 'mysql2/promise';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'u552818109_Armeriadb',
  user: process.env.DB_USER || 'u552818109_Armeria_user',
  password: process.env.DB_PASSWORD || 'OtR2832120135++--',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
};

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

export async function testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const currentPool = getPool();
    const connection = await currentPool.getConnection();
    const [rows]: any = await connection.query('SELECT 1 as connected, NOW() as server_time, VERSION() as version');
    connection.release();
    return {
      success: true,
      message: 'Conexão com o banco de dados MySQL realizada com sucesso!',
      details: rows[0],
    };
  } catch (error: any) {
    console.error('[MySQL Error]', error.message);
    return {
      success: false,
      message: `Erro ao conectar com o banco de dados MySQL (${error.code || 'UNKNOWN'}): ${error.message}`,
    };
  }
}

export async function initializeDatabaseSchema(): Promise<{ success: boolean; message: string; log?: string[] }> {
  const logs: string[] = [];
  try {
    const currentPool = getPool();
    const connection = await currentPool.getConnection();
    logs.push('Conectado ao servidor MySQL.');

    // Ensure database exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${dbConfig.database}\`;`);
    logs.push(`Banco de dados '${dbConfig.database}' selecionado.`);

    // Create departments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`departments\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`code\` VARCHAR(64) DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'departments' verificada/criada.");

    // Create units
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`units\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_units_dept\` (\`department_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'units' verificada/criada.");

    // Create users
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`masp\` VARCHAR(32) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`phone\` VARCHAR(32) DEFAULT NULL,
        \`cargo\` VARCHAR(64) NOT NULL,
        \`role\` ENUM('Policial', 'Armeiro', 'Administrador', 'Geral') NOT NULL DEFAULT 'Policial',
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`unit_id\` VARCHAR(64) DEFAULT NULL,
        \`can_move_ammo\` TINYINT(1) NOT NULL DEFAULT 0,
        \`can_move_weapons\` TINYINT(1) NOT NULL DEFAULT 0,
        \`has_system_access\` TINYINT(1) NOT NULL DEFAULT 1,
        \`password\` VARCHAR(255) NOT NULL,
        \`must_change_password\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_users_masp\` (\`masp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'users' verificada/criada.");

    // Create calibers
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`calibers\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(128) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_calibers_name\` (\`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'calibers' verificada/criada.");

    // Create courses
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`courses\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`allowed_models\` JSON NOT NULL,
        \`allowed_calibers\` JSON NOT NULL,
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'courses' verificada/criada.");

    // Create vault_spaces
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`vault_spaces\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`code\` VARCHAR(64) NOT NULL,
        \`type\` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`unit_id\` VARCHAR(64) DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'vault_spaces' verificada/criada.");

    // Create weapons
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`weapons\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`type\` VARCHAR(64) NOT NULL,
        \`serial_number\` VARCHAR(128) NOT NULL,
        \`manufacturer\` VARCHAR(128) NOT NULL,
        \`model\` VARCHAR(128) NOT NULL,
        \`caliber\` VARCHAR(128) NOT NULL,
        \`magazine_quantity\` INT NOT NULL DEFAULT 1,
        \`status\` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo') NOT NULL DEFAULT 'No Cofre',
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`unit_id\` VARCHAR(64) DEFAULT NULL,
        \`vault_space_id\` VARCHAR(64) DEFAULT NULL,
        \`last_maintenance_date\` DATE DEFAULT NULL,
        \`last_maintenance_responsible\` VARCHAR(255) DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_weapons_serial\` (\`serial_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'weapons' verificada/criada.");

    // Create ammo_stocks
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`ammo_stocks\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`caliber_id\` VARCHAR(64) NOT NULL,
        \`quantity\` INT NOT NULL DEFAULT 0,
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`unit_id\` VARCHAR(64) DEFAULT NULL,
        \`vault_space_id\` VARCHAR(64) DEFAULT NULL,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'ammo_stocks' verificada/criada.");

    // Create weapon_movements
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`weapon_movements\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`weapon_id\` VARCHAR(64) NOT NULL,
        \`weapon_serial_number\` VARCHAR(128) NOT NULL,
        \`weapon_model\` VARCHAR(128) NOT NULL,
        \`weapon_type\` VARCHAR(64) DEFAULT NULL,
        \`caliber\` VARCHAR(128) DEFAULT NULL,
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`unit_id\` VARCHAR(64) DEFAULT NULL,
        \`requester_id\` VARCHAR(64) NOT NULL,
        \`requester_name\` VARCHAR(255) NOT NULL,
        \`requester_masp\` VARCHAR(32) NOT NULL,
        \`withdrawal_vault_space_id\` VARCHAR(64) DEFAULT NULL,
        \`return_vault_space_id\` VARCHAR(64) DEFAULT NULL,
        \`ammunition_count\` INT NOT NULL DEFAULT 0,
        \`magazine_count\` INT NOT NULL DEFAULT 0,
        \`returning_ammunition_count\` INT NOT NULL DEFAULT 0,
        \`returning_magazine_count\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(64) NOT NULL,
        \`approved_by_user_id\` VARCHAR(64) DEFAULT NULL,
        \`approved_by_user_name\` VARCHAR(255) DEFAULT NULL,
        \`approval_date\` DATETIME DEFAULT NULL,
        \`receipt_confirmed_by_user_id\` VARCHAR(64) DEFAULT NULL,
        \`receipt_confirmed_by_user_name\` VARCHAR(255) DEFAULT NULL,
        \`receipt_date\` DATETIME DEFAULT NULL,
        \`has_divergence\` TINYINT(1) NOT NULL DEFAULT 0,
        \`divergence_justification\` TEXT DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'weapon_movements' verificada/criada.");

    // Create ammo_movements
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`ammo_movements\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`type\` ENUM('Entrada', 'Saída') NOT NULL,
        \`caliber_id\` VARCHAR(64) NOT NULL,
        \`quantity\` INT NOT NULL,
        \`department_id\` VARCHAR(64) DEFAULT NULL,
        \`unit_id\` VARCHAR(64) DEFAULT NULL,
        \`vault_space_id\` VARCHAR(64) DEFAULT NULL,
        \`recipient_or_reason\` VARCHAR(255) NOT NULL,
        \`user_id\` VARCHAR(64) DEFAULT NULL,
        \`user_name\` VARCHAR(255) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'ammo_movements' verificada/criada.");

    // Create audit_logs
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`audit_logs\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`module\` VARCHAR(64) NOT NULL,
        \`action\` VARCHAR(64) NOT NULL,
        \`details\` TEXT NOT NULL,
        \`user_id\` VARCHAR(64) DEFAULT NULL,
        \`user_name\` VARCHAR(255) NOT NULL,
        \`user_masp\` VARCHAR(32) NOT NULL,
        \`user_role\` VARCHAR(32) NOT NULL,
        \`ip_address\` VARCHAR(64) DEFAULT NULL,
        \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    logs.push("Tabela 'audit_logs' verificada/criada.");

    // --- SEEDING INITIAL DATA IF EMPTY ---
    const [deptRows]: any = await connection.query('SELECT COUNT(*) as count FROM departments');
    if (deptRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'departments'...");
      await connection.query(`
        INSERT INTO departments (id, name, code) VALUES
        ('dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'DOE-COE'),
        ('dept-dhpp', 'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA (DHPP)', 'DHPP'),
        ('dept-dic', 'DEPARTAMENTO DE INVESTIGAÇÕES CRIMINAIS (DIC)', 'DIC');
      `);
    }

    const [unitRows]: any = await connection.query('SELECT COUNT(*) as count FROM units');
    if (unitRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'units'...");
      await connection.query(`
        INSERT INTO units (id, department_id, name) VALUES
        ('unit-coe-insp', 'dept-coe', 'INSPETORIA COE'),
        ('unit-coe-grt', 'dept-coe', 'GRUPO DE RESGATE TÁTICO (GRT)'),
        ('unit-dhpp-1', 'dept-dhpp', '1ª DELEGACIA DE HOMICÍDIOS'),
        ('unit-dic-cargas', 'dept-dic', 'DELEGACIA DE REPRESSÃO AO ROUBO DE CARGAS');
      `);
    }

    const [caliberRows]: any = await connection.query('SELECT COUNT(*) as count FROM calibers');
    if (caliberRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'calibers'...");
      await connection.query(`
        INSERT INTO calibers (id, name) VALUES
        ('cal-556', '5,56x45mm'),
        ('cal-40', '.40 S&W'),
        ('cal-9mm', '9x19mm'),
        ('cal-380', '.380 ACP'),
        ('cal-12ga', '12 GA');
      `);
    }

    const [courseRows]: any = await connection.query('SELECT COUNT(*) as count FROM courses');
    if (courseRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'courses'...");
      await connection.query(`
        INSERT INTO courses (id, name, allowed_models, allowed_calibers, department_id) VALUES
        ('course-fuzil', 'Operador de fuzil', '["T4", "IA2", "M4A1"]', '["5,56x45mm"]', 'dept-coe'),
        ('course-pistola', 'Operador de Pistola', '["PT92", "Glock G22", "TH40", "PT840"]', '[".40 S&W", "9x19mm"]', 'dept-coe'),
        ('course-12', 'Operador de Espingarda C12', '["CBC 586-P", "Benelli M4"]', '["12 GA"]', 'dept-coe');
      `);
    }

    const [vaultRows]: any = await connection.query('SELECT COUNT(*) as count FROM vault_spaces');
    if (vaultRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'vault_spaces'...");
      await connection.query(`
        INSERT INTO vault_spaces (id, code, type, department_id, unit_id) VALUES
        ('vault-coe-1', 'A1-G1', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
        ('vault-coe-2', 'A1-G2', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
        ('vault-coe-3', 'C1-L1', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
        ('vault-coe-4', 'C1-L2', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
        ('vault-dhpp-1', 'B1-G1', 'ARMAS', 'dept-dhpp', 'unit-dhpp-1'),
        ('vault-dhpp-2', 'M1-L1', 'MUNIÇÕES', 'dept-dhpp', 'unit-dhpp-1');
      `);
    }

    const [userRows]: any = await connection.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'users'...");
      await connection.query(`
        INSERT INTO users (id, masp, name, phone, cargo, role, department_id, unit_id, can_move_ammo, can_move_weapons, has_system_access, password, must_change_password) VALUES
        ('usr-master-geral', '1255748', 'Administrador Geral Master', '31999998888', 'Delegado', 'Geral', 'dept-coe', 'unit-coe-insp', 1, 1, 1, '1255748', 1),
        ('usr-admin-coe', '2222222', 'Dr. Roberto Silva (Admin DOE)', '31988887777', 'Delegado', 'Administrador', 'dept-coe', 'unit-coe-insp', 1, 1, 1, '2222222', 0),
        ('usr-armeiro-coe', '3333333', 'Agente Carlos Andrade (Armeiro COE)', '31977776666', 'Investigador', 'Armeiro', 'dept-coe', 'unit-coe-insp', 1, 1, 1, '3333333', 0),
        ('usr-policial-coe', '4444444', 'Policial Eduardo Costa', '31966665555', 'Investigador', 'Policial', 'dept-coe', 'unit-coe-insp', 0, 0, 1, '4444444', 0),
        ('usr-policial-dhpp', '5555555', 'Escrivã Ana Lima', '31955554444', 'Escrivão', 'Policial', 'dept-dhpp', 'unit-dhpp-1', 0, 0, 1, '5555555', 0);
      `);

      // Seed user_courses
      await connection.query(`
        INSERT INTO user_courses (id, user_id, course_id, completion_date, expiration_date) VALUES
        ('uc-1', 'usr-master-geral', 'course-fuzil', '2025-10-15', '2027-10-15'),
        ('uc-2', 'usr-master-geral', 'course-pistola', '2025-11-20', '2027-11-20'),
        ('uc-3', 'usr-admin-coe', 'course-fuzil', '2025-05-10', '2027-05-10'),
        ('uc-4', 'usr-admin-coe', 'course-pistola', '2025-06-01', '2027-06-01'),
        ('uc-5', 'usr-armeiro-coe', 'course-fuzil', '2025-01-15', '2027-01-15'),
        ('uc-6', 'usr-armeiro-coe', 'course-pistola', '2025-02-10', '2027-02-10'),
        ('uc-7', 'usr-armeiro-coe', 'course-12', '2025-03-01', '2027-03-01'),
        ('uc-8', 'usr-policial-coe', 'course-fuzil', '2025-08-12', '2027-08-12'),
        ('uc-9', 'usr-policial-coe', 'course-pistola', '2023-01-10', '2025-01-10'),
        ('uc-10', 'usr-policial-dhpp', 'course-pistola', '2025-04-10', '2027-04-10');
      `);
    }

    const [weaponRows]: any = await connection.query('SELECT COUNT(*) as count FROM weapons');
    if (weaponRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'weapons'...");
      await connection.query(`
        INSERT INTO weapons (id, type, serial_number, manufacturer, model, caliber, magazine_quantity, status, department_id, unit_id, vault_space_id, last_maintenance_date, last_maintenance_responsible) VALUES
        ('weap-1', 'Fuzil', 'EKG-5486', 'Taurus', 'T4', '5,56x45mm', 4, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-1', '2026-05-10', 'Agente Carlos Andrade'),
        ('weap-2', 'Pistola', 'PT-998822', 'Taurus', 'PT92', '.40 S&W', 3, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-2', '2026-06-15', 'Agente Carlos Andrade'),
        ('weap-3', 'Espingarda', 'CBC-12009', 'CBC', 'CBC 586-P', '12 GA', 1, 'No Cofre', 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-1', '2026-04-01', 'Armeiro DHPP');
      `);
    }

    const [ammoStockRows]: any = await connection.query('SELECT COUNT(*) as count FROM ammo_stocks');
    if (ammoStockRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'ammo_stocks'...");
      await connection.query(`
        INSERT INTO ammo_stocks (id, caliber_id, quantity, department_id, unit_id, vault_space_id) VALUES
        ('stock-1', 'cal-556', 2500, 'dept-coe', 'unit-coe-insp', 'vault-coe-3'),
        ('stock-2', 'cal-40', 1200, 'dept-coe', 'unit-coe-insp', 'vault-coe-4'),
        ('stock-3', 'cal-9mm', 800, 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-2');
      `);
    }

    const [auditRows]: any = await connection.query('SELECT COUNT(*) as count FROM audit_logs');
    if (auditRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'audit_logs'...");
      await connection.query(`
        INSERT INTO audit_logs (id, timestamp, user_id, user_name, user_masp, user_role, module, action, details, ip_address) VALUES
        ('log-1', NOW(), 'usr-master-geral', 'Administrador Geral Master', '1255748', 'Geral', 'Unidade', 'Criar', 'Inicialização do sistema e cadastro das unidades padrão no MySQL', '192.168.1.100');
      `);
    }

    connection.release();
    return {
      success: true,
      message: 'Todas as tabelas do MySQL foram criadas/verificadas com sucesso!',
      log: logs,
    };
  } catch (err: any) {
    console.error('[MySQL Init Schema Error]', err);
    return {
      success: false,
      message: `Erro ao inicializar tabelas MySQL: ${err.message}`,
      log: logs,
    };
  }
}
