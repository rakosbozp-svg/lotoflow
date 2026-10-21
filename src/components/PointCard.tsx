import { CheckCircle, Lock, MapPin, Power, QrCode } from 'lucide-react'
import type { IsolationPoint } from '../lib/types'
import { ENERGY_TITLE, pointQR } from '../lib/rules'
import { Card, Divider, EnergyIcon, Photo, Tile } from './ui'

export default function PointCard({ point, machineCode, index, compact }: { point: IsolationPoint; machineCode: string; index?: number; compact?: boolean }) {
  const detail = (label: string, value: string, icon: React.ReactNode) => (
    <div className="row-top">
      <span className="muted" style={{ width: 20, flex: 'none' }}>{icon}</span>
      <div className="grow"><div className="tiny" style={{ fontWeight: 600, color: 'var(--text2)' }}>{label}</div><div>{value || '—'}</div></div>
    </div>
  )
  return (
    <Card>
      <div className="row-top">
        <Tile icon={<EnergyIcon type={point.energy} />} tone="danger" />
        <div className="grow">
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 18 }}>{point.code}</span>
            {index !== undefined && <span className="tiny">Bod {index}</span>}
          </div>
          <div className="title">{point.name}</div>
          <div className="small muted">{ENERGY_TITLE[point.energy]}</div>
        </div>
      </div>
      <Photo path={point.photo_path} height={compact ? 120 : 170} caption={`${point.code} – ${point.name}`} />
      {compact ? (
        <div className="small muted">{point.location}</div>
      ) : (
        <>
          <Divider />
          {detail('Umístění', point.location, <MapPin size={16} />)}
          {detail('Metoda izolace', point.method, <Power size={16} />)}
          {detail('Požadovaný zámek', point.lock, <Lock size={16} />)}
          {point.verification && detail('Ověření', point.verification, <CheckCircle size={16} />)}
          <div className="row tiny mono"><QrCode size={14} />{pointQR(machineCode, point.code)}</div>
        </>
      )}
    </Card>
  )
}
