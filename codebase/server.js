/**
 * VLearn AI Quiz Agent — Backend Server with Complete PostgreSQL Database Coverage
 * Scope:
 *  1. Document & Page Text Storage (vlearn.documents, vlearn.document_pages)
 *  2. Quiz & Question Set Persistence (vlearn.quizzes, vlearn.quiz_questions, vlearn.questions)
 *  3. Student Attempt & Response Tracking (vlearn.quiz_attempts, vlearn.quiz_responses)
 *  4. Dynamic Knowledge Gap Analytics (AI topic tags stored with quiz attempts)
 *  5. Guardrails & Prompt Configuration (vlearn.prompt_templates, vlearn.guardrail_rules)
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

// Safe public config endpoint for API Key retrieval
app.get('/api/config', (req, res) => {
  res.json({
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  });
});

// PostgreSQL Connection Pool Setup
let dbPool = null;
let isDbConnected = false;
let isQuestionBankTableReady = false;
let isAttemptTableReady = false;

function initDatabaseConnection() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[Database] DATABASE_URL chưa được cấu hình. Server khởi chạy ở chế độ Fallback (In-Memory).');
    return;
  }

  try {
    dbPool = new Pool({
      connectionString: connectionString,
      ssl: connectionString.includes('neon.tech') || connectionString.includes('sslmode=require') 
        ? { rejectUnauthorized: false } 
        : false
    });

    dbPool.query(
      `SELECT NOW() AS now,
              to_regclass('vlearn.pdf_question_banks') IS NOT NULL AS question_bank_table_ready,
              to_regclass('vlearn.quiz_attempts') IS NOT NULL AS attempt_table_ready`,
      (err, result) => {
      if (err) {
        console.error('[Database Connection Error]:', err.message);
        isDbConnected = false;
        isQuestionBankTableReady = false;
        isAttemptTableReady = false;
      } else {
        console.log('[Database] Kết nối thành công tới PostgreSQL tại:', result.rows[0].now);
        isDbConnected = true;
        isQuestionBankTableReady = result.rows[0].question_bank_table_ready;
        isAttemptTableReady = result.rows[0].attempt_table_ready;
        console.log('[Database] Bảng vlearn.pdf_question_banks:', isQuestionBankTableReady ? 'sẵn sàng' : 'chưa được tạo');
        console.log('[Database] Bảng vlearn.quiz_attempts:', isAttemptTableReady ? 'sẵn sàng' : 'chưa được tạo');
      }
      }
    );
  } catch (err) {
    console.error('[Database Setup Exception]:', err.message);
    isDbConnected = false;
  }
}

initDatabaseConnection();

// Fallback In-Memory Stores when DB connection string is pending
const fallbackStore = {
  documents: [],
  questionBanks: [],
  quizzes: [],
  attempts: [
    {
      id: "ATT-1001",
      date: new Date(Date.now() - 3600000 * 24).toLocaleString("vi-VN"),
      lessonTitle: "Bài 01: Nhập môn AI Product (JTBD)",
      difficulty: "Trung bình",
      correctCount: 3,
      totalCount: 4,
      scorePct: 75,
      missedTopics: ["automation"]
    }
  ],
  guardrails: {
    systemPrompt: "You are VLearn Active Recall Quiz Generator. Always generate questions grounded STRICTLY in the provided PDF material. Every correct answer explanation MUST cite exact page numbers [Trang N].",
    temperature: 0.2,
    strictGrounding: true,
    refuseOutOfScope: true,
    automationLevel: "augment",
    hallucinationGuardFilterPct: 85
  }
};

/* ==========================================================================
   HELPER: GEMINI LLM API REST CALL
   ========================================================================== */
async function callGeminiApi(prompt, systemInstruction = '', apiKeyOverride = '', attempt = 0) {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY || 'AIzaSyAimqCTPphgH10WTQHdRQOAMJDzrYoJfEQ';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cung cấp.');
  }

  const modelCandidates = ['gemini-1.5-flash-8b', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-pro'];
  const model = process.env.GEMINI_MODEL || modelCandidates[attempt % modelCandidates.length];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const payloadData = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            const textResponse = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve(textResponse);
          } catch (e) {
            reject(new Error('Lỗi parse phản hồi từ Gemini API: ' + e.message));
          }
        } else {
          let apiMessage = '';
          try {
            apiMessage = JSON.parse(body)?.error?.message || '';
          } catch {
            apiMessage = body;
          }
          if ([429, 503].includes(res.statusCode) && attempt < 2) {
            const retryDelayMs = 1000 * (2 ** attempt);
            setTimeout(() => {
              callGeminiApi(prompt, systemInstruction, apiKeyOverride, attempt + 1)
                .then(resolve)
                .catch(reject);
            }, retryDelayMs);
            return;
          }
          if (res.statusCode === 429) {
            reject(new Error('Gemini đã hết quota/rate limit. Question bank mới không được tạo; hệ thống sẽ không dùng câu hỏi cũ thay thế.'));
          } else {
            reject(new Error(`Gemini API Error (${res.statusCode}): ${apiMessage || 'Không có nội dung lỗi'}`));
          }
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(60000, () => {
      req.destroy(new Error('Gemini API quá thời gian chờ 60 giây.'));
    });
    req.write(payloadData);
    req.end();
  });
}

function cleanGeminiJson(text) {
  let cleaned = (text || '').trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
  if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
  return cleaned.trim();
}

function normalizeDifficultyMix(mix, count, fallbackDifficulty = 'medium') {
  const levels = ['easy', 'medium', 'hard'];
  const safeCount = Math.max(1, Number.parseInt(count, 10) || 1);
  const source = mix && typeof mix === 'object' ? mix : {};
  const weights = levels.map(level => Math.max(0, Number(source[level]) || 0));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);

  if (weightTotal <= 0) {
    const result = { easy: 0, medium: 0, hard: 0 };
    result[levels.includes(fallbackDifficulty) ? fallbackDifficulty : 'medium'] = safeCount;
    return result;
  }

  const raw = weights.map(weight => (weight / weightTotal) * safeCount);
  const counts = raw.map(value => Math.floor(value));
  let remaining = safeCount - counts.reduce((sum, value) => sum + value, 0);
  const remainderOrder = raw
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remaining; i++) {
    counts[remainderOrder[i % remainderOrder.length].index] += 1;
  }

  return { easy: counts[0], medium: counts[1], hard: counts[2] };
}

function buildInitialBalancedMix(count) {
  const safeCount = Math.max(1, Number.parseInt(count, 10) || 1);
  const base = Math.floor(safeCount / 3);
  const mix = { easy: base, medium: base, hard: base };
  const remainderOrder = ['medium', 'easy', 'hard'];
  for (let index = 0; index < safeCount - base * 3; index++) {
    mix[remainderOrder[index]] += 1;
  }
  return mix;
}

function buildDifficultyPlan(mix) {
  return [
    ...Array(mix.easy || 0).fill('easy'),
    ...Array(mix.medium || 0).fill('medium'),
    ...Array(mix.hard || 0).fill('hard')
  ];
}

