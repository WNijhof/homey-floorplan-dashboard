'use strict';

// Endpoints for the settings page in the Homey app, and for sister apps (dashboard-link).
module.exports = {

  async getSettingsInfo({ homey }) {
    return homey.app.getSettingsInfo();
  },

  async setConfig({ homey, body }) {
    return homey.app.setConfig(body);
  },

  async getDashboardLink({ homey }) {
    return homey.app.getDashboardLink();
  },

  async getData({ homey }) {
    return homey.app.getData();
  },

  async getPlans({ homey }) {
    return homey.app.plans.list();
  },

  async savePlan({ homey, params, body }) {
    return homey.app.plans.save(params.id, body);
  },

  async deletePlan({ homey, params }) {
    return homey.app.plans.remove(params.id);
  },

  async setCapability({ homey, body }) {
    return homey.app.setCapability(body);
  },

  async getCalendars({ homey }) {
    return homey.app.getCalendars();
  },

  async setCalendars({ homey, body }) {
    return homey.app.setCalendars(body);
  },

  async getAgenda({ homey }) {
    return homey.app.getAgenda();
  },

  async getDiagnosisReport({ homey, query }) {
    return homey.app.getDiagnosisReport({ plan: !!query && query.plan === '1' });
  },

};
