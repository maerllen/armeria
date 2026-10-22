import { getPool } from './mysql';

export async function runDatabaseCorrectionArmas() {
  const pool = getPool();
  console.log('[Correção Armas] Iniciando script de correção do banco de dados...');

  // 1. Corrigir coluna com espaço no nome caso exista
  try {
    const [cols]: any = await pool.query('SHOW COLUMNS FROM `weapons`');
    const hasSpaceCol = cols.some((c: any) => c.Field === ' observacao_localizacao');
    if (hasSpaceCol) {
      await pool.query('ALTER TABLE `weapons` CHANGE COLUMN ` observacao_localizacao` `observacao_localizacao` VARCHAR(255) DEFAULT NULL;');
      console.log('  [OK] Coluna com espaço corrigida para `observacao_localizacao` em `weapons`.');
    }
  } catch (err: any) {
    console.warn('  [Aviso] Verificação de coluna com espaço:', err.message);
  }

  // 2. Adicionar todas as colunas necessárias na tabela `weapons`
  const alterColumns = [
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `type` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `serial_number` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `manufacturer` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `model` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `caliber` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `magazine_quantity` INT DEFAULT 1;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `department_id` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `unit_id` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `vault_space_id` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `location_note` VARCHAR(255) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `observacao_localizacao` VARCHAR(255) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `last_maintenance_date` DATE DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `last_maintenance_responsible` VARCHAR(255) DEFAULT NULL;',
    'ALTER TABLE `weapons` ADD COLUMN IF NOT EXISTS `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP;'
  ];

  for (const q of alterColumns) {
    try {
      await pool.query(q);
    } catch (err: any) {
      console.warn('  [Aviso Alter weapons]:', err.message);
    }
  }
  console.log('  [OK] Colunas em weapons verificadas/adicionadas.');

  // 3. Garantir que a tabela `armas` também contenha todas as colunas necessárias
  const alterArmas = [
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `tipo` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `numero_serie` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `fabricante` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `modelo` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `calibre` VARCHAR(128) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `quantidade_carregadores` INT DEFAULT 1;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `status` VARCHAR(64) DEFAULT "No Cofre";',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `departamento_id` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `unidade_id` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `cofre_id` VARCHAR(64) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `observacao_localizacao` VARCHAR(255) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `data_ultima_manutencao` DATE DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `responsavel_ultima_manutencao` VARCHAR(255) DEFAULT NULL;',
    'ALTER TABLE `armas` ADD COLUMN IF NOT EXISTS `data_criacao` DATETIME DEFAULT CURRENT_TIMESTAMP;'
  ];

  for (const q of alterArmas) {
    try {
      await pool.query(q);
    } catch (err: any) {
      console.warn('  [Aviso Alter armas]:', err.message);
    }
  }
  console.log('  [OK] Colunas em armas verificadas/adicionadas.');

  // 4. Sincronizar dados entre colunas em Português e Inglês dentro de `weapons`
  try {
    await pool.query(`
      UPDATE \`weapons\` SET
        \`type\` = COALESCE(\`type\`, \`tipo\`),
        \`serial_number\` = COALESCE(\`serial_number\`, \`numero_serie\`),
        \`manufacturer\` = COALESCE(\`manufacturer\`, \`fabricante\`),
        \`model\` = COALESCE(\`model\`, \`modelo\`),
        \`caliber\` = COALESCE(\`caliber\`, \`calibre\`),
        \`magazine_quantity\` = COALESCE(\`magazine_quantity\`, \`quantidade_carregadores\`, 1),
        \`department_id\` = COALESCE(\`department_id\`, \`departamento_id\`),
        \`unit_id\` = COALESCE(\`unit_id\`, \`unidade_id\`),
        \`vault_space_id\` = COALESCE(\`vault_space_id\`, \`cofre_id\`),
        \`location_note\` = COALESCE(\`location_note\`, \`observacao_localizacao\`),
        \`last_maintenance_date\` = COALESCE(\`last_maintenance_date\`, \`data_ultima_manutencao\`),
        \`last_maintenance_responsible\` = COALESCE(\`last_maintenance_responsible\`, \`responsavel_ultima_manutencao\`),
        \`created_at\` = COALESCE(\`created_at\`, \`data_criacao\`)
    `);

    await pool.query(`
      UPDATE \`weapons\` SET
        \`tipo\` = COALESCE(\`tipo\`, \`type\`),
        \`numero_serie\` = COALESCE(\`numero_serie\`, \`serial_number\`),
        \`fabricante\` = COALESCE(\`fabricante\`, \`manufacturer\`),
        \`modelo\` = COALESCE(\`modelo\`, \`model\`),
        \`calibre\` = COALESCE(\`calibre\`, \`caliber\`),
        \`quantidade_carregadores\` = COALESCE(\`quantidade_carregadores\`, \`magazine_quantity\`, 1),
        \`departamento_id\` = COALESCE(\`departamento_id\`, \`department_id\`),
        \`unidade_id\` = COALESCE(\`unidade_id\`, \`unit_id\`),
        \`cofre_id\` = COALESCE(\`cofre_id\`, \`vault_space_id\`),
        \`observacao_localizacao\` = COALESCE(\`observacao_localizacao\`, \`location_note\`),
        \`data_ultima_manutencao\` = COALESCE(\`data_ultima_manutencao\`, \`last_maintenance_date\`),
        \`responsavel_ultima_manutencao\` = COALESCE(\`responsavel_ultima_manutencao\`, \`last_maintenance_responsible\`),
        \`data_criacao\` = COALESCE(\`data_criacao\`, \`created_at\`)
    `);
    console.log('  [OK] Dados sincronizados entre colunas inglesas e portuguesas em `weapons`.');
  } catch (err: any) {
    console.error('  [Erro Update weapons]:', err.message);
  }

  // 5. Mesclar todas as armas de `armas` para `weapons` (garantir que nada se perca)
  try {
    await pool.query(`
      INSERT IGNORE INTO \`weapons\` (
        id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
        status, departamento_id, unidade_id, cofre_id, observacao_localizacao,
        data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao,
        type, serial_number, manufacturer, model, caliber, magazine_quantity,
        department_id, unit_id, vault_space_id, location_note,
        last_maintenance_date, last_maintenance_responsible, created_at
      )
      SELECT 
        id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
        status, departamento_id, unidade_id, cofre_id, observacao_localizacao,
        data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao,
        tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
        departamento_id, unidade_id, cofre_id, observacao_localizacao,
        data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao
      FROM \`armas\`
    `);
    console.log('  [OK] Armas importadas de `armas` para `weapons`.');
  } catch (err: any) {
    console.warn('  [Aviso mesclagem armas -> weapons]:', err.message);
  }

  // 6. Mesclar todas as armas de `weapons` para `armas` (garantir sincronia bidirecional)
  try {
    await pool.query(`
      INSERT IGNORE INTO \`armas\` (
        id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
        status, departamento_id, unidade_id, cofre_id, observacao_localizacao,
        data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao
      )
      SELECT 
        id, 
        COALESCE(tipo, type), 
        COALESCE(numero_serie, serial_number), 
        COALESCE(fabricante, manufacturer), 
        COALESCE(modelo, model), 
        COALESCE(calibre, caliber), 
        COALESCE(quantidade_carregadores, magazine_quantity, 1),
        status, 
        COALESCE(departamento_id, department_id), 
        COALESCE(unidade_id, unit_id), 
        COALESCE(cofre_id, vault_space_id), 
        COALESCE(observacao_localizacao, location_note),
        COALESCE(data_ultima_manutencao, last_maintenance_date), 
        COALESCE(responsavel_ultima_manutencao, last_maintenance_responsible), 
        COALESCE(data_criacao, created_at)
      FROM \`weapons\`
    `);
    console.log('  [OK] Armas sincronizadas de `weapons` para `armas`.');
  } catch (err: any) {
    console.warn('  [Aviso mesclagem weapons -> armas]:', err.message);
  }

  const [wCount]: any = await pool.query('SELECT COUNT(*) as cnt FROM `weapons`');
  const [aCount]: any = await pool.query('SELECT COUNT(*) as cnt FROM `armas`');

  console.log(`[Correção Armas Concluída] Total em weapons: ${wCount[0].cnt} | Total em armas: ${aCount[0].cnt}`);
  return { weaponsCount: wCount[0].cnt, armasCount: aCount[0].cnt };
}

if (process.argv[1] && process.argv[1].includes('correct_weapons_db')) {
  runDatabaseCorrectionArmas()
    .then((res) => {
      console.log('Resultado:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
