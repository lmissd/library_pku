#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.local.json");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "reading-events.jsonl");
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const config = loadLocalConfig();
const port = Number(process.env.PORT || config.port || 8080);
const host = process.env.HOST || config.host || "0.0.0.0";
const upstreamUrl = process.env.COZE_API_URL || config.cozeApiUrl || "https://cqccmb7q97.coze.site/run";
const cozeToken = process.env.COZE_TOKEN || config.cozeToken || "";
const accessCode = process.env.ACCESS_CODE || config.accessCode || "";

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendOptions(res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/run") {
      await handleApiRun(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "本机服务刚刚出错了，请稍后再试。" });
  }
});

server.listen(port, host, () => {
  const urls = getLanUrls(port);
  console.log("");
  console.log("北大附小智能阅读推荐本机服务已启动");
  console.log(`本机访问：http://127.0.0.1:${port}/`);
  urls.forEach((url) => console.log(`手机访问：${url}`));
  console.log(`数据写入：${DATA_FILE}`);
  console.log(`转发接口：${upstreamUrl}`);
  if (!cozeToken) {
    console.log("提示：尚未配置 COZE_TOKEN 或 config.local.json 中的 cozeToken，/api/run 会提示配置 Token。");
  }
  if (accessCode) {
    console.log("访问码保护：已开启。手机页面提交前需要在“接口设置”里填写访问码。");
  }
  console.log("");
});

async function handleApiRun(req, res) {
  const requestId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const bodyText = await readRequestBody(req);
  const payload = parseRequestJson(bodyText);
  const clientMeta = parseClientMeta(req.headers["x-reading-meta"]);
  const stage = getStage(payload);

  if (accessCode && req.headers["x-access-code"] !== accessCode) {
    const errorPayload = { error: "访问码不正确，请在页面“接口设置”里填写正确访问码。" };
    await appendEvent({
      id: requestId,
      created_at: startedAt,
      client_ip: req.socket.remoteAddress,
      stage,
      client_meta: clientMeta,
      request: payload,
      error: errorPayload.error
    });
    sendJson(res, 401, errorPayload);
    return;
  }

  if (!cozeToken && !req.headers.authorization) {
    const errorPayload = { error: "本机服务还没有配置 Coze Token，请设置 COZE_TOKEN 或 config.local.json。" };
    await appendEvent({
      id: requestId,
      created_at: startedAt,
      client_ip: req.socket.remoteAddress,
      stage,
      client_meta: clientMeta,
      request: payload,
      error: errorPayload.error
    });
    sendJson(res, 500, errorPayload);
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: req.headers.authorization || `Bearer ${cozeToken}`
  };

  let upstreamStatus = 502;
  let responseText = "";
  let responseBody = null;
  let errorMessage = "";

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    upstreamStatus = upstreamResponse.status;
    responseText = await upstreamResponse.text();
    responseBody = parseMaybeJson(responseText);
  } catch (error) {
    errorMessage = error && error.message ? error.message : "Upstream request failed.";
    responseBody = { error: "转发到 Coze 接口失败。", detail: errorMessage };
    responseText = JSON.stringify(responseBody);
  }

  await appendEvent({
    id: requestId,
    created_at: startedAt,
    finished_at: new Date().toISOString(),
    client_ip: req.socket.remoteAddress,
    stage,
    client_meta: clientMeta,
    upstream: {
      url: upstreamUrl,
      status: upstreamStatus
    },
    request: payload,
    response: responseBody,
    error: errorMessage || undefined
  });

  res.writeHead(upstreamStatus, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  res.end(responseText || "{}");
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      sendText(res, 403, "Forbidden");
      return;
    }
    const content = req.method === "HEAD" ? null : await fsp.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": "no-store"
    });
    if (content) {
      res.end(content);
    } else {
      res.end();
    }
  } catch (error) {
    sendText(res, 404, "Not found");
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseRequestJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error("Request body is not valid JSON.");
  }
}

function parseMaybeJson(text) {
  if (!text || !text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function parseClientMeta(value) {
  if (!value || Array.isArray(value)) {
    return {};
  }
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch (error) {
    return {};
  }
}

function getStage(payload) {
  if (payload.questions_and_answers) {
    return "evaluation";
  }
  if (payload.book_title) {
    return "questions";
  }
  if (payload.user_query) {
    return "recommendation";
  }
  return "unknown";
}

async function appendEvent(event) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.appendFile(DATA_FILE, `${JSON.stringify(event)}\n`, "utf8");
}

function loadLocalConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    return {};
  }
}

function getLanUrls(portValue) {
  const urls = [];
  const interfaces = os.networkInterfaces();

  Object.values(interfaces).forEach((items) => {
    (items || []).forEach((item) => {
      if (item.family === "IPv4" && !item.internal) {
        urls.push(`http://${item.address}:${portValue}/`);
      }
    });
  });

  return urls;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml; charset=utf-8"
  };
  return map[ext] || "application/octet-stream";
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendOptions(res) {
  res.writeHead(204, corsHeaders());
  res.end();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Reading-Meta, X-Access-Code"
  };
}
