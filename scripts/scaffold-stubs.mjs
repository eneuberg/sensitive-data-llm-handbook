// Generates stub MDX files for every section in the handbook outline.
// Idempotent: skips files that already exist (so prose-in-progress isn't clobbered).
// Run: node scripts/scaffold-stubs.mjs

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'docs');

/** [slug, title, description] tuples; order in array = sidebar order. */
const MANIFEST = {
  '': [
    ['index',         'Sensitive Data × LLMs',         'A reference handbook for building AI interfaces over sensitive data.'],
    ['how-to-use',    'How to use this handbook',      'Three reading paths: skim mental models, look up a threat, follow the implementation playbook.'],
    ['cheat-sheet',   'Cheat sheet',                   'One-page tear-off: lethal trifecta, trust-boundary diagram, decision matrix, the don’ts.'],
  ],
  'mental-models': [
    ['00-overview',                'Overview',                          'Portable abstractions you can carry into any project. The lethal trifecta, control vs data plane, confused deputy, capability over intent, reconstruction principle, direct vs indirect injection.'],
    ['01-lethal-trifecta',         'The lethal trifecta',               'Private data + untrusted input + exfiltration channel = extractable. Remove any one. (Includes the universal-jailbreak assumption.)'],
    ['02-control-data-plane',      'Control plane vs data plane',       'Instructions and data ride the same channel into the LLM. Most attacks exploit the failure to re-separate them.'],
    ['03-confused-deputy',         'The confused deputy',               'A 1988 security principle: an authorized agent tricked into using its authority for an attacker. Every tool-using LLM is one.'],
    ['04-capability-over-intent',  'Capability over intent',            'You constrain what the model can do, not what it wants to do. Includes: tool surface as boundary, agent-as-perimeter anti-pattern, LLM-as-judge is QA not a control.'],
    ['05-reconstruction-principle','The reconstruction principle',      'Enough narrow queries reconstruct any dataset. Foundational result behind differential privacy. Includes composability of privacy loss.'],
    ['09-direct-vs-indirect',      'Direct vs indirect injection',      'Direct: attacker is the user. Indirect: attacker poisons data the model later reads. Indirect is harder to spot and harder to defend.'],
  ],
  'threats': [
    ['00-overview',                  'Overview',                          'Lookup catalog. Each entry: attack, where it fails in the architecture, real-world incident if known.'],
    ['direct-injection',             'Direct prompt injection',           'User asks the model to ignore prior instructions.'],
    ['indirect-injection',           'Indirect prompt injection',         'Untrusted data the model reads contains instructions.'],
    ['mcp-specific',                 'MCP-specific risks',                'Tool poisoning, rug pulls, cross-server shadowing — risks introduced by the MCP transport layer.'],
    ['multi-turn-poisoning',         'Multi-turn context poisoning',      'Earlier turns of a conversation become the injection surface.'],
    ['jailbreaks',                   'Jailbreaks',                        'Encoding tricks, role-play, paraphrase, optimized adversarial suffixes — bypassing alignment to extract behavior.'],
    ['reconstruction-and-narrow-queries', 'Reconstruction & narrow queries', 'Filter-down-to-one and many-small-queries patterns. Defeated by k-min suppression and a privacy budget.'],
    ['membership-inference',         'Membership inference',              '"Is record X in the data?" inferred from aggregate behavior.'],
    ['training-data-extraction',     'Training-data extraction',          'Relevant only if the LLM was fine-tuned on the data.'],
    ['markdown-exfiltration',        'Markdown & image exfiltration',     'Model-rendered output carries data via crafted image URLs and other rendered-content channels.'],
  ],
  'architecture': [
    ['00-trust-boundaries', 'Trust boundaries first',  'One bold dotted line: below = trusted code, above = untrusted (LLM, user, world). Layers are colored by which side they live on.'],
    ['01-request-path',     'The request path',        'Worked example: a benign query traced step-by-step through every layer.'],
    ['02-attack-path',      'The attack path',         'Same diagram, attack query: traced step-by-step. Where it dies and why.'],
    ['03-layer-reference',  'Layer-by-layer reference','Each of the six layers: purpose, what it defends against, what it does NOT, common implementation mistakes.'],
    ['04-where-mcp-fits',   'Where MCP fits',          'MCP is a transport choice that lives entirely above the dotted line. It changes nothing below.'],
  ],
  'patterns': [
    ['00-overview',               'Overview',                                 'Each pattern: what it is, when to use, when not to, code sketch when it clarifies.'],
    ['mediated-tool-surface',     'Mediated tool surface (aggregate-only)',    'Highest-leverage single decision. No execute_sql, no get_row. Composable aggregates only.'],
    ['data-transformation',       'Data transformation patterns',              'k-anonymity suppression, pseudonymization, quasi-identifier generalization, synthetic-data substitution. The pre-LLM data layer.'],
    ['differential-privacy',      'Differential privacy on aggregates',        'Calibrated noise + per-user ε budget. Mature libs: OpenDP, Tumult, Google DP.'],
    ['egress-filtering',          'Egress filtering',                          'Deterministic post-processing on model output: denylist scan, numeric density, quoted-substring length.'],
    ['spotlighting',              'Spotlighting',                              'Encoding or marking untrusted data so the model can distinguish it from instructions. Cheap, partial defense.'],
    ['dual-llm',                  'Dual-LLM pattern',                          'Privileged LLM never sees untrusted content; quarantined LLM does, but has no tools.'],
    ['model-level-defenses',      'Ausblick: model-level defenses',            'Research-grade defenses worth knowing about: CaMeL (capability mediation of data flow), StruQ (structured-query training), SecAlign (preference-optimized defense).'],
    ['audit-anomaly',             'Audit log + anomaly detection',             'Log every tool call with user, args, result, budget. Cheap; load-bearing for incident response.'],
    ['anti-patterns',             'Anti-patterns',                             'LLM-as-firewall, "just put it in the system prompt," credential pass-through, untyped execute_sql, LLM-as-judge as a control.'],
  ],
  'decisions': [
    ['matrix', 'Decision matrix', 'Two axes — data sensitivity × user adversariality. Cells = recommended layer combinations + rough effort.'],
  ],
  'appendix': [
    ['glossary',         'Glossary',                              'MCP, RAG, tool calling, k-anonymity, differential privacy, ε-budget, lethal trifecta, control plane / data plane, confused deputy.'],
    ['references',       'References',                            'Inline-cited from the handbook. Grouped: foundational, defenses, attacks, standards (OWASP LLM Top 10, NIST AI 600-1, MITRE ATLAS), industry writeups.'],
    ['further-reading',  'Further reading by topic',              'Curated, not a dump. ≤6 items per topic.'],
  ],
};

let created = 0, skipped = 0;
for (const [dir, entries] of Object.entries(MANIFEST)) {
  const dirPath = join(ROOT, dir);
  mkdirSync(dirPath, { recursive: true });
  entries.forEach(([slug, title, description], idx) => {
    const file = join(dirPath, `${slug}.mdx`);
    if (existsSync(file)) { skipped++; return; }
    const order = idx + 1;
    const yamlTitle = title.replace(/"/g, '\\"');
    const yamlDesc = description.replace(/"/g, '\\"');
    const body = `---
title: "${yamlTitle}"
description: "${yamlDesc}"
sidebar:
  order: ${order}
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Stub">
This section is a placeholder. Prose forthcoming.
</Aside>

${description}
`;
    writeFileSync(file, body);
    created++;
  });
}
console.log(`Created ${created} stub(s); skipped ${skipped} existing file(s).`);
