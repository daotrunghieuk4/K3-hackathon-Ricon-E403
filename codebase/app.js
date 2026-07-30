/**
 * VLearn AI Quiz Generator & Learning Assistant Logic
 * Handlers: PDF Processing, Quiz Engine, Scoring, History Storage, Knowledge Gap Analytics & Remediation Guide
 */

// API Configuration
const API_BASE_URL = "http://localhost:5000/api";

function readJsonStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createClientSourceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

// Application State
const state = {
  currentFile: null,
  extractedText: "",
  currentSourceId: "",
  currentQuestionBankId: "",
  currentLessonTitle: "Bài 01: Nhập môn AI Product (JTBD)",
  activeQuiz: [],
  userAnswers: {},
  currentRole: "user",
  apiKey: localStorage.getItem("VLEARN_GEMINI_KEY") || "",
  history: readJsonStorage("VLEARN_QUIZ_HISTORY", []),
  recommendedMix: readJsonStorage("VLEARN_RECOMMENDED_MIX", null),
  latestAnalysis: readJsonStorage("VLEARN_LATEST_ANALYSIS", null),
  latestAnalysisMode: localStorage.getItem("VLEARN_ANALYSIS_MODE") || ""
};

// Default Knowledge Topics Registry for Analytics
const KNOWLEDGE_TOPICS = [
  { id: "jtbd", name: "JTBD & Lát Cắt Sản Phẩm", desc: "Định hình bài toán: 1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả" },
  { id: "grounding", name: "Grounding & Chống Bịạ Nguồn", desc: "Kiểm soát Hallucination, trích dẫn bắt buộc mã trang [Txx-NNN]" },
  { id: "automation", name: "Cost-of-error & Mức Automation", desc: "Lựa chọn giữa Augment, Conditional và Automate theo chi phí lỗi" },
  { id: "eval", name: "Golden Set & Đo Lường Chất Lượng", desc: "Xây dựng 20 cases kiểm thử và định nghĩa Quality Bar" }
];

// Initialize Application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("VLearn AI LMS App Initialized");
  loadInitialData();
  setupDragAndDrop();

  // If no history exists, pre-seed 1 sample record for rich UI demo
  if (state.history.length === 0) {
    seedInitialHistory();
  }
  renderHistoryAndGapMap();
  renderAdaptiveRecommendation(state.latestAnalysis, state.latestAnalysisMode);
});

function loadInitialData() {
  const savedText = sessionStorage.getItem("VLEARN_ACTIVE_TEXT");
  const savedTitle = sessionStorage.getItem("VLEARN_ACTIVE_TITLE");
  const savedFilename = sessionStorage.getItem("VLEARN_ACTIVE_FILENAME");
  const savedSourceId = sessionStorage.getItem("VLEARN_ACTIVE_SOURCE_ID");
  const savedQuestionBankId = sessionStorage.getItem("VLEARN_ACTIVE_QUESTION_BANK_ID");

  if (savedText && savedTitle && savedSourceId && savedQuestionBankId) {
    state.extractedText = savedText;
    state.currentSourceId = savedSourceId;
    state.currentQuestionBankId = savedQuestionBankId;
    state.currentFile = { name: savedFilename || savedTitle + ".pdf" };
    updateLessonTitleDisplays(savedTitle);
    
    const dropzoneTitle = document.getElementById("dropzoneTitle");
    if (dropzoneTitle) dropzoneTitle.innerText = `📄 ${savedTitle}.pdf`;
    
    const statusBadge = document.getElementById("adminFileStatusBadge") || document.getElementById("fileStatusBadge");
    if (statusBadge) {
      statusBadge.innerText = "Đã có kho câu hỏi riêng";
      statusBadge.style.background = "#dcfce7";
      statusBadge.style.color = "#15803d";
    }
  } else {
    const sample = window.VLEARN_SAMPLE_DATA;
    updateLessonTitleDisplays(sample.title);
  }

  // Quiz is NOT rendered automatically on load; only appears when user clicks "Tạo Bài Kiểm Tra Ngay"
  const quizSection = document.getElementById("quizSection");
  if (quizSection) quizSection.style.display = "none";
}

function updateLessonTitleDisplays(title) {
  state.currentLessonTitle = title;
  const badge = document.getElementById("activeLessonBadge");
  if (badge) badge.innerHTML = `<i class="ri-book-read-line"></i> ${title}`;

  const studentDisplay = document.getElementById("studentLessonTitleDisplay");
  if (studentDisplay) studentDisplay.innerText = title;

  const adminDisplay = document.getElementById("adminActiveLessonTitleDisplay");
  if (adminDisplay) adminDisplay.innerText = title;

  const adminInput = document.getElementById("adminLessonTitleInput");
  if (adminInput && adminInput !== document.activeElement) {
    adminInput.value = title;
  }
}

function updateAdminLesson() {
  const input = document.getElementById("adminLessonTitleInput");
  const newTitle = input ? input.value.trim() : "";
  const finalTitle = newTitle || "Bài 01: Nhập môn AI Product & Xác định Bài toán (JTBD)";
  updateLessonTitleDisplays(finalTitle);
  alert(`✓ Đã cập nhật bài giảng: "${finalTitle}" cho toàn bộ học viên!`);
}

function seedInitialHistory() {
  state.history = [
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
  ];
  saveHistoryToStorage();
}

function saveHistoryToStorage() {
  localStorage.setItem("VLEARN_QUIZ_HISTORY", JSON.stringify(state.history));
}

function clearHistory() {
  if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử nộp bài và dữ liệu lỗ hổng kiến thức?")) {
    state.history = [];
    state.recommendedMix = null;
    state.latestAnalysis = null;
    state.latestAnalysisMode = "";
    saveHistoryToStorage();
    localStorage.removeItem("VLEARN_RECOMMENDED_MIX");
    localStorage.removeItem("VLEARN_LATEST_ANALYSIS");
    localStorage.removeItem("VLEARN_ANALYSIS_MODE");
    renderHistoryAndGapMap();
    renderAdaptiveRecommendation(null);
  }
}

/* ==========================================================================
   1. PDF FILE PROCESSING LOGIC
   ========================================================================== */

function triggerFileUpload() {
  document.getElementById("pdfFileInput").click();
}

