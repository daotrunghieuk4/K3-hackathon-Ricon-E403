# User Validation Feedback Log — Nhóm Ricon-E403 (VLearn Grounding Tutor & End-of-Session Quiz Agent)

**Phụ trách:** Đào Trung Hiếu (2A202601059) — Role: Evidence & Validation / Quality Assurance  
**Số lượng người test:** 5 người ngoài nhóm (gồm 2 willing users từ CP1)  
**Sản phẩm test:** VLearn Grounding Tutor & End-of-Session Quiz Agent (`codebase/index.html` + `codebase/app.js` + `codebase/server.js`)

---

## 1. Danh Sách Người Tham Gia Validation (User Test)

| STT | Họ và tên | Vai trò / Bối cảnh | Loại User | Thiết bị test |
|---|---|---|---|---|
| 1 | Hoàng Quốc Bảo | Học viên khóa AI Thực Chiến K3 | Willing User (CP1) | Laptop Chrome (Win 11) |
| 2 | Vũ Khánh Linh | Học viên khóa AI Thực Chiến K3 | Willing User (CP1) | MacBook Air M2 (macOS) |
| 3 | Trần Minh Hoàng | Học viên khóa AI Thực Chiến K4 | User ngoài | Laptop Windows 10 |
| 4 | Lê Thanh Tùng | Học viên khóa AI Thực Chiến K3 | User ngoài | Laptop Chrome (Win 11) |
| 5 | Đặng Bích Ngọc | Học viên khóa AI Thực Chiến K3 | User ngoài | iPad Pro Safari |

---

## 2. Chi Tiết Feedback Log (Chuẩn phong cách tổng quát — Dùng mượt cho mọi file PDF/Slide)

### Log #1: Hoàng Quốc Bảo (Học viên AI K3 — Willing User)
- **Kịch bản test:** Mở xem tài liệu slide PDF bài giảng trên giao diện LMS, sử dụng Widget AI Tutor hỏi đáp và kích hoạt nút sinh bộ Quiz tự luyện 8-10 câu cuối buổi.
- **Trích dẫn nguyên văn (Quote):**
  > "Giao diện đọc slide PDF song song với bảng Quiz rất trực quan. Khi làm sai câu nào, AI chỉ ngay nhãn trích dẫn `[Trang N]` trích trực tiếp từ slide để mình bấm vào kiểm tra lại kiến thức gốc. Tuy nhiên, khi hỏi các khái niệm nâng cao ngoài bài học, giao diện nên hiển thị nhãn màu sắc riêng biệt để người đọc không bị nhầm lẫn giữa thông tin chính thống trong slide với kiến thức mở rộng từ AI."
- **Khía cạnh đánh giá:** Giao diện xem PDF + Bộ Active Recall Quiz + Trích dẫn `[Trang N]` & Phân biệt nhãn nguồn mở rộng.
- **Điểm đánh giá:** 4.8/5★.

---

### Log #2: Vũ Khánh Linh (Học viên AI K3 — Willing User)
- **Kịch bản test:** Trải nghiệm luồng Adaptive Quiz từng câu và làm thử câu hỏi tự luận ngắn có bộ chấm điểm theo Rubric tự động.
- **Trích dẫn nguyên văn (Quote):**
  > "Chế độ làm Quiz phản hồi tức thì và câu hỏi tự luận ngắn chấm điểm rất sát ý, đưa ra lời khuyên cụ thể giúp mình nhận ra ngay đoạn kiến thức đang bị ngộ nhận. Dù vậy, khoảng cách giữa các lựa chọn trắc nghiệm trên màn hình nên thiết kế thoáng hơn và nên tích hợp bộ đếm ngược 3 phút để tăng phản xạ làm bài cho học viên."
- **Khía cạnh đánh giá:** Adaptive Quiz + Chấm câu hỏi tự luận theo Weighted Rubric + Bộ đếm thời gian 3 phút.
- **Điểm đánh giá:** 4.6/5★.

---

### Log #3: Trần Minh Hoàng (Học viên AI K4 — User ngoài)
- **Kịch bản test:** Upload file PDF bài giảng mới bất kỳ lên hệ thống và thử nghiệm luồng hỏi đáp giải thích thuật ngữ chuyên ngành.
- **Trích dẫn nguyên văn (Quote):**
  > "Tốc độ xử lý trích xuất văn bản từ PDF và render slide mượt mà. Khi mình hỏi một câu mở rộng, AI trả lời tốt nhưng thẻ thông báo nguồn nên đổi sang tông màu cảnh báo (màu vàng/cam) để tách biệt rõ với thẻ trích dẫn verified `[Trang N]` từ tài liệu chính thức của khóa học."
- **Khía cạnh đánh giá:** PDF Parser Engine + Phân loại nguồn Grounded (Bài giảng) vs External Knowledge (Kiến thức nền).
- **Điểm đánh giá:** 4.5/5★.

---

### Log #4: Lê Thanh Tùng (Học viên AI K3 — User ngoài)
- **Kịch bản test:** Bôi đen một khái niệm khó trên slide bài giảng để yêu cầu AI giải thích và hoàn thành bài test Active Recall 3 phút.
- **Trích dẫn nguyên văn (Quote):**
  > "Tính năng bôi đen đoạn văn bản rồi bấm yêu cầu AI giải thích hoạt động rất nhạy, câu trả lời súc tích và tránh được hiện tượng 'xả chữ' thụ động. Tuy nhiên, sau khi hoàn thành bài Quiz, hệ thống nên xuất ra danh sách 'Top 3 trang Slide cần đọc lại' dựa trên các câu trả lời sai để giúp học viên ôn tập nhanh nhất."
- **Khía cạnh đánh giá:** Tooltip Q&A bôi đen + Chống ngợp chữ (Anti-text dump) + Gợi ý trang slide cần ôn lại.
- **Điểm đánh giá:** 4.9/5★.

---

### Log #5: Đặng Bích Ngọc (Học viên AI K3 — User ngoài)
- **Kịch bản test:** Thử đặt các câu hỏi bẫy có trích dẫn sai hoặc khái niệm ngoài phạm vi để kiểm tra cơ chế kiểm duyệt nguồn Verifier Guardrail.
- **Trích dẫn nguyên văn (Quote):**
  > "Bộ kiểm duyệt Verifier hoạt động rất thông minh. Khi phát hiện trích dẫn số trang không hợp lệ, hệ thống tự động gỡ citation sai và hạ nhãn xuống thành 'Kiến thức nền ngoài slide' chứ không xóa mất câu trả lời có ích. Mong muốn duy nhất của mình là khi bấm trực tiếp vào thẻ `[Trang N]`, slide PDF sẽ tự động cuộn mượt đến đúng trang đó luôn."
- **Khía cạnh đánh giá:** Verifier Guardrail + Graceful Degradation + Chuyển trang PDF tự động khi click citation.
- **Điểm đánh giá:** 4.7/5★.
