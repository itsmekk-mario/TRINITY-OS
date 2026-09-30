import { useEffect, useState } from 'react';
import type { AppData } from '../types';
import HubLayout from '../components/navigation/HubLayout';
import SegmentedControl from '../components/navigation/SegmentedControl';
import QuickCaptureSheet from '../components/learning/QuickCaptureSheet';
import UnifiedReviewQueue from '../components/learning/UnifiedReviewQueue';
import { WrongAnswers } from './TrainHub';
import LearningArchive from './LearningArchive';

export type ReviewView = 'wrong' | 'queue' | 'archive' | 'rules';
const tabs = [{ id: 'wrong', label: 'Wrong Answer' }, { id: 'queue', label: 'Review Queue' }, { id: 'archive', label: 'Learning Archive' }, { id: 'rules', label: 'Core Rule' }] as const;

export default function ReviewHub({ data, update, view, onView, navigate, beginnerMode }: {
  data: AppData;
  update: (fn: (value: AppData) => AppData) => void;
  view: ReviewView;
  onView: (view: ReviewView) => void;
  navigate: (target: string) => void;
  beginnerMode: boolean;
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => { if (beginnerMode && !showAdvanced && (view === 'archive' || view === 'rules')) onView('queue'); }, [beginnerMode, showAdvanced, view, onView]);
  const visibleTabs = beginnerMode && !showAdvanced ? tabs.slice(0, 2) : tabs;
  return <><HubLayout eyebrow="REVIEW" title="틀린 것을 다시 풀고 지식으로 남깁니다" description="오답 → 재도전 → Learning Archive → Core Rule 순서로 기록을 연결합니다." controls={<><SegmentedControl label="Review 화면" options={visibleTabs} value={view} onChange={onView} />{beginnerMode && <button className="text-button review-advanced-toggle" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? '기본 도구만 보기' : 'Archive · Core Rule 보기'}</button>}</>}>
    {view === 'wrong' ? <WrongAnswers data={data} edit={() => navigate('study:drill')} quick={() => setQuickOpen(true)} /> : view === 'queue' ? <UnifiedReviewQueue /> : <LearningArchive key={view} data={data} update={update} onNavigate={navigate} initialView={view === 'rules' ? 'rules' : 'archive'} embedded />}
  </HubLayout><QuickCaptureSheet open={quickOpen} data={data} update={update} onClose={() => setQuickOpen(false)} /></>;
}