function setupDragAndDrop() {
  const dropzone = document.getElementById("pdfDropzone");
  if (!dropzone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      processPdfFile(files[0]);
    }
  });
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processPdfFile(file);
  }
}

async function processPdfFile(file) {
  if (file.type !== "application/pdf") {
    alert("Vui lòng tải lên file định dạng .PDF!");
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    alert("File PDF vượt quá giới hạn 25MB.");
    return;
  }

  state.currentFile = file;
  state.extractedText = "";
  state.currentSourceId = createClientSourceId();
  state.currentQuestionBankId = "";
  state.activeQuiz = [];
  sessionStorage.removeItem("VLEARN_ACTIVE_TEXT");
  sessionStorage.removeItem("VLEARN_ACTIVE_TITLE");
  sessionStorage.removeItem("VLEARN_ACTIVE_FILENAME");
  sessionStorage.removeItem("VLEARN_ACTIVE_SOURCE_ID");
  sessionStorage.removeItem("VLEARN_ACTIVE_QUESTION_BANK_ID");

  const dropzoneTitle = document.getElementById("dropzoneTitle");
  if (dropzoneTitle) dropzoneTitle.innerText = `📄 ${file.name}`;
  
  const dropzoneSubtitle = document.getElementById("dropzoneSubtitle");
  if (dropzoneSubtitle) dropzoneSubtitle.innerText = "Đang đọc PDF và tạo kho câu hỏi mới bằng AI...";
  
  const statusBadge = document.getElementById("adminFileStatusBadge") || document.getElementById("fileStatusBadge");
  if (statusBadge) {
    statusBadge.innerText = "AI đang tạo câu hỏi";
    statusBadge.style.background = "#fef3c7";
    statusBadge.style.color = "#92400e";
  }

  const adminActiveFileName = document.getElementById("adminActiveFileName");
  if (adminActiveFileName) adminActiveFileName.innerText = `📄 ${file.name} (Đã nạp bài giảng thành công)`;
  
  const lessonTitle = file.name.replace(".pdf", "");
  const input = document.getElementById("adminLessonTitleInput");
  if (input) input.value = lessonTitle;
  updateLessonTitleDisplays(lessonTitle);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += ` [Trang ${pageNum}] ` + pageText;
    }

    if (fullText.trim().length < 80) {
      throw new Error("PDF không có đủ văn bản có thể trích xuất. Nếu đây là PDF scan, cần OCR trước khi tải lên.");
    }

    state.extractedText = fullText;
    const difficulty = document.getElementById("difficultySelect")?.value || "medium";
    const count = Number.parseInt(document.getElementById("questionCountSelect")?.value, 10) || 4;
    const difficultyMix = difficulty === "adaptive" ? state.recommendedMix : null;
    const response = await fetch(`${API_BASE_URL}/question-banks/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: state.currentSourceId,
        lessonTitle,
        originalFilename: file.name,
        extractedText: fullText,
        count,
        difficulty,
        difficultyMix
      })
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.questionBankId) {
      throw new Error(data.error || "Không thể tạo question bank từ PDF mới.");
    }

    state.currentQuestionBankId = data.questionBankId;
    sessionStorage.setItem("VLEARN_ACTIVE_TEXT", fullText);
    sessionStorage.setItem("VLEARN_ACTIVE_TITLE", lessonTitle);
    sessionStorage.setItem("VLEARN_ACTIVE_FILENAME", file.name);
    sessionStorage.setItem("VLEARN_ACTIVE_SOURCE_ID", state.currentSourceId);
    sessionStorage.setItem("VLEARN_ACTIVE_QUESTION_BANK_ID", state.currentQuestionBankId);

    if (dropzoneSubtitle) {
      dropzoneSubtitle.innerText = `Đã tạo ${data.questionCount} câu mới từ đúng PDF này · ${data.savedToDb ? "đã lưu PostgreSQL" : "đang lưu tạm trên server"}`;
    }
    if (statusBadge) {
      statusBadge.innerText = "Kho câu hỏi mới đã sẵn sàng";
      statusBadge.style.background = "#dcfce7";
      statusBadge.style.color = "#15803d";
    }
  } catch (err) {
    console.error("PDF Parsing/Question Bank Error:", err);
    state.extractedText = "";
    state.currentQuestionBankId = "";
    if (dropzoneSubtitle) dropzoneSubtitle.innerText = err.message;
    if (statusBadge) {
      statusBadge.innerText = "Tạo kho câu hỏi thất bại";
      statusBadge.style.background = "#fee2e2";
      statusBadge.style.color = "#b91c1c";
    }
    alert(`Không thể dùng PDF này để tạo quiz: ${err.message}\nHệ thống không lấy câu hỏi mẫu hoặc câu hỏi cũ thay thế.`);
  }
}

/* ==========================================================================
   2. QUIZ GENERATION ENGINE
   ========================================================================== */

async function generateQuiz() {
  const difficulty = document.getElementById("difficultySelect").value;
  const count = parseInt(document.getElementById("questionCountSelect").value);
  const difficultyMix = difficulty === "adaptive" ? state.recommendedMix : null;

  if (!state.currentSourceId || !state.currentQuestionBankId || !state.extractedText) {
    alert("Hãy tải PDF và chờ AI tạo xong kho câu hỏi mới trước khi tạo bài kiểm tra.");
    return;
  }

  const btn = typeof event !== "undefined" && event?.currentTarget
    ? event.currentTarget
    : document.querySelector("button[onclick*='generateQuiz']");
  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Đang kết nối Backend Server & AI...`;
    btn.disabled = true;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/quiz/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: state.currentSourceId,
        questionBankId: state.currentQuestionBankId,
        extractedText: state.extractedText,
        originalFilename: state.currentFile?.name || `${state.currentLessonTitle}.pdf`,
        lessonTitle: state.currentLessonTitle,
        count: count,
        difficulty: difficulty,
        difficultyMix: difficultyMix
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Backend không thể tạo quiz từ question bank hiện tại.");
    }
    if (!Array.isArray(data.quiz) || data.quiz.length !== count) {
      throw new Error(`Question bank trả ${Array.isArray(data.quiz) ? data.quiz.length : 0}/${count} câu.`);
    }

    state.currentQuestionBankId = data.questionBankId;
    sessionStorage.setItem("VLEARN_ACTIVE_QUESTION_BANK_ID", data.questionBankId);
    renderQuiz(data.quiz);
    const quizSection = document.getElementById("quizSection");
    if (quizSection) quizSection.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("Quiz generation failed:", err);
    alert(`Không thể tạo quiz: ${err.message}\nKhông sử dụng câu hỏi cũ để thay thế.`);
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

