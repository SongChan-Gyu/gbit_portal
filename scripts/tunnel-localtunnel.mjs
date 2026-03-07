#!/usr/bin/env node
/**
 * LocalTunnel로 로컬 서버(기본 3000)를 노출하고,
 * 생성된 URL을 .env.local의 NEXTAUTH_URL에 자동 반영.
 * Cloudflare Quick Tunnel이 동작하지 않을 때 대안으로 사용.
 *
 * 사용법: node scripts/tunnel-localtunnel.mjs
 * 선행: npm run dev 로 로컬 서버 실행 중이어야 함
 */

import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const ENV_LOCAL = resolve(PROJECT_ROOT, '.env.local');
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  let lt;
  try {
    const m = await import('localtunnel');
    lt = m.default ?? m;
  } catch {
    console.error('localtunnel 패키지가 없습니다. 설치: npm install localtunnel');
    process.exit(1);
  }

  console.log(`LocalTunnel 시작 중 (localhost:${PORT})...`);
  const tunnel = await lt({ port: PORT });
  const url = tunnel.url.startsWith('http') ? tunnel.url : `https://${tunnel.url}`;

  // LocalTunnel이 첫 접속 시 "IP 주소 입력" 페이지를 띄움 → 본인 공인 IP 입력하면 통과
  let publicIp = '';
  try {
    const res = await fetch('https://api.ipify.org?format=text');
    if (res.ok) publicIp = (await res.text()).trim();
  } catch (_) {}

  console.log('');
  console.log('터널 URL:', url);
  if (publicIp) {
    console.log('');
    console.log('※ 해당 URL 접속 시 "IP 주소 입력"이 뜨면 아래 주소를 그대로 입력하세요:');
    console.log('  ', publicIp);
  }
  console.log('');

  // .env.local 갱신
  const setOrReplace = (content) => {
    if (content.includes('NEXTAUTH_URL=')) {
      return content.replace(/^NEXTAUTH_URL=.*/m, `NEXTAUTH_URL="${url}"`);
    }
    return content + `\nNEXTAUTH_URL="${url}"\n`;
  };

  if (existsSync(ENV_LOCAL)) {
    const content = readFileSync(ENV_LOCAL, 'utf8');
    writeFileSync(ENV_LOCAL, setOrReplace(content), 'utf8');
  } else {
    writeFileSync(ENV_LOCAL, `NEXTAUTH_URL="${url}"\n`, 'utf8');
  }
  console.log('✓ .env.local 의 NEXTAUTH_URL 을 위 URL로 갱신했습니다.');
  console.log('  Next.js 개발 서버가 이미 떠 있다면 한 번 재시작해 주세요.');
  console.log('');
  console.log('터널 유지 중... (종료: Ctrl+C)');
  console.log('');

  tunnel.on('close', () => process.exit(0));
  tunnel.on('error', (err) => {
    console.error('터널 에러:', err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
