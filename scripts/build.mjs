// Build para a Vercel: copia os arquivos estáticos para dist/ e gera dist/config.js
// a partir das variáveis de ambiente (nenhuma credencial fica no repositório).
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Faltam variáveis de ambiente: SUPABASE_URL e/ou SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['index.html', 'app.js', 'data.js', 'sw.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'img']) {
  if (existsSync(f)) cpSync(f, `${out}/${f}`, { recursive: true });
}
writeFileSync(`${out}/config.js`, `window.MT_CONFIG = ${JSON.stringify({ url, key })};\n`);
console.log('Build OK → dist/');