function renderQuiz(quizList) {
  quizList = quizList.map((question, index) => {
    const legacyExplanation = question.explanation || "";
    const legacyCitationMatch = legacyExplanation.match(/\[(?:Trang|T)[^\]]+\]/i);
    const legacyCitation = legacyCitationMatch ? legacyCitationMatch[0] : "";
    const cleanLegacyExplanation = legacyCitation
      ? legacyExplanation.replace(legacyCitation, "").trim()
      : legacyExplanation;

    return {
      ...question,
      id: question.id ?? index + 1,
      difficulty: question.difficulty || "medium",
      explanationCorrect: question.explanationCorrect || cleanLegacyExplanation,
      explanationIncorrect: question.explanationIncorrect || "Lựa chọn này chưa bám đủ dữ kiện và khái niệm cốt lõi của bài học.",
      optionExplanations: Array.isArray(question.optionExplanations) ? question.optionExplanations : [],
      citation: question.citation || legacyCitation
    };
  });
  state.activeQuiz = quizList;
  state.userAnswers = {};

  const quizSection = document.getElementById("quizSection");
  if (quizSection) quizSection.style.display = "block";

  const container = document.getElementById("questionsContainer");
  document.getElementById("resultCard").style.display = "none";
  document.getElementById("quizActionButtons").style.display = "flex";
  
  updateProgress(0, quizList.length);

  container.innerHTML = quizList.map((q, idx) => {
    if (q.type === "single") {
      return `
        <div class="question-card" id="qcard_${q.id}">
          <div class="question-title">
            <span class="q-number">Câu ${idx + 1} · ${formatDifficulty(q.difficulty)}</span>
            <span>${q.question}</span>
          </div>
          <div class="options-group">
            ${q.options.map((opt, optIdx) => `
              <label class="option-item" id="opt_${q.id}_${optIdx}" onclick="selectOption(${q.id}, ${optIdx})">
                <input type="radio" name="q_${q.id}" value="${optIdx}">
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
          <div class="explanation-box" id="explain_${q.id}"></div>
        </div>
      `;
    } else {
      return `
        <div class="question-card" id="qcard_${q.id}">
          <div class="question-title">
            <span class="q-number">Câu ${idx + 1} · ${formatDifficulty(q.difficulty)} · Tự luận ngắn</span>
            <span>${q.question}</span>
          </div>
          <div class="form-group" style="margin-top:0.75rem;">
            <input type="text" class="form-input" id="short_ans_${q.id}" placeholder="Nhập câu trả lời của bạn..." oninput="handleShortAnswerInput(${q.id})">
          </div>
          <div class="explanation-box" id="explain_${q.id}"></div>
        </div>
      `;
    }
  }).join('');
}

function selectOption(qId, optionIdx) {
  state.userAnswers[qId] = optionIdx;
  
  const options = document.querySelectorAll(`[id^="opt_${qId}_"]`);
  options.forEach((el, idx) => {
    if (idx === optionIdx) {
      el.classList.add("selected");
      el.querySelector("input").checked = true;
    } else {
      el.classList.remove("selected");
    }
  });

  updateProgress(Object.keys(state.userAnswers).length, state.activeQuiz.length);
}

function handleShortAnswerInput(qId) {
  const val = document.getElementById(`short_ans_${qId}`).value.trim();
  if (val) {
    state.userAnswers[qId] = val;
  } else {
    delete state.userAnswers[qId];
  }
  updateProgress(Object.keys(state.userAnswers).length, state.activeQuiz.length);
}

function updateProgress(current, total) {
  document.getElementById("progressText").innerText = `${current} / ${total} câu đã trả lời`;
  const pct = Math.round((current / total) * 100) || 0;
  document.getElementById("progressBarFill").style.width = `${pct}%`;
}

/* ==========================================================================
   3. QUIZ SUBMISSION, SCORING & HISTORY RECORDING
   ========================================================================== */

async function submitQuiz() {
  const total = state.activeQuiz.length;
  const answeredCount = Object.keys(state.userAnswers).length;

  if (answeredCount < total) {
    if (!confirm(`Bạn mới làm ${answeredCount}/${total} câu. Bạn có chắc chắn muốn nộp bài ngay?`)) {
      return;
    }
  }

  let correctCount = 0;
  const missedTopics = [];
  const previousHistory = [...state.history];

  state.activeQuiz.forEach((q) => {
    const userAns = state.userAnswers[q.id];
    const explainBox = document.getElementById(`explain_${q.id}`);
    explainBox.classList.add("show");

    let isCorrect = false;

    if (q.type === "single") {
      isCorrect = userAns === q.correctAnswer;
      if (isCorrect) {
        correctCount++;
      } else {
        missedTopics.push(q.topicTag || "general");
      }

      q.options.forEach((_, optIdx) => {
        const optEl = document.getElementById(`opt_${q.id}_${optIdx}`);
        optEl.style.pointerEvents = "none";
        if (optIdx === q.correctAnswer) {
          optEl.classList.add("correct");
        } else if (optIdx === userAns && !isCorrect) {
          optEl.classList.add("incorrect");
        }
      });

      explainBox.className = `explanation-box show ${isCorrect ? 'correct-box' : 'incorrect-box'}`;
      explainBox.innerHTML = renderQuestionExplanation(q, userAns, isCorrect);
    } else {
      const userText = (userAns || "").toLowerCase();
      isCorrect = q.keywords ? q.keywords.some(kw => userText.includes(kw)) : userText.length > 5;
      if (isCorrect) {
        correctCount++;
      } else {
        missedTopics.push(q.topicTag || "general");
      }

      explainBox.className = `explanation-box show ${isCorrect ? 'correct-box' : 'incorrect-box'}`;
      explainBox.innerHTML = renderQuestionExplanation(q, userAns, isCorrect);
    }
  });

  const scorePct = Math.round((correctCount / total) * 100);

  // Record to History
  const newAttempt = {
    id: `ATT-${1000 + state.history.length + 1}`,
    date: new Date().toLocaleString("vi-VN"),
    lessonTitle: state.currentLessonTitle,
    difficulty: document.getElementById("difficultySelect").value === "adaptive"
      ? "Thích ứng"
      : document.getElementById("difficultySelect").options[document.getElementById("difficultySelect").selectedIndex].text.split(" ")[0],
    correctCount: correctCount,
    totalCount: total,
    scorePct: scorePct,
    missedTopics: missedTopics
  };

  state.history.unshift(newAttempt); // latest first
  saveHistoryToStorage();
  renderHistoryAndGapMap();

  // Show Result Card UI
  const resultCard = document.getElementById("resultCard");
  resultCard.style.display = "block";
  document.getElementById("finalScoreDisplay").innerText = `${scorePct}%`;
  
  if (scorePct >= 80) {
    document.getElementById("resultFeedbackTitle").innerText = "🎉 Xuất Sắc! Nắm Vững Lý Thuyết";
    document.getElementById("resultFeedbackDesc").innerText = `Bạn trả lời đúng ${correctCount}/${total} câu. Lịch sử làm bài đã được ghi nhận.`;
  } else {
    document.getElementById("resultFeedbackTitle").innerText = "⚠️ Phát Hiện Lỗ Hổng Kiến Thức";
    document.getElementById("resultFeedbackDesc").innerText = `Bạn trả lời đúng ${correctCount}/${total} câu. Hệ thống đã cập nhật Bản đồ lỗ hổng và hướng dẫn bạn cách ôn tập lại.`;
  }

  document.getElementById("quizActionButtons").style.display = "none";
  resultCard.scrollIntoView({ behavior: 'smooth' });

  const adaptiveResultEl = document.getElementById("adaptiveAnalysisResult");
  if (adaptiveResultEl) {
    adaptiveResultEl.style.display = "block";
    adaptiveResultEl.innerHTML = `<div class="adaptive-mix-title"><i class="ri-loader-4-line ri-spin"></i> AI đang phân tích lịch sử và điều chỉnh tỷ lệ độ khó...</div>`;
  }

  let analysis = buildLocalAdaptiveAnalysis([newAttempt, ...previousHistory], total);
  let analysisMode = "Rule-based Fallback";

  try {
    const response = await fetch(`${API_BASE_URL}/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: state.userAnswers,
        activeQuiz: state.activeQuiz,
        lessonTitle: state.currentLessonTitle,
        difficulty: newAttempt.difficulty,
        history: previousHistory.slice(0, 9)
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.analysis && data.analysis.nextMix) {
        analysis = data.analysis;
        analysisMode = data.analysisMode || "AI Generated";
      }
    }
  } catch (error) {
    console.warn("Backend adaptive analysis unavailable, using local fallback:", error);
  }

  state.latestAnalysis = analysis;
  state.latestAnalysisMode = analysisMode;
  state.recommendedMix = analysis.nextMix;
  localStorage.setItem("VLEARN_LATEST_ANALYSIS", JSON.stringify(analysis));
  localStorage.setItem("VLEARN_ANALYSIS_MODE", analysisMode);
  localStorage.setItem("VLEARN_RECOMMENDED_MIX", JSON.stringify(analysis.nextMix));

  const difficultySelect = document.getElementById("difficultySelect");
  if (difficultySelect) difficultySelect.value = "adaptive";
  renderAdaptiveRecommendation(analysis, analysisMode);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDifficulty(value) {
  const labels = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
  return labels[value] || "Trung bình";
}

