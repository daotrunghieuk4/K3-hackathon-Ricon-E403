#!/usr/bin/env python3
"""
tool.py — bản chạy hàng loạt (offline) của "cái tool" AI VLearn Active Recall Quiz.

Cùng 3 quyết định AI với codebase/ai-service.js:
  - generate_question_bank()     : sinh kho câu hỏi từ slide (AI thật)
  - analyze_quiz_result()        : phân tích lỗ hổng + đề xuất mix độ khó (AI thật)
  - parse_quiz_request_from_chat(): hiểu yêu cầu tự nhiên từ khung chat (AI thật)

Viết lại bằng Python thuần (chỉ dùng thư viện chuẩn, không cần pip install) để
chạy được ngoài trình duyệt — phục vụ chạy golden set / eval hàng loạt cho R4:

    python tool.py --golden-set eval/golden_set.json --out eval/run_results.json

QUAN TRỌNG: nội dung prompt ở đây PHẢI giữ đồng bộ với codebase/ai-service.js —
sửa prompt ở một bên thì phải sửa bên còn lại, không thì hành vi 2 bản sẽ lệch nhau.

API key: đọc từ biến môi trường GEMINI_API_KEY, hoặc file .env cùng thư mục
(mỗi dòng dạng KEY=VALUE) nếu biến môi trường chưa được set. .env đã có trong
.gitignore của repo — không commit key vào repo.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEFAULT_MODEL = "gemini-flash-latest"
CALL_LOG_PATH = os.path.join("eval", "tool_call_log.json")

# Console Windows mặc định dùng cp1252, không in được tiếng Việt UTF-8 -> ép lại.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")


# ---------------------------------------------------------------------------
# Cấu hình: API key + model (env var, hoặc .env cùng thư mục chạy script)
# ---------------------------------------------------------------------------

def load_dotenv(path=".env"):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_api_key():
    load_dotenv()
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError(
            "Thiếu GEMINI_API_KEY. Set biến môi trường (export GEMINI_API_KEY=...) "
            "hoặc tạo file .env (GEMINI_API_KEY=...) cùng thư mục với tool.py."
        )
    return key


def get_model():
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)


# ---------------------------------------------------------------------------
# Log/trace — bằng chứng "AI call thật" khi chạy golden set (R5 + R4)
# ---------------------------------------------------------------------------

def append_call_log(entry):
    log = []
    if os.path.exists(CALL_LOG_PATH):
        try:
            with open(CALL_LOG_PATH, "r", encoding="utf-8") as f:
                log = json.load(f)
        except (json.JSONDecodeError, OSError):
            log = []
    log.insert(0, entry)
    log = log[:200]
    os.makedirs(os.path.dirname(CALL_LOG_PATH), exist_ok=True)
    with open(CALL_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


def call_gemini(purpose, prompt):
    """Lời gọi Gemini thật duy nhất trong file này, ép model trả JSON.
    Không có key -> ném lỗi rõ ràng (không im lặng bịa kết quả)."""
    api_key = get_api_key()
    model = get_model()
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.4,
                "responseMimeType": "application/json",
            },
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )

    started = time.time()
    log_entry = {
        "purpose": purpose,
        "model": model,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "promptPreview": prompt[:400],
    }

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        log_entry.update(
            status="error",
            latencyMs=int((time.time() - started) * 1000),
            error=f"HTTP {e.code}: {err_body[:300]}",
        )
        append_call_log(log_entry)
        raise RuntimeError(f"Gemini HTTP {e.code}: {err_body[:300]}") from e
    except Exception as e:
        log_entry.update(
            status="error", latencyMs=int((time.time() - started) * 1000), error=str(e)
        )
        append_call_log(log_entry)
        raise

    try:
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        block_reason = (data.get("promptFeedback") or {}).get("blockReason")
        err = (
            f"Gemini từ chối trả lời ({block_reason})"
            if block_reason
            else "Gemini không trả về nội dung."
        )
        log_entry.update(
            status="error", latencyMs=int((time.time() - started) * 1000), error=err
        )
        append_call_log(log_entry)
        raise RuntimeError(err)

    parsed = json.loads(raw_text)
    log_entry.update(
        status="success",
        latencyMs=int((time.time() - started) * 1000),
        responsePreview=raw_text[:800],
    )
    append_call_log(log_entry)
    return parsed


# ---------------------------------------------------------------------------
# Prompt builders — PHẢI khớp nội dung với codebase/ai-service.js
# ---------------------------------------------------------------------------

def build_question_bank_prompt(lesson_title, source_text, per_difficulty=4):
    return f"""Bạn là hệ thống sinh câu hỏi ôn tập Active Recall cho nền tảng học online VLearn.

