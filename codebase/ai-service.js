/**
 * ai-service.js — "Cái tool" AI của VLearn Active Recall Quiz
 * Chỉ file này được phép gọi thẳng ra Gemini API. FE (app.js) không tự ý
 * implement logic AI — chỉ gọi vào các hàm public dưới đây:
 *   - generateQuestionBank()     : sinh kho câu hỏi từ slide (AI thật)
 *   - analyzeQuizResult()        : phân tích lỗ hổng + đề xuất mix độ khó (AI thật)
 *   - parseQuizRequestFromChat() : hiểu yêu cầu tự nhiên từ khung chat (AI thật)
 *   - evenSplit() / assembleQuiz(): chọn câu hỏi cụ thể từ kho theo mix (thuần logic, KHÔNG gọi AI)
 * Mọi lời gọi AI (thành công lẫn lỗi) đều được ghi vào VLEARN_AI_CALL_LOG
 * (localStorage) làm bằng chứng "AI call thật" cho R5.
 */

const VLearnAI = (() => {
  const LOG_KEY = "VLEARN_AI_CALL_LOG";
  const KEY_STORAGE = "VLEARN_GEMINI_KEY";
  const MODEL_STORAGE = "VLEARN_GEMINI_MODEL";
  const DEFAULT_MODEL = "gemini-flash-lite-latest";

  function getApiKey() {
    return localStorage.getItem(KEY_STORAGE) || "";
  }

  function getModel() {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
  }

  function loadLog() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLog(log) {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 50)));
  }

  function appendLog(entry) {
    const log = loadLog();
    log.unshift(entry);
    saveLog(log);
    return log;
  }

  function updateLastLog(id, patch) {
    const log = loadLog();
    const idx = log.findIndex((e) => e.id === id);
    if (idx !== -1) {
      log[idx] = { ...log[idx], ...patch };
      saveLog(log);
    }
    return log;
  }

  /**
   * Lời gọi Gemini thật duy nhất trong toàn bộ ứng dụng, ép model trả JSON.
   * Không có key -> ném lỗi rõ ràng (không im lặng bịa kết quả).
   */
  async function callGemini(purpose, prompt) {
    const apiKey = getApiKey();
    if (!apiKey) {
      const err = new Error("MISSING_API_KEY");
      err.code = "MISSING_API_KEY";
      throw err;
    }

    const model = getModel();
    const id = `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();

    appendLog({
      id,
      purpose,
      model,
      promptPreview: prompt.slice(0, 400),
      startedAt: new Date(startedAt).toISOString(),
      status: "pending",
    });

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        const blockReason = data?.promptFeedback?.blockReason;
        throw new Error(
          blockReason
            ? `Gemini từ chối trả lời (${blockReason})`
            : "Gemini không trả về nội dung."
        );
      }

      const parsed = JSON.parse(rawText);

      updateLastLog(id, {
        status: "success",
        latencyMs: Date.now() - startedAt,
        responsePreview: rawText.slice(0, 800),
      });

      return parsed;
    } catch (err) {
      updateLastLog(id, {
        status: "error",
        latencyMs: Date.now() - startedAt,
        error: String(err.message || err),
      });
      throw err;
    }
  }

  function buildQuestionBankPrompt(lessonTitle, sourceText, perDifficulty) {
    return `Bạn là hệ thống sinh câu hỏi ôn tập Active Recall cho nền tảng học online VLearn.

BÀI HỌC: "${lessonTitle}"

NỘI DUNG TÀI LIỆU (đã trích từ PDF/slide/transcript, có đánh dấu vị trí dạng nhãn trong ngoặc vuông, ví dụ [Trang N] hoặc [Txx-NNN]):
"""
${sourceText.slice(0, 12000)}
"""

YÊU CẦU BẮT BUỘC:
1. Chỉ sinh câu hỏi dựa TRÊN NỘI DUNG TÀI LIỆU ở trên. Tuyệt đối không dùng kiến thức ngoài tài liệu, không bịa.
2. Sinh đúng 3 mức độ khó: "easy", "medium", "hard" — mỗi mức tối đa ${perDifficulty} câu.
3. Mỗi câu là trắc nghiệm 4 lựa chọn, đúng 1 đáp án đúng.
4. Mỗi câu PHẢI có "citation": lấy đúng nhãn trong ngoặc vuông gần nhất trong tài liệu mà câu hỏi dựa vào (ví dụ "Trang 3" hoặc "T01-005").
5. Mỗi câu có "explanationCorrect" (vì sao đáp án đúng, bám tài liệu) và "explanationIncorrect" (ngộ nhận phổ biến khiến học viên chọn sai).
6. Nếu tài liệu không đủ căn cứ để sinh đủ ${perDifficulty} câu cho một mức, hãy sinh ÍT HƠN và liệt kê vào "skippedTopics" kèm lý do — KHÔNG được bịa câu hỏi cho đủ số lượng.

Trả về DUY NHẤT một JSON đúng schema sau, không kèm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "questions": [
    {
      "difficulty": "easy" | "medium" | "hard",
      "question": string,
      "options": [string, string, string, string],
      "correctIndex": number,
      "explanationCorrect": string,
      "explanationIncorrect": string,
      "citation": string
    }
  ],
  "skippedTopics": [
    { "difficulty": "easy" | "medium" | "hard", "reason": string }
  ]
}`;
  }

  function buildAnalysisPrompt(lessonTitle, gradedQuestions) {
    const lines = gradedQuestions
      .map(
        (q, idx) =>
          `Câu ${idx + 1} [${q.difficulty}] (${q.citation || "?"}): "${q.question}" — Học viên trả lời: ${q.isCorrect ? "ĐÚNG" : "SAI"}`
      )
      .join("\n");

    return `Bạn là trợ lý phân tích kết quả Active Recall Quiz cho bài học "${lessonTitle}" trên nền tảng VLearn.

