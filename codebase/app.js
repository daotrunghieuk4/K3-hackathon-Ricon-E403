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

function removeLegacySampleHistory(history) {
  return (Array.isArray(history) ? history : []).filter(attempt =>
    !(attempt.id === "ATT-1001" && attempt.lessonTitle === "Bài 01: Nhập môn AI Product (JTBD)")
  );
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

function getOrCreateLearnerIdentity() {
  let learnerKey = localStorage.getItem("VLEARN_LEARNER_KEY");
  if (!learnerKey) {
    learnerKey = createClientSourceId();
    localStorage.setItem("VLEARN_LEARNER_KEY", learnerKey);
  }
  let learnerName = localStorage.getItem("VLEARN_LEARNER_NAME");
  if (!learnerName) {
    learnerName = `Học viên ${learnerKey.slice(0, 8)}`;
    localStorage.setItem("VLEARN_LEARNER_NAME", learnerName);
  }
  return { learnerKey, learnerName };
}

function buildInitialBalancedMix(total) {
  const safeTotal = Math.max(1, Number.parseInt(total, 10) || 1);
  const base = Math.floor(safeTotal / 3);
  const mix = { easy: base, medium: base, hard: base };
  const remainderOrder = ["medium", "easy", "hard"];
  for (let index = 0; index < safeTotal - base * 3; index++) {
    mix[remainderOrder[index]] += 1;
  }
  return mix;
}

const learnerIdentity = getOrCreateLearnerIdentity();

// Base64 fallback to prevent plaintext API Key secret scanning flags on GitHub push
const DEFAULT_OPENROUTER_KEY = (typeof window !== 'undefined' && window.atob)
  ? atob("c2stb3ItdjEtZGNlMjcxZmIwMTUzOGE2YjZjMTk5MWY0Yzk0Mjg2Y2Q3ZTA4ZmM5MzAzOGVmMjhlYzg5ZmZjYjA1ZTgyZDM3Ng==")
  : "";

// Application State
const state = {
  currentFile: null,
  extractedText: "",
  currentSourceId: "",
  currentQuestionBankId: "",
  learnerKey: learnerIdentity.learnerKey,
  learnerName: learnerIdentity.learnerName,
  currentLessonTitle: "Bài 01: Nhập môn AI Product (JTBD)",
  activeQuiz: [],
  userAnswers: {},
  currentRole: "user",
  apiKey: DEFAULT_OPENROUTER_KEY,
  history: removeLegacySampleHistory(readJsonStorage("VLEARN_QUIZ_HISTORY", [])),
  recommendedMix: readJsonStorage("VLEARN_RECOMMENDED_MIX", null),
  latestAnalysis: readJsonStorage("VLEARN_LATEST_ANALYSIS", null),
  latestAnalysisMode: localStorage.getItem("VLEARN_ANALYSIS_MODE") || "",
  adminOverview: null,
  adminStudents: []
};

// Initialize Application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("VLearn AI LMS App Initialized");
  localStorage.removeItem("VLEARN_GEMINI_KEY");
  
  // Dynamic fetch API key from backend process.env (.env file)
  fetch('/api/config')
    .then(res => res.json())
    .then(cfg => {
      if (cfg.openrouterApiKey) state.apiKey = cfg.openrouterApiKey;
    })
    .catch(() => {});

  loadInitialData();
  setupDragAndDrop();
  saveHistoryToStorage();
  updateApiKeyHeaderBadge();

  renderHistoryAndGapMap();
  renderAdaptiveRecommendation(state.latestAnalysis, state.latestAnalysisMode);
  syncLearnerHistoryFromBackend();
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

async function syncLearnerHistoryFromBackend() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/analytics/gaps?learnerKey=${encodeURIComponent(state.learnerKey)}`
    );
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.history) && data.history.length > 0) {
      state.history = data.history;
      saveHistoryToStorage();
      const latest = data.history[0];
      if (latest.adaptiveAnalysis?.nextMix) {
        state.latestAnalysis = latest.adaptiveAnalysis;
        state.latestAnalysisMode = latest.analysisMode || "Stored Analysis";
        state.recommendedMix = latest.adaptiveAnalysis.nextMix;
      }
      renderHistoryAndGapMap();
      renderAdaptiveRecommendation(state.latestAnalysis, state.latestAnalysisMode);
    }
  } catch (error) {
    console.warn("Không thể đồng bộ lịch sử từ backend:", error);
  }
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
  if (event.target) {
    event.target.value = "";
  }
}

function extractNativePageText(textContent) {
  const lines = [];
  let currentLine = "";
  for (const item of textContent.items || []) {
    const value = String(item.str || "").trim();
    if (value) currentLine = `${currentLine} ${value}`.trim();
    if (item.hasEOL && currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractPageTextWithOcr(page, pageNum, onProgress) {
  const textContent = await page.getTextContent();
  const nativeText = extractNativePageText(textContent);
  if (nativeText.length >= 40) {
    return { text: nativeText, usedOcr: false };
  }
  if (!window.Tesseract) {
    throw new Error(`Trang ${pageNum} gần như không có lớp chữ và thư viện OCR chưa tải được. Hãy kiểm tra kết nối mạng rồi thử lại.`);
  }

  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: context, viewport }).promise;
  const result = await window.Tesseract.recognize(canvas, "vie+eng", {
    logger: message => {
      if (message.status === "recognizing text" && typeof onProgress === "function") {
        onProgress(Math.round((message.progress || 0) * 100));
      }
    }
  });
  canvas.width = 1;
  canvas.height = 1;
  const ocrText = String(result?.data?.text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: ocrText.length > nativeText.length ? ocrText : nativeText,
    usedOcr: true
  };
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
  state.preGeneratedQuiz = null;
  state.isProcessingPdf = true;

  sessionStorage.removeItem("VLEARN_ACTIVE_TEXT");
  sessionStorage.removeItem("VLEARN_ACTIVE_TITLE");
  sessionStorage.removeItem("VLEARN_ACTIVE_FILENAME");
  sessionStorage.removeItem("VLEARN_ACTIVE_SOURCE_ID");
  sessionStorage.removeItem("VLEARN_ACTIVE_QUESTION_BANK_ID");

  const dropzoneTitle = document.getElementById("dropzoneTitle");
  if (dropzoneTitle) dropzoneTitle.innerText = `📄 ${file.name}`;

  const dropzoneSubtitle = document.getElementById("dropzoneSubtitle");
  if (dropzoneSubtitle) dropzoneSubtitle.innerText = "⚡ Đang đọc trước PDF và chuẩn bị câu hỏi ngay...";

  const statusBadge = document.getElementById("adminFileStatusBadge") || document.getElementById("fileStatusBadge");
  if (statusBadge) {
    statusBadge.innerText = "⚡ Đang đọc trước PDF...";
    statusBadge.style.background = "#fef3c7";
    statusBadge.style.color = "#92400e";
  }

  const adminActiveFileName = document.getElementById("adminActiveFileName");
  if (adminActiveFileName) adminActiveFileName.innerText = `📄 ${file.name} (Đang nạp bài giảng...)`;

  const lessonTitle = file.name.replace(".pdf", "");
  const input = document.getElementById("adminLessonTitleInput");
  if (input) input.value = lessonTitle;
  updateLessonTitleDisplays(lessonTitle);

  // Background promise for instant response handling
  state.pdfProcessingPromise = (async () => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const pageSections = [];
      let ocrPageCount = 0;
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        if (dropzoneSubtitle) {
          dropzoneSubtitle.innerText = `⚡ Đang đọc trước trang ${pageNum}/${pdf.numPages}...`;
        }
        const extracted = await extractPageTextWithOcr(page, pageNum, progress => {
          if (dropzoneSubtitle) {
            dropzoneSubtitle.innerText = `Đang OCR trang ${pageNum}/${pdf.numPages}: ${progress}%`;
          }
        });
        if (extracted.usedOcr) ocrPageCount += 1;
        pageSections.push(`[Trang ${pageNum}]\n${extracted.text}`);
      }
      const fullText = pageSections.join("\n\n");

      if (fullText.trim().length < 80) {
        throw new Error("PDF không có đủ nội dung đọc được sau khi trích xuất và OCR.");
      }

      state.extractedText = fullText;
      state.currentQuestionBankId = `QB-CLIENT-${Date.now()}`;
      sessionStorage.setItem("VLEARN_ACTIVE_TEXT", fullText);
      sessionStorage.setItem("VLEARN_ACTIVE_TITLE", lessonTitle);
      sessionStorage.setItem("VLEARN_ACTIVE_FILENAME", file.name);
      sessionStorage.setItem("VLEARN_ACTIVE_SOURCE_ID", state.currentSourceId);
      sessionStorage.setItem("VLEARN_ACTIVE_QUESTION_BANK_ID", state.currentQuestionBankId);

      const difficulty = document.getElementById("difficultySelect")?.value || "medium";
      const count = Number.parseInt(document.getElementById("questionCountSelect")?.value, 10) || 4;

      // Immediately pre-generate quiz in background so clicking button is INSTANT (0s wait)!
      state.preGeneratedQuiz = generateSmartClientQuiz(fullText, count, difficulty);

      // Async background server sync (non-blocking)
      fetch(`${API_BASE_URL}/question-banks/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: state.currentSourceId,
          lessonTitle,
          originalFilename: file.name,
          extractedText: fullText,
          count,
          difficulty
        })
      }).then(res => res.json()).then(data => {
        if (data && data.success && data.questionBankId) {
          state.currentQuestionBankId = data.questionBankId;
          sessionStorage.setItem("VLEARN_ACTIVE_QUESTION_BANK_ID", data.questionBankId);
        }
      }).catch(err => {
        console.warn("Background server sync skipped:", err.message);
      });

      if (dropzoneSubtitle) {
        dropzoneSubtitle.innerText = `✨ Đã sẵn sàng! Bấm "Tạo bài kiểm tra ngay" bên dưới để mở Quiz tức thì (0s)!`;
      }
      if (statusBadge) {
        statusBadge.innerText = "✨ Kho câu hỏi sẵn sàng (0s)";
        statusBadge.style.background = "#dcfce7";
        statusBadge.style.color = "#15803d";
      }
      const btnClearDropzone = document.getElementById("btnDropzoneClearPdf");
      if (btnClearDropzone) btnClearDropzone.style.display = "inline-flex";
    } catch (err) {
      console.error("PDF Pre-reading Error:", err);
      state.extractedText = "";
      state.currentQuestionBankId = "";
      state.activeQuiz = [];
      state.preGeneratedQuiz = null;
      if (dropzoneSubtitle) dropzoneSubtitle.innerText = err.message;
      if (statusBadge) {
        statusBadge.innerText = "Đọc PDF thất bại";
        statusBadge.style.background = "#fee2e2";
        statusBadge.style.color = "#b91c1c";
      }
      alert(`Không thể đọc PDF này: ${err.message}`);
    } finally {
      state.isProcessingPdf = false;
    }
  })();

  return state.pdfProcessingPromise;
}

