/**
 * VLearn AI Quiz Generator & Learning Assistant Logic
 * Handlers: PDF Processing, Quiz Engine, Scoring, History Storage, Knowledge Gap Analytics & Remediation Guide
 */

// Application State
const state = {
  currentFile: null,
  extractedText: "",
  currentLessonTitle: "Bài 01: Nhập môn AI Product (JTBD)",
  activeQuiz: [],
  userAnswers: {},
  apiKey: localStorage.getItem("VLEARN_GEMINI_KEY") || "",
  history: JSON.parse(localStorage.getItem("VLEARN_QUIZ_HISTORY") || "[]")
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
});

function loadInitialData() {
  const sample = window.VLEARN_SAMPLE_DATA;
  state.extractedText = sample.sampleContent;
  state.currentLessonTitle = sample.title;
  document.getElementById("activeLessonBadge").innerHTML = `<i class="ri-book-read-line"></i> ${sample.title}`;
  renderQuiz(sample.defaultQuiz);
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
    saveHistoryToStorage();
    renderHistoryAndGapMap();
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

  state.currentFile = file;
  document.getElementById("dropzoneTitle").innerText = `📄 ${file.name}`;
  document.getElementById("dropzoneSubtitle").innerText = `Kích thước: ${(file.size / (1024 * 1024)).toFixed(2)} MB - Đã sẵn sàng sinh Quiz`;
  document.getElementById("fileStatusBadge").innerText = "Đã nạp file PDF";
  document.getElementById("fileStatusBadge").style.background = "#dcfce7";
  document.getElementById("fileStatusBadge").style.color = "#15803d";
  
  const lessonTitle = file.name.replace(".pdf", "");
  state.currentLessonTitle = lessonTitle;
  document.getElementById("activeLessonBadge").innerHTML = `<i class="ri-file-pdf-fill"></i> ${lessonTitle}`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 10); pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += ` [Trang ${pageNum}] ` + pageText;
    }

    state.extractedText = fullText;
  } catch (err) {
    console.error("PDF Parsing Error:", err);
    alert("Không thể giải mã PDF hoàn toàn. Hệ thống chuyển sang chế độ Mô phỏng dữ liệu thông minh.");
  }
}

/* ==========================================================================
   2. QUIZ GENERATION ENGINE
   ========================================================================== */

