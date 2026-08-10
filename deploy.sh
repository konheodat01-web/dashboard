#!/bin/bash
cd /root/dashboard || cd /var/www/dashboard || cd /home/dashboard || cd $(find / -name "server.js" -exec dirname {} \; 2>/dev/null | head -n 1)
git stash
git pull origin main
pm2 reload all || pm2 restart all
