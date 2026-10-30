'use strict';

module.exports = {

  // The requested plan plus a snapshot of all devices, so the widget can render immediately
  // and then apply realtime `caps` events on top. Also the link to the full-screen web page.
  async getPlan({ homey, query }) {
    return homey.app.getPlanWithDevices(query.id);
  },

  async getWeather({ homey }) {
    return homey.app.getWeather();
  },

  async getEnergy({ homey }) {
    return homey.app.getEnergy();
  },

  async getEnergyDetail({ homey, query }) {
    if (!/^(solar|battery|grid|car|heatpump|airco)$/.test(query.kind || '')) throw new Error('Unknown part');
    return homey.app.getEnergyDetail(query.kind, query.plan);
  },

  async getAgenda({ homey }) {
    return homey.app.getAgenda();
  },

  async setCapability({ homey, body }) {
    return homey.app.setCapability(body);
  },

};
