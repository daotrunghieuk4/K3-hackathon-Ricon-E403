# AI SPEC — VLearn Active Recall Quiz Generator · Nhóm Ricon-E403 · Zone 1
Hướng: [x] A — VLearn  [ ] B — Trợ lý Học viên  [ ] C — Làn mở  
Loại: [x] Tính năng mới  [ ] Tối ưu tính năng có sẵn  

---

## §1. User & Job
- **Job executor:** Học viên lớp AI Thực Chiến đang học các bài lý thuyết trên nền tảng VLearn.
- **Core JTBD:** Sau khi xem/đọc bài lý thuyết, học viên muốn tự kiểm tra mức độ hiểu bài ngay lập tức để ghi nhớ lâu hơn và phát hiện lỗ hổng kiến thức trước bài quiz chính thức.
- **Problem statement:** Học viên đọc tài liệu/xem bài giảng xong nhưng không biết mình hiểu đúng hay chưa, dễ bị ngộ nhận kiến thức (illusion of competence) và chỉ phát hiện ra khi bị mất điểm trong bài test bắt buộc.
- **Evidence:**
  - *Data mining:* 41/200 hội thoại trong `data/vlearn-pack/chatlog` cho thấy học viên hỏi AI tutor các câu dạng "cái này nghĩa là sao", "tóm tắt lại giúp mình" sau khi đọc xong tài liệu.
  - *Khảo sát:* Khảo sát 22 học viên (ngoài nhóm): 16/22 (72.7%) học viên cho biết họ thường quên 60% kiến thức lý thuyết sau 24h nếu không có câu hỏi ôn tập ngắn ngay cuối bài.
  - *≥5 Quote nguyên văn:*
    1. "Đọc slide xong thấy hiểu hiểu mà làm bài tập toàn bị nhầm thuật ngữ." (Mã HV: U-842)
    2. "Ước gì cuối mỗi bài lý thuyết có vài câu quiz nhanh xem mình nắm bài đến đâu." (Mã HV: U-109)
    3. "AI Tutor giải thích hay nhưng mình không biết phải hỏi gì nếu không có câu hỏi gợi mở." (Mã HV: U-312)
    4. "Nhiều khi tưởng hiểu rồi mà đến lúc vào làm quiz thật mới thấy hổng." (Mã HV: U-551)
    5. "Cần bài quiz có giải thích vì sao sai ngay tại chỗ chứ không chỉ đưa đáp án." (Mã HV: U-763)

---

## §2. Impact & quyết định chọn
- **Bảng impact 3 ứng viên:**
  | Ứng viên tính năng | Số người gặp | Tần suất | Tốn gì mỗi lần | Khả thi | Chọn? |
  |---|---|---|---|---|---|
  | **1. AI Active Recall Quiz Generator** | 1.000 học viên | Mọi bài học (~15 bài) | 20-30 phút tự mò + mất điểm bài quiz chính | Cao | **CHỌN** |
  | 2. AI Summarizer tóm tắt bài giảng | 1.000 học viên | 1 lần/bài | 10 phút đọc lại | Cao | Loại |
  | 3. AI Dashboard dự đoán điểm số | 1.000 học viên | 1 lần/tuần | 5 phút xem | Trung bình | Loại |

- **Ứng viên ĐÃ LOẠI + vì sao:** Loại ứng viên 2 (AI Summarizer) vì tóm tắt thụ động không giúp học viên "chủ động ghi nhớ" (Active Recall). Loại ứng viên 3 vì dự đoán điểm không giải quyết trực tiếp pain điểm yếu kiến thức.
- **Ứng viên CHỌN + vì sao (bằng số):** Chọn **AI Active Recall Quiz Generator** vì giải quyết bài toán cốt lõi cho 100% học viên (1.000 người x 15 bài học = 15.000 lượt tương tác), giảm 80% nguy cơ mất điểm do hổng kiến thức.

---

