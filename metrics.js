'use strict';

var _          = require('lodash-node');
var WebSocket  = require('ws');
var bunyan     = require('bunyan');
var onFinished = require('on-finished');

var instance, log;

function Metrics(client, options) {
  var self = this;

  this.client = client;

  // defaults
  this.gatewayUrl = 'ws://localhost:8081';
  this.debug      = false;

  _.assign(this, options);

  // Create Bunyan logger
  self.log = log = bunyan.createLogger({
    name        : 'cerberus.metrics',
    level       : self.debug ? bunyan.DEBUG : bunyan.INFO,
    serializers : bunyan.stdSerializers
  });

  self.connect();
}

/**
 * Connect to Metrics endpoint
 */
Metrics.prototype.connect = function() {

  var self = this;

  // Create websocket connection to Cerberus
  var ws = this.ws = new WebSocket(this.gatewayUrl);

  // Error handler
  ws.on('error', self.onError);

  if (!ws)
    log.warn('No WebSocket connection initialized');

  ws.on('open', function() {
    log.debug('Successfully connected');
  });

  ws.on('message', this.parseMessage);
};

/**
 * Parse message from WS connection
 */
Metrics.prototype.parseMessage = function(data, flags) {
  data = JSON.parse(data);

  if (data.type === 'WELCOME') {
    log.debug('Successfully authenticated');
  }

};

/**
 * /!\ Don't throw an error when something goes wrong!
 * We still want the API to work even if it's not aggregating data
 */
Metrics.prototype.onError = function(err) {
  log.error(err);
};

/**
 * Calculates hrtime difference between then and now
 * Both in nanoseconds and milliseconds
 */
Metrics.prototype.responseTime = function(hrtime) {

  var diff = process.hrtime(hrtime);

  var ns   = diff[0] * 1e9 + diff[1];
  var ms   = diff[0] * 1e3 + diff[1] * 1e-6;

  return {
    ns: ns,
    ms: ms.toFixed(3)
  };

};

/**
 * Metrics middleware request handler
 */
Metrics.prototype.handler = function(req, res, next) {
  var self = this;

  var metrics = self.parseRequest(req);

  // If we're not using Morgan, add the timings ourself
  if (!req.hasOwnProperty('_startAt'))
    req._startAt = process.hrtime();

  // Wait for Express to send the response back to the client
  onFinished(res, function(err, res) {

    if (err)
      return self.onError(err);

    // add response data to metrics payload
    metrics = _.assign(metrics, self.parseResponse(res));

    self.sendMetrics(metrics);
  });

  next();
};

/**
 * Capture incoming request data metrics
 */
Metrics.prototype.parseRequest = function(req) {

  var self = instance;

  if (!self.hostname)
    self.hostname = req.hostname;

  var delay = instance.responseTime(req._startAt);

  return {
    '_meta' : {
      'host' : self.hostname
    },
    'req': {
      'delay' : delay,
      'href'  : req.protocol + '://' + self.hostname + req.path,
      'path'  : req.path,
    }
  };

};

/**
 * Capture response data metrics
 */
Metrics.prototype.parseResponse = function(res) {

  var delay = instance.responseTime(res.req._startAt);

  return {
    'res': {
      'contentLength' : res._headers['content-length'],
      'delay'         : delay,
      'statusCode'    : res.statusCode,
    }
  };

};

/**
 * Send metrics over WS to the gateway
 */
Metrics.prototype.sendMetrics = function(metrics) {

  log.debug('response code was %s', metrics.res.statusCode);

  if (metrics.res.contentLength)
    log.debug('Payload size was %s bytes', metrics.res.contentLength);

  log.debug('delay: %d%s', metrics.res.delay.ms, 'ms');
  log.debug('Will report %j to %s', metrics, metrics.req.path);

};

module.exports = function(client, opts) {
  instance = new Metrics(client, opts);
  return instance;
};