import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertOctagon, AlertTriangle, Camera, CheckCircle2, ChevronLeft, ChevronRight, Hand, Image as ImageIcon, Info, X,
  Zap, Wind, Droplet, Cog, Thermometer, ArrowDownToLine, FlaskConical, BatteryCharging,
} from 'lucide-react'
import type { EnergyType } from '../lib/types'
import { SAFETY_NOTICE, initials as toInitials } from '../lib/rules'
import { photoUrl } from '../lib/api'
import { errorText } from '../lib/supabase'

export type Tone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success'

export function Card({ children, tight, className = '' }: { children: ReactNode; tight?: boolean; className?: string }) {
  return <div className={`card ${tight ? 'tight' : ''} ${className}`}>{children}</div>
}

export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <div className="section-header" role="heading" aria-level={2}>
      <span>{title}</span>
      {trailing !== undefined && <span>{trailing}</span>}
    </div>
  )
}

export function Badge({ text, tone = 'neutral', icon }: { text: string; tone?: Tone; icon?: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{icon}{text}</span>
}

export function Tile({ icon, tone = 'accent', small }: { icon: ReactNode; tone?: Tone; small?: boolean }) {
  return <span className={`tile tone-${tone} ${small ? 'sm' : ''}`} aria-hidden>{icon}</span>
}

export function Banner({ title, text, tone = 'warning' }: { title: string; text?: string | null; tone?: Tone }) {
  const Icon = tone === 'danger' ? AlertOctagon : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div className={`banner tone-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={22} style={{ flex: 'none' }} />
      <div>
        <div className="b-title">{title}</div>
        {text ? <div className="b-text">{text}</div> : null}
      </div>
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return <Banner title={message} tone="danger" />
}

export function Empty({ title, text, icon }: { title: string; text?: string; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="e-title">{title}</div>
      {text && <div className="small">{text}</div>}
    </div>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, small, type = 'button',
}: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'danger' | 'success' | 'secondary'; disabled?: boolean; small?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button type={type} className={`btn ${variant === 'primary' ? '' : variant} ${small ? 'small' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/** Tlačítko, které během akce ukáže čekání a chybu vrátí volajícímu. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span className={mono ? 'mono' : ''}>{v === '' || v === null || v === undefined ? '—' : v}</span>
    </div>
  )
}

export function Divider() {
  return <div className="divider" />
}

export function SafetyNotice() {
  return (
    <div className="notice">
      <Hand size={18} style={{ flex: 'none' }} />
      <span>{SAFETY_NOTICE}</span>
    </div>
  )
}

export function TopBar({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="topbar">
      {back && (
        <button className="back" onClick={() => navigate(-1)} aria-label="Zpět">
          <ChevronLeft size={22} /> Zpět
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </div>
  )
}

export function Chevron() {
  return <ChevronRight size={18} className="chev" aria-hidden />
}

export function Avatar({ name, tone = 'accent' }: { name: string; tone?: Tone }) {
  return <span className={`avatar tone-${tone}`} aria-hidden>{toInitials(name)}</span>
}

export function EnergyIcon({ type, size = 20 }: { type: EnergyType; size?: number }) {
  const map = {
    electrical: Zap, pneumatic: Wind, hydraulic: Droplet, mechanical: Cog, thermal: Thermometer,
    gravitational: ArrowDownToLine, chemical: FlaskConical, stored: BatteryCharging,
  }
  const Icon = map[type] ?? Zap
  return <Icon size={size} />
}

export function Photo({ path, height = 150, caption }: { path?: string | null; height?: number; caption?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    if (path) photoUrl(path).then((u) => alive && setUrl(u))
    else setUrl(null)
    return () => { alive = false }
  }, [path])
  if (!path) {
    return (
      <div className="photo-empty" style={{ height }}>
        <span className="row"><Camera size={18} /> Bez fotografie</span>
      </div>
    )
  }
  return (
    <>
      {url ? (
        <img className="photo" style={{ height }} src={url} alt={caption ?? 'Fotografie'} loading="lazy" onClick={() => setOpen(true)} />
      ) : (
        <div className="photo-empty" style={{ height }}>Načítám…</div>
      )}
      {open && url && (
        <div className="viewer" onClick={() => setOpen(false)}>
          <img src={url} alt={caption ?? ''} />
          <button className="close" aria-label="Zavřít"><X /></button>
        </div>
      )}
    </>
  )
}

/** Výběr fotky: na telefonu nabídne fotoaparát i knihovnu. */
export function PhotoInput({ file, onChange, required }: { file: File | null; onChange: (f: File | null) => void; required?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="field">
      {preview && <img className="photo" style={{ height: 180 }} src={preview} alt="Pořízená fotografie" />}
      <div className="btn-row">
        <label className="btn secondary small" style={{ cursor: 'pointer' }}>
          <Camera size={18} /> {file ? 'Vyfotit znovu' : 'Vyfotit'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        </label>
        <label className="btn secondary small" style={{ cursor: 'pointer' }}>
          <ImageIcon size={18} /> Z knihovny
          <input type="file" accept="image/*" hidden onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {file && <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => onChange(null)}>Odebrat fotografii</button>}
      {required && !file && <span className="tiny">Fotografie je povinná.</span>}
    </div>
  )
}

export function Spinner() {
  return <div className="spinner" aria-label="Načítám" />
}