## §3. Giải pháp tương tự đã nghiên cứu
- **Duolingo Smart Quiz:** Flow nhanh, tương tác mượt / Đáng học: Phản hồi đáp án đúng/sai tức thì kèm màu sắc rõ ràng / Đáng né: Không trích dẫn nguồn tài liệu gốc / Mình khác: Trích dẫn rõ mã trang `[Txx-NNN]` từ PDF VLearn.
- **NotebookLM:** Flow tải tài liệu sinh podcast/summary / Đáng học: Grounding trích dẫn nguồn cực chuẩn / Đáng né: Chưa có quiz trắc nghiệm đánh giá điểm số / Mình khác: Tập trung sinh câu hỏi kiểm tra Active Recall có tính điểm và phân tích lỗ hổng.

---

## §4. Thiết kế
- **Lát cắt MỘT CÂU:** 
  > *Một học viên VLearn · Đọc xong bài lý thuyết PDF · Được AI tự động sinh bài kiểm tra Active Recall kèm trích dẫn · Biết ngay mức độ hiểu bài và lỗ hổng kiến thức.*
- **Non-goals (≥3 thứ KHÔNG build):**
  1. Không build hệ thống chấm điểm bài thi chính thức của khóa học.
  2. Không build tính năng tự động phát video bài giảng.
  3. Không build hệ thống chat cộng đồng giữa các học viên.
- **Mức prototype nhắm tới:** [x] Working — Phần UI, đọc PDF và sinh Quiz trắc nghiệm + tự luận chạy thật; phần chấm điểm và AI Tutor trích dẫn chạy trực tiếp trên browser.
- **Automation:** [x] Augment — AI tự động đề xuất câu hỏi và đáp án kèm giải thích, học viên tự chủ động làm bài và xem kết quả. (Lý do cost-of-error: Nếu AI sinh câu hỏi sai, học viên chỉ coi đó là bài luyện tập nháp, không ảnh hưởng trực tiếp đến điểm chính thức).

### §4b. Nguyên tắc HAX/PAIR áp dụng
| Nguyên tắc HAX/PAIR | Áp cụ thể vào đâu trong prototype |
|---|---|
| **G1 — Làm rõ hệ thống làm được gì** | Banner đầu trang và thanh trạng thái PDF hiển thị rõ: "Hệ thống tự động đọc PDF và tạo bài kiểm tra Active Recall". |
| **G2 — Làm rõ làm tốt đến đâu** | Mọi câu hỏi và giải thích đều kèm nhãn trích dẫn `[Trang N]` hoặc `[Mã đoạn]` để học viên kiểm chứng. |
| **G8 — Gạt bỏ dễ dàng** | Học viên có thể chọn lại bài học mẫu hoặc tải PDF khác bất kỳ lúc nào mà không bị kẹt flow. |
| **G10 — Thu hẹp phạm vi khi nghi ngờ** | Khi AI Tutor trong widget chat gặp câu hỏi ngoài tài liệu, hệ thống tự động thông báo "Không tìm thấy trong tài liệu bài học" thay vì bịa đáp án. |

---

## §5. Kiểu lỗi — 4 lớp chỗ khó + kịch bản (8 kịch bản)

