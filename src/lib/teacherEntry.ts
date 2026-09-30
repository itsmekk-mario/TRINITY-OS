export function teacherEntry(role: string) {
 if (role === 'academic_manager') return {key:'trinity-collab:academic_manager',portal:'manager',role};
 if (role === 'subject_teacher') return {key:'trinity-collab:subject_teacher',portal:'teacher',role};
 throw new Error('교사 계정의 역할을 확인할 수 없습니다.');
}
