-- ============================================================================
-- MIGRAÇÃO SQL v2 — MÓDULO RELATÓRIOS: ÍNDICES DE DESEMPENHO (FÍSICO E TÁTICO)
-- Sistema ARMARIA / Polícia Civil de Minas Gerais
-- Compatível com MariaDB 10.4+ / 11.x (Hostinger) e MySQL 8+ (UTF8MB4)
-- Seguro para reaplicação (idempotente — não apaga dados existentes)
-- ============================================================================
-- Alterações incluídas:
-- 1. DESEMPENHO_MARCADORES:
--    - VALOR_REFERENCIA: valor de referência da unidade de medida (ex: 1000 metros)
--    - TEMPO_APROVACAO_MODO: critério de aprovação do tempo ('MENOR_IGUAL' invertido ou 'MAIOR_IGUAL' normal)
--    - USA_DISTRIBUICAO_NOTA: ativa distribuição automática de pontuação por faixas/divisões
--    - FATOR_DISTRIBUICAO: fator ('MARCA', 'TEMPO', 'ACERTOS' ou 'TIROS_TEMPO')
--    - REGRAS_DISTRIBUICAO: JSON com divisões ({ valor, tempoSegundos?, pontos })
--    - QUANTIDADE_TIROS_PONTUADOS: quantidade de tiros válidos/pontuados para a prova (marcadores Táticos)
-- 2. DESEMPENHO_RESULTADOS:
--    - TEMPO_SEGUNDOS alterado para DECIMAL(10,2) para suportar frações de segundo em provas de tiro
--    - TEMPO_APROVACAO_MODO_REF: registro histórico do critério de tempo vigente na avaliação
--    - QUANTIDADE_TIROS_PONTUADOS_REF: referência histórica dos tiros pontuados da prova
--    - ACERTOS_TIROS: quantidade de acertos obtidos nos tiros pontuados
--    - TAXA_ACERTO_POR_SEGUNDO: taxa calculada (acertos / tempo em segundos) para distribuição cruzada
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Atualização da tabela DESEMPENHO_MARCADORES
-- ----------------------------------------------------------------------------
ALTER TABLE `DESEMPENHO_MARCADORES`
  ADD COLUMN IF NOT EXISTS `VALOR_REFERENCIA` DECIMAL(12,2) DEFAULT NULL
    COMMENT 'Valor de referência da unidade de medida (ex: 1000 metros)'
    AFTER `UNIDADE_MEDIDA`,
  ADD COLUMN IF NOT EXISTS `TEMPO_APROVACAO_MODO` VARCHAR(20) NOT NULL DEFAULT 'MENOR_IGUAL'
    COMMENT 'MENOR_IGUAL = tempo <= alvo aprovado (invertido) | MAIOR_IGUAL = tempo >= alvo aprovado (normal)'
    AFTER `TEMPO_APROVACAO_SEG`,
  ADD COLUMN IF NOT EXISTS `USA_DISTRIBUICAO_NOTA` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = habilita cálculo automático da nota por faixas/divisões'
    AFTER `NOTA_APROVACAO`,
  ADD COLUMN IF NOT EXISTS `FATOR_DISTRIBUICAO` VARCHAR(30) DEFAULT NULL
    COMMENT 'MARCA, TEMPO, ACERTOS ou TIROS_TEMPO (distribuição cruzada)'
    AFTER `USA_DISTRIBUICAO_NOTA`,
  ADD COLUMN IF NOT EXISTS `REGRAS_DISTRIBUICAO` LONGTEXT DEFAULT NULL
    COMMENT 'JSON com faixas [{valor, tempoSegundos?, pontos}]'
    AFTER `FATOR_DISTRIBUICAO`,
  ADD COLUMN IF NOT EXISTS `QUANTIDADE_TIROS_PONTUADOS` INT DEFAULT NULL
    COMMENT 'Quantidade dos tiros gerais que serão pontuados na prova (ex: 10 de 30 tiros)'
    AFTER `QUANTIDADE_TIROS`;

-- Garante tamanho suficiente caso FATOR_DISTRIBUICAO ou TEMPO_APROVACAO_MODO já existissem
ALTER TABLE `DESEMPENHO_MARCADORES`
  MODIFY COLUMN `TEMPO_APROVACAO_MODO` VARCHAR(20) NOT NULL DEFAULT 'MENOR_IGUAL',
  MODIFY COLUMN `FATOR_DISTRIBUICAO` VARCHAR(30) DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 2. Atualização da tabela DESEMPENHO_RESULTADOS
-- ----------------------------------------------------------------------------
ALTER TABLE `DESEMPENHO_RESULTADOS`
  MODIFY COLUMN `TEMPO_SEGUNDOS` DECIMAL(10,2) DEFAULT NULL
    COMMENT 'Tempo de execução em segundos (suporta decimais ex: 1.50s em tiro tático)',
  ADD COLUMN IF NOT EXISTS `TEMPO_APROVACAO_MODO_REF` VARCHAR(20) NOT NULL DEFAULT 'MENOR_IGUAL'
    COMMENT 'Critério de tempo vigente na avaliação (MENOR_IGUAL ou MAIOR_IGUAL)'
    AFTER `TEMPO_APROVACAO_REF`,
  ADD COLUMN IF NOT EXISTS `QUANTIDADE_TIROS_PONTUADOS_REF` INT DEFAULT NULL
    COMMENT 'Referência histórica de quantos tiros eram pontuados na prova'
    AFTER `TIROS_EFETUADOS`,
  ADD COLUMN IF NOT EXISTS `ACERTOS_TIROS` INT DEFAULT NULL
    COMMENT 'Quantidade de acertos obtidos nos tiros pontuados'
    AFTER `QUANTIDADE_TIROS_PONTUADOS_REF`,
  ADD COLUMN IF NOT EXISTS `TAXA_ACERTO_POR_SEGUNDO` DECIMAL(10,4) DEFAULT NULL
    COMMENT 'Taxa calculada de acertos/tiros por segundo (distribuição cruzada)'
    AFTER `ACERTOS_TIROS`;

-- ----------------------------------------------------------------------------
-- 3. Normalização retroativa segura para registros existentes
-- ----------------------------------------------------------------------------
UPDATE `DESEMPENHO_MARCADORES`
   SET `TEMPO_APROVACAO_MODO` = 'MENOR_IGUAL'
 WHERE `TEMPO_APROVACAO_MODO` IS NULL OR `TEMPO_APROVACAO_MODO` = '';

UPDATE `DESEMPENHO_RESULTADOS`
   SET `TEMPO_APROVACAO_MODO_REF` = 'MENOR_IGUAL'
 WHERE `TEMPO_APROVACAO_MODO_REF` IS NULL OR `TEMPO_APROVACAO_MODO_REF` = '';

-- ============================================================================
-- FIM DA MIGRAÇÃO SQL v2 — ÍNDICES DE DESEMPENHO
-- ============================================================================
