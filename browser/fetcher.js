'use strict';

var xhr = require('./xhr');
var state = require('./state');
var router = require('./router');
var emitter = require('./emitter');
var deferral = require('./deferral');
var interceptor = require('./interceptor');
var componentCache = require('./componentCache');
var lastXhr = {};

function e (value) {
  return value || '';
}

function negotiate (route, context) {
  var parts = route.parts;
  var qs = e(parts.search);
  var p = qs ? '&' : '?';
  var demands = ['json'].concat(deferral.needs(route.action));
  if (context.hijacker && context.hijacker !== route.action) {
    demands.push('hijacker=' + context.hijacker);
  }
  return parts.pathname + qs + p + demands.join('&');
}

function abort (source) {
  if (lastXhr[source]) {
    lastXhr[source].abort();
  }
}

function abortPending () {
  Object.keys(lastXhr).forEach(abort);
  lastXhr = {};
}

function fetcher (route, context, done) {
  var url = route.url;
  if (lastXhr[context.source]) {
    lastXhr[context.source].abort();
    lastXhr[context.source] = null;
  }

  global.DEBUG && global.DEBUG('[fetcher] requested %s', route.url);

  interceptor.execute(route, afterInterceptors);

  function afterInterceptors (err, result) {
    if (!err && result.defaultPrevented) {
      global.DEBUG && global.DEBUG('[fetcher] prevented %s with model', route.url, result.model);
      done(null, result.model);
    } else {
      emitter.emit('fetch.start', route, context);
      lastXhr[context.source] = xhr(negotiate(route, context), notify);
    }
  }

  function notify (err, data, res) {
    if (err) {
      global.DEBUG && global.DEBUG('[fetcher] failed for %s', route.url);
      if (err.message === 'aborted') {
        emitter.emit('fetch.abort', route, context);
      } else {
        emitter.emit('fetch.error', route, context, err);
      }
    } else {
      global.DEBUG && global.DEBUG('[fetcher] succeeded for %s', route.url);
      if (data && data.version) {
        state.version = data.version; // sync version expectation with server-side
        componentCache.set(router(res.url).parts.query.hijacker || route.action, data);
      }
      emitter.emit('fetch.done', route, context, data);
    }
    done(err, data);
  }
}

fetcher.abortPending = abortPending;

module.exports = fetcher;
