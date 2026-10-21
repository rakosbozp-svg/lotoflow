// End-to-end smoke test LOTOFLOW webu proti simulovanému Supabase (PostgREST podmnožina).
// Spuštění: npm run build && npx vite preview --port 4173 & npx -y playwright@1 install chromium && node e2e/smoke.mjs
import { chromium } from 'playwright'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const BASE = 'https://qmripplpcpvsxxliffcq.supabase.co'
const uid = 'aaaaaaaa-0000-4000-8000-000000000001'
const db = {
  companies: [], profiles: [{ id: uid, email: 'eva@test.cz', full_name: '', personal_number: '', lock_prefix: '', role: 'worker', is_active: false, company_id: null, site_id: null }],
  sites: [], workplaces: [], equipment: [], procedures: [], lotos: [], defects: [], audit_events: [],
}
const defaults = {
  equipment: () => ({ manufacturer: '', equipment_type: '', asset_number: '', out_of_service: false, energy_sources: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  procedures: () => ({ revision: 1, status: 'draft', author_name: '', approver_name: null, approved_at: null, next_review_date: null, last_reviewed_at: null, last_reviewed_by: null, review_interval_months: 12, ppe: [], preparation: [], restoration: [], points: [], revisions: [], updated_at: new Date().toISOString() }),
  lotos: () => ({ status: 'isolating', reason: '', steps: [], participants: [], timeline: [], zero_checks: [], zero_verified_at: null, zero_verified_by: null, restoration_started_at: null, closed_at: null, closed_by_name: null, version: 1, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  defects: () => ({ detail: '', photo_path: null, created_at: new Date().toISOString(), resolved_at: null, resolved_by_name: null, resolution_note: '' }),
  audit_events: () => ({ at: new Date().toISOString(), detail: '' }),
  sites: () => ({ city: '' }),
  companies: () => ({ registration_number: '', join_code: 'ABC123' }),
}
const errors = []
import { mkdirSync } from 'node:fs'
mkdirSync('./e2e-output', { recursive: true })

function filterRows(rows, params) {
  let out = rows
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'columns', 'on_conflict'].includes(k)) continue
    const [op, ...rest] = v.split('.')
    const val = rest.join('.')
    out = out.filter((r) => {
      const x = r[k]
      if (op === 'eq') return String(x) === val
      if (op === 'gte') return String(x) >= val
      if (op === 'lt') return String(x) < val
      if (op === 'is') return val === 'null' ? x == null : true
      return true
    })
  }
  const order = params.get('order')
  if (order) {
    const [col, dir] = order.split('.')
    out = [...out].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1))
  }
  const limit = params.get('limit')
  if (limit) out = out.slice(0, Number(limit))
  return out
}

function rpc(name, body) {
  const me = db.profiles.find((p) => p.id === uid)
  if (name === 'create_company') {
    const c = { id: randomUUID(), name: body.p_name, ...defaults.companies() }
    db.companies.push(c)
    Object.assign(me, { company_id: c.id, role: 'hse', is_active: true, full_name: body.p_full_name, personal_number: body.p_personal_number, lock_prefix: body.p_lock_prefix })
    return c.id
  }
  if (name === 'set_member') {
    const t = db.profiles.find((p) => p.id === body.p_user)
    Object.assign(t, { role: body.p_role, is_active: body.p_active, site_id: body.p_site })
    return null
  }
  if (name === 'perform_review') {
    const p = db.procedures.find((x) => x.id === body.p_procedure)
    const d = new Date(); d.setMonth(d.getMonth() + p.review_interval_months)
    p.next_review_date = d.toISOString().slice(0, 10); p.last_reviewed_at = new Date().toISOString(); p.last_reviewed_by = me.full_name
    return p.next_review_date
  }
  throw new Error('rpc ' + name)
}

