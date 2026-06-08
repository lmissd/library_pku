const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_BASE_URL = "https://api.deepseek.com/chat/completions";

exports.main = async (event) => {
  try {
    if (isOptionsRequest(event)) {
      return jsonResponse(204, {});
    }

    const payload = readRequestBody(event);
    const validation = validatePayload(payload);
    if (validation) {
      return jsonResponse(400, { error: validation });
    }

    const quickInvalid = detectAllInvalidAnswers(payload.questions_and_answers);
    if (quickInvalid) {
      return jsonResponse(200, {
        reading_check_result: buildInvalidEvaluation(payload)
      });
    }

    const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return jsonResponse(500, { error: "Missing LLM_API_KEY or DEEPSEEK_API_KEY." });
    }

    const baseUrl = normalizeChatCompletionsUrl(process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL);
    const model = process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
    const prompt = buildPrompt(payload);

    const requestBody = {
      model,
      messages: [
        {
          role: "system",
          content: "你是严格、温和的小学阅读评估老师。你必须判断孩子回答是否能证明真实阅读，不能因为孩子提交了文字就给高分。只返回 JSON。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 1600,
      response_format: { type: "json_object" }
    };

    if (process.env.LLM_DISABLE_JSON_MODE === "true") {
      delete requestBody.response_format;
    }

    const upstream = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      return jsonResponse(502, {
        error: `LLM request failed: ${upstream.status}`,
        detail: rawText.slice(0, 500)
      });
    }

    const content = extractModelContent(rawText);
    const evaluation = normalizeEvaluation(parseJsonLoose(content));

    return jsonResponse(200, {
      reading_check_result: evaluation
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error && error.message ? error.message : "Unknown evaluateReading error."
    });
  }
};

function isOptionsRequest(event) {
  const method = event && (event.httpMethod || event.requestContext && event.requestContext.http && event.requestContext.http.method);
  return String(method || "").toUpperCase() === "OPTIONS";
}

function normalizeChatCompletionsUrl(value) {
  const url = textOf(value) || DEFAULT_BASE_URL;
  if (/\/chat\/completions\/?$/.test(url)) {
    return url;
  }
  return `${url.replace(/\/$/, "")}/chat/completions`;
}

function readRequestBody(event) {
  if (!event) {
    return {};
  }
  if (typeof event.body === "string") {
    return event.body ? JSON.parse(event.body) : {};
  }
  if (event.body && typeof event.body === "object") {
    return event.body;
  }
  return event;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Request body is required.";
  }
  if (!textOf(payload.book_title)) {
    return "book_title is required.";
  }
  if (!Array.isArray(payload.questions_and_answers) || !payload.questions_and_answers.length) {
    return "questions_and_answers must be a non-empty array.";
  }
  return "";
}

function buildPrompt(payload) {
  return [
    "请评估小学生是否真正读过并理解了这本书。",
    "",
    `书名：${textOf(payload.book_title)}`,
    `作者：${textOf(payload.book_author) || "未知"}`,
    `分类：${textOf(payload.book_category) || "未知"}`,
    `年级：${textOf(payload.grade) || "未知"}`,
    `图书简介：${textOf(payload.book_summary) || "暂无简介"}`,
    "",
    "孩子兴趣/阅读背景：",
    JSON.stringify(payload.child_profile || {}, null, 2),
    "",
    "问题、参考答案和孩子回答：",
    JSON.stringify(payload.questions_and_answers || [], null, 2),
    "",
    "严格规则：",
    "1. 如果回答是纯数字、乱码、重复字符、随便填、'不知道'、'没看'、答非所问，必须判低分。",
    "2. 不能因为孩子写了几个字就认为读懂；必须看是否包含人物、情节、知识点、主题理解或真实感受。",
    "3. 如果无法证明读过，level 必须是“未能证明已认真阅读”，score 不得高于 45。",
    "4. 如果只有泛泛表达、没有书中细节，score 不得高于 70。",
    "5. 评价要温和鼓励，但结论要诚实。",
    "",
    "只返回 JSON，不要 Markdown，不要解释文字。返回格式必须是：",
    JSON.stringify({
      level: "未能证明已认真阅读/还需要再读一读/读懂了主要内容/读得比较认真/读得非常好",
      score: 0,
      summary: "整体评价",
      detail_feedback: "详细反馈，说明哪些回答有效或无效",
      encouragement: "给孩子的鼓励语",
      next_book_suggestion: "下一步阅读建议",
      reading_portrait: {
        understanding: "理解情况",
        expression: "表达情况",
        parent_suggestion: "家长陪伴建议"
      },
      is_valid_reading_evidence: false
    }, null, 2)
  ].join("\n");
}

