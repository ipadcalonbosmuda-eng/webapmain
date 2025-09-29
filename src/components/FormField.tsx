'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, helperText, className, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-900">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          ref={ref}
          className={cn(
            'w-full h-12 px-4 rounded-md bg-gray-100 text-black border-2 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00FF85] focus:border-[#00FF85] transition-colors placeholder:opacity-100 placeholder:text-gray-900',
            error && 'ring-2 ring-red-400 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-sm text-gray-600 font-medium">{helperText}</p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
