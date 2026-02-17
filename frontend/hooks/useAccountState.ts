'use client'

import { useState, useCallback } from 'react'

export interface AccountState {
  // Contact Information
  contactLoading: boolean
  contactSaving: boolean
  contactMessage: string | null
  contactError: string | null
  
  // Language Settings
  languageSaving: boolean
  languageError: string | null
  
  // Billing Settings
  billingSaving: boolean
  billingError: string | null
  
  // Notification Settings
  notificationSaving: boolean
  notificationError: string | null
  notificationMessage: string | null
  
  // Privacy Settings
  privacySaving: boolean
  privacyError: string | null
  privacyMessage: string | null
  
  // Account Settings
  accountSaving: boolean
  accountError: string | null
  accountMessage: string | null
  
  // Data Management
  dataDeleting: boolean
  dataError: string | null
  dataMessage: string | null
  
  // Form Data
  formData: {
    email: string
    phone: string
    language: string
    timezone: string
    currency: string
    notifications: {
      email: boolean
      sms: boolean
      push: boolean
      marketing: boolean
      updates: boolean
    }
    privacy: {
      profileVisible: boolean
      activityVisible: boolean
      analyticsEnabled: boolean
    }
  }
  
  // Preferences
  preferences: {
    theme: string
    compactMode: boolean
    reducedMotion: boolean
  }
  
  // UI State
  activeTab: string
  isLoading: boolean
  discordId: string | null
}

const INITIAL_STATE: AccountState = {
  contactLoading: false,
  contactSaving: false,
  contactMessage: null,
  contactError: null,
  
  languageSaving: false,
  languageError: null,
  
  billingSaving: false,
  billingError: null,
  
  notificationSaving: false,
  notificationError: null,
  notificationMessage: null,
  
  privacySaving: false,
  privacyError: null,
  privacyMessage: null,
  
  accountSaving: false,
  accountError: null,
  accountMessage: null,
  
  dataDeleting: false,
  dataError: null,
  dataMessage: null,
  
  formData: {
    email: '',
    phone: '',
    language: 'en',
    timezone: 'UTC',
    currency: 'USD',
    notifications: {
      email: true,
      sms: false,
      push: true,
      marketing: false,
      updates: true
    },
    privacy: {
      profileVisible: true,
      activityVisible: true,
      analyticsEnabled: false
    }
  },
  
  preferences: {
    theme: 'light',
    compactMode: false,
    reducedMotion: false
  },
  
  activeTab: 'profile',
  isLoading: false,
  discordId: null
}

export const useAccountState = () => {
  const [state, setState] = useState<AccountState>(INITIAL_STATE)

  const setLoadingState = useCallback((key: keyof AccountState, loading: boolean) => {
    setState(prev => ({ ...prev, [key]: loading }))
  }, [])

  const setErrorState = useCallback((key: keyof AccountState, error: string | null) => {
    setState(prev => ({ ...prev, [key]: error }))
  }, [])

  const setMessageState = useCallback((key: keyof AccountState, message: string | null) => {
    setState(prev => ({ ...prev, [key]: message }))
  }, [])

  const updateFormData = useCallback((updates: Partial<AccountState['formData']>) => {
    setState(prev => ({
      ...prev,
      formData: { ...prev.formData, ...updates }
    }))
  }, [])

  const updatePreferences = useCallback((updates: Partial<AccountState['preferences']>) => {
    setState(prev => ({
      ...prev,
      preferences: { ...prev.preferences, ...updates }
    }))
  }, [])

  const updateNotifications = useCallback((updates: Partial<AccountState['formData']['notifications']>) => {
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        notifications: { ...prev.formData.notifications, ...updates }
      }
    }))
  }, [])

  const updatePrivacy = useCallback((updates: Partial<AccountState['formData']['privacy']>) => {
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        privacy: { ...prev.formData.privacy, ...updates }
      }
    }))
  }, [])

  const setActiveTab = useCallback((tab: string) => {
    setState(prev => ({ ...prev, activeTab: tab }))
  }, [])

  const setDiscordId = useCallback((discordId: string | null) => {
    setState(prev => ({ ...prev, discordId }))
  }, [])

  const resetSection = useCallback((section: string) => {
    setState(prev => ({
      ...prev,
      [`${section}Saving`]: false,
      [`${section}Error`]: null,
      [`${section}Message`]: null
    }))
  }, [])

  const resetAll = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    setLoadingState,
    setErrorState,
    setMessageState,
    updateFormData,
    updatePreferences,
    updateNotifications,
    updatePrivacy,
    setActiveTab,
    setDiscordId,
    resetSection,
    resetAll
  }
}
