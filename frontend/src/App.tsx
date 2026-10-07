// Routes. Pages are lazy-loaded so the first screen stays small on slow phones.
import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { DEV_TOOLS } from '@/api/client'
import { AppShell, PublicShell } from '@/components/shell/AppShell'
import { RedirectIfSignedIn, RequireAuth } from '@/components/shell/guards'
import { SessionExpiredDialog } from '@/components/shell/SessionExpiredDialog'

const page = (load: () => Promise<{ default: React.ComponentType }>) => lazy(load)
const Landing = page(() => import('@/pages/Landing'))
const SignIn = page(() => import('@/pages/SignIn'))
const Register = page(() => import('@/pages/Register'))
const HowItWorks = page(() => import('@/pages/HowItWorks'))
const Trust = page(() => import('@/pages/Trust'))
const NotFound = page(() => import('@/pages/NotFound'))
const Home = page(() => import('@/pages/Home'))
const Questionnaire = page(() => import('@/pages/Questionnaire'))
const QuestionnairePlayer = page(() => import('@/pages/QuestionnairePlayer'))
const Profile = page(() => import('@/pages/Profile'))
const Results = page(() => import('@/pages/Results'))
const CareerDetail = page(() => import('@/pages/CareerDetail'))
const Compare = page(() => import('@/pages/Compare'))
const Family = page(() => import('@/pages/Family'))
const FamilyMeeting = page(() => import('@/pages/FamilyMeeting'))
const FamilyBudget = page(() => import('@/pages/FamilyBudget'))
const Consent = page(() => import('@/pages/Consent'))
const WhatIf = page(() => import('@/pages/WhatIf'))
const Plan = page(() => import('@/pages/Plan'))
const Loans = page(() => import('@/pages/Loans'))
const Explore = page(() => import('@/pages/Explore'))
const Scholarships = page(() => import('@/pages/Scholarships'))
const Exams = page(() => import('@/pages/Exams'))
const Counsellor = page(() => import('@/pages/Counsellor'))
const Admin = page(() => import('@/pages/Admin'))
const Settings = page(() => import('@/pages/Settings'))
const Outcomes = page(() => import('@/pages/Outcomes'))
// Developer tools: only referenced when VITE_DEV_TOOLS=true, so public builds do not contain them.
const DevTools = DEV_TOOLS ? lazy(() => import('@/devtools/DevTools')) : null
const Presenter = DEV_TOOLS ? lazy(() => import('@/devtools/Presenter')) : null

export default function App() {
  useEffect(() => {
    // Tell the inline loading screen (index.html) that the app has rendered.
    window.__prismReady?.()
  }, [])
  return (
    <>
      <Routes>
        <Route element={<PublicShell />}>
          <Route index element={<Landing />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="trust" element={<Trust />} />
          <Route element={<RedirectIfSignedIn />}>
            <Route path="signin" element={<SignIn />} />
            <Route path="register" element={<Register />} />
          </Route>
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="home" element={<Home />} />
            <Route path="consent" element={<Consent />} />
            <Route path="questionnaire" element={<Questionnaire />} />
            <Route path="questionnaire/:code" element={<QuestionnairePlayer />} />
            <Route path="profile" element={<Profile />} />
            <Route path="results" element={<Results />} />
            <Route path="results/:careerId" element={<CareerDetail />} />
            <Route path="compare" element={<Compare />} />
            <Route path="family" element={<Family />} />
            <Route path="family/meeting" element={<FamilyMeeting />} />
            <Route path="family/budget" element={<FamilyBudget />} />
            <Route path="what-if" element={<WhatIf />} />
            <Route path="plan" element={<Plan />} />
            <Route path="loans" element={<Loans />} />
            <Route path="explore" element={<Explore />} />
            <Route path="explore/:careerId" element={<Explore />} />
            <Route path="scholarships" element={<Scholarships />} />
            <Route path="exams" element={<Exams />} />
            <Route path="outcomes" element={<Outcomes />} />
            <Route path="settings" element={<Settings />} />
            <Route path="app/trust" element={<Trust />} />
            <Route element={<RequireAuth roles={['educator', 'admin']} />}>
              <Route path="counsellor" element={<Counsellor />} />
            </Route>
            <Route element={<RequireAuth roles={['admin']} />}>
              <Route path="admin" element={<Admin />} />
            </Route>
            {Presenter && <Route path="presenter" element={<Presenter />} />}
          </Route>
        </Route>
        <Route element={<PublicShell />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <SessionExpiredDialog />
      {DevTools && (
        <Suspense fallback={null}>
          <DevTools />
        </Suspense>
      )}
    </>
  )
}
