import { writeFile, mkdir, copyFile } from 'node:fs/promises';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const root = `${base}/`;
await mkdir('public', { recursive: true });
await writeFile('public/manifest.webmanifest', JSON.stringify({ id: root, name: 'Farmers', short_name: 'Farmers', description: 'Harvest your future. By shaping your identity.', start_url: root, scope: root, display: 'standalone', orientation: 'portrait-primary', background_color: '#faf9f6', theme_color: '#faf9f6', lang: 'en', categories: ['sports', 'social'], icons: [{src: `${base}/icons/icon-192.png`, sizes:'192x192',type:'image/png',purpose:'any'},{src:`${base}/icons/icon-512.png`,sizes:'512x512',type:'image/png',purpose:'any maskable'}] }, null, 2));
await writeFile('public/.nojekyll','');

await mkdir('public/vendor', { recursive: true });
await copyFile('node_modules/sql.js/dist/sql-wasm.wasm', 'public/vendor/sql-wasm.wasm');

await copyFile('node_modules/sql.js/dist/sql-wasm-browser.wasm', 'public/vendor/sql-wasm-browser.wasm');
