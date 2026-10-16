import React, { useState } from 'react'
import {
  Award,
  Flame,
  Target,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Hand,
  Trash2,
  Info
} from 'lucide-react'
import { getProgressSummary, clearProgress, MASTERY_THRESHOLD } from '../services/progressStore'
import { ISL_VOCABULARY_LEXICON } from '../services/islDictionary'
import { COACHABLE_SIGN_IDS } from '../services/islClassifier'

const lexiconById = new Map(ISL_VOCABULARY_LEXICON.map((item) => [item.id, item]))

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`
  return `${(minutes / 60).toFixed(1)} hrs`
}

function formatRelativeDay(timestamp) {
  const days = Math.floor((Date.now() - timestamp) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default function ProgressPage({ onNavigate }) {
  const [summary, setSummary] = useState(() => getProgressSummary())

  const handleClear = () => {
    if (window.confirm('Delete all practice history stored on this device?')) {
      clearProgress()
      setSummary(getProgressSummary())
    }
  }

  const stats = [
    {
      title: 'Signs Practised',
      value: `${summary.signs.length}`,
      subtitle: `Out of ${COACHABLE_SIGN_IDS.length} with live scoring`,
      icon: BookOpen
    },
    {
      title: 'Average Best Score',
      value: summary.hasData ? `${summary.averageBestSimilarity}%` : '—',
      subtitle: 'Gesture similarity, not certified accuracy',
      icon: Target
    },
    {
      title: 'Practice Streak',
      value: `${summary.streakDays} ${summary.streakDays === 1 ? 'Day' : 'Days'}`,
      subtitle: summary.streakDays > 0 ? 'Keep it going! 🔥' : 'Practise today to start one',
      icon: Flame
    },
    {
      title: 'Practice Time',
      value: formatMinutes(summary.totalPracticeMinutes),
      subtitle: `${summary.sessionCount} ${summary.sessionCount === 1 ? 'session' : 'sessions'} total`,
      icon: Clock
    }
  ]

  const milestones = [
    { title: 'First Practice Session', achieved: summary.sessionCount >= 1, progress: `${Math.min(summary.sessionCount, 1)}/1`, icon: '🌱' },
    { title: '3-Day Practice Streak', achieved: summary.streakDays >= 3, progress: `${Math.min(summary.streakDays, 3)}/3 days`, icon: '🔥' },
    { title: `5 Signs at ${MASTERY_THRESHOLD}%+`, achieved: summary.strongSigns.length >= 5, progress: `${Math.min(summary.strongSigns.length, 5)}/5 signs`, icon: '🌟' },
    { title: 'All Coached Signs Practised', achieved: summary.signs.length >= COACHABLE_SIGN_IDS.length, progress: `${summary.signs.length}/${COACHABLE_SIGN_IDS.length} signs`, icon: '💬' }
  ]

  const renderSignName = (signId) => lexiconById.get(signId)?.label || signId

  return (
    <div className="pt-6 lg:pt-10 pb-24 lg:pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-mudra-lavender-200/60">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mudra-lavender-100 text-mudra-lavender-700 text-xs font-bold font-mono mb-1">
            <Award className="w-3.5 h-3.5 text-mudra-lavender-600" />
            <span>STUDENT MASTERY DASHBOARD</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-mudra-indigo-900">
            Your ISL Learning Journey
          </h1>
          <p className="text-sm text-mudra-indigo-600 mt-1">
            Built only from your own practice sessions, stored privately on this device.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('practice')}
          className="btn-primary py-2.5 px-5 text-xs font-bold"
        >
          <span>{summary.hasData ? 'Continue Daily Practice' : 'Start Your First Practice'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {!summary.hasData && (
        <div className="glass-card rounded-3xl p-6 border border-white shadow-sm flex items-start gap-3">
          <Info className="w-5 h-5 text-mudra-lavender-600 shrink-0 mt-0.5" />
          <p className="text-sm text-mudra-indigo-700">
            No practice recorded yet. Open the Practice Studio, start the camera and hold a sign — each session
            (at least half a second of tracked hand) is saved here automatically.
          </p>
        </div>
      )}

      {/* Key Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((item, idx) => {
          const Icon = item.icon
          return (
            <div
              key={idx}
              className="glass-card rounded-3xl p-5 sm:p-6 border border-white shadow-sm hover:shadow-md transition-all space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-mudra-indigo-500 font-display">
                  {item.title}
                </span>
                <div className="w-8 h-8 rounded-xl bg-mudra-lavender-100 flex items-center justify-center text-mudra-lavender-700">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="font-display font-extrabold text-2xl sm:text-3xl text-mudra-indigo-950">
                {item.value}
              </div>
              <div className="text-[11px] text-mudra-indigo-500 font-medium">
                {item.subtitle}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mastery Breakdown: Strong Signs vs Needs Improvement */}
      {summary.hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Strong Signs */}
          <div className="lg:col-span-6 space-y-4">
            <div className="glass-card rounded-3xl p-6 border border-white shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-mudra-lavender-200/60">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-display font-bold text-lg text-mudra-indigo-900">
                    Strong Signs ({MASTERY_THRESHOLD}%+)
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  {summary.strongSigns.length} Strong
                </span>
              </div>

              <div className="space-y-3">
                {summary.strongSigns.length === 0 && (
                  <p className="text-xs text-mudra-indigo-500">No sign has reached {MASTERY_THRESHOLD}% yet.</p>
                )}
                {summary.strongSigns.map((s) => (
                  <div
                    key={s.signId}
                    className="p-3 rounded-2xl bg-white/80 border border-mudra-lavender-200 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Hand className="w-5 h-5 text-mudra-lavender-600" />
                      <div>
                        <div className="font-display font-bold text-sm text-mudra-indigo-950">{renderSignName(s.signId)}</div>
                        <div className="text-[10px] text-mudra-indigo-500 font-medium">
                          {s.sessions} {s.sessions === 1 ? 'session' : 'sessions'} · last {formatRelativeDay(s.lastAt)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-emerald-600">{s.bestSimilarity}%</div>
                      <div className="text-[10px] text-emerald-700 font-semibold">Best similarity</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Needs Improvement */}
          <div className="lg:col-span-6 space-y-4">
            <div className="glass-card rounded-3xl p-6 border border-white shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-mudra-lavender-200/60">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <h3 className="font-display font-bold text-lg text-mudra-indigo-900">
                    Needs Practice
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                  {summary.needsPracticeSigns.length} Targeted
                </span>
              </div>

              <div className="space-y-3">
                {summary.needsPracticeSigns.length === 0 && (
                  <p className="text-xs text-mudra-indigo-500">Every sign you practised is above {MASTERY_THRESHOLD}%.</p>
                )}
                {summary.needsPracticeSigns.map((s) => (
                  <div
                    key={s.signId}
                    className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-bold text-sm text-amber-700 shrink-0 w-10">{s.bestSimilarity}%</span>
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm text-mudra-indigo-950">{renderSignName(s.signId)}</div>
                        <div className="text-[11px] text-mudra-indigo-600 truncate">
                          {lexiconById.get(s.signId)?.handShapeDesc || 'Watch the avatar demonstration again'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('practice', s.signId)}
                      className="px-3 py-1 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-xs font-bold text-amber-900 shrink-0 transition-colors shadow-xs"
                    >
                      Drill Now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Achievement Milestones */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-mudra-lavender-200/60">
          <h3 className="font-display font-bold text-xl text-mudra-indigo-900">
            Milestones & Badges
          </h3>
          <span className="text-xs font-mono text-mudra-indigo-500">From your recorded sessions</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {milestones.map((m, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-2xl border transition-all ${
                m.achieved
                  ? 'bg-gradient-to-br from-mudra-lavender-50 to-white border-mudra-lavender-300 shadow-xs'
                  : 'bg-mudra-ivory-100/60 border-mudra-lavender-200/60 opacity-60'
              }`}
            >
              <div className="text-3xl mb-2">{m.icon}</div>
              <div className="font-display font-bold text-sm text-mudra-indigo-950 mb-1">{m.title}</div>
              <div className="text-[11px] text-mudra-indigo-500 font-medium">
                {m.achieved ? 'Achieved' : `In progress (${m.progress})`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {summary.hasData && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-mudra-indigo-500 hover:text-rose-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear practice history on this device</span>
          </button>
        </div>
      )}

    </div>
  )
}