function extractModelContent(rawText) {
  const parsed = parseJsonLoose(rawText);
  const content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message
    ? parsed.choices[0].message.content
    : rawText;
  return textOf(content);
}

function parseJsonLoose(value) {
  if (value && typeof value === "object") {
    return value;
  }
  const text = textOf(value).trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw error;
  }
}

function normalizeEvaluation(raw) {
  const portrait = raw && raw.reading_portrait && typeof raw.reading_portrait === "object"
    ? raw.reading_portrait
    : {};
  const score = Number(raw && raw.score);
  return {
    level: textOf(raw && raw.level) || "阅读反馈",
    score: Number.isFinite(score) ? clamp(Math.round(score), 0, 100) : 0,
    summary: textOf(raw && raw.summary),
    detail_feedback: textOf(raw && raw.detail_feedback),
    encouragement: textOf(raw && raw.encouragement),
    next_book_suggestion: textOf(raw && raw.next_book_suggestion),
    reading_portrait: {
      understanding: textOf(portrait.understanding),
      expression: textOf(portrait.expression),
      parent_suggestion: textOf(portrait.parent_suggestion)
    },
    is_valid_reading_evidence: Boolean(raw && raw.is_valid_reading_evidence)
  };
}

function detectAllInvalidAnswers(answers) {
  return Array.isArray(answers)
    && answers.length > 0
    && answers.every((item) => isInvalidAnswer(item && item.child_answer));
}

function buildInvalidEvaluation(payload) {
  return {
    level: "未能证明已认真阅读",
    score: 25,
    summary: "这次回答看起来像随手填写，还没有看到和书中人物、情节或知识点有关的信息。",
    detail_feedback: "孩子的回答无法证明已经认真阅读。建议重新翻看书中一个具体片段，再用自己的话回答“谁做了什么、发生了什么、自己有什么感受”。",
    encouragement: "没关系，认真读完后再来回答一次就好。先挑书里最喜欢的一页说一说。",
    next_book_suggestion: `建议先复读《${textOf(payload.book_title)}》的关键片段，再重新完成小问答。`,
    reading_portrait: {
      understanding: "暂未体现有效阅读理解。",
      expression: "回答信息量不足，疑似无效填写。",
      parent_suggestion: "家长可以先请孩子口头复述一个具体情节，再帮助孩子把口头表达写下来。"
    },
    is_valid_reading_evidence: false
  };
}

function isInvalidAnswer(value) {
  const compact = textOf(value).trim().replace(/\s/g, "");
  if (!compact) {
    return true;
  }
  if (/^[\d０-９一二三四五六七八九零〇]+$/.test(compact)) {
    return true;
  }
  if (/^[a-zA-Z]+$/.test(compact) && compact.length <= 5) {
    return true;
  }
  if (/^(不知道|不懂|不会|没看|没读|忘了|没有|随便|无|不知道。?)$/i.test(compact)) {
    return true;
  }
  if (/^(.)\1{2,}$/.test(compact)) {
    return true;
  }
  return compact.length < 2;
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    },
    body: JSON.stringify(data)
  };
}

function textOf(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