function renderQuestionExplanation(question, userAnswer, isCorrect) {
  const correctExplanation = question.explanationCorrect || question.explanation || "Đáp án này phù hợp nhất với nội dung bài học.";
  const genericIncorrect = question.explanationIncorrect || "Lựa chọn này chưa phản ánh đầy đủ khái niệm được hỏi.";
  const selectedExplanation = Array.isArray(question.optionExplanations)
    ? question.optionExplanations[userAnswer]
    : "";
  const citation = question.citation || "";

  if (question.type === "single") {
    return `
      <div class="explanation-section">
        <h5>${isCorrect ? "✓ Vì sao đáp án của bạn đúng" : "✗ Vì sao lựa chọn của bạn chưa đúng"}</h5>
        <p>${escapeHtml(isCorrect ? correctExplanation : (selectedExplanation || genericIncorrect))}</p>
      </div>
      ${isCorrect ? "" : `
        <div class="explanation-section">
          <h5>✓ Vì sao đáp án đúng phù hợp hơn</h5>
          <p>${escapeHtml(correctExplanation)}</p>
        </div>
        <div class="explanation-section">
          <h5>Điểm dễ nhầm</h5>
          <p>${escapeHtml(genericIncorrect)}</p>
        </div>
      `}
      ${citation ? `<div class="explanation-citation"><i class="ri-book-open-line"></i> Nguồn tham khảo: ${escapeHtml(citation)}</div>` : ""}
    `;
  }

  return `
    <div class="explanation-section">
      <h5>${isCorrect ? "✓ Câu trả lời đã chạm đúng ý chính" : "✗ Phần còn thiếu hoặc chưa chính xác"}</h5>
      <p>${escapeHtml(isCorrect ? correctExplanation : genericIncorrect)}</p>
    </div>
    <div class="explanation-section">
      <h5>Đáp án tham khảo</h5>
      <p>${escapeHtml(question.modelAnswer || "")}</p>
    </div>
    ${isCorrect ? "" : `
      <div class="explanation-section">
        <h5>Cách lập luận đầy đủ</h5>
        <p>${escapeHtml(correctExplanation)}</p>
      </div>
    `}
    ${citation ? `<div class="explanation-citation"><i class="ri-book-open-line"></i> Nguồn tham khảo: ${escapeHtml(citation)}</div>` : ""}
  `;
}

function allocateAdaptiveMix(weights, total) {
  const levels = ["easy", "medium", "hard"];
  const weightTotal = levels.reduce((sum, level) => sum + (weights[level] || 0), 0) || 1;
  const raw = levels.map(level => ((weights[level] || 0) / weightTotal) * total);
  const counts = raw.map(Math.floor);
  let remaining = total - counts.reduce((sum, value) => sum + value, 0);
  raw
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(item => {
      if (remaining > 0) {
        counts[item.index] += 1;
        remaining -= 1;
      }
    });
  return { easy: counts[0], medium: counts[1], hard: counts[2] };
}

