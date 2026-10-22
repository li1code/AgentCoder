import { countHeading, extractRequiredSection } from '../markdown-sections';

export interface StructuredReviewerFinding {
  id: string;
  severity: 'BLOCKING' | 'WARNING' | 'SUGGESTION';
  claim: string;
  evidenceRef?: string;
}

export interface ReviewerOutput {
  summary: string;
  qualityScore: number;
  architecturalConformance: boolean;
  requirementCoverage: boolean;
  workspaceHash: string;
  findings: string[];
  structuredFindings?: StructuredReviewerFinding[];
}

export const REVIEWER_SCHEMA = {
  contractName: 'ReviewerOutput',
  version: '1.2.0',
  requiredFields: [
    'summary',
    'qualityScore',
    'architecturalConformance',
    'requirementCoverage',
    'workspaceHash',
    'findings',
  ],
  mandatoryInvariants: [
    'Quality score must be an integer between 0 and 100',
    'Architectural conformance must be explicitly PASS or FAIL',
    'Requirement coverage must be explicitly PASS or FAIL',
    'Workspace hash must be a valid SHA-256 fingerprint',
    'Reviewer findings must be grounded in actual project evidence',
  ],
} as const;

export function parseStructuredFindings(findingsText: string): StructuredReviewerFinding[] {
  if (!findingsText || /^none\b/i.test(findingsText.trim())) {
    return [];
  }

  const lines = findingsText.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-') || l.startsWith('*'));
  const results: StructuredReviewerFinding[] = [];
  let index = 1;

  for (const line of lines) {
    const clean = line.replace(/^[-*]\s*/, '').trim();
    if (!clean || /^none\b/i.test(clean)) continue;

    // Pattern: [ID] [SEVERITY] Claim [Evidence: ref]
    const idMatch = clean.match(/\[([A-Za-z0-9_-]+)\]/);
    const sevMatch = clean.match(/\b(BLOCKING|WARNING|SUGGESTION)\b/i);
    const evidenceMatch = clean.match(/(?:evidence|ref|file|at)\s*:\s*([^\s,;\]\)]+)/i);

    const severity: 'BLOCKING' | 'WARNING' | 'SUGGESTION' = sevMatch
      ? (sevMatch[1].toUpperCase() as any)
      : 'WARNING';

    const id = idMatch ? idMatch[1] : `FINDING-${String(index).padStart(3, '0')}`;
    const evidenceRef = evidenceMatch ? evidenceMatch[1].replace(/[`'"]/g, '').trim() : undefined;

    results.push({
      id,
      severity,
      claim: clean,
      evidenceRef,
    });
    index++;
  }

  return results;
}

export function validateReviewerEvidenceGrounding(
  output: ReviewerOutput,
  projectFiles: string[],
  expectedWorkspaceHash?: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (expectedWorkspaceHash && output.workspaceHash.toLowerCase() !== expectedWorkspaceHash.toLowerCase()) {
    errors.push(
      `Reviewer Evidence Error: Stale workspace hash (${output.workspaceHash} vs expected ${expectedWorkspaceHash}).`
    );
  }

  const normalizedFiles = new Set(
    projectFiles.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase())
  );

  const findings = output.structuredFindings || parseStructuredFindings(output.findings.join('\n'));

  for (const f of findings) {
    if (f.evidenceRef) {
      const cleanRef = f.evidenceRef.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
      // If reference looks like a file path (contains extension or slash)
      if ((cleanRef.includes('/') || /\.[a-zA-Z0-9]+$/.test(cleanRef)) && !normalizedFiles.has(cleanRef)) {
        errors.push(
          `Reviewer Evidence Error: Finding "${f.id}" references non-existent project file "${f.evidenceRef}".`
        );
      }
    }

    if (f.severity === 'BLOCKING' && output.architecturalConformance && output.requirementCoverage && output.qualityScore >= 95) {
      errors.push(
        `Reviewer Evidence Error: Contradiction: Blocking finding "${f.id}" coexists with 95+ score and clean PASS.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseReviewerOutput(content: string): { output: ReviewerOutput | null; errors: string[] } {
  const errors: string[] = [];

  if (!content || !content.trim()) {
    return { output: null, errors: ['Reviewer report is empty.'] };
  }

  const requiredSections = [
    'Overall Assessment',
    'Quality Score',
    'Architectural Conformance',
    'Requirement Coverage',
    'Findings',
    'Workspace Hash',
  ];

  for (const s of requiredSections) {
    const count = countHeading(content, `### ${s}`);
    if (count === 0) {
      errors.push(`Reviewer Contract Error: Missing required section "### ${s}".`);
    } else if (count > 1) {
      errors.push(`Reviewer Contract Error: Duplicate section "### ${s}".`);
    }
  }

  if (errors.length > 0) {
    return { output: null, errors };
  }

  // 1. Overall Assessment
  const summary = extractRequiredSection(content, 'Overall Assessment')?.trim() || '';
  if (!summary) {
    errors.push('Reviewer Contract Error: Section "### Overall Assessment" cannot be empty.');
  }

  // 2. Quality Score
  const scoreText = extractRequiredSection(content, 'Quality Score')?.trim() || '';
  let qualityScore = -1;
  const scoreMatch = scoreText.match(/(-?\d+)/);
  if (!scoreMatch || isNaN(Number(scoreMatch[1]))) {
    errors.push(`Reviewer Contract Error: Section "### Quality Score" must contain an integer between 0 and 100, got: "${scoreText}".`);
  } else {
    qualityScore = parseInt(scoreMatch[1], 10);
    if (isNaN(qualityScore) || qualityScore < 0 || qualityScore > 100) {
      errors.push(`Reviewer Contract Error: Quality score must be between 0 and 100, got: ${qualityScore}.`);
    }
  }

  // 3. Architectural Conformance
  const archText = extractRequiredSection(content, 'Architectural Conformance')?.trim() || '';
  const cleanedArch = archText.replace(/^[\s\-*:—`]+/, '').trim();
  const archFirstWord = cleanedArch.split(/\s+/)[0]?.toUpperCase() || '';
  if (archFirstWord !== 'PASS' && archFirstWord !== 'FAIL') {
    errors.push(`Reviewer Contract Error: Section "### Architectural Conformance" must explicitly start with PASS or FAIL, got: "${archText}".`);
  }
  const architecturalConformance = archFirstWord === 'PASS';

  // 4. Requirement Coverage
  const reqText = extractRequiredSection(content, 'Requirement Coverage')?.trim() || '';
  const cleanedReq = reqText.replace(/^[\s\-*:—`]+/, '').trim();
  const reqFirstWord = cleanedReq.split(/\s+/)[0]?.toUpperCase() || '';
  if (reqFirstWord !== 'PASS' && reqFirstWord !== 'FAIL') {
    errors.push(`Reviewer Contract Error: Section "### Requirement Coverage" must explicitly start with PASS or FAIL, got: "${reqText}".`);
  }
  const requirementCoverage = reqFirstWord === 'PASS';

  // 5. Findings
  const findingsText = extractRequiredSection(content, 'Findings')?.trim() || '';
  if (!findingsText) {
    errors.push('Reviewer Contract Error: Section "### Findings" cannot be empty.');
  }

  // 6. Workspace Hash
  const hashText = extractRequiredSection(content, 'Workspace Hash')?.trim() || '';
  const hashMatch = hashText.match(/([a-f0-9]{64})/i);
  if (!hashMatch) {
    errors.push('Reviewer Contract Error: Section "### Workspace Hash" must contain a valid 64-character SHA-256 hex string.');
  }
  const workspaceHash = hashMatch ? hashMatch[1].toLowerCase() : '';

  if (errors.length > 0) {
    return { output: null, errors };
  }

  const structuredFindings = parseStructuredFindings(findingsText);

  return {
    output: {
      summary,
      qualityScore,
      architecturalConformance,
      requirementCoverage,
      workspaceHash,
      findings: findingsText ? [findingsText] : [],
      structuredFindings,
    },
    errors: [],
  };
}
