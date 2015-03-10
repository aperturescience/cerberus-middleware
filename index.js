'use strict';

var Metrics = require('./metrics');

function Astromo() {}

Astromo.prototype.Metrics = function(opts) {
  var self = this;

  self._metrics = new Metrics(self, opts);

  // We're setting the context of the Metrics object to itself
  // inside of the express middleware closure
  return function(req, res, next) {
    return self._metrics.handler.apply(self._metrics, arguments);
  };

};

var astromo = new Astromo();

module.exports = astromo;
