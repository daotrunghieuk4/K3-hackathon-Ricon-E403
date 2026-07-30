/**
 * VLearn AI Quiz Agent — Backend Server with Complete PostgreSQL Database Coverage
 * Scope:
 *  1. Document & Page Text Storage (vlearn.documents, vlearn.document_pages)
 *  2. Quiz & Question Set Persistence (vlearn.quizzes, vlearn.quiz_questions, vlearn.questions)
 *  3. Student Attempt & Response Tracking (vlearn.quiz_attempts, vlearn.quiz_responses)
 *  4. Knowledge Gap Analytics (vlearn.student_knowledge_gaps, vlearn.student_topic_performance)
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

// PostgreSQL Connection Pool Setup
let dbPool = null;
let isDbConnected = false;
let isQuestionBankTableReady = false;

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
              to_regclass('vlearn.pdf_question_banks') IS NOT NULL AS question_bank_table_ready`,
      (err, result) => {
      if (err) {
        console.error('[Database Connection Error]:', err.message);
        isDbConnected = false;
        isQuestionBankTableReady = false;
      } else {
        console.log('[Database] Kết nối thành công tới PostgreSQL tại:', result.rows[0].now);
        isDbConnected = true;
        isQuestionBankTableReady = result.rows[0].question_bank_table_ready;
        console.log('[Database] Bảng vlearn.pdf_question_banks:', isQuestionBankTableReady ? 'sẵn sàng' : 'chưa được tạo');
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

// Standard Knowledge Topics Registry
const KNOWLEDGE_TOPICS = [
  { id: "jtbd", name: "JTBD & Lát Cắt Sản Phẩm", desc: "Định hình bài toán: 1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả" },
  { id: "grounding", name: "Grounding & Chống Bịa Nguồn", desc: "Kiểm soát Hallucination, trích dẫn bắt buộc mã trang [Trang N]" },
  { id: "automation", name: "Cost-of-error & Mức Automation", desc: "Lựa chọn giữa Augment, Conditional và Automate theo chi phí lỗi" },
  { id: "eval", name: "Golden Set & Đo Lường Chất Lượng", desc: "Xây dựng 20 cases kiểm thử và định nghĩa Quality Bar" }
];

/* ==========================================================================
   HELPER: GEMINI LLM API REST CALL
   ========================================================================== */
async function callGeminiApi(prompt, systemInstruction = '', apiKeyOverride = '') {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cung cấp.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
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
          if (res.statusCode === 429) {
            reject(new Error('Gemini đã hết quota/rate limit. Question bank mới không được tạo; hệ thống sẽ không dùng câu hỏi cũ thay thế.'));
          } else {
            reject(new Error(`Gemini API Error (${res.statusCode}): ${apiMessage || 'Không có nội dung lỗi'}`));
          }
        }
      });
    });

    req.on('error', (e) => reject(e));
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

