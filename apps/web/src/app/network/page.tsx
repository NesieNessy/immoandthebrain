"use client";

import { Suspense } from 'react';
import { NetworkPage } from './NetworkPage';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <NetworkPage />
        </Suspense>
    );
}
