import { Link, useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, Eye, QrCode, Search as SearchIcon, LockOpen, CheckCircle2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { ROLE_TITLE } from '../lib/rules'
import { Card, Empty, SafetyNotice, SectionHeader } from '../components/ui'
import { EquipmentRow, LotoCard } from '../components/rows'
import { openTasks, TaskRow } from './Tasks'

export default function Home() {
  const app = useApp()
  const navigate = useNavigate()
  const me = app.profile!
  const mine = app.scopedLotos.filter((l) => l.status !== 'closed' && (l.responsible_id === me.id || l.started_by === me.id || l.participants.some((p) => p.user_id === me.id && !p.removed_at)))
  const tasks = openTasks(app)
  const recentIds: string[] = (() => { try { return JSON.parse(localStorage.getItem('lotoflow.recent') ?? '[]') } catch { return [] } })()
  const recent = recentIds.map((id) => app.scopedEquipment.find((e) => e.id === id)).filter(Boolean).slice(0, 4)
  const site = app.sites.find((s) => s.id === app.siteId)

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">LOTOFLOW</div>
        <button className="icon-btn" aria-label="Hledat v registru" onClick={() => navigate('/search')}><SearchIcon size={22} /></button>
      </div>
      <button className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: 12, cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate('/more/org')}>
        <Building2 size={20} color="var(--accent)" />
        <div className="grow">
          <div className="title small">{app.company?.name}</div>
          <div className="small muted">{site?.name ?? 'Všechny závody'}</div>
        </div>
        <ChevronRight size={18} className="chev" />
      </button>
      <div className="tiny" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="row" style={{ gap: 6 }}><Eye size={14} />{app.contextLine}</span>
        <span>{me.full_name} · {ROLE_TITLE[me.role]}</span>
      </div>

      <button className="btn" style={{ minHeight: 110, justifyContent: 'flex-start', padding: 20, textAlign: 'left', borderRadius: 16 }} onClick={() => navigate('/scan')}>
        <QrCode size={40} />
        <div className="grow">
          <div style={{ fontSize: 20, fontWeight: 800 }}>Skenovat zařízení</div>
          <div style={{ opacity: 0.9, fontWeight: 400 }}>Naskenujte QR štítek stroje nebo izolačního bodu</div>
        </div>
        <ChevronRight />
      </button>

      <SectionHeader title="Moje aktivní LOTO" trailing={mine.length || undefined} />
      {mine.length === 0 ? (
        <Card><Empty icon={<LockOpen size={30} color="var(--text3)" />} title="Nemáte žádné aktivní LOTO" text="Zahajte LOTO z detailu zařízení nebo naskenováním QR štítku." /></Card>
      ) : mine.map((l) => <LotoCard key={l.id} l={l} />)}

      <SectionHeader title="Vyžaduje pozornost" trailing={tasks.length || undefined} />
      <Card tight>
        {tasks.length === 0 && <Empty icon={<CheckCircle2 size={30} color="var(--success)" />} title="Vše je v pořádku" />}
        {tasks.slice(0, 5).map((t) => <TaskRow key={t.id} t={t} />)}
        {tasks.length > 5 && <Link to="/tasks" className="link-btn center">Zobrazit všechny úkoly ({tasks.length})</Link>}
      </Card>

      <SectionHeader title="Poslední zařízení" />
      <Card tight>
        {recent.length === 0 && <Empty title="Zatím jste neotevřeli žádné zařízení" />}
        {recent.map((e) => <EquipmentRow key={e!.id} e={e!} lotos={app.lotos} procedures={app.procedures} defects={app.defects} />)}
      </Card>
      <SafetyNotice />
    </div>
  )
}
