import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, NETWORK_ERROR_MESSAGE, readApiError, SESSION_EXPIRED_MESSAGE, UserFacingError } from './apiError';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('readApiError', () => {
  it('shows the API’s own message for a client error (4xx)', async () => {
    const error = await readApiError(json(400, { error: 'Bitte einen Kaufpreis größer als 0 € eingeben.' }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Bitte einen Kaufpreis größer als 0 € eingeben.');
  });

  it('keeps per-field messages for forms', async () => {
    const error = await readApiError(json(400, { error: 'x', fieldErrors: { city: 'Ort ist ein Pflichtfeld.' } }));
    expect(error.fieldErrors).toEqual({ city: 'Ort ist ein Pflichtfeld.' });
  });

  it('always uses the session message for a 401, whatever the body says', async () => {
    expect((await readApiError(json(401, { error: 'Unauthorized' }))).message).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it('never shows the body of a server error (5xx)', async () => {
    const error = await readApiError(json(500, { error: 'duplicate key value violates unique constraint "x"' }));
    expect(error.message).not.toContain('duplicate key');
    expect(error.message).toMatch(/Server/);
  });

  it('falls back to a message for the status when the body is not JSON (HTML error page, empty)', async () => {
    const html = new Response('<!DOCTYPE html><h1>404</h1>', { status: 404 });
    expect((await readApiError(html)).message).toMatch(/nicht gefunden/);
    expect((await readApiError(new Response(null, { status: 409 }))).message).toMatch(/geändert oder ist gesperrt/);
    expect((await readApiError(new Response(null, { status: 418 }))).message).toMatch(/fehlgeschlagen/);
  });

  it('leaves the response body readable for the caller', async () => {
    const response = json(400, { error: 'x' });
    await readApiError(response);
    await expect(response.json()).resolves.toEqual({ error: 'x' });
  });
});

describe('errorMessage', () => {
  it('shows an ApiError’s message as is', () => {
    expect(errorMessage(new ApiError('Nicht gefunden.', 404), 'fallback')).toBe('Nicht gefunden.');
  });

  it('shows a UserFacingError (a rule the client checked itself) as is', () => {
    const message = 'Der Mietzeitraum überschneidet sich mit „Erika Muster“. Bitte zuerst dessen Zeitraum anpassen.';
    expect(errorMessage(new UserFacingError(message), 'fallback')).toBe(message);
  });

  it('turns a failed fetch (offline) into the connection message', () => {
    expect(errorMessage(new TypeError('Failed to fetch'), 'fallback')).toBe(NETWORK_ERROR_MESSAGE);
    expect(errorMessage(new TypeError('Load failed'), 'fallback')).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('never shows internal error texts — the caller’s fallback describes what failed', () => {
    expect(errorMessage(new Error('createSettlement failed'), 'Abrechnung konnte nicht gespeichert werden.')).toBe(
      'Abrechnung konnte nicht gespeichert werden.',
    );
    expect(errorMessage('boom', 'Fehlgeschlagen.')).toBe('Fehlgeschlagen.');
    expect(errorMessage(new TypeError('x is undefined'), 'Fehlgeschlagen.')).toBe('Fehlgeschlagen.');
  });
});
