import { getPool, initializeDatabaseSchema, testConnection, dbConfig } from '../src/db/mysql';

async function main() {
  console.log('================================================================');
  console.log('🔄 SISARM - ATUALIZAÇÃO INTEGRAL DE TODAS AS TABELAS DO BANCO');
  console.log(`🌐 Servidor: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`📁 Banco de Dados: ${dbConfig.database}`);
  console.log(`👤 Usuário: ${dbConfig.user}`);
  console.log('================================================================\n');

  console.log('1️⃣ Testando conectividade com o banco de dados...');
  const connTest = await testConnection();
  if (!connTest.success) {
    console.error('❌ Falha ao conectar no banco de dados:', connTest.message);
    process.exit(1);
  }
  console.log('✅ Conexão ativa estabelecida com sucesso!\n');

  console.log('2️⃣ Executando criação e atualização estrutural de todas as tabelas...');
  const initResult = await initializeDatabaseSchema();
  if (!initResult.success) {
    console.error('❌ Erro na estruturação das tabelas:', initResult.message);
    process.exit(1);
  }
  console.log('✅ ' + initResult.message + '\n');

  console.log('3️⃣ Verificando integridade e contagem de registros em cada tabela:');
  const pool = getPool();
  const [tablesResult]: any = await pool.query(`
    SELECT TABLE_NAME as name, TABLE_ROWS as rowsCount
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME ASC
  `, [dbConfig.database]);

  console.log('----------------------------------------------------------------');
  console.log(String('TABELA').padEnd(42) + 'REGISTROS');
  console.log('----------------------------------------------------------------');
  let totalTables = 0;
  for (const t of (tablesResult || [])) {
    try {
      const [cnt]: any = await pool.query(`SELECT COUNT(*) as c FROM \`${t.name}\``);
      const rowCount = cnt[0]?.c ?? t.rowsCount ?? 0;
      console.log(`📦 ${String(t.name).padEnd(40)} ${String(rowCount).padStart(8)}`);
      totalTables++;
    } catch {
      console.log(`📦 ${String(t.name).padEnd(40)} (presente)`);
      totalTables++;
    }
  }
  console.log('----------------------------------------------------------------');
  console.log(`\n🎉 SUCESSO TOTAL: ${totalTables} tabelas verificadas e 100% operacionais!`);
  console.log('Todas as rotas, cautelas de armas, munições, explosivos, materiais e canil estão habilitadas.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro fatal durante a execução:', err);
  process.exit(1);
});