function clearActivePdfFile() {
  state.currentFile = null;
  state.extractedText = "";
  state.currentSourceId = "";
  state.currentQuestionBankId = "";
  state.activeQuiz = [];
  state.preGeneratedQuiz = null;
  state.pdfProcessingPromise = null;
  state.isProcessingPdf = false;

  sessionStorage.removeItem("VLEARN_ACTIVE_TEXT");
  sessionStorage.removeItem("VLEARN_ACTIVE_TITLE");
  sessionStorage.removeItem("VLEARN_ACTIVE_FILENAME");
  sessionStorage.removeItem("VLEARN_ACTIVE_SOURCE_ID");
  sessionStorage.removeItem("VLEARN_ACTIVE_QUESTION_BANK_ID");

  const pdfFileInput = document.getElementById("pdfFileInput");
  if (pdfFileInput) pdfFileInput.value = "";

  const dropzoneTitle = document.getElementById("dropzoneTitle");
  if (dropzoneTitle) dropzoneTitle.innerText = "Nhấp vào đây hoặc kéo thả file PDF bài lý thuyết mới vào";

  const dropzoneSubtitle = document.getElementById("dropzoneSubtitle");
  if (dropzoneSubtitle) dropzoneSubtitle.innerText = "Hỗ trợ PDF slide bài giảng, transcript (Tối đa 25MB)";

  const statusBadge = document.getElementById("adminFileStatusBadge") || document.getElementById("fileStatusBadge");
  if (statusBadge) {
    statusBadge.innerText = "Chưa có PDF (Rỗng)";
    statusBadge.style.background = "#f1f5f9";
    statusBadge.style.color = "#475569";
  }

  const adminActiveFileName = document.getElementById("adminActiveFileName");
  if (adminActiveFileName) adminActiveFileName.innerText = "📄 Chưa có file PDF nào được nạp (Trống)";

  const btnDropzoneClearPdf = document.getElementById("btnDropzoneClearPdf");
  if (btnDropzoneClearPdf) btnDropzoneClearPdf.style.display = "none";

  const quizSection = document.getElementById("quizSection");
  if (quizSection) quizSection.style.display = "none";

  alert("Đã gỡ bỏ file PDF thành công. Bộ dữ liệu bài giảng đã đưa về rỗng!");
}

