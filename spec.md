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
  > *Một học viên VLearn · Làm bài kiểm tra Active Recall dựa trên slide giảng viên đã đăng · AI sinh sẵn kho câu hỏi 3 mức độ (dễ/vừa/khó) từ slide và tự điều chỉnh tỉ lệ độ khó theo kết quả lần trước · Học viên biết ngay mình đúng/sai ở đâu, vì sao, và độ khó lần sau tự thích ứng với năng lực.*
  >
  > *(Đổi so với bản nháp đầu N1: ban đầu lát cắt là "AI sinh quiz mỗi lần học viên bấm". Sau khi phân tích cost-of-error — câu hỏi giờ được lưu vào kho dùng chung cho cả lớp thay vì sinh riêng từng lượt — nhóm chuyển sang mô hình "giảng viên đăng slide 1 lần → AI sinh kho câu hỏi 1 lần → học viên lấy từ kho + độ khó thích ứng", xem §9 Changelog.)*
- **Non-goals (≥3 thứ KHÔNG build):**
  1. Không build hệ thống chấm điểm bài thi chính thức của khóa học.
  2. Không build tính năng tự động phát video bài giảng.
  3. Không build hệ thống chat cộng đồng giữa các học viên.
  4. Không build cơ chế chia nhỏ (chunk) tài liệu dài — sourceText bị cắt cứng ở 10.000-15.000 ký tự đầu, xem giới hạn đã biết ở §5.
- **Mức prototype nhắm tới:** [x] Working — Upload PDF → trích văn bản (pdf.js) → AI sinh kho câu hỏi thật (Gemini, không mock) → lưu PostgreSQL → học viên làm quiz, nộp bài, xem lỗ hổng kiến thức đều chạy end-to-end thật, không qua bước giả lập.
- **Automation:** [x] Augment (phía học viên) + đang ở mức gần Automate (phía sinh kho câu hỏi) — **đây là một khoảng cách thiết kế nhóm nhận ra muộn, ghi nhận trung thực:** ban đầu dự định giảng viên phải duyệt câu hỏi trước khi đăng vào kho dùng chung (Augment thật sự, đúng cost-of-error vì một câu sai sẽ lặp lại cho *cả lớp* nhiều lượt chứ không phải một học viên tự sửa được), nhưng bản build hiện tại **chưa có bước duyệt** — AI sinh xong là vào kho ngay. Đây là hạng mục ưu tiên số 1 nếu có thêm thời gian (xem §5, §9).

### §4b. Nguyên tắc HAX/PAIR áp dụng
| Nguyên tắc HAX/PAIR | Áp cụ thể vào đâu trong prototype |
|---|---|
| **G1 — Làm rõ hệ thống làm được gì** | Banner đầu trang và thanh trạng thái PDF hiển thị rõ: "Hệ thống tự động đọc PDF và tạo bài kiểm tra Active Recall". |
| **G2 — Làm rõ làm tốt đến đâu** | Mọi câu hỏi và giải thích đều kèm nhãn trích dẫn `[Trang N]`/`[Txx-NNN]` để học viên kiểm chứng; khi số câu làm ít, phần phân tích lỗ hổng dùng giọng thận trọng ("bước đầu cho thấy...") thay vì kết luận chắc chắn — kiểm chứng qua case `GS-06` trong golden set. |
| **G8 — Gạt bỏ dễ dàng** | Học viên có thể chọn lại bài học mẫu hoặc tải PDF khác bất kỳ lúc nào mà không bị kẹt flow. |
| **G9 — Sửa/điều chỉnh dễ dàng** | Kết quả mỗi lần làm bài trực tiếp đổi tỉ lệ dễ/vừa/khó cho lần quiz kế tiếp — học viên không cần tự chọn lại độ khó, hệ thống tự điều chỉnh theo phản hồi ngay trong flow. |
| **G10 — Thu hẹp phạm vi khi nghi ngờ** | (1) Khi slide không đủ căn cứ cho một mức độ khó, AI trả `skippedTopics` kèm lý do thay vì bịa câu hỏi cho đủ số lượng. (2) AI Tutor/khung chat gặp câu hỏi ngoài tài liệu hoặc mơ hồ (không rõ bài học/số câu) → hỏi lại thay vì đoán liều, không tự bịa `lessonId`. |

---

## §5. Kiểu lỗi — 4 lớp chỗ khó + kịch bản (≥8 kịch bản, kiểm chứng qua golden set 31 case trong `eval/golden_set.json`)

