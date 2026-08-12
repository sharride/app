import React from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || `input-${generatedId}`;
    const errorId = `error-${inputId}`;

    return (
      <div className="w-full text-right">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold text-gray-900 mb-1">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={clsx('input', error && 'border-red-500', className)}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600 font-bold">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';