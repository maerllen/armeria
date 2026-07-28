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
--    - Remove coluna redundante `teacher_name` (nomes resgatados dinamicamente)
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

    -- Remove a coluna 'teacher_name' se existir (pois o nome é resgatado dos usuários/professores)
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
-- 2. ESTRUTURA DA TABELA DE MOVIMENTAÇÕES (`course_movements`)
--    - Ajusta as colunas de caixas e calibres para aceitar seleções múltiplas
--    - Garante colunas de devolução, materiais e observações
-- --------------------------------------------------------------------

DROP PROCEDURE IF EXISTS `update_course_movements_structure`;
DELIMITER //
CREATE PROCEDURE `update_course_movements_structure`()
BEGIN
    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_movements' 
          AND COLUMN_NAME = 'box_id'
    ) THEN
        ALTER TABLE `course_movements` MODIFY COLUMN `box_id` TEXT DEFAULT NULL;
    END IF;

    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_movements' 
          AND COLUMN_NAME = 'box_name'
    ) THEN
        ALTER TABLE `course_movements` MODIFY COLUMN `box_name` TEXT DEFAULT NULL;
    END IF;

    IF EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_movements' 
          AND COLUMN_NAME = 'ammo_caliber'
    ) THEN
        ALTER TABLE `course_movements` MODIFY COLUMN `ammo_caliber` TEXT DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'course_movements' 
          AND COLUMN_NAME = 'returned_materials'
    ) THEN
        ALTER TABLE `course_movements` ADD COLUMN `returned_materials` TEXT DEFAULT NULL;
    END IF;
END //
DELIMITER ;

CALL `update_course_movements_structure`();
DROP PROCEDURE IF EXISTS `update_course_movements_structure`;

SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- SCRIPT CONCLUÍDO COM SUCESSO!
-- ====================================================================
