# Tóm tắt thiết kế VLearn Quiz Agent

## 1. Mục tiêu sản phẩm

VLearn Quiz Agent hỗ trợ giảng viên và học viên:

- Đưa tài liệu PDF lên hệ thống.
- Dùng LLM tạo bộ câu hỏi theo ba mức độ.
- Cho giảng viên kiểm tra, chỉnh sửa và duyệt câu hỏi.
- Cho học viên tạo quiz luyện tập hoặc làm quiz được giao.
- Chấm bài, lưu lịch sử và phân tích lỗ hổng kiến thức.

## 2. Vai trò người dùng

Hệ thống có hai role:

### `admin` — Giảng viên

- Dashboard lớp học.
- Quản lý học viên và lỗ hổng kiến thức.
- Tải tài liệu PDF.
- Sinh, sửa, duyệt và phát hành quiz.
- Quản lý prompts và AI guardrails.
- Cấu hình API key của nhà cung cấp LLM.

### `user` — Học viên

- Tạo quiz luyện tập từ tài liệu được cho phép.
- Làm quiz do giảng viên giao.
- Xem lịch sử làm bài.
- Xem lỗ hổng kiến thức cá nhân.
- Nhận giải thích và gợi ý ôn tập.

## 3. Luồng chính

```text
Giảng viên tải PDF
        ↓
PDF được lưu trong private object storage
        ↓
Backend trích xuất text và giữ thông tin từng trang
        ↓
Giảng viên chọn số câu và bấm tạo quiz
        ↓
LLM sinh câu hỏi theo ba mức độ
        ↓
Câu hỏi được lưu ở trạng thái draft
        ↓
Giảng viên sửa, duyệt hoặc từ chối
        ↓
Quiz được publish
        ↓
Học viên làm bài
        ↓
Hệ thống chấm và lưu kết quả
        ↓
Tính lỗ hổng kiến thức theo từng topic
```

## 4. Ba mức độ câu hỏi

- `easy`: nhớ lại định nghĩa, thuật ngữ hoặc thông tin có trực tiếp trong tài liệu.
- `medium`: giải thích, so sánh hoặc áp dụng kiến thức vào tình huống đơn giản.
- `hard`: phân tích tình huống hoặc kết hợp nhiều phần kiến thức.

Mỗi câu hỏi nên có:

- Nội dung câu hỏi.
- Loại câu hỏi.
- Mức độ.
- Các lựa chọn nếu là trắc nghiệm.
- Đáp án đúng hoặc đáp án mẫu.
- Giải thích.
- Topic kiến thức.
- Trang và đoạn nguồn trong tài liệu.

## 5. Quyết định về vector embedding

Phiên bản hiện tại **không sử dụng vector embedding**.

Lý do:

- Mỗi lần chỉ xử lý một tài liệu đã được chọn.
- Có thể gửi nội dung tài liệu trực tiếp cho LLM.
- Luồng chính là tạo quiz, không phải tìm kiếm trên nhiều tài liệu.
- Không cần tăng độ phức tạp của hệ thống ở giai đoạn MVP.

Hệ thống vẫn phải giữ text theo từng trang để câu hỏi có nguồn kiểm chứng.

Chỉ cân nhắc embedding sau này khi cần:

- Hỏi đáp trên nhiều PDF.
- Tìm kiếm kiến thức theo ngữ nghĩa.
- Sinh câu hỏi từ nhiều tài liệu cùng lúc.
- Phát hiện câu hỏi gần giống nhau ở quy mô lớn.

## 6. Xử lý PDF dài

Nếu toàn bộ tài liệu nằm trong context window của LLM, gửi trong một lần gọi.

Nếu tài liệu quá dài:

1. Chia theo chương hoặc nhóm trang.
2. Sinh một số câu hỏi cho từng phần.
3. Gom tất cả câu hỏi nháp.
4. Gọi LLM thêm một lượt để loại câu trùng và cân bằng độ khó.

Không cần vector embedding cho cách xử lý này.

## 7. Công nghệ lưu trữ

