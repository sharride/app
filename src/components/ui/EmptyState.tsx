import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action }) => {
  return (
    <div className="empty">
      <div>{icon}</div>
      <p className="text-sm font-bold">{title}</p>
      {description && <p className="text-xs text-gray-600">{description}</p>}
      {action && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
};
