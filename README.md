# LOTOFLOW – webová aplikace

Řízení LOTO (uzamčení zařízení před nebezpečnou energií) pro průmyslové závody.
Běží v prohlížeči na iPhonu i Androidu, dá se přidat na plochu jako aplikace. Data sdílí celý tým přes databázi Supabase (EU).

> Aplikace eviduje a řídí provádění schváleného postupu, ale nenahrazuje fyzickou izolaci a uzamčení.

## Jak ji začít používat

1. Otevřete adresu aplikace v telefonu (Safari / Chrome) a vytvořte si účet (e-mail + heslo).
2. **První člověk (HSE / BOZP)** zvolí *Založit firmu* – může rovnou naplnit ukázková data.
3. **Kolegové** zvolí *Připojit se k firmě* a zadají kód firmy (HSE ho najde ve *Více → Uživatelé*).
4. HSE kolegu schválí a přidělí roli (pracovník / vedoucí údržby / HSE).
5. Přidání na plochu: iPhone – Sdílet → *Přidat na plochu*; Android – ⋮ → *Instalovat aplikaci*.

## Co umí

- LOTO cyklus: zahájení s kontrolou (revize po termínu a neschválený postup blokují, závady a „vyžaduje revizi“ varují), průvodce krok za krokem, osobní zámek + povinná fotka u uzamčení, QR ověření bodu, TRY/TEST nulového stavu, řízená 9kroková obnova
- aktivní LOTO s časovou osou, účastníky a zámky; předání směny s checklistem; živé změny od kolegů
- zařízení, postupy (revize při každé změně, schvalování HSE, kontrola úplnosti), periodické revize a úkoly
- závady a poznámky se závažností, auditní stopa (jen přidávání), hledání bez diakritiky
- PDF záznam LOTO a arch QR štítků (tiskem – „Uložit jako PDF“)
- role: pracovník vidí jen svá LOTO, vedoucí svůj závod, HSE vše a spravuje registr

## Vývoj

```bash
npm ci
npm run dev        # lokální vývoj
npm test           # jednotkové testy pravidel
npm run build      # produkční build do dist/
```

`e2e/smoke.mjs` projde celý LOTO cyklus v prohlížeči proti simulovanému backendu (Playwright).

Nasazení: každý push do `main` sestaví a publikuje web přes GitHub Pages (`.github/workflows/pages.yml`).

## Zabezpečení

Publishable klíč Supabase v kódu je veřejný záměrně. Přístup k datům hlídá přihlášení a pravidla v databázi (Row Level Security):
každý vidí jen data své firmy, neschválený účet nevidí nic, změny registru smí jen HSE, auditní stopu nelze upravit ani smazat.