- PostgreSQL: dữ liệu nghiệp vụ.
- Private object storage: file PDF gốc.
- Backend: trích xuất PDF, gọi LLM và bảo vệ API key.
- Frontend: giao diện admin và học viên.

Không lưu file PDF trực tiếp trong PostgreSQL. Database chỉ lưu đường dẫn file,
metadata và text đã trích xuất.

## 8. Các nhóm bảng chính

### Người dùng và lớp học

- `app_users`
- `classrooms`
- `classroom_enrollments`

### Tài liệu

- `documents`
- `document_versions`
- `document_pages`

### Prompts và AI

- `prompt_templates`
- `guardrail_rules`
- `ai_provider_configs`
- `ai_runs`

### Câu hỏi

- `topics`
- `question_sets`
- `questions`
- `question_options`
- `question_sources`

### Quiz và kết quả

- `quizzes`
- `quiz_questions`
- `quiz_attempts`
- `quiz_responses`
- `response_selected_options`
- `grading_runs`

### Theo dõi và báo cáo

- `audit_logs`
- View `student_topic_performance`
- View `classroom_quiz_summary`

Schema đầy đủ nằm tại `codebase/database/schema.sql`.

## 9. Cách tính lỗ hổng kiến thức

Mỗi câu hỏi được gắn với một `topic`.

```text
Lỗ hổng của topic =
1 - Tổng điểm học viên đạt được / Tổng điểm tối đa của topic
```

Không dùng LLM để tự quyết định tỷ lệ lỗ hổng. LLM chỉ nên dùng để viết giải
thích hoặc gợi ý ôn tập từ kết quả đã được tính bằng dữ liệu.

### Ràng buộc toàn vẹn

- Tài liệu, topic, question set, question và quiz liên kết với nhau phải thuộc
  cùng một lớp học.
- Các cột xác định ownership/scope không được đổi sau khi tạo; muốn chuyển lớp
  phải tạo bản ghi mới để không làm hỏng các liên kết lịch sử.
- Question được duyệt phải có topic, giải thích, nguồn trích dẫn và cấu hình
  đáp án hợp lệ.
- Quiz đã publish là snapshot bất biến; không được thêm, xóa hoặc sửa câu hỏi,
  đáp án và nguồn trích dẫn.
- Học viên phải đang được ghi danh mới được làm assigned quiz.
- Practice quiz chỉ thuộc về người học đã tạo nó.
- Số lần làm không được vượt `attempts_allowed`.
- Response chỉ được tham chiếu question của quiz đang làm và option của đúng
  question đó.
- Attempt đã graded phải có đủ response và tổng điểm khớp với chi tiết.

## 10. Quy tắc bảo mật

- Không lưu API key trong `localStorage`.
- Không lưu API key dạng plaintext trong database.
- API key phải nằm trong secret manager hoặc biến môi trường của backend.
- Không gửi đáp án đúng xuống frontend trước khi học viên nộp bài.
- Học viên chỉ được xem bài làm và lỗ hổng của chính mình.
- Chỉ admin được sửa prompt, guardrail và publish quiz.
- PDF phải được lưu trong private storage.
- Database mặc định thu hồi quyền truy cập của `PUBLIC` và chỉ dành cho backend.
- Không kết nối trực tiếp frontend với PostgreSQL khi chưa có RLS phù hợp với
  cơ chế xác thực đã chọn.

## 11. Chạy database

File schema:

```text
codebase/database/schema.sql
```

Ở giai đoạn hiện tại không bắt buộc cài PostgreSQL local. Cách nhẹ nhất:

1. Tạo một project Supabase.
2. Mở SQL Editor.
3. Copy nội dung `schema.sql`.
4. Chạy script.
5. Dùng connection string của Supabase cho backend.

Khi cần phát triển hoàn toàn local mới cài PostgreSQL Server và `psql`.

Sau khi chạy schema trên database sạch, chạy
`codebase/database/tests/schema_regression.sql` để kiểm tra luồng hợp lệ và các
ràng buộc chống dữ liệu sai. Test tự rollback dữ liệu mẫu khi hoàn tất.