async function handle(route) {
  const req = route.request()
  if (process.env.DBG && req.method() !== 'GET') console.log('REQ', req.method(), new URL(req.url()).pathname + new URL(req.url()).search, (req.postData()||'').slice(0,120))
  const url = new URL(req.url())
  const path = url.pathname
  const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  try {
    if (path.startsWith('/auth/v1/user')) return json(200, { id: uid, email: 'eva@test.cz', aud: 'authenticated', role: 'authenticated' })
    if (path.startsWith('/auth/v1/')) return json(200, {})
    if (path.startsWith('/storage/v1/object/sign/')) return json(200, { signedURL: '/storage/v1/object/public/x.jpg' })
    if (path.startsWith('/storage/v1/object/public/')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#888"/></svg>' })
    if (path.startsWith('/storage/v1/')) return json(200, { Key: 'ok' })
    if (path.startsWith('/rest/v1/rpc/')) return json(200, rpc(path.split('/').pop(), req.postDataJSON()))
    const table = path.split('/')[3]
    const rows = db[table]
    if (!rows) return json(404, { message: 'no table ' + table })
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    const reply = (list) => single ? (list.length ? json(200, list[0]) : json(406, { message: 'no rows' })) : json(200, list)
    if (req.method() === 'GET') return reply(filterRows(rows, url.searchParams))
    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      const items = (Array.isArray(body) ? body : [body]).map((b) => ({ id: randomUUID(), ...(defaults[table]?.() ?? {}), ...b }))
      if (table === 'lotos' && items.some((i) => rows.some((r) => r.equipment_id === i.equipment_id && r.status !== 'closed'))) return json(409, { message: 'duplicate key value violates unique constraint "lotos_one_open_per_equipment"' })
      rows.push(...items)
      return reply(items)
    }
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON()
      const hit = filterRows(rows, url.searchParams)
      hit.forEach((r) => Object.assign(r, body))
      return reply(hit)
    }
    return json(405, {})
  } catch (e) {
    errors.push('mock: ' + e.message)
    return json(500, { message: e.message })
  }
}

const browser = await chromium.launch({ }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await ctx.route(`${BASE}/**`, handle)
await ctx.routeWebSocket(/supabase\.co/, (ws) => { /* realtime: nic */ })
await ctx.addInitScript(([uid]) => {
  const session = { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email: 'eva@test.cz', aud: 'authenticated', role: 'authenticated' } }
  localStorage.setItem('sb-qmripplpcpvsxxliffcq-auth-token', JSON.stringify(session))
}, [uid])
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('page: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('dialog', (d) => d.accept())
await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1 } })

