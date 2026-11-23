-- ============================================================================
-- SCRIPT SQL DE CORREÇÃO: HABILITAÇÕES MÚLTIPLAS DE USUÁRIOS DA UNIDADE CAT
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Permite que o mesmo policial vinculado à unidade CAT seja habilitado em
-- múltiplas funções simultaneamente (Piloto, Copiloto e/ou Operador Aerotático /
-- Tripulante), com lista independente de uma ou mais aeronaves para cada função.
--
-- Script 100% idempotente (seguro para executar em bancos novos ou em produção).
-- Preserva todos os dados já cadastrados em CAT_FUNCAO_USUARIOS e CAT_AERONAVES_JSON,
-- convertendo-os automaticamente para a nova coluna CAT_HABILITACOES_JSON.
-- ============================================================================

-- 1. Garante existência da coluna legada CAT_FUNCAO_USUARIOS (compatibilidade)
SET @col_cat_funcao_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USUARIOS'
    AND COLUMN_NAME = 'CAT_FUNCAO_USUARIOS'
);
SET @sql_add_cat_funcao := IF(
  @col_cat_funcao_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `CAT_FUNCAO_USUARIOS` VARCHAR(64) DEFAULT NULL AFTER `PODE_VER_RELATORIOS_EQUIPES_CANIL_USUARIOS`',
  'SELECT ''Coluna CAT_FUNCAO_USUARIOS já existe em USUARIOS'' AS status'
);
PREPARE stmt_cat_funcao FROM @sql_add_cat_funcao;
EXECUTE stmt_cat_funcao;
DEALLOCATE PREPARE stmt_cat_funcao;

-- 2. Garante existência da coluna legada CAT_AERONAVES_JSON (compatibilidade)
SET @col_cat_aeronaves_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USUARIOS'
    AND COLUMN_NAME = 'CAT_AERONAVES_JSON'
);
SET @sql_add_cat_aeronaves := IF(
  @col_cat_aeronaves_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `CAT_AERONAVES_JSON` TEXT DEFAULT NULL AFTER `CAT_FUNCAO_USUARIOS`',
  'SELECT ''Coluna CAT_AERONAVES_JSON já existe em USUARIOS'' AS status'
);
PREPARE stmt_cat_aeronaves FROM @sql_add_cat_aeronaves;
EXECUTE stmt_cat_aeronaves;
DEALLOCATE PREPARE stmt_cat_aeronaves;

-- 3. Adiciona a nova coluna CAT_HABILITACOES_JSON em USUARIOS
-- Formato armazenado:
-- [
--   { "funcao": "Piloto", "aeronaveIds": ["aero-1", "aero-2"] },
--   { "funcao": "Copiloto", "aeronaveIds": ["aero-3"] },
--   { "funcao": "Operador Aerotático", "aeronaveIds": ["aero-1", "aero-4"] }
-- ]
SET @col_cat_hab_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USUARIOS'
    AND COLUMN_NAME = 'CAT_HABILITACOES_JSON'
);
SET @sql_add_cat_hab := IF(
  @col_cat_hab_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `CAT_HABILITACOES_JSON` TEXT DEFAULT NULL COMMENT ''Array JSON de habilitações por função (Piloto, Copiloto, Operador Aerotático) com suas aeronaves'' AFTER `CAT_AERONAVES_JSON`',
  'SELECT ''Coluna CAT_HABILITACOES_JSON já existe em USUARIOS'' AS status'
);
PREPARE stmt_cat_hab FROM @sql_add_cat_hab;
EXECUTE stmt_cat_hab;
DEALLOCATE PREPARE stmt_cat_hab;

-- 4. Migra automaticamente usuários CAT já cadastrados no formato anterior
-- (CAT_FUNCAO_USUARIOS + CAT_AERONAVES_JSON -> CAT_HABILITACOES_JSON)
-- Apenas para registros onde CAT_HABILITACOES_JSON ainda está NULL ou vazio.
UPDATE `USUARIOS`
SET `CAT_HABILITACOES_JSON` = CONCAT(
  '[{"funcao":"',
  CASE
    WHEN LOWER(TRIM(`CAT_FUNCAO_USUARIOS`)) = 'piloto' THEN 'Piloto'
    WHEN LOWER(TRIM(`CAT_FUNCAO_USUARIOS`)) = 'copiloto' THEN 'Copiloto'
    ELSE 'Operador Aerotático'
  END,
  '","aeronaveIds":',
  CASE
    WHEN `CAT_AERONAVES_JSON` IS NOT NULL AND TRIM(`CAT_AERONAVES_JSON`) LIKE '[%]'
      THEN TRIM(`CAT_AERONAVES_JSON`)
    ELSE '[]'
  END,
  '}]'
)
WHERE `CAT_FUNCAO_USUARIOS` IS NOT NULL
  AND TRIM(`CAT_FUNCAO_USUARIOS`) <> ''
  AND (`CAT_HABILITACOES_JSON` IS NULL OR TRIM(`CAT_HABILITACOES_JSON`) = '');

-- 5. Verificação dos usuários CAT migrados
SELECT
  u.`ID_USUARIOS`,
  u.`NOME_USUARIOS`,
  u.`MASP_USUARIOS`,
  un.`NOME_UNIDADES`,
  u.`CAT_FUNCAO_USUARIOS`,
  u.`CAT_AERONAVES_JSON`,
  u.`CAT_HABILITACOES_JSON`
FROM `USUARIOS` u
LEFT JOIN `UNIDADES` un ON un.`ID_UNIDADES` = u.`UNIDADE_ID_USUARIOS`
WHERE u.`CAT_HABILITACOES_JSON` IS NOT NULL
   OR u.`CAT_FUNCAO_USUARIOS` IS NOT NULL
ORDER BY u.`NOME_USUARIOS` ASC;
