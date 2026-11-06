# AutoCoder GCP Compute Engine & Docker Sandbox Deployment Guide

**Target System**: AutoCoder Multi-Agent Software Engineering Platform  
**Architecture Model**: Control Plane (Next.js 16) + StackBlitz-Style Isolated Docker Worker Sandboxes + Google Vertex AI Inference  
**Document Classification**: Operator Deployment Guide (Production & GCP Trial)  

---

## 1. System Inventory & Discovered Parameters

| Parameter | Discovered Technical Value | Notes |
| :--- | :--- | :--- |
| **Application Runtime** | Node.js 20 LTS (Next.js 16.2.10, Turbopack) | Native C++ bindings: `better-sqlite3` |
| **Startup Command** | `npm start` (or `next start`) | Production server |
| **Listening Port** | `3000` (`PORT=3000`, `HOSTNAME=0.0.0.0`) | Configured via env |
| **Health Endpoints** | `GET /api/health` and `GET /api/health/system` | Return model status, CPU, memory metrics |
| **Primary State DB** | SQLite via Prisma (`prisma/dev.db`) | Must reside on persistent storage |
| **Workspace Storage** | `projects/<conversationId>/` | Flushed from VFS via `flushVfsToDisk()` |
| **Control Image Name** | `autocoder-control-plane:latest` | Multi-stage production image |
| **Worker Image Name** | `autocoder-worker:latest` | Sandboxed runner (`Dockerfile.worker`) |
| **LLM Providers** | `vertex` (recommended for GCP), `ollama`, `openai` | Switched via `LLM_PROVIDER` |

---

## 2. Prerequisites & Operator Inputs

### Required Operator-Supplied Values
Before executing the deployment commands, define the following shell variables in your terminal:

```bash
# -----------------------------------------------------------------------------
# OPERATOR-SUPPLIED VARIABLES (Replace with your actual GCP details)
# -----------------------------------------------------------------------------
export GCP_PROJECT_ID="YOUR_GCP_PROJECT_ID"           # e.g., "my-autocoder-trial-2026"
export GCP_REGION="us-central1"                       # e.g., "us-central1"
export GCP_ZONE="us-central1-a"                       # e.g., "us-central1-a"
export VM_NAME="autocoder-host"                       # Compute Engine instance name
export VM_MACHINE_TYPE="e2-standard-4"                # 4 vCPU, 16 GB RAM (optimal for control + sandboxes)
export AR_REPO_NAME="autocoder-docker"                # Google Artifact Registry repository
export SA_NAME="autocoder-vm-sa"                      # Service Account name for Vertex AI ADC
```

---

## 3. Google Cloud Provisioning (Step-by-Step)

### Step 1: Authenticate and Set Active Project
```bash
gcloud auth login
gcloud config set project "${GCP_PROJECT_ID}"
```

### Step 2: Enable Required GCP APIs
```bash
gcloud services enable \
    compute.googleapis.com \
    artifactregistry.googleapis.com \
    aiplatform.googleapis.com
```

### Step 3: Create Service Account with Least-Privilege IAM for Vertex AI
```bash
# Create service account
gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="AutoCoder Vertex AI Execution Identity"

# Grant Vertex AI User role (enables model inference without manual API keys)
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Grant Artifact Registry Reader role (enables pulling images to VM)
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.reader"
```

### Step 4: Create Google Artifact Registry Repository
```bash
gcloud artifacts repositories create "${AR_REPO_NAME}" \
    --repository-format=docker \
    --location="${GCP_REGION}" \
    --description="AutoCoder Control Plane and Execution Worker Images"
```

### Step 5: Provision Compute Engine VM
```bash
gcloud compute instances create "${VM_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --zone="${GCP_ZONE}" \
    --machine-type="${VM_MACHINE_TYPE}" \
    --image-family="ubuntu-2404-lts-amd64" \
    --image-project="ubuntu-os-cloud" \
    --boot-disk-size="100GB" \
    --boot-disk-type="pd-balanced" \
    --service-account="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
    --scopes="cloud-platform" \
    --tags="http-server,autocoder-server"
```

### Step 6: Create Firewall Rule (AutoCoder UI Port 3000)
```bash
gcloud compute firewall-rules create "allow-autocoder-port-3000" \
    --project="${GCP_PROJECT_ID}" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:3000 \
    --source-ranges="0.0.0.0/0" \
    --target-tags="autocoder-server"
```
*(For production setups, restrict `--source-ranges` to your corporate VPN or authorized IP block).*