function buildQuestionGenerationPrompt({ lessonTitle, extractedText, count, difficultyMix }) {
  return {
    systemInstruction: `Bạn là chuyên gia thiết kế câu hỏi Active Recall cho VLearn.
Mọi câu hỏi phải được tạo CHỈ từ nội dung của đúng tài liệu PDF được cung cấp trong yêu cầu hiện tại.
Không được dùng câu hỏi mẫu, kiến thức từ tài liệu khác hoặc kiến thức ngoài tài liệu.
Nếu tài liệu không đủ căn cứ, hãy báo lỗi thay vì tự bịa.
Giải thích đáp án đúng và sai phải chi tiết, mang tính sư phạm, không mở đầu bằng nguồn.
Nguồn chỉ nằm trong field "citation".
Chỉ trả về một JSON array hợp lệ, không dùng markdown code fence.`,
    prompt: `MÃ NGUỒN CỦA TÀI LIỆU HIỆN TẠI: ${sourceHash(extractedText)}
BÀI GIẢNG: ${lessonTitle || 'Tài liệu PDF mới tải lên'}

NỘI DUNG DUY NHẤT ĐƯỢC PHÉP DÙNG:
"""
${extractedText.substring(0, 15000)}
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
7. topicTag là một nhãn ngắn mô tả đúng chủ đề của câu, không bắt buộc thuộc danh sách cố định.

Schema:
[
  {
    "type": "single",
    "difficulty": "easy",
    "topicTag": "chu-de-ngan",
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

  const { prompt, systemInstruction } = buildQuestionGenerationPrompt({
    lessonTitle,
    extractedText,
    count,
    difficultyMix
  });
  const aiResponse = await callGeminiApi(prompt, systemInstruction, apiKey);
  const parsed = JSON.parse(cleanGeminiJson(aiResponse));
  if (!Array.isArray(parsed) || parsed.length !== count) {
    throw new Error(`Gemini trả ${Array.isArray(parsed) ? parsed.length : 0}/${count} câu; question bank chưa được lưu.`);
  }

  const difficultyPlan = buildDifficultyPlan(difficultyMix);
  return parsed.map((question, index) => {
    const options = Array.isArray(question.options) ? question.options : [];
    const correctAnswer = Number(question.correctAnswer);
    if (!String(question.question || '').trim() || options.length !== 4) {
      throw new Error(`Câu ${index + 1} không đúng cấu trúc 4 lựa chọn.`);
    }
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
      throw new Error(`Câu ${index + 1} có correctAnswer không hợp lệ.`);
    }
    const citation = String(question.citation || '').trim();
    if (!/^\[Trang\s+\d+\]$/i.test(citation) || !extractedText.includes(citation)) {
      throw new Error(`Câu ${index + 1} không có citation [Trang N] hợp lệ.`);
    }
    if (!Array.isArray(question.optionExplanations) || question.optionExplanations.length !== 4) {
      throw new Error(`Câu ${index + 1} không có đủ 4 giải thích lựa chọn.`);
    }
    if (!String(question.explanationCorrect || '').trim() || !String(question.explanationIncorrect || '').trim()) {
      throw new Error(`Câu ${index + 1} thiếu phần giải thích đáp án đúng hoặc sai.`);
    }

    return {
      ...question,
      id: index + 1,
      type: 'single',
      difficulty: difficultyPlan[index],
      topicTag: String(question.topicTag || 'noi-dung-tai-lieu').trim(),
      correctAnswer,
      options,
      explanationCorrect: String(question.explanationCorrect || '').trim(),
      explanationIncorrect: String(question.explanationIncorrect || '').trim(),
      optionExplanations: question.optionExplanations,
      citation
    };
  });
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
    const effectiveMix = normalizeDifficultyMix(
      difficultyMix,
      safeCount,
      difficulty === 'adaptive' ? 'medium' : difficulty
    );
    const questions = await generateQuestionsForSource({
      lessonTitle,
      extractedText,
      count: safeCount,
      difficultyMix: effectiveMix,
      apiKey
    });
    const bank = {
      id: crypto.randomUUID(),
      sourceId: safeSourceId,
      lessonTitle: String(lessonTitle || originalFilename || 'Tài liệu PDF').trim(),
      originalFilename: String(originalFilename || 'document.pdf').trim(),
      sourceSha256: sourceHash(extractedText),
      questionCount: questions.length,
      difficultyMix: effectiveMix,
      questions,
      modelName: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      createdAt: new Date().toISOString()
    };
    const savedToDb = await persistQuestionBank(bank);

    return res.json({
      success: true,
      sourceId: bank.sourceId,
      questionBankId: bank.id,
      questionCount: bank.questionCount,
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
    const effectiveMix = normalizeDifficultyMix(
      difficultyMix,
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
      const questions = await generateQuestionsForSource({
        lessonTitle,
        extractedText,
        count: safeCount,
        difficultyMix: effectiveMix,
        apiKey
      });
      bank = {
        id: crypto.randomUUID(),
        sourceId: safeSourceId,
        lessonTitle: String(lessonTitle || originalFilename || 'Tài liệu PDF').trim(),
        originalFilename: String(originalFilename || 'document.pdf').trim(),
        sourceSha256: sourceHash(extractedText),
        questionCount: questions.length,
        difficultyMix: effectiveMix,
        questions,
        modelName: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
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
      const systemInstruction = `Bạn là Trợ lý AI Tutor trên nền tảng VLearn.
Nhiệm vụ của bạn là trả lời thắc mắc của học viên dựa TRỰC TIẾP vào tài liệu bài giảng được cung cấp.
NGUYÊN TẮC HAX/PAIR BẮT BUỘC:
1. Mọi câu trả lời PHẢI có trích dẫn số trang [Trang N] từ bài giảng.
2. Khi gặp câu hỏi nằm NGOÀI nội dung bài giảng, trả lời rõ ràng: "Nội dung này không nằm trong bài lý thuyết [Tên bài]. Bạn có muốn nối máy tới TA?"
3. Tuyệt đối KHÔNG bịa đặt đáp án khi tài liệu không có thông tin (Grounding Guardrail).
4. Nếu học viên yêu cầu sửa điểm bài quiz hoặc truy cập bài test chính thức -> Trả lời từ chối theo thẩm quyền: "Mình chỉ hỗ trợ giải đáp Active Recall, không có thẩm quyền truy cập hay thay đổi điểm bài test chính thức."`;

      const prompt = `Bài giảng: ${lessonTitle || 'Bài lý thuyết VLearn'}
Nội dung bài giảng PDF:
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

  const fallbackReply = generateFallbackChatReply(query, lessonTitle);
  return res.json({ success: true, reply: fallbackReply, grounded: false });
});

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
    apiKey
  } = req.body;

  const total = activeQuiz.length;
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
  const attemptId = `ATT-${Date.now().toString().slice(-4)}`;

  const attemptRecord = {
    id: attemptId,
    date: new Date().toLocaleString("vi-VN"),
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

  // Record in PostgreSQL Database (quiz_attempts & student_knowledge_gaps)
  if (isDbConnected && dbPool) {
    try {
      // Save Attempt Record
      await dbPool.query(
        `INSERT INTO vlearn.quiz_attempts (score_pct, correct_count, total_count, missed_topics)
         VALUES ($1, $2, $3, $4)`,
        [scorePct, correctCount, total, JSON.stringify(missedTopics)]
      );

      // Save / Update Student Knowledge Gaps
      for (const topicId of missedTopics) {
        await dbPool.query(
          `INSERT INTO vlearn.student_knowledge_gaps (topic_code, gap_count)
           VALUES ($1, 1)
           ON CONFLICT (topic_code) 
           DO UPDATE SET gap_count = vlearn.student_knowledge_gaps.gap_count + 1, updated_at = NOW()`,
          [topicId]
        ).catch(err => console.warn('[DB Gap Update Warning]:', err.message));
      }
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
    analysisMode
  });
});