BÀI HỌC: "{lesson_title}"

NỘI DUNG TÀI LIỆU (đã trích từ PDF/slide/transcript, có đánh dấu vị trí dạng nhãn trong ngoặc vuông, ví dụ [Trang N] hoặc [Txx-NNN]):
\"\"\"
{source_text[:12000]}
\"\"\"

YÊU CẦU BẮT BUỘC:
1. Chỉ sinh câu hỏi dựa TRÊN NỘI DUNG TÀI LIỆU ở trên. Tuyệt đối không dùng kiến thức ngoài tài liệu, không bịa.
2. Sinh đúng 3 mức độ khó: "easy", "medium", "hard" — mỗi mức tối đa {per_difficulty} câu.
3. Mỗi câu là trắc nghiệm 4 lựa chọn, đúng 1 đáp án đúng.
4. Mỗi câu PHẢI có "citation": lấy đúng nhãn trong ngoặc vuông gần nhất trong tài liệu mà câu hỏi dựa vào (ví dụ "Trang 3" hoặc "T01-005").
5. Mỗi câu có "explanationCorrect" (vì sao đáp án đúng, bám tài liệu) và "explanationIncorrect" (ngộ nhận phổ biến khiến học viên chọn sai).
6. Nếu tài liệu không đủ căn cứ để sinh đủ {per_difficulty} câu cho một mức, hãy sinh ÍT HƠN và liệt kê vào "skippedTopics" kèm lý do — KHÔNG được bịa câu hỏi cho đủ số lượng.

Trả về DUY NHẤT một JSON đúng schema sau, không kèm chữ nào khác ngoài JSON, không dùng markdown code fence:
{{
  "questions": [
    {{
      "difficulty": "easy" | "medium" | "hard",
      "question": string,
      "options": [string, string, string, string],
      "correctIndex": number,
      "explanationCorrect": string,
      "explanationIncorrect": string,
      "citation": string
    }}
  ],
  "skippedTopics": [
    {{ "difficulty": "easy" | "medium" | "hard", "reason": string }}
  ]
}}"""


def build_analysis_prompt(lesson_title, graded_questions):
    lines = "\n".join(
        f'Câu {idx + 1} [{q["difficulty"]}] ({q.get("citation", "?")}): '
        f'"{q["question"]}" — Học viên trả lời: {"ĐÚNG" if q["isCorrect"] else "SAI"}'
        for idx, q in enumerate(graded_questions)
    )

    return f"""Bạn là trợ lý phân tích kết quả Active Recall Quiz cho bài học "{lesson_title}" trên nền tảng VLearn.

KẾT QUẢ BÀI LÀM:
{lines}

YÊU CẦU:
1. "weakTopics": tối đa 3 chủ đề/khái niệm học viên còn yếu, CHỈ dựa trên các câu SAI ở trên — không suy diễn ra ngoài phạm vi các câu đã hỏi.
2. "summary": 2-3 câu tiếng Việt. Nếu số câu ít (dưới 6 câu) hoặc đây là dữ liệu ít ỏi, dùng giọng thận trọng ("bước đầu cho thấy...", "chưa đủ để kết luận chắc chắn..."), không quy kết học viên "mất gốc" hay "yếu toàn diện" chỉ từ vài câu sai.
3. "nextMix": đề xuất số câu dễ/vừa/khó cho LẦN QUIZ TIẾP THEO, tổng đúng bằng {len(graded_questions)}. Quy tắc: tỉ lệ đúng ≥ 80% → tăng tỉ trọng câu khó; tỉ lệ đúng < 50% → tăng tỉ trọng câu dễ; ở giữa → giữ cân bằng, nghiêng nhẹ theo xu hướng.