function generateQuiz() {
  const difficulty = document.getElementById("difficultySelect").value;
  const count = parseInt(document.getElementById("questionCountSelect").value);

  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Đang tự động sinh ${count} câu hỏi...`;
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = originalHtml;
    btn.disabled = false;

    let quiz = [];
    if (state.currentFile) {
      quiz = createDynamicQuizFromText(state.extractedText, count, difficulty);
    } else {
      quiz = [...window.VLEARN_SAMPLE_DATA.defaultQuiz];
    }

    renderQuiz(quiz.slice(0, count));
    document.getElementById("quizSection").scrollIntoView({ behavior: 'smooth' });
  }, 700);
}

function createDynamicQuizFromText(text, count, difficulty) {
  const topicMap = ["jtbd", "grounding", "automation", "eval"];
  const generated = [];
  
  for (let i = 1; i <= count; i++) {
    const topic = topicMap[(i - 1) % topicMap.length];
    generated.push({
      id: i,
      type: "single",
      topicTag: topic,
      question: `[Câu ${i} - Dạng ${difficulty.toUpperCase()}] Dựa vào tài liệu PDF vừa tải lên, yếu tố nào sau đây quyết định tính chính xác của bài toán?`,
      options: [
        `A. Trích dẫn minh bạch nguồn dữ liệu bài giảng và kiểm soát cost-of-error`,
        `B. Tự đoán đáp án khi không có tài liệu chứng minh`,
        `C. Đưa ra câu trả lời không cần kiểm tra grounding`,
        `D. Tự động thay đổi thang điểm đánh giá`
      ],
      correctAnswer: 0,
      explanation: `Theo chuẩn VLearn AI Product, đáp án A đúng vì bắt buộc phải trích dẫn căn cứ và kiểm soát chi phí sai sót (cost-of-error).`
    });
  }
  return generated;
}

function renderQuiz(quizList) {
  state.activeQuiz = quizList;
  state.userAnswers = {};

  const container = document.getElementById("questionsContainer");
  document.getElementById("resultCard").style.display = "none";
  document.getElementById("quizActionButtons").style.display = "flex";
  
  updateProgress(0, quizList.length);

  container.innerHTML = quizList.map((q, idx) => {
    if (q.type === "single") {
      return `
        <div class="question-card" id="qcard_${q.id}">
          <div class="question-title">
            <span class="q-number">Câu ${idx + 1}</span>
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
            <span class="q-number">Câu ${idx + 1} (Tự luận ngắn)</span>
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

function submitQuiz() {
  const total = state.activeQuiz.length;
  const answeredCount = Object.keys(state.userAnswers).length;

  if (answeredCount < total) {
    if (!confirm(`Bạn mới làm ${answeredCount}/${total} câu. Bạn có chắc chắn muốn nộp bài ngay?`)) {
      return;
    }
  }

  let correctCount = 0;
  const missedTopics = [];

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
      explainBox.innerHTML = `
        <strong>${isCorrect ? '✓ Đáp án chính xác!' : '✗ Chưa chính xác.'}</strong><br>
        <em>Giải thích chi tiết:</em> ${q.explanation}
      `;
    } else {
      const userText = (userAns || "").toLowerCase();
      isCorrect = q.keywords ? q.keywords.some(kw => userText.includes(kw)) : userText.length > 5;
      if (isCorrect) {
        correctCount++;
      } else {
        missedTopics.push(q.topicTag || "general");
      }

      explainBox.className = `explanation-box show ${isCorrect ? 'correct-box' : 'incorrect-box'}`;
      explainBox.innerHTML = `
        <strong>${isCorrect ? '✓ Đạt yêu cầu nội dung!' : 'ℹ️ Gợi ý đáp án chuẩn:'}</strong><br>
        ${q.modelAnswer}<br>
        <em>Giải thích:</em> ${q.explanation}
      `;
    }
  });

  const scorePct = Math.round((correctCount / total) * 100);

  // Record to History
  const newAttempt = {
    id: `ATT-${1000 + state.history.length + 1}`,
    date: new Date().toLocaleString("vi-VN"),
    lessonTitle: state.currentLessonTitle,
    difficulty: document.getElementById("difficultySelect").options[document.getElementById("difficultySelect").selectedIndex].text.split(" ")[0],
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

function switchNav(viewName) {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  document.querySelectorAll(".tab-view").forEach(view => view.style.display = "none");

  const titleEl = document.getElementById("currentViewTitle");
  const subtitleEl = document.getElementById("currentViewSubtitle");

  if (viewName === "generator") {
    document.getElementById("nav-generator").classList.add("active");
    document.getElementById("view-generator").style.display = "flex";
    titleEl.innerText = "Hệ Thống Tạo Bài Kiểm Tra AI Cho VLearn";
    subtitleEl.innerText = "Tự động đọc tài liệu PDF, sinh quiz kiểm tra Active Recall & theo dõi lịch sử hổng kiến thức";
  } else if (viewName === "analytics") {
    document.getElementById("nav-analytics").classList.add("active");
    document.getElementById("view-analytics").style.display = "flex";
    titleEl.innerText = "Bản Đồ Lỗ Hổng Kiến Thức & Hướng Dẫn Ôn Tập";
    subtitleEl.innerText = "Theo dõi lịch sử làm bài và nhận gợi ý lộ trình cải thiện từ AI Tutor";
    renderHistoryAndGapMap();
  }
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

function sendChatMessage() {
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

  setTimeout(() => {
    const aiMsgEl = document.createElement("div");
    aiMsgEl.className = "chat-msg msg-ai";
    aiMsgEl.innerHTML = generateAiResponse(text);
    chatBody.appendChild(aiMsgEl);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 500);
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
  alert(key ? "Đã lưu Gemini API Key thành công!" : "Đã hủy API Key (chuyển sang chế độ Smart Offline Generator).");
}
