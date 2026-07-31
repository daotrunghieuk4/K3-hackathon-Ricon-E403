# Reflection cá nhân — Nguyễn Văn An

## 1. Vai trò của em trong nhóm

Trong mini hackathon này, em là **Nguyễn Văn An**, mã học viên **2A202601817**, thuộc **Nhóm Ricon-E403 — Zone 1** (Dự án: **VLearn Active Recall Quiz Generator**). 

Theo phân công công việc trong `README.md` và [`spec.md` §8](../spec.md#§8-phân-công--kế-hoạch), vai trò của em là **Frontend & UI/UX Engineer**, phụ trách chính việc thiết kế và phát triển giao diện người dùng tại [`codebase/index.html`](../codebase/index.html), xử lý logic tương tác client-side tại [`codebase/app.js`](../codebase/app.js), và xây dựng hệ thống CSS styling tại [`codebase/styles.css`](../codebase/styles.css).

Trong một dự án AI theo định hướng **SPEC → Prototype → Demo**, vai trò Frontend Engineer đòi hỏi em phải hiện thực hóa toàn bộ luồng trải nghiệm từ spec thành một ứng dụng web chạy thật (Working Prototype), đảm bảo giao diện trực quan, phản hồi mượt mà và thể hiện rõ các nguyên tắc thiết kế HAX/PAIR cho sản phẩm AI.

---

## 2. Phần em đã làm

Chi tiết các phần việc em đã hoàn thành trong đợt hackathon:

1. **Xây dựng Giao diện VLearn Active Recall LMS (`codebase/index.html` & `styles.css`):**
   - Thiết kế giao diện ứng dụng LMS theo phong cách hiện đại với 2 cột song song: Cột bên trái hiển thị tài liệu PDF bài giảng VLearn, cột bên phải hiển thị bài Active Recall Quiz 4-6 câu trắc nghiệm/tự luận.
   - Áp dụng các bảng màu chuẩn mực (Accent colors, Glassmorphism, Badge trạng thái) và phông chữ Inter để đem lại trải nghiệm học tập chuyên nghiệp như nền tảng thật.

2. **Lập trình Logic Tương tác Client & Gọi API (`codebase/app.js`):**
   - Xử lý các sự kiện tải file PDF, kích hoạt AI sinh bài Quiz 3 phút ngay cuối bài học, rendering danh sách câu hỏi và ghi nhận đáp án của học viên.
   - Hiển thị kết quả điểm số tức thì kèm phân tích đúng/sai theo mã màu (màu xanh cho đáp án đúng, màu đỏ cho đáp án sai) và hiển thị thẻ trích dẫn `[Trang N]` cho phép click để tự động chuyển đến trang tương ứng trong PDF.

3. **Tích hợp Widget AI Tutor & Hiện thực hóa HAX Guidelines (Phục vụ Rubric R2, R5):**
   - Xây dựng Widget Chat AI Tutor thông minh ở góc dưới màn hình cho phép học viên yêu cầu giải thích thêm hoặc truy vấn nguồn gốc thông tin trong tài liệu.
   - Áp dụng HAX Guideline G1 (Banner rõ ràng chức năng hệ thống), G2 (Hiển thị nhãn trích dẫn `[Trang N]`), và G8 (Nút chọn lại bài học mẫu/reset flow dễ dàng mà không bị kẹt ứng dụng).

---

## 3. AI đã hỗ trợ em như thế nào

AI đóng vai trò như một trợ lý lập trình frontend đắc lực cho em trong suốt quá trình phát triển prototype:

- **Gợi ý Layout & CSS Styling:** Em sử dụng AI để sinh nhanh các đoạn CSS Flexbox/Grid phức tạp, hiệu ứng hover mượt mà và cấu trúc CSS Variables đồng bộ cho toàn bộ giao diện `styles.css`.
- **Tối ưu DOM Manipulation:** AI giúp em gợi ý các pattern xử lý sự kiện trong `app.js` như render động danh sách câu hỏi Quiz, xử lý bộ đếm ngược 3 phút và tạo hiệu ứng Skeleton Loading khi chờ AI phản hồi.
- **Debug Lỗi Giao diện:** Khi gặp các lỗi hiển thị z-index hoặc vỡ layout trên các độ phân giải màn hình khác nhau, AI hỗ trợ em tìm ra nguyên nhân và khắc phục nhanh chóng.

**Tuy nhiên, bài học quan trọng của em là:** Em không copy-paste mù quáng code do AI sinh ra. Code AI viết thường bị dư thừa CSS không cần thiết hoặc dùng các thư viện ngoài nặng nề. Em luôn kiểm soát kỹ từng dòng JS/CSS, tự tay tối ưu và tái cấu trúc code để đảm bảo ứng dụng nhẹ, chạy mượt mà trực tiếp trên trình duyệt mà không bị phụ thuộc vào dependency phức tạp.

---

## 4. Bài học từ một case fail của nhóm

Case fail mà em rút ra bài học sâu sắc nhất xảy ra trong **vòng User Testing lần 1 với Học viên Phạm Minh Đức**:

Ở bản prototype đầu tiên, khi học viên bấm nút "Sinh bài Quiz 3 phút", ứng dụng gọi API sang backend nhưng giao diện hoàn toàn không có hiệu ứng phản hồi nào trong khoảng 3-4 giây chờ AI xử lý. Người dùng dùng thử tưởng rằng hệ thống bị treo nên đã liên tục click lại nút bấm, dẫn đến việc gửi trùng lặp nhiều request làm đơ ứng dụng.

**Bài học em rút ra:**
Trong thiết kế UI/UX cho ứng dụng AI (AI-Driven User Experience), độ trễ (latency) của mô hình LLM là điều không thể tránh khỏi. Vì vậy, giao diện phải luôn tuân thủ nguyên tắc **Feedback & Expectation Management**:
- Ngay khi người dùng kích hoạt tính năng AI, hệ thống phải lập tức hiển thị trạng thái đang xử lý (với Skeleton Loading animation và thông báo *"AI đang đọc PDF và khởi tạo câu hỏi..."*).
- Disable tạm thời nút bấm để ngăn chặn việc double-click. Bài học này giúp em nâng cấp `app.js` và `styles.css`, làm cho trải nghiệm người dùng trở nên vô cùng mượt mà và đáng tin cậy.

---

## 5. Nếu có thêm thời gian

Nếu có thêm thời gian phát triển dự án, em muốn thực hiện 3 việc:

1. **Tính năng Highlight trực tiếp trên trang PDF:** Khi học viên bấm vào nhãn trích dẫn `[Trang N]`, giao diện sẽ tự động cuộn đến trang đó và tô sáng (highlight) chính xác đoạn văn bản được AI trích dẫn.
2. **Hỗ trợ Dark Mode & Responsive Mobile (PWA):** Tối ưu hóa giao diện cho điện thoại di động để học viên có thể tranh thủ ôn tập bài Active Recall Quiz mọi lúc mọi nơi.
3. **Thêm hiệu ứng Gamification & Sound Effects:** Tích hợp bộ đếm streak học tập, hiệu ứng pháo hoa khi đạt 100% điểm Quiz và âm thanh phản hồi nhẹ nhàng để tăng động lực học tập cho học viên.

---

**Tổng kết:** Qua mini hackathon, em nhận ra rằng một giao diện AI thành công không chỉ cần đẹp mắt, mà phải biết **quản lý sự kỳ vọng của người dùng**, minh bạch thông tin trích dẫn và biến các thuật toán AI phức tạp thành một trải nghiệm mượt mà, tự nhiên nhất.
