# 免费部署指南

本项目是**纯静态站点**（HTML/CSS/JS，无后端），发布目录为 **`src/`**。
以下四种方案均可**免费**部署，任选其一。

---

## ⚠️ 部署前必读：API Key 安全

本项目为**前端直连大模型**。部署到公网后：

- 你在「设置 → AI 设置」里填的 **api-key 会保存在访问者自己的浏览器里**（localStorage），
  **不会**随代码上传，所以**仓库里不含你的 Key**——这是安全的。
- 但任何访问者只要填入自己的 Key 就能使用。如果你想限制只有自己能调 AI，
  需要额外做**后端代理**（见文末）。

> 结论：**代码可以直接公开部署**，但不要把自己的真实 Key 写进任何源文件。

---

## 方案一：Cloudflare Pages（推荐，免费无限带宽）

**优点**：带宽/请求数无限，速度快，支持自定义域名与 HTTPS。

1. 把项目推到 GitHub / GitLab 仓库。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择你的仓库，配置构建：

   | 配置项 | 值 |
   |--------|-----|
   | Framework preset | `None` |
   | Build command | *(留空)* |
   | Build output directory | `src` |

4. 点击 **Save and Deploy**，几十秒后即可访问 `https://<项目名>.pages.dev`。

> 之后每次 `git push` 都会自动重新部署。

---

## 方案二：Netlify（拖拽即可，最简单）

**优点**：无需 Git，直接把文件夹拖进去就能上线。

**方式 A：拖拽部署（最快）**

1. 打开 [app.netlify.com/drop](https://app.netlify.com/drop)
2. 把 **`src` 文件夹**直接拖进页面
3. 立即获得 `https://<随机名>.netlify.app` 网址

**方式 B：Git 部署**

1. 推送代码到 GitHub
2. Netlify → **Add new site** → **Import an existing project** → 选仓库
3. 构建配置：
   - Build command：*(留空)*
   - Publish directory：`src`
4. Deploy

> 项目已包含 `netlify.toml`，会自动识别发布目录。

---

## 方案三：Vercel

1. 推送代码到 GitHub
2. 打开 [vercel.com/new](https://vercel.com/new)，导入仓库
3. 配置：
   - Framework Preset：`Other`
   - Root Directory：*(留空)*
   - Build Command：*(留空)*
   - Output Directory：`src`
4. Deploy

> 项目已包含 `vercel.json`，会自动识别。

---

## 方案四：GitHub Pages

**优点**：与代码仓库一体，完全免费。

1. 推送代码到 GitHub 仓库（假设主分支为 `main`）
2. 仓库 **Settings** → **Pages** → **Build and deployment** → Source 选 **GitHub Actions**
3. 项目已包含 `.github/workflows/deploy.yml`，推送后会自动：
   - 先运行全部单元测试
   - 通过后发布 `src/` 到 GitHub Pages
4. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`

> 注意：GitHub Pages 默认域名在国内访问可能较慢。

---

## 方案五：Gitee Pages（国内访问最快）

1. 注册 [Gitee](https://gitee.com/)（需实名认证）
2. 新建仓库并推送代码
3. 仓库 → **服务** → **Gitee Pages**
4. 部署目录填写 `src`，点击启动
5. 获得 `https://<用户名>.gitee.io/<仓库名>/`

> Gitee Pages 免费版每次更新代码后需手动点击"更新"。

---

## 本地验证部署包

部署前可先在本地确认 `src/` 能独立运行：

```bash
npm start
# 或
node tools/server.js 8080 src
```

浏览器打开 http://localhost:8080 检查：

- 棋盘与 32 枚棋子正常显示
- 「廖老爷」五处形象（顶栏 / 侧栏 / 评语面板 / AI 对手卡 / 设置页）正常加载
- 双人对战、人机对战、设置三大模块可用

也可以运行全部测试：

```bash
npm test
```

---

## 进阶：加后端代理保护 API Key

如果你希望**只有自己能调用 AI**（不暴露 Key 给访问者），需要加一层后端。
推荐用 **Cloudflare Workers**（免费额度充足）：

```js
// Cloudflare Worker 示例
export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const body = await request.text();
    const upstream = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Key 存在 Worker 的环境变量里，前端拿不到
        Authorization: `Bearer ${env.ZHIPU_API_KEY}`,
      },
      body,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
```

部署后在「设置 → AI 设置」中把 **Base URL** 改为你的 Worker 地址即可。

---

## 常见问题

**Q：部署后打开白屏？**
A：确认发布目录是 `src`（不是项目根目录）。项目根目录的 `index.html` 不存在，
入口是 `src/index.html`。

**Q：图片（廖老爷形象）不显示？**
A：确认 `src/resources/liaolord.gif` 已被部署。托管平台应能自动处理 `resources/` 路径。

**Q：AI 功能报错 "网络请求失败"？**
A：多为跨域（CORS）或 Base URL 填写有误。检查：
- Base URL 是否为 `https://open.bigmodel.cn/api/paas/v4`
- API Key 是否有效
- 是否被浏览器拦截（按 F12 看控制台）

**Q：能否不要 AI 功能，只当纯本地象棋玩？**
A：可以。「双人对战」的全部功能都不依赖网络，直接部署使用即可。