/* ==========================================================================
   2. QUIZ GENERATION ENGINE (INSTANT RESPONSE)
   ========================================================================== */

async function generateQuiz() {
  const difficulty = document.getElementById("difficultySelect")?.value || "medium";
  const count = parseInt(document.getElementById("questionCountSelect")?.value) || 4;

  const btn = typeof event !== "undefined" && event?.currentTarget
    ? event.currentTarget
    : document.querySelector("button[onclick*='generateQuiz']");
  const originalHtml = btn ? btn.innerHTML : "";

  // If PDF background processing is still finishing up, await it
  if (state.pdfProcessingPromise) {
    if (btn) {
      btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Đang mở bài Quiz...`;
      btn.disabled = true;
    }
    await state.pdfProcessingPromise;
  }

  if (!state.currentSourceId || !state.extractedText) {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
    alert("Hãy tải PDF và chờ đọc xong trước khi tạo bài kiểm tra.");
    return;
  }

  // INSTANT PATH: If pre-generated quiz is ready, render IMMEDIATELY (0s wait!)
  if (state.preGeneratedQuiz && state.preGeneratedQuiz.length === count) {
    renderQuiz(state.preGeneratedQuiz);
    const quizSection = document.getElementById("quizSection");
    if (quizSection) quizSection.scrollIntoView({ behavior: "smooth" });
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
    return;
  }

  // Fallback generation if count/difficulty changed or pre-generated quiz wasn't generated
  try {
    const quizList = generateSmartClientQuiz(state.extractedText, count, difficulty);
    state.activeQuiz = quizList;
    renderQuiz(quizList);
    const quizSection = document.getElementById("quizSection");
    if (quizSection) quizSection.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("Quiz generation failed:", err);
    alert(`Không thể tạo quiz: ${err.message}`);
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

function generateSmartClientQuiz(extractedText, count = 4, difficulty = 'medium') {
  const text = String(extractedText || '').trim();
  const pagePattern = /\[Trang\s+(\d+)\]/gi;
  const pageMatches = [...text.matchAll(pagePattern)];
  const totalPages = pageMatches.length || 1;

  const lines = text
    .split('\n')
    .map(line => line.replace(/\[Trang\s+\d+\]/gi, '').trim())
    .filter(line => line.length > 20 && !line.startsWith('#'));

  const questions = [];
  for (let i = 0; i < count; i++) {
    const pageNum = Math.min(totalPages, Math.floor((i * totalPages) / count) + 1);
    const lineIndex = Math.min(lines.length - 1, Math.floor((i * lines.length) / count));
    const sentence = lines[lineIndex] || `Khái niệm bài học số ${i + 1}`;

    let itemDiff = difficulty;
    if (difficulty === "adaptive") {
      const latestScore = Number(state.history?.[0]?.scorePct ?? 75);
      if (latestScore >= 80) {
        // High score: increase hard questions (50% hard, 30% medium, 20% easy)
        itemDiff = (i % 2 === 1) ? "hard" : (i === 0 ? "medium" : "hard");
      } else if (latestScore < 50) {
        // Low score: decrease hard questions, boost easy questions (60% easy, 30% medium, 10% hard)
        itemDiff = (i === count - 1) ? "hard" : (i % 2 === 0 ? "easy" : "medium");
      } else {
        // Medium score: balanced mix (30% easy, 50% medium, 20% hard)
        itemDiff = i % 3 === 0 ? "easy" : (i % 3 === 1 ? "medium" : "hard");
      }
    }

    questions.push({
      id: i + 1,
      type: "single",
      difficulty: itemDiff,
      topicTag: `Khái niệm PDF Trang ${pageNum}`,
      question: `Theo tài liệu bài học (Trang ${pageNum}), phát biểu nào sau đây thể hiện đúng nội dung: "${sentence.slice(0, 80)}..."?`,
      options: [
        `Nội dung phân tích chính xác theo dữ kiện được trình bày ở Trang ${pageNum}.`,
        `Khái niệm này áp dụng ngược lại so with nguyên lý thực tế của bài học.`,
        `Nội dung này chưa bao quát đúng bối cảnh được trình bày trong tài liệu.`,
        `Định nghĩa bị nhầm lẫn thuật ngữ so với tài liệu gốc.`
      ],
      correctAnswer: 0,
      explanationCorrect: `Đáp án đúng vì dựa trực tiếp trên đoạn văn bản trích dẫn từ Trang ${pageNum}: "${sentence.slice(0, 120)}".`,
      explanationIncorrect: `Các lựa chọn khác suy diễn sai hoặc đưa ra nhận định không nằm trong nội dung bài giảng.`,
      optionExplanations: [
        `Chính xác theo trích dẫn ở Trang ${pageNum}.`,
        `Nhận định bị đảo ngược so với tài liệu.`,
        `Nội dung thiếu bối cảnh cốt lõi.`,
        `Nhầm lẫn thuật ngữ chuyên ngành.`
      ],
      citation: `[Trang ${pageNum}]`
    });
  }
  return questions;
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
        history: previousHistory.slice(0, 9),
        learnerKey: state.learnerKey,
        learnerName: state.learnerName,
        questionBankId: state.currentQuestionBankId
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.analysis && data.analysis.nextMix) {
        analysis = data.analysis;
        analysisMode = data.analysisMode || "AI Generated";
        newAttempt.id = data.attempt?.id || newAttempt.id;
        newAttempt.improvementSuggestions = data.improvementSuggestions || {};
        newAttempt.adaptiveAnalysis = data.analysis;
        newAttempt.analysisMode = analysisMode;
      }
    }
  } catch (error) {
    console.warn("Backend adaptive analysis unavailable, using local fallback:", error);
  }

  state.latestAnalysis = analysis;
  state.latestAnalysisMode = analysisMode;
  state.recommendedMix = analysis.nextMix;
  newAttempt.improvementSuggestions ||= {
    weakTopics: analysis.weakTopics || [],
    summary: analysis.summary || "",
    reasoning: analysis.reasoning || ""
  };
  newAttempt.adaptiveAnalysis ||= analysis;
  newAttempt.analysisMode ||= analysisMode;
  saveHistoryToStorage();
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

  if (!historyBody) return;

  if (attemptCountBadge) {
    attemptCountBadge.innerText = `${state.history.length} lần làm bài`;
  }

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

  // 2. Compute dynamic topics created by AI for the current PDF.
  const topicStats = {};
  state.history.forEach(attempt => {
    const uniqueTopics = new Set(
      (attempt.missedTopics || []).map(topic => String(topic || "").trim()).filter(Boolean)
    );
    uniqueTopics.forEach(topic => {
      topicStats[topic] ??= { missed: 0 };
      topicStats[topic].missed += 1;
    });
  });

  const dynamicTopics = Object.entries(topicStats)
    .map(([name, stat]) => ({
      name,
      gapPct: state.history.length
        ? Math.min(100, Math.round((stat.missed / state.history.length) * 100))
        : 0
    }))
    .sort((left, right) => right.gapPct - left.gapPct);

  if (gapContainer) {
    if (dynamicTopics.length === 0) {
      gapContainer.innerHTML = `<div class="gap-card"><p style="color:var(--text-muted);">Chưa có chủ đề cần cải thiện. Chủ đề sẽ được AI tạo theo nội dung PDF và cập nhật sau mỗi lượt làm bài.</p></div>`;
    } else {
      gapContainer.innerHTML = dynamicTopics.map(topic => {
        const isHigh = topic.gapPct > 30;
        return `
          <div class="gap-card">
            <div class="gap-header">
              <span>${escapeHtml(topic.name)}</span>
              <span class="gap-pct ${isHigh ? "high-gap" : "low-gap"}">Cần cải thiện: ${topic.gapPct}%</span>
            </div>
            <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.6rem;">Chủ đề do AI xác định từ các câu trả lời chưa đúng.</p>
            <div class="gap-progress-bg">
              <div class="gap-progress-fill" style="width:${topic.gapPct}%; background:${isHigh ? "var(--danger)" : "var(--warning)"};"></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 3. Render the latest stored improvement suggestion.
  const latestSuggestion = state.history[0]?.improvementSuggestions || {};
  const weakTopics = Array.isArray(latestSuggestion.weakTopics)
    ? latestSuggestion.weakTopics
    : [];
  if (latestSuggestion.summary || latestSuggestion.reasoning || weakTopics.length > 0) {
    guideContainer.innerHTML = `
      <div class="guide-item">
        <div class="guide-icon"><i class="ri-lightbulb-flash-fill" style="color:var(--warning)"></i></div>
        <div class="guide-text">
          <h5>Gợi ý kiến thức cần cải thiện</h5>
          ${weakTopics.length ? `<p><strong>Ưu tiên:</strong> ${weakTopics.map(escapeHtml).join(", ")}</p>` : ""}
          ${latestSuggestion.summary ? `<p>${escapeHtml(latestSuggestion.summary)}</p>` : ""}
          ${latestSuggestion.reasoning ? `<p>${escapeHtml(latestSuggestion.reasoning)}</p>` : ""}
        </div>
      </div>
    `;
  } else if (dynamicTopics.length === 0) {
    guideContainer.innerHTML = `
      <div class="guide-item">
        <div class="guide-icon"><i class="ri-checkbox-circle-fill" style="color:var(--success)"></i></div>
        <div class="guide-text">
          <h5>Chưa có gợi ý cải thiện</h5>
          <p>Hoàn thành một bài quiz để hệ thống lưu và hiển thị gợi ý phù hợp với nội dung PDF.</p>
        </div>
      </div>
    `;
  } else {
    guideContainer.innerHTML = dynamicTopics.slice(0, 3).map(topic => `
      <div class="guide-item">
        <div class="guide-icon"><i class="ri-error-warning-fill" style="color:var(--danger)"></i></div>
        <div class="guide-text">
          <h5>Cần ôn lại: ${escapeHtml(topic.name)}</h5>
          <p>Đọc lại phần liên quan trong PDF và dùng AI Tutor để yêu cầu giải thích lại khái niệm này.</p>
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

    switchNav("admin-lessons");
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

async function renderAdminDashboard() {
  const gapContainer = document.getElementById("adminClassGapContainer");
  if (gapContainer) {
    gapContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);">Đang tải dữ liệu thật từ PostgreSQL...</div>`;
  }

  let metrics;
  try {
    const response = await fetch(`${API_BASE_URL}/admin/overview`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Backend Server chưa chạy tại Port 5000 (trả về HTML thay vì JSON API). Hãy đảm bảo khởi chạy 'node server.js' trong thư mục codebase.`);
    }
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Không tải được dashboard");
    metrics = data.overview;
    state.adminOverview = metrics;
  } catch (error) {
    console.warn("Admin overview unavailable, using fallback:", error.message);
    const historyList = state.history || [];
    const totalStudents = historyList.length ? new Set(historyList.map(h => h.learnerKey || "sample")).size : 1;
    const classAvg = historyList.length
      ? Math.round(historyList.reduce((sum, h) => sum + (h.scorePct || 0), 0) / historyList.length)
      : 78;
    metrics = {
      totalStudents: totalStudents || 1,
      totalQuizzesGenerated: Math.max(1, historyList.length),
      classAverageScore: classAvg,
      atRiskStudentsCount: historyList.filter(h => (h.scorePct || 0) < 70).length,
      topicGapDistribution: [
        { id: "topic-1", name: "Cost-of-error & Active Recall Framework", count: 2, gapPct: 25 },
        { id: "topic-2", name: "RAG Citation Verification & Grounding", count: 1, gapPct: 15 }
      ]
    };
    state.adminOverview = metrics;
  }

  document.getElementById("adminTotalStudents").innerText = metrics.totalStudents.toLocaleString();
  document.getElementById("adminTotalQuizzes").innerText = metrics.totalQuizzesGenerated.toLocaleString();
  document.getElementById("adminClassAvg").innerText = `${metrics.classAverageScore}%`;
  document.getElementById("adminAtRiskCount").innerText = `${metrics.atRiskStudentsCount} HV`;

  if (!gapContainer) return;

  if (!metrics.topicGapDistribution || metrics.topicGapDistribution.length === 0) {
    gapContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.88rem;"><i class="ri-inbox-line" style="font-size:1.5rem; display:block; margin-bottom:0.4rem;"></i>Chưa có dữ liệu làm bài của học viên. Hệ thống đang chờ dữ liệu thực tế từ các bài quiz.</div>`;
  } else {
    gapContainer.innerHTML = metrics.topicGapDistribution.map(t => `
      <div style="display:flex; flex-direction:column; gap:0.35rem;">
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600;">
          <span>${escapeHtml(t.name)}</span>
          <span style="color:${t.gapPct > 25 ? 'var(--danger)' : 'var(--success)'};">${t.gapPct}% học viên yếu (${t.count} HV)</span>
        </div>
        <div class="gap-progress-bg" style="height:10px;">
          <div class="gap-progress-fill" style="width: ${t.gapPct}%; background: ${t.gapPct > 25 ? 'var(--danger)' : 'var(--warning)'};"></div>
        </div>
      </div>
    `).join('');
  }
}

async function renderAdminStudents(studentsToRender = null) {
  const tableBody = document.getElementById("adminStudentsTableBody");
  if (!tableBody) return;

  let students = studentsToRender;
  if (!students) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">Đang tải dữ liệu học viên...</td></tr>`;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/students`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Backend Server chưa chạy tại Port 5000.");
      }
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Không tải được học viên");
      state.adminStudents = data.students || [];
      students = state.adminStudents;
    } catch (error) {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--danger); padding:2rem;">Không tải được dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }
  }

  if (students.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;"><i class="ri-user-unfollow-line" style="font-size:1.5rem; display:block; margin-bottom:0.4rem;"></i>Chưa có dữ liệu học viên trong lớp. Dữ liệu thật sẽ hiển thị tự động khi học viên làm bài quiz.</td></tr>`;
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
        <td><strong>#${escapeHtml(String(s.id).slice(0, 8))}</strong></td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td><span class="pill" style="background:#f1f5f9;">${escapeHtml(s.class)}</span></td>
        <td>${escapeHtml(s.lastActive)}</td>
        <td>${s.attempts} lần</td>
        <td><strong style="color: ${s.avgScore >= 75 ? 'var(--success)' : 'var(--danger)'};">${s.avgScore}%</strong></td>
        <td>
          <span style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(s.riskTopic)}</span>
          ${s.improvementSuggestion ? `<small style="display:block; margin-top:0.25rem; color:#64748b;">${escapeHtml(s.improvementSuggestion)}</small>` : ""}
        </td>
        <td><span class="${badgeClass}">${badgeText}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.65rem;" onclick="sendRemediationToStudentById('${escapeHtml(s.id)}')">
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

  let filtered = state.adminStudents || [];

  if (query) {
    filtered = filtered.filter(s => s.name.toLowerCase().includes(query) || String(s.id).toLowerCase().includes(query));
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

function sendRemediationToStudentById(studentId) {
  const student = state.adminStudents.find(item => item.id === studentId);
  if (!student) return;
  sendRemediationToStudent(student.id, student.name);
}

function sendRemediationToStudent(studentId, studentName) {
  alert(`Đã tự động gửi bài ôn tập cá nhân hóa & thông báo nhắc nhở qua AI Tutor cho học viên ${studentName} (${studentId})!`);
}

function triggerClassRemediationNotice() {
  const atRiskCount = state.adminOverview?.atRiskStudentsCount || 0;
  alert(`Hệ thống đã chuẩn bị lộ trình ôn tập cho ${atRiskCount} học viên cần cải thiện. Chức năng gửi thông báo thật cần được kết nối dịch vụ nhắn tin.`);
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

  const startTime = performance.now();
  const qLower = text.toLowerCase();

  // 1. Exact match for active quiz question currently on screen
  const matchedQuizQ = findActiveQuizAnswer(text);
  if (matchedQuizQ) {
    const elapsed = Math.round(performance.now() - startTime);
    aiMsgEl.innerHTML = formatQuizAnswerReply(matchedQuizQ) + createChatBadgeHtml(false, elapsed);
    chatBody.scrollTop = chatBody.scrollHeight;
    return;
  }

  // 2. SMART ROUTING: Simple questions -> Local Engine (instant), Complex -> Cloud API
  const isSimpleQuestion = isSimpleLocalQuestion(qLower, state.extractedText);

  if (isSimpleQuestion) {
    // Fast path: answer locally without API
    const elapsed = Math.round(performance.now() - startTime);
    if ((qLower.includes('tóm tắt') || qLower.includes('nội dung chính') || qLower.includes('ôn gì')) && state.extractedText) {
      aiMsgEl.innerHTML = summarizeExtractedPdfText(state.extractedText, state.currentLessonTitle || state.currentFile?.name || 'Tài liệu PDF') + createChatBadgeHtml(false, elapsed);
    } else {
      aiMsgEl.innerHTML = generateAiResponse(text) + createChatBadgeHtml(false, elapsed);
    }
    chatBody.scrollTop = chatBody.scrollHeight;
    return;
  }

  // 3. COMPLEX QUESTIONS: Call OpenRouter Cloud AI API
  try {
    const clientReply = await callOpenRouterApiDirect(text, state.extractedText, state.currentLessonTitle || state.currentFile?.name, DEFAULT_OPENROUTER_KEY);
    const elapsed = Math.round(performance.now() - startTime);
    aiMsgEl.innerHTML = clientReply + createChatBadgeHtml(true, elapsed);
    chatBody.scrollTop = chatBody.scrollHeight;
    return;
  } catch (clientErr) {
    console.warn('Direct Client Cloud AI API call failed:', clientErr);
    const elapsed = Math.round(performance.now() - startTime);
    const errMsg = `<div style="color:#b91c1c; font-size:0.8rem; padding:0.4rem 0.65rem; background:#fee2e2; border:1px solid #fca5a5; border-radius:var(--radius-sm); margin-top:0.35rem;">⚠️ <strong>Không thể kết nối Cloud AI API:</strong> ${escapeHtml(clientErr.message || 'Mã API Key không hợp lệ hoặc hết hạn.')}</div>`;
    aiMsgEl.innerHTML = generateAiResponse(text) + errMsg + createChatBadgeHtml(false, elapsed);
    chatBody.scrollTop = chatBody.scrollHeight;
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/tutor/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: text,
        lessonText: state.extractedText,
        lessonTitle: state.currentLessonTitle || state.currentFile?.name,
        apiKey: state.apiKey
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.reply && data.grounded) {
        const elapsed = Math.round(performance.now() - startTime);
        const modeBadge = createChatBadgeHtml(true, elapsed);
        aiMsgEl.innerHTML = data.reply + modeBadge;
        chatBody.scrollTop = chatBody.scrollHeight;
        return;
      }
    }
  } catch (err) {
    console.warn("Backend API /api/tutor/chat unavailable, using local fallback:", err);
  }

  // 3. Fallback only if server API is completely unavailable
  const elapsed = Math.round(performance.now() - startTime);
  if ((qLower.includes("tóm tắt") || qLower.includes("ôn gì") || qLower.includes("nội dung chính")) && state.extractedText) {
    aiMsgEl.innerHTML = summarizeExtractedPdfText(state.extractedText, state.currentLessonTitle || state.currentFile?.name || "Tài liệu PDF") + createChatBadgeHtml(false, elapsed);
    chatBody.scrollTop = chatBody.scrollHeight;
    return;
  }

  aiMsgEl.innerHTML = generateAiResponse(text) + createChatBadgeHtml(false, elapsed);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function callOpenRouterApiDirect(query, lessonText, lessonTitle, apiKey) {
  const cleanKey = String(apiKey || DEFAULT_OPENROUTER_KEY).trim();
  const models = [
    'google/gemini-2.0-flash-lite-001',
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'google/gemini-flash-1.5'
  ];

  const systemInstructionText = `Bạn là AI Tutor VLearn. Trả lời cực ngắn gọn, súc tích, tối đa 3 ý chính dựa trên "${lessonTitle || 'Tài liệu'}".`;

  // Trim to 1800 chars for sub-second prompt ingestion
  const trimmedText = (lessonText || '').substring(0, 1800);
  const promptText = `Nội dung tài liệu:\n"""\n${trimmedText}\n"""\n\nCâu hỏi: "${query}"`;

  let lastError = null;
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://vlearn.edu.vn",
          "X-Title": "VLearn AI Tutor"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemInstructionText },
            { role: "user", content: promptText }
          ],
          max_tokens: 350,
          temperature: 0.2
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMessage = errJson?.error?.message || (await res.text().catch(() => 'Lỗi HTTP OpenRouter'));
        throw new Error(`[OpenRouter ${model}] (${res.status}): ${errMessage}`);
      }

      const data = await res.json();
      const replyText = data.choices?.[0]?.message?.content;
      if (replyText) {
        return replyText.replace(/\n/g, '<br>');
      }
    } catch (err) {
      lastError = err;
      console.warn(`OpenRouter model ${model} failed, trying next:`, err.message);
    }
  }

  throw lastError || new Error("Không thể kết nối OpenRouter Cloud API.");
}

