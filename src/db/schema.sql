-- ====================================================================
-- SCRIPT COMPLETO E ATUALIZADO DE BANCO DE DADOS MYSQL
-- SISTEMA: ARMERIA - Gestão de Armas, Munições e Cursos
-- BANCO DE DADOS: u552818109_Armeriadb
-- ====================================================================

-- 1. SELEÇÃO DO BANCO DE DADOS (Informa qual banco utilizar)
-- Nota: Em hospedagens como Hostinger / cPanel, o banco e o usuário já
-- são criados pelo painel administrativo.
CREATE DATABASE IF NOT EXISTS `u552818109_Armeriadb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `u552818109_Armeriadb`;

-- Desabilitar verificação de chaves estrangeiras temporariamente
SET FOREIGN_KEY_CHECKS = 0;

-- ====================================================================
-- 2. CRIAÇÃO DAS TABELAS COM TODAS AS COLUNAS E ESTRUTURAS ATUALIZADAS
-- ====================================================================

-- 2.1 Departamentos
CREATE TABLE IF NOT EXISTS `departments` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.2 Unidades
CREATE TABLE IF NOT EXISTS `units` (
    `id` VARCHAR(64) NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_units_dept` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.3 Usuários (Policiais, Armeiros, Admins, Geral, Professores)
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
    `is_teacher` TINYINT(1) NOT NULL DEFAULT 0,
    `teacher_subject` VARCHAR(32) DEFAULT NULL,
    `password` VARCHAR(255) NOT NULL,
    `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_users_masp` (`masp`),
    KEY `idx_users_dept` (`department_id`),
    KEY `idx_users_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.4 Calibres
CREATE TABLE IF NOT EXISTS `calibers` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_calibers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.5 Cursos de Habilitação Geral
CREATE TABLE IF NOT EXISTS `courses` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `allowed_models` JSON NOT NULL,
    `allowed_calibers` JSON NOT NULL,
    `allowed_weapon_types` JSON DEFAULT NULL,
    `shots_per_student` INT DEFAULT 0,
    `shots_per_weapon_type` JSON DEFAULT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_courses_dept` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.6 Tipos de Armas e Modelos Cadastrados
CREATE TABLE IF NOT EXISTS `available_weapon_types` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `models` JSON NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.7 Cursos Concluídos pelo Policial
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

