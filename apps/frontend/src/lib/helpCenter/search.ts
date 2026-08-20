import { HELP_CATEGORIES } from './categories';
import { HELP_TUTORIALS } from './tutorials';
import type { HelpCategory, HelpTutorial } from './types';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesQuery(haystack: string, query: string): boolean {
  const nq = normalize(query);
  if (!nq) return true;
  const nh = normalize(haystack);
  return nq.split(/\s+/).every((token) => nh.includes(token));
}

export interface HelpSearchResult {
  categories: HelpCategory[];
  tutorials: HelpTutorial[];
}

export function searchHelpCenter(query: string): HelpSearchResult {
  const q = query.trim();
  if (!q) {
    return {
      categories: [...HELP_CATEGORIES],
      tutorials: [],
    };
  }

  const categories = HELP_CATEGORIES.filter(
    (c) => matchesQuery(`${c.title} ${c.description}`, q)
  );

  const tutorials = HELP_TUTORIALS.filter((t) => {
    const stepText = t.steps.map((s) => `${s.title} ${s.body} ${s.hint ?? ''}`).join(' ');
    return matchesQuery(
      `${t.title} ${t.summary} ${t.keywords.join(' ')} ${stepText}`,
      q
    );
  });

  return { categories, tutorials };
}
