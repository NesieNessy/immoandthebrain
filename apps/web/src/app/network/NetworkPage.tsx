"use client";

import { Header, PAGE_CONTAINER_CLASS, PillOptions } from '@/components/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContractorsTab } from './contractors/ContractorsTab';
import { ForumTab } from './forum/ForumTab';
import { recentPostCount } from './forum/recentPostCount';
import { useForumData } from './forum/useForumData';
import { WegsTab } from './weg/WegsTab';

type NetworkTab = 'wegs' | 'handwerker' | 'forum';

function isNetworkTab(value: string | null): value is NetworkTab {
    return value === 'wegs' || value === 'handwerker' || value === 'forum';
}

export function NetworkPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawTab = searchParams.get('tab');
    const activeTab: NetworkTab = isNetworkTab(rawTab) ? rawTab : 'wegs';

    // Lifted up (not owned by ForumTab) so its post count can drive the
    // "Forum N" pill label without a second, duplicate fetch.
    const forumData = useForumData();
    const recentCount = recentPostCount(forumData.posts);

    const goToTab = (tab: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        router.replace(`/network?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={[{ label: 'Netzwerk' }]} />

                <div className="mt-2 mb-4">
                    <p className="text-sm text-muted-foreground">WEGs, Handwerker und Community-Forum</p>
                </div>

                <PillOptions
                    options={[
                        { value: 'wegs', label: 'WEGs' },
                        { value: 'handwerker', label: 'Handwerker' },
                        // Not an "unread" count (nothing in this app tracks
                        // read/unread) — posts from the last 7 days, an
                        // honest activity proxy instead of a fabricated number.
                        { value: 'forum', label: recentCount > 0 ? `Forum ${recentCount}` : 'Forum' },
                    ]}
                    value={activeTab}
                    onChange={goToTab}
                    size="md"
                />

                <div className="mt-6">
                    {activeTab === 'wegs' && <WegsTab />}
                    {activeTab === 'handwerker' && <ContractorsTab />}
                    {activeTab === 'forum' && <ForumTab data={forumData} />}
                </div>
            </main>
        </div>
    );
}
