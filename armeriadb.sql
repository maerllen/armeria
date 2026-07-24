-- ====================================================================
-- SCRIPT DE CRIAÇÃO E CONFIGURAÇÃO DO BANCO DE DADOS MYSQL
-- BANCO: u552818109_Armeriadb
-- USUÁRIO: u552818109_Armeria_user
-- SENHA: OtR2832120135++--
-- SISTEMA: ARMERIA - Gestão de Armas e Munições
-- ====================================================================

-- 1. CRIAÇÃO DO BANCO DE DADOS E USUÁRIO MYSQL
CREATE DATABASE IF NOT EXISTS `u552818109_Armeriadb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Criar e conceder privilégios ao usuário (se tiver permissão de ROOT/cPanel/Hostinger)
-- Nota: Na Hostinger / cPanel, crie o banco e usuário pelo painel e vincule com Todos os Privilégios.
CREATE USER IF NOT EXISTS 'u552818109_Armeria_user'@'%' IDENTIFIED BY 'OtR2832120135++--';
CREATE USER IF NOT EXISTS 'u552818109_Armeria_user'@'localhost' IDENTIFIED BY 'OtR2832120135++--';

GRANT ALL PRIVILEGES ON `u552818109_Armeriadb`.* TO 'u552818109_Armeria_user'@'%';
GRANT ALL PRIVILEGES ON `u552818109_Armeriadb`.* TO 'u552818109_Armeria_user'@'localhost';
FLUSH PRIVILEGES;

USE `u552818109_Armeriadb`;

-- Desabilitar verificação de chaves estrangeiras temporariamente para reinstalação limpa
SET FOREIGN_KEY_CHECKS = 0;

-- ====================================================================
-- 2. SCHEMAS E TABELAS DO SISTEMA DE ARMARIA
-- ====================================================================

-- Tabela de Departamentos
CREATE TABLE IF NOT EXISTS `departments` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Unidades
CREATE TABLE IF NOT EXISTS `units` (
    `id` VARCHAR(64) NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_units_dept` (`department_id`),
    CONSTRAINT `fk_units_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Usuários (Policiais, Armeiros, Admins, Geral)
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_users_masp` (`masp`),
    KEY `idx_users_dept` (`department_id`),
    KEY `idx_users_unit` (`unit_id`),
    CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_users_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Calibres
CREATE TABLE IF NOT EXISTS `calibers` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_calibers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Cursos de Habilitação
CREATE TABLE IF NOT EXISTS `courses` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `allowed_models` JSON NOT NULL,
    `allowed_calibers` JSON NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_courses_dept` (`department_id`),
    CONSTRAINT `fk_courses_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela N:M de Cursos do Policial
CREATE TABLE IF NOT EXISTS `user_courses` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `course_id` VARCHAR(64) NOT NULL,
    `completion_date` DATE NOT NULL,
    `expiration_date` DATE DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_uc_user` (`user_id`),
    KEY `idx_uc_course` (`course_id`),
    CONSTRAINT `fk_uc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_uc_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Locais no Cofre (Vault Spaces)