function requireUuid(value, fieldName) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    const error = new Error(`${fieldName} không hợp lệ`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function sourceHash(extractedText) {
  return crypto.createHash('sha256').update(extractedText, 'utf8').digest('hex');
}

function sameDifficultyMix(left, right) {
  return ['easy', 'medium', 'hard'].every(level =>
    Number(left?.[level] || 0) === Number(right?.[level] || 0)
  );
}

const SEMANTIC_BATCH_CHAR_LIMIT = 14000;
const SEMANTIC_CHUNK_CHAR_LIMIT = 8000;

function splitLongText(text, maxChars = 1600) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) || [normalized];
  const parts = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = `${current} ${sentence}`.trim();
    if (candidate.length > maxChars && current) {
      parts.push(current);
      current = sentence.trim();
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.flatMap(part => {
    if (part.length <= maxChars) return [part];
    const slices = [];
    for (let index = 0; index < part.length; index += maxChars) {
      slices.push(part.slice(index, index + maxChars));
    }
    return slices;
  });
}

function extractDocumentUnits(extractedText) {
  const text = String(extractedText || '').trim();
  const pagePattern = /\[Trang\s+(\d+)\]/gi;
  const markers = [...text.matchAll(pagePattern)];
  if (!markers.length) {
    return splitLongText(text).map((unitText, index) => ({
      id: `u${index + 1}`,
      page: 1,
      text: unitText
    }));
  }

  const units = [];
  markers.forEach((marker, markerIndex) => {
    const contentStart = marker.index + marker[0].length;
    const contentEnd = markerIndex + 1 < markers.length ? markers[markerIndex + 1].index : text.length;
    const page = Number(marker[1]);
    const pageText = text.slice(contentStart, contentEnd).trim();
    const paragraphs = pageText
      .split(/\n\s*\n|\n(?=\s*(?:[-•*]|\d+[.)]))/g)
      .map(value => value.trim())
      .filter(Boolean);
    const sourceParagraphs = paragraphs.length ? paragraphs : [pageText];
    sourceParagraphs.flatMap(paragraph => splitLongText(paragraph)).forEach(unitText => {
      if (unitText) {
        units.push({ id: `u${units.length + 1}`, page, text: unitText });
      }
    });
  });
  return units;
}

function groupUnitsIntoBatches(units, maxChars = SEMANTIC_BATCH_CHAR_LIMIT) {
  const batches = [];
  let current = [];
  let currentLength = 0;
  for (const unit of units) {
    const serializedLength = unit.text.length + 40;
    if (current.length && currentLength + serializedLength > maxChars) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(unit);
    currentLength += serializedLength;
  }
  if (current.length) batches.push(current);
  return batches;
}

function splitOversizedSemanticChunk(chunk) {
  if (chunk.text.length <= SEMANTIC_CHUNK_CHAR_LIMIT || chunk.units.length <= 1) {
    return [chunk];
  }
  const pieces = [];
  let currentUnits = [];
  let currentLength = 0;
  for (const unit of chunk.units) {
    if (currentUnits.length && currentLength + unit.text.length > SEMANTIC_CHUNK_CHAR_LIMIT) {
      pieces.push(currentUnits);
      currentUnits = [];
      currentLength = 0;
    }
    currentUnits.push(unit);
    currentLength += unit.text.length;
  }
  if (currentUnits.length) pieces.push(currentUnits);
  return pieces.map((units, index) => ({
    ...chunk,
    title: pieces.length > 1 ? `${chunk.title} (${index + 1}/${pieces.length})` : chunk.title,
    units,
    pageStart: units[0].page,
    pageEnd: units[units.length - 1].page,
    text: units.map(unit => `[Trang ${unit.page}]\n${unit.text}`).join('\n\n')
  }));
}

async function semanticChunkBatch(batch, batchIndex, apiKey) {
  const unitText = batch
    .map(unit => `<unit id="${unit.id}" page="${unit.page}">${unit.text}</unit>`)
    .join('\n');
  const prompt = `Group the following consecutive Vietnamese document units by meaning.
Rules:
- Every unit id must appear exactly once.
- Keep original order and only group consecutive units.
- Start a new group when the subject, learning objective, definition, process, example, or argument changes.
- Keep each group below ${SEMANTIC_CHUNK_CHAR_LIMIT} characters when possible.
- Return only a valid JSON array. Do not return markdown.

Schema:
[{"title":"short Vietnamese topic title","unitIds":["u1","u2"],"summary":"2-3 sentence Vietnamese summary","keyConcepts":["concept 1","concept 2"],"importance":0.8}]

Units:
${unitText}`;
  const systemInstruction = `You are a semantic document segmenter. Group text by conceptual coherence, not by fixed character count. Preserve all unit ids exactly once.`;
  const response = await callGeminiApi(prompt, systemInstruction, apiKey);
  const parsed = JSON.parse(cleanGeminiJson(response));
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error(`Semantic chunking batch ${batchIndex + 1} không trả về danh sách hợp lệ.`);
  }

  const unitMap = new Map(batch.map(unit => [unit.id, unit]));
  const seenIds = [];
  const rawChunks = parsed.map((group, groupIndex) => {
    const ids = Array.isArray(group.unitIds) ? group.unitIds.map(String) : [];
    const units = ids.map(id => unitMap.get(id)).filter(Boolean);
    if (!units.length) {
      throw new Error(`Semantic chunk ${groupIndex + 1} không chứa unit hợp lệ.`);
    }
    seenIds.push(...units.map(unit => unit.id));
    return {
      title: String(group.title || `Chủ đề ${groupIndex + 1}`).trim(),
      summary: String(group.summary || '').trim(),
      keyConcepts: Array.isArray(group.keyConcepts)
        ? group.keyConcepts.map(value => String(value).trim()).filter(Boolean).slice(0, 8)
        : [],
      importance: Math.min(1, Math.max(0, Number(group.importance) || 0.5)),
      units,
      pageStart: units[0].page,
      pageEnd: units[units.length - 1].page,
      text: units.map(unit => `[Trang ${unit.page}]\n${unit.text}`).join('\n\n')
    };
  });

  const expectedIds = batch.map(unit => unit.id);
  if (seenIds.length !== expectedIds.length || seenIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error(`Semantic chunking batch ${batchIndex + 1} làm thiếu, lặp hoặc đảo thứ tự đoạn văn.`);
  }
  return rawChunks.flatMap(splitOversizedSemanticChunk);
}

async function buildSemanticChunks(extractedText, apiKey) {
  const units = extractDocumentUnits(extractedText);
  if (!units.length) return [];
  const batches = groupUnitsIntoBatches(units);
  const chunks = [];
  for (let index = 0; index < batches.length; index++) {
    const batchChunks = await semanticChunkBatch(batches[index], index, apiKey);
    chunks.push(...batchChunks);
  }
  return chunks.map((chunk, index) => ({ ...chunk, id: `chunk-${index + 1}` }));
}

function buildFallbackQuestionPlan(chunks, difficultyMix, count) {
  const difficultyPlan = buildDifficultyPlan(difficultyMix);
  const selected = [];
  for (let index = 0; index < count; index++) {
    const position = count === 1
      ? Math.floor((chunks.length - 1) / 2)
      : Math.round((index * (chunks.length - 1)) / (count - 1));
    selected.push({ chunkId: chunks[position].id, difficulties: [difficultyPlan[index]] });
  }
  return aggregateQuestionPlan(selected);
}

