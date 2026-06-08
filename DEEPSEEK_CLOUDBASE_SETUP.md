# DeepSeek 大模型接入说明

当前版本只把“读后评价”接入大模型：

- 找书推荐：继续使用 `library.json` 1000 本本地书库
- 阅读问题：继续使用书库/前端规则生成
- 孩子提交答案后的阅读评价：调用 CloudBase 云函数 `evaluateReading`

## 1. 新建 CloudBase 云函数

在 CloudBase 控制台进入：

```text
云函数 / 托管 / 主机 -> 函数管理 -> 新建云函数
```

建议填写：

```text
函数名称：evaluateReading
运行环境：Node.js 18.15 或 Node.js 18
函数类型：普通函数
```

上传本地目录：

```text
D:\library_pku\cloudfunctions\evaluateReading
```

## 2. 配置环境变量

在 `evaluateReading` 云函数的环境变量里添加：

```text
LLM_API_KEY=你的 DeepSeek API Key
LLM_BASE_URL=https://api.deepseek.com/chat/completions
LLM_MODEL=deepseek-v4-flash
```

如果使用第三方中转站，把 `LLM_BASE_URL` 和 `LLM_MODEL` 改成中转站提供的地址和模型名即可。
`LLM_BASE_URL` 可以填基础地址，例如 `https://api.deepseek.com`，也可以填完整地址 `https://api.deepseek.com/chat/completions`。

如果中转站不支持 `response_format: {"type":"json_object"}`，再额外添加：

```text
LLM_DISABLE_JSON_MODE=true
```

## 3. 开通 HTTP API

给云函数开一个 HTTP 访问路径：

```text
路径：/api/evaluate-reading
方法：POST
后端函数：evaluateReading
```

当前 H5 代码默认调用：

```text
/api/evaluate-reading
```

如果 CloudBase 给的是完整 HTTP 地址，也可以把 `index.html` 里的 `READING_EVALUATION_API_URL` 改成完整地址。

## 4. 重新部署 H5

H5 上传包仍然是：

```text
D:\library_pku\cloudbase_upload.zip
```

上传到 CloudBase 静态网站托管并覆盖旧文件。

## 5. 验证方式

测试时可以让孩子回答：

```text
123
321
```

预期结果应该是低分，等级类似：

```text
未能证明已认真阅读
```

不应该再出现“读得比较认真”或“有明显阅读理解”。
