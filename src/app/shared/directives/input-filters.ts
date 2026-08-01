import {
  AlnumDashDirective,
  AlnumDirective,
  DigitsOnlyDirective,
  LettersOnlyDirective,
} from './input-filter.directive';

/**
 * Convenience bundle of the input-filter validator directives, so a form can
 * `imports: [...INPUT_FILTERS]` instead of listing each one.
 */
export const INPUT_FILTERS = [
  LettersOnlyDirective,
  DigitsOnlyDirective,
  AlnumDirective,
  AlnumDashDirective,
] as const;

export {
  AlnumDashDirective,
  AlnumDirective,
  DigitsOnlyDirective,
  LettersOnlyDirective,
} from './input-filter.directive';
