'use client'

interface SettingsCheckboxProps {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
}

export const SettingsCheckbox = ({ 
  id, 
  label, 
  description, 
  checked, 
  onChange, 
  disabled = false,
  loading = false
}: SettingsCheckboxProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked)
  }

  return (
    <div className="flex items-start space-x-3">
      <div className="flex items-center h-5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled || loading}
          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
        />
      </div>
      <div className="flex-1">
        <label htmlFor={id} className="font-medium text-gray-700 cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
        )}
      </div>
    </div>
  )
}