const shot = async (name) => page.screenshot({ path: `./e2e-output/e2e-${name}.png`, fullPage: true })
const step = async (name, fn) => { try { await fn(); console.log('OK  ', name) } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await shot('fail-' + name.replace(/\W+/g, '_')); throw e } }
writeFileSync('./e2e-output/photo.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

await step('nastavení firmy s demo daty', async () => {
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.getByText('Založit firmu').click()
  const inputs = page.locator('input.input')
  await inputs.nth(0).fill('Ing. Eva Horáková')
  await inputs.nth(1).fill('10052')
  await inputs.nth(2).fill('EH')
  await page.locator('input.input').nth(3).fill('Demo Manufacturing s.r.o.')
  await page.getByRole('button', { name: 'Založit firmu' }).last().click()
  await page.getByText('Skenovat zařízení').waitFor({ timeout: 15000 })
  await shot('home')
})
await step('seznam zařízení a filtr', async () => {
  await page.getByRole('link', { name: 'Zařízení' }).click()
  await page.getByText('Míchačka 04').first().waitFor()
  await page.getByRole('button', { name: 'Vyžaduje pozornost', exact: true }).click()
  await page.getByText('Lis 02').waitFor()
  await shot('equipment')
  await page.getByRole('button', { name: 'Vše', exact: true }).click()
})
await step('detail Lis 02: revize po termínu blokuje', async () => {
  await page.getByText('Lis 02').first().click()
  await page.getByRole('button', { name: /Zahájit LOTO/ }).click()
  await page.getByText('Zahájení je zablokováno').first().waitFor()
  await page.getByRole('button', { name: 'Zpět' }).click()
  await page.getByRole('button', { name: 'Zpět' }).click()
})
await step('detail Míchačka 04 + závada', async () => {
  await page.getByText('Míchačka 04').first().click()
  await page.getByText('PROVOZ').first().waitFor()
  await page.getByText('Hlučnější ložisko').waitFor()
  await shot('detail')
})
await step('zahájení LOTO', async () => {
  await page.getByRole('button', { name: /Zahájit LOTO/ }).click()
  await page.locator('#reason').fill('Výměna lopatek míchadla')
  await page.getByRole('button', { name: /Zahájit LOTO/ }).last().click()
  await page.getByText(/Krok 1 z/).waitFor()
  await shot('guide')
})
await step('průvodce: příprava, izolace s QR, uzamčení s fotkou', async () => {
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('heading', { name: 'Ověření nulového energetického stavu' }).count()) break
    const isLock = await page.getByRole('button', { name: /Potvrdit uzamčení/ }).count()
    const isIso = await page.getByRole('button', { name: /Potvrdit izolaci/ }).count()
    if (isIso && i === 3) {
      await page.getByRole('button', { name: /Ověřit bod QR kódem/ }).click()
      await page.getByRole('button', { name: /Simulovat sken/ }).click()
      await page.locator('.list-row.mono').nth(1).click()   // nesprávný bod
      await page.getByText('Nesprávný bod – krok je zablokován').waitFor()
      if (!(await page.getByRole('button', { name: /Potvrdit izolaci/ }).isDisabled())) throw new Error('nesprávný QR neblokuje')
      await shot('qr-wrong')
      await page.locator('.list-row.mono').nth(0).click()   // správný bod
      await page.getByText(/QR kód bodu .* ověřen/).first().waitFor()
    }
    if (isLock) {
      if (!(await page.getByRole('button', { name: /Potvrdit uzamčení/ }).isDisabled())) throw new Error('uzamčení bez fotky povoleno')
      await page.locator('input[type=file][capture]').setInputFiles('./e2e-output/photo.png')
    }
    const before = await page.getByText(/Krok \d+ z/).first().textContent()
    const btn = page.getByRole('button', { name: /Potvrdit (krok|izolaci|uzamčení)/ })
    await btn.click()
    await page.waitForTimeout(600)
    const err = await page.locator('.banner.tone-danger').allTextContents()
    if (err.length) throw new Error('chyba v UI: ' + err.join(' | '))
    if ((await page.getByText(/Krok \d+ z/).count()) && before === await page.getByText(/Krok \d+ z/).first().textContent()) throw new Error('krok se neposunul: ' + before)
  }
  await page.getByRole('heading', { name: 'Ověření nulového energetického stavu' }).waitFor()
})
await step('ověření nulového stavu', async () => {
  for (const cb of await page.locator('input[type=checkbox]').all()) await cb.check()
  await page.getByRole('button', { name: /Potvrdit nulový stav/ }).click()
  await page.getByText('LOTO aktivní – práce povolena').waitFor()
  await page.getByRole('button', { name: /Hotovo/ }).click()
  await page.getByText('Časová osa').waitFor()
  await shot('loto-detail')
})
await step('zahájení obnovy a 9 kroků', async () => {
  await page.getByRole('button', { name: /Zahájit obnovu/ }).click()
  await page.getByRole('button', { name: /Zahájit obnovu/ }).last().click()
  await page.getByText(/Krok 1 z 9/).waitFor()
  for (let i = 0; i < 9; i++) { await page.getByRole('button', { name: /Potvrdit krok/ }).click(); await page.waitForTimeout(300) }
  await page.getByRole('button', { name: /Ukončit LOTO/ }).click()
  await page.getByText('LOTO ukončeno').first().waitFor()
  await shot('closed')
})
await step('PDF záznam (tisk)', async () => {
  await page.getByRole('button', { name: /Hotovo/ }).click()
  await page.getByRole('button', { name: /Vytvořit PDF záznam/ }).click()
  await page.getByText('Záznam o provedení LOTO').waitFor()
  await page.getByRole('button', { name: /Uložit jako PDF/ }).click()
  await page.waitForTimeout(300)
  if (!(await page.evaluate(() => window.__printed))) throw new Error('tisk se nespustil')
  await shot('report')
})
await step('úkoly, hledání, štítky, audit, uživatelé', async () => {
  await page.goto('http://localhost:4173/#/tasks'); await page.getByText('Revize po termínu').first().waitFor(); await shot('tasks')
  await page.goto('http://localhost:4173/#/search'); await page.locator('input[type=search]').fill('michacka'); await page.getByText('Stroje (1)').waitFor()
  await page.goto('http://localhost:4173/#/more/labels'); await page.getByRole('button', { name: 'Vybrat vše' }).click(); await page.getByRole('button', { name: /Vytvořit PDF štítků/ }).click(); await page.waitForTimeout(800); await shot('labels')
  await page.goto('http://localhost:4173/#/more/audit'); await page.getByText(/LOTO ukončeno – Míchačka/).first().waitFor(); await shot('audit')
  await page.goto('http://localhost:4173/#/more/users'); await page.getByText('Kód firmy pro nové kolegy').waitFor()
  await page.goto('http://localhost:4173/#/'); await page.getByText('Vyžaduje pozornost').waitFor(); await shot('home-after')
})
await step('HSE: revize Lisu 02 odblokuje zahájení', async () => {
  const p = db.procedures.find((x) => x.name.includes('Lis 02'))
  await page.goto(`http://localhost:4173/#/procedure/${p.id}`)
  await page.getByRole('button', { name: /Provést revizi/ }).click()
  await page.getByRole('button', { name: /Potvrdit revizi/ }).click()
  await page.getByText('Revize byla zapsána.').waitFor()
})

console.log('audit událostí:', db.audit_events.length, '| LOTO:', db.lotos.map((l) => l.status).join(','))
console.log('chyby:', errors.length ? errors : 'žádné')
await browser.close()