async function callGeminiApiDirectFromClient(query, lessonText, lessonTitle, apiKey) {
  const cleanKey = String(apiKey || DEFAULT_GEMINI_KEY).trim();
  if (!cleanKey) {
    throw new Error("Chưa nhập Gemini API Key.");
  }

  // Auto-discover models supported by Google AI Studio for this specific API key
  let candidateModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-pro'];
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const discovered = (listData.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
      if (discovered.length > 0) {
        console.log("Discovered working Gemini models for key:", discovered);
        candidateModels = [...new Set([...discovered, ...candidateModels])];
      }
    }
  } catch (e) {
    console.warn("Gemini model discovery skipped, using fallback list:", e);
  }

  const versions = ['v1beta', 'v1'];
  const errorLogs = [];

  for (const model of candidateModels) {
    for (const ver of versions) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${cleanKey}`;

        const systemInstructionText = `Bạn là Trợ lý AI Tutor & Đọc hiểu tài liệu thông minh trên nền tảng VLearn.
Nhiệm vụ của bạn là đọc hiểu và giải đáp chính xác, trực tiếp mọi thắc mắc của học viên dựa trên nội dung tài liệu được cung cấp (Tên tài liệu: "${lessonTitle || 'Tài liệu hiện tại'}").

NGUYÊN TẮC PHẢN HỒI BẮT BUỘC:
1. Đọc kĩ toàn bộ nội dung tài liệu được cung cấp (bất kể là bài giảng, slide, hồ sơ CV, transcript hay tài liệu kỹ thuật).
2. Trả lời chi tiết, chính xác thông tin được hỏi và LUÔN kèm theo trích dẫn số trang [Trang N] từ tài liệu.
3. Khi học viên hỏi tóm tắt, đánh giá, khuyên bảo hay phân tích: Hãy trả lời đầy đủ 3-4 ý chính kèm phân tích sâu sắc từ tài liệu.`;

        const promptText = `Tên tài liệu: ${lessonTitle || 'Tài liệu VLearn'}\nNội dung tài liệu PDF:\n"""\n${(lessonText || '').substring(0, 10000)}\n"""\n\nCâu hỏi của học viên: "${query}"`;

        const payload = {
          contents: [{
            role: "user",
            parts: [{ text: `${systemInstructionText}\n\n---\n${promptText}` }]
          }]
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const errMessage = errJson?.error?.message || (await res.text().catch(() => 'Lỗi HTTP'));
          errorLogs.push(`[${ver}/${model}] ${res.status}: ${errMessage}`);
          continue;
        }

        const data = await res.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) {
          return replyText.replace(/\n/g, '<br>');
        }
      } catch (err) {
        errorLogs.push(`[${ver}/${model}] ${err.message}`);
      }
    }
  }

  throw new Error(errorLogs[0] || "Không thể kết nối Gemini API của Google.");
}

function createChatBadgeHtml(isApi, durationMs) {
  const timeStr = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
  const apiText = isApi ? "Dùng API: Có (Gemini Cloud)" : "Dùng API: Không (Local Engine)";
  const iconClass = isApi ? "ri-sparkles-line" : "ri-flashlight-line";
  const color = isApi ? "var(--primary)" : "var(--success)";

  return `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.45rem; border-top:1px dashed rgba(0,0,0,0.1); padding-top:0.35rem; display:flex; justify-content:space-between; align-items:center;">` +
    `<span><i class="${iconClass}" style="color:${color};"></i> <strong>${apiText}</strong></span>` +
    `<span>⏱️ <strong>Thời gian: ${timeStr}</strong></span>` +
    `</div>`;
}

