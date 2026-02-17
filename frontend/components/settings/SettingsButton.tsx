'use client'

import { useState, useCallback } from 'react'

interface SettingsButtonProps {
  onClick: () => void | Promise<void>
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  loading?: boolean
  className?: string
}

export const SettingsButton = ({ 
  onClick, 
  children, 
  variant = 'primary',
  disabled = false,
  loading = false,
  className = ''
}: SettingsButtonProps) => {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = useCallback(async () => {
    if (loading || isLoading) return
    
    setIsLoading(true)
    try {
      await onClick()
    } catch (error) {
      console.error('Settings button action failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [onClick, loading, isLoading])

  const getVariantClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500'
      case 'danger':
        return 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
      default:
        return 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
    }
  }

  const isDisabled = disabled || loading || isLoading

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${getVariantClasses()} ${className}`}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Wird verarbeitet...
        </>
      ) : children}
    </button>
  )
}