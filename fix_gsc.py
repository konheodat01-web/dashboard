import re

with open('script_v5.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Wait for Firebase data before syncing
target1 = r"(wstSetGscBadge\('syncing',\s*'\.\.\.'\);(?:[\r\n]+)(?:\s*)try\s*\{)"
replacement1 = r"""wstSetGscBadge('syncing', '...');

  let waitCount = 0;
  while (!window._fbDataLoaded && waitCount < 30) {
    await new Promise(r => setTimeout(r, 500));
    waitCount++;
  }

  try {"""
content = re.sub(target1, replacement1, content)


# 2. Mark gsc_last_global_sync_date if no sites on GSC
target2 = r"(wstSetGscBadge\('nomatch'\);(?:[\r\n]+)(?:\s*)return;)"
replacement2 = r"""wstSetGscBadge('nomatch');
      localStorage.setItem('gsc_last_global_sync_date', todayVN());
      return;"""
content = re.sub(target2, replacement2, content)

with open('script_v5.js', 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Done")
