'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  ArrowLeft,
  Search,
  BookOpen,
  AlertCircle,
  Database,
  Cpu,
  Terminal,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface FAQItem {
  id: number;
  category: 'Ollama & SLM' | 'Validation & Gates' | 'Database & Prisma' | 'Browser & Frontend' | 'Autocoder UI & System';
  problem: string;
  solution: string;
}

const FAQS: FAQItem[] = [
  // 1. Ollama & SLM
  {
    id: 1,
    category: 'Ollama & SLM',
    problem: 'Ollama connection refused on localhost:11434.',
    solution: 'Verify that the Ollama service is running on your local machine. If running in a container, make sure the port mapping is set to 11434:11434 and OLLAMA_HOST is set to 0.0.0.0.'
  },
  {
    id: 2,
    category: 'Ollama & SLM',
    problem: 'Ollama is running but the requested model is not found.',
    solution: 'Run "ollama pull deepseek-v2:16b" or your selected model inside your terminal to download the weights locally before running the compilation pipeline.'
  },
  {
    id: 3,
    category: 'Ollama & SLM',
    problem: 'Quantization noise causes JSON parsing failures in output.',
    solution: 'Quantized local models (e.g. Q4_K_M) often fail to escape quotes. Switch to raw markdown block modes or use higher precision quantizations (e.g. Q8 or FP16) to improve formatting consistency.'
  },
  {
    id: 4,
    category: 'Ollama & SLM',
    problem: 'Model context window overflow (max tokens limit hit).',
    solution: 'This happens if your prompt or attached files are too large. Keep prompt attachments under 150KB and simplify the scope to stay within the model\'s context budget.'
  },
  {
    id: 5,
    category: 'Ollama & SLM',
    problem: 'Ollama offline mode operations.',
    solution: 'Autocoder works 100% offline once the Ollama model is downloaded. Set OLLAMA_NOPRUNE=1 to prevent garbage collection of inactive local weights.'
  },
  {
    id: 6,
    category: 'Ollama & SLM',
    problem: 'API key validation failure in science plug-ins.',
    solution: 'Verify your environment variables file (.env) contains the appropriate keys. Read the global credentials skill config for the correct verification format.'
  },
  {
    id: 7,
    category: 'Ollama & SLM',
    problem: 'Local GPU out-of-memory (OOM) during Coder run.',
    solution: 'Reduce the context sizes of Ollama, unload other active models, or run the model with fewer layers offloaded to the GPU using a customized Modelfile.'
  },
  {
    id: 8,
    category: 'Ollama & SLM',
    problem: 'CPU fallback mode causing massive response timeouts.',
    solution: 'If your computer lacks a compatible GPU, the model falls back to CPU compilation. Increase the Coder agent timeout cap inside the token-budgeter file to allow slower generations.'
  },
  {
    id: 9,
    category: 'Ollama & SLM',
    problem: 'Request socket dropped before inference ends.',
    solution: 'Local Ollama requests might drop due to server thread timeouts. Verify that your system limits permit long-running TCP sockets and increase the proxy keep-alive timeout.'
  },
  {
    id: 10,
    category: 'Ollama & SLM',
    problem: 'Model selection dropdown is empty.',
    solution: 'Ensure the local Ollama API is reachable. Autocoder calls "http://localhost:11434/api/tags" to list models. If CORS is blocked, start Ollama with OLLAMA_ORIGINS="*" environment variable.'
  },
  // 2. Validation & Gates
  {
    id: 11,
    category: 'Validation & Gates',
    problem: 'Missing required field: agentInstructions validation error.',
    solution: 'Ensure the LLM includes all root-level keys requested by the Queen schema. Retrying the run with validation feedback will feed the error logs to the model to self-correct.'
  },
  {
    id: 12,
    category: 'Validation & Gates',
    problem: 'Missing required field: contextType on Designer stage.',
    solution: 'The Designer schema is large and local models can drift. Use prompt layouts with structural JSON skeletons to anchor model output expectations.'
  },
  {
    id: 13,
    category: 'Validation & Gates',
    problem: 'Missing required field: modules on Architect stage.',
    solution: 'The Architect must group files into logical modules. Provide clear naming guidelines in your prompt to prevent the model from leaving the module list empty.'
  },
  {
    id: 14,
    category: 'Validation & Gates',
    problem: 'Pipeline stuck at Approval Gate (Awaiting Review).',
    solution: 'This is expected behavior. The pipeline pauses after the Architect stage to let you review specs. Click "Approve & Generate" to advance the pipeline to the next stage.'
  },
  {
    id: 15,
    category: 'Validation & Gates',
    problem: 'Schema Validation Error: missing fields in System API routes.',
    solution: 'Check that every designed endpoint maps to a feature ID and matches the System schema contract exactly.'
  },
  {
    id: 16,
    category: 'Validation & Gates',
    problem: 'Standard agent loop failing all 3 attempts.',
    solution: 'If the agent fails schema checks 3 times in a row, the pipeline halts. Review the validation error in the logs, adjust your prompt, and run the pipeline again.'
  },
  {
    id: 17,
    category: 'Validation & Gates',
    problem: 'Reject & Edit loop keeps repeating.',
    solution: 'If you reject the specs, clarify your instructions in the prompt. Avoid contradictory statements (e.g. asking for React and Python backend in a buildless static page).'
  },
  {
    id: 18,
    category: 'Validation & Gates',
    problem: 'Queen pre-flight checks rejecting non-software input.',
    solution: 'Autocoder includes a software classifier check. If your input does not contain programming context, it is rejected. Rephrase your request to describe the software utility you want to compile.'
  },
  {
    id: 19,
    category: 'Validation & Gates',
    problem: 'Incorrect contextType value ("canonical" const check fails).',
    solution: 'The schema enforces `"contextType": "canonical"`. Ensure the model matches this const value. Our updated validation loops feed this exact failure back to the model on retries.'
  },
  {
    id: 20,
    category: 'Validation & Gates',
    problem: 'Invalidation flags not clearing between stages.',
    solution: 'Ensure the StageLedger memory is cleaned properly during pipeline restarts. Wiping the database using the Clear History button will resolve state lockups.'
  },
  // 3. Database & Prisma
  {
    id: 21,
    category: 'Database & Prisma',
    problem: 'Prisma SQLite database file lock conflicts.',
    solution: 'SQLite permits only one writer process at a time. Ensure you don\'t run multiple concurrent migrations or parallel database updates on the sqlite file.'
  },
  {
    id: 22,
    category: 'Database & Prisma',
    problem: 'Prisma client initialization better-sqlite3 adapter error.',
    solution: 'The sqlite driver adapter in Next.js requires passing the adapter instance: "new PrismaClient({ adapter })". Check db.ts for correct initialization syntax.'
  },
  {
    id: 23,
    category: 'Database & Prisma',
    problem: 'Database entity purpose field empty validation crash.',
    solution: 'Every designed database table must have a non-empty purpose explaining its business requirement. The System agent must satisfy this schema rule.'
  },
  {
    id: 24,
    category: 'Database & Prisma',
    problem: 'Database migration sync fails on run startup.',
    solution: 'Run "npx prisma db push" to manually align the SQLite database schema with your schema.prisma file if automatic sync triggers are blocked.'
  },
  {
    id: 25,
    category: 'Database & Prisma',
    problem: 'Foreign keys not resolving in SQLite schemas.',
    solution: 'SQLite enforces foreign key checks only if enabled. Ensure the connection URL or adapter has foreign key constraint options activated.'
  },
  {
    id: 26,
    category: 'Database & Prisma',
    problem: 'SQLite schema parsing crash in System agent.',
    solution: 'If the SQL schema is malformed, System parsing crashes. Attach clean, standard SQL schemas using the Connect Database Schema dashboard button.'
  },
  {
    id: 27,
    category: 'Database & Prisma',
    problem: 'Prisma generated client type-import not found.',
    solution: 'Run "npx prisma generate" in your project directory to rebuild the local type declarations for the database client.'
  },
  {
    id: 28,
    category: 'Database & Prisma',
    problem: 'Primary keys missing in database blueprint design.',
    solution: 'Ensure every planned database entity has an explicit primary key defined (e.g. id field) to comply with data schema specifications.'
  },
  {
    id: 29,
    category: 'Database & Prisma',
    problem: 'Database schema upload warning (>150KB size cap).',
    solution: 'Autocoder blocks uploads larger than 150KB to protect the model\'s context budget. Strip comments and index definitions to reduce file size.'
  },
  {
    id: 30,
    category: 'Database & Prisma',
    problem: 'Prisma mock data seed scripts crash on runtime.',
    solution: 'Verify that the seed script variables match database field types. Use SQLite compatible formats (e.g. ISO date strings instead of raw Date objects).'
  },
  // 4. Browser & Frontend
  {
    id: 31,
    category: 'Browser & Frontend',
    problem: 'Bare imports (TypeError: Failed to resolve module specifier).',
    solution: 'In buildless frontends, you cannot use "import React from \'react\'". Load dependencies via script tags and access APIs via window object (e.g. window.React).'
  },
  {
    id: 32,
    category: 'Browser & Frontend',
    problem: 'Browser rendering Index listing instead of index.html.',
    solution: 'This occurs if there is no index.html at the project root. Ensure the Coder outputs an index.html file to serve as the application entrance.'
  },
  {
    id: 33,
    category: 'Browser & Frontend',
    problem: 'TSX/JSX file throws syntax error natively.',
    solution: 'Browsers cannot run JSX natively. Wrap script tags as <script type="text/babel"> to let Babel-standalone transpile JSX elements client-side.'
  },
  {
    id: 34,
    category: 'Browser & Frontend',
    problem: 'Babel standalone script async compilation race conditions.',
    solution: 'When loading multiple external scripts, load order can vary. Compile all code inside a single unified index.html file to enforce synchronous execution.'
  },
  {
    id: 35,
    category: 'Browser & Frontend',
    problem: 'styled-components import crashes browser.',
    solution: 'In buildless HTML, load styled-components from CDN (e.g. unpkg) and use window.styled instead of ESM imports.'
  },
  {
    id: 36,
    category: 'Browser & Frontend',
    problem: 'Tailwind CSS play CDN style delays on initial load.',
    solution: 'The Tailwind Play CDN injects styles dynamically. To avoid Flash of Unstyled Content (FOUC), wrap your main body in a hidden class and display it after script load.'
  },
  {
    id: 37,
    category: 'Browser & Frontend',
    problem: 'React hydration mismatch in server-side pages.',
    solution: 'Ensure HTML structures are clean (e.g. no nested p tags) and that client-side dynamic values (like random numbers) are generated inside useEffect.'
  },
  {
    id: 38,
    category: 'Browser & Frontend',
    problem: 'CORS blocks external assets or data.',
    solution: 'Browsers block cross-origin requests. Configure your server to return appropriate Access-Control-Allow-Origin headers or fetch data through local api proxies.'
  },
  {
    id: 39,
    category: 'Browser & Frontend',
    problem: 'Localhost port 8080 already in use by another task.',
    solution: 'Check for active processes running on port 8080 and terminate them. Run "fuser -k 8080/tcp" on Linux or kill the process in Task Manager on Windows.'
  },
  {
    id: 40,
    category: 'Browser & Frontend',
    problem: 'Client routing fails on direct page refreshes.',
    solution: 'Use hash-based routing (e.g. #/dashboard) or configure your fallback server to redirect all non-API GET requests to index.html.'
  },
  // 5. Autocoder UI & System
  {
    id: 41,
    category: 'Autocoder UI & System',
    problem: 'Clear history button fails to delete folders on disk.',
    solution: 'Verify that the Node.js process has write permissions for the "projects/" directory. On Linux, run "chmod -R 755 projects/" if permission errors occur.'
  },
  {
    id: 42,
    category: 'Autocoder UI & System',
    problem: 'Flowchart diagram fails to render component boxes.',
    solution: 'The Flowchart parser reads the modules JSON structure. If the Designer output is missing pageIds or component linkages, the flowchart remains empty.'
  },
  {
    id: 43,
    category: 'Autocoder UI & System',
    problem: 'Telemetry page charts showing empty logs.',
    solution: 'Telemetry logs are recorded during compiler steps. Ensure you connect to the SQLite DB correctly. Check db.ts to verify the client is connected.'
  },
  {
    id: 44,
    category: 'Autocoder UI & System',
    problem: 'Disk space filled up recursively by generated directories.',
    solution: 'Every compilation generates file directories. Use the "Clear All History" button in the dashboard to purge DB records and delete unused project directories.'
  },
  {
    id: 45,
    category: 'Autocoder UI & System',
    problem: 'Support button points to settings instead of help page.',
    solution: 'This is a navigation routing issue. Update Sidebar.tsx to point to /support route.'
  },
  {
    id: 46,
    category: 'Autocoder UI & System',
    problem: 'Workspace SSE stream disconnects on refresh.',
    solution: 'Refreshes close active SSE streams. Click the Run button or let the compiler resume from the halted stage. Telemetry logs will sync back on reconnect.'
  },
  {
    id: 47,
    category: 'Autocoder UI & System',
    problem: 'Health check status shows Ollama offline when it is on.',
    solution: 'Ensure that the fetch call to localhost:11434 uses the correct protocol (http) and port, and check your firewall settings.'
  },
  {
    id: 48,
    category: 'Autocoder UI & System',
    problem: 'New project input textbox is greyed out.',
    solution: 'The prompt textbox is disabled if Ollama is not connected. Make sure the health check indicator is green (Connected) before typing.'
  },
  {
    id: 49,
    category: 'Autocoder UI & System',
    problem: 'Custom files fail to attach.',
    solution: 'Enforce plain-text files and check size limit guides. Clear existing attachments by clicking "x" on the badge and try uploading again.'
  },
  {
    id: 50,
    category: 'Autocoder UI & System',
    problem: 'Telemetry download button throws database read error.',
    solution: 'Ensure the SQLite database server has read permission on the sqlite schema file. Wiping history will clear locks.'
  }
];

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const categories = ['All', 'Ollama & SLM', 'Validation & Gates', 'Database & Prisma', 'Browser & Frontend', 'Autocoder UI & System'];

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesSearch =
      faq.problem.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.solution.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Ollama & SLM': return Cpu;
      case 'Validation & Gates': return Layers;
      case 'Database & Prisma': return Database;
      case 'Browser & Frontend': return BookOpen;
      default: return Activity;
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-slate-950 text-on-surface font-sans relative overflow-hidden h-full">
      {/* Background glow effects */}
      <div className="absolute top-12 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-12 right-1/4 w-[500px] h-[500px] bg-purple-500/5 blur-[150px] rounded-full pointer-events-none z-0" />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/30 backdrop-blur-md px-6 py-4 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-all text-slate-400 hover:text-on-surface flex items-center justify-center hover:scale-105"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-electric-indigo animate-pulse" />
            <h1 className="text-md font-bold tracking-tight bg-gradient-to-r from-on-surface to-slate-400 bg-clip-text text-transparent">
              Autocoder Support Console
            </h1>
          </div>
        </div>
      </header>

      {/* Scrollable Container (no max-width constraints to let scrollbar flush on the right window edge) */}
      <div className="flex-1 w-full p-8 md:p-12 flex flex-col gap-6 overflow-y-auto z-10 relative">
        {/* Intro Banner */}
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl backdrop-blur-md flex flex-col md:flex-row justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-on-surface">Troubleshooting & Support</h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Search compiled list of solutions for Ollama model dropouts, schema validation crashes, Prisma database states, and buildless browser runtime exceptions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-slate-950 border border-slate-850 px-4 py-3 rounded-xl flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Knowledge Base</span>
              <span className="text-sm font-bold text-electric-indigo">50 Verified Fixed Cases</span>
            </div>
          </div>
        </div>

        {/* Search Bar section */}
        <div className="relative z-10 flex items-center bg-slate-900/60 border border-slate-800 focus-within:border-electric-indigo/80 focus-within:ring-2 focus-within:ring-electric-indigo/10 rounded-xl px-4 py-3.5 shadow-2xl transition-all">
          <Search className="w-5 h-5 text-slate-500 mr-3 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search 50+ common problems, error messages, and compilation fixes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-on-surface text-sm placeholder-slate-500 focus:outline-none focus:ring-0 w-full"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 z-10">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all duration-300 ${
                activeCategory === category
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                  : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* FAQs List Area */}
        <div className="flex-1 flex flex-col gap-3 relative z-10">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => {
              const Icon = getCategoryIcon(faq.category);
              const isOpen = expandedId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`bg-slate-900/20 backdrop-blur-sm border rounded-xl transition-all duration-300 shadow-xl ${
                    isOpen ? 'border-indigo-500/40 bg-slate-900/30' : 'border-slate-800/80 hover:border-slate-750 hover:bg-slate-900/40'
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(faq.id)}
                    className="w-full text-left px-5 py-4.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg flex-shrink-0 transition-all duration-300 ${
                        isOpen ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-850 border border-slate-800 text-slate-400'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wide mr-2">
                          #{faq.id}
                        </span>
                        <h3 className="inline text-xs font-bold text-on-surface leading-tight">
                          {faq.problem}
                        </h3>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-3 border-t border-slate-800/50 bg-slate-950/40 rounded-b-xl animate-slide-up">
                      <div className="flex gap-2.5 items-start">
                        <AlertCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider font-mono">
                            Solution:
                          </h4>
                          <p className="text-xs text-slate-300 mt-1.5 leading-relaxed whitespace-pre-wrap">
                            {faq.solution}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
              <Terminal className="w-8 h-8 text-slate-600 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-slate-400">No matching troubleshooting guides found</p>
                <p className="text-xs text-slate-600 mt-1">Try refining your search terms or selecting another category.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