KẾT QUẢ BÀI LÀM:
${lines}

YÊU CẦU:
1. "weakTopics": tối đa 3 chủ đề/khái niệm học viên còn yếu, CHỈ dựa trên các câu SAI ở trên — không suy diễn ra ngoài phạm vi các câu đã hỏi.
2. "summary": 2-3 câu tiếng Việt. Nếu số câu ít (dưới 6 câu) hoặc đây là dữ liệu ít ỏi, dùng giọng thận trọng ("bước đầu cho thấy...", "chưa đủ để kết luận chắc chắn..."), không quy kết học viên "mất gốc" hay "yếu toàn diện" chỉ từ vài câu sai.
3. "nextMix": đề xuất số câu dễ/vừa/khó cho LẦN QUIZ TIẾP THEO, tổng đúng bằng ${gradedQuestions.length}. Quy tắc: tỉ lệ đúng ≥ 80% → tăng tỉ trọng câu khó; tỉ lệ đúng < 50% → tăng tỉ trọng câu dễ; ở giữa → giữ cân bằng, nghiêng nhẹ theo xu hướng.

Trả về DUY NHẤT JSON đúng schema, không kèm chữ nào khác, không dùng markdown code fence:
{
  "weakTopics": [string],
  "summary": string,
  "nextMix": { "easy": number, "medium": number, "hard": number }
}`;
  }

  function buildChatIntentPrompt(message, availableLessons) {
    const lessonListText = availableLessons.length
      ? availableLessons
          .map((l, i) => `${i + 1}. lessonId="${l.lessonId}" — "${l.lessonTitle}"`)
          .join("\n")
      : "(Kho câu hỏi hiện đang trống — chưa có bài học nào được đăng.)";

    return `Bạn là bộ phân tích ý định cho khung chat của VLearn. Học viên vừa nhắn:
"""
${message}
"""

DANH SÁCH BÀI HỌC ĐANG CÓ TRONG KHO CÂU HỎI (chỉ được chọn lessonId trong danh sách này, TUYỆT ĐỐI không được bịa ra bài học không có trong danh sách):
${lessonListText}

YÊU CẦU:
1. "isQuizRequest": tin nhắn có phải là yêu cầu làm bài kiểm tra/ôn tập hay không.
2. Nếu có, "lessonId": khớp với MỘT lessonId trong danh sách trên (dựa vào tên bài học được nhắc tới, có thể gần đúng/viết tắt). Nếu không xác định được bài nào, hoặc danh sách đang trống, để null.
3. "requestedCount": số câu học viên muốn, nếu tin nhắn không nhắc tới số câu thì để null (KHÔNG tự bịa một con số).
4. Nếu thông tin chưa đủ để bắt đầu bài (không rõ bài học nào, hoặc kho đang trống, hoặc không khớp bài nào trong danh sách) — đặt "needsClarification": true và viết "clarifyingQuestion" bằng tiếng Việt, hỏi lại đúng 1 câu ngắn gọn để làm rõ. KHÔNG được tự đoán bừa một bài học không chắc chắn.

