# Apple 스타일 및 반응형 UI

공통 색상·타이포그래피·여백은 `src/apple-ui.css`에서 관리합니다. 밝은 중립색 배경과 단순한 표면, 시스템 글꼴, 파란색 주요 액션을 사용하며 다크 모드는 같은 토큰의 색상을 바꿉니다.

1024px 이하에서는 사이드바를 서랍 메뉴로 표시하고, 760px 이하에서는 하단 탐색 메뉴를 표시합니다. 화면별 콘텐츠는 사용 가능한 너비에 맞춰 줄바꿈하거나 카드형 배치로 바뀝니다. 차트와 표처럼 가로 공간이 필요한 콘텐츠는 해당 영역 안에서 스크롤합니다.

`main.tsx`의 마지막 CSS import 순서는 공통 디자인 다음에 `planning-responsive.css`, `study-responsive.css`, `portal-responsive.css`, `utility-responsive.css`입니다. 이 파일들은 이전 스타일의 열 수 불일치, 고정 너비, 선택자 불일치 등을 화면별로 보정합니다. 지연 로딩되는 페이지의 CSS를 추가할 때는 실제 브라우저의 최종 스타일 우선순위도 확인하세요.

## 실행

```bash
npm ci
npm run dev -- --host 0.0.0.0
npm run build
```

## 브라우저 검증

앱 의존성을 바꾸지 않고 Playwright를 별도 경로에 설치해 실행할 수 있습니다. 시스템 Chromium이 없으면 `CHROMIUM_PATH`로 실행 파일을 지정하세요.

```bash
npm install --prefix /tmp/trinity-browser-tools --no-save --package-lock=false playwright
node tests/responsive-browser.mjs
UI_CHECK_PRODUCTION=1 UI_CHECK_PORT=4177 node tests/responsive-browser.mjs
```

320·390·768·1024·1440px에서 학생 페이지, 탭, 모달, 설정, 메뉴를 검사합니다. API는 격리된 fixture로 응답하므로 실제 계정이나 서버 데이터를 수정하지 않습니다. 결과 JSON과 스크린샷은 기본적으로 `/tmp/trinity-ui-check`에 저장합니다.

`npm test`는 134개 중 128개를 통과합니다. 남은 6개는 원본에서도 재현되는 AI graph 연결, Coach 과목 fixture, NVIDIA 모델 기본값 2건, Arena 계산 비교, sync 테스트의 D1 mock 문제입니다. UI 관련 테스트와 TypeScript/프로덕션 빌드는 통과합니다.
