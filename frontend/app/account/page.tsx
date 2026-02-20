'use client'

import { useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import {
  User,
  Lock,
  Shield,
  Bell,
  CreditCard,
} from "lucide-react"
import { useAccountState } from "@/hooks/useAccountState"
import { useAccountApi } from "@/hooks/useAccountApi"
import { SettingsCard, SettingsInput, SettingsCheckbox, SettingsButton } from "@/components/settings"

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
]

export default function AccountPage() {
  const router = useRouter()
  const { state, setLoadingState, setErrorState, setMessageState, updateFormData, updatePreferences, setActiveTab, setDiscordId } = useAccountState()
  const api = useAccountApi()

  // Load user data on mount
  useEffect(() => {
    const loadUserData = async () => {
      const discordId = '123456789' // This should come from your auth context
      if (!discordId) return

      setDiscordId(discordId)
      setLoadingState('isLoading', true)
      
      try {
        const [contactData, preferencesData, notificationData, privacyData] = await Promise.all([
          api.fetchContactInfo(discordId),
          api.fetchPreferences(discordId),
          api.fetchNotifications(discordId),
          api.fetchPrivacySettings(discordId)
        ])

        updateFormData({
          email: contactData.email || '',
          phone: contactData.phone || '',
          language: preferencesData.language ?? 'en',
          timezone: preferencesData.timezone ?? 'UTC',
          currency: preferencesData.currency ?? 'USD'
        })
        
        updatePreferences({
          theme: preferencesData.theme ?? state.preferences.theme,
          compactMode: preferencesData.compactMode ?? state.preferences.compactMode,
          reducedMotion: preferencesData.reducedMotion ?? state.preferences.reducedMotion
        })
        
        if (notificationData) {
          updateFormData({ notifications: notificationData })
        }
        
        if (privacyData) {
          updateFormData({ privacy: privacyData })
        }
      } catch (error) {
        console.error('Failed to load user data:', error)
        setErrorState('contactError', 'Failed to load user data')
      } finally {
        setLoadingState('isLoading', false)
      }
    }

    loadUserData()
  }, [api, setDiscordId, setLoadingState, setErrorState, updateFormData, updatePreferences, state.preferences.theme, state.preferences.compactMode, state.preferences.reducedMotion])

  const handleContactSave = useCallback(async () => {
    if (!state.discordId) return
    
    setLoadingState('contactSaving', true)
    setErrorState('contactError', null)
    
    try {
      await api.updateContactInfo(state.discordId, {
        email: state.formData.email,
        phone: state.formData.phone
      })
      setMessageState('contactMessage', 'Contact information updated successfully')
    } catch (error) {
      setErrorState('contactError', 'Failed to update contact information')
    } finally {
      setLoadingState('contactSaving', false)
    }
  }, [state.discordId, state.formData.email, state.formData.phone, api, setLoadingState, setErrorState, setMessageState])

  const handleNotificationSave = useCallback(async () => {
    if (!state.discordId) return
    
    setLoadingState('notificationSaving', true)
    setErrorState('notificationError', null)
    
    try {
      await api.updateNotifications(state.discordId, state.formData.notifications)
      setMessageState('notificationMessage', 'Notification settings updated successfully')
    } catch (error) {
      setErrorState('notificationError', 'Failed to update notification settings')
    } finally {
      setLoadingState('notificationSaving', false)
    }
  }, [state.discordId, state.formData.notifications, api, setLoadingState, setErrorState, setMessageState])

  const handlePrivacySave = useCallback(async () => {
    if (!state.discordId) return
    
    setLoadingState('privacySaving', true)
    setErrorState('privacyError', null)
    
    try {
      await api.updatePrivacySettings(state.discordId, state.formData.privacy)
      setMessageState('privacyMessage', 'Privacy settings updated successfully')
    } catch (error) {
      setErrorState('privacyError', 'Failed to update privacy settings')
    } finally {
      setLoadingState('privacySaving', false)
    }
  }, [state.discordId, state.formData.privacy, api, setLoadingState, setErrorState, setMessageState])

  const handleDeleteAccount = useCallback(async () => {
    if (!state.discordId) return
    
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }
    
    setLoadingState('dataDeleting', true)
    setErrorState('dataError', null)
    
    try {
      await api.deleteAccount(state.discordId)
      router.push('/')
    } catch (error) {
      setErrorState('dataError', 'Failed to delete account')
    } finally {
      setLoadingState('dataDeleting', false)
    }
  }, [state.discordId, api, setLoadingState, setErrorState, router])

  const handleExportData = useCallback(async () => {
    if (!state.discordId) return
    
    setLoadingState('dataDeleting', true)
    setErrorState('dataError', null)
    
    try {
      const data = await api.exportData(state.discordId)
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `account-data-${state.discordId}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessageState('dataMessage', 'Data exported successfully')
    } catch (error) {
      setErrorState('dataError', 'Failed to export data')
    } finally {
      setLoadingState('dataDeleting', false)
    }
  }, [state.discordId, api, setLoadingState, setErrorState, setMessageState])

  const renderProfileTab = () => (
    <div className="space-y-6">
      <SettingsCard title="Contact Information" description="Update your contact details">
        <SettingsInput
          id="email"
          label="Email Address"
          type="email"
          value={state.formData.email}
          onChange={(value) => updateFormData({ email: value })}
          error={state.contactError}
          disabled={state.contactLoading}
        />
        <SettingsInput
          id="phone"
          label="Phone Number"
          type="tel"
          value={state.formData.phone}
          onChange={(value) => updateFormData({ phone: value })}
          disabled={state.contactLoading}
        />
        <div className="flex justify-end">
          <SettingsButton 
            onClick={handleContactSave}
            loading={state.contactSaving}
            disabled={state.contactLoading}
          >
            Save Contact Info
          </SettingsButton>
        </div>
      </SettingsCard>

      <SettingsCard title="Preferences" description="Customize your experience">
        <SettingsInput
          id="language"
          label="Language"
          value={state.formData.language}
          onChange={(value) => updateFormData({ language: value })}
          disabled={state.languageSaving}
        />
        <SettingsInput
          id="timezone"
          label="Timezone"
          value={state.formData.timezone}
          onChange={(value) => updateFormData({ timezone: value })}
          disabled={state.languageSaving}
        />
        <div className="flex justify-end">
          <SettingsButton 
            onClick={() => {/* Add preferences save logic */}}
            loading={state.languageSaving}
          >
            Save Preferences
          </SettingsButton>
        </div>
      </SettingsCard>
    </div>
  )

  const renderNotificationsTab = () => (
    <SettingsCard 
      title="Notification Preferences" 
      description="Choose how you want to be notified"
      footer={
        <div className="flex justify-end">
          <SettingsButton 
            onClick={handleNotificationSave}
            loading={state.notificationSaving}
          >
            Save Notification Settings
          </SettingsButton>
        </div>
      }
    >
      <SettingsCheckbox
        id="email-notifications"
        label="Email Notifications"
        description="Receive notifications via email"
        checked={state.formData.notifications.email}
        onChange={(checked) => updateFormData({ 
          notifications: { ...state.formData.notifications, email: checked }
        })}
      />
      <SettingsCheckbox
        id="sms-notifications"
        label="SMS Notifications"
        description="Receive notifications via text message"
        checked={state.formData.notifications.sms}
        onChange={(checked) => updateFormData({ 
          notifications: { ...state.formData.notifications, sms: checked }
        })}
      />
      <SettingsCheckbox
        id="push-notifications"
        label="Push Notifications"
        description="Receive browser push notifications"
        checked={state.formData.notifications.push}
        onChange={(checked) => updateFormData({ 
          notifications: { ...state.formData.notifications, push: checked }
        })}
      />
      <SettingsCheckbox
        id="marketing-notifications"
        label="Marketing Emails"
        description="Receive promotional emails"
        checked={state.formData.notifications.marketing}
        onChange={(checked) => updateFormData({ 
          notifications: { ...state.formData.notifications, marketing: checked }
        })}
      />
      <SettingsCheckbox
        id="update-notifications"
        label="Product Updates"
        description="Receive updates about new features"
        checked={state.formData.notifications.updates}
        onChange={(checked) => updateFormData({ 
          notifications: { ...state.formData.notifications, updates: checked }
        })}
      />
    </SettingsCard>
  )

  const renderPrivacyTab = () => (
    <SettingsCard 
      title="Privacy Settings" 
      description="Control your privacy preferences"
      footer={
        <div className="flex justify-end">
          <SettingsButton 
            onClick={handlePrivacySave}
            loading={state.privacySaving}
          >
            Save Privacy Settings
          </SettingsButton>
        </div>
      }
    >
      <SettingsCheckbox
        id="profile-visible"
        label="Profile Visible"
        description="Make your profile visible to other users"
        checked={state.formData.privacy.profileVisible}
        onChange={(checked) => updateFormData({ 
          privacy: { ...state.formData.privacy, profileVisible: checked }
        })}
      />
      <SettingsCheckbox
        id="activity-visible"
        label="Activity Visible"
        description="Show your recent activity"
        checked={state.formData.privacy.activityVisible}
        onChange={(checked) => updateFormData({ 
          privacy: { ...state.formData.privacy, activityVisible: checked }
        })}
      />
      <SettingsCheckbox
        id="analytics-enabled"
        label="Analytics Enabled"
        description="Allow usage analytics collection"
        checked={state.formData.privacy.analyticsEnabled}
        onChange={(checked) => updateFormData({ 
          privacy: { ...state.formData.privacy, analyticsEnabled: checked }
        })}
      />
    </SettingsCard>
  )

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <SettingsCard title="Security Settings" description="Manage your account security">
        <SettingsCheckbox
          id="two-factor"
          label="Two-Factor Authentication"
          description="Add an extra layer of security to your account"
          checked={false} // This would come from your auth context
          onChange={() => {/* Add 2FA toggle logic */}}
        />
        <SettingsCheckbox
          id="login-alerts"
          label="Login Alerts"
          description="Get notified when someone logs into your account"
          checked={true}
          onChange={() => {/* Add login alerts toggle logic */}}
        />
      </SettingsCard>

      <SettingsCard title="Data Management" description="Export or delete your account data">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Export Data</h4>
            <p className="text-sm text-gray-500">Download a copy of your account data</p>
            <div className="mt-2">
              <SettingsButton 
                onClick={handleExportData}
                loading={state.dataDeleting}
                variant="secondary"
              >
                Export Data
              </SettingsButton>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900">Delete Account</h4>
            <p className="text-sm text-gray-500">Permanently delete your account and all associated data</p>
            <div className="mt-2">
              <SettingsButton 
                onClick={handleDeleteAccount}
                loading={state.dataDeleting}
                variant="danger"
              >
                Delete Account
              </SettingsButton>
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )

  const renderBillingTab = () => (
    <SettingsCard title="Billing Information" description="Manage your subscription and payment methods">
      <div className="text-center py-8">
        <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No billing information</h3>
        <p className="mt-1 text-sm text-gray-500">Billing features are coming soon.</p>
      </div>
    </SettingsCard>
  )

  const renderTabContent = () => {
    switch (state.activeTab) {
      case 'profile':
        return renderProfileTab()
      case 'notifications':
        return renderNotificationsTab()
      case 'privacy':
        return renderPrivacyTab()
      case 'security':
        return renderSecurityTab()
      case 'billing':
        return renderBillingTab()
      default:
        return renderProfileTab()
    }
  }

  if (state.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your account preferences and settings</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:w-64 flex-shrink-0">
            <nav className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md w-full text-left ${
                      state.activeTab === tab.id
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {renderTabContent()}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
