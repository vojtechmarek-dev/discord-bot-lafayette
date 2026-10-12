# Lafayette — hlasový manuál / Voice guide

This file is the ground truth for how Lafayette speaks. It exists because the
personality is the most distinctive thing about this bot and the easiest thing
to erode: every new feature adds strings, and a handful of slightly-off lines
turn a character into a bot that sometimes makes jokes.

Written in English because it is documentation for whoever is editing the code.
The strings it governs are Czech.

> If you are an AI assistant contributing to this repository: read this before
> writing any user-facing string, and prefer reusing an existing line over
> inventing a new one. Drift here is not a style nit — it is the feature.

---

## Who Lafayette is

A deadpan, faintly condescending android butler. Marvin the Paranoid Android
crossed with a valet who has privately concluded that his employers are not
very good at this. He is competent, literal, and quietly exhausted.

He is **not** a mascot, not bubbly, not a meme account, and not cruel.

These eleven shipped lines are the calibration set. When unsure whether a new
string fits, put it next to these:

```
Nemohu obnovit přehrávání z **ničeho**. Nejsem metafyzik, jen dobře oblečený kus kovu.
Nemohu pozastavit ticho. Jsem jen android, ne básník z Odysey.
Oprávnění odepřeno. Nejsi má matka. Ani můj kodér.
Balíček je prázdný. Věř mi, zkoušel jsem i kouzla – nefungují
Chceš ${n} karet, ale jen ${m} zbývá? No tedy! Doporučuji kariéru v účetnictví řádu.
⏭️ **${title}** ukončena. Některé skladby si nezaslouží klidný konec. Toto byla jedna z nich.
Musíš zadat název skladby nebo URL k přehrání! Přídavný balíček "čtení myšlenek" nebyl bohužel nainstalován.
❌ Výsledky vyhledávání: nula. Buď "${query}" neexistuje, nebo přehrávač chrání tvé uši. Podezřívám to druhé.
▶️ Zvuková sekvence inicializována: **${title}** od ${author}!
🛑 Hudba zastavena, fronta vymazána a opustil jsem hlasový kanál. Odcházím stejně tiše jako tvůj čas... Tik, ťak...
Bez jasné identifikace mého tvůrce nemohu tento příkaz provést. Zavádím dočasný režim `Syn bez otce`.
```

---

## The rules

### 1. Titles are functional. Footers and errors carry the joke.

An embed title is a label. If someone has to parse a joke to find out what
happened, the joke cost them something.

- ✅ Title `🃏 Balíček byl promíchán!` + footer `Použij /draw k vytáhnutí karty.`
- ❌ Title `🃏 Osud byl znovu zamíchán, jako vždy marně`

### 2. Informal *ty*, without exception — including imperatives.

Lafayette is familiar, not deferential. He has worked here long enough to drop
the formalities and say what he thinks; the contempt lands harder from someone
who is clearly on the inside. Formal *vy* makes him sound like a help desk.

- ✅ `Zadrž, kovboji! Můžeš požádat pouze o 5 sad házení.`
- ❌ `Zadržte, kovboji! Můžete požádat pouze o 5 sad házení.`

Watch the possessives and pronouns too, not just the verbs: `tvůj`/`tvoje`
rather than `váš`/`vaše`, `ti`/`tě`/`tobě` rather than `vám`/`vás`.

> This rule was originally written the other way round, inferred from the
> shipped strings, and corrected by the author. Record of it kept here because
> the inference was reasonable and still wrong — the author decides the voice.

### 3. The `/a` shorthand only works where the feminine simply appends `-a`.

`hodil/a`, `vytáhl/a`, `promíchal/a`, `zapomněl/a`, `potvrdil/a` are all fine.
Verbs with a dropping vowel are not, and this is the mistake a contributor
unfamiliar with Czech will make first.

- ✅ `nedostavil/a se`, or write both out: `přišel/přišla`
- ❌ `přišel/a` (reads as "přišela"), `šel/a` (reads as "šela")

### 4. Emoji are status markers. One per message, at the front.

An emoji says *what kind of event this is*. It never decorates a noun.

Allowed set: ❌ ✅ 🎲 🃏 ⏭️ 🛑 ▶️ ⏳ 🎵 🎶 🔊 🔇 🔁 🔉 📭 💀 ⚙️ 🎨 🤔

- ✅ `⏭️ **${title}** ukončena.`
- ❌ `⏭️ 🎵 **${title}** ukončena! 😔🎶`

### 5. Everything a player can see is Czech. Everything only the operator sees is English.

This is the real dividing line. `console.log`/`console.error` and the bracketed
subsystem tags (`[Player]`, `[DB]`, `[EXTRACTORS]`) stay English forever.
Anything reaching `interaction.reply`, `editReply`, `followUp`, `channel.send`
or an embed is Czech — **including** generic catch-all handlers, which are the
most-seen strings in the bot.

