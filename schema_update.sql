-- ==============================================================================
-- SCRIPT DE MIGRAÇÃO E ATUALIZAÇÃO DO BANCO DE DADOS MYSQL (ARMERIA PCMG)
-- ==============================================================================
-- Este script é TOTALMENTE SEGURO para execução em bancos já existentes.
-- Ele utiliza 'CREATE TABLE IF NOT EXISTS' para tabelas novas e Procedures para
-- adicionar colunas ausentes sem risco de perda ou exclusão de dados.
-- ==============================================================================

-- 1. DEPARTAMENTOS
CREATE TABLE IF NOT EXISTS `departments` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. UNIDADES
CREATE TABLE IF NOT EXISTS `units` (
  `id` VARCHAR(64) PRIMARY KEY,
  `department_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_units_dept` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. CALIBRES
CREATE TABLE IF NOT EXISTS `calibers` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. ESPAÇOS / COFRES
CREATE TABLE IF NOT EXISTS `vault_spaces` (
  `id` VARCHAR(64) PRIMARY KEY,
  `unit_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `space_number` INT DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_vault_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. USUÁRIOS / POLICIAIS
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `masp` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `cargo` VARCHAR(128) DEFAULT NULL,
  `role` VARCHAR(64) DEFAULT 'Operacional',
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `can_move_ammo` TINYINT(1) DEFAULT 0,
  `can_move_weapons` TINYINT(1) DEFAULT 0,
  `has_system_access` TINYINT(1) DEFAULT 1,
  `is_teacher` TINYINT(1) DEFAULT 0,
  `teacher_subject` VARCHAR(255) DEFAULT NULL,
  `courses` TEXT DEFAULT NULL,
  `password` VARCHAR(255) DEFAULT NULL,
  `must_change_password` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_users_masp` (`masp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. CAIXAS DE ARMAMENTO
CREATE TABLE IF NOT EXISTS `weapon_boxes` (
  `id` VARCHAR(64) PRIMARY KEY,
  `box_number` VARCHAR(64) NOT NULL,
  `qr_code` VARCHAR(255) DEFAULT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `space_number` INT DEFAULT 1,
  `weapon_count` INT DEFAULT 0,
  `model` VARCHAR(128) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. REPOSIÇÕES DE CAIXAS DE ARMAMENTO
CREATE TABLE IF NOT EXISTS `weapon_box_replacements` (
  `id` VARCHAR(64) PRIMARY KEY,
  `box_id` VARCHAR(64) NOT NULL,
  `date` VARCHAR(32) NOT NULL,
  `requester_name` VARCHAR(255) NOT NULL,
  `requester_masp` VARCHAR(64) DEFAULT NULL,
  `replacement_reason` VARCHAR(255) DEFAULT NULL,
  `observation` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_repl_box` (`box_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. CURSOS DE HABILITAÇÃO EM ARMAS
CREATE TABLE IF NOT EXISTS `courses` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `allowed_weapon_types` TEXT DEFAULT NULL,
  `allowed_models` TEXT DEFAULT NULL,
  `allowed_calibers` TEXT DEFAULT NULL,
  `shots_per_student` INT DEFAULT 50,
  `shots_per_weapon_type` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. TIPOS DE ARMAS DISPONÍVEIS
CREATE TABLE IF NOT EXISTS `available_weapon_types` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `models` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. CURSOS DA ACADEMIA (ACADEPOL)
CREATE TABLE IF NOT EXISTS `academy_courses` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `code` VARCHAR(64) DEFAULT NULL,
  `department_name` VARCHAR(255) DEFAULT NULL,
  `dates` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. TURMAS DE CURSOS
CREATE TABLE IF NOT EXISTS `course_classes` (
  `id` VARCHAR(64) PRIMARY KEY,
  `course_name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `class_number` INT DEFAULT 1,
  `dates` TEXT DEFAULT NULL,
  `student_count` INT DEFAULT 0,
  `shots_per_student` INT DEFAULT 0,
  `total_shots` INT DEFAULT 0,
  `is_closed` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. PLANOS DE AULA
CREATE TABLE IF NOT EXISTS `lesson_plans` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `date` VARCHAR(32) NOT NULL,
  `shots_per_student` INT DEFAULT 0,
  `ammo_type` VARCHAR(128) DEFAULT NULL,
  `target_type` VARCHAR(128) DEFAULT NULL,
  `student_count` INT DEFAULT 0,
  `total_shots` INT DEFAULT 0,
  `observations` TEXT DEFAULT NULL,
  `is_closed` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. ESTOQUE DE MUNIÇÕES
CREATE TABLE IF NOT EXISTS `ammunition_stocks` (
  `id` VARCHAR(64) PRIMARY KEY,
  `department_id` VARCHAR(64) NOT NULL,
  `unit_id` VARCHAR(64) NOT NULL,
  `space_id` VARCHAR(64) NOT NULL,
  `caliber_id` VARCHAR(64) NOT NULL,
  `total_quantity` INT DEFAULT 0,
  `available_quantity` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ammo_stock_lookup` (`department_id`, `unit_id`, `space_id`, `caliber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. MOVIMENTAÇÕES DE MUNIÇÕES
CREATE TABLE IF NOT EXISTS `ammunition_movements` (
  `id` VARCHAR(64) PRIMARY KEY,
  `stock_id` VARCHAR(64) DEFAULT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `caliber_id` VARCHAR(64) DEFAULT NULL,
  `space_id` VARCHAR(64) DEFAULT NULL,
  `type` VARCHAR(32) NOT NULL,
  `quantity` INT NOT NULL,
  `reason` VARCHAR(255) DEFAULT NULL,
  `responsible_type` VARCHAR(64) DEFAULT NULL,
  `responsible_user_id` VARCHAR(64) DEFAULT NULL,
  `responsible_name` VARCHAR(255) DEFAULT NULL,
  `responsible_masp` VARCHAR(64) DEFAULT NULL,
  `observation` TEXT DEFAULT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `user_name` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ammo_mov_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. ARMAMENTOS
CREATE TABLE IF NOT EXISTS `weapons` (
  `id` VARCHAR(64) PRIMARY KEY,
  `asset_number` VARCHAR(64) DEFAULT NULL,
  `serial_number` VARCHAR(64) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `model` VARCHAR(128) NOT NULL,
  `caliber` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) DEFAULT 'DISPONIVEL',
  `department_id` VARCHAR(64) NOT NULL,
  `unit_id` VARCHAR(64) NOT NULL,
  `space_id` VARCHAR(64) DEFAULT NULL,
  `box_id` VARCHAR(64) DEFAULT NULL,
  `registration_date` VARCHAR(32) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_weapons_serial` (`serial_number`),
  INDEX `idx_weapons_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. MOVIMENTAÇÕES DE ARMAMENTOS (CAUTELAS / DEVOLUÇÕES / TRANSITO)
CREATE TABLE IF NOT EXISTS `weapon_movements` (
  `id` VARCHAR(64) PRIMARY KEY,
  `weapon_id` VARCHAR(64) NOT NULL,
  `weapon_serial` VARCHAR(64) DEFAULT NULL,
  `weapon_asset` VARCHAR(64) DEFAULT NULL,
  `weapon_type` VARCHAR(64) DEFAULT NULL,
  `weapon_model` VARCHAR(128) DEFAULT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `requester_id` VARCHAR(64) DEFAULT NULL,
  `requester_name` VARCHAR(255) NOT NULL,
  `requester_masp` VARCHAR(32) NOT NULL,
  `withdrawal_vault_space_id` VARCHAR(64) DEFAULT NULL,
  `ammunition_count` INT DEFAULT 0,
  `magazine_count` INT DEFAULT 0,
  `destination` VARCHAR(255) DEFAULT NULL,
  `service_type` VARCHAR(128) DEFAULT NULL,
  `observation` TEXT DEFAULT NULL,
  `status` VARCHAR(32) DEFAULT 'EM_USO',
  `withdrawal_date` VARCHAR(64) NOT NULL,
  `expected_return_date` VARCHAR(64) DEFAULT NULL,
  `actual_return_date` VARCHAR(64) DEFAULT NULL,
  `armorer_id` VARCHAR(64) DEFAULT NULL,
  `armorer_name` VARCHAR(255) DEFAULT NULL,
  `return_armorer_id` VARCHAR(64) DEFAULT NULL,
  `return_armorer_name` VARCHAR(255) DEFAULT NULL,
  `return_observation` TEXT DEFAULT NULL,
  `return_ammunition_count` INT DEFAULT NULL,
  `return_magazine_count` INT DEFAULT NULL,
  `return_vault_space_id` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_wm_weapon` (`weapon_id`),
  INDEX `idx_wm_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. LOGS DE AUDITORIA
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `user_name` VARCHAR(255) DEFAULT NULL,
  `user_masp` VARCHAR(32) NOT NULL,
  `user_role` VARCHAR(64) DEFAULT NULL,
  `module` VARCHAR(128) NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `details` TEXT DEFAULT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  INDEX `idx_audit_user` (`user_masp`),
  INDEX `idx_audit_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- GARANTIR COLUNAS EM TABELAS QUE JÁ EXISTIAM (PROCEDURE SEGURA DE ALTER TABLE)
-- ==============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `AddColumnIfNotExists`$$

CREATE PROCEDURE `AddColumnIfNotExists`(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_def VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT NULL 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = p_table_name 
          AND COLUMN_NAME = p_column_name
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ', p_column_def);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- Adição de colunas novas com suporte a bancos antigos
CALL AddColumnIfNotExists('users', 'is_teacher', 'TINYINT(1) DEFAULT 0');
CALL AddColumnIfNotExists('users', 'teacher_subject', 'VARCHAR(255) DEFAULT NULL');
CALL AddColumnIfNotExists('users', 'courses', 'TEXT DEFAULT NULL');
CALL AddColumnIfNotExists('users', 'password', 'VARCHAR(255) DEFAULT NULL');
CALL AddColumnIfNotExists('users', 'must_change_password', 'TINYINT(1) DEFAULT 0');

CALL AddColumnIfNotExists('weapon_boxes', 'model', 'VARCHAR(128) DEFAULT NULL');
CALL AddColumnIfNotExists('weapon_boxes', 'weapon_count', 'INT DEFAULT 0');

CALL AddColumnIfNotExists('ammunition_movements', 'responsible_type', 'VARCHAR(64) DEFAULT NULL');
CALL AddColumnIfNotExists('ammunition_movements', 'responsible_user_id', 'VARCHAR(64) DEFAULT NULL');
CALL AddColumnIfNotExists('ammunition_movements', 'responsible_name', 'VARCHAR(255) DEFAULT NULL');
CALL AddColumnIfNotExists('ammunition_movements', 'responsible_masp', 'VARCHAR(64) DEFAULT NULL');
CALL AddColumnIfNotExists('ammunition_movements', 'observation', 'TEXT DEFAULT NULL');

CALL AddColumnIfNotExists('weapon_movements', 'weapon_type', 'VARCHAR(64) DEFAULT NULL');
CALL AddColumnIfNotExists('weapon_movements', 'weapon_model', 'VARCHAR(128) DEFAULT NULL');
CALL AddColumnIfNotExists('weapon_movements', 'return_ammunition_count', 'INT DEFAULT NULL');
CALL AddColumnIfNotExists('weapon_movements', 'return_magazine_count', 'INT DEFAULT NULL');
CALL AddColumnIfNotExists('weapon_movements', 'return_vault_space_id', 'VARCHAR(64) DEFAULT NULL');

CALL AddColumnIfNotExists('courses', 'allowed_weapon_types', 'TEXT DEFAULT NULL');
CALL AddColumnIfNotExists('courses', 'shots_per_student', 'INT DEFAULT 50');
CALL AddColumnIfNotExists('courses', 'shots_per_weapon_type', 'TEXT DEFAULT NULL');

-- Limpeza da procedure auxiliar
DROP PROCEDURE IF EXISTS `AddColumnIfNotExists`;

-- ==============================================================================
-- FIM DO SCRIPT DE MIGRAÇÃO
-- ==============================================================================
