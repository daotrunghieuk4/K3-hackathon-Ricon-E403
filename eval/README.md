# Evaluation

Golden set tại `golden_set.json` có 20 case cho ba quyết định AI:

- sinh ngân hàng câu hỏi có trích dẫn;
- phân tích kết quả quiz và điều chỉnh độ khó;
- nhận diện yêu cầu tạo quiz từ hội thoại.

## 1. Kiểm tra coverage (không cần API key)

Chạy từ thư mục gốc của repo:

```powershell
python codebase/tool.py --golden-set eval/golden_set.json --validate-only
```

Lệnh này kiểm tra số lượng case, ID trùng, target hợp lệ, 4 lớp chỗ khó, tỷ lệ
case thường/hiếm và số case có nguồn từ data pack.

## 2. Chạy eval bằng Gemini

Không commit API key. Tạo `.env` ở thư mục gốc:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-flash-latest
```

Sau đó chạy:

```powershell
python codebase/tool.py `
  --golden-set eval/golden_set.json `
  --out eval/run_results_latest.json
```

File kết quả luôn ghi đủ cả PASS và FAIL, phần trăm pass, tỷ lệ câu hỏi có
trích dẫn và trạng thái so với quality bar:

- pass tối thiểu 85% case;
- 100% câu hỏi sinh ra có citation.

Mỗi lời gọi AI thật được ghi trace vào `eval/tool_call_log.json`.

## 3. Diễn giải kết quả

Không sửa tay kết quả để làm đẹp số. Nếu chưa đạt, giữ nguyên file run và ghi
phân tích nguyên nhân theo từng `issues` trước khi thay prompt hoặc model rồi
chạy lượt tiếp theo.
