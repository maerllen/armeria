-- ====================================================================
-- SCRIPT DE BANCO DE DADOS MYSQL / MARIADB
-- SISTEMA: ARMERIA - Módulo de Cursos & Turmas (course_classes)
-- OBJETIVO:
--   1. Adicionar a coluna 'plano_de_aula' na tabela 'course_classes'.
--   2. Excluir a coluna 'teacher_name' da tabela 'course_classes'.
--   3. Utilizar a coluna 'teacher_user_ids' para vincular os professores.
-- BANCO DE DADOS: u552818109_Armeriadb
-- ====================================================================

USE `u552818109_Armeriadb`;

SET FOREIGN_KEY_CHECKS = 0;

-- Procedure para migração segura da estrutura da tabela 'course_classes'
DROP PROCEDURE IF EXISTS `update_course_classes_schema_proc`;
DELIMITER //
CREATE PROCEDURE `update_course_classes_schema_proc`()
BEGIN
    -- 1. Adicionar coluna 'plano_de_aula' se não existir
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_classes' 
          AND COLUMN_NAME = 'plano_de_aula'
    ) THEN
        ALTER TABLE `course_classes` ADD COLUMN `plano_de_aula` VARCHAR(64) DEFAULT NULL AFTER `teacher_user_ids`;
    END IF;

    -- 2. Garantir coluna 'teacher_user_ids' se não existir
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_classes' 
          AND COLUMN_NAME = 'teacher_user_ids'
    ) THEN
        ALTER TABLE `course_classes` ADD COLUMN `teacher_user_ids` JSON DEFAULT NULL;
    END IF;

    -- 3. Excluir a coluna 'teacher_name' se existir
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

CALL `update_course_classes_schema_proc`();
DROP PROCEDURE IF EXISTS `update_course_classes_schema_proc`;

SET FOREIGN_KEY_CHECKS = 1;

-- SCRIPT EXECUTADO COM SUCESSO!