function aggregateQuestionPlan(plan) {
  const aggregated = [];
  const byChunk = new Map();
  for (const assignment of plan) {
    let target = byChunk.get(assignment.chunkId);
    if (!target) {
      target = { chunkId: assignment.chunkId, difficulties: [] };
      byChunk.set(assignment.chunkId, target);
      aggregated.push(target);
    }
    target.difficulties.push(...assignment.difficulties);
  }
  return aggregated;
}

async function planQuestionsAcrossChunks(chunks, difficultyMix, count, apiKey) {
  if (chunks.length === 1) {
    return [{ chunkId: chunks[0].id, difficulties: buildDifficultyPlan(difficultyMix) }];
  }
  const catalog = chunks.map(chunk => ({
    chunkId: chunk.id,
    title: chunk.title,
    pages: `${chunk.pageStart}-${chunk.pageEnd}`,
    summary: chunk.summary.slice(0, 700),
    keyConcepts: chunk.keyConcepts,
    importance: chunk.importance
  }));
  const prompt = `Create a coverage-oriented question plan from this semantic map of one PDF.
Choose content from different parts of the document. Prefer important concepts, but maintain broad page coverage.
Return exactly ${count} question slots with this exact total difficulty mix:
easy=${difficultyMix.easy}, medium=${difficultyMix.medium}, hard=${difficultyMix.hard}.
Each chunkId must exist in the catalog. A chunk may receive more than one difficulty.
Return only valid JSON with this schema:
[{"chunkId":"chunk-1","difficulties":["easy","medium"]}]

Semantic map:
${JSON.stringify(catalog)}`;
  const response = await callGeminiApi(
    prompt,
    'You are a curriculum planner. Plan broad, non-duplicative assessment coverage using only the supplied semantic map.',
    apiKey
  );
  const parsed = JSON.parse(cleanGeminiJson(response));
  const validIds = new Set(chunks.map(chunk => chunk.id));
  const normalized = Array.isArray(parsed)
    ? parsed.map(item => ({
      chunkId: String(item.chunkId || ''),
      difficulties: Array.isArray(item.difficulties)
        ? item.difficulties.map(String).filter(level => ['easy', 'medium', 'hard'].includes(level))
        : []
    })).filter(item => validIds.has(item.chunkId) && item.difficulties.length)
    : [];
  const plannedLevels = normalized.flatMap(item => item.difficulties);
  const plannedMix = {
    easy: plannedLevels.filter(level => level === 'easy').length,
    medium: plannedLevels.filter(level => level === 'medium').length,
    hard: plannedLevels.filter(level => level === 'hard').length
  };
  if (plannedLevels.length !== count || !sameDifficultyMix(plannedMix, difficultyMix)) {
    return buildFallbackQuestionPlan(chunks, difficultyMix, count);
  }
  return aggregateQuestionPlan(normalized);
}

function buildQuestionGenerationPrompt({ lessonTitle, extractedText, count, difficultyMix, semanticTitle = '' }) {
  return {
    systemInstruction: `Bạn là chuyên gia thiết kế câu hỏi Active Recall cho VLearn.
Mọi câu hỏi phải được tạo CHỈ từ nội dung của đúng tài liệu PDF được cung cấp trong yêu cầu hiện tại.
Không được dùng câu hỏi mẫu, kiến thức từ tài liệu khác hoặc kiến thức ngoài tài liệu.
Nếu tài liệu không đủ căn cứ, hãy báo lỗi thay vì tự bịa.
Giải thích đáp án đúng và sai phải chi tiết, mang tính sư phạm, không mở đầu bằng nguồn.
Nguồn chỉ nằm trong field "citation".
Chỉ trả về một JSON array hợp lệ, không dùng markdown code fence.`,
    prompt: `MÃ NGUỒN CỦA PHẦN TÀI LIỆU HIỆN TẠI: ${sourceHash(extractedText)}
BÀI GIẢNG: ${lessonTitle || 'Tài liệu PDF mới tải lên'}
CHỦ ĐỀ NGỮ NGHĨA: ${semanticTitle || 'Nội dung tài liệu'}

NỘI DUNG DUY NHẤT ĐƯỢC PHÉP DÙNG:
"""
${extractedText}
"""

Tạo đúng ${count} câu trắc nghiệm, phân bổ chính xác:
- easy: ${difficultyMix.easy}
- medium: ${difficultyMix.medium}
- hard: ${difficultyMix.hard}

Yêu cầu bắt buộc:
1. Mỗi câu phải kiểm tra một ý có thật trong tài liệu hiện tại và có 4 lựa chọn.
2. correctAnswer là chỉ số 0-3.
3. explanationCorrect dài 3-5 câu: nêu khái niệm, lập luận và cách áp dụng.
4. explanationIncorrect dài 2-4 câu: chỉ ra ngộ nhận và cách sửa.
5. optionExplanations có đúng 4 phần tử tương ứng với 4 lựa chọn.
6. citation phải là nhãn [Trang N] có thật trong nội dung trên.
7. topicTag là tên chủ đề ngắn gọn bằng tiếng Việt, dễ đọc trên dashboard và được rút ra từ chính PDF; không dùng danh sách cố định.

Schema:
[
  {
    "type": "single",
    "difficulty": "easy",
    "topicTag": "Tên chủ đề trong PDF",
    "question": "Nội dung câu hỏi",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correctAnswer": 0,
    "explanationCorrect": "...",
    "explanationIncorrect": "...",
    "optionExplanations": ["...", "...", "...", "..."],
    "citation": "[Trang N]"
  }
]`
  };
}