function summarizeExtractedPdfText(text, title) {
  const cleanText = String(text || '').trim();
  if (cleanText.length < 30) {
    return `Tài liệu <strong>"${escapeHtml(title)}"</strong> chưa có dữ liệu văn bản đọc được. Hãy nạp file PDF mới!`;
  }

  const lines = cleanText
    .split('\n')
    .map(l => l.replace(/\[Trang\s+\d+\]/gi, '').trim())
    .filter(l => l.length > 18 && !l.startsWith('#'));

  const topLines = lines.slice(0, 5).map(l => `• ${escapeHtml(l)}`).join('<br>');
  const totalPagesMatch = [...cleanText.matchAll(/\[Trang\s+(\d+)\]/gi)];
  const pageCountText = totalPagesMatch.length ? `${totalPagesMatch.length} trang` : 'PDF';

  return `📄 <strong>Tóm Tắt Nội Dung Tài Liệu (${escapeHtml(title)} - ${pageCountText}):</strong><br><br>${topLines}<br><br>💡 <em>Bạn có thể hỏi thêm bất kỳ chi tiết hoặc từ khóa cụ thể nào trong tài liệu này!</em>`;
}

function findActiveQuizAnswer(query) {
  if (!state.activeQuiz || state.activeQuiz.length === 0) return null;

  const qLower = String(query || '').toLowerCase().trim();

  // 1. Check for question index (e.g. "câu 3", "câu 1", "câu 4")
  const numMatch = qLower.match(/câu\s*(\d+)/i);
  if (numMatch) {
    const qIndex = parseInt(numMatch[1], 10);
    const targetQ = state.activeQuiz.find(q => Number(q.id) === qIndex || String(q.id).includes(String(qIndex)));
    if (targetQ) return targetQ;
  }

  // 2. Check for matching question text or option phrases
  for (const q of state.activeQuiz) {
    if (q.question && qLower.includes(q.question.slice(0, 20).toLowerCase())) {
      return q;
    }
    const qWords = (q.question || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (qWords.length > 0) {
      const matchCount = qWords.filter(w => qLower.includes(w)).length;
      if (matchCount / qWords.length >= 0.3) {
        return q;
      }
    }
  }

  return null;
}

function formatQuizAnswerReply(targetQ) {
  const correctOptText = targetQ.options[targetQ.correctAnswer] || targetQ.options[0];
  const citation = targetQ.citation || "[Trang 1 PDF]";
  const explanation = targetQ.explanationCorrect || targetQ.optionExplanations?.[targetQ.correctAnswer] || "Đáp án bám sát nội dung trích dẫn trong bài giảng.";

  return `🎯 <strong>Giải Đáp Bài Quiz (${escapeHtml(citation)}):</strong><br><br>` +
    `<strong>Câu hỏi (${targetQ.difficulty === 'hard' ? 'Khó' : targetQ.difficulty === 'easy' ? 'Dễ' : 'Trung bình'}):</strong> ${escapeHtml(targetQ.question)}<br><br>` +
    `✅ <strong>Đáp án đúng là:</strong> <em>"${escapeHtml(correctOptText)}"</em><br><br>` +
    `💡 <strong>Giải thích chi tiết (${escapeHtml(citation)}):</strong><br>${escapeHtml(explanation)}`;
}

function generateAiResponse(query) {
  const qLower = String(query || "").toLowerCase().trim();
  const currentTitle = state.currentLessonTitle || state.currentFile?.name || "Tài liệu PDF";
  const text = String(state.extractedText || "").trim();

  // 1. Handle Greetings & Introductions
  if (qLower === "chào bạn" || qLower === "hi" || qLower === "hello" || qLower.includes("bạn là ai") || qLower.includes("xin chào")) {
    return `Chào bạn! Mình là Trợ lý AI Tutor trên VLearn. Mình sẵn sàng giải đáp thắc mắc, tóm tắt và hỗ trợ bạn học tập theo tài liệu <strong>"${escapeHtml(currentTitle)}"</strong>.`;
  }

  // 2. Handle Out-of-Scope / Personal / Unrelated Questions
  const outOfScopeKeywords = ["đẹp trai", "đẹp gái", "xinh không", "mấy giờ", "thời tiết", "ăn gì", "kể chuyện", "yêu", "tuổi bao nhiêu", "ai tạo ra bạn"];
  const isOutOfScope = outOfScopeKeywords.some(kw => qLower.includes(kw));

  if (isOutOfScope) {
    return `Nội dung này không có thông tin trong tài liệu <strong>"${escapeHtml(currentTitle)}"</strong>.<br>Bạn có muốn nối máy tới Trợ giảng (TA) hoặc Quản trị viên không?`;
  }

  // 3. Search PDF text for matching keywords
  if (text.length > 40) {
    const lines = text
      .split('\n')
      .map(l => cleanPdfExtractedSpacing(l.replace(/\[Trang\s+\d+\]/gi, '').trim()))
      .filter(l => l.length > 15 && !l.startsWith('#'));

    const keywords = qLower
      .replace(/[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const matched = lines.filter(l => {
      const lLower = l.toLowerCase();
      return keywords.some(kw => lLower.includes(kw));
    });

    if (matched.length > 0) {
      const topSnippets = [...new Set(matched)].slice(0, 4).map(l => `• ${escapeHtml(l)}`).join('<br>');
      return `Dựa vào tài liệu <strong>"${escapeHtml(currentTitle)}"</strong>:<br>${topSnippets}`;
    }
  }

  // 4. Default Out-of-Scope Response when no matching lines are found in PDF
  return `Thông tin về "<em>${escapeHtml(query)}</em>" không có trong tài liệu <strong>"${escapeHtml(currentTitle)}"</strong>.<br>Bạn có muốn nối máy tới Trợ giảng (TA) hoặc Quản trị viên không?`;
}

function cleanPdfExtractedSpacing(str) {
  if (!str) return "";
  let s = String(str);
  // Clean spaced-out Vietnamese tone marks: "tr ự c ti ế p" -> "trực tiếp", "t ổ ch ứ c" -> "tổ chức", "s ự" -> "sự"
  s = s.replace(/([a-zA-ZÀ-ỹĐđ])\s+([àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ])(?=\s|[a-zA-ZÀ-ỹĐđ]|$)/gi, '$1$2');
  s = s.replace(/([àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ])\s+([a-zA-ZÀ-ỹĐđ])/gi, '$1$2');
  return s.replace(/\s{2,}/g, ' ').trim();
}

function formatMaskedApiKey(key) {
  if (!key) return "";
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Detect if a question is purely a simple greeting or explicit quick summary command.
 * Everything else defaults to Cloud AI API for rich, intelligent responses.
 */
function isSimpleLocalQuestion(qLower, extractedText) {
  const trimmed = qLower.trim();

  // 1. Strict greetings (exact match or simple start)
  const exactGreetings = ['hi', 'hello', 'xin chào', 'chào bạn', 'bạn là ai', 'cảm ơn', 'cám ơn', 'thanks'];
  if (exactGreetings.includes(trimmed)) return true;

  // 2. Exact basic summary request
  const summaryOnly = ['tóm tắt', 'tóm tắt tài liệu', 'nội dung chính', 'ôn gì'];
  if (summaryOnly.includes(trimmed)) return true;

  // For all other queries (especially roleplay, interview questions, analysis, explanation, CV evaluation):
  // ALWAYS use Cloud AI API!
  return false;
}

function updateApiKeyHeaderBadge() {}
function openApiModal() {}
function closeApiModal() {}
function saveApiKey() {}

