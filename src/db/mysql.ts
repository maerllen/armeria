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