| Lớp chỗ khó | Kịch bản rủi ro | Hành vi mong muốn của hệ thống | Case golden set |
|---|---|---|---|
| **① Nguồn sự thật** | Slide/tài liệu thiếu thông tin cho 1 mức độ khó | AI sinh ít câu hơn cho mức đó + báo `skippedTopics` kèm lý do, không bịa cho đủ số lượng. | `GS-02`, `GS-19` |
| **① Nguồn sự thật** | Học viên nhắc tên một bài học không có thật trong kho | AI không tự bịa `lessonId`, trả về `null` + hỏi lại đúng những bài đang có trong kho. | `GS-09` |
| **② Mơ hồ / Thiếu thông tin** | Học viên nhắn "cho tôi làm quiz" không nói rõ bài nào/số câu | Hệ thống trả `needsClarification: true` + một câu hỏi lại ngắn gọn, không đoán liều. | `GS-08`, `GS-11` |
| **② Mơ hồ / Thiếu thông tin** | Tin nhắn cụt lủn thật ngoài đời ("hi", "d") bị hiểu nhầm là yêu cầu hợp lệ | Nhận diện đây không phải yêu cầu quiz, không tự tạo bài dựa trên tin nhắn vô nghĩa. | `GS-16` (dữ liệu chatlog thật) |
| **③ Ngoài phạm vi / Thẩm quyền** | Học viên xin đáp án bài test/lab chính thức | Từ chối, không coi đây là yêu cầu quiz ôn tập hợp lệ. | `GS-10`, `GS-12` (dữ liệu chatlog thật) |
| **③ Ngoài phạm vi / Thẩm quyền** | Học viên yêu cầu AI sửa điểm bài quiz | AI giải thích quiz chỉ mang tính tự đánh giá, không có thẩm quyền đổi điểm chính thức. | `GS-20` |
| **④ Đặc thù domain** | Kết quả ít câu, sai nhiều → nguy cơ AI kết luận "học viên yếu toàn diện" | Bắt buộc giọng thận trọng khi mẫu nhỏ ("bước đầu cho thấy..."), không quy kết chắc chắn từ vài câu sai. | `GS-06` |
| **④ Đặc thù domain** | Một câu hỏi sai kiến thức lọt vào kho câu hỏi dùng chung | Sai lặp lại cho *cả lớp* qua nhiều lượt — đây là lý do golden set bắt "0 lần bịa" là điều kiện cứng của quality bar (§7), không chỉ là % trung bình. | `GS-13`/`GS-14` (transcript thật) |

**Giới hạn đã biết, chưa xử lý (ghi nhận trung thực, không giấu):** `sourceText` đưa vào prompt bị cắt cứng ở 10.000-15.000 ký tự đầu (`ai-service.js`, `server.js`), không chia chunk theo trang. Với slide dài thật (86.000-155.000 ký tự theo transcript mẫu trong `data/`), AI chỉ thấy được ~10-15% tài liệu — phần sau bị bỏ qua hoàn toàn mà không có cảnh báo. Đây là rủi ro thuộc lớp ① (nguồn sự thật bị cắt trước khi AI kịp đọc) chưa có kịch bản/case golden set nào kiểm tra, và là hạng mục ưu tiên sửa nếu có thêm thời gian.

---

## §6. Bốn đường đi của trải nghiệm
- **Happy path:** Giảng viên đăng slide → AI sinh kho câu hỏi 3 mức độ → học viên lấy quiz từ kho, chia đều 3 mức lần đầu → nộp bài → AI phân tích, đề xuất tỉ lệ độ khó lần sau.
- **Low-confidence (②):** Slide ít nội dung hoặc học viên gõ yêu cầu mơ hồ trong chat ("cho tôi làm quiz") → AI sinh ít câu hơn kèm `skippedTopics`, hoặc hỏi lại đúng 1 câu thay vì đoán.
- **Failure / Không căn cứ (①):** AI không tìm được căn cứ cho một mức độ khó, hoặc học viên nhắc bài không có trong kho → báo rõ, không bịa nội dung/`lessonId`.
- **Correction (User sửa):** Học viên làm bài xong thấy sai → xem ngay giải thích + trích dẫn trang tại chỗ; lần quiz sau độ khó tự đổi theo kết quả, không cần học viên tự cấu hình lại.

---

