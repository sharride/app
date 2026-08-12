import React from 'react';

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = 'w-full', height = 'h-4', className = '' }) => {
  return (
    <div className={`animate-pulse ${width} ${height} bg-gray-200/60 rounded-md ${className}`} />
  );
};

export const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <Skeleton width="w-32" height="h-4" />
      <Skeleton width="w-16" height="h-4" />
    </div>
    <div className="mb-2">
      <Skeleton width="w-full" height="h-3" className="mb-2" />
      <Skeleton width="w-3/4" height="h-3" />
    </div>
    <div className="flex justify-between">
      <Skeleton width="w-24" height="h-3" />
      <Skeleton width="w-20" height="h-3" />
    </div>
  </div>
);
