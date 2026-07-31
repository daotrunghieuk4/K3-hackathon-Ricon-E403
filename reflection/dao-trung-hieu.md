# Reflection cá nhân — Đào Trung Hiếu

## 1. Vai trò của em trong nhóm

Trong mini hackathon này, em là **Đào Trung Hiếu**, mã học viên **2A202601059**, thuộc **Nhóm Ricon-E403 — Zone 1** (Dự án: **VLearn Active Recall Quiz Generator**). 

Theo phân công công việc trong `README.md` và [`spec.md` §8](../spec.md#§8-phân-công--kế-hoạch), vai trò của em là **Test & Quality Assurance**, phụ trách chính việc xây dựng bộ dữ liệu kiểm thử Golden Set 20 testcases tại [`eval/golden_set.json`](../eval/golden_set.json), viết các script đo lường tự động tại [`eval/run_eval.ps1`](../eval/run_eval.ps1), tổ chức User Testing và thu thập nhật ký phản hồi tại [`validation/user_feedback_log.md`](../validation/user_feedback_log.md).

Trong một dự án AI theo định hướng **SPEC → Prototype → Demo**, vai trò Test & Quality Assurance đòi hỏi em phải giữ vai trò là "người gác cổng chất lượng", đảm bảo mọi tuyên bố về độ chính xác và tính hữu ích của sản phẩm đều phải dựa trên số liệu thực chứng (empirical evidence) chứ không dựa trên cảm tính.

---

## 2. Phần em đã làm

Chi tiết các phần việc em đã hoàn thành trong đợt hackathon:

1. **Xây dựng Golden Set 20 Testcases (Phục vụ Rubric R4 & `eval/`):**
   - Đã biên soạn bộ 20 testcases chuẩn hóa lưu tại [`eval/golden_set.json`](../eval/golden_set.json), bao gồm 10 case khai thác trực tiếp từ chatlog thật VLearn (`data/vlearn-pack/chatlog`), 5 case bao phủ 4 lớp chỗ khó (nguồn sự thật, mơ hồ, ngoài thẩm quyền, đặc thù domain) và 5 case bài học mẫu.
   - Định nghĩa rõ tiêu chí Pass/Fail và Quality Bar cho từng case: "Đạt khi $\ge 85\%$ câu hỏi sinh ra khớp đúng nội dung PDF bài giảng và 100% giải thích có trích dẫn minh bạch."

2. **Tự động hóa Quy trình Eval & Đo lường các Lượt chạy:**
   - Xây dựng các script PowerShell [`eval/run_eval.ps1`](../eval/run_eval.ps1) và [`eval/setup_eval.ps1`](../eval/setup_eval.ps1) để chạy kiểm thử tự động toàn bộ 20 case đối chiếu với API prototype.
   - Ghi nhận trung thực kết quả 2 lượt eval tại [`spec.md` §7](../spec.md#§7-kiểm-thử): Lượt 1 đạt 75.0% (15/20 case qua - Chưa đạt), Lượt 2 sau khi bổ sung Grounding Guardrail đạt **90.0% (18/20 case qua - ĐẠT Quality Bar)**.

3. **Tổ chức User Testing & Xây dựng Validation Log (Phục vụ Rubric R6 & `validation/`):**
   - Xây dựng kịch bản user test và mời **3 người dùng thật ngoài nhóm** (Willing users: Nguyễn Hoàng Nam, Phạm Minh Đức, Trần Bảo Ngọc) trực tiếp trải nghiệm prototype.
   - Thu thập phản hồi nguyên văn ghi nhận tại [`validation/user_feedback_log.md`](../validation/user_feedback_log.md), đánh giá cao độ tiện lợi của tính năng tạo bài Quiz sau khi đọc PDF và khả năng trích dẫn nguồn `[Trang N]` chính xác.

---

## 3. AI đã hỗ trợ em như thế nào

AI đóng vai trò như một người trợ lý kiểm thử và phân tích dữ liệu hiệu quả cho em trong suốt quá trình làm việc:

- **Sinh Dữ liệu Test & Edge Cases:** Em dùng AI để gợi ý các tình huống kiểm thử biên (corner cases) như file PDF chứa bảng biểu phức tạp, câu hỏi tự luận chỉ có 1 từ, hoặc các câu hỏi cố tình bẫy AI để xem mô hình có bị ảo giác hay không.
- **Viết Script Automation Test:** AI hỗ trợ em viết script PowerShell `run_eval.ps1` để tự động gửi request đến server, parse kết quả JSON trả về và tính toán tỷ lệ % Pass/Fail chuẩn xác.
- **Tổng hợp nhật ký User Test:** AI giúp em phân loại các ý kiến đóng góp từ người dùng thử thành các nhóm vấn đề (UI/UX, Accuracy, Speed) để nhóm dễ dàng ưu tiên sửa lỗi.

**Tuy nhiên, bài học quan trọng của em là:** Em tuyệt đối không dùng AI để sinh kết quả kiểm thử hoặc làm giả feedback của người dùng. Mọi kết quả 18/20 case qua và 3 mẩu nhận xét trong validation log đều phải là dữ liệu thực tế từ các lượt run và ghi nhận nguyên văn của người dùng thật. Số liệu bị chỉnh sửa hay che giấu sẽ làm mất toàn bộ giá trị nghiệm thu của dự án.

---

## 4. Bài học từ một case fail của nhóm

Case fail mà em rút ra bài học sâu sắc nhất là tình huống ở **Lượt eval 1 (Case #12 & Case #15 trong Golden Set)**:

Khi cho AI thử nghiệm với câu hỏi thuộc **Lớp chỗ khó ② (Mơ hồ / Thiếu thông tin)** — cụ thể là khi học viên nhập câu trả lời tự luận quá cụt chỉ 1-2 từ (ví dụ: gõ "RAG" hoặc "JTBD"), phiên bản đầu tiên của bộ chấm điểm đã đánh tụt 0 điểm và báo sai ngay lập tức vì không đủ từ khóa. Điều này khiến người dùng thử Nguyễn Hoàng Nam phản hồi rằng hệ thống quá cứng nhắc và tạo cảm giác ức chế.

**Bài học em rút ra:** 
Trong đánh giá chất lượng sản phẩm AI (AI Quality Assurance), kịch bản kiểm thử không được chỉ nhìn ở góc độ Đúng/Sai nhị phân của kỹ sư, mà phải đứng từ góc độ trải nghiệm người dùng (UX of Evaluation):
- Với những câu trả lời cụt hoặc thiếu ý, thay vì đánh fail trực tiếp, hệ thống cần có hành vi mong muốn mềm dẻo hơn: **Gợi ý đáp án mẫu đầy đủ và giải thích chi tiết** để giúp học viên bổ sung kiến thức.
- Bài học này đã giúp em điều chỉnh lại tiêu chí Pass/Fail trong `golden_set.json` và yêu cầu team dev bổ sung kịch bản xử lý câu trả lời ngắn ở Lượt 2.

---

## 5. Nếu có thêm thời gian

Nếu có thêm thời gian phát triển dự án, em muốn thực hiện 3 việc:

1. **Mở rộng Golden Set lên 100 Testcases:** Phủ rộng dữ liệu kiểm thử sang toàn bộ 15 bài học lý thuyết của khóa học AI Thực Chiến để phát hiện các edge cases đặc thù của từng chủ đề.
2. **Tự động hóa Continuous Evaluation (CI/CD Pipeline):** Tích hợp script `run_eval.ps1` vào GitHub Actions để tự động chạy kiểm thử eval mỗi khi team dev commit code mới.
3. **Đo lường Latency & Token Cost Evaluation:** Xây dựng bảng theo dõi thời gian phản hồi (latency) và lượng token tiêu tốn cho mỗi lượt sinh Quiz để tối ưu chi phí vận hành thực tế.

---

**Tổng kết:** Qua mini hackathon, em nhận ra rằng công việc kiểm thử sản phẩm AI không chỉ đơn thuần là tìm lỗi code, mà là **đo lường độ tin cậy của mô hình** thông qua bộ Golden Set chuẩn mực và giữ vững kỷ luật số liệu thực chứng.