Trả về DUY NHẤT JSON đúng schema, không kèm chữ nào khác, không dùng markdown code fence:
{{
  "weakTopics": [string],
  "summary": string,
  "nextMix": {{ "easy": number, "medium": number, "hard": number }}
}}"""


def build_chat_intent_prompt(message, available_lessons):
    if available_lessons:
        lesson_list_text = "\n".join(
            f'{i + 1}. lessonId="{l["lessonId"]}" — "{l["lessonTitle"]}"'
            for i, l in enumerate(available_lessons)
        )
    else:
        lesson_list_text = "(Kho câu hỏi hiện đang trống — chưa có bài học nào được đăng.)"

    return f"""Bạn là bộ phân tích ý định cho khung chat của VLearn. Học viên vừa nhắn:
\"\"\"
{message}
\"\"\"

DANH SÁCH BÀI HỌC ĐANG CÓ TRONG KHO CÂU HỎI (chỉ được chọn lessonId trong danh sách này, TUYỆT ĐỐI không được bịa ra bài học không có trong danh sách):
{lesson_list_text}

YÊU CẦU:
1. "isQuizRequest": tin nhắn có phải là yêu cầu làm bài kiểm tra/ôn tập hay không.
2. Nếu có, "lessonId": khớp với MỘT lessonId trong danh sách trên (dựa vào tên bài học được nhắc tới, có thể gần đúng/viết tắt). Nếu không xác định được bài nào, hoặc danh sách đang trống, để null.
3. "requestedCount": số câu học viên muốn, nếu tin nhắn không nhắc tới số câu thì để null (KHÔNG tự bịa một con số).
4. Nếu thông tin chưa đủ để bắt đầu bài (không rõ bài học nào, hoặc kho đang trống, hoặc không khớp bài nào trong danh sách) — đặt "needsClarification": true và viết "clarifyingQuestion" bằng tiếng Việt, hỏi lại đúng 1 câu ngắn gọn để làm rõ. KHÔNG được tự đoán bừa một bài học không chắc chắn.

