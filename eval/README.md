# Hướng dẫn chạy Evaluation

Eval kiểm tra ba quyết định AI của VLearn:

1. `generateQuestionBank`: sinh câu hỏi đủ mức khó, đúng schema và có trích dẫn.
2. `analyzeQuizResult`: tìm lỗ hổng kiến thức và điều chỉnh tỷ lệ câu dễ/vừa/khó.
3. `parseQuizRequestFromChat`: nhận diện đúng yêu cầu tạo quiz, hỏi lại khi mơ hồ
   và không tự bịa bài học.

Golden set trong `eval/golden_set.json` có 20 case:

- 10 case thường và 4 case hiếm;
- ít nhất 2 case cho mỗi lớp chỗ khó ① nguồn sự thật, ② mơ hồ,
  ③ ngoài phạm vi và ④ đặc thù domain;
- 11 case lấy hoặc phát triển từ transcript/chatlog thật.

## 1. Yêu cầu

- Python 3.11 trở lên.
- Node.js và npm nếu muốn dùng các lệnh npm rút gọn.
- Gemini API key để chạy model thật.
- Không cần PostgreSQL và không cần khởi động `server.js` để chạy eval.
- `tool.py` chỉ dùng thư viện chuẩn của Python; `.venv` dùng để cô lập môi
  trường chạy, không cần cài thêm package từ PyPI.

Kiểm tra môi trường:

```powershell
python --version
node --version
npm --version
```

Nếu terminal cũ chưa nhận Node.js vừa cài, đóng PowerShell rồi mở lại.

## 2. Tạo và kích hoạt môi trường ảo

Mở PowerShell tại thư mục gốc repo:

```powershell
Set-Location D:\K3-hackathon-Ricon-E403
```

Chạy script setup. Script tạo `.venv` và tạo `.env` từ file mẫu nếu chưa có:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\eval\setup_eval.ps1
```

Kích hoạt môi trường ảo:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Sau khi kích hoạt, đầu dòng PowerShell có tiền tố `(.venv)`. Xác nhận Python
đang chạy từ môi trường ảo:

```powershell
python --version
Get-Command python | Select-Object -ExpandProperty Source
```

Đường dẫn Python phải nằm trong:

```text
D:\K3-hackathon-Ricon-E403\.venv\Scripts\python.exe
```

Khi làm xong, thoát môi trường bằng:

```powershell
deactivate
```

## 3. Cấu hình Gemini API key

Tạo key tại Google AI Studio, sau đó mở file `.env` ở thư mục gốc:

```powershell
notepad .env
```

Điền key sau dấu `=` và lưu file:

```dotenv
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-3.6-flash
```

Runner tìm `.env` ở cả thư mục gốc và `codebase/`. File `.env` đã được
`.gitignore` loại trừ; tuyệt đối không đưa API key vào source code hoặc commit.

Có thể cấu hình key chỉ cho terminal hiện tại mà không tạo file:

```powershell
$env:GEMINI_API_KEY = "your_real_key_here"
$env:GEMINI_MODEL = "gemini-3.6-flash"
```

## 4. Kiểm tra golden set offline

Bước này không gọi Gemini và không tốn quota:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\eval\run_eval.ps1 -ValidateOnly
```

Nếu đã kích hoạt `.venv`, có thể chạy trực tiếp:

```powershell
python codebase/tool.py --validate-only
```

Kết quả hợp lệ phải có:

```json
{
  "total_cases": 20,
  "normal_cases": 10,
  "rare_cases": 4,
  "real_source_cases": 11,
  "errors": [],
  "valid": true
}
```

## 5. Kiểm tra API key và model

Lệnh này gọi một request Gemini rất nhỏ:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\eval\run_eval.ps1 -CheckConnection
```

Khi kết nối thành công:

```json
{
  "connected": true,
  "model": "gemini-3.6-flash"
}
```

Nếu báo `Thiếu GEMINI_API_KEY`, mở lại `.env`, điền key thật và lưu file.

## 6. Chạy thử một case

Nên chạy một case trước để kiểm tra key, model và quota:

```powershell
.\.venv\Scripts\python.exe codebase\tool.py `
  --case-id GS-07 `
  --out eval\run_results_smoke.json
```

Chạy nhiều case chọn lọc bằng cách lặp `--case-id`:

```powershell
.\.venv\Scripts\python.exe codebase\tool.py `
  --case-id GS-01 `
  --case-id GS-07 `
  --case-id GS-11 `
  --out eval\run_results_selected.json
