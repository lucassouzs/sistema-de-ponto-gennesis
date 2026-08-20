import { HELP_CATEGORIES } from './categories';
import { HELP_TUTORIALS } from './tutorials';
import type { HelpCategory, HelpTutorial } from './types';

export type { HelpCategory, HelpCategoryPreview, HelpStep, HelpTutorial } from './types';
export { HELP_CATEGORIES } from './categories';
export { HELP_TUTORIALS } from './tutorials';
export { searchHelpCenter, type HelpSearchResult } from './search';

export function getCategory(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug);
}

export function getTutorial(slug: string): HelpTutorial | undefined {
  return HELP_TUTORIALS.find((t) => t.slug === slug);
}

export function listTutorialsByCategory(categorySlug: string): HelpTutorial[] {
  return HELP_TUTORIALS.filter((t) => t.categorySlug === categorySlug);
}

export function tutorialCountByCategory(categorySlug: string): number {
  return listTutorialsByCategory(categorySlug).length;
}