Trả về DUY NHẤT một JSON đúng schema sau, không kèm chữ nào khác ngoài JSON, không dùng markdown code fence:
{{
  "isQuizRequest": boolean,
  "lessonId": string | null,
  "requestedCount": number | null,
  "needsClarification": boolean,
  "clarifyingQuestion": string | null
}}"""


# ---------------------------------------------------------------------------
# 3 hàm AI cấp cao — cùng chữ ký hành vi với ai-service.js (đặt tên tham số
# theo camelCase cho khớp field JSON/JS, dù không chuẩn PEP8, để tránh lệch)
# ---------------------------------------------------------------------------

def generate_question_bank(lessonTitle, sourceText, perDifficulty=4):
    prompt = build_question_bank_prompt(lessonTitle, sourceText, perDifficulty)
    result = call_gemini("generate_question_bank", prompt)
    return {
        "questions": result.get("questions") or [],
        "skippedTopics": result.get("skippedTopics") or [],
    }


def analyze_quiz_result(lessonTitle, gradedQuestions):
    prompt = build_analysis_prompt(lessonTitle, gradedQuestions)
    result = call_gemini("analyze_quiz_result", prompt)
    return {
        "weakTopics": result.get("weakTopics") or [],
        "summary": result.get("summary") or "",
        "nextMix": result.get("nextMix"),
    }


def parse_quiz_request_from_chat(message, availableLessons=None):
    prompt = build_chat_intent_prompt(message, availableLessons or [])
    result = call_gemini("parse_quiz_chat_request", prompt)
    return {
        "isQuizRequest": bool(result.get("isQuizRequest")),
        "lessonId": result.get("lessonId"),
        "requestedCount": result.get("requestedCount"),
        "needsClarification": bool(result.get("needsClarification")),
        "clarifyingQuestion": result.get("clarifyingQuestion"),
    }


CALLERS = {
    "generateQuestionBank": lambda inp: generate_question_bank(**inp),
    "analyzeQuizResult": lambda inp: analyze_quiz_result(**inp),
    "parseQuizRequestFromChat": lambda inp: parse_quiz_request_from_chat(**inp),
}


# ---------------------------------------------------------------------------
# Evaluators — mỗi hàm trả về (passed: bool, issues: list[str]).
# Issue bắt đầu bằng "[cảnh báo]" là ghi nhận nhưng KHÔNG làm case fail cứng
# (heuristic có thể có false positive, để người đọc bảng kết quả tự xét).
# ---------------------------------------------------------------------------

_TAG_PATTERN = re.compile(r"\[[^\]\n]{1,20}\]")


def evaluate_generate_question_bank(case, result):
    expected = case.get("expected", {})
    source_text = case["input"]["sourceText"]
    questions = result.get("questions", [])
    skipped = result.get("skippedTopics", [])
    issues = []

    valid_tags = {t.strip("[]") for t in _TAG_PATTERN.findall(source_text)}

    for q in questions:
        label = (q.get("question") or "?")[:40]
        if len(q.get("options", [])) != 4:
            issues.append(f"'{label}...' không đủ 4 lựa chọn")
        if not (0 <= q.get("correctIndex", -1) <= 3):
            issues.append(f"'{label}...' correctIndex không hợp lệ: {q.get('correctIndex')}")
        citation = q.get("citation") or ""
        if not citation:
            issues.append(f"'{label}...' thiếu citation")
        elif valid_tags and not any(tag in citation or citation in tag for tag in valid_tags):
            issues.append(f"[cảnh báo] '{label}...' citation '{citation}' không khớp rõ nhãn nào trong tài liệu gốc")

    if expected.get("expect_skipped_topics") and not skipped:
        issues.append(
            "Kỳ vọng có skippedTopics (nội dung không đủ căn cứ) nhưng AI không báo skip nào — nghi ngờ bịa cho đủ số lượng"
        )

    if expected.get("min_per_difficulty"):
        counts = {"easy": 0, "medium": 0, "hard": 0}
        for q in questions:
            if q.get("difficulty") in counts:
                counts[q["difficulty"]] += 1
        for level, min_count in expected["min_per_difficulty"].items():
            if counts.get(level, 0) < min_count:
                issues.append(f"Mức '{level}' chỉ có {counts.get(level, 0)} câu, kỳ vọng >= {min_count}")

    hard_fails = [i for i in issues if not i.startswith("[cảnh báo]")]
    return (len(hard_fails) == 0, issues)


def evaluate_analyze_quiz_result(case, result):
    expected = case.get("expected", {})
    graded = case["input"]["gradedQuestions"]
    total = len(graded)
    issues = []

    next_mix = result.get("nextMix") or {}
    mix_sum = sum(next_mix.get(k, 0) for k in ("easy", "medium", "hard"))
    if mix_sum != total:
        issues.append(f"Tổng nextMix = {mix_sum}, kỳ vọng = {total}")

    if len(result.get("weakTopics", [])) > 3:
        issues.append("weakTopics vượt quá 3 chủ đề")

    if expected.get("direction") == "harder":
        input_hard = sum(1 for q in graded if q["difficulty"] == "hard")
        if next_mix.get("hard", 0) < input_hard:
            issues.append("Tỉ lệ đúng cao nhưng AI không tăng số câu khó cho lần sau")
    elif expected.get("direction") == "easier":
        input_easy = sum(1 for q in graded if q["difficulty"] == "easy")
        if next_mix.get("easy", 0) < input_easy:
            issues.append("Tỉ lệ đúng thấp nhưng AI không tăng số câu dễ cho lần sau")

    if expected.get("expect_cautious_language"):
        summary = (result.get("summary") or "").lower()
        cautious_markers = ["bước đầu", "chưa đủ", "chưa chắc chắn", "cần thêm dữ liệu", "chưa thể kết luận"]
        if not any(m in summary for m in cautious_markers):
            issues.append("[cảnh báo] Số câu ít nhưng summary không rõ giọng thận trọng — có thể đang overclaim")

    hard_fails = [i for i in issues if not i.startswith("[cảnh báo]")]
    return (len(hard_fails) == 0, issues)


def evaluate_parse_quiz_request(case, result):
    expected = case.get("expected", {})
    issues = []

    if "isQuizRequest" in expected and result.get("isQuizRequest") != expected["isQuizRequest"]:
        issues.append(f"isQuizRequest = {result.get('isQuizRequest')}, kỳ vọng {expected['isQuizRequest']}")

    if "lessonId" in expected and result.get("lessonId") != expected["lessonId"]:
        issues.append(f"lessonId = {result.get('lessonId')}, kỳ vọng {expected['lessonId']}")

    if "requestedCount" in expected and result.get("requestedCount") != expected["requestedCount"]:
        issues.append(
            f"requestedCount = {result.get('requestedCount')}, kỳ vọng {expected['requestedCount']}"
        )

    if expected.get("needsClarification"):
        if not result.get("needsClarification"):
            issues.append("Kỳ vọng needsClarification=true (thông tin mơ hồ/ngoài kho) nhưng AI không hỏi lại")
        elif not (result.get("clarifyingQuestion") or "").strip():
            issues.append("needsClarification=true nhưng clarifyingQuestion rỗng")

    hard_fails = [i for i in issues if not i.startswith("[cảnh báo]")]
    return (len(hard_fails) == 0, issues)


EVALUATORS = {
    "generateQuestionBank": evaluate_generate_question_bank,
    "analyzeQuizResult": evaluate_analyze_quiz_result,
    "parseQuizRequestFromChat": evaluate_parse_quiz_request,
}


# ---------------------------------------------------------------------------
# Runner golden set — chạy TRỌN BỘ, ghi nhận cả case fail, xuất % vào eval/
# ---------------------------------------------------------------------------

def load_cases(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["cases"] if isinstance(data, dict) and "cases" in data else data


def validate_golden_set(golden_set_path):
    """Kiểm tra coverage của golden set mà không gọi API AI."""
    cases = load_cases(golden_set_path)
    errors = []
    warnings = []

    case_ids = [case.get("case_id") for case in cases]
    duplicate_ids = sorted({case_id for case_id in case_ids if case_ids.count(case_id) > 1})
    if duplicate_ids:
        errors.append(f"case_id bị trùng: {', '.join(duplicate_ids)}")

    if len(cases) < 20:
        errors.append(f"Golden set chỉ có {len(cases)} case, yêu cầu tối thiểu 20")

    unknown_targets = sorted(
        {
            case.get("target_function")
            for case in cases
            if case.get("target_function") not in CALLERS
        }
    )
    if unknown_targets:
        errors.append(f"target_function không hỗ trợ: {', '.join(map(str, unknown_targets))}")

    missing_fields = []
    for index, case in enumerate(cases, start=1):
        for field in ("case_id", "target_function", "difficulty_class", "source", "input", "expected"):
            if field not in case:
                missing_fields.append(f"case #{index} thiếu '{field}'")
    errors.extend(missing_fields)

    difficulty_counts = {}
    for marker in ("①", "②", "③", "④"):
        difficulty_counts[marker] = sum(
            1 for case in cases if str(case.get("difficulty_class", "")).startswith(marker)
        )
        if difficulty_counts[marker] < 2:
            errors.append(
                f"Lớp chỗ khó {marker} chỉ có {difficulty_counts[marker]} case, yêu cầu tối thiểu 2"
            )

    normal_count = sum(case.get("case_type") == "normal" for case in cases)
    rare_count = sum(case.get("case_type") == "rare" for case in cases)
    real_source_count = sum(
        str(case.get("source", "")).startswith("data/vlearn-pack/") for case in cases
    )

    if not 8 <= normal_count <= 10:
        errors.append(f"case thường = {normal_count}, yêu cầu trong khoảng 8-10")
    if not 2 <= rare_count <= 4:
        errors.append(f"case hiếm = {rare_count}, yêu cầu trong khoảng 2-4")
    if real_source_count < 10:
        errors.append(
            f"case từ chatlog/transcript thật = {real_source_count}, yêu cầu tối thiểu 10"
        )

    if len(cases) > 20:
        warnings.append(
            f"Golden set có {len(cases)} case; rubric chỉ yêu cầu tối thiểu 20, hãy cân nhắc chi phí API"
        )

    summary = {
        "total_cases": len(cases),
        "normal_cases": normal_count,
        "rare_cases": rare_count,
        "real_source_cases": real_source_count,
        "difficulty_class_counts": difficulty_counts,
        "errors": errors,
        "warnings": warnings,
        "valid": not errors,
    }
    return summary


def run_golden_set(golden_set_path, out_path):
    cases = load_cases(golden_set_path)
    results = []
    passed_count = 0

    for case in cases:
        case_id = case["case_id"]
        target = case["target_function"]
        print(f"[{case_id}] gọi {target} ...", file=sys.stderr)

        try:
            output = CALLERS[target](case["input"])
            ok, issues = EVALUATORS[target](case, output)
        except Exception as e:
            output = None
            ok = False
            issues = [f"Lỗi khi gọi AI: {e}"]

        if ok:
            passed_count += 1

        results.append(
            {
                "case_id": case_id,
                "target_function": target,
                "difficulty_class": case.get("difficulty_class"),
                "case_type": case.get("case_type"),
                "source": case.get("source"),
                "status": "PASS" if ok else "FAIL",
                "issues": issues,
                "output": output,
            }
        )

    total = len(cases)
    pct = round(passed_count / total * 100, 1) if total else 0.0

    generated_questions = [
        question
        for result in results
        if result["target_function"] == "generateQuestionBank" and result["output"]
        for question in result["output"].get("questions", [])
    ]
    cited_questions = sum(
        bool((question.get("citation") or "").strip()) for question in generated_questions
    )
    citation_rate = (
        round(cited_questions / len(generated_questions) * 100, 1)
        if generated_questions
        else 0.0
    )
    quality_bar = {
        "case_pass_rate_target_pct": 85.0,
        "citation_presence_target_pct": 100.0,
        "case_pass_rate_met": pct >= 85.0,
        "citation_presence_pct": citation_rate,
        "citation_presence_met": bool(generated_questions) and citation_rate == 100.0,
    }
    quality_bar["overall_met"] = (
        quality_bar["case_pass_rate_met"] and quality_bar["citation_presence_met"]
    )

    run_record = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "golden_set": golden_set_path,
        "model": get_model(),
        "total_cases": total,
        "passed": passed_count,
        "pass_rate_pct": pct,
        "quality_bar": quality_bar,
        "results": results,
    }

    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(run_record, f, ensure_ascii=False, indent=2)

    print(f"\n=== KẾT QUẢ: {passed_count}/{total} case PASS ({pct}%) ===")
    print(f"Đã ghi chi tiết (kể cả case FAIL) vào {out_path}")
    return run_record


def main():
    parser = argparse.ArgumentParser(
        description="Chạy golden set offline cho VLearn AI tool (dùng cho R4 - Kiểm thử)"
    )
    parser.add_argument("--golden-set", default="eval/golden_set.json")
    parser.add_argument(
        "--out", default=None, help="Mặc định: eval/run_results_<timestamp>.json"
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Chỉ kiểm tra cấu trúc/coverage golden set, không gọi Gemini API",
    )
    args = parser.parse_args()

    if args.validate_only:
        summary = validate_golden_set(args.golden_set)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        raise SystemExit(0 if summary["valid"] else 1)

    out_path = args.out or f"eval/run_results_{int(time.time())}.json"
    run_golden_set(args.golden_set, out_path)


if __name__ == "__main__":
    main()
