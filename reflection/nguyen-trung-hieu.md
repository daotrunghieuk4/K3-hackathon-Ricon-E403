# Reflection cá nhân — Nguyễn Trung Hiếu

## 1. Vai trò của em trong nhóm

Trong mini hackathon này, em là **Nguyễn Trung Hiếu**, mã học viên **2A202601457**, thuộc **Nhóm Ricon-E403 — Zone 1** (Dự án: **VLearn Active Recall Quiz Generator**). 

Theo phân công công việc trong `README.md` và [`spec.md` §8](../spec.md#§8-phân-công--kế-hoạch), vai trò của em là **AI Tool & Prompt Engineering**, phụ trách chính việc xây dựng tài liệu kiến trúc AI Spec [`spec.md`](../spec.md), thiết kế các hệ thống System Prompt, Grounding Guardrail và bộ lọc Verifier kiểm chứng trích dẫn nguồn tại [`codebase/ai-service.js`](../codebase/ai-service.js) và [`codebase/server.js`](../codebase/server.js).

Trong một dự án AI theo định hướng **SPEC → Prototype → Demo**, vai trò AI Tool & Prompt Engineering đòi hỏi em phải đảm bảo mô hình LLM không chỉ sinh ra câu hỏi hay mà phải tuân thủ nghiêm ngặt tính chính xác (Grounding) với tài liệu PDF bài giảng VLearn, triệt tiêu hiện tượng ảo giác (hallucination) và tuân thủ các nguyên tắc HAX/PAIR.

---

## 2. Phần em đã làm

Chi tiết các phần việc em đã hoàn thành trong đợt hackathon:

1. **Biên soạn AI Spec & Định hình Kiến thức Kỹ thuật (Phục vụ Rubric R1, R2, R3 & `spec.md`):**
   - Đóng góp chính vào [`spec.md`](../spec.md), định nghĩa bài toán Active Recall dựa trên số liệu khảo sát 22 học viên (72.7% quên 60% kiến thức nếu không ôn tập ngay).
   - Thiết kế cấu trúc 4 lớp chỗ khó với 8 kịch bản rủi ro tại [`spec.md` §5](../spec.md#§5-kiểu-lỗi--4-lớp-chỗ-khó--kịch-bản-8-kịch-bản) và 4 đường đi của trải nghiệm (Happy path, Low-confidence, Failure, Correction) tại [§6](../spec.md#§6-bốn-đường-đi-của-trải-nghiệm).
   - Áp dụng các nguyên tắc HAX/PAIR Guidelines (G1, G2, G8, G10) vào thiết kế luồng sinh bài tập và widget tương tác AI Tutor.

2. **Thiết kế Prompt Active Recall Quiz Generator (`codebase/ai-service.js`):**
   - Viết và tinh chỉnh System Prompt cho AI để tự động phân tích nội dung PDF bài giảng VLearn, trích xuất các thuật ngữ cốt lõi (JTBD, RAG, Cost-of-error) và sinh 4-6 câu hỏi trắc nghiệm/tự luận ngắn.
   - Ép output của LLM tuân theo cấu trúc JSON chuẩn (Strict JSON Schema), mỗi câu hỏi và đáp án bắt buộc phải đi kèm nhãn trích dẫn `[Trang N]` từ tài liệu bài giảng gốc.

3. **Phát triển Grounding Verifier Engine & Xử lý Failure Mode (`codebase/server.js`):**
   - Triển khai bộ Verifier kiểm tra ngược trích dẫn: Khi AI trả lời câu hỏi trong widget Tutor, hệ thống kiểm tra mã trang/mã đoạn `[Trang N]` có thực sự chứa từ khóa và thông tin tương ứng trong PDF hay không.
   - Cấu hình cơ chế Graceful Degradation theo HAX Guideline G10: Khi AI Tutor gặp câu hỏi nằm ngoài phạm vi PDF bài học, hệ thống chủ động thông báo *"Nội dung này không nằm trong bài lý thuyết [Tên bài]. Bạn có muốn nối máy tới TA?"* thay vì tự bịa đáp án.

---

## 3. AI đã hỗ trợ em như thế nào

AI đóng vai trò như một đối tác pair-programming và cố vấn kiến trúc hiệu quả cho em trong suốt quá trình hackathon:

- **Gợi ý Edge Cases & Failure Modes:** Em sử dụng AI để brainstorm thêm các tình huống rủi ro tiềm ẩn (ví dụ: PDF thiếu font, tài liệu quá ngắn, thuật ngữ tiếng Anh bị dịch sai) để hoàn thiện 8 kịch bản rủi ro trong `spec.md`.
- **Tối ưu Regex & JSON Parsing:** AI giúp em nhanh chóng viết bộ regex parse các thẻ trích dẫn `[Trang N]` và xử lý các lỗi format JSON từ LLM API một cách tin cậy.
- **Thử nghiệm Prompting Techniques:** AI giúp em thử nghiệm nhanh nhiều biến thể prompt (Few-shot prompting, Chain-of-Thought) để tìm ra công thức sinh câu hỏi Active Recall có độ phủ kiến thức tốt nhất.

**Tuy nhiên, bài học quan trọng của em là:** Tuyệt đối không phó mặc hoàn toàn cho AI viết prompt hay định nghĩa spec. Prompt do AI sinh ban đầu thường thiếu các ràng buộc cứng (guardrails), dễ bị trôi ngữ cảnh (context drift) hoặc tự bịa citation khi gặp tài liệu ngắn. Em phải tự mình thực thi các testcase kiểm chứng và gài bộ Verifier để kiểm soát chất lượng đầu ra.

---

## 4. Bài học từ một case fail của nhóm

Case fail mà em rút ra bài học sâu sắc nhất xảy ra ở **Lượt chạy Eval 1 (Baseline Prompt)** tại [`spec.md` §7](../spec.md#§7-kiểm-thử):

Ở lượt chạy đầu tiên, prompt chỉ bảo AI "hãy trích dẫn số trang cho mỗi câu hỏi". Khi test với 20 golden cases trong [`eval/golden_set.json`](../eval/golden_set.json), hệ thống chỉ đạt **75.0% (15/20 case qua)**, chưa đạt Quality Bar nhóm tự đặt ($\ge 85\%$). Nguyên nhân là do ở một số case tài liệu ngắn, AI bị ảo giác và gán nhãn trích dẫn ảo như `[Trang 99]` (trang không hề tồn tại trong PDF).

**Bài học em rút ra:**
Trong kỹ thuật Prompt Engineering cho ứng dụng RAG / Grounding, chỉ yêu cầu AI "hãy trích dẫn" là hoàn toàn chưa đủ. Cần phải có cơ chế kiểm soát 2 tầng:
- **Tầng Prompt:** Cung cấp danh sách các trang hợp lệ và ép AI dùng JSON format chuẩn với field `citation_page`.
- **Tầng Code Verifier:** Xây dựng middleware kiểm tra xem `citation_page` trả về có nằm trong tập trang của tài liệu hay không. Nếu phát hiện trích dẫn sai, Verifier sẽ lập tức gắn nhãn cảnh báo hoặc hạ cấp câu trả lời. Bài học này đã giúp nhóm nâng tỷ lệ qua lên **90.0% (18/20 case qua)** ở Lượt chạy 2.

---

## 5. Nếu có thêm thời gian

Nếu có thêm thời gian phát triển dự án, em muốn thực hiện 3 việc:

1. **Tích hợp RAG Vector Search chuyên sâu:** Thay thế cơ chế khớp từ khóa bằng Vector Embeddings (dùng HNSW/FAISS) để tìm kiếm đoạn văn liên quan trong PDF chính xác hơn khi bài giảng kéo dài hàng trăm trang.
2. **Xây dựng Adaptive Active Recall Engine:** Điều chỉnh độ khó của bài Quiz dựa trên lịch sử làm bài và mức độ hay sai của học viên ở các khái niệm trước đó.
3. **Phát triển LLM-as-a-Judge cho câu hỏi Tự luận:** Xây dựng bộ prompt chấm điểm câu trả lời tự luận của học viên dựa trên Weighted Rubric, đưa ra nhận xét chi tiết kèm trích dẫn đoạn slide cần đọc lại.

---

**Tổng kết:** Qua mini hackathon, em hiểu rằng xây dựng một ứng dụng AI thành công không phải là việc gọi API đơn thuần, mà là nghệ thuật **thiết kế Guardrail & Grounding** để biến một mô hình ngôn ngữ bất định thành một công cụ học tập tin cậy và có trách nhiệm.
