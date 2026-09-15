# Componenti di terze parti

Questo motore incorpora i seguenti componenti open source. Nessuno di essi è
stato modificato: sono usati come dipendenze.

| Componente | Licenza | Obblighi rilevanti |
|---|---|---|
| [axe-core](https://github.com/dequelabs/axe-core) (Deque Systems) | MPL-2.0 | Copyleft a livello di file. Vale solo per modifiche ai sorgenti di axe-core, che qui non avvengono. Nessun obbligo di apertura ricade su questo codice. |
| [Playwright](https://github.com/microsoft/playwright) (Microsoft) | Apache-2.0 | Attribuzione. |
| [ExcelJS](https://github.com/exceljs/exceljs) | MIT | Attribuzione. |
| [Zod](https://github.com/colinhacks/zod) | MIT | Attribuzione. |
| [Commander](https://github.com/tj/commander.js) | MIT | Attribuzione. |
| [p-limit](https://github.com/sindresorhus/p-limit) | MIT | Attribuzione. |

## Nota su axe-core

axe-core è il motore deterministico su cui poggia il livello automatico
dell'analisi. È distribuito sotto Mozilla Public License 2.0: l'obbligo di
pubblicazione riguarda esclusivamente i file sorgente di axe-core stessi, se
modificati.

Qui axe-core viene importato come dipendenza npm e iniettato nella pagina senza
alterazioni. Le integrazioni — traduzione italiana delle osservazioni, mappatura
delle regole sui criteri WCAG, arricchimento dei nodi con la firma del
componente — vivono in file di questo progetto e non ricadono nell'obbligo.

Se in futuro servisse alterare il comportamento di una regola, la strada
corretta è registrare una regola personalizzata tramite `axe.configure`, non
applicare una patch ai sorgenti. Vedi `docs/decisioni.md`, decisione 10.

**axe DevTools**, il prodotto commerciale di Deque, è cosa distinta e non è usato
in questo progetto: sotto ha lo stesso motore gratuito.
