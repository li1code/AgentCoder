'use client';

import React, { Suspense } from 'react';
import WorkspaceContent from './WorkspaceContent';

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-6 text-xs text-slate-500 font-mono bg-slate-950 flex items-center justify-center">
          <span className="animate-pulse">Loading workspace dependencies...</span>
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