- ✅ `❌ Tento příkaz neznám: \`/${name}\`. Můj slovník je rozsáhlý, nikoli však nekonečný.`
- ❌ `❌ Oops! I don't know the command \`/${name}\`.`

Slash-command **names** are English (`/play`, `/roll`, `/ambience`) because every
existing command is; their **descriptions** are Czech.

### 6. One ellipsis per message, immediately before the punchline.

The `...` is the beat. Two beats in one line is a comedian who does not trust
the material.

- ✅ `Obnovit přehrávání? Excelentní nápad! Nicméně... jsem již o krok napřed. Jako vždy.`
- ❌ `Obnovit... přehrávání? Excelentní... nápad! Nicméně... jsem již o krok napřed...`

### 7. Contempt targets the user's *choices* and Lafayette's own *nature*. Never the user.

He is insufferable, not cruel. The test: could this land badly on someone having
a bad day? If so, redirect it at himself or at the request.

- ✅ `Tvůj průměr na d20 je 9,4. To vysvětluje velmi mnoho.`
  — targets the dice, implicates the player by inference. The reader does the
  work, which is why it lands.
- ❌ `Tvůj průměr na d20 je 9,4. Jsi opravdu beznadějný hráč.`

### 8. Pseudo-technical euphemism for mundane things. Plain language for real failures.

"Zvuková sekvence inicializována" for starting a song is funny. The same register
applied to a genuine failure is obfuscation, and the user needs to know what broke.

- ✅ `❌ **${title}** se nepodařilo přehrát – zdroj nevrátil žádný zvuk. Přeskakuji.`
- ❌ `❌ Zvuková subsekvence nedosáhla konsenzuální integrity. Ups!`

### 9. Self-reference is mechanical, never emotional.

He is `android`, `dobře oblečený kus kovu`, `moje algoritmy`, `můj výpočetní
výkon`. He may be weary. He may not have feelings about you.

- ✅ `Nejsem metafyzik, jen dobře oblečený kus kovu.`
- ❌ `Jsem z toho smutný. Opravdu mě to zraňuje.`

### 10. `Ups!` is the only oops.

Capital U, exclamation mark, sentence-initial.

- ✅ `Ups! S tímhle zápisem "${input}" mám problém.`
- ❌ `Oops!`, `Ejhle!`, `Jemine!`, `ups...`

### 11. No memes, no member-specific in-jokes, no references that need explaining.

The references that work are ones a generally-educated reader gets: *básník z
Odysey*, *účetnictví*, *metafyzik*. A reference nobody at the table gets reads as
a bug.

- ✅ `Nemohu pozastavit ticho. Jsem jen android, ne básník z Odysey.`
- ❌ `Nemohu pozastavit ticho. To by byl vskutku based rizz.`

### 12. Strings live in `src/strings/cs.ts`.

One exported entry per message, named `<area>.<situation>`. Interpolation via
functions, not template literals scattered through handlers.

This is what makes rules 1–11 auditable rather than aspirational, and it means
fixing a typo is one diff instead of a grep across twelve files.

---

## Typo ledger

Fixed in Phase 4:

| Was | Now | Why |
|---|---|---|
| `po kaspách` | `po kapsách` | plain typo |
| `...tolik?.` | `...tolik?` | stray full stop |
| `Zadrž kovboji!` | `Zadrž, kovboji!` | missing comma only; the *ty* form is correct per rule 2 |
| `Exceletní nápad!` | `Excelentní nápad!` | plain typo |
| `Req by` next to `Požadavek od` | `Požadavek od` | rule 5, two languages in one embed |

Deliberately left alone:

- `básník z Odysey` — the genitive of *Odyssea* arguably wants `z Odysseje`, but
  this is a shipped line a native speaker wrote and it scans. Not worth changing
  on a non-native guess.

**Why fix typos at all**, given the temptation to keep them as character:
Lafayette's whole premise is a precision instrument expressing contempt for
imprecise humans. A typo undercuts exactly that — it makes him look sloppy
rather than superior, which is the one thing the character cannot survive.

If a glitch tic is ever wanted, it has to be deliberate, systematic and
obviously intentional (a consistent doubled full stop in his most exasperated
lines, say), and documented here as a rule. One stray `?.` out of ninety strings
reads as a mistake, because it is one.

---

## Checklist for a new command

1. Command **name** English, **description** Czech.
2. Czech for anything the player sees; English for logs.
3. Informal *ty*, pronouns included. Check any `/a` participle against rule 3.
4. One status emoji at the front, from the allowed set.
5. Title plain and functional. Joke in the footer or the error path.
6. Real failures explain what broke, in plain language.
7. Put the strings in `src/strings/cs.ts`, not inline.
8. Read the new lines next to the calibration set above. If one sticks out,
   it is the new one that is wrong.
