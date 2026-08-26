import { execFileSync } from 'node:child_process';

const projectRoot = process.cwd();
const backendPort = Number(process.env.PORT ?? 3000);
const ports = [...new Set([backendPort, 5173, 5174])];
const stoppedPorts = new Set();

function execText(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function pidsForPort(port) {
  return execText('lsof', ['-nP', '-ti', `TCP:${port}`, '-sTCP:LISTEN'])
    .split('\n')
    .map((pid) => Number(pid.trim()))
    .filter(Boolean);
}

function cwdForPid(pid) {
  const output = execText('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const cwdLine = output.split('\n').find((line) => line.startsWith('n'));
  return cwdLine ? cwdLine.slice(1) : '';
}

function argsForPid(pid) {
  return execText('ps', ['-p', String(pid), '-o', 'args=']);
}

function shouldStopPid(pid) {
  const cwd = cwdForPid(pid);
  return cwd === projectRoot || cwd.startsWith(`${projectRoot}/`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

for (const port of ports) {
  for (const pid of pidsForPort(port)) {
    if (!shouldStopPid(pid)) {
      const args = argsForPid(pid);
      console.log(`[dev1] ข้าม process pid ${pid} ที่ใช้พอร์ต ${port} เพราะไม่ได้รันจากโปรเจกต์นี้: ${args}`);
      continue;
    }

    try {
      process.kill(pid, 'SIGTERM');
      stoppedPorts.add(port);
      console.log(`[dev1] ปิด process เดิมของโปรเจกต์ที่ใช้พอร์ต ${port} แล้ว (pid ${pid})`);
    } catch (error) {
      console.log(`[dev1] ปิด process pid ${pid} ที่ใช้พอร์ต ${port} ไม่สำเร็จ: ${error.message}`);
    }
  }
}

for (let attempt = 0; attempt < 10 && stoppedPorts.size > 0; attempt += 1) {
  const busyPorts = [...stoppedPorts].filter((port) => pidsForPort(port).some((pid) => shouldStopPid(pid)));
  stoppedPorts.clear();
  busyPorts.forEach((port) => stoppedPorts.add(port));
  if (stoppedPorts.size === 0) break;
  await sleep(150);
}

for (const port of stoppedPorts) {
  console.log(`[dev1] พอร์ต ${port} ยังไม่ว่าง ถ้ายังเปิดไม่ขึ้นให้รอสักครู่แล้วรัน npm run dev1 อีกครั้ง`);
}
