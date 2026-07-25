-- ==============================================================================
-- SCRIPT DE MIGRAÇÃO / ATUALIZAÇÃO SEGURA DO BANCO DE DADOS MYSQL - ARMERIA PCMG
-- ==============================================================================
-- Este script:
-- 1. Cria o banco de dados e as tabelas caso não existam (CREATE TABLE IF NOT EXISTS).
-- 2. Utiliza uma Stored Procedure para ADICIONAR CAMPOS QUE FALTAM em tabelas existentes
--    SEM APAGAR ou AFETAR dados já cadastrados.
-- 3. Pode ser executado com segurança no phpMyAdmin / MySQL Workbench / Hostinger.
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. CRIAR PROCEDURE TEMPORÁRIA PARA ADIÇÃO SEGURA DE COLUNAS
DELIMITER $$

DROP PROCEDURE IF EXISTS `AddColumnIfNotExists`$$

CREATE PROCEDURE `AddColumnIfNotExists`(
    IN `p_table` VARCHAR(64),
    IN `p_column` VARCHAR(64),
    IN `p_definition` TEXT
)
BEGIN
    DECLARE col_count INT;
    
    SELECT COUNT(*) INTO col_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column;
      
    IF col_count = 0 THEN
        SET @sql_stmt = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @sql_stmt;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- ==============================================================================
-- 2. CRIAÇÃO DAS TABELAS (CASO NÃO EXISTAM)
-- ==============================================================================

