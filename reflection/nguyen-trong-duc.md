# Reflection cá nhân — Nguyễn Trọng Đức

## 1. Vai trò của em trong nhóm

Trong mini hackathon này, em là **Nguyễn Trọng Đức**, mã học viên **2A202601673**, thuộc **Nhóm Ricon-E403 — Zone 1** (Dự án: **VLearn Active Recall Quiz Generator**). 

Theo phân công công việc trong `README.md` và [`spec.md` §8](../spec.md#§8-phân-công--kế-hoạch), vai trò của em là **Database Architect & Data Engineer**, phụ trách chính việc thiết kế mô hình cơ sở dữ liệu PostgreSQL `vlearn` schema tại [`codebase/database/schema.sql`](../codebase/database/schema.sql), xây dựng các bảng lưu trữ thông tin PDF, kho câu hỏi, lịch sử nộp bài và phân tích lỗ hổng kiến thức tại [`codebase/server.js`](../codebase/server.js).

Trong một dự án AI theo định hướng **SPEC → Prototype → Demo**, vai trò Database Architect đòi hỏi em phải đảm bảo toàn bộ dữ liệu từ bài giảng PDF, câu hỏi AI sinh ra cho tới các lượt làm bài của học viên đều được mô hình hóa chuẩn xác, có tính toàn vẹn cao và truy vấn hiệu quả.

---

## 2. Phần em đã làm

Chi tiết các phần việc em đã hoàn thành trong đợt hackathon:

1. **Thiết kế Mô hình Cơ sở Dữ liệu PostgreSQL `vlearn` Schema (`codebase/database/schema.sql`):**
   - Đã trực tiếp xây dựng cấu trúc cơ sở dữ liệu PostgreSQL hoàn chỉnh với các bảng cốt lõi: `vlearn.documents` & `vlearn.document_pages` (lưu trữ tài liệu PDF và văn bản trích xuất theo trang), `vlearn.pdf_question_banks` (lưu trữ kho câu hỏi AI sinh ra), `vlearn.quiz_attempts` & `vlearn.quiz_responses` (lưu trữ kết quả và đáp án chi tiết của từng học viên).
   - Thiết kế các trường dữ liệu JSONB linh hoạt để lưu trữ cấu trúc câu hỏi trắc nghiệm/tự luận, giải thích chi tiết, nhãn trích dẫn `[Trang N]` và mảng chủ đề lỗi (`missedTopics`).

2. **Xây dựng Data Access Layer & Persistence Middleware (`codebase/server.js`):**
   - Lập trình các hàm truy xuất cơ sở dữ liệu `persistQuestionBank`, `findQuestionBank`, `initDatabaseConnection` tích hợp sẵn trong Node.js server.
   - Thiết kế cơ chế kết nối an toàn với PostgreSQL Cloud (Neon/Supabase) qua TLS/SSL, đồng thời duy trì luồng Fallback mượt mà sang In-Memory Store khi chạy offline.

3. **Phát triển Engine Phân Tích Lỗ Hổng Kiến Thức (Knowledge Gap Analytics):**
   - Viết các câu lệnh SQL aggregation và logic `buildDynamicGapAnalytics` để tổng hợp danh sách các chủ đề học viên hay làm sai nhất từ lịch sử nộp bài.
   - Cung cấp dữ liệu lỗ hổng kiến thức để AI đề xuất phối hợp độ khó bài tập (Easy/Medium/Hard) phù hợp cho lượt làm bài tiếp theo của học viên.

---

## 3. AI đã hỗ trợ em như thế nào

AI đóng vai trò như một chuyên gia tư vấn thiết kế cơ sở dữ liệu đắc lực cho em trong suốt quá trình làm việc:

- **Gợi ý DDL SQL & Chuẩn hóa Bảng:** Em dùng AI để gợi ý các câu lệnh DDL SQL chuẩn xác, tạo các chỉ mục (Indexes) trên các trường UUID và JSONB để tăng tốc độ truy vấn.
- **Viết Migration Script:** AI hỗ trợ em biên soạn các file migration SQL [`codebase/database/question_bank_migration.sql`](../codebase/database/question_bank_migration.sql) và [`codebase/database/attempt_analytics_migration.sql`](../codebase/database/attempt_analytics_migration.sql) giúp việc nâng cấp schema diễn ra an toàn.
- **Tối ưu Cấu trúc Query JSONB:** AI giúp em viết các toán tử truy vấn JSONB trong PostgreSQL để bóc tách thông tin từ mảng câu hỏi một cách nhanh chóng.

**Tuy nhiên, bài học quan trọng của em là:** AI thường tạo ra các câu lệnh SQL thiếu các ràng buộc khóa ngoại (Foreign Keys) hoặc quên cài đặt các giá trị mặc định (`DEFAULT NOW()`). Em luôn phải trực tiếp kiểm tra lại toàn bộ file `schema.sql`, thực thi test thử nghiệm trên môi trường thật để đảm bảo tính toàn vẹn dữ liệu.

---

## 4. Bài học từ một case fail của nhóm

Case fail mà em rút ra bài học sâu sắc nhất liên quan đến **Lỗi xung đột dữ liệu `SOURCE_MISMATCH` khi đổi PDF**:

Ở phiên bản đầu tiên, khi học viên tải lên file PDF mới có cùng tên với file cũ, hệ thống truy vấn câu hỏi trong cơ sở dữ liệu chỉ dựa vào `lessonTitle`. Kết quả là ứng dụng lấy nhầm kho câu hỏi của file cũ để hiển thị cho file PDF mới, khiến trích dẫn `[Trang N]` hoàn toàn sai lệch so với nội dung đang đọc.

**Bài học em rút ra:**
Trong thiết kế cơ sở dữ liệu cho các ứng dụng Grounded AI:
- Không bao giờ được dùng tiêu đề (string title) làm khóa định danh dữ liệu nguồn.
- Cần phải bổ sung trường băm dữ liệu **`source_sha256`** để kiểm tra tính toàn vẹn của nội dung PDF. Khi `source_sha256` của PDF mới khác với bản ghi trong DB, hệ thống sẽ bắt buộc tạo kho câu hỏi mới thay vì tái sử dụng câu hỏi cũ không phù hợp.

---

## 5. Nếu có thêm thời gian

Nếu có thêm thời gian phát triển dự án, em muốn thực hiện 3 việc:

1. **Tích hợp Extension `pgvector`:** Mở rộng bảng `vlearn.document_pages` với trường `embedding vector(1536)` để hỗ trợ tìm kiếm ngữ nghĩa Semantic Search trực tiếp trong database.
2. **Thiết kế Partitioning cho Bảng Lịch Sử:** Áp dụng kỹ thuật Table Partitioning theo tháng/học kỳ cho bảng `vlearn.quiz_attempts` để đảm bảo tốc độ truy vấn khi hệ thống phục vụ hàng trăm ngàn lượt thi.
3. **Xây dựng Automated Database Backup Pipeline:** Cấu hình tự động sao lưu dữ liệu định kỳ và lập lịch khôi phục dữ liệu tự động cho môi trường Production.

---

**Tổng kết:** Qua mini hackathon, em nhận ra rằng cơ sở dữ liệu chính là **trụ cột lưu trữ tri thức** cho một sản phẩm AI. Một kiến trúc database được thiết kế chuẩn mực sẽ giúp AI hoạt động chính xác, ổn định và có khả năng mở rộng lâu dài.