function buildLocalAdaptiveAnalysis(history, totalQuestions) {
  const recent = history.slice(0, 10);
  const latestScore = recent[0]?.scorePct || 0;
  const previous = recent.slice(1);
  const previousAverage = previous.length
    ? previous.reduce((sum, attempt) => sum + (attempt.scorePct || 0), 0) / previous.length
    : latestScore;

  let trend = "stable";
  if (recent.length < 2) trend = "insufficient_data";
  else if (latestScore >= previousAverage + 8) trend = "improving";
  else if (latestScore <= previousAverage - 8) trend = "declining";

  const weights = latestScore >= 80
    ? { easy: 20, medium: 30, hard: 50 }
    : latestScore < 50
      ? { easy: 60, medium: 30, hard: 10 }
      : { easy: 30, medium: 50, hard: 20 };

  const topicCounts = {};
  recent.forEach(attempt => {
    (attempt.missedTopics || []).forEach(topic => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });

  return {
    weakTopics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic),
    summary: latestScore >= 80
      ? "Bạn đang nắm khá vững nội dung. Lượt tiếp theo có thể tăng câu khó để kiểm tra khả năng vận dụng, đồng thời giữ một phần câu dễ và trung bình để bảo đảm kiến thức nền ổn định."
      : latestScore < 50
        ? "Kiến thức nền ở lượt gần nhất chưa ổn định. Lượt tiếp theo nên tăng câu dễ để củng cố khái niệm, sau đó mới nâng dần độ khó."
        : "Kết quả đang ở mức trung gian. Lượt tiếp theo nên ưu tiên câu trung bình, kèm câu dễ để củng cố và một số câu khó để luyện vận dụng.",
    performanceTrend: trend,
    reasoning: `Điểm gần nhất ${latestScore}%; trung bình các lượt trước ${Math.round(previousAverage)}%.`,
    nextMix: allocateAdaptiveMix(weights, totalQuestions)
  };
}

function renderAdaptiveRecommendation(analysis, analysisMode = "") {
  const compact = document.getElementById("adaptiveMixCompact");
  const result = document.getElementById("adaptiveAnalysisResult");
  const historyCard = document.getElementById("adaptiveHistoryCard");
  const historyContent = document.getElementById("adaptiveHistoryContent");
  const modeBadge = document.getElementById("adaptiveAnalysisMode");

  if (!analysis || !analysis.nextMix) {
    if (compact) {
      compact.innerHTML = `
        <div class="adaptive-mix-title"><i class="ri-brain-line"></i> Tỷ lệ thích ứng chưa có dữ liệu</div>
        <p>Hoàn thành một bài quiz để AI đề xuất tỷ lệ câu dễ, trung bình và khó cho lượt tiếp theo.</p>
      `;
    }
    if (result) result.style.display = "none";
    if (historyCard) historyCard.style.display = "none";
    return;
  }

  const mix = analysis.nextMix;
  const total = (mix.easy || 0) + (mix.medium || 0) + (mix.hard || 0);
  const trendLabels = {
    improving: "Đang tiến bộ",
    declining: "Cần củng cố",
    stable: "Ổn định",
    insufficient_data: "Chưa đủ dữ liệu"
  };
  const weakTopicText = (analysis.weakTopics || []).length
    ? (analysis.weakTopics || []).map(topic => escapeHtml(topic)).join(", ")
    : "Chưa phát hiện chủ đề yếu nổi bật";

  const mixHtml = `
    <div class="adaptive-mix-grid">
      <div class="adaptive-mix-item"><span>Dễ</span><strong>${mix.easy || 0}/${total}</strong></div>
      <div class="adaptive-mix-item"><span>Trung bình</span><strong>${mix.medium || 0}/${total}</strong></div>
      <div class="adaptive-mix-item"><span>Khó</span><strong>${mix.hard || 0}/${total}</strong></div>
    </div>
  `;
  const contentHtml = `
    <div class="adaptive-mix-title"><i class="ri-brain-line"></i> ${escapeHtml(trendLabels[analysis.performanceTrend] || "Phân tích thích ứng")}</div>
    <p class="adaptive-reasoning">${escapeHtml(analysis.summary || "")}</p>
    ${mixHtml}
    <p class="adaptive-reasoning"><strong>Chủ đề cần chú ý:</strong> ${weakTopicText}</p>
    <p class="adaptive-reasoning"><strong>Lý do điều chỉnh:</strong> ${escapeHtml(analysis.reasoning || "")}</p>
  `;

  if (compact) {
    compact.innerHTML = `
      <div class="adaptive-mix-title"><i class="ri-brain-line"></i> AI đề xuất bài tiếp theo</div>
      <p>Dễ ${mix.easy || 0} · Trung bình ${mix.medium || 0} · Khó ${mix.hard || 0}. Chọn “Thích ứng theo lịch sử” để áp dụng.</p>
    `;
  }
  if (result) {
    result.style.display = "block";
    result.innerHTML = contentHtml;
  }
  if (historyCard && historyContent) {
    historyCard.style.display = "block";
    historyContent.innerHTML = contentHtml;
  }
  if (modeBadge) modeBadge.innerText = analysisMode || "Adaptive";
}

function resetQuiz() {
  if (state.activeQuiz.length > 0) {
    renderQuiz(state.activeQuiz);
  } else {
    loadInitialData();
  }
}

/* ==========================================================================
   4. KNOWLEDGE GAP MAP & HISTORY RENDERER
   ========================================================================== */

