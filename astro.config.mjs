// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const REPO = 'sensitive-data-llm-handbook';
const OWNER = 'eneuberg';

export default defineConfig({
	site: `https://${OWNER}.github.io`,
	base: `/${REPO}/`,
	integrations: [
		starlight({
			title: 'Sensitive Data × LLMs',
			description:
				'A reference handbook for building AI interfaces over sensitive data. Mental models, threat catalog, architecture patterns.',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: `https://github.com/${OWNER}/${REPO}`,
				},
			],
			sidebar: [
				{ label: 'Start here', items: [
					{ label: 'Overview', slug: 'index' },
					{ label: 'How to use this handbook', slug: 'how-to-use' },
					{ label: 'Cheat sheet', slug: 'cheat-sheet' },
				]},
				{ label: 'Part 1 — Mental Models', autogenerate: { directory: 'mental-models' }, collapsed: false },
				{ label: 'Part 2 — Threat Catalog', autogenerate: { directory: 'threats' }, collapsed: true },
				{ label: 'Part 3 — Architecture', autogenerate: { directory: 'architecture' }, collapsed: false },
				{ label: 'Part 4 — Patterns', autogenerate: { directory: 'patterns' }, collapsed: true },
				{ label: 'Part 5 — Decision Matrix', autogenerate: { directory: 'decisions' } },
				{ label: 'Appendix', autogenerate: { directory: 'appendix' }, collapsed: true },
			],
		}),
	],
});