async function generateQuestionsForSource({ lessonTitle, extractedText, count, difficultyMix, apiKey }) {
  if (!String(extractedText || '').trim() || String(extractedText).trim().length < 80) {
    const error = new Error('PDF không có đủ văn bản để AI tạo câu hỏi mới.');
    error.statusCode = 422;
    throw error;
  }

  const semanticChunks = await buildSemanticChunks(extractedText, apiKey);
  if (!semanticChunks.length) {
    const error = new Error('Không thể tạo semantic chunk từ nội dung PDF.');
    error.statusCode = 422;
    throw error;
  }
  const questionPlan = await planQuestionsAcrossChunks(semanticChunks, difficultyMix, count, apiKey);
  const chunkMap = new Map(semanticChunks.map(chunk => [chunk.id, chunk]));
  const generated = [];

  for (const assignment of questionPlan) {
    const chunk = chunkMap.get(assignment.chunkId);
    if (!chunk) continue;
    const chunkMix = {
      easy: assignment.difficulties.filter(level => level === 'easy').length,
      medium: assignment.difficulties.filter(level => level === 'medium').length,
      hard: assignment.difficulties.filter(level => level === 'hard').length
    };
    const { prompt, systemInstruction } = buildQuestionGenerationPrompt({
      lessonTitle,
      extractedText: chunk.text,
      count: assignment.difficulties.length,
      difficultyMix: chunkMix,
      semanticTitle: chunk.title
    });
    const aiResponse = await callGeminiApi(prompt, systemInstruction, apiKey);
    const parsed = JSON.parse(cleanGeminiJson(aiResponse));
    if (!Array.isArray(parsed) || parsed.length !== assignment.difficulties.length) {
      throw new Error(`Gemini trả ${Array.isArray(parsed) ? parsed.length : 0}/${assignment.difficulties.length} câu cho chủ đề "${chunk.title}".`);
    }
    parsed.forEach((question, index) => {
      generated.push({
        question,
        expectedDifficulty: assignment.difficulties[index],
        sourceText: chunk.text,
        semanticTitle: chunk.title
      });
    });
  }

  if (generated.length !== count) {
    throw new Error(`Gemini tạo ${generated.length}/${count} câu sau semantic chunking; question bank chưa được lưu.`);
  }

  const seenQuestions = new Set();
  const questions = generated.map(({ question, expectedDifficulty, sourceText, semanticTitle }, index) => {
    const options = Array.isArray(question.options) ? question.options : [];
    const correctAnswer = Number(question.correctAnswer);
    if (!String(question.question || '').trim() || options.length !== 4) {
      throw new Error(`Câu ${index + 1} không đúng cấu trúc 4 lựa chọn.`);
    }
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
      throw new Error(`Câu ${index + 1} có correctAnswer không hợp lệ.`);
    }
    let citation = String(question.citation || '').trim();
    if (/^Trang\s+\d+$/i.test(citation)) {
      citation = `[${citation}]`;
    }
    const pageMatches = [...sourceText.matchAll(/\[Trang\s+(\d+)\]/gi)].map(m => m[0]);
    if (!/^\[Trang\s+\d+\]$/i.test(citation) || !sourceText.includes(citation)) {
      citation = pageMatches.length > 0 ? pageMatches[0] : '[Trang 1]';
    }
    if (!Array.isArray(question.optionExplanations) || question.optionExplanations.length !== 4) {
      question.optionExplanations = [
        "Lựa chọn này bám sát dữ kiện bài học.",
        "Lựa chọn này chưa bao quát đầy đủ dữ kiện.",
        "Lựa chọn này chứa ý chưa chính xác.",
        "Lựa chọn này nhầm lẫn thuật ngữ cốt lõi."
      ];
    }
    if (!String(question.explanationCorrect || '').trim()) {
      question.explanationCorrect = "Đáp án này phân tích đúng các khái niệm và nguyên lý được đề cập trong bài giảng.";
    }
    if (!String(question.explanationIncorrect || '').trim()) {
      question.explanationIncorrect = "Lựa chọn này chưa bám sát đúng bản chất của bài học.";
    }

    let normalizedQuestion = String(question.question).toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
    if (seenQuestions.has(normalizedQuestion)) {
      question.question = `${question.question} (Khía cạnh ${index + 1})`;
      normalizedQuestion = String(question.question).toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
    }
    seenQuestions.add(normalizedQuestion);
    return {
      ...question,
      id: index + 1,
      type: 'single',
      difficulty: expectedDifficulty,
      topicTag: String(question.topicTag || semanticTitle || 'Nội dung tài liệu').trim(),
      correctAnswer,
      options,
      explanationCorrect: String(question.explanationCorrect || '').trim(),
      explanationIncorrect: String(question.explanationIncorrect || '').trim(),
      optionExplanations: question.optionExplanations,
      citation
    };
  });
  return {
    questions,
    semanticChunkCount: semanticChunks.length,
    semanticTopics: semanticChunks.map(chunk => chunk.title)
  };
}

async function persistQuestionBank(bank) {
  fallbackStore.questionBanks.unshift(bank);
  fallbackStore.questionBanks = fallbackStore.questionBanks.slice(0, 50);

  if (!isDbConnected || !dbPool || !isQuestionBankTableReady) return false;

  try {
    await dbPool.query(
      `INSERT INTO vlearn.pdf_question_banks
        (id, source_id, lesson_title, original_filename, source_sha256, question_count, difficulty_mix, questions, generation_mode, model_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'gemini', $9)`,
      [
        bank.id,
        bank.sourceId,
        bank.lessonTitle,
        bank.originalFilename,
        bank.sourceSha256,
        bank.questionCount,
        JSON.stringify(bank.difficultyMix),
        JSON.stringify(bank.questions),
        bank.modelName
      ]
    );
    return true;
  } catch (error) {
    console.error('[Question Bank DB Save Error]:', error.message);
    return false;
  }
}

async function findQuestionBank(bankId, sourceId) {
  const memoryBank = fallbackStore.questionBanks.find(bank =>
    bank.id === bankId && bank.sourceId === sourceId
  );
  if (memoryBank) return memoryBank;

  if (!isDbConnected || !dbPool || !isQuestionBankTableReady) return null;

  try {
    const result = await dbPool.query(
      `SELECT id, source_id, lesson_title, original_filename, source_sha256,
              question_count, difficulty_mix, questions, model_name, created_at
         FROM vlearn.pdf_question_banks
        WHERE id = $1 AND source_id = $2
        LIMIT 1`,
      [bankId, sourceId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      sourceId: row.source_id,
      lessonTitle: row.lesson_title,
      originalFilename: row.original_filename,
      sourceSha256: row.source_sha256,
      questionCount: row.question_count,
      difficultyMix: row.difficulty_mix,
      questions: row.questions,
      modelName: row.model_name,
      createdAt: row.created_at
    };
  } catch (error) {
    console.error('[Question Bank DB Read Error]:', error.message);
    return null;
  }
}

function buildFallbackAdaptiveAnalysis(history, totalQuestions) {
  const recent = Array.isArray(history) ? history.slice(0, 10) : [];
  const latest = recent[0] || {};
  const latestScore = Number(latest.scorePct) || 0;
  const previousScores = recent.slice(1).map(item => Number(item.scorePct) || 0);
  const previousAverage = previousScores.length
    ? previousScores.reduce((sum, value) => sum + value, 0) / previousScores.length
    : latestScore;

  let performanceTrend = 'stable';
  if (recent.length < 2) performanceTrend = 'insufficient_data';
  else if (latestScore >= previousAverage + 8) performanceTrend = 'improving';
  else if (latestScore <= previousAverage - 8) performanceTrend = 'declining';

  let weights;
  if (latestScore >= 80) weights = { easy: 20, medium: 30, hard: 50 };
  else if (latestScore < 50) weights = { easy: 60, medium: 30, hard: 10 };
  else weights = { easy: 30, medium: 50, hard: 20 };

  const topicCounts = {};
  recent.forEach(attempt => {
    (attempt.missedTopics || []).forEach(topic => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });
  const weakTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  return {
    weakTopics,
    summary: latestScore >= 80
      ? 'Kết quả gần nhất cho thấy bạn đã nắm khá vững nội dung. Bài tiếp theo nên tăng tỷ trọng câu khó nhưng vẫn giữ một phần câu dễ và trung bình để kiểm tra độ ổn định.'
      : latestScore < 50
        ? 'Kết quả gần nhất cho thấy nền tảng kiến thức chưa ổn định. Bài tiếp theo nên tăng câu dễ, củng cố khái niệm cốt lõi rồi mới nâng dần độ khó.'
        : 'Kết quả đang ở mức trung gian. Bài tiếp theo nên tập trung câu trung bình, kèm một số câu dễ để củng cố và câu khó để kiểm tra khả năng vận dụng.',
    performanceTrend,
    reasoning: `Điểm gần nhất là ${latestScore}%; điểm trung bình các lượt trước là ${Math.round(previousAverage)}%.`,
    nextMix: normalizeDifficultyMix(weights, totalQuestions, 'medium')
  };
}

/* ==========================================================================
   1. HEALTH CHECK ENDPOINT
   ========================================================================== */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      configured: !!process.env.DATABASE_URL,
      connected: isDbConnected,
      questionBankTableReady: isQuestionBankTableReady,
      attemptTableReady: isAttemptTableReady,
      mode: isDbConnected ? 'PostgreSQL Active (vlearn schema)' : 'Fallback LocalStorage/Memory'
    },
    ai: {
      geminiKeyPresent: !!process.env.GEMINI_API_KEY
    }
  });
});

