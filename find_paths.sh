#!/bin/bash
find / -name "index.html" 2>/dev/null | grep -E 'dashboard|nthieucloud' > /root/web_paths.txt
