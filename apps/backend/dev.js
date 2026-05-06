const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando servidor de desenvolvimento...\n');

// Executar ts-node com nodemon para desenvolvimento
const nodemon = spawn('npx', ['nodemon', '--exec', 'ts-node --transpile-only src/index.ts'], {
  cwd: path.join(__dirname),
  stdio: 'inherit',
  shell: true
});

nodemon.on('error', (error) => {
  console.error('❌ Erro ao iniciar nodemon:', error);
  process.exit(1);
});

nodemon.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Nodemon saiu com código ${code}`);
    process.exit(code);
  }
});

// Tratar sinais de encerramento
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor de desenvolvimento...');
  nodemon.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  nodemon.kill('SIGTERM');
  process.exit(0);
});