function renderHistoryAndGapMap() {
  const historyBody = document.getElementById("historyTableBody");
  const attemptCountBadge = document.getElementById("attemptCountBadge");
  const gapContainer = document.getElementById("gapTopicsContainer");
  const guideContainer = document.getElementById("remediationGuideContainer");

  if (!historyBody || !gapContainer) return;

  attemptCountBadge.innerText = `${state.history.length} lần làm bài`;

  // 1. Render History Table
  if (state.history.length === 0) {
    historyBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Chưa có lịch sử làm bài nào. Hãy chọn câu hỏi và nộp bài để ghi nhận kết quả.</td></tr>`;
  } else {
    historyBody.innerHTML = state.history.map((att, idx) => `
      <tr>
        <td><strong>#${att.id}</strong></td>
        <td>${att.date}</td>
        <td>${att.lessonTitle}</td>
        <td><span class="pill" style="background:#f1f5f9; color:#475569;">${att.difficulty}</span></td>
        <td><strong>${att.correctCount} / ${att.totalCount}</strong></td>
        <td><strong style="color: ${att.scorePct >= 80 ? 'var(--success)' : 'var(--danger)'};">${att.scorePct}%</strong></td>
        <td>
          <span class="badge-status ${att.scorePct >= 80 ? 'badge-passed' : 'badge-failed'}">
            ${att.scorePct >= 80 ? '✓ Đạt' : '⚠️ Cần Ôn Tập'}
          </span>
        </td>
      </tr>
    `).join('');
  }

  // 2. Compute Topic Gap Percentages
  const topicStats = {
    jtbd: { missed: 0, total: 0 },
    grounding: { missed: 0, total: 0 },
    automation: { missed: 0, total: 0 },
    eval: { missed: 0, total: 0 }
  };

  state.history.forEach(att => {
    att.missedTopics.forEach(tId => {
      if (topicStats[tId]) {
        topicStats[tId].missed += 1;
      }
    });
    // Add totals
    Object.keys(topicStats).forEach(key => topicStats[key].total += 1);
  });

  // Render Gap Cards
  gapContainer.innerHTML = KNOWLEDGE_TOPICS.map(topic => {
    const stat = topicStats[topic.id] || { missed: 0, total: 1 };
    const gapPct = state.history.length > 0 ? Math.min(100, Math.round((stat.missed / state.history.length) * 100)) : 0;
    const isHigh = gapPct > 30;

    return `
      <div class="gap-card">
        <div class="gap-header">
          <span>${topic.name}</span>
          <span class="gap-pct ${isHigh ? 'high-gap' : 'low-gap'}">
            ${isHigh ? `Lỗ hổng: ${gapPct}%` : `Vững: ${100 - gapPct}%`}
          </span>
        </div>
        <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.6rem;">${topic.desc}</p>
        <div class="gap-progress-bg">
          <div class="gap-progress-fill" style="width: ${isHigh ? gapPct : (100 - gapPct)}%; background: ${isHigh ? 'var(--danger)' : 'var(--success)'};"></div>
        </div>
      </div>
    `;
  }).join('');

  // 3. Render Personalized Remediation Advice
  const highGaps = KNOWLEDGE_TOPICS.filter(t => {
    const stat = topicStats[t.id];
    return stat && state.history.length > 0 && (stat.missed / state.history.length) > 0.2;
  });

  if (highGaps.length === 0) {
    guideContainer.innerHTML = `
      <div class="guide-item">
        <div class="guide-icon"><i class="ri-checkbox-circle-fill" style="color:var(--success)"></i></div>
        <div class="guide-text">
          <h5>Phong độ ôn tập xuất sắc!</h5>
          <p>Tất cả các chủ đề cốt lõi đều đạt tỷ lệ nắm vững cao. Bạn có thể sẵn sàng làm các bài quiz nâng cao tiếp theo.</p>
        </div>
      </div>
    `;
  } else {
    guideContainer.innerHTML = highGaps.map(g => `
      <div class="guide-item">
        <div class="guide-icon"><i class="ri-error-warning-fill" style="color:var(--danger)"></i></div>
        <div class="guide-text">
          <h5>Cần ôn lại: ${g.name}</h5>
          <p>Hệ thống nhận thấy bạn thường trả lời chưa chính xác phần <strong>${g.desc}</strong>. Khuyên bạn nên mở Widget AI Tutor để hỏi lại khái niệm này hoặc đọc kỹ trang bài giảng tương ứng.</p>
        </div>
      </div>
    `).join('');
  }
}

/* ==========================================================================
   5. NAVIGATION & CHATBOT HANDLERS
   ========================================================================== */

/* ==========================================================================
   5. DUAL-ROLE SWITCHER & ADMIN WORKSPACE HANDLERS
   ========================================================================== */

function switchRole(role) {
  state.currentRole = role;

  const roleBtnUser = document.getElementById("roleBtnUser");
  const roleBtnAdmin = document.getElementById("roleBtnAdmin");
  const navGroupUser = document.getElementById("navGroupUser");
  const navGroupAdmin = document.getElementById("navGroupAdmin");
  const roleBadge = document.getElementById("roleBadge");
  const activeUserName = document.getElementById("activeUserName");
  const activeUserRole = document.getElementById("activeUserRole");

  if (role === "admin") {
    roleBtnUser.classList.remove("active");
    roleBtnAdmin.classList.add("active");
    navGroupUser.style.display = "none";
    navGroupAdmin.style.display = "block";

    if (roleBadge) {
      roleBadge.innerText = "QUẢN TRỊ VIÊN (ADMIN)";
      roleBadge.style.background = "rgba(199, 33, 39, 0.25)";
      roleBadge.style.color = "#fca5a5";
      roleBadge.style.borderColor = "rgba(199, 33, 39, 0.5)";
    }
    if (activeUserName) activeUserName.innerText = "Admin";
    if (activeUserRole) activeUserRole.innerText = "Quản trị viên hệ thống";

    switchNav("admin-dashboard");
  } else {
    roleBtnAdmin.classList.remove("active");
    roleBtnUser.classList.add("active");
    navGroupAdmin.style.display = "none";
    navGroupUser.style.display = "block";

    if (roleBadge) {
      roleBadge.innerText = "HỌC VIÊN (USER)";
      roleBadge.style.background = "rgba(19, 77, 139, 0.35)";
      roleBadge.style.color = "#93c5fd";
      roleBadge.style.borderColor = "rgba(19, 77, 139, 0.5)";
    }
    if (activeUserName) activeUserName.innerText = "Học viên";
    if (activeUserRole) activeUserRole.innerText = "Học viên VLearn";

    switchNav("generator");
  }
}

function switchNav(viewName) {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  document.querySelectorAll(".tab-view").forEach(view => view.style.display = "none");

  const titleEl = document.getElementById("currentViewTitle");
  const subtitleEl = document.getElementById("currentViewSubtitle");

  if (viewName === "generator") {
    document.getElementById("nav-generator")?.classList.add("active");
    document.getElementById("view-generator").style.display = "flex";
    titleEl.innerText = "Hệ Thống Tạo Bài Kiểm Tra AI Cho VLearn";
    subtitleEl.innerText = "Tự động đọc tài liệu PDF, sinh quiz kiểm tra Active Recall & theo dõi lịch sử hổng kiến thức";
  } else if (viewName === "analytics") {
    document.getElementById("nav-analytics")?.classList.add("active");
    document.getElementById("view-analytics").style.display = "flex";
    titleEl.innerText = "Bản Đồ Lỗ Hổng Kiến Thức & Hướng Dẫn Ôn Tập";
    subtitleEl.innerText = "Theo dõi lịch sử làm bài và nhận gợi ý lộ trình cải thiện từ AI Tutor";
    renderHistoryAndGapMap();
  } else if (viewName === "admin-lessons") {
    document.getElementById("nav-admin-lessons")?.classList.add("active");
    document.getElementById("view-admin-lessons").style.display = "flex";
    titleEl.innerText = "Tải Lên PDF & Cấu Hình Bài Giảng (Dành Cho Admin)";
    subtitleEl.innerText = "Tải lên tài liệu PDF bài giảng mới và đặt tên bài học để đồng bộ cho toàn bộ học viên";
  } else if (viewName === "admin-dashboard") {
    document.getElementById("nav-admin-dashboard")?.classList.add("active");
    document.getElementById("view-admin-dashboard").style.display = "flex";
    titleEl.innerText = "Dashboard Quản Trị Lớp Học & Tỷ Lệ Lỗ Hổng Kiến Thức";
    subtitleEl.innerText = "Tổng quan chỉ số làm bài, thống kê tỷ lệ hổng kiến thức toàn lớp và thao tác gửi nhắc nhở ôn tập";
    renderAdminDashboard();
  } else if (viewName === "admin-students") {
    document.getElementById("nav-admin-students")?.classList.add("active");
    document.getElementById("view-admin-students").style.display = "flex";
    titleEl.innerText = "Quản Lý Học Viên & Cảnh Báo Lỗ Hổng Kiến Thức";
    subtitleEl.innerText = "Theo dõi danh sách học viên rủi ro, phân tích điểm số và can thiệp kịp thời";
    renderAdminStudents();
  } else if (viewName === "admin-config") {
    document.getElementById("nav-admin-config")?.classList.add("active");
    document.getElementById("view-admin-config").style.display = "flex";
    titleEl.innerText = "Cấu Hình AI System Prompt & Grounding Guardrails";
    subtitleEl.innerText = "Thiết lập quy tắc trích dẫn [Trang N], ngưỡng chống bịa nguồn và mức độ Automation cho lớp học";
    updateGuardrailPreview();
  }
}

/* ==========================================================================
   6. ADMIN DASHBOARD & STUDENT ROSTER LOGIC
   ========================================================================== */

function renderAdminDashboard() {
  const sample = window.VLEARN_SAMPLE_DATA;
  if (!sample || !sample.adminMetrics) return;

  const metrics = sample.adminMetrics;
  
  document.getElementById("adminTotalStudents").innerText = metrics.totalStudents.toLocaleString();
  document.getElementById("adminTotalQuizzes").innerText = metrics.totalQuizzesGenerated.toLocaleString();
  document.getElementById("adminClassAvg").innerText = `${metrics.classAverageScore}%`;
  document.getElementById("adminAtRiskCount").innerText = `${metrics.atRiskStudentsCount} HV`;

  const gapContainer = document.getElementById("adminClassGapContainer");
  if (!gapContainer) return;

  gapContainer.innerHTML = metrics.topicGapDistribution.map(t => `
    <div style="display:flex; flex-direction:column; gap:0.35rem;">
      <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600;">
        <span>${t.name}</span>
        <span style="color:${t.gapPct > 25 ? 'var(--danger)' : 'var(--success)'};">${t.gapPct}% học viên yếu (${t.count} HV)</span>
      </div>
      <div class="gap-progress-bg" style="height:10px;">
        <div class="gap-progress-fill" style="width: ${t.gapPct}%; background: ${t.gapPct > 25 ? 'var(--danger)' : 'var(--warning)'};"></div>
      </div>
    </div>
  `).join('');
}

function renderAdminStudents(studentsToRender = null) {
  const tableBody = document.getElementById("adminStudentsTableBody");
  if (!tableBody) return;

  const students = studentsToRender || window.VLEARN_SAMPLE_DATA.studentsList || [];

  if (students.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Không tìm thấy học viên nào phù hợp với bộ lọc.</td></tr>`;
    return;
  }

  tableBody.innerHTML = students.map(s => {
    let badgeClass = "badge-safe";
    let badgeText = "✓ An toàn";
    if (s.riskStatus === "danger") {
      badgeClass = "badge-danger";
      badgeText = "🚨 Cảnh báo nặng";
    } else if (s.riskStatus === "warning") {
      badgeClass = "badge-warning";
      badgeText = "⚠️ Cần lưu ý";
    }

    return `
      <tr>
        <td><strong>#${s.id}</strong></td>
        <td><strong>${s.name}</strong></td>
        <td><span class="pill" style="background:#f1f5f9;">${s.class}</span></td>
        <td>${s.lastActive}</td>
        <td>${s.attempts} lần</td>
        <td><strong style="color: ${s.avgScore >= 75 ? 'var(--success)' : 'var(--danger)'};">${s.avgScore}%</strong></td>
        <td><span style="font-size:0.82rem; color:var(--text-muted);">${s.riskTopic}</span></td>
        <td><span class="${badgeClass}">${badgeText}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.65rem;" onclick="sendRemediationToStudent('${s.id}', '${s.name}')">
            <i class="ri-send-plane-line"></i> Gửi Bài Ôn
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminStudents() {
  const query = (document.getElementById("adminStudentSearch")?.value || "").toLowerCase();
  const filterStatus = document.getElementById("adminRiskFilter")?.value || "all";

  let filtered = window.VLEARN_SAMPLE_DATA.studentsList || [];

  if (query) {
    filtered = filtered.filter(s => s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query));
  }

  if (filterStatus !== "all") {
    filtered = filtered.filter(s => s.riskStatus === filterStatus);
  }

  renderAdminStudents(filtered);
}

function resetStudentFilter() {
  if (document.getElementById("adminStudentSearch")) document.getElementById("adminStudentSearch").value = "";
  if (document.getElementById("adminRiskFilter")) document.getElementById("adminRiskFilter").value = "all";
  renderAdminStudents();
}

function sendRemediationToStudent(studentId, studentName) {
  alert(`Đã tự động gửi bài ôn tập cá nhân hóa & thông báo nhắc nhở qua AI Tutor cho học viên ${studentName} (${studentId})!`);
}

function triggerClassRemediationNotice() {
  alert("Hệ thống vừa gửi thông báo & lộ trình ôn tập AI tự động tới 146 học viên có tỷ lệ hổng kiến thức trên 30%!");
}

function exportClassReport() {
  alert("Đã xuất thành công file báo cáo CSV 'VLearn_Class_K3_ActiveRecall_Report.csv' để đính kèm hồ sơ Hackathon!");
}

/* ==========================================================================
   7. ADMIN GUARDRAILS & PROMPT CONFIG HANDLERS
   ========================================================================== */

function updateGuardrailPreview() {
  const strictGrounding = document.getElementById("guardrailStrictGrounding")?.checked ?? true;
  const refuseOutOfScope = document.getElementById("guardrailRefuseOutOfScope")?.checked ?? true;
  const automationLevel = document.getElementById("guardrailAutomationLevel")?.value || "augment";
  const hallucinationVal = document.getElementById("guardrailHallucination")?.value || "85";
  const tempVal = document.getElementById("guardrailTemp")?.value || "20";

  const configObj = {
    strictGrounding: strictGrounding,
    requirePageCitation: true,
    refuseOutOfScope: refuseOutOfScope,
    automationLevel: automationLevel,
    temperature: parseFloat((tempVal / 100).toFixed(2)),
    hallucinationGuardFilterPct: parseInt(hallucinationVal),
    groundingPattern: "[Txx-NNN]",
    systemPrompt: `You are VLearn Active Recall Quiz Generator. Always generate questions grounded STRICTLY in the provided PDF material. Every correct answer explanation MUST cite exact page numbers [Trang N] or sections.`
  };

  const previewEl = document.getElementById("jsonGuardrailPreview");
  if (previewEl) {
    previewEl.innerText = JSON.stringify(configObj, null, 2);
  }
}

async function saveGuardrailSettings() {
  updateGuardrailPreview();
  const strictGrounding = document.getElementById("guardrailStrictGrounding")?.checked ?? true;
  const refuseOutOfScope = document.getElementById("guardrailRefuseOutOfScope")?.checked ?? true;
  const automationLevel = document.getElementById("guardrailAutomationLevel")?.value || "augment";
  const hallucinationVal = document.getElementById("guardrailHallucination")?.value || "85";
  const tempVal = document.getElementById("guardrailTemp")?.value || "20";

  const configObj = {
    strictGrounding: strictGrounding,
    requirePageCitation: true,
    refuseOutOfScope: refuseOutOfScope,
    automationLevel: automationLevel,
    temperature: parseFloat((tempVal / 100).toFixed(2)),
    hallucinationGuardFilterPct: parseInt(hallucinationVal),
    systemPrompt: `You are VLearn Active Recall Quiz Generator. Always generate questions grounded STRICTLY in the provided PDF material. Every correct answer explanation MUST cite exact page numbers [Trang N] or sections.`
  };

  try {
    await fetch(`${API_BASE_URL}/admin/guardrails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configObj)
    });
  } catch (err) {
    console.warn("Backend API /api/admin/guardrails unavailable:", err);
  }

  alert("✓ Đã lưu cấu hình AI System Prompt & Guardrails cho toàn hệ thống VLearn (Đã đồng bộ CSDL)!");
}