CREATE TABLE IF NOT EXISTS `vault_spaces` (
    `id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `type` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_vault_dept` (`department_id`),
    KEY `idx_vault_unit` (`unit_id`),
    CONSTRAINT `fk_vault_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_vault_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Armas (Acervo)
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
    `last_maintenance_date` DATE DEFAULT NULL,
    `last_maintenance_responsible` VARCHAR(255) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_weapons_serial` (`serial_number`),
    KEY `idx_weapons_dept` (`department_id`),
    KEY `idx_weapons_unit` (`unit_id`),
    KEY `idx_weapons_vault` (`vault_space_id`),
    CONSTRAINT `fk_weapons_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_weapons_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_weapons_vault` FOREIGN KEY (`vault_space_id`) REFERENCES `vault_spaces` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Estoque de Munições por Cofre
CREATE TABLE IF NOT EXISTS `ammo_stocks` (
    `id` VARCHAR(64) NOT NULL,
    `caliber_id` VARCHAR(64) NOT NULL,
    `quantity` INT NOT NULL DEFAULT 0,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `vault_space_id` VARCHAR(64) DEFAULT NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ammo_caliber` (`caliber_id`),
    KEY `idx_ammo_dept` (`department_id`),
    KEY `idx_ammo_unit` (`unit_id`),
    KEY `idx_ammo_vault` (`vault_space_id`),
    CONSTRAINT `fk_ammo_caliber` FOREIGN KEY (`caliber_id`) REFERENCES `calibers` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ammo_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ammo_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ammo_vault` FOREIGN KEY (`vault_space_id`) REFERENCES `vault_spaces` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Movimentações de Armas (Cautela/Aprovação/Devolução)
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
    PRIMARY KEY (`id`),
    KEY `idx_wm_weapon` (`weapon_id`),
    KEY `idx_wm_requester` (`requester_id`),
    CONSTRAINT `fk_wm_weapon` FOREIGN KEY (`weapon_id`) REFERENCES `weapons` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_wm_requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Movimentações de Munições (Entrada / Saída)
CREATE TABLE IF NOT EXISTS `ammo_movements` (
    `id` VARCHAR(64) NOT NULL,
    `type` ENUM('Entrada', 'Saída') NOT NULL,
    `caliber_id` VARCHAR(64) NOT NULL,
    `quantity` INT NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `vault_space_id` VARCHAR(64) DEFAULT NULL,
    `recipient_or_reason` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(64) DEFAULT NULL,
    `user_name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_am_caliber` (`caliber_id`),
    CONSTRAINT `fk_am_caliber` FOREIGN KEY (`caliber_id`) REFERENCES `calibers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de Logs de Auditoria
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

-- Habilitar verificação de chaves estrangeiras novamente
SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- 3. CARGA INICIAL DE DADOS PADRÃO (SEED DATA)
-- ====================================================================

-- Departamentos Padrão
INSERT INTO `departments` (`id`, `name`, `code`) VALUES
('dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'DOE-COE'),
('dept-dhpp', 'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA (DHPP)', 'DHPP'),
('dept-dic', 'DEPARTAMENTO DE INVESTIGAÇÕES CRIMINAIS (DIC)', 'DIC')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Unidades Padrão
INSERT INTO `units` (`id`, `department_id`, `name`) VALUES
('unit-coe-insp', 'dept-coe', 'INSPETORIA COE'),
('unit-coe-grt', 'dept-coe', 'GRUPO DE RESGATE TÁTICO (GRT)'),
('unit-dhpp-1', 'dept-dhpp', '1ª DELEGACIA DE HOMICÍDIOS'),
('unit-dic-cargas', 'dept-dic', 'DELEGACIA DE REPRESSÃO AO ROUBO DE CARGAS')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Calibres Padrão
INSERT INTO `calibers` (`id`, `name`) VALUES
('cal-556', '5,56x45mm'),
('cal-40', '.40 S&W'),
('cal-9mm', '9x19mm'),
('cal-380', '.380 ACP'),
('cal-12ga', '12 GA')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Cursos Padrão
INSERT INTO `courses` (`id`, `name`, `allowed_models`, `allowed_calibers`, `department_id`) VALUES
('course-fuzil', 'Operador de fuzil', '["T4", "IA2", "M4A1"]', '["5,56x45mm"]', 'dept-coe'),
('course-pistola', 'Operador de Pistola', '["PT92", "Glock G22", "TH40", "PT840"]', '([".40 S&W", "9x19mm"])', 'dept-coe'),
('course-12', 'Operador de Espingarda C12', '["CBC 586-P", "Benelli M4"]', '["12 GA"]', 'dept-coe')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Cofres Padrão
INSERT INTO `vault_spaces` (`id`, `code`, `type`, `department_id`, `unit_id`) VALUES
('vault-coe-1', 'A1-G1', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
('vault-coe-2', 'A1-G2', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
('vault-coe-3', 'C1-L1', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
('vault-coe-4', 'C1-L2', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
('vault-dhpp-1', 'B1-G1', 'ARMAS', 'dept-dhpp', 'unit-dhpp-1'),
('vault-dhpp-2', 'M1-L1', 'MUNIÇÕES', 'dept-dhpp', 'unit-dhpp-1')
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);

-- Usuários Iniciais de Acesso
INSERT INTO `users` (`id`, `masp`, `name`, `phone`, `cargo`, `role`, `department_id`, `unit_id`, `can_move_ammo`, `can_move_weapons`, `has_system_access`, `password`, `must_change_password`) VALUES
('usr-master-geral', '1255748', 'Administrador Geral Master', '31999998888', 'Delegado', 'Geral', 'dept-coe', 'unit-coe-insp', 1, 1, 1, '1255748', 1),
('usr-admin-coe', '2222222', 'Dr. Roberto Silva (Admin DOE)', '31988887777', 'Delegado', 'Administrador', 'dept-coe', 'unit-coe-insp', 1, 1, 1, '2222222', 0),
('usr-armeiro-coe', '3333333', 'Agente Carlos Andrade (Armeiro COE)', '31977776666', 'Investigador', 'Armeiro', 'dept-coe', 'unit-coe-insp', 1, 1, 1, '3333333', 0),
('usr-policial-coe', '4444444', 'Policial Eduardo Costa', '31966665555', 'Investigador', 'Policial', 'dept-coe', 'unit-coe-insp', 0, 0, 1, '4444444', 0),
('usr-policial-dhpp', '5555555', 'Escrivã Ana Lima', '31955554444', 'Escrivão', 'Policial', 'dept-dhpp', 'unit-dhpp-1', 0, 0, 1, '5555555', 0)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Armas Iniciais
INSERT INTO `weapons` (`id`, `type`, `serial_number`, `manufacturer`, `model`, `caliber`, `magazine_quantity`, `status`, `department_id`, `unit_id`, `vault_space_id`, `last_maintenance_date`, `last_maintenance_responsible`) VALUES
('weap-1', 'Fuzil', 'EKG-5486', 'Taurus', 'T4', '5,56x45mm', 4, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-1', '2026-05-10', 'Agente Carlos Andrade'),
('weap-2', 'Pistola', 'PT-998822', 'Taurus', 'PT92', '.40 S&W', 3, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-2', '2026-06-15', 'Agente Carlos Andrade'),
('weap-3', 'Espingarda', 'CBC-12009', 'CBC', 'CBC 586-P', '12 GA', 1, 'No Cofre', 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-1', '2026-04-01', 'Armeiro DHPP')
ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);

-- Estoque Inicial de Munições
INSERT INTO `ammo_stocks` (`id`, `caliber_id`, `quantity`, `department_id`, `unit_id`, `vault_space_id`) VALUES
('stock-1', 'cal-556', 2500, 'dept-coe', 'unit-coe-insp', 'vault-coe-3'),
('stock-2', 'cal-40', 1200, 'dept-coe', 'unit-coe-insp', 'vault-coe-4'),
('stock-3', 'cal-9mm', 800, 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-2')
ON DUPLICATE KEY UPDATE `quantity` = VALUES(`quantity`);

-- Final do Script
