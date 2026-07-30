# Reflection — Nguyễn Trung Hiếu

## Vai trò
Viết "tool" AI — module xử lý prompt + gọi model, tách riêng khỏi phần giao diện (FE) và phần lưu trữ (BE). Không phụ trách UI, không phụ trách database.

## Phần mình làm
- `codebase/ai-service.js`: 3 lời gọi AI thật chạy trong trình duyệt — `generateQuestionBank()` (sinh kho câu hỏi từ slide, 3 mức độ khó, có trích dẫn), `analyzeQuizResult()` (phân tích lỗ hổng + đề xuất tỉ lệ độ khó lần sau), `parseQuizRequestFromChat()` (hiểu yêu cầu tự nhiên từ khung chat, không bịa bài học không có trong kho).
- `codebase/tool.py`: bản Python chạy golden set hàng loạt ngoài trình duyệt, phục vụ đo lường tự động (R4) thay vì chạy tay từng case.
- Mở rộng `eval/golden_set.json` từ 10 → 21 case (thêm dữ liệu thật từ transcript + chatlog), sau đó hợp nhất với 20 case một thành viên khác xây song song thành 31 case, không bỏ case nào của ai.
- Điều phối 3 lần merge nhánh (`NguyenTrongDuc`, `NguyenVanAn`, `PhamThaiSon`, và merge lớn với `main`), phát hiện và xử lý một xung đột kiến trúc thật giữa 2 hướng làm AI khác nhau.

## AI (Claude Code) hỗ trợ thế nào
Claude viết toàn bộ code trong `ai-service.js`/`tool.py` theo mô tả của mình, nhưng phần có giá trị nhất không phải là viết code — mà là **xác minh bằng cách chạy thật**: tự test API key, phát hiện model mặc định bị hết quota (không phải đoán), phát hiện lỗi Windows console không in được tiếng Việt, và đọc kỹ code của người khác trước khi merge thay vì ghép máy móc. Khi có xung đột giữa 2 hướng thiết kế, Claude không tự chọn bên mà trình bày rõ 2 phương án để mình quyết định — việc quyết định (nên giữ browser-side hay server-side AI) vẫn là của mình.

## Một bài học từ case fail của chính nhóm
Nhóm có 2 người **làm cùng một thứ mà không biết** — mình xây `ai-service.js`/`tool.py`/golden set theo hướng gọi AI từ trình duyệt, cùng lúc một thành viên khác (Đào Trung Hiếu) xây lại gần như y hệt 3 hàm AI đó nhưng theo hướng server-side, kèm một bộ eval riêng bằng PowerShell. Không ai biết người kia đang làm gì cho đến khi merge nhánh mới lộ ra — mất thời gian đọc lại, so sánh, và may mà 2 bản không mâu thuẫn hoàn toàn (đều xuất phát từ cùng 10 case gốc) nên gộp được, không phải bỏ hẳn công sức của ai.

Bài học: trong nhóm nhỏ làm song song, ranh giới rõ ràng ("tôi chỉ viết tool") giúp tránh giẫm chân khi làm việc, nhưng không thay thế được việc **báo lại cho nhau đang làm đến đâu** — nếu đẩy code lên nhánh chung sớm hơn (thay vì làm xong mới đẩy), xung đột này lộ ra sớm hơn nhiều, đỡ tốn công đọc lại toàn bộ 4 file lõi để hợp nhất.

Một điều nhỏ hơn nhưng đáng nhớ: mình chưa từng thử với tài liệu dài thật (chỉ test bằng đoạn trích ngắn), nên lỗi cắt cứng `sourceText` (không chia chunk) tồn tại suốt buổi mà không ai phát hiện — chỉ lộ ra khi bị hỏi thẳng "có bị context window không". Bài học: input test toàn diện phải bao gồm cả trường hợp *to nhất thực tế có thể xảy ra*, không chỉ trường hợp dễ demo.
