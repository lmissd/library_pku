# 项目记忆

## 当前目标

为“北大附小智能阅读推荐”制作一个手机端 H5 页面，并提供一个本机服务，让手机可以通过局域网链接直接打开；测试阶段数据暂时写入用户这台电脑。

## 2026-06-05 最新版本要求

- 页面仍然是纯前端 H5，主文件为 `index.html`。
- 新增三步流程：
  - 第一步：孩子输入姓名、年级、阅读偏好、阅读历史，调用同一个 API 获取三层推荐书单。
  - 第二步：孩子点击“我已读完📖”，调用同一个 API 为该书生成 2-3 个阅读检测问题。
  - 第三步：孩子提交答案，再调用同一个 API，返回阅读等级、分数、反馈、鼓励语和下一本推荐。
- 禁止使用前端模拟推荐数据，推荐、出题、评估都来自真实 API 返回。
- 返回字段 `result` / `reading_check_result` 可能是 JSON 字符串，也可能已经是对象，前端需要兼容解析。
- 展示书籍馆藏位置；当前可先用虚拟馆藏候选内容作为 `library_candidates` 传给 API。
- 页面保留 API 地址配置，默认空；当通过本机服务或局域网 IP 打开时，默认使用 `/api/run`。
- 使用温暖儿童友好的视觉风格：橙色、米白、淡蓝、淡粉，大按钮、大字体、圆角卡片、加载动画、返回上一步、刷新进度保存。

## 本机手机链接与数据收集策略

- 新增 `server.js`，使用 Node.js 原生 `http` 实现，无外部依赖。
- 本机服务负责：
  - 托管 `index.html`，让手机通过 `http://电脑局域网IP:8080/` 打开。
  - 提供 `/api/run`，把页面请求转发到 Coze 工作流接口。
  - 把每次请求、返回、阶段、孩子姓名/年级/书名等元信息写入 `data/reading-events.jsonl`。
- 新增 `config.local.example.json`，真实配置复制为 `config.local.json` 后填写 `cozeToken`。
- `config.local.json`、`data/`、`.env`、日志文件不提交到 GitHub。
- 新增 `start-local.bat` 和 `package.json`，方便 Windows 双击或 `npm start` 启动。

## GitHub 与版本控制

- 当前远程仓库：`https://github.com/lmissd/library_pku.git`
- 当前分支：`master`
- 本版本需要纳入 Git 管理并推送到 GitHub。
- GitHub Pages 可以继续展示静态 H5，但静态页面不能把数据写回用户电脑；需要本机数据收集时必须启动 `server.js` 并让手机访问局域网链接。

## 当前文件

- `index.html`：手机端 H5 主页面。
- `server.js`：本机静态托管、API 代理与数据收集服务。
- `config.local.example.json`：本机服务配置样例。
- `package.json`：启动脚本。
- `start-local.bat`：Windows 双击启动脚本。
- `.gitignore`：排除本机数据和敏感配置。
- `README.md`：使用说明。
