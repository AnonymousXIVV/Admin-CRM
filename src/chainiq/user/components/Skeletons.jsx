import React from 'react';

const SkeletonBlock = ({ className }) => <div className={`bg-gray-700 animate-pulse ${className}`}></div>;

export const BalanceCardSkeleton = () => (
    <div className="balance-card-new">
        <div className="balance-card-header">
            <div>
                <SkeletonBlock className="h-4 w-32 mb-2 rounded" />
                <SkeletonBlock className="h-10 w-48 rounded" />
            </div>
            <div className="balance-card-change">
                <SkeletonBlock className="h-6 w-20 rounded" />
            </div>
        </div>
        <div className="balance-breakdown">
            <div className="balance-breakdown-item">
                <div className="breakdown-label">
                    <SkeletonBlock className="h-6 w-6 rounded-full mr-2" />
                    <SkeletonBlock className="h-4 w-24 rounded" />
                </div>
                <SkeletonBlock className="h-6 w-32 rounded" />
            </div>
            <div className="balance-breakdown-item">
                <div className="breakdown-label">
                    <SkeletonBlock className="h-6 w-6 rounded-full mr-2" />
                    <SkeletonBlock className="h-4 w-24 rounded" />
                </div>
                <SkeletonBlock className="h-6 w-32 rounded" />
            </div>
        </div>
        <div className="balance-actions-new">
            <SkeletonBlock className="h-10 w-24 rounded" />
            <SkeletonBlock className="h-10 w-24 rounded" />
        </div>
    </div>
);

export const CardStackSkeleton = () => (
    <div className="cards-section">
        <div className="wallet-card-host">
            <div className="wallet-card-skeleton-stack" style={{ '--card-count': 2 }}>
                <div className="wallet-card-skeleton" style={{ '--stack-index': 0 }} />
                <div className="wallet-card-skeleton wallet-card-skeleton--back" style={{ '--stack-index': 1 }} />
            </div>
        </div>
        <SkeletonBlock className="h-10 w-full rounded" />
    </div>
);

const TableSkeleton = ({ rows = 5, columns = 4 }) => (
    <div className="w-full">
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-700">
            {[...Array(columns)].map((_, i) => <SkeletonBlock key={i} className="h-4 w-24 rounded" />)}
        </div>
        {[...Array(rows)].map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 p-4 border-b border-gray-700">
                {[...Array(columns)].map((_, j) => <SkeletonBlock key={j} className="h-6 w-full rounded" />)}
            </div>
        ))}
    </div>
);

export const CryptoTableSkeleton = () => <TableSkeleton columns={5} />;
export const TransactionTableSkeleton = () => <TableSkeleton columns={5} />;
