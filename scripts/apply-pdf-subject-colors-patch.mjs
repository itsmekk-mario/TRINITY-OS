import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value, 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const required = [
  'src/App.tsx',
  'src/pages/ResourceLibrary.tsx',
  'src/types.ts',
  'src/lib/storage.ts',
  'src/main.tsx',
  'package.json',
];
for (const file of required) {
  if (!exists(file)) throw new Error(`TRINITY OS 루트에서 실행해 주세요. 파일 없음: ${file}`);
}

const backupRoot = path.join(
  root,
  `.trinity-patch-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
fs.mkdirSync(backupRoot, { recursive: true });
for (const file of required) {
  const dest = path.join(backupRoot, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, file), dest);
}

function replaceOnce(file, search, replacement, label) {
  let value = read(file);
  if (value.includes(replacement)) return false;
  if (!value.includes(search)) {
    throw new Error(`${file}: ${label} 기준점을 찾지 못했습니다. 최신 main인지 확인해 주세요.`);
  }
  value = value.replace(search, replacement);
  write(file, value);
  return true;
}

// 1) dependency
{
  const pkg = JSON.parse(read('package.json'));
  pkg.dependencies ??= {};
  pkg.dependencies['pdfjs-dist'] = pkg.dependencies['pdfjs-dist'] || '^4.10.38';
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}

// 2) global stylesheet import
replaceOnce(
  'src/main.tsx',
  "import './trinity-ui-v3.css';",
  "import './trinity-ui-v3.css';\nimport './subject-system.css';",
  'subject-system.css import',
);

// 3) AppData field
replaceOnce(
  'src/types.ts',
  '  quotes: string[];\n  examDate: string;',
  '  quotes: string[];\n  subjectColors?: Record<string, string>;\n  examDate: string;',
  'AppData.subjectColors',
);

// 4) defaults
replaceOnce(
  'src/lib/storage.ts',
  '  quotes: quotesSeed,\n  examDate: EXAM_DATE,',
  '  quotes: quotesSeed,\n  subjectColors: {},\n  examDate: EXAM_DATE,',
  'initialData.subjectColors',
);

// 5) App imports + runtime rules + Settings palette
replaceOnce(
  'src/App.tsx',
  'import { APP_VERSION, addCustomSubject, removeCustomSubject, SUBJECTS } from "./data/config";',
  'import { APP_VERSION, addCustomSubject, removeCustomSubject, SUBJECTS } from "./data/config";\nimport { applySubjectColorRules, buildDefaultSubjectColors, getSubjectColor, SUBJECT_COLOR_PALETTE } from "./lib/subjectColors";',
  'subject color helper import',
);

replaceOnce(
  'src/App.tsx',
  `  useEffect(() => {
    document.documentElement.dataset.beginner = beginnerMode ? "true" : "false";
    localStorage.setItem(BEGINNER_KEY, String(beginnerMode));
  }, [beginnerMode]);`,
  `  useEffect(() => {
    document.documentElement.dataset.beginner = beginnerMode ? "true" : "false";
    localStorage.setItem(BEGINNER_KEY, String(beginnerMode));
  }, [beginnerMode]);
  useEffect(() => {
    applySubjectColorRules(data.subjectColors, SUBJECTS);
  }, [data.subjectColors]);`,
  'subject color runtime effect',
);

replaceOnce(
  'src/App.tsx',
  `  const changeTheme = (next: ThemePreference) => {
    localStorage.setItem(THEME_KEY, next);
    setThemePreference(next);
  };
  const changeBeginnerMode = (next: boolean) => {`,
  `  const changeTheme = (next: ThemePreference) => {
    localStorage.setItem(THEME_KEY, next);
    setThemePreference(next);
  };
  const changeSubjectColor = (subject: string, color: string) => {
    setData((value) => ({
      ...value,
      subjectColors: { ...(value.subjectColors ?? {}), [subject]: color },
    }));
  };
  const resetSubjectColors = () => {
    setData((value) => ({
      ...value,
      subjectColors: buildDefaultSubjectColors(SUBJECTS),
    }));
  };
  const changeBeginnerMode = (next: boolean) => {`,
  'subject color state actions',
);

replaceOnce(
  'src/App.tsx',
  `          </section>
              <div className="inline-settings">`,
  `          </section>
          <section
            className="subject-color-setting"
            aria-labelledby="subject-color-setting-title"
          >
            <div className="subject-color-setting-head">
              <div>
                <b id="subject-color-setting-title">과목 색상</b>
                <p>배지·학습 기록에서 사용하는 과목별 강조색입니다. 선택 즉시 모든 화면에 반영됩니다.</p>
              </div>
              <button className="button subject-color-reset" type="button" onClick={resetSubjectColors}>
                기본값 복원
              </button>
            </div>
            <div className="subject-color-rows">
              {SUBJECTS.map((subject) => {
                const current = getSubjectColor(subject, data.subjectColors);
                return (
                  <div className="subject-color-row" key={subject}>
                    <div className="subject-color-name">
                      <span
                        className="subject-color-preview"
                        style={{ backgroundColor: current, color: current }}
                        aria-hidden="true"
                      />
                      <span>{subject}</span>
                    </div>
                    <div className="subject-color-palette" role="group" aria-label={\`{subject} 색상 선택\`}>
                      {SUBJECT_COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="subject-color-swatch"
                          aria-label={\`{subject} 색상 {color}\`}
                          aria-pressed={current.toUpperCase() === color.toUpperCase()}
                          style={{ backgroundColor: color, color }}
                          onClick={() => changeSubjectColor(subject, color)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
              <div className="inline-settings">`.replaceAll('\u001b{', '${'),
  'Settings subject palette',
);

replaceOnce(
  'src/App.tsx',
  `                      if (added) { setToast(\`${'${subjectDraft.trim()}'} 과목을 추가했습니다.\`); setSubjectDraft(""); window.setTimeout(() => setToast(""), 2500); }
                      else if (!subjectDraft.trim()) setToast("과목명을 입력해 주세요.");`,
  `                      if (added) {
                        const addedSubject = subjectDraft.trim();
                        setData((value) => ({
                          ...value,
                          subjectColors: {
                            ...(value.subjectColors ?? {}),
                            [addedSubject]: getSubjectColor(addedSubject, value.subjectColors),
                          },
                        }));
                        setToast(\`${'${addedSubject}'} 과목을 추가했습니다.\`);
                        setSubjectDraft("");
                        window.setTimeout(() => setToast(""), 2500);
                      }
                      else if (!subjectDraft.trim()) setToast("과목명을 입력해 주세요.");`,
  'custom subject color initialization',
);

replaceOnce(
  'src/App.tsx',
  `                          if (removeCustomSubject(subject)) {
                            setToast(\`${'${subject}'} 과목을 삭제했습니다.\`);`,
  `                          if (removeCustomSubject(subject)) {
                            setData((value) => {
                              const nextSubjectColors = { ...(value.subjectColors ?? {}) };
                              delete nextSubjectColors[subject];
                              return { ...value, subjectColors: nextSubjectColors };
                            });
                            setToast(\`${'${subject}'} 과목을 삭제했습니다.\`);`,
  'custom subject color cleanup',
);

// 6) ResourceLibrary: native iframe -> PDF.js continuous viewer
replaceOnce(
  'src/pages/ResourceLibrary.tsx',
  "import { Progress } from '../components/Ui';",
  "import { Progress } from '../components/Ui';\nimport PdfViewer from '../components/PdfViewer';",
  'PdfViewer import',
);

replaceOnce(
  'src/pages/ResourceLibrary.tsx',
  `{pdf&&<div className="pdf-viewer-backdrop"><div className="pdf-viewer"><header><b>{active?.name??'PDF'}</b><button className="icon-button" aria-label="PDF 닫기" onClick={()=>{URL.revokeObjectURL(pdf);setPdf('');}}><X/></button></header><iframe title="개인 PDF" src={pdf}/></div></div>}`,
  `{pdf&&<PdfViewer url={pdf} title={active?.name??'PDF'} onClose={()=>{URL.revokeObjectURL(pdf);setPdf('');}}/>}`,
  'iframe PDF viewer replacement',
);

console.log('✓ TRINITY OS PDF 다중 페이지 + 과목 색상 팔레트 패치를 적용했습니다.');
console.log(`✓ 원본 백업: ${path.relative(root, backupRoot)}`);
console.log('다음 명령: npm install && npm run build');