/* ==========================================================================
   2. DOCUMENT PERSISTENCE ENDPOINT: Save PDF Extracted Text & Metadata
   ========================================================================== */
app.post('/api/documents/save', async (req, res) => {
  const { title, originalFilename, extractedText, pages = [] } = req.body;

  if (!title || !extractedText) {
    return res.status(400).json({ error: 'Thiếu thông tin tiêu đề hoặc nội dung PDF' });
  }

  // Save to PostgreSQL DB if connected
  if (isDbConnected && dbPool) {
    try {
      // 1. Create document record
      const docRes = await dbPool.query(
        `INSERT INTO vlearn.documents (title, description, status) VALUES ($1, $2, 'ready') RETURNING id`,
        [title, `Tài liệu PDF: ${originalFilename || title}`]
      );
      const documentId = docRes.rows[0].id;

      // 2. Insert document version
      const verRes = await dbPool.query(
        `INSERT INTO vlearn.document_versions (document_id, version_number, storage_path, original_filename, file_size_bytes, file_sha256, page_count, extraction_status)
         VALUES ($1, 1, $2, $3, $4, $5, $6, 'completed') RETURNING id`,
        [documentId, `storage/pdf/${title}.pdf`, originalFilename || `${title}.pdf`, extractedText.length, 'sha256_placeholder', pages.length || 1]
      );
      const versionId = verRes.rows[0].id;

      // 3. Save extracted text page by page into document_pages
      if (pages.length > 0) {
        for (const p of pages) {
          await dbPool.query(
            `INSERT INTO vlearn.document_pages (document_version_id, page_number, extracted_text) VALUES ($1, $2, $3)`,
            [versionId, p.pageNumber, p.pageText]
          );
        }
      } else {
        await dbPool.query(
          `INSERT INTO vlearn.document_pages (document_version_id, page_number, extracted_text) VALUES ($1, 1, $2)`,
          [versionId, extractedText]
        );
      }

      return res.json({ success: true, documentId, versionId, savedToDb: true });
    } catch (dbErr) {
      console.error('[DB Document Save Error]:', dbErr.message);
    }
  }

  // Memory Fallback
  fallbackStore.documents.unshift({ id: Date.now(), title, extractedText });
  return res.json({ success: true, savedToDb: false, mode: 'In-Memory Fallback' });
});

/*
 * Generate a fresh, source-scoped question bank immediately after a PDF is
 * extracted in the browser. The sourceId is created for that upload only.
 */
app.post('/api/question-banks/generate', async (req, res) => {
  try {
    const {
      sourceId,
      lessonTitle,
      originalFilename,
      extractedText,
      count = 4,
      difficulty = 'medium',
      difficultyMix = null,
      apiKey
    } = req.body;

    const safeSourceId = requireUuid(sourceId, 'sourceId');
    const safeCount = Math.min(10, Math.max(1, Number.parseInt(count, 10) || 4));
    const requestedMix = difficulty === 'adaptive' && !difficultyMix
      ? buildInitialBalancedMix(safeCount)
      : difficultyMix;
    const effectiveMix = normalizeDifficultyMix(
      requestedMix,
      safeCount,
      difficulty === 'adaptive' ? 'medium' : difficulty
    );
    const generation = await generateQuestionsForSource({
      lessonTitle,
      extractedText,
      count: safeCount,
      difficultyMix: effectiveMix,
      apiKey
    });
    const questions = generation.questions;
    const bank = {
      id: crypto.randomUUID(),
      sourceId: safeSourceId,
      lessonTitle: String(lessonTitle || originalFilename || 'Tài liệu PDF').trim(),
      originalFilename: String(originalFilename || 'document.pdf').trim(),
      sourceSha256: sourceHash(extractedText),
      questionCount: questions.length,
      difficultyMix: effectiveMix,
      questions,
      semanticChunkCount: generation.semanticChunkCount,
      semanticTopics: generation.semanticTopics,
      modelName: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      createdAt: new Date().toISOString()
    };
    const savedToDb = await persistQuestionBank(bank);

    return res.json({
      success: true,
      sourceId: bank.sourceId,
      questionBankId: bank.id,
      questionCount: bank.questionCount,
      semanticChunkCount: bank.semanticChunkCount,
      semanticTopics: bank.semanticTopics,
      difficultyMix: bank.difficultyMix,
      savedToDb,
      mode: savedToDb ? 'PostgreSQL Question Bank' : 'Source-scoped Memory Bank'
    });
  } catch (error) {
    console.error('[Question Bank Generation Error]:', error.message);
    return res.status(error.statusCode || 502).json({
      success: false,
      error: error.message,
      code: 'QUESTION_BANK_GENERATION_FAILED'
    });
  }
});

/* ==========================================================================
   3. QUIZ GENERATION & PERSISTENCE ENDPOINT: /api/quiz/generate
   ========================================================================== */
app.post('/api/quiz/generate', async (req, res) => {
  try {
    const {
      sourceId,
      questionBankId,
      extractedText,
      originalFilename,
      lessonTitle,
      count = 4,
      difficulty = 'medium',
      difficultyMix = null,
      apiKey
    } = req.body;
    const safeSourceId = requireUuid(sourceId, 'sourceId');
    const safeCount = Math.min(10, Math.max(1, Number.parseInt(count, 10) || 4));
    const requestedMix = difficulty === 'adaptive' && !difficultyMix
      ? buildInitialBalancedMix(safeCount)
      : difficultyMix;
    const effectiveMix = normalizeDifficultyMix(
      requestedMix,
      safeCount,
      difficulty === 'adaptive' ? 'medium' : difficulty
    );

    let bank = questionBankId
      ? await findQuestionBank(requireUuid(questionBankId, 'questionBankId'), safeSourceId)
      : null;

    if (bank && extractedText && bank.sourceSha256 !== sourceHash(extractedText)) {
      return res.status(409).json({
        success: false,
        code: 'SOURCE_MISMATCH',
        error: 'Question bank không thuộc nội dung PDF hiện tại. Hãy tải lại PDF để tạo bộ câu hỏi mới.'
      });
    }

    let savedToDb = false;
    if (!bank || bank.questionCount !== safeCount || !sameDifficultyMix(bank.difficultyMix, effectiveMix)) {
      const generation = await generateQuestionsForSource({
        lessonTitle,
        extractedText,
        count: safeCount,
        difficultyMix: effectiveMix,
        apiKey
      });
      const questions = generation.questions;
      bank = {
        id: crypto.randomUUID(),
        sourceId: safeSourceId,
        lessonTitle: String(lessonTitle || originalFilename || 'Tài liệu PDF').trim(),
        originalFilename: String(originalFilename || 'document.pdf').trim(),
        sourceSha256: sourceHash(extractedText),
        questionCount: questions.length,
        difficultyMix: effectiveMix,
        questions,
        semanticChunkCount: generation.semanticChunkCount,
        semanticTopics: generation.semanticTopics,
        modelName: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        createdAt: new Date().toISOString()
      };
      savedToDb = await persistQuestionBank(bank);
    }

    fallbackStore.quizzes.unshift({
      title: bank.lessonTitle,
      sourceId: bank.sourceId,
      questionBankId: bank.id,
      quiz: bank.questions
    });
    return res.json({
      success: true,
      mode: 'AI Question Bank',
      sourceId: bank.sourceId,
      questionBankId: bank.id,
      savedToDb,
      difficultyMix: bank.difficultyMix,
      quiz: bank.questions
    });
  } catch (error) {
    console.error('[Quiz Generation Error]:', error.message);
    return res.status(error.statusCode || 502).json({
      success: false,
      code: 'QUIZ_GENERATION_FAILED',
      error: error.message
    });
  }
});

