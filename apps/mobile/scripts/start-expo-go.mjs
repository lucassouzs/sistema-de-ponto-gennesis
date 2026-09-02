import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

function getLanIp() {
  const nets = networkInterfaces();
  const preferred = ['Wi-Fi', 'Wi-Fi 2', 'Ethernet', 'wlan0', 'en0'];

  for (const name of preferred) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        return net.address;
      }
    }
  }

  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        return net.address;
      }
    }
  }

  return 'localhost';
}

const ip = getLanIp();
process.env.REACT_NATIVE_PACKAGER_HOSTNAME = ip;

console.log(`\n📱 Expo na rede local: exp://${ip}:8081`);
console.log('   Celular e PC precisam estar na mesma Wi-Fi.\n');

const child = spawn('npx', ['expo', 'start', '--go', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
