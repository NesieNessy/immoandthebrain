"use client";

import { Suspense } from 'react';
import { UserSettingsPage } from './UserSettingsPage';

export default function SettingsPage() {
    return (
        <Suspense fallback={null}>
            <UserSettingsPage />
        </Suspense>
    );
}
