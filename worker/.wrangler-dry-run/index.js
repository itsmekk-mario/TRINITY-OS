var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/teacherSignals.ts
var subjects = ["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uD0D0\uAD6C"];
var text = /* @__PURE__ */ __name((value, max = 1200) => typeof value === "string" ? value.trim().slice(0, max) : "", "text");
function readSignal(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && ["subject_teacher", "academic_manager"].includes(parsed.sourceRole) && ["subject_teacher", "academic_manager"].includes(parsed.targetRole) && subjects.includes(parsed.subject) && ["open", "accepted", "resolved", "dismissed"].includes(parsed.status) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
__name(readSignal, "readSignal");
function newSignal(value, role, assignedSubject) {
  if (value === void 0 || value === null) return void 0;
  if (!value || typeof value !== "object" || !["subject_teacher", "academic_manager"].includes(role)) throw new Error("Invalid signal");
  const input = value;
  const subject = role === "subject_teacher" ? assignedSubject : input.subject;
  if (!subjects.includes(String(subject))) throw new Error("Invalid subject");
  const signal = {
    sourceRole: role,
    targetRole: role === "subject_teacher" ? "academic_manager" : "subject_teacher",
    subject,
    priority: ["low", "medium", "high"].includes(String(input.priority)) ? input.priority : "medium",
    type: role === "subject_teacher" ? input.type === "intervention" ? "intervention" : "diagnosis" : input.type === "execution_issue" ? "execution_issue" : "reassessment_request",
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter((item) => typeof item === "string").map((item) => text(item, 100)).slice(0, 20) : [],
    status: "open"
  };
  return input.weeklyGoal || input.dailyDrill ? { ...updateSignal(signal, input), status: "open" } : signal;
}
__name(newSignal, "newSignal");
function updateSignal(previous, body) {
  const next = { ...previous };
  if (body.status !== void 0) {
    if (!["open", "accepted", "resolved", "dismissed"].includes(String(body.status))) throw new Error("Invalid status");
    next.status = body.status;
  }
  if (body.weeklyGoal) {
    const value = body.weeklyGoal;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.weekStart)) || !text(value.ability)) throw new Error("Invalid goal");
    next.weeklyGoal = { weekStart: String(value.weekStart), subject: previous.subject, ability: text(value.ability, 160), successCriterion: text(value.successCriterion), drillDesign: text(value.drillDesign), evidence: text(value.evidence, 2e3) };
    next.status = "accepted";
  }
  if (body.dailyDrill) {
    const value = body.dailyDrill, minutes = Number(value.minutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) || !text(value.title) || !Number.isFinite(minutes) || minutes < 1 || minutes > 360) throw new Error("Invalid drill");
    next.dailyDrill = { date: String(value.date), subject: previous.subject, title: text(value.title, 160), action: text(value.action), successCriterion: text(value.successCriterion), minutes: Math.round(minutes) };
    next.status = "accepted";
  }
  return next;
}
__name(updateSignal, "updateSignal");

