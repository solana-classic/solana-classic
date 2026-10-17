// File-based CLI compatibility entrypoint; libraries import bootstrap-core.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditBootstrap } from './bootstrap-core.mjs';
export { auditBootstrap } from './bootstrap-core.mjs';

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3)throw new Error('Usage: node mainnet/bootstrap.mjs <public-rehearsal-accounting-input.json>');
  console.log(JSON.stringify(auditBootstrap(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
}
