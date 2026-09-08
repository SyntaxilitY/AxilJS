/**
 * SettingsController — demonstrates Runtime (tenant + feature flag) semantics.
 */

import { tHttp, tBody, tAuth, tTenant, tTenantIsolated, tFeatureFlag } from '@axiljs/decorator'

export class SettingsController {
  private settings: Record<string, unknown> = { theme: 'light', locale: 'en-US' }

  @tHttp({ method: 'GET', path: '/api/settings' })
  @tAuth({ required: true })
  @tTenant()
  @tTenantIsolated()
  async get() {
    return { data: this.settings }
  }

  @tHttp({ method: 'PUT', path: '/api/settings' })
  @tAuth({ required: true })
  @tTenant()
  @tTenantIsolated()
  @tFeatureFlag('settings-v2')
  @tBody()
  async update(body: Record<string, unknown>) {
    Object.assign(this.settings, body)
    return { success: true }
  }
}