-- 2.8 Locais no Cofre (Vault Spaces)
CREATE TABLE IF NOT EXISTS `vault_spaces` (
    `id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `type` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_vault_dept` (`department_id`),
    KEY `idx_vault_unit` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.9 Acervo de Armas
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
    UNIQUE KEY `uk_weapons_serial` (`serial_number`),
    KEY `idx_weapons_dept` (`department_id`),
    KEY `idx_weapons_unit` (`unit_id`),
    KEY `idx_weapons_vault` (`vault_space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.10 Estoque de Munições por Cofre
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
    KEY `idx_ammo_vault` (`vault_space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.11 Movimentações de Armas (Cautela/Aprovação/Devolução)
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
    KEY `idx_wm_requester` (`requester_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.12 Movimentações de Munições (Entrada / Saída / Aulas CFTP)
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
    PRIMARY KEY (`id`),
    KEY `idx_am_caliber` (`caliber_id`),
    KEY `idx_am_vault` (`vault_space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.13 Logs de Auditoria
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

-- 2.14 Academia de Polícia: Cursos (Formação, Ensino Continuado, etc.)
CREATE TABLE IF NOT EXISTS `academy_courses` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` ENUM('Formação', 'Ensino Continuado') NOT NULL,
    `career` VARCHAR(64) DEFAULT NULL,
    `code` VARCHAR(64) DEFAULT NULL,
    `dates` JSON DEFAULT NULL,
    `department_name` VARCHAR(255) DEFAULT NULL,
    `start_date` DATE DEFAULT NULL,
    `end_date` DATE DEFAULT NULL,
    `module` VARCHAR(64) DEFAULT NULL,
    `module_number` INT DEFAULT NULL,
    `teaching_department_name` VARCHAR(255) DEFAULT NULL,
    `teaching_department_id` VARCHAR(64) DEFAULT NULL,
    `location_department_name` VARCHAR(255) DEFAULT NULL,
    `location_department_id` VARCHAR(64) DEFAULT NULL,
    `duration_days` INT DEFAULT 1,
    `subject` VARCHAR(100) DEFAULT NULL,
    `lesson_count` INT NOT NULL DEFAULT 1,
    `lessons_data` JSON NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.15 Caixas de Armas de Aula
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

-- 2.16 Histórico de Substituição de Armas em Caixas
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

-- 2.17 Turmas dos Cursos (Course Classes)
CREATE TABLE IF NOT EXISTS `course_classes` (
    `id` VARCHAR(64) NOT NULL,
    `course_id` VARCHAR(64) DEFAULT NULL,
    `course_name` VARCHAR(255) NOT NULL,
    `subject` ENUM('MEAF', 'TAP', 'DP') NOT NULL,
    `career` VARCHAR(64) NOT NULL,
    `career_abbreviation` VARCHAR(16) NOT NULL,
    `turma_number` VARCHAR(32) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `student_count` INT NOT NULL DEFAULT 1,
    `teacher_user_ids` JSON NOT NULL,
    `plano_de_aula` VARCHAR(64) DEFAULT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.18 Planos de Aula (Geral e Cursos de Formação)
CREATE TABLE IF NOT EXISTS `plano_de_aula_curso_de_formacao` (
    `id` VARCHAR(64) NOT NULL,
    `nome_do_plano` VARCHAR(255) NOT NULL,
    `carreira` VARCHAR(64) NOT NULL,
    `materia` VARCHAR(100) NOT NULL DEFAULT 'MEAF',
    `ano_de_vigencia_do_plano` INT NOT NULL,
    `numero_de_aulas` INT NOT NULL DEFAULT 1,
    `turma_code` VARCHAR(64) DEFAULT NULL,
    `type` VARCHAR(64) NOT NULL DEFAULT 'curso de formação',
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.18.1 Aulas Vinculadas ao Plano de Aula (Curso de Formação)
CREATE TABLE IF NOT EXISTS `aulas_plano_de_aula_curso_de_formacao` (
    `id` VARCHAR(64) NOT NULL,
    `plano_de_aula_id` VARCHAR(64) NOT NULL,
    `numero_da_aula` INT NOT NULL,
    `quantidade_de_tiros_por_aluno` INT NOT NULL DEFAULT 0,
    `calibre_usado` VARCHAR(64) NOT NULL DEFAULT '.40 S&W',
    `insumo_do_instrutor` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_plano_aula_num` (`plano_de_aula_id`, `numero_da_aula`),
    KEY `idx_aulas_plano_id` (`plano_de_aula_id`),
    CONSTRAINT `fk_aulas_plano_de_aula`
        FOREIGN KEY (`plano_de_aula_id`)
        REFERENCES `plano_de_aula_curso_de_formacao` (`id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lesson_plans` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `career` VARCHAR(64) NOT NULL,
    `year` INT NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `turma_code` VARCHAR(64) DEFAULT NULL,
    `lesson_count` INT NOT NULL DEFAULT 1,
    `lessons_data` JSON NOT NULL,
    `department_id` VARCHAR(64) DEFAULT NULL,
    `unit_id` VARCHAR(64) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.19 Movimentações e Mapas de Aula (Saída e Devolução CFTP)
CREATE TABLE IF NOT EXISTS `course_class_movements` (
    `id` VARCHAR(64) NOT NULL,
    `course_id` VARCHAR(64) DEFAULT NULL,
    `class_id` VARCHAR(64) DEFAULT NULL,
    `turma_code` VARCHAR(64) DEFAULT NULL,
    `lesson_plan_id` VARCHAR(64) DEFAULT NULL,
    `lesson_plan_name` VARCHAR(255) DEFAULT NULL,
    `lesson_number` INT NOT NULL DEFAULT 1,
    `teacher_name` VARCHAR(255) DEFAULT NULL,
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
    `returned_materials` TEXT DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `status` ENUM('Em Aula', 'Finalizada') NOT NULL DEFAULT 'Em Aula',
    `issued_by_user_name` VARCHAR(255) DEFAULT NULL,
    `returned_by_user_name` VARCHAR(255) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `returned_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================================================
-- 3. GARANTIA DE COLUNAS PARA BANCOS DE DADOS EXISTENTES (MIGRAÇÃO SUCINTA)
-- ====================================================================

-- Executa atualizações diretas de adaptação de tabelas caso o banco já existisse previamente
DROP PROCEDURE IF EXISTS `update_armeria_schema_proc`;
DELIMITER //
CREATE PROCEDURE `update_armeria_schema_proc`()
BEGIN
    -- users
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='is_teacher') THEN
        ALTER TABLE `users` ADD COLUMN `is_teacher` TINYINT(1) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='teacher_subject') THEN
        ALTER TABLE `users` ADD COLUMN `teacher_subject` VARCHAR(32) DEFAULT NULL;
    END IF;

    -- weapons
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='weapons' AND COLUMN_NAME='location_note') THEN
        ALTER TABLE `weapons` ADD COLUMN `location_note` VARCHAR(255) DEFAULT NULL;
    END IF;

    -- courses
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='allowed_weapon_types') THEN
        ALTER TABLE `courses` ADD COLUMN `allowed_weapon_types` JSON DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='shots_per_student') THEN
        ALTER TABLE `courses` ADD COLUMN `shots_per_student` INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='shots_per_weapon_type') THEN
        ALTER TABLE `courses` ADD COLUMN `shots_per_weapon_type` JSON DEFAULT NULL;
    END IF;

    -- academy_courses
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='code') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `code` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='dates') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `dates` JSON DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='department_name') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `department_name` VARCHAR(255) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='end_date') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `end_date` DATE DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='module') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `module` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='teaching_department_name') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `teaching_department_name` VARCHAR(255) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='teaching_department_id') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `teaching_department_id` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='location_department_name') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `location_department_name` VARCHAR(255) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='location_department_id') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `location_department_id` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='duration_days') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `duration_days` INT DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='academy_courses' AND COLUMN_NAME='subject') THEN
        ALTER TABLE `academy_courses` ADD COLUMN `subject` VARCHAR(100) DEFAULT NULL;
    END IF;

    -- course_classes
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='course_classes' AND COLUMN_NAME='teacher_name') THEN
        ALTER TABLE `course_classes` ADD COLUMN `teacher_name` VARCHAR(255) DEFAULT NULL;
    END IF;

    -- lesson_plans
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lesson_plans' AND COLUMN_NAME='turma_code') THEN
        ALTER TABLE `lesson_plans` ADD COLUMN `turma_code` VARCHAR(64) DEFAULT NULL;
    END IF;

    -- course_class_movements
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='course_class_movements' AND COLUMN_NAME='lesson_plan_id') THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `lesson_plan_id` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='course_class_movements' AND COLUMN_NAME='lesson_plan_name') THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `lesson_plan_name` VARCHAR(255) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='course_class_movements' AND COLUMN_NAME='returned_materials') THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `returned_materials` TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='course_class_movements' AND COLUMN_NAME='notes') THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `notes` TEXT DEFAULT NULL;
    END IF;

    -- ammo_movements
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='responsible_type') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `responsible_type` VARCHAR(32) DEFAULT 'SISTEMA';
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='responsible_user_id') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `responsible_user_id` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='responsible_name') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `responsible_name` VARCHAR(255) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='responsible_masp') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `responsible_masp` VARCHAR(64) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='observation') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `observation` VARCHAR(500) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='returned_quantity') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `returned_quantity` INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='returned_at') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `returned_at` DATETIME DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_movements' AND COLUMN_NAME='returned_by_user_name') THEN
        ALTER TABLE `ammo_movements` ADD COLUMN `returned_by_user_name` VARCHAR(255) DEFAULT NULL;
    END IF;
END //
DELIMITER ;

CALL `update_armeria_schema_proc`();
DROP PROCEDURE IF EXISTS `update_armeria_schema_proc`;

-- ====================================================================
-- 4. DADOS INICIAIS DE TESTE / SEED DATA (POPULAR TABELAS)
-- ====================================================================

-- Departamentos Padrão
INSERT INTO `departments` (`id`, `name`, `code`) VALUES
('dept-acad', 'ACADEMIA DE POLICIA', 'ACADEPOL'),
('dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'DOE-COE'),
('dept-dhpp', 'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA (DHPP)', 'DHPP'),
('dept-dic', 'DEPARTAMENTO DE INVESTIGAÇÕES CRIMINAIS (DIC)', 'DIC')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `code` = VALUES(`code`);

-- Unidades Padrão
INSERT INTO `units` (`id`, `department_id`, `name`) VALUES
('unit-acad-meaf', 'dept-acad', 'MEAF - Módulo de Ensino de Armamento e Tiro'),
('unit-coe-insp', 'dept-coe', 'INSPETORIA COE'),
('unit-coe-grt', 'dept-coe', 'GRUPO DE RESGATE TÁTICO (GRT)'),
('unit-dhpp-1', 'dept-dhpp', '1ª DELEGACIA DE HOMICÍDIOS'),
('unit-dic-cargas', 'dept-dic', 'DELEGACIA DE REPRESSÃO AO ROUBO DE CARGAS')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Tipos e Modelos de Armas
INSERT INTO `available_weapon_types` (`id`, `name`, `models`) VALUES
('wt-pistola', 'Pistola', '["PT100", "PT24/7", "TS9", "Glock G22", "Glock G17", "Glock G19", "PT840", "PT92", "M&P9", "APX"]'),
('wt-fuzil', 'Fuzil', '["T4", "IA2", "MD97", "FAL 7.62", "M4A1", "AR-15", "HK416"]'),
('wt-submet', 'Submetralhadora', '["SMT40", "MT12", "MP5", "UMP40", "SAF 9mm"]'),
('wt-espingarda', 'Espingarda', '["Calibre 12 CBC 586", "Calibre 12 Benelli M4", "Calibre 12 Mossberg 500", "Calibre 12 Boito"]'),
('wt-revolver', 'Revólver', '["RT 889", "RT 85", "RT 82", "RT 357"]'),
('wt-carabina', 'Carabina', '["CT40", "CT9", "CCT9"]')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `models` = VALUES(`models`);

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
('course-pistola', 'Operador de Pistola', '["PT92", "Glock G22", "TH40", "PT840"]', '[".40 S&W", "9x19mm"]', 'dept-coe'),
('course-12', 'Operador de Espingarda C12', '["CBC 586-P", "Benelli M4"]', '["12 GA"]', 'dept-coe')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Cofres Padrão
INSERT INTO `vault_spaces` (`id`, `code`, `type`, `department_id`, `unit_id`) VALUES
('vault-acad-1', 'COFRE-MEAF-01', 'ARMAS', 'dept-acad', 'unit-acad-meaf'),
('vault-acad-2', 'COFRE-MEAF-02', 'MUNIÇÕES', 'dept-acad', 'unit-acad-meaf'),
('vault-coe-1', 'A1-G1', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
('vault-coe-2', 'A1-G2', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
('vault-coe-3', 'C1-L1', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
('vault-coe-4', 'C1-L2', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
('vault-dhpp-1', 'B1-G1', 'ARMAS', 'dept-dhpp', 'unit-dhpp-1'),
('vault-dhpp-2', 'M1-L1', 'MUNIÇÕES', 'dept-dhpp', 'unit-dhpp-1')
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);

-- Usuários Iniciais de Acesso
INSERT INTO `users` (`id`, `masp`, `name`, `phone`, `cargo`, `role`, `department_id`, `unit_id`, `can_move_ammo`, `can_move_weapons`, `has_system_access`, `is_teacher`, `teacher_subject`, `password`, `must_change_password`) VALUES
('usr-master-geral', '1255748', 'Administrador Geral Master', '31999998888', 'Delegado', 'Geral', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0, NULL, '1255748', 1),
('usr-admin-coe', '2222222', 'Dr. Roberto Silva (Admin DOE)', '31988887777', 'Delegado', 'Administrador', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0, NULL, '2222222', 0),
('usr-armeiro-coe', '3333333', 'Agente Carlos Andrade (Armeiro COE)', '31977776666', 'Investigador', 'Armeiro', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0, NULL, '3333333', 0),
('usr-prof-meaf-1', '6666666', 'Prof. Marcus Vinícius (Instrutor MEAF)', '31944443333', 'Investigador', 'Policial', 'dept-acad', 'unit-acad-meaf', 1, 1, 1, 1, 'MEAF', '6666666', 0),
('usr-policial-coe', '4444444', 'Policial Eduardo Costa', '31966665555', 'Investigador', 'Policial', 'dept-coe', 'unit-coe-insp', 0, 0, 1, 0, NULL, '4444444', 0),
('usr-policial-dhpp', '5555555', 'Escrivã Ana Lima', '31955554444', 'Escrivão', 'Policial', 'dept-dhpp', 'unit-dhpp-1', 0, 0, 1, 0, NULL, '5555555', 0)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Cursos do Policial (user_courses)
INSERT INTO `user_courses` (`id`, `user_id`, `course_id`, `completion_date`, `expiration_date`) VALUES
('uc-1', 'usr-master-geral', 'course-fuzil', '2025-10-15', '2027-10-15'),
('uc-2', 'usr-master-geral', 'course-pistola', '2025-11-20', '2027-11-20'),
('uc-3', 'usr-admin-coe', 'course-fuzil', '2025-05-10', '2027-05-10'),
('uc-4', 'usr-admin-coe', 'course-pistola', '2025-06-01', '2027-06-01'),
('uc-5', 'usr-armeiro-coe', 'course-fuzil', '2025-01-15', '2027-01-15'),
('uc-6', 'usr-armeiro-coe', 'course-pistola', '2025-02-10', '2027-02-10'),
('uc-7', 'usr-armeiro-coe', 'course-12', '2025-03-01', '2027-03-01'),
('uc-8', 'usr-policial-coe', 'course-fuzil', '2025-08-12', '2027-08-12'),
('uc-9', 'usr-policial-coe', 'course-pistola', '2023-01-10', '2025-01-10'),
('uc-10', 'usr-policial-dhpp', 'course-pistola', '2025-04-10', '2027-04-10')
ON DUPLICATE KEY UPDATE `course_id` = VALUES(`course_id`);

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
('stock-3', 'cal-9mm', 800, 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-2'),
('stock-acad-40', 'cal-40', 5000, 'dept-acad', 'unit-acad-meaf', 'vault-acad-2'),
('stock-acad-9mm', 'cal-9mm', 5000, 'dept-acad', 'unit-acad-meaf', 'vault-acad-2')
ON DUPLICATE KEY UPDATE `quantity` = VALUES(`quantity`);

-- Audit Log Inicial
INSERT INTO `audit_logs` (`id`, `timestamp`, `user_id`, `user_name`, `user_masp`, `user_role`, `module`, `action`, `details`, `ip_address`) VALUES
('log-1', NOW(), 'usr-master-geral', 'Administrador Geral Master', '1255748', 'Geral', 'Sistema', 'Atualização Banco', 'Inicialização e atualização completa do schema e tabelas MySQL', '127.0.0.1')
ON DUPLICATE KEY UPDATE `details` = VALUES(`details`);

-- Reabilitar verificação de chaves estrangeiras ao final de tudo
SET FOREIGN_KEY_CHECKS = 1;

-- SCRIPT EXECUTADO COM SUCESSO!