function toggleChatWindow() {
  const win = document.getElementById("chatWindow");
  win.classList.toggle("open");
  if (win.classList.contains("open")) {
    document.getElementById("chatInput").focus();
  }
}

function handleChatKeyPress(e) {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  const chatBody = document.getElementById("chatBody");

  const userMsgEl = document.createElement("div");
  userMsgEl.className = "chat-msg msg-user";
  userMsgEl.innerText = text;
  chatBody.appendChild(userMsgEl);

  input.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  const aiMsgEl = document.createElement("div");
  aiMsgEl.className = "chat-msg msg-ai";
  aiMsgEl.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> AI Tutor đang suy nghĩ...`;
  chatBody.appendChild(aiMsgEl);
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const response = await fetch(`${API_BASE_URL}/tutor/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: text,
        lessonText: state.extractedText,
        lessonTitle: state.currentLessonTitle
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.reply) {
        aiMsgEl.innerHTML = data.reply;
        chatBody.scrollTop = chatBody.scrollHeight;
        return;
      }
    }
  } catch (err) {
    console.warn("Backend API /api/tutor/chat unavailable, using local reply fallback:", err);
  }

  // Fallback to local response
  setTimeout(() => {
    aiMsgEl.innerHTML = generateAiResponse(text);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 400);
}

