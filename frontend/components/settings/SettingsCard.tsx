'use client'

import { ReactNode } from 'react'

interface SettingsCardProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  footer?: ReactNode
}

export const SettingsCard = ({ 
  title, 
  description, 
  children, 
  className = '',
  footer
}: SettingsCardProps) => {
  return (
    <div className={`bg-white shadow rounded-lg ${className}`}>
      <div className="px-4 py-5 sm:p-6">
        <div className="mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-sm text-gray-500">
              {description}
            </p>
          )}
        </div>
        <div className="space-y-4">
          {children}
        </div>
      </div>
      {footer && (
        <div className="bg-gray-50 px-4 py-4 sm:px-6">
          {footer}
        </div>
      )}
    </div>
  )
}