---

## 4. Building and Pushing Images to Artifact Registry

Run these commands from your local workspace containing the AutoCoder repository:

```bash
# Configure local Docker to authenticate against GCP Artifact Registry
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev"

# Tag definitions
CONTROL_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}/autocoder-control-plane:latest"
WORKER_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}/autocoder-worker:latest"

# 1. Build and push Execution Worker image
docker build -t "${WORKER_IMAGE}" -t autocoder-worker:latest -f Dockerfile.worker .
docker push "${WORKER_IMAGE}"

# 2. Build and push Control Plane image
docker build -t "${CONTROL_IMAGE}" -t autocoder-control-plane:latest -f Dockerfile .
docker push "${CONTROL_IMAGE}"
```

---

## 5. VM Setup and Application Startup

### Step 1: Connect to the VM via SSH
```bash
gcloud compute ssh "${VM_NAME}" --zone="${GCP_ZONE}"
```

### Step 2: Install Docker and Docker Compose on the VM
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker official GPG key & repo
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3: Configure Docker Authentication on the VM
```bash
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
```

### Step 4: Create Production Directory and Deployment Files
```bash
mkdir -p ~/autocoder && cd ~/autocoder

# Create persistent storage directories
mkdir -p data/prisma data/projects

# Create .env configuration
cat << 'EOF' > .env
NODE_ENV=production
PORT=3000
LLM_PROVIDER=vertex
VERTEX_PROJECT_ID=REPLACE_WITH_YOUR_GCP_PROJECT_ID
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-1.5-pro
EXECUTION_BACKEND=docker
DOCKER_WORKER_IMAGE=autocoder-worker:latest
DOCKER_CPU_LIMIT=2
DOCKER_MEMORY_LIMIT=2g
DOCKER_PIDS_LIMIT=100
EOF

# Update the GCP Project ID in .env
sed -i "s/REPLACE_WITH_YOUR_GCP_PROJECT_ID/${GCP_PROJECT_ID}/g" .env

# Pull the worker image so it is immediately available locally for sandboxes
docker pull "${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}/autocoder-worker:latest"
docker tag "${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}/autocoder-worker:latest" autocoder-worker:latest

# Pull the control plane image
docker pull "${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}/autocoder-control-plane:latest"
docker tag "${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO_NAME}/autocoder-control-plane:latest" autocoder-control-plane:latest
```

### Step 5: Start Services via Docker Compose
Create `docker-compose.yml`:
```yaml
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
      start_period: 20s
EOF
```

Launch:
```bash
docker compose up -d
```

---

## 6. Verification and Health Check

### Verify Running Containers
```bash
docker ps
```
Output must show `autocoder-control-plane` healthy on port 3000.

### Check API Health
```bash
curl -s http://localhost:3000/api/health | jq .
curl -s http://localhost:3000/api/health/system | jq .
```

### Accessing the Web UI
Find your VM external IP:
```bash
gcloud compute instances describe "${VM_NAME}" --zone="${GCP_ZONE}" --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```
Open your browser to:
`http://<VM_EXTERNAL_IP>:3000`

---

## 7. Troubleshooting & Operational Commands

### View Control Plane Logs
```bash
docker logs -f autocoder-control-plane
```

### Inspect Active Sandbox Workers
When a pipeline runs, you will see disposable workers spawned per conversation:
```bash
docker ps --filter "name=autocoder-worker-"
```

### Inspect Specific Worker Logs
```bash
docker logs <autocoder-worker-CONTAINER_ID>
```

### Restart Services
```bash
docker compose restart
```

---

## 8. Trial Teardown & Cost Management

When the GCP trial run is complete, prevent any unwanted charges with these commands:

```bash
# 1. Stop the VM instance (stops compute billing, preserves disk state)
gcloud compute instances stop "${VM_NAME}" --zone="${GCP_ZONE}"

# OR 2. Completely delete VM instance and firewall rules (destroys VM)
gcloud compute instances delete "${VM_NAME}" --zone="${GCP_ZONE}" --quiet
gcloud compute firewall-rules delete "allow-autocoder-port-3000" --quiet

# 3. Clean up Artifact Registry images
gcloud artifacts repositories delete "${AR_REPO_NAME}" --location="${GCP_REGION}" --quiet
```
