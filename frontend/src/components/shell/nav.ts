// Navigation per role. The first four items of `primary` form the mobile bottom bar; the rest go under "More".
import {
  BadgeIndianRupee,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  Compass,
  GitCompareArrows,
  GraduationCap,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Route,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import type { Role } from '@/api/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const HOME: NavItem = { to: '/home', label: 'Home', icon: Home }
const QUESTIONNAIRE: NavItem = { to: '/questionnaire', label: 'Questionnaire', icon: ClipboardList }
const RESULTS: NavItem = { to: '/results', label: 'Results', icon: Sparkles }
const FAMILY: NavItem = { to: '/family', label: 'Family', icon: Users }
const PLAN: NavItem = { to: '/plan', label: 'Plan', icon: Route }
const EXPLORE: NavItem = { to: '/explore', label: 'Explore', icon: Compass }
const PROFILE: NavItem = { to: '/profile', label: 'My profile', icon: UserRound }
const WHATIF: NavItem = { to: '/what-if', label: 'What if?', icon: SlidersHorizontal }
const COMPARE: NavItem = { to: '/compare', label: 'Compare', icon: GitCompareArrows }
const LOANS: NavItem = { to: '/loans', label: 'Loans', icon: Wallet }
const SCHOLARSHIPS: NavItem = { to: '/scholarships', label: 'Scholarships', icon: BadgeIndianRupee }
const EXAMS: NavItem = { to: '/exams', label: 'Exam calendar', icon: CalendarDays }
const TRUST: NavItem = { to: '/trust', label: 'How we know', icon: ShieldCheck }
const SETTINGS: NavItem = { to: '/settings', label: 'Settings', icon: Settings }
const OUTCOMES: NavItem = { to: '/outcomes', label: 'What I chose', icon: BookOpenCheck }
const COUNSELLOR: NavItem = { to: '/counsellor', label: 'Students', icon: GraduationCap }
const ADMIN: NavItem = { to: '/admin', label: 'Analytics', icon: LayoutDashboard }

export function navFor(role: Role | undefined): { primary: NavItem[]; secondary: NavItem[] } {
  switch (role) {
    case 'parent':
      return {
        primary: [HOME, RESULTS, FAMILY, PLAN, WHATIF, EXPLORE],
        secondary: [COMPARE, LOANS, SCHOLARSHIPS, EXAMS, OUTCOMES, TRUST, SETTINGS],
      }
    case 'educator':
      return { primary: [COUNSELLOR, EXPLORE, SCHOLARSHIPS, EXAMS], secondary: [TRUST, SETTINGS] }
    case 'admin':
      return { primary: [ADMIN, TRUST, EXPLORE], secondary: [SETTINGS] }
    default:
      return {
        primary: [HOME, QUESTIONNAIRE, RESULTS, PLAN, FAMILY, EXPLORE, PROFILE],
        secondary: [WHATIF, COMPARE, LOANS, SCHOLARSHIPS, EXAMS, OUTCOMES, TRUST, SETTINGS],
      }
  }
}
