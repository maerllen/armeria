-- ============================================================================
-- MIGRAÇÃO: Foto 3x4 do Perfil do Usuário (USUARIOS)
-- ============================================================================
-- Adiciona a coluna FOTO_URL_USUARIOS na tabela USUARIOS para armazenar a foto
-- 3x4 enviada pelo próprio policial em "Meu Perfil", exibida também na edição
-- de usuário (para perfis com privilégio) e no Módulo Relatórios (Índices de
-- Desempenho, no mesmo padrão dos animais K9).
-- ============================================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USUARIOS'
    AND COLUMN_NAME = 'FOTO_URL_USUARIOS'
);

SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `FOTO_URL_USUARIOS` MEDIUMTEXT DEFAULT NULL AFTER `TELEFONE_USUARIOS`',
  'SELECT ''Coluna FOTO_URL_USUARIOS já existe na tabela USUARIOS'' AS status'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