/* ==========================================================================
   6. KNOWLEDGE GAP ANALYTICS ENDPOINT: /api/analytics/gaps
   ========================================================================== */
app.get('/api/analytics/gaps', async (req, res) => {
  let historyList = fallbackStore.attempts;

  if (isDbConnected && dbPool) {
    try {
      const result = await dbPool.query(
        `SELECT id, created_at AS date, score_pct AS "scorePct", correct_count AS "correctCount", total_count AS "totalCount", missed_topics AS "missedTopics"
         FROM vlearn.quiz_attempts ORDER BY created_at DESC LIMIT 50`
      );
      if (result.rows.length > 0) {
        historyList = result.rows.map(r => ({
          ...r,
          date: new Date(r.date).toLocaleString("vi-VN"),
          lessonTitle: "Bài test Active Recall",
          difficulty: "Trung bình",
          missedTopics: typeof r.missedTopics === 'string' ? JSON.parse(r.missedTopics) : (r.missedTopics || [])
        }));
      }
    } catch (dbErr) {
      console.error('[DB Query Gaps Error]:', dbErr.message);
    }
  }

  // Compute Gap Percentages
  const topicStats = {
    jtbd: { missed: 0, total: 0 },
    grounding: { missed: 0, total: 0 },
    automation: { missed: 0, total: 0 },
    eval: { missed: 0, total: 0 }
  };

  historyList.forEach(att => {
    const missedArr = Array.isArray(att.missedTopics) 
      ? att.missedTopics 
      : (typeof att.missedTopics === 'string' ? JSON.parse(att.missedTopics || '[]') : []);

    missedArr.forEach(tId => {
      if (topicStats[tId]) topicStats[tId].missed += 1;
    });
    Object.keys(topicStats).forEach(key => topicStats[key].total += 1);
  });

  const gapAnalytics = KNOWLEDGE_TOPICS.map(topic => {
    const stat = topicStats[topic.id] || { missed: 0, total: 1 };
    const gapPct = historyList.length > 0 ? Math.min(100, Math.round((stat.missed / historyList.length) * 100)) : 0;
    return {
      ...topic,
      gapPct,
      isHigh: gapPct > 30
    };
  });

  return res.json({
    success: true,
    history: historyList,
    gapAnalytics
  });
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
function generateFallbackChatReply(query, lessonTitle) {
  const qLower = query.toLowerCase();
  if (qLower.includes("lỗ hổng") || qLower.includes("ôn tập") || qLower.includes("kết quả")) {
    return `Theo phân tích lịch sử nộp bài của bạn trên hệ thống VLearn:<br>Bạn nên tập trung xem lại chủ đề <strong>Cost-of-error & Mức Automation [Trang 3-4]</strong> để nâng cao kết quả.`;
  } else if (qLower.includes("jtbd") || qLower.includes("bài toán") || qLower.includes("lát cắt")) {
    return `Dựa vào tài liệu bài lý thuyết <strong>${lessonTitle || 'JTBD Framework'} [Trang 1-2]</strong>:<br>Lát cắt sản phẩm 1 câu là: <em>1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả</em>.`;
  } else if (qLower.includes("điểm") || qLower.includes("sửa") || qLower.includes("thi")) {
    return `Mình chỉ hỗ trợ giải đáp Active Recall, không có thẩm quyền truy cập hay thay đổi điểm bài test chính thức.`;
  } else {
    return `Chào bạn! Cảm ơn câu hỏi về "<em>${query}</em>".<br>Theo dữ liệu bài lý thuyết <strong>[Trang 1-2 PDF]</strong>, bạn có thể kiểm tra trực tiếp đáp án đúng trong phần giải thích bài quiz hoặc mở tab Bản đồ lỗ hổng ở menu bên trái.`;
  }
}

// Start Express Server
app.listen(PORT, () => {
  console.log(`================================────────────────────`);
  console.log(`🚀 VLearn AI Quiz Agent Backend Server running on port ${PORT}`);
  console.log(`🔗 REST API Base URL: http://localhost:${PORT}/api`);
  console.log(`================================────────────────────`);
});
