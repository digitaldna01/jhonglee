"""scripts/style_check.py — the regex voice checks (pure)."""
from __future__ import annotations

from style_check import check  # scripts/ is on the path (pyproject.toml)


def test_hapsyo_endings_flagged():
    assert check("반갑습니다.") != []
    assert check("확인해 보십시오.") != []
    assert check("무엇을 도와드립니까?") != []  # ~ㅂ니까 interrogative
    assert check("그 자료가 있습니까?") != []
    assert check("문서 끝에 있습니다") != []  # end of string, no punctuation


def test_haeyo_and_english_are_clean():
    assert check("그건 상태 벡터를 쓰는 프로젝트예요. 자세한 건 포스트에 있어요.") == []
    assert check("It's a k-means visualization. The post walks through it.") == []


def test_connective_nikka_is_not_hapsyo():
    assert check("직접 써 보니까 재밌더라고요.") == []
    assert check("데이터가 작으니까 배치 하나로 충분해요.") == []


def test_emoji_flagged():
    assert check("좋아요 😊") != []
    assert check("완료 ✅") != []
    assert check("문장 부호는 괜찮아요 — 정말요… (그럼요·네)") == []


def test_exclamation_marks_at_most_one():
    assert check("반가워요!") == []
    assert check("반가워요! 정말요!") != []
    assert check("반가워요! 정말요！") != []  # full-width counts too


def test_multiple_issues_reported_separately():
    issues = check("감사합니다! 최고예요! 🎉")
    assert len(issues) == 3
