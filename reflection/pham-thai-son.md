# Reflection cá nhân — Phạm Thái Sơn

## 1. Vai trò của em trong nhóm

Trong mini hackathon này, em là **Phạm Thái Sơn**, mã học viên **2A202601059**, thuộc **Nhóm Ricon-E403 — Zone 1** (Dự án: **VLearn Active Recall Quiz Generator**). 

Theo phân công công việc trong `README.md` và [`spec.md` §8](../spec.md#§8-phân-công--kế-hoạch), vai trò của em là **Khảo sát User & Backend Engineer**, phụ trách chính việc khảo sát thu thập bằng chứng nỗi đau tại [`spec.md` §1 & §2](../spec.md#§1-user--job), đồng thời thiết kế và lập trình toàn bộ hệ thống API Backend cho ứng dụng tại [`codebase/server.js`](../codebase/server.js).

Trong một dự án AI theo định hướng **SPEC → Prototype → Demo**, vai trò Backend Engineer đòi hỏi em phải kết nối mượt mà giữa giao diện Frontend với mô hình AI Gemini, đảm bảo luồng xử lý dữ liệu PDF, tạo kho câu hỏi và lưu trữ thông tin luôn ổn định, tin cậy và có khả năng phục hồi khi gặp lỗi (fault-tolerant).

---

## 2. Phần em đã làm

Chi tiết các phần việc em đã hoàn thành trong đợt hackathon:

1. **Khảo sát Nhu cầu Người dùng & Khai thác Data Mining (Phục vụ Rubric R1 & `spec.md` §1-§2):**
   - Đã trực tiếp tham gia khảo sát **22 học viên** ngoài nhóm để xác định pain point: 72.7% học viên quên 60% kiến thức lý thuyết sau 24h nếu không có câu hỏi kiểm tra Active Recall ngay cuối bài.
   - Phân tích chatlog bài giảng VLearn để tìm ra 41/200 hội thoại thể hiện nhu cầu tự kiểm tra kiến thức của học viên, đóng góp các quote thực tế cho [§1 trong `spec.md`](../spec.md#§1-user--job).

2. **Phát triển Hệ thống RESTful API Backend (`codebase/server.js`):**
   - Lập trình toàn bộ các endpoint API cho ứng dụng: `/api/question-banks/generate` (Tạo kho câu hỏi từ PDF), `/api/quiz/generate` (Sinh bài quiz theo độ khó), `/api/documents/save` (Lưu vết tài liệu) và `/api/health` (Kiểm tra sức khỏe hệ thống).
   - Xây dựng cơ chế In-Memory Fallback Store song song với PostgreSQL, giúp ứng dụng vẫn chạy mượt mà ngay cả khi không có kết nối cơ sở dữ liệu cloud.

3. **Xử lý Luồng Dữ liệu & Khắc phục Lỗi Multi-Upload PDF:**
   - Trực tiếp debug và sửa lỗi luồng dữ liệu khi người dùng nạp PDF nhiều lần liên tiếp, tự động chuẩn hóa định dạng trích dẫn `[Trang N]` từ LLM để tránh sập server.
   - Tích hợp bộ lọc kiểm tra trùng lặp câu hỏi và xử lý lỗi rate limit API giúp hệ thống phản hồi ổn định trong mọi tình huống.

---

## 3. AI đã hỗ trợ em như thế nào

AI đóng vai trò như một trợ lý lập trình server chuyên nghiệp cho em trong suốt quá trình phát triển:

- **Gợi ý Cấu trúc Express Route & Async/Await:** Em dùng AI để brainstorm cấu trúc xử lý bất đồng bộ (async/await) mượt mà cho các route phức tạp trong Express framework.
- **Xử lý Error Handling & Retry Logic:** AI giúp em viết các đoạn middleware bắt lỗi HTTPS status code (429, 502, 503) và tự động thực hiện Exponential Backoff Retry khi Gemini API bị quá tải.
- **Tối ưu Parsing JSON từ LLM:** AI gợi ý các hàm làm sạch chuỗi markdown code fence (`cleanGeminiJson`) để parse chính xác dữ liệu JSON trả về từ mô hình ngôn ngữ.

**Tuy nhiên, bài học quan trọng của em là:** Tuyệt đối không phó mặc cho AI viết logic xử lý dữ liệu. AI thường gợi ý code không tính đến các edge case như file PDF dung lượng lớn, lỗi đứt kết nối giữa chừng hoặc lệch id giữa client và server. Em phải tự tay viết các đoạn kiểm tra ràng buộc (validation) chặt chẽ để bảo vệ Backend.

---

## 4. Bài học từ một case fail của nhóm

Case fail mà em rút ra bài học sâu sắc nhất xảy ra khi người dùng nạp file PDF thứ 2 liên tiếp:

Khi nạp PDF lần đầu, hệ thống tạo ra kho câu hỏi rất mượt. Nhưng đến khi nạp file PDF thứ hai, server bị trả về lỗi **502 Bad Gateway** do AI Gemini trả về thẻ trích dẫn dạng `"Trang 2"` (thiếu ngoặc vuông), khiến hàm kiểm tra nghiêm ngặt `!sourceText.includes(citation)` trong `server.js` văng exception và làm sập toàn bộ luồng tạo quiz.

**Bài học em rút ra:**
Trong thiết kế API cho hệ thống tích hợp AI, đầu ra của mô hình LLM là **không hoàn toàn định tính (non-deterministic)**:
- Không được dùng `throw Error` một cách cứng nhắc đối với các dữ liệu trích dẫn do AI sinh ra.
- Hệ thống Backend phải xây dựng cơ chế **Graceful Sanitization**: Khi trích dẫn sai hoặc lệch định dạng, server cần tự động chuẩn hóa (ví dụ bổ sung ngoặc `[Trang N]`) hoặc gán về trang hợp lệ gần nhất trong bài học thay vì trả về lỗi 502 làm gãy trải nghiệm của học viên.

---

## 5. Nếu có thêm thời gian

Nếu có thêm thời gian phát triển dự án, em muốn thực hiện 3 việc:

1. **Xây dựng Redis Caching Layer:** Lưu trữ các kho câu hỏi đã được sinh ra vào Redis Cache để trả về kết quả tức thì (dưới 100ms) cho các học viên học cùng một bài giảng PDF.
2. **Tối ưu hóa PDF Streaming Processing:** Chia nhỏ việc đọc file PDF dung lượng lớn thành các luồng background worker để không làm block main event loop của Node.js server.
3. **Bổ sung Rate Limiting & Security Guardrails Middleware:** Xây dựng bộ lọc chặn DDOS và Rate Limit theo từng địa chỉ IP/Client ID để bảo vệ tài nguyên API Key.

---

**Tổng kết:** Qua mini hackathon, em hiểu rằng việc xây dựng một Backend Server cho sản phẩm AI đòi hỏi sự chủ động **dự đoán các điểm gãy (failure points)** và thiết kế luồng xử lý dữ liệu mềm dẻo để mang lại sự ổn định tối đa cho người dùng.
