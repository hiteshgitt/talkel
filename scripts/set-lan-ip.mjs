#!/usr/bin/env node
/**
 * Points every local config at this machine's current LAN address (it changes when the laptop
 * switches networks). Updates apps/api/.env, apps/web/.env.local and apps/mobile/.env in place.
 *
 *   node scripts/set-lan-ip.mjs            # auto-detect (interface used for the default route)
 *   node scripts/set-lan-ip.mjs 192.168.1.40
 *
 * Afterwards restart the API, the web server and Metro (the mobile app reads the URLs at bundle time).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

function detectIp() {
  const out = execFileSync('ip', ['route', 'get', '1.1.1.1'], { encoding: 'utf8' });
  const m = out.match(/\bsrc (\d+\.\d+\.\d+\.\d+)/);
  if (!m) throw new Error('Could not detect the LAN IP; pass it as an argument.');
  return m[1];
}

const ip = process.argv[2] ?? detectIp();
if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
  console.error(`Not an IPv4 address: ${ip}`);
  process.exit(1);
}

const updates = {
  'apps/api/.env': { APP_BASE_URL: `http://${ip}:4810`, WEB_BASE_URL: `http://${ip}:3100` },
  'apps/web/.env.local': { NEXT_PUBLIC_WEB_URL: `http://${ip}:3100` },
  'apps/mobile/.env': { EXPO_PUBLIC_API_URL: `http://${ip}:4810/v1`, EXPO_PUBLIC_WEB_URL: `http://${ip}:3100` },
};

for (const [file, vars] of Object.entries(updates)) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.warn(`skip ${file} (missing — copy it from its .env.example first)`);
    continue;
  }
  let text = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    const line = new RegExp(`^${key}=.*$`, 'm');
    text = line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`;
  }
  writeFileSync(path, text);
  console.log(`${file}: ${Object.keys(vars).join(', ')} → ${ip}`);
}
console.log('\nRestart the API, web server and Metro to pick up the new address.');
