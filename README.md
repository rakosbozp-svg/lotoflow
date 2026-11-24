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

- LOTO cyklus: zahájení s kontrolou (revize po termínu a neschválený postup blokují, závady a „vyžaduje revizi“ varují), průvodce krok za krokem, povinná fotka u uzamčení, QR ověření bodu, ověření nulového stavu podle bodů postupu, řízená 9kroková obnova
- více uzamykacích bodů: terénní zámky na bodech, klíče do LOTO boxu, box se zamyká osobním zámkem; jediný bod se zamyká přímo osobním zámkem
- kódy izolačních bodů podle energie (E elektro, P vzduch, H hydraulika, W voda a média, G plyn, M mechanické a gravitační zajištění) s barvami na kartě i štítcích
- aktivní LOTO s časovou osou, účastníky a zámky; předání směny s checklistem; živé změny od kolegů
- zařízení, postupy (revize při každé změně, schvalování HSE, kontrola úplnosti), periodické revize a úkoly
- závady a poznámky se závažností, auditní stopa (jen přidávání), hledání bez diakritiky
- jednostránková karta LOTO postupu k vyvěšení u zařízení (A4 na výšku, přehledová fotka, upozornění, tabulka bodů, ověření, uvolnění do provozu), PDF záznam LOTO a arch QR štítků (tiskem – „Uložit jako PDF“)
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