// src/collaboration.ts
var clean = /* @__PURE__ */ __name((value, max = 1200) => typeof value === "string" ? value.trim().slice(0, max) : "", "clean");
var asArray = /* @__PURE__ */ __name((value, max = 8) => Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => clean(item, 80)).filter(Boolean).slice(0, max) : [], "asArray");
var permissions = /* @__PURE__ */ __name((value) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}, "permissions");
var allowed = /* @__PURE__ */ __name((assignment, permission) => assignment.role === "academic_manager" || assignment.role === "admin" || permissions(assignment.permissions_json)[permission] === true, "allowed");
var outData = /* @__PURE__ */ __name((data, assignment) => {
  const manager = assignment.role === "academic_manager" || assignment.role === "admin";
  const parent = assignment.role === "parent";
  const subject = assignment.subject;
  const p = permissions(assignment.permissions_json);
  const isSubject = /* @__PURE__ */ __name((item) => manager || parent || !subject || item.subject === subject, "isSubject");
  const sessions2 = allowed(assignment, "viewSessions") ? (data.sessions ?? []).filter(isSubject).map(({ id, subject: subject2, date, seconds: seconds2 }) => ({ id, subject: subject2, date, seconds: seconds2 })) : [];
  const scores = allowed(assignment, "viewScores") || allowed(assignment, "viewMockExams") ? (data.scores ?? []).map((score) => parent ? { id: score.id, date: score.date, name: score.name, korean: score.korean, math: score.math, english: score.english } : manager ? { id: score.id, date: score.date, name: score.name, subject: score.subject, korean: score.reviews?.\uAD6D\uC5B4?.score ?? score.korean, math: score.reviews?.\uC218\uD559?.score ?? score.math, english: score.reviews?.\uC601\uC5B4?.score ?? score.english, duration: score.duration, errorType: score.errorType } : { id: score.id, date: score.date, name: score.name, subject, score: subject === "\uC218\uD559" ? score.reviews?.\uC218\uD559?.score ?? score.math : subject === "\uAD6D\uC5B4" ? score.reviews?.\uAD6D\uC5B4?.score ?? score.korean : subject === "\uC601\uC5B4" ? score.reviews?.\uC601\uC5B4?.score ?? score.english : void 0, duration: score.subject === subject ? score.duration : score.reviews?.[subject]?.duration, errorType: score.subject === subject ? score.errorType : void 0 }).filter((score) => manager || parent || score.score !== void 0) : [];
  const plans2 = allowed(assignment, "viewCalendar") ? Object.values(data.calendar ?? {}).flatMap((day2) => (day2.plans ?? []).filter(isSubject).map((plan) => ({ id: plan.id, date: day2.date, subject: plan.subject, title: plan.title, done: plan.done, quantity: plan.quantity }))) : [];
  const calendarDays = allowed(assignment, "viewCalendar") ? Object.values(data.calendar ?? {}).map((day2) => ({ date: day2.date, study: day2.study, minutes: day2.minutes, exam: day2.exam, event: day2.event, condition: day2.condition, reflection: manager ? day2.reflection : void 0 })) : [];
  const wrongAnswerDrills = allowed(assignment, "viewWrongAnswers") && !parent ? (data.wrongAnswerDrills ?? []).filter(isSubject).map(({ id, date, subject: subject2, source, question, bottleneck, wrongJudgment, missedCue, correction, transfer, scoreId, capabilityGoalId, retries }) => ({ id, date, subject: subject2, source, question, bottleneck, wrongJudgment, missedCue, correction, transfer, scoreId, capabilityGoalId, retries })) : [];
  const weeklyCapabilityGoals = allowed(assignment, "viewWeeklyGoals") ? (data.weeklyCapabilityGoals ?? []).filter(isSubject).map(({ id, weekStart, subject: subject2, ability, successCriterion, drillDesign, evidence, feedbackId, done }) => ({ id, weekStart, subject: subject2, ability, successCriterion: parent ? void 0 : successCriterion, drillDesign: parent ? void 0 : drillDesign, evidence: parent ? void 0 : evidence, feedbackId, done })) : [];
  const dailyDrills = allowed(assignment, "viewDrills") ? (data.dailyDrills ?? []).filter(isSubject).map(({ id, date, subject: subject2, title, action, successCriterion, capabilityGoalId, feedbackId, done, minutes }) => ({ id, date, subject: subject2, title, action: parent ? void 0 : action, successCriterion: parent ? void 0 : successCriterion, capabilityGoalId, feedbackId, done, minutes })) : [];
  const resources = (data.resources ?? []).filter(isSubject).map(({ id, subject: subject2, name, total, done }) => ({ id, subject: subject2, name, total, done }));
  const plaire = !parent && manager ? Object.values(data.plaire ?? {}).map(({ date, bottleneck, nextAction }) => ({ date, bottleneck, nextAction })) : [];
  const trinity = !parent && allowed(assignment, "viewAcademicInsights") ? (data.trinity ?? []).filter(isSubject).map(({ id, date, subject: subject2, fields }) => ({ id, date, subject: subject2, fields })) : [];
  const monthlyPlans = allowed(assignment, "viewWeeklyGoals") ? (data.monthlyPlans ?? []).filter(isSubject).map(({ id, month, subject: subject2, title, objective, strategy, successCriterion, done }) => ({ id, month, subject: subject2, title, objective: parent ? void 0 : objective, strategy: parent ? void 0 : strategy, successCriterion: parent ? void 0 : successCriterion, done })) : [];
  const routine = allowed(assignment, "viewCalendar") ? (data.routine ?? []).filter(isSubject).map(({ id, time, subject: subject2, title, detail }) => ({ id, time, subject: subject2, title, detail: parent ? void 0 : detail })) : [];
  const goals = allowed(assignment, "viewWeeklyGoals") ? (data.goals ?? []).filter(isSubject).map(({ id, subject: subject2, text: text4, done }) => ({ id, subject: subject2, text: text4, done })) : [];
  const access = { sessions: allowed(assignment, "viewSessions"), scores: allowed(assignment, "viewScores") || allowed(assignment, "viewMockExams"), wrongAnswers: !parent && allowed(assignment, "viewWrongAnswers"), weeklyGoals: allowed(assignment, "viewWeeklyGoals"), drills: allowed(assignment, "viewDrills"), trinity: !parent && allowed(assignment, "viewAcademicInsights") };
  return { access, sessions: sessions2, scores, plans: plans2, calendarDays, wrongAnswerDrills, weeklyCapabilityGoals, dailyDrills, resources, plaire, trinity, monthlyPlans, routine, goals };
}, "outData");
async function teacherArena(env, studentUserId, role) {
  if (role !== "academic_manager" && role !== "admin") return void 0;
  const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('arena_score_snapshots','arena_seasons','arena_achievements','arena_groups','arena_group_members')").all();
  if (tables.results.length !== 5) return { snapshots: [], achievements: [], groups: [] };
  const columns = await env.DB.prepare("PRAGMA table_info(arena_score_snapshots)").all(), v2 = columns.results.some((v) => v.name === "score_version");
  const snapshotSql = v2 ? "SELECT s.id,s.week_start,s.score,s.execution,s.mastery,s.performance,s.consistency,s.growth,s.score_version,s.calculated_at,t.name season FROM arena_score_snapshots s JOIN arena_seasons t ON t.id=s.season_id WHERE s.user_id=? AND s.score_version=2 ORDER BY s.week_start DESC,s.calculated_at DESC LIMIT 104" : "SELECT s.id,s.week_start,s.score,s.execution,0 mastery,s.problem_solving performance,s.consistency,s.growth,1 score_version,s.calculated_at,t.name season FROM arena_score_snapshots s JOIN arena_seasons t ON t.id=s.season_id WHERE s.user_id=? ORDER BY s.week_start DESC,s.calculated_at DESC LIMIT 104";
  const [snapshots, achievements2, groups] = await Promise.all([
    env.DB.prepare(snapshotSql).bind(studentUserId).all(),
    env.DB.prepare("SELECT id,title,description,awarded_at FROM arena_achievements WHERE user_id=? ORDER BY awarded_at DESC").bind(studentUserId).all(),
    env.DB.prepare("SELECT g.id,g.name,g.type FROM arena_groups g JOIN arena_group_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.name").bind(studentUserId).all()
  ]);
  return { snapshots: snapshots.results, achievements: achievements2.results, groups: groups.results };
}
__name(teacherArena, "teacherArena");
async function state(env, studentUserId) {
  const row = await env.DB.prepare("SELECT payload FROM learning_state WHERE user_id=?").bind(studentUserId).first();
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}
__name(state, "state");
async function studentByPublicId(env, publicId) {
  return env.DB.prepare("SELECT id,username,arena_public_id FROM users WHERE arena_public_id=? AND active=1").bind(publicId).first();
}
__name(studentByPublicId, "studentByPublicId");
async function assignmentFor(env, account, publicId) {
  const student = await studentByPublicId(env, publicId);
  if (!student) return null;
  if (account.role === "admin") return { assignment: { id: "admin", student_user_id: student.id, support_account_id: account.id, role: "admin", subject: null, permissions_json: "{}", created_at: "" }, student };
  const assignment = await env.DB.prepare("SELECT * FROM student_support_assignments WHERE support_account_id=? AND student_user_id=? AND role=? ORDER BY created_at DESC LIMIT 1").bind(account.id, student.id, account.role).first();
  return assignment ? { assignment, student } : null;
}
__name(assignmentFor, "assignmentFor");
var feedbackRow = /* @__PURE__ */ __name((row) => ({ ...row, categories: (() => {
  try {
    return JSON.parse(String(row.categories_json ?? "[]"));
  } catch {
    return [];
  }
})(), signal: readSignal(row.signal_json), acknowledgedByStudent: Boolean(row.acknowledged_at) }), "feedbackRow");
var feedbackContext = /* @__PURE__ */ __name((body) => ({ type: ["general", "mock_exam", "wrong_answer", "drill", "weekly_goal", "subject_progress", "statistics", "resource", "weekly_plan"].includes(String(body.contextType)) ? String(body.contextType) : "general", targetId: clean(body.contextTargetId, 100) || null }), "feedbackContext");
async function collaboration(request, env, owner2, account, origin, h, studentActor = null) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith("/api/collab/")) return null;
  const out = /* @__PURE__ */ __name((body, status = 200) => h.json(body, status, origin), "out");
  try {
    if (!studentActor && !account) return out({ error: "Unauthorized" }, 401);
    if (path === "/api/collab/student/feedback" && method === "GET") {
      if (!studentActor) return out({ error: "Student session required" }, 403);
      const rows2 = await env.DB.prepare("SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_user_id=? ORDER BY CASE f.progress WHEN 'active' THEN 0 ELSE 1 END,f.created_at DESC LIMIT 100").bind(studentActor.id).all();
      return out({ feedback: rows2.results.map(feedbackRow) });
    }
    const studentFeedback = path.match(/^\/api\/collab\/student\/feedback\/([^/]+)\/(acknowledge|apply)$/);
    if (studentFeedback && method === "POST") {
      if (!studentActor) return out({ error: "Student session required" }, 403);
      const [, id, operation] = studentFeedback;
      const feedback = await env.DB.prepare("SELECT id FROM teacher_feedback WHERE id=? AND student_user_id=?").bind(id, studentActor.id).first();
      if (!feedback) return out({ error: "Feedback not found" }, 404);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (operation === "acknowledge") await env.DB.prepare("UPDATE teacher_feedback SET acknowledged_at=?,updated_at=? WHERE id=? AND student_user_id=?").bind(now, now, id, studentActor.id).run();
      else {
        const body = await h.boundedJson(request);
        const column = body.target === "weekly_goal" ? "linked_weekly_goal_id" : body.target === "daily_drill" ? "linked_daily_drill_id" : "";
        const linked = clean(body.linkedId, 100);
        if (!column || !linked) return out({ error: "Invalid feedback link" }, 400);
        await env.DB.prepare(`UPDATE teacher_feedback SET ${column}=?,acknowledged_at=COALESCE(acknowledged_at,?),updated_at=? WHERE id=? AND student_user_id=?`).bind(linked, now, now, id, studentActor.id).run();
      }
      return out({ ok: true });
    }
    if (!account) return out({ error: "Support session required" }, 403);
    const archiveRoute = path.match(/^\/api\/collab\/students\/([^/]+)\/archive$/);
    if (archiveRoute && method === "GET") {
      const access2 = await assignmentFor(env, account, archiveRoute[1]);
      if (!access2 || access2.assignment.role === "parent" || !allowed(access2.assignment, "viewWrongAnswers") && !allowed(access2.assignment, "viewAcademicInsights")) return out({ error: "Archive permission required" }, 403);
      const subject = access2.assignment.role === "subject_teacher" && access2.assignment.subject ? access2.assignment.subject === "\uAD6D\uC5B4" ? "korean" : access2.assignment.subject === "\uC218\uD559" ? "math" : access2.assignment.subject === "\uC601\uC5B4" ? "english" : "__none__" : null;
      const entries = await env.DB.prepare(`SELECT e.id,e.subject,e.year,e.month,e.institution,e.exam_name examName,e.source_name sourceName,e.question_number questionNumber,e.category,e.subcategory,e.title,e.studied_at studiedAt,e.mastery_status masteryStatus,e.memo,e.review_enabled reviewEnabled FROM archive_entries e WHERE e.user_id=? ${subject ? "AND e.subject=?" : ""} ORDER BY e.studied_at DESC LIMIT 300`).bind(access2.student.id, ...subject ? [subject] : []).all();
      const ids = entries.results.map((item) => String(item.id));
      if (!ids.length) return out({ entries: [] });
      const marks = ids.map(() => "?").join(",");
      const [annotations, rules] = await Promise.all([env.DB.prepare(`SELECT archive_entry_id entryId,color,type,text,sort_order sortOrder FROM archive_annotations WHERE archive_entry_id IN (${marks}) ORDER BY sort_order`).bind(...ids).all(), env.DB.prepare(`SELECT l.archive_entry_id entryId,r.id,r.title,r.content,r.tags_json tagsJson,r.mastery_status masteryStatus FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id WHERE l.archive_entry_id IN (${marks}) AND r.user_id=?`).bind(...ids, access2.student.id).all()]);
      return out({ entries: entries.results.map((entry) => ({ ...entry, reviewEnabled: Boolean(entry.reviewEnabled), annotations: annotations.results.filter((v) => v.entryId === entry.id), coreRules: rules.results.filter((v) => v.entryId === entry.id).map((v) => ({ ...v, tags: (() => {
        try {
          return JSON.parse(String(v.tagsJson));
        } catch {
          return [];
        }
      })() })) })) });
    }
    if (path === "/api/collab/assignments" && method === "GET") {
      if (!owner2 && account.role !== "admin") return out({ error: "Admin required" }, 403);
      const [assignments, students] = await Promise.all([env.DB.prepare("SELECT x.*,a.username teacher_name,u.username student_name,u.arena_public_id student_id FROM student_support_assignments x JOIN support_accounts a ON a.id=x.support_account_id JOIN users u ON u.id=x.student_user_id ORDER BY x.created_at DESC").all(), env.DB.prepare("SELECT username,arena_public_id student_id FROM users WHERE active=1 ORDER BY username").all()]);
      return out({ assignments: assignments.results, students: students.results });
    }
    if (path === "/api/collab/assignments" && method === "POST") {
      if (!owner2 && account.role !== "admin") return out({ error: "Admin required" }, 403);
      const body = await h.boundedJson(request);
      const teacherId = clean(body.teacherId, 100), studentId = clean(body.studentId, 80);
      const role = ["academic_manager", "subject_teacher", "parent"].includes(String(body.role)) ? String(body.role) : null;
      const subject = clean(body.subject, 30);
      if (!teacherId || !studentId || !role || role === "subject_teacher" && !subject) return out({ error: "Student, support account, role, and subject are required" }, 400);
      const [teacher, student2] = await Promise.all([env.DB.prepare("SELECT id,COALESCE(collaboration_role,CASE role WHEN 'tutor' THEN 'subject_teacher' ELSE role END) role FROM support_accounts WHERE id=? AND active=1").bind(teacherId).first(), studentByPublicId(env, studentId)]);
      if (!teacher || !student2) return out({ error: "Account or student not found" }, 404);
      if (teacher.role !== role) return out({ error: "Support account role does not match assignment role" }, 400);
      const id = h.randomHex(16), now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.batch([env.DB.prepare("INSERT INTO student_support_assignments(id,student_user_id,support_account_id,role,subject,permissions_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(id, student2.id, teacherId, role, role === "subject_teacher" ? subject : null, JSON.stringify(body.permissions ?? {}), now), env.DB.prepare("INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(h.randomHex(16), "student_admin", account.id, "assignment.create", "student_support_assignment", id, now, JSON.stringify({ studentPublicId: student2.arena_public_id, role, subject: role === "subject_teacher" ? subject : null }))]);
      return out({ ok: true, id }, 201);
    }
    if (path === "/api/collab/dashboard" && method === "GET") {
      const sql = account.role === "admin" ? `SELECT 'admin-'||u.id id,u.id student_user_id,? support_account_id,'admin' role,NULL subject,'{}' permissions_json,'' created_at,u.arena_public_id student_id,u.username student_name FROM users u WHERE u.active=1` : `SELECT x.*,u.arena_public_id student_id,u.username student_name FROM student_support_assignments x JOIN users u ON u.id=x.student_user_id WHERE x.support_account_id=? AND x.role=? AND u.active=1 ORDER BY x.created_at DESC`;
      const assignments = await env.DB.prepare(sql).bind(account.id, ...account.role === "admin" ? [] : [account.role]).all();
      return out({ assignments: assignments.results.map((item) => ({ ...item, permissions: permissions(item.permissions_json) })) });
    }
    const signalRoute = path.match(/^\/api\/collab\/students\/([^/]+)\/signals\/([^/]+)$/);
    if (signalRoute && method === "PATCH") {
      const access2 = await assignmentFor(env, account, signalRoute[1]);
      if (!access2 || access2.assignment.role === "parent" || !allowed(access2.assignment, "createFeedback")) return out({ error: "Signal permission required" }, 403);
      const previous = await env.DB.prepare("SELECT * FROM teacher_feedback WHERE id=? AND student_user_id=?").bind(signalRoute[2], access2.student.id).first();
      const signal = readSignal(previous?.signal_json);
      if (!previous || !signal || access2.assignment.role === "subject_teacher" && signal.subject !== access2.assignment.subject || signal.targetRole !== access2.assignment.role) return out({ error: "Signal not assigned to this role" }, 403);
      const body = await h.boundedJson(request);
      if (body.weeklyGoal && previous.linked_weekly_goal_id || body.dailyDrill && previous.linked_daily_drill_id) return out({ error: "Student has already applied this intervention" }, 409);
      let next;
      try {
        next = updateSignal(signal, body);
      } catch {
        return out({ error: "Invalid signal update" }, 400);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO teacher_feedback_audit(id,feedback_id,editor_id,snapshot_json,edited_at) VALUES(?,?,?,?,?)").bind(h.randomHex(16), signalRoute[2], account.id, JSON.stringify(previous), now),
        env.DB.prepare("UPDATE teacher_feedback SET signal_json=?,updated_at=? WHERE id=? AND student_user_id=?").bind(JSON.stringify(next), now, signalRoute[2], access2.student.id)
      ]);
      return out({ ok: true });
    }
    const edit = path.match(/^\/api\/collab\/feedback\/([^/]+)$/);
    if (edit && method === "PATCH") {
      const previous = await env.DB.prepare("SELECT * FROM teacher_feedback WHERE id=? AND teacher_id=?").bind(edit[1], account.id).first();
      if (!previous) return out({ error: "Only the author can edit this feedback" }, 403);
      const authorAccess = await assignmentFor(env, account, String(previous.student_id));
      if (!authorAccess || !allowed(authorAccess.assignment, "createFeedback")) return out({ error: "Feedback permission required" }, 403);
      const body = await h.boundedJson(request), now = (/* @__PURE__ */ new Date()).toISOString(), context = feedbackContext(body);
      await env.DB.prepare("INSERT INTO teacher_feedback_audit(id,feedback_id,editor_id,snapshot_json,edited_at) VALUES(?,?,?,?,?)").bind(h.randomHex(16), edit[1], account.id, JSON.stringify(previous), now).run();
      await env.DB.prepare("UPDATE teacher_feedback SET title=?,categories_json=?,status=?,progress=?,bottleneck=?,observation=?,action=?,success_criterion=?,comment=?,context_type=?,context_target_id=?,updated_at=? WHERE id=? AND teacher_id=?").bind(clean(body.title, 160), JSON.stringify(asArray(body.categories)), ["needs_improvement", "normal", "stable"].includes(String(body.status)) ? String(body.status) : String(previous.status), ["active", "achieved", "replaced", "archived"].includes(String(body.progress)) ? String(body.progress) : String(previous.progress), clean(body.bottleneck), clean(body.observation, 2e3), clean(body.action, 1200), clean(body.successCriterion, 1200), clean(body.comment, 2e3), context.type, context.targetId, now, edit[1], account.id).run();
      return out({ ok: true, updatedAt: now });
    }
    const dailyRoute = path.match(/^\/api\/collab\/students\/([^/]+)\/daily\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
    if (dailyRoute && method === "GET") {
      const access2 = await assignmentFor(env, account, dailyRoute[1]);
      if (!access2) return out({ error: "No assignment for this student" }, 403);
      const date = dailyRoute[2];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return out({ error: "Invalid date" }, 400);
      const data2 = await state(env, access2.student.id);
      if (!data2) return out({ studentId: access2.student.arena_public_id, date, data: null });
      const view = outData(data2, access2.assignment);
      const noon = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
      noon.setUTCDate(noon.getUTCDate() - ((noon.getUTCDay() || 7) - 1));
      const weekStart = noon.toISOString().slice(0, 10);
      return out({ studentId: access2.student.arena_public_id, date, data: {
        sessions: view.sessions.filter((item) => item.date === date),
        scores: view.scores.filter((item) => item.date === date),
        wrongAnswerDrills: view.wrongAnswerDrills.filter((item) => item.date === date),
        dailyDrills: view.dailyDrills.filter((item) => item.date === date),
        plans: view.plans.filter((item) => item.date === date),
        calendarDays: view.calendarDays.filter((item) => item.date === date),
        plaire: view.plaire.filter((item) => item.date === date),
        trinity: view.trinity.filter((item) => item.date === date),
        weeklyCapabilityGoals: view.weeklyCapabilityGoals.filter((item) => item.weekStart === weekStart),
        resources: [],
        access: view.access
      } });
    }
    const match = path.match(/^\/api\/collab\/students\/([^/]+)(?:\/(data|feedback))?$/);
    if (!match) return out({ error: "Not found" }, 404);
    const access = await assignmentFor(env, account, match[1]);
    if (!access) return out({ error: "No assignment for this student" }, 403);
    const { assignment, student } = access;
    const data = await state(env, student.id);
    if (!match[2] && method === "GET") return out({ studentId: student.arena_public_id, assignment: { role: assignment.role, subject: assignment.subject, permissions: permissions(assignment.permissions_json) }, summary: data ? { totalSeconds: outData(data, assignment).sessions.reduce((sum, item) => sum + item.seconds, 0) } : null });
    if (match[2] === "data" && method === "GET") {
      if (!data) return out({ studentId: student.arena_public_id, data: null, teacherView: null });
      const view = outData(data, assignment);
      const arena2 = await teacherArena(env, student.id, assignment.role);
      const today = (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      const monday2 = /* @__PURE__ */ new Date(today + "T12:00:00Z");
      monday2.setUTCDate(monday2.getUTCDate() - ((monday2.getUTCDay() || 7) - 1));
      const weekStart = monday2.toISOString().slice(0, 10);
      const weeklySessions = view.sessions.filter((item) => item.date >= weekStart && item.date <= today);
      const weeklyPlans = view.plans.filter((item) => item.date >= weekStart && item.date <= today);
      const teacherView = { student: { id: student.arena_public_id, displayName: student.username }, progress: { weeklyStudyMinutes: view.access.sessions ? Math.round(weeklySessions.reduce((total, item) => total + item.seconds, 0) / 60) : null, executionRate: weeklyPlans.length ? Math.round(weeklyPlans.filter((item) => item.done).length / weeklyPlans.length * 100) : null, subjectProgress: weeklySessions.reduce((totals, item) => {
        totals[item.subject] = (totals[item.subject] ?? 0) + item.seconds;
        return totals;
      }, {}) }, sessions: view.sessions, mockExams: view.scores, scores: view.scores, wrongAnswerDrills: view.wrongAnswerDrills, weeklyGoals: view.weeklyCapabilityGoals, dailyDrills: view.dailyDrills, resources: view.resources, academicInsights: view.plaire };
      return out({ studentId: student.arena_public_id, data: { sessions: view.sessions, scores: view.scores, wrongAnswerDrills: view.wrongAnswerDrills, weeklyCapabilityGoals: view.weeklyCapabilityGoals, dailyDrills: view.dailyDrills, resources: view.resources, plaire: view.plaire, plans: view.plans, calendarDays: view.calendarDays, trinity: view.trinity, access: view.access, arena: arena2 }, syncedAt: (await env.DB.prepare("SELECT updated_at FROM learning_state WHERE user_id=?").bind(student.id).first())?.updated_at, teacherView });
    }
    if (match[2] === "feedback" && method === "GET") {
      const rows2 = await env.DB.prepare("SELECT f.*,a.username AS teacher_name,a.collaboration_role AS teacher_role FROM teacher_feedback f JOIN support_accounts a ON a.id=f.teacher_id WHERE f.student_user_id=? ORDER BY f.created_at DESC LIMIT 100").bind(student.id).all();
      return out({ feedback: rows2.results.filter((row) => assignment.role === "academic_manager" || assignment.role === "admin" || assignment.role === "parent" || row.subject === assignment.subject || readSignal(row.signal_json)?.subject === assignment.subject).map(feedbackRow) });
    }
    if (match[2] === "feedback" && method === "POST") {
      if (!allowed(assignment, "createFeedback") || assignment.role === "parent") return out({ error: "Feedback permission required" }, 403);
      const body = await h.boundedJson(request), type = assignment.role === "academic_manager" || assignment.role === "admin" ? "academic_management" : "subject", now = (/* @__PURE__ */ new Date()).toISOString(), id = h.randomHex(16), context = feedbackContext(body);
      let signal;
      try {
        signal = newSignal(body.signal, assignment.role, assignment.subject);
      } catch {
        return out({ error: "Invalid signal" }, 400);
      }
      if (signal && data) {
        const view = outData(data, assignment);
        const available = /* @__PURE__ */ new Set([...view.wrongAnswerDrills.map((item) => "wrong_answer:" + item.id), ...view.scores.map((item) => "mock_exam:" + item.id), ...view.weeklyCapabilityGoals.map((item) => "weekly_goal:" + item.id), ...view.dailyDrills.map((item) => "drill:" + item.id), "subject_progress:" + signal.subject]);
        if (signal.evidenceRefs.some((ref) => !available.has(ref))) return out({ error: "Evidence is not available to this assignment" }, 400);
      } else if (signal?.evidenceRefs.length) return out({ error: "Evidence requires synced learning data" }, 400);
      await env.DB.prepare("INSERT INTO teacher_feedback(id,student_id,student_user_id,teacher_id,type,subject,title,categories_json,status,progress,bottleneck,observation,action,success_criterion,comment,context_type,context_target_id,created_at,updated_at,signal_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, student.arena_public_id, student.id, account.id, type, type === "subject" ? assignment.subject : null, clean(body.title, 160), JSON.stringify(asArray(body.categories)), ["needs_improvement", "normal", "stable"].includes(String(body.status)) ? String(body.status) : "normal", "active", clean(body.bottleneck), clean(body.observation, 2e3), clean(body.action, 1200), clean(body.successCriterion, 1200), clean(body.comment, 2e3), context.type, context.targetId, now, now, signal ? JSON.stringify(signal) : null).run();
      return out({ ok: true, id }, 201);
    }
    return out({ error: "Not found" }, 404);
  } catch (error2) {
    const status = typeof error2 === "object" && error2 && "status" in error2 ? Number(error2.status) : 503;
    return out({ error: status === 413 ? "\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4." : "\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, status);
  }
}
__name(collaboration, "collaboration");

// src/security.ts
var PASSWORD_HASH_ITERATIONS = 1e5;
var DEFAULT_SESSION_TTL_DAYS = 7;
var MAX_SYNC_BODY = 20 * 1024 * 1024;
var MAX_JSON_BODY = 256 * 1024;
var encoder = new TextEncoder();
var forbiddenKeys = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var hex = /* @__PURE__ */ __name((bytes2) => [...new Uint8Array(bytes2)].map((value) => value.toString(16).padStart(2, "0")).join(""), "hex");
var randomHex = /* @__PURE__ */ __name((size = 32) => {
  const bytes2 = new Uint8Array(size);
  crypto.getRandomValues(bytes2);
  return hex(bytes2.buffer);
}, "randomHex");
var sha256 = /* @__PURE__ */ __name(async (value) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))), "sha256");
async function passwordHash(password, salt, iterations = PASSWORD_HASH_ITERATIONS) {
  const key2 = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations }, key2, 256));
}
__name(passwordHash, "passwordHash");
async function secretMatches(provided, expected) {
  if (!expected) return false;
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}
__name(secretMatches, "secretMatches");
function containsUnsafeKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsUnsafeKey);
  return Object.entries(value).some(([key2, child]) => forbiddenKeys.has(key2) || containsUnsafeKey(child));
}
__name(containsUnsafeKey, "containsUnsafeKey");
async function boundedJson(request, maxBytes = MAX_JSON_BODY) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw new RequestError(413, "\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4.");
  if (!request.body) throw new RequestError(400, "\uC694\uCCAD \uBCF8\uBB38\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const { done, value: value2 } = await reader.read();
    if (done) break;
    if (value2) {
      size += value2.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError(413, "\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4.");
      }
      chunks.push(value2);
    }
  }
  const bytes2 = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes2.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw = new TextDecoder().decode(bytes2);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestError(400, "\uC62C\uBC14\uB978 JSON \uC694\uCCAD\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
  }
  if (containsUnsafeKey(value)) throw new RequestError(400, "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uB294 \uB370\uC774\uD130 \uD0A4\uAC00 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  return value;
}
__name(boundedJson, "boundedJson");
function validateAppData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || containsUnsafeKey(value)) return false;
  const data = value;
  const arrays = ["sessions", "scores", "resources", "goals", "weeklyCapabilityGoals", "wrongAnswerDrills", "dailyDrills", "monthlyPlans", "notionPages", "routine", "quotes", "trinity", "mockSchedule"];
  const records = ["calendar", "journals", "plaire"];
  return arrays.every((key2) => Array.isArray(data[key2])) && records.every((key2) => Boolean(data[key2]) && typeof data[key2] === "object" && !Array.isArray(data[key2]));
}
__name(validateAppData, "validateAppData");
var RequestError = class extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
  status;
  retryAfter;
  static {
    __name(this, "RequestError");
  }
};
function sessionTtlDays(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : DEFAULT_SESSION_TTL_DAYS;
}
__name(sessionTtlDays, "sessionTtlDays");
function requestOrigin(request, allowedOrigin, environment) {
  const origin = request.headers.get("Origin");
  if (!origin) return { allowed: true, responseOrigin: allowedOrigin || "" };
  if (allowedOrigin && origin === allowedOrigin) return { allowed: true, responseOrigin: origin };
  if (environment !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return { allowed: true, responseOrigin: origin };
  return { allowed: false, responseOrigin: "" };
}
__name(requestOrigin, "requestOrigin");

// src/support.ts
function publicExamPath(key2) {
  if (!key2 || key2.length > 500 || /[\\:%?#\u0000-\u001f\u007f]/.test(key2) || !key2.toLowerCase().endsWith(".pdf")) return null;
  const parts = key2.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.trim() !== part)) return null;
  return "exams/" + parts.map(encodeURIComponent).join("/");
}
__name(publicExamPath, "publicExamPath");
var strings = /* @__PURE__ */ __name((v, max = 200) => typeof v === "string" ? v.trim().slice(0, max) : "", "strings");
var storageReady = /* @__PURE__ */ __name((env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY), "storageReady");
var supabaseBase = /* @__PURE__ */ __name((env) => env.SUPABASE_URL.replace(/\/+$/, "").replace(/\/(?:rest|storage)\/v1$/, ""), "supabaseBase");
var storageUrl = /* @__PURE__ */ __name((env, key2) => `${supabaseBase(env)}/storage/v1/object/${encodeURIComponent(env.SUPABASE_BUCKET || "exam-pdfs")}/${key2.split("/").map(encodeURIComponent).join("/")}`, "storageUrl");
var storageHeaders = /* @__PURE__ */ __name((env) => ({ Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY }), "storageHeaders");
async function support(request, env, owner2, origin, h, studentActor = null) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith("/api/support/") && !path.startsWith("/api/exams") && !path.startsWith("/api/collab/")) return null;
  const out = /* @__PURE__ */ __name((v, s = 200) => h.json(v, s, origin), "out");
  try {
    if (path === "/api/support/login" && method === "POST") {
      const b = await h.boundedJson(request);
      const username = strings(b.username, 40), role = b.role;
      if (!["teacher", "tutor", "parent", "subject_teacher", "academic_manager", "admin"].includes(role) || typeof b.password !== "string" || b.password.length > 256) return out({ error: "\uC785\uB825\uC744 \uD655\uC778\uD558\uC138\uC694." }, 400);
      const now = Date.now(), window = Math.floor(now / 9e5), key2 = await h.sha256((request.headers.get("CF-Connecting-IP") || "local") + ":" + window);
      await env.DB.prepare("INSERT INTO support_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1").bind(key2, now + 9e5).run();
      const tries = await env.DB.prepare("SELECT attempts FROM support_login_attempts WHERE key=?").bind(key2).first();
      if ((tries?.attempts ?? 0) > 15) return out({ error: "\uC2DC\uB3C4\uAC00 \uB9CE\uC2B5\uB2C8\uB2E4. 15\uBD84 \uD6C4 \uB2E4\uC2DC \uB85C\uADF8\uC778\uD558\uC138\uC694." }, 429);
      await env.DB.prepare("DELETE FROM support_login_attempts WHERE expires_at<?").bind(now).run();
      const a = await env.DB.prepare("SELECT id,username,COALESCE(collaboration_role,CASE role WHEN 'tutor' THEN 'subject_teacher' ELSE role END) AS role,salt,password_hash,COALESCE(password_iterations,100000) password_iterations FROM support_accounts WHERE username=? AND active=1 AND ((?='teacher' AND COALESCE(collaboration_role,CASE role WHEN 'tutor' THEN 'subject_teacher' ELSE role END) IN ('subject_teacher','academic_manager')) OR (?<>'teacher' AND (collaboration_role=? OR role=? OR (role='tutor' AND ?='subject_teacher'))))").bind(username, role, role, role, role, role).first();
      const iterations = a?.password_iterations ?? PASSWORD_HASH_ITERATIONS;
      const hash = await h.passwordHash(b.password, a?.salt ?? "dummy-salt-for-login", iterations);
      if (!a || !await h.secretMatches(hash, a.password_hash)) return out({ error: "\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 401);
      if (iterations < PASSWORD_HASH_ITERATIONS) {
        const salt = h.randomHex(16);
        await env.DB.prepare("UPDATE support_accounts SET password_hash=?,salt=?,password_iterations=? WHERE id=?").bind(await h.passwordHash(b.password, salt, PASSWORD_HASH_ITERATIONS), salt, PASSWORD_HASH_ITERATIONS, a.id).run();
      }
      const token = h.randomHex();
      await env.DB.prepare("INSERT INTO support_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(await h.sha256(token), a.id, new Date(now + 7 * 864e5).toISOString()).run();
      return out({ token, username: a.username, role: a.role });
    }
    const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const account = owner2 ? null : await env.DB.prepare("SELECT a.id,a.username,COALESCE(a.collaboration_role,CASE a.role WHEN 'tutor' THEN 'subject_teacher' ELSE a.role END) AS role FROM support_sessions s JOIN support_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND a.active=1 AND datetime(s.expires_at)>datetime('now')").bind(await h.sha256(bearer)).first();
    if (!owner2 && !account && !studentActor) return out({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 401);
    const collab = await collaboration(request, env, owner2, account, origin, h, studentActor);
    if (collab) return collab;
    if (path === "/api/support/logout" && method === "POST") {
      await env.DB.prepare("DELETE FROM support_sessions WHERE token_hash=?").bind(await h.sha256(bearer)).run();
      return out({ ok: true });
    }
    if (path === "/api/support/accounts") {
      if (!owner2) return out({ error: "\uD559\uC0DD\uB9CC \uACC4\uC815\uC744 \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }, 403);
      if (method === "GET") return out({ accounts: (await env.DB.prepare("SELECT id,username,COALESCE(collaboration_role,CASE role WHEN 'tutor' THEN 'subject_teacher' ELSE role END) AS role,active FROM support_accounts ORDER BY created_at").all()).results });
      const b = await h.boundedJson(request);
      if (method === "PUT") {
        const id = strings(b.id), now = (/* @__PURE__ */ new Date()).toISOString();
        await env.DB.batch([env.DB.prepare("UPDATE support_accounts SET active=0 WHERE id=?").bind(id), env.DB.prepare("DELETE FROM support_sessions WHERE account_id=?").bind(id), env.DB.prepare("INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(h.randomHex(16), "student_admin", studentActor ? String(studentActor.id) : null, "support_account.disable", "support_account", id, now, "{}")]);
        return out({ ok: true });
      }
      if (method === "POST") {
        const username = strings(b.username, 40), requestedRole = strings(b.role, 30), collaborationRole = requestedRole === "tutor" ? "subject_teacher" : requestedRole;
        if (!username || !["tutor", "parent", "subject_teacher", "academic_manager", "admin"].includes(requestedRole) || typeof b.password !== "string" || b.password.length < 12 || b.password.length > 256) return out({ error: "\uC544\uC774\uB514\uC640 12\uC790 \uC774\uC0C1\uC758 \uBE44\uBC00\uBC88\uD638, \uC5ED\uD560\uC744 \uD655\uC778\uD558\uC138\uC694." }, 400);
        if (await env.DB.prepare("SELECT id FROM support_accounts WHERE username=?").bind(username).first()) return out({ error: "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC544\uC774\uB514\uC785\uB2C8\uB2E4." }, 409);
        const salt = h.randomHex(16);
        const id = h.randomHex(16), now = (/* @__PURE__ */ new Date()).toISOString();
        await env.DB.batch([env.DB.prepare("INSERT INTO support_accounts(id,username,role,collaboration_role,password_hash,salt,password_iterations,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id, username, collaborationRole === "parent" ? "parent" : "tutor", collaborationRole, await h.passwordHash(b.password, salt, PASSWORD_HASH_ITERATIONS), salt, PASSWORD_HASH_ITERATIONS, now), env.DB.prepare("INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(h.randomHex(16), "student_admin", studentActor ? String(studentActor.id) : null, "support_account.create", "support_account", id, now, JSON.stringify({ role: collaborationRole }))]);
        return out({ ok: true }, 201);
      }
    }
    if (path === "/api/support/data" && method === "GET") {
      if (!account) return out({ error: "\uC804\uC6A9 \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD558\uC138\uC694." }, 403);
      const requested = url.searchParams.get("student");
      const assignment = await env.DB.prepare(`SELECT x.*,u.arena_public_id FROM student_support_assignments x JOIN users u ON u.id=x.student_user_id WHERE x.support_account_id=? AND x.role=? AND u.active=1 ${requested ? "AND u.arena_public_id=?" : ""} ORDER BY x.created_at LIMIT 1`).bind(account.id, account.role, ...requested ? [requested] : []).first();
      if (!assignment) return out({ error: "\uBC30\uC815\uB41C \uD559\uC0DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
      const row = await env.DB.prepare("SELECT payload,updated_at FROM learning_state WHERE user_id=?").bind(assignment.student_user_id).first();
      const view = row ? outData(JSON.parse(row.payload), assignment) : null;
      const legacy = view ? { resources: view.resources, sessions: view.sessions, plans: view.plans, goals: view.weeklyCapabilityGoals, daily: view.dailyDrills, scores: view.scores.map((item) => ({ ...item, math: "score" in item && item.subject === "\uC218\uD559" ? item.score : item.math })), wrong: view.wrongAnswerDrills, analysis: view.trinity, monthly: view.monthlyPlans, routine: view.routine, checklist: view.goals } : null;
      return out({ role: account.role, username: account.username, studentId: assignment.arena_public_id, updatedAt: row?.updated_at ?? null, data: legacy });
    }
    if (path === "/api/support/comments") {
      if (method === "GET") {
        const sql = owner2 ? "SELECT c.*,a.username,a.role FROM support_comments c JOIN support_accounts a ON a.id=c.account_id ORDER BY c.created_at DESC LIMIT 300" : "SELECT c.*,a.username,a.role FROM support_comments c JOIN support_accounts a ON a.id=c.account_id WHERE c.account_id=? ORDER BY c.created_at DESC LIMIT 300";
        const q = env.DB.prepare(sql);
        return out({ comments: (await (owner2 ? q : q.bind(account.id)).all()).results });
      }
      if (method === "POST" && account) {
        if (["subject_teacher", "academic_manager"].includes(account.role)) return out({ error: "\uAD50\uC0AC \uC758\uACAC\uC740 \uAD6C\uC870\uD654\uB41C FEEDBACK\uC73C\uB85C \uC791\uC131\uD558\uC138\uC694." }, 403);
        const b = await h.boundedJson(request);
        const body = strings(b.body, 4e3), target = strings(b.target, 200);
        if (!body || !target) return out({ error: "\uB300\uC0C1\uACFC \uC758\uACAC\uC744 \uC785\uB825\uD558\uC138\uC694." }, 400);
        await env.DB.prepare("INSERT INTO support_comments(id,account_id,target,body,created_at) VALUES(?,?,?,?,?)").bind(h.randomHex(16), account.id, target, body, (/* @__PURE__ */ new Date()).toISOString()).run();
        return out({ ok: true }, 201);
      }
      return out({ error: "\uC758\uACAC \uC791\uC131 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
    }
    if (path === "/api/exams" && method === "GET") {
      if (account?.role === "parent") return out({ error: "\uC790\uB8CC\uC2E4 \uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
      const q = env.DB.prepare(account ? "SELECT * FROM exam_documents WHERE subject=? ORDER BY year DESC,created_at DESC" : "SELECT * FROM exam_documents ORDER BY year DESC,created_at DESC");
      return out({ documents: (await (account ? q.bind("\uC218\uD559") : q).all()).results });
    }
    if (path === "/api/exams" && method === "POST") {
      if (!owner2) return out({ error: "\uD559\uC0DD\uB9CC \uC790\uB8CC\uB97C \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }, 403);
      const b = await h.boundedJson(request), title = strings(b.title), agency = strings(b.agency), subject = strings(b.subject), key2 = strings(b.object_key, 500), year = Number(b.year);
      if (!title || !["\uD3C9\uAC00\uC6D0", "\uAD50\uC721\uCCAD", "\uC0AC\uAD00\uD559\uAD50"].includes(agency) || !["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uD0D0\uAD6C"].includes(subject) || !Number.isInteger(year) || year < 1980 || year > 2100 || !key2.toLowerCase().endsWith(".pdf")) return out({ error: "\uC790\uB8CC \uC591\uC2DD\uC744 \uD655\uC778\uD558\uC138\uC694." }, 400);
      if (!publicExamPath(key2)) return out({ error: "public/exams/ \uC544\uB798\uC758 \uC0C1\uB300 PDF \uACBD\uB85C\uB97C \uC785\uB825\uD558\uC138\uC694. URL\uC774\uB098 \uC0C1\uC704 \uD3F4\uB354 \uACBD\uB85C\uB294 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 400);
      if (await env.DB.prepare("SELECT id FROM exam_documents WHERE object_key=?").bind(key2).first()) return out({ error: "\uC774\uBBF8 \uB4F1\uB85D\uB41C \uD30C\uC77C\uC785\uB2C8\uB2E4." }, 409);
      const id = h.randomHex(16);
      await env.DB.prepare("INSERT INTO exam_documents(id,title,agency,year,subject,object_key,created_at) VALUES(?,?,?,?,?,?,?)").bind(id, title, agency, year, subject, key2, (/* @__PURE__ */ new Date()).toISOString()).run();
      return out({ ok: true, id, storage: storageReady(env) ? "supabase" : "public" }, 201);
    }
    if (path.startsWith("/api/exams/") && !path.endsWith("/file") && method === "DELETE") {
      if (!owner2) return out({ error: "Only the owner can remove PDFs." }, 403);
      const id = path.slice("/api/exams/".length), doc = await env.DB.prepare("SELECT object_key FROM exam_documents WHERE id=?").bind(id).first();
      if (!doc) return out({ error: "Document not found." }, 404);
      if (storageReady(env)) await fetch(storageUrl(env, doc.object_key), { method: "DELETE", headers: storageHeaders(env) });
      await env.DB.prepare("DELETE FROM exam_documents WHERE id=?").bind(id).run();
      return out({ ok: true });
    }
    if (path.startsWith("/api/exams/") && path.endsWith("/file") && method === "PUT") {
      if (!owner2) return out({ error: "Only the owner can upload PDFs." }, 403);
      if (!storageReady(env)) return out({ error: "Supabase Storage is not configured on this Worker." }, 503);
      const id = path.slice("/api/exams/".length, -"/file".length), doc = await env.DB.prepare("SELECT object_key FROM exam_documents WHERE id=?").bind(id).first();
      if (!doc) return out({ error: "Document not found." }, 404);
      const length = Number(request.headers.get("Content-Length") || 0), type = (request.headers.get("Content-Type") || "").toLowerCase();
      if (!request.body || length <= 0 || length > 20 * 1024 * 1024 || !type.startsWith("application/pdf")) return out({ error: "Upload a PDF no larger than 20 MB with Content-Length." }, 400);
      const uploaded = await fetch(storageUrl(env, doc.object_key), { method: "POST", headers: { ...storageHeaders(env), "Content-Type": "application/pdf", "x-upsert": "false" }, body: request.body });
      if (!uploaded.ok) return out({ error: "PDF \uC5C5\uB85C\uB4DC\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 502);
      return out({ ok: true }, 201);
    }
    if (path.startsWith("/api/exams/") && path.endsWith("/file") && method === "GET") {
      if (account?.role === "parent") return out({ error: "PDF access is not available for this role." }, 403);
      if (!storageReady(env)) return out({ error: "Supabase Storage is not configured on this Worker." }, 503);
      const id = path.slice("/api/exams/".length, -"/file".length), doc = await env.DB.prepare("SELECT object_key,subject FROM exam_documents WHERE id=?").bind(id).first();
      if (!doc || account && doc.subject !== "?\uC111\uBE30") return out({ error: "Document not found." }, 404);
      const file = await fetch(storageUrl(env, doc.object_key), { headers: storageHeaders(env) });
      if (!file.ok || !file.body) return out({ error: "The PDF has not been uploaded yet." }, 404);
      return new Response(file.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, max-age=300", "Access-Control-Allow-Origin": origin } });
    }
    if (path.startsWith("/api/exams/") && method === "GET") {
      if (account?.role === "parent") return out({ error: "\uC790\uB8CC\uC2E4 \uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
      const doc = await env.DB.prepare("SELECT object_key,subject FROM exam_documents WHERE id=?").bind(path.slice("/api/exams/".length)).first();
      if (!doc || account && doc.subject !== "\uC218\uD559") return out({ error: "\uC790\uB8CC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
      const pdfPath = publicExamPath(doc.object_key);
      if (!pdfPath) return out({ error: "\uAE30\uC874 \uD30C\uC77C \uACBD\uB85C\uB97C \uD655\uC778\uD558\uC138\uC694." }, 400);
      return out(storageReady(env) ? { storage: "supabase", path: pdfPath, public: true } : { path: pdfPath, public: true });
    }
    return out({ error: "Not found" }, 404);
  } catch (error2) {
    const status = typeof error2 === "object" && error2 && "status" in error2 ? Number(error2.status) : 503;
    return out({ error: status === 413 ? "\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4." : "\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, status);
  }
}
__name(support, "support");

// src/lib/ai/types.ts
var AIProviderError = class extends Error {
  constructor(message, status, code, retryAfterSeconds2, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds2;
    this.retryable = retryable;
    this.name = "AIProviderError";
  }
  status;
  code;
  retryAfterSeconds;
  retryable;
  static {
    __name(this, "AIProviderError");
  }
};

// src/lib/ai/providers/nvidia-kimi.ts
var DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
var DEFAULT_MODEL = "openai/gpt-oss-20b";
function boundedInt(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
__name(boundedInt, "boundedInt");
function retryAfterSeconds(value) {
  const seconds2 = Number(value);
  return Number.isFinite(seconds2) && seconds2 > 0 ? Math.min(Math.ceil(seconds2), 60) : void 0;
}
__name(retryAfterSeconds, "retryAfterSeconds");
function providerMessage(status) {
  if (status === 401) return "AI provider authentication failed.";
  if (status === 403) return "The configured AI model is not available for this account.";
  if (status === 429) return "The AI provider rate limit has been reached.";
  if ([500, 502, 503, 504].includes(status)) return "The AI provider is temporarily unavailable.";
  return `AI provider request failed (${status}).`;
}
__name(providerMessage, "providerMessage");
function providerCode(status) {
  if (status === 401) return "AI_AUTHENTICATION_FAILED";
  if (status === 403) return "AI_ACCESS_DENIED";
  if (status === 429) return "AI_RATE_LIMITED";
  if ([500, 502, 503, 504].includes(status)) return "AI_PROVIDER_UNAVAILABLE";
  return "AI_REQUEST_FAILED";
}
__name(providerCode, "providerCode");
function parsePayload(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
__name(parsePayload, "parsePayload");
function isDebug(config) {
  return config.debug === "true" || config.environment === "development";
}
__name(isDebug, "isDebug");
var NvidiaKimiProvider = class {
  constructor(config) {
    this.config = config;
    this.model = config.model || DEFAULT_MODEL;
    this.endpoint = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = boundedInt(config.timeoutMs, 25e3, 1e3, 6e4);
  }
  config;
  static {
    __name(this, "NvidiaKimiProvider");
  }
  name = "nvidia-kimi";
  model;
  endpoint;
  timeoutMs;
  async chat(messages, options) {
    if (!this.config.apiKey) throw new AIProviderError("AI provider is not configured.", 503, "AI_NOT_CONFIGURED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens, stream: false, messages })
      });
      const responseText = await response.text();
      const payload = parsePayload(responseText);
      if (!response.ok) {
        if (isDebug(this.config)) console.error(JSON.stringify({ event: "ai_provider_error", provider: "nvidia", model: this.model, status: response.status, providerError: payload.error?.message }));
        throw new AIProviderError(providerMessage(response.status), response.status, providerCode(response.status), retryAfterSeconds(response.headers.get("Retry-After")), false);
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new AIProviderError("AI provider returned an invalid response.", 502, "AI_INVALID_RESPONSE");
      return { content: content.trim(), provider: this.name, model: this.model };
    } catch (cause) {
      if (cause instanceof AIProviderError) throw cause;
      if (cause instanceof DOMException && cause.name === "AbortError") throw new AIProviderError("AI provider timed out.", 504, "AI_TIMEOUT");
      if (isDebug(this.config)) console.error(JSON.stringify({ event: "ai_provider_network_error", provider: "nvidia", model: this.model, error: cause instanceof Error ? cause.message : String(cause) }));
      throw new AIProviderError("AI provider connection failed.", 502, "AI_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
};

// src/lib/ai/providers/local-qwen.ts
var boundedTimeout = /* @__PURE__ */ __name((value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1e3 && parsed <= 12e4 ? parsed : 3e4;
}, "boundedTimeout");
var debugEnabled = /* @__PURE__ */ __name((config) => config.debug === "true" || config.environment === "development", "debugEnabled");
function errorFor(status, code) {
  if (status === 401) return new AIProviderError("Local AI authentication failed.", 503, "AI_AUTHENTICATION_FAILED");
  if (code === "MODEL_NOT_AVAILABLE") return new AIProviderError("The configured Local AI model is unavailable.", 503, "LOCAL_AI_MODEL_NOT_AVAILABLE");
  if (code === "INFERENCE_TIMEOUT" || status === 504) return new AIProviderError("Local AI inference timed out.", 504, "LOCAL_AI_TIMEOUT");
  if (code === "OLLAMA_UNAVAILABLE" || status === 503) return new AIProviderError("Local AI is unavailable.", 503, "LOCAL_AI_UNAVAILABLE");
  return new AIProviderError("Local AI returned an invalid response.", 502, "LOCAL_AI_INVALID_RESPONSE");
}
__name(errorFor, "errorFor");
var LocalQwenProvider = class {
  constructor(config) {
    this.config = config;
    this.endpoint = `${(config.localAIBaseUrl || "").replace(/\/+$/, "")}/chat`;
    this.timeoutMs = boundedTimeout(config.localAITimeoutMs);
  }
  config;
  static {
    __name(this, "LocalQwenProvider");
  }
  name = "local-qwen";
  endpoint;
  timeoutMs;
  async chat(messages, options) {
    if (!this.config.localAIBaseUrl || !this.config.localAIApiKey) {
      throw new AIProviderError("Local AI provider is not configured.", 503, "AI_NOT_CONFIGURED");
    }
    const system = messages.find((message) => message.role === "system")?.content;
    const conversation = messages.filter((message) => message.role !== "system").map((message) => `${message.role}: ${message.content}`).join("\n");
    if (!conversation) throw new AIProviderError("Local AI request is empty.", 400, "AI_REQUEST_FAILED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.localAIApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: conversation, system_prompt: system, context: options.context ?? {}, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (debugEnabled(this.config)) console.error(JSON.stringify({ event: "local_ai_error", status: response.status, code: payload.error }));
        throw errorFor(response.status, payload.error);
      }
      if (typeof payload.response !== "string" || !payload.response.trim()) throw errorFor(502, payload.error);
      return { content: payload.response.trim(), provider: this.name, model: typeof payload.model === "string" ? payload.model : this.config.localAIModel || "qwen3:8b" };
    } catch (cause) {
      if (cause instanceof AIProviderError) throw cause;
      if (cause instanceof DOMException && cause.name === "AbortError") throw new AIProviderError("Local AI inference timed out.", 504, "LOCAL_AI_TIMEOUT");
      if (debugEnabled(this.config)) console.error(JSON.stringify({ event: "local_ai_network_error", error: cause instanceof Error ? cause.message : String(cause) }));
      throw new AIProviderError("Local AI connection failed.", 503, "LOCAL_AI_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
};

// src/lib/ai/service.ts
var CACHE_TTL_MS = {
  "study-analysis": 30 * 6e4,
  "teacher-feedback-summary": 10 * 6e4,
  "arena-coach": 30 * 6e4,
  chat: 5 * 6e4
};
function boundedInt2(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
__name(boundedInt2, "boundedInt");
var AIService = class {
  constructor(makeProvider) {
    this.makeProvider = makeProvider;
  }
  makeProvider;
  static {
    __name(this, "AIService");
  }
  provider(config) {
    if (this.makeProvider) return this.makeProvider(config);
    if (!config.provider || config.provider === "nvidia-kimi") return new NvidiaKimiProvider(config);
    if (config.provider === "local-qwen") return new LocalQwenProvider(config);
    throw new AIProviderError("\uC124\uC815\uB41C AI provider\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 503, "AI_NOT_CONFIGURED");
  }
  async cached(db, key2, nowIso2) {
    const row = await db.prepare("SELECT response,expires_at FROM ai_cache WHERE cache_key=?").bind(key2).first();
    if (!row) return null;
    if (row.expires_at > nowIso2) return row.response;
    await db.prepare("DELETE FROM ai_cache WHERE cache_key=?").bind(key2).run();
    return null;
  }
  async guard(db, userId, operation, config, now) {
    const userLimit = boundedInt2(config.userDailyLimit, 12, 1, 1e3);
    const globalLimit = boundedInt2(config.globalDailyLimit, 100, 1, 1e5);
    const [userCount, globalCount] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM ai_usage WHERE user_id=? AND date(created_at)=date('now')").bind(userId).first(),
      db.prepare("SELECT COUNT(*) AS count FROM ai_usage WHERE date(created_at)=date('now')").first()
    ]);
    if ((userCount?.count ?? 0) >= userLimit) throw new AIProviderError("\uC624\uB298 \uC0AC\uC6A9\uD560 \uC218 \uC788\uB294 AI \uC694\uCCAD \uD69F\uC218\uB97C \uBAA8\uB450 \uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 TRINITY \uBD84\uC11D\uC740 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 429, "AI_RATE_LIMITED");
    if ((globalCount?.count ?? 0) >= globalLimit) throw new AIProviderError("\uC624\uB298\uC758 \uC804\uCCB4 AI \uC694\uCCAD \uD55C\uB3C4\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 TRINITY \uBD84\uC11D\uC740 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 429, "AI_RATE_LIMITED");
    if (operation !== "chat") return;
    const cooldownSeconds = boundedInt2(config.chatCooldownSeconds, 8, 0, 300);
    if (!cooldownSeconds) return;
    const recent2 = await db.prepare("SELECT created_at FROM ai_usage WHERE user_id=? AND operation='chat' ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    const nextAllowed = recent2 ? Date.parse(recent2.created_at) + cooldownSeconds * 1e3 : 0;
    if (nextAllowed > now.getTime()) throw new AIProviderError("AI \uC0C1\uB2F4 \uC694\uCCAD \uAC04\uACA9\uC774 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 TRINITY \uBD84\uC11D\uC744 \uBA3C\uC800 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 429, "AI_RATE_LIMITED", Math.max(1, Math.ceil((nextAllowed - now.getTime()) / 1e3)));
  }
  async complete(input) {
    const now = /* @__PURE__ */ new Date();
    const nowIso2 = now.toISOString();
    const providerName = input.config.provider || "nvidia-kimi";
    const modelName = providerName === "local-qwen" ? input.config.localAIModel || "qwen3:8b" : input.config.model || "openai/gpt-oss-20b";
    const persistentKey = `${input.userId}:${providerName}:${modelName}:${input.operation}:${input.cacheKey}`;
    const cached = await this.cached(input.db, persistentKey, nowIso2);
    if (cached !== null) return { content: cached, cached: true };
    await this.guard(input.db, input.userId, input.operation, input.config, now);
    const usageId = crypto.randomUUID();
    await input.db.prepare("INSERT INTO ai_usage(id,user_id,operation,provider,model,created_at,success,status_code) VALUES(?,?,?,?,?,?,0,NULL)").bind(usageId, input.userId, input.operation, providerName, modelName, nowIso2).run();
    try {
      const response = await this.provider(input.config).chat(input.messages, { maxTokens: input.maxTokens, temperature: 0.2, context: input.context });
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS[input.operation]).toISOString();
      await Promise.all([
        input.db.prepare("INSERT INTO ai_cache(cache_key,user_id,operation,response,created_at,expires_at) VALUES(?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET response=excluded.response,created_at=excluded.created_at,expires_at=excluded.expires_at").bind(persistentKey, input.userId, input.operation, response.content, nowIso2, expiresAt).run(),
        input.db.prepare("UPDATE ai_usage SET provider=?,model=?,success=1,status_code=200 WHERE id=?").bind(response.provider, response.model, usageId).run()
      ]);
      return { content: response.content, cached: false };
    } catch (cause) {
      const status = cause instanceof AIProviderError ? cause.status : 502;
      await input.db.prepare("UPDATE ai_usage SET status_code=? WHERE id=?").bind(status, usageId).run();
      throw cause;
    }
  }
};
var aiService = new AIService();

// src/lib/ai/context.ts
var MAX_LOCAL_AI_CONTEXT_BYTES = 24e3;
var object = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "object");
var text2 = /* @__PURE__ */ __name((value, limit = 160) => typeof value === "string" ? value.slice(0, limit) : void 0, "text");
var number = /* @__PURE__ */ __name((value) => typeof value === "number" && Number.isFinite(value) ? value : void 0, "number");
var boolean = /* @__PURE__ */ __name((value) => typeof value === "boolean" ? value : void 0, "boolean");
var array = /* @__PURE__ */ __name((value) => Array.isArray(value) ? value.map(object).filter((item) => Boolean(item)) : [], "array");
var recent = /* @__PURE__ */ __name((items, limit) => [...items].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, limit), "recent");
var bytes = /* @__PURE__ */ __name((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength, "bytes");
function selectLocalAIContext(value) {
  const data = object(value);
  if (!data) return {};
  const context = {
    sessions: recent(array(data.sessions), 24).map((item) => ({ date: text2(item.date, 10), subject: text2(item.subject, 20), seconds: number(item.seconds) })),
    scores: recent(array(data.scores), 8).map((item) => ({ date: text2(item.date, 10), name: text2(item.name, 80), subject: text2(item.subject, 20), korean: number(item.korean), math: number(item.math), english: number(item.english), errorType: text2(item.errorType), cause: text2(item.cause), nextAction: text2(item.nextAction) })),
    wrongAnswerDrills: recent(array(data.wrongAnswerDrills), 12).map((item) => ({ date: text2(item.date, 10), subject: text2(item.subject, 20), bottleneck: text2(item.bottleneck, 80), wrongJudgment: text2(item.wrongJudgment), missedCue: text2(item.missedCue), correction: text2(item.correction), transfer: text2(item.transfer), retries: array(item.retries).slice(0, 3).map((retry) => ({ id: text2(retry.id, 8), dueDate: text2(retry.dueDate, 10), completedDate: text2(retry.completedDate, 10) })) })),
    weeklyCapabilityGoals: array(data.weeklyCapabilityGoals).filter((item) => item.done !== true).slice(-6).map((item) => ({ weekStart: text2(item.weekStart, 10), subject: text2(item.subject, 20), ability: text2(item.ability), successCriterion: text2(item.successCriterion), drillDesign: text2(item.drillDesign), done: boolean(item.done) })),
    dailyDrills: recent(array(data.dailyDrills), 10).map((item) => ({ date: text2(item.date, 10), subject: text2(item.subject, 20), title: text2(item.title), action: text2(item.action), successCriterion: text2(item.successCriterion), minutes: number(item.minutes), done: boolean(item.done) })),
    goals: array(data.goals).filter((item) => item.done !== true).slice(-6).map((item) => ({ subject: text2(item.subject, 20), text: text2(item.text), done: boolean(item.done) })),
    plaire: recent(Object.values(object(data.plaire) ?? {}).map(object).filter((item) => Boolean(item)), 3).map((item) => ({ date: text2(item.date, 10), bottleneck: text2(item.bottleneck), nextAction: text2(item.nextAction), criterion: text2(item.criterion), focus: text2(item.focus) })),
    trinity: recent(array(data.trinity), 3).map((item) => ({ date: text2(item.date, 10), subject: text2(item.subject, 20), mode: text2(item.mode, 20), fields: Object.fromEntries(Object.entries(object(item.fields) ?? {}).slice(0, 10).map(([key2, field]) => [key2.slice(0, 60), text2(field, 120)])) }))
  };
  const shrinkOrder = ["sessions", "wrongAnswerDrills", "dailyDrills", "scores", "trinity", "plaire"];
  while (bytes(context) > MAX_LOCAL_AI_CONTEXT_BYTES) {
    const key2 = shrinkOrder.find((name) => Array.isArray(context[name]) && context[name].length > 1);
    if (!key2) break;
    context[key2].pop();
  }
  return context;
}
__name(selectLocalAIContext, "selectLocalAIContext");
function parseAndSelectLocalAIContext(payload) {
  if (!payload) return {};
  try {
    return selectLocalAIContext(JSON.parse(payload));
  } catch {
    return {};
  }
}
__name(parseAndSelectLocalAIContext, "parseAndSelectLocalAIContext");

// ../src/lib/date.ts
var STUDY_DAY_START_HOUR = 6;
var STUDY_TIME_ZONE = "Asia/Seoul";
var dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: STUDY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
var asDate = /* @__PURE__ */ __name((value = /* @__PURE__ */ new Date()) => value instanceof Date ? value : new Date(value), "asDate");
var addDays = /* @__PURE__ */ __name((key2, days) => {
  const date = /* @__PURE__ */ new Date(`${key2}T12:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateFormatter.format(date);
}, "addDays");
var getStudyDayKey = /* @__PURE__ */ __name((value = /* @__PURE__ */ new Date()) => dateFormatter.format(new Date(asDate(value).getTime() - STUDY_DAY_START_HOUR * 36e5)), "getStudyDayKey");
var getStudyDayRange = /* @__PURE__ */ __name((studyDay) => {
  const start = /* @__PURE__ */ new Date(`${studyDay}T${String(STUDY_DAY_START_HOUR).padStart(2, "0")}:00:00+09:00`);
  return { start, end: /* @__PURE__ */ new Date(`${addDays(studyDay, 1)}T${String(STUDY_DAY_START_HOUR).padStart(2, "0")}:00:00+09:00`) };
}, "getStudyDayRange");

// ../src/lib/studyTotals.ts
function splitSessionByStudyDay(s) {
  const parts = [];
  if (!s.segments?.length) return s.seconds > 0 ? [{ date: s.date, subject: s.subject, seconds: s.seconds }] : parts;
  for (const part of s.segments) {
    if (part.kind !== "focus") continue;
    let start = Date.parse(part.start);
    const end = Date.parse(part.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    while (start < end) {
      const date = getStudyDayKey(new Date(start));
      const until = Math.min(getStudyDayRange(date).end.getTime(), end);
      parts.push({ date, subject: s.subject, seconds: (until - start) / 1e3 });
      start = until;
    }
  }
  return parts;
}
__name(splitSessionByStudyDay, "splitSessionByStudyDay");
function studyTotals(sessions2) {
  const totals = {};
  for (const s of sessions2) {
    for (const part of splitSessionByStudyDay(s)) totals[part.date] = (totals[part.date] ?? 0) + part.seconds;
  }
  return totals;
}
__name(studyTotals, "studyTotals");

// ../src/lib/arenaScore.ts
var DAY = 864e5;
var clamp = /* @__PURE__ */ __name((v, min = 0, max = 1) => Math.min(max, Math.max(min, v)), "clamp");
var round = Math.round;
var key = /* @__PURE__ */ __name((d) => getStudyDayKey(d), "key");
var day = /* @__PURE__ */ __name((d) => getStudyDayRange(key(d)).start, "day");
var add = /* @__PURE__ */ __name((d, n) => new Date(day(d).getTime() + n * DAY), "add");
var between = /* @__PURE__ */ __name((v, a, b) => v >= key(a) && v <= key(b), "between");
var sessionCache = /* @__PURE__ */ new WeakMap();
var sessions = /* @__PURE__ */ __name((data, a, b) => {
  let rows2 = sessionCache.get(data);
  if (!rows2) {
    rows2 = Object.entries(studyTotals(data.sessions)).map(([date, seconds2]) => ({ date, seconds: seconds2 }));
    sessionCache.set(data, rows2);
  }
  return rows2.filter((v) => between(v.date, a, b) && v.seconds > 0);
}, "sessions");
var seconds = /* @__PURE__ */ __name((data, a, b) => sessions(data, a, b).reduce((s, v) => s + Math.max(0, v.seconds), 0), "seconds");
var plans = /* @__PURE__ */ __name((data, a, b) => [...Object.entries(data.calendar).filter(([d]) => between(d, a, b)).flatMap(([, v]) => v.plans ?? []), ...data.dailyDrills.filter((v) => between(v.date, a, b))], "plans");
var rate = /* @__PURE__ */ __name((yes, total) => total ? yes / total : null, "rate");
var sample = /* @__PURE__ */ __name((value, n) => value === null ? null : value * clamp(n / 5), "sample");
var weighted = /* @__PURE__ */ __name((items, cap) => {
  const available = items.filter((v) => v.value !== null);
  if (!available.length) return 0;
  return round(clamp(available.reduce((s, v) => s + clamp(v.value) * v.max, 0) / available.reduce((s, v) => s + v.max, 0)) * cap);
}, "weighted");
var subjectAverages = /* @__PURE__ */ __name((rows2) => ["korean", "math", "english"].map((subject) => {
  const v = rows2.map((r) => r[subject]).filter((x) => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}), "subjectAverages");
var average = /* @__PURE__ */ __name((v) => {
  const found = v.filter((x) => x !== null);
  return found.length ? found.reduce((a, b) => a + b, 0) / found.length : null;
}, "average");
var stability = /* @__PURE__ */ __name((rates) => {
  if (rates.length < 2) return null;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return clamp(1 - Math.sqrt(rates.reduce((s, v) => s + (v - mean) ** 2, 0) / rates.length));
}, "stability");
function calculateArenaScore(data, now = /* @__PURE__ */ new Date(), li) {
  const end = day(now), start = add(end, -13), previousStart = add(end, -27), previousEnd = add(end, -14), weekStart = add(end, -(((/* @__PURE__ */ new Date(`${key(end)}T12:00:00+09:00`)).getUTCDay() + 6) % 7)), availableDays = Math.max(1, Math.min(7, Math.floor((end.getTime() - weekStart.getTime()) / DAY) + 1));
  const weekPlans = plans(data, weekStart, end), planExecution = rate(weekPlans.filter((v) => v.done).length, weekPlans.length), activeDays = new Set(sessions(data, weekStart, end).map((v) => v.date)).size, currentSeconds = seconds(data, weekStart, end), pastWeeks = [1, 2, 3, 4].map((n) => seconds(data, add(weekStart, -7 * n), add(weekStart, -7 * n + 6))).filter(Boolean).sort((a, b) => a - b), target = pastWeeks.length ? pastWeeks[Math.floor(pastWeeks.length / 2)] : weekPlans.length ? weekPlans.length * 3600 : 0, studyGoal = target ? clamp(currentSeconds / target) : null;
  const execution = weighted([{ value: planExecution, max: 100 }, { value: studyGoal, max: 60 }, { value: activeDays / availableDays, max: 40 }], 200);
  const retries = data.wrongAnswerDrills.flatMap((v) => v.retries ?? []), retryDone = retries.filter((v) => v.completedDate).length, drillRate = li?.drillCompleted ? sample(li.drillSuccesses / li.drillCompleted, li.drillCompleted) : sample(rate(retryDone, retries.length), retries.length), reviewRate = li?.reviewCompleted ? sample(li.reviewSuccesses / li.reviewCompleted, li.reviewCompleted) : null, repeated = li && li.repeatedErrorsPrevious > 0 ? clamp((li.repeatedErrorsPrevious - li.repeatedErrorsCurrent) / li.repeatedErrorsPrevious) : null, masteryGrowth = li?.masteryCurrent != null && li?.masteryPrevious != null ? clamp((li.masteryCurrent - li.masteryPrevious) / 0.25) : null;
  const mastery = weighted([{ value: reviewRate, max: 100 }, { value: drillRate, max: 80 }, { value: repeated, max: 70 }, { value: masteryGrowth, max: 50 }], 300);
  const currentScores = data.scores.filter((v) => between(v.date, start, end)), previousScores = data.scores.filter((v) => between(v.date, previousStart, previousEnd)), currentSubjects = subjectAverages(currentScores), previousSubjects = subjectAverages(previousScores), currentPerformance = average(currentSubjects), changes = currentSubjects.map((v, i) => v === null || previousSubjects[i] === null ? null : clamp((v - previousSubjects[i] + 10) / 20)), performanceChange = average(changes), goals = data.weeklyCapabilityGoals.filter((v) => between(v.weekStart, start, end)), goalRate = rate(goals.filter((v) => v.done).length, goals.length), performance = weighted([{ value: currentPerformance === null ? null : clamp(currentPerformance / 100), max: 80 }, { value: performanceChange, max: 80 }, { value: goalRate, max: 40 }], 200);
  const active14 = new Set(sessions(data, start, end).map((v) => v.date)).size, dailyRates = Array.from({ length: 14 }, (_, i) => {
    const p = plans(data, add(start, i), add(start, i));
    return p.length ? p.filter((v) => v.done).length / p.length : null;
  }).filter((v) => v !== null), schedule = li?.reviewScheduleCompleted ? li.reviewScheduleCredits / li.reviewScheduleCompleted : null, consistency = weighted([{ value: active14 / 14, max: 60 }, { value: stability(dailyRates), max: 50 }, { value: schedule, max: 40 }], 150);
  const currentPeriodPlans = plans(data, start, end), previousPeriodPlans = plans(data, previousStart, previousEnd), currentPlan = rate(currentPeriodPlans.filter((v) => v.done).length, currentPeriodPlans.length), previousPlan = rate(previousPeriodPlans.filter((v) => v.done).length, previousPeriodPlans.length), executionGrowth = currentPlan !== null && previousPlan !== null ? clamp((currentPlan - previousPlan + 0.25) / 0.5) : null, currentActive = active14 / 14, previousActive = new Set(sessions(data, previousStart, previousEnd).map((v) => v.date)).size / 14, consistencyGrowth = clamp((currentActive - previousActive + 0.25) / 0.5), growth = weighted([{ value: masteryGrowth, max: 60 }, { value: performanceChange, max: 50 }, { value: executionGrowth, max: 25 }, { value: consistencyGrowth, max: 15 }], 150), breakdown = { execution, mastery, performance, consistency, growth };
  const weakAreas = [["\uACC4\uD68D \uC2E4\uD589\uB960", planExecution ?? 0], ["Review \uC131\uACF5", reviewRate ?? 0], ["\uBC18\uBCF5 \uC624\uB2F5 \uAC10\uC18C", repeated ?? 0], ["\uC131\uACFC \uAC1C\uC120", performanceChange ?? 0]].sort((a, b) => Number(a[1]) - Number(b[1])).slice(0, 2).map((v) => String(v[0])), nextActions = weakAreas.map((v) => v === "Review \uC131\uACF5" ? "\uC608\uC815\uB41C D+3/D+7/D+14 Review\uB97C \uACB0\uACFC\uC640 \uD568\uAED8 \uC644\uB8CC\uD558\uC138\uC694." : v === "\uBC18\uBCF5 \uC624\uB2F5 \uAC10\uC18C" ? "\uCD5C\uADFC \uBC18\uBCF5 \uC2E4\uD328 Core Rule \uD558\uB098\uB97C Drill\uB85C \uB2E4\uC2DC \uAC80\uC99D\uD558\uC138\uC694." : v === "\uACC4\uD68D \uC2E4\uD589\uB960" ? "\uC624\uB298 \uACC4\uD68D \uC911 \uAC00\uC7A5 \uC911\uC694\uD55C \uD55C \uD56D\uBAA9\uC744 \uC644\uB8CC\uD558\uC138\uC694." : "\uCD5C\uADFC \uC2DC\uD5D8 \uD55C \uACFC\uBAA9\uC758 \uC2E4\uD328 \uC6D0\uC778\uC744 Core Rule\uACFC \uC5F0\uACB0\uD558\uC138\uC694.");
  return { total: Object.values(breakdown).reduce((a, b) => a + b, 0), scoreVersion: 2, breakdown, metrics: { currentWeekSeconds: currentSeconds, previousWeekSeconds: seconds(data, add(weekStart, -7), add(weekStart, -1)), planExecutionRate: round((planExecution ?? 0) * 100), studyGoalRate: studyGoal === null ? null : round(studyGoal * 100), activeDays, availableDays, streakDays: active14, reviewSuccessRate: reviewRate === null ? null : round(reviewRate * 100), drillSuccessRate: drillRate === null ? null : round(drillRate * 100), repeatedErrorReduction: repeated === null ? null : round(repeated * 100), coreRuleMasteryGrowth: masteryGrowth === null ? null : round(masteryGrowth * 100), performanceChange: performanceChange === null ? null : round((performanceChange - 0.5) * 200) / 10, capabilityGoalRate: goalRate === null ? null : round(goalRate * 100), reviewScheduleRate: schedule === null ? null : round(schedule * 100), drillCompletionRate: drillRate === null ? 0 : round(drillRate * 100), completedTripleDrills: data.wrongAnswerDrills.filter((v) => (v.retries ?? []).length >= 3 && (v.retries ?? []).every((r) => r.completedDate)).length, weaknessImprovementRate: repeated === null ? 0 : round(repeated * 100), growthRate: round(((executionGrowth ?? 0.5) - 0.5) * 2e3) / 10, weakAreas, nextActions }, calculatedAt: now.toISOString() };
}
__name(calculateArenaScore, "calculateArenaScore");

// src/arena.ts
async function ensureArenaTables(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS arena_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,nickname TEXT NOT NULL UNIQUE,grade TEXT NOT NULL DEFAULT '',target_university TEXT NOT NULL DEFAULT '',target_department TEXT NOT NULL DEFAULT '',target_admission_type TEXT NOT NULL DEFAULT '',study_goal TEXT NOT NULL DEFAULT '[]',achievement_level TEXT NOT NULL DEFAULT '',profile_image TEXT,updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_groups (id TEXT PRIMARY KEY,owner_user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('university','department','custom')),target_university TEXT NOT NULL DEFAULT '',target_department TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),invite_code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_group_members (group_id TEXT NOT NULL REFERENCES arena_groups(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL,PRIMARY KEY(group_id,user_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_seasons (id TEXT PRIMARY KEY,name TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_season_preferences (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,season_id TEXT NOT NULL REFERENCES arena_seasons(id) ON DELETE CASCADE,custom_name TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,season_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_score_snapshots (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,season_id TEXT NOT NULL REFERENCES arena_seasons(id),week_start TEXT NOT NULL,score INTEGER NOT NULL,execution INTEGER NOT NULL,problem_solving INTEGER NOT NULL DEFAULT 0,mastery INTEGER NOT NULL DEFAULT 0,performance INTEGER NOT NULL DEFAULT 0,consistency INTEGER NOT NULL,growth INTEGER NOT NULL,growth_rate REAL NOT NULL DEFAULT 0,score_version INTEGER NOT NULL DEFAULT 1,metrics TEXT NOT NULL DEFAULT '{}',calculated_at TEXT NOT NULL,UNIQUE(user_id,season_id,week_start))"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_rivals (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,rival_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(user_id,rival_user_id),CHECK(user_id <> rival_user_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS arena_achievements (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,code TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,awarded_at TEXT NOT NULL,UNIQUE(user_id,code))")
  ]);
  const columns = await db.prepare("PRAGMA table_info(arena_score_snapshots)").all(), names = new Set(columns.results.map((v) => v.name));
  for (const [name, sql] of [["mastery", "ALTER TABLE arena_score_snapshots ADD COLUMN mastery INTEGER NOT NULL DEFAULT 0"], ["performance", "ALTER TABLE arena_score_snapshots ADD COLUMN performance INTEGER NOT NULL DEFAULT 0"], ["score_version", "ALTER TABLE arena_score_snapshots ADD COLUMN score_version INTEGER NOT NULL DEFAULT 1"]]) if (!names.has(name)) await db.prepare(sql).run();
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS arena_scores_season_score ON arena_score_snapshots(season_id,score DESC)"),
    db.prepare("INSERT OR IGNORE INTO arena_seasons(id,name,starts_at,ends_at) VALUES('suneung-2028-fall','2028 \uC218\uB2A5 \uC2DC\uC98C','2026-09-01','2026-12-31')"),
    db.prepare("CREATE TABLE IF NOT EXISTS learning_reviews(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,review_type TEXT NOT NULL DEFAULT 'retry',scheduled_at TEXT,reviewed_at TEXT,result TEXT NOT NULL DEFAULT 'pending',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)")
  ]);
}
__name(ensureArenaTables, "ensureArenaTables");
var object2 = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "object");
var string = /* @__PURE__ */ __name((value, max = 80) => typeof value === "string" ? value.trim().slice(0, max) : "", "string");
var number2 = /* @__PURE__ */ __name((value, min, max) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min, "number");
var parse = /* @__PURE__ */ __name((value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}, "parse");
var monday = /* @__PURE__ */ __name((iso2) => {
  const date = /* @__PURE__ */ new Date(`${getStudyDayKey(new Date(iso2))}T12:00:00+09:00`);
  const day2 = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day2 + 1);
  return getStudyDayKey(date);
}, "monday");
var profileDto = /* @__PURE__ */ __name((row) => ({ nickname: row.nickname, grade: row.grade, targetUniversity: row.target_university, targetDepartment: row.target_department, targetAdmissionType: row.target_admission_type, studyGoal: parse(row.study_goal, []), achievementLevel: row.achievement_level, ...row.profile_image ? { profileImage: row.profile_image } : {} }), "profileDto");
var groupDto = /* @__PURE__ */ __name((row, userId) => ({ id: row.id, name: row.name, type: row.type, targetUniversity: row.target_university, targetDepartment: row.target_department, memberCount: row.member_count, visibility: row.visibility, joined: Boolean(row.joined), owner: row.owner_user_id === userId, ...row.owner_user_id === userId ? { inviteCode: row.invite_code } : {} }), "groupDto");
async function season(db, userId) {
  const DAY2 = 864e5, CYCLE_DAYS = 14, anchor = Date.UTC(2026, 8, 1);
  const today = /* @__PURE__ */ new Date(), todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const cycle = Math.max(0, Math.floor((todayUtc - anchor) / (DAY2 * CYCLE_DAYS)));
  const startsAt = new Date(anchor + cycle * CYCLE_DAYS * DAY2).toISOString().slice(0, 10);
  const endsAt = new Date(anchor + (cycle * CYCLE_DAYS + CYCLE_DAYS - 1) * DAY2).toISOString().slice(0, 10);
  const id = `arena-14d-${startsAt}`, defaultName = `14\uC77C \uC131\uC7A5 \xB7 \uC2DC\uC98C ${cycle + 1}`;
  await db.prepare("INSERT OR IGNORE INTO arena_seasons(id,name,starts_at,ends_at) VALUES(?,?,?,?)").bind(id, defaultName, startsAt, endsAt).run();
  const preference = await db.prepare("SELECT custom_name FROM arena_season_preferences WHERE user_id=? AND season_id=?").bind(userId, id).first();
  return { id, name: preference?.custom_name || defaultName, startsAt, endsAt, status: "active" };
}
__name(season, "season");
async function ranking(db, userId, seasonId, groupId = "") {
  const membership = groupId ? "AND EXISTS (SELECT 1 FROM arena_group_members gm WHERE gm.user_id=p.user_id AND gm.group_id=?)" : "";
  const statement = db.prepare(`SELECT p.user_id,u.arena_public_id public_id,p.nickname,p.target_university,p.target_department,s.score,s.growth_rate FROM arena_profiles p JOIN users u ON u.id=p.user_id JOIN arena_score_snapshots s ON s.user_id=p.user_id WHERE s.season_id=? AND s.score_version=2 AND s.calculated_at=(SELECT MAX(s2.calculated_at) FROM arena_score_snapshots s2 WHERE s2.user_id=s.user_id AND s2.season_id=s.season_id AND s2.score_version=2) ${membership} ORDER BY s.score DESC,s.mastery DESC,s.performance DESC,s.growth DESC,s.calculated_at ASC LIMIT 100`);
  const result = groupId ? await statement.bind(seasonId, groupId).all() : await statement.bind(seasonId).all();
  return result.results.map((row, index) => ({ rank: index + 1, userId: row.public_id, nickname: row.nickname, score: row.score, growthRate: row.growth_rate, targetUniversity: row.target_university, targetDepartment: row.target_department, isMe: row.user_id === userId }));
}
__name(ranking, "ranking");
var scoreDto = /* @__PURE__ */ __name((row) => ({ total: row.score, scoreVersion: row.score_version, breakdown: { execution: row.execution, mastery: row.mastery, performance: row.performance, consistency: row.consistency, growth: row.growth }, metrics: parse(row.metrics, {}), calculatedAt: row.calculated_at }), "scoreDto");
async function achievements(db, userId) {
  const rows2 = await db.prepare("SELECT id,code,title,description,awarded_at FROM arena_achievements WHERE user_id=? ORDER BY awarded_at DESC").bind(userId).all();
  return rows2.results.map((row) => ({ id: row.id, code: row.code, title: row.title, description: row.description, awardedAt: row.awarded_at }));
}
__name(achievements, "achievements");
async function award(db, userId, code, title, description, now, randomHex2) {
  await db.prepare("INSERT OR IGNORE INTO arena_achievements(id,user_id,code,title,description,awarded_at) VALUES(?,?,?,?,?,?)").bind(`ach_${randomHex2(12)}`, userId, code, title, description, now).run();
}
__name(award, "award");
async function rivals(db, userId, seasonId) {
  const rows2 = await db.prepare(`SELECT p.user_id,u.arena_public_id public_id,p.nickname,p.target_university,p.target_department,s.score,s.growth_rate,s.execution,s.mastery,s.performance,s.consistency,s.growth,s.metrics FROM arena_rivals r JOIN arena_profiles p ON p.user_id=r.rival_user_id JOIN users u ON u.id=p.user_id LEFT JOIN arena_score_snapshots s ON s.user_id=p.user_id AND s.season_id=? AND s.score_version=2 AND s.calculated_at=(SELECT MAX(s2.calculated_at) FROM arena_score_snapshots s2 WHERE s2.user_id=p.user_id AND s2.season_id=? AND s2.score_version=2) WHERE r.user_id=? ORDER BY r.created_at DESC`).bind(seasonId, seasonId, userId).all();
  const mine = await db.prepare("SELECT score,growth_rate,execution,mastery,performance,consistency,growth,metrics FROM arena_score_snapshots WHERE user_id=? AND season_id=? AND score_version=2 ORDER BY calculated_at DESC LIMIT 1").bind(userId, seasonId).first();
  return rows2.results.map((row, index) => {
    const comparison = [
      { label: "\uC2E4\uD589", mine: Math.round(mine?.execution || 0), rival: Math.round(row.execution || 0), unit: "" },
      { label: "\uCCB4\uD654", mine: Math.round(mine?.mastery || 0), rival: Math.round(row.mastery || 0), unit: "" },
      { label: "\uC131\uACFC", mine: Math.round(mine?.performance || 0), rival: Math.round(row.performance || 0), unit: "" },
      { label: "\uAFB8\uC900\uD568", mine: Math.round(mine?.consistency || 0), rival: Math.round(row.consistency || 0), unit: "" },
      { label: "\uC131\uC7A5", mine: Math.round(mine?.growth || 0), rival: Math.round(row.growth || 0), unit: "" }
    ];
    const gap = comparison.map((item) => ({ ...item, delta: item.mine - item.rival })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    return { rank: index + 1, userId: row.public_id, nickname: row.nickname, score: row.score || 0, growthRate: row.growth_rate || 0, targetUniversity: row.target_university, targetDepartment: row.target_department, comparison, insight: gap ? `${gap.label}\uC5D0\uC11C ${Math.abs(gap.delta).toFixed(1)}${gap.unit} \uCC28\uC774\uAC00 \uAC00\uC7A5 \uD07D\uB2C8\uB2E4. \uC2B9\uD328\uBCF4\uB2E4 \uB2E4\uC74C \uC8FC \uBCC0\uD654 \uD3ED\uC744 \uD655\uC778\uD558\uC138\uC694.` : "\uBE44\uAD50\uD560 \uD559\uC2B5 \uAE30\uB85D\uC774 \uC544\uC9C1 \uBD80\uC871\uD569\uB2C8\uB2E4." };
  });
}
__name(rivals, "rivals");
async function arena(request, env, user, origin, tools) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/arena")) return null;
  if (!user) return tools.json({ error: "Unauthorized" }, 401, origin);
  await ensureArenaTables(env.DB);
  const currentSeason = await season(env.DB, user.id);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (url.pathname === "/api/arena" && request.method === "GET") {
    const [profile, groupRows, board, latest, rivalRows, badges] = await Promise.all([
      env.DB.prepare("SELECT * FROM arena_profiles WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare(`SELECT g.*,COUNT(gm.user_id) member_count,MAX(CASE WHEN gm.user_id=? THEN 1 ELSE 0 END) joined FROM arena_groups g LEFT JOIN arena_group_members gm ON gm.group_id=g.id GROUP BY g.id HAVING g.visibility='public' OR joined=1 ORDER BY joined DESC,member_count DESC,g.created_at DESC`).bind(user.id).all(),
      ranking(env.DB, user.id, currentSeason.id),
      env.DB.prepare("SELECT score,execution,mastery,performance,consistency,growth,score_version,metrics,calculated_at FROM arena_score_snapshots WHERE user_id=? AND season_id=? AND score_version=2 ORDER BY calculated_at DESC LIMIT 1").bind(user.id, currentSeason.id).first(),
      rivals(env.DB, user.id, currentSeason.id),
      achievements(env.DB, user.id)
    ]);
    return tools.json({ profile: profile ? profileDto(profile) : null, groups: groupRows.results.map((row) => groupDto(row, user.id)), ranking: board, rivals: rivalRows, achievements: badges, season: currentSeason, latestScore: latest ? scoreDto(latest) : null }, 200, origin);
  }
  if (url.pathname === "/api/arena/profile" && request.method === "PUT") {
    const body = object2(await tools.boundedJson(request));
    if (!body) return tools.json({ error: "\uD504\uB85C\uD544 \uC815\uBCF4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400, origin);
    const nickname = string(body.nickname, 20);
    if (nickname.length < 2) return tools.json({ error: "\uB2C9\uB124\uC784\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
    const goals = Array.isArray(body.studyGoal) ? body.studyGoal.map((item) => string(item, 80)).filter(Boolean).slice(0, 5) : [];
    try {
      await env.DB.prepare(`INSERT INTO arena_profiles(user_id,nickname,grade,target_university,target_department,target_admission_type,study_goal,achievement_level,profile_image,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname,grade=excluded.grade,target_university=excluded.target_university,target_department=excluded.target_department,target_admission_type=excluded.target_admission_type,study_goal=excluded.study_goal,achievement_level=excluded.achievement_level,profile_image=excluded.profile_image,updated_at=excluded.updated_at`).bind(user.id, nickname, string(body.grade, 20), string(body.targetUniversity), string(body.targetDepartment), string(body.targetAdmissionType, 30), JSON.stringify(goals), string(body.achievementLevel, 40), string(body.profileImage, 500) || null, now).run();
    } catch {
      return tools.json({ error: "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4." }, 409, origin);
    }
    const saved = await env.DB.prepare("SELECT * FROM arena_profiles WHERE user_id=?").bind(user.id).first();
    return tools.json({ profile: saved ? profileDto(saved) : null }, 200, origin);
  }
  if (url.pathname === "/api/arena/season" && request.method === "PUT") {
    const body = object2(await tools.boundedJson(request));
    const name = string(body?.name, 32);
    if (name.length < 2) return tools.json({ error: "\uC2DC\uC98C \uC774\uB984\uC740 2\uC790 \uC774\uC0C1 \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
    await env.DB.prepare("INSERT INTO arena_season_preferences(user_id,season_id,custom_name,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,season_id) DO UPDATE SET custom_name=excluded.custom_name,updated_at=excluded.updated_at").bind(user.id, currentSeason.id, name, now).run();
    return tools.json({ season: { ...currentSeason, name } }, 200, origin);
  }
  if (url.pathname === "/api/arena/score" && request.method === "POST") return tools.json({ error: "\uD074\uB77C\uC774\uC5B8\uD2B8 \uC810\uC218 \uC81C\uCD9C\uC740 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. /api/arena/recalculate\uB97C \uC0AC\uC6A9\uD558\uC138\uC694." }, 405, origin, { Allow: "POST /api/arena/recalculate" });
  if (url.pathname === "/api/arena/recalculate" && request.method === "POST") {
    const row = await env.DB.prepare("SELECT payload FROM learning_state WHERE user_id=?").bind(user.id).first();
    if (!row) return tools.json({ error: "Arena \uC810\uC218\uB97C \uACC4\uC0B0\uD560 \uD559\uC2B5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 409, origin);
    let data;
    try {
      data = JSON.parse(row.payload);
    } catch {
      return tools.json({ error: "\uD559\uC2B5 \uAE30\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500, origin);
    }
    const review = await env.DB.prepare("SELECT COUNT(*) completed,SUM(CASE WHEN result='success' THEN 1 ELSE 0 END) successes,SUM(CASE WHEN scheduled_at IS NOT NULL AND reviewed_at IS NOT NULL AND ABS(julianday(reviewed_at)-julianday(scheduled_at))<=1 THEN 1 WHEN scheduled_at IS NOT NULL AND reviewed_at IS NOT NULL AND ABS(julianday(reviewed_at)-julianday(scheduled_at))<=3 THEN .5 ELSE 0 END) schedule_credit,SUM(CASE WHEN scheduled_at IS NOT NULL AND reviewed_at IS NOT NULL THEN 1 ELSE 0 END) schedule_completed FROM learning_reviews WHERE user_id=? AND result<>'pending'").bind(user.id).first();
    const calculatedAt = now, wrong = data.wrongAnswerDrills, todayKey = getStudyDayKey(new Date(calculatedAt)), currentStart = getStudyDayKey(new Date(getStudyDayRange(todayKey).start.getTime() - 13 * 864e5)), previousStart = getStudyDayKey(new Date(getStudyDayRange(todayKey).start.getTime() - 27 * 864e5)), previousEnd = getStudyDayKey(new Date(getStudyDayRange(todayKey).start.getTime() - 14 * 864e5)), currentWrong = wrong.filter((v) => v.date >= currentStart && v.date <= todayKey).length, previousWrong = wrong.filter((v) => v.date >= previousStart && v.date <= previousEnd).length, retries = wrong.flatMap((v) => v.retries ?? []), done = retries.filter((v) => v.completedDate).length;
    const intelligence = { reviewSuccesses: Number(review?.successes || 0), reviewCompleted: Number(review?.completed || 0), drillSuccesses: done, drillCompleted: retries.length, repeatedErrorsCurrent: currentWrong, repeatedErrorsPrevious: previousWrong, reviewScheduleCredits: Number(review?.schedule_credit || 0), reviewScheduleCompleted: Number(review?.schedule_completed || 0) };
    const score = calculateArenaScore(data, new Date(calculatedAt), intelligence), { breakdown, metrics } = score;
    const { execution, mastery, performance, consistency, growth } = breakdown, total = score.total, growthRate = metrics.growthRate;
    await env.DB.prepare(`INSERT INTO arena_score_snapshots(id,user_id,season_id,week_start,score,execution,problem_solving,mastery,performance,consistency,growth,growth_rate,score_version,metrics,calculated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,2,?,?) ON CONFLICT(user_id,season_id,week_start) DO UPDATE SET score=excluded.score,execution=excluded.execution,mastery=excluded.mastery,performance=excluded.performance,consistency=excluded.consistency,growth=excluded.growth,growth_rate=excluded.growth_rate,score_version=2,metrics=excluded.metrics,calculated_at=excluded.calculated_at`).bind(`score_${tools.randomHex(12)}`, user.id, currentSeason.id, monday(calculatedAt), total, execution, 0, mastery, performance, consistency, growth, growthRate, JSON.stringify(metrics).slice(0, 8e3), calculatedAt).run();
    const profile = await env.DB.prepare("SELECT target_university,achievement_level FROM arena_profiles WHERE user_id=?").bind(user.id).first();
    if (profile?.target_university.includes("\uC11C\uC6B8\uB300") && number2(metrics.streakDays, 0, 1e4) >= 30) await award(env.DB, user.id, "snu-challenger", "\uC11C\uC6B8\uB300 \uB3C4\uC804\uC790", "\uC11C\uC6B8\uB300\uD559\uAD50 \uBAA9\uD45C \uC124\uC815 \uD6C4 30\uC77C \uC5F0\uC18D \uD559\uC2B5", now, tools.randomHex);
    if (profile?.achievement_level.includes("1\uB4F1\uAE09")) await award(env.DB, user.id, "grade-one", "1\uB4F1\uAE09 \uC9C4\uC785", "\uD504\uB85C\uD544 \uC131\uCDE8 \uC218\uC900\uC5D0 1\uB4F1\uAE09 \uAE30\uB85D", now, tools.randomHex);
    if (number2(metrics.completedTripleDrills, 0, 1e4) >= 1) await award(env.DB, user.id, "wrong-answer-breaker", "\uC624\uB2F5 \uC81C\uAC70\uC790", "\uB3D9\uC77C \uC624\uB2F5 Drill 3\uD68C \uC5F0\uC18D \uC7AC\uD480\uC774 \uC644\uB8CC", now, tools.randomHex);
    if (growthRate >= 10) await award(env.DB, user.id, "growth-10", "\uC8FC\uAC04 \uC131\uC7A5 +10", "\uD55C \uC8FC \uC131\uC7A5\uB960 10% \uC774\uC0C1 \uB2EC\uC131", now, tools.randomHex);
    return tools.json({ ok: true, score, achievements: await achievements(env.DB, user.id) }, 200, origin);
  }
  if (url.pathname === "/api/arena/groups" && request.method === "POST") {
    const body = object2(await tools.boundedJson(request));
    const name = string(body?.name, 50);
    const type = string(body?.type, 20);
    const visibility = string(body?.visibility, 20);
    if (!name || !["university", "department", "custom"].includes(type) || !["public", "private"].includes(visibility)) return tools.json({ error: "\uADF8\uB8F9 \uC815\uBCF4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694." }, 400, origin);
    const id = `grp_${tools.randomHex(12)}`, invite = tools.randomHex(5).toUpperCase();
    await env.DB.batch([env.DB.prepare("INSERT INTO arena_groups(id,owner_user_id,name,type,target_university,target_department,visibility,invite_code,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id, user.id, name, type, string(body?.targetUniversity), string(body?.targetDepartment), visibility, invite, now), env.DB.prepare("INSERT INTO arena_group_members(group_id,user_id,role,joined_at) VALUES(?,?, 'owner',?)").bind(id, user.id, now)]);
    const row = await env.DB.prepare("SELECT g.*,1 member_count,1 joined FROM arena_groups g WHERE id=?").bind(id).first();
    return tools.json({ group: row ? groupDto(row, user.id) : null }, 201, origin);
  }
  if (url.pathname === "/api/arena/groups/join" && request.method === "POST") {
    const body = object2(await tools.boundedJson(request));
    const lookup = string(body?.groupIdOrCode, 80);
    if (!lookup) return tools.json({ error: "\uADF8\uB8F9 \uB610\uB294 \uCD08\uB300 \uCF54\uB4DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
    const group = await env.DB.prepare("SELECT id,visibility,invite_code FROM arena_groups WHERE id=? OR invite_code=?").bind(lookup, lookup.toUpperCase()).first();
    if (!group) return tools.json({ error: "\uADF8\uB8F9\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 404, origin);
    if (group.visibility === "private" && lookup.toUpperCase() !== group.invite_code) return tools.json({ error: "\uBE44\uACF5\uAC1C \uADF8\uB8F9\uC740 \uCD08\uB300 \uCF54\uB4DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 403, origin);
    await env.DB.prepare("INSERT OR IGNORE INTO arena_group_members(group_id,user_id,role,joined_at) VALUES(?,?,'member',?)").bind(group.id, user.id, now).run();
    return tools.json({ ok: true }, 200, origin);
  }
  if (url.pathname === "/api/arena/ranking" && request.method === "GET") {
    const groupId = string(url.searchParams.get("group"), 80);
    if (groupId) {
      const access = await env.DB.prepare("SELECT g.id FROM arena_groups g LEFT JOIN arena_group_members gm ON gm.group_id=g.id AND gm.user_id=? WHERE g.id=? AND (g.visibility='public' OR gm.user_id IS NOT NULL)").bind(user.id, groupId).first();
      if (!access) return tools.json({ error: "\uADF8\uB8F9 \uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403, origin);
    }
    return tools.json({ ranking: await ranking(env.DB, user.id, currentSeason.id, groupId) }, 200, origin);
  }
  if (url.pathname === "/api/arena/rivals" && request.method === "POST") {
    const body = object2(await tools.boundedJson(request));
    const rivalPublicId = string(body?.rivalUserId, 80);
    const rival = await env.DB.prepare("SELECT id FROM users WHERE arena_public_id=? AND active=1").bind(rivalPublicId).first();
    const rivalId = rival?.id || 0;
    if (!rivalId || rivalId === user.id) return tools.json({ error: "\uB77C\uC774\uBC8C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694." }, 400, origin);
    const count = await env.DB.prepare("SELECT COUNT(*) count FROM arena_rivals WHERE user_id=?").bind(user.id).first();
    if ((count?.count || 0) >= 3) return tools.json({ error: "\uB77C\uC774\uBC8C\uC740 \uCD5C\uB300 3\uBA85\uAE4C\uC9C0 \uC9C0\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }, 409, origin);
    const exists = await env.DB.prepare("SELECT user_id FROM arena_profiles WHERE user_id=?").bind(rivalId).first();
    if (!exists) return tools.json({ error: "\uD559\uC0DD\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 404, origin);
    await env.DB.prepare("INSERT OR IGNORE INTO arena_rivals(user_id,rival_user_id,created_at) VALUES(?,?,?)").bind(user.id, rivalId, now).run();
    return tools.json({ ok: true }, 200, origin);
  }
  if (url.pathname.startsWith("/api/arena/rivals/") && request.method === "DELETE") {
    const publicId = decodeURIComponent(url.pathname.slice("/api/arena/rivals/".length));
    const rival = await env.DB.prepare("SELECT id FROM users WHERE arena_public_id=?").bind(publicId).first();
    if (rival) await env.DB.prepare("DELETE FROM arena_rivals WHERE user_id=? AND rival_user_id=?").bind(user.id, rival.id).run();
    return tools.json({ ok: true }, 200, origin);
  }
  return tools.json({ error: "Not found" }, 404, origin);
}
__name(arena, "arena");

// src/study-room/StudyRoomDurableObject.ts
import { DurableObject } from "cloudflare:workers";
var MAX_MESSAGE_BYTES = 32768;
var OPEN = 1;
var idleStudyState = /* @__PURE__ */ __name(() => ({ status: "idle", active: false, elapsedSeconds: 0, todayMinutes: 0 }), "idleStudyState");
var isIsoDate = /* @__PURE__ */ __name((value) => typeof value === "string" && Number.isFinite(Date.parse(value)), "isIsoDate");
var finiteRange = /* @__PURE__ */ __name((value, min, max) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0, "finiteRange");
var StudyRoomDurableObject = class extends DurableObject {
  static {
    __name(this, "StudyRoomDurableObject");
  }
  async createTicket(ticket) {
    const uniqueParticipants = new Set(this.openParticipants().map((item) => item.participantId));
    if (!uniqueParticipants.has(ticket.participantId) && uniqueParticipants.size >= ticket.maxParticipants) throw new Error("Room is full");
    await this.ctx.storage.put(`ticket:${ticket.token}`, ticket);
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || currentAlarm > ticket.expiresAt) await this.ctx.storage.setAlarm(ticket.expiresAt);
  }
  async alarm() {
    const now = Date.now();
    const tickets = await this.ctx.storage.list({ prefix: "ticket:" });
    await Promise.all([...tickets].filter(([, value]) => value.expiresAt <= now).map(([key2]) => this.ctx.storage.delete(key2)));
    const deadlines = [...tickets].map(([, value]) => value.expiresAt).filter((expiresAt) => expiresAt > now);
    const empty = await this.ctx.storage.get("empty-room");
    if (empty) {
      const expiresAt = empty.emptySince + 5 * 6e4;
      if (expiresAt <= now && !this.ctx.getWebSockets().some((socket) => socket.readyState === OPEN)) {
        await this.env.DB.prepare("UPDATE study_rooms SET is_active=0 WHERE id=?").bind(empty.roomId).run();
        await this.ctx.storage.delete("empty-room");
      } else deadlines.push(expiresAt);
    }
    const next = deadlines.sort((a, b) => a - b)[0];
    if (next) await this.ctx.storage.setAlarm(next);
  }
  async authorizeMediaToken(participantId2, connectionId) {
    const socket = this.participantSocket(participantId2);
    if (!socket || !connectionId) return { allowed: false };
    const attachment = socket.deserializeAttachment();
    if (attachment.connectionId !== connectionId) return { allowed: false };
    const now = Date.now();
    if (attachment.lastMediaTokenAt && now - attachment.lastMediaTokenAt < 3e3) {
      return { allowed: false, rateLimited: true };
    }
    attachment.lastMediaTokenAt = now;
    socket.serializeAttachment(attachment);
    return { allowed: true };
  }
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
    const token = new URL(request.url).searchParams.get("ticket") || "";
    if (!token || token.length > 160) return new Response("Invalid ticket", { status: 401 });
    const key2 = `ticket:${token}`;
    const ticket = await this.ctx.storage.get(key2);
    if (!ticket || ticket.expiresAt <= Date.now()) {
      if (ticket) await this.ctx.storage.delete(key2);
      return new Response("Expired ticket", { status: 401 });
    }
    await this.ctx.storage.delete(key2);
    const existing = this.ctx.getWebSockets(`participant:${ticket.participantId}`).filter((socket) => socket.readyState === OPEN);
    const uniqueParticipants = new Set(this.openParticipants().map((item) => item.participantId));
    if (!uniqueParticipants.has(ticket.participantId) && uniqueParticipants.size >= ticket.maxParticipants) return new Response("Room is full", { status: 409 });
    existing.forEach((socket) => socket.close(4001, "Replaced by a newer connection"));
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const joinedAt = (/* @__PURE__ */ new Date()).toISOString();
    const attachment = { roomId: ticket.roomId, userId: ticket.userId, participantId: ticket.participantId, username: ticket.username, connectionId: ticket.connectionId, joinedAt, cameraEnabled: false, microphoneEnabled: false, studyState: idleStudyState(), messageWindowStartedAt: Date.now(), messageCount: 0 };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [`participant:${ticket.participantId}`]);
    await this.ctx.storage.delete("empty-room");
    await this.env.DB.prepare("INSERT INTO study_room_members(room_id,user_id,connection_id,joined_at) VALUES(?,?,?,?)").bind(ticket.roomId, ticket.userId, ticket.connectionId, joinedAt).run();
    this.send(server, { type: "room-state", room: { id: ticket.roomId, name: ticket.roomName, maxParticipants: ticket.maxParticipants }, selfId: ticket.participantId, participants: this.openParticipants().map((item) => this.toParticipant(item)) });
    this.broadcast({ type: "participant-joined", participant: this.toParticipant(attachment) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket, message) {
    const bytes2 = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (bytes2 > MAX_MESSAGE_BYTES || typeof message !== "string") return socket.close(1009, "Message too large");
    const attachment = socket.deserializeAttachment();
    if (!attachment) return socket.close(1008, "Missing identity");
    const now = Date.now();
    if (now - attachment.messageWindowStartedAt >= 6e4) {
      attachment.messageWindowStartedAt = now;
      attachment.messageCount = 0;
    }
    attachment.messageCount += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messageCount > 180) return socket.close(1008, "Rate limit exceeded");
    let value;
    try {
      value = JSON.parse(message);
    } catch {
      return;
    }
    if (value.type === "camera-state") {
      if (typeof value.enabled !== "boolean") return;
      attachment.cameraEnabled = value.enabled;
      socket.serializeAttachment(attachment);
      this.broadcast({ type: "camera-state", userId: attachment.participantId, enabled: value.enabled });
      return;
    }
    if (value.type === "microphone-state") {
      if (typeof value.enabled !== "boolean") return;
      attachment.microphoneEnabled = value.enabled;
      socket.serializeAttachment(attachment);
      this.broadcast({ type: "microphone-state", userId: attachment.participantId, enabled: value.enabled });
      return;
    }
    if (value.type === "study-state") {
      const active = value.active === true, subject = typeof value.subject === "string" ? value.subject.trim().slice(0, 40) : void 0;
      attachment.studyState = { status: active ? "studying" : value.status === "break" ? "break" : "idle", subject, active, startedAt: active && isIsoDate(value.startedAt) ? value.startedAt : void 0, elapsedSeconds: Math.round(finiteRange(value.elapsedSeconds, 0, 604800)), todayMinutes: Math.round(finiteRange(value.todayMinutes, 0, 1440)) };
      socket.serializeAttachment(attachment);
      this.broadcast({ type: "study-state", userId: attachment.participantId, ...attachment.studyState });
    }
  }
  async webSocketClose(socket, code, reason, wasClean) {
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;
    await this.env.DB.prepare("UPDATE study_room_members SET left_at=? WHERE room_id=? AND user_id=? AND joined_at=? AND left_at IS NULL").bind((/* @__PURE__ */ new Date()).toISOString(), attachment.roomId, attachment.userId, attachment.joinedAt).run();
    const duplicateStillOpen = this.ctx.getWebSockets(`participant:${attachment.participantId}`).some((item) => item !== socket && item.readyState === OPEN);
    if (!duplicateStillOpen) this.broadcast({ type: "participant-left", participantId: attachment.participantId });
    const anyOpen = this.ctx.getWebSockets().some((item) => item !== socket && item.readyState === OPEN);
    if (!anyOpen) {
      const emptySince = Date.now();
      await this.ctx.storage.put("empty-room", { roomId: attachment.roomId, emptySince });
      await this.ctx.storage.setAlarm(emptySince + 5 * 6e4);
    }
    socket.close(code, reason || (wasClean ? "Closed" : "Disconnected"));
  }
  async webSocketError(socket) {
    const attachment = socket.deserializeAttachment();
    if (attachment) console.error(JSON.stringify({ message: "study room websocket error", roomId: attachment.roomId, connectionId: attachment.connectionId }));
    socket.close(1011, "WebSocket error");
  }
  openParticipants() {
    const byParticipant = /* @__PURE__ */ new Map();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== OPEN) continue;
      const value = socket.deserializeAttachment();
      if (value) byParticipant.set(value.participantId, value);
    }
    return [...byParticipant.values()];
  }
  toParticipant(value) {
    return { id: value.participantId, name: value.username, cameraEnabled: value.cameraEnabled, microphoneEnabled: value.microphoneEnabled, connectionId: value.connectionId, studyState: value.studyState };
  }
  participantSocket(participantId2) {
    return this.ctx.getWebSockets(`participant:${participantId2}`).find((socket) => socket.readyState === OPEN);
  }
  broadcast(payload, except) {
    for (const socket of this.ctx.getWebSockets()) if (socket !== except && socket.readyState === OPEN) this.send(socket, payload);
  }
  send(socket, payload) {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
    }
  }
};

// src/study-room/livekit.ts
var encoder2 = new TextEncoder();
function base64Url(bytes2) {
  let binary = "";
  for (let offset = 0; offset < bytes2.length; offset += 32768) {
    binary += String.fromCharCode(...bytes2.subarray(offset, offset + 32768));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64Url, "base64Url");
function encodeJson(value) {
  return base64Url(encoder2.encode(JSON.stringify(value)));
}
__name(encodeJson, "encodeJson");
function liveKitHttpUrl(serverUrl) {
  const url = new URL(serverUrl.trim());
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("LIVEKIT_URL_INVALID");
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}
__name(liveKitHttpUrl, "liveKitHttpUrl");
async function createLiveKitToken(input) {
  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  const serverUrl = input.serverUrl.trim().replace(/\/+$/, "");
  if (!apiKey || !apiSecret || !serverUrl) throw new Error("LIVEKIT_NOT_CONFIGURED");
  liveKitHttpUrl(serverUrl);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1e3);
  const ttl = Math.min(15 * 60, Math.max(60, input.ttlSeconds ?? 10 * 60));
  const expiresAt = now + ttl;
  const roomName = `trinity-study-${input.roomId}`;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: input.identity,
    iat: now,
    nbf: now - 5,
    exp: expiresAt,
    jti: crypto.randomUUID(),
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["camera", "microphone", "screen_share", "screen_share_audio"]
    }
  };
  const unsigned = `${encodeJson(header)}.${encodeJson(payload)}`;
  const key2 = await crypto.subtle.importKey(
    "raw",
    encoder2.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key2, encoder2.encode(unsigned));
  return {
    token: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    url: serverUrl,
    roomName,
    expiresAt: expiresAt * 1e3
  };
}
__name(createLiveKitToken, "createLiveKitToken");

// src/study-room/routes.ts
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var participantId = /* @__PURE__ */ __name((user) => user.arena_public_id || `student-${user.id}`, "participantId");
var roomDto = /* @__PURE__ */ __name((row) => ({
  id: row.id,
  code: row.invite_code,
  name: row.name,
  maxParticipants: row.max_participants,
  createdAt: row.created_at
}), "roomDto");
var codeFromPath = /* @__PURE__ */ __name((pathname, suffix = "") => pathname.match(new RegExp(`^/api/study-rooms/([A-HJ-NP-Z2-9]{6,8})${suffix}$`))?.[1] ?? "", "codeFromPath");
function inviteCode() {
  const bytes2 = new Uint8Array(6);
  crypto.getRandomValues(bytes2);
  return [...bytes2].map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}
__name(inviteCode, "inviteCode");
async function activeRoom(db, code) {
  return db.prepare(`
    SELECT id, invite_code, name, owner_user_id, created_at, is_active, max_participants
    FROM study_rooms
    WHERE invite_code=? AND is_active=1
  `).bind(code).first();
}
__name(activeRoom, "activeRoom");
async function mediaStatus(env) {
  if (!env.LIVEKIT_URL) return { online: false, status: "not_configured" };
  try {
    const response = await fetch(liveKitHttpUrl(env.LIVEKIT_URL), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(2500)
    });
    const online = response.status >= 200 && response.status < 500;
    return { online, status: online ? "online" : "offline" };
  } catch {
    return { online: false, status: "offline" };
  }
}
__name(mediaStatus, "mediaStatus");
async function connectStudyRoomWebSocket(request, env) {
  const url = new URL(request.url);
  const code = codeFromPath(url.pathname, "/websocket");
  if (!code || request.method !== "GET") return null;
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426 });
  }
  return env.STUDY_ROOM.getByName(code).fetch(request);
}
__name(connectStudyRoomWebSocket, "connectStudyRoomWebSocket");
async function handleStudyRoomApi(request, env, user, origin, json2) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/study-rooms")) return null;
  if (!user) return json2({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 401, origin);
  if (url.pathname === "/api/study-rooms/media-status" && request.method === "GET") {
    return json2(await mediaStatus(env), 200, origin);
  }
  if (url.pathname === "/api/study-rooms" && request.method === "POST") {
    const body = await boundedJson(request);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
    const requestedMax = Number(body.maxParticipants);
    const maxParticipants = Number.isInteger(requestedMax) && requestedMax >= 2 && requestedMax <= 10 ? requestedMax : 6;
    if (!name) return json2({ error: "\uBC29 \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
    const id = crypto.randomUUID();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = inviteCode();
      try {
        await env.DB.prepare(`
          INSERT INTO study_rooms(id,invite_code,name,owner_user_id,created_at,is_active,max_participants)
          VALUES(?,?,?,?,?,1,?)
        `).bind(id, code, name, user.id, createdAt, maxParticipants).run();
        return json2({ room: { id, code, name, maxParticipants, createdAt } }, 201, origin);
      } catch (error2) {
        if (!String(error2).toLowerCase().includes("unique")) throw error2;
      }
    }
    return json2({ error: "\uBC29 \uCF54\uB4DC\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." }, 503, origin);
  }
  if (url.pathname === "/api/study-rooms/join" && request.method === "POST") {
    const body = await boundedJson(request);
    const code = typeof body.code === "string" ? body.code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8) : "";
    const room = code ? await activeRoom(env.DB, code) : null;
    return room ? json2({ room: roomDto(room) }, 200, origin) : json2({ error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uAC70\uB098 \uC885\uB8CC\uB41C Study Room\uC785\uB2C8\uB2E4." }, 404, origin);
  }
  const ticketCode = codeFromPath(url.pathname, "/ticket");
  if (ticketCode && request.method === "POST") {
    const room = await activeRoom(env.DB, ticketCode);
    if (!room) return json2({ error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uAC70\uB098 \uC885\uB8CC\uB41C Study Room\uC785\uB2C8\uB2E4." }, 404, origin);
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = [...tokenBytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    const expiresAt = Date.now() + 6e4;
    const connectionId = crypto.randomUUID();
    try {
      await env.STUDY_ROOM.getByName(ticketCode).createTicket({
        token,
        expiresAt,
        roomId: room.id,
        roomName: room.name,
        maxParticipants: room.max_participants,
        userId: user.id,
        participantId: participantId(user),
        username: user.username,
        connectionId
      });
    } catch (error2) {
      if (String(error2).toLowerCase().includes("full")) {
        return json2({ error: "\uC774 Study Room\uC740 \uD604\uC7AC \uAC00\uB4DD \uCC3C\uC2B5\uB2C8\uB2E4." }, 409, origin);
      }
      throw error2;
    }
    return json2({
      ticket: token,
      expiresAt,
      websocketPath: `/api/study-rooms/${ticketCode}/websocket`,
      room: roomDto(room)
    }, 200, origin);
  }
  const liveKitCode = codeFromPath(url.pathname, "/livekit/token");
  if (liveKitCode && request.method === "POST") {
    const room = await activeRoom(env.DB, liveKitCode);
    if (!room) return json2({ error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uAC70\uB098 \uC885\uB8CC\uB41C Study Room\uC785\uB2C8\uB2E4." }, 404, origin);
    const body = await boundedJson(request);
    const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim().slice(0, 80) : "";
    const authorization = await env.STUDY_ROOM.getByName(liveKitCode).authorizeMediaToken(participantId(user), connectionId);
    if (!authorization.allowed) {
      return json2(
        { error: authorization.rateLimited ? "\uD1A0\uD070 \uC694\uCCAD\uC774 \uB108\uBB34 \uBE60\uB985\uB2C8\uB2E4." : "\uBA3C\uC800 Study Room \uC5F0\uACB0\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694." },
        authorization.rateLimited ? 429 : 403,
        origin,
        authorization.rateLimited ? { "Retry-After": "3" } : {}
      );
    }
    try {
      const access = await createLiveKitToken({
        apiKey: env.LIVEKIT_API_KEY ?? "",
        apiSecret: env.LIVEKIT_API_SECRET ?? "",
        serverUrl: env.LIVEKIT_URL ?? "",
        roomId: room.id,
        identity: participantId(user)
      });
      return json2(access, 200, origin, { "Cache-Control": "no-store" });
    } catch (error2) {
      const code = error2 instanceof Error ? error2.message : "";
      if (code === "LIVEKIT_NOT_CONFIGURED" || code === "LIVEKIT_URL_INVALID") {
        return json2({ error: "\uCEA0 \uC11C\uBC84\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uD559\uC2B5\uBC29 \uAE30\uB2A5\uC740 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }, 503, origin);
      }
      console.error(JSON.stringify({ message: "LiveKit token creation failed", roomId: room.id }));
      return json2({ error: "LiveKit \uC811\uC18D \uD1A0\uD070\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500, origin);
    }
  }
  return json2({ error: "Not found" }, 404, origin);
}
__name(handleStudyRoomApi, "handleStudyRoomApi");

// src/learning-graph.ts
var relations = ["derived", "applied", "failed", "reinforced"];
var sourceTypes = ["archive", "wrong_answer", "drill", "review"];
var clean2 = /* @__PURE__ */ __name((v, n = 5e3) => typeof v === "string" ? v.trim().slice(0, n) : "", "clean");
var record = /* @__PURE__ */ __name((v) => v && typeof v === "object" && !Array.isArray(v) ? v : null, "record");
var rows = /* @__PURE__ */ __name((v) => Array.isArray(v) ? v.map(record).filter(Boolean) : [], "rows");
var parse2 = /* @__PURE__ */ __name((value, fallback) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}, "parse");
var nowIso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
async function batchChunks(db, statements, size = 100) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}
__name(batchChunks, "batchChunks");
async function ensureRelationColumn(db) {
  const cols = await db.prepare("PRAGMA table_info(archive_entry_core_rules)").all();
  if (cols.results.length && !cols.results.some((col) => col.name === "relation_type")) {
    await db.prepare("ALTER TABLE archive_entry_core_rules ADD COLUMN relation_type TEXT NOT NULL DEFAULT 'derived'").run();
  }
}
__name(ensureRelationColumn, "ensureRelationColumn");
async function deleteStaleWrongAnswers(db, userId, current) {
  const existing = await db.prepare("SELECT id FROM wrong_answers WHERE user_id=?").bind(userId).all();
  const stale = existing.results.filter((row) => !current.has(row.id));
  const statements = [];
  for (const row of stale) {
    statements.push(
      db.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='wrong_answer' AND source_id=?").bind(userId, row.id),
      db.prepare("DELETE FROM core_rule_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?").bind(userId, row.id),
      db.prepare("DELETE FROM archive_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?").bind(userId, row.id),
      db.prepare("DELETE FROM wrong_answers WHERE user_id=? AND id=?").bind(userId, row.id)
    );
  }
  await batchChunks(db, statements);
}
__name(deleteStaleWrongAnswers, "deleteStaleWrongAnswers");
async function deleteStaleDrills(db, userId, current) {
  const existing = await db.prepare("SELECT id FROM learning_drills WHERE user_id=?").bind(userId).all();
  const stale = existing.results.filter((row) => !current.has(row.id));
  const statements = [];
  for (const row of stale) {
    statements.push(
      db.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='drill' AND source_id=?").bind(userId, row.id),
      db.prepare("DELETE FROM core_rule_drill_links WHERE user_id=? AND drill_id=?").bind(userId, row.id),
      db.prepare("DELETE FROM learning_drills WHERE user_id=? AND id=?").bind(userId, row.id)
    );
  }
  await batchChunks(db, statements);
}
__name(deleteStaleDrills, "deleteStaleDrills");
async function syncLearningProjection(db, userId, payload, sourceUpdatedAt = nowIso()) {
  const app = record(payload) ?? {};
  const wrong = rows(app.wrongAnswerDrills), drills = rows(app.dailyDrills), now = nowIso();
  const wrongIds = /* @__PURE__ */ new Set(), drillIds = /* @__PURE__ */ new Set(), wrongStatements = [], drillStatements = [];
  for (const item of wrong) {
    const id = clean2(item.id, 100);
    if (!id) continue;
    wrongIds.add(id);
    wrongStatements.push(db.prepare(`INSERT INTO wrong_answers(
      user_id,id,date,subject,source,question,wrong_judgment,missed_cue,correction,transfer,bottleneck,status,
      score_id,capability_goal_id,archive_entry_id,retries_json,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET
      date=excluded.date,subject=excluded.subject,source=excluded.source,question=excluded.question,
      wrong_judgment=excluded.wrong_judgment,missed_cue=excluded.missed_cue,correction=excluded.correction,
      transfer=excluded.transfer,bottleneck=excluded.bottleneck,status=excluded.status,score_id=excluded.score_id,
      capability_goal_id=excluded.capability_goal_id,archive_entry_id=excluded.archive_entry_id,
      retries_json=excluded.retries_json,updated_at=excluded.updated_at`).bind(
      userId,
      id,
      clean2(item.date, 40),
      clean2(item.subject, 40),
      clean2(item.source, 240),
      clean2(item.question, 240),
      clean2(item.wrongJudgment, 5e3),
      clean2(item.missedCue, 5e3),
      clean2(item.correction, 5e3),
      clean2(item.transfer, 5e3),
      clean2(item.bottleneck, 120) || null,
      "active",
      clean2(item.scoreId, 100) || null,
      clean2(item.capabilityGoalId, 100) || null,
      clean2(item.archiveEntryId, 100) || null,
      JSON.stringify(Array.isArray(item.retries) ? item.retries : []),
      now,
      now
    ));
  }
  await batchChunks(db, wrongStatements);
  await deleteStaleWrongAnswers(db, userId, wrongIds);
  for (const item of drills) {
    const id = clean2(item.id, 100);
    if (!id) continue;
    drillIds.add(id);
    drillStatements.push(db.prepare(`INSERT INTO learning_drills(
      user_id,id,date,subject,title,action,success_criterion,minutes,capability_goal_id,feedback_id,done,reflection,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET
      date=excluded.date,subject=excluded.subject,title=excluded.title,action=excluded.action,
      success_criterion=excluded.success_criterion,minutes=excluded.minutes,capability_goal_id=excluded.capability_goal_id,
      feedback_id=excluded.feedback_id,done=excluded.done,reflection=excluded.reflection,updated_at=excluded.updated_at`).bind(
      userId,
      id,
      clean2(item.date, 40),
      clean2(item.subject, 40),
      clean2(item.title, 240),
      clean2(item.action, 5e3),
      clean2(item.successCriterion, 3e3),
      Math.max(0, Math.min(1440, Number(item.minutes) || 0)),
      clean2(item.capabilityGoalId, 100) || null,
      clean2(item.feedbackId, 100) || null,
      item.done === true ? 1 : 0,
      clean2(item.reflection, 5e3),
      now,
      now
    ));
  }
  await batchChunks(db, drillStatements);
  await deleteStaleDrills(db, userId, drillIds);
  await db.prepare(`INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at)
    SELECT w.user_id,l.core_rule_id,w.wrong_answer_id,COALESCE(l.relation_type,'failed'),w.created_at
    FROM archive_wrong_answer_links w
    JOIN archive_entry_core_rules l ON l.archive_entry_id=w.archive_entry_id
    JOIN core_rules r ON r.id=l.core_rule_id AND r.user_id=w.user_id
    JOIN wrong_answers wa ON wa.user_id=w.user_id AND wa.id=w.wrong_answer_id
    WHERE w.user_id=?
    ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type`).bind(userId).run();
  await db.prepare(`INSERT INTO learning_graph_user_state(user_id,source_updated_at,projected_at)
    VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET source_updated_at=excluded.source_updated_at,projected_at=excluded.projected_at`).bind(userId, sourceUpdatedAt, now).run();
}
__name(syncLearningProjection, "syncLearningProjection");
async function forceProjectionFromState(db, userId) {
  const state2 = await db.prepare("SELECT payload,updated_at FROM learning_state WHERE user_id=?").bind(userId).first();
  if (!state2) return;
  await syncLearningProjection(db, userId, parse2(state2.payload, {}), state2.updated_at);
}
__name(forceProjectionFromState, "forceProjectionFromState");
async function wrongAnswerExists(db, userId, id) {
  let row = await db.prepare("SELECT id FROM wrong_answers WHERE user_id=? AND id=?").bind(userId, id).first();
  if (row) return true;
  await forceProjectionFromState(db, userId);
  row = await db.prepare("SELECT id FROM wrong_answers WHERE user_id=? AND id=?").bind(userId, id).first();
  return Boolean(row);
}
__name(wrongAnswerExists, "wrongAnswerExists");
async function drillExists(db, userId, id) {
  let row = await db.prepare("SELECT id FROM learning_drills WHERE user_id=? AND id=?").bind(userId, id).first();
  if (row) return true;
  await forceProjectionFromState(db, userId);
  row = await db.prepare("SELECT id FROM learning_drills WHERE user_id=? AND id=?").bind(userId, id).first();
  return Boolean(row);
}
__name(drillExists, "drillExists");
async function recordCoreRuleEvidence(db, userId, coreRuleId, sourceType, sourceId, relationType, occurredAt = nowIso()) {
  if (!relations.includes(relationType) || !sourceTypes.includes(sourceType)) throw new Error("INVALID_EVIDENCE");
  const createdAt = nowIso();
  await db.prepare(`INSERT INTO core_rule_evidence(
    id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at
  ) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?)
  ON CONFLICT(user_id,core_rule_id,source_type,source_id,relation_type)
  DO UPDATE SET occurred_at=CASE WHEN excluded.occurred_at>core_rule_evidence.occurred_at THEN excluded.occurred_at ELSE core_rule_evidence.occurred_at END`).bind(userId, coreRuleId, sourceType, sourceId, relationType, occurredAt, createdAt).run();
}
__name(recordCoreRuleEvidence, "recordCoreRuleEvidence");
async function deleteCoreRuleEvidenceForSource(db, userId, coreRuleId, sourceType, sourceId) {
  await db.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND core_rule_id=? AND source_type=? AND source_id=?").bind(userId, coreRuleId, sourceType, sourceId).run();
}
__name(deleteCoreRuleEvidenceForSource, "deleteCoreRuleEvidenceForSource");
async function rebuildLegacyEvidence(db, userId) {
  const now = nowIso();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),r.user_id,l.core_rule_id,'archive',l.archive_entry_id,COALESCE(l.relation_type,'derived'),l.created_at,?
    FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id WHERE r.user_id=?`).bind(now, userId).run();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),l.user_id,l.core_rule_id,'wrong_answer',l.wrong_answer_id,l.relation_type,l.created_at,?
    FROM core_rule_wrong_answer_links l
    JOIN wrong_answers w ON w.user_id=l.user_id AND w.id=l.wrong_answer_id
    WHERE l.user_id=?`).bind(now, userId).run();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),l.user_id,l.core_rule_id,'drill',l.drill_id,'applied',l.created_at,?
    FROM core_rule_drill_links l
    JOIN learning_drills d ON d.user_id=l.user_id AND d.id=l.drill_id
    WHERE l.user_id=?`).bind(now, userId).run();
  await db.prepare(`INSERT OR IGNORE INTO core_rule_evidence(id,user_id,core_rule_id,source_type,source_id,relation_type,occurred_at,created_at)
    SELECT lower(hex(randomblob(16))),r.user_id,r.target_id,'review',r.id,
      CASE WHEN r.result='success' THEN 'reinforced' WHEN r.result='fail' THEN 'failed' ELSE 'applied' END,
      COALESCE(r.reviewed_at,r.scheduled_at,r.created_at),?
    FROM learning_reviews r JOIN core_rules c ON c.id=r.target_id AND c.user_id=r.user_id
    WHERE r.user_id=? AND r.target_type='core_rule'`).bind(now, userId).run();
  await db.prepare(`INSERT INTO learning_graph_user_state(user_id,source_updated_at,projected_at,legacy_evidence_backfilled)
    VALUES(?,COALESCE((SELECT updated_at FROM learning_state WHERE user_id=?),''),?,1)
    ON CONFLICT(user_id) DO UPDATE SET legacy_evidence_backfilled=1`).bind(userId, userId, now).run();
}
__name(rebuildLegacyEvidence, "rebuildLegacyEvidence");
async function ensureLearningGraphReady(db, userId) {
  await ensureRelationColumn(db);
  const [state2, projection] = await Promise.all([
    db.prepare("SELECT payload,updated_at FROM learning_state WHERE user_id=?").bind(userId).first(),
    db.prepare("SELECT source_updated_at,legacy_evidence_backfilled FROM learning_graph_user_state WHERE user_id=?").bind(userId).first()
  ]);
  if (state2 && projection?.source_updated_at !== state2.updated_at) {
    await syncLearningProjection(db, userId, parse2(state2.payload, {}), state2.updated_at);
  } else if (state2 && !projection) {
    await syncLearningProjection(db, userId, parse2(state2.payload, {}), state2.updated_at);
  }
  const after = await db.prepare("SELECT legacy_evidence_backfilled FROM learning_graph_user_state WHERE user_id=?").bind(userId).first();
  if (!after?.legacy_evidence_backfilled) await rebuildLegacyEvidence(db, userId);
}
__name(ensureLearningGraphReady, "ensureLearningGraphReady");
var wrongAnswerDto = /* @__PURE__ */ __name((r) => ({
  id: String(r.id),
  date: String(r.date ?? ""),
  subject: String(r.subject ?? ""),
  source: String(r.source ?? ""),
  question: String(r.question ?? ""),
  wrongJudgment: String(r.wrong_judgment ?? ""),
  missedCue: String(r.missed_cue ?? ""),
  correction: String(r.correction ?? ""),
  transfer: String(r.transfer ?? ""),
  bottleneck: r.bottleneck ?? void 0,
  scoreId: r.score_id ?? void 0,
  capabilityGoalId: r.capability_goal_id ?? void 0,
  archiveEntryId: r.archive_entry_id ?? void 0,
  retries: parse2(r.retries_json, [])
}), "wrongAnswerDto");
var drillDto = /* @__PURE__ */ __name((r) => ({
  id: String(r.id),
  date: String(r.date ?? ""),
  subject: String(r.subject ?? ""),
  title: String(r.title ?? ""),
  action: String(r.action ?? ""),
  successCriterion: String(r.success_criterion ?? ""),
  minutes: Number(r.minutes ?? 0),
  capabilityGoalId: r.capability_goal_id ?? void 0,
  feedbackId: r.feedback_id ?? void 0,
  done: Boolean(r.done),
  reflection: String(r.reflection ?? "")
}), "drillDto");
async function getCoreRuleStats(db, userId, coreRuleId) {
  const now = Date.now(), cut7 = new Date(now - 7 * 864e5).toISOString(), cut30 = new Date(now - 30 * 864e5).toISOString();
  const row = await db.prepare(`SELECT
    COUNT(*) evidence_count,
    COUNT(DISTINCT CASE WHEN source_type='archive' THEN source_id END) archive_count,
    COUNT(DISTINCT CASE WHEN source_type='wrong_answer' THEN source_id END) wrong_answer_count,
    COUNT(DISTINCT CASE WHEN source_type='drill' THEN source_id END) drill_count,
    SUM(CASE WHEN relation_type='derived' THEN 1 ELSE 0 END) derived_count,
    SUM(CASE WHEN relation_type='applied' THEN 1 ELSE 0 END) applied_count,
    SUM(CASE WHEN relation_type='failed' THEN 1 ELSE 0 END) failed_count,
    SUM(CASE WHEN relation_type='reinforced' THEN 1 ELSE 0 END) reinforced_count,
    SUM(CASE WHEN relation_type='failed' AND occurred_at>=? THEN 1 ELSE 0 END) failures_7d,
    SUM(CASE WHEN relation_type='failed' AND occurred_at>=? THEN 1 ELSE 0 END) failures_30d,
    MAX(occurred_at) last_occurrence_at,
    MAX(CASE WHEN relation_type='failed' THEN occurred_at END) last_failure_at,
    COUNT(DISTINCT CASE WHEN source_type='review' THEN source_id END) review_count,
    COUNT(DISTINCT CASE WHEN source_type='review' AND relation_type='reinforced' THEN source_id END) review_success_count,
    COUNT(DISTINCT CASE WHEN source_type='review' AND relation_type='failed' THEN source_id END) review_failure_count
    FROM core_rule_evidence WHERE user_id=? AND core_rule_id=?`).bind(cut7, cut30, userId, coreRuleId).first();
  const reviewCount = Number(row?.review_count ?? 0), reviewSuccessCount = Number(row?.review_success_count ?? 0);
  return {
    evidenceCount: Number(row?.evidence_count ?? 0),
    archiveCount: Number(row?.archive_count ?? 0),
    wrongAnswerCount: Number(row?.wrong_answer_count ?? 0),
    drillCount: Number(row?.drill_count ?? 0),
    derivedCount: Number(row?.derived_count ?? 0),
    appliedCount: Number(row?.applied_count ?? 0),
    failedCount: Number(row?.failed_count ?? 0),
    reinforcedCount: Number(row?.reinforced_count ?? 0),
    failures7d: Number(row?.failures_7d ?? 0),
    failures30d: Number(row?.failures_30d ?? 0),
    lastOccurrenceAt: row?.last_occurrence_at ? String(row.last_occurrence_at) : null,
    lastFailureAt: row?.last_failure_at ? String(row.last_failure_at) : null,
    reviewCount,
    reviewSuccessCount,
    reviewFailureCount: Number(row?.review_failure_count ?? 0),
    masteryRate: reviewCount ? reviewSuccessCount / reviewCount : null
  };
}
__name(getCoreRuleStats, "getCoreRuleStats");
function calculateCoreRulePriority(stats, masteryStatus, now = /* @__PURE__ */ new Date()) {
  let recencyWeight = 0;
  if (stats.lastOccurrenceAt) {
    const age = (now.getTime() - Date.parse(stats.lastOccurrenceAt)) / 864e5;
    recencyWeight = age <= 1 ? 10 : age <= 7 ? 6 : age <= 30 ? 3 : 0;
  }
  const raw = stats.failures7d * 5 + stats.failures30d * 2 + stats.wrongAnswerCount + stats.reviewFailureCount * 2 + recencyWeight - stats.reviewSuccessCount * 0.5 - (masteryStatus === "automated" ? 5 : 0);
  const priorityScore = Math.max(0, Math.round(raw));
  const status = masteryStatus === "automated" && stats.failures30d === 0 && stats.reviewFailureCount === 0 && stats.reviewSuccessCount >= 2 ? "MASTERED" : priorityScore >= 15 ? "ACTIVE" : priorityScore >= 5 ? "WATCH" : "ARCHIVED";
  return { priorityScore, status };
}
__name(calculateCoreRulePriority, "calculateCoreRulePriority");
async function listActiveCoreRules(db, userId, subject, limit) {
  const rows2 = await db.prepare(`SELECT id,subject,title,content,tags_json,mastery_status
    FROM core_rules WHERE user_id=? ${subject ? "AND subject=?" : ""}`).bind(...subject ? [userId, subject] : [userId]).all();
  const enriched = await Promise.all(rows2.results.map(async (rule) => {
    const stats = await getCoreRuleStats(db, userId, String(rule.id));
    const priority = calculateCoreRulePriority(stats, String(rule.mastery_status ?? "input"));
    return {
      id: String(rule.id),
      title: String(rule.title ?? ""),
      subject: String(rule.subject ?? ""),
      content: String(rule.content ?? ""),
      tags: parse2(rule.tags_json, []),
      masteryStatus: String(rule.mastery_status ?? "input"),
      ...priority,
      stats
    };
  }));
  return enriched.sort((a, b) => b.priorityScore - a.priorityScore || String(a.id).localeCompare(String(b.id))).slice(0, limit);
}
__name(listActiveCoreRules, "listActiveCoreRules");

// src/archive.ts
var clean3 = /* @__PURE__ */ __name((v, n = 1200) => typeof v === "string" ? v.trim().slice(0, n) : "", "clean");
var subjects2 = ["korean", "math", "english"];
var institutions = ["KICE", "education_office", "EBS", "private", "textbook", "custom"];
var masteries = ["input", "understanding", "reproduction", "automated"];
var parseJson = /* @__PURE__ */ __name((v, fallback = []) => {
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}, "parseJson");
var entryOut = /* @__PURE__ */ __name((row) => ({ id: row.id, userId: row.user_id, subject: row.subject, year: row.year, month: row.month, institution: row.institution, institutionCustomName: row.institution_custom_name, examName: row.exam_name, sourceName: row.source_name, questionNumber: row.question_number, category: row.category, subcategory: row.subcategory, title: row.title, studiedAt: row.studied_at, masteryStatus: row.mastery_status, memo: row.memo, conditionSummary: row.condition_summary, firstThought: row.first_thought, representation: row.representation, solutionFlow: row.solution_flow, bottleneck: row.bottleneck, transfer: row.transfer, mainIdea: row.main_idea, structureSummary: row.structure_summary, keyExpression: row.key_expression, reviewEnabled: Boolean(row.review_enabled), createdAt: row.created_at, updatedAt: row.updated_at, wrongAnswerId: row.wrong_answer_id ?? null }), "entryOut");
var annotationOut = /* @__PURE__ */ __name((r) => ({ id: r.id, archiveEntryId: r.archive_entry_id, color: r.color, type: r.type, text: r.text, order: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at }), "annotationOut");
var ruleOut = /* @__PURE__ */ __name((r) => ({ id: r.id, subject: r.subject, title: r.title, content: r.content, tags: parseJson(r.tags_json), masteryStatus: r.mastery_status, usageCount: Number(r.usage_count ?? 0), wrongAnswerCount: Number(r.wrong_answer_count ?? 0), relationType: r.relation_type ?? void 0, createdAt: r.created_at, updatedAt: r.updated_at }), "ruleOut");
var idPattern = /^[-A-Za-z0-9._:]{1,80}$/;
var iso = /* @__PURE__ */ __name((v) => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)), "iso");
var requiredId = /* @__PURE__ */ __name((v) => {
  if (typeof v !== "string" || !idPattern.test(v)) throw new Error("INVALID_BACKUP");
  return v;
}, "requiredId");
var requiredText = /* @__PURE__ */ __name((v, max) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("INVALID_BACKUP");
  return v.trim();
}, "requiredText");
var optionalText = /* @__PURE__ */ __name((v, max) => {
  if (v === void 0 || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > max) throw new Error("INVALID_BACKUP");
  return v.trim() || null;
}, "optionalText");
var requiredDate = /* @__PURE__ */ __name((v) => {
  if (!iso(v)) throw new Error("INVALID_BACKUP");
  return v;
}, "requiredDate");
var optionalDate = /* @__PURE__ */ __name((v) => {
  if (v !== void 0 && v !== null && !iso(v)) throw new Error("INVALID_BACKUP");
}, "optionalDate");
function arrayOf(value, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error("INVALID_BACKUP");
  return value;
}
__name(arrayOf, "arrayOf");
async function batchInChunks(db, statements, size = 100) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}
__name(batchInChunks, "batchInChunks");
var encodeCursor = /* @__PURE__ */ __name((cursor) => btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "encodeCursor");
var decodeCursor = /* @__PURE__ */ __name((value) => {
  if (!value) return void 0;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(normalized));
    if (!parsed || typeof parsed.studiedAt !== "string" || typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string" || parsed.id.length > 100) throw new Error();
    return parsed;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}, "decodeCursor");
async function importId(db, table, id, userId, h, ownerSql = "user_id") {
  const row = await db.prepare(`SELECT ${ownerSql} owner FROM ${table} WHERE id=?`).bind(id).first();
  if (!row || Number(row.owner) === userId) return id;
  let candidate = `u${userId}_${id}`.slice(0, 80);
  for (let attempt = 0; attempt < 5; attempt++) {
    const hit = await db.prepare(`SELECT ${ownerSql} owner FROM ${table} WHERE id=?`).bind(candidate).first();
    if (!hit || Number(hit.owner) === userId) return candidate;
    candidate = `u${userId}_${h.randomHex(8)}`;
  }
  throw new Error("ID_COLLISION");
}
__name(importId, "importId");
function importedEntryValues(b) {
  const subject = requiredText(b.subject, 12), institution = requiredText(b.institution, 30), mastery = requiredText(b.masteryStatus, 30), year = Number(b.year), month = Number(b.month);
  if (!subjects2.includes(subject) || !institutions.includes(institution) || !masteries.includes(mastery) || !Number.isInteger(year) || year < 2e3 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("INVALID_BACKUP");
  return [subject, year, month, institution, optionalText(b.institutionCustomName, 120), optionalText(b.examName, 160) ?? "", optionalText(b.sourceName, 160) ?? "", optionalText(b.questionNumber, 40) ?? "", optionalText(b.category, 120) ?? "", optionalText(b.subcategory, 120) ?? "", requiredText(b.title, 240), requiredDate(b.studiedAt), mastery, optionalText(b.memo, 5e3) ?? "", optionalText(b.conditionSummary, 3e3), optionalText(b.firstThought, 3e3), optionalText(b.representation, 3e3), optionalText(b.solutionFlow, 5e3), optionalText(b.bottleneck, 3e3), optionalText(b.transfer, 3e3), optionalText(b.mainIdea, 3e3), optionalText(b.structureSummary, 3e3), optionalText(b.keyExpression, 3e3), b.reviewEnabled === true ? 1 : 0];
}
__name(importedEntryValues, "importedEntryValues");
async function archiveExport(db, userId) {
  const [entries, annotations, rules, links, reviews, wrong, settings, drillLinks, wrongRuleLinks, learningReviews] = await Promise.all([
    db.prepare("SELECT * FROM archive_entries WHERE user_id=? ORDER BY id").bind(userId).all(),
    db.prepare("SELECT a.* FROM archive_annotations a JOIN archive_entries e ON e.id=a.archive_entry_id WHERE e.user_id=? ORDER BY a.id").bind(userId).all(),
    db.prepare("SELECT r.*,COUNT(l.archive_entry_id) usage_count FROM core_rules r LEFT JOIN archive_entry_core_rules l ON l.core_rule_id=r.id WHERE r.user_id=? GROUP BY r.id ORDER BY r.id").bind(userId).all(),
    db.prepare("SELECT l.* FROM archive_entry_core_rules l JOIN archive_entries e ON e.id=l.archive_entry_id JOIN core_rules r ON r.id=l.core_rule_id WHERE e.user_id=? AND r.user_id=? ORDER BY l.archive_entry_id,l.core_rule_id").bind(userId, userId).all(),
    db.prepare("SELECT * FROM archive_reviews WHERE user_id=? ORDER BY id").bind(userId).all(),
    db.prepare("SELECT * FROM archive_wrong_answer_links WHERE user_id=? ORDER BY archive_entry_id").bind(userId).all(),
    db.prepare("SELECT intervals_json FROM archive_review_settings WHERE user_id=?").bind(userId).first(),
    db.prepare("SELECT * FROM core_rule_drill_links WHERE user_id=? ORDER BY core_rule_id,drill_id").bind(userId).all(),
    db.prepare("SELECT * FROM core_rule_wrong_answer_links WHERE user_id=? ORDER BY core_rule_id,wrong_answer_id").bind(userId).all(),
    db.prepare("SELECT * FROM learning_reviews WHERE user_id=? ORDER BY id").bind(userId).all()
  ]);
  return { entries: entries.results.map(entryOut), annotations: annotations.results.map(annotationOut), coreRules: rules.results.map(ruleOut), ruleLinks: links.results.map((r) => ({ archiveEntryId: r.archive_entry_id, coreRuleId: r.core_rule_id, relationType: r.relation_type ?? "derived", createdAt: r.created_at })), reviews: reviews.results.map((r) => ({ id: r.id, archiveEntryId: r.archive_entry_id, reviewedAt: r.reviewed_at, success: Boolean(r.success), coreRuleRevealed: Boolean(r.core_rule_revealed), nextDueAt: r.next_due_at, createdAt: r.created_at })), wrongAnswerLinks: wrong.results.map((r) => ({ archiveEntryId: r.archive_entry_id, wrongAnswerId: r.wrong_answer_id, createdAt: r.created_at })), coreRuleWrongAnswerLinks: wrongRuleLinks.results.map((r) => ({ coreRuleId: r.core_rule_id, wrongAnswerId: r.wrong_answer_id, relationType: r.relation_type ?? "failed", createdAt: r.created_at })), coreRuleDrillLinks: drillLinks.results.map((r) => ({ coreRuleId: r.core_rule_id, drillId: r.drill_id, createdAt: r.created_at })), learningReviews: learningReviews.results.map((r) => ({ id: r.id, targetType: r.target_type, targetId: r.target_id, reviewType: r.review_type, scheduledAt: r.scheduled_at, reviewedAt: r.reviewed_at, result: r.result, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at })), reviewSettings: { intervals: parseJson(settings?.intervals_json ?? "[3,7,14,30]") } };
}
__name(archiveExport, "archiveExport");
async function archiveImport(db, userId, raw, h) {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}, source = body.learningArchive && typeof body.learningArchive === "object" ? body.learningArchive : body;
  const entries = arrayOf(source.entries, 1e4), annotations = arrayOf(source.annotations, 5e4), rules = arrayOf(source.coreRules, 2e3), links = arrayOf(source.ruleLinks, 5e4), reviews = arrayOf(source.reviews, 5e4), wrongLinks = arrayOf(source.wrongAnswerLinks, 2e4), wrongRuleLinks = source.coreRuleWrongAnswerLinks === void 0 ? [] : arrayOf(source.coreRuleWrongAnswerLinks, 5e4), drillLinks = source.coreRuleDrillLinks === void 0 ? [] : arrayOf(source.coreRuleDrillLinks, 5e4), learningReviews = source.learningReviews === void 0 ? [] : arrayOf(source.learningReviews, 1e5);
  const settings = source.reviewSettings && typeof source.reviewSettings === "object" ? source.reviewSettings : {}, intervals = Array.isArray(settings.intervals) ? settings.intervals.map(Number) : [];
  if (intervals.length > 10 || intervals.some((v) => !Number.isInteger(v) || v < 1 || v > 365)) throw new Error("INVALID_BACKUP");
  for (const item of rules) {
    requiredId(item.id);
    const subject = requiredText(item.subject, 12), mastery = requiredText(item.masteryStatus, 30);
    requiredText(item.title, 240);
    requiredText(item.content, 5e3);
    if (!subjects2.includes(subject) || !masteries.includes(mastery) || !Array.isArray(item.tags) || item.tags.length > 30 || item.tags.some((v) => typeof v !== "string" || v.length > 80)) throw new Error("INVALID_BACKUP");
    optionalDate(item.createdAt);
    optionalDate(item.updatedAt);
  }
  for (const item of entries) {
    requiredId(item.id);
    importedEntryValues(item);
    optionalDate(item.createdAt);
    optionalDate(item.updatedAt);
  }
  for (const item of annotations) {
    requiredId(item.id);
    requiredId(item.archiveEntryId);
    requiredText(item.color, 40);
    requiredText(item.type, 80);
    requiredText(item.text, 3e3);
    const order = Number(item.order);
    if (!Number.isInteger(order) || order < -1e5 || order > 1e5) throw new Error("INVALID_BACKUP");
    optionalDate(item.createdAt);
    optionalDate(item.updatedAt);
  }
  for (const item of links) {
    requiredId(item.archiveEntryId);
    requiredId(item.coreRuleId);
    const relation = optionalText(item.relationType, 20) ?? "derived";
    if (!["derived", "applied", "failed", "reinforced"].includes(relation)) throw new Error("INVALID_BACKUP");
    optionalDate(item.createdAt);
  }
  for (const item of reviews) {
    requiredId(item.id);
    requiredId(item.archiveEntryId);
    requiredDate(item.reviewedAt);
    if (typeof item.success !== "boolean" || typeof item.coreRuleRevealed !== "boolean" || item.nextDueAt !== null && item.nextDueAt !== void 0 && !iso(item.nextDueAt)) throw new Error("INVALID_BACKUP");
    optionalDate(item.createdAt);
  }
  for (const item of wrongLinks) {
    requiredId(item.archiveEntryId);
    requiredId(item.wrongAnswerId);
    optionalDate(item.createdAt);
  }
  for (const item of wrongRuleLinks) {
    requiredId(item.coreRuleId);
    requiredId(item.wrongAnswerId);
    const relation = optionalText(item.relationType, 20) ?? "failed";
    if (!["derived", "applied", "failed", "reinforced"].includes(relation)) throw new Error("INVALID_BACKUP");
    optionalDate(item.createdAt);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString(), entryMap = /* @__PURE__ */ new Map(), ruleMap = /* @__PURE__ */ new Map(), warnings = [];
  const ruleStatements = [];
  for (const item of rules) {
    const original = requiredId(item.id), id = await importId(db, "core_rules", original, userId, h), subject = requiredText(item.subject, 12), mastery = requiredText(item.masteryStatus, 30), tags = item.tags;
    if (!subjects2.includes(subject) || !masteries.includes(mastery) || !Array.isArray(tags) || tags.length > 30 || tags.some((v) => typeof v !== "string" || v.length > 80)) throw new Error("INVALID_BACKUP");
    ruleMap.set(original, id);
    ruleStatements.push(db.prepare("INSERT INTO core_rules(id,user_id,subject,title,content,tags_json,mastery_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,title=excluded.title,content=excluded.content,tags_json=excluded.tags_json,mastery_status=excluded.mastery_status,updated_at=excluded.updated_at WHERE core_rules.user_id=excluded.user_id").bind(id, userId, subject, requiredText(item.title, 240), requiredText(item.content, 5e3), JSON.stringify(tags), mastery, iso(item.createdAt) ? item.createdAt : now, iso(item.updatedAt) ? item.updatedAt : now));
  }
  await batchInChunks(db, ruleStatements);
  const entryStatements = [];
  for (const item of entries) {
    const original = requiredId(item.id), id = await importId(db, "archive_entries", original, userId, h), values = importedEntryValues(item);
    entryMap.set(original, id);
    entryStatements.push(db.prepare("INSERT INTO archive_entries(id,user_id,subject,year,month,institution,institution_custom_name,exam_name,source_name,question_number,category,subcategory,title,studied_at,mastery_status,memo,condition_summary,first_thought,representation,solution_flow,bottleneck,transfer,main_idea,structure_summary,key_expression,review_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,year=excluded.year,month=excluded.month,institution=excluded.institution,institution_custom_name=excluded.institution_custom_name,exam_name=excluded.exam_name,source_name=excluded.source_name,question_number=excluded.question_number,category=excluded.category,subcategory=excluded.subcategory,title=excluded.title,studied_at=excluded.studied_at,mastery_status=excluded.mastery_status,memo=excluded.memo,condition_summary=excluded.condition_summary,first_thought=excluded.first_thought,representation=excluded.representation,solution_flow=excluded.solution_flow,bottleneck=excluded.bottleneck,transfer=excluded.transfer,main_idea=excluded.main_idea,structure_summary=excluded.structure_summary,key_expression=excluded.key_expression,review_enabled=excluded.review_enabled,updated_at=excluded.updated_at WHERE archive_entries.user_id=excluded.user_id").bind(id, userId, ...values, iso(item.createdAt) ? item.createdAt : now, iso(item.updatedAt) ? item.updatedAt : now));
  }
  await batchInChunks(db, entryStatements);
  const annotationStatements = [];
  for (const item of annotations) {
    const original = requiredId(item.id), parent = entryMap.get(requiredId(item.archiveEntryId));
    if (!parent) {
      warnings.push(`Annotation ${original}: parent entry \uC5C6\uC74C`);
      continue;
    }
    const id = await importId(db, "archive_annotations", original, userId, h, "(SELECT user_id FROM archive_entries WHERE id=archive_entry_id)"), order = Number(item.order);
    if (!Number.isInteger(order) || order < -1e5 || order > 1e5) throw new Error("INVALID_BACKUP");
    annotationStatements.push(db.prepare("INSERT INTO archive_annotations(id,archive_entry_id,color,type,text,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET archive_entry_id=excluded.archive_entry_id,color=excluded.color,type=excluded.type,text=excluded.text,sort_order=excluded.sort_order,updated_at=excluded.updated_at WHERE archive_annotations.archive_entry_id IN(SELECT id FROM archive_entries WHERE user_id=?)").bind(id, parent, requiredText(item.color, 40), requiredText(item.type, 80), requiredText(item.text, 3e3), order, iso(item.createdAt) ? item.createdAt : now, iso(item.updatedAt) ? item.updatedAt : now, userId));
  }
  await batchInChunks(db, annotationStatements);
  const seenLinks = /* @__PURE__ */ new Set(), linkStatements = [];
  for (const item of links) {
    const entry = entryMap.get(requiredId(item.archiveEntryId)), rule = ruleMap.get(requiredId(item.coreRuleId)), key2 = `${entry}:${rule}`;
    if (!entry || !rule) {
      warnings.push("Rule Link: parent entry/rule \uC5C6\uC74C");
      continue;
    }
    if (seenLinks.has(key2)) {
      warnings.push(`Rule Link ${key2}: \uC911\uBCF5 link`);
      continue;
    }
    seenLinks.add(key2);
    const relation = optionalText(item.relationType, 20) ?? "derived";
    linkStatements.push(db.prepare("INSERT INTO archive_entry_core_rules(archive_entry_id,core_rule_id,created_at,relation_type) VALUES(?,?,?,?) ON CONFLICT(archive_entry_id,core_rule_id) DO UPDATE SET relation_type=excluded.relation_type").bind(entry, rule, iso(item.createdAt) ? item.createdAt : now, relation));
  }
  await batchInChunks(db, linkStatements);
  const reviewStatements = [];
  for (const item of reviews) {
    const original = requiredId(item.id), entry = entryMap.get(requiredId(item.archiveEntryId));
    if (!entry) {
      warnings.push(`Review ${original}: parent entry \uC5C6\uC74C`);
      continue;
    }
    const id = await importId(db, "archive_reviews", original, userId, h);
    if (typeof item.success !== "boolean" || typeof item.coreRuleRevealed !== "boolean" || !iso(item.reviewedAt) || item.nextDueAt !== null && item.nextDueAt !== void 0 && !iso(item.nextDueAt)) throw new Error("INVALID_BACKUP");
    reviewStatements.push(db.prepare("INSERT INTO archive_reviews(id,user_id,archive_entry_id,reviewed_at,success,core_rule_revealed,next_due_at,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET archive_entry_id=excluded.archive_entry_id,reviewed_at=excluded.reviewed_at,success=excluded.success,core_rule_revealed=excluded.core_rule_revealed,next_due_at=excluded.next_due_at WHERE archive_reviews.user_id=excluded.user_id").bind(id, userId, entry, item.reviewedAt, item.success ? 1 : 0, item.coreRuleRevealed ? 1 : 0, item.nextDueAt ?? null, iso(item.createdAt) ? item.createdAt : now));
  }
  await batchInChunks(db, reviewStatements);
  await ensureLearningGraphReady(db, userId);
  const validWrongRows = await db.prepare("SELECT id FROM wrong_answers WHERE user_id=?").bind(userId).all(), validWrong = new Set(validWrongRows.results.map((v) => v.id));
  const seenWrong = /* @__PURE__ */ new Set(), wrongStatements = [];
  for (const item of wrongLinks) {
    const entry = entryMap.get(requiredId(item.archiveEntryId)), wrong = requiredId(item.wrongAnswerId);
    if (!entry) {
      warnings.push(`Wrong Answer Link ${wrong}: parent entry \uC5C6\uC74C`);
      continue;
    }
    if (!validWrong.has(wrong)) {
      warnings.push(`Wrong Answer Link ${wrong}: \uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 Wrong Answer Drill`);
      continue;
    }
    if (seenWrong.has(entry) || seenWrong.has(`wrong:${wrong}`)) {
      warnings.push(`Wrong Answer Link ${wrong}: \uC911\uBCF5 link`);
      continue;
    }
    seenWrong.add(entry);
    seenWrong.add(`wrong:${wrong}`);
    wrongStatements.push(db.prepare("INSERT INTO archive_wrong_answer_links(archive_entry_id,user_id,wrong_answer_id,created_at) VALUES(?,?,?,?) ON CONFLICT(archive_entry_id) DO UPDATE SET wrong_answer_id=excluded.wrong_answer_id,created_at=excluded.created_at WHERE archive_wrong_answer_links.user_id=excluded.user_id").bind(entry, userId, wrong, iso(item.createdAt) ? item.createdAt : now));
  }
  await batchInChunks(db, wrongStatements);
  const wrongRuleStatements = [];
  for (const item of wrongRuleLinks) {
    const rule = ruleMap.get(requiredId(item.coreRuleId)), wrong = requiredId(item.wrongAnswerId), relation = optionalText(item.relationType, 20) ?? "failed";
    if (!rule || !validWrong.has(wrong)) {
      warnings.push(`Core Rule \u2194 Wrong Answer ${wrong}: parent \uC5C6\uC74C`);
      continue;
    }
    wrongRuleStatements.push(db.prepare("INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at) VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type").bind(userId, rule, wrong, relation, iso(item.createdAt) ? item.createdAt : now));
  }
  await batchInChunks(db, wrongRuleStatements);
  const validDrillRows = await db.prepare("SELECT id FROM learning_drills WHERE user_id=?").bind(userId).all(), validDrills = new Set(validDrillRows.results.map((v) => v.id)), drillStatements = [];
  for (const item of drillLinks) {
    const rule = ruleMap.get(requiredId(item.coreRuleId)), drill = requiredId(item.drillId);
    if (!rule || !validDrills.has(drill)) {
      warnings.push(`Drill Link ${drill}: parent \uC5C6\uC74C`);
      continue;
    }
    drillStatements.push(db.prepare("INSERT OR IGNORE INTO core_rule_drill_links(user_id,core_rule_id,drill_id,created_at) VALUES(?,?,?,?)").bind(userId, rule, drill, iso(item.createdAt) ? item.createdAt : now));
  }
  await batchInChunks(db, drillStatements);
  const learningReviewStatements = [];
  for (const item of learningReviews) {
    const type = requiredText(item.targetType, 30), result = requiredText(item.result, 20), originalTarget = requiredId(item.targetId), target = type === "core_rule" ? ruleMap.get(originalTarget) : type === "learning_item" ? entryMap.get(originalTarget) : originalTarget;
    if (!target || !["wrong_answer", "core_rule", "drill", "learning_item"].includes(type) || !["pending", "success", "fail"].includes(result)) {
      warnings.push(`Learning Review ${String(item.id)}: target \uC5C6\uC74C`);
      continue;
    }
    learningReviewStatements.push(db.prepare("INSERT OR IGNORE INTO learning_reviews(id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(requiredId(item.id), userId, type, target, optionalText(item.reviewType, 40) ?? "retry", optionalText(item.scheduledAt, 40), optionalText(item.reviewedAt, 40), result, optionalText(item.notes, 3e3) ?? "", iso(item.createdAt) ? item.createdAt : now, iso(item.updatedAt) ? item.updatedAt : now));
  }
  await batchInChunks(db, learningReviewStatements);
  if (intervals.length) await db.batch([db.prepare("INSERT INTO archive_review_settings(user_id,intervals_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET intervals_json=excluded.intervals_json,updated_at=excluded.updated_at").bind(userId, JSON.stringify(intervals), now)]);
  await rebuildLegacyEvidence(db, userId);
  return { ok: true, warnings, imported: { coreRules: ruleStatements.length, entries: entryStatements.length, annotations: annotationStatements.length, ruleLinks: linkStatements.length, reviews: reviewStatements.length, wrongAnswerLinks: wrongStatements.length, coreRuleWrongAnswerLinks: wrongRuleStatements.length, coreRuleDrillLinks: drillStatements.length, learningReviews: learningReviewStatements.length }, skipped: warnings.length, failed: 0 };
}
__name(archiveImport, "archiveImport");
async function owner(db, id, userId) {
  return db.prepare("SELECT id FROM archive_entries WHERE id=? AND user_id=?").bind(id, userId).first();
}
__name(owner, "owner");
async function ensureIntelligence(db, userId) {
  await ensureLearningGraphReady(db, userId);
}
__name(ensureIntelligence, "ensureIntelligence");
function entryValues(body) {
  const subject = clean3(body.subject, 12), institution = clean3(body.institution, 30), mastery = clean3(body.masteryStatus, 30), year = Number(body.year), month = Number(body.month);
  if (!subjects2.includes(subject) || !institutions.includes(institution) || !masteries.includes(mastery) || !Number.isInteger(year) || year < 2e3 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12 || !clean3(body.title, 240) || !/^\d{4}-\d{2}-\d{2}/.test(clean3(body.studiedAt, 30))) throw new Error("INVALID_ENTRY");
  return [subject, year, month, institution, clean3(body.institutionCustomName, 120) || null, clean3(body.examName, 160), clean3(body.sourceName, 160), clean3(body.questionNumber, 40), clean3(body.category, 120), clean3(body.subcategory, 120), clean3(body.title, 240), clean3(body.studiedAt, 30), mastery, clean3(body.memo, 5e3), clean3(body.conditionSummary, 3e3) || null, clean3(body.firstThought, 3e3) || null, clean3(body.representation, 3e3) || null, clean3(body.solutionFlow, 5e3) || null, clean3(body.bottleneck, 3e3) || null, clean3(body.transfer, 3e3) || null, clean3(body.mainIdea, 3e3) || null, clean3(body.structureSummary, 3e3) || null, clean3(body.keyExpression, 3e3) || null, body.reviewEnabled === true ? 1 : 0];
}
__name(entryValues, "entryValues");
async function bundle(db, userId, where, bind, options = {}) {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100))), cursor = options.cursor, clauses = [where], cursorBind = [];
  if (cursor) {
    clauses.push("AND (e.studied_at<? OR (e.studied_at=? AND (e.updated_at<? OR (e.updated_at=? AND e.id<?))))");
    cursorBind.push(cursor.studiedAt, cursor.studiedAt, cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const result = await db.prepare(`SELECT e.*,w.wrong_answer_id FROM archive_entries e LEFT JOIN archive_wrong_answer_links w ON w.archive_entry_id=e.id WHERE e.user_id=? ${clauses.join(" ")} ORDER BY e.studied_at DESC,e.updated_at DESC,e.id DESC LIMIT ?`).bind(userId, ...bind, ...cursorBind, limit + 1).all();
  const hasMore = result.results.length > limit, rows2 = result.results.slice(0, limit), ids = rows2.map((r) => String(r.id));
  if (!ids.length) return { entries: [], nextCursor: null, hasMore: false };
  const marks = ids.map(() => "?").join(",");
  const [annotations, rules] = await Promise.all([
    db.prepare(`SELECT * FROM archive_annotations WHERE archive_entry_id IN (${marks}) ORDER BY sort_order,id`).bind(...ids).all(),
    db.prepare(`SELECT l.archive_entry_id,l.relation_type,r.* FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id WHERE l.archive_entry_id IN (${marks}) AND r.user_id=? ORDER BY r.title`).bind(...ids, userId).all()
  ]);
  const annotationsByEntry = /* @__PURE__ */ new Map(), rulesByEntry = /* @__PURE__ */ new Map();
  for (const item of annotations.results) {
    const key2 = String(item.archive_entry_id), group = annotationsByEntry.get(key2) || [];
    group.push(item);
    annotationsByEntry.set(key2, group);
  }
  for (const item of rules.results) {
    const key2 = String(item.archive_entry_id), group = rulesByEntry.get(key2) || [];
    group.push(item);
    rulesByEntry.set(key2, group);
  }
  const entries = rows2.map((row) => {
    const key2 = String(row.id);
    return { ...entryOut(row), annotations: (annotationsByEntry.get(key2) || []).map(annotationOut), coreRules: (rulesByEntry.get(key2) || []).map(ruleOut) };
  });
  const last = rows2.at(-1), nextCursor = hasMore && last ? encodeCursor({ studiedAt: String(last.studied_at), updatedAt: String(last.updated_at), id: String(last.id) }) : null;
  return { entries, nextCursor, hasMore };
}
__name(bundle, "bundle");
async function archive(request, env, user, origin, h) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (!path.startsWith("/api/archive")) return null;
  const out = /* @__PURE__ */ __name((v, s = 200) => h.json(v, s, origin), "out");
  if (!user) return out({ error: "Unauthorized" }, 401);
  try {
    await ensureIntelligence(env.DB, user.id);
    if (path === "/api/archive/export" && method === "GET") return out(await archiveExport(env.DB, user.id));
    if (path === "/api/archive/import" && method === "POST") return out(await archiveImport(env.DB, user.id, await h.boundedJson(request, MAX_SYNC_BODY), h));
    if (path === "/api/archive/entries" && method === "GET") {
      const clauses = [], bind = [];
      for (const [key2, column] of [["subject", "e.subject"], ["year", "e.year"], ["month", "e.month"], ["institution", "e.institution"], ["exam", "e.exam_name"], ["source", "e.source_name"], ["category", "e.category"], ["subcategory", "e.subcategory"], ["masteryStatus", "e.mastery_status"]]) {
        const value = url.searchParams.get(key2);
        if (value) {
          clauses.push(`${column}=?`);
          bind.push(value);
        }
      }
      const color = url.searchParams.get("color"), core = url.searchParams.get("coreRule"), q = url.searchParams.get("q");
      if (color) {
        clauses.push("EXISTS(SELECT 1 FROM archive_annotations a WHERE a.archive_entry_id=e.id AND a.color=?)");
        bind.push(color);
      }
      if (core === "true") clauses.push("EXISTS(SELECT 1 FROM archive_entry_core_rules l WHERE l.archive_entry_id=e.id)");
      if (core === "false") clauses.push("NOT EXISTS(SELECT 1 FROM archive_entry_core_rules l WHERE l.archive_entry_id=e.id)");
      if (q) {
        clauses.push("(e.title LIKE ? OR e.memo LIKE ? OR e.exam_name LIKE ? OR e.source_name LIKE ? OR EXISTS(SELECT 1 FROM archive_annotations a WHERE a.archive_entry_id=e.id AND a.text LIKE ?))");
        for (let i = 0; i < 5; i++) bind.push(`%${q.slice(0, 100)}%`);
      }
      const rawLimit = Number(url.searchParams.get("limit") || 100), limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 100)), cursor = decodeCursor(url.searchParams.get("cursor"));
      return out(await bundle(env.DB, user.id, clauses.length ? "AND " + clauses.join(" AND ") : "", bind, { limit, cursor }));
    }
    if (path === "/api/archive/entries" && method === "POST") {
      const body = await h.boundedJson(request), values = entryValues(body), id = h.randomHex(16), now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.prepare("INSERT INTO archive_entries(id,user_id,subject,year,month,institution,institution_custom_name,exam_name,source_name,question_number,category,subcategory,title,studied_at,mastery_status,memo,condition_summary,first_thought,representation,solution_flow,bottleneck,transfer,main_idea,structure_summary,key_expression,review_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, user.id, ...values, now, now).run();
      return out({ id }, 201);
    }
    const item = path.match(/^\/api\/archive\/entries\/([^/]+)$/);
    if (item) {
      const id = decodeURIComponent(item[1]);
      if (!await owner(env.DB, id, user.id)) return out({ error: "Not found" }, 404);
      if (method === "GET") return out(await bundle(env.DB, user.id, "AND e.id=?", [id]));
      if (method === "PATCH") {
        const body = await h.boundedJson(request), v = entryValues(body);
        await env.DB.prepare("UPDATE archive_entries SET subject=?,year=?,month=?,institution=?,institution_custom_name=?,exam_name=?,source_name=?,question_number=?,category=?,subcategory=?,title=?,studied_at=?,mastery_status=?,memo=?,condition_summary=?,first_thought=?,representation=?,solution_flow=?,bottleneck=?,transfer=?,main_idea=?,structure_summary=?,key_expression=?,review_enabled=?,updated_at=? WHERE id=? AND user_id=?").bind(...v, (/* @__PURE__ */ new Date()).toISOString(), id, user.id).run();
        return out({ ok: true });
      }
      if (method === "DELETE") {
        await env.DB.batch([env.DB.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='archive' AND source_id=?").bind(user.id, id), env.DB.prepare("DELETE FROM archive_entries WHERE id=? AND user_id=?").bind(id, user.id)]);
        return out({ ok: true });
      }
    }
    if (path === "/api/archive/annotations" && method === "POST") {
      const b = await h.boundedJson(request), entryId = clean3(b.archiveEntryId, 80);
      if (!await owner(env.DB, entryId, user.id)) return out({ error: "Not found" }, 404);
      const text4 = clean3(b.text, 3e3), color = clean3(b.color, 40), type = clean3(b.type, 80);
      if (!text4 || !color || !type) return out({ error: "color, type, text are required" }, 400);
      const id = h.randomHex(16), now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.prepare("INSERT INTO archive_annotations VALUES(?,?,?,?,?,?,?,?)").bind(id, entryId, color, type, text4, Number(b.order) || 0, now, now).run();
      return out({ id }, 201);
    }
    const annotation = path.match(/^\/api\/archive\/annotations\/([^/]+)$/);
    if (annotation) {
      const id = decodeURIComponent(annotation[1]), row = await env.DB.prepare("SELECT a.id FROM archive_annotations a JOIN archive_entries e ON e.id=a.archive_entry_id WHERE a.id=? AND e.user_id=?").bind(id, user.id).first();
      if (!row) return out({ error: "Not found" }, 404);
      if (method === "PATCH") {
        const b = await h.boundedJson(request);
        await env.DB.prepare("UPDATE archive_annotations SET color=?,type=?,text=?,sort_order=?,updated_at=? WHERE id=?").bind(clean3(b.color, 40), clean3(b.type, 80), clean3(b.text, 3e3), Number(b.order) || 0, (/* @__PURE__ */ new Date()).toISOString(), id).run();
        return out({ ok: true });
      }
      if (method === "DELETE") {
        await env.DB.prepare("DELETE FROM archive_annotations WHERE id=?").bind(id).run();
        return out({ ok: true });
      }
    }
    if (path === "/api/archive/rules" && method === "GET") {
      const rows2 = await env.DB.prepare("SELECT r.*,COUNT(DISTINCT l.archive_entry_id) usage_count,(SELECT COUNT(*) FROM core_rule_wrong_answer_links w WHERE w.core_rule_id=r.id AND w.user_id=r.user_id) wrong_answer_count FROM core_rules r LEFT JOIN archive_entry_core_rules l ON l.core_rule_id=r.id WHERE r.user_id=? GROUP BY r.id ORDER BY r.updated_at DESC").bind(user.id).all();
      return out({ rules: rows2.results.map(ruleOut) });
    }
    if (path === "/api/archive/rules" && method === "POST") {
      const b = await h.boundedJson(request), subject = clean3(b.subject, 12), mastery = clean3(b.masteryStatus, 30);
      if (!subjects2.includes(subject) || !masteries.includes(mastery) || !clean3(b.title, 240) || !clean3(b.content, 5e3)) return out({ error: "Invalid rule" }, 400);
      const id = h.randomHex(16), now = (/* @__PURE__ */ new Date()).toISOString(), tags = Array.isArray(b.tags) ? b.tags.filter((v) => typeof v === "string").slice(0, 30) : [];
      await env.DB.prepare("INSERT INTO core_rules VALUES(?,?,?,?,?,?,?,?,?)").bind(id, user.id, subject, clean3(b.title, 240), clean3(b.content, 5e3), JSON.stringify(tags), mastery, now, now).run();
      return out({ id }, 201);
    }
    const rule = path.match(/^\/api\/archive\/rules\/([^/]+)$/);
    if (rule) {
      const id = decodeURIComponent(rule[1]), existing = await env.DB.prepare("SELECT id FROM core_rules WHERE id=? AND user_id=?").bind(id, user.id).first();
      if (!existing) return out({ error: "Not found" }, 404);
      if (method === "PATCH") {
        const b = await h.boundedJson(request), subject = clean3(b.subject, 12), mastery = clean3(b.masteryStatus, 30), tags = Array.isArray(b.tags) ? b.tags.filter((v) => typeof v === "string").slice(0, 30) : [];
        if (!subjects2.includes(subject) || !masteries.includes(mastery)) return out({ error: "Invalid rule" }, 400);
        await env.DB.prepare("UPDATE core_rules SET subject=?,title=?,content=?,tags_json=?,mastery_status=?,updated_at=? WHERE id=? AND user_id=?").bind(subject, clean3(b.title, 240), clean3(b.content, 5e3), JSON.stringify(tags), mastery, (/* @__PURE__ */ new Date()).toISOString(), id, user.id).run();
        return out({ ok: true });
      }
      if (method === "DELETE") {
        await env.DB.prepare("DELETE FROM core_rules WHERE id=? AND user_id=?").bind(id, user.id).run();
        return out({ ok: true });
      }
    }
    if (path === "/api/archive/rule-links" && method === "POST") {
      const b = await h.boundedJson(request), entryId = clean3(b.archiveEntryId, 80), ruleId = clean3(b.coreRuleId, 80), relation = clean3(b.relationType, 20) || "derived";
      if (!["derived", "applied", "failed", "reinforced"].includes(relation)) return out({ error: "Invalid relation type" }, 400);
      const [e, r] = await Promise.all([owner(env.DB, entryId, user.id), env.DB.prepare("SELECT id FROM core_rules WHERE id=? AND user_id=?").bind(ruleId, user.id).first()]);
      if (!e || !r) return out({ error: "Not found" }, 404);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.prepare("INSERT INTO archive_entry_core_rules(archive_entry_id,core_rule_id,created_at,relation_type) VALUES(?,?,?,?) ON CONFLICT(archive_entry_id,core_rule_id) DO UPDATE SET relation_type=excluded.relation_type").bind(entryId, ruleId, now, relation).run();
      await recordCoreRuleEvidence(env.DB, user.id, ruleId, "archive", entryId, relation, now);
      const wrong = await env.DB.prepare("SELECT wrong_answer_id FROM archive_wrong_answer_links WHERE archive_entry_id=? AND user_id=?").bind(entryId, user.id).first();
      if (wrong?.wrong_answer_id) await env.DB.prepare("INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at) VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type").bind(user.id, ruleId, wrong.wrong_answer_id, relation, now).run();
      return out({ ok: true }, 201);
    }
    const link = path.match(/^\/api\/archive\/entries\/([^/]+)\/rules\/([^/]+)$/);
    if (link && method === "DELETE") {
      const entryId = decodeURIComponent(link[1]), ruleId = decodeURIComponent(link[2]);
      if (!await owner(env.DB, entryId, user.id)) return out({ error: "Not found" }, 404);
      await env.DB.prepare("DELETE FROM archive_entry_core_rules WHERE archive_entry_id=? AND core_rule_id=? AND core_rule_id IN(SELECT id FROM core_rules WHERE user_id=?)").bind(entryId, ruleId, user.id).run();
      return out({ ok: true });
    }
    if (path === "/api/archive/review" && method === "GET") {
      const intervals = (await env.DB.prepare("SELECT intervals_json FROM archive_review_settings WHERE user_id=?").bind(user.id).first())?.intervals_json ?? "[3,7,14,30]";
      const rawLimit = Number(url.searchParams.get("limit") || 100), limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 100)), cursor = decodeCursor(url.searchParams.get("cursor"));
      const data = await bundle(env.DB, user.id, "AND (e.review_enabled=1 OR EXISTS(SELECT 1 FROM archive_entry_core_rules l WHERE l.archive_entry_id=e.id))", [], { limit, cursor });
      const latest = await env.DB.prepare("SELECT r.archive_entry_id entry_id,r.next_due_at FROM archive_reviews r JOIN (SELECT archive_entry_id,MAX(reviewed_at) reviewed_at FROM archive_reviews WHERE user_id=? GROUP BY archive_entry_id) x ON x.archive_entry_id=r.archive_entry_id AND x.reviewed_at=r.reviewed_at WHERE r.user_id=?").bind(user.id, user.id).all();
      const schedule = parseJson(intervals), today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      return out({ ...data, entries: data.entries.map((entry) => {
        const due = latest.results.find((v) => v.entry_id === entry.id)?.next_due_at?.slice(0, 10) ?? new Date((/* @__PURE__ */ new Date(`${entry.studiedAt.slice(0, 10)}T00:00:00Z`)).getTime() + Number(schedule[0] ?? 3) * 864e5).toISOString().slice(0, 10);
        return { ...entry, nextReviewAt: due, reviewBucket: due < today ? "overdue" : due === today ? "today" : "upcoming" };
      }), intervals: schedule });
    }
    if (path === "/api/archive/review/settings" && method === "PUT") {
      const b = await h.boundedJson(request), intervals = Array.isArray(b.intervals) ? b.intervals.map(Number).filter((v) => Number.isInteger(v) && v > 0 && v <= 365).slice(0, 10) : [];
      if (!intervals.length) return out({ error: "Invalid intervals" }, 400);
      await env.DB.prepare("INSERT INTO archive_review_settings VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET intervals_json=excluded.intervals_json,updated_at=excluded.updated_at").bind(user.id, JSON.stringify(intervals), (/* @__PURE__ */ new Date()).toISOString()).run();
      return out({ ok: true });
    }
    if (path === "/api/archive/reviews" && method === "POST") {
      const b = await h.boundedJson(request), entryId = clean3(b.archiveEntryId, 80);
      if (!await owner(env.DB, entryId, user.id)) return out({ error: "Not found" }, 404);
      const now = /* @__PURE__ */ new Date(), days = Math.max(1, Math.min(365, Number(b.nextIntervalDays) || 3)), next = new Date(now.getTime() + days * 864e5).toISOString();
      await env.DB.prepare("INSERT INTO archive_reviews VALUES(?,?,?,?,?,?,?,?)").bind(h.randomHex(16), user.id, entryId, now.toISOString(), b.success === true ? 1 : 0, b.coreRuleRevealed === true ? 1 : 0, next, now.toISOString()).run();
      return out({ ok: true, nextDueAt: next }, 201);
    }
    if (path === "/api/archive/wrong-answer-links" && method === "POST") {
      const b = await h.boundedJson(request), entryId = clean3(b.archiveEntryId, 80), wrong = clean3(b.wrongAnswerId, 100);
      if (!wrong || !await owner(env.DB, entryId, user.id) || !await wrongAnswerExists(env.DB, user.id, wrong)) return out({ error: "Not found", code: "NOT_FOUND", message: "\uC5F0\uACB0 \uB300\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.prepare("INSERT INTO archive_wrong_answer_links VALUES(?,?,?,?) ON CONFLICT(archive_entry_id) DO UPDATE SET wrong_answer_id=excluded.wrong_answer_id").bind(entryId, user.id, wrong, now).run();
      await env.DB.prepare("INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at) SELECT ?,l.core_rule_id,?,COALESCE(l.relation_type,'failed'),? FROM archive_entry_core_rules l JOIN core_rules r ON r.id=l.core_rule_id WHERE l.archive_entry_id=? AND r.user_id=? ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type").bind(user.id, wrong, now, entryId, user.id).run();
      const linkedRules = await env.DB.prepare("SELECT core_rule_id,COALESCE(relation_type,'failed') relation_type FROM archive_entry_core_rules WHERE archive_entry_id=?").bind(entryId).all();
      for (const linked of linkedRules.results) await recordCoreRuleEvidence(env.DB, user.id, linked.core_rule_id, "wrong_answer", wrong, linked.relation_type, now);
      return out({ ok: true }, 201);
    }
    const wrongLink = path.match(/^\/api\/archive\/entries\/([^/]+)\/wrong-answer$/);
    if (wrongLink && method === "DELETE") {
      const entryId = decodeURIComponent(wrongLink[1]);
      if (!await owner(env.DB, entryId, user.id)) return out({ error: "Not found" }, 404);
      await env.DB.prepare("DELETE FROM archive_wrong_answer_links WHERE archive_entry_id=? AND user_id=?").bind(entryId, user.id).run();
      return out({ ok: true });
    }
    return out({ error: "Not found" }, 404);
  } catch (cause) {
    if (cause instanceof Error && cause.message === "INVALID_ENTRY") return out({ error: "Invalid archive entry" }, 400);
    if (cause instanceof Error && cause.message === "INVALID_BACKUP") return out({ error: "Invalid Learning Archive backup", code: "INVALID_BACKUP", message: "Learning Archive backup \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 400);
    if (cause instanceof Error && cause.message === "INVALID_CURSOR") return out({ error: "Invalid cursor", code: "INVALID_CURSOR", message: "Archive cursor\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 400);
    throw cause;
  }
}
__name(archive, "archive");

// src/learning-intelligence.ts
var clean4 = /* @__PURE__ */ __name((v, n = 1e3) => typeof v === "string" ? v.trim().slice(0, n) : "", "clean");
var parse3 = /* @__PURE__ */ __name((v, f) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : f;
  } catch {
    return f;
  }
}, "parse");
var relations2 = ["derived", "applied", "failed", "reinforced"];
var error = /* @__PURE__ */ __name((out, code, message, status) => out({ error: message, code, message }, status), "error");
async function entryOwner(db, id, userId) {
  return db.prepare("SELECT id FROM archive_entries WHERE id=? AND user_id=?").bind(id, userId).first();
}
__name(entryOwner, "entryOwner");
async function ruleOwner(db, id, userId) {
  return db.prepare("SELECT id FROM core_rules WHERE id=? AND user_id=?").bind(id, userId).first();
}
__name(ruleOwner, "ruleOwner");
async function targetOwned(db, userId, type, id) {
  if (type === "learning_item") return Boolean(await entryOwner(db, id, userId));
  if (type === "core_rule") return Boolean(await ruleOwner(db, id, userId));
  if (type === "wrong_answer") return wrongAnswerExists(db, userId, id);
  if (type === "drill") return drillExists(db, userId, id);
  return false;
}
__name(targetOwned, "targetOwned");
var coreRuleDto = /* @__PURE__ */ __name((r) => ({
  id: String(r.id),
  subject: r.subject,
  title: r.title,
  content: r.content,
  tags: parse3(r.tags_json, []),
  masteryStatus: r.mastery_status,
  usageCount: Number(r.usage_count ?? 0),
  relationType: r.relation_type ?? void 0
}), "coreRuleDto");
var reviewRelation = /* @__PURE__ */ __name((result) => result === "success" ? "reinforced" : result === "fail" ? "failed" : "applied", "reviewRelation");
var studyDayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
var studyDayKey = /* @__PURE__ */ __name((value = /* @__PURE__ */ new Date()) => studyDayFormatter.format(new Date(new Date(value).getTime() - 6 * 60 * 60 * 1e3)), "studyDayKey");
var inSql = /* @__PURE__ */ __name((ids) => ids.map(() => "?").join(","), "inSql");
async function resolveReviewQueueMetadata(db, userId, reviews) {
  const ids = /* @__PURE__ */ __name((type) => [...new Set(reviews.filter((review) => review.target_type === type).map((review) => review.target_id))], "ids");
  const ruleIds = ids("core_rule"), wrongIds = ids("wrong_answer"), drillIds = ids("drill"), itemIds = ids("learning_item");
  const now = /* @__PURE__ */ new Date(), cut7 = new Date(now.getTime() - 7 * 864e5).toISOString(), cut30 = new Date(now.getTime() - 30 * 864e5).toISOString();
  const [rules, wrong, drills, items] = await Promise.all([
    ruleIds.length ? db.prepare(`SELECT r.id,r.subject,r.title,r.content,r.mastery_status,COUNT(e.id) evidence_count,SUM(CASE WHEN e.source_type='archive' THEN 1 ELSE 0 END) archive_count,SUM(CASE WHEN e.source_type='wrong_answer' THEN 1 ELSE 0 END) wrong_answer_count,SUM(CASE WHEN e.source_type='drill' THEN 1 ELSE 0 END) drill_count,SUM(CASE WHEN e.relation_type='derived' THEN 1 ELSE 0 END) derived_count,SUM(CASE WHEN e.relation_type='applied' THEN 1 ELSE 0 END) applied_count,SUM(CASE WHEN e.relation_type='failed' THEN 1 ELSE 0 END) failed_count,SUM(CASE WHEN e.relation_type='reinforced' THEN 1 ELSE 0 END) reinforced_count,SUM(CASE WHEN e.relation_type='failed' AND e.occurred_at>=? THEN 1 ELSE 0 END) failures_7d,SUM(CASE WHEN e.relation_type='failed' AND e.occurred_at>=? THEN 1 ELSE 0 END) failures_30d,MAX(e.occurred_at) last_occurrence_at,MAX(CASE WHEN e.relation_type='failed' THEN e.occurred_at END) last_failure_at,COUNT(DISTINCT CASE WHEN e.source_type='review' THEN e.source_id END) review_count,COUNT(DISTINCT CASE WHEN e.source_type='review' AND e.relation_type='reinforced' THEN e.source_id END) review_success_count,COUNT(DISTINCT CASE WHEN e.source_type='review' AND e.relation_type='failed' THEN e.source_id END) review_failure_count FROM core_rules r LEFT JOIN core_rule_evidence e ON e.user_id=r.user_id AND e.core_rule_id=r.id WHERE r.user_id=? AND r.id IN (${inSql(ruleIds)}) GROUP BY r.id`).bind(cut7, cut30, userId, ...ruleIds).all() : Promise.resolve({ results: [] }),
    wrongIds.length ? db.prepare(`SELECT id,subject,source,question,wrong_judgment,missed_cue,correction,transfer,bottleneck FROM wrong_answers WHERE user_id=? AND id IN (${inSql(wrongIds)})`).bind(userId, ...wrongIds).all() : Promise.resolve({ results: [] }),
    drillIds.length ? db.prepare(`SELECT id,subject,title,action,success_criterion FROM learning_drills WHERE user_id=? AND id IN (${inSql(drillIds)})`).bind(userId, ...drillIds).all() : Promise.resolve({ results: [] }),
    itemIds.length ? db.prepare(`SELECT id,subject,title,question_number,memo,solution_flow,bottleneck FROM archive_entries WHERE user_id=? AND id IN (${inSql(itemIds)})`).bind(userId, ...itemIds).all() : Promise.resolve({ results: [] })
  ]);
  const output = /* @__PURE__ */ new Map();
  for (const row of rules.results) {
    const stats = { evidenceCount: Number(row.evidence_count ?? 0), archiveCount: Number(row.archive_count ?? 0), wrongAnswerCount: Number(row.wrong_answer_count ?? 0), drillCount: Number(row.drill_count ?? 0), derivedCount: Number(row.derived_count ?? 0), appliedCount: Number(row.applied_count ?? 0), failedCount: Number(row.failed_count ?? 0), reinforcedCount: Number(row.reinforced_count ?? 0), failures7d: Number(row.failures_7d ?? 0), failures30d: Number(row.failures_30d ?? 0), lastOccurrenceAt: row.last_occurrence_at ? String(row.last_occurrence_at) : null, lastFailureAt: row.last_failure_at ? String(row.last_failure_at) : null, reviewCount: Number(row.review_count ?? 0), reviewSuccessCount: Number(row.review_success_count ?? 0), reviewFailureCount: Number(row.review_failure_count ?? 0), masteryRate: Number(row.review_count ?? 0) ? Number(row.review_success_count ?? 0) / Number(row.review_count ?? 0) : null };
    output.set(`core_rule:${row.id}`, { subject: String(row.subject), title: String(row.title), reason: String(row.content), priority: calculateCoreRulePriority(stats, String(row.mastery_status ?? "input")).priorityScore, detail: { content: row.content, stats } });
  }
  for (const row of wrong.results) output.set(`wrong_answer:${row.id}`, { subject: String(row.subject), title: String(row.question || row.source || "Wrong Answer"), reason: String(row.correction || row.wrong_judgment || ""), priority: 0, detail: { source: row.source, question: row.question, wrongJudgment: row.wrong_judgment, missedCue: row.missed_cue, correction: row.correction } });
  for (const row of drills.results) output.set(`drill:${row.id}`, { subject: String(row.subject), title: String(row.title || "Drill"), reason: String(row.action || ""), priority: 0, detail: { action: row.action, successCriterion: row.success_criterion } });
  for (const row of items.results) output.set(`learning_item:${row.id}`, { subject: String(row.subject), title: String(row.title || "Learning Archive"), reason: String(row.bottleneck || row.memo || ""), priority: 0, detail: { questionNumber: row.question_number, memo: row.memo, solutionFlow: row.solution_flow, bottleneck: row.bottleneck } });
  return output;
}
__name(resolveReviewQueueMetadata, "resolveReviewQueueMetadata");
async function ruleIdsForTarget(db, userId, type, id) {
  if (type === "core_rule") return [id];
  if (type === "wrong_answer") {
    const rows2 = await db.prepare("SELECT core_rule_id FROM core_rule_wrong_answer_links WHERE user_id=? AND wrong_answer_id=?").bind(userId, id).all();
    return rows2.results.map((row) => row.core_rule_id);
  }
  if (type === "drill") {
    const rows2 = await db.prepare("SELECT core_rule_id FROM core_rule_drill_links WHERE user_id=? AND drill_id=?").bind(userId, id).all();
    return rows2.results.map((row) => row.core_rule_id);
  }
  if (type === "learning_item") {
    const rows2 = await db.prepare(`SELECT l.core_rule_id FROM archive_entry_core_rules l
      JOIN core_rules r ON r.id=l.core_rule_id WHERE l.archive_entry_id=? AND r.user_id=?`).bind(id, userId).all();
    return rows2.results.map((row) => row.core_rule_id);
  }
  return [];
}
__name(ruleIdsForTarget, "ruleIdsForTarget");
async function recordReviewEvidence(db, userId, reviewId, targetType, targetId, result, occurredAt) {
  const ids = await ruleIdsForTarget(db, userId, targetType, targetId), relation = reviewRelation(result);
  for (const ruleId of ids) await recordCoreRuleEvidence(db, userId, ruleId, "review", reviewId, relation, occurredAt);
}
__name(recordReviewEvidence, "recordReviewEvidence");
async function learningIntelligence(request, env, user, origin, h) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith("/api/learning-intelligence") && !path.match(/^\/api\/core-rules\/[^/]+\/intelligence$/)) return null;
  const out = /* @__PURE__ */ __name((v, s = 200) => h.json(v, s, origin), "out");
  if (!user) return error(out, "UNAUTHORIZED", "Unauthorized", 401);
  await ensureLearningGraphReady(env.DB, user.id);
  if (path === "/api/learning-intelligence/quick-capture" && request.method === "POST") {
    const body = await h.boundedJson(request), requestId = clean4(body.requestId, 100), subject = clean4(body.subject, 20), wrong2 = body.wrongAnswer && typeof body.wrongAnswer === "object" ? body.wrongAnswer : {};
    if (!requestId || !["\uAD6D\uC5B4", "\uC218\uD559", "\uC601\uC5B4", "\uD0D0\uAD6C"].includes(subject) || !clean4(wrong2.source, 240) || !clean4(wrong2.question, 240) || !clean4(wrong2.wrongJudgment, 5e3) || !clean4(wrong2.missedCue, 5e3) || !clean4(wrong2.correction, 5e3)) return error(out, "INVALID_QUICK_CAPTURE", "\uBE60\uB978 \uC624\uB2F5 \uAE30\uB85D\uC758 \uD544\uC218 \uD56D\uBAA9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 400);
    const now = (/* @__PURE__ */ new Date()).toISOString(), existing = await env.DB.prepare("SELECT status,result_json FROM quick_capture_requests WHERE user_id=? AND request_id=?").bind(user.id, requestId).first();
    let result = parse3(existing?.result_json, null);
    if (existing?.status === "completed" && result) return out({ ...result, recovered: true });
    if (!result) {
      const coreRuleId = clean4(body.coreRuleId, 100) || null;
      if (coreRuleId && !await ruleOwner(env.DB, coreRuleId, user.id)) return error(out, "INVALID_CORE_RULE", "Core Rule\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
      const id = h.randomHex(16), date = clean4(wrong2.date, 20) || studyDayKey();
      result = { ok: true, requestId, wrongAnswerId: id, coreRuleId, data: null, wrongAnswer: { id, date, subject, source: clean4(wrong2.source, 240), question: clean4(wrong2.question, 240), wrongJudgment: clean4(wrong2.wrongJudgment, 5e3), missedCue: clean4(wrong2.missedCue, 5e3), correction: clean4(wrong2.correction, 5e3), transfer: clean4(wrong2.nextAction, 5e3), bottleneck: clean4(wrong2.bottleneck, 120), retries: [3, 7, 14].map((days) => {
        const d = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return { id: `${days}d`, label: `${days}\uC77C \uD6C4 \uC7AC\uB3C4\uC804`, dueDate: d.toISOString().slice(0, 10) };
      }) } };
      await env.DB.prepare("INSERT INTO quick_capture_requests(user_id,request_id,status,result_json,created_at,updated_at) VALUES(?,?, 'processing',?,?,?)").bind(user.id, requestId, JSON.stringify(result), now, now).run();
    }
    const state2 = await env.DB.prepare("SELECT payload FROM learning_state WHERE user_id=?").bind(user.id).first();
    if (!state2) return error(out, "STATE_REQUIRED", "\uD559\uC2B5 \uB370\uC774\uD130\uB97C \uBA3C\uC800 \uB3D9\uAE30\uD654\uD574 \uC8FC\uC138\uC694.", 409);
    const app = parse3(state2.payload, {}), rows2 = Array.isArray(app.wrongAnswerDrills) ? app.wrongAnswerDrills : [], record2 = result.wrongAnswer;
    if (!rows2.some((item2) => item2.id === record2.id)) {
      app.wrongAnswerDrills = [record2, ...rows2];
      await env.DB.prepare("INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)").bind(user.id, state2.payload, now).run();
      await env.DB.prepare("UPDATE learning_state SET payload=?,updated_at=? WHERE user_id=?").bind(JSON.stringify(app), now, user.id).run();
      await syncLearningProjection(env.DB, user.id, app, now);
    }
    if (result.coreRuleId) {
      await env.DB.prepare("INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at) VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO NOTHING").bind(user.id, result.coreRuleId, record2.id, "failed", now).run();
      await recordCoreRuleEvidence(env.DB, user.id, String(result.coreRuleId), "wrong_answer", String(record2.id), "failed", now);
    }
    result.data = app;
    await env.DB.prepare("UPDATE quick_capture_requests SET status='completed',result_json=?,updated_at=? WHERE user_id=? AND request_id=?").bind(JSON.stringify(result), now, user.id, requestId).run();
    return out(result, existing ? 200 : 201);
  }
  if (path === "/api/learning-intelligence" && request.method === "GET") {
    const [items, rules, wrong2, drills, reviews] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) count FROM archive_entries WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT COUNT(*) count FROM core_rules WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT COUNT(*) count FROM wrong_answers WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT COUNT(*) count FROM learning_drills WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT COUNT(*) count,SUM(result='success') successes,SUM(result='fail') failures FROM learning_reviews WHERE user_id=?").bind(user.id).first()
    ]);
    return out({
      items: Number(items?.count || 0),
      coreRules: Number(rules?.count || 0),
      wrongAnswers: Number(wrong2?.count || 0),
      drills: Number(drills?.count || 0),
      reviews: { count: Number(reviews?.count || 0), successes: Number(reviews?.successes || 0), failures: Number(reviews?.failures || 0) }
    });
  }
  if (path === "/api/learning-intelligence/active-rules" && request.method === "GET") {
    const subject = clean4(url.searchParams.get("subject"), 20) || void 0;
    if (subject && !["korean", "math", "english"].includes(subject)) return error(out, "INVALID_SUBJECT", "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uACFC\uBAA9\uC785\uB2C8\uB2E4.", 400);
    const raw = Number(url.searchParams.get("limit") || 10), limit = Math.max(1, Math.min(30, Number.isFinite(raw) ? Math.floor(raw) : 10));
    return out({ rules: await listActiveCoreRules(env.DB, user.id, subject, limit) });
  }
  const item = path.match(/^\/api\/learning-intelligence\/items\/([^/]+)$/);
  if (item && request.method === "GET") {
    const id = decodeURIComponent(item[1]);
    if (!await entryOwner(env.DB, id, user.id)) return error(out, "NOT_FOUND", "Learning Archive Entry\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    const [archive2, annotations, rules, reviews, wrongAnswers, drills] = await Promise.all([
      env.DB.prepare("SELECT * FROM archive_entries WHERE id=? AND user_id=?").bind(id, user.id).first(),
      env.DB.prepare("SELECT * FROM archive_annotations WHERE archive_entry_id=? ORDER BY sort_order").bind(id).all(),
      env.DB.prepare(`SELECT r.*,l.relation_type FROM core_rules r JOIN archive_entry_core_rules l ON l.core_rule_id=r.id
        WHERE l.archive_entry_id=? AND r.user_id=?`).bind(id, user.id).all(),
      env.DB.prepare(`SELECT * FROM learning_reviews WHERE user_id=? AND (
        (target_type='learning_item' AND target_id=?) OR
        (target_type='core_rule' AND target_id IN(SELECT core_rule_id FROM archive_entry_core_rules WHERE archive_entry_id=?))
      ) ORDER BY COALESCE(reviewed_at,scheduled_at,created_at) DESC`).bind(user.id, id, id).all(),
      env.DB.prepare(`SELECT w.* FROM wrong_answers w JOIN archive_wrong_answer_links l
        ON l.user_id=w.user_id AND l.wrong_answer_id=w.id WHERE l.archive_entry_id=? AND w.user_id=?`).bind(id, user.id).all(),
      env.DB.prepare(`SELECT d.* FROM learning_drills d JOIN core_rule_drill_links l
        ON l.user_id=d.user_id AND l.drill_id=d.id JOIN archive_entry_core_rules a ON a.core_rule_id=l.core_rule_id
        WHERE a.archive_entry_id=? AND d.user_id=? GROUP BY d.id`).bind(id, user.id).all()
    ]);
    return out({
      item: archive2,
      archive: { ...archive2, annotations: annotations.results },
      coreRules: rules.results,
      wrongAnswers: wrongAnswers.results.map(wrongAnswerDto),
      drills: drills.results.map(drillDto),
      reviews: reviews.results
    });
  }
  const wrong = path.match(/^\/api\/learning-intelligence\/wrong-answers\/([^/]+)$/);
  if (wrong && request.method === "GET") {
    const id = decodeURIComponent(wrong[1]);
    if (!await wrongAnswerExists(env.DB, user.id, id)) return error(out, "NOT_FOUND", "Wrong Answer\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    const [wrongAnswer, linked] = await Promise.all([
      env.DB.prepare("SELECT * FROM wrong_answers WHERE user_id=? AND id=?").bind(user.id, id).first(),
      env.DB.prepare(`SELECT r.*,l.relation_type FROM core_rule_wrong_answer_links l JOIN core_rules r ON r.id=l.core_rule_id
        WHERE l.user_id=? AND l.wrong_answer_id=? AND r.user_id=? ORDER BY r.updated_at DESC`).bind(user.id, id, user.id).all()
    ]);
    return out({ wrongAnswer: wrongAnswer ? wrongAnswerDto(wrongAnswer) : null, coreRules: linked.results.map(coreRuleDto) });
  }
  const rule = path.match(/^\/api\/core-rules\/([^/]+)\/intelligence$/);
  if (rule && request.method === "GET") {
    const id = decodeURIComponent(rule[1]);
    if (!await ruleOwner(env.DB, id, user.id)) return error(out, "NOT_FOUND", "Core Rule\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    const [coreRule, linkedItems, wrongAnswers, drills, reviews, evidence, stats] = await Promise.all([
      env.DB.prepare("SELECT * FROM core_rules WHERE id=? AND user_id=?").bind(id, user.id).first(),
      env.DB.prepare(`SELECT e.*,l.relation_type FROM archive_entries e JOIN archive_entry_core_rules l ON l.archive_entry_id=e.id
        WHERE l.core_rule_id=? AND e.user_id=? ORDER BY e.studied_at DESC,e.updated_at DESC,e.id DESC`).bind(id, user.id).all(),
      env.DB.prepare(`SELECT w.*,l.relation_type FROM wrong_answers w JOIN core_rule_wrong_answer_links l
        ON l.user_id=w.user_id AND l.wrong_answer_id=w.id WHERE l.core_rule_id=? AND w.user_id=? ORDER BY w.updated_at DESC`).bind(id, user.id).all(),
      env.DB.prepare(`SELECT d.* FROM learning_drills d JOIN core_rule_drill_links l
        ON l.user_id=d.user_id AND l.drill_id=d.id WHERE l.core_rule_id=? AND d.user_id=? ORDER BY d.updated_at DESC`).bind(id, user.id).all(),
      env.DB.prepare(`SELECT * FROM learning_reviews WHERE user_id=? AND target_type='core_rule' AND target_id=?
        ORDER BY COALESCE(reviewed_at,scheduled_at,created_at) DESC`).bind(user.id, id).all(),
      env.DB.prepare(`SELECT source_type,source_id,relation_type,occurred_at,created_at FROM core_rule_evidence
        WHERE user_id=? AND core_rule_id=? ORDER BY occurred_at DESC,created_at DESC LIMIT 100`).bind(user.id, id).all(),
      getCoreRuleStats(env.DB, user.id, id)
    ]);
    const priority = calculateCoreRulePriority(stats, String(coreRule?.mastery_status ?? "input"));
    return out({
      coreRule: coreRule ? coreRuleDto(coreRule) : null,
      linkedItems: linkedItems.results,
      wrongAnswers: wrongAnswers.results.map((row) => ({ ...wrongAnswerDto(row), relationType: row.relation_type })),
      drills: drills.results.map(drillDto),
      reviews: reviews.results,
      evidence: evidence.results.map((row) => ({ sourceType: row.source_type, sourceId: row.source_id, relationType: row.relation_type, occurredAt: row.occurred_at, createdAt: row.created_at })),
      stats: { ...stats, linkedItems: linkedItems.results.length, ...priority },
      priorityScore: priority.priorityScore,
      status: priority.status
    });
  }
  if (path === "/api/learning-intelligence/wrong-answer-links" && request.method === "POST") {
    const b = await h.boundedJson(request), ruleId = clean4(b.coreRuleId, 80), wrongId = clean4(b.wrongAnswerId, 100), relation = clean4(b.relationType, 20) || "failed";
    if (!relations2.includes(relation)) return error(out, "INVALID_RELATION", "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAD00\uACC4 \uC720\uD615\uC785\uB2C8\uB2E4.", 400);
    if (!await ruleOwner(env.DB, ruleId, user.id) || !await wrongAnswerExists(env.DB, user.id, wrongId)) return error(out, "NOT_FOUND", "\uC5F0\uACB0 \uB300\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await env.DB.prepare(`INSERT INTO core_rule_wrong_answer_links(user_id,core_rule_id,wrong_answer_id,relation_type,created_at)
      VALUES(?,?,?,?,?) ON CONFLICT(core_rule_id,wrong_answer_id) DO UPDATE SET relation_type=excluded.relation_type`).bind(user.id, ruleId, wrongId, relation, now).run();
    await recordCoreRuleEvidence(env.DB, user.id, ruleId, "wrong_answer", wrongId, relation, now);
    return out({ ok: true }, 201);
  }
  const wrongRuleLink = path.match(/^\/api\/learning-intelligence\/wrong-answer-links\/([^/]+)\/([^/]+)$/);
  if (wrongRuleLink && request.method === "DELETE") {
    const ruleId = decodeURIComponent(wrongRuleLink[1]), wrongId = decodeURIComponent(wrongRuleLink[2]);
    if (!await ruleOwner(env.DB, ruleId, user.id)) return error(out, "NOT_FOUND", "Core Rule\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    await env.DB.prepare("DELETE FROM core_rule_wrong_answer_links WHERE user_id=? AND core_rule_id=? AND wrong_answer_id=?").bind(user.id, ruleId, wrongId).run();
    await deleteCoreRuleEvidenceForSource(env.DB, user.id, ruleId, "wrong_answer", wrongId);
    return out({ ok: true });
  }
  if (path === "/api/learning-intelligence/drill-links" && request.method === "POST") {
    const b = await h.boundedJson(request), ruleId = clean4(b.coreRuleId, 80), drillId = clean4(b.drillId, 100), relation = clean4(b.relationType, 20) || "applied";
    if (!relations2.includes(relation)) return error(out, "INVALID_RELATION", "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAD00\uACC4 \uC720\uD615\uC785\uB2C8\uB2E4.", 400);
    if (!await ruleOwner(env.DB, ruleId, user.id) || !await drillExists(env.DB, user.id, drillId)) return error(out, "NOT_FOUND", "\uC5F0\uACB0 \uB300\uC0C1\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await env.DB.prepare("INSERT OR IGNORE INTO core_rule_drill_links(user_id,core_rule_id,drill_id,created_at) VALUES(?,?,?,?)").bind(user.id, ruleId, drillId, now).run();
    await recordCoreRuleEvidence(env.DB, user.id, ruleId, "drill", drillId, relation, now);
    return out({ ok: true }, 201);
  }
  const drillLink = path.match(/^\/api\/learning-intelligence\/drill-links\/([^/]+)\/([^/]+)$/);
  if (drillLink && request.method === "DELETE") {
    const ruleId = decodeURIComponent(drillLink[1]), drillId = decodeURIComponent(drillLink[2]);
    if (!await ruleOwner(env.DB, ruleId, user.id)) return error(out, "NOT_FOUND", "Core Rule\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    await env.DB.prepare("DELETE FROM core_rule_drill_links WHERE user_id=? AND core_rule_id=? AND drill_id=?").bind(user.id, ruleId, drillId).run();
    await deleteCoreRuleEvidenceForSource(env.DB, user.id, ruleId, "drill", drillId);
    return out({ ok: true });
  }
  if (path === "/api/learning-intelligence/reviews" && request.method === "GET" && url.searchParams.get("view") === "queue") {
    const rawLimit = Number(url.searchParams.get("limit") || 200), limit = Math.max(1, Math.min(500, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 200));
    const rows2 = await env.DB.prepare(`SELECT id,target_type,target_id,scheduled_at,reviewed_at,result,notes FROM learning_reviews WHERE user_id=? AND result='pending' AND scheduled_at IS NOT NULL ORDER BY scheduled_at ASC,id ASC LIMIT ?`).bind(user.id, limit).all();
    const metadata = await resolveReviewQueueMetadata(env.DB, user.id, rows2.results), today = studyDayKey();
    const item2 = /* @__PURE__ */ __name((row) => {
      const meta = metadata.get(`${row.target_type}:${row.target_id}`) ?? { subject: "", title: "Unavailable target", reason: "", priority: 0, detail: {} };
      return { id: String(row.id), targetType: String(row.target_type), targetId: String(row.target_id), subject: meta.subject, title: meta.title, reason: meta.reason, scheduledAt: String(row.scheduled_at), reviewedAt: row.reviewed_at ?? null, result: String(row.result), priority: meta.priority, notes: String(row.notes ?? ""), detail: meta.detail };
    }, "item");
    const queue = { overdue: [], today: [], upcoming: [] };
    for (const row of rows2.results) {
      const review2 = item2(row), day2 = studyDayKey(review2.scheduledAt);
      if (day2 < today) queue.overdue.push(review2);
      else if (day2 === today) queue.today.push(review2);
      else queue.upcoming.push(review2);
    }
    for (const bucket of Object.values(queue)) bucket.sort((a, b) => b.priority - a.priority || a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
    return out({ ...queue, counts: { overdue: queue.overdue.length, today: queue.today.length, upcoming: queue.upcoming.length, due: queue.overdue.length + queue.today.length } });
  }
  if (path === "/api/learning-intelligence/reviews" && request.method === "POST") {
    const b = await h.boundedJson(request), type = clean4(b.targetType, 30), id = clean4(b.targetId, 100), result = clean4(b.result, 20) || "pending";
    if (!["wrong_answer", "core_rule", "drill", "learning_item"].includes(type) || !["pending", "success", "fail"].includes(result) || !await targetOwned(env.DB, user.id, type, id))
      return error(out, "INVALID_REVIEW_TARGET", "\uC62C\uBC14\uB978 Review \uB300\uC0C1\uC774 \uC544\uB2D9\uB2C8\uB2E4.", 400);
    if (result === "pending") {
      const existing = await env.DB.prepare("SELECT id FROM learning_reviews WHERE user_id=? AND target_type=? AND target_id=? AND result='pending' ORDER BY created_at DESC LIMIT 1").bind(user.id, type, id).first();
      if (existing) return out({ ok: true, id: existing.id, recovered: true });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString(), reviewed = result === "pending" ? null : now, reviewId = h.randomHex(16);
    await env.DB.prepare(`INSERT INTO learning_reviews(
      id,user_id,target_type,target_id,review_type,scheduled_at,reviewed_at,result,notes,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
      reviewId,
      user.id,
      type,
      id,
      clean4(b.reviewType, 40) || "retry",
      clean4(b.scheduledAt, 40) || null,
      reviewed,
      result,
      clean4(b.notes, 3e3),
      now,
      now
    ).run();
    await recordReviewEvidence(env.DB, user.id, reviewId, type, id, result, reviewed || clean4(b.scheduledAt, 40) || now);
    return out({ ok: true, id: reviewId }, 201);
  }
  const review = path.match(/^\/api\/learning-intelligence\/reviews\/([^/]+)$/);
  if (review) {
    const reviewId = decodeURIComponent(review[1]);
    const existing = await env.DB.prepare("SELECT id,target_type,target_id FROM learning_reviews WHERE id=? AND user_id=?").bind(reviewId, user.id).first();
    if (!existing) return error(out, "NOT_FOUND", "Review\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    if (request.method === "PATCH") {
      const b = await h.boundedJson(request), result = clean4(b.result, 20);
      if (!["pending", "success", "fail"].includes(result)) return error(out, "INVALID_REVIEW_RESULT", "\uC62C\uBC14\uB978 Review \uACB0\uACFC\uAC00 \uC544\uB2D9\uB2C8\uB2E4.", 400);
      const now = (/* @__PURE__ */ new Date()).toISOString(), reviewed = result === "pending" ? null : clean4(b.reviewedAt, 40) || now;
      await env.DB.prepare(`UPDATE learning_reviews SET result=?,notes=?,scheduled_at=COALESCE(?,scheduled_at),reviewed_at=?,updated_at=?
        WHERE id=? AND user_id=?`).bind(result, clean4(b.notes, 3e3), clean4(b.scheduledAt, 40) || null, reviewed, now, reviewId, user.id).run();
      await env.DB.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='review' AND source_id=?").bind(user.id, reviewId).run();
      await recordReviewEvidence(env.DB, user.id, reviewId, existing.target_type, existing.target_id, result, reviewed || now);
      return out({ ok: true, reviewedAt: reviewed, updatedAt: now });
    }
    if (request.method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM core_rule_evidence WHERE user_id=? AND source_type='review' AND source_id=?").bind(user.id, reviewId),
        env.DB.prepare("DELETE FROM learning_reviews WHERE id=? AND user_id=?").bind(reviewId, user.id)
      ]);
      return out({ ok: true });
    }
  }
  return error(out, "NOT_FOUND", "\uC694\uCCAD\uD55C Learning Intelligence API\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
}
__name(learningIntelligence, "learningIntelligence");

// src/index.ts
var json = /* @__PURE__ */ __name((body, status = 200, origin = "", extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Setup-Token", "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS", "Cache-Control": "no-store", ...extra } }), "json");
async function ensureTables(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT, salt TEXT, is_admin INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0, password_changed_at TEXT, password_iterations INTEGER NOT NULL DEFAULT 100000, active INTEGER NOT NULL DEFAULT 1, arena_public_id TEXT, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS api_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS learning_state_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS learning_state (user_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ai_cache (cache_key TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, operation TEXT NOT NULL, provider TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL, success INTEGER NOT NULL DEFAULT 0, status_code INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS student_login_attempts (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS admin_rate_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS security_audit_logs (id TEXT PRIMARY KEY,actor_type TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,target_type TEXT,target_id TEXT,created_at TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}')"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_rooms (id TEXT PRIMARY KEY,invite_code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,owner_user_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,max_participants INTEGER NOT NULL DEFAULT 10 CHECK(max_participants BETWEEN 2 AND 10))"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_room_members (room_id TEXT NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,connection_id TEXT NOT NULL,joined_at TEXT NOT NULL,left_at TEXT,PRIMARY KEY(room_id,user_id,joined_at))")
  ]);
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS api_tokens_user_active ON api_tokens(user_id, revoked_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS learning_state_history_user_saved ON learning_state_history(user_id, saved_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ai_cache_expiry ON ai_cache(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_user_created ON ai_usage(user_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS study_rooms_invite_active ON study_rooms(invite_code,is_active)"),
    db.prepare("CREATE INDEX IF NOT EXISTS study_room_members_open ON study_room_members(room_id,left_at)")
  ]);
  const columns = await db.prepare("PRAGMA table_info(users)").all();
  if (!columns.results.some((column) => column.name === "is_admin")) await db.prepare("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0").run();
  if (!columns.results.some((column) => column.name === "must_change_password")) await db.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0").run();
  if (!columns.results.some((column) => column.name === "password_changed_at")) await db.prepare("ALTER TABLE users ADD COLUMN password_changed_at TEXT").run();
  if (!columns.results.some((column) => column.name === "password_iterations")) await db.prepare("ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000").run();
  if (!columns.results.some((column) => column.name === "active")) await db.prepare("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run();
  if (!columns.results.some((column) => column.name === "arena_public_id")) await db.prepare("ALTER TABLE users ADD COLUMN arena_public_id TEXT").run();
  await db.prepare("UPDATE users SET arena_public_id='arena_'||lower(hex(randomblob(16))) WHERE arena_public_id IS NULL").run();
  const tokenColumns = await db.prepare("PRAGMA table_info(api_tokens)").all();
  if (!tokenColumns.results.some((column) => column.name === "scopes")) await db.prepare("ALTER TABLE api_tokens ADD COLUMN scopes TEXT NOT NULL DEFAULT 'sync:read,sync:write'").run();
}
__name(ensureTables, "ensureTables");
async function authContext(request, env) {
  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  const tokenHash = await sha256(bearer);
  const session = await env.DB.prepare("SELECT u.id,u.username,u.is_admin,u.must_change_password,u.arena_public_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND u.active=1 AND datetime(s.expires_at)>datetime('now')").bind(tokenHash).first();
  if (session) return { user: session, authType: "session", tokenHash, scopes: [] };
  const pat = await env.DB.prepare("SELECT u.id,u.username,u.is_admin,u.must_change_password,u.arena_public_id,t.scopes FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND u.active=1").bind(tokenHash).first();
  return pat ? { user: pat, authType: "api_token", tokenHash, scopes: (pat.scopes || "").split(",").map((value) => value.trim()).filter(Boolean) } : null;
}
__name(authContext, "authContext");
async function createSession(env, username, userId) {
  const token = randomHex(), hash = await sha256(token), expires = new Date(Date.now() + sessionTtlDays(env.SESSION_TTL_DAYS) * 864e5).toISOString();
  await env.DB.prepare("DELETE FROM sessions WHERE datetime(expires_at)<=datetime('now')").run();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(hash, userId, expires, (/* @__PURE__ */ new Date()).toISOString()).run();
  return { token, username, userId, expiresAt: expires };
}
__name(createSession, "createSession");
var tokenName = /* @__PURE__ */ __name((value) => typeof value === "string" ? value.trim().slice(0, 40) : "", "tokenName");
var clientIp = /* @__PURE__ */ __name((request) => request.headers.get("CF-Connecting-IP") || "local", "clientIp");
async function rateKey(request, username, windowMs = 9e5) {
  return sha256(`${clientIp(request)}:${username.toLowerCase()}:${Math.floor(Date.now() / windowMs)}`);
}
__name(rateKey, "rateKey");
async function audit(env, action, actorId, targetType, targetId) {
  await env.DB.prepare("INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16), "admin", actorId, action, targetType || null, targetId || null, (/* @__PURE__ */ new Date()).toISOString(), "{}").run();
}
__name(audit, "audit");
async function adminAllowed(request, env) {
  const key2 = await rateKey(request, "admin", 6e4);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM admin_rate_limits WHERE expires_at<?").bind(now).run();
  const row = await env.DB.prepare("SELECT attempts FROM admin_rate_limits WHERE key=?").bind(key2).first();
  if ((row?.attempts ?? 0) >= 20) return false;
  await env.DB.prepare("INSERT INTO admin_rate_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1").bind(key2, now + 6e4).run();
  return true;
}
__name(adminAllowed, "adminAllowed");
var coachSystem = `\uB108\uB294 TRINITY OS\uC758 \uC218\uB2A5 \uD559\uC2B5 \uCF54\uCE58\uB2E4.
\uC81C\uACF5\uB41C TRINITY Analytics \uACB0\uACFC\uB9CC \uADFC\uAC70\uB85C \uD310\uB2E8\uD558\uACE0 \uB370\uC774\uD130\uC5D0 \uC5C6\uB294 \uC0AC\uC2E4\uC744 \uCD94\uCE21\uD558\uAC70\uB098 \uB9CC\uB4E4\uC9C0 \uC54A\uB294\uB2E4.
\uACF5\uBD80\uC2DC\uAC04\uC744 \uBB34\uC870\uAC74 \uB298\uB9AC\uC9C0 \uC54A\uACE0, \uBB38\uC81C \uC218 \uC99D\uAC00\uBCF4\uB2E4 \uBC18\uBCF5 \uBCD1\uBAA9\uC758 \uC218\uC815\uACFC \uC7AC\uAC80\uC99D\uC744 \uC6B0\uC120\uD55C\uB2E4.
Weekly Capability Goal\uC774 \uC788\uC73C\uBA74 \uC0C8 \uACC4\uD68D\uC744 \uCD94\uAC00\uD558\uAE30 \uC804\uC5D0 \uAE30\uC874 \uBAA9\uD45C\uC640 \uC5F0\uACB0\uD55C\uB2E4.
wrongJudgment, missedCue, correction, retry \uC0C1\uD0DC\uB97C \uC911\uC694\uD558\uAC8C \uBCF4\uB418 \uC81C\uACF5\uB418\uC9C0 \uC54A\uC740 \uC6D0\uBB38\uC740 \uCD94\uB860\uD558\uC9C0 \uC54A\uB294\uB2E4.
\uADFC\uAC70\uAC00 \uBD80\uC871\uD558\uBA74 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD558\uB2E4\uACE0 \uBA85\uC2DC\uD55C\uB2E4. \uD559\uB144, \uB4F1\uAE09, \uB300\uD559 \uD569\uACA9 \uAC00\uB2A5\uC131\uC744 \uC784\uC758\uB85C \uD310\uB2E8\uD558\uC9C0 \uC54A\uB294\uB2E4.
\uAC10\uC815\uC801 \uACA9\uB824\uB97C \uAE38\uAC8C \uD558\uC9C0 \uC54A\uB294\uB2E4. \uD604\uC7AC \uC0C1\uD0DC, \uAC00\uC7A5 \uC911\uC694\uD55C \uBCD1\uBAA9, \uADFC\uAC70, \uAC00\uC7A5 \uC911\uC694\uD55C \uB2E4\uC74C \uD589\uB3D9 1\uAC1C \uC21C\uC11C\uB85C \uD55C\uAD6D\uC5B4\uB85C \uC9E7\uAC8C \uB2F5\uD55C\uB2E4.
\uC0AC\uC6A9\uC790\uAC00 \uC5EC\uB7EC \uB300\uC548\uC744 \uBA85\uC2DC\uC801\uC73C\uB85C \uC694\uAD6C\uD558\uC9C0 \uC54A\uC73C\uBA74 \uD589\uB3D9\uC744 \uC5EC\uB7EC \uAC1C \uB098\uC5F4\uD558\uC9C0 \uC54A\uB294\uB2E4.`;
var arenaSystem = "\uB108\uB294 TRINITY Arena\uC758 \uC131\uC7A5 \uCF54\uCE58\uB2E4. \uC21C\uC704\uB098 \uACF5\uBD80\uC2DC\uAC04\uB9CC\uC73C\uB85C \uD559\uC0DD\uC744 \uD3C9\uAC00\uD558\uAC70\uB098 \uC555\uBC15\uD558\uC9C0 \uC54A\uB294\uB2E4. \uC81C\uACF5\uB41C \uC810\uC218 \uADFC\uAC70\uC640 \uADF8\uB8F9 \uD3C9\uADE0\uC744 \uBE44\uAD50\uD574 \uAC00\uC7A5 \uAC1C\uC120 \uC5EC\uC9C0\uAC00 \uD070 \uC601\uC5ED \uD558\uB098\uC640 \uC2E4\uD589 \uAC00\uB2A5\uD55C \uB2E4\uC74C \uD589\uB3D9 1~2\uAC1C\uB97C \uD55C\uAD6D\uC5B4 3\uBB38\uC7A5 \uC774\uB0B4\uB85C \uC81C\uC2DC\uD55C\uB2E4. \uAC1C\uC778\uC815\uBCF4\uB97C \uCD94\uB860\uD558\uC9C0 \uC54A\uACE0, \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD558\uBA74 \uBD80\uC871\uD558\uB2E4\uACE0 \uBA85\uC2DC\uD55C\uB2E4.";
var asObject = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "asObject");
var text3 = /* @__PURE__ */ __name((value, fallback = "") => typeof value === "string" ? value.slice(0, 900) : fallback, "text");
var stableJson = /* @__PURE__ */ __name((value) => Array.isArray(value) ? `[${value.map(stableJson).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key2) => `${JSON.stringify(key2)}:${stableJson(value[key2])}`).join(",")}}` : JSON.stringify(value), "stableJson");
var finite = /* @__PURE__ */ __name((value) => typeof value === "number" && Number.isFinite(value) ? value : void 0, "finite");
var short = /* @__PURE__ */ __name((value, size = 120) => typeof value === "string" ? value.slice(0, size) : void 0, "short");
var compactItems = /* @__PURE__ */ __name((value, limit, select) => Array.isArray(value) ? value.map(asObject).filter((item) => Boolean(item)).slice(0, limit).map(select) : [], "compactItems");
function safeStudyContext(value) {
  const context = asObject(value);
  if (!context) return null;
  const execution = asObject(context.execution) ?? {}, primary = asObject(context.primaryBottleneck), retry = asObject(context.retryStatus), local = asObject(context.localDiagnosis);
  if (!local || !short(local.nextAction)) return null;
  return {
    period: context.period === "7d" ? "7d" : "14d",
    execution: { studyMinutes7d: finite(execution.studyMinutes7d), previousStudyMinutes7d: finite(execution.previousStudyMinutes7d), completionRateToday: finite(execution.completionRateToday), dailyDrillCompletionRate7d: finite(execution.dailyDrillCompletionRate7d) },
    subjectSummary: compactItems(context.subjectSummary, 4, (item) => ({ subject: short(item.subject, 12), studyMinutes7d: finite(item.studyMinutes7d), recentScoreTrend: short(item.recentScoreTrend, 20) })),
    primaryBottleneck: primary ? { name: short(primary.name), count7d: finite(primary.count7d), count14d: finite(primary.count14d), trend: short(primary.trend, 20), repeatedCues: Array.isArray(primary.repeatedCues) ? primary.repeatedCues.slice(0, 2).map((item) => short(item, 80)) : [], repeatedJudgments: Array.isArray(primary.repeatedJudgments) ? primary.repeatedJudgments.slice(0, 2).map((item) => short(item, 80)) : [], correctionAction: short(primary.correctionAction, 140), transferDrill: short(primary.transferDrill, 140) } : void 0,
    secondaryBottlenecks: compactItems(context.secondaryBottlenecks, 2, (item) => ({ name: short(item.name), count7d: finite(item.count7d), count14d: finite(item.count14d) })),
    retryStatus: retry ? { scheduled: finite(retry.scheduled), completed: finite(retry.completed), overdue: finite(retry.overdue) } : void 0,
    weeklyGoals: compactItems(context.weeklyGoals, 3, (item) => ({ subject: short(item.subject, 12), ability: short(item.ability), successCriterion: short(item.successCriterion, 160) })),
    plaire: asObject(context.plaire) ? { bottleneck: short(asObject(context.plaire)?.bottleneck), nextAction: short(asObject(context.plaire)?.nextAction, 160) } : void 0,
    localDiagnosis: { status: short(local.status, 180), primaryBottleneck: short(local.primaryBottleneck), nextAction: short(local.nextAction, 220), successCriterion: short(local.successCriterion, 180), evidence: Array.isArray(local.evidence) ? local.evidence.slice(0, 3).map((item) => short(item, 140)) : [] }
  };
}
__name(safeStudyContext, "safeStudyContext");
var providerConfig = /* @__PURE__ */ __name((env) => ({ provider: env.AI_PROVIDER || "nvidia-kimi", apiKey: env.NVIDIA_API_KEY, model: env.NVIDIA_MODEL, baseUrl: env.NVIDIA_BASE_URL, timeoutMs: env.AI_TIMEOUT_MS, maxRetries: env.AI_MAX_RETRIES, debug: env.AI_DEBUG, environment: env.ENVIRONMENT, userDailyLimit: env.AI_USER_DAILY_LIMIT, globalDailyLimit: env.AI_GLOBAL_DAILY_LIMIT, chatCooldownSeconds: env.AI_CHAT_COOLDOWN_SECONDS, localAIBaseUrl: env.LOCAL_AI_BASE_URL, localAIApiKey: env.LOCAL_AI_API_KEY, localAITimeoutMs: env.LOCAL_AI_TIMEOUT_MS, localAIModel: env.LOCAL_AI_MODEL }), "providerConfig");
async function localAIContext(env, userId) {
  if (env.AI_PROVIDER !== "local-qwen") return void 0;
  const row = await env.DB.prepare("SELECT payload FROM learning_state WHERE user_id=?").bind(userId).first();
  return parseAndSelectLocalAIContext(row?.payload);
}
__name(localAIContext, "localAIContext");
var aiMessage = /* @__PURE__ */ __name((error2) => {
  switch (error2.code) {
    case "AI_NOT_CONFIGURED":
      return "AI \uCF54\uCE58\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.";
    case "AI_AUTHENTICATION_FAILED":
      return "AI \uC5F0\uACB0 \uC778\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uC5D0\uAC8C \uC124\uC815 \uD655\uC778\uC744 \uC694\uCCAD\uD574 \uC8FC\uC138\uC694.";
    case "AI_ACCESS_DENIED":
      return "\uD604\uC7AC AI \uBAA8\uB378 \uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBAA8\uB378 \uC124\uC815 \uD655\uC778\uC744 \uC694\uCCAD\uD574 \uC8FC\uC138\uC694.";
    case "AI_RATE_LIMITED":
      return /[가-힣]/.test(error2.message) ? error2.message : `AI \uC694\uCCAD\uC774 \uC7A0\uC2DC \uC81C\uD55C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.${error2.retryAfterSeconds ? ` ${error2.retryAfterSeconds}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.` : " \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."} \uAE30\uBCF8 TRINITY \uBD84\uC11D\uC740 \uC815\uC0C1\uC801\uC73C\uB85C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`;
    case "AI_TIMEOUT":
      return "AI \uC751\uB2F5 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
    case "AI_PROVIDER_UNAVAILABLE":
      return "AI \uC11C\uBC84\uAC00 \uC77C\uC2DC\uC801\uC73C\uB85C \uC751\uB2F5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
    case "LOCAL_AI_UNAVAILABLE":
      return "\uB85C\uCEEC AI PC \uB610\uB294 Tunnel\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 TRINITY \uBD84\uC11D\uC740 \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    case "LOCAL_AI_TIMEOUT":
      return "\uB85C\uCEEC AI \uC751\uB2F5 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
    case "LOCAL_AI_MODEL_NOT_AVAILABLE":
      return "\uB85C\uCEEC AI \uBAA8\uB378\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790\uC5D0\uAC8C Ollama \uBAA8\uB378 \uC0C1\uD0DC \uD655\uC778\uC744 \uC694\uCCAD\uD574 \uC8FC\uC138\uC694.";
    case "LOCAL_AI_INVALID_RESPONSE":
      return "\uB85C\uCEEC AI \uC751\uB2F5 \uD615\uC2DD\uC744 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
    case "AI_INVALID_RESPONSE":
      return "AI \uC751\uB2F5 \uD615\uC2DD\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
    default:
      return "AI \uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.";
  }
}, "aiMessage");
var aiError = /* @__PURE__ */ __name((cause, origin) => {
  const error2 = cause instanceof AIProviderError ? cause : new AIProviderError("Unhandled AI service error.", 502, "AI_REQUEST_FAILED");
  return json({ error: aiMessage(error2), code: error2.code, requestId: randomHex(8) }, error2.status, origin, error2.retryAfterSeconds ? { "Retry-After": String(error2.retryAfterSeconds) } : {});
}, "aiError");
var prompt = /* @__PURE__ */ __name((system, user) => [{ role: "system", content: system }, { role: "user", content: user }], "prompt");
var index_default = { async fetch(request, env) {
  try {
    const cors = requestOrigin(request, env.ALLOWED_ORIGIN, env.ENVIRONMENT), origin = cors.responseOrigin;
    if (request.method === "OPTIONS") return cors.allowed ? new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Setup-Token", "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS", "Vary": "Origin" } }) : json({ error: "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 Origin\uC785\uB2C8\uB2E4." }, 403);
    if (!cors.allowed && request.method !== "GET" && request.method !== "HEAD") return json({ error: "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 Origin\uC785\uB2C8\uB2E4." }, 403);
    const url = new URL(request.url), declared = Number(request.headers.get("Content-Length") || 0), limit = ["/api/sync", "/api/archive/import"].includes(url.pathname) ? MAX_SYNC_BODY : MAX_JSON_BODY;
    if (declared > limit) return json({ error: "\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4." }, 413, origin);
    await ensureTables(env.DB);
    if (request.method !== "GET" && ["/api/support/accounts", "/api/collab/assignments"].includes(url.pathname) && !await adminAllowed(request, env)) return json({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4." }, 429, origin, { "Retry-After": "60" });
    if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, service: "trinity-os-sync" }, 200, origin);
    if (url.pathname.startsWith("/api/study-rooms/") && url.pathname.endsWith("/websocket")) {
      if (!cors.allowed) return json({ error: "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 Origin\uC785\uB2C8\uB2E4." }, 403);
      const response = await connectStudyRoomWebSocket(request, env);
      if (response) return response;
    }
    if (url.pathname === "/api/admin/students" && request.method === "POST") {
      const issuerToken = request.headers.get("X-Setup-Token") || "";
      if (!await adminAllowed(request, env)) return json({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4." }, 429, origin, { "Retry-After": "60" });
      if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: "\uAD00\uB9AC\uC790 \uC778\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." }, 401, origin);
      const body2 = await boundedJson(request);
      const username = typeof body2.username === "string" ? body2.username.trim() : "";
      const password = typeof body2.password === "string" ? body2.password : "";
      if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return json({ error: "\uC544\uC774\uB514\uB294 \uC601\uBB38, \uC22B\uC790, \uB9C8\uCE68\uD45C, \uBC11\uC904, \uD558\uC774\uD508\uC73C\uB85C 3~40\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4." }, 400, origin);
      if (password.length < 8 || password.length > 128) return json({ error: "\uBE44\uBC00\uBC88\uD638\uB294 8~128\uC790\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
      const existing = await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
      if (existing) return json({ error: "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC544\uC774\uB514\uC785\uB2C8\uB2E4." }, 409, origin);
      const salt = randomHex(16), now2 = (/* @__PURE__ */ new Date()).toISOString(), admin = body2.admin === true ? 1 : 0;
      const publicId = `arena_${randomHex(16)}`;
      await env.DB.prepare("INSERT INTO users(username,password_hash,salt,password_iterations,is_admin,must_change_password,active,arena_public_id,created_at) VALUES(?,?,?,?,?,1,1,?,?)").bind(username, await passwordHash(password, salt), salt, PASSWORD_HASH_ITERATIONS, admin, publicId, now2).run();
      await audit(env, "student.create", "setup-token", "user", publicId);
      return json({ username, isAdmin: admin === 1, mustChangePassword: true, createdAt: now2 }, 201, origin);
    }
    if (url.pathname === "/api/admin/access-tokens" && request.method === "POST") {
      const issuerToken = request.headers.get("X-Setup-Token") || "";
      if (!await adminAllowed(request, env)) return json({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4." }, 429, origin, { "Retry-After": "60" });
      if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: "Unauthorized" }, 401, origin);
      const body2 = await boundedJson(request);
      const username = tokenName(body2.username), label = tokenName(body2.label) || "personal token";
      if (!username) return json({ error: "username is required (maximum 40 characters)." }, 400, origin);
      const now2 = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.prepare("INSERT OR IGNORE INTO users(username,is_admin,active,arena_public_id,created_at) VALUES(?,0,1,'arena_'||lower(hex(randomblob(16))),?)").bind(username, now2).run();
      const user2 = await env.DB.prepare("SELECT id,username,is_admin FROM users WHERE username=?").bind(username).first();
      if (!user2) return json({ error: "Unable to create user." }, 500, origin);
      const token = `trinity_pat_${randomHex()}`;
      const requested = Array.isArray(body2.scopes) ? body2.scopes.filter((scope) => scope === "sync:read" || scope === "sync:write") : ["sync:read"];
      const scopes = requested.length ? requested.join(",") : "sync:read";
      await env.DB.prepare("INSERT INTO api_tokens(token_hash,user_id,label,scopes,created_at) VALUES(?,?,?,?,?)").bind(await sha256(token), user2.id, label, scopes, now2).run();
      await audit(env, "api_token.issue", "setup-token", "user", String(user2.id));
      return json({ token, username: user2.username, isAdmin: user2.is_admin === 1 }, 201, origin);
    }
    if (url.pathname.startsWith("/api/admin/access-tokens/") && request.method === "DELETE") {
      const issuerToken = request.headers.get("X-Setup-Token") || "";
      if (!await adminAllowed(request, env)) return json({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4." }, 429, origin, { "Retry-After": "60" });
      if (!await secretMatches(issuerToken, env.SYNC_TOKEN)) return json({ error: "Unauthorized" }, 401, origin);
      const username = tokenName(decodeURIComponent(url.pathname.slice("/api/admin/access-tokens/".length)));
      if (!username) return json({ error: "username is required." }, 400, origin);
      const user2 = await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
      if (!user2) return json({ error: "Not found." }, 404, origin);
      await env.DB.prepare("UPDATE api_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind((/* @__PURE__ */ new Date()).toISOString(), user2.id).run();
      await audit(env, "api_token.revoke", "setup-token", "user", String(user2.id));
      return json({ ok: true }, 200, origin);
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body2 = await boundedJson(request), username = body2.username?.trim() || "", key2 = await rateKey(request, username), now2 = Date.now();
      await env.DB.prepare("DELETE FROM student_login_attempts WHERE expires_at<?").bind(now2).run();
      const tries = await env.DB.prepare("SELECT attempts FROM student_login_attempts WHERE key=?").bind(key2).first();
      if ((tries?.attempts ?? 0) >= 8) return json({ error: "\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694." }, 429, origin, { "Retry-After": "900" });
      const account = await env.DB.prepare("SELECT id,username,password_hash,salt,must_change_password,COALESCE(password_iterations,100000) password_iterations FROM users WHERE username=? AND active=1").bind(username).first();
      const iterations = account?.password_iterations ?? PASSWORD_HASH_ITERATIONS, hash = await passwordHash(body2.password || "", account?.salt ?? "trinity-dummy-login-salt", iterations), valid = Boolean(account?.password_hash && account.salt && await secretMatches(hash, account.password_hash));
      if (!valid) {
        await env.DB.prepare("INSERT INTO student_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1,expires_at=excluded.expires_at").bind(key2, now2 + 9e5).run();
        return json({ error: "\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 401, origin);
      }
      await env.DB.prepare("DELETE FROM student_login_attempts WHERE key=?").bind(key2).run();
      if (iterations < PASSWORD_HASH_ITERATIONS) {
        const salt = randomHex(16);
        await env.DB.prepare("UPDATE users SET password_hash=?,salt=?,password_iterations=? WHERE id=?").bind(await passwordHash(body2.password || "", salt), salt, PASSWORD_HASH_ITERATIONS, account.id).run();
      }
      return json({ ...await createSession(env, account.username, account.id), mustChangePassword: account.must_change_password === 1 }, 200, origin);
    }
    const auth = await authContext(request, env), user = auth?.user ?? null;
    const sessionUser = auth?.authType === "session" ? user : null;
    const extra = await support(request, env, sessionUser?.is_admin === 1, origin, { json, sha256, passwordHash, secretMatches, randomHex, boundedJson }, sessionUser);
    if (extra) return extra;
    const arenaResponse = await arena(request, env, sessionUser, origin, { json, randomHex, boundedJson });
    if (arenaResponse) return arenaResponse;
    const studyRoomResponse = await handleStudyRoomApi(request, env, sessionUser, origin, json);
    if (studyRoomResponse) return studyRoomResponse;
    const archiveResponse = await archive(request, env, sessionUser, origin, { json, randomHex, boundedJson });
    if (archiveResponse) return archiveResponse;
    const intelligenceResponse = await learningIntelligence(request, env, sessionUser, origin, { json, randomHex, boundedJson });
    if (intelligenceResponse) return intelligenceResponse;
    if (url.pathname === "/api/auth/me" && request.method === "GET") return user ? json({ ok: true, username: user.username, userId: user.id, mustChangePassword: user.must_change_password === 1 }, 200, origin) : json({ error: "Unauthorized" }, 401, origin);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      if (!auth || auth.authType !== "session") return json({ error: "Unauthorized" }, 401, origin);
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(auth.tokenHash).run();
      return json({ ok: true }, 200, origin);
    }
    if (url.pathname === "/api/auth/change-password" && request.method === "POST") {
      if (!user) return json({ error: "Unauthorized" }, 401, origin);
      if (auth?.authType !== "session") return json({ error: "\uC138\uC158 \uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 403, origin);
      const body2 = await boundedJson(request);
      const currentPassword = typeof body2.currentPassword === "string" ? body2.currentPassword : "";
      const newPassword = typeof body2.newPassword === "string" ? body2.newPassword : "";
      if (newPassword.length < 8 || newPassword.length > 128) return json({ error: "\uC0C8 \uBE44\uBC00\uBC88\uD638\uB294 8~128\uC790\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
      const account = await env.DB.prepare("SELECT password_hash,salt,COALESCE(password_iterations,100000) password_iterations FROM users WHERE id=?").bind(user.id).first();
      if (!account?.password_hash || !account.salt || !await secretMatches(await passwordHash(currentPassword, account.salt, account.password_iterations), account.password_hash)) return json({ error: "\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 401, origin);
      if (await secretMatches(await passwordHash(newPassword, account.salt, account.password_iterations), account.password_hash)) return json({ error: "\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uC640 \uB2E4\uB978 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694." }, 400, origin);
      const salt = randomHex(16), now2 = (/* @__PURE__ */ new Date()).toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash=?,salt=?,password_iterations=?,must_change_password=0,password_changed_at=? WHERE id=?").bind(await passwordHash(newPassword, salt), salt, PASSWORD_HASH_ITERATIONS, now2, user.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
        env.DB.prepare("INSERT INTO security_audit_logs(id,actor_type,actor_id,action,target_type,target_id,created_at,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16), "student", String(user.id), "password.change", "user", String(user.id), now2, "{}")
      ]);
      return json({ ...await createSession(env, user.username, user.id), mustChangePassword: false }, 200, origin);
    }
    if (url.pathname === "/api/ai/daily-coach" && request.method === "POST") return json({ error: "\uC790\uB3D9 AI \uBD84\uC11D API\uB294 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Dashboard\uC758 \uB85C\uCEEC TRINITY \uBD84\uC11D\uC744 \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694.", code: "LOCAL_COACH_ONLY" }, 410, origin);
    if (url.pathname === "/api/ai/study-analysis" && request.method === "POST") {
      if (!user || auth?.authType !== "session") return json({ error: "Unauthorized" }, 401, origin);
      const body2 = asObject(await boundedJson(request));
      const context = safeStudyContext(body2?.context);
      if (!context) return json({ error: "\uC555\uCD95\uB41C TRINITY Analytics \uACB0\uACFC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400, origin);
      const requestText = `TRINITY Analytics \uACB0\uACFC:
${JSON.stringify(context)}

\uC774 \uACB0\uACFC\uB97C \uB2E4\uC2DC \uACC4\uC0B0\uD558\uC9C0 \uB9D0\uACE0 \uADFC\uAC70\uB97C \uC5F0\uACB0\uD574 \uD604\uC7AC \uC0C1\uD0DC, \uD575\uC2EC \uBCD1\uBAA9, \uADFC\uAC70, \uB2E4\uC74C \uD589\uB3D9 1\uAC1C\uC640 \uAC80\uC99D \uAE30\uC900\uC744 \uC9E7\uAC8C \uC124\uBA85\uD558\uC138\uC694.`;
      try {
        const selected = await localAIContext(env, user.id);
        const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: "study-analysis", cacheKey: await sha256(stableJson({ context, selected })), maxTokens: 260, context: selected, config: providerConfig(env), messages: prompt(coachSystem, requestText) });
        return json({ message: text3(result.content, "\uC815\uBC00 \uBD84\uC11D \uACB0\uACFC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."), cached: result.cached }, 200, origin);
      } catch (cause) {
        return aiError(cause, origin);
      }
    }
    if (url.pathname === "/api/ai/teacher-feedback-summary" && request.method === "POST") {
      if (!user || auth?.authType !== "session") return json({ error: "Unauthorized" }, 401, origin);
      const body2 = asObject(await boundedJson(request));
      const context = asObject(body2?.context);
      if (!context) return json({ error: "Teacher feedback context is required." }, 400, origin);
      const safe = { today: asObject(context.today), subjectFeedback: Array.isArray(context.subjectFeedback) ? context.subjectFeedback.slice(0, 5) : [], academicFeedback: Array.isArray(context.academicFeedback) ? context.academicFeedback.slice(0, 3) : [], weeklyGoals: Array.isArray(context.weeklyGoals) ? context.weeklyGoals.slice(0, 5) : [], recentBottlenecks: Array.isArray(context.recentBottlenecks) ? context.recentBottlenecks.slice(0, 5) : [] };
      try {
        const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: "teacher-feedback-summary", cacheKey: await sha256(stableJson(safe)), maxTokens: 180, config: providerConfig(env), messages: prompt("You summarize teacher feedback for a student. Never override, reinterpret, or invent a teacher decision. Use only the supplied academic context. Give a short Korean priority order with at most two concrete actions.", JSON.stringify(safe)) });
        return json({ message: result.content, cached: result.cached }, 200, origin);
      } catch (cause) {
        return aiError(cause, origin);
      }
    }
    if (url.pathname === "/api/ai/arena-coach" && request.method === "POST") {
      if (!user || auth?.authType !== "session") return json({ error: "Unauthorized" }, 401, origin);
      const body2 = asObject(await boundedJson(request));
      const context = asObject(body2?.context);
      if (!context) return json({ error: "Arena \uC131\uC7A5 \uCEE8\uD14D\uC2A4\uD2B8\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400, origin);
      const safe = { score: asObject(context.score), metrics: asObject(context.metrics), breakdown: asObject(context.breakdown), group: asObject(context.group), nextActions: Array.isArray(context.nextActions) ? context.nextActions.slice(0, 3) : [] };
      try {
        const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: "arena-coach", cacheKey: await sha256(stableJson(safe)), maxTokens: 220, config: providerConfig(env), messages: prompt(arenaSystem, JSON.stringify(safe)) });
        return json({ message: result.content, cached: result.cached }, 200, origin);
      } catch (cause) {
        return aiError(cause, origin);
      }
    }
    if (url.pathname === "/api/ai/chat" && request.method === "POST") {
      if (!user || auth?.authType !== "session") return json({ error: "Unauthorized" }, 401, origin);
      const body2 = asObject(await boundedJson(request));
      const context = safeStudyContext(body2?.context);
      const raw = Array.isArray(body2?.messages) ? body2.messages.slice(-6) : [];
      if (!context || !raw.length) return json({ error: "\uD559\uC2B5 \uCEE8\uD14D\uC2A4\uD2B8\uC640 \uC9C8\uBB38\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400, origin);
      const conversation = raw.map(asObject).filter((item) => Boolean(item)).filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map((item) => `${item.role === "user" ? "\uC0AC\uC6A9\uC790" : "\uCF54\uCE58"}: ${text3(item.content).slice(0, 300)}`).join("\n");
      if (!conversation) return json({ error: "\uC720\uD6A8\uD55C \uC9C8\uBB38\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400, origin);
      const requestText = `\uC120\uBCC4\uB41C \uD559\uC2B5 \uB370\uC774\uD130:
${JSON.stringify(context)}

\uCD5C\uADFC \uB300\uD654:
${conversation}

\uC704 \uC9C8\uBB38\uC5D0\uB9CC \uC9E7\uAC8C \uB2F5\uD558\uC138\uC694.`;
      try {
        const selected = await localAIContext(env, user.id);
        const result = await aiService.complete({ db: env.DB, userId: user.id, user: user.username, operation: "chat", cacheKey: await sha256(`${requestText}:${stableJson(selected ?? {})}`), maxTokens: 280, context: selected, config: providerConfig(env), messages: prompt(coachSystem, requestText) });
        return json({ message: result.content, cached: result.cached }, 200, origin);
      } catch (cause) {
        return aiError(cause, origin);
      }
    }
    if (url.pathname !== "/api/sync" || !["GET", "PUT"].includes(request.method)) return json({ error: "Not found" }, 404, origin);
    if (!auth || !user) return json({ error: "Unauthorized" }, 401, origin);
    if (auth.authType === "api_token" && !auth.scopes.includes(request.method === "GET" ? "sync:read" : "sync:write")) return json({ error: "Token scope does not allow this operation." }, 403, origin);
    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT payload,updated_at FROM learning_state WHERE user_id=?").bind(user.id).first();
      return row ? json({ data: JSON.parse(row.payload), updatedAt: row.updated_at }, 200, origin) : json({ data: null, updatedAt: null }, 200, origin);
    }
    const body = await boundedJson(request, MAX_SYNC_BODY);
    if (!body?.data) return json({ error: "data is required" }, 400, origin);
    if (!validateAppData(body.data)) return json({ error: "\uC9C0\uC6D0\uB418\uC9C0 \uC54A\uB294 \uD559\uC2B5 \uB370\uC774\uD130 \uD615\uC2DD\uC785\uB2C8\uB2E4." }, 400, origin);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const previous = await env.DB.prepare("SELECT payload FROM learning_state WHERE user_id=?").bind(user.id).first();
    if (previous) await env.DB.prepare("INSERT INTO learning_state_history(user_id,payload,saved_at) VALUES(?,?,?)").bind(user.id, previous.payload, now).run();
    await env.DB.prepare("INSERT INTO learning_state(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(user.id, JSON.stringify(body.data), now).run();
    await syncLearningProjection(env.DB, user.id, body.data, now);
    await env.DB.prepare("DELETE FROM learning_state_history WHERE user_id=? AND id NOT IN (SELECT id FROM learning_state_history WHERE user_id=? ORDER BY id DESC LIMIT 20)").bind(user.id, user.id).run();
    return json({ ok: true, updatedAt: now }, 200, origin);
  } catch (cause) {
    const requestId = randomHex(8), cors = requestOrigin(request, env.ALLOWED_ORIGIN, env.ENVIRONMENT);
    if (cause instanceof RequestError) return json({ error: cause.message, requestId }, cause.status, cors.responseOrigin, cause.retryAfter ? { "Retry-After": String(cause.retryAfter) } : {});
    console.error(JSON.stringify({ message: "request failed", requestId, path: new URL(request.url).pathname, error: cause instanceof Error ? cause.message : String(cause) }));
    return json({ error: "\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", requestId }, 500, cors.responseOrigin);
  }
} };
export {
  StudyRoomDurableObject,
  index_default as default
};
//# sourceMappingURL=index.js.map