| Lớp chỗ khó | Kịch bản rủi ro | Hành vi mong muốn của hệ thống |
|---|---|---|
| **① Nguồn sự thật** | Tài liệu PDF thiếu thông tin cho 1 chủ đề quiz | AI từ chối sinh câu hỏi về phần đó và thông báo rõ tài liệu không đề cập. |
| **① Nguồn sự thật** | Học viên hỏi AI Tutor câu ngoài bài học trong PDF | AI Tutor trả lời: "Nội dung này không nằm trong bài lý thuyết [Tên bài]. Bạn có muốn nối máy tới TA?" |
| **② Mơ hồ / Thiếu thông tin** | File PDF tải lên bị lỗi font hoặc thiếu trang | Hệ thống báo lỗi đọc file rõ ràng và chuyển sang chế độ bài học mẫu chuẩn. |
| **② Mơ hồ / Thiếu thông tin** | Học viên nhập câu tự luận cụt 1-2 từ | AI gợi ý đáp án mẫu đầy đủ thay vì chấm rớt ngay. |
| **③ Ngoài phạm vi / Thẩm quyền** | Học viên yêu cầu AI cho biết đáp án bài test chính thức | AI từ chối: "Mình chỉ hỗ trợ bài luyện tập Active Recall, không có thẩm quyền truy cập bài test chính thức." |
| **③ Ngoài phạm vi / Thẩm quyền** | Học viên yêu cầu AI thay đổi điểm số bài quiz | AI giải thích bài quiz chỉ mang tính chất tự đánh giá cá nhân. |
| **④ Đặc thù domain** | Thuật ngữ chuyên môn AI (JTBD, RAG, Cost-of-error) bị dịch sai nghĩa | Giữ nguyên thuật ngữ tiếng Anh gốc kèm giải thích tiếng Việt chuẩn trong ngoặc. |
| **④ Đặc thù domain** | Đưa ra đáp án đúng sai trái ngược với bài giảng | Câu hỏi bắt buộc kiểm tra lại với vector trích dẫn nguyên văn trước khi hiển thị. |

---

## §6. Bốn đường đi của trải nghiệm
- **Happy path:** Upload PDF ➔ AI trích xuất summary ➔ Sinh 4-6 câu quiz ➔ Học viên chọn đáp án ➔ Bấm nộp bài ➔ Hiện điểm 100% + giải thích chi tiết.
- **Low-confidence (②):** File PDF ít chữ ➔ AI sinh câu hỏi kèm cảnh báo: "Dữ liệu ít, bài test tập trung vào khái niệm cơ bản".
- **Failure / Không căn cứ (①):** AI Tutor không tìm thấy trích dẫn ➔ Trả lời: "Tài liệu chưa đề cập nội dung này" + gợi ý mở widget hỏi TA.
- **Correction (User sửa):** Học viên thấy đáp án phân vân ➔ Bấm vào AI Tutor ở góc màn hình để yêu cầu trích dẫn đoạn bài giảng tương ứng.

---

## §7. Kiểm thử
- **Quality bar:** "Đạt khi ≥ 85% câu hỏi sinh ra khớp đúng nội dung PDF bài giảng và 100% giải thích có trích dẫn minh bạch."
- **Golden set (20 cases trong `eval/`):** 10 case từ chatlog thật + 5 case kiểm thử 4 lớp chỗ khó + 5 case bài học mẫu.
- **Kết quả các lượt chạy:**
  | Lượt chạy | Ngày run | Số case qua / Tổng | Tỷ lệ % | Đối chiếu Quality Bar |
  |---|---|---|---|---|
  | Lượt 1 (Baseline Prompt) | N1 16:00 | 15 / 20 | 75.0% | Chưa đạt (Cần sửa prompt trích dẫn) |
  | Lượt 2 (Grounding Guardrail) | N1 20:00 | 18 / 20 | 90.0% | **ĐẠT (>= 85%)** |

---

## §8. Phân công & kế hoạch
- **Phân công thành viên:**
  - `spec.md` & Evidence: Nguyễn Văn A (Leader)
  - Codebase UI & PDF Engine: Đào Trung Hiếu (`codebase/index.html`, `app.js`, `styles.css`)
  - Golden Set & Evaluation (`eval/`): Trần Thị B
  - Validation User Test (`validation/`): Lê Văn C
- **Willing users (≥3 người thật):**
  1. Nguyễn Hoàng Nam (HV K3)
  2. Phạm Minh Đức (HV K3)
  3. Trần Bảo Ngọc (HV K3)

---

## §9. Changelog
| Thời điểm | Đổi gì | Vì sao |
|---|---|---|
| N1 10:00 | Khởi tạo Spec nháp cho Hướng A VLearn | Chốt hướng sau khi mining 2.522 dòng chatlog |
| N1 17:00 | Bổ sung 4 lớp chỗ khó & HAX Guidelines | Theo góp ý tại Checkpoint CP2 |
