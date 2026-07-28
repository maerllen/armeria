-- ====================================================================
-- SCRIPT DE BANCO DE DADOS MYSQL / MARIADB
-- SISTEMA: ARMERIA - Módulo de Cursos & Planos de Aula
-- OBJETIVO: Reestruturação e Integração do Plano de Aula (Curso de Formação)
-- BANCO DE DADOS: u552818109_Armeriadb
-- ====================================================================

USE `u552818109_Armeriadb`;

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------------------
-- 1. ALTERAÇÃO DO NOME DA TABELA PRINCIPAL
-- Se a tabela 'lesson_plans' existir, renomeia para 'plano_de_aula_curso_de_formacao'.
-- Caso contrário, cria a tabela com a nova estrutura.
-- --------------------------------------------------------------------

DROP PROCEDURE IF EXISTS `rename_lesson_plans_proc`;
DELIMITER //
CREATE PROCEDURE `rename_lesson_plans_proc`()
BEGIN
    -- Se existir lesson_plans e NÃO existir plano_de_aula_curso_de_formacao, renomeia
    IF EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lesson_plans')
       AND NOT EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao') THEN
        RENAME TABLE `lesson_plans` TO `plano_de_aula_curso_de_formacao`;
    END IF;
END //
DELIMITER ;

CALL `rename_lesson_plans_proc`();
DROP PROCEDURE IF EXISTS `rename_lesson_plans_proc`;

-- Garantia da criação da tabela principal 'plano_de_aula_curso_de_formacao'
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


-- Adjusting columns in case the table was renamed from old structure
DROP PROCEDURE IF EXISTS `adjust_plano_de_aula_columns_proc`;
DELIMITER //
CREATE PROCEDURE `adjust_plano_de_aula_columns_proc`()
BEGIN
    -- nome_do_plano (antigo name)
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='name')
       AND NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='nome_do_plano') THEN
        ALTER TABLE `plano_de_aula_curso_de_formacao` CHANGE COLUMN `name` `nome_do_plano` VARCHAR(255) NOT NULL;
    END IF;

    -- materia (antigo subject)
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='subject')
       AND NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='materia') THEN
        ALTER TABLE `plano_de_aula_curso_de_formacao` CHANGE COLUMN `subject` `materia` VARCHAR(100) NOT NULL DEFAULT 'MEAF';
    END IF;

    -- ano_de_vigencia_do_plano (antigo year)
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='year')
       AND NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='ano_de_vigencia_do_plano') THEN
        ALTER TABLE `plano_de_aula_curso_de_formacao` CHANGE COLUMN `year` `ano_de_vigencia_do_plano` INT NOT NULL;
    END IF;

    -- numero_de_aulas (antigo lesson_count)
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='lesson_count')
       AND NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='numero_de_aulas') THEN
        ALTER TABLE `plano_de_aula_curso_de_formacao` CHANGE COLUMN `lesson_count` `numero_de_aulas` INT NOT NULL DEFAULT 1;
    END IF;

    -- Garantir que a coluna materia exista se não foi alterada
    IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plano_de_aula_curso_de_formacao' AND COLUMN_NAME='materia') THEN
        ALTER TABLE `plano_de_aula_curso_de_formacao` ADD COLUMN `materia` VARCHAR(100) NOT NULL DEFAULT 'MEAF';
    END IF;
END //
DELIMITER ;

CALL `adjust_plano_de_aula_columns_proc`();
DROP PROCEDURE IF EXISTS `adjust_plano_de_aula_columns_proc`;

-- --------------------------------------------------------------------
-- 2. CRIAÇÃO DA TABELA VINCULADA: DETALHAMENTO DE AULAS
-- Armazena as informações por número de aula:
-- - numero_da_aula
-- - quantidade_de_tiros_por_aluno
-- - calibre_usado
-- - insumo_do_instrutor
-- --------------------------------------------------------------------

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

-- --------------------------------------------------------------------
-- 3. INSERÇÃO DE DADOS DE EXEMPLO PARA TESTE
-- --------------------------------------------------------------------

INSERT INTO `plano_de_aula_curso_de_formacao`
    (`id`, `nome_do_plano`, `carreira`, `materia`, `ano_de_vigencia_do_plano`, `numero_de_aulas`, `turma_code`, `type`)
VALUES
    ('plan-cf-investigador-2026', 'Plano Geral CF - Investigador de Polícia 2026', 'Investigador', 'MEAF', 2026, 5, 'MEAF-IP-01', 'curso de formação')
ON DUPLICATE KEY UPDATE
    `nome_do_plano` = VALUES(`nome_do_plano`),
    `ano_de_vigencia_do_plano` = VALUES(`ano_de_vigencia_do_plano`),
    `numero_de_aulas` = VALUES(`numero_de_aulas`);

INSERT INTO `aulas_plano_de_aula_curso_de_formacao`
    (`id`, `plano_de_aula_id`, `numero_da_aula`, `quantidade_de_tiros_por_aluno`, `calibre_usado`, `insumo_do_instrutor`)
VALUES
    ('aula-1-plan-cf-investigador', 'plan-cf-investigador-2026', 1, 20, '.40 S&W', 10),
    ('aula-2-plan-cf-investigador', 'plan-cf-investigador-2026', 2, 30, '.40 S&W', 10),
    ('aula-3-plan-cf-investigador', 'plan-cf-investigador-2026', 3, 40, '9x19mm', 15),
    ('aula-4-plan-cf-investigador', 'plan-cf-investigador-2026', 4, 50, '9x19mm', 15),
    ('aula-5-plan-cf-investigador', 'plan-cf-investigador-2026', 5, 60, '5,56x45mm', 20)
ON DUPLICATE KEY UPDATE
    `quantidade_de_tiros_por_aluno` = VALUES(`quantidade_de_tiros_por_aluno`),
    `calibre_usado` = VALUES(`calibre_usado`),
    `insumo_do_instrutor` = VALUES(`insumo_do_instrutor`);

SET FOREIGN_KEY_CHECKS = 1;

-- SCRIPT EXECUTADO COM SUCESSO!
