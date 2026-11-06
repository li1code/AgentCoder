'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Cloud,
  Server,
  Cpu,
  ShieldCheck,
  Terminal,
  Copy,
  Check,
  ArrowLeft,
  ExternalLink,
  Layers,
  Sparkles,
  AlertCircle,
  Database,
  Box,
  Key,
  RefreshCw,
} from 'lucide-react';

export default function GCPHostingPage() {
  const [projectId, setProjectId] = useState('my-autocoder-gcp');
  const [region, setRegion] = useState('us-central1');
  const [vmName, setVmName] = useState('autocoder-host');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'architecture' | 'vm-setup' | 'vertex-ai' | 'docker-sandboxes' | 'teardown'>('architecture');

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const codeSnippets = {
    enableApis: `gcloud auth login
gcloud config set project "${projectId}"

# Enable Compute, Artifact Registry & Vertex AI APIs
gcloud services enable \\
    compute.googleapis.com \\
    artifactregistry.googleapis.com \\
    aiplatform.googleapis.com`,

    createIam: `# 1. Create a dedicated VM Service Account
gcloud iam service-accounts create autocoder-vm-sa \\
    --display-name="AutoCoder Execution Identity"

# 2. Grant Vertex AI User (Enables Gemini without manual API keys via ADC)
gcloud projects add-iam-policy-binding "${projectId}" \\
    --member="serviceAccount:autocoder-vm-sa@${projectId}.iam.gserviceaccount.com" \\
    --role="roles/aiplatform.user"

# 3. Grant Artifact Registry Reader (Enables pulling Docker images to VM)
gcloud projects add-iam-policy-binding "${projectId}" \\
    --member="serviceAccount:autocoder-vm-sa@${projectId}.iam.gserviceaccount.com" \\
    --role="roles/artifactregistry.reader"`,

    createArtifactRepo: `gcloud artifacts repositories create autocoder-docker \\
    --repository-format=docker \\
    --location="${region}" \\
    --description="AutoCoder Control Plane & Sandbox Worker Images"`,

    buildAndPush: `# Authenticate local Docker with GCP Artifact Registry
gcloud auth configure-docker "${region}-docker.pkg.dev"

# Tag & push images to Artifact Registry
docker tag autocoder-worker:latest \\
  "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-worker:latest"

docker tag autocoder-control-plane:latest \\
  "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-control-plane:latest"

docker push "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-worker:latest"
docker push "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-control-plane:latest"`,

    createVm: `# Create e2-standard-4 (4 vCPU, 16GB RAM) Ubuntu 24.04 VM with attached SA
gcloud compute instances create "${vmName}" \\
    --project="${projectId}" \\
    --zone="${region}-a" \\
    --machine-type="e2-standard-4" \\
    --image-family="ubuntu-2404-lts-amd64" \\
    --image-project="ubuntu-os-cloud" \\
    --boot-disk-size="100GB" \\
    --boot-disk-type="pd-balanced" \\
    --service-account="autocoder-vm-sa@${projectId}.iam.gserviceaccount.com" \\
    --scopes="cloud-platform" \\
    --tags="http-server,autocoder-server"

# Allow ingress to port 3000 (AutoCoder Web UI)
gcloud compute firewall-rules create "allow-autocoder-port-3000" \\
    --project="${projectId}" \\
    --direction=INGRESS \\
    --priority=1000 \\
    --network=default \\
    --action=ALLOW \\
    --rules=tcp:3000 \\
    --source-ranges="0.0.0.0/0" \\
    --target-tags="autocoder-server"`,

    vmStartup: `# SSH into the newly created instance
gcloud compute ssh "${vmName}" --zone="${region}-a"

# --- Run on the VM: Install Docker & Docker Compose ---
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# Configure Docker to pull from GCP Artifact Registry
gcloud auth configure-docker "${region}-docker.pkg.dev" --quiet

# Prepare persistent state directories
mkdir -p ~/autocoder/data/prisma ~/autocoder/data/projects
cd ~/autocoder

# Create production .env file
cat << 'EOF' > .env
NODE_ENV=production
PORT=3000
LLM_PROVIDER=vertex
VERTEX_PROJECT_ID=${projectId}
VERTEX_LOCATION=${region}
VERTEX_MODEL=gemini-1.5-pro
EXECUTION_BACKEND=docker
DOCKER_WORKER_IMAGE=autocoder-worker:latest
DOCKER_CPU_LIMIT=2
DOCKER_MEMORY_LIMIT=2g
DOCKER_PIDS_LIMIT=100
EOF

# Pull images
docker pull "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-worker:latest"
docker tag "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-worker:latest" autocoder-worker:latest

docker pull "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-control-plane:latest"
docker tag "${region}-docker.pkg.dev/${projectId}/autocoder-docker/autocoder-control-plane:latest" autocoder-control-plane:latest

# Create docker-compose.yml
cat << 'EOF' > docker-compose.yml
version: '3.8'
services:
  autocoder:
    image: autocoder-control-plane:latest
    container_name: autocoder-control-plane
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data/prisma:/app/prisma
      - ./data/projects:/app/projects
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

# Launch AutoCoder
docker compose up -d`,

    teardown: `# Option 1: Stop instance (pauses compute charges, preserves state)
gcloud compute instances stop "${vmName}" --zone="${region}-a"

# Option 2: Completely destroy trial resources (zero ongoing cost)
gcloud compute instances delete "${vmName}" --zone="${region}-a" --quiet
gcloud compute firewall-rules delete "allow-autocoder-port-3000" --quiet
gcloud artifacts repositories delete autocoder-docker --location="${region}" --quiet`,
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Banner Navigation */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/docs"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Docs
          </Link>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              GCP Deployment Guide
            </span>
            <span className="text-xs font-bold text-slate-200">Google Cloud Hosting &amp; Vertex AI</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Server className="w-3.5 h-3.5 text-indigo-400" /> Model Settings
          </Link>
        </div>
      </div>

      <div className="max-w-6xl w-full mx-auto p-6 md:p-8 space-y-8">
        {/* Header Hero */}
        <div className="relative border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/20 rounded-2xl p-6 md:p-8 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[90px] rounded-full pointer-events-none" />
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> Production GCP Adaptation
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              GCP Compute Engine Hosting &amp; Vertex AI Integration
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Complete guide to deploying AutoCoder on Google Cloud Platform with isolated StackBlitz-style Docker worker sandboxes and enterprise-grade Vertex AI Gemini models using Application Default Credentials (ADC).
            </p>

            {/* Interactive Configuration Parameters */}
            <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1">
                  Your GCP Project ID
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value.trim() || 'my-project-id')}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. my-project-id"
                />
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1">
                  Target GCP Region
                </label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value.trim() || 'us-central1')}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. us-central1"
                />
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-1">
                  Instance Name
                </label>
                <input
                  type="text"
                  value={vmName}
                  onChange={(e) => setVmName(e.target.value.trim() || 'autocoder-host')}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. autocoder-host"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
          {[
            { id: 'architecture', label: '1. Architecture & Security', icon: Layers },
            { id: 'vertex-ai', label: '2. Vertex AI & ADC Setup', icon: Sparkles },
            { id: 'vm-setup', label: '3. VM & Docker Deployment', icon: Server },
            { id: 'docker-sandboxes', label: '4. Sandbox Execution Model', icon: Box },
            { id: 'teardown', label: '5. Cost & Teardown', icon: RefreshCw },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 border-t-2 border-indigo-500 text-white border-x border-slate-800'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-slate-800 bg-slate-900/50 p-5 rounded-xl space-y-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                  <Cpu className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Next.js 16 Control Plane</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Runs the web interface, SSE telemetry streams, SQLite state database, and the 11 RuFlo autonomous agents.
                </p>
              </div>

              <div className="border border-slate-800 bg-slate-900/50 p-5 rounded-xl space-y-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                  <Box className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Docker Worker Sandbox</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  StackBlitz-style isolated workers. Each project session gets a dedicated container running npm install, typecheck, tests, and preview servers.
                </p>
              </div>

              <div className="border border-slate-800 bg-slate-900/50 p-5 rounded-xl space-y-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
                  <Cloud className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Vertex AI Gemini Models</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enables 1M+ token context windows for deep codebase synthesis via Application Default Credentials without hardcoded API keys.
                </p>
              </div>
            </div>

            <div className="border border-slate-800 bg-slate-900/40 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Security &amp; Isolation Guarantees
              </h3>
              <ul className="text-xs text-slate-300 space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Non-Root Worker Sandboxes</strong>: Worker containers execute under user <code>node</code> (UID 1000). Untrusted npm package postinstall scripts cannot compromise the host.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Zero Baked Secrets</strong>: No service account keys, passwords, or tokens are baked into images. Vertex AI authenticates via instance metadata.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Resource Boundaries</strong>: Each worker container is capped at 2 CPU cores, 2GB RAM, and 100 PIDs to protect the VM against fork bombs or memory leaks.</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'vertex-ai' && (
          <div className="space-y-6">
            <div className="border border-slate-800 bg-slate-900/50 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Why Vertex AI Replaces Local Ollama in Cloud Deployments
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Local Ollama runs are bounded by GPU VRAM (typically 32k or 64k tokens) and local batching constraints. Vertex AI provides <strong>1,000,000+ token context windows</strong> with Gemini 1.5 Pro and Gemini 2.0 Flash, high concurrency, and native JSON output schemas with sub-second time-to-first-token.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
                  Step 1: Enable APIs &amp; Create Least-Privilege IAM Service Account
                </h4>
                <button
                  onClick={() => copyToClipboard(codeSnippets.createIam, 1)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
                >
                  {copiedIndex === 1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIndex === 1 ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                {codeSnippets.createIam}
              </pre>
            </div>

            <div className="border border-indigo-500/20 bg-indigo-950/20 rounded-xl p-4 flex items-start gap-3">
              <Key className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed space-y-1">
                <div className="font-bold text-indigo-300 font-mono">Application Default Credentials (ADC) Active</div>
                <p>
                  Because the Compute Engine VM runs with the attached service account <code>autocoder-vm-sa</code>, the Vertex AI SDK automatically fetches temporary access tokens directly from the VM metadata server at <code>http://metadata.google.internal/</code>. You do <strong>NOT</strong> need to generate or mount a service account JSON file.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vm-setup' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
                  Step 1: Provision Compute Engine VM &amp; Firewall Rule
                </h4>
                <button
                  onClick={() => copyToClipboard(codeSnippets.createVm, 2)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
                >
                  {copiedIndex === 2 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIndex === 2 ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                {codeSnippets.createVm}
              </pre>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
                  Step 2: Build &amp; Push Images from Local Machine to Artifact Registry
                </h4>
                <button
                  onClick={() => copyToClipboard(codeSnippets.buildAndPush, 3)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
                >
                  {copiedIndex === 3 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIndex === 3 ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                {codeSnippets.buildAndPush}
              </pre>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
                  Step 3: SSH Into VM &amp; Launch AutoCoder with Docker Compose
                </h4>
                <button
                  onClick={() => copyToClipboard(codeSnippets.vmStartup, 4)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
                >
                  {copiedIndex === 4 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIndex === 4 ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                {codeSnippets.vmStartup}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'docker-sandboxes' && (
          <div className="space-y-6">
            <div className="border border-slate-800 bg-slate-900/50 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Box className="w-4 h-4 text-indigo-400" />
                How the StackBlitz-Style Docker Sandbox Operates
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                When an AutoCoder conversation starts, the engine executes all shell commands inside a dedicated container named <code>autocoder-worker-&lt;conversationId&gt;</code>:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="border border-slate-800 bg-slate-950/60 p-4 rounded-lg space-y-1">
                  <div className="text-xs font-bold text-indigo-300 font-mono">1. Workspace Binding</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    The control plane flushes the VFS to <code>projects/&lt;conversationId&gt;</code> on disk and bind-mounts it to <code>/workspace</code> inside the container.
                  </p>
                </div>

                <div className="border border-slate-800 bg-slate-950/60 p-4 rounded-lg space-y-1">
                  <div className="text-xs font-bold text-indigo-300 font-mono">2. Sandboxed Tools</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <code>npm_install</code>, <code>typecheck</code>, <code>build_project</code>, and <code>run_tests</code> are invoked via <code>docker exec</code> without host access.
                  </p>
                </div>

                <div className="border border-slate-800 bg-slate-950/60 p-4 rounded-lg space-y-1">
                  <div className="text-xs font-bold text-indigo-300 font-mono">3. State Survival in Repairs</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    The worker container remains warm during Coder &rarr; Tester &rarr; Debugger repair cycles so node_modules caches are retained.
                  </p>
                </div>

                <div className="border border-slate-800 bg-slate-950/60 p-4 rounded-lg space-y-1">
                  <div className="text-xs font-bold text-indigo-300 font-mono">4. Deterministic Cleanup</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    When the run finishes, errors out, or is cancelled, the container is forcibly removed with <code>docker rm -f</code> to prevent container leakage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'teardown' && (
          <div className="space-y-6">
            <div className="border border-amber-500/20 bg-amber-950/20 rounded-xl p-5 space-y-2">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Cost Management &amp; Resource Teardown
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                When you finish your evaluation trial, run these teardown commands to prevent ongoing compute charges against your GCP trial credits:
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Teardown Commands
                </h4>
                <button
                  onClick={() => copyToClipboard(codeSnippets.teardown, 5)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
                >
                  {copiedIndex === 5 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIndex === 5 ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                {codeSnippets.teardown}
              </pre>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
