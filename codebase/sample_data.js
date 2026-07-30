/**
 * Sample Lesson Data & Pre-built Quiz Scenarios for VLearn AI Quiz Generator
 * Data sourced & formatted from VLearn Hackathon Data Pack
 */

window.VLEARN_SAMPLE_DATA = {
  title: "Bài 01: Nhập môn AI Product & Xác định Bài toán (JTBD)",
  module: "Khóa học AI Thực Chiến - Module 1",
  duration: "45 phút",
  author: "VLearn Academic Team",
  summary: [
    "Khóa học tập trung vào tư duy sản phẩm AI: SPEC -> Prototype -> Demo.",
    "Phương pháp JTBD (Jobs-To-Be-Done): Xác định rõ Who (Ai), What (Việc gì), Failure of current alternatives (Thất bại của giải pháp hiện tại).",
    "4 Lớp chỗ khó trong thiết kế AI Product: Nguồn sự thật, Mơ hồ/Thiếu thông tin, Ngoài thẩm quyền, Đặc thù Domain.",
    "Lát cắt sản phẩm (One-line slice): 1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả."
  ],
  keyConcepts: [
    { term: "JTBD (Jobs-To-Be-Done)", desc: "Khung tư duy xác định nhu cầu cốt lõi của người dùng độc lập với giải pháp công nghệ." },
    { term: "Golden Set", desc: "Tập hợp các trường hợp kiểm thử (ít nhất 20 case) dùng để đo lường chất lượng hệ thống AI." },
    { term: "Cost-of-error", desc: "Chi phí xảy ra sai sót khi AI ra quyết định, dùng để chọn mức độ Automation (Augment vs Automate)." },
    { term: "Grounding / Source of Truth", desc: "Đảm bảo câu trả lời của AI Tutor luôn có căn cứ trích dẫn rõ ràng từ tài liệu gốc [trang N]." }
  ],
  sampleContent: `HỆ THỐNG BÀI GIẢNG VLEARN - CHỦ ĐỀ: XÁC ĐỊNH BÀI TOÁN SẢN PHẨM AI

1. Khái niệm cốt lõi:
Một sản phẩm AI tốt không bắt đầu từ mô hình LLM mạnh nhất, mà bắt đầu từ một bài toán thật có bằng chứng (Evidence).
Công thức lát cắt sản phẩm 1 câu: [1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả].

2. Bốn lớp chỗ khó (Taxonomy):
- Nguồn sự thật: AI bịa thông tin khi thiếu căn cứ. Giải pháp: RAG bắt buộc trích dẫn [trang N], không có căn cứ thì từ chối.
- Mơ hồ / Thiếu thông tin: Học viên hỏi câu ngắn ("cái này là sao?"). Giải pháp: Hỏi lại để làm rõ thay vì đoán liều.
- Ngoài thẩm quyền: Học viên yêu cầu sửa điểm hoặc hỏi đáp án quiz. Giải pháp: Từ chối lịch sự và hướng dẫn quy trình chuẩn.
- Đặc thù Domain: Cung cấp sai deadline hoặc kiến thức chuyên môn làm học viên mất điểm. Giải pháp: Chỉ dùng dữ liệu đã qua xác minh.

3. Đánh giá và Đo lường (Evaluation):
Xây dựng Golden set tối thiểu 20 cases phủ đủ các đường đi trải nghiệm (Happy path, Low confidence, Graceful failure).
Định nghĩa Quality Bar rõ ràng (ví dụ: đạt >= 85% qua bộ kiểm thử).`,

  defaultQuiz: [
    {
      id: 1,
      type: "single",
      question: "Theo khung tư duy VLearn, công thức chuẩn cho 'Lát cắt sản phẩm một câu' bao gồm những yếu tố nào?",
      options: [
        "A. 1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả",
        "B. 1 giao diện · 1 model LLM · 1 prompt · 1 API key",
        "C. 1 ý tưởng · 1 tính năng · 1 thuật toán · 1 doanh thu",
        "D. 1 bài toán · 1 dữ liệu · 1 mô hình · 1 báo cáo"
      ],
      correctAnswer: 0,
      explanation: "Công thức lát cắt chuẩn ghi rõ trong tài liệu là: 1 người dùng · 1 công việc · 1 quyết định AI · 1 kết quả. Giúp khoanh vùng phạm vi vừa đủ để demo trong sự kiện."
    },
    {
      id: 2,
      type: "single",
      question: "Khi AI Tutor đối mặt với lớp chỗ khó 'Nguồn sự thật' (Thiếu căn cứ trong tài liệu), hành vi nào sau đây là chuẩn mực?",
      options: [
        "A. Tự sáng tạo câu trả lời hay nhất dựa vào kiến thức chung của LLM",
        "B. Thành thật thông báo không có căn cứ trong tài liệu và gợi ý câu hỏi liên quan hoặc chuyển cho TA",
        "C. Đoán ngẫu nhiên một trang tài liệu để trích dẫn",
        "D. Im lặng không phản hồi"
      ],
      correctAnswer: 1,
      explanation: "Đối với lớp chỗ khó 'Nguồn sự thật', AI tuyệt đối không bịa thông tin (hallucination). Khi không có dữ liệu trích dẫn, AI phải biết từ chối minh bạch."
    },
    {
      id: 3,
      type: "single",
      question: "Vì sao việc chọn mức độ Automation (Augment vs Automate) phải dựa trên 'Cost-of-error'?",
      options: [
        "A. Vì chi phí gọi API của Automate đắt hơn Augment",
        "B. Vì nếu sai sót gây hậu quả nghiêm trọng (Cost-of-error cao), cần giữ con người (User/TA) ở vị trí duyệt quyết định",
        "C. Vì Augment chạy nhanh hơn Automate",
        "D. Vì người dùng không thích các tính năng tự động"
      ],
      correctAnswer: 1,
      explanation: "Cost-of-error là chi phí / hậu quả khi AI ra quyết định sai. Nếu chi phí lỗi cao (như sai điểm số hay kiến thức), chọn Augment để người dùng làm chủ."
    },
    {
      id: 4,
      type: "short_answer",
      question: "Yếu tố nào giúp người chấm điểm đánh giá tính trung thực của kết quả đo lường trong bài thi Hackathon?",
      keywords: ["golden set", "trung thực", "phần trăm", "log", "chất lượng"],
      modelAnswer: "Ghi nhận trung thực kết quả chạy trọn bộ Golden Set (kể cả các case chưa đạt), kèm bảng phần trăm đối chiếu với Quality Bar đã cam kết.",
      explanation: "Theo Rubric R4, kết quả đo cần ghi nhận trung thực (dù chưa đạt Quality bar vẫn tính điểm). Báo cáo số liệu chỉnh sửa sẽ bị 0 điểm."
    }
  ],

  // Admin Workspace Data Models (Để về 0 cho dữ liệu thật)
  adminMetrics: {
    totalStudents: 0,
    totalQuizzesGenerated: 0,
    classAverageScore: 0,
    atRiskStudentsCount: 0,
    topicGapDistribution: []
  },

  studentsList: [],

  guardrails: {
    strictGrounding: true,
    requirePageCitation: true,
    refuseOutOfScope: true,
    automationLevel: "augment",
    temperature: 0.2,
    hallucinationThreshold: 0.85,
    systemPrompt: `You are VLearn Active Recall Quiz Generator. Always generate questions grounded STRICTLY in the provided PDF material. Every correct answer explanation MUST cite exact page numbers [Trang N] or sections.`
  }
};
