'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ArrowLeft,
  Play,
  CheckCircle,
  Code2,
  Trash2,
  AlertTriangle,
  FolderOpen,
  Layers,
  Terminal,
  Activity,
  Compass,
  ArrowRight,
} from 'lucide-react';

const DOC_SECTIONS = [
  {
    id: 'workspace-guide',
    title: 'Workspace Guide',
    icon: Play,
    description: 'Learn how to navigate and manage your workspace from prompt submission to code execution.',
    badge: 'Getting Started',
    content: (
      <div className="space-y-6">
        <p className="text-sm text-slate-300 leading-relaxed">
          The Workspace is your main control console. Follow these steps to generate and inspect your full-stack applications:
        </p>
        
        <div className="relative border border-slate-800 bg-slate-950/60 backdrop-blur rounded-xl p-5 shadow-2xl flex gap-4 items-start group hover:border-indigo-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-[20px] rounded-full pointer-events-none"></div>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono text-sm font-bold flex-shrink-0">
            01
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">Starting a Project</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter a mandatory, descriptive name for your application. Autocoder automatically appends a unique ISO timestamp next to your title. This makes it easy to segregate your logs and files in subsequent builds.
            </p>
          </div>
        </div>

        <div className="relative border border-slate-800 bg-slate-950/60 backdrop-blur rounded-xl p-5 shadow-2xl flex gap-4 items-start group hover:border-indigo-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-[20px] rounded-full pointer-events-none"></div>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono text-sm font-bold flex-shrink-0">
            02
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">Writing Prompts</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Describe your application goals clearly (e.g. <span className="text-slate-300 italic font-mono bg-slate-900 px-1 rounded">"A fitness dashboard to log workouts"</span>). If your prompt is too vague, the system will pause and ask you exactly three clarification questions to refine the project requirements before starting.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'reviewing-specs',
    title: 'Reviewing Specifications',
    icon: Layers,
    description: 'How to verify system requirements, DB schemas, and UI design layers before coding starts.',
    badge: 'Spec Viewer',
    content: (
      <div className="space-y-6">
        <p className="text-sm text-slate-300 leading-relaxed">
          Autocoder compiles requirements step-by-step. Use the tabs at the top of your workspace to review specification sheets as they arrive:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: 'Planner Tab',
              desc: 'Review the canonical terms glossary, feature checklists, and user boundary constraints. Verify that all rules match your expected logic.',
              accent: 'border-indigo-500/20 hover:border-indigo-500/40',
              iconColor: 'text-indigo-400 bg-indigo-500/10',
            },
            {
              title: 'System Tab',
              desc: 'Inspect database tables, entity relationships, fields, and request/response API endpoints designed for the backend.',
              accent: 'border-cyan-500/20 hover:border-cyan-500/40',
              iconColor: 'text-cyan-400 bg-cyan-500/10',
            },
            {
              title: 'Designer Tab',
              desc: 'Check front-end navigation routes, UI styling tokens (colors, typography), and components props definitions.',
              accent: 'border-emerald-500/20 hover:border-emerald-500/40',
              iconColor: 'text-emerald-400 bg-emerald-500/10',
            },
            {
              title: 'Flowchart Tab',
              desc: 'Inspect the visual workflow diagram showing component structures, backend routing keys, and DB layout connections.',
              accent: 'border-purple-500/20 hover:border-purple-500/40',
              iconColor: 'text-purple-400 bg-purple-500/10',
            },
          ].map((card, idx) => (
            <div
              key={idx}
              className={`bg-slate-900/40 border ${card.accent} p-4 rounded-xl shadow-lg flex flex-col gap-2 transition-all duration-300 hover:shadow-indigo-500/5 group`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface font-mono">{card.title}</span>
                <span className={`w-2 h-2 rounded-full ${card.iconColor.split(' ')[0]}`} />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'milestone-approvals',
    title: 'Approvals & Gate Controls',
    icon: CheckCircle,
    description: 'Approving compiled blueprints or rejecting them to make edits.',
    badge: 'Gate Operations',
    content: (
      <div className="space-y-6">
        <p className="text-sm text-slate-300 leading-relaxed">
          To ensure code matches your exact design specifications, compilation automatically pauses at key gates:
        </p>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 bg-gradient-to-br from-indigo-950/20 to-slate-900 border border-indigo-500/20 p-5 rounded-2xl shadow-xl flex flex-col gap-3 group hover:border-indigo-500/40 transition-all">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h5 className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">Approve &amp; Generate</h5>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                Once you review the compiled architecture blueprints, click the <strong>Approve &amp; Generate</strong> button. This transitions the pipeline status to <strong>Active</strong> and starts database scaffoldings and source code synthesis.
              </p>
            </div>
          </div>

          <div className="flex-1 bg-gradient-to-br from-amber-950/10 to-slate-900 border border-amber-500/20 p-5 rounded-2xl shadow-xl flex flex-col gap-3 group hover:border-amber-500/40 transition-all">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">Reject &amp; Edit</h5>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                If you identify layout errors or wrong route paths during your review, click <strong>Reject &amp; Edit</strong>. This returns you to the prompt configuration menu so you can specify modifications and compile again.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'inspecting-code',
    title: 'Inspecting Source Code',
    icon: Code2,
    description: 'How to browse, verify, and clean up generated source files.',
    badge: 'Code Explorer',
    content: (
      <div className="space-y-6">
        <p className="text-sm text-slate-300 leading-relaxed">
          After the synthesis pipeline completes successfully:
        </p>
        
        <div className="border border-slate-800 bg-slate-900/40 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-on-surface">Browsing Files</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                A complete workspace folder tree displays in the sidebar. Click on any file (such as page components <code>.tsx</code> or API controllers <code>.ts</code>) to view the generated code directly in the code viewer.
              </p>
            </div>
          </div>
          
          <div className="border-t border-slate-800/80 my-4" />

          <div className="flex items-start gap-4">
            <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-on-surface">Deleting Projects</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                To clean up your workspace and free up disk space, navigate to the landing page history list. Click the <strong>Trash</strong> icon next to a project. This cascade-deletes its history and database logs, and recursively removes the generated files directory from your disk.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'input-samples',
    title: 'Input Attachment Samples',
    icon: Compass,
    description: 'Reference templates for attaching custom architecture diagrams and database schemas.',
    badge: 'Templates',
    content: (
      <div className="space-y-6">
        <p className="text-sm text-slate-300 leading-relaxed">
          Use these templates as a guide when attaching custom specifications to direct the compiler.
        </p>

        <div className="grid grid-cols-1 gap-6">
          <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">1. Architecture Specification Template</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Save your folder structure and component relationships as a text file (e.g. <code>architecture.txt</code>) and upload it via the Paperclip icon:
            </p>
            <pre className="bg-slate-950 border border-slate-900 rounded-lg p-4 text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre">
{`Project: Fitness Tracker App
Architecture Style: Clean Separation of Concerns

Folder Structure:
- src/components/     # Reusable layout elements and forms
- src/pages/          # Main page views
- src/lib/db.ts       # Database Connection Client

Component Relationships:
1. DashboardPage renders Component-DashboardCard and Component-ProgressChart.
2. HistoryLogPage renders Component-HistoryLogTable.`}
            </pre>
          </div>

          <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-5 shadow-xl space-y-3">
            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">2. Database Schema Template</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Attach a standard SQL structure file (e.g. <code>schema.sql</code>) via the Database icon to enforce strict field and data constraints:
            </p>
            <pre className="bg-slate-950 border border-slate-900 rounded-lg p-4 text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre">
{`CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  exercise TEXT NOT NULL,
  duration_minutes INTEGER,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`}
            </pre>
          </div>
        </div>
      </div>
    ),
  },
];

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState('workspace-guide');

  const activeSection = DOC_SECTIONS.find((s) => s.id === activeTab) || DOC_SECTIONS[0];
  const ActiveIcon = activeSection.icon;

  return (
    <main className="min-h-screen bg-slate-950 text-on-surface flex flex-col font-sans bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/30">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-slate-400 hover:text-on-surface flex items-center justify-center hover:scale-105"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-electric-indigo animate-pulse" />
            <h1 className="text-md font-bold tracking-tight bg-gradient-to-r from-on-surface to-slate-400 bg-clip-text text-transparent">Autocoder Guidebook</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-indigo-400">v2.0.0</span>
          <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold font-mono hidden sm:inline">User Manual</span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row p-6 gap-6">
        {/* Left Navigation */}
        <aside className="w-full md:w-64 flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 mb-2">
            <Compass className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Navigation</h3>
          </div>
          <nav className="flex flex-col gap-1.5">
            {DOC_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeTab === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveTab(section.id)}
                  className={`w-full text-left flex items-center justify-between px-3 py-3 rounded-xl text-xs font-semibold transition-all duration-300 relative group border ${
                    isActive
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                      : 'border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <span>{section.title}</span>
                  </div>
                  {isActive && <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content View Area */}
        <section className="flex-1 bg-slate-900/30 border border-slate-800/80 backdrop-blur-sm rounded-2xl p-6 flex flex-col gap-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none"></div>
          
          <div className="flex items-center justify-between border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                <ActiveIcon className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-md font-bold text-on-surface tracking-tight">{activeSection.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{activeSection.description}</p>
              </div>
            </div>
            <span className="hidden sm:inline px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase">
              {activeSection.badge}
            </span>
          </div>

          <div className="flex-1 min-h-[300px]">
            {activeSection.content}
          </div>
        </section>
      </div>
    </main>
  );
}
