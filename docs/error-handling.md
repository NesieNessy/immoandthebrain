# Fehlerbehandlung

Wie Fehler entstehen, transportiert und angezeigt werden – damit Nutzer:innen
immer eine verständliche, deutsche Meldung sehen und nie Rohdaten wie JSON,
HTML-Fehlerseiten, SQL-Meldungen oder englische Bibliothekstexte.

## Wo wird ein Fehler angezeigt?

| Situation | Anzeige | Baustein |
|---|---|---|
| Ein einzelnes Feld ist ungültig | Direkt unter dem Feld | `error`-Prop von `TextField`, `Dropdown`, … |
| Die Seite konnte ihre Daten nicht laden, oder ein Schritt / Formular konnte nicht gespeichert werden | Oben im Inhalt, über dem Formular | `<ErrorAlert>` (bei Ladefehlern mit `onRetry`) |
| Eine Hintergrund-Aktion ist fehlgeschlagen (Umschalter, Löschen in einer Liste, Upload) | Toast | `showToast(message, 'error')` |
| Die Sitzung ist abgelaufen (jede API-Antwort 401) | Dialog, einmal app-weit | `SessionExpiredDialog` – automatisch, nichts zu tun |

Fehlermeldungen sagen, **was** nicht geklappt hat, und – wenn möglich – **was
man tun kann**: „Kaufkosten konnten nicht gespeichert werden.“, „Bitte einen
Kaufpreis größer als 0 € eingeben.“

## API-Routen (Server)

- Fehler **zurückgeben, nie werfen**: `return apiError(400, 'Bitte …')`
  (`lib/server/apiError.ts`). Next.js macht aus einer *geworfenen* Response
  immer eine 500.
- Einheitliche Form: `{ error: string, …extra }`, z. B. `fieldErrors` für
  Formularfelder. `error` wird bei 4xx-Status **wörtlich angezeigt** – also auf
  Deutsch, als Satz für Nutzer:innen formulieren.
- Passender Status: 400 ungültige Eingabe, 401 nicht angemeldet, 403 nicht
  erlaubt, 404 nicht gefunden (auch: gehört jemand anderem), 409 Konflikt /
  gesperrt. Bei 5xx zeigt der Client nie den Inhalt, sondern eine
  Standardmeldung – technische Details gehören ins Server-Log (`console.error`).
- Jeder Handler beginnt mit

  ```ts
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  ```

  `routeAuthCoverage.test.ts` schlägt fehl, wenn die zweite Zeile fehlt.

## Seiten und Hooks (Client)

```ts
const res = await authFetch('/api/…');
if (!res.ok) throw await readApiError(res);   // ApiError mit anzeigbarer Meldung
…
} catch (err) {
  setError(errorMessage(err, 'Kaufkosten konnten nicht gespeichert werden.'));
}
```

- `readApiError(res)` (`lib/api/apiError.ts`) macht aus jeder Fehlerantwort
  einen `ApiError` mit einer Meldung, die angezeigt werden darf (bei 4xx die
  des Servers, sonst eine deutsche Standardmeldung zum Status) – plus
  `fieldErrors`, falls vorhanden.
- `errorMessage(err, fallback)` wählt für jeden abgefangenen Fehler die
  Anzeige: die Meldung eines `ApiError`, „Keine Verbindung zum Server …“ bei
  Netzwerkfehlern, sonst den `fallback` – interne Fehlertexte werden nie
  angezeigt.
- Eine Regel, die der Client selbst prüft und deren Meldung für Nutzer:innen
  gedacht ist, als `throw new UserFacingError('Der Mietzeitraum überschneidet
  sich …')` werfen – `errorMessage` zeigt sie unverändert. Ein normales
  `new Error('…')` gilt als intern und wird durch den `fallback` ersetzt.
- Fehler von Supabase Auth (Anmeldung, Registrierung, Passwort, 2FA) mit
  `authErrorMessage(error, fallback)` (`lib/auth/authErrorMessage.ts`)
  übersetzen – die Texte der Bibliothek sind englisch.
- Nie `throw new Error(await res.text())` und nie `err.message` ungeprüft
  anzeigen.
- Jede Aktion, die fehlschlagen kann, braucht ein `catch` mit sichtbarer
  Meldung – ein `try`/`finally` ohne `catch` lässt Fehler stumm verschwinden.
- `authFetch` löst bei jeder 401 den Sitzung-abgelaufen-Dialog aus. Die Seite
  zeigt trotzdem ihren eigenen Fehler für die gescheiterte Aktion.
