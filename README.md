# 北大附小智能阅读推荐

一个面向小学生的手机端 H5 智能阅读推荐应用。孩子输入阅读兴趣后，系统推荐三层图书；读完后可以完成小问答，系统再评估阅读情况并推荐下一本。

## 当前版本

- 单页 H5：`index.html`
- 本机数据收集服务：`server.js`
- 公网手机访问：启动公网隧道后，不同手机、不同网络都可以打开同一个临时 HTTPS 链接
- 数据暂存到本机：`data/reading-events.jsonl`
- 后端工作流：所有推荐、出题、评估请求都转发到同一个 Coze API

## 功能

- 阅读兴趣收集：姓名、年级、阅读偏好、阅读历史
- 三层图书推荐：
  - 兴趣入口书
  - 桥梁书
  - 经典 / 拓展书
- 每本书展示书名、作者、推荐理由、馆藏位置
- 点击“我已读完📖”后生成 2-3 个阅读检测问题
- 孩子提交回答后展示等级、分数、详细反馈、鼓励语和下一本推荐
- API 地址、Token、馆藏候选内容可在页面中配置
- 进度保存到浏览器 `localStorage`，刷新后不丢失
- 本机服务会记录每次请求和 API 返回，便于临时收集数据

## 公网手机访问与数据收集

适合测试阶段：页面和数据服务仍运行在你的电脑上，但通过 Cloudflare Tunnel 暴露一个临时公网 HTTPS 链接，手机不需要和电脑在同一个 Wi-Fi。

1. 复制配置文件：

```powershell
Copy-Item config.local.example.json config.local.json
```

2. 编辑 `config.local.json`：

- 把 `cozeToken` 改成你的真实 Token。
- 可选：填写 `accessCode`，用于保护公网链接下的 `/api/run`，避免陌生人拿到链接后消耗你的 Coze Token。

3. 启动公网链接：

```powershell
npm run public
```

也可以双击 `start-public.bat`。

4. 终端会显示类似：

```text
https://xxxx.trycloudflare.com
```

不同手机、不同网络都可以直接打开这个 HTTPS 链接。使用期间请保持这个窗口打开。

5. 如果你设置了 `accessCode`，孩子打开页面后需要展开“接口设置”，在“访问码”里填写同一个访问码。

6. 数据会写入：

```text
data/reading-events.jsonl
```

`data/` 和 `config.local.json` 不会提交到 GitHub。

说明：Cloudflare Quick Tunnel 生成的是临时链接，每次重新启动可能会变化。如果需要长期固定链接，需要绑定 Cloudflare 账号和域名，或部署正式云服务器。

## 局域网访问

如果手机和电脑在同一个 Wi-Fi，也可以只启动本机服务：

```powershell
npm start
```

也可以双击 `start-local.bat`。

4. 终端会显示类似：

```text
手机访问：http://192.168.x.x:8080/
```

手机和电脑连接同一个 Wi-Fi 后，直接打开这个链接即可。不同网络请使用上面的公网链接。

## 线上静态页面

GitHub Pages 可继续托管 `index.html`：

https://lmissd.github.io/library_pku/

注意：GitHub Pages 是静态页面，不能把数据写回你的电脑。需要临时收集数据时，请使用上面的公网隧道链接或局域网链接。

## API

本机服务把页面请求转发到：

```text
https://cqccmb7q97.coze.site/run
```

POST 参数统一包含：

```json
{
  "user_query": "",
  "grade": "",
  "reading_history": "",
  "library_candidates": "",
  "book_title": "",
  "book_author": "",
  "book_summary": "",
  "book_category": "",
  "questions_and_answers": ""
}
```

## 技术说明

- 纯前端：HTML + CSS + JavaScript
- 本机服务：Node.js 原生 `http`，无外部依赖
- 公网临时链接：Cloudflare Tunnel / `cloudflared`
- 建议 Node.js 18 或以上
- 移动端优先设计，适配 320px-480px 手机屏幕
