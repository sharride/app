import React from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export const ErrorState: React.FC<ErrorStateProps> = ({ title = 'حدث خطأ', description, action }) => {
  return (
    <div className="text-center py-6">
      <p className="text-sm font-bold text-red-700">{title}</p>
      {description && <p className="text-xs text-red-600 mt-2">{description}</p>}
      {action && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
};
