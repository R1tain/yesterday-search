/**
 * Yesterday Search - Cloudflare Edge Reverse Proxy Worker
 * 
 * Features:
 * 1. Global edge reverse proxy with SSL termination & anti-DDoS.
 * 2. Optional private access control (Token / Cookie / Bearer Header).
 * 3. Static asset edge caching (CSS/JS/images/fonts) via Cache API.
 * 4. Automatic upstream retry on cold boot.
 * 5. Full preservation of multi Set-Cookie headers for user preferences.
 * 6. ProxyGuard backend mutual authentication (X-Proxy-Secret).
 */

// 默认上游后端主机名（可在 Cloudflare Worker 环境变量 UPSTREAM_HOST 中覆盖）
const DEFAULT_UPSTREAM_HOST = 'your-koyeb-subdomain.koyeb.app';

export default {
  async fetch(request, env, ctx) {
    const KOYEB_HOST = env.UPSTREAM_HOST || DEFAULT_UPSTREAM_HOST;
    const url = new URL(request.url);

    // ═══════════════════════════════════════
    // 1. 私人访问鉴权（可选）
    // 若在 Worker 环境变量中配置了 ACCESS_TOKEN，则开启私有保护模式
    // ═══════════════════════════════════════
    if (env.ACCESS_TOKEN) {
      const tokenInQuery = url.searchParams.get('token');
      const tokenInCookie = getCookie(request.headers.get('Cookie') || '', 'searxng_token');
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      // 情况 A: API 请求（带 json 格式或带有 Bearer Token），验证通过直接放行
      if (bearerToken === env.ACCESS_TOKEN || (tokenInQuery === env.ACCESS_TOKEN && url.searchParams.get('format') === 'json')) {
        url.searchParams.delete('token');
      }
      // 情况 B: 浏览器首次带 ?token=xxx 访问 → 自动种 Cookie 并跳转至干净 URL
      else if (tokenInQuery === env.ACCESS_TOKEN) {
        url.searchParams.delete('token');
        return new Response(null, {
          status: 302,
          headers: {
            Location: url.toString(),
            'Set-Cookie': `searxng_token=${env.ACCESS_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
          },
        });
      }
      // 情况 C: 既没有合法 Cookie 也没有合法 Token → 拦截伪装 404
      else if (tokenInCookie !== env.ACCESS_TOKEN) {
        return new Response('404 Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    // ═══════════════════════════════════════
    // 2. 静态资源边缘缓存（CSS/JS/图片/字体）
    // ═══════════════════════════════════════
    const staticExts = /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|map)(\?.*)?$/i;
    const isStatic = request.method === 'GET' && staticExts.test(url.pathname);
    const cache = caches.default;

    if (isStatic) {
      try {
        const cached = await cache.match(request);
        if (cached) {
          const res = new Response(cached.body, cached);
          res.headers.set('X-Cache', 'HIT');
          return res;
        }
      } catch (e) {
        // 忽略缓存读取异常
      }
    }

    // ═══════════════════════════════════════
    // 3. 构造代理请求并注入安全鉴权头
    // ═══════════════════════════════════════
    const proxyUrl = new URL(url.toString());
    proxyUrl.hostname = KOYEB_HOST;
    proxyUrl.port = '443';
    proxyUrl.protocol = 'https:';

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('Host', KOYEB_HOST);
    proxyHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    proxyHeaders.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');
    proxyHeaders.set('X-Forwarded-Proto', 'https');

    // 注入 ProxyGuard 后端鉴权密钥（与 Koyeb 容器中间件匹配）
    const proxySecret = env.PROXY_SECRET || 'yesterday_search_cf_worker_auth_2026';
    proxyHeaders.set('X-Proxy-Secret', proxySecret);

    // 清理 CF 内部头，防止上游混淆
    ['cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry'].forEach(h =>
      proxyHeaders.delete(h)
    );

    // ═══════════════════════════════════════
    // 4. 冷启动容错重试机制
    // ═══════════════════════════════════════
    let response;
    const isGetOrHead = ['GET', 'HEAD'].includes(request.method);
    let requestBody = null;
    if (!isGetOrHead) {
      requestBody = await request.arrayBuffer();
    }

    const delays = [0, 800, 1500];

    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await sleep(delays[i]);
      try {
        response = await fetch(
          new Request(proxyUrl.toString(), {
            method: request.method,
            headers: proxyHeaders,
            body: isGetOrHead ? null : requestBody,
            redirect: 'manual', // 关键：禁止自动跟随 302，保留 Set-Cookie
          })
        );
        if (response.status < 500) break;
      } catch (err) {
        // 重试下一个 delay
      }
    }

    // 若多次重试后仍然失败或 5xx，展示友好启动过渡页
    if (!response || response.status >= 500) {
      return new Response(wakingUpPage(), {
        status: 503,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // ═══════════════════════════════════════
    // 5. 响应头处理与 Set-Cookie 保护
    // ═══════════════════════════════════════
    const respHeaders = new Headers(response.headers);
    respHeaders.delete('transfer-encoding');

    // 完整保留每一个独立的 Set-Cookie 头，确保用户搜索偏好不丢失
    if (response.headers.getSetCookie) {
      respHeaders.delete('set-cookie');
      for (const cookie of response.headers.getSetCookie()) {
        respHeaders.append('Set-Cookie', cookie);
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      respHeaders.set('Referrer-Policy', 'no-referrer');
      respHeaders.set('X-Frame-Options', 'DENY');
      respHeaders.set('X-Content-Type-Options', 'nosniff');
    }

    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });

    // ═══════════════════════════════════════
    // 6. 静态资源边缘写缓存（7天）
    // ═══════════════════════════════════════
    if (isStatic && response.status === 200) {
      try {
        const cacheHeaders = new Headers(respHeaders);
        cacheHeaders.set('Cache-Control', 'public, max-age=604800, immutable');
        const toCache = new Response(finalResponse.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers: cacheHeaders,
        });
        ctx.waitUntil(cache.put(request, toCache));
      } catch (e) {
        // 忽略写缓存失败
      }
    }

    return finalResponse;
  },
};

// ═══════════════════════════════════════
// 工具辅助函数
// ═══════════════════════════════════════
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getCookie(cookieStr, name) {
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

function wakingUpPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Yesterday Search 实例唤醒中</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a; color: #f8fafc;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; flex-direction: column; gap: 24px;
    }
    .logo { font-size: 2.2rem; font-weight: 800; font-style: italic; color: #487cff; letter-spacing: -0.5px; }
    .spinner {
      width: 44px; height: 44px;
      border: 3px solid rgba(72,124,255,0.15);
      border-top-color: #487cff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #94a3b8; font-size: 14px; font-weight: 500; }
    .countdown { color: #487cff; font-weight: 700; }
  </style>
</head>
<body>
  <div class="logo">Yesterday Search</div>
  <div class="spinner"></div>
  <p>后端服务启动中，<span class="countdown" id="cd">5</span> 秒后自动重试...</p>
  <script>
    let n = 5;
    const el = document.getElementById('cd');
    const t = setInterval(() => {
      el.textContent = --n;
      if (n <= 0) { clearInterval(t); location.reload(); }
    }, 1000);
  </script>
</body>
</html>`;
}