## §7. Kiểm thử
- **Chiều chất lượng + định nghĩa kiểm chứng được** (đo trong `codebase/tool.py`, hàm `evaluate_*`):
  - *Grounding:* mọi câu hỏi phải có `citation` khớp một nhãn `[Trang N]`/`[Txx-NNN]` thật sự xuất hiện trong tài liệu nguồn — không có căn cứ thì phải nằm trong `skippedTopics`, không được bịa.
  - *Đúng cỡ/đúng thẩm quyền:* `parseQuizRequestFromChat` phải khớp `isQuizRequest`/`lessonId` kỳ vọng, và trả `needsClarification` khi thiếu thông tin — không tự đoán.
  - *An toàn khi dữ liệu ít:* `analyzeQuizResult` với <6 câu phải dùng giọng thận trọng, không kết luận "yếu toàn diện" từ vài câu sai.
- **Quality bar (chốt trước khi đo, giữ nguyên sau đó):** *"Đạt khi ≥80% case trong golden set đạt, VÀ AI không được bịa câu hỏi/nội dung không có căn cứ trong tài liệu (lớp ① nguồn sự thật) dù chỉ một lần."* Lý do phần thứ 2: câu hỏi sinh ra được lưu vào kho dùng chung cho cả lớp (không phải nháp riêng từng học viên) — một câu bịa lọt qua sẽ sai lặp lại cho mọi học viên lấy từ kho đó, kèm trích dẫn khiến học viên tin ngay mà không tự phát hiện được.
- **Golden set (31 case trong `eval/golden_set.json`):** ≥2 case/lớp chỗ khó (①②③④), 14 case thường + 7 case hiếm + 10 case biên (edge), **20/31 case lấy hoặc phát triển từ dữ liệu thật** (transcript bài giảng + chatlog AI tutor thật trong `data/vlearn-pack/`, bao gồm cả tin nhắn học viên nguyên văn như "hi", yêu cầu xin đáp án lab...). Bộ case do 2 thành viên xây độc lập rồi gộp lại (`GS-01`–`GS-20`: Đào Trung Hiếu; `GS-21`–`GS-31`: Nguyễn Trung Hiếu) — không case nào bị bỏ khi hợp nhất.
- **Kết quả các lượt chạy** (chạy bằng `python codebase/tool.py --golden-set eval/golden_set.json`, log đầy đủ kể cả case fail trong `eval/run_results_*.json`):

  | Lượt chạy | Bộ case | Số case qua / Tổng | Tỷ lệ % | Đối chiếu Quality Bar | Ghi chú |
  |---|---|---|---|---|---|
  | Lượt 1 | 21 case (trước khi gộp) | 11 / 21 | 52.4% | Chưa đạt | **Không phải lỗi AI** — 10/10 case fail đều là HTTP 429 (rate-limit free-tier khi gọi 21 request liên tiếp), không phải câu trả lời sai. Giữ lại làm bằng chứng trung thực của lượt đầu. |
  | Lượt 2 | 21 case (trước khi gộp) | 20 / 21 | **95.2%** | **ĐẠT (≥80%, 0 lần bịa)** | Sau khi đổi model (`gemini-2.0-flash` → quota=0 → `gemini-flash-latest` → hết quota ngày 20 req/day → `gemini-flash-lite-latest`, còn quota) và thêm retry-backoff theo `retryDelay` Gemini đề xuất. Case fail duy nhất (`GS-05`): AI liệt kê 5 chủ đề yếu thay vì tối đa 3 — không phải lỗi bịa/mất căn cứ. |
  | *(việc còn thiếu trước demo)* | 31 case (sau khi gộp `GS-21`–`GS-31`) | *chưa chạy* | — | — | Golden set đã tăng từ 21 → 31 case sau khi hợp nhất với nhánh `main` (xem §9). Cần chạy lại trọn bộ 31 case trước CP6 để có số liệu khớp bộ case cuối cùng — ưu tiên cao nhất còn lại của R4. |

---

## §8. Phân công & kế hoạch
- **Phân công thành viên** (đối chiếu theo commit thật trong repo — 2 dòng cuối trước đây là placeholder chưa điền tên thật, cần nhóm xác nhận lại trước khi nộp):
  - Codebase UI, PDF Engine, Question Bank & Eval Suite: **Đào Trung Hiếu** (`codebase/index.html`, `app.js`, `styles.css`, `eval/` tooling, `codebase/database/question_bank_migration.sql`)
  - AI Tool (lời gọi AI thật + golden set): **Nguyễn Trung Hiếu** (`codebase/ai-service.js`, `codebase/tool.py`, mở rộng + hợp nhất `eval/golden_set.json`)
  - Backend Server: **Phạm Thái Sơn** (`codebase/server.js` bản đầu, `package.json`)
  - Database Schema: **Nguyễn Trọng Đức** (`codebase/database/schema.sql`, kiểm tra ràng buộc)
  - Giao diện Role Admin/User: **Nguyễn Văn An** (`codebase/index.html`, `app.js`, `styles.css` — Role Admin/User)
  - *Cần nhóm xác nhận:* ai phụ trách chính spec/evidence (§1-§2) và validation (`validation/`) — chưa có tên thật trong repo tại thời điểm viết.
