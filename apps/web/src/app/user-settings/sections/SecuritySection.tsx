"use client";

import { Button, Icons, SectionLabel, Tag, TextField, Tile, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase/client.supabase';
import { useEffect, useState } from 'react';

function detectSessionLabel(): string {
    if (typeof navigator === 'undefined') return 'Aktuelle Sitzung';
    const ua = navigator.userAgent;
    const browser = ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Safari/') ? 'Safari' : 'Browser';
    const os = ua.includes('Windows') ? 'Windows' : ua.includes('Mac OS X') ? 'macOS' : ua.includes('Android') ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Unbekanntes Gerät';
    return `${browser} · ${os}`;
}

type MfaStatus = 'loading' | 'inactive' | 'active';

export function SecuritySection() {
    const { showToast } = useToast();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const [mfaStatus, setMfaStatus] = useState<MfaStatus>('loading');
    const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
    const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [isMfaBusy, setIsMfaBusy] = useState(false);

    const loadFactors = async () => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) {
            setMfaStatus('inactive');
            return;
        }
        const verified = data.totp.find((factor) => factor.status === 'verified');
        setTotpFactorId(verified?.id ?? null);
        setMfaStatus(verified ? 'active' : 'inactive');
    };

    useEffect(() => { void loadFactors(); }, []);

    const handleChangePassword = async () => {
        if (newPassword.length < 8) {
            showToast('Das Passwort muss mindestens 8 Zeichen lang sein.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Die Passwörter stimmen nicht überein.', 'error');
            return;
        }
        setIsChangingPassword(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setIsChangingPassword(false);
        if (error) {
            showToast(error.message, 'error');
            return;
        }
        setNewPassword('');
        setConfirmPassword('');
        showToast('Passwort geändert.', 'success');
    };

    const startEnrollment = async () => {
        setIsMfaBusy(true);
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        setIsMfaBusy(false);
        if (error || !data) {
            showToast(error?.message ?? 'Authenticator-App konnte nicht eingerichtet werden.', 'error');
            return;
        }
        setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    };

    const confirmEnrollment = async () => {
        if (!enrollment || verifyCode.trim().length === 0) return;
        setIsMfaBusy(true);
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
        if (challengeError || !challenge) {
            setIsMfaBusy(false);
            showToast(challengeError?.message ?? 'Bestätigung fehlgeschlagen.', 'error');
            return;
        }
        const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrollment.factorId, challengeId: challenge.id, code: verifyCode.trim() });
        setIsMfaBusy(false);
        if (verifyError) {
            showToast(verifyError.message, 'error');
            return;
        }
        setEnrollment(null);
        setVerifyCode('');
        showToast('Authenticator-App aktiviert.', 'success');
        void loadFactors();
    };

    const cancelEnrollment = async () => {
        if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
        setEnrollment(null);
        setVerifyCode('');
    };

    const handleDeactivateMfa = async () => {
        if (!totpFactorId) return;
        setIsMfaBusy(true);
        const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactorId });
        setIsMfaBusy(false);
        if (error) {
            showToast(error.message, 'error');
            return;
        }
        showToast('Authenticator-App deaktiviert.', 'success');
        void loadFactors();
    };

    return (
        <Tile title="Sicherheit" description="Verwalten Sie Ihr Passwort und schützen Sie Ihr Konto mit zusätzlichen Sicherheitsmaßnahmen.">
            <SectionLabel>Passwort</SectionLabel>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                    label="Neues Passwort"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    icon={<Icons.Lock className="w-4 h-4" />}
                    endElement={
                        <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'} className="text-muted-foreground hover:text-foreground cursor-pointer">
                            {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                        </button>
                    }
                />
                <TextField
                    label="Passwort bestätigen"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    icon={<Icons.Lock className="w-4 h-4" />}
                />
            </div>
            <div className="mt-3 flex justify-end">
                <Button
                    label={isChangingPassword ? 'Wird geändert…' : 'Passwort ändern'}
                    icon={isChangingPassword ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.KeyRound className="w-4 h-4" />}
                    variant="primary"
                    disabled={isChangingPassword || !newPassword || !confirmPassword}
                    onClick={() => void handleChangePassword()}
                />
            </div>

            <SectionLabel>Zwei-Faktor-Authentifizierung</SectionLabel>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                <div className="flex items-center justify-between gap-4 p-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">Authenticator-App</p>
                        <p className="text-xs text-muted-foreground">Zeit-basierte Einmalpasswörter (TOTP) via Google Authenticator o.ä.</p>
                    </div>
                    {mfaStatus === 'loading' ? (
                        <Icons.Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    ) : mfaStatus === 'active' ? (
                        <Button label="Deaktivieren" variant="outline" size="sm" disabled={isMfaBusy} onClick={() => void handleDeactivateMfa()} />
                    ) : (
                        <Button label="Aktivieren" variant="outline" size="sm" disabled={isMfaBusy} onClick={() => void startEnrollment()} />
                    )}
                </div>

                {enrollment && (
                    <div className="p-4 bg-muted/20 space-y-3">
                        <p className="text-sm text-foreground">Scannen Sie den QR-Code mit Ihrer Authenticator-App und geben Sie den 6-stelligen Code ein.</p>
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <img src={enrollment.qrCode} alt="QR-Code für die Authenticator-App" className="w-32 h-32 border border-border rounded-lg bg-white" />
                            <div className="flex-1 w-full space-y-2">
                                <p className="text-xs text-muted-foreground">Manueller Code: <span className="font-mono">{enrollment.secret}</span></p>
                                <TextField label="Bestätigungscode" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="123456" maxLength={6} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button label="Abbrechen" variant="outline" size="sm" disabled={isMfaBusy} onClick={() => void cancelEnrollment()} />
                            <Button label="Bestätigen" variant="primary" size="sm" disabled={isMfaBusy || verifyCode.trim().length === 0} onClick={() => void confirmEnrollment()} />
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-4 p-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">SMS-Bestätigung</p>
                        <p className="text-xs text-muted-foreground">Code per SMS an Ihre Telefonnummer</p>
                    </div>
                    <Tag label="Nicht aktiv" variant="muted" size="sm" />
                </div>
            </div>

            <SectionLabel>Aktive Sitzungen</SectionLabel>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                <div className="flex items-center justify-between gap-4 p-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">{detectSessionLabel()} (diese Sitzung)</p>
                        <p className="text-xs text-muted-foreground">Zuletzt aktiv: jetzt</p>
                    </div>
                    <Tag label="Aktiv" variant="success" size="sm" />
                </div>
                {/* Supabase's client SDK can't enumerate other devices' sessions —
                    shown as a static, non-interactive placeholder rather than
                    fabricating live data for a device that isn't actually tracked. */}
                <div className="flex items-center justify-between gap-4 p-4 opacity-60">
                    <div>
                        <p className="text-sm font-medium text-foreground">Weitere Sitzungen</p>
                        <p className="text-xs text-muted-foreground">Geräteübersicht noch nicht verfügbar</p>
                    </div>
                    <Button label="Abmelden" variant="outline" size="sm" disabled />
                </div>
            </div>
        </Tile>
    );
}
