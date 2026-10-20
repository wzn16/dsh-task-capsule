#!/usr/bin/env bash
# dsh-task-capsule 安全回归：4 条断言
# 用法：DSH_WEB_BASE=http://127.0.0.1:49539 bash scripts/security-regression.sh
set -u
B="${DSH_WEB_BASE:-http://127.0.0.1:49539}"
fail=0
code() { curl -s -o /dev/null -w '%{http_code}' -X POST "$1" "${@:2}" -d '{}'; }

c1=$(code "$B/dsh-task-capsule/runstate/status" -H 'Host: evil.example.com')
[ "$c1" = "403" ] && echo "PASS 伪造 Host -> 403" || { echo "FAIL 伪造 Host 应为 403，实际 $c1"; fail=1; }

c2=$(code "$B/dsh-task-capsule/notify/status" -H 'Origin: https://evil.example.com' -H 'Sec-Fetch-Site: cross-site')
[ "$c2" = "403" ] && echo "PASS 跨站请求 -> 403" || { echo "FAIL 跨站请求应为 403，实际 $c2"; fail=1; }

c3=$(code "$B/dsh-task-capsule/runstate/status")
[ "$c3" = "200" ] && echo "PASS 同源请求 -> 200" || { echo "FAIL 同源请求应为 200，实际 $c3"; fail=1; }

n4=$(curl -s -X POST "$B/dsh-task-capsule/notify/status" -d '{}' | grep -c lastText || true)
[ "$n4" = "0" ] && echo "PASS 响应不含 lastText" || { echo "FAIL 响应仍含 lastText ×$n4"; fail=1; }

exit $fail