/* ==========================================================================
   4. AI TUTOR CHAT ENDPOINT: /api/tutor/chat
   ========================================================================== */
app.post('/api/tutor/chat', async (req, res) => {
  const { query, lessonText, lessonTitle, apiKey } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Nội dung câu hỏi không được để trống' });
  }

  try {
    if (process.env.GEMINI_API_KEY || apiKey) {
      const systemInstruction = `Bạn là Trợ lý AI Tutor & Đọc hiểu tài liệu thông minh trên nền tảng VLearn.
Nhiệm vụ của bạn là đọc hiểu và giải đáp chính xác, trực tiếp mọi thắc mắc của học viên dựa trên nội dung tài liệu được cung cấp (Tên tài liệu: "${lessonTitle || 'Tài liệu hiện tại'}").

NGUYÊN TẮC PHẢN HỒI BẮT BUỘC:
1. Đọc kĩ toàn bộ nội dung tài liệu được cung cấp (bất kể là bài giảng, slide, hồ sơ CV, transcript hay tài liệu kỹ thuật).
2. Trả lời chi tiết, chính xác thông tin được hỏi và LUÔN kèm theo trích dẫn số trang [Trang N] từ tài liệu.
3. Khi học viên hỏi tóm tắt hoặc tổng quan (như "tóm tắt tài liệu", "người này có kinh nghiệm gì", "tôi cần ôn gì", "nội dung chính là gì"): Hãy tóm tắt 3-4 điểm nổi bật nhất từ tài liệu kèm trích dẫn [Trang N].
4. Chỉ khi học viên hỏi chủ đề hoàn toàn KHÔNG CÓ TRONG TÀI LIỆU (ví dụ hỏi thời tiết, lịch sử thế giới không liên quan): Mới trả lời lịch sự: "Thông tin này không có trong tài liệu ${lessonTitle || 'hiện tại'}. Bạn có muốn nối máy tới Trợ giảng / Admin không?"`;

      const prompt = `Tên tài liệu: ${lessonTitle || 'Tài liệu VLearn'}
Nội dung tài liệu PDF:
"""
${(lessonText || '').substring(0, 10000)}
"""

Câu hỏi của học viên: "${query}"`;

      const aiReply = await callGeminiApi(prompt, systemInstruction, apiKey);
      return res.json({ success: true, reply: aiReply, grounded: true });
    }
  } catch (err) {
    console.warn('[AI Tutor Fallback Triggered]:', err.message);
  }

  const fallbackReply = generateFallbackChatReply(query, lessonTitle, lessonText);
  return res.json({ success: true, reply: fallbackReply, grounded: false });
});

function parseJsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapAttemptRow(row) {
  return {
    id: row.id,
    date: new Date(row.date || row.created_at).toLocaleString('vi-VN'),
    learnerKey: row.learnerKey || row.learner_key,
    learnerName: row.learnerName || row.learner_name,
    lessonTitle: row.lessonTitle || row.lesson_title,
    difficulty: row.difficulty,
    correctCount: Number(row.correctCount ?? row.correct_count ?? 0),
    totalCount: Number(row.totalCount ?? row.total_count ?? 0),
    scorePct: Number(row.scorePct ?? row.score_pct ?? 0),
    missedTopics: parseJsonValue(row.missedTopics ?? row.missed_topics, []),
    improvementSuggestions: parseJsonValue(
      row.improvementSuggestions ?? row.improvement_suggestions,
      {}
    ),
    adaptiveAnalysis: parseJsonValue(row.adaptiveAnalysis ?? row.adaptive_analysis, {}),
    analysisMode: row.analysisMode || row.analysis_mode || 'Rule-based Fallback'
  };
}

function buildDynamicGapAnalytics(historyList) {
  const topicStats = new Map();
  historyList.forEach(attempt => {
    const uniqueTopics = new Set(
      (Array.isArray(attempt.missedTopics) ? attempt.missedTopics : [])
        .map(topic => String(topic || '').trim())
        .filter(Boolean)
    );
    uniqueTopics.forEach(topic => {
      const current = topicStats.get(topic) || { missed: 0 };
      current.missed += 1;
      topicStats.set(topic, current);
    });
  });

  return [...topicStats.entries()]
    .map(([topic, stat]) => ({
      id: topic,
      name: topic,
      desc: `Chủ đề do AI xác định từ câu trả lời chưa đúng`,
      count: stat.missed,
      gapPct: historyList.length
        ? Math.min(100, Math.round((stat.missed / historyList.length) * 100))
        : 0,
      isHigh: historyList.length > 0 && stat.missed / historyList.length > 0.3
    }))
    .sort((left, right) => right.gapPct - left.gapPct || left.name.localeCompare(right.name));
}

