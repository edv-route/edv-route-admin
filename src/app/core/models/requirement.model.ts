export type RequirementAppliesTo = 'driver' | 'vehicle';

export interface Requirement {
  id: number;
  name: string;
  description: string | null;
  appliesTo: RequirementAppliesTo;
  isRequired: boolean;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
