import { NavLink, Route, Routes } from 'react-router-dom'
import { CheckSquare, Cog, Home as HomeIcon, Lock, MoreHorizontal } from 'lucide-react'
import { useApp } from './lib/store'
import { Spinner } from './components/ui'
import { AuthScreen, PendingScreen, SetupScreen } from './screens/Auth'
import Home from './screens/Home'
import EquipmentList from './screens/EquipmentList'
import EquipmentDetail from './screens/EquipmentDetail'
import ProcedureView from './screens/ProcedureView'
import StartLoto from './screens/StartLoto'
import Guide from './screens/Guide'
import LotoList from './screens/LotoList'
import LotoDetail from './screens/LotoDetail'
import Restoration from './screens/Restoration'
import Handover from './screens/Handover'
import Tasks from './screens/Tasks'
import More from './screens/More'
import Users from './screens/Users'
import AuditLog from './screens/AuditLog'
import Search from './screens/Search'
import Scanner from './screens/Scanner'
import Labels from './screens/Labels'
import Report from './screens/Report'
import EquipmentEditor from './screens/EquipmentEditor'
import ProcedureEditor from './screens/ProcedureEditor'
import Organization from './screens/Organization'
import { openTasks } from './screens/Tasks'

export default function App() {
  const app = useApp()
  if (!app.ready) return <Spinner />
  if (!app.session) return <AuthScreen />
  if (!app.profile?.company_id) return <SetupScreen />
  if (!app.profile.is_active || !app.company) return <PendingScreen />

  const openCount = app.scopedLotos.filter((l) => l.status !== 'closed').length
  const urgent = openTasks(app).filter((t) => t.kind === 'overdueReview' || t.kind === 'incompleteLoto' || t.kind === 'openDefect').length

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/equipment" element={<EquipmentList />} />
        <Route path="/equipment/:id" element={<EquipmentDetail />} />
        <Route path="/equipment/:id/start" element={<StartLoto />} />
        <Route path="/procedure/:id" element={<ProcedureView />} />
        <Route path="/loto" element={<LotoList />} />
        <Route path="/loto/:id" element={<LotoDetail />} />
        <Route path="/loto/:id/guide" element={<Guide />} />
        <Route path="/loto/:id/restore" element={<Restoration />} />
        <Route path="/loto/:id/handover" element={<Handover />} />
        <Route path="/loto/:id/report" element={<Report />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/users" element={<Users />} />
        <Route path="/more/audit" element={<AuditLog />} />
        <Route path="/more/labels" element={<Labels />} />
        <Route path="/more/org" element={<Organization />} />
        <Route path="/search" element={<Search />} />
        <Route path="/scan" element={<Scanner />} />
        <Route path="/admin/equipment/:id" element={<EquipmentEditor />} />
        <Route path="/admin/procedure/:equipmentId" element={<ProcedureEditor />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <nav className="tabbar no-print" aria-label="Hlavní navigace">
        <NavLink to="/" end><HomeIcon size={24} />Domů</NavLink>
        <NavLink to="/equipment"><Cog size={24} />Zařízení</NavLink>
        <NavLink to="/loto"><Lock size={24} />Aktivní LOTO{openCount > 0 && <span className="count">{openCount}</span>}</NavLink>
        <NavLink to="/tasks"><CheckSquare size={24} />Úkoly{urgent > 0 && <span className="count">{urgent}</span>}</NavLink>
        <NavLink to="/more"><MoreHorizontal size={24} />Více</NavLink>
      </nav>
    </div>
  )
}
