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
    ['00-overview',                'Overview',                          'Portable abstractions you can carry into any project.'],
    ['01-lethal-trifecta',         'The lethal trifecta',               'Private data + untrusted input + exfiltration channel = extractable. Remove any one.'],
    ['02-control-data-plane',      'Control plane vs data plane',       'Instructions and data ride the same channel into the LLM. Most attacks exploit the failure to re-separate them.'],
    ['03-confused-deputy',         'The confused deputy',               'A 1988 security principle: an authorized agent tricked into using its authority for an attacker. Every tool-using LLM is one.'],
    ['04-capability-over-intent',  'Capability over intent',            'You constrain what the model can do, not what it wants to do. The tool surface is the security boundary, not the system prompt.'],
    ['05-reconstruction-principle','The reconstruction principle',      'Enough narrow queries reconstruct any dataset. Foundational result behind differential privacy.'],
    ['06-composability',           'Composability of privacy loss',     'Every answer leaks something. Losses compose; budgets must be tracked per user, not per query.'],
    ['07-universal-jailbreak',     'The universal-jailbreak assumption','Assume any prompt-level mitigation will eventually fail. Justifies all architectural controls.'],
    ['08-agent-perimeter',         'The agent-is-the-perimeter anti-pattern', 'Granting the agent a user’s full identity expands blast radius to that user’s full authority.'],
    ['09-direct-vs-indirect',      'Direct vs indirect injection',      'Direct: attacker is the user. Indirect: attacker poisons data the model later reads. Indirect is harder to spot and harder to defend.'],
    ['10-llm-as-judge',            'LLM-as-judge is QA, not a control', 'Validating LLM output with another LLM shares failure modes. Useful for quality, never a security boundary.'],
  ],
  'threats': [
    ['00-overview',                  'Overview',                          'Lookup catalog. Each entry: attack, where it fails in the architecture, real-world incident if known.'],
    ['direct-injection',             'Direct prompt injection',           'User asks the model to ignore prior instructions.'],
    ['indirect-injection',           'Indirect prompt injection',         'Untrusted data the model reads contains instructions.'],
    ['tool-poisoning',               'Tool poisoning',                    'Third-party MCP server’s tool description carries hidden instructions.'],
    ['rug-pulls',                    'Rug pulls',                         'Tool descriptions silently change after user approval.'],
    ['cross-server-shadowing',       'Cross-server shadowing',            'Malicious MCP server influences how the model uses another server’s tools.'],
    ['reconstruction-narrow-queries','Reconstruction via narrow queries', 'Many small queries → full dataset.'],
    ['filter-narrowing',             'Filter-narrowing to singleton aggregate', 'Filter to one row, then ask for "the average." Defeated by k-min suppression.'],
    ['membership-inference',         'Membership inference',              '"Is record X in the data?" inferred from aggregate behavior.'],
    ['training-data-extraction',     'Training-data extraction',          'Relevant only if the LLM was fine-tuned on the data.'],
    ['markdown-exfiltration',        'Markdown / image exfiltration',     'Model-rendered output carries data via crafted image URLs.'],
    ['encoding-paraphrase',          'Encoding & paraphrase attacks',     'Base64, role-play, "summarize each row," translation.'],
    ['adversarial-suffix',           'Adversarial-suffix jailbreaks',     'Optimized strings that bypass alignment training.'],
    ['multi-turn-poisoning',         'Multi-turn context poisoning',      'Earlier turns of a conversation become the injection surface.'],
    ['web-agent-pixel-injection',    'Web-agent pixel injection',         'Screenshot-based agents attacked via the rendered page itself.'],
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
    ['k-anonymity',               'k-anonymity suppression',                   'Suppress any aggregate over a group < k. Standard k = 5–25.'],
    ['pseudonymization',          'Pseudonymization at the view layer',        'Stable tokens replace direct identifiers before the LLM ever sees them.'],
    ['generalization',            'Quasi-identifier generalization',           'ZIP → ZIP3, age → decade. Cheap, effective for re-identification resistance.'],
    ['synthetic-data',            'Synthetic-data substitution',               'For exploratory questions, point the LLM at synthetic data; route real queries through the mediated path.'],
    ['differential-privacy',      'Differential privacy on aggregates',        'Calibrated noise + per-user ε budget. Mature libs: OpenDP, Tumult, Google DP.'],
    ['egress-filtering',          'Egress filtering',                          'Deterministic post-processing on model output: denylist scan, numeric density, quoted-substring length.'],
    ['spotlighting',              'Spotlighting (Ausblick)',                   'Encoding/marking untrusted data so the model can distinguish it from instructions. Cheap, partial defense.'],
    ['dual-llm',                  'Dual-LLM pattern (Ausblick)',               'Privileged LLM never sees untrusted content; quarantined LLM does, but has no tools.'],
    ['camel',                     'CaMeL — capabilities over data flow (Ausblick)', 'Trusted P-LLM extracts control + data flow; Q-LLM parses untrusted data; deterministic interpreter enforces capabilities on tool calls.'],
    ['struq',                     'StruQ — structured queries (Ausblick)', 'Train-time defense: front-end formats prompt and data into separate channels; specially-tuned model only follows instructions in the prompt channel.'],
    ['secalign',                  'SecAlign — preference-optimized defense (Ausblick)', 'Fine-tune the model to prefer following the original instruction over the injected one. Reduces injection success below 10%.'],
    ['audit-anomaly',             'Audit log + anomaly detection',             'Log every tool call with user, args, result, budget. Cheap; load-bearing for incident response.'],
    ['anti-patterns',             'Anti-patterns',                             'LLM-as-firewall, "just put it in the system prompt," credential pass-through, untyped execute_sql, LLM-as-judge as a control.'],
  ],
  'decisions': [
    ['matrix', 'Decision matrix', 'Two axes — data sensitivity × user adversariality. Cells = recommended layer combinations + rough effort.'],
  ],
  'implementation': [
    ['00-overview',                'Overview',                       'How to actually build it. Code patterns, schemas, tests.'],
    ['tool-surface-design',        'Tool surface design',            'Schema, naming, allowed parameters, validation order. Starter set: schema_describe, aggregate, distribution, topk.'],
    ['aggregation-enforcement',    'Aggregation enforcement',        'k-min suppression, max cardinality, filter-narrowness check.'],
    ['view-layer-transformation',  'View-layer transformation',      'Where pseudonymization actually happens. SQL view examples.'],
    ['egress-filter',              'Egress filter implementation',   'Denylist, density, substring-quote heuristics.'],
    ['audit-log-schema',           'Audit log schema',               'Required fields. Sample retention policy.'],
    ['testing',                    'Testing each layer',             'Adversarial test corpus per defense. AgentDojo for agent-level testing.'],
  ],
  'appendix': [
    ['glossary',         'Glossary',                              'MCP, RAG, tool calling, k-anonymity, differential privacy, ε-budget, lethal trifecta, control plane / data plane, confused deputy.'],
    ['references',       'References',                            'Inline-cited from the handbook. Grouped: foundational, defenses, attacks, standards (OWASP LLM Top 10, NIST AI 600-1, MITRE ATLAS), industry writeups.'],
    ['tldr',             'TL;DR for the colleague conversation',  '5-bullet elevator version.'],
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
