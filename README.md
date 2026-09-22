# TRINITY OS — Math Recording Patch

수학 기록에서 수식과 함수 그래프를 작성하고 저장된 기록에서도 다시 렌더링하도록 하는 패치입니다.

## 적용 범위

- Wrong Answer / Quick Capture
- Daily Drill / Weekly Drill
- Learning Archive 수학 분석
- Core Rule / Learning Intelligence
- Review Queue
- 실모 분석
- TRINITY 수학 분석
- Journal / PLAiRE를 포함해 공용 `TextArea`를 쓰는 기록 입력란

기존 데이터 스키마는 바꾸지 않습니다. 문자열 안에 다음 표기를 저장합니다.

- 인라인 수식: `$x^2 + 2x + 1$`
- 큰 수식: `$$x^2 + y^2 = 1$$`
- 그래프: `[[graph:y=sin(x);range=-6.28,6.28]]`

지원 연산: `+ - * / ^ = < > <= >=` (화면에서는 `≤`, `≥`도 입력 가능)

지원 함수: `sin`, `cos`, `tan`, `sqrt`, `abs`, `log`, `ln`, `exp`, `pow`, `min`, `max`

## Codespaces 적용

저장소 최신 `main`에서 아래 순서로 실행합니다.

```bash
git pull origin main
unzip -o TRINITY-OS-math-recording-patch.zip -d .
node apply-math-recording.mjs
npm ci
npm test
npm run build
git status
git add .
git commit -m "feat: add math formula and graph recording"
git push origin main
```

## 확인 시나리오

1. Train → Wrong Answers → Quick Capture에서 `$x^2+1$` 입력 후 저장.
2. `수식 · 그래프` 버튼 → `y=x^2` → x 범위 `-5`, `5` → 그래프 삽입.
3. Wrong Answer 상세에서 수식과 그래프가 다시 렌더링되는지 확인.
4. Learning Archive → 수학 Entry → 조건 요약/표상/풀이 흐름에서도 동일하게 확인.
5. Core Rule에 수식/그래프를 저장한 뒤 Core Rules 및 Intelligence에서 다시 표시되는지 확인.
6. 다크 모드에서 입력창, 수식, 축, 그래프 선의 대비 확인.

## 설계상 특징

그래프 함수 계산에 `eval`/`Function`을 사용하지 않습니다. 자체 수식 파서가 허용된 연산과 함수만 계산합니다.
