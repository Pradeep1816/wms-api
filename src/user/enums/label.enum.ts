import { UserContact } from '../entities/user-contact.entity';

/**
 * Standard label names and their corresponding IDs
 * Based on UserContact label constants
 */
export const StandardLabel = {
  HOME: 'Home',
  WORK: 'Work',
  OTHER: 'Other',
} as const;

/**
 * Mapping of label names to their IDs
 */
export const STANDARD_LABEL_IDS: Record<string, number> = {
  [StandardLabel.HOME]: UserContact.LABEL_HOME,
  [StandardLabel.WORK]: UserContact.LABEL_WORK,
  [StandardLabel.OTHER]: UserContact.LABEL_OTHER,
};

/**
 * Get label ID from label name
 * @param labelName - The label name (e.g., 'Home', 'Work', 'Other')
 * @returns The label ID or undefined if not a standard label
 */
export function getStandardLabelId(labelName: string): number | undefined {
  return STANDARD_LABEL_IDS[labelName];
}