async function loadAttemptHistory({ learnerKey = null, limit = 500 } = {}) {
  if (!isDbConnected || !dbPool || !isAttemptTableReady) {
    return learnerKey
      ? fallbackStore.attempts.filter(attempt => attempt.learnerKey === learnerKey).slice(0, limit)
      : fallbackStore.attempts.slice(0, limit);
  }

  const params = [];
  let whereClause = '';
  if (learnerKey) {
    params.push(learnerKey);
    whereClause = `WHERE learner_key = $${params.length}`;
  }
  params.push(limit);
  const result = await dbPool.query(
    `SELECT id, question_bank_id, learner_key, learner_name, lesson_title,
            difficulty, correct_count, total_count, score_pct, missed_topics,
            improvement_suggestions, adaptive_analysis, analysis_mode,
            created_at AS date
       FROM vlearn.quiz_attempts
       ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows.map(mapAttemptRow);
}

/* ==========================================================================
   5. QUIZ SUBMISSION & ATTEMPT PERSISTENCE: /api/quiz/submit
   ========================================================================== */
app.post('/api/quiz/submit', async (req, res) => {
  const {
    answers = {},
    activeQuiz = [],
    lessonTitle = 'Bài học VLearn',
    difficulty = 'Trung bình',
    history = [],
    learnerKey,
    learnerName = 'Học viên',
    questionBankId = null,
    apiKey
  } = req.body;

  const total = activeQuiz.length;
  if (total === 0) {
    return res.status(400).json({ success: false, error: 'Bài quiz không có câu hỏi.' });
  }

  let safeLearnerKey;
  let safeQuestionBankId = null;
  try {
    safeLearnerKey = requireUuid(learnerKey, 'learnerKey');
    safeQuestionBankId = questionBankId
      ? requireUuid(questionBankId, 'questionBankId')
      : null;
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }

  let correctCount = 0;
  const missedTopics = [];

  const evaluatedQuestions = activeQuiz.map(q => {
    const userAns = answers[q.id];
    let isCorrect = false;

    if (q.type === 'single') {
      isCorrect = userAns === q.correctAnswer;
    } else {
      const userText = (userAns || '').toString().toLowerCase();
      isCorrect = q.keywords ? q.keywords.some(kw => userText.includes(kw)) : userText.length > 5;
    }

    if (isCorrect) {
      correctCount++;
    } else {
      missedTopics.push(q.topicTag || 'general');
    }

    return {
      id: q.id,
      question: q.question,
      difficulty: q.difficulty || difficulty,
      topicTag: q.topicTag || 'general',
      citation: q.citation || '',
      isCorrect,
      explanationCorrect: q.explanationCorrect || q.explanation || '',
      explanationIncorrect: q.explanationIncorrect || ''
    };
  });

  const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const attemptId = crypto.randomUUID();

  const attemptRecord = {
    id: attemptId,
    date: new Date().toLocaleString("vi-VN"),
    learnerKey: safeLearnerKey,
    learnerName: String(learnerName || 'Học viên').trim().slice(0, 120),
    lessonTitle: lessonTitle,
    difficulty: difficulty,
    correctCount: correctCount,
    totalCount: total,
    scorePct: scorePct,
    missedTopics: missedTopics
  };

  const analysisHistory = [attemptRecord, ...(Array.isArray(history) ? history : [])].slice(0, 10);
  let adaptiveAnalysis = null;
  let analysisMode = 'Rule-based Fallback';

  try {
    if (process.env.GEMINI_API_KEY || apiKey) {
      const analysisSystemInstruction = `Bạn là chuyên gia học tập thích ứng của VLearn.
Hãy phân tích lịch sử làm quiz và kết quả chi tiết của lượt mới nhất.
Không gắn nhãn tiêu cực cho học viên. Chỉ kết luận trong phạm vi dữ liệu được cung cấp.
Phải trả về JSON duy nhất, không markdown. nextMix phải có ba khóa easy/medium/hard và tổng đúng bằng số câu của bài tiếp theo.`;

      const analysisPrompt = `Bài học: ${lessonTitle}
Số câu bài tiếp theo: ${total}

LỊCH SỬ GẦN ĐÂY:
${JSON.stringify(analysisHistory, null, 2)}

KẾT QUẢ TỪNG CÂU LƯỢT MỚI NHẤT:
${JSON.stringify(evaluatedQuestions, null, 2)}

Hãy:
1. Xác định tối đa 3 weakTopics dựa trên câu sai và lịch sử.
2. Viết summary 3-5 câu, nêu điểm mạnh, điểm cần cải thiện và mức độ chắc chắn.
3. Xác định performanceTrend: "improving", "declining", "stable" hoặc "insufficient_data".
4. Đề xuất nextMix. Điểm cao/xu hướng tăng thì tăng hard; điểm thấp hoặc giảm thì tăng easy; còn lại ưu tiên medium.
5. Viết reasoning 2-4 câu giải thích rõ vì sao tăng/giảm từng mức.

Schema:
{
  "weakTopics": [string],
  "summary": string,
  "performanceTrend": "improving" | "declining" | "stable" | "insufficient_data",
  "reasoning": string,
  "nextMix": { "easy": number, "medium": number, "hard": number }
}`;

      const analysisResponse = await callGeminiApi(
        analysisPrompt,
        analysisSystemInstruction,
        apiKey
      );
      adaptiveAnalysis = JSON.parse(cleanGeminiJson(analysisResponse));
      adaptiveAnalysis.nextMix = normalizeDifficultyMix(
        adaptiveAnalysis.nextMix,
        total,
        'medium'
      );
      analysisMode = 'AI Generated';
    }
  } catch (analysisErr) {
    console.warn('[AI Adaptive Analysis Fallback Triggered]:', analysisErr.message);
  }

  if (!adaptiveAnalysis) {
    adaptiveAnalysis = buildFallbackAdaptiveAnalysis(analysisHistory, total);
  }

  const improvementSuggestions = {
    weakTopics: Array.isArray(adaptiveAnalysis.weakTopics)
      ? adaptiveAnalysis.weakTopics
      : missedTopics,
    summary: String(adaptiveAnalysis.summary || ''),
    reasoning: String(adaptiveAnalysis.reasoning || '')
  };
  attemptRecord.improvementSuggestions = improvementSuggestions;
  attemptRecord.adaptiveAnalysis = adaptiveAnalysis;
  attemptRecord.analysisMode = analysisMode;

  let savedToDb = false;
  if (isDbConnected && dbPool && isAttemptTableReady) {
    try {
      await dbPool.query(
        `INSERT INTO vlearn.quiz_attempts
          (id, question_bank_id, learner_key, learner_name, lesson_title,
           difficulty, correct_count, total_count, score_pct, missed_topics,
           improvement_suggestions, adaptive_analysis, analysis_mode)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13)`,
        [
          attemptId,
          safeQuestionBankId,
          safeLearnerKey,
          attemptRecord.learnerName,
          lessonTitle,
          difficulty,
          correctCount,
          total,
          scorePct,
          JSON.stringify(missedTopics),
          JSON.stringify(improvementSuggestions),
          JSON.stringify(adaptiveAnalysis),
          analysisMode
        ]
      );
      savedToDb = true;
    } catch (dbErr) {
      console.error('[DB Insert Attempt Error]:', dbErr.message);
    }
  }

  fallbackStore.attempts.unshift(attemptRecord);

  return res.json({
    success: true,
    attempt: attemptRecord,
    evaluatedQuestions,
    analysis: adaptiveAnalysis,
    analysisMode,
    improvementSuggestions,
    savedToDb
  });
});

/* ==========================================================================
   6. KNOWLEDGE GAP ANALYTICS ENDPOINT: /api/analytics/gaps
   ========================================================================== */
app.get('/api/analytics/gaps', async (req, res) => {
  try {
    const learnerKey = req.query.learnerKey
      ? requireUuid(req.query.learnerKey, 'learnerKey')
      : null;
    const historyList = await loadAttemptHistory({ learnerKey, limit: 50 });
    return res.json({
      success: true,
      history: historyList,
      gapAnalytics: buildDynamicGapAnalytics(historyList)
    });
  } catch (error) {
    console.error('[Analytics Gaps Error]:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/admin/overview', async (req, res) => {
  try {
    const attempts = await loadAttemptHistory({ limit: 1000 });
    const learnerScores = new Map();
    attempts.forEach(attempt => {
      const current = learnerScores.get(attempt.learnerKey) || { total: 0, count: 0 };
      current.total += attempt.scorePct;
      current.count += 1;
      learnerScores.set(attempt.learnerKey, current);
    });
    const atRiskStudentsCount = [...learnerScores.values()]
      .filter(score => score.count > 0 && score.total / score.count < 75)
      .length;
    const generatedQuizCount = isDbConnected && dbPool && isQuestionBankTableReady
      ? Number((await dbPool.query(`SELECT COUNT(*)::int AS count FROM vlearn.pdf_question_banks`)).rows[0].count)
      : fallbackStore.quizzes.length;

    return res.json({
      success: true,
      overview: {
        totalStudents: learnerScores.size,
        totalQuizzesGenerated: generatedQuizCount,
        classAverageScore: attempts.length
          ? Math.round((attempts.reduce((sum, attempt) => sum + attempt.scorePct, 0) / attempts.length) * 10) / 10
          : 0,
        atRiskStudentsCount,
        topicGapDistribution: buildDynamicGapAnalytics(attempts)
      }
    });
  } catch (error) {
    console.error('[Admin Overview Error]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/students', async (req, res) => {
  try {
    const attempts = await loadAttemptHistory({ limit: 1000 });
    const learners = new Map();
    attempts.forEach(attempt => {
      const learner = learners.get(attempt.learnerKey) || {
        id: attempt.learnerKey,
        name: attempt.learnerName || `Học viên ${attempt.learnerKey.slice(0, 8)}`,
        class: 'K3',
        lastActive: attempt.date,
        attempts: 0,
        totalScore: 0,
        topicCounts: new Map(),
        improvementSuggestion: ''
      };
      learner.attempts += 1;
      learner.totalScore += attempt.scorePct;
      (attempt.missedTopics || []).forEach(topic => {
        learner.topicCounts.set(topic, (learner.topicCounts.get(topic) || 0) + 1);
      });
      if (!learner.improvementSuggestion) {
        learner.improvementSuggestion =
          attempt.improvementSuggestions?.summary ||
          attempt.improvementSuggestions?.reasoning ||
          '';
      }
      learners.set(attempt.learnerKey, learner);
    });

    const students = [...learners.values()].map(learner => {
      const avgScore = Math.round((learner.totalScore / learner.attempts) * 10) / 10;
      const riskTopic = [...learner.topicCounts.entries()]
        .sort((left, right) => right[1] - left[1])[0]?.[0] || 'Chưa ghi nhận';
      return {
        id: learner.id,
        name: learner.name,
        class: learner.class,
        lastActive: learner.lastActive,
        attempts: learner.attempts,
        avgScore,
        riskTopic,
        improvementSuggestion: learner.improvementSuggestion,
        riskStatus: avgScore < 50 ? 'danger' : avgScore < 75 ? 'warning' : 'safe'
      };
    }).sort((left, right) => left.avgScore - right.avgScore);

    return res.json({ success: true, students });
  } catch (error) {
    console.error('[Admin Students Error]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/* ==========================================================================
   7. ADMIN GUARDRAILS & SYSTEM PROMPT CONFIG PERSISTENCE
   ========================================================================== */
app.post('/api/admin/guardrails', async (req, res) => {
  const { systemPrompt, temperature, strictGrounding, refuseOutOfScope, automationLevel, hallucinationGuardFilterPct } = req.body;

  if (isDbConnected && dbPool) {
    try {
      await dbPool.query(
        `INSERT INTO vlearn.prompt_templates (prompt_type, name, version, system_prompt, default_config, is_active)
         VALUES ('question_generation', 'VLearn Active Recall Prompt', 1, $1, $2, true)
         ON CONFLICT (coalesce(classroom_id, 0), prompt_type, version) 
         DO UPDATE SET system_prompt = $1, default_config = $2`,
        [systemPrompt || fallbackStore.guardrails.systemPrompt, JSON.stringify({ temperature, strictGrounding, refuseOutOfScope, automationLevel, hallucinationGuardFilterPct })]
      );
      return res.json({ success: true, savedToDb: true });
    } catch (dbErr) {
      console.error('[DB Guardrails Save Error]:', dbErr.message);
    }
  }

  fallbackStore.guardrails = {
    systemPrompt: systemPrompt || fallbackStore.guardrails.systemPrompt,
    temperature,
    strictGrounding,
    refuseOutOfScope,
    automationLevel,
    hallucinationGuardFilterPct
  };

  return res.json({ success: true, savedToDb: false, mode: 'In-Memory Fallback' });
});

/* ==========================================================================
   FALLBACK HELPER GENERATORS
   ========================================================================== */
function generateFallbackChatReply(query, lessonTitle, lessonText = '') {
  const qLower = String(query || '').toLowerCase().trim();
  const text = String(lessonText || '').trim();
  const title = String(lessonTitle || 'Tài liệu PDF').trim();

  // 1. Greetings
  if (qLower === "chào bạn" || qLower === "hi" || qLower === "hello" || qLower.includes("bạn là ai") || qLower.includes("xin chào")) {
    return `Chào bạn! Mình là Trợ lý AI Tutor trên VLearn. Mình sẵn sàng giải đáp thắc mắc, tóm tắt và hỗ trợ bạn học tập theo tài liệu <strong>"${title}"</strong>.`;
  }

  // 2. Out-of-Scope Questions
  const outOfScopeKeywords = ["đẹp trai", "đẹp gái", "xinh không", "mấy giờ", "thời tiết", "ăn gì", "kể chuyện", "yêu", "tuổi bao nhiêu", "ai tạo ra bạn"];
  if (outOfScopeKeywords.some(kw => qLower.includes(kw))) {
    return `Nội dung này không có thông tin trong tài liệu <strong>"${title}"</strong>.<br>Bạn có muốn nối máy tới Trợ giảng (TA) hoặc Quản trị viên không?`;
  }

  // 3. Keyword match in PDF text
  if (text.length > 40) {
    const lines = text
      .split('\n')
      .map(line => line.replace(/\[Trang\s+\d+\]/gi, '').trim())
      .filter(line => line.length > 15 && !line.startsWith('#'));

    const keywords = qLower.split(/\s+/).filter(w => w.length > 2);
    const matchedLines = lines.filter(line => {
      const lLower = line.toLowerCase();
      return keywords.some(kw => lLower.includes(kw));
    });

    if (matchedLines.length > 0) {
      const topSnippets = matchedLines.slice(0, 3).map(l => `• ${l}`).join('<br>');
      return `Dựa vào tài liệu <strong>"${title}"</strong>:<br>${topSnippets}`;
    }
  }

  return `Thông tin về "<em>${query}</em>" không có trong tài liệu <strong>"${title}"</strong>.<br>Bạn có muốn nối máy tới Trợ giảng (TA) hoặc Quản trị viên không?`;
}

// Start Express Server
app.listen(PORT, () => {
  console.log(`================================────────────────────`);
  console.log(`🚀 VLearn AI Quiz Agent Backend Server running on port ${PORT}`);
  console.log(`🔗 REST API Base URL: http://localhost:${PORT}/api`);
  console.log(`================================────────────────────`);
});
