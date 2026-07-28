-- ====================================================================
-- SCRIPT COMPLETO DE ATUALIZAÇÃO DO BANCO DE DADOS (MYSQL / MARIADB)
-- SISTEMA: ARMERIA - MÓDULO DE CURSOS, TURMAS, PROFESSORES E MOVIMENTAÇÕES
-- INSTRUÇÕES DE USO:
--   1. Copie e cole todo o conteúdo deste arquivo no seu Gerenciador de Banco de Dados (ex: phpMyAdmin, DBeaver, Hostinger, Workbench).
--   2. Selecione o banco de dados e execute o script.
-- ====================================================================

USE `u552818109_Armeriadb`;

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------------------
-- 1. ESTRUTURA DA TABELA DE TURMAS (`course_classes`)
--    - Adiciona vínculo com o Plano de Aula (`plano_de_aula`)
--    - Garante lista de professores (`teacher_user_ids` em JSON)
--    - Remove coluna redundante `teacher_name` (se existir)
-- --------------------------------------------------------------------

DROP PROCEDURE IF EXISTS `update_course_classes_structure`;
DELIMITER //
CREATE PROCEDURE `update_course_classes_structure`()
BEGIN
    -- Adiciona a coluna 'plano_de_aula' se não existir
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_classes' 
          AND COLUMN_NAME = 'plano_de_aula'
    ) THEN
        ALTER TABLE `course_classes` ADD COLUMN `plano_de_aula` VARCHAR(64) DEFAULT NULL AFTER `teacher_user_ids`;
    END IF;

    -- Garante a existência da coluna 'teacher_user_ids'
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_classes' 
          AND COLUMN_NAME = 'teacher_user_ids'
    ) THEN
        ALTER TABLE `course_classes` ADD COLUMN `teacher_user_ids` JSON DEFAULT NULL;
    END IF;

    -- Remove a coluna 'teacher_name' se existir
    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_classes' 
          AND COLUMN_NAME = 'teacher_name'
    ) THEN
        ALTER TABLE `course_classes` DROP COLUMN `teacher_name`;
    END IF;
END //
DELIMITER ;

CALL `update_course_classes_structure`();
DROP PROCEDURE IF EXISTS `update_course_classes_structure`;

-- --------------------------------------------------------------------
-- 2. ESTRUTURA DA TABELA DE MOVIMENTAÇÕES (`course_class_movements`)
--    - Cria a tabela se não existir
--    - Ajusta as colunas de caixas e calibres para aceitar seleções múltiplas
--    - Garante colunas de devolução, materiais e observações
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `course_class_movements` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `course_id` VARCHAR(64) NULL DEFAULT NULL,
  `class_id` VARCHAR(64) NULL DEFAULT NULL,
  `turma_code` VARCHAR(64) NULL DEFAULT NULL,
  `lesson_plan_id` VARCHAR(64) DEFAULT NULL,
  `lesson_plan_name` VARCHAR(255) DEFAULT NULL,
  `lesson_number` INT DEFAULT 1,
  `teacher_name` VARCHAR(255) NULL DEFAULT NULL,
  `weapon_box_id` VARCHAR(64) DEFAULT NULL,
  `weapon_box_name` VARCHAR(255) DEFAULT NULL,
  `weapon_ids` JSON DEFAULT NULL,
  `box_id` TEXT DEFAULT NULL,
  `box_name` TEXT DEFAULT NULL,
  `caliber_id` VARCHAR(64) DEFAULT NULL,
  `ammo_caliber` TEXT DEFAULT NULL,
  `vault_space_id` VARCHAR(64) DEFAULT NULL,
  `ammo_supplied` INT DEFAULT 0,
  `student_count` INT DEFAULT 0,
  `shots_per_student` INT DEFAULT 0,
  `instructor_shots` INT DEFAULT 0,
  `ammo_used` INT DEFAULT 0,
  `ammo_returned` INT DEFAULT 0,
  `extra_magazines_count` INT DEFAULT 0,
  `status` VARCHAR(64) DEFAULT 'Em Aula',
  `notes` TEXT DEFAULT NULL,
  `returned_materials` TEXT DEFAULT NULL,
  `issued_by_user_name` VARCHAR(255) NULL DEFAULT NULL,
  `returned_by_user_name` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `returned_at` DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS `update_course_class_movements_structure`;
DELIMITER //
CREATE PROCEDURE `update_course_class_movements_structure`()
BEGIN
    -- Permite textos mais longos para caixas e calibres (seleção múltipla)
    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'box_id'
    ) THEN
        ALTER TABLE `course_class_movements` MODIFY COLUMN `box_id` TEXT DEFAULT NULL;
    END IF;

    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'box_name'
    ) THEN
        ALTER TABLE `course_class_movements` MODIFY COLUMN `box_name` TEXT DEFAULT NULL;
    END IF;

    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'ammo_caliber'
    ) THEN
        ALTER TABLE `course_class_movements` MODIFY COLUMN `ammo_caliber` TEXT DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'returned_materials'
    ) THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `returned_materials` TEXT DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'notes'
    ) THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `notes` TEXT DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'lesson_plan_id'
    ) THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `lesson_plan_id` VARCHAR(64) DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_class_movements' 
          AND COLUMN_NAME = 'lesson_plan_name'
    ) THEN
        ALTER TABLE `course_class_movements` ADD COLUMN `lesson_plan_name` VARCHAR(255) DEFAULT NULL;
    END IF;
END //
DELIMITER ;

CALL `update_course_class_movements_structure`();
DROP PROCEDURE IF EXISTS `update_course_class_movements_structure`;

SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- SCRIPT CONCLUÍDO COM SUCESSO!
-- ====================================================================