Trả về DUY NHẤT một JSON đúng schema sau, không kèm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "isQuizRequest": boolean,
  "lessonId": string | null,
  "requestedCount": number | null,
  "needsClarification": boolean,
  "clarifyingQuestion": string | null
}`;
  }

  /**
   * Lời gọi AI thật #1: giảng viên upload slide -> sinh kho câu hỏi.
   */
  async function generateQuestionBank(lessonTitle, sourceText, perDifficulty = 4) {
    const prompt = buildQuestionBankPrompt(lessonTitle, sourceText, perDifficulty);
    const result = await callGemini("generate_question_bank", prompt);
    return {
      questions: Array.isArray(result.questions) ? result.questions : [],
      skippedTopics: Array.isArray(result.skippedTopics) ? result.skippedTopics : [],
    };
  }

  /**
   * Lời gọi AI thật #2: học viên nộp quiz -> phân tích lỗ hổng + đề xuất mix độ khó lần sau.
   */
  async function analyzeQuizResult(lessonTitle, gradedQuestions) {
    const prompt = buildAnalysisPrompt(lessonTitle, gradedQuestions);
    const result = await callGemini("analyze_quiz_result", prompt);
    return {
      weakTopics: Array.isArray(result.weakTopics) ? result.weakTopics : [],
      summary: result.summary || "",
      nextMix: result.nextMix || null,
    };
  }

  /**
   * Lời gọi AI thật #3: học viên gõ yêu cầu tự nhiên trong khung chat
   * ("cho tôi ôn bài 2, 9 câu") -> nhận diện ý định + bài học + số câu.
   * Chỉ được khớp với lessonId có thật trong availableLessons — không bịa.
   */
  async function parseQuizRequestFromChat(message, availableLessons = []) {
    const prompt = buildChatIntentPrompt(message, availableLessons);
    const result = await callGemini("parse_quiz_chat_request", prompt);
    return {
      isQuizRequest: Boolean(result.isQuizRequest),
      lessonId: result.lessonId || null,
      requestedCount: Number.isFinite(result.requestedCount) ? result.requestedCount : null,
      needsClarification: Boolean(result.needsClarification),
      clarifyingQuestion: result.clarifyingQuestion || null,
    };
  }

  /**
   * Chia đều số câu cho 3 mức độ (dùng cho lần làm bài đầu tiên của một bài học).
   * Thuần logic, KHÔNG gọi AI — chỉ là toán chia đều + xử lý số dư.
   */
  function evenSplit(count) {
    const base = Math.floor(count / 3);
    const remainder = count - base * 3;
    const mix = { easy: base, medium: base, hard: base };
    const order = ["medium", "hard", "easy"];
    for (let i = 0; i < remainder; i++) mix[order[i]]++;
    return mix;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Chọn ra danh sách câu hỏi cụ thể từ kho theo tỉ lệ mix (đề xuất bởi
   * analyzeQuizResult hoặc evenSplit cho lần đầu). Thuần logic, KHÔNG gọi AI
   * — đây là random-sample theo số lượng, không cần LLM suy luận.
   * Trả về { questions, shortfall } — shortfall báo mức nào kho không đủ câu.
   */
  function assembleQuiz(bankQuestions, mix) {
    const byDifficulty = { easy: [], medium: [], hard: [] };
    (bankQuestions || []).forEach((q) => {
      if (byDifficulty[q.difficulty]) byDifficulty[q.difficulty].push(q);
    });

    const questions = [];
    const shortfall = {};

    ["easy", "medium", "hard"].forEach((level) => {
      const want = (mix && mix[level]) || 0;
      const picked = shuffle(byDifficulty[level]).slice(0, want);
      questions.push(...picked);
      if (picked.length < want) {
        shortfall[level] = want - picked.length;
      }
    });

    return { questions, shortfall };
  }

  function getCallLog() {
    return loadLog();
  }

  function exportCallLog() {
    const blob = new Blob([JSON.stringify(loadLog(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai_call_log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setApiKey(key) {
    localStorage.setItem(KEY_STORAGE, key || "");
  }

  function setModel(model) {
    localStorage.setItem(MODEL_STORAGE, model || DEFAULT_MODEL);
  }

  return {
    generateQuestionBank,
    analyzeQuizResult,
    parseQuizRequestFromChat,
    evenSplit,
    assembleQuiz,
    getCallLog,
    exportCallLog,
    getApiKey,
    setApiKey,
    getModel,
    setModel,
    DEFAULT_MODEL,
  };
})();

window.VLearnAI = VLearnAI;
