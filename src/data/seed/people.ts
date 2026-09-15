/**
 * Synthetic people.
 *
 * Every name here is invented for this prototype. They exist to make queue rows,
 * transcripts and affected-user counts read like real operational data rather
 * than `User 1 / User 2`. No real person, employer or directory is represented.
 *
 * The department mix is deliberately uneven: Sales Ops and Engineering carry more
 * headcount, which is what makes demand-by-category charts look plausible instead
 * of uniform.
 */
import { formatId } from '@/domain/ids';
import type { Department, Employee, EmployeeId, SupportAgent, AgentId } from '@/domain/types';

interface EmployeeSeed {
  name: string;
  department: Department;
  location: string;
  role: string;
  tenureMonths: number;
  active?: false;
}

/**
 * 24 employees. Sized so the queue, the cluster and the reach denominator are all
 * legible at a glance; a larger population would add noise, not signal
 * (docs/DATA_DICTIONARY.md section 12).
 */
const EMPLOYEE_SEEDS: EmployeeSeed[] = [
  { name: 'Priya Raghunathan', department: 'Sales Ops', location: 'Harbor Point', role: 'Revenue Operations Analyst', tenureMonths: 19 },
  { name: 'Daniel Okonkwo', department: 'Sales Ops', location: 'Harbor Point', role: 'Deal Desk Specialist', tenureMonths: 7 },
  { name: 'Mei-Ling Chao', department: 'Sales Ops', location: 'Remote (APAC)', role: 'Territory Planning Lead', tenureMonths: 34 },
  { name: 'Tomas Brandt', department: 'Sales Ops', location: 'Remote (EU)', role: 'Partner Operations Associate', tenureMonths: 3 },
  { name: 'Ana Sofia Reyes', department: 'Engineering', location: 'Alder Street', role: 'Backend Engineer', tenureMonths: 26 },
  { name: 'Kwame Boateng', department: 'Engineering', location: 'Alder Street', role: 'Staff Platform Engineer', tenureMonths: 48 },
  { name: 'Ingrid Halvorsen', department: 'Engineering', location: 'Remote (EU)', role: 'Site Reliability Engineer', tenureMonths: 15 },
  { name: 'Rafael Monteiro', department: 'Engineering', location: 'Remote (LATAM)', role: 'Mobile Engineer', tenureMonths: 11 },
  { name: 'Yusuf Demirci', department: 'Engineering', location: 'Alder Street', role: 'Data Engineer', tenureMonths: 22 },
  { name: 'Claire Beaumont', department: 'Finance', location: 'Harbor Point', role: 'Financial Analyst', tenureMonths: 41 },
  { name: 'Marco Ferretti', department: 'Finance', location: 'Remote (EU)', role: 'Procurement Manager', tenureMonths: 9 },
  { name: 'Hannah Whitfield', department: 'Finance', location: 'Harbor Point', role: 'Accounts Payable Lead', tenureMonths: 30 },
  { name: 'Olamide Adesanya', department: 'People', location: 'Harbor Point', role: 'People Operations Partner', tenureMonths: 17 },
  { name: 'Signe Lindqvist', department: 'People', location: 'Remote (EU)', role: 'Talent Coordinator', tenureMonths: 5 },
  { name: 'Devon Pryce', department: 'Marketing', location: 'Alder Street', role: 'Lifecycle Marketing Manager', tenureMonths: 13 },
  { name: 'Aiko Nakamura', department: 'Marketing', location: 'Remote (APAC)', role: 'Brand Designer', tenureMonths: 28 },
  { name: 'Callum Fraser', department: 'Marketing', location: 'Harbor Point', role: 'Content Strategist', tenureMonths: 2 },
  { name: 'Rosalind Achebe', department: 'Legal', location: 'Harbor Point', role: 'Commercial Counsel', tenureMonths: 36 },
  { name: 'Henrik Vestergaard', department: 'Legal', location: 'Remote (EU)', role: 'Privacy Program Manager', tenureMonths: 21 },
  { name: 'Nadia Haddad', department: 'Support', location: 'Alder Street', role: 'Support Operations Analyst', tenureMonths: 14 },
  { name: 'Bao Tran', department: 'Support', location: 'Remote (APAC)', role: 'Knowledge Manager', tenureMonths: 25 },
  { name: 'Elena Vasquez', department: 'Sales Ops', location: 'Remote (LATAM)', role: 'Sales Systems Administrator', tenureMonths: 8 },
  { name: 'Joseph Lindgren', department: 'Engineering', location: 'Alder Street', role: 'Frontend Engineer', tenureMonths: 6 },
  // One inactive record, so the reach denominator is a real filter rather than a length.
  { name: 'Marianne Dubois', department: 'Finance', location: 'Remote (EU)', role: 'Treasury Analyst', tenureMonths: 52, active: false },
];

export const EMPLOYEES: Employee[] = EMPLOYEE_SEEDS.map((seed, index) => ({
  id: formatId('employee', index + 1) as EmployeeId,
  displayName: seed.name,
  department: seed.department,
  location: seed.location,
  role: seed.role,
  tenureMonths: seed.tenureMonths,
  isActive: seed.active !== false,
}));

export const ACTIVE_EMPLOYEE_COUNT = EMPLOYEES.filter((e) => e.isActive).length;

/** Lookup used across transcripts, queue rows and impact panels. */
export const EMPLOYEE_BY_ID = new Map<EmployeeId, Employee>(EMPLOYEES.map((e) => [e.id, e]));

export function employeeName(id: EmployeeId): string {
  return EMPLOYEE_BY_ID.get(id)?.displayName ?? 'Unknown employee';
}

/* ----------------------------------------------------------------- agents -- */

interface AgentSeed {
  name: string;
  queue: string;
  openCaseTarget: number;
}

const AGENT_SEEDS: AgentSeed[] = [
  { name: 'Marcus Adeyemi', queue: 'IT Service Desk', openCaseTarget: 12 },
  { name: 'Freya Lindholm', queue: 'IT Service Desk', openCaseTarget: 12 },
  { name: 'Tobias Marchetti', queue: 'Identity & Access', openCaseTarget: 8 },
  { name: 'Amara Nwosu', queue: 'Finance Support', openCaseTarget: 10 },
  { name: 'Ravi Shankaran', queue: 'Workplace Technology', openCaseTarget: 10 },
];

export const AGENTS: SupportAgent[] = AGENT_SEEDS.map((seed, index) => ({
  id: formatId('agent', index + 1) as AgentId,
  displayName: seed.name,
  queue: seed.queue,
  openCaseTarget: seed.openCaseTarget,
}));

export const AGENT_BY_ID = new Map<AgentId, SupportAgent>(AGENTS.map((a) => [a.id, a]));

export function agentName(id: AgentId | null): string {
  if (id === null) return 'Unassigned';
  return AGENT_BY_ID.get(id)?.displayName ?? 'Unknown agent';
}

/** The agent the SSO narrative assigns to, referenced by the demo script and tests. */
export const DEMO_AGENT_ID = AGENTS[0]!.id;
