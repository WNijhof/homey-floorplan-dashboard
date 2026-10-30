'use strict';

const { WebServer } = require('./energy/webserver');

/** Energy Dashboard's web routes without a port of their own: lib/WebServer.js hands them what is under /energy/. */
class EnergyServer extends WebServer {

  async start(port) {
    this.port = port;
    this.status = { running: true, port, message: null };
  }

  async stop() {
    this.status = { running: false, port: null, message: null };
  }

  // HomeDeck's web server has already checked the access code.
  route(req, res) {
    req.url = req.url.replace(/^\/energy/, '') || '/';
    return this.handle(req, res);
  }

}

module.exports = { EnergyServer };