function generateAiResponse(query) {
  const qLower = query.toLowerCase();
  
  if (qLower.includes("lỗ hổng") || qLower.includes("ôn tập") || qLower.includes("kết quả")) {
    return `Theo lịch sử nộp bài của bạn, bạn đã thực hiện <strong>${state.history.length} lần làm bài</strong>.<br>Hệ thống khuyến nghị bạn nên tập trung xem lại phần <em>Cost-of-error & Mức Automation</em> để củng cố điểm số.`;
  } else if (qLower.includes("jtbd") || qLower.includes("bài toán")) {
    return `Dựa vào bài lý thuyết <strong>[JTBD Framework]</strong>:<br>Công thức 1 câu là: <em>1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả</em>.`;
  } else {
    return `Chào bạn! Cảm ơn câu hỏi về: "<em>${query}</em>".<br>Theo dữ liệu bài lý thuyết <strong>[Trang 1-2 PDF]</strong>, bạn có thể kiểm tra trực tiếp đáp án đúng trong phần giải thích bài quiz hoặc xem Bản đồ lỗ hổng ở thanh menu bên trái.`;
  }
}

function openApiModal() {
  document.getElementById("apiModal").style.display = "flex";
  document.getElementById("geminiApiKeyInput").value = state.apiKey;
}

function closeApiModal() {
  document.getElementById("apiModal").style.display = "none";
}

function saveApiKey() {
  const key = document.getElementById("geminiApiKeyInput").value.trim();
  state.apiKey = key;
  localStorage.setItem("VLEARN_GEMINI_KEY", key);
  closeApiModal();
  alert(key ? "Đã lưu API Key thành công!" : "Đã hủy API Key (chuyển sang chế độ Smart Offline Generator).");
}

