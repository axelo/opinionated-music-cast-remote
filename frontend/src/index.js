function detectAppInFront(inactivityTimeoutSec, cb) {
  var lastFired = Date.now();

  setInterval(function() {
    var now = Date.now();

    if (now - lastFired >= inactivityTimeoutSec * 1000) {
      cb();
    }

    lastFired = now;
  }, 1000);
}

function connectToEventSource(receiverEventPort, reconnectTimeout) {
  var eventSource;
  var reconnectTimeoutId;

  function clearReconnectTimeout() {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = undefined;
    }
  }

  function parseMessageData(data) {
    try {
      return JSON.parse(data);
    } catch (err) {
      return { tag: 'invaliddata', data: data };
    }
  }

  function tryToConnect() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('api/events');

    eventSource.onopen = function() {
      clearReconnectTimeout();
    };

    eventSource.onerror = function() {
      clearReconnectTimeout();

      receiverEventPort.send({ tag: 'disconnected' });

      eventSource.close();

      reconnectTimeoutId = setTimeout(tryToConnect, reconnectTimeout);
    };

    eventSource.onmessage = function(evt) {
      receiverEventPort.send(parseMessageData(evt.data));
    };
  }

  tryToConnect();

  detectAppInFront(30, tryToConnect);
}

var app = Elm.Main.init({ flags: 1 });
var receiverEventPort = app.ports.receiverEvent;

if (!receiverEventPort) {
  throw new Error('Missing port "receiverEvent"');
}

// Delay connection to prevent seeing loading wheel forever on iOS
setTimeout(function() {
  connectToEventSource(receiverEventPort, 5 * 1000, 60 * 1000);
}, 0);

document.addEventListener('touchend', function(event) {
  event.preventDefault();
});