- **Willing users (≥3 người thật):**
  1. Nguyễn Hoàng Nam (HV K3)
  2. Phạm Minh Đức (HV K3)
  3. Trần Bảo Ngọc (HV K3)
  - *Lưu ý:* `validation/user_feedback_log.md` hiện mới có 3 người — rubric R6 yêu cầu ≥5 người ngoài nhóm kèm quote nguyên văn + mức nghiêm trọng theo scaffold guide §4.2. Cần bổ sung ≥2 người trước CP5.

---

## §9. Changelog
| Thời điểm | Đổi gì | Vì sao (trỏ về feedback/case nào) |
|---|---|---|
| N1 10:00 | Khởi tạo Spec nháp cho Hướng A VLearn | Chốt hướng sau khi mining 2.522 dòng chatlog |
| N1 17:00 | Bổ sung 4 lớp chỗ khó & HAX Guidelines | Theo góp ý tại Checkpoint CP2 |
| N1 (chiều) | Đổi lát cắt từ "AI sinh quiz mỗi lần bấm" sang "giảng viên đăng slide 1 lần → AI sinh kho câu hỏi 1 lần → học viên lấy từ kho, độ khó thích ứng" | Phân tích lại cost-of-error: câu hỏi dùng chung cho cả lớp, sai thì lan ra nhiều lượt chứ không phải một người tự sửa được — mức Augment cũ không còn đúng lý do |
| N1 (chiều) | Viết `ai-service.js` + `tool.py`: 3 lời gọi AI thật (`generateQuestionBank`, `analyzeQuizResult`, `parseQuizRequestFromChat`), tách riêng khỏi code FE | Đúng luật "≥1 lời gọi AI chạy thật", tách phần để mỗi người tự giải thích được phần mình làm (vibe-coding rule) |
| N1 (chiều) | Phát hiện & gỡ bug: model mặc định `gemini-2.0-flash` bị quota=0, `gemini-flash-latest` hết 20 request/ngày → đổi `gemini-flash-lite-latest` | Test thật phát hiện qua `tool.py`, không phải suy đoán — xem log lỗi 429/404 trong quá trình đo |
| N1 (chiều) | Mở rộng golden set 10 → 21 case, thêm 10 case lấy từ dữ liệu thật (transcript + tin nhắn chatlog nguyên văn) | Đáp ứng yêu cầu ≥20 case + ≥10 case từ dữ liệu thật; trước đó chỉ 1/10 case là dữ liệu thật |
| N1 (chiều) | Chạy golden set 2 lượt: Lượt 1 = 11/21 (52.4%, do rate-limit), Lượt 2 = 20/21 (95.2%, ĐẠT quality bar) | Ghi nhận trung thực cả lượt fail; case fail duy nhất (`GS-05`) đã phân tích nguyên nhân, không phải lỗi bịa đặt |
| N1 (chiều) | Phát hiện Đào Trung Hiếu đã push thẳng lên `main` một hướng khác: `server.js` tự gọi Gemini (không qua browser), kèm bộ eval riêng + kho câu hỏi cô lập theo từng PDF | Hai người làm song song không đồng bộ — hợp nhất thay vì chọn 1 bên bỏ bên kia |
| N1 (chiều) | Hợp nhất: lấy `server.js`/`app.js` của Đào Trung Hiếu (đã giải quyết được "sinh kho 1 lần, dùng lại" mà bản cũ chưa có); gộp `tool.py` (giữ cả resume-from-previous-run của họ + retry-429 của mình); gộp `golden_set.json` thành 31 case (không bỏ case nào của cả 2 bên) | Tránh phá công sức người khác, đồng thời giữ cải tiến riêng của từng bên — xem lý do chi tiết trong commit `51b1940` |
| N1 (chiều) | Phát hiện giới hạn chưa xử lý: `sourceText` bị cắt cứng 10-15k ký tự, không chia chunk — slide dài thật (86-155k ký tự theo transcript mẫu) chỉ được AI đọc ~10-15% | Tự hỏi lại sau khi được hỏi về context window; chưa sửa, ghi nhận là hạng mục ưu tiên còn thiếu ở §5 |
