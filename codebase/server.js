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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// PostgreSQL Connection Pool Setup
let dbPool = null;
let isDbConnected = false;

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

    dbPool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('[Database Connection Error]:', err.message);
        isDbConnected = false;
      } else {
        console.log('[Database] Kết nối thành công tới PostgreSQL tại:', res.rows[0].now);
        isDbConnected = true;
      }
    });
  } catch (err) {
    console.error('[Database Setup Exception]:', err.message);
    isDbConnected = false;
  }
}

initDatabaseConnection();

// Fallback In-Memory Stores when DB connection string is pending
const fallbackStore = {
  documents: [],
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
   GHI CHÚ KIẾN TRÚC: server.js KHÔNG gọi Gemini trực tiếp.
   Mọi lời gọi AI thật (sinh kho câu hỏi, phân tích kết quả, hiểu ý định chat)
   nằm ở codebase/ai-service.js, chạy trong trình duyệt. server.js chỉ đóng
   vai trò lưu trữ/truy xuất PostgreSQL cho dữ liệu FE đã xử lý xong.
   (Trước đây file này có hàm callGeminiApi() gọi model "gemini-1.5-flash" —
   đã gỡ vì trùng lặp và dùng model không còn khả dụng, gây nhầm lẫn 2 nguồn
   AI khác nhau cho cùng một tính năng.)
   ========================================================================== */

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
      mode: isDbConnected ? 'PostgreSQL Active (vlearn schema)' : 'Fallback LocalStorage/Memory'
    },
    note: 'Server này không gọi AI — lời gọi AI thật nằm ở codebase/ai-service.js (trình duyệt).'
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

/* ==========================================================================
   3. QUIZ PERSISTENCE ENDPOINT: /api/quiz/generate
   Lưu ý: endpoint này KHÔNG tự sinh câu hỏi bằng AI nữa. FE phải tự gọi
   VLearnAI.generateQuestionBank() (codebase/ai-service.js) ở trình duyệt để
   có bộ câu hỏi thật, rồi gửi kết quả đã sinh xong sang đây chỉ để lưu vào
   PostgreSQL. Nếu FE gửi lên mà không kèm quiz, dùng bộ mô phỏng cục bộ để
   không chặn demo (không phải AI thật — đánh dấu rõ trong "mode").
   ========================================================================== */
app.post('/api/quiz/generate', async (req, res) => {
  const { lessonTitle, count = 4, difficulty = 'medium', quiz: clientGeneratedQuiz } = req.body;

  let quizList = Array.isArray(clientGeneratedQuiz) ? clientGeneratedQuiz : [];
  const isAiGenerated = quizList.length > 0;

  if (quizList.length === 0) {
    quizList = generateSmartFallbackQuiz(lessonTitle, count, difficulty);
  }

  // Save Generated Quiz into PostgreSQL Database
  if (isDbConnected && dbPool) {
    try {
      const quizRes = await dbPool.query(
        `INSERT INTO vlearn.quizzes (title, description, status) VALUES ($1, $2, 'published') RETURNING id`,
        [lessonTitle || 'AI Quiz Active Recall', `Bài test ${count} câu - Độ khó: ${difficulty}`]
      );
      const quizId = quizRes.rows[0].id;

      for (const q of quizList) {
        await dbPool.query(
          `INSERT INTO vlearn.quiz_questions (quiz_id, question_text, question_type, topic_code, options, correct_answer_index, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [quizId, q.question, q.type === 'single' ? 'multiple_choice' : 'short_answer', q.topicTag, JSON.stringify(q.options || []), q.correctAnswer || 0, q.explanation]
        );
      }
    } catch (dbErr) {
      console.error('[DB Insert Quiz Error]:', dbErr.message);
    }
  }

  fallbackStore.quizzes.unshift({ title: lessonTitle, quiz: quizList });
  return res.json({ success: true, mode: isAiGenerated ? 'AI Generated' : 'Smart Fallback', quiz: quizList });
});

/* ==========================================================================
   4. TUTOR CHAT ENDPOINT: /api/tutor/chat
   Lưu ý: endpoint này KHÔNG gọi AI (đã gỡ callGeminiApi trùng lặp). Trả lời
   mở (open-ended Q&A) không nằm trong 3 quyết định AI mà ai-service.js đảm
   nhận (generateQuestionBank / analyzeQuizResult / parseQuizRequestFromChat)
   nên tạm thời chỉ trả lời bằng mẫu cố định, đánh dấu rõ grounded:false để
   FE không hiển thị nhầm như câu trả lời AI có căn cứ thật.
   ========================================================================== */
app.post('/api/tutor/chat', async (req, res) => {
  const { query, lessonTitle } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Nội dung câu hỏi không được để trống' });
  }

  const fallbackReply = generateFallbackChatReply(query, lessonTitle);
  return res.json({ success: true, reply: fallbackReply, grounded: false });
});

/* ==========================================================================
   5. QUIZ SUBMISSION & ATTEMPT PERSISTENCE: /api/quiz/submit
   ========================================================================== */
app.post('/api/quiz/submit', async (req, res) => {
  const { answers = {}, activeQuiz = [], lessonTitle = 'Bài học VLearn', difficulty = 'Trung bình' } = req.body;

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
      isCorrect,
      explanation: q.explanation
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
    evaluatedQuestions
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
function generateSmartFallbackQuiz(lessonTitle, count, difficulty) {
  const topicMap = ["jtbd", "grounding", "automation", "eval"];
  const list = [];

  for (let i = 1; i <= count; i++) {
    const topic = topicMap[(i - 1) % topicMap.length];
    if (i % 2 === 1) {
      list.push({
        id: i,
        type: "single",
        topicTag: topic,
        question: `[${lessonTitle || 'Bài kiểm tra'} - Câu ${i}] Theo khung tư duy AI Product, yếu tố nào quyết định tính minh bạch của mô hình?`,
        options: [
          `A. Bắt buộc có trích dẫn nguồn bài giảng [Trang ${i}] và kiểm soát cost-of-error`,
          `B. Tự động dự đoán khi chưa có tài liệu chứng minh`,
          `C. Bỏ qua kiểm tra grounding và kiểm thử golden set`,
          `D. Tự động thay đổi thang điểm đánh giá bài thi`
        ],
        correctAnswer: 0,
        explanation: `Theo chuẩn VLearn AI Product [Trang ${i}], phương án A đúng vì bài kiểm tra Active Recall bắt buộc phải trích dẫn rõ căn cứ bài giảng.`
      });
    } else {
      list.push({
        id: i,
        type: "short_answer",
        topicTag: topic,
        question: `[Tự luận ngắn - Câu ${i}] Trình bày ngắn gọn lợi ích của việc xác định Cost-of-error trước khi chọn mức độ Automation?`,
        modelAnswer: `Xác định Cost-of-error giúp quyết định chọn giữa Augment (con người kiểm soát khi rủi ro cao) hay Automate (tự động hóa hoàn toàn).`,
        keywords: ["cost-of-error", "augment", "automate", "chi phí", "rủi ro"],
        explanation: `Xem thêm chi tiết lý thuyết tại [Trang ${i}]. Chi phí sai sót cao yêu cầu Human-in-the-loop để tránh thiệt hại.`
      });
    }
  }

  return list;
}

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