```

Kết quả chạy chọn lọc chỉ dùng để debug. Trường
`quality_bar.comparable_to_quality_bar` sẽ là `false`, vì quality bar chỉ được
đối chiếu khi chạy đủ 20 case.

## 7. Chạy toàn bộ 20 case

Không cần kích hoạt `.venv` nếu chạy bằng wrapper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\eval\run_eval.ps1 `
  -Out eval\run_results_luot_01.json
```

Kết quả được ghi vào:

```text
eval/run_results_luot_01.json
```

Nếu đã kích hoạt `.venv`, chạy trực tiếp và tạo tên có timestamp tự động:

```powershell
python codebase/tool.py
```

Có thể chỉ định tên file:

```powershell
python codebase/tool.py `
  --out eval/run_results_luot_01.json
```

Mỗi case thực hiện một lời gọi Gemini. Chạy đủ bộ hiện tại sử dụng 20 lời gọi;
runner mặc định chờ 7 giây giữa các request để tránh rate limit.

Nếu một lượt bị `HTTP 429`, dùng lại các case đã PASS và chỉ chạy lại case FAIL:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\eval\run_eval.ps1 `
  -ResumeFrom eval\run_results_luot_01.json `
  -Out eval\run_results_luot_01_resumed.json `
  -RequestDelaySeconds 7
```

File resumed vẫn chứa đủ 20 case và có thể đối chiếu quality bar; các trường
`resumed_from` và `new_call_count` cho biết nguồn và số request mới thực hiện.

## 8. Đọc file kết quả

Các trường cấp cao:

- `model`: model Gemini thực tế đã dùng.
- `total_cases`, `passed`, `pass_rate_pct`: tổng hợp kết quả.
- `quality_bar`: so sánh kết quả với ngưỡng đã chốt.
- `results`: đầu ra và lỗi của từng case, bao gồm cả case FAIL.

Quality bar hiện tại:

- ít nhất 85% case PASS;
- 100% câu hỏi sinh ra có trường `citation`;
- `quality_bar.overall_met = true` chỉ khi chạy đủ golden set và đạt cả hai ngưỡng.

Mỗi phần tử trong `results` có:

- `case_id`, `target_function`, `difficulty_class`, `case_type`, `source`;
- `status`: `PASS` hoặc `FAIL`;
- `issues`: lý do fail hoặc cảnh báo;
- `output`: JSON model trả về.

Trace của lời gọi AI thật được ghi ở:

```text
eval/tool_call_log.json
```

Trace chỉ lưu preview prompt, model, thời gian, độ trễ và trạng thái; không lưu
API key.

## 9. Quy trình chạy nhiều lượt

1. Chạy `run_eval.ps1 -ValidateOnly`.
2. Chạy `run_eval.ps1 -CheckConnection`.
3. Chạy một case như `GS-07`.
4. Chạy đủ 20 case và giữ nguyên file kết quả lượt 1.
5. Đọc các `issues`, nhóm lỗi theo schema, grounding, citation hoặc hành vi.
6. Chỉ sửa prompt/logic sau khi đã ghi nguyên nhân.
7. Chạy lượt tiếp theo với tên file mới để có thể đối chiếu:

```powershell
python codebase/tool.py --out eval/run_results_luot_02.json
```

Không sửa tay kết quả hoặc xóa case FAIL để làm đẹp tỷ lệ.

## 10. Lỗi thường gặp

### `Thiếu GEMINI_API_KEY`

Kiểm tra `.env` nằm ở thư mục gốc hoặc `codebase/`, tên biến viết đúng và không
có dấu cách trước tên biến.

### Gemini trả HTTP 400 hoặc 404

Model trong `GEMINI_MODEL` không tồn tại hoặc không được API key hỗ trợ. Thử:

```dotenv
GEMINI_MODEL=gemini-3.6-flash
```

### Gemini trả HTTP 401 hoặc 403

API key sai, bị vô hiệu hóa hoặc project chưa bật Gemini API.

### Gemini trả HTTP 429

Đã chạm quota/rate limit. Chờ quota hồi phục rồi chạy lại; không ghi đè file
kết quả trước đó.

### `npm` không được nhận diện

Mở terminal mới. Nếu vẫn lỗi, chạy bằng đường dẫn:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run eval:validate
```

### Eval chạy từ sai thư mục

Runner đã tự xác định đường dẫn repo, nên lệnh Python có thể chạy từ root hoặc
`codebase/`. Với npm, luôn `Set-Location codebase` trước khi chạy.