-- DEPARTMENTS
CREATE TABLE IF NOT EXISTS `departments` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- UNITS
CREATE TABLE IF NOT EXISTS `units` (
  `id` VARCHAR(64) NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_units_dept` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- USERS
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL,
  `masp` VARCHAR(32) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `cargo` VARCHAR(64) NOT NULL,
  `role` ENUM('Policial', 'Armeiro', 'Administrador', 'Geral') NOT NULL DEFAULT 'Policial',
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `can_move_ammo` TINYINT(1) NOT NULL DEFAULT 0,
  `can_move_weapons` TINYINT(1) NOT NULL DEFAULT 0,
  `has_system_access` TINYINT(1) NOT NULL DEFAULT 1,
  `password` VARCHAR(255) NOT NULL,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
  `is_teacher` TINYINT(1) NOT NULL DEFAULT 0,
  `teacher_subject` VARCHAR(32) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_masp` (`masp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CALIBERS
CREATE TABLE IF NOT EXISTS `calibers` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_calibers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COURSES
CREATE TABLE IF NOT EXISTS `courses` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `allowed_models` JSON NOT NULL,
  `allowed_calibers` JSON NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- USER COURSES
CREATE TABLE IF NOT EXISTS `user_courses` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `course_id` VARCHAR(64) NOT NULL,
  `completion_date` DATE DEFAULT NULL,
  `expiration_date` DATE DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_uc_user` (`user_id`),
  KEY `idx_uc_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- VAULT SPACES
CREATE TABLE IF NOT EXISTS `vault_spaces` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `type` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WEAPONS
CREATE TABLE IF NOT EXISTS `weapons` (
  `id` VARCHAR(64) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `serial_number` VARCHAR(128) NOT NULL,
  `manufacturer` VARCHAR(128) NOT NULL,
  `model` VARCHAR(128) NOT NULL,
  `caliber` VARCHAR(128) NOT NULL,
  `magazine_quantity` INT NOT NULL DEFAULT 1,
  `status` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo') NOT NULL DEFAULT 'No Cofre',
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `vault_space_id` VARCHAR(64) DEFAULT NULL,
  `location_note` VARCHAR(255) DEFAULT NULL,
  `last_maintenance_date` DATE DEFAULT NULL,
  `last_maintenance_responsible` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_weapons_serial` (`serial_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AMMO STOCKS
CREATE TABLE IF NOT EXISTS `ammo_stocks` (
  `id` VARCHAR(64) NOT NULL,
  `caliber_id` VARCHAR(64) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 0,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `vault_space_id` VARCHAR(64) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WEAPON MOVEMENTS
CREATE TABLE IF NOT EXISTS `weapon_movements` (
  `id` VARCHAR(64) NOT NULL,
  `weapon_id` VARCHAR(64) NOT NULL,
  `weapon_serial_number` VARCHAR(128) NOT NULL,
  `weapon_model` VARCHAR(128) NOT NULL,
  `weapon_type` VARCHAR(64) DEFAULT NULL,
  `caliber` VARCHAR(128) DEFAULT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `requester_id` VARCHAR(64) NOT NULL,
  `requester_name` VARCHAR(255) NOT NULL,
  `requester_masp` VARCHAR(32) NOT NULL,
  `withdrawal_vault_space_id` VARCHAR(64) DEFAULT NULL,
  `return_vault_space_id` VARCHAR(64) DEFAULT NULL,
  `ammunition_count` INT NOT NULL DEFAULT 0,
  `magazine_count` INT NOT NULL DEFAULT 0,
  `returning_ammunition_count` INT NOT NULL DEFAULT 0,
  `returning_magazine_count` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(64) NOT NULL,
  `approved_by_user_id` VARCHAR(64) DEFAULT NULL,
  `approved_by_user_name` VARCHAR(255) DEFAULT NULL,
  `approval_date` DATETIME DEFAULT NULL,
  `receipt_confirmed_by_user_id` VARCHAR(64) DEFAULT NULL,
  `receipt_confirmed_by_user_name` VARCHAR(255) DEFAULT NULL,
  `receipt_date` DATETIME DEFAULT NULL,
  `has_divergence` TINYINT(1) NOT NULL DEFAULT 0,
  `divergence_justification` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AMMO MOVEMENTS
CREATE TABLE IF NOT EXISTS `ammo_movements` (
  `id` VARCHAR(64) NOT NULL,
  `type` ENUM('Entrada', 'Saída') NOT NULL,
  `caliber_id` VARCHAR(64) NOT NULL,
  `quantity` INT NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `vault_space_id` VARCHAR(64) DEFAULT NULL,
  `recipient_or_reason` VARCHAR(255) NOT NULL,
  `responsible_type` VARCHAR(32) DEFAULT 'SISTEMA',
  `responsible_user_id` VARCHAR(64) DEFAULT NULL,
  `responsible_name` VARCHAR(255) DEFAULT NULL,
  `responsible_masp` VARCHAR(64) DEFAULT NULL,
  `observation` VARCHAR(500) DEFAULT NULL,
  `returned_quantity` INT DEFAULT 0,
  `returned_at` DATETIME DEFAULT NULL,
  `returned_by_user_name` VARCHAR(255) DEFAULT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `user_name` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `module` VARCHAR(64) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `details` TEXT NOT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `user_name` VARCHAR(255) NOT NULL,
  `user_masp` VARCHAR(32) NOT NULL,
  `user_role` VARCHAR(32) NOT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ACADEMY COURSES
CREATE TABLE IF NOT EXISTS `academy_courses` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('Formação', 'Ensino Continuado') NOT NULL,
  `career` VARCHAR(64) DEFAULT NULL,
  `start_date` DATE DEFAULT NULL,
  `module_number` INT DEFAULT NULL,
  `lesson_count` INT NOT NULL DEFAULT 1,
  `lessons_data` JSON NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WEAPON BOXES
CREATE TABLE IF NOT EXISTS `weapon_boxes` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `course_type` VARCHAR(64) NOT NULL,
  `weapon_count` INT NOT NULL,
  `weapon_ids` JSON NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WEAPON BOX REPLACEMENTS
CREATE TABLE IF NOT EXISTS `weapon_box_replacements` (
  `id` VARCHAR(64) NOT NULL,
  `box_id` VARCHAR(64) NOT NULL,
  `box_name` VARCHAR(255) NOT NULL,
  `old_weapon_id` VARCHAR(64) NOT NULL,
  `old_weapon_desc` VARCHAR(255) NOT NULL,
  `new_weapon_id` VARCHAR(64) NOT NULL,
  `new_weapon_desc` VARCHAR(255) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `teacher_name` VARCHAR(255) DEFAULT NULL,
  `responsible_user_name` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COURSE CLASSES (TURMAS)
CREATE TABLE IF NOT EXISTS `course_classes` (
  `id` VARCHAR(64) NOT NULL,
  `course_id` VARCHAR(64) NOT NULL,
  `course_name` VARCHAR(255) NOT NULL,
  `subject` ENUM('MEAF', 'TAP', 'DP') NOT NULL,
  `career` VARCHAR(64) NOT NULL,
  `career_abbreviation` VARCHAR(16) NOT NULL,
  `turma_number` VARCHAR(32) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `student_count` INT NOT NULL DEFAULT 1,
  `teacher_user_ids` JSON NOT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `unit_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COURSE CLASS MOVEMENTS
CREATE TABLE IF NOT EXISTS `course_class_movements` (
  `id` VARCHAR(64) NOT NULL,
  `course_id` VARCHAR(64) NOT NULL,
  `class_id` VARCHAR(64) NOT NULL,
  `turma_code` VARCHAR(64) NOT NULL,
  `lesson_number` INT NOT NULL,
  `teacher_name` VARCHAR(255) NOT NULL,
  `weapon_box_id` VARCHAR(64) DEFAULT NULL,
  `weapon_box_name` VARCHAR(255) DEFAULT NULL,
  `weapon_ids` JSON DEFAULT NULL,
  `caliber_id` VARCHAR(64) DEFAULT NULL,
  `vault_space_id` VARCHAR(64) DEFAULT NULL,
  `ammo_supplied` INT DEFAULT 0,
  `student_count` INT DEFAULT 0,
  `shots_per_student` INT DEFAULT 0,
  `instructor_shots` INT DEFAULT 0,
  `ammo_used` INT DEFAULT 0,
  `ammo_returned` INT DEFAULT 0,
  `extra_magazines_count` INT DEFAULT 0,
  `status` ENUM('Em Aula', 'Finalizada') NOT NULL DEFAULT 'Em Aula',
  `issued_by_user_name` VARCHAR(255) NOT NULL,
  `returned_by_user_name` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `returned_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ==============================================================================
-- 3. ADICIONAL DE COLUNAS EM TABELAS EXISTENTES (MIGRAÇÕES SEGURAS)
-- ==============================================================================

-- Tabela users
CALL AddColumnIfNotExists('users', 'is_teacher', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColumnIfNotExists('users', 'teacher_subject', 'VARCHAR(32) DEFAULT NULL');

-- Tabela weapons
CALL AddColumnIfNotExists('weapons', 'location_note', 'VARCHAR(255) DEFAULT NULL');

-- Tabela ammo_movements
CALL AddColumnIfNotExists('ammo_movements', 'responsible_type', 'VARCHAR(32) DEFAULT "SISTEMA"');
CALL AddColumnIfNotExists('ammo_movements', 'responsible_user_id', 'VARCHAR(64) DEFAULT NULL');
CALL AddColumnIfNotExists('ammo_movements', 'responsible_name', 'VARCHAR(255) DEFAULT NULL');
CALL AddColumnIfNotExists('ammo_movements', 'responsible_masp', 'VARCHAR(64) DEFAULT NULL');
CALL AddColumnIfNotExists('ammo_movements', 'observation', 'VARCHAR(500) DEFAULT NULL');
CALL AddColumnIfNotExists('ammo_movements', 'returned_quantity', 'INT DEFAULT 0');
CALL AddColumnIfNotExists('ammo_movements', 'returned_at', 'DATETIME DEFAULT NULL');
CALL AddColumnIfNotExists('ammo_movements', 'returned_by_user_name', 'VARCHAR(255) DEFAULT NULL');

-- Limpeza da procedure auxiliar
DROP PROCEDURE IF EXISTS `AddColumnIfNotExists`;

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- FIM DO SCRIPT DE MIGRAÇÃO
-- ==============================================================================
