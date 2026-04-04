#!/usr/bin/env node
/**
 * Migration script: uploads existing JSON build files to Vercel KV.
 *
 * Usage:
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/migrate-data.js [data-dir]
 *
 * data-dir defaults to ../build-sheet-data (a folder of JSON files).
 * Reads each *.json file (except index.json), uploads to KV.
 */

const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  console.error('Missing KV_REST_API_URL or KV_REST_API_TOKEN env vars.');
  console.error('Find these in Vercel Dashboard → Storage → your KV database → Settings.');
  process.exit(1);
}

async function kvCommand(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function main() {
  const dataDir = process.argv[2] || path.join(__dirname, '..', 'build-sheet-data');

  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    console.error('Copy your app/data/ folder here, or pass the path as an argument.');
    process.exit(1);
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'index.json');
  console.log(`Found ${files.length} build files to migrate.`);

  let success = 0;
  let errors = 0;

  for (const file of files) {
    const orderId = file.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));

      // SET the build data
      await kvCommand(['SET', `build:${orderId}`, JSON.stringify(data)]);
      // SADD to the index
      await kvCommand(['SADD', 'build:ids', orderId]);

      const clientName = data.client?.name || 'unknown';
      console.log(`  ✓ ${orderId} — ${clientName}`);
      success++;
    } catch (e) {
      console.error(`  ✗ ${orderId}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${success} migrated, ${errors} errors.`);
}

main().catch(e => { console.error(e); process.exit(1); });
