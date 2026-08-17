const fs = require('fs');
let c = fs.readFileSync('script_v5.js', 'utf8');

c = c.replace(/wstSetGscBadge\('syncing', '\.\.\.'\);(\r?\n)+(\s*)try \{/g, `wstSetGscBadge('syncing', '...');\n\n$2// Doi Firebase load xong\n$2let waitCount = 0;\n$2while (!window._fbDataLoaded && waitCount < 30) {\n$2  await new Promise(r => setTimeout(r, 500));\n$2  waitCount++;\n$2}\n\n$2try {`);

c = c.replace(/wstSetGscBadge\('nomatch'\);(\r?\n)+(\s*)return;/g, `wstSetGscBadge('nomatch');\n$2localStorage.setItem('gsc_last_global_sync_date', todayVN());\n$2return;`);

fs.writeFileSync('script_v5.js', c);
console.log('Fixed script_v5.js